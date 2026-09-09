/*
 * Message module stability layer.
 *
 * This is deliberately a small adapter around the existing canonical message
 * engine/UI. It does not replace the transport or create a second message
 * store. It fixes the remaining user-visible problems:
 *   - remove the compatibility retry delay from v2 decryption;
 *   - read legacy v1 envelopes when their historical key is available;
 *   - never render unsupported v3/v4/v5 ciphertext as a fake message bubble;
 *   - keep a per-account conversation-list cache across reload/re-login;
 *   - make Start Chat use the authenticated user's actual friends;
 *   - keep the chat at the bottom when a new message/decryption arrives.
 */
(function (global) {
  'use strict';

  const STORAGE_PREFIX = 'kyn_message_conversations_v2_';
  const UNSUPPORTED = '__KYN_UNSUPPORTED_E2E__';

  function currentUserId() {
    const candidates = [
      global._kynCurrentUserId,
      global.SessionManager?.getCurrentUserId?.(),
      global.currentUserId,
      global.__PARENT_SESSION__?.userId,
    ];
    for (const id of candidates) if (id != null && String(id)) return String(id);
    try {
      const raw = localStorage.getItem('kynecta_auth') || localStorage.getItem('user') || localStorage.getItem('currentUser');
      const p = JSON.parse(raw || 'null');
      if (p?.user?.id != null) return String(p.user.id);
      if (p?.id != null) return String(p.id);
      if (p?.userId != null) return String(p.userId);
    } catch (_) {}
    return 'unknown';
  }

  function parse(content) {
    if (typeof content !== 'string') return null;
    try { const o = JSON.parse(content); return o && typeof o === 'object' ? o : null; }
    catch (_) { return null; }
  }

  function isV1(content) {
    const o = parse(content);
    return !!o && o.v === 1 && o.iv && o.ct;
  }

  function isV2(content) {
    const o = parse(content);
    return !!o && o.v === 2 && o.iv && o.ct && o.spk && o.rpk;
  }

  function isUnsupported(content) {
    const o = parse(content);
    if (!o || !('v' in o)) return false;
    if (o.v === 1 || o.v === 2) return false;
    if (o.ct || o.iv || o.mid || o.sid || o.kid) return true;
    if (o.devices && typeof o.devices === 'object') {
      return Object.values(o.devices).some(d => d && typeof d === 'object' && (d.ct || d.iv));
    }
    return false;
  }

  function pairContext(peerId, meId) {
    const a = String(meId || '');
    const b = String(peerId || '');
    return `kynecta-dm-v2:${[a, b].sort().join(':')}`;
  }

  function legacyChatContext(chatId) {
    return `kynecta-chat-${String(chatId || '')}`;
  }

  async function decryptV1(content, chatId, peerUserId, ownMessage) {
    const identity = global.KynectaE2EIdentity;
    if (!identity?.privateKey || !peerUserId) throw new Error('E2E identity/peer unavailable');
    const env = parse(content);
    if (!env) throw new Error('Invalid v1 envelope');

    const candidates = [];
    // v1 envelopes only carried the sender keyId. For a received message that
    // identifies the historical peer key exactly. For an own sent message v1
    // did not record the recipient keyId, so current peer key is the only safe
    // candidate available from the envelope itself.
    if (!ownMessage && env.kid && typeof identity.publicKeyForVersion === 'function') {
      candidates.push(async () => {
        const e = await identity.publicKeyForVersion(peerUserId, env.kid);
        if (!e) throw new Error('Historical v1 key unavailable');
        return e.key;
      });
    }
    candidates.push(async () => (await identity.publicKeyFor(peerUserId)).key);

    const contexts = [pairContext(peerUserId, identity.userId), legacyChatContext(chatId)];
    let last = null;
    for (const getPeer of candidates) {
      let peerKey;
      try { peerKey = await getPeer(); } catch (e) { last = e; continue; }
      if (!peerKey) continue;
      let shared;
      try { shared = await identity.deriveShared(peerKey); } catch (e) { last = e; continue; }
      for (const info of contexts) {
        try {
          const key = await identity.hkdf(shared, info);
          return await identity.aesDecrypt(env, key);
        } catch (e) { last = e; }
      }
    }
    throw last || new Error('v1 decryption failed');
  }

  function installFastDecrypt() {
    const dm = global.KynectaMessageE2E;
    if (!dm || typeof dm.decryptFromChat !== 'function') return false;
    if (dm.__fastDisplayDecryptInstalled) return true;

    const canonicalDecryptFromChat = dm.decryptFromChat.bind(dm);
    const canonicalDisplay = dm.decryptMessageForDisplay?.bind(dm);

    // Bypass message-e2e-compat's five-attempt 0.5/1/1.5s backoff for v2.
    // v2 is self-contained (spk/rpk) and canonical decrypt is deterministic;
    // a successful message therefore needs one WebCrypto operation chain only.
    dm.decryptMessageForDisplay = async function (message, chatId, userId, opts = {}) {
      const content = message?.content;
      const id = String(message?.id || message?.localId || message?.serverId || `${chatId}:${content || ''}`);
      if (isUnsupported(content)) return UNSUPPORTED;
      if (!isV1(content) && !isV2(content)) {
        return typeof content === 'string' ? content : (content || '');
      }
      try {
        const meId = userId != null ? String(userId) : String(global.KynectaE2EIdentity?.userId || currentUserId());
        const sender = message?.senderId != null ? String(message.senderId) : String(message?.sender?.id || '');
        const own = !!sender && sender === meId;
        const peer = own
          ? String(message?.receiverId ?? message?.recipientId ?? opts.activeConversation?.otherUserId ?? '')
          : sender;
        if (!peer) throw new Error('Message peer is unavailable');

        let text;
        if (isV1(content)) {
          text = await decryptV1(content, chatId, peer, own);
        } else {
          // Canonical v2 path only: no compatibility retry loop and no current
          // key lookup added here. decryptFromChat() already uses the exact
          // envelope spk/rpk and historical-key fallback.
          text = await canonicalDecryptFromChat(content, chatId, peer, own);
        }
        if (typeof text !== 'string') throw new Error('Decryption returned non-text');
        opts.onResolved?.(text);
        return text;
      } catch (error) {
        try {
          document.dispatchEvent(new CustomEvent('kyn:messageDecryptFailed', {
            detail: { messageId: id, error: error?.message || String(error) }
          }));
        } catch (_) {}
        if (opts.fallbackText !== undefined) return opts.fallbackText;
        return '';
      }
    };

    // Keep the canonical decryptFromChat implementation. The display wrapper
    // above is the only latency-sensitive entry point used by message-client.
    dm.__fastDisplayDecryptInstalled = true;
    dm.__fastDisplayDecryptCanonical = canonicalDisplay;
    return true;
  }

  function conversationStorageKey() {
    return `${STORAGE_PREFIX}${currentUserId()}`;
  }

  function loadConversationCache() {
    try {
      const raw = localStorage.getItem(conversationStorageKey());
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  function saveConversationCache(conversations) {
    try {
      const clean = conversations
        .filter(c => c && c.chatId != null && c.otherUser?.id != null)
        .map(c => ({
          chatId: c.chatId,
          otherUser: {
            id: c.otherUser.id,
            username: c.otherUser.username || '',
            avatar: c.otherUser.avatar || null,
          },
          unreadCount: Number(c.unreadCount || 0),
          lastMessage: c.lastMessage ? {
            id: c.lastMessage.id,
            content: c.lastMessage.content,
            type: c.lastMessage.type,
            createdAt: c.lastMessage.createdAt,
            senderId: c.lastMessage.senderId,
            chatId: c.chatId,
          } : null,
        }));
      localStorage.setItem(conversationStorageKey(), JSON.stringify(clean));
    } catch (_) {}
  }

  function installConversationPersistence() {
    const mm = global.MessageModule;
    if (!mm || mm.__conversationPersistenceInstalled) return !!mm;

    const originalGetConversations = mm.getConversations.bind(mm);
    const originalRequest = mm.request.bind(mm);
    let cache = loadConversationCache();

    // Merge persisted conversations into the live store so a transient API
    // startup/auth delay cannot make the sidebar look empty after reload.
    mm.getConversations = function () {
      const live = originalGetConversations();
      const byId = new Map(live.map(c => [String(c.chatId), c]));
      for (const cached of cache) {
        const key = String(cached.chatId);
        if (!byId.has(key)) byId.set(key, cached);
      }
      return Array.from(byId.values());
    };

    mm.request = function () {
      const api = originalRequest();
      const originalGet = api.get;
      return Object.assign({}, api, {
        get: async function (path) {
          // Start Chat is intentionally a FRIENDS picker, not a global-user
          // discover list. Preserve the existing caller contract by mapping
          // its old endpoint to /friends and returning data.users.
          if (typeof path === 'string' && path.startsWith('/friends/users/all')) {
            const url = new URL(path, global.location.origin);
            const query = (url.searchParams.get('search') || '').trim().toLowerCase();
            const res = await originalGet('/friends?limit=500');
            const friends = Array.isArray(res?.data?.friends) ? res.data.friends : [];
            const users = friends
              .filter(u => u && String(u.id) !== String(currentUserId()))
              .filter(u => {
                if (!query) return true;
                const hay = [u.username, u.displayName, u.firstName, u.lastName].filter(Boolean).join(' ').toLowerCase();
                return hay.includes(query);
              });
            return Object.assign({}, res, { data: { users } });
          }

          const res = await originalGet(path);
          if (typeof path === 'string' && path.startsWith('/chats')) {
            const chats = Array.isArray(res?.data?.chats) ? res.data.chats : null;
            if (res?.success && chats) {
              // A successful authenticated /chats response is authoritative.
              // It removes entries that the server says were explicitly
              // deleted/archived, while retaining cache on failed requests.
              cache = chats.filter(c => c?.type === 'direct' && c?.otherParticipant).map(c => ({
                chatId: c.id,
                otherUser: {
                  id: c.otherParticipant.id,
                  username: c.otherParticipant.displayName || c.otherParticipant.username || '',
                  avatar: c.otherParticipant.avatar || null,
                },
                unreadCount: c.unreadCount || 0,
                lastMessage: Array.isArray(c.chatMessages) && c.chatMessages[0]
                  ? { id: c.chatMessages[0].id, content: c.chatMessages[0].content, type: c.chatMessages[0].type, createdAt: c.chatMessages[0].createdAt, senderId: c.chatMessages[0].senderId, chatId: c.id }
                  : null,
              }));
              saveConversationCache(cache);
            }
          }
          return res;
        }
      });
    };

    // Persist changes produced by realtime/new sends without changing the
    // message-client's private state model.
    mm.subscribe((event) => {
      if (event === 'conversation:updated' || event === 'conversation:archived' || event === 'message:added') {
        try {
          cache = originalGetConversations();
          saveConversationCache(cache);
        } catch (_) {}
      }
      if (event === 'conversation:archived') {
        try { cache = cache.filter(c => String(c.chatId) !== String(arguments?.chatId)); } catch (_) {}
      }
    });

    mm.__conversationPersistenceInstalled = true;
    return true;
  }

  function installAutoScroll() {
    const log = document.getElementById('messageLog');
    if (!log || log.__kynAutoScrollInstalled) return !!log;
    let wasNearBottom = true;
    let lastHeight = log.scrollHeight;

    const nearBottom = () => log.scrollHeight - (log.scrollTop + log.clientHeight) < 120;
    log.addEventListener('scroll', () => { wasNearBottom = nearBottom(); });

    const observer = new MutationObserver(() => {
      const active = global.MessageModule?.getActiveChatId?.();
      if (!active) return;
      const distance = log.scrollHeight - (log.scrollTop + log.clientHeight);
      const heightChanged = log.scrollHeight !== lastHeight;
      lastHeight = log.scrollHeight;
      // Initial/normal realtime rendering and decryption should keep the
      // newest message visible when the user was already near the bottom.
      if (wasNearBottom || distance < 120 || log.childElementCount <= 1) {
        requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
      }
    });
    observer.observe(log, { childList: true, subtree: true });
    log.__kynAutoScrollInstalled = true;
    return true;
  }

  function hideUnsupportedBubbles() {
    const log = document.getElementById('messageLog');
    const mm = global.MessageModule;
    if (!log || !mm) return;
    const chatId = mm.getActiveChatId?.();
    if (!chatId) return;
    const messages = mm.getMessages?.(chatId) || [];
    const unsupported = new Set(messages.filter(m => isUnsupported(m?.content)).map(m => String(m.id)));
    log.querySelectorAll('[data-message-id]').forEach(row => {
      if (unsupported.has(String(row.getAttribute('data-message-id')))) row.remove();
    });
  }

  function installUiGuards() {
    if (document.__kynMessageStabilityObserver) return true;
    const root = document.body;
    if (!root) return false;
    const observer = new MutationObserver(() => {
      hideUnsupportedBubbles();
      installAutoScroll();
    });
    observer.observe(root, { childList: true, subtree: true });
    document.__kynMessageStabilityObserver = observer;
    hideUnsupportedBubbles();
    installAutoScroll();
    return true;
  }

  function boot() {
    installFastDecrypt();
    installConversationPersistence();
    installUiGuards();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('load', boot, { once: true });
})(window);
