package com.necpa;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Registers this device's FCM token with the backend from NATIVE code.
 *
 * Why this exists: the only token upload used to live in js/native-push.js, which runs inside the WebView of
 * chat.html. If that page never loaded (native screens opened first, WebView killed, session restored natively) or a
 * token rotated while the app was closed, the server never learned this device's token and no push could ever be sent
 * - exactly "no notification when the app is closed". This class uploads the token with the native session
 * (same encrypted store the native background sync already uses), so it works with no WebView at all.
 *
 * Triggers: app start (MainActivity.onStart), FCM token rotation (NecpraMessagingService.onNewToken) and the
 * 15-minute background worker. Uploads are idempotent (server upserts by token), so repeats are harmless.
 */
final class NecpraPushRegistrar {
    private static final String TAG = "NecpraPushReg";
    private static final String PREFS = "necpra_push_registrar";
    private static final long RESEND_MS = 30L * 60 * 1000;   // refresh server lastSeenAt / re-link after account change
    /** Same marker js/native-push.js sends; makes the server send data-only pushes this app turns into grouped notifications. */
    private static final String UA_MARKER = "NecpraNativeNotify/3";

    private static final ExecutorService POOL = Executors.newSingleThreadExecutor();

    private NecpraPushRegistrar() {}

    /** Fire-and-forget; safe to call from any thread / lifecycle callback. */
    static void sync(final Context context, final boolean force) {
        final Context app = context.getApplicationContext();
        try {
            POOL.execute(() -> syncNow(app, force));
        } catch (Throwable t) {
            Log.w(TAG, "could not schedule token sync", t);
        }
    }

    /** Called by NecpraMessagingService when Firebase rotates the token. */
    static void onNewToken(Context context, String token) {
        if (token != null && !token.isEmpty()) {
            context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString("token", token).apply();
        }
        sync(context, true);
    }

    /** Blocking variant for callers already on a background thread (the WorkManager worker). */
    static void syncNow(Context context, boolean force) {
        try {
            SharedPreferences auth = context.getSharedPreferences(NativeBackgroundSync.AUTH_PREFS, Context.MODE_PRIVATE);
            String access = null, refresh = null;
            try { access = NativeBackgroundSync.getDecrypted(auth, "accessToken"); } catch (Throwable ignored) {}
            try { refresh = NativeBackgroundSync.getDecrypted(auth, "refreshToken"); } catch (Throwable ignored) {}
            boolean hasSession = (access != null && !access.isEmpty()) || (refresh != null && !refresh.isEmpty());
            if (!hasSession) return;   // signed out: nothing to link

            SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String token = fetchToken();
            if (token == null || token.isEmpty()) token = sp.getString("token", "");
            if (token == null || token.isEmpty()) { Log.w(TAG, "no FCM token available yet"); return; }

            String lastToken = sp.getString("uploadedToken", "");
            long lastAt = sp.getLong("uploadedAt", 0L);
            boolean changed = !token.equals(lastToken);
            boolean stale = System.currentTimeMillis() - lastAt > RESEND_MS;
            if (!force && !changed && !stale) return;

            JSONObject body = new JSONObject();
            body.put("token", token);
            body.put("platform", "android");
            body.put("userAgent", "NecpraAndroid " + UA_MARKER);
            int status = NecpraNotifier.authedPost(context, "/api/push/fcm-token", body);
            if (status >= 200 && status < 300) {
                sp.edit().putString("token", token).putString("uploadedToken", token)
                        .putLong("uploadedAt", System.currentTimeMillis()).apply();
                Log.i(TAG, "FCM token registered with server");
            } else {
                Log.w(TAG, "FCM token upload failed, HTTP " + status + " (will retry)");
            }
        } catch (Throwable t) {
            Log.w(TAG, "token sync failed: " + t.getMessage());
        }
    }

    private static String fetchToken() {
        try {
            final CountDownLatch latch = new CountDownLatch(1);
            final AtomicReference<String> out = new AtomicReference<>("");
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                try { if (task.isSuccessful() && task.getResult() != null) out.set(task.getResult()); }
                finally { latch.countDown(); }
            });
            latch.await(15, TimeUnit.SECONDS);
            return out.get();
        } catch (Throwable t) {
            return "";
        }
    }
}
