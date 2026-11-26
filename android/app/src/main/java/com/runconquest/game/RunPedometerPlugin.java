package com.runconquest.game;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

// Step counter for runs (src/utils/pedometer.js). Uses TYPE_STEP_COUNTER - the
// hardware counter, which only ever grows (since boot) and keeps counting while
// the app is in the background - so a run's steps are "now minus the value when
// the run began". That starting value is stored with the run's start time, so a
// run resumed after the app was killed still counts from the right place.
// A reboot resets the hardware counter: the value then falls below the stored
// start and read() reports no steps (null) instead of a wrong number.
//
// ACTIVITY_RECOGNITION is a runtime permission from Android 10 (API 29); below
// that no permission exists and counting is simply allowed. The step-counter
// sensor is declared optional (required="false") in the manifest so devices
// without it can still install the app.
@CapacitorPlugin(
    name = "RunPedometer",
    permissions = {
        @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = "activity")
    }
)
public class RunPedometerPlugin extends Plugin implements SensorEventListener {

    private static final String PREFS = "run_pedometer";
    private static final String KEY_STARTED_AT = "startedAtMs";
    private static final String KEY_BASELINE = "baseline";

    private SensorManager sensorManager;
    private Sensor stepCounter;
    private boolean listening = false;
    private long startedAtMs = 0;
    private float baseline = -1f;
    private float latest = -1f;

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        stepCounter = sensorManager == null ? null : sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
    }

    private String permissionName() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "granted";
        PermissionState state = getPermissionState("activity");
        if (state == PermissionState.GRANTED) return "granted";
        if (state == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        boolean available = stepCounter != null;
        JSObject out = new JSObject();
        out.put("available", available);
        out.put("permission", available ? permissionName() : "unavailable");
        call.resolve(out);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (stepCounter == null) {
            JSObject out = new JSObject();
            out.put("permission", "unavailable");
            call.resolve(out);
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || getPermissionState("activity") == PermissionState.GRANTED) {
            JSObject out = new JSObject();
            out.put("permission", "granted");
            call.resolve(out);
            return;
        }
        requestPermissionForAlias("activity", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject out = new JSObject();
        out.put("permission", permissionName());
        call.resolve(out);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (stepCounter == null) {
            call.reject("unavailable");
            return;
        }
        if (!"granted".equals(permissionName())) {
            call.reject("denied");
            return;
        }
        long requested = call.getData().optLong("startedAtMs", System.currentTimeMillis());
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getLong(KEY_STARTED_AT, -1L) == requested) {
            // Same run, resumed (app was killed or restarted): keep its start value.
            baseline = prefs.getFloat(KEY_BASELINE, -1f);
        } else {
            baseline = -1f;
            prefs.edit().putLong(KEY_STARTED_AT, requested).remove(KEY_BASELINE).apply();
        }
        startedAtMs = requested;
        latest = -1f;
        if (listening) sensorManager.unregisterListener(this);
        listening = sensorManager.registerListener(this, stepCounter, SensorManager.SENSOR_DELAY_UI);
        if (!listening) {
            call.reject("unavailable");
            return;
        }
        call.resolve();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.values == null || event.values.length == 0) return;
        latest = event.values[0];
        if (baseline < 0f) {
            // First reading of this run = its zero point.
            baseline = latest;
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putFloat(KEY_BASELINE, baseline).apply();
        }
        if (hasListeners("steps") && latest >= baseline) {
            JSObject out = new JSObject();
            out.put("steps", Math.round(latest - baseline));
            notifyListeners("steps", out);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @PluginMethod
    public void read(PluginCall call) {
        JSObject out = new JSObject();
        if (!listening || baseline < 0f || latest < 0f || latest < baseline) {
            // No reading yet, or the counter reset (reboot): no count, never a guess.
            out.put("steps", JSObject.NULL);
        } else {
            out.put("steps", Math.round(latest - baseline));
        }
        call.resolve(out);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (listening && sensorManager != null) sensorManager.unregisterListener(this);
        listening = false;
        baseline = -1f;
        latest = -1f;
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (listening && sensorManager != null) sensorManager.unregisterListener(this);
        listening = false;
    }
}
