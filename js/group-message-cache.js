/* Keeps a stable group message cache across history and reconnect-sync calls.
 * This is used by the group edit/delete UI to map rendered bubbles to ids. */
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
})();
