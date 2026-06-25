/**
 * e2e-encryption.js — Browser-side E2E encryption for Kynecta
 *
 * Uses WebCrypto API (SubtleCrypto) — zero external deps, works in all modern browsers.
 *
 * Flow:
 *  1. On first login: generate ECDH P-256 key pair
 *  2. Export public key → POST /api/encryption/keys  (server stores it)
 *  3. Encrypt private key with user's password → store in localStorage (encrypted)
 *  4. Before sending message: fetch recipient's public key, compute ECDH shared secret
 *  5. Derive AES-256-GCM key via HKDF(sharedSecret, chatId)
 *  6. Encrypt message content, send envelope { v:1, kid, iv, ct } as content
 *  7. On receive: decrypt using same shared secret
 *
 * Safety Numbers: SHA-256(ownPubKey + theirPubKey) shown as emoji/hex for verification
 */

(function (global) {
  'use strict';

  const subtle    = global.crypto && global.crypto.subtle;
  const STORE_KEY = 'kyn_e2e_keypair_v1';   // localStorage key for encrypted private key
  const PUB_CACHE = new Map();               // userId → CryptoKey (public key cache)

  // ── Utility ───────────────────────────────────────────────────────────────
  function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  function str2buf(s) { return new TextEncoder().encode(s); }
  function buf2str(b) { return new TextDecoder().decode(b); }

  async function _apiBase() {
    return window.API_BASE_URL || window.BACKEND_URL || '';
  }

  async function _authHeaders() {
    const t = window.authToken || sessionStorage.getItem('kynecta_auth_token')
            || localStorage.getItem('kynecta_auth_token') || localStorage.getItem('authToken') || '';
    return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }

  // ── Key generation ────────────────────────────────────────────────────────
  async function generateKeyPair() {
    return subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );
  }

  async function exportPublicKey(keyPair) {
    const spki = await subtle.exportKey('spki', keyPair.publicKey);
    return b64(spki);
  }

  async function exportPrivateKey(keyPair) {
    const pkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey);
    return b64(pkcs8);
  }

  async function importPublicKey(b64Spki) {
    return subtle.importKey('spki', unb64(b64Spki), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  }

  async function importPrivateKey(b64Pkcs8) {
    return subtle.importKey('pkcs8', unb64(b64Pkcs8), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  }

  // ── Encrypt private key with user password ────────────────────────────────
  async function _encryptPrivateKey(pkcs8B64, password) {
    const salt    = global.crypto.getRandomValues(new Uint8Array(32));
    const pwKey   = await subtle.importKey('raw', str2buf(password), 'PBKDF2', false, ['deriveKey']);
    const wrapKey = await subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
      pwKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    const iv  = global.crypto.getRandomValues(new Uint8Array(12));
    const ct  = await subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, unb64(pkcs8B64));
    return JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct) });
  }

  async function _decryptPrivateKey(encJson, password) {
    const obj     = JSON.parse(encJson);
    const salt    = unb64(obj.salt);
    const pwKey   = await subtle.importKey('raw', str2buf(password), 'PBKDF2', false, ['deriveKey']);
    const wrapKey = await subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
      pwKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const iv  = unb64(obj.iv);
    const pt  = await subtle.decrypt({ name: 'AES-GCM', iv }, wrapKey, unb64(obj.ct));
    return b64(pt);
  }

  // ── HKDF ─────────────────────────────────────────────────────────────────
  async function _hkdf(sharedBits, chatId) {
    const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    const info    = str2buf(`kynecta-chat-${chatId}`);
    const salt    = new Uint8Array(32);
    return subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // ── Shared secret via ECDH ────────────────────────────────────────────────
  async function _computeSharedBits(myPrivKey, theirPubKey) {
    return subtle.deriveBits({ name: 'ECDH', public: theirPubKey }, myPrivKey, 256);
  }

  // ── AES-256-GCM encrypt/decrypt ───────────────────────────────────────────
  async function _aesEncrypt(plaintext, aesKey) {
    const iv  = global.crypto.getRandomValues(new Uint8Array(12));
    const ct  = await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, str2buf(plaintext));
    return { iv: b64(iv), ct: b64(ct) };
  }

  async function _aesDecrypt(env, aesKey) {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv), tagLength: 128 }, aesKey, unb64(env.ct));
    return buf2str(pt);
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let _myPrivKey   = null;  // CryptoKey
  let _myPubKeyB64 = null;  // base64 SPKI
  let _myKeyId     = null;
  let _enabled     = false;
  // GROUP ENCRYPTION: a CryptoKey derived once per session (during init,
  // from the same password) and cached in memory, used to encrypt Sender
  // Keys before they're written to localStorage. Re-deriving via PBKDF2
  // (310,000 iterations) on every single Sender Key read/write — as the
  // 1:1 private-key wrapping functions above do — would be both slow and
  // require holding onto the plaintext password long after init() returns,
  // which this module deliberately avoids. Caching one derived key for the
  // session gives the same at-rest protection with neither downside.
  let _localWrapKey = null;
  const LOCAL_WRAP_SALT_KEY = 'kyn_e2e_local_wrap_salt_v1';

  async function _getOrCreateLocalWrapKey(password) {
    if (_localWrapKey) return _localWrapKey;
    let saltB64 = localStorage.getItem(LOCAL_WRAP_SALT_KEY);
    let salt;
    if (saltB64) {
      salt = unb64(saltB64);
    } else {
      salt = global.crypto.getRandomValues(new Uint8Array(32));
      localStorage.setItem(LOCAL_WRAP_SALT_KEY, b64(salt));
    }
    const pwKey = await subtle.importKey('raw', str2buf(password), 'PBKDF2', false, ['deriveKey']);
    _localWrapKey = await subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
      pwKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return _localWrapKey;
  }

  // ── Init: load or generate keys ───────────────────────────────────────────
  async function init(password) {
    if (!subtle) {
      console.warn('[E2E] WebCrypto not available — encryption disabled');
      return false;
    }

    // GROUP ENCRYPTION: derive the local-storage wrap key now, while the
    // password is available, regardless of which branch below runs.
    await _getOrCreateLocalWrapKey(password).catch(e => console.warn('[E2E] Local wrap key derivation failed:', e.message));

    const stored = localStorage.getItem(STORE_KEY);
    if (stored) {
      try {
        const obj     = JSON.parse(stored);
        const pkcs8   = await _decryptPrivateKey(obj.encPrivKey, password);
        _myPrivKey    = await importPrivateKey(pkcs8);
        _myPubKeyB64  = obj.pubKey;
        _myKeyId      = obj.keyId;
        _enabled      = true;
        console.log('[E2E] ✅ Keys loaded from storage');
        return true;
      } catch (e) {
        console.warn('[E2E] Could not load stored keys:', e.message);
      }
    }

    // Generate new key pair
    const kp         = await generateKeyPair();
    const pubKeyB64   = await exportPublicKey(kp);
    const privKeyB64  = await exportPrivateKey(kp);
    const encPrivKey  = await _encryptPrivateKey(privKeyB64, password);
    const keyId       = b64(global.crypto.getRandomValues(new Uint8Array(16)));

    // Upload public key to server
    try {
      const resp = await fetch(`${await _apiBase()}/api/encryption/keys`, {
        method: 'POST',
        headers: await _authHeaders(),
        body: JSON.stringify({ publicKey: pubKeyB64, keyId }),
        credentials: 'include',
      });
      if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
      const data = await resp.json();
      _myKeyId = data.data?.keyId || keyId;
    } catch (e) {
      console.warn('[E2E] Key upload failed (will retry on next init):', e.message);
      _myKeyId = keyId;
    }

    // Store encrypted private key locally
    localStorage.setItem(STORE_KEY, JSON.stringify({ encPrivKey, pubKey: pubKeyB64, keyId: _myKeyId }));

    _myPrivKey   = kp.privateKey;
    _myPubKeyB64 = pubKeyB64;
    _enabled     = true;
    console.log('[E2E] ✅ New key pair generated and registered');
    return true;
  }

  // ── Get recipient's public key ─────────────────────────────────────────────
  async function _getRecipientPublicKey(userId) {
    if (PUB_CACHE.has(userId)) return PUB_CACHE.get(userId);
    const resp = await fetch(`${await _apiBase()}/api/encryption/keys/${userId}`, {
      headers: await _authHeaders(),
      credentials: 'include',
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.data?.publicKey) return null;
    const key = await importPublicKey(data.data.publicKey);
    PUB_CACHE.set(userId, { key, keyId: data.data.keyId });
    return { key, keyId: data.data.keyId };
  }

  // ── Encrypt a message for a chat ──────────────────────────────────────────
  async function encryptForChat(plaintext, chatId, recipientUserId) {
    if (!_enabled || !_myPrivKey) return plaintext; // fallback to plaintext if keys not ready
    const recipient = await _getRecipientPublicKey(recipientUserId);
    if (!recipient) return plaintext;

    const sharedBits = await _computeSharedBits(_myPrivKey, recipient.key);
    const aesKey     = await _hkdf(sharedBits, chatId);
    const env        = await _aesEncrypt(plaintext, aesKey);

    return JSON.stringify({ v: 1, kid: _myKeyId, iv: env.iv, ct: env.ct });
  }

  // ── Decrypt a received message ────────────────────────────────────────────
  async function decryptFromChat(encContent, chatId, senderUserId) {
    if (!encContent || typeof encContent !== 'string') return encContent;
    let envelope;
    try {
      envelope = JSON.parse(encContent);
    } catch (_) { return encContent; }
    if (!envelope || envelope.v !== 1) return encContent; // plaintext

    if (!_enabled || !_myPrivKey) return '[Encrypted message — unlock your key to read]';

    const sender = await _getRecipientPublicKey(senderUserId);
    if (!sender) return '[Encrypted — sender key not found]';

    try {
      const sharedBits = await _computeSharedBits(_myPrivKey, sender.key);
      const aesKey     = await _hkdf(sharedBits, chatId);
      return await _aesDecrypt(envelope, aesKey);
    } catch (e) {
      return '[Decryption failed]';
    }
  }

  // ── Safety numbers (emoji fingerprint) ───────────────────────────────────
  async function getSafetyNumbers(theirPubKeyB64) {
    if (!_myPubKeyB64 || !theirPubKeyB64) return null;
    const combined = _myPubKeyB64 < theirPubKeyB64
      ? _myPubKeyB64 + theirPubKeyB64
      : theirPubKeyB64 + _myPubKeyB64;
    const hash = await subtle.digest('SHA-256', str2buf(combined));
    const hex  = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    // Split into 12 groups of 5 digits for display (like Signal)
    const decimal = BigInt('0x' + hex).toString().padStart(60, '0');
    const groups  = [];
    for (let i = 0; i < 60; i += 5) groups.push(decimal.slice(i, i + 5));
    return { hex: hex.slice(0, 32).toUpperCase(), groups };
  }

  // ── Encrypt file/media attachment ─────────────────────────────────────────
  async function encryptAttachment(arrayBuffer, chatId, recipientUserId) {
    if (!_enabled || !_myPrivKey) return null;
    const recipient = await _getRecipientPublicKey(recipientUserId);
    if (!recipient) return null;
    const sharedBits = await _computeSharedBits(_myPrivKey, recipient.key);
    const aesKey     = await _hkdf(sharedBits, chatId);
    const iv         = global.crypto.getRandomValues(new Uint8Array(12));
    const ct         = await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, arrayBuffer);
    return { iv: b64(iv), ct: b64(ct) };
  }

  async function decryptAttachment(envelope, chatId, senderUserId) {
    if (!_enabled || !_myPrivKey) return null;
    const sender = await _getRecipientPublicKey(senderUserId);
    if (!sender) return null;
    const sharedBits = await _computeSharedBits(_myPrivKey, sender.key);
    const aesKey     = await _hkdf(sharedBits, chatId);
    return subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv), tagLength: 128 }, aesKey, unb64(envelope.ct));
  }

  // ── GROUP ENCRYPTION: Sender Keys ──────────────────────────────────────────
  // 1:1 chat encryption above derives a shared AES key per (sender,recipient)
  // pair via ECDH — that doesn't scale to groups (one ciphertext encrypted
  // N times for N members leaks group size and is wasteful). Group messages
  // instead use the Sender Keys model (same approach Signal/WhatsApp use):
  // each member generates their OWN random AES-256 key for a given group,
  // distributes it to every other current member ONCE (each copy wrapped
  // using the existing 1:1 ECDH channel to that specific recipient — no new
  // key-exchange primitive needed), and then encrypts every group message
  // they send with that one key, broadcasting a single ciphertext. See
  // backend src/routes/groupEncryption.js for the distribution/storage API.

  // Generate a brand-new random Sender Key for a group. Returns the raw
  // CryptoKey (kept in memory / IndexedDB by the caller) AND its raw bytes
  // exported as base64, since callers need the raw bytes to re-import it
  // later (CryptoKey objects themselves can't be stored directly).
  async function generateSenderKey() {
    const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const raw = await subtle.exportKey('raw', key);
    return { key, rawB64: b64(raw) };
  }

  // Re-import a Sender Key from its raw base64 bytes (e.g. after fetching/
  // decrypting one distributed by another member, or reloading your own
  // from local storage).
  async function importSenderKey(rawB64) {
    return subtle.importKey('raw', unb64(rawB64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  // Wrap (encrypt) a Sender Key's raw bytes so ONLY recipientUserId can
  // read it — reuses the exact same ECDH shared-secret + HKDF derivation
  // as 1:1 message encryption, just keyed by a fixed context string
  // instead of a chatId, since Sender Key distribution isn't tied to any
  // particular 1:1 conversation between the two users.
  async function encryptSenderKeyFor(senderKeyRawB64, recipientUserId) {
    if (!_enabled || !_myPrivKey) throw new Error('E2E not initialized');
    const recipient = await _getRecipientPublicKey(recipientUserId);
    if (!recipient) throw new Error('Recipient has no registered public key');

    const sharedBits = await _computeSharedBits(_myPrivKey, recipient.key);
    const wrappingKey = await _hkdf(sharedBits, 'group-sender-key-wrap');
    const env = await _aesEncrypt(senderKeyRawB64, wrappingKey);
    return JSON.stringify({ v: 1, kid: _myKeyId, iv: env.iv, ct: env.ct });
  }

  // Inverse of encryptSenderKeyFor — recovers another member's Sender Key
  // raw bytes from the envelope they distributed to you, given their
  // userId (to look up THEIR public key, mirroring decryptFromChat).
  async function decryptSenderKeyFrom(envelopeStr, ownerUserId) {
    if (!_enabled || !_myPrivKey) throw new Error('E2E not initialized');
    let envelope;
    try { envelope = JSON.parse(envelopeStr); } catch (_) { throw new Error('Malformed sender key envelope'); }
    if (!envelope || envelope.v !== 1) throw new Error('Unrecognized sender key envelope version');

    const owner = await _getRecipientPublicKey(ownerUserId);
    if (!owner) throw new Error('Sender key owner has no registered public key');

    const sharedBits = await _computeSharedBits(_myPrivKey, owner.key);
    const wrappingKey = await _hkdf(sharedBits, 'group-sender-key-wrap');
    return _aesDecrypt(envelope, wrappingKey); // returns the raw base64 Sender Key bytes
  }

  // Encrypt a group message using an already-imported Sender Key
  // (CryptoKey). No ECDH involved here — the symmetric key IS the shared
  // secret, already established via Sender Key distribution.
  async function encryptGroupMessage(plaintext, senderKey, keyGeneration) {
    const env = await _aesEncrypt(plaintext, senderKey);
    return JSON.stringify({ v: 1, gen: keyGeneration, iv: env.iv, ct: env.ct });
  }

  // Decrypt a group message given the matching Sender Key (caller is
  // responsible for selecting the right owner's key by senderId before
  // calling this — see js/groupEncryption.client.js).
  async function decryptGroupMessage(encContent, senderKey) {
    if (!encContent || typeof encContent !== 'string') return encContent;
    let envelope;
    try { envelope = JSON.parse(encContent); } catch (_) { return encContent; }
    if (!envelope || envelope.v !== 1) return encContent; // plaintext / not our envelope shape
    try {
      return await _aesDecrypt(envelope, senderKey);
    } catch (e) {
      return '[Decryption failed]';
    }
  }

  // Encrypt arbitrary string data (used for Sender Keys) at rest before
  // writing to localStorage, using the session-cached wrap key derived in
  // init(). Returns null (caller should fall back to not persisting) if
  // the wrap key isn't available — e.g. called before init() ever ran.
  async function wrapForLocalStorage(plaintextB64) {
    if (!_localWrapKey) return null;
    const iv = global.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, _localWrapKey, unb64(plaintextB64));
    return JSON.stringify({ iv: b64(iv), ct: b64(ct) });
  }

  async function unwrapFromLocalStorage(wrappedJson) {
    if (!_localWrapKey) throw new Error('Local wrap key not available — call init() first');
    const obj = JSON.parse(wrappedJson);
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.iv) }, _localWrapKey, unb64(obj.ct));
    return b64(pt);
  }

  // ── Auto-init on login event ──────────────────────────────────────────────
  window.addEventListener('kyn:loggedIn', async (e) => {
    const password = e.detail?.password;
    if (password) await init(password).catch(console.warn);
  });

  // ── Public API ────────────────────────────────────────────────────────────
  global.KynectaE2E = {
    init,
    encryptForChat,
    decryptFromChat,
    encryptAttachment,
    decryptAttachment,
    getSafetyNumbers,
    // Group encryption (Sender Keys)
    generateSenderKey,
    importSenderKey,
    encryptSenderKeyFor,
    decryptSenderKeyFrom,
    encryptGroupMessage,
    decryptGroupMessage,
    wrapForLocalStorage,
    unwrapFromLocalStorage,
    get enabled() { return _enabled; },
    get publicKey() { return _myPubKeyB64; },
    get keyId() { return _myKeyId; },
    clearKeys() {
      localStorage.removeItem(STORE_KEY);
      _myPrivKey = null; _myPubKeyB64 = null; _myKeyId = null; _enabled = false;
      PUB_CACHE.clear();
    },
  };

  console.log('[KynectaE2E] ✅ Loaded — WebCrypto:', !!subtle);

})(window);
