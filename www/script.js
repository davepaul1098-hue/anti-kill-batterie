(function () {
  'use strict';

  var BG = (window.Capacitor && typeof window.Capacitor.registerPlugin === 'function')
    ? window.Capacitor.registerPlugin('BatteryGuard') : null;

  var STORE = 'antikill_steps_v1';
  var done = {};
  var guardOn = false;

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt) e.textContent = txt;
    return e;
  }

  try { done = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { done = {}; }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(done)); } catch (e) {} }

  function call(method) {
    if (!BG) return Promise.reject(new Error('web'));
    return BG[method]();
  }

  function levelMsg(r) {
    if (!r || !r.opened) {
      return 'Impossible d’ouvrir cet écran. Va dans Paramètres → Applications → Anti-Kill Batterie.';
    }
    if (r.level === 'direct') {
      return 'Écran ouvert ✅ Active l’option pour cette appli puis reviens ici.';
    }
    if (r.level === 'app') {
      return 'Ouvert : ' + r.opened + '. Cherche « Démarrage auto » ou « Gestion des applis » et ajoute cette appli.';
    }
    return 'Réglages ouverts. Cherche « Batterie » ou « Démarrage auto » et choisis « Aucune restriction ».';
  }

  var STEPS = [
    {
      id: 'exempt', icon: '⚡', title: 'Exemption batterie',
      text: 'Autorise l’appli à ignorer l’optimisation de batterie d’Android.',
      method: 'requestIgnoreBattery', btn: 'Ouvrir la demande'
    },
    {
      id: 'auto', icon: '🚀', title: 'Démarrage automatique',
      text: 'Active le démarrage auto pour l’appli (Phone Master / Applis protégées).',
      method: 'openAutoStart', btn: 'Ouvrir le réglage'
    },
    {
      id: 'battery', icon: '🔋', title: 'Batterie : aucune restriction',
      text: 'Dans les réglages de batterie de l’appli, choisis « Aucune restriction ».',
      method: 'openBatterySettings', btn: 'Ouvrir la batterie'
    },
    {
      id: 'lock', icon: '🔒', title: 'Verrouiller dans les Récents',
      text: 'Ouvre l’appli, touche le bouton Récents, puis appuie sur l’icône (ou ⋮) de la carte et choisis « Verrouiller ». C’est souvent le réglage décisif sur Tecno / Infinix / Itel.',
      method: null, btn: null
    },
    {
      id: 'clean', icon: '🧹', title: 'Désactiver le nettoyage auto',
      text: 'Dans Phone Master / Gestionnaire de téléphone, désactive le nettoyage automatique et le gel des applis en arrière-plan.',
      method: 'openBatterySettings', btn: 'Ouvrir Phone Master'
    }
  ];

  function renderSteps() {
    var ol = $('steps');
    ol.innerHTML = '';
    var n = 0;

    STEPS.forEach(function (s, idx) {
      var isDone = !!done[s.id];
      if (isDone) n++;

      var li = el('li', 'step' + (isDone ? ' done' : ''));
      li.appendChild(el('h3', '', s.icon + ' ' + (idx + 1) + '. ' + s.title));
      li.appendChild(el('p', '', s.text));
      var msg = el('p', 'stepmsg', '');
      li.appendChild(msg);

      var actions = el('div', 'actions');

      if (s.method) {
        var b = el('button', 'btn small primary', s.btn);
        b.addEventListener('click', function () {
          call(s.method)
            .then(function (r) { msg.textContent = levelMsg(r); })
            .catch(function () { msg.textContent = 'Disponible seulement dans l’APK installé.'; });
        });
        actions.appendChild(b);
      }

      var d = el('button', 'btn small', isDone ? 'Annuler ↩' : 'Fait ✓');
      d.addEventListener('click', function () {
        done[s.id] = !done[s.id];
        save();
        renderSteps();
      });
      actions.appendChild(d);

      li.appendChild(actions);
      ol.appendChild(li);
    });

    $('barFill').style.width = Math.round(n * 100 / STEPS.length) + '%';
    $('progress').textContent = n + ' / ' + STEPS.length + ' étapes faites';
  }

  function setPill(id, ok, yes, no) {
    var p = $(id);
    p.textContent = ok ? yes : no;
    p.className = 'pill ' + (ok ? 'ok' : 'ko');
  }

  function refresh() {
    if (!BG) {
      $('deviceName').textContent = 'Aperçu navigateur';
      $('androidVer').textContent = '—';
      $('hint').textContent = 'Installe l’APK pour utiliser les fonctions Android.';
      return;
    }
    call('getInfo').then(function (i) {
      $('deviceName').textContent = (i.brand || i.manufacturer || '') + ' ' + (i.model || '');
      $('androidVer').textContent = 'Android ' + i.release + ' (API ' + i.sdk + ')';
      setPill('pillBattery', i.ignoringBattery, 'Exemptée ✅', 'Non exemptée ❌');
      setPill('pillGuard', i.guardRunning, 'Active ✅', 'Inactive ❌');

      guardOn = !!i.guardRunning;
      var bg = $('btnGuard');
      bg.textContent = guardOn ? 'Désactiver la protection' : 'Activer la protection';
      bg.className = 'btn ' + (guardOn ? 'danger' : 'primary');

      var hint = i.transsion
        ? 'Téléphone Tecno / Infinix / Itel détecté.'
        : 'Marque non Transsion : les réglages peuvent avoir d’autres noms.';
      if (i.phoneMaster) hint += ' Phone Master détecté.';
      $('hint').textContent = hint;
    }).catch(function () {});
  }

  $('btnGuard').addEventListener('click', function () {
    var gm = $('guardMsg');
    var method = guardOn ? 'stopGuard' : 'startGuard';
    call(method).then(function (r) {
      if (method === 'startGuard') {
        gm.textContent = r.notifications
          ? 'Protection lancée ✅ Tu dois voir la notification permanente.'
          : 'Protection lancée, mais les notifications sont refusées : autorise-les dans les réglages de l’appli pour plus de fiabilité.';
      } else {
        gm.textContent = 'Protection arrêtée.';
      }
      setTimeout(refresh, 600);
    }).catch(function (e) {
      gm.textContent = (e && e.message === 'web')
        ? 'Disponible seulement dans l’APK installé.'
        : 'Erreur : ' + (e && e.message ? e.message : 'inconnue');
    });
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refresh();
  });
  window.addEventListener('focus', refresh);
  setInterval(refresh, 5000);

  renderSteps();
  refresh();
})();
