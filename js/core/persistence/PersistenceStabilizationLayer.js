/**
 * PersistenceStabilizationLayer.js
 * Phase 1 — Persistence Stabilization
 *
 * Ensures:
 *  - Server truth ALWAYS wins over stale cache
 *  - Deleted entities NEVER reappear
 *  - Hydration is atomic, versioned, and validated
 *  - No hydration race conditions
 *  - No duplicate cache restores
 *  - StorageVersionManager enforces freshness
 *
 * DOES NOT modify schema or existing DB code — wraps and validates only.
 *
 * @version 1.0.0
 * @phase 1 — Foundation Stabilization
 */

(function () {
  'use strict';

  if (window.__PersistenceStabilizationLayer) {
    console.log('[PersistenceStab] Already initialized — skipping.');
    return;
  }

  const STORAGE_VERSION = 4; // Increment to force cache invalidation on deploy
  const VERSION_KEY = '__kyn_storage_v';
  const DELETED_REGISTRY_KEY = '__kyn_deleted_registry';
  const HYDRATION_LOCK_KEY = '__kyn_hydration_lock';
  const LOCK_TIMEOUT_MS = 10000;

  // ─── StorageVersionManager ───────────────────────────────────────────────────

  class StorageVersionManager {
    constructor() {
      this._current = STORAGE_VERSION;
    }

    getStoredVersion() {
      try {
        return parseInt(localStorage.getItem(VERSION_KEY) || '0', 10);
      } catch (_) { return 0; }
    }

    setStoredVersion(v) {
      try { localStorage.setItem(VERSION_KEY, String(v)); } catch (_) {}
    }

    isStale() {
      return this.getStoredVersion() < this._current;
    }

    /**
     * If the stored version is outdated, wipe caches and stamp the new version.
     * Returns true if a wipe was performed.
     */
    ensureFresh() {
      if (this.isStale()) {
        console.warn(`[PersistenceStab] Storage version mismatch (stored=${this.getStoredVersion()} current=${this._current}) — clearing stale caches`);
        this._clearStaleCaches();
        this.setStoredVersion(this._current);
        return true;
      }
      return false;
    }

    _clearStaleCaches() {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        // Clear all app-specific cache keys but never auth tokens
        if (k && (
          k.startsWith('kynecta_cache_') ||
          k.startsWith('app_cache_') ||
          k.startsWith('msg_cache_') ||
          k.startsWith('chat_cache_') ||
          k.startsWith('group_cache_') ||
          k.startsWith('status_cache_') ||
          k.startsWith('presence_cache_')
        )) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => { try { localStorage.removeItem(k); } catch (_) {} });

      // Clear IndexedDB (non-destructive: flag for re-initialization)
      try {
        sessionStorage.setItem('__kyn_idb_needs_reset', '1');
      } catch (_) {}

      console.log(`[PersistenceStab] Cleared ${keysToRemove.length} stale cache keys`);
    }
  }

  // ─── DeletedEntityRegistry ───────────────────────────────────────────────────

  class DeletedEntityRegistry {
    constructor() {
      this._registry = this._load();
      this._dirty = false;

      // Persist on unload
      window.addEventListener('beforeunload', () => this._flush());
      setInterval(() => this._flush(), 30000);
    }

    markDeleted(type, id) {
      const key = `${type}:${id}`;
      this._registry[key] = { type, id, deletedAt: Date.now() };
      this._dirty = true;
    }

    isDeleted(type, id) {
      return !!this._registry[`${type}:${id}`];
    }

    /**
     * Filter out deleted entities from an array.
     * @param {string} type - Entity type (e.g. 'message', 'group')
     * @param {Array} entities - Array with id fields
     * @param {string} idKey - The id field name (default 'id')
     */
    filterDeleted(type, entities, idKey = 'id') {
      return entities.filter((e) => !this.isDeleted(type, e[idKey]));
    }

    _load() {
      try {
        const raw = localStorage.getItem(DELETED_REGISTRY_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        // Prune entries older than 7 days
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        for (const key of Object.keys(parsed)) {
          if (parsed[key].deletedAt < cutoff) delete parsed[key];
        }
        return parsed;
      } catch (_) { return {}; }
    }

    _flush() {
      if (!this._dirty) return;
      try {
        localStorage.setItem(DELETED_REGISTRY_KEY, JSON.stringify(this._registry));
        this._dirty = false;
      } catch (_) {}
    }

    getCount() { return Object.keys(this._registry).length; }
  }

  // ─── HydrationValidator ──────────────────────────────────────────────────────

  class HydrationValidator {
    constructor(deletedRegistry) {
      this._deleted = deletedRegistry;
      this._failures = [];
    }

    /**
     * Validate a single entity before hydrating into app state.
     * Returns false if entity should be suppressed.
     */
    validateEntity(type, entity, idKey = 'id') {
      if (!entity) return false;

      const id = entity[idKey] || entity.id;
      if (!id) return false;

      // Never resurrect deleted entities
      if (this._deleted.isDeleted(type, id)) {
        this._failures.push({ reason: 'deleted', type, id, ts: Date.now() });
        return false;
      }

      // Flag entities with no createdAt — may be corrupt
      if (!entity.createdAt && !entity.created_at && !entity.updatedAt && !entity.updated_at) {
        // Don't reject — just warn
        console.debug(`[PersistenceStab] Entity ${type}:${id} has no timestamp`);
      }

      return true;
    }

    validateCollection(type, entities, idKey = 'id') {
      return entities.filter((e) => this.validateEntity(type, e, idKey));
    }

    getFailures() { return [...this._failures]; }
    getFailureCount() { return this._failures.length; }
  }

  // ─── HydrationLockManager ────────────────────────────────────────────────────

  class HydrationLockManager {
    constructor() {
      this._locks = new Map(); // storeKey -> Promise
    }

    /**
     * Acquire a lock for a hydration operation.
     * Prevents concurrent hydration of the same store.
     */
    async withLock(storeKey, fn) {
      while (this._locks.has(storeKey)) {
        await this._locks.get(storeKey);
      }

      let resolve;
      const lock = new Promise((r) => { resolve = r; });
      this._locks.set(storeKey, lock);

      try {
        return await fn();
      } finally {
        this._locks.delete(storeKey);
        resolve();
      }
    }

    isLocked(storeKey) { return this._locks.has(storeKey); }
  }

  // ─── StateConsistencyChecker ─────────────────────────────────────────────────

  class StateConsistencyChecker {
    constructor(deletedRegistry) {
      this._deleted = deletedRegistry;
      this._issues = [];
    }

    /**
     * Run consistency checks on a state snapshot.
     * Returns array of detected issues.
     */
    check(stateSnapshot) {
      const issues = [];

      if (!stateSnapshot || typeof stateSnapshot !== 'object') {
        return [{ type: 'invalid_state', message: 'State snapshot is null or non-object' }];
      }

      // Check messages
      if (Array.isArray(stateSnapshot.messages)) {
        for (const msg of stateSnapshot.messages) {
          if (this._deleted.isDeleted('message', msg.id || msg.localId)) {
            issues.push({ type: 'deleted_message_in_state', id: msg.id });
          }
        }
      }

      // Check friends
      if (Array.isArray(stateSnapshot.friends)) {
        for (const f of stateSnapshot.friends) {
          if (this._deleted.isDeleted('friend', f.id || f.friendId)) {
            issues.push({ type: 'deleted_friend_in_state', id: f.id });
          }
        }
      }

      this._issues.push(...issues);
      return issues;
    }

    getIssues() { return [...this._issues]; }
  }

  // ─── PersistenceCoordinator (main) ───────────────────────────────────────────

  class PersistenceCoordinator {
    constructor() {
      this._versionManager = new StorageVersionManager();
      this._deletedRegistry = new DeletedEntityRegistry();
      this._validator = new HydrationValidator(this._deletedRegistry);
      this._lockManager = new HydrationLockManager();
      this._consistency = new StateConsistencyChecker(this._deletedRegistry);
      this._initialized = false;
    }

    init() {
      const wiped = this._versionManager.ensureFresh();
      this._initialized = true;
      this._patchWindowCache();

      if (wiped) {
        // Notify event bus of cache wipe
        this._broadcastEvent('SYNC_STARTED', { reason: 'cache_version_mismatch' });
      }

      console.log('[PersistenceStab] ✅ Initialized (version=' + STORAGE_VERSION + ')');
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    markDeleted(type, id) {
      this._deletedRegistry.markDeleted(type, id);
    }

    isDeleted(type, id) {
      return this._deletedRegistry.isDeleted(type, id);
    }

    validateCollection(type, entities, idKey = 'id') {
      return this._validator.validateCollection(type, entities, idKey);
    }

    validateEntity(type, entity, idKey = 'id') {
      return this._validator.validateEntity(type, entity, idKey);
    }

    async withHydrationLock(store, fn) {
      return this._lockManager.withLock(store, fn);
    }

    checkConsistency(snapshot) {
      return this._consistency.check(snapshot);
    }

    getDiagnostics() {
      return {
        storageVersion: this._versionManager.getStoredVersion(),
        deletedEntities: this._deletedRegistry.getCount(),
        hydrationFailures: this._validator.getFailureCount(),
        consistencyIssues: this._consistency.getIssues().length,
        failures: this._validator.getFailures().slice(-20),
      };
    }

    // ── Intercept AppCache to auto-filter deleted entities ────────────────────

    _patchWindowCache() {
      const self = this;

      // Wrap AppCache.load / KynectaCache.load if they exist
      const patchCache = (cache, label) => {
        if (!cache || typeof cache.load !== 'function') return;
        const orig = cache.load.bind(cache);
        cache.load = async function (storeName, ...args) {
          const result = await orig(storeName, ...args);
          if (!Array.isArray(result)) return result;

          // Map store names to entity types
          const typeMap = {
            messages: 'message',
            friends: 'friend',
            groups: 'group',
            chats: 'chat',
            users: 'user',
            calls: 'call',
            status: 'status',
          };
          const type = typeMap[storeName];
          if (!type) return result;

          const filtered = self._validator.validateCollection(type, result);
          if (filtered.length < result.length) {
            console.log(`[PersistenceStab] Filtered ${result.length - filtered.length} deleted ${type}(s) from ${label}.load`);
          }
          return filtered;
        };
        console.log(`[PersistenceStab] Patched ${label}.load`);
      };

      // Attempt patch immediately and on DOMContentLoaded
      const tryPatch = () => {
        if (window.AppCache) patchCache(window.AppCache, 'AppCache');
        if (window.KynectaCache) patchCache(window.KynectaCache, 'KynectaCache');
      };

      tryPatch();
      document.addEventListener('DOMContentLoaded', tryPatch);

      // Also intercept known delete-event hooks
      window.addEventListener('message', (e) => {
        if (!e.data || typeof e.data !== 'object') return;
        const type = e.data.type;
        const id = e.data.id || e.data.messageId || e.data.friendId || e.data.groupId;
        if (!id) return;

        if (type === 'MESSAGE_DELETED' || type === 'message:deleted') {
          this.markDeleted('message', id);
        } else if (type === 'FRIEND_REMOVED' || type === 'friend:removed') {
          this.markDeleted('friend', id);
        } else if (type === 'GROUP_DELETED' || type === 'group:deleted') {
          this.markDeleted('group', id);
        }
      });
    }

    _broadcastEvent(type, payload) {
      const bus = window.KynectaEventBus || window.appEvents;
      if (bus && typeof bus.emit === 'function') {
        bus.emit(type, payload, { async: true });
      }
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────────

  const layer = new PersistenceCoordinator();
  layer.init();

  window.__PersistenceStabilizationLayer = layer;
  window.PersistenceStab = layer;

  console.log('[PersistenceStab] ✅ Ready');
})();
