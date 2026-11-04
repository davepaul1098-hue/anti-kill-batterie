// Copie le code natif Java dans le projet Android genere par Capacitor
// et ajoute permissions, service et receiver dans AndroidManifest.xml
const fs = require('fs');
const path = require('path');

const PKG = 'com.paul.antikill';
const root = process.cwd();
const srcDir = path.join(root, 'native');
const javaDst = path.join(root, 'android', 'app', 'src', 'main', 'java', ...PKG.split('.'));
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

fs.mkdirSync(javaDst, { recursive: true });
for (const f of fs.readdirSync(srcDir)) {
  if (!f.endsWith('.java')) continue;
  fs.copyFileSync(path.join(srcDir, f), path.join(javaDst, f));
  console.log('Copie :', f);
}

let m = fs.readFileSync(manifestPath, 'utf8');

if (!m.includes('com.paul.antikill.GuardService')) {
  const perms = [
    '<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />',
    '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />'
  ].map((l) => '    ' + l).join('\n');

  const comps = [
    '        <service android:name="com.paul.antikill.GuardService" android:exported="false" />',
    '        <receiver android:name="com.paul.antikill.BootReceiver" android:exported="true">',
    '            <intent-filter>',
    '                <action android:name="android.intent.action.BOOT_COMPLETED" />',
    '                <action android:name="android.intent.action.QUICKBOOT_POWERON" />',
    '                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />',
    '            </intent-filter>',
    '        </receiver>'
  ].join('\n');

  const queries = [
    '    <queries>',
    '        <package android:name="com.transsion.phonemaster" />',
    '    </queries>'
  ].join('\n');

  m = m.replace('<application', perms + '\n\n    <application');
  m = m.replace('</application>', comps + '\n    </application>');
  m = m.replace('</manifest>', queries + '\n</manifest>');
  fs.writeFileSync(manifestPath, m);
}

const check = fs.readFileSync(manifestPath, 'utf8');
if (!check.includes('com.paul.antikill.GuardService') || !check.includes('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS')) {
  console.error('ERREUR : le manifeste n a pas ete modifie correctement');
  process.exit(1);
}
console.log('Manifeste OK');
