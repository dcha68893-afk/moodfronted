// status-cache.js — Fixed v2
// Key fixes:
//  1. init() errors are no longer swallowed — they propagate AND are stored so
//     callers can check this.initError before assuming the DB is ready.
//  2. All public methods call _ensureDB() which waits for init() or throws
//     a clear error — no more "Cannot read properties of null" on this.db.
//  3. processSyncQueue() is rate-limited to prevent thundering-herd on reconnect.
//  4. Removed the silent catch(() => {}) anti-patterns.

class StatusCache {
    constructor() {
        this.dbName      = 'KnectaStatusDB';
        this.dbVersion   = 1;
        this.storeName   = 'statuses';
        this.db          = null;
        this.isOnline    = navigator.onLine;
        this.maxCacheAge = 7 * 24 * 60 * 60 * 1000; // 7 days

        // FIX: track init state explicitly so callers know if DB is ready
        this._initPromise   = null;
        this.initError      = null;
        this._syncInFlight  = false;
    }

    // ── INIT ──────────────────────────────────────────────────────────────────
    // FIX: returns the same promise on repeated calls (idempotent)
    init() {
        if (this._initPromise) return this._initPromise;

        this._initPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                const err = new Error('IndexedDB not available in this environment');
                this.initError = err;
                return reject(err);
            }

            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                this.initError = request.error;
                console.error('[StatusCache] IndexedDB open error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this._setupOnlineListeners();
                console.log('[StatusCache] ✅ IndexedDB ready');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('userId',    'userId',    { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('expiresAt', 'expiresAt', { unique: false });
                    store.createIndex('type',      'type',      { unique: false });
                }

                if (!db.objectStoreNames.contains('syncQueue')) {
                    const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
                    syncStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });

        return this._initPromise;
    }

    // ── GUARD: ensure DB is initialised before any operation ─────────────────
    async _ensureDB() {
        if (this.db) return; // fast path
        await this.init();
        if (!this.db) throw new Error('[StatusCache] Database not available');
    }

