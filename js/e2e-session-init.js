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

  // FIX (OWN-ECHO-USES-WRONG-CHAIN — root cause of every OWN sent message
  // permanently failing to decrypt on reload, "[E2E/X3DH] decrypt attempt
  // failed ... OperationError", exhausting all 4 attempts every time):
  // secureDecrypt() below derives message keys exclusively from
  // state.recvChain/state.recvN. That's correct for messages the OTHER
  // party sent us (their sendChain matches our recvChain by construction —
  // see x3dhInitiate/x3dhAccept). It is NEVER correct for our own messages
  // coming back from message history/socket echo: those were encrypted with
  // OUR sendChain at OUR sendN at send time — a completely different key
  // than anything recvChain will ever produce for that same n. No amount of
  // retrying fixes this; the key is simply, permanently wrong. The one-way
  // hash ratchet also means we can't "walk sendChain backwards" to recover
  // an old sendN's key after further messages have advanced it.
  // The fix: remember the plaintext ourselves at the moment WE encrypt it
  // (we already have it in hand — no decrypt required), keyed by the exact
  // (sid, n) pair that appears in the envelope we produced. On any later
  // redisplay of that same envelope (page reload, history refetch, a second
  // tab), secureDecrypt() checks this cache FIRST, before ever touching
  // recvChain, and returns the remembered plaintext directly. A genuine
  // incoming message from the peer will never be present in this cache (we
  // never encrypted it), so it falls through to the normal recvChain path
  // unaffected. Persisted to localStorage (not just memory) specifically so
  // it survives the page reload / "Load earlier messages" case this bug was
  // reported against — that's exactly when history gets re-fed through
  // decryptMessageForDisplay for messages already shown once as their own
  // fresh compose-box echo.
  const SENT_CACHE_STORAGE = 'kyn_x3dh_sent_cache_v1';
  const SENT_CACHE_MAX = 1000;
  function sentCacheKey() { const id = userId(); return id ? `${SENT_CACHE_STORAGE}_${id}` : SENT_CACHE_STORAGE; }
  // FIX (STORAGE-DURABILITY — Phase 1 redesign): all reads/writes below now
  // go through window.KynectaE2EStore (e2e-store-v2.js, IndexedDB-backed)
  // when available, with the original localStorage calls kept only as a
  // fallback for the (very rare) environment where IndexedDB truly can't be
  // opened. This file must load AFTER e2e-store-v2.js.
  const _store = () => window.KynectaE2EStore || null;
  async function _kvGet(key) { const s = _store(); if (s) return s.get(key); try { return localStorage.getItem(key); } catch (_) { return null; } }
  async function _kvSet(key, value) { const s = _store(); if (s) return s.set(key, value); try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
  async function _kvArchiveBeforeOverwrite(key) { const s = _store(); if (s) return s.archiveBeforeOverwrite(key); return false; }

  async function loadSentCache() { try { const raw = await _kvGet(sentCacheKey()); return raw ? JSON.parse(raw) : {}; } catch (_) { return {}; } }
  async function saveSentCache(cache) { try { await _kvSet(sentCacheKey(), JSON.stringify(cache)); } catch (_) {} }
  // Accepts either rememberSent(mid, plaintext) — Phase 2's per-message id,
  // shared across all of a recipient's per-device sub-envelopes — or the
  // legacy rememberSent(sid, n, plaintext) two-part key, still produced by
  // the v3/v4 single-envelope path for backward compatibility.
  async function rememberSent(a, b, c) {
    const key = c === undefined ? String(a) : `${a}:${b}`;
    const plaintext = c === undefined ? b : c;
    try {
      const cache = await loadSentCache();
      cache[key] = plaintext;
      const keys = Object.keys(cache);
      if (keys.length > SENT_CACHE_MAX) { keys.slice(0, keys.length - SENT_CACHE_MAX).forEach(k => delete cache[k]); }
      await saveSentCache(cache);
    } catch (_) {}
  }
  async function recallSent(a, b) {
    const key = b === undefined ? String(a) : `${a}:${b}`;
    const cache = await loadSentCache();
    return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : undefined;
  }

  // FIX (INSTRUMENT-IDENTIFIER-CONSISTENCY): single consistently-tagged
  // trace line for every stage that touches senderId/receiverId/chatId/
  // kid/sid/n/session-state so a permanent per-message failure (like the
  // AAD mismatch fixed below) is diagnosable directly from the console
  // instead of requiring a source read every time. Mirrors the
  // [MsgLifecycle] tracing added to MessageLifecycleClient.js.
  function _e2eTrace(stage, extra) {
    try { console.log(`[E2E/X3DH][trace] ${stage}`, extra || ''); } catch (_) {}
  }

  function userId() {
    try { const id = window.SessionManager?.getCurrentUserId?.(); if (id != null) return String(id); } catch (_) {}
    try { const id = window.KynectaE2E?.getMyUserId?.(); if (id != null) return String(id); } catch (_) {}
    try { const p = JSON.parse(localStorage.getItem('kynecta_auth') || 'null'); const id = p?.user?.id || p?.userId; if (id != null) return String(id); } catch (_) {}
    return null;
  }
  function storageKey() { const id = userId(); return id ? `${PREKEY_STORAGE}_${id}` : PREKEY_STORAGE; }
  // Phase 2 (multi-device): pairKey/legacyPairKeys are now keyed on the
  // PEER's device too, not just the peer's user id — each of a peer's
  // devices runs its own independent ratchet session with us, exactly like
  // Signal treats each linked device as a separate session partner. A
  // peerDeviceId of 'primary' (the default) reproduces the pre-multi-device
  // key exactly, so existing single-device sessions are found unchanged.
  let _cachedDeviceId = null;
  async function myDeviceId() { if (_cachedDeviceId) return _cachedDeviceId; _cachedDeviceId = (await (window.KynectaE2EStore?.getOrCreateDeviceId?.() ?? Promise.resolve('primary'))) || 'primary'; return _cachedDeviceId; }
  async function registerThisDevice() { try { await request('/api/encryption/devices', { method: 'POST', body: JSON.stringify({ deviceId: await myDeviceId(), deviceName: (navigator.userAgentData?.platform || navigator.platform || 'web'), platform: 'web' }) }); } catch (e) { console.warn('[E2E] device registration failed:', e?.message || e); } }
  async function peerDevices(otherId) {
    try {
      const r = await request(`/api/encryption/devices/${encodeURIComponent(otherId)}`);
      if (!r.ok) return [{ deviceId: 'primary' }];
      const j = await r.json();
      const devices = j?.data?.devices;
      return Array.isArray(devices) && devices.length ? devices : [{ deviceId: 'primary' }];
    } catch (_) { return [{ deviceId: 'primary' }]; }
  }
  function pairKey(otherId, otherDeviceId) { const me = userId(); const dev = otherDeviceId || 'primary'; const pair = [String(me || ''), `${String(otherId || '')}#${dev}`].sort().join(':'); return `${SESSION_STORAGE}_${me}_${pair}`; }
  function legacyPairKeys(otherId) { const me = userId(); const pair = [String(me || ''), String(otherId || '')].sort().join(':'); return LEGACY_SESSION_STORAGE.map(v => `${v}_${me}_${pair}`); }
  async function apiBase() { return window.API_BASE_URL || window.BACKEND_URL || ''; }
  async function authHeaders() { const token = window.authToken || sessionStorage.getItem('kynecta_auth_token') || localStorage.getItem('kynecta_auth_token') || localStorage.getItem('authToken') || ''; return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }; }
  async function request(path, options = {}) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), options.timeout || 12000); try { return await fetch(`${await apiBase()}${path}`, { credentials: 'include', cache: 'no-store', ...options, headers: { ...(await authHeaders()), ...(options.headers || {}) }, signal: controller.signal }); } finally { clearTimeout(timeout); } }
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
  async function loadBundle() { try { const raw = await _kvGet(storageKey()); return raw ? JSON.parse(raw) : null; } catch (_) { return null; } }
  async function saveBundle(bundle) { await _kvSet(storageKey(), JSON.stringify(bundle)); }
  async function serverPrekeyCount() { try { const r = await request(`/api/encryption/prekeys/count?deviceId=${encodeURIComponent(await myDeviceId())}`); if (!r.ok) return null; const j = await r.json(); return Number(j?.data?.count ?? j?.count ?? 0); } catch (_) { return null; } }
  async function publishBundle(bundle) { const one = (bundle.oneTimePreKeys || []).map(k => ({ keyId: k.keyId, publicKey: k.publicKey })); const r = await request('/api/encryption/prekeys', { method: 'POST', body: JSON.stringify({ deviceId: await myDeviceId(), signingPubKey: bundle.signingPublicKey, signedPreKey: { keyId: bundle.signedPreKey.keyId, publicKey: bundle.signedPreKey.publicKey, signature: bundle.signedPreKey.signature }, oneTimePreKeys: one }) }); if (!r.ok) throw Error(`prekey registration failed: HTTP ${r.status}`); return r.json(); }
  async function replenish(bundle, count) { const needed = Math.max(PREKEY_TARGET - count, 0); for (let i = 0; i < needed; i++) { const kp = await genPrekey(); bundle.oneTimePreKeys.push({ keyId: crypto.randomUUID(), publicKey: await exportPublic(kp.publicKey), privateKey: await exportPrivate(kp.privateKey) }); } return bundle; }
  async function provisionPrekeys() { if (!crypto?.subtle || !userId() || !window.KynectaE2E?.enabled) return false; await registerThisDevice(); let bundle = await loadBundle(); if (!bundle || String(bundle.userId) !== String(userId()) || !bundle.signingPrivateKey || !bundle.signedPreKey?.privateKey) bundle = await createInitialBundle(); const count = await serverPrekeyCount(); if (count !== null && count < PREKEY_MINIMUM) bundle = await replenish(bundle, count); await publishBundle(bundle); await saveBundle({ ...bundle, lastPublishedAt: Date.now() }); return true; }
  async function provisionWithRetry() { for (let i = 0; i < RETRY_DELAYS.length; i++) { try { if (await provisionPrekeys()) return true; } catch (e) { console.warn(`[E2E] Prekey bootstrap ${i + 1} failed:`, e?.message || e); } await sleep(RETRY_DELAYS[i]); } return false; }
  async function hkdf(raw, info, len = 32) { const source = raw instanceof ArrayBuffer ? raw : raw.buffer; const k = await crypto.subtle.importKey('raw', source, 'HKDF', false, ['deriveBits']); return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(info) }, k, len * 8); }
  async function hmac(raw, label) { const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(label)); }
  async function dh(priv, pub) { return crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256); }
  async function aesKey(raw) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt','decrypt']); }
  async function aesEncrypt(key, text, ad) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: new TextEncoder().encode(ad) }, key, new TextEncoder().encode(text)); return { iv: b64(iv), ct: b64(ct) }; }
  async function aesDecrypt(key, env, ad) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv), tagLength: 128, additionalData: new TextEncoder().encode(ad) }, key, unb64(env.ct)); return new TextDecoder().decode(pt); }
  // FIX (AAD-CONTEXT-MISMATCH — root cause of permanent "[E2E/X3DH] decrypt
  // attempt failed ... OperationError" on every single incoming message):
  // this used to pair state.initiator with state.peerId as "the two parties"
  // for the AES-GCM additionalData context. That's correct for a SENDER's
  // state (x3dhInitiate sets initiator = self, peerId = recipient — two
  // different ids), but wrong for a RECEIVER's state: x3dhAccept sets BOTH
  // initiator and peerId to the sender's id (initiator = who initiated the
  // handshake, peerId = "the other party relative to me" — both correctly
  // evaluate to the sender from the receiver's point of view), so the
  // receiver's own id never entered the pair at all. Concretely, for a
  // conversation between A (sender) and B (receiver):
  //   sender computes context   = sort(A, B)   (state.initiator=A, state.peerId=B)
  //   receiver computed context = sort(A, A)   (state.initiator=A, state.peerId=A)
  // Those two strings are never equal for A != B, so the AES-GCM
  // additionalData never matched between encryptor and decryptor — the
  // integrity check was guaranteed to fail on every message, for every
  // receiver, unconditionally. state.peerId alone is *always* "the other
  // party relative to whoever owns this state object" (true in both
  // x3dhInitiate and x3dhAccept — verified above); pairing it with a fresh
  // userId() (my own id) instead of state.initiator is what actually
  // reconstructs the same two-party set on both ends.
  function pairContextForState(state, fallbackPeerId) {
    const me = userId();
    const peer = state?.peerId != null ? String(state.peerId) : (fallbackPeerId != null ? String(fallbackPeerId) : null);
    if (me && peer) return [String(me), peer].sort().join(':');
    // Defensive fallback only — no state created by x3dhInitiate/x3dhAccept
    // in this file should ever reach here, since both always set peerId.
    const a = state?.initiator != null ? String(state.initiator) : null;
    if (a && peer) return [a, peer].sort().join(':');
    return [String(me || ''), String(fallbackPeerId || '')].sort().join(':');
  }
  function pairContext(otherId) { return [String(userId() || ''), String(otherId || '')].sort().join(':'); }

  function normalizeBundle(json) { const x = json?.data || json?.prekeyBundle || json; const signed = x?.signedPreKey || x?.signedPrekey || x?.signed_prekey; const one = x?.oneTimePreKey || x?.oneTimePrekey || x?.one_time_prekey || (Array.isArray(x?.oneTimePreKeys) ? x.oneTimePreKeys[0] : null); return { identityPublicKey: x?.identityPublicKey || x?.identityPubKey || x?.publicKey || x?.identityKey || x?.identity?.publicKey, signingPubKey: x?.signingPubKey || x?.signingPublicKey || x?.signing_key, signedPreKey: signed, oneTimePreKey: one }; }
  async function fetchBundle(id, deviceId) { const q = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ''; const r = await request(`/api/encryption/prekeys/${encodeURIComponent(id)}${q}`); if (!r.ok) throw Error(`prekey bundle unavailable: HTTP ${r.status}`); return normalizeBundle(await r.json()); }
  async function verifySignedPrekey(bundle) { if (!bundle.signingPubKey || !bundle.signedPreKey?.publicKey || !bundle.signedPreKey?.signature) throw Error('recipient signed prekey bundle is incomplete'); const key = await crypto.subtle.importKey('spki', unb64(bundle.signingPubKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64(bundle.signedPreKey.signature), new TextEncoder().encode(bundle.signedPreKey.publicKey)); if (!ok) throw Error('recipient signed prekey signature verification failed'); }
  async function readState(key) { const raw = await _kvGet(key); if (!raw) return null; try { let encoded = raw; if (window.KynectaE2E?.unwrapFromLocalStorage && raw.startsWith('{')) encoded = await window.KynectaE2E.unwrapFromLocalStorage(raw); return JSON.parse(atob(encoded)); } catch (_) { return null; } }
  async function loadState(chatId, otherId, otherDeviceId) {
    const canonical = await readState(pairKey(otherId, otherDeviceId)); if (canonical) return canonical;
    // Legacy (pre-multi-device) sessions were never device-scoped — only
    // worth checking as a fallback for the 'primary' device, since that's
    // the only device a legacy session could ever have meant.
    if (!otherDeviceId || otherDeviceId === 'primary') {
      for (const key of legacyPairKeys(otherId)) { const legacy = await readState(key); if (legacy) { await saveState(chatId, otherId, legacy, 'primary'); return legacy; } }
    }
    return null;
  }
  // FIX (NEVER-SILENTLY-DISCARD — Phase 1 redesign): every write here used
  // to be a bare localStorage.setItem() that clobbered whatever was there.
  // If isNewBootstrap() or a version migration ever made a wrong call about
  // treating an existing session as stale, the previous (possibly still
  // valid, possibly the ONLY copy of the keys needed for old messages)
  // state was gone with no trace. archiveBeforeOverwrite() keeps a copy in
  // a separate, never-auto-read archive store first — turns a silent
  // unrecoverable loss into something a future "recover archived session"
  // tool (or manual devtools console call to
  // window.KynectaE2EStore.recoverArchived(key)) can actually get back.
  async function saveState(chatId, otherId, state, otherDeviceId) { const key = pairKey(otherId, otherDeviceId); await _kvArchiveBeforeOverwrite(key); const encoded = btoa(JSON.stringify(state)); if (window.KynectaE2E?.wrapForLocalStorage) { try { const wrapped = await window.KynectaE2E.wrapForLocalStorage(encoded); if (wrapped) { await _kvSet(key, wrapped); return true; } } catch (_) {} } await _kvSet(key, encoded); return true; }
  async function withCrossContextLock(name, fn) { const lockName = `kynecta-e2e-${userId() || 'anonymous'}-${name}`; if (navigator.locks?.request) return navigator.locks.request(lockName, { mode: 'exclusive' }, fn); const previous = locks.get(lockName) || Promise.resolve(); const running = previous.catch(() => {}).then(fn); const tracked = running.finally(() => { if (locks.get(lockName) === tracked) locks.delete(lockName); }); locks.set(lockName, tracked); return tracked; }
  function isNewBootstrap(existing, bootstrap, peerId) { if (!bootstrap?.x3dh || !existing) return !!bootstrap?.x3dh; if (String(existing.peerId) !== String(peerId)) return true; if (String(existing.initiator) !== String(bootstrap.initiatorId)) return true; if (String(existing.signedPreKeyId || '') !== String(bootstrap.signedPreKeyId || '')) return true; if (String(existing.bootstrap?.ephemeralPublicKey || '') !== String(bootstrap.ephemeralPublicKey || '')) return true; if (String(existing.oneTimePreKeyId || '') !== String(bootstrap.oneTimePreKeyId || '')) return true; return false; }

  async function x3dhInitiate(chatId, recipientId, recipientDeviceId) {
    const targetDevice = recipientDeviceId || 'primary';
    const existing = await loadState(chatId, recipientId, targetDevice); if (existing) return { state: existing, bootstrap: null };
    _e2eTrace('X3DH_INITIATE_NEW_SESSION', { chatId, recipientId, recipientDeviceId: targetDevice, me: userId() });
    const bundle = await fetchBundle(recipientId, targetDevice); await verifySignedPrekey(bundle); if (!bundle.identityPublicKey) throw Error('recipient identity public key missing from prekey bundle');
    const myIdentity = window.KynectaE2E.getMyIdentityPrivateKey(); if (!myIdentity) throw Error('local identity key is not ready');
    const recipientIdentity = await importPublic(bundle.identityPublicKey); const signedPreKey = await importPublic(bundle.signedPreKey.publicKey); const ephemeral = await genPrekey(); const ephemeralPublicKey = await exportPublic(ephemeral.publicKey);
    const parts = [await dh(myIdentity, signedPreKey), await dh(ephemeral.privateKey, recipientIdentity), await dh(ephemeral.privateKey, signedPreKey)]; if (bundle.oneTimePreKey?.publicKey) parts.push(await dh(ephemeral.privateKey, await importPublic(bundle.oneTimePreKey.publicKey)));
    const material = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0)); let offset = 0; for (const part of parts) { material.set(new Uint8Array(part), offset); offset += part.byteLength; }
    const root = b64(await hkdf(material.buffer, 'Kynecta-X3DH-v1-root', 32)); const initSend = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-send', 32)); const initRecv = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-recv', 32));
    // senderDeviceId (MY device) rides along in the bootstrap so that when
    // the recipient's device runs x3dhAccept, it knows which of MY devices
    // this session belongs to — mirrors recipientDeviceId, which is instead
    // tracked implicitly by which device's bundle we fetched above.
    const bootstrap = { x3dh: 1, initiatorId: String(userId()), senderDeviceId: await myDeviceId(), identityPublicKey: window.KynectaE2E.publicKey, ephemeralPublicKey, signedPreKeyId: bundle.signedPreKey.keyId, oneTimePreKeyId: bundle.oneTimePreKey?.keyId || null };
    // NOTE ON `initiator` vs `peerId`: initiator = whoever started this X3DH
    // handshake (here, me); peerId = "the other party relative to whoever
    // owns this state object" (here, recipientId). peerId is what
    // pairContextForState() above relies on, and is set correctly and
    // consistently in both this function and x3dhAccept below.
    const state = { v: 7, root, initiator: String(userId()), sendChain: initSend, recvChain: initRecv, sendN: 0, recvN: 0, peerId: String(recipientId), peerDeviceId: targetDevice, signedPreKeyId: bundle.signedPreKey.keyId, oneTimePreKeyId: bundle.oneTimePreKey?.keyId || null, bootstrap, recvCache: {}, establishedAt: Date.now() };
    await saveState(chatId, recipientId, state, targetDevice);
    _e2eTrace('X3DH_INITIATE_SESSION_SAVED', { chatId, recipientId, recipientDeviceId: targetDevice, initiator: state.initiator, peerId: state.peerId });
    return { state, bootstrap };
  }

  async function x3dhAccept(chatId, senderId, bootstrap, forceReplace = false) {
    if (!bootstrap?.x3dh) throw Error('missing X3DH bootstrap');
    // Phase 2: which of the SENDER's devices this handshake is with. Old
    // bootstraps (pre-multi-device senders) never set this — 'primary'
    // reproduces the exact single-device key/behavior for them.
    const senderDeviceId = bootstrap.senderDeviceId || 'primary';
    const existing = await loadState(chatId, senderId, senderDeviceId); if (existing && !forceReplace && !isNewBootstrap(existing, bootstrap, senderId)) return existing;
    _e2eTrace('X3DH_ACCEPT_NEW_SESSION', { chatId, senderId, senderDeviceId, me: userId(), forceReplace, hadExisting: !!existing });
    const bundle = await loadBundle(); if (!bundle) throw Error('local X3DH private prekey bundle is unavailable'); const signed = bundle.signedPreKey?.keyId === bootstrap.signedPreKeyId ? bundle.signedPreKey : null; if (!signed) throw Error('signed prekey used by sender is no longer available');
    const one = bootstrap.oneTimePreKeyId ? (bundle.oneTimePreKeys || []).find(k => k.keyId === bootstrap.oneTimePreKeyId) : null; if (bootstrap.oneTimePreKeyId && !one) throw Error('one-time prekey already consumed or unavailable'); const myIdentity = window.KynectaE2E.getMyIdentityPrivateKey(); if (!myIdentity) throw Error('local identity key is not ready');
    const senderIdentity = await importPublic(bootstrap.identityPublicKey); const senderEphemeral = await importPublic(bootstrap.ephemeralPublicKey); const signedPrivate = await importPrivate(signed.privateKey);
    const parts = [await dh(signedPrivate, senderIdentity), await dh(myIdentity, senderEphemeral), await dh(signedPrivate, senderEphemeral)]; if (bootstrap.oneTimePreKeyId) parts.push(await dh(await importPrivate(one.privateKey), senderEphemeral));
    const material = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0)); let offset = 0; for (const part of parts) { material.set(new Uint8Array(part), offset); offset += part.byteLength; }
    const root = b64(await hkdf(material.buffer, 'Kynecta-X3DH-v1-root', 32)); const initSend = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-send', 32)); const initRecv = b64(await hkdf(unb64(root), 'Kynecta-X3DH-v1-init-recv', 32));
    // Same note as x3dhInitiate: initiator = who started the handshake
    // (the sender, senderId) — separate concept from peerId, which is
    // *also* senderId here because that's correctly "the other party
    // relative to me" from this (the receiver's) point of view. My own id
    // is never stored on this object; pairContextForState() gets it fresh
    // from userId() instead, so it doesn't need to be.
    const state = { v: 7, root, initiator: String(senderId), sendChain: initRecv, recvChain: initSend, sendN: 0, recvN: 0, peerId: String(senderId), peerDeviceId: senderDeviceId, signedPreKeyId: signed.keyId, oneTimePreKeyId: bootstrap.oneTimePreKeyId || null, bootstrap, recvCache: {}, establishedAt: Date.now() };
    await saveState(chatId, senderId, state, senderDeviceId); if (one) { bundle.oneTimePreKeys = (bundle.oneTimePreKeys || []).filter(k => k.keyId !== one.keyId); await saveBundle(bundle); }
    _e2eTrace('X3DH_ACCEPT_SESSION_SAVED', { chatId, senderId, senderDeviceId, initiator: state.initiator, peerId: state.peerId, me: userId() });
    return state;
  }

  async function deriveMessageKey(chain) { const mk = await hmac(unb64(chain), 'msg'); const next = await hmac(unb64(chain), 'next'); return { mk, next: b64(next) }; }

  // Phase 2 (multi-device) envelope: one logical message, individually
  // encrypted per recipient device (each device runs its own ratchet
  // session with us — see pairKey()/x3dhInitiate() above). `mid` is a
  // per-message id shared across every per-device sub-envelope, purely so
  // OUR OWN client can recognize "I already have the plaintext for this"
  // on redisplay (see rememberSent/recallSent) without caring which
  // device-specific sub-envelope it's looking at.
  async function secureEncrypt(original, plaintext, chatId, recipientId, opts) {
    return withCrossContextLock(`send-${recipientId}`, async () => {
      const devices = await peerDevices(recipientId);
      const mid = crypto.randomUUID();
      const senderDeviceId = await myDeviceId();
      const perDevice = {};
      for (const d of devices) {
        const deviceId = d?.deviceId || 'primary';
        try {
          let state = await loadState(chatId, recipientId, deviceId); let bootstrap = null;
          if (!state) { const init = await x3dhInitiate(chatId, recipientId, deviceId); state = init.state; bootstrap = init.bootstrap; }
          if (!state?.sendChain) throw Error('secure session send chain unavailable');
          const step = await deriveMessageKey(state.sendChain); const key = await aesKey(step.mk); const n = state.sendN++; state.sendChain = step.next; await saveState(chatId, recipientId, state, deviceId);
          const context = `${pairContextForState(state, recipientId)}|${n}`;
          const env = await aesEncrypt(key, plaintext, context);
          const sid = `${state.initiator}:${state.peerId}#${deviceId}`;
          perDevice[deviceId] = { sid, n, iv: env.iv, ct: env.ct, ...(bootstrap ? { x3dh: bootstrap } : {}) };
          _e2eTrace('ENCRYPT_DEVICE', { chatId, recipientId, deviceId, me: userId(), sid, n, mid, hasBootstrap: !!bootstrap });
        } catch (e) {
          // One unreachable/broken device (e.g. its prekeys ran out, or a
          // stale device row nobody's used in months) must never block
          // delivery to the recipient's OTHER devices.
          console.warn('[E2E/X3DH] could not encrypt for device, skipping it', { recipientId, deviceId, error: e?.message || e });
        }
      }
      if (!Object.keys(perDevice).length) throw Error('could not establish a secure session with any of the recipient\u2019s devices');
      await rememberSent(mid, plaintext);
      return JSON.stringify({ v: 5, kid: window.KynectaE2E.keyId, mid, senderDeviceId, devices: perDevice });
    });
  }

  // The actual per-envelope ratchet decrypt — unchanged in substance from
  // before Phase 2, just factored out so both the v5 multi-device path and
  // the legacy v3/v4 single-envelope path (still produced by any client
  // that hasn't updated yet, and still arriving in history) can share it.
  async function decryptOneEnvelope(chatId, senderId, senderDeviceId, subEnv) {
    let state = await loadState(chatId, senderId, senderDeviceId);
    if (subEnv.x3dh && isNewBootstrap(state, subEnv.x3dh, senderId)) {
      state = await x3dhAccept(chatId, senderId, subEnv.x3dh, true);
    }
    if (!state) { _e2eTrace('DECRYPT_NO_SESSION', { chatId, senderId, senderDeviceId }); return '[Encrypted message — secure session unavailable]'; }
    if (String(state.peerId) !== String(senderId)) {
      _e2eTrace('DECRYPT_PEER_ID_MISMATCH', { expected: senderId, stateHasPeerId: state.peerId });
    }
    state.recvCache = state.recvCache || {}; const cacheKey = `${subEnv.sid || senderId}:${subEnv.n}`; if (Object.prototype.hasOwnProperty.call(state.recvCache, cacheKey)) { _e2eTrace('DECRYPT_CACHE_HIT', { chatId, senderId, n: subEnv.n }); return state.recvCache[cacheKey]; }
    if (subEnv.n < state.recvN) return '[Encrypted message — message already processed]'; if (subEnv.n > state.recvN + MAX_SKEW) return '[Encrypted message — invalid message sequence]';
    const context = `${pairContextForState(state, senderId)}|${subEnv.n}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        let working = { ...state, recvChain: state.recvChain, recvN: state.recvN };
        while (working.recvN < subEnv.n) { const skipped = await deriveMessageKey(working.recvChain); working.recvChain = skipped.next; working.recvN++; }
        const step = await deriveMessageKey(working.recvChain); const key = await aesKey(step.mk); const text = await aesDecrypt(key, subEnv, context);
        state.recvChain = step.next; state.recvN = working.recvN + 1; state.recvCache[cacheKey] = text; const keys = Object.keys(state.recvCache); if (keys.length > 100) delete state.recvCache[keys[0]]; await saveState(chatId, senderId, state, senderDeviceId);
        console.log('[E2E/X3DH] DECRYPT_SUCCESS', { chatId, senderId, senderDeviceId, n: subEnv.n, attempt: attempt + 1 }); return text;
      } catch (e) { console.warn('[E2E/X3DH] decrypt attempt failed', { chatId, senderId, senderDeviceId, n: subEnv.n, attempt: attempt + 1, error: e?.message || e }); if (attempt < 3) await sleep([100,300,800][attempt]); }
    }
    _e2eTrace('DECRYPT_ALL_ATTEMPTS_FAILED', { chatId, senderId, senderDeviceId, n: subEnv.n });
    return '[Decryption failed]';
  }

  async function secureDecrypt(original, encrypted, chatId, senderId) {
    return withCrossContextLock(`recv-${senderId}`, async () => {
      let env; try { env = JSON.parse(encrypted); } catch (_) { return original(encrypted, chatId, senderId); }
      if (!env || ![3,4,5].includes(Number(env.v))) return original(encrypted, chatId, senderId);
      _e2eTrace('DECRYPT_ENTRY', { chatId, senderId, me: userId(), v: env.v, kid: env.kid, mid: env.mid, hasBootstrap: !!(env.x3dh || env.devices) });

      if (Number(env.v) === 5) {
        // Own-echo (a message THIS client sent, coming back via history/
        // socket) — recognized by mid, independent of which device's
        // sub-envelope we'd otherwise have to pick.
        const ownEcho = await recallSent(env.mid);
        if (ownEcho !== undefined) { _e2eTrace('DECRYPT_OWN_ECHO_CACHE_HIT', { chatId, senderId, mid: env.mid }); return ownEcho; }
        const myId = await myDeviceId();
        const subEnv = env.devices?.[myId];
        if (!subEnv) {
          // This message was fanned out to our OTHER devices, not this one
          // (e.g. sent before this device was registered/linked). Nothing
          // wrong occurred — there is genuinely no ciphertext for us here.
          _e2eTrace('DECRYPT_NOT_FOR_THIS_DEVICE', { chatId, senderId, myId, availableDevices: Object.keys(env.devices || {}) });
          return '[Encrypted for a different device]';
        }
        return decryptOneEnvelope(chatId, senderId, env.senderDeviceId || 'primary', subEnv);
      }

      // Legacy v3/v4 single-envelope format (from a not-yet-updated client,
      // or already-sitting-in-history from before this device fan-out
      // existed) — always implicitly device 'primary' on both ends.
      const ownEcho = await recallSent(env.sid, env.n);
      if (ownEcho !== undefined) { _e2eTrace('DECRYPT_OWN_ECHO_CACHE_HIT', { chatId, senderId, n: env.n }); return ownEcho; }
      return decryptOneEnvelope(chatId, senderId, 'primary', env);
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
    if (!pw) return false; const ready = await window.KynectaE2E.init(pw, legacy); if (!ready && !window.KynectaE2E.enabled) return false;
    // FIX (SEND-BEFORE-TRANSPORT-INSTALLED — root cause of a permanent, silent
    // v2/v3 protocol split between two accounts in the SAME conversation):
    // this used to call installSecureTransport() only after `await
    // provisionWithRetry()` — a real network round-trip (prekey count check +
    // registration, with its own multi-second/backoff retries on a slow or
    // cold Render backend) — returned. But the send path's own readiness gate
    // (_waitForEnabledBounded in e2e-encryption.js) only waits on `_enabled`,
    // which _markEnabled() sets the moment `init()` above resolves — well
    // before provisionWithRetry() has had a chance to run, let alone finish.
    // A message sent by a freshly-unlocked user inside that window passed the
    // gate, found window.KynectaE2E.encryptForChat still pointing at the
    // ORIGINAL (pre-X3DH, envelope v2) function — installSecureTransport()
    // hadn't monkey-patched it to the v3 version yet — and went out as v2
    // permanently, with no error and nothing to ever re-send it as v3. The
    // other party's client (if already past this same window) sends and
    // expects v3, so its receive-side decryptor for v2 messages from this
    // sender works, but THIS sender can never produce a v3 envelope the
    // receiver's X3DH session actually expects for anything beyond that one
    // race, and — more importantly — cannot receive-and-decrypt a v3 message
    // FROM the other party correctly either, since v3-vs-v2 is a real,
    // permanent per-message format choice baked in at encrypt time, not a
    // timing artifact that resolves itself. installSecureTransport() has no
    // dependency on prekeys being published — it only needs the original
    // encrypt/decrypt functions to exist, which they already do — so moving
    // it here, before the prekey network round-trip, closes that window down
    // to effectively zero (a same-tick synchronous call) instead of leaving
    // it open for however long provisionWithRetry() takes.
    installSecureTransport();
    const prekeysReady = await provisionWithRetry();
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