/**
 * e2e-ratchet.js — Per-message forward secrecy for KynectaE2E
 *
 * Implements a symmetric-key ratchet on top of the existing ECDH shared
 * secret.  Each message derives a one-use AES-256-GCM key from a chain key,
 * then advances the chain key so that compromise of message key N reveals
 * nothing about keys 0…N-1 (forward secrecy) or N+1…∞ (break-in recovery).
 *
 * Design:
 *   chainKey[n+1] = HMAC-SHA256(chainKey[n], 0x02)
 *   messageKey[n] = HMAC-SHA256(chainKey[n], 0x01)  → AES-256-GCM key
 *
 *   Root of chain: HKDF(ECDH-shared-secret, chatId || "ratchet-v1")
 *
 * This is intentionally a simplified, single-direction ratchet (no DH
 * ratchet step per send/receive epoch like Signal's X3DH+DR).  It gives
 * forward secrecy at the message level without requiring a second key
 * exchange per conversation epoch.  Full Double-Ratchet can be layered on
 * top later by promoting _rootChains to a DR state machine.
 *
 * Usage:
 *   // On first message in a chat, or after key refresh:
 *   await KynectaRatchet.init(chatId, sharedBitsArrayBuffer);
 *
 *   // Encrypt a message (auto-advances chain):
 *   const envelope = await KynectaRatchet.encrypt(chatId, plaintext);
 *   // envelope = { v:2, n:<counter>, iv:<b64>, ct:<b64> }
 *
 *   // Decrypt a message:
 *   const plaintext = await KynectaRatchet.decrypt(chatId, envelope, senderUserId);
 *
 * Interop with KynectaE2E:
 *   KynectaE2E.encryptForChat / decryptFromChat will call the ratchet
 *   automatically when KynectaRatchet is available (detected by version
 *   field v:2 in envelope).
 */

