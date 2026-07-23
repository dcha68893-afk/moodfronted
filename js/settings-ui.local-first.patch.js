/**
 * settings-ui.local-first.patch.js  (v1.1 — fixed)
 * UI additions for local-first settings.
 *
 * FIXES in v1.1:
 *   ✅  _origUpdateSetting captured at definition time (not on first call),
 *       eliminating the init race condition where the override fires before
 *       the original is stored.
 *   ✅  _injectSyncRow searches ALL .section-body elements for the Advanced
 *       section by title match, rather than blindly taking the first one.
 *       Falls back to appending to the last section if no match.
 *   ✅  Sync badge only shown when syncEnabled === true (or during offline saves)
 *   ✅  Offline indicator is idempotent (safe to call multiple times)
 *
 * Load AFTER settings-ui.js.
 * Version: 1.1.0
 */

(function () {
    'use strict';

    if (window.__SETTINGS_UI_LOCAL_PATCH__) return;
    window.__SETTINGS_UI_LOCAL_PATCH__ = true;

    // ─── Capture originals immediately at definition time ─────────────────────────
    // FIXED: capture now, not lazily — eliminates the init race.
    const _origUpdateSetting = window.__updateSetting || null;

    // ─── Override __updateSetting ────────────────────────────────────────────────
    window.__updateSetting = async function localFirstUpdateSetting(section, key, value) {
        // 1. Save locally first — instant, offline-safe
        if (window.saveSettingsLocal) {
            window.saveSettingsLocal(section, key, value);
        }
        // 2. Delegate to original (server sync, SettingsState update, UI notification)
        if (typeof _origUpdateSetting === 'function') {
            return _origUpdateSetting(section, key, value);
        }
    };

    // ─── Sync Status Badge ────────────────────────────────────────────────────────
    const SYNC_LABELS = {
        idle:    { icon: '✓',  text: 'Saved',          color: 'var(--success-color, #34c759)' },
        synced:  { icon: '☁',  text: 'Synced',         color: 'var(--success-color, #34c759)' },
        pending: { icon: '⏳', text: 'Pending sync',   color: 'var(--warning-color, #ff9500)' },
        syncing: { icon: '↻',  text: 'Syncing…',       color: 'var(--primary-color, #0084ff)' },
        failed:  { icon: '⚠',  text: 'Sync failed',    color: 'var(--danger-color, #ff3b30)'  },
        offline: { icon: '📴', text: 'Offline',        color: 'var(--text-secondary, #666)'   },
    };

    let _badgeHideTimer = null;

    function _getSyncBadge() {
        let badge = document.getElementById('settingsSyncBadge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'settingsSyncBadge';
            badge.setAttribute('aria-live', 'polite');
            badge.style.cssText = [
                'display:none',
                'position:fixed',
                'bottom:24px',
                'right:24px',
                'padding:6px 14px',
                'border-radius:20px',
                'font-size:12px',
                'font-weight:500',
                'z-index:10001',
                'box-shadow:0 2px 8px rgba(0,0,0,.15)',
                'transition:opacity .3s,transform .3s',
                'pointer-events:none',
                'align-items:center',
                'gap:6px',
            ].join(';');
            document.body.appendChild(badge);
        }
        return badge;
    }

    function _showSyncStatus(state) {
        // Only show cloud-sync states when sync is enabled
        if (state !== 'idle') {
            const store = window.LocalStoreSettings;
            if (store) {
                const settings = store.getAll();
                if (!settings.syncEnabled) return;
            }
        }

        const label = SYNC_LABELS[state] || SYNC_LABELS.idle;
        const badge = _getSyncBadge();

        clearTimeout(_badgeHideTimer);
        badge.innerHTML = `<span>${label.icon}</span><span>${label.text}</span>`;
        badge.style.background = label.color;
        badge.style.color = '#fff';
        badge.style.display = 'flex';
        badge.style.opacity = '1';
        badge.style.transform = 'translateY(0)';

        if (state === 'synced' || state === 'idle') {
            _badgeHideTimer = setTimeout(() => {
                badge.style.opacity = '0';
                badge.style.transform = 'translateY(8px)';
                setTimeout(() => { badge.style.display = 'none'; }, 300);
            }, 3000);
        }
    }

    window.addEventListener('settingsSyncStatus', (e) => {
        if (e.detail && e.detail.state) _showSyncStatus(e.detail.state);
    });

    window.addEventListener('settingsSavedLocal', () => _showSyncStatus('idle'));

    // ─── Offline indicator in settings header ─────────────────────────────────────
    function _updateOfflineStatus() {
        const indicator = document.getElementById('settingsOfflineIndicator');
        if (indicator) indicator.style.display = navigator.onLine ? 'none' : 'flex';
    }

    window.addEventListener('online',  _updateOfflineStatus);
    window.addEventListener('offline', _updateOfflineStatus);

    function _injectOfflineIndicator() {
        if (document.getElementById('settingsOfflineIndicator')) return;
        const header = document.querySelector('.settings-header') ||
                       document.querySelector('.content-header');
        if (!header) return;

        const indicator = document.createElement('div');
        indicator.id = 'settingsOfflineIndicator';
        indicator.style.cssText = [
            'display:none',
            'align-items:center',
            'gap:6px',
            'font-size:11px',
            'padding:3px 10px',
            'background:rgba(255,149,0,.15)',
            'color:var(--warning-color,#ff9500)',
            'border-radius:12px',
            'margin-left:8px',
        ].join(';');
        indicator.textContent = '📴 Offline — changes saved locally';
        header.appendChild(indicator);
        _updateOfflineStatus();
    }

    // ─── Sync toggle row injection ────────────────────────────────────────────────
    /**
     * FIXED: find the Advanced section specifically by heading text,
     * not blindly by first .section-body.
     */
    function _injectSyncRow() {
        if (document.getElementById('syncEnabledToggle')) return;

        // Find the Advanced section's body by looking for its heading
        let targetBody = null;

        const headings = document.querySelectorAll('.section-header h3');
        headings.forEach(h => {
            const text = h.textContent.toLowerCase();
            if (text.includes('advanced') || text.includes('developer') || text.includes('connection')) {
                const section = h.closest('.settings-section');
                if (section) targetBody = section.querySelector('.section-body');
            }
        });

        // Fallback: last section body available
        if (!targetBody) {
            const allBodies = document.querySelectorAll('.settings-section .section-body');
            if (allBodies.length > 0) targetBody = allBodies[allBodies.length - 1];
        }

        if (!targetBody) return; // DOM not ready yet

        const store = window.LocalStoreSettings;
        const settings = store ? store.getAll() : {};
        const syncEnabled = settings.syncEnabled === true;

        const item = document.createElement('div');
        item.className = 'setting-item';
        item.id = 'syncToggleRow';
        item.innerHTML = `
            <div class="setting-info">
                <div class="setting-label">☁ Multi-Device Sync</div>
                <div class="setting-description">
                    Sync settings across devices (optional). App works fully offline without this.
                </div>
            </div>
            <div class="setting-control">
                <label class="toggle-switch">
                    <input type="checkbox" id="syncEnabledToggle"${syncEnabled ? ' checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
        `;
        targetBody.appendChild(item);

        const toggle = document.getElementById('syncEnabledToggle');
        if (toggle) {
            toggle.addEventListener('change', () => {
                window.__updateSetting('advanced', 'syncEnabled', toggle.checked);
            });
        }
    }

    // When sync toggled ON, run immediate sync
    window.addEventListener('settingsSavedLocal', (e) => {
        if (e.detail && e.detail.key === 'syncEnabled' && e.detail.value === true) {
            const sync = window.SettingsSyncEngine;
            if (sync) setTimeout(() => sync.syncOnLogin().catch(() => {}), 500);
        }
    });

    // ─── Boot ─────────────────────────────────────────────────────────────────────
    function _boot() {
        _injectOfflineIndicator();
        // Retry sync row injection — section may not be in DOM yet
        [500, 1500, 3000].forEach(ms => setTimeout(_injectSyncRow, ms));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _boot);
    } else {
        _boot();
    }

    // Re-inject on section changes
    window.addEventListener('settingsUIReady', () => setTimeout(_injectSyncRow, 300));
    window.addEventListener('settingsSectionLoaded', () => setTimeout(_injectSyncRow, 200));

    console.log('[settings-ui:patch] ✅ v1.1 applied');

})();