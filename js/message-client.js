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

    // FIX (CANONICAL-E2E-RACE): js/e2e-session-init.js patches window.KynectaE2E
    // with the canonical private-message implementation asynchronously (it
    // dynamically loads js/e2e-identity-core.js + js/message-e2e-core.js over
    // the network, then swaps the encrypt/decrypt functions in). Until that
    // patch lands, window.KynectaE2E is already truthy — it's the object
    // js/e2e-encryption.js created — so a naive `if (window.KynectaE2E)` check
    // is not a valid readiness signal. Every call site below that touches
    // encryption must wait on this instead of just checking truthiness.
    function waitForMessageE2E(timeoutMs) {
        timeoutMs = timeoutMs || 8000;
        if (typeof window.KynectaMessageE2EReady === 'function') {
            return Promise.race([
                window.KynectaMessageE2EReady().then(() => true).catch(() => false),
                new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
            ]);
        }
        // e2e-session-init.js hasn't defined the loader yet (extremely early
        // call) — poll briefly for it, then fall through to the race above.
        return new Promise((resolve) => {
            const start = Date.now();
            (function poll() {
                if (typeof window.KynectaMessageE2EReady === 'function') {
                    resolve(waitForMessageE2E(timeoutMs - (Date.now() - start)));
                    return;
                }
                if (Date.now() - start >= timeoutMs) { resolve(false); return; }
                setTimeout(poll, 50);
            })();
        });
    }

    // When the canonical core finishes loading after some messages already
    // rendered a fallback (because they were decrypted — or attempted — during
    // the race window above), re-run decryption for anything in the visible
    // conversations that isn't already resolved plaintext.
    document.addEventListener('kyn:canonicalMessageE2EReady', () => {
        for (const [chatId, bucket] of state.messagesByConversation.entries()) {
            for (const message of bucket.values()) {
                if (message && message.displayContent === undefined) {
                    decryptForDisplay(chatId, message);
                }
            }
        }
    });

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
        persistConversation(chatId);
    }

    // Best-effort write-through to js/message-local-db.js. Never on the
    // critical path — the UI's source of truth stays the in-memory `state`
    // above; this just mirrors it to IndexedDB so the NEXT reload/relogin
    // can hydrate from disk instead of the network. Every call site is
    // fire-and-forget on purpose (no caller awaits these).
    function persistMessage(chatId, message) {
        if (!chatId || !message) return;
        try { window.KynectaMessageCache && window.KynectaMessageCache.putMessage(chatId, message); } catch (_) {}
    }
    function persistConversation(chatId) {
        const conv = state.conversations.get(chatId);
        if (!chatId || !conv) return;
        try { window.KynectaMessageCache && window.KynectaMessageCache.putConversation(chatId, conv); } catch (_) {}
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
        persistMessage(chatId, bucket.get(message.id));
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
            persistConversation(chatId); // so the sidebar preview is also decrypt-free on next load
        }
    }

    // Cheap, local shape check only — NOT a second decrypt implementation.
    // Lets plain/system-message content render immediately without waiting
    // on crypto readiness; anything that looks like a v2 envelope still goes
    // through the one canonical decrypt path below.
    function looksLikeEnvelope(content) {
        if (typeof content !== 'string' || content.charAt(0) !== '{') return false;
        try { const o = JSON.parse(content); return !!(o && typeof o === 'object' && ('v' in o || 'ct' in o || 'iv' in o)); }
        catch (_) { return false; }
    }

    async function decryptForDisplay(chatId, message) {
        if (message.displayContent !== undefined) return; // already resolved (e.g. our own just-sent message)
        if (!looksLikeEnvelope(message.content)) {
            const bucket = state.messagesByConversation.get(chatId);
            if (bucket && bucket.has(message.id)) {
                bucket.set(message.id, Object.assign({}, bucket.get(message.id), { displayContent: message.content }));
                syncLastMessageDisplay(chatId, message.id, message.content);
                persistMessage(chatId, bucket.get(message.id));
            }
            return;
        }
        // FIX (CANONICAL-E2E-RACE): wait for the canonical core to be patched
        // in before deciding KynectaE2E isn't available. Without this, a
        // message that arrives before js/e2e-session-init.js finishes its
        // async load either silently ran through the legacy decrypt path
        // (mismatched key derivation -> OperationError) or hit an undefined
        // function — both permanently mis-rendered the message with no retry.
        const ready = await waitForMessageE2E();
        if (!ready || !window.KynectaE2E || typeof window.KynectaE2E.decryptMessageForDisplay !== 'function') {
            // Canonical core genuinely unavailable (or timed out) — leave the
            // message unresolved (displayContent stays undefined) rather than
            // rendering raw ciphertext, so the kyn:canonicalMessageE2EReady
            // listener above can retry it once the core does load.
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
                        persistMessage(chatId, bucket.get(message.id));
                    }
                },
            });
            const isQueued = typeof window.KynectaE2E.isMessageQueued === 'function' && window.KynectaE2E.isMessageQueued(message);
            const isFailed = typeof window.KynectaE2E.isMessageFailed === 'function' && window.KynectaE2E.isMessageFailed(message);
            // FIX (INFINITE-DECRYPTING-PLACEHOLDER): previously this only had
            // two states — queued ("Decrypting…") or resolved (plaintext) —
            // so a message the queue had permanently given up on stayed
            // rendered as plaintext === DECRYPT_FALLBACK forever, which this
            // line then displayed as "Decrypting…" indefinitely. isFailed
            // gives a third, final state.
            const displayValue = isFailed ? '🔒 Unable to decrypt this message'
              : (isQueued && plaintext === DECRYPT_FALLBACK) ? 'Decrypting…' : plaintext;
            const bucket = state.messagesByConversation.get(chatId);
            if (bucket && bucket.has(message.id)) {
                bucket.set(message.id, Object.assign({}, bucket.get(message.id), { displayContent: displayValue }));
                syncLastMessageDisplay(chatId, message.id, displayValue);
                notify('message:decrypted', { chatId, messageId: message.id });
                // Deliberately NOT persisting transient "Decrypting…" states —
                // only a final resolved plaintext or the terminal failure
                // placeholder below is worth writing to disk; a queued state
                // caught mid-flight should always re-attempt fresh next load.
                if (displayValue !== 'Decrypting…') persistMessage(chatId, bucket.get(message.id));
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

    // FIX (INFINITE-DECRYPTING-PLACEHOLDER): e2e-encryption.js's retry queue
    // now gives up on a message after MAX_QUEUE_ATTEMPTS and fires this
    // event once, instead of retrying every 15s forever. Without this
    // listener, a message that failed permanently would sit rendered with
    // whatever displayContent it last had ("Decrypting…") until something
    // else happened to re-run decryptForDisplay for it. This makes the "🔒
    // Unable to decrypt this message" state (see decryptForDisplay above)
    // show up immediately instead of only on next reload/re-render.
    document.addEventListener('kyn:messageDecryptFailed', (e) => {
        const failedId = e?.detail?.messageId;
        if (!failedId) return;
        // Match by String() rather than bucket.has(failedId) directly — the
        // event's messageId always comes through String() on the
        // e2e-encryption.js side, but bucket keys can be a raw numeric
        // message.id (server messages) or a string like
        // "optimistic:<clientId>" (local echo), so a strict Map key type
        // match isn't guaranteed.
        for (const [chatId, bucket] of state.messagesByConversation.entries()) {
            for (const [key, message] of bucket.entries()) {
                if (String(key) !== String(failedId)) continue;
                const displayValue = '🔒 Unable to decrypt this message';
                bucket.set(key, Object.assign({}, message, { displayContent: displayValue }));
                syncLastMessageDisplay(chatId, key, displayValue);
                notify('message:decrypted', { chatId, messageId: key });
                persistMessage(chatId, bucket.get(key));
                return;
            }
        }
    });

    function getMessages(chatId) {
        const bucket = state.messagesByConversation.get(chatId);
        if (!bucket) return [];
        return Array.from(bucket.values())
            .filter(m => !(m.deleted && !m.deleteForEveryone)) // "delete for me" hides it from my own view only
            // ROOT-CAUSE FIX (a message you just sent doesn't appear to show
            // up at all): this used to be `.sort((a, b) => a.id - b.id)`.
            // Real, server-persisted messages have a numeric id — fine for
            // that case. But sendMessage()'s optimistic message (the local
            // echo shown the instant you hit send, before the server has
            // even replied) is given id: `optimistic:${clientMessageId}` — a
            // STRING. Subtracting a string from a number is NaN, and a
            // comparator that can return NaN has undefined sort behavior —
            // in practice this could land the message you just sent
            // anywhere in the list except reliably at the bottom, so
            // looking at the bottom of the chat (where a "message sent"
            // build usually looks) showed nothing new. Compare numerically
            // when both sides have a real numeric id (unchanged,
            // server-authoritative order per spec §36); fall back to
            // createdAt when either side is still optimistic, since every
            // message — optimistic or not — always has that.
            .sort((a, b) => {
                const aNum = typeof a.id === 'number' ? a.id : null;
                const bNum = typeof b.id === 'number' ? b.id : null;
                if (aNum !== null && bNum !== null) return aNum - bNum;
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                if (aTime !== bTime) return aTime - bTime;
                return aNum !== null ? -1 : (bNum !== null ? 1 : 0);
            });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. TRANSPORT — was "reuses window.api.request (REST) and
    //    window.KynectaRealtime (socket)". The REST half of that never
    //    actually worked the way it looked like it did: window.api.request
    //    (js/api.request.js) is only a real, fully-featured client when it
    //    can find window.__API_CORE — and that global is set by
    //    js/api.core.js, which is loaded ONLY inside chat.html's own frame
    //    (as a <script type="module">, no less). message.html is a separate
    //    iframe with its own window — it can never see anything chat.html
    //    attached to chat.html's window. So window.api.request here has
    //    always silently been running api.request.js's OWN internal
    //    fallback stub (createFallbackSecureFetch()), not the real
    //    implementation, for every single request this module has ever
    //    made. That stub had its own bugs (e.g. no `cache` option, so a
    //    repeat GET like chat.html's retry loop hitting
    //    /messages/resolve/:userId could get a cached 304 back and have it
    //    misreported as a failure).
    //
    //    CORRECTION from an earlier version of this comment: it previously
    //    said Friends avoids this by making its own independent fetch()
    //    calls with no dependency on the parent at all, and had this module
    //    do the same. That was wrong — checked friend-core.bootstrap.js's
    //    authorizedRequest() (36 call sites across the Friends module, its
    //    actual dominant mechanism) and it does the opposite: it posts
    //    {type:'API_REQUEST', payload:{endpoint,method,body,requestId}} to
    //    window.parent and waits for a matching {type:'API_RESPONSE',
    //    requestId} — i.e. it deliberately hands the real network work to
    //    chat.html, because chat.html's frame is the one place in the app
    //    that actually has a fully working api.core.js (session handling,
    //    token refresh, offline detection, a direct-fetch fallback of its
    //    own — chat.html's API_REQUEST handler around line 6534). Depending
    //    on the parent isn't the bug — reaching for a piece of the parent
    //    that was never actually reachable (window.__API_CORE) was. This
    //    does what Friends actually does: ask chat.html to make the call.
    // ═══════════════════════════════════════════════════════════════════════

    async function _directRequest(method, path, body) {
        return new Promise((resolve, reject) => {
            const requestId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
            let settled = false;
            const timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                window.removeEventListener('message', handler);
                reject(new Error('API request timeout'));
            }, 30000);
            const handler = (event) => {
                if (settled) return;
                const msg = event.data;
                if (!msg || msg.type !== 'API_RESPONSE' || msg.requestId !== requestId) return;
                settled = true;
                clearTimeout(timeoutId);
                window.removeEventListener('message', handler);
                const payload = msg.payload || {};
                // chat.html's own handler is supposed to normalize whatever
                // shape its underlying call returned into {success, data,
                // error, statusCode} with data already unwrapped to the
                // backend's inner data object (see responsePayload
                // construction around chat.html:6612). In practice that
                // pipeline has several legacy layers between here and the
                // actual fetch, and this couldn't be fully verified without
                // running it live — so defend against payload.data still
                // being the raw, doubly-wrapped backend body
                // ({success,data:{...}}) rather than already unwrapped: if
                // it looks wrapped (has both a nested .data and .success),
                // take the inner one. A real single-level payload like
                // {chatId:1} or {users:[...]} never has its own .success
                // key, so this can't misfire on correctly-shaped data.
                let d = payload.data;
                if (d && typeof d === 'object' && 'data' in d && 'success' in d) d = d.data;
                resolve({
                    ok: payload.success !== false,
                    success: payload.success !== false,
                    status: payload.statusCode || (payload.success !== false ? 200 : 500),
                    data: d ?? {},
                    message: payload.error || null,
                });
            };
            window.addEventListener('message', handler);
            window.parent.postMessage({ type: 'API_REQUEST', payload: { endpoint: path, method, body, requestId } }, '*');
        });
    }

    function api() {
        return {
            get: (path) => _directRequest('GET', path),
            post: (path, body) => _directRequest('POST', path, body),
            put: (path, body) => _directRequest('PUT', path, body),
            delete: (path, body) => _directRequest('DELETE', path, body),
        };
    }

    // Generates the sender-local ID sendMessage() attaches to every outgoing
    // message. The backend uses (senderId, clientMessageId) as an idempotency
    // key (messageDeliveryService.sendMessage — a retry with the same ID
    // always resolves to the original row instead of creating a duplicate),
    // and it's stored in a STRING(64) column, so this only needs to be
    // reasonably unique per sender and well under 64 chars.
    function generateClientMessageId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        // Fallback for browsers without crypto.randomUUID (older Safari/WebViews).
        return `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

    // Cache-first chat open (WhatsApp-Web-style local persistence). Reuses
    // applyIncomingMessage as the one and only place a message enters state
    // (same invariant loadHistory/syncMissed already rely on) — a cached
    // message that already carries a resolved displayContent short-circuits
    // decryptForDisplay's very first check (`if (message.displayContent
    // !== undefined) return;`), so replaying history from disk costs no
    // crypto work, only the already-cheap in-memory bucket writes.
    async function hydrateFromCacheThenSync(chatId) {
        const cache = window.KynectaMessageCache;
        let cachedCount = 0;
        if (cache) {
            try {
                const cached = await cache.getMessages(chatId);
                cached.forEach((m) => applyIncomingMessage(m, { fromSelf: false }));
                cachedCount = cached.length;
            } catch (_) { /* cache is best-effort — falls through to a full network load below */ }
        }
        if (cachedCount > 0) {
            // Already have this conversation's history rendered with zero
            // network calls and zero redecrypts. Only ask the server for
            // what's genuinely new since the newest cached message — a
            // delta fetch, not loadHistory()'s blind "last 50 again".
            let lastId = null;
            try { lastId = await cache.getLastMessageId(chatId); } catch (_) {}
            try { await syncMissed(chatId, lastId); } catch (_) { /* offline/first-open-after-reconnect: cached history still stands */ }
        } else {
            // Nothing cached for this chat yet (first time it's ever been
            // opened on this device) — same full fetch as before.
            await loadHistory(chatId);
        }
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
        // ROOT-CAUSE FIX (SILENT-PLAINTEXT-SEND): this used to be
        // `if (content && recipientUserId)` — when content existed but
        // recipientUserId could NOT be resolved (message.html's doSend()
        // never passes receiverId, so this depends entirely on
        // state.conversations.get(chatId)?.otherUser?.id already being
        // populated; a brand-new or bypass-opened chat can still be missing
        // that at send time), the whole encrypt block was skipped with no
        // error, and outgoingContent silently stayed as the raw plaintext
        // `content` — sent to the server and to the recipient completely
        // unencrypted, with nothing in the UI indicating this happened.
        // This contradicts the app's "no plaintext fallback" design (see
        // the !ready branch below, which already fails loudly instead of
        // falling back) and is very likely why some messages show up
        // readable instantly with no lock icon — they were never encrypted
        // at all, not successfully decrypted. Fixed by failing loudly here
        // too, exactly like the !ready case, instead of ever sending
        // plaintext.
        if (content) {
            if (!recipientUserId) {
                bucket.set(optimisticId, Object.assign({}, optimisticMessage, { status: 'failed' }));
                notify('message:failed', { chatId: optimisticMessage.chatId, clientMessageId, error: 'Could not determine the recipient to encrypt this message for' });
                return { success: false, error: 'Could not determine the recipient to encrypt this message for — message was not sent' };
            }
            try {
                // FIX (CANONICAL-E2E-RACE): see waitForMessageE2E() above —
                // don't gate only on window.KynectaE2E truthiness, which is
                // set synchronously by the legacy file long before the
                // canonical encryptForChat is actually patched in.
                const ready = await waitForMessageE2E();
                if (!ready || typeof window.KynectaE2E?.encryptForChat !== 'function') {
                    throw new Error('Secure messaging is not ready yet');
                }
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
                    // The synthetic "pending:<receiverId>" chatId never had
                    // any real (non-optimistic) messages persisted to cache
                    // under it — see the note above deleteChatMessages() in
                    // js/message-local-db.js — but clear it defensively in
                    // case a previous version of this code path did.
                    try { window.KynectaMessageCache && window.KynectaMessageCache.deleteChatMessages(optimisticMessage.chatId); } catch (_) {}
                    try { window.KynectaMessageCache && window.KynectaMessageCache.deleteConversation(optimisticMessage.chatId); } catch (_) {}
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
                    persistMessage(chatId, bucket.get(messageId));
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
            // ROOT-CAUSE FIX (SILENT-PLAINTEXT-SEND): same bug as
            // sendMessage() above — skipping the encrypt block when
            // recipientUserId is unresolved used to leave outgoingContent as
            // raw plaintext with no error. Fail loudly instead.
            if (content) {
                if (!recipientUserId) {
                    return { success: false, error: 'Could not determine the recipient to encrypt this message for — edit was not sent' };
                }
                try {
                    const ready = await waitForMessageE2E();
                    if (!ready || typeof window.KynectaE2E?.encryptForChat !== 'function') {
                        throw new Error('Secure messaging is not ready yet');
                    }
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
                    persistMessage(chatId, bucket.get(messageId));
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
                    persistMessage(chatId, bucket.get(messageId));
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
                    persistMessage(chatId, bucket.get(messageId));
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
                    persistMessage(chatId, bucket.get(messageId));
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
                    persistMessage(chatId, bucket.get(messageId));
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
    // Companion to _openChatTargetKey: which target the 'chat:opening'
    // instant-render signal was last sent for, so retries of that same
    // target (chat.html's retry loop) don't re-fire it — see the comment at
    // its one call site in openChat() below. Reset once that attempt
    // concludes (success or failure) so a later, genuinely new open of the
    // same person fires it again.
    let _lastOpeningNotifiedKey = null;

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

    // Companion to _pendingResolves: debounces the *notification to the
    // parent frame* (chat:open-failed → CHAT_LIST_SHOWN) once resolution has
    // genuinely, definitively failed — separate from the network-call
    // dedup above, so retries don't each independently tell chat.html to
    // show/re-show the "Couldn't open this conversation" banner within the
    // same few seconds. See the retry-storm comment in openChat() below.
    const _recentFailureNotified = new Map();

    // Companion to both maps above: counts consecutive transient ("api not
    // ready yet") failures per target, so the silent-retry in openChat()'s
    // catch block below has a bound instead of being able to spin forever.
    const _transientFailCounts = new Map();

    async function openChat({ conversationId = null, userId = null, messageId = null, userName = null, avatar = null, force = false } = {}) {
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
        // FIX (spinner never settles): chat.html's retry loop calls openChat()
        // again every ~600ms for the same target while it waits for an ack.
        // This notify used to fire on every one of those retries — each
        // re-entering renderChatPanel() and stomping over whatever was
        // already showing, including an error banner from a failure a
        // moment earlier. That produced exactly the reported symptom: the
        // loading spinner appears to "never finish" because it keeps getting
        // redrawn on top of the outcome. Only fire it the first time for a
        // given target (tracked by the same targetKey the generation counter
        // above uses) — retries of the same target reuse the state that's
        // already on screen.
        if (!resolvedChatId && normalizedUserId && (userName || avatar) && _lastOpeningNotifiedKey !== targetKey) {
            _lastOpeningNotifiedKey = targetKey;
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
            const resolveKey = String(normalizedUserId);
            // A deliberate manual "Try again" click (force: true, see
            // message.html's retryOpenChatBtn handler) should always make a
            // real attempt — never replay the automatic retry loop's cached
            // failure/notify-debounce from a few seconds ago.
            if (force) {
                _pendingResolves.delete(resolveKey);
                _recentFailureNotified.delete(resolveKey);
            }
            try {
                let resolvePromise = _pendingResolves.get(resolveKey);
                if (!resolvePromise) {
                    resolvePromise = api().get(`/messages/resolve/${normalizedUserId}`)
                        .then((res) => { _pendingResolves.delete(resolveKey); return res; })
                        .catch((err) => {
                            // FIX (breaker-trip via retry storm): a settled
                            // promise used to be deleted from
                            // _pendingResolves immediately, success or
                            // failure. That's fine for success, but for a
                            // FAST failure (not a slow timeout — an
                            // immediate error response, or api() throwing
                            // because window.api isn't ready yet), the very
                            // next 600ms retry saw no in-flight promise and
                            // fired a brand-new /messages/resolve request —
                            // and did that again every retry. Each one
                            // counts against api.request.js's per-endpoint
                            // error counter (_safetyState.maxErrorsPerEndpoint
                            // = 3, see api.request.js), so 3 fast failures
                            // within a couple hundred ms of each other — one
                            // single click's worth of retries — was enough
                            // to trip its 20s cooldown breaker mid-retry,
                            // which then blocked every remaining attempt for
                            // this open AND any other resolve for 20s
                            // afterward. Keeping the rejected promise cached
                            // for a few seconds means repeated retries for
                            // the same target share the one real failed
                            // attempt instead of each spawning a fresh
                            // network call.
                            setTimeout(() => _pendingResolves.delete(resolveKey), 4000);
                            throw err;
                        });
                    _pendingResolves.set(resolveKey, resolvePromise);
                }
                const res = await resolvePromise;
                if (isStale()) return; // a newer openChat() call has since taken over
                _transientFailCounts.delete(resolveKey);
                if (res && res.success && res.data) resolvedChatId = normalizeChatId(res.data.chatId);
                if (!resolvedChatId) throw new Error((res && res.message) || 'Could not resolve conversation');
            } catch (err) {
                if (isStale()) return;
                // FIX (retry-storm): chat.html's caller retries the SAME
                // open request every ~600ms for up to 12 attempts while it
                // waits for an ack. Each retry re-enters openChat(), and
                // since a settled (resolved or rejected) promise is removed
                // from _pendingResolves the moment it settles, a fast
                // failure here used to mean a brand-new /messages/resolve
                // call AND a brand-new 'chat:open-failed' notify on every
                // single one of those retries — up to 12 in ~7s for one
                // click. Each notify became a CHAT_LIST_SHOWN postMessage to
                // chat.html (message.html's chat:open-failed handler,
                // below), which is exactly the
                // "[RealtimeStab] postMessage storm detected: CHAT_LIST_SHOWN"
                // flood this was producing.
                //
                // Two distinct fixes, not one broad one:
                // 1. A transient failure (api() throwing because
                //    window.api.request hasn't finished booting yet — see
                //    api() above) isn't a real "can't open this
                //    conversation" failure, it's "not ready yet, the retry
                //    loop will try again in 600ms" — so don't tell the
                //    parent to show the error banner for it immediately;
                //    let the existing retry keep going silently. But this
                //    can't be unconditional forever — if window.api never
                //    actually becomes ready, silently swallowing every
                //    attempt just leaves the "Opening chat with X…" loading
                //    state spinning forever with no way out. Bound it: after
                //    a handful of consecutive transient failures for the
                //    same target (roughly chat.html's whole 12-retry/~7s
                //    window), stop treating it as "just not ready yet" and
                //    surface it as a real failure so the retry banner
                //    appears instead of an infinite spinner.
                // 2. For a genuine failure (the resolve endpoint itself
                //    errored), only notify the parent once per resolveKey
                //    within a short window — repeated retries for the same
                //    still-failing target reuse that one notification
                //    instead of each firing their own.
                if (err && err.transient) {
                    const transientCount = (_transientFailCounts.get(resolveKey) || 0) + 1;
                    _transientFailCounts.set(resolveKey, transientCount);
                    if (transientCount < 8) return;
                    // Given up waiting for window.api — fall through and
                    // report it like any other failure below.
                } else {
                    _transientFailCounts.delete(resolveKey);
                }
                const lastNotified = _recentFailureNotified.get(resolveKey) || 0;
                if (Date.now() - lastNotified < 3000) return;
                _recentFailureNotified.set(resolveKey, Date.now());
                state.activeChatId = null;
                if (_lastOpeningNotifiedKey === targetKey) _lastOpeningNotifiedKey = null;
                notify('chat:open-failed', { userId: normalizedUserId || userId, error: (err && err.transient) ? 'Still connecting — please try again' : (err.message || 'Could not open conversation') });
                return;
            }
        }
        if (isStale()) return; // covers the synchronous/local-lookup path too
        if (_lastOpeningNotifiedKey === targetKey) _lastOpeningNotifiedKey = null;


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

        // Pre-warm the recipient key fetch now, not on first keystroke/send —
        // the network round-trip to fetch the other person's public key
        // happens while the user is still looking at the chat, not after
        // they hit send.
        // FIX (DUMMY-ENCRYPT-WARMUP): this used to call
        // encryptForChat(' ', ...) purely for its side effect of fetching and
        // caching the recipient's public key, discarding the resulting
        // ciphertext. That did a full ECDH derive + HKDF + AES-GCM encrypt of
        // a throwaway string for no reason — the canonical core already
        // exposes prefetchRecipientKey() for exactly this, with no wasted
        // crypto work and no dependency on a chatId. Also now correctly waits
        // for the canonical core (see waitForMessageE2E above) instead of
        // just checking window.KynectaE2E truthiness.
        waitForMessageE2E().then((ready) => {
            if (!ready || typeof window.KynectaE2E?.prefetchRecipientKey !== 'function') return;
            const recipientForWarmup = resolveRecipientUserId(resolvedChatId, userId);
            if (recipientForWarmup) {
                window.KynectaE2E.prefetchRecipientKey(recipientForWarmup).catch(() => {
                    // Non-fatal — if the recipient hasn't published a key yet
                    // (they've never opened the app, or are mid-registration),
                    // the real send later will retry this the normal way.
                });
            }
        });

        if (resolvedChatId) {
            await hydrateFromCacheThenSync(resolvedChatId);
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

    // FIX (LOGIN-TIME-KEY-WARMUP): fetch and locally cache every existing
    // contact's public key in ONE batch request right after the
    // conversation list loads, instead of only ever resolving a contact's
    // key lazily the moment their specific chat gets opened (see the
    // per-chat prefetchRecipientKey call in openChat below). This is the
    // same pattern other E2E messaging apps use — resolve known contacts'
    // keys once per session/login and keep them in local storage — so
    // decrypting a message or a chat-list preview from someone you've
    // already talked to needs no network round trip at all, even on a cold
    // start or a flaky connection. Fire-and-forget: a failed warmup just
    // leaves those contacts to fall back to the existing lazy per-chat
    // fetch, nothing here is on the critical path for showing the list.
    function _warmupKnownContactKeys(chats) {
        try {
            const ids = chats.filter(c => c.type === 'direct' && c.otherParticipant?.id).map(c => c.otherParticipant.id);
            if (!ids.length) return;
            waitForMessageE2E().then((ready) => {
                if (!ready || typeof window.KynectaE2E?.prefetchRecipientKeys !== 'function') return;
                window.KynectaE2E.prefetchRecipientKeys(ids).catch(() => {});
            });
        } catch (_) {}
    }

    // ROOT-CAUSE FIX (SIDEBAR-EMPTY-AFTER-RELOAD): this used to be a single,
    // unretried attempt — if it failed for any reason (the parent frame's
    // 'API_REQUEST' listener not wired up yet, chat.html's own auth/session
    // bootstrap not finished, a slow/cold backend hitting _directRequest's
    // 30s timeout), the catch block below just logged to console and gave
    // up. Nothing else in this file ever calls loadConversations() again on
    // its own (the only other call site is unarchiveChat(), unrelated) and
    // nothing re-fires it on socket reconnect either — so one bad first
    // attempt permanently left the sidebar on its "No conversations yet /
    // Start a chat" empty state for the rest of that page session, even
    // though the conversations genuinely exist server-side. This is a
    // transport-timing bug, not a real "you have no chats" state. Retries
    // with backoff instead of giving up after one try.
    async function loadConversations(attempt = 0) {
        try {
            const res = await api().get('/chats?limit=50');
            if (!res || res.success === false) throw new Error((res && res.message) || 'Failed to load conversation list');
            const chats = (res.data && Array.isArray(res.data.chats)) ? res.data.chats : [];
            _warmupKnownContactKeys(chats);
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
            console.error(`[MessageModule] Failed to load conversation list (attempt ${attempt + 1}):`, err.message);
            if (attempt < 5) {
                setTimeout(() => loadConversations(attempt + 1), Math.min(1000 * (attempt + 1), 5000));
            } else {
                console.error('[MessageModule] Giving up on loading conversation list after 6 attempts');
            }
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
        // Exposes the same self-contained request api() uses internally (see
        // the TRANSPORT comment above) so message.html's own two direct
        // window.api.request.* calls (the New Chat picker's people list, the
        // block-user action) go through the one real implementation instead
        // of api.request.js's fallback stub.
        request: api,
        getConnectionState: () => state.connectionState,
        getActiveChatId: () => state.activeChatId,
        setActiveChatId: (id) => { state.activeChatId = id; },
        getSetting: (section, key) => settingsState[section] && settingsState[section][key],
    };

    wireRealtimeListeners();

    // Cache-first sidebar: render whatever conversation list/preview was
    // cached last session immediately, with no network wait and no
    // redecrypt (cached lastMessage already carries its resolved
    // displayContent — see syncLastMessageDisplay/persistConversation
    // above). loadConversations() below still runs right after as normal,
    // over the network, to reconcile anything that changed since — this
    // only removes the blank/empty sidebar flash on reload while that's
    // in flight.
    (function hydrateConversationsFromCache() {
        if (!window.KynectaMessageCache) return;
        window.KynectaMessageCache.getConversations().then((cached) => {
            (cached || []).forEach((conv) => {
                if (conv && conv.chatId != null) upsertConversationMeta(conv.chatId, conv);
            });
        }).catch(() => {});
    })();

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