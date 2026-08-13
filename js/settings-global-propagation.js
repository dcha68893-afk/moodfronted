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

        // Theme classes + CSS variables. 'auto' removed app-wide.
        // FIX: this used to paint its own private #1a1a1a dark palette,
        // different from the #0f172a palette every other module uses
        // (theme.colors.css, AppSettings.js, settings-core.js) — yet another
        // competing color set contributing to the theme "sparking" bug.
        // Now uses the same values as everywhere else.
        // Theme classes + CSS variables + persistence now go through the
        // single canonical engine (js/theme.engine.js / window.ThemeManager)
        // instead of this function keeping its own copy — this was yet
        // another private #1a1a1a-style dark palette competing with the
        // others, and one of the sources of the theme "sparking" bug.
        // The _broadcastToFrames() postMessage relay below is a distinct,
        // still-needed mechanism (cross-frame settings sync over
        // postMessage, separate from ThemeManager's same-origin
        // contentDocument CSS injection) and is kept as-is.
        if (app.theme) {
            const theme = global.ThemeManager ? global.ThemeManager.setTheme(app.theme) : (app.theme === 'dark' ? 'dark' : 'light');
            if (!global.ThemeManager) {
                root.classList.remove('theme-light', 'theme-dark', 'theme-auto');
                root.classList.add('theme-' + theme);
                root.classList.toggle('dark-theme', theme === 'dark');
                root.setAttribute('data-theme', theme);
                try { (window.ThemeManager ? window.ThemeManager.setTheme(theme) : localStorage.setItem('app_theme', theme)); } catch (_) {}

                if (theme === 'dark') {
                    _cssVar('--bg-color',        '#0f172a');
                    _cssVar('--text-primary',    '#e5e7eb');
                    _cssVar('--text-secondary',  '#9ca3af');
                    _cssVar('--card-bg',         '#1e293b');
                    _cssVar('--border-color',    '#374151');
                    _cssVar('--input-bg',        '#1e293b');
                    _cssVar('--hover-bg',        '#1f2c33');
                } else {
                    _cssVar('--bg-color',        '#ffffff');
                    _cssVar('--text-primary',    '#111b21');
                    _cssVar('--text-secondary',  '#667781');
                    _cssVar('--card-bg',         '#ffffff');
                    _cssVar('--border-color',    '#d1d7db');
                    _cssVar('--input-bg',        '#f0f2f5');
                    _cssVar('--hover-bg',        '#f5f6f6');
                }
            }

            // Notify iframe children
            _broadcastToFrames('THEME_CHANGED', { theme });
        }

        if (app.accentColor) {
            if (global.ThemeManager) window.ThemeManager.setAccentColor(app.accentColor);
            else _cssVar('--primary-color', app.accentColor);
            // Derive a darker shade for hover states
            _cssVar('--primary-dark', _shadeColor(app.accentColor, -20));
            try { localStorage.setItem('nexopa_accent_color', app.accentColor); } catch (_) {}
        }

        if (app.fontSize) {
            if (global.ThemeManager) {
                global.ThemeManager.setFontSize(app.fontSize);
            } else {
                const fs = parseInt(app.fontSize, 10) || 16;
                _cssVar('--base-font-size', fs + 'px');
                root.style.fontSize = fs + 'px';
                try { localStorage.setItem('app_font_size', String(fs)); } catch (_) {}
            }
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
    // FIX: Debounce + re-entry guard to prevent postMessage storm
    // AppSettings.merge() triggers notifySubscribers → applySettings → _broadcastToFrames
    // → iframe receives it → merge() → notifySubscribers → infinite loop
    let _broadcastTimer = null;
    let _broadcastPending = {};
    let _isBroadcasting = false;

    function _broadcastToFrames(type, data) {
        // Re-entry guard: if we're in an iframe receiving a broadcast, don't re-broadcast
        if (_isBroadcasting) return;
        // Deduplicate rapid-fire broadcasts of same type within 100ms
        _broadcastPending[type] = data;
        if (_broadcastTimer) return;
        _broadcastTimer = setTimeout(() => {
            _broadcastTimer = null;
            _isBroadcasting = true;
            try {
                const pending = Object.entries(_broadcastPending);
                _broadcastPending = {};
                // Only broadcast from parent frame — iframes must not re-broadcast
                // ── FIX: This early return left _isBroadcasting permanently stuck at
                // `true` for any iframe, because the reset at the bottom of this
                // function never ran. After the FIRST settings change made inside
                // any module iframe, every subsequent change in that iframe would
                // see _isBroadcasting === true and silently no-op — meaning
                // "settings not applying" got worse the longer the session ran.
                if (global.parent && global.parent !== global) { _isBroadcasting = false; return; }
                const frames = document.querySelectorAll('iframe');
                pending.forEach(([t, d]) => {
                    frames.forEach(f => {
                        try {
                            f.contentWindow.postMessage({
                                type: t,
                                source: 'AppSettings',
                                _noRebroadcast: true,
                                ...d,
                                timestamp: Date.now()
                            }, '*');
                        } catch (_) {}
                    });
                });
            } catch (_) {}
            _isBroadcasting = false;
        }, 100);
    }

    // ─── PostMessage listener — receive from parent/sibling iframes ───────────
    global.addEventListener('message', (evt) => {
        const d = evt.data || {};
        if (evt.source === global) return;

        // FIX: Ignore messages that were already broadcast from parent
        if (d._noRebroadcast) return;

        // A settings.html "Save" posts SETTINGS_UPDATED UP to its parent (chat.html)
        // with the full settings object. BUG FIX: this used silent:true unconditionally,
        // which meant chat.html updated its own copy but never notified subscribers —
        // so its _broadcastToFrames relay never fired and sibling iframes (messages,
        // calls, friends, status, groups, tools) never learned the Save happened.
        // Messages relayed back DOWN from the parent already carry _noRebroadcast:true
        // and are filtered out at the top of this listener, so notifying here cannot loop.
        if (d.type === 'SETTINGS_UPDATED' && d.settings) {
            global.AppSettings && global.AppSettings.merge(d.settings, {
                silent: false,
                skipBroadcast: true,
                source: 'parent-socket-relay'
            });
        }

        // Specific section update — may arrive from a CHILD iframe (e.g. settings.html
        // posting up to its parent chat.html) or from a parent relaying down to us.
        // BUG FIX: this previously always used { silent: true }, which suppresses
        // notifySubscribers() — the exact call that triggers _broadcastToFrames().
        // That meant when settings.html (a child iframe) posted SETTINGS_GLOBAL_UPDATE
        // up to chat.html (the parent), chat.html updated its own AppSettings copy but
        // NEVER re-broadcast the change down to sibling iframes (messages, calls,
        // friends, status, groups, tools) — settings only ever reached the frame that
        // changed them. We must notify subscribers (silent:false) so the parent's own
        // _broadcastToFrames relay fires; skipBroadcast still guards against re-sending
        // on the BroadcastChannel this message may have originated from.
        if (d.type === 'SETTINGS_GLOBAL_UPDATE' && d.section && d.key !== undefined) {
            global.AppSettings && global.AppSettings.set(d.section + '.' + d.key, d.value, {
                silent: false,
                skipBroadcast: true,
                source: 'parent-socket-relay'
            });
        }

        if (d.type === 'THEME_CHANGED' && d.theme) {
            global.AppSettings && global.AppSettings.set('appearance.theme', d.theme);
        }
        if (d.type === 'LANGUAGE_CHANGED' && d.language) {
            global.AppSettings && global.AppSettings.set('appearance.language', d.language);
        }

        // FIX: PRIVACY_UPDATED was previously only handled by the separate
        // listener in settings-module-subscriptions.js. That file's listener
        // has been removed (it duplicated every case here and the two
        // handlers racing to call AppSettings.merge()/set() for the same
        // incoming message was itself a bug — see settings-module-subscriptions.js
        // for details). This case is added here so PRIVACY_UPDATED keeps working
        // now that this is the single message listener for every page.
        if (d.type === 'PRIVACY_UPDATED' && d.privacy) {
            global.AppSettings && global.AppSettings.merge({ privacy: d.privacy }, {
                silent: false,
                skipBroadcast: true,
                source: 'parent-socket-relay'
            });
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

        // Subscribe: called immediately with current settings AND on every future change.
        // We only log/broadcast to iframes for genuine user-triggered changes.
        // Background syncs (server fetch, boot load, broadcast-receive) are applied
        // silently to avoid the 100+ SETTING_CHANGED postMessage storm.
        AS.subscribe((settings, path, value, meta) => {
            applySettings(settings);

            const isUserChange = (meta && meta.userTriggered === true) ||
                                 (meta && (meta.source === 'user-action' || meta.source === 'ui-save' || meta.source === 'local-set'));

            // Only broadcast SETTING_CHANGED to iframes when the user actually changed something
            if (isUserChange && path && path !== '*') {
                const parts = path.split('.');
                const section = parts[0];
                const key = parts.slice(1).join('.') || parts[0];
                debugLog('[SettingsPropagation] User changed setting:', path, '=', value);
                _broadcastToFrames('SETTING_CHANGED', { section, key, value, timestamp: Date.now() });
            }

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
