package com.necpa;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Native Friends screen: friends list, discover, requests, sent requests, search, profile preview,
 * and every friend action (add / cancel / accept / reject / unfriend / block / unblock).
 *
 * It talks to the SAME backend endpoints the web Friends module already uses (no new backend, no new DB):
 *   GET    /api/friends?limit=100                    friends list            -> friends[]
 *   GET    /api/friends/requests/incoming|outgoing   pending requests        -> requests[{id,user}]
 *   POST   /api/friends/requests {userId}            send request
 *   POST   /api/friends/requests/:id/accept|reject
 *   DELETE /api/friends/requests/:id                 cancel a request you sent
 *   DELETE /api/friends/:userId                      unfriend
 *   GET    /api/friend-discovery/search|browse|suggestions
 *   POST|DELETE /api/profile/:userId/block           block / unblock (already on the backend)
 *   GET    /api/profile/blocked/list                 blocked users
 *
 * It uses the native layers that already exist:
 *   - session:   tokens come from the Keystore-encrypted necpra_native_auth prefs and are refreshed through
 *                NativeBackgroundSync.refreshSession (single-flight with the background worker). No token is
 *                ever written to WebView storage by this screen.
 *   - unlock:    same biometric / device-credential window as NecpraNativePlugin and NecpraProfileActivity.
 *   - offline:   last good lists are kept encrypted in the auth prefs (wiped by NativeBackgroundSync.clearAll
 *                on logout) and the encrypted background snapshot is the first-paint fallback. The screen
 *                always shows cached data and syncs silently in the background - no offline banner.
 *                Actions taken offline are applied locally at once and queued (encrypted); the queue is
 *                replayed in order when the network returns.
 *   - images:    avatars are fetched natively, downscaled, and cached in app-private no-backup storage.
 */
public class NecpraFriendsActivity extends AppCompatActivity {

    static final String EXTRA_SECTION = "section";
    static final String RES_SESSION_EXPIRED = "sessionExpired";
    static final String RES_CHANGED = "friendsChanged";
    static final String RES_REQUEST_COUNT = "requestCount";
    static final String RES_CHAT_USER_ID = "chatUserId";
    static final String RES_CHAT_USER_NAME = "chatUserName";
    static final String RES_CHAT_AVATAR = "chatAvatar";
    static final String RES_FRIENDS_JSON = "friendsJson";

    private static final long UNLOCK_WINDOW_MS = 15 * 60 * 1000L; // must match NecpraNativePlugin
    private static final long POLL_MS = 30_000L;                 // foreground-only refresh (no native socket yet)
    private static final String K_OWNER = "nf_owner";
    private static final String K_STATE = "nf_state";
    private static final String K_PENDING = "nf_pending";
    private static final String AVATAR_DIR = "friend_avatars";

    private static final int C_PRIMARY = Color.parseColor("#2563EB");
    private static final int C_DANGER = Color.parseColor("#DC2626");
    private static final int C_ONLINE = Color.parseColor("#16A34A");

    private static final LruCache<String, Bitmap> MEM = new LruCache<>(120);

    private static final class ApiException extends Exception {
        final int status;
        ApiException(int status, String message) { super(message); this.status = status; }
    }

    private static final class OfflineException extends Exception {
        OfflineException(Throwable cause) { super("offline", cause); }
    }

    /** Called from NativeBackgroundSync.clearAll() so a logout also removes cached avatars. */
    static void wipeAvatarCache(Context context) {
        try {
            File dir = new File(context.getNoBackupFilesDir(), AVATAR_DIR);
            File[] files = dir.listFiles();
            if (files != null) for (File f : files) f.delete();
            dir.delete();
        } catch (Throwable ignored) {}
        MEM.evictAll();
    }

    private final ExecutorService io = Executors.newSingleThreadExecutor();     // sync + actions, strictly ordered
    private final ExecutorService reads = Executors.newFixedThreadPool(2);      // discover / search
    private final ExecutorService img = Executors.newFixedThreadPool(3);        // avatars
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Object pendLock = new Object();
    private final AtomicBoolean syncQueued = new AtomicBoolean(false);
    private volatile boolean wantFull = true;
    private final AtomicInteger discoverSeq = new AtomicInteger(0);

    // palette
    private int cBg, cCard, cText, cSub, cLine;

    // views
    private LinearLayout body;
    private TextView titleView;
    private TextView backView;
    private EditText searchBox;
    private final TextView[] tabViews = new TextView[4];
    private AlertDialog preview;

