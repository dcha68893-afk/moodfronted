package com.necpa;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;

public final class NativeBackgroundSync {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "necpra_secure_storage_v1";
    private static final String AUTH_PREFS = "necpra_native_auth";
    private static final String BACKGROUND_PREFS = "necpra_native_background";
    private static final int GCM_TAG_BITS = 128;
    private static final String BACKEND_ORIGIN = "https://nexorah-xnv6.onrender.com";

    private NativeBackgroundSync() {}

    public static void run(Context context) throws Exception {
        SharedPreferences auth = context.getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE);
        String access = decrypt(auth.getString("accessToken", null));
        String refresh = decrypt(auth.getString("refreshToken", null));
        if ((access == null || access.isEmpty()) && (refresh == null || refresh.isEmpty())) {
            throw new Exception("No authenticated native session");
        }
        if (access == null || access.isEmpty()) {
            access = refreshAccessToken(auth, refresh);
        }

        JSONObject snapshot = new JSONObject();
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
                snapshot.put(keys[i], request("GET", BACKEND_ORIGIN + endpoints[i], null, access));
            } catch (AuthFailure e) {
                access = refreshAccessToken(auth, refresh);
                snapshot.put(keys[i], request("GET", BACKEND_ORIGIN + endpoints[i], null, access));
            }
        }

        long now = System.currentTimeMillis();
        auth.edit().putLong("lastNativeSyncAt", now)
                .putString("lastNativeSyncSnapshot", snapshot.toString())
                .apply();

        context.getSharedPreferences(BACKGROUND_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong("lastBackendCheckAt", now)
                .putInt("lastBackendStatus", 200)
                .putBoolean("backendReachable", true)
                .putBoolean("syncRequested", true)
                .putLong("syncRequestedAt", now)
                .apply();
    }

    private static String refreshAccessToken(SharedPreferences auth, String refresh) throws Exception {
        if (refresh == null || refresh.isEmpty()) throw new Exception("No refresh token");
        JSONObject response = request("POST", BACKEND_ORIGIN + "/api/auth/refresh",
                new JSONObject().put("refreshToken", refresh).toString(), null);
        String access = response.optString("accessToken", response.optString("token", ""));
        if (access.isEmpty()) throw new Exception("Refresh returned no access token");
        String newRefresh = response.optString("refreshToken", refresh);
        putEncrypted(auth, "accessToken", access);
        putEncrypted(auth, "refreshToken", newRefresh);
        long expiresIn = response.optLong("expiresIn", 24 * 60 * 60);
        auth.edit().putLong("expiresAt", System.currentTimeMillis() + expiresIn * 1000L).apply();
        return access;
    }

    private static JSONObject request(String method, String urlString, String body, String accessToken) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(urlString).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setUseCaches(false);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("X-Requested-With", "XMLHttpRequest");
        if (accessToken != null) c.setRequestProperty("Authorization", "Bearer " + accessToken);
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
        }
        int status = c.getResponseCode();
        InputStream stream = status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream();
        String text = readText(stream);
        c.disconnect();
        if (status == 401) throw new AuthFailure();
        if (status < 200 || status >= 300) throw new Exception("HTTP " + status);
        return text.isEmpty() ? new JSONObject() : new JSONObject(text);
    }

    private static final class AuthFailure extends Exception {}

    private static String readText(InputStream stream) throws Exception {
        if (stream == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder b = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) b.append(line);
            return b.toString();
        }
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
    }

    private static String encrypt(String value) throws Exception {
        if (value == null) return null;
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] ct = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        return android.util.Base64.encodeToString(cipher.getIV(), android.util.Base64.NO_WRAP) + ":" +
                android.util.Base64.encodeToString(ct, android.util.Base64.NO_WRAP);
    }

    private static String decrypt(String packed) throws Exception {
        if (packed == null) return null;
        String[] parts = packed.split(":", 2);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(),
                new javax.crypto.spec.GCMParameterSpec(GCM_TAG_BITS,
                        android.util.Base64.decode(parts[0], android.util.Base64.NO_WRAP)));
        return new String(cipher.doFinal(android.util.Base64.decode(parts[1], android.util.Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    private static void putEncrypted(SharedPreferences prefs, String key, String value) throws Exception {
        if (value == null) prefs.edit().remove(key).apply();
        else prefs.edit().putString(key, encrypt(value)).apply();
    }
}
