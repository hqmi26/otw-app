package com.otwapp.malaysia;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * What OTW's pages can ask Android to do during a drive: speak a line, and keep
 * the trip going when the screen is off. The pages reach it as "OtwDrive"
 * (see src/lib/native.ts).
 */
@CapacitorPlugin(
    name = "OtwDrive",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class OtwDrivePlugin extends Plugin {

    private static volatile OtwDrivePlugin instance;

    private Voice voice;
    /** Android shows its "allow notifications?" question once; after that we don't ask again. */
    private boolean askedForNotifications;

    @Override
    public void load() {
        instance = this;
        voice = new Voice(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        voice.shutdown();
        // The pages are gone, so nothing is left to guide the trip.
        getContext().stopService(new Intent(getContext(), DriveService.class));
    }

    /** Called by the trip service for each GPS fix. */
    static void onFix(Location location) {
        OtwDrivePlugin plugin = instance;
        if (plugin == null) return;
        JSObject fix = new JSObject();
        fix.put("lng", location.getLongitude());
        fix.put("lat", location.getLatitude());
        fix.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : 50);
        fix.put("heading", location.hasBearing() ? location.getBearing() : JSObject.NULL);
        fix.put("speed", location.hasSpeed() ? location.getSpeed() : JSObject.NULL);
        plugin.notifyListeners("fix", fix);
    }

    /** Resolves when the line has been said to the end, with `said: false` if it was cut off or couldn't be said. */
    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.isEmpty()) {
            call.reject("Nothing to say");
            return;
        }
        voice.speak(text, call.getString("lang", "en"), said -> {
            JSObject result = new JSObject();
            result.put("said", said);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        voice.stop();
        call.resolve();
    }

    @PluginMethod
    public void startTrip(PluginCall call) {
        boolean needsAsking =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !askedForNotifications &&
            getPermissionState("notifications") != PermissionState.GRANTED;
        if (needsAsking) {
            askedForNotifications = true;
            requestPermissionForAlias("notifications", call, "afterNotificationsAnswer");
        } else {
            startService(call);
        }
    }

    /** The trip runs either way; without the permission Android just hides the notification. */
    @PermissionCallback
    private void afterNotificationsAnswer(PluginCall call) {
        startService(call);
    }

    private void startService(PluginCall call) {
        Context context = getContext();
        boolean canLocate =
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!canLocate) {
            call.reject("Location isn't allowed");
            return;
        }
        Intent intent = new Intent(context, DriveService.class)
            .putExtra(DriveService.EXTRA_TITLE, call.getString("title"))
            .putExtra(DriveService.EXTRA_TEXT, call.getString("text"));
        try {
            // A plain start, not startForegroundService: a trip always starts while OTW is on screen,
            // which allows it, and the service then shows its notification when it's ready. The
            // other way, Android closes the whole app if a busy phone takes over ten seconds to get there.
            context.startService(intent);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Android wouldn't start the trip service", e);
        }
    }

    @PluginMethod
    public void stopTrip(PluginCall call) {
        getContext().stopService(new Intent(getContext(), DriveService.class));
        call.resolve();
    }

    @PluginMethod
    public void isTripRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", DriveService.isRunning());
        call.resolve(result);
    }
}