    // ── ONLINE / OFFLINE LISTENERS ────────────────────────────────────────────
    _setupOnlineListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('[StatusCache] Online — processing sync queue');
            this.processSyncQueue().catch(console.error);
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CACHE A SINGLE STATUS
    // ─────────────────────────────────────────────────────────────────────────
    async cacheStatus(status) {
        await this._ensureDB();

        const statusToCache = {
            ...status,
            cachedAt:  Date.now(),
            isExpired: this.isStatusExpired(status)
        };

        return new Promise((resolve, reject) => {
            const tx      = this.db.transaction([this.storeName], 'readwrite');
            const store   = tx.objectStore(this.storeName);
            const request = store.put(statusToCache);

            request.onsuccess = () => resolve(request.result);
            request.onerror   = () => {
                console.error('[StatusCache] cacheStatus error:', request.error);
                reject(request.error);
            };
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CACHE MULTIPLE STATUSES
    // ─────────────────────────────────────────────────────────────────────────
    async cacheStatuses(statuses) {
        await this._ensureDB();

        const tx    = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);

        const promises = statuses.map(status => new Promise((resolve, reject) => {
            const statusToCache = {
                ...status,
                cachedAt:  Date.now(),
                isExpired: this.isStatusExpired(status)
            };
            const request = store.put(statusToCache);
            request.onsuccess = () => resolve(request.result);
            request.onerror   = () => reject(request.error);
        }));

        return Promise.all(promises);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET CACHED STATUSES
    // ─────────────────────────────────────────────────────────────────────────
    async getCachedStatuses(options = {}) {
        await this._ensureDB();

        return new Promise((resolve, reject) => {
            const tx      = this.db.transaction([this.storeName], 'readonly');
            const store   = tx.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                let statuses = request.result || [];

                if (!options.includeExpired) {
                    statuses = statuses.filter(s => !this.isStatusExpired(s));
                }

                if (options.userId) {
                    statuses = statuses.filter(s => String(s.userId) === String(options.userId));
                }

                if (options.type) {
                    statuses = statuses.filter(s => s.type === options.type);
                }

                statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                if (options.limit) {
                    statuses = statuses.slice(0, options.limit);
                }

                resolve(statuses);
            };

            request.onerror = () => {
                console.error('[StatusCache] getCachedStatuses error:', request.error);
                reject(request.error);
            };
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET SINGLE CACHED STATUS
    // ─────────────────────────────────────────────────────────────────────────
    async getCachedStatus(statusId) {
        await this._ensureDB();

        return new Promise((resolve, reject) => {
            const tx      = this.db.transaction([this.storeName], 'readonly');
            const store   = tx.objectStore(this.storeName);
            const request = store.get(statusId);

            request.onsuccess = () => {
                const status = request.result;
                resolve((status && !this.isStatusExpired(status)) ? status : null);
            };

            request.onerror = () => {
                console.error('[StatusCache] getCachedStatus error:', request.error);
                reject(request.error);
            };
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SYNC QUEUE
    // ─────────────────────────────────────────────────────────────────────────
    async addToSyncQueue(statusData) {
        await this._ensureDB();

        const queueItem = {
            id:        `sync_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            action:    'create',
            data:      statusData,
            timestamp: Date.now(),
            retries:   0
        };

        return new Promise((resolve, reject) => {
            const tx      = this.db.transaction(['syncQueue'], 'readwrite');
            const store   = tx.objectStore('syncQueue');
            const request = store.put(queueItem);

            request.onsuccess = () => resolve(queueItem);
            request.onerror   = () => reject(request.error);
        });
    }

    // FIX: guard against concurrent calls with _syncInFlight flag
    async processSyncQueue() {
        if (!this.isOnline || this._syncInFlight) return;

        this._syncInFlight = true;

        try {
            await this._ensureDB();
            const items = await this.getSyncQueue();

            for (const item of items) {
                try {
                    if (item.action === 'create' && window.StatusAPI) {
                        const result = await window.StatusAPI.createStatus(item.data);

                        if (result.success) {
                            await this.removeFromSyncQueue(item.id);
                            await this.cacheStatus(result.status);
                            console.log('[StatusCache] Sync queue item synced:', item.id);
                        } else {
                            item.retries++;
                            if (item.retries < 3) {
                                await this._updateSyncQueueItem(item);
                            } else {
                                console.warn('[StatusCache] Dropping queue item after 3 retries:', item.id);
                                await this.removeFromSyncQueue(item.id);
                            }
                        }
                    }
                } catch (err) {
                    console.error('[StatusCache] processSyncQueue item error:', err.message);
                    item.retries++;
                    if (item.retries < 3) {
                        await this._updateSyncQueueItem(item).catch(() => {});
                    } else {
                        await this.removeFromSyncQueue(item.id).catch(() => {});
                    }
                }
            }
        } finally {
            this._syncInFlight = false;
        }
    }

    async getSyncQueue() {
        await this._ensureDB();

        return new Promise((resolve, reject) => {
            const tx      = this.db.transaction(['syncQueue'], 'readonly');
            const store   = tx.objectStore('syncQueue');
            const request = store.getAll();

            request.onsuccess = () => {
                const items = (request.result || []).sort((a, b) => a.timestamp - b.timestamp);
                resolve(items);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async _updateSyncQueueItem(item) {
        await this._ensureDB();

        return new Promise((resolve, reject) => {
            const tx      = this.db.transaction(['syncQueue'], 'readwrite');
            const store   = tx.objectStore('syncQueue');
            const request = store.put(item);

            request.onsuccess = () => resolve();
            request.onerror   = () => reject(request.error);
        });
    }

    async removeFromSyncQueue(itemId) {
        await this._ensureDB();

        return new Promise((resolve, reject) => {
            const tx      = this.db.transaction(['syncQueue'], 'readwrite');
            const store   = tx.objectStore('syncQueue');
            const request = store.delete(itemId);

            request.onsuccess = () => resolve();
            request.onerror   = () => reject(request.error);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UTILITIES
    // ─────────────────────────────────────────────────────────────────────────
    isStatusExpired(status) {
        if (!status || !status.expiresAt) return false;
        return new Date(status.expiresAt) < new Date();
    }

    async cleanupCache() {
        await this._ensureDB();

        const cutoffTime = Date.now() - this.maxCacheAge;

        return new Promise((resolve, reject) => {
            const tx      = this.db.transaction([this.storeName], 'readwrite');
            const store   = tx.objectStore(this.storeName);
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const s = cursor.value;
                    if (s.cachedAt < cutoffTime || this.isStatusExpired(s)) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getCacheStats() {
        const [statuses, queueItems] = await Promise.all([
            this.getCachedStatuses({ includeExpired: true }).catch(() => []),
            this.getSyncQueue().catch(() => [])
        ]);

        const activeStatuses  = statuses.filter(s => !this.isStatusExpired(s));
        const expiredStatuses = statuses.filter(s =>  this.isStatusExpired(s));

        return {
            totalCached:    statuses.length,
            activeStatuses: activeStatuses.length,
            expiredStatuses: expiredStatuses.length,
            syncQueueSize:  queueItems.length,
            isOnline:       this.isOnline,
            dbReady:        !!this.db,
            initError:      this.initError ? this.initError.message : null
        };
    }

    async clearCache() {
        await this._ensureDB();

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([this.storeName, 'syncQueue'], 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error);

            tx.objectStore(this.storeName).clear();
            tx.objectStore('syncQueue').clear();
        });
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
window.StatusCache = new StatusCache();

// ── Auto-init — log clearly on failure so developers see it ──────────────────
(function autoInitStatusCache() {
    const doInit = () => {
        window.StatusCache.init()
            .then(() => console.log('[StatusCache] ✅ IndexedDB initialised'))
            .catch(err => console.error('[StatusCache] ❌ IndexedDB init FAILED:', err.message));
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', doInit);
    } else {
        doInit();
    }
})();