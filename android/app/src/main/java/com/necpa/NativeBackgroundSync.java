package com.necpa;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Shared native helper used by BOTH the WorkManager worker and the Capacitor
 * plugin, so there is exactly one implementation of:
 *   - Keystore-backed encryption
 *   - refresh-token rotation (single-flight; the backend rotates refresh
 *     tokens and revokes every session on reuse, so two uncoordinated
 *     refreshers can log the user out everywhere)
 *   - the background snapshot (stored encrypted on disk, not in plaintext prefs)
 */
public final class NativeBackgroundSync {
    static final String KEYSTORE = "AndroidKeyStore";
    static final String KEY_ALIAS = "necpra_secure_storage_v1";
    static final String AUTH_PREFS = "necpra_native_auth";
    static final String BACKGROUND_PREFS = "necpra_native_background";
    static final String SNAPSHOT_FILE = "necpra_snapshot.enc";
    static final String DEFAULT_BACKEND_ORIGIN = "https://nexorah-xnv6.onrender.com";
    private static final int GCM_TAG_BITS = 128;
    private static final long REFRESH_DEBOUNCE_MS = 20_000L;
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    private static final Object REFRESH_LOCK = new Object();
    private static final Object SNAPSHOT_LOCK = new Object();

    private NativeBackgroundSync() {}

    /** Thrown when the backend definitively rejected the refresh token. */
    public static final class SessionExpiredException extends Exception {
        SessionExpiredException(String m) { super(m); }
    }

    /** Thrown when there is nothing to sync because nobody is signed in. */
    public static final class NoSessionException extends Exception {
        NoSessionException() { super("No authenticated native session"); }
    }

    private static final class AuthFailure extends Exception {}

    // ------------------------------------------------------------------
    // Keystore crypto (AES-256-GCM)
    // ------------------------------------------------------------------

