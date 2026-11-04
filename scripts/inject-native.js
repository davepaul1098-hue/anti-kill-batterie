// Prepare le projet Android genere par Capacitor :
// code natif, icone, ecran de demarrage, permissions, service au premier plan.
const fs = require('fs');
const path = require('path');

const PKG = 'com.paul.antikill';
const root = process.cwd();
const mainDir = path.join(root, 'android', 'app', 'src', 'main');
const javaDst = path.join(mainDir, 'java', ...PKG.split('.'));
const manifestPath = path.join(mainDir, 'AndroidManifest.xml');

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else {
      fs.copyFileSync(s, d);
      console.log('Copie :', path.relative(root, d));
    }
  }
}

// 1. Code Java
fs.mkdirSync(javaDst, { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'native'))) {
  if (!f.endsWith('.java')) continue;
  fs.copyFileSync(path.join(root, 'native', f), path.join(javaDst, f));
  console.log('Java :', f);
}

// 2. Ressources (icone, splash)
copyDir(path.join(root, 'native-res'), path.join(mainDir, 'res'));

// 3. Version du SDK de compilation
let compileSdk = 33;
try {
  const vg = fs.readFileSync(path.join(root, 'android', 'variables.gradle'), 'utf8');
  const mm = vg.match(/compileSdkVersion\s*=\s*(\d+)/);
  if (mm) compileSdk = parseInt(mm[1], 10);
} catch (e) {
  console.log('variables.gradle illisible, SDK 33 suppose');
}
const useType = compileSdk >= 34;
console.log('compileSdk =', compileSdk, '| type de service =', useType ? 'specialUse' : 'aucun');

fs.writeFileSync(
  path.join(javaDst, 'FgsConfig.java'),
  'package ' + PKG + ';\n\nfinal class FgsConfig {\n    static final boolean USE_TYPE = ' + useType + ';\n}\n'
);

// 4. Manifeste
let m = fs.readFileSync(manifestPath, 'utf8');

const perms = [
  'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
  'FOREGROUND_SERVICE',
  'FOREGROUND_SERVICE_SPECIAL_USE',
  'POST_NOTIFICATIONS',
  'RECEIVE_BOOT_COMPLETED'
].map((p) => `    <uses-permission android:name='android.permission.${p}' />`).join('\n');

const service = useType
  ? [
      `        <service android:name='${PKG}.GuardService' android:exported='false' android:foregroundServiceType='specialUse'>`,
      `            <property android:name='android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE' android:value='keep-app-alive' />`,
      `        </service>`
    ].join('\n')
  : `        <service android:name='${PKG}.GuardService' android:exported='false' />`;

const receiver = [
  `        <receiver android:name='${PKG}.BootReceiver' android:exported='true'>`,
  `            <intent-filter>`,
  `                <action android:name='android.intent.action.BOOT_COMPLETED' />`,
  `                <action android:name='android.intent.action.QUICKBOOT_POWERON' />`,
  `                <action android:name='android.intent.action.MY_PACKAGE_REPLACED' />`,
  `            </intent-filter>`,
  `        </receiver>`
].join('\n');

const queries = `    <queries>\n        <package android:name='com.transsion.phonemaster' />\n    </queries>`;

m = m.replace('<application', perms + '\n\n    <application');
m = m.replace('</application>', service + '\n' + receiver + '\n    </application>');
m = m.replace('</manifest>', queries + '\n</manifest>');
fs.writeFileSync(manifestPath, m);

// 5. Ecran de demarrage sombre (remplace le logo Capacitor)
const stylesPath = path.join(mainDir, 'res', 'values', 'styles.xml');
if (fs.existsSync(stylesPath)) {
  let s = fs.readFileSync(stylesPath, 'utf8');
  s = s.split('@drawable/splash').join('@drawable/ak_splash');
  fs.writeFileSync(stylesPath, s);
}

// 6. Verification
const check = fs.readFileSync(manifestPath, 'utf8');
for (const needle of ['GuardService', 'BootReceiver', 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', 'POST_NOTIFICATIONS']) {
  if (!check.includes(needle)) {
    console.error('ERREUR manifeste : ' + needle + ' manquant');
    process.exit(1);
  }
}
console.log('---- AndroidManifest.xml final ----');
console.log(check);
