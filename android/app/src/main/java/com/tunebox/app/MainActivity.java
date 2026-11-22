package com.tunebox.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(YtdlpPlugin.class);
        registerPlugin(FilesPlugin.class);
        registerPlugin(PlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
