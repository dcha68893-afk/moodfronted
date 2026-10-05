package com.necpa;

import android.Manifest;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.fragment.app.FragmentActivity;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executor;

@CapacitorPlugin(
        name = "NecpraNative",
        permissions = {
                @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
        }
)
public class NecpraNativePlugin extends Plugin {
    private static final String PREFS = "necpra_secure_storage";
    private static final long UNLOCK_WINDOW_MS = 15 * 60 * 1000L;

    /** Set by MainActivity on a cold-start deep link; the web layer pulls it once it is ready. */
    static volatile String pendingDeepLink = null;

    // ---------------------------------------------------------------------
    // Prefs / crypto helpers (single implementation lives in NativeBackgroundSync)
    // ---------------------------------------------------------------------

    private SharedPreferences securePrefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SharedPreferences authPrefs() {
        return getContext().getSharedPreferences(NativeBackgroundSync.AUTH_PREFS, Context.MODE_PRIVATE);
    }

    private SharedPreferences backgroundPrefs() {
        return getContext().getSharedPreferences(NativeBackgroundSync.BACKGROUND_PREFS, Context.MODE_PRIVATE);
    }

    private boolean isNativeUnlocked() {
        return System.currentTimeMillis() <= authPrefs().getLong("unlockedUntil", 0L);
    }

    // ---------------------------------------------------------------------
    // Generic secure key/value storage (Keystore AES-GCM)
    // ---------------------------------------------------------------------

