/**
 * chat-sync.js — Server-synced pinned chats, mute, and starred messages
 *
 * Audit findings replaced:
 *  - kyn_pinned_chats_v1 localStorage key used in messages-ui.js (lines 4310, 4497)
 *    → now syncs with PUT /api/messaging/chats/:chatId/pin on server
 *  - isMuted stored in localStorage only
 *    → now syncs with PUT /api/messaging/chats/:chatId/mute on server
 *  - Starred messages only in IndexedDB
 *    → now syncs with POST /api/messaging/messages/:id/star
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
    // Pinned chats
    const pinRes = await _apiFetch('GET', '/api/messaging/chats/pinned');
    if (pinRes && pinRes.data && Array.isArray(pinRes.data.pinned)) {
      pinRes.data.pinned.forEach(id => _pinnedSet.add(String(id)));
      // Seed localStorage so existing messages-ui.js code that reads kyn_pinned_chats_v1 still works
      try {
        localStorage.setItem('kyn_pinned_chats_v1', JSON.stringify([...pinRes.data.pinned]));
      } catch (_) {}
    }

    // Starred messages
    const starRes = await _apiFetch('GET', '/api/messaging/messages/starred');
    if (starRes && starRes.data && Array.isArray(starRes.data.starred)) {
      starRes.data.starred.forEach(m => _starredSet.add(String(m.messageId)));
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

    // Sync to server
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

    // Sync to server
    await _apiFetch('PUT', `/api/messaging/chats/${chatId}/mute`, { muted, duration });

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

    if (starred) {
      _starredSet.add(mid);
      await _apiFetch('POST', `/api/messaging/messages/${messageId}/star`, {});
    } else {
      _starredSet.delete(mid);
      await _apiFetch('DELETE', `/api/messaging/messages/${messageId}/star`, null);
    }

    // Dispatch event so UI can update star indicator
    window.dispatchEvent(new CustomEvent('kyn:starChanged', { detail: { messageId, starred } }));
    return starred;
  }

  function isMessageStarred(messageId) {
    return _starredSet.has(String(messageId));
  }

  async function getStarredMessages() {
    const res = await _apiFetch('GET', '/api/messaging/messages/starred');
    return res?.data?.starred || [];
  }

  // ── Report message ────────────────────────────────────────────────────────
  async function reportMessage(messageId, reason, details) {
    return await _apiFetch('POST', `/api/messaging/messages/${messageId}/report`, { reason, details });
  }

  // ── Pin message in chat ───────────────────────────────────────────────────
  async function pinMessage(messageId, pin) {
    if (pin === false) {
      return await _apiFetch('DELETE', `/api/messaging/messages/${messageId}/pin`, null);
    }
    return await _apiFetch('POST', `/api/messaging/messages/${messageId}/pin`, {});
  }

  async function getPinnedMessages(chatId) {
    const res = await _apiFetch('GET', `/api/messaging/chats/${chatId}/pinned`);
    return res?.data?.pinned || [];
  }

  // ── Scheduled messages ────────────────────────────────────────────────────
  async function scheduleMessage(chatId, content, type, sendAt, options) {
    return await _apiFetch('POST', '/api/messaging/scheduled', {
      chatId, content, type: type || 'text', sendAt,
      ...options,
    });
  }

  async function getScheduledMessages() {
    const res = await _apiFetch('GET', '/api/messaging/scheduled');
    return res?.data?.scheduled || [];
  }

  async function cancelScheduledMessage(id) {
    return await _apiFetch('DELETE', `/api/messaging/scheduled/${id}`, null);
  }

  // ── Disappearing messages ────────────────────────────────────────────────
  async function setDisappearingTimer(chatId, timer) {
    return await _apiFetch('POST', `/api/messaging/chats/${chatId}/disappear`, { timer });
  }

  // ── Search ────────────────────────────────────────────────────────────────
  async function searchMessages(chatId, query, page) {
    const res = await _apiFetch('GET', `/api/messaging/chats/${chatId}/search?q=${encodeURIComponent(query)}&page=${page||1}`);
    return res?.data?.results || [];
  }

  // ── Mention suggestions ───────────────────────────────────────────────────
  async function getMentionSuggestions(chatId, q) {
    const res = await _apiFetch('GET', `/api/messaging/chats/${chatId}/mentions?q=${encodeURIComponent(q||'')}`);
    return res?.data?.members || [];
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
