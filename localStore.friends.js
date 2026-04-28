/**
 * localStore.friends.js  (Offline-First Edition v2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Friends local storage built entirely on window.AppCache (app.cache.js).
 * No direct IndexedDB or localStorage access — all persistence goes through
 * the unified cache layer.
 *
 * Standard interface:
 *   getAll(status?)          — all (or filtered-by-status) friend records
 *   getById(id)              — single record by local id
 *   save(data)               — upsert (create or replace)
 *   update(id, patch)        — partial update
 *   delete(id)               — soft-delete (status → 'removed')
 *
 * Additional helpers (backwards-compatible):
 *   getByFriendId(friendId)
 *   getByServerId(serverId)
 *   create(data)
 *   upsert(data)
 *   updateStatus(localId, newStatus, extra)
 *   confirm(localId, serverId, serverData)
 *   remove(localId)           — soft-delete alias
 *   hardDelete(localId)       — physical removal
 *   replaceFromServer(records)
 *   getPendingCount()
 *   getFriends()              — accepted only
 *   getPendingSent()
 *   getPendingReceived()
 *   getBlocked()
 *   saveUsers(array)          — discovery cache
 *   getAllUsers()
 *   clearUsers()
 *   setCurrentUser(userId)
 *   on(event, callback)       — event subscription
 *
 * @version 2.0.0
 */
