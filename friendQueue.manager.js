/**
 * friendQueue.manager.js  (Offline-First Edition)
 * Persists and retries friend operations when the network is unavailable.
 *
 * Queue item structure (per spec):
 * {
 *   queueId: "uuid",
 *   action: "add|accept|reject|remove|cancel|block|unblock",
 *   friendId: "string",
 *   payload: object,         // extra data for the API call
 *   localRecordId: "string", // corresponding localStore record id
 *   retryCount: 0,
 *   lastAttempt: ISO timestamp | null,
 *   status: "pending|processing|failed|done",
 *   error: string | null
 * }
 *
 * @version 1.0.0
 */

(function () {
    'use strict';

    const STORAGE_KEY   = 'kyn_friend_queue_v1';
    const MAX_RETRIES   = 5;
    const RETRY_DELAYS  = [3000, 6000, 15000, 30000, 60000]; // exponential
    const FLUSH_DEBOUNCE = 800;

    // ── Helpers ────────────────────────────────────────────────────────────

    function generateQueueId() {
        return `fq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    function now() { return new Date().toISOString(); }

    function loadQueue() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch { return []; }
    }

    function saveQueue(queue) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
        } catch (e) {
            console.warn('[FriendQueue] Failed to persist queue:', e);
        }
    }

    // ── Action → API mapping ───────────────────────────────────────────────

    const ACTION_MAP = {
        add: {
            method: 'POST',
            endpoint: () => '/api/friends/requests/send',
            body: (item) => ({ receiverId: item.friendId, ...item.payload }),
        },
        accept: {
            method: 'POST',
            endpoint: (item) => `/api/friends/requests/${item.payload.requestId}/accept`,
            body: () => ({}),
        },
        reject: {
            method: 'POST',
            endpoint: (item) => `/api/friends/requests/${item.payload.requestId}/reject`,
            body: () => ({}),
        },
        remove: {
            method: 'DELETE',
            endpoint: (item) => `/api/friends/${item.friendId}`,
            body: () => ({}),
        },
        cancel: {
            method: 'DELETE',
            endpoint: (item) => `/api/friends/requests/${item.payload.requestId}`,
            body: () => ({}),
        },
        block: {
            method: 'POST',
            endpoint: (item) => `/api/friends/block/${item.friendId}`,
            body: () => ({}),
        },
        unblock: {
            method: 'DELETE',
            endpoint: (item) => `/api/friends/block/${item.friendId}`,
            body: () => ({}),
        },
    };

    // ── FriendQueueManager ─────────────────────────────────────────────────

    class FriendQueueManager {
        constructor() {
            this._queue         = loadQueue();
            this._processing    = false;
            this._flushTimer    = null;
            this._online        = navigator.onLine;
            this._listeners     = new Map();

            this._setupNetworkListeners();
            this._scheduleFlush(2000); // Process any leftover items on startup

            window.KynectaFriendQueue = this;
            console.log('[FriendQueue] ✅ Initialized, pending items:', this._queue.filter(i => i.status !== 'done').length);
        }

        // ── Public API ──────────────────────────────────────────────────────

        /**
         * Enqueue a friend action.
         * Deduplication: if an identical pending item exists, returns its id.
         *
         * @param {string} action       'add|accept|reject|remove|cancel|block|unblock'
         * @param {string} friendId
         * @param {object} [payload]    Extra data (e.g. { requestId, notes })
         * @param {string} [localRecordId]
         * @returns {string} queueId
         */
        enqueue(action, friendId, payload = {}, localRecordId = null) {
            if (!ACTION_MAP[action]) throw new Error(`[FriendQueue] Unknown action: ${action}`);

            // Deduplication: prevent double-queueing the same operation
            const dup = this._queue.find(item =>
                item.action   === action &&
                item.friendId === String(friendId) &&
                item.status !== 'done' &&
                item.status !== 'failed'
            );
            if (dup) {
                console.debug(`[FriendQueue] Duplicate enqueue skipped: ${action}/${friendId}`);
                return dup.queueId;
            }

            const item = {
                queueId:       generateQueueId(),
                action,
                friendId:      String(friendId),
                payload,
                localRecordId: localRecordId || null,
                retryCount:    0,
                lastAttempt:   null,
                status:        'pending',
                createdAt:     now(),
                error:         null,
            };

            this._queue.push(item);
            saveQueue(this._queue);

            this._emit('enqueued', item);
            this._scheduleFlush();
            return item.queueId;
        }

        /**
         * Remove an item from the queue by queueId.
         * Use when an action has been confirmed server-side and no retry is needed.
         */
        remove(queueId) {
            const before = this._queue.length;
            this._queue = this._queue.filter(i => i.queueId !== queueId);
            if (this._queue.length !== before) saveQueue(this._queue);
        }

        /**
         * Manually flush the queue now (e.g. called when network reconnects).
         */
        async flush() {
            if (this._flushTimer) {
                clearTimeout(this._flushTimer);
                this._flushTimer = null;
            }
            return this._processQueue();
        }

        /**
         * Get pending items count.
         */
        pendingCount() {
            return this._queue.filter(i => i.status === 'pending').length;
        }

        /**
         * Get all items (for debugging / UI indicators).
         */
        getItems() {
            return [...this._queue];
        }

        /**
         * Subscribe to queue events.
         * @param {'enqueued'|'processing'|'success'|'failed'|'maxRetries'} event
         */
        on(event, callback) {
            if (!this._listeners.has(event)) this._listeners.set(event, new Set());
            this._listeners.get(event).add(callback);
            return () => this._listeners.get(event)?.delete(callback);
        }

        /**
         * Clear all done/failed items (housekeeping).
         */
        clean() {
            this._queue = this._queue.filter(i => i.status === 'pending' || i.status === 'processing');
            saveQueue(this._queue);
        }

        // ── Private ─────────────────────────────────────────────────────────

        _scheduleFlush(delay = FLUSH_DEBOUNCE) {
            if (this._flushTimer) return;
            this._flushTimer = setTimeout(() => {
                this._flushTimer = null;
                if (this._online) this._processQueue();
            }, delay);
        }

        async _processQueue() {
            if (this._processing || !this._online) return;
            this._processing = true;

            const pending = this._queue.filter(i => i.status === 'pending');
            if (!pending.length) { this._processing = false; return; }

            console.log(`[FriendQueue] Processing ${pending.length} pending items…`);

            for (const item of pending) {
                // Check auth before processing
                if (!this._isAuthReady()) {
                    console.debug('[FriendQueue] Auth not ready, deferring flush');
                    break;
                }

                await this._processItem(item);
            }

            // Clean up done items
            this.clean();
            this._processing = false;

            // If there are still pending (failed or new) items, schedule another pass
            if (this.pendingCount() > 0) this._scheduleFlush(5000);
        }

        async _processItem(item) {
            item.status      = 'processing';
            item.lastAttempt = now();
            this._save();
            this._emit('processing', item);

            const mapping = ACTION_MAP[item.action];
            if (!mapping) {
                item.status = 'failed';
                item.error  = `Unknown action: ${item.action}`;
                this._save();
                return;
            }

            try {
                const endpoint = mapping.endpoint(item);
                const body     = mapping.body(item);
                const response = await this._makeRequest(mapping.method, endpoint, body);

                if (response && response.success !== false) {
                    item.status = 'done';
                    item.error  = null;
                    this._save();
                    this._emit('success', item, response);
                    this._applyLocalConfirmation(item, response);
                } else {
                    throw new Error(response?.error || response?.message || 'Server returned failure');
                }
            } catch (error) {
                item.retryCount++;
                item.error = error.message;

                if (item.retryCount >= MAX_RETRIES) {
                    item.status = 'failed';
                    console.error(`[FriendQueue] Max retries reached for ${item.action}/${item.friendId}:`, error.message);
                    this._emit('maxRetries', item);
                    this._rollbackLocalState(item);
                } else {
                    item.status = 'pending';
                    const delay = RETRY_DELAYS[Math.min(item.retryCount - 1, RETRY_DELAYS.length - 1)];
                    console.warn(`[FriendQueue] Retry ${item.retryCount}/${MAX_RETRIES} for ${item.action}/${item.friendId} in ${delay}ms`);
                    this._emit('failed', item, { willRetry: true, delay });
                    setTimeout(() => {
                        if (this._online && item.status === 'pending') this._processQueue();
                    }, delay);
                }

                this._save();
            }
        } // <-- THIS CLOSING BRACE WAS MISSING!

        /**
         * After a successful server response, update the localStore record.
         */
        _applyLocalConfirmation(item, response) {
            const ls = window.KynectaFriendsLocalStore;
            if (!ls || !item.localRecordId) return;

            try {
                const data = response?.data?.friendRequest || response?.data?.request || response?.data || {};
                const serverId = data.id || null;

                if (item.action === 'add' || item.action === 'accept') {
                    ls.confirm(item.localRecordId, serverId, {
                        status: item.action === 'accept' ? 'accepted' : 'pending_sent',
                        serverId,
                    });
                } else if (item.action === 'reject' || item.action === 'remove' || item.action === 'cancel') {
                    ls.updateStatus(item.localRecordId, 'removed').catch(() => {});
                } else if (item.action === 'block') {
                    ls.updateStatus(item.localRecordId, 'blocked').catch(() => {});
                } else if (item.action === 'unblock') {
                    ls.updateStatus(item.localRecordId, 'none').catch(() => {});
                }
            } catch (e) {
                console.warn('[FriendQueue] LocalStore confirmation failed:', e);
            }

            // INTEGRATION: Update FriendService cache after successful operation
            if (window.FriendService) {
                try {
                    // Invalidate relevant cache to force refresh
                    if (item.action === 'add' || item.action === 'accept' || item.action === 'remove' || item.action === 'block' || item.action === 'unblock') {
                        window.FriendService.clearCache();
                        
                        // Trigger fresh data load
                        setTimeout(async () => {
                            try {
                                await window.FriendService.loadFriends({ silent: true });
                                await window.FriendService.loadFriendRequests({ silent: true });
                                await window.FriendService.loadSentRequests({ silent: true });
                                
                                console.log('[FriendQueue] FriendService cache refreshed after:', item.action);
                            } catch (e) {
                                console.warn('[FriendQueue] Failed to refresh FriendService:', e.message);
                            }
                        }, 500);
                    }
                } catch (e) {
                    console.warn('[FriendQueue] FriendService integration failed:', e.message);
                }
            }

            // Notify sync engine to reconcile
            window.dispatchEvent(new CustomEvent('kyn:friendConfirmed', {
                detail: { item, response }
            }));
        }

        /**
         * On max-retry failure, rollback optimistic local state.
         */
        _rollbackLocalState(item) {
            const ls = window.KynectaFriendsLocalStore;
            if (!ls || !item.localRecordId) return;

            try {
                const rollbackMap = {
                    add:     'none',
                    accept:  'pending_received',
                    reject:  'pending_received',
                    remove:  'accepted',
                    cancel:  'pending_sent',
                    block:   'accepted',
                    unblock: 'blocked',
                };
                const target = rollbackMap[item.action];
                if (target) ls.updateStatus(item.localRecordId, target).catch(() => {});
            } catch (e) {
                console.warn('[FriendQueue] Rollback failed:', e);
            }

            window.dispatchEvent(new CustomEvent('kyn:friendRollback', { detail: { item } }));
        }

        async _makeRequest(method, endpoint, data) {
            // ── Offline guard (patch v1) ───────────────────────────────────
            if (!navigator.onLine) {
                throw new Error('Offline — request deferred');
            }

            // ── Token resolution with AppStorage fallback (patch v1) ───────
            let token = window.__PARENT_SESSION__?.token
                || window.AUTH_SESSION?.token
                || null;
            if (!token && window.AppStorage) {
                token = window.AppStorage.get('token')
                    || window.AppStorage.get('nexopa_token')
                    || window.AppStorage.get('accessToken')
                    || null;
            }
            if (!token) {
                token = localStorage.getItem('token')
                    || localStorage.getItem('nexopa_token')
                    || localStorage.getItem('kynecta_token')
                    || null;
            }
            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };
            const opts = { method, headers, credentials: 'include' };
            if (method !== 'GET' && method !== 'DELETE') opts.body = JSON.stringify(data);

            // Use the app's secureFetch if available
            if (window.api?.request?.request) {
                return window.api.request.request(endpoint, opts);
            }

            const res = await fetch(endpoint, opts);
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            return res.json();
        }

        _isAuthReady() {
            if (window.__PARENT_SESSION__?.token) return true;
            if (window.AUTH_SESSION?.token)       return true;
            if (window.AppStorage) {
                const t = window.AppStorage.get('token') || window.AppStorage.get('nexopa_token');
                if (t) return true;
            }
            if (localStorage.getItem('token') || localStorage.getItem('nexopa_token')) return true;
            return false;
        }

        _save() {
            saveQueue(this._queue);
        }

        _emit(event, ...args) {
            this._listeners.get(event)?.forEach(cb => {
                try { cb(...args); } catch (e) { console.error('[FriendQueue] Listener error:', e); }
            });
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit(`FRIEND_QUEUE_${event.toUpperCase()}`, { event, data: args[0] });
            }
        }

        _setupNetworkListeners() {
            window.addEventListener('online', () => {
                this._online = true;
                console.log('[FriendQueue] Network online – flushing queue');
                this._scheduleFlush(500);
            });
            window.addEventListener('offline', () => {
                this._online = false;
                console.log('[FriendQueue] Network offline – queue paused');
            });
            // Also flush when auth becomes ready
            window.addEventListener('kyn:authReady', () => this._scheduleFlush(1000));
            window.addEventListener('AUTH_READY', () => this._scheduleFlush(1000));
        }
    }

    // ── Bootstrap ───────────────────────────────────────────────────────────

    const queue = new FriendQueueManager();
    window.KynectaFriendQueue = queue;

    console.log('[FriendQueue] ✅ Ready');
})();