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
            // Paint + persist now go through the single canonical engine
            // (js/theme.engine.js / window.ThemeManager) instead of this
            // listener keeping its own copy.
            var th = window.ThemeManager ? window.ThemeManager.setTheme(ap.theme) : _resolveTheme(ap.theme);
            if (!window.ThemeManager) {
                root.setAttribute('data-theme', th);
                root.classList.toggle('theme-dark', th === 'dark');
                root.classList.toggle('dark-theme', th === 'dark');
                if (body) body.setAttribute('data-theme', th);
                try { (window.ThemeManager ? window.ThemeManager.setTheme(th) : localStorage.setItem('app_theme', th)); } catch (_) {}

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
            } else if (body) {
                body.setAttribute('data-theme', th);
            }
        }
        if (ap.accentColor) {
            if (window.ThemeManager) window.ThemeManager.setAccentColor(ap.accentColor);
            root.style.setProperty('--accent-color', ap.accentColor);
        }
        if (ap.fontSize) {
            if (window.ThemeManager) {
                window.ThemeManager.setFontSize(ap.fontSize);
                if (body) body.style.fontSize = window.ThemeManager.getFontSize() + 'px';
            } else {
                var fs = parseInt(ap.fontSize, 10);
                if (!fs || fs < 10 || fs > 28) fs = 16;
                root.style.setProperty('--base-font-size', fs + 'px');
                root.style.fontSize = fs + 'px';
                if (body) body.style.fontSize = fs + 'px';
                try { localStorage.setItem('app_font_size', String(fs)); } catch (_) {}
            }
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
        // FIX (WALLPAPER-NOT-FUNCTIONING): messages.css already reads
        // `background-image: var(--chat-background)` on .messages-container,
        // but nothing ever set that CSS variable — only a `data-chat-wallpaper`
        // attribute nobody read. That's why "Change Wallpaper" had no visible
        // effect even after the picker below saves a real value. Now both a
        // preset name (ch.wallpaper) and/or a custom uploaded image data URL
        // (ch.wallpaperImage) are translated into an actual --chat-background
        // value, so .messages-container (which already fills the chat area
        // from just below the header to just above the input bar via
        // flex:1) renders it edge-to-edge.
        if (ch.wallpaper !== undefined || ch.wallpaperImage !== undefined) {
            var WALLPAPER_PRESETS = {
                'default': null,
                'solid-light': 'linear-gradient(#f0f2f5, #f0f2f5)',
                'solid-dark': 'linear-gradient(#0b141a, #0b141a)',
                'ocean': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                'sunset': 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
                'forest': 'linear-gradient(135deg, #56ab2f 0%, #a8e063 100%)',
                'doodle': 'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2780%27 height=%2780%27><g fill=%27%23ffffff%27 fill-opacity=%270.06%27><circle cx=%2712%27 cy=%2712%27 r=%272%27/><circle cx=%2748%27 cy=%2732%27 r=%272%27/><circle cx=%2724%27 cy=%2760%27 r=%272%27/><circle cx=%2764%27 cy=%2764%27 r=%272%27/></g></svg>")'
            };
            var effectiveKey = ch.wallpaperImage ? 'custom' : (ch.wallpaper || 'default');
            window.__chatWallpaper = effectiveKey;
            root.setAttribute('data-chat-wallpaper', effectiveKey);
            var bgValue = 'none';
            var bgSize = 'cover';
            var bgRepeat = 'no-repeat';
            if (ch.wallpaperImage) {
                bgValue = 'url("' + ch.wallpaperImage + '")';
                bgSize = 'cover';
                bgRepeat = 'no-repeat';
            } else if (ch.wallpaper && WALLPAPER_PRESETS[ch.wallpaper]) {
                bgValue = WALLPAPER_PRESETS[ch.wallpaper];
                bgSize = ch.wallpaper === 'doodle' ? '80px 80px' : 'cover';
                bgRepeat = ch.wallpaper === 'doodle' ? 'repeat' : 'no-repeat';
            }
            root.style.setProperty('--chat-background', bgValue);
            root.style.setProperty('--chat-background-size', bgSize);
            root.style.setProperty('--chat-background-repeat', bgRepeat);
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

        // — groups —
        // FIX (missing section — Groups had no working propagation path at all):
        // every other section here (privacy, notifications, chat, calls, status)
        // exposes window.__ globals that the corresponding module actually reads
        // (confirmed by grepping friend-core.ui-bridge.js, status-ui.js, calls-ui.js,
        // etc. for these exact variable names). The "groups" section of AppSettings
        // had no equivalent here, and group-core-bootstrap.js / group-core-operations.js /
        // group-core-bridge.js / group-ui.js / group-ui-patch.js / group-core-patch.js
        // don't reference data-groups-* attributes or any groups-settings event either
        // — so groupInvitations/groupPrivacy/messageApproval/etc. from the Settings page
        // reached this iframe's DOM (via settings-global-propagation.js /
        // settings-module-subscriptions.js's data-groups-* attributes) but were never
        // actually usable by group feature code in any form. This block brings Groups
        // up to parity with every other module by exposing the same values as window.__
        // globals, following the exact naming/shape convention already used below for
        // status. Actually gating group-creation defaults / invite UI / message-approval
        // enforcement on these is a product decision for the group module itself to make
        // (not guessed at here) — this only makes the settings values available to read.
        var gr = settings.groups || {};
        if (gr.groupInvitations !== undefined)    window.__groupInvitations = gr.groupInvitations;
        if (gr.groupPrivacy !== undefined)        window.__groupPrivacyDefault = gr.groupPrivacy;
        if (gr.groupAnnouncements !== undefined)  window.__groupAnnouncementsEnabled = gr.groupAnnouncements;
        if (gr.messageApproval !== undefined)     window.__groupMessageApprovalDefault = gr.messageApproval;
        if (gr.groupSpamDetection !== undefined)  window.__groupSpamDetectionEnabled = gr.groupSpamDetection;
        if (gr.memberWarnings !== undefined)      window.__groupMemberWarningsEnabled = gr.memberWarnings;
        if (gr.keywordFiltering !== undefined)    window.__groupKeywordFilteringEnabled = gr.keywordFiltering;
        if (gr.groupMediaDownload !== undefined)  window.__groupMediaAutoDownload = gr.groupMediaDownload;

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