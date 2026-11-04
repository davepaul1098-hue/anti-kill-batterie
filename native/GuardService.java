package com.paul.antikill;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/**
 * Service au premier plan : la notification permanente indique a Android
 * (et a HiOS / XOS / ItelOS) que l'appli travaille, ce qui la rend beaucoup
 * plus difficile a tuer en arriere-plan.
 */
public class GuardService extends Service {

    public static final String CHANNEL_ID = "antikill_guard";
    public static final int NOTIF_ID = 4201;
    public static final String PREFS = "antikill";
    public static final String KEY_ENABLED = "guard_enabled";
    public static final String KEY_ERROR = "last_error";
    private static final long HEARTBEAT_MS = 15 * 60 * 1000L;
    // FOREGROUND_SERVICE_TYPE_SPECIAL_USE (Android 14+)
    private static final int TYPE_SPECIAL_USE = 0x40000000;

    public static void start(Context c) {
        Intent i = new Intent(c, GuardService.class);
        if (Build.VERSION.SDK_INT >= 26) {
            c.startForegroundService(i);
        } else {
            c.startService(i);
        }
    }

    public static boolean isEnabled(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false);
    }

    public static void setEnabled(Context c, boolean value) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, value).apply();
    }

    public static String getLastError(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ERROR, "");
    }

    public static void setLastError(Context c, String err) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_ERROR, err == null ? "" : err).apply();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            createChannel();
            Notification n = buildNotification();
            if (Build.VERSION.SDK_INT >= 34 && FgsConfig.USE_TYPE) {
                startForeground(NOTIF_ID, n, TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIF_ID, n);
            }
            setLastError(this, "");
        } catch (Exception e) {
            setLastError(this, String.valueOf(e));
            setEnabled(this, false);
            stopSelf();
            return START_NOT_STICKY;
        }
        scheduleRestart(this, HEARTBEAT_MS);
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        if (isEnabled(this)) {
            scheduleRestart(this, 3000);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (isEnabled(this)) {
            scheduleRestart(this, 3000);
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Protection Anti-Kill", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Garde l'appli active en arrière-plan");
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        b.setContentTitle("Protection active")
            .setContentText("Anti-Kill Batterie garde ton téléphone réactif")
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setContentIntent(pi)
            .setOngoing(true);

        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_LOW);
        }
        return b.build();
    }

    /** Programme un redemarrage du service (au cas ou le systeme le tue). */
    static void scheduleRestart(Context c, long delayMs) {
        try {
            Intent i = new Intent(c, GuardService.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = Build.VERSION.SDK_INT >= 26
                ? PendingIntent.getForegroundService(c, 77, i, flags)
                : PendingIntent.getService(c, 77, i, flags);
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            long t = System.currentTimeMillis() + delayMs;
            if (Build.VERSION.SDK_INT >= 23) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, t, pi);
            }
        } catch (Exception ignored) {
            // Best effort
        }
    }
}
