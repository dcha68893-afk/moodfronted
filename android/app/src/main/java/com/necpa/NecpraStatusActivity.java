package com.necpa;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaMetadataRetriever;
import android.media.MediaPlayer;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.OpenableColumns;
import android.text.InputFilter;
import android.text.InputType;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.VideoView;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native Status module (Android APK only). Replaces the WebView status.html / ProfessionalStatus.js surface for
 * everything the web module does day to day: the friends / discover feed (Recent + Viewed sections, always visible),
 * the full-screen story viewer (text / image / video / poll / link), reactions + private replies, "who viewed" for
 * your own statuses, delete / highlight / report / share, and the composer (text, photo, video, poll, link).
 *
 * Same rules as the other native screens:
 *   - backend is unchanged: every call is the existing /api/status/* contract, same bodies the web module sends;
 *   - session: tokens come from the Keystore-encrypted auth prefs and are refreshed through
 *              NativeBackgroundSync.refreshSession (single flight with the background worker);
 *   - offline: the last good feed is kept encrypted in the auth prefs (owner-checked, wiped with the session) and is
 *              painted first; the network only updates it;
 *   - private reaction / reply copy to the creator goes through NecpraMessageRepository.sendStatusInteraction (native
 *              owns DM crypto), exactly like the web module does through NecpraNative.sendStatusInteraction.
 * Vibes (the short-video feed) is not part of this screen: the "Vibes" button hands back to the web module.
 */
public class NecpraStatusActivity extends AppCompatActivity implements NecpraRealtime.StatusListener {

    static final String EXTRA_SECTION = "section";      // "feed" (default) | "compose"
    static final String EXTRA_USER_ID = "userId";       // open this person's statuses straight away
    static final String RES_SESSION_EXPIRED = "sessionExpired";
    static final String RES_OPEN_VIBES = "openVibes";
    static final String RES_CHANGED = "statusChanged";

    private static final long POLL_MS = 20_000L;
    private static final long MAX_STORY_MS = 20_000L;
    private static final String K_OWNER = "ns_owner";
    private static final String K_STATE = "ns_state";

    private static final String[] BACKGROUNDS = {
            "linear-gradient(135deg,#2563eb,#7c3aed)", "linear-gradient(135deg,#ec4899,#f97316)",
            "linear-gradient(135deg,#06b6d4,#2563eb)", "linear-gradient(135deg,#22c55e,#14b8a6)",
            "linear-gradient(135deg,#f59e0b,#ef4444)", "linear-gradient(135deg,#111827,#475569)",
            "linear-gradient(135deg,#7c3aed,#db2777)", "linear-gradient(135deg,#0f172a,#0ea5e9)"};
    private static final String[] REACTIONS = {"\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDC4F", "\uD83D\uDD25"};
    private static final int[] DURATIONS = {7, 10, 15, 20};

    private static final LruCache<String, Bitmap> BITMAPS = new LruCache<String, Bitmap>(24 * 1024 * 1024) {
        @Override protected int sizeOf(String k, Bitmap b) { return b.getByteCount(); }
    };

    /** Called from NativeBackgroundSync.clearAll(): the encrypted feed lives in the auth prefs (cleared there). */
    static void wipeCaches(Context c) { BITMAPS.evictAll(); }

    private static final class ApiException extends Exception {
        final int status;
        ApiException(int status, String message) { super(message); this.status = status; }
    }

    private static final class OfflineException extends Exception {
        OfflineException(Throwable cause) { super("offline", cause); }
    }

    private interface BitmapCb { void done(Bitmap b); }

    /** One person with their (oldest -> newest) statuses. */
    private static final class Person {
        long userId;
        JSONObject owner;
        final List<JSONObject> items = new ArrayList<>();
        boolean unseen;
        long newest;
    }

    // ------------------------------------------------------------------ state

    private final ExecutorService io = Executors.newSingleThreadExecutor();     // writes + feed sync, strictly ordered
    private final ExecutorService reads = Executors.newFixedThreadPool(2);      // poll results / viewers
    private final ExecutorService img = Executors.newFixedThreadPool(3);        // bitmaps
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final AtomicBoolean syncQueued = new AtomicBoolean(false);

    private NecpraConversationsActivity.Theme t;
    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback netCallback;

    private FrameLayout root;
    private LinearLayout page;
    private LinearLayout list;
    private TextView banner;
    private final TextView[] tabViews = new TextView[2];

    private JSONArray mine = new JSONArray();
    private JSONArray friends = new JSONArray();
    private JSONArray discover = new JSONArray();
    private final Set<String> seen = new HashSet<>();
    private final Set<String> viewSent = new HashSet<>();
    private String tab = "friends";            // friends | discover
    private String meId = "";
    private String meName = "";
    private String meAvatar = "";
    private long pendingOpenUser = 0L;
    private boolean built, finishing, resumed, changed, discoverLoaded;

    private final Runnable poll = new Runnable() {
        @Override public void run() {
            if (!resumed || finishing) return;
            pullAll();
            ui.postDelayed(this, POLL_MS);
        }
    };

    // viewer
    private FrameLayout viewer;
    private List<JSONObject> vGroup = new ArrayList<>();
    private int vIndex;
    private boolean vOwn, vHold, vBlocked, vLoading;
    private long vElapsed, vDuration, vLast;
    private View[] vFills = new View[0];
    private VideoView vVideo;
    private MediaPlayer vMp;
    private boolean vMuted;
    private int vToken;                         // invalidates async results of a story that was already left
    private EditText vReply;
    private final Runnable vTick = new Runnable() {
        @Override public void run() {
            if (viewer == null || finishing) return;
            long now = SystemClock.uptimeMillis();
            long dt = now - vLast;
            vLast = now;
            if (!vHold && !vBlocked && !vLoading && resumed && vDuration > 0) vElapsed += Math.min(dt, 200);
            if (vIndex >= 0 && vIndex < vFills.length && vDuration > 0) {
                vFills[vIndex].setScaleX(Math.min(1f, (float) vElapsed / (float) vDuration));
            }
            if (vDuration > 0 && vElapsed >= vDuration) { nextStory(); return; }
            ui.postDelayed(this, 50);
        }
    };

    // composer
    private FrameLayout composer;
    private int cTab;                           // 0 text | 1 media | 2 poll | 3 link
    private EditText cText, cCaption, cPollQ, cLink, cLinkCaption;
    private final List<EditText> cPollOpts = new ArrayList<>();
    private LinearLayout cPollBox;
    private FrameLayout cTextBox;
    private ImageView cPreview;
    private TextView cMediaInfo, cPublish, cPrivacyBtn, cDurationBtn, cTargetBtn;
    private final TextView[] cTabViews = new TextView[4];
    private final View[] cPanes = new View[4];
    private String cBg = BACKGROUNDS[0];
    private Uri cMediaUri;
    private boolean cMediaVideo;
    private long cVideoMs;
    private String cPrivacy = "all_contacts";
    private String cTarget = "status";
    private int cDurationIdx = 0;
    private boolean publishing;

