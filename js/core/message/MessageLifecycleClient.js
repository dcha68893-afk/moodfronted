/**
 * MessageLifecycleClient.js
 * -----------------------------------------------------------------------
 * MESSAGE LIFECYCLE REBUILD (messages-only scope, added 2026-07-26).
 *
 * A new, additive, self-contained module implementing the full Signal-style
 * message lifecycle end to end:
 *
 *   type -> save locally (PENDING) -> render optimistically -> queue
 *   -> send (socket, REST fallback) -> SENT (server id assigned)
 *   -> DELIVERED (recipient ack)   -> READ (chat opened)
 *
 * and, symmetrically on the receiving side:
 *
 *   msg:new -> dedupe by serverId -> store locally -> render -> ack delivery
 *
 * WHAT THIS DOES *NOT* TOUCH
 * ---------------------------
 * Per agreed scope, this does not remove, disable, or rewrite the existing
 * iframe relay / dedup-claim system (app.realtime.socket.js,
 * messages-core.ui-bridge.js, mesh-messages-bridge.js, phase15.delivery.patch.js).
 * That system is shared with calls/groups/games and is left exactly as-is.
 *
 * WHY THIS FIXES "MESSAGE SOMETIMES DOESN'T APPEAR"
 * ---------------------------------------------------
 * Two concrete, verified gaps in the previous pipeline:
 *
 *  1. Every existing delivery path funnels through a single shared
 *     "claim once" flag (__kynRelayMessageOnce). Whichever path claims an
 *     incoming message first is the ONLY one that renders it — if that path
 *     fails partway (iframe not ready yet, listener not rebound after a
 *     reconnect), the message is dropped, because every other path already
 *     stood down. This module listens directly on the socket for a brand
 *     new, separate event name (`msg:new`) that none of those relay layers
 *     even look at — so it never enters that race, and simply always
 *     renders what it receives (after its own dedupe-by-serverId check).
 *
 *  2. The existing reconnect flow (ReconnectOrchestrator.js) already emits
 *     `sync:missed_messages` on reconnect, and the server already replies
 *     with `sync:missed_messages_result` — but nothing in the whole
 *     frontend was listening for that reply. Messages correctly held for an
 *     offline client were fetched and then silently discarded. This module
 *     listens for both that legacy result AND the new `msg:sync:result`,
 *     and actually renders what comes back.
 *
 * INTEGRATION
 * -----------
 * Include this script wherever the message UI lives (message.html), then:
 *
 *     MessageLifecycleClient.init({ currentUserId: <id> });
 *     MessageLifecycleClient.sendMessage(chatId, content, type);
 *     MessageLifecycleClient.markRead(chatId, [messageId, ...]);
 *
 * Rendering re-uses the EXISTING, already-working render pipeline: incoming
 * messages are dispatched as a standard `message:new` document CustomEvent,
 * the exact same shape messages-core.js already knows how to render (see
 * its `document.addEventListener('message:new', ...)` handler). Its
 * existing dedupe-by-messageId logic means if the legacy relay *also*
 * manages to deliver the same message, it's simply dropped as a duplicate —
 * no regression, pure safety net.
 */
