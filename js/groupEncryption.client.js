/**
 * js/groupEncryption.client.js
 *
 * ROOT-CAUSE FIX (GROUP-MESSAGES-SENT-PLAINTEXT): group.html posted
 * `content` straight to POST /messages with no encryption step at all, and
 * js/sealed-groups.js already called `global.KynectaGroupE2E?.rotateSenderKey`
 * on membership changes — a name that was never actually defined anywhere
 * in this codebase. js/e2e-encryption.js already ships every low-level
 * primitive needed (generateSenderKey / encryptSenderKeyFor /
 * decryptSenderKeyFrom / encryptGroupMessage / decryptGroupMessage) and the
 * backend (src/routes/groupEncryption.js + src/services/
 * groupEncryptionService.js) already implements key-version storage,
 * per-member envelope distribution, and automatic invalidation on
 * membership changes — but nothing on the client ever called any of it for
 * actual message content. This file is that missing wiring.
 *
 * MODEL (matches what's already on both sides of the wire):
 *   - A group has one shared symmetric "group key" per version. Whoever
 *     first notices no usable key exists (brand-new group, or a rotation
 *     the server already flagged after a membership change) generates a
 *     fresh AES-256-GCM key and wraps ONE COPY per current member using
 *     that member's registered 1:1 identity public key (ECDH + HKDF —
 *     exactly the mechanism js/e2e-encryption.js already uses for 1:1
 *     messages), then POSTs all those wrapped copies in a single /rotate
 *     call. The server only ever stores/returns ciphertext.
 *   - Everyone else fetches /group-encryption/:chatId/state, finds the
 *     envelope addressed to them, and unwraps it using the same ECDH
 *     shared secret (symmetric — computed the other direction).
 *   - Messages are encrypted with whichever group-key version is current
 *     and tag themselves with that version (`gen`), so a message encrypted
 *     just before a rotation can still be decrypted by anyone who held
 *     that version's key at the time.
 *
 * KNOWN LIMITATIONS (flagging explicitly rather than implying otherwise):
 *   - A member who has never unlocked their own 1:1 E2E identity (no
 *     registered public key yet) cannot be given a copy of the group key
 *     and simply won't be able to decrypt group messages until they do —
 *     same constraint 1:1 messaging already has.
 *   - Message search (`GET /messages/.../search`, ILIKE on `content`) will
 *     no longer find anything inside encrypted text, because the server
 *     never sees plaintext. This is the same inherent trade-off 1:1 chat
 *     already accepted; it is not a regression introduced here.
 *   - Attachment files themselves are still not covered (same caveat
 *     js/message-client.js already documents for 1:1 — only text content/
 *     captions are encrypted).
 */
