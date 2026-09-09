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

        const text = isV1(content)
          ? await decryptV1(content, chatId, peer, own)
          : await canonicalDecryptFromChat(content, chatId, peer, own);
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

    dm.__fastDisplayDecryptInstalled = true;
    return true;
  }

  function conversationStorageKey(uid = currentUserId()) {
    return `${STORAGE_PREFIX}${uid}`;
  }

  function loadConversationCache(uid) {
    try {
      const raw = localStorage.getItem(conversationStorageKey(uid));
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  function saveConversationCache(conversations, uid) {
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
      localStorage.setItem(conversationStorageKey(uid), JSON.stringify(clean));
    } catch (_) {}
  }

  function installConversationPersistence() {
    const mm = global.MessageModule;
    if (!mm || mm.__conversationPersistenceInstalled) return !!mm;

    const originalGetConversations = mm.getConversations.bind(mm);
    const originalRequest = mm.request.bind(mm);
    let cache = loadConversationCache();

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

    mm.subscribe((event, data) => {
      if (event === 'conversation:archived') {
        const id = data?.chatId;
        cache = cache.filter(c => String(c.chatId) !== String(id));
        saveConversationCache(cache);
        return;
      }
      if (event === 'conversation:updated' || event === 'message:added') {
        try {
          cache = originalGetConversations();
          saveConversationCache(cache);
        } catch (_) {}
      }
    });

    mm.__conversationPersistenceInstalled = true;
    return true;
  }

  function renderCachedConversationList() {
    const list = document.getElementById('convList');
    const mm = global.MessageModule;
    if (!list || !mm) return;
    const conversations = mm.getConversations?.() || [];
    if (!conversations.length) return;
    // Do not replace a populated live list. This is only the reload/offline
    // fallback when the normal module has not painted anything yet.
    if (list.querySelector('.conv-item')) return;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
    list.innerHTML = conversations.slice().sort((a,b) => new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0)).map(c => {
      const name = c.otherUser?.username || 'Conversation';
      const preview = c.lastMessage?.content && typeof c.lastMessage.content === 'string' && !isUnsupported(c.lastMessage.content)
        ? c.lastMessage.content : '';
      return `<div class="conv-item" data-chat-id="${esc(c.chatId)}"><img class="conv-avatar" src="${esc(c.otherUser?.avatar || '/img/default-avatar.png')}" alt=""><div class="conv-meta"><div class="conv-name">${esc(name)}</div><div class="conv-preview">${esc(preview)}</div></div>${c.unreadCount ? `<span class="unread-badge">${esc(c.unreadCount)}</span>` : ''}</div>`;
    }).join('');
    list.querySelectorAll('.conv-item').forEach(el => el.addEventListener('click', () => {
      mm.openChat({ conversationId: Number(el.dataset.chatId) });
    }));
  }

  async function warmConversationCacheFromServer() {
    const mm = global.MessageModule;
    if (!mm?.request) return;
    try {
      const res = await mm.request().get('/chats?limit=50');
      const chats = Array.isArray(res?.data?.chats) ? res.data.chats : null;
      if (res?.success && chats) {
        const cache = chats.filter(c => c?.type === 'direct' && c?.otherParticipant).map(c => ({
          chatId: c.id,
          otherUser: { id: c.otherParticipant.id, username: c.otherParticipant.displayName || c.otherParticipant.username || '', avatar: c.otherParticipant.avatar || null },
          unreadCount: c.unreadCount || 0,
          lastMessage: Array.isArray(c.chatMessages) && c.chatMessages[0] ? { id: c.chatMessages[0].id, content: c.chatMessages[0].content, type: c.chatMessages[0].type, createdAt: c.chatMessages[0].createdAt, senderId: c.chatMessages[0].senderId, chatId: c.id } : null,
        }));
        saveConversationCache(cache);
        renderCachedConversationList();
      }
    } catch (_) {
      renderCachedConversationList();
    }
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
      lastHeight = log.scrollHeight;
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
    warmConversationCacheFromServer().catch(() => {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('load', boot, { once: true });
})(window);
