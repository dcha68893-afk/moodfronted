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

  function showInstallBanner() {
    if (isMobileDevice) return; // pwa-mobile-install.js owns the mobile banner
    if (!deferredPrompt || appIsInstalled()) return;
    if (document.getElementById('pwaInstallBanner')) return;

    inject('pwaInstallBanner',
      '<div id="pwaInstallInner" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#fff;border-top:2px solid #2563eb;box-shadow:0 -6px 28px rgba(0,0,0,.18);padding:12px 14px;display:flex;align-items:center;gap:12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
      '<img src="/icons/necpa-192.png" alt="Necpa" style="width:46px;height:46px;border-radius:12px;object-fit:cover;flex:0 0 auto" onerror="this.style.display=\'none\'">' +
      '<div style="flex:1;min-width:0"><div style="font-weight:800;font-size:14px;color:#111">Install Necpra</div><div style="font-size:12px;color:#64748b;margin-top:2px">Install the app for a faster experience.</div></div>' +
      '<button type="button" id="pwaInstallButton" style="background:#2563eb;color:#fff;border:0;border-radius:10px;padding:10px 17px;font-weight:700;cursor:pointer">Install</button>' +
      '<button type="button" id="pwaInstallClose" aria-label="Dismiss" style="background:none;border:0;color:#64748b;font-size:23px;line-height:1;padding:4px 7px;cursor:pointer">&times;</button>' +
      '</div>'
    );

    const installButton = document.getElementById('pwaInstallButton');
    const closeButton = document.getElementById('pwaInstallClose');
    if (installButton) installButton.addEventListener('click', window._pwaDoInstall);
    if (closeButton) closeButton.addEventListener('click', function () {
      removeInstallBanner();
      try { localStorage.setItem('pwa_dismissed_ts', String(Date.now())); } catch (_) {}
    });

    hideTimer = setTimeout(removeInstallBanner, 15000);
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

  function isCallActive() {
    return !!(window.__callActive || (document.body && (document.body.classList.contains('call-screen-active') || document.body.classList.contains('in-call-active'))));
  }

  function reloadOnce() {
    if (refreshing) return;
    if (isCallActive()) {
      const waitForEnd = function () {
        window.removeEventListener('kyn:call:ended', waitForEnd);
        reloadOnce();
      };
      window.addEventListener('kyn:call:ended', waitForEnd, { once: true });
      setTimeout(function () { if (!isCallActive()) reloadOnce(); }, 5000);
      return;
    }
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