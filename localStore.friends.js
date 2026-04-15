/**
 * localStore.friends.js  (Offline-First Edition)
 * IndexedDB-backed local store for friend relationships.
 * This is the single source of truth for the UI; server state is the authority
 * for final relationship status and is reconciled via friendSync.engine.js.
 *
 * Data Model (per spec):
 * {
 *   id: "local-uuid",
 *   serverId: null | number,
 *   userId: "currentUser",
 *   friendId: "targetUser",
 *   status: "none|pending_sent|pending_received|accepted|blocked|removed",
 *   createdAt: ISO timestamp,
 *   updatedAt: ISO timestamp,
 *   syncVersion: 1,
 *   isLocalOnly: boolean
 * }
 *
 * @version 1.0.0
 */

(function () {
    'use strict';

    const DB_NAME    = 'kynecta_friends_db';
    const DB_VERSION = 1;
    const STORE_NAME = 'friendships';

    // Valid status transitions (spec §DATA INTEGRITY RULES)
    const VALID_TRANSITIONS = {
        'none':             ['pending_sent'],
        'pending_sent':     ['accepted', 'removed', 'none'],
        'pending_received': ['accepted', 'removed'],
        'accepted':         ['removed', 'blocked'],
        'blocked':          ['none', 'accepted'],
        'removed':          ['pending_sent', 'none'],
    };

    // ── Utilities ──────────────────────────────────────────────────────────

    function generateLocalId() {
        return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function now() {
        return new Date().toISOString();
    }

    function isValidTransition(from, to) {
        const allowed = VALID_TRANSITIONS[from] || [];
        return allowed.includes(to);
    }

    // ── DB bootstrap ───────────────────────────────────────────────────────

    class FriendsLocalStore {
        constructor() {
            this._db      = null;
            this._ready   = false;
            this._readyP  = null;
            this._userId  = null;
            this._listeners = new Map(); // event → Set<callback>

            this._readyP = this._openDB();
            window.KynectaFriendsLocalStore = this;
            console.log('[FriendsLocalStore] Initializing…');
        }

        // ── Public: lifecycle ───────────────────────────────────────────────

        async ready() {
            return this._readyP;
        }

        setCurrentUser(userId) {
            this._userId = String(userId);
        }

        // ── Public: CRUD ────────────────────────────────────────────────────

        /**
         * Get all friendships for the current user.
         * @param {string} [status]  Optional filter
         * @returns {Promise<FriendRecord[]>}
         */
        async getAll(status = null) {
            await this.ready();
            const all = await this._getAll();
            const mine = all.filter(r => r.userId === this._userId || !this._userId);
            return status ? mine.filter(r => r.status === status) : mine;
        }

        /**
         * Get a single friendship by friendId.
         */
        async getByFriendId(friendId) {
            await this.ready();
            const all = await this._getAll();
            return all.find(r => r.friendId === String(friendId) &&
                                 (r.userId === this._userId || !this._userId)) || null;
        }

        /**
         * Get a friendship by its local id.
         */
        async getById(localId) {
            await this.ready();
            return this._get(localId);
        }

        /**
         * Get a friendship by serverId.
         */
        async getByServerId(serverId) {
            await this.ready();
            const all = await this._getAll();
            return all.find(r => r.serverId === serverId) || null;
        }

        /**
         * Create a new local friendship record.
         * Enforces one-per-pair (no duplicates).
         * @param {object} data  Partial FriendRecord
         * @returns {Promise<FriendRecord>}
         */
        async create(data) {
            await this.ready();
            if (!data.friendId) throw new Error('[FriendsLocalStore] friendId is required');

            // Enforce one-per-pair
            const existing = await this.getByFriendId(data.friendId);
            if (existing && existing.status !== 'none' && existing.status !== 'removed') {
                throw new Error(`[FriendsLocalStore] Friendship with ${data.friendId} already exists (status: ${existing.status})`);
            }

            const record = this._buildRecord(data);
            await this._put(record);
            this._emit('created', record);
            return record;
        }

        /**
         * Upsert: create or update a friendship.
         * If a record for this friendId already exists, it is merged.
         * Server wins for serverId and syncVersion.
         */
        async upsert(data) {
            await this.ready();
            if (!data.friendId) throw new Error('[FriendsLocalStore] friendId is required');

            let existing = null;
            if (data.id) existing = await this._get(data.id);
            if (!existing && data.serverId) existing = await this.getByServerId(data.serverId);
            if (!existing) existing = await this.getByFriendId(data.friendId);

            if (existing) {
                // Validate transition
                const newStatus = data.status || existing.status;
                if (newStatus !== existing.status && !isValidTransition(existing.status, newStatus)) {
                    console.warn(`[FriendsLocalStore] Invalid transition ${existing.status} → ${newStatus} for ${data.friendId}`);
                }
                const merged = {
                    ...existing,
                    ...data,
                    id: existing.id,                     // keep local id
                    userId: existing.userId,
                    updatedAt: now(),
                    syncVersion: Math.max(existing.syncVersion || 1, data.syncVersion || 1),
                };
                await this._put(merged);
                this._emit('updated', merged);
                return merged;
            } else {
                return this.create(data);
            }
        }

        /**
         * Update the status of a friendship by localId.
         * Validates the transition.
         */
        async updateStatus(localId, newStatus, extra = {}) {
            await this.ready();
            const record = await this._get(localId);
            if (!record) throw new Error(`[FriendsLocalStore] Record not found: ${localId}`);

            if (record.status !== newStatus && !isValidTransition(record.status, newStatus)) {
                throw new Error(`[FriendsLocalStore] Invalid transition ${record.status} → ${newStatus}`);
            }

            const updated = { ...record, ...extra, status: newStatus, updatedAt: now() };
            await this._put(updated);
            this._emit('statusChanged', updated, { from: record.status, to: newStatus });
            return updated;
        }

        /**
         * Mark a record as server-confirmed (isLocalOnly → false, serverId set).
         */
        async confirm(localId, serverId, serverData = {}) {
            await this.ready();
            const record = await this._get(localId);
            if (!record) throw new Error(`[FriendsLocalStore] Record not found: ${localId}`);
            const updated = {
                ...record,
                ...serverData,
                id: localId,
                serverId: serverId,
                isLocalOnly: false,
                updatedAt: now(),
            };
            await this._put(updated);
            this._emit('confirmed', updated);
            return updated;
        }

        /**
         * Soft-delete: marks status as 'removed'.
         */
        async remove(localId) {
            await this.ready();
            return this.updateStatus(localId, 'removed');
        }

        /**
         * Hard-delete: removes the record entirely.
         * Use only during sync reconciliation.
         */
        async hardDelete(localId) {
            await this.ready();
            const record = await this._get(localId);
            await this._delete(localId);
            if (record) this._emit('deleted', record);
        }

        /**
         * Replace ALL records for the current user with a server-authoritative list.
         * Used after a full sync. Local-only records are preserved and NOT overwritten.
         */
        async replaceFromServer(serverRecords) {
            await this.ready();
            // Keep all local-only records (not yet confirmed)
            const current = await this.getAll();
            const localOnlyRecords = current.filter(r => r.isLocalOnly);

            // Clear all server-side records for this user
            const all = await this._getAll();
            const toDelete = all.filter(r =>
                (r.userId === this._userId || !this._userId) && !r.isLocalOnly
            );
            for (const r of toDelete) await this._delete(r.id);

            // Insert server records
            for (const sr of serverRecords) {
                const record = this._buildRecord({
                    ...sr,
                    isLocalOnly: false,
                    syncVersion: sr.syncVersion || 1,
                });
                await this._put(record);
            }

            // Re-insert local-only records (they haven't been confirmed yet)
            for (const r of localOnlyRecords) {
                const conflict = serverRecords.find(sr =>
                    String(sr.friendId) === String(r.friendId) ||
                    (r.serverId && sr.serverId === r.serverId)
                );
                if (!conflict) {
                    await this._put(r); // preserve pending local changes
                }
            }

            this._emit('replaced', { count: serverRecords.length });
        }

        /**
         * Get count of unsynced (isLocalOnly) records.
         */
        async getPendingCount() {
            await this.ready();
            const all = await this.getAll();
            return all.filter(r => r.isLocalOnly).length;
        }

        // ── Public: queries ─────────────────────────────────────────────────

        async getFriends()          { return this.getAll('accepted'); }
        async getPendingSent()      { return this.getAll('pending_sent'); }
        async getPendingReceived()  { return this.getAll('pending_received'); }
        async getBlocked()          { return this.getAll('blocked'); }

        // ── Public: events ──────────────────────────────────────────────────

        on(event, callback) {
            if (!this._listeners.has(event)) this._listeners.set(event, new Set());
            this._listeners.get(event).add(callback);
            return () => this._listeners.get(event)?.delete(callback);
        }

        // ── Private: IndexedDB helpers ──────────────────────────────────────

        _openDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                        store.createIndex('byUserId',   'userId',   { unique: false });
                        store.createIndex('byFriendId', 'friendId', { unique: false });
                        store.createIndex('byServerId', 'serverId', { unique: false });
                        store.createIndex('byStatus',   'status',   { unique: false });
                        store.createIndex('byPair',     ['userId', 'friendId'], { unique: true });
                    }
                };

                request.onsuccess = (event) => {
                    this._db    = event.target.result;
                    this._ready = true;
                    console.log('[FriendsLocalStore] ✅ DB ready');
                    resolve(this._db);
                };

                request.onerror = (event) => {
                    console.error('[FriendsLocalStore] DB open error:', event.target.error);
                    reject(event.target.error);
                };
            });
        }

        _tx(mode = 'readonly') {
            return this._db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
        }

        _get(id) {
            return new Promise((resolve, reject) => {
                const req = this._tx().get(id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror   = () => reject(req.error);
            });
        }

        _getAll() {
            return new Promise((resolve, reject) => {
                const req = this._tx().getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror   = () => reject(req.error);
            });
        }

        _put(record) {
            return new Promise((resolve, reject) => {
                const req = this._tx('readwrite').put(record);
                req.onsuccess = () => resolve(record);
                req.onerror   = () => reject(req.error);
            });
        }

        _delete(id) {
            return new Promise((resolve, reject) => {
                const req = this._tx('readwrite').delete(id);
                req.onsuccess = () => resolve();
                req.onerror   = () => reject(req.error);
            });
        }

        _buildRecord(data) {
            return {
                id:          data.id          || generateLocalId(),
                serverId:    data.serverId    || null,
                userId:      data.userId      || this._userId || null,
                friendId:    String(data.friendId),
                status:      data.status      || 'none',
                createdAt:   data.createdAt   || now(),
                updatedAt:   data.updatedAt   || now(),
                syncVersion: data.syncVersion || 1,
                isLocalOnly: data.isLocalOnly !== undefined ? data.isLocalOnly : true,
                // Optional metadata
                category:    data.category    || null,
                note:        data.note        || null,
                displayName: data.displayName || null,
                username:    data.username    || null,
                avatar:      data.avatar      || null,
            };
        }

        _emit(event, data, extra = {}) {
            const payload = { event, data, extra, timestamp: Date.now() };
            // Internal listeners
            this._listeners.get(event)?.forEach(cb => {
                try { cb(data, extra); } catch (e) { console.error('[FriendsLocalStore] Listener error:', e); }
            });
            // Global event bus
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit(`FRIENDS_STORE_${event.toUpperCase()}`, payload);
            }
            // DOM event for loose coupling
            window.dispatchEvent(new CustomEvent('kyn:friendStore', { detail: payload }));
        }
    }

    // ── Bootstrap ────────────────────────────────────────────────────────────

    const store = new FriendsLocalStore();
    window.KynectaFriendsLocalStore = store;

    // Auto-assign userId when session is available
    const assignUserId = () => {
        const uid = window.__PARENT_SESSION__?.userId
            || window.AUTH_SESSION?.userId
            || window.KynectaStore?.get('user.id');
        if (uid) store.setCurrentUser(uid);
    };
    assignUserId();
    window.addEventListener('kyn:authReady', assignUserId);
    window.addEventListener('AUTH_READY', assignUserId);

    console.log('[FriendsLocalStore] ✅ Ready');
})();