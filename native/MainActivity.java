package com.paul.antikill;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BatteryGuardPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
