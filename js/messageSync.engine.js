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

    // CRYPTO-PIPELINE: sender/receiver inversion for own-echoed messages, and
    // the decrypt itself, are now both owned by the single canonical
    // decryptMessageForDisplay()/resolveMessageCryptoPeer() pair in
    // e2e-encryption.js — this file no longer needs its own copy of that
    // resolution logic at all; the two call sites below pass the raw message
    // straight through and let the pipeline resolve the peer.

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
                // FIX-SINCE-FALSY-ZERO: `options.since || getSyncMeta(...) || 0` treated an
                // explicit since:0 (meaning "fetch everything, ignore the stored watermark")
                // as "caller passed nothing" — 0 is falsy in JS, so the OR-chain fell through
                // to the stored last_sync_<chatId> watermark regardless. Every plain
                // "reopen this chat" call (ChatManager.openConversation → fetchMessages,
                // with no explicit options.after) passes since:0 for exactly this reason —
                // to force a real catch-up fetch — but it was silently getting the stale
                // watermark instead. If an earlier periodic background sync ever advanced
                // that watermark past a message it failed to actually persist (a partial
                // failure, a race, a decrypt error that aborted before the merge), that
                // message became permanently unreachable through this path: reopening the
                // chat, closing and reopening again, anything — always asked the server for
                // "messages after the same too-late watermark" and always got nothing back.
                // Use a real presence check so an explicit 0 is honored as 0.
                const since = (options.since !== undefined && options.since !== null)
                    ? options.since
                    : ((await localStore.getSyncMeta(`last_sync_${chatId}`)) || 0);
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
                    const _myId = window.KynectaE2E.getMyUserId ? window.KynectaE2E.getMyUserId() : null;
                    for (const m of serverMessages) {
                        if (m && m.type === 'text' && m.content && (m.senderId || (m.sender && m.sender.id))) {
                            // FIX-DOUBLE-DECRYPT-RACE-3: this bulk/background REST sync path
                            // ran fully unguarded against the shared claim registry that
                            // messages-ui.js's two decrypt paths already coordinate through
                            // (window.__kynClaimDecrypt). A message decrypted once via the
                            // real-time socket path still gets re-fetched by this periodic
                            // sync later — without claiming it first, this path used to
                            // decrypt the SAME envelope a second time. decryptMessageForDisplay
                            // now caches by message id anyway (safe to call twice), but the
                            // claim guard still avoids wasted duplicate work.
                            const _claimKey = m.id || m.localId;
                            if (window.__kynClaimDecrypt && !window.__kynClaimDecrypt(_claimKey)) {
                                continue; // another path already claimed/decrypted this message
                            }
                            try {
                                m.content = await window.KynectaE2E.decryptMessageForDisplay(m, chatId, _myId, { fallbackText: '🔒 Encrypted message' });
                            } catch (_) { /* leave as-is; decryptMessageForDisplay already returns a safe placeholder on failure */ }
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

                // FIX-ROOT-CAUSE-NO-ACK-FROM-BACKGROUND-SYNC: a message that only ever
                // reaches this client through this catch-up fetch (the live socket
                // event was genuinely missed during a disconnect gap) rendered fine but
                // was never acknowledged back to the sender — see the matching fix and
                // full explanation on window.__kynAckMessageDelivered in
                // messages-core.ui-bridge.js. One ack mechanism, reused here for the
                // background-sync ingestion path exactly as the live socket path
                // already uses it.
                const _myIdForAck = window.KynectaE2E && window.KynectaE2E.getMyUserId ? window.KynectaE2E.getMyUserId() : null;
                for (const m of _newlyArrived) {
                    try {
                        window.dispatchEvent(new CustomEvent('kyn:incomingMessage', {
                            detail: { message: m, chatId: String(chatId) }
                        }));
                    } catch (_) {}
                    if (typeof window.__kynAckMessageDelivered === 'function') {
                        window.__kynAckMessageDelivered(m, _myIdForAck);
                    }
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

            // FIX-ROOT-CAUSE-DUAL-CONTEXT-INGEST-RACE: chat.html (the parent
            // shell) and message.html (its iframe) each open their OWN
            // independent Socket.IO connection and both join the backend's
            // `user:{uid}` room, so a single incoming message is delivered
            // to BOTH sockets — and both windows load this exact file, so
            // both independently reach this point for the same message at
            // roughly the same time. The `existing` check right above reads
            // from IndexedDB via a per-window AppCache handle; two windows
            // that both check "does this server id exist yet?" within the
            // same few milliseconds can both see nothing and both proceed to
            // decrypt (a real, stateful X3DH ratchet step — see
            // e2e-session-init.js) and both insert a new row for the same
            // server message id. Claim the exact server message id via the
            // shared cross-context registry (window.__kynCrossContextClaim,
            // defined in chat.html / js/phase15.delivery.patch.js — the same
            // primitive that already dedupes the postMessage relay for this
            // exact dual-context problem) BEFORE decrypting or persisting.
            // The window that loses the claim waits briefly for the winner
            // to finish and then reads back what it actually persisted,
            // instead of independently decrypting the same envelope a
            // second time. If the winner never finishes in time (tab
            // closed, reloaded, crashed mid-decrypt), fall through and
            // process the message here anyway — a message must never be
            // silently dropped just because another context claimed it.
            const _ingestClaimId = rawMessage.id != null ? String(rawMessage.id) : null;
            if (_ingestClaimId && window.__kynCrossContextClaim &&
                !window.__kynCrossContextClaim('message:ingest:' + _ingestClaimId)) {
                await new Promise(resolve => setTimeout(resolve, 700));
                const claimedByOther = await localStore.getMessageByServerId(_ingestClaimId);
                if (claimedByOther) return claimedByOther;
                // Fall through — the other context didn't finish; process it ourselves.
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
            if ((rawMessage.type || 'text') === 'text' && _content && window.KynectaE2E) {
                const _claimKey = rawMessage.id || rawMessage.localId;
                if (!window.__kynClaimDecrypt || window.__kynClaimDecrypt(_claimKey)) {
                    try {
                        const _myId = window.KynectaE2E.getMyUserId ? window.KynectaE2E.getMyUserId() : null;
                        const _plaintext = await window.KynectaE2E.decryptMessageForDisplay(rawMessage, _chatIdStr, _myId, {
                            fallbackText: '🔒 Encrypted message',
                            // If keys weren't ready at persist time, the pipeline
                            // queues this message and retries once they are —
                            // patch the already-saved row with the real plaintext
                            // when that eventually succeeds, instead of leaving it
                            // stuck on ciphertext until the next full re-sync.
                            onResolved: function (plaintext) {
                                localStore.getMessageByServerId(String(rawMessage.id)).then(function (existingRow) {
                                    if (existingRow) return localStore.updateMessage(existingRow.id, { content: plaintext });
                                }).catch(function () {});
                            }
                        });
                        // FIX (never persist a transient failure over real
                        // ciphertext): only replace the stored content when
                        // decryption genuinely succeeded right now. A "queued,
                        // retrying" or "keys not ready" fallback must never
                        // overwrite the ciphertext in IndexedDB — doing so would
                        // permanently destroy the only copy of the encrypted
                        // envelope, so a later retry (or restoring keys after a
                        // relogin, per the "decrypt existing messages, don't show
                        // decryption failed" requirement) would have nothing left
                        // to decrypt.
                        if (_plaintext && _plaintext !== _content && _plaintext !== '🔒 Encrypted message') {
                            _content = _plaintext;
                        }
                    } catch (_) { /* leave as ciphertext; a later pass can still recover it */ }
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

            // FIX-ROOT-CAUSE-MISSING-RECEIVER-ACK: the backend's
            // ReliableDeliveryService.deliverToUser() (src/services/phase2/
            // ReliableDeliveryService.js) schedules a timer after delivering
            // a message to the receiver's socket, and only clears it when
            // that receiver's client emits 'message:ack' with the exact
            // backend messageId — otherwise, after ACK_TIMEOUT_MS, it logs
            // "Message X undelivered ... expected ack from uid=Y" and retries
            // up to MAX_ACK_RETRIES times. No code anywhere in this frontend
            // ever emitted that event: the only client-side 'message:ack'
            // references are in ReliableDeliveryEngine.js/RealtimeSyncEngine.js,
            // and both only LISTEN for it coming from the server — neither
            // sends it. The nearest actual emit, 'msg:delivered_ack' in
            // MessageLifecycleClient.js, is a different, unrelated event name
            // the backend's webSocketService.js no longer listens for (see the
            // "consolidation pass" comment there), so it silently went
            // nowhere on both ends. Emit the exact event/shape the backend
            // expects, with the exact originalMessageId, right here at the
            // one point in the receive pipeline that has just finished
            // decrypting (or safely queuing for retry — see above),
            // validating, and durably persisting the message per PHASE 5's
            // required order: receive -> decrypt -> validate -> persist ->
            // UI update -> ACK. Both chat.html and message.html can reach
            // this call for the same message (the claim above makes that the
            // rare fall-through case, not the common one) — that's fine: the
            // backend's processAck() is idempotent, it just clears an
            // already-cleared timer on a duplicate ack.
            try {
                const rt = window.KynectaRealtime;
                if (rt && typeof rt.emit === 'function' && rawMessage.id != null) {
                    rt.emit('message:ack', {
                        messageId: String(rawMessage.id),
                        chatId:    saved.chatId,
                        status:    'delivered'
                    }, { retry: true });
                }
            } catch (_) { /* best-effort — a missed ack here still gets retried server-side */ }

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
            try { tombstones = JSON.parse(localStorage.getItem('nexopa_tombstones_v1') || '{}'); } catch (_) {}

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
                // PHASE24 ROOT-CAUSE FIX: this fetch() had no timeout at all. On a
                // stalling mobile connection (no clean error, the socket just never
                // responds) this call hangs forever. syncChat() awaits it directly,
                // and fetchMessages()'s finally block (which clears
                // _loadingMessagesByChat and turns off the loading spinner) never
                // runs until this promise settles. Because _loadingMessagesByChat is
                // keyed per-conversation, once one entry point triggers a hang for a
                // given chatId, EVERY other entry point (Friends, Status, Calls,
                // Search, Marketplace, a manual refresh) that tries to open the same
                // conversation silently no-ops at the guard check and the panel is
                // stuck loading forever — exactly the reported symptom. A bounded
                // AbortController timeout guarantees this promise always settles.
                const _ac = new AbortController();
                const _timeoutId = setTimeout(() => _ac.abort(), 15000);
                let res;
                try {
                    res = await fetch(url, {
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                        },
                        credentials: 'include',
                        signal: _ac.signal
                    });
                } finally {
                    clearTimeout(_timeoutId);
                }

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