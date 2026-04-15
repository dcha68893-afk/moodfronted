/**
 * localStore.calls.js
 * Local-first call history storage using IndexedDB with localStorage fallback.
 * NEVER stores active call sessions — only completed call history records.
 * @version 1.0.0
 */

(function () {
    'use strict';

    const DB_NAME    = 'kynecta_calls_db';
    const DB_VERSION = 1;
    const STORE_NAME = 'call_history';
    const LS_KEY     = 'kynecta_call_history_fallback';
    const MAX_RECORDS = 500;

    // ── Minimal UUID generator (no crypto dependency) ────────────────────────
    function generateLocalId() {
        return 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    // ── IndexedDB wrapper ────────────────────────────────────────────────────
    class CallHistoryDB {
        constructor() {
            this._db   = null;
            this._ready = false;
            this._queue = [];
            this._fallback = false;
            this._init();
        }

        _init() {
            if (!window.indexedDB) {
                console.warn('[CallLocalStore] IndexedDB unavailable — using localStorage fallback');
                this._fallback = true;
                this._ready    = true;
                this._drainQueue();
                return;
            }

            const req = window.indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db    = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('by_status',    'status',    { unique: false });
                    store.createIndex('by_startedAt', 'startedAt', { unique: false });
                    store.createIndex('by_callerId',  'callerId',  { unique: false });
                    store.createIndex('by_receiverId','receiverId',{ unique: false });
                }
            };

            req.onsuccess = (e) => {
                this._db    = e.target.result;
                this._ready = true;
                console.log('[CallLocalStore] ✅ IndexedDB ready');
                this._drainQueue();
            };

            req.onerror = (e) => {
                console.warn('[CallLocalStore] IndexedDB open failed — falling back to localStorage', e.target.error);
                this._fallback = true;
                this._ready    = true;
                this._drainQueue();
            };
        }

        _drainQueue() {
            while (this._queue.length) {
                const { fn, resolve, reject } = this._queue.shift();
                fn().then(resolve).catch(reject);
            }
        }

        _exec(fn) {
            if (this._ready) return fn();
            return new Promise((resolve, reject) => {
                this._queue.push({ fn, resolve, reject });
            });
        }

        // ── localStorage fallback helpers ────────────────────────────────────
        _lsLoad() {
            try {
                const raw = localStorage.getItem(LS_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch { return []; }
        }

        _lsSave(records) {
            try {
                // Trim to MAX_RECORDS
                const trimmed = records.slice(-MAX_RECORDS);
                localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
            } catch (e) {
                console.warn('[CallLocalStore] localStorage save failed', e.message);
            }
        }

        // ── Public CRUD API ──────────────────────────────────────────────────

        /**
         * Save or update a call record.
         * If record.id already exists it is fully replaced (upsert).
         */
        save(record) {
            return this._exec(() => {
                if (!record || !record.id) {
                    return Promise.reject(new Error('Record must have an id'));
                }
                // Ensure required fields have defaults
                const normalized = {
                    id:          record.id,
                    serverId:    record.serverId    || null,
                    callerId:    record.callerId    || null,
                    receiverId:  record.receiverId  || null,
                    type:        record.type        || 'audio',
                    status:      record.status      || 'initiated',
                    duration:    record.duration    || 0,
                    startedAt:   record.startedAt   || null,
                    endedAt:     record.endedAt     || null,
                    isLocalOnly: record.isLocalOnly !== false,
                    isGroupCall: record.isGroupCall || false,
                    participants:record.participants|| [],
                    callerName:  record.callerName  || null,
                    callerAvatar:record.callerAvatar|| null,
                    createdAt:   record.createdAt   || Date.now(),
                    updatedAt:   Date.now(),
                    metadata:    record.metadata    || {}
                };

                if (this._fallback) {
                    const records = this._lsLoad();
                    const idx     = records.findIndex(r => r.id === normalized.id);
                    if (idx >= 0) records[idx] = normalized;
                    else          records.push(normalized);
                    this._lsSave(records);
                    return Promise.resolve(normalized);
                }

                return new Promise((resolve, reject) => {
                    const tx  = this._db.transaction(STORE_NAME, 'readwrite');
                    const req = tx.objectStore(STORE_NAME).put(normalized);
                    req.onsuccess = () => resolve(normalized);
                    req.onerror   = (e) => reject(e.target.error);
                });
            });
        }

        /**
         * Get a single call record by local id.
         */
        getById(id) {
            return this._exec(() => {
                if (this._fallback) {
                    const found = this._lsLoad().find(r => r.id === id) || null;
                    return Promise.resolve(found);
                }
                return new Promise((resolve, reject) => {
                    const tx  = this._db.transaction(STORE_NAME, 'readonly');
                    const req = tx.objectStore(STORE_NAME).get(id);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror   = (e) => reject(e.target.error);
                });
            });
        }

        /**
         * Get recent call history, newest first.
         * @param {Object} options  { limit, status, callerId, receiverId }
         */
        getHistory(options = {}) {
            const limit = options.limit || 100;

            return this._exec(() => {
                if (this._fallback) {
                    let records = this._lsLoad();
                    if (options.status)     records = records.filter(r => r.status === options.status);
                    if (options.callerId)   records = records.filter(r => r.callerId   == options.callerId);
                    if (options.receiverId) records = records.filter(r => r.receiverId == options.receiverId);
                    records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                    return Promise.resolve(records.slice(0, limit));
                }

                return new Promise((resolve, reject) => {
                    const tx      = this._db.transaction(STORE_NAME, 'readonly');
                    const store   = tx.objectStore(STORE_NAME);
                    const results = [];
                    const req     = store.index('by_startedAt').openCursor(null, 'prev');

                    req.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (!cursor || results.length >= limit) {
                            resolve(results);
                            return;
                        }
                        const r = cursor.value;
                        let match = true;
                        if (options.status     && r.status     !== options.status)       match = false;
                        if (options.callerId   && r.callerId   != options.callerId)      match = false;
                        if (options.receiverId && r.receiverId != options.receiverId)    match = false;
                        if (match) results.push(r);
                        cursor.continue();
                    };
                    req.onerror = (e) => reject(e.target.error);
                });
            });
        }

        /**
         * Get all missed calls for a userId that have not been read.
         */
        getMissedCalls(userId) {
            return this._exec(async () => {
                const all = await this.getHistory({ status: 'missed', receiverId: userId });
                return all.filter(r => !r.readAt);
            });
        }

        /**
         * Mark a call as read (seen by receiver).
         */
        markAsRead(id) {
            return this._exec(async () => {
                const record = await this.getById(id);
                if (!record) return null;
                record.readAt    = Date.now();
                record.updatedAt = Date.now();
                return this.save(record);
            });
        }

        /**
         * Update only specific fields on a call record.
         */
        updateFields(id, fields) {
            return this._exec(async () => {
                const record = await this.getById(id);
                if (!record) {
                    // Create minimal record if not found
                    return this.save({ id, ...fields });
                }
                return this.save({ ...record, ...fields, id });
            });
        }

        /**
         * Delete a call record by id.
         */
        delete(id) {
            return this._exec(() => {
                if (this._fallback) {
                    const records = this._lsLoad().filter(r => r.id !== id);
                    this._lsSave(records);
                    return Promise.resolve(true);
                }
                return new Promise((resolve, reject) => {
                    const tx  = this._db.transaction(STORE_NAME, 'readwrite');
                    const req = tx.objectStore(STORE_NAME).delete(id);
                    req.onsuccess = () => resolve(true);
                    req.onerror   = (e) => reject(e.target.error);
                });
            });
        }

        /**
         * Clear ALL call history (used for logout / data reset).
         */
        clearAll() {
            return this._exec(() => {
                if (this._fallback) {
                    localStorage.removeItem(LS_KEY);
                    return Promise.resolve(true);
                }
                return new Promise((resolve, reject) => {
                    const tx  = this._db.transaction(STORE_NAME, 'readwrite');
                    const req = tx.objectStore(STORE_NAME).clear();
                    req.onsuccess = () => resolve(true);
                    req.onerror   = (e) => reject(e.target.error);
                });
            });
        }

        /**
         * Count total records.
         */
        count() {
            return this._exec(() => {
                if (this._fallback) {
                    return Promise.resolve(this._lsLoad().length);
                }
                return new Promise((resolve, reject) => {
                    const tx  = this._db.transaction(STORE_NAME, 'readonly');
                    const req = tx.objectStore(STORE_NAME).count();
                    req.onsuccess = () => resolve(req.result);
                    req.onerror   = (e) => reject(e.target.error);
                });
            });
        }

        /**
         * Prune oldest records to stay under MAX_RECORDS.
         */
        prune() {
            return this._exec(async () => {
                const total = await this.count();
                if (total <= MAX_RECORDS) return 0;

                const toDelete = total - MAX_RECORDS;

                if (this._fallback) {
                    const records = this._lsLoad();
                    records.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
                    const pruned = records.splice(0, toDelete);
                    this._lsSave(records);
                    return pruned.length;
                }

                // Get oldest records by startedAt
                const oldest = await new Promise((resolve, reject) => {
                    const tx      = this._db.transaction(STORE_NAME, 'readonly');
                    const results = [];
                    const req     = tx.objectStore(STORE_NAME).index('by_startedAt').openCursor(null, 'next');
                    req.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (!cursor || results.length >= toDelete) { resolve(results); return; }
                        results.push(cursor.value.id);
                        cursor.continue();
                    };
                    req.onerror = (e) => reject(e.target.error);
                });

                await Promise.all(oldest.map(id => this.delete(id)));
                return oldest.length;
            });
        }
    }

    // ── Singleton ────────────────────────────────────────────────────────────
    const db = new CallHistoryDB();

    /**
     * Public API — window.KynectaCallLocalStore
     */
    window.KynectaCallLocalStore = {
        /**
         * Create a new local call record (status = 'initiated').
         * Returns the saved record with a generated local id.
         */
        createCall(data = {}) {
            const record = {
                id:          generateLocalId(),
                serverId:    data.serverId    || null,
                callerId:    data.callerId    || null,
                receiverId:  data.receiverId  || null,
                type:        data.type        || 'audio',
                status:      'initiated',
                duration:    0,
                startedAt:   null,
                endedAt:     null,
                isLocalOnly: true,
                isGroupCall: data.isGroupCall || false,
                participants:data.participants|| [],
                callerName:  data.callerName  || null,
                callerAvatar:data.callerAvatar|| null,
                createdAt:   Date.now(),
                updatedAt:   Date.now(),
                metadata:    data.metadata    || {}
            };
            return db.save(record);
        },

        /** Save / update any call record. */
        save: (record)        => db.save(record),

        /** Get by local id. */
        getById: (id)         => db.getById(id),

        /** Get history with optional filters. */
        getHistory: (opts)    => db.getHistory(opts),

        /** Get all missed, unread calls for a userId. */
        getMissedCalls: (uid) => db.getMissedCalls(uid),

        /** Mark call as read. */
        markAsRead: (id)      => db.markAsRead(id),

        /** Patch specific fields only. */
        updateFields: (id, fields) => db.updateFields(id, fields),

        /** Update the status of a call and compute duration if ending. */
        async updateStatus(id, status, extra = {}) {
            const record = await db.getById(id);
            if (!record) return db.save({ id, status, ...extra, updatedAt: Date.now() });

            const patch = { status, updatedAt: Date.now(), ...extra };

            if (status === 'connected' && !record.startedAt) {
                patch.startedAt = Date.now();
            }
            if (['ended', 'missed', 'rejected', 'failed', 'cancelled'].includes(status)) {
                patch.endedAt = patch.endedAt || Date.now();
                if (record.startedAt && !extra.duration) {
                    patch.duration = Math.floor((patch.endedAt - record.startedAt) / 1000);
                }
            }
            return db.save({ ...record, ...patch });
        },

        /** Attach the real server-side UUID after backend confirms. */
        async linkServerId(localId, serverId) {
            return db.updateFields(localId, { serverId, isLocalOnly: false });
        },

        /** Delete a call record. */
        delete: (id)  => db.delete(id),

        /** Clear all history (logout). */
        clearAll: ()  => db.clearAll(),

        /** Prune oldest records. */
        prune: ()     => db.prune(),

        /** Count total. */
        count: ()     => db.count(),

        /** Generate a new local ID (useful externally). */
        generateId: () => generateLocalId()
    };

    console.log('[CallLocalStore] ✅ Initialized');
})();