    static synchronized SecretKey getOrCreateKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        KeyStore.Entry existing = ks.containsAlias(KEY_ALIAS) ? ks.getEntry(KEY_ALIAS, null) : null;
        if (existing instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) existing).getSecretKey();
        }
        // AndroidKeyStore requires a KeyGenParameterSpec; KeyGenerator.init(int)
        // is unsupported on this provider.
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }

    static String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] ct = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" +
                Base64.encodeToString(ct, Base64.NO_WRAP);
    }

    static String decrypt(String packed) throws Exception {
        if (packed == null) return null;
        String[] parts = packed.split(":", 2);
        if (parts.length != 2) throw new IllegalArgumentException("Malformed secure value");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(),
                new GCMParameterSpec(GCM_TAG_BITS, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    static void putEncrypted(SharedPreferences prefs, String key, String value) throws Exception {
        DECRYPT_CACHE.clear();
        if (value == null) prefs.edit().remove(key).commit();
        else prefs.edit().putString(key, encrypt(value)).commit();
    }

    // FIX (slow sends): every HTTP request decrypted the access token through the Android Keystore (AES-GCM), which costs
    // tens of ms on many phones (more on MIUI). Memoise by CIPHERTEXT: a rotated/changed token has a different packed
    // value so it can never return a stale token, and putEncrypted() clears the cache on any write.
    private static final java.util.concurrent.ConcurrentHashMap<String, String> DECRYPT_CACHE =
            new java.util.concurrent.ConcurrentHashMap<>();

    static String getDecrypted(SharedPreferences prefs, String key) throws Exception {
        String packed = prefs.getString(key, null);
        if (packed == null) return null;
        String hit = DECRYPT_CACHE.get(packed);
        if (hit != null) return hit;
        String plain = decrypt(packed);
        if (plain != null) {
            if (DECRYPT_CACHE.size() > 32) DECRYPT_CACHE.clear();
            DECRYPT_CACHE.put(packed, plain);
        }
        return plain;
    }

    // ------------------------------------------------------------------
    // Origin
    // ------------------------------------------------------------------

    /** The web layer tells us which backend it uses; fall back to the constant. */
    static String backendOrigin(Context context) {
        String stored = context.getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE)
                .getString("apiOrigin", null);
        String origin = normalizeOrigin(stored);
        return origin != null ? origin : DEFAULT_BACKEND_ORIGIN;
    }

    static String normalizeOrigin(String raw) {
        if (raw == null) return null;
        String o = raw.trim().replaceAll("/+$", "").replaceAll("/api$", "");
        if (!o.toLowerCase().startsWith("https://")) return null;
        try {
            URL u = new URL(o);
            return u.getProtocol() + "://" + u.getAuthority();
        } catch (Exception e) {
            return null;
        }
    }

    /** True when `url` points at our own backend (only then do we attach the token). */
    static boolean isBackendUrl(Context context, String url) {
        try {
            URL a = new URL(url);
            URL b = new URL(backendOrigin(context));
            return a.getHost().equalsIgnoreCase(b.getHost()) && a.getPort() == b.getPort();
        } catch (Exception e) {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Single-flight refresh
    // ------------------------------------------------------------------

    /**
     * Refresh the session and return the (new) access token. Safe to call from
     * the worker and the plugin concurrently: calls are serialised, the refresh
     * token is re-read inside the lock, and a refresh that another caller just
     * completed is reused rather than replayed.
     */
    static String refreshSession(Context context) throws Exception {
        synchronized (REFRESH_LOCK) {
            SharedPreferences auth = context.getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE);
            long last = auth.getLong("lastRefreshAt", 0L);
            String currentAccess = getDecrypted(auth, "accessToken");
            if (currentAccess != null && !currentAccess.isEmpty()
                    && System.currentTimeMillis() - last < REFRESH_DEBOUNCE_MS) {
                return currentAccess;
            }

            String refresh = getDecrypted(auth, "refreshToken");
            if (refresh == null || refresh.isEmpty()) throw new SessionExpiredException("No refresh token");

            String origin = backendOrigin(context);
            HttpURLConnection c = (HttpURLConnection) new URL(origin + "/api/auth/refresh").openConnection();
            int status;
            String text;
            try {
                c.setRequestMethod("POST");
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setUseCaches(false);
                c.setDoOutput(true);
                c.setRequestProperty("Accept", "application/json");
                c.setRequestProperty("Content-Type", "application/json");
                c.getOutputStream().write(new JSONObject().put("refreshToken", refresh)
                        .toString().getBytes(StandardCharsets.UTF_8));
                status = c.getResponseCode();
                text = readText(status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream());
            } finally {
                c.disconnect();
            }

            // 401/403/404 = the backend says this refresh token is dead.
            // 5xx/429/timeouts are transient (e.g. Render cold start) and must
            // NOT be treated as a logout.
            if (status == 401 || status == 403 || status == 404) {
                auth.edit().putLong("refreshRejectedAt", System.currentTimeMillis()).commit();
                throw new SessionExpiredException("Refresh token rejected (HTTP " + status + ")");
            }
            if (status < 200 || status >= 300) throw new Exception("Refresh failed with HTTP " + status);

            JSONObject response = new JSONObject(text.isEmpty() ? "{}" : text);
            String access = response.optString("accessToken", response.optString("token", ""));
            if (access.isEmpty()) throw new Exception("Refresh returned no access token");
            String newRefresh = response.optString("refreshToken", "");
            if (newRefresh.isEmpty()) newRefresh = refresh;

            long expiresIn = response.optLong("expiresIn", 0L);
            if (expiresIn <= 0) expiresIn = jwtSecondsLeft(access, 24L * 60 * 60);

            // Store the rotated refresh token first: if we crash between the two
            // writes we must never keep an already-consumed refresh token.
            putEncrypted(auth, "refreshToken", newRefresh);
            putEncrypted(auth, "accessToken", access);
            long now = System.currentTimeMillis();
            auth.edit().putLong("expiresAt", now + expiresIn * 1000L)
                    .putLong("lastRefreshAt", now)
                    .remove("refreshRejectedAt")
                    .commit();
            return access;
        }
    }

    private static long jwtSecondsLeft(String jwt, long fallback) {
        try {
            String[] p = jwt.split("\\.");
            if (p.length < 2) return fallback;
            byte[] json = Base64.decode(p[1], Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
            long exp = new JSONObject(new String(json, StandardCharsets.UTF_8)).optLong("exp", 0L);
            long left = exp - System.currentTimeMillis() / 1000L;
            return left > 0 ? left : fallback;
        } catch (Exception e) {
            return fallback;
        }
    }

    // ------------------------------------------------------------------
    // Background sync
    // ------------------------------------------------------------------

    public static void run(Context context) throws Exception {
        SharedPreferences auth = context.getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE);
        String access = getDecrypted(auth, "accessToken");
        String refresh = getDecrypted(auth, "refreshToken");
        boolean hasAccess = access != null && !access.isEmpty();
        boolean hasRefresh = refresh != null && !refresh.isEmpty();
        if (!hasAccess && !hasRefresh) throw new NoSessionException();
        if (!hasAccess) access = refreshSession(context);

        String origin = backendOrigin(context);
        JSONObject snapshot = new JSONObject();
        int ok = 0;
        int failed = 0;

        String[] endpoints = {
                "/api/chats?limit=100",
                "/api/friends?limit=100",
                "/api/groups?limit=100",
                "/api/status?limit=100",
                "/api/settings"
        };
        String[] keys = { "chats", "friends", "groups", "status", "settings" };

        for (int i = 0; i < endpoints.length; i++) {
            try {
                Object r;
                try {
                    r = request(origin + endpoints[i], access);
                } catch (AuthFailure e) {
                    access = refreshSession(context);
                    r = request(origin + endpoints[i], access);
                }
                snapshot.put(keys[i], r);
                ok++;
            } catch (SessionExpiredException e) {
                throw e;
            } catch (Exception e) {
                failed++; // one failing endpoint must not discard the others
            }
        }
        if (ok == 0) throw new Exception("Background sync: every endpoint failed");

        // Bounded message history for the conversations the lists returned.
        JSONArray chatList = extractArray(snapshot.opt("chats"), "chats", "conversations", "data");
        if (chatList != null) {
            int count = Math.min(chatList.length(), 50);
            for (int i = 0; i < count; i++) {
                JSONObject chat = chatList.optJSONObject(i);
                String id = safeId(chat, "id", "chatId");
                if (id == null) continue;
                try {
                    snapshot.put("messages_" + id,
                            getWithRefresh(context, origin + "/api/messages/" + id + "?limit=100", access));
                } catch (SessionExpiredException e) {
                    throw e;
                } catch (Exception ignored) {}
            }
        }

        JSONArray groupList = extractArray(snapshot.opt("groups"), "groups", "data");
        if (groupList != null) {
            int count = Math.min(groupList.length(), 50);
            for (int i = 0; i < count; i++) {
                JSONObject group = groupList.optJSONObject(i);
                String id = safeId(group, "id", "groupId");
                if (id == null) continue;
                try {
                    snapshot.put("groupMessages_" + id,
                            getWithRefresh(context, origin + "/api/group-messages/" + id + "/messages?limit=100", access));
                } catch (SessionExpiredException e) {
                    throw e;
                } catch (Exception ignored) {}
            }
        }

        long now = System.currentTimeMillis();
        writeSnapshot(context, snapshot.toString());
        auth.edit().putLong("lastNativeSyncAt", now).commit();
        context.getSharedPreferences(BACKGROUND_PREFS, Context.MODE_PRIVATE).edit()
                .putLong("lastBackendCheckAt", now)
                .putInt("lastBackendStatus", 200)
                .putBoolean("backendReachable", true)
                .putBoolean("syncRequested", true)
                .putLong("syncRequestedAt", now)
                .putInt("lastEndpointFailures", failed)
                .commit();
    }

    /** GET with one refresh-and-retry; the access token may rotate mid-run. */
    private static Object getWithRefresh(Context context, String url, String access) throws Exception {
        try {
            return request(url, access);
        } catch (AuthFailure e) {
            return request(url, refreshSession(context));
        }
    }

    private static String safeId(JSONObject o, String... names) {
        if (o == null) return null;
        for (String n : names) {
            Object v = o.opt(n);
            if (v == null || v == JSONObject.NULL) continue;
            String s = String.valueOf(v);
            if (SAFE_ID.matcher(s).matches()) return s; // numeric OR uuid
        }
        return null;
    }

    private static Object request(String urlString, String accessToken) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(urlString).openConnection();
        int status;
        String text;
        try {
            c.setRequestMethod("GET");
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setUseCaches(false);
            c.setRequestProperty("Accept", "application/json");
            if (accessToken != null) c.setRequestProperty("Authorization", "Bearer " + accessToken);
            status = c.getResponseCode();
            text = readText(status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream());
        } finally {
            c.disconnect();
        }
        if (status == 401) throw new AuthFailure();
        if (status < 200 || status >= 300) throw new Exception("HTTP " + status);
        if (text.isEmpty()) return new JSONObject();
        // Keep the original JSON shape (object OR array): the web cache replays
        // it verbatim as the response body.
        return new JSONTokener(text).nextValue();
    }

    private static JSONArray extractArray(Object root, String... keys) {
        if (root instanceof JSONArray) return (JSONArray) root;
        if (!(root instanceof JSONObject)) return null;
        JSONObject object = (JSONObject) root;
        for (String key : keys) {
            Object value = object.opt(key);
            if (value instanceof JSONArray) return (JSONArray) value;
            if (value instanceof JSONObject) {
                JSONObject nested = (JSONObject) value;
                for (String nestedKey : new String[]{"chats", "conversations", "groups", "data"}) {
                    Object n = nested.opt(nestedKey);
                    if (n instanceof JSONArray) return (JSONArray) n;
                }
            }
        }
        return null;
    }

    static String readText(InputStream stream) throws Exception {
        if (stream == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder b = new StringBuilder();
            char[] buf = new char[8192];
            int n;
            while ((n = reader.read(buf)) >= 0) b.append(buf, 0, n);
            return b.toString();
        }
    }

    // ------------------------------------------------------------------
    // Encrypted snapshot file
    // ------------------------------------------------------------------

    private static File snapshotFile(Context context) {
        return new File(context.getFilesDir(), SNAPSHOT_FILE);
    }

    static void writeSnapshot(Context context, String json) throws Exception {
        synchronized (SNAPSHOT_LOCK) {
            File target = snapshotFile(context);
            File tmp = new File(target.getParentFile(), SNAPSHOT_FILE + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(encrypt(json).getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            if (!tmp.renameTo(target)) {
                target.delete();
                if (!tmp.renameTo(target)) throw new Exception("Could not store snapshot");
            }
        }
    }

    /** Returns the decrypted snapshot JSON, or null if none/unreadable. */
    static String readSnapshot(Context context) {
        synchronized (SNAPSHOT_LOCK) {
            File f = snapshotFile(context);
            if (!f.exists()) return null;
            try (FileInputStream in = new FileInputStream(f)) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) >= 0) bo.write(buf, 0, n);
                return decrypt(new String(bo.toByteArray(), StandardCharsets.UTF_8));
            } catch (Exception e) {
                f.delete(); // unreadable (e.g. key was reset): drop it
                return null;
            }
        }
    }

    /** Logout: wipe tokens' companions — snapshot + background status. */
    static void clearAll(Context context) {
        synchronized (SNAPSHOT_LOCK) {
            snapshotFile(context).delete();
            new File(context.getFilesDir(), SNAPSHOT_FILE + ".tmp").delete();
        }
        context.getSharedPreferences(BACKGROUND_PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        NecpraFriendsActivity.wipeAvatarCache(context); // cached friend avatars are removed with the session
        NecpraStatusActivity.wipeCaches(context);       // in-memory status images (the encrypted feed lives in the auth prefs cleared above)
        NecpraDmOwner.clear(context);                   // native no longer owns DMs once the session is gone
        NecpraE2EStore.clearAll(context);               // native identity key + ratchet sessions go with the session
        NecpraMessageRepository.reset(context);         // native chat database + send queue go with the session
    }
}
