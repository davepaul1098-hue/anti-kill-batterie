package com.paul.antikill;

import android.app.ActivityManager;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Callable;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;

/**
 * Pont JavaScript <-> Android, expose a la page web sous le nom AndroidNative.
 * Toutes les methodes renvoient une chaine JSON.
 */
public class NativeBridge {

    public static final int REQ_NOTIF = 4242;
    private static final String PM_PKG = "com.transsion.phonemaster";
    private static final String POST_NOTIF = "android.permission.POST_NOTIFICATIONS";

    private final Activity activity;

    public NativeBridge(Activity activity) {
        this.activity = activity;
    }

    private static class Candidate {
        final String label;
        final Intent intent;
        final String level; // direct | app | generic

        Candidate(String label, Intent intent, String level) {
            this.label = label;
            this.intent = intent;
            this.level = level;
        }
    }

    // ---------- Utilitaires ----------

    private String err(Exception e) {
        try {
            JSONObject o = new JSONObject();
            o.put("error", String.valueOf(e));
            return o.toString();
        } catch (Exception x) {
            return "{}";
        }
    }

    private <T> T onUi(final Callable<T> job, T fallback) {
        try {
            if (Looper.myLooper() == Looper.getMainLooper()) return job.call();
            final FutureTask<T> f = new FutureTask<>(job);
            activity.runOnUiThread(f);
            return f.get(3, TimeUnit.SECONDS);
        } catch (Exception e) {
            return fallback;
        }
    }

    private Intent comp(String pkg, String cls) {
        Intent i = new Intent();
        i.setComponent(new ComponentName(pkg, cls));
        return i;
    }

    private Intent launch(String pkg) {
        return activity.getPackageManager().getLaunchIntentForPackage(pkg);
    }

    private Candidate appDetails() {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        i.setData(Uri.fromParts("package", activity.getPackageName(), null));
        return new Candidate("Réglages de l'appli", i, "generic");
    }

    private String deviceId() {
        String man = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        String brand = Build.BRAND == null ? "" : Build.BRAND;
        return (man + " " + brand).toLowerCase(Locale.ROOT);
    }

    private boolean isIgnoring() {
        if (Build.VERSION.SDK_INT < 23) return true;
        PowerManager pm = (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(activity.getPackageName());
    }

    @SuppressWarnings("deprecation")
    private boolean isServiceRunning() {
        try {
            ActivityManager am = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) return false;
            for (ActivityManager.RunningServiceInfo s : am.getRunningServices(Integer.MAX_VALUE)) {
                if (GuardService.class.getName().equals(s.service.getClassName())) return true;
            }
        } catch (Exception ignored) {
            // ignore
        }
        return false;
    }

    private JSONObject doOpen(List<Candidate> list) throws Exception {
        JSONObject r = new JSONObject();
        for (Candidate c : list) {
            if (c == null || c.intent == null) continue;
            try {
                activity.startActivity(c.intent);
                r.put("opened", c.label);
                r.put("level", c.level);
                return r;
            } catch (Exception ignored) {
                // On essaie le suivant
            }
        }
        r.put("opened", "");
        r.put("level", "none");
        return r;
    }

    private String open(final List<Candidate> list) {
        try {
            JSONObject r = onUi(new Callable<JSONObject>() {
                @Override
                public JSONObject call() throws Exception {
                    return doOpen(list);
                }
            }, null);
            return r == null ? "{\"opened\":\"\",\"level\":\"none\"}" : r.toString();
        } catch (Exception e) {
            return err(e);
        }
    }

    private void addOem(List<Candidate> l, boolean autostart) {
        String id = deviceId();
        if (autostart) {
            if (id.contains("xiaomi") || id.contains("redmi") || id.contains("poco")) {
                l.add(new Candidate("Démarrage auto (Xiaomi)",
                    comp("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"), "direct"));
            } else if (id.contains("huawei") || id.contains("honor")) {
                l.add(new Candidate("Démarrage (Huawei)",
                    comp("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"), "direct"));
            } else if (id.contains("oppo") || id.contains("realme") || id.contains("oneplus")) {
                l.add(new Candidate("Démarrage (Oppo / Realme)",
                    comp("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"), "direct"));
            } else if (id.contains("vivo") || id.contains("iqoo")) {
                l.add(new Candidate("Démarrage (Vivo)",
                    comp("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"), "direct"));
            }
        } else if (id.contains("samsung")) {
            l.add(new Candidate("Batterie (Samsung)",
                comp("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"), "direct"));
        }
    }

