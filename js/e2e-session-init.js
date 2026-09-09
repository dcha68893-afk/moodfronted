/* Canonical private-message E2E bridge.
 *
 * Ownership is strict:
 *   - 1:1/private messages: KynectaMessageE2E -> KynectaE2EIdentity
 *   - groups: existing KynectaE2E group Sender-Key primitives
 *
 * This file is only the compatibility boundary required by message-client.js;
 * it is not a second crypto implementation.
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
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      await loadScript('/js/e2e-identity-core.js');
      await loadScript('/js/message-e2e-core.js');
      await loadScript('/js/message-e2e-compat.js');

      const facade = global.KynectaE2E || {};
      const dm = global.KynectaMessageE2E;
      if (!dm) throw new Error('Canonical message E2E core did not initialize');

      // These are the ONLY private-message entry points. If a required
      // operation is missing, fail loudly instead of silently falling back to
      // an older crypto generation.
      const messageSurface = Object.freeze([
        'encryptForChat',
        'decryptFromChat',
        'decryptMessageForDisplay',
        'retryDecrypt',
        'prefetchRecipientKey',
        'prefetchRecipientKeys',
        'cacheRecipientKey',
        'isMessageQueued',
        'isMessageFailed',
        'peekDecryptedText',
        'registerPendingDecrypt',
        'encryptAttachment',
        'decryptAttachment'
      ]);
      // getSafetyNumbers is bound (not function-checked) since it's optional
      // and message-e2e-core.js proxies it straight to the identity layer.
      if (typeof dm.getSafetyNumbers === 'function') facade.getSafetyNumbers = dm.getSafetyNumbers;
      const missing = messageSurface.filter(name => typeof dm[name] !== 'function');
      if (missing.length) {
        throw new Error(`Canonical message E2E surface incomplete: ${missing.join(', ')}`);
      }
      for (const name of messageSurface) facade[name] = dm[name];

      // Explicitly remove the legacy 1:1/X3DH session surface. Group Sender-
      // Key operations are intentionally not included here and remain owned
      // by the working group implementation.
      const legacyDmNames = Object.freeze([
        'secureEncrypt',
        'secureDecrypt',
        'encryptMessage',
        'decryptMessage',
        'x3dhInitiate',
        'x3dhAccept',
        'establishSession',
        'getSession',
        'getSessionState',
        'resetSession',
        'clearSessions',
        'provisionPrekeys',
        'provisionWithRetry'
      ]);
      for (const name of legacyDmNames) {
        try { delete facade[name]; } catch (_) { facade[name] = undefined; }
      }

      global.KynectaE2E = facade;

      // Bootstrap exactly one DM identity before first-contact send/decrypt.
      // The identity core persists it and reuses the same key instead of
      // generating a new identity for every message/session.
      await dm.init().catch(err => {
        console.warn('[MessageE2E] identity bootstrap deferred:', err?.message || err);
      });

      try {
        document.dispatchEvent(new CustomEvent('kyn:canonicalMessageE2EReady'));
      } catch (_) {}

      return facade;
    })();

    try {
      return await loadPromise;
    } catch (err) {
      loadPromise = null;
      throw err;
    }
  }

  global.KynectaMessageE2EReady = loadNewCore;
  loadNewCore().catch(err => console.error('[MessageE2E] canonical bootstrap failed:', err));
})(window);
