/*
 * message-mobile-bootstrap-fix.js
 *
 * Mobile/slow-frame fallback for the Messages iframe. The canonical
 * message-client owns state, networking and crypto; this file only prevents
 * the mobile shell from looking empty when message-client.js started before
 * the parent API/session bootstrap was ready.
 */
(function (global) {
  'use strict';

  if (!/\/message(?:\.html)?$/i.test(global.location?.pathname || '')) return;
  if (global.__kynMobileMessageBootstrapFix) return;
  global.__kynMobileMessageBootstrapFix = true;

  const MAX_WAIT_MS = 12000;
  const POLL_MS = 400;
  let fallbackChats = [];
  let timer = null;
  let started = false;
  let friendRenderTimer = null;
  let friendWarmInFlight = false;

  function previewFor(chat) {
    const last = Array.isArray(chat?.chatMessages) ? chat.chatMessages[0] : null;
    if (!last) return 'No messages yet';
    if (last.deleted) return 'This message was deleted';
    if (last.type && last.type !== 'text') return `📎 ${last.type}`;
    return '🔒 Encrypted message';
  }

  function renderFallback() {
    const list = document.getElementById('convList');
    if (!list || !fallbackChats.length) return;
    const canonical = global.MessageModule?.getConversations?.() || [];
    if (canonical.length >= fallbackChats.length) return;
    const fragment = document.createDocumentFragment();
    fallbackChats.forEach((chat) => {
      if (!chat || chat.type !== 'direct' || !chat.otherParticipant) return;
      const row = document.createElement('div');
      row.className = 'conv-item'; row.dataset.chatId = String(chat.id);
      const avatar = document.createElement('img');
      avatar.className = 'conv-avatar'; avatar.alt = ''; avatar.src = chat.otherParticipant.avatar || '';
      avatar.onerror = () => { avatar.style.visibility = 'hidden'; };
      const meta = document.createElement('div'); meta.className = 'conv-meta';
      const name = document.createElement('div'); name.className = 'conv-name';
      name.textContent = chat.otherParticipant.displayName || chat.otherParticipant.username || 'Conversation';
      const preview = document.createElement('div'); preview.className = 'conv-preview'; preview.textContent = previewFor(chat);
      meta.appendChild(name); meta.appendChild(preview); row.appendChild(avatar); row.appendChild(meta);
      if (Number(chat.unreadCount) > 0) { const badge = document.createElement('span'); badge.className = 'unread-badge'; badge.textContent = String(chat.unreadCount); row.appendChild(badge); }
      row.addEventListener('click', () => global.MessageModule?.openChat?.({ conversationId:Number(chat.id), userId:chat.otherParticipant.id, userName:chat.otherParticipant.displayName || chat.otherParticipant.username || null, avatar:chat.otherParticipant.avatar || null }));
      fragment.appendChild(row);
    });
    list.replaceChildren(fragment);
  }

  async function fetchChats() {
    const mm = global.MessageModule;
    if (!mm?.request) return false;
    try {
      const res = await mm.request().get('/chats?limit=50');
      if (!res || res.success === false) return false;
      fallbackChats = (Array.isArray(res.data?.chats) ? res.data.chats : []).filter(c => c && c.type === 'direct' && c.otherParticipant);
      renderFallback();
      return fallbackChats.length > 0;
    } catch (_) { return false; }
  }

  function stop() { if (timer) clearTimeout(timer); timer = null; }

  async function pollUntilReady(startedAt) {
    if (Date.now() - startedAt > MAX_WAIT_MS) { stop(); return; }
    const mm = global.MessageModule;
    if (!mm) { timer = setTimeout(() => pollUntilReady(startedAt), POLL_MS); return; }
    if ((mm.getConversations?.() || []).length > 0) { stop(); return; }
    const loaded = await fetchChats();
    if (!loaded) { timer = setTimeout(() => pollUntilReady(startedAt), POLL_MS); return; }
    timer = setTimeout(() => pollUntilReady(startedAt), 1000);
  }

  let pendingCrossModuleOpen = null;
  let crossModuleOpenTimer = null;
  function openCrossModuleTarget(payload) {
    const p = payload || {};
    const targetUserId = p.userId ?? p.recipientId ?? p.targetUserId;
    const conversationId = p.conversationId ?? p.chatId ?? null;
    if (targetUserId == null && conversationId == null) return false;
    pendingCrossModuleOpen = { userId:targetUserId, conversationId, messageId:p.messageId ?? null, userName:p.userName || p.recipientName || p.name || null, avatar:p.avatar || p.recipientAvatar || null };
    const attempt = () => {
      const mm = global.MessageModule;
      if (!mm || typeof mm.openChat !== 'function') { crossModuleOpenTimer = setTimeout(attempt, POLL_MS); return; }
      const target = pendingCrossModuleOpen; pendingCrossModuleOpen = null; crossModuleOpenTimer = null;
      Promise.resolve(mm.openChat({ conversationId:target.conversationId, userId:target.userId, messageId:target.messageId, userName:target.userName, avatar:target.avatar })).catch(err => console.warn('[MessagesCrossModuleOpen] canonical openChat failed:', err?.message || err));
    };
    if (crossModuleOpenTimer) clearTimeout(crossModuleOpenTimer);
    attempt(); return true;
  }

  global.addEventListener('message', (event) => {
    const data = event?.data;
    if (!data || typeof data !== 'object' || data.type !== 'OPEN_CHAT_WITH_USER') return;
    if (event.source === global) return;
    if (openCrossModuleTarget(data.payload || data)) event.stopImmediatePropagation();
  }, true);

  function installOutgoingKeyFreshnessFix() {
    const e2e = global.KynectaE2E;
    const identity = global.KynectaE2EIdentity;
    if (!e2e || typeof e2e.encryptForChat !== 'function') return false;
    if (!identity || typeof identity.publicKeyFor !== 'function') return false;
    if (e2e.__outgoingKeyFreshnessFixed) return true;

    const original = e2e.encryptForChat.bind(e2e);
    e2e.encryptForChat = async function freshRecipientKeyEncrypt(plaintext, chatId, recipientUserId) {
      if (!recipientUserId) throw new Error('Recipient is required for secure messaging');
      let fresh;
      try {
        fresh = await identity.publicKeyFor(String(recipientUserId), true);
      } catch (err) {
        throw new Error(`Recipient encryption key could not be refreshed: ${err?.message || 'unavailable'}`);
      }
      if (!fresh?.key || !fresh?.pub) throw new Error('Recipient encryption key is unavailable');
      return original(plaintext, chatId, recipientUserId);
    };
    e2e.__outgoingKeyFreshnessFixed = true;
    return true;
  }

  function installE2EKeyFreshnessWhenReady() {
    if (installOutgoingKeyFreshnessFix()) return true;
    const retry = () => installOutgoingKeyFreshnessFix();
    document.addEventListener('kyn:canonicalMessageE2EReady', retry, { once:false });
    document.addEventListener('kyn:e2eUnlocked', retry, { once:false });
    return false;
  }

  function normalizeFriend(raw) {
    if (!raw) return null;
    const id = raw.id ?? raw.userId ?? raw.friendId;
    if (id == null || String(id) === '') return null;
    return {
      id: String(id),
      name: raw.displayName || raw.name || [raw.firstName, raw.lastName].filter(Boolean).join(' ') || raw.username || 'User',
      username: raw.username || '',
      avatar: raw.avatar || raw.photoURL || raw.profilePicture || null,
    };
  }

  function readSynchronousFriends() {
    const sources = [];
    try { if (Array.isArray(global.__friendsList)) sources.push(global.__friendsList); } catch (_) {}
    try {
      const cached = global.KynectaStore?.get?.('friends.list');
      if (Array.isArray(cached)) sources.push(cached);
    } catch (_) {}
    try {
      const gcFriends = global.FriendCore?.friends || global.FriendsCore?.friends;
      if (Array.isArray(gcFriends)) sources.push(gcFriends);
    } catch (_) {}

    const out = [];
    const seen = new Set();
    for (const source of sources) {
      for (const raw of source) {
        const friend = normalizeFriend(raw);
        if (!friend || seen.has(friend.id)) continue;
        seen.add(friend.id); out.push(friend);
      }
    }
    return out;
  }

  function friendNameMatch(friend, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    return `${friend.name} ${friend.username}`.toLowerCase().includes(q);
  }

  function renderInstantFriends(friends) {
    const results = document.getElementById('newChatResults');
    const modal = document.getElementById('newChatModal');
    if (!results || !modal || modal.classList.contains('hidden')) return false;
    if (!friends.length) return false;
    const input = document.getElementById('newChatSearchInput');
    const query = input?.value?.trim() || '';
    const filtered = friends.filter(f => friendNameMatch(f, query));
    if (!filtered.length) return false;

    // Once this fallback has painted, do not replace its DOM again unless the
    // visible friend set actually changed. Replacing children synchronously
    // from a MutationObserver can create a self-triggering DOM loop and block
    // the main thread for hundreds of milliseconds per click.
    const instantRows = Array.from(results.querySelectorAll('[data-kyn-instant-friend]'));
    if (instantRows.length) {
      const currentIds = instantRows.map(row => String(row.dataset.userId || '')).join(',');
      const nextIds = filtered.map(friend => String(friend.id)).join(',');
      if (currentIds === nextIds) return true;
    } else if (results.children.length > 0) {
      // Canonical renderer already populated the picker.
      return true;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach(friend => {
      const row = document.createElement('div');
      row.className = 'new-chat-result-item';
      row.dataset.kynInstantFriend = '1';
      row.dataset.userId = friend.id;
      const img = document.createElement('img');
      img.alt = '';
      img.src = friend.avatar || '';
      img.onerror = () => { img.style.visibility = 'hidden'; };
      const meta = document.createElement('div');
      meta.style.flex = '1'; meta.style.minWidth = '0';
      const name = document.createElement('div'); name.textContent = friend.name;
      name.style.fontWeight = '600';
      const sub = document.createElement('div'); sub.textContent = friend.username ? `@${friend.username}` : '';
      sub.style.fontSize = '12px'; sub.style.opacity = '0.65';
      meta.append(name, sub);
      row.append(img, meta);
      row.addEventListener('click', () => {
        global.MessageModule?.openChat?.({ userId: friend.id, conversationId: null, userName: friend.name, avatar: friend.avatar });
      });
      frag.appendChild(row);
    });
    results.replaceChildren(frag);
    return true;
  }

  async function refreshFriendsPicker() {
    if (friendWarmInFlight) return;
    const store = global.KynectaFriendsLocalStore;
    if (!store?.getFriends) return;
    friendWarmInFlight = true;
    try {
      const records = await store.getFriends();
      const friends = records.map(normalizeFriend).filter(Boolean);
      if (!friends.length) return;
      const results = document.getElementById('newChatResults');
      const modal = document.getElementById('newChatModal');
      if (!results || !modal || modal.classList.contains('hidden')) return;
      renderInstantFriends(friends);
    } catch (_) {} finally {
      friendWarmInFlight = false;
    }
  }

  function warmStartChatPicker() {
    const modal = document.getElementById('newChatModal');
    const results = document.getElementById('newChatResults');
    if (!modal || !results || modal.classList.contains('hidden')) return;
    renderInstantFriends(readSynchronousFriends());
    refreshFriendsPicker();
  }

  function installStartChatInstantFriends() {
    if (global.__kynInstantFriendsInstalled) return true;
    global.__kynInstantFriendsInstalled = true;

    const run = () => {
      warmStartChatPicker();
      if (friendRenderTimer) clearTimeout(friendRenderTimer);
      friendRenderTimer = setTimeout(() => { friendRenderTimer = null; warmStartChatPicker(); }, 250);
    };

    document.addEventListener('click', (e) => {
      if (e.target.closest('#newChatBtn, #startChatBtn, [data-action="start-chat"], [data-action="new-chat"]')) {
        setTimeout(run, 0);
      }
    }, true);

    document.addEventListener('input', (e) => {
      if (e.target.id === 'newChatSearchInput') {
        const sync = readSynchronousFriends();
        if (sync.length) renderInstantFriends(sync);
      }
    }, true);

    // Observe only modal visibility changes. Do not observe childList: this
    // fallback itself mutates #newChatResults and observing those mutations
    // caused a recursive render loop that could monopolize the main thread.
    const observer = new MutationObserver(() => {
      const modal = document.getElementById('newChatModal');
      if (!modal || modal.classList.contains('hidden')) return;
      if (friendRenderTimer) clearTimeout(friendRenderTimer);
      friendRenderTimer = setTimeout(() => { friendRenderTimer = null; warmStartChatPicker(); }, 50);
    });
    observer.observe(document.body, { attributes:true, subtree:true, attributeFilter:['class','style'] });

    global.addEventListener('message', (e) => {
      if (e.data?.type === 'FRIENDS_LIST_UPDATE') {
        const list = e.data?.payload?.friends || e.data?.friends || [];
        if (Array.isArray(list) && list.length) {
          global.__friendsList = list;
          warmStartChatPicker();
        }
      }
    });
    global.addEventListener('kyn:friendStore', warmStartChatPicker);
    return true;
  }

  function installAttachmentUploadFix() {
    const mm = global.MessageModule;
    if (!mm || typeof mm.uploadAttachment !== 'function' || mm.__directAttachmentUploadFixed) return !!mm;
    const original = mm.uploadAttachment.bind(mm);
    mm.uploadAttachment = async function directAttachmentUpload(file, onProgress) {
      if (!(file instanceof Blob)) return original(file, onProgress);
      const formData = new FormData();
      formData.append('file', file, file.name || 'attachment');
      const token = (() => {
        try {
          return global.AuthStorage?.getToken?.() || localStorage.getItem('accessToken') || localStorage.getItem('authToken') || localStorage.getItem('token');
        } catch (_) { return null; }
      })();
      const base = String(global.API_BASE_URL || global.__kynAPI?.baseUrl || '').replace(/\/$/, '');
      const apiBase = base.endsWith('/api') ? base : `${base}/api`;
      if (!apiBase) return original(file, onProgress);
      const response = await fetch(`${apiBase}/files/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        credentials: 'include',
      });
      let body = null;
      try { body = await response.json(); } catch (_) {}
      if (!response.ok || body?.success === false) throw new Error(body?.message || body?.error || `Upload failed (${response.status})`);
      const data = body?.data || body || {};
      if (typeof onProgress === 'function') { try { onProgress(100); } catch (_) {} }
      return { url:data.url, mimeType:data.mimeType, size:data.size, type:data.type, originalName:data.originalName };
    };
    mm.__directAttachmentUploadFixed = true;
    return true;
  }

  function start() {
    if (started) return;
    started = true;
    installE2EKeyFreshnessWhenReady();
    installStartChatInstantFriends();
    installAttachmentUploadFix();
    pollUntilReady(Date.now());
    const retry = () => {
      installAttachmentUploadFix();
      installOutgoingKeyFreshnessFix();
      installStartChatInstantFriends();
      warmStartChatPicker();
    };
    global.addEventListener('load', retry, { once:true });
    const timerId = setInterval(() => {
      const attachmentReady = installAttachmentUploadFix();
      const e2eReady = installOutgoingKeyFreshnessFix();
      installStartChatInstantFriends();
      if (attachmentReady && e2eReady) clearInterval(timerId);
    }, 250);
    setTimeout(() => clearInterval(timerId), MAX_WAIT_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})(window);
