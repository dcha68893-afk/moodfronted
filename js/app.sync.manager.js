/**
 * Kynecta Sync Manager
 * Handles data synchronization with backend
 * @version 1.0.0
 */

(function() {
    'use strict';

    const SYNC_CONFIG = {
        autoSync: false,
        syncInterval: 30000, // 30 seconds
        retryDelay: 5000,
        maxRetries: 3,
        syncOnReconnect: true,
        syncOnLogin: true,
        batchSize: 100,
        conflictStrategy: 'server-wins' // or 'client-wins', 'merge'
    };

    class KynectaSyncManager {
        constructor() {
            this._isSyncing = false;
            this._lastSync = 0;
            this._syncQueue = [];
            this._retryCount = 0;
            this._syncTimer = null;
            this._pendingSyncs = new Map();
            this._conflicts = [];
            this._stats = {
                totalSyncs: 0,
                successfulSyncs: 0,
                failedSyncs: 0,
                conflicts: 0,
                lastSyncDuration: 0,
                syncedItems: 0
            };

            // Initialize
            this._setupEventListeners();
            
            // Start auto-sync if enabled
            if (SYNC_CONFIG.autoSync) {
                this.startAutoSync();
            }

            // Expose globally
            window.KynectaSync = this;

            console.log('[Sync] ✅ Manager initialized');
        }

        // ========== PUBLIC API ==========

        /**
         * Start automatic synchronization
         * @param {number} interval - Sync interval in ms
         */
        startAutoSync(interval = SYNC_CONFIG.syncInterval) {
            if (this._syncTimer) {
                clearInterval(this._syncTimer);
            }

            this._syncTimer = setInterval(() => {
                this.syncAll();
            }, interval);

            console.log('[Sync] Auto-sync started');
        }

        /**
         * Stop automatic synchronization
         */
        stopAutoSync() {
            if (this._syncTimer) {
                clearInterval(this._syncTimer);
                this._syncTimer = null;
            }
        }

        /**
         * Synchronize all data
         * @returns {Promise} Resolves when sync complete
         */
        async syncAll() {
            if (this._isSyncing) {
                return this._waitForCurrentSync();
            }

            this._isSyncing = true;
            this._stats.totalSyncs++;
            const startTime = Date.now();

            try {
                // Emit sync started event
                this._emitSyncEvent('SYNC_STARTED');

                // Get current user ID
                const userId = this._getCurrentUserId();
                if (!userId) {
                    throw new Error('No authenticated user');
                }

                // Get last sync timestamp
                const since = this._lastSync || 0;

                // Perform sync operations in parallel
                const results = await Promise.allSettled([
                    this._syncMessages(since),
                    this._syncFriends(since),
                    this._syncGroups(since),
                    this._syncStatus(since),
                    this._syncSettings(since)
                ]);

                // Check for failures
                const failures = results.filter(r => r.status === 'rejected');
                if (failures.length > 0) {
                    this._stats.failedSyncs++;
                    throw new Error(`${failures.length} sync operations failed`);
                }

                // Update last sync time
                this._lastSync = Date.now();
                this._retryCount = 0;
                this._stats.successfulSyncs++;
                this._stats.lastSyncDuration = Date.now() - startTime;

                // Process offline queue
                await this._processOfflineQueue();

                // Emit sync completed event
                this._emitSyncEvent('SYNC_COMPLETED', {
                    duration: this._stats.lastSyncDuration,
                    syncedItems: this._stats.syncedItems
                });

                // Update store
                if (window.KynectaStore) {
                    window.KynectaStore.set('sync.lastSync', this._lastSync);
                }

                return { success: true, lastSync: this._lastSync };

            } catch (error) {
                this._stats.failedSyncs++;
                this._retryCount++;

                // Emit sync failed event
                this._emitSyncEvent('SYNC_FAILED', {
                    error: error.message,
                    retryCount: this._retryCount
                });

                // Schedule retry if under limit
                if (this._retryCount <= SYNC_CONFIG.maxRetries) {
                    setTimeout(() => {
                        this.syncAll();
                    }, SYNC_CONFIG.retryDelay * this._retryCount);
                }

                throw error;

            } finally {
                this._isSyncing = false;
            }
        }

        /**
         * Sync specific data type
         * @param {string} type - Data type (messages, friends, groups, status, settings)
         * @returns {Promise}
         */
        async syncType(type) {
            const since = this._lastSync || 0;
            
            switch(type) {
                case 'messages':
                    return this._syncMessages(since);
                case 'friends':
                    return this._syncFriends(since);
                case 'groups':
                    return this._syncGroups(since);
                case 'status':
                    return this._syncStatus(since);
                case 'settings':
                    return this._syncSettings(since);
                default:
                    throw new Error(`Unknown sync type: ${type}`);
            }
        }

        /**
         * Queue item for sync
         * @param {string} type - Data type
         * @param {string} action - Action (create, update, delete)
         * @param {*} data - Item data
         * @returns {string} Queue ID
         */
        queueForSync(type, action, data) {
            const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            this._syncQueue.push({
                id,
                type,
                action,
                data,
                timestamp: Date.now(),
                retries: 0
            });

            // Limit queue size
            if (this._syncQueue.length > 1000) {
                this._syncQueue.shift();
            }

            // Trigger sync if not already syncing
            if (!this._isSyncing && navigator.onLine) {
                this.syncAll();
            }

            return id;
        }

        /**
         * Get sync status
         * @returns {Object} Sync status
         */
        getStatus() {
            return {
                isSyncing: this._isSyncing,
                lastSync: this._lastSync,
                queueLength: this._syncQueue.length,
                retryCount: this._retryCount,
                stats: this._stats,
                pendingSyncs: this._pendingSyncs.size,
                conflicts: this._conflicts.length
            };
        }

        /**
         * Resolve conflict
         * @param {string} conflictId - Conflict ID
         * @param {string} resolution - Resolution strategy
         * @param {*} resolvedData - Resolved data
         */
        resolveConflict(conflictId, resolution, resolvedData = null) {
            const conflict = this._conflicts.find(c => c.id === conflictId);
            if (!conflict) return false;

            if (resolution === 'accept-server') {
                this._applyServerData(conflict);
            } else if (resolution === 'accept-client') {
                this._applyClientData(conflict);
            } else if (resolution === 'custom' && resolvedData) {
                this._applyResolvedData(conflict, resolvedData);
            }

            this._conflicts = this._conflicts.filter(c => c.id !== conflictId);
            return true;
        }

        // ========== PRIVATE SYNC METHODS ==========

        async _syncMessages(since) {
            const params = new URLSearchParams({
                since,
                limit: SYNC_CONFIG.batchSize
            });

            const response = await this._makeRequest('GET', `/api/sync/messages?${params}`);
            
            if (response.data && response.data.length > 0) {
                this._stats.syncedItems += response.data.length;
                
                // Update store
                if (window.KynectaStore) {
                    response.data.forEach(item => {
                        if (item.type === 'message') {
                            const messages = window.KynectaStore.get(`messages.byChat.${item.data.chatId}`) || [];
                            const updated = this._mergeMessage(messages, item.data);
                            window.KynectaStore.set(`messages.byChat.${item.data.chatId}`, updated);
                        }
                    });
                }

                // Emit events
                response.data.forEach(item => {
                    if (window.KynectaEventBus) {
                        window.KynectaEventBus.emit(`SYNC_MESSAGE_${item.action}`, item.data);
                    }
                });
            }

            return response;
        }

        async _syncFriends(since) {
            const params = new URLSearchParams({
                since,
                limit: SYNC_CONFIG.batchSize
            });

            const response = await this._makeRequest('GET', `/api/sync/friends?${params}`);
            
            if (response.data && response.data.length > 0) {
                this._stats.syncedItems += response.data.length;
                
                // Update store
                if (window.KynectaStore) {
                    const friends = window.KynectaStore.get('friends.list') || [];
                    response.data.forEach(item => {
                        if (item.action === 'add') {
                            friends.push(item.data);
                        } else if (item.action === 'remove') {
                            const index = friends.findIndex(f => f.id === item.data.id);
                            if (index !== -1) friends.splice(index, 1);
                        } else if (item.action === 'update') {
                            const index = friends.findIndex(f => f.id === item.data.id);
                            if (index !== -1) friends[index] = item.data;
                        }
                    });
                    window.KynectaStore.set('friends.list', friends);
                }

                // Emit events
                response.data.forEach(item => {
                    if (window.KynectaEventBus) {
                        window.KynectaEventBus.emit(`FRIEND_${item.action.toUpperCase()}`, item.data);
                    }
                });
            }

            return response;
        }

        async _syncGroups(since) {
            const params = new URLSearchParams({
                since,
                limit: SYNC_CONFIG.batchSize
            });

            const response = await this._makeRequest('GET', `/api/sync/groups?${params}`);
            
            if (response.data && response.data.length > 0) {
                this._stats.syncedItems += response.data.length;
                
                // Update store
                if (window.KynectaStore) {
                    const groups = window.KynectaStore.get('groups.list') || [];
                    response.data.forEach(item => {
                        if (item.action === 'add') {
                            groups.push(item.data);
                        } else if (item.action === 'remove') {
                            const index = groups.findIndex(g => g.id === item.data.id);
                            if (index !== -1) groups.splice(index, 1);
                        } else if (item.action === 'update') {
                            const index = groups.findIndex(g => g.id === item.data.id);
                            if (index !== -1) groups[index] = item.data;
                        }
                    });
                    window.KynectaStore.set('groups.list', groups);
                }

                // Emit events
                response.data.forEach(item => {
                    if (window.KynectaEventBus) {
                        window.KynectaEventBus.emit(`GROUP_${item.action.toUpperCase()}`, item.data);
                    }
                });
            }

            return response;
        }

        async _syncStatus(since) {
            const params = new URLSearchParams({
                since,
                limit: SYNC_CONFIG.batchSize
            });

            const response = await this._makeRequest('GET', `/api/sync/status?${params}`);
            
            if (response.data && response.data.length > 0) {
                this._stats.syncedItems += response.data.length;
                
                // Update store
                if (window.KynectaStore) {
                    const statusList = window.KynectaStore.get('status.list') || [];
                    response.data.forEach(item => {
                        if (item.action === 'add') {
                            statusList.push(item.data);
                        } else if (item.action === 'remove') {
                            const index = statusList.findIndex(s => s.id === item.data.id);
                            if (index !== -1) statusList.splice(index, 1);
                        }
                    });
                    window.KynectaStore.set('status.list', statusList);
                }

                // Emit events
                response.data.forEach(item => {
                    if (window.KynectaEventBus) {
                        window.KynectaEventBus.emit('STATUS_UPDATED', item.data);
                    }
                });
            }

            return response;
        }

        async _syncSettings(since) {
            const response = await this._makeRequest('GET', '/api/sync/settings');
            
            if (response.data) {
                // Update store
                if (window.KynectaStore) {
                    window.KynectaStore.set('settings', response.data);
                }

                // Emit event
                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('SETTINGS_UPDATED', response.data);
                }
            }

            return response;
        }

        async _processOfflineQueue() {
            const queue = JSON.parse(localStorage.getItem('kynecta_offline_queue') || '[]');
            if (queue.length === 0) return;

            const successful = [];

            for (const item of queue) {
                try {
                    await this._processOfflineItem(item);
                    successful.push(item.id);
                } catch (error) {
                    console.warn('[Sync] Failed to process offline item:', item.id, error);
                }
            }

            // Remove successful items
            const remaining = queue.filter(item => !successful.includes(item.id));
            localStorage.setItem('kynecta_offline_queue', JSON.stringify(remaining));

            // Emit event
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('OFFLINE_QUEUE_PROCESSED', {
                    processed: successful.length,
                    remaining: remaining.length
                });
            }
        }

        async _processOfflineItem(item) {
            switch(item.action) {
                case 'sendMessage':
                    if (window.services?.message) {
                        return window.services.message.sendMessage(item.data);
                    }
                    break;
                case 'friendRequest':
                    if (window.services?.friend) {
                        return window.services.friend.sendFriendRequest(item.data.userId, item.data.message);
                    }
                    break;
                default:
                    // Try generic endpoint
                    return this._makeRequest('POST', '/api/sync/offline', item);
            }
        }

        _waitForCurrentSync() {
            return new Promise((resolve) => {
                const checkSync = () => {
                    if (!this._isSyncing) {
                        resolve();
                    } else {
                        setTimeout(checkSync, 100);
                    }
                };
                checkSync();
            });
        }

        _getCurrentUserId() {
            if (window.__PARENT_SESSION__?.userId) {
                return window.__PARENT_SESSION__.userId;
            }
            if (window.AUTH_SESSION?.userId) {
                return window.AUTH_SESSION.userId;
            }
            if (window.KynectaStore) {
                return window.KynectaStore.get('user.id');
            }
            return null;
        }

        async _makeRequest(method, endpoint, data = null) {
            let token = null;
            if (window.__PARENT_SESSION__?.token) {
                token = window.__PARENT_SESSION__.token;
            } else if (window.AUTH_SESSION?.token) {
                token = window.AUTH_SESSION.token;
            } else if (window.localStorage) {
                token = window.localStorage.getItem('kynecta_token');
            }

            const headers = {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            };

            const options = {
                method,
                headers,
                credentials: 'include'
            };

            if (data && method !== 'GET') {
                options.body = JSON.stringify(data);
            }

            if (window.api?.request) {
                return window.api.request.request(endpoint, options);
            }

            const response = await fetch(endpoint, options);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        }

        _mergeMessage(existing, incoming) {
            const messageMap = new Map();
            existing.forEach(msg => messageMap.set(msg.id, msg));
            messageMap.set(incoming.id, incoming);
            return Array.from(messageMap.values())
                .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        }

        _emitSyncEvent(type, data = {}) {
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit(type, {
                    ...data,
                    timestamp: Date.now()
                });
            }
        }

        _setupEventListeners() {
            // Listen for network changes
            window.addEventListener('online', () => {
                if (SYNC_CONFIG.syncOnReconnect) {
                    this.syncAll();
                }
            });

            // Listen for login events
            if (window.KynectaEventBus) {
                window.KynectaEventBus.on('SESSION_RESTORED', () => {
                    if (SYNC_CONFIG.syncOnLogin) {
                        this.syncAll();
                    }
                });

                window.KynectaEventBus.on('SESSION_REFRESHED', () => {
                    if (SYNC_CONFIG.syncOnLogin) {
                        this.syncAll();
                    }
                });
            }
        }
    }

    // Initialize singleton
    const syncManager = new KynectaSyncManager();

    // Expose globally
    window.KynectaSync = syncManager;

    // Add to authorities
    if (window.__KYNECTA_AUTHORITIES__) {
        window.__KYNECTA_AUTHORITIES__.sync = syncManager;
    }

    console.log('[Sync] ✅ Ready');
})();