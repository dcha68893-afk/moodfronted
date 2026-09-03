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
    // and ordering by id (server-authoritative — spec §36).
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
        });

        notify('message:added', { chatId, message });
    }

    function getMessages(chatId) {
        const bucket = state.messagesByConversation.get(chatId);
        if (!bucket) return [];
        return Array.from(bucket.values()).sort((a, b) => a.id - b.id);
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

    // ONE send pipeline: REST. (Verified against chat.html: there is no
    // parent-side handler for the generic REALTIME_SEND bridge that
    // KynectaRealtime.emit() would use from inside an iframe, and the
    // app's own established pattern for sending is REST — see the original
    // api.request.js sendMessage(). Using REST here also satisfies §16:
    // sending must not depend on an active socket connection.)
    async function sendMessage({ chatId, receiverId, content, type = 'text', replyToId = null, attachment = null }) {
        const clientMessageId = generateClientMessageId();
        const optimisticId = `optimistic:${clientMessageId}`;
        const optimisticMessage = {
            id: optimisticId, _optimisticId: optimisticId, chatId: chatId || `pending:${receiverId}`,
            senderId: window._kynCurrentUserId || null, content, type: attachment ? toMessageType(attachment.type) : type, replyToId,
            clientMessageId, createdAt: new Date().toISOString(), status: 'sending',
            metadata: attachment ? { attachment } : null,
        };
        const bucket = getOrCreateConversationBucket(optimisticMessage.chatId);
        bucket.set(optimisticId, optimisticMessage);
        notify('message:added', { chatId: optimisticMessage.chatId, message: optimisticMessage });

        try {
            const res = await api().post('/messages', {
                chatId, receiverId, content, type: attachment ? toMessageType(attachment.type) : type, replyToId, clientMessageId,
                metadata: attachment ? { attachment } : undefined,
            });
            if (res && res.success) {
                bucket.delete(optimisticId);
                // Real conversations may have a different chatId than the
                // "pending:<receiverId>" bucket we optimistically wrote to
                // on the very first message — move the bucket if so.
                if (optimisticMessage.chatId !== res.data.chatId) {
                    state.messagesByConversation.delete(optimisticMessage.chatId);
                }
                applyIncomingMessage(Object.assign({}, res.data, { clientMessageId }), { fromSelf: true });
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
            // window.api.request has no .patch() — only .put(); the backend
            // route accepts both (matching the app's existing PUT-alias
            // convention for exactly this reason).
            const res = await api().put(`/messages/${messageId}`, { content });
            if (res && res.success) {
                const bucket = state.messagesByConversation.get(chatId);
                if (bucket && bucket.has(messageId)) {
                    bucket.set(messageId, Object.assign({}, bucket.get(messageId), {
                        content: res.data.content, isEdited: true, editedAt: res.data.editedAt,
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
    function wireRealtimeListeners() {
        window.addEventListener('message', (event) => {
            const data = event.data;
            if (!data || typeof data !== 'object') return;

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

    async function openChat({ conversationId = null, userId = null, messageId = null, userName = null, avatar = null } = {}) {
        let resolvedChatId = conversationId;

        // Opened from another module with only a userId (Friends, Status,
        // Calls, a notification) — no chatId known yet. Resolve it before
        // rendering, so reopening an existing conversation shows its
        // history instead of a blank compose view (§6, §21, §51).
        if (!resolvedChatId && userId) {
            try {
                const res = await api().get(`/messages/resolve/${userId}`);
                if (res && res.success && res.data) resolvedChatId = res.data.chatId;
            } catch (err) {
                notify('chat:open-failed', { userId, error: err.message });
                return;
            }
        }

        // A brand-new chat has no messages yet to derive a display name
        // from — use whatever the caller told us (calls-ui.js and the
        // friend-ui.js→chat.html SWITCH_MODULE path both send userName).
        if (resolvedChatId && (userName || avatar)) {
            upsertConversationMeta(resolvedChatId, {
                otherUser: Object.assign({}, state.conversations.get(resolvedChatId)?.otherUser, {
                    username: userName || state.conversations.get(resolvedChatId)?.otherUser?.username,
                    avatar: avatar || state.conversations.get(resolvedChatId)?.otherUser?.avatar,
                }),
            });
        }

        state.activeChatId = resolvedChatId || null;
        notify('chat:open-requested', { conversationId: resolvedChatId, userId, messageId });
        if (resolvedChatId) {
            await loadHistory(resolvedChatId);
            if (messageId) notify('message:scroll-to', { chatId: resolvedChatId, messageId });
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
        loadHistory,
        getConnectionState: () => state.connectionState,
        getActiveChatId: () => state.activeChatId,
        setActiveChatId: (id) => { state.activeChatId = id; },
    };

    wireRealtimeListeners();

    // Listen for the shell's existing OPEN_CHAT_WITH_USER postMessage
    // contract (already used by other modules — reused, not reinvented, §54).
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || data.type !== 'OPEN_CHAT_WITH_USER') return;
        const { userId, conversationId, messageId, userName, avatar } = data.payload || {};
        window.MessageModule.openChat({ conversationId, userId, messageId, userName, avatar });
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
