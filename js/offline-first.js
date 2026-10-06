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
 *  - Pre-warms the main social screens while online so a FIRST offline visit already has data.
 */
(function () {
  'use strict';
  if (window.__OfflineFirst) return;

  var DB_NAME = 'moodchat_offline_first_v1';
  var STORE = 'responses';
  var MAX_ENTRIES = 400;
  var MAX_BYTES = 1500000;           // skip single responses above ~1.5 MB
  var SLOW_MS = 1800;                // when a saved copy exists, do not make the user wait longer than this
  var DENY = /\/(auth|login|logout|register|signup|token|tokens|refresh|2fa|two-?factor|two-?step|encryption|keys|prekeys|devices|payments?|invoices?|admin|push|turn|ice|health|upload|uploads|otp|verify|password|sessions?)(\/|\?|$)/i;

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!nativeFetch) return;

  /* ---------- who is signed in ---------- */
  // Web keeps the user inside kynecta_auth. Android deliberately never writes that key (tokens live in
  // the native store), so native-init.js publishes a non-secret id hint (necpa_user / userId /
  // currentUserId). Read every known source; persisted storage wins over in-memory state.
  function idOf(u) {
    if (u == null) return '';
    if (typeof u !== 'object') { var t = String(u).trim(); return /^[A-Za-z0-9_-]{1,128}$/.test(t) ? t : ''; }
    var id = u.id != null ? u.id : (u.userId != null ? u.userId : (u.uid != null ? u.uid : u._id));
    return id == null ? '' : String(id);
  }
  function parseMaybe(raw) { try { return JSON.parse(raw); } catch (_) { return raw; } }
  function me() {
    var i, v, raw, st = [];
    try { st.push(localStorage); } catch (_) {}
    try { st.push(sessionStorage); } catch (_) {}
    for (i = 0; i < st.length; i++) {
      try {
        raw = st[i].getItem('kynecta_auth');
        if (raw) { var a = JSON.parse(raw); v = idOf(a && a.user ? a.user : a); if (v) return v; }
      } catch (_) {}
    }
    var keys = ['necpa_user', 'currentUser', 'user', 'userId', 'currentUserId'];
    for (i = 0; i < st.length; i++) {
      for (var k = 0; k < keys.length; k++) {
        try {
          raw = st[i].getItem(keys[k]);
          if (!raw) continue;
          var p = parseMaybe(raw);
          v = idOf(p && p.user ? p.user : p);
          if (v) return v;
        } catch (_) {}
      }
    }
    try { v = idOf(window.__NECPRA_NATIVE_AUTH_SNAPSHOT__ && window.__NECPRA_NATIVE_AUTH_SNAPSHOT__.user); if (v) return v; } catch (_) {}
    try { v = idOf(window.currentUser || window.__kynUser); if (v) return v; } catch (_) {}
    try { if (window.AuthStorage && typeof window.AuthStorage.getUser === 'function') { v = idOf(window.AuthStorage.getUser()); if (v) return v; } } catch (_) {}
    return '';
  }
  function bearer() {
    try {
      var snap = window.__NECPRA_NATIVE_AUTH_SNAPSHOT__;
      var t = (snap && snap.accessToken) || window.__kynToken || window.__accessToken || window.__userToken ||
        (window.AuthSessionManager && window.AuthSessionManager.getToken && window.AuthSessionManager.getToken()) || '';
      if (!t) { var raw = localStorage.getItem('kynecta_auth'); var a = raw ? JSON.parse(raw) : null; t = a && (a.token || a.accessToken) || ''; }
      if (!t) t = localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
      return t || '';
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
  // Normalise so "/friends?limit=100" and "/friends?limit=100&offset=0" (and param order, and
  // cache-busters) all map to ONE entry. This is what made the native snapshot keys never match.
  var BUSTERS = /^(_|t|ts|_t|cb|nocache|timestamp|r|rand|v)$/i;
  function normHref(p) {
    try {
      var u = new URL(p.href);
      var pairs = [];
      u.searchParams.forEach(function (val, key) {
        if (BUSTERS.test(key)) return;
        if (key === 'offset' && (val === '0' || val === '')) return;
        pairs.push([key, val]);
      });
      pairs.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0); });
      var qs = pairs.map(function (kv) { return encodeURIComponent(kv[0]) + '=' + encodeURIComponent(kv[1]); }).join('&');
      return u.origin + u.pathname.replace(/\/+$/, '') + (qs ? '?' + qs : '');
    } catch (_) { return p.href; }
  }
  function normPath(path) { return String(path || '').replace(/\/+$/, ''); }
  function cacheKey(owner, p) { return owner + '|' + normHref(p); }
  function hasQuery(p) {
    try { var u = new URL(p.href); return u.searchParams.has('q') || u.searchParams.has('query') || u.searchParams.has('search'); } catch (_) { return false; }
  }
  // Exact key first; otherwise the newest saved copy of the same path for this account (so a first
  // offline visit with different paging params still shows data). Searches are never cross-served.
  function getBest(owner, p) {
    return getEntry(cacheKey(owner, p)).then(function (e) {
      if (e && e.body) return e;
      if (hasQuery(p)) return null;
      return allEntries().then(function (list) {
        var want = normPath(p.path), best = null, prefix = owner + '|';
        for (var i = 0; i < list.length; i++) {
          var x = list[i];
          if (!x || !x.body || typeof x.k !== 'string' || x.k.indexOf(prefix) !== 0) continue;
          if (normPath(x.path) !== want) continue;
          if (!best || (x.t || 0) > (best.t || 0)) best = x;
        }
        return best;
      });
    });
  }
  // Public: store a payload under the same normalised key (used by the native snapshot import).
  function putPayload(url, data) {
    var owner = me();
    var p = parse(url, { method: 'GET' });
    if (!owner || !p || data === undefined) return Promise.resolve(false);
    var body = typeof data === 'string' ? data : JSON.stringify(data);
    return ensureOwner(owner).then(function () {
      return putEntry({ k: cacheKey(owner, p), body: body, type: 'application/json', t: Date.now(), path: p.path });
    }).then(function () { return true; });
  }

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
      return getBest(owner, p).then(function (e) {
        if (e && e.body) return fromCache(e);
        return nativeFetch(input, init);
      });
    }

    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = null;
      var cached = null;
      getBest(owner, p).then(function (e) { cached = e; }).catch(function () {});

      function done(fn, v) { if (settled) return; settled = true; if (timer) clearTimeout(timer); fn(v); }
      function fallback(err, res) {
        getBest(owner, p).then(function (e) {
          if (e && e.body) return done(resolve, fromCache(e));
          if (res) return done(resolve, res);
          done(reject, err);
        });
      }

      // Slow network + a saved copy exists: show the saved copy, let the network finish in the background.
      timer = setTimeout(function () {
        if (settled) return;
        getBest(owner, p).then(function (e) { if (e && e.body && !settled) done(resolve, fromCache(e)); });
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

  /* ---------- background pre-warm ----------
   * Nothing used to fetch Discover / Sent / Received / chats / groups ahead of time, so a first offline
   * visit had no data. While online, quietly fetch the main social screens (and recent 1:1 / group
   * history) through the wrapped fetch above so they are saved for offline use.
   * Runs only in the top window, at most once per PREWARM_EVERY, and never while offline. */
  var PREWARM_EVERY = 5 * 60 * 1000;
  var prewarming = false;
  function apiBase() {
    var b = '';
    try { if (typeof window.__getApiBase === 'function') b = window.__getApiBase() || ''; } catch (_) {}
    if (!b) { try { if (window.API_BASE_URL) b = window.API_BASE_URL; } catch (_) {} }
    if (!b) { try { if (typeof window.__getApiOrigin === 'function') b = window.__getApiOrigin() || ''; } catch (_) {} }
    b = String(b || location.origin).replace(/\/+$/, '');
    if (!/\/api$/i.test(b)) b += '/api';
    return b;
  }
  function listFrom(j, names) {
    if (!j) return [];
    if (Array.isArray(j)) return j;
    for (var i = 0; i < names.length; i++) {
      var v = j[names[i]] || (j.data && j.data[names[i]]);
      if (Array.isArray(v)) return v;
    }
    if (j.data && Array.isArray(j.data)) return j.data;
    return [];
  }
  var warmNetFails = 0;
  function warmGet(url, headers) {
    // QUIET-OFFLINE: after 2 network-level failures in a row the connection is dead (not just one slow endpoint), so
    // stop firing the remaining ~20 prewarm requests; they would each be another red console error.
    if (warmNetFails >= 2) return Promise.resolve(null);
    return window.fetch(url, { method: 'GET', headers: headers, credentials: 'include' }).then(function (r) {
      warmNetFails = 0;
      return r && r.ok ? r.json().catch(function () { return null; }) : null;
    }).catch(function () { warmNetFails++; return null; });
  }
  function prewarm(force) {
    if (prewarming || window !== window.top) return;
    if (navigator.onLine === false || !me()) return;
    var token = bearer();
    if (!token) return;
    var last = 0;
    try { last = Number(localStorage.getItem('moodchat_prewarm_at') || 0); } catch (_) {}
    if (!force && Date.now() - last < PREWARM_EVERY) return;
    prewarming = true;
    warmNetFails = 0;
    try { localStorage.setItem('moodchat_prewarm_at', String(Date.now())); } catch (_) {}
    var base = apiBase();
    var headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' };
    var top = [
      '/friends?limit=100',
      '/friends/requests/incoming?limit=100',
      '/friends/requests/outgoing?limit=100',
      '/friend-discovery/suggestions?limit=30',
      '/friend-discovery/browse?limit=30',
      '/chats?limit=100',
      '/groups?limit=100',
      '/status?limit=100'
    ];
    var chain = Promise.resolve();
    var results = {};
    top.forEach(function (path) {
      chain = chain.then(function () { return warmGet(base + path, headers); }).then(function (j) { results[path] = j; });
    });
    chain.then(function () {
      var chats = listFrom(results['/chats?limit=100'], ['chats', 'conversations']).slice(0, 15);
      var groups = listFrom(results['/groups?limit=100'], ['groups']).slice(0, 15);
      var c2 = Promise.resolve();
      chats.forEach(function (c) {
        var id = c && (c.id != null ? c.id : (c.chatId != null ? c.chatId : c._id));
        if (id == null) return;
        c2 = c2.then(function () { return warmGet(base + '/messages/' + encodeURIComponent(id) + '?limit=100', headers); });
      });
      groups.forEach(function (g) {
        var id = g && (g.id != null ? g.id : (g.groupId != null ? g.groupId : g._id));
        if (id == null) return;
        c2 = c2.then(function () { return warmGet(base + '/group-messages/' + encodeURIComponent(id) + '/messages?limit=100', headers); });
      });
      return c2;
    }).catch(function () {}).then(function () { prewarming = false; });
  }
  setTimeout(function () { prewarm(false); }, 4000);
  window.addEventListener('online', function () { setTimeout(function () { prewarm(true); }, 1500); });
  window.addEventListener('necpra:native-auth-ready', function () { setTimeout(function () { prewarm(false); }, 800); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(function () { prewarm(false); }, 1000); });

  function getPayload(url) {
    var owner = me();
    var p = parse(url, { method: 'GET' });
    if (!owner || !p) return Promise.resolve(null);
    return getBest(owner, p).then(function (e) { return e && e.body ? fromCache(e) : null; });
  }

  window.__OfflineFirst = {
    put: putPayload,
    get: getPayload,
    prewarm: prewarm,
    clear: clearAll,
    resync: resync,
    has: function (url) {
      var p = parse(url); var o = me();
      return p && o ? getBest(o, p).then(function (e) { return !!(e && e.body); }) : Promise.resolve(false);
    }
  };
})();
