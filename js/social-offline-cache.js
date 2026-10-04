/* Necpra social offline cache — network first, durable local fallback. */
(function () {
  'use strict';
  if (window.__NECPRA_SOCIAL_OFFLINE_CACHE__) return;
  window.__NECPRA_SOCIAL_OFFLINE_CACHE__ = true;

  var DB_NAME = 'NecpraSocialOfflineV2';
  var STORE = 'responses';
  var MAX_AGE = 30 * 24 * 60 * 60 * 1000;
  var LS_PREFIX = 'necpra:offline-social:v2:';

  function accountId() {
    var candidates = [];
    try {
      var a = JSON.parse(localStorage.getItem('kynecta_auth') || 'null');
      var u = a && a.user;
      if (u) candidates.push(u.id, u.userId, u.uid, u._id);
    } catch (_) {}
    try {
      var u2 = window.currentUser || window.__kynUser;
      if (u2 && typeof u2 === 'object') candidates.push(u2.id, u2.userId, u2.uid, u2._id);
    } catch (_) {}
    try { candidates.push(localStorage.getItem('userId'), localStorage.getItem('currentUserId')); } catch (_) {}
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] !== null && candidates[i] !== undefined && String(candidates[i]).trim()) {
        return String(candidates[i]);
      }
    }
    return '';
  }

  function relevant(url) {
    try {
      var p = new URL(url, location.href).pathname.toLowerCase();
      return /\/(?:friends|friend-discovery|groups?|group-admin|smart-groups|chats|group-messages|status|user-status)(?:\/|$)/.test(p);
    } catch (_) { return false; }
  }

  function cacheKey(url) { return accountId() + '|' + url; }
  function lsKey(url) {
    var owner = accountId() || 'unknown';
    var raw = owner + '|' + url;
    return LS_PREFIX + encodeURIComponent(raw).slice(0, 180);
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { try { db.close(); } catch (_) {} };
        resolve(db);
      };
      req.onerror = function () { reject(req.error || new Error('Cache open failed')); };
    });
  }

  function readLocal(url) {
    try {
      var row = JSON.parse(localStorage.getItem(lsKey(url)) || 'null');
      if (!row || Date.now() - Number(row.savedAt || 0) > MAX_AGE) return null;
      return row;
    } catch (_) { return null; }
  }

  function writeLocal(url, data) {
    try {
      localStorage.setItem(lsKey(url), JSON.stringify({
        savedAt: Date.now(),
        data: data,
        headers: { 'Content-Type': 'application/json' }
      }));
    } catch (_) {}
  }

  async function read(url) {
    try {
      var db = await openDb();
      var row = await new Promise(function (resolve) {
        var req = db.transaction([STORE], 'readonly').objectStore(STORE).get(cacheKey(url));
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      });
      if (row && Date.now() - Number(row.savedAt || 0) <= MAX_AGE) return row;
    } catch (_) {}
    return readLocal(url);
  }

  async function write(url, data) {
    var row = {
      key: cacheKey(url),
      url: url,
      savedAt: Date.now(),
      data: data,
      headers: { 'Content-Type': 'application/json' }
    };
    try {
      var db = await openDb();
      await new Promise(function (resolve) {
        var tx = db.transaction([STORE], 'readwrite');
        tx.objectStore(STORE).put(row);
        tx.oncomplete = tx.onerror = tx.onabort = function () { resolve(); };
      });
    } catch (_) {}
    writeLocal(url, data);
  }

  async function responseFromCache(url) {
    var row = await read(url);
    if (!row || row.data === undefined) return null;
    return new Response(JSON.stringify(row.data), {
      status: 200,
      headers: row.headers || { 'Content-Type': 'application/json', 'X-Served-From-Cache': '1' }
    });
  }

  var nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'GET' || !relevant(url)) return nativeFetch(input, init);

    try {
      var response = await nativeFetch(input, init);
      if (response && response.ok) {
        var clone = response.clone();
        try {
          var data = await clone.json();
          await write(url, data);
        } catch (_) {}
      }
      return response;
    } catch (networkError) {
      var cached = await responseFromCache(url);
      if (cached) return cached;
      throw networkError;
    }
  };

  window.NecpraSocialOfflineCache = {
    get: responseFromCache,
    clearAccount: async function () {
      var owner = accountId();
      try {
        var db = await openDb();
        await new Promise(function (resolve) {
          var tx = db.transaction([STORE], 'readwrite');
          var req = tx.objectStore(STORE).openCursor();
          req.onsuccess = function (e) {
            var c = e.target.result;
            if (!c) return resolve();
            if (String(c.key).indexOf(owner + '|') === 0) c.delete();
            c.continue();
          };
          req.onerror = function () { resolve(); };
        });
      } catch (_) {}
    }
  };
})();