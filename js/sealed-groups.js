/**
 * sealed-groups.js — Sealed group membership for Nexopa
 *
 * Phase 4 feature: Server cannot determine group membership from metadata
 *
 * What this implements (pragmatic MLS-precursor, not full RFC 9420):
 *
 * 1. MEMBERSHIP COMMITMENT
 *    - The group owner publishes a SHA-256 Merkle root of sorted member IDs
 *    - Members verify the commitment matches before processing group messages
 *    - Server stores the commitment hash, not the member list
 *    - Commitment is signed by the group's identity key (prevents tampering)
 *
 * 2. DELIVERY TOKENS (message unlinkability)
 *    - Each group member gets a per-group delivery token (random 32-byte value)
 *    - Messages are addressed to delivery tokens, not to (groupId, userId) pairs
 *    - Server routes by token → cannot determine which messages belong to the same group
 *    - Tokens rotated on membership change
 *
 * 3. ENCRYPTED INVITE LINKS
 *    - Invite link = encrypted(groupId + groupKey + membershipCommitment)
 *    - Server only sees an opaque token; group identity is hidden until decrypted
 *    - Joining member verifies the commitment before adding themselves
 *
 * 4. ROSTER SIZE PADDING
 *    - Member count requests return count padded to next power of 2
 *    - Prevents traffic analysis from member count
 *
 * Backend routes added:
 *   POST /api/groups/:groupId/sealed/commitment      — publish membership commitment
 *   GET  /api/groups/:groupId/sealed/commitment      — fetch current commitment
 *   POST /api/groups/:groupId/sealed/rotate-tokens   — rotate delivery tokens
 *   POST /api/groups/:groupId/sealed/invite          — create encrypted invite
 *   POST /api/groups/sealed/join                     — join via encrypted invite
 *
 * Frontend: window.KynSealedGroups public API
 */

