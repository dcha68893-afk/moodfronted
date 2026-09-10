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

  // FormData is NOT structured-cloneable. message-client.js correctly builds
  // FormData for /files/upload, but its generic iframe API transport then put
  // that FormData inside window.parent.postMessage(), causing:
  // "Failed to execute 'postMessage' ... FormData object could not be cloned."
  // Upload binary data directly from this iframe instead of sending FormData
  // through postMessage. JSON API requests continue using the canonical parent
  // transport. This also preserves the File object and multipart boundaries
  // generated by the browser.
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
    installAttachmentUploadFix();
    pollUntilReady(Date.now());
    const retry = () => installAttachmentUploadFix();
    global.addEventListener('load', retry, { once:true });
    const timerId = setInterval(() => {
      if (installAttachmentUploadFix()) clearInterval(timerId);
    }, 250);
    setTimeout(() => clearInterval(timerId), MAX_WAIT_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})(window);
