/**
 * settings-broadcast-listener.js
 * Included in every module iframe (messages, calls, friends, status, tools, group).
 * Listens for settings changes broadcast by settingsManager.js and applies them
 * to this page's DOM immediately — so theme/font/accent changes propagate instantly.
 */
(function () {
    'use strict';

    function applySettingsToDom(settings) {
        if (!settings) return;
        var root = document.documentElement;

        // ── Theme ──────────────────────────────────────────────────────────────
        var theme = (settings.appearance && settings.appearance.theme) ||
                    localStorage.getItem('kynecta_theme') || 'dark';
        root.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);
        if (theme === 'light') {
            root.classList.remove('dark-theme', 'auto-theme');
            root.classList.add('light-theme');
        } else if (theme === 'dark') {
            root.classList.remove('light-theme', 'auto-theme');
            root.classList.add('dark-theme');
        } else {
            root.classList.remove('light-theme', 'dark-theme');
            root.classList.add('auto-theme');
        }

        // ── Accent colour ──────────────────────────────────────────────────────
        var accent = settings.appearance && settings.appearance.accentColor;
        if (accent) root.style.setProperty('--accent-color', accent);

        // ── Font size ──────────────────────────────────────────────────────────
        var fsize = settings.appearance && settings.appearance.fontSize;
        if (fsize) {
            var sizeMap = { small: '13px', medium: '15px', large: '17px', 'x-large': '19px' };
            root.style.setProperty('--base-font-size', sizeMap[fsize] || fsize);
            document.body.style.fontSize = sizeMap[fsize] || fsize;
        }

        // ── Reduce motion ──────────────────────────────────────────────────────
        var rm = settings.appearance && settings.appearance.reduceMotion;
        if (rm === true) {
            var style = document.getElementById('_rmStyle') || document.createElement('style');
            style.id = '_rmStyle';
            style.textContent = '*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }';
            if (!style.parentNode) document.head.appendChild(style);
        } else {
            var existing = document.getElementById('_rmStyle');
            if (existing) existing.remove();
        }

        // ── Notification sound ─────────────────────────────────────────────────
        var notifSound = settings.notifications && settings.notifications.sound;
        if (typeof notifSound !== 'undefined') window.__settingsNotifSound = notifSound;

        // ── Privacy: read receipts ────────────────────────────────────────────
        var readReceipts = settings.privacy && settings.privacy.readReceipts;
        if (typeof readReceipts !== 'undefined') window.__settingsReadReceipts = readReceipts;

        // ── Privacy: online status ─────────────────────────────────────────────
        var onlineStatus = settings.privacy && settings.privacy.onlineStatus;
        if (typeof onlineStatus !== 'undefined') window.__settingsOnlineStatus = onlineStatus;

        // Store full settings for modules to read
        window.__cachedSettings = settings;

        // Notify any module-level listeners registered via window.onSettingsChange
        if (typeof window.onSettingsChange === 'function') {
            try { window.onSettingsChange(settings); } catch (_) {}
        }
        // Fire a DOM event for modules that prefer event listeners
        try {
            document.dispatchEvent(new CustomEvent('settingsUpdated', { detail: settings }));
        } catch (_) {}
    }

    function loadAndApply() {
        try {
            var raw = localStorage.getItem('knecta_settings_cache') ||
                      localStorage.getItem('app_settings') ||
                      localStorage.getItem('kynecta_settings');
            if (raw) applySettingsToDom(JSON.parse(raw));
        } catch (_) {}
    }

    // Apply immediately on load
    loadAndApply();

    // Listen via BroadcastChannel (same origin, works across iframes)
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            var bc = new BroadcastChannel('kynecta_settings');
            bc.onmessage = function (e) {
                if (e.data && e.data.type === 'SETTINGS_CHANGED') {
                    applySettingsToDom(e.data.settings);
                }
            };
        }
    } catch (_) {}

    // Fallback: storage event (cross-tab, same origin)
    window.addEventListener('storage', function (e) {
        if (e.key === 'kynecta_settings_broadcast' && e.newValue) {
            try {
                var d = JSON.parse(e.newValue);
                if (d && d.type === 'SETTINGS_CHANGED') applySettingsToDom(d.settings);
            } catch (_) {}
        }
        if ((e.key === 'knecta_settings_cache' || e.key === 'app_settings') && e.newValue) {
            try { applySettingsToDom(JSON.parse(e.newValue)); } catch (_) {}
        }
    });

    // Expose for manual calls
    window.__applyBroadcastSettings = applySettingsToDom;
})();
