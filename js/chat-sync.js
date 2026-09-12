/**
 * chat-sync.js — Server-synced pinned chats, mute, and starred messages
 *
 * Audit findings replaced:
 *  - kyn_pinned_chats_v1 localStorage key used in messages-ui.js (lines 4310, 4497)
 *    → now syncs with GET /api/conversations/pinned (chat-pin WRITE still has
 *    no backend — see FIX-404 note on pinChat() below)
 *  - isMuted stored in localStorage only
 *    → now syncs with PUT/DELETE /api/messages/:chatId/mute on server
 *  - Starred messages only in IndexedDB
 *    → now syncs with POST/DELETE /api/messages/:id/star on server
 *
 * FIX-404 (2026-09): every path in this file originally pointed at
 * /api/messaging/..., which 404'd for everything — routes/index.js
 * (backend repo) maps a 'messagingFeatures.js' router to that prefix, but
 * that file was never created; nothing is mounted at /api/messaging at all.
 * Star and mute DO have real backend implementations, just under a
 * different prefix (/api/messages/..., in routes/messages.js) — those two
 * are fixed below to point there instead, with their response shapes
 * adjusted to match what those routes actually return.
 *
 * Everything else in this file (chat-pin WRITE, message-pin, scheduled
 * messages, disappearing-message timer, in-chat search, @mention
 * suggestions, message report) has NO backend implementation anywhere in
 * routes/ — not just a wrong prefix. Those calls are left pointing at
 * /api/messaging/... (so they'll still 404 exactly as before) rather than
 * silently redirected to something that doesn't actually implement the
 * feature. Each is commented below. Building that backend module is a
 * separate, larger piece of work.
 *
 * The module patches window.messagesUI.pinChat() and window.messagesUI.muteChat()
 * to also call the server. It also seeds the local cache from the server on boot.
 */