    @PluginMethod
    public void secureSet(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            NativeBackgroundSync.putEncrypted(securePrefs(), key, value);
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
            String value = NativeBackgroundSync.getDecrypted(securePrefs(), key);
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
    // Tokens are encrypted with a Keystore key. The refresh token is
    // intentionally readable by WorkManager so background sync works without
    // a WebView.
    // ---------------------------------------------------------------------

    @PluginMethod
    public void authSetSession(PluginCall call) {
        String accessToken = call.getString("accessToken");
        String refreshToken = call.getString("refreshToken");
        String userJson = call.getString("userJson");
        Long expiresAt = call.getLong("expiresAt", 0L);
        String apiOrigin = NativeBackgroundSync.normalizeOrigin(call.getString("apiOrigin"));
        if (accessToken == null || accessToken.trim().isEmpty()) {
            call.reject("accessToken is required");
            return;
        }
        try {
            SharedPreferences p = authPrefs();
            NativeBackgroundSync.putEncrypted(p, "accessToken", accessToken);
            // An empty string means "web did not have one": keep the existing
            // (possibly newer) refresh token instead of wiping it.
            if (refreshToken != null && !refreshToken.isEmpty()) {
                NativeBackgroundSync.putEncrypted(p, "refreshToken", refreshToken);
            }
            if (userJson != null && !userJson.isEmpty()) {
                NativeBackgroundSync.putEncrypted(p, "userJson", userJson);
            }
            SharedPreferences.Editor e = p.edit()
                    .putLong("expiresAt", expiresAt == null ? 0L : expiresAt)
                    .putLong("unlockedUntil", System.currentTimeMillis() + UNLOCK_WINDOW_MS)
                    .remove("refreshRejectedAt");
            if (apiOrigin != null) e.putString("apiOrigin", apiOrigin);
            e.commit();
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
            String access = NativeBackgroundSync.getDecrypted(p, "accessToken");
            String refresh = NativeBackgroundSync.getDecrypted(p, "refreshToken");
            String user = NativeBackgroundSync.getDecrypted(p, "userJson");
            long expiresAt = p.getLong("expiresAt", 0L);
            long unlockedUntil = p.getLong("unlockedUntil", 0L);

            boolean locked = System.currentTimeMillis() > unlockedUntil;
            out.put("hasSession", access != null || refresh != null);
            out.put("locked", locked);
            out.put("unlockedUntil", unlockedUntil);
            out.put("expiresAt", expiresAt);
            // Credentials are not released to the WebView while locked.
            out.put("accessToken", locked || access == null ? JSObject.NULL : access);
            out.put("refreshToken", locked || refresh == null ? JSObject.NULL : refresh);
            out.put("userJson", locked || user == null ? JSObject.NULL : user);
            call.resolve(out);
        } catch (Exception e) {
            // The Keystore key is gone/invalidated (restore, OEM bug, lock-screen
            // reset). The stored ciphertext can never be read again, so treat it
            // as "signed out" rather than failing forever.
            NativeBackgroundSync.clearAll(getContext());
            JSObject out = new JSObject();
            out.put("hasSession", false);
            out.put("locked", false);
            call.resolve(out);
        }
    }

    @PluginMethod
    public void authUnlock(PluginCall call) {
        promptUnlock(call, true);
    }

    @PluginMethod
    public void biometricAuthenticate(PluginCall call) {
        promptUnlock(call, false);
    }

    /**
     * BiometricPrompt must be created and shown on the main thread (Capacitor
     * runs plugin methods on a background thread), and it works from API 23, so
     * the old "Android 9 or newer" restriction wrongly locked API 24-27 users
     * out of their own session forever.
     */
    @SuppressWarnings("deprecation")
    private void promptUnlock(PluginCall call, boolean extendSessionWindow) {
        Activity activity = getActivity();
        if (!(activity instanceof FragmentActivity)) {
            call.reject("No activity available for authentication");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                boolean api30 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;
                int allowed = api30
                        ? (BiometricManager.Authenticators.BIOMETRIC_STRONG
                                | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                        : BiometricManager.Authenticators.BIOMETRIC_WEAK;

                boolean canPrompt = BiometricManager.from(getContext()).canAuthenticate(allowed)
                        == BiometricManager.BIOMETRIC_SUCCESS;
                if (!api30 && !canPrompt) {
                    // Pre-Android-11: a PIN/pattern-only device is still promptable
                    // through the (deprecated) device-credential flag.
                    KeyguardManager km = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
                    canPrompt = km != null && km.isDeviceSecure();
                }

                if (!canPrompt) {
                    // No screen lock and nothing enrolled: there is nothing to
                    // verify against, and demanding it would lock the user out
                    // permanently. Unlock without a prompt and say so.
                    if (extendSessionWindow) {
                        long until = System.currentTimeMillis() + UNLOCK_WINDOW_MS;
                        authPrefs().edit().putLong("unlockedUntil", until).commit();
                        JSObject out = new JSObject();
                        out.put("authenticated", true);
                        out.put("unlockedUntil", until);
                        out.put("noDeviceCredential", true);
                        call.resolve(out);
                    } else {
                        call.reject("No biometric or device credential is set up on this device");
                    }
                    return;
                }

                Executor executor = ContextCompat.getMainExecutor(getContext());
                BiometricPrompt prompt = new BiometricPrompt((FragmentActivity) activity, executor,
                        new BiometricPrompt.AuthenticationCallback() {
                            @Override
                            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                                JSObject out = new JSObject();
                                out.put("authenticated", true);
                                if (extendSessionWindow) {
                                    long until = System.currentTimeMillis() + UNLOCK_WINDOW_MS;
                                    authPrefs().edit().putLong("unlockedUntil", until).commit();
                                    out.put("unlockedUntil", until);
                                }
                                call.resolve(out);
                            }

                            @Override
                            public void onAuthenticationError(int errorCode, CharSequence errString) {
                                call.reject(errString != null ? errString.toString() : "Authentication failed");
                            }

                            @Override
                            public void onAuthenticationFailed() {
                                // The prompt stays open for another attempt.
                            }
                        });

                BiometricPrompt.PromptInfo.Builder builder = new BiometricPrompt.PromptInfo.Builder()
                        .setTitle(call.getString("title", "Unlock Necpra"))
                        .setSubtitle(call.getString("subtitle", "Verify your identity"))
                        .setConfirmationRequired(false);
                if (api30) {
                    builder.setAllowedAuthenticators(allowed);
                } else {
                    builder.setDeviceCredentialAllowed(true); // no negative button allowed with this
                }
                prompt.authenticate(builder.build());
            } catch (Throwable t) {
                call.reject("Authentication could not be started", new Exception(t));
            }
        });
    }

    @PluginMethod
    public void authClearSession(PluginCall call) {
        // Tokens + user + apiOrigin, plus the encrypted offline snapshot and
        // background status, so nothing about the previous account survives.
        NativeBackgroundSync.clearAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void authRefresh(PluginCall call) {
        new Thread(() -> {
            try {
                if (!isNativeUnlocked()) {
                    call.reject("Native session is locked");
                    return;
                }
                // Single-flight with the background worker: the backend rotates
                // refresh tokens, so two uncoordinated refreshers can revoke the
                // user's sessions.
                String access = NativeBackgroundSync.refreshSession(getContext());
                SharedPreferences p = authPrefs();
                String refresh = NativeBackgroundSync.getDecrypted(p, "refreshToken");
                long expiresAt = p.getLong("expiresAt", 0L);
                p.edit().putLong("unlockedUntil", System.currentTimeMillis() + UNLOCK_WINDOW_MS).commit();

                JSObject out = new JSObject();
                out.put("success", true);
                out.put("accessToken", access);
                out.put("refreshToken", refresh == null ? JSObject.NULL : refresh);
                out.put("expiresAt", expiresAt);
                out.put("expiresIn", Math.max(0L, (expiresAt - System.currentTimeMillis()) / 1000L));
                call.resolve(out);
            } catch (NativeBackgroundSync.SessionExpiredException e) {
                call.reject("Native session expired", "SESSION_EXPIRED", e);
            } catch (Throwable t) {
                call.reject("Native token refresh failed", t instanceof Exception ? (Exception) t : new Exception(t));
            }
        }).start();
    }

    // ---------------------------------------------------------------------
    // Background sync bridge
    // ---------------------------------------------------------------------

    @PluginMethod
    public void backgroundSyncNow(PluginCall call) {
        if (!isNativeUnlocked()) {
            call.reject("Native session is locked");
            return;
        }
        new Thread(() -> {
            try {
                NativeBackgroundSync.run(getContext());
                JSObject out = new JSObject();
                out.put("success", true);
                out.put("syncedAt", authPrefs().getLong("lastNativeSyncAt", System.currentTimeMillis()));
                out.put("snapshot", orNull(NativeBackgroundSync.readSnapshot(getContext())));
                call.resolve(out);
            } catch (Throwable t) {
                call.reject("Native sync failed", t instanceof Exception ? (Exception) t : new Exception(t));
            }
        }).start();
    }

    @PluginMethod
    public void getBackgroundSnapshot(PluginCall call) {
        if (!isNativeUnlocked()) {
            call.reject("Native session is locked");
            return;
        }
        new Thread(() -> {
            JSObject out = new JSObject();
            out.put("snapshot", orNull(NativeBackgroundSync.readSnapshot(getContext())));
            out.put("syncedAt", authPrefs().getLong("lastNativeSyncAt", 0L));
            call.resolve(out);
        }).start();
    }

    @PluginMethod
    public void backgroundStatus(PluginCall call) {
        SharedPreferences b = backgroundPrefs();
        JSObject out = new JSObject();
        out.put("lastRunAt", b.getLong("lastRunAt", 0L));
        out.put("lastBackendCheckAt", b.getLong("lastBackendCheckAt", 0L));
        out.put("lastBackendStatus", b.getInt("lastBackendStatus", 0));
        out.put("backendReachable", b.getBoolean("backendReachable", false));
        out.put("syncRequested", b.getBoolean("syncRequested", false));
        out.put("syncRequestedAt", b.getLong("syncRequestedAt", 0L));
        out.put("lastNativeSyncAt", authPrefs().getLong("lastNativeSyncAt", 0L));
        call.resolve(out);
    }

    @PluginMethod
    public void clearBackgroundSyncRequest(PluginCall call) {
        backgroundPrefs().edit().putBoolean("syncRequested", false).commit();
        call.resolve();
    }

    @PluginMethod
    public void getPendingDeepLink(PluginCall call) {
        String url = pendingDeepLink;
        pendingDeepLink = null;
        JSObject out = new JSObject();
        out.put("url", orNull(url));
        call.resolve(out);
    }

    private static Object orNull(String s) {
        return s == null ? JSObject.NULL : s;
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

    /**
     * The manifest declares CAMERA. When an app declares CAMERA, ACTION_IMAGE_CAPTURE
     * throws SecurityException unless the runtime permission has been granted, and
     * nothing was ever requesting it. Ask first.
     */
    @PluginMethod
    public void takePhoto(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback");
            return;
        }
        launchCamera(call);
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            launchCamera(call);
        } else {
            call.reject("Camera permission was denied", "PERMISSION_DENIED");
        }
    }

    private void launchCamera(PluginCall call) {
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

    // ---------------------------------------------------------------------
    // Native Profile / Settings screen (NecpraProfileActivity)
    // ---------------------------------------------------------------------

    /** Lets the web layer detect the screen; an older APK rejects this call, so the web falls back. */
    @PluginMethod
    public void nativeProfileAvailable(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", true);
        call.resolve(out);
    }

    // ---------------------------------------------------------------------
    // Native Friends screen (NecpraFriendsActivity)
    // ---------------------------------------------------------------------

    /** Lets the web layer detect the screen; an older APK rejects this call, so the web falls back. */
    @PluginMethod
    public void nativeFriendsAvailable(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", true);
        call.resolve(out);
    }

    // ---------------------------------------------------------------------
    // Native E2E hand-over (see NecpraE2EStore). The web layer already holds the session's wrap secret;
    // it passes it here once so native can restore the user's EXISTING identity key from the server backup.
    // The secret is used for that single unwrap and is never stored natively.
    // ---------------------------------------------------------------------

    @PluginMethod
    public void e2eStatus(PluginCall call) {
        JSObject out = new JSObject();
        String user = NecpraE2EStore.provisionedUser(getContext());
        out.put("provisioned", user != null);
        if (user != null) out.put("userId", user);
        String why = NecpraE2EStore.lastError(getContext());
        if (user == null && why != null) out.put("lastError", why);   // why the last hand-over failed (shown in the native Messages banner)
        call.resolve(out);
    }

    @PluginMethod
    public void e2eProvision(PluginCall call) {
        final String userId = call.getString("userId");
        final String secret = call.getString("secret");
        final String legacy = call.getString("legacyPassword");
        try {
            NecpraE2EStore.provision(getContext(), userId, secret, legacy); // runs on the plugin thread, not the UI thread
            NecpraE2EStore.setLastError(getContext(), null);
            JSObject out = new JSObject();
            out.put("provisioned", true);
            call.resolve(out);
        } catch (IllegalStateException e) {
            String why = e.getMessage() == null ? "E2E identity could not be provisioned" : e.getMessage();
            NecpraE2EStore.setLastError(getContext(), why);
            call.reject(why);
        } catch (Exception e) {
            NecpraE2EStore.setLastError(getContext(), "Could not reach the server to restore your identity key");
            call.reject("E2E identity could not be provisioned", e);
        }
    }

    // ---------------------------------------------------------------------
    // Native Messages (conversation list + chat). The web layer only routes here when e2eStatus() reports the
    // identity as provisioned for the signed-in account; otherwise the web Messages module keeps working untouched.
    // ---------------------------------------------------------------------

    @PluginMethod
    public void nativeMessagesAvailable(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", true);
        out.put("ready", NecpraE2EStore.provisionedUser(getContext()) != null);
        call.resolve(out);
    }

    /** The web layer decides whether native owns direct messages (flag on AND native identity usable). */
    @PluginMethod
    public void setDmOwner(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        NecpraDmOwner.set(getContext(), on);
        JSObject out = new JSObject();
        out.put("owner", NecpraDmOwner.isOwner(getContext()));
        call.resolve(out);
    }

    @PluginMethod
    public void dmOwner(PluginCall call) {
        JSObject out = new JSObject();
        out.put("owner", NecpraDmOwner.isOwner(getContext()));
        call.resolve(out);
    }

    /** Status reaction/comment for the creator, encrypted and queued natively ({ownerId, interaction: JSON string}). */
    @PluginMethod
    public void sendStatusInteraction(final PluginCall call) {
        final long ownerId = call.getLong("ownerId", 0L);
        final String interaction = call.getString("interaction");
        if (ownerId <= 0 || interaction == null || interaction.isEmpty()) { call.reject("Missing ownerId or interaction"); return; }
        if (!NecpraDmOwner.isOwner(getContext())) { call.reject("Native messaging is not active"); return; }
        final NecpraMessageRepository repo = NecpraMessageRepository.get(getContext());
        repo.async(() -> {
            try {
                boolean ok = repo.sendStatusInteraction(ownerId, interaction);
                JSObject out = new JSObject(); out.put("queued", ok);
                call.resolve(out);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Could not send the interaction" : e.getMessage(), e);
            }
        });
    }

    /** Opens the conversation list, or the chat directly when chatId / peerId is given (e.g. "Message" tapped on a friend). */
    @PluginMethod
    public void openNativeMessages(PluginCall call) {
        try {
            long chatId = call.getLong("chatId", 0L);
            long peerId = call.getLong("peerId", 0L);
            Intent intent;
            if (chatId > 0 || peerId > 0) {
                intent = NecpraChatActivity.intent(getContext(), chatId, peerId, call.getString("title", "Chat"), call.getString("avatar"));
            } else {
                intent = new Intent(getContext(), NecpraConversationsActivity.class);
            }
            startActivityForResult(call, intent, "nativeMessagesResult");
        } catch (Exception e) {
            call.reject("Native messages could not be opened", e);
        }
    }

    @ActivityCallback
    private void nativeMessagesResult(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        out.put("closed", true);
        Intent d = result == null ? null : result.getData();
        if (d != null) {
            out.put("sessionExpired", d.getBooleanExtra(NecpraConversationsActivity.RES_SESSION_EXPIRED, false));
            long groupId = d.getLongExtra(NecpraConversationsActivity.RES_GROUP_ID, 0L);
            if (groupId > 0) out.put("groupId", groupId);   // groups stay in the web module
        }
        call.resolve(out);
    }

    /** Native landing / login / sign up. Returns {action:"login"|"google"|"closed"}; a login also carries the session data. */
    @PluginMethod
    public void openNativeAuth(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), NecpraAuthActivity.class);
            String start = call.getString("start");
            String reason = call.getString("reason");
            if (start != null) intent.putExtra(NecpraAuthActivity.EXTRA_START, start);
            if (reason != null) intent.putExtra(NecpraAuthActivity.EXTRA_REASON, reason);
            startActivityForResult(call, intent, "nativeAuthResult");
        } catch (Exception e) {
            call.reject("Native login could not be opened", e);
        }
    }

    @PluginMethod
    public void nativeAuthAvailable(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", true);
        call.resolve(out);
    }

    @ActivityCallback
    private void nativeAuthResult(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        Intent d = result == null ? null : result.getData();
        String action = d == null ? null : d.getStringExtra(NecpraAuthActivity.RES_ACTION);
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK || action == null) {
            out.put("action", "closed");
            call.resolve(out);
            return;
        }
        out.put("action", action);
        if (NecpraAuthActivity.ACTION_LOGIN.equals(action)) {
            NecpraAuthActivity.Pending p = NecpraAuthActivity.takePending();   // one-shot, in-memory only
            if (p == null) { out.put("action", "closed"); call.resolve(out); return; }
            out.put("token", p.token);
            out.put("refreshToken", p.refreshToken);
            out.put("userJson", p.userJson);
            out.put("expiresAt", p.expiresAt);
            out.put("password", p.password);
        }
        call.resolve(out);
    }

    @PluginMethod
    public void nativeToolsAvailable(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", true);
        call.resolve(out);
    }

    /** Opens the native Categories / marketplace browse screen. `tree` is the web layer's category tree (JSON string). */
    @PluginMethod
    public void openNativeTools(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), NecpraToolsActivity.class);
            String tree = call.getString("tree");
            if (tree != null) intent.putExtra(NecpraToolsActivity.EXTRA_TREE, tree);
            String category = call.getString("category");
            if (category != null) intent.putExtra(NecpraToolsActivity.EXTRA_CATEGORY, category);
            String start = call.getString("start");
            if (start != null) intent.putExtra(NecpraToolsActivity.EXTRA_START, start);
            startActivityForResult(call, intent, "nativeToolsResult");
        } catch (Exception e) {
            call.reject("Native categories could not be opened", e);
        }
    }

    @ActivityCallback
    private void nativeToolsResult(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        out.put("closed", true);
        Intent d = result == null ? null : result.getData();
        if (d != null) {
            out.put("sessionExpired", d.getBooleanExtra(NecpraToolsActivity.RES_SESSION_EXPIRED, false));
            long chatUserId = d.getLongExtra(NecpraToolsActivity.RES_CHAT_USER_ID, 0L);
            if (chatUserId > 0) {
                out.put("chatUserId", chatUserId);
                out.put("chatUserName", d.getStringExtra(NecpraToolsActivity.RES_CHAT_USER_NAME));
            }
            out.put("cartChanged", d.getBooleanExtra(NecpraToolsActivity.RES_CART_CHANGED, false));
            out.put("checkout", d.getBooleanExtra(NecpraToolsActivity.RES_CHECKOUT, false));
            String openWeb = d.getStringExtra(NecpraToolsActivity.RES_OPEN_WEB);
            if (openWeb != null) out.put("openWeb", openWeb);
            String pid = d.getStringExtra(NecpraToolsActivity.RES_OPEN_PRODUCT_ID);
            if (pid != null && !pid.isEmpty()) out.put("openProductId", pid);
        }
        call.resolve(out);
    }

    // ---------------------------------------------------------------------
    // Native Status (NecpraStatusActivity). Same gate as Messages on the web side: only routed here when native
    // owns DMs, because reactions/replies send an encrypted private copy to the creator natively.
    // ---------------------------------------------------------------------

    @PluginMethod
    public void nativeStatusAvailable(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", true);
        call.resolve(out);
    }

    @PluginMethod
    public void openNativeStatus(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), NecpraStatusActivity.class);
            intent.putExtra(NecpraStatusActivity.EXTRA_SECTION, call.getString("section", "feed"));
            long userId = call.getLong("userId", 0L);
            if (userId > 0) intent.putExtra(NecpraStatusActivity.EXTRA_USER_ID, userId);
            startActivityForResult(call, intent, "nativeStatusResult");
        } catch (Exception e) {
            call.reject("Native status could not be opened", e);
        }
    }

    @ActivityCallback
    private void nativeStatusResult(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        out.put("closed", true);
        Intent d = result == null ? null : result.getData();
        if (d != null) {
            out.put("sessionExpired", d.getBooleanExtra(NecpraStatusActivity.RES_SESSION_EXPIRED, false));
            out.put("statusChanged", d.getBooleanExtra(NecpraStatusActivity.RES_CHANGED, false));
            out.put("openVibes", d.getBooleanExtra(NecpraStatusActivity.RES_OPEN_VIBES, false));   // Vibes stays in the web module
        }
        call.resolve(out);
    }

    @PluginMethod
    public void openNativeFriends(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), NecpraFriendsActivity.class);
            intent.putExtra(NecpraFriendsActivity.EXTRA_SECTION, call.getString("section", "friends"));
            startActivityForResult(call, intent, "nativeFriendsResult");
        } catch (Exception e) {
            call.reject("Native friends could not be opened", e);
        }
    }

    @ActivityCallback
    private void nativeFriendsResult(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        out.put("closed", true);
        Intent d = result == null ? null : result.getData();
        if (d != null) {
            out.put("sessionExpired", d.getBooleanExtra(NecpraFriendsActivity.RES_SESSION_EXPIRED, false));
            out.put("friendsChanged", d.getBooleanExtra(NecpraFriendsActivity.RES_CHANGED, false));
            out.put("requestCount", d.getIntExtra(NecpraFriendsActivity.RES_REQUEST_COUNT, 0));
            String friendsJson = d.getStringExtra(NecpraFriendsActivity.RES_FRIENDS_JSON);
            if (friendsJson != null) out.put("friendsJson", friendsJson);
            long chatUserId = d.getLongExtra(NecpraFriendsActivity.RES_CHAT_USER_ID, 0L);
            if (chatUserId > 0) {
                out.put("chatUserId", chatUserId);
                out.put("chatUserName", d.getStringExtra(NecpraFriendsActivity.RES_CHAT_USER_NAME));
                out.put("chatAvatar", d.getStringExtra(NecpraFriendsActivity.RES_CHAT_AVATAR));
            }
        }
        call.resolve(out);
    }

    @PluginMethod
    public void openNativeProfile(PluginCall call) {
        try {
            String section = call.getString("section", "home");
            if ("settings".equals(section) || section.startsWith("settings:")) {
                Intent intent = new Intent(getContext(), NecpraSettingsActivity.class);
                String requested = section.startsWith("settings:") ? section.substring("settings:".length()) : "home";
                intent.putExtra(NecpraSettingsActivity.EXTRA_SECTION, requested);
                startActivityForResult(call, intent, "nativeSettingsResult");
                return;
            }
            Intent intent = new Intent(getContext(), NecpraProfileActivity.class);
            intent.putExtra(NecpraProfileActivity.EXTRA_SECTION, section);
            startActivityForResult(call, intent, "nativeProfileResult");
        } catch (Exception e) {
            call.reject("Native profile could not be opened", e);
        }
    }

    @ActivityCallback
    private void nativeProfileResult(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        out.put("closed", true);
        Intent d = result == null ? null : result.getData();
        if (d != null) {
            out.put("loggedOut", d.getBooleanExtra(NecpraProfileActivity.RES_LOGGED_OUT, false));
            out.put("sessionExpired", d.getBooleanExtra(NecpraProfileActivity.RES_SESSION_EXPIRED, false));
            out.put("locked", d.getBooleanExtra(NecpraProfileActivity.RES_LOCKED, false));
            boolean changed = d.getBooleanExtra(NecpraProfileActivity.RES_CHANGED, false);
            out.put("profileChanged", changed);
            if (changed) {
                out.put("avatar", d.getStringExtra("avatar"));
                out.put("username", d.getStringExtra("username"));
                out.put("displayName", d.getStringExtra("displayName"));
                out.put("bio", d.getStringExtra("bio"));
            }
        }
        call.resolve(out);
    }

    @ActivityCallback
    private void nativeSettingsResult(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        out.put("closed", true);
        Intent d = result == null ? null : result.getData();
        if (d != null) {
            boolean changed = d.getBooleanExtra(NecpraSettingsActivity.RES_CHANGED, false);
            out.put("settingsChanged", changed);
            out.put("profileChanged", changed);
            out.put("loggedOut", d.getBooleanExtra(NecpraSettingsActivity.RES_LOGGED_OUT, false));
            out.put("accountDeleted", d.getBooleanExtra(NecpraSettingsActivity.RES_ACCOUNT_DELETED, false));
        }
        call.resolve(out);
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null) {
            call.reject("uri is required");
            return;
        }
        Uri uri = Uri.parse(uriString);
        // Only content:// URIs (FileProvider / picker). A file:// URI would crash
        // with FileUriExposedException and could expose app-private paths.
        if (!"content".equalsIgnoreCase(uri.getScheme())) {
            call.reject("Only content:// URIs can be shared");
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(call.getString("mimeType", "*/*"));
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, call.getString("title", "Share with"));
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(chooser);
        call.resolve();
    }

    @PluginMethod
    public void downloadFile(PluginCall call) {
        if (!isNativeUnlocked()) {
            call.reject("Native session is locked");
            return;
        }
        final String url = call.getString("url");
        final String requestedName = call.getString("fileName", "download");
        if (url == null || !url.startsWith("https://")) {
            call.reject("A secure https URL is required");
            return;
        }

        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                // Only our own backend gets the bearer token; a CDN / third-party
                // host must never receive it.
                boolean ours = NativeBackgroundSync.isBackendUrl(getContext(), url);
                String access = ours ? NativeBackgroundSync.getDecrypted(authPrefs(), "accessToken") : null;

                c = open(url, access);
                int status = c.getResponseCode();
                if (status == 401 && ours) {
                    c.disconnect();
                    access = NativeBackgroundSync.refreshSession(getContext());
                    c = open(url, access);
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
                call.reject("Download failed", t instanceof Exception ? (Exception) t : new Exception(t));
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }

    private static HttpURLConnection open(String url, String accessToken) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(60000);
        c.setUseCaches(false);
        c.setRequestProperty("Accept", "*/*");
        if (accessToken != null) c.setRequestProperty("Authorization", "Bearer " + accessToken);
        return c;
    }

    @PluginMethod
    public void uploadFile(PluginCall call) {
        if (!isNativeUnlocked()) {
            call.reject("Native session is locked");
            return;
        }
        String endpoint = call.getString("endpoint");
        String uriString = call.getString("uri");
        String fieldName = call.getString("fieldName", "file");
        String mimeType = call.getString("mimeType", "*/*");
        if (endpoint == null || uriString == null || !endpoint.startsWith("https://")) {
            call.reject("Secure endpoint and file uri are required");
            return;
        }
        final String fileName = safeFileName(call.getString("fileName", "upload"));
        final String safeField = fieldName.replaceAll("[^A-Za-z0-9_\\-]", "_");
        final String safeMime = mimeType.replaceAll("[\\r\\n\"]", "");

        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                boolean ours = NativeBackgroundSync.isBackendUrl(getContext(), endpoint);
                String access = ours ? NativeBackgroundSync.getDecrypted(authPrefs(), "accessToken") : null;
                Uri uri = Uri.parse(uriString);
                if (!"content".equalsIgnoreCase(uri.getScheme())) throw new Exception("Only content:// files can be uploaded");

                String boundary = "----NecpraBoundary" + System.currentTimeMillis();
                c = (HttpURLConnection) new URL(endpoint).openConnection();
                c.setDoOutput(true);
                c.setRequestMethod("POST");
                c.setConnectTimeout(15000);
                c.setReadTimeout(60000);
                c.setChunkedStreamingMode(16 * 1024); // don't buffer whole files in memory
                c.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                c.setRequestProperty("Accept", "application/json");
                if (access != null) c.setRequestProperty("Authorization", "Bearer " + access);

                try (OutputStream out = c.getOutputStream();
                     InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new Exception("Could not open selected file");
                    String header = "--" + boundary + "\r\n" +
                            "Content-Disposition: form-data; name=\"" + safeField + "\"; filename=\"" + fileName + "\"\r\n" +
                            "Content-Type: " + safeMime + "\r\n\r\n";
                    out.write(header.getBytes(StandardCharsets.UTF_8));
                    byte[] buffer = new byte[8192];
                    int n;
                    while ((n = in.read(buffer)) >= 0) out.write(buffer, 0, n);
                    out.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
                }

                int status = c.getResponseCode();
                String response = NativeBackgroundSync.readText(
                        status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream());
                if (status == 401) {
                    // A streamed body can't be replayed, so refresh now (so the
                    // caller's retry works) but don't resend automatically.
                    if (ours) {
                        try { NativeBackgroundSync.refreshSession(getContext()); } catch (Throwable ignored) {}
                    }
                    throw new Exception("Upload authentication expired - retry the upload");
                }
                if (status < 200 || status >= 300) throw new Exception("Upload failed with HTTP " + status);

                JSObject out = new JSObject();
                out.put("status", status);
                out.put("data", response);
                call.resolve(out);
            } catch (Throwable t) {
                call.reject("Upload failed", t instanceof Exception ? (Exception) t : new Exception(t));
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }

    private static String safeFileName(String value) {
        String name = value == null || value.trim().isEmpty() ? "download" : value.trim();
        name = name.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_").replaceAll("^\\.+", "_");
        return name.length() > 120 ? name.substring(0, 120) : name;
    }

    // ---------------------------------------------------------------------
    // Biometric/device status and diagnostics
    // ---------------------------------------------------------------------

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

    @PluginMethod
    public void openNativeGame(PluginCall call) {
        String game = call.getString("game", "water3d");
        if (!"water3d".equalsIgnoreCase(game)) { call.reject("Unsupported native game"); return; }
        Intent intent = new Intent(getContext(), Necpra3DWaterSortActivity.class);
        intent.putExtra("level", Math.max(1, call.getInt("level", 1)));
        getContext().startActivity(intent);
        call.resolve();
    }
}
