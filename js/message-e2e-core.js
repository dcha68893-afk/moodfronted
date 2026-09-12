/* Canonical 1-to-1 message E2E engine. */
(function (global) {
  'use strict';
  const I = () => global.KynectaE2EIdentity;
  let decryptCache = new Map();
  let pending = new Map();
  let failed = new Set();
  let inflight = new Map();
  let identityReady = null;

  // ROOT-CAUSE FIX (ACCOUNT-SWITCH-STALE-STATE — "switch account A to B,
  // chat, switch back to A, sending/decrypting for A misbehaves"): every
  // cache above is a bare module-level Map/Set keyed ONLY by message id or
  // peer id — never by which account is currently active. This app
  // supports switching between two logged-in accounts in the SAME window
  // (see auth.account.limit.js), which calls KynectaE2EIdentity.clear() and
  // re-inits for the new account, but nothing ever cleared THIS module's
  // caches. Two concrete failure modes result: (1) decryptCache/pending/
  // failed/inflight are keyed by raw message id with no account
  // namespacing — if account A's message id 123 was cached (decrypted or
  // failed) and account B also has a message id 123 (entirely plausible
  // with per-row autoincrement ids), switching to B can silently return A's
  // stale cached result instead of ever attempting B's actual decrypt; (2)
  // identityReady, once resolved for A, is never reset on switch, so a
  // caller that hits the `if (!identityReady)` fast path can be handed a
  // promise that already resolved against A's identity object before B's
  // init call ever ran. Track the active account id and flush every one of
  // these on change, so switching accounts always starts every cache from a
  // clean slate for the newly active user — exactly like a fresh page load
  // would.
  let _lastKnownUserId = undefined;
  function _resetPerAccountState() {
    decryptCache = new Map();
    pending = new Map();
    failed = new Set();
    inflight = new Map();
    identityReady = null;
    ratchetLocks.clear();
  }
  function _syncAccountState() {
    const current = me();
    if (current !== _lastKnownUserId) {
      if (_lastKnownUserId !== undefined) _resetPerAccountState();
      _lastKnownUserId = current;
    }
    return current;
  }

  // FIX (V2V3-DECRYPT-DIAGNOSTICS, requested behavior): every decrypt branch
  // below (v3 attempt, v3→v2 fallback decision, v2 attempt, session repair)
  // used to be silent except for a couple of console.warn calls — a failure
  // anywhere in the pipeline collapsed into one opaque "Decryption failed"
  // with no way to tell, from the console, which envelope version was
  // involved, whether a local ratchet session existed for this peer,
  // whether its DH matched the incoming header, or what the underlying
  // exception actually was. _diagLog gives every stage a single structured
  // log line. It NEVER receives ciphertext, plaintext, or private key
  // material: every call site below only ever passes message ids, envelope
  // *version numbers*, user ids, booleans, and error name/message strings —
  // by construction (those are the only things read off the envelope for
  // logging purposes), not by after-the-fact filtering.
  function _diagLog(stage, meta) {
    try { console.log(`[MessageE2E:${stage}]`, meta || ''); } catch (_) {}
  }
  function _errInfo(e) { return { name: e?.name || 'Error', reason: e?.message || String(e || 'unknown error') }; }

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
    _syncAccountState();
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
  function clearRatchetSession(peerId) {
    try { localStorage.removeItem(ratchetStorageKey(peerId)); } catch (_) {}
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
  // ROOT-CAUSE FIX (CROSS-CONTEXT-RATCHET-RACE — intermittent "Unable to
  // decrypt this message" that started with the v3 Double Ratchet
  // switchover and doesn't happen on retry): the per-peer promise-chain
  // queue above only ever serialized calls made from WITHIN this one script
  // context. But e2e-session-init.js's bootstrap runs independently in
  // EVERY window that loads it — and it's loaded by both chat.html (the
  // parent shell, which calls decryptMessageForDisplay for every incoming
  // message to build its own notification preview — see chat.html's
  // MESSAGE_RECEIVED handler) and message.html (its iframe, which decrypts
  // the exact same incoming messages to render the chat bubbles, plus every
  // undecrypted message in history on load). Those are two separate
  // `window` objects with two separate copies of this file's module scope —
  // two separate `ratchetLocks` Maps that know nothing about each other —
  // both reading, advancing, and writing back the SAME shared
  // localStorage-persisted ratchet session for the same peer. A Double
  // Ratchet session is exactly the kind of one-way, non-replayable state
  // this app's own audit comments already flagged as unsafe to
  // load->mutate->save without a lock (see the comment above this
  // function) — the fix there just didn't reach far enough. Concretely,
  // this reproduces whenever chat.html's notification decrypt and
  // message.html's display decrypt/encrypt race for the same peer: both
  // load the same on-disk session, both advance it independently
  // (encryptForChatV3's `if (!session.CKs)` branch is the worst case — it
  // mints a brand-new random ephemeral DH keypair, so two racing sends
  // don't even converge on the same result the way two racing decrypts of
  // the same message key usually do), and whichever save() lands last
  // silently discards the other side's chain advance. The message on the
  // losing side is not delayed, it's PERMANENTLY undecryptable, matching
  // the reported symptom exactly (this is new behavior introduced by v3;
  // the old static-key v2 scheme had no shared mutable state to race on).
  //
  // Fix: back the lock with the platform's actual cross-context primitive.
  // navigator.locks (the Web Locks API) is shared by every same-origin
  // browsing context — top-level window AND same-origin iframes — so a
  // lock named after the same key used for localStorage below is honored
  // across chat.html and message.html automatically, with the browser
  // handling queuing/ordering/release-on-crash for us. Where it's
  // unavailable (older WebView builds without Web Locks support), fall back
  // to a localStorage-backed spin-lock using the exact same
  // claim/TTL/steal-if-stale pattern this codebase already ships in
  // js/phase15.delivery.patch.js's cross-context claim registry, so a
  // crashed/reloaded tab can never leave the lock stuck forever. Either
  // path still runs `fn` through the existing in-window promise queue too,
  // so ordering within a single window is unaffected.
  const XCTX_LOCK_PREFIX = 'kyn_ratchet_xlock_';
  const XCTX_LOCK_TTL_MS = 8000;
  const XCTX_LOCK_POLL_MS = 40;
  function _xctxLockKey(key) { return XCTX_LOCK_PREFIX + key; }
  async function _acquireStorageLock(key) {
    const storageKey = _xctxLockKey(key);
    const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const deadline = Date.now() + XCTX_LOCK_TTL_MS * 2;
    for (;;) {
      let raw = null;
      try { raw = localStorage.getItem(storageKey); } catch (_) { return null; } // storage unavailable — fail open, nothing to synchronize against anyway
      if (raw) {
        let rec = null;
        try { rec = JSON.parse(raw); } catch (_) {}
        const stale = !rec || (Date.now() - rec.ts) > XCTX_LOCK_TTL_MS;
        if (!stale) {
          if (Date.now() > deadline) { try { localStorage.removeItem(storageKey); } catch (_) {} } // held far too long (crashed tab) — steal it
          else { await new Promise(r => setTimeout(r, XCTX_LOCK_POLL_MS)); continue; }
        }
      }
      try { localStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), token })); } catch (_) { return null; }
      // Re-read to guard the tiny window where two contexts both saw no
      // lock and both wrote — whoever's token is actually stored won.
      let confirm = null;
      try { confirm = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (_) {}
      if (confirm && confirm.token === token) return { storageKey, token };
      await new Promise(r => setTimeout(r, XCTX_LOCK_POLL_MS));
    }
  }
  function _releaseStorageLock(handle) {
    if (!handle) return;
    try {
      const raw = localStorage.getItem(handle.storageKey);
      const rec = raw ? JSON.parse(raw) : null;
      if (rec && rec.token === handle.token) localStorage.removeItem(handle.storageKey);
    } catch (_) {}
  }
  function withCrossContextLock(key, fn) {
    if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
      return navigator.locks.request(_xctxLockKey(key), fn);
    }
    return (async () => {
      const handle = await _acquireStorageLock(key);
      try { return await fn(); } finally { _releaseStorageLock(handle); }
    })();
  }
  function withRatchetLock(peerId, fn) {
    const key = ratchetStorageKey(peerId);
    const prior = ratchetLocks.get(key) || Promise.resolve();
    const settledPrior = prior.then(() => {}, () => {}); // don't let one failure jam the queue
    const result = settledPrior.then(() => withCrossContextLock(key, fn));
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
  async function _initReceiverSessionFromHeader(identity, peerUserId, envelope) {
    const peer = await identity.publicKeyFor(peerUserId);
    const sharedBitsRaw = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer.key }, identity.privateKey, 256);
    const myPrivJwk = await crypto.subtle.exportKey('jwk', identity.privateKey);
    return global.KynectaRatchet.initSessionAsReceiver(sharedBitsRaw, myPrivJwk, envelope.hdr.dh);
  }

  // ROOT-CAUSE FIX (V3-SESSION-REPAIR + RETRY-NEVER-RECOVERS): a
  // structurally broken local ratchet session — one that's present in
  // localStorage but missing the receiving-chain key material
  // ratchetDecrypt() needs to process ANY incoming header (`Receiving
  // ratchet is not initialized` / `Receiving chain is unavailable`) — used
  // to fail this exact same way forever. retryDecrypt() (see below) only
  // ever clears this module's message-level cache (decryptCache/pending/
  // failed/inflight); it never touched the underlying persisted ratchet
  // session, so hitting "Retry" replayed the identical broken session and
  // produced the identical failure every time — permanently undecryptable,
  // not just delayed.
  //
  // For a genuine v3 message this is safely recoverable: discard the
  // broken local session and reinitialize as receiver directly from THIS
  // envelope's own header (`envelope.hdr.dh`) — exactly what already
  // happens for a brand-new peer with no session at all (see the `if
  // (!session)` branch below) — then retry the decrypt once. This only
  // fires for the specific structural errors above (the session exists but
  // is unusable for receiving), never for a plain AES-GCM auth failure
  // (OperationError/'Decryption failed'): an auth failure usually means
  // this message simply doesn't belong to the current chain position
  // (wrong key material), not a repairable structural gap, and resetting
  // the session on every auth failure would mask real bugs and throw away
  // forward-secrecy state for no benefit.
  const REPAIRABLE_V3_ERRORS = new Set([
    'Receiving ratchet is not initialized',
    'Receiving chain is unavailable',
  ]);

  async function decryptEnvelopeV3(envelope, peerUserId, isOwnMessage, msgIdForLog) {
    _diagLog('V3_DECRYPT_START', { msgId: msgIdForLog, peerUserId, isOwnMessage });
    if (isOwnMessage) {
      // ROOT-CAUSE FIX (OWN-MESSAGE-MISROUTED-INTO-RECEIVE-CHAIN): see the
      // full rationale above encryptFromChatV3's own-message guard further
      // down this file — redisplaying your own sent v3 message must never
      // be run through the receiving chain (CKr/DHr), because it would
      // either desync the real receiving chain or (best case) fail
      // pointlessly. There is no cryptographic way to recover this
      // message's plaintext without the locally-cached copy made at send
      // time, so fail fast and clearly instead of attempting a doomed
      // ratchet step.
      _diagLog('V3_DECRYPT_REFUSED_OWN_MESSAGE', { msgId: msgIdForLog, peerUserId });
      throw new Error('Cannot re-derive plaintext for your own Double Ratchet message (forward secrecy) — no locally cached copy is available');
    }
    const identity = await ensureIdentity();
    return withRatchetLock(peerUserId, async () => {
      const R = global.KynectaRatchet;
      let session = loadRatchetSession(peerUserId);
      const hadSession = !!session;
      const headerDh = envelope?.hdr?.dh || null;
      _diagLog('V3_SESSION_STATE', {
        msgId: msgIdForLog, peerUserId,
        hadExistingSession: hadSession,
        sessionHasReceivingChain: hadSession ? !!session.CKr : false,
        headerDhMatchesSessionDHr: hadSession ? (session.DHr === headerDh) : null,
      });
      if (!session) {
        session = await _initReceiverSessionFromHeader(identity, peerUserId, envelope);
      }
      try {
        const { session: nextSession, plaintext } = await R.ratchetDecrypt(session, envelope);
        saveRatchetSession(peerUserId, nextSession);
        _diagLog('V3_DECRYPT_SUCCESS', { msgId: msgIdForLog, peerUserId, repaired: false });
        return plaintext;
      } catch (firstErr) {
        const info = _errInfo(firstErr);
        _diagLog('V3_DECRYPT_FAILED', { msgId: msgIdForLog, peerUserId, hadExistingSession: hadSession, ...info });

        const repairable = hadSession && REPAIRABLE_V3_ERRORS.has(firstErr?.message);
        if (!repairable) throw firstErr;

        _diagLog('V3_SESSION_REPAIR_ATTEMPT', { msgId: msgIdForLog, peerUserId, reason: info.reason });
        try {
          clearRatchetSession(peerUserId);
          const freshSession = await _initReceiverSessionFromHeader(identity, peerUserId, envelope);
          const { session: nextSession, plaintext } = await R.ratchetDecrypt(freshSession, envelope);
          saveRatchetSession(peerUserId, nextSession);
          _diagLog('V3_SESSION_REPAIR_SUCCEEDED', { msgId: msgIdForLog, peerUserId });
          return plaintext;
        } catch (repairErr) {
          _diagLog('V3_SESSION_REPAIR_FAILED', { msgId: msgIdForLog, peerUserId, ..._errInfo(repairErr) });
          // Surface the ORIGINAL failure — the repair attempt was a
          // best-effort recovery, and its own error is logged above but
          // isn't more informative to the caller than the first one.
          throw firstErr;
        }
      }
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
  async function decryptEnvelope(envelope, peerUserId, isOwnMessage, msgIdForLog) {
    const identity = await ensureIdentity();
    if (!peerUserId) throw new Error('Message sender/recipient is missing');

    const selfContainedRaw = isOwnMessage ? envelope.rpk : envelope.spk;
    const historicalKeyId = isOwnMessage ? envelope.rkid : envelope.kid;
    _diagLog('V2_DECRYPT_START', {
      msgId: msgIdForLog, peerUserId, isOwnMessage,
      hasSelfContainedKey: !!selfContainedRaw, hasHistoricalKeyId: !!historicalKeyId,
    });

    const candidates = [];
    if (selfContainedRaw) candidates.push(['self_contained_envelope_key', () => identity.importPeerKey(selfContainedRaw)]);
    if (historicalKeyId) candidates.push(['historical_key_by_id', async () => {
      const historical = await identity.publicKeyForVersion(peerUserId, historicalKeyId);
      if (!historical) throw new Error('Historical key unavailable');
      return historical.key;
    }]);
    candidates.push(['currently_cached_key', async () => (await identity.publicKeyFor(peerUserId)).key]);
    candidates.push(['fresh_key_after_purge', async () => { identity.purgePublicKey?.(peerUserId); return (await identity.publicKeyFor(peerUserId, true)).key; }]);

    let lastErr = null;
    for (const [label, getKey] of candidates) {
      let peerKey;
      try { peerKey = await getKey(); } catch (_) { continue; }
      if (!peerKey) continue;
      try {
        const shared = await identity.deriveShared(peerKey);
        const key = await identity.hkdf(shared, pairContext(peerUserId));
        const plaintext = await identity.aesDecrypt(envelope, key, pairContext(peerUserId));
        _diagLog('V2_DECRYPT_SUCCESS', { msgId: msgIdForLog, peerUserId, keySource: label });
        return plaintext;
      } catch (err) {
        lastErr = err;
        _diagLog('V2_DECRYPT_CANDIDATE_FAILED', { msgId: msgIdForLog, peerUserId, keySource: label, ..._errInfo(err) });
      }
    }
    _diagLog('V2_DECRYPT_FAILED', { msgId: msgIdForLog, peerUserId, ..._errInfo(lastErr || new Error('Decryption failed')) });
    throw lastErr || new Error('Decryption failed');
  }

  // FIX (V3-DECRYPT-FALLBACK + DIAGNOSTIC, requested behavior): a Double
  // Ratchet (v3) message that fails to decrypt — e.g. a corrupted/out-of-
  // sync local ratchet session, cross-device divergence (see the
  // multi-device caveat above encryptForChatV3), or a proxy/relay bug that
  // mislabeled an older v2 payload's version field — used to have exactly
  // one decrypt attempt and no recovery path; the real cause was also
  // swallowed into a single generic "Decryption failed". Per explicit
  // product decision: on a v3 failure, ALSO attempt the legacy static-key
  // v2 scheme as a last-resort fallback (real encryption, just without
  // forward secrecy — the same "fail open to WEAKER encryption is
  // acceptable, fail open to NO encryption is not" rule already applied to
  // encryptForChat above). If the v2 fallback also fails (the normal case
  // for a genuinely v3-encrypted message — v3 and v2 use different key
  // material by design, so this is not expected to recover real Double
  // Ratchet ciphertext), the resulting error names BOTH failure reasons
  // instead of one opaque message, so the UI (see message.html's bubble
  // tooltip) and console can show exactly what was tried and why each
  // attempt failed, instead of just "🔒 Unable to decrypt this message"
  // with no further information.
  async function decryptFromChat(encContent, chatId, peerUserId, isOwnMessage, msgIdForLog) {
    const env = parseEnvelope(encContent);
    if (!env) return encContent;
    _diagLog('ENVELOPE_PARSED', { msgId: msgIdForLog, chatId, peerUserId, isOwnMessage, envVersion: env.v });
    if (env.v === 3) {
      let v3Err;
      try {
        return await decryptEnvelopeV3(env, peerUserId, isOwnMessage, msgIdForLog);
      } catch (err) {
        v3Err = err;
        _diagLog('V3_DECRYPT_UNRECOVERABLE', { msgId: msgIdForLog, chatId, peerUserId, ..._errInfo(err) });
      }
      // FIX (ALWAYS-ATTEMPT-V2-FALLBACK, requested behavior): this used to
      // skip the v2 fallback entirely whenever the envelope had no `spk`
      // field, on the reasoning that a genuine v3 envelope ({v:3, hdr, iv,
      // ct}) never carries `spk` — true, but that reasoning missed that
      // decryptEnvelope() (the v2 path) does NOT require `spk` to attempt
      // decryption: `spk`/`rpk` are only its fastest candidate (a
      // self-contained key with no lookup). When absent, it already falls
      // through to `currently_cached_key` and `fresh_key_after_purge` —
      // looking the peer's key up independently of the envelope — before
      // giving up (see the candidates list in decryptEnvelope() above). So
      // gating on `spk` was blocking the v2 fallback from EVER running for
      // any real v3-shaped message — exactly the messages this fallback
      // exists for — which is why messages that used to decrypt fine via
      // v2 before the v3 switchover stopped falling back at all. Always
      // attempt it now; decryptEnvelope() still fails cleanly (and cheaply
      // — AES-GCM auth fails fast) on ciphertext it genuinely can't open,
      // so this costs nothing extra when v2 truly cannot recover the
      // message, and now actually gets a chance to succeed when it can.
      try {
        const v2Plaintext = await decryptEnvelope(env, peerUserId, isOwnMessage, msgIdForLog);
        _diagLog('V2_FALLBACK_SUCCEEDED_AFTER_V3_FAILURE', { msgId: msgIdForLog, chatId, peerUserId });
        console.warn('[MessageE2E] v3 ratchet decrypt failed, but the v2 legacy fallback succeeded for this message. v3 failure was:', v3Err?.message || v3Err);
        return v2Plaintext;
      } catch (v2Err) {
        const v3Reason = v3Err?.message || String(v3Err || 'unknown error');
        const v2Reason = v2Err?.message || String(v2Err || 'unknown error');
        _diagLog('V2_FALLBACK_ALSO_FAILED', { msgId: msgIdForLog, chatId, peerUserId, v3Reason, v2Reason });
        const combined = new Error(`Double Ratchet (v3) decrypt failed: ${v3Reason} — legacy (v2) fallback also failed: ${v2Reason}`);
        combined.v3Reason = v3Reason;
        combined.v2Reason = v2Reason;
        throw combined;
      }
    }
    // env.v === 2 here (the only other shape parseEnvelope() accepts) — an
    // old-format message is routed to the v2 decryptor exclusively, never
    // through the v3 ratchet path.
    _diagLog('V2_DECRYPT_ROUTE', { msgId: msgIdForLog, chatId, peerUserId, isOwnMessage });
    return decryptEnvelope(env, peerUserId, isOwnMessage, msgIdForLog);
  }
  async function attempt(message, chatId, currentUserId, opts) {
    const peer = peerFor(message, currentUserId, opts?.activeConversation);
    if (!peer) throw new Error('Message peer is unavailable');
    const meId = currentUserId != null ? String(currentUserId) : me();
    const sender = message?.senderId != null ? String(message.senderId) : (message?.sender?.id != null ? String(message.sender.id) : null);
    const isOwnMessage = !!(sender && meId && sender === meId);
    return decryptFromChat(message.content, chatId, peer, isOwnMessage, messageId(message));
  }
  function notifyResolved(id, plaintext, entry) { decryptCache.set(id, plaintext); pending.delete(id); failed.delete(id); entry?.subscribers?.forEach(fn => { try { fn(plaintext); } catch (_) {} }); try { document.dispatchEvent(new CustomEvent('kyn:messageDecrypted', { detail: { messageId: id, chatId: entry?.chatId, plaintext } })); } catch (_) {} }
  function notifyFailed(id, error, entry) { pending.delete(id); failed.add(id); entry?.subscribers?.forEach(fn => { try { fn(null, error); } catch (_) {} }); try { document.dispatchEvent(new CustomEvent('kyn:messageDecryptFailed', { detail: { messageId: id, error: error?.message || String(error || 'Decryption failed') } })); } catch (_) {} }
  async function decryptMessageForDisplay(message, chatId, currentUserId, opts = {}) {
    _syncAccountState(); // must run before any cache lookup below — see _resetPerAccountState's comment
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