/**
 * settings-broadcast-listener.js  v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Embedded in EVERY module iframe (messages, calls, status, group, friend,
 * tools). Receives settings changes from the parent/settingsManager and applies
 * them to this page instantly.
 *
 * Two delivery paths:
 *   1. BroadcastChannel('kynecta_settings') — instant, same-origin cross-iframe
 *   2. localStorage 'storage' event        — cross-tab fallback
 *
 * On first load it also bootstraps from 'knecta_settings_cache' so settings
 * are applied before the parent even sends SETTINGS_UPDATED.
 */
(function _settingsBroadcastListener() {
    'use strict';

    // ── Resolve theme from raw value ─────────────────────────────────────────
    // 'auto' removed app-wide. FIX: this used to default an unset/unrecognized
    // value to 'dark', which meant any iframe that received a settings object
    // without an explicit theme (e.g. a partial update) could silently flip to
    // dark. Defaults to 'light' now, matching every other module.
    function _resolveTheme(t) {
        return t === 'dark' ? 'dark' : 'light';
    }

    // ── Apply a full settings object to this iframe's DOM ────────────────────
    function applyFull(settings) {
        if (!settings || typeof settings !== 'object') return;
        var root = document.documentElement;
        var body = document.body;

        // — appearance —
        var ap = settings.appearance || {};
        if (ap.theme) {
            var th = _resolveTheme(ap.theme);
            root.setAttribute('data-theme', th);
            root.classList.toggle('theme-dark', th === 'dark');
            root.classList.toggle('dark-theme', th === 'dark');
            if (body) body.setAttribute('data-theme', th);
            try { localStorage.setItem('app_theme', th); } catch (_) {}

            // FIX (KYN-CRITICAL-VARS-STUCK-ON-LIVE-THEME-CHANGE): this page's own
            // early inline script sets --kyn-bg-root/--kyn-bg-chat/--kyn-bg-header/
            // --kyn-text-primary/--kyn-text-secondary/--kyn-border directly on
            // <html> at load, purely to avoid a first-paint flash before
            // theme.colors.css arrives over the network. Because those are
            // inline styles, they permanently beat theme.colors.css in the
            // cascade — including when a live SETTINGS_UPDATED arrives here
            // later. Without reapplying them on every live change too, this
            // iframe's header/root/chat colors would stay stuck on whatever
            // theme was active when the page first loaded, even as everything
            // else driven by theme.colors.css updated instantly.
            if (th === 'dark') {
                root.style.setProperty('--kyn-bg-root', '#0f172a');
                root.style.setProperty('--kyn-bg-chat', '#020617');
                root.style.setProperty('--kyn-bg-header', '#0f172a');
                root.style.setProperty('--kyn-text-primary', '#e5e7eb');
                root.style.setProperty('--kyn-text-secondary', '#9ca3af');
                root.style.setProperty('--kyn-border', '#374151');
            } else {
                root.style.setProperty('--kyn-bg-root', '#ffffff');
                root.style.setProperty('--kyn-bg-chat', '#efeae2');
                root.style.setProperty('--kyn-bg-header', '#f0f2f5');
                root.style.setProperty('--kyn-text-primary', '#111b21');
                root.style.setProperty('--kyn-text-secondary', '#667781');
                root.style.setProperty('--kyn-border', '#e9edef');
            }
        }
        if (ap.accentColor) root.style.setProperty('--accent-color', ap.accentColor);
        if (ap.fontSize) {
            // FIX: fontSize is always a numeric px value app-wide (12/14/16/18),
            // not a small/medium/large/x-large label. The old lookup never
            // matched a number and fell through to setting --base-font-size
            // with no unit at all (e.g. "16" instead of "16px"), which is
            // invalid CSS and silently no-opped every var(--base-font-size)
            // consumer.
            var fs = parseInt(ap.fontSize, 10);
            if (!fs || fs < 10 || fs > 28) fs = 16;
            root.style.setProperty('--base-font-size', fs + 'px');
            root.style.fontSize = fs + 'px';
            if (body) body.style.fontSize = fs + 'px';
            try { localStorage.setItem('app_font_size', String(fs)); } catch (_) {}
        }
        if (ap.compactMode !== undefined) {
            root.setAttribute('data-compact', ap.compactMode ? 'true' : 'false');
            if (body) body.classList.toggle('compact-mode', !!ap.compactMode);
        }
        if (ap.animationsEnabled !== undefined || ap.animations !== undefined) {
            var anim = ap.animationsEnabled !== undefined ? ap.animationsEnabled : ap.animations;
            root.setAttribute('data-animations', anim ? 'true' : 'false');
            if (body) body.classList.toggle('no-animations', !anim);
        }
        if (ap.reduceMotion !== undefined) {
            root.setAttribute('data-reduce-motion', ap.reduceMotion ? 'true' : 'false');
            if (body) body.classList.toggle('reduce-motion', !!ap.reduceMotion);
            var rmStyle = document.getElementById('__rmStyle');
            if (ap.reduceMotion) {
                if (!rmStyle) {
                    rmStyle = document.createElement('style');
                    rmStyle.id = '__rmStyle';
                    rmStyle.textContent = '*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }';
                    document.head.appendChild(rmStyle);
                }
            } else if (rmStyle) {
                rmStyle.remove();
            }
        }

        // — privacy —
        var pr = settings.privacy || {};
        if (pr.readReceipts !== undefined)     { window.__readReceiptsEnabled   = pr.readReceipts;     root.setAttribute('data-read-receipts', pr.readReceipts ? 'true' : 'false'); }
        if (pr.typingIndicators !== undefined) { window.__typingIndicatorsEnabled = pr.typingIndicators; root.setAttribute('data-typing-indicators', pr.typingIndicators ? 'true' : 'false'); }
        if (pr.onlineStatus !== undefined)     window.__showOnlineStatus = pr.onlineStatus;
        if (pr.lastSeen !== undefined)         window.__showLastSeen     = pr.lastSeen;

        // — notifications —
        var no = settings.notifications || {};
        if (no.soundEnabled !== undefined || no.notificationSound !== undefined)
            window.__notificationSoundEnabled = no.soundEnabled !== undefined ? no.soundEnabled : no.notificationSound;
        if (no.vibrationEnabled !== undefined) window.__vibrationEnabled = no.vibrationEnabled;
        if (no.messageNotifications !== undefined || no.enableNotifications !== undefined)
            window.__messageNotificationsEnabled = no.messageNotifications !== undefined ? no.messageNotifications : no.enableNotifications;
        if (no.groupNotifications !== undefined)   window.__groupNotificationsEnabled   = no.groupNotifications;
        if (no.callNotifications !== undefined)    window.__callNotificationsEnabled    = no.callNotifications;
        if (no.mentionNotifications !== undefined) window.__mentionNotificationsEnabled = no.mentionNotifications;
        if (no.desktopEnabled !== undefined)       window.__desktopNotificationsEnabled = no.desktopEnabled;

        // — chat —
        var ch = settings.chat || {};
        if (ch.enterToSend !== undefined || ch.enterKeySends !== undefined)
            window.__enterToSend = ch.enterToSend !== undefined ? ch.enterToSend : ch.enterKeySends;
        // FIX: 'fontSize' is the canonical AppSettings key (chat.fontSize); 'messageFontSize'
        // was the only key recognized here and AppSettings never sends it, so this branch
        // never actually ran from a real settings change.
        var chatFontSize = ch.fontSize !== undefined ? ch.fontSize : ch.messageFontSize;
        if (chatFontSize !== undefined) {
            var mfmap = { small: '13px', medium: '15px', large: '18px' };
            root.style.setProperty('--message-font-size', mfmap[chatFontSize] || '15px');
        }
        // FIX: 'autoDownloadMedia' is the canonical AppSettings key; the legacy alias
        // 'mediaAutoDownload' was never populated by AppSettings, so this flag — which
        // the messages module reads before auto-downloading media — was never set here.
        var autoDownload = ch.autoDownloadMedia !== undefined ? ch.autoDownloadMedia : ch.mediaAutoDownload;
        if (autoDownload !== undefined) {
            window.__mediaAutoDownload = autoDownload;
            root.setAttribute('data-chat-auto-download', autoDownload ? 'true' : 'false');
        }
        if (ch.wallpaper !== undefined) {
            window.__chatWallpaper = ch.wallpaper;
            root.setAttribute('data-chat-wallpaper', ch.wallpaper);
        }
        if (ch.bubbleStyle !== undefined) {
            window.__chatBubbleStyle = ch.bubbleStyle;
            root.setAttribute('data-chat-bubble-style', ch.bubbleStyle);
        }
        if (ch.showTimestamps !== undefined) { window.__showTimestamps = ch.showTimestamps; root.setAttribute('data-show-timestamps', ch.showTimestamps ? 'true' : 'false'); }
        if (ch.messagePreviews !== undefined) window.__messagePreviews = ch.messagePreviews;
        if (ch.allowReactions !== undefined)  { window.__allowReactions = ch.allowReactions; root.setAttribute('data-allow-reactions', ch.allowReactions ? 'true' : 'false'); }
        if (ch.showReadReceipts !== undefined) { window.__readReceiptsEnabled = ch.showReadReceipts; root.setAttribute('data-read-receipts', ch.showReadReceipts ? 'true' : 'false'); }

        // — calls —
        var ca = settings.calls || {};
        if (ca.ringtoneEnabled !== undefined) window.__ringtoneEnabled = ca.ringtoneEnabled;
        if (ca.callNotifications !== undefined) window.__callNotificationsEnabled = ca.callNotifications;
        if (ca.videoQuality !== undefined)    window.__videoQuality    = ca.videoQuality;
        if (ca.noiseCancellation !== undefined) window.__noiseCancellation = ca.noiseCancellation;
        if (ca.backgroundBlur !== undefined)  window.__backgroundBlur  = ca.backgroundBlur;

        // — advanced —
        var adv = settings.advanced || {};
        if (adv.developerMode !== undefined || adv.developerTools !== undefined)
            window.__developerMode = adv.developerMode !== undefined ? adv.developerMode : adv.developerTools;
        if (adv.debugLogging !== undefined || adv.debugMode !== undefined)
            window.__debugLogging = adv.debugLogging !== undefined ? adv.debugLogging : adv.debugMode;
        if (adv.performanceMode !== undefined) root.setAttribute('data-performance-mode', adv.performanceMode ? 'true' : 'false');
        if (adv.dataSaver !== undefined) window.__dataSaver = adv.dataSaver;
        if (adv.reduceMotion !== undefined) root.setAttribute('data-reduce-motion', adv.reduceMotion ? 'true' : 'false');

        // — mood —
        var mo = settings.mood || {};
        if (mo.currentMood !== undefined) { window.__currentMood = mo.currentMood; root.setAttribute('data-mood', mo.currentMood); }
        if (mo.autoMoodDetection !== undefined) window.__autoMoodDetection = mo.autoMoodDetection;
        if (mo.shareMoodStatus !== undefined)   window.__shareMoodStatus   = mo.shareMoodStatus;

        // — status —
        var st = settings.status || {};
        if (st.whoCanViewMyStatus !== undefined) window.__whoCanViewMyStatus = st.whoCanViewMyStatus;
        if (st.autoExpireStatus !== undefined)   window.__autoExpireStatus   = st.autoExpireStatus;
        if (st.allowStatusReplies !== undefined) window.__allowStatusReplies = st.allowStatusReplies;
        if (st.showStatusTo !== undefined)       window.__showStatusTo       = st.showStatusTo;

        // Store and notify
        window.__cachedSettings = settings;
        try { document.dispatchEvent(new CustomEvent('settingsUpdated', { detail: settings })); } catch (_) {}
        if (typeof window.onSettingsChange === 'function') { try { window.onSettingsChange(settings); } catch (_) {} }
    }

    // ── Apply a single key change ────────────────────────────────────────────
    function applySingle(section, key, value) {
        var patch = {};
        patch[section] = {};
        patch[section][key] = value;
        applyFull(patch);
    }

    // ── Bootstrap from localStorage on load ─────────────────────────────────
    function bootstrap() {
        try {
            var sources = [
                localStorage.getItem('knecta_settings_cache'),
                localStorage.getItem('kyn_app_settings'),
                localStorage.getItem('user_settings')
            ];
            for (var i = 0; i < sources.length; i++) {
                if (!sources[i]) continue;
                var parsed = JSON.parse(sources[i]);
                var s = (parsed && parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
                if (s && typeof s === 'object' && !Array.isArray(s) && Object.keys(s).length > 0) {
                    applyFull(s);
                    break;
                }
            }
        } catch (_) {}
    }

    // Run immediately
    bootstrap();

    // ── BroadcastChannel listener (legacy 'kynecta_settings' channel) ────────
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            var bc = new BroadcastChannel('kynecta_settings');
            bc.onmessage = function (e) {
                if (!e.data) return;
                if (e.data.type === 'SETTINGS_CHANGED' && e.data.settings) applyFull(e.data.settings);
                if (e.data.type === 'SETTING_CHANGED' && e.data.section && e.data.key !== undefined)
                    applySingle(e.data.section, e.data.key, e.data.value);
            };
        }
    } catch (_) {}

    // ── BroadcastChannel listener (REAL channel — AppSettings.js) ────────────
    // FIX: AppSettings.js is the actual source of truth and broadcasts on channel
    // 'app_settings_global' with shape {type:'set', path, value} or
    // {type:'merge', settings}. This listener previously only knew about the
    // legacy 'kynecta_settings' channel/shape above, which nothing writes to
    // during normal use — so pages relying solely on this file for real-time
    // updates never actually got any until the slower storage-event fallback
    // below fired. If window.AppSettings is also loaded on this page it will
    // already handle this channel itself; this listener stays useful as a
    // fallback for pages where AppSettings.js failed to load for any reason.
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            var bcReal = new BroadcastChannel('app_settings_global');
            bcReal.onmessage = function (e) {
                var msg = e.data;
                if (!msg || msg.source !== 'AppSettings') return;
                if (window.AppSettings) return; // AppSettings.js already applies this itself
                if (msg.type === 'set' && msg.path) {
                    var parts = String(msg.path).split('.');
                    applySingle(parts[0], parts.slice(1).join('.') || parts[0], msg.value);
                }
                if (msg.type === 'merge' && msg.settings) applyFull(msg.settings);
            };
        }
    } catch (_) {}

    // ── localStorage storage event (cross-tab fallback) ──────────────────────
    window.addEventListener('storage', function (e) {
        if (!e.newValue) return;
        try {
            if (e.key === 'kynecta_settings_broadcast') {
                var d = JSON.parse(e.newValue);
                if (d.type === 'SETTINGS_CHANGED' && d.settings) applyFull(d.settings);
                if (d.type === 'SETTING_CHANGED' && d.section && d.key !== undefined) applySingle(d.section, d.key, d.value);
            }
            if (e.key === 'knecta_settings_cache' || e.key === 'kyn_app_settings') {
                var p = JSON.parse(e.newValue);
                var s = (p && p.data) ? p.data : p;
                if (s && typeof s === 'object') applyFull(s);
            }
        } catch (_) {}
    });

    // Expose for manual calls
    window.__applyBroadcastSettings = applyFull;
    window.__applyBroadcastSetting  = applySingle;
    window.__bootstrapSettings      = bootstrap;
})();
