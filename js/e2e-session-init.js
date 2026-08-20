/**
 * Shared E2E bootstrap for every window/iframe that loads e2e-encryption.js.
 *
 * Identity and X3DH prekeys are initialized at authenticated-session startup,
 * not when a chat panel is opened. This removes the old dependency on Chat
 * History being opened first.
 */
(function () {
  'use strict';

  const PREKEY_TARGET = 50;
  const PREKEY_MINIMUM = 10;
  const PREKEY_STORAGE = 'kyn_x3dh_prekeys_v1';
  const SESSION_STORAGE = 'kyn_x3dh_sessions_v2';
  const RETRY_DELAYS = [1000, 2500, 5000, 10000, 30000];
  let provisioningPromise = null;

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  function userId() {
    try { if (window.SessionManager?.getCurrentUserId) { const id = window.SessionManager.getCurrentUserId(); if (id) return String(id); } } catch (_) {}
    try { if (window.KynectaE2E?.getMyUserId) { const id = window.KynectaE2E.getMyUserId(); if (id) return String(id); } } catch (_) {}
    try { const raw = localStorage.getItem('kynecta_auth'); const p = raw ? JSON.parse(raw) : null; return p?.user?.id || p?.userId ? String(p.user?.id || p.userId) : null; } catch (_) { return null; }
  }
  function storageKey() { const uid = userId(); return uid ? `${PREKEY_STORAGE}_${uid}` : PREKEY_STORAGE; }
  function sessionKey(chatId, otherId) { const me = userId(); const pair = [String(me || ''), String(otherId || '')].sort().join(':'); return `${SESSION_STORAGE}_${me}_${pair}`; }
  async function apiBase() { return window.API_BASE_URL || window.BACKEND_URL || ''; }
  async function authHeaders() {
    const token = window.authToken || sessionStorage.getItem('kynecta_auth_token') || localStorage.getItem('kynecta_auth_token') || localStorage.getItem('authToken') || '';
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 12000);
    try { return await fetch(`${await apiBase()}${path}`, { credentials: 'include', ...options, headers: { ...(await authHeaders()), ...(options.headers || {}) }, signal: controller.signal }); }
    finally { clearTimeout(timeout); }
  }
  async function importPrivate(b64pkcs8, usages = ['deriveBits']) { return crypto.subtle.importKey('pkcs8', unb64(b64pkcs8), { name: 'ECDH', namedCurve: 'P-256' }, true, usages); }
  async function importPublic(b64spki) { return crypto.subtle.importKey('spki', unb64(b64spki), { name: 'ECDH', namedCurve: 'P-256' }, true, []); }
  async function exportPrivate(key) { return b64(await crypto.subtle.exportKey('pkcs8', key)); }
  async function exportPublic(key) { return b64(await crypto.subtle.exportKey('spki', key)); }
  async function generateSigningKeyPair() { return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']); }
  async function generatePrekeyPair() { return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); }
  async function signPrekey(signingPrivateKey, signedPrekeyPublicB64) {
    return b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingPrivateKey, new TextEncoder().encode(signedPrekeyPublicB64)));
  }
  async function createInitialBundle() {
    const signing = await generateSigningKeyPair();
    const signed = await generatePrekeyPair();
    const signingPub = await exportPublic(signing.publicKey);
    const signedPub = await exportPublic(signed.publicKey);
    const oneTime = [];
    for (let i = 0; i < PREKEY_TARGET; i++) {
      const kp = await generatePrekeyPair();
      oneTime.push({ keyId: crypto.randomUUID(), publicKey: await exportPublic(kp.publicKey), privateKey: await exportPrivate(kp.privateKey) });
    }
    return {
      version: 2,
      userId: userId(),
      signingPublicKey: signingPub,
      signingPrivateKey: await exportPrivate(signing.privateKey),
      signedPreKey: { keyId: crypto.randomUUID(), publicKey: signedPub, privateKey: await exportPrivate(signed.privateKey), signature: await signPrekey(signing.privateKey, signedPub) },
      oneTimePreKeys: oneTime,
      createdAt: Date.now()
    };
  }
  function loadBundle() { try { const raw = localStorage.getItem(storageKey()); return raw ? JSON.parse(raw) : null; } catch (_) { return null; } }
  function saveBundle(bundle) { localStorage.setItem(storageKey(), JSON.stringify(bundle)); }
  async function serverPrekeyCount() {
    try { const r = await request('/api/encryption/prekeys/count'); if (!r.ok) return null; const j = await r.json(); return Number(j?.data?.count ?? j?.count ?? 0); } catch (_) { return null; }
  }
  async function publishBundle(bundle) {
    const oneTimePreKeys = (bundle.oneTimePreKeys || []).map(k => ({ keyId: k.keyId, publicKey: k.publicKey }));
    const r = await request('/api/encryption/prekeys', { method: 'POST', body: JSON.stringify({ signingPubKey: bundle.signingPublicKey, signedPreKey: { keyId: bundle.signedPreKey.keyId, publicKey: bundle.signedPreKey.publicKey, signature: bundle.signedPreKey.signature }, oneTimePreKeys }) });
    if (!r.ok) throw new Error(`prekey registration failed: HTTP ${r.status}`);
    return r.json();
  }
  async function replenish(bundle, count) {
    const needed = Math.max(PREKEY_TARGET - count, 0);
    for (let i = 0; i < needed; i++) { const kp = await generatePrekeyPair(); bundle.oneTimePreKeys.push({ keyId: crypto.randomUUID(), publicKey: await exportPublic(kp.publicKey), privateKey: await exportPrivate(kp.privateKey) }); }
    return bundle;
  }
  async function provisionPrekeys() {
    if (!crypto?.subtle || !userId()) return false;
    let bundle = loadBundle();
    if (!bundle || String(bundle.userId) !== String(userId()) || !bundle.signingPrivateKey || !bundle.signedPreKey) { bundle = await createInitialBundle(); saveBundle(bundle); }
    let count = await serverPrekeyCount();
    if (count === null) { await publishBundle(bundle); count = PREKEY_TARGET; }
    else if (count < PREKEY_MINIMUM) { bundle = await replenish(bundle, count); saveBundle(bundle); await publishBundle(bundle); }
    bundle.lastPublishedAt = Date.now(); saveBundle(bundle); return true;
  }
  async function provisionWithRetry() {
    for (let i = 0; i < RETRY_DELAYS.length; i++) { try { if (await provisionPrekeys()) return true; } catch (e) { console.warn(`[E2E] Prekey bootstrap attempt ${i + 1} failed:`, e?.message || e); } await sleep(RETRY_DELAYS[i]); }
    return false;
  }

  const PATCH_FLAG = '__kynectaX3DHTransportV2';
  const MAX_SKEW = 100;

  async function hkdf(raw, info, length = 32) {
    const key = await crypto.subtle.importKey('raw', raw instanceof ArrayBuffer ? raw : raw.buffer, 'HKDF', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(info) }, key, length * 8);
  }
  async function hmac(raw, label) {
    const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(label));
  }
  async function dh(priv, pub) { return crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256); }
  async function aesKey(raw) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
  async function aesEncrypt(key, text, ad) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: new TextEncoder().encode(ad) }, key, new TextEncoder().encode(text));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function aesDecrypt(key, env, ad) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv), tagLength: 128, additionalData: new TextEncoder().encode(ad) }, key, unb64(env.ct));
    return new TextDecoder().decode(pt);
  }
  function pairContext(otherId) { const me = userId(); return [String(me), String(otherId)].sort().join(':'); }
  function responseOf(bundle, key) { return key || bundle?.data || bundle?.prekeyBundle || bundle; }
  function normalizeBundle(json) {
    const x = responseOf(json, json?.data);
    const signed = x?.signedPreKey || x?.signedPrekey || x?.signed_prekey;
    const one = x?.oneTimePreKey || x?.oneTimePrekey || x?.one_time_prekey || (Array.isArray(x?.oneTimePreKeys) ? x.oneTimePreKeys[0] : null);
    const identity = x?.identityPublicKey || x?.identityPubKey || x?.publicKey || x?.identityKey || x?.identity?.publicKey;
    return { identityPublicKey: identity, signingPubKey: x?.signingPubKey || x?.signingPublicKey || x?.signing_key, signedPreKey: signed, oneTimePreKey: one };
  }
  async function fetchBundle(recipientId) {
    const r = await request(`/api/encryption/prekeys/${encodeURIComponent(recipientId)}`);
    if (!r.ok) throw new Error(`prekey bundle unavailable: HTTP ${r.status}`);
    return normalizeBundle(await r.json());
  }
  async function verifySignedPrekey(bundle) {
    if (!bundle.signingPubKey || !bundle.signedPreKey?.publicKey || !bundle.signedPreKey?.signature) throw new Error('recipient signed prekey bundle is incomplete');
    const signing = await crypto.subtle.importKey('spki', unb64(bundle.signingPubKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, signing, unb64(bundle.signedPreKey.signature), new TextEncoder().encode(bundle.signedPreKey.publicKey));
    if (!ok) throw new Error('recipient signed prekey signature verification failed');
  }
  async function loadState(chatId, otherId) {
    const raw = localStorage.getItem(sessionKey(chatId, otherId)); if (!raw) return null;
    try {
      let encoded = raw;
      if (window.KynectaE2E?.unwrapFromLocalStorage && raw.startsWith('{')) { try { encoded = await window.KynectaE2E.unwrapFromLocalStorage(raw); } catch (_) {} }
      return JSON.parse(atob(encoded));
    } catch (_) { return null; }
  }
  async function saveState(chatId, otherId, state) {
    const encoded = btoa(JSON.stringify(state));
    if (window.KynectaE2E?.wrapForLocalStorage) { try { const wrapped = await window.KynectaE2E.wrapForLocalStorage(encoded); if (wrapped) { localStorage.setItem(sessionKey(chatId, otherId), wrapped); return; } } catch (_) {} }
    localStorage.setItem(sessionKey(chatId, otherId), encoded);
  }
  async function x3dhInitiate(chatId, recipientId) {
    const bundle = await fetchBundle(recipientId);
    await verifySignedPrekey(bundle);
    if (!bundle.identityPublicKey) throw new Error('recipient identity public key missing from prekey bundle');
    const myIdentityPriv = window.KynectaE2E.getMyIdentityPrivateKey();
    if (!myIdentityPriv) throw new Error('local identity key is not ready');
    const ikb = await importPublic(bundle.identityPublicKey);
    const spkb = await importPublic(bundle.signedPreKey.publicKey);
    const eph = await generatePrekeyPair();
    const ekaPub = await exportPublic(eph.publicKey);
    const dh1 = await dh(myIdentityPriv, spkb);
    const dh2 = await dh(eph.privateKey, ikb);
    const dh3 = await dh(eph.privateKey, spkb);
    let dh4 = new ArrayBuffer(0);
    if (bundle.oneTimePreKey?.publicKey) dh4 = await dh(eph.privateKey, await importPublic(bundle.oneTimePreKey.publicKey));
    const material = new Uint8Array(dh1.byteLength + dh2.byteLength + dh3.byteLength + dh4.byteLength);
    let off = 0; for (const part of [dh1, dh2, dh3, dh4]) { material.set(new Uint8Array(part), off); off += part.byteLength; }
    const root = b64(await hkdf(material.buffer, 'Kynecta-X3DH-v1-root', 32));
    const initSend = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-send', 32));
    const initRecv = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-recv', 32));
    const state = { v: 2, root, initiator: String(userId()), sendChain: initSend, recvChain: initRecv, sendN: 0, recvN: 0, peerId: String(recipientId), signedPreKeyId: bundle.signedPreKey.keyId, oneTimePreKeyId: bundle.oneTimePreKey?.keyId || null, establishedAt: Date.now() };
    await saveState(chatId, recipientId, state);
    return { state, bootstrap: { x3dh: 1, initiatorId: String(userId()), identityPublicKey: window.KynectaE2E.publicKey, ephemeralPublicKey: ekaPub, signedPreKeyId: bundle.signedPreKey.keyId, oneTimePreKeyId: bundle.oneTimePreKey?.keyId || null } };
  }
  async function x3dhAccept(chatId, senderId, bootstrap) {
    if (!bootstrap?.x3dh) throw new Error('missing X3DH bootstrap');
    const bundle = loadBundle();
    if (!bundle) throw new Error('local X3DH private prekey bundle is unavailable');
    const signed = bundle.signedPreKey?.keyId === bootstrap.signedPreKeyId ? bundle.signedPreKey : null;
    if (!signed) throw new Error('signed prekey used by sender is no longer available');
    const one = (bundle.oneTimePreKeys || []).find(k => k.keyId === bootstrap.oneTimePreKeyId);
    const myIdentityPriv = window.KynectaE2E.getMyIdentityPrivateKey();
    const ika = await importPublic(bootstrap.identityPublicKey);
    const eka = await importPublic(bootstrap.ephemeralPublicKey);
    const dh1 = await dh(signed.privateKey ? await importPrivate(signed.privateKey) : null, ika);
    const dh2 = await dh(myIdentityPriv, eka);
    const dh3 = await dh(signed.privateKey ? await importPrivate(signed.privateKey) : null, eka);
    let dh4 = new ArrayBuffer(0);
    if (bootstrap.oneTimePreKeyId) { if (!one) throw new Error('one-time prekey already consumed'); dh4 = await dh(await importPrivate(one.privateKey), eka); }
    const material = new Uint8Array(dh1.byteLength + dh2.byteLength + dh3.byteLength + dh4.byteLength);
    let off = 0; for (const part of [dh1, dh2, dh3, dh4]) { material.set(new Uint8Array(part), off); off += part.byteLength; }
    const root = b64(await hkdf(material.buffer, 'Kynecta-X3DH-v1-root', 32));
    const initSend = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-send', 32));
    const initRecv = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-recv', 32));
    const state = { v: 2, root, initiator: String(senderId), sendChain: initRecv, recvChain: initSend, sendN: 0, recvN: 0, peerId: String(senderId), signedPreKeyId: signed.keyId, oneTimePreKeyId: bootstrap.oneTimePreKeyId || null, establishedAt: Date.now() };
    await saveState(chatId, senderId, state);
    if (one) { bundle.oneTimePreKeys = (bundle.oneTimePreKeys || []).filter(k => k.keyId !== one.keyId); saveBundle(bundle); }
    return state;
  }
  async function deriveMessageKey(chainB64) { const mk = await hmac(unb64(chainB64), 'msg'); const next = await hmac(unb64(chainB64), 'next'); return { mk, next: b64(next) }; }

  async function secureEncrypt(original, plaintext, chatId, recipientId, opts) {
    const existing = await loadState(chatId, recipientId);
    let state = existing;
    let bootstrap = null;
    if (!state) { const init = await x3dhInitiate(chatId, recipientId); state = init.state; bootstrap = init.bootstrap; }
    const step = await deriveMessageKey(state.sendChain);
    const key = await aesKey(step.mk);
    const n = state.sendN++;
    state.sendChain = step.next;
    await saveState(chatId, recipientId, state);
    const env = await aesEncrypt(key, plaintext, `${pairContext(recipientId)}|${n}`);
    return JSON.stringify({ v: 3, kid: window.KynectaE2E.keyId, sid: `${state.initiator}:${state.peerId}`, n, iv: env.iv, ct: env.ct, ...(bootstrap ? { x3dh: bootstrap } : {}) });
  }
  async function secureDecrypt(original, encContent, chatId, senderId) {
    let env; try { env = JSON.parse(encContent); } catch (_) { return original(encContent, chatId, senderId); }
    if (!env || env.v !== 3) return original(encContent, chatId, senderId);
    let state = await loadState(chatId, senderId);
    if (!state && env.x3dh) state = await x3dhAccept(chatId, senderId, env.x3dh);
    if (!state) return '[Encrypted message — secure session unavailable]';
    if (env.n < state.recvN || env.n > state.recvN + MAX_SKEW) return '[Encrypted message — invalid message sequence]';
    while (state.recvN < env.n) { const skipped = await deriveMessageKey(state.recvChain); state.recvChain = skipped.next; state.recvN++; }
    const step = await deriveMessageKey(state.recvChain);
    const key = await aesKey(step.mk);
    try {
      const text = await aesDecrypt(key, env, `${pairContext(senderId)}|${env.n}`);
      state.recvChain = step.next; state.recvN++;
      await saveState(chatId, senderId, state);
      return text;
    } catch (_) { return '[Decryption failed]'; }
  }
  function installSecureTransport() {
    if (!window.KynectaE2E || window.KynectaE2E[PATCH_FLAG]) return;
    const originalEncrypt = window.KynectaE2E.encryptForChat;
    const originalDecrypt = window.KynectaE2E.decryptFromChat;
    const originalDisplay = window.KynectaE2E.decryptMessageForDisplay;
    if (typeof originalEncrypt !== 'function' || typeof originalDecrypt !== 'function') return;
    const wrapped = async function (plaintext, chatId, recipientId, opts) {
      try { return await secureEncrypt(originalEncrypt, plaintext, chatId, recipientId, opts); }
      catch (e) { console.warn('[E2E/X3DH] secure send failed:', e?.message || e); throw e; }
    };
    const decrypt = async function (enc, chatId, senderId) { return secureDecrypt(originalDecrypt, enc, chatId, senderId); };
    window.KynectaE2E.encryptForChat = wrapped;
    window.KynectaE2E.decryptFromChat = decrypt;

    // IMPORTANT: decryptMessageForDisplay() is implemented inside
    // e2e-encryption.js and its lexical call to decryptFromChat() does not
    // observe a later replacement of window.KynectaE2E.decryptFromChat.
    // The X3DH transport therefore used to work for direct decrypt callers,
    // while the canonical UI/notification display service still invoked the
    // old v1 decrypt function. v3 envelopes were consequently returned as
    // ciphertext and rendered as "Encrypted message".
    // Keep the existing public display API, but route v3 envelopes through
    // the active X3DH decryptor before falling back to the original display
    // service for v1/plaintext messages.
    if (typeof originalDisplay === 'function') {
      window.KynectaE2E.decryptMessageForDisplay = async function (message, chatId, currentUserId, opts = {}) {
        const content = message?.content;
        let envelope = null;
        try { envelope = typeof content === 'string' ? JSON.parse(content) : null; } catch (_) {}
        if (!envelope || envelope.v !== 3) {
          return originalDisplay(message, chatId, currentUserId, opts);
        }

        const resolved = typeof window.KynectaE2E.resolveMessageCryptoPeer === 'function'
          ? window.KynectaE2E.resolveMessageCryptoPeer(message, currentUserId, opts.activeConversation)
          : null;
        const peerUserId = resolved?.peerUserId || message?.senderId || message?.sender?.id;
        if (!peerUserId) return opts.fallbackText || '🔒 Encrypted message';

        const fallback = opts.fallbackText || '🔒 Encrypted message';
        try {
          const text = await secureDecrypt(originalDecrypt, content, chatId, String(peerUserId));
          if (typeof text === 'string' && text.startsWith('[')) {
            // The X3DH session can legitimately be unavailable for a short
            // period during first-contact bootstrap. Never expose ciphertext;
            // the caller's existing display fallback remains safe.
            return fallback;
          }
          return text;
        } catch (e) {
          console.warn('[E2E/X3DH] Display decrypt failed:', e?.message || e);
          return fallback;
        }
      };
    }

    Object.defineProperty(window.KynectaE2E, PATCH_FLAG, { value: true, enumerable: false });
    console.log('[E2E/X3DH] ✅ First-contact X3DH + persistent message-chain transport installed');
  }

  async function bootstrapE2E() {
    if (!window.KynectaE2E) return false;
    let password = null, legacyPassword = null;
    try { password = sessionStorage.getItem('kyn_e2e_pw_session'); legacyPassword = sessionStorage.getItem('kyn_e2e_pw_legacy_session'); } catch (_) {}
    if (!password) return false;
    const identityReady = await window.KynectaE2E.init(password, legacyPassword);
    if (!identityReady && !window.KynectaE2E.enabled) return false;
    const prekeysReady = await provisionWithRetry();
    installSecureTransport();
    if (!prekeysReady) console.warn('[E2E] Identity is initialized, but X3DH prekey publication is still pending.');
    try { document.dispatchEvent(new CustomEvent('kyn:e2eProvisioned', { detail: { userId: userId(), identityReady: !!window.KynectaE2E.enabled, prekeysReady } })); } catch (_) {}
    return !!window.KynectaE2E.enabled;
  }
  function tryInitE2E() {
    if (!window.KynectaE2E) return setTimeout(tryInitE2E, 150);
    if (window.KynectaE2E.enabled && !provisioningPromise) { provisioningPromise = provisionWithRetry().catch(() => false); installSecureTransport(); return; }
    let password = null; try { password = sessionStorage.getItem('kyn_e2e_pw_session'); } catch (_) {}
    if (!password) return setTimeout(tryInitE2E, 500);
    if (!provisioningPromise) { provisioningPromise = bootstrapE2E().catch(err => { console.warn('[E2E] Bootstrap failed; retrying:', err?.message || err); provisioningPromise = null; return false; }); provisioningPromise.then(ok => { if (!ok) setTimeout(tryInitE2E, 2000); }); }
  }
  tryInitE2E();
  document.addEventListener('kyn:e2eUnlockRetry', () => { provisioningPromise = null; tryInitE2E(); });
  window.addEventListener('kyn:loggedIn', () => { provisioningPromise = null; tryInitE2E(); });
})();