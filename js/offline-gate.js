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

  /* NET-HEALTH (QUIET-WHEN-BACKEND-UNREACHABLE): the offline gate only reacts to navigator.onLine === false, but a phone
   * on Wi-Fi / mobile data with no working internet (or a dead DNS) still reports "online". Every poll, retry and
   * socket.io handshake then hit the network, failed with net::ERR_NAME_NOT_RESOLVED and printed a red console line each time.
   * This remembers which backend origin just failed and, for GET/HEAD only, fails further calls locally (no network
   * request, so no console noise) with exponential back-off 10s -> 20s -> 40s -> 60s. After the back-off ONE request is
   * let through as a probe; any real response clears the state. 'online' / tab-visible re-opens the gate right away.
   * Shared across iframes through localStorage so each frame does not probe on its own. Writes (POST/PUT/DELETE) are
   * never blocked here, so the existing offline queues keep working. */
  if (!window.__NetHealth) {
      (function () {
          var KEY = 'necpra:netdown', MIN = 10000, MAX = 60000, memo = null, memoAt = 0, probing = {};
          function rewrite(u) { try { return typeof window.__rewriteApiUrl === 'function' ? window.__rewriteApiUrl(u) : u; } catch (_) { return u; } }
          function urlOf(i) { if (typeof i === 'string') return i; if (i && typeof i.url === 'string') return i.url; return String(i); }
          function parse(u) { try { var x = new URL(rewrite(String(u)), location.href); return (x.protocol === 'http:' || x.protocol === 'https:') ? x : null; } catch (_) { return null; } }
          function isRemote(u) { var x = parse(u); return !!x && (x.origin !== location.origin || /^\/(api|socket\.io)(\/|$)/.test(x.pathname)); }
          function read() { var n = Date.now(); if (memo && n - memoAt < 1000) return memo; try { memo = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { memo = {}; } memoAt = n; return memo; }
          function write(s) { memo = s; memoAt = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
          function shouldBlock(u, method) {
              method = String(method || 'GET').toUpperCase();
              if (method !== 'GET' && method !== 'HEAD') return false;
              var x = parse(u); if (!x || !isRemote(u)) return false;
              var s = read()[x.origin]; if (!s) return false;
              var n = Date.now();
              if (n < s.until) return true;
              if (probing[x.origin] && n - probing[x.origin] < 10000) return true;   // one probe at a time
              probing[x.origin] = n; return false;
          }
          function fail(u) {
              var x = parse(u); if (!x || !isRemote(u)) return;
              var all = read(), cur = all[x.origin], back = cur ? Math.min((cur.backoff || MIN) * 2, MAX) : MIN;
              all[x.origin] = { until: Date.now() + back, backoff: back }; write(all); probing[x.origin] = 0;
          }
          function ok(u) {
              var x = parse(u); if (!x) return;
              var all = read(); if (all[x.origin]) { delete all[x.origin]; write(all); } probing[x.origin] = 0;
          }
          function reset() { write({}); probing = {}; }
          // Settle an XHR locally as a network error, the way a real failure would (engine.io listens to readystatechange).
          function failXhr(xhr) {
              setTimeout(function () {
                  try { Object.defineProperty(xhr, 'readyState', { configurable: true, value: 4 }); } catch (_) {}
                  try { Object.defineProperty(xhr, 'status', { configurable: true, value: 0 }); } catch (_) {}
                  try { if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange(new Event('readystatechange')); } catch (_) {}
                  try { xhr.dispatchEvent(new Event('error')); } catch (_) {}
                  try { xhr.dispatchEvent(new Event('loadend')); } catch (_) {}
              }, 0);
          }
          window.addEventListener('online', reset);
          document.addEventListener('visibilitychange', function () {
              if (document.visibilityState !== 'visible') return;
              var all = read(), changed = false;
              Object.keys(all).forEach(function (k) { if (all[k].until > Date.now()) { all[k].until = Date.now(); changed = true; } });
              if (changed) write(all);
          });
          window.addEventListener('storage', function (e) { if (e.key === KEY) memo = null; });
          window.__NetHealth = { shouldBlock: shouldBlock, fail: fail, ok: ok, reset: reset, failXhr: failXhr, urlOf: urlOf, isRemote: isRemote };
          try {
              var X = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
              if (X && !X.__netHealthPatched) {
                  var _open = X.open, _send = X.send;
                  X.open = function (m, u) { try { this.__nhUrl = String(u); this.__nhMethod = String(m || 'GET'); } catch (_) {} return _open.apply(this, arguments); };
                  X.send = function () {
                      var url = this.__nhUrl, self = this;
                      if (url && isRemote(url)) {
                          if (shouldBlock(url, this.__nhMethod)) { failXhr(this); return; }
                          var aborted = false;
                          this.addEventListener('abort', function () { aborted = true; });
                          this.addEventListener('loadend', function () { if (aborted) return; if (self.status === 0) fail(url); else ok(url); });
                      }
                      return _send.apply(this, arguments);
                  };
                  X.__netHealthPatched = true;
              }
          } catch (_) {}
      })();
  }

  /* CACHED-ELSEWHERE-404: older builds wrote the literal string "__CACHED_ELSEWHERE__" into cached settings in place of big
   * photo data: URLs; it was then read back as an image address and requested from the server (404, once per image).
   * Clean any stored copy once per session and never let an <img> request that placeholder. */
  try {
      if (!sessionStorage.getItem('necpra:ce-clean')) {
          sessionStorage.setItem('necpra:ce-clean', '1');
          for (var _i = 0; _i < localStorage.length; _i++) {
              var _k = localStorage.key(_i), _v = localStorage.getItem(_k);
              if (_v && _v.indexOf('__CACHED_ELSEWHERE__') !== -1) localStorage.setItem(_k, _v.split('__CACHED_ELSEWHERE__').join(''));
          }
      }
      var _d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (_d && _d.set && !HTMLImageElement.prototype.__ceGuard) {
          Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, enumerable: _d.enumerable, get: _d.get,
              set: function (v) { _d.set.call(this, (typeof v === 'string' && v.indexOf('__CACHED_ELSEWHERE__') !== -1) ? '' : v); } });
          HTMLImageElement.prototype.__ceGuard = true;
      }
  } catch (_) {}

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
      var nh = window.__NetHealth, u = urlOf(input), m = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (nh && nh.shouldBlock(u, m)) { blocked++; return Promise.reject(offlineError()); }
      return nativeFetch(input, init).then(function (r) { try { if (nh) nh.ok(u); } catch (_) {} return r; },
        function (e) { try { if (nh && !(e && e.name === 'AbortError')) nh.fail(u); } catch (_) {} throw e; });
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
          if (window.__NetHealth) { window.__NetHealth.failXhr(this); return; }
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
