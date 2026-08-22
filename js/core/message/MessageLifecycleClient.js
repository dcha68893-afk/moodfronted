/**
 * MessageLifecycleClient.js
 * Canonical realtime receive bridge for the Messages iframe.
 *
 * IMPORTANT:
 * - The server's canonical event is `msg:new`.
 * - Delivery ACK is receipt/persistence, NOT read and NOT dependent on the chat
 *   panel being open.
 * - Ciphertext is never rendered. Decryption is allowed to complete/retry after
 *   the encrypted envelope has been durably accepted.
 * - The E2E service may live in the parent chat shell; same-origin parent access
 *   is therefore part of the receive path.
 */
(function (global) {
  'use strict';

  const DB_NAME = 'nexopa_message_lifecycle_v1';
  const DB_VERSION = 1;
  const STORE_MESSAGES = 'messages';
  const STORE_OUTGOING = 'outgoing_queue';
  const STORE_SYNC = 'sync_state';
  const RETRIES = [500, 1000, 2000, 5000, 10000, 20000, 30000];
  const seen = new Set();
  const decrypting = new Map();
  let db = null;
  let userId = null;
  let boundSocket = null;

  function openDB() {
    return new Promise(resolve => {
      if (!global.indexedDB) return resolve(null);
      try {
        const req = global.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
          const d = e.target.result;
          if (!d.objectStoreNames.contains(STORE_MESSAGES)) {
            const s = d.createObjectStore(STORE_MESSAGES, { keyPath: 'clientMessageId' });
            s.createIndex('chatId', 'chatId', { unique: false });
            s.createIndex('serverId', 'serverId', { unique: false });
          }
          if (!d.objectStoreNames.contains(STORE_OUTGOING)) d.createObjectStore(STORE_OUTGOING, { keyPath: 'clientMessageId' });
          if (!d.objectStoreNames.contains(STORE_SYNC)) d.createObjectStore(STORE_SYNC, { keyPath: 'chatId' });
        };
        req.onsuccess = e => { db = e.target.result; resolve(db); };
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  function put(store, value) {
    return new Promise(resolve => {
      if (!db) return resolve(true);
      try {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  function getE2E() {
    try { if (global.KynectaE2E) return global.KynectaE2E; } catch (_) {}
    try { if (global.parent && global.parent.KynectaE2E) return global.parent.KynectaE2E; } catch (_) {}
    try { if (global.top && global.top.KynectaE2E) return global.top.KynectaE2E; } catch (_) {}
    return null;
  }

  function getSocket() {
    try { if (global.KynectaRealtime && global.KynectaRealtime._socket) return global.KynectaRealtime._socket; } catch (_) {}
    try { if (global.parent && global.parent.KynectaRealtime && global.parent.KynectaRealtime._socket) return global.parent.KynectaRealtime._socket; } catch (_) {}
    try { if (global.top && global.top.KynectaRealtime && global.top.KynectaRealtime._socket) return global.top.KynectaRealtime._socket; } catch (_) {}
    return null;
  }

  function isEnvelope(content) {
    if (typeof content !== 'string') return false;
    try {
      const e = JSON.parse(content);
      return !!e && (Number(e.v) === 3 || Number(e.v) === 4) && !!e.iv && !!e.ct;
    } catch (_) { return false; }
  }

  function plaintextOK(text) {
    return typeof text === 'string' && text.length > 0 &&
      !/^\s*(?:🔒\s*)?(?:Encrypted message|Decryption failed|Decryption unavailable)/i.test(text);
  }

  function emitUI(message, plaintext) {
    if (!plaintextOK(plaintext)) return;
    const out = {
      ...message,
      content: plaintext,
      encrypted: false,
      status: message.status || 'delivered'
    };
    try { global.document.dispatchEvent(new CustomEvent('message:new', { detail: out })); } catch (_) {}
    try { global.dispatchEvent(new CustomEvent('message:new', { detail: out })); } catch (_) {}
    try { global.dispatchEvent(new CustomEvent('newMessage', { detail: { message: out } })); } catch (_) {}
  }

  function ack(payload) {
    const socket = getSocket();
    if (!socket || !socket.connected) return false;
    try {
      socket.emit('msg:delivered_ack', {
        serverId: payload.serverId,
        chatId: payload.chatId
      });
      return true;
    } catch (_) { return false; }
  }

  async function decryptAndRender(message) {
    const key = `${message.chatId}:${message.serverId || message.localId || ''}`;
    if (decrypting.has(key)) return decrypting.get(key);

    const work = (async () => {
      for (let attempt = 0; attempt < RETRIES.length; attempt++) {
        const e2e = getE2E();
        if (e2e && typeof e2e.decryptMessageForDisplay === 'function') {
          let resolved = false;
          try {
            const plain = await e2e.decryptMessageForDisplay(
              message,
              String(message.chatId),
              String(userId || ''),
              {
                fallbackText: '🔒 Encrypted message',
                onResolved: text => {
                  if (!resolved && plaintextOK(text)) {
                    resolved = true;
                    emitUI(message, text);
                    persistPlaintext(message, text);
                  }
                }
              }
            );
            if (plaintextOK(plain)) {
              resolved = true;
              emitUI(message, plain);
              await persistPlaintext(message, plain);
              return true;
            }
            // A placeholder means the canonical E2E retry queue owns the next
            // attempt. We still retry here so a cold first-contact session cannot
            // remain permanently stuck if no E2E event fires.
          } catch (_) {}
        }
        if (attempt < RETRIES.length - 1) await new Promise(r => setTimeout(r, RETRIES[attempt]));
      }
      return false;
    })();

    decrypting.set(key, work);
    try { return await work; } finally { decrypting.delete(key); }
  }

  async function persistPlaintext(message, plaintext) {
    try {
      if (global.KynectaLocalStore && typeof global.KynectaLocalStore.saveMessage === 'function') {
        await global.KynectaLocalStore.saveMessage({
          serverId: String(message.serverId || message.id || ''),
          chatId: String(message.chatId),
          conversationId: String(message.chatId),
          senderId: message.senderId,
          content: plaintext,
          type: message.type || 'text',
          sender: message.sender || null,
          replyToId: message.replyToId || null,
          createdAt: message.createdAt || Date.now(),
          status: 'delivered',
          isLocalOnly: false
        });
      }
    } catch (_) {}
  }

  async function handleIncoming(raw) {
    if (!raw) return;
    const message = raw.payload && (raw.payload.chatId || raw.payload.id || raw.payload.serverId)
      ? raw.payload
      : raw;
    const chatId = message.chatId || message.conversationId;
    const serverId = message.serverId ?? message.id;
    if (chatId == null || serverId == null) return;

    const dedup = `${chatId}:${serverId}`;
    if (seen.has(dedup)) return;
    seen.add(dedup);
    setTimeout(() => seen.delete(dedup), 60000);

    const normalized = {
      id: serverId,
      serverId,
      chatId: String(chatId),
      conversationId: String(chatId),
      senderId: message.senderId || message.sender?.id,
      sender: message.sender || null,
      content: message.content ?? message.text ?? message.body ?? '',
      type: message.type || 'text',
      replyToId: message.replyToId || null,
      replyTo: message.replyTo || null,
      createdAt: message.createdAt || message.sentAt || new Date().toISOString(),
      sentAt: message.sentAt || message.createdAt || null,
      status: 'delivered'
    };

    // Persist the encrypted envelope before ACK. Delivery therefore means the
    // receiver accepted the message, never that the user opened/read it.
    await put(STORE_MESSAGES, {
      clientMessageId: `srv_${serverId}`,
      ...normalized,
      isLocalOnly: false
    });
    try {
      if (global.KynectaLocalStore && typeof global.KynectaLocalStore.saveMessage === 'function') {
        await global.KynectaLocalStore.saveMessage({ ...normalized, serverId: String(serverId), isLocalOnly: false });
      }
    } catch (_) {}

    // ACK immediately after durable acceptance. This is the server's canonical
    // msg:delivered_ack path and clears WSService's delivery timer.
    ack(normalized);

    if (!isEnvelope(normalized.content)) {
      emitUI(normalized, normalized.content);
      return;
    }

    // Never emit the ciphertext as UI content. Decrypt through the same E2E
    // implementation that created the v3/v4 envelope, including the parent
    // chat-shell instance when this iframe has no local E2E singleton.
    await decryptAndRender(normalized);
  }

  function bind() {
    const socket = getSocket();
    if (!socket) {
      setTimeout(bind, 300);
      return;
    }
    if (boundSocket === socket) return;
    boundSocket = socket;

    // Canonical server event. This was the missing first-contact receive path:
    // the previous bootstrap explicitly removed MessageLifecycleClient.init(),
    // so this listener was never installed even though the file was loaded.
    socket.on('msg:new', handleIncoming);
    socket.on('msg:sync:result', data => {
      if (Array.isArray(data?.messages)) data.messages.forEach(handleIncoming);
    });
    socket.on('sync:missed_messages_result', data => {
      if (Array.isArray(data?.messages)) data.messages.forEach(handleIncoming);
    });
    socket.on('connect', () => {
      // Rebind only if another socket instance replaced the singleton.
      if (boundSocket !== getSocket()) { boundSocket = null; bind(); }
    });
  }

  function resetForAccountSwitch() {
    seen.clear();
    decrypting.clear();
    userId = null;
  }

  async function init(opts = {}) {
    userId = opts.currentUserId || userId || global.__PARENT_SESSION__?.userId || global.parent?.__PARENT_SESSION__?.userId || null;
    if (!db) await openDB();
    bind();
  }

  // Preserve the public surface used by the existing application.
  async function sendMessage(chatId, content, type = 'text', extra = {}) {
    throw new Error('MessageLifecycleClient.sendMessage is not the active send authority; use messages-core/messages-ui send path');
  }
  function sendViaSocket(payload, timeoutMs = 6000) {
    return new Promise(resolve => {
      const socket = getSocket();
      if (!socket?.connected) return resolve({ ok: false, reason: 'no_socket' });
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, reason: 'timeout' }); } }, timeoutMs);
      try {
        socket.emit('msg:send', payload, ackData => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(ackData || { ok: false, reason: 'empty_ack' });
        });
      } catch (e) {
        if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, reason: e?.message || 'emit_failed' }); }
      }
    });
  }
  function markRead(chatId, messageIds) {
    const socket = getSocket();
    if (socket?.connected) socket.emit('msg:read', { chatId, messageIds: Array.isArray(messageIds) ? messageIds : [] });
  }
  function requestSync() {
    const socket = getSocket();
    if (socket?.connected) socket.emit('msg:sync', { chats: [] });
  }

  global.MessageLifecycleClient = {
    init,
    sendMessage,
    sendViaSocket,
    markRead,
    requestSync,
    resetForAccountSwitch,
    _internal: { getSocket, handleIncoming }
  };

  // The old bootstrap intentionally removed this init call, leaving the file
  // loaded but inert. The receive authority must be live for the entire
  // Messages iframe lifetime, not only after a chat-history navigation.
  init({
    currentUserId: global.__PARENT_SESSION__?.userId || global.parent?.__PARENT_SESSION__?.userId || null
  }).catch(() => bind());

})(typeof window !== 'undefined' ? window : this);
