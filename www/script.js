(() => {
  'use strict';

  // ---------- Journal de diagnostic ----------
  const LOG = [];
  const log = (m) => { LOG.push(new Date().toLocaleTimeString() + ' ' + m); if (LOG.length > 60) LOG.shift(); };
  window.addEventListener('error', (e) => log('JS : ' + e.message));
  window.addEventListener('unhandledrejection', (e) => log('Promesse : ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  // ---------- État ----------
  const root = document.getElementById('root');
  const toastEl = document.getElementById('toast');
  let info = {};
  let lastKey = '';
  let confirmed = LS.get('ak_confirmed', {});
  let onboarded = LS.get('ak_onboarded', false);
  let obStep = 0;
  let waiting = -1;
  let bridgeOk = false;
  let toastTimer = null;

  function saveConfirmed() { LS.set('ak_confirmed', confirmed); }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4200);
  }

  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k === 'class') e.className = props[k];
        else if (k === 'onclick') e.onclick = props[k];
        else if (k === 'html') e.innerHTML = props[k];
        else e.setAttribute(k, props[k]);
      }
    }
    kids.flat().forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  // ---------- Pont natif ----------
  const nativeObj = () => window.AndroidNative || null;

  function nat(method, arg) {
    const n = nativeObj();
    if (!n || typeof n[method] !== 'function') { log('Pont absent : ' + method); return null; }
    try {
      const raw = (arg === undefined) ? n[method]() : n[method](arg);
      const o = raw ? JSON.parse(raw) : {};
      if (o && o.error) log(method + ' -> ' + o.error);
      return o;
    } catch (e) {
      log('Erreur ' + method + ' : ' + e.message);
      return { error: e.message };
    }
  }

  // ---------- Actions ----------
  function openMsg(r) {
    if (!r || !r.opened) {
      toast('Impossible d’ouvrir cet écran. Va dans Paramètres → Applications → Anti-Kill Batterie.');
      return;
    }
    if (r.level === 'dialog') return;
    if (r.level === 'direct') toast('Écran ouvert ✅ Active l’option pour cette appli, puis reviens ici.');
    else if (r.level === 'app') toast('Ouvert : ' + r.opened + '. Cherche « Démarrage auto » ou « Gestion des applis ».');
    else toast('Réglages ouverts : cherche « Batterie » ou « Démarrage auto », puis « Aucune restriction ».');
  }

  function fixNotif() {
    const asked = LS.get('ak_notif_asked', false);
    if (info.sdk >= 33 && !asked) {
      LS.set('ak_notif_asked', true);
      nat('requestNotifications');
      return;
    }
    openMsg(nat('openNotificationSettings'));
  }

  function fixBattery() { openMsg(nat('requestIgnoreBattery')); }

  function toggleGuard() {
    if (info.guardRunning) {
      nat('stopGuard');
    } else {
      if (!info.notifications) toast('Autorise aussi les notifications pour que la protection soit visible et fiable.');
      nat('startGuard');
    }
    setTimeout(() => refresh(true), 900);
  }

  function sheet(title, body, buttons) {
    const bd = h('div', { class: 'backdrop' });
    const close = () => bd.remove();
    bd.onclick = (e) => { if (e.target === bd) close(); };
    const acts = buttons.map((b) => h('button', {
      class: 'btn ' + (b.cls || ''),
      onclick: () => { close(); if (b.run) b.run(); }
    }, b.label));
    bd.appendChild(h('div', { class: 'sheet' }, h('h2', null, title), body, acts));
    document.body.appendChild(bd);
  }

  function lockSteps() {
    return h('ol', { class: 'lock-steps' },
      h('li', null, 'Ouvre l’appli à protéger.'),
      h('li', null, 'Touche le bouton Récents (▢ ou balayage depuis le bas).'),
      h('li', null, 'Appuie sur l’icône de l’appli en haut de sa carte (ou sur ⋮).'),
      h('li', null, 'Choisis « Verrouiller » 🔒. Un cadenas apparaît sur la carte.')
    );
  }

  function lockVisual() {
    return h('div', { style: 'width:100%' },
      h('div', { class: 'mock' },
        h('div', { class: 'mock-card' }, h('span', null, '📱'), h('span', { class: 'grow' }, 'Mon appli'), h('span', { class: 'lockbadge' }, '🔒 Verrouillée'))
      ),
      lockSteps()
    );
  }

  function showLockSheet() {
    sheet('🔒 Verrouiller dans les Récents',
      h('div', null, h('p', { class: 'sub' }, 'C’est souvent le réglage décisif sur Tecno, Infinix et Itel.'), lockSteps()),
      [
        { label: 'C’est verrouillé ✓', cls: 'primary', run: () => { confirmed.lock = true; saveConfirmed(); refresh(true); } },
        { label: 'Fermer', cls: 'ghost' }
      ]
    );
  }

  // ---------- Onboarding ----------
  const OB = [
    { kind: 'welcome', icon: '🔋', title: 'Bienvenue',
      text: 'Ton téléphone ferme tes applis trop vite pour économiser la batterie. Anti-Kill Batterie t’aide à l’en empêcher, en quelques réglages rapides.' },
    { kind: 'perm', icon: '🔔', title: 'Notifications',
      text: 'Une petite notification permanente prouve à Android que l’appli travaille : c’est ce qui la protège le mieux.',
      btn: 'Autoriser les notifications', run: fixNotif, check: () => !!info.notifications },
    { kind: 'perm', icon: '⚡', title: 'Exemption batterie',
      text: 'Autorise l’appli à ignorer l’optimisation de batterie. Une fenêtre Android va s’ouvrir : appuie sur « Autoriser ».',
      btn: 'Autoriser', run: fixBattery, check: () => !!info.ignoringBattery },
    { kind: 'manual', icon: '🚀', title: 'Démarrage automatique', key: 'auto',
      text: 'Active le démarrage auto pour l’appli (Phone Master / Applis protégées), puis reviens ici.',
      btn: 'Ouvrir le réglage', run: () => openMsg(nat('openAutoStart')), confirmLabel: 'C’est activé ✓' },
    { kind: 'manual', icon: '🔒', title: 'Verrouiller dans les Récents', key: 'lock', lock: true,
      text: 'Le réglage le plus efficace sur Tecno, Infinix et Itel.', btn: null, confirmLabel: 'C’est verrouillé ✓' },
    { kind: 'final', icon: '✅', title: 'Tout est prêt',
      text: 'La protection démarre. Tu pourras tout revoir dans le tableau de bord.' }
  ];

  function goNext() {
    obStep = Math.min(obStep + 1, OB.length - 1);
    waiting = -1;
    if (OB[obStep].kind === 'final') {
      nat('startGuard');
      setTimeout(() => refresh(true), 900);
    }
    refresh(true);
  }

  function finish() {
    onboarded = true;
    LS.set('ak_onboarded', true);
    refresh(true);
  }

  function onboarding() {
    const s = OB[obStep];
    const done = s.check ? !!s.check() : false;
    const dots = h('div', { class: 'dots' }, OB.map((_, i) => h('i', { class: i === obStep ? 'on' : '' })));
    const actions = h('div', { class: 'actions' });
    const add = (label, cls, fn) => actions.appendChild(h('button', { class: 'btn ' + cls, onclick: fn }, label));

    if (s.kind === 'welcome') {
      add('Commencer', 'primary', goNext);
    } else if (s.kind === 'perm') {
      if (done) {
        add('Continuer', 'primary', goNext);
      } else {
        add(s.btn, 'primary', () => { waiting = obStep; s.run(); setTimeout(() => refresh(true), 900); });
        add('Passer', 'ghost', goNext);
      }
    } else if (s.kind === 'manual') {
      if (s.run) add(s.btn, 'primary', () => s.run());
      add(s.confirmLabel, s.run ? '' : 'primary', () => { confirmed[s.key] = true; saveConfirmed(); goNext(); });
      add('Plus tard', 'ghost', goNext);
    } else {
      add('Terminer', 'primary', finish);
    }

    return h('div', { class: 'ob' },
      dots,
      h('div', { class: 'ob-icon' }, s.icon),
      h('h1', null, s.title),
      h('p', null, s.text),
      s.lock ? lockVisual() : null,
      done ? h('div', { class: 'badge' }, '✅ Déjà fait') : null,
      h('div', { class: 'spacer' }),
      actions
    );
  }

  // ---------- Tableau de bord ----------
  function buildItems() {
    return [
      { key: 'notif', label: 'Notifications autorisées', hint: 'Nécessaire pour la notification de protection', pts: 15, ok: !!info.notifications, run: fixNotif, btn: 'Autoriser' },
      { key: 'battery', label: 'Exemption batterie', hint: 'Android n’optimise plus cette appli', pts: 30, ok: !!info.ignoringBattery, run: fixBattery, btn: 'Autoriser' },
      { key: 'guard', label: 'Protection active', hint: info.lastError ? 'Erreur : ' + info.lastError : 'Service au premier plan', pts: 30, ok: !!info.guardRunning, run: toggleGuard, btn: 'Activer' },
      { key: 'auto', label: 'Démarrage automatique', hint: 'Phone Master / Applis protégées', pts: 10, ok: !!confirmed.auto, run: () => openMsg(nat('openAutoStart')), btn: 'Ouvrir', manual: true },
      { key: 'lock', label: 'Verrouillée dans les Récents', hint: 'Le réglage le plus efficace', pts: 10, ok: !!confirmed.lock, run: showLockSheet, btn: 'Voir comment', manual: true },
      { key: 'clean', label: 'Nettoyage auto désactivé', hint: 'Phone Master → Nettoyage', pts: 5, ok: !!confirmed.clean, run: () => openMsg(nat('openBatterySettings')), btn: 'Ouvrir', manual: true }
    ];
  }

  function renderItem(it) {
    const btns = h('div', { class: 'btns' });
    if (!it.ok) btns.appendChild(h('button', { class: 'btn small primary', onclick: it.run }, it.btn));
    if (it.manual) {
      btns.appendChild(h('button', {
        class: 'btn small',
        onclick: () => { confirmed[it.key] = !confirmed[it.key]; saveConfirmed(); refresh(true); }
      }, it.ok ? 'Annuler ↩' : 'Fait ✓'));
    }
    return h('div', { class: 'item' },
      h('div', { class: 'st' }, it.ok ? '✅' : '⚠️'),
      h('div', { class: 'body' }, h('b', null, it.label), h('span', null, it.hint), btns.childNodes.length ? btns : null)
    );
  }

  function diagText() {
    return JSON.stringify(info, null, 1) + String.fromCharCode(10, 10) + LOG.join(String.fromCharCode(10));
  }

  function dashboard() {
    const items = buildItems();
    const total = items.reduce((s, it) => s + (it.ok ? it.pts : 0), 0);
    const verdict = total >= 85 ? ['Excellente', 'ok'] : total >= 60 ? ['Correcte', 'mid'] : ['Faible', 'ko'];
    const C = 2 * Math.PI * 52;
    const off = (C * (1 - total / 100)).toFixed(1);

    const ring = h('div', {
      class: 'ring',
      html: `<svg viewBox='0 0 120 120'><circle class='ring-bg' cx='60' cy='60' r='52'/><circle class='ring-fg ${verdict[1]}' cx='60' cy='60' r='52' stroke-dasharray='${C.toFixed(1)}' stroke-dashoffset='${off}' transform='rotate(-90 60 60)'/></svg>`
    }, h('div', { class: 'ring-txt' }, h('b', null, total + '%'), h('span', null, verdict[0])));

    const device = ((info.brand || info.manufacturer || '') + ' ' + (info.model || '')).trim() + ' · Android ' + (info.release || '?');

    return h('div', null,
      h('div', { class: 'top' }, h('div', null, h('h1', null, '🔋 Anti-Kill'), h('p', { class: 'sub' }, device))),

      h('div', { class: 'card' },
        h('div', { class: 'ring-wrap' }, ring,
          h('div', { class: 'ring-info' },
            h('b', null, 'Protection ' + verdict[0].toLowerCase()),
            h('span', null, info.transsion ? 'Tecno / Infinix / Itel détecté.' : 'Marque non Transsion : les réglages peuvent avoir d’autres noms.'))),
        h('button', { class: 'btn ' + (info.guardRunning ? 'danger' : 'primary'), onclick: toggleGuard },
          info.guardRunning ? 'Désactiver la protection' : 'Activer la protection')
      ),

      h('div', { class: 'card' }, h('h2', null, 'Réglages'), items.map(renderItem)),

      h('details', { class: 'card' }, h('summary', null, '💡 Conseils'),
        h('p', null, 'Le verrouillage dans les Récents 🔒 est le réglage le plus efficace sur Tecno, Infinix et Itel. Fais-le pour chaque appli importante.'),
        h('p', null, 'Cette appli ne peut pas désactiver le gestionnaire de batterie du constructeur, ni protéger les autres applis à ta place.'),
        h('p', null, 'Certains modèles Itel restent très agressifs, même avec tout activé.')
      ),

      h('details', { class: 'card' }, h('summary', null, '🛠️ Diagnostic'),
        h('p', null, 'En cas de problème, copie ce rapport et envoie-le moi.'),
        h('div', { class: 'diag' }, diagText()),
        h('button', { class: 'btn', onclick: () => { nat('copyText', diagText()); toast('Rapport copié ✅'); } }, 'Copier le rapport'),
        h('button', { class: 'btn ghost', onclick: () => { onboarded = false; obStep = 0; LS.set('ak_onboarded', false); refresh(true); } }, 'Revoir le guide')
      )
    );
  }

  function noBridge() {
    return h('div', null,
      h('h1', null, '⚠️ Connexion Android indisponible'),
      h('p', { class: 'sub' }, 'L’appli n’arrive pas à joindre les fonctions du téléphone. Ferme-la complètement et rouvre-la.'),
      h('div', { class: 'card' }, h('div', { class: 'diag' }, diagText())),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Réessayer')
    );
  }

  // ---------- Rendu ----------
  function render() {
    root.innerHTML = '';
    if (!bridgeOk) { root.appendChild(noBridge()); return; }
    root.appendChild(onboarded ? dashboard() : onboarding());
  }

  function refresh(force) {
    const i = nat('getInfo');
    if (!i) return;
    info = i;
    const key = JSON.stringify(i) + '|' + JSON.stringify(confirmed) + '|' + onboarded + '|' + obStep;
    if (!force && key === lastKey) return;
    lastKey = key;
    const s = OB[obStep];
    if (!onboarded && waiting === obStep && s.check && s.check()) {
      waiting = -1;
      goNext();
      return;
    }
    render();
  }

  window.onNativeEvent = () => refresh(false);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
  setInterval(() => { if (bridgeOk && !document.hidden) refresh(false); }, 4000);

  // ---------- Démarrage ----------
  function start(tries) {
    if (nativeObj()) { bridgeOk = true; refresh(true); return; }
    if (tries < 25) { setTimeout(() => start(tries + 1), 120); return; }
    log('Pont natif introuvable apres 3 s');
    if (!sessionStorage.getItem('ak_reloaded')) {
      sessionStorage.setItem('ak_reloaded', '1');
      location.reload();
      return;
    }
    bridgeOk = false;
    render();
  }

  start(0);
})();
