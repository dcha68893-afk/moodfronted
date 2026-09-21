/* Friends + direct-chat bridge for the Messages iframe.
 * Keeps the Messages contact picker independent from the parent /friends relay,
 * refreshes the real authenticated Friends endpoint, opens direct chats through
 * the canonical /chats/start gateway, and owns the back navigation for chats
 * launched from Friends. */
(function () {
  'use strict';
  if (window.__NECPRA_FRIENDS_LOCAL_BRIDGE__) return;
  window.__NECPRA_FRIENDS_LOCAL_BRIDGE__ = true;

  function normalize(f) {
    if (!f || (f.id == null && f.userId == null && f.friendId == null)) return null;
    var id = Number(f.id != null ? f.id : (f.userId != null ? f.userId : f.friendId));
    if (!Number.isInteger(id) || id <= 0) return null;
    return { id: id, userId: id, friendId: id,
      username: f.username || f.displayName || f.name || ('User ' + id),
      displayName: f.displayName || f.username || f.name || ('User ' + id),
      firstName: f.firstName || '', lastName: f.lastName || '',
      avatar: f.avatar || f.photoURL || f.profilePicture || '' };
  }

  function readCache() {
    var out = [], seen = new Set();
    function add(arr) {
      if (!Array.isArray(arr)) return;
      arr.forEach(function (f) { var n = normalize(f); if (n && !seen.has(String(n.id))) { seen.add(String(n.id)); out.push(n); } });
    }
    try { add(JSON.parse(localStorage.getItem('knecta_friends_cache') || '[]')); } catch (_) {}
    try { add(JSON.parse(localStorage.getItem('kynecta_friends_cache_v8') || '[]')); } catch (_) {}
    try { var s = window.KynectaStore; if (s && typeof s.get === 'function') add(s.get('friends.list') || []); } catch (_) {}
    return out;
  }

  function saveUsers(users) {
    var normalized = (Array.isArray(users) ? users : []).map(normalize).filter(Boolean);
    try { localStorage.setItem('knecta_friends_cache', JSON.stringify(normalized)); } catch (_) {}
    return normalized;
  }

  window.KynectaFriendsLocalStore = window.KynectaFriendsLocalStore || {};
  var store = window.KynectaFriendsLocalStore;
  if (typeof store.ready !== 'function') store.ready = function () { return Promise.resolve(); };
  if (typeof store.getFriends !== 'function') store.getFriends = function () { return readCache(); };
  if (typeof store.saveUsers !== 'function') store.saveUsers = saveUsers;

  function apiBase() {
    try { return String(window.__getApiBase?.() || window.API_BASE_URL || '').replace(/\/$/, ''); } catch (_) { return ''; }
  }
  function authToken() {
    try {
      return window.__kynToken || window.__accessToken || window.AuthSessionManager?.getToken?.()
        || localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
    } catch (_) { return ''; }
  }
  async function fetchJson(path, options, timeoutMs) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs || 10000) : null;
    try {
      var headers = Object.assign({}, (options && options.headers) || {}), t = authToken();
      if (t) headers.Authorization = 'Bearer ' + t;
      var opts = Object.assign({}, options || {}, { headers: headers });
      if (controller) opts.signal = controller.signal;
      var r = await fetch(apiBase() + path, opts);
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok || d.success === false) throw new Error(d.message || d.error || ('Request failed (' + r.status + ')'));
      return d;
    } finally { if (timer) clearTimeout(timer); }
  }

  /* Friends UI consumes data.users. The old FriendsService.list() cached
     r.friends instead, so the Friends page could contain a friend while the
     Messages picker had an empty cache. Refresh directly from the authenticated
     endpoint and never replace good cached data with an empty timeout. */
  var refreshPromise = null;
  async function refreshFriendsFromApi() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = fetchJson('/friends?limit=100&offset=0', { method: 'GET' }, 9000)
      .then(function (r) {
        var users = (r.data && Array.isArray(r.data.users) ? r.data.users : null)
          || (Array.isArray(r.friends) ? r.friends : null)
          || (Array.isArray(r.users) ? r.users : []);
        if (users.length) saveUsers(users);
        return readCache();
      })
      .catch(function () { return readCache(); })
      .finally(function () { refreshPromise = null; });
    return refreshPromise;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function paintStartChat() {
    var modal = document.getElementById('newChatModal'), results = document.getElementById('newChatResults'), input = document.getElementById('newChatSearchInput');
    if (!modal || !results || modal.classList.contains('hidden')) return;
    var friends = readCache(), q = ((input && input.value) || '').trim().toLowerCase();
    var filtered = friends.filter(function (u) {
      return !q || String(u.username || '').toLowerCase().indexOf(q) !== -1
        || String(u.displayName || '').toLowerCase().indexOf(q) !== -1
        || String(u.firstName || '').toLowerCase().indexOf(q) !== -1
        || String(u.lastName || '').toLowerCase().indexOf(q) !== -1;
    });
    if (!filtered.length) {
      results.innerHTML = '<div style="padding:18px;color:var(--kyn-text-secondary);font-size:13px;">'
        + (q ? 'No friends match that search.' : 'Loading your friends…') + '</div>';
      return;
    }
    results.innerHTML = filtered.map(function (u) {
      var name = escapeHtml(u.displayName || u.username || 'User');
      var avatar = escapeHtml(u.avatar || '/icons/necpa-192.png');
      return '<div class="new-chat-result-item" data-necpra-friend-chat="1" data-user-id="' + u.id
        + '" data-user-name="' + name + '" data-user-avatar="' + avatar + '"><img src="' + avatar
        + '" alt=""><span>' + name + '</span><span style="margin-left:auto;font-size:11px;color:var(--kyn-text-secondary);">Friend</span></div>';
    }).join('');
    results.querySelectorAll('[data-necpra-friend-chat]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        var id = Number(el.dataset.userId);
        if (!Number.isInteger(id) || id <= 0) return;
        modal.classList.add('hidden');
        openDirectChat({ userId: id, userName: el.dataset.userName || null, avatar: el.dataset.userAvatar || null, source: 'messages-module' });
      }, true);
    });
  }

  /* Resolve/create once through /chats/start. This gives MessageModule a real
     conversationId before history loading, avoiding the previous userId ->
     /messages/resolve -> history chain. If a known conversationId is supplied,
     skip the network call entirely. */
  var openPromises = new Map();
  async function openDirectChat(target) {
    if (!window.MessageModule || typeof window.MessageModule.openChat !== 'function') return;
    var id = Number(target && target.userId), knownChatId = Number(target && target.conversationId || 0);
    var key = knownChatId > 0 ? 'chat:' + knownChatId : 'user:' + id;
    if (knownChatId <= 0 && (!Number.isInteger(id) || id <= 0)) return;
    if (openPromises.has(key)) return openPromises.get(key);
    var promise = (async function () {
      var chatId = knownChatId > 0 ? knownChatId : null;
      if (!chatId) {
        try {
          var response = await fetchJson('/chats/start', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: id })
          }, 12000);
          chatId = Number(response.data && response.data.chat && response.data.chat.id);
          if (!Number.isInteger(chatId) || chatId <= 0) throw new Error('Chat ID was not returned');
        } catch (_) {
          return window.MessageModule.openChat({ userId: id, userName: target.userName || null, avatar: target.avatar || null });
        }
      }
      return window.MessageModule.openChat({ conversationId: chatId, userId: id, userName: target.userName || null, avatar: target.avatar || null });
    })();
    openPromises.set(key, promise);
    try { return await promise; } finally { openPromises.delete(key); }
  }

  function wire() {
    var modal = document.getElementById('newChatModal'), button = document.getElementById('newChatBtn'), input = document.getElementById('newChatSearchInput');
    if (!modal || !button) return false;
    button.addEventListener('click', function () {
      paintStartChat();
      refreshFriendsFromApi().then(function () { paintStartChat(); });
      setTimeout(paintStartChat, 80);
      setTimeout(paintStartChat, 400);
    }, true);
    if (input) input.addEventListener('input', function () { setTimeout(paintStartChat, 0); }, true);
    return true;
  }
  function install() { if (wire()) return; setTimeout(install, 50); }

  /* Intercept OPEN_CHAT_WITH_USER before message-client's generic userId path.
     Other modules already send target identity; resolving here gives
     MessageModule a conversationId and prevents a second resolution request. */
  window.addEventListener('message', function (event) {
    var d = event.data;
    if (!d || d.type !== 'OPEN_CHAT_WITH_USER') return;
    var p = d.payload || d;
    var conversationId = Number(p.conversationId || 0), userId = Number(p.userId || 0);
    if (conversationId > 0 || userId > 0) {
      try { event.stopImmediatePropagation(); } catch (_) {}
      openDirectChat({ conversationId: conversationId, userId: userId, userName: p.userName || null, avatar: p.avatar || null, source: p.source || 'parent-module' });
    }
  }, true);

  /* Back is contextual: a chat launched from Friends returns to Friends;
     a chat started inside Messages returns to the Messages conversation list. */
  document.addEventListener('click', function (e) {
    var back = e.target && e.target.closest ? e.target.closest('#backBtn') : null;
    if (!back) return;
    var pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('pending_chat') || 'null'); } catch (_) {}
    var source = pending && pending.source || '';
    var chatId = window.MessageModule && typeof window.MessageModule.getActiveChatId === 'function' ? window.MessageModule.getActiveChatId() : null;
    try { if (chatId && typeof window.MessageModule.sendTypingStop === 'function') window.MessageModule.sendTypingStop(chatId); } catch (_) {}
    try { if (window.MessageModule && typeof window.MessageModule.setActiveChatId === 'function') window.MessageModule.setActiveChatId(null); } catch (_) {}
    try { sessionStorage.removeItem('pending_chat'); } catch (_) {}
    e.preventDefault(); e.stopImmediatePropagation();
    if (source === 'friends-module' || source === 'friend') {
      try { window.parent.postMessage({ type: 'SWITCH_MODULE', module: 'friends', payload: { source: 'messages-back' }, source: 'messages-back' }, '*'); } catch (_) {}
      return;
    }
    var list = document.getElementById('convListPanel'), panel = document.getElementById('chatPanel');
    if (list) list.classList.remove('hide-on-mobile');
    if (panel) panel.classList.add('hide-on-mobile');
    try { if (typeof window.renderChatPanel === 'function') window.renderChatPanel(null); } catch (_) {}
    try { if (typeof window.renderConversationList === 'function') window.renderConversationList(); } catch (_) {}
    try { window.parent.postMessage({ type: 'CHAT_LIST_SHOWN', source: 'messages-back' }, '*'); } catch (_) {}
  }, true);

  window.addEventListener('storage', function (e) {
    if (e.key === 'knecta_friends_cache' || e.key === 'kynecta_friends_cache_v8') setTimeout(paintStartChat, 0);
  });
  window.addEventListener('message', function (event) {
    var d = event.data;
    if (!d || (d.type !== 'FRIENDS_LIST_UPDATE' && d.type !== 'FRIENDS_LIST_RESPONSE' && d.type !== 'FRIENDS_DATA' && d.type !== 'FRIENDS_SYNC')) return;
    var raw = (d.payload && (d.payload.friends || (d.payload.data && d.payload.data.users))) || d.friends || (d.data && d.data.users) || [];
    if (!Array.isArray(raw)) return;
    saveUsers(raw); setTimeout(paintStartChat, 0);
  });

  function settleOpeningUi() {
    try {
      var panel = document.getElementById('chatPanel');
      if (!panel) return;
      var active = window.MessageModule && typeof window.MessageModule.getActiveChatId === 'function' ? window.MessageModule.getActiveChatId() : null;
      if (!active) return;
      panel.querySelectorAll('.chat-loading-state').forEach(function (node) { node.remove(); });
    } catch (_) {}
  }
  setInterval(settleOpeningUi, 500);
  window.addEventListener('message', function (event) {
    var d = event.data;
    if (!d || (d.type !== 'OPEN_CHAT_WITH_USER' && d.type !== 'CHAT_OPENED' && d.type !== 'CHAT_OPENING')) return;
    setTimeout(settleOpeningUi, 0); setTimeout(settleOpeningUi, 250); setTimeout(settleOpeningUi, 1000);
  });
  install();
})();
