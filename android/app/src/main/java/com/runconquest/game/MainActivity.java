package com.runconquest.game;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // RunNotificationPlugin lives in this app module (not an installed npm
        // plugin), so it needs manual registration - see
        // src/utils/runNotification.js.
        registerPlugin(RunNotificationPlugin.class);
        registerPlugin(AppSettingsPlugin.class);
        super.onCreate(savedInstanceState);
        // Chrome's WebView blocks audio.play() with sound until a user
        // gesture by default, same as a mobile browser tab - but this is a
        // native app shell, not a page the player found in a browser, so
        // that restriction doesn't need to apply here. Lets the game's
        // background music (GamePage.jsx) autoplay the instant loading
        // finishes instead of waiting for the first tap.
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
