/**
 * localStore.calls.js  (Offline-First Edition v2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Call-history local storage.  Uses the shared AppCache (app.cache.js) as its
 * SINGLE storage back-end instead of maintaining a private IndexedDB database.
 *
 * Standard interface exposed on window.KynectaCallLocalStore:
 *   getAll()          — all call records
 *   getById(id)       — single record by local id
 *   save(record)      — upsert (create or full replace)
 *   update(id, patch) — partial update
 *   delete(id)        — remove record
 *
 * Additional helpers (backwards-compatible):
 *   createCall(data)          — create a new initiated call record
 *   getHistory(opts)          — filtered / sorted list
 *   getMissedCalls(userId)    — unread missed calls
 *   markAsRead(id)            — set readAt timestamp
 *   updateFields(id, fields)  — alias for update()
 *   updateStatus(id, status)  — smart status patch with duration calc
 *   linkServerId(localId, serverId)
 *   clearAll()                — logout wipe
 *   prune()                   — trim to MAX_RECORDS
 *   count()                   — record count
 *   generateId()              — expose id generator
 *
 * @version 2.0.0
 */
(function () {
  'use strict';

  const COLLECTION  = 'calls';
  const MAX_RECORDS = 500;

  /* ── ID generator ───────────────────────────────────────────────────────── */
  function generateLocalId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'call_' + window.crypto.randomUUID();
    }
    return 'call-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /* ── Wait for AppCache to be available ──────────────────────────────────── */
  function getCache() {
    if (window.AppCache) return Promise.resolve(window.AppCache);
    
    // Listen for cache ready event instead of polling
    return new Promise((resolve) => {
      const handleCacheReady = () => {
        if (window.AppCache) {
          window.removeEventListener('kyn:cacheReady', handleCacheReady);
          resolve(window.AppCache);
        }
      };
      
      window.addEventListener('kyn:cacheReady', handleCacheReady, { once: true });
      
      // Fallback: check if AppCache becomes available within 5 seconds
      setTimeout(() => {
        if (window.AppCache) {
          window.removeEventListener('kyn:cacheReady', handleCacheReady);
          resolve(window.AppCache);
        } else {
          if (!window._callLocalStoreFallbackWarned) {
            window._callLocalStoreFallbackWarned = true;
            console.log('[CallLocalStore] AppCache not available after 5s, using localStorage fallback (once only)');
          }
          resolve(null);
        }
      }, 5000);
    });
  }

  /* ── Normalise a raw call record ────────────────────────────────────────── */
  function normalise(raw) {
    const r = raw || {};
    return {
      id:          r.id          || generateLocalId(),
      serverId:    r.serverId    || null,
      callerId:    r.callerId    || null,
      receiverId:  r.receiverId  || null,
      type:        r.type        || 'audio',
      status:      r.status      || 'initiated',
      duration:    r.duration    || 0,
      startedAt:   r.startedAt   || null,
      endedAt:     r.endedAt     || null,
      isLocalOnly: r.isLocalOnly !== false,
      isGroupCall: r.isGroupCall || false,
      participants:r.participants || [],
      callerName:  r.callerName  || null,
      callerAvatar:r.callerAvatar|| null,
      createdAt:   r.createdAt   || Date.now(),
      updatedAt:   Date.now(),
      metadata:    r.metadata    || {},
      readAt:      r.readAt      || null
    };
  }

  /* ── Public API ──────────────────────────────────────────────────────────── */
  const KynectaCallLocalStore = {

    /* ── Standard interface ──────────────────────────────────────────────── */

    /** Return all call history records (newest first). */
    async getAll() {
      const cache = await getCache();
      const records = await cache.getAll(COLLECTION);
      return records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },

    /** Get a single record by its local id. */
    async getById(id) {
      if (!id) return null;
      const cache = await getCache();
      if (!cache) {
        // Fallback to localStorage if AppCache is not available
        const key = `kynecta_calls_${id}`;
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
      }
      return cache.get(COLLECTION, String(id));
    },

    /**
     * Upsert a call record (create or full replace).
     * @param {Object} record — must have an id field
     */
    async save(record) {
      if (!record) return null;
      const cache = await getCache();
      if (!cache) {
        // Fallback to localStorage if AppCache is not available
        if (!window._callLocalStoreSaveWarnShown) { window._callLocalStoreSaveWarnShown = true; console.warn('[CallLocalStore] Using localStorage fallback for save (once only)'); }
        const normalised = normalise(record);
        const key = `kynecta_calls_${normalised.id}`;
        localStorage.setItem(key, JSON.stringify(normalised));
        return normalised;
      }
      const normalised = normalise(record);
      return cache.save(COLLECTION, normalised);
    },

    /**
     * Partial update — merges fields onto the existing record.
     * @param {string} id
     * @param {Object} patch
     */
    async update(id, patch) {
      if (!id) return null;
      const cache = await getCache();
      const existing = await cache.get(COLLECTION, String(id));
      if (!existing) {
        // Create minimal record if not found (forward-compatible)
        return cache.save(COLLECTION, normalise({ id, ...patch }));
      }
      return cache.save(COLLECTION, normalise({ ...existing, ...patch, id: existing.id }));
    },

    /** Remove a record by id. */
    async delete(id) {
      if (!id) return false;
      const cache = await getCache();
      return cache.remove(COLLECTION, String(id));
    },

    /* ── Extended helpers (backwards-compatible) ──────────────────────── */

    /**
     * Create a brand-new call record with status 'initiated'.
     * @param {Object} data
     * @returns {Promise<Object>} saved record
     */
    async createCall(data = {}) {
      return this.save({ ...data, id: generateLocalId(), status: 'initiated', isLocalOnly: true });
    },

    /**
     * Get filtered / sorted call history.
     * @param {Object} opts  { limit, status, callerId, receiverId }
     */
    async getHistory(opts = {}) {
      let records = await this.getAll();
      if (opts.status)     records = records.filter(r => r.status     === opts.status);
      if (opts.callerId)   records = records.filter(r => String(r.callerId)   === String(opts.callerId));
      if (opts.receiverId) records = records.filter(r => String(r.receiverId) === String(opts.receiverId));
      const limit = opts.limit || 100;
      return records.slice(0, limit);
    },

    /** Unread missed calls for a userId. */
    async getMissedCalls(userId) {
      const records = await this.getHistory({ status: 'missed', receiverId: userId });
      return records.filter(r => !r.readAt);
    },

    /** Mark a call as seen by receiver. */
    async markAsRead(id) {
      return this.update(id, { readAt: Date.now() });
    },

    /** Alias for update() — patch specific fields only. */
    async updateFields(id, fields) {
      return this.update(id, fields);
    },

    /**
     * Smart status update — computes duration automatically when ending.
     * @param {string} id
     * @param {string} status
     * @param {Object} extra
     */
    async updateStatus(id, status, extra = {}) {
      const record = await this.getById(id);
      const patch  = { status, updatedAt: Date.now(), ...extra };

      if (status === 'connected' && (!record || !record.startedAt)) {
        patch.startedAt = Date.now();
      }
      if (['ended', 'missed', 'rejected', 'failed', 'cancelled'].includes(status)) {
        patch.endedAt = patch.endedAt || Date.now();
        if (record && record.startedAt && !extra.duration) {
          patch.duration = Math.floor((patch.endedAt - record.startedAt) / 1000);
        }
      }
      return this.update(id, patch);
    },

    /** Link the server-assigned UUID to a locally-created call record. */
    async linkServerId(localId, serverId) {
      return this.update(localId, { serverId, isLocalOnly: false });
    },

    /** Remove ALL call history (called on logout). */
    async clearAll() {
      const cache = await getCache();
      return cache.clear(COLLECTION);
    },

    /** Trim oldest records so we stay under MAX_RECORDS. */
    async prune() {
      const cache   = await getCache();
      const records = await cache.getAll(COLLECTION);
      if (records.length <= MAX_RECORDS) return 0;
      const sorted  = records.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const toDelete = sorted.slice(0, records.length - MAX_RECORDS);
      await Promise.all(toDelete.map(r => cache.remove(COLLECTION, r.id)));
      return toDelete.length;
    },

    /** Total number of records in the collection. */
    async count() {
      const cache = await getCache();
      const all   = await cache.getAll(COLLECTION);
      return all.length;
    },

    /** Expose id generator for external callers. */
    generateId: generateLocalId,

    /* ── Bulk helpers used by sync engine ───────────────────────────────── */

    /**
     * Merge server records without wiping local-only entries.
     * @param {Array} serverRecords
     */
    async mergeFromServer(serverRecords) {
      const cache = await getCache();
      if (window.CacheUnified && typeof window.CacheUnified.mergeFromServer === 'function') {
        return window.CacheUnified.mergeFromServer(COLLECTION, serverRecords);
      }
      // Fallback: simple upsert
      if (!Array.isArray(serverRecords)) return;
      const toSave = serverRecords.map(r => normalise({ ...r, isLocalOnly: false }));
      return cache.save(COLLECTION, toSave);
    }
  };

  /* ── Expose globally ─────────────────────────────────────────────────────── */
  window.KynectaCallLocalStore = KynectaCallLocalStore;

  // Legacy alias so any code using window.CallStore still works
  window.CallStore = KynectaCallLocalStore;

  console.log('[CallLocalStore] ✅ Initialized (unified cache v2)');
})();