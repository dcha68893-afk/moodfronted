(function () {
    'use strict';

    function now() {
        return new Date().toISOString();
    }

    function generateId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return `friend_${window.crypto.randomUUID()}`;
        }
        return `friend_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    class FriendsLocalStore {
        constructor() {
            this._userId = null;
            this._listeners = new Map();
            this._readyPromise = this._init();
            window.KynectaFriendsLocalStore = this;
            console.log('[CACHE] Friends local store booting');
        }

        async _init() {
            if (window.AppCache && typeof window.AppCache.initDB === 'function') {
                await window.AppCache.initDB();
            }
            return this;
        }

        async ready() {
            return this._readyPromise;
        }

        setCurrentUser(userId) {
            this._userId = userId ? String(userId) : null;
        }

        _normalizeRecord(data) {
            const record = { ...(data || {}) };
            const friendId = String(record.friendId || record.id || record.userId || generateId());
            return {
                ...record,
                id: String(record.id || friendId),
                friendId,
                userId: String(record.userId || this._userId || 'unknown'),
                serverId: record.serverId || null,
                status: record.status || 'none',
                createdAt: record.createdAt || now(),
                updatedAt: now(),
                syncVersion: record.syncVersion || 1,
                isLocalOnly: record.isLocalOnly !== false
            };
        }

        async _allForCurrentUser() {
            await this.ready();
            const all = await window.AppCache.getAll('friends');
            if (!this._userId) return all;
            return all.filter((record) => String(record.userId) === String(this._userId));
        }

        async getAll(status = null) {
            const items = await this._allForCurrentUser();
            return status ? items.filter((item) => item.status === status) : items;
        }

        async getByFriendId(friendId) {
            const items = await this._allForCurrentUser();
            return items.find((item) => String(item.friendId) === String(friendId)) || null;
        }

        async getById(localId) {
            await this.ready();
            return window.AppCache.get('friends', String(localId));
        }

        async getByServerId(serverId) {
            const items = await this._allForCurrentUser();
            return items.find((item) => String(item.serverId) === String(serverId)) || null;
        }

        async create(data) {
            const record = this._normalizeRecord(data);
            const saved = await window.AppCache.save('friends', record);
            this._emit('created', saved);
            return saved;
        }

        async upsert(data) {
            const existing = data?.id
                ? await this.getById(data.id)
                : await this.getByFriendId(data.friendId);
            const record = this._normalizeRecord(existing ? { ...existing, ...data } : data);
            const saved = await window.AppCache.save('friends', record);
            this._emit(existing ? 'updated' : 'created', saved);
            return saved;
        }

        async updateStatus(localId, newStatus, extra = {}) {
            const updated = await window.AppCache.update('friends', String(localId), {
                status: newStatus,
                updatedAt: now(),
                ...extra
            });
            if (updated) this._emit('statusChanged', updated, { to: newStatus });
            return updated;
        }

        async confirm(localId, serverId, serverData = {}) {
            const updated = await window.AppCache.update('friends', String(localId), {
                ...serverData,
                serverId,
                isLocalOnly: false,
                updatedAt: now()
            });
            if (updated) this._emit('confirmed', updated);
            return updated;
        }

        async remove(localId) {
            return this.updateStatus(localId, 'removed');
        }

        async hardDelete(localId) {
            const existing = await this.getById(localId);
            const result = await window.AppCache.remove('friends', String(localId));
            if (result && existing) this._emit('deleted', existing);
            return result;
        }

        async replaceFromServer(serverRecords) {
            const current = await this._allForCurrentUser();
            const localOnly = current.filter((item) => item.isLocalOnly === true);
            await Promise.all(current.filter((item) => item.isLocalOnly !== true).map((item) => window.AppCache.remove('friends', item.id)));
            await window.AppCache.save('friends', (serverRecords || []).map((item) => this._normalizeRecord({ ...item, isLocalOnly: false })));
            await window.AppCache.save('friends', localOnly);
            this._emit('replaced', { count: (serverRecords || []).length });
        }

        async getPendingCount() {
            const items = await this._allForCurrentUser();
            return items.filter((item) => item.isLocalOnly === true).length;
        }

        async getFriends() { return this.getAll('accepted'); }
        async getPendingSent() { return this.getAll('pending_sent'); }
        async getPendingReceived() { return this.getAll('pending_received'); }
        async getBlocked() { return this.getAll('blocked'); }

        // ── Users store (discovery cache) ─────────────────────────────────
        // Persists the full user directory to IndexedDB so discovery works
        // offline after the first online load.

        /**
         * Save an array of users to the IndexedDB 'users' store.
         * Uses upsert semantics — existing records are overwritten.
         * @param {Array} usersArray
         */
        async saveUsers(usersArray) {
            await this.ready();
            if (!Array.isArray(usersArray) || usersArray.length === 0) return;
            const records = usersArray
                .filter(u => u && u.id)
                .map(u => ({
                    ...u,
                    id:        String(u.id),
                    userId:    String(u.id),
                    updatedAt: now(),
                }));
            if (records.length > 0) {
                try {
                    await window.AppCache.save('users', records);
                    console.log('[CACHE] Users saved to IndexedDB:', records.length);
                } catch (e) {
                    console.warn('[CACHE] saveUsers IndexedDB failed:', e.message);
                }
            }
        }

        /**
         * Retrieve all cached users from the IndexedDB 'users' store.
         * Returns an empty array when offline or no data available.
         * @returns {Promise<Array>}
         */
        async getAllUsers() {
            await this.ready();
            try {
                const all = await window.AppCache.getAll('users');
                return Array.isArray(all) ? all : [];
            } catch (_) {
                return [];
            }
        }

        /**
         * Delete all cached users from IndexedDB (call on logout).
         */
        async clearUsers() {
            await this.ready();
            try { await window.AppCache.clear('users'); } catch (_) {}
        }

        on(event, callback) {
            if (!this._listeners.has(event)) this._listeners.set(event, new Set());
            this._listeners.get(event).add(callback);
            return () => this._listeners.get(event)?.delete(callback);
        }

        _emit(event, data, extra = {}) {
            const payload = { event, data, extra, timestamp: Date.now() };
            (this._listeners.get(event) || []).forEach((callback) => {
                try { callback(data, extra); } catch (_error) {}
            });
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit(`FRIENDS_STORE_${event.toUpperCase()}`, payload);
            }
            window.dispatchEvent(new CustomEvent('kyn:friendStore', { detail: payload }));
        }
    }

    const store = new FriendsLocalStore();
    const assignUserId = () => {
        const uid = window.__PARENT_SESSION__?.userId || window.AUTH_SESSION?.userId || window.KynectaStore?.get('user.id');
        if (uid) store.setCurrentUser(uid);
    };
    assignUserId();
    window.addEventListener('kyn:authReady', assignUserId);
    window.addEventListener('AUTH_READY', assignUserId);
    console.log('[CACHE] Friends local store ready');
})();