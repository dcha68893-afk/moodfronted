/**
 * groupEncryption.client.js — Sender Keys orchestration for group chats
 *
 * Wires js/e2e-encryption.js's group-encryption primitives (generateSenderKey,
 * encryptSenderKeyFor, decryptSenderKeyFrom, encryptGroupMessage,
 * decryptGroupMessage) into the actual group message send/receive path, and
 * talks to the backend src/routes/groupEncryption.js distribution API.
 *
 * Public API (window.KynectaGroupE2E):
 *   ensureSenderKey(groupId, memberUserIds)   — call before sending; generates
 *       +distributes a key if we don't have a current one yet for this group.
 *   encryptOutgoing(groupId, plaintext)       — encrypt a message we're sending.
 *   decryptIncoming(groupId, message)         — mutate message.content in
 *       place to plaintext, given message.senderId/keyGeneration/encrypted.
 *   rotateSenderKey(groupId, memberUserIds)   — force a fresh key + redistribute
 *       (called automatically on 'group:rotation_required').
 *
 * Local cache shape (one localStorage entry per group, AT-REST ENCRYPTED via
 * KynectaE2E.wrapForLocalStorage — see js/e2e-encryption.js):
 *   kyn_group_e2e_<groupId> = {
 *     myKey: { gen, rawB64Wrapped },                  // our own current key
 *     received: { [ownerUserId]: { gen, rawB64Wrapped } } // others' keys
 *   }
 */

'use strict';

