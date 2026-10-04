package com.necpa;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;

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

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "NecpraNative")
public class NecpraNativePlugin extends Plugin {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "necpra_secure_storage_v1";
    private static final String PREFS = "necpra_secure_storage";
    private static final int GCM_TAG_BITS = 128;

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

    @PluginMethod
    public void secureSet(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");

        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }

        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());

            byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String packed = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" +
                    Base64.encodeToString(ciphertext, Base64.NO_WRAP);

            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(key, packed).apply();

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
            String packed = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(key, null);

            JSObject result = new JSObject();

            if (packed == null) {
                result.put("value", JSObject.NULL);
                call.resolve(result);
                return;
            }

            String[] parts = packed.split(":", 2);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    getOrCreateKey(),
                    new GCMParameterSpec(GCM_TAG_BITS, Base64.decode(parts[0], Base64.NO_WRAP))
            );

            String value = new String(
                    cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)),
                    StandardCharsets.UTF_8
            );

            result.put("value", value);
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

        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().remove(key).apply();
        call.resolve();
    }

    @PluginMethod
    public void secureStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("native", true);
        result.put("keystore", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M);
        call.resolve(result);
    }

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
                        getContext().getContentResolver().takePersistableUriPermission(
                                uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    } catch (Exception ignored) {}
                    uris.put(uri.toString());
                }

                out.put("uris", uris);
            } else if (data.getData() != null) {
                Uri uri = data.getData();

                try {
                    getContext().getContentResolver().takePersistableUriPermission(
                            uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
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
            File file = new File(
                    getContext().getCacheDir(),
                    "necpra-photo-" + System.currentTimeMillis() + ".jpg"
            );

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
        for (File file : files) {
            if (file.lastModified() > newest.lastModified()) newest = file;
        }

        JSObject out = new JSObject();
        out.put(
                "uri",
                FileProvider.getUriForFile(
                        getContext(),
                        getContext().getPackageName() + ".fileprovider",
                        newest
                ).toString()
        );
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

        getContext().startActivity(
                Intent.createChooser(send, call.getString("title", "Share with"))
        );
        call.resolve();
    }

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
                        call.reject(errString != null
                                ? errString.toString()
                                : "Biometric authentication failed");
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        // Keep the prompt open until Android reports success or cancellation.
                    }
                }
        );

        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(call.getString("title", "Unlock Necpra"))
                .setSubtitle(call.getString("subtitle", "Verify your identity"))
                .setNegativeButtonText(call.getString("cancelText", "Cancel"))
                .build();

        prompt.authenticate(info);
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
