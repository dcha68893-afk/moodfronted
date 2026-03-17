/**
 * Kynecta Offline Message Queue
 * Persistent queue for offline operations
 * @version 1.0.0
 */

(function() {
    'use strict';

    const QUEUE_CONFIG = {
        maxSize: 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        retryDelay: 5000,
        maxRetries: 10,
        storageKey: 'kynecta_offline_queue',
        useIndexedDB: true
    };

    class KynectaOfflineQueue {
        constructor() {
            this._queue = [];
            this._processing = false;
            this._retryTimeouts = new Map();
            this._db = null;
            this._useIndexedDB = this._checkIndexedDBSupport() && QUEUE_CONFIG.useIndexedDB;
            
            this._stats = {
                totalQueued: 0,
                totalProcessed: 0,
                totalFailed: 0,
                currentSize: 0
            };

            this._init().then(() => {
                console.log('[OfflineQueue] ✅ Initialized');
            });

            // Expose globally
            window.KynectaOfflineQueue = this;
        }

        // ========== PUBLIC API ==========

        /**
         * Queue an operation
         * @param {Object} operation - Operation to queue
         * @param {string} operation.type - Operation type
         * @param {string} operation.action - Action name
         * @param {*} operation.data - Operation data
         * @param {number} operation.priority - Priority (1-10, higher = more important)
         * @returns {Promise<string>} Queue ID
         */
        async queue(operation) {
            const queueItem = this._createQueueItem(operation);
            
            // Add to queue
            this._queue.push(queueItem);
            this._stats.totalQueued++;
            this._stats.currentSize = this._queue.length;

            // Limit queue size
            if (this._queue.length > QUEUE_CONFIG.maxSize) {
                this._queue.shift();
            }

            // Persist queue
            await this._persist();

            // Emit event
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('OFFLINE_QUEUE_ADDED', {
                    id: queueItem.id,
                    type: queueItem.type,
                    action: queueItem.action
                });
            }

            // Try to process if online
            if (navigator.onLine) {
                this.process();
            }

            return queueItem.id;
        }

        /**
         * Queue multiple operations
         * @param {Array} operations - Array of operations
         * @returns {Promise<Array>} Queue IDs
         */
        async queueBatch(operations) {
            const ids = [];
            for (const op of operations) {
                ids.push(await this.queue(op));
            }
            return ids;
        }

        /**
         * Process queued operations
         * @returns {Promise} Resolves when processing complete
         */
        async process() {
            if (this._processing || !navigator.onLine || this._queue.length === 0) {
                return;
            }

            this._processing = true;

            try {
                // Sort by priority (higher first) and timestamp
                const sorted = [...this._queue].sort((a, b) => {
                    if (a.priority !== b.priority) {
                        return b.priority - a.priority;
                    }
                    return a.timestamp - b.timestamp;
                });

                const processed = [];

                for (const item of sorted) {
                    try {
                        await this._processItem(item);
                        
                        // Remove from queue
                        const index = this._queue.findIndex(q => q.id === item.id);
                        if (index !== -1) {
                            this._queue.splice(index, 1);
                            processed.push(item.id);
                            this._stats.totalProcessed++;
                        }

                        // Clear any retry timeout
                        if (this._retryTimeouts.has(item.id)) {
                            clearTimeout(this._retryTimeouts.get(item.id));
                            this._retryTimeouts.delete(item.id);
                        }

                    } catch (error) {
                        item.retries++;
                        item.lastError = error.message;

                        if (item.retries >= QUEUE_CONFIG.maxRetries) {
                            // Move to failed and remove from queue
                            const index = this._queue.findIndex(q => q.id === item.id);
                            if (index !== -1) {
                                this._queue.splice(index, 1);
                                this._stats.totalFailed++;
                                
                                // Store in failed history
                                this._storeFailed(item);
                            }
                        } else {
                            // Schedule retry
                            this._scheduleRetry(item);
                        }
                    }
                }

                // Update stats
                this._stats.currentSize = this._queue.length;

                // Persist after processing
                await this._persist();

                // Emit processed event
                if (window.KynectaEventBus && processed.length > 0) {
                    window.KynectaEventBus.emit('OFFLINE_QUEUE_PROCESSED', {
                        processed,
                        remaining: this._queue.length
                    });
                }

            } finally {
                this._processing = false;
            }
        }

        /**
         * Get queue status
         * @returns {Object} Queue status
         */
        getStatus() {
            return {
                size: this._queue.length,
                processing: this._processing,
                online: navigator.onLine,
                stats: this._stats,
                itemsByType: this._queue.reduce((acc, item) => {
                    acc[item.type] = (acc[item.type] || 0) + 1;
                    return acc;
                }, {})
            };
        }

        /**
         * Clear the queue
         * @param {boolean} includeFailed - Also clear failed history
         */
        async clear(includeFailed = false) {
            this._queue = [];
            this._stats.currentSize = 0;
            
            // Clear retry timeouts
            for (const timeout of this._retryTimeouts.values()) {
                clearTimeout(timeout);
            }
            this._retryTimeouts.clear();

            await this._persist();

            if (includeFailed) {
                localStorage.removeItem('kynecta_offline_failed');
            }

            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('OFFLINE_QUEUE_CLEARED');
            }
        }

        /**
         * Retry failed items
         * @returns {Promise} Resolves when retry scheduled
         */
        async retryFailed() {
            const failed = await this._getFailed();
            
            for (const item of failed) {
                const newItem = this._createQueueItem({
                    type: item.type,
                    action: item.action,
                    data: item.data,
                    priority: item.priority
                });
                
                this._queue.push(newItem);
            }

            // Clear failed history
            localStorage.removeItem('kynecta_offline_failed');

            // Trigger processing
            if (navigator.onLine) {
                this.process();
            }
        }

        /**
         * Get failed items
         * @returns {Promise<Array>} Failed items
         */
        async getFailed() {
            return this._getFailed();
        }

        // ========== PRIVATE METHODS ==========

        async _init() {
            await this._load();
            
            // Setup listeners
            window.addEventListener('online', () => {
                this.process();
            });

            if (window.KynectaEventBus) {
                window.KynectaEventBus.on('SYNC_COMPLETED', () => {
                    this.process();
                });
            }

            // Initial process if online
            if (navigator.onLine) {
                setTimeout(() => this.process(), 1000);
            }
        }

        _createQueueItem(operation) {
            return {
                id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
                type: operation.type || 'unknown',
                action: operation.action,
                data: operation.data,
                priority: operation.priority || 5,
                timestamp: Date.now(),
                retries: 0,
                lastError: null
            };
        }

        async _processItem(item) {
            switch(item.type) {
                case 'message':
                    return this._processMessage(item);
                case 'friend':
                    return this._processFriend(item);
                case 'group':
                    return this._processGroup(item);
                case 'status':
                    return this._processStatus(item);
                case 'call':
                    return this._processCall(item);
                case 'settings':
                    return this._processSettings(item);
                default:
                    return this._processGeneric(item);
            }
        }

        async _processMessage(item) {
            if (!window.services?.message) {
                throw new Error('Message service not available');
            }

            switch(item.action) {
                case 'send':
                    return window.services.message.sendMessage(item.data);
                case 'edit':
                    return window.services.message.editMessage(
                        item.data.messageId,
                        item.data.content,
                        item.data.chatId
                    );
                case 'delete':
                    return window.services.message.deleteMessage(
                        item.data.messageId,
                        item.data.chatId
                    );
                case 'read':
                    return window.services.message.markAsRead(
                        item.data.chatId,
                        item.data.messageIds
                    );
                default:
                    throw new Error(`Unknown message action: ${item.action}`);
            }
        }

        async _processFriend(item) {
            if (!window.services?.friend) {
                throw new Error('Friend service not available');
            }

            switch(item.action) {
                case 'request':
                    return window.services.friend.sendFriendRequest(
                        item.data.userId,
                        item.data.message
                    );
                case 'accept':
                    return window.services.friend.acceptFriendRequest(item.data.requestId);
                case 'reject':
                    return window.services.friend.rejectFriendRequest(item.data.requestId);
                case 'remove':
                    return window.services.friend.removeFriend(item.data.friendId);
                case 'block':
                    return window.services.friend.blockUser(item.data.userId);
                case 'unblock':
                    return window.services.friend.unblockUser(item.data.userId);
                default:
                    throw new Error(`Unknown friend action: ${item.action}`);
            }
        }

        async _processGroup(item) {
            // Implement group processing when group service exists
            throw new Error('Group service not implemented');
        }

        async _processStatus(item) {
            // Implement status processing when status service exists
            throw new Error('Status service not implemented');
        }

        async _processCall(item) {
            // Implement call processing when call service exists
            throw new Error('Call service not implemented');
        }

        async _processSettings(item) {
            // Implement settings processing when settings service exists
            throw new Error('Settings service not implemented');
        }

        async _processGeneric(item) {
            // Try generic API endpoint
            return this._makeRequest('POST', '/api/offline/process', item);
        }

        _scheduleRetry(item) {
            if (this._retryTimeouts.has(item.id)) return;

            const delay = QUEUE_CONFIG.retryDelay * Math.pow(1.5, item.retries - 1);
            
            const timeout = setTimeout(() => {
                this._retryTimeouts.delete(item.id);
                this.process();
            }, delay);

            this._retryTimeouts.set(item.id, timeout);
        }

        _storeFailed(item) {
            const failed = JSON.parse(localStorage.getItem('kynecta_offline_failed') || '[]');
            failed.push({
                ...item,
                failedAt: Date.now()
            });
            
            // Keep only last 100 failed items
            if (failed.length > 100) {
                failed.shift();
            }
            
            localStorage.setItem('kynecta_offline_failed', JSON.stringify(failed));
        }

        async _getFailed() {
            return JSON.parse(localStorage.getItem('kynecta_offline_failed') || '[]');
        }

        async _persist() {
            if (this._useIndexedDB) {
                await this._persistToIndexedDB();
            } else {
                this._persistToLocalStorage();
            }
        }

        async _load() {
            if (this._useIndexedDB) {
                await this._loadFromIndexedDB();
            } else {
                this._loadFromLocalStorage();
            }
        }

        _persistToLocalStorage() {
            try {
                localStorage.setItem(QUEUE_CONFIG.storageKey, JSON.stringify({
                    queue: this._queue,
                    timestamp: Date.now()
                }));
            } catch (error) {
                // Fallback to memory only
            }
        }

        _loadFromLocalStorage() {
            try {
                const stored = localStorage.getItem(QUEUE_CONFIG.storageKey);
                if (stored) {
                    const data = JSON.parse(stored);
                    
                    // Filter out expired items
                    const now = Date.now();
                    this._queue = data.queue.filter(item => 
                        now - item.timestamp < QUEUE_CONFIG.maxAge
                    );
                    
                    this._stats.currentSize = this._queue.length;
                }
            } catch (error) {
                this._queue = [];
            }
        }

        async _persistToIndexedDB() {
            if (!this._db) {
                await this._openIndexedDB();
            }

            if (!this._db) return;

            try {
                const transaction = this._db.transaction(['queue'], 'readwrite');
                const store = transaction.objectStore('queue');
                
                // Clear old data
                await store.clear();
                
                // Store current queue
                for (const item of this._queue) {
                    await store.add(item);
                }
            } catch (error) {
                // Fallback to localStorage
                this._persistToLocalStorage();
            }
        }

        async _loadFromIndexedDB() {
            if (!this._db) {
                await this._openIndexedDB();
            }

            if (!this._db) {
                this._loadFromLocalStorage();
                return;
            }

            try {
                const transaction = this._db.transaction(['queue'], 'readonly');
                const store = transaction.objectStore('queue');
                const request = store.getAll();

                return new Promise((resolve) => {
                    request.onsuccess = () => {
                        const now = Date.now();
                        this._queue = request.result.filter(item => 
                            now - item.timestamp < QUEUE_CONFIG.maxAge
                        );
                        this._stats.currentSize = this._queue.length;
                        resolve();
                    };

                    request.onerror = () => {
                        this._loadFromLocalStorage();
                        resolve();
                    };
                });
            } catch (error) {
                this._loadFromLocalStorage();
            }
        }

        async _openIndexedDB() {
            return new Promise((resolve) => {
                const request = indexedDB.open('KynectaOfflineQueue', 1);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('queue')) {
                        db.createObjectStore('queue', { keyPath: 'id' });
                    }
                };

                request.onsuccess = (event) => {
                    this._db = event.target.result;
                    resolve();
                };

                request.onerror = () => {
                    this._useIndexedDB = false;
                    resolve();
                };
            });
        }

        _checkIndexedDBSupport() {
            return !!window.indexedDB;
        }

        async _makeRequest(method, endpoint, data = null) {
            let token = null;
            if (window.__PARENT_SESSION__?.token) {
                token = window.__PARENT_SESSION__.token;
            } else if (window.AUTH_SESSION?.token) {
                token = window.AUTH_SESSION.token;
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

            const response = await fetch(endpoint, options);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        }
    }

    // Initialize singleton
    const offlineQueue = new KynectaOfflineQueue();

    // Expose globally
    window.KynectaOfflineQueue = offlineQueue;

    // Add to authorities
    if (window.__KYNECTA_AUTHORITIES__) {
        window.__KYNECTA_AUTHORITIES__.offlineQueue = offlineQueue;
    }

    console.log('[OfflineQueue] ✅ Ready');
})();