package com.necpa;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public final class NecpraBackgroundWorker extends Worker {
    private static final String PREFS = "necpra_native_background";

    public NecpraBackgroundWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        long now = System.currentTimeMillis();
        boolean connected = isConnected(context);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong("lastRunAt", now)
                .putBoolean("networkConnected", connected)
                .apply();

        if (!connected) return Result.retry();

        try {
            // The native plugin owns the authenticated sync path. It reads the
            // Keystore-backed refresh token, refreshes access when necessary,
            // pulls the same social datasets used by the web sync manager, and
            // persists one snapshot for the WebView cache to consume later.
            NecpraNativePlugin bridge = null;
            // Plugin instances are activity-bound, so background work cannot
            // depend on a live WebView/Plugin instance. The worker therefore
            // uses the shared native worker helper below instead of invoking
            // the Capacitor bridge.
            NativeBackgroundSync.run(context);

            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putLong("lastBackendCheckAt", now)
                    .putInt("lastBackendStatus", 200)
                    .putBoolean("backendReachable", true)
                    .putBoolean("syncRequested", true)
                    .putLong("syncRequestedAt", now)
                    .apply();

            Log.i("NecpraBackground", "Authenticated native background sync completed");
            return Result.success();
        } catch (Throwable t) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean("backendReachable", false)
                    .putBoolean("syncRequested", false)
                    .apply();
            Log.w("NecpraBackground", "Native background sync failed", t);
            return Result.retry();
        }
    }

    private static boolean isConnected(Context context) {
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            Network n = cm.getActiveNetwork();
            return n != null && cm.getNetworkCapabilities(n) != null;
        } catch (Throwable t) {
            return false;
        }
    }
}
