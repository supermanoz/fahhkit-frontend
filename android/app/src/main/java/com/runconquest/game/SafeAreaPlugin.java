package com.runconquest.game;

import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Reports the real top inset (status bar / camera cutout) in CSS pixels. The StatusBar plugin
// overlays the WebView (src/utils/nativeShell.js), but Android's WebView reports
// env(safe-area-inset-top) as 0, so the HUD sat under the status bar. The page reads this at
// startup and exposes it as --native-safe-top (src/utils/safeArea.js). Only the top is used on
// purpose: the navigation bar and landscape cutouts are not overlaid by this app's window setup,
// so adding them would double-count.
@CapacitorPlugin(name = "SafeArea")
public class SafeAreaPlugin extends Plugin {

    @Override
    public void load() {
        // Fires on rotation, fold/unfold, and when the status bar shows/hides.
        getActivity().runOnUiThread(() -> {
            View root = getActivity().getWindow().getDecorView();
            ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
                notifyListeners("insets", toJs(insets));
                return ViewCompat.onApplyWindowInsets(v, insets);
            });
            ViewCompat.requestApplyInsets(root);
        });
    }

    @PluginMethod
    public void getInsets(PluginCall call) {
        View root = getActivity().getWindow().getDecorView();
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(root);
        call.resolve(toJs(insets));
    }

    private JSObject toJs(WindowInsetsCompat insets) {
        float density = getContext().getResources().getDisplayMetrics().density;
        int topPx = 0;
        if (insets != null) {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
            topPx = bars.top;
        }
        JSObject out = new JSObject();
        out.put("top", Math.round(topPx / density));
        return out;
    }
}