    // state (UI thread only)
    private JSONArray friends = new JSONArray();
    private JSONArray incoming = new JSONArray();
    private JSONArray outgoing = new JSONArray();
    private JSONArray blocked = new JSONArray();
    private JSONArray discover = new JSONArray();
    private String discoverReason = "";
    private String discoverMode = "suggest"; // suggest | browse | search
    private boolean discoverLoading = false;
    private String discoverError = null;
    private String tab = "friends";          // friends | discover | requests | sent
    private String screen = "main";          // main | blocked
    private String query = "";
    private boolean built = false;
    private boolean changed = false;
    private boolean finishing = false;
    private boolean resumed = false;

    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback netCallback;
    private final Runnable poll = new Runnable() {
        @Override public void run() {
            if (!resumed || finishing) return;
            pullAll(false); // light poll: skips the blocked list
            ui.postDelayed(this, POLL_MS);
        }
    };
    private Runnable searchDebounce;

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        try {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        } catch (Exception ignored) {}
        super.onCreate(savedInstanceState);

        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        cBg = night ? Color.parseColor("#0B1220") : Color.parseColor("#F3F4F6");
        cCard = night ? Color.parseColor("#151E2E") : Color.WHITE;
        cText = night ? Color.parseColor("#F3F4F6") : Color.parseColor("#111827");
        cSub = night ? Color.parseColor("#9CA3AF") : Color.parseColor("#6B7280");
        cLine = night ? Color.parseColor("#243044") : Color.parseColor("#E5E7EB");

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (preview != null && preview.isShowing()) { preview.dismiss(); return; }
                if (!"main".equals(screen)) { screen = "main"; render(); return; }
                if (!"friends".equals(tab)) { selectTab("friends"); return; }
                closeScreen();
            }
        });

        cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);

        // Logged-out user: no private friend data is ever shown.
        if (!hasSession()) {
            setResult(RESULT_OK, new Intent().putExtra(RES_SESSION_EXPIRED, true));
            finishing = true;
            finish();
            return;
        }

        buildFrame();
        final String requested = getIntent() == null ? null : getIntent().getStringExtra(EXTRA_SECTION);
        ensureUnlocked(() -> {
            built = true;
            loadCached();
            tab = tabFor(requested);
            render();
            pullAll();
            ui.removeCallbacks(poll);
            ui.postDelayed(poll, POLL_MS);
        });
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (cm != null && netCallback == null) {
            netCallback = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network network) { ui.post(NecpraFriendsActivity.this::pullAll); }
            };
            try { cm.registerDefaultNetworkCallback(netCallback); } catch (Throwable ignored) { netCallback = null; }
        }
    }

    @Override
    protected void onStop() {
        if (cm != null && netCallback != null) {
            try { cm.unregisterNetworkCallback(netCallback); } catch (Throwable ignored) {}
            netCallback = null;
        }
        super.onStop();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        try {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            if (Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false);
        } catch (Throwable ignored) {}
        // Re-lock: if the unlock window ran out while the app was in the background, ask again.
        if (built && !finishing && !isUnlockedNow()) {
            body.setVisibility(View.INVISIBLE);
            ensureUnlocked(() -> body.setVisibility(View.VISIBLE));
        }
        if (built) {
            pullAll();
            ui.removeCallbacks(poll);
            ui.postDelayed(poll, POLL_MS);
        }
    }

    @Override
    protected void onPause() {
        resumed = false;
        ui.removeCallbacks(poll);
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (preview != null) { try { preview.dismiss(); } catch (Throwable ignored) {} }
        io.shutdownNow();
        reads.shutdownNow();
        img.shutdownNow();
        super.onDestroy();
    }

    private String tabFor(String requested) {
        if ("discover".equals(requested) || "requests".equals(requested) || "sent".equals(requested)) return requested;
        return "friends";
    }

    /** Hands the web shell a slim copy of the friends list so the other modules stay in step. */
    private void attachFriends(Intent r) {
        if (!changed) return;
        try {
            JSONArray out = new JSONArray();
            for (int i = 0; i < friends.length() && i < 300; i++) {
                JSONObject u = friends.optJSONObject(i);
                if (u != null) out.put(slim(u));
            }
            r.putExtra(RES_FRIENDS_JSON, out.toString());
        } catch (Throwable ignored) {}
    }

    private void closeScreen() {
        Intent r = new Intent();
        r.putExtra(RES_CHANGED, changed);
        r.putExtra(RES_REQUEST_COUNT, incoming.length());
        attachFriends(r);
        setResult(RESULT_OK, r);
        finishing = true;
        finish();
    }

    private void openChat(JSONObject u) {
        Intent r = new Intent();
        r.putExtra(RES_CHANGED, changed);
        r.putExtra(RES_REQUEST_COUNT, incoming.length());
        attachFriends(r);
        r.putExtra(RES_CHAT_USER_ID, u.optLong("id"));
        r.putExtra(RES_CHAT_USER_NAME, nameOf(u));
        r.putExtra(RES_CHAT_AVATAR, u.optString("avatar", ""));
        setResult(RESULT_OK, r);
        finishing = true;
        finish();
    }

    // ------------------------------------------------------------------
    // Session / lock (native layer, same rules as NecpraProfileActivity)
    // ------------------------------------------------------------------

    private SharedPreferences authPrefs() {
        return getSharedPreferences(NativeBackgroundSync.AUTH_PREFS, Context.MODE_PRIVATE);
    }

    private boolean hasSession() {
        try {
            SharedPreferences p = authPrefs();
            String a = NativeBackgroundSync.getDecrypted(p, "accessToken");
            String r = NativeBackgroundSync.getDecrypted(p, "refreshToken");
            return (a != null && !a.isEmpty()) || (r != null && !r.isEmpty());
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isUnlockedNow() {
        return System.currentTimeMillis() <= authPrefs().getLong("unlockedUntil", 0L);
    }

    private void extendUnlock() {
        authPrefs().edit().putLong("unlockedUntil", System.currentTimeMillis() + UNLOCK_WINDOW_MS).commit();
    }

    @SuppressWarnings("deprecation")
    private void ensureUnlocked(Runnable onOk) {
        if (isUnlockedNow()) { onOk.run(); return; }
        boolean api30 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;
        int allowed = api30
                ? (BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                : BiometricManager.Authenticators.BIOMETRIC_WEAK;
        boolean can = BiometricManager.from(this).canAuthenticate(allowed) == BiometricManager.BIOMETRIC_SUCCESS;
        if (!api30 && !can) {
            android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            can = km != null && km.isDeviceSecure();
        }
        if (!can) {
            // Same rule as the plugin: nothing to verify against -> don't lock the user out.
            extendUnlock();
            onOk.run();
            return;
        }
        BiometricPrompt prompt = new BiometricPrompt(this, ContextCompat.getMainExecutor(this),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        extendUnlock();
                        onOk.run();
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errString) {
                        setResult(RESULT_CANCELED);
                        finishing = true;
                        finish();
                    }
                });
        BiometricPrompt.PromptInfo.Builder b = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock Necpra")
                .setSubtitle("Verify your identity to open your friends")
                .setConfirmationRequired(false);
        if (api30) b.setAllowedAuthenticators(allowed);
        else b.setDeviceCredentialAllowed(true);
        prompt.authenticate(b.build());
    }

    private String currentUserId() {
        try {
            String u = NativeBackgroundSync.getDecrypted(authPrefs(), "userJson");
            if (u == null || u.isEmpty()) return "";
            JSONObject o = new JSONObject(u);
            Object id = o.opt("id");
            if (id == null) id = o.opt("userId");
            return id == null ? "" : String.valueOf(id);
        } catch (Exception e) {
            return "";
        }
    }

    private void sessionExpired() {
        if (finishing) return;
        NativeBackgroundSync.clearAll(this); // also wipes the friends cache + avatars (see clearAll)
        setResult(RESULT_OK, new Intent().putExtra(RES_SESSION_EXPIRED, true));
        finishing = true;
        finish();
    }

    // ------------------------------------------------------------------
    // Cache (encrypted, owner-checked, wiped on logout)
    // ------------------------------------------------------------------

    private static JSONArray arr(JSONObject o, String key) {
        JSONArray a = o == null ? null : o.optJSONArray(key);
        return a == null ? new JSONArray() : a;
    }

    private void loadCached() {
        JSONObject st = null;
        try {
            SharedPreferences p = authPrefs();
            String me = currentUserId();
            String owner = p.getString(K_OWNER, null) == null ? null : NativeBackgroundSync.getDecrypted(p, K_OWNER);
            if (owner != null && (me.isEmpty() || owner.equals(me))) {
                String raw = p.getString(K_STATE, null) == null ? null : NativeBackgroundSync.getDecrypted(p, K_STATE);
                if (raw != null && !raw.isEmpty()) st = new JSONObject(raw);
            } else if (owner != null) {
                // A cache that belongs to a different account is never shown.
                p.edit().remove(K_STATE).remove(K_OWNER).remove(K_PENDING).commit();
                wipeAvatarCache(this);
            }
        } catch (Exception ignored) {}

        if (st != null) {
            friends = arr(st, "friends");
            incoming = arr(st, "incoming");
            outgoing = arr(st, "outgoing");
            blocked = arr(st, "blocked");
            discover = arr(st, "discover");
            discoverReason = st.optString("discoverReason", "");
        } else {
            // First paint from the encrypted background snapshot that WorkManager already keeps.
            try {
                String snap = NativeBackgroundSync.readSnapshot(this);
                if (snap != null) {
                    JSONObject f = new JSONObject(snap).optJSONObject("friends");
                    if (f != null) friends = arr(f, "friends");
                }
            } catch (Exception ignored) {}
        }
        // Local changes made offline last time are re-applied on top of the cached lists.
        JSONArray pend = readPending();
        for (int i = 0; i < pend.length(); i++) {
            JSONObject op = pend.optJSONObject(i);
            if (op != null) applyLocally(op);
        }
    }

    private void saveCache() {
        try {
            JSONObject st = new JSONObject();
            st.put("friends", friends);
            st.put("incoming", incoming);
            st.put("outgoing", outgoing);
            st.put("blocked", blocked);
            if (!"search".equals(discoverMode)) {
                st.put("discover", discover);
                st.put("discoverReason", discoverReason);
            }
            SharedPreferences p = authPrefs();
            NativeBackgroundSync.putEncrypted(p, K_OWNER, currentUserId());
            NativeBackgroundSync.putEncrypted(p, K_STATE, st.toString());
        } catch (Exception ignored) {}
    }

    private JSONArray readPending() {
        synchronized (pendLock) {
            try {
                SharedPreferences p = authPrefs();
                if (p.getString(K_PENDING, null) == null) return new JSONArray();
                String raw = NativeBackgroundSync.getDecrypted(p, K_PENDING);
                return raw == null || raw.isEmpty() ? new JSONArray() : new JSONArray(raw);
            } catch (Exception e) {
                return new JSONArray();
            }
        }
    }

    private void writePending(JSONArray a) {
        synchronized (pendLock) {
            try {
                NativeBackgroundSync.putEncrypted(authPrefs(), K_PENDING, a == null || a.length() == 0 ? null : a.toString());
            } catch (Exception ignored) {}
        }
    }

    private void appendPending(JSONObject op) {
        synchronized (pendLock) {
            JSONArray a = readPending();
            a.put(op);
            writePending(a);
        }
    }

    private void dropFirstPending() {
        synchronized (pendLock) {
            JSONArray a = readPending();
            if (a.length() > 0) a.remove(0);
            writePending(a);
        }
    }

    // ------------------------------------------------------------------
    // Network (same backend, same token refresh as the rest of the native layer)
    // ------------------------------------------------------------------

    private JSONObject request(String method, String path, JSONObject json) throws Exception {
        boolean retried = false;
        while (true) {
            String access = NativeBackgroundSync.getDecrypted(authPrefs(), "accessToken");
            if (access == null || access.isEmpty()) access = refreshOrOffline();

            HttpURLConnection c = null;
            int status;
            String text;
            try {
                c = (HttpURLConnection) new URL(NativeBackgroundSync.backendOrigin(this) + path).openConnection();
                c.setRequestMethod(method);
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setUseCaches(false);
                c.setRequestProperty("Accept", "application/json");
                c.setRequestProperty("Authorization", "Bearer " + access);
                if (json != null) {
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    try (OutputStream out = c.getOutputStream()) {
                        out.write(json.toString().getBytes(StandardCharsets.UTF_8));
                    }
                }
                status = c.getResponseCode();
                text = NativeBackgroundSync.readText(status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream());
            } catch (java.io.IOException ioe) {
                throw new OfflineException(ioe);
            } finally {
                if (c != null) c.disconnect();
            }

            if (status == 401) {
                if (retried) throw new NativeBackgroundSync.SessionExpiredException("Unauthorized after refresh");
                retried = true;
                refreshOrOffline(); // throws SessionExpiredException if the backend rejects the refresh token
                continue;
            }
            JSONObject parsed;
            try {
                parsed = new JSONObject(text == null || text.trim().isEmpty() ? "{}" : text);
            } catch (Exception e) {
                parsed = new JSONObject();
            }
            if (status < 200 || status >= 300 || parsed.optBoolean("success", true) == false) {
                String msg = parsed.optString("message", parsed.optString("error", "Request failed (HTTP " + status + ")"));
                throw new ApiException(status >= 200 && status < 300 ? 400 : status, msg);
            }
            return parsed;
        }
    }

    private String refreshOrOffline() throws Exception {
        try {
            return NativeBackgroundSync.refreshSession(this);
        } catch (java.io.IOException ioe) {
            throw new OfflineException(ioe);
        }
    }

    // ------------------------------------------------------------------
    // Sync: replay queued offline actions, then pull the authoritative copy
    // ------------------------------------------------------------------

    private void pullAll() { pullAll(true); }

    private void pullAll(boolean full) {
        if (!built || finishing) return;
        if (full) wantFull = true;
        if (syncQueued.getAndSet(true)) return;
        try {
            io.execute(() -> {
                syncQueued.set(false);
                final boolean doFull = wantFull;
                wantFull = false;
                try {
                    flushPending();
                    if (readPending().length() > 0) return; // still offline: never overwrite local state

                    final JSONArray f = fetchFriends();
                    final JSONArray in = fetchRequests("incoming");
                    final JSONArray out = fetchRequests("outgoing");
                    final JSONArray bl = doFull ? fetchBlocked() : null;
                    ui.post(() -> {
                        if (finishing || readPending().length() > 0) return;
                        String before = friends.toString() + incoming.toString() + outgoing.toString() + blocked.toString();
                        if (f != null) friends = f;
                        if (in != null) incoming = in;
                        if (out != null) outgoing = out;
                        if (bl != null) blocked = bl;
                        String after = friends.toString() + incoming.toString() + outgoing.toString() + blocked.toString();
                        if (!before.equals(after)) changed = true;
                        saveCache();
                        if (preview == null || !preview.isShowing()) render();
                    });
                } catch (OfflineException oe) {
                    // silent: cached data stays on screen; the network callback / poll retries
                } catch (NativeBackgroundSync.SessionExpiredException se) {
                    ui.post(this::sessionExpired);
                } catch (Throwable ignored) {}
            });
        } catch (Throwable t) {
            syncQueued.set(false);
        }
    }

    private JSONArray fetchFriends() throws Exception {
        try {
            JSONObject r = request("GET", "/api/friends?limit=100&offset=0", null);
            return arr(r, "friends");
        } catch (ApiException ae) {
            return null; // keep what we have for this list
        }
    }

    private JSONArray fetchRequests(String direction) throws Exception {
        try {
            JSONObject r = request("GET", "/api/friends/requests/" + direction, null);
            JSONArray src = arr(r, "requests");
            JSONArray out = new JSONArray();
            for (int i = 0; i < src.length(); i++) {
                JSONObject item = src.optJSONObject(i);
                if (item == null) continue;
                JSONObject u = item.optJSONObject("user");
                if (u == null) continue;
                JSONObject copy = new JSONObject(u.toString());
                copy.put("_rid", item.optLong("id"));
                out.put(copy);
            }
            return out;
        } catch (ApiException ae) {
            return null;
        }
    }

    private JSONArray fetchBlocked() throws Exception {
        try {
            JSONObject r = request("GET", "/api/profile/blocked/list?limit=100", null);
            JSONObject d = r.optJSONObject("data");
            return arr(d, "blockedUsers");
        } catch (ApiException ae) {
            return null; // e.g. 503 "Blocking is unavailable" must not break the rest
        }
    }

    private void flushPending() throws Exception {
        while (true) {
            JSONArray pend = readPending();
            if (pend.length() == 0) return;
            JSONObject op = pend.optJSONObject(0);
            if (op == null) { dropFirstPending(); continue; }
            String t = op.optString("op");
            try {
                execute(op);
                dropFirstPending();
            } catch (ApiException ae) {
                if (ae.status >= 500 || ae.status == 429) return; // transient: keep and retry later
                boolean benign = (ae.status == 409 && "send".equals(t))
                        || (ae.status == 404 && !"send".equals(t) && !"block".equals(t));
                dropFirstPending(); // the server definitively answered; keeping it would block sync forever
                if (!benign) {
                    final String m = ae.getMessage();
                    ui.post(() -> toast(m));
                }
            }
        }
    }

    private void execute(JSONObject op) throws Exception {
        String t = op.optString("op");
        long uid = op.optLong("userId");
        long rid = op.optLong("requestId", 0);
        switch (t) {
            case "send":
                request("POST", "/api/friends/requests", new JSONObject().put("userId", uid));
                break;
            case "accept":
                request("POST", "/api/friends/requests/" + ridOrLookup(uid, rid) + "/accept", null);
                break;
            case "reject":
                request("POST", "/api/friends/requests/" + ridOrLookup(uid, rid) + "/reject", null);
                break;
            case "cancel":
                request("DELETE", "/api/friends/requests/" + ridOrLookup(uid, rid), null);
                break;
            case "remove":
                request("DELETE", "/api/friends/" + uid, null);
                break;
            case "block": {
                String pre = op.optString("pre", "");
                try {
                    if ("remove".equals(pre)) request("DELETE", "/api/friends/" + uid, null);
                    else if ("reject".equals(pre)) request("POST", "/api/friends/requests/" + ridOrLookup(uid, rid) + "/reject", null);
                    else if ("cancel".equals(pre)) request("DELETE", "/api/friends/requests/" + ridOrLookup(uid, rid), null);
                } catch (ApiException ignoredPre) {
                    if (ignoredPre.status >= 500 || ignoredPre.status == 429) throw ignoredPre;
                }
                request("POST", "/api/profile/" + uid + "/block", new JSONObject());
                break;
            }
            case "unblock":
                request("DELETE", "/api/profile/" + uid + "/block", null);
                break;
            default:
                break;
        }
    }

    private long ridOrLookup(long uid, long rid) throws Exception {
        if (rid > 0) return rid;
        JSONObject r = request("GET", "/api/friends/status/" + uid, null);
        JSONObject rel = r.optJSONObject("relationship");
        long found = rel == null ? 0 : rel.optLong("requestId", 0);
        if (found <= 0) throw new ApiException(404, "Request no longer exists");
        return found;
    }

    // ------------------------------------------------------------------
    // Actions (optimistic + queued, so online and offline behave the same)
    // ------------------------------------------------------------------

    private static long idOf(JSONObject u) { return u == null ? 0 : u.optLong("id"); }

    private static int indexOf(JSONArray a, long id) {
        for (int i = 0; i < a.length(); i++) if (idOf(a.optJSONObject(i)) == id) return i;
        return -1;
    }

    private static JSONArray without(JSONArray a, long id) {
        JSONArray out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && idOf(o) != id) out.put(o);
        }
        return out;
    }

    private static JSONArray prepend(JSONArray a, JSONObject first) {
        JSONArray out = new JSONArray();
        out.put(first);
        for (int i = 0; i < a.length(); i++) out.put(a.opt(i));
        return out;
    }

    private static JSONObject slim(JSONObject u) {
        JSONObject s = new JSONObject();
        try {
            for (String k : new String[]{"id", "username", "displayName", "firstName", "lastName", "avatar",
                    "bio", "isVerified", "status", "lastSeen", "mutualCount"}) {
                if (u.has(k)) s.put(k, u.get(k));
            }
        } catch (Exception ignored) {}
        return s;
    }

    /** "friend" | "incoming" | "outgoing" | "blocked" | "none" - local lists win, server hint is the fallback. */
    private String relOf(JSONObject u) {
        long id = idOf(u);
        if (indexOf(blocked, id) >= 0) return "blocked";
        if (indexOf(friends, id) >= 0) return "friend";
        if (indexOf(incoming, id) >= 0) return "incoming";
        if (indexOf(outgoing, id) >= 0) return "outgoing";
        JSONObject rel = u.optJSONObject("relationship");
        if (rel != null) {
            String s = rel.optString("status", "none");
            if ("accepted".equals(s)) return "friend";
            if ("pending".equals(s)) return "incoming".equals(rel.optString("direction")) ? "incoming" : "outgoing";
        }
        return "none";
    }

    private long ridFor(JSONObject u) {
        long id = idOf(u);
        int i = indexOf(incoming, id);
        if (i >= 0) return incoming.optJSONObject(i).optLong("_rid", 0);
        i = indexOf(outgoing, id);
        if (i >= 0) return outgoing.optJSONObject(i).optLong("_rid", 0);
        JSONObject rel = u.optJSONObject("relationship");
        return rel == null ? 0 : rel.optLong("requestId", 0);
    }

    private void applyLocally(JSONObject op) {
        String t = op.optString("op");
        long uid = op.optLong("userId");
        JSONObject user = op.optJSONObject("user");
        switch (t) {
            case "send":
                if (user != null && indexOf(outgoing, uid) < 0 && indexOf(friends, uid) < 0) outgoing.put(user);
                break;
            case "accept": {
                int i = indexOf(incoming, uid);
                JSONObject u = i >= 0 ? incoming.optJSONObject(i) : user;
                incoming = without(incoming, uid);
                if (u != null && indexOf(friends, uid) < 0) friends = prepend(friends, u);
                break;
            }
            case "reject": incoming = without(incoming, uid); break;
            case "cancel": outgoing = without(outgoing, uid); break;
            case "remove": friends = without(friends, uid); break;
            case "block":
                friends = without(friends, uid);
                incoming = without(incoming, uid);
                outgoing = without(outgoing, uid);
                if (user != null && indexOf(blocked, uid) < 0) blocked.put(user);
                break;
            case "unblock": blocked = without(blocked, uid); break;
            default: break;
        }
    }

    private void perform(String type, JSONObject u) {
        try {
            JSONObject op = new JSONObject();
            op.put("op", type);
            op.put("userId", idOf(u));
            op.put("requestId", ridFor(u));
            op.put("user", slim(u));
            if ("block".equals(type)) {
                String rel = relOf(u);
                op.put("pre", "friend".equals(rel) ? "remove" : "incoming".equals(rel) ? "reject" : "outgoing".equals(rel) ? "cancel" : "");
            }
            if ("accept".equals(type)) {
                int i = indexOf(incoming, idOf(u));
                if (i >= 0) op.put("user", slim(incoming.optJSONObject(i)));
            }
            applyLocally(op);
            appendPending(op);
            changed = true;
            saveCache();
            if (preview != null && preview.isShowing()) preview.dismiss();
            render();
            pullAll(); // flushes the queue first, then refreshes
        } catch (Exception e) {
            toast("Something went wrong. Please try again.");
        }
    }

    private void confirm(String title, String message, String yes, Runnable onYes) {
        new AlertDialog.Builder(this)
                .setTitle(title)
                .setMessage(message)
                .setPositiveButton(yes, (d, w) -> onYes.run())
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void doRemove(JSONObject u) {
        confirm("Remove friend?", "Remove " + nameOf(u) + " from your friends?", "Remove", () -> perform("remove", u));
    }

    private void doBlock(JSONObject u) {
        confirm("Block " + nameOf(u) + "?",
                "They won't be able to follow you or see your non-public content, and any friendship or pending request with them will be removed.",
                "Block", () -> perform("block", u));
    }

    // ------------------------------------------------------------------
    // Discover / search (reads only; never queued)
    // ------------------------------------------------------------------

    private boolean suggestionsEnabled() {
        try {
            String snap = NativeBackgroundSync.readSnapshot(this);
            if (snap == null) return true;
            JSONObject s = new JSONObject(snap).optJSONObject("settings");
            if (s == null) return true;
            JSONObject d = s.optJSONObject("data");
            JSONObject root = d != null && d.optJSONObject("settings") != null ? d.optJSONObject("settings")
                    : (s.optJSONObject("settings") != null ? s.optJSONObject("settings") : d != null ? d : s);
            JSONObject f = root.optJSONObject("friends");
            return f == null || f.optBoolean("friendSuggestions", true);
        } catch (Exception e) {
            return true;
        }
    }

    private void loadDiscover(String mode, String q) {
        discoverMode = mode;
        discoverError = null;
        discoverLoading = true;
        final int seq = discoverSeq.incrementAndGet();
        if ("search".equals(mode)) { discover = new JSONArray(); discoverReason = "search"; }
        render();
        final String path;
        try {
            if ("search".equals(mode)) path = "/api/friend-discovery/search?q=" + java.net.URLEncoder.encode(q, "UTF-8") + "&limit=50";
            else if ("browse".equals(mode)) path = "/api/friend-discovery/browse?offset=0&limit=60";
            else path = "/api/friend-discovery/suggestions?limit=30";
        } catch (Exception e) { return; }
        reads.execute(() -> {
            try {
                JSONObject r = request("GET", path, null);
                JSONObject d = r.optJSONObject("data");
                final JSONArray users = arr(d, "users");
                final String reason = d == null ? "" : d.optString("reason", "browse".equals(mode) ? "browse" : "");
                ui.post(() -> {
                    if (seq != discoverSeq.get() || finishing) return;
                    discover = users;
                    discoverReason = "search".equals(mode) ? "search" : reason;
                    discoverLoading = false;
                    if (!"search".equals(mode)) saveCache();
                    render();
                });
            } catch (OfflineException oe) {
                ui.post(() -> {
                    if (seq != discoverSeq.get() || finishing) return;
                    discoverLoading = false;
                    if ("search".equals(mode)) discoverError = "Search needs a connection. Try again when you're back online.";
                    render(); // suggestions/browse keep showing the last cached list
                });
            } catch (NativeBackgroundSync.SessionExpiredException se) {
                ui.post(this::sessionExpired);
            } catch (ApiException ae) {
                ui.post(() -> {
                    if (seq != discoverSeq.get() || finishing) return;
                    discoverLoading = false;
                    discoverError = ae.getMessage();
                    render();
                });
            } catch (Throwable t) {
                ui.post(() -> {
                    if (seq != discoverSeq.get() || finishing) return;
                    discoverLoading = false;
                    discoverError = "Something went wrong. Please try again.";
                    render();
                });
            }
        });
    }

    private void selectTab(String t) {
        tab = t;
        screen = "main";
        if ("discover".equals(t)) {
            String q = searchBox.getText().toString().trim();
            if (q.length() >= 2) loadDiscover("search", q);
            else if (discover.length() == 0 || "search".equals(discoverMode)) loadDiscover(suggestionsEnabled() ? "suggest" : "browse", "");
            else { render(); loadDiscover(discoverMode, ""); }
        } else {
            render();
        }
    }

    private void onSearchChanged(String text) {
        query = text.trim();
        if (searchDebounce != null) ui.removeCallbacks(searchDebounce);
        if ("friends".equals(tab) && "main".equals(screen)) { render(); return; } // instant local filter
        if (!"discover".equals(tab)) return;
        searchDebounce = () -> {
            if (query.length() >= 2) loadDiscover("search", query);
            else if ("search".equals(discoverMode)) loadDiscover(suggestionsEnabled() ? "suggest" : "browse", "");
        };
        ui.postDelayed(searchDebounce, 350);
    }

    // ------------------------------------------------------------------
    // UI
    // ------------------------------------------------------------------

    private void buildFrame() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(cBg);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(C_PRIMARY);
        bar.setPadding(dp(8), dp(8), dp(16), dp(8));

        backView = text("\u2190", 22, Color.WHITE, true);
        backView.setPadding(dp(12), dp(6), dp(16), dp(6));
        backView.setOnClickListener(v -> getOnBackPressedDispatcher().onBackPressed());
        bar.addView(backView);

        titleView = text("Friends", 19, Color.WHITE, true);
        bar.addView(titleView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView refresh = text("\u21BB", 22, Color.WHITE, true);
        refresh.setPadding(dp(12), dp(4), dp(4), dp(4));
        refresh.setOnClickListener(v -> {
            pullAll();
            if ("discover".equals(tab)) loadDiscover(discoverMode, query);
        });
        bar.addView(refresh);
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        searchBox = new EditText(this);
        searchBox.setHint("Search by username, first name or last name");
        searchBox.setHintTextColor(cSub);
        searchBox.setTextColor(cText);
        searchBox.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        searchBox.setSingleLine(true);
        searchBox.setInputType(InputType.TYPE_CLASS_TEXT);
        searchBox.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        searchBox.setPadding(dp(14), dp(10), dp(14), dp(10));
        searchBox.setBackground(rounded(cCard, cLine, 12));
        searchBox.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) { onSearchChanged(s.toString()); }
        });
        searchBox.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                String q = searchBox.getText().toString().trim();
                if (q.length() >= 2) {
                    tab = "discover";
                    screen = "main";
                    loadDiscover("search", q);
                }
                return true;
            }
            return false;
        });
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sp.setMargins(dp(12), dp(10), dp(12), dp(6));
        root.addView(searchBox, sp);

        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setBackgroundColor(cCard);
        String[] keys = {"friends", "discover", "requests", "sent"};
        for (int i = 0; i < keys.length; i++) {
            final String key = keys[i];
            TextView tv = text("", 13, cSub, true);
            tv.setGravity(Gravity.CENTER);
            tv.setPadding(dp(4), dp(12), dp(4), dp(12));
            tv.setOnClickListener(v -> selectTab(key));
            tabViews[i] = tv;
            tabs.addView(tv, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        }
        root.addView(tabs, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(12), dp(12), dp(12), dp(32));
        scroll.addView(body, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(root);

        // targetSdk 36 is edge-to-edge: keep the toolbar below the status bar and content above the nav bar.
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets sb = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(sb.left, sb.top, sb.right, Math.max(sb.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
    }

    private void updateTabs() {
        String[] keys = {"friends", "discover", "requests", "sent"};
        String[] labels = {"Friends", "Discover",
                incoming.length() > 0 ? "Requests (" + incoming.length() + ")" : "Requests",
                outgoing.length() > 0 ? "Sent (" + outgoing.length() + ")" : "Sent"};
        for (int i = 0; i < keys.length; i++) {
            boolean active = keys[i].equals(tab) && "main".equals(screen);
            tabViews[i].setText(labels[i]);
            tabViews[i].setTextColor(active ? C_PRIMARY : cSub);
            tabViews[i].setBackground(active ? underline(C_PRIMARY) : null);
        }
    }

    private void render() {
        if (body == null || !built) return;
        body.removeAllViews();
        updateTabs();
        backView.setVisibility("main".equals(screen) && "friends".equals(tab) ? View.INVISIBLE : View.VISIBLE);
        if ("blocked".equals(screen)) { titleView.setText("Blocked users"); renderBlocked(); return; }
        titleView.setText("Friends");
        switch (tab) {
            case "discover": renderDiscover(); break;
            case "requests": renderRequests(); break;
            case "sent": renderSent(); break;
            default: renderFriends(); break;
        }
    }

    private void renderFriends() {
        String q = query.toLowerCase(Locale.ROOT);
        int shown = 0;
        body.addView(sectionTitle("Your friends", friends.length() + " total"));
        for (int i = 0; i < friends.length(); i++) {
            JSONObject u = friends.optJSONObject(i);
            if (u == null) continue;
            if (!q.isEmpty() && !(nameOf(u).toLowerCase(Locale.ROOT).contains(q)
                    || u.optString("username", "").toLowerCase(Locale.ROOT).contains(q))) continue;
            body.addView(personCard(u, ""));
            shown++;
        }
        if (shown == 0) {
            body.addView(emptyBox(q.isEmpty() ? "No friends yet" : "No friends match \"" + query + "\"",
                    q.isEmpty() ? "Use Discover or Search to find people and start connecting." : "Open Discover to search everyone."));
        }
        TextView blockedLink = text("Blocked users" + (blocked.length() > 0 ? " (" + blocked.length() + ")" : ""), 14, C_PRIMARY, true);
        blockedLink.setPadding(dp(8), dp(18), dp(8), dp(8));
        blockedLink.setGravity(Gravity.CENTER);
        blockedLink.setOnClickListener(v -> { screen = "blocked"; render(); });
        body.addView(blockedLink);
    }

    private void renderDiscover() {
        LinearLayout chips = new LinearLayout(this);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        chips.addView(chip("Suggested for you", !"browse".equals(discoverMode) && !"search".equals(discoverMode),
                () -> { searchBox.setText(""); loadDiscover("suggest", ""); }));
        chips.addView(chip("Browse all users", "browse".equals(discoverMode),
                () -> { searchBox.setText(""); loadDiscover("browse", ""); }));
        body.addView(chips);

        String heading = "search".equals(discoverMode) ? "Search results"
                : "mutuals".equals(discoverReason) ? "People you may know" : "Discover people";
        body.addView(sectionTitle(heading, discover.length() + " shown"));

        if (discoverLoading && discover.length() == 0) {
            body.addView(emptyBox("Loading\u2026", ""));
            return;
        }
        if (discoverError != null && discover.length() == 0) {
            body.addView(emptyBox(discoverError, ""));
            return;
        }
        int shown = 0;
        for (int i = 0; i < discover.length(); i++) {
            JSONObject u = discover.optJSONObject(i);
            if (u == null) continue;
            int mutual = u.optInt("mutualCount", 0);
            body.addView(personCard(u, mutual > 0 ? mutual + " mutual friend" + (mutual == 1 ? "" : "s") : ""));
            shown++;
        }
        if (shown == 0) body.addView(emptyBox("No people found", "Try another username."));
    }

    private void renderRequests() {
        body.addView(sectionTitle("Incoming requests", String.valueOf(incoming.length())));
        if (incoming.length() == 0) { body.addView(emptyBox("No pending requests.", "")); return; }
        for (int i = 0; i < incoming.length(); i++) {
            JSONObject u = incoming.optJSONObject(i);
            if (u != null) body.addView(personCard(u, ""));
        }
    }

    private void renderSent() {
        body.addView(sectionTitle("Sent requests", String.valueOf(outgoing.length())));
        if (outgoing.length() == 0) { body.addView(emptyBox("You have no sent requests.", "")); return; }
        for (int i = 0; i < outgoing.length(); i++) {
            JSONObject u = outgoing.optJSONObject(i);
            if (u != null) body.addView(personCard(u, ""));
        }
    }

    private void renderBlocked() {
        body.addView(sectionTitle("Blocked users", String.valueOf(blocked.length())));
        if (blocked.length() == 0) { body.addView(emptyBox("You haven't blocked anyone.", "")); return; }
        for (int i = 0; i < blocked.length(); i++) {
            JSONObject u = blocked.optJSONObject(i);
            if (u != null) body.addView(personCard(u, ""));
        }
    }

    // ---- person card ----

    private LinearLayout personCard(JSONObject u, String extra) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(12), dp(12), dp(12), dp(10));
        card.setBackground(rounded(cCard, cLine, 16));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 0, 0, dp(10));
        card.setLayoutParams(lp);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(avatarView(u, 48), new LinearLayout.LayoutParams(dp(48), dp(48)));
        top.addView(infoColumn(u, extra, false), infoParams());
        card.addView(top);

        LinearLayout actions = actionRow(u, false);
        if (actions.getChildCount() > 0) card.addView(actions);
        card.setOnClickListener(v -> showPreview(u, extra));
        return card;
    }

    private LinearLayout.LayoutParams infoParams() {
        LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        ip.setMargins(dp(12), 0, 0, 0);
        return ip;
    }

    private LinearLayout infoColumn(JSONObject u, String extra, boolean big) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        String name = nameOf(u) + (u.optBoolean("isVerified", false) ? "  \u2713" : "");
        TextView n = text(name, big ? 20 : 16, cText, true);
        n.setSingleLine(true);
        n.setEllipsize(android.text.TextUtils.TruncateAt.END);
        col.addView(n);
        String un = u.optString("username", "");
        if (!un.isEmpty()) col.addView(text("@" + un, 13, cSub, false));
        String bio = u.optString("bio", "");
        if (!bio.isEmpty() && !"null".equals(bio)) {
            TextView b = text(bio, 12, cSub, false);
            if (!big) { b.setMaxLines(2); b.setEllipsize(android.text.TextUtils.TruncateAt.END); }
            b.setPadding(0, dp(3), 0, 0);
            col.addView(b);
        }
        String rel = relOf(u);
        if (!"blocked".equals(rel)) {
            boolean online = "online".equals(u.optString("status", ""));
            String presence = online ? "\u25CF Online" : lastSeenText(u.optString("lastSeen", ""));
            String line = presence + ("friend".equals(rel) ? " \u00B7 Friends" : "") + (extra.isEmpty() ? "" : " \u00B7 " + extra);
            TextView p = text(line, 11, online ? C_ONLINE : cSub, false);
            p.setPadding(0, dp(4), 0, 0);
            col.addView(p);
        }
        return col;
    }

    private LinearLayout actionRow(JSONObject u, boolean inPreview) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.END);
        row.setPadding(0, dp(10), 0, 0);
        String rel = relOf(u);
        switch (rel) {
            case "friend":
                row.addView(smallBtn("Message", true, v -> openChat(u)));
                row.addView(smallBtn("Remove", false, v -> doRemove(u), C_DANGER));
                break;
            case "incoming":
                row.addView(smallBtn("Accept", true, v -> perform("accept", u)));
                row.addView(smallBtn("Decline", false, v -> perform("reject", u)));
                break;
            case "outgoing":
                row.addView(smallBtn("Cancel request", false, v -> perform("cancel", u)));
                break;
            case "blocked":
                row.addView(smallBtn("Unblock", true, v -> perform("unblock", u)));
                break;
            default:
                row.addView(smallBtn("+ Add friend", true, v -> perform("send", u)));
                break;
        }
        if (inPreview && !"blocked".equals(rel)) row.addView(smallBtn("Block", false, v -> doBlock(u), C_DANGER));
        return row;
    }

    // ---- profile preview ----

    private void showPreview(JSONObject u, String extra) {
        if (preview != null && preview.isShowing()) preview.dismiss();
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(20), dp(20), dp(8));
        box.setBackgroundColor(cCard);

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.addView(avatarView(u, 72), new LinearLayout.LayoutParams(dp(72), dp(72)));
        head.addView(infoColumn(u, extra, true), infoParams());
        box.addView(head);

        String rel = relOf(u);
        String relText = "friend".equals(rel) ? "You are friends"
                : "incoming".equals(rel) ? "Sent you a friend request"
                : "outgoing".equals(rel) ? "Friend request sent"
                : "blocked".equals(rel) ? "You blocked this person" : "Not connected";
        TextView rt = text(relText, 13, cSub, true);
        rt.setPadding(0, dp(14), 0, 0);
        box.addView(rt);

        box.addView(actionRow(u, true));

        TextView close = text("Close", 14, C_PRIMARY, true);
        close.setGravity(Gravity.CENTER);
        close.setPadding(dp(8), dp(16), dp(8), dp(12));
        box.addView(close);

        preview = new AlertDialog.Builder(this).setView(box).create();
        close.setOnClickListener(v -> preview.dismiss());
        preview.show();
    }

    // ---- small view helpers ----

    private View avatarView(JSONObject u, int sizeDp) {
        FrameLayout f = new FrameLayout(this);
        final GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#DBEAFE"));
        bg.setCornerRadius(dp(sizeDp) * 0.3f);
        f.setBackground(bg);
        final int radius = Math.round(dp(sizeDp) * 0.3f);
        TextView initial = text(initialOf(u), sizeDp > 60 ? 28 : 19, C_PRIMARY, true);
        initial.setGravity(Gravity.CENTER);
        f.addView(initial, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ImageView iv = new ImageView(this);
        iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
        iv.setClipToOutline(true);
        iv.setOutlineProvider(new ViewOutlineProvider() {
            @Override public void getOutline(View view, Outline outline) {
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), radius);
            }
        });
        f.addView(iv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        loadAvatar(iv, initial, u.optString("avatar", ""));
        return f;
    }

    private String mediaUrl(String raw) {
        if (raw == null) return null;
        raw = raw.trim();
        if (raw.isEmpty() || "null".equals(raw)) return null;
        if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
        if (raw.startsWith("//")) return "https:" + raw;
        String origin = NativeBackgroundSync.backendOrigin(this);
        return raw.startsWith("/") ? origin + raw : origin + "/" + raw;
    }

    private void loadAvatar(final ImageView iv, final TextView initial, String rawUrl) {
        final String url = mediaUrl(rawUrl);
        if (url == null) return;
        Bitmap cached = MEM.get(url);
        if (cached != null) { iv.setImageBitmap(cached); initial.setVisibility(View.GONE); return; }
        iv.setTag(url);
        try {
            img.execute(() -> {
                Bitmap b = diskOrNet(url);
                if (b == null) return;
                MEM.put(url, b);
                ui.post(() -> {
                    if (url.equals(iv.getTag())) { iv.setImageBitmap(b); initial.setVisibility(View.GONE); }
                });
            });
        } catch (Throwable ignored) {}
    }

    private Bitmap diskOrNet(String url) {
        try {
            File dir = new File(getNoBackupFilesDir(), AVATAR_DIR);
            if (!dir.exists()) dir.mkdirs();
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] h = md.digest(url.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte x : h) sb.append(String.format(Locale.ROOT, "%02x", x));
            File f = new File(dir, sb.toString());
            if (f.exists()) {
                Bitmap b = BitmapFactory.decodeFile(f.getAbsolutePath());
                if (b != null) return b;
                f.delete();
            }
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            byte[] bytes;
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n, total = 0;
                while ((n = in.read(buf)) >= 0) {
                    total += n;
                    if (total > 4 * 1024 * 1024) return null;
                    bo.write(buf, 0, n);
                }
                bytes = bo.toByteArray();
            } finally {
                c.disconnect();
            }
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
            int sample = 1;
            while (o.outWidth / (sample * 2) >= 192 && o.outHeight / (sample * 2) >= 192) sample *= 2;
            o = new BitmapFactory.Options();
            o.inSampleSize = sample;
            Bitmap b = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
            if (b == null) return null;
            try (FileOutputStream out = new FileOutputStream(f)) {
                b.compress(Bitmap.CompressFormat.PNG, 90, out);
            } catch (Exception ignored) {}
            return b;
        } catch (Throwable t) {
            return null;
        }
    }

    private TextView smallBtn(String label, boolean primary, View.OnClickListener l) {
        return smallBtn(label, primary, l, cText);
    }

    private TextView smallBtn(String label, boolean primary, View.OnClickListener l, int textColor) {
        TextView b = text(label, 13, primary ? Color.WHITE : textColor, true);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(14), dp(8), dp(14), dp(8));
        b.setBackground(primary ? rounded(C_PRIMARY, C_PRIMARY, 11) : rounded(cCard, cLine, 11));
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(8), 0, 0, 0);
        b.setLayoutParams(lp);
        return b;
    }

    private TextView chip(String label, boolean active, Runnable onTap) {
        TextView c = text(label, 12, active ? Color.WHITE : cText, false);
        c.setPadding(dp(12), dp(7), dp(12), dp(7));
        c.setBackground(active ? rounded(cText, cText, 99) : rounded(cCard, cLine, 99));
        if (active && cText == Color.parseColor("#F3F4F6")) c.setTextColor(Color.parseColor("#0B1220"));
        c.setOnClickListener(v -> onTap.run());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 0, dp(8), dp(10));
        c.setLayoutParams(lp);
        return c;
    }

    private View sectionTitle(String title, String count) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(dp(4), dp(2), dp(4), dp(10));
        row.addView(text(title, 15, cText, true), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(text(count, 12, cSub, false));
        return row;
    }

    private View emptyBox(String title, String sub) {
        LinearLayout b = new LinearLayout(this);
        b.setOrientation(LinearLayout.VERTICAL);
        b.setGravity(Gravity.CENTER_HORIZONTAL);
        b.setPadding(dp(20), dp(28), dp(20), dp(28));
        b.setBackground(rounded(cCard, cLine, 15));
        TextView t = text(title, 15, cText, true);
        t.setGravity(Gravity.CENTER);
        b.addView(t);
        if (!sub.isEmpty()) {
            TextView s = text(sub, 13, cSub, false);
            s.setGravity(Gravity.CENTER);
            s.setPadding(0, dp(6), 0, 0);
            b.addView(s);
        }
        return b;
    }

    private GradientDrawable rounded(int fill, int stroke, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(dp(radiusDp));
        g.setStroke(dp(1), stroke);
        return g;
    }

    private GradientDrawable underline(int color) {
        return new GradientDrawable() {
            { setColor(Color.TRANSPARENT); }
            @Override public void draw(android.graphics.Canvas canvas) {
                android.graphics.Paint p = new android.graphics.Paint();
                p.setColor(color);
                canvas.drawRect(0, getBounds().bottom - dp(3), getBounds().right, getBounds().bottom, p);
            }
        };
    }

    private static String nameOf(JSONObject u) {
        String d = u.optString("displayName", "");
        if (d.isEmpty() || "null".equals(d)) d = u.optString("username", "");
        return d.isEmpty() ? "User" : d;
    }

    private static String initialOf(JSONObject u) {
        String n = nameOf(u);
        return n.isEmpty() ? "?" : n.substring(0, 1).toUpperCase(Locale.ROOT);
    }

    private static String lastSeenText(String iso) {
        if (iso == null || iso.length() < 19 || "null".equals(iso)) return "Offline";
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.ROOT);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = f.parse(iso.substring(0, 19));
            if (d == null) return "Offline";
            long mins = Math.max(0, (System.currentTimeMillis() - d.getTime()) / 60000L);
            if (mins < 1) return "Last seen just now";
            if (mins < 60) return "Last seen " + mins + " min ago";
            if (mins < 1440) return "Last seen " + (mins / 60) + " h ago";
            return "Last seen " + (mins / 1440) + " d ago";
        } catch (Exception e) {
            return "Offline";
        }
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private void toast(String m) { Toast.makeText(this, m, Toast.LENGTH_SHORT).show(); }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }
}
