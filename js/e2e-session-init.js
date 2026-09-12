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

  function sessionPassword() {
    try { return sessionStorage.getItem('kyn_e2e_pw_session') || null; } catch (_) { return null; }
  }

  function sessionLegacyPassword() {
    try { return sessionStorage.getItem('kyn_e2e_pw_legacy_session') || null; } catch (_) { return null; }
  }

  async function prepareLegacyIdentity() {
    // The canonical identity layer deliberately does not duplicate private-key
    // storage/recovery. The existing legacy E2E layer already owns the secure
    // password-wrapped identity backup flow, including GET /api/encryption/
    // identity-backup on a new device. Prepare that layer first so the
    // canonical identity can adopt the exact same keypair instead of creating
    // a new, incompatible identity on a phone/laptop switch.
    await loadScript('/js/e2e-encryption.js');
    const legacy = global.KynectaE2E;
    if (!legacy || typeof legacy.init !== 'function') return false;

    const password = sessionPassword();
    if (!password) return false;

    try {
      const ok = await legacy.init(password, sessionLegacyPassword() || undefined);
      if (!ok || !legacy.enabled || typeof legacy.getMyIdentityPrivateKey !== 'function') {
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[MessageE2E] legacy identity recovery unavailable:', err?.message || err);
      return false;
    }
  }

  async function loadNewCore() {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      // Mobile chat-list bootstrap is intentionally independent from crypto.
      // A slow E2E identity must never make an existing conversation list look
      // empty, and a missing identity must never cause plaintext/ciphertext
      // UI to be rendered as a substitute for the actual chat state.
      if (/\/message(?:\.html)?$/i.test(global.location?.pathname || '')) {
        await loadScript('/js/message-mobile-bootstrap-fix.js');
      }

      // Prepare the existing password-wrapped identity before loading the
      // canonical layer. On a second device this can restore the exact
      // account identity from the encrypted server backup; the private key is
      // decrypted locally and is never sent to the server in plaintext.
      await prepareLegacyIdentity();

      await loadScript('/js/secure-storage-bridge.js');
      await loadScript('/js/e2e-identity-core.js');
      await loadScript('/js/e2e-ratchet-v3.js');
      await loadScript('/js/message-e2e-core.js');
      await loadScript('/js/message-e2e-compat.js');
      if (/\/message(?:\.html)?$/i.test(global.location?.pathname || '')) {
        await loadScript('/js/message-realtime-bridge.js');
      }

      // IMPORTANT: keep the legacy object as the compatibility facade. The
      // canonical identity layer's adoptSharedIdentity() intentionally looks
      // for the existing KynectaE2E object and imports its already-unlocked
      // private key. We therefore extend that same object rather than
      // replacing it with a fresh object that would hide the recovery path.
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
        'forgetMessage',
        'registerPendingDecrypt',
        'encryptAttachment',
        'decryptAttachment'
      ]);
      if (typeof dm.getSafetyNumbers === 'function') facade.getSafetyNumbers = dm.getSafetyNumbers;
      const missing = messageSurface.filter(name => typeof dm[name] !== 'function');
      if (missing.length) throw new Error(`Canonical message E2E surface incomplete: ${missing.join(', ')}`);
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

      // E2E readiness means the identity is actually unlocked. Do not swallow
      // init failures and announce readiness: doing so races message-client's
      // decrypt pipeline and turns a temporary auth/bootstrap delay into
      // "Unable to decrypt". loadPromise is reset on failure so a later call
      // can retry after the login session password becomes available.
      const identity = await dm.init();
      if (!identity || !global.KynectaE2EIdentity?.enabled || !global.KynectaE2EIdentity?.privateKey) {
        throw new Error('Canonical message E2E identity is not unlocked');
      }

      try { document.dispatchEvent(new CustomEvent('kyn:canonicalMessageE2EReady')); } catch (_) {}
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
  loadNewCore().catch(err => console.error('[MessageE2E] canonical bootstrap failed:', err?.message || err));
})(window);
