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
  const PUB_CACHE = new Map();               // userId → CryptoKey (public key cache, this page load only)
  // FIX-ROOT-CAUSE-DM-DECRYPT-FRAGILE: this is the actual reason DM send/receive
  // failed far more often than group messages. Group sender keys, once fetched,
  // are cached to localStorage forever (see groupEncryption.client.js) — a single
  // network blip only costs one retry. Recipient PUBLIC keys here were cached
  // ONLY in this in-memory Map, which is wiped on every reload, AND a failed
  // fetch (timeout, Render free-tier cold start, a 401 during token refresh)
  // was never retried and never remembered — every future message to/from that
  // person kept re-fetching and re-failing for the rest of the session, with no
  // backoff, hammering a possibly-still-cold backend.
  // Fix: persist the raw (non-secret) public key bytes to localStorage so a
  // successful fetch survives reloads exactly like the sender-key cache does,
  // and retry a failed fetch a couple of times with backoff before giving up.
  const PUB_KEY_STORE = 'kyn_e2e_pubkeys_v1'; // localStorage: { [userId]: { pub: base64, keyId } }

  function _loadPubKeyStore() {
    try { return JSON.parse(localStorage.getItem(PUB_KEY_STORE) || '{}'); } catch (_) { return {}; }
  }
  function _savePubKeyStore(store) {
    try { localStorage.setItem(PUB_KEY_STORE, JSON.stringify(store)); } catch (_) {}
  }
  function _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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

  // ── FIX-E2E-CHATID: stable per-pair encryption context ────────────────────
  // Root cause: encryptForChat/decryptFromChat fed the conversation's chatId
  // straight into HKDF's info parameter. For the very FIRST message of a
  // brand-new chat, the sender doesn't have a real chatId yet — messages-core.js
  // uses a local placeholder like "pending_<receiverId>" until the backend's
  // response creates the real (autoincrement integer) row. The receiver,
  // though, always gets the real chatId from the server's socket payload.
  // Sender and receiver therefore derived DIFFERENT AES keys for that first
  // message, and it could never be decrypted.
  //
  // Fix: derive the HKDF context from the sorted pair of user ids instead.
  // Both sides always know their own id and the other party's id — before
  // the chat row exists, after it exists, doesn't matter — so this string is
  // identical on both ends for every message in the conversation, including
  // the first one. The original chatId is kept ONLY as a last-resort fallback
  // (so this never throws) and as a legacy fallback on decrypt (see below).
  function _myUserId() {
    try {
      if (window.SessionManager?.getCurrentUserId) {
        const id = window.SessionManager.getCurrentUserId();
        if (id) return String(id);
      }
    } catch (_) {}
    try {
      if (window.MessagesCore?.getCurrentUserId) {
        const id = window.MessagesCore.getCurrentUserId();
        if (id) return String(id);
      }
    } catch (_) {}
    if (window.currentUserId) return String(window.currentUserId);
    if (window.__PARENT_SESSION__?.userId) return String(window.__PARENT_SESSION__.userId);
    try {
      const raw = localStorage.getItem('kynecta_auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        const id = parsed?.user?.id || parsed?.userId;
        if (id) return String(id);
      }
    } catch (_) {}
    return null;
  }

  function _chatContext(chatId, otherUserId) {
    const me = _myUserId();
    if (me && otherUserId) return [String(me), String(otherUserId)].sort().join(':');
    return String(chatId); // fallback — should rarely happen once logged in
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

  // FIX-NO-PLAINTEXT-FALLBACK: previously any caller that needed encryption
  // before init() had finished (or before it had even been called at all —
  // see message.html/group.html's tryInitE2E, which used to give up
  // permanently if the unlock password wasn't in sessionStorage yet) got a
  // silent `return plaintext` from encryptForChat. That is a silent E2E
  // bypass: a real message goes out over the wire — and gets stored — as
  // plaintext, with nothing in the UI to say so. Per explicit product
  // decision, this module never does that. Instead, anything that needs
  // `_enabled` waits on this gate, which init() resolves the moment keys are
  // actually ready. There is no timeout here on purpose: the caller (the
  // Send button) is expected to just sit in "sending…" until this resolves,
  // exactly like it already waits on a slow network request.
  let _enabledGate;
  function _newEnabledGate() { _enabledGate = new Promise(resolve => { _enabledGate.resolve = resolve; }); }
  _newEnabledGate();
  function _markEnabled() { _enabled = true; _enabledGate.resolve(); }
  function _waitForEnabled() { return _enabled ? Promise.resolve() : _enabledGate; }
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
  async function init(password, legacyPassword) {
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
        _markEnabled();
        console.log('[E2E] ✅ Keys loaded from storage');
        return true;
      } catch (e) {
        // FIX (KEY-REGEN-REGRESSION): this used to fall straight through to
        // generating and publishing a brand new keypair on ANY decrypt
        // failure here — which is exactly what happens for every account
        // that already had a stored key wrapped with their raw login
        // password from before the e2eWrapSecret fix (see moodchat
        // routes/auth.js), since login now sends e2eWrapSecret here instead
        // of the raw password. AES-GCM correctly refuses to decrypt with the
        // wrong key, this branch was reached for essentially every existing
        // manual-login account's first login after that fix, and each one
        // silently got a brand new keypair published to the server —
        // orphaning their real key and permanently breaking decryption for
        // anyone who'd already cached their old public key. Before giving up
        // and generating a new identity, try the caller-supplied legacy
        // password (the raw password, when available) — if THAT decrypts
        // successfully, re-wrap and persist the SAME key material under the
        // new password instead of discarding it, so nobody's real identity
        // key silently changes out from under people already messaging them.
        console.warn('[E2E] Could not load stored keys with primary password:', e.message);
        if (legacyPassword && legacyPassword !== password) {
          try {
            const obj      = JSON.parse(stored);
            const pkcs8    = await _decryptPrivateKey(obj.encPrivKey, legacyPassword);
            _myPrivKey     = await importPrivateKey(pkcs8);
            _myPubKeyB64   = obj.pubKey;
            _myKeyId       = obj.keyId;
            _markEnabled();
            console.log('[E2E] ✅ Keys recovered via legacy password — migrating storage to new wrap secret.');
            try {
              const reEncPrivKey = await _encryptPrivateKey(pkcs8, password);
              localStorage.setItem(STORE_KEY, JSON.stringify({ encPrivKey: reEncPrivKey, pubKey: _myPubKeyB64, keyId: _myKeyId }));
              console.log('[E2E] ✅ Stored key migrated to new wrap secret — identity preserved.');
            } catch (migrateErr) {
              console.warn('[E2E] Key recovered but re-wrap/migration failed (will retry next login):', migrateErr.message);
            }
            return true;
          } catch (legacyErr) {
            console.warn('[E2E] Legacy password also failed to decrypt stored keys:', legacyErr.message);
          }
        }
        // FIX-KEY-REGEN-REGRESSION (part 2): this used to fall through to the
        // "Generate new key pair" branch below on ANY decrypt failure,
        // silently orphaning the account's real identity key and publishing
        // a brand-new one to the server — permanently breaking decryption
        // for everyone who already has this person's old public key cached.
        // A stored key existing but failing to decrypt with every password
        // we have almost always means the caller passed the wrong secret
        // (e.g. a stale/partial value read from sessionStorage during a
        // race), not "this identity needs to be recreated." Refuse to
        // regenerate here — surface a distinct, catchable failure instead so
        // the UI can ask the person to unlock again, exactly like a wrong
        // password anywhere else in the app.
        console.warn('[E2E] Could not unlock existing identity key with any available password — NOT generating a replacement (would orphan the real identity). Will retry when a working password is available.');
        try { document.dispatchEvent(new CustomEvent('kyn:e2eUnlockFailed')); } catch (_) {}
        return false;
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
      const _regController = new AbortController();
      const _regTimeout = setTimeout(() => _regController.abort(), 8000);
      let resp;
      try {
        resp = await fetch(`${await _apiBase()}/api/encryption/keys`, {
          method: 'POST',
          headers: await _authHeaders(),
          body: JSON.stringify({ publicKey: pubKeyB64, keyId }),
          credentials: 'include',
          signal: _regController.signal,
        });
      } finally {
        clearTimeout(_regTimeout);
      }
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
    _markEnabled();
    console.log('[E2E] ✅ New key pair generated and registered');
    return true;
  }

  // FIX-STALE-RECIPIENT-KEY: public keys were cached (in-memory PUB_CACHE and
  // persistent PUB_KEY_STORE) forever, on the assumption a key never changes.
  // That assumption breaks the moment the other person regenerates their
  // keypair (new device, cleared storage, reinstall) — every message from
  // them then fails decryption permanently, because we keep computing shared
  // bits against their old, now-wrong public key and never look again.
  // This drops both the in-memory and persisted copy for one userId so the
  // next _getRecipientPublicKey call is forced back out to the network.
  function _purgeCachedRecipientKey(userId) {
    PUB_CACHE.delete(userId);
    const store = _loadPubKeyStore();
    if (store[userId]) {
      delete store[userId];
      _savePubKeyStore(store);
    }
  }

  // ── Get recipient's public key ─────────────────────────────────────────────
  // forceRefresh=true skips both the in-memory and persisted cache and goes
  // straight to the network — used by decryptFromChat's stale-key retry.
  //
  // FIX-NO-FALLBACK-WAIT-FOR-KEY: this used to give up after 3 attempts
  // (~500ms+1000ms+1500ms of backoff) and return null, which every caller
  // then treated as "ok, send/receive as plaintext." That is exactly
  // backwards for a brand-new chat opened from Friends/Calls/Status: the
  // recipient's key is almost always just a beat away — either their key
  // row genuinely hasn't synced to a read replica yet, or (see moodchat
  // routes/encryption.js) the relationship check used to require an
  // existing chat row that doesn't exist yet for a chat's very first
  // message. Instead of giving up, this now keeps retrying with a capped
  // backoff indefinitely, and de-dupes concurrent callers — 
  // prefetchRecipientKey() firing on chat-open and encryptForChat() firing
  // on Send both await the exact same in-flight attempt instead of racing
  // two separate fetch loops. The ONLY way this resolves to null is a
  // definitive, current "this person has never registered an encryption
  // key" (404) — a real business state, not a transient failure — which
  // callers surface as an error rather than a silent plaintext downgrade.
  const _inflightKeyFetch = new Map(); // userId → Promise<entry|null>

  async function _getRecipientPublicKey(userId, forceRefresh, signal) {
    if (!forceRefresh && PUB_CACHE.has(userId)) return PUB_CACHE.get(userId);

    // FIX-ROOT-CAUSE-DM-DECRYPT-FRAGILE: check the persistent store before
    // hitting the network at all — same treatment group sender keys already
    // get. A key, once seen, is trusted until _purgeCachedRecipientKey says
    // otherwise (see FIX-STALE-RECIPIENT-KEY above).
    const store = _loadPubKeyStore();
    const cached = !forceRefresh && store[userId];
    if (cached && cached.pub) {
      try {
        const key = await importPublicKey(cached.pub);
        const entry = { key, keyId: cached.keyId };
        PUB_CACHE.set(userId, entry);
        return entry;
      } catch (_) { /* corrupted entry — fall through to re-fetch */ }
    }

    if (_inflightKeyFetch.has(userId)) return _inflightKeyFetch.get(userId);

    const promise = (async () => {
      let attempt = 0;
      while (true) {
        if (signal?.aborted) return null;
        attempt++;
        try {
          // FIX-ROOT-CAUSE-SEND-RECEIVE-HANG: fetch() has no default timeout —
          // if this request stalls (dropped packet, cold/overloaded backend,
          // browser's per-origin connection limit queuing it behind other
          // in-flight requests), it never resolves OR rejects. Bound every
          // attempt with an AbortController so a stalled attempt always
          // settles and the retry loop moves on to try again, instead of
          // hanging (old behaviour) or silently giving up into plaintext
          // (older behaviour still).
          const _keyFetchController = new AbortController();
          const _keyFetchTimeout = setTimeout(() => _keyFetchController.abort(), 8000);
          let resp;
          try {
            resp = await fetch(`${await _apiBase()}/api/encryption/keys/${userId}`, {
              headers: await _authHeaders(),
              credentials: 'include',
              signal: _keyFetchController.signal,
            });
          } finally {
            clearTimeout(_keyFetchTimeout);
          }
          if (!resp.ok) {
            // A definitive "no key" (404) is a real state, not a transient
            // failure — this person genuinely has not registered a key yet.
            // Don't spin on that forever.
            if (resp.status === 404) return null;
            throw new Error(`Key fetch failed: ${resp.status}`);
          }
          const data = await resp.json();
          if (!data.data?.publicKey) return null;
          const key = await importPublicKey(data.data.publicKey);
          const entry = { key, keyId: data.data.keyId };
          PUB_CACHE.set(userId, entry);
          store[userId] = { pub: data.data.publicKey, keyId: data.data.keyId };
          _savePubKeyStore(store);
          return entry;
        } catch (e) {
          console.warn(`[E2E] Recipient key fetch attempt ${attempt} for user ${userId} did not succeed yet, still waiting:`, e?.message);
          try {
            document.dispatchEvent(new CustomEvent('kyn:e2eWaitingForKey', { detail: { userId, attempt } }));
          } catch (_) {}
          // Capped exponential backoff: 500ms, 1s, 2s, 4s, then holds at 8s.
          // No upper bound on attempts — the caller (e.g. the Send button)
          // is meant to keep waiting rather than downgrade to plaintext.
          await _sleep(Math.min(500 * Math.pow(2, attempt - 1), 8000));
        }
      }
    })().finally(() => _inflightKeyFetch.delete(userId));

    _inflightKeyFetch.set(userId, promise);
    return promise;
  }

  // ── FIX (SEND-HANG-NON-HISTORY-OPEN): warm the recipient's public key cache
  // as soon as a chat is OPENED (openChatWithUserInUI), instead of only ever
  // fetching it lazily inside encryptForChat() at the moment the user hits
  // Send. Chats opened from Chat History are almost always chats you've
  // already messaged before this session, so PUB_CACHE/PUB_KEY_STORE already
  // has the key and encryptForChat() resolves instantly. Chats opened from
  // Friend/Calls/Status are far more often the FIRST message to that person —
  // encryptForChat() then has to do the full network fetch (plus retries on a
  // cold Render backend) synchronously inside the send path, which is exactly
  // the multi-second-to-tens-of-seconds delay users on that path perceive as
  // the Send button "hanging"/not responding. Fire this in the background the
  // moment the chat panel opens so that work is already done (or in flight)
  // well before the user finishes typing and taps Send. Errors are swallowed —
  // this is purely a warm-up; encryptForChat() still does its own full
  // fetch+retry if this hasn't finished or failed.
  function prefetchRecipientKey(userId) {
    if (!userId) return;
    // Returns the same in-flight/queued promise a later encryptForChat()
    // call for this userId will also get from _getRecipientPublicKey's
    // dedupe map — so the warm-up started here on chat-open IS the wait
    // encryptForChat() does on Send, not a second, separate fetch.
    try { return _getRecipientPublicKey(userId).catch(() => null); } catch (_) { return null; }
  }

  // Distinct, catchable error types so callers (messages-core.operations.js)
  // can tell "this person has genuinely never set up encryption" apart from
  // "E2E isn't unlocked in this browser session yet" instead of both being
  // silently swallowed into a plaintext send.
  function E2ENotUnlockedError(message) { this.name = 'E2ENotUnlockedError'; this.message = message || 'Secure messaging is not unlocked in this session'; }
  E2ENotUnlockedError.prototype = Object.create(Error.prototype);
  function E2ENoRecipientKeyError(message) { this.name = 'E2ENoRecipientKeyError'; this.message = message || 'Recipient has not set up encryption'; }
  E2ENoRecipientKeyError.prototype = Object.create(Error.prototype);

  // ── Encrypt a message for a chat ──────────────────────────────────────────
  // FIX-NO-PLAINTEXT-FALLBACK: this never returns plaintext. If E2E isn't
  // unlocked yet, or the recipient's key hasn't been discovered yet, this
  // simply waits (see _waitForEnabled / _getRecipientPublicKey above) —
  // callers (the Send button) are expected to stay in "sending…" for that
  // duration, exactly as they already do for a slow network request. The
  // returned promise only rejects for a genuine, current business state
  // (recipient has no registered key at all — E2ENoRecipientKeyError).
  async function encryptForChat(plaintext, chatId, recipientUserId, opts) {
    await _waitForEnabled();
    const recipient = await _getRecipientPublicKey(recipientUserId, false, opts?.signal);
    if (!recipient) throw new E2ENoRecipientKeyError(`User ${recipientUserId} has not registered an encryption key`);

    const sharedBits = await _computeSharedBits(_myPrivKey, recipient.key);
    const aesKey     = await _hkdf(sharedBits, _chatContext(chatId, recipientUserId));
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

    // FIX-STALE-RECIPIENT-KEY: allow one retry against a forced-fresh key
    // fetch if decryption fails against whatever key we currently have
    // cached for this sender — see _purgeCachedRecipientKey above.
    let usedForceRefresh = false;
    let sender = await _getRecipientPublicKey(senderUserId);
    if (!sender) return '[Encrypted — sender key not found]';

    while (true) {
      const sharedBits = await _computeSharedBits(_myPrivKey, sender.key);

      // FIX-E2E-CHATID: try the stable per-pair context first (current
      // scheme, used by encryptForChat above). Fall back to the legacy
      // literal-chatId context for any message encrypted before this fix
      // was deployed, so existing history already at rest stays readable.
      try {
        const aesKey = await _hkdf(sharedBits, _chatContext(chatId, senderUserId));
        return await _aesDecrypt(envelope, aesKey);
      } catch (_) {
        try {
          const legacyKey = await _hkdf(sharedBits, String(chatId));
          return await _aesDecrypt(envelope, legacyKey);
        } catch (e) {
          if (usedForceRefresh) return '[Decryption failed]';
          // Both context attempts failed against the cached key — most
          // likely it's stale (sender regenerated their keypair). Purge it
          // and retry exactly once against a freshly-fetched key.
          usedForceRefresh = true;
          _purgeCachedRecipientKey(senderUserId);
          const fresh = await _getRecipientPublicKey(senderUserId, true);
          if (!fresh) return '[Encrypted — sender key not found]';
          sender = fresh;
          continue;
        }
      }
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
    const aesKey     = await _hkdf(sharedBits, _chatContext(chatId, recipientUserId));
    const iv         = global.crypto.getRandomValues(new Uint8Array(12));
    const ct         = await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, arrayBuffer);
    return { iv: b64(iv), ct: b64(ct) };
  }

  async function decryptAttachment(envelope, chatId, senderUserId) {
    if (!_enabled || !_myPrivKey) return null;
    const sender = await _getRecipientPublicKey(senderUserId);
    if (!sender) return null;
    const sharedBits = await _computeSharedBits(_myPrivKey, sender.key);
    try {
      const aesKey = await _hkdf(sharedBits, _chatContext(chatId, senderUserId));
      return subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv), tagLength: 128 }, aesKey, unb64(envelope.ct));
    } catch (_) {
      const legacyKey = await _hkdf(sharedBits, String(chatId));
      return subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv), tagLength: 128 }, legacyKey, unb64(envelope.ct));
    }
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
    // FIX (SEND-HANG-NON-HISTORY-OPEN): see prefetchRecipientKey definition above.
    prefetchRecipientKey,
    // FIX-NO-PLAINTEXT-FALLBACK: catchable error constructors so callers can
    // distinguish "not unlocked yet" / "recipient has no key" from other
    // failures instead of guessing off error.message text.
    E2ENotUnlockedError,
    E2ENoRecipientKeyError,
    waitForEnabled: _waitForEnabled,
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
    // Exposed for js/double-ratchet.js — identity key material needed to
    // bootstrap a ratchet session (X3DH-style handshake) on first contact.
    getMyIdentityPrivateKey()    { return _myPrivKey; },
    getIdentityPublicKeyB64(userId) {
      return _getRecipientPublicKey(userId).then(r => r?.key ? exportPublicKey({ publicKey: r.key }) : null);
    },
    getEncryptionContext: _chatContext,
    get enabled() { return _enabled; },
    get publicKey() { return _myPubKeyB64; },
    get keyId() { return _myKeyId; },
    clearKeys() {
      localStorage.removeItem(STORE_KEY);
      _myPrivKey = null; _myPubKeyB64 = null; _myKeyId = null; _enabled = false;
      PUB_CACHE.clear();
      _newEnabledGate(); // future callers should wait again, not see a stale "ready" gate
    },
  };

  // Let modules that depend on KynectaE2E (e.g. js/double-ratchet.js) know
  // it's ready, instead of relying purely on their own polling/setTimeout
  // fallbacks.
  try { document.dispatchEvent(new CustomEvent('kyn:e2eReady')); } catch (_) {}

  console.log('[KynectaE2E] ✅ Loaded — WebCrypto:', !!subtle);

})(window);
