/**
 * app.sync.manager.js  (Offline-First Edition v2.3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates background data synchronisation.
 *
 * Design principles:
 *   ✅ Sync NEVER called during startup / UI render
 *   ✅ Sync NEVER blocks the UI — runs entirely in background
 *   ✅ Uses merge strategy (not replace-all) when writing to AppCache
 *   ✅ Delegates specialised work to dedicated engines
 *   ✅ Respects navigator.onLine before every network call
 *   ✅ Safe no-op when offline (silent, no errors shown)
 *
 * @version 2.3.0
 */
(function () {
  'use strict';

  if (window.KynectaSync) return; // singleton guard

  /* ── Config ──────────────────────────────────────────────────────────────── */
  const SYNC_CONFIG = {
    autoSync:        false,
    syncInterval:    30000,
    retryDelay:      5000,
    maxRetries:      3,
    syncOnReconnect: true,
    syncOnLogin:     true,
    batchSize:       100,
    conflictStrategy:'server-wins'
  };

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function getCache() {
    return window.AppCache || window.KynectaCache || null;
  }

  /* ── Sync manager ────────────────────────────────────────────────────────── */
  class KynectaSyncManager {
    constructor() {
      this._isSyncing    = false;
      this._lastSync     = 0;
      this._retryCount   = 0;
      this._syncTimer    = null;
      this._pendingSyncs = new Map();
      this._conflicts    = [];
      this._stats = {
        totalSyncs: 0, successfulSyncs: 0, failedSyncs: 0,
        conflicts: 0, lastSyncDuration: 0, syncedItems: 0
      };

      this._setupEventListeners();
      if (SYNC_CONFIG.autoSync) this.startAutoSync();

      window.KynectaSync = this;
      console.log('[Sync] ✅ Manager initialized (offline-first v2.3)');
    }

    /* ── Public API ────────────────────────────────────────────────────── */

    startAutoSync(interval) {
      if (this._syncTimer) clearInterval(this._syncTimer);
      this._syncTimer = setInterval(() => this.syncAll(), interval || SYNC_CONFIG.syncInterval);
    }

    stopAutoSync() {
      if (this._syncTimer) { clearInterval(this._syncTimer); this._syncTimer = null; }
    }

    /**
     * Synchronise all data types in the background.
     * Always resolves — never throws to the caller.
     */
    async syncAll() {
      // Guard: prevent concurrent runs
      const guard = typeof KynSyncGuard !== 'undefined' ? KynSyncGuard : null;
      if (guard) {
        if (!guard.acquire('syncAll')) {
          return this._waitForCurrentSync();
        }
      } else {
        if (this._isSyncing) return this._waitForCurrentSync();
      }

      // Hard gate: never sync while offline
      if (!navigator.onLine) {
        if (guard) guard.release('syncAll');
        return { success: false, reason: 'offline' };
      }

      this._isSyncing = true;
      let releaseGuard = true;
      this._stats.totalSyncs++;
      const startTime = Date.now();

      try {
        this._emitSyncEvent('SYNC_STARTED');

        const userId = this._getCurrentUserId();
        if (!userId) throw new Error('No authenticated user');

        /* ── Delegate to dedicated sync engines ─────────────────────── */

        // Messages
        const msgEngine = window.KynectaSyncEngine;
        if (msgEngine && typeof msgEngine.syncAll === 'function') {
          await this._safeDelegate(() => msgEngine.syncAll(), 'KynectaSyncEngine');
        }

        // Friends
        const friendEngine = window.KynectaFriendSyncEngine;
        if (friendEngine && typeof friendEngine.syncAll === 'function') {
          await this._safeDelegate(() => friendEngine.syncAll(), 'KynectaFriendSyncEngine');
        }

        // Groups
        const groupEngine = window.GroupSyncEngine;
        if (groupEngine && typeof groupEngine.syncAll === 'function') {
          await this._safeDelegate(() => groupEngine.syncAll(), 'GroupSyncEngine');
        }

        // Group offline queue
        const groupQueue = window.GroupQueueManager;
        if (groupQueue && typeof groupQueue.pendingCount === 'function' && groupQueue.pendingCount() > 0) {
          await this._safeDelegate(() => groupQueue.processNow(), 'GroupQueueManager');
        }

        /* ── Fallback sync for engines not present ────────────────────── */
        await Promise.allSettled([
          friendEngine ? null : this._syncFriends(),
          groupEngine  ? null : this._syncGroups(),
          this._syncStatus(),
          this._syncSettings()
        ].filter(Boolean));

        /* ── Flush offline queues ────────────────────────────────────── */

        // Message queue
        const msgQueue = window.KynectaMsgQueue;
        if (msgQueue && typeof msgQueue.processAll === 'function') {
          await this._safeDelegate(() => msgQueue.processAll(), 'KynectaMsgQueue');
        }

        // Friend action queue
        const friendQueue = window.KynectaFriendQueue;
        if (friendQueue && typeof friendQueue.pendingCount === 'function' && friendQueue.pendingCount() > 0) {
          await this._safeDelegate(() => friendQueue.flush(), 'KynectaFriendQueue');
        }

        // App-level offline queue (non-message items)
        await this._processOfflineQueue();

        /* ── Finalise ─────────────────────────────────────────────────── */
        this._lastSync = Date.now();
        this._retryCount = 0;
        this._stats.successfulSyncs++;
        this._stats.lastSyncDuration = Date.now() - startTime;

        this._emitSyncEvent('SYNC_COMPLETED', { duration: this._stats.lastSyncDuration });

        if (window.KynectaStore) window.KynectaStore.set('sync.lastSync', this._lastSync);

        return { success: true, lastSync: this._lastSync };

      } catch (err) {
        this._stats.failedSyncs++;
        this._retryCount++;
        const msg = err && err.message ? err.message : String(err);
        console.error('[Sync] syncAll error:', msg);

        this._emitSyncEvent('SYNC_FAILED', { error: msg, retryCount: this._retryCount });

        if (this._retryCount <= SYNC_CONFIG.maxRetries && navigator.onLine) {
          const delay = SYNC_CONFIG.retryDelay * this._retryCount;
          console.warn('[Sync] Retry ' + this._retryCount + '/' + SYNC_CONFIG.maxRetries + ' in ' + delay + 'ms');
          releaseGuard = false;
          setTimeout(() => {
            this._isSyncing = false;
            if (typeof KynSyncGuard !== 'undefined') KynSyncGuard.release('syncAll');
            this.syncAll();
          }, delay);
          return { success: false, error: msg, retryCount: this._retryCount };
        }

        return { success: false, error: msg, retryCount: this._retryCount };

      } finally {
        this._isSyncing = false;
        if (releaseGuard && typeof KynSyncGuard !== 'undefined') KynSyncGuard.release('syncAll');
      }
    }

    /**
     * Sync a single data type.
     */
    async syncType(type) {
      if (!navigator.onLine) return { success: false, reason: 'offline' };
      const since = this._lastSync || 0;
      switch (type) {
        case 'messages': {
          const e = window.KynectaSyncEngine;
          return e ? this._safeDelegate(() => e.syncAll(), 'KynectaSyncEngine') : this._syncMessages(since);
        }
        case 'friends': {
          const e = window.KynectaFriendSyncEngine;
          return e ? this._safeDelegate(() => e.syncAll(), 'KynectaFriendSyncEngine') : this._syncFriends(since);
        }
        case 'groups': {
          const e = window.GroupSyncEngine;
          return e ? this._safeDelegate(() => e.syncAll(), 'GroupSyncEngine') : this._syncGroups(since);
        }
        case 'status':   return this._syncStatus(since);
        case 'settings': return this._syncSettings();
        default: throw new Error('Unknown sync type: ' + type);
      }
    }

    queueForSync(type, action, data) {
      const id = 'sync_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      // Persist in AppCache syncQueue
      const cache = getCache();
      if (cache && typeof cache.save === 'function') {
        cache.save('syncQueue', {
          id, type, action, data,
          status:    'pending',
          timestamp: Date.now(),
          retries:   0
        }).catch(() => {});
      }
      if (!this._isSyncing && navigator.onLine) this.syncAll().catch(() => {});
      return id;
    }

    getStatus() {
      return {
        isSyncing:    this._isSyncing,
        lastSync:     this._lastSync,
        retryCount:   this._retryCount,
        stats:        { ...this._stats },
        pendingSyncs: this._pendingSyncs.size,
        conflicts:    this._conflicts.length
      };
    }

    resolveConflict(conflictId, resolution, resolvedData) {
      const conflict = this._conflicts.find(c => c.id === conflictId);
      if (!conflict) return false;
      if (resolution === 'accept-server')      this._applyServerData(conflict);
      else if (resolution === 'accept-client') this._applyClientData(conflict);
      else if (resolution === 'custom' && resolvedData) this._applyResolvedData(conflict, resolvedData);
      this._conflicts = this._conflicts.filter(c => c.id !== conflictId);
      return true;
    }

    /* ── Private sync methods ───────────────────────────────────────────── */

    /** Wrap a delegate call so it never throws into the main sync loop. */
    async _safeDelegate(fn, name) {
      try { return await fn(); }
      catch (err) { console.warn('[Sync] Delegate ' + name + ' failed:', err && err.message ? err.message : err); }
    }

    /**
     * Legacy message sync — no-op because messageSync.engine.js owns this.
     * Backend /api/messages requires chatId, so a global pull would 400.
     */
    async _syncMessages() {
      return { success: true, skipped: true, reason: 'use-messageSyncEngine' };
    }

    /**
     * Friends sync — merge strategy: preserves local-only records.
     */
    async _syncFriends(since) {
      if (!navigator.onLine) return;
      since = since || this._lastSync;
      try {
        const params   = new URLSearchParams({ since, limit: SYNC_CONFIG.batchSize });
        const response = await this._makeRequest('GET', '/api/friends?' + params);
        const friends  = (response && (response.data && (response.data.friends || response.data)) || response.friends) || [];

        if (Array.isArray(friends) && friends.length > 0) {
          this._stats.syncedItems += friends.length;

          // Merge into AppCache (preserves local-only records)
          const cache = getCache();
          if (cache && typeof cache.mergeFromServer === 'function') {
            await cache.mergeFromServer('friends', friends).catch(() => {});
          }

          // Update KynectaStore
          if (window.KynectaStore) window.KynectaStore.set('friends.list', friends);
          this._emitSyncEvent('FRIENDS_SYNCED', friends);
        }
        return { success: true, data: friends };
      } catch (err) {
        console.warn('[Sync] friends sync failed:', err && err.message ? err.message : err);
      }
    }

    /**
     * Groups sync — merge strategy, delegates to GroupSyncEngine if present.
     */
    async _syncGroups(since) {
      if (!navigator.onLine) return;
      since = since || this._lastSync;

      const groupEngine = window.GroupSyncEngine;
      if (groupEngine && typeof groupEngine.syncAll === 'function') {
        try { await groupEngine.syncAll(); return { success: true, source: 'GroupSyncEngine' }; }
        catch (err) { console.warn('[Sync] GroupSyncEngine failed, using legacy:', err && err.message); }
      }

      try {
        const params   = new URLSearchParams({ since, limit: SYNC_CONFIG.batchSize });
        const response = await this._makeRequest('GET', '/api/groups?' + params);
        const groups   = (response && (response.data && (response.data.groups || response.data)) || response.groups) || [];

        if (Array.isArray(groups) && groups.length > 0) {
          this._stats.syncedItems += groups.length;

          // Merge — do not overwrite local-only / unsync'd records
          const cache = getCache();
          if (cache && typeof cache.mergeFromServer === 'function') {
            await cache.mergeFromServer('groups', groups).catch(() => {});
          } else if (window.LocalGroupStore) {
            await window.LocalGroupStore.mergeFromServer(groups).catch(() => {});
          }

          if (window.KynectaStore) {
            const store = window.KynectaStore;
            if (typeof store.upsertGroup === 'function') {
              for (const g of groups) { await store.upsertGroup(g); }
            } else {
              store.set('groups.list', groups);
            }
          }
          this._emitSyncEvent('GROUPS_SYNCED', groups);
        }
        return { success: true, data: groups };
      } catch (err) {
        console.warn('[Sync] groups sync failed:', err && err.message ? err.message : err);
        throw err;
      }
    }

    async _syncStatus(since) {
      if (!navigator.onLine) return;
      since = since || this._lastSync;
      try {
        const params   = new URLSearchParams({ since, limit: SYNC_CONFIG.batchSize });
        const response = await this._makeRequest('GET', '/api/status?' + params);
        const statuses =
          (response && (response.data && (response.data.statuses || response.data.data && response.data.data.statuses || response.data)) || response.statuses) || [];
        const list = Array.isArray(statuses) ? statuses : [];

        if (list.length > 0) {
          this._stats.syncedItems += list.length;
          const cache = getCache();
          if (cache && typeof cache.mergeFromServer === 'function') {
            await cache.mergeFromServer('status', list).catch(() => {});
          }
        }
        if (window.KynectaStore) window.KynectaStore.set('status.list', list);
        this._emitSyncEvent('STATUS_SYNCED', list);
        return { success: true, data: list };
      } catch (err) {
        console.warn('[Sync] status sync failed:', err && err.message ? err.message : err);
      }
    }

    async _syncSettings() {
      if (!navigator.onLine) return;
      try {
        const response = await this._makeRequest('GET', '/api/settings');
        const settings = (response && (response.data && (response.data.settings || response.data)) || response.settings) || null;
        if (settings) {
          const cache = getCache();
          if (cache && typeof cache.setSettings === 'function') cache.setSettings(settings);
          if (window.KynectaStore) window.KynectaStore.set('settings', settings);
          this._emitSyncEvent('SETTINGS_UPDATED', settings);
        }
        return { success: true, data: settings };
      } catch (err) {
        console.warn('[Sync] settings sync failed:', err && err.message ? err.message : err);
      }
    }

    /** Drain the legacy localStorage offline queue. */
    async _processOfflineQueue() {
      const raw   = localStorage.getItem('kynecta_offline_queue');
      const queue = raw ? JSON.parse(raw) : [];
      if (!queue.length) return;

      const successful = [];
      for (const item of queue) {
        try {
          await this._processOfflineItem(item);
          successful.push(item.id);
        } catch (err) {
          console.warn('[Sync] Failed to process legacy offline item:', item.id, err && err.message ? err.message : err);
        }
      }

      const remaining = queue.filter(i => !successful.includes(i.id));
      try { localStorage.setItem('kynecta_offline_queue', JSON.stringify(remaining)); } catch (_) {}

      if (successful.length > 0) {
        this._emitSyncEvent('OFFLINE_QUEUE_PROCESSED', { processed: successful.length, remaining: remaining.length });
      }
    }

    async _processOfflineItem(item) {
      switch (item.action) {
        case 'send':
        case 'sendMessage':
          if (window.services && window.services.message) return window.services.message.sendMessage(item.data);
          break;

        case 'friendRequest':
        case 'add':
        case 'accept':
        case 'reject':
        case 'remove':
        case 'block':
        case 'unblock': {
          const fq = window.KynectaFriendQueue;
          if (fq && typeof fq.enqueue === 'function') {
            fq.enqueue(item.action === 'friendRequest' ? 'add' : item.action,
              item.data && (item.data.userId || item.data.friendId), item.data);
            return;
          }
          break;
        }

        case 'createGroup': case 'updateGroup': case 'deleteGroup':
        case 'joinGroup':   case 'leaveGroup':
        case 'addGroupMember': case 'removeGroupMember': case 'sendGroupMessage': {
          const gq = window.GroupQueueManager;
          if (gq && typeof gq.enqueue === 'function') { gq.enqueue(item.action, item.data); return; }
          break;
        }

        default: {
          const oq = window.KynectaOfflineQueue;
          if (oq && typeof oq.queue === 'function') {
            await oq.queue({ type: item.type || 'generic', action: item.action, data: item.data, priority: item.priority || 5 });
          }
        }
      }
    }

    _waitForCurrentSync() {
      return new Promise(resolve => {
        const check = () => { if (!this._isSyncing) resolve(); else setTimeout(check, 100); };
        check();
      });
    }

    _getCurrentUserId() {
      return (
        (window.__PARENT_SESSION__ && window.__PARENT_SESSION__.userId) ||
        (window.AUTH_SESSION       && window.AUTH_SESSION.userId)       ||
        (window.KynectaStore       && typeof window.KynectaStore.get === 'function' && window.KynectaStore.get('user.id')) ||
        null
      );
    }

    async _makeRequest(method, endpoint, data) {
      if (!navigator.onLine) return { success: false, offline: true, data: null };

      const getToken = () => {
        try {
          const raw = localStorage.getItem('kynecta_auth');
          const p   = raw ? JSON.parse(raw) : null;
          if (p && p.token) return p.token;
        } catch (_) {}
        return (
          (window.Session && typeof window.Session.getToken === 'function' && window.Session.getToken()) ||
          (window.__PARENT_SESSION__ && window.__PARENT_SESSION__.token) ||
          (window.AUTH_SESSION && window.AUTH_SESSION.token) ||
          localStorage.getItem('token') || localStorage.getItem('accessToken') || localStorage.getItem('nexopa_token') ||
          null
        );
      };

      const token   = getToken();
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
      const options = { method, headers, credentials: 'include' };
      if (data && method !== 'GET') options.body = JSON.stringify(data);

      const doFetch = async () => {
        if (window.api && window.api.request && typeof window.api.request.request === 'function') {
          return window.api.request.request(endpoint, options);
        }
        const response = await fetch(endpoint, options);
        if (!response.ok) {
          if (response.status === 404) return { success: false, data: null, notFound: true, status: 404 };
          throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        return response.json();
      };

      if (typeof window.safeApiCall === 'function') {
        return window.safeApiCall(doFetch, { success: false, data: null });
      }
      return doFetch();
    }

    _emitSyncEvent(type, data) {
      if (window.KynectaEventBus && typeof window.KynectaEventBus.emit === 'function') {
        window.KynectaEventBus.emit(type, { ...(data || {}), timestamp: Date.now() });
      }
    }

    _applyServerData(conflict) {
      if (window.KynectaStore) window.KynectaStore.set(conflict.keyPath, conflict.serverData);
    }
    _applyClientData() {}
    _applyResolvedData(conflict, data) {
      if (window.KynectaStore) window.KynectaStore.set(conflict.keyPath, data);
    }

    /* ── Event listeners ─────────────────────────────────────────────────── */
    _setupEventListeners() {
      window.addEventListener('online', () => {
        console.log('[Sync] Network restored — resuming sync');
        if (window.KynectaStore) window.KynectaStore.set('network.online', true);

        if (SYNC_CONFIG.syncOnReconnect) {
          // All sync happens in the background — UI already loaded from cache
          this.syncAll().catch(() => {});

          const groupEngine = window.GroupSyncEngine;
          if (groupEngine && typeof groupEngine.startBackgroundSync === 'function') {
            groupEngine.startBackgroundSync();
          }
          const groupQueue = window.GroupQueueManager;
          if (groupQueue && typeof groupQueue.processNow === 'function') {
            groupQueue.processNow().catch(() => {});
          }
          const offlineQueue = window.KynectaOfflineQueue;
          if (offlineQueue && typeof offlineQueue.process === 'function') {
            offlineQueue.process().catch(() => {});
          }
          if (SYNC_CONFIG.autoSync && !this._syncTimer) this.startAutoSync();
        }
      });

      window.addEventListener('offline', () => {
        console.log('[Sync] Network lost — pausing sync');
        if (window.KynectaStore) window.KynectaStore.set('network.online', false);
        this.stopAutoSync();
      });

      if (window.KynectaEventBus && typeof window.KynectaEventBus.on === 'function') {
        // KYNECTA_BOOT_SYNC_READY is fired by bootstrap ONLY when online —
        // we defer into a zero-timeout so the UI has already rendered.
        window.KynectaEventBus.on('KYNECTA_BOOT_SYNC_READY', () => {
          if (navigator.onLine) setTimeout(() => this.syncAll().catch(() => {}), 0);
        });

        window.KynectaEventBus.on('SESSION_RESTORED', () => {
          if (SYNC_CONFIG.syncOnLogin) {
            this.syncAll().catch(() => {});
            if (window.KynectaStore && typeof window.KynectaStore.loadGroupsFromLocal === 'function') {
              window.KynectaStore.loadGroupsFromLocal().catch(() => {});
            }
            const ge = window.GroupSyncEngine;
            if (ge && typeof ge.startBackgroundSync === 'function') ge.startBackgroundSync();
          }
        });

        window.KynectaEventBus.on('SESSION_REFRESHED', () => {
          if (SYNC_CONFIG.syncOnLogin) this.syncAll().catch(() => {});
        });

        window.KynectaEventBus.on('groupSync:sync:complete', () => {
          if (window.KynectaStore && typeof window.KynectaStore.loadGroupsFromLocal === 'function') {
            window.KynectaStore.loadGroupsFromLocal().catch(() => {});
          }
        });
      }
    }
  }

  /* ── Singleton ───────────────────────────────────────────────────────────── */
  const syncManager = new KynectaSyncManager();
  window.KynectaSync = syncManager;
  if (window.__KYNECTA_AUTHORITIES__) window.__KYNECTA_AUTHORITIES__.sync = syncManager;

  console.log('[Sync] ✅ Ready (offline-first v2.3)');
})();