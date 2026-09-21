/*
 * Group message isolation for the Messages iframe.
 *
 * Groups are conversations in the same backend Chats table, but they are NOT
 * private Message Module conversations. The Messages sidebar may list groups
 * as navigation entries, while group message bodies belong exclusively to
 * group.html.
 *
 * This is intentionally a defensive boundary: even if an older relay sends a
 * group message as `message:new`, the Messages iframe consumes neither the
 * message nor its private-chat unread state. Instead it updates the group
 * sidebar and shows a small "new group message" notification.
 */
(function () {
  'use strict';

  // FIX (double-init): this file is now loaded via a static <script> tag in
  // message.html (see that file for why), but config.js's loadOnce() for
  // 'group_message_isolation' doesn't recognize a plain static tag (it only
  // dedupes against its own data-necpra-loader attribute) and would inject
  // this file a second time at DOMContentLoaded — registering a second
  // 'message' listener with its own separate GROUPS/UNREAD maps and firing
  // a second /chats fetch. Guard against running twice.
  if (window.__necpraGroupMessageIsolationLoaded) return;
  window.__necpraGroupMessageIsolationLoaded = true;

  const GROUPS = new Map();
  const UNREAD = new Map();
  let groupLoadInFlight = null;
  let sidebar = null;
  let toastTimer = null;

  function apiBase() {
    if (typeof window.__getApiBase === 'function') return String(window.__getApiBase()).replace(/\/$/, '');
    return String(window.API_BASE_URL || '').replace(/\/$/, '');
  }

  function authToken() {
    try {
      if (window.__kynToken) return window.__kynToken;
      if (window.__accessToken) return window.__accessToken;
      if (window.AuthSessionManager && typeof window.AuthSessionManager.getToken === 'function') {
        const t = window.AuthSessionManager.getToken();
        if (t) return t;
      }
      for (const key of ['authToken', 'accessToken', 'token', 'jwt', 'USER_TOKEN', 'necpa_token']) {
        const t = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (t && !t.startsWith('{')) return t;
      }
    } catch (_) {}
    return '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function loadGroups() {
    if (groupLoadInFlight) return groupLoadInFlight;
    groupLoadInFlight = (async () => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        const token = authToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(`${apiBase()}/chats?limit=100`, { headers });
        if (!response.ok) return;
        const body = await response.json().catch(() => ({}));
        const rows = body?.data?.chats || body?.data || body?.chats || [];
        if (!Array.isArray(rows)) return;
        rows.filter(chat => chat && String(chat.type || chat.chatType || '').toLowerCase() === 'group').forEach(chat => {
          GROUPS.set(String(chat.id), chat);
        });
        renderSidebar();
      } catch (_) {
        // Group navigation is additive; a temporary failure must never break
        // the private Message Module.
      } finally {
        groupLoadInFlight = null;
      }
    })();
    return groupLoadInFlight;
  }

  function ensureSidebar() {
    if (sidebar && document.body.contains(sidebar)) return sidebar;
    const list = document.getElementById('convList');
    if (!list || !list.parentNode) return null;

    sidebar = document.getElementById('messageGroupSidebar');
    if (!sidebar) {
      sidebar = document.createElement('section');
      sidebar.id = 'messageGroupSidebar';
      sidebar.innerHTML = `
        <div class="message-group-sidebar-head">
          <span>Groups</span>
          <span class="message-group-sidebar-count"></span>
        </div>
        <div class="message-group-sidebar-list"></div>`;
      list.parentNode.insertBefore(sidebar, list);
    }
    return sidebar;
  }

  function renderSidebar() {
    const root = ensureSidebar();
    if (!root) return;
    const rows = root.querySelector('.message-group-sidebar-list');
    const count = root.querySelector('.message-group-sidebar-count');
    if (!rows) return;

    const groups = Array.from(GROUPS.values()).sort((a, b) => {
      const au = Number(UNREAD.get(String(a.id)) || 0);
      const bu = Number(UNREAD.get(String(b.id)) || 0);
      if (au !== bu) return bu - au;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    count.textContent = groups.length ? String(groups.length) : '';
    if (!groups.length) {
      rows.innerHTML = '<div class="message-group-empty">No groups yet</div>';
      return;
    }

    rows.innerHTML = groups.map(group => {
      const id = String(group.id);
      const unread = Number(UNREAD.get(id) || 0);
      const initial = escapeHtml(String(group.name || 'G').trim().slice(0, 1).toUpperCase() || 'G');
      const avatar = group.avatar
        ? `<img class="message-group-avatar" src="${escapeHtml(group.avatar)}" alt="">`
        : `<div class="message-group-avatar message-group-avatar-fallback">${initial}</div>`;
      return `
        <button class="message-group-row" data-group-id="${escapeHtml(id)}" type="button">
          ${avatar}
          <span class="message-group-meta">
            <strong>${escapeHtml(group.name || 'Unnamed group')}</strong>
            <small>${unread ? 'This group has new message' : `${Number(group.participantCount || group.participants?.length || 0)} members`}</small>
          </span>
          ${unread ? `<span class="message-group-unread">${unread > 99 ? '99+' : unread}</span>` : ''}
        </button>`;
    }).join('');

    rows.querySelectorAll('.message-group-row').forEach(row => {
      row.addEventListener('click', () => openGroup(row.dataset.groupId));
    });
  }

  function openGroup(groupId) {
    const id = String(groupId || '');
    const group = GROUPS.get(id);
    if (!id || !group) return;
    UNREAD.delete(id);
    renderSidebar();

    try {
      // FIX (GROUP-CLICK-NOT-OPENING, root cause): every other module's nav
      // button/content-div id matches what its own SWITCH_MODULE sender uses
      // ('messages'->messagesContent, 'friends'->friendsContent, 'calls'->
      // callsContent, 'settings'->settingsContent) — Groups is the one
      // exception: its nav button is data-page="group" and its container is
      // #groupContent (singular), not #groupsContent. chat.html's
      // navigateToPage(data.module) looks up `${page}Content` directly, so
      // sending 'groups' here made it search for a #groupsContent that has
      // never existed — every click on a group from this sidebar hid every
      // module and showed nothing, with no visible error. Use the real
      // module key. (chat.html now also reads payload.groupId here to open
      // this exact group instead of just the bare group list.)
      window.parent.postMessage({
        type: 'SWITCH_MODULE',
        module: 'group',
        payload: { groupId: Number(id), groupIdString: id, groupName: group.name || 'Group' },
        source: 'message-group-sidebar'
      }, '*');
      window.parent.postMessage({
        type: 'OPEN_GROUP_BY_ID',
        payload: { groupId: Number(id) },
        source: 'message-group-sidebar'
      }, '*');
    } catch (_) {}
  }

  function showNotification(group, message) {
    const name = group?.name || 'Group';
    const root = ensureSidebar();
    if (!root) return;

    let toast = document.getElementById('messageGroupNotification');
    if (!toast) {
      toast = document.createElement('button');
      toast.id = 'messageGroupNotification';
      toast.type = 'button';
      document.body.appendChild(toast);
    }
    toast.textContent = `👥 ${name}: This group has new message`;
    toast.onclick = () => openGroup(String(group.id));
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
  }

  function groupIdFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    return String(payload.groupId ?? payload.chatId ?? payload.conversationId ?? payload.chat?.id ?? payload.group?.id ?? '');
  }

  function explicitlyGroupPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const chatType = String(payload.chatType ?? payload.chat?.type ?? '').toLowerCase();
    const type = String(payload.type || '').toLowerCase();
    return payload.isGroup === true || chatType === 'group' || type === 'group' || payload.groupId != null || payload.group?.id != null;
  }

  function isKnownGroupMessage(payload) {
    const id = groupIdFromPayload(payload);
    return explicitlyGroupPayload(payload) || (id && GROUPS.has(id));
  }

  // Capture phase is deliberate. It runs before message-client.js's normal
  // bubble-phase handler. Any explicitly identified group message is stopped
  // before it can enter private-chat state. The backend's canonical group
  // payload includes chatType/isGroup; the id fallback also covers older
  // relays that only preserved chatId after the group list was loaded.
  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'message:new' || data.type === 'new_message') {
      const payload = data.payload || {};
      if (!isKnownGroupMessage(payload)) return;
      event.stopImmediatePropagation();

      const groupId = groupIdFromPayload(payload);
      const group = GROUPS.get(groupId) || {
        id: groupId,
        name: payload.groupName || payload.chatName || payload.group?.name || 'Group',
        avatar: payload.groupAvatar || payload.group?.avatar || null,
      };
      if (groupId) {
        GROUPS.set(groupId, group);
        UNREAD.set(groupId, Number(UNREAD.get(groupId) || 0) + 1);
      }
      renderSidebar();
      showNotification(group, payload);
      return;
    }

    if (data.type === 'GROUP_PANEL_OPEN') {
      const groupId = String(data.payload?.id || data.payload?.chatId || data.payload?.groupId || '');
      if (groupId) {
        UNREAD.delete(groupId);
        renderSidebar();
      }
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    #messageGroupSidebar{border-bottom:1px solid var(--kyn-border);background:var(--kyn-bg-panel)}
    .message-group-sidebar-head{display:flex;align-items:center;justify-content:space-between;padding:9px 14px 6px;font-size:12px;font-weight:700;color:var(--kyn-text-secondary)}
    .message-group-sidebar-count{font-size:10px;opacity:.7}
    .message-group-sidebar-list{max-height:220px;overflow:auto}
    .message-group-row{width:100%;display:flex;align-items:center;gap:9px;padding:8px 14px;border:0;border-bottom:1px solid var(--kyn-border);background:transparent;color:inherit;text-align:left;cursor:pointer}
    .message-group-row:hover{background:var(--kyn-bg-hover)}
    .message-group-avatar{width:38px;height:38px;border-radius:11px;object-fit:cover;flex:0 0 auto}
    .message-group-avatar-fallback{display:grid;place-items:center;background:var(--kyn-bg-hover);font-weight:800;color:var(--kyn-accent-primary)}
    .message-group-meta{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
    .message-group-meta strong{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .message-group-meta small{font-size:11px;color:var(--kyn-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .message-group-unread{min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:var(--kyn-accent-primary);color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center}
    .message-group-empty{padding:8px 14px;font-size:11px;color:var(--kyn-text-secondary)}
    #messageGroupNotification{position:fixed;left:50%;bottom:18px;transform:translate(-50%,12px);opacity:0;pointer-events:none;z-index:5000;border:0;border-radius:999px;padding:10px 15px;background:var(--kyn-bg-panel);color:var(--kyn-text-primary);box-shadow:0 8px 26px #0003;font-size:12px;font-weight:700;transition:opacity .18s ease,transform .18s ease}
    #messageGroupNotification.visible{opacity:1;transform:translate(-50%,0);pointer-events:auto}
  `;
  (document.head || document.documentElement).appendChild(style);

  function boot() {
    ensureSidebar();
    loadGroups();
    setInterval(loadGroups, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
