/* Canonical private-message E2E bootstrap/compatibility boundary. */
(function (global) {
  'use strict';
  let loadPromise = null;
  function loadScript(src) { return new Promise((resolve, reject) => { const existing = document.querySelector(`script[data-e2e-core="${src}"]`); if (existing) return resolve(); const s = document.createElement('script'); s.src = src; s.async = false; s.dataset.e2eCore = src; document.head.appendChild(s); s.onload = resolve; s.onerror = () => reject(new Error(`Could not load ${src}`)); }); }
  function sessionPassword() { try { return sessionStorage.getItem('kyn_e2e_pw_session') || null; } catch (_) { return null; } }
  function sessionLegacyPassword() { try { return sessionStorage.getItem('kyn_e2e_pw_legacy_session') || null; } catch (_) { return null; } }
  async function prepareLegacyIdentity() {
    await loadScript('/js/e2e-encryption.js'); const legacy = global.KynectaE2E; if (!legacy || typeof legacy.init !== 'function') return false;
    const password = sessionPassword(); if (!password) return false;
    try { const ok = await legacy.init(password, sessionLegacyPassword() || undefined); return !!(ok && legacy.enabled && typeof legacy.getMyIdentityPrivateKey === 'function'); }
    catch (err) { console.warn('[MessageE2E] legacy identity recovery unavailable:', err?.message || err); return false; }
  }
  async function loadNewCore() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      await prepareLegacyIdentity();
      await loadScript('/js/secure-storage-bridge.js');
      await loadScript('/js/e2e-identity-core.js');
      await loadScript('/js/e2e-ratchet-v3.js');
      await loadScript('/js/message-e2e-core.js');
      await loadScript('/js/message-e2e-compat.js');
      if (/\/message(?:\.html)?$/i.test(global.location?.pathname || '')) await loadScript('/js/message-realtime-bridge.js');
      const facade = global.KynectaE2E || {}; const dm = global.KynectaMessageE2E; if (!dm) throw new Error('Canonical message E2E core did not initialize');
      const messageSurface = Object.freeze(['encryptForChat','decryptFromChat','decryptMessageForDisplay','retryDecrypt','prefetchRecipientKey','prefetchRecipientKeys','cacheRecipientKey','isMessageQueued','isMessageFailed','peekDecryptedText','forgetMessage','registerPendingDecrypt','encryptAttachment','decryptAttachment']);
      if (typeof dm.getSafetyNumbers === 'function') facade.getSafetyNumbers = dm.getSafetyNumbers;
      const missing = messageSurface.filter(name => typeof dm[name] !== 'function'); if (missing.length) throw new Error(`Canonical message E2E surface incomplete: ${missing.join(', ')}`);
      for (const name of messageSurface) facade[name] = dm[name];
      for (const name of ['secureEncrypt','secureDecrypt','encryptMessage','decryptMessage','x3dhInitiate','x3dhAccept','establishSession','getSession','getSessionState','resetSession','clearSessions','provisionPrekeys','provisionWithRetry']) { try { delete facade[name]; } catch (_) { facade[name] = undefined; } }
      global.KynectaE2E = facade;
      // The top-level shell is not the private-message receiver. It previously
      // decrypted the same ciphertext again for desktop notifications, causing
      // chat.html and message.html to consume one receiving chain independently.
      // Signal-style processing keeps the ratchet owned by the message receiver;
      // duplicate delivery is an application/transport concern, not a reason to
      // reuse a consumed message key. Keep shell notifications generic.
      if (global.parent === global) facade.decryptMessageForDisplay = async function (_message, _chatId, _userId, opts = {}) { return opts && opts.fallbackText !== undefined ? opts.fallbackText : 'New message received'; };
      const identity = await dm.init(); if (!identity || !global.KynectaE2EIdentity?.enabled || !global.KynectaE2EIdentity?.privateKey) throw new Error('Canonical message E2E identity is not unlocked');
      try { document.dispatchEvent(new CustomEvent('kyn:canonicalMessageE2EReady')); } catch (_) {}
      return facade;
    })();
    try { return await loadPromise; } catch (err) { loadPromise = null; throw err; }
  }
  global.KynectaMessageE2EReady = loadNewCore;
  loadNewCore().catch(err => console.error('[MessageE2E] canonical bootstrap failed:', err?.message || err));
})(window);
