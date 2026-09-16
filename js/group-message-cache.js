/* Stable group message cache + realtime bridge for group.html. */
(function () {
  'use strict';
  if (window.__NECPRA_GROUP_MESSAGE_CACHE__) return;
  window.__NECPRA_GROUP_MESSAGE_CACHE__ = true;

  const originalFetch = window.fetch?.bind(window);
  if (!originalFetch) return;

  const messagesFrom = d => {
    const x = d?.data?.messages || d?.data || d?.messages || d;
    return Array.isArray(x) ? x.filter(m => m && m.id) : (x?.id ? [x] : []);
  };

  window.fetch = async function (input, init) {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    const result = await originalFetch(input, init);
    try {
      if (result.ok && /\/messages\/\d+/.test(url)) {
        const list = messagesFrom(await result.clone().json().catch(() => null));
        const existing = Array.isArray(window.__GROUP_MESSAGES_CACHE) ? window.__GROUP_MESSAGES_CACHE : [];
        const byId = new Map(existing.map(m => [String(m.id), m]));
        list.forEach(m => byId.set(String(m.id), m));
        window.__GROUP_MESSAGES_CACHE = [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
      }
    } catch (_) {}
    return result;
  };

  function groupIdFrom(payload) {
    return String(
      payload?.groupId ?? payload?.chatId ?? payload?.conversationId ??
      payload?.message?.groupId ?? payload?.message?.chatId ?? ''
    );
  }

  function messageFrom(payload) {
    return payload?.message && typeof payload.message === 'object' ? payload.message : payload;
  }

  // The parent chat shell owns the Socket.IO connection and already dispatches
  // kyn:group:message from the canonical group:message event. The group iframe
  // listens directly to that parent event. No second socket and no message:new
  // event are introduced, so 1:1 messaging remains completely separate.
  try {
    const parentWindow = window.parent && window.parent !== window ? window.parent : window;
    const receive = event => {
      try {
        const payload = event?.detail;
        const message = messageFrom(payload);
        const incomingGroupId = groupIdFrom(payload);
        const currentGroupId = String(window.__GROUP_CHAT_ID || '');
        if (!message?.id || !incomingGroupId || !currentGroupId) return;
        if (incomingGroupId !== currentGroupId) return;

        const existing = Array.isArray(window.__GROUP_MESSAGES_CACHE) ? window.__GROUP_MESSAGES_CACHE : [];
        if (!existing.some(m => String(m.id) === String(message.id))) {
          window.__GROUP_MESSAGES_CACHE = [...existing, message].sort((a, b) => Number(a.id) - Number(b.id));
        }

        // group.html owns DOM rendering. Its reconciliation is authoritative and
        // idempotent, so a sender ACK and realtime event cannot create duplicates.
        if (typeof window.__GROUP_REFRESH_MESSAGES === 'function') {
          Promise.resolve(window.__GROUP_REFRESH_MESSAGES()).catch(() => {});
        }
      } catch (_) {}
    };
    parentWindow.addEventListener('kyn:group:message', receive);
    window.__NECPRA_GROUP_PARENT_BRIDGE_INSTALLED__ = true;
  } catch (_) {}
})();
