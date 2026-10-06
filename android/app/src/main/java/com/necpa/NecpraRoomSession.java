package com.necpa;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * One live "Play Together" match against the existing /api/games/rooms backend. Polls the room every 1.5 s (the same
 * cadence as the web arcade), publishes this player's progress (coalesced: only the newest state is sent, at most once a
 * second) and submits the final result once. All callbacks arrive on the main thread.
 */
public final class NecpraRoomSession {

    public interface Listener {
        /** Fresh room payload (players, scores, status, state...). */
        void onRoom(JSONObject room);

        /** A problem worth telling the player about (offline, room closed...). {@code fatal} ends the match. */
        void onProblem(String message, boolean fatal);
    }

    private final Context ctx;
    private final String code;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicBoolean running = new AtomicBoolean();
    private final String me;

    private volatile JSONObject room;
    private volatile String role = "";
    private JSONObject pendingState;
    private int pendingScore;
    private long lastPush;
    private boolean pushScheduled;
    private boolean submitted;
    private int offlineStrikes;

    public NecpraRoomSession(Context ctx, String code, Listener l) {
        this.ctx = ctx.getApplicationContext();
        this.code = code.trim().toUpperCase();
        this.listener = l;
        this.me = NecpraGameApi.currentUserId(ctx);
    }

    public String code() { return code; }

    public String role() { return role; }

    public JSONObject room() { return room; }

    public String myId() { return me; }

    /** Joins (idempotent for members) then starts polling. */
    public void start() {
        if (!running.compareAndSet(false, true)) return;
        io.execute(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject r = NecpraGameApi.joinRoom(ctx, code);
                    role = r.optString("role", "");
                    publish(r.optJSONObject("room"));
                } catch (Exception e) {
                    problem(message(e), true);
                    running.set(false);
                    return;
                }
                loop();
            }
        });
    }

    private void loop() {
        while (running.get()) {
            try {
                Thread.sleep(1500);
                if (!running.get()) return;
                JSONObject r = NecpraGameApi.getRoom(ctx, code);
                offlineStrikes = 0;
                publish(r.optJSONObject("room"));
            } catch (InterruptedException ie) {
                return;
            } catch (NecpraGameApi.OfflineError oe) {
                if (++offlineStrikes == 3) problem("Connection lost — retrying…", false);
            } catch (NecpraGameApi.ApiError ae) {
                if (ae.status == 404 || ae.status == 403 || ae.status == 410) {
                    problem(ae.getMessage(), true);
                    running.set(false);
                    return;
                }
            } catch (Exception ignored) {
                // transient; the next tick retries
            }
        }
    }

    public void stop() {
        running.set(false);
        io.shutdownNow();
        main.removeCallbacksAndMessages(null);
    }

    private void publish(final JSONObject r) {
        if (r == null) return;
        room = r;
        main.post(new Runnable() {
            @Override public void run() { if (running.get()) listener.onRoom(r); }
        });
    }

    private void problem(final String msg, final boolean fatal) {
        main.post(new Runnable() {
            @Override public void run() { listener.onProblem(msg, fatal); }
        });
    }

    private static String message(Exception e) {
        if (e instanceof NecpraGameApi.OfflineError) return "No internet connection";
        String m = e.getMessage();
        return m == null || m.isEmpty() ? "Could not reach the match" : m;
    }

    // ------------------------------------------------------------------ outgoing

    /** Publishes live state. Calls arriving faster than once a second are merged, the newest wins. */
    public synchronized void push(JSONObject state, int score) {
        if (!running.get() || submitted) return;
        pendingState = state;
        pendingScore = score;
        if (pushScheduled) return;
        pushScheduled = true;
        long wait = Math.max(0, 1000 - (System.currentTimeMillis() - lastPush));
        main.postDelayed(new Runnable() {
            @Override public void run() { flushPush(); }
        }, wait);
    }

    private void flushPush() {
        final JSONObject st;
        final int sc;
        synchronized (this) {
            st = pendingState;
            sc = pendingScore;
            pendingState = null;
            pushScheduled = false;
            lastPush = System.currentTimeMillis();
        }
        if (st == null || !running.get()) return;
        try {
            io.execute(new Runnable() {
                @Override public void run() {
                    try {
                        NecpraGameApi.pushState(ctx, code, st, sc);
                    } catch (Exception ignored) {
                        // the next push or the poll will carry on
                    }
                }
            });
        } catch (RuntimeException ignored) { }
    }

    public interface ResultCallback {
        void onResult(JSONObject response, String error);
    }

    /** Final result, sent once. */
    public void submit(final int score, final long timeMs, final int answered, final int correct, final ResultCallback cb) {
        synchronized (this) {
            if (submitted) return;
            submitted = true;
        }
        io.execute(new Runnable() {
            @Override public void run() {
                String err = null;
                JSONObject resp = null;
                for (int attempt = 0; attempt < 3; attempt++) {
                    try {
                        resp = NecpraGameApi.submitResult(ctx, code, score, timeMs, answered, correct);
                        err = null;
                        break;
                    } catch (NecpraGameApi.ApiError ae) {
                        err = ae.getMessage();
                        if (ae.status == 409) {
                            err = null; // already submitted: the room poll shows the outcome
                            break;
                        }
                        break;
                    } catch (Exception e) {
                        err = message(e);
                        try {
                            Thread.sleep(1500);
                        } catch (InterruptedException ie) {
                            return;
                        }
                    }
                }
                final JSONObject fr = resp;
                final String fe = err;
                main.post(new Runnable() {
                    @Override public void run() { if (cb != null) cb.onResult(fr, fe); }
                });
            }
        });
    }

    // ------------------------------------------------------------------ helpers over the room payload

    public static String gameOf(JSONObject room) { return room == null ? "" : room.optString("gameType"); }

    public static long seedOf(JSONObject room) { return room == null ? 0 : NecpraGameApi.seedOf(room.optString("seed")); }

    public static int levelOf(JSONObject room) { return room == null ? 1 : Math.max(1, room.optInt("level", 1)); }

    public static String statusOf(JSONObject room) { return room == null ? "" : room.optString("status"); }

    public JSONObject mePlayer() {
        return playerById(me);
    }

    public JSONObject playerById(String id) {
        JSONObject r = room;
        if (r == null) return null;
        JSONArray a = r.optJSONArray("players");
        if (a == null) return null;
        for (int i = 0; i < a.length(); i++) {
            JSONObject p = a.optJSONObject(i);
            if (p != null && String.valueOf(p.opt("userId")).equals(id)) return p;
        }
        return null;
    }

    /** The first other player in the room (head-to-head games), or null while waiting. */
    public JSONObject opponent() {
        JSONObject r = room;
        if (r == null) return null;
        JSONArray a = r.optJSONArray("players");
        if (a == null) return null;
        for (int i = 0; i < a.length(); i++) {
            JSONObject p = a.optJSONObject(i);
            if (p != null && !String.valueOf(p.opt("userId")).equals(me)) return p;
        }
        return null;
    }

    public int playerCount() {
        JSONObject r = room;
        JSONArray a = r == null ? null : r.optJSONArray("players");
        return a == null ? 0 : a.length();
    }

    public boolean finished() { return "finished".equals(statusOf(room)); }

    /** Coins this player was awarded by the server for the finished match. */
    public int myReward() {
        JSONObject r = room;
        if (r == null) return 0;
        JSONObject st = r.optJSONObject("state");
        JSONObject by = st == null ? null : st.optJSONObject("rewardByUser");
        return by == null ? 0 : by.optInt(me, 0);
    }
}
