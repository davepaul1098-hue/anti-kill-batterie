package com.paul.antikill;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int bg = Color.parseColor("#0B0F14");
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(bg);
        try {
            WebView wv = getBridge().getWebView();
            wv.setBackgroundColor(bg);
            wv.addJavascriptInterface(new NativeBridge(this), "AndroidNative");
        } catch (Exception ignored) {
            // Le JavaScript affichera un diagnostic si le pont est absent
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        notifyJs("resume");
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        notifyJs("perm");
    }

    private void notifyJs(final String ev) {
        try {
            if (getBridge() == null) return;
            final WebView wv = getBridge().getWebView();
            wv.post(new Runnable() {
                @Override
                public void run() {
                    wv.evaluateJavascript("window.onNativeEvent&&window.onNativeEvent('" + ev + "')", null);
                }
            });
        } catch (Exception ignored) {
            // ignore
        }
    }
}
