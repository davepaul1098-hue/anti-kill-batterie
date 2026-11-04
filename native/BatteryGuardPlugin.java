package com.paul.antikill;

import android.app.ActivityManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(
    name = "BatteryGuard",
    permissions = {
        @Permission(strings = { "android.permission.POST_NOTIFICATIONS" }, alias = "notifications")
    }
)
public class BatteryGuardPlugin extends Plugin {

    private static final String PM_PKG = "com.transsion.phonemaster";

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

    private Intent comp(String pkg, String cls) {
        Intent i = new Intent();
        i.setComponent(new ComponentName(pkg, cls));
        return i;
    }

    private Intent launch(String pkg) {
        return getContext().getPackageManager().getLaunchIntentForPackage(pkg);
    }

    private Candidate appDetails() {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        i.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        return new Candidate("Réglages de l'appli", i, "generic");
    }

    private String deviceId() {
        String man = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        String brand = Build.BRAND == null ? "" : Build.BRAND;
        return (man + " " + brand).toLowerCase(Locale.ROOT);
    }

    private boolean isIgnoring() {
        if (Build.VERSION.SDK_INT < 23) return true;
        Context c = getContext();
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName());
    }

    @SuppressWarnings("deprecation")
    private boolean isServiceRunning() {
        try {
            ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) return false;
            for (ActivityManager.RunningServiceInfo s : am.getRunningServices(Integer.MAX_VALUE)) {
                if (GuardService.class.getName().equals(s.service.getClassName())) return true;
            }
        } catch (Exception ignored) {
            // ignore
        }
        return false;
    }

    private JSObject openFirst(List<Candidate> list) {
        JSObject r = new JSObject();
        for (Candidate c : list) {
            if (c == null || c.intent == null) continue;
            try {
                c.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(c.intent);
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

    private void addOem(List<Candidate> l, boolean autostart) {
        String id = deviceId();
        if (id.contains("xiaomi") || id.contains("redmi") || id.contains("poco")) {
            if (autostart) {
                l.add(new Candidate("Démarrage auto (Xiaomi)",
                    comp("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"), "direct"));
            }
        } else if (id.contains("huawei") || id.contains("honor")) {
            if (autostart) {
                l.add(new Candidate("Démarrage (Huawei)",
                    comp("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"), "direct"));
            }
        } else if (id.contains("oppo") || id.contains("realme") || id.contains("oneplus")) {
            if (autostart) {
                l.add(new Candidate("Démarrage (Oppo / Realme)",
                    comp("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"), "direct"));
            }
        } else if (id.contains("vivo") || id.contains("iqoo")) {
            if (autostart) {
                l.add(new Candidate("Démarrage (Vivo)",
                    comp("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"), "direct"));
            }
        } else if (id.contains("samsung")) {
            if (!autostart) {
                l.add(new Candidate("Batterie (Samsung)",
                    comp("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"), "direct"));
            }
        }
    }

    // ---------- Méthodes exposées à JavaScript ----------

    @PluginMethod
    public void getInfo(PluginCall call) {
        Context c = getContext();
        String id = deviceId();
        JSObject r = new JSObject();
        r.put("manufacturer", Build.MANUFACTURER);
        r.put("brand", Build.BRAND);
        r.put("model", Build.MODEL);
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("release", Build.VERSION.RELEASE);
        r.put("transsion", id.contains("tecno") || id.contains("infinix")
            || id.contains("itel") || id.contains("transsion"));
        r.put("ignoringBattery", isIgnoring());
        r.put("guardRunning", isServiceRunning());
        r.put("guardEnabled", GuardService.isEnabled(c));
        r.put("phoneMaster", launch(PM_PKG) != null);
        call.resolve(r);
    }

    @PluginMethod
    public void requestIgnoreBattery(PluginCall call) {
        List<Candidate> l = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 23) {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            l.add(new Candidate("Demande d'exemption", i, "direct"));
            l.add(new Candidate("Liste d'optimisation",
                new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), "generic"));
        }
        l.add(appDetails());
        call.resolve(openFirst(l));
    }

    @PluginMethod
    public void openAutoStart(PluginCall call) {
        List<Candidate> l = new ArrayList<>();
        l.add(new Candidate("Démarrage automatique (Phone Master)",
            comp(PM_PKG, "com.cyin.himgr.autostart.AutoStartActivity"), "direct"));
        Intent pm = launch(PM_PKG);
        if (pm != null) l.add(new Candidate("Phone Master", pm, "app"));
        addOem(l, true);
        l.add(appDetails());
        call.resolve(openFirst(l));
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
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
        call.resolve(openFirst(l));
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        List<Candidate> l = new ArrayList<>();
        l.add(appDetails());
        call.resolve(openFirst(l));
    }

    @PluginMethod
    public void startGuard(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notifCallback");
        } else {
            doStart(call);
        }
    }

    @PermissionCallback
    private void notifCallback(PluginCall call) {
        // On démarre quand même : le service tourne, seule la notification peut etre masquee
        doStart(call);
    }

    private void doStart(PluginCall call) {
        try {
            GuardService.setEnabled(getContext(), true);
            GuardService.start(getContext());
            JSObject r = new JSObject();
            r.put("running", true);
            boolean notif = Build.VERSION.SDK_INT < 33
                || getPermissionState("notifications") == PermissionState.GRANTED;
            r.put("notifications", notif);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Impossible de démarrer la protection : " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopGuard(PluginCall call) {
        try {
            GuardService.setEnabled(getContext(), false);
            getContext().stopService(new Intent(getContext(), GuardService.class));
            JSObject r = new JSObject();
            r.put("running", false);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Impossible d'arrêter la protection : " + e.getMessage());
        }
    }
}
