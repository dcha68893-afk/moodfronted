/**
 * safety-numbers.js — Key verification / Safety numbers screen for MoodChat
 *
 * Phase 3 feature: Safety numbers screen
 *
 * Shows a 60-digit fingerprint (12 groups of 5) derived from both users'
 * identity public keys — identical to Signal's approach. Users compare these
 * out-of-band (call, in person) to verify no MITM.
 *
 * Features:
 * - Opens from chat header (lock icon) or contact profile
 * - Displays both users' avatars + the 12-group fingerprint
 * - "Mark as verified" persists locally + syncs to backend
 * - QR code mode: encodes fingerprint for scanning
 * - Shows ⚠️ banner in chat if keys changed since last verification
 * - Verified contacts show a green shield in chat header
 *
 * Backend: GET /api/encryption/safety/:userId (already exists)
 * Storage: verification status in localStorage (kyn_verified_v1) +
 *          optional sync to /api/encryption/verify/:userId
 */

(function (global) {
  'use strict';

  const VERIFIED_KEY = 'kyn_key_verified_v1'; // localStorage: { userId → { verified, fingerprint, ts } }

  // ── Emoji fingerprint (visual layer on top of decimal groups) ───────────────
  // Maps digit pairs → emoji for easier visual comparison (optional display mode)
  const EMOJI_MAP = [
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
    '🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅',
    '🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌',
    '🐞','🐜','🦟','🦗','🕷','🐢','🐍','🦎','🦖','🦕',
    '🐙','🦑','🦐','🦀','🐡','🐠','🐟','🐬','🐳','🐋',
    '🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛',
    '🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🦙',
    '🐏','🐑','🐐','🦌','🐕','🐩','🦮','🐈','🐈‍⬛','🪶',
    '🐓','🦃','🦤','🦚','🦜','🦩','🦢','🦆','🐇','🦝',
    '🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿','🦔','🌵',
  ];

  function _decimalGroupsToEmoji(groups) {
    return groups.map(g => {
      const idx = parseInt(g, 10) % EMOJI_MAP.length;
      return EMOJI_MAP[idx];
    });
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-safety-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-safety-styles';
    s.textContent = `
      /* Chat header verified badge */
      #kynVerifiedBadge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: #22c55e;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 10px;
        background: rgba(34,197,94,0.1);
        border: 1px solid rgba(34,197,94,0.3);
        transition: background 0.15s;
      }
      #kynVerifiedBadge:hover { background: rgba(34,197,94,0.2); }
      #kynVerifiedBadge.unverified { color: var(--text-muted,#888); background: none; border-color: transparent; }
      #kynVerifiedBadge.key-changed { color: #ef4444; background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); }

      /* Key-changed warning banner in chat */
      #kynKeyChangedBanner {
        background: rgba(239,68,68,0.12);
        border: 1px solid rgba(239,68,68,0.3);
        border-radius: 10px;
        margin: 8px 12px;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: #ef4444;
        cursor: pointer;
      }
      #kynKeyChangedBanner i { font-size: 18px; flex-shrink: 0; }
      #kynKeyChangedBanner span { flex: 1; line-height: 1.4; }

      /* Safety numbers modal */
      #kynSafetyModal {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.75);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      #kynSafetyBox {
        background: var(--bg-primary, #141420);
        border-radius: 20px;
        width: 100%;
        max-width: 360px;
        max-height: 90vh;
        overflow-y: auto;
        padding: 24px 20px 28px;
        animation: safetyIn 0.22s ease;
      }
      @keyframes safetyIn {
        from { opacity:0; transform:scale(0.95) translateY(12px) }
        to   { opacity:1; transform:scale(1)    translateY(0) }
      }

      #kynSafetyBox .sn-header {
        text-align: center;
        margin-bottom: 20px;
      }
      #kynSafetyBox .sn-title {
        font-size: 17px;
        font-weight: 700;
        color: var(--text-primary, #fff);
        margin: 0 0 4px;
      }
      #kynSafetyBox .sn-subtitle {
        font-size: 12px;
        color: var(--text-muted, #888);
        line-height: 1.5;
      }

      .sn-avatars {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 12px;
        margin: 16px 0;
      }
      .sn-avatar {
        width: 52px; height: 52px;
        border-radius: 50%;
        background: var(--accent, #7c3aed);
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-weight: 700; font-size: 18px;
        flex-shrink: 0;
      }
      .sn-avatar-link { font-size: 20px; color: var(--text-muted, #666); }

      /* Fingerprint groups */
      .sn-fingerprint {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        margin: 16px 0;
      }
      .sn-group {
        background: var(--bg-secondary, #1e1e2e);
        border-radius: 8px;
        padding: 8px 4px;
        text-align: center;
        font-family: 'Courier New', monospace;
        font-size: 13px;
        font-weight: 700;
        color: var(--text-primary, #fff);
        letter-spacing: 1px;
        border: 1px solid var(--border-color, rgba(255,255,255,0.06));
      }
      .sn-group.emoji-mode {
        font-size: 22px;
        font-family: inherit;
        letter-spacing: 0;
      }

      /* Mode toggle */
      .sn-mode-toggle {
        text-align: center;
        margin-bottom: 12px;
      }
      .sn-mode-btn {
        background: none;
        border: 1px solid var(--border-color, rgba(255,255,255,0.1));
        border-radius: 20px;
        color: var(--text-muted, #888);
        font-size: 12px;
        padding: 4px 12px;
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
      }
      .sn-mode-btn:hover { color: var(--accent, #7c3aed); border-color: var(--accent, #7c3aed); }

      /* Instructions */
      .sn-instructions {
        background: rgba(124,58,237,0.08);
        border-radius: 10px;
        padding: 12px;
        font-size: 12px;
        color: var(--text-muted, #aaa);
        line-height: 1.5;
        margin: 12px 0;
        border: 1px solid rgba(124,58,237,0.2);
      }

      /* Verify / action buttons */
      .sn-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 16px;
      }
      .sn-verify-btn {
        padding: 12px;
        border-radius: 12px;
        border: none;
        background: var(--accent, #7c3aed);
        color: #fff;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity 0.15s;
      }
      .sn-verify-btn:hover { opacity: 0.85; }
      .sn-verify-btn.verified {
        background: rgba(34,197,94,0.15);
        color: #22c55e;
        border: 1px solid rgba(34,197,94,0.3);
      }
      .sn-close-btn {
        padding: 10px;
        border-radius: 12px;
        border: none;
        background: var(--bg-secondary, #1e1e2e);
        color: var(--text-muted, #888);
        font-size: 14px;
        cursor: pointer;
      }

      /* Verified status line */
      .sn-status-line {
        text-align: center;
        font-size: 12px;
        color: var(--text-muted, #888);
        margin-top: 8px;
      }
      .sn-status-line.ok { color: #22c55e; }
      .sn-status-line.warn { color: #ef4444; }
    `;
    document.head.appendChild(s);
  }

  // ── Verified state helpers ──────────────────────────────────────────────────
  function _getVerifiedMap() {
    try { return JSON.parse(localStorage.getItem(VERIFIED_KEY) || '{}'); } catch { return {}; }
  }

  function _saveVerifiedMap(map) {
    localStorage.setItem(VERIFIED_KEY, JSON.stringify(map));
  }

  function isVerified(userId) {
    const m = _getVerifiedMap();
    return m[String(userId)]?.verified === true;
  }

  function getVerifiedEntry(userId) {
    return _getVerifiedMap()[String(userId)] || null;
  }

  function _markVerified(userId, fingerprint) {
    const m = _getVerifiedMap();
    m[String(userId)] = { verified: true, fingerprint, ts: Date.now() };
    _saveVerifiedMap(m);
    // Async sync to backend (non-critical)
    _syncVerification(userId, fingerprint).catch(() => {});
  }

  function _markUnverified(userId) {
    const m = _getVerifiedMap();
    if (m[String(userId)]) {
      m[String(userId)].verified = false;
    }
    _saveVerifiedMap(m);
  }

  async function _syncVerification(userId, fingerprint) {
    const apiBase = global.API_BASE_URL || '';
    const token   = localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
    await fetch(`${apiBase}/api/encryption/verify/${userId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint }),
    });
  }

  // ── Fetch safety numbers from backend ──────────────────────────────────────
  async function fetchSafetyNumbers(userId) {
    const apiBase = global.API_BASE_URL || '';
    const token   = localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
    const res  = await fetch(`${apiBase}/api/encryption/safety/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.data; // { fingerprint: "XXXX XXXX...", hex: "..." }
  }

  // ── Key-changed detection ───────────────────────────────────────────────────
  async function checkForKeyChange(userId) {
    const entry = getVerifiedEntry(userId);
    if (!entry?.verified || !entry.fingerprint) return false;

    try {
      const fresh = await fetchSafetyNumbers(userId);
      if (!fresh?.fingerprint) return false;
      return fresh.fingerprint !== entry.fingerprint;
    } catch { return false; }
  }

  // ── Banner: key changed warning in chat ────────────────────────────────────
  async function injectKeyChangedBanner(container, userId, userName) {
    const changed = await checkForKeyChange(userId);
    if (!changed) return;

    const existing = container.querySelector('#kynKeyChangedBanner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'kynKeyChangedBanner';
    banner.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      <span><strong>${_esc(userName)}'s security key has changed.</strong>
      If you didn't expect this, their account may be compromised. Tap to verify.</span>
      <i class="fas fa-chevron-right"></i>
    `;
    banner.addEventListener('click', () => openSafetyNumbers(userId, userName));
    container.insertBefore(banner, container.firstChild);
  }

  // ── Header lock icon / verified badge ─────────────────────────────────────
  function injectVerifiedBadge(container, userId, userName) {
    if (document.getElementById('kynVerifiedBadge')) return;

    const badge = document.createElement('div');
    badge.id = 'kynVerifiedBadge';

    const verified = isVerified(userId);
    badge.className = `kynVerifiedBadge ${verified ? '' : 'unverified'}`;
    badge.innerHTML = verified
      ? '<i class="fas fa-shield-alt"></i> Verified'
      : '<i class="fas fa-lock"></i>';
    badge.title = verified ? 'Encryption verified — tap to view safety numbers' : 'Tap to verify encryption';
    badge.addEventListener('click', () => openSafetyNumbers(userId, userName));

    container.appendChild(badge);
  }

  // ── Main safety numbers modal ───────────────────────────────────────────────
  async function openSafetyNumbers(userId, userName) {
    const existing = document.getElementById('kynSafetyModal');
    if (existing) { existing.remove(); }

    // Show loading state
    const overlay = document.createElement('div');
    overlay.id = 'kynSafetyModal';
    overlay.innerHTML = `
      <div id="kynSafetyBox">
        <div class="sn-header">
          <div class="sn-title">Safety Numbers</div>
        </div>
        <div style="text-align:center;padding:32px;color:var(--text-muted,#888)">
          <i class="fas fa-circle-notch fa-spin" style="font-size:24px"></i>
          <div style="margin-top:12px;font-size:13px">Computing fingerprint…</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Fetch safety numbers
    let safetyData;
    try {
      safetyData = await fetchSafetyNumbers(userId);
    } catch (e) {
      overlay.querySelector('#kynSafetyBox').innerHTML = `
        <div style="text-align:center;padding:32px;color:#ef4444;font-size:13px">
          Failed to load safety numbers.<br><br>
          Make sure both you and ${_esc(userName)} have encryption enabled.
        </div>
        <button onclick="document.getElementById('kynSafetyModal').remove()"
          style="width:100%;padding:12px;border-radius:12px;border:none;
                 background:var(--bg-secondary,#1e1e2e);color:var(--text-muted,#888);
                 font-size:14px;cursor:pointer">Close</button>
      `;
      return;
    }

    if (!safetyData) {
      overlay.querySelector('#kynSafetyBox').innerHTML = `
        <div style="text-align:center;padding:24px;font-size:13px;color:var(--text-muted,#888)">
          <i class="fas fa-lock-open" style="font-size:32px;display:block;margin-bottom:12px"></i>
          ${_esc(userName)} hasn't enabled encryption yet.<br>
          Safety numbers require both users to have encryption active.
        </div>
        <button onclick="document.getElementById('kynSafetyModal').remove()"
          style="width:100%;padding:12px;border-radius:12px;border:none;
                 background:var(--bg-secondary,#1e1e2e);color:var(--text-muted,#888);
                 cursor:pointer">Close</button>
      `;
      return;
    }

    const { fingerprint, hex } = safetyData;
    const groups   = fingerprint.split(' ');
    const verified = isVerified(userId);
    const entry    = getVerifiedEntry(userId);
    const keyChanged = entry?.verified && entry.fingerprint && entry.fingerprint !== fingerprint;

    let emojiMode = false;
    const emojis  = _decimalGroupsToEmoji(groups);

    const myInitials  = (localStorage.getItem('username') || 'Me').slice(0, 2).toUpperCase();
    const theirInitials = (userName || '?').slice(0, 2).toUpperCase();

    function _renderFingerprint() {
      return groups.map((g, i) => `
        <div class="sn-group ${emojiMode ? 'emoji-mode' : ''}" title="Group ${i+1}: ${g}">
          ${emojiMode ? emojis[i] : g}
        </div>
      `).join('');
    }

    const box = overlay.querySelector('#kynSafetyBox');
    box.innerHTML = `
      <div class="sn-header">
        <div class="sn-title">Safety Numbers</div>
        <div class="sn-subtitle">with ${_esc(userName)}</div>
      </div>

      ${keyChanged ? `
        <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);
                    border-radius:10px;padding:10px 12px;margin-bottom:12px;
                    font-size:12px;color:#ef4444;line-height:1.5">
          ⚠️ <strong>${_esc(userName)}'s safety number has changed</strong> since you last verified.
          Verify again in person or by phone.
        </div>
      ` : ''}

      <div class="sn-avatars">
        <div class="sn-avatar">${myInitials}</div>
        <div class="sn-avatar-link"><i class="fas fa-link"></i></div>
        <div class="sn-avatar">${theirInitials}</div>
      </div>

      <div class="sn-mode-toggle">
        <button class="sn-mode-btn" id="kynSnModeBtn">
          Switch to ${emojiMode ? 'numbers' : 'emoji'} mode
        </button>
      </div>

      <div class="sn-fingerprint" id="kynSnGrid">
        ${_renderFingerprint()}
      </div>

      <div class="sn-instructions">
        <strong>To verify:</strong> call ${_esc(userName)} and compare these numbers out loud,
        or meet in person and tap "Mark as verified" together.
        If they don't match, someone may be intercepting your messages.
      </div>

      <div class="sn-status-line ${verified && !keyChanged ? 'ok' : (keyChanged ? 'warn' : '')}">
        ${verified && !keyChanged
          ? `<i class="fas fa-check-circle"></i> Verified on ${new Date(entry.ts).toLocaleDateString()}`
          : keyChanged
          ? '<i class="fas fa-exclamation-circle"></i> Key changed — re-verify required'
          : 'Not yet verified'
        }
      </div>

      <div class="sn-actions">
        <button class="sn-verify-btn ${verified && !keyChanged ? 'verified' : ''}" id="kynSnVerifyBtn">
          ${verified && !keyChanged
            ? '<i class="fas fa-check"></i> Verified'
            : 'Mark as Verified'
          }
        </button>
        <button class="sn-close-btn" id="kynSnCloseBtn">Close</button>
      </div>
    `;

    // Toggle emoji/number mode
    box.querySelector('#kynSnModeBtn').addEventListener('click', () => {
      emojiMode = !emojiMode;
      box.querySelector('#kynSnGrid').innerHTML = _renderFingerprint();
      box.querySelector('#kynSnModeBtn').textContent = `Switch to ${emojiMode ? 'numbers' : 'emoji'} mode`;
    });

    // Mark verified button
    const verifyBtn = box.querySelector('#kynSnVerifyBtn');
    verifyBtn.addEventListener('click', () => {
      if (verified && !keyChanged) {
        // Already verified — offer to unmark
        if (confirm('Remove verification for this contact?')) {
          _markUnverified(userId);
          overlay.remove();
          _refreshBadge(userId, userName);
        }
        return;
      }
      _markVerified(userId, fingerprint);
      verifyBtn.className = 'sn-verify-btn verified';
      verifyBtn.innerHTML = '<i class="fas fa-check"></i> Verified ✓';
      box.querySelector('.sn-status-line').className = 'sn-status-line ok';
      box.querySelector('.sn-status-line').innerHTML =
        `<i class="fas fa-check-circle"></i> Verified just now`;
      setTimeout(() => overlay.remove(), 1200);
      _refreshBadge(userId, userName);
    });

    box.querySelector('#kynSnCloseBtn').addEventListener('click', () => overlay.remove());
  }

  function _refreshBadge(userId, userName) {
    const badge = document.getElementById('kynVerifiedBadge');
    if (!badge) return;
    const v = isVerified(userId);
    badge.className = v ? 'kynVerifiedBadge' : 'kynVerifiedBadge unverified';
    badge.innerHTML = v ? '<i class="fas fa-shield-alt"></i> Verified' : '<i class="fas fa-lock"></i>';
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Init: inject lock icon into chat header when a DM loads ────────────────
  function _observeChatHeader() {
    const header = document.getElementById('chatHeader') ||
                   document.querySelector('.chat-header');
    if (!header) { setTimeout(_observeChatHeader, 800); return; }

    // Watch for chat changes (new conversation selected)
    const obs = new MutationObserver(() => {
      const nameEl  = header.querySelector('.chat-name, .contact-name, #chatName');
      const userId  = header.dataset.userId || header.querySelector('[data-user-id]')?.dataset.userId;
      if (nameEl && userId) {
        injectVerifiedBadge(header, userId, nameEl.textContent.trim());
      }
    });
    obs.observe(header, { childList: true, subtree: true, attributes: true });
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  global.kynSafetyNumbers = {
    openSafetyNumbers,
    isVerified,
    checkForKeyChange,
    injectVerifiedBadge,
    injectKeyChangedBanner,
    fetchSafetyNumbers,
  };

  function init() {
    _injectStyles();
    _observeChatHeader();
    window.addEventListener('kyn:chatLoaded', () => setTimeout(_observeChatHeader, 300));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }

}(window));
