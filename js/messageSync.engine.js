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

    // FIX-ROOT-CAUSE-DECRYPT-OWN-REPLY: decryptFromChat(content, chatId, X)
    // always needs X = "the OTHER participant in the 1:1 chat", because
    // encryptForChat() on the sending side always derived its AES key using
    // recipientUserId (the other party) — never "whoever happens to be the
    // sender of this particular message". messages-ui.js already applies
    // this correction (isSent ? otherPartyId : message.senderId) in its own
    // render path, but this sync engine's two ingestion paths
    // (ingestIncomingMessage, and the bulk-history loop in syncChat) were
    // still passing rawMessage.senderId unconditionally.
    //
    // That's harmless for a message someone else sent (senderId IS the
    // other party already) — but the moment a user's OWN message comes back
    // through either of these paths (a socket echo/confirmation of a
    // message you just sent, or that message being re-fetched on the next
    // periodic/bulk history sync), senderId equals your OWN user id. Passed
    // straight through, decryptFromChat fetches YOUR OWN public key as the
    // "other party" and derives a shared secret with yourself — which is
    // not the key the message was actually encrypted with, so decryption
    // fails and the message renders as garbled/"[Decryption failed]" in
    // your own chat panel. This is exactly what shows up as "the receiver's
    // reply fails to decrypt" — it's the receiver's OWN client failing to
    // re-read the reply IT just sent, once it round-trips back through sync.
    function _resolveSenderIdForDecrypt(rawMessage) {
        const rawSenderId = rawMessage.senderId || (rawMessage.sender && rawMessage.sender.id);
        let myId = null;
        try {
            if (window.SessionManager && typeof window.SessionManager.getCurrentUserId === 'function') {
                myId = window.SessionManager.getCurrentUserId();
            }
        } catch (_) {}
        if (!myId) {
            try {
                if (window.MessagesCore && typeof window.MessagesCore.getCurrentUserId === 'function') {
                    myId = window.MessagesCore.getCurrentUserId();
                }
            } catch (_) {}
        }
        if (!myId && window.currentUserId) myId = window.currentUserId;
        if (!myId && window.__PARENT_SESSION__ && window.__PARENT_SESSION__.userId) {
            myId = window.__PARENT_SESSION__.userId;
        }

        const isOwnMessage = myId != null && rawSenderId != null && String(rawSenderId) === String(myId);
        if (!isOwnMessage) return rawSenderId;

        const otherPartyId = rawMessage.receiverId || rawMessage.recipientId ||
            (rawMessage.receiver && rawMessage.receiver.id) || (rawMessage.recipient && rawMessage.recipient.id);
        return otherPartyId || rawSenderId; // fall back rather than block decryption entirely
    }

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

                // FIX-E2E-WIRING: decrypt history fetched via REST. The
                // realtime path (ingestIncomingMessage above) already
                // decrypts socket-delivered messages before they reach local
                // storage — this is the other ingestion path (messages
                // pulled in bulk on chat open / periodic sync), which was
                // writing raw ciphertext envelopes straight into IndexedDB
                // untouched.
                if (window.KynectaE2E) {
                    for (const m of serverMessages) {
                        if (m && m.type === 'text' && m.content && (m.senderId || (m.sender && m.sender.id))) {
                            // FIX-DOUBLE-DECRYPT-RACE-3: this bulk/background REST sync path
                            // ran fully unguarded against the shared claim registry that
                            // messages-ui.js's two decrypt paths already coordinate through
                            // (window.__kynClaimDecrypt). A message decrypted once via the
                            // real-time socket path still gets re-fetched by this periodic
                            // sync later — without claiming it first, this path would
                            // decrypt the SAME envelope a second time, irreversibly
                            // advancing the ratchet receive chain again and corrupting
                            // every message after it in that chat.
                            const _claimKey = m.id || m.localId;
                            if (window.__kynClaimDecrypt && !window.__kynClaimDecrypt(_claimKey)) {
                                continue; // another path already claimed/decrypted this message
                            }
                            try {
                                m.content = await window.KynectaE2E.decryptFromChat(
                                    m.content,
                                    chatId,
                                    _resolveSenderIdForDecrypt(m)
                                );
                            } catch (_) { /* leave as-is; decryptFromChat already returns a safe placeholder on failure */ }
                        }
                    }
                }

                // FIX-BACKSTOP-SILENT-DELIVERY: figure out, before merging, which of
                // these server messages we didn't already have locally. The live
                // socket path (ingestIncomingMessage, above) fires 'kyn:incomingMessage'
                // for every message it writes — that's what makes the chat re-render
                // and the sidebar/badge update immediately. This periodic/background
                // path backstops the socket when it drops messages during reconnect
                // gaps, but it only ever called mergeServerMessages() straight to
                // storage — so a message delivered only through this path was really
                // there, just invisible until the recipient happened to open the chat
                // (whatever next read the store painted it in). Same signal, same
                // shape as the live path, so the existing listener in messages-ui.js
                // handles both identically.
                const _newlyArrived = [];
                for (const m of serverMessages) {
                    const _sid = m && m.id != null ? String(m.id) : null;
                    const _already = _sid ? await localStore.getMessageByServerId(_sid) : null;
                    if (!_already) _newlyArrived.push(m);
                }

                // Merge: server meta wins, local data preserved if unconfirmed
                await localStore.mergeServerMessages(chatId, serverMessages);
                await localStore.setSyncMeta(`last_sync_${chatId}`, Date.now());

                this._stats.messagesIngested += serverMessages.length;

                // Notify UI
                this._emitChatUpdated(chatId);

                for (const m of _newlyArrived) {
                    try {
                        window.dispatchEvent(new CustomEvent('kyn:incomingMessage', {
                            detail: { message: m, chatId: String(chatId) }
                        }));
                    } catch (_) {}
                }

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
                if (convs.length === 0) { return; } // _syncing reset in finally

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
            const _chatIdStr = String(chatId || rawMessage.chatId || rawMessage.conversationId || '');

            // FIX-E2E-WIRING: decrypt HERE, the actual persistence point —
            // this function is what writes content into IndexedDB via
            // localStore.saveMessage() below. Decrypting only in a caller's
            // local variable would leave the PERSISTED copy as ciphertext,
            // so the message would render correctly once from the live
            // socket event but revert to showing the raw envelope on next
            // reload, once it's read back from local storage instead.
            let _content = rawMessage.content || rawMessage.text || '';
            const _rawSenderId = rawMessage.senderId || (rawMessage.sender && rawMessage.sender.id);
            const _senderIdForDecrypt = _resolveSenderIdForDecrypt(rawMessage);
            if ((rawMessage.type || 'text') === 'text' && _content && _senderIdForDecrypt && window.KynectaE2E) {
                const _claimKey = rawMessage.id || rawMessage.localId;
                if (!window.__kynClaimDecrypt || window.__kynClaimDecrypt(_claimKey)) {
                    try {
                        _content = await window.KynectaE2E.decryptFromChat(_content, _chatIdStr, _senderIdForDecrypt);
                    } catch (_) { /* leave as-is; decryptFromChat already returns a safe placeholder on failure */ }
                }
            }

            const saved = await localStore.saveMessage({
                serverId:    String(rawMessage.id),
                chatId:      _chatIdStr,
                conversationId: _chatIdStr,
                senderId:    _rawSenderId,
                content:     _content,
                type:        rawMessage.type || 'text',
                sender:      rawMessage.sender || null,
                status:      'delivered',
                createdAt:   rawMessage.createdAt || rawMessage.timestamp || Date.now(),
                isLocalOnly: false,
                syncVersion: 2,
                // FIX-ATTACHMENT-PERSISTENCE: these were missing here too —
                // even with the backend now returning them, they'd vanish on
                // reload if this function (the actual IndexedDB writer)
                // didn't also save them.
                attachment:  rawMessage.attachment || null,
                mediaUrl:    rawMessage.mediaUrl || rawMessage.fileUrl || null,
                fileUrl:     rawMessage.fileUrl || rawMessage.mediaUrl || null,
                fileName:    rawMessage.fileName || rawMessage.attachment?.name || null,
                encrypted:   !!rawMessage.encrypted,
                originalMimeType: rawMessage.originalMimeType || null
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

        /** Reconcile conversations list from server -- FIX #2: tombstones block resurrection */
        async syncConversations(serverConversations) {
            const localStore = window.KynectaLocalStore;
            if (!localStore || !Array.isArray(serverConversations)) return;

            // FIX #2: Never restore tombstoned conversations from server
            var tombstones = {};
            try { tombstones = JSON.parse(localStorage.getItem('moodchat_tombstones_v1') || '{}'); } catch (_) {}

            for (const conv of serverConversations) {
                const id = String(conv.id || conv.chatId || conv.conversationId || '');
                if (id && tombstones[id]) continue;
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
            // FIX: Canonical base URL resolution — avoids undefined from deep optional chains
            const baseUrl =
                window.api?.env?.getBaseUrl?.() ||
                window.__getApiBase?.() ||
                window.AppConfig?.apiBase ||
                window.Environment?.apiBaseUrl ||
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
                return data?.data?.messages || data?.messages || [];
            };

            if (typeof window.safeApiCall === 'function') {
                return await window.safeApiCall(doFetch, []);
            }

            return await doFetch();
        }

        _getToken() {
            // FIX: Single source of truth — reads from AppCache session first,
            // then falls back to known localStorage keys. Matches messageQueue_manager.js.
            if (window.AppCache && typeof window.AppCache.getSession === 'function') {
                const session = window.AppCache.getSession();
                if (session && session.token) return session.token;
            }
            return window.__PARENT_SESSION__?.token
                || window.AUTH_SESSION?.token
                || localStorage.getItem('kynecta_auth') && (() => {
                    try { return JSON.parse(localStorage.getItem('kynecta_auth'))?.token; } catch { return null; }
                })()
                || localStorage.getItem('token')
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

            // After app is notified of incoming WS message (postMessage bridge)
            window.addEventListener('message', (event) => {
                const data = event.data || {};
                if (data.type === 'MESSAGE_RECEIVE' || data.type === 'NEW_MESSAGE') {
                    const msg   = data.payload || data.data || data;
                    const chatId = msg.chatId || msg.conversationId;
                    if (chatId) this.ingestIncomingMessage(msg, chatId);
                }
            });

            // FIX: Also handle real-time events from KynectaRealtime socket
            if (window.KynectaRealtime) {
                this._attachRealtimeListeners(window.KynectaRealtime);
            } else {
                // Attach when realtime manager becomes available
                window.addEventListener('kyn:realtimeReady', () => {
                    if (window.KynectaRealtime) this._attachRealtimeListeners(window.KynectaRealtime);
                });
            }
        }

        _attachRealtimeListeners(rt) {
            // New inbound message from WebSocket
            rt.on('message:new', (payload) => {
                const chatId = payload?.chatId || payload?.conversationId;
                if (chatId) this.ingestIncomingMessage(payload, chatId);
            });

            // Message edited — update local store
            rt.on('message:edited', async (payload) => {
                const localStore = window.KynectaLocalStore;
                if (!localStore || !payload?.messageId) return;
                const existing = await localStore.getMessageByServerId(String(payload.messageId));
                if (existing) {
                    await localStore.updateMessage(existing.id, {
                        content: payload.content,
                        isEdited: true,
                        editedAt: payload.editedAt || Date.now()
                    });
                    this._emitChatUpdated(existing.chatId);
                }
            });

            // Message deleted — mark locally
            rt.on('message:deleted', async (payload) => {
                const localStore = window.KynectaLocalStore;
                if (!localStore || !payload?.messageId) return;
                const existing = await localStore.getMessageByServerId(String(payload.messageId));
                if (existing) {
                    await localStore.deleteMessage(existing.id);
                    this._emitChatUpdated(existing.chatId);
                }
            });

            // Read receipts — update status
            rt.on('message:read', async (payload) => {
                const { chatId, messageIds, readBy } = payload || {};
                if (!chatId || !Array.isArray(messageIds)) return;
                const localStore = window.KynectaLocalStore;
                if (!localStore) return;
                for (const serverId of messageIds) {
                    const existing = await localStore.getMessageByServerId(String(serverId));
                    if (existing) await localStore.updateMessageStatus(existing.id, 'read', { readAt: Date.now() });
                }
                this._emitChatUpdated(chatId);
            });

            // Delivery confirmation
            rt.on('message:delivered', async (payload) => {
                if (!payload?.messageId) return;
                const localStore = window.KynectaLocalStore;
                if (!localStore) return;
                const existing = await localStore.getMessageByServerId(String(payload.messageId));
                if (existing) await localStore.updateMessageStatus(existing.id, 'delivered');
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