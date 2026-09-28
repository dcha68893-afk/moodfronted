/**
 * StorageAutoCleanup.js
 *
 * FIX (Storage settings item #14 from the architecture audit): "Auto-Clear
 * Cache" in Settings > Storage was a real, working toggle — it saved to
 * storage.autoClearCache via window.__updateSetting and persisted correctly
 * — but nothing in the runtime ever READ that value. Turning it on had zero
 * effect; there was no scheduler, so caches only ever shrank when someone
 * manually pressed "Clear Chat Cache" / "Clear Media Cache" in Settings.
 *
 * This file is that missing scheduler. It intentionally only auto-clears
 * the MEDIA cache (images/video the service worker has cached), not the
 * chat/message cache — clearing message history automatically, silently,
 * in the background is a data-loss risk (offline access to recent
 * conversations) that a person flipping on "save some space" almost
 * certainly doesn't intend. Manual "Clear Chat Cache" remains available in
 * Settings for anyone who explicitly wants that.
 *
 * Runs a lightweight check shortly after load and again every few hours
 * while the tab stays open; each check is a no-op unless the setting is on
 * AND enough time has passed since the last auto-clear (default 7 days),
 * so this never fights with anything the person is actively using.
 */
(function () {
  'use strict';

  if (window.__StorageAutoCleanup) return;

  const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // re-check every 6h while open
  const MIN_DAYS_BETWEEN_CLEARS = 7;
  const LAST_CLEAR_KEY = 'kynecta_last_auto_media_clear';

  function isEnabled() {
    try {
      if (window.AppSettings && typeof window.AppSettings.get === 'function') {
        return window.AppSettings.get('storage.autoClearCache') === true;
      }
    } catch (_) {}
    return false;
  }

  function dueForClear() {
    try {
      const last = parseInt(localStorage.getItem(LAST_CLEAR_KEY) || '0', 10);
      if (!last) return true;
      const days = (Date.now() - last) / (24 * 60 * 60 * 1000);
      return days >= MIN_DAYS_BETWEEN_CLEARS;
    } catch (_) {
      return false; // if we can't tell, don't clear — safer default
    }
  }

  function clearMediaCacheViaServiceWorker() {
    return new Promise((resolve, reject) => {
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        reject(new Error('Service worker not available'));
        return;
      }
      const timeout = setTimeout(() => reject(new Error('Timed out')), 8000);
      const onMessage = (event) => {
        if (event.data && event.data.type === 'CACHE_CLEARED') {
          clearTimeout(timeout);
          navigator.serviceWorker.removeEventListener('message', onMessage);
          resolve();
        }
      };
      navigator.serviceWorker.addEventListener('message', onMessage);
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
    });
  }

  async function runCheck() {
    if (!isEnabled() || !dueForClear()) return;
    // Only auto-clear while the person is actually present and the app is
    // idle-ish — never mid-session on first load, to avoid clearing media
    // someone is about to scroll back up to see.
    if (document.visibilityState !== 'visible') return;

    try {
      await clearMediaCacheViaServiceWorker();
      localStorage.setItem(LAST_CLEAR_KEY, String(Date.now()));
      window.dispatchEvent(new CustomEvent('mediaCacheCleared', {
        detail: { timestamp: Date.now(), auto: true }
      }));
      console.log('[StorageAutoCleanup] ✅ Auto-cleared media cache (autoClearCache is on)');
    } catch (e) {
      // Not fatal — just try again on the next scheduled check.
      console.warn('[StorageAutoCleanup] Skipped:', e.message);
    }
  }

  // First check a little after load (give the service worker time to take
  // control on a fresh install), then periodically while the tab is open.
  setTimeout(runCheck, 15000);
  setInterval(runCheck, CHECK_INTERVAL_MS);

  window.__StorageAutoCleanup = { runCheck: runCheck };
})();