    private final ActivityResultLauncher<String> pickPhoto =
            registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> onMediaPicked(uri, false));
    private final ActivityResultLauncher<String> pickVideo =
            registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> onMediaPicked(uri, true));

    // ------------------------------------------------------------------ lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        t = new NecpraConversationsActivity.Theme(this);
        cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);

        if (!hasSession()) {
            setResult(RESULT_OK, new Intent().putExtra(RES_SESSION_EXPIRED, true));
            finishing = true;
            finish();
            return;
        }
        readMe();

        root = new FrameLayout(this);
        root.setBackgroundColor(t.bg);
        setContentView(root);
        NecpraConversationsActivity.applyInsets(root);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { onBack(); }
        });

        buildPage();
        built = true;
        loadCached();
        render();

        Intent in = getIntent();
        if (in != null) {
            pendingOpenUser = in.getLongExtra(EXTRA_USER_ID, 0L);
            if ("compose".equals(in.getStringExtra(EXTRA_SECTION))) openComposer();
        }
        pullAll();
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (cm != null && netCallback == null && built) {
            netCallback = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network network) { ui.post(NecpraStatusActivity.this::pullAll); }
            };
            try { cm.registerDefaultNetworkCallback(netCallback); } catch (Throwable ignored) { netCallback = null; }
        }
    }

    @Override
    protected void onStop() {
        if (cm != null && netCallback != null) {
            try { cm.unregisterNetworkCallback(netCallback); } catch (Throwable ignored) { }
            netCallback = null;
        }
        super.onStop();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        if (!built || finishing) return;
        try {
            NecpraRealtime rt = NecpraRealtime.get(this);
            rt.addStatusListener(this);
            rt.start();
        } catch (Throwable ignored) { }
        if (vVideo != null && viewer != null && !vHold) { try { vVideo.start(); } catch (Throwable ignored) { } }
        pullAll();
        ui.removeCallbacks(poll);
        ui.postDelayed(poll, POLL_MS);
    }

    @Override
    protected void onPause() {
        resumed = false;
        ui.removeCallbacks(poll);
        if (vVideo != null) { try { vVideo.pause(); } catch (Throwable ignored) { } }
        if (built) {
            try {
                NecpraRealtime rt = NecpraRealtime.get(this);
                rt.removeStatusListener(this);
                rt.stop();
            } catch (Throwable ignored) { }
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        stopMedia();
        io.shutdownNow();
        reads.shutdownNow();
        img.shutdownNow();
        super.onDestroy();
    }

    @Override
    public void onStatusEvent(String name) {
        if (!resumed || finishing) return;
        pullAll();
    }

    private void onBack() {
        if (composer != null) { requestCloseComposer(); return; }
        if (viewer != null) { closeViewer(); return; }
        if (!"friends".equals(tab)) { selectTab("friends"); return; }
        closeScreen(false);
    }

    private void closeScreen(boolean openVibes) {
        if (finishing) return;
        Intent r = new Intent();
        r.putExtra(RES_CHANGED, changed);
        r.putExtra(RES_OPEN_VIBES, openVibes);
        setResult(RESULT_OK, r);
        finishing = true;
        finish();
    }

    private void sessionExpired() {
        if (finishing) return;
        NativeBackgroundSync.clearAll(this);
        setResult(RESULT_OK, new Intent().putExtra(RES_SESSION_EXPIRED, true));
        finishing = true;
        finish();
    }

    // ------------------------------------------------------------------ session

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

    private void readMe() {
        try {
            String u = NativeBackgroundSync.getDecrypted(authPrefs(), "userJson");
            if (u == null || u.isEmpty()) return;
            JSONObject o = new JSONObject(u);
            Object id = o.opt("id");
            if (id == null) id = o.opt("userId");
            meId = id == null ? "" : String.valueOf(id);
            meName = firstNonEmpty(str(o, "displayName"), str(o, "username"), str(o, "name"));
            meAvatar = firstNonEmpty(str(o, "avatar"), str(o, "pictureUrl"));
        } catch (Exception ignored) { }
    }

    private boolean isMine(JSONObject st) {
        if (st == null) return false;
        String uid = String.valueOf(st.opt("userId"));
        if ("null".equals(uid) || uid.isEmpty()) {
            JSONObject o = st.optJSONObject("owner");
            uid = o == null ? "" : String.valueOf(o.opt("id"));
        }
        return !meId.isEmpty() && meId.equals(uid);
    }

    // ------------------------------------------------------------------ small helpers

    private static String str(JSONObject o, String k) {
        if (o == null || o.isNull(k)) return "";
        String v = o.optString(k, "");
        return "null".equals(v) ? "" : v;
    }

    private static String firstNonEmpty(String... v) {
        for (String s : v) if (s != null && !s.isEmpty()) return s;
        return "";
    }

    private int dp(float v) { return NecpraConversationsActivity.dp(this, v); }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView tv = new TextView(this);
        tv.setText(s);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        tv.setTextColor(color);
        if (bold) tv.setTypeface(Typeface.DEFAULT_BOLD);
        return tv;
    }

    private void toast(String m) { if (!finishing) Toast.makeText(this, m, Toast.LENGTH_SHORT).show(); }

    private static long parseIso(String s) {
        if (s == null || s.isEmpty()) return 0;
        String[] fmts = {"yyyy-MM-dd'T'HH:mm:ss.SSSX", "yyyy-MM-dd'T'HH:mm:ssX"};
        for (String f : fmts) {
            try {
                SimpleDateFormat d = new SimpleDateFormat(f, Locale.US);
                d.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date r = d.parse(s);
                if (r != null) return r.getTime();
            } catch (Exception ignored) { }
        }
        return 0;
    }

    private static String ago(long ts) {
        if (ts <= 0) return "";
        long m = Math.max(0, (System.currentTimeMillis() - ts) / 60_000L);
        if (m < 1) return "just now";
        if (m < 60) return m + "m ago";
        long h = m / 60;
        if (h < 24) return h + "h ago";
        return (h / 24) + "d ago";
    }

    private static String idOf(JSONObject st) { return String.valueOf(st.opt("id")); }

    private String ownerName(JSONObject st) {
        JSONObject o = st.optJSONObject("owner");
        String n = o == null ? "" : firstNonEmpty(str(o, "displayName"), str(o, "username"));
        return n.isEmpty() ? "User" : n;
    }

    private String ownerAvatar(JSONObject st) {
        JSONObject o = st.optJSONObject("owner");
        return o == null ? "" : str(o, "avatar");
    }

    private boolean isSeen(JSONObject st) {
        return isMine(st) || st.optBoolean("viewedByMe", false) || seen.contains(idOf(st));
    }

    private static boolean live(JSONObject st) {
        long exp = parseIso(str(st, "expiresAt"));
        return exp <= 0 || exp > System.currentTimeMillis();
    }

    private static String mediaUrl(JSONObject st) {
        String u = firstNonEmpty(str(st, "mediaUrl"), str(st, "media_url"));
        if (u.isEmpty()) {
            JSONObject m = st.optJSONObject("media");
            if (m != null) u = firstNonEmpty(str(m, "url"), str(m, "secure_url"));
        }
        return u;
    }

    private static String typeOf(JSONObject st) {
        String ty = str(st, "type");
        if (!ty.isEmpty()) return ty;
        String mime = str(st, "mediaMime");
        if (mime.startsWith("video/")) return "video";
        if (mime.startsWith("image/")) return "image";
        return "text";
    }

    /** Cloudinary: ask for a screen-sized image instead of the full original. */
    private static String screenImage(String url) {
        if (url.contains("res.cloudinary.com") && url.contains("/upload/") && !url.contains("/upload/w_")) {
            return url.replace("/upload/", "/upload/w_1080,c_limit,q_auto/");
        }
        return url;
    }

    private GradientDrawable gradientFor(String css) {
        int a = 0xFF2563EB, b = 0xFF7C3AED;
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("#([0-9a-fA-F]{6})").matcher(css == null ? "" : css);
            List<Integer> cols = new ArrayList<>();
            while (m.find() && cols.size() < 2) cols.add(0xFF000000 | Integer.parseInt(m.group(1), 16));
            if (cols.size() == 1) { a = cols.get(0); b = a; }
            else if (cols.size() == 2) { a = cols.get(0); b = cols.get(1); }
            else if (css != null && css.matches("^#[0-9a-fA-F]{6}$")) { a = Color.parseColor(css); b = a; }
        } catch (Exception ignored) { }
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{a, b});
        return g;
    }

    private void hideKeyboard(View v) {
        try {
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null && v != null) imm.hideSoftInputFromWindow(v.getWindowToken(), 0);
        } catch (Throwable ignored) { }
    }

    private void fetchBitmap(final String url, final int maxPx, final BitmapCb cb) {
        final String key = url + "@" + maxPx;
        Bitmap hit = BITMAPS.get(key);
        if (hit != null) { cb.done(hit); return; }
        if (url == null || !url.startsWith("https://")) { cb.done(null); return; }
        try {
            img.execute(() -> {
                Bitmap b = null;
                HttpURLConnection h = null;
                try {
                    h = (HttpURLConnection) new URL(url).openConnection();
                    h.setConnectTimeout(10000);
                    h.setReadTimeout(20000);
                    byte[] data = readAll(h.getInputStream(), 16 << 20);
                    BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(data, 0, data.length, o);
                    int sample = 1;
                    while (Math.max(o.outWidth, o.outHeight) / (sample * 2) >= maxPx) sample *= 2;
                    BitmapFactory.Options o2 = new BitmapFactory.Options();
                    o2.inSampleSize = sample;
                    b = BitmapFactory.decodeByteArray(data, 0, data.length, o2);
                } catch (Throwable ignored) {
                } finally {
                    if (h != null) h.disconnect();
                }
                final Bitmap fb = b;
                if (fb != null) BITMAPS.put(key, fb);
                ui.post(() -> { if (!finishing) cb.done(fb); });
            });
        } catch (Throwable rejected) {
            cb.done(null);
        }
    }

    private static byte[] readAll(InputStream in, int max) throws IOException {
        try (InputStream is = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) >= 0) {
                out.write(buf, 0, n);
                if (out.size() > max) throw new IOException("too large");
            }
            return out.toByteArray();
        }
    }

    // ------------------------------------------------------------------ cache

    private void loadCached() {
        try {
            SharedPreferences p = authPrefs();
            String owner = p.getString(K_OWNER, null) == null ? null : NativeBackgroundSync.getDecrypted(p, K_OWNER);
            if (owner != null && (meId.isEmpty() || owner.equals(meId))) {
                String raw = p.getString(K_STATE, null) == null ? null : NativeBackgroundSync.getDecrypted(p, K_STATE);
                if (raw != null && !raw.isEmpty()) {
                    JSONObject st = new JSONObject(raw);
                    mine = liveOnly(st.optJSONArray("mine"));
                    friends = liveOnly(st.optJSONArray("friends"));
                    discover = liveOnly(st.optJSONArray("discover"));
                    JSONArray s = st.optJSONArray("seen");
                    if (s != null) for (int i = 0; i < s.length(); i++) seen.add(s.optString(i));
                }
            } else if (owner != null) {
                p.edit().remove(K_STATE).remove(K_OWNER).commit();   // another account's cache is never shown
            }
        } catch (Exception ignored) { }
    }

    private void saveCache() {
        try {
            JSONObject st = new JSONObject();
            st.put("mine", mine);
            st.put("friends", friends);
            st.put("discover", discover);
            JSONArray s = new JSONArray();
            int skip = Math.max(0, seen.size() - 500), i = 0;
            for (String id : seen) { if (i++ >= skip) s.put(id); }
            st.put("seen", s);
            SharedPreferences p = authPrefs();
            NativeBackgroundSync.putEncrypted(p, K_OWNER, meId);
            NativeBackgroundSync.putEncrypted(p, K_STATE, st.toString());
        } catch (Exception ignored) { }
    }

    private static JSONArray liveOnly(JSONArray a) {
        JSONArray out = new JSONArray();
        if (a == null) return out;
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && live(o)) out.put(o);
        }
        return out;
    }

    // ------------------------------------------------------------------ network

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
            } catch (IOException ioe) {
                throw new OfflineException(ioe);
            } finally {
                if (c != null) c.disconnect();
            }

            if (status == 401) {
                if (retried) throw new NativeBackgroundSync.SessionExpiredException("Unauthorized after refresh");
                retried = true;
                refreshOrOffline();
                continue;
            }
            return parseResponse(status, text);
        }
    }

    private static JSONObject parseResponse(int status, String text) throws ApiException {
        JSONObject parsed;
        try {
            parsed = new JSONObject(text == null || text.trim().isEmpty() ? "{}" : text);
        } catch (Exception e) {
            parsed = new JSONObject();
        }
        if (status < 200 || status >= 300 || !parsed.optBoolean("success", true)) {
            String msg = parsed.optString("message", parsed.optString("error", "Request failed (HTTP " + status + ")"));
            throw new ApiException(status >= 200 && status < 300 ? 400 : status, msg);
        }
        return parsed;
    }

    private String refreshOrOffline() throws Exception {
        try {
            return NativeBackgroundSync.refreshSession(this);
        } catch (IOException ioe) {
            throw new OfflineException(ioe);
        }
    }

    private interface Src { InputStream open() throws IOException; }

    /** Streams one file (plus small text fields) as multipart/form-data; same auth + single refresh as {@link #request}. */
    private JSONObject uploadMultipart(String path, String field, String fileName, String mime, Src src, Map<String, String> fields) throws Exception {
        boolean retried = false;
        while (true) {
            String access = NativeBackgroundSync.getDecrypted(authPrefs(), "accessToken");
            if (access == null || access.isEmpty()) access = refreshOrOffline();
            String boundary = "----necpra" + Long.toHexString(System.nanoTime());
            HttpURLConnection c = null;
            int status;
            String text;
            try {
                c = (HttpURLConnection) new URL(NativeBackgroundSync.backendOrigin(this) + path).openConnection();
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setConnectTimeout(15000);
                c.setReadTimeout(180000);
                c.setChunkedStreamingMode(16 * 1024);
                c.setRequestProperty("Accept", "application/json");
                c.setRequestProperty("Authorization", "Bearer " + access);
                c.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                try (OutputStream out = c.getOutputStream(); InputStream in = src.open()) {
                    if (fields != null) {
                        for (Map.Entry<String, String> e : fields.entrySet()) {
                            out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + e.getKey() + "\"\r\n\r\n"
                                    + e.getValue() + "\r\n").getBytes(StandardCharsets.UTF_8));
                        }
                    }
                    String safe = fileName.replaceAll("[\\r\\n\"\\\\]", "_");
                    out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + field + "\"; filename=\"" + safe
                            + "\"\r\nContent-Type: " + mime + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                    byte[] buf = new byte[16 * 1024];
                    int n;
                    while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
                    out.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
                }
                status = c.getResponseCode();
                text = NativeBackgroundSync.readText(status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream());
            } catch (IOException ioe) {
                throw new OfflineException(ioe);
            } finally {
                if (c != null) c.disconnect();
            }
            if (status == 401) {
                if (retried) throw new NativeBackgroundSync.SessionExpiredException("Unauthorized after refresh");
                retried = true;
                refreshOrOffline();
                continue;
            }
            return parseResponse(status, text);
        }
    }

    // ------------------------------------------------------------------ feed sync

    private void pullAll() {
        if (!built || finishing) return;
        if (syncQueued.getAndSet(true)) return;
        final boolean wantDiscover = "discover".equals(tab) || !discoverLoaded;
        try {
            io.execute(() -> {
                syncQueued.set(false);
                try {
                    JSONArray my = dataArray(request("GET", "/api/status/my", null));
                    JSONArray fr = dataArray(request("GET", "/api/status/friends", null));
                    JSONArray di = wantDiscover ? dataArray(request("GET", "/api/status/public", null)) : null;
                    ui.post(() -> {
                        if (finishing) return;
                        applyFeed(my, fr, di);
                        showBanner(null);
                    });
                } catch (OfflineException oe) {
                    ui.post(() -> showBanner("Offline \u2014 showing saved updates"));
                } catch (NativeBackgroundSync.SessionExpiredException se) {
                    ui.post(this::sessionExpired);
                } catch (Throwable ignored) { }
            });
        } catch (Throwable t2) {
            syncQueued.set(false);
        }
    }

    private static JSONArray dataArray(JSONObject r) {
        JSONArray a = r.optJSONArray("data");
        return a == null ? new JSONArray() : a;
    }

    private void applyFeed(JSONArray my, JSONArray fr, JSONArray di) {
        mine = liveOnly(my);
        JSONArray others = new JSONArray();
        for (int i = 0; i < fr.length(); i++) {
            JSONObject o = fr.optJSONObject(i);
            if (o != null && live(o) && !isMine(o) && !"vibe".equals(str(o, "publicationTarget"))) others.put(o);
        }
        friends = others;
        if (di != null) {
            JSONArray pub = new JSONArray();
            for (int i = 0; i < di.length(); i++) {
                JSONObject o = di.optJSONObject(i);
                if (o != null && live(o) && !isMine(o)) pub.put(o);
            }
            discover = pub;
            discoverLoaded = true;
        }
        saveCache();
        render();
        if (pendingOpenUser > 0) {
            long want = pendingOpenUser;
            pendingOpenUser = 0;
            for (Person p : people(friends)) {
                if (p.userId == want) { openPerson(p); break; }
            }
        }
    }

    private void showBanner(String msg) {
        if (banner == null) return;
        if (msg == null) { banner.setVisibility(View.GONE); return; }
        banner.setText(msg);
        banner.setVisibility(View.VISIBLE);
    }

    // ------------------------------------------------------------------ main page

    private void buildPage() {
        page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        root.addView(page, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(t.surface);
        bar.setPadding(dp(8), dp(6), dp(8), dp(6));

        TextView back = text("\u2190", 24, t.text, true);
        back.setPadding(dp(10), dp(6), dp(14), dp(6));
        back.setOnClickListener(v -> onBack());
        bar.addView(back);

        TextView title = text("Status", 20, t.text, true);
        bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));

        TextView vibes = text("Vibes", 14, t.accent, true);
        vibes.setPadding(dp(12), dp(8), dp(12), dp(8));
        vibes.setOnClickListener(v -> closeScreen(true));
        bar.addView(vibes);

        TextView refresh = text("\u21BB", 22, t.text, true);
        refresh.setPadding(dp(12), dp(4), dp(10), dp(4));
        refresh.setOnClickListener(v -> { pullAll(); toast("Refreshing\u2026"); });
        bar.addView(refresh);
        page.addView(bar, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setBackgroundColor(t.surface);
        String[] names = {"Friends", "Discover"};
        for (int i = 0; i < 2; i++) {
            final String key = i == 0 ? "friends" : "discover";
            TextView tv = text(names[i], 15, t.subtext, true);
            tv.setGravity(Gravity.CENTER);
            tv.setPadding(0, dp(12), 0, dp(12));
            tv.setOnClickListener(v -> selectTab(key));
            tabViews[i] = tv;
            tabs.addView(tv, new LinearLayout.LayoutParams(0, -2, 1f));
        }
        page.addView(tabs, new LinearLayout.LayoutParams(-1, -2));
        View div = new View(this);
        div.setBackgroundColor(t.divider);
        page.addView(div, new LinearLayout.LayoutParams(-1, 1));

        banner = text("", 12, Color.WHITE, false);
        banner.setBackgroundColor(0xFF6B7280);
        banner.setGravity(Gravity.CENTER);
        banner.setPadding(dp(8), dp(6), dp(8), dp(6));
        banner.setVisibility(View.GONE);
        page.addView(banner, new LinearLayout.LayoutParams(-1, -2));

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        sv.addView(list, new ViewGroup.LayoutParams(-1, -2));
        page.addView(sv, new LinearLayout.LayoutParams(-1, 0, 1f));

        // floating "new status" button
        TextView fab = text("+", 30, Color.WHITE, true);
        fab.setGravity(Gravity.CENTER);
        fab.setBackground(NecpraConversationsActivity.rounded(t.accent, 28, this));
        fab.setElevation(dp(6));
        fab.setOnClickListener(v -> openComposer());
        FrameLayout.LayoutParams fl = new FrameLayout.LayoutParams(dp(56), dp(56));
        fl.gravity = Gravity.BOTTOM | Gravity.END;
        fl.setMargins(0, 0, dp(18), dp(22));
        root.addView(fab, fl);
        fab.setTag("fab");
    }

    private void selectTab(String key) {
        tab = key;
        render();
        if ("discover".equals(key) && !discoverLoaded) pullAll();
    }

    private void render() {
        if (list == null) return;
        for (int i = 0; i < 2; i++) {
            boolean on = (i == 0) == "friends".equals(tab);
            tabViews[i].setTextColor(on ? t.accent : t.subtext);
            tabViews[i].setBackgroundColor(t.surface);
        }
        list.removeAllViews();
        if ("friends".equals(tab)) renderFriends(); else renderDiscover();
    }

    private void renderFriends() {
        list.addView(myRow());
        List<Person> all = people(friends);
        List<Person> recent = new ArrayList<>(), viewed = new ArrayList<>();
        for (Person p : all) (p.unseen ? recent : viewed).add(p);

        list.addView(sectionLabel("Recent updates"));
        if (recent.isEmpty()) list.addView(placeholder("No new updates"));
        for (Person p : recent) list.addView(personRow(p));

        list.addView(sectionLabel("Viewed updates"));
        if (viewed.isEmpty()) list.addView(placeholder("No viewed updates yet"));
        for (Person p : viewed) list.addView(personRow(p));
    }

    private void renderDiscover() {
        list.addView(sectionLabel("Public updates"));
        List<Person> all = people(discover);
        if (all.isEmpty()) list.addView(placeholder(discoverLoaded ? "Nothing to discover right now" : "Loading\u2026"));
        for (Person p : all) list.addView(personRow(p));
    }

    private View sectionLabel(String s) {
        TextView tv = text(s.toUpperCase(Locale.getDefault()), 12, t.subtext, true);
        tv.setLetterSpacing(0.06f);
        tv.setPadding(dp(16), dp(18), dp(16), dp(6));
        return tv;
    }

    private View placeholder(String s) {
        TextView tv = text(s, 14, t.subtext, false);
        tv.setPadding(dp(16), dp(8), dp(16), dp(8));
        return tv;
    }

    private List<Person> people(JSONArray arr) {
        Map<String, Person> by = new LinkedHashMap<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject st = arr.optJSONObject(i);
            if (st == null) continue;
            String uid = String.valueOf(st.opt("userId"));
            Person p = by.get(uid);
            if (p == null) {
                p = new Person();
                p.userId = st.optLong("userId", 0L);
                p.owner = st.optJSONObject("owner");
                by.put(uid, p);
            }
            p.items.add(st);
        }
        List<Person> out = new ArrayList<>(by.values());
        for (Person p : out) {
            Collections.sort(p.items, (a, b) -> Long.compare(parseIso(str(a, "createdAt")), parseIso(str(b, "createdAt"))));
            for (JSONObject st : p.items) {
                if (!isSeen(st)) p.unseen = true;
                p.newest = Math.max(p.newest, parseIso(str(st, "createdAt")));
            }
        }
        Collections.sort(out, new Comparator<Person>() {
            @Override public int compare(Person a, Person b) { return Long.compare(b.newest, a.newest); }
        });
        return out;
    }

    private View ringedAvatar(String url, String name, boolean unseen, int sizeDp) {
        FrameLayout ring = new FrameLayout(this);
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setStroke(dp(2), unseen ? t.accent : t.divider);
        g.setColor(Color.TRANSPARENT);
        ring.setBackground(g);
        ImageView[] iv = new ImageView[1];
        TextView[] lt = new TextView[1];
        FrameLayout av = NecpraConversationsActivity.avatarView(this, sizeDp, t, iv, lt);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(sizeDp), dp(sizeDp));
        lp.gravity = Gravity.CENTER;
        ring.addView(av, lp);
        NecpraConversationsActivity.bindAvatar(iv[0], lt[0], url, name);
        ring.setLayoutParams(new LinearLayout.LayoutParams(dp(sizeDp + 10), dp(sizeDp + 10)));
        return ring;
    }

    private LinearLayout rowShell() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(16), dp(10), dp(16), dp(10));
        row.setBackgroundColor(t.surface);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, 0, 0, 1);
        row.setLayoutParams(lp);
        return row;
    }

    private View myRow() {
        LinearLayout row = rowShell();
        String name = meName.isEmpty() ? "Me" : meName;
        String avatar = meAvatar;
        if (mine.length() > 0) {
            JSONObject o = mine.optJSONObject(0);
            if (o != null && !ownerAvatar(o).isEmpty()) avatar = ownerAvatar(o);
        }
        boolean has = mine.length() > 0;
        row.addView(ringedAvatar(avatar, name, has, 52));

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(14), 0, dp(8), 0);
        col.addView(text("My status", 16, t.text, true));
        long newest = 0;
        for (int i = 0; i < mine.length(); i++) newest = Math.max(newest, parseIso(str(mine.optJSONObject(i), "createdAt")));
        String sub = has ? mine.length() + (mine.length() == 1 ? " update" : " updates") + " \u00B7 " + ago(newest)
                : "Tap + to add a status update";
        col.addView(text(sub, 13, t.subtext, false));
        row.addView(col, new LinearLayout.LayoutParams(0, -2, 1f));

        row.setOnClickListener(v -> {
            if (!has) { openComposer(); return; }
            List<JSONObject> items = new ArrayList<>();
            for (int i = 0; i < mine.length(); i++) { JSONObject o = mine.optJSONObject(i); if (o != null) items.add(o); }
            Collections.sort(items, (a, b) -> Long.compare(parseIso(str(a, "createdAt")), parseIso(str(b, "createdAt"))));
            openViewer(items, 0);
        });
        return row;
    }

    private View personRow(final Person p) {
        LinearLayout row = rowShell();
        JSONObject first = p.items.get(0);
        String name = ownerName(first);
        row.addView(ringedAvatar(ownerAvatar(first), name, p.unseen, 52));

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(14), 0, dp(8), 0);
        col.addView(text(name, 16, t.text, true));
        int n = p.items.size();
        col.addView(text((n == 1 ? "1 update" : n + " updates") + " \u00B7 " + ago(p.newest), 13, t.subtext, false));
        row.addView(col, new LinearLayout.LayoutParams(0, -2, 1f));

        if (p.unseen) {
            View dot = new View(this);
            dot.setBackground(NecpraConversationsActivity.rounded(t.accent, 5, this));
            row.addView(dot, new LinearLayout.LayoutParams(dp(10), dp(10)));
        }
        row.setOnClickListener(v -> openPerson(p));
        return row;
    }

    private void openPerson(Person p) {
        int start = 0;
        for (int i = 0; i < p.items.size(); i++) { if (!isSeen(p.items.get(i))) { start = i; break; } }
        openViewer(new ArrayList<>(p.items), start);
    }

    // ------------------------------------------------------------------ story viewer

    private void openViewer(List<JSONObject> group, int start) {
        if (group == null || group.isEmpty() || viewer != null) return;
        vGroup = group;
        root.setBackgroundColor(Color.BLACK);
        viewer = new FrameLayout(this);
        viewer.setBackgroundColor(Color.BLACK);
        viewer.setClickable(true);
        root.addView(viewer, new FrameLayout.LayoutParams(-1, -1));
        View fab = root.findViewWithTag("fab");
        if (fab != null) fab.setVisibility(View.GONE);
        showStory(Math.max(0, Math.min(start, group.size() - 1)));
    }

    private void closeViewer() {
        ui.removeCallbacks(vTick);
        stopMedia();
        if (viewer != null) { root.removeView(viewer); viewer = null; }
        vToken++;
        vHold = false;
        vBlocked = false;
        root.setBackgroundColor(t.bg);
        View fab = root.findViewWithTag("fab");
        if (fab != null) fab.setVisibility(View.VISIBLE);
        hideKeyboard(root);
        saveCache();
        render();
    }

    private void stopMedia() {
        if (vVideo != null) { try { vVideo.stopPlayback(); } catch (Throwable ignored) { } vVideo = null; }
        vMp = null;
    }

    private void nextStory() {
        if (vIndex + 1 >= vGroup.size()) { closeViewer(); return; }
        showStory(vIndex + 1);
    }

    private void prevStory() {
        if (vIndex <= 0) { vElapsed = 0; return; }
        showStory(vIndex - 1);
    }

    private void showStory(int index) {
        if (viewer == null) return;
        ui.removeCallbacks(vTick);
        stopMedia();
        vToken++;
        final int token = vToken;
        vIndex = index;
        vHold = false;
        vBlocked = false;
        vElapsed = 0;
        vReply = null;
        viewer.removeAllViews();
        hideKeyboard(viewer);

        final JSONObject st = vGroup.get(index);
        final String type = typeOf(st);
        vOwn = isMine(st);
        vDuration = Math.max(3000L, st.optLong("durationSeconds", 7) * 1000L);
        vLoading = false;

        // ---- media / content layer
        View interactive = null;       // poll / link controls: must sit ABOVE the tap layer or they could never be pressed
        FrameLayout stage = new FrameLayout(this);
        if ("image".equals(type) || "video".equals(type)) stage.setBackgroundColor(Color.BLACK);
        else stage.setBackground(gradientFor(str(st, "background")));
        viewer.addView(stage, new FrameLayout.LayoutParams(-1, -1));

        if ("text".equals(type)) {
            String body = firstNonEmpty(str(st, "content"), str(st, "caption"));
            TextView tv = text(body, body.length() > 120 ? 20 : body.length() > 40 ? 26 : 32, Color.WHITE, true);
            tv.setGravity(Gravity.CENTER);
            tv.setPadding(dp(28), dp(90), dp(28), dp(140));
            stage.addView(tv, new FrameLayout.LayoutParams(-1, -1));
        } else if ("image".equals(type)) {
            final ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
            stage.addView(iv, new FrameLayout.LayoutParams(-1, -1));
            final TextView wait = text("Loading\u2026", 14, 0xFFBBBBBB, false);
            wait.setGravity(Gravity.CENTER);
            stage.addView(wait, new FrameLayout.LayoutParams(-1, -1));
            vLoading = true;
            fetchBitmap(screenImage(mediaUrl(st)), 1600, b -> {
                if (token != vToken) return;
                if (b != null) { iv.setImageBitmap(b); wait.setVisibility(View.GONE); }
                else wait.setText("Couldn't load this image");
                vLoading = false;
            });
        } else if ("video".equals(type)) {
            vDuration = MAX_STORY_MS;
            vVideo = new VideoView(this);
            FrameLayout.LayoutParams vlp = new FrameLayout.LayoutParams(-1, -1);
            vlp.gravity = Gravity.CENTER;
            stage.addView(vVideo, vlp);
            final TextView wait = text("Loading\u2026", 14, 0xFFBBBBBB, false);
            wait.setGravity(Gravity.CENTER);
            stage.addView(wait, new FrameLayout.LayoutParams(-1, -1));
            vLoading = true;
            final VideoView vv = vVideo;
            vv.setOnPreparedListener(mp -> {
                if (token != vToken) return;
                vMp = mp;
                try { mp.setVolume(vMuted ? 0f : 1f, vMuted ? 0f : 1f); } catch (Throwable ignored) { }
                int d = mp.getDuration();
                if (d > 0) vDuration = Math.min(MAX_STORY_MS, d);
                wait.setVisibility(View.GONE);
                vLoading = false;
                try { vv.start(); } catch (Throwable ignored) { }
            });
            vv.setOnCompletionListener(mp -> { if (token == vToken) nextStory(); });
            vv.setOnErrorListener((mp, what, extra) -> {
                if (token == vToken) { wait.setText("Couldn't play this video"); wait.setVisibility(View.VISIBLE); vLoading = false; vDuration = 4000; }
                return true;
            });
            try { vv.setVideoURI(Uri.parse(mediaUrl(st))); } catch (Throwable e) { wait.setText("Couldn't play this video"); vLoading = false; vDuration = 4000; }
        } else if ("poll".equals(type)) {
            LinearLayout box = new LinearLayout(this);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setGravity(Gravity.CENTER);
            box.setPadding(dp(24), dp(100), dp(24), dp(150));
            interactive = box;
            renderPoll(box, st, null, token);
            loadPoll(st, box, token);
            vDuration = 12000;
        } else if ("link".equals(type)) {
            LinearLayout box = new LinearLayout(this);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setGravity(Gravity.CENTER);
            box.setPadding(dp(28), dp(100), dp(28), dp(150));
            String c = firstNonEmpty(str(st, "content"), str(st, "caption"));
            if (!c.isEmpty()) {
                TextView tv = text(c, 22, Color.WHITE, true);
                tv.setGravity(Gravity.CENTER);
                box.addView(tv);
            }
            final String url = str(st, "linkUrl");
            TextView card = text(url, 15, Color.WHITE, true);
            card.setPadding(dp(16), dp(14), dp(16), dp(14));
            card.setBackground(NecpraConversationsActivity.rounded(0x33FFFFFF, 14, this));
            card.setOnClickListener(v -> openLink(url));
            LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(-1, -2);
            clp.topMargin = dp(18);
            box.addView(card, clp);
            interactive = box;
        }

        // ---- tap / hold / swipe layer (under the interactive layers)
        View touch = new View(this);
        touch.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY;
            boolean held, moved;
            final Runnable hold = () -> { held = true; vHold = true; };
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = e.getX(); downY = e.getY(); held = false; moved = false;
                        ui.postDelayed(hold, 250);
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        if (Math.abs(e.getX() - downX) > dp(16) || Math.abs(e.getY() - downY) > dp(16)) {
                            moved = true;
                            ui.removeCallbacks(hold);
                            if (held) { held = false; vHold = false; }
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        ui.removeCallbacks(hold);
                        if (held) { held = false; vHold = false; return true; }
                        if (moved) {
                            if (e.getY() - downY > dp(120)) closeViewer();
                            return true;
                        }
                        if (downX < v.getWidth() * 0.3f) prevStory(); else nextStory();
                        return true;
                    case MotionEvent.ACTION_CANCEL:
                        ui.removeCallbacks(hold);
                        if (held) { held = false; vHold = false; }
                        return true;
                    default:
                        return true;
                }
            }
        });
        viewer.addView(touch, 1, new FrameLayout.LayoutParams(-1, -1));
        if (interactive != null) viewer.addView(interactive, 2, new FrameLayout.LayoutParams(-1, -1));

        // ---- top: progress segments + header
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xAA000000, 0x00000000}));
        top.setPadding(dp(10), dp(8), dp(10), dp(18));

        LinearLayout prog = new LinearLayout(this);
        prog.setOrientation(LinearLayout.HORIZONTAL);
        vFills = new View[vGroup.size()];
        for (int i = 0; i < vGroup.size(); i++) {
            FrameLayout track = new FrameLayout(this);
            track.setBackground(NecpraConversationsActivity.rounded(0x55FFFFFF, 2, this));
            View fill = new View(this);
            fill.setBackground(NecpraConversationsActivity.rounded(Color.WHITE, 2, this));
            fill.setPivotX(0f);
            fill.setScaleX(i < index ? 1f : 0f);
            track.addView(fill, new FrameLayout.LayoutParams(-1, -1));
            vFills[i] = fill;
            LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0, dp(3), 1f);
            tlp.setMargins(dp(2), 0, dp(2), 0);
            prog.addView(track, tlp);
        }
        top.addView(prog, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.setPadding(dp(2), dp(10), 0, 0);
        String nm = vOwn ? "My status" : ownerName(st);
        ImageView[] aiv = new ImageView[1];
        TextView[] alt = new TextView[1];
        FrameLayout av = NecpraConversationsActivity.avatarView(this, 38, t, aiv, alt);
        NecpraConversationsActivity.bindAvatar(aiv[0], alt[0], vOwn && !meAvatar.isEmpty() ? meAvatar : ownerAvatar(st), nm);
        head.addView(av, new LinearLayout.LayoutParams(dp(38), dp(38)));
        LinearLayout who = new LinearLayout(this);
        who.setOrientation(LinearLayout.VERTICAL);
        who.setPadding(dp(10), 0, dp(6), 0);
        who.addView(text(nm, 15, Color.WHITE, true));
        who.addView(text(ago(parseIso(str(st, "createdAt"))), 12, 0xCCFFFFFF, false));
        head.addView(who, new LinearLayout.LayoutParams(0, -2, 1f));

        if ("video".equals(type)) {
            final TextView mute = text(vMuted ? "\uD83D\uDD07" : "\uD83D\uDD0A", 18, Color.WHITE, false);
            mute.setPadding(dp(10), dp(6), dp(10), dp(6));
            mute.setOnClickListener(v -> {
                vMuted = !vMuted;
                mute.setText(vMuted ? "\uD83D\uDD07" : "\uD83D\uDD0A");
                if (vMp != null) { try { vMp.setVolume(vMuted ? 0f : 1f, vMuted ? 0f : 1f); } catch (Throwable ignored) { } }
            });
            head.addView(mute);
        }
        final TextView more = text("\u22EE", 22, Color.WHITE, true);
        more.setPadding(dp(10), dp(4), dp(10), dp(4));
        more.setOnClickListener(v -> showMoreMenu(v, st));
        head.addView(more);
        TextView close = text("\u2715", 20, Color.WHITE, true);
        close.setPadding(dp(10), dp(4), dp(8), dp(4));
        close.setOnClickListener(v -> closeViewer());
        head.addView(close);
        top.addView(head, new LinearLayout.LayoutParams(-1, -2));
        FrameLayout.LayoutParams toplp = new FrameLayout.LayoutParams(-1, -2);
        toplp.gravity = Gravity.TOP;
        viewer.addView(top, toplp);

        // ---- bottom: caption + reactions + reply (others) / viewers + actions (own)
        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setClickable(true);
        bottom.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{0xCC000000, 0x00000000}));
        bottom.setPadding(dp(12), dp(28), dp(12), dp(12));

        String cap = str(st, "caption");
        if (!cap.isEmpty() && ("image".equals(type) || "video".equals(type))) {
            TextView ctv = text(cap, 16, Color.WHITE, false);
            ctv.setPadding(dp(4), 0, dp(4), dp(10));
            bottom.addView(ctv);
        }
        if (vOwn) buildOwnBar(bottom, st); else buildViewerBar(bottom, st);
        FrameLayout.LayoutParams blp = new FrameLayout.LayoutParams(-1, -2);
        blp.gravity = Gravity.BOTTOM;
        viewer.addView(bottom, blp);

        // ---- mark seen + tell the server (idempotent per viewer)
        if (!vOwn) {
            seen.add(idOf(st));
            try { st.put("viewedByMe", true); } catch (Exception ignored) { }
            recordView(st);
        }

        vLast = SystemClock.uptimeMillis();
        ui.post(vTick);
    }

    private void buildOwnBar(LinearLayout bottom, final JSONObject st) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        final TextView views = pill("\uD83D\uDC41 " + st.optInt("viewCount", 0));
        views.setOnClickListener(v -> showViewers(st));
        row.addView(views);
        final boolean hl = st.optBoolean("highlight", false);
        TextView hlBtn = pill(hl ? "\u2605 Highlighted" : "\u2606 Highlight");
        hlBtn.setOnClickListener(v -> toggleHighlight(st, !hl));
        row.addView(hlBtn);
        TextView del = pill("Delete");
        del.setOnClickListener(v -> confirmDelete(st));
        row.addView(del);
        bottom.addView(row);
        // refresh the count (others may have viewed since the feed was loaded)
        final int token = vToken;
        reads.execute(() -> {
            try {
                JSONObject r = request("GET", "/api/status/" + idOf(st) + "/viewers", null);
                final int n = r.optInt("viewCount", st.optInt("viewCount", 0));
                ui.post(() -> {
                    try { st.put("viewCount", n); } catch (Exception ignored) { }
                    if (token == vToken) views.setText("\uD83D\uDC41 " + n);
                });
            } catch (Throwable ignored) { }
        });
    }

    private TextView pill(String s) {
        TextView tv = text(s, 14, Color.WHITE, true);
        tv.setPadding(dp(14), dp(8), dp(14), dp(8));
        tv.setBackground(NecpraConversationsActivity.rounded(0x44FFFFFF, 18, this));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.setMargins(0, 0, dp(8), 0);
        tv.setLayoutParams(lp);
        return tv;
    }

    private void buildViewerBar(LinearLayout bottom, final JSONObject st) {
        if (st.optBoolean("allowReactions", true)) {
            HorizontalScrollView hs = new HorizontalScrollView(this);
            hs.setHorizontalScrollBarEnabled(false);
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            for (final String e : REACTIONS) {
                TextView b = text(e, 24, Color.WHITE, false);
                b.setPadding(dp(12), dp(6), dp(12), dp(6));
                b.setOnClickListener(v -> sendReaction(st, e));
                row.addView(b);
            }
            hs.addView(row);
            bottom.addView(hs, new LinearLayout.LayoutParams(-1, -2));
        }
        if (st.optBoolean("allowReplies", true)) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(0, dp(6), 0, 0);
            final EditText et = new EditText(this);
            vReply = et;
            et.setHint("Reply privately\u2026");
            et.setHintTextColor(0xAAFFFFFF);
            et.setTextColor(Color.WHITE);
            et.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            et.setSingleLine(true);
            et.setFilters(new InputFilter[]{new InputFilter.LengthFilter(500)});
            et.setBackground(NecpraConversationsActivity.rounded(0x44FFFFFF, 22, this));
            et.setPadding(dp(16), dp(10), dp(16), dp(10));
            et.setOnFocusChangeListener((v, focus) -> vBlocked = focus);
            row.addView(et, new LinearLayout.LayoutParams(0, -2, 1f));
            TextView send = text("\u27A4", 22, Color.WHITE, true);
            send.setPadding(dp(14), dp(8), dp(6), dp(8));
            send.setOnClickListener(v -> {
                String s = et.getText().toString().trim();
                if (s.isEmpty()) return;
                et.setText("");
                et.clearFocus();
                hideKeyboard(et);
                vBlocked = false;
                sendReply(st, s);
            });
            row.addView(send);
            bottom.addView(row, new LinearLayout.LayoutParams(-1, -2));
        }
    }

    private void showMoreMenu(View anchor, final JSONObject st) {
        vBlocked = true;
        PopupMenu pm = new PopupMenu(this, anchor);
        pm.getMenu().add(0, 1, 0, "Share");
        if (!vOwn) pm.getMenu().add(0, 2, 1, "Report");
        pm.setOnMenuItemClickListener(item -> {
            if (item.getItemId() == 1) shareStatus(st);
            else if (item.getItemId() == 2) reportStatus(st);
            return true;
        });
        pm.setOnDismissListener(m -> { if (vReply == null || !vReply.hasFocus()) vBlocked = false; });
        pm.show();
    }

    private void shareStatus(JSONObject st) {
        String body = firstNonEmpty(str(st, "caption"), str(st, "content"));
        String url = mediaUrl(st);
        String msg = (body.isEmpty() ? "Check out this status on Necpra" : body) + (url.isEmpty() ? "" : "\n" + url);
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, msg);
        try { startActivity(Intent.createChooser(i, "Share status")); } catch (Throwable ignored) { }
    }

    private void openLink(String url) {
        if (url == null || !url.matches("^https?://\\S+$")) { toast("Not a valid link"); return; }
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (ActivityNotFoundException e) { toast("No app can open this link"); }
    }

    // ---- viewer actions

    private void recordView(final JSONObject st) {
        final String id = idOf(st);
        if (!viewSent.add(id)) return;
        io.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("statusId", st.opt("id"));
                JSONObject r = request("POST", "/api/status/view", body);
                final int n = r.optInt("viewCount", st.optInt("viewCount", 0));
                ui.post(() -> { try { st.put("viewCount", n); } catch (Exception ignored) { } });
            } catch (Throwable e) {
                viewSent.remove(id);   // offline: try again next time it is opened
                if (e instanceof NativeBackgroundSync.SessionExpiredException) ui.post(this::sessionExpired);
            }
        });
    }

    private void sendReaction(final JSONObject st, final String emoji) {
        toast("Sending reaction\u2026");
        io.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("emoji", emoji);
                request("POST", "/api/status/" + idOf(st) + "/like", body);
            } catch (Throwable e) { actionFailed(e, "Couldn't send the reaction"); return; }
            boolean ok = notifyCreator(st, "reaction", emoji, "");
            ui.post(() -> toast(ok ? "Reaction sent privately to the creator" : "Reaction saved. The creator could not be notified privately yet."));
        });
    }

    private void sendReply(final JSONObject st, final String text) {
        io.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("text", text);
                request("POST", "/api/status/" + idOf(st) + "/comment", body);
                st.put("replyCount", st.optInt("replyCount", 0) + 1);
            } catch (Throwable e) { actionFailed(e, "Couldn't send the reply"); return; }
            boolean ok = notifyCreator(st, "comment", "", text);
            ui.post(() -> toast(ok ? "Reply sent privately to the creator" : "Reply saved. The creator could not be notified privately yet."));
        });
    }

    /** Encrypted private copy to the creator (same payload the web module sends). Retries quietly. */
    private boolean notifyCreator(JSONObject st, String kind, String emoji, String text) {
        long owner = st.optLong("userId", 0L);
        if (owner <= 0 || isMine(st)) return true;
        if (!NecpraDmOwner.isOwner(this)) return false;
        try {
            JSONObject inter = new JSONObject();
            inter.put("statusId", st.opt("id"));
            inter.put("statusType", typeOf(st));
            inter.put("kind", kind);
            inter.put("emoji", "reaction".equals(kind) ? emoji : JSONObject.NULL);
            inter.put("text", "comment".equals(kind) ? text : "");
            String cap = firstNonEmpty(str(st, "caption"), str(st, "content"));
            inter.put("caption", cap.length() > 500 ? cap.substring(0, 500) : cap);
            for (int i = 0; i < 3; i++) {
                try {
                    if (queueInteraction(owner, inter.toString())) return true;
                } catch (Exception e) {
                    if (i < 2) { try { Thread.sleep(2500L * (i + 1)); } catch (InterruptedException ie) { return false; } }
                }
            }
        } catch (Exception ignored) { }
        return false;
    }

    /** Runs the repository call on the repository's own executor (it serialises all DM state), waiting for the result. */
    private boolean queueInteraction(final long owner, final String json) throws Exception {
        final NecpraMessageRepository repo = NecpraMessageRepository.get(this);
        final boolean[] ok = {false};
        final Exception[] err = {null};
        final CountDownLatch done = new CountDownLatch(1);
        repo.async(() -> {
            try { ok[0] = repo.sendStatusInteraction(owner, json); }
            catch (Exception e) { err[0] = e; }
            finally { done.countDown(); }
        });
        if (!done.await(60, TimeUnit.SECONDS)) throw new IOException("timed out");
        if (err[0] != null) throw err[0];
        return ok[0];
    }

    private void actionFailed(Throwable e, String fallback) {
        if (e instanceof NativeBackgroundSync.SessionExpiredException) { ui.post(this::sessionExpired); return; }
        final String m = e instanceof OfflineException ? "You're offline" : (e instanceof ApiException ? e.getMessage() : fallback);
        ui.post(() -> toast(m));
    }

    private void showViewers(final JSONObject st) {
        vBlocked = true;
        reads.execute(() -> {
            try {
                JSONObject r = request("GET", "/api/status/" + idOf(st) + "/viewers", null);
                JSONArray rows = r.optJSONArray("viewers");
                if (rows == null) rows = r.optJSONArray("data");
                final JSONArray fr = rows == null ? new JSONArray() : rows;
                ui.post(() -> {
                    if (finishing) return;
                    LinearLayout box = new LinearLayout(this);
                    box.setOrientation(LinearLayout.VERTICAL);
                    box.setPadding(dp(20), dp(8), dp(20), dp(8));
                    if (fr.length() == 0) box.addView(text("No views yet", 15, t.subtext, false));
                    for (int i = 0; i < fr.length(); i++) {
                        JSONObject row = fr.optJSONObject(i);
                        if (row == null) continue;
                        JSONObject v = row.optJSONObject("viewer");
                        String name = v == null ? "Someone" : firstNonEmpty(str(v, "displayName"), str(v, "username"));
                        TextView tv = text(name + "  \u00B7  " + ago(parseIso(str(row, "viewedAt"))), 15, t.text, false);
                        tv.setPadding(0, dp(8), 0, dp(8));
                        box.addView(tv);
                    }
                    ScrollView sv = new ScrollView(this);
                    sv.addView(box);
                    new AlertDialog.Builder(this).setTitle(fr.length() + (fr.length() == 1 ? " view" : " views"))
                            .setView(sv).setPositiveButton("Close", null)
                            .setOnDismissListener(d -> vBlocked = false).show();
                });
            } catch (Throwable e) { ui.post(() -> vBlocked = false); actionFailed(e, "Couldn't load viewers"); }
        });
    }

    private void toggleHighlight(final JSONObject st, final boolean on) {
        io.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("highlight", on);
                request("PUT", "/api/status/" + idOf(st), body);
                st.put("highlight", on);
                ui.post(() -> { toast(on ? "Added to Highlights" : "Removed from Highlights"); if (viewer != null) showStory(vIndex); });
            } catch (Throwable e) { actionFailed(e, "Couldn't update the status"); }
        });
    }

    private void confirmDelete(final JSONObject st) {
        vBlocked = true;
        new AlertDialog.Builder(this).setTitle("Delete this status?")
                .setMessage("It will be removed for everyone right away.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Delete", (d, w) -> deleteStatus(st))
                .setOnDismissListener(d -> vBlocked = false).show();
    }

    private void deleteStatus(final JSONObject st) {
        io.execute(() -> {
            try {
                request("DELETE", "/api/status/" + idOf(st), null);
                ui.post(() -> {
                    removeById(idOf(st));
                    changed = true;
                    saveCache();
                    vGroup.remove(st);
                    if (viewer == null) return;
                    if (vGroup.isEmpty()) closeViewer();
                    else showStory(Math.min(vIndex, vGroup.size() - 1));
                    toast("Status deleted");
                });
            } catch (Throwable e) { actionFailed(e, "Couldn't delete the status"); }
        });
    }

    private void removeById(String id) {
        JSONArray out = new JSONArray();
        for (int i = 0; i < mine.length(); i++) { JSONObject o = mine.optJSONObject(i); if (o != null && !idOf(o).equals(id)) out.put(o); }
        mine = out;
    }

    private void reportStatus(final JSONObject st) {
        vBlocked = true;
        final String[] labels = {"Spam", "Harassment or abuse", "Nudity or sexual content", "Misinformation", "Something else"};
        final String[] keys = {"spam", "abuse", "nudity", "misinformation", "other"};
        new AlertDialog.Builder(this).setTitle("Report this status")
                .setItems(labels, (d, which) -> io.execute(() -> {
                    try {
                        JSONObject body = new JSONObject();
                        body.put("reason", keys[which]);
                        request("POST", "/api/status/" + idOf(st) + "/report", body);
                        ui.post(() -> toast("Report submitted"));
                    } catch (Throwable e) { actionFailed(e, "Couldn't submit the report"); }
                }))
                .setNegativeButton("Cancel", null)
                .setOnDismissListener(d -> vBlocked = false).show();
    }

    // ---- polls

    private void loadPoll(final JSONObject st, final LinearLayout box, final int token) {
        reads.execute(() -> {
            try {
                JSONObject r = request("GET", "/api/status/" + idOf(st) + "/poll", null);
                final JSONObject data = r.optJSONObject("data");
                ui.post(() -> { if (token == vToken && data != null) renderPoll(box, st, data, token); });
            } catch (Throwable ignored) { }
        });
    }

    private void renderPoll(final LinearLayout box, final JSONObject st, final JSONObject data, final int token) {
        box.removeAllViews();
        TextView q = text(firstNonEmpty(data == null ? "" : str(data, "question"), str(st, "content")), 24, Color.WHITE, true);
        q.setGravity(Gravity.CENTER);
        q.setPadding(0, 0, 0, dp(18));
        box.addView(q);

        final JSONArray opts = data == null ? null : data.optJSONArray("options");
        JSONArray raw = st.optJSONArray("pollOptions");
        int count = opts != null ? opts.length() : (raw == null ? 0 : raw.length());
        int myVote = data == null || data.isNull("myVote") ? -1 : data.optInt("myVote", -1);
        int total = data == null ? 0 : data.optInt("totalVotes", 0);
        boolean showResults = data != null && (myVote >= 0 || vOwn);
        for (int i = 0; i < count; i++) {
            final int idx = i;
            String label = opts != null ? str(opts.optJSONObject(i), "label") : raw.optString(i);
            int votes = opts != null ? opts.optJSONObject(i).optInt("votes", 0) : 0;
            String line = label + (showResults ? "   " + votes + (total > 0 ? " \u00B7 " + Math.round(votes * 100f / total) + "%" : "") : "");
            TextView b = text((idx == myVote ? "\u2713 " : "") + line, 16, Color.WHITE, idx == myVote);
            b.setGravity(Gravity.CENTER_VERTICAL);
            b.setPadding(dp(16), dp(14), dp(16), dp(14));
            b.setBackground(NecpraConversationsActivity.rounded(idx == myVote ? 0x88FFFFFF : 0x44FFFFFF, 12, this));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.setMargins(0, 0, 0, dp(10));
            b.setLayoutParams(lp);
            if (!vOwn) b.setOnClickListener(v -> votePoll(st, box, idx, token));
            box.addView(b);
        }
    }

    private void votePoll(final JSONObject st, final LinearLayout box, final int idx, final int token) {
        io.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("optionIndex", idx);
                JSONObject r = request("POST", "/api/status/" + idOf(st) + "/poll/vote", body);
                final JSONObject data = r.optJSONObject("data");
                ui.post(() -> { if (token == vToken && data != null) renderPoll(box, st, data, token); });
            } catch (Throwable e) { actionFailed(e, "Couldn't register your vote"); }
        });
    }

    // ------------------------------------------------------------------ composer

    private void openComposer() {
        if (composer != null || viewer != null) return;
        cMediaUri = null;
        cMediaVideo = false;
        cBg = BACKGROUNDS[0];
        cPollOpts.clear();
        cTab = 0;

        composer = new FrameLayout(this);
        composer.setBackgroundColor(t.bg);
        composer.setClickable(true);
        root.addView(composer, new FrameLayout.LayoutParams(-1, -1));
        View fab = root.findViewWithTag("fab");
        if (fab != null) fab.setVisibility(View.GONE);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        composer.addView(col, new FrameLayout.LayoutParams(-1, -1));

        // header
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(t.surface);
        bar.setPadding(dp(8), dp(6), dp(12), dp(6));
        TextView x = text("\u2715", 20, t.text, true);
        x.setPadding(dp(10), dp(6), dp(14), dp(6));
        x.setOnClickListener(v -> requestCloseComposer());
        bar.addView(x);
        bar.addView(text("New status", 19, t.text, true), new LinearLayout.LayoutParams(0, -2, 1f));
        cPublish = text("Publish", 15, Color.WHITE, true);
        cPublish.setPadding(dp(18), dp(9), dp(18), dp(9));
        cPublish.setBackground(NecpraConversationsActivity.rounded(t.accent, 20, this));
        cPublish.setOnClickListener(v -> publish());
        bar.addView(cPublish);
        col.addView(bar, new LinearLayout.LayoutParams(-1, -2));

        // type tabs
        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setBackgroundColor(t.surface);
        String[] names = {"Text", "Photo/Video", "Poll", "Link"};
        for (int i = 0; i < 4; i++) {
            final int idx = i;
            TextView tv = text(names[i], 14, t.subtext, true);
            tv.setGravity(Gravity.CENTER);
            tv.setPadding(0, dp(12), 0, dp(12));
            tv.setOnClickListener(v -> selectComposerTab(idx));
            cTabViews[i] = tv;
            tabs.addView(tv, new LinearLayout.LayoutParams(0, -2, 1f));
        }
        col.addView(tabs, new LinearLayout.LayoutParams(-1, -2));

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        FrameLayout panes = new FrameLayout(this);
        panes.setPadding(dp(14), dp(14), dp(14), dp(14));
        sv.addView(panes, new ViewGroup.LayoutParams(-1, -2));
        col.addView(sv, new LinearLayout.LayoutParams(-1, 0, 1f));

        cPanes[0] = buildTextPane();
        cPanes[1] = buildMediaPane();
        cPanes[2] = buildPollPane();
        cPanes[3] = buildLinkPane();
        for (View p : cPanes) panes.addView(p, new FrameLayout.LayoutParams(-1, -2));

        // footer: audience + duration (+ where a video goes)
        LinearLayout foot = new LinearLayout(this);
        foot.setOrientation(LinearLayout.HORIZONTAL);
        foot.setGravity(Gravity.CENTER_VERTICAL);
        foot.setBackgroundColor(t.surface);
        foot.setPadding(dp(12), dp(8), dp(12), dp(8));
        cPrivacyBtn = footBtn("");
        cPrivacyBtn.setOnClickListener(v -> {
            cPrivacy = "all_contacts".equals(cPrivacy) ? "public" : "public".equals(cPrivacy) ? "private" : "all_contacts";
            refreshFooter();
        });
        cDurationBtn = footBtn("");
        cDurationBtn.setOnClickListener(v -> { cDurationIdx = (cDurationIdx + 1) % DURATIONS.length; refreshFooter(); });
        cTargetBtn = footBtn("");
        cTargetBtn.setOnClickListener(v -> {
            cTarget = "status".equals(cTarget) ? "both" : "both".equals(cTarget) ? "vibe" : "status";
            refreshFooter();
        });
        foot.addView(cPrivacyBtn);
        foot.addView(cDurationBtn);
        foot.addView(cTargetBtn);
        col.addView(foot, new LinearLayout.LayoutParams(-1, -2));

        selectComposerTab(0);
        refreshFooter();
        cText.requestFocus();
    }

    private TextView footBtn(String s) {
        TextView tv = text(s, 13, t.text, true);
        tv.setPadding(dp(12), dp(8), dp(12), dp(8));
        tv.setBackground(NecpraConversationsActivity.rounded(t.bg, 16, this));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.setMargins(0, 0, dp(8), 0);
        tv.setLayoutParams(lp);
        return tv;
    }

    private void refreshFooter() {
        if (cPrivacyBtn == null) return;
        cPrivacyBtn.setText("all_contacts".equals(cPrivacy) ? "\uD83D\uDC65 My contacts" : "public".equals(cPrivacy) ? "\uD83C\uDF10 Public" : "\uD83D\uDD12 Only me");
        cDurationBtn.setText("\u23F1 " + DURATIONS[cDurationIdx] + "s");
        cDurationBtn.setVisibility(cTab == 1 && cMediaVideo ? View.GONE : View.VISIBLE);
        cTargetBtn.setVisibility(cTab == 1 && cMediaVideo ? View.VISIBLE : View.GONE);
        cTargetBtn.setText("status".equals(cTarget) ? "Status" : "both".equals(cTarget) ? "Status + Vibe" : "Vibe only");
    }

    private void selectComposerTab(int idx) {
        cTab = idx;
        for (int i = 0; i < 4; i++) {
            cPanes[i].setVisibility(i == idx ? View.VISIBLE : View.GONE);
            cTabViews[i].setTextColor(i == idx ? t.accent : t.subtext);
            cTabViews[i].setBackgroundColor(t.surface);
        }
        refreshFooter();
    }

    private EditText field(String hint, int maxLen, boolean multiline) {
        EditText et = new EditText(this);
        et.setHint(hint);
        et.setHintTextColor(t.subtext);
        et.setTextColor(t.text);
        et.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        et.setFilters(new InputFilter[]{new InputFilter.LengthFilter(maxLen)});
        et.setBackground(NecpraConversationsActivity.rounded(t.surface, 12, this));
        et.setPadding(dp(14), dp(12), dp(14), dp(12));
        if (multiline) {
            et.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
            et.setMinLines(2);
            et.setGravity(Gravity.TOP);
        } else {
            et.setSingleLine(true);
        }
        return et;
    }

    private LinearLayout.LayoutParams gap(int topDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = dp(topDp);
        return lp;
    }

    private View buildTextPane() {
        LinearLayout pane = new LinearLayout(this);
        pane.setOrientation(LinearLayout.VERTICAL);
        cTextBox = new FrameLayout(this);
        cTextBox.setBackground(gradientFor(cBg));
        cText = new EditText(this);
        cText.setHint("Type a status");
        cText.setHintTextColor(0x99FFFFFF);
        cText.setTextColor(Color.WHITE);
        cText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
        cText.setTypeface(Typeface.DEFAULT_BOLD);
        cText.setGravity(Gravity.CENTER);
        cText.setBackground(null);
        cText.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        cText.setFilters(new InputFilter[]{new InputFilter.LengthFilter(700)});
        cText.setPadding(dp(20), dp(20), dp(20), dp(20));
        cTextBox.addView(cText, new FrameLayout.LayoutParams(-1, -1));
        pane.addView(cTextBox, new LinearLayout.LayoutParams(-1, dp(280)));

        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        LinearLayout sw = new LinearLayout(this);
        sw.setOrientation(LinearLayout.HORIZONTAL);
        for (final String bgv : BACKGROUNDS) {
            View dot = new View(this);
            dot.setBackground(gradientFor(bgv));
            dot.setOutlineProvider(new android.view.ViewOutlineProvider() {
                @Override public void getOutline(View v, android.graphics.Outline o) { o.setOval(0, 0, v.getWidth(), v.getHeight()); }
            });
            dot.setClipToOutline(true);
            dot.setOnClickListener(v -> { cBg = bgv; cTextBox.setBackground(gradientFor(cBg)); });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(40), dp(40));
            lp.setMargins(0, 0, dp(10), 0);
            sw.addView(dot, lp);
        }
        hs.addView(sw);
        pane.addView(hs, gap(14));
        return pane;
    }

    private View buildMediaPane() {
        LinearLayout pane = new LinearLayout(this);
        pane.setOrientation(LinearLayout.VERTICAL);
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        TextView photo = text("\uD83D\uDCF7  Choose photo", 15, Color.WHITE, true);
        photo.setGravity(Gravity.CENTER);
        photo.setPadding(0, dp(14), 0, dp(14));
        photo.setBackground(NecpraConversationsActivity.rounded(t.accent, 12, this));
        photo.setOnClickListener(v -> pickPhoto.launch("image/*"));
        TextView video = text("\uD83C\uDFAC  Choose video", 15, Color.WHITE, true);
        video.setGravity(Gravity.CENTER);
        video.setPadding(0, dp(14), 0, dp(14));
        video.setBackground(NecpraConversationsActivity.rounded(t.accent, 12, this));
        video.setOnClickListener(v -> pickVideo.launch("video/*"));
        LinearLayout.LayoutParams l1 = new LinearLayout.LayoutParams(0, -2, 1f);
        l1.setMargins(0, 0, dp(6), 0);
        LinearLayout.LayoutParams l2 = new LinearLayout.LayoutParams(0, -2, 1f);
        l2.setMargins(dp(6), 0, 0, 0);
        row.addView(photo, l1);
        row.addView(video, l2);
        pane.addView(row, new LinearLayout.LayoutParams(-1, -2));

        cPreview = new ImageView(this);
        cPreview.setScaleType(ImageView.ScaleType.CENTER_CROP);
        cPreview.setBackground(NecpraConversationsActivity.rounded(t.surface, 12, this));
        cPreview.setClipToOutline(true);
        cPreview.setVisibility(View.GONE);
        pane.addView(cPreview, new LinearLayout.LayoutParams(-1, dp(260)));
        ((LinearLayout.LayoutParams) cPreview.getLayoutParams()).topMargin = dp(14);

        cMediaInfo = text("Statuses stay up for 24 hours. Videos are limited to 20 seconds.", 13, t.subtext, false);
        pane.addView(cMediaInfo, gap(10));
        cCaption = field("Add a caption (optional)", 600, true);
        pane.addView(cCaption, gap(14));
        return pane;
    }

    private View buildPollPane() {
        LinearLayout pane = new LinearLayout(this);
        pane.setOrientation(LinearLayout.VERTICAL);
        cPollQ = field("Ask a question", 200, true);
        pane.addView(cPollQ, new LinearLayout.LayoutParams(-1, -2));
        cPollBox = new LinearLayout(this);
        cPollBox.setOrientation(LinearLayout.VERTICAL);
        pane.addView(cPollBox, gap(0));
        addPollOption();
        addPollOption();
        final TextView add = text("+ Add option", 15, t.accent, true);
        add.setPadding(dp(4), dp(14), dp(4), dp(4));
        add.setOnClickListener(v -> {
            if (cPollOpts.size() >= 6) { toast("Polls can have up to 6 options"); return; }
            addPollOption();
        });
        pane.addView(add);
        return pane;
    }

    private void addPollOption() {
        EditText et = field("Option " + (cPollOpts.size() + 1), 100, false);
        cPollOpts.add(et);
        cPollBox.addView(et, gap(10));
    }

    private View buildLinkPane() {
        LinearLayout pane = new LinearLayout(this);
        pane.setOrientation(LinearLayout.VERTICAL);
        cLink = field("https://\u2026", 500, false);
        cLink.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        pane.addView(cLink, new LinearLayout.LayoutParams(-1, -2));
        cLinkCaption = field("Say something about this link", 600, true);
        pane.addView(cLinkCaption, gap(12));
        return pane;
    }

    private void onMediaPicked(Uri uri, boolean video) {
        if (uri == null || composer == null) return;
        cMediaUri = uri;
        cMediaVideo = video;
        cVideoMs = 0;
        if (video) {
            try {
                MediaMetadataRetriever mr = new MediaMetadataRetriever();
                mr.setDataSource(this, uri);
                String d = mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                cVideoMs = d == null ? 0 : Long.parseLong(d);
                android.graphics.Bitmap frame = mr.getFrameAtTime(0);
                mr.release();
                cPreview.setImageBitmap(frame);
            } catch (Throwable e) {
                cPreview.setImageDrawable(null);
            }
            String sec = cVideoMs > 0 ? (cVideoMs / 1000) + "s" : "";
            cMediaInfo.setText("\uD83C\uDFAC " + queryName(uri) + (sec.isEmpty() ? "" : " \u00B7 " + sec)
                    + (cVideoMs > 20_500 ? "\nOnly the first 20 seconds will be used." : ""));
        } else {
            final Uri u = uri;
            reads.execute(() -> {
                final Bitmap b = decodeForPreview(u);
                ui.post(() -> { if (composer != null && u.equals(cMediaUri)) cPreview.setImageBitmap(b); });
            });
            cMediaInfo.setText("\uD83D\uDCF7 " + queryName(uri));
        }
        cPreview.setVisibility(View.VISIBLE);
        refreshFooter();
    }

    private Bitmap decodeForPreview(Uri uri) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            try (InputStream in = getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(in, null, o); }
            int sample = 1;
            while (Math.max(o.outWidth, o.outHeight) / (sample * 2) >= 900) sample *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = sample;
            try (InputStream in = getContentResolver().openInputStream(uri)) { return BitmapFactory.decodeStream(in, null, o2); }
        } catch (Throwable e) {
            return null;
        }
    }

    private String queryName(Uri uri) {
        try (android.database.Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (Throwable ignored) { }
        return "selected file";
    }

    private boolean composerHasContent() {
        return !cText.getText().toString().trim().isEmpty() || cMediaUri != null
                || !cPollQ.getText().toString().trim().isEmpty() || !cLink.getText().toString().trim().isEmpty();
    }

    private void requestCloseComposer() {
        if (publishing) return;
        if (!composerHasContent()) { closeComposer(); return; }
        new AlertDialog.Builder(this).setTitle("Discard this status?")
                .setNegativeButton("Keep editing", null)
                .setPositiveButton("Discard", (d, w) -> closeComposer()).show();
    }

    private void closeComposer() {
        if (composer == null) return;
        hideKeyboard(composer);
        root.removeView(composer);
        composer = null;
        cMediaUri = null;
        View fab = root.findViewWithTag("fab");
        if (fab != null && viewer == null) fab.setVisibility(View.VISIBLE);
    }

    private void setPublishing(boolean on, String label) {
        publishing = on;
        if (cPublish == null) return;
        cPublish.setEnabled(!on);
        cPublish.setAlpha(on ? 0.6f : 1f);
        cPublish.setText(label);
    }

    private void publish() {
        if (publishing || composer == null) return;
        final int tabAtStart = cTab;
        final String type;
        final String content, caption, linkUrl;
        final List<String> options = new ArrayList<>();

        if (tabAtStart == 0) {
            type = "text";
            content = cText.getText().toString().trim();
            caption = "";
            linkUrl = "";
            if (content.isEmpty()) { toast("Type something first"); return; }
        } else if (tabAtStart == 1) {
            if (cMediaUri == null) { toast("Choose a photo or video first"); return; }
            type = cMediaVideo ? "video" : "image";
            content = "";
            caption = cCaption.getText().toString().trim();
            linkUrl = "";
        } else if (tabAtStart == 2) {
            type = "poll";
            content = cPollQ.getText().toString().trim();
            caption = "";
            linkUrl = "";
            if (content.isEmpty()) { toast("A poll needs a question"); return; }
            Set<String> uniq = new HashSet<>();
            for (EditText et : cPollOpts) {
                String o = et.getText().toString().trim();
                if (!o.isEmpty()) {
                    if (!uniq.add(o.toLowerCase(Locale.ROOT))) { toast("Poll options must be different"); return; }
                    options.add(o);
                }
            }
            if (options.size() < 2) { toast("Polls need at least 2 options"); return; }
        } else {
            type = "link";
            linkUrl = cLink.getText().toString().trim();
            content = cLinkCaption.getText().toString().trim();
            caption = "";
            if (!linkUrl.matches("^https?://\\S+$")) { toast("Enter a link that starts with http:// or https://"); return; }
        }

        final Uri media = cMediaUri;
        final boolean isVideo = cMediaVideo;
        final long videoMs = cVideoMs;
        final String bg = cBg, privacy = cPrivacy, target = isVideo ? cTarget : "status";
        final int dur = DURATIONS[cDurationIdx];
        hideKeyboard(composer);
        setPublishing(true, "Publishing\u2026");

        io.execute(() -> {
            File temp = null;
            try {
                JSONObject body = new JSONObject();
                body.put("type", type);
                body.put("content", content);
                body.put("caption", caption);
                body.put("background", bg);
                body.put("font", "system-ui");
                body.put("publicationTarget", target);
                body.put("vibeDurationHours", 24);
                body.put("privacy", privacy);
                body.put("privacyList", new JSONArray());
                body.put("durationSeconds", dur);
                body.put("topics", new JSONArray());
                body.put("allowReplies", true);
                body.put("allowReactions", true);
                body.put("allowSharing", true);
                body.put("stickers", new JSONArray());
                body.put("linkUrl", linkUrl);
                if ("poll".equals(type)) body.put("pollOptions", new JSONArray(options));

                if (media != null) {
                    String mime;
                    String fileName;
                    Src src;
                    Map<String, String> fields = new LinkedHashMap<>();
                    if (isVideo) {
                        mime = firstNonEmpty(getContentResolver().getType(media), "video/mp4");
                        fileName = queryName(media);
                        final Uri mu = media;
                        src = () -> {
                            InputStream in = getContentResolver().openInputStream(mu);
                            if (in == null) throw new IOException("Could not open the video");
                            return in;
                        };
                        long srcSec = Math.max(0, videoMs / 1000);
                        fields.put("trimStart", "0");
                        fields.put("trimEnd", String.valueOf(srcSec > 0 ? Math.min(20, srcSec) : 20));
                        fields.put("sourceDuration", String.valueOf(srcSec));
                    } else {
                        ui.post(() -> setPublishing(true, "Preparing photo\u2026"));
                        temp = prepareImage(media);
                        final File tf = temp;
                        mime = "image/jpeg";
                        fileName = "status.jpg";
                        src = () -> new java.io.FileInputStream(tf);
                        fields.put("trimStart", "0");
                        fields.put("trimEnd", "0");
                        fields.put("sourceDuration", "0");
                    }
                    ui.post(() -> setPublishing(true, "Uploading\u2026"));
                    JSONObject up = uploadMultipart("/api/cloudinary/direct-upload", "file", fileName, mime, src, fields);
                    JSONObject uploaded = up.optJSONObject("data") != null && up.optJSONObject("data").optJSONObject("cloudinary") != null
                            ? up.optJSONObject("data").optJSONObject("cloudinary")
                            : (up.optJSONObject("cloudinary") != null ? up.optJSONObject("cloudinary") : up);
                    String url = firstNonEmpty(str(uploaded, "url"), str(uploaded, "secure_url"), str(up, "url"));
                    String publicId = firstNonEmpty(str(uploaded, "public_id"), str(uploaded, "publicId"), str(up, "publicId"));
                    if (url.isEmpty()) throw new ApiException(502, "Media upload succeeded but no media URL was returned");
                    body.put("mediaUrl", url);
                    if (!publicId.isEmpty()) body.put("mediaPublicId", publicId);
                    body.put("mediaMime", mime);
                }

                ui.post(() -> setPublishing(true, "Publishing\u2026"));
                JSONObject created = request("POST", "/api/status", body);
                JSONObject st = created.optJSONObject("status");
                if (st == null && created.optJSONObject("data") != null) {
                    JSONObject d = created.optJSONObject("data");
                    st = d.optJSONObject("status") != null ? d.optJSONObject("status") : d;
                }
                final JSONObject fst = st;
                ui.post(() -> {
                    if (fst != null && fst.has("id") && !"vibe".equals(str(fst, "publicationTarget"))) {
                        JSONArray next = new JSONArray();
                        next.put(fst);
                        for (int i = 0; i < mine.length(); i++) {
                            JSONObject o = mine.optJSONObject(i);
                            if (o != null && !idOf(o).equals(idOf(fst))) next.put(o);
                        }
                        mine = next;
                    }
                    changed = true;
                    saveCache();
                    closeComposer();
                    publishing = false;
                    render();
                    toast("vibe".equals(target) ? "Your Vibe is live" : "both".equals(target) ? "Your Status and Vibe are live" : "Your status is live for 24 hours");
                    pullAll();
                });
            } catch (OfflineException oe) {
                ui.post(() -> { setPublishing(false, "Publish"); toast("You're offline \u2014 connect to publish"); });
            } catch (NativeBackgroundSync.SessionExpiredException se) {
                ui.post(this::sessionExpired);
            } catch (Throwable e) {
                final String m = e instanceof ApiException ? e.getMessage() : "Couldn't publish: " + (e.getMessage() == null ? "unknown error" : e.getMessage());
                ui.post(() -> { setPublishing(false, "Publish"); toast(m); });
            } finally {
                if (temp != null) { try { temp.delete(); } catch (Throwable ignored) { } }
            }
        });
    }

    /** Downscales (max 1600px) + re-encodes the photo so uploads are fast; honours EXIF rotation. */
    private File prepareImage(Uri uri) throws IOException {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(in, null, o); }
        int sample = 1;
        while (Math.max(o.outWidth, o.outHeight) / (sample * 2) >= 2400) sample *= 2;
        BitmapFactory.Options o2 = new BitmapFactory.Options();
        o2.inSampleSize = sample;
        Bitmap b;
        try (InputStream in = getContentResolver().openInputStream(uri)) { b = BitmapFactory.decodeStream(in, null, o2); }
        if (b == null) throw new IOException("Could not read the photo");

        int rot = 0;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in != null) {
                android.media.ExifInterface ex = new android.media.ExifInterface(in);
                int ori = ex.getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, android.media.ExifInterface.ORIENTATION_NORMAL);
                if (ori == android.media.ExifInterface.ORIENTATION_ROTATE_90) rot = 90;
                else if (ori == android.media.ExifInterface.ORIENTATION_ROTATE_180) rot = 180;
                else if (ori == android.media.ExifInterface.ORIENTATION_ROTATE_270) rot = 270;
            }
        } catch (Throwable ignored) { }
        if (rot != 0) {
            Matrix m = new Matrix();
            m.postRotate(rot);
            b = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
        }
        float sc = 1600f / Math.max(b.getWidth(), b.getHeight());
        if (sc < 1f) b = Bitmap.createScaledBitmap(b, Math.round(b.getWidth() * sc), Math.round(b.getHeight() * sc), true);

        File f = File.createTempFile("status_", ".jpg", getCacheDir());
        try (FileOutputStream fo = new FileOutputStream(f)) { b.compress(Bitmap.CompressFormat.JPEG, 85, fo); }
        return f;
    }
}
