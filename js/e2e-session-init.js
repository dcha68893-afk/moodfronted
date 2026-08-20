/**
 * Kynecta authenticated E2E bootstrap + first-contact X3DH transport.
 * Existing-file repair: one canonical pair-keyed session, deterministic
 * first-contact/reload handling, and resilient receive/display recovery.
 */
(function () {
  'use strict';

  const PREKEY_TARGET = 50;
  const PREKEY_MINIMUM = 10;
  const PREKEY_STORAGE = 'kyn_x3dh_prekeys_v1';
  const SESSION_STORAGE = 'kyn_x3dh_sessions_v7';
  const LEGACY_SESSION_STORAGE = ['kyn_x3dh_sessions_v6','kyn_x3dh_sessions_v5','kyn_x3dh_sessions_v4','kyn_x3dh_sessions_v3','kyn_x3dh_sessions_v2'];
  const RETRY_DELAYS = [1000,2500,5000,10000,30000];
  const MAX_SKEW = 100;
  const locks = new Map();
  let provisioningPromise = null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  function userId() {
    try { const id = window.SessionManager?.getCurrentUserId?.(); if (id != null) return String(id); } catch (_) {}
    try { const id = window.KynectaE2E?.getMyUserId?.(); if (id != null) return String(id); } catch (_) {}
    try { const p = JSON.parse(localStorage.getItem('kynecta_auth') || 'null'); const id = p?.user?.id || p?.userId; if (id != null) return String(id); } catch (_) {}
    return null;
  }
  function storageKey() { const id = userId(); return id ? `${PREKEY_STORAGE}_${id}` : PREKEY_STORAGE; }
  function pairKey(otherId) { const me = userId(); const pair = [String(me || ''), String(otherId || '')].sort().join(':'); return `${SESSION_STORAGE}_${me}_${pair}`; }
  function legacyPairKeys(otherId) { const me = userId(); const pair = [String(me || ''), String(otherId || '')].sort().join(':'); return LEGACY_SESSION_STORAGE.map(v => `${v}_${me}_${pair}`); }
  async function apiBase() { return window.API_BASE_URL || window.BACKEND_URL || ''; }
  async function authHeaders() { const token = window.authToken || sessionStorage.getItem('kynecta_auth_token') || localStorage.getItem('kynecta_auth_token') || localStorage.getItem('authToken') || ''; return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }; }
  async function request(path, options = {}) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), options.timeout || 12000); try { return await fetch(`${await apiBase()}${path}`, { credentials: 'include', ...options, headers: { ...(await authHeaders()), ...(options.headers || {}) }, signal: controller.signal }); } finally { clearTimeout(timeout); } }
  async function importPrivate(x, usages = ['deriveBits']) { return crypto.subtle.importKey('pkcs8', unb64(x), { name: 'ECDH', namedCurve: 'P-256' }, true, usages); }
  async function importPublic(x) { return crypto.subtle.importKey('spki', unb64(x), { name: 'ECDH', namedCurve: 'P-256' }, true, []); }
  async function exportPrivate(k) { return b64(await crypto.subtle.exportKey('pkcs8', k)); }
  async function exportPublic(k) { return b64(await crypto.subtle.exportKey('spki', k)); }
  async function genSigning() { return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify']); }
  async function genPrekey() { return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); }
  async function signPrekey(priv, pub) { return b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(pub))); }

  async function createInitialBundle() {
    const signing = await genSigning(); const signed = await genPrekey(); const one = [];
    for (let i = 0; i < PREKEY_TARGET; i++) { const kp = await genPrekey(); one.push({ keyId: crypto.randomUUID(), publicKey: await exportPublic(kp.publicKey), privateKey: await exportPrivate(kp.privateKey) }); }
    const signingPublicKey = await exportPublic(signing.publicKey); const signedPublicKey = await exportPublic(signed.publicKey);
    return { version: 5, userId: userId(), signingPublicKey, signingPrivateKey: await exportPrivate(signing.privateKey), signedPreKey: { keyId: crypto.randomUUID(), publicKey: signedPublicKey, privateKey: await exportPrivate(signed.privateKey), signature: await signPrekey(signing.privateKey, signedPublicKey) }, oneTimePreKeys: one, createdAt: Date.now() };
  }
  function loadBundle() { try { const raw = localStorage.getItem(storageKey()); return raw ? JSON.parse(raw) : null; } catch (_) { return null; } }
  function saveBundle(bundle) { localStorage.setItem(storageKey(), JSON.stringify(bundle)); }
  async function serverPrekeyCount() { try { const r = await request('/api/encryption/prekeys/count'); if (!r.ok) return null; const j = await r.json(); return Number(j?.data?.count ?? j?.count ?? 0); } catch (_) { return null; } }
  async function publishBundle(bundle) { const one = (bundle.oneTimePreKeys || []).map(k => ({ keyId: k.keyId, publicKey: k.publicKey })); const r = await request('/api/encryption/prekeys', { method: 'POST', body: JSON.stringify({ signingPubKey: bundle.signingPublicKey, signedPreKey: { keyId: bundle.signedPreKey.keyId, publicKey: bundle.signedPreKey.publicKey, signature: bundle.signedPreKey.signature }, oneTimePreKeys: one }) }); if (!r.ok) throw Error(`prekey registration failed: HTTP ${r.status}`); return r.json(); }
  async function replenish(bundle, count) { const needed = Math.max(PREKEY_TARGET - count, 0); for (let i = 0; i < needed; i++) { const kp = await genPrekey(); bundle.oneTimePreKeys.push({ keyId: crypto.randomUUID(), publicKey: await exportPublic(kp.publicKey), privateKey: await exportPrivate(kp.privateKey) }); } return bundle; }
  async function provisionPrekeys() { if (!crypto?.subtle || !userId() || !window.KynectaE2E?.enabled) return false; let bundle = loadBundle(); if (!bundle || String(bundle.userId) !== String(userId()) || !bundle.signingPrivateKey || !bundle.signedPreKey?.privateKey) bundle = await createInitialBundle(); const count = await serverPrekeyCount(); if (count !== null && count < PREKEY_MINIMUM) bundle = await replenish(bundle, count); await publishBundle(bundle); saveBundle({ ...bundle, lastPublishedAt: Date.now() }); return true; }
  async function provisionWithRetry() { for (let i = 0; i < RETRY_DELAYS.length; i++) { try { if (await provisionPrekeys()) return true; } catch (e) { console.warn(`[E2E] Prekey bootstrap ${i + 1} failed:`, e?.message || e); } await sleep(RETRY_DELAYS[i]); } return false; }
  async function hkdf(raw, info, len = 32) { const source = raw instanceof ArrayBuffer ? raw : raw.buffer; const k = await crypto.subtle.importKey('raw', source, 'HKDF', false, ['deriveBits']); return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(info) }, k, len * 8); }
  async function hmac(raw, label) { const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(label)); }
  async function dh(priv, pub) { return crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256); }
  async function aesKey(raw) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt','decrypt']); }
  async function aesEncrypt(key, text, ad) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: new TextEncoder().encode(ad) }, key, new TextEncoder().encode(text)); return { iv: b64(iv), ct: b64(ct) }; }
  async function aesDecrypt(key, env, ad) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv), tagLength: 128, additionalData: new TextEncoder().encode(ad) }, key, unb64(env.ct)); return new TextDecoder().decode(pt); }
  function pairContextForState(state, fallbackPeerId) { const a = state?.initiator != null ? String(state.initiator) : null; const b = state?.peerId != null ? String(state.peerId) : (fallbackPeerId != null ? String(fallbackPeerId) : null); if (a && b) return [a, b].sort().join(':'); const me = userId(); return [String(me || ''), String(fallbackPeerId || '')].sort().join(':'); }
  function pairContext(otherId) { return [String(userId() || ''), String(otherId || '')].sort().join(':'); }

  function normalizeBundle(json) { const x = json?.data || json?.prekeyBundle || json; const signed = x?.signedPreKey || x?.signedPrekey || x?.signed_prekey; const one = x?.oneTimePreKey || x?.oneTimePrekey || x?.one_time_prekey || (Array.isArray(x?.oneTimePreKeys) ? x.oneTimePreKeys[0] : null); return { identityPublicKey: x?.identityPublicKey || x?.identityPubKey || x?.publicKey || x?.identityKey || x?.identity?.publicKey, signingPubKey: x?.signingPubKey || x?.signingPublicKey || x?.signing_key, signedPreKey: signed, oneTimePreKey: one }; }
  async function fetchBundle(id) { const r = await request(`/api/encryption/prekeys/${encodeURIComponent(id)}`); if (!r.ok) throw Error(`prekey bundle unavailable: HTTP ${r.status}`); return normalizeBundle(await r.json()); }
  async function verifySignedPrekey(bundle) { if (!bundle.signingPubKey || !bundle.signedPreKey?.publicKey || !bundle.signedPreKey?.signature) throw Error('recipient signed prekey bundle is incomplete'); const key = await crypto.subtle.importKey('spki', unb64(bundle.signingPubKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64(bundle.signedPreKey.signature), new TextEncoder().encode(bundle.signedPreKey.publicKey)); if (!ok) throw Error('recipient signed prekey signature verification failed'); }
  async function readState(key) { const raw = localStorage.getItem(key); if (!raw) return null; try { let encoded = raw; if (window.KynectaE2E?.unwrapFromLocalStorage && raw.startsWith('{')) encoded = await window.KynectaE2E.unwrapFromLocalStorage(raw); return JSON.parse(atob(encoded)); } catch (_) { return null; } }
  async function loadState(chatId, otherId) { const canonical = await readState(pairKey(otherId)); if (canonical) return canonical; for (const key of legacyPairKeys(otherId)) { const legacy = await readState(key); if (legacy) { await saveState(chatId, otherId, legacy); return legacy; } } return null; }
  async function saveState(chatId, otherId, state) { const encoded = btoa(JSON.stringify(state)); if (window.KynectaE2E?.wrapForLocalStorage) { try { const wrapped = await window.KynectaE2E.wrapForLocalStorage(encoded); if (wrapped) { localStorage.setItem(pairKey(otherId), wrapped); return true; } } catch (_) {} } localStorage.setItem(pairKey(otherId), encoded); return true; }
  async function withCrossContextLock(name, fn) { const lockName = `kynecta-e2e-${userId() || 'anonymous'}-${name}`; if (navigator.locks?.request) return navigator.locks.request(lockName, { mode: 'exclusive' }, fn); const previous = locks.get(lockName) || Promise.resolve(); const running = previous.catch(() => {}).then(fn); const tracked = running.finally(() => { if (locks.get(lockName) === tracked) locks.delete(lockName); }); locks.set(lockName, tracked); return tracked; }
  function isNewBootstrap(existing, bootstrap, peerId) { if (!bootstrap?.x3dh || !existing) return !!bootstrap?.x3dh; if (String(existing.peerId) !== String(peerId)) return true; if (String(existing.initiator) !== String(bootstrap.initiatorId)) return true; if (String(existing.signedPreKeyId || '') !== String(bootstrap.signedPreKeyId || '')) return true; if (String(existing.bootstrap?.ephemeralPublicKey || '') !== String(bootstrap.ephemeralPublicKey || '')) return true; if (String(existing.oneTimePreKeyId || '') !== String(bootstrap.oneTimePreKeyId || '')) return true; return false; }

  async function x3dhInitiate(chatId, recipientId) {
    const existing = await loadState(chatId, recipientId); if (existing) return { state: existing, bootstrap: null };
    const bundle = await fetchBundle(recipientId); await verifySignedPrekey(bundle); if (!bundle.identityPublicKey) throw Error('recipient identity public key missing from prekey bundle');
    const myIdentity = window.KynectaE2E.getMyIdentityPrivateKey(); if (!myIdentity) throw Error('local identity key is not ready');
    const recipientIdentity = await importPublic(bundle.identityPublicKey); const signedPreKey = await importPublic(bundle.signedPreKey.publicKey); const ephemeral = await genPrekey(); const ephemeralPublicKey = await exportPublic(ephemeral.publicKey);
    const parts = [await dh(myIdentity, signedPreKey), await dh(ephemeral.privateKey, recipientIdentity), await dh(ephemeral.privateKey, signedPreKey)]; if (bundle.oneTimePreKey?.publicKey) parts.push(await dh(ephemeral.privateKey, await importPublic(bundle.oneTimePreKey.publicKey)));
    const material = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0)); let offset = 0; for (const part of parts) { material.set(new Uint8Array(part), offset); offset += part.byteLength; }
    const root = b64(await hkdf(material.buffer, 'Kynecta-X3DH-v1-root', 32)); const initSend = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-send', 32)); const initRecv = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-recv', 32));
    const bootstrap = { x3dh: 1, initiatorId: String(userId()), identityPublicKey: window.KynectaE2E.publicKey, ephemeralPublicKey, signedPreKeyId: bundle.signedPreKey.keyId, oneTimePreKeyId: bundle.oneTimePreKey?.keyId || null };
    const state = { v: 7, root, initiator: String(userId()), sendChain: initSend, recvChain: initRecv, sendN: 0, recvN: 0, peerId: String(recipientId), signedPreKeyId: bundle.signedPreKey.keyId, oneTimePreKeyId: bundle.oneTimePreKey?.keyId || null, bootstrap, recvCache: {}, establishedAt: Date.now() };
    await saveState(chatId, recipientId, state); return { state, bootstrap };
  }

  async function x3dhAccept(chatId, senderId, bootstrap, forceReplace = false) {
    if (!bootstrap?.x3dh) throw Error('missing X3DH bootstrap'); const existing = await loadState(chatId, senderId); if (existing && !forceReplace && !isNewBootstrap(existing, bootstrap, senderId)) return existing;
    const bundle = loadBundle(); if (!bundle) throw Error('local X3DH private prekey bundle is unavailable'); const signed = bundle.signedPreKey?.keyId === bootstrap.signedPreKeyId ? bundle.signedPreKey : null; if (!signed) throw Error('signed prekey used by sender is no longer available');
    const one = bootstrap.oneTimePreKeyId ? (bundle.oneTimePreKeys || []).find(k => k.keyId === bootstrap.oneTimePreKeyId) : null; if (bootstrap.oneTimePreKeyId && !one) throw Error('one-time prekey already consumed or unavailable'); const myIdentity = window.KynectaE2E.getMyIdentityPrivateKey(); if (!myIdentity) throw Error('local identity key is not ready');
    const senderIdentity = await importPublic(bootstrap.identityPublicKey); const senderEphemeral = await importPublic(bootstrap.ephemeralPublicKey); const signedPrivate = await importPrivate(signed.privateKey);
    const parts = [await dh(signedPrivate, senderIdentity), await dh(myIdentity, senderEphemeral), await dh(signedPrivate, senderEphemeral)]; if (bootstrap.oneTimePreKeyId) parts.push(await dh(await importPrivate(one.privateKey), senderEphemeral));
    const material = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0)); let offset = 0; for (const part of parts) { material.set(new Uint8Array(part), offset); offset += part.byteLength; }
    const root = b64(await hkdf(material.buffer, 'Kynecta-X3DH-v1-root', 32)); const initSend = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-send', 32)); const initRecv = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-recv', 32));
    const state = { v: 7, root, initiator: String(senderId), sendChain: initRecv, recvChain: initSend, sendN: 0, recvN: 0, peerId: String(senderId), signedPreKeyId: signed.keyId, oneTimePreKeyId: bootstrap.oneTimePreKeyId || null, bootstrap, recvCache: {}, establishedAt: Date.now() };
    await saveState(chatId, senderId, state); if (one) { bundle.oneTimePreKeys = (bundle.oneTimePreKeys || []).filter(k => k.keyId !== one.keyId); saveBundle(bundle); } return state;
  }

  async function deriveMessageKey(chain) { const mk = await hmac(unb64(chain), 'msg'); const next = await hmac(unb64(chain), 'next'); return { mk, next: b64(next) }; }
  async function secureEncrypt(original, plaintext, chatId, recipientId, opts) {
    return withCrossContextLock(`send-${recipientId}`, async () => {
      let state = await loadState(chatId, recipientId); let bootstrap = null; if (!state) { const init = await x3dhInitiate(chatId, recipientId); state = init.state; bootstrap = init.bootstrap; }
      if (!state?.sendChain) throw Error('secure session send chain unavailable'); const step = await deriveMessageKey(state.sendChain); const key = await aesKey(step.mk); const n = state.sendN++; state.sendChain = step.next; await saveState(chatId, recipientId, state);
      const env = await aesEncrypt(key, plaintext, `${pairContextForState(state, recipientId)}|${n}`);
      return JSON.stringify({ v: 3, kid: window.KynectaE2E.keyId, sid: `${state.initiator}:${state.peerId}`, n, iv: env.iv, ct: env.ct, ...(bootstrap ? { x3dh: bootstrap } : {}) });
    });
  }

  async function secureDecrypt(original, encrypted, chatId, senderId) {
    return withCrossContextLock(`recv-${senderId}`, async () => {
      let env; try { env = JSON.parse(encrypted); } catch (_) { return original(encrypted, chatId, senderId); }
      if (!env || ![3,4].includes(Number(env.v))) return original(encrypted, chatId, senderId);
      let state = await loadState(chatId, senderId);
      if (env.x3dh && isNewBootstrap(state, env.x3dh, senderId)) state = await x3dhAccept(chatId, senderId, env.x3dh, true); else if (!state && env.x3dh) state = await x3dhAccept(chatId, senderId, env.x3dh, false);
      if (!state) return '[Encrypted message — secure session unavailable]';
      state.recvCache = state.recvCache || {}; const cacheKey = `${env.sid || senderId}:${env.n}`; if (Object.prototype.hasOwnProperty.call(state.recvCache, cacheKey)) return state.recvCache[cacheKey];
      if (env.n < state.recvN) return '[Encrypted message — message already processed]'; if (env.n > state.recvN + MAX_SKEW) return '[Encrypted message — invalid message sequence]';
      const context = `${pairContextForState(state, senderId)}|${env.n}`;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          let working = state; while (working.recvN < env.n) { const skipped = await deriveMessageKey(working.recvChain); working.recvChain = skipped.next; working.recvN++; }
          const step = await deriveMessageKey(working.recvChain); const key = await aesKey(step.mk); const text = await aesDecrypt(key, env, context);
          working.recvChain = step.next; working.recvN++; working.recvCache[cacheKey] = text; const keys = Object.keys(working.recvCache); if (keys.length > 100) delete working.recvCache[keys[0]]; await saveState(chatId, senderId, working);
          console.log('[E2E/X3DH] DECRYPT_SUCCESS', { chatId, senderId, n: env.n, attempt: attempt + 1 }); return text;
        } catch (e) { console.warn('[E2E/X3DH] decrypt attempt failed', { chatId, senderId, n: env.n, attempt: attempt + 1, error: e?.message || e }); if (attempt < 3) await sleep([100,300,800][attempt]); }
      }
      return '[Decryption failed]';
    });
  }

  function installSecureTransport() {
    if (!window.KynectaE2E || window.KynectaE2E.__kynectaX3DHTransportV7) return;
    const originalEncrypt = window.KynectaE2E.encryptForChat; const originalDecrypt = window.KynectaE2E.decryptFromChat; const originalDisplay = window.KynectaE2E.decryptMessageForDisplay;
    if (typeof originalEncrypt !== 'function' || typeof originalDecrypt !== 'function') return;
    window.KynectaE2E.encryptForChat = (plaintext, chatId, recipientId, opts) => secureEncrypt(originalEncrypt, plaintext, chatId, recipientId, opts);
    window.KynectaE2E.decryptFromChat = (enc, chatId, senderId) => secureDecrypt(originalDecrypt, enc, chatId, senderId);
    if (typeof originalDisplay === 'function') {
      // FIX (X3DH-QUEUE-BYPASS): this override used to run its own fixed
      // ~5s/6-attempt retry loop and then permanently return fallbackText —
      // completely bypassing e2e-encryption.js's shared _pendingDecryptQueue/
      // isMessageQueued()/onResolved machinery that messages-ui.js's render
      // paths depend on to tell "still queued, don't show a stuck
      // placeholder" apart from "genuinely, permanently failed" (see
      // PLACEHOLDER-STICKS-ON-FIRST-MESSAGE in e2e-encryption.js). Because
      // secureEncrypt() above is what every real send actually produces
      // (v:3 envelopes) once this transport is installed, EVERY live
      // message went through this bypassed path — so isMessageQueued()
      // always reported false for it, and any decrypt that didn't finish
      // inside that fixed ~5s window (the ordinary case for first contact,
      // where x3dhAccept has to fetch the sender's prekey bundle over the
      // network — see the "cold Render backend" wake-up handling elsewhere
      // in this codebase for why that can plausibly take longer) was shown
      // as a PERMANENT failure the instant the window closed, even though
      // the session would have completed and decrypted correctly moments
      // later. Registering into the shared queue instead gives this path
      // the same bounded-but-persistent backoff (holds at 15s, never gives
      // up), the same event-driven retry on 'kyn:e2eUnlocked'/
      // 'kyn:e2eKeyAvailable' (the X3DH handshake completing is exactly
      // such an event), and the same onResolved/isMessageQueued contract
      // every other caller already relies on.
      window.KynectaE2E.decryptMessageForDisplay = async function (message, chatId, currentUserId, opts = {}) {
        const content = message?.content; let env = null; try { env = typeof content === 'string' ? JSON.parse(content) : null; } catch (_) {}
        if (!env || ![3,4].includes(Number(env.v))) return originalDisplay(message, chatId, currentUserId, opts);
        const resolved = window.KynectaE2E.resolveMessageCryptoPeer?.(message, currentUserId, opts.activeConversation); const peer = resolved?.peerUserId || message?.senderId || message?.sender?.id;
        const fallbackText = opts.fallbackText || 'New message received';
        if (!peer) return fallbackText;
        const messageId = String((message && (message.id || message.localId || message.serverId)) || `${chatId}:${content}`);
        if (typeof window.KynectaE2E.registerPendingDecrypt === 'function') {
          const result = await window.KynectaE2E.registerPendingDecrypt(
            messageId,
            () => secureDecrypt(originalDecrypt, content, chatId, String(peer)),
            opts.onResolved
          );
          return result.ok ? result.plaintext : fallbackText;
        }
        // Fallback if an older e2e-encryption.js without registerPendingDecrypt
        // is somehow loaded — preserve the original bounded loop rather than
        // fail outright, instead of assuming the new export is always present.
        for (let attempt = 0; attempt < 6; attempt++) {
          try { const text = await secureDecrypt(originalDecrypt, content, chatId, String(peer)); if (typeof text === 'string' && !text.startsWith('[')) return text; } catch (e) { console.warn('[E2E/X3DH] display decrypt retry failed:', e?.message || e); }
          if (attempt < 5) await sleep([100,250,500,1000,2000][attempt]);
        }
        return fallbackText;
      };
    }
    Object.defineProperty(window.KynectaE2E, '__kynectaX3DHTransportV7', { value: true, enumerable: false }); console.log('[E2E/X3DH] pair-keyed X3DH transport installed');
  }

  async function bootstrapE2E() {
    if (!window.KynectaE2E) return false; let pw = null, legacy = null; try { pw = sessionStorage.getItem('kyn_e2e_pw_session'); legacy = sessionStorage.getItem('kyn_e2e_pw_legacy_session'); } catch (_) {}
    if (!pw) return false; const ready = await window.KynectaE2E.init(pw, legacy); if (!ready && !window.KynectaE2E.enabled) return false; const prekeysReady = await provisionWithRetry(); installSecureTransport();
    try { document.dispatchEvent(new CustomEvent('kyn:e2eProvisioned', { detail: { userId: userId(), identityReady: !!window.KynectaE2E.enabled, prekeysReady } })); } catch (_) {}
    return !!window.KynectaE2E.enabled && prekeysReady;
  }
  function tryInitE2E() {
    if (!window.KynectaE2E) return setTimeout(tryInitE2E, 150);
    if (window.KynectaE2E.enabled && !provisioningPromise) { provisioningPromise = provisionWithRetry().catch(() => false); installSecureTransport(); return; }
    let pw = null; try { pw = sessionStorage.getItem('kyn_e2e_pw_session'); } catch (_) {}
    if (!pw) return setTimeout(tryInitE2E, 500);
    if (!provisioningPromise) { provisioningPromise = bootstrapE2E().catch(e => { console.warn('[E2E] bootstrap failed:', e?.message || e); provisioningPromise = null; return false; }); provisioningPromise.then(ok => { if (!ok) setTimeout(tryInitE2E, 2000); }); }
  }
  tryInitE2E();
  document.addEventListener('kyn:e2eUnlockRetry', () => { provisioningPromise = null; tryInitE2E(); });
  document.addEventListener('kyn:e2eUnlocked', () => { provisioningPromise = null; tryInitE2E(); });
  window.addEventListener('kyn:loggedIn', () => { provisioningPromise = null; tryInitE2E(); });
})();