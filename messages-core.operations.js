// =============================================
// MESSAGES CORE :: DATA MANAGERS (Chat/Friend/Group/Typing/Message/Conversation)
// One of 3 companion files (messages-core.bootstrap.js,
// messages-core.operations.js, messages-core.ui-bridge.js) that
// together replace the old single messages-core.js module.
// Loaded as plain classic scripts (defer, no type=module) IN ORDER
// so they share one global lexical scope, exactly like the original
// single IIFE did internally. Do not load out of order, and do not
// load this file without the other two.
// =============================================
'use strict';

const ChatManager = {
        _conversations: [],
        _conversationsMap: new Map(),
        _activeConversation: null,
        _currentCategory: SafeStorage.get(LOCAL_STORAGE_KEYS.CURRENT_CATEGORY, 'all') || 'all',
        _messages: [],
        _messagesMap: new Map(),
        _subscribers: new Set(),
        _loaded: false,
        _historyCache: new Map(),
        _lastMessagesFetchAt: new Map(),
        _loadingChats: false,
        _loadingMessages: false,
        _pendingConversations: new Map(),
        
        init: function() {
            this._loadFromCache();
            this._loadDemoDataIfNeeded();
            return this;
        },
        
        _loadDemoDataIfNeeded: function() {
            // FIX: Never load fake demo data. Load from IndexedDB cache instead.
            if (!this._conversations || this._conversations.length === 0) {
                if (window.KynectaLocalStore) {
                    window.KynectaLocalStore.getAllConversations().then(convs => {
                        if (convs && convs.length > 0) {
                            debugLog('[ChatManager] Offline-first: loaded', convs.length, 'cached conversations');
                            this._conversations = convs;
                            this._rebuildMap();
                            if (!this._activeConversation && this._conversations.length > 0) {
                                this._activeConversation = this._conversations[0];
                            }
                        }
                    }).catch(() => {});
                }
            }
        },
        
        _loadFromCache: function() {
            try {
                debugLog('[LOCAL LOAD]', LOCAL_STORAGE_KEYS.CHATS_CACHE);
                const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
                if (cached && Array.isArray(cached.conversations)) {
                    let _deleted = new Set();
                    try {
                        const _d = SafeStorage.getJSON('kynecta_deleted_chats_v8');
                        if (Array.isArray(_d)) _deleted = new Set(_d.map(String));
                    } catch(_) {}
                    // Also check tombstone registry
                    // FIX (chat-resurrects-on-refresh): was reading
                    // 'kynecta_tombstones_v1', which deleteConversation() never
                    // wrote to (see its fix above) — so this check always found
                    // an empty object and never actually excluded anything.
                    try {
                        const _tombstones = SafeStorage.getJSON('moodchat_tombstones_v1') || {};
                        Object.keys(_tombstones).forEach(id => _deleted.add(String(id)));
                    } catch(_) {}
                    this._conversations = ensureSafeArray(cached.conversations)
                        .filter(c => c && c.id && !_deleted.has(String(c.id)));
                    this._rebuildMap();
                    this._loaded = true;
                    if (!this._activeConversation && this._conversations.length > 0) {
                        this._activeConversation = this._conversations[0];
                    }
                }
                
                const archived = ensureSafeArray(SafeStorage.getJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, []));
                archived.forEach(chatId => {
                    const chat = this._conversationsMap.get(chatId);
                    if (chat) chat.archived = true;
                });

                this._currentCategory = this.getCurrentCategory();
                if (this._activeConversation && this._activeConversation.id) {
                    this._messages = ensureSafeArray(
                        SafeStorage.getJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${this._activeConversation.id}`, [])
                    );
                    this._rebuildMessagesMap();
                }
                if (this._conversations.length > 0) {
                    this._notifySubscribers();
                }
            } catch (e) {}
        },
        
        _rebuildMap: function() {
            this._conversationsMap.clear();
            this._conversations.forEach(chat => {
                if (chat.id) {
                    this._conversationsMap.set(chat.id, chat);
                }
            });
        },
        
        _rebuildMessagesMap: function() {
            this._messagesMap.clear();
            this._messages.forEach(msg => {
                if (msg.id) {
                    this._messagesMap.set(msg.id, msg);
                }
            });
        },
        
        getPendingConversationByReceiverId: function(receiverId) {
            if (!receiverId) return null;
            const pendingId = `pending_${receiverId}`;
            return this._conversations.find(c => c.id === pendingId || c.pendingReceiverId === receiverId);
        },
        
        getOrCreatePendingConversation: function(receiverId, userName, userAvatar) {
            if (!receiverId) return null;
            
            const existing = this.getPendingConversationByReceiverId(receiverId);
            if (existing) {
                debugLog('[ChatManager] Reusing existing pending conversation for receiverId:', receiverId);
                return existing;
            }
            
            const pendingId = `pending_${receiverId}`;
            const pendingConversation = {
                id: pendingId,
                type: 'direct',
                friendId: receiverId,
                friendName: userName || `User_${receiverId}`,
                friendAvatar: userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || `User_${receiverId}`)}&background=random&color=fff`,
                online: false,
                unreadCount: 0,
                lastMessage: '',
                lastMessageAt: Date.now(),
                pendingReceiverId: receiverId,
                isPending: true
            };
            
            this._conversations.unshift(pendingConversation);
            this._conversationsMap.set(pendingId, pendingConversation);
            this._pendingConversations.set(receiverId, pendingConversation);
            this._saveToCache();
            this._notifySubscribers();
            
            debugLog('[ChatManager] Created new pending conversation for receiverId:', receiverId);
            return pendingConversation;
        },
        
        replacePendingConversation: function(pendingId, realConversation) {
            const pendingIndex = this._conversations.findIndex(c => c.id === pendingId);
            if (pendingIndex === -1) return null;
            
            const pendingConv = this._conversations[pendingIndex];
            const receiverId = pendingConv.pendingReceiverId;
            
            const pendingMessagesKey = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${pendingId}`;
            const pendingMessages = SafeStorage.getJSON(pendingMessagesKey, []);
            
            if (receiverId) {
                this._pendingConversations.delete(receiverId);
            }
            
            const newConversation = {
                ...realConversation,
                friendName: realConversation.friendName || pendingConv.friendName,
                friendAvatar: realConversation.friendAvatar || pendingConv.friendAvatar
            };
            
            this._conversations[pendingIndex] = newConversation;
            this._conversationsMap.delete(pendingId);
            this._conversationsMap.set(newConversation.id, newConversation);
            
            const _wasActive = this._activeConversation && this._activeConversation.id === pendingId;

            if (pendingMessages.length > 0) {
                const realMessagesKey = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${newConversation.id}`;
                const existingMessages = SafeStorage.getJSON(realMessagesKey, []);
                const _realCid = String(newConversation.id);
                // Re-stamp ALL merged messages with the real chatId before writing
                const mergedMessages = [...pendingMessages, ...existingMessages]
                    .map(function(m) { return m ? { ...m, chatId: _realCid, conversationId: _realCid } : m; });
                mergedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                SafeStorage.setJSON(realMessagesKey, mergedMessages);
                SafeStorage.remove(pendingMessagesKey);

                if (_wasActive) {
                    this._messages = mergedMessages;
                }
            }

            if (_wasActive) {
                // FIX (messages disappearing right after the receiver replies):
                // this reassignment used to live ONLY inside the
                // `pendingMessages.length > 0` branch above. The receiver's side
                // of a brand-new conversation typically has zero pending-cached
                // messages (they only ever received messages here, which are
                // already stored under the real chatId via _handleMessageReceive,
                // never under a "pending_" key) — so this never ran for them, and
                // _activeConversation stayed permanently stuck referencing the old
                // pending_X id even after the real conversation existed. Any later
                // render/filter comparing against activeChat.id would then mismatch
                // the real chatId on every new message, making the chat look empty.
                this._activeConversation = newConversation;
                if (!(pendingMessages.length > 0)) {
                    // Re-stamp any in-memory messages that were tagged with the
                    // pending id so they still match under the real id too.
                    this._messages = (this._messages || []).map(m =>
                        (m && String(m.chatId || m.conversationId) === String(pendingId))
                            ? { ...m, chatId: newConversation.id, conversationId: newConversation.id }
                            : m
                    );
                }
                this._rebuildMessagesMap();
            }
            
            this._saveToCache();
            this._notifySubscribers();
            
            debugLog('[ChatManager] Replaced pending conversation', pendingId, 'with real conversation', newConversation.id);
            
            try {
                window.dispatchEvent(new CustomEvent('conversationReplaced', {
                    detail: { oldId: pendingId, newConversation }
                }));
            } catch (e) {}
            
            return newConversation;
        },
        
        async fetchConversations() {
            if (!SessionManager.isAuthenticated()) {
                debugLog('[ChatManager] Not authenticated — loading conversations from cache');
                // FIX: Always load cache, never demo data
                this._loadDemoDataIfNeeded();
                return;
            }
            
            if (this._loadingChats) return;
            this._loadingChats = true;
            this._notifyLoading('chats', true);
            
            try {
                debugLog('[ChatManager] 📤 Fetching conversations from backend');
                const conversations = await makeApiRequest('/chats', 'GET');
                
                debugLog(`[ChatManager] 📥 Received conversations response:`, conversations);
                
                let chatsArray = [];
                if (conversations && Array.isArray(conversations)) {
                    chatsArray = conversations;
                } else if (conversations && conversations.chats && Array.isArray(conversations.chats)) {
                    chatsArray = conversations.chats;
                } else if (conversations && conversations.data && conversations.data.chats && Array.isArray(conversations.data.chats)) {
                    chatsArray = conversations.data.chats;
                } else if (conversations && conversations.data && Array.isArray(conversations.data)) {
                    chatsArray = conversations.data;
                }
                
                debugLog(`[ChatManager] 📥 Extracted ${chatsArray.length} chats from response`);
                
                if (chatsArray.length > 0) {
                    this.setConversations(chatsArray);
                    // FIX: Also sync to local store for next offline boot
                    if (window.KynectaSyncEngine) {
                        window.KynectaSyncEngine.syncConversations(chatsArray);
                    }
                    this._notifySuccess('Conversations loaded');
                } else {
                    // FIX: Fall back to cache, not demo data
                    this._loadDemoDataIfNeeded();
                    this.setConversations(this._conversations || []);
                    debugLog('[ChatManager] No conversations received from server');
                }
            } catch (error) {
                console.error('[ChatManager] Failed to fetch conversations:', error);
                // FIX: Load from cache on failure, not demo data
                this._loadDemoDataIfNeeded();
            } finally {
                this._loadingChats = false;
                this._notifyLoading('chats', false);
            }
        },
        
        async fetchMessages(conversationId, options = {}) {
            if (conversationId && typeof conversationId === 'string' && conversationId.startsWith('pending_')) {
                debugLog('[ChatManager] Skipping message fetch for pending conversation');
                return;
            }

            const fetchKey = String(conversationId);
            const now = Date.now();
            const forceFetch = options.force === true;
            // FIXED: first open (lastFetchAt=0) always fetches immediately.
            // Subsequent calls throttled to 5s (down from 8s) for responsiveness.
            const minFetchGap = typeof options.minFetchGap === 'number' ? options.minFetchGap : 5000;
            const lastFetchAt = this._lastMessagesFetchAt.get(fetchKey) || 0;
            if (!forceFetch && lastFetchAt > 0 && now - lastFetchAt < minFetchGap) {
                return;
            }
            this._lastMessagesFetchAt.set(fetchKey, now);

            // FIX Bug3: Honor merge:true — when called with merge:true (e.g. from SYNC_STARTED),
            // set options.after to the timestamp of the last known message so we only
            // fetch NEW messages and merge them in, instead of wiping all existing messages.
            if (options.merge && this._messages && this._messages.length > 0) {
                const lastMsg = this._messages[this._messages.length - 1];
                options.after = options.after || lastMsg?.createdAt || lastMsg?.timestamp;
                debugLog('[ChatManager] merge:true — fetching only messages after', options.after);
            }

            // FIXED: Preserve realtime messages that arrived before this chat was opened.
            // fetchMessages → setMessages clears _messages, losing them.
            const _rtPreserve = (this._messages || []).filter(function(m) {
                return String(m.chatId || m.conversationId || '') === String(conversationId) && !m.isLocalOnly;
            });

            let _gotLocalMsgs = false;
            if (window.KynectaLocalStore) {
                try {
                    const localMsgs = await window.KynectaLocalStore.getMessagesByChat(conversationId, { limit: options.limit || 100 });
                    if (localMsgs && localMsgs.length > 0) {
                        this.setMessages(localMsgs, conversationId);
                        _gotLocalMsgs = true;
                    }
                } catch (_lsErr) {}
            }
            // FIX: this localStorage snapshot (kynecta_messages_v8_<chatId>) was being
            // written on 'beforeunload' and on visibilitychange-hidden, but nothing
            // anywhere ever read it back — so it provided zero benefit and any gap in
            // IndexedDB (still hydrating on cold start, a device where it's unsupported,
            // etc.) meant messages simply didn't show until/unless the network fetch
            // below succeeded. Use it as an immediate-paint fallback.
            if (!_gotLocalMsgs && conversationId) {
                try {
                    const _legacyKey = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${conversationId}`;
                    const _legacyRaw = localStorage.getItem(_legacyKey);
                    if (_legacyRaw) {
                        const _legacyMsgs = JSON.parse(_legacyRaw);
                        if (Array.isArray(_legacyMsgs) && _legacyMsgs.length > 0) {
                            this.setMessages(_legacyMsgs, conversationId);
                            this._notifySubscribers();
                        }
                    }
                } catch (_legacyErr) {}
            }

            if (!navigator.onLine) {
                debugLog('[ChatManager] Offline mode - using local store data');
                const cachedMessages = this.loadPreviousMessages(conversationId);
                if (cachedMessages && cachedMessages.length > 0) {
                    this.setMessages(cachedMessages, conversationId);
                    this._notifySubscribers();
                }
                return;
            }

            if (!SessionManager.isAuthenticated()) {
                debugLog('[ChatManager] Not authenticated — loading messages from local cache');
                // FIX: Load from IndexedDB, not fake demo messages
                if (conversationId && window.KynectaLocalStore) {
                    window.KynectaLocalStore.getMessagesByChat(conversationId).then(cached => {
                        if (cached && cached.length > 0) {
                            this.setMessages(cached, conversationId);
                            this._notifySubscribers();
                        }
                    }).catch(() => {});
                }
                return;
            }

            if (!conversationId) {
                console.warn('[ChatManager] Cannot fetch messages - no conversation ID');
                return;
            }

            if (this._loadingMessages) return;
            this._loadingMessages = true;
            this._notifyLoading('messages', true);

            try {
                debugLog(`[ChatManager] Fetching messages for conversation: ${conversationId}`);

                if (window.KynectaLocalStore && window.KynectaSyncEngine) {
                    await window.KynectaSyncEngine.syncChat(conversationId, {
                        since: options.after || 0,
                        limit: options.limit || 100
                    });

                    const hydratedMessages = await window.KynectaLocalStore.getMessagesByChat(conversationId, {
                        limit: options.limit || 100,
                        before: options.before || null
                    });

                    // FIX Bug3: When merge:true, add only new messages instead of replacing all
                    if (options.merge && hydratedMessages && hydratedMessages.length > 0) {
                        const _normalizeTs2 = _normalizeTs;
                        for (const m of hydratedMessages) {
                            const k = String(m.serverId || m.id || '');
                            if (k && !this._messagesMap.has(k)) {
                                this._messages.push(m);
                                this._messagesMap.set(k, m);
                            }
                        }
                        this._messages.sort((a, b) => _normalizeTs2(a) - _normalizeTs2(b));
                        this._notifySubscribers();
                        this._notifySuccess('Messages synced');
                    } else {
                        this.setMessages(hydratedMessages, conversationId);
                    }
                    // FIXED: Merge back realtime messages that arrived before chat open
                    if (_rtPreserve && _rtPreserve.length > 0) {
                        const _tsF2 = _normalizeTs; // FIX: consolidated to canonical _normalizeTs
                        for (const _pm of _rtPreserve) {
                            const _pmId = String(_pm.serverId || _pm.id || '');
                            if (_pmId && !this._messagesMap.has(_pmId)) {
                                this._messages.push(_pm);
                                this._messagesMap.set(_pmId, _pm);
                                // Also save to IDB so it persists
                                if (window.KynectaLocalStore) window.KynectaLocalStore.saveMessage(_pm).catch(()=>{});
                            }
                        }
                        this._messages.sort(function(a, b) { return _tsF2(a) - _tsF2(b); });
                    }
                    this._notifySuccess('Messages loaded');
                    return;
                }

                const params = {
                    chatId: conversationId,
                    before: options.before,
                    limit: options.limit || 50
                };
                const response = await makeApiRequest('/messages', 'GET', null, params);

                let messagesArray = [];
                if (response && Array.isArray(response)) {
                    messagesArray = response;
                } else if (response && response.messages && Array.isArray(response.messages)) {
                    messagesArray = response.messages;
                } else if (response && response.data && response.data.messages && Array.isArray(response.data.messages)) {
                    messagesArray = response.data.messages;
                } else if (response && response.data && Array.isArray(response.data)) {
                    messagesArray = response.data;
                }

                if (messagesArray.length > 0) {
                    const normalizedMessages = messagesArray.map(msg => ({
                        id: msg.id,
                        localId: msg.localId || msg.id,
                        serverId: msg.serverId || msg.id,
                        content: msg.content || msg.text || '',
                        type: msg.type || msg.messageType || 'text',
                        senderId: msg.senderId || msg.sender?.id,
                        sender: msg.sender,
                        timestamp: msg.createdAt || msg.timestamp || Date.now(),
                        createdAt: msg.createdAt || msg.timestamp || Date.now(),
                        status: msg.status || 'delivered',
                        conversationId: conversationId,
                        chatId: conversationId,
                        isLocalOnly: false
                    }));
                    // FIX Bug3: When merge:true, add only new messages instead of replacing all
                    if (options.merge && normalizedMessages.length > 0) {
                        const _normalizeTs3 = _normalizeTs;
                        for (const m of normalizedMessages) {
                            const k = String(m.serverId || m.id || '');
                            if (k && !this._messagesMap.has(k)) {
                                this._messages.push(m);
                                this._messagesMap.set(k, m);
                            }
                        }
                        this._messages.sort((a, b) => _normalizeTs3(a) - _normalizeTs3(b));
                        this._notifySubscribers();
                        this._notifySuccess('Messages synced');
                    } else {
                        this.setMessages(normalizedMessages, conversationId);
                    }
                    // Merge back realtime messages that arrived before this fetch completed
                    if (_rtPreserve && _rtPreserve.length > 0) {
                        const _tsRt = _normalizeTs; // FIX: consolidated to canonical _normalizeTs
                        for (const _pm of _rtPreserve) {
                            const _pmId = String(_pm.serverId || _pm.id || '');
                            if (_pmId && !this._messagesMap.has(_pmId)) {
                                this._messages.push(_pm);
                                this._messagesMap.set(_pmId, _pm);
                                if (window.KynectaLocalStore) window.KynectaLocalStore.saveMessage(_pm).catch(()=>{});
                            }
                        }
                        this._messages.sort(function(a, b) { return _tsRt(a) - _tsRt(b); });
                    }
                    this._notifySuccess('Messages loaded');
                } else {
                    // FIX Bug2: server returned 0 messages — before blanking the panel,
                    // check IDB. This covers back→reopen where the API is throttled/races
                    // and returns [] while IDB still has the full history.
                    if (window.KynectaLocalStore) {
                        const _idbFallback = await window.KynectaLocalStore.getMessagesByChat(conversationId, {
                            limit: options.limit || 100
                        }).catch(() => []);
                        this.setMessages(_idbFallback && _idbFallback.length > 0 ? _idbFallback : [], conversationId);
                    } else {
                        this.setMessages([], conversationId);
                    }
                }
            } catch (error) {
                console.error('[ChatManager] Failed to fetch messages:', error);
                // FIX: Always fall back to IndexedDB cache — never fake demo messages
                if (window.KynectaLocalStore) {
                    const fallbackMessages = await window.KynectaLocalStore.getMessagesByChat(conversationId, {
                        limit: options.limit || 100,
                        before: options.before || null
                    }).catch(() => []);
                    this.setMessages(fallbackMessages || [], conversationId);
                } else {
                    this._notifyError(error.message);
                    this.setMessages([], conversationId);
                }
            } finally {
                this._loadingMessages = false;
                this._notifyLoading('messages', false);
            }
        },
        
        async sendMessageToBackend(content, conversationId, options = {}) {
            if (!ensureActive('sendMessage')) {
                throw new Error('Cannot send message - module not active');
            }
            
            if (!SessionManager.isAuthenticated()) {
                throw new Error('Not authenticated');
            }
            
            if (!conversationId) {
                throw new Error('No conversation ID');
            }
            
            if (!content && !options.attachment) {
                throw new Error('Empty message');
            }
            
            const isPending = typeof conversationId === 'string' && conversationId.startsWith('pending_');
            let requestBody = {};
            let _recipientUserIdForEncryption = null;
            
            if (isPending) {
                let pendingConv = this._conversationsMap.get(conversationId);
                // FIX-ROOT-CAUSE-MISSING-RECEIVERID (defense in depth): this
                // iframe's local _conversationsMap can be missing or stale if
                // the postMessage that was supposed to seed this pending
                // conversation (e.g. OPEN_CHAT_WITH_USER) got dropped or hasn't
                // landed yet — see the ALLOWED_SOURCES fix in
                // messages-core.bootstrap.js for the main cause. Since the
                // receiverId is embedded in the conversationId itself
                // ('pending_<receiverId>'), recover it from there rather than
                // failing the send outright.
                if (!pendingConv || !pendingConv.pendingReceiverId) {
                    const _fallbackReceiverId = conversationId.slice('pending_'.length);
                    if (_fallbackReceiverId) {
                        debugLog(`[ChatManager] ⚠️ Pending conversation missing/incomplete in local map — recovering receiverId from conversationId: ${_fallbackReceiverId}`);
                        pendingConv = pendingConv || {};
                        pendingConv.pendingReceiverId = pendingConv.pendingReceiverId || _fallbackReceiverId;
                    }
                }
                if (!pendingConv || !pendingConv.pendingReceiverId) {
                    throw new Error('Invalid pending conversation: missing receiverId');
                }
                debugLog(`[ChatManager] 📤 Sending message to pending conversation - using receiverId: ${pendingConv.pendingReceiverId}`);
                _recipientUserIdForEncryption = pendingConv.pendingReceiverId;
                requestBody = {
                    receiverId: pendingConv.pendingReceiverId,
                    localId: options.localId || options.id || null,
                    content: content,
                    type: options.type || 'text',
                    attachment: options.attachment,
                    replyToId: options.replyToId || options.replyTo,
                    mentions: options.mentions,
                    metadata: options.metadata || window.__pendingMsgMeta || undefined,
                };
                if (window.__pendingMsgMeta) delete window.__pendingMsgMeta;
            } else {
                debugLog(`[ChatManager] 📤 Sending message to real conversation - using chatId: ${conversationId}`);
                const _conv = this._conversationsMap.get(conversationId);
                _recipientUserIdForEncryption = _conv?.friendId || _conv?.otherParticipant?.id || null;
                requestBody = {
                    chatId: conversationId,
                    localId: options.localId || options.id || null,
                    content: content,
                    type: options.type || 'text',
                    attachment: options.attachment,
                    replyToId: options.replyToId || options.replyTo,
                    mentions: options.mentions,
                    // FIX: pass metadata so gif/poll/sticker data reaches the backend
                    metadata: options.metadata || window.__pendingMsgMeta || undefined,
                };
                // Clear pending metadata after use
                if (window.__pendingMsgMeta) delete window.__pendingMsgMeta;
            }

            // ── FIX-E2E-WIRING: encrypt before transport, never store plaintext ──
            if (requestBody.type === 'text' && typeof content === 'string' && _recipientUserIdForEncryption && window.KynectaE2E) {
                try {
                    requestBody.content = await window.KynectaE2E.encryptForChat(
                        content,
                        conversationId,
                        _recipientUserIdForEncryption
                    );
                } catch (e) {
                    console.warn('[ChatManager] E2E encryption failed, sending as plaintext:', e?.message);
                }
            }

            // ── PHASE10: HybridTransportRuntime — THE canonical transport path ──────
            // Priority: INTERNET → LAN → MESH → OFFLINE QUEUE
            // ALL sends go through this path. No module bypasses it.
            let result;
            const hybridEngine = window.__HybridTransportEngine;
            const offlineQueue = window.__OfflineMessageQueue;
            const lanEngine    = window.__LANCommunicationEngine;
            const bestTransport = hybridEngine?.getBestTransport?.() || 'INTERNET';
            // PHASE10-FIX: In the iframe architecture, the messages iframe uses a
            // BRIDGED socket through the parent — _socket is null/disconnected in child frames.
            // Must check the iframe bridge state, not the raw socket directly.
            const socketConnected =
                window.KynectaRealtime?._socket?.connected === true ||           // parent frame direct
                window.KynectaRealtime?.state === 'authenticated' ||             // bridge state
                window.KynectaRealtime?.isConnected?.() === true ||              // compat method
                window.__kynParentReady === true ||                              // parent shell ready
                document.querySelector('meta[name="iframe-mode"]') !== null;    // iframe marker

            // Only go offline if browser is genuinely offline AND no bridge is active
            const isOnline = navigator.onLine && (
                socketConnected ||
                window.__kynParentReady === true ||
                window.parent !== window  // running in an iframe = parent has the socket
            );

            // ── OFFLINE PATH: only enqueue when truly offline ──────────────────
            if (!isOnline && offlineQueue) {
                debugLog('[ChatManager] 📦 PHASE10 OFFLINE — queuing with guaranteed delivery');
                const queueEntry = await offlineQueue.enqueue({
                    ...requestBody,
                    localId: requestBody.localId || options.localId,
                    type: 'message',
                });
                result = {
                    message: {
                        id: queueEntry.id,
                        localId: queueEntry.id,
                        chatId: conversationId,
                        content,
                        status: 'queued',
                        senderId: options.senderId,
                        createdAt: new Date().toISOString(),
                    },
                    chatId: conversationId,
                    queued: true,
                };
            } else {
                // ── ONLINE PATH ────────────────────────────────────────────
                // FIX-RATCHET-DESYNC: this used to ALSO speculatively fire a LAN
                // direct send here, in parallel with the internet POST below,
                // whenever bestTransport()/lanEngine.hasPeers() believed a LAN
                // peer was present (the comment literally called this "additive
                // not exclusive"). Both sends carried the exact same already
                // double-ratchet-encrypted requestBody.content — one real
                // ciphertext, delivered to the receiver via TWO independent code
                // paths (chat.html's 'lan:message' handler vs its normal
                // 'message:new' handler). LAN delivery is near-instant
                // (direct peer-to-peer / mesh) while the internet path is a full
                // round trip (POST → DB save → Socket.IO broadcast, ~1-2s per the
                // FORENSIC logs), so sending two messages in quick succession let
                // message #2's LAN copy arrive before message #1's internet copy.
                // The double-ratchet's skipped-key window tolerates ordinary
                // out-of-order arrival, but a genuine duplicate of the same
                // ciphertext racing in through two differently-shaped delivery
                // paths corrupted ratchet ordering — surfacing as intermittent
                // "[Decryption failed — message may be out of order or
                // corrupted]" and one-directional delivery breakage. It also
                // contradicted the backend's own internet-first / LAN-fallback-
                // only design for time-sensitive events (see HybridTransportRuntime
                // PRIORITY / UnifiedRuntimeOrchestrator.deliver's timesSensitive
                // branch) — the frontend was opportunistically parallel-sending
                // where the backend never does. LAN/mesh is still reachable below
                // as a genuine fallback (step "Mesh relay fallback"), which only
                // fires if the internet POST actually fails — never in parallel
                // with it.

                // Internet (primary, and now the ONLY path attempted up front)
                try {
                    result = await makeApiRequest('/messages', 'POST', requestBody);
                    hybridEngine?.recordSuccess?.('INTERNET', 0);
                } catch (sendErr) {
                    console.warn('[ChatManager] PHASE10 Internet send failed, checking fallbacks:', sendErr.message);
                    hybridEngine?.recordFailure?.('INTERNET');

                    // 3. Mesh relay fallback
                    // PHASE11-FIX: Correct global name is __MeshRelayEngine (not __MeshMessagesTransport)
                    const meshEngine = window.__MeshRelayEngine || window.__MeshMessagesTransport || window.__MeshEngine;
                    let meshSent = false;
                    if (meshEngine && (meshEngine.isConnected?.() || meshEngine.peers?.size > 0 || meshEngine._routing?._routes?.size > 0)) {
                        try {
                            meshEngine.send?.({ ...requestBody, _via: 'MESH' });
                            meshSent = true;
                            hybridEngine?.recordSuccess?.('MESH', 0);
                            debugLog('[ChatManager] ✅ PHASE10 MESH relay delivery');
                        } catch (_meshErr) { hybridEngine?.recordFailure?.('MESH'); }
                    }

                    // 4. Offline queue — guaranteed delivery on reconnect
                    if (!meshSent && offlineQueue) {
                        const queueEntry = await offlineQueue.enqueue({
                            ...requestBody,
                            localId: requestBody.localId || options.localId,
                            type: 'message',
                        });
                        result = {
                            message: {
                                id: queueEntry.id,
                                localId: queueEntry.id,
                                chatId: conversationId,
                                content,
                                status: 'queued',
                                senderId: options.senderId,
                                createdAt: new Date().toISOString(),
                            },
                            chatId: conversationId,
                            queued: true,
                        };
                    } else {
                        throw sendErr;
                    }
                }
            }
            
            debugLog(`[ChatManager] 📥 Message sent successfully:`, result);
            
            if (isPending && result && (result.chatId || (result.data && result.data.chatId))) {
                const realChatId = result.chatId || result.data.chatId;
                if (realChatId) {
                    const pendingConv = this._conversationsMap.get(conversationId) || {};
                    const normalizedConv = {
                        ...pendingConv,
                        ...(result.conversation || result.data?.conversation || {}),
                        id: realChatId,
                        chatId: realChatId,
                        friendId: pendingConv.pendingReceiverId || pendingConv.friendId || result.receiverId || result.data?.receiverId,
                        friendName: pendingConv.friendName || pendingConv.userName || 'Chat',
                        friendAvatar: pendingConv.friendAvatar || pendingConv.userAvatar || '',
                        lastMessage: content,
                        lastMessageAt: Date.now(),
                        unreadCount: 0,
                        type: 'direct',
                        isPending: false
                    };
                    this.replacePendingConversation(conversationId, normalizedConv);
                    result.chatId = realChatId;

                    // BUG-007 FIX: Trigger a background fetchConversations so the sidebar
                    // shows the new real chat with correct server-side data. replacePendingConversation
                    // updates the in-memory store immediately (so UI renders the chat), then this
                    // async refresh overwrites with the authoritative server version (with correct
                    // participant info, unread counts, etc.). The setTimeout ensures the return path
                    // completes first — so the caller's UI update isn't delayed by the fetch.
                    setTimeout(() => {
                        ChatManager.fetchConversations().catch(() => {});
                    }, 300);
                }
            }
            
            return result;
        },
        
        setConversations: function(conversations) {
            const currentUserId = SessionManager.getUserId();
            const uniqueMap = new Map();
            const seenFriendIds = new Set();
            let _deleted = new Set();
            try {
                const _d = SafeStorage.getJSON('kynecta_deleted_chats_v8');
                if (Array.isArray(_d)) _deleted = new Set(_d.map(String));
            } catch(_) {}
            // Also check tombstone registry - prevents server response from resurrecting deleted chats
            // FIX (chat-resurrects-on-refresh): was reading 'kynecta_tombstones_v1',
            // which deleteConversation() never wrote to (see its fix above) — so
            // this filter, despite the comment describing exactly the bug being
            // fixed here, always found an empty object and let every chat
            // through, including ones just deleted locally moments earlier.
            try {
                const _tombstones = SafeStorage.getJSON('moodchat_tombstones_v1') || {};
                Object.keys(_tombstones).forEach(id => _deleted.add(String(id)));
            } catch(_) {}

            ensureSafeArray(conversations).forEach(chat => {
                if (!chat || !chat.id) return;
                if (_deleted.has(String(chat.id))) return;
                
                let friendId = getConversationPeerId(chat, currentUserId);

                // FIX Bug3: getConversationPeerId returns '' when the conversation object
                // only has `chatParticipants:[{userId}]` (server shape) or `chatCreator`
                // rather than the full `participants`/`participantIds` arrays it checks.
                // Without a valid friendId, seenFriendIds never deduplicates and every
                // copy of the same conversation passes through → duplicate sidebar entries.
                if (!friendId) {
                    const _myId = String(currentUserId || '');
                    // chatParticipants: [{userId, joinedAt}, …]
                    if (Array.isArray(chat.chatParticipants) && chat.chatParticipants.length) {
                        const _peer = chat.chatParticipants.find(function(p) {
                            const pid = String(p.userId || p.id || '');
                            return pid && pid !== _myId;
                        });
                        if (_peer) friendId = String(_peer.userId || _peer.id);
                    }
                    // chatCreator field
                    if (!friendId && chat.chatCreator) {
                        const _cid = String(chat.chatCreator.id || chat.chatCreator.userId || '');
                        if (_cid && _cid !== _myId) friendId = _cid;
                    }
                    // createdBy scalar
                    if (!friendId && chat.createdBy) {
                        const _cid = String(chat.createdBy);
                        if (_cid && _cid !== _myId) friendId = _cid;
                    }
                    // FIX: last-resort — the lastMessage sub-object's senderId/receiverId.
                    // Malformed chat rows with none of the structures above (participants,
                    // chatParticipants, chatCreator, createdBy) still usually carry a real
                    // lastMessage with a genuine senderId, since a message clearly did get
                    // sent/received on this chat. Without this, friendId stays empty for
                    // these rows, they skip the seenFriendIds dedup check just below
                    // entirely, and a fresh duplicate row gets created every time instead
                    // of ever being matched to the real conversation for that friend.
                    if (!friendId && chat.lastMessage) {
                        const _senderId = String(chat.lastMessage.senderId || '');
                        const _receiverId = String(chat.lastMessage.receiverId || '');
                        if (_senderId && _senderId !== _myId) friendId = _senderId;
                        else if (_receiverId && _receiverId !== _myId) friendId = _receiverId;
                    }
                }
                
                if (friendId && seenFriendIds.has(friendId)) {
                    debugLog(`[ChatManager] Skipping duplicate conversation for friend ${friendId}`);
                    return;
                }
                
                if (friendId) {
                    seenFriendIds.add(friendId);
                }
                
                // FIX: compare ids as strings to prevent numeric/string type mismatch
                const friendRecord = friendId && FriendManager
                    ? (FriendManager.getFriend(friendId) || FriendManager.getFriend(parseInt(friendId, 10)))
                    : null;
                const otherUser = chat.otherParticipant ||
                    ensureSafeArray(chat.participants).find(p => getEntityUserId(p) !== String(currentUserId)) ||
                    friendRecord;

                // FIX: build real display name from firstName+lastName when available
                const _fn = otherUser && otherUser.firstName ? otherUser.firstName.trim() : '';
                const _ln = otherUser && otherUser.lastName  ? otherUser.lastName.trim()  : '';
                // FIX: chat.name (and chat.chatName, for 1:1 chats which don't have a
                // real "chat name" concept) is unreliable — this backend sometimes
                // populates it with the conversation's last-message preview text
                // instead of an actual name (documented and worked around elsewhere
                // in this file for the multi-send picker, but never here, where the
                // main chat list is actually built). Rather than ever risk showing
                // message content as a contact's name, only trust chat.name/chatName
                // if it doesn't look like it's just the last message repeated back.
                const _lastMsgPreview = String(
                    (chat.lastMessage && chat.lastMessage.content) || chat.lastMessageContent || ''
                ).trim().toLowerCase();
                const _chatNameCandidate = String(chat.chatName || chat.name || '').trim();
                const _chatNameLooksSafe = _chatNameCandidate &&
                    !(_lastMsgPreview && _chatNameCandidate.toLowerCase() === _lastMsgPreview);
                const _rawFriendName = (_fn && _ln) ? (_fn + ' ' + _ln)
                    : (_fn || (otherUser && (otherUser.displayName || otherUser.username)) || (_chatNameLooksSafe ? _chatNameCandidate : '') || 'User');
                const friendName = _rawFriendName.trim() || 'User';
                const friendAvatar = otherUser?.avatar || chat.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(friendName)}&background=random&color=fff`;
                
                let lastMessageText = chat.lastMessage?.content || chat.lastMessageContent || '';
                let lastMessageTime = chat.lastMessage?.createdAt || chat.lastMessageAt || chat.updatedAt;
                
                if (!lastMessageText && chat.messages && chat.messages.length > 0) {
                    const lastMsg = chat.messages[chat.messages.length - 1];
                    lastMessageText = lastMsg.content || '';
                    lastMessageTime = lastMsg.createdAt || lastMsg.timestamp;
                }
                
                // FIX: Resolve online status from FriendManager if available (it has realtime updates),
                // otherwise fall back to the API participant status field.
                let _convOnline = otherUser?.status === 'online';
                if (friendId && FriendManager) {
                    const _fm = friendRecord || FriendManager.getFriend(friendId) || FriendManager.getFriend(parseInt(friendId));
                    if (_fm) _convOnline = !!(_fm.online || _fm.status === 'online');
                }
                uniqueMap.set(chat.id, {
                    ...chat,
                    id: chat.id,
                    friendId: friendId,
                    friendName: friendName,
                    friendAvatar: friendAvatar,
                    lastMessage: lastMessageText || '',
                    lastMessageAt: lastMessageTime || Date.now(),
                    unreadCount: chat.unreadCount || 0,
                    online: _convOnline,
                    type: chat.type || 'direct',
                    archived: chat.archived || false,
                    blocked: chat.blocked || false
                });
            });
            
            const existingPending = (this._conversations || []).filter(c => c.isPending === true);
            existingPending.forEach(pending => {
                // BUG FIX (duplicate chat-history entries per contact): pendingReceiverId is
                // stored as a Number (it comes straight from numericUserId in messages-ui.js),
                // while every friendId added to seenFriendIds above is a String. A Number and
                // its String twin are never equal inside a Set, so seenFriendIds.has(123) was
                // always false even when '123' had already been added — the leftover pending
                // conversation for that contact was never recognized as a duplicate and got
                // added again alongside the real, server-confirmed chat for the same contact.
                const friendId = String(pending.pendingReceiverId || pending.friendId || '');
                if (friendId && !seenFriendIds.has(friendId)) {
                    uniqueMap.set(pending.id, pending);
                    seenFriendIds.add(friendId);
                }
            });
            
            this._conversations = Array.from(uniqueMap.values());
            
            this._conversations.sort((a, b) => {
                const timeA = a.lastMessageAt || 0;
                const timeB = b.lastMessageAt || 0;
                return timeB - timeA;
            });
            
            this._rebuildMap();
            this._loaded = true;
            this._saveToCache();

            // FIX: Update active conversation name if it was cached with "User"
            if (this._activeConversation) {
                const updated = this._conversationsMap.get(this._activeConversation.id);
                if (updated && updated.friendName && updated.friendName !== 'User' &&
                    (this._activeConversation.friendName === 'User' || !this._activeConversation.friendName)) {
                    this._activeConversation = { ...this._activeConversation, ...updated };
                    // Patch the DOM header immediately
                    try {
                        const nameEl = document.getElementById('chatFriendName');
                        if (nameEl && nameEl.textContent === 'User') {
                            nameEl.textContent = updated.friendName;
                        }
                    } catch (_e) {}
                }
            }

            this._notifySubscribers();

            if (window.KynectaLocalStore && this._conversations.length > 0) {
                this._conversations.forEach(conversation => {
                    window.KynectaLocalStore.saveConversation({
                        ...conversation,
                        updatedAt: conversation.updatedAt || conversation.lastMessageAt || Date.now()
                    }).catch(() => {});
                });
            }
            
            debugLog(`[ChatManager] Set ${this._conversations.length} unique conversations`);
        },
        
        setMessages: function(messages, conversationId) {
            // ROOT-FIX-D: Wipe guard — determine what chat the current _messages belong to.
            // Don't rely on _messages[0].chatId because:
            //   (a) received messages with no chatId have chatId='' → always looks different
            //   (b) optimistic sent messages may be first, with a different chatId format
            // Instead, scan the FIRST message that actually has a chatId field populated.
            const _targetId = conversationId || this._activeConversation?.id;
            const _targetIdStr = String(_targetId || '');
            const _stripPending = function(id) {
                const s = String(id || '');
                return s.startsWith('pending_') ? s.slice(8) : s;
            };

            let _currentChatId = null;
            for (let _i = 0; _i < this._messages.length; _i++) {
                const _mc = String(this._messages[_i].chatId || this._messages[_i].conversationId || '');
                if (_mc && _mc !== 'undefined') { _currentChatId = _mc; break; }
            }

            if (_targetIdStr && _currentChatId) {
                // Wipe only when switching to a genuinely DIFFERENT chat.
                // pending_7 → 7 is the SAME chat — never wipe on that transition.
                // FIX Bug1: also treat numeric vs string version of same id as equal
                // e.g. _currentChatId="11" and _targetIdStr="11" must match even if
                // one was stored as a number and coerced. stripPending handles both.
                const _sameChat = _currentChatId === _targetIdStr ||
                    _stripPending(_currentChatId) === _stripPending(_targetIdStr) ||
                    Number(_stripPending(_currentChatId)) === Number(_stripPending(_targetIdStr));
                if (!_sameChat) {
                    this._messages = [];
                    this._messagesMap.clear();
                }
            }

            // ROOT-FIX-D cont: Normalize ALL incoming messages so none have a blank chatId.
            // Without this, messages returned from the server with only `conversationId` get
            // chatId='' in the dedup map, so the wipe-guard and cache reads never find them.
            const _realId = _targetIdStr.startsWith('pending_') ? _targetIdStr.slice(8) : _targetIdStr;
            const incomingRaw = ensureSafeArray(messages).map(function(m) {
                if (!m) return m;
                const mChatId = String(m.chatId || m.conversationId || '');
                // FIX Bug1: restamp when chatId is blank, undefined, a pending_ id,
                // OR a numeric version of the same real id (server returns integer chatId
                // but local store has string — they must unify to one canonical string key).
                const needsRestamp = !mChatId || mChatId === 'undefined' ||
                    (mChatId.startsWith('pending_') && _realId) ||
                    (mChatId !== _realId && _realId && _stripPending(mChatId) === _stripPending(_realId));
                if (needsRestamp && _realId) {
                    return { ...m, chatId: _realId, conversationId: _realId };
                }
                return m;
            });
            const incomingMessages = incomingRaw;

            // CACHE-PROTECTION: Never overwrite a populated cache with an empty array.
            // FIX Bug2: also check IndexedDB (KynectaLocalStore) not just localStorage,
            // because localStorage may be empty while IDB has the real message history.
            if (incomingMessages.length === 0) {
                const existingCache = this.loadPreviousMessages(_targetId);
                if (existingCache && existingCache.length > 0) {
                    const _cacheFirstId = String(existingCache[0]?.chatId || existingCache[0]?.conversationId || '');
                    if (!_targetIdStr || !_cacheFirstId ||
                        _cacheFirstId === _targetIdStr ||
                        _stripPending(_cacheFirstId) === _stripPending(_targetIdStr)) {
                        this._messages = existingCache;
                        this._rebuildMessagesMap();
                        this._notifySubscribers();
                        return;
                    }
                }
                // FIX Bug2: localStorage empty but IDB may still have messages —
                // load asynchronously and render if found, so back→reopen never blanks.
                if (_targetIdStr && window.KynectaLocalStore) {
                    const _self = this;
                    window.KynectaLocalStore.getMessagesByChat(_targetIdStr, { limit: 100 })
                        .then(function(idbMsgs) {
                            if (idbMsgs && idbMsgs.length > 0) {
                                // Only apply if memory is still empty for this chat
                                const _stillEmpty = !_self._messages || _self._messages.filter(function(m) {
                                    const mc = String(m.chatId || m.conversationId || '');
                                    return mc === _targetIdStr || _stripPending(mc) === _stripPending(_targetIdStr);
                                }).length === 0;
                                if (_stillEmpty) {
                                    _self.setMessages(idbMsgs, _targetIdStr);
                                }
                            }
                        }).catch(function() {});
                }
                return;
            }

            // MERGE-FIRST dedup: seed from existing in-memory messages for this chat,
            // then layer server messages on top. Nothing already in memory is dropped.
            const byId = new Map();
            for (const msg of this._messages) {
                if (!msg || !msg.id) continue;
                // Only carry forward messages that belong to THIS chat
                const _mc = String(msg.chatId || msg.conversationId || '');
                if (_mc && _mc !== _targetIdStr && _mc !== _realId &&
                    _stripPending(_mc) !== _stripPending(_targetIdStr)) continue;
                byId.set(String(msg.id), { ...msg });
                if (msg.localId && msg.localId !== msg.id) byId.delete(String(msg.localId));
            }
            // Layer server/incoming on top — server data wins.
            // BUG FIX: previously skipped any incoming message with no `.id`
            // (`if (!msg.id) continue`). Locally-composed/queued messages can
            // legitimately carry only a `localId` until the server confirms
            // them — falling back to that here means they no longer get
            // silently dropped out of the merged history.
            for (const msg of incomingMessages) {
                const _key = msg.id || msg.localId;
                if (!_key) continue;
                const existing = byId.get(String(_key));
                byId.set(String(_key), existing ? { ...existing, ...msg } : { ...msg });
                if (msg.localId && msg.localId !== _key) byId.delete(String(msg.localId));
            }

            const uniqueMessages = Array.from(byId.values());
            const ts = m => m.createdAt || m.timestamp || 0;
            uniqueMessages.sort((a, b) => ts(a) - ts(b));

            this._messages = uniqueMessages;
            this._rebuildMessagesMap();
            // FIX: Use the explicitly-passed conversationId as the authoritative cache key.
            // Deriving it from uniqueMessages[0]?.chatId or _activeConversation is unreliable
            // when fetchMessages resolves asynchronously after the user has switched chats.
            const cacheId = conversationId || this._activeConversation?.id;
            this._saveMessagesToCache(cacheId);
            this._notifySubscribers();

            try {
                const _renderChatId = conversationId || (this._activeConversation && this._activeConversation.id);
                if (_renderChatId) {
                    const _aid = String(_renderChatId);
                    let _activeForRender = this._activeConversation;
                    if (!_activeForRender && this._conversationsMap) {
                        const _p = document.getElementById('chatPanel');
                        if (_p && !_p.classList.contains('hidden')) {
                            _activeForRender = this._conversationsMap.get(_aid) || this._conversationsMap.get(Number(_aid));
                            if (_activeForRender) this._activeConversation = _activeForRender;
                        }
                    }
                    if (_activeForRender && String(_activeForRender.id) === _aid) {
                        const _tsMs2 = _normalizeTs; // FIX: consolidated to canonical _normalizeTs
                        const _filtered = this._messages
                            .filter(m => {
                                const mid = String(m.chatId || m.conversationId || '');
                                return mid === _aid || mid === '';
                            })
                            .sort((a, b) => _tsMs2(a) - _tsMs2(b));
                        if (_filtered.length > 0) {
                            window.dispatchEvent(new CustomEvent('renderMessages', {
                                detail: { messages: _filtered, currentChat: _activeForRender, currentUser: null }
                            }));
                        }
                    }
                }
            } catch (_e) {}

            // ── OFFLINE-FIRST: persist ALL messages to IndexedDB ─────────────
            if (window.KynectaLocalStore && uniqueMessages.length > 0) {
                const chatId = cacheId || uniqueMessages[0]?.chatId || uniqueMessages[0]?.conversationId;
                if (chatId) {
                    window.KynectaLocalStore.saveMessages(
                        uniqueMessages.map(m => ({
                            ...m,
                            chatId: m.chatId || m.conversationId || chatId,
                            createdAt: m.createdAt || m.timestamp || Date.now()
                        }))
                    ).catch(()=>{});
                }
            }
        },
        
        addMessage: function(message) {
            if (!message || !message.id) return;

            // ROOT-FIX-A: Normalize chatId/conversationId to a single consistent string
            // before ANY storage path runs.  Received messages from the server often arrive
            // with ONLY `conversationId` (no `chatId`), which means:
            //   • _saveMessagesToCache() falls back to _activeConversation.id → wrong key
            //   • setMessages wipe guard reads _messages[0].chatId === '' → always triggers
            //   • dedup map loses received messages on every send-confirm cycle
            // Fix: derive a single _chatId and stamp BOTH fields so every path agrees.
            const _activeChatIdRaw = this._activeConversation ? String(this._activeConversation.id || '') : '';
            let _chatId = String(message.chatId || message.conversationId || '');

            // If message has no chat identifier, inherit from the active conversation
            if (!_chatId && _activeChatIdRaw) {
                _chatId = _activeChatIdRaw;
            }
            // Restamp pending_ to real ID when the active chat has already been resolved
            if (_chatId && _activeChatIdRaw && !_activeChatIdRaw.startsWith('pending_')) {
                if (_chatId === `pending_${_activeChatIdRaw}`) {
                    _chatId = _activeChatIdRaw;
                }
            }
            // FIX Bug1: if _chatId is numeric version of _activeChatIdRaw (server sends
            // integer chatId but active conversation stores string), unify to the string
            // form so the wipe guard and dedup map always see the same canonical key.
            if (_chatId && _activeChatIdRaw && _chatId !== _activeChatIdRaw) {
                const _stripP = function(s) { return s.startsWith('pending_') ? s.slice(8) : s; };
                if (_stripP(_chatId) === _stripP(_activeChatIdRaw) ||
                    Number(_stripP(_chatId)) === Number(_stripP(_activeChatIdRaw))) {
                    _chatId = _activeChatIdRaw;
                }
            }
            // Produce a consistent message object so all paths below use the same key
            if (_chatId) {
                message = { ...message, chatId: _chatId, conversationId: _chatId };
            }

            const msgId      = String(message.id);
            const msgLocalId = message.localId ? String(message.localId) : null;

            // ROOT-FIX-B: Always pass the message's chatId to _saveMessagesToCache.
            // Calling it with no argument falls back to _activeConversation.id, which may
            // be a DIFFERENT chat if the received message arrived while the user had another
            // chat open — writing all messages to the wrong localStorage key.
            const existingById = this._messagesMap.get(msgId);
            if (existingById) {
                // Merge server data into existing (status, id, etc.)
                Object.assign(existingById, message);
                this._rebuildMessagesMap();
                this._saveMessagesToCache(_chatId || undefined);
                this._notifySubscribers();
                if (window.KynectaLocalStore) {
                    window.KynectaLocalStore.saveMessage({
                        ...existingById,
                        chatId: existingById.chatId || existingById.conversationId
                    }).catch(()=>{});
                }
                return;
            }
            // Also check if we have an optimistic copy by localId
            if (msgLocalId) {
                const existingByLocalId = this._messagesMap.get(msgLocalId);
                if (existingByLocalId) {
                    const idx = this._messages.findIndex(m => String(m.id) === msgLocalId || String(m.localId||'') === msgLocalId);
                    const merged = { ...existingByLocalId, ...message, id: msgId };
                    if (idx !== -1) this._messages[idx] = merged;
                    this._messagesMap.delete(msgLocalId);
                    this._messagesMap.set(msgId, merged);
                    this._saveMessagesToCache(_chatId || undefined);
                    this._notifySubscribers();
                    if (window.KynectaLocalStore) {
                        window.KynectaLocalStore.saveMessage({
                            ...merged,
                            chatId: merged.chatId || merged.conversationId
                        }).catch(()=>{});
                    }
                    return;
                }
            }

            // ── Persist to IndexedDB ─────────────────────────────────────────
            const chatId = message.chatId || message.conversationId;
            if (window.KynectaLocalStore && chatId) {
                window.KynectaLocalStore.saveMessage({
                    ...message,
                    chatId,
                    createdAt: message.createdAt || message.timestamp || Date.now(),
                    isLocalOnly: message.isLocalOnly !== false
                }).catch(()=>{});
            }

            this._messages.push(message);
            this._messagesMap.set(msgId, message);
            
            // FIX: parse ISO createdAt to numeric ms for correct ASC sort
            const _tsMs = _normalizeTs; // FIX: consolidated to canonical _normalizeTs
            this._messages.sort((a, b) => _tsMs(a) - _tsMs(b));
            
            if (message.conversationId) {
                const conversation = this._conversationsMap.get(message.conversationId);
                if (conversation) {
                    conversation.lastMessage = message.content;
                    conversation.lastMessageAt = message.timestamp;
                    if (message.senderId !== SessionManager.getUserId()) {
                        conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                    }
                    this._conversations.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
                }
            }
            
            const _activeChatNow = this._activeConversation;
            // ROOT-FIX-B cont: always pass the message's normalized chatId so received messages
            // that arrive while a different chat is open still get saved to their own slot.
            const _msgChatIdForSave = _chatId || String(message.chatId || message.conversationId || '');
            if (_msgChatIdForSave) {
                this._saveMessagesToCache(_msgChatIdForSave);
            } else if (_activeChatNow) {
                this._saveMessagesToCache();
            }
            
            this._notifySubscribers();
            EventBus.emit('message:added', message);

            // ── Render new message into the active chat panel immediately ──
            try {
                const _ar = this._activeConversation;
                const _msgCid = String(message.chatId || message.conversationId || '');
                const _actCid = _ar ? String(_ar.id || '') : '';
                let _render = !!(_msgCid && _actCid && _msgCid === _actCid);
                // Fallback: friendId match for receiver-reply
                if (!_render && _ar && message.senderId) {
                    const _afid = String(_ar.friendId || _ar.otherUserId ||
                        (_ar.otherParticipant && _ar.otherParticipant.id) || '');
                    if (_afid && _afid === String(message.senderId)) _render = true;
                }
                // Fallback: panel open but _activeConversation cleared — recover from map
                if (!_render && _msgCid) {
                    const _p = document.getElementById('chatPanel');
                    if (_p && !_p.classList.contains('hidden') && this._conversationsMap) {
                        const _conv = this._conversationsMap.get(_msgCid) || this._conversationsMap.get(Number(_msgCid));
                        if (_conv) { this._activeConversation = _conv; _render = true; }
                    }
                }
                if (_render) {
                    const _tsF = _normalizeTs; // FIX: consolidated to canonical _normalizeTs
                    const _fid = _msgCid || _actCid;
                    const _renderConv = this._activeConversation;
                    const _chatMsgs = this._messages.filter(function(m) {
                        const mid = String(m.chatId || m.conversationId || '');
                        return mid === _fid || mid === _actCid;
                    }).sort(function(a, b) { return _tsF(a) - _tsF(b); });
                    window.dispatchEvent(new CustomEvent('renderMessages', {
                        detail: { messages: _chatMsgs, currentChat: _renderConv, currentUser: null }
                    }));
                    try {
                        const _c = document.getElementById('messagesContainer');
                        if (_c) requestAnimationFrame(function() { _c.scrollTop = _c.scrollHeight; });
                    } catch (_) {}
                }
            } catch (_e) {}

            // Immediately re-render sidebar so chat bubbles up after sort
            try {
                const uiConvs = this._conversations;
                const activeChat = this._activeConversation;
                const drafts = {};
                window.dispatchEvent(new CustomEvent('renderChatsList', {
                    detail: {
                        conversations: ensureSafeArray(uiConvs),
                        currentChat: activeChat,
                        currentCategory: this.getCurrentCategory(),
                        messageDrafts: ensureSafeObject(drafts)
                    }
                }));
            } catch(_e) {}
        },
        
        updateMessageStatus: function(messageId, status, details = {}) {
            const normalizedId = String(messageId);
            const message = this._messagesMap.get(normalizedId)
                || this._messages.find(m =>
                    String(m.id) === normalizedId
                    || String(m.localId || '') === normalizedId
                    || String(m.serverId || '') === normalizedId
                );
            if (!message) return false;
            
            // PHASE10: In-place entity patch — apply all provided fields without array replacement
            message.status = status;
            if (details.deliveredAt)          message.deliveredAt    = details.deliveredAt;
            if (details.readAt)               message.readAt         = details.readAt;
            if (details.serverId)             message.serverId       = String(details.serverId);
            if (details.localId)              message.localId        = String(details.localId);
            if (details.chatId)               message.chatId         = details.chatId;
            if (details.conversationId)       message.conversationId = details.conversationId;
            if (details.timestamp)            message.timestamp      = details.timestamp;
            if (details.createdAt)            message.createdAt      = details.createdAt;
            if (details.optimistic === false) message.optimistic     = false;
            if (details.isLocalOnly === false)message.isLocalOnly    = false;
            this._messagesMap.set(String(message.id), message);
            if (message.localId) this._messagesMap.set(String(message.localId), message);
            if (message.serverId) this._messagesMap.set(String(message.serverId), message);
            if (window.KynectaLocalStore) {
                window.KynectaLocalStore.updateMessageStatus(message.localId || message.id, status, details).catch(() => {});
            }
            
            EventBus.emit('message:status', { messageId, status, message });
            // ✅ FIX 5: Fire DOM event so messages-ui.js messageStatusUpdated listener
            // can patch the tick icon without a full re-render.
            try {
                window.dispatchEvent(new CustomEvent('messageStatusUpdated', {
                    detail: { messageId: String(messageId), status, serverId: details.serverId || null, localId: details.localId || null }
                }));
            } catch (_e) {}
            return true;
        },
        
        getConversations: function() {
            return [...this._conversations];
        },
        
        getConversation: function(id) {
            return this._conversationsMap.get(id) || null;
        },
        
        setActiveConversation: function(conversation) {
            this._activeConversation = conversation;
            this._notifySubscribers();
            
            if (conversation) {
                try {
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.UI_STATE, {
                        lastChatId: conversation.id,
                        timestamp: Date.now()
                    });
                    // Also write to the flat key so restoreLastChat can read it immediately
                    SafeStorage.set('lastChatId', String(conversation.id));
                } catch (e) {}
            }
        },
        
        getActiveChat: function() {
            return this._activeConversation ? { ...this._activeConversation } : null;
        },
        
        getMessages: function() {
            return [...this._messages];
        },

        setCurrentCategory: function(category) {
            const normalized = ['all', 'unread', 'archived', 'blocked', 'notes'].includes(category) ? category : 'all';
            this._currentCategory = normalized;
            SafeStorage.set(LOCAL_STORAGE_KEYS.CURRENT_CATEGORY, normalized);
            return normalized;
        },

        getCurrentCategory: function() {
            const stored = SafeStorage.get(LOCAL_STORAGE_KEYS.CURRENT_CATEGORY, this._currentCategory || 'all');
            const normalized = ['all', 'unread', 'archived', 'blocked', 'notes'].includes(stored) ? stored : 'all';
            this._currentCategory = normalized;
            return normalized;
        },

        renderChatsList: function() {
            try {
                window.dispatchEvent(new CustomEvent('renderChatsList', {
                    detail: {
                        conversations: ensureSafeArray(this._conversations),
                        currentChat: this._activeConversation,
                        currentCategory: this.getCurrentCategory(),
                        messageDrafts: {}
                    }
                }));
            } catch (_error) {}
        },
        
        loadPreviousMessages: function(conversationId) {
            // PHASE10-FIX: Stale cache rejection — never resurrect deleted entities
            // Check the authoritative deletion registry before reading any cache
            const _cidStr = String(conversationId || '');
            const _deletionRegistry = window.__PHASE10_DeletionRegistry;
            if (_deletionRegistry && _cidStr && _deletionRegistry.isDeleted('chat', _cidStr)) {
                console.warn('[ChatManager] PHASE10: Rejecting stale cache for deleted chat:', _cidStr);
                return null;
            }

            if (this._historyCache.has(conversationId)) {
                const cached = this._historyCache.get(conversationId);
                if (Date.now() - cached.timestamp < 300000) {
                    // Filter out tombstoned messages from cache
                    if (_deletionRegistry && cached.messages) {
                        const alive = cached.messages.filter(m =>
                            !m || !m.id || !_deletionRegistry.isDeleted('message', String(m.id))
                        );
                        if (alive.length !== cached.messages.length) {
                            cached.messages = alive;
                        }
                    }
                    return cached.messages;
                }
            }
            
            try {
                const stored = SafeStorage.getJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${conversationId}`);
                if (stored && Array.isArray(stored)) {
                    // PHASE10-FIX: Filter tombstoned messages before returning from localStorage
                    const alive = _deletionRegistry
                        ? stored.filter(m => !m || !m.id || !_deletionRegistry.isDeleted('message', String(m.id)))
                        : stored;
                    this._historyCache.set(conversationId, { messages: alive, timestamp: Date.now() });
                    return alive;
                }
            } catch (e) {}

            // Fallback: check if messages were saved under pending_<id> and migrate them
            try {
                const _idStr = String(conversationId || '');
                if (_idStr && !_idStr.startsWith('pending_')) {
                    const pendingKey = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}pending_${_idStr}`;
                    const pendingStored = SafeStorage.getJSON(pendingKey);
                    if (pendingStored && Array.isArray(pendingStored) && pendingStored.length > 0) {
                        const migrated = pendingStored.map(function(m) {
                            return m ? { ...m, chatId: _idStr, conversationId: _idStr } : m;
                        });
                        try { SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${_idStr}`, migrated); } catch(_) {}
                        try { SafeStorage.remove(pendingKey); } catch(_) {}
                        this._historyCache.set(conversationId, { messages: migrated, timestamp: Date.now() });
                        return migrated;
                    }
                }
            } catch (e) {}
            
            return null;
        },
        
        _saveToCache: function() {
            try {
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { 
                    conversations: this._conversations, 
                    timestamp: Date.now() 
                });
            } catch (e) {}
        },
        
        _saveMessagesToCache: function(chatId) {
            const targetId = chatId || this._activeConversation?.id;
            if (targetId) {
                try {
                    const _tid = String(targetId);
                    const _toSave = this._messages
                        .filter(function(m) {
                            const mcid = String(m.chatId || m.conversationId || '');
                            return mcid === _tid;
                        })
                        .map(function(m) {
                            if (!m.chatId && !m.conversationId) {
                                return Object.assign({}, m, { chatId: _tid });
                            }
                            return m;
                        });
                    const _key = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${_tid}`;
                    SafeStorage.setJSON(_key, _toSave);
                    // ✅ FIX: Direct localStorage write as guaranteed fallback.
                    // SafeStorage may be in memoryStore-only mode during early lifecycle,
                    // causing messages to vanish when the user leaves the app.
                    try { localStorage.setItem(_key, JSON.stringify(_toSave)); } catch (_e) {}
                } catch (e) {}
            }
        },
        
        subscribe: function(callback) {
            this._subscribers.add(callback);
            return () => this._subscribers.delete(callback);
        },
        
        _notifySubscribers: function() {
            this._subscribers.forEach(cb => {
                try { cb(this._conversations, this._activeConversation, this._messages); } catch (e) {}
            });
            
            try {
                window.dispatchEvent(new CustomEvent('conversationsUpdated', {
                    detail: { 
                        conversations: this._conversations,
                        activeConversation: this._activeConversation,
                        messages: this._messages
                    }
                }));
            } catch (e) {}
        },
        
        _notifyLoading: function(type, isLoading) {
            try {
                window.dispatchEvent(new CustomEvent('chatLoading', {
                    detail: { type, isLoading }
                }));
            } catch (e) {}
        },
        
        _notifyError: function(error) {
            try {
                window.dispatchEvent(new CustomEvent('chatError', {
                    detail: { error }
                }));
            } catch (e) {}
        },
        
        _notifySuccess: function(message) {
            try {
                window.dispatchEvent(new CustomEvent('chatSuccess', {
                    detail: { message }
                }));
            } catch (e) {}
        },
        
        clear: function() {
            this._conversations = [];
            this._conversationsMap.clear();
            this._activeConversation = null;
            this._messages = [];
            this._messagesMap.clear();
            this._historyCache.clear();
            this._lastMessagesFetchAt.clear();
            this._pendingConversations.clear();
        }
    }.init();

    // =============================================
    // FRIEND MANAGER (REAL DATA ONLY)
    // =============================================
    const FriendManager = {
        _friends: [],
        _friendsMap: new Map(),
        _loaded: false,
        _loading: false,
        _subscribers: new Set(),
        _activeFriends: new Set(),
        _blockedFriends: new Set(),
        
        init: function() {
            this._loadFromCache();
            this._loadBlockedUsers();
            this._loadDemoFriendsIfNeeded();
            return this;
        },
        
        _loadDemoFriendsIfNeeded: function() {
            // FIX: Never load fake demo friends. Load from IndexedDB cache instead.
            if (!this._friends || this._friends.length === 0) {
                if (window.AppCache) {
                    window.AppCache.getAll('friends').then(cached => {
                        if (cached && cached.length > 0) {
                            debugLog('[FriendManager] Offline-first: loaded', cached.length, 'cached friends');
                            this._friends = cached;
                            this._rebuildMap();
                            this._friends.forEach(friend => {
                                if (friend.online) this._activeFriends.add(friend.id);
                            });
                            this._loaded = true;
                            this._notifySubscribers();
                        }
                    }).catch(() => {});
                }
            }
        },
        
        _loadFromCache: function() {
            try {
                const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE);
                if (cached && Array.isArray(cached.friends)) {
                    // PHASE10-FIX: Deduplicate — same user can appear as id:2 and id:"2"
                    const _seen = new Set();
                    this._friends = cached.friends.filter(f => {
                        if (!f) return false;
                        const k = String(f.id || f.userId || '');
                        if (!k || _seen.has(k)) return false;
                        _seen.add(k); return true;
                    });
                    this._rebuildMap();
                    this._loaded = true;
                    
                    this._friends.forEach(friend => {
                        if (friend.online) {
                            this._activeFriends.add(friend.id || friend.uid);
                        }
                    });
                }
            } catch (e) {}
        },
        
        _loadBlockedUsers: function() {
            try {
                const blocked = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, []);
                this._blockedFriends = new Set(blocked);
            } catch (e) {}
        },
        
        _rebuildMap: function() {
            this._friendsMap.clear();
            this._friends.forEach(friend => {
                if (friend.id || friend.uid) {
                    const id = friend.id || friend.uid;
                    this._friendsMap.set(id, friend);
                }
            });
        },
        
        async fetchFriends() {
            if (!SessionManager.isAuthenticated()) {
                debugLog('[FriendManager] Not authenticated — loading friends from cache');
                // FIX: Load from IndexedDB, not fake demo friends
                this._loadDemoFriendsIfNeeded();
                return;
            }
            
            if (this._loading) return;
            this._loading = true;
            
            try {
                debugLog('[FriendManager] 📤 Fetching friends from backend');
                const raw = await makeApiRequest('/friends', 'GET');
                
                let friends = raw;
                if (friends && !Array.isArray(friends)) {
                    if (Array.isArray(friends.friends)) {
                        friends = friends.friends;
                    } else if (friends.data && Array.isArray(friends.data)) {
                        friends = friends.data;
                    } else if (friends.data && Array.isArray(friends.data.friends)) {
                        friends = friends.data.friends;
                    }
                }
                
                debugLog(`[FriendManager] 📥 Received ${friends?.length || 0} friends from backend`);
                
                if (friends && Array.isArray(friends) && friends.length > 0) {
                    this.setFriends(friends);
                } else {
                    this.setFriends([]);
                    await this._fetchAllUsersAsFallback();
                }
            } catch (error) {
                console.error('[FriendManager] Failed to fetch friends:', error);
                // FIX: Fall back to cache, not demo friends
                this._loadDemoFriendsIfNeeded();
                this._notifyError(error.message);
            } finally {
                this._loading = false;
            }
        },

        async _fetchAllUsersAsFallback() {
    if (!SessionManager.isAuthenticated()) return;
    if (this._friends && this._friends.length > 0) return;
    try {
        let result = null;
        let users = [];

        // FIX: Use /users endpoint instead of /users/search which is failing with 500
        // The /users endpoint returns all users (excluding current user) with pagination
        try { 
            result = await makeApiRequest('/users', 'GET', null, { limit: 200 }); 
        } catch(e) { 
            debugLog('[FriendManager] /users endpoint failed:', e.message);
            result = null; 
        }
        
        // Fallback to /users/all if /users fails
        if (!result) {
            try { 
                result = await makeApiRequest('/users/all', 'GET', null, { limit: 200 }); 
            } catch(e) { 
                debugLog('[FriendManager] /users/all endpoint failed:', e.message);
                result = null; 
            }
        }

        // Parse response - handle different response formats
        if (Array.isArray(result)) { 
            users = result; 
        }
        else if (result && Array.isArray(result.users)) { 
            users = result.users; 
        }
        else if (result && result.data && Array.isArray(result.data)) { 
            users = result.data; 
        }
        else if (result && result.data && Array.isArray(result.data.users)) { 
            users = result.data.users; 
        }
        else if (result && result.data && result.data.data && Array.isArray(result.data.data.users)) {
            users = result.data.data.users;
        }

        if (users.length > 0) {
            const currentUserId = SessionManager.getUserId();
            // Filter out current user and ensure we have valid user objects
            users = users.filter(u => {
                const userId = u.id || u.uid;
                return userId && userId !== currentUserId;
            });
            
            if (users.length > 0) {
                debugLog(`[FriendManager] Loaded ${users.length} users as fallback`);
                this.setFriends(users);
            }
        } else {
            debugLog('[FriendManager] No users found in fallback fetch');
        }
    } catch (e) {
        Logger.warn('FriendManager', 'Failed to fetch users as fallback:', e.message);
    }
},

        setFriends: function(friends) {
            this._friends = friends || [];
            this._rebuildMap();
            this._loaded = true;
            this._saveToCache();
            this._notifySubscribers();
            try {
                window.dispatchEvent(new CustomEvent('friendsUpdated', {
                    detail: { friends: this._friends }
                }));
            } catch(e) {}
        },
        
        mergeFriends: function(newFriends) {
            if (!Array.isArray(newFriends)) return;
            
            let changed = false;
            
            newFriends.forEach(newFriend => {
                const id = newFriend.id || newFriend.uid;
                if (!id) return;
                
                const existing = this._friendsMap.get(id);
                if (!existing) {
                    this._friends.push(newFriend);
                    this._friendsMap.set(id, newFriend);
                    changed = true;
                } else {
                    if (JSON.stringify(existing) !== JSON.stringify(newFriend)) {
                        Object.assign(existing, newFriend);
                        changed = true;
                    }
                }
                
                if (newFriend.online) {
                    this._activeFriends.add(id);
                } else {
                    this._activeFriends.delete(id);
                }
            });
            
            if (changed) {
                this._saveToCache();
                this._notifySubscribers();
            }
        },
        
        updateFriend: function(update) {
            const id = update.id || update.uid;
            if (!id) return false;
            
            const existing = this._friendsMap.get(id);
            if (!existing) {
                this._friends.push(update);
                this._friendsMap.set(id, update);
            } else {
                Object.assign(existing, update);
            }
            
            if (update.online) {
                this._activeFriends.add(id);
            } else if (update.online === false) {
                this._activeFriends.delete(id);
            }
            
            this._notifySubscribers();
            this._saveToCache();
            
            return true;
        },
        
        updateFriendStatus: function(status) {
            const id = status.userId || status.id;
            if (!id) return;
            
            const friend = this._friendsMap.get(id);
            if (friend) {
                friend.online = status.online;
                friend.lastSeen = status.lastSeen;
                friend.status = status.status;
                
                if (status.online) {
                    this._activeFriends.add(id);
                } else {
                    this._activeFriends.delete(id);
                }
                
                this._notifySubscribers();
            }
        },
        
        getFriends: function() {
            return [...this._friends];
        },
        
        getFriend: function(id) {
            return this._friendsMap.get(id) || null;
        },
        
        getFriendListForChat: function() {
            const availableFriends = this._friends
                .filter(friend => !this._blockedFriends.has(friend.id || friend.uid))
                .map(friend => {
                    const id = friend.id || friend.uid || friend.userId;
                    const firstName = friend.firstName || friend.first_name || '';
                    const lastName = friend.lastName || friend.last_name || '';
                    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
                    const displayName = friend.displayName || friend.display_name || fullName || friend.username || friend.name || 'User';
                    const avatar = friend.avatar || friend.photoURL || friend.avatarUrl || friend.profilePhoto || null;
                    const online = friend.online ?? (friend.status === 'online') ?? false;
                    const status = friend.status || (online ? 'Online' : 'Offline');

                    return {
                        ...friend,
                        id,
                        displayName,
                        username: friend.username || displayName,
                        avatar,
                        photoURL: avatar,
                        online,
                        status,
                        lastSeen: friend.lastSeen || friend.last_seen || friend.lastActive || null
                    };
                });

            return availableFriends.sort((a, b) => {
                if (a.online && !b.online) return -1;
                if (!a.online && b.online) return 1;
                const aName = (a.displayName || a.username || '').toLowerCase();
                const bName = (b.displayName || b.username || '').toLowerCase();
                return aName.localeCompare(bName);
            });
        },
        
        isFriendActive: function(id) {
            return this._activeFriends.has(id);
        },
        
        isFriendBlocked: function(id) {
            return this._blockedFriends.has(id);
        },
        
        subscribe: function(callback) {
            this._subscribers.add(callback);
            if (this._loaded) {
                try { callback(this._friends); } catch (e) {}
            }
            return () => this._subscribers.delete(callback);
        },
        
        _notifySubscribers: function() {
            const friends = this.getFriendListForChat();
            this._subscribers.forEach(cb => {
                try { cb(friends, this._friends); } catch (e) {}
            });
            
            try {
                window.dispatchEvent(new CustomEvent('friendsUpdated', {
                    detail: { friends: this._friends, availableFriends: friends }
                }));
            } catch (e) {}
        },
        
        _notifyError: function(error) {
            try {
                window.dispatchEvent(new CustomEvent('friendsError', {
                    detail: { error }
                }));
            } catch (e) {}
        },
        
        _saveToCache: function() {
            try {
                // PHASE10-FIX: Deduplicate before saving to prevent int/string id duplicates
                const _seen3 = new Set();
                const _deduped3 = (this._friends || []).filter(f => {
                    if (!f) return false;
                    const k = String(f.id || f.userId || '');
                    if (!k || _seen3.has(k)) return false;
                    _seen3.add(k); return true;
                });
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE, {
                    friends: _deduped3,
                    timestamp: Date.now()
                });
            } catch (e) {}
        },
        
        isLoaded: function() {
            return this._loaded;
        },
        
        clear: function() {
            this._friends = [];
            this._friendsMap.clear();
            this._loaded = false;
            this._activeFriends.clear();
            try {
                SafeStorage.remove(LOCAL_STORAGE_KEYS.FRIENDS_CACHE);
            } catch (e) {}
        }
    }.init();

    // =============================================
    // GROUP MANAGER
    // =============================================
    const GroupManager = {
        _groups: new Map(),
        _pendingInvites: new Set(),
        
        mergeGroups: function(groups) {
            groups.forEach(group => {
                this._groups.set(group.id, group);
                
                const existing = ChatManager.getConversation(group.id);
                if (!existing) {
                    const conversations = ChatManager.getConversations();
                    conversations.push(group);
                    ChatManager.setConversations(conversations);
                }
            });
            
            EventBus.emit('groups:updated', this.getGroups());
        },
        
        getGroups: function() {
            return Array.from(this._groups.values());
        },
        
        getGroup: function(groupId) {
            return this._groups.get(groupId) || ChatManager.getConversation(groupId);
        }
    };

    // =============================================
    // TYPING MANAGER
    // =============================================
    const TypingManager = {
        _typingUsers: new Map(),
        _typingTimeout: null,
        _lastTypingTime: 0,
        _isTyping: false,
        
        addTypingUser: function(conversationId, userId, userInfo = {}) {
            if (!conversationId || !userId) return;
            
            const key = `${conversationId}:${userId}`;
            this._typingUsers.set(key, {
                userId,
                userInfo,
                timestamp: Date.now()
            });
            
            setTimeout(() => {
                this.removeTypingUser(conversationId, userId);
            }, 5000);
            
            EventBus.emit('typing:user', { conversationId, userId, userInfo, isTyping: true });
        },
        
        removeTypingUser: function(conversationId, userId) {
            if (!conversationId || !userId) return;
            
            const key = `${conversationId}:${userId}`;
            if (this._typingUsers.has(key)) {
                this._typingUsers.delete(key);
                EventBus.emit('typing:user', { conversationId, userId, isTyping: false });
            }
        },
        
        getTypingUsersForConversation: function(conversationId) {
            const result = [];
            for (const [key, value] of this._typingUsers.entries()) {
                if (key.startsWith(`${conversationId}:`)) {
                    const age = Date.now() - value.timestamp;
                    if (age < 5000) {
                        result.push(value);
                    } else {
                        this._typingUsers.delete(key);
                    }
                }
            }
            return result;
        },
        
        sendTyping: function(conversationId, isTyping) {
            if (!conversationId || !SessionManager.getUserId()) return false;
            if (!canSendUserMessages()) return false;
            
            const guardResult = window.__guardAction('sendTyping', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            const now = Date.now();
            
            if (isTyping) {
                if (now - this._lastTypingTime < TIMING.TYPING_RATE_LIMIT) return false;
                this._lastTypingTime = now;
            }
            
            // FIX: Typing Indicators privacy setting was set (window.__typingIndicatorsEnabled)
            // but never checked here — typing was always broadcast regardless.
            const typingIndicatorsEnabled = window.__typingIndicatorsEnabled !== undefined ? window.__typingIndicatorsEnabled : true;
            if (isTyping && !typingIndicatorsEnabled) {
                return false;
            }

            const result = safeSend(
                isTyping ? OUTGOING_ACTIONS.START_TYPING : OUTGOING_ACTIONS.STOP_TYPING,
                { conversationId: conversationId },
                { requireAck: false }
            );
            
            if (result.blocked) {
                return false;
            }
            
            if (isTyping) {
                if (this._typingTimeout) clearTimeout(this._typingTimeout);
                this._typingTimeout = setTimeout(() => {
                    if (this._isTyping) {
                        this._isTyping = false;
                        safeSend(OUTGOING_ACTIONS.STOP_TYPING, { conversationId }, { requireAck: false });
                    }
                }, TIMING.TYPING_TIMEOUT);
            }
            
            this._isTyping = isTyping;
            return true;
        },
        
        stopTyping: function() {
            if (this._typingTimeout) {
                clearTimeout(this._typingTimeout);
                this._typingTimeout = null;
            }
            
            if (this._isTyping && ChatManager.getActiveChat()) {
                this._isTyping = false;
                safeSend(OUTGOING_ACTIONS.STOP_TYPING, {
                    conversationId: ChatManager.getActiveChat().id
                }, { requireAck: false });
            }
        }
    };

    // =============================================
    // MESSAGE HANDLER
    // =============================================
    const MessageHandler = {
        _optimisticMessages: new Map(),
        _pendingRequests: new Map(),
        
        async sendMessage(content, options = {}) {
            const guardResult = window.__guardAction('sendMessage', MODULE_NAME, currentState, { success: false, error: 'module_not_active' });
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) {
                return { success: false, error: 'module_not_active' };
            }
            
            if (!SessionManager.isAuthenticated()) {
                return { success: false, error: 'not_authenticated' };
            }
            
            if (!ChatManager.getActiveChat() && !options.conversationId) {
                return { success: false, error: 'no_conversation' };
            }
            
            const conversationId = options.conversationId || ChatManager.getActiveChat()?.id;
            if (!conversationId) return { success: false, error: 'invalid_conversation' };
            
            if (!content && !options.attachment) {
                return { success: false, error: 'empty_message' };
            }
            
            const localId = SecurityUtils.generateMessageId();
            const requestId = SecurityUtils.generateRequestId();

            // ── FORENSIC LOG: SEND_START ──────────────────────────────────────
            debugLog(`[FORENSIC] SEND_START | localId=${localId} | conversationId=${conversationId} | contentLen=${(content||'').length} | type=${options.type||'text'} | ts=${Date.now()}`);

            const optimisticMessage = {
                id: localId,
                localId: localId,
                chatId: conversationId,
                requestId: requestId,
                conversationId: conversationId,
                senderId: SessionManager.getUserId() || null,
                sender: SessionManager.getUser(),
                content: SecurityUtils.sanitizeString(content || ''),
                type: options.type || 'text',
                timestamp: Date.now(),
                status: 'sending',
                local: true,
                optimistic: true,
                attachment: options.attachment ? { ...options.attachment } : null,
                // FIX: include both replyToId AND the full replyTo object for immediate UI render
                replyToId: options.replyToId || (options.replyTo && options.replyTo.id) || null,
                replyTo: options.replyTo || null,
                mentions: options.mentions,
                isLocalOnly: true
            };
            
            this._optimisticMessages.set(localId, optimisticMessage);
            this._pendingRequests.set(requestId, { localId, optimisticMessage, timestamp: Date.now() });
            
            ChatManager.addMessage(optimisticMessage);
            EventBus.emit('message:sending', { message: optimisticMessage, optimistic: true });
            
            try {
                // ── FORENSIC LOG: TRANSPORT_SELECTED ─────────────────────────
                const _bestTx = window.__HybridTransportEngine?.getBestTransport?.() || 'INTERNET';
                debugLog(`[FORENSIC] TRANSPORT_SELECTED | localId=${localId} | transport=${_bestTx} | online=${navigator.onLine} | ts=${Date.now()}`);

                const result = await ChatManager.sendMessageToBackend(content, conversationId, {
                    ...options,
                    localId
                });
                
                debugLog(`[MessageHandler] Message sent successfully:`, result);
                
                const realMessage = result?.message || result?.data?.message || result?.data || result;
                const serverId = realMessage?.id;

                // Update the optimistic message in ChatManager in-place
                // PHASE10-FIX: Patch ONLY the single optimistic entity in-place.
                // NEVER call setMessages() after send confirmation — it replaces the
                // entire array and drops messages that arrived from the socket during
                // the async HTTP send, causing the "reply makes messages disappear" bug.
                if (serverId) {
                    const realChatId = String(realMessage.chatId || realMessage.conversationId || conversationId);
                    // In-place patch: update only the matching optimistic message
                    ChatManager.updateMessageStatus(localId, realMessage.status || 'sent', {
                        serverId:       String(serverId),
                        localId:        localId,
                        chatId:         realChatId,
                        conversationId: realChatId,
                        optimistic:     false,
                        isLocalOnly:    false,
                        timestamp:      realMessage.createdAt || Date.now(),
                        createdAt:      realMessage.createdAt || Date.now(),
                    });
                    // Patch only messages that still lack a chatId (pending->real transition)
                    // without replacing the full array
                    if (conversationId && String(conversationId).startsWith('pending_')) {
                        const msgs = ChatManager.getMessages();
                        let patched = false;
                        msgs.forEach(function(m) {
                            const mCid = String(m.chatId || m.conversationId || '');
                            if (!mCid || mCid === 'undefined' || mCid.startsWith('pending_')) {
                                m.chatId = realChatId; m.conversationId = realChatId; patched = true;
                            }
                        });
                        if (patched) { ChatManager._rebuildMessagesMap(); ChatManager._notifySubscribers(); }
                    }
                    // Confirm in local store
                    if (window.KynectaLocalStore) {
                        window.KynectaLocalStore.confirmMessage(localId, String(serverId), {
                            chatId:    realMessage.chatId || conversationId,
                            createdAt: realMessage.createdAt || Date.now(),
                            status: realMessage.status || 'sent'
                        }).catch(()=>{});
                    }
                } else {
                    optimisticMessage.status = 'sent';
                    optimisticMessage.optimistic = false;
                    optimisticMessage.isLocalOnly = false;
                    if (window.KynectaLocalStore) {
                        window.KynectaLocalStore.updateMessageStatus(localId, 'sent').catch(()=>{});
                    }
                }
                
                if (result && result.chatId && typeof conversationId === 'string' && conversationId.startsWith('pending_')) {
                    debugLog(`[MessageHandler] Received real chatId ${result.chatId} for pending conversation, updating active chat...`);
                    const realConversation = ChatManager.getConversation(result.chatId);
                    if (realConversation) {
                        ChatManager.setActiveConversation(realConversation);
                    }
                }
                
                this._optimisticMessages.delete(localId);
                this._pendingRequests.delete(requestId);
                
                EventBus.emit('message:sent', { message: optimisticMessage, success: true });
                
                return { success: true, localId, requestId, message: optimisticMessage };
                
            } catch (error) {
                console.error(`[MessageHandler] Failed to send message:`, error);

                // BUG FIX (1:1 messages disappear on send, refresh doesn't bring them back):
                // this regex only matched client-side network failures (offline, fetch
                // rejected, timeout). A backend outage that still returns an HTTP response —
                // 502/503 Bad Gateway/Service Unavailable, which this app has hit repeatedly —
                // throws an error whose message looks like "Server error (502)" or "HTTP 503",
                // which never matched, so shouldQueue was false and the message was marked
                // 'failed' instead of queued. Failed messages are NOT retried automatically,
                // so once the backend recovered the message was never actually delivered —
                // it just sat there, and a refresh (which re-fetches from the still-broken
                // or now-different backend state) never showed it again.
                const shouldQueue = !navigator.onLine ||
                    /network|fetch|timeout|offline/i.test(String(error.message || '')) ||
                    /\b(5\d{2})\b/.test(String(error.message || error.status || '')) ||
                    (error.status && error.status >= 500 && error.status < 600);
                if (shouldQueue && window.KynectaMsgQueue) {
                    optimisticMessage.status = 'pending';
                    optimisticMessage.optimistic = false;
                    optimisticMessage.queued = true;
                    ChatManager.updateMessageStatus(localId, 'pending', { queued: true, reason: error.message });
                    window.KynectaMsgQueue.enqueue({
                        id: localId,
                        localId,
                        chatId: conversationId,
                        content: optimisticMessage.content,
                        type: optimisticMessage.type,
                        attachment: optimisticMessage.attachment,
                        replyToId: options.replyToId || options.replyTo || null,
                        mentions: options.mentions,
                        senderId: optimisticMessage.senderId
                    });
                    EventBus.emit('message:queued', { messageId: localId, error: error.message });

                    this._optimisticMessages.delete(localId);
                    this._pendingRequests.delete(requestId);

                    return { success: true, queued: true, offline: !navigator.onLine, localId };
                }
                
                optimisticMessage.status = 'failed';
                optimisticMessage.error = error.message;
                ChatManager.updateMessageStatus(localId, 'failed', { reason: error.message });
                EventBus.emit('message:failed', { messageId: localId, error: error.message });
                
                this._optimisticMessages.delete(localId);
                this._pendingRequests.delete(requestId);
                
                return { success: false, error: error.message, localId };
            }
        },
        
        updateMessageStatus: function(messageId, status, details = {}) {
            ChatManager.updateMessageStatus(messageId, status, details);
            
            const optimistic = this._optimisticMessages.get(messageId);
            if (optimistic) {
                optimistic.status = status;
                if (status === 'sent' || status === 'delivered') {
                    delete optimistic.optimistic;
                }
                if (status === 'failed') {
                    EventBus.emit('message:failed', { messageId, error: details.reason || 'Send failed' });
                }
            }
            
            if (status === 'sent' || status === 'delivered') {
                this._optimisticMessages.delete(messageId);
            }
            
            const pending = Array.from(this._pendingRequests.entries()).find(([_, v]) => v.localId === messageId);
            if (pending) {
                this._pendingRequests.delete(pending[0]);
            }
        },
        
        deleteMessage: async function(messageId, forEveryone = false) {
            const guardResult = window.__guardAction('deleteMessage', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            if (!SessionManager.isAuthenticated()) return false;

            const message = (ChatManager.getMessages() || []).find((entry) =>
                String(entry.id) === String(messageId)
                || String(entry.localId || '') === String(messageId)
                || String(entry.serverId || '') === String(messageId)
            );
            const targetId = message?.serverId || message?.id || messageId;

            try {
                await makeApiRequest(`/messages/${targetId}`, 'DELETE', {
                    forEveryone
                });
            } catch (error) {
                console.error('[MessageHandler] deleteMessage failed:', error);
                return false;
            }

            // FIX (delete-persistence gap): mark the deletion tombstone registry
            // immediately once the API call succeeds. Previously this only
            // happened when the server's 'message:deleted' socket event echoed
            // back to this same client (see the socket handler further down
            // this file that calls __PHASE10_DeletionRegistry?.mark). That echo
            // is not guaranteed to arrive before the user navigates away or
            // refreshes — and when it doesn't, the registry never learns the
            // message was deleted, so the next sync/merge re-inserts it from
            // the server as if it were new. Marking it here, synchronously with
            // the user's own delete action, closes that race.
            try {
                window.__PHASE10_DeletionRegistry?.mark('message', String(targetId), 'deleted');
                if (String(targetId) !== String(messageId)) {
                    window.__PHASE10_DeletionRegistry?.mark('message', String(messageId), 'deleted');
                }
            } catch (_) {}

            const filteredMessages = (ChatManager.getMessages() || []).filter((entry) =>
                String(entry.id) !== String(messageId)
                && String(entry.localId || '') !== String(messageId)
                && String(entry.serverId || '') !== String(targetId)
            );

            if (ChatManager.getActiveChat()) {
                ChatManager.setMessages(filteredMessages, ChatManager.getActiveChat().id);
                try {
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, filteredMessages);
                } catch (e) {}
            }

            if (window.KynectaLocalStore) {
                window.KynectaLocalStore.deleteMessage(messageId).catch(() => {});
                if (String(targetId) !== String(messageId)) {
                    window.KynectaLocalStore.deleteMessage(targetId).catch(() => {});
                }
            }

            EventBus.emit('message:deleted', { messageId: targetId, forEveryone });
            return true;
        },
        
        editMessage: function(messageId, newContent) {
            const guardResult = window.__guardAction('editMessage', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            if (!SessionManager.isAuthenticated()) return false;

            // FIX (Forensic Audit P1): editMessage previously only used socket relay (safeSend),
            // which is lossy. Now also calls the REST API for durable persistence.
            const messages = ChatManager.getMessages() || [];
            const message = messages.find(
                (m) => String(m.id) === String(messageId)
                     || String(m.localId || '') === String(messageId)
                     || String(m.serverId || '') === String(messageId)
            );
            const targetId = message?.serverId || message?.id || messageId;
            const sanitized = SecurityUtils.sanitizeString(newContent);

            // Optimistic update first
            if (message) {
                message.content = sanitized;
                message.edited = true;
                message.editedAt = Date.now();
                if (ChatManager.getActiveChat()) {
                    try {
                        SafeStorage.setJSON(
                            `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`,
                            messages
                        );
                    } catch (e) {}
                }
                EventBus.emit('message:edited', { messageId: targetId, content: sanitized });
            }

            // Durable REST persist (fire-and-forget with rollback on failure)
            makeApiRequest(`/messages/${targetId}`, 'PUT', { content: sanitized })
                .then(() => {
                    // Optionally also relay via socket for live receivers
                    safeSend(OUTGOING_ACTIONS.EDIT_MESSAGE, { messageId: targetId, content: sanitized }, { requireAck: false });
                    // Update IndexedDB
                    if (window.KynectaLocalStore && message) {
                        window.KynectaLocalStore.saveMessage({ ...message, content: sanitized, edited: true }).catch(() => {});
                    }
                })
                .catch((error) => {
                    console.error('[MessageHandler] editMessage REST persist failed — rolling back:', error);
                    // Rollback optimistic update
                    if (message) {
                        message.content = message._preEditContent || message.content;
                        message.edited = !!message._preEditContent;
                        EventBus.emit('message:edit_failed', { messageId: targetId, error: error.message });
                    }
                });

            // Store pre-edit content for rollback
            if (message) message._preEditContent = message.content;

            return true;
        },
        
        addReaction: function(messageId, emoji, add = true) {
            const guardResult = window.__guardAction('addReaction', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            if (!SessionManager.isAuthenticated()) return false;
            
            const result = safeSend(OUTGOING_ACTIONS.ADD_REACTION, {
                messageId,
                emoji,
                add
            }, { requireAck: false });
            
            if (result.blocked) {
                return false;
            }
            
            const messages = ChatManager.getMessages();
            const message = messages.find(m => m.id === messageId);
            if (message) {
                if (!message.reactions) message.reactions = {};
                if (!message.reactions[emoji]) message.reactions[emoji] = [];
                
                const userId = SessionManager.getUserId();
                const userIndex = message.reactions[emoji].indexOf(userId);
                
                if (add && userIndex === -1) {
                    message.reactions[emoji].push(userId);
                } else if (!add && userIndex !== -1) {
                    message.reactions[emoji].splice(userIndex, 1);
                }
                
                if (message.reactions[emoji].length === 0) {
                    delete message.reactions[emoji];
                }
                
                if (ChatManager.getActiveChat()) {
                    try {
                        SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                    } catch (e) {}
                }
                
                EventBus.emit('message:reaction', { messageId, emoji, add });
            }
            
            return true;
        },
        
        forwardMessage: function(messageId, targetConversationIds) {
            const guardResult = window.__guardAction('forwardMessage', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            if (!SessionManager.isAuthenticated()) return false;
            
            const result = safeSend(OUTGOING_ACTIONS.FORWARD_MESSAGE, {
                messageId,
                targetConversationIds
            }, { requireAck: false });
            
            if (result.blocked) {
                return false;
            }
            
            return true;
        },
        
        reportMessage: function(messageId, reason) {
            const guardResult = window.__guardAction('reportMessage', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            if (!SessionManager.isAuthenticated()) return false;
            
            const result = safeSend(OUTGOING_ACTIONS.REPORT_MESSAGE, {
                messageId,
                reason
            }, { requireAck: false });
            
            if (result.blocked) {
                return false;
            }
            
            return true;
        },
        
        searchMessages: function(conversationId, query, options = {}) {
            const guardResult = window.__guardAction('searchMessages', MODULE_NAME, currentState, Promise.reject(new Error('Module not active')));
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) {
                return Promise.reject(new Error('Module not active'));
            }
            
            if (!SessionManager.isAuthenticated()) {
                return Promise.reject(new Error('Not authenticated'));
            }
            
            return new Promise((resolve, reject) => {
                const result = safeSend(OUTGOING_ACTIONS.SEARCH_MESSAGES, {
                    conversationId,
                    query,
                    ...options
                });
                
                if (result.blocked) {
                    reject(new Error(result.reason));
                } else {
                    resolve({ success: true });
                }
            }).catch(error => {
                return { success: false, error: error.message };
            });
        },
        
        getPendingCount: function() {
            return this._optimisticMessages.size;
        }
    };

    // =============================================
    // CONVERSATION MANAGER (REAL API CALLS)
    // =============================================
    const ConversationManager = {
        async openConversation(conversationId, options = {}) {
            if (!conversationId) return false;
            
            const actualId = typeof conversationId === 'object' ? conversationId.id : conversationId;
            const openKey = String(actualId);
            const now = Date.now();
            if (this._lastOpenRequest
                && this._lastOpenRequest.id === openKey
                && (now - this._lastOpenRequest.timestamp) < 700) {
                return true;
            }
            this._lastOpenRequest = { id: openKey, timestamp: now };

            // ROOT-FIX: Only wipe when switching to a DIFFERENT chat.
            // pending_<id> → <id> is the SAME chat — never wipe on that transition.
            const _prevActive = ChatManager._activeConversation;
            const _stripP = function(id) { const s = String(id||''); return s.startsWith('pending_') ? s.slice(8) : s; };
            const _switchingChat = _prevActive &&
                String(_prevActive.id) !== String(actualId) &&
                _stripP(_prevActive.id) !== _stripP(actualId);
            if (_switchingChat) {
                ChatManager._messages = [];
                ChatManager._messagesMap.clear();
            }
            
            const conversation = ChatManager.getConversation(actualId);
            const canUseCachedConversation = !!conversation;
            // FIXED: Always open from cache — even offline or pre-ACTIVE
            if (conversation) {
                ChatManager.setActiveConversation(conversation);
                this._showChatPanel(conversation);
            } else {
                // No cached conversation: show the name passed via openConversation opts (userName) immediately
                // so header never shows "Loading..." to the user
                const _resolvedName = (typeof conversationId === 'object' && conversationId.friendName)
                    ? conversationId.friendName
                    : (options && options.friendName) || (options && options.userName)
                      // FIX Bug4: also check the globally-cached name set by loadChatByFriendId
                      || window.currentFriendName || null;
                // Never show ".." placeholder — only set if we actually have a real name
                const _displayName = _resolvedName && _resolvedName !== '..' ? _resolvedName : null;
                // FIX Bug2: resolve friendId for the placeholder too. Without this, every
                // consumer of the active conversation (getActiveChatInfo(), the call button,
                // the CHAT_OPENED postMessage, online-status lookup) had no friendId to read
                // and silently fell back to actualId (the conversation id), not the friend's
                // actual user id -- causing calls/messages to target the wrong person.
                const _resolvedFriendId = (typeof conversationId === 'object' && (conversationId.friendId || conversationId.userId || conversationId.receiverId || conversationId.otherUserId))
                    || (options && (options.friendId || options.userId || options.receiverId || options.otherUserId))
                    || (typeof actualId === 'string' && actualId.startsWith('pending_') ? actualId.slice(8) : null);
                // FIX Bug4: use empty string instead of 'Loading…' so _showChatPanel keeps existing DOM name
                const tempConversation = { id: actualId, friendId: _resolvedFriendId, friendName: _displayName || '', friendAvatar: '', online: false };
                ChatManager.setActiveConversation(tempConversation);
                this._showChatPanel(tempConversation);
            }

            // PHASE10: IDB first for instant load — eliminates white screen on first click
            const isPending = typeof actualId === 'string' && actualId.startsWith('pending_');
            if (!isPending) {
                // Check deletion registry — don't load messages for deleted chats
                const _delReg = window.__PHASE10_DeletionRegistry;
                if (_delReg && _delReg.isDeleted('chat', String(actualId))) {
                    console.warn('[ConversationManager] PHASE10: Skipping deleted chat:', actualId);
                    return false;
                }

                let _instantLoaded = false;
                if (window.KynectaLocalStore) {
                    const _idb = await window.KynectaLocalStore.getMessagesByChat(actualId, { limit: 100 }).catch(function() { return []; });
                    if (_idb && _idb.length > 0) {
                        // Filter tombstoned messages before display
                        const _alive = _delReg
                            ? _idb.filter(m => !m.id || !_delReg.isDeleted('message', String(m.id)))
                            : _idb;
                        if (_alive.length > 0) {
                            ChatManager.setMessages(_alive, actualId);
                            _instantLoaded = true;
                        }
                    }
                }
                if (!_instantLoaded) {
                    const _ls = ChatManager.loadPreviousMessages ? ChatManager.loadPreviousMessages(actualId) : null;
                    if (_ls && _ls.length > 0) {
                        ChatManager.setMessages(_ls, actualId);
                        _instantLoaded = true;
                    }
                }
                // PHASE10: If nothing in cache, show empty state immediately — no white screen
                if (!_instantLoaded) {
                    ChatManager._notifySubscribers?.();
                }
            }
            
            // Only send OPEN_CONVERSATION to parent when module is ACTIVE
            if (currentState === LIFECYCLE_STATES.ACTIVE) {
                safeSend(OUTGOING_ACTIONS.OPEN_CONVERSATION, {
                    conversationId: actualId
                }, { requireAck: false });
            }
            
            // FIX: force:true bypasses 8s minFetchGap so messages always refresh
            // FIX Bug2: take an IDB snapshot before the fetch so we can restore messages
            // if fetchMessages races and calls setMessages([]) over what we just showed.
            let _idbSnapshot = [];
            if (!isPending && window.KynectaLocalStore) {
                _idbSnapshot = await window.KynectaLocalStore.getMessagesByChat(actualId, { limit: 100 }).catch(function() { return []; });
            }
            if (!isPending) {
                if (navigator.onLine && SessionManager.isAuthenticated() && currentState === LIFECYCLE_STATES.ACTIVE) {
                    await ChatManager.fetchMessages(actualId, { ...options, force: true }).catch(function() {});
                }
            } else {
                debugLog('[ConversationManager] Skipping message fetch for pending conversation:', actualId);
            }
            // FIX Bug2: if after fetchMessages the panel is empty but IDB had data, restore it.
            if (_idbSnapshot.length > 0 && ChatManager._messages) {
                const _inMemory = ChatManager._messages.filter(function(m) {
                    const mc = String(m.chatId || m.conversationId || '');
                    const _sp = function(s) { return s.startsWith('pending_') ? s.slice(8) : s; };
                    return mc === String(actualId) || _sp(mc) === _sp(String(actualId));
                });
                if (_inMemory.length === 0) {
                    debugLog('[ConversationManager] FIX Bug2: restoring', _idbSnapshot.length, 'msgs from IDB snapshot for', actualId);
                    ChatManager.setMessages(_idbSnapshot, actualId);
                }
            }
            
            const draft = UIStateManager.getDraft(actualId);
            EventBus.emit('draft:loaded', { conversationId: actualId, draft });
            
            const theme = UIStateManager.getChatTheme(actualId);
            if (theme) EventBus.emit('theme:apply', { conversationId: actualId, theme });
            
            this.markAsRead(actualId);
            
            try {
                window.dispatchEvent(new CustomEvent('conversationOpened', {
                    detail: { conversationId: actualId, conversation }
                }));
            } catch (e) {}
            
            return true;
        },
        
        _showChatPanel: function(conversation) {
            const chatPanel = document.getElementById('chatPanel');
            const sidebar = document.getElementById('sidebar');
            const backBtn = document.getElementById('backToChatsBtn');
            
            if (chatPanel) {
                chatPanel.classList.remove('hidden');
            }
            if (sidebar && window.innerWidth <= 768) {
                sidebar.classList.remove('active');
            }
            // CSS safeguard: body.chat-active hides sidebar on mobile via CSS
            // so there's no flash even if JS timing is imperfect
            if (window.innerWidth <= 768) {
                document.body.classList.add('chat-active');
            }
            // FIX: Let CSS control back button visibility (display:flex on mobile via media query).
            // Clear any inline style that might override CSS rules.
            if (backBtn) {
                backBtn.style.display = '';
            }
            
            // FIX: Notify parent to add chat-panel-active class → hides mobile nav bar
            // (on desktop this only drives the header switch below, since chat.html's
            // CSS still gates the mobile-only layout effects behind its own media query)
            // Also include the conversation's own header info (name/avatar/online) so
            // chat.html can render its mirrored header immediately, instead of only
            // ever finding out via the separate CHAT_HEADER_UPDATE broadcast (which is
            // debounced and polled, not instant) from message.html's DOM observers.
            // FIX: previously gated to `window.innerWidth <= 768` — that meant chat.html
            // never learned a chat was opened at all on desktop, so the header never
            // switched to showing the friend's name/avatar/back/call icons on large
            // screens. Send this on every width now.
            try {
                window.parent.postMessage({
                    type: 'CHAT_OPENED',
                    timestamp: Date.now(),
                    payload: {
                        chatId: conversation && conversation.id,
                        userId: conversation && conversation.friendId,
                        name: conversation && conversation.friendName,
                        avatarUrl: conversation && conversation.friendAvatar,
                        online: !!(conversation && conversation.online)
                    }
                }, '*');
            } catch (_) {}
            
            const nameEl = document.getElementById('chatFriendName');
            const avatarEl = document.getElementById('chatFriendAvatar');
            const statusEl = document.getElementById('chatStatusText');
            const indicatorEl = document.getElementById('chatStatusIndicator');
            
            if (nameEl) {
                const resolvedPanelName = conversation.friendName || conversation.name || '';
                // FIX Bug4/5: Never overwrite a real name with the "Loading…" placeholder.
                // If we already have a real name in the DOM, keep it until we get a better one.
                const existingName = nameEl.textContent || '';
                const incomingIsPlaceholder = !resolvedPanelName || resolvedPanelName === 'Loading…' || resolvedPanelName === 'Chat';
                const existingIsPlaceholder = !existingName || existingName === 'Loading…' || existingName === 'Select a chat' || existingName === 'Chat';
                if (!incomingIsPlaceholder || existingIsPlaceholder) {
                    nameEl.textContent = resolvedPanelName || existingName || 'Chat';
                }
            }
            // FIX: Always resolve real online status from FriendManager — not stale conversation snapshot
            const _fid = conversation.friendId || conversation.otherUserId || (conversation.otherParticipant && conversation.otherParticipant.id);
            let _realOnline = false;
            if (_fid && FriendManager) {
                const _f = FriendManager.getFriend(_fid) || FriendManager.getFriend(parseInt(_fid));
                if (_f) {
                    _realOnline = !!(_f.online || _f.status === 'online');
                } else {
                    // Fall back to participant data on the conversation itself
                    const _op = conversation.otherParticipant;
                    _realOnline = _op ? (_op.status === 'online') : !!conversation.online;
                }
            } else {
                const _op = conversation.otherParticipant;
                _realOnline = _op ? (_op.status === 'online') : !!conversation.online;
            }
            if (statusEl) {
                statusEl.textContent = _realOnline ? 'Active now' : (conversation.lastSeen ? UIFeatures.formatLastSeen(conversation.lastSeen, false) : 'Offline');
            }
            if (indicatorEl) {
                indicatorEl.className = `chat-status ${_realOnline ? 'online' : 'offline'}`;
            }
            if (avatarEl) {
                if (conversation.friendAvatar) {
                    avatarEl.innerHTML = `<img src="${conversation.friendAvatar}" alt="${conversation.friendName || 'User'}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                } else {
                    const _initials = (conversation.friendName || 'U').charAt(0).toUpperCase();
                    avatarEl.innerHTML = `<span style="width:100%;height:100%;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;">${_initials}</span>`;
                }
                if (indicatorEl) avatarEl.appendChild(indicatorEl);
            }
            
            const messageInput = document.getElementById('messageInput');
            const sendButton = document.getElementById('sendButton');
            if (messageInput) messageInput.disabled = false;
            if (sendButton) sendButton.disabled = false;
            
            setTimeout(() => {
                if (messageInput) messageInput.focus();
            }, 100);
        },
        
        async fetchMessages(conversationId, options = {}) {
            if (!conversationId) return;
            if (typeof conversationId === 'string' && conversationId.startsWith('pending_')) {
                debugLog('[ConversationManager] Skipping fetchMessages for pending conversation:', conversationId);
                return;
            }
            if (!ensureActive('fetchMessages')) return;
            if (!SessionManager.isAuthenticated()) return;
            
            await ChatManager.fetchMessages(conversationId, options);
        },
        
        async fetchConversations() {
            if (!ensureActive('fetchConversations')) return;
            if (!SessionManager.isAuthenticated()) return;
            
            await ChatManager.fetchConversations();
        },
        
        markAsRead: function(conversationId) {
            const guardResult = window.__guardAction('markAsRead', MODULE_NAME, currentState);
            if (guardResult !== null) {
                return;
            }
            
            if (!conversationId) return;
            if (!canSendUserMessages()) return;
            if (!SessionManager.isAuthenticated()) return;

            const currentUserId = SessionManager.getUserId();
            const pendingReadIds = (ChatManager.getMessages() || [])
                .filter((message) => String(message.chatId || message.conversationId || '') === String(conversationId))
                .filter((message) => String(message.senderId || message.sender?.id || '') !== String(currentUserId))
                .filter((message) => !['read', 'seen'].includes(String(message.status || '').toLowerCase()))
                .map((message) => message.serverId || message.id)
                .filter(Boolean);

            // FIX: Read Receipts privacy setting (window.__readReceiptsEnabled,
            // set by applySettingToMessagesModule on every settings change) was
            // never actually checked here — read receipts were always sent to
            // the server regardless of the setting. Local unread-count clearing
            // below still happens either way (that's this user's own client
            // state); only the notification to the *other* party is gated.
            const readReceiptsEnabled = window.__readReceiptsEnabled !== undefined ? window.__readReceiptsEnabled : true;
            if (pendingReadIds.length > 0 && readReceiptsEnabled) {
                makeApiRequest('/messages/mark-read/batch', 'POST', {
                    chatId: conversationId,
                    messageIds: pendingReadIds
                }).catch(() => {});
            }
            
            const conversation = ChatManager.getConversation(conversationId);
            if (conversation) {
                conversation.unreadCount = 0;
                EventBus.emit('conversation:updated', conversation);
                
                try {
                    window.dispatchEvent(new CustomEvent('conversationRead', {
                        detail: { conversationId }
                    }));
                } catch (e) {}
            }
        },
        
        createConversation: async function(participants, options = {}) {
            if (!participants || participants.length === 0) return false;
            if (!SessionManager.isAuthenticated()) return false;

            const type = options.type || 'direct';

            if (type === 'direct' && participants.length === 1) {
                const receiverId = participants[0];
                const numericReceiverId = typeof receiverId === 'string' ? parseInt(receiverId, 10) : receiverId;
                
                try {
                    let existing = ChatManager.getConversations().find(c =>
                        c.type === 'direct' &&
                        isConversationMatchForUser(c, numericReceiverId, SessionManager.getUserId())
                    );

                    if (existing) {
                        await ConversationManager.openConversation(existing.id, options);
                        return existing.id;
                    }

                    let realUserName = options.name;
                    let realUserAvatar = null;
                    
                    if (window.MessagesCore && window.MessagesCore.FriendManager) {
                        const friend = window.MessagesCore.FriendManager.getFriend(numericReceiverId);
                        if (friend) {
                            realUserName = friend.displayName || friend.username || friend.name || options.name;
                            realUserAvatar = friend.avatar || friend.photoURL || null;
                        }
                    }
                    
                    if (!realUserName || realUserName === `User_${numericReceiverId}`) {
                        try {
                            // First try /api/users/search or /api/friends to avoid 404 on numeric IDs
                            let userInfo = null;
                            // Try friends endpoint which returns full user objects
                            const friendsList = await makeApiRequest('/friends', 'GET').catch(() => null);
                            const friendsArr = friendsList?.friends || friendsList?.data?.friends || friendsList?.data || (Array.isArray(friendsList) ? friendsList : []);
                            const matchedFriend = friendsArr.find(f =>
                                String(f.id) === String(numericReceiverId) ||
                                String(f.numericId) === String(numericReceiverId) ||
                                String(f.userId) === String(numericReceiverId)
                            );
                            if (matchedFriend) {
                                userInfo = matchedFriend;
                            }
                            // Fallback: try /api/users?id= query param (avoids 404 from path param)
                            if (!userInfo) {
                                const searchResult = await makeApiRequest(`/users/search?userId=${numericReceiverId}`, 'GET').catch(() => null);
                                userInfo = searchResult?.user || searchResult?.data?.user || searchResult?.data || null;
                            }
                            if (userInfo) {
                                realUserName = userInfo.displayName || userInfo.username || userInfo.name || options.name;
                                realUserAvatar = userInfo.avatar || userInfo.photoURL || null;
                            }
                        } catch (e) {
                            debugLog('[ConversationManager] Could not fetch user info:', e);
                        }
                    }
                    
                    if (!realUserName || realUserName === `User_${numericReceiverId}`) {
                        realUserName = options.name || `User_${numericReceiverId}`;
                    }

                    if (options.initialMessage && options.initialMessage.trim()) {
                        const body = {
                            receiverId: numericReceiverId,
                            content: options.initialMessage.trim(),
                            type: 'text'
                        };

                        const result = await makeApiRequest('/messages', 'POST', body);
                        
                        const chatId = result?.chatId || result?.data?.chatId || result?.id || result?.data?.id;

                        if (chatId) {
                            await ChatManager.fetchConversations();
                            await ConversationManager.openConversation(chatId, { ...options, friendId: numericReceiverId });
                            
                            try {
                                window.dispatchEvent(new CustomEvent('conversationCreated', {
                                    detail: { participants, options, chatId }
                                }));
                            } catch (e) {}
                            return chatId;
                        }
                    }
                    
                    const existingPending = ChatManager.getPendingConversationByReceiverId(numericReceiverId);
                    if (existingPending) {
                        await ConversationManager.openConversation(existingPending.id, { ...options, friendId: numericReceiverId });
                        return existingPending.id;
                    }
                    
                    const pendingConversation = ChatManager.getOrCreatePendingConversation(
                        numericReceiverId, 
                        realUserName, 
                        realUserAvatar
                    );
                    
                    if (pendingConversation) {
                        ChatManager.setActiveConversation(pendingConversation);
                        ConversationManager._showChatPanel(pendingConversation);
                        
                        try {
                            window.dispatchEvent(new CustomEvent('conversationCreated', {
                                detail: { 
                                    participants, 
                                    options, 
                                    chatId: pendingConversation.id,
                                    isPending: true,
                                    receiverId: numericReceiverId,
                                    userName: realUserName,
                                    userAvatar: pendingConversation.friendAvatar
                                }
                            }));
                        } catch (e) {}
                        
                        return pendingConversation.id;
                    }
                    
                    return false;
                    
                } catch (error) {
                    Logger.error('ConversationManager', 'Failed to create direct conversation:', error.message);
                }
                return false;
            }

            const result = safeSend(OUTGOING_ACTIONS.CREATE_CONVERSATION, {
                participants: participants,
                type,
                name: options.name,
                initialMessage: options.initialMessage
            }, { requireAck: false });
            
            if (result.blocked) {
                return false;
            }
            
            try {
                window.dispatchEvent(new CustomEvent('conversationCreated', {
                    detail: { participants, options }
                }));
            } catch (e) {}
            
            return true;
        },

        async getOrCreateConversationByUserId(userId, userName) {
            if (!userId) return null;
            
            const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
            
            let realUserName = userName;
            let realUserAvatar = null;
            
            if (window.MessagesCore && window.MessagesCore.FriendManager) {
                const friend = window.MessagesCore.FriendManager.getFriend(numericUserId);
                if (friend) {
                    realUserName = friend.displayName || friend.username || friend.name || userName;
                    realUserAvatar = friend.avatar || friend.photoURL || null;
                }
            }
            
            const existingConversation = ChatManager.getConversations().find(c =>
                c.type === 'direct' &&
                isConversationMatchForUser(c, numericUserId, SessionManager.getUserId())
            );
            
            if (existingConversation) {
                await this.openConversation(existingConversation.id, { friendId: numericUserId });
                return existingConversation;
            }
            
            const result = await this.createConversation([numericUserId], { 
                name: realUserName || userName || `User_${numericUserId}`,
                type: 'direct'
            });
            
            if (result && result !== false) {
                const newConversation = ChatManager.getConversations().find(c =>
                    c.type === 'direct' &&
                    isConversationMatchForUser(c, numericUserId, SessionManager.getUserId())
                );
                
                if (newConversation) {
                    await this.openConversation(newConversation.id);
                    return newConversation;
                }
                
                const tempConv = ChatManager.getActiveChat();
                if (tempConv && tempConv.pendingReceiverId === numericUserId) {
                    return tempConv;
                }
            }
            
            return null;
        },
        
        archiveConversation: function(conversationId, archived = true) {
            const guardResult = window.__guardAction('archiveConversation', MODULE_NAME, currentState);
            if (guardResult !== null) {
                return;
            }
            
            if (!conversationId) return;
            if (!canSendUserMessages()) return;
            if (!SessionManager.isAuthenticated()) return;
            
            safeSend(OUTGOING_ACTIONS.ARCHIVE_CONVERSATION, {
                conversationId: conversationId,
                archived: archived
            }, { requireAck: false });
            
            const conversation = ChatManager.getConversation(conversationId);
            if (conversation) {
                conversation.archived = archived;
                
                try {
                    const archivedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, []);
                    if (archived && !archivedChats.includes(conversationId)) {
                        archivedChats.push(conversationId);
                    } else if (!archived) {
                        const index = archivedChats.indexOf(conversationId);
                        if (index !== -1) archivedChats.splice(index, 1);
                    }
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, archivedChats);
                } catch (e) {}
                
                EventBus.emit('conversation:updated', conversation);
            }
        },
        
        blockUser: function(userId, block = true) {
            const guardResult = window.__guardAction('blockUser', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            if (!SessionManager.isAuthenticated()) return false;
            
            const result = safeSend(OUTGOING_ACTIONS.BLOCK_USER, {
                userId,
                block
            }, { requireAck: false });
            
            if (result.blocked) {
                return false;
            }
            
            try {
                const blockedUsers = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, []);
                if (block && !blockedUsers.includes(userId)) {
                    blockedUsers.push(userId);
                } else if (!block) {
                    const index = blockedUsers.indexOf(userId);
                    if (index !== -1) blockedUsers.splice(index, 1);
                }
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, blockedUsers);
            } catch (e) {}
            
            EventBus.emit('user:blocked', { userId, block });
            
            return true;
        }
    };