    // ---------- Méthodes exposées à JavaScript ----------

    @JavascriptInterface
    public String getInfo() {
        try {
            String id = deviceId();
            JSONObject o = new JSONObject();
            o.put("manufacturer", Build.MANUFACTURER);
            o.put("brand", Build.BRAND);
            o.put("model", Build.MODEL);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("release", Build.VERSION.RELEASE);
            o.put("transsion", id.contains("tecno") || id.contains("infinix")
                || id.contains("itel") || id.contains("transsion"));
            o.put("notifications", NotificationManagerCompat.from(activity).areNotificationsEnabled());
            o.put("ignoringBattery", isIgnoring());
            o.put("guardRunning", isServiceRunning());
            o.put("guardEnabled", GuardService.isEnabled(activity));
            o.put("phoneMaster", launch(PM_PKG) != null);
            o.put("lastError", GuardService.getLastError(activity));
            o.put("fgsType", FgsConfig.USE_TYPE);
            return o.toString();
        } catch (Exception e) {
            return err(e);
        }
    }

    @JavascriptInterface
    public String requestNotifications() {
        try {
            JSONObject r = new JSONObject();
            if (Build.VERSION.SDK_INT >= 33) {
                if (activity.checkSelfPermission(POST_NOTIF) == PackageManager.PERMISSION_GRANTED) {
                    r.put("status", "granted");
                } else {
                    activity.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            activity.requestPermissions(new String[] { POST_NOTIF }, REQ_NOTIF);
                        }
                    });
                    r.put("status", "requested");
                }
            } else {
                r.put("status", "granted");
            }
            return r.toString();
        } catch (Exception e) {
            return err(e);
        }
    }

    @JavascriptInterface
    public String openNotificationSettings() {
        List<Candidate> l = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 26) {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName());
            l.add(new Candidate("Notifications", i, "direct"));
        }
        l.add(appDetails());
        return open(l);
    }

    @JavascriptInterface
    public String requestIgnoreBattery() {
        List<Candidate> l = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 23) {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + activity.getPackageName()));
            l.add(new Candidate("Demande d'exemption", i, "dialog"));
            l.add(new Candidate("Liste d'optimisation",
                new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), "generic"));
        }
        l.add(appDetails());
        return open(l);
    }

    @JavascriptInterface
    public String openAutoStart() {
        List<Candidate> l = new ArrayList<>();
        l.add(new Candidate("Démarrage automatique (Phone Master)",
            comp(PM_PKG, "com.cyin.himgr.autostart.AutoStartActivity"), "direct"));
        Intent pm = launch(PM_PKG);
        if (pm != null) l.add(new Candidate("Phone Master", pm, "app"));
        addOem(l, true);
        l.add(appDetails());
        return open(l);
    }

    @JavascriptInterface
    public String openBatterySettings() {
        List<Candidate> l = new ArrayList<>();
        Intent pm = launch(PM_PKG);
        if (pm != null) l.add(new Candidate("Phone Master", pm, "app"));
        addOem(l, false);
        if (Build.VERSION.SDK_INT >= 23) {
            l.add(new Candidate("Liste d'optimisation",
                new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), "generic"));
        }
        l.add(new Candidate("Économiseur de batterie",
            new Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS), "generic"));
        l.add(appDetails());
        return open(l);
    }

    @JavascriptInterface
    public String openAppSettings() {
        List<Candidate> l = new ArrayList<>();
        l.add(appDetails());
        return open(l);
    }

    @JavascriptInterface
    public String startGuard() {
        try {
            GuardService.setLastError(activity, "");
            GuardService.setEnabled(activity, true);
            GuardService.start(activity);
            return "{\"running\":true}";
        } catch (Exception e) {
            GuardService.setLastError(activity, String.valueOf(e));
            GuardService.setEnabled(activity, false);
            return err(e);
        }
    }

    @JavascriptInterface
    public String stopGuard() {
        try {
            GuardService.setEnabled(activity, false);
            activity.stopService(new Intent(activity, GuardService.class));
            return "{\"running\":false}";
        } catch (Exception e) {
            return err(e);
        }
    }

    @JavascriptInterface
    public String copyText(final String text) {
        try {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("diagnostic", text));
                }
            });
            return "{\"copied\":true}";
        } catch (Exception e) {
            return err(e);
        }
    }
}
