/**
 * app.cache.unified.js — Single Source of Truth Cache Layer
 * ─────────────────────────────────────────────────────────
 * MUST load AFTER app.cache.js (which defines window.AppCache).
 *
 * Responsibilities:
 *  1. Guarantee AppCache + KynectaCache are the same singleton.
 *  2. Expose a consistent store-level API used by every localStore.* module.
 *  3. Provide collection-level helpers so modules never touch localStorage or
 *     IndexedDB directly.
 *  4. Hydrate KynectaStore from IndexedDB on first call (non-blocking).
 *
 * Supported collections:
 *   messages · friends · groups · calls · status · settings · users · syncQueue · chats
 */
(function () {
  'use strict';

  /* ── Guard: do not run twice ─────────────────────────────────────────── */
  if (window.__CacheUnifiedLoaded__) return;
  window.__CacheUnifiedLoaded__ = true;

  /* ── Wait for AppCache (app.cache.js) ───────────────────────────────── */
  function onAppCacheReady(callback) {
    if (window.AppCache) { callback(window.AppCache); return; }
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (window.AppCache) { clearInterval(timer); callback(window.AppCache); return; }
      if (tries >= 50) {
        clearInterval(timer);
        console.error('[CacheUnified] AppCache never appeared — offline features degraded');
      }
    }, 50);
  }

  onAppCacheReady(function (base) {

    /* ── Ensure both globals point to the same object ──────────────────── */
    window.AppCache    = base;
    window.KynectaCache = base;

    /* ── Unified facade methods (thin wrappers kept DRY) ───────────────── */
    const CacheUnified = {

      /** Low-level: await DB ready */
      ready() { return base.ready(); },

      /* ── Core CRUD ─────────────────────────────────────────────────── */

      /**
       * Save one record or an array of records to a collection.
       * @param {string} collection
       * @param {Object|Array} data
       * @returns {Promise<Object|Array>} saved record(s)
       */
      async set(collection, data) {
        return base.save(collection, data);
      },

      /**
       * Get a single record by id (string/number) or by field-match object.
       * @param {string} collection
       * @param {string|number|Object} query
       * @returns {Promise<Object|null>}
       */
      async get(collection, query) {
        return base.get(collection, query);
      },

      /**
       * Get all records in a collection.
       * @param {string} collection
       * @returns {Promise<Array>}
       */
      async getAll(collection) {
        return base.getAll(collection);
      },

      /**
       * Merge partial updates onto an existing record.
       * @param {string} collection
       * @param {string} id
       * @param {Object} updates
       * @returns {Promise<Object|null>}
       */
      async update(collection, id, updates) {
        return base.update(collection, id, updates);
      },

      /**
       * Delete a record by id.
       * @param {string} collection
       * @param {string} id
       * @returns {Promise<boolean>}
       */
      async delete(collection, id) {
        return base.remove(collection, id);
      },

      /**
       * Delete ALL records in a collection.
       * @param {string} collection
       * @returns {Promise<boolean>}
       */
      async clear(collection) {
        return base.clear(collection);
      },

      /* ── Upsert helper ─────────────────────────────────────────────── */

      /**
       * Insert or update based on id field.
       * @param {string} collection
       * @param {Object} record  — must have an id field (or resolvable key)
       * @returns {Promise<Object>}
       */
      async upsert(collection, record) {
        return base.save(collection, record);
      },

      /* ── Bulk merge (server → local, preserving local-only records) ── */

      /**
       * Merge an array of server records into a collection without wiping
       * records that are flagged isLocalOnly:true.
       * @param {string} collection
       * @param {Array}  serverRecords
       * @returns {Promise<void>}
       */
      async mergeFromServer(collection, serverRecords) {
        if (!Array.isArray(serverRecords) || serverRecords.length === 0) return;

        const existing = await base.getAll(collection);
        const localOnly = existing.filter(r => r.isLocalOnly === true);

        // Remove all non-local records so we can replace cleanly
        const nonLocal = existing.filter(r => r.isLocalOnly !== true);
        await Promise.all(nonLocal.map(r => base.remove(collection, r.id)));

        // Write incoming server records (mark as synced)
        const toWrite = serverRecords.map(r => ({ ...r, isLocalOnly: false }));
        await base.save(collection, toWrite);

        // Re-write local-only records on top
        if (localOnly.length > 0) await base.save(collection, localOnly);
      },

      /* ── Snapshot helpers (used by bootstrap / KynectaStore hydration) */

      /**
       * Get a KynectaStore-ready snapshot for a module.
       * @param {string} module  messages|friends|groups|calls|status|settings|chats|user|session
       * @returns {Promise<any>}
       */
      async getSnapshot(module) {
        return base.getModuleSnapshot(module);
      },

      /**
       * Persist a KynectaStore snapshot into the appropriate collection(s).
       * @param {string} module
       * @param {any}    value
       * @returns {Promise<boolean>}
       */
      async setSnapshot(module, value) {
        return base.setModuleSnapshot(module, value);
      },

      /* ── Session helpers ─────────────────────────────────────────────── */
      getSession()        { return base.getSession(); },
      setSession(s)       { return base.setSession(s); },
      clearSession()      { return base.clearSession(); },

      /* ── Settings helpers ────────────────────────────────────────────── */
      getSettings()       { return base.getSettings(); },
      setSettings(s)      { return base.setSettings(s); },

      /* ── Sync-queue helpers ──────────────────────────────────────────── */
      async enqueueSync(action) { return base.enqueueSync(action); },
      async getPendingSyncQueue() { return base.getPendingSyncQueue(); },

      /* ── Store hydration ─────────────────────────────────────────────── */

      /**
       * Load all cached data into KynectaStore (non-blocking).
       * Called by app.offline.bootstrap.js.
       */
      async hydrateStoreFromCache() { return base.hydrateStoreFromCache(); },

      /* ── Diagnostics ─────────────────────────────────────────────────── */
      async debugSummary() { return base.debugSummary(); },

      /* ── DB init (idempotent) ────────────────────────────────────────── */
      async initDB() { return base.initDB(); }
    };

    /* ── Expose as window.CacheUnified ─────────────────────────────────── */
    window.CacheUnified = CacheUnified;

    /* ── Also patch AppCache / KynectaCache with unified helpers ────────── */
    // So any code that calls window.AppCache.mergeFromServer() etc. works.
    if (!base.mergeFromServer) base.mergeFromServer = CacheUnified.mergeFromServer.bind(CacheUnified);
    if (!base.upsert)          base.upsert          = CacheUnified.upsert.bind(CacheUnified);
    if (!base.getSnapshot)     base.getSnapshot     = CacheUnified.getSnapshot.bind(CacheUnified);
    if (!base.setSnapshot)     base.setSnapshot     = CacheUnified.setSnapshot.bind(CacheUnified);
    if (!base.set)             base.set             = CacheUnified.set.bind(CacheUnified);
    if (!base.delete)          base.delete          = CacheUnified.delete.bind(CacheUnified);

    /* ── Emit ready event ───────────────────────────────────────────────── */
    try {
      window.dispatchEvent(new CustomEvent('CACHE_UNIFIED_READY', { detail: { at: Date.now() } }));
    } catch (_) {}

    console.log('[CacheUnified] ✅ Unified cache layer active — AppCache === KynectaCache');
  });

})();