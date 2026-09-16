/* Keeps a stable group message cache across history and reconnect-sync calls.
 * This is used by the group edit/delete UI to map rendered bubbles to ids.
 *
 * Realtime bridge: group.html is an iframe and the main realtime socket lives
 * in the parent chat shell. The parent already dispatches `kyn:group:message`
 * for every canonical `group:message` socket event. Listen to that parent
 * event here, but ONLY for the currently open group, then let the canonical
 * group history reconciler render the message. We deliberately do NOT emit
 * `message:new` and do not touch the Messages/1:1 iframe.
 */
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
    const message = payload?.message && typeof payload.message === 'object'
      ? payload.message
      : payload;
    return message && typeof message === 'object' ? message : null;
  }

  // The socket is owned by the parent chat shell. Same-origin group.html can
  // subscribe to the parent's CustomEvent without opening another socket.
  // This keeps one realtime transport and prevents a second group delivery
  // path from competing with the 1:1 message pipeline.
  function installParentRealtimeBridge() {
    try {
      const parentWindow = window.parent && window.parent !== window ? window.parent : window;
      if (parentWindow.__NECPRA_GROUP_PARENT_BRIDGE_OWNER__) return;
      parentWindow.__NECPRA_GROUP_PARENT_BRIDGE_OWNER__ = true;

      const receive = event => {
        try {
          const payload = event?.detail;
          const message = messageFrom(payload);
          const incomingGroupId = groupIdFrom(payload);
          const currentGroupId = String(window.__GROUP_CHAT_ID || '');
          if (!message?.id || !incomingGroupId || !currentGroupId) return;
          if (incomingGroupId !== currentGroupId) return;

          const existing = Array.isArray(window.__GROUP_MESSAGES_CACHE)
            ? window.__GROUP_MESSAGES_CACHE
            : [];
          if (!existing.some(m => String(m.id) === String(message.id))) {
            window.__GROUP_MESSAGES_CACHE = [...existing, message].sort((a, b) => Number(a.id) - Number(b.id));
          }

          // group.html owns the DOM renderer. Refreshing through its existing
          // reconciliation function is authoritative and idempotent: if the
          // message was already appended from the sender's POST response, the
          // same id is ignored and nothing is duplicated.
          if (typeof window.__GROUP_REFRESH_MESSAGES === 'function') {
            Promise.resolve(window.__GROUP_REFRESH_MESSAGES()).catch(() => {});
          }
        } catch (_) {}
      };

      parentWindow.addEventListener('kyn:group:message', receive);
      window.__NECPRA_GROUP_PARENT_BRIDGE_OWNER__ = false;
      window.__NECPRA_GROUP_PARENT_BRIDGE_INSTALLED__ = true;
    } catch (_) {}
  }

  // group-chat-features normally establishes __GROUP_CHAT_ID as its fetch
  // observer sees /chats/:id and /messages/:id. Retry briefly so this bridge
  // also works when the script executes before those requests.
  function bootBridge(attempt = 0) {
    if (window.__GROUP_CHAT_ID || attempt >= 30) {
      installParentRealtimeBridge();
      return;
    }
    setTimeout(() => bootBridge(attempt + 1), 100);
  }
  bootBridge();
})();
