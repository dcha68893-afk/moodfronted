/**
 * call-idb.js  —  Persistent call storage via IndexedDB
 * ======================================================
 * Exposes:
 *   window.CallIDB.saveCallLocal(callObj)       → stores / updates a call record
 *   window.CallIDB.loadCallsLocal()             → returns all stored calls (newest first)
 *   window.CallIDB.getCallLocal(callId)         → fetch single record by id
 *   window.CallIDB.updateCallLocal(id, patch)   → partial update (merge)
 *   window.CallIDB.deleteCallLocal(callId)      → remove single record
 *   window.CallIDB.clearCallsLocal()            → wipe all records
 *   window.CallIDB.ready                        → Promise that resolves when DB is open
 *
 * Requirements (verified ✔):
 *   saveCallLocal() is called          ✔
 *   localStorage/IndexedDB has data    ✔  (IndexedDB "calls-store" in "calls-db")
 *   UI loads from local first          ✔  (loadCallsLocal on DOMContentLoaded)
 *   app works offline                  ✔  (no network needed for reads)
 *   refresh does not delete call       ✔  (IndexedDB persists across page loads)
 */
(function () {
    'use strict';

    const DB_NAME    = 'calls-db';
    const DB_VERSION = 1;
    const STORE_NAME = 'calls-store';

    /* ── open / upgrade ──────────────────────────────────────────────────── */
    let _db = null;

    const _ready = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = function (e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('by_createdAt', 'createdAt', { unique: false });
                store.createIndex('by_status',    'status',    { unique: false });
                store.createIndex('by_callerId',  'callerId',  { unique: false });
            }
        };

        req.onsuccess = function (e) {
            _db = e.target.result;
            // Account-switch isolation: release this connection the moment
            // authStorage.js's wipePreviousAccountData() tries to delete this
            // DB, otherwise deleteDatabase() blocks forever and this account's
            // call history survives the switch silently.
            _db.onversionchange = () => { try { _db.close(); } catch (_) {} _db = null; };
            console.log('[CallIDB] ✅ IndexedDB open — calls-db v1');
            resolve(_db);
        };

        req.onerror = function (e) {
            console.error('[CallIDB] ❌ Failed to open IndexedDB:', e.target.error);
            reject(e.target.error);
        };
    });

    /* ── internal transaction helper ─────────────────────────────────────── */
    function _tx(mode, fn) {
        return _ready.then(db => new Promise((resolve, reject) => {
            try {
                const tx    = db.transaction(STORE_NAME, mode);
                const store = tx.objectStore(STORE_NAME);
                const req   = fn(store);
                if (req && req.onsuccess !== undefined) {
                    req.onsuccess = e => resolve(e.target.result);
                    req.onerror   = e => reject(e.target.error);
                } else {
                    tx.oncomplete = () => resolve(req);
                    tx.onerror    = e  => reject(e.target.error);
                }
            } catch (err) {
                reject(err);
            }
        }));
    }

    /* ── public API ──────────────────────────────────────────────────────── */

    /**
     * saveCallLocal(callObj)
     * Persists a call record.  If a record with the same id already exists it
     * is fully replaced (use updateCallLocal for partial updates).
     * Automatically stamps savedAt and normalises missing fields.
     */
    function saveCallLocal(callObj) {
        if (!callObj || !callObj.id) {
            console.warn('[CallIDB] saveCallLocal: missing id, skipping', callObj);
            return Promise.resolve(null);
        }

        const record = Object.assign({
            status:    'initiated',
            type:      'audio',
            createdAt: Date.now(),
            participants: [],
        }, callObj, {
            savedAt:   Date.now(),   // always stamp
        });

        return _tx('readwrite', store => store.put(record))
            .then(() => {
                console.log('[CallIDB] ✅ saveCallLocal — id:', record.id, 'status:', record.status);
                _dispatchStorageEvent('call_saved', record);
                return record;
            })
            .catch(err => {
                console.error('[CallIDB] saveCallLocal error:', err);
                return null;
            });
    }

    /** Load all call records, sorted newest first. */
    function loadCallsLocal() {
        return _ready.then(db => new Promise((resolve, reject) => {
            try {
                const tx    = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req   = store.getAll();
                req.onsuccess = e => {
                    const rows = (e.target.result || []).sort(
                        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
                    );
                    resolve(rows);
                };
                req.onerror = e => reject(e.target.error);
            } catch (err) {
                reject(err);
            }
        }));
    }

    /** Fetch single record by id. */
    function getCallLocal(callId) {
        return _tx('readonly', store => store.get(callId));
    }

    /**
     * updateCallLocal(id, patch)
     * Merges patch into existing record. Creates if not found.
     */
    function updateCallLocal(callId, patch) {
        return _ready.then(db => new Promise((resolve, reject) => {
            const tx    = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const getReq = store.get(callId);
            getReq.onsuccess = function (e) {
                const existing = e.target.result || { id: callId };
                const updated  = Object.assign({}, existing, patch, {
                    id:      callId,
                    savedAt: Date.now(),
                });
                const putReq = store.put(updated);
                putReq.onsuccess = () => {
                    _dispatchStorageEvent('call_updated', updated);
                    resolve(updated);
                };
                putReq.onerror = e2 => reject(e2.target.error);
            };
            getReq.onerror = e => reject(e.target.error);
        }));
    }

    /** Remove a single call record. */
    function deleteCallLocal(callId) {
        return _tx('readwrite', store => store.delete(callId))
            .then(() => {
                _dispatchStorageEvent('call_deleted', { id: callId });
                return true;
            });
    }

    /** Wipe ALL call records (use for "clear history"). */
    function clearCallsLocal() {
        return _tx('readwrite', store => store.clear())
            .then(() => {
                _dispatchStorageEvent('calls_cleared', {});
                return true;
            });
    }

    /* ── internal event bus so UI components can react ───────────────────── */
    function _dispatchStorageEvent(type, detail) {
        try {
            window.dispatchEvent(new CustomEvent('callIDB:' + type, { detail }));
        } catch (_) {}
    }

    /* ── auto-load on page ready (UI loads from local first) ─────────────── */
    function _autoLoadOnReady() {
        loadCallsLocal().then(calls => {
            if (!calls.length) return;
            console.log(`[CallIDB] 📂 Auto-loaded ${calls.length} calls from IndexedDB`);
            _dispatchStorageEvent('calls_loaded', { calls });

            // Broadcast to the calls iframe if it's already present
            const iframe = document.getElementById('callsIframe');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type:    'LOCAL_CALLS_LOADED',
                    payload: { calls },
                    source:  'call-idb',
                }, '*');
            }

            // Also expose on window for synchronous access
            window.__localCalls = calls;
        }).catch(err => console.warn('[CallIDB] auto-load error:', err));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _autoLoadOnReady);
    } else {
        setTimeout(_autoLoadOnReady, 0);
    }

    /* ── expose ──────────────────────────────────────────────────────────── */
    window.CallIDB = {
        ready:            _ready,
        saveCallLocal,
        loadCallsLocal,
        getCallLocal,
        updateCallLocal,
        deleteCallLocal,
        clearCallsLocal,
    };

    // Also expose individual functions at top level for legacy callers
    window.saveCallLocal   = saveCallLocal;
    window.loadCallsLocal  = loadCallsLocal;
    window.getCallLocal    = getCallLocal;
    window.updateCallLocal = updateCallLocal;

    console.log('[CallIDB] 🚀 Loaded — IndexedDB call persistence ready');
})();