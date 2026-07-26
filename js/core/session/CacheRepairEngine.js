/**
 * CacheRepairEngine.js
 * Phase 5 — Cache Repair + Cleanup Engine (Frontend)
 *
 * Prevents stale restoration FOREVER:
 *  - Purges deleted content from ALL storage layers simultaneously
 *  - IndexedDB, localStorage, sessionStorage, service worker cache
 *  - In-memory stores, socket hydration, offline queues
 *  - Coordinates with Phase 1 PersistenceStabilizationLayer
 *  - Runs on reconnect, visibility restore, and explicit triggers
 *
 * Uses nexopa_ prefix for all keys.
 *
 * @version 5.0.0
 * @phase 5 — Cache Repair
 */

(function () {
  'use strict';

  if (window.__CacheRepairEngine) return;

  const REPAIR_DB_NAME    = 'nexopa_repair_v1';
  const DELETED_STORE     = 'deleted_entities';
  const MAX_DELETED_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  // ─── DeletedEntityPurger ──────────────────────────────────────────────────

  class DeletedEntityPurger {
    constructor() { this._db = null; }

    async open() {
      if (this._db) return this._db;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(REPAIR_DB_NAME, 1);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(DELETED_STORE)) {
            const store = db.createObjectStore(DELETED_STORE, { keyPath: 'key' });
            store.createIndex('type',      'type',      { unique: false });
            store.createIndex('deletedAt', 'deletedAt', { unique: false });
          }
        };
        req.onsuccess = e => { this._db = e.target.result; resolve(this._db); };
        req.onerror   = e => reject(e.target.error);
      });
    }

    async markDeleted(type, id) {
      const db  = await this.open();
      const key = `${type}:${id}`;
      return new Promise(resolve => {
        const tx = db.transaction(DELETED_STORE, 'readwrite');
        tx.objectStore(DELETED_STORE).put({ key, type, id, deletedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror    = () => resolve(false);
      });
    }

    async isDeleted(type, id) {
      const db  = await this.open();
      const key = `${type}:${id}`;
      return new Promise(resolve => {
        const req = db.transaction(DELETED_STORE, 'readonly')
          .objectStore(DELETED_STORE).get(key);
        req.onsuccess = e => resolve(!!e.target.result);
        req.onerror   = () => resolve(false);
      });
    }

    async getAllDeleted() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const req = db.transaction(DELETED_STORE, 'readonly').objectStore(DELETED_STORE).getAll();
        req.onsuccess = e => resolve(e.target.result || []);
        req.onerror   = e => reject(e.target.error);
      });
    }

    async pruneOld() {
      const db     = await this.open();
      const cutoff = Date.now() - MAX_DELETED_AGE_MS;
      return new Promise(resolve => {
        const tx    = db.transaction(DELETED_STORE, 'readwrite');
        const store = tx.objectStore(DELETED_STORE);
        const index = store.index('deletedAt');
        const range = IDBKeyRange.upperBound(cutoff);
        const req   = index.openCursor(range);
        let pruned  = 0;
        req.onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) { cursor.delete(); pruned++; cursor.continue(); }
          else resolve(pruned);
        };
        req.onerror = () => resolve(0);
      });
    }
  }

  // ─── StorageLayerCleaner ──────────────────────────────────────────────────

  class StorageLayerCleaner {
    /**
     * Purge all references to a deleted entity across ALL storage layers.
     */
    async purge(type, id) {
      const results = await Promise.allSettled([
        this._purgeLocalStorage(type, id),
        this._purgeSessionStorage(type, id),
        this._purgeIDBStores(type, id),
        this._purgeServiceWorkerCache(type, id),
        this._purgeInMemoryStores(type, id),
        this._purgeOfflineQueue(type, id),
      ]);

      const failed = results.filter(r => r.status === 'rejected').length;
      return { success: failed === 0, failed };
    }

    async _purgeLocalStorage(type, id) {
      const keysToCheck = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes(id) || key.includes(`${type}_${id}`))) {
          keysToCheck.push(key);
        }
      }
      keysToCheck.forEach(k => {
        try {
          const val = localStorage.getItem(k);
          if (val && (val.includes(`"id":"${id}"`) || val.includes(`"${type}Id":"${id}"`))) {
            localStorage.removeItem(k);
          }
        } catch (_) {}
      });
    }

    async _purgeSessionStorage(type, id) {
      const keysToCheck = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.includes(id)) keysToCheck.push(key);
      }
      keysToCheck.forEach(k => {
        try { sessionStorage.removeItem(k); } catch (_) {}
      });
    }

    async _purgeIDBStores(type, id) {
      // Purge from known IDB databases
      const dbTargets = [
        { name: 'nexopa_offline_queue', store: 'pending_messages' },
        { name: 'kyn_offline_queue',      store: 'pending_messages' },
        { name: 'kyn_stories_v1',         store: 'stories' },
        { name: 'nexopa_dq_v1',         store: 'ops' },
      ];

      for (const target of dbTargets) {
        try {
          await this._purgeFromIDB(target.name, target.store, type, id);
        } catch (_) {}
      }
    }

    async _purgeFromIDB(dbName, storeName, type, id) {
      return new Promise((resolve) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve(); return; }
          try {
            const tx    = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const getAll = store.getAll();
            getAll.onsuccess = ge => {
              const items = ge.target.result || [];
              for (const item of items) {
                const itemId = item.id || item.localId || item.storyId;
                const itemType = item.type || item.queueType;
                if (String(itemId) === String(id) && (!itemType || itemType === type)) {
                  store.delete(item.id || item.key);
                }
                // Also check payload
                if (item.payload && String(item.payload.id || item.payload.localId) === String(id)) {
                  store.delete(item.id);
                }
              }
            };
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror    = () => { db.close(); resolve(); };
          } catch (_) { db.close(); resolve(); }
        };
        req.onerror = () => resolve();
      });
    }

    async _purgeServiceWorkerCache(type, id) {
      if (!window.caches) return;
      try {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const keys  = await cache.keys();
          for (const req of keys) {
            if (req.url.includes(id)) await cache.delete(req);
          }
        }
      } catch (_) {}
    }

    async _purgeInMemoryStores(type, id) {
      // Purge from Phase 4 story engine IDB
      if (type === 'status' || type === 'story') {
        window.__StatusStoryEngine?._store?.remove(id).catch(() => {});
      }

      // Purge from Phase 4 group presence
      if (type === 'group') {
        window.__GroupPresenceCacheEngine?._presence?.clearGroup?.(id);
      }

      // Purge from Phase 1 cache
      window.__CacheFoundationLayer?.invalidate(`${type}:${id}`);
      window.__CacheFoundationLayer?.invalidatePrefix?.(`${type}:`);

      // Mark deleted in Phase 1 persistence
      window.__PersistenceStabilizationLayer?.markDeleted(type, id);

      // Mark deleted in Phase 4 cache
      window.__GroupPresenceCacheEngine?._cache?.markDeleted(type, id);
    }

    async _purgeOfflineQueue(type, id) {
      // Remove any queued operations related to this entity
      const q = window.__OfflineMessageQueue;
      if (q) {
        for (const [opId, entry] of (q._queue || new Map())) {
          const payload = entry?.payload;
          if (payload && (payload.id === id || payload.localId === id ||
              payload.messageId === id || payload.storyId === id)) {
            await q.markDelivered(opId).catch(() => {});
          }
        }
      }

      const dq = window.__DurableQueueLayer;
      if (dq) {
        for (const [opId, op] of (dq._ops || new Map())) {
          const p = op?.payload;
          if (p && (p.id === id || p.localId === id)) {
            await dq.markDelivered(opId).catch(() => {});
          }
        }
      }
    }
  }

  // ─── CacheRepairEngine (main) ─────────────────────────────────────────────

  class CacheRepairEngine {
    constructor() {
      this._purger  = new DeletedEntityPurger();
      this._cleaner = new StorageLayerCleaner();
      this._pending = new Set(); // dedup concurrent purges
      this._started = false;
    }

    async start() {
      if (this._started) return;
      this._started = true;

      await this._purger.pruneOld();
      this._attachDeleteListeners();
      this._schedulePeriodicRepair();

      console.log('[CacheRepair] ✅ Started');
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Mark an entity as deleted and purge from ALL storage layers.
     */
    async purge(type, id) {
      const key = `${type}:${id}`;
      if (this._pending.has(key)) return;
      this._pending.add(key);

      try {
        await this._purger.markDeleted(type, id);
        await this._cleaner.purge(type, id);
        console.log(`[CacheRepair] Purged ${type}:${id} from all layers`);
      } finally {
        this._pending.delete(key);
      }
    }

    async isDeleted(type, id) {
      return this._purger.isDeleted(type, id);
    }

    /**
     * Run a full audit — purge all known-deleted entities from storage.
     */
    async runFullRepair() {
      const deleted = await this._purger.getAllDeleted();
      console.log(`[CacheRepair] Running full repair — ${deleted.length} deleted entities`);
      let repaired = 0;
      for (const { type, id } of deleted) {
        await this._cleaner.purge(type, id);
        repaired++;
      }
      return repaired;
    }

    getDiagnostics() {
      return {
        started:      this._started,
        pendingPurges: this._pending.size,
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _attachDeleteListeners() {
      // Listen for delete events from ALL sources
      const deletionEventMap = [
        { event: 'kyn:group:delete',    type: 'message',  idKey: 'messageId' },
        { event: 'kyn:message:deleted', type: 'message',  idKey: 'messageId' },
        { event: 'kyn:status:deleted',  type: 'status',   idKey: 'storyId' },
        { event: 'kyn:status:expired',  type: 'status',   idKey: null }, // statusIds array
        { event: 'kyn:group:deleted',   type: 'group',    idKey: 'groupId' },
        { event: 'kyn:friend:removed',  type: 'friend',   idKey: 'friendId' },
      ];

      for (const { event, type, idKey } of deletionEventMap) {
        window.addEventListener(event, e => {
          const data = e.detail || {};
          if (idKey) {
            const id = data[idKey] || data.id;
            if (id) this.purge(type, id);
          } else if (event.includes('expired') && Array.isArray(data.statusIds)) {
            data.statusIds.forEach(id => this.purge('status', id));
          }
        }, { passive: true });
      }

      // Listen via postMessage (cross-iframe deletions)
      window.addEventListener('message', e => {
        if (!e.data || typeof e.data !== 'object') return;
        const { type: msgType, messageId, groupId, storyId, friendId } = e.data;
        if (!msgType) return;
        if (msgType === 'MESSAGE_DELETED' && messageId) this.purge('message', messageId);
        if (msgType === 'GROUP_DELETED'   && groupId)   this.purge('group', groupId);
        if (msgType === 'STATUS_DELETED'  && storyId)   this.purge('status', storyId);
        if (msgType === 'FRIEND_REMOVED'  && friendId)  this.purge('friend', friendId);
      }, { passive: true });

      // Phase 1 persistence hooks
      const p1 = window.__PersistenceStabilizationLayer;
      if (p1 && p1.on) {
        // Note: Phase 1 does not emit, but we hook deletion through the EventBus
      }

      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_CONNECTED', () => {
          // On reconnect, run a repair pass to clean any stale restored data
          setTimeout(() => this.runFullRepair().catch(() => {}), 3000);
        });
      }
    }

    _schedulePeriodicRepair() {
      // Run repair every 30 minutes
      setInterval(() => {
        this.runFullRepair().catch(() => {});
        this._purger.pruneOld().catch(() => {});
      }, 30 * 60 * 1000);
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const engine = new CacheRepairEngine();
  engine.start().catch(e => console.warn('[CacheRepair] Start error:', e.message));

  window.__CacheRepairEngine = engine;
  window.CacheRepair         = engine;

  console.log('[CacheRepair] ✅ Ready');
})();
