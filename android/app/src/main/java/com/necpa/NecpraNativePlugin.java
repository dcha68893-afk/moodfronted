package com.necpa;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Iterator;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "NecpraNative")
public class NecpraNativePlugin extends Plugin {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "necpra_secure_storage_v1";
    private static final String PREFS = "necpra_secure_storage";
    private static final String AUTH_PREFS = "necpra_native_auth";
    private static final String BACKGROUND_PREFS = "necpra_native_background";
    private static final int GCM_TAG_BITS = 128;
    private static final long UNLOCK_WINDOW_MS = 15 * 60 * 1000L;
    private static final String BACKEND_ORIGIN = "https://nexorah-xnv6.onrender.com";

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance("AES", KEYSTORE);
        generator.init(256);
        return generator.generateKey();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" +
                Base64.encodeToString(ciphertext, Base64.NO_WRAP);
    }

    private String decrypt(String packed) throws Exception {
        String[] parts = packed.split(":", 2);
        if (parts.length != 2) throw new IllegalArgumentException("Malformed secure value");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateKey(),
                new GCMParameterSpec(GCM_TAG_BITS, Base64.decode(parts[0], Base64.NO_WRAP))
        );
        return new String(
                cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)),
                StandardCharsets.UTF_8
        );
    }

    private SharedPreferences securePrefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SharedPreferences authPrefs() {
        return getContext().getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE);
    }

    private void putEncrypted(SharedPreferences prefs, String key, String value) throws Exception {
        if (value == null) prefs.edit().remove(key).apply();
        else prefs.edit().putString(key, encrypt(value)).apply();
    }

    private String getDecrypted(SharedPreferences prefs, String key) throws Exception {
        String packed = prefs.getString(key, null);
        return packed == null ? null : decrypt(packed);
    }

    @PluginMethod
    public void secureSet(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            putEncrypted(securePrefs(), key, value);
            call.resolve();
        } catch (Exception e) {
            call.reject("Secure storage failed", e);
        }
    }

    @PluginMethod
    public void secureGet(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        try {
            JSObject result = new JSObject();
            String value = getDecrypted(securePrefs(), key);
            result.put("value", value == null ? JSObject.NULL : value);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Secure storage read failed", e);
        }
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        securePrefs().edit().remove(key).apply();
        call.resolve();
    }

    @PluginMethod
    public void secureStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("native", true);
        result.put("keystore", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M);
        result.put("singleStore", true);
        result.put("e2eIdentityBacked", true);
        call.resolve(result);
    }

    // ---------------------------------------------------------------------
    // Native authentication/session store.
    // Tokens are never persisted in plaintext SharedPreferences on Android.
    // The refresh token is intentionally available to WorkManager so native
    // background synchronization can continue without a WebView.
    // ---------------------------------------------------------------------

    @PluginMethod
    public void authSetSession(PluginCall call) {
        String accessToken = call.getString("accessToken");
        String refreshToken = call.getString("refreshToken");
        String userJson = call.getString("userJson");
        Long expiresAt = call.getLong("expiresAt", 0L);
        if (accessToken == null || accessToken.trim().isEmpty()) {
            call.reject("accessToken is required");
            return;
        }
        try {
            SharedPreferences p = authPrefs();
            putEncrypted(p, "accessToken", accessToken);
            putEncrypted(p, "refreshToken", refreshToken);
            putEncrypted(p, "userJson", userJson);
            p.edit().putLong("expiresAt", expiresAt == null ? 0L : expiresAt).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Native session storage failed", e);
        }
    }

    @PluginMethod
    public void authGetSession(PluginCall call) {
        try {
            SharedPreferences p = authPrefs();
            JSObject out = new JSObject();
            String access = getDecrypted(p, "accessToken");
            String refresh = getDecrypted(p, "refreshToken");
            String user = getDecrypted(p, "userJson");
            long expiresAt = p.getLong("expiresAt", 0L);
            long unlockedUntil = p.getLong("unlockedUntil", 0L);

            out.put("hasSession", access != null || refresh != null);
            out.put("locked", System.currentTimeMillis() > unlockedUntil);
            out.put("unlockedUntil", unlockedUntil);
            out.put("expiresAt", expiresAt);
            out.put("accessToken", access == null ? JSObject.NULL : access);
            out.put("refreshToken", refresh == null ? JSObject.NULL : refresh);
            out.put("userJson", user == null ? JSObject.NULL : user);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Native session read failed", e);
        }
    }

    @PluginMethod
    public void authUnlock(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            call.reject("Android 9 or newer is required");
            return;
        }

        Executor executor = ContextCompat.getMainExecutor(getContext());
        BiometricPrompt prompt = new BiometricPrompt(
                getActivity(),
                executor,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        long until = System.currentTimeMillis() + UNLOCK_WINDOW_MS;
                        authPrefs().edit().putLong("unlockedUntil", until).apply();
                        JSObject out = new JSObject();
                        out.put("authenticated", true);
                        out.put("unlockedUntil", until);
                        call.resolve(out);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errString) {
                        call.reject(errString != null ? errString.toString() : "Authentication failed");
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        // Android keeps the prompt available for another attempt.
                    }
                }
        );

        BiometricPrompt.PromptInfo.Builder builder = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(call.getString("title", "Unlock Necpra"))
                .setSubtitle(call.getString("subtitle", "Verify your identity"))
                .setConfirmationRequired(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG |
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL
            );
        } else {
            builder.setNegativeButtonText(call.getString("cancelText", "Cancel"));
        }
        prompt.authenticate(builder.build());
    }

    @PluginMethod
    public void authClearSession(PluginCall call) {
        authPrefs().edit().clear().apply();
        call.resolve();
    }

    @PluginMethod
    public void authRefresh(PluginCall call) {
        new Thread(() -> {
            try {
                String refresh = getDecrypted(authPrefs(), "refreshToken");
                if (refresh == null || refresh.trim().isEmpty()) {
                    call.reject("No native refresh token");
                    return;
                }

                JSONObject body = new JSONObject().put("refreshToken", refresh);
                JSONObject response = requestJson(
                        "POST",
                        BACKEND_ORIGIN + "/api/auth/refresh",
                        body.toString(),
                        null
                );

                String access = response.optString("accessToken", response.optString("token", ""));
                String newRefresh = response.optString("refreshToken", refresh);
                if (access.isEmpty()) {
                    call.reject("Refresh endpoint returned no access token");
                    return;
                }

                long expiresIn = response.optLong("expiresIn", 24 * 60 * 60);
                long expiresAt = System.currentTimeMillis() + (expiresIn * 1000L);
                putEncrypted(authPrefs(), "accessToken", access);
                putEncrypted(authPrefs(), "refreshToken", newRefresh);
                authPrefs().edit().putLong("expiresAt", expiresAt).apply();

                JSObject out = new JSObject();
                out.put("success", true);
                out.put("accessToken", access);
                out.put("refreshToken", newRefresh);
                out.put("expiresIn", expiresIn);
                out.put("expiresAt", expiresAt);
                call.resolve(out);
            } catch (Throwable t) {
                call.reject("Native token refresh failed", t);
            }
        }).start();
    }

    // ---------------------------------------------------------------------
    // Authenticated native background snapshot sync.
    // This uses the same Render API; it does not create a second backend.
    // ---------------------------------------------------------------------

    @PluginMethod
    public void backgroundSyncNow(PluginCall call) {
        new Thread(() -> {
            try {
                NativeBackgroundSync.run(getContext());
                JSObject out = new JSObject();
                out.put("success", true);
                out.put("syncedAt", authPrefs().getLong("lastNativeSyncAt", System.currentTimeMillis()));
                out.put("snapshot", authPrefs().getString("lastNativeSyncSnapshot", null));
                call.resolve(out);
            } catch (Throwable t) {
                call.reject("Native sync failed", t);
            }
        }).start();
    }

    // ---------------------------------------------------------------------
    // Files, camera and sharing
    // ---------------------------------------------------------------------

    @PluginMethod
    public void openFilePicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "*/*"));
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "filePickerResult");
    }

    @ActivityCallback
    private void filePickerResult(PluginCall call, ActivityResult result) {
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("File selection cancelled");
            return;
        }
        Intent data = result.getData();
        JSObject out = new JSObject();
        try {
            if (data.getClipData() != null) {
                JSArray uris = new JSArray();
                for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                    Uri uri = data.getClipData().getItemAt(i).getUri();
                    try {
                        getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    } catch (Exception ignored) {}
                    uris.put(uri.toString());
                }
                out.put("uris", uris);
            } else if (data.getData() != null) {
                Uri uri = data.getData();
                try {
                    getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) {}
                out.put("uri", uri.toString());
            }
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Could not read selected file", e);
        }
    }

    @PluginMethod
    public void takePhoto(PluginCall call) {
        try {
            File file = new File(getContext().getCacheDir(), "necpra-photo-" + System.currentTimeMillis() + ".jpg");
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file
            );
            Intent intent = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(call, intent, "cameraResult");
        } catch (Exception e) {
            call.reject("Camera could not be opened", e);
        }
    }

    @ActivityCallback
    private void cameraResult(PluginCall call, ActivityResult result) {
        if (result == null || result.getResultCode() != Activity.RESULT_OK) {
            call.reject("Camera capture cancelled");
            return;
        }
        File[] files = getContext().getCacheDir().listFiles(
                (dir, name) -> name.startsWith("necpra-photo-") && name.endsWith(".jpg")
        );
        if (files == null || files.length == 0) {
            call.reject("Captured photo was not found");
            return;
        }
        File newest = files[0];
        for (File file : files) if (file.lastModified() > newest.lastModified()) newest = file;
        JSObject out = new JSObject();
        out.put("uri", FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                newest
        ).toString());
        call.resolve(out);
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null) {
            call.reject("uri is required");
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(call.getString("mimeType", "*/*"));
        send.putExtra(Intent.EXTRA_STREAM, Uri.parse(uriString));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getContext().startActivity(Intent.createChooser(send, call.getString("title", "Share with")));
        call.resolve();
    }

    @PluginMethod
    public void downloadFile(PluginCall call) {
        final String url = call.getString("url");
        final String requestedName = call.getString("fileName", "download");
        if (url == null || !url.startsWith("https://")) {
            call.reject("A secure https URL is required");
            return;
        }

        new Thread(() -> {
            try {
                String access = getDecrypted(authPrefs(), "accessToken");
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(60000);
                c.setUseCaches(false);
                c.setRequestProperty("Accept", "*/*");
                if (access != null) c.setRequestProperty("Authorization", "Bearer " + access);

                int status = c.getResponseCode();
                if (status == 401 && getDecrypted(authPrefs(), "refreshToken") != null) {
                    access = refreshAccessTokenSync(getDecrypted(authPrefs(), "refreshToken"));
                    c.disconnect();
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(60000);
                    c.setRequestProperty("Authorization", "Bearer " + access);
                    status = c.getResponseCode();
                }
                if (status < 200 || status >= 300) throw new Exception("Download failed with HTTP " + status);

                File dir = new File(getContext().getFilesDir(), "downloads");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not create download directory");
                File file = new File(dir, safeFileName(requestedName));
                try (InputStream in = new BufferedInputStream(c.getInputStream());
                     FileOutputStream out = new FileOutputStream(file)) {
                    byte[] buffer = new byte[8192];
                    int n;
                    while ((n = in.read(buffer)) >= 0) out.write(buffer, 0, n);
                }
                c.disconnect();

                Uri uri = FileProvider.getUriForFile(
                        getContext(),
                        getContext().getPackageName() + ".fileprovider",
                        file
                );
                JSObject out = new JSObject();
                out.put("uri", uri.toString());
                out.put("fileName", file.getName());
                out.put("path", file.getAbsolutePath());
                call.resolve(out);
            } catch (Throwable t) {
                call.reject("Download failed", t);
            }
        }).start();
    }

    @PluginMethod
    public void uploadFile(PluginCall call) {
        String endpoint = call.getString("endpoint");
        String uriString = call.getString("uri");
        String fieldName = call.getString("fieldName", "file");
        String mimeType = call.getString("mimeType", "*/*");
        if (endpoint == null || uriString == null || !endpoint.startsWith("https://")) {
            call.reject("Secure endpoint and file uri are required");
            return;
        }

        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                String access = getDecrypted(authPrefs(), "accessToken");
                Uri uri = Uri.parse(uriString);
                String boundary = "----NecpraBoundary" + System.currentTimeMillis();
                c = (HttpURLConnection) new URL(endpoint).openConnection();
                c.setDoOutput(true);
                c.setRequestMethod("POST");
                c.setConnectTimeout(15000);
                c.setReadTimeout(60000);
                c.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                c.setRequestProperty("Accept", "application/json");
                if (access != null) c.setRequestProperty("Authorization", "Bearer " + access);

                String fileName = safeFileName(call.getString("fileName", "upload"));
                try (OutputStream out = c.getOutputStream();
                     InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                    String header = "--" + boundary + "\r\n" +
                            "Content-Disposition: form-data; name=\"" + fieldName + "\"; filename=\"" + fileName + "\"\r\n" +
                            "Content-Type: " + mimeType + "\r\n\r\n";
                    out.write(header.getBytes(StandardCharsets.UTF_8));
                    if (in == null) throw new Exception("Could not open selected file");
                    byte[] buffer = new byte[8192];
                    int n;
                    while ((n = in.read(buffer)) >= 0) out.write(buffer, 0, n);
                    out.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
                }

                int status = c.getResponseCode();
                String response = readText(status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream());
                if (status == 401) {
                    // Let the web/native refresh path handle the session; don't
                    // blindly replay a potentially non-idempotent upload.
                    throw new Exception("Upload authentication expired");
                }
                if (status < 200 || status >= 300) throw new Exception("Upload failed with HTTP " + status);

                JSObject out = new JSObject();
                out.put("status", status);
                out.put("data", response);
                call.resolve(out);
            } catch (Throwable t) {
                call.reject("Upload failed", t);
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }

    private static String safeFileName(String value) {
        String name = value == null || value.trim().isEmpty() ? "download" : value.trim();
        name = name.replaceAll("[\\\\/:*?<>|]", "_");
        return name.length() > 120 ? name.substring(0, 120) : name;
    }

    // ---------------------------------------------------------------------
    // Biometric/device status and diagnostics
    // ---------------------------------------------------------------------

    @PluginMethod
    public void biometricAuthenticate(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            call.reject("Biometric authentication requires Android 9 or newer");
            return;
        }

        Executor executor = ContextCompat.getMainExecutor(getContext());
        BiometricPrompt prompt = new BiometricPrompt(
                getActivity(),
                executor,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        JSObject out = new JSObject();
                        out.put("authenticated", true);
                        call.resolve(out);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errString) {
                        call.reject(errString != null ? errString.toString() : "Biometric authentication failed");
                    }

                    @Override
                    public void onAuthenticationFailed() {}
                }
        );

        BiometricPrompt.PromptInfo.Builder builder = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(call.getString("title", "Unlock Necpra"))
                .setSubtitle(call.getString("subtitle", "Verify your identity"))
                .setConfirmationRequired(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG |
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL
            );
        } else {
            builder.setNegativeButtonText(call.getString("cancelText", "Cancel"));
        }
        prompt.authenticate(builder.build());
    }

    @PluginMethod
    public void biometricStatus(PluginCall call) {
        JSObject out = new JSObject();
        try {
            int authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                authenticators |= BiometricManager.Authenticators.DEVICE_CREDENTIAL;
            }
            int r = BiometricManager.from(getContext()).canAuthenticate(authenticators);
            out.put("available", r == BiometricManager.BIOMETRIC_SUCCESS);
            out.put("status", r);
        } catch (Throwable t) {
            out.put("available", false);
            out.put("status", -1);
        }
        call.resolve(out);
    }

    @PluginMethod
    public void deviceInfo(PluginCall call) {
        JSObject out = new JSObject();
        out.put("platform", "android");
        out.put("sdk", Build.VERSION.SDK_INT);
        out.put("model", Build.MODEL);
        out.put("manufacturer", Build.MANUFACTURER);
        out.put("packageName", getContext().getPackageName());
        call.resolve(out);
    }
}
