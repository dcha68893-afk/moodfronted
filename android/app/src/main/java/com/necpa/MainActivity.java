package com.necpa;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /*
     * ROOT CAUSE ("features seem small" in the installed app vs the browser):
     * Chrome explicitly compensates for the device's Settings > Display >
     * Font size accessibility value. A bare Capacitor/Android WebView does
     * NOT do this on its own -- it inherits the system font scale directly,
     * so the exact same CSS renders at a different physical size in the app
     * than it does in Chrome, depending on that per-device setting. This had
     * nothing to do with anything saved in the app's own Settings screen.
     *
     * Fix: pin the WebView's text zoom to a fixed 100%, independent of the
     * device's system font scale, so the APK always renders at the same
     * scale the browser does. (App-level font-size preferences, e.g. the
     * "small/medium/large" choice in Settings, are unaffected -- those are
     * applied in CSS by the web app itself, same as in the browser.)
     *
     * SIGNAL-PARITY GAP: no screenshot/screen-recording protection existed
     * at all -- confirmed by reading this file before this change; it had
     * no security flags set. Signal sets FLAG_SECURE by default, which (a)
     * blocks screenshots and screen recording of the app, and (b) makes the
     * OS show a blank thumbnail instead of the chat content in the recent-
     * apps switcher. This is a real, user-visible privacy property chat
     * apps are commonly compared against Signal on, and unlike the ratchet/
     * forward-secrecy gap, it carries no cryptographic risk to get right --
     * it's a single documented OS flag, not novel crypto.
     * NOTE: this applies to the whole single-Activity app (chat, settings,
     * everything), since this Capacitor app has only one Activity -- there
     * is no separate "chat screen" to scope it to natively. Signal lets the
     * user turn this off (some people rely on screenshots for e.g. sharing
     * a received image) -- wiring that toggle to the app's own Settings
     * screen needs a small custom Capacitor plugin (JS can't set this flag
     * directly); flagged as a follow-up, not done here.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        } catch (Exception ignored) {
            // Never let a security hardening call crash app startup.
        }
        try {
            getBridge().getWebView().getSettings().setTextZoom(100);
        } catch (Exception ignored) {
            // If the bridge/WebView isn't ready yet on some device, fail
            // silently -- worst case is the pre-existing system-scaled
            // behavior, not a crash.
        }
    }
}
