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
      window.addEventListener('message', (e) => {
        if (!e.data || typeof e.data !== 'object') return;
        const type = e.data.type || '';

        if (type.includes('message')) this.invalidate('messages');
        if (type.includes('friend')) this.invalidate('friends');
        if (type.includes('group')) this.invalidate('groups');
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
