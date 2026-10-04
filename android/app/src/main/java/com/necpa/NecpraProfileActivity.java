package com.necpa;

import android.Manifest;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.ExifInterface;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.SwitchCompat;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native Profile / Edit Profile / Account / Security / Settings screen.
 *
 * It talks to the SAME backend endpoints the web Settings module already uses (no new backend):
 *   GET  /api/settings              profile + privacy + notification settings (data.settings.*)
 *   PUT  /api/settings/profile      displayName / username / bio
 *   PUT  /api/settings/privacy      privacy toggles
 *   PUT  /api/settings/notifications notification toggles
 *   POST /api/profile/avatar        multipart field "avatar" -> data.pictureUrl
 *   GET  /api/auth/sessions         active sessions (read only)
 *   POST /api/auth/logout
 *
 * It uses the native layers that already exist:
 *   - session:     tokens are read from the Keystore-encrypted necpra_native_auth prefs and refreshed
 *                  through NativeBackgroundSync.refreshSession (single-flight with the background worker)
 *   - biometrics:  same unlock window / prompt rules as NecpraNativePlugin.promptUnlock
 *   - picker/camera: system picker + FileProvider camera capture (same provider as takePhoto)
 *   - offline:     the encrypted background snapshot is the first-paint fallback; the last good profile,
 *                  a tiny avatar thumbnail and not-yet-synced profile edits are kept encrypted in the
 *                  auth prefs, so NativeBackgroundSync.clearAll() (logout) wipes them with the tokens.
 * No credential is ever written to WebView storage by this screen.
 */
public class NecpraProfileActivity extends AppCompatActivity {

    static final String EXTRA_SECTION = "section";
    static final String RES_LOGGED_OUT = "loggedOut";
    static final String RES_SESSION_EXPIRED = "sessionExpired";
    static final String RES_LOCKED = "locked";
    static final String RES_CHANGED = "profileChanged";

    private static final long UNLOCK_WINDOW_MS = 15 * 60 * 1000L; // must match NecpraNativePlugin
    private static final String K_PROFILE = "np_profile";
    private static final String K_OWNER = "np_owner";
    private static final String K_AVATAR = "np_avatar";
    private static final String K_AVATAR_URL = "np_avatar_url";
    private static final String K_PENDING = "np_pending";
    private static final int MAX_BIO = 150;

    private static final class ApiException extends Exception {
        final int status;
        ApiException(int status, String message) { super(message); this.status = status; }
    }

