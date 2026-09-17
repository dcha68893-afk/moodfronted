/* Friends local bridge for the Messages iframe.
 * Loaded before message-client.js by message.html. Keeps the existing
 * friends cache available without making the Start Chat picker wait on the
 * parent /friends relay, and provides the small local-store contract used by
 * the Friends service. */
(function () {
  'use strict';
  if (window.__NECPRA_FRIENDS_LOCAL_BRIDGE__) return;
  window.__NECPRA_FRIENDS_LOCAL_BRIDGE__ = true;

  function normalize(f) {
    if (!f || f.id == null && f.userId == null && f.friendId == null) return null;
    var id = Number(f.id != null ? f.id : (f.userId != null ? f.userId : f.friendId));
    if (!Number.isInteger(id) || id <= 0) return null;
    return { id: id, userId: id, friendId: id, username: f.username || f.displayName || f.name || ('User ' + id), displayName: f.displayName || f.username || f.name || ('User ' + id), firstName: f.firstName || '', lastName: f.lastName || '', avatar: f.avatar || f.photoURL || f.profilePicture || '' };
  }
  function readCache() {
    var out = [], seen = new Set();
    function add(arr) { if (!Array.isArray(arr)) return; arr.forEach(function (f) { var n = normalize(f); if (n && !seen.has(String(n.id))) { seen.add(String(n.id)); out.push(n); } }); }
    try { add(JSON.parse(localStorage.getItem('knecta_friends_cache') || '[]')); } catch (_) {}
    try { add(JSON.parse(localStorage.getItem('kynecta_friends_cache_v8') || '[]')); } catch (_) {}
    try { var s = window.KynectaStore; if (s && typeof s.get === 'function') add(s.get('friends.list') || []); } catch (_) {}
    return out;
  }
  function saveUsers(users) { var normalized = (Array.isArray(users) ? users : []).map(normalize).filter(Boolean); try { localStorage.setItem('knecta_friends_cache', JSON.stringify(normalized)); } catch (_) {} return normalized; }
  window.KynectaFriendsLocalStore = window.KynectaFriendsLocalStore || {};
  var store = window.KynectaFriendsLocalStore;
  if (typeof store.ready !== 'function') store.ready = function () { return Promise.resolve(); };
  if (typeof store.getFriends !== 'function') store.getFriends = function () { return readCache(); };
  if (typeof store.saveUsers !== 'function') store.saveUsers = saveUsers;

  function paintStartChat() {
    var modal = document.getElementById('newChatModal'), results = document.getElementById('newChatResults'), input = document.getElementById('newChatSearchInput');
    if (!modal || !results || modal.classList.contains('hidden')) return;
    var friends = readCache(), q = ((input && input.value) || '').trim().toLowerCase();
    var filtered = friends.filter(function (u) { return !q || String(u.username || '').toLowerCase().indexOf(q) !== -1 || String(u.displayName || '').toLowerCase().indexOf(q) !== -1 || String(u.firstName || '').toLowerCase().indexOf(q) !== -1 || String(u.lastName || '').toLowerCase().indexOf(q) !== -1; });
    if (!filtered.length) { if (!q && friends.length) return; if (!q) results.innerHTML = '<div style="padding:18px;color:var(--kyn-text-secondary,#999);font-size:13px;">No friends yet.</div>'; return; }
    results.innerHTML = filtered.map(function (u) {
      var name = String(u.displayName || u.username || 'User').replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; });
      var avatar = String(u.avatar || '/icons/necpa-192.png').replace(/"/g, '&quot;');
      return '<div class="new-chat-result-item" data-necpra-friend-chat="1" data-user-id="' + u.id + '" data-user-name="' + name.replace(/"/g, '&quot;') + '" data-user-avatar="' + avatar + '"><img src="' + avatar + '" alt=""><span>' + name + '</span><span style="margin-left:auto;font-size:11px;color:var(--kyn-text-secondary,#999);">Friend</span></div>';
    }).join('');
    results.querySelectorAll('[data-necpra-friend-chat]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        var id = Number(el.dataset.userId);
        if (!Number.isInteger(id) || id <= 0 || !window.MessageModule || typeof window.MessageModule.openChat !== 'function') return;
        modal.classList.add('hidden');
        window.MessageModule.openChat({ userId: id, userName: el.dataset.userName || 'User', avatar: el.dataset.userAvatar || null });
      }, true);
    });
  }

  function wire() {
    var modal = document.getElementById('newChatModal'), button = document.getElementById('newChatBtn'), input = document.getElementById('newChatSearchInput');
    if (!modal || !button) return false;
    button.addEventListener('click', function () { setTimeout(paintStartChat, 0); setTimeout(paintStartChat, 80); setTimeout(paintStartChat, 400); }, true);
    if (input) input.addEventListener('input', function () { setTimeout(paintStartChat, 0); }, true);
    return true;
  }
  function install() { if (wire()) return; setTimeout(install, 50); }

  window.addEventListener('storage', function (e) { if (e.key === 'knecta_friends_cache' || e.key === 'kynecta_friends_cache_v8') setTimeout(paintStartChat, 0); });
  window.addEventListener('message', function (event) {
    var d = event.data;
    if (!d || (d.type !== 'FRIENDS_LIST_UPDATE' && d.type !== 'FRIENDS_LIST_RESPONSE' && d.type !== 'FRIENDS_DATA' && d.type !== 'FRIENDS_SYNC')) return;
    var raw = (d.payload && d.payload.friends) || d.friends || [];
    if (!Array.isArray(raw)) return;
    saveUsers(raw); setTimeout(paintStartChat, 0);
  });

  /* Chat-open watchdog: resolution and history are independent of the UI.
     If a slow /chats or history request leaves the temporary opening spinner
     visible, never let it become an indefinite loading screen. Once the
     MessageModule has a real active chat, the panel is already authoritative;
     remove only the transient spinner and leave the conversation UI usable. */
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