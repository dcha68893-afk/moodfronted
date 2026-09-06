// =============================================================================
// message-client.js — the Message Module's client-side implementation
// -----------------------------------------------------------------------------
// One file, one job split into three clearly-owned sections below:
//   1. STORE      — the single authoritative client message state (spec §41)
//   2. TRANSPORT  — REST (window.api.request) + realtime (window.KynectaRealtime),
//                    both existing shared infrastructure, reused not rebuilt (§12, §54)
//   3. CONTRACT   — window.MessageModule.openChat(), the one public entry point
//                    other modules/the shell use to reach this module (§21)
//
// There is exactly one send pipeline (sendMessage below) and exactly one
// place messages enter state (applyIncomingMessage) regardless of whether
// they arrived via REST response, socket 'message:new', or reconnect sync —
// satisfying §18/§19 (no duplicate rendering of the same logical message).
// =============================================================================

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // 1. STORE — single source of truth
    // ═══════════════════════════════════════════════════════════════════════

    const state = {
        conversations: new Map(),        // chatId -> { chatId, otherUser, lastMessage, unreadCount }
        messagesByConversation: new Map(), // chatId -> Map(messageId -> message)
        activeChatId: null,
        connectionState: 'disconnected',
    };

    const listeners = new Set();
    function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    function notify(event, data) { listeners.forEach(fn => { try { fn(event, data); } catch (_) {} }); }

    function getOrCreateConversationBucket(chatId) {
        if (!state.messagesByConversation.has(chatId)) {
            state.messagesByConversation.set(chatId, new Map());
        }
        return state.messagesByConversation.get(chatId);
    }

    function upsertConversationMeta(chatId, patch) {
        const existing = state.conversations.get(chatId) || { chatId, unreadCount: 0 };
        state.conversations.set(chatId, Object.assign(existing, patch));
        notify('conversation:updated', state.conversations.get(chatId));
    }

    // The ONE place a message (from any source) enters client state.
    // Handles: dedup by id, dedup by clientMessageId (optimistic reconciliation),
    // ordering by id (server-authoritative — spec §36), and decryption.
    function applyIncomingMessage(message, { fromSelf = false } = {}) {
        const chatId = message.chatId;
        const bucket = getOrCreateConversationBucket(chatId);

        if (bucket.has(message.id)) {
            bucket.set(message.id, Object.assign({}, bucket.get(message.id), message));
        } else {
            bucket.set(message.id, message);
        }

        upsertConversationMeta(chatId, {
            lastMessage: message,
            unreadCount: fromSelf ? (state.conversations.get(chatId)?.unreadCount || 0)
                                  : (chatId === state.activeChatId ? 0 : (state.conversations.get(chatId)?.unreadCount || 0) + 1),
            otherUser: (!fromSelf && message.senderId)
                ? Object.assign({}, state.conversations.get(chatId)?.otherUser, {
                    id: message.senderId,
                    username: (state.conversations.get(chatId)?.otherUser?.username) || (message.sender && message.sender.username),
                    avatar: (state.conversations.get(chatId)?.otherUser?.avatar) || (message.sender && message.sender.avatar),
                  })
                : state.conversations.get(chatId)?.otherUser,
        });

        notify('message:added', { chatId, message });
        decryptForDisplay(chatId, message);
    }

    // Runs decryptMessageForDisplay() (the app's one canonical decrypt path
    // — every UI surface is supposed to go through it, per its own header
    // comment) and stores the result separately from the raw .content, so
    // the raw envelope is preserved (needed for retry-on-key-arrival) while
    // rendering always uses the resolved plaintext.
    function syncLastMessageDisplay(chatId, messageId, displayContent) {
        const conv = state.conversations.get(chatId);
        if (conv && conv.lastMessage && conv.lastMessage.id === messageId) {
            conv.lastMessage = Object.assign({}, conv.lastMessage, { displayContent });
            notify('conversation:updated', conv);
        }
    }

    async function decryptForDisplay(chatId, message) {
        if (message.displayContent !== undefined) return; // already resolved (e.g. our own just-sent message)
        if (!window.KynectaE2E) {
            const bucket = state.messagesByConversation.get(chatId);
            if (bucket && bucket.has(message.id)) {
                bucket.set(message.id, Object.assign({}, bucket.get(message.id), { displayContent: message.content }));
                syncLastMessageDisplay(chatId, message.id, message.content);
            }
            return;
        }
        const conv = state.conversations.get(chatId);
        const DECRYPT_FALLBACK = '🔒 Encrypted message';
        try {
            const plaintext = await window.KynectaE2E.decryptMessageForDisplay(message, chatId, window._kynCurrentUserId, {
                activeConversation: conv ? { otherUserId: conv.otherUser && conv.otherUser.id } : null,
                fallbackText: DECRYPT_FALLBACK,
                onResolved: (resolvedText) => {
                    const bucket = state.messagesByConversation.get(chatId);
                    if (bucket && bucket.has(message.id)) {
                        bucket.set(message.id, Object.assign({}, bucket.get(message.id), { displayContent: resolvedText }));
                        syncLastMessageDisplay(chatId, message.id, resolvedText);
                        notify('message:decrypted', { chatId, messageId: message.id });
                    }
                },
            });
            const isQueued = typeof window.KynectaE2E.isMessageQueued === 'function' && window.KynectaE2E.isMessageQueued(message);
            const displayValue = (isQueued && plaintext === DECRYPT_FALLBACK) ? 'Decrypting…' : plaintext;
            const bucket = state.messagesByConversation.get(chatId);
            if (bucket && bucket.has(message.id)) {
                bucket.set(message.id, Object.assign({}, bucket.get(message.id), { displayContent: displayValue }));
                syncLastMessageDisplay(chatId, message.id, displayValue);
                notify('message:decrypted', { chatId, messageId: message.id });
            }
        } catch (_) {
            const bucket = state.messagesByConversation.get(chatId);
            if (bucket && bucket.has(message.id)) {
                bucket.set(message.id, Object.assign({}, bucket.get(message.id), { displayContent: '🔒 Encrypted message' }));
                syncLastMessageDisplay(chatId, message.id, '🔒 Encrypted message');
            }
        }
    }

    // Gives the user an actual recovery path when decryption failed
    // (e.g. the key exchange completes later) instead of leaving the
    // "🔒 Encrypted message" placeholder as a permanent dead end.
    async function retryDecrypt(chatId, messageId) {
        const bucket = state.messagesByConversation.get(chatId);
        if (!bucket || !bucket.has(messageId)) return;
        const message = bucket.get(messageId);
        bucket.set(messageId, Object.assign({}, message, { displayContent: undefined }));
        await decryptForDisplay(chatId, bucket.get(messageId));
        notify('message:decrypted', { chatId, messageId });
    }

    function getMessages(chatId) {
        const bucket = state.messagesByConversation.get(chatId);
        if (!bucket) return [];
        return Array.from(bucket.values())
            .filter(m => !(m.deleted && !m.deleteForEveryone)) // "delete for me" hides it from my own view only
            .sort((a, b) => a.id - b.id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. TRANSPORT — reuses window.api.request (REST) and window.KynectaRealtime
    //    (socket). No new HTTP client, no new socket connection (§12, §54).
    // ═══════════════════════════════════════════════════════════════════════

    function api() {
        if (!window.api || !window.api.request) throw new Error('window.api.request not ready');
        return window.api.request;
    }

    async function loadHistory(chatId, { before = null, limit = 50 } = {}) {
        const qs = new URLSearchParams();
        if (before) qs.set('before', before);
        qs.set('limit', String(limit));
        const res = await api().get(`/messages/${chatId}?${qs.toString()}`);
        if (res && res.success && Array.isArray(res.data)) {
            res.data.forEach(m => applyIncomingMessage(m, { fromSelf: false }));
            return { messages: res.data, hasMore: !!res.hasMore };
        }
        return { messages: [], hasMore: false };
    }

    async function syncMissed(chatId, sinceId) {
        const res = await api().get(`/messages/${chatId}/sync?sinceId=${encodeURIComponent(sinceId || '')}`);
        if (res && res.success && Array.isArray(res.data)) {
            res.data.forEach(m => applyIncomingMessage(m, { fromSelf: false }));
        }
        return res && res.data ? res.data : [];
    }

    // Uses the existing generic /api/files/upload endpoint — not
    // message-specific infra, and not the Media-table path (routes/media.js
    // has a pre-existing bug where its Media.create() call uses field names
    // that don't match the Media model's actual schema; not touching that).
    // Attachment info instead travels in the message's own metadata field,
    // which messageDeliveryService.sendMessage() already supports generically.
    async function uploadAttachment(file, onProgress) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api().post('/files/upload', formData);
        if (!res || res.success === false) throw new Error((res && res.message) || 'Upload failed');
        const data = res.data || res;
        return { url: data.url, mimeType: data.mimeType, size: data.size, type: data.type, originalName: data.originalName };
    }

    // Message.type is a DB ENUM that only allows 'file' for non-media
    // documents (files.js's upload endpoint returns 'document' for
    // PDFs/docs, which isn't a valid value there — would fail the insert).
    const MESSAGE_TYPE_ENUM = new Set(['text', 'image', 'video', 'audio', 'file', 'sticker', 'location', 'contact', 'system', 'status_reply', 'poll', 'view_once']);
    function toMessageType(attachmentType) {
        return MESSAGE_TYPE_ENUM.has(attachmentType) ? attachmentType : 'file';
    }

    // Resolves the userId to encrypt FOR — the other participant in a
    // known conversation, or the explicit receiverId when starting a
    // brand-new one (no chatId yet).
    function resolveRecipientUserId(chatId, receiverId) {
        if (receiverId) return receiverId;
        const conv = state.conversations.get(chatId);
        return conv && conv.otherUser ? conv.otherUser.id : null;
    }

    // ONE send pipeline: REST. (Verified against chat.html: there is no
    // parent-side handler for the generic REALTIME_SEND bridge that
    // KynectaRealtime.emit() would use from inside an iframe, and the
    // app's own established pattern for sending is REST — see the original
    // api.request.js sendMessage(). Using REST here also satisfies §16:
    // sending must not depend on an active socket connection.)
    //
    // SECURITY NOTE: this encrypts the text content/caption via the app's
    // existing window.KynectaE2E.encryptForChat() before it ever leaves the
    // client — matching how the deleted messaging module worked, which this
    // rebuild had omitted entirely until now. It does NOT encrypt the
    // attachment file itself (the uploaded file bytes go through the plain
    // generic /api/files/upload endpoint and are reachable at a bare URL);
    // window.KynectaE2E does expose encryptAttachment()/decryptAttachment()
    // for that, but wiring actual file-content encryption (encrypt before
    // upload, decrypt after download, plus key handling for the file itself)
    // is a separate, larger piece of work not done here — flagging this
    // explicitly rather than implying attachments are covered when they
    // are not.
    async function sendMessage({ chatId, receiverId, content, type = 'text', replyToId = null, attachment = null }) {
        const clientMessageId = generateClientMessageId();
        const optimisticId = `optimistic:${clientMessageId}`;
        const optimisticMessage = {
            id: optimisticId, _optimisticId: optimisticId, chatId: chatId || `pending:${receiverId}`,
            senderId: window._kynCurrentUserId || null, content, type: attachment ? toMessageType(attachment.type) : type, replyToId,
            clientMessageId, createdAt: new Date().toISOString(), status: 'sending',
            metadata: attachment ? { attachment } : null,
            displayContent: content, // optimistic bubble shows plaintext immediately — it's our own message
        };
        const bucket = getOrCreateConversationBucket(optimisticMessage.chatId);
        bucket.set(optimisticId, optimisticMessage);
        notify('message:added', { chatId: optimisticMessage.chatId, message: optimisticMessage });

        if (receiverId) {
            upsertConversationMeta(optimisticMessage.chatId, {
                otherUser: Object.assign({}, state.conversations.get(optimisticMessage.chatId)?.otherUser, { id: receiverId }),
            });
        }

        let outgoingContent = content;
        const recipientUserId = resolveRecipientUserId(optimisticMessage.chatId, receiverId);
        if (content && window.KynectaE2E && recipientUserId) {
            try {
                outgoingContent = await window.KynectaE2E.encryptForChat(content, chatId || null, recipientUserId);
            } catch (err) {
                bucket.set(optimisticId, Object.assign({}, optimisticMessage, { status: 'failed' }));
                notify('message:failed', { chatId: optimisticMessage.chatId, clientMessageId, error: err.message });
                return { success: false, error: err.message || 'Could not establish a secure connection to send this message' };
            }
        }

        try {
            const res = await api().post('/messages', {
                chatId, receiverId, content: outgoingContent, type: attachment ? toMessageType(attachment.type) : type,
                replyToId, clientMessageId, metadata: attachment ? { attachment } : undefined,
            });
            if (res && res.success) {
                bucket.delete(optimisticId);
                // Real conversations may have a different chatId than the
                // "pending:<receiverId>" bucket we optimistically wrote to
                // on the very first message — move the bucket AND the
                // conversation metadata (otherUser especially — without
                // this, encryption's recipient resolution would silently
                // have nothing to go on for this conversation going forward).
                if (optimisticMessage.chatId !== res.data.chatId) {
                    state.messagesByConversation.delete(optimisticMessage.chatId);
                    const pendingMeta = state.conversations.get(optimisticMessage.chatId);
                    if (pendingMeta) {
                        upsertConversationMeta(res.data.chatId, { otherUser: pendingMeta.otherUser });
                        state.conversations.delete(optimisticMessage.chatId);
                    }
                }
                // We already have the plaintext (we just typed it) — no need
                // to round-trip it through decrypt; store the server's
                // envelope in .content (for consistency with history/sync)
                // but keep our own plaintext as displayContent directly.
                applyIncomingMessage(Object.assign({}, res.data, { clientMessageId, displayContent: content }), { fromSelf: true });
                return { success: true, messageId: res.data.id, chatId: res.data.chatId };
            }
            bucket.set(optimisticId, Object.assign({}, optimisticMessage, { status: 'failed' }));
            notify('message:failed', { chatId: optimisticMessage.chatId, clientMessageId });
            return { success: false, error: res && res.message };
        } catch (err) {
            bucket.set(optimisticId, Object.assign({}, optimisticMessage, { status: 'failed' }));
            notify('message:failed', { chatId: optimisticMessage.chatId, clientMessageId });
            return { success: false, error: err.message };
        }
    }

    async function markRead(chatId, messageIds) {
        if (!messageIds || messageIds.length === 0) return;
        upsertConversationMeta(chatId, { unreadCount: 0 });
        if (settingsState.privacy.readReceipts === false) return; // instant, no refresh needed
        try { await api().post('/messages/read', { messageIds }); } catch (_) {}
    }

    async function deleteMessage(chatId, messageId, { forEveryone = false } = {}) {
        try {
            const res = await api().delete(`/messages/${messageId}?deleteForEveryone=${forEveryone}`);
            if (res && res.success) {
                const bucket = state.messagesByConversation.get(chatId);
                if (bucket && bucket.has(messageId)) {
                    const existing = bucket.get(messageId);
                    bucket.set(messageId, Object.assign({}, existing, {
                        content: forEveryone ? 'This message was deleted' : existing.content,
                        deleted: true, deleteForEveryone: forEveryone,
                    }));
                    notify('message:deleted', { chatId, messageId });
                }
                return { success: true };
            }
            return { success: false, error: res && res.message };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async function editMessage(chatId, messageId, content) {
        try {
            let outgoingContent = content;
            const recipientUserId = resolveRecipientUserId(chatId, null);
            if (content && window.KynectaE2E && recipientUserId) {
                try {
                    outgoingContent = await window.KynectaE2E.encryptForChat(content, chatId, recipientUserId);
                } catch (err) {
                    return { success: false, error: err.message || 'Could not encrypt the edited message' };
                }
            }
            // window.api.request has no .patch() — only .put(); the backend
            // route accepts both (matching the app's existing PUT-alias
            // convention for exactly this reason).
            const res = await api().put(`/messages/${messageId}`, { content: outgoingContent });
            if (res && res.success) {
                const bucket = state.messagesByConversation.get(chatId);
                if (bucket && bucket.has(messageId)) {
                    bucket.set(messageId, Object.assign({}, bucket.get(messageId), {
                        content: res.data.content, displayContent: content, isEdited: true, editedAt: res.data.editedAt,
                    }));
                    notify('message:edited', { chatId, messageId });
                }
                return { success: true };
            }
            return { success: false, error: res && res.message };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // Inbound realtime: chat.html's existing bridge (_fwdNewMessage /
    // _fwdMessageDelivered / _fwdMessageRead — already working, not touched)
    // posts raw, non-prefixed postMessage types straight into this iframe.
    // Listen for those directly rather than via KynectaRealtime.on(), which
    // only reacts to the generic REALTIME_EVENT:-prefixed form these events
    // deliberately bypass (see chat.html's _SKIP_WILDCARD list).
    async function starMessage(chatId, messageId) {
        try {
            const res = await api().post(`/messages/${messageId}/star`);
            if (res && res.success) {
                const bucket = state.messagesByConversation.get(chatId);
                if (bucket && bucket.has(messageId)) {
                    bucket.set(messageId, Object.assign({}, bucket.get(messageId), { starred: true }));
                    notify('message:starred', { chatId, messageId });
                }
            }
            return res;
        } catch (err) { return { success: false, error: err.message }; }
    }

    async function unstarMessage(chatId, messageId) {
        try {
            const res = await api().delete(`/messages/${messageId}/star`);
            if (res && res.success) {
                const bucket = state.messagesByConversation.get(chatId);
                if (bucket && bucket.has(messageId)) {
                    bucket.set(messageId, Object.assign({}, bucket.get(messageId), { starred: false }));
                    notify('message:starred', { chatId, messageId });
                }
            }
            return res;
        } catch (err) { return { success: false, error: err.message }; }
    }

    async function muteChat(chatId, duration) {
        try {
            const res = await api().put(`/messages/${chatId}/mute`, { muted: true, duration });
            if (res && res.success) upsertConversationMeta(chatId, { muted: true });
            return res;
        } catch (err) { return { success: false, error: err.message }; }
    }

    async function unmuteChat(chatId) {
        try {
            const res = await api().delete(`/messages/${chatId}/mute`);
            if (res && res.success) upsertConversationMeta(chatId, { muted: false });
            return res;
        } catch (err) { return { success: false, error: err.message }; }
    }

    async function reactToMessage(chatId, messageId, emoji) {
        try {
            const res = await api().post(`/messages/${messageId}/react`, { emoji });
            if (res && res.success) {
                const bucket = state.messagesByConversation.get(chatId);
                if (bucket && bucket.has(messageId)) {
                    bucket.set(messageId, Object.assign({}, bucket.get(messageId), { reactions: res.data.reactions }));
                    notify('message:reaction', { chatId, messageId });
                }
            }
            return res;
        } catch (err) { return { success: false, error: err.message }; }
    }

    async function removeReaction(chatId, messageId) {
        try {
            const res = await api().delete(`/messages/${messageId}/react`);
            if (res && res.success) {
                const bucket = state.messagesByConversation.get(chatId);
                if (bucket && bucket.has(messageId)) {
                    bucket.set(messageId, Object.assign({}, bucket.get(messageId), { reactions: res.data.reactions }));
                    notify('message:reaction', { chatId, messageId });
                }
            }
            return res;
        } catch (err) { return { success: false, error: err.message }; }
    }

    // Client-side search only — Message.content is E2E-encrypted ciphertext,
    // so a server-side search endpoint (ILIKE/full-text) can never match
    // what the user actually typed. This searches already-decrypted
    // displayContent held locally, exactly like real E2E messengers do.
    function searchMessages(chatId, query) {
        const q = (query || '').trim().toLowerCase();
        if (!q) return [];
        const scope = chatId ? [chatId] : Array.from(state.messagesByConversation.keys());
        const results = [];
        scope.forEach(cid => {
            getMessages(cid).forEach(m => {
                if (m.displayContent && m.displayContent.toLowerCase().includes(q)) {
                    results.push(m);
                }
            });
        });
        return results;
    }

    // Live settings reactivity — same postMessage contract every other
    // module (friend, calls, group, tools) already listens for; not a new
    // mechanism. Defaults match this app's actual settings schema
    // (settings-core.js: privacy.readReceipts, chat.enterToSend/messagePreviews).
    const settingsState = { privacy: { readReceipts: true }, chat: { enterToSend: true, messagePreviews: true } };

    function applySettingToMessageModule(section, key, value) {
        if (!settingsState[section]) settingsState[section] = {};
        settingsState[section][key] = value;
        notify('settings:changed', { section, key, value });
    }

    // Typing indicators. Outbound goes through chat.html's existing
    // START_TYPING/STOP_TYPING postMessage bridge (confirmed working —
    // it already relays to the real socket; this isn't a new mechanism).
    // Inbound arrives via the generic KynectaRealtime wildcard forwarder,
    // since typing:start/stop aren't on chat.html's dedicated-bridge skip
    // list. A safety auto-clear timeout guards against a missed 'stop'
    // event (e.g. the other person's network drops mid-typing) leaving the
    // indicator stuck forever — same lesson as the encryption placeholder.
    const typingState = new Map(); // chatId -> timeout handle

    function sendTypingStart(chatId) {
        if (!chatId) return;
        try { window.parent.postMessage({ type: 'START_TYPING', payload: { conversationId: chatId } }, '*'); } catch (_) {}
    }
    function sendTypingStop(chatId) {
        if (!chatId) return;
        try { window.parent.postMessage({ type: 'STOP_TYPING', payload: { conversationId: chatId } }, '*'); } catch (_) {}
    }

    function wireRealtimeListeners() {
        window.addEventListener('message', (event) => {
            const data = event.data;
            if (!data || typeof data !== 'object') return;

            if (data.type === 'SETTING_CHANGED' || data.type === 'SETTINGS_UPDATED') {
                const payload = data.payload || data;
                if (data.type === 'SETTING_CHANGED' && payload.section && payload.key !== undefined) {
                    applySettingToMessageModule(payload.section, payload.key, payload.value);
                }
                if (data.type === 'SETTINGS_UPDATED' && payload.settings) {
                    Object.entries(payload.settings).forEach(([sec, secVal]) => {
                        if (secVal && typeof secVal === 'object') {
                            Object.entries(secVal).forEach(([k, v]) => applySettingToMessageModule(sec, k, v));
                        }
                    });
                }
                return;
            }

            if (data.type === 'SESSION_DATA' && data.payload && data.payload.userId != null) {
                window._kynCurrentUserId = data.payload.userId;
                return;
            }

            if (data.type === 'message:new') {
                const payload = data.payload || {};
                applyIncomingMessage(payload, { fromSelf: payload.senderId === window._kynCurrentUserId });
                if (payload.chatId === state.activeChatId) markRead(payload.chatId, [payload.id]);
                return;
            }
            if (data.type === 'message:sent') {
                // Server confirmation of our own optimistic send arriving via
                // the socket echo path (in addition to the REST response).
                const p = data.payload || {};
                if (p.serverId) notify('message:server-ack', p);
                return;
            }
            if (data.type === 'message:delivered' || data.type === 'message_delivered') {
                const p = data.payload || {};
                const bucket = state.messagesByConversation.get(p.chatId);
                if (bucket && p.messageId && bucket.has(p.messageId)) {
                    bucket.set(p.messageId, Object.assign({}, bucket.get(p.messageId), { status: 'delivered' }));
                    notify('delivery-state:updated', { chatId: p.chatId, messageId: p.messageId });
                }
                return;
            }
            if (data.type === 'message_read') {
                const p = data.payload || {};
                const bucket = state.messagesByConversation.get(p.chatId);
                if (bucket) {
                    (p.messageIds || []).forEach(id => {
                        if (bucket.has(id)) bucket.set(id, Object.assign({}, bucket.get(id), { status: 'read' }));
                    });
                    notify('read-state:updated', { chatId: p.chatId, messageIds: p.messageIds });
                }
                return;
            }
            if (data.type === 'message:deleted' || data.type === 'message_deleted') {
                const p = data.payload || {};
                const bucket = state.messagesByConversation.get(p.chatId);
                if (bucket && p.messageId != null && bucket.has(p.messageId)) {
                    const existing = bucket.get(p.messageId);
                    if (p.deleteForEveryone || (p.deletedFor || []).includes(window._kynCurrentUserId)) {
                        bucket.set(p.messageId, Object.assign({}, existing, {
                            content: p.deleteForEveryone ? 'This message was deleted' : existing.content,
                            deleted: true, deleteForEveryone: !!p.deleteForEveryone,
                        }));
                        notify('message:deleted', { chatId: p.chatId, messageId: p.messageId });
                    }
                }
                return;
            }
            if (data.type === 'CONVERSATION_UPDATED') {
                const p = data.payload || {};
                if (p.chatId) upsertConversationMeta(p.chatId, { lastMessage: { content: p.lastMessage, createdAt: p.lastMessageAt } });
                return;
            }
        });

        // No dedicated raw bridge exists for message:edited yet (only
        // message:new/delivered/read/deleted have one in chat.html), but it
        // isn't on chat.html's SKIP_WILDCARD list either, so it already
        // reaches this iframe through the generic REALTIME_EVENT: wildcard
        // forwarder — KynectaRealtime.on() is the correct way to receive it.
        if (window.KynectaRealtime && window.KynectaRealtime.on) {
            window.KynectaRealtime.on('message:edited', (payload) => {
                const bucket = state.messagesByConversation.get(payload.chatId);
                if (bucket && bucket.has(payload.messageId)) {
                    bucket.set(payload.messageId, Object.assign({}, bucket.get(payload.messageId), {
                        content: payload.content, isEdited: true, editedAt: payload.editedAt,
                    }));
                    notify('message:edited', { chatId: payload.chatId, messageId: payload.messageId });
                }
            });
            window.KynectaRealtime.on('message:reaction', (payload) => {
                const bucket = state.messagesByConversation.get(payload.chatId);
                if (bucket && bucket.has(payload.messageId)) {
                    bucket.set(payload.messageId, Object.assign({}, bucket.get(payload.messageId), {
                        reactions: payload.reactions,
                    }));
                    notify('message:reaction', { chatId: payload.chatId, messageId: payload.messageId });
                }
            });
            window.KynectaRealtime.on('typing:start', (payload) => {
                if (!payload || !payload.chatId) return;
                clearTimeout(typingState.get(payload.chatId));
                notify('typing:changed', { chatId: payload.chatId, isTyping: true });
                const timeout = setTimeout(() => {
                    typingState.delete(payload.chatId);
                    notify('typing:changed', { chatId: payload.chatId, isTyping: false });
                }, 5000); // safety auto-clear — never leaves the indicator stuck if 'stop' is missed
                typingState.set(payload.chatId, timeout);
            });
            window.KynectaRealtime.on('typing:stop', (payload) => {
                if (!payload || !payload.chatId) return;
                clearTimeout(typingState.get(payload.chatId));
                typingState.delete(payload.chatId);
                notify('typing:changed', { chatId: payload.chatId, isTyping: false });
            });
        }

        // Tell chat.html's bridge we're ready so any messages queued while
        // this iframe was still loading get flushed to us now (existing
        // mechanism in chat.html — _flushMsgQueue waits for exactly this).
        try { window.parent.postMessage({ type: 'MESSAGES_IFRAME_READY' }, '*'); } catch (_) {}

        // Reconnect/foreground resync (§17, §34): the iframe's KynectaRealtime
        // connection state is always reported as authenticated (actual auth
        // is held by the parent), so the reliable resync trigger here is the
        // page becoming visible/focused again, not a socket state change.
        const resyncActiveConversations = () => {
            state.conversations.forEach((conv, chatId) => {
                const msgs = getMessages(chatId);
                const lastId = msgs.length ? msgs[msgs.length - 1].id : null;
                syncMissed(chatId, lastId).catch(() => {});
            });
        };
        window.addEventListener('focus', resyncActiveConversations);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') resyncActiveConversations();
        });
        window.addEventListener('online', () => { state.connectionState = 'online'; notify('connection:changed', 'online'); resyncActiveConversations(); });
        window.addEventListener('offline', () => { state.connectionState = 'offline'; notify('connection:changed', 'offline'); });
        state.connectionState = navigator.onLine ? 'online' : 'offline';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. CONTRACT — the one public entry point other modules use (§21).
    //    Conversation resolution itself (find-or-create the direct chat) is
    //    the backend's job (directChatResolver.js, via POST /messages) —
    //    this just navigates the UI and, if we don't have a chatId yet,
    //    lets the first sendMessage() call resolve it server-side.
    // ═══════════════════════════════════════════════════════════════════════

    function normalizeChatId(value) {
        const id = Number(value);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    // ROOT-CAUSE FIX (race condition — stale open overwrites a newer one):
    // openChat() awaits a network round-trip (/messages/resolve/:userId) for
    // any first-time/non-friend/notification open. If the user (or another
    // rapid-fire postMessage retry — chat.html's own retry loops fire the
    // *same* open several times 600-800ms apart) opens a second, different
    // chat before the first's resolve response comes back, the first
    // response was landing AFTER the second and unconditionally overwriting
    // state.activeChatId + firing 'chat:open-requested' for the stale target
    // — silently switching the visible chat back to the wrong conversation,
    // or, if the stale request had actually failed to resolve, replacing an
    // already-correctly-open chat with the failure placeholder. A simple
    // monotonically increasing generation counter, checked immediately
    // before this call is allowed to touch shared state, closes that
    // window without adding any new state variable that competes with
    // state.activeChatId itself.
    let _openChatGeneration = 0;

    // ROOT-CAUSE FIX (opening chat from another module reliably fails —
    // "⚠️ Couldn't open this conversation" — while opening the exact same
    // chat from Chat History always works): Chat History always supplies a
    // conversationId, so openChat() resolves it locally with no network
    // call and no wait, so it can never lose the generation race below.
    // Friend/Calls/Status only supply a userId for a conversation that
    // isn't cached yet, so openChat() has to await the /messages/resolve
    // network round trip. chat.html's caller retries the SAME open request
    // every 600-800ms (up to 12x) for as long as sessionStorage's
    // pending_chat key is still set — and every retry calls openChat()
    // again, which unconditionally did `++_openChatGeneration` and made
    // isStale() true for whatever attempt was still in flight. On any
    // connection where the resolve round trip legitimately takes longer
    // than one retry interval (a slow network, a cold DB connection pool,
    // a waking backend), EVERY attempt gets superseded by the next retry
    // before it can finish — so a resolve that actually succeeds on the
    // server is thrown away every single time, the chat never opens, and
    // the retry loop just runs out after ~7s and leaves the failure banner
    // up. This generation counter is meant to stop an OLDER open request
    // for a DIFFERENT chat from clobbering a NEWER one for a DIFFERENT
    // chat once it finally resolves — not to invalidate repeated retries of
    // the identical request. Tracking what the current target actually is
    // and only bumping the generation when the target changes fixes this:
    // repeated retries for the same user/conversation now share one
    // generation and let whichever attempt finishes first win, while a
    // genuine switch to a different chat still correctly supersedes it.
    let _openChatTargetKey = null;

    // ROOT-CAUSE FIX (opening chat from another module still fails even
    // with api.request.js's cooldown breaker in place): chat.html's
    // OPEN_CHAT_WITH_USER relay (used by Friend/Status/Calls "message this
    // person" icons) retries every 600ms for up to 12 attempts — up to
    // 7.2s — for as long as sessionStorage's pending_chat key is still
    // set, which it is until a real CHAT_OPENED ack fires. Each retry
    // calls openChat() again, and openChat() had no awareness of an
    // already-in-flight resolve() call for the same user — so on a slow/
    // cold backend (the /messages/resolve/:id call can take up to the
    // full 45s request timeout), a single open action was firing up to 12
    // *separate, concurrent* resolve requests to the exact same endpoint.
    // Since normalizeEndpoint() doesn't template out the userId, all 12
    // share one safety-guard error-counter key — so as soon as 3 of them
    // time out (likely, since they're all hitting the same slow backend
    // around the same time), the breaker trips and blocks the rest,
    // including whichever one might otherwise have eventually succeeded.
    // Coalescing concurrent resolves for the same userId into one shared
    // in-flight promise means chat.html's retry loop no longer causes
    // duplicate network calls at all — just one real resolve, however
    // long it takes, that every retry within that window awaits together.
    const _pendingResolves = new Map();

    async function openChat({ conversationId = null, userId = null, messageId = null, userName = null, avatar = null } = {}) {
        let resolvedChatId = normalizeChatId(conversationId);
        const normalizedUserId = normalizeChatId(userId);

        // Same target as the currently in-flight/active open? Reuse its
        // generation instead of bumping — see _openChatTargetKey comment
        // above. Only a genuinely different target invalidates prior
        // attempts.
        const targetKey = resolvedChatId != null
            ? `conv:${resolvedChatId}`
            : normalizedUserId != null
                ? `user:${normalizedUserId}`
                : `msg:${messageId}`;
        if (targetKey !== _openChatTargetKey) {
            _openChatTargetKey = targetKey;
            _openChatGeneration++;
        }
        const myGeneration = _openChatGeneration;
        const isStale = () => myGeneration !== _openChatGeneration;

        // INSTANT-OPEN (mirrors the group module's openGroupChat(), which
        // calls updateGroupChatHeader(groupData) + renderGroupChatLoadingState()
        // synchronously — using the group data the caller already has —
        // before its own network calls even start; see
        // group-core-operations.js). Friends/Calls/Status/notifications
        // already know the target's userId/userName (and sometimes avatar)
        // the instant the user clicks — that's exactly what made those
        // modules feel instant. Messages never used that: it always waited
        // for the full resolvedChatId (a network round trip for any
        // not-yet-cached conversation) before rendering anything, so the
        // chat panel sat on its bare "No conversation selected" placeholder
        // — a lone search icon and a disabled composer — until that round
        // trip finished (chat.html's veil hides this for up to 3s, then
        // reveals it as-is if resolution is still pending). Firing this
        // here, before the local-cache lookup / resolve below, lets the UI
        // show the correct person's name right away and a real loading
        // state instead of that placeholder — exactly like the group module
        // does. Only fires when there isn't already a resolved chat to show
        // immediately (the conversationId fast path / local-cache hit
        // render straight away and don't need it).
        if (!resolvedChatId && normalizedUserId && (userName || avatar)) {
            notify('chat:opening', { userId: normalizedUserId, userName, avatar });
        }

        // Opened from another module with only a userId (Friends, Status,
        // Calls, a notification) — check if we already know this
        // conversation locally first (it's already in the sidebar because
        // we've talked to this person before) before ever hitting the
        // network. Only a genuinely new/unknown conversation needs the
        // one-time server round-trip.
        if (!resolvedChatId && userId) {
            for (const [cid, meta] of state.conversations) {
                if (meta.otherUser && normalizeChatId(meta.otherUser.id) === normalizedUserId) { resolvedChatId = normalizeChatId(cid); break; }
            }
        }
        if (!resolvedChatId && userId) {
            try {
                const resolveKey = String(normalizedUserId);
                let resolvePromise = _pendingResolves.get(resolveKey);
                if (!resolvePromise) {
                    resolvePromise = api().get(`/messages/resolve/${normalizedUserId}`)
                        .finally(() => _pendingResolves.delete(resolveKey));
                    _pendingResolves.set(resolveKey, resolvePromise);
                }
                const res = await resolvePromise;
                if (isStale()) return; // a newer openChat() call has since taken over
                if (res && res.success && res.data) resolvedChatId = normalizeChatId(res.data.chatId);
                if (!resolvedChatId) throw new Error((res && res.message) || 'Could not resolve conversation');
            } catch (err) {
                if (isStale()) return;
                state.activeChatId = null;
            notify('chat:open-failed', { userId: normalizedUserId || userId, error: err.message || 'Could not open conversation' });
                return;
            }
        }
        if (isStale()) return; // covers the synchronous/local-lookup path too


        // A brand-new chat has no messages yet to derive a display name
        // from — use whatever the caller told us (calls-ui.js and the
        // friend-ui.js→chat.html SWITCH_MODULE path both send userName).
        if (resolvedChatId && (userId || userName || avatar)) {
            upsertConversationMeta(resolvedChatId, {
                otherUser: Object.assign({}, state.conversations.get(resolvedChatId)?.otherUser, {
                    id: userId || state.conversations.get(resolvedChatId)?.otherUser?.id,
                    username: userName || state.conversations.get(resolvedChatId)?.otherUser?.username,
                    avatar: avatar || state.conversations.get(resolvedChatId)?.otherUser?.avatar,
                }),
            });
        }

        state.activeChatId = normalizeChatId(resolvedChatId);
        resolvedChatId = state.activeChatId;
        notify('chat:open-requested', { conversationId: normalizeChatId(resolvedChatId), userId: normalizedUserId || userId, messageId });

        // Pre-warm the encryption session now, not on first keystroke/send —
        // this is exactly what real E2E messengers do: the network round-trip
        // to fetch the other person's prekey bundle and derive a shared
        // session happens while the user is still looking at the chat, not
        // after they hit send. Nothing is actually sent to the server here —
        // encryptForChat's side effect (establishing the session) is what we
        // want; the resulting ciphertext is discarded.
        if (window.KynectaE2E) {
            const recipientForWarmup = resolveRecipientUserId(resolvedChatId, userId);
            if (recipientForWarmup) {
                window.KynectaE2E.encryptForChat(' ', resolvedChatId || null, recipientForWarmup).catch(() => {
                    // Non-fatal — if the recipient hasn't published prekeys yet
                    // (they've never opened the app, or are mid-registration),
                    // the real send later will retry this the normal way.
                });
            }
        }

        if (resolvedChatId) {
            await loadHistory(resolvedChatId);
            if (messageId && !isStale()) notify('message:scroll-to', { chatId: resolvedChatId, messageId });
        }
    }

    // Fetches the actual list of existing conversations on startup — this
    // was missing entirely before: state.conversations only ever got
    // populated reactively (opening a chat, sending, or receiving a live
    // message), so a fresh page load always started empty regardless of
    // real conversation history in the database. Uses the existing,
    // pre-built /chats endpoint (already returns other-participant info,
    // unread count, and the last message in one call — not reimplemented).
    async function archiveChat(chatId) {
        try {
            const res = await api().put(`/chats/${chatId}/archive`);
            if (res && (res.status === 'success' || res.success)) {
                state.conversations.delete(chatId);
                notify('conversation:archived', { chatId });
            }
            return res;
        } catch (err) { return { success: false, error: err.message }; }
    }

    async function unarchiveChat(chatId) {
        try {
            const res = await api().post(`/chats/${chatId}/unarchive`);
            if (res && (res.status === 'success' || res.success)) {
                notify('conversation:unarchived', { chatId });
                loadConversations();
            }
            return res;
        } catch (err) { return { success: false, error: err.message }; }
    }

    async function loadArchivedConversations() {
        try {
            const res = await api().get('/chats?limit=50&includeArchived=true');
            const chats = (res && res.data && Array.isArray(res.data.chats)) ? res.data.chats : [];
            return chats.filter(c => c.type === 'direct' && c.otherParticipant && c.isArchived).map(c => {
                const lastRaw = Array.isArray(c.chatMessages) && c.chatMessages[0] ? c.chatMessages[0] : null;
                return {
                    chatId: c.id,
                    otherUser: { id: c.otherParticipant.id, username: c.otherParticipant.displayName || c.otherParticipant.username, avatar: c.otherParticipant.avatar },
                    lastMessage: lastRaw ? { id: lastRaw.id, content: lastRaw.content, createdAt: lastRaw.createdAt } : null,
                };
            });
        } catch (err) {
            console.error('[MessageModule] Failed to load archived conversations:', err.message);
            return [];
        }
    }

    async function loadConversations() {
        try {
            const res = await api().get('/chats?limit=50');
            const chats = (res && res.data && Array.isArray(res.data.chats)) ? res.data.chats : [];
            chats.filter(c => c.type === 'direct' && c.otherParticipant).forEach(c => {
                const lastRaw = Array.isArray(c.chatMessages) && c.chatMessages[0] ? c.chatMessages[0] : null;
                upsertConversationMeta(c.id, {
                    otherUser: {
                        id: c.otherParticipant.id,
                        username: c.otherParticipant.displayName || c.otherParticipant.username,
                        avatar: c.otherParticipant.avatar,
                    },
                    unreadCount: c.unreadCount || 0,
                    lastMessage: lastRaw ? { id: lastRaw.id, content: lastRaw.content, type: lastRaw.type, createdAt: lastRaw.createdAt, senderId: lastRaw.senderId, chatId: c.id } : null,
                });
                if (lastRaw) decryptForDisplay(c.id, { id: lastRaw.id, chatId: c.id, content: lastRaw.content, type: lastRaw.type, senderId: lastRaw.senderId, createdAt: lastRaw.createdAt });
            });
        } catch (err) {
            console.error('[MessageModule] Failed to load conversation list:', err.message);
        }
    }

    window.MessageModule = {
        subscribe,
        getMessages,
        getConversations: () => Array.from(state.conversations.values()),
        openChat,
        sendMessage,
        uploadAttachment,
        markRead,
        deleteMessage,
        editMessage,
        starMessage,
        unstarMessage,
        muteChat,
        unmuteChat,
        reactToMessage,
        removeReaction,
        searchMessages,
        retryDecrypt,
        sendTypingStart,
        sendTypingStop,
        isTyping: (chatId) => typingState.has(chatId),
        archiveChat,
        unarchiveChat,
        loadArchivedConversations,
        loadHistory,
        getConnectionState: () => state.connectionState,
        getActiveChatId: () => state.activeChatId,
        setActiveChatId: (id) => { state.activeChatId = id; },
        getSetting: (section, key) => settingsState[section] && settingsState[section][key],
    };

    wireRealtimeListeners();

    // window.api.request may not be ready yet at this exact point —
    // api.request.js runs its own async bootstrap sequence with retries/
    // timeouts, and there's no guarantee it's finished by the time this
    // script's top-level code executes. Poll briefly rather than firing
    // the initial load immediately and failing silently.
    (function waitForApiThenLoadConversations(attempt = 0) {
        if (window.api && window.api.request) { loadConversations(); return; }
        if (attempt >= 40) { console.warn('[MessageModule] window.api.request never became ready — conversation list not loaded'); return; }
        setTimeout(() => waitForApiThenLoadConversations(attempt + 1), 250);
    })();

    // Listen for the shell's existing OPEN_CHAT_WITH_USER postMessage
    // contract (already used by other modules — reused, not reinvented, §54).
    //
    // ROOT-CAUSE FIX (notification/deep-link chat opens silently no-op'd):
    // chat.html's push-notification relay (js/push-init.js → 'kyn:openChat' →
    // messagesIframe.postMessage({ type: 'OPEN_CHAT_BY_ID', payload: { chatId,
    // scrollToMessageId } })) has existed for a while, but nothing in this
    // iframe ever listened for 'OPEN_CHAT_BY_ID' — a comment in chat.html
    // claimed a 'messages-ui.js' file with an 'openChatByIdInUI' handler
    // wired this up, but that file does not exist anywhere in the repo.
    // The postMessage was sent into a void: no MessageModule.openChat() call
    // ever happened, so no 'chat:open-requested' event fired, renderChatPanel()
    // was never invoked with a real chatId, and the chat panel just kept
    // showing its static initial-HTML "Select a conversation" placeholder
    // until chat.html's 3s veil safety-net (_unveilMessages) revealed it.
    // Fix: route it through the exact same canonical openChat() entry point
    // every other caller uses — no parallel chat-opening logic, no new bridge.
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data) return;
        if (data.type === 'OPEN_CHAT_WITH_USER') {
            const { userId, conversationId, messageId, userName, avatar } = data.payload || {};
            window.MessageModule.openChat({ conversationId, userId, messageId, userName, avatar });
            return;
        }
        if (data.type === 'OPEN_CHAT_BY_ID') {
            const { chatId, scrollToMessageId } = data.payload || {};
            window.MessageModule.openChat({ conversationId: chatId, messageId: scrollToMessageId });
        }
    });

    // Support direct-load query params (?openChat=<userId> or ?conversationId=<id>)
    document.addEventListener('DOMContentLoaded', () => {
        const params = new URLSearchParams(window.location.search);
        const userId = params.get('openChat');
        const conversationId = params.get('conversationId');
        if (userId || conversationId) {
            window.MessageModule.openChat({ userId, conversationId: conversationId ? Number(conversationId) : null });
        }
    });
})();
