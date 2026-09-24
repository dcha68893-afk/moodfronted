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

    const decryptFlights = new Map();
    const decryptResults = new Map();

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

    // Delivery/read confirmations may arrive before the message itself.
    // Buffer them and apply them when the real message is inserted.
    const pendingDeliveryConfirmations = new Map();
    function deliveryKey(chatId,messageId){return String(chatId)+':'+String(messageId)}
    function rememberDelivery(p){if(!p||p.chatId==null||p.messageId==null)return;pendingDeliveryConfirmations.set(deliveryKey(p.chatId,p.messageId),{delivered:p.delivered===true,read:p.read===true})}
    function applyBufferedDelivery(message){
      if(!message||message.chatId==null||message.id==null)return message;
      const p=pendingDeliveryConfirmations.get(deliveryKey(message.chatId,message.id));if(!p)return message;
      const rank={sending:0,sent:1,delivered:2,read:3,failed:-1};const current=rank[message.status]??1;
      const wanted=p.read?'read':p.delivered?'delivered':message.status;
      if((rank[wanted]??1)>current)message=Object.assign({},message,{status:wanted});
      pendingDeliveryConfirmations.delete(deliveryKey(message.chatId,message.id));return message;
    }
    function findMessageByClientMessageId(clientMessageId){
      if(!clientMessageId)return null;
      for(const [chatId,bucket] of state.messagesByConversation.entries()){
        for(const [key,msg] of bucket.entries()){
          if(key!==`optimistic:${clientMessageId}`&&msg?.clientMessageId===clientMessageId)return {chatId,bucket,key,msg};
        }
      }
      return null;
    }

    const listeners = new Set();
    function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    function notify(event, data) { listeners.forEach(fn => { try { fn(event, data); } catch (_) {} }); }

    function getOrCreateConversationBucket(chatId) {
        if (!state.messagesByConversation.has(chatId)) {
            state.messagesByConversation.set(chatId, new Map());
        }
        return state.messagesByConversation.get(chatId);
    }

    // ROOT-CAUSE FIX (DELIVERED-MESSAGE-LATER-FLIPS-TO-FAILED): sendMessage()'s
    // own POST /messages call and the server's realtime socket broadcast of
    // that same message are two independent races on the same write. Under a
    // slow response (Render cold start, flaky network) the socket echo can
    // land — reconciling the optimistic bubble into a real, correctly
    // "delivered" message via applyIncomingMessage() — well before
    // sendMessage()'s own `await api().post(...)` finally settles. When that
    // slow request then times out or rejects, sendMessage()'s failure
    // handlers used to unconditionally write a fresh 'failed' entry back
    // under the same `optimistic:<clientMessageId>` key with no check that
    // the real message had already arrived — resurrecting a dead bubble on
    // top of one that was already showing correctly, seconds after the
    // fact. This checks whether a real message with this clientMessageId is
    // already sitting in the bucket under its own (non-optimistic) id before
    // any failure handler is allowed to mark the optimistic stub failed.
    function isAlreadyDelivered(bucket, clientMessageId) {
        if (!clientMessageId) return false;
        const optimisticId = `optimistic:${clientMessageId}`;
        for (const [key,msg] of bucket) if(key!==optimisticId&&msg&&msg.clientMessageId===clientMessageId)return true;
        return !!findMessageByClientMessageId(clientMessageId);
    }

    // FIX (DELIVERED-BUT-SHOWS-FAILED, ack path): the server sends the SENDER a status-only
    // 'message:delivered' ack that carries { chatId, messageId, clientMessageId } (see
    // messageBroadcast.js). If the POST /messages reply was lost (slow link, cold start), the
    // only copy of the message in this client is the local `optimistic:<clientMessageId>` stub,
    // and the old handler looked the message up by server id only, so the stub stayed
    // "sending"/"failed" until a later history/sync happened to replace it. Promote the stub to
    // the real message here, keyed by clientMessageId, so the bubble flips to delivered instead.
    const ACK_RANK = { failed: -1, sending: 0, sent: 1, delivered: 2, read: 3 };
    function reconcileOptimisticFromAck(p, status) {
        if (!p) return false;
        const cid = p.clientMessageId || p.localId;
        const realId = p.messageId != null ? p.messageId : (p.serverId != null ? p.serverId : p.id);
        if (!cid || realId == null) return false;
        const stubKey = `optimistic:${cid}`;
        for (const [bucketChatId, bucket] of state.messagesByConversation.entries()) {
            const stub = bucket.get(stubKey);
            if (!stub) continue;
            bucket.delete(stubKey);
            const realChatId = p.chatId != null ? p.chatId : bucketChatId;
            const target = getOrCreateConversationBucket(realChatId);
            const existing = target.get(realId) || {};
            const wanted = (ACK_RANK[existing.status] ?? 0) > (ACK_RANK[status] ?? 1) ? existing.status : status;
            const merged = Object.assign({}, stub, existing, { id: realId, chatId: realChatId, clientMessageId: cid, status: wanted });
            delete merged._optimisticId;
            target.set(realId, merged);
            persistMessage(realChatId, merged);
            upsertConversationMeta(realChatId, { lastMessage: merged });
            notify('message:added', { chatId: realChatId, message: merged });
            return true;
        }
        return false;
    }

    // FIX (DELIVERED-BUT-SHOWS-FAILED, verify path): when every send attempt failed, ask the
    // server whether it actually saved the message before telling the user it failed. The
    // history endpoint returns each row's clientMessageId. Works for existing chats (numeric
    // chatId); a brand-new chat has no chatId yet and is covered by the ack path above.
    async function verifyDeliveredOnServer(chatId, clientMessageId, plaintext) {
        const numericChatId = Number(chatId);
        if (!clientMessageId || !Number.isFinite(numericChatId) || numericChatId <= 0) return false;
        try {
            const res = await api().get(`/messages/${numericChatId}?limit=30`);
            if (res && res.success && Array.isArray(res.data)) {
                const hit = res.data.find(m => m && m.clientMessageId === clientMessageId);
                if (hit) {
                    applyIncomingMessage(Object.assign({}, hit, { chatId: hit.chatId != null ? hit.chatId : numericChatId, displayContent: plaintext }), { fromSelf: true });
                    return true;
                }
            }
        } catch (_) { /* still unreachable: caller falls through to "failed", where Retry is safe (idempotent) */ }
        return false;
    }

    function upsertConversationMeta(chatId, patch) {
        const existing = state.conversations.get(chatId) || { chatId, unreadCount: 0 };
        state.conversations.set(chatId, Object.assign(existing, patch));
        notify('conversation:updated', state.conversations.get(chatId));
        persistConversation(chatId);
    }

    // ROOT-CAUSE FIX (STUCK/INVERTED ONLINE-OFFLINE STATUS): message.html
    // calls window.MessageModule.updatePresence() on every live
    // 'user:online'/'user:offline'/'presence:update' event chat.html relays
    // in as FRIEND_ONLINE/FRIEND_OFFLINE (see message.html's postMessage
    // listener, guarded by `typeof window.MessageModule.updatePresence ===
    // 'function'`). That guard was silently failing: this file's
    // window.MessageModule export never actually included an
    // updatePresence method (a duplicate, unused copy of this exact
    // function existed only in a stray root-level message-client.js that
    // the page never loads), so every live presence push was dropped and
    // the chat panel/list kept showing whatever online/offline state was
    // true at the last full page load or friends-list fetch — explaining
    // reports of a friend showing offline while actually online, and vice
    // versa. Reuses upsertConversationMeta so both the 'conversation:updated'
    // notify (sidebar dot) and the local cache pick it up the same way
    // every other patch does; message.html's own listener re-announces
    // CHAT_HEADER_UPDATE to the parent when the update is for whoever the
    // currently open chat is with.
    function updatePresence(userId, online, lastSeen) {
        if (userId == null) return;
        const uid = String(userId);
        state.conversations.forEach((conv, chatId) => {
            if (conv && conv.otherUser && String(conv.otherUser.id) === uid) {
                upsertConversationMeta(chatId, {
                    otherUser: Object.assign({}, conv.otherUser, {
                        online: !!online,
                        lastSeen: lastSeen || conv.otherUser.lastSeen || null,
                    }),
                });
            }
        });
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

        if (message.clientMessageId) {
            // FIX: the stub can live in a different bucket (the synthetic "pending:<receiverId>"
            // one used for a brand-new chat), so look everywhere, and keep the plaintext we typed
            // so our own message is never pushed through decrypt.
            const staleOptimisticId = `optimistic:${message.clientMessageId}`;
            for (const b of state.messagesByConversation.values()) {
                if (!b.has(staleOptimisticId)) continue;
                const stub = b.get(staleOptimisticId);
                b.delete(staleOptimisticId);
                if (message.displayContent === undefined && stub && stub.displayContent !== undefined && String(stub.senderId) === String(message.senderId)) {
                    message = Object.assign({}, message, { displayContent: stub.displayContent });
                }
            }
        }

        message = applyBufferedDelivery(Object.assign({}, message));
        if (message.type === 'status_reply') {
            let meta = message.metadata;
            if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (_) { meta = null; } }
            let interaction = meta?.statusInteraction || null;
            for (const candidate of [message.displayContent, message.content]) {
                if (interaction || typeof candidate !== 'string') continue;
                try {
                    const parsed = JSON.parse(candidate);
                    if (parsed && typeof parsed === 'object' && (parsed.statusId != null || parsed.kind === 'reaction' || parsed.kind === 'comment')) interaction = parsed;
                } catch (_) {}
            }
            if (interaction) message.metadata = Object.assign({}, meta || {}, { statusInteraction: interaction, statusId: interaction.statusId, statusType: interaction.statusType || null, kind: interaction.kind || 'comment' });
        }

        if (bucket.has(message.id)) {
            // ROOT-CAUSE FIX (CACHED PLAINTEXT THROWN AWAY ON RE-DELIVERY): a server
            // copy of a message we already hold (history re-fetch, delta sync,
            // reconnect backfill, socket redelivery) carries only the raw envelope.
            // decryptForDisplay() below used to be handed THAT raw copy, so a message
            // whose plaintext was already restored from the local cache was pushed
            // through the ratchet a second time — which fails for an already-consumed
            // message key — and the good plaintext was then overwritten by a
            // "Unable to decrypt" placeholder (and, via persistMessage(), on disk).
            // Now: if the ciphertext is unchanged and we already hold resolved
            // plaintext, keep it; if the ciphertext CHANGED (edit), drop the stale
            // plaintext so it is decrypted fresh.
            const prev = bucket.get(message.id);
            const merged = Object.assign({}, prev, message);
            if (message.displayContent === undefined && prev && prev.displayContent !== undefined) {
                if (prev.content !== undefined && message.content !== undefined && prev.content !== message.content) {
                    merged.displayContent = undefined;
                    delete merged.decryptVersion;
                }
            }
            bucket.set(message.id, merged);
        } else {
            bucket.set(message.id, message);
        }

        upsertConversationMeta(chatId, {
            lastMessage: message,
            unreadCount: fromSelf ? (state.conversations.get(chatId)?.unreadCount || 0)
                                  : (chatId === state.activeChatId ? 0 : (state.conversations.get(chatId)?.unreadCount || 0) + 1),
            // FIX (RECEIVER-SEES-"User"-INSTEAD-OF-REAL-NAME): for a chat that
            // already existed, otherUser.username was already populated by
            // loadConversations() from GET /chats, which computes
            // `displayName = [firstName, lastName].join(' ') || username`
            // (see chatService.js) — so it never hit this fallback. But for a
            // BRAND-NEW chat (e.g. the receiver's very first message from
            // someone who just "started a chat" with them), state.conversations
            // has no entry yet, so this fallback to `message.sender.username`
            // was the ONLY source of the name — and it only ever read the raw
            // `username` column, skipping the firstName/lastName combination
            // /chats uses. Any account with an empty `username` (common for
            // accounts that only set firstName/lastName) rendered as the
            // literal string "User" the moment a new conversation started.
            // Prefer the server-computed `sender.displayName` (now sent by
            // messageBroadcast.js's payload — see messageDeliveryService.js),
            // and fall back to combining firstName+lastName client-side too,
            // in case an older cached/offline payload predates that field.
            otherUser: (!fromSelf && message.senderId)
                ? Object.assign({}, state.conversations.get(chatId)?.otherUser, {
                    id: message.senderId,
                    username: (state.conversations.get(chatId)?.otherUser?.username)
                        || (message.sender && (message.sender.displayName
                            || [message.sender.firstName, message.sender.lastName].filter(Boolean).join(' ').trim()
                            || message.sender.username)),
                    avatar: (state.conversations.get(chatId)?.otherUser?.avatar) || (message.sender && message.sender.avatar),
                  })
                : state.conversations.get(chatId)?.otherUser,
        });

        notify('message:added', { chatId, message });
        persistMessage(chatId, bucket.get(message.id));
        // Decrypt the MERGED bucket entry (it carries any plaintext already restored
        // from the cache), not the raw incoming copy — see the comment above.
        decryptForDisplay(chatId, bucket.get(message.id) || message);

        // FIX (HEADER-SAYS-OFFLINE-WHILE-THEY-ARE-MESSAGING): a message that was created
        // moments ago and did not come from us is proof its sender is online right now.
        // (History/sync replays carry old createdAt values, so they never trigger this.)
        try {
            if (!fromSelf && message.senderId != null && message.createdAt &&
                String(message.senderId) !== String(window._kynCurrentUserId) &&
                Date.now() - new Date(message.createdAt).getTime() < 60000) {
                updatePresence(message.senderId, true, null);
                if (chatId === state.activeChatId) {
                    window.parent.postMessage({ type: 'kyn:requestPresenceCheck', userId: message.senderId }, '*');
                }
            }
        } catch (_) {}
    }

    // Runs decryptMessageForDisplay() (the app's one canonical decrypt path
    // — every UI surface is supposed to go through it, per its own header
    // comment) and stores the result separately from the raw .content, so
    // the raw envelope is preserved (needed for retry-on-key-arrival) while
    // rendering always uses the resolved plaintext.
    //
    // persistToCache defaults to true (the plaintext/genuine-success call
    // sites below all want the sidebar preview cached), but the queued- and
    // failed-decrypt call sites explicitly pass false — same reasoning as
    // the guarded persistMessage() calls in decryptForDisplay: never let a
    // transient or terminal decrypt failure get written into the cached
    // conversation preview, or the sidebar's last-message snippet would get
    // stuck on "Unable to decrypt" forever instead of retrying fresh.
    function syncLastMessageDisplay(chatId, messageId, displayContent, persistToCache = true) {
        const conv = state.conversations.get(chatId);
        if (conv && conv.lastMessage && String(conv.lastMessage.id) === String(messageId)) {
            conv.lastMessage = Object.assign({}, conv.lastMessage, { displayContent });
            notify('conversation:updated', conv);
            if (persistToCache) persistConversation(chatId); // so the sidebar preview is also decrypt-free on next load
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

    // ROOT-CAUSE FIX (SIDEBAR-STUCK-ON-"Decrypting…"-EVEN-AFTER-OPENING):
    // loadConversations() calls decryptForDisplay() directly for every
    // conversation's last message so the sidebar preview can resolve without
    // requiring the chat to be opened first — but this function's own bucket
    // lookups below used to be `state.messagesByConversation.get(chatId)`
    // (returns undefined for any conversation that has genuinely never been
    // opened this session, since only openChat()/loadHistory() ever call
    // getOrCreateConversationBucket() to actually create one) gated with
    // `if (bucket && bucket.has(message.id))`. For an unopened conversation
    // BOTH conditions failed — decryptMessageForDisplay() below still ran
    // and genuinely succeeded, but the result was silently discarded because
    // syncLastMessageDisplay() (the only thing that ever writes into
    // conv.lastMessage.displayContent) lives entirely inside that gated
    // block. The sidebar preview was left on whatever placeholder it started
    // with ("Decrypting…") forever — not because decryption failed, but
    // because a real, successful result had nowhere it was allowed to land.
    // Opening the chat later creates the bucket via a fresh loadHistory()
    // call and decrypts fine there, which is exactly why the message showed
    // correctly inside the conversation while the list preview stayed stuck.
    // Fix: always get-or-create the bucket, and always seed it with this
    // message if it isn't already present, so the gate can never suppress a
    // genuine result again.
    async function decryptForDisplay(chatId, message) {
        if (!message || message.id == null || message.displayContent !== undefined) return;
        const key = String(chatId) + ':' + String(message.id);
        const ciphertext = typeof message.content === 'string' ? message.content : '';
        if (!looksLikeEnvelope(ciphertext)) {
            const bucket = getOrCreateConversationBucket(chatId);
            const current = bucket.get(message.id) || message;
            bucket.set(message.id, Object.assign({}, current, { displayContent: ciphertext }));
            syncLastMessageDisplay(chatId, message.id, ciphertext, true);
            persistMessage(chatId, bucket.get(message.id));
            return;
        }
        const cached = decryptResults.get(key);
        if (cached && cached.ciphertext === ciphertext) {
            const bucket = getOrCreateConversationBucket(chatId);
            bucket.set(message.id, Object.assign({}, bucket.get(message.id) || message, cached.value));
            // FIX (SIDEBAR-STUCK-ON-"Decrypting…"): a cache hit used to update only the
            // message bucket, never the conversation's lastMessage preview, so a preview
            // that had just been re-seeded with raw ciphertext stayed unresolved forever.
            syncLastMessageDisplay(chatId, message.id, cached.value.displayContent, false);
            return;
        }
        if (decryptFlights.has(key)) { await decryptFlights.get(key); return; }
        const flight=(async()=>{
            const ready=await waitForMessageE2E();
            if(!ready||typeof window.KynectaE2E?.decryptMessageForDisplay!=='function')return;
            const conv=state.conversations.get(chatId),fallback='🔒 Encrypted message';
            try{
                const plaintext=await window.KynectaE2E.decryptMessageForDisplay(message,chatId,window._kynCurrentUserId,{
                    activeConversation:conv?{otherUserId:conv.otherUser?.id}:null,
                    fallbackText:fallback,
                    onResolved:(resolvedText,decryptVersion)=>{
                        const bucket=getOrCreateConversationBucket(chatId),current=bucket.get(message.id)||message;
                        const next=Object.assign({},current,{displayContent:resolvedText,decryptVersion:decryptVersion||current.decryptVersion||null});
                        bucket.set(message.id,next);syncLastMessageDisplay(chatId,message.id,resolvedText,true);persistMessage(chatId,next);notify('message:decrypted',{chatId,messageId:message.id});
                    }
                });
                const failed=typeof window.KynectaE2E.isMessageFailed==='function'&&window.KynectaE2E.isMessageFailed(message);
                const queued=typeof window.KynectaE2E.isMessageQueued==='function'&&window.KynectaE2E.isMessageQueued(message);
                if(failed){
                    const bucket=getOrCreateConversationBucket(chatId),current=bucket.get(message.id)||message;
                    bucket.set(message.id,Object.assign({},current,{displayContent:fallback}));
                    syncLastMessageDisplay(chatId,message.id,fallback,false);notify('message:decrypted',{chatId,messageId:message.id});return;
                }
                if(queued||plaintext===undefined||plaintext===fallback)return;
                const bucket=getOrCreateConversationBucket(chatId),current=bucket.get(message.id)||message;
                const version=current.decryptVersion||(typeof window.KynectaE2E.getDecryptVersion==='function'?window.KynectaE2E.getDecryptVersion(message.id):null);
                const next=Object.assign({},current,{displayContent:plaintext,decryptVersion:version});
                bucket.set(message.id,next);decryptResults.set(key,{ciphertext,value:{displayContent:plaintext,decryptVersion:version}});
                syncLastMessageDisplay(chatId,message.id,plaintext,true);persistMessage(chatId,next);notify('message:decrypted',{chatId,messageId:message.id});
            }catch(error){console.warn('[MessageE2E] decrypt deferred for',message.id,error?.message||error);}
        })();
        decryptFlights.set(key,flight);try{await flight;}finally{decryptFlights.delete(key);}
    }

    async function retryDecrypt(chatId, messageId) {
        const bucket = state.messagesByConversation.get(chatId);
        if (!bucket || !bucket.has(messageId)) return;
        const message = bucket.get(messageId);
        decryptResults.delete(String(chatId) + ':' + String(messageId));
        bucket.set(messageId, Object.assign({}, message, { displayContent: undefined }));
        await decryptForDisplay(chatId, bucket.get(messageId));
        notify('message:decrypted', { chatId, messageId });
    }

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
                if (message.displayContent !== undefined &&
                    message.displayContent !== '🔒 Encrypted message' &&
                    message.displayContent !== '🔒 Unable to decrypt this message' &&
                    message.displayContent !== 'Decrypting…') {
                    continue;
                }
                const displayValue = '🔒 Unable to decrypt this message';
                // FIX (SHOW-WHY-V3-FAILED, requested behavior): message-e2e-
                // core.js's decryptFromChat now names exactly which stage
                // failed and why (e.detail.error) — e.g. "Double Ratchet
                // (v3) decrypt failed: ... — legacy (v2) fallback also
                // failed: ...". Carry that through to the message object so
                // the bubble's tooltip (see message.html's bubbleHtml) can
                // show it instead of the failure reason being logged once
                // and then lost.
                const decryptFailureReason = e?.detail?.error || null;
                bucket.set(key, Object.assign({}, message, { displayContent: displayValue, decryptFailureReason }));
                syncLastMessageDisplay(chatId, key, displayValue, false);
                notify('message:decrypted', { chatId, messageId: key });
                // NOT persisted — see the matching comment in
                // decryptForDisplay above: a terminal decrypt failure must
                // stay in-memory-only so the next reload gets a genuine
                // fresh retry instead of replaying the same cached failure
                // forever.
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
        // /chats is the Message Module's critical-path read. Use the shared
        // runtime-config fetch transport directly so iframe bootstrap timing
        // cannot strand the conversation list behind a postMessage relay.
        if ((method === 'GET' && /^\/chats(?:\?|$)/.test(path) || method === 'POST' && path === '/messages') &&
            typeof window.__getApiBase === 'function') {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 50000);
            try {
                const headers = { 'Accept': 'application/json' };
                if (method !== 'GET') headers['Content-Type'] = 'application/json';
                const token = window.__kynToken || window.__accessToken || window.AuthSessionManager?.getToken?.() ||
                    window.authToken || localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
                if (token) headers.Authorization = 'Bearer ' + token;
                const response = await fetch(window.__getApiBase() + path, {
                    method, headers, credentials: 'include', cache: 'no-store',
                    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
                    signal: controller.signal
                });
                const payload = await response.json().catch(() => ({}));
                return {
                    ok: response.ok && payload?.success !== false,
                    success: response.ok && payload?.success !== false,
                    status: response.status,
                    data: payload?.data ?? {},
                    message: payload?.message || payload?.error || null
                };
            } catch (error) {
                if (error?.name === 'AbortError') throw new Error(method === 'POST' ? 'Message send request timed out' : 'Conversation list request timed out');
                throw error;
            } finally {
                clearTimeout(timeoutId);
            }
        }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            try {
                const headers = { 'Accept': 'application/json' };
                const token = window.__kynToken || window.__accessToken || window.AuthSessionManager?.getToken?.() ||
                    window.authToken || localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
                if (token) headers.Authorization = 'Bearer ' + token;
                const response = await fetch(window.__getApiBase() + path, {
                    method: 'GET', headers, credentials: 'include', cache: 'no-store', signal: controller.signal
                });
                const payload = await response.json().catch(() => ({}));
                return {
                    ok: response.ok && payload?.success !== false,
                    success: response.ok && payload?.success !== false,
                    status: response.status,
                    data: payload?.data ?? {},
                    message: payload?.message || payload?.error || null
                };
            } catch (error) {
                if (error?.name === 'AbortError') throw new Error('Conversation list request timed out');
                throw error;
            } finally {
                clearTimeout(timeoutId);
            }
        }
        return new Promise((resolve, reject) => {
            const requestId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
            let settled = false;
            // ROOT-CAUSE FIX (FALSE-"FAILED"-DESPITE-DELIVERED / send button
            // stuck disabled for the full wait): this local watchdog used to
            // fire at 30000ms, but chat.html's actual underlying fetch (the
            // one that really talks to the backend on the other end of this
            // postMessage bridge) uses AbortSignal.timeout(45000) — see
            // js/api.core.js's own "was 10000 — too short for 1KB/s links or
            // Render cold start" fix. Because 30000 < 45000, on any slow
            // link or Render cold start this promise rejected and detached
            // its listener a full 15s BEFORE the real request could
            // possibly have failed on its own — so a request that was still
            // in flight and about to succeed got reported here as failed,
            // the optimistic bubble got marked 'failed', and the real
            // success (posted back by chat.html 15-ish seconds later) had
            // nowhere to go, since the listener was already removed. This
            // is also why the send button (disabled for the duration of
            // this await in message.html's doSend()) appeared to "hang"
            // for exactly this same window before giving up. Raised above
            // chat.html's real ceiling with margin for the postMessage
            // round-trip itself.
            const timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                window.removeEventListener('message', handler);
                reject(new Error('API request timeout'));
            }, 50000);
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

    // ROOT-CAUSE FIX (RATCHET-ORDER-SAFETY / defense in depth): every place
    // that feeds a batch of messages into applyIncomingMessage()->
    // decryptForDisplay() must guarantee strict chronological (ascending
    // id/createdAt) order — the real Double Ratchet (js/e2e-ratchet-v3.js)
    // advances a one-way KDF chain per message and permanently loses a
    // message's key if a later message consumes the chain first (see the
    // matching fix in js/message-local-db.js's getMessages() for the
    // concrete IndexedDB bug this class of issue was actually caused by).
    // The backend already sends these endpoints in ascending order, but
    // sorting defensively here costs nothing and means a future backend
    // change, proxy reordering, or new call site can never silently
    // reintroduce a permanent decrypt-failure bug like that one.
    function _chronological(list) {
        return (Array.isArray(list) ? list.slice() : []).sort((a, b) => {
            const aNum = typeof a.id === 'number' ? a.id : null;
            const bNum = typeof b.id === 'number' ? b.id : null;
            if (aNum !== null && bNum !== null) return aNum - bNum;
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return aTime - bTime;
        });
    }

    async function loadHistory(chatId, { before = null, limit = 50 } = {}) {
        const qs = new URLSearchParams();
        if (before) qs.set('before', before);
        qs.set('limit', String(limit));
        const res = await api().get(`/messages/${chatId}?${qs.toString()}`);
        if (res && res.success && Array.isArray(res.data)) {
            _chronological(res.data).forEach(m => applyIncomingMessage(m, { fromSelf: false }));
            return { messages: res.data, hasMore: !!res.hasMore, ok: true };
        }
        return { messages: [], hasMore: false, ok: false };
    }

    async function syncMissed(chatId, sinceId) {
        const res = await api().get(`/messages/${chatId}/sync?sinceId=${encodeURIComponent(sinceId || '')}`);
        if (res && res.success && Array.isArray(res.data)) {
            _chronological(res.data).forEach(m => applyIncomingMessage(m, { fromSelf: false }));
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
    // ROOT-CAUSE FIX (CHAT HISTORY NOT RESTORING AFTER RELOAD/RELOGIN, list fine):
    // this used to treat "the cache has at least one message for this chat" as
    // "the cache holds this chat's history" and, in that case, skip the full
    // history fetch and only ask the server for messages NEWER than the newest
    // cached one. But the cache is not only written by opening a chat: the
    // sidebar's last-message preview is decrypted for EVERY conversation on
    // startup (loadConversations() -> decryptForDisplay()), and every
    // successful decrypt is written through to the same messages store. So a
    // conversation the user had never opened on this device already held
    // exactly ONE cached row (its last message); opening it took the "cached"
    // branch, rendered that single message, synced "newer than it" (nothing),
    // and never loaded the rest — the list looked perfect while the chat body
    // was missing everything but the newest bubble, on every reload.
    //
    // A chat's history is now only trusted from disk once a full history fetch
    // for it has actually succeeded on this device (a per-account marker, kept
    // outside the message store so a partial cache can never satisfy it). Until
    // then the cached rows still paint instantly, and the real history is
    // fetched in the background exactly as before. Never the other way round:
    // a missing/cleared marker only ever costs one extra fetch, never lost rows.
    function _historyMarkerKey() {
        try {
            const raw = localStorage.getItem('kynecta_auth');
            const a = raw ? JSON.parse(raw) : null;
            const id = a && a.user && (a.user.id ?? a.user.userId ?? a.user.uid ?? a.user._id);
            return id == null ? null : 'kyn_msg_history_full_v1:' + String(id);
        } catch (_) { return null; }
    }
    function _hasFullHistory(chatId) {
        const key = _historyMarkerKey();
        if (!key) return false;
        try { const map = JSON.parse(localStorage.getItem(key) || '{}') || {}; return !!map[String(chatId)]; } catch (_) { return false; }
    }
    function _markFullHistory(chatId) {
        const key = _historyMarkerKey();
        if (!key) return;
        try {
            const map = JSON.parse(localStorage.getItem(key) || '{}') || {};
            map[String(chatId)] = Date.now();
            localStorage.setItem(key, JSON.stringify(map));
        } catch (_) {}
    }
    const _PLACEHOLDER_DISPLAY = new Set(['🔒 Encrypted message', '🔒 Unable to decrypt this message', 'Decrypting…']);

    async function hydrateFromCacheThenSync(chatId) {
        const cache = window.KynectaMessageCache;
        let cachedCount = 0;
        if (cache) {
            try {
                const cached = await cache.getMessages(chatId);
                _chronological(cached).forEach((m) => {
                    // Pin the bucket key to the chat being opened (a cached row's own
                    // chatId may be a different type, which would file it in a bucket
                    // getMessages(activeChatId) never reads), and never replay a
                    // failure placeholder as if it were resolved plaintext: with a
                    // displayContent present decryptForDisplay() short-circuits and
                    // the message would never be retried.
                    const row = Object.assign({}, m, { chatId });
                    if (typeof row.displayContent === 'string' && _PLACEHOLDER_DISPLAY.has(row.displayContent)) {
                        delete row.displayContent;
                        delete row.decryptFailureReason;
                    }
                    applyIncomingMessage(row, { fromSelf: false });
                });
                cachedCount = cached.length;
            } catch (_) { /* cache is best-effort — falls through to a full network load below */ }
        }
        if (cachedCount > 0) {
            // Forward delta: everything newer than the newest cached row.
            let lastId = null;
            try { lastId = await cache.getLastMessageId(chatId); } catch (_) {}
            try { await syncMissed(chatId, lastId); } catch (_) { /* offline: cached history still stands */ }
        }
        if (cachedCount === 0 || !_hasFullHistory(chatId)) {
            // First time this chat's history is being loaded on this device, or the
            // cache is only the partial rows described above.
            let res = null;
            try { res = await loadHistory(chatId); } catch (_) {}
            if (res && res.ok) _markFullHistory(chatId);
        }
    }

    // ROOT-CAUSE FIX (ATTACHMENT UPLOAD ALWAYS FAILING): this used to go
    // through api().post('/files/upload', formData) — the generic
    // _directRequest() bridge, which delivers every request to the parent
    // shell via window.parent.postMessage({ payload: { body, ... } }, '*').
    // postMessage uses the structured-clone algorithm, and a FormData
    // object (holding File/Blob + internal browser state) is NOT
    // structured-cloneable — the postMessage call throws a DataCloneError
    // synchronously, before any network request is ever made. Every
    // attachment upload from this chat panel failed for exactly this
    // reason, 100% of the time, regardless of file type or size (hence
    // "many places" — every conversation goes through this one function).
    // Fixed by uploading directly from this same-origin iframe with a real
    // fetch()+FormData, bypassing the JSON-only relay entirely — the same
    // pattern this file's own direct-fetch fallbacks elsewhere (e.g. the
    // New Chat picker's Strategy 4) already use successfully. Do not route
    // this back through api()/_directRequest: that bridge cannot carry a
    // file body, full stop.
    function _resolveApiBase() {
        const base = (window.__kynAPI && window.__kynAPI.baseUrl) || window.API_BASE_URL ||
            window.__API_BASE || (window.__getApiBase && window.__getApiBase()) || 'https://noxopa.onrender.com/api';
        return /\/api$/.test(base) ? base : (base.replace(/\/$/, '') + '/api');
    }
    function _resolveAuthToken() {
        try {
            const s = JSON.parse(localStorage.getItem('kynecta_session') || 'null');
            if (s && s.token) return s.token;
        } catch (_) {}
        try {
            const a = JSON.parse(localStorage.getItem('kynecta_auth') || 'null');
            if (a && a.token) return a.token;
        } catch (_) {}
        return localStorage.getItem('authToken') || localStorage.getItem('necpa_token') ||
            localStorage.getItem('token') || localStorage.getItem('accessToken') || null;
    }
    // Uses the existing generic /api/files/upload endpoint — not
    // message-specific infra, and not the Media-table path (routes/media.js
    // has a pre-existing bug where its Media.create() call uses field names
    // that don't match the Media model's actual schema; not touching that).
    // Attachment info instead travels in the message's own metadata field,
    // which messageDeliveryService.sendMessage() already supports generically.
    async function uploadAttachment(file, onProgress) {
        const token = _resolveAuthToken();
        if (!token) throw new Error('Not signed in — please reload and try again.');
        const formData = new FormData();
        formData.append('file', file);
        // Deliberately no 'Content-Type' header: the browser must set
        // multipart/form-data with its own boundary from the FormData body.
        // Setting it manually (or letting a shared request helper default
        // it to application/json) breaks multer's parsing server-side.
        const response = await fetch(`${_resolveApiBase()}/files/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        let payload = {};
        try { payload = await response.json(); } catch (_) {}
        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || `Upload failed (${response.status})`);
        }
        const data = payload.data || payload;
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

        // FIX (DELIVERED-BUT-SHOWS-FAILED): POST /messages is idempotent server-side on
        // (senderId, clientMessageId) — see messageDeliveryService.sendMessage — so it is
        // safe to retry with the SAME clientMessageId. A slow/cold Render backend (502,
        // 503, 504, timeout) often saves the message and then fails to answer in time;
        // the old code marked the bubble 'failed' on the very first such error even
        // though the receiver got the message. Retry transient errors (bubble stays on
        // "sending") and only give up after every attempt has failed AND the message
        // has not shown up via the socket echo.
        const sendBody = {
            chatId, receiverId, content: outgoingContent, type: attachment ? toMessageType(attachment.type) : type,
            replyToId, clientMessageId, metadata: attachment ? { attachment } : undefined,
        };
        const MAX_SEND_ATTEMPTS = 3;
        const postWithRetry = async () => {
            let last = { success: false, message: 'Send failed' };
            for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
                try {
                    const r = await api().post('/messages', sendBody);
                    if (r && r.success) return r;
                    last = r || last;
                    const st = r && r.status;
                    // A definite client-side rejection (validation, blocked, forbidden) is
                    // final — retrying cannot change the outcome.
                    // (401 is retryable: chat.html may be mid token-refresh when the first attempt goes out.)
                    if (st && st < 500 && st !== 408 && st !== 429 && st !== 401) return last;
                } catch (err) {
                    last = { success: false, message: err && err.message };
                }
                if (isAlreadyDelivered(bucket, clientMessageId)) return { success: true, alreadyDelivered: true };
                if (attempt < MAX_SEND_ATTEMPTS - 1) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            }
            return last;
        };

        let res;
        try { res = await postWithRetry(); } catch (err) { res = { success: false, message: err && err.message }; }

        if (res && res.alreadyDelivered) return { success: true, alreadyDelivered: true };

        if (res && res.success) {
            // Success handling lives OUTSIDE the failure try/catch on purpose: nothing that
            // goes wrong while tidying local state may ever flip a delivered message to 'failed'.
            const data = res.data || {};
            try {
                bucket.delete(optimisticId);
                const realChatId = data.chatId != null ? data.chatId : optimisticMessage.chatId;
                // Real conversations may have a different chatId than the
                // "pending:<receiverId>" bucket we optimistically wrote to
                // on the very first message — move the bucket AND the
                // conversation metadata (otherUser especially — without
                // this, encryption's recipient resolution would silently
                // have nothing to go on for this conversation going forward).
                if (optimisticMessage.chatId !== realChatId) {
                    state.messagesByConversation.delete(optimisticMessage.chatId);
                    const pendingMeta = state.conversations.get(optimisticMessage.chatId);
                    if (pendingMeta) {
                        upsertConversationMeta(realChatId, { otherUser: pendingMeta.otherUser });
                        state.conversations.delete(optimisticMessage.chatId);
                    }
                    try { window.KynectaMessageCache && window.KynectaMessageCache.deleteChatMessages(optimisticMessage.chatId); } catch (_) {}
                    try { window.KynectaMessageCache && window.KynectaMessageCache.deleteConversation(optimisticMessage.chatId); } catch (_) {}
                }
                if (data.id != null) {
                    // We already have the plaintext (we just typed it) — no need to
                    // round-trip it through decrypt.
                    applyIncomingMessage(Object.assign({}, data, { chatId: realChatId, clientMessageId, displayContent: content }), { fromSelf: true });
                } else {
                    // Server accepted it but returned no row — keep the bubble as a sent message.
                    getOrCreateConversationBucket(realChatId).set(optimisticId, Object.assign({}, optimisticMessage, { chatId: realChatId, status: 'sent' }));
                    notify('delivery-state:updated', { chatId: realChatId, messageId: optimisticId });
                }
            } catch (postErr) {
                console.warn('[MessageModule] post-send bookkeeping failed (message was delivered):', postErr && postErr.message);
            }
            return { success: true, messageId: data.id, chatId: data.chatId != null ? data.chatId : optimisticMessage.chatId };
        }

        if (isAlreadyDelivered(bucket, clientMessageId)) {
            return { success: true, alreadyDelivered: true };
        }
        if (await verifyDeliveredOnServer(chatId || optimisticMessage.chatId, clientMessageId, content)) {
            return { success: true, alreadyDelivered: true, verified: true };
        }
        bucket.set(optimisticId, Object.assign({}, optimisticMessage, { status: 'failed' }));
        notify('message:failed', { chatId: optimisticMessage.chatId, clientMessageId, error: res && res.message });
        return { success: false, error: res && res.message };
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

    // AppSettings (the source of truth) names some keys differently from this module.
    const SETTING_KEY_ALIASES = { chat: { enterKeySends: 'enterToSend' } };

    function applySettingToMessageModule(section, key, value) {
        if (!settingsState[section]) settingsState[section] = {};
        const alias = SETTING_KEY_ALIASES[section] && SETTING_KEY_ALIASES[section][key];
        const target = alias || key;
        // Unchanged values are ignored so repeated storage/broadcast echoes cannot
        // trigger a re-render storm.
        if (settingsState[section][target] === value) return;
        settingsState[section][target] = value;
        notify('settings:changed', { section, key: target, value });
    }

    function applySettingsSnapshot(settings) {
        if (!settings || typeof settings !== 'object') return;
        ['privacy', 'chat'].forEach((sec) => {
            const vals = settings[sec];
            if (vals && typeof vals === 'object') {
                Object.entries(vals).forEach(([k, v]) => {
                    if (v === null || typeof v !== 'object') applySettingToMessageModule(sec, k, v);
                });
            }
        });
    }

    // Seed once from the cached snapshot (settings only reached this module when
    // changed, so a fresh open used the hard-coded defaults), then follow updates
    // published by settings-broadcast-listener.js.
    try {
        applySettingsSnapshot(window.__cachedSettings || JSON.parse(localStorage.getItem('kyn_app_settings') || 'null'));
    } catch (_) {}
    document.addEventListener('settingsUpdated', (e) => applySettingsSnapshot(e && e.detail));

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
        if (!chatId || settingsState.privacy.typingIndicators === false) return;
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
                reconcileOptimisticFromAck(p, 'sent');
                if (p.serverId) notify('message:server-ack', p);
                return;
            }
            if (data.type === 'message:delivered' || data.type === 'message_delivered') {
                const p = data.payload || {};
                if (reconcileOptimisticFromAck(p, 'delivered')) return;
                const bucket = state.messagesByConversation.get(p.chatId);
                if (bucket && p.messageId && bucket.has(p.messageId)) {
                    const existing=bucket.get(p.messageId);
                    if(existing.status!=='failed')bucket.set(p.messageId,Object.assign({},existing,{status:existing.status==='read'?'read':'delivered'}));
                    notify('delivery-state:updated',{chatId:p.chatId,messageId:p.messageId});
                } else rememberDelivery(Object.assign({},p,{delivered:true}));
                return;
            }
            if (data.type === 'message_read') {
                const p = data.payload || {};
                const bucket = state.messagesByConversation.get(p.chatId);
                const ids=Array.isArray(p.messageIds)?p.messageIds:[];
                if(bucket)ids.forEach(id=>bucket.has(id)?(bucket.get(id).status!=='failed'&&bucket.set(id,Object.assign({},bucket.get(id),{status:'read'}))):rememberDelivery({chatId:p.chatId,messageId:id,read:true}));
                else ids.forEach(id=>rememberDelivery({chatId:p.chatId,messageId:id,read:true}));
                notify('read-state:updated',{chatId:p.chatId,messageIds:ids});return;
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
                // FIX (SIDEBAR-STUCK-ON-"Decrypting…"): chat.html posts this right after
                // every message:new, carrying only the RAW ciphertext (no id, no
                // displayContent). Overwriting lastMessage unconditionally wiped the
                // already-decrypted preview and left an id-less stub that
                // syncLastMessageDisplay() could never match again. Only replace it when
                // this is genuinely a different message than the one we already hold.
                if (p.chatId) {
                    const prevLast = state.conversations.get(p.chatId)?.lastMessage;
                    const sameMessage = prevLast && prevLast.content === p.lastMessage;
                    if (!sameMessage) {
                        upsertConversationMeta(p.chatId, { lastMessage: { content: p.lastMessage, createdAt: p.lastMessageAt } });
                    }
                }
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

    function isPlaceholderName(n) { return !n || /^\s*(user|unknown|member)\s*$/i.test(String(n)); }
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
                    // FIX (HEADER-SHOWS-"User"): callers used to invent 'User' when they had no name; a placeholder is a real string,
                    // so it overwrote the correct name from the chat list (and got cached to disk). Placeholders are treated as missing.
                    username: isPlaceholderName(userName) ? state.conversations.get(resolvedChatId)?.otherUser?.username : userName,
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
    // FIX (DELETED CHAT COMES BACK AFTER RELOAD): deleteChat()/archiveChat() only removed the conversation from the
    // in-memory Map. The same conversation stayed in the IndexedDB cache (js/message-local-db.js), and
    // hydrateConversationsFromCache() below re-adds EVERY cached conversation on the next load — so a chat the person had
    // deleted reappeared in the list (and its old decrypted messages stayed readable on disk). Forget it in both places.
    // Map keys are the server's numeric ids, but tolerate a string id from a DOM attribute.
    function _forgetConversation(chatId, { keepMessages = false } = {}) {
        const key = state.conversations.has(chatId) ? chatId : Array.from(state.conversations.keys()).find(k => String(k) === String(chatId));
        if (key !== undefined) state.conversations.delete(key);
        try {
            const cache = window.KynectaMessageCache;
            if (!cache) return;
            cache.deleteConversation(chatId);
            cache.deleteConversation(Number(chatId));
            if (!keepMessages) cache.deleteChatMessages(chatId);
        } catch (_) {}
        try { state.messagesByConversation && !keepMessages && state.messagesByConversation.delete(chatId); } catch (_) {}
    }

    async function archiveChat(chatId) {
        try {
            const res = await api().put(`/chats/${chatId}/archive`);
            if (res && (res.status === 'success' || res.success)) {
                _forgetConversation(chatId, { keepMessages: true });
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

    // "Delete chat" — long-press a conversation -> Delete chat. Removes it
    // from THIS device/account's chat list only; the other participant's
    // copy is untouched (server-side: chat_participants.hiddenAt, see
    // chatService.deleteChat). If they send a new message afterward, the
    // conversation reappears in the list automatically on next load — no
    // client-side "undelete" needed, the server handles that.
    async function deleteChat(chatId) {
        try {
            const res = await api().delete(`/chats/${chatId}`);
            if (res && (res.status === 'success' || res.success)) {
                _forgetConversation(chatId, { keepMessages: false });
                notify('conversation:deleted', { chatId });
            }
            return res;
        } catch (err) { return { success: false, error: err.message }; }
    }

    // "Clear chat" — wipes MY OWN message history in this conversation.
    // The chat stays in the list; the other participant keeps every message.
    async function clearChatHistory(chatId) {
        try {
            const res = await api().delete(`/chats/${chatId}/history`);
            if (res && (res.status === 'success' || res.success)) {
                const bucket = state.messagesByConversation.get(chatId);
                if (bucket) bucket.clear();
                upsertConversationMeta(chatId, { lastMessage: null });
                notify('conversation:cleared', { chatId });
            }
            return res;
        } catch (err) { return { success: false, error: err.message }; }
    }

    // Multi-select delete (long-press a message -> select more -> Delete).
    // One request for the whole selection instead of N; each id is
    // still authorized individually server-side (see routes/messages.js
    // POST /bulk-delete) so a mixed selection degrades gracefully rather
    // than failing outright.
    //
    // ROOT-CAUSE FIX (SELECT-MODE-DELETE-DOES-NOTHING): this used to read
    // res.deleted / res.failed straight off the _directRequest() wrapper
    // object. That wrapper's actual shape is
    // {ok, success, status, data, message} — the backend's real JSON body
    // (POST /bulk-delete returns {success, deleted, failed}) is nested
    // under .data (see _directRequest's `resolve({..., data: d ?? {}, ...})`
    // above; same pattern loadConversations() etc. already read correctly
    // via res.data.chats). res.deleted / res.failed were therefore always
    // undefined, so `deleted` was always [] here — the backend genuinely
    // deleted every message (confirmed: the single-message deleteMessage()
    // path and this one both call the identical server-side
    // _deleteOneMessage()), but this function never updated local state and
    // never fired 'message:deleted', so message.html never re-rendered.
    // The selection bar still cleared (performBulkDelete() calls
    // exitSelectMode() unconditionally after this resolves) so it LOOKED
    // like the action ran, but the selected bubbles just sat there — while
    // the single-delete "..." menu path, which only ever checked
    // `res.success` (a real top-level field), worked every time. Read
    // res.data.deleted / res.data.failed instead.
    async function bulkDeleteMessages(chatId, messageIds, { forEveryone = false } = {}) {
        if (!Array.isArray(messageIds) || messageIds.length === 0) return { success: false, error: 'No messages selected' };
        try {
            const res = await api().post('/messages/bulk-delete', { messageIds, deleteForEveryone: forEveryone });
            const body = (res && res.data) || {};
            const deleted = Array.isArray(body.deleted) ? body.deleted : [];
            const failed = Array.isArray(body.failed) ? body.failed : [];
            const bucket = state.messagesByConversation.get(chatId);
            deleted.forEach((messageId) => {
                if (bucket && bucket.has(messageId)) {
                    const existing = bucket.get(messageId);
                    bucket.set(messageId, Object.assign({}, existing, {
                        content: forEveryone ? 'This message was deleted' : existing.content,
                        deleted: true, deleteForEveryone: forEveryone,
                    }));
                    persistMessage(chatId, bucket.get(messageId));
                }
            });
            if (deleted.length) notify('message:deleted', { chatId, messageIds: deleted });
            return { success: !!(res && res.success) && deleted.length > 0, deleted, failed };
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
            // Chats that exist right now (from memory / the disk cache). Only THESE may be pruned below — a chat that
            // appears while the request is in flight (a live message) is newer than the server's answer and must survive.
            try { await state.hydrating; } catch (_) {}
            const knownBefore = new Set(Array.from(state.conversations.keys()).map(String));
            const res = await api().get('/chats?summary=1&limit=50');
            if (!res || res.success === false) throw new Error((res && res.message) || 'Failed to load conversation list');
            const chats = (res.data && Array.isArray(res.data.chats)) ? res.data.chats : [];
            state.convLoadFailed = false;
            // FIX (DELETED / ARCHIVED CHATS STAYED IN THE LIST): this only ever ADDED conversations, so anything hidden or
            // archived (here or on another device) lingered from the cache forever. When the server returned the complete
            // list (the request is capped at 50), drop cached conversations it no longer lists. The open chat is left alone.
            // (An EMPTY answer is ambiguous — a real empty list or a server hiccup — so it never prunes.)
            if (chats.length > 0 && chats.length < 50) {
                const serverIds = new Set(chats.map(c => String(c.id)));
                const activeId = String(state.activeChatId == null ? '' : state.activeChatId);
                knownBefore.forEach((id) => {
                    if (serverIds.has(id) || id === activeId || !/^\d+$/.test(id)) return;   // non-numeric = local "pending:<user>" chat
                    _forgetConversation(id, { keepMessages: true });
                    notify('conversation:deleted', { chatId: Number(id) });
                });
            }
            _warmupKnownContactKeys(chats);
            chats.filter(c => c.type === 'direct' && c.otherParticipant).forEach(c => {
                const lastRaw = Array.isArray(c.chatMessages) && c.chatMessages[0] ? c.chatMessages[0] : null;
                // FIX (SIDEBAR-STUCK-ON-"Decrypting…"): don't throw away a preview we have
                // already resolved (from cache/decrypt) when the list is (re)loaded.
                const prevConv = state.conversations.get(c.id);
                const prevLast = prevConv && prevConv.lastMessage;
                const keepDisplay = (prevLast && lastRaw && String(prevLast.id) === String(lastRaw.id) && prevLast.displayContent !== 'Decrypting…') ? prevLast.displayContent : undefined;
                upsertConversationMeta(c.id, {
                    otherUser: Object.assign({}, prevConv && prevConv.otherUser, {
                        id: c.otherParticipant.id,
                        username: c.otherParticipant.displayName || c.otherParticipant.username,
                        avatar: c.otherParticipant.avatar,
                    }),
                    unreadCount: c.unreadCount || 0,
                    lastMessage: lastRaw ? Object.assign(
                        { id: lastRaw.id, content: lastRaw.content, type: lastRaw.type, createdAt: lastRaw.createdAt, senderId: lastRaw.senderId, chatId: c.id },
                        keepDisplay !== undefined ? { displayContent: keepDisplay } : {}
                    ) : null,
                });
                if (lastRaw) decryptForDisplay(c.id, { id: lastRaw.id, chatId: c.id, content: lastRaw.content, type: lastRaw.type, senderId: lastRaw.senderId, createdAt: lastRaw.createdAt });
            });
        } catch (err) {
            console.error(`[MessageModule] Failed to load conversation list (attempt ${attempt + 1}):`, err.message);
            state.convLoadFailed = true;
            if (attempt < 5) {
                setTimeout(() => loadConversations(attempt + 1), Math.min(1000 * (attempt + 1), 8000));
            } else {
                // Not a permanent give-up: the cached list stays on screen, and the 'online' / tab-visible handlers below retry.
                console.error('[MessageModule] Conversation list refresh failed after 6 attempts; will retry when back online');
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
        bulkDeleteMessages,
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
        deleteChat,
        clearChatHistory,
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
        updatePresence,
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
        state.hydrating = window.KynectaMessageCache.getConversations().then((cached) => {
            (cached || []).forEach((conv) => {
                if (conv && conv.chatId != null) upsertConversationMeta(conv.chatId, conv);
            });
        }).catch(() => {});
    })();
    // A failed refresh (offline, cold server) used to be final for the page session. Try again when the connection returns or
    // the person comes back to the tab — but only if the last attempt actually failed.
    window.addEventListener('online', () => { if (state.convLoadFailed) loadConversations(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.convLoadFailed) loadConversations(); });

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