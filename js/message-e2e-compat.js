/* Compatibility bridge for canonical DM E2E.
 * Keeps old v1 history readable and makes decryption robust if the canonical
 * identity layer did not adopt the already-live legacy identity in time.
 */
(function (global) {
  'use strict';

  function b64ToBytes(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  function enc(s) { return new TextEncoder().encode(String(s)); }
  function pairContext(peerId, meId) {
    const a = String(meId || '');
    const b = String(peerId || '');
    return `kynecta-dm-v2:${[a, b].sort().join(':')}`;
  }
  function legacyContext(peerId, meId, chatId) {
    if (meId && peerId) return `kynecta-chat-${[String(meId), String(peerId)].sort().join(':')}`;
    return `kynecta-chat-${String(chatId || '')}`;
  }
  function peerFor(message, currentUserId, activeConversation) {
    const me = currentUserId != null ? String(currentUserId) : String(global.KynectaMessageE2E?.getMyUserId?.() || '');
    const sender = message?.senderId != null ? String(message.senderId) : (message?.sender?.id != null ? String(message.sender.id) : null);
    const receiver = message?.receiverId != null ? String(message.receiverId) : (message?.recipientId != null ? String(message.recipientId) : null);
    if (sender && me && sender === me) return receiver || String(activeConversation?.otherUserId || activeConversation?.friendId || '');
    return sender;
  }
  function isV1(content) {
    if (typeof content !== 'string') return false;
    try { const o = JSON.parse(content); return !!o && o.v === 1 && o.iv && o.ct; } catch (_) { return false; }
  }
  function isV2(content) {
    if (typeof content !== 'string') return false;
    try { const o = JSON.parse(content); return !!o && o.v === 2 && o.iv && o.ct && o.spk; } catch (_) { return false; }
  }
  // ROOT-CAUSE FIX (old conversation history renders as raw ciphertext JSON
  // instead of a placeholder): this bridge only recognizes v1/v2 envelopes.
  // Messages from an earlier protocol generation (v3/v4/v5 — the previous
  // X3DH double-ratchet format, e.g. {"v":3,"kid":...,"sid":...,"iv":...,
  // "ct":...} or the v5 multi-device {"v":5,"mid":...,"devices":{...}} shape
  // visible in stored history) parse as neither v1 nor v2 and used to fall
  // straight through to "return content as-is" below — indistinguishable
  // from real plaintext to bubbleHtml(), so the raw envelope JSON got
  // rendered directly in the chat bubble. Anything that's still clearly an
  // encrypted envelope (has a version field plus a ciphertext/iv field)
  // must never be treated as plaintext just because this engine doesn't
  // support that particular version.
  function isUnsupportedEnvelope(content) {
    if (typeof content !== 'string') return false;
    const s = content.trim();
    if (s.charAt(0) !== '{') return false;
    try {
      const o = JSON.parse(s);
      return !!(o && typeof o === 'object' && ('v' in o) && (('ct' in o) || ('iv' in o)));
    } catch (_) { return false; }
  }

  async function decryptWithPrivate(privateKey, senderKey, envelope, info, aad) {
    const identity = global.KynectaE2EIdentity;
    const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: senderKey }, privateKey, 256);
    const key = await identity.hkdf(shared, info);
    const params = { name: 'AES-GCM', iv: b64ToBytes(envelope.iv), tagLength: 128 };
    if (aad) params.additionalData = enc(aad);
    return new TextDecoder().decode(await crypto.subtle.decrypt(params, key, b64ToBytes(envelope.ct)));
  }

  async function importSpki(b64) {
    return crypto.subtle.importKey('spki', b64ToBytes(b64), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  }

  function install() {
    const dm = global.KynectaMessageE2E;
    const identity = global.KynectaE2EIdentity;
    if (!dm || !identity) return false;

    const originalDecryptFromChat = dm.decryptFromChat.bind(dm);
    const originalDisplay = dm.decryptMessageForDisplay.bind(dm);
    const cache = new Map();
    const failures = new Set();
    const attempts = new Map();

    async function legacyDecrypt(content, chatId, peerUserId) {
      const env = JSON.parse(content);
      const peerEntry = await identity.publicKeyFor(peerUserId);
      const me = String(identity.userId || dm.getMyUserId?.() || '');
      const peerKey = peerEntry.key;
      const privateKey = identity.privateKey || global.KynectaE2E?.getMyIdentityPrivateKey?.();
      if (!privateKey) throw new Error('E2E identity is unavailable');
      try {
        return await decryptWithPrivate(privateKey, peerKey, env, legacyContext(peerUserId, me, chatId));
      } catch (_) {
        return decryptWithPrivate(privateKey, peerKey, env, `kynecta-chat-${String(chatId || '')}`);
      }
    }

    // ROOT-CAUSE FIX (own sent messages show "Unable to decrypt this
    // message" after leaving the chat / reloading): this used to import
    // env.spk and use it as "the other party's public key". env.spk is
    // always the ENCRYPTER's own public key — correct when the local user
    // is the recipient of this specific message, but wrong when the local
    // user is re-decrypting a message THEY sent (env.spk is then their own
    // key, and deriving a shared secret from your own priv + your own pub
    // is not the key the message was encrypted with, so AES-GCM decrypt
    // always fails). peerUserId here is already resolved by peerFor() above
    // to "whichever side isn't me" regardless of who originally sent this
    // message, so looking up that peer's current public key directly (the
    // same lookup used at encrypt time) is correct in both directions and
    // doesn't depend on trusting envelope-supplied key material at all.
    async function sharedIdentityV2Decrypt(content, chatId, peerUserId) {
      const env = JSON.parse(content);
      const peerEntry = await identity.publicKeyFor(peerUserId);
      const peerKey = peerEntry.key;
      const me = String(identity.userId || dm.getMyUserId?.() || '');
      const canonicalPrivate = identity.privateKey;
      if (canonicalPrivate) {
        try {
          return await decryptWithPrivate(canonicalPrivate, peerKey, env, pairContext(peerUserId, me), pairContext(peerUserId, me));
        } catch (_) {}
      }
      const sharedPrivate = await global.KynectaE2E?.getMyIdentityPrivateKey?.();
      if (sharedPrivate) {
        return decryptWithPrivate(sharedPrivate, peerKey, env, pairContext(peerUserId, me), pairContext(peerUserId, me));
      }
      throw new Error('No compatible E2E identity available');
    }

    dm.decryptFromChat = async function (encContent, chatId, peerUserId) {
      if (isV1(encContent)) return legacyDecrypt(encContent, chatId, peerUserId);
      if (isV2(encContent)) {
        try { return await originalDecryptFromChat(encContent, chatId, peerUserId); }
        catch (_) { return sharedIdentityV2Decrypt(encContent, chatId, peerUserId); }
      }
      return encContent;
    };

    dm.decryptMessageForDisplay = async function (message, chatId, currentUserId, opts = {}) {
      const content = message?.content;
      const id = String(message?.id || message?.localId || message?.serverId || `${chatId}:${content || ''}`);
      if (!isV1(content) && !isV2(content)) {
        if (isUnsupportedEnvelope(content)) {
          failures.add(id);
          try { document.dispatchEvent(new CustomEvent('kyn:messageDecryptFailed', { detail: { messageId: id, error: 'Unsupported/legacy envelope version' } })); } catch (_) {}
          return opts.fallbackText === undefined ? '🔒 Encrypted message' : opts.fallbackText;
        }
        return typeof content === 'string' ? content : (content || '');
      }
      if (cache.has(id)) return cache.get(id);
      if (attempts.has(id)) return opts.fallbackText === undefined ? '🔒 Encrypted message' : opts.fallbackText;

      const peer = peerFor(message, currentUserId, opts.activeConversation);
      if (!peer) {
        failures.add(id);
        return opts.fallbackText === undefined ? '🔒 Encrypted message' : opts.fallbackText;
      }

      attempts.set(id, 0);
      const tryDecrypt = async () => {
        let lastError = null;
        for (let i = 0; i < 5; i++) {
          attempts.set(id, i + 1);
          try {
            const text = await dm.decryptFromChat(content, chatId, peer);
            if (typeof text === 'string' && text && !/^\[Encrypted|^\[Decryption failed/.test(text)) return text;
            lastError = new Error(text || 'Decryption failed');
          } catch (e) { lastError = e; }
          await new Promise(r => setTimeout(r, Math.min(500 * (i + 1), 1500)));
        }
        throw lastError || new Error('Decryption failed');
      };

      try {
        const text = await tryDecrypt();
        cache.set(id, text);
        failures.delete(id);
        attempts.delete(id);
        opts.onResolved?.(text);
        try { document.dispatchEvent(new CustomEvent('kyn:messageDecrypted', { detail: { messageId: id, chatId, plaintext: text } })); } catch (_) {}
        return text;
      } catch (e) {
        attempts.delete(id);
        failures.add(id);
        try { document.dispatchEvent(new CustomEvent('kyn:messageDecryptFailed', { detail: { messageId: id, error: e?.message || String(e) } })); } catch (_) {}
        return opts.fallbackText === undefined ? '🔒 Encrypted message' : opts.fallbackText;
      }
    };

    dm.isMessageQueued = (message) => {
      const id = String(message?.id || message?.localId || message?.serverId || message || '');
      return attempts.has(id);
    };
    dm.isMessageFailed = (message) => {
      const id = String(message?.id || message?.localId || message?.serverId || message || '');
      return failures.has(id);
    };
    dm.peekDecryptedText = (message) => cache.get(String(message?.id || message?.localId || message?.serverId || '')) ?? null;
    dm.retryDecrypt = async (chatId, message) => {
      const id = String(message?.id || message?.localId || message?.serverId || '');
      cache.delete(id); failures.delete(id); attempts.delete(id);
      return dm.decryptMessageForDisplay(message, chatId, dm.getMyUserId?.(), {});
    };
    dm.__legacyCompatibilityInstalled = true;
    return true;
  }

  if (!install()) {
    document.addEventListener('kyn:canonicalMessageE2EReady', install, { once: true });
  }
})(window);
