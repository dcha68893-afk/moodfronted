package com.necpa;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Android glue for {@link NecpraE2E}: Keystore-encrypted identity + ratchet-session storage, the
 * public-key directory over the existing /api/encryption routes, and the one-time identity hand-over.
 *
 * Everything is encrypted at rest with the SAME Keystore key as the rest of the native session
 * (NativeBackgroundSync.encrypt/decrypt) and wiped by NativeBackgroundSync.clearAll() on logout.
 *
 * Identity: the web client keeps a password-wrapped copy of the identity private key on the server
 * (GET /api/encryption/identity-backup). Native does NOT create its own identity (that would orphan every
 * existing conversation); it restores that same key once, using the wrap secret the web layer already holds
 * for the session, verifies it matches the registered public key, and keeps it Keystore-encrypted.
 */
final class NecpraE2EStore {
    static final String PREFS = "necpra_native_e2e";
    private static final String K_IDENTITY = "identity";
    private static final long PUB_TTL_MS = 10 * 60 * 1000L;

    private static volatile NecpraE2E cached;
    private static volatile String cachedFor;

    private NecpraE2EStore() {}

    private static SharedPreferences prefs(Context c) { return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    // ------------------------------------------------------------------ status / lifecycle

    /** Returns the user id the stored identity belongs to, or null if native E2E is not provisioned. */
    static String provisionedUser(Context c) {
        try {
            String raw = NativeBackgroundSync.getDecrypted(prefs(c), K_IDENTITY);
            return raw == null ? null : new JSONObject(raw).optString("userId", null);
        } catch (Exception e) { return null; }
    }

    static synchronized void clearAll(Context c) {
        cached = null; cachedFor = null;
        prefs(c).edit().clear().commit();
        c.getApplicationContext().getSharedPreferences(DIAG_PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    // ------------------------------------------------------------------ diagnostics (user-safe text only, never key material)

    private static final String DIAG_PREFS = "necpra_native_e2e_diag";

    /** Last reason {@link #provision} failed (e.g. no identity backup on the server), or null. Cleared on success. */
    static String lastError(Context c) {
        return c.getApplicationContext().getSharedPreferences(DIAG_PREFS, Context.MODE_PRIVATE).getString("lastError", null);
    }

    static void setLastError(Context c, String message) {
        SharedPreferences d = c.getApplicationContext().getSharedPreferences(DIAG_PREFS, Context.MODE_PRIVATE);
        if (message == null) d.edit().remove("lastError").commit(); else d.edit().putString("lastError", message).commit();
    }

    // ------------------------------------------------------------------ provisioning

    /**
     * Restores the user's existing identity key from the server backup. Blocking (PBKDF2 310k + network): call off the UI thread.
     * @throws IllegalStateException with a user-safe reason when the identity cannot be restored.
     */
    static synchronized void provision(Context c, String userId, String secret, String legacyPassword) throws Exception {
        if (userId == null || userId.isEmpty()) throw new IllegalStateException("No user id");
        if (userId.equals(provisionedUser(c))) return; // already done for this account

        JSONObject resp = get(c, "/api/encryption/identity-backup");
        JSONObject data = resp.optJSONObject("data");
        if (data == null || data.isNull("encryptedPrivateKey")) {
            throw new IllegalStateException("No identity backup on the server for this account (open the web Messages once so one is created)");
        }
        String wrapped = data.getString("encryptedPrivateKey");
        String pkcs8 = null;
        for (String pw : new String[]{secret, legacyPassword}) {
            if (pw == null || pw.isEmpty()) continue;
            try { pkcs8 = NecpraE2E.unwrapPrivate(wrapped, pw); break; } catch (Exception ignored) { /* try next */ }
        }
        if (pkcs8 == null) throw new IllegalStateException("Could not unlock the identity key with the session secret");

        // Safety: the restored private key must be the one whose public half is registered, or every message would be undecryptable.
        String pub = data.getString("publicKey");
        java.security.PrivateKey priv = java.security.KeyFactory.getInstance("EC")
                .generatePrivate(new java.security.spec.PKCS8EncodedKeySpec(NecpraB64.dec(pkcs8)));
        JSONObject jwk = NecpraRatchet.jwkFromPrivate(priv);
        byte[] derivedRaw = NecpraRatchet.rawFromSpki(NecpraB64.dec(pub));
        byte[] fromPriv = new byte[65]; fromPriv[0] = 4;
        System.arraycopy(NecpraB64.dec(jwk.getString("x")), 0, fromPriv, 1, 32);
        System.arraycopy(NecpraB64.dec(jwk.getString("y")), 0, fromPriv, 33, 32);
        if (!java.util.Arrays.equals(derivedRaw, fromPriv)) throw new IllegalStateException("Restored identity does not match the registered public key");

        JSONObject id = new JSONObject().put("userId", userId).put("priv", pkcs8).put("pub", pub).put("keyId", data.optString("keyId", ""));
        SharedPreferences p = prefs(c);
        p.edit().clear().commit();                      // never mix sessions of a previous identity
        NativeBackgroundSync.putEncrypted(p, K_IDENTITY, id.toString());
        cached = null; cachedFor = null;
    }

    // ------------------------------------------------------------------ engine

    static synchronized NecpraE2E engine(Context c) throws Exception {
        String userId = provisionedUser(c);
        if (userId == null) throw new IllegalStateException("Native E2E is not provisioned");
        if (cached != null && userId.equals(cachedFor)) return cached;
        JSONObject id = new JSONObject(NativeBackgroundSync.getDecrypted(prefs(c), K_IDENTITY));
        final Context app = c.getApplicationContext();
        NecpraE2E e = new NecpraE2E(userId, id.getString("priv"), id.getString("pub"), id.optString("keyId", null),
                (peer, force) -> publicKeyFor(app, peer, force), new Sessions(app, userId));
        cached = e; cachedFor = userId;
        return e;
    }

    // ------------------------------------------------------------------ session store (encrypted at rest)

    private static final class Sessions implements NecpraE2E.SessionStore {
        private final Context c; private final String me;
        Sessions(Context c, String me) { this.c = c; this.me = me; }
        private String key(String peer) { return "s_" + me + "_" + peer; }
        @Override public JSONObject load(String peer) {
            try { String raw = NativeBackgroundSync.getDecrypted(prefs(c), key(peer)); return raw == null ? null : new JSONObject(raw); }
            catch (Exception e) { return null; }
        }
        @Override public void save(String peer, JSONObject s) {
            try { NativeBackgroundSync.putEncrypted(prefs(c), key(peer), s.toString()); } catch (Exception e) { throw new RuntimeException(e); }
        }
        @Override public void clear(String peer) { prefs(c).edit().remove(key(peer)).commit(); }
    }

    // ------------------------------------------------------------------ public-key directory

    private static NecpraE2E.PeerKey publicKeyFor(Context c, String peerId, boolean force) throws Exception {
        SharedPreferences p = prefs(c);
        String ck = "pk_" + peerId;
        JSONObject cachedKey = null;
        try { String raw = p.getString(ck, null); if (raw != null) cachedKey = new JSONObject(raw); } catch (Exception ignored) {}
        if (!force && cachedKey != null && System.currentTimeMillis() - cachedKey.optLong("ts", 0) < PUB_TTL_MS)
            return new NecpraE2E.PeerKey(cachedKey.getString("pub"), cachedKey.optString("keyId", null));
        try {
            JSONObject d = get(c, "/api/encryption/keys/" + java.net.URLEncoder.encode(peerId, "UTF-8")).optJSONObject("data");
            if (d == null || d.isNull("publicKey")) throw new IllegalStateException("Recipient has no public key");
            p.edit().putString(ck, new JSONObject().put("pub", d.getString("publicKey")).put("keyId", d.optString("keyId", "")).put("ts", System.currentTimeMillis()).toString()).apply();
            return new NecpraE2E.PeerKey(d.getString("publicKey"), d.optString("keyId", null));
        } catch (IOException offline) {
            if (cachedKey != null) return new NecpraE2E.PeerKey(cachedKey.getString("pub"), cachedKey.optString("keyId", null)); // offline: use what we have
            throw offline;
        }
    }

    // ------------------------------------------------------------------ HTTP (same session + refresh path as the other native screens)

    private static JSONObject get(Context c, String path) throws Exception {
        boolean retried = false;
        while (true) {
            SharedPreferences auth = c.getSharedPreferences(NativeBackgroundSync.AUTH_PREFS, Context.MODE_PRIVATE);
            String access = NativeBackgroundSync.getDecrypted(auth, "accessToken");
            if (access == null || access.isEmpty()) access = NativeBackgroundSync.refreshSession(c);
            HttpURLConnection h = null; int status; String text;
            try {
                h = (HttpURLConnection) new URL(NativeBackgroundSync.backendOrigin(c) + path).openConnection();
                h.setRequestMethod("GET"); h.setConnectTimeout(15000); h.setReadTimeout(30000); h.setUseCaches(false);
                h.setRequestProperty("Accept", "application/json");
                h.setRequestProperty("Authorization", "Bearer " + access);
                status = h.getResponseCode();
                text = NativeBackgroundSync.readText(status >= 200 && status < 400 ? h.getInputStream() : h.getErrorStream());
            } finally { if (h != null) h.disconnect(); }
            if (status == 401) {
                if (retried) throw new NativeBackgroundSync.SessionExpiredException("Unauthorized after refresh");
                retried = true; NativeBackgroundSync.refreshSession(c); continue;
            }
            if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status + " for " + path);
            return new JSONObject(text == null || text.trim().isEmpty() ? "{}" : text);
        }
    }
}
