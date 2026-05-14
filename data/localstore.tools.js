/**
 * localstore.tools.js — Offline-First Tool Storage
 * ─────────────────────────────────────────────────────────────────────────────────────
 */

(function (root, factory) {
    'use strict';
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.LocalStoreTools = factory();
        window.LocalStoreTools = root.LocalStoreTools;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const DB_NAME = 'KnectaToolsDB';
    const DB_VERSION = 2;
    const LS_PREFIX = 'knt_';

    const STORE_NAMES = {
        TOOLS: 'tools',
        DRAFTS: 'drafts',
        LISTINGS: 'listings',
        SAVED: 'saved',
        NOTES: 'notes',
        META: 'meta',
    };

    const _cache = {
        tools: new Map(),
        drafts: new Map(),
        listings: new Map(),
        saved: new Map(),
        notes: new Map(),
        meta: new Map(),
    };

    let _db = null;
    let _readyPromise = null;
    let _subscribers = new Set();

    function _openDB() {
        if (_db) return Promise.resolve(_db);
        if (_readyPromise) return _readyPromise;

        _readyPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.warn('[LocalStoreTools] IndexedDB not available');
                resolve(null);
                return;
            }
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = function(e) {
                const db = e.target.result;
                Object.values(STORE_NAMES).forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName, { keyPath: 'id' });
                    }
                });
            };

            req.onsuccess = function(e) {
                _db = e.target.result;
                _db.onversionchange = () => { _db.close(); _db = null; };
                _loadAllIntoCache().then(() => resolve(_db));
            };

            req.onerror = function() {
                console.error('[LocalStoreTools] IDB open error:', req.error);
                resolve(null);
            };
        });

        return _readyPromise;
    }

    async function _loadAllIntoCache() {
        for (const storeName of Object.values(STORE_NAMES)) {
            try {
                const items = await _idbGetAll(storeName);
                const map = _cache[storeName];
                if (map && Array.isArray(items)) items.forEach(item => map.set(item.id, item));
            } catch(e) {}
        }
        _hydrateFromLocalStorage();
        console.log('[LocalStoreTools] ✅ Cache hydrated');
    }

    function _hydrateFromLocalStorage() {
        for (const storeName of Object.values(STORE_NAMES)) {
            const raw = localStorage.getItem(LS_PREFIX + storeName + '_all');
            if (!raw) continue;
            try {
                const arr = JSON.parse(raw);
                const map = _cache[storeName];
                if (!Array.isArray(arr) || !map) continue;
                arr.forEach(item => {
                    if (item && item.id && !map.has(item.id)) map.set(item.id, item);
                });
            } catch(e) {}
        }
    }

    function _idbPut(storeName, item) {
        return new Promise((resolve, reject) => {
            if (!_db) { resolve(item); return; }
            try {
                const tx = _db.transaction(storeName, 'readwrite');
                const req = tx.objectStore(storeName).put(item);
                req.onsuccess = () => resolve(item);
                req.onerror = () => reject(req.error);
            } catch(e) { reject(e); }
        });
    }

    function _idbGet(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!_db) { resolve(null); return; }
            try {
                const tx = _db.transaction(storeName, 'readonly');
                const req = tx.objectStore(storeName).get(id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            } catch(e) { reject(e); }
        });
    }

    function _idbGetAll(storeName) {
        return new Promise((resolve, reject) => {
            if (!_db) { resolve([]); return; }
            try {
                const tx = _db.transaction(storeName, 'readonly');
                const req = tx.objectStore(storeName).getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            } catch(e) { reject(e); }
        });
    }

    function _idbDelete(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!_db) { resolve(); return; }
            try {
                const tx = _db.transaction(storeName, 'readwrite');
                const req = tx.objectStore(storeName).delete(id);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            } catch(e) { reject(e); }
        });
    }

    function _lsMirrorStore(storeName) {
        const map = _cache[storeName];
        if (!map) return;
        try {
            localStorage.setItem(LS_PREFIX + storeName + '_all', JSON.stringify(Array.from(map.values())));
        } catch(e) {}
    }

    function _lsSingle(storeName, id, value) {
        try {
            localStorage.setItem(LS_PREFIX + storeName + '_' + id, JSON.stringify(value));
        } catch(e) {}
    }

    function _lsRemoveSingle(storeName, id) {
        try {
            localStorage.removeItem(LS_PREFIX + storeName + '_' + id);
        } catch(e) {}
    }

    function _notify(event, storeName, item) {
        _subscribers.forEach(cb => { try { cb(event, storeName, item); } catch(e) {} });
        try {
            window.dispatchEvent(new CustomEvent('localStoreTools:change', { detail: { event, storeName, item } }));
        } catch(e) {}
    }

    function _setSyncStatus(status, label) {
        try {
            window.dispatchEvent(new CustomEvent('localStoreTools:syncStatus', { detail: { status, label } }));
        } catch(e) {}
    }

    const LocalStoreTools = {

        ready() { return _openDB(); },

        subscribe(callback) {
            _subscribers.add(callback);
            return () => _subscribers.delete(callback);
        },

        async saveToolLocal(item, storeName = STORE_NAMES.TOOLS) {
            if (!item || !item.id) {
                console.warn('[LocalStoreTools] saveToolLocal: item.id is required');
                return false;
            }
            _setSyncStatus('syncing', 'Saving…');

            try {
                await _openDB();
                const existing = _cache[storeName]?.get(item.id) || {};
                const merged = Object.assign({}, existing, item, { updatedAt: new Date().toISOString() });

                if (_cache[storeName]) _cache[storeName].set(merged.id, merged);
                await _idbPut(storeName, merged);
                _lsMirrorStore(storeName);
                _lsSingle(storeName, merged.id, merged);
                _notify('saved', storeName, merged);
                _setSyncStatus('saved', 'Saved ✓');

                return true;
            } catch(err) {
                console.error('[LocalStoreTools] saveToolLocal failed:', err);
                _setSyncStatus('offline', 'Save failed');

                try {
                    _lsSingle(storeName, item.id, item);
                    if (_cache[storeName]) _cache[storeName].set(item.id, item);
                    return true;
                } catch(e) { return false; }
            }
        },

        getToolLocal(id, storeName = STORE_NAMES.TOOLS) {
            if (_cache[storeName]?.has(id)) return _cache[storeName].get(id);
            try {
                const raw = localStorage.getItem(LS_PREFIX + storeName + '_' + id);
                return raw ? JSON.parse(raw) : null;
            } catch(e) { return null; }
        },

        async getToolLocalAsync(id, storeName = STORE_NAMES.TOOLS) {
            if (_cache[storeName]?.has(id)) return _cache[storeName].get(id);
            await _openDB();
            const item = await _idbGet(storeName, id);
            if (item && _cache[storeName]) _cache[storeName].set(item.id, item);
            return item;
        },

        getAllTools(storeName = STORE_NAMES.TOOLS) {
            const map = _cache[storeName];
            if (map && map.size > 0) return Array.from(map.values());
            try {
                const raw = localStorage.getItem(LS_PREFIX + storeName + '_all');
                return raw ? JSON.parse(raw) : [];
            } catch(e) { return []; }
        },

        async getAllToolsAsync(storeName = STORE_NAMES.TOOLS) {
            await _openDB();
            const items = await _idbGetAll(storeName);
            const map = _cache[storeName];
            if (map && Array.isArray(items)) items.forEach(i => map.set(i.id, i));
            _lsMirrorStore(storeName);
            return items;
        },

        async deleteToolLocal(id, storeName = STORE_NAMES.TOOLS) {
            if (_cache[storeName]) _cache[storeName].delete(id);
            _lsRemoveSingle(storeName, id);
            _lsMirrorStore(storeName);
            await _openDB();
            await _idbDelete(storeName, id);
            _notify('deleted', storeName, { id });
            return true;
        },

        saveListingLocal(listing) { return this.saveToolLocal(listing, STORE_NAMES.LISTINGS); },
        getListingLocal(id) { return this.getToolLocal(id, STORE_NAMES.LISTINGS); },
        getAllListings() { return this.getAllTools(STORE_NAMES.LISTINGS); },
        deleteListingLocal(id) { return this.deleteToolLocal(id, STORE_NAMES.LISTINGS); },

        saveDraftLocal(draft) { return this.saveToolLocal(draft, STORE_NAMES.DRAFTS); },
        getDraftLocal(id) { return this.getToolLocal(id, STORE_NAMES.DRAFTS); },
        getAllDrafts() { return this.getAllTools(STORE_NAMES.DRAFTS); },
        deleteDraftLocal(id) { return this.deleteToolLocal(id, STORE_NAMES.DRAFTS); },

        saveSavedItem(item) { return this.saveToolLocal(item, STORE_NAMES.SAVED); },
        getSavedItem(id) { return this.getToolLocal(id, STORE_NAMES.SAVED); },
        getAllSaved() { return this.getAllTools(STORE_NAMES.SAVED); },
        deleteSavedItem(id) { return this.deleteToolLocal(id, STORE_NAMES.SAVED); },

        saveNote(note) { return this.saveToolLocal(note, STORE_NAMES.NOTES); },
        getNote(id) { return this.getToolLocal(id, STORE_NAMES.NOTES); },
        getAllNotes() { return this.getAllTools(STORE_NAMES.NOTES); },
        deleteNote(id) { return this.deleteToolLocal(id, STORE_NAMES.NOTES); },

        setMeta(key, value) {
            const item = { id: key, value, updatedAt: new Date().toISOString() };
            return this.saveToolLocal(item, STORE_NAMES.META);
        },
        getMeta(key) {
            const item = this.getToolLocal(key, STORE_NAMES.META);
            return item ? item.value : null;
        },

        getCacheStats() {
            return Object.fromEntries(Object.entries(_cache).map(([k, v]) => [k, v.size]));
        },

        async verifyOfflineIntegrity(id, storeName = STORE_NAMES.TOOLS) {
            const report = {
                inMemoryCache: _cache[storeName]?.has(id),
                inLocalStorage: !!localStorage.getItem(LS_PREFIX + storeName + '_' + id),
                inIndexedDB: false,
                loadedBeforeServer: true,
            };
            try {
                await _openDB();
                const item = await _idbGet(storeName, id);
                report.inIndexedDB = !!item;
            } catch(e) {}
            const pass = report.inMemoryCache && report.inLocalStorage && report.inIndexedDB;
            return { ...report, pass };
        },

        async saveMany(items, storeName = STORE_NAMES.LISTINGS) {
            if (!Array.isArray(items)) return 0;
            let count = 0;
            for (const item of items) {
                if (item && item.id) {
                    await this.saveToolLocal(item, storeName);
                    count++;
                }
            }
            return count;
        },

        async mergeFromServer(serverItems, storeName = STORE_NAMES.LISTINGS) {
            if (!Array.isArray(serverItems)) return;
            for (const item of serverItems) {
                if (!item || !item.id) continue;
                const local = _cache[storeName]?.get(item.id);
                const merged = local
                    ? Object.assign({}, item, { isInstalled: local.isInstalled || item.isInstalled })
                    : item;
                await this.saveToolLocal(merged, storeName);
            }
        },

        STORES: STORE_NAMES,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => LocalStoreTools.ready());
    } else {
        LocalStoreTools.ready();
    }

    return LocalStoreTools;
}));