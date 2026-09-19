// ROOT-CAUSE FIX (group chat history "disappears" on reload/refresh/relogin
// until the network fetch finishes, unlike 1:1 chat which hydrates from
// disk instantly): group.html has never had a local (IndexedDB) history
// cache the way js/message-local-db.js gives 1:1 chats — every open of a
// group re-fetches from the network with nothing shown in the meantime
// beyond "No messages yet.", and a slow/offline network means the group
// looks empty even though the person has read all of this before.
//
// group.html's top-level `function` declarations (openGroup, renderMessages,
// reconcile, ...) are plain globals in a classic (non-module) script, so
// they're reachable and wrappable from here without editing that file's own
// logic. `S` itself is a top-level `const` and NOT reachable this way, but
// renderMessages() already exposes the live message list on
// `window.__GROUP_MESSAGES_CACHE` every time it runs (see group.html) — we
// read that for persistence instead of touching internal state.
(function () {
  'use strict';
  if (window.__KynGroupHistoryCacheFix) return;
  window.__KynGroupHistoryCacheFix = true;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(function () {
    const cache = window.KynectaGroupMessageCache;
    if (!cache) return; // cache script missing/blocked — degrade to network-only, same as before this fix

    // Hydrate instantly from disk the moment a group is opened, before the
    // network fetch loadMessages() (already kicked off inside openGroup)
    // has a chance to resolve. reconcile() is the same merge-by-id function
    // group.html's own network path uses, so this is safe to call twice —
    // whichever data (cache or network) arrives, message ids just merge.
    const origOpenGroup = window.openGroup;
    if (typeof origOpenGroup === 'function') {
      window.openGroup = function (id) {
        const ret = origOpenGroup.apply(this, arguments);
        cache.getMessages(id).then((cached) => {
          if (!cached || !cached.length) return;
          // The person may have already switched to a different group by
          // the time this resolves — never paint a stale group's history
          // into the one that's actually open now.
          if (String(window.__GROUP_CHAT_ID) !== String(id)) return;
          // Seed decryptRow()'s skip-cache with this already-plaintext copy
          // before the network refetch (already kicked off inside
          // origOpenGroup) has a chance to re-decrypt all of it from raw
          // ciphertext again — see group.html's own comment on
          // __seedGroupDecryptedCache for why.
          if (typeof window.__seedGroupDecryptedCache === 'function') {
            window.__seedGroupDecryptedCache(cached);
          }
          if (typeof window.reconcile === 'function') window.reconcile(cached);
        }).catch(() => {});
        return ret;
      };
    }

    // Persist whatever the current message list is after every render —
    // cheap (IndexedDB put), idempotent, and covers every source that
    // changes S.messages (initial load, realtime patch-in, send, edit)
    // since they all funnel through renderMessages() already.
    const origRenderMessages = window.renderMessages;
    if (typeof origRenderMessages === 'function') {
      window.renderMessages = function (scroll) {
        const ret = origRenderMessages.apply(this, arguments);
        try {
          const gid = window.__GROUP_CHAT_ID;
          const list = window.__GROUP_MESSAGES_CACHE;
          if (gid && Array.isArray(list) && list.length) {
            cache.putMessages(gid, list);
          }
        } catch (_) {}
        return ret;
      };
    }
  });
})();