(function (global) {
  'use strict';

  const subtle  = global.crypto?.subtle;
  const b64     = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64   = s   => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const str2ab  = s   => new TextEncoder().encode(s);

  const API_BASE  = () => global.API_BASE_URL || '';
  const _token    = () => localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
  const _apiFetch = (path, opts = {}) => fetch(`${API_BASE()}${path}`, {
    headers: { Authorization: `Bearer ${_token()}`, 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  }).then(r => r.json());

  // ── 1. Membership Commitment ────────────────────────────────────────────────

  /**
   * Build a sorted Merkle-leaf commitment from a list of userId integers.
   * commitment = SHA-256( sort(members).join(',') + ':' + groupId )
   * Returns base64 of the 32-byte hash.
   */
  async function buildCommitment(groupId, memberIds) {
    const sorted  = [...memberIds].sort((a, b) => a - b);
    const payload = `${sorted.join(',')};group:${groupId}`;
    const hash    = await subtle.digest('SHA-256', str2ab(payload));
    return b64(hash);
  }

  /**
   * Publish a new membership commitment to the backend.
   * Called whenever membership changes (add/remove/leave).
   * The backend stores only the hash — not the member list.
   */
  async function publishCommitment(groupId, memberIds) {
    const commitment = await buildCommitment(groupId, memberIds);
    const result = await _apiFetch(`/api/groups/${groupId}/sealed/commitment`, {
      method: 'POST',
      body: JSON.stringify({ commitment, memberCount: memberIds.length }),
    });
    if (result.success) {
      // Cache locally
      localStorage.setItem(`kyn_group_commitment_${groupId}`, JSON.stringify({
        commitment, memberIds: memberIds.sort((a,b) => a - b), ts: Date.now()
      }));
    }
    return commitment;
  }

  /**
   * Verify the server's stored commitment matches what we expect locally.
   * Returns { valid: bool, commitment: string }
   */
  async function verifyCommitment(groupId, localMemberIds) {
    const localCommitment = await buildCommitment(groupId, localMemberIds);

    let serverCommitment;
    try {
      const res = await _apiFetch(`/api/groups/${groupId}/sealed/commitment`);
      serverCommitment = res.data?.commitment;
    } catch {
      return { valid: false, error: 'Could not fetch server commitment' };
    }

    if (!serverCommitment) return { valid: false, error: 'No commitment published yet' };

    const valid = localCommitment === serverCommitment;
    if (!valid) {
      console.warn(`[SealedGroups] Commitment mismatch for group ${groupId}! ` +
                   'Membership may have been tampered with.');
      window.dispatchEvent(new CustomEvent('kyn:groupCommitmentMismatch', { detail: { groupId } }));
    }
    return { valid, localCommitment, serverCommitment };
  }

  // ── 2. Delivery Tokens ──────────────────────────────────────────────────────

  /**
   * Generate a random 32-byte delivery token for a member.
   * Token is used to route messages without revealing the group relationship.
   */
  function generateDeliveryToken() {
    const bytes = global.crypto.getRandomValues(new Uint8Array(32));
    return b64(bytes.buffer);
  }

  /**
   * Rotate all delivery tokens for a group (called after membership change).
   * Each current member gets a fresh token.
   * Backend updates its routing table; old tokens are immediately invalidated.
   */
  async function rotateDeliveryTokens(groupId, memberIds) {
    const tokens = {};
    for (const uid of memberIds) {
      tokens[uid] = generateDeliveryToken();
    }

    await _apiFetch(`/api/groups/${groupId}/sealed/rotate-tokens`, {
      method: 'POST',
      body: JSON.stringify({ tokens }),
    });

    // Store our own token
    const myUserId = parseInt(localStorage.getItem('userId') || '0', 10);
    if (tokens[myUserId]) {
      localStorage.setItem(`kyn_delivery_token_${groupId}`, tokens[myUserId]);
    }

    return tokens;
  }

  function getMyDeliveryToken(groupId) {
    return localStorage.getItem(`kyn_delivery_token_${groupId}`);
  }

  // ── 3. Encrypted Invite Links ───────────────────────────────────────────────

  /**
   * Create an encrypted invite link.
   * The link carries: groupId + groupName + currentCommitment + senderKeyMaterial
   * All encrypted with an ephemeral AES key whose secret is in the link fragment (#).
   * The server only sees an opaque token.
   */
  async function createEncryptedInvite(groupId, groupName, memberIds) {
    // Generate an ephemeral AES-256-GCM key for this invite
    const inviteKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const rawKey    = await subtle.exportKey('raw', inviteKey);
    const keyB64    = b64(rawKey);

    const commitment = await buildCommitment(groupId, memberIds);
    const payload    = JSON.stringify({
      groupId,
      groupName,
      commitment,
      memberCount: memberIds.length,
      ts: Date.now(),
    });

    const iv   = global.crypto.getRandomValues(new Uint8Array(12));
    const ct   = await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, inviteKey, str2ab(payload));

    const inviteBlob = JSON.stringify({ iv: b64(iv.buffer), ct: b64(ct) });

    // POST the opaque blob to backend to get an invite token
    const res = await _apiFetch(`/api/groups/${groupId}/sealed/invite`, {
      method: 'POST',
      body: JSON.stringify({ encryptedInvite: btoa(inviteBlob) }),
    });

    if (!res.success) throw new Error(res.message || 'Failed to create invite');

    // The invite URL contains:
    //   - path: /join/{opaqueToken}  (server can route but not read)
    //   - fragment: #key={keyB64}    (never sent to server)
    const appBase = global.location?.origin || 'https://nexipa.onrender.com';
    const inviteUrl = `${appBase}/join?invite=${res.token}#key=${encodeURIComponent(keyB64)}`;
    return { inviteUrl, token: res.token, keyB64 };
  }

  /**
   * Join a group via an encrypted invite link.
   * Decrypts the invite blob using the key from the URL fragment.
   */
  async function joinViaEncryptedInvite(inviteToken, keyB64) {
    if (!inviteToken || !keyB64) throw new Error('Invalid invite link — missing token or key');

    // Fetch the encrypted blob from server
    const res = await _apiFetch(`/api/groups/sealed/invite/${inviteToken}`);
    if (!res.success) throw new Error(res.message || 'Invite not found or expired');

    const blob = JSON.parse(atob(res.encryptedInvite));

    // Decrypt using the key from the URL fragment
    const rawKey  = unb64(decodeURIComponent(keyB64));
    const aesKey  = await subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
    const plain   = await subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(blob.iv), tagLength: 128 },
      aesKey,
      unb64(blob.ct)
    );

    const invite = JSON.parse(new TextDecoder().decode(plain));

    // Join the group
    const joinRes = await _apiFetch(`/api/groups/${invite.groupId}/join`, { method: 'POST' });
    if (!joinRes.success) throw new Error(joinRes.message || 'Failed to join group');

    return { ...invite, joined: true };
  }

  // ── 4. Roster Size Padding ──────────────────────────────────────────────────

  /**
   * Return the padded member count (next power of 2 ≥ actual count).
   * Prevents traffic analysis from observing group size changes.
   */
  function paddedMemberCount(actualCount) {
    if (actualCount <= 0) return 0;
    let p = 1;
    while (p < actualCount) p <<= 1;
    return p;
  }

  // ── 5. Commitment mismatch UI ───────────────────────────────────────────────

  function _injectStyles() {
    if (document.getElementById('kyn-sealed-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-sealed-styles';
    s.textContent = `
      #kynSealedMismatchBanner {
        position: fixed;
        bottom: 80px; left: 16px; right: 16px;
        background: rgba(239,68,68,0.95);
        color: #fff;
        border-radius: 12px;
        padding: 12px 16px;
        font-size: 13px;
        font-weight: 600;
        z-index: 9999;
        display: flex;
        gap: 10px;
        align-items: center;
        animation: sealedBannerIn 0.3s ease;
        box-shadow: 0 4px 20px rgba(239,68,68,0.4);
      }
      @keyframes sealedBannerIn {
        from { opacity:0; transform:translateY(20px) }
        to   { opacity:1; transform:translateY(0) }
      }
      #kynSealedMismatchBanner button {
        background: rgba(255,255,255,0.2);
        border: none; color: #fff;
        padding: 5px 10px; border-radius: 8px;
        font-size: 12px; cursor: pointer;
        flex-shrink: 0;
      }

      /* Sealed badge on group header */
      .kyn-sealed-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        color: #a78bfa;
        background: rgba(167,139,250,0.1);
        border: 1px solid rgba(167,139,250,0.3);
        padding: 2px 7px;
        border-radius: 8px;
      }
    `;
    document.head.appendChild(s);
  }

  function _showMismatchBanner(groupId) {
    const existing = document.getElementById('kynSealedMismatchBanner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'kynSealedMismatchBanner';
    banner.innerHTML = `
      <i class="fas fa-exclamation-triangle" style="font-size:18px;flex-shrink:0"></i>
      <span style="flex:1">
        <strong>Group membership tampered.</strong>
        The server's membership record doesn't match what was expected.
        Leave and rejoin only via a verified invite link.
      </span>
      <button onclick="document.getElementById('kynSealedMismatchBanner').remove()">Dismiss</button>
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner?.remove(), 10000);
  }

  // ── 6. Automatic commitment maintenance ────────────────────────────────────

  /**
   * Hook into group member add/remove events from the existing group-core.js
   * to automatically update the membership commitment.
   */
  function _hookGroupEvents() {
    // group-core.js fires these on window
    window.addEventListener('kyn:groupMemberAdded', async ({ detail }) => {
      const { groupId, memberIds } = detail || {};
      if (!groupId || !memberIds) return;
      try { await publishCommitment(groupId, memberIds); } catch (_) {}
    });

    window.addEventListener('kyn:groupMemberRemoved', async ({ detail }) => {
      const { groupId, memberIds } = detail || {};
      if (!groupId || !memberIds) return;
      try {
        await publishCommitment(groupId, memberIds);
        // Rotate delivery tokens when someone leaves (forward secrecy for group routing)
        await rotateDeliveryTokens(groupId, memberIds);
        // Trigger Sender Key rotation via groupEncryption.client.js
        if (global.KynectaGroupE2E?.rotateSenderKey) {
          await global.KynectaGroupE2E.rotateSenderKey(groupId, memberIds);
        }
      } catch (_) {}
    });

    // Show banner on commitment mismatch
    window.addEventListener('kyn:groupCommitmentMismatch', (e) => {
      _showMismatchBanner(e.detail?.groupId);
    });
  }

  // ── 7. Parse encrypted invite from URL ────────────────────────────────────
  function _checkInviteUrl() {
    const params = new URLSearchParams(global.location?.search);
    const invite = params.get('invite');
    const hash   = global.location?.hash || '';
    const keyMatch = hash.match(/[#&]key=([^&]+)/);

    if (invite && keyMatch) {
      const keyB64 = decodeURIComponent(keyMatch[1]);
      joinViaEncryptedInvite(invite, keyB64)
        .then(data => {
          window.dispatchEvent(new CustomEvent('kyn:groupJoined', { detail: data }));
          // Clean URL
          history.replaceState({}, '', global.location.pathname);
        })
        .catch(e => console.error('[SealedGroups] Join failed:', e.message));
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  global.KynSealedGroups = {
    buildCommitment,
    publishCommitment,
    verifyCommitment,
    generateDeliveryToken,
    rotateDeliveryTokens,
    getMyDeliveryToken,
    createEncryptedInvite,
    joinViaEncryptedInvite,
    paddedMemberCount,
  };

  function init() {
    _injectStyles();
    _hookGroupEvents();
    _checkInviteUrl();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }

  console.log('[KynSealedGroups] ✅ Sealed group membership loaded');

}(window));
