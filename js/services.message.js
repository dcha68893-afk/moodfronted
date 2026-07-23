/**
 * services.message.js  (Offline-First Edition)
 * Abstraction layer for message-related operations.
 * LOCAL STORE is the primary source of truth.
 * Backend is a delivery + sync layer only.
 * @version 2.0.0
 */

(function () {
    'use strict';

    // ── UUID helper ──────────────────────────────────────────────────────────
    function _uuid() {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
        return 'msg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    }

    // ── Wait for a global to appear ──────────────────────────────────────────
    function _waitFor(getter, timeout = 5000) {
        return new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
                const v = getter();
                if (v) return resolve(v);
                if (Date.now() - start > timeout) return resolve(null);
                setTimeout(check, 100);
            };
            check();
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    class MessageService {
        constructor() {
            this._cache          = new Map();
            this._pendingRequests = new Map();
            this._retryConfig    = { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 };
        }

        // ── Dependencies (lazy) ──────────────────────────────────────────────
        get _localStore() { return window.KynectaLocalStore || null; }
        get _msgQueue()   { return window.KynectaMsgQueue   || null; }
        get _syncEngine() { return window.KynectaSyncEngine || null; }

        // ════════════════════════════════════════════════════════════════════
        // SEND MESSAGE — offline-first
        // ════════════════════════════════════════════════════════════════════
        async sendMessage(messageData) {
            const localStore = this._localStore;
            const normalizedPayload = this._normalizeOutgoingMessage(messageData);

            // 1. Generate local UUID
            const localId = _uuid();

            // 2. Save locally as pending
            const localMsg = localStore ? await localStore.saveMessage({
                id:          localId,
                chatId:      normalizedPayload.chatId,
                senderId:    normalizedPayload.senderId || this._getCurrentUserId(),
                content:     normalizedPayload.content,
                type:        normalizedPayload.type || 'text',
                replyToId:   normalizedPayload.replyToId || null,
                status:      'pending',
                isLocalOnly: true,
                createdAt:   Date.now()
            }) : null;

            // 3. Immediately reflect in UI via store/eventbus
            if (localMsg) {
                this._updateStoreMessages(normalizedPayload.chatId, localMsg);
                this._emitEvent('MESSAGE_PENDING', localMsg);
            }

            // 4. Try to send to backend
            try {
                const response = await this._makeRequest('POST', '/api/messages', {
                    ...normalizedPayload,
                    localId,
                    // Attach any pending link preview from KynectaLinkPreview
                    linkPreview: (window.KynectaLinkPreview && typeof window.KynectaLinkPreview.getPreviewForMessage === 'function')
                        ? window.KynectaLinkPreview.getPreviewForMessage()
                        : undefined,
                });

                const serverEnvelope = response?.data?.message || response?.message || response?.data || response;
                const serverMsg = this._normalizeIncomingMessage(serverEnvelope, {
                    fallbackChatId: normalizedPayload.chatId,
                    fallbackSenderId: normalizedPayload.senderId || this._getCurrentUserId()
                });
                const serverId  = serverMsg?.id;

                // 5a. On success: confirm local message
                if (localStore && serverId) {
                    await localStore.confirmMessage(localId, String(serverId), {
                        chatId:    serverMsg.chatId || normalizedPayload.chatId,
                        createdAt: serverMsg.createdAt || Date.now()
                    });
                }

                const finalMsg = {
                    ...(localMsg || {}),
                    ...serverMsg,
                    id: serverId ? String(serverId) : (localMsg?.id || localId),
                    localId,
                    serverId: serverId ? String(serverId) : null,
                    status: 'sent',
                    isLocalOnly: false
                };

                this._updateStoreMessages(normalizedPayload.chatId, finalMsg);
                this._emitEvent('MESSAGE_SENT', finalMsg);
                // Clear link preview card after send
                try { window.KynectaLinkPreview?.clearAfterSend?.(); } catch (_) {}

                return finalMsg;

            } catch (error) {
                // 5b. On failure: mark failed + enqueue for retry
                if (localStore) {
                    await localStore.updateMessageStatus(localId, 'failed');
                }

                if (this._msgQueue) {
                    this._msgQueue.enqueue({ ...normalizedPayload, localId, id: localId });
                } else {
                    // Fallback to legacy offline queue
                    this._queueOfflineMessage('send', { ...normalizedPayload, localId });
                }

                this._emitEvent('MESSAGE_FAILED', { localId, error: error.message });

                // Return local message so UI still shows it
                return localMsg || { id: localId, status: 'failed', ...normalizedPayload };
            }
        }

        // ════════════════════════════════════════════════════════════════════
        // GET MESSAGES — read from local store first
        // ════════════════════════════════════════════════════════════════════
        async getMessages(chatId, options = {}) {
            if (!chatId) return [];

            // Always return from local store immediately
            const localStore = this._localStore;
            if (localStore) {
                const localMsgs = await localStore.getMessagesByChat(chatId, {
                    limit: options.limit || 100,
                    before: options.before || null
                });

                if (localMsgs.length > 0) {
                    this._updateStoreMessages(chatId, null, localMsgs);
                    // Background sync
                    if (navigator.onLine && this._syncEngine) {
                        this._syncEngine.syncChat(chatId, { limit: options.limit || 50 }).catch(() => {});
                    }
                    return localMsgs;
                }
            }

            // No local data — fetch from server
            const cacheKey = `chat_${chatId}_${options.before || 'latest'}`;
            if (this._pendingRequests.has(cacheKey)) return this._pendingRequests.get(cacheKey);

            const params = new URLSearchParams({ limit: options.limit || 50, ...(options.before && { before: options.before }) });
            const requestPromise = this._makeRequest('GET', `/api/messages?chatId=${chatId}&${params}`)
                .then(async response => {
                    this._pendingRequests.delete(cacheKey);
                    const rawMessages = response?.data?.messages || response?.messages || response?.data || [];
                    const messages = Array.isArray(rawMessages)
                        ? rawMessages.map((message) => this._normalizeIncomingMessage(message, { fallbackChatId: chatId }))
                        : [];
                    if (localStore && messages.length) {
                        await localStore.mergeServerMessages(chatId, messages);
                        const local = await localStore.getMessagesByChat(chatId, options);
                        this._updateStoreMessages(chatId, null, local);
                        return local;
                    }
                    return messages;
                })
                .catch(err => { this._pendingRequests.delete(cacheKey); throw err; });

            this._pendingRequests.set(cacheKey, requestPromise);
            return requestPromise;
        }

        // ════════════════════════════════════════════════════════════════════
        // DELETE / EDIT / MARK-READ — optimistic local, then server
        // ════════════════════════════════════════════════════════════════════
        async deleteMessage(messageId, chatId) {
            const localStore = this._localStore;

            // Optimistic local delete
            if (localStore) await localStore.deleteMessage(messageId);
            this._removeFromStore(chatId, messageId);
            this._emitEvent('MESSAGE_DELETED', { messageId, chatId });

            // Background server delete
            try {
                await this._makeRequest('DELETE', `/api/messages/${messageId}`);
            } catch (err) {
                console.warn('[MessageService] Server delete failed (local already done):', err.message);
            }
        }

        async editMessage(messageId, content, chatId) {
            const localStore = this._localStore;

            // Optimistic update
            if (localStore) await localStore.updateMessage(messageId, { content, edited: true });
            this._patchInStore(chatId, messageId, { content, edited: true });
            this._emitEvent('MESSAGE_EDITED', { messageId, content, chatId });

            try {
                const response = await this._makeRequest('PATCH', `/api/messages/${messageId}`, { content });
                return response?.data;
            } catch (err) {
                console.warn('[MessageService] Server edit failed (local already done):', err.message);
            }
        }

        async markAsRead(chatId, messageIds) {
            const localStore = this._localStore;
            if (localStore && Array.isArray(messageIds)) {
                for (const id of messageIds) {
                    await localStore.updateMessageStatus(id, 'read').catch(() => {});
                }
            }

            if (window.KynectaStore) {
                const unread = window.KynectaStore.get('messages.unread') || {};
                delete unread[chatId];
                window.KynectaStore.set('messages.unread', unread);
            }

            if (!navigator.onLine) return { queued: true };

            try {
                const result = await this._makeRequest('POST', `/api/messages/mark-read/batch`, { messageIds, chatId });
                this._emitEvent('MESSAGE_READ', { chatId, messageIds, result });
                return result;
            } catch (err) {
                console.warn('[MessageService] markAsRead server call failed:', err.message);
            }
        }

        async sendTyping(chatId, isTyping) {
            if (!navigator.onLine) return;
            try {
                await this._makeRequest('POST', `/api/chats/${chatId}/typing`, { typing: isTyping });
            } catch {}
        }

        async uploadFile(file, onProgress = null) {
            const formData = new FormData();
            formData.append('file', file);
            const options = { method: 'POST', body: formData, headers: {} };
            if (onProgress) options.onUploadProgress = onProgress;
            return this._makeRequest('POST', '/api/files/upload', null, options);
        }

        // ── Private helpers ──────────────────────────────────────────────────

        _getCurrentUserId() {
            return window.MessagesCore?.getCurrentUserId?.()
                || window.__PARENT_SESSION__?.userId
                || null;
        }

        _updateStoreMessages(chatId, singleMsg, allMsgs = null) {
            if (!window.KynectaStore) return;
            if (allMsgs) {
                window.KynectaStore.set(`messages.byChat.${chatId}`, allMsgs);
                return;
            }
            if (!singleMsg) return;
            const existing = window.KynectaStore.get(`messages.byChat.${chatId}`) || [];
            const idx = existing.findIndex(m => m.id === singleMsg.id);
            if (idx >= 0) {
                existing[idx] = { ...existing[idx], ...singleMsg };
                window.KynectaStore.set(`messages.byChat.${chatId}`, existing);
            } else {
                window.KynectaStore.set(`messages.byChat.${chatId}`, [...existing, singleMsg]);
            }
        }

        _removeFromStore(chatId, messageId) {
            if (!window.KynectaStore || !chatId) return;
            const existing = window.KynectaStore.get(`messages.byChat.${chatId}`) || [];
            window.KynectaStore.set(`messages.byChat.${chatId}`, existing.filter(m => m.id !== messageId));
        }

        _patchInStore(chatId, messageId, patch) {
            if (!window.KynectaStore || !chatId) return;
            const existing = window.KynectaStore.get(`messages.byChat.${chatId}`) || [];
            window.KynectaStore.set(`messages.byChat.${chatId}`, existing.map(m =>
                m.id === messageId ? { ...m, ...patch } : m
            ));
        }

        _emitEvent(type, data) {
            if (window.KynectaEventBus) window.KynectaEventBus.emit(type, data);
            try { window.dispatchEvent(new CustomEvent(`kyn:${type.toLowerCase()}`, { detail: data })); } catch {}
        }

        // ── Network ──────────────────────────────────────────────────────────

        async _makeRequest(method, endpoint, data = null, customOptions = {}) {
            const token = window.__PARENT_SESSION__?.token
                || window.AUTH_SESSION?.token
                || localStorage.getItem('token')
                || localStorage.getItem('moodchat_token')
                || null;

            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...customOptions.headers
            };

            const options = { method, headers, credentials: 'include', ...customOptions };
            if (data && method !== 'GET') options.body = JSON.stringify(data);

            if (window.api?.request?.request) {
                const requestOptions = { ...customOptions, headers };
                // api.request.request expects `options.body` (not `options.data`)
                if (data !== null && data !== undefined && method !== 'GET') {
                    requestOptions.body = data;
                }
                return window.api.request.request(method, endpoint, requestOptions);
            }
            return this._fetchWithRetry(endpoint, options);
        }

        _normalizeOutgoingMessage(messageData = {}) {
            return {
                ...messageData,
                chatId: messageData.chatId || messageData.conversationId || null,
                senderId: messageData.senderId || this._getCurrentUserId(),
                type: messageData.type || messageData.messageType || 'text',
                replyToId: messageData.replyToId || messageData.replyTo || null
            };
        }

        _normalizeIncomingMessage(message = {}, context = {}) {
            if (!message || typeof message !== 'object') {
                return message;
            }

            const createdAt = message.createdAt || message.timestamp || Date.now();
            return {
                ...message,
                id: message.id != null ? String(message.id) : message.localId || _uuid(),
                chatId: message.chatId || message.conversationId || context.fallbackChatId || null,
                conversationId: message.conversationId || message.chatId || context.fallbackChatId || null,
                senderId: message.senderId || message.sender?.id || context.fallbackSenderId || null,
                type: message.type || message.messageType || 'text',
                replyToId: message.replyToId || message.replyTo || null,
                timestamp: createdAt,
                createdAt,
                status: message.status || (message.readAt ? 'read' : message.deliveredAt ? 'delivered' : message.sentAt ? 'sent' : 'sent')
            };
        }

        async _fetchWithRetry(endpoint, options, attempt = 1) {
            try {
                const response = await fetch(endpoint, options);
                if (!response.ok) {
                    if (response.status === 401) {
                        const refreshed = await this._refreshToken();
                        if (refreshed) {
                            options.headers['Authorization'] = `Bearer ${refreshed}`;
                            return this._fetchWithRetry(endpoint, options, attempt);
                        }
                    }
                    if (response.status >= 500 && attempt <= this._retryConfig.maxRetries) {
                        const delay = Math.min(this._retryConfig.baseDelay * Math.pow(2, attempt - 1), this._retryConfig.maxDelay);
                        await new Promise(r => setTimeout(r, delay));
                        return this._fetchWithRetry(endpoint, options, attempt + 1);
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            } catch (error) {
                if (attempt <= this._retryConfig.maxRetries && navigator.onLine) {
                    const delay = Math.min(this._retryConfig.baseDelay * Math.pow(2, attempt - 1), this._retryConfig.maxDelay);
                    await new Promise(r => setTimeout(r, delay));
                    return this._fetchWithRetry(endpoint, options, attempt + 1);
                }
                throw error;
            }
        }

        async _refreshToken() {
            try {
                const refreshToken = localStorage.getItem('kynecta_refresh_token');
                if (!refreshToken) return null;
                const response = await fetch('/api/auth/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken })
                });
                if (!response.ok) return null;
                const data = await response.json();
                if (data.token) {
                    localStorage.setItem('kynecta_token', data.token);
                    if (data.refreshToken) localStorage.setItem('kynecta_refresh_token', data.refreshToken);
                    if (window.__PARENT_SESSION__) window.__PARENT_SESSION__.token = data.token;
                }
                return data.token || null;
            } catch { return null; }
        }

        _queueOfflineMessage(action, data) {
            const queue = JSON.parse(localStorage.getItem('kynecta_offline_queue') || '[]');
            const item  = { id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, action, data, timestamp: Date.now() };
            queue.push(item);
            localStorage.setItem('kynecta_offline_queue', JSON.stringify(queue));
            this._emitEvent('MESSAGE_OFFLINE_QUEUED', item);
            return { queued: true, id: item.id };
        }

        // Keep legacy _mergeMessages for backward compat with sync manager
        _mergeMessages(existing, incoming) {
            const map = new Map();
            existing.forEach(m => map.set(m.id, m));
            incoming.forEach(m => map.set(m.id, m));
            return Array.from(map.values()).sort((a, b) => (a.timestamp || a.createdAt || 0) - (b.timestamp || b.createdAt || 0));
        }
    }

    window.services       = window.services || {};
    window.services.message = new MessageService();

    console.log('[MessageService] ✅ Ready (offline-first v2)');
})();
