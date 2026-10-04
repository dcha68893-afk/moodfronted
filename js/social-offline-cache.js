/* Necpra social offline cache - thin shim.
 * All caching (account detection, key normalisation, 503 handling, pre-warm) now lives in
 * js/offline-first.js. This file used to wrap window.fetch a second time and only reacted to THROWN
 * errors, so it never saw the service worker's fake 503 and keyed entries differently. It now only
 * keeps the NecpraSocialOfflineCache API (used by native-init.js) and delegates to offline-first.
 */
(function () {
  'use strict';
  if (window.__NECPRA_SOCIAL_OFFLINE_CACHE__) return;
  window.__NECPRA_SOCIAL_OFFLINE_CACHE__ = true;

  function core() { return window.__OfflineFirst || null; }

  window.NecpraSocialOfflineCache = {
    get: function (url) { var c = core(); return c && c.get ? c.get(url) : Promise.resolve(null); },
    put: function (url, data) { var c = core(); return c && c.put ? c.put(url, data) : Promise.resolve(false); },
    clearAccount: function () { var c = core(); return c && c.clear ? c.clear() : Promise.resolve(); }
  };
})();