(function (global) {
  'use strict';

  const subtle = global.crypto && global.crypto.subtle;

  // Per-chat state.  Key = chatId, Value = { chainKey: ArrayBuffer, counter: number }
  // Sender and receiver share the same chain root, so counters must be
  // co-ordinated via the envelope's `n` field.
  const _chains = new Map();

  // Out-of-order message key cache.
  // Key = `${chatId}:${n}`, Value = CryptoKey (one-use AES key already derived)
  const _skippedKeys = new Map();
  const MAX_SKIP = 100; // never cache more than 100 skipped keys per chat

  // ── Utility ───────────────────────────────────────────────────────────────
  function b64(buf)  { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function unb64(s)  { return Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer; }

  // ── HMAC-SHA256 ───────────────────────────────────────────────────────────
  async function _hmac(keyBuf, input /* number 0x01 | 0x02 | ArrayBuffer */) {
    const k = await subtle.importKey(
      'raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const data = typeof input === 'number'
      ? new Uint8Array([input])
      : new Uint8Array(input);
    return subtle.sign('HMAC', k, data);
  }

  // ── Initialise chain from ECDH shared bits ────────────────────────────────
  // sharedBits: ArrayBuffer (256-bit output of ECDH deriveBits)
  // chatId: string
  async function _initChain(chatId, sharedBits) {
    // Derive root chain key via HKDF
    const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    const info = new TextEncoder().encode(`kynecta-ratchet-v1-${chatId}`);
    const salt = new Uint8Array(32); // zero salt — chatId is in info
    const rootAes = await subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt'] // we only need to export it
    );
    const rootRaw = await subtle.exportKey('raw', rootAes);
    _chains.set(chatId, { chainKey: rootRaw, counter: 0 });
  }

  // ── Advance chain: derive message key and next chain key ─────────────────
  // Returns { messageKey: CryptoKey, nextChainKey: ArrayBuffer, counter: number }
  async function _ratchetStep(chainKey, counter) {
    const [msgKeyBits, nextChainKeyBits] = await Promise.all([
      _hmac(chainKey, 0x01), // message key constant
      _hmac(chainKey, 0x02)  // chain key constant
    ]);
    const messageKey = await subtle.importKey(
      'raw', msgKeyBits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
    );
    return { messageKey, nextChainKey: nextChainKeyBits, counter };
  }

  // ── Skip ahead to reach target counter, caching skipped keys ─────────────
  async function _advanceTo(chatId, targetCounter) {
    let state = _chains.get(chatId);
    if (!state) throw new Error(`[Ratchet] Chat ${chatId} not initialised`);
    while (state.counter < targetCounter) {
      if (targetCounter - state.counter > MAX_SKIP) {
        throw new Error('[Ratchet] Too many skipped messages — possible replay attack');
      }
      const { messageKey, nextChainKey, counter } = await _ratchetStep(state.chainKey, state.counter);
      _skippedKeys.set(`${chatId}:${counter}`, messageKey);
      state = { chainKey: nextChainKey, counter: counter + 1 };
    }
    _chains.set(chatId, state);
    return state;
  }

  // ── Public: initialise ────────────────────────────────────────────────────
  // Call once per chat when the ECDH shared secret is established.
  // sharedBits: ArrayBuffer from subtle.deriveBits (256-bit)
  async function init(chatId, sharedBits) {
    if (!subtle) throw new Error('[Ratchet] WebCrypto not available');
    await _initChain(chatId, sharedBits);
    console.log(`[KynectaRatchet] ✅ Chain initialised for chat ${chatId}`);
  }

  // Reset a chat chain (e.g. after key refresh / new ECDH round)
  function resetChain(chatId) {
    _chains.delete(chatId);
    // Clear skipped keys for this chat
    for (const k of _skippedKeys.keys()) {
      if (k.startsWith(`${chatId}:`)) _skippedKeys.delete(k);
    }
  }

  // ── Public: encrypt ───────────────────────────────────────────────────────
  async function encrypt(chatId, plaintext) {
    if (!_chains.has(chatId)) {
      // Lazily init from KynectaE2E shared secret if available
      await _lazyInit(chatId);
    }
    const state = _chains.get(chatId);
    const { messageKey, nextChainKey, counter } = await _ratchetStep(state.chainKey, state.counter);
    _chains.set(chatId, { chainKey: nextChainKey, counter: counter + 1 });

    const iv  = global.crypto.getRandomValues(new Uint8Array(12));
    const pt  = new TextEncoder().encode(plaintext);
    const ct  = await subtle.encrypt({ name: 'AES-GCM', iv }, messageKey, pt);

    return JSON.stringify({ v: 2, n: counter, iv: b64(iv), ct: b64(ct) });
  }

  // FIX-DECRYPT-REDISPLAY: once a given (chatId, n) has been successfully
  // decrypted, cache its plaintext for the lifetime of the page. Reopening a
  // chat, refreshing message history, or any other re-render re-fetches the
  // same server-stored ciphertext and asks us to decrypt it again — that is
  // not a replay, it's the same message being shown again, but the ratchet's
  // single-use skipped-keys and forward-only counter would otherwise treat it
  // as one and fail with "[Decryption failed]". Checking this cache first
  // avoids ever re-entering the ratchet for a message already resolved once.
  const _plaintextCache = new Map();

  // ── Public: decrypt ───────────────────────────────────────────────────────
  async function decrypt(chatId, envelopeStr, senderUserId) {
    let env;
    try { env = JSON.parse(envelopeStr); } catch (_) { return envelopeStr; }

    // v:1 envelope → delegate to KynectaE2E (no ratchet)
    if (!env || env.v !== 2) {
      if (global.KynectaE2E && typeof global.KynectaE2E.decryptFromChat === 'function') {
        return global.KynectaE2E.decryptFromChat(envelopeStr, chatId, senderUserId);
      }
      return envelopeStr;
    }

    const { n, iv, ct } = env;
    const cacheKey = `${chatId}:${n}`;

    const cachedPlaintext = _plaintextCache.get(cacheKey);
    if (cachedPlaintext !== undefined) return cachedPlaintext;

    if (!_chains.has(chatId)) await _lazyInit(chatId, senderUserId);

    // Check if we already derived and cached this key (out-of-order delivery)
    let messageKey = _skippedKeys.get(cacheKey);
    if (messageKey) {
      _skippedKeys.delete(cacheKey);
    } else {
      // Advance chain to n, caching any skipped keys along the way
      const state = _chains.get(chatId);
      if (n < state.counter) {
        throw new Error(`[Ratchet] Replayed or duplicate message n=${n} (chain at ${state.counter})`);
      }
      if (n > state.counter) {
        await _advanceTo(chatId, n);
      }
      const step = await _ratchetStep(_chains.get(chatId).chainKey, n);
      messageKey = step.messageKey;
      _chains.set(chatId, { chainKey: step.nextChainKey, counter: n + 1 });
    }

    try {
      const pt = await subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(unb64(iv)) },
        messageKey,
        new Uint8Array(unb64(ct))
      );
      const plaintext = new TextDecoder().decode(pt);
      _plaintextCache.set(cacheKey, plaintext);
      return plaintext;
    } catch (_) {
      return '🔒 [Decryption failed — key mismatch or corrupted message]';
    }
  }

  // ── Lazy init: pull shared bits from KynectaE2E ───────────────────────────
  async function _lazyInit(chatId, otherUserId) {
    if (!global.KynectaE2E || !global.KynectaE2E.enabled) return;
    try {
      // KynectaE2E exposes getSharedBits for ratchet bootstrapping
      if (typeof global.KynectaE2E.getSharedBits === 'function') {
        const bits = await global.KynectaE2E.getSharedBits(chatId, otherUserId);
        if (bits) await _initChain(chatId, bits);
      }
    } catch (e) {
      console.warn('[KynectaRatchet] Lazy init failed:', e.message);
    }
  }

  // ── Check if envelope uses ratchet ────────────────────────────────────────
  function isRatchetEnvelope(content) {
    if (typeof content !== 'string') return false;
    try { const o = JSON.parse(content); return o && o.v === 2; } catch (_) { return false; }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  global.KynectaRatchet = { init, encrypt, decrypt, reset: resetChain, isRatchetEnvelope };
  console.log('[KynectaRatchet] ✅ Loaded — forward secrecy active');

})(window);
