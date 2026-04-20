// status-cache.js - Offline Status Cache Management
// Provides IndexedDB storage and offline sync for status posts

class StatusCache {
    constructor() {
        this.dbName = 'KnectaStatusDB';
        this.dbVersion = 1;
        this.storeName = 'statuses';
        this.db = null;
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.maxCacheAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    }

    // Initialize IndexedDB
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                this.setupEventListeners();
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create statuses store
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('userId', 'userId', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('expiresAt', 'expiresAt', { unique: false });
                    store.createIndex('type', 'type', { unique: false });
                }

                // Create sync queue store
                if (!db.objectStoreNames.contains('syncQueue')) {
                    const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
                    syncStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    // Setup online/offline event listeners
    setupEventListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.processSyncQueue();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
    }

    // Store status in cache
    async cacheStatus(status) {
        if (!this.db) await this.init();
        
        const statusToCache = {
            ...status,
            cachedAt: Date.now(),
            isExpired: this.isStatusExpired(status)
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(statusToCache);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Cache multiple statuses
    async cacheStatuses(statuses) {
        if (!this.db) await this.init();
        
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        
        const promises = statuses.map(status => {
            return new Promise((resolve, reject) => {
                const statusToCache = {
                    ...status,
                    cachedAt: Date.now(),
                    isExpired: this.isStatusExpired(status)
                };
                
                const request = store.put(statusToCache);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        });

        return Promise.all(promises);
    }

    // Get cached statuses
    async getCachedStatuses(options = {}) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                let statuses = request.result;
                
                // Filter expired statuses
                if (!options.includeExpired) {
                    statuses = statuses.filter(status => !this.isStatusExpired(status));
                }

                // Filter by user if specified
                if (options.userId) {
                    statuses = statuses.filter(status => 
                        String(status.userId) === String(options.userId)
                    );
                }

                // Filter by type if specified
                if (options.type) {
                    statuses = statuses.filter(status => status.type === options.type);
                }

                // Sort by creation date (newest first)
                statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                // Limit results if specified
                if (options.limit) {
                    statuses = statuses.slice(0, options.limit);
                }

                resolve(statuses);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Get single cached status
    async getCachedStatus(statusId) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(statusId);

            request.onsuccess = () => {
                const status = request.result;
                if (status && !this.isStatusExpired(status)) {
                    resolve(status);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Add status to sync queue (for offline posting)
    async addToSyncQueue(statusData) {
        if (!this.db) await this.init();
        
        const queueItem = {
            id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            action: 'create',
            data: statusData,
            timestamp: Date.now(),
            retries: 0
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            const request = store.put(queueItem);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Process sync queue when online
    async processSyncQueue() {
        if (!this.isOnline || !this.db) return;

        const queueItems = await this.getSyncQueue();
        
        for (const item of queueItems) {
            try {
                if (item.action === 'create') {
                    const api = window.StatusAPI;
                    const result = await api.createStatus(item.data);
                    
                    if (result.success) {
                        // Remove from queue and cache the real status
                        await this.removeFromSyncQueue(item.id);
                        await this.cacheStatus(result.status);
                    } else {
                        // Increment retry count
                        item.retries++;
                        if (item.retries < 3) {
                            await this.updateSyncQueueItem(item);
                        } else {
                            // Remove after max retries
                            await this.removeFromSyncQueue(item.id);
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to process sync queue item:', error);
                item.retries++;
                if (item.retries < 3) {
                    await this.updateSyncQueueItem(item);
                } else {
                    await this.removeFromSyncQueue(item.id);
                }
            }
        }
    }

    // Get sync queue items
    async getSyncQueue() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readonly');
            const store = transaction.objectStore('syncQueue');
            const request = store.getAll();

            request.onsuccess = () => {
                const items = request.result;
                // Sort by timestamp (oldest first)
                items.sort((a, b) => a.timestamp - b.timestamp);
                resolve(items);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Update sync queue item
    async updateSyncQueueItem(item) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            const request = store.put(item);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Remove from sync queue
    async removeFromSyncQueue(itemId) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            const request = store.delete(itemId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Check if status is expired
    isStatusExpired(status) {
        if (!status.expiresAt) return false;
        return new Date(status.expiresAt) < new Date();
    }

    // Clean up old cache entries
    async cleanupCache() {
        if (!this.db) await this.init();
        
        const cutoffTime = Date.now() - this.maxCacheAge;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const status = cursor.value;
                    
                    // Remove if too old or expired
                    if (status.cachedAt < cutoffTime || this.isStatusExpired(status)) {
                        cursor.delete();
                    }
                    
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Get cache statistics
    async getCacheStats() {
        if (!this.db) await this.init();
        
        const [statuses, queueItems] = await Promise.all([
            this.getCachedStatuses({ includeExpired: true }),
            this.getSyncQueue()
        ]);

        const activeStatuses = statuses.filter(s => !this.isStatusExpired(s));
        const expiredStatuses = statuses.filter(s => this.isStatusExpired(s));

        return {
            totalCached: statuses.length,
            activeStatuses: activeStatuses.length,
            expiredStatuses: expiredStatuses.length,
            syncQueueSize: queueItems.length,
            isOnline: this.isOnline
        };
    }

    // Clear all cache
    async clearCache() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName, 'syncQueue'], 'readwrite');
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            
            const statusStore = transaction.objectStore(this.storeName);
            const syncStore = transaction.objectStore('syncQueue');
            
            statusStore.clear();
            syncStore.clear();
        });
    }
}

// Export singleton instance
window.StatusCache = new StatusCache();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.StatusCache.init().catch(console.error);
    });
} else {
    window.StatusCache.init().catch(console.error);
}
