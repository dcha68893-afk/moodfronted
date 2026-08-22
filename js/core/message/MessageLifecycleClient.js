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
 * - X3DH bootstrap metadata is repaired onto v3/v4 outgoing envelopes when the
 *   existing pair session contains it. This prevents a sender-side cached
 *   session from producing a ciphertext that the receiver cannot bootstrap.
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
  let cryptoRepairTarget = null;

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

  function currentUserId() {
    if (userId != null) return String(userId);
    const e2e = getE2E();
    try { const id = e2e?.getMyUserId?.(); if (id != null) return String(id); } catch (_) {}
    try { const id = global.SessionManager?.getCurrentUserId?.(); if (id != null) return String(id); } catch (_) {}
    try { const raw = localStorage.getItem('kynecta_auth'); const p = raw ? JSON.parse(raw) : null; const id = p?.user?.id || p?.userId; if (id != null) return String(id); } catch (_) {}
    return null;
  }

  async function readPairBootstrap(peerId) {
    const me = currentUserId();
    if (!me || peerId == null) return null;
    const pair = [String(me), String(peerId)].sort().join(':');
    const key = `kyn_x3dh_sessions_v7_${me}_${pair}`;
    try {
      let raw = localStorage.getItem(key);
      if (!raw) return null;
      const e2e = getE2E();
      if (e2e?.unwrapFromLocalStorage && raw.startsWith('{')) {
        try { raw = await e2e.unwrapFromLocalStorage(raw); } catch (_) {}
      }
      if (typeof raw !== 'string') return null;
      let json = raw;
      try { json = atob(raw); } catch (_) {}
      const state = JSON.parse(json);
      return state?.bootstrap?.x3dh ? state.bootstrap : null;
    } catch (_) {
      return null;
    }
  }

  function installCryptoBootstrapRepair() {
    const e2e = getE2E();
    if (!e2e || typeof e2e.encryptForChat !== 'function') return;
    if (cryptoRepairTarget === e2e && e2e.encryptForChat.__kynectaBootstrapRepair) return;
    const original = e2e.encryptForChat;
    const wrapped = async function (plaintext, chatId, recipientId, opts) {
      const result = await original.call(this, plaintext, chatId, recipientId, opts);
      try {
        if (typeof result !== 'string') return result;
        const env = JSON.parse(result);
        if (!env || ![3, 4].includes(Number(env.v)) || env.x3dh) return result;
        const bootstrap = await readPairBootstrap(recipientId);
        if (!bootstrap) return result;
        env.x3dh = bootstrap;
        console.info('[E2E/X3DH] OUTGOING_BOOTSTRAP_REPAIRED', {
          chatId: String(chatId),
          recipientId: String(recipientId),
          sid: env.sid,
          n: env.n
        });
        return JSON.stringify(env);
      } catch (_) {
        return result;
      }
    };
    Object.defineProperty(wrapped, '__kynectaBootstrapRepair', { value: true, enumerable: false });
    e2e.encryptForChat = wrapped;
    cryptoRepairTarget = e2e;
  }

  function scheduleCryptoRepair() {
    installCryptoBootstrapRepair();
    setTimeout(installCryptoBootstrapRepair, 100);
    setTimeout(installCryptoBootstrapRepair, 1000);
    setTimeout(installCryptoBootstrapRepair, 3000);
  }

  // Every encrypted envelope must enter the same decrypt/retry pipeline.
  // v2 is still present in persisted/legacy traffic (`eph`, `iv`, `ct`) and
  // must never be mistaken for plaintext. v3/v4 use the newer session envelope.
  function isEnvelope(content) {
    if (typeof content !== 'string') return false;
    try {
      const e = JSON.parse(content);
      if (!e || !e.iv || !e.ct) return false;
      const version = Number(e.v);
      if (version === 2) return !!e.eph;
      return (version === 3 || version === 4);
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
              String(userId || currentUserId() || ''),
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

    ack(normalized);

    if (!isEnvelope(normalized.content)) {
      emitUI(normalized, normalized.content);
      return;
    }

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
    socket.on('msg:new', handleIncoming);
    socket.on('msg:sync:result', data => {
      if (Array.isArray(data?.messages)) data.messages.forEach(handleIncoming);
    });
    socket.on('sync:missed_messages_result', data => {
      if (Array.isArray(data?.messages)) data.messages.forEach(handleIncoming);
    });
    socket.on('connect', () => {
      if (boundSocket !== getSocket()) { boundSocket = null; bind(); }
    });
  }

  function resetForAccountSwitch() {
    seen.clear();
    decrypting.clear();
    userId = null;
    cryptoRepairTarget = null;
  }

  async function init(opts = {}) {
    userId = opts.currentUserId || userId || global.__PARENT_SESSION__?.userId || global.parent?.__PARENT_SESSION__?.userId || null;
    if (!db) await openDB();
    scheduleCryptoRepair();
    bind();
  }

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

  global.addEventListener?.('kyn:e2eProvisioned', scheduleCryptoRepair);
  global.addEventListener?.('kyn:e2eUnlocked', scheduleCryptoRepair);
  global.addEventListener?.('kyn:loggedIn', scheduleCryptoRepair);
  try { global.document?.addEventListener('kyn:e2eProvisioned', scheduleCryptoRepair); } catch (_) {}
  try { global.document?.addEventListener('kyn:e2eUnlocked', scheduleCryptoRepair); } catch (_) {}
  try { global.document?.addEventListener('kyn:loggedIn', scheduleCryptoRepair); } catch (_) {}

  init({
    currentUserId: global.__PARENT_SESSION__?.userId || global.parent?.__PARENT_SESSION__?.userId || null
  }).catch(() => bind());

})(typeof window !== 'undefined' ? window : this);
