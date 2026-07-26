/**
 * CacheFoundationLayer.js
 * Phase 1 — Cache Foundation
 *
 * Provides:
 *  - CacheCoordinator: versioned, invalidation-safe cache access
 *  - CacheInvalidationManager: explicit key/collection invalidation
 *  - StorageConsistencyValidator: detects corruption
 *  - MemoryPressureHandler: reduces memory on low-memory signals
 *
 * Works alongside AppCache / KynectaCache — does not replace them.
 *
 * @version 1.0.0
 * @phase 1 — Foundation Stabilization
 */

(function () {
  'use strict';

  if (window.__CacheFoundationLayer) {
    console.log('[CacheFoundation] Already initialized — skipping.');
    return;
  }

  // FIX: window.__getApiBase() can be undefined at the time this module's
  // deletion-sync runs (depending on load order / iframe context), causing
  // `${base}/deletions` to become a bare '/deletions' — a root-relative path
  // that resolves against the CURRENT PAGE's origin (e.g.
  // nexopa.onrender.com/deletions, 404) instead of the backend API
  // (nexopa-fy56.onrender.com/api/deletions). This mirrors
  // NetworkIntelligenceManager.js's safe fallback so deletion sync always
  // targets the backend, with /api included.
  function _resolveApiBase() {
    try {
      const fromHelper = window.__getApiBase?.();
      if (fromHelper) return fromHelper.replace(/\/+$/, '');
    } catch (_) {}
    if (window.__kynAPI && window.__kynAPI.baseUrl) {
      return window.__kynAPI.baseUrl.replace(/\/+$/, '');
    }
    return 'https://nexopa-fy56.onrender.com/api';
  }

  // ─── CacheInvalidationManager ────────────────────────────────────────────────

  class CacheInvalidationManager {
    constructor() {
      this._invalidated = new Set(); // store keys that need re-fetch
      this._ttls = new Map(); // key -> expiresAt
    }

    /**
     * Mark a cache key or collection as invalid.
     */
    invalidate(key) {
      this._invalidated.add(key);
      this._ttls.delete(key);
    }

    /**
     * Set a TTL (ms) for a cache key.
     */
    setTTL(key, ttlMs) {
      this._ttls.set(key, Date.now() + ttlMs);
    }

    /**
     * Returns true if key should be treated as stale.
     */
    isStale(key) {
      if (this._invalidated.has(key)) return true;
      const expiry = this._ttls.get(key);
      if (expiry && Date.now() > expiry) {
        this._invalidated.add(key);
        return true;
      }
      return false;
    }

    /**
     * Mark key as fresh (cleared after a new fetch).
     */
    markFresh(key, ttlMs = 0) {
      this._invalidated.delete(key);
      if (ttlMs > 0) this.setTTL(key, ttlMs);
    }

    getInvalidatedKeys() { return Array.from(this._invalidated); }
    clear() { this._invalidated.clear(); this._ttls.clear(); }
  }

  // ─── StorageConsistencyValidator ─────────────────────────────────────────────

  class StorageConsistencyValidator {
    constructor() {
      this._corruptionLog = [];
    }

    /**
     * Validate a value read from cache.
     * Returns { valid: bool, value: sanitized }
     */
    validate(key, value, expectedType = null) {
      if (value === null || value === undefined) {
        return { valid: false, value: null, reason: 'null_value' };
      }

      if (expectedType === 'array' && !Array.isArray(value)) {
        this._logCorruption(key, 'expected_array_got_non_array');
        return { valid: false, value: [], reason: 'type_mismatch' };
      }

      if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
        this._logCorruption(key, 'expected_object_got_non_object');
        return { valid: false, value: null, reason: 'type_mismatch' };
      }

      return { valid: true, value };
    }

    /**
     * Validate an array of entities for consistency.
     */
    validateCollection(key, items) {
      if (!Array.isArray(items)) {
        this._logCorruption(key, 'collection_not_array');
        return [];
      }

      const validated = [];
      for (const item of items) {
        if (!item || typeof item !== 'object') {
          this._logCorruption(key, 'invalid_item_in_collection');
          continue;
        }
        if (!item.id && !item.localId && !item.serverId && !item.messageId && !item.userId && !item.groupId) {
          this._logCorruption(key, 'item_missing_id');
          continue;
        }
        validated.push(item);
      }

      if (validated.length < items.length) {
        console.warn(`[CacheFoundation] Dropped ${items.length - validated.length} invalid items from "${key}"`);
      }

      return validated;
    }

    _logCorruption(key, reason) {
      this._corruptionLog.push({ key, reason, ts: Date.now() });
      if (this._corruptionLog.length > 100) this._corruptionLog.shift();
    }

    getCorruptionLog() { return [...this._corruptionLog]; }
    hasCorruption() { return this._corruptionLog.length > 0; }
  }

  // ─── MemoryPressureHandler ───────────────────────────────────────────────────

  class MemoryPressureHandler {
    constructor(onPressure) {
      this._onPressure = onPressure;
      this._pressureLevel = 0; // 0=none, 1=moderate, 2=high, 3=critical
    }

    attach() {
      // Listen to memory pressure API if available (Chrome 73+)
      if (window.MemoryPressure) {
        window.addEventListener('memorypressure', (e) => {
          const levelMap = { none: 0, moderate: 1, critical: 3 };
          this._pressureLevel = levelMap[e.pressure] ?? 1;
          this._onPressure(this._pressureLevel);
        });
      }

      // Periodic memory snapshot (heuristic)
      setInterval(() => {
        if (!performance.memory) return;
        const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
        const ratio = usedJSHeapSize / jsHeapSizeLimit;
        const prev = this._pressureLevel;
        if (ratio > 0.9) this._pressureLevel = 3;
        else if (ratio > 0.75) this._pressureLevel = 2;
        else if (ratio > 0.6) this._pressureLevel = 1;
        else this._pressureLevel = 0;

        if (this._pressureLevel !== prev && this._pressureLevel >= 2) {
          console.warn(`[CacheFoundation] Memory pressure level ${this._pressureLevel} (heap ${Math.round(ratio * 100)}%)`);
          this._onPressure(this._pressureLevel);
        }
      }, 15000);
    }

    getLevel() { return this._pressureLevel; }
  }

  // ─── CacheCoordinator (main) ──────────────────────────────────────────────────

  class CacheCoordinator {
    constructor() {
      this._invalidation = new CacheInvalidationManager();
      this._validator = new StorageConsistencyValidator();
      this._memPressure = new MemoryPressureHandler((level) => this._onMemoryPressure(level));
      this._memoryCache = new Map(); // fast in-memory layer
      this._maxMemoryCacheEntries = 500;
    }

    init() {
      this._memPressure.attach();
      this._listenForServerTruth();
      console.log('[CacheFoundation] ✅ Initialized');
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Read from cache with staleness check.
     * Returns null if stale or invalid.
     */
    get(key, expectedType = null) {
      if (this._invalidation.isStale(key)) return null;

      const cached = this._memoryCache.get(key);
      if (!cached) return null;

      const { valid, value } = this._validator.validate(key, cached.value, expectedType);
      return valid ? value : null;
    }

    /**
     * Write to cache.
     */
    set(key, value, ttlMs = 0) {
      // Evict if over limit
      if (this._memoryCache.size >= this._maxMemoryCacheEntries) {
        const firstKey = this._memoryCache.keys().next().value;
        this._memoryCache.delete(firstKey);
      }

      this._memoryCache.set(key, { value, cachedAt: Date.now() });
      this._invalidation.markFresh(key, ttlMs);
    }

    /**
     * Invalidate a key or collection.
     */
    invalidate(key) {
      this._invalidation.invalidate(key);
      this._memoryCache.delete(key);
    }

    /**
     * Validate and sanitize a collection before caching or rendering.
     */
    sanitizeCollection(key, items) {
      return this._validator.validateCollection(key, items);
    }

    /**
     * Reconcile server data against cached data.
     * Server always wins.
     */
    reconcile(key, serverData, localData, idKey = 'id') {
      if (!Array.isArray(serverData)) return localData;
      if (!Array.isArray(localData)) return serverData;

      const serverMap = new Map(serverData.map((item) => [item[idKey], item]));

      // Server data wins — merge
      const merged = serverData.map((s) => {
        const local = localData.find((l) => l[idKey] === s[idKey]);
        // Prefer server fields for all fields that server provides
        return local ? { ...local, ...s } : s;
      });

      return merged;
    }

    getDiagnostics() {
      return {
        memoryCacheSize: this._memoryCache.size,
        invalidatedKeys: this._invalidation.getInvalidatedKeys().length,
        corruptionEvents: this._validator.getCorruptionLog().length,
        memoryPressure: this._memPressure.getLevel(),
        corruptions: this._validator.getCorruptionLog().slice(-10),
      };
    }

    // ── Private ────────────────────────────────────────────────────────────────

    _onMemoryPressure(level) {
      if (level >= 2) {
        // Clear all but most-critical cache entries
        const keysToKeep = ['currentUser', 'session', 'auth'];
        for (const [key] of this._memoryCache) {
          if (!keysToKeep.includes(key)) this._memoryCache.delete(key);
        }
        console.warn(`[CacheFoundation] Memory pressure ${level} — cleared non-critical cache`);
      }
    }

    _listenForServerTruth() {
      // When socket events with server data arrive, invalidate related caches
      //
      // FIX: this used to match on `type.includes('message')` etc. — a
      // substring check against EVERY postMessage this window receives from
      // any iframe. This app's iframes exchange a constant stream of purely
      // internal postMessages (session forwarding, API request/response
      // plumbing, UI debug logs — see the "postMessage storm detected"
      // warnings logged elsewhere), and many of those incidentally contain
      // "message", "friend", or "group" as a substring without being a
      // genuine "new data arrived from the server" event. That meant this
      // cache was being invalidated dozens of times a second during normal
      // use, forcing constant re-fetches — and when one of those re-fetches
      // hit a slow/failing backend endpoint, there was nothing left to fall
      // back to and the UI rendered empty. Match specific known event types
      // instead of a loose substring.
      const MESSAGE_EVENTS = new Set(['MESSAGE_RECEIVED', 'MESSAGE_DELETED', 'MESSAGE_ACK', 'message:created', 'message:deleted', 'message:new', 'newMessage', 'new_message']);
      const FRIEND_EVENTS  = new Set(['FRIEND_REQUEST_RECEIVED', 'FRIEND_REQUEST_ACCEPTED', 'FRIEND_REMOVED', 'friend:added', 'friend:removed']);
      const GROUP_EVENTS   = new Set(['GROUP_MESSAGE_RECEIVED', 'group:message', 'group:updated', 'group:member:added', 'group:member:removed']);
      window.addEventListener('message', (e) => {
        if (!e.data || typeof e.data !== 'object') return;
        const type = e.data.type || '';

        if (MESSAGE_EVENTS.has(type)) this.invalidate('messages');
        if (FRIEND_EVENTS.has(type)) this.invalidate('friends');
        if (GROUP_EVENTS.has(type)) this.invalidate('groups');
        if (type === 'SOCKET_CONNECTED' || type === 'socket:reconnected') {
          // On reconnect, invalidate all caches to force server re-sync
          this._invalidation.clear();
          console.log('[CacheFoundation] Socket reconnected — cache invalidated for re-sync');
        }
      });
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────────

  const layer = new CacheCoordinator();
  layer.init();

  window.__CacheFoundationLayer = layer;
  window.CacheFoundation = layer;

  console.log('[CacheFoundation] ✅ Ready');
})();

// ─── PHASE10: DeletionRegistry ─────────────────────────────────────────────
// Prevents stale cache resurrection of deleted chats/messages/groups/statuses.
// Injected as window.__PHASE10_DeletionRegistry
(function() {
  'use strict';
  if (window.__PHASE10_DeletionRegistry) return;

  const DB_KEY = 'p10_deletion_registry';
  const TTL    = 7 * 24 * 60 * 60 * 1000;

  class DeletionRegistry {
    constructor() {
      this._entries = new Map(); // "type:id" -> { ts, reason }
      this._load();
    }

    mark(type, id, reason = 'deleted') {
      const key = `${type}:${String(id)}`;
      this._entries.set(key, { ts: Date.now(), reason });
      this._persist();
      // Immediately remove from caches
      this._evictFromCaches(type, id);
    }

    isDeleted(type, id) {
      const key = `${type}:${String(id)}`;
      const entry = this._entries.get(key);
      if (!entry) return false;
      if (Date.now() - entry.ts > TTL) { this._entries.delete(key); return false; }
      return true;
    }

    unmark(type, id) {
      this._entries.delete(`${type}:${String(id)}`);
      this._persist();
    }

    getSince(since = 0) {
      const out = [];
      for (const [key, entry] of this._entries) {
        if (entry.ts > since) {
          const [type, ...rest] = key.split(':');
          out.push({ type, id: rest.join(':'), ...entry });
        }
      }
      return out;
    }

    _evictFromCaches(type, id) {
      const idStr = String(id);
      // localStorage eviction
      try {
        const prefixes = ['kynecta_messages_v8_', 'kynecta_chat_', 'kynecta_group_', 'kynecta_status_'];
        if (type === 'chat' || type === 'message') {
          prefixes.forEach(p => {
            try { localStorage.removeItem(p + idStr); } catch(_) {}
          });
        }
      } catch(_) {}
      // sessionStorage eviction
      try {
        const keys = Object.keys(sessionStorage).filter(k => k.includes(idStr));
        keys.forEach(k => { try { sessionStorage.removeItem(k); } catch(_) {} });
      } catch(_) {}
    }

    _persist() {
      try {
        const arr = [];
        for (const [key, entry] of this._entries) arr.push([key, entry]);
        localStorage.setItem(DB_KEY, JSON.stringify(arr.slice(-1000)));
      } catch(_) {}
    }

    _load() {
      try {
        const raw = localStorage.getItem(DB_KEY);
        if (!raw) return;
        const arr = JSON.parse(raw);
        const now = Date.now();
        for (const [key, entry] of arr) {
          if (now - entry.ts < TTL) this._entries.set(key, entry);
        }
      } catch(_) {}
    }

    // Pull deletions from server to stay in sync
    async syncFromServer(since = 0) {
      try {
        const base = _resolveApiBase();

        // FIX-AUDIT-4: Resolve auth token from multiple sources across iframes
        // __kynToken is set in Tool-core.js but not in messages/calls/group iframes
        const _token = window.__kynToken
          || window.AppStorage?.get?.('authToken')
          || window.AppStorage?.get?.('token')
          || (() => {
               try {
                 const keys = ['authToken', 'token', 'kyn_token', 'accessToken'];
                 for (const k of keys) {
                   const v = localStorage.getItem(k);
                   if (v && v.startsWith('eyJ')) return v;
                 }
               } catch(_) {}
               return '';
             })();

        if (!_token) return; // No token = skip sync to avoid 401 spam

        const res  = await fetch(`${base}/deletions?since=${since}`, {
          headers: { Authorization: `Bearer ${_token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        (data.deletions || []).forEach(d => {
          // Do NOT mark statuses as deleted just because they expired or were viewed
          if (d.type === 'status' && d.reason !== 'deleted') return;
          this.mark(d.type, d.id, d.reason);
        });
      } catch(_) {}
    }
  }

  const registry = new DeletionRegistry();
  window.__PHASE10_DeletionRegistry = registry;

  // Sync from server on load and reconnect
  // FIX: Circuit breaker for /api/deletions polling to prevent 404 storm on cold-start.
  // 2 consecutive failures → open for 5 minutes. Concurrency guard prevents overlapping.
  // Initial sync delayed from 3s → 15s to allow Phase10/server routes to initialise.
  const _deletionCB = {
    failures: 0,
    openUntil: 0,
    inFlight: false,
    MAX_FAILURES: 2,
    OPEN_MS: 5 * 60 * 1000, // 5 minutes
  };

  async function _safeSyncFromServer(since) {
    const now = Date.now();
    if (_deletionCB.inFlight) return;              // concurrency guard
    if (now < _deletionCB.openUntil) return;       // circuit open — skip
    _deletionCB.inFlight = true;
    try {
      const base = _resolveApiBase();
      const _token = window.__kynToken
        || window.AppStorage?.get?.('authToken')
        || window.AppStorage?.get?.('token')
        || (() => {
             try {
               const keys = ['authToken', 'token', 'kyn_token', 'accessToken'];
               for (const k of keys) { const v = localStorage.getItem(k); if (v && v.startsWith('eyJ')) return v; }
             } catch(_) {}
             return '';
           })();
      if (!_token) { _deletionCB.inFlight = false; return; }
      const res = await fetch(`${base}/deletions?since=${since || 0}`, {
        headers: { Authorization: `Bearer ${_token}` }
      });
      if (!res.ok) {
        _deletionCB.failures++;
        if (_deletionCB.failures >= _deletionCB.MAX_FAILURES) {
          _deletionCB.openUntil = Date.now() + _deletionCB.OPEN_MS;
          console.warn('[CacheFoundation] /api/deletions circuit open for 5 min after', _deletionCB.failures, 'failures');
        }
        _deletionCB.inFlight = false;
        return;
      }
      _deletionCB.failures = 0; // reset on success
      const data = await res.json();
      (data.deletions || []).forEach(d => {
        if (d.type === 'status' && d.reason !== 'deleted') return;
        registry.mark(d.type, d.id, d.reason);
      });
    } catch(_) {
      _deletionCB.failures++;
      if (_deletionCB.failures >= _deletionCB.MAX_FAILURES) {
        _deletionCB.openUntil = Date.now() + _deletionCB.OPEN_MS;
      }
    } finally {
      _deletionCB.inFlight = false;
    }
  }

  // Delay initial sync by 15s (was 3s) to allow server routes to register on cold-start
  setTimeout(() => _safeSyncFromServer(Date.now() - 7 * 24 * 60 * 60 * 1000), 15000);
  window.addEventListener('kyn:connected', () => _safeSyncFromServer(Date.now() - 24 * 60 * 60 * 1000));
  window.addEventListener('online', () => _safeSyncFromServer(Date.now() - 24 * 60 * 60 * 1000));

  // Listen for deletion events from socket
  window.addEventListener('message', (evt) => {
    try {
      const d = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
      if (!d) return;
      const type = d.type || d.event || '';
      if (type === 'entity:deleted' || type === 'ENTITY_DELETED') {
        registry.mark(d.entityType || 'unknown', d.entityId || d.id, d.reason || 'deleted');
      }
      if (type === 'message:deleted' || type === 'MESSAGE_DELETED') {
        registry.mark('message', d.messageId || d.id, 'deleted');
      }
      if (type === 'chat:deleted' || type === 'CHAT_DELETED') {
        registry.mark('chat', d.chatId || d.id, 'deleted');
      }
    } catch(_) {}
  });

  console.log('[PHASE10] DeletionRegistry ✅ active');
})();
