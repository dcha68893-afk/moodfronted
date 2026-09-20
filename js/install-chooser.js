/* Necpa install chooser.
 *
 * When someone taps "Install App" they choose how:
 *   - Google Play  -> straight to the Play Store listing
 *   - Install now  -> install as a PWA (native browser prompt, or manual steps if the
 *                     browser does not offer one)
 *
 * Load with a plain <script src="/js/install-chooser.js"></script> in <head> of index.html
 * (early, so it can catch the one-time beforeinstallprompt event).
 *
 * It also (a) fixes the page CSS that made `hidden` buttons/status blocks visible anyway, so the
 * "Installed / Open App" block no longer shows on devices where Necpa is not installed, and
 * (b) explains WHY the browser is not offering a native install (already installed, non-Chrome
 * browser, broken manifest, service worker not ready) instead of a generic "not supported".
 *
 * Play Store package: window.NECPA_PLAY_STORE_ID, or <meta name="necpa-play-store-id">,
 * default "com.necpa" (capacitor.config.json / android/app/build.gradle).
 */
(function () {
  'use strict';
  if (window.__NECPA_INSTALL_CHOOSER__) return;
  window.__NECPA_INSTALL_CHOOSER__ = true;

  var TRIGGERS = '#landingInstallBtn, #authInstallBtn, #pwaInstallButton, [data-pwa-action]';
  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);
  var deferred = null;
  var sheet = null;
  var lastFocus = null;

  function playStoreUrl() {
    var meta = document.querySelector('meta[name="necpa-play-store-id"]');
    var id = window.NECPA_PLAY_STORE_ID || (meta && meta.content) || 'com.necpa';
    return 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(id);
  }

  function isStandalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.indexOf('android-app://') === 0;
    } catch (_) { return false; }
  }

  // ---- capture the install prompt (fires once, browser-timed) ---------------
  // FIX (PWA-INSTALL-SINGLE-OWNER): this file is now the sole
  // beforeinstallprompt owner on index.html — main.js's old competing
  // "Install kynecta" banner (its own listener + showInstallPrompt()/
  // installApp()) has been removed. The two used to race for the same
  // one-time event: whichever banner the user clicked first consumed the
  // prompt, so the other one's Install button would then silently fail.
  // This mirrors pwa-manager.js's already-established single-owner role
  // on chat.html.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    // The page's own 4-second timer may already have shown "not supported"; it was too early.
    hideUnsupportedHints();
    ['landingInstallBtn', 'authInstallBtn'].forEach(function (id) {
      var b = document.getElementById(id); if (b) b.hidden = false;
    });
  });
  window.addEventListener('appinstalled', function () {
    deferred = null;
    try { localStorage.setItem('pwa_installed', '1'); } catch (_) {}
    close();
  });

  // ---- styles ---------------------------------------------------------------
  // index.html gives these classes an explicit `display`, which beats the browser's built-in
  // [hidden]{display:none}. So "hidden" Install / Installed / hint elements were always visible.
  (function fixHiddenAttribute() {
    var st = document.createElement('style');
    st.id = 'nc-hidden-fix';
    st.textContent = '.landing-ghost-btn[hidden],.auth-install-btn[hidden],.pwa-status[hidden],.pwa-install-hint[hidden]{display:none !important}';
    (document.head || document.documentElement).appendChild(st);
  })();

  function hideUnsupportedHints() {
    ['landingPwaHint', 'authPwaHint'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && /support/i.test(el.textContent || '')) el.hidden = true;
    });
  }

  function injectStyles() {
    if (document.getElementById('nc-install-styles')) return;
    var css =
      '.nc-scrim{position:fixed;inset:0;z-index:2147483647;background:rgba(24,20,56,.55);display:flex;align-items:flex-end;justify-content:center;font-family:Roboto,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
      '.nc-sheet{width:100%;max-width:440px;background:#fff;color:#1e1b3f;border-radius:20px 20px 0 0;padding:10px 18px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(24,20,56,.3)}' +
      '.nc-grip{width:38px;height:4px;border-radius:2px;background:#d9d6ee;margin:0 auto 14px}' +
      '.nc-title{margin:0;font-size:20px;font-weight:700;line-height:1.2}' +
      '.nc-sub{margin:4px 0 14px;font-size:14px;color:#5c5985}' +
      '.nc-opt{display:flex;align-items:center;gap:14px;width:100%;box-sizing:border-box;margin:0 0 10px;padding:14px 16px;border-radius:14px;border:1.5px solid #d9d6ee;background:#fff;color:inherit;text-align:left;font:inherit;cursor:pointer}' +
      '.nc-opt:focus-visible{outline:3px solid #8ea2ff;outline-offset:2px}' +
      '.nc-opt:active{transform:scale(.99)}' +
      '.nc-opt-main{background:linear-gradient(135deg,#667eea,#764ba2);border-color:transparent;color:#fff}' +
      '.nc-ico{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#f0efff;font-size:20px}' +
      '.nc-opt-main .nc-ico{background:rgba(255,255,255,.2)}' +
      '.nc-txt{display:flex;flex-direction:column;gap:2px;min-width:0}' +
      '.nc-txt b{font-size:16px;font-weight:600}' +
      '.nc-txt span{font-size:13px;color:#5c5985}' +
      '.nc-opt-main .nc-txt span{color:rgba(255,255,255,.85)}' +
      '.nc-hint{margin:2px 0 10px;padding:10px 12px;border-radius:10px;background:#f2f1fb;font-size:13px;line-height:1.4;color:#38356a}' +
      '.nc-cancel{display:block;width:100%;padding:12px;border:0;background:transparent;color:#5c5985;font:inherit;font-size:15px;cursor:pointer}' +
      '@media (min-width:600px){.nc-scrim{align-items:center}.nc-sheet{border-radius:20px}.nc-grip{display:none}}';
    var st = document.createElement('style');
    st.id = 'nc-install-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---- actions --------------------------------------------------------------
  function goToPlayStore() {
    close();
    window.location.href = playStoreUrl();
  }

  function showHint(text) {
    var el = sheet && sheet.querySelector('[data-nc-hint]');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
  }

  // ---- why can't this browser install right now? ----------------------------
  function browserInfo() {
    var inApp = /FBAN|FBAV|Instagram|MicroMessenger|Line\/|TikTok|musical_ly|Snapchat|; wv\)/i.test(ua);
    var miui = /MiuiBrowser|XiaoMi/i.test(ua);
    var uc = /UCBrowser|UCWEB/i.test(ua);
    var opera = /OPR\/|Opera|OPT\//i.test(ua);
    var firefox = /Firefox|FxiOS/i.test(ua);
    var edge = /EdgA|Edg\//i.test(ua);
    var samsung = /SamsungBrowser/i.test(ua);
    var chrome = /Chrome|CriOS/i.test(ua) && !edge && !opera && !samsung && !miui && !uc && !inApp;
    return { inApp: inApp, miui: miui, uc: uc, opera: opera, firefox: firefox, edge: edge, samsung: samsung, chrome: chrome };
  }

  async function checkManifest() {
    var link = document.querySelector('link[rel="manifest"]');
    if (!link) return 'This page has no web app manifest link, so browsers will not offer installation.';
    try {
      var res = await fetch(link.href, { cache: 'no-store' });
      if (!res.ok) return 'The app manifest could not be loaded (HTTP ' + res.status + ').';
      var m = await res.json();
      var icons = Array.isArray(m.icons) ? m.icons : [];
      var has = function (n) { return icons.some(function (i) { return String(i.sizes || '').split(' ').some(function (z) { return parseInt(z, 10) >= n; }); }); };
      if (!m.start_url) return 'The app manifest has no start_url.';
      if (['standalone', 'fullscreen', 'minimal-ui'].indexOf(m.display) === -1) return 'The app manifest display mode must be standalone.';
      if (!has(192) || !has(512)) return 'The app manifest needs 192px and 512px icons.';
    } catch (_) {
      return 'The app manifest could not be read.';
    }
    return null;
  }

  async function diagnose() {
    try {
      if (isStandalone()) return { code: 'running-installed', message: 'Necpa is already running as an installed app on this device.' };
      if (!window.isSecureContext) return { code: 'insecure', message: 'Installing an app needs a secure (https) connection.' };
      if (isIOS) return { code: 'ios', message: 'On iPhone and iPad, open Necpa in Safari, tap the Share icon, then choose Add to Home Screen.' };
      var b = browserInfo();
      if (b.inApp) return { code: 'in-app-browser', message: 'You are inside another app\u2019s browser, which cannot install apps. Open ' + location.host + ' in Chrome.' };
      if (b.miui || b.uc || b.opera || b.firefox) return { code: 'unsupported-browser', message: 'This browser does not offer app installation for this site. Open ' + location.host + ' in Chrome.' };
      var manifestProblem = await checkManifest();
      if (manifestProblem) return { code: 'manifest', message: manifestProblem };
      if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
        return { code: 'sw-not-ready', message: 'Necpa is still setting up offline support. Reload this page once, wait a few seconds, then try again.' };
      }
      // FIX (DIAGNOSE-FALSE-INSTALLED-CLAIM): this used to assert "that
      // usually means Necpa is already installed" as if that were the
      // established explanation. We have no actual signal that it's
      // installed here — isStandalone() already ruled that in/out above,
      // this branch only runs when it did NOT detect standalone mode. The
      // missing prompt is just as often a dismissed-recently cooldown, a
      // slow/cold-starting service worker, or Chrome's own install-signal
      // heuristics (engagement time, etc.) not being met yet. List the
      // possibilities instead of asserting one as the likely cause.
      return {
        code: 'no-prompt',
        message: 'Chrome has not offered the install prompt for this page yet. This can happen if it was dismissed recently, if Necpa is already installed on this device, or if Chrome simply has not decided to offer it yet. Check your home screen or app drawer for Necpa, or try reloading in a few seconds.'
      };
    } catch (_) {
      return { code: 'unknown', message: 'Could not check installation support.' };
    }
  }

  async function installNow() {
    if (isStandalone()) { showHint('Necpa is already installed on this device.'); return; }
    if (deferred) {
      var evt = deferred;
      deferred = null; // a prompt event can only be used once
      try {
        evt.prompt();
        var choice = await evt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          try { localStorage.setItem('pwa_installed', '1'); } catch (_) {}
          close();
          return;
        }
        showHint('Installation was cancelled. Tap Install now to try again, or choose Google Play.');
      } catch (_) {
        showHint('The install prompt could not open. Use your browser menu and choose Install app.');
      }
      return;
    }
    // No native prompt from this browser: say exactly why, then give the manual route.
    showHint('Checking\u2026');
    var d = await diagnose();
    var manual = (d.code === 'no-prompt' || d.code === 'sw-not-ready' || d.code === 'manifest')
      ? ' You can also install from the Chrome menu (\u22EE): tap Install app, or Add to Home screen and then Install.'
      : '';
    showHint(d.message + manual);
  }

  // ---- UI -------------------------------------------------------------------
  function option(cls, icon, title, sub, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'nc-opt' + (cls ? ' ' + cls : '');
    var ic = document.createElement('span'); ic.className = 'nc-ico'; ic.setAttribute('aria-hidden', 'true'); ic.textContent = icon;
    var tx = document.createElement('span'); tx.className = 'nc-txt';
    var t = document.createElement('b'); t.textContent = title;
    var s = document.createElement('span'); s.textContent = sub;
    tx.appendChild(t); tx.appendChild(s);
    b.appendChild(ic); b.appendChild(tx);
    b.addEventListener('click', onClick);
    return b;
  }

  function open() {
    if (sheet) return;
    injectStyles();
    lastFocus = document.activeElement;

    sheet = document.createElement('div');
    sheet.className = 'nc-scrim';
    var card = document.createElement('div');
    card.className = 'nc-sheet';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'nc-title');

    var grip = document.createElement('div'); grip.className = 'nc-grip';
    var h = document.createElement('h2'); h.className = 'nc-title'; h.id = 'nc-title'; h.textContent = 'Get Necpa';
    var p = document.createElement('p'); p.className = 'nc-sub'; p.textContent = 'Choose how you want to install it.';
    card.appendChild(grip); card.appendChild(h); card.appendChild(p);

    var first = null;
    if (!isIOS) {
      first = option('', '\u25B6', 'Google Play', 'Install the Android app from the Play Store', goToPlayStore);
      card.appendChild(first);
    }
    var now = option('nc-opt-main', '\u2193', 'Install now', 'Add Necpa to your home screen, no store needed', installNow);
    card.appendChild(now);
    if (!first) first = now;

    var hint = document.createElement('p'); hint.className = 'nc-hint'; hint.hidden = true; hint.setAttribute('role', 'status'); hint.setAttribute('data-nc-hint', '');
    card.appendChild(hint);

    var cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'nc-cancel'; cancel.textContent = 'Not now';
    cancel.addEventListener('click', close);
    card.appendChild(cancel);

    sheet.appendChild(card);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
    document.body.appendChild(sheet);
    document.addEventListener('keydown', onKey, true);
    try { first.focus(); } catch (_) {}
  }

  function close() {
    if (!sheet) return;
    document.removeEventListener('keydown', onKey, true);
    if (sheet.parentNode) sheet.parentNode.removeChild(sheet);
    sheet = null;
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (_) {}
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  // ---- intercept every "Install" button (capture phase, before the page's own handlers) ----
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest(TRIGGERS) : null;
    if (!t) return;
    // pwa-mobile-install.js reuses [data-pwa-action] for "Got it" too; only take over Install.
    if (t.hasAttribute('data-pwa-action') && !/^\s*install\s*$/i.test(t.textContent || '')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open();
  }, true);

  // ---- keep the Install button useful on Android ------------------------------
  // index.html hides its Install button (and shows "this browser doesn't support installation")
  // when Chrome never fires beforeinstallprompt. On Android the Play Store option still works,
  // so keep the button visible there unless the app is already installed.
  function keepInstallVisibleOnAndroid() {
    if (!isAndroid || isStandalone()) return;
    ['landing', 'auth'].forEach(function (prefix) {
      var btn = document.getElementById(prefix + 'InstallBtn');
      var status = document.getElementById(prefix + 'PwaStatus');
      var hint = document.getElementById(prefix + 'PwaHint');
      if (!btn || (status && !status.hidden)) return;
      btn.hidden = false;
      if (hint) hint.hidden = true;
    });
  }
  // On non-Android browsers, replace the page's generic "not supported. Try Chrome or Edge"
  // with the real reason (only if the native prompt still has not arrived).
  async function explainUnsupportedHints() {
    if (deferred || isAndroid) return;
    var d = await diagnose();
    ['landingPwaHint', 'authPwaHint'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.hidden && /support/i.test(el.textContent || '')) el.textContent = d.message;
    });
  }
  function scheduleVisibility() {
    [600, 4600, 9000].forEach(function (ms) { setTimeout(keepInstallVisibleOnAndroid, ms); });
    setTimeout(explainUnsupportedHints, 4700);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleVisibility, { once: true });
  else scheduleVisibility();

  window.NecpaInstallChooser = { open: open, close: close, diagnose: diagnose };
})();
