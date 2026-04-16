/**
 * messageQueue.manager.js
 * Persistent offline queue for outbound messages.
 * Implements exponential backoff, deduplication, and network-aware retry.
 * @version 2.0.0
 */

(function () {
    'use strict';

    const QUEUE_KEY    = 'kynecta_msgq_v2';
    const FAILED_KEY   = 'kynecta_msgq_failed_v2';
    const MAX_RETRIES  = 10;
    const BASE_DELAY   = 2000;   // ms
    const MAX_DELAY    = 60000;  // ms
    const MAX_QUEUE    = 500;

    // ── Helpers ──────────────────────────────────────────────────────────────
    function _uuid() {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
        return 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function _backoff(attempt) {
        const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
        return delay + Math.random() * 1000; // jitter
    }

    function _loadQueue() {
        try {
            if (window.AppStorage?.getArray) return window.AppStorage.getArray(QUEUE_KEY);
            return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        } catch {
            return [];
        }
    }

    function _saveQueue(queue) {
        try {
            if (window.AppStorage?.set) {
                window.AppStorage.set(QUEUE_KEY, queue);
                return;
            }
            localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        } catch {}
    }

    function _loadFailed() {
        try {
            if (window.AppStorage?.getArray) return window.AppStorage.getArray(FAILED_KEY);
            return JSON.parse(localStorage.getItem(FAILED_KEY) || '[]');
        } catch {
            return [];
        }
    }

    function _saveFailed(list) {
        try {
            const next = list.slice(-100);
            if (window.AppStorage?.set) {
                window.AppStorage.set(FAILED_KEY, next);
                return;
            }
            localStorage.setItem(FAILED_KEY, JSON.stringify(next));
        } catch {}
    }

    // ════════════════════════════════════════════════════════════════════════
    // MessageQueueManager
    // ════════════════════════════════════════════════════════════════════════
    class MessageQueueManager {
        constructor() {
            this._queue       = _loadQueue();
            this._processing  = false;
            this._timers      = new Map();  // queueId → setTimeout handle
            this._listeners   = new Set();

            // Automatically process when connectivity is restored
            window.addEventListener('online', () => {
                console.log('[MsgQueue] 🌐 Online — flushing queue');
                this.processAll();
            });

            // Attempt initial flush on load
            if (navigator.onLine && this._queue.length > 0) {
                setTimeout(() => this.processAll(), 2000);
            }

            window.KynectaMsgQueue = this;
            console.log('[MsgQueue] ✅ Initialized', { pending: this._queue.length });
        }

        // ── Public API ───────────────────────────────────────────────────────

        /**
         * Enqueue a message for delivery.
         * @param {Object} messageData – must include localId, chatId, content, type
         * @returns {string} queueId
         */
        enqueue(messageData) {
            // Deduplication: avoid re-queuing the same local message
            const existing = this._queue.find(q => q.messageId === messageData.localId || q.messageId === messageData.id);
            if (existing) { console.log('[MsgQueue] Duplicate enqueue ignored:', existing.queueId); return existing.queueId; }

            if (this._queue.length >= MAX_QUEUE) {
                console.warn('[MsgQueue] Queue full, dropping oldest item');
                const dropped = this._queue.shift();
                this._emit('queue:dropped', dropped);
            }

            const item = {
                queueId:     _uuid(),
                messageId:   messageData.localId || messageData.id,
                chatId:      messageData.chatId,
                payload:     { ...messageData },
                retryCount:  0,
                lastAttempt: null,
                enqueuedAt:  Date.now()
            };

            this._queue.push(item);
            _saveQueue(this._queue);
            this._emit('queue:added', item);

            // Immediately try if online
            if (navigator.onLine) this._tryItem(item);

            return item.queueId;
        }

        /**
         * Remove a successfully delivered item from the queue.
         * @param {string} messageId – local message id
         */
        remove(messageId) {
            const before = this._queue.length;
            this._queue = this._queue.filter(q => q.messageId !== messageId);
            if (this._queue.length !== before) {
                _saveQueue(this._queue);
                this._emit('queue:removed', { messageId });
            }
        }

        /** Process all pending queue items in order */
        async processAll() {
            if (this._processing || !navigator.onLine) return;
            if (this._queue.length === 0) return;

            this._processing = true;
            try {
                // Sort by enqueue time: FIFO
                const sorted = [...this._queue].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
                for (const item of sorted) {
                    if (!navigator.onLine) break;
                    await this._tryItem(item);
                }
            } finally {
                this._processing = false;
            }
        }

        /** Get queue status */
        getStatus() {
            return {
                size:      this._queue.length,
                online:    navigator.onLine,
                items:     this._queue.map(q => ({ queueId: q.queueId, messageId: q.messageId, chatId: q.chatId, retries: q.retryCount })),
                failed:    _loadFailed().length
            };
        }

        /** Get failed items */
        getFailed() { return _loadFailed(); }

        /** Subscribe to queue events */
        on(callback) { this._listeners.add(callback); return () => this._listeners.delete(callback); }

        // ── Internals ────────────────────────────────────────────────────────

        async _tryItem(item) {
            if (!navigator.onLine) { this._scheduleRetry(item); return; }

            item.lastAttempt = Date.now();

            try {
                await this._sendToServer(item);

                // Success — remove from queue
                this.remove(item.messageId);

                // Update local store
                this._emit('queue:sent', { queueId: item.queueId, messageId: item.messageId });

                // Update local store status
                const localStore = window.KynectaLocalStore;
                if (localStore) {
                    await localStore.updateMessageStatus(item.messageId, 'sent');
                }

            } catch (err) {
                item.retryCount++;
                _saveQueue(this._queue);

                if (item.retryCount >= MAX_RETRIES) {
                    // Move to failed
                    this._queue = this._queue.filter(q => q.queueId !== item.queueId);
                    _saveQueue(this._queue);

                    const failed = _loadFailed();
                    failed.push({ ...item, failedAt: Date.now(), lastError: err.message });
                    _saveFailed(failed);

                    // Mark message failed in local store
                    const localStore = window.KynectaLocalStore;
                    if (localStore) {
                        await localStore.updateMessageStatus(item.messageId, 'failed');
                    }

                    this._emit('queue:failed', { queueId: item.queueId, messageId: item.messageId, error: err.message });
                    console.error('[MsgQueue] ❌ Item permanently failed:', item.queueId, err.message);
                } else {
                    this._scheduleRetry(item);
                }
            }
        }

        _scheduleRetry(item) {
            if (this._timers.has(item.queueId)) return; // already scheduled
            const delay = _backoff(item.retryCount);
            console.log(`[MsgQueue] ⏳ Retry #${item.retryCount + 1} for ${item.queueId} in ${Math.round(delay / 1000)}s`);
            const handle = setTimeout(() => {
                this._timers.delete(item.queueId);
                if (this._queue.find(q => q.queueId === item.queueId)) {
                    this._tryItem(item);
                }
            }, delay);
            this._timers.set(item.queueId, handle);
        }

        async _sendToServer(item) {
            const payload = item.payload;

            // Use parent iframe API if available (messages-core postMessage flow)
            if (window.MessagesCore && window.MessagesCore.ChatManager) {
                const cm = window.MessagesCore.ChatManager;
                if (cm.sendMessageToBackend) {
                    return cm.sendMessageToBackend(payload.content, payload.chatId, {
                        type: payload.type || 'text',
                        attachment: payload.attachment
                    });
                }
            }

            // Fallback: direct API call via api gateway
            const token = this._getToken();
            const baseUrl =
                window.api?.env?.getBaseUrl?.() ||
                window.__getApiBase?.() ||
                'http://localhost:4000/api';

            const body = {
                chatId:   payload.chatId,
                content:  payload.content,
                type:     payload.type || 'text'
            };

            if (payload.receiverId) body.receiverId = payload.receiverId;

            const doFetch = async () => {
                const res = await fetch(`${baseUrl}/messages`, {
                    method:  'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    credentials: 'include',
                    body: JSON.stringify(body)
                });

                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
                }

                return res.json();
            };

            const data = typeof window.safeApiCall === 'function'
                ? await window.safeApiCall(doFetch, null)
                : await doFetch();

            if (!data) {
                throw new Error('Message send failed');
            }

            // Update local store with server id
            const serverId = data?.data?.id || data?.id;
            if (serverId && window.KynectaLocalStore) {
                await window.KynectaLocalStore.confirmMessage(item.messageId, String(serverId), {
                    chatId:    data?.data?.chatId || payload.chatId,
                    createdAt: data?.data?.createdAt || Date.now()
                });
            }

            return data;
        }

        _getToken() {
            const storage = window.AppStorage;
            return window.__PARENT_SESSION__?.token
                || window.AUTH_SESSION?.token
                || storage?.get?.('token', null)
                || storage?.get?.('moodchat_token', null)
                || storage?.get?.('accessToken', null)
                || localStorage.getItem('token')
                || localStorage.getItem('moodchat_token')
                || localStorage.getItem('accessToken')
                || null;
        }

        _emit(event, data) {
            this._listeners.forEach(cb => { try { cb(event, data); } catch {} });
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit(event.toUpperCase().replace(':', '_'), data);
            }
        }
    }

    const msgQueue = new MessageQueueManager();
    window.KynectaMsgQueue = msgQueue;

    if (window.__KYNECTA_AUTHORITIES__) {
        window.__KYNECTA_AUTHORITIES__.msgQueue = msgQueue;
    }

    console.log('[MsgQueue] ✅ Ready');
})();
