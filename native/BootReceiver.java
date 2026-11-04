package com.paul.antikill;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Relance la protection au demarrage du telephone si elle etait activee. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent == null ? null : intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a)
            || "android.intent.action.QUICKBOOT_POWERON".equals(a)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            if (GuardService.isEnabled(context)) {
                try {
                    GuardService.start(context);
                } catch (Exception ignored) {
                    // Best effort
                }
            }
        }
    }
}
