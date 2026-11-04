# 🔋 Anti-Kill Batterie

Appli Android (Capacitor) qui aide à survivre à l'optimisation batterie agressive des téléphones **Tecno, Infinix et Itel** (HiOS, XOS, ItelOS).

## Ce qu'elle fait
- Service au premier plan + notification permanente (relance au redémarrage du téléphone)
- Demande d'exemption d'optimisation batterie
- Ouvre directement les réglages Démarrage auto / Batterie (Phone Master si présent)
- Checklist guidée, avec le verrouillage dans les Récents 🔒

## Ce qu'elle ne peut pas faire
Désactiver le gestionnaire de batterie du constructeur (impossible sans root) ni protéger les autres applis à ta place.

## Télécharger l'APK
https://github.com/davepaul1098-hue/anti-kill-batterie/releases/latest/download/AntiKill.apk

## Compilation
Chaque push sur `main` lance GitHub Actions : `npx cap add android`, injection du code natif (`native/`), puis `./gradlew assembleDebug`. L'APK est publié dans les Releases.
