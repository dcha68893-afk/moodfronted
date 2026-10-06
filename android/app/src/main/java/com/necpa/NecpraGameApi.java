package com.necpa;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Blocking REST client for the arcade backend (/api/games/*). Same auth/refresh path as every other native
 * screen. Call from a background thread only. Failures are loud: an {@link ApiError} always carries the server's
 * message, and an unreachable network is an {@link OfflineError}; nothing is silently swallowed.
 */
public final class NecpraGameApi {
    private NecpraGameApi() { }

    public static final class ApiError extends Exception {
        public final int status;
        public final String code;

        public ApiError(int status, String message, String code) {
            super(message);
            this.status = status;
            this.code = code;
        }
    }

    public static final class OfflineError extends Exception {
        public OfflineError(Throwable cause) {
            super("No connection", cause);
        }
    }

    public static final class Result {
        public final int status;
        public final JSONObject body;

        Result(int status, JSONObject body) {
            this.status = status;
            this.body = body;
        }
    }

    // ------------------------------------------------------------------ transport

    /** One HTTP exchange. Pure transport: no auth handling, usable against any URL. */
    static Result exchange(String url, String method, String token, JSONObject body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setRequestMethod(method);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setUseCaches(false);
            c.setRequestProperty("Accept", "application/json");
            if (token != null && !token.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = c.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = c.getResponseCode();
            String text = NativeBackgroundSync.readText(status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream());
            JSONObject parsed;
            try {
                parsed = new JSONObject(text == null || text.trim().isEmpty() ? "{}" : text);
            } catch (Exception e) {
                parsed = new JSONObject();
            }
            return new Result(status, parsed);
        } finally {
            c.disconnect();
        }
    }

    private static SharedPreferences auth(Context ctx) {
        return ctx.getSharedPreferences(NativeBackgroundSync.AUTH_PREFS, Context.MODE_PRIVATE);
    }

    private static String refresh(Context ctx) throws Exception {
        try {
            return NativeBackgroundSync.refreshSession(ctx);
        } catch (IOException ioe) {
            throw new OfflineError(ioe);
        }
    }

    /** Authenticated call with one transparent token refresh on 401. */
    public static JSONObject call(Context ctx, String method, String path, JSONObject body) throws Exception {
        boolean retried = false;
        while (true) {
            String access = NativeBackgroundSync.getDecrypted(auth(ctx), "accessToken");
            if (access == null || access.isEmpty()) access = refresh(ctx);
            Result r;
            try {
                r = exchange(NativeBackgroundSync.backendOrigin(ctx) + "/api/games" + path, method, access, body);
            } catch (IOException ioe) {
                throw new OfflineError(ioe);
            }
            if (r.status == 401) {
                if (retried) throw new NativeBackgroundSync.SessionExpiredException("Unauthorized after refresh");
                retried = true;
                refresh(ctx);
                continue;
            }
            if (r.status < 200 || r.status >= 300) {
                String msg = r.body.optString("error", r.body.optString("message", "Request failed (HTTP " + r.status + ")"));
                throw new ApiError(r.status, msg, r.body.optString("code", ""));
            }
            return r.body;
        }
    }

    // ------------------------------------------------------------------ wallet

    /**
     * Credits coins the server added since the last look (M-Pesa purchases and match rewards), exactly like the web
     * wallet: the first ever look only records the server balance, later looks add the positive difference.
     * @return coins credited to the local wallet
     */
    public static int syncServerCoins(Context ctx, NecpraGameStore store) throws Exception {
        JSONObject j = call(ctx, "GET", "/progress", null);
        JSONObject prog = j.optJSONObject("progress");
        long srv = prog == null ? 0 : prog.optLong("coins", 0);
        long seen = store.serverSeen();
        store.setServerSeen(srv);
        if (seen < 0) return 0;
        long add = srv - seen;
        if (add > 0) {
            store.add((int) Math.min(Integer.MAX_VALUE, add));
            return (int) add;
        }
        return 0;
    }

    public static final int COINS_PER_KES = 2;
    public static final int MIN_KES = 5;
    public static final int MAX_KES = 150000;

    /** Starts an M-Pesa STK push. The coins arrive through {@link #syncServerCoins} once the payment confirms. */
    public static JSONObject mpesaStk(Context ctx, int kes, String phone) throws Exception {
        JSONObject b = new JSONObject();
        b.put("amount", kes);
        b.put("phone", phone);
        return call(ctx, "POST", "/coins/mpesa/stk", b);
    }

    /** Same phone rule as the web wallet. */
    public static boolean validPhone(String raw) {
        if (raw == null) return false;
        return raw.replaceAll("[\\s-]", "").matches("^(\\+?254|0)?[71]\\d{8}$");
    }

    // ------------------------------------------------------------------ rooms (Play Together)

    public static JSONObject createRoom(Context ctx, String game, int level, String subject, long targetUserId) throws Exception {
        JSONObject b = new JSONObject();
        b.put("gameType", game);
        b.put("level", level);
        if (subject != null) b.put("subject", subject);
        if (targetUserId > 0) b.put("targetUserId", targetUserId);
        return call(ctx, "POST", "/rooms", b);
    }

    public static JSONObject getRoom(Context ctx, String code) throws Exception {
        return call(ctx, "GET", "/rooms/" + code.trim().toUpperCase(), null);
    }

    public static JSONObject joinRoom(Context ctx, String code) throws Exception {
        return call(ctx, "POST", "/rooms/" + code.trim().toUpperCase() + "/join", new JSONObject());
    }

    public static JSONObject changeGame(Context ctx, String code, String game, int level, String subject) throws Exception {
        JSONObject b = new JSONObject();
        b.put("gameType", game);
        b.put("level", level);
        if (subject != null) b.put("subject", subject);
        return call(ctx, "POST", "/rooms/" + code.trim().toUpperCase() + "/change-game", b);
    }

    /** Publishes this player's live state (progress, answered, correct, position, ...). */
    public static JSONObject pushState(Context ctx, String code, JSONObject state, int score) throws Exception {
        JSONObject b = new JSONObject();
        b.put("state", state);
        b.put("score", score);
        return call(ctx, "POST", "/rooms/" + code.trim().toUpperCase() + "/state", b);
    }

    public static JSONObject submitResult(Context ctx, String code, int score, long timeMs, int answered, int correct) throws Exception {
        JSONObject b = new JSONObject();
        b.put("score", score);
        b.put("timeMs", timeMs);
        b.put("answered", answered);
        b.put("correct", correct);
        return call(ctx, "POST", "/rooms/" + code.trim().toUpperCase() + "/result", b);
    }

    public static void closeRoom(Context ctx, String code) throws Exception {
        call(ctx, "POST", "/rooms/" + code.trim().toUpperCase() + "/close", new JSONObject());
    }

    /** The signed-in user's id as the backend knows it, or "" when signed out. */
    public static String currentUserId(Context ctx) {
        try {
            String u = NativeBackgroundSync.getDecrypted(auth(ctx), "userJson");
            if (u == null || u.isEmpty()) return "";
            JSONObject o = new JSONObject(u);
            Object id = o.opt("id");
            if (id == null) id = o.opt("userId");
            return id == null ? "" : String.valueOf(id);
        } catch (Exception e) {
            return "";
        }
    }

    /** Folds the server's room seed string into the long that seeds the deterministic generators. */
    public static long seedOf(String seed) {
        long h = 1125899906842597L;
        if (seed == null) return h;
        for (int i = 0; i < seed.length(); i++) h = 31 * h + seed.charAt(i);
        return h;
    }
}
