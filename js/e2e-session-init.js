/**
 * Kynecta authenticated E2E bootstrap + first-contact X3DH transport.
 * Session state is keyed by authenticated user pair, never by chat id.
 *
 * Important: this file can run in several iframes/tabs at the same time.
 * Web Locks is therefore used around X3DH session creation/decryption so two
 * independent message surfaces cannot consume/overwrite the same first-contact
 * session concurrently.
 */
(function () {
  'use strict';

  const PREKEY_TARGET = 50;
  const PREKEY_MINIMUM = 10;
  const PREKEY_STORAGE = 'kyn_x3dh_prekeys_v1';
  const SESSION_STORAGE = 'kyn_x3dh_sessions_v5';
  const RETRY_DELAYS = [1000, 2500, 5000, 10000, 30000];
  const MAX_SKEW = 100;
  const locks = new Map();
  let provisioningPromise = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const b64 = value => btoa(String.fromCharCode(...new Uint8Array(value)));
  const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));

  function userId() {
    try { const id = window.SessionManager?.getCurrentUserId?.(); if (id) return String(id); } catch (_) {}
    try { const id = window.KynectaE2E?.getMyUserId?.(); if (id) return String(id); } catch (_) {}
    try {
      const parsed = JSON.parse(localStorage.getItem('kynecta_auth') || 'null');
      return parsed?.user?.id || parsed?.userId ? String(parsed.user?.id || parsed.userId) : null;
    } catch (_) { return null; }
  }

  function storageKey() {
    const id = userId();
    return id ? `${PREKEY_STORAGE}_${id}` : PREKEY_STORAGE;
  }

  function pairKey(otherId) {
    const me = userId();
    const pair = [String(me || ''), String(otherId || '')].sort().join(':');
    return `${SESSION_STORAGE}_${me}_${pair}`;
  }

  function legacyPairKeys(otherId) {
    const me = userId();
    const pair = [String(me || ''), String(otherId || '')].sort().join(':');
    return [
      `kyn_x3dh_sessions_v4_${me}_${pair}`,
      `kyn_x3dh_sessions_v3_${me}_${pair}`,
      `kyn_x3dh_sessions_v2_${me}_${pair}`,
    ];
  }

  async function apiBase() { return window.API_BASE_URL || window.BACKEND_URL || ''; }

  async function authHeaders() {
    const token = window.authToken || sessionStorage.getItem('kynecta_auth_token') || localStorage.getItem('kynecta_auth_token') || localStorage.getItem('authToken') || '';
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 12000);
    try {
      return await fetch(`${await apiBase()}${path}`, {
        credentials: 'include', ...options,
        headers: { ...(await authHeaders()), ...(options.headers || {}) },
        signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }
  }

  async function importPrivate(value, usages = ['deriveBits']) { return crypto.subtle.importKey('pkcs8', unb64(value), { name: 'ECDH', namedCurve: 'P-256' }, true, usages); }
  async function importPublic(value) { return crypto.subtle.importKey('spki', unb64(value), { name: 'ECDH', namedCurve: 'P-256' }, true, []); }
  async function exportPrivate(key) { return b64(await crypto.subtle.exportKey('pkcs8', key)); }
  async function exportPublic(key) { return b64(await crypto.subtle.exportKey('spki', key)); }
  async function genSigning() { return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']); }
  async function genPrekey() { return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); }
  async function signPrekey(privateKey, publicKey) { return b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(publicKey))); }

  async function createInitialBundle() {
    const signing = await genSigning();
    const signed = await genPrekey();
    const oneTime = [];
    for (let i = 0; i < PREKEY_TARGET; i++) {
      const keyPair = await genPrekey();
      oneTime.push({ keyId: crypto.randomUUID(), publicKey: await exportPublic(keyPair.publicKey), privateKey: await exportPrivate(keyPair.privateKey) });
    }
    const signingPublicKey = await exportPublic(signing.publicKey);
    const signedPublicKey = await exportPublic(signed.publicKey);
    return {
      version: 4,
      userId: userId(),
      signingPublicKey,
      signingPrivateKey: await exportPrivate(signing.privateKey),
      signedPreKey: { keyId: crypto.randomUUID(), publicKey: signedPublicKey, privateKey: await exportPrivate(signed.privateKey), signature: await signPrekey(signing.privateKey, signedPublicKey) },
      oneTimePreKeys: oneTime,
      createdAt: Date.now(),
    };
  }

  function loadBundle() {
    try { const raw = localStorage.getItem(storageKey()); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }
  function saveBundle(bundle) { localStorage.setItem(storageKey(), JSON.stringify(bundle)); }

  async function serverPrekeyCount() {
    try {
      const response = await request('/api/encryption/prekeys/count');
      if (!response.ok) return null;
      const json = await response.json();
      return Number(json?.data?.count ?? json?.count ?? 0);
    } catch (_) { return null; }
  }

  async function publishBundle(bundle) {
    const oneTimePreKeys = (bundle.oneTimePreKeys || []).map(key => ({ keyId: key.keyId, publicKey: key.publicKey }));
    const response = await request('/api/encryption/prekeys', {
      method: 'POST',
      body: JSON.stringify({
        signingPubKey: bundle.signingPublicKey,
        signedPreKey: { keyId: bundle.signedPreKey.keyId, publicKey: bundle.signedPreKey.publicKey, signature: bundle.signedPreKey.signature },
        oneTimePreKeys,
      }),
    });
    if (!response.ok) throw Error(`prekey registration failed: HTTP ${response.status}`);
    return response.json();
  }

  async function replenish(bundle, count) {
    for (let i = 0, n = Math.max(PREKEY_TARGET - count, 0); i < n; i++) {
      const keyPair = await genPrekey();
      bundle.oneTimePreKeys.push({ keyId: crypto.randomUUID(), publicKey: await exportPublic(keyPair.publicKey), privateKey: await exportPrivate(keyPair.privateKey) });
    }
    return bundle;
  }

  async function provisionPrekeys() {
    if (!crypto?.subtle || !userId()) return false;
    let bundle = loadBundle();
    if (!bundle || String(bundle.userId) !== String(userId()) || !bundle.signingPrivateKey || !bundle.signedPreKey) bundle = await createInitialBundle();
    const count = await serverPrekeyCount();
    if (count !== null && count < PREKEY_MINIMUM) bundle = await replenish(bundle, count);
    await publishBundle(bundle);
    saveBundle({ ...bundle, lastPublishedAt: Date.now() });
    return true;
  }

  async function provisionWithRetry() {
    for (let i = 0; i < RETRY_DELAYS.length; i++) {
      try { if (await provisionPrekeys()) return true; }
      catch (error) { console.warn(`[E2E] Prekey bootstrap ${i + 1} failed:`, error?.message || error); }
      await sleep(RETRY_DELAYS[i]);
    }
    return false;
  }

  async function hkdf(raw, info, length = 32) {
    const key = await crypto.subtle.importKey('raw', raw instanceof ArrayBuffer ? raw : raw.buffer, 'HKDF', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(info) }, key, length * 8);
  }
  async function hmac(raw, label) { const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(label)); }
  async function dh(privateKey, publicKey) { return crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256); }
  async function aesKey(raw) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }

  async function aesEncrypt(key, text, associatedData) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: new TextEncoder().encode(associatedData) }, key, new TextEncoder().encode(text));
    return { iv: b64(iv), ct: b64(ciphertext) };
  }

  async function aesDecrypt(key, envelope, associatedData) {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv), tagLength: 128, additionalData: new TextEncoder().encode(associatedData) }, key, unb64(envelope.ct));
    return new TextDecoder().decode(plaintext);
  }

  function pairContext(otherId) { return [String(userId()), String(otherId)].sort().join(':'); }

  function normalizeBundle(json) {
    const value = json?.data || json?.prekeyBundle || json;
    const signed = value?.signedPreKey || value?.signedPrekey || value?.signed_prekey;
    const one = value?.oneTimePreKey || value?.oneTimePrekey || value?.one_time_prekey || (Array.isArray(value?.oneTimePreKeys) ? value.oneTimePreKeys[0] : null);
    return {
      identityPublicKey: value?.identityPublicKey || value?.identityPubKey || value?.publicKey || value?.identityKey || value?.identity?.publicKey,
      signingPubKey: value?.signingPubKey || value?.signingPublicKey || value?.signing_key,
      signedPreKey: signed,
      oneTimePreKey: one,
    };
  }

  async function fetchBundle(id) {
    const response = await request(`/api/encryption/prekeys/${encodeURIComponent(id)}`);
    if (!response.ok) throw Error(`prekey bundle unavailable: HTTP ${response.status}`);
    return normalizeBundle(await response.json());
  }

  async function verifySignedPrekey(bundle) {
    if (!bundle.signingPubKey || !bundle.signedPreKey?.publicKey || !bundle.signedPreKey?.signature) throw Error('recipient signed prekey bundle is incomplete');
    const signingKey = await crypto.subtle.importKey('spki', unb64(bundle.signingPubKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, unb64(bundle.signedPreKey.signature), new TextEncoder().encode(bundle.signedPreKey.publicKey));
    if (!valid) throw Error('recipient signed prekey signature verification failed');
  }

  async function readState(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      let encoded = raw;
      if (window.KynectaE2E?.unwrapFromLocalStorage && raw.startsWith('{')) {
        try { encoded = await window.KynectaE2E.unwrapFromLocalStorage(raw); } catch (_) { return null; }
      }
      return JSON.parse(atob(encoded));
    } catch (_) { return null; }
  }

  async function loadState(chatId, otherId) {
    const canonical = await readState(pairKey(otherId));
    if (canonical) return canonical;
    for (const key of legacyPairKeys(otherId)) {
      const legacy = await readState(key);
      if (legacy) { await saveState(chatId, otherId, legacy); return legacy; }
    }
    return null;
  }

  async function saveState(chatId, otherId, state) {
    const encoded = btoa(JSON.stringify(state));
    if (window.KynectaE2E?.wrapForLocalStorage) {
      try {
        const wrapped = await window.KynectaE2E.wrapForLocalStorage(encoded);
        if (wrapped) { localStorage.setItem(pairKey(otherId), wrapped); return true; }
      } catch (_) {}
    }
    localStorage.setItem(pairKey(otherId), encoded);
    return true;
  }

  // Critical fix: local Promise locks only protected one iframe. MoodChat has
  // multiple iframes/tabs, so two first-contact handshakes could run together,
  // overwrite the same pair state, and make the receiver report a consumed OTPK.
  async function withCrossContextLock(lockName, fn) {
    const fullName = `kynecta-e2e-${userId() || 'anonymous'}-${lockName}`;
    if (navigator.locks?.request) return navigator.locks.request(fullName, { mode: 'exclusive' }, fn);
    const previous = locks.get(fullName) || Promise.resolve();
    const running = previous.catch(() => {}).then(fn);
    const tracked = running.finally(() => { if (locks.get(fullName) === tracked) locks.delete(fullName); });
    locks.set(fullName, tracked);
    return tracked;
  }

  async function x3dhInitiate(chatId, recipientId) {
    const existing = await loadState(chatId, recipientId);
    if (existing) return { state: existing, bootstrap: null };

    const bundle = await fetchBundle(recipientId);
    await verifySignedPrekey(bundle);
    if (!bundle.identityPublicKey) throw Error('recipient identity public key missing from prekey bundle');

    const myIdentityPrivateKey = window.KynectaE2E.getMyIdentityPrivateKey();
    if (!myIdentityPrivateKey) throw Error('local identity key is not ready');

    const identityPublicKey = await importPublic(bundle.identityPublicKey);
    const signedPrekeyPublicKey = await importPublic(bundle.signedPreKey.publicKey);
    const ephemeral = await genPrekey();
    const ephemeralPublicKey = await exportPublic(ephemeral.publicKey);

    const parts = [
      await dh(myIdentityPrivateKey, signedPrekeyPublicKey),
      await dh(ephemeral.privateKey, identityPublicKey),
      await dh(ephemeral.privateKey, signedPrekeyPublicKey),
    ];
    if (bundle.oneTimePreKey?.publicKey) parts.push(await dh(ephemeral.privateKey, await importPublic(bundle.oneTimePreKey.publicKey)));

    const material = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) { material.set(new Uint8Array(part), offset); offset += part.byteLength; }

    const root = b64(await hkdf(material.buffer, 'Kynecta-X3DH-v1-root', 32));
    const initSend = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-send', 32));
    const initRecv = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-recv', 32));

    const state = {
      v: 5, root, initiator: String(userId()), sendChain: initSend, recvChain: initRecv,
      sendN: 0, recvN: 0, peerId: String(recipientId), signedPreKeyId: bundle.signedPreKey.keyId,
      oneTimePreKeyId: bundle.oneTimePreKey?.keyId || null, recvCache: {}, establishedAt: Date.now(),
    };
    await saveState(chatId, recipientId, state);

    return {
      state,
      bootstrap: {
        x3dh: 1,
        initiatorId: String(userId()),
        identityPublicKey: window.KynectaE2E.publicKey,
        ephemeralPublicKey,
        signedPreKeyId: bundle.signedPreKey.keyId,
        oneTimePreKeyId: bundle.oneTimePreKey?.keyId || null,
      },
    };
  }

  async function x3dhAccept(chatId, senderId, bootstrap) {
    if (!bootstrap?.x3dh) throw Error('missing X3DH bootstrap');

    // Idempotency check before OTPK lookup: duplicate first-message delivery
    // must reuse the established pair session instead of consuming a second time.
    const existing = await loadState(chatId, senderId);
    if (existing) return existing;

    const bundle = loadBundle();
    if (!bundle) throw Error('local X3DH private prekey bundle is unavailable');
    const signed = bundle.signedPreKey?.keyId === bootstrap.signedPreKeyId ? bundle.signedPreKey : null;
    if (!signed) throw Error('signed prekey used by sender is no longer available');

    const one = (bundle.oneTimePreKeys || []).find(key => key.keyId === bootstrap.oneTimePreKeyId);
    const myIdentityPrivateKey = window.KynectaE2E.getMyIdentityPrivateKey();
    if (!myIdentityPrivateKey) throw Error('local identity key is not ready');

    const initiatorIdentityPublicKey = await importPublic(bootstrap.identityPublicKey);
    const initiatorEphemeralPublicKey = await importPublic(bootstrap.ephemeralPublicKey);
    const signedPrivateKey = await importPrivate(signed.privateKey);
    const parts = [
      await dh(signedPrivateKey, initiatorIdentityPublicKey),
      await dh(myIdentityPrivateKey, initiatorEphemeralPublicKey),
      await dh(signedPrivateKey, initiatorEphemeralPublicKey),
    ];

    if (bootstrap.oneTimePreKeyId) {
      if (!one) throw Error('one-time prekey already consumed');
      parts.push(await dh(await importPrivate(one.privateKey), initiatorEphemeralPublicKey));
    }

    const material = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) { material.set(new Uint8Array(part), offset); offset += part.byteLength; }

    const root = b64(await hkdf(material.buffer, 'Kynecta-X3DH-v1-root', 32));
    const initSend = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-send', 32));
    const initRecv = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-recv', 32));
    const state = {
      v: 5, root, initiator: String(senderId), sendChain: initRecv, recvChain: initSend,
      sendN: 0, recvN: 0, peerId: String(senderId), signedPreKeyId: signed.keyId,
      oneTimePreKeyId: bootstrap.oneTimePreKeyId || null, recvCache: {}, establishedAt: Date.now(),
    };

    // Persist session before deleting the local private OTPK so a suspended or
    // duplicated context cannot end up with a consumed key and no session.
    const saved = await saveState(chatId, senderId, state);
    if (saved && one) {
      bundle.oneTimePreKeys = (bundle.oneTimePreKeys || []).filter(key => key.keyId !== one.keyId);
      saveBundle(bundle);
    }
    return state;
  }

  async function deriveMessageKey(chain) {
    const messageKey = await hmac(unb64(chain), 'msg');
    const next = await hmac(unb64(chain), 'next');
    return { mk: messageKey, next: b64(next) };
  }

  async function secureEncrypt(original, plaintext, chatId, recipientId, opts) {
    return withCrossContextLock(`send-${recipientId}`, async () => {
      let state = await loadState(chatId, recipientId);
      let bootstrap = null;
      if (!state) {
        const init = await x3dhInitiate(chatId, recipientId);
        state = init.state;
        bootstrap = init.bootstrap;
      }

      const step = await deriveMessageKey(state.sendChain);
      const key = await aesKey(step.mk);
      const messageNumber = state.sendN++;
      state.sendChain = step.next;
      await saveState(chatId, recipientId, state);
      const envelope = await aesEncrypt(key, plaintext, `${pairContext(recipientId)}|${messageNumber}`);
      return JSON.stringify({ v: 3, kid: window.KynectaE2E.keyId, sid: `${state.initiator}:${state.peerId}`, n: messageNumber, iv: envelope.iv, ct: envelope.ct, ...(bootstrap ? { x3dh: bootstrap } : {}) });
    });
  }

  async function secureDecrypt(original, encrypted, chatId, senderId) {
    return withCrossContextLock(`recv-${senderId}`, async () => {
      let envelope;
      try { envelope = JSON.parse(encrypted); } catch (_) { return original(encrypted, chatId, senderId); }
      if (!envelope || ![3, 4].includes(Number(envelope.v))) return original(encrypted, chatId, senderId);

      let state = await loadState(chatId, senderId);
      if (!state && envelope.x3dh) state = await x3dhAccept(chatId, senderId, envelope.x3dh);
      if (!state) return '[Encrypted message — secure session unavailable]';

      state.recvCache = state.recvCache || {};
      const cacheKey = `${envelope.sid || senderId}:${envelope.n}`;
      if (Object.prototype.hasOwnProperty.call(state.recvCache, cacheKey)) return state.recvCache[cacheKey];
      if (envelope.n < state.recvN || envelope.n > state.recvN + MAX_SKEW) return '[Encrypted message — invalid message sequence]';

      while (state.recvN < envelope.n) {
        const skipped = await deriveMessageKey(state.recvChain);
        state.recvChain = skipped.next;
        state.recvN++;
      }

      const step = await deriveMessageKey(state.recvChain);
      const key = await aesKey(step.mk);
      try {
        const text = await aesDecrypt(key, envelope, `${pairContext(senderId)}|${envelope.n}`);
        state.recvChain = step.next;
        state.recvN++;
        state.recvCache[cacheKey] = text;
        const cacheKeys = Object.keys(state.recvCache);
        if (cacheKeys.length > 100) delete state.recvCache[cacheKeys[0]];
        await saveState(chatId, senderId, state);
        return text;
      } catch (_) { return '[Decryption failed]'; }
    });
  }

  function installSecureTransport() {
    if (!window.KynectaE2E || window.KynectaE2E.__kynectaX3DHTransportV5) return;
    const originalEncrypt = window.KynectaE2E.encryptForChat;
    const originalDecrypt = window.KynectaE2E.decryptFromChat;
    const originalDisplay = window.KynectaE2E.decryptMessageForDisplay;
    if (typeof originalEncrypt !== 'function' || typeof originalDecrypt !== 'function') return;

    window.KynectaE2E.encryptForChat = (plaintext, chatId, recipientId, opts) => secureEncrypt(originalEncrypt, plaintext, chatId, recipientId, opts);
    window.KynectaE2E.decryptFromChat = (encrypted, chatId, senderId) => secureDecrypt(originalDecrypt, encrypted, chatId, senderId);

    if (typeof originalDisplay === 'function') {
      window.KynectaE2E.decryptMessageForDisplay = async function (message, chatId, currentUserId, opts = {}) {
        const content = message?.content;
        let envelope = null;
        try { envelope = typeof content === 'string' ? JSON.parse(content) : null; } catch (_) {}
        if (!envelope || ![3, 4].includes(Number(envelope.v))) return originalDisplay(message, chatId, currentUserId, opts);

        const resolved = window.KynectaE2E.resolveMessageCryptoPeer?.(message, currentUserId, opts.activeConversation);
        const peer = resolved?.peerUserId || message?.senderId || message?.sender?.id;
        if (!peer) return opts.fallbackText || '🔒 Encrypted message';

        try {
          const text = await secureDecrypt(originalDecrypt, content, chatId, String(peer));
          return typeof text === 'string' && !text.startsWith('[') ? text : (opts.fallbackText || '🔒 Encrypted message');
        } catch (error) {
          console.warn('[E2E/X3DH] Display decrypt failed:', error?.message || error);
          return opts.fallbackText || '🔒 Encrypted message';
        }
      };
    }

    Object.defineProperty(window.KynectaE2E, '__kynectaX3DHTransportV5', { value: true, enumerable: false });
    console.log('[E2E/X3DH] cross-context locked, pair-keyed first-contact transport installed');
  }

  async function bootstrapE2E() {
    if (!window.KynectaE2E) return false;
    let password = null;
    let legacy = null;
    try {
      password = sessionStorage.getItem('kyn_e2e_pw_session');
      legacy = sessionStorage.getItem('kyn_e2e_pw_legacy_session');
    } catch (_) {}
    if (!password) return false;

    const ready = await window.KynectaE2E.init(password, legacy);
    if (!ready && !window.KynectaE2E.enabled) return false;
    const prekeysReady = await provisionWithRetry();
    installSecureTransport();

    try {
      document.dispatchEvent(new CustomEvent('kyn:e2eProvisioned', { detail: { userId: userId(), identityReady: !!window.KynectaE2E.enabled, prekeysReady } }));
    } catch (_) {}
    return !!window.KynectaE2E.enabled;
  }

  function tryInitE2E() {
    if (!window.KynectaE2E) return setTimeout(tryInitE2E, 150);
    if (window.KynectaE2E.enabled && !provisioningPromise) {
      provisioningPromise = provisionWithRetry().catch(() => false);
      installSecureTransport();
      return;
    }

    let password = null;
    try { password = sessionStorage.getItem('kyn_e2e_pw_session'); } catch (_) {}
    if (!password) return setTimeout(tryInitE2E, 500);

    if (!provisioningPromise) {
      provisioningPromise = bootstrapE2E().catch(error => {
        console.warn('[E2E] bootstrap failed:', error?.message || error);
        provisioningPromise = null;
        return false;
      });
      provisioningPromise.then(ok => { if (!ok) setTimeout(tryInitE2E, 2000); });
    }
  }

  tryInitE2E();
  document.addEventListener('kyn:e2eUnlockRetry', () => { provisioningPromise = null; tryInitE2E(); });
  window.addEventListener('kyn:loggedIn', () => { provisioningPromise = null; tryInitE2E(); });
})();
