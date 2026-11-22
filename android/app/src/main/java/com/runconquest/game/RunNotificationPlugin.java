package com.runconquest.game;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import android.widget.RemoteViews;

import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

// Drives the persistent "Running"/"Paused" notification shown while a run is
// being tracked (Android only - see src/utils/runNotification.js, called
// from useRunTracker.js). Tap-to-open only for now; Pause/End action buttons
// are a planned fast-follow (see notification_run_expanded.xml).
//
// This does NOT run its own foreground service or location watch - that's
// already owned by @capacitor-community/background-geolocation's
// BackgroundGeolocationService (see src/utils/geo.js), which is what
// actually keeps the OS from killing tracking when the screen locks. This
// plugin only replaces what that service's own notification *looks like*,
// by re-posting a notification under the exact same notification ID it
// uses. See the NOTIFICATION_ID comment below for why that's safe.
@CapacitorPlugin(name = "RunNotification")
public class RunNotificationPlugin extends Plugin {

    // Must match BackgroundGeolocationService.NOTIFICATION_ID in
    // @capacitor-community/background-geolocation@1.3.1 (private, not
    // exported - see node_modules/@capacitor-community/background-geolocation/
    // android/.../BackgroundGeolocationService.java). Re-posting a
    // notification under a foreground service's active notification ID
    // replaces its visible content without needing to fork that plugin or
    // touch node_modules - Android doesn't care which component calls
    // notify(), only that the ID matches. If that plugin is ever upgraded
    // and this constant changes upstream, this silently stops overriding
    // anything (the plugin's own plain notification just shows instead,
    // tracking itself is completely unaffected either way) rather than
    // crashing - worth re-checking this value on any
    // @capacitor-community/background-geolocation version bump.
    private static final int NOTIFICATION_ID = 28351;
    private static final String CHANNEL_ID = "active_run";

    private boolean active = false;
    private boolean paused = false;
    private long baseElapsedRealtime = 0L;
    // Elapsed time frozen at pause() so the Chronometer stops showing a moving clock.
    private long pausedElapsedMs = 0L;
    private String distanceText = "0.00";
    private String paceText = "--";
    // Header text from JS (utils/runModeLabel.js); null = legacy Running/Paused.
    private String titleText = null;
    // The title start() was given, restored when a temporary header clears.
    private String runTitleText = null;

    // Called whenever JS transitions into "tracking, not paused" - a brand
    // new run, a Training run resuming after pause(), or the app reattaching
    // to a run already in progress after being reopened (process restart
    // loses all state below, so it can't be resumed in place - see
    // useRunTracker.js, which always knows the correct elapsedMs/distance/
    // pace to pass here regardless of which of those three this is).
    @PluginMethod
    public void start(PluginCall call) {
        active = true;
        paused = false;
        long elapsedMs = call.getInt("elapsedMs", 0);
        baseElapsedRealtime = SystemClock.elapsedRealtime() - elapsedMs;
        Double distanceMeters = call.getDouble("distanceMeters");
        distanceText = distanceMeters != null
                ? String.format(Locale.US, "%.2f", distanceMeters / 1000.0)
                : "0.00";
        String pace = call.getString("paceLabel");
        paceText = pace != null ? pace : "--";
        titleText = call.getString("title");
        runTitleText = titleText;
        pausedElapsedMs = 0L;
        ensureChannel();
        post();
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        if (!active) {
            call.resolve();
            return;
        }
        Double distanceMeters = call.getDouble("distanceMeters");
        String pace = call.getString("paceLabel");
        // Optional new header (e.g. "Vehicle detected"); an empty string
        // clears it back to the run-mode label passed to start().
        if (call.hasOption("title")) {
            String newTitle = call.getString("title");
            titleText = (newTitle == null || newTitle.isEmpty()) ? runTitleText : newTitle;
        }
        if (distanceMeters != null) {
            distanceText = String.format(Locale.US, "%.2f", distanceMeters / 1000.0);
        }
        if (pace != null) {
            paceText = pace;
        }
        post();
        call.resolve();
    }

    // Freezes the displayed time/header at whatever they currently show -
    // resuming calls start() again with a freshly computed elapsedMs rather
    // than trying to shift this base forward in place (see start()'s doc).
    @PluginMethod
    public void pause(PluginCall call) {
        if (active) {
            paused = true;
            // Freeze the Chronometer at the elapsed time of this moment.
            pausedElapsedMs = Math.max(0, SystemClock.elapsedRealtime() - baseElapsedRealtime);
            String pausedTitle = call.getString("title");
            if (pausedTitle != null) titleText = pausedTitle;
            post();
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        active = false;
        paused = false;
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        call.resolve();
    }

    private void ensureChannel() {
        NotificationChannelCompat channel = new NotificationChannelCompat.Builder(
                CHANNEL_ID,
                NotificationManagerCompat.IMPORTANCE_LOW
        )
                .setName("Active run")
                .setDescription("The ongoing run-tracking notification - time, pace and distance.")
                .setSound(null, null)
                .setVibrationEnabled(false)
                .setShowBadge(false)
                .build();
        NotificationManagerCompat.from(getContext()).createNotificationChannel(channel);
    }

    private RemoteViews buildViews(int layoutRes) {
        Context context = getContext();
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutRes);
        views.setInt(
                R.id.run_notif_header,
                "setBackgroundResource",
                paused ? R.drawable.run_notification_pill_paused : R.drawable.run_notification_pill
        );
        // Pill text: the run-mode label (or the temporary "Vehicle detected" /
        // paused wording JS passes as `title`).
        views.setTextViewText(R.id.run_notif_header, titleText != null ? titleText : (paused ? "Paused" : "Running"));
        // Live timer: a Chronometer ticks by itself (no per-second re-post). While
        // paused it is re-based to the frozen elapsed time and stopped.
        if (paused) {
            views.setChronometer(
                    R.id.run_notif_value_time,
                    SystemClock.elapsedRealtime() - pausedElapsedMs,
                    null,
                    false
            );
        } else {
            views.setChronometer(R.id.run_notif_value_time, baseElapsedRealtime, null, true);
        }
        views.setTextViewText(R.id.run_notif_value_pace, paceText);
        views.setTextViewText(R.id.run_notif_value_distance, distanceText);
        return views;
    }

    private void post() {
        Context context = getContext();

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(context, 0, openIntent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(ContextCompat.getColor(context, R.color.colorPrimary))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setSilent(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(contentIntent)
                .setCustomContentView(buildViews(R.layout.notification_run_collapsed))
                .setCustomBigContentView(buildViews(R.layout.notification_run_expanded))
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle());

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS denied (Android 13+) - tracking itself is
            // completely unaffected, there's just no notification to show.
        }
    }
}
