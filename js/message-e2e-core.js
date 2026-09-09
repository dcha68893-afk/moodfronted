/* Canonical 1-to-1 message E2E engine. */
(function (global) {
  'use strict';
  const I = () => global.KynectaE2EIdentity;
  const decryptCache = new Map();
  const pending = new Map();
  const failed = new Set();
  const inflight = new Map();
  let identityReady = null;

  function me() { return I()?.userId ? String(I().userId) : null; }
  function pairContext(peerId) { const a = String(me() || ''), b = String(peerId || ''); return `kynecta-dm-v2:${[a, b].sort().join(':')}`; }
  function messageId(message) { return String(message?.id || message?.localId || message?.serverId || ''); }
  function parseEnvelope(content) { if (typeof content !== 'string') return null; try { const o = JSON.parse(content); return o && o.v === 2 && o.iv && o.ct && o.spk ? o : null; } catch (_) { return null; } }
  // ROOT-CAUSE FIX (old messages render as raw ciphertext JSON instead of a
  // placeholder): this engine only understands v2 envelopes. Older
  // conversation history encrypted by a previous protocol generation (v1/v3/
  // v4/v5, e.g. the earlier X3DH double-ratchet format — kid/sid/n/iv/ct or
  // mid/senderDeviceId/devices shapes) parsed as null above and used to fall
  // straight through to "return content as-is", which is indistinguishable
  // from genuine plaintext to every caller — the literal ciphertext JSON got
  // stored as displayContent and rendered in the chat bubble. Any object
  // that's still clearly an encrypted envelope (has a version field plus a
  // ciphertext/iv field) must never be treated as plaintext, even if this
  // engine can't decrypt that particular version.
  function isUnsupportedEnvelope(content) {
    if (typeof content !== 'string') return false;
    const s = content.trim();
    if (s.charAt(0) !== '{') return false;
    try {
      const o = JSON.parse(s);
      return !!(o && typeof o === 'object' && ('v' in o) && (('ct' in o) || ('iv' in o)));
    } catch (_) { return false; }
  }
  function peerFor(message, currentUserId, activeConversation) {
    const meId = currentUserId != null ? String(currentUserId) : me();
    const sender = message?.senderId != null ? String(message.senderId) : (message?.sender?.id != null ? String(message.sender.id) : null);
    const receiver = message?.receiverId != null ? String(message.receiverId) : (message?.recipientId != null ? String(message.recipientId) : null);
    if (sender && meId && sender === meId) return receiver || String(activeConversation?.otherUserId || activeConversation?.friendId || '');
    return sender;
  }
  function bootstrapSecret() {
    const id = me(); if (!id) throw new Error('User identity is unavailable');
    const key = `kyn_dm_identity_bootstrap_v2_${id}`; let value = null;
    try { value = localStorage.getItem(key); } catch (_) {}
    if (value) return value;
    const bytes = crypto.getRandomValues(new Uint8Array(32)); value = btoa(String.fromCharCode(...bytes));
    try { localStorage.setItem(key, value); } catch (_) {}
    return value;
  }
  async function ensureIdentity() {
    if (I()?.enabled && I()?.privateKey) return I();
    if (!identityReady) {
      identityReady = (async () => {
        const identity = I(); if (!identity) throw new Error('E2E identity layer unavailable');
        await identity.init(bootstrapSecret());
        if (!identity.enabled || !identity.privateKey || !identity.publicKey) throw new Error('Secure messaging identity could not be initialized');
        return identity;
      })().catch(err => { identityReady = null; throw err; });
    }
    return identityReady;
  }
  async function init() { return ensureIdentity(); }

  async function encryptForChat(plaintext, chatId, recipientUserId) {
    const identity = await ensureIdentity();
    if (!recipientUserId) throw new Error('Recipient is required for secure messaging');
    const peer = await identity.publicKeyFor(recipientUserId);
    const shared = await identity.deriveShared(peer.key);
    const key = await identity.hkdf(shared, pairContext(recipientUserId));
    const env = await identity.aesEncrypt(String(plaintext), key, pairContext(recipientUserId));
    return JSON.stringify({ v: 2, kid: identity.keyId, spk: identity.publicKey, iv: env.iv, ct: env.ct });
  }

  // ROOT-CAUSE FIX (own sent messages become "Unable to decrypt" after a
  // reload): this used to import envelope.spk and treat it as "the other
  // party's public key" for the ECDH shared-secret derivation. envelope.spk
  // is always the ENCRYPTER's own public key (see encryptForChat above,
  // spk: identity.publicKey) — correct when the person decrypting is the
  // recipient (their priv + sender's spk reproduces the same shared secret
  // the sender computed with their own priv + recipient's pub, since
  // static-static ECDH is symmetric either direction). But when the
  // ORIGINAL SENDER later re-decrypts their own history (e.g. after a page
  // reload wipes the in-memory optimistic displayContent), envelope.spk is
  // THEIR OWN key, not the peer's — deriving ECDH(myPriv, myPub) instead of
  // ECDH(myPriv, peerPub) silently produces the wrong key and a guaranteed
  // AES-GCM auth failure. peerUserId (from peerFor()/attempt() above) is
  // already correctly resolved to "whichever side isn't me" regardless of
  // who originally sent this specific message, so fetching that peer's
  // current public key directly (same lookup encryptForChat itself uses)
  // is both correct for received messages and fixes the own-message case,
  // without needing to special-case direction here at all.
  async function decryptEnvelope(envelope, peerUserId) {
    const identity = await ensureIdentity();
    if (!peerUserId) throw new Error('Message sender/recipient is missing');
    const peerEntry = await identity.publicKeyFor(peerUserId);
    const shared = await identity.deriveShared(peerEntry.key);
    const key = await identity.hkdf(shared, pairContext(peerUserId));
    return identity.aesDecrypt(envelope, key, pairContext(peerUserId));
  }

  async function decryptFromChat(encContent, chatId, peerUserId) { const env = parseEnvelope(encContent); return env ? decryptEnvelope(env, peerUserId) : encContent; }
  async function attempt(message, chatId, currentUserId, opts) { const peer = peerFor(message, currentUserId, opts?.activeConversation); if (!peer) throw new Error('Message peer is unavailable'); return decryptFromChat(message.content, chatId, peer); }
  function notifyResolved(id, plaintext, entry) { decryptCache.set(id, plaintext); pending.delete(id); failed.delete(id); entry?.subscribers?.forEach(fn => { try { fn(plaintext); } catch (_) {} }); try { document.dispatchEvent(new CustomEvent('kyn:messageDecrypted', { detail: { messageId: id, chatId: entry?.chatId, plaintext } })); } catch (_) {} }
  function notifyFailed(id, error, entry) { pending.delete(id); failed.add(id); entry?.subscribers?.forEach(fn => { try { fn(null, error); } catch (_) {} }); try { document.dispatchEvent(new CustomEvent('kyn:messageDecryptFailed', { detail: { messageId: id, error: error?.message || String(error || 'Decryption failed') } })); } catch (_) {} }
  async function decryptMessageForDisplay(message, chatId, currentUserId, opts = {}) {
    const id = messageId(message) || `${chatId}:${message?.content || ''}`;
    if (!parseEnvelope(message?.content)) {
      if (isUnsupportedEnvelope(message?.content)) {
        failed.add(id);
        return opts.fallbackText === undefined ? '' : opts.fallbackText;
      }
      return typeof message?.content === 'string' ? message.content : (message?.content || '');
    }
    if (decryptCache.has(id)) return decryptCache.get(id); if (inflight.has(id)) return inflight.get(id);
    const entry = pending.get(id) || { chatId, subscribers: new Set() }; pending.set(id, entry);
    if (typeof opts.onResolved === 'function') entry.subscribers.add(opts.onResolved);
    const promise = (async () => { try { const plaintext = await attempt(message, chatId, currentUserId, opts); notifyResolved(id, plaintext, entry); return plaintext; } catch (error) { notifyFailed(id, error, entry); throw error; } finally { inflight.delete(id); } })();
    inflight.set(id, promise); try { return await promise; } catch (_) { return opts.fallbackText === undefined ? '' : opts.fallbackText; }
  }
  async function retryDecrypt(chatId, message) { const id = messageId(message); decryptCache.delete(id); failed.delete(id); pending.delete(id); return decryptMessageForDisplay(message, chatId, me(), {}); }
  async function prefetchRecipientKey(userId) { try { await ensureIdentity(); return await I().publicKeyFor(userId); } catch (_) { return null; } }
  // Login-time batch warmup — see e2e-identity-core.js's publicKeysForBatch
  // for the full rationale. Called once with every known contact id right
  // after the conversation list loads.
  async function prefetchRecipientKeys(userIds) { try { await ensureIdentity(); await I().publicKeysForBatch(userIds); return true; } catch (_) { return false; } }
  // ROOT-CAUSE FIX (silent no-op): this used to write to its own
  // 'kyn_e2e_bootstrap_pub_<id>' localStorage key, which decryptEnvelope()/
  // identity.publicKeyFor() never read from — so a key handed to this
  // function (an inline bootstrap response, a live key-rotation push) was
  // cached somewhere nothing ever looked, and the real decrypt path always
  // fell through to a fresh network fetch anyway. Now writes through
  // identity-core's cachePublicKey(), the same store publicKeyFor() reads.
  async function cacheRecipientKey(userId, keyEntry) {
    if (!userId || !keyEntry?.publicKey) return false;
    try { await ensureIdentity(); return await I().cachePublicKey(userId, keyEntry.publicKey, keyEntry.keyId); }
    catch (_) { return false; }
  }
  function isMessageQueued(message) { return pending.has(messageId(message)); }
  function isMessageFailed(message) { return failed.has(messageId(message)); }
  function peekDecryptedText(message) { return decryptCache.get(messageId(message)) ?? null; }
  async function registerPendingDecrypt(messageIdValue, attemptFn, onResolved) { const id = String(messageIdValue || ''); if (!id || typeof attemptFn !== 'function') return { ok: false }; if (decryptCache.has(id)) return { ok: true, plaintext: decryptCache.get(id) }; if (pending.has(id)) { if (onResolved) pending.get(id).subscribers.add(onResolved); return { ok: false, queued: true }; } const entry = { subscribers: new Set(onResolved ? [onResolved] : []) }; pending.set(id, entry); try { const text = await attemptFn(); notifyResolved(id, text, entry); return { ok: true, plaintext: text }; } catch (e) { notifyFailed(id, e, entry); return { ok: false, queued: false }; } }
  async function encryptAttachment(arrayBuffer, chatId, recipientUserId) {
    const identity = await ensureIdentity();
    const peer = await identity.publicKeyFor(recipientUserId);
    const shared = await identity.deriveShared(peer.key);
    const key = await identity.hkdf(shared, pairContext(recipientUserId) + ':attachment');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, arrayBuffer);
    return { v: 2, spk: identity.publicKey, iv: btoa(String.fromCharCode(...iv)), ct: btoa(String.fromCharCode(...new Uint8Array(ct))) };
  }
  async function decryptAttachment(env, chatId, senderUserId) {
    const identity = await ensureIdentity();
    let peerKey;
    if (env && env.spk) {
      peerKey = await crypto.subtle.importKey('spki', Uint8Array.from(atob(env.spk), c => c.charCodeAt(0)), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    } else {
      peerKey = (await identity.publicKeyFor(senderUserId)).key;
    }
    const shared = await identity.deriveShared(peerKey);
    const key = await identity.hkdf(shared, pairContext(senderUserId) + ':attachment');
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(atob(env.iv), c => c.charCodeAt(0)), tagLength: 128 }, key, Uint8Array.from(atob(env.ct), c => c.charCodeAt(0)));
  }

  global.KynectaMessageE2E = { init, encryptForChat, decryptFromChat, decryptMessageForDisplay, retryDecrypt, prefetchRecipientKey, prefetchRecipientKeys, cacheRecipientKey, isMessageQueued, isMessageFailed, peekDecryptedText, registerPendingDecrypt, encryptAttachment, decryptAttachment, getSafetyNumbers: (...args) => I()?.getSafetyNumbers?.(...args), get enabled() { return !!I()?.enabled; }, get publicKey() { return I()?.publicKey || null; }, get keyId() { return I()?.keyId || null; }, getMyUserId: () => I()?.userId || null, clearKeys: () => I()?.clear?.() };
})(window);
