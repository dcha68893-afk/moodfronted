/**
 * messageSync.engine.js
 * Reconciliation engine: local ↔ server message sync.
 * Server metadata always wins; local content never overwritten until confirmed.
 * @version 2.0.0
 */

(function () {
    'use strict';

    const SYNC_INTERVAL_IDLE   = 60000;   // 60 s
    const SYNC_INTERVAL_ACTIVE = 30000;   // 30 s
    const MAX_RETRIES          = 3;
    const RETRY_DELAY          = 5000;

    class MessageSyncEngine {
        constructor() {
            this._syncing     = false;
            this._lastSync    = 0;
            this._retryCount  = 0;
            this._timer       = null;
            this._globalTimer = null;
            this._chatTimers  = new Map(); // per-chat pending sync debounce
            this._visibilityHandler = this._onVisibilityChange.bind(this);
            this._visibilityHandlerAttached = false;
            this._stats = {
                totalSyncs: 0,
                successfulSyncs: 0,
                failedSyncs: 0,
                conflictsResolved: 0,
                messagesIngested: 0
            };

            this._setupListeners();
            window.KynectaSyncEngine = this;
            console.log('[SyncEngine] ✅ Initialized');
        }

        // ── Public API ───────────────────────────────────────────────────────

        /** Trigger a full sync (debounced) */
        scheduleSyncAll(delay = 1000) {
            clearTimeout(this._globalTimer);
            this._globalTimer = setTimeout(() => this.syncAll(), delay);
        }

        /** Sync a specific chat */
        async syncChat(chatId, options = {}) {
            if (!chatId) return;
            if (!navigator.onLine) { console.log('[SyncEngine] Offline — skipping sync for', chatId); return; }

            const localStore = window.KynectaLocalStore;
            if (!localStore) return;

            try {
                const since = options.since || await localStore.getSyncMeta(`last_sync_${chatId}`) || 0;
                const serverMessages = await this._fetchServerMessages(chatId, since, options.limit || 100);
                if (!serverMessages || serverMessages.length === 0) return;

                // Merge: server meta wins, local data preserved if unconfirmed
                await localStore.mergeServerMessages(chatId, serverMessages);
                await localStore.setSyncMeta(`last_sync_${chatId}`, Date.now());

                this._stats.messagesIngested += serverMessages.length;

                // Notify UI
                this._emitChatUpdated(chatId);
                console.log(`[SyncEngine] ✅ Synced ${serverMessages.length} msgs for chat ${chatId}`);

            } catch (err) {
                console.warn('[SyncEngine] Chat sync failed:', chatId, err.message);
            }
        }

        /** Full sync of all conversations */
        async syncAll() {
            if (this._syncing) return;
            if (!navigator.onLine) return;
            if (window.KynSyncGuard && !window.KynSyncGuard.acquire('messageSyncAll')) return;

            this._syncing = true;
            if (!this._lastSyncLogAt || Date.now() - this._lastSyncLogAt > 15000) {
                console.log('[SYNC START]', 'messageSyncAll');
                this._lastSyncLogAt = Date.now();
            }
            this._stats.totalSyncs++;

            try {
                const localStore = window.KynectaLocalStore;
                if (!localStore) return;

                const convs = await localStore.getAllConversations();
                if (convs.length === 0) return;

                await Promise.allSettled(convs.map(c => this.syncChat(c.id)));

                this._lastSync   = Date.now();
                this._retryCount = 0;
                this._stats.successfulSyncs++;

                if (window.KynectaStore) {
                    window.KynectaStore.set('sync.lastSync', this._lastSync);
                    window.KynectaStore.set('sync.syncing', false);
                }

                this._emitSyncEvent('SYNC_COMPLETED', { timestamp: this._lastSync });

            } catch (err) {
                this._stats.failedSyncs++;
                this._retryCount++;
                this._emitSyncEvent('SYNC_FAILED', { error: err.message, retryCount: this._retryCount });

                if (this._retryCount <= MAX_RETRIES && navigator.onLine) {
                    setTimeout(() => this.syncAll(), RETRY_DELAY * this._retryCount);
                }
            } finally {
                this._syncing = false;
                if (window.KynSyncGuard) window.KynSyncGuard.release('messageSyncAll');
            }
        }

        /** Process a single incoming WebSocket/push message */
        async ingestIncomingMessage(rawMessage, chatId) {
            const localStore = window.KynectaLocalStore;
            if (!localStore) return null;

            // Deduplication: already have by server id?
            const existing = rawMessage.id ? await localStore.getMessageByServerId(String(rawMessage.id)) : null;
            if (existing) {
                // Server is authoritative for metadata
                await localStore.updateMessage(existing.id, {
                    status:      rawMessage.status || existing.status,
                    updatedAt:   rawMessage.updatedAt || rawMessage.createdAt || Date.now(),
                    isLocalOnly: false,
                    syncVersion: 2
                });
                return existing;
            }

            // New message from server — store locally
            const saved = await localStore.saveMessage({
                serverId:    String(rawMessage.id),
                chatId:      chatId || rawMessage.chatId,
                senderId:    rawMessage.senderId || rawMessage.sender?.id,
                content:     rawMessage.content || rawMessage.text || '',
                type:        rawMessage.type || 'text',
                sender:      rawMessage.sender || null,
                status:      'delivered',
                createdAt:   rawMessage.createdAt || rawMessage.timestamp || Date.now(),
                isLocalOnly: false,
                syncVersion: 2
            });

            this._stats.messagesIngested++;

            // Update conversation last message in local store
            await localStore.updateConversationLastMessage(saved.chatId, saved);

            this._emitChatUpdated(saved.chatId);
            return saved;
        }

        /** Mark a local pending message as sent/delivered/read from server ACK */
        async applyServerAck(localId, serverId, status, serverData = {}) {
            const localStore = window.KynectaLocalStore;
            if (!localStore) return;

            await localStore.confirmMessage(localId, String(serverId), {
                status,
                ...serverData
            });

            this._emitSyncEvent('MESSAGE_STATUS_UPDATED', { localId, serverId, status });
        }

        /** Reconcile conversations list from server */
        async syncConversations(serverConversations) {
            const localStore = window.KynectaLocalStore;
            if (!localStore || !Array.isArray(serverConversations)) return;

            for (const conv of serverConversations) {
                await localStore.saveConversation(conv);
            }
        }

        /** Get sync stats */
        getStats() {
            return { ...this._stats, lastSync: this._lastSync, isSyncing: this._syncing };
        }

        // ── Auto-sync ────────────────────────────────────────────────────────

        startAutoSync() {
            this._stopAutoSync();
            const interval = document.hidden ? SYNC_INTERVAL_IDLE : SYNC_INTERVAL_ACTIVE;
            this._timer = setInterval(() => {
                if (navigator.onLine && !this._syncing) this.syncAll();
            }, interval);

            if (!this._visibilityHandlerAttached) {
                document.addEventListener('visibilitychange', this._visibilityHandler);
                this._visibilityHandlerAttached = true;
            }
        }

        _stopAutoSync() {
            if (this._timer) { clearInterval(this._timer); this._timer = null; }
        }

        _onVisibilityChange() {
            this._stopAutoSync();
            this.startAutoSync(); // restarts with correct interval
            if (!document.hidden && navigator.onLine) this.scheduleSyncAll(500);
        }

        // ── Internals ────────────────────────────────────────────────────────

        async _fetchServerMessages(chatId, since = 0, limit = 100) {
            const token   = this._getToken();
            const baseUrl =
                window.api?.env?.getBaseUrl?.() ||
                window.__getApiBase?.() ||
                'http://localhost:4000/api';

            let url = `${baseUrl}/messages?chatId=${chatId}&limit=${limit}`;
            if (since) url += `&after=${new Date(since).toISOString()}`;

            const doFetch = async () => {
                const res = await fetch(url, {
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    credentials: 'include'
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const data = await res.json();
                return data?.data?.messages || data?.messages || data?.data || [];
            };

            if (typeof window.safeApiCall === 'function') {
                return await window.safeApiCall(doFetch, []);
            }

            return await doFetch();
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

        _emitChatUpdated(chatId) {
            try {
                window.dispatchEvent(new CustomEvent('kyn:chatSynced', { detail: { chatId, timestamp: Date.now() } }));
            } catch {}

            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('SYNC_CHAT_UPDATED', { chatId });
            }
        }

        _emitSyncEvent(type, data) {
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit(type, { ...data, timestamp: Date.now() });
            }
        }

        _setupListeners() {
            // Process queue when coming back online
            window.addEventListener('online', () => {
                this.scheduleSyncAll(1000);
                if (window.KynectaMsgQueue) window.KynectaMsgQueue.processAll();
            });

            // After login / session restore
            window.addEventListener('sessionUpdated', () => {
                setTimeout(() => this.syncAll(), 500);
            });

            // After app is notified of incoming WS message
            window.addEventListener('message', (event) => {
                const data = event.data || {};
                if (data.type === 'MESSAGE_RECEIVE' || data.type === 'NEW_MESSAGE') {
                    const msg   = data.payload || data.data || data;
                    const chatId = msg.chatId || msg.conversationId;
                    if (chatId) this.ingestIncomingMessage(msg, chatId);
                }
            });
        }
    }

    const syncEngine = new MessageSyncEngine();
    syncEngine.startAutoSync();
    window.KynectaSyncEngine = syncEngine;

    if (window.__KYNECTA_AUTHORITIES__) {
        window.__KYNECTA_AUTHORITIES__.syncEngine = syncEngine;
    }

    console.log('[SyncEngine] ✅ Ready (auto-sync started)');
})();
