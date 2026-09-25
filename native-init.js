/**
 * native-init.js — native splash screen + status bar for the bundled Capacitor app.
 *
 * Only does anything when actually running as the installed native app
 * (window.Capacitor.isNativePlatform()); a no-op in a normal browser tab,
 * so this is safe to include on every page.
 *
 * Requires (after switching capacitor.config.json to bundled mode):
 *   npm install
 *   npx cap sync android
 *
 * Include this near the end of <body> on every real entry page
 * (index.html and chat.html at minimum).
 */
(function () {
  'use strict';
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;

  var Plugins = window.Capacitor.Plugins || {};
  var SplashScreen = Plugins.SplashScreen;
  var StatusBar = Plugins.StatusBar;

  // Theme the native status bar to match the app's blue brand color
  // (see .ns-add / .ns-btn.primary — #2563eb — used throughout the UI).
  if (StatusBar) {
    try {
      StatusBar.setBackgroundColor({ color: '#2563eb' }).catch(function () {});
      StatusBar.setStyle({ style: 'DARK' }).catch(function () {}); // light icons/text on the dark-blue bar
      StatusBar.setOverlaysWebView({ overlay: false }).catch(function () {});
    } catch (_) {}
  }

  // Hide the splash screen once the real app UI is actually visible, not on
  // a fixed timer — launchAutoHide is set to false in capacitor.config.json
  // specifically so a slow device (or slow first paint) doesn't show a blank
  // white flash between "splash hidden" and "content ready".
  function hideSplash() {
    if (!SplashScreen) return;
    try { SplashScreen.hide({ fadeOutDuration: 200 }).catch(function () {}); } catch (_) {}
  }

  if (document.readyState === 'complete') {
    // requestAnimationFrame so we hide after the browser has actually painted,
    // not just after the load event fires.
    requestAnimationFrame(function () { requestAnimationFrame(hideSplash); });
  } else {
    window.addEventListener('load', function () {
      requestAnimationFrame(function () { requestAnimationFrame(hideSplash); });
    }, { once: true });
  }

  // Safety net: never leave the splash stuck on screen even if something
  // above throws or content never reports itself as ready.
  setTimeout(hideSplash, 4000);
})();
