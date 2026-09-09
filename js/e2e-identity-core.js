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
          const entry = { key: await importPub(s[userId].pub), keyId: s[userId].keyId };
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
      const entry = { key: await importPub(raw), keyId: j.data.keyId };
      pubCache.set(userId, entry);
      try { const s = JSON.parse(localStorage.getItem(PUB_STORE) || '{}'); s[userId] = { pub: raw, keyId: entry.keyId }; localStorage.setItem(PUB_STORE, JSON.stringify(s)); } catch (_) {}
      try { document.dispatchEvent(new CustomEvent('kyn:e2eKeyAvailable', { detail: { userId } })); } catch (_) {}
      return entry;
    })().finally(() => inflightFetch.delete(userId));
    inflightFetch.set(userId, p);
    return p;
  }

  function purgePublicKey(userId) {
    userId = String(userId); pubCache.delete(userId);
    try { const s = JSON.parse(localStorage.getItem(PUB_STORE) || '{}'); delete s[userId]; localStorage.setItem(PUB_STORE, JSON.stringify(s)); } catch (_) {}
  }

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
    publicKeyFor, purgePublicKey, deriveShared, hkdf, aesEncrypt, aesDecrypt, wrapAtRest, unwrapAtRest,
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
