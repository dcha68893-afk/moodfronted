/**
 * Necpra PWA manager
 * Single owner for beforeinstallprompt/appinstalled and service-worker updates.
 */
(function () {
  'use strict';
  if (window.__pwaManagerLoaded) return;
  window.__pwaManagerLoaded = true;

  // FIX (DUPLICATE-INSTALL-BANNER-ON-MOBILE): pwa-mobile-install.js now owns
  // the install prompt on phones/tablets (it also covers iOS Safari, which
  // never fires beforeinstallprompt at all, so it can't rely on the same
  // event this file uses). Without this check, a mobile browser that DOES
  // fire beforeinstallprompt (most Android Chrome) would get this file's
  // full-width banner AND the mobile one stacked on top of each other.
  var isMobileDevice = (function () {
    var ua = navigator.userAgent || '';
    return /iphone|ipad|ipod|android/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      /mobile/i.test(ua);
  })();

  function isStandalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.indexOf('android-app://') === 0;
    } catch (_) { return false; }
  }

  function inject(id, html) {
    if (document.getElementById(id) || !document.body) return;
    const el = document.createElement('div');
    el.id = id;
    el.innerHTML = html;
    document.body.appendChild(el);
  }

  let deferredPrompt = null;
  let hideTimer = null;

  // A local flag is only a UX hint; it must never override the browser's live
  // standalone state or prevent a fresh beforeinstallprompt event from being used.
  function appIsInstalled() {
    return isStandalone();
  }

  function removeInstallBanner() {
    clearTimeout(hideTimer);
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.remove();
  }

  // FIX (INSTALL-PROMPT-BOTTOM-TO-CENTER): was a bottom-fixed strip; matches
  // the same change made to pwa-mobile-install.js's banner so desktop and
  // mobile behave the same way.
  function showInstallBanner() {
    if (isMobileDevice) return; // pwa-mobile-install.js owns the mobile banner
    if (!deferredPrompt || appIsInstalled()) return;
    if (document.getElementById('pwaInstallBanner')) return;

    inject('pwaInstallBanner',
      '<div style="position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
      '<div id="pwaInstallInner" style="width:min(380px,100%);background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:22px 20px;text-align:center;position:relative">' +
      '<button type="button" id="pwaInstallClose" aria-label="Dismiss" style="position:absolute;top:8px;right:10px;background:none;border:0;color:#64748b;font-size:22px;line-height:1;padding:6px;cursor:pointer">&times;</button>' +
      '<img src="/icons/necpa-192.png" alt="Necpa" style="width:56px;height:56px;border-radius:14px;object-fit:cover;margin:0 auto 12px;display:block" onerror="this.style.display=\'none\'">' +
      '<div style="font-weight:800;font-size:16px;color:#111">Install Necpra</div>' +
      '<div style="font-size:13px;color:#64748b;margin-top:6px">Install the app for a faster experience.</div>' +
      '<button type="button" id="pwaInstallButton" style="margin-top:16px;width:100%;background:#2563eb;color:#fff;border:0;border-radius:11px;padding:12px 13px;font-weight:700;font-size:14px;cursor:pointer">Install</button>' +
      '</div></div>'
    );

    const installButton = document.getElementById('pwaInstallButton');
    const closeButton = document.getElementById('pwaInstallClose');
    if (installButton) installButton.addEventListener('click', window._pwaDoInstall);
    if (closeButton) closeButton.addEventListener('click', function () {
      removeInstallBanner();
      try { localStorage.setItem('pwa_dismissed_ts', String(Date.now())); } catch (_) {}
    });
    // Tapping the dimmed backdrop dismisses too, same as any other modal.
    const outer = document.getElementById('pwaInstallBanner');
    if (outer) outer.addEventListener('click', function (e) {
      if (e.target === outer) {
        removeInstallBanner();
        try { localStorage.setItem('pwa_dismissed_ts', String(Date.now())); } catch (_) {}
      }
    });
  }

  window._pwaDoInstall = async function () {
    if (!deferredPrompt) return;
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    removeInstallBanner();
    try {
      promptEvent.prompt();
      const result = await promptEvent.userChoice;
      if (result && result.outcome === 'accepted') {
        try { localStorage.setItem('pwa_installed', '1'); } catch (_) {}
      }
    } catch (error) {
      console.warn('[pwa-manager] install prompt failed:', error);
    }
  };

  window._pwaDismissInstall = function () {
    removeInstallBanner();
    try { localStorage.setItem('pwa_dismissed_ts', String(Date.now())); } catch (_) {}
  };

  // This is the ONLY beforeinstallprompt owner in the PWA manager.
  window.addEventListener('beforeinstallprompt', function (event) {
    if (isStandalone()) return;
    event.preventDefault();
    deferredPrompt = event;
    showInstallBanner();
  }, { passive: false });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    removeInstallBanner();
    try {
      localStorage.setItem('pwa_installed', '1');
      localStorage.removeItem('pwa_dismissed_ts');
    } catch (_) {}
    console.log('[pwa-manager] App installed');
  });

  // Service worker registration/update handling remains centralized here.
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  const hadControllerOnLoad = !!navigator.serviceWorker.controller;

  function reloadOnce() {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  }

  function showUpdateBanner() {
    if (document.getElementById('pwaUpdateBanner')) return;
    inject('pwaUpdateBanner',
      '<div style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.2)">' +
      '<div style="flex:1"><strong style="display:block;font-size:13px">Update ready</strong><span style="font-size:11px;opacity:.9">Refresh to get the latest Necpra version.</span></div>' +
      '<button type="button" id="pwaUpdateButton" style="background:#fff;color:#2563eb;border:0;border-radius:8px;padding:8px 15px;font-weight:800;cursor:pointer">Refresh</button>' +
      '<button type="button" id="pwaUpdateClose" style="background:none;color:#fff;border:0;font-size:22px;cursor:pointer">&times;</button></div>'
    );
    const updateButton = document.getElementById('pwaUpdateButton');
    const closeButton = document.getElementById('pwaUpdateClose');
    if (updateButton) updateButton.addEventListener('click', window._pwaApplyUpdate);
    if (closeButton) closeButton.addEventListener('click', function () { const b = document.getElementById('pwaUpdateBanner'); if (b) b.remove(); });
  }

  window._pwaApplyUpdate = function () {
    const banner = document.getElementById('pwaUpdateBanner');
    if (banner) banner.remove();
    sessionStorage.setItem('pwa_update_acknowledged', '1');
    navigator.serviceWorker.getRegistration().then(function (registration) {
      if (registration && registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      else { sessionStorage.removeItem('pwa_update_acknowledged'); reloadOnce(); }
    }).catch(reloadOnce);
    setTimeout(function () {
      if (sessionStorage.getItem('pwa_update_acknowledged')) {
        sessionStorage.removeItem('pwa_update_acknowledged');
        reloadOnce();
      }
    }, 4000);
  };

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!refreshing && sessionStorage.getItem('pwa_update_acknowledged')) {
      sessionStorage.removeItem('pwa_update_acknowledged');
      reloadOnce();
    }
  });

  navigator.serviceWorker.addEventListener('message', function (event) {
    if (!event.data) return;
    if (event.data.type === 'SW_UPDATED') {
      const version = event.data.version || '';
      const last = localStorage.getItem('_sw_last_version') || '';
      localStorage.setItem('_sw_last_version', version);
      if (hadControllerOnLoad && version && version !== last) showUpdateBanner();
    }
  });

  navigator.serviceWorker.register('/service-worker.js').then(function (registration) {
    function activateWaiting(sw) {
      if (sw) sw.postMessage({ type: 'SKIP_WAITING' });
    }
    if (registration.waiting && navigator.serviceWorker.controller) activateWaiting(registration.waiting);
    registration.addEventListener('updatefound', function () {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', function () {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) activateWaiting(worker);
      });
    });
    setInterval(function () { registration.update().catch(function () {}); }, 30 * 60 * 1000);
    if (isStandalone()) setInterval(function () { registration.update().catch(function () {}); }, 5 * 60 * 1000);
  }).catch(function (error) {
    console.warn('[pwa-manager] service worker registration failed:', error);
  });
})();