(function (global) {
  'use strict';

  const DB_NAME = 'moodchat_message_lifecycle_v1';
  const DB_VERSION = 1;
  const STORE_OUTGOING = 'outgoing_queue';
  const STORE_MESSAGES = 'messages';
  const STORE_SYNC_STATE = 'sync_state'; // last known serverId per chatId

  const RETRY_BACKOFF_MS = [1000, 2000, 5000, 10000, 20000, 30000]; // caps at 30s
  const MAX_RETRY_ATTEMPTS = 50; // ~ keeps retrying for a long time, never silently gives up

  let db = null;
  let currentUserId = null;
  let socketBindAttempts = 0;
  let retryTimer = null;

  // ---------------------------------------------------------------------
  // Tiny IndexedDB helper (falls back to an in-memory store if IndexedDB
  // is unavailable, e.g. some webview/iframe sandboxes) — this is what
  // makes "user does not have to press Send again" actually survive a
  // page reload, not just a network blip.
  // ---------------------------------------------------------------------
  function openDB() {
    return new Promise((resolve) => {
      if (!global.indexedDB) { resolve(null); return; }
      const req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (evt) => {
        const _db = evt.target.result;
        if (!_db.objectStoreNames.contains(STORE_OUTGOING)) {
          _db.createObjectStore(STORE_OUTGOING, { keyPath: 'clientMessageId' });
        }
        if (!_db.objectStoreNames.contains(STORE_MESSAGES)) {
          const store = _db.createObjectStore(STORE_MESSAGES, { keyPath: 'clientMessageId' });
          store.createIndex('chatId', 'chatId', { unique: false });
          store.createIndex('serverId', 'serverId', { unique: false });
        }
        if (!_db.objectStoreNames.contains(STORE_SYNC_STATE)) {
          _db.createObjectStore(STORE_SYNC_STATE, { keyPath: 'chatId' });
        }
      };
      req.onsuccess = (evt) => resolve(evt.target.result);
      req.onerror = () => resolve(null);
    });
  }

  // Fallback in-memory maps used only if IndexedDB truly isn't available.
  const memFallback = { outgoing: new Map(), messages: new Map(), syncState: new Map() };

  function idbPut(storeName, value) {
    return new Promise((resolve) => {
      if (!db) {
        const key = storeName === STORE_SYNC_STATE ? value.chatId : value.clientMessageId;
        ({ [STORE_OUTGOING]: memFallback.outgoing, [STORE_MESSAGES]: memFallback.messages, [STORE_SYNC_STATE]: memFallback.syncState }[storeName]).set(key, value);
        resolve(true);
        return;
      }
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  function idbDelete(storeName, key) {
    return new Promise((resolve) => {
      if (!db) {
        ({ [STORE_OUTGOING]: memFallback.outgoing, [STORE_MESSAGES]: memFallback.messages, [STORE_SYNC_STATE]: memFallback.syncState }[storeName]).delete(key);
        resolve(true);
        return;
      }
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  function idbGetAll(storeName) {
    return new Promise((resolve) => {
      if (!db) {
        resolve(Array.from(({ [STORE_OUTGOING]: memFallback.outgoing, [STORE_MESSAGES]: memFallback.messages, [STORE_SYNC_STATE]: memFallback.syncState }[storeName]).values()));
        return;
      }
      try {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
  }

  function idbGet(storeName, key) {
    return new Promise((resolve) => {
      if (!db) {
        resolve(({ [STORE_OUTGOING]: memFallback.outgoing, [STORE_MESSAGES]: memFallback.messages, [STORE_SYNC_STATE]: memFallback.syncState }[storeName]).get(key) || null);
        return;
      }
      try {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  // ---------------------------------------------------------------------
  // Socket access — tries direct same-origin access to the existing
  // KynectaRealtime socket instance wherever it lives (this window, or the
  // parent, if the message UI runs inside a same-origin iframe). No new
  // socket connection is created; this reuses the one connection the app
  // already maintains.
  // ---------------------------------------------------------------------
  function getSocket() {
    try { if (global.KynectaRealtime && global.KynectaRealtime._socket) return global.KynectaRealtime._socket; } catch (_) {}
    try { if (global.parent && global.parent.KynectaRealtime && global.parent.KynectaRealtime._socket) return global.parent.KynectaRealtime._socket; } catch (_) {}
    try { if (global.top && global.top.KynectaRealtime && global.top.KynectaRealtime._socket) return global.top.KynectaRealtime._socket; } catch (_) {}
    return null;
  }

  function genClientMessageId() {
    if (global.crypto && global.crypto.randomUUID) return 'cm_' + global.crypto.randomUUID();
    return 'cm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  // ---------------------------------------------------------------------
  // Rendering bridge: reuse the EXISTING, working render pipeline instead
  // of re-implementing DOM rendering here. messages-core.js already listens
  // for this exact event/shape and already dedupes by message id.
  // ---------------------------------------------------------------------
  function dispatchRender(message) {
    try {
      global.document.dispatchEvent(new CustomEvent('message:new', {
        detail: {
          id: message.serverId,
          chatId: message.chatId,
          conversationId: message.chatId,
          senderId: message.senderId,
          content: message.content,
          type: message.type || 'text',
          sender: message.sender || null,
          replyToId: message.replyToId || null,
          createdAt: message.createdAt,
          sentAt: message.sentAt,
          deliveredAt: message.deliveredAt || null,
          _source: 'MessageLifecycleClient',
        },
      }));
    } catch (_) { /* non-fatal — the message is already durably stored locally */ }
  }

  function dispatchStatusUpdate(clientMessageId, serverId, chatId, status) {
    try {
      global.document.dispatchEvent(new CustomEvent('message:status', {
        detail: { clientMessageId, serverId, chatId, status },
      }));
    } catch (_) {}
  }

  // ---------------------------------------------------------------------
  // Outgoing pipeline
  // ---------------------------------------------------------------------
  async function saveOutgoingLocal(item) {
    await idbPut(STORE_MESSAGES, item);
    await idbPut(STORE_OUTGOING, item);
  }

  async function sendMessage(chatId, content, type = 'text', extra = {}) {
    const clientMessageId = genClientMessageId();
    const item = {
      clientMessageId,
      chatId,
      senderId: currentUserId,
      content,
      type,
      replyToId: extra.replyToId || null,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
      serverId: null,
    };

    await saveOutgoingLocal(item);
    // Optimistic render — the whole point of "user doesn't have to press
    // Send again": it's visible immediately, before the network round trip.
    dispatchRender({ ...item, deliveredAt: null });

    attemptSend(item);
    return clientMessageId;
  }

  async function attemptSend(item) {
    const socket = getSocket();
    const payload = {
      chatId: item.chatId,
      content: item.content,
      type: item.type,
      clientMessageId: item.clientMessageId,
      replyToId: item.replyToId,
    };

    const onResult = async (result) => {
      if (result && result.ok) {
        item.status = result.status || 'sent';
        item.serverId = result.serverId;
        await idbDelete(STORE_OUTGOING, item.clientMessageId);
        await idbPut(STORE_MESSAGES, item);
        dispatchStatusUpdate(item.clientMessageId, item.serverId, item.chatId, item.status);
      } else {
        scheduleRetry(item);
      }
    };

    if (socket && socket.connected) {
      let answered = false;
      const timeout = setTimeout(() => { if (!answered) { answered = true; scheduleRetry(item); } }, 8000);
      try {
        socket.emit('msg:send', payload, (ack) => {
          if (answered) return;
          answered = true;
          clearTimeout(timeout);
          onResult(ack);
        });
      } catch (_) {
        clearTimeout(timeout);
        answered = true;
        await tryRestFallback(item, payload, onResult);
      }
    } else {
      await tryRestFallback(item, payload, onResult);
    }
  }

  async function tryRestFallback(item, payload, onResult) {
    try {
      const base = (global.__kynAPI && global.__kynAPI.baseUrl) || global.BACKEND_URL || '';
      const token = global.__kynToken || global.__accessToken || global.accessToken || '';
      const resp = await fetch(base.replace(/\/$/, '') + '/api/messages/lifecycle/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) { onResult({ ok: false }); return; }
      const data = await resp.json();
      onResult({ ok: true, serverId: data.serverId, status: data.status });
    } catch (_) {
      onResult({ ok: false });
    }
  }

  function scheduleRetry(item) {
    item.attempts = (item.attempts || 0) + 1;
    idbPut(STORE_OUTGOING, item);
    if (item.attempts > MAX_RETRY_ATTEMPTS) return; // still stored locally; manual resend possible
    const delay = RETRY_BACKOFF_MS[Math.min(item.attempts - 1, RETRY_BACKOFF_MS.length - 1)];
    setTimeout(() => attemptSend(item), delay);
  }

  // Called on socket reconnect: resume anything still pending, exactly as
  // described in the lifecycle spec — "the user does not have to press
  // Send again."
  async function flushOutgoingQueue() {
    const pending = await idbGetAll(STORE_OUTGOING);
    pending.forEach((item) => attemptSend(item));
  }

  // ---------------------------------------------------------------------
  // Incoming pipeline
  // ---------------------------------------------------------------------
  const seenServerIds = new Set();

  async function handleIncoming(payload) {
    if (!payload || !payload.serverId) return;
    if (seenServerIds.has(payload.serverId)) return; // dedupe
    seenServerIds.add(payload.serverId);

    const localRecord = {
      clientMessageId: 'srv_' + payload.serverId,
      serverId: payload.serverId,
      chatId: payload.chatId,
      senderId: payload.senderId,
      content: payload.content,
      type: payload.type,
      sender: payload.sender || null,
      replyToId: payload.replyToId || null,
      createdAt: payload.createdAt,
      sentAt: payload.sentAt,
      status: 'delivered',
    };
    await idbPut(STORE_MESSAGES, localRecord);
    await updateSyncState(payload.chatId, payload.serverId);

    dispatchRender(localRecord);

    // Confirm local storage back to the server -> sender sees ✓✓ delivered.
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('msg:delivered_ack', { serverId: payload.serverId, chatId: payload.chatId });
    }
  }

  async function updateSyncState(chatId, serverId) {
    const existing = await idbGet(STORE_SYNC_STATE, chatId);
    if (!existing || serverId > existing.lastServerId) {
      await idbPut(STORE_SYNC_STATE, { chatId, lastServerId: serverId, updatedAt: Date.now() });
    }
  }

  // ---------------------------------------------------------------------
  // Reconnect catch-up: the concrete fix for messages that were correctly
  // held server-side while this client was offline/reconnecting.
  // ---------------------------------------------------------------------
  async function requestSync() {
    const socket = getSocket();
    if (!socket || !socket.connected) return;
    const states = await idbGetAll(STORE_SYNC_STATE);
    const chats = states.map((s) => ({ chatId: s.chatId, sinceId: s.lastServerId }));
    if (chats.length === 0) return;
    socket.emit('msg:sync', { chats });
  }

  function handleSyncResult({ chatId, messages } = {}) {
    if (!Array.isArray(messages)) return;
    messages.forEach((m) => {
      handleIncoming({
        serverId: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        content: m.content,
        type: m.type,
        sender: m.senderUsername ? { username: m.senderUsername, avatar: m.senderAvatar } : null,
        replyToId: m.replyToId,
        createdAt: m.createdAt,
        sentAt: m.sentAt,
      });
    });
  }

  // ---------------------------------------------------------------------
  // Public: mark messages read (chat opened) — drives ✓✓ blue on sender side.
  // ---------------------------------------------------------------------
  function markRead(chatId, messageIds) {
    const socket = getSocket();
    if (socket && socket.connected && Array.isArray(messageIds) && messageIds.length > 0) {
      socket.emit('msg:read', { chatId, messageIds });
    }
  }

  // ---------------------------------------------------------------------
  // Binding: attach once per socket instance (survives reconnects because a
  // fresh socket.io client instance only gets created on hard reconnect,
  // and this guard flag lives on the socket object itself, matching the
  // existing `__msgCoreBound` / `__callsCoreBound` convention already used
  // elsewhere in this codebase).
  // ---------------------------------------------------------------------
  function bindSocketListeners() {
    const socket = getSocket();
    if (!socket) {
      socketBindAttempts += 1;
      if (socketBindAttempts < 100) setTimeout(bindSocketListeners, 300);
      return;
    }
    if (socket.__msgLifecycleClientBound) return;
    socket.__msgLifecycleClientBound = true;

    socket.on('msg:new', handleIncoming);
    socket.on('msg:delivered', ({ serverId, chatId }) => dispatchStatusUpdate(null, serverId, chatId, 'delivered'));
    socket.on('msg:read', ({ chatId, messageIds }) => {
      (messageIds || []).forEach((id) => dispatchStatusUpdate(null, id, chatId, 'read'));
    });
    socket.on('msg:sync:result', handleSyncResult);

    // Dead-letter fix: consume the pre-existing sync:missed_messages_result
    // that nothing was listening for before.
    socket.on('sync:missed_messages_result', ({ chatId, messages } = {}) => handleSyncResult({ chatId, messages }));

    socket.on('connect', () => {
      flushOutgoingQueue();
      requestSync();
    });

    // If already connected by the time we bind (common — the app connects
    // before the message UI finishes loading), run the connect-time work now.
    if (socket.connected) {
      flushOutgoingQueue();
      requestSync();
    }
  }

  async function init(opts = {}) {
    currentUserId = opts.currentUserId || currentUserId;
    if (!db) db = await openDB();
    bindSocketListeners();
  }

  global.MessageLifecycleClient = {
    init,
    sendMessage,
    markRead,
    requestSync,
    _internal: { getSocket, flushOutgoingQueue }, // exposed for debugging only
  };
})(typeof window !== 'undefined' ? window : this);
