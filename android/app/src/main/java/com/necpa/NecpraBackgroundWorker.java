package com.necpa;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Periodic authenticated sync. The Constraints on the request already require
 * a connected network, so no manual connectivity probe is needed (the previous
 * probe needed ACCESS_NETWORK_STATE, which was missing, and made every run
 * "retry" without syncing).
 */
public final class NecpraBackgroundWorker extends Worker {
    private static final String TAG = "NecpraBackground";
    private static final int MAX_ATTEMPTS = 5;

    public NecpraBackgroundWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        context.getSharedPreferences(NativeBackgroundSync.BACKGROUND_PREFS, Context.MODE_PRIVATE)
                .edit().putLong("lastRunAt", System.currentTimeMillis()).apply();
        try {
            // Plugin instances are activity-bound, so background work uses the
            // shared native helper rather than the Capacitor bridge.
            NativeBackgroundSync.run(context);
            Log.i(TAG, "Authenticated native background sync completed");
            return Result.success();
        } catch (NativeBackgroundSync.NoSessionException e) {
            // Signed out: nothing to do. Retrying would just burn battery.
            return Result.success();
        } catch (NativeBackgroundSync.SessionExpiredException e) {
            Log.w(TAG, "Session expired; waiting for the user to sign in again");
            context.getSharedPreferences(NativeBackgroundSync.BACKGROUND_PREFS, Context.MODE_PRIVATE)
                    .edit().putBoolean("backendReachable", true).putBoolean("syncRequested", false).apply();
            return Result.failure();
        } catch (Throwable t) {
            context.getSharedPreferences(NativeBackgroundSync.BACKGROUND_PREFS, Context.MODE_PRIVATE)
                    .edit().putBoolean("backendReachable", false).putBoolean("syncRequested", false).apply();
            Log.w(TAG, "Native background sync failed", t);
            return getRunAttemptCount() < MAX_ATTEMPTS ? Result.retry() : Result.failure();
        }
    }
}
