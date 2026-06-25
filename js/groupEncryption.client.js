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
    const _liveKeys = new Map(); // `${groupId}:${ownerUserId}` -> { key, gen }

    function _liveKeyCacheKey(groupId, ownerUserId) { return `${groupId}:${ownerUserId}`; }

    async function _persistMyKey(groupId, gen, rawB64) {
        const wrapped = await E2E().wrapForLocalStorage(rawB64);
        const cache = _loadCache(groupId);
        cache.myKey = wrapped ? { gen, rawB64Wrapped: wrapped } : null;
        _saveCache(groupId, cache);
    }

    async function _persistReceivedKey(groupId, ownerUserId, gen, rawB64) {
        const wrapped = await E2E().wrapForLocalStorage(rawB64);
        const cache = _loadCache(groupId);
        if (!cache.received) cache.received = {};
        if (wrapped) cache.received[ownerUserId] = { gen, rawB64Wrapped: wrapped };
        _saveCache(groupId, cache);
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
            const cacheKey = _liveKeyCacheKey(groupId, entry.ownerUserId);
            const existing = _liveKeys.get(cacheKey);
            if (existing && existing.gen >= entry.keyGeneration) continue; // already have this or newer

            try {
                const rawB64 = await E2E().decryptSenderKeyFrom(entry.encryptedSenderKey, entry.ownerUserId);
                const cryptoKey = await E2E().importSenderKey(rawB64);
                _liveKeys.set(cacheKey, { key: cryptoKey, gen: entry.keyGeneration });
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

        // Determine next generation number (server is authoritative for what
        // we've distributed before, in case localStorage was cleared).
        let nextGen = 1;
        try {
            const baseUrl = global.__API_BASE_URL || global.API_BASE_URL || '';
            const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
            const resp = await fetch(`${baseUrl}/api/group-encryption/${groupId}/my-generation`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                credentials: 'include',
            });
            if (resp.ok) {
                const data = await resp.json();
                nextGen = (data?.data?.currentGeneration || 0) + 1;
            }
        } catch (_) { /* fall back to gen 1 if the check fails */ }

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

        if (distributions.length > 0) {
            try {
                const baseUrl = global.__API_BASE_URL || global.API_BASE_URL || '';
                const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
                await fetch(`${baseUrl}/api/group-encryption/${groupId}/distribute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    credentials: 'include',
                    body: JSON.stringify({ keyGeneration: nextGen, distributions }),
                });
            } catch (e) {
                console.warn('[GroupE2E] Distribution request failed:', e.message);
            }
        }

        _liveKeys.set(_liveKeyCacheKey(groupId, myUserId), { key, gen: nextGen });
        await _persistMyKey(groupId, nextGen, rawB64);
        return { key, gen: nextGen };
    }

    // Ensure we have a usable Sender Key for sending in this group. Reuses
    // the cached one if present; generates+distributes a new one otherwise
    // (first time sending in this group, or after a rotation was required).
    // memberUserIds is optional — fetched automatically if omitted.
    async function ensureSenderKey(groupId, memberUserIds) {
        if (!E2E()?.enabled) return null;
        const myUserId = global.GroupCore?.currentUser?.id || global.currentUserId;
        const cacheKey = _liveKeyCacheKey(groupId, myUserId);

        if (_liveKeys.has(cacheKey)) return _liveKeys.get(cacheKey);

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

        if (!memberUserIds || memberUserIds.length === 0) {
            memberUserIds = await _fetchGroupMemberIds(groupId);
        }
        return _generateAndDistribute(groupId, memberUserIds);
    }

    async function rotateSenderKey(groupId, memberUserIds) {
        const { gen } = await _generateAndDistribute(groupId, memberUserIds);

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
        const cacheKey = _liveKeyCacheKey(groupId, ownerUserId);

        let entry = _liveKeys.get(cacheKey);
        if (!entry || entry.gen !== wantedGen) {
            await syncReceivedKeys(groupId); // pull any we're missing
            entry = _liveKeys.get(cacheKey);
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
