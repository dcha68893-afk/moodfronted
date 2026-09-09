/* Compatibility bridge for canonical DM E2E.
 * Keeps old v1 history readable, but MUST NOT silently switch a v2
 * ciphertext to an unrelated/current peer key. A v2 envelope is bound to
 * the exact identity keys used at encryption time (spk/rpk + kid/rkid).
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
    try { const o = JSON.parse(content); return !!o && o.v === 2 && o.iv && o.ct && o.spk && o.rpk; } catch (_) { return false; }
  }
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

  async function decryptWithPrivate(privateKey, peerKey, envelope, info, aad) {
    const identity = global.KynectaE2EIdentity;
    const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: peerKey }, privateKey, 256);
    const key = await identity.hkdf(shared, info);
    const params = { name: 'AES-GCM', iv: b64ToBytes(envelope.iv), tagLength: 128 };
    if (aad) params.additionalData = enc(aad);
    return new TextDecoder().decode(await crypto.subtle.decrypt(params, key, b64ToBytes(envelope.ct)));
  }

  async function install() {
    const dm = global.KynectaMessageE2E;
    const identity = global.KynectaE2EIdentity;
    if (!dm || !identity) return false;
    if (dm.__legacyCompatibilityInstalled) return true;

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

    async function sharedIdentityV2Decrypt(content, chatId, peerUserId, isOwnMessage) {
      const env = JSON.parse(content);
      const me = String(identity.userId || dm.getMyUserId?.() || '');
      const privateKey = identity.privateKey || await global.KynectaE2E?.getMyIdentityPrivateKey?.();
      if (!privateKey) throw new Error('No compatible E2E identity available');

      // For v2 the envelope is authoritative. Never silently substitute the
      // current peer key for the exact key that was used at encryption time.
      // This prevents an invalid ECDH secret from being generated after key
      // rotation and turns a hidden crypto mismatch into a deterministic
      // diagnostic failure.
      const rawPeerKey = isOwnMessage ? env.rpk : env.spk;
      if (!rawPeerKey) throw new Error('V2 envelope missing peer identity key');
      const peerKey = await identity.importPeerKey(rawPeerKey);
      const context = pairContext(peerUserId, me);
      return decryptWithPrivate(privateKey, peerKey, env, context, context);
    }

    dm.decryptFromChat = async function (encContent, chatId, peerUserId, isOwnMessage) {
      if (isV1(encContent)) return legacyDecrypt(encContent, chatId, peerUserId);
      if (isV2(encContent)) {
        // Canonical v2 first. Compatibility may only retry the same
        // self-contained identity pair; it must not fall back to the current
        // peer key because that can never decrypt ciphertext produced by a
        // different identity key.
        return originalDecryptFromChat(encContent, chatId, peerUserId, isOwnMessage);
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

      const meId = currentUserId != null ? String(currentUserId) : String(dm.getMyUserId?.() || identity.userId || '');
      const senderId = message?.senderId != null ? String(message.senderId) : (message?.sender?.id != null ? String(message.sender.id) : null);
      const isOwnMessage = !!(senderId && meId && senderId === meId);

      attempts.set(id, 0);
      try {
        let lastError = null;
        for (let i = 0; i < 5; i++) {
          attempts.set(id, i + 1);
          try {
            const text = await dm.decryptFromChat(content, chatId, peer, isOwnMessage);
            if (typeof text === 'string' && text && !/^\[Encrypted|^\[Decryption failed/.test(text)) {
              cache.set(id, text);
              failures.delete(id);
              attempts.delete(id);
              opts.onResolved?.(text);
              try { document.dispatchEvent(new CustomEvent('kyn:messageDecrypted', { detail: { messageId: id, chatId, plaintext: text } })); } catch (_) {}
              return text;
            }
            lastError = new Error(text || 'Decryption failed');
          } catch (e) { lastError = e; }
          await new Promise(r => setTimeout(r, Math.min(500 * (i + 1), 1500)));
        }
        throw lastError || new Error('Decryption failed');
      } catch (e) {
        attempts.delete(id);
        failures.add(id);
        try {
          const envMeta = JSON.parse(content);
          console.warn('[E2E] Decrypt failed', {
            messageId: id, chatId, peer,
            envelopeVersion: envMeta?.v,
            senderKeyId: envMeta?.kid,
            recipientKeyId: envMeta?.rkid,
            myUserId: identity.userId,
            myKeyId: identity.keyId,
            isOwnMessage,
            error: e?.message || String(e),
          });
        } catch (_) {}
        try { document.dispatchEvent(new CustomEvent('kyn:messageDecryptFailed', { detail: { messageId: id, error: e?.message || String(e) } })); } catch (_) {}
        return opts.fallbackText === undefined ? '🔒 Encrypted message' : opts.fallbackText;
      }
    };

    dm.isMessageQueued = (message) => attempts.has(String(message?.id || message?.localId || message?.serverId || message || ''));
    dm.isMessageFailed = (message) => failures.has(String(message?.id || message?.localId || message?.serverId || message || ''));
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
    document.addEventListener('kyn:canonicalMessageE2EReady', () => { install(); }, { once: true });
  }
})(window);
