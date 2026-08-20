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
  const STORE_KEY_PREFIX = 'kyn_e2e_keypair_v1';   // localStorage key for encrypted private key
  // FIX-ROOT-CAUSE-SHARED-BROWSER-IDENTITY-COLLISION: this used to be a
  // single fixed string with no per-user component. localStorage is shared
  // across every tab/window for the same browser origin — it is NOT scoped
  // per logged-in account. Testing (or simply using) two different accounts
  // in the same browser (two tabs, or switching accounts in one tab) means
  // whichever account calls init() SECOND finds the FIRST account's
  // encrypted identity-key blob already sitting under this key, tries to
  // decrypt it with its own password, fails (it's not their key), and per
  // the anti-orphaning fix elsewhere in this function refuses to generate a
  // replacement — so that account's E2E never reaches `enabled`. Depending
  // on timing this manifests as messages failing to encrypt at all, OR (if
  // the FIRST account's leftover in-memory key state is still active when a
  // message for the SECOND account gets encrypted/decrypted) as a genuine
  // wrong-key mismatch — exactly "first send and reply always fail with
  // decryption failed," independent of login method (manual vs Google),
  // because both methods write through this same function. Scoping the
  // storage key by the current user's id, so each account gets its own slot
  // in the same browser's localStorage, is the fix.
  function _storeKey() {
    const uid = _myUserId();
    return uid ? `${STORE_KEY_PREFIX}_${uid}` : STORE_KEY_PREFIX;
  }
  const PUB_CACHE = new Map();               // userId → CryptoKey (public key cache, this page load only)
  // FIX (403-treated-as-transient): tracks WHY the last key fetch for a
  // userId came back empty, so encryptForChat() below can tell a
  // permanent, un-retryable "you're not authorized to see this key yet"
  // (403 — no shared chat/accepted friendship) apart from a genuinely
  // transient failure (timeout/5xx), instead of showing the same generic
  // "please retry" message for both. See the 403 handling in
  // _getRecipientPublicKey and its use in encryptForChat.
  const _lastKeyFetchFailureReason = new Map(); // userId → 'not_authorized' | undefined
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
  // FIX-BROKEN-ENABLED-GATE (root cause of messages hanging in "sending..."
  // forever, and of the "_newEnabledGate ... Cannot set properties of
  // undefined (setting 'resolve')" crash on every page load / clearKeys()):
  // `new Promise(resolve => { _enabledGate.resolve = resolve; })` runs its
  // executor SYNCHRONOUSLY, before the `_enabledGate = ...` assignment around
  // it has actually completed — so inside the executor, `_enabledGate` still
  // pointed at its OLD value (undefined the first time this ever ran).
  // `undefined.resolve = resolve` threw immediately, every time, so
  // `_enabledGate.resolve` was never actually set. `_markEnabled()` further
  // down (which encryption init calls once keys are really ready) then also
  // threw ("_enabledGate.resolve is not a function") instead of ever
  // resolving the gate. Net effect: `_enabled` could never become true and
  // `_waitForEnabled()` — which the Send button awaits before it will send,
  // by explicit design per the comment below — could never resolve. Fixed by
  // capturing the resolver in a local variable first and attaching it to the
  // gate only after the Promise object actually exists.
  function _newEnabledGate() {
    let _resolve;
    _enabledGate = new Promise(resolve => { _resolve = resolve; });
    _enabledGate.resolve = _resolve;
  }
  _newEnabledGate();
  function _markEnabled() {
    _enabled = true;
    _enabledGate.resolve();
    // CRYPTO-PIPELINE: tell the pending-decrypt retry queue (defined below)
    // that keys just became usable, so anything queued while E2E was still
    // unlocking gets retried immediately instead of waiting for its own
    // backoff timer.
    try { document.dispatchEvent(new CustomEvent('kyn:e2eUnlocked')); } catch (_) {}
  }
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

    const stored = localStorage.getItem(_storeKey());
    if (stored) {
      try {
        const obj     = JSON.parse(stored);
        const pkcs8   = await _decryptPrivateKey(obj.encPrivKey, password);
        _myPrivKey    = await importPrivateKey(pkcs8);
        _myPubKeyB64  = obj.pubKey;
        _myKeyId      = obj.keyId;

        // FIX-REGISTRATION-CONFIRMATION-GATE (item #3): a stored key that
        // was never actually confirmed registered by the server (e.g. the
        // very first init() this identity ever went through hit the
        // network-failure branch below and got persisted with
        // registered:false) must NOT flip E2E_READY on just because it
        // decrypts fine locally — the private/public key pair existing
        // locally is only 2 of the 3 required conditions. Keep retrying
        // registration in the background exactly like the brand-new-key
        // path does, and only mark enabled once the server actually has it.
        // `registered` is absent on keys stored before this fix shipped —
        // treat that as already-confirmed (best available assumption; the
        // old code always attempted registration synchronously before ever
        // reaching this branch on a prior run).
        if (obj.registered === false) {
          console.warn('[E2E] Stored key was never confirmed registered — retrying in background before enabling E2E.');
          _retryRegistrationInBackground(_myPubKeyB64, _myKeyId);
          return false;
        }

        _markEnabled();
        // Opportunistic, non-blocking re-sync: keeps the server's record in
        // sync with this device's key without gating readiness on it.
        _postRegisterKey(_myPubKeyB64, _myKeyId).catch(() => {});
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
              localStorage.setItem(_storeKey(), JSON.stringify({ encPrivKey: reEncPrivKey, pubKey: _myPubKeyB64, keyId: _myKeyId }));
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

    // FIX-REGISTRATION-CONFIRMATION-GATE (item #3, "server confirms
    // registration"): this used to swallow a failed upload, keep the
    // locally-generated keyId anyway, and mark E2E enabled regardless —
    // so the Send path could merrily encrypt against a "key" the server
    // never actually stored, and anyone messaging THIS account got a 404
    // for its public key. _registerPublicKeyWithRetry() below retries with
    // capped backoff for a few seconds before this init() call gives up and
    // returns; only a real 2xx from the server counts as confirmed.
    const registered = await _registerPublicKeyWithRetry(pubKeyB64, keyId);

    // Store encrypted private key locally regardless of registration
    // outcome — the identity itself is real and must not be regenerated on
    // the next attempt just because the network hiccuped. `registered` is
    // persisted alongside it so a later init() (see the "load from storage"
    // branch above) knows whether it still owes the server a confirmation.
    localStorage.setItem(_storeKey(), JSON.stringify({ encPrivKey, pubKey: pubKeyB64, keyId, registered }));

    _myPrivKey   = kp.privateKey;
    _myPubKeyB64 = pubKeyB64;
    _myKeyId     = keyId;

    if (registered) {
      _markEnabled();
      console.log('[E2E] ✅ New key pair generated and registered — server confirmed');
      return true;
    }

    // Server never confirmed within the retry window. Do NOT mark E2E
    // enabled (item #9: no silent downgrade against an unconfirmed
    // identity) — keep retrying in the background instead. _markEnabled()
    // fires the moment a later background attempt succeeds, which
    // unblocks any caller already parked in _waitForEnabled()/
    // encryptForChat() automatically.
    console.warn('[E2E] Key registration did not reach the server within the retry window — E2E stays unready and will keep retrying in the background.');
    _retryRegistrationInBackground(pubKeyB64, keyId);
    return false;
  }

  // Bounded retry burst for registration: a handful of attempts over a few
  // seconds (mirrors the recipient-key-fetch backoff pattern already used
  // elsewhere in this file), so login/session-init doesn't hang
  // indefinitely on a slow/cold backend — see _retryRegistrationInBackground
  // for what happens if even this gives up.
  const _REG_RETRY_DELAYS_MS = [0, 500, 1000, 1500];
  async function _registerPublicKeyWithRetry(pubKeyB64, keyId) {
    for (let i = 0; i < _REG_RETRY_DELAYS_MS.length; i++) {
      if (_REG_RETRY_DELAYS_MS[i] > 0) await _sleep(_REG_RETRY_DELAYS_MS[i]);
      const ok = await _postRegisterKey(pubKeyB64, keyId);
      if (ok) return true;
    }
    return false;
  }

  async function _postRegisterKey(pubKeyB64, keyId) {
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
      return !!resp.ok;
    } catch (e) {
      console.warn('[E2E] Key registration attempt failed:', e?.message);
      return false;
    }
  }

  // Keeps retrying (slower, capped interval — not the tight initial burst)
  // until the server finally confirms, then marks the SAME in-memory key
  // pair enabled. Nothing needs to re-generate or re-init when this
  // succeeds; every caller already waiting on _waitForEnabled() just
  // resolves at that point.
  let _bgRegistrationTimer = null;
  function _retryRegistrationInBackground(pubKeyB64, keyId) {
    if (_bgRegistrationTimer) return; // already retrying
    let attempt = 0;
    const tick = async () => {
      attempt++;
      const ok = await _postRegisterKey(pubKeyB64, keyId);
      if (ok) {
        _bgRegistrationTimer = null;
        try {
          const stored = JSON.parse(localStorage.getItem(_storeKey()) || '{}');
          stored.registered = true;
          localStorage.setItem(_storeKey(), JSON.stringify(stored));
        } catch (_) {}
        _markEnabled();
        console.log('[E2E] ✅ Background key registration succeeded — E2E now ready');
        return;
      }
      _bgRegistrationTimer = setTimeout(tick, Math.min(5000 * attempt, 30000));
    };
    _bgRegistrationTimer = setTimeout(tick, 5000);
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

  // FIX-NO-PLAINTEXT-FALLBACK (2026-08-11, explicit user directive —
  // reverses the 2026-08-12 FIX-PLAINTEXT-FALLBACK change referenced in
  // older comments throughout this file): sending a real message
  // unencrypted just because a key fetch was slow is a security regression,
  // not an acceptable trade-off for a responsive Send button. Per the
  // requested protocol, this window bounds each attempt loop (fetch, then
  // capped-backoff retries) to a few seconds — long enough to ride out a
  // cold Render backend without freezing the UI — after which
  // _getRecipientPublicKey resolves to null and the CALLER (encryptForChat)
  // fails the send with a clear, catchable, retryable error instead of
  // ever downgrading to plaintext. See E2ESecureFailureError below.
  const _KEY_FETCH_GIVEUP_MS = 4000;

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
        try { document.dispatchEvent(new CustomEvent('kyn:e2eKeyAvailable', { detail: { userId } })); } catch (_) {}
        return entry;
      } catch (_) { /* corrupted entry — fall through to re-fetch */ }
    }

    if (_inflightKeyFetch.has(userId)) return _inflightKeyFetch.get(userId);

    const promise = (async () => {
      let attempt = 0;
      const _startedAt = Date.now();
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
          // FIX-ROOT-CAUSE-SEND-RECEIVE-HANG (timing correction): this
          // per-attempt abort was hardcoded to 8000ms — twice the outer
          // _KEY_FETCH_GIVEUP_MS budget (4000ms) that's supposed to bound the
          // whole retry loop. The outer giveup check only runs in the catch
          // block AFTER an attempt finishes, so on a genuinely stalled
          // network the first attempt alone could run the full 8s before
          // that check ever got a chance to apply — meaning the real
          // worst-case wait for a reply/send was ~8-12s, not the intended
          // ~4s, and felt like a hang. Bound each attempt to the same
          // _KEY_FETCH_GIVEUP_MS window so the outer giveup logic can
          // actually enforce what its own constant promises.
          const _keyFetchTimeout = setTimeout(() => _keyFetchController.abort(), _KEY_FETCH_GIVEUP_MS);
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
            if (resp.status === 404) { _lastKeyFetchFailureReason.delete(userId); return null; }
            // FIX (403-treated-as-transient): a 403 here means the backend's
            // _canSeeEncryptionKey() check found no shared chat AND no
            // accepted friendship between these two users — see
            // src/routes/encryption.js. That is exactly as permanent and
            // un-retryable as a 404: retrying with backoff for the full
            // _KEY_FETCH_GIVEUP_MS window (previously the same path as a
            // network timeout/5xx) can never succeed until the actual
            // authorization gap (no friendship) is resolved by the people
            // involved, not by retrying a fetch. Stop immediately instead of
            // burning the whole retry window on something that will never
            // change on its own, and record why so encryptForChat() can show
            // an accurate message instead of "please retry".
            if (resp.status === 403) { _lastKeyFetchFailureReason.set(userId, 'not_authorized'); return null; }
            throw new Error(`Key fetch failed: ${resp.status}`);
          }
          _lastKeyFetchFailureReason.delete(userId);
          const data = await resp.json();
          if (!data.data?.publicKey) return null;
          const key = await importPublicKey(data.data.publicKey);
          const entry = { key, keyId: data.data.keyId };
          PUB_CACHE.set(userId, entry);
          store[userId] = { pub: data.data.publicKey, keyId: data.data.keyId };
          _savePubKeyStore(store);
          try { document.dispatchEvent(new CustomEvent('kyn:e2eKeyAvailable', { detail: { userId } })); } catch (_) {}
          return entry;
        } catch (e) {
          console.warn(`[E2E] Recipient key fetch attempt ${attempt} for user ${userId} did not succeed yet:`, e?.message);
          try {
            document.dispatchEvent(new CustomEvent('kyn:e2eWaitingForKey', { detail: { userId, attempt } }));
          } catch (_) {}
          // Bounded window (see _KEY_FETCH_GIVEUP_MS above): after this,
          // stop retrying and resolve to null. Returning null — rather than
          // throwing — lets the CALLER (encryptForChat) decide what a
          // definitive "couldn't resolve in time" means for it; today that
          // means failing the send with E2ESecureFailureError rather than
          // ever sending unencrypted.
          if (Date.now() - _startedAt > _KEY_FETCH_GIVEUP_MS) {
            console.warn(`[E2E] Giving up on recipient ${userId}'s key after ${attempt} attempt(s) within the ${_KEY_FETCH_GIVEUP_MS}ms window.`);
            return null;
          }
          // Short, capped backoff within the bounded window: 500ms, 1000ms, then holds at 1.5s.
          await _sleep(Math.min(500 * Math.pow(2, attempt - 1), 1500));
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

  // FIX (BOOTSTRAP-KEY-NEVER-CACHED): POST /chats/bootstrap already returns
  // the recipient's public key inline (publicKeys.theirs) specifically so
  // the frontend never has to make a separate round trip before the first
  // send — see messages-core.operations.js's bootstrapConversation(), which
  // has been calling `window.KynectaE2E.cacheRecipientKey(...)` since that
  // fix landed. That function was never actually defined here, so the call
  // was always a silent no-op (optional chaining swallowed it) and every
  // single chat — including ones opened from Chat History, where the key is
  // usually already cached anyway — fell through to the `else if` branch
  // and re-fetched the key over the network via prefetchRecipientKey/
  // _getRecipientPublicKey instead of using the key bootstrap just handed
  // it. For a genuinely first-time chat with someone who isn't a friend yet
  // (e.g. opened from Search/Marketplace), that redundant fetch races the
  // still-in-flight bootstrap call that is what actually creates the
  // chat_participants row the key-fetch's authorization check depends on —
  // occasionally 403'ing before self-healing on a later retry, adding
  // several seconds of avoidable delay right on the send-hang critical
  // path. Defining this function closes that gap: the key bootstrap already
  // fetched (with its own, already-authorized request) is trusted and
  // cached immediately, with no extra network round trip and no race.
  async function cacheRecipientKey(userId, keyEntry) {
    if (!userId || !keyEntry?.publicKey) return false;
    try {
      const key = await importPublicKey(keyEntry.publicKey);
      const entry = { key, keyId: keyEntry.keyId };
      PUB_CACHE.set(userId, entry);
      const store = _loadPubKeyStore();
      store[userId] = { pub: keyEntry.publicKey, keyId: keyEntry.keyId };
      _savePubKeyStore(store);
      // Resolve/clear any prefetch already in flight for this user so a
      // slower, now-redundant network fetch doesn't overwrite this with a
      // stale result later.
      _inflightKeyFetch.delete(userId);
      try { document.dispatchEvent(new CustomEvent('kyn:e2eKeyAvailable', { detail: { userId } })); } catch (_) {}
      return true;
    } catch (e) {
      console.warn('[E2E] cacheRecipientKey: failed to import provided key, falling back to network fetch:', e?.message);
      return false;
    }
  }

  // ── FIX (KEY-ANNOUNCEMENT / ITEM 5,6,7 — live WebSocket key push) ─────────
  // Previously the only way this module ever learned about a public key was
  // a REST fetch triggered by prefetchRecipientKey()/encryptForChat() — a
  // friend who had just registered their very first key (e.g. logging in
  // for the first time) stayed invisible until something on this side
  // happened to fetch them again, and a friend who rotated their key (new
  // device, cleared storage, reinstall) left this side silently encrypting
  // against a now-stale cached key until a decrypt failure forced a
  // re-fetch (see _purgeCachedRecipientKey/FIX-STALE-RECIPIENT-KEY above).
  // The backend now pushes 'e2e:key_available' (first registration) and
  // 'e2e:key_rotated' (replacing a previously-active key) over the socket
  // to everyone authorized to see that key — see moodchat
  // src/routes/encryption.js's _broadcastKeyEvent. Two delivery paths are
  // listened for here because this module runs inside iframes that don't
  // all own a socket connection themselves (see js/app.realtime.socket.js —
  // message.html/chat.html have a live socket, group.html only receives
  // events relayed via postMessage from the parent frame):
  //   1. Same-frame: app.realtime.socket.js dispatches a
  //      'kyn:e2e:key_available' / 'kyn:e2e:key_rotated' CustomEvent on
  //      window the moment its own socket.on() fires.
  //   2. Cross-frame: the parent frame's socket relay also postMessage()s a
  //      { type: 'SOCKET_EVENT', event, payload } envelope to every iframe
  //      it owns, matching the existing identity-update relay pattern.
  // Both paths converge on the same handler, and cacheRecipientKey()
  // (above) already overwrites both the in-memory and persisted cache for
  // this userId — so a rotation is picked up instantly with no separate
  // purge step needed.
  function _handleKeyAnnouncement(payload) {
    if (!payload || !payload.userId || !payload.publicKey) return;
    cacheRecipientKey(payload.userId, { publicKey: payload.publicKey, keyId: payload.keyId })
      .then((ok) => { if (ok) console.log(`[E2E] 🔑 Live key update applied for user ${payload.userId}`); });
  }

  try {
    window.addEventListener('kyn:e2e:key_available', (e) => _handleKeyAnnouncement(e.detail));
    window.addEventListener('kyn:e2e:key_rotated', (e) => _handleKeyAnnouncement(e.detail));
    window.addEventListener('message', (e) => {
      const data = e && e.data;
      if (!data || data.type !== 'SOCKET_EVENT') return;
      if (data.event === 'e2e:key_available' || data.event === 'e2e:key_rotated') {
        _handleKeyAnnouncement(data.payload);
      }
    });
  } catch (_) {}

  // FIX-NO-PLAINTEXT-FALLBACK (item #9): callers distinguish "couldn't
  // secure this send in time" from other failures via this error's name
  // (or instanceof), rather than guessing off error.message text. Kept as
  // the single catchable failure type for the whole encrypt path —
  // E2ENotUnlockedError/E2ENoRecipientKeyError/E2EKeyFetchTimeoutError from
  // older revisions of this file are gone; nothing in this module
  // distinguishes those cases from one another anymore, since the caller's
  // handling (fail the send, let the person retry) is identical either way.
  function E2ESecureFailureError(message) {
    this.name = 'E2ESecureFailureError';
    this.message = message || '🔒 Secure connection is being established. Please retry.';
  }
  E2ESecureFailureError.prototype = Object.create(Error.prototype);

  // Bounded wait for E2E itself to become ready (item #10: "await
  // ensureRecipientKey() ... temporary failure → retry ... definitive
  // failure → stop" — applied here to the enabled-gate as well as to the
  // recipient-key fetch inside encryptForChat below). Resolves `true` the
  // moment _markEnabled() fires, or `false` once `ms` elapses without that
  // happening — it does NOT reject, so callers always get a definite
  // answer within the budget instead of hanging.
  function _waitForEnabledBounded(ms) {
    if (_enabled) return Promise.resolve(true);
    return Promise.race([
      _enabledGate.then(() => true),
      _sleep(ms).then(() => _enabled),
    ]);
  }
  const _SEND_READY_GIVEUP_MS = 4000;

  // ── Encrypt a message for a chat ──────────────────────────────────────────
  // FIX-NO-PLAINTEXT-FALLBACK (2026-08-11, explicit user directive —
  // reverses the 2026-08-12 FIX-PLAINTEXT-FALLBACK change referenced in
  // older comments throughout this file): sending a real message
  // unencrypted whenever E2E or a key fetch is merely slow is a security
  // regression, not an acceptable trade-off for a responsive Send button.
  // Per the requested protocol: wait for readiness for a bounded window
  // (a few seconds, with capped-backoff retries — see _SEND_READY_GIVEUP_MS
  // and _KEY_FETCH_GIVEUP_MS), and if it still can't resolve, FAIL the send
  // with a clear, catchable, retryable error instead of silently
  // downgrading to plaintext or hanging forever. The caller
  // (sendMessageToBackend in messages-core.operations.js) surfaces this as
  // a normal failed-message state with a retry affordance — exactly like a
  // network failure — and the message is never sent unencrypted.
  //
  // A 'kyn:e2eSecureFailure' event is also dispatched whenever this
  // happens, so the UI can optionally surface a live "waiting to secure…"
  // indicator without this module needing to know about any specific UI.
  async function encryptForChat(plaintext, chatId, recipientUserId, opts) {
    const readyInTime = await _waitForEnabledBounded(_SEND_READY_GIVEUP_MS);
    if (!readyInTime) {
      console.warn('[E2E] Not unlocked/ready within the wait window — refusing to send unencrypted.');
      try { document.dispatchEvent(new CustomEvent('kyn:e2eSecureFailure', { detail: { userId: recipientUserId, chatId, reason: 'not_ready' } })); } catch (_) {}
      throw new E2ESecureFailureError();
    }

    const recipient = await _getRecipientPublicKey(recipientUserId, false, opts?.signal);
    if (!recipient) {
      // FIX (403-treated-as-transient, cont'd): "not_authorized" (backend
      // 403 — no shared chat and no accepted friendship yet) is a different,
      // permanent condition from a plain timed-out key fetch, and telling
      // the user to "please retry" for it is actively wrong — retrying
      // changes nothing until they're actually friends. Give the accurate
      // reason in both the event detail and the thrown error's message.
      const _reason = _lastKeyFetchFailureReason.get(recipientUserId) === 'not_authorized'
        ? 'not_authorized'
        : 'no_recipient_key';
      const _message = _reason === 'not_authorized'
        ? "🔒 You need to be friends with this person before you can message them securely."
        : undefined; // keep E2ESecureFailureError's existing default message for the other case
      console.warn(`[E2E] No usable key for user ${recipientUserId} within the wait window (${_reason}) — refusing to send unencrypted.`);
      try { document.dispatchEvent(new CustomEvent('kyn:e2eSecureFailure', { detail: { userId: recipientUserId, chatId, reason: _reason } })); } catch (_) {}
      throw new E2ESecureFailureError(_message);
    }

    const sharedBits = await _computeSharedBits(_myPrivKey, recipient.key);
    const aesKey     = await _hkdf(sharedBits, _chatContext(chatId, recipientUserId));
    const env        = await _aesEncrypt(plaintext, aesKey);

    return JSON.stringify({ v: 1, kid: _myKeyId, iv: env.iv, ct: env.ct });
  }

  // ══════════════════════════════════════════════════════════════════════
  // CRYPTO-PIPELINE (single canonical decrypt-for-display service)
  // ══════════════════════════════════════════════════════════════════════
  // Every surface that shows message content derived from an E2E envelope —
  // the chat panel bubbles, the sidebar/recent-chats preview, the multi-send
  // picker, the hidden-vault modal, search, the unread counter, and
  // notification previews — used to each carry their own copy of "does this
  // look like ciphertext" detection and/or their own ad-hoc sender/peer
  // resolution before calling decryptFromChat(). That duplication is exactly
  // how the sidebar ended up permanently stuck on a static "🔒 Encrypted
  // message" placeholder (three separate copies of the same regex, in
  // messages-ui.js, none of which ever actually attempted a decrypt) while
  // the chat panel decrypted correctly right next to it.
  //
  // decryptMessageForDisplay() below is the ONE place any UI surface should
  // call to turn a message's raw `.content` into safe display text. It:
  //   1. Detects whether content is an E2E envelope at all (plaintext passes
  //      straight through, untouched).
  //   2. Resolves the correct peer via resolveMessageCryptoPeer() — the same
  //      canonical sender/receiver inversion logic every caller needs, in
  //      one place instead of scattered per call site.
  //   3. Decrypts through the existing decryptFromChat() — no second crypto
  //      implementation.
  //   4. Caches the plaintext per message id, so every surface showing the
  //      same message (bubble + sidebar preview + search) decrypts it AT
  //      MOST ONCE and thereafter reads the shared cache.
  //   5. If keys aren't ready yet (not unlocked, or the peer's public key
  //      hasn't arrived), NEVER shows raw ciphertext and NEVER reports the
  //      message as corrupted/failed — it queues the message and retries
  //      automatically the moment 'kyn:e2eUnlocked' or 'kyn:e2eKeyAvailable'
  //      fires, then broadcasts 'kyn:messageDecrypted' so every subscribed
  //      surface can patch itself in place.
  //   6. Logs each stage (MESSAGE_RECEIVED, KEY_LOOKUP_START, KEY_FOUND,
  //      DECRYPT_START, DECRYPT_SUCCESS, DECRYPT_FAILED_REASON) so the whole
  //      receive→decrypt path can be traced from the console.

  function _pipelineLog(stage, meta) {
    try { console.log(`[E2E-PIPELINE] ${stage}`, meta || ''); } catch (_) {}
  }

  // messageId → plaintext. Populated the first time ANY surface successfully
  // decrypts a given message; every other surface then reads this instead of
  // re-decrypting. Cleared only by clearKeys() (account switch/logout).
  const _decryptCache = new Map();

  // messageId → { content, chatId, peerUserId, currentUserId, subscribers }
  // "subscribers" are resolve functions from decryptMessageForDisplay() calls
  // that are currently waiting on this exact message; a retry that succeeds
  // resolves all of them and fires 'kyn:messageDecrypted' for anyone that
  // isn't directly awaiting the promise (e.g. an already-rendered bubble).
  const _pendingDecryptQueue = new Map();
  const _PENDING_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000]; // capped backoff, then holds at 15s

  function _envelopeShape(content) {
    if (!content || typeof content !== 'string') return null;
    const v = content.trim();
    if (v.charAt(0) !== '{') return null;
    try {
      const obj = JSON.parse(v);
      if (!obj || typeof obj !== 'object') return null;
      if (!('v' in obj) && !('ct' in obj) && !('iv' in obj)) return null;
      return obj;
    } catch (_) { return null; }
  }

  // ── Canonical peer resolution ──────────────────────────────────────────
  // Resolves { senderId, receiverId, peerUserId, conversationId } for a
  // message from AUTHORITATIVE state only — message.senderId/receiverId as
  // delivered by the server, never a UI-local/pending/temporary chat id, and
  // never the currently-open conversation's id used as a stand-in for the
  // sender. currentUserId + activeConversation are only consulted as a last
  // resort when the message itself is missing a receiverId (e.g. some legacy
  // rows) — matching the documented "for an incoming message myUserId =
  // receiver, peerUserId = sender; for an outgoing echo, myUserId = sender,
  // peerUserId = receiver" rule in exactly one place.
  function resolveMessageCryptoPeer(message, currentUserId, activeConversation) {
    const msg = message || {};
    const me = currentUserId != null ? String(currentUserId) : (_myUserId() || null);
    const senderId = msg.senderId != null ? String(msg.senderId)
      : (msg.sender && msg.sender.id != null ? String(msg.sender.id) : null);
    const receiverId = msg.receiverId != null ? String(msg.receiverId)
      : (msg.recipientId != null ? String(msg.recipientId)
        : (msg.receiver && msg.receiver.id != null ? String(msg.receiver.id)
          : (msg.recipient && msg.recipient.id != null ? String(msg.recipient.id) : null)));
    const conversationId = msg.chatId || msg.conversationId || (activeConversation && activeConversation.id) || null;

    const isOwnMessage = !!(me && senderId && senderId === me);
    let peerUserId;
    if (isOwnMessage) {
      // Outgoing echo (own message coming back via socket/history/sync):
      // the peer we encrypted FOR is the receiver, never ourselves.
      peerUserId = receiverId ||
        (activeConversation && String(
          activeConversation.friendId || activeConversation.otherUserId ||
          (activeConversation.otherParticipant && activeConversation.otherParticipant.id) || ''
        )) || null;
    } else {
      // Incoming message: the peer is whoever actually sent it — authoritative,
      // never swapped for the currently-open conversation's id.
      peerUserId = senderId;
    }
    if (peerUserId === '') peerUserId = null;
    return { senderId, receiverId, peerUserId, conversationId };
  }

  function _scheduleRetry(messageId) {
    const entry = _pendingDecryptQueue.get(messageId);
    if (!entry || entry.timer) return;
    const delay = _PENDING_RETRY_DELAYS_MS[Math.min(entry.attempts, _PENDING_RETRY_DELAYS_MS.length - 1)];
    entry.timer = setTimeout(() => { entry.timer = null; _attemptQueuedDecrypt(messageId); }, delay);
  }

  async function _attemptQueuedDecrypt(messageId) {
    const entry = _pendingDecryptQueue.get(messageId);
    if (!entry) return;
    entry.attempts++;
    const result = await _decryptCore(entry.content, entry.chatId, entry.peerUserId, messageId);
    if (result.ok) {
      _pendingDecryptQueue.delete(messageId);
      _decryptCache.set(messageId, result.plaintext);
      entry.subscribers.forEach(fn => { try { fn(result.plaintext); } catch (_) {} });
      try {
        document.dispatchEvent(new CustomEvent('kyn:messageDecrypted', {
          detail: { messageId, chatId: entry.chatId, plaintext: result.plaintext }
        }));
      } catch (_) {}
    } else {
      // Still not ready (keys not available yet) — keep waiting for the next
      // 'kyn:e2eUnlocked'/'kyn:e2eKeyAvailable' event or the backoff timer,
      // whichever comes first. A message is only ever reported as a genuine
      // decrypt FAILURE (as opposed to "not ready yet") once decryptFromChat
      // itself returns its own bounded failure placeholder — see _decryptCore.
      _scheduleRetry(messageId);
    }
  }

  function _retryAllPending() {
    for (const messageId of Array.from(_pendingDecryptQueue.keys())) {
      const entry = _pendingDecryptQueue.get(messageId);
      if (entry && entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
      _attemptQueuedDecrypt(messageId);
    }
  }
  document.addEventListener('kyn:e2eUnlocked', _retryAllPending);
  document.addEventListener('kyn:e2eKeyAvailable', (e) => {
    const uid = e?.detail?.userId != null ? String(e.detail.userId) : null;
    if (!uid) return _retryAllPending();
    for (const [messageId, entry] of _pendingDecryptQueue.entries()) {
      if (String(entry.peerUserId) === uid) {
        if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
        _attemptQueuedDecrypt(messageId);
      }
    }
  });

  // Does the actual decrypt + logging for one attempt. Returns
  // { ok:true, plaintext } or { ok:false, reason, retryable }.
  async function _decryptCore(content, chatId, peerUserId, messageId) {
    if (!peerUserId) {
      _pipelineLog('DECRYPT_FAILED_REASON', { messageId, reason: 'no_peer_id' });
      return { ok: false, reason: 'no_peer_id', retryable: false };
    }
    _pipelineLog('KEY_LOOKUP_START', { messageId, peerUserId });
    if (!_enabled || !_myPrivKey) {
      _pipelineLog('DECRYPT_FAILED_REASON', { messageId, reason: 'not_unlocked' });
      return { ok: false, reason: 'not_unlocked', retryable: true };
    }
    const keyEntry = await _getRecipientPublicKey(peerUserId, false, undefined);
    if (!keyEntry) {
      _pipelineLog('DECRYPT_FAILED_REASON', { messageId, reason: 'key_not_found' });
      return { ok: false, reason: 'key_not_found', retryable: true };
    }
    _pipelineLog('KEY_FOUND', { messageId, peerUserId, keyId: keyEntry.keyId });
    _pipelineLog('DECRYPT_START', { messageId, chatId, peerUserId });
    let plaintext;
    try {
      plaintext = await decryptFromChat(content, chatId, peerUserId);
    } catch (e) {
      _pipelineLog('DECRYPT_FAILED_REASON', { messageId, reason: e?.message || 'exception' });
      return { ok: false, reason: e?.message || 'exception', retryable: true };
    }
    const looksLikePlaceholder = typeof plaintext === 'string' && plaintext.indexOf('[') === 0;
    if (!plaintext || plaintext === content || looksLikePlaceholder) {
      // FIX (chat panel permanently stuck on "Encrypted message"): this used
      // to treat EVERY placeholder starting with '[' as a genuine, exhausted,
      // non-retryable failure — true of decryptFromChat's OWN v1 path (it
      // retries once internally against a freshly-fetched key before ever
      // returning a placeholder). It is NOT true of the X3DH transport
      // installed by js/e2e-session-init.js (envelope v3): secureDecrypt()
      // there returns '[Encrypted message — secure session unavailable]' the
      // FIRST time it's called if the session state simply hasn't finished
      // loading from storage yet, or the X3DH handshake hasn't completed —
      // both ordinary "not ready yet" conditions, not permanent failures.
      // Marking that non-retryable is exactly why a bubble could sit on the
      // fallback text forever even though the sender/receiver, keys, and
      // transport were all fine. Only a message-sequence violation (out-of-
      // window / already-consumed counter — a genuine, non-recoverable
      // desync/replay signal) is treated as permanent now; every other
      // placeholder — including an unrecognized envelope shape, which
      // resolves itself once the matching crypto module finishes loading —
      // is retried via the existing bounded-backoff queue below.
      const isPermanent = typeof plaintext === 'string' && plaintext.indexOf('invalid message sequence') !== -1;
      _pipelineLog('DECRYPT_FAILED_REASON', { messageId, reason: plaintext || 'empty_result', retryable: !isPermanent });
      return { ok: false, reason: plaintext || 'empty_result', retryable: !isPermanent };
    }
    _pipelineLog('DECRYPT_SUCCESS', { messageId, chatId, peerUserId });
    return { ok: true, plaintext };
  }

  // ── The single public entry point every UI surface should call ─────────
  // message: the raw message object (needs .id/.localId, .content, .senderId
  //          at minimum; .receiverId helps for own-echo resolution)
  // chatId: authoritative chat/conversation id for this message
  // currentUserId: the logged-in user's id
  // opts.activeConversation: optional, only used as a last-resort fallback
  //          when the message itself doesn't carry a receiverId
  // opts.fallbackText: text to return immediately while a message is queued
  //          for retry or has permanently failed — defaults to a neutral
  //          lock icon for in-app surfaces; notification callers should pass
  //          'New message received' per the "never show ciphertext" rule.
  // opts.onResolved(plaintext): optional callback invoked later (possibly
  //          seconds afterward) if the message was queued and a retry then
  //          succeeds — lets a caller that can't easily subscribe to
  //          'kyn:messageDecrypted' still patch itself.
  // Synchronous cache peek — lets a render loop that can't await (e.g.
  // building a big HTML string in one pass) show an already-known plaintext
  // immediately instead of always starting from the fallback text, without
  // needing to restructure the caller into async/await.
  function peekDecryptedText(message) {
    const messageId = String((message && (message.id || message.localId || message.serverId)) || '');
    if (!messageId) return null;
    return _decryptCache.has(messageId) ? _decryptCache.get(messageId) : null;
  }

  // FIX (PLACEHOLDER-STICKS-ON-FIRST-MESSAGE): decryptMessageForDisplay()
  // resolves immediately with fallbackText both when a message has
  // genuinely, permanently failed AND when it has simply been queued for
  // an automatic retry (keys not ready yet, X3DH session mid-handshake,
  // etc — the ordinary state for the very first message exchanged with a
  // new contact). Every UI caller only ever saw that one string back and
  // had no way to tell those two cases apart, so several call sites ended
  // up revealing/appending a visible "Encrypted message" bubble — and, in
  // messages-ui.js's case, permanently marking the message as
  // "already attempted" — the instant the FIRST attempt merely got
  // queued, instead of waiting for the queue to actually finish (or
  // truly exhaust). This lets a caller check, right after getting the
  // fallback text back, whether a retry is genuinely still pending for
  // this exact message before deciding to show anything permanent.
  function isMessageQueued(message) {
    const messageId = String((message && (message.id || message.localId || message.serverId)) || message || '');
    return !!messageId && _pendingDecryptQueue.has(messageId);
  }

  async function decryptMessageForDisplay(message, chatId, currentUserId, opts) {
    opts = opts || {};
    const fallbackText = opts.fallbackText || '🔒 Encrypted message';
    const content = message && message.content;
    const messageId = String((message && (message.id || message.localId || message.serverId)) || `${chatId}:${content}`);

    if (!_envelopeShape(content)) {
      // Not an E2E envelope at all — already plaintext (or empty/non-text).
      return typeof content === 'string' ? content : (content || '');
    }

    if (_decryptCache.has(messageId)) return _decryptCache.get(messageId);

    _pipelineLog('MESSAGE_RECEIVED', { messageId, chatId });

    const { peerUserId } = resolveMessageCryptoPeer(message, currentUserId, opts.activeConversation);
    const result = await _decryptCore(content, chatId, peerUserId, messageId);

    if (result.ok) {
      _decryptCache.set(messageId, result.plaintext);
      return result.plaintext;
    }

    if (result.retryable) {
      let entry = _pendingDecryptQueue.get(messageId);
      if (!entry) {
        entry = { content, chatId, peerUserId, attempts: 0, timer: null, subscribers: new Set() };
        _pendingDecryptQueue.set(messageId, entry);
      }
      if (typeof opts.onResolved === 'function') entry.subscribers.add(opts.onResolved);
      _scheduleRetry(messageId);
    }
    // Permanent or not-yet-ready failure: never leak ciphertext, either way.
    return fallbackText;
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
    // CRYPTO-PIPELINE: the single canonical decrypt-for-display service and
    // its peer-resolution helper — see the block above decryptFromChat.
    // Every UI surface (chat panel, sidebar/recent-chats, search, multi-send
    // picker, hidden vault, unread counter, notifications) should call
    // decryptMessageForDisplay() instead of hand-rolling its own envelope
    // detection + decrypt call.
    decryptMessageForDisplay,
    resolveMessageCryptoPeer,
    peekDecryptedText,
    // FIX (PLACEHOLDER-STICKS-ON-FIRST-MESSAGE): see definition above.
    isMessageQueued,
    log: _pipelineLog,
    // FIX (SEND-HANG-NON-HISTORY-OPEN): see prefetchRecipientKey definition above.
    prefetchRecipientKey,
    // FIX (BOOTSTRAP-KEY-NEVER-CACHED): see cacheRecipientKey definition above.
    cacheRecipientKey,
    // FIX-NO-PLAINTEXT-FALLBACK: single catchable error constructor so
    // callers can distinguish "couldn't secure this send in time" (retry
    // is the right move) from other failures instead of guessing off
    // error.message text.
    E2ESecureFailureError,
    waitForEnabled: _waitForEnabled,
    waitForEnabledBounded: _waitForEnabledBounded,
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
    // Exposed so js/double-ratchet.js can namespace its own localStorage
    // session-state keys per logged-in account (see _storeKey() above for
    // why this matters — same-browser multi-account collisions).
    getMyUserId: _myUserId,
    get enabled() { return _enabled; },
    get publicKey() { return _myPubKeyB64; },
    get keyId() { return _myKeyId; },
    clearKeys() {
      localStorage.removeItem(_storeKey());
      _myPrivKey = null; _myPubKeyB64 = null; _myKeyId = null; _enabled = false;
      PUB_CACHE.clear();
      // CRYPTO-PIPELINE: a decrypted-text cache or a retry queue surviving a
      // logout/account-switch would either leak the previous account's
      // plaintext into the next account's UI, or sit forever retrying
      // against keys that no longer apply. Reset both here so relogin starts
      // clean — this is also what "restore keys, restore session, decrypt
      // existing messages, don't show decryption failed" after a
      // refresh/relogin depends on: a fresh session must re-attempt every
      // message from scratch against the newly-restored keys, not reuse a
      // stale failure/success from before.
      _decryptCache.clear();
      for (const entry of _pendingDecryptQueue.values()) { if (entry.timer) clearTimeout(entry.timer); }
      _pendingDecryptQueue.clear();
      _newEnabledGate(); // future callers should wait again, not see a stale "ready" gate
    },
  };

  // Let modules that depend on KynectaE2E (e.g. js/double-ratchet.js) know
  // it's ready, instead of relying purely on their own polling/setTimeout
  // fallbacks.
  try { document.dispatchEvent(new CustomEvent('kyn:e2eReady')); } catch (_) {}

  console.log('[KynectaE2E] ✅ Loaded — WebCrypto:', !!subtle);

})(window);