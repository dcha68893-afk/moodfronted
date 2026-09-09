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
      document.head.appendChild(s);
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Could not load ${src}`));
    });
  }

  async function loadNewCore() {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      await loadScript('/js/e2e-identity-core.js');
      await loadScript('/js/message-e2e-core.js');
      await loadScript('/js/message-e2e-compat.js');
      // Realtime is a transport concern, not crypto. Only the Messages iframe
      // gets the direct receiver bridge; group/calls/tools pages must not attach
      // a second message:new consumer or emit duplicate delivery receipts.
      if (/\/message(?:\.html)?$/i.test(global.location?.pathname || '')) {
        await loadScript('/js/message-realtime-bridge.js');
      }

      const facade = global.KynectaE2E || {};
      const dm = global.KynectaMessageE2E;
      if (!dm) throw new Error('Canonical message E2E core did not initialize');

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
      if (typeof dm.getSafetyNumbers === 'function') facade.getSafetyNumbers = dm.getSafetyNumbers;
      const missing = messageSurface.filter(name => typeof dm[name] !== 'function');
      if (missing.length) {
        throw new Error(`Canonical message E2E surface incomplete: ${missing.join(', ')}`);
      }
      for (const name of messageSurface) facade[name] = dm[name];

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
      await dm.init().catch(err => {
        console.warn('[MessageE2E] identity bootstrap deferred:', err?.message || err);
      });

      try {
        document.dispatchEvent(new CustomEvent('kyn:canonicalMessageE2EReady'));
      } catch (_) {}

      // message-client.js and message.html are already present by the time
      // this deferred bootstrap runs. Load the small post-bootstrap stability
      // adapter now so it can replace the compatibility retry delay, provide
      // legacy-v1 decoding, persist the chat list, use the real friends list,
      // and correct realtime scroll behavior without creating another crypto
      // or message transport implementation.
      if (/\/message(?:\.html)?$/i.test(global.location?.pathname || '')) {
        await loadScript('/js/message-module-stability-fix.js');
      }

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