    private static final class OfflineException extends Exception {
        OfflineException(Throwable cause) { super("offline", cause); }
    }

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());

    // palette
    private boolean night;
    private int cBg, cCard, cText, cSub, cLine;
    private static final int C_PRIMARY = Color.parseColor("#2563EB");
    private static final int C_DANGER = Color.parseColor("#DC2626");

    // views
    private LinearLayout body;
    private TextView titleView;
    private TextView backView;
    private TextView banner;
    private ScrollView scroll;
    private ImageView avatarImage;
    private TextView avatarInitial;

    // state
    private JSONObject settings = new JSONObject();
    private String screen = "home";
    private boolean offline = false;
    private boolean built = false;
    private boolean changed = false;
    private boolean finishing = false;
    private Bitmap avatarBitmap;
    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback netCallback;
    private ActivityResultLauncher<String> pickImage;
    private ActivityResultLauncher<Uri> takePicture;
    private ActivityResultLauncher<String> cameraPermission;
    private Uri cameraUri;
    private File cameraFile;

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        try {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        } catch (Exception ignored) {}
        super.onCreate(savedInstanceState);

        night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        cBg = night ? Color.parseColor("#0B1220") : Color.parseColor("#F3F4F6");
        cCard = night ? Color.parseColor("#151E2E") : Color.WHITE;
        cText = night ? Color.parseColor("#F3F4F6") : Color.parseColor("#111827");
        cSub = night ? Color.parseColor("#9CA3AF") : Color.parseColor("#6B7280");
        cLine = night ? Color.parseColor("#243044") : Color.parseColor("#E5E7EB");

        // Launchers must be registered before the activity is STARTED.
        pickImage = registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
            if (uri != null) uploadAvatar(uri);
        });
        takePicture = registerForActivityResult(new ActivityResultContracts.TakePicture(), ok -> {
            if (Boolean.TRUE.equals(ok) && cameraUri != null) uploadAvatar(cameraUri);
        });
        cameraPermission = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (Boolean.TRUE.equals(granted)) launchCamera();
            else toast("Camera permission was denied");
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (!"home".equals(screen)) show("home");
                else closeScreen();
            }
        });

        cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);

        if (!hasSession()) {
            Intent r = new Intent().putExtra(RES_SESSION_EXPIRED, true);
            setResult(RESULT_OK, r);
            finishing = true;
            finish();
            return;
        }

        buildFrame();
        final String requested = getIntent() == null ? null : getIntent().getStringExtra(EXTRA_SECTION);
        ensureUnlocked(() -> {
            built = true;
            loadCached();
            show(sectionFor(requested));
            syncNow();
        });
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (cm != null && netCallback == null) {
            netCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) { ui.post(NecpraProfileActivity.this::syncNow); }
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
        try {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            if (Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false);
        } catch (Throwable ignored) {}
        // Re-lock: if the unlock window ran out while the app was in the background, ask again.
        if (built && !finishing && !isUnlockedNow()) {
            body.setVisibility(View.INVISIBLE);
            ensureUnlocked(() -> body.setVisibility(View.VISIBLE));
        }
    }

    @Override
    protected void onDestroy() {
        io.shutdownNow();
        super.onDestroy();
    }

    private String sectionFor(String requested) {
        if ("edit".equals(requested) || "account".equals(requested)
                || "security".equals(requested) || "settings".equals(requested)) return requested;
        return "home";
    }

    private void closeScreen() {
        Intent r = new Intent();
        r.putExtra(RES_CHANGED, changed);
        if (changed) {
            JSONObject a = acct();
            r.putExtra("avatar", a.optString("avatar", ""));
            r.putExtra("username", a.optString("username", ""));
            r.putExtra("displayName", displayName());
            r.putExtra("bio", a.optString("bio", ""));
        }
        setResult(RESULT_OK, r);
        finishing = true;
        finish();
    }

    // ------------------------------------------------------------------
    // Session / lock (native layer)
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
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
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
                .setSubtitle("Verify your identity to open your profile")
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

    // ------------------------------------------------------------------
    // Cache (encrypted, wiped by NativeBackgroundSync.clearAll on logout)
    // ------------------------------------------------------------------

    private JSONObject acct() {
        JSONObject a = settings.optJSONObject("account");
        return a == null ? new JSONObject() : a;
    }

    private static JSONObject settingsFrom(JSONObject root) {
        if (root == null) return null;
        JSONObject d = root.optJSONObject("data");
        if (d != null) {
            JSONObject s = d.optJSONObject("settings");
            if (s != null) return s;
        }
        JSONObject s = root.optJSONObject("settings");
        if (s != null) return s;
        return root.has("account") ? root : null;
    }

    private void loadCached() {
        JSONObject cached = null;
        try {
            SharedPreferences p = authPrefs();
            String owner = p.getString(K_OWNER, null) == null ? "" : NativeBackgroundSync.getDecrypted(p, K_OWNER);
            String me = currentUserId();
            // A cache that belongs to a different account is never shown.
            if (owner != null && (me.isEmpty() || owner.equals(me))) {
                String raw = p.getString(K_PROFILE, null) == null ? null : NativeBackgroundSync.getDecrypted(p, K_PROFILE);
                if (raw != null && !raw.isEmpty()) cached = new JSONObject(raw);
            } else {
                p.edit().remove(K_PROFILE).remove(K_OWNER).remove(K_AVATAR).remove(K_AVATAR_URL).remove(K_PENDING).commit();
            }
        } catch (Exception ignored) {}

        if (cached == null) {
            // First paint from the encrypted background snapshot that WorkManager already keeps.
            try {
                String snap = NativeBackgroundSync.readSnapshot(this);
                if (snap != null) cached = settingsFrom(new JSONObject(snap).optJSONObject("settings"));
            } catch (Exception ignored) {}
        }
        if (cached != null) settings = cached;
        applyPendingLocally();
        loadCachedAvatar();
    }

    private void saveCache() {
        try {
            SharedPreferences p = authPrefs();
            NativeBackgroundSync.putEncrypted(p, K_OWNER, currentUserId());
            NativeBackgroundSync.putEncrypted(p, K_PROFILE, settings.toString());
        } catch (Exception ignored) {}
    }

    private JSONObject pending() {
        try {
            SharedPreferences p = authPrefs();
            if (p.getString(K_PENDING, null) == null) return new JSONObject();
            String raw = NativeBackgroundSync.getDecrypted(p, K_PENDING);
            return raw == null || raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private void savePending(JSONObject o) {
        try {
            NativeBackgroundSync.putEncrypted(authPrefs(), K_PENDING, o == null || o.length() == 0 ? null : o.toString());
        } catch (Exception ignored) {}
    }

    private void applyPendingLocally() {
        JSONObject pend = pending();
        if (pend.length() == 0) return;
        try {
            JSONObject a = settings.optJSONObject("account");
            if (a == null) { a = new JSONObject(); settings.put("account", a); }
            JSONArray names = pend.names();
            for (int i = 0; names != null && i < names.length(); i++) {
                String k = names.getString(i);
                a.put(k, pend.get(k));
                if ("displayName".equals(k)) a.put("firstName", pend.get(k));
            }
        } catch (Exception ignored) {}
    }

    private void loadCachedAvatar() {
        avatarBitmap = null;
        try {
            SharedPreferences p = authPrefs();
            if (p.getString(K_AVATAR, null) == null) return;
            String b64 = NativeBackgroundSync.getDecrypted(p, K_AVATAR);
            if (b64 == null || b64.isEmpty()) return;
            byte[] bytes = Base64.decode(b64, Base64.NO_WRAP);
            avatarBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception ignored) {}
    }

    private void cacheAvatarBytes(String url, byte[] jpegThumb) {
        try {
            SharedPreferences p = authPrefs();
            NativeBackgroundSync.putEncrypted(p, K_AVATAR, Base64.encodeToString(jpegThumb, Base64.NO_WRAP));
            NativeBackgroundSync.putEncrypted(p, K_AVATAR_URL, url == null ? "" : url);
        } catch (Exception ignored) {}
    }

    // ------------------------------------------------------------------
    // Network (same backend, same token refresh as the rest of the native layer)
    // ------------------------------------------------------------------

    private JSONObject request(String method, String path, JSONObject json, byte[] file, String field) throws Exception {
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
                c.setReadTimeout(45000);
                c.setUseCaches(false);
                c.setRequestProperty("Accept", "application/json");
                c.setRequestProperty("Authorization", "Bearer " + access);
                if (file != null) {
                    String boundary = "----NecpraBoundary" + System.currentTimeMillis();
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                    try (OutputStream out = c.getOutputStream()) {
                        String head = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + field
                                + "\"; filename=\"" + field + ".jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
                        out.write(head.getBytes(StandardCharsets.UTF_8));
                        out.write(file);
                        out.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
                    }
                } else if (json != null) {
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    try (OutputStream out = c.getOutputStream()) {
                        out.write(json.toString().getBytes(StandardCharsets.UTF_8));
                    }
                }
                status = c.getResponseCode();
                text = NativeBackgroundSync.readText(status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream());
            } catch (java.io.IOException io) {
                throw new OfflineException(io);
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
            if (status < 200 || status >= 300) {
                String msg = parsed.optString("message", parsed.optString("error", "Request failed (HTTP " + status + ")"));
                throw new ApiException(status, msg);
            }
            return parsed;
        }
    }

    private String refreshOrOffline() throws Exception {
        try {
            return NativeBackgroundSync.refreshSession(this);
        } catch (java.io.IOException io) {
            throw new OfflineException(io);
        }
    }

    /** Runs a network job off the UI thread and routes the shared failure cases. */
    private interface Job { void run() throws Exception; }

    private void background(Job job, Runnable onOffline, java.util.function.Consumer<String> onError) {
        io.execute(() -> {
            try {
                job.run();
            } catch (OfflineException oe) {
                ui.post(() -> { setOffline(true); if (onOffline != null) onOffline.run(); });
            } catch (NativeBackgroundSync.SessionExpiredException se) {
                ui.post(this::sessionExpired);
            } catch (ApiException ae) {
                ui.post(() -> { if (onError != null) onError.accept(ae.getMessage()); });
            } catch (Throwable t) {
                ui.post(() -> { if (onError != null) onError.accept("Something went wrong. Please try again."); });
            }
        });
    }

    private void sessionExpired() {
        if (finishing) return;
        NativeBackgroundSync.clearAll(this);
        setResult(RESULT_OK, new Intent().putExtra(RES_SESSION_EXPIRED, true));
        finishing = true;
        finish();
    }

    private void syncNow() {
        if (!built || finishing) return;
        background(() -> {
            // 1) push profile edits made while offline
            JSONObject pend = pending();
            if (pend.length() > 0) {
                try {
                    request("PUT", "/api/settings/profile", pend, null, null);
                    savePending(null);
                } catch (ApiException rejected) {
                    if (rejected.status >= 500 || rejected.status == 429) throw rejected; // transient: keep and retry later
                    savePending(null); // the server definitively refused it; keeping it would block sync forever
                    ui.post(() -> toast("An edit made offline could not be applied: " + rejected.getMessage()));
                }
            }
            // 2) pull the authoritative copy
            JSONObject root = request("GET", "/api/settings", null, null, null);
            JSONObject s = settingsFrom(root);
            if (s == null) return;
            ui.post(() -> {
                settings = s;
                saveCache();
                setOffline(false);
                refreshAvatarFromUrl();
                show(screen, true);
            });
        }, null, msg -> toast(msg));
    }

    private void setOffline(boolean value) {
        offline = value;
        if (banner == null) return;
        if (value) {
            boolean hasPending = pending().length() > 0;
            banner.setText(hasPending
                    ? "Offline. Your changes are saved and will sync when you reconnect."
                    : "Offline. Showing your saved profile.");
            banner.setVisibility(View.VISIBLE);
        } else {
            banner.setVisibility(View.GONE);
        }
    }

    // ------------------------------------------------------------------
    // Avatar: native picker / native camera -> downscale -> upload
    // ------------------------------------------------------------------

    private void chooseAvatarSource() {
        new AlertDialog.Builder(this)
                .setTitle("Profile photo")
                .setItems(new CharSequence[]{"Take a photo", "Choose from gallery"}, (d, which) -> {
                    if (which == 0) startCamera();
                    else pickImage.launch("image/*");
                })
                .show();
    }

    private void startCamera() {
        // The manifest declares CAMERA, so ACTION_IMAGE_CAPTURE needs the runtime grant first.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchCamera();
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA);
        }
    }

    private void launchCamera() {
        try {
            File f = new File(getCacheDir(), "necpra-photo-" + System.currentTimeMillis() + ".jpg");
            cameraFile = f;
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f);
            takePicture.launch(cameraUri);
        } catch (Exception e) {
            toast("Camera could not be opened");
        }
    }

    private byte[] downscale(Uri uri, int maxSide, int quality) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new Exception("Not an image");
        int sample = 1;
        while ((bounds.outWidth / sample) > maxSide * 2 || (bounds.outHeight / sample) > maxSide * 2) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap bmp;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            bmp = BitmapFactory.decodeStream(in, null, opts);
        }
        if (bmp == null) throw new Exception("Could not read image");

        int rotation = 0;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in != null) {
                int o = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                if (o == ExifInterface.ORIENTATION_ROTATE_90) rotation = 90;
                else if (o == ExifInterface.ORIENTATION_ROTATE_180) rotation = 180;
                else if (o == ExifInterface.ORIENTATION_ROTATE_270) rotation = 270;
            }
        } catch (Exception ignored) {}

        float scale = Math.min(1f, (float) maxSide / Math.max(bmp.getWidth(), bmp.getHeight()));
        Matrix m = new Matrix();
        if (scale < 1f) m.postScale(scale, scale);
        if (rotation != 0) m.postRotate(rotation);
        Bitmap out = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        out.compress(Bitmap.CompressFormat.JPEG, quality, bo);
        return bo.toByteArray();
    }

    private void uploadAvatar(Uri uri) {
        toast("Uploading photo...");
        final File toDelete = (cameraUri != null && uri.equals(cameraUri)) ? cameraFile : null;
        background(() -> {
            byte[] jpeg = downscale(uri, 1280, 85);
            JSONObject root = request("POST", "/api/profile/avatar", null, jpeg, "avatar");
            JSONObject data = root.optJSONObject("data");
            String url = "";
            if (data != null) {
                url = data.optString("pictureUrl", "");
                if (url.isEmpty()) {
                    JSONObject prof = data.optJSONObject("profile");
                    if (prof != null) url = prof.optString("profilePicture", prof.optString("avatar", ""));
                }
            }
            if (url.isEmpty()) throw new ApiException(502, "Photo was uploaded but the server returned no photo URL");
            final String finalUrl = url;
            byte[] thumb = downscale(uri, 256, 80);
            cacheAvatarBytes(finalUrl, thumb);
            if (toDelete != null) toDelete.delete();
            ui.post(() -> {
                try {
                    JSONObject a = settings.optJSONObject("account");
                    if (a == null) { a = new JSONObject(); settings.put("account", a); }
                    a.put("avatar", finalUrl);
                } catch (Exception ignored) {}
                avatarBitmap = BitmapFactory.decodeByteArray(thumb, 0, thumb.length);
                changed = true;
                saveCache();
                bindAvatar();
                toast("Profile photo updated");
            });
        }, () -> toast("No connection. Your photo was not changed."), this::toast);
    }

    private void refreshAvatarFromUrl() {
        final String url = acct().optString("avatar", "");
        if (url.isEmpty() || !url.toLowerCase().startsWith("https://")) { bindAvatar(); return; }
        try {
            SharedPreferences p = authPrefs();
            String cachedUrl = p.getString(K_AVATAR_URL, null) == null ? "" : NativeBackgroundSync.getDecrypted(p, K_AVATAR_URL);
            if (url.equals(cachedUrl) && avatarBitmap != null) { bindAvatar(); return; }
        } catch (Exception ignored) {}
        io.execute(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                byte[] raw;
                try (InputStream in = c.getInputStream()) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    int total = 0;
                    while ((n = in.read(buf)) >= 0) {
                        total += n;
                        if (total > 8 * 1024 * 1024) throw new Exception("Avatar too large");
                        bo.write(buf, 0, n);
                    }
                    raw = bo.toByteArray();
                }
                Bitmap full = BitmapFactory.decodeByteArray(raw, 0, raw.length);
                if (full == null) return;
                float s = Math.min(1f, 256f / Math.max(full.getWidth(), full.getHeight()));
                Bitmap thumb = s < 1f
                        ? Bitmap.createScaledBitmap(full, Math.max(1, Math.round(full.getWidth() * s)),
                                Math.max(1, Math.round(full.getHeight() * s)), true)
                        : full;
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                thumb.compress(Bitmap.CompressFormat.JPEG, 80, bo);
                byte[] bytes = bo.toByteArray();
                cacheAvatarBytes(url, bytes);
                ui.post(() -> {
                    avatarBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    bindAvatar();
                });
            } catch (Throwable ignored) {
                // Keep whatever thumbnail we already have; the initial letter is the fallback.
            } finally {
                if (c != null) c.disconnect();
            }
        });
    }

    private void bindAvatar() {
        if (avatarImage == null || avatarInitial == null) return;
        String n = displayName();
        avatarInitial.setText(n.isEmpty() ? "?" : n.substring(0, 1).toUpperCase());
        if (avatarBitmap != null) {
            avatarImage.setImageBitmap(avatarBitmap);
            avatarImage.setVisibility(View.VISIBLE);
        } else {
            avatarImage.setVisibility(View.GONE);
        }
    }

    // ------------------------------------------------------------------
    // Screens
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

        titleView = text("Profile", 19, Color.WHITE, true);
        bar.addView(titleView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        banner = text("", 13, Color.WHITE, false);
        banner.setBackgroundColor(Color.parseColor("#B45309"));
        banner.setPadding(dp(16), dp(8), dp(16), dp(8));
        banner.setVisibility(View.GONE);
        root.addView(banner, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(16), dp(16), dp(16), dp(32));
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

    private void show(String name) { show(name, false); }

    private void show(String name, boolean refresh) {
        if (body == null) return;
        // Do not rebuild a form the user is typing in just because a background sync finished.
        if (refresh && ("edit".equals(name))) { return; }
        screen = name;
        body.removeAllViews();
        avatarImage = null;
        avatarInitial = null;
        backView.setVisibility("home".equals(name) ? View.INVISIBLE : View.VISIBLE);
        switch (name) {
            case "edit": titleView.setText("Edit profile"); buildEdit(); break;
            case "account": titleView.setText("Account"); buildAccount(); break;
            case "security": titleView.setText("Security"); buildSecurity(); break;
            case "settings": titleView.setText("Settings"); buildSettings(); break;
            default: titleView.setText("Profile"); buildHome(); break;
        }
        setOffline(offline);
    }

    private void buildHome() {
        LinearLayout card = card();
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.addView(avatarBlock(96), center(96, 96, 0, 8));
        TextView name = text(displayName().isEmpty() ? "Your name" : displayName(), 20, cText, true);
        name.setGravity(Gravity.CENTER);
        card.addView(name);
        String user = acct().optString("username", "");
        if (!user.isEmpty()) {
            TextView u = text("@" + user, 14, cSub, false);
            u.setGravity(Gravity.CENTER);
            card.addView(u);
        }
        String bio = acct().optString("bio", "");
        if (!bio.isEmpty() && !"null".equals(bio)) {
            TextView b = text(bio, 14, cText, false);
            b.setGravity(Gravity.CENTER);
            b.setPadding(0, dp(8), 0, 0);
            card.addView(b);
        }
        Button change = button("Change photo", false, v -> chooseAvatarSource());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        card.addView(change, lp);
        body.addView(card, matchWithBottom(12));

        LinearLayout list = card();
        list.setPadding(0, 0, 0, 0);
        list.addView(row("Edit profile", "Name, username and bio", () -> show("edit")));
        list.addView(divider());
        list.addView(row("Account", "Email and active sessions", () -> show("account")));
        list.addView(divider());
        list.addView(row("Security", "App lock and biometric unlock", () -> show("security")));
        list.addView(divider());
        list.addView(row("Settings", "Privacy and notifications", () -> show("settings")));
        body.addView(list, matchWithBottom(12));

        Button logout = button("Log out", true, v -> confirmLogout());
        body.addView(logout, matchWithBottom(0));
        bindAvatar();
    }

    private void buildEdit() {
        JSONObject a = acct();
        body.addView(avatarBlock(88), center(88, 88, 0, 12));
        body.addView(button("Change photo", false, v -> chooseAvatarSource()), wrapCentered());
        bindAvatar();

        String firstName = a.optString("firstName", "");
        String nameValue = (firstName.isEmpty() || "null".equals(firstName)) ? a.optString("displayName", "") : firstName;
        final EditText name = field("Display name", nameValue, false);
        final EditText username = field("Username", a.optString("username", ""), false);
        String bioValue = a.optString("bio", "");
        final EditText bio = field("Bio", "null".equals(bioValue) ? "" : bioValue, true);
        final TextView counter = text(bio.getText().length() + "/" + MAX_BIO, 12, cSub, false);
        counter.setGravity(Gravity.END);
        bio.addTextChangedListener(new android.text.TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a1, int b1, int c1) {}
            public void onTextChanged(CharSequence s, int a1, int b1, int c1) {}
            public void afterTextChanged(android.text.Editable s) { counter.setText(s.length() + "/" + MAX_BIO); }
        });

        body.addView(label("Display name"));
        body.addView(name, matchWithBottom(8));
        body.addView(label("Username"));
        body.addView(username, matchWithBottom(8));
        body.addView(label("Bio"));
        body.addView(bio, matchWithBottom(0));
        body.addView(counter, matchWithBottom(12));

        body.addView(button("Save", false, v -> {
            String n = name.getText().toString().trim();
            String u = username.getText().toString().trim();
            String b = bio.getText().toString().trim();
            if (u.isEmpty()) { toast("Username cannot be empty"); return; }
            if (b.length() > MAX_BIO) { toast("Bio is limited to " + MAX_BIO + " characters"); return; }
            saveProfile(n, u, b);
        }), matchWithBottom(0));
    }

    private void saveProfile(String newName, String newUser, String newBio) {
        JSONObject a = acct();
        JSONObject patch = new JSONObject();
        try {
            String firstName = a.optString("firstName", "");
            String curName = (firstName.isEmpty() || "null".equals(firstName)) ? a.optString("displayName", "") : firstName;
            String curBio = a.optString("bio", "");
            if ("null".equals(curBio)) curBio = "";
            if (!newName.equals(curName)) patch.put("displayName", newName);
            if (!newUser.equals(a.optString("username", ""))) patch.put("username", newUser);
            if (!newBio.equals(curBio)) patch.put("bio", newBio);
        } catch (Exception ignored) {}
        if (patch.length() == 0) { show("home"); return; }

        background(() -> {
            // Anything still queued from an earlier offline edit goes out together with this one.
            JSONObject merged = pending();
            JSONArray names = patch.names();
            for (int i = 0; names != null && i < names.length(); i++) merged.put(names.getString(i), patch.get(names.getString(i)));
            request("PUT", "/api/settings/profile", merged, null, null);
            savePending(null);
            ui.post(() -> {
                applyPatch(patch);
                changed = true;
                saveCache();
                setOffline(false);
                toast("Profile saved");
                show("home");
            });
        }, () -> {
            // Offline: keep the edit encrypted on the device and sync it on reconnect.
            JSONObject merged = pending();
            try {
                JSONArray names = patch.names();
                for (int i = 0; names != null && i < names.length(); i++) merged.put(names.getString(i), patch.get(names.getString(i)));
            } catch (Exception ignored) {}
            savePending(merged);
            applyPatch(patch);
            changed = true;
            saveCache();
            setOffline(true);
            toast("Saved on this device. Will sync when you're online.");
            show("home");
        }, this::toast);
    }

    private void applyPatch(JSONObject patch) {
        try {
            JSONObject a = settings.optJSONObject("account");
            if (a == null) { a = new JSONObject(); settings.put("account", a); }
            JSONArray names = patch.names();
            for (int i = 0; names != null && i < names.length(); i++) {
                String k = names.getString(i);
                a.put(k, patch.get(k));
                if ("displayName".equals(k)) a.put("firstName", patch.get(k));
            }
        } catch (Exception ignored) {}
    }

    private void buildAccount() {
        JSONObject a = acct();
        LinearLayout c = card();
        c.addView(kv("Email", a.optString("email", "-")));
        c.addView(divider());
        c.addView(kv("Username", a.optString("username", "-")));
        c.addView(divider());
        c.addView(kv("Account ID", String.valueOf(a.opt("id") == null ? "-" : a.opt("id"))));
        body.addView(c, matchWithBottom(12));

        body.addView(label("Active sessions"));
        final LinearLayout sessions = card();
        TextView loading = text(offline ? "Sessions are available when you're online." : "Loading...", 14, cSub, false);
        sessions.addView(loading);
        body.addView(sessions, matchWithBottom(0));
        if (offline) return;

        background(() -> {
            JSONObject root = request("GET", "/api/auth/sessions", null, null, null);
            JSONArray arr = root.optJSONArray("data");
            ui.post(() -> {
                if (!"account".equals(screen)) return;
                sessions.removeAllViews();
                if (arr == null || arr.length() == 0) {
                    sessions.addView(text("No other active sessions reported.", 14, cSub, false));
                    return;
                }
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject s = arr.optJSONObject(i);
                    if (s == null) continue;
                    if (i > 0) sessions.addView(divider());
                    String ua = s.optString("userAgent", "Unknown device");
                    String when = s.optString("createdAt", "");
                    sessions.addView(kv(ua.length() > 48 ? ua.substring(0, 48) + "..." : ua, when.length() >= 10 ? when.substring(0, 10) : when));
                }
            });
        }, () -> { if ("account".equals(screen)) { sessions.removeAllViews(); sessions.addView(text("Sessions are available when you're online.", 14, cSub, false)); } },
                msg -> { if ("account".equals(screen)) { sessions.removeAllViews(); sessions.addView(text("Could not load sessions.", 14, cSub, false)); } });
    }

    private void buildSecurity() {
        LinearLayout c = card();
        int auth = BiometricManager.from(this).canAuthenticate(Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? (BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                : BiometricManager.Authenticators.BIOMETRIC_WEAK);
        String status = auth == BiometricManager.BIOMETRIC_SUCCESS ? "Available"
                : auth == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ? "Not set up on this device"
                : "Not available on this device";
        c.addView(kv("Biometric / device lock", status));
        c.addView(divider());
        c.addView(kv("Session storage", "Encrypted with Android Keystore"));
        c.addView(divider());
        c.addView(kv("Auto-lock after", "15 minutes"));
        body.addView(c, matchWithBottom(12));

        body.addView(button("Verify with biometrics", false, v -> {
            authPrefs().edit().putLong("unlockedUntil", 0L).commit();
            body.setVisibility(View.INVISIBLE);
            ensureUnlocked(() -> { body.setVisibility(View.VISIBLE); toast("Verified"); });
        }), matchWithBottom(8));

        body.addView(button("Lock now", false, v -> {
            // Withholds the session from the WebView until the user unlocks again.
            authPrefs().edit().putLong("unlockedUntil", 0L).commit();
            setResult(RESULT_OK, new Intent().putExtra(RES_LOCKED, true).putExtra(RES_CHANGED, changed));
            finishing = true;
            finish();
        }), matchWithBottom(0));
    }



    private View toggle(String title, boolean value, final String section, final String key) {
        return toggleRaw(title, value, (b, on) -> saveSetting(section, key, on, b, !on));
    }

    private View toggleRaw(String title, boolean value, final ToggleListener l) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(16), dp(14), dp(16), dp(14));
        TextView t = text(title, 16, cText, false);
        row.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        final SwitchCompat sw = new SwitchCompat(this);
        sw.setChecked(value);
        sw.setEnabled(!offline);
        final boolean[] programmatic = {false};
        sw.setOnCheckedChangeListener((b, on) -> {
            if (programmatic[0]) return;
            programmatic[0] = true; // block re-entry while the save is in flight; saveSetting reverts on failure
            l.onToggle(new SwitchHandle(sw, programmatic), on);
        });
        row.addView(sw);
        return row;
    }

    private interface ToggleListener { void onToggle(SwitchHandle h, boolean on); }

    private static final class SwitchHandle {
        final SwitchCompat sw; final boolean[] lock;
        SwitchHandle(SwitchCompat sw, boolean[] lock) { this.sw = sw; this.lock = lock; }
        void revertTo(boolean value) { sw.setChecked(value); lock[0] = false; }
        void release() { lock[0] = false; }
    }



    // ------------------------------------------------------------------
    // Logout
    // ------------------------------------------------------------------

    private void confirmLogout() {
        new AlertDialog.Builder(this)
                .setTitle("Log out?")
                .setMessage("You will need to sign in again on this device.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Log out", (d, w) -> doLogout())
                .show();
    }

    private void doLogout() {
        io.execute(() -> {
            // Best effort: tell the server, but never block signing out on the network.
            try { request("POST", "/api/auth/logout", new JSONObject(), null, null); } catch (Throwable ignored) {}
            // Tokens, userJson, encrypted offline snapshot, background status AND this screen's
            // cached profile / avatar / pending edits (they live in the same auth prefs).
            NativeBackgroundSync.clearAll(getApplicationContext());
            ui.post(() -> {
                setResult(RESULT_OK, new Intent().putExtra(RES_LOGGED_OUT, true));
                finishing = true;
                finish();
            });
        });
    }

    // ------------------------------------------------------------------
    // View helpers
    // ------------------------------------------------------------------

    private String displayName() {
        JSONObject a = acct();
        String f = a.optString("firstName", "");
        String l = a.optString("lastName", "");
        if ("null".equals(f)) f = "";
        if ("null".equals(l)) l = "";
        String full = (f + " " + l).trim();
        if (!full.isEmpty()) return full;
        String d = a.optString("displayName", "");
        return "null".equals(d) ? "" : d;
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

    private TextView label(String s) {
        TextView t = text(s, 13, cSub, true);
        t.setPadding(dp(4), dp(4), 0, dp(6));
        return t;
    }

    private LinearLayout card() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(16), dp(16), dp(16), dp(16));
        GradientDrawable g = new GradientDrawable();
        g.setColor(cCard);
        g.setCornerRadius(dp(14));
        c.setBackground(g);
        return c;
    }

    private View divider() {
        View v = new View(this);
        v.setBackgroundColor(cLine);
        v.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(1))));
        return v;
    }

    private View row(String title, String sub, Runnable onClick) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.VERTICAL);
        r.setPadding(dp(16), dp(14), dp(16), dp(14));
        r.addView(text(title, 16, cText, true));
        r.addView(text(sub, 13, cSub, false));
        r.setClickable(true);
        r.setFocusable(true);
        TypedValue tv = new TypedValue();
        if (getTheme().resolveAttribute(android.R.attr.selectableItemBackground, tv, true)) r.setForeground(ContextCompat.getDrawable(this, tv.resourceId));
        r.setOnClickListener(v -> onClick.run());
        return r;
    }

    private View kv(String k, String v) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setPadding(0, dp(10), 0, dp(10));
        r.addView(text(k, 15, cSub, false), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView val = text(v, 15, cText, false);
        val.setGravity(Gravity.END);
        r.addView(val, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        return r;
    }

    private EditText field(String hint, String value, boolean multiline) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setText(value);
        e.setTextColor(cText);
        e.setHintTextColor(cSub);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        e.setPadding(dp(14), dp(12), dp(14), dp(12));
        GradientDrawable g = new GradientDrawable();
        g.setColor(cCard);
        g.setCornerRadius(dp(10));
        g.setStroke(dp(1), cLine);
        e.setBackground(g);
        if (multiline) {
            e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
            e.setMinLines(3);
            e.setGravity(Gravity.TOP);
            e.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(MAX_BIO)});
        } else {
            e.setInputType(InputType.TYPE_CLASS_TEXT);
            e.setSingleLine(true);
        }
        return e;
    }

    private Button button(String label, boolean danger, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(danger ? C_DANGER : Color.WHITE);
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(dp(12));
        if (danger) { g.setColor(cCard); g.setStroke(dp(1), C_DANGER); } else g.setColor(C_PRIMARY);
        b.setBackground(g);
        b.setOnClickListener(l);
        return b;
    }

    private View avatarBlock(int sizeDp) {
        FrameLayout f = new FrameLayout(this);
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setColor(C_PRIMARY);
        f.setBackground(g);
        f.setClipToOutline(true);
        f.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
        avatarInitial = text("?", sizeDp / 3, Color.WHITE, true);
        avatarInitial.setGravity(Gravity.CENTER);
        f.addView(avatarInitial, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        avatarImage = new ImageView(this);
        avatarImage.setScaleType(ImageView.ScaleType.CENTER_CROP);
        avatarImage.setVisibility(View.GONE);
        f.addView(avatarImage, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        f.setOnClickListener(v -> chooseAvatarSource());
        return f;
    }

    private LinearLayout.LayoutParams center(int wDp, int hDp, int topDp, int bottomDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(wDp), dp(hDp));
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        lp.topMargin = dp(topDp);
        lp.bottomMargin = dp(bottomDp);
        return lp;
    }

    private LinearLayout.LayoutParams wrapCentered() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        lp.bottomMargin = dp(16);
        return lp;
    }

    private LinearLayout.LayoutParams matchWithBottom(int bottomDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(bottomDp);
        return lp;
    }
}
