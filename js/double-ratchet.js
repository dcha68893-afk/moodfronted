/**
 * double-ratchet.js — Double Ratchet Algorithm for MoodChat
 *
 * Phase 3 feature: Per-message key ratcheting / forward secrecy
 *
 * Implements the Signal Double Ratchet Algorithm on top of the existing
 * e2e-encryption.js ECDH + WebCrypto infrastructure.
 *
 * Key properties:
 * - Forward secrecy: Compromising today's key doesn't expose past messages
 * - Break-in recovery: After compromise, security is restored after ratchet turn
 * - Out-of-order message support: Skipped message keys stored (max 100)
 *
 * Architecture:
 * - Symmetric Ratchet: KDF chain derives per-message keys from chain key
 * - DH Ratchet: each reply triggers ECDH ratchet step, new root/chain keys
 * - State stored encrypted in localStorage (wrapped by e2e-encryption.js _localWrapKey)
 * - Backend stores ephemeral public keys as message metadata (no new routes needed)
 *
 * Integration:
 * - Replaces encryptForChat / decryptFromChat in e2e-encryption.js for 1:1 DMs
 * - Group messages continue to use Sender Keys (already forward-secret per message)
 * - Falls back gracefully to static ECDH (v:1 envelope) for legacy messages
 */

(function (global) {
  'use strict';

  const subtle = global.crypto?.subtle;
  if (!subtle) {
    console.warn('[DoubleRatchet] WebCrypto not available');
    return;
  }

  // ── Utility ─────────────────────────────────────────────────────────────────
  const b64    = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64  = s   => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const str2ab = s   => new TextEncoder().encode(s);
  const ab2str = b   => new TextDecoder().decode(b);

  const MAX_SKIP = 100; // max skipped message keys to store
  const DR_VERSION = 2; // envelope version tag

  // ── KDF primitives ──────────────────────────────────────────────────────────

  // HKDF-SHA256 extract+expand: common KDF for both ratchets
  async function _hkdf(keyMaterial, salt, info, lengthBits = 256) {
    const rawKey = keyMaterial instanceof ArrayBuffer ? keyMaterial : unb64(keyMaterial).buffer;
    const hkdfKey = await subtle.importKey('raw', rawKey, 'HKDF', false, ['deriveBits']);
    const bits = await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256',
        salt: salt instanceof Uint8Array ? salt : str2ab(salt),
        info: str2ab(info) },
      hkdfKey, lengthBits
    );
    return bits;
  }

  // KDF_RK(rk, dh_out) → (new_rk, new_ck_send)
  // Takes root key + DH output → new root key + new chain key
  async function _kdfRootKey(rootKeyB64, dhOutputBits) {
    const outBits = await _hkdf(dhOutputBits, unb64(rootKeyB64), 'WhisperRatchet', 512);
    const outArr  = new Uint8Array(outBits);
    return {
      rootKey:    b64(outArr.slice(0, 32).buffer),
      chainKey:   b64(outArr.slice(32, 64).buffer),
    };
  }

  // KDF_CK(ck) → (new_ck, mk)  — symmetric message ratchet step
  async function _kdfChainKey(chainKeyB64) {
    const ckBytes = unb64(chainKeyB64);
    // Message key: HMAC-SHA256(CK, 0x01)
    const hmacKey = await subtle.importKey('raw', ckBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mkBytes = await subtle.sign('HMAC', hmacKey, new Uint8Array([0x01]));
    // Next chain key: HMAC-SHA256(CK, 0x02)
    const nckBytes = await subtle.sign('HMAC', hmacKey, new Uint8Array([0x02]));
    return {
      messageKey: b64(mkBytes),
      nextChainKey: b64(nckBytes),
    };
  }

  // Derive AES-256-GCM key from a message key
  async function _mkToAES(messageKeyB64) {
    const keyBits = await _hkdf(unb64(messageKeyB64).buffer, str2ab('WhisperMessageKeys'), 'cipher', 256);
    return subtle.importKey('raw', keyBits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  // AES-256-GCM encrypt/decrypt
  async function _aesgcmEncrypt(aesKey, plaintext, associatedData = '') {
    const iv  = global.crypto.getRandomValues(new Uint8Array(12));
    const ad  = str2ab(associatedData);
    const ct  = await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: ad }, aesKey, str2ab(plaintext));
    return { iv: b64(iv.buffer), ct: b64(ct) };
  }

  async function _aesgcmDecrypt(aesKey, ivB64, ctB64, associatedData = '') {
    const ad = str2ab(associatedData);
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64), tagLength: 128, additionalData: ad }, aesKey, unb64(ctB64));
    return ab2str(pt);
  }

  // ── ECDH ephemeral key generation ───────────────────────────────────────────
  async function _generateEphemeralKeyPair() {
    return subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  }

  async function _exportPublicKey(kp) {
    const spki = await subtle.exportKey('spki', kp.publicKey);
    return b64(spki);
  }

  async function _importPublicKey(b64spki) {
    return subtle.importKey('spki', unb64(b64spki), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  }

  async function _dhRatchetStep(myPrivKey, theirPubKeyB64) {
    const theirPubKey = await _importPublicKey(theirPubKeyB64);
    return subtle.deriveBits({ name: 'ECDH', public: theirPubKey }, myPrivKey, 256);
  }

  // ── Session state persistence ────────────────────────────────────────────────
  // State is stored per conversation: 'kyn_dr_session_v2_<chatId>'
  // Encrypted at rest using e2e-encryption.js _localWrapKey via wrapForLocalStorage

  async function _saveState(chatId, state) {
    const json = JSON.stringify({
      rootKey:        state.rootKey,
      sendChainKey:   state.sendChainKey,
      recvChainKey:   state.recvChainKey,
      sendMsgNum:     state.sendMsgNum,
      recvMsgNum:     state.recvMsgNum,
      myEphPubB64:    state.myEphPubB64,
      theirEphPubB64: state.theirEphPubB64,
      myEphPrivB64:   state.myEphPrivB64,   // stored encrypted
      skippedKeys:    Object.fromEntries(   // dh_pub + msg_num → message_key
        Array.from(state.skippedKeys || new Map())
      ),
      initialized:    true,
    });

    if (global.KynectaE2E?.wrapForLocalStorage) {
      try {
        const wrapped = await global.KynectaE2E.wrapForLocalStorage(btoa(json));
        localStorage.setItem(`kyn_dr_session_v2_${chatId}`, wrapped);
        return;
      } catch (_) {}
    }
    // Fallback: store unencrypted (still better than nothing)
    localStorage.setItem(`kyn_dr_session_v2_${chatId}`, btoa(json));
  }

  async function _loadState(chatId) {
    const stored = localStorage.getItem(`kyn_dr_session_v2_${chatId}`);
    if (!stored) return null;

    let json;
    if (global.KynectaE2E?.unwrapFromLocalStorage) {
      try {
        const unwrapped = await global.KynectaE2E.unwrapFromLocalStorage(stored);
        json = atob(unwrapped);
      } catch (_) {
        // Try as plain base64 fallback
        try { json = atob(stored); } catch { return null; }
      }
    } else {
      try { json = atob(stored); } catch { return null; }
    }

    try {
      const s = JSON.parse(json);
      s.skippedKeys = new Map(Object.entries(s.skippedKeys || {}));
      return s;
    } catch { return null; }
  }

  // ── Session initialization ───────────────────────────────────────────────────
  // Alice (initiator) calls initSend; Bob (receiver) calls initRecv
  // Both need each other's identity public keys (from /api/encryption/keys/:userId)

  async function initSend(chatId, myIdentityPrivKey, theirIdentityPubB64) {
    // Generate ephemeral key pair for this session
    const ephKP     = await _generateEphemeralKeyPair();
    const myEphPub  = await _exportPublicKey(ephKP);
    const myEphPriv = b64(await subtle.exportKey('pkcs8', ephKP.privateKey));

    // DH(identity, their_identity) XOR DH(ephemeral, their_identity)
    const dh1 = await _dhRatchetStep(myIdentityPrivKey, theirIdentityPubB64);
    const dh2 = await _dhRatchetStep(ephKP.privateKey,  theirIdentityPubB64);

    // Root key = HKDF(dh1 XOR dh2, ...)
    const combined = new Uint8Array(32);
    const d1 = new Uint8Array(dh1), d2 = new Uint8Array(dh2);
    for (let i = 0; i < 32; i++) combined[i] = d1[i] ^ d2[i];

    const rootBits = await _hkdf(combined.buffer, str2ab('WhisperX3DH'), 'RootKey', 512);
    const rootArr  = new Uint8Array(rootBits);

    const state = {
      rootKey:        b64(rootArr.slice(0, 32).buffer),
      sendChainKey:   b64(rootArr.slice(32, 64).buffer),
      recvChainKey:   null,
      sendMsgNum:     0,
      recvMsgNum:     0,
      myEphPubB64:    myEphPub,
      myEphPrivB64:   myEphPriv,
      theirEphPubB64: theirIdentityPubB64,
      skippedKeys:    new Map(),
      initialized:    true,
    };

    await _saveState(chatId, state);
    return { state, ephPubB64: myEphPub };
  }

  async function initRecv(chatId, myIdentityPrivKey, senderEphPubB64, senderIdentityPubB64) {
    const dh1 = await _dhRatchetStep(myIdentityPrivKey, senderIdentityPubB64);
    const dh2 = await _dhRatchetStep(myIdentityPrivKey, senderEphPubB64);

    const combined = new Uint8Array(32);
    const d1 = new Uint8Array(dh1), d2 = new Uint8Array(dh2);
    for (let i = 0; i < 32; i++) combined[i] = d1[i] ^ d2[i];

    const rootBits = await _hkdf(combined.buffer, str2ab('WhisperX3DH'), 'RootKey', 512);
    const rootArr  = new Uint8Array(rootBits);

    // Generate our ephemeral for the reply ratchet
    const replyKP     = await _generateEphemeralKeyPair();
    const replyEphPub = await _exportPublicKey(replyKP);
    const replyEphPriv = b64(await subtle.exportKey('pkcs8', replyKP.privateKey));

    const state = {
      rootKey:        b64(rootArr.slice(0, 32).buffer),
      sendChainKey:   null,
      recvChainKey:   b64(rootArr.slice(32, 64).buffer),
      sendMsgNum:     0,
      recvMsgNum:     0,
      myEphPubB64:    replyEphPub,
      myEphPrivB64:   replyEphPriv,
      theirEphPubB64: senderEphPubB64,
      skippedKeys:    new Map(),
      initialized:    true,
    };

    await _saveState(chatId, state);
    return { state, ephPubB64: replyEphPub };
  }

  // ── Encrypt (send) ───────────────────────────────────────────────────────────
  async function encrypt(chatId, plaintext, myIdentityPrivKey) {
    let state = await _loadState(chatId);

    // If no session yet, we need to initiate
    if (!state?.initialized) {
      console.warn(`[DR] No session for chat ${chatId} — use initSend first`);
      return null;
    }

    // Ensure we have a send chain key
    if (!state.sendChainKey) {
      // Perform DH ratchet step to get a send chain
      const myEphPrivKey = await subtle.importKey(
        'pkcs8', unb64(state.myEphPrivB64), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']
      );
      const dhOut = await _dhRatchetStep(myEphPrivKey, state.theirEphPubB64);
      const { rootKey, chainKey } = await _kdfRootKey(state.rootKey, dhOut);
      state.rootKey      = rootKey;
      state.sendChainKey = chainKey;
    }

    // Symmetric ratchet step
    const { messageKey, nextChainKey } = await _kdfChainKey(state.sendChainKey);
    const msgNum = state.sendMsgNum;
    state.sendChainKey = nextChainKey;
    state.sendMsgNum   = msgNum + 1;

    // Encrypt
    const aesKey  = await _mkToAES(messageKey);
    const ad      = `v2:${chatId}:${msgNum}`; // associated data for authenticity
    const { iv, ct } = await _aesgcmEncrypt(aesKey, plaintext, ad);

    await _saveState(chatId, state);

    return JSON.stringify({
      v:   DR_VERSION,
      eph: state.myEphPubB64,   // our current ephemeral public key
      n:   msgNum,              // message number in chain
      iv,
      ct,
    });
  }

  // ── Decrypt (receive) ────────────────────────────────────────────────────────
  async function decrypt(chatId, cipherEnvelope, senderIdentityPubB64, myIdentityPrivKey) {
    let envelope;
    try {
      envelope = JSON.parse(cipherEnvelope);
    } catch (_) {
      return cipherEnvelope; // plaintext
    }

    // Legacy v1 envelope — delegate to KynectaE2E
    if (!envelope || envelope.v !== DR_VERSION) {
      if (global.KynectaE2E?.decryptFromChat) {
        const senderId = envelope?.kid ? 'legacy' : null;
        if (senderId) {
          // Can't easily get senderUserId here without it — return placeholder
          return '[Legacy encrypted message — key not available]';
        }
      }
      return cipherEnvelope;
    }

    let state = await _loadState(chatId);

    // Bootstrap session if first message
    if (!state?.initialized) {
      const result = await initRecv(chatId, myIdentityPrivKey, envelope.eph, senderIdentityPubB64);
      state = result.state;
    }

    const { eph: senderEphPub, n: msgNum, iv, ct } = envelope;

    // Check skipped message keys first
    const skipKey = `${senderEphPub}:${msgNum}`;
    if (state.skippedKeys?.has(skipKey)) {
      const skippedMK = state.skippedKeys.get(skipKey);
      state.skippedKeys.delete(skipKey);
      await _saveState(chatId, state);
      const aesKey = await _mkToAES(skippedMK);
      const ad     = `v2:${chatId}:${msgNum}`;
      return _aesgcmDecrypt(aesKey, iv, ct, ad);
    }

    // DH ratchet: if sender's ephemeral key changed, perform ratchet step
    if (senderEphPub !== state.theirEphPubB64) {
      // Skip any messages on current receiving chain
      if (state.recvChainKey && state.recvMsgNum < msgNum) {
        let tempCK = state.recvChainKey;
        for (let i = state.recvMsgNum; i < Math.min(msgNum, state.recvMsgNum + MAX_SKIP); i++) {
          const { messageKey: mk, nextChainKey } = await _kdfChainKey(tempCK);
          state.skippedKeys = state.skippedKeys || new Map();
          state.skippedKeys.set(`${state.theirEphPubB64}:${i}`, mk);
          tempCK = nextChainKey;
        }
      }

      // DH ratchet step: new recv chain from their new ephemeral
      const myEphPrivKey = await subtle.importKey(
        'pkcs8', unb64(state.myEphPrivB64), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']
      );
      const dhOut = await _dhRatchetStep(myEphPrivKey, senderEphPub);
      const { rootKey, chainKey } = await _kdfRootKey(state.rootKey, dhOut);

      state.rootKey        = rootKey;
      state.recvChainKey   = chainKey;
      state.recvMsgNum     = 0;
      state.theirEphPubB64 = senderEphPub;

      // Generate new ephemeral for next send ratchet
      const newEphKP     = await _generateEphemeralKeyPair();
      state.myEphPubB64  = await _exportPublicKey(newEphKP);
      state.myEphPrivB64 = b64(await subtle.exportKey('pkcs8', newEphKP.privateKey));
      state.sendChainKey = null; // will be derived on next send
    }

    // Skip to the right message number on the receiving chain
    if (state.recvMsgNum < msgNum) {
      let tempCK = state.recvChainKey;
      for (let i = state.recvMsgNum; i < Math.min(msgNum, state.recvMsgNum + MAX_SKIP); i++) {
        const { messageKey: mk, nextChainKey } = await _kdfChainKey(tempCK);
        state.skippedKeys.set(`${senderEphPub}:${i}`, mk);
        tempCK = nextChainKey;
      }
      state.recvChainKey = tempCK;
      state.recvMsgNum   = msgNum;
    }

    // Decrypt current message
    const { messageKey, nextChainKey } = await _kdfChainKey(state.recvChainKey);
    state.recvChainKey = nextChainKey;
    state.recvMsgNum   = msgNum + 1;

    // Trim skipped keys to MAX_SKIP
    if (state.skippedKeys.size > MAX_SKIP) {
      const iter = state.skippedKeys.keys();
      for (let i = 0; i < state.skippedKeys.size - MAX_SKIP; i++) {
        state.skippedKeys.delete(iter.next().value);
      }
    }

    await _saveState(chatId, state);

    try {
      const aesKey = await _mkToAES(messageKey);
      const ad     = `v2:${chatId}:${msgNum}`;
      return await _aesgcmDecrypt(aesKey, iv, ct, ad);
    } catch (e) {
      return '[Decryption failed — message may be out of order or corrupted]';
    }
  }

  // ── Session management ───────────────────────────────────────────────────────
  function clearSession(chatId) {
    localStorage.removeItem(`kyn_dr_session_v2_${chatId}`);
  }

  async function hasSession(chatId) {
    const state = await _loadState(chatId);
    return !!state?.initialized;
  }

  // ── Monkey-patch KynectaE2E when both modules are loaded ────────────────────
  // This upgrades 1:1 DM encryption to use Double Ratchet automatically
  //
  // FIX-DR-WIRING: this patch previously never actually activated. Two bugs:
  //  1. Nothing anywhere in the codebase ever called initSend(), so
  //     hasSession() was always false on the sender's side and encryptForChat
  //     fell straight back to the legacy static-ECDH path every time —
  //     forward secrecy was never actually in effect despite the log message
  //     below claiming otherwise.
  //  2. decryptFromChat called decrypt(chatId, ciphertext, null, null) — i.e.
  //     always passed null for both the sender's identity public key AND our
  //     own identity private key. The very first message in any session
  //     bootstraps via initRecv(), which immediately does ECDH on those two
  //     null values and throws, so even if something HAD sent a v2 envelope,
  //     decrypting it would always fail and silently fall back to the legacy
  //     decrypter (which can't parse a v2 envelope either).
  // Both are fixed below using the identity-key getters js/e2e-encryption.js
  // now exposes. This also reuses the SAME stable per-pair context as the
  // static-ECDH fix above (KynectaE2E.getEncryptionContext) instead of the
  // raw chatId, for the same reason: a brand-new chat's first message is
  // encrypted before the real chatId exists.
  function _patchKynectaE2E() {
    if (!global.KynectaE2E) return;
    if (global.KynectaE2E._drPatched) return;
    global.KynectaE2E._drPatched = true;

    const _origEncrypt = global.KynectaE2E.encryptForChat.bind(global.KynectaE2E);
    const _origDecrypt = global.KynectaE2E.decryptFromChat.bind(global.KynectaE2E);

    // Wrap encrypt: bootstrap a session on first use, then use DR going forward
    global.KynectaE2E.encryptForChat = async function (plaintext, chatId, recipientUserId) {
      try {
        if (global.KynectaE2E.enabled && recipientUserId) {
          const ctx = global.KynectaE2E.getEncryptionContext(chatId, recipientUserId);
          let hasSess = await hasSession(ctx);
          if (!hasSess) {
            const myPriv = global.KynectaE2E.getMyIdentityPrivateKey();
            const theirPub = await global.KynectaE2E.getIdentityPublicKeyB64(recipientUserId);
            if (myPriv && theirPub) {
              await initSend(ctx, myPriv, theirPub);
              hasSess = true;
            }
          }
          if (hasSess) {
            const ct = await encrypt(ctx, plaintext, null);
            if (ct) return ct;
          }
        }
      } catch (e) {
        console.warn('[DR] encrypt error, falling back:', e.message);
      }
      return _origEncrypt(plaintext, chatId, recipientUserId);
    };

    // Wrap decrypt: detect v2 envelope and use DR, else fall through to ECDH
    //
    // FIX (DM-only message corruption / "character splitting"): decrypt()
    // below mutates and persists ratchet state (recvChainKey, recvMsgNum) on
    // EVERY call — it is not safe to call twice for the same ciphertext.
    // There are multiple independent code paths in messages-ui.js that can
    // each end up calling decryptFromChat for the same incoming message
    // (the main render pipeline and a separate "fast path" append, plus
    // realtime re-render races), and each duplicate call was consuming the
    // NEXT message's key instead of re-deriving the same one — corrupting
    // that message and permanently desyncing the ratchet for every message
    // after it in that conversation. Group chat's Sender Keys have no such
    // per-call state and were never affected, which is why this was DM-only.
    // Memoizing by the exact ciphertext string (unique per message — AES-GCM
    // with a random IV never repeats ciphertext) guarantees the stateful
    // ratchet decrypt only ever actually runs once per real message,
    // regardless of how many places ask for it or how many times.
    const _decryptMemo = new Map(); // ciphertext string -> Promise<plaintext>
    const _DECRYPT_MEMO_MAX = 500;
    global.KynectaE2E.decryptFromChat = async function (ciphertext, chatId, senderUserId) {
      if (_decryptMemo.has(ciphertext)) {
        return _decryptMemo.get(ciphertext);
      }
      const resultPromise = (async () => {
        try {
          let parsed;
          try { parsed = JSON.parse(ciphertext); } catch { return ciphertext; }
          if (parsed?.v === DR_VERSION && global.KynectaE2E.enabled && senderUserId) {
            const ctx = global.KynectaE2E.getEncryptionContext(chatId, senderUserId);
            const myPriv = global.KynectaE2E.getMyIdentityPrivateKey();
            const theirPub = await global.KynectaE2E.getIdentityPublicKeyB64(senderUserId);
            return await decrypt(ctx, ciphertext, theirPub, myPriv);
          }
        } catch (e) {
          console.warn('[DR] decrypt error, falling back:', e.message);
        }
        return _origDecrypt(ciphertext, chatId, senderUserId);
      })();
      _decryptMemo.set(ciphertext, resultPromise);
      if (_decryptMemo.size > _DECRYPT_MEMO_MAX) {
        _decryptMemo.delete(_decryptMemo.keys().next().value);
      }
      // Don't memoize a genuine failure — let a later retry actually retry,
      // since a failure here likely means keys weren't ready yet rather
      // than the message being unreadable forever.
      resultPromise.then(r => {
        if (typeof r === 'string' && r.indexOf('[Decryption failed') === 0) {
          _decryptMemo.delete(ciphertext);
        }
      }).catch(() => { _decryptMemo.delete(ciphertext); });
      return resultPromise;
    };

    console.log('[DR] ✅ KynectaE2E patched with Double Ratchet');
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  global.KynDoubleRatchet = {
    initSend,
    initRecv,
    encrypt,
    decrypt,
    clearSession,
    hasSession,
    // Expose for safety numbers display
    DR_VERSION,
  };

  // Patch when e2e-encryption.js loads (order-independent)
  if (global.KynectaE2E) {
    _patchKynectaE2E();
  } else {
    document.addEventListener('kyn:e2eReady', _patchKynectaE2E, { once: true });
    // Retry after delay
    setTimeout(() => { if (global.KynectaE2E && !global.KynectaE2E._drPatched) _patchKynectaE2E(); }, 2000);
  }

  console.log('[KynDoubleRatchet] ✅ Loaded — forward secrecy enabled for 1:1 DMs');

}(window));
