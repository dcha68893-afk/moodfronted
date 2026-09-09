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
  // ROOT-CAUSE FIX (RAW-CIPHERTEXT-LEAK, v5/multi-device history): same gap
  // as the one fixed in message-e2e-core.js — this only caught ct/iv at the
  // TOP level, but the v5 multi-device envelope nests them inside
  // devices[deviceId], so it slipped through as "plaintext" and the raw
  // ciphertext JSON rendered directly in the chat bubble. This is the file
  // that actually wraps the live decryptMessageForDisplay path, so this is
  // the copy that matters at runtime.
  function isUnsupportedEnvelope(content) {
    if (typeof content !== 'string') return false;
    const s = content.trim();
    if (s.charAt(0) !== '{') return false;
    let o;
    try { o = JSON.parse(s); } catch (_) { return false; }
    if (!o || typeof o !== 'object' || !('v' in o)) return false;
    if ('ct' in o || 'iv' in o) return true;
    if (o.devices && typeof o.devices === 'object') {
      return Object.values(o.devices).some(d => d && typeof d === 'object' && ('ct' in d || 'iv' in d));
    }
    return 'mid' in o || 'sid' in o || 'kid' in o;
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
    // message" after leaving the chat / reloading; receiver decrypts using
    // the sender's CURRENT key instead of the key that actually encrypted
    // the message): this used to always import env.spk and treat it as
    // "the other party's public key" — wrong direction the moment the
    // local user is re-decrypting a message THEY sent, since env.spk is
    // always the ENCRYPTER's own key. It also always called
    // identity.publicKeyFor(peerUserId) for the ECDH partner key —
    // whichever key is active for that user RIGHT NOW — which is the wrong
    // key entirely once either side has rotated since this message was
    // sent. This is the fallback path used when the canonical core's own
    // decrypt (message-e2e-core.js's decryptEnvelope, which already tries
    // the envelope's self-contained spk/rpk and a historical-keyId lookup
    // first) has already failed, so mirror the same priority order here
    // instead of jumping straight to "whatever's current": isOwnMessage
    // (now threaded through from decryptMessageForDisplay below, instead
    // of being silently dropped) picks env.rpk vs env.spk, `identity.
    // publicKeyForVersion` is tried against kid/rkid, and only after both
    // of those are exhausted does this fall back to the current-key
    // lookup that was previously the only option.
    async function sharedIdentityV2Decrypt(content, chatId, peerUserId, isOwnMessage) {
      const env = JSON.parse(content);
      const me = String(identity.userId || dm.getMyUserId?.() || '');
      const canonicalPrivate = identity.privateKey;
      const sharedPrivate = canonicalPrivate || await global.KynectaE2E?.getMyIdentityPrivateKey?.();
      if (!sharedPrivate) throw new Error('No compatible E2E identity available');

      const selfContainedRaw = isOwnMessage ? env.rpk : env.spk;
      const historicalKeyId = isOwnMessage ? env.rkid : env.kid;
      const candidates = [];
      if (selfContainedRaw && typeof identity.importPeerKey === 'function') candidates.push(() => identity.importPeerKey(selfContainedRaw));
      if (historicalKeyId && typeof identity.publicKeyForVersion === 'function') candidates.push(async () => {
        const historical = await identity.publicKeyForVersion(peerUserId, historicalKeyId);
        if (!historical) throw new Error('Historical key unavailable');
        return historical.key;
      });
      candidates.push(async () => (await identity.publicKeyFor(peerUserId)).key);

      let lastErr = null;
      for (const getKey of candidates) {
        let peerKey;
        try { peerKey = await getKey(); } catch (_) { continue; }
        if (!peerKey) continue;
        try { return await decryptWithPrivate(sharedPrivate, peerKey, env, pairContext(peerUserId, me), pairContext(peerUserId, me)); }
        catch (err) { lastErr = err; }
      }
      throw lastErr || new Error('Decryption failed');
    }

    dm.decryptFromChat = async function (encContent, chatId, peerUserId, isOwnMessage) {
      if (isV1(encContent)) return legacyDecrypt(encContent, chatId, peerUserId);
      if (isV2(encContent)) {
        try { return await originalDecryptFromChat(encContent, chatId, peerUserId, isOwnMessage); }
        catch (_) { return sharedIdentityV2Decrypt(encContent, chatId, peerUserId, isOwnMessage); }
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
      // FIX: direction was never computed here, so every decrypt — including
      // the local user re-viewing their OWN sent messages — was silently
      // treated as "receiving" (isOwnMessage undefined/false). That's the
      // flag decryptFromChat/decryptEnvelope now need to pick envelope.rpk
      // over envelope.spk; without threading it through, own-message
      // re-decryption after a key rotation could never work even though the
      // core and this fallback both now know how to do it correctly.
      const meIdForDirection = currentUserId != null ? String(currentUserId) : String(dm.getMyUserId?.() || '');
      const senderIdForDirection = message?.senderId != null ? String(message.senderId) : (message?.sender?.id != null ? String(message.sender.id) : null);
      const isOwnMessage = !!(senderIdForDirection && meIdForDirection && senderIdForDirection === meIdForDirection);

      attempts.set(id, 0);
      const tryDecrypt = async () => {
        let lastError = null;
        for (let i = 0; i < 5; i++) {
          attempts.set(id, i + 1);
          try {
            const text = await dm.decryptFromChat(content, chatId, peer, isOwnMessage);
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
        // DIAGNOSTIC (previously silent): a genuine v1/v2 decrypt failure —
        // as opposed to an unsupported envelope version, handled above —
        // had no console trace at all, only the generic UI placeholder.
        // That made it impossible to tell "wrong/rotated key for this peer"
        // apart from "transient network hiccup" apart from "corrupted
        // envelope" after the fact. Logging the envelope's own kid alongside
        // our current identity keyId/userId and the resolved peer id is
        // usually enough on its own to tell which of those it was.
        try {
          const envMeta = JSON.parse(content);
          console.warn('[E2E] Decrypt failed for message', id, {
            chatId, peer, envelopeVersion: envMeta?.v, envelopeKeyId: envMeta?.kid || envMeta?.spk?.slice?.(0, 12),
            myUserId: identity.userId, myKeyId: identity.keyId, error: e?.message || String(e),
          });
        } catch (_) { console.warn('[E2E] Decrypt failed for message', id, e?.message || String(e)); }
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