(function () {
  'use strict';

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function now() { return new Date().toISOString(); }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'friend_' + window.crypto.randomUUID();
    }
    return 'friend_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  /* ── Wait for AppCache ───────────────────────────────────────────────────── */
  function getCache() {
    if (window.AppCache) return Promise.resolve(window.AppCache);
    
    // Listen for cache ready event instead of polling
    return new Promise((resolve) => {
      const handleCacheReady = () => {
        if (window.AppCache) {
          resolve(window.AppCache);
        }
      };
      
      window.addEventListener('kyn:cacheReady', handleCacheReady, { once: true });
      
      // Fallback: check if AppCache becomes available within 2 seconds
      setTimeout(() => {
        if (window.AppCache) {
          window.removeEventListener('kyn:cacheReady', handleCacheReady);
          resolve(window.AppCache);
        } else {
          console.log('[FriendsLocalStore] AppCache not available, using localStorage fallback');
          resolve(null);
        }
      }, 2000);
    });
  }

  /* ── Main class ──────────────────────────────────────────────────────────── */
  class FriendsLocalStore {
    constructor() {
      this._userId        = null;
      this._listeners     = new Map();
      this._readyPromise  = this._init();
      window.KynectaFriendsLocalStore = this;
      console.log('[CACHE] Friends local store booting');
    }

    async _init() {
      const cache = await getCache();
      await cache.initDB();
      return this;
    }

    async ready() { return this._readyPromise; }

    setCurrentUser(userId) {
      this._userId = userId ? String(userId) : null;
    }

    /* ── Record normaliser ─────────────────────────────────────────────── */
    _normalizeRecord(data) {
      const record   = { ...(data || {}) };
      const friendId = String(record.friendId || record.id || record.userId || generateId());
      return {
        ...record,
        id:          String(record.id || friendId),
        friendId,
        userId:      String(record.userId || this._userId || 'unknown'),
        serverId:    record.serverId || null,
        status:      record.status   || 'none',
        createdAt:   record.createdAt || now(),
        updatedAt:   now(),
        syncVersion: record.syncVersion || 1,
        isLocalOnly: record.isLocalOnly !== false
      };
    }

    /* ── Private: all records for the current user ─────────────────────── */
    async _allForCurrentUser() {
      await this.ready();
      const cache = await getCache();
      const all   = await cache.getAll('friends');
      if (!this._userId) return all;
      return all.filter(r => String(r.userId) === String(this._userId));
    }

    /* ── Standard interface ────────────────────────────────────────────── */

    /** All friend records, optionally filtered by status. */
    async getAll(status) {
      const items = await this._allForCurrentUser();
      return status ? items.filter(i => i.status === status) : items;
    }

    /** Single record by local id. */
    async getById(localId) {
      await this.ready();
      const cache = await getCache();
      return cache.get('friends', String(localId));
    }

    /** Upsert a friend record. */
    async save(data) {
      const record = this._normalizeRecord(data);
      const cache  = await getCache();
      const saved  = await cache.save('friends', record);
      this._emit('updated', saved);
      return saved;
    }

    /** Partial update. */
    async update(id, patch) {
      const cache    = await getCache();
      const updated  = await cache.update('friends', String(id), { ...(patch || {}), updatedAt: now() });
      if (updated) this._emit('updated', updated);
      return updated;
    }

    /** Soft-delete by marking status = 'removed'. */
    async delete(id) {
      return this.updateStatus(id, 'removed');
    }

    /* ── Extended helpers ──────────────────────────────────────────────── */

    async getByFriendId(friendId) {
      const items = await this._allForCurrentUser();
      return items.find(i => String(i.friendId) === String(friendId)) || null;
    }

    async getByServerId(serverId) {
      const items = await this._allForCurrentUser();
      return items.find(i => String(i.serverId) === String(serverId)) || null;
    }

    async create(data) {
      const record = this._normalizeRecord(data);
      const cache  = await getCache();
      const saved  = await cache.save('friends', record);
      this._emit('created', saved);
      return saved;
    }

    async upsert(data) {
      const existing = data && data.id
        ? await this.getById(data.id)
        : await this.getByFriendId(data && data.friendId);
      const record   = this._normalizeRecord(existing ? { ...existing, ...data } : data);
      const cache    = await getCache();
      const saved    = await cache.save('friends', record);
      this._emit(existing ? 'updated' : 'created', saved);
      return saved;
    }

    async updateStatus(localId, newStatus, extra) {
      const cache   = await getCache();
      const updated = await cache.update('friends', String(localId), {
        status: newStatus, updatedAt: now(), ...(extra || {})
      });
      if (updated) this._emit('statusChanged', updated, { to: newStatus });
      return updated;
    }

    async confirm(localId, serverId, serverData) {
      const cache   = await getCache();
      const updated = await cache.update('friends', String(localId), {
        ...(serverData || {}), serverId, isLocalOnly: false, updatedAt: now()
      });
      if (updated) this._emit('confirmed', updated);
      return updated;
    }

    /** Soft-delete alias. */
    async remove(localId) { return this.updateStatus(localId, 'removed'); }

    /** Physical removal from store. */
    async hardDelete(localId) {
      await this.ready();
      const existing = await this.getById(localId);
      const cache    = await getCache();
      const result   = await cache.remove('friends', String(localId));
      if (result && existing) this._emit('deleted', existing);
      return result;
    }

    /**
     * Replace all non-local-only records with server data (preserves local-only).
     * @param {Array} serverRecords
     */
    async replaceFromServer(serverRecords) {
      const current  = await this._allForCurrentUser();
      const localOnly = current.filter(i => i.isLocalOnly === true);
      const cache    = await getCache();
      await Promise.all(
        current.filter(i => i.isLocalOnly !== true).map(i => cache.remove('friends', i.id))
      );
      const normalized = (serverRecords || []).map(i => this._normalizeRecord({ ...i, isLocalOnly: false }));
      await cache.save('friends', normalized);
      if (localOnly.length) await cache.save('friends', localOnly);
      this._emit('replaced', { count: (serverRecords || []).length });
    }

    async getPendingCount() {
      const items = await this._allForCurrentUser();
      return items.filter(i => i.isLocalOnly === true).length;
    }

    async getFriends()         { return this.getAll('accepted'); }
    async getPendingSent()     { return this.getAll('pending_sent'); }
    async getPendingReceived() { return this.getAll('pending_received'); }
    async getBlocked()         { return this.getAll('blocked'); }

    /* ── Users discovery cache ─────────────────────────────────────────── */

    async saveUsers(usersArray) {
      await this.ready();
      if (!Array.isArray(usersArray) || usersArray.length === 0) return;
      const cache   = await getCache();
      const records = usersArray
        .filter(u => u && u.id)
        .map(u => ({ ...u, id: String(u.id), userId: String(u.id), updatedAt: now() }));
      if (records.length > 0) {
        try {
          await cache.save('users', records);
          console.log('[CACHE] Users saved to IndexedDB:', records.length);
        } catch (e) {
          console.warn('[CACHE] saveUsers failed:', e.message);
        }
      }
    }

    async getAllUsers() {
      await this.ready();
      try {
        const cache = await getCache();
        const all   = await cache.getAll('users');
        return Array.isArray(all) ? all : [];
      } catch (_) {
        return [];
      }
    }

    async clearUsers() {
      await this.ready();
      try {
        const cache = await getCache();
        await cache.clear('users');
      } catch (_) {}
    }

    /* ── Event system ──────────────────────────────────────────────────── */

    on(event, callback) {
      if (!this._listeners.has(event)) this._listeners.set(event, new Set());
      this._listeners.get(event).add(callback);
      return () => {
        const set = this._listeners.get(event);
        if (set) set.delete(callback);
      };
    }

    _emit(event, data, extra) {
      extra = extra || {};
      const payload = { event, data, extra, timestamp: Date.now() };
      const listeners = this._listeners.get(event);
      if (listeners) {
        listeners.forEach(cb => { try { cb(data, extra); } catch (_) {} });
      }
      if (window.KynectaEventBus && typeof window.KynectaEventBus.emit === 'function') {
        window.KynectaEventBus.emit('FRIENDS_STORE_' + event.toUpperCase(), payload);
      }
      try {
        window.dispatchEvent(new CustomEvent('kyn:friendStore', { detail: payload }));
      } catch (_) {}
    }
  }

  /* ── Bootstrap ───────────────────────────────────────────────────────────── */
  const store = new FriendsLocalStore();

  function assignUserId() {
    const uid =
      (window.__PARENT_SESSION__ && window.__PARENT_SESSION__.userId) ||
      (window.AUTH_SESSION       && window.AUTH_SESSION.userId)       ||
      (window.KynectaStore       && typeof window.KynectaStore.get === 'function' && window.KynectaStore.get('user.id'));
    if (uid) store.setCurrentUser(uid);
  }

  assignUserId();
  window.addEventListener('kyn:authReady', assignUserId);
  window.addEventListener('AUTH_READY',    assignUserId);

  /* ── Expose globally ─────────────────────────────────────────────────────── */
  window.KynectaFriendsLocalStore = store;
  window.FriendsLocalStore        = store; // alias

  console.log('[CACHE] Friends local store ready');
})();