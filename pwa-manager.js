/**
 * Necpa PWA controller  (/pwa-manager.js)
 * ---------------------------------------------------------------------------
 * This file is the ONLY owner of:
 *   1. `beforeinstallprompt` / `appinstalled`     (captured once, kept in one place)
 *   2. the install UI                              (one dialog, one set of buttons)
 *   3. service-worker registration + update flow   (one register() call per page)
 *
 * It replaces the three competing implementations that used to live in
 * pwa-manager.js (desktop), js/pwa-mobile-install.js (mobile) and
 * js/install-chooser.js (landing page chooser), plus the extra listeners in
 * marketplace-advanced.js and index.html.
 *
 * Platform behaviour
 *   Android / desktop Chromium : Chrome is allowed to fire `beforeinstallprompt`.
 *                                The event is saved once; the Install button calls
 *                                event.prompt(). If Chrome never provides the event
 *                                the dialog shows the manual "⋮ → Install app /
 *                                Add to Home screen" steps instead.
 *   iPhone / iPad              : no native prompt exists. We only show
 *                                "Share → Add to Home Screen".
 *   Already installed          : all install UI is suppressed.
 *
 * Load it as a plain (non-deferred, non-async) <script src="/pwa-manager.js">
 * in <head> so the listener exists before Chrome fires the one-time event.
 *
 * Public API (window.NecpaPWA)
 *   .requestInstall()            call from a click handler (native prompt or dialog)
 *   .openInstallDialog()         open the dialog explicitly
 *   .closeInstallDialog()
 *   .install()                   -> Promise<{outcome}>  accepted | dismissed | unavailable | error
 *   .isInstalled()               -> boolean (live standalone check)
 *   .canPromptNatively()         -> boolean (saved beforeinstallprompt available)
 *   .getManualInstructions()     -> {kind, title, text, steps[]}
 *   .diagnose()                  -> Promise<{code, message}> why no native prompt
 *   .registerServiceWorker()     -> Promise<ServiceWorkerRegistration>  (memoised)
 *   .onChange(fn)                subscribe to state changes, returns unsubscribe
 *   .status()                    plain-object snapshot for debugging
 */
