package com.necpa;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;

import androidx.core.app.RemoteInput;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    private static final String BACKGROUND_WORK_NAME = "necpra-native-maintenance";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        } catch (Exception ignored) {}

        registerPlugin(NecpraNativePlugin.class);
        registerPlugin(NecpraNotifyPlugin.class);
        super.onCreate(savedInstanceState);

        // Channels must exist before the first push can be shown while the UI never ran.
        try { NecpraNotifier.ensureChannels(getApplicationContext()); } catch (Throwable ignored) {}

        scheduleNativeBackgroundMaintenance();
        // Only on a real cold start: on a config-change recreate the same
        // intent is re-delivered and would replay the link.
        if (savedInstanceState == null) {
            if (!handleNotificationAction(getIntent(), true)) dispatchDeepLink(getIntent(), true);
        }

        try {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        } catch (Exception ignored) {}
        try {
            getBridge().getWebView().getSettings().setTextZoom(100);
        } catch (Exception ignored) {}
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (!handleNotificationAction(intent, false)) dispatchDeepLink(intent, false);
    }

    @Override
    protected void onStart() {
        super.onStart();
        NecpraNotifier.appForeground = true;
    }

    @Override
    protected void onStop() {
        NecpraNotifier.appForeground = false;
        super.onStop();
    }

    private void scheduleNativeBackgroundMaintenance() {
        try {
            Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
            PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                    NecpraBackgroundWorker.class, 15, TimeUnit.MINUTES).setConstraints(constraints).build();

            WorkManager.getInstance(getApplicationContext()).enqueueUniquePeriodicWork(
                    BACKGROUND_WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP,
                    request
            );
        } catch (Throwable t) {
            Log.w("NecpraBackground", "Could not schedule native maintenance", t);
        }
    }

    /**
     * Reply typed into a message notification. The text is queued for the web layer, which sends it
     * through the normal end-to-end-encrypted pipeline (the keys live in the WebView), and the chat
     * is opened so the user sees it go out. Returns true if this intent was a notification reply.
     */
    private boolean handleNotificationAction(Intent intent, boolean coldStart) {
        if (intent == null || !NecpraNotifier.ACTION_REPLY.equals(intent.getAction())) return false;

        String kind = intent.getStringExtra(NecpraNotifier.EXTRA_KIND);
        String id = intent.getStringExtra(NecpraNotifier.EXTRA_ID);
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence text = results == null ? null : results.getCharSequence(NecpraNotifier.KEY_REPLY_TEXT);

        // Consume so a re-delivered intent can never send the same reply twice.
        intent.setAction(null);
        intent.removeExtra(NecpraNotifier.EXTRA_KIND);
        intent.removeExtra(NecpraNotifier.EXTRA_ID);

        if (kind == null || id == null) return true;
        String clean = text == null ? "" : text.toString().trim();
        if (!clean.isEmpty()) NecpraNotifyPlugin.queueReply(kind, id, clean);

        // Clear the notification (it also stops the "sending" spinner on the inline reply box).
        NecpraNotifier.cancelConversation(getApplicationContext(), NecpraNotifier.key(kind, id));

        String link = "necpra://" + ("g".equals(kind) ? "group/" : "chat/") + Uri.encode(id);
        forwardLink(link, coldStart);

        if (!clean.isEmpty() && !coldStart && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('necpra:native-notification-reply'));", null));
        }
        return true;
    }

    private void dispatchDeepLink(Intent intent, boolean coldStart) {
        if (intent == null) return;
        Uri uri = intent.getData();
        if (uri == null) return;

        String raw = uri.toString();
        // https only (plain http was accepted here but is not declared in the manifest).
        boolean allowed = "necpra".equalsIgnoreCase(uri.getScheme()) ||
                ("https".equalsIgnoreCase(uri.getScheme()) &&
                        "necpra.co.ke".equalsIgnoreCase(uri.getHost()));
        if (!allowed) return;

        // Consume it so re-delivery of this intent can't replay the link.
        intent.setData(null);

        forwardLink(raw, coldStart);
    }

    private void forwardLink(String raw, boolean coldStart) {
        if (coldStart) {
            // The WebView hasn't loaded yet, so there is nobody to receive an
            // event (the old fixed 800 ms delay raced the page load and often
            // lost the link). Park it; native-init.js pulls it once its
            // listener is registered.
            NecpraNativePlugin.pendingDeepLink = raw;
            return;
        }

        if (getBridge() == null || getBridge().getWebView() == null) {
            NecpraNativePlugin.pendingDeepLink = raw;
            return;
        }

        try {
            String payload = JSONObject.quote(raw);
            String javascript =
                    "window.dispatchEvent(new CustomEvent('necpra:native-deeplink'," +
                    "{detail:{url:" + payload + "}}));";
            getBridge().getWebView().post(() ->
                    getBridge().getWebView().evaluateJavascript(javascript, null));
        } catch (Throwable t) {
            Log.w("NecpraDeepLink", "Could not forward deep link", t);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        } catch (Exception ignored) {}
        try {
            if (android.os.Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false);
        } catch (Throwable ignored) {}
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN &&
                requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");

            if (pluginHandle == null) {
                Log.i("Google Activity Result", "SocialLogin login handle is null");
                return;
            }

            Plugin plugin = pluginHandle.getInstance();

            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.i("Google Activity Result", "SocialLogin plugin instance is not SocialLoginPlugin");
                return;
            }

            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
