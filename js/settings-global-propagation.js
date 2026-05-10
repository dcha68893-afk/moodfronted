/**
 * settings-global-propagation.js  — v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * GLOBAL PROPAGATION LAYER
 *
 * Responsibility
 * ──────────────
 * Every module (friends, calls, groups, status, chat, etc.) must react to
 * settings changes automatically.  This file:
 *   1. Subscribes ALL modules to window.AppSettings.
 *   2. Provides per-module applySettings() handlers.
 *   3. Bridges postMessage events so iframe modules receive updates.
 *   4. Keeps settingsManager / SettingsState / LocalStoreSettings in sync
 *      with AppSettings without double-firing.
 *
 * LOAD ORDER
 * ──────────
 *   AppSettings.js  →  settings-global-propagation.js  →  (module files)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    if (global.__SETTINGS_PROPAGATION__) return;
    global.__SETTINGS_PROPAGATION__ = true;

    function isDebugEnabled() {
        try {
            return global.__APP_SETTINGS_DEBUG__ === true
                || global.localStorage?.getItem('app_settings_debug') === '1';
        } catch (_) {
            return global.__APP_SETTINGS_DEBUG__ === true;
        }
    }

    function debugLog() {
        if (!isDebugEnabled()) return;
        console.log.apply(console, arguments);
    }

    function debugWarn() {
        if (!isDebugEnabled()) return;
        console.warn.apply(console, arguments);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    function _get(path)        { return global.AppSettings ? global.AppSettings.get(path) : undefined; }
    function _dom()            { return document.documentElement; }
    function _attr(k, v)       { try { _dom().setAttribute(k, String(v)); } catch (_) {} }
    function _cssVar(k, v)     { try { _dom().style.setProperty(k, v); } catch (_) {} }
    function _toggleClass(c,b) { try { _dom().classList.toggle(c, !!b); } catch (_) {} }

    // ─── Per-module application handlers ─────────────────────────────────────

    // ── Appearance / Theme ────────────────────────────────────────────────────
    function applyAppearanceSettings(app) {
        if (!app) return;
        const root = _dom();

        // Theme classes + CSS variables
        if (app.theme) {
            root.classList.remove('theme-light', 'theme-dark', 'theme-auto');
            root.classList.add('theme-' + app.theme);
            root.setAttribute('data-theme', app.theme);

            if (app.theme === 'dark') {
                _cssVar('--bg-color',        '#1a1a1a');
                _cssVar('--text-primary',    '#ffffff');
                _cssVar('--text-secondary',  '#b0b3b8');
                _cssVar('--card-bg',         '#242526');
                _cssVar('--border-color',    '#3e4042');
                _cssVar('--input-bg',        '#3a3b3c');
                _cssVar('--hover-bg',        '#2d2e2f');
            } else {
                _cssVar('--bg-color',        '#ffffff');
                _cssVar('--text-primary',    '#050505');
                _cssVar('--text-secondary',  '#65676b');
                _cssVar('--card-bg',         '#ffffff');
                _cssVar('--border-color',    '#dddfe2');
                _cssVar('--input-bg',        '#f0f2f5');
                _cssVar('--hover-bg',        '#f2f2f2');
            }

            // Notify iframe children
            _broadcastToFrames('THEME_CHANGED', { theme: app.theme });
        }

        if (app.accentColor) {
            _cssVar('--primary-color', app.accentColor);
            // Derive a darker shade for hover states
            _cssVar('--primary-dark', _shadeColor(app.accentColor, -20));
            try { localStorage.setItem('moodchat_accent_color', app.accentColor); } catch (_) {}
        }

        if (app.fontSize) {
            _cssVar('--base-font-size', app.fontSize + 'px');
            root.style.fontSize = app.fontSize + 'px';
        }

        if (app.language) {
            root.lang = app.language;
            _broadcastToFrames('LANGUAGE_CHANGED', { language: app.language });
            try {
                global.dispatchEvent(new CustomEvent('languageChanged', {
                    detail: { language: app.language }
                }));
            } catch (_) {}
        }

        if (app.reduceMotion !== undefined) {
            _toggleClass('reduce-motion', app.reduceMotion);
        }
    }

    // ── Notifications ─────────────────────────────────────────────────────────
    function applyNotificationSettings(notif) {
        if (!notif) return;
        const root = _dom();
        Object.entries(notif).forEach(([k, v]) => {
            if (typeof v === 'boolean' || typeof v === 'string') {
                root.setAttribute('data-notification-' + k, String(v));
            }
        });
        _toggleClass('do-not-disturb', !!notif.doNotDisturb);

        try {
            global.dispatchEvent(new CustomEvent('notificationSettingsApplied', {
                detail: { notifications: notif }
            }));
        } catch (_) {}

        if (notif.enabled === false || notif.notificationSound === false) {
            try {
                if (global._callerRingtone && typeof global._callerRingtone.pause === 'function') {
                    global._callerRingtone.pause();
                    global._callerRingtone = null;
                }
                if (global._incomingRingtone && typeof global._incomingRingtone.pause === 'function') {
                    global._incomingRingtone.pause();
                    global._incomingRingtone = null;
                }
            } catch (_) {}
        }
    }

    // ── Privacy ───────────────────────────────────────────────────────────────
    function applyPrivacySettings(privacy) {
        if (!privacy) return;
        const root = _dom();
        Object.entries(privacy).forEach(([k, v]) => {
            if (typeof v !== 'object') {
                root.setAttribute('data-privacy-' + k, String(v));
            }
        });

        // Dispatch event consumed by friends / contacts modules
        try {
            global.dispatchEvent(new CustomEvent('privacySettingsApplied', {
                detail: { privacy }
            }));
        } catch (_) {}
        _broadcastToFrames('PRIVACY_UPDATED', { privacy });
    }

    // ── Friends module ────────────────────────────────────────────────────────
    function applyFriendsSettings(settings) {
        const root = _dom();
        if (settings.privacy) {
            _attr('data-friends-who-can-add',   settings.privacy.whoCanAddMe || 'friendsOfFriends');
            _attr('data-friends-contact-disc',  String(settings.privacy.contactDiscovery !== false));
        }
        if (settings.friends) {
            _attr('data-friends-suggestions',   String(settings.friends.friendSuggestions !== false));
            _attr('data-friends-nearby',        String(!!settings.friends.nearbyDiscovery));
            _attr('data-friends-categories',    String(settings.friends.friendCategories !== false));
        }
        try {
            global.dispatchEvent(new CustomEvent('friendsSettingsApplied', {
                detail: {
                    privacy:  settings.privacy  || {},
                    friends:  settings.friends  || {}
                }
            }));
        } catch (_) {}
    }

    // ── Calls module ──────────────────────────────────────────────────────────
    function applyCallsSettings(callsCfg, privacyCfg) {
        if (!callsCfg) return;
        _attr('data-calls-who-can-call', callsCfg.whoCanCallMe || 'friends');
        _attr('data-calls-auto-reject',  String(!!callsCfg.autoReject));
        _attr('data-calls-auto-answer',  String(!!callsCfg.autoAnswer));
        _attr('data-calls-ringtone',     callsCfg.ringtone || 'default');
        _attr('data-calls-vibration',    String(callsCfg.callVibration !== false));
        _attr('data-calls-speaker-default', String(callsCfg.speakerDefault === true));
        _attr('data-calls-microphone-default', callsCfg.microphoneDefault || 'default');
        _attr('data-calls-noise-cancel', String(callsCfg.noiseCancellation !== false));
        _attr('data-calls-video-quality',callsCfg.videoQuality || 'auto');

        try {
            global.dispatchEvent(new CustomEvent('callsSettingsApplied', {
                detail: { calls: callsCfg, privacy: privacyCfg || {} }
            }));
        } catch (_) {}
    }

    // ── Groups module ─────────────────────────────────────────────────────────
    function applyGroupsSettings(groups, notif) {
        if (!groups) return;
        _attr('data-groups-invitations',  groups.groupInvitations  || 'friends');
        _attr('data-groups-privacy',      groups.groupPrivacy      || 'public');
        _attr('data-groups-announcements',String(groups.groupAnnouncements !== false));
        _attr('data-groups-approval',     String(!!groups.messageApproval));
        _attr('data-groups-spam',         String(groups.groupSpamDetection !== false));

        const groupNotif = notif ? notif.groupNotifications : true;
        _attr('data-groups-notifications', String(groupNotif !== false));

        try {
            global.dispatchEvent(new CustomEvent('groupsSettingsApplied', {
                detail: { groups, notifications: notif || {} }
            }));
        } catch (_) {}
    }

    // ── Status module ─────────────────────────────────────────────────────────
    function applyStatusSettings(status, privacy) {
        if (!status) return;
        _attr('data-status-visibility',     status.visibility || 'everyone');
        _attr('data-status-auto-download',  String(status.autoDownloadMedia !== false));
        _attr('data-status-mood-share',     String(!!status.moodAutoShare));

        // Who can see status (from privacy section too)
        const vis = (privacy && privacy.statusVisibility) || status.visibility || 'everyone';
        _attr('data-privacy-statusVisibility', vis);

        try {
            global.dispatchEvent(new CustomEvent('statusSettingsApplied', {
                detail: { status, privacy: privacy || {} }
            }));
        } catch (_) {}
    }

    // ── Chat module ───────────────────────────────────────────────────────────
    function applyChatSettings(chat) {
        if (!chat) return;
        _attr('data-chat-enter-sends',    String(!!chat.enterKeySends));
        _attr('data-chat-media-download', chat.mediaDownload || 'wifi');
        _attr('data-chat-disappearing',   chat.disappearingMessages || 'off');
        _attr('data-chat-font-size',      chat.fontSize || 'medium');
        _attr('data-chat-wallpaper',      chat.wallpaper || 'default');
        _attr('data-chat-bubble-style',   chat.bubbleStyle || 'default');
        _attr('data-chat-auto-download',  String(chat.autoDownloadMedia !== false));

        try {
            global.dispatchEvent(new CustomEvent('chatSettingsApplied', {
                detail: { chat }
            }));
        } catch (_) {}
    }

    // ─── Master applySettings — called on every change ────────────────────────
    function applySettings(settings) {
        if (!settings || typeof settings !== 'object') return;

        applyAppearanceSettings(settings.appearance);
        applyNotificationSettings(settings.notifications);
        applyPrivacySettings(settings.privacy);
        applyFriendsSettings(settings);
        applyCallsSettings(settings.calls, settings.privacy);
        applyGroupsSettings(settings.groups, settings.notifications);
        applyStatusSettings(settings.status, settings.privacy);
        applyChatSettings(settings.chat);
    }

    // ─── Broadcast to iframe children ─────────────────────────────────────────
    function _broadcastToFrames(type, data) {
        try {
            const frames = document.querySelectorAll('iframe');
            frames.forEach(f => {
                try {
                    f.contentWindow.postMessage({
                        type,
                        source: 'AppSettings',
                        ...data,
                        timestamp: Date.now()
                    }, '*');
                } catch (_) {}
            });
            // Also broadcast to parent if we're in an iframe
            if (global.parent && global.parent !== global) {
                global.parent.postMessage({
                    type: 'SETTINGS_GLOBAL_UPDATE',
                    source: 'AppSettings',
                    ...data,
                    timestamp: Date.now()
                }, '*');
            }
        } catch (_) {}
    }

    // ─── PostMessage listener — receive from parent/sibling iframes ───────────
    global.addEventListener('message', (evt) => {
        const d = evt.data || {};
        if (evt.source === global) return;

        // Parent broadcasting a full settings update
        if (d.type === 'SETTINGS_UPDATED' && d.settings) {
            global.AppSettings && global.AppSettings.merge(d.settings, { silent: false });
        }

        // Specific section update from parent (e.g. chat.html routing)
        if (d.type === 'SETTINGS_GLOBAL_UPDATE' && d.section && d.key !== undefined) {
            global.AppSettings && global.AppSettings.set(d.section + '.' + d.key, d.value);
        }

        if (d.type === 'THEME_CHANGED' && d.theme) {
            global.AppSettings && global.AppSettings.set('appearance.theme', d.theme);
        }
        if (d.type === 'LANGUAGE_CHANGED' && d.language) {
            global.AppSettings && global.AppSettings.set('appearance.language', d.language);
        }
    });

    // ─── Subscribe AppSettings — react to all changes ─────────────────────────
    function _hook() {
        const AS = global.AppSettings;
        if (!AS) {
            console.warn('[SettingsPropagation] AppSettings not found — retrying in 200ms');
            setTimeout(_hook, 200);
            return;
        }
        global.__SETTINGS_PROPAGATION_HOOKED__ = true;

        // Subscribe: called immediately with current settings AND on every future change
        AS.subscribe((settings, path, value) => {
            applySettings(settings);

            // For single-key updates, also fire SettingsState._applySettingGlobally if available
            if (path && path !== '*') {
                try {
                    const stateObj = global.__SETTINGS_STATE_OBJ__;
                    if (stateObj && typeof stateObj._applySettingGlobally === 'function') {
                        const parts = path.split('.');
                        stateObj._applySettingGlobally(parts[0], parts.slice(1).join('.') || parts[0], value);
                    }
                } catch (_) {}
            }
        });

        // Also listen for legacy SettingsState events
        global.addEventListener('settingsUpdated', (evt) => {
            if (evt.detail && evt.detail.settings) {
                AS.merge(evt.detail.settings);
            }
        });

        console.log('[SettingsPropagation] ✅ Hooked into AppSettings');
    }

    // ─── Wait for AppSettings to be ready ─────────────────────────────────────
    if (global.AppSettings) {
        _hook();
    } else {
        global.addEventListener('appSettingsReady', _hook, { once: true });
        // Hard fallback
        setTimeout(() => { if (!global.__SETTINGS_PROPAGATION_HOOKED__) _hook(); }, 500);
    }

    global.__SETTINGS_PROPAGATION_HOOKED__ = false;

    // ─── Utility ──────────────────────────────────────────────────────────────
    function _shadeColor(color, percent) {
        try {
            const hex = color.replace('#', '');
            const R = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(0,2),16)*(100+percent)/100)));
            const G = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(2,4),16)*(100+percent)/100)));
            const B = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(4,6),16)*(100+percent)/100)));
            return '#' + [R,G,B].map(n => n.toString(16).padStart(2,'0')).join('');
        } catch (_) { return color; }
    }

    // Expose applySettings globally so any module can call it directly
    global.applyAppSettings = applySettings;

    console.log('[SettingsPropagation] Module loaded');

})(typeof window !== 'undefined' ? window : global);
