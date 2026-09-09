/* Canonical E2E identity layer.
 * Owns exactly one device/user identity key pair and public-key directory access.
 * Message and group crypto engines consume this layer; neither owns another
 * identity/session implementation.
 */
(function (global) {
  'use strict';

  const subtle = global.crypto && global.crypto.subtle;
  const STORE_PREFIX = 'kyn_e2e_keypair_v1';
  const PUB_STORE = 'kyn_e2e_pubkeys_v2';
  const WRAP_SALT = 'kyn_e2e_local_wrap_salt_v1';
  const pubCache = new Map();
  let privateKey = null;
  let publicKeyB64 = null;
  let keyId = null;
  let enabled = false;
  let wrapKey = null;
  let readyResolve;
  let readyPromise = new Promise(r => { readyResolve = r; });
  const inflightFetch = new Map();

  function uid() {
    try { const id = global.SessionManager?.getCurrentUserId?.(); if (id != null) return String(id); } catch (_) {}
    try { const id = global.MessagesCore?.getCurrentUserId?.(); if (id != null) return String(id); } catch (_) {}
    try { const id = global.GroupCore?.currentUser?.id; if (id != null) return String(id); } catch (_) {}
    try { const id = global.currentUserId; if (id != null) return String(id); } catch (_) {}
    try { const raw = localStorage.getItem('kynecta_auth'); const p = JSON.parse(raw || 'null'); const id = p?.user?.id || p?.userId; if (id != null) return String(id); } catch (_) {}
    try { const raw = localStorage.getItem('user') || localStorage.getItem('currentUser'); const p = JSON.parse(raw || 'null'); const id = p?.id || p?.userId; if (id != null) return String(id); } catch (_) {}
    return null;
  }

  function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  function enc(s) { return new TextEncoder().encode(s); }
  function storeKey() { const id = uid(); return id ? `${STORE_PREFIX}_${id}` : STORE_PREFIX; }
  async function apiBase() { return global.API_BASE_URL || global.BACKEND_URL || ''; }
  async function authHeaders() {
    const token = global.authToken || sessionStorage.getItem('kynecta_auth_token') || localStorage.getItem('kynecta_auth_token') || localStorage.getItem('authToken') || localStorage.getItem('token') || '';
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 10000);
    try { return await fetch(`${await apiBase()}${path}`, { credentials: 'include', cache: 'no-store', ...options, headers: { ...(await authHeaders()), ...(options.headers || {}) }, signal: controller.signal }); }
    finally { clearTimeout(timeout); }
  }
  async function genPair() { return subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits', 'deriveKey']); }
  async function exportPub(k) { return b64(await subtle.exportKey('spki', k)); }
  async function exportPriv(k) { return b64(await subtle.exportKey('pkcs8', k)); }
  async function importPub(s) { return subtle.importKey('spki', unb64(s), { name: 'ECDH', namedCurve: 'P-256' }, true, []); }
  async function importPriv(s) { return subtle.importKey('pkcs8', unb64(s), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits', 'deriveKey']); }

  async function wrapPrivate(pkcs8B64, password) {
    const salt = global.crypto.getRandomValues(new Uint8Array(32));
    const pw = await subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveKey']);
    const k = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, pw, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const iv = global.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, k, unb64(pkcs8B64));
    return JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct) });
  }
  async function unwrapPrivate(json, password) {
    const o = JSON.parse(json);
    const pw = await subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveKey']);
    const k = await subtle.deriveKey({ name: 'PBKDF2', salt: unb64(o.salt), iterations: 310000, hash: 'SHA-256' }, pw, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return b64(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, k, unb64(o.ct)));
  }
  async function getWrapKey(password) {
    if (wrapKey) return wrapKey;
    let saltB64 = null;
    try { saltB64 = localStorage.getItem(WRAP_SALT); } catch (_) {}
    const salt = saltB64 ? unb64(saltB64) : global.crypto.getRandomValues(new Uint8Array(32));
    if (!saltB64) try { localStorage.setItem(WRAP_SALT, b64(salt)); } catch (_) {}
    const pw = await subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveKey']);
    wrapKey = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, pw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return wrapKey;
  }
  async function wrapAtRest(rawB64) {
    if (!wrapKey) return null;
    const iv = global.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, unb64(rawB64));
    return JSON.stringify({ iv: b64(iv), ct: b64(ct) });
  }
  async function unwrapAtRest(json) {
    if (!wrapKey) throw new Error('E2E identity is locked');
    const o = JSON.parse(json);
    return b64(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, wrapKey, unb64(o.ct)));
  }

  async function register() {
    if (!publicKeyB64 || !keyId) return false;
    try {
      const deviceId = await global.KynectaE2EStore?.getOrCreateDeviceId?.() || 'primary';
      const r = await request('/api/encryption/keys', { method: 'POST', body: JSON.stringify({ publicKey: publicKeyB64, keyId, deviceId }) });
      return !!r.ok;
    } catch (_) { return false; }
  }

  async function adoptSharedIdentity() {
    const legacyE2E = global.KynectaE2E;
    if (!legacyE2E || typeof legacyE2E.getMyIdentityPrivateKey !== 'function') return false;
    try {
      if (!legacyE2E.enabled && typeof legacyE2E.waitForEnabledBounded === 'function') {
        await legacyE2E.waitForEnabledBounded(4000);
      }
      if (!legacyE2E.enabled) return false;
      const adoptedPriv = await legacyE2E.getMyIdentityPrivateKey();
      if (!adoptedPriv || !legacyE2E.publicKey || !legacyE2E.keyId) return false;
      privateKey = adoptedPriv;
      publicKeyB64 = legacyE2E.publicKey;
      keyId = legacyE2E.keyId;
      enabled = true;
      readyResolve(true);
      try { document.dispatchEvent(new CustomEvent('kyn:e2eUnlocked')); } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  async function init(password, legacyPassword) {
    if (!subtle || !uid()) return false;
    await getWrapKey(password).catch(() => {});
    const adopted = await adoptSharedIdentity();
    if (adopted) return true;
    const stored = localStorage.getItem(storeKey());
    if (stored) {
      const o = JSON.parse(stored);
      let pkcs8;
      try { pkcs8 = await unwrapPrivate(o.encPrivKey, password); }
      catch (primaryErr) {
        if (!legacyPassword || legacyPassword === password) return false;
        try { pkcs8 = await unwrapPrivate(o.encPrivKey, legacyPassword); }
        catch (_) { return false; }
      }
      privateKey = await importPriv(pkcs8);
      publicKeyB64 = o.pubKey;
      keyId = o.keyId;
      if (await register()) { enabled = true; readyResolve(true); try { document.dispatchEvent(new CustomEvent('kyn:e2eUnlocked')); } catch (_) {} }
      else if (o.registered !== false) { enabled = true; readyResolve(true); try { document.dispatchEvent(new CustomEvent('kyn:e2eUnlocked')); } catch (_) {} }
      return enabled;
    }
    const kp = await genPair();
    const pub = await exportPub(kp.publicKey);
    const priv = await exportPriv(kp.privateKey);
    const id = b64(global.crypto.getRandomValues(new Uint8Array(16)));
    const registered = await (async () => { publicKeyB64 = pub; keyId = id; return register(); })();
    localStorage.setItem(storeKey(), JSON.stringify({ encPrivKey: await wrapPrivate(priv, password), pubKey: pub, keyId: id, registered }));
    privateKey = kp.privateKey;
    publicKeyB64 = pub;
    keyId = id;
    if (registered) { enabled = true; readyResolve(true); try { document.dispatchEvent(new CustomEvent('kyn:e2eUnlocked')); } catch (_) {} }
    return enabled;
  }

  async function publicKeyFor(userId, forceRefresh = false) {
    userId = String(userId);
    if (!forceRefresh && pubCache.has(userId)) return pubCache.get(userId);
    if (!forceRefresh) {
      try {
        const s = JSON.parse(localStorage.getItem(PUB_STORE) || '{}');
        if (s[userId]?.pub) {
          // FIX (HISTORICAL-KEY-SELF-CONTAINED-ENVELOPE): entries now retain
          // the raw base64 public key (`pub`), not just the imported
          // CryptoKey. Callers that need to embed/compare the exact bytes
          // (encryptForChat's rpk, decryptEnvelope's envelope.spk/.rpk
          // handling) previously had no way to get back the original
          // base64 from an already-imported CryptoKey without a redundant
          // re-export. See message-e2e-core.js decryptEnvelope() for why
          // this matters: a message envelope now carries the exact public
          // key bytes used at encryption time, so decrypting it later
          // never has to depend on whatever this cache happens to hold.
          const entry = { key: await importPub(s[userId].pub), keyId: s[userId].keyId, pub: s[userId].pub };
          pubCache.set(userId, entry); return entry;
        }
      } catch (_) {}
    }
    if (inflightFetch.has(userId)) return inflightFetch.get(userId);
    const p = (async () => {
      const r = await request(`/api/encryption/keys/${encodeURIComponent(userId)}`);
      if (!r.ok) throw new Error(`Recipient key unavailable: HTTP ${r.status}`);
      const j = await r.json();
      const raw = j?.data?.publicKey;
      if (!raw) throw new Error('Recipient has no public key');
      const entry = { key: await importPub(raw), keyId: j.data.keyId, pub: raw };
      pubCache.set(userId, entry);
      try { const s = JSON.parse(localStorage.getItem(PUB_STORE) || '{}'); s[userId] = { pub: raw, keyId: entry.keyId }; localStorage.setItem(PUB_STORE, JSON.stringify(s)); } catch (_) {}
      try { document.dispatchEvent(new CustomEvent('kyn:e2eKeyAvailable', { detail: { userId } })); } catch (_) {}
      return entry;
    })().finally(() => inflightFetch.delete(userId));
    inflightFetch.set(userId, p);
    return p;
  }

  // FIX (HISTORICAL-KEY-LOOKUP): companion to the backend's new
  // GET /api/encryption/keys/:userId/version/:keyId. publicKeyFor() above
  // only ever resolves to whichever key is CURRENTLY active for a user —
  // exactly wrong for re-deriving the shared secret of a message that was
  // encrypted against an older, since-rotated key. This resolves one
  // SPECIFIC historical keyId and caches it separately (keyed by
  // "userId:keyId", never overwriting the "current key" cache above, which
  // callers still need for encrypting NEW outgoing messages). Used as a
  // fallback in message-e2e-core.js's decryptEnvelope() when a message
  // envelope predates the self-contained spk/rpk fix and only has
  // `kid`/`rkid` to go on.
  const histCache = new Map();
  const HIST_STORE = 'kyn_e2e_pubkeys_hist_v1';
  async function publicKeyForVersion(userId, keyIdValue) {
    userId = String(userId);
    if (!userId || !keyIdValue) return null;
    const cacheKey = `${userId}:${keyIdValue}`;
    if (histCache.has(cacheKey)) return histCache.get(cacheKey);
    try {
      const s = JSON.parse(localStorage.getItem(HIST_STORE) || '{}');
      if (s[cacheKey]?.pub) {
        const entry = { key: await importPub(s[cacheKey].pub), keyId: keyIdValue, pub: s[cacheKey].pub };
        histCache.set(cacheKey, entry); return entry;
      }
    } catch (_) {}
    try {
      const r = await request(`/api/encryption/keys/${encodeURIComponent(userId)}/version/${encodeURIComponent(keyIdValue)}`);
      if (!r.ok) return null;
      const j = await r.json();
      const raw = j?.data?.publicKey;
      if (!raw) return null;
      const entry = { key: await importPub(raw), keyId: keyIdValue, pub: raw };
      histCache.set(cacheKey, entry);
      try { const s = JSON.parse(localStorage.getItem(HIST_STORE) || '{}'); s[cacheKey] = { pub: raw }; localStorage.setItem(HIST_STORE, JSON.stringify(s)); } catch (_) {}
      return entry;
    } catch (_) { return null; }
  }

  // FIX (LOGIN-TIME-KEY-WARMUP): publicKeyFor() above is already cache-first
  // (memory -> localStorage PUB_STORE -> network), but nothing ever primed
  // that cache in bulk — every contact's key was only ever fetched the
  // first time a chat with them happened to be opened, one network round
  // trip each. This is the batch counterpart used right after login (see
  // message-client.js's loadConversations()) to resolve every existing
  // contact's key in ONE request and warm both the in-memory and
  // localStorage caches, so opening any of those chats later — or
  // decrypting an incoming message/preview from them — needs no network at
  // all. Never throws; a failed warmup just leaves those contacts to fall
  // back to the existing per-chat lazy fetch.
  async function publicKeysForBatch(userIds) {
    const wanted = Array.from(new Set((userIds || []).map(String).filter(Boolean)));
    const missing = [];
    let store = null;
    try { store = JSON.parse(localStorage.getItem(PUB_STORE) || '{}'); } catch (_) { store = {}; }
    for (const id of wanted) {
      if (pubCache.has(id)) continue;
      if (store[id]?.pub) {
        try { pubCache.set(id, { key: await importPub(store[id].pub), keyId: store[id].keyId, pub: store[id].pub }); continue; }
        catch (_) { /* corrupted entry — fall through to re-fetch */ }
      }
      missing.push(id);
    }
    if (!missing.length) return;
    try {
      const r = await request(`/api/encryption/keys/batch?userIds=${missing.map(encodeURIComponent).join(',')}`);
      if (!r.ok) return;
      const j = await r.json();
      const data = j?.data || {};
      let dirty = false;
      for (const id of Object.keys(data)) {
        const raw = data[id]?.publicKey;
        if (!raw) continue;
        try {
          pubCache.set(id, { key: await importPub(raw), keyId: data[id].keyId, pub: raw });
          store[id] = { pub: raw, keyId: data[id].keyId };
          dirty = true;
        } catch (_) { /* skip a corrupt individual entry, keep the rest */ }
      }
      if (dirty) {
        try { localStorage.setItem(PUB_STORE, JSON.stringify(store)); } catch (_) {}
        try { document.dispatchEvent(new CustomEvent('kyn:e2eKeysAvailable', { detail: { userIds: Object.keys(data) } })); } catch (_) {}
      }
    } catch (_) { /* network hiccup — per-chat lazy fetch still covers this */ }
  }

  function purgePublicKey(userId) {
    userId = String(userId); pubCache.delete(userId);
    try { const s = JSON.parse(localStorage.getItem(PUB_STORE) || '{}'); delete s[userId]; localStorage.setItem(PUB_STORE, JSON.stringify(s)); } catch (_) {}
  }

  // FIX (CACHE-RECIPIENT-KEY-DISCONNECTED-STORE): a key handed to us
  // directly (a bootstrap response that already includes it, or a live
  // 'e2e:key_available'/'e2e:key_rotated' socket push) needs to land in the
  // exact same cache publicKeyFor() reads from — this is that single write
  // path. Previously the only exposed "cache a given key" entry point
  // (message-e2e-core.js's cacheRecipientKey) wrote to an entirely
  // different, never-read localStorage key, so every such call was a
  // silent no-op as far as decryption was concerned.
  async function cachePublicKey(userId, rawPubB64, keyIdValue) {
    userId = String(userId);
    if (!userId || !rawPubB64) return false;
    try {
      pubCache.set(userId, { key: await importPub(rawPubB64), keyId: keyIdValue, pub: rawPubB64 });
      const s = JSON.parse(localStorage.getItem(PUB_STORE) || '{}');
      s[userId] = { pub: rawPubB64, keyId: keyIdValue };
      localStorage.setItem(PUB_STORE, JSON.stringify(s));
      try { document.dispatchEvent(new CustomEvent('kyn:e2eKeyAvailable', { detail: { userId } })); } catch (_) {}
      return true;
    } catch (_) { return false; }
  }

  // ROOT-CAUSE FIX (LIVE-KEY-ROTATION-NEVER-APPLIED): the backend already
  // pushes 'e2e:key_available'/'e2e:key_rotated' over the socket the moment
  // someone (re)registers a key — see moodchat src/routes/encryption.js's
  // _broadcastKeyEvent — and js/app.realtime.socket.js already relays it
  // both same-frame (a 'kyn:e2e:key_available'/'kyn:e2e:key_rotated'
  // CustomEvent) and cross-frame (a postMessage to every iframe). But
  // NOTHING in this v2 identity layer was ever listening for either — only
  // the legacy js/e2e-encryption.js was, and it only ever updated its own,
  // no-longer-read v1 store (kyn_e2e_pubkeys_v1). Concretely: if a contact
  // ever regenerates their identity (their storage was cleared, a previous
  // testing round wiped it, they reinstalled), everyone who already had
  // their OLD key cached here just kept silently encrypting/decrypting
  // against it forever — every message either direction after that point
  // fails AES-GCM with a real, current key sitting one push event away.
  // This is very likely why a live back-and-forth can still show "Unable to
  // decrypt this message" even though the pipeline is otherwise healthy.
  function _handleKeyPush(payload) {
    if (!payload || !payload.userId || !payload.publicKey) return;
    cachePublicKey(payload.userId, payload.publicKey, payload.keyId);
  }
  try {
    window.addEventListener('kyn:e2e:key_available', (e) => _handleKeyPush(e.detail));
    window.addEventListener('kyn:e2e:key_rotated', (e) => _handleKeyPush(e.detail));
    window.addEventListener('message', (e) => {
      const data = e && e.data;
      if (!data || data.type !== 'SOCKET_EVENT') return;
      if (data.event === 'e2e:key_available' || data.event === 'e2e:key_rotated') _handleKeyPush(data.payload);
    });
  } catch (_) {}

  async function deriveShared(peerKey) { return subtle.deriveBits({ name: 'ECDH', public: peerKey }, privateKey, 256); }
  async function hkdf(shared, info) {
    const k = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc(info) }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function aesEncrypt(plaintext, key, aad) {
    const iv = global.crypto.getRandomValues(new Uint8Array(12));
    const params = { name: 'AES-GCM', iv, tagLength: 128 };
    if (aad) params.additionalData = enc(aad);
    const ct = await subtle.encrypt(params, key, enc(plaintext));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function aesDecrypt(env, key, aad) {
    const params = { name: 'AES-GCM', iv: unb64(env.iv), tagLength: 128 };
    if (aad) params.additionalData = enc(aad);
    return new TextDecoder().decode(await subtle.decrypt(params, key, unb64(env.ct)));
  }

  global.KynectaE2EIdentity = {
    init, get enabled() { return enabled; }, get privateKey() { return privateKey; }, get publicKey() { return publicKeyB64; }, get keyId() { return keyId; }, get userId() { return uid(); }, ready: () => readyPromise,
    publicKeyFor, publicKeysForBatch, publicKeyForVersion, purgePublicKey, cachePublicKey, deriveShared, hkdf, aesEncrypt, aesDecrypt, wrapAtRest, unwrapAtRest,
    // FIX (HISTORICAL-KEY-SELF-CONTAINED-ENVELOPE): lets message-e2e-core /
    // message-e2e-compat import a raw public key they already have in hand
    // (envelope.spk / envelope.rpk) directly, with no cache/network lookup
    // at all — the whole point of embedding those bytes in the envelope in
    // the first place. importPub is otherwise a private helper of this
    // module.
    importPeerKey: (rawB64) => importPub(rawB64),
    getOrCreateDeviceId: async () => global.KynectaE2EStore?.getOrCreateDeviceId?.() || 'primary',
    getSafetyNumbers: async function(theirPubKeyB64) {
      if (!publicKeyB64 || !theirPubKeyB64) return null;
      const combined = publicKeyB64 < theirPubKeyB64 ? publicKeyB64 + theirPubKeyB64 : theirPubKeyB64 + publicKeyB64;
      const hash = await subtle.digest('SHA-256', enc(combined));
      const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
      const decimal = BigInt('0x' + hex).toString().padStart(60, '0');
      const groups = []; for (let i = 0; i < 60; i += 5) groups.push(decimal.slice(i, i + 5));
      return { hex: hex.slice(0, 32).toUpperCase(), groups };
    },
    clear: () => { privateKey = null; publicKeyB64 = null; keyId = null; enabled = false; pubCache.clear(); readyPromise = new Promise(r => { readyResolve = r; }); },
  };
})(window);
