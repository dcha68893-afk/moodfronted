package com.necpa;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;

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
        super.onCreate(savedInstanceState);

        scheduleNativeBackgroundMaintenance();
        dispatchDeepLink(getIntent());

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
        dispatchDeepLink(intent);
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

    private void dispatchDeepLink(Intent intent) {
        if (intent == null) return;
        Uri uri = intent.getData();
        if (uri == null) return;

        String raw = uri.toString();
        boolean allowed = "necpra".equalsIgnoreCase(uri.getScheme()) ||
                (("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) &&
                        "necpra.co.ke".equalsIgnoreCase(uri.getHost()));

        if (!allowed || getBridge() == null || getBridge().getWebView() == null) return;

        try {
            String payload = JSONObject.quote(raw);
            String javascript =
                    "window.dispatchEvent(new CustomEvent('necpra:native-deeplink'," +
                    "{detail:{url:" + payload + "}}));";

            getBridge().getWebView().postDelayed(() ->
                    getBridge().getWebView().evaluateJavascript(javascript, null), 800);
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
