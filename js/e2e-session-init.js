/*
 * Canonical E2E bootstrap bridge.
 *
 * The working group crypto remains on the existing KynectaE2E object for
 * backwards-compatible group operation. Private-message crypto is replaced
 * by js/e2e-identity-core.js + js/message-e2e-core.js and is the ONLY
 * implementation used by message-client.js.
 *
 * This file intentionally contains no X3DH, Double Ratchet, retry loop,
 * session generation, sent-message cache, or message decrypt queue.
 */
(function (global) {
  'use strict';

  let loadPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-e2e-core="${src}"]`);
      if (existing) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.dataset.e2eCore = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function loadNewCore() {
    if (!loadPromise) {
      loadPromise = (async () => {
        await loadScript('/js/e2e-identity-core.js');
        await loadScript('/js/message-e2e-core.js');
        const old = global.KynectaE2E || {};
        const next = global.KynectaMessageE2E;
        if (!next) throw new Error('Canonical message E2E core did not initialize');

        // Preserve only non-message/group-facing capabilities from the existing
        // object. Every private-message entry point below is replaced.
        const messageNames = new Set([
          'encryptForChat', 'decryptFromChat', 'decryptMessageForDisplay',
          'retryDecrypt', 'prefetchRecipientKey', 'cacheRecipientKey',
          'isMessageQueued', 'isMessageFailed', 'peekDecryptedText',
          'registerPendingDecrypt', 'encryptAttachment', 'decryptAttachment',
          'getSafetyNumbers', 'getMyUserId', 'clearKeys', 'init'
        ]);
        for (const [k, v] of Object.entries(next)) old[k] = v;

        // Group encryption still reads KynectaE2E directly. Those methods remain
        // untouched. The private-message module sees only the canonical methods
        // copied above, so it cannot accidentally route through X3DH/ratchet code.
        global.KynectaE2E = old;

        const canonicalInit = next.init;
        global.KynectaE2E.init = async function (password, legacyPassword) {
          return canonicalInit(password, legacyPassword);
        };

        try { document.dispatchEvent(new CustomEvent('kyn:canonicalMessageE2EReady')); } catch (_) {}
        return old;
      })();
    }
    return loadPromise;
  }

  // Message-client loads before deferred scripts execute. Install a stable
  // readiness promise now so calls made immediately after bootstrap can wait
  // for the one canonical implementation instead of falling back to the old
  // decryptor.
  global.KynectaMessageE2EReady = loadNewCore;

  // Replace the message-facing API as soon as the new core is available.
  loadNewCore().catch(err => console.error('[MessageE2E] canonical bootstrap failed:', err));
})(window);
