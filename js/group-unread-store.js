/*
 * Shared group unread store (used by group.html AND the Messages iframe's
 * Groups strip, js/group-message-isolation.js).
 *
 * Why it exists: group.html and message.html are separate iframes. Each kept
 * (or lacked) its own unread state, and group.html only loads when Groups is
 * first opened, so the Messages screen never counted anything. Both now read
 * and write ONE localStorage record, namespaced per account:
 *   kyn_group_unread_v2:<userId>  ->  { counts: {groupId: n}, seen: [ "gid:msgId", ... ] }
 *   kyn_group_open_v1:<userId>    ->  id of the group currently open in group.html ('' when none)
 * Rules: own messages never count; the open group never counts; a message id
 * counts once even though both iframes receive it (de-dupe via `seen`).
 */
(function () {
  'use strict';
  if (window.KynGroupUnread) return;
  const SEEN_MAX = 500;
  const listeners = new Set();

  function uid() {
    try {
      const v = window._kynCurrentUserId || localStorage.getItem('userId') || localStorage.getItem('currentUserId') || '';
      return String(v || '');
    } catch (_) { return ''; }
  }
  const unreadKey = () => { const u = uid(); return u ? 'kyn_group_unread_v2:' + u : ''; };
  const openKey = () => { const u = uid(); return u ? 'kyn_group_open_v1:' + u : ''; };

  function read() {
    const k = unreadKey();
    if (!k) return { counts: {}, seen: [] };
    try {
      const o = JSON.parse(localStorage.getItem(k) || 'null');
      if (o && typeof o === 'object') return { counts: o.counts || {}, seen: Array.isArray(o.seen) ? o.seen : [] };
    } catch (_) {}
    return { counts: {}, seen: [] };
  }
  function write(state) {
    const k = unreadKey();
    if (!k) return;
    try { localStorage.setItem(k, JSON.stringify(state)); } catch (_) {}
  }
  function emit() {
    listeners.forEach(fn => { try { fn(); } catch (_) {} });
  }

  const api = {
    all() { return Object.assign({}, read().counts); },
    get(groupId) { return Number(read().counts[String(groupId)] || 0); },
    getOpen() { const k = openKey(); try { return k ? String(localStorage.getItem(k) || '') : ''; } catch (_) { return ''; } },
    setOpen(groupId) {
      const k = openKey(); if (!k) return;
      try { if (groupId == null || groupId === '') localStorage.removeItem(k); else localStorage.setItem(k, String(groupId)); } catch (_) {}
    },
    // Returns true if this call counted a new unread message.
    bump(groupId, msgId, senderId) {
      const gid = String(groupId == null ? '' : groupId);
      if (!gid) return false;
      const me = uid();
      if (!me) return false;                                        // account unknown: don't write to a wrong namespace
      if (senderId != null && String(senderId) === me) return false; // own message
      if (api.getOpen() === gid) return false;                       // group is open right now
      const st = read();
      if (msgId != null && msgId !== '') {
        const sk = gid + ':' + msgId;
        if (st.seen.indexOf(sk) !== -1) return false;               // already counted (other iframe, or replay)
        st.seen.push(sk);
        if (st.seen.length > SEEN_MAX) st.seen.splice(0, st.seen.length - SEEN_MAX);
      }
      st.counts[gid] = Number(st.counts[gid] || 0) + 1;
      write(st);
      emit();
      return true;
    },
    clear(groupId) {
      const gid = String(groupId);
      const st = read();
      if (!st.counts[gid]) return;
      delete st.counts[gid];
      write(st);
      emit();
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };

  // The other iframe wrote to localStorage: refresh this one.
  window.addEventListener('storage', (e) => {
    if (e && e.key && e.key.indexOf('kyn_group_unread_v2:') === 0) emit();
  });
  // Group no longer "open" if this page goes away (app closed with a group open).
  window.addEventListener('pagehide', () => { try { if (api.getOpen()) { /* only the group page owns this */ } } catch (_) {} });

  window.KynGroupUnread = api;
})();
