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
  function parseEnvelope(content) {
    if (typeof content !== 'string') return null;
    try {
      const o = JSON.parse(content);
      if (o && o.v === 2 && o.iv && o.ct && o.spk) return o;
      // v3 = Double Ratchet envelope (see js/e2e-ratchet-v3.js): header
      // carries the current sending ratchet public key + chain bookkeeping
      // instead of a self-contained static key pair.
      if (o && o.v === 3 && o.hdr && o.iv && o.ct) return o;
      return null;
    } catch (_) { return null; }
  }
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
  // ROOT-CAUSE FIX (RAW-CIPHERTEXT-LEAK, v5/multi-device history): the old
  // shape check only looked for ct/iv at the TOP level of the envelope
  // object. The v5 multi-device format nests those fields one level down,
  // inside devices[deviceId] — {"v":5,"mid":...,"devices":{"<id>":{"iv":
  // ...,"ct":...}}} — so it had no top-level ct/iv, isUnsupportedEnvelope()
  // returned false, and it fell through to "treat as plaintext," rendering
  // the raw ciphertext JSON directly in the chat bubble (confirmed live —
  // see screenshot). Now also recognizes the nested per-device shape and
  // other known crypto-envelope markers (mid/sid/kid) so ANY versioned
  // envelope this engine doesn't decrypt gets the safe placeholder instead
  // of ever being shown as if it were real text.
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
  // ROOT-CAUSE FIX (WRONG-BOOTSTRAP-PASSWORD / "Unable to decrypt this
  // message" on every message, every reload, every relogin): this used to
  // always call identity.init(bootstrapSecret()) — a throwaway random
  // secret generated locally and stored under its own unrelated
  // localStorage key (kyn_dm_identity_bootstrap_v2_<id>). But the identity
  // blob that's actually sitting in localStorage (kyn_e2e_keypair_v1_<id>)
  // was wrapped with the REAL login-derived password/e2eWrapSecret by
  // js/e2e-encryption.js's own init() call on index.html at login time
  // (see index.html's `sessionStorage.setItem('kyn_e2e_pw_session', ...)`
  // right after a successful login). chat.html/message.html/group.html
  // never call legacy KynectaE2E.init() themselves, so
  // adoptSharedIdentity() (inside identity.init(), tried first) never has
  // a live legacy identity to adopt either. Net effect: this engine could
  // never unlock the real, already-registered identity private key on any
  // page except index.html itself — every decryptEnvelope() call threw,
  // identityReady got reset to null and retried the exact same wrong
  // password again on the very next message, forever. Use the real
  // session-scoped password (same sessionStorage key legacy already
  // writes at login) first; only fall back to the throwaway bootstrap
  // secret when no login-session password is available at all (e.g. this
  // tab never went through the login form).
  function sessionPassword() {
    try { return sessionStorage.getItem('kyn_e2e_pw_session') || null; } catch (_) { return null; }
  }
  function sessionLegacyPassword() {
    try { return sessionStorage.getItem('kyn_e2e_pw_legacy_session') || null; } catch (_) { return null; }
  }
  async function ensureIdentity() {
    if (I()?.enabled && I()?.privateKey) return I();
    if (!identityReady) {
      identityReady = (async () => {
        const identity = I(); if (!identity) throw new Error('E2E identity layer unavailable');
        const realPw = sessionPassword();
        const pw = realPw || bootstrapSecret();
        const legacyPw = sessionLegacyPassword();
        const ok = await identity.init(pw, legacyPw || undefined);
        if (!ok || !identity.enabled || !identity.privateKey || !identity.publicKey) {
          const reason = realPw
            ? 'the stored identity key would not unlock with the current session password'
            : 'no login-session password was available and no existing identity could be adopted';
          throw new Error(`Secure messaging identity could not be initialized (${reason})`);
        }
        return identity;
      })().catch(err => { identityReady = null; console.error('[MessageE2E] identity init failed:', err?.message || err); throw err; });
    }
    return identityReady;
  }
  async function init() { return ensureIdentity(); }

  async function encryptForChat(plaintext, chatId, recipientUserId) {
    // FORWARD-SECRECY FIX (audit P0 — was: static per-pair key reused
    // forever): try the new Double Ratchet path (js/e2e-ratchet-v3.js)
    // first. Falls back to the original static-key v2 scheme only if the
    // ratchet module isn't loaded or genuinely throws — v2 is still real
    // encryption (just without forward secrecy), so falling back to it is
    // a safe degradation, unlike the group-chat plaintext-fallback bug
    // fixed elsewhere in this audit (failing open to WEAKER encryption is
    // an acceptable safety net; failing open to NO encryption is not).
    if (global.KynectaRatchet) {
      try {
        return await encryptForChatV3(plaintext, chatId, recipientUserId);
      } catch (err) {
        console.warn('[MessageE2E] v3 ratchet encrypt failed, falling back to static v2 for this message:', err?.message || err);
      }
    }
    return encryptForChatV2Legacy(plaintext, chatId, recipientUserId);
  }

  // ── Double Ratchet (v3) integration ─────────────────────────────────────
  // Session state is per (my user id, peer user id), persisted in
  // localStorage — this is genuinely new, stateful crypto session data,
  // unlike the old v2 scheme where every message was independently
  // derivable with no memory of prior messages. See the multi-device
  // caveat in the audit writeup: because this app's DM path doesn't yet do
  // Signal-style per-device session fan-out, running the same identity on
  // two devices simultaneously can make their local ratchet states
  // diverge. That pre-dates this fix (the old v2 scheme also only had one
  // identity per user, not per device) but matters more now because state
  // is involved at all. Flagged for a proper per-device follow-up.
  function ratchetStorageKey(peerId) { return `kyn_ratchet_v3_${me()}_${peerId}`; }
  function loadRatchetSession(peerId) {
    try { const raw = localStorage.getItem(ratchetStorageKey(peerId)); return raw ? JSON.parse(raw) : null; }
    catch (_) { return null; }
  }
  function saveRatchetSession(peerId, session) {
    try { localStorage.setItem(ratchetStorageKey(peerId), JSON.stringify(session)); } catch (_) {}
  }

  // ROOT-CAUSE FIX (RATCHET-STATE-RACE — "Unable to decrypt this message"
  // introduced by the v3 Double Ratchet switchover): unlike the old v2
  // scheme (every message independently derivable, no memory of prior
  // messages, so nothing to race on), a Double Ratchet session is mutable
  // state that must be read, advanced, and written back on EVERY single
  // encrypt/decrypt for a given peer. encryptForChatV3/decryptEnvelopeV3
  // used to do that load->mutate->save with no locking at all. In real
  // usage this races constantly: message-client.js's loadHistory() calls
  // `res.data.forEach(m => applyIncomingMessage(m, ...))` — NOT awaited
  // per item — so every undecrypted message in a chat's history begins
  // decrypting in the same tick; likewise sending two messages back to
  // back starts a second encrypt before the first has finished saving.
  // Two overlapping calls for the same peer both read the SAME session
  // snapshot, each independently advances its own in-memory copy, and
  // whichever save() lands last silently overwrites the other's chain
  // advance. The message that lost the race is not just delayed — it's
  // PERMANENTLY undecryptable (confirmed by reproduction): the chain-key
  // index it needed was already consumed deriving the other message's
  // key, and that index is gone forever (a one-way KDF chain, by design,
  // cannot be run backwards) — so the skipped-key cache never gets it
  // either. Retrying does not help, which matches the reported behavior.
  //
  // Fix: serialize every ratchet operation for a given peer through a
  // per-peer promise chain, so the load->mutate->save cycle is atomic —
  // exactly the same invariant a mutex/critical-section gives you, just
  // expressed as a queue of promises since JS has no real threads. This
  // does NOT serialize different peers against each other (each gets its
  // own queue key), so unrelated conversations are unaffected.
  const ratchetLocks = new Map();
  function withRatchetLock(peerId, fn) {
    const key = ratchetStorageKey(peerId);
    const prior = ratchetLocks.get(key) || Promise.resolve();
    const settledPrior = prior.then(() => {}, () => {}); // don't let one failure jam the queue
    const result = settledPrior.then(fn);
    ratchetLocks.set(key, result.then(() => {}, () => {}));
    return result;
  }

  async function encryptForChatV3(plaintext, chatId, recipientUserId) {
    const identity = await ensureIdentity();
    if (!recipientUserId) throw new Error('Recipient is required for secure messaging');
    return withRatchetLock(recipientUserId, async () => {
      const R = global.KynectaRatchet;
      let session = loadRatchetSession(recipientUserId);
      if (!session) {
        const peer = await identity.publicKeyFor(recipientUserId);
        const sharedBitsRaw = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer.key }, identity.privateKey, 256);
        const peerRawPub = await crypto.subtle.exportKey('raw', peer.key);
        const peerRawPubB64 = btoa(String.fromCharCode(...new Uint8Array(peerRawPub)));
        session = await R.initSessionAsSender(sharedBitsRaw, peerRawPubB64);
      }
      const { session: nextSession, envelope } = await R.ratchetEncrypt(session, String(plaintext));
      saveRatchetSession(recipientUserId, nextSession);
      return JSON.stringify(envelope);
    });
  }

  // ROOT-CAUSE FIX (OWN-MESSAGE-MISROUTED-INTO-RECEIVE-CHAIN): decryptFromChat
  // used to call this with no isOwnMessage awareness at all, so an attempt
  // to redisplay your OWN sent v3 message (e.g. cache miss on a fresh
  // device, or IndexedDB cleared) got fed into ratchetDecrypt() — which
  // reads the RECEIVING chain (CKr/DHr), not the sending chain that
  // actually produced this envelope. That's not just wrong, it's
  // impossible by design: Double Ratchet's forward secrecy means the
  // sending chain key used for a given message is overwritten/discarded
  // immediately after use, so not even the original sender can re-derive
  // it later. This app already keeps its own plaintext locally at send
  // time (optimistic displayContent + local IndexedDB cache — see
  // message-client.js/message-local-db.js) specifically so it never needs
  // to re-decrypt its own messages; if that cache is genuinely missing,
  // there is no cryptographic way to recover the text, so fail cleanly
  // and immediately instead of running a doomed decrypt against the wrong
  // chain (which — via the `header.dh !== session.DHr` branch — could
  // also needlessly burn a bogus DH computation against the local
  // session).
  async function decryptEnvelopeV3(envelope, peerUserId, isOwnMessage) {
    if (isOwnMessage) {
      throw new Error('Cannot re-derive plaintext for your own Double Ratchet message (forward secrecy) — no locally cached copy is available');
    }
    const identity = await ensureIdentity();
    return withRatchetLock(peerUserId, async () => {
      const R = global.KynectaRatchet;
      let session = loadRatchetSession(peerUserId);
      if (!session) {
        const peer = await identity.publicKeyFor(peerUserId);
        const sharedBitsRaw = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer.key }, identity.privateKey, 256);
        const myPrivJwk = await crypto.subtle.exportKey('jwk', identity.privateKey);
        session = await R.initSessionAsReceiver(sharedBitsRaw, myPrivJwk, envelope.hdr.dh);
      }
      const { session: nextSession, plaintext } = await R.ratchetDecrypt(session, envelope);
      saveRatchetSession(peerUserId, nextSession);
      return plaintext;
    });
  }
  // ── end Double Ratchet integration ──────────────────────────────────────

  async function encryptForChatV2Legacy(plaintext, chatId, recipientUserId) {
    const identity = await ensureIdentity();
    if (!recipientUserId) throw new Error('Recipient is required for secure messaging');
    const peer = await identity.publicKeyFor(recipientUserId);
    const shared = await identity.deriveShared(peer.key);
    const key = await identity.hkdf(shared, pairContext(recipientUserId));
    const env = await identity.aesEncrypt(String(plaintext), key, pairContext(recipientUserId));
    // FIX (HISTORICAL-KEY-SELF-CONTAINED-ENVELOPE): the envelope already
    // carried `spk` (the SENDER's own public key at encryption time) but
    // nothing recorded which of the RECIPIENT's public keys was used to
    // derive the shared secret. Without that, re-deriving this exact
    // shared secret later (by either party, after either side's key has
    // possibly rotated) had to fall back on "whatever key is active right
    // now" — wrong the moment either party rotates. `rpk`/`rkid` embed the
    // recipient's public key bytes and keyId actually used here, making
    // the envelope fully self-describing: decrypting it later never has to
    // depend on a live "current key" lookup for either side. See
    // decryptEnvelope() below for how these are consumed.
    return JSON.stringify({ v: 2, kid: identity.keyId, spk: identity.publicKey, rkid: peer.keyId, rpk: peer.pub, iv: env.iv, ct: env.ct });
  }

  // ROOT-CAUSE FIX (receiver decrypts using the sender's CURRENT public key
  // instead of the key that actually encrypted the message): this used to
  // ignore envelope.spk/kid entirely and always fetch identity.publicKeyFor
  // (peerUserId) — whatever key is active for that user RIGHT NOW. If the
  // sender's key had rotated since this particular message was sent (new
  // device, reinstall, cleared storage), that's the WRONG key and AES-GCM
  // authentication fails deterministically. The message already carries
  // the exact key it was encrypted against:
  //   - received message (peer is the sender): envelope.spk is the
  //     sender's public key at encryption time — use it directly.
  //   - own sent message viewed later (peer is the recipient): envelope.rpk
  //     is the recipient's public key that was used — use it directly.
  // Neither case needs a network round trip or depends on what's currently
  // registered server-side; the envelope is self-contained. This resolves
  // candidate keys in priority order and tries each in turn:
  //   1. the self-contained key embedded in the envelope (spk/rpk) — no
  //      lookup at all, correct even if the peer has since rotated.
  //   2. a historical lookup by keyId (kid/rkid) against the server's key
  //      history (identity.publicKeyForVersion) — covers messages sent
  //      before rpk existed, where the exact key isn't embedded but its
  //      keyId is.
  //   3. whatever is currently cached/registered for this peer — the
  //      pre-existing behavior, kept as a last resort for the oldest
  //      messages (no rpk, no useful kid) and as defense-in-depth.
  //   4. purge the cache and force one fresh fetch of the current key, in
  //      case it's simply stale locally (self-heals a rotation the live
  //      key-push listener in e2e-identity-core.js hasn't caught up on).
  async function decryptEnvelope(envelope, peerUserId, isOwnMessage) {
    const identity = await ensureIdentity();
    if (!peerUserId) throw new Error('Message sender/recipient is missing');

    const selfContainedRaw = isOwnMessage ? envelope.rpk : envelope.spk;
    const historicalKeyId = isOwnMessage ? envelope.rkid : envelope.kid;

    const candidates = [];
    if (selfContainedRaw) candidates.push(() => identity.importPeerKey(selfContainedRaw));
    if (historicalKeyId) candidates.push(async () => {
      const historical = await identity.publicKeyForVersion(peerUserId, historicalKeyId);
      if (!historical) throw new Error('Historical key unavailable');
      return historical.key;
    });
    candidates.push(async () => (await identity.publicKeyFor(peerUserId)).key);
    candidates.push(async () => { identity.purgePublicKey?.(peerUserId); return (await identity.publicKeyFor(peerUserId, true)).key; });

    let lastErr = null;
    for (const getKey of candidates) {
      let peerKey;
      try { peerKey = await getKey(); } catch (_) { continue; }
      if (!peerKey) continue;
      try {
        const shared = await identity.deriveShared(peerKey);
        const key = await identity.hkdf(shared, pairContext(peerUserId));
        return await identity.aesDecrypt(envelope, key, pairContext(peerUserId));
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('Decryption failed');
  }

  async function decryptFromChat(encContent, chatId, peerUserId, isOwnMessage) {
    const env = parseEnvelope(encContent);
    if (!env) return encContent;
    if (env.v === 3) return decryptEnvelopeV3(env, peerUserId, isOwnMessage);
    return decryptEnvelope(env, peerUserId, isOwnMessage);
  }
  async function attempt(message, chatId, currentUserId, opts) {
    const peer = peerFor(message, currentUserId, opts?.activeConversation);
    if (!peer) throw new Error('Message peer is unavailable');
    const meId = currentUserId != null ? String(currentUserId) : me();
    const sender = message?.senderId != null ? String(message.senderId) : (message?.sender?.id != null ? String(message.sender.id) : null);
    const isOwnMessage = !!(sender && meId && sender === meId);
    return decryptFromChat(message.content, chatId, peer, isOwnMessage);
  }
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
  // FIX (deleted message can be re-inserted by a late decrypt/retry):
  // deleting a message only ever removed it from message-client.js's own
  // state.messagesByConversation bucket — this engine's own pending/failed/
  // decryptCache/inflight entries for that id were never cleaned up, so a
  // retry already in flight (or scheduled) for a message that FAILED to
  // decrypt could still resolve/fail after the delete and fire
  // kyn:messageDecrypted / kyn:messageDecryptFailed for an id nothing
  // should care about anymore. message-client.js's own listeners guard
  // against re-adding a message that's no longer in the bucket, but letting
  // the queue entry linger is still wasted work and a latent resurrection
  // risk if that guard is ever missed by a future caller. Called from
  // message-client.js's removeMessageFromState() on every delete.
  function forgetMessage(messageIdValue) {
    const id = messageId({ id: messageIdValue });
    if (!id) return;
    pending.delete(id);
    failed.delete(id);
    decryptCache.delete(id);
    inflight.delete(id);
  }
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

  global.KynectaMessageE2E = { init, encryptForChat, decryptFromChat, decryptMessageForDisplay, retryDecrypt, prefetchRecipientKey, prefetchRecipientKeys, cacheRecipientKey, isMessageQueued, isMessageFailed, peekDecryptedText, forgetMessage, registerPendingDecrypt, encryptAttachment, decryptAttachment, getSafetyNumbers: (...args) => I()?.getSafetyNumbers?.(...args), get enabled() { return !!I()?.enabled; }, get publicKey() { return I()?.publicKey || null; }, get keyId() { return I()?.keyId || null; }, getMyUserId: () => I()?.userId || null, clearKeys: () => I()?.clear?.() };
})(window);