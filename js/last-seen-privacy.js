/**
 * last-seen-privacy.js — Last seen & online status privacy controls
 *
 * Phase 1 feature: "Last seen" privacy controls
 *
 * - Extends existing lastSeen toggle (settings.html already has a checkbox)
 * - Adds three-way control: Everyone / Contacts / Nobody
 * - Applies to: last seen timestamp shown in chat headers and friend list
 * - Backend: stored in user_settings as privacy_last_seen
 * - When set to 'nobody': hides your last seen AND you can't see others'
 * - When set to 'contacts': only mutual friends see your last seen
 *
 * Wire-up: replaces the existing boolean `lastSeenToggle` checkbox with a
 * proper three-way selector. Backwards-compatible: boolean true → 'everyone'.
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'kyn_privacy_last_seen';
  const OPTIONS     = [
    { value: 'everyone', label: 'Everyone',  icon: 'fa-globe' },
    { value: 'contacts', label: 'Contacts',  icon: 'fa-user-friends' },
    { value: 'nobody',   label: 'Nobody',    icon: 'fa-eye-slash' },
  ];

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-last-seen-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-last-seen-styles';
    s.textContent = `
      .kyn-privacy-selector {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 4px 0;
      }
      .kyn-privacy-option {
        flex: 1; min-width: 80px;
        background: var(--kyn-bg-panel);
        border: 1.5px solid var(--border-color, rgba(255,255,255,0.08));
        border-radius: 10px;
        padding: 8px 6px;
        text-align: center;
        cursor: pointer;
        color: var(--kyn-text-muted);
        font-size: 12px;
        transition: border-color 0.15s, color 0.15s, background 0.15s;
        user-select: none;
      }
      .kyn-privacy-option i {
        display: block;
        font-size: 16px;
        margin-bottom: 4px;
      }
      .kyn-privacy-option.selected {
        border-color: var(--kyn-accent-primary);
        color: var(--kyn-accent-primary);
        background: rgba(124,58,237,0.1);
      }
      .kyn-privacy-note {
        font-size: 11px;
        color: var(--kyn-text-muted);
        margin-top: 6px;
        line-height: 1.4;
      }

      /* Hide last-seen timestamp in chat header when 'nobody' */
      body[data-last-seen-privacy="nobody"] .chat-last-seen,
      body[data-last-seen-privacy="nobody"] .user-last-seen,
      body[data-last-seen-privacy="nobody"] .friend-last-seen {
        display: none !important;
      }

      /* Mask others' last seen when privacy = nobody (reciprocal) */
      .last-seen-hidden::after {
        content: '';
        display: inline;
      }
      .last-seen-hidden .last-seen-value {
        display: none;
      }
      .last-seen-hidden::before {
        content: 'Last seen recently';
        color: var(--kyn-text-muted);
        font-size: inherit;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Load current value ─────────────────────────────────────────────────────
  function _getCurrent() {
    // Check local cache first
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached && OPTIONS.find(o => o.value === cached)) return cached;
    // Check settings state
    const settingsState = global.__settingsState || {};
    if (settingsState.privacy?.lastSeen) return settingsState.privacy.lastSeen;
    // Default
    return 'everyone';
  }

  // ── Save and apply ─────────────────────────────────────────────────────────
  async function _save(value) {
    localStorage.setItem(STORAGE_KEY, value);
    document.body.setAttribute('data-last-seen-privacy', value);

    // Persist to backend
    const apiBase = global.API_BASE_URL || '';
    const token   = localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
    try {
      await fetch(`${apiBase}/api/settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacy_last_seen: value }),
      });
    } catch (e) {
      console.warn('[LastSeenPrivacy] Failed to save:', e.message);
    }

    // Broadcast to other tabs/modules
    window.dispatchEvent(new CustomEvent('kyn:privacyChanged', {
      detail: { key: 'lastSeen', value }
    }));
  }

  // ── Upgrade existing boolean toggle in settings.html ──────────────────────
  function _upgradeSettingsUI() {
    const existing = document.getElementById('lastSeenToggle');
    if (!existing) return;
    if (existing._kynUpgraded) return;
    existing._kynUpgraded = true;

    const current = _getCurrent();

    // Hide the old checkbox, inject new selector next to it
    const wrapper = existing.closest('label') || existing.parentNode;
    existing.style.display = 'none';

    const container = document.createElement('div');
    container.innerHTML = `
      <div class="kyn-privacy-selector" id="kynLastSeenSelector">
        ${OPTIONS.map(o => `
          <div class="kyn-privacy-option ${o.value === current ? 'selected' : ''}"
               data-value="${o.value}" title="${o.label}">
            <i class="fas ${o.icon}"></i>
            ${o.label}
          </div>
        `).join('')}
      </div>
      <div class="kyn-privacy-note" id="kynLastSeenNote"></div>
    `;

    wrapper.parentNode.insertBefore(container, wrapper.nextSibling);
    _updateNote(current);

    container.querySelectorAll('.kyn-privacy-option').forEach(opt => {
      opt.addEventListener('click', () => {
        container.querySelectorAll('.kyn-privacy-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        const value = opt.dataset.value;
        _save(value);
        _updateNote(value);
        // Keep the hidden checkbox in sync (for existing settings-core.js code)
        existing.checked = value !== 'nobody';
      });
    });
  }

  function _updateNote(value) {
    const note = document.getElementById('kynLastSeenNote');
    if (!note) return;
    const notes = {
      everyone: 'Anyone can see when you were last online.',
      contacts: 'Only your contacts can see your last seen.',
      nobody:   'Nobody can see your last seen. You also won\'t see others\'.',
    };
    note.textContent = notes[value] || '';
  }

  // ── Apply privacy to last-seen elements in chat UI ─────────────────────────
  function _applyPrivacyToChatUI() {
    const current = _getCurrent();
    document.body.setAttribute('data-last-seen-privacy', current);

    // When privacy = 'nobody', also mask others' last seen (reciprocal rule, Signal/WhatsApp behaviour)
    if (current === 'nobody') {
      document.querySelectorAll('[data-last-seen]').forEach(el => {
        el.classList.add('last-seen-hidden');
      });
    } else {
      document.querySelectorAll('.last-seen-hidden').forEach(el => {
        el.classList.remove('last-seen-hidden');
      });
    }
  }

  // ── Format last-seen string respecting privacy setting ─────────────────────
  function formatLastSeen(timestamp, viewerIsContact = true) {
    const current = _getCurrent();
    if (current === 'nobody') return null; // don't show
    if (current === 'contacts' && !viewerIsContact) return null;
    if (!timestamp) return null;

    const diff = Date.now() - new Date(timestamp).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);

    if (mins < 1)    return 'online';
    if (mins < 60)   return `last seen ${mins}m ago`;
    if (hours < 24)  return `last seen ${hours}h ago`;
    if (days === 1)  return 'last seen yesterday';
    if (days < 7)    return `last seen ${days} days ago`;
    return 'last seen a while ago';
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    _injectStyles();
    _applyPrivacyToChatUI();

    // Upgrade settings page if open
    _upgradeSettingsUI();

    // Re-apply when settings page loads in iframe/SPA
    window.addEventListener('kyn:pageReady', () => {
      setTimeout(_upgradeSettingsUI, 300);
    });

    // Re-apply when chat list loads new contacts
    window.addEventListener('kyn:chatLoaded', _applyPrivacyToChatUI);

    global.kynLastSeenPrivacy = { formatLastSeen, getCurrent: _getCurrent, save: _save };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }

}(window));