(function (global) {
  'use strict';

  function api() {
    if (!global.KynectaE2E) throw new Error('Secure messaging core is not loaded');
    return global.KynectaE2E;
  }

  function apiBase() {
    return String(global.__getApiBase?.() || global.API_BASE_URL || '').replace(/\/$/, '');
  }

  function authToken() {
    return global.__kynToken || global.__accessToken ||
      global.AuthSessionManager?.getToken?.() || global.authToken ||
      localStorage.getItem('authToken') || localStorage.getItem('accessToken') ||
      localStorage.getItem('token') || '';
  }

  async function apiFetch(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    const t = authToken();
    if (t) headers.Authorization = 'Bearer ' + t;
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(apiBase() + path, Object.assign({}, opts, { headers }));
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.message || data.error || ('Request failed (' + res.status + ')'));
    return data;
  }

  function myUserId() {
    return Number(global._kynCurrentUserId || localStorage.getItem('userId') || localStorage.getItem('currentUserId') || 0);
  }

  // groupId -> { version, key (CryptoKey) }
  const _cache = new Map();
  // groupId -> in-flight ensureGroupKey() promise, so concurrent sends/
  // decrypts on the same group never race into duplicate rotations.
  const _inflight = new Map();

  function lsKey(groupId, version) {
    return 'kyn_group_key_v1_' + groupId + '_' + version;
  }

  async function persistKey(groupId, version, rawB64) {
    try {
      const wrapped = await api().wrapForLocalStorage(rawB64);
      if (wrapped) localStorage.setItem(lsKey(groupId, version), wrapped);
    } catch (_) { /* best-effort local cache only */ }
  }

  async function loadPersistedKey(groupId, version) {
    try {
      const wrapped = localStorage.getItem(lsKey(groupId, version));
      if (!wrapped) return null;
      const rawB64 = await api().unwrapFromLocalStorage(wrapped);
      return await api().importSenderKey(rawB64);
    } catch (_) { return null; }
  }

  async function waitForE2E(timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    const start = Date.now();
    while (!(global.KynectaE2E && global.KynectaE2E.enabled)) {
      if (Date.now() - start > timeoutMs) return false;
      await new Promise(function (r) { setTimeout(r, 150); });
    }
    return true;
  }

  function fetchState(groupId) {
    return apiFetch('/group-encryption/' + encodeURIComponent(groupId) + '/state').then(function (r) { return r.data; });
  }

  async function resolveCachedOrDecrypt(groupId, state) {
    const cached = _cache.get(groupId);
    if (cached && cached.version === state.version) return cached;

    const persisted = state.version > 0 ? await loadPersistedKey(groupId, state.version) : null;
    if (persisted) {
      const entry = { version: state.version, key: persisted };
      _cache.set(groupId, entry);
      return entry;
    }

    const myId = myUserId();
    const mine = Array.isArray(state.distributions)
      ? state.distributions.find(function (d) { return String(d.userId) === String(myId); })
      : null;
    if (!mine) return null;

    const ownerUserId = state.lastEvent && state.lastEvent.actorId != null ? state.lastEvent.actorId : null;
    if (ownerUserId == null) return null; // no known owner to derive the shared secret against

    const rawB64 = await api().decryptSenderKeyFrom(mine.ciphertext, ownerUserId);
    const key = await api().importSenderKey(rawB64);
    await persistKey(groupId, state.version, rawB64);
    const entry = { version: state.version, key: key };
    _cache.set(groupId, entry);
    return entry;
  }

  function extractMemberIds(group) {
    const list = Array.isArray(group && group.participants) ? group.participants : [];
    const ids = list.map(function (p) {
      const u = p.user || p;
      return Number(u.id != null ? u.id : p.userId);
    }).filter(function (n) { return Number.isInteger(n) && n > 0; });
    return Array.from(new Set(ids));
  }

  async function fetchGroupMembers(groupId) {
    try {
      const r = await apiFetch('/chats/' + encodeURIComponent(groupId));
      const chat = (r && r.data && (r.data.chat || r.data)) || null;
      return extractMemberIds(chat);
    } catch (_) { return []; }
  }

  async function rotate(groupId, memberIdsHint, state) {
    let memberIds = Array.isArray(memberIdsHint) && memberIdsHint.length
      ? memberIdsHint.slice()
      : await fetchGroupMembers(groupId);
    memberIds = Array.from(new Set(memberIds.map(Number).filter(function (n) { return Number.isInteger(n) && n > 0; })));
    if (!memberIds.length) throw new Error('Could not resolve this group\u2019s members to distribute a key to');

    const me = myUserId();
    if (!memberIds.includes(me)) memberIds.push(me);

    const generated = await api().generateSenderKey();
    const distributions = [];
    for (const memberId of memberIds) {
      try {
        const envelope = await api().encryptSenderKeyFor(generated.rawB64, memberId);
        distributions.push({ userId: memberId, deviceId: 'primary', ciphertext: envelope, algorithm: 'SenderKey-ECDH-P256-AES256GCM-v1' });
      } catch (err) {
        // A member with no registered 1:1 identity key can't be given a
        // copy yet — skip them rather than failing the whole rotation;
        // they'll be unable to decrypt until they unlock their own E2E.
        console.warn('[GroupE2E] could not wrap the group key for member', memberId, err && err.message);
      }
    }
    if (!distributions.some(function (d) { return d.userId === me; })) {
      throw new Error('Could not wrap the new group key for your own account \u2014 secure messaging may not be unlocked');
    }

    const version = Number((state && state.version) || 0) + 1;
    const result = await apiFetch('/group-encryption/' + encodeURIComponent(groupId) + '/rotate', {
      method: 'POST',
      body: JSON.stringify({
        version: version,
        algorithm: 'SenderKey-ECDH-P256-AES256GCM-v1',
        distributions: distributions,
        reason: (state && state.reason) || 'initial_key',
      }),
    }).then(function (r) { return r.data; });

    await persistKey(groupId, version, generated.rawB64);
    try {
      await apiFetch('/group-encryption/' + encodeURIComponent(groupId) + '/ack', {
        method: 'POST',
        body: JSON.stringify({ version: version, deviceId: 'primary' }),
      });
    } catch (_) { /* ack is best-effort */ }

    const entry = { version: (result && result.version) || version, key: generated.key };
    _cache.set(groupId, entry);
    return entry;
  }

  /**
   * Ensures the caller holds a usable key for groupId's CURRENT version,
   * generating and distributing a brand-new one if nobody has posted a
   * usable one yet (new group, or a membership-change rotation the server
   * already flagged). Concurrent callers for the same group share one
   * in-flight attempt instead of racing separate rotations.
   */
  function ensureGroupKey(groupId, memberIdsHint) {
    const gid = String(groupId);
    if (_inflight.has(gid)) return _inflight.get(gid);

    const p = (async function () {
      const ready = await waitForE2E();
      if (!ready) throw new Error('Secure messaging is not ready yet');

      let state = await fetchState(gid);
      let entry = await resolveCachedOrDecrypt(gid, state);
      if (entry) return entry;

      try {
        return await rotate(gid, memberIdsHint, state);
      } catch (err) {
        // Someone else won the race to rotate this exact version — re-fetch
        // and read what they distributed instead of erroring out.
        if (String((err && err.message) || '').indexOf('newer group key version') !== -1) {
          state = await fetchState(gid);
          entry = await resolveCachedOrDecrypt(gid, state);
          if (entry) return entry;
        }
        throw err;
      }
    })();

    _inflight.set(gid, p);
    return p.finally(function () { _inflight.delete(gid); });
  }

  async function encryptForGroup(groupId, plaintext, memberIdsHint) {
    const entry = await ensureGroupKey(groupId, memberIdsHint);
    return api().encryptGroupMessage(plaintext, entry.key, entry.version);
  }

  async function decryptForGroup(groupId, ciphertext, memberIdsHint) {
    if (!ciphertext || typeof ciphertext !== 'string') return ciphertext;
    let envelope;
    try { envelope = JSON.parse(ciphertext); } catch (_) { return ciphertext; } // not our envelope shape
    if (!envelope || envelope.v !== 1 || typeof envelope.gen !== 'number') return ciphertext;

    const gid = String(groupId);
    let entry = _cache.get(gid);
    if (!entry || entry.version !== envelope.gen) {
      const persisted = await loadPersistedKey(gid, envelope.gen);
      if (persisted) {
        entry = { version: envelope.gen, key: persisted };
      } else {
        try { entry = await ensureGroupKey(gid, memberIdsHint); } catch (_) { entry = null; }
        if (!entry || entry.version !== envelope.gen) {
          return '[Message encrypted with a group key version you no longer have]';
        }
      }
    }
    return api().decryptGroupMessage(ciphertext, entry.key);
  }

  /**
   * Forces a fresh rotation right away instead of waiting for the next
   * send/decrypt to lazily notice one is needed. js/sealed-groups.js calls
   * this after a member is removed (the backend has already invalidated
   * the previous version by then, via the ChatParticipant hooks in
   * src/models/ChatParticipant.js, so this mainly avoids leaving the
   * group's messages temporarily undecryptable until someone happens to
   * send or read one).
   */
  async function rotateSenderKey(groupId, memberIds) {
    const gid = String(groupId);
    _cache.delete(gid);
    return ensureGroupKey(gid, memberIds);
  }

  global.KynectaGroupE2E = {
    ensureGroupKey: ensureGroupKey,
    encryptForGroup: encryptForGroup,
    decryptForGroup: decryptForGroup,
    rotateSenderKey: rotateSenderKey,
  };

  console.log('[KynectaGroupE2E] \u2705 Loaded \u2014 group message encryption wired up');

})(window);