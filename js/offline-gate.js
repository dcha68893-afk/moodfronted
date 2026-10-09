/* offline-gate.js — when the device is offline, NO request is sent to the backend (or any remote host).
 *
 * Why: with no connection, pollers, retries and module boot code kept calling fetch()/XHR. Every call went to the network
 * stack, failed, and printed "Failed to load resource / net::ERR_INTERNET_DISCONNECTED / TypeError: Failed to fetch" in the
 * console (and burned battery on retry loops).
 *
 * What it does (loaded BEFORE offline-first.js on every page, so cached GET answers are still served first by the layer above):
 *  - fetch(): offline + remote target  -> rejects immediately with an AbortError (callers already treat that as "ignore"),
 *             nothing touches the network.
 *  - XMLHttpRequest.send(): offline + remote target -> fires 'error'/'loadend' without sending.
 *  - navigator.sendBeacon(): returns false when offline.
 *  - Only blocks on navigator.onLine === false (the reliable direction). Same-origin static files are never blocked, so a
 *    service-worker-cached app shell still loads.
 *  - Mutations are not lost: the existing offline queue (app.offline.queue.js) owns queueing/replay and runs after 'online'.
 * Exposes window.__OfflineGate.{isOffline(), blockedCount()}.
 */
(function () {
  'use strict';
  if (window.__OfflineGate) return;

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var blocked = 0;

  function isOffline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }
  function isRemote(url) {
    try {
      var u = new URL(url, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;      // data:, blob:, file:, capacitor:
      return u.origin !== location.origin || /^\/(api|socket\.io)(\/|$)/.test(u.pathname);
    } catch (_) { return false; }
  }
  function urlOf(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;      // Request
    return String(input);
  }
  function offlineError() {
    var e;
    try { e = new DOMException('Offline: request not sent', 'AbortError'); }
    catch (_) { e = new Error('Offline: request not sent'); e.name = 'AbortError'; }
    e.offlineBlocked = true;
    return e;
  }

  if (nativeFetch) {
    window.fetch = function (input, init) {
      if (isOffline() && isRemote(urlOf(input))) { blocked++; return Promise.reject(offlineError()); }
      return nativeFetch(input, init);
    };
  }

  try {
    var X = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (X && !X.__offlineGatePatched) {
      var open = X.open, send = X.send;
      X.open = function (method, url) { try { this.__ogUrl = String(url); } catch (_) {} return open.apply(this, arguments); };
      X.send = function () {
        if (isOffline() && this.__ogUrl && isRemote(this.__ogUrl)) {
          blocked++;
          var xhr = this;
          setTimeout(function () {
            try { xhr.dispatchEvent(new Event('error')); } catch (_) {}
            try { xhr.dispatchEvent(new Event('loadend')); } catch (_) {}
          }, 0);
          return;
        }
        return send.apply(this, arguments);
      };
      X.__offlineGatePatched = true;
    }
  } catch (_) {}

  try {
    if (navigator.sendBeacon) {
      var beacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) { return (isOffline() && isRemote(String(url))) ? false : beacon(url, data); };
    }
  } catch (_) {}

  window.__OfflineGate = { isOffline: isOffline, blockedCount: function () { return blocked; } };
})();
