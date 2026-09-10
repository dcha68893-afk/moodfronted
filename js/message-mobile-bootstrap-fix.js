/*
 * message-mobile-bootstrap-fix.js
 *
 * Mobile/slow-frame fallback for the Messages iframe. The canonical
 * message-client owns state, networking and crypto; this file only prevents
 * the mobile shell from looking empty when message-client.js started before
 * the parent API/session bootstrap was ready.
 *
 * It deliberately does NOT decrypt previews and never renders ciphertext.
 * Opening a conversation always returns to MessageModule.openChat(), which
 * remains the single authoritative history/decryption pipeline.
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

  function esc(value) {
    return value == null ? '' : String(value);
  }

  function previewFor(chat) {
    const last = Array.isArray(chat?.chatMessages) ? chat.chatMessages[0] : null;
    if (!last) return 'No messages yet';
    if (last.deleted) return 'This message was deleted';
    if (last.type && last.type !== 'text') return `📎 ${last.type}`;
    // The server only has ciphertext for E2E messages. Never expose that
    // envelope as if it were user text in a sidebar preview.
    return '🔒 Encrypted message';
  }

  function renderFallback() {
    const list = document.getElementById('convList');
    if (!list || !fallbackChats.length) return;

    // If the canonical module has already populated the sidebar, leave it
    // alone. This fallback is only for the genuinely empty bootstrap state.
    const canonical = global.MessageModule?.getConversations?.() || [];
    if (canonical.length >= fallbackChats.length) return;

    const fragment = document.createDocumentFragment();
    fallbackChats.forEach((chat) => {
      if (!chat || chat.type !== 'direct' || !chat.otherParticipant) return;
      const row = document.createElement('div');
      row.className = 'conv-item';
      row.dataset.chatId = String(chat.id);

      const avatar = document.createElement('img');
      avatar.className = 'conv-avatar';
      avatar.alt = '';
      avatar.src = chat.otherParticipant.avatar || '';
      avatar.onerror = () => { avatar.style.visibility = 'hidden'; };

      const meta = document.createElement('div');
      meta.className = 'conv-meta';
      const name = document.createElement('div');
      name.className = 'conv-name';
      name.textContent = chat.otherParticipant.displayName || chat.otherParticipant.username || 'Conversation';
      const preview = document.createElement('div');
      preview.className = 'conv-preview';
      preview.textContent = previewFor(chat);
      meta.appendChild(name);
      meta.appendChild(preview);

      if (Number(chat.unreadCount) > 0) {
        const badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = String(chat.unreadCount);
        row.appendChild(avatar);
        row.appendChild(meta);
        row.appendChild(badge);
      } else {
        row.appendChild(avatar);
        row.appendChild(meta);
      }

      row.addEventListener('click', () => {
        global.MessageModule?.openChat?.({
          conversationId: Number(chat.id),
          userId: chat.otherParticipant.id,
          userName: chat.otherParticipant.displayName || chat.otherParticipant.username || null,
          avatar: chat.otherParticipant.avatar || null,
        });
      });
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
      const chats = Array.isArray(res.data?.chats) ? res.data.chats : [];
      fallbackChats = chats.filter(c => c && c.type === 'direct' && c.otherParticipant);
      renderFallback();
      return fallbackChats.length > 0;
    } catch (_) {
      return false;
    }
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  async function pollUntilReady(startedAt) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      stop();
      return;
    }
    const mm = global.MessageModule;
    if (!mm) {
      timer = setTimeout(() => pollUntilReady(startedAt), POLL_MS);
      return;
    }

    const canonical = mm.getConversations?.() || [];
    if (canonical.length > 0) {
      // The normal message-client pipeline has won the race.
      stop();
      return;
    }

    const loaded = await fetchChats();
    if (!loaded) {
      timer = setTimeout(() => pollUntilReady(startedAt), POLL_MS);
      return;
    }

    // Keep a short reconciliation window. message-client may populate its
    // authoritative state a moment later; once it does, this fallback exits.
    timer = setTimeout(() => pollUntilReady(startedAt), 1000);
  }

  // Cross-module open contract hardening.
  //
  // Friends, Calls and Status can legitimately open a person who is NOT yet
  // a friend. The parent shell already forwards OPEN_CHAT_WITH_USER, but a
  // message iframe can receive that event before message-client.js has
  // finished booting, or another legacy listener can consume it without
  // reaching the canonical module. Capture the event here and queue the
  // latest target until MessageModule exists. We then call ONLY the
  // canonical openChat() implementation; this does not create a second chat
  // resolver or a second crypto pipeline.
  //
  // This also makes the behavior explicit: friendship is not a prerequisite
  // for opening a direct chat. The backend remains authoritative for blocks,
  // authorization and conversation creation.
  let pendingCrossModuleOpen = null;
  let crossModuleOpenTimer = null;

  function openCrossModuleTarget(payload) {
    const p = payload || {};
    const targetUserId = p.userId ?? p.recipientId ?? p.targetUserId;
    const conversationId = p.conversationId ?? p.chatId ?? null;
    if (targetUserId == null && conversationId == null) return false;

    pendingCrossModuleOpen = {
      userId: targetUserId,
      conversationId,
      messageId: p.messageId ?? null,
      userName: p.userName || p.recipientName || p.name || null,
      avatar: p.avatar || p.recipientAvatar || null,
    };

    const attempt = () => {
      const mm = global.MessageModule;
      if (!mm || typeof mm.openChat !== 'function') {
        crossModuleOpenTimer = setTimeout(attempt, POLL_MS);
        return;
      }

      const target = pendingCrossModuleOpen;
      pendingCrossModuleOpen = null;
      crossModuleOpenTimer = null;

      Promise.resolve(mm.openChat({
        conversationId: target.conversationId,
        userId: target.userId,
        messageId: target.messageId,
        userName: target.userName,
        avatar: target.avatar,
      })).catch((err) => {
        // openChat owns its user-visible failure event. Do not emit a second
        // error or retry storm from this bridge.
        console.warn('[MessagesCrossModuleOpen] canonical openChat failed:', err?.message || err);
      });
    };

    if (crossModuleOpenTimer) clearTimeout(crossModuleOpenTimer);
    attempt();
    return true;
  }

  // Capture first so a legacy/broken listener cannot silently consume the
  // cross-module request before the canonical MessageModule sees it.
  global.addEventListener('message', (event) => {
    const data = event?.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'OPEN_CHAT_WITH_USER') return;
    if (event.source === global) return;

    const payload = data.payload || data;
    if (openCrossModuleTarget(payload)) {
      event.stopImmediatePropagation();
    }
  }, true);

  function start() {
    if (started) return;
    started = true;
    pollUntilReady(Date.now());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(window);
