/* Canonical private-message E2E bridge. Group crypto stays untouched. */
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
        const groupFacade = global.KynectaE2E || {};
        const dm = global.KynectaMessageE2E;
        if (!dm) throw new Error('Canonical message E2E core did not initialize');

        // Replace ONLY the private-message surface. Do not replace group
        // enabled/publicKey/keyId/identity helpers or init(), because the
        // working group implementation still uses those properties.
        const messageSurface = [
          'encryptForChat', 'decryptFromChat', 'decryptMessageForDisplay',
          'retryDecrypt', 'prefetchRecipientKey', 'cacheRecipientKey',
          'isMessageQueued', 'isMessageFailed', 'peekDecryptedText',
          'registerPendingDecrypt', 'encryptAttachment', 'decryptAttachment'
        ];
        for (const name of messageSurface) {
          if (typeof dm[name] === 'function') groupFacade[name] = dm[name];
        }

        // Remove only legacy DM/X3DH methods from the active facade. Group
        // primitives remain available. This prevents any private-message
        // caller from accidentally discovering and using a second crypto path.
        const legacyDmNames = [
          'secureEncrypt', 'secureDecrypt', 'encryptMessage', 'decryptMessage',
          'x3dhInitiate', 'x3dhAccept', 'establishSession', 'getSession',
          'getSessionState', 'resetSession', 'clearSessions', 'provisionPrekeys',
          'provisionWithRetry'
        ];
        for (const name of legacyDmNames) {
          try { delete groupFacade[name]; } catch (_) { groupFacade[name] = undefined; }
        }

        global.KynectaE2E = groupFacade;
        try { document.dispatchEvent(new CustomEvent('kyn:canonicalMessageE2EReady')); } catch (_) {}
        return groupFacade;
      })();
    }
    return loadPromise;
  }

  global.KynectaMessageE2EReady = loadNewCore;
  loadNewCore().catch(err => console.error('[MessageE2E] canonical bootstrap failed:', err));
})(window);
