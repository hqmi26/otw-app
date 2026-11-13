package com.otwapp.malaysia;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.location.LocationRequest;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Runs for the length of a trip, so the drive carries on when the screen is off
 * or another app is open. Android only lets an app keep using GPS in the
 * background while it shows a notification like this one.
 *
 * It reads the GPS itself and hands each fix to the app's pages, because their
 * own GPS feed stops when OTW isn't on screen.
 */
public class DriveService extends Service implements LocationListener {

    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";

    private static final String TAG = "OtwDrive";
    private static final String CHANNEL = "drive";
    private static final int NOTIFICATION_ID = 1;
    /** A trip left running by mistake stops holding the phone awake after this long. */
    private static final long AWAKE_LIMIT_MS = 6 * 60 * 60 * 1000L;

    private static volatile boolean running;

    private PowerManager.WakeLock awake;
    private boolean listening;

    static boolean isRunning() {
        return running;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
        String text = intent != null ? intent.getStringExtra(EXTRA_TEXT) : null;
        try {
            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0;
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(title, text), type);
        } catch (RuntimeException e) {
            // Location was taken away, or Android refused because OTW wasn't on screen.
            Log.w(TAG, "could not start the trip service", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        stayAwake();
        listen();
        Log.i(TAG, "trip service started");
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (listening) ((LocationManager) getSystemService(Context.LOCATION_SERVICE)).removeUpdates(this);
        listening = false;
        if (awake != null && awake.isHeld()) awake.release();
        Log.i(TAG, "trip service stopped");
        super.onDestroy();
    }

    /** Swiping OTW away from the recent apps ends the trip. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
    }

    private Notification notification(String title, String text) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Trip in progress", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shows while OTW is guiding a trip");
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_otw)
            .setContentTitle(title != null ? title : "OTW is guiding your trip")
            .setContentText(text)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(tap)
            .build();
    }

    /** Keeps the phone's processor on between GPS fixes, so a turn isn't said late. The screen may still go off. */
    private void stayAwake() {
        if (awake == null) {
            PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
            awake = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "otw:trip");
            awake.setReferenceCounted(false);
        }
        awake.acquire(AWAKE_LIMIT_MS);
    }

    private void listen() {
        if (listening) return;
        LocationManager manager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && manager.hasProvider(LocationManager.FUSED_PROVIDER)) {
                LocationRequest request = new LocationRequest.Builder(1000)
                    .setQuality(LocationRequest.QUALITY_HIGH_ACCURACY)
                    .setMinUpdateIntervalMillis(500)
                    .build();
                manager.requestLocationUpdates(LocationManager.FUSED_PROVIDER, request, getMainExecutor(), this);
            } else {
                manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, this, Looper.getMainLooper());
            }
            listening = true;
        } catch (SecurityException | IllegalArgumentException e) {
            Log.w(TAG, "could not read the GPS", e);
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        OtwDrivePlugin.onFix(location);
    }

    // Older Android versions need these three to exist.
    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onProviderDisabled(String provider) {}
}