(function () {
  'use strict';
  if (window.NecpaPWA) return;

  var SW_URL = '/service-worker.js';
  var DISMISS_KEY = 'necpa_pwa_dismissed_ts';
  var LEGACY_DISMISS_KEYS = ['pwa_dismissed_ts', 'necpa_pwa_mobile_dismissed'];
  var INSTALLED_KEY = 'necpa_pwa_installed';
  var DISMISS_MS = 24 * 60 * 60 * 1000;

  var ua = navigator.userAgent || '';
  var isTop = (function () { try { return window.top === window.self; } catch (_) { return false; } })();
  var isIOS = /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);

  function ls(op, key, val) {
    try {
      if (op === 'get') return localStorage.getItem(key);
      if (op === 'set') return localStorage.setItem(key, val);
      if (op === 'del') return localStorage.removeItem(key);
    } catch (_) {}
    return null;
  }

  function isStandalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.navigator.standalone === true ||
        (document.referrer || '').indexOf('android-app://') === 0;
    } catch (_) { return false; }
  }

  function browserInfo() {
    var inApp = /FBAN|FBAV|Instagram|MicroMessenger|Line\/|TikTok|musical_ly|Snapchat|; wv\)/i.test(ua);
    var miui = /MiuiBrowser|XiaoMi/i.test(ua);
    var uc = /UCBrowser|UCWEB/i.test(ua);
    var opera = /OPR\/|Opera|OPT\//i.test(ua);
    var firefox = /Firefox|FxiOS/i.test(ua);
    var edge = /EdgA|Edg\/|EdgiOS/i.test(ua);
    var samsung = /SamsungBrowser/i.test(ua);
    var chrome = /Chrome|CriOS/i.test(ua) && !edge && !opera && !samsung && !miui && !uc && !inApp;
    return { inApp: inApp, miui: miui, uc: uc, opera: opera, firefox: firefox, edge: edge, samsung: samsung, chrome: chrome };
  }

  /* ======================================================================
   * 1. Service worker registration — ONE register() call per page
   * ====================================================================== */
  var swPromise = null;

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return Promise.reject(new Error('Service workers are not supported in this browser'));
    }
    if (!swPromise) {
      swPromise = navigator.serviceWorker.register(SW_URL, { scope: '/' });
      swPromise.then(function (reg) {
        if (reg && reg.scope !== location.origin + '/') {
          console.warn('[NecpaPWA] service worker scope is ' + reg.scope + ' — it must be ' + location.origin + '/ to control the whole app.');
        }
      }, function (err) {
        swPromise = null; // allow a later retry
        console.warn('[NecpaPWA] service worker registration failed:', err);
      });
    }
    return swPromise;
  }

  /* ======================================================================
   * 2. Install state
   * ====================================================================== */
  var deferredPrompt = null;   // the saved beforeinstallprompt event
  var subscribers = [];

  function snapshot() {
    return {
      installed: isStandalone(),
      nativePromptAvailable: !!deferredPrompt,
      platform: isIOS ? 'ios' : (isAndroid ? 'android' : 'desktop'),
      topLevel: isTop,
      serviceWorkerControlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller)
    };
  }

  function emit() {
    var state = snapshot();
    subscribers.slice().forEach(function (fn) { try { fn(state); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('necpa:pwa-state', { detail: state })); } catch (_) {}
    renderSheet();
  }

  function onChange(fn) {
    subscribers.push(fn);
    return function () { subscribers = subscribers.filter(function (f) { return f !== fn; }); };
  }

  function recentlyDismissed() {
    var keys = [DISMISS_KEY].concat(LEGACY_DISMISS_KEYS);
    for (var i = 0; i < keys.length; i++) {
      var t = Number(ls('get', keys[i]) || 0);
      if (t && Date.now() - t < DISMISS_MS) return true;
    }
    return false;
  }
  function rememberDismiss() { ls('set', DISMISS_KEY, String(Date.now())); }

  /* ======================================================================
   * 3. Install actions
   * ====================================================================== */
  async function install() {
    if (isStandalone()) return { outcome: 'installed' };
    var evt = deferredPrompt;
    if (!evt) return { outcome: 'unavailable' };
    deferredPrompt = null;            // a prompt event can be used exactly once
    try {
      evt.prompt();                   // must run inside a user gesture
      var choice = await evt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        ls('set', INSTALLED_KEY, '1');
        return { outcome: 'accepted' };
      }
      return { outcome: 'dismissed' };
    } catch (err) {
      console.warn('[NecpaPWA] install prompt failed:', err);
      return { outcome: 'error', error: err };
    } finally {
      emit();                         // listeners/dialog now see "no saved prompt"
    }
  }

  function getManualInstructions() {
    var b = browserInfo();
    if (isIOS) {
      if (b.inApp) {
        return { kind: 'ios-inapp', title: 'Install Necpa',
          text: 'This in-app browser cannot install apps. Open ' + location.host + ' in Safari, then follow the steps below.',
          steps: ['Tap Share', 'Choose Add to Home Screen', 'Tap Add'] };
      }
      return { kind: 'ios', title: 'Install Necpa',
        text: 'On iPhone and iPad, installing is done from the Safari Share menu.',
        steps: ['Tap the Share button', 'Scroll down and choose Add to Home Screen', 'Tap Add'] };
    }
    if (isAndroid) {
      if (b.inApp) {
        return { kind: 'android-inapp', title: 'Install Necpa',
          text: 'This in-app browser cannot install apps. Open ' + location.host + ' in Chrome first.',
          steps: ['Open this page in Chrome', 'Tap ⋮ (menu)', 'Choose Install app or Add to Home screen'] };
      }
      if (b.firefox) {
        return { kind: 'android-firefox', title: 'Install Necpa',
          text: 'In Firefox, tap ⋮ and choose Install.', steps: ['Tap ⋮ (menu)', 'Choose Install'] };
      }
      if (b.samsung) {
        return { kind: 'android-samsung', title: 'Install Necpa',
          text: 'In Samsung Internet, open the menu and choose Add page to → Home screen.',
          steps: ['Tap the menu', 'Choose Add page to', 'Choose Home screen'] };
      }
      return { kind: 'android-chrome', title: 'Install Necpa',
        text: 'In Chrome, tap ⋮ and choose Install app or Add to Home screen.',
        steps: ['Tap ⋮ (top-right menu)', 'Choose Install app (or Add to Home screen)', 'Tap Install'] };
    }
    return { kind: 'desktop', title: 'Install Necpa',
      text: 'Click the install icon at the right of the address bar, or open the browser menu and choose Install Necpa.',
      steps: ['Look for the install icon in the address bar', 'Or open the browser menu → Install Necpa'] };
  }

  async function checkManifest() {
    var link = document.querySelector('link[rel="manifest"]');
    if (!link) return 'This page has no web app manifest link, so browsers will not offer installation.';
    try {
      var res = await fetch(link.href, { cache: 'no-store' });
      if (!res.ok) return 'The app manifest could not be loaded (HTTP ' + res.status + ').';
      var m = await res.json();
      var icons = Array.isArray(m.icons) ? m.icons : [];
      var has = function (n) {
        return icons.some(function (i) {
          return String(i.sizes || '').split(' ').some(function (z) { return parseInt(z, 10) >= n; });
        });
      };
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
      if (isStandalone()) return { code: 'installed', message: 'Necpa is already running as an installed app on this device.' };
      if (!window.isSecureContext) return { code: 'insecure', message: 'Installing an app needs a secure (https) connection.' };
      if (isIOS) return { code: 'ios', message: 'iPhone and iPad have no install prompt — use Share → Add to Home Screen in Safari.' };
      var b = browserInfo();
      if (b.inApp) return { code: 'in-app-browser', message: 'You are inside another app’s browser, which cannot install apps. Open ' + location.host + ' in Chrome.' };
      if (b.miui || b.uc || b.opera || b.firefox) return { code: 'unsupported-browser', message: 'This browser does not offer a one-tap install for this site. Open ' + location.host + ' in Chrome.' };
      var manifestProblem = await checkManifest();
      if (manifestProblem) return { code: 'manifest', message: manifestProblem };
      return { code: 'no-prompt', message: 'Chrome has not offered its native prompt yet. Chrome controls when that event becomes available; use the Install button here or Chrome menu → Add to Home screen → Install app.' };
    } catch (_) {
      return { code: 'unknown', message: 'Could not check installation support.' };
    }
  }

  // Called from a click handler. Native prompt when we have one, dialog otherwise.
  function requestInstall() {
    if (isStandalone()) { openInstallDialog(); return; }
    if (deferredPrompt) {
      install().then(function (r) {
        if (r.outcome === 'accepted') closeInstallDialog(false);
        else if (r.outcome === 'error') openInstallDialog();
      });
      return;
    }
    openInstallDialog();
  }

  /* ======================================================================
   * 4. beforeinstallprompt / appinstalled — the only listeners in the app
   * ====================================================================== */
  var autoShown = false;

  if (isTop) {
    window.addEventListener('beforeinstallprompt', function (event) {
      if (isStandalone()) return;
      event.preventDefault();          // defer Chrome's own mini-infobar; we present the prompt ourselves
      deferredPrompt = event;          // saved here, used by install()
      ls('del', INSTALLED_KEY);        // Chrome only offers this when the app is NOT installed
      emit();
      scheduleAutoDialog(1200);
    });

    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      ls('set', INSTALLED_KEY, '1');
      ls('del', DISMISS_KEY);
      closeInstallDialog(false);
      applyInstalledClass();
      emit();
    });
  }

  function applyInstalledClass() {
    try { document.documentElement.classList.toggle('pwa-standalone', isStandalone()); } catch (_) {}
  }

  /* ======================================================================
   * 5. Install dialog (one UI for everything)
   * ====================================================================== */
  var sheet = null;
  var sheetHint = '';
  var lastFocus = null;

  function playStoreUrl() {
    var meta = document.querySelector('meta[name="necpa-play-store-id"]');
    var id = window.NECPA_PLAY_STORE_ID || (meta && meta.content) || 'com.necpa';
    return 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(id);
  }

  function injectStyles() {
    if (document.getElementById('np-styles')) return;
    var css =
      '.np-scrim{position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:18px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      '.np-card{position:relative;width:min(380px,100%);max-height:calc(100vh - 36px);overflow:auto;background:#fff;color:#172033;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:22px 20px;text-align:center}' +
      '.np-x{position:absolute;top:8px;right:10px;border:0;background:transparent;color:#667085;font-size:22px;line-height:1;padding:6px;cursor:pointer}' +
      '.np-icon{width:56px;height:56px;border-radius:14px;object-fit:cover;margin:0 auto 12px;display:block}' +
      '.np-title{margin:0;font-size:17px;font-weight:750;line-height:1.2}' +
      '.np-text{margin:8px 0 0;font-size:13.5px;line-height:1.45;color:#5b667a}' +
      '.np-steps{margin:12px 0 0;padding:0 0 0 20px;text-align:left;font-size:13.5px;line-height:1.55;color:#344054}' +
      '.np-hint{margin:12px 0 0;padding:9px 11px;border-radius:10px;background:#f2f4f7;font-size:12.5px;line-height:1.4;color:#475467;text-align:left}' +
      '.np-btn{display:block;width:100%;box-sizing:border-box;margin-top:14px;border:0;border-radius:11px;padding:12px 13px;background:#1a73e8;color:#fff;font:inherit;font-weight:700;font-size:14px;cursor:pointer}' +
      '.np-btn.np-alt{background:#eef2ff;color:#1a3fa8}' +
      '.np-btn.np-quiet{background:transparent;color:#667085;font-weight:600;margin-top:6px}' +
      '.np-btn:focus-visible,.np-x:focus-visible{outline:3px solid #8ea2ff;outline-offset:2px}' +
      // `hidden` must win over the page's own display rules (index.html gives these classes an explicit display).
      '.landing-ghost-btn[hidden],.auth-install-btn[hidden],.pwa-status[hidden],.pwa-install-hint[hidden]{display:none !important}' +
      'html.pwa-standalone [data-pwa-install]{display:none !important}';
    var st = document.createElement('style');
    st.id = 'np-styles';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function button(label, cls, onClick) {
    var b = mk('button', 'np-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function renderSheet() {
    if (!sheet) return;
    var card = sheet.firstChild;
    while (card.firstChild) card.removeChild(card.firstChild);

    var x = mk('button', 'np-x', '×');
    x.type = 'button'; x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', function () { closeInstallDialog(true); });
    card.appendChild(x);

    var icon = mk('img', 'np-icon');
    icon.src = '/icons/necpa-192.png'; icon.alt = 'Necpa';
    icon.addEventListener('error', function () { icon.style.display = 'none'; });
    card.appendChild(icon);

    var title = mk('h2', 'np-title', 'Install Necpa');
    title.id = 'np-title';
    card.appendChild(title);

    if (isStandalone()) {
      card.appendChild(mk('p', 'np-text', 'Necpa is already installed on this device.'));
      card.appendChild(button('Close', '', function () { closeInstallDialog(false); }));
      return;
    }

    if (deferredPrompt) {
      card.appendChild(mk('p', 'np-text', 'Install Necpa on your device for faster access and offline support.'));
      if (sheetHint) card.appendChild(mk('p', 'np-hint', sheetHint));
      card.appendChild(button('Install', '', function () {
        sheetHint = '';
        install().then(function (r) {
          if (r.outcome === 'accepted') { closeInstallDialog(false); return; }
          if (r.outcome === 'dismissed') sheetHint = 'Installation was cancelled. You can try again any time from the Install button.';
          else if (r.outcome === 'error') sheetHint = 'The install prompt could not open. Use your browser menu and choose Install app.';
          renderSheet();
        });
      }));
      card.appendChild(button('Not now', 'np-quiet', function () { closeInstallDialog(true); }));
      return;
    }

    // No native prompt: platform-specific manual instructions.
    var m = getManualInstructions();
    card.appendChild(mk('p', 'np-text', m.text));
    var ol = mk('ol', 'np-steps');
    m.steps.forEach(function (s) { ol.appendChild(mk('li', '', s)); });
    card.appendChild(ol);
    if (sheetHint) card.appendChild(mk('p', 'np-hint', sheetHint));
    if (isAndroid && !browserInfo().inApp) {
      card.appendChild(button('Get it on Google Play', 'np-alt', function () {
        closeInstallDialog(false);
        window.location.href = playStoreUrl();
      }));
    }
    card.appendChild(button('Got it', '', function () { closeInstallDialog(true); }));
  }

  function onKey(e) { if (e.key === 'Escape') closeInstallDialog(true); }

  function openInstallDialog() {
    if (sheet || !document.body) return;
    injectStyles();
    lastFocus = document.activeElement;
    sheet = mk('div', 'np-scrim');
    sheet.id = 'necpaInstallDialog';
    var card = mk('div', 'np-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'np-title');
    sheet.appendChild(card);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) closeInstallDialog(true); });
    document.body.appendChild(sheet);
    document.addEventListener('keydown', onKey, true);
    sheetHint = '';
    renderSheet();

    // Explain WHY there is no native prompt (only when we are showing manual steps).
    if (!deferredPrompt && !isStandalone() && !isIOS) {
      diagnose().then(function (d) {
        if (sheet && !deferredPrompt && d && d.code !== 'installed') { sheetHint = d.message; renderSheet(); }
      });
    }
    try { var f = sheet.querySelector('.np-btn'); if (f) f.focus(); } catch (_) {}
  }

  function closeInstallDialog(remember) {
    if (!sheet) return;
    if (remember) rememberDismiss();
    document.removeEventListener('keydown', onKey, true);
    if (sheet.parentNode) sheet.parentNode.removeChild(sheet);
    sheet = null;
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (_) {}
  }

  // Auto-open at most once per page load, never when installed, never within 24h of a dismissal.
  function scheduleAutoDialog(delay) {
    if (!isTop || autoShown) return;
    setTimeout(function () {
      if (autoShown || sheet || isStandalone() || recentlyDismissed()) return;
      if (!document.body) return;
      autoShown = true;
      openInstallDialog();
    }, delay);
  }

  // Manual-instruction auto prompts (no native event exists / arrived).
  function scheduleManualFallback() {
    if (!isTop || isStandalone()) return;
    if (isIOS) { scheduleAutoDialog(4000); return; }              // iOS: Share → Add to Home Screen, nothing else
    if (isAndroid && ls('get', INSTALLED_KEY) !== '1') {
      setTimeout(function () { if (!deferredPrompt) scheduleAutoDialog(0); }, 8000);
    }
  }

  // Click delegation: every Install button on every page goes through the controller.
  var TRIGGERS = '#landingInstallBtn, #authInstallBtn, [data-pwa-install]';
  if (isTop) {
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest(TRIGGERS) : null;
      if (!t) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      requestInstall();
    }, true);
  }

  /* ======================================================================
   * 6. Service worker update UX (top-level window only)
   * ====================================================================== */
  function inject(id, html) {
    if (document.getElementById(id) || !document.body) return;
    var d = document.createElement('div');
    d.id = id;
    d.innerHTML = html;
    document.body.appendChild(d);
  }

  function wireServiceWorkerUpdates() {
    if (!('serviceWorker' in navigator)) return;

    var refreshing = false;
    var hadControllerOnLoad = !!navigator.serviceWorker.controller;

    function reloadOnce() {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    }

    function showUpdateBanner() {
      if (document.getElementById('pwaUpdateBanner')) return;
      inject('pwaUpdateBanner',
        '<div style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.2)">' +
        '<div style="flex:1"><strong style="display:block;font-size:13px">Update ready</strong><span style="font-size:11px;opacity:.9">Refresh to get the latest Necpa version.</span></div>' +
        '<button type="button" id="pwaUpdateButton" style="background:#fff;color:#2563eb;border:0;border-radius:8px;padding:8px 15px;font-weight:800;cursor:pointer">Refresh</button>' +
        '<button type="button" id="pwaUpdateClose" aria-label="Dismiss" style="background:none;color:#fff;border:0;font-size:22px;cursor:pointer">&times;</button></div>');
      var u = document.getElementById('pwaUpdateButton');
      var c = document.getElementById('pwaUpdateClose');
      if (u) u.addEventListener('click', window._pwaApplyUpdate);
      if (c) c.addEventListener('click', function () { var b = document.getElementById('pwaUpdateBanner'); if (b) b.remove(); });
    }

    window._pwaApplyUpdate = function () {
      var banner = document.getElementById('pwaUpdateBanner');
      if (banner) banner.remove();
      try { sessionStorage.setItem('pwa_update_acknowledged', '1'); } catch (_) {}
      navigator.serviceWorker.getRegistration().then(function (registration) {
        if (registration && registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        else { try { sessionStorage.removeItem('pwa_update_acknowledged'); } catch (_) {} reloadOnce(); }
      }).catch(reloadOnce);
      setTimeout(function () {
        var pending = null;
        try { pending = sessionStorage.getItem('pwa_update_acknowledged'); } catch (_) {}
        if (pending) { try { sessionStorage.removeItem('pwa_update_acknowledged'); } catch (_) {} reloadOnce(); }
      }, 4000);
    };

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      var pending = null;
      try { pending = sessionStorage.getItem('pwa_update_acknowledged'); } catch (_) {}
      if (!refreshing && pending) {
        try { sessionStorage.removeItem('pwa_update_acknowledged'); } catch (_) {}
        reloadOnce();
      }
      emit();
    });

    navigator.serviceWorker.addEventListener('message', function (event) {
      if (!event.data || event.data.type !== 'SW_UPDATED') return;
      var version = event.data.version || '';
      var last = ls('get', '_sw_last_version') || '';
      ls('set', '_sw_last_version', version);
      if (hadControllerOnLoad && version && version !== last) showUpdateBanner();
    });

    registerServiceWorker().then(function (registration) {
      if (registration.waiting && navigator.serviceWorker.controller) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      registration.addEventListener('updatefound', function () {
        var worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function () {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) worker.postMessage({ type: 'SKIP_WAITING' });
        });
      });
      setInterval(function () { registration.update().catch(function () {}); }, 30 * 60 * 1000);
      if (isStandalone()) setInterval(function () { registration.update().catch(function () {}); }, 5 * 60 * 1000);
    }).catch(function () { /* already logged by registerServiceWorker */ });
  }

  /* ======================================================================
   * 7. Public API + boot
   * ====================================================================== */
  window.NecpaPWA = {
    requestInstall: requestInstall,
    openInstallDialog: openInstallDialog,
    closeInstallDialog: function () { closeInstallDialog(false); },
    install: install,
    isInstalled: isStandalone,
    canPromptNatively: function () { return !!deferredPrompt; },
    getManualInstructions: getManualInstructions,
    diagnose: diagnose,
    registerServiceWorker: registerServiceWorker,
    onChange: onChange,
    status: snapshot
  };

  // Legacy globals some pages/handlers may still call.
  window._pwaDoInstall = requestInstall;
  window._pwaDismissInstall = function () { closeInstallDialog(true); };

  if (!isTop) return; // frames: API only (shared registerServiceWorker), no UI, no listeners

  injectStyles();
  applyInstalledClass();

  function boot() {
    applyInstalledClass();
    scheduleManualFallback();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  // Register the one service worker once the page has loaded (does not compete with first paint).
  if (document.readyState === 'complete') wireServiceWorkerUpdates();
  else window.addEventListener('load', wireServiceWorkerUpdates, { once: true });
})();
