/* Canonical E2E bootstrap bridge.
 * Group crypto remains on the existing KynectaE2E object. Private-message
 * crypto is replaced by e2e-identity-core.js + message-e2e-core.js.
 */
(function (global) {
  'use strict';
  let loadPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-e2e-core="${src}"]`);
      if (existing) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.async = false; s.dataset.e2eCore = src;
      s.onload = resolve; s.onerror = () => reject(new Error(`Could not load ${src}`));
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

        // Remove the old 1-to-1/X3DH surface from the active facade. Group
        // primitives are intentionally preserved because groupEncryption.client.js
        // still depends on them and the group system is known-good.
        const legacyDmNames = [
          'encryptForChat', 'decryptFromChat', 'decryptMessageForDisplay',
          'retryDecrypt', 'prefetchRecipientKey', 'cacheRecipientKey',
          'isMessageQueued', 'isMessageFailed', 'peekDecryptedText',
          'registerPendingDecrypt', 'encryptAttachment', 'decryptAttachment',
          'getSafetyNumbers', 'getMyUserId', 'clearKeys', 'init',
          'secureEncrypt', 'secureDecrypt', 'encryptMessage', 'decryptMessage',
          'x3dhInitiate', 'x3dhAccept', 'establishSession', 'getSession',
          'getSessionState', 'resetSession', 'clearSessions', 'provisionPrekeys',
          'provisionWithRetry'
        ];
        for (const name of legacyDmNames) {
          try { delete old[name]; } catch (_) { old[name] = undefined; }
        }

        // Copy only callable canonical message operations. Dynamic properties
        // are installed as getters below so `enabled`, `publicKey`, and `keyId`
        // never become stale snapshots.
        const callable = [
          'encryptForChat', 'decryptFromChat', 'decryptMessageForDisplay',
          'retryDecrypt', 'prefetchRecipientKey', 'cacheRecipientKey',
          'isMessageQueued', 'isMessageFailed', 'peekDecryptedText',
          'registerPendingDecrypt', 'encryptAttachment', 'decryptAttachment',
          'getSafetyNumbers', 'getMyUserId', 'clearKeys'
        ];
        for (const name of callable) if (typeof next[name] === 'function') old[name] = next[name];
        Object.defineProperty(old, 'enabled', { configurable: true, enumerable: true, get: () => !!next.enabled });
        Object.defineProperty(old, 'publicKey', { configurable: true, enumerable: true, get: () => next.publicKey || null });
        Object.defineProperty(old, 'keyId', { configurable: true, enumerable: true, get: () => next.keyId || null });
        old.init = async function (password, legacyPassword) { return next.init(password, legacyPassword); };

        global.KynectaE2E = old;
        try { document.dispatchEvent(new CustomEvent('kyn:canonicalMessageE2EReady')); } catch (_) {}
        return old;
      })();
    }
    return loadPromise;
  }

  global.KynectaMessageE2EReady = loadNewCore;
  loadNewCore().catch(err => console.error('[MessageE2E] canonical bootstrap failed:', err));
})(window);
