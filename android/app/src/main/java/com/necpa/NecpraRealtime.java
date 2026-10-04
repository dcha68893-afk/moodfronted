package com.necpa;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;

import java.util.Collections;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import io.socket.client.IO;
import io.socket.client.Socket;

/**
 * Native Socket.IO connection for the Messages screens (typing, presence, live messages and receipts).
 *
 * Messages themselves are NOT decoded from the socket. A socket event only says "chat N changed"; the
 * repository then runs its normal /sync catch-up, so there is exactly ONE ingest/decrypt path (a ratchet
 * key can only be used once) and a missed event can never lose a message — the poll stays as a safety net.
 *
 * The connection lives only while a native Messages screen is visible (reference counted).
 */
final class NecpraRealtime {
    private static final String TAG = "NecpraRealtime";

    interface Listener {
        void onTyping(long chatId, long userId, boolean typing);
        void onPresence(long userId, boolean online);
        void onConnectionChanged(boolean connected);
    }

    private static volatile NecpraRealtime instance;

    static NecpraRealtime get(Context c) {
        NecpraRealtime r = instance;
        if (r == null) {
            synchronized (NecpraRealtime.class) {
                if (instance == null) instance = new NecpraRealtime(c.getApplicationContext());
                r = instance;
            }
        }
        return r;
    }

    private final Context app;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();
    private Socket socket;
    private int users;
    private int failures;
    private volatile boolean connected;
    private long generation;

    private NecpraRealtime(Context app) { this.app = app; }

    void addListener(Listener l) { listeners.addIfAbsent(l); }
    void removeListener(Listener l) { listeners.remove(l); }
    boolean isConnected() { return connected; }

    /** Call from onResume of every screen that wants live updates; pair with {@link #stop()} in onPause. */
    synchronized void start() {
        users++;
        if (users == 1) { failures = 0; final long g = ++generation; worker.execute(() -> connect(g)); }
    }

    synchronized void stop() {
        if (users > 0) users--;
        if (users == 0) {
            final long g = ++generation;
            // Short grace so moving between two native screens doesn't tear the socket down.
            worker.schedule(() -> { synchronized (NecpraRealtime.this) { if (users == 0 && g == generation) close(); } }, 4, TimeUnit.SECONDS);
        }
    }

    private synchronized void close() {
        Socket s = socket; socket = null;
        if (s != null) { try { s.off(); s.disconnect(); s.close(); } catch (Throwable ignored) { } }
        setConnected(false);
    }

    private void setConnected(boolean on) {
        if (connected == on) return;
        connected = on;
        main.post(() -> { for (Listener l : listeners) l.onConnectionChanged(on); });
    }

    private void connect(final long gen) {
        synchronized (this) { if (users == 0 || gen != generation) return; }
        try {
            if (!NecpraDmOwner.isOwner(app)) return;           // nothing native to keep live
            SharedPreferences auth = app.getSharedPreferences(NativeBackgroundSync.AUTH_PREFS, Context.MODE_PRIVATE);
            String token = NativeBackgroundSync.getDecrypted(auth, "accessToken");
            if (token == null || token.isEmpty() || failures > 0) token = NativeBackgroundSync.refreshSession(app);
            if (token == null || token.isEmpty()) { retryLater(gen); return; }

            IO.Options o = IO.Options.builder()
                    .setAuth(Collections.singletonMap("token", token))
                    .setTransports(new String[]{"websocket", "polling"})
                    .setReconnection(false)                    // we own reconnects so every attempt carries a fresh token
                    .setTimeout(15000)
                    .build();
            final Socket s = IO.socket(NativeBackgroundSync.backendOrigin(app), o);

            s.on(Socket.EVENT_CONNECT, a -> { failures = 0; setConnected(true); });
            s.on(Socket.EVENT_DISCONNECT, a -> { setConnected(false); retryLater(gen); });
            s.on(Socket.EVENT_CONNECT_ERROR, a -> { failures++; setConnected(false); retryLater(gen); });

            for (String ev : new String[]{"message:new", "message:read", "message:delivered", "message:reaction",
                    "message:edited", "message:deleted", "message:status"}) {
                s.on(ev, a -> onMessageEvent(a));
            }
            s.on("typing:start", a -> onTyping(a, true));
            s.on("typing:stop", a -> onTyping(a, false));
            s.on("presence:update", a -> onPresence(a));

            synchronized (this) {
                if (users == 0 || gen != generation) { s.close(); return; }
                if (socket != null) { try { socket.off(); socket.close(); } catch (Throwable ignored) { } }
                socket = s;
            }
            s.connect();
        } catch (NativeBackgroundSync.SessionExpiredException e) {
            Log.w(TAG, "session expired, realtime stays off");
        } catch (Throwable t) {
            Log.w(TAG, "connect failed: " + t.getMessage());
            failures++;
            retryLater(gen);
        }
    }

    private void retryLater(final long gen) {
        synchronized (this) { if (users == 0 || gen != generation) return; }
        long delay = Math.min(30_000L, 2_000L << Math.min(failures, 4));
        worker.schedule(() -> connect(gen), delay, TimeUnit.MILLISECONDS);
    }

    // ------------------------------------------------------------------ incoming

    private static long chatIdOf(Object[] args) {
        if (args == null) return 0;
        for (Object a : args) {
            if (a instanceof JSONObject) {
                JSONObject o = (JSONObject) a;
                long id = o.optLong("chatId", 0);
                if (id <= 0) { JSONObject m = o.optJSONObject("message"); if (m != null) id = m.optLong("chatId", 0); }
                if (id <= 0) { JSONObject m = o.optJSONObject("data"); if (m != null) id = m.optLong("chatId", 0); }
                if (id > 0) return id;
            }
        }
        return 0;
    }

    private void onMessageEvent(Object[] args) {
        long chatId = chatIdOf(args);
        NecpraMessageRepository.get(app).onRealtimeChat(chatId);
    }

    private void onTyping(Object[] args, boolean typing) {
        if (args == null || args.length == 0 || !(args[0] instanceof JSONObject)) return;
        final JSONObject o = (JSONObject) args[0];
        final long chatId = o.optLong("chatId", 0), uid = o.optLong("userId", 0);
        if (chatId <= 0 || uid <= 0) return;
        main.post(() -> { for (Listener l : listeners) l.onTyping(chatId, uid, typing); });
    }

    private void onPresence(Object[] args) {
        if (args == null || args.length == 0 || !(args[0] instanceof JSONObject)) return;
        final JSONObject o = (JSONObject) args[0];
        final long uid = o.optLong("userId", 0);
        if (uid <= 0) return;
        String st = o.optString("status", "");
        final boolean online = "online".equalsIgnoreCase(st) || "active".equalsIgnoreCase(st) || o.optBoolean("online", false);
        main.post(() -> { for (Listener l : listeners) l.onPresence(uid, online); });
    }

    // ------------------------------------------------------------------ outgoing

    void typing(long chatId, boolean on) {
        Socket s = socket;
        if (s == null || !connected || chatId <= 0) return;
        try { s.emit(on ? "typing:start" : "typing:stop", new JSONObject().put("chatId", chatId)); }
        catch (Exception ignored) { }
    }
}
