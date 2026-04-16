/**
 * app.sync.manager.js  (Offline-First Edition v2.2)
 * Orchestrates data synchronization: delegates message sync to
 * messageSync.engine.js; handles conversations, friends, groups, etc.
 * 
 * @version 2.2.0 - full group sync integration with GroupSyncEngine and GroupQueueManager
 */

(function () {
    'use strict';

    const SYNC_CONFIG = {
        autoSync: false,
        syncInterval: 30000,
        retryDelay: 5000,
        maxRetries: 3,
        syncOnReconnect: true,
        syncOnLogin: true,
        batchSize: 100,
        conflictStrategy: 'server-wins'
    };

    class KynectaSyncManager {
        constructor() {
            this._isSyncing   = false;
            this._lastSync    = 0;
            this._syncQueue   = [];
            this._retryCount  = 0;
            this._syncTimer   = null;
            this._pendingSyncs = new Map();
            this._conflicts   = [];
            this._stats = {
                totalSyncs: 0, successfulSyncs: 0, failedSyncs: 0,
                conflicts: 0, lastSyncDuration: 0, syncedItems: 0
            };

            this._setupEventListeners();
            if (SYNC_CONFIG.autoSync) this.startAutoSync();

            window.KynectaSync = this;
            console.log('[Sync] ✅ Manager initialized (offline-first v2.2)');
        }

        // ── Public API ───────────────────────────────────────────────────────

        startAutoSync(interval = SYNC_CONFIG.syncInterval) {
            if (this._syncTimer) clearInterval(this._syncTimer);
            this._syncTimer = setInterval(() => this.syncAll(), interval);
        }

        stopAutoSync() {
            if (this._syncTimer) { clearInterval(this._syncTimer); this._syncTimer = null; }
        }

        async syncAll() {
            // ── SYNC LOOP GUARD (patch v1) ─────────────────────────────────
            // Use KynSyncGuard (from kynecta_safety_layer.js) when available;
            // fall back to the private boolean for backward compatibility.
            const guard = (typeof KynSyncGuard !== 'undefined') ? KynSyncGuard : null;
            if (guard) {
                if (!guard.acquire('syncAll')) {
                    console.log('[SYNC START] syncAll already running — skipped');
                    return this._waitForCurrentSync();
                }
            } else {
                if (this._isSyncing) return this._waitForCurrentSync();
            }
            if (!navigator.onLine) {
                if (guard) guard.release('syncAll');
                return;
            }
            console.log('[SYNC START] syncAll beginning');

            this._isSyncing = true;
            let shouldReleaseGuard = true;
            this._stats.totalSyncs++;
            const startTime = Date.now();

            try {
                this._emitSyncEvent('SYNC_STARTED');

                const userId = this._getCurrentUserId();
                if (!userId) {
                    return { success: false, skipped: true, reason: 'no_authenticated_user' };
                }

                // Delegate message sync to KynectaSyncEngine
                const syncEngine = window.KynectaSyncEngine;
                if (syncEngine) {
                    await syncEngine.syncAll();
                }

                // Delegate friend sync to dedicated offline-first engine
                const friendSyncEngine = window.KynectaFriendSyncEngine;
                if (friendSyncEngine) {
                    await friendSyncEngine.syncAll();
                }

                // ── NEW: Group sync delegation (v2.2) ─────────────────────────────
                const groupSyncEngine = window.GroupSyncEngine;
                if (groupSyncEngine) {
                    await groupSyncEngine.syncAll();
                }

                // Process group offline queue
                const groupQueue = window.GroupQueueManager;
                if (groupQueue && groupQueue.pendingCount && groupQueue.pendingCount() > 0) {
                    await groupQueue.processNow();
                }

                // Process remaining non-message, non-friend, non-group items
                await Promise.allSettled([
                    ...(friendSyncEngine ? [] : [this._syncFriends()]),
                    ...(groupSyncEngine ? [] : [this._syncGroups()]),
                    this._syncStatus(),
                    this._syncSettings()
                ]);

                // Also process any pending offline queue items
                const offlineQueue = window.KynectaMsgQueue;
                if (offlineQueue) await offlineQueue.processAll();

                // Flush friend action queue (offline-first)
                const friendQueue = window.KynectaFriendQueue;
                if (friendQueue && friendQueue.pendingCount && friendQueue.pendingCount() > 0) {
                    await friendQueue.flush();
                }

                // Legacy offline queue
                await this._processOfflineQueue();

                this._lastSync   = Date.now();
                this._retryCount = 0;
                this._stats.successfulSyncs++;
                this._stats.lastSyncDuration = Date.now() - startTime;

                this._emitSyncEvent('SYNC_COMPLETED', { duration: this._stats.lastSyncDuration });

                if (window.KynectaStore) window.KynectaStore.set('sync.lastSync', this._lastSync);

                return { success: true, lastSync: this._lastSync };

            } catch (error) {
                this._stats.failedSyncs++;
                this._retryCount++;
                console.error('[Sync] syncAll error:', error && error.message ? error.message : error);

                this._emitSyncEvent('SYNC_FAILED', { error: error.message, retryCount: this._retryCount });

                // ── Bounded retry with guard release (patch v1) ─────────────
                // Release the guard and reset the flag INSIDE the setTimeout
                // callback so the lock stays held until the retry is ready,
                // preventing a second syncAll from starting in the gap.
                // Do NOT re-throw — stops cascading failures in callers.
                if (this._retryCount <= SYNC_CONFIG.maxRetries && navigator.onLine) {
                    const delay = SYNC_CONFIG.retryDelay * this._retryCount;
                    console.warn(`[Sync] Retry ${this._retryCount}/${SYNC_CONFIG.maxRetries} in ${delay}ms`);
                    shouldReleaseGuard = false;
                    setTimeout(() => {
                        this._isSyncing = false;
                        if (typeof KynSyncGuard !== 'undefined') KynSyncGuard.release('syncAll');
                        this.syncAll();
                    }, delay);
                    // Return without releasing — retry callback handles it
                    return { success: false, error: error.message, retryCount: this._retryCount };
                }

                // Max retries exhausted — fall through to finally for cleanup
                return { success: false, error: error.message, retryCount: this._retryCount };
            } finally {
                this._isSyncing = false;
                if (shouldReleaseGuard && typeof KynSyncGuard !== 'undefined') KynSyncGuard.release('syncAll');
            }
        }

        async syncType(type) {
            const since = this._lastSync || 0;
            switch (type) {
                case 'messages': {
                    const engine = window.KynectaSyncEngine;
                    return engine ? engine.syncAll() : this._syncMessages(since);
                }
                case 'friends': {
                    const fe = window.KynectaFriendSyncEngine;
                    return fe ? fe.syncAll() : this._syncFriends(since);
                }
                case 'groups': {
                    const ge = window.GroupSyncEngine;
                    return ge ? ge.syncAll() : this._syncGroups(since);
                }
                case 'status':   return this._syncStatus(since);
                case 'settings': return this._syncSettings(since);
                default: throw new Error(`Unknown sync type: ${type}`);
            }
        }

        queueForSync(type, action, data) {
            const id = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            this._syncQueue.push({ id, type, action, data, timestamp: Date.now(), retries: 0 });
            if (this._syncQueue.length > 1000) this._syncQueue.shift();
            if (!this._isSyncing && navigator.onLine) this.syncAll();
            return id;
        }

        getStatus() {
            return {
                isSyncing: this._isSyncing, lastSync: this._lastSync,
                queueLength: this._syncQueue.length, retryCount: this._retryCount,
                stats: this._stats, pendingSyncs: this._pendingSyncs.size,
                conflicts: this._conflicts.length
            };
        }

        resolveConflict(conflictId, resolution, resolvedData = null) {
            const conflict = this._conflicts.find(c => c.id === conflictId);
            if (!conflict) return false;
            if (resolution === 'accept-server')     this._applyServerData(conflict);
            else if (resolution === 'accept-client') this._applyClientData(conflict);
            else if (resolution === 'custom' && resolvedData) this._applyResolvedData(conflict, resolvedData);
            this._conflicts = this._conflicts.filter(c => c.id !== conflictId);
            return true;
        }

        // ── Private sync methods ─────────────────────────────────────────────

        /** Legacy message sync — used as fallback if syncEngine unavailable */
        async _syncMessages(since) {
            // This app uses `messageSync.engine.js` (chat-scoped) and `messageQueue.manager.js`.
            // Backend `/api/messages` requires a `chatId` query param, so a global delta pull
            // here would cause 400s and noisy retries. Keep this legacy path as a safe no-op.
            return { success: true, data: [], skipped: true, reason: 'use-messageSyncEngine' };
        }

        async _syncFriends(since = this._lastSync) {
            try {
                const params = new URLSearchParams({ since, limit: SYNC_CONFIG.batchSize });
                // Backend provides friends list via /api/friends (not /api/sync/friends).
                const response = await this._makeRequest('GET', `/api/friends?${params}`);
                const friends = response?.data?.friends || response?.data || response?.friends || [];
                if (Array.isArray(friends) && friends.length > 0) {
                    this._stats.syncedItems += friends.length;
                    if (window.KynectaStore) window.KynectaStore.set('friends.list', friends);
                    if (window.KynectaEventBus) window.KynectaEventBus.emit('FRIENDS_SYNCED', friends);
                } else {
                    if (window.KynectaStore && Array.isArray(friends)) window.KynectaStore.set('friends.list', friends);
                }
                return { success: true, data: friends };
            } catch (err) { console.warn('[Sync] friends sync failed:', err.message); }
        }

        /**
         * UPDATED v2.2: Sync groups — delegates to GroupSyncEngine if available.
         * If not, falls back to legacy delta loop with store.upsertGroup().
         */
        async _syncGroups(since = this._lastSync) {
            // Check if GroupSyncEngine exists — delegate to it for full offline-first sync
            const groupSyncEngine = window.GroupSyncEngine;
            if (groupSyncEngine && typeof groupSyncEngine.syncAll === 'function') {
                try {
                    await groupSyncEngine.syncAll();
                    return { success: true, source: 'GroupSyncEngine' };
                } catch (err) {
                    console.warn('[Sync] GroupSyncEngine failed, falling back to legacy:', err.message);
                    // Fall through to legacy
                }
            }

            // Legacy fallback: fetch delta from server and apply to store
            try {
                const params = new URLSearchParams({ since, limit: SYNC_CONFIG.batchSize });
                // Backend provides groups via /api/groups (not /api/sync/groups).
                const response = await this._makeRequest('GET', `/api/groups?${params}`);
                
                const groups = response?.data?.groups || response?.data || response?.groups || [];
                if (Array.isArray(groups) && groups.length > 0) {
                    this._stats.syncedItems += groups.length;
                    
                    if (window.KynectaStore) {
                        const store = window.KynectaStore;
                        
                        if (typeof store.upsertGroup === 'function') {
                            for (const g of groups) {
                                await store.upsertGroup(g);
                            }
                        } else {
                            store.set('groups.list', groups);
                        }
                    }
                    
                    // Emit events
                    if (window.KynectaEventBus) window.KynectaEventBus.emit('GROUPS_SYNCED', groups);
                }
                return { success: true, data: groups };
            } catch (err) {
                console.warn('[Sync] groups sync failed:', err.message);
                throw err;
            }
        }

        async _syncStatus(since = this._lastSync) {
            try {
                const params = new URLSearchParams({ since, limit: SYNC_CONFIG.batchSize });
                // Backend provides status feed via /api/status (public endpoints included).
                const response = await this._makeRequest('GET', `/api/status?${params}`);
                const statuses =
                    response?.data?.statuses ||
                    response?.data?.data?.statuses ||
                    response?.data ||
                    response?.statuses ||
                    [];
                const list = (typeof safeArray === 'function') ? safeArray(statuses) : (Array.isArray(statuses) ? statuses : []);
                this._stats.syncedItems += list.length;
                if (window.KynectaStore) window.KynectaStore.set('status.list', list);
                if (window.KynectaEventBus) window.KynectaEventBus.emit('STATUS_SYNCED', list);
                return { success: true, data: list };
            } catch (err) { console.warn('[Sync] status sync failed:', err.message); }
        }

        async _syncSettings() {
            try {
                // Backend provides settings via /api/settings (not /api/sync/settings).
                const response = await this._makeRequest('GET', '/api/settings');
                const settings = response?.data?.settings || response?.data || response?.settings || null;
                if (settings) {
                    if (window.KynectaStore) window.KynectaStore.set('settings', settings);
                    if (window.KynectaEventBus) window.KynectaEventBus.emit('SETTINGS_UPDATED', settings);
                }
                return { success: true, data: settings };
            } catch (err) { console.warn('[Sync] settings sync failed:', err.message); }
        }

        /** Process the legacy localStorage offline queue */
        async _processOfflineQueue() {
            const queue = window.AppStorage?.getArray?.('kynecta_offline_queue') || JSON.parse(localStorage.getItem('kynecta_offline_queue') || '[]');
            if (queue.length === 0) return;

            const successful = [];
            for (const item of queue) {
                try {
                    await this._processOfflineItem(item);
                    successful.push(item.id);
                } catch (err) {
                    console.warn('[Sync] Failed to process offline item:', item.id, err.message);
                }
            }

            const remaining = queue.filter(item => !successful.includes(item.id));
            if (window.AppStorage?.set) {
                window.AppStorage.set('kynecta_offline_queue', remaining);
            } else {
                localStorage.setItem('kynecta_offline_queue', JSON.stringify(remaining));
            }

            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('OFFLINE_QUEUE_PROCESSED', { processed: successful.length, remaining: remaining.length });
            }
        }

        async _processOfflineItem(item) {
            switch (item.action) {
                case 'send':
                case 'sendMessage':
                    if (window.services?.message) return window.services.message.sendMessage(item.data);
                    break;
                case 'friendRequest':
                case 'add':
                case 'accept':
                case 'reject':
                case 'remove':
                case 'block':
                case 'unblock': {
                    const fq = window.KynectaFriendQueue;
                    if (fq) {
                        fq.enqueue(
                            item.action === 'friendRequest' ? 'add' : item.action,
                            item.data?.userId || item.data?.friendId,
                            item.data
                        );
                        return;
                    }
                    if (window.services?.friend) return window.services.friend.sendFriendRequest(item.data.userId, item.data.message);
                    break;
                }
                // ── NEW: Group offline actions (v2.2) ─────────────────────────────
                case 'createGroup':
                case 'updateGroup':
                case 'deleteGroup':
                case 'joinGroup':
                case 'leaveGroup':
                case 'addGroupMember':
                case 'removeGroupMember':
                case 'sendGroupMessage': {
                    const groupQueue = window.GroupQueueManager;
                    if (groupQueue && typeof groupQueue.enqueue === 'function') {
                        groupQueue.enqueue(item.action, item.data);
                        return;
                    }
                    break;
                }
                default:
                    // Backend does not expose a generic /api/sync/offline endpoint here.
                    // Keep the action safely queued for replay by OfflineQueue / module queues.
                    try {
                        const oq = window.KynectaOfflineQueue;
                        if (oq && typeof oq.queue === 'function') {
                            await oq.queue({ type: item.type || 'generic', action: item.action, data: item.data, priority: item.priority || 5 });
                            return { success: true, queued: true };
                        }
                    } catch (e) {
                        console.warn('[Sync] Failed to re-queue offline item:', e && e.message ? e.message : e);
                    }
                    return { success: false, queued: false, reason: 'no-offline-endpoint' };
            }
        }

        _waitForCurrentSync() {
            return new Promise((resolve) => {
                const check = () => { if (!this._isSyncing) resolve(); else setTimeout(check, 100); };
                check();
            });
        }

        _getCurrentUserId() {
            if (window.__PARENT_SESSION__?.userId)   return window.__PARENT_SESSION__.userId;
            if (window.AUTH_SESSION?.userId)         return window.AUTH_SESSION.userId;
            if (window.KynectaStore) {
                const storeUserId = window.KynectaStore.get('user.id');
                if (storeUserId) return storeUserId;
            }
            try {
                const auth = window.AppStorage?.getObject?.('kynecta_auth') || JSON.parse(localStorage.getItem('kynecta_auth') || 'null');
                if (auth?.userId || auth?.user?.id || auth?.user?.userId) return auth.userId || auth.user?.id || auth.user?.userId;
            } catch (_) {}
            try {
                const user = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || 'null');
                if (user?.id || user?.userId) return user.id || user.userId;
            } catch (_) {}
            return null;
        }

        async _makeRequest(method, endpoint, data = null) {
            const baseUrl = (window.__getApiBase && window.__getApiBase()) ||
                window.API_BASE_URL ||
                (window.location.origin + '/api');
            const token = (
                (window.Session && typeof window.Session.getToken === 'function' && window.Session.getToken()) ||
                window.__PARENT_SESSION__?.token ||
                window.AUTH_SESSION?.token ||
                window.AppStorage?.get?.('authToken', null) ||
                window.AppStorage?.get?.('token', null) ||
                window.AppStorage?.get?.('accessToken', null) ||
                window.AppStorage?.get?.('moodchat_token', null) ||
                localStorage.getItem('authToken') ||
                localStorage.getItem('token') ||
                localStorage.getItem('accessToken') ||
                localStorage.getItem('moodchat_token') ||
                localStorage.getItem('USER_TOKEN') ||
                (function () {
                    try {
                        const raw = localStorage.getItem('kynecta_auth');
                        const parsed = raw ? JSON.parse(raw) : null;
                        return parsed && parsed.token ? parsed.token : null;
                    } catch (_) { return null; }
                })()
            ) || null;
            const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
            const options = { method, headers, credentials: 'include' };
            if (data && method !== 'GET') options.body = JSON.stringify(data);
            if (typeof window.safeApiCall === 'function') {
                return window.safeApiCall(async () => {
                    if (window.api?.request?.request) return window.api.request.request(endpoint, options);
                    const response = await fetch(`${baseUrl}${endpoint}`, options);
                    if (!response.ok) {
                        // Treat missing optional endpoints as soft-failures (prevents sync retry loops)
                        if (response.status === 404) return { success: false, data: null, notFound: true, status: 404 };
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    return response.json();
                }, { success: false, data: null });
            }
            if (window.api?.request?.request) return window.api.request.request(endpoint, options);
            const response = await fetch(`${baseUrl}${endpoint}`, options);
            if (!response.ok) {
                if (response.status === 404) return { success: false, data: null, notFound: true, status: 404 };
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        }

        _mergeMessage(existing, incoming) {
            const map = new Map();
            existing.forEach(m => map.set(m.id, m));
            map.set(incoming.id, incoming);
            return Array.from(map.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        }

        _emitSyncEvent(type, data = {}) {
            if (window.KynectaEventBus) window.KynectaEventBus.emit(type, { ...data, timestamp: Date.now() });
        }

        _applyServerData(conflict) {
            if (window.KynectaStore) window.KynectaStore.set(conflict.keyPath, conflict.serverData);
        }
        _applyClientData(conflict) {}
        _applyResolvedData(conflict, data) {
            if (window.KynectaStore) window.KynectaStore.set(conflict.keyPath, data);
        }

        /**
         * UPDATED v2.2: Setup event listeners with group sync integration.
         */
        _setupEventListeners() {
            // ── Online: resume sync and flush all queues ────────────────────────
            window.addEventListener('online', () => {
                console.log('[Sync] Network restored — resuming sync');
                if (window.KynectaStore) window.KynectaStore.set('network.online', true);

                if (SYNC_CONFIG.syncOnReconnect) {
                    this.syncAll();

                    // Also trigger group sync engine if available
                    const groupSyncEngine = window.GroupSyncEngine;
                    if (groupSyncEngine && typeof groupSyncEngine.startBackgroundSync === 'function') {
                        groupSyncEngine.startBackgroundSync();
                    }

                    // Trigger group queue processing
                    const groupQueue = window.GroupQueueManager;
                    if (groupQueue && typeof groupQueue.processNow === 'function') {
                        groupQueue.processNow();
                    }

                    // Flush general offline queue
                    const offlineQueue = window.KynectaOfflineQueue;
                    if (offlineQueue && typeof offlineQueue.process === 'function') {
                        offlineQueue.process();
                    }

                    // Re-arm auto-sync if it was enabled before going offline
                    if (SYNC_CONFIG.autoSync && !this._syncTimer) {
                        this.startAutoSync();
                    }
                }
            });

            // ── Offline: pause sync, update store network state ──────────────────
            window.addEventListener('offline', () => {
                console.log('[Sync] Network lost — pausing sync');
                if (window.KynectaStore) window.KynectaStore.set('network.online', false);
                // Stop auto-sync timer while offline to avoid queuing failed requests
                this.stopAutoSync();
                // Re-arm auto-sync when we come back online (handled by 'online' listener)
            });

            if (window.KynectaEventBus) {
                window.KynectaEventBus.on('SESSION_RESTORED', async () => {
                    if (SYNC_CONFIG.syncOnLogin) {
                        await this.syncAll();
                        
                        // Load groups from local store after session restore
                        if (window.KynectaStore && window.KynectaStore.loadGroupsFromLocal) {
                            await window.KynectaStore.loadGroupsFromLocal();
                        }
                        
                        // Start group background sync
                        const groupSyncEngine = window.GroupSyncEngine;
                        if (groupSyncEngine && typeof groupSyncEngine.startBackgroundSync === 'function') {
                            groupSyncEngine.startBackgroundSync();
                        }
                    }
                });
                
                window.KynectaEventBus.on('SESSION_REFRESHED', () => {
                    if (SYNC_CONFIG.syncOnLogin) this.syncAll();
                });
                
                // Listen for group sync completion events to reload groups
                window.KynectaEventBus.on('groupSync:sync:complete', async () => {
                    if (window.KynectaStore && window.KynectaStore.loadGroupsFromLocal) {
                        await window.KynectaStore.loadGroupsFromLocal();
                    }
                });
            }
        }
    }

    const syncManager = new KynectaSyncManager();
    window.KynectaSync = syncManager;
    if (window.__KYNECTA_AUTHORITIES__) window.__KYNECTA_AUTHORITIES__.sync = syncManager;

    console.log('[Sync] ✅ Ready (offline-first v2.2)');
})();
