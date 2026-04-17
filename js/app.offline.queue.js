/**
 * app.offline.queue.js  (Offline-First Edition)
 * Application-level offline queue. Delegates message operations to
 * messageQueue.manager.js; handles other operation types (friends, groups, etc.)
 * @version 2.0.0
 */

(function () {
    'use strict';

    const QUEUE_CONFIG = {
        maxSize: 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        retryDelay: 5000,
        maxRetries: 10,
        storageKey: 'kynecta_offline_queue',
        useIndexedDB: true
    };

    class KynectaOfflineQueue {
        constructor() {
            this._queue           = [];
            this._processing      = false;
            this._retryTimeouts   = new Map();
            this._db              = null;
            this._useIndexedDB    = this._checkIndexedDBSupport() && QUEUE_CONFIG.useIndexedDB;
            this._stats = { totalQueued: 0, totalProcessed: 0, totalFailed: 0, currentSize: 0 };

            this._init().then(() => {
                console.log('[OfflineQueue] ✅ Initialized');
            });

            window.KynectaOfflineQueue = this;
        }

        // ── Public API ───────────────────────────────────────────────────────

        async queue(operation) {
            // MESSAGE operations → delegate to KynectaMsgQueue if available
            if (operation.type === 'message' && operation.action === 'send') {
                const msgQueue = window.KynectaMsgQueue;
                if (msgQueue) {
                    msgQueue.enqueue(operation.data);
                    return operation.data.localId || operation.data.id || `msg_${Date.now()}`;
                }
            }

            const queueItem = this._createQueueItem(operation);
            this._queue.push(queueItem);
            this._stats.totalQueued++;
            this._stats.currentSize = this._queue.length;

            if (this._queue.length > QUEUE_CONFIG.maxSize) this._queue.shift();

            await this._persist();

            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('OFFLINE_QUEUE_ADDED', { id: queueItem.id, type: queueItem.type, action: queueItem.action });
            }

            if (navigator.onLine) this.process();
            return queueItem.id;
        }

        async queueBatch(operations) {
            const ids = [];
            for (const op of operations) ids.push(await this.queue(op));
            return ids;
        }

        /**
         * Alias for process() — called by KynectaSync on reconnect.
         * Replays all pending queued actions when network is restored.
         */
        async processAll() {
            return this.process();
        }

        async process() {
            if (this._processing || !navigator.onLine || this._queue.length === 0) return;
            this._processing = true;
            try {
                const sorted = [...this._queue].sort((a, b) => {
                    if (a.priority !== b.priority) return b.priority - a.priority;
                    return a.timestamp - b.timestamp;
                });
                const processed = [];
                for (const item of sorted) {
                    try {
                        await this._processItem(item);
                        const idx = this._queue.findIndex(q => q.id === item.id);
                        if (idx !== -1) { this._queue.splice(idx, 1); processed.push(item.id); this._stats.totalProcessed++; }
                        if (this._retryTimeouts.has(item.id)) { clearTimeout(this._retryTimeouts.get(item.id)); this._retryTimeouts.delete(item.id); }
                    } catch (error) {
                        item.retries++;
                        item.lastError = error.message;
                        if (item.retries >= QUEUE_CONFIG.maxRetries) {
                            const idx = this._queue.findIndex(q => q.id === item.id);
                            if (idx !== -1) { this._queue.splice(idx, 1); this._stats.totalFailed++; this._storeFailed(item); }
                        } else {
                            this._scheduleRetry(item);
                        }
                    }
                }
                this._stats.currentSize = this._queue.length;
                await this._persist();
                if (window.KynectaEventBus && processed.length > 0) {
                    window.KynectaEventBus.emit('OFFLINE_QUEUE_PROCESSED', { processed, remaining: this._queue.length });
                }
            } finally {
                this._processing = false;
            }
        }

        getStatus() {
            return {
                size: this._queue.length, processing: this._processing,
                online: navigator.onLine, stats: this._stats,
                itemsByType: this._queue.reduce((acc, item) => { acc[item.type] = (acc[item.type] || 0) + 1; return acc; }, {})
            };
        }

        async clear(includeFailed = false) {
            this._queue = [];
            this._stats.currentSize = 0;
            for (const timeout of this._retryTimeouts.values()) clearTimeout(timeout);
            this._retryTimeouts.clear();
            await this._persist();
            if (includeFailed) localStorage.removeItem('kynecta_offline_failed');
            if (window.KynectaEventBus) window.KynectaEventBus.emit('OFFLINE_QUEUE_CLEARED');
        }

        async retryFailed() {
            const failed = await this._getFailed();
            for (const item of failed) {
                const newItem = this._createQueueItem({ type: item.type, action: item.action, data: item.data, priority: item.priority });
                this._queue.push(newItem);
            }
            localStorage.removeItem('kynecta_offline_failed');
            if (navigator.onLine) this.process();
        }

        async getFailed() { return this._getFailed(); }

        // ── Private ──────────────────────────────────────────────────────────

        async _init() {
            await this._load();

            // Replay queue immediately when the browser goes online
            window.addEventListener('online', () => {
                console.log('[OfflineQueue] Network restored — processing queue (' + this._queue.length + ' items)');
                this.process();
            });

            // When going offline, cancel any pending retry timers to avoid
            // hammering a connection that isn't there
            window.addEventListener('offline', () => {
                console.log('[OfflineQueue] Network lost — suspending retries');
                for (const timeout of this._retryTimeouts.values()) clearTimeout(timeout);
                this._retryTimeouts.clear();
            });

            if (window.KynectaEventBus) {
                window.KynectaEventBus.on('SYNC_COMPLETED', () => this.process());
            }

            // Process any items that survived a page reload
            if (navigator.onLine && this._queue.length > 0) {
                setTimeout(() => this.process(), 1000);
            }
        }

        _createQueueItem(operation) {
            return {
                id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
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
            switch (item.type) {
                case 'message': return this._processMessage(item);
                case 'friend':  return this._processFriend(item);
                case 'group':   return this._processGroup(item);
                case 'status':  return this._processStatus(item);
                case 'call':    return this._processCall(item);
                case 'settings': return this._processSettings(item);
                default: return this._processGeneric(item);
            }
        }

        async _processMessage(item) {
            // Prefer KynectaMsgQueue for messages
            const msgQueue = window.KynectaMsgQueue;
            if (msgQueue && item.action === 'send') {
                msgQueue.enqueue(item.data);
                return;
            }

            if (!window.services?.message) throw new Error('Message service not available');
            switch (item.action) {
                case 'send':   return window.services.message.sendMessage(item.data);
                case 'edit':   return window.services.message.editMessage(item.data.messageId, item.data.content, item.data.chatId);
                case 'delete': return window.services.message.deleteMessage(item.data.messageId, item.data.chatId);
                case 'read':   return window.services.message.markAsRead(item.data.chatId, item.data.messageIds);
                default: throw new Error(`Unknown message action: ${item.action}`);
            }
        }

        async _processFriend(item) {
            if (!window.services?.friend) throw new Error('Friend service not available');
            switch (item.action) {
                case 'request':  return window.services.friend.sendFriendRequest(item.data.userId, item.data.message);
                case 'accept':   return window.services.friend.acceptFriendRequest(item.data.requestId);
                case 'reject':   return window.services.friend.rejectFriendRequest(item.data.requestId);
                case 'remove':   return window.services.friend.removeFriend(item.data.friendId);
                case 'block':    return window.services.friend.blockUser(item.data.userId);
                case 'unblock':  return window.services.friend.unblockUser(item.data.userId);
                default: throw new Error(`Unknown friend action: ${item.action}`);
            }
        }

        async _processGroup(item) {
            const groupQueue = window.GroupQueueManager;
            if (groupQueue && typeof groupQueue.enqueue === 'function') {
                groupQueue.enqueue(item.action, item.data);
                if (typeof groupQueue.processNow === 'function' && navigator.onLine) {
                    await groupQueue.processNow();
                }
                return { success: true, queued: true };
            }

            if (window.GroupSyncEngine && typeof window.GroupSyncEngine.syncAll === 'function') {
                await window.GroupSyncEngine.syncAll();
                return { success: true, synced: true };
            }

            return this._processGeneric(item);
        }

        async _processStatus(item) {
            if (window.statusCore && typeof window.statusCore.syncPending === 'function') {
                return window.statusCore.syncPending(item.data || {});
            }
            return this._processGeneric(item);
        }

        async _processCall(item) {
            return this._processGeneric(item);
        }

        async _processSettings(item) {
            try {
                if (window.LocalStoreSettings && item.data && typeof item.data === 'object') {
                    const merged = Object.assign({}, window.LocalStoreSettings.getAll?.() || {}, item.data);
                    if (typeof window.LocalStoreSettings.persist === 'function') {
                        window.LocalStoreSettings.persist(merged);
                    }
                    if (window.KynectaStore && typeof window.KynectaStore.syncFromLocalStore === 'function') {
                        window.KynectaStore.syncFromLocalStore();
                    }
                }
            } catch (error) {
                console.warn('[OfflineQueue] Failed to persist local settings before replay:', error.message);
            }

            return this._processGeneric(item);
        }
        async _processGeneric(item)  { return this._makeRequest('POST', '/api/offline/process', item); }

        _scheduleRetry(item) {
            if (this._retryTimeouts.has(item.id)) return;
            const delay = QUEUE_CONFIG.retryDelay * Math.pow(1.5, item.retries - 1);
            const timeout = setTimeout(() => { this._retryTimeouts.delete(item.id); this.process(); }, delay);
            this._retryTimeouts.set(item.id, timeout);
        }

        _storeFailed(item) {
            const failed = JSON.parse(localStorage.getItem('kynecta_offline_failed') || '[]');
            failed.push({ ...item, failedAt: Date.now() });
            if (failed.length > 100) failed.shift();
            localStorage.setItem('kynecta_offline_failed', JSON.stringify(failed));
        }

        async _getFailed() {
            return JSON.parse(localStorage.getItem('kynecta_offline_failed') || '[]');
        }

        async _persist() {
            if (this._useIndexedDB) { await this._persistToIndexedDB(); } else { this._persistToLocalStorage(); }
        }

        async _load() {
            if (this._useIndexedDB) { await this._loadFromIndexedDB(); } else { this._loadFromLocalStorage(); }
        }

        _persistToLocalStorage() {
            try { localStorage.setItem(QUEUE_CONFIG.storageKey, JSON.stringify({ queue: this._queue, timestamp: Date.now() })); } catch {}
        }

        _loadFromLocalStorage() {
            try {
                const stored = localStorage.getItem(QUEUE_CONFIG.storageKey);
                if (stored) {
                    const data = JSON.parse(stored);
                    const now  = Date.now();
                    this._queue = data.queue.filter(item => now - item.timestamp < QUEUE_CONFIG.maxAge);
                    this._stats.currentSize = this._queue.length;
                }
            } catch { this._queue = []; }
        }

        async _persistToIndexedDB() {
            if (window.AppCache && typeof window.AppCache.initDB === 'function') {
                await window.AppCache.initDB();
                const existing = await window.AppCache.getAll('syncQueue');
                await Promise.all(existing.map((item) => window.AppCache.remove('syncQueue', item.id)));
                await window.AppCache.save('syncQueue', this._queue.map((item) => ({
                    ...item,
                    id: item.id,
                    queueId: item.id,
                    type: item.type || 'unknown',
                    action: item.action || 'unknown',
                    status: item.status || 'pending',
                    userId: item.data?.userId || item.userId || null
                })));
                return;
            }
            this._persistToLocalStorage();
        }

        async _loadFromIndexedDB() {
            if (window.AppCache && typeof window.AppCache.initDB === 'function') {
                await window.AppCache.initDB();
                const all = await window.AppCache.getAll('syncQueue');
                const now = Date.now();
                this._queue = all.filter(item => now - item.timestamp < QUEUE_CONFIG.maxAge);
                this._stats.currentSize = this._queue.length;
                return;
            }
            this._loadFromLocalStorage();
        }

        async _openIndexedDB() {
            if (window.AppCache && typeof window.AppCache.initDB === 'function') {
                await window.AppCache.initDB();
                this._db = window.AppCache;
                return;
            }
            this._useIndexedDB = false;
        }

        _checkIndexedDBSupport() { return !!window.indexedDB; }

        async _makeRequest(method, endpoint, data = null) {
            const request = async () => {
                let token = window.__PARENT_SESSION__?.token ||
                    window.Session?.getToken?.() ||
                    window.AUTH_SESSION?.token ||
                    window.AppStorage?.get?.('token', null) ||
                    window.AppStorage?.get?.('moodchat_token', null) ||
                    localStorage.getItem('token') ||
                    localStorage.getItem('moodchat_token') ||
                    localStorage.getItem('accessToken') ||
                    null;

                const headers = {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                };
                const options = { method, headers, credentials: 'include' };
                if (data && method !== 'GET') options.body = JSON.stringify(data);

                if (window.api?.request?.request) {
                    return window.api.request.request(endpoint, options);
                }

                const response = await fetch(endpoint, options);
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                return response.json();
            };

            if (typeof window.safeApiCall === 'function') {
                return window.safeApiCall(request, { success: false, offline: !navigator.onLine, data: null });
            }

            if (!navigator.onLine) {
                return { success: false, offline: true, data: null };
            }

            return request();
        }
    }

    const offlineQueue = new KynectaOfflineQueue();
    window.KynectaOfflineQueue = offlineQueue;
    if (window.__KYNECTA_AUTHORITIES__) window.__KYNECTA_AUTHORITIES__.offlineQueue = offlineQueue;

    console.log('[OfflineQueue] ✅ Ready (offline-first v2)');
})();
