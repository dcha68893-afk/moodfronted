/*
 * Canonical Messages realtime transport bridge.
 *
 * The message iframe owns message state/rendering, but Socket.IO is owned by
 * the shared realtime layer. This bridge connects those two layers directly:
 *
 *   Socket.IO message:new/msg:new
 *          -> normalize once
 *          -> window.postMessage(message:new)
 *          -> message-client.js applyIncomingMessage()
 *
 * REST remains the durable send path. Socket.IO is the realtime receive path.
 * The parent chat shell is intentionally not required for message delivery;
 * its postMessage forwarding remains a compatibility input handled by
 * message-client.js and is deduplicated by server message id.
 *
 * Delivery ACK is sent immediately after the message is accepted by the
 * client, independently of whether the chat panel is open. Decryption and UI
 * rendering are deliberately downstream of receipt/ACK.
 */
(function (global) {
  'use strict';

  let boundSocket = null;
  let bindTimer = null;
  const seen = new Map();
  const SEEN_TTL = 60_000;

  function currentSocket() {
    return global.KynectaRealtime?._socket || null;
  }

  function normalize(raw) {
    const payload = raw?.payload && (raw.payload.id != null || raw.payload.serverId != null || raw.payload.chatId != null)
      ? raw.payload
      : raw;
    if (!payload || typeof payload !== 'object') return null;

    const chatId = payload.chatId ?? payload.conversationId;
    const id = payload.serverId ?? payload.id;
    if (chatId == null || id == null) return null;

    return {
      ...payload,
      id,
      serverId: payload.serverId ?? id,
      chatId,
      conversationId: payload.conversationId ?? chatId,
      senderId: payload.senderId ?? payload.sender?.id ?? null,
      content: payload.content ?? payload.text ?? payload.body ?? '',
      createdAt: payload.createdAt ?? payload.sentAt ?? new Date().toISOString(),
      sentAt: payload.sentAt ?? payload.createdAt ?? null,
      status: payload.status || 'sent',
    };
  }

  function key(message) {
    return `${String(message.chatId)}:${String(message.serverId ?? message.id)}`;
  }

  function forward(message) {
    const k = key(message);
    if (seen.has(k)) return false;
    seen.set(k, Date.now());
    setTimeout(() => seen.delete(k), SEEN_TTL);

    // Use the exact postMessage contract already consumed by message-client.js.
    try {
      global.postMessage({ type: 'message:new', payload: message, source: 'message-realtime-bridge' }, '*');
    } catch (_) {}

    // Receipt means the message reached the authenticated client and has been
    // accepted into the message pipeline. It does not mean "read".
    const socket = currentSocket();
    if (socket?.connected && message.senderId != null && String(message.senderId) !== String(global._kynCurrentUserId)) {
      try {
        socket.emit('message:delivery_ack', {
          messageId: message.serverId ?? message.id,
          chatId: message.chatId,
          senderId: message.senderId,
        });
      } catch (_) {}
    }
    return true;
  }

  function bind() {
    const socket = currentSocket();
    if (!socket) {
      if (!bindTimer) bindTimer = setTimeout(() => { bindTimer = null; bind(); }, 300);
      return;
    }
    if (boundSocket === socket) return;

    if (boundSocket) {
      try { boundSocket.off('message:new', onMessage); } catch (_) {}
      try { boundSocket.off('msg:new', onMessage); } catch (_) {}
      try { boundSocket.off('sync:missed_messages_result', onSync); } catch (_) {}
      try { boundSocket.off('msg:sync:result', onSync); } catch (_) {}
    }

    boundSocket = socket;
    socket.on('message:new', onMessage);
    socket.on('msg:new', onMessage);
    socket.on('sync:missed_messages_result', onSync);
    socket.on('msg:sync:result', onSync);
    socket.on('connect', () => {
      if (boundSocket !== currentSocket()) {
        boundSocket = null;
        bind();
      }
    });
  }

  function onMessage(raw) {
    const message = normalize(raw);
    if (message) forward(message);
  }

  function onSync(raw) {
    const messages = Array.isArray(raw?.messages) ? raw.messages : [];
    messages.forEach(onMessage);
  }

  // Re-check after realtime bootstrap and after reconnects. This is deliberately
  // tiny and self-contained; it does not own the socket or replace the shared
  // realtime implementation.
  bind();
  global.addEventListener?.('load', bind);
  setInterval(bind, 1000);

  global.KynectaMessageRealtimeBridge = Object.freeze({
    bind,
    receive: onMessage,
  });
})(window);
