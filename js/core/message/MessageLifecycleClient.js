/**
 * MessageLifecycleClient.js
 * Canonical message transport/persistence bridge.
 * Existing-file repair: incoming encrypted envelopes are never rendered as
 * plaintext UI content; they are decrypted through the existing E2E transport
 * before render, while delivery ACK remains independent from read receipts.
 */
(function (global) {
  'use strict';

  const DB_NAME = 'nexopa_message_lifecycle_v1';
  const DB_VERSION = 1;
  const STORE_OUTGOING = 'outgoing_queue';
  const STORE_MESSAGES = 'messages';
  const STORE_SYNC_STATE = 'sync_state';
  const RETRY_BACKOFF_MS = [500, 1000, 2000, 5000, 10000, 20000, 30000];
  const MAX_RETRY_ATTEMPTS = 50;

  let db = null;
  let currentUserId = null;
  let socketBindAttempts = 0;
  const mem = { outgoing: new Map(), messages: new Map(), sync: new Map() };
  const seenServerIds = new Set();
  const decryptInFlight = new Map();

  function mapFor(store) {
    return store === STORE_OUTGOING ? mem.outgoing : store === STORE_MESSAGES ? mem.messages : mem.sync;
  }

  function openDB() {
    return new Promise(resolve => {
      if (!global.indexedDB) return resolve(null);
      const req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_OUTGOING)) d.createObjectStore(STORE_OUTGOING, { keyPath: 'clientMessageId' });
        if (!d.objectStoreNames.contains(STORE_MESSAGES)) {
          const s = d.createObjectStore(STORE_MESSAGES, { keyPath: 'clientMessageId' });
          s.createIndex('chatId', 'chatId', { unique: false });
          s.createIndex('serverId', 'serverId', { unique: false });
        }
        if (!d.objectStoreNames.contains(STORE_SYNC_STATE)) d.createObjectStore(STORE_SYNC_STATE, { keyPath: 'chatId' });
      };
      req.onsuccess = e => {
        const d = e.target.result;
        d.onversionchange = () => { try { d.close(); } catch (_) {} if (db === d) db = null; };
        resolve(d);
      };
      req.onerror = () => resolve(null);
    });
  }

  function put(store, value) {
    return new Promise(resolve => {
      if (!db) { mapFor(store).set(store === STORE_SYNC_STATE ? value.chatId : value.clientMessageId, value); return resolve(true); }
      try {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  function del(store, key) {
    return new Promise(resolve => {
      if (!db) { mapFor(store).delete(key); return resolve(true); }
      try {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  function all(store) {
    return new Promise(resolve => {
      if (!db) return resolve(Array.from(mapFor(store).values()));
      try {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
  }

  function get(store, key) {
    return new Promise(resolve => {
      if (!db) return resolve(mapFor(store).get(key) || null);
      try {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  function resetForAccountSwitch() {
    try { if (db) db.close(); } catch (_) {}
    db = null;
    currentUserId = null;
    mem.outgoing.clear(); mem.messages.clear(); mem.sync.clear();
    seenServerIds.clear(); decryptInFlight.clear();
  }
  global.addEventListener?.('kyn:accountSwitchWipe', resetForAccountSwitch);

  function getSocket() {
    try { if (global.KynectaRealtime?._socket) return global.KynectaRealtime._socket; } catch (_) {}
    try { if (global.parent?.KynectaRealtime?._socket) return global.parent.KynectaRealtime._socket; } catch (_) {}
    try { if (global.top?.KynectaRealtime?._socket) return global.top.KynectaRealtime._socket; } catch (_) {}
    return null;
  }

  function isEncryptedEnvelope(content) {
    if (typeof content !== 'string') return false;
    try { const e = JSON.parse(content); return !!e && [3, 4].includes(Number(e.v)) && !!e.iv && !!e.ct; } catch (_) { return false; }
  }

  function isUsablePlaintext(text) {
    if (typeof text !== 'string' || !text.length) return false;
    return !/^\[(?:Decryption failed|Encrypted message|Encrypted message —|Decryption unavailable)/i.test(text);
  }

  function emitRender(message, content) {
    try {
      global.document.dispatchEvent(new CustomEvent('message:new', { detail: {
        id: message.serverId,
        chatId: message.chatId,
        conversationId: message.chatId,
        senderId: message.senderId,
        content,
        type: message.type || 'text',
        sender: message.sender || null,
        replyToId: message.replyToId || null,
        createdAt: message.createdAt,
        sentAt: message.sentAt,
        deliveredAt: message.deliveredAt || null,
        _source: 'MessageLifecycleClient',
      }}));
    } catch (_) {}
  }

  function emitStatus(clientMessageId, serverId, chatId, status) {
    try { global.document.dispatchEvent(new CustomEvent('message:status', { detail: { clientMessageId, serverId, chatId, status } })); } catch (_) {}
  }

  async function decryptForRender(message) {
    if (!isEncryptedEnvelope(message.content)) return message.content;
    const key = `${message.serverId}:${message.chatId}:${message.senderId}`;
    if (decryptInFlight.has(key)) return decryptInFlight.get(key);

    const work = (async () => {
      const e2e = global.KynectaE2E;
      if (!e2e) throw new Error('E2E transport unavailable');

      // Prefer the canonical display API because it is wired to the existing
      // pending-decrypt queue. If it returns a placeholder while keys/session
      // are being prepared, fall through to direct decrypt retries instead of
      // ever rendering the encrypted envelope.
      if (typeof e2e.decryptFromChat === 'function') {
        for (let i = 0; i < RETRY_BACKOFF_MS.length; i++) {
          try {
            const plain = await e2e.decryptFromChat(message.content, message.chatId, String(message.senderId));
            if (isUsablePlaintext(plain)) return plain;
          } catch (_) {}
          if (i < RETRY_BACKOFF_MS.length - 1) await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS[i]));
        }
      }

      if (typeof e2e.decryptMessageForDisplay === 'function') {
        try {
          const plain = await e2e.decryptMessageForDisplay(message, message.chatId, String(currentUserId), {
            activeConversation: { chatId: message.chatId, peerUserId: message.senderId },
            fallbackText: 'New message received',
            onResolved: text => { if (isUsablePlaintext(text)) emitRender(message, text); },
          });
          if (isUsablePlaintext(plain)) return plain;
        } catch (_) {}
      }
      throw new Error('decryption pending');
    })();

    decryptInFlight.set(key, work);
    try { return await work; } finally { decryptInFlight.delete(key); }
  }

  async function renderIncoming(message) {
    try {
      const plain = await decryptForRender(message);
      emitRender(message, plain);
      return true;
    } catch (_) {
      // Never expose ciphertext as message content. Keep the encrypted record
      // persisted and retry when E2E keys/session become available.
      const retryEvents = ['kyn:e2eUnlocked', 'kyn:e2eKeyAvailable'];
      const retry = () => { renderIncoming(message).catch(() => {}); };
      retryEvents.forEach(ev => global.addEventListener?.(ev, retry, { once: true }));
      setTimeout(() => renderIncoming(message).catch(() => {}), 3000);
      return false;
    }
  }

  async function updateSyncState(chatId, serverId) {
    if (chatId == null || serverId == null) return;
    const old = await get(STORE_SYNC_STATE, chatId);
    if (!old || Number(serverId) > Number(old.lastServerId || 0)) await put(STORE_SYNC_STATE, { chatId, lastServerId: serverId, updatedAt: Date.now() });
  }

  async function handleIncoming(payload) {
    if (!payload || payload.serverId == null) return;
    const id = String(payload.serverId);
    if (seenServerIds.has(id)) return;
    seenServerIds.add(id);

    const record = {
      clientMessageId: 'srv_' + id,
      serverId: payload.serverId,
      chatId: payload.chatId,
      senderId: payload.senderId,
      content: payload.content,
      type: payload.type || 'text',
      sender: payload.sender || null,
      replyToId: payload.replyToId || null,
      createdAt: payload.createdAt,
      sentAt: payload.sentAt,
      status: 'delivered',
    };

    await put(STORE_MESSAGES, record);
    await updateSyncState(record.chatId, record.serverId);

    // Delivery means the receiver accepted/persisted the encrypted envelope.
    // It does NOT mean the user read the message. Read is sent separately.
    const socket = getSocket();
    if (socket?.connected) socket.emit('msg:delivered_ack', { serverId: record.serverId, chatId: record.chatId });

    await renderIncoming(record);
  }

  function genId() {
    return global.crypto?.randomUUID ? 'cm_' + global.crypto.randomUUID() : 'cm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }

  async function encryptOutgoing(content, chatId, receiverId) {
    if (!receiverId || !global.KynectaE2E?.encryptForChat) return content;
    if (isEncryptedEnvelope(content)) return content;
    // Never send plaintext merely because the E2E bootstrap is still loading.
    // encryptForChat is the existing gate and throws/blocks until the secure
    // transport is ready.
    return global.KynectaE2E.encryptForChat(content, chatId, String(receiverId));
  }

  async function sendMessage(chatId, content, type = 'text', extra = {}) {
    const clientMessageId = genId();
    const receiverId = extra.receiverId || null;
    const encrypted = await encryptOutgoing(content, chatId, receiverId);
    const item = { clientMessageId, chatId: chatId || null, receiverId, senderId: currentUserId, content: encrypted, type, replyToId: extra.replyToId || null, status: 'pending', attempts: 0, createdAt: new Date().toISOString(), serverId: null };
    if (!item.chatId && !item.receiverId) throw new Error('MessageLifecycleClient.sendMessage requires chatId or receiverId');
    await put(STORE_MESSAGES, item); await put(STORE_OUTGOING, item);
    attemptSend(item).catch(() => scheduleRetry(item));
    return clientMessageId;
  }

  async function attemptSend(item) {
    const socket = getSocket();
    const payload = { chatId: item.chatId || undefined, receiverId: item.chatId ? undefined : item.receiverId, content: item.content, type: item.type, clientMessageId: item.clientMessageId, replyToId: item.replyToId };
    const finish = async result => {
      if (!result?.ok) return scheduleRetry(item);
      item.status = result.status || 'sent'; item.serverId = result.serverId;
      if (!item.chatId && result.chatId) item.chatId = result.chatId;
      await del(STORE_OUTGOING, item.clientMessageId); await put(STORE_MESSAGES, item);
      emitStatus(item.clientMessageId, item.serverId, item.chatId, item.status);
    };
    if (socket?.connected) {
      let done = false;
      await new Promise(resolve => {
        const timer = setTimeout(() => { if (!done) { done = true; resolve(finish({ ok: false, reason: 'timeout' })); } }, 8000);
        try {
          socket.emit('msg:send', payload, ack => { if (done) return; done = true; clearTimeout(timer); resolve(finish(ack)); });
        } catch (_) { if (!done) { done = true; clearTimeout(timer); resolve(finish({ ok: false, reason: 'emit_failed' })); } }
      });
    } else {
      const base = (global.__kynAPI?.baseUrl || global.BACKEND_URL || '').replace(/\/$/, '');
      const token = global.__kynToken || global.__accessToken || global.accessToken || '';
      try {
        const r = await fetch(base + '/api/messages/lifecycle/send', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(payload) });
        if (!r.ok) return scheduleRetry(item);
        const d = await r.json(); await finish({ ok: true, serverId: d.serverId, chatId: d.chatId, status: d.status });
      } catch (_) { scheduleRetry(item); }
    }
  }

  function scheduleRetry(item) {
    item.attempts = (item.attempts || 0) + 1;
    put(STORE_OUTGOING, item);
    if (item.attempts > MAX_RETRY_ATTEMPTS) return;
    const delay = RETRY_BACKOFF_MS[Math.min(item.attempts - 1, RETRY_BACKOFF_MS.length - 1)];
    setTimeout(() => attemptSend(item).catch(() => scheduleRetry(item)), delay);
  }

  async function flushOutgoingQueue() { (await all(STORE_OUTGOING)).forEach(item => attemptSend(item).catch(() => scheduleRetry(item))); }

  async function requestSync() {
    const socket = getSocket(); if (!socket?.connected) return;
    const chats = (await all(STORE_SYNC_STATE)).map(s => ({ chatId: s.chatId, sinceId: s.lastServerId }));
    if (chats.length) socket.emit('msg:sync', { chats });
  }

  function handleSyncResult({ messages } = {}) {
    if (!Array.isArray(messages)) return;
    messages.forEach(m => handleIncoming({ serverId: m.id, chatId: m.chatId, senderId: m.senderId, content: m.content, type: m.type, sender: m.senderUsername ? { username: m.senderUsername, avatar: m.senderAvatar } : null, replyToId: m.replyToId, createdAt: m.createdAt, sentAt: m.sentAt }));
  }

  function sendViaSocket(payload, timeoutMs = 6000) {
    return new Promise(resolve => {
      const socket = getSocket();
      if (!socket?.connected) return resolve({ ok: false, reason: 'no_socket' });
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, reason: 'timeout' }); } }, timeoutMs);
      try { socket.emit('msg:send', payload, ack => { if (done) return; done = true; clearTimeout(timer); resolve(ack || { ok: false, reason: 'empty_ack' }); }); }
      catch (e) { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, reason: e?.message || 'emit_failed' }); } }
    });
  }

  function markRead(chatId, messageIds) {
    const socket = getSocket();
    if (socket?.connected && Array.isArray(messageIds) && messageIds.length) socket.emit('msg:read', { chatId, messageIds });
  }

  function bindSocketListeners() {
    const socket = getSocket();
    if (!socket) { if (++socketBindAttempts < 100) setTimeout(bindSocketListeners, 300); return; }
    if (socket.__msgLifecycleClientBound) return;
    socket.__msgLifecycleClientBound = true;
    socket.on('msg:new', handleIncoming);
    socket.on('msg:delivered', ({ serverId, chatId }) => emitStatus(null, serverId, chatId, 'delivered'));
    socket.on('msg:read', ({ chatId, messageIds }) => (messageIds || []).forEach(id => emitStatus(null, id, chatId, 'read')));
    socket.on('msg:sync:result', handleSyncResult);
    socket.on('sync:missed_messages_result', handleSyncResult);
    socket.on('connect', () => { flushOutgoingQueue(); requestSync(); });
    if (socket.connected) { flushOutgoingQueue(); requestSync(); }
  }

  async function init(opts = {}) {
    currentUserId = opts.currentUserId || currentUserId;
    if (!db) db = await openDB();
    bindSocketListeners();
  }

  global.MessageLifecycleClient = { init, sendMessage, sendViaSocket, markRead, requestSync, resetForAccountSwitch, _internal: { getSocket, flushOutgoingQueue } };
})(typeof window !== 'undefined' ? window : this);
