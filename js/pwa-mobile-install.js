// Necpa mobile PWA install helper.
// Uses the native beforeinstallprompt event when the browser provides it,
// and gives accurate manual-install guidance on iOS/Android when it does not.
(function () {
  'use strict';

  if (window.__NECPA_MOBILE_PWA_INSTALL__) return;
  window.__NECPA_MOBILE_PWA_INSTALL__ = true;

  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);
  var isMobile = isIOS || isAndroid || /mobile/i.test(ua);
  var deferred = null;
  var banner = null;

  function installed() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.indexOf('android-app://') === 0;
    } catch (_) { return false; }
  }

  if (!isMobile || installed()) return;

  function dismissedRecently() {
    try {
      var t = Number(localStorage.getItem('necpa_pwa_mobile_dismissed') || 0);
      return t && Date.now() - t < 24 * 60 * 60 * 1000;
    } catch (_) { return false; }
  }

  function rememberDismiss() {
    try { localStorage.setItem('necpa_pwa_mobile_dismissed', String(Date.now())); } catch (_) {}
  }

  function remove() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  function showNativeReady() {
    if (!banner) return;
    var title = banner.querySelector('[data-pwa-title]');
    var text = banner.querySelector('[data-pwa-text]');
    var action = banner.querySelector('[data-pwa-action]');
    if (title) title.textContent = 'Install Necpa';
    if (text) text.textContent = 'Install Necpa on your phone for faster access and offline support.';
    if (action) {
      action.textContent = 'Install';
      action.disabled = false;
      action.onclick = install;
    }
  }

  function showManual(kind) {
    if (!banner) return;
    var title = banner.querySelector('[data-pwa-title]');
    var text = banner.querySelector('[data-pwa-text]');
    var action = banner.querySelector('[data-pwa-action]');
    if (title) title.textContent = 'Install Necpa';
    if (kind === 'ios') {
      if (text) text.textContent = 'In Safari, tap Share, then Add to Home Screen.';
    } else {
      if (text) text.textContent = 'In Chrome, tap ⋮ and choose Install app or Add to Home screen.';
    }
    if (action) {
      action.textContent = 'Got it';
      action.disabled = false;
      action.onclick = function () { rememberDismiss(); remove(); };
    }
  }

  function createBanner() {
    if (banner || dismissedRecently() || installed()) return;
    banner = document.createElement('div');
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Install Necpa');
    banner.style.cssText = [
      'position:fixed','left:10px','right:10px','bottom:calc(10px + env(safe-area-inset-bottom))',
      'z-index:2147483646','background:#fff','color:#172033','border:1px solid #dfe4ee',
      'border-radius:16px','box-shadow:0 10px 35px rgba(0,0,0,.22)','padding:13px 14px',
      'display:flex','align-items:center','gap:11px','font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'
    ].join(';');
    banner.innerHTML =
      '<div style="width:42px;height:42px;border-radius:11px;overflow:hidden;flex:0 0 42px;background:#eef2ff;display:grid;place-items:center">' +
        '<img src="/icons/necpa-192.png" alt="Necpa" style="width:42px;height:42px;object-fit:cover" onerror="this.style.display=\'none\'">' +
      '</div>' +
      '<div style="min-width:0;flex:1">' +
        '<div data-pwa-title style="font-weight:750;font-size:14px;line-height:1.2">Install Necpa</div>' +
        '<div data-pwa-text style="font-size:12px;line-height:1.35;margin-top:3px;color:#667085">Preparing installation…</div>' +
      '</div>' +
      '<button type="button" data-pwa-action style="border:0;border-radius:10px;padding:9px 13px;background:#1a73e8;color:#fff;font-weight:700;font-size:12px;white-space:nowrap">Install</button>' +
      '<button type="button" data-pwa-close aria-label="Close" style="border:0;background:transparent;color:#667085;font-size:20px;padding:4px;line-height:1">×</button>';
    document.body.appendChild(banner);
    banner.querySelector('[data-pwa-close]').onclick = function () { rememberDismiss(); remove(); };
  }

  async function install() {
    if (!deferred) return;
    var promptEvent = deferred;
    deferred = null;
    try {
      promptEvent.prompt();
      var choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted') {
        try { localStorage.setItem('pwa_installed', '1'); } catch (_) {}
        remove();
      }
    } catch (_) {}
  }

  function start() {
    if (installed()) return;
    createBanner();
    if (!banner) return;

    if (isIOS) {
      showManual('ios');
      return;
    }

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferred = event;
      createBanner();
      showNativeReady();
    });

    // Android browsers can delay or suppress beforeinstallprompt. Never tell
    // the user that installation is unsupported merely because it did not
    // arrive within a few seconds; provide the browser's manual path instead.
    setTimeout(function () {
      if (!deferred && !installed()) showManual('android');
    }, 5000);
  }

  window.addEventListener('appinstalled', function () {
    deferred = null;
    try { localStorage.setItem('pwa_installed', '1'); } catch (_) {}
    remove();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