(function (global) {
    const E2E = () => global.KynectaE2E;

    function storageKey(groupId) { return `kyn_group_e2e_${groupId}`; }

    function _loadCache(groupId) {
        try {
            const raw = localStorage.getItem(storageKey(groupId));
            return raw ? JSON.parse(raw) : { myKey: null, received: {} };
        } catch (_) {
            return { myKey: null, received: {} };
        }
    }

    function _saveCache(groupId, cache) {
        try { localStorage.setItem(storageKey(groupId), JSON.stringify(cache)); } catch (_) {}
    }

    // In-memory CryptoKey cache — localStorage only ever holds the wrapped
    // (encrypted-at-rest) bytes; imported CryptoKeys live here per session.
    const _liveKeys = new Map(); // `${groupId}:${ownerUserId}` -> { key, gen }  (used for OUR OWN current key only)

    // FIX-ROOT-CAUSE-GROUP-DECRYPT-STALE-GENERATION: received keys need one
    // entry PER GENERATION, not one slot per owner — see _persistReceivedKey
    // above for why. Separate map so this never interferes with the "my own
    // key" entries above, which correctly only ever need the current one.
    const _liveReceivedKeys = new Map(); // `${groupId}:${ownerUserId}:${gen}` -> { key, gen }

    function _liveKeyCacheKey(groupId, ownerUserId) { return `${groupId}:${ownerUserId}`; }
    function _liveReceivedKeyCacheKey(groupId, ownerUserId, gen) { return `${groupId}:${ownerUserId}:${gen}`; }

    async function _persistMyKey(groupId, gen, rawB64) {
        const wrapped = await E2E().wrapForLocalStorage(rawB64);
        const cache = _loadCache(groupId);
        cache.myKey = wrapped ? { gen, rawB64Wrapped: wrapped } : null;
        _saveCache(groupId, cache);
    }

    async function _persistReceivedKey(groupId, ownerUserId, gen, rawB64) {
        const wrapped = await E2E().wrapForLocalStorage(rawB64);
        if (!wrapped) return;
        const cache = _loadCache(groupId);
        if (!cache.received) cache.received = {};

        // FIX-ROOT-CAUSE-GROUP-DECRYPT-STALE-GENERATION: this used to be
        // `cache.received[ownerUserId] = { gen, rawB64Wrapped }` — a single
        // slot, overwritten every time a newer generation came in. A message
        // encrypted under generation N (still perfectly decryptable — this
        // device already fetched and cached that exact key once) would
        // permanently show "[Decryption failed]" the moment generation N+1
        // arrived and silently discarded it, e.g. right after any membership
        // change triggers a rotation while messages sent just before it are
        // still being delivered/rendered. Keep a small bounded history per
        // owner instead of a single entry, so an already-fetched generation
        // is never thrown away just because a newer one showed up.
        let history = cache.received[ownerUserId];
        if (!Array.isArray(history)) {
            // Upgrade older single-object cache shape in place, if present.
            history = history ? [history] : [];
        }
        history = history.filter(h => h.gen !== gen);
        history.push({ gen, rawB64Wrapped: wrapped });
        history.sort((a, b) => a.gen - b.gen);
        if (history.length > 5) history = history.slice(history.length - 5);
        cache.received[ownerUserId] = history;
        _saveCache(groupId, cache);
    }

    // Look up one exact generation's wrapped key for an owner from the
    // persisted history (companion to _persistReceivedKey's bounded array).
    async function _loadReceivedKeyGeneration(groupId, ownerUserId, gen) {
        const cache = _loadCache(groupId);
        let history = cache.received?.[ownerUserId];
        if (!history) return null;
        if (!Array.isArray(history)) history = [history]; // old single-object shape
        const match = history.find(h => h.gen === gen);
        if (!match) return null;
        try {
            const rawB64 = await E2E().unwrapFromLocalStorage(match.rawB64Wrapped);
            const key = await E2E().importSenderKey(rawB64);
            return { key, gen };
        } catch (_) {
            return null;
        }
    }

    // Fetch + decrypt every Sender Key distributed to us in this group, and
    // populate the in-memory live-key cache. Called on group open and on
    // 'group:sender_key_distributed' notifications.
    async function syncReceivedKeys(groupId) {
        if (!E2E()?.enabled) return;
        const baseUrl = global.__API_BASE_URL || global.API_BASE_URL || '';
        const token = localStorage.getItem('authToken') || localStorage.getItem('token') ||
                      sessionStorage.getItem('authToken') || sessionStorage.getItem('token') || '';

        let resp;
        try {
            resp = await fetch(`${baseUrl}/api/group-encryption/${groupId}/keys`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                credentials: 'include',
            });
        } catch (e) {
            console.warn('[GroupE2E] Failed to fetch sender keys:', e.message);
            return;
        }
        if (!resp.ok) return;

        const data = await resp.json();
        const keys = data?.data?.keys || [];

        for (const entry of keys) {
            const cacheKey = _liveReceivedKeyCacheKey(groupId, entry.ownerUserId, entry.keyGeneration);
            if (_liveReceivedKeys.has(cacheKey)) continue; // already have this exact generation cached

            try {
                const rawB64 = await E2E().decryptSenderKeyFrom(entry.encryptedSenderKey, entry.ownerUserId);
                const cryptoKey = await E2E().importSenderKey(rawB64);
                _liveReceivedKeys.set(cacheKey, { key: cryptoKey, gen: entry.keyGeneration });
                await _persistReceivedKey(groupId, entry.ownerUserId, entry.keyGeneration, rawB64);
            } catch (e) {
                console.warn(`[GroupE2E] Failed to decrypt sender key from owner ${entry.ownerUserId}:`, e.message);
            }
        }
    }

    // ── Member list lookup ──────────────────────────────────────────────────
    // FIX: there is no GroupCore.getGroupMembers() / member cache anywhere in
    // group-core.js to rely on — fetching directly from the backend's
    // existing GET /api/group-members/:groupId/members is the only reliable
    // source. Used both before sending (to know who to distribute a fresh
    // Sender Key to) and on a rotation-required notification.
    async function _fetchGroupMemberIds(groupId) {
        try {
            const baseUrl = global.__API_BASE_URL || global.API_BASE_URL || '';
            const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
            const resp = await fetch(`${baseUrl}/api/group-members/${groupId}/members`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                credentials: 'include',
            });
            if (!resp.ok) return [];
            const data = await resp.json();
            const members = data?.data?.members || data?.data || [];
            return members.map(m => m.userId || m.id).filter(Boolean);
        } catch (e) {
            console.warn('[GroupE2E] Failed to fetch group member list:', e.message);
            return [];
        }
    }

    // Generate a brand-new Sender Key for this group and distribute it to
    // every other current member via their existing 1:1 ECDH channel.
    async function _generateAndDistribute(groupId, memberUserIds) {
        const myUserId = global.GroupCore?.currentUser?.id || global.currentUserId;
        if (!memberUserIds || memberUserIds.length === 0) {
            memberUserIds = await _fetchGroupMemberIds(groupId);
        }
        const others = (memberUserIds || []).filter(id => String(id) !== String(myUserId));

        const { key, rawB64 } = await E2E().generateSenderKey();

        const distributions = [];
        for (const recipientUserId of others) {
            try {
                const encryptedSenderKey = await E2E().encryptSenderKeyFor(rawB64, recipientUserId);
                distributions.push({ recipientUserId, encryptedSenderKey });
            } catch (e) {
                // A member with no registered public key yet (hasn't logged in
                // since E2E was deployed) simply won't receive this generation —
                // they'll get it next time someone rotates, or fall back to
                // reading plaintext-marked messages only. Not fatal to the send.
                console.warn(`[GroupE2E] Could not wrap sender key for recipient ${recipientUserId}:`, e.message);
            }
        }

        // FIX-ROOT-CAUSE-GROUP-KEY-GENERATION-RACE: this used to GET
        // /my-generation first, compute "current + 1" locally, and send that
        // guess to /distribute. Two calls close together (two tabs/devices,
        // both sending a first message in a new group around the same
        // moment) could both read the same "current" value and guess the
        // same "next" number for genuinely different key material — nothing
        // caught that. /distribute now atomically claims the authoritative
        // generation number server-side and returns it; adopt THAT value
        // rather than guessing, so this device's local cache always matches
        // exactly what was actually persisted and distributed for this call.
        let assignedGen = null;
        if (distributions.length > 0) {
            try {
                const baseUrl = global.__API_BASE_URL || global.API_BASE_URL || '';
                const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
                const resp = await fetch(`${baseUrl}/api/group-encryption/${groupId}/distribute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    credentials: 'include',
                    body: JSON.stringify({ distributions }),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    assignedGen = data?.data?.keyGeneration ?? null;
                }
            } catch (e) {
                console.warn('[GroupE2E] Distribution request failed:', e.message);
            }
        }

        if (assignedGen == null) {
            // We couldn't confirm what generation number (if any) the server
            // assigned — most likely a solo group (no other members yet) or
            // a failed request. Do NOT cache a guessed number as if it were
            // real; the caller gets null back and the next send attempt will
            // retry cleanly instead of operating on an unconfirmed generation.
            if (others.length === 0) {
                // No one to distribute to yet (solo group) — gen 1 is safe
                // to use locally for our own messages; there's no recipient
                // whose cache could ever disagree with it.
                assignedGen = 1;
            } else {
                return null;
            }
        }

        _liveKeys.set(_liveKeyCacheKey(groupId, myUserId), { key, gen: assignedGen });
        await _persistMyKey(groupId, assignedGen, rawB64);
        return { key, gen: assignedGen };
    }

    // In-flight generate+distribute promises, keyed the same way as
    // _liveKeys. See ensureSenderKey below for why this exists.
    const _inFlightEnsure = new Map();

    // Ensure we have a usable Sender Key for sending in this group. Reuses
    // the cached one if present; generates+distributes a new one otherwise
    // (first time sending in this group, or after a rotation was required).
    // memberUserIds is optional — fetched automatically if omitted.
    async function ensureSenderKey(groupId, memberUserIds) {
        if (!E2E()?.enabled) return null;
        const myUserId = global.GroupCore?.currentUser?.id || global.currentUserId;
        const cacheKey = _liveKeyCacheKey(groupId, myUserId);

        if (_liveKeys.has(cacheKey)) return _liveKeys.get(cacheKey);

        // FIX-ROOT-CAUSE-GROUP-KEY-GENERATION-RACE: two calls to this
        // function close together (e.g. sending two messages back to back in
        // a brand new group chat, before the first generate+distribute round
        // trip — a few sequential network calls — has finished) would both
        // pass the cache check above while it's still empty, and each go on
        // to independently generate a DIFFERENT random key. Both would then
        // typically compute the same "next generation" number and distribute
        // under it; whichever distribution request reached the server last
        // would silently overwrite the other's rows for recipients, leaving
        // any message encrypted with the losing call's key — including any
        // message already sent from this very tab using it — permanently
        // undecryptable by everyone, despite being tagged with a generation
        // number that "should" be valid. Share one in-flight promise instead.
        if (_inFlightEnsure.has(cacheKey)) return _inFlightEnsure.get(cacheKey);

        const promise = (async () => {
            // Try loading our own previously-generated key from local storage first.
            const cache = _loadCache(groupId);
            if (cache.myKey) {
                try {
                    const rawB64 = await E2E().unwrapFromLocalStorage(cache.myKey.rawB64Wrapped);
                    const key = await E2E().importSenderKey(rawB64);
                    const entry = { key, gen: cache.myKey.gen };
                    _liveKeys.set(cacheKey, entry);
                    return entry;
                } catch (e) {
                    console.warn('[GroupE2E] Could not unwrap cached sender key, generating a new one:', e.message);
                }
            }

            let members = memberUserIds;
            if (!members || members.length === 0) {
                members = await _fetchGroupMemberIds(groupId);
            }
            return _generateAndDistribute(groupId, members);
        })();

        _inFlightEnsure.set(cacheKey, promise);
        try {
            return await promise;
        } finally {
            _inFlightEnsure.delete(cacheKey);
        }
    }

    async function rotateSenderKey(groupId, memberUserIds) {
        const result = await _generateAndDistribute(groupId, memberUserIds);
        if (!result) {
            console.warn(`[GroupE2E] Rotation for group ${groupId} did not complete — distribution failed; will retry on next send.`);
            return;
        }
        const { gen } = result;

        // Tell the server our previous-generation distribution rows are now
        // superseded, so GET /keys stops serving them to anyone.
        try {
            const baseUrl = global.__API_BASE_URL || global.API_BASE_URL || '';
            const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
            await fetch(`${baseUrl}/api/group-encryption/${groupId}/rotate-notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                credentials: 'include',
                body: JSON.stringify({ keyGeneration: gen }),
            });
        } catch (e) {
            console.warn('[GroupE2E] rotate-notify failed (non-fatal):', e.message);
        }
        console.log(`[GroupE2E] 🔑 Rotated sender key for group ${groupId} → generation ${gen}`);
    }

    async function encryptOutgoing(groupId, plaintext, memberUserIds) {
        if (!E2E()?.enabled) return { content: plaintext, encrypted: false };
        try {
            const { key, gen } = await ensureSenderKey(groupId, memberUserIds);
            const encContent = await E2E().encryptGroupMessage(plaintext, key, gen);
            return { content: encContent, encrypted: true, keyGeneration: gen };
        } catch (e) {
            console.warn('[GroupE2E] Encryption failed, sending as plaintext:', e.message);
            return { content: plaintext, encrypted: false };
        }
    }

    // Mutates `message.content` in place to the decrypted plaintext (or a
    // placeholder string on failure). Safe to call on already-plaintext
    // messages — does nothing if message.encrypted isn't true.
    async function decryptIncoming(groupId, message) {
        if (!message || !message.metadata?.encrypted) return message;
        if (!E2E()?.enabled) {
            message.content = '[Encrypted message — unlock your key to read]';
            return message;
        }

        const ownerUserId = message.senderId;
        const wantedGen = message.metadata.keyGeneration;
        const cacheKey = _liveReceivedKeyCacheKey(groupId, ownerUserId, wantedGen);

        let entry = _liveReceivedKeys.get(cacheKey);
        if (!entry) {
            await syncReceivedKeys(groupId); // pull any we're missing from the server
            entry = _liveReceivedKeys.get(cacheKey);
        }
        if (!entry) {
            // Server may only serve the current generation (rotate-notify
            // deprecates old distribution rows), but this device could well
            // have already fetched and locally saved this exact generation
            // earlier — before it was superseded. Check there before giving up.
            entry = await _loadReceivedKeyGeneration(groupId, ownerUserId, wantedGen);
            if (entry) _liveReceivedKeys.set(cacheKey, entry);
        }

        if (!entry) {
            message.content = '[Encrypted — sender key not available]';
            return message;
        }

        try {
            message.content = await E2E().decryptGroupMessage(message.content, entry.key);
        } catch (e) {
            message.content = '[Decryption failed]';
        }
        return message;
    }

    async function decryptIncomingBatch(groupId, messages) {
        if (!Array.isArray(messages) || messages.length === 0) return messages;
        await syncReceivedKeys(groupId); // one fetch for the whole batch, not per-message
        for (const m of messages) {
            await decryptIncoming(groupId, m);
        }
        return messages;
    }

    // ── Realtime rotation triggers ──────────────────────────────────────────
    function _attachRealtimeListeners() {
        if (!global.KynectaRealtime?.on) {
            return setTimeout(_attachRealtimeListeners, 500);
        }
        global.KynectaRealtime.on('group:rotation_required', async (payload) => {
            const groupId = payload?.groupId;
            if (!groupId) return;
            console.log(`[GroupE2E] Rotation required for group ${groupId} (reason: ${payload.reason})`);
            try {
                const memberUserIds = await _fetchGroupMemberIds(groupId);
                if (memberUserIds.length > 0) {
                    await rotateSenderKey(groupId, memberUserIds);
                }
            } catch (e) {
                console.warn('[GroupE2E] Auto-rotation failed:', e.message);
            }
        });
        global.KynectaRealtime.on('group:sender_key_distributed', async (payload) => {
            const groupId = payload?.groupId;
            if (!groupId) return;
            // Someone (re)distributed a key to us — pull it in so we can
            // decrypt their next message without a round-trip delay.
            await syncReceivedKeys(groupId).catch(() => {});
        });
    }
    _attachRealtimeListeners();

    global.KynectaGroupE2E = {
        ensureSenderKey,
        rotateSenderKey,
        encryptOutgoing,
        decryptIncoming,
        decryptIncomingBatch,
        syncReceivedKeys,
    };

    console.log('[KynectaGroupE2E] ✅ Loaded');

})(window);