(function (global) {
  'use strict';

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _apiBase() {
    return window.API_BASE_URL || window.BACKEND_URL || '';
  }

  function _token() {
    return window.authToken
      || sessionStorage.getItem('kynecta_auth_token')
      || localStorage.getItem('kynecta_auth_token')
      || localStorage.getItem('authToken')
      || '';
  }

  function _headers(extra) {
    const t = _token();
    return Object.assign({ 'Content-Type': 'application/json' }, t ? { 'Authorization': `Bearer ${t}` } : {}, extra || {});
  }

  async function _apiFetch(method, path, body) {
    try {
      const opts = { method, headers: _headers(), credentials: 'include' };
      if (body) opts.body = JSON.stringify(body);
      const resp = await fetch(`${_apiBase()}${path}`, opts);
      return resp.ok ? await resp.json() : null;
    } catch (_) { return null; }
  }

  // ── In-memory caches (seeded from server on boot) ─────────────────────────
  const _pinnedSet  = new Set();
  const _mutedMap   = new Map(); // chatId → { muted: bool, until: Date|null }
  const _starredSet = new Set(); // messageIds

  // ── Bootstrap: load pinned + starred from server ──────────────────────────
  async function _bootstrap() {
    // Pinned chats. FIX-404: /api/messaging/chats/pinned never existed;
    // /api/conversations/pinned is the real (currently stub-only, always
    // empty) route. Response shape is { success, data: [...] } — data is
    // the array directly here, not { pinned: [...] } like the old code
    // assumed.
    const pinRes = await _apiFetch('GET', '/api/conversations/pinned');
    if (pinRes && Array.isArray(pinRes.data)) {
      pinRes.data.forEach(id => _pinnedSet.add(String(id)));
      // Seed localStorage so existing messages-ui.js code that reads kyn_pinned_chats_v1 still works
      try {
        localStorage.setItem('kyn_pinned_chats_v1', JSON.stringify([...pinRes.data]));
      } catch (_) {}
    }

    // Starred messages. FIX-404: /api/messaging/messages/starred never
    // existed; /api/messages/starred is the real route. Response shape is
    // { success, data: [...] } — data is the array of starred-message rows
    // directly, not { starred: [...] } like the old code assumed.
    const starRes = await _apiFetch('GET', '/api/messages/starred');
    if (starRes && Array.isArray(starRes.data)) {
      starRes.data.forEach(m => _starredSet.add(String(m.messageId)));
    }

    console.log(`[ChatSync] ✅ Loaded ${_pinnedSet.size} pinned chats, ${_starredSet.size} starred messages`);
  }

  // ── Pin / unpin ───────────────────────────────────────────────────────────
  async function pinChat(chatId, pinned) {
    if (pinned === undefined) pinned = !_pinnedSet.has(String(chatId));
    const cid = String(chatId);

    if (pinned) _pinnedSet.add(cid); else _pinnedSet.delete(cid);

    // Update localStorage immediately for existing code
    try {
      localStorage.setItem('kyn_pinned_chats_v1', JSON.stringify([..._pinnedSet]));
    } catch (_) {}

    // FIX-404 (unresolved): there is no backend route to persist a pin at
    // all — GET /api/conversations/pinned above is a read-only stub. This
    // call is left as-is (still 404s) until a real PUT /pin endpoint
    // exists; pin state only survives locally via the localStorage write
    // above, not across devices/reloads from the server.
    await _apiFetch('PUT', `/api/messaging/chats/${chatId}/pin`, { pinned });

    // Trigger UI refresh
    window.messagesUI?.refreshChatsList?.();
    return pinned;
  }

  function isChatPinned(chatId) {
    return _pinnedSet.has(String(chatId));
  }

  // ── Mute / unmute ─────────────────────────────────────────────────────────
  async function muteChat(chatId, muted, duration) {
    if (muted === undefined) muted = !(_mutedMap.get(String(chatId))?.muted);
    const cid = String(chatId);

    let mutedUntil = null;
    if (muted && duration) {
      const d = { '8h': 8*3600*1000, '1d': 86400*1000, '1w': 604800*1000 }[duration];
      if (d) mutedUntil = new Date(Date.now() + d);
    }

    _mutedMap.set(cid, { muted, until: mutedUntil });

    // FIX-404: /api/messaging/chats/:chatId/mute never existed;
    // /api/messages/:chatId/mute is the real route (same PUT body shape:
    // { muted, duration }, so no other change needed here).
    await _apiFetch('PUT', `/api/messages/${chatId}/mute`, { muted, duration });

    window.messagesUI?.refreshChatsList?.();
    return muted;
  }

  function isChatMuted(chatId) {
    const entry = _mutedMap.get(String(chatId));
    if (!entry || !entry.muted) return false;
    if (entry.until && new Date() > entry.until) {
      _mutedMap.set(String(chatId), { muted: false, until: null });
      return false;
    }
    return true;
  }

  // ── Star / unstar messages ────────────────────────────────────────────────
  async function starMessage(messageId, starred) {
    if (starred === undefined) starred = !_starredSet.has(String(messageId));
    const mid = String(messageId);

    // FIX-404: /api/messaging/messages/:id/star never existed;
    // /api/messages/:id/star is the real route.
    if (starred) {
      _starredSet.add(mid);
      await _apiFetch('POST', `/api/messages/${messageId}/star`, {});
    } else {
      _starredSet.delete(mid);
      await _apiFetch('DELETE', `/api/messages/${messageId}/star`, null);
    }

    // Dispatch event so UI can update star indicator
    window.dispatchEvent(new CustomEvent('kyn:starChanged', { detail: { messageId, starred } }));
    return starred;
  }

  function isMessageStarred(messageId) {
    return _starredSet.has(String(messageId));
  }

  async function getStarredMessages() {
    // FIX-404 + response-shape fix — see _bootstrap() above.
    const res = await _apiFetch('GET', '/api/messages/starred');
    return res?.data || [];
  }

  // ── Report message ────────────────────────────────────────────────────────
  // FIX-404 (unresolved): no backend route exists anywhere for reporting an
  // individual message (there is /api/friends/:id/report and
  // /api/groups/:id/report, but nothing message-level). Left pointing at
  // /api/messaging/... so it still 404s rather than silently hitting the
  // wrong resource.
  async function reportMessage(messageId, reason, details) {
    return await _apiFetch('POST', `/api/messaging/messages/${messageId}/report`, { reason, details });
  }

  // ── Pin message in chat ───────────────────────────────────────────────────
  // FIX-404 (unresolved): no backend route exists for per-message pinning
  // (distinct from chat pinning above). Left as-is.
  async function pinMessage(messageId, pin) {
    if (pin === false) {
      return await _apiFetch('DELETE', `/api/messaging/messages/${messageId}/pin`, null);
    }
    return await _apiFetch('POST', `/api/messaging/messages/${messageId}/pin`, {});
  }

  async function getPinnedMessages(chatId) {
    return (await _apiFetch('GET', `/api/messaging/chats/${chatId}/pinned`))?.data?.pinned || [];
  }

  // ── Scheduled messages ────────────────────────────────────────────────────
  // FIX-404 (unresolved): no backend route exists for scheduling a message
  // send (there IS /api/calls/scheduled and /api/status/scheduled, but no
  // message equivalent). Left as-is.
  async function scheduleMessage(chatId, content, type, sendAt, options) {
    return await _apiFetch('POST', '/api/messaging/scheduled', {
      chatId, content, type: type || 'text', sendAt,
      ...options,
    });
  }

  async function getScheduledMessages() {
    return (await _apiFetch('GET', '/api/messaging/scheduled'))?.data?.scheduled || [];
  }

  async function cancelScheduledMessage(id) {
    return await _apiFetch('DELETE', `/api/messaging/scheduled/${id}`, null);
  }

  // ── Disappearing messages ────────────────────────────────────────────────
  // FIX-404 (unresolved): no backend route exists for a per-chat
  // disappearing-message timer. Left as-is.
  async function setDisappearingTimer(chatId, timer) {
    return await _apiFetch('POST', `/api/messaging/chats/${chatId}/disappear`, { timer });
  }

  // ── Search ────────────────────────────────────────────────────────────────
  // FIX-404 (unresolved): no backend route exists for in-chat message
  // search (there is a global /api/search, but nothing scoped to one chat
  // under messages/messaging). Left as-is.
  async function searchMessages(chatId, query, page) {
    return (await _apiFetch('GET', `/api/messaging/chats/${chatId}/search?q=${encodeURIComponent(query)}&page=${page||1}`))?.data?.results || [];
  }

  // ── Mention suggestions ───────────────────────────────────────────────────
  // FIX-404 (unresolved): no backend route exists for @mention
  // autocomplete. Left as-is.
  async function getMentionSuggestions(chatId, q) {
    return (await _apiFetch('GET', `/api/messaging/chats/${chatId}/mentions?q=${encodeURIComponent(q||'')}`))?.data?.members || [];
  }

  // ── Install patches on messagesUI ─────────────────────────────────────────
  function _installPatches(ui) {
    // Override pinChat if it only touches localStorage
    if (!ui._serverSyncInstalled) {
      const origPin = ui.pinChat?.bind(ui);
      ui.pinChat = (chatId, pinned) => pinChat(chatId, pinned);

      const origMute = ui.muteChat?.bind(ui);
      ui.muteChat = (chatId, muted, duration) => muteChat(chatId, muted, duration);

      ui.isChatPinned   = isChatPinned;
      ui.isChatMuted    = isChatMuted;
      ui.starMessage    = starMessage;
      ui.isMessageStarred = isMessageStarred;
      ui.getStarredMessages = getStarredMessages;
      ui.reportMessage  = reportMessage;
      ui.pinMessage     = pinMessage;
      ui.getPinnedMessages = getPinnedMessages;
      ui.scheduleMessage = scheduleMessage;
      ui.getScheduledMessages = getScheduledMessages;
      ui.cancelScheduledMessage = cancelScheduledMessage;
      ui.setDisappearingTimer = setDisappearingTimer;
      ui.searchMessages = searchMessages;
      ui.getMentionSuggestions = getMentionSuggestions;

      ui._serverSyncInstalled = true;
      console.log('[ChatSync] ✅ Patches installed on messagesUI');
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function _init() {
    // Bootstrap in background, non-blocking
    _bootstrap().catch(() => {});

    if (global.messagesUI) {
      _installPatches(global.messagesUI);
    }

    // Also patch when messagesUI is set later
    let _uiVal;
    try {
      Object.defineProperty(global, 'messagesUI', {
        get: () => _uiVal,
        set: (v) => {
          _uiVal = v;
          if (v && typeof v === 'object') _installPatches(v);
        },
        configurable: true,
      });
    } catch (_) {
      // Property already defined — use polling
      let attempts = 0;
      const poll = setInterval(() => {
        if (global.messagesUI && !global.messagesUI._serverSyncInstalled) {
          _installPatches(global.messagesUI);
        }
        if (++attempts > 20) clearInterval(poll);
      }, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  global.KynectaChatSync = {
    pinChat,
    muteChat,
    isChatPinned,
    isChatMuted,
    starMessage,
    isMessageStarred,
    getStarredMessages,
    reportMessage,
    pinMessage,
    getPinnedMessages,
    scheduleMessage,
    getScheduledMessages,
    cancelScheduledMessage,
    setDisappearingTimer,
    searchMessages,
    getMentionSuggestions,
    refresh: _bootstrap,
  };

  console.log('[KynectaChatSync] ✅ Loaded');

})(window);
