/* offline-first.js
 * One shared layer for EVERY module (groups, friends, status, settings, market, calls, chat shell).
 *
 * What it does
 *  - Wraps window.fetch for same-API GET requests only.
 *  - Online and healthy: the network answer is used and saved (IndexedDB, per account).
 *  - Offline, network error, timeout, or a 502/503/504 (server cold start): the last saved
 *    answer is returned as a normal 200 response, so every module renders its data exactly as
 *    it does online, with no error text and no offline badge.
 *  - When the device comes back online, saved screens are refreshed silently in the background.
 *  - Never touches mutations (POST/PUT/PATCH/DELETE) - the existing offline queue owns those.
 *  - Never caches auth / token / encryption-key / payment / admin endpoints.
 *  - Account isolation: the store is wiped when a different account writes to it.
 */
(function () {
  'use strict';
  if (window.__OfflineFirst) return;

  var DB_NAME = 'moodchat_offline_first_v1';
  var STORE = 'responses';
  var MAX_ENTRIES = 400;
  var MAX_BYTES = 1500000;           // skip single responses above ~1.5 MB
  var SLOW_MS = 6000;                // when a saved copy exists, do not make the user wait longer than this
  var DENY = /\/(auth|login|logout|register|signup|token|tokens|refresh|2fa|two-?factor|two-?step|encryption|keys|prekeys|devices|payments?|invoices?|admin|push|turn|ice|health|upload|uploads|otp|verify|password|sessions?)(\/|\?|$)/i;

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!nativeFetch) return;

  /* ---------- who is signed in ---------- */
  function me() {
    try {
      var raw = localStorage.getItem('kynecta_auth');
      var a = raw ? JSON.parse(raw) : null;
      var u = a && a.user;
      var id = u && (u.id != null ? u.id : (u.userId != null ? u.userId : (u.uid != null ? u.uid : u._id)));
      return id == null ? '' : String(id);
    } catch (_) { return ''; }
  }

  /* ---------- IndexedDB (falls back to memory if unavailable) ---------- */
  var mem = Object.create(null);
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        if (!window.indexedDB) return resolve(null);
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var d = req.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'k' });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (_) { resolve(null); }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      if (!d) return fn(null);
      return new Promise(function (resolve) {
        try {
          var t = d.transaction(STORE, mode);
          var s = t.objectStore(STORE);
          var out = fn(s);
          t.oncomplete = function () { resolve(out && out.__v !== undefined ? out.__v : out); };
          t.onerror = t.onabort = function () { resolve(null); };
        } catch (_) { resolve(null); }
      });
    });
  }
  function getEntry(k) {
    return db().then(function (d) {
      if (!d) return mem[k] || null;
      return new Promise(function (resolve) {
        try {
          var r = d.transaction(STORE, 'readonly').objectStore(STORE).get(k);
          r.onsuccess = function () { resolve(r.result || null); };
          r.onerror = function () { resolve(null); };
        } catch (_) { resolve(null); }
      });
    });
  }
  function putEntry(entry) {
    return db().then(function (d) {
      if (!d) { mem[entry.k] = entry; return; }
      return tx('readwrite', function (s) { s.put(entry); });
    });
  }
  function allEntries() {
    return db().then(function (d) {
      if (!d) return Object.keys(mem).map(function (k) { return mem[k]; });
      return new Promise(function (resolve) {
        try {
          var r = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
          r.onsuccess = function () { resolve(r.result || []); };
          r.onerror = function () { resolve([]); };
        } catch (_) { resolve([]); }
      });
    });
  }
  function clearAll() {
    mem = Object.create(null);
    return db().then(function (d) {
      if (!d) return;
      return tx('readwrite', function (s) { s.clear(); });
    });
  }
  function trim() {
    allEntries().then(function (list) {
      if (list.length <= MAX_ENTRIES) return;
      list.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
      var drop = list.slice(0, list.length - MAX_ENTRIES + 40);
      db().then(function (d) {
        if (!d) { drop.forEach(function (e) { delete mem[e.k]; }); return; }
        tx('readwrite', function (s) { drop.forEach(function (e) { s.delete(e.k); }); });
      });
    });
  }

  /* ---------- account isolation ---------- */
  var ownerChecked = '';
  function ensureOwner(owner) {
    if (ownerChecked === owner) return Promise.resolve();
    return getEntry('__owner__').then(function (e) {
      if (e && e.owner !== owner) return clearAll().then(function () { return putEntry({ k: '__owner__', owner: owner, t: Date.now() }); });
      if (!e) return putEntry({ k: '__owner__', owner: owner, t: Date.now() });
    }).then(function () { ownerChecked = owner; });
  }

  /* ---------- request classification ---------- */
  function apiHosts() {
    var hosts = [];
    try { if (window.__getApiOrigin) hosts.push(new URL(window.__getApiOrigin(), location.href).origin); } catch (_) {}
    try { if (window.API_BASE_URL) hosts.push(new URL(window.API_BASE_URL, location.href).origin); } catch (_) {}
    try { hosts.push(location.origin); } catch (_) {}
    return hosts;
  }
  function parse(input, init) {
    var url = '', method = 'GET';
    try {
      if (typeof input === 'string') url = input;
      else if (input && typeof input.url === 'string') { url = input.url; method = input.method || 'GET'; }
      else if (input && input.href) url = input.href;
      if (init && init.method) method = init.method;
      var u = new URL(url, location.href);
      return { href: u.href, path: u.pathname, origin: u.origin, method: String(method).toUpperCase() };
    } catch (_) { return null; }
  }
  function eligible(p, init) {
    if (!p || p.method !== 'GET') return false;
    if (!/\/api(\/|$)/i.test(p.path)) return false;
    if (apiHosts().indexOf(p.origin) === -1) return false;
    if (DENY.test(p.path)) return false;
    if (init && init.cache === 'no-store' && init.__offlineFirstBypass) return false;
    return true;
  }
  function cacheKey(owner, p) { return owner + '|' + p.href; }

  /* ---------- responses ---------- */
  function fromCache(entry) {
    return new Response(entry.body, {
      status: 200,
      headers: { 'Content-Type': entry.type || 'application/json', 'X-Served-From-Cache': '1' }
    });
  }
  function save(owner, p, res) {
    try {
      if (!res.ok || res.status !== 200) return;
      var type = res.headers.get('content-type') || '';
      if (!/json/i.test(type)) return;
      res.clone().text().then(function (body) {
        if (!body || body.length > MAX_BYTES) return;
        // Only keep real payloads: never persist an error envelope as "good data".
        try { var j = JSON.parse(body); if (j && (j.success === false || j.offline === true)) return; } catch (_) { return; }
        ensureOwner(owner).then(function () {
          return putEntry({ k: cacheKey(owner, p), body: body, type: type, t: Date.now(), path: p.path });
        }).then(trim);
      }).catch(function () {});
    } catch (_) {}
  }

  function isBadStatus(s) { return s === 502 || s === 503 || s === 504 || s === 0; }

  window.fetch = function (input, init) {
    var p = parse(input, init);
    if (!eligible(p, init)) return nativeFetch(input, init);
    var owner = me();
    if (!owner) return nativeFetch(input, init);
    var key = cacheKey(owner, p);

    // Offline: answer straight from the saved copy, no network attempt, no delay.
    if (navigator.onLine === false) {
      return getEntry(key).then(function (e) {
        if (e && e.body) return fromCache(e);
        return nativeFetch(input, init);
      });
    }

    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = null;
      var cached = null;
      getEntry(key).then(function (e) { cached = e; }).catch(function () {});

      function done(fn, v) { if (settled) return; settled = true; if (timer) clearTimeout(timer); fn(v); }
      function fallback(err, res) {
        getEntry(key).then(function (e) {
          if (e && e.body) return done(resolve, fromCache(e));
          if (res) return done(resolve, res);
          done(reject, err);
        });
      }

      // Slow network + a saved copy exists: show the saved copy, let the network finish in the background.
      timer = setTimeout(function () {
        if (settled) return;
        getEntry(key).then(function (e) { if (e && e.body && !settled) done(resolve, fromCache(e)); });
      }, SLOW_MS);

      nativeFetch(input, init).then(function (res) {
        if (res && res.ok) {
          save(owner, p, res);
          if (settled) { try { window.dispatchEvent(new CustomEvent('offlinefirst:refreshed', { detail: { path: p.path } })); } catch (_) {} return; }
          return done(resolve, res);
        }
        if (res && isBadStatus(res.status)) return fallback(null, res);
        if (!settled) done(resolve, res);
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return done(reject, err);
        fallback(err, null);
      });
    });
  };

  /* ---------- silent background resync on reconnect ---------- */
  var syncing = false;
  function resync() {
    if (syncing) return;
    syncing = true;
    try { window.dispatchEvent(new CustomEvent('moodchat:back-online')); } catch (_) {}
    var calls = [
      function () { return window.__GROUP_LOAD_GROUPS && window.__GROUP_LOAD_GROUPS(); },
      function () { return window.__NecpaProfessionalStatus && window.__NecpaProfessionalStatus.loadFeed && window.__NecpaProfessionalStatus.loadFeed(); },
      function () { try { window.dispatchEvent(new Event('FRIENDS_LIST_UPDATE')); } catch (_) {} },
      function () { return window.__MARKET_RELOAD && window.__MARKET_RELOAD(); }
    ];
    calls.forEach(function (c) { try { var r = c(); if (r && r.catch) r.catch(function () {}); } catch (_) {} });
    setTimeout(function () { syncing = false; }, 4000);
  }
  window.addEventListener('online', function () { setTimeout(resync, 600); });

  window.__OfflineFirst = {
    clear: clearAll,
    resync: resync,
    has: function (url) {
      var p = parse(url); var o = me();
      return p && o ? getEntry(cacheKey(o, p)).then(function (e) { return !!(e && e.body); }) : Promise.resolve(false);
    }
  };
})();
