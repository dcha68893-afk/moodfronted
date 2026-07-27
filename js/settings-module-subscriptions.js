/**
 * settings-module-subscriptions.js  — v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * DROP-IN SUBSCRIPTION BOOTSTRAPPER for every module that needs to react to
 * settings changes.
 *
 * HOW TO USE IN A MODULE
 * ──────────────────────
 * Simply load this file after AppSettings.js and before the module script,
 * OR call window.SettingsModuleSubscriptions.register(moduleName, applyFn)
 * from inside any module's init function.
 *
 * Example (friends module):
 *
 *   // At the end of friends module init:
 *   window.SettingsModuleSubscriptions.register('friends', (settings) => {
 *       applyFriendsSettings(settings);
 *   });
 *
 * The callback is called IMMEDIATELY with current settings, and again on
 * every future change — no need to manually read AppSettings elsewhere.
 *
 * BUILT-IN AUTO-SUBSCRIPTIONS
 * ────────────────────────────
 * If the module exposes a known global function, this file auto-subscribes it:
 *   window.applyFriendsSettings(settings)
 *   window.applyCallsSettings(settings)
 *   window.applyGroupsSettings(settings)
 *   window.applyStatusSettings(settings)
 *   window.applySettingsToUI(settings)   ← settings page itself
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    if (global.SettingsModuleSubscriptions) return;

    // 'auto' theme has been removed app-wide, so this is now a plain
    // light/dark normalizer — kept as a single shared helper (rather than
    // each subscriber re-implementing its own) so every module module
    // agrees on how an unrecognized/missing theme value resolves.
    function _resolveThemeForDOM(theme) {
        return theme === 'dark' ? 'dark' : 'light';
    }
    global.__resolveThemeForDOM = global.__resolveThemeForDOM || _resolveThemeForDOM;

    // Registry: { moduleName: unsubscribeFn }
    const _registry = {};

    /**
     * Register a module to receive settings updates.
     * @param {string}   moduleName  Unique module identifier (for dedup)
     * @param {function} applyFn    Called with (settingsSnapshot) on every change
     */
    function register(moduleName, applyFn) {
        if (typeof applyFn !== 'function') return;

        // Unregister previous subscription for this module (allows re-registration)
        if (_registry[moduleName]) {
            try { _registry[moduleName](); } catch (_) {}
        }

        function _attach(AS) {
            _registry[moduleName] = AS.subscribe((settings, path) => {
                try { applyFn(settings, path); } catch (e) {
                    console.warn('[SettingsModuleSubs] ' + moduleName + ' applyFn error:', e);
                }
            });
            console.log('[SettingsModuleSubs] ✅ Registered:', moduleName);
        }

        if (global.AppSettings) {
            _attach(global.AppSettings);
        } else {
            global.addEventListener('appSettingsReady', () => {
                _attach(global.AppSettings);
            }, { once: true });
        }
    }

    /**
     * Unregister a module's subscription.
     */
    function unregister(moduleName) {
        if (_registry[moduleName]) {
            try { _registry[moduleName](); } catch (_) {}
            delete _registry[moduleName];
        }
    }

    // ─── Auto-subscribe known module globals ──────────────────────────────────
    // We poll briefly after page load so modules have time to define their functions.

    const AUTO_MODULES = [
        { name: 'friends',  fn: () => global.applyFriendsSettings },
        { name: 'calls',    fn: () => global.applyCallsSettings    },
        { name: 'groups',   fn: () => global.applyGroupsSettings   },
        { name: 'status',   fn: () => global.applyStatusSettings   },
        { name: 'settingsUI', fn: () => global.applySettingsToUI   },
    ];

    function _autoAttach() {
        AUTO_MODULES.forEach(mod => {
            if (_registry[mod.name]) return; // already registered
            const fn = mod.fn();
            if (typeof fn === 'function') {
                register(mod.name, fn);
            }
        });
    }

    // Try immediately, then retry at 500ms, 1.5s, 3s to catch late-loading modules
    [0, 500, 1500, 3000].forEach(ms => setTimeout(_autoAttach, ms));

    // ─── Also subscribe to DOM events (for modules that dispatch events) ──────
    // When a module dispatches 'moduleReady' or 'moduleActive', try to attach.
    global.addEventListener('moduleActive', (evt) => {
        const moduleName = evt.detail && evt.detail.module;
        if (moduleName) setTimeout(_autoAttach, 100);
    });

    global.addEventListener('friendsModuleReady', () => {
        if (global.applyFriendsSettings) register('friends', global.applyFriendsSettings);
    });
    global.addEventListener('callsModuleReady', () => {
        if (global.applyCallsSettings) register('calls', global.applyCallsSettings);
    });
    global.addEventListener('groupsModuleReady', () => {
        if (global.applyGroupsSettings) register('groups', global.applyGroupsSettings);
    });
    global.addEventListener('statusModuleReady', () => {
        if (global.applyStatusSettings) register('status', global.applyStatusSettings);
    });

    // ─── postMessage bridge: when this file runs inside an iframe ─────────────
    // Receiving SETTINGS_GLOBAL_UPDATE or THEME_CHANGED from parent → push to AppSettings
    global.addEventListener('message', (evt) => {
        const d = evt.data || {};
        if (!global.AppSettings) return;

        if (d.type === 'SETTINGS_UPDATED' && d.settings) {
            global.AppSettings.merge(d.settings);
        }
        if (d.type === 'SETTINGS_GLOBAL_UPDATE' && d.section && d.key !== undefined) {
            global.AppSettings.set(d.section + '.' + d.key, d.value);
        }
        if (d.type === 'THEME_CHANGED' && d.theme) {
            global.AppSettings.set('appearance.theme', d.theme);
        }
        if (d.type === 'LANGUAGE_CHANGED' && d.language) {
            global.AppSettings.set('appearance.language', d.language);
        }
        if (d.type === 'PRIVACY_UPDATED' && d.privacy) {
            global.AppSettings.merge({ privacy: d.privacy });
        }
    });

    // ─── Public API ───────────────────────────────────────────────────────────
    global.SettingsModuleSubscriptions = {
        register,
        unregister,
        get registry() { return Object.keys(_registry); }
    };

    console.log('[SettingsModuleSubs] Module loaded');

})(typeof window !== 'undefined' ? window : global);


// ═══════════════════════════════════════════════════════════════════════════
// PER-MODULE APPLY FUNCTIONS
// These are the handlers each module should define (or can copy from here).
// They read from the settings snapshot and apply the effects.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FRIENDS MODULE — apply settings
 * Drop into your friends module and call:
 *   SettingsModuleSubscriptions.register('friends', applyFriendsSettings);
 */
window.applyFriendsSettings = window.applyFriendsSettings || function applyFriendsSettings(settings) {
    if (!settings) return;
    try {
        const root = document.documentElement;
        const p = settings.privacy || {};
        const f = settings.friends || {};

        // Who can add me — drives friend-request button visibility
        root.setAttribute('data-friends-who-can-add', p.whoCanAddMe || 'friendsOfFriends');
        root.setAttribute('data-friends-contact-disc', String(p.contactDiscovery !== false));
        root.setAttribute('data-friends-suggestions',  String(f.friendSuggestions !== false));
        root.setAttribute('data-friends-nearby',        String(!!f.nearbyDiscovery));
        root.setAttribute('data-friends-categories',    String(f.friendCategories !== false));
        root.setAttribute('data-friends-trust-score',   String(!!f.trustScore));

        // Visibility: hide last-seen if disabled
        root.setAttribute('data-privacy-lastSeen',      p.lastSeen || 'everyone');
        root.setAttribute('data-privacy-onlineStatus',  String(p.onlineStatus !== false));
        root.setAttribute('data-privacy-profileVisibility', p.profileVisibility || 'everyone');
        root.setAttribute('data-privacy-photoVisibility', p.photoVisibility || 'everyone');

        // Theme propagation — FIX (single theme owner): delegate to
        // window.ThemeManager instead of painting independently here.
        if (settings.appearance && settings.appearance.theme) {
            if (window.ThemeManager) window.ThemeManager.setTheme(settings.appearance.theme);
            else root.setAttribute('data-theme', (window.__resolveThemeForDOM ? window.__resolveThemeForDOM(settings.appearance.theme) : settings.appearance.theme));
        }

        document.dispatchEvent(new CustomEvent('friendsSettingsApplied', {
            detail: { privacy: p, friends: f }
        }));
    } catch (e) {
        console.warn('[applyFriendsSettings] Error:', e.message);
    }
};

/**
 * CALLS MODULE — apply settings
 */
window.applyCallsSettings = window.applyCallsSettings || function applyCallsSettings(settings) {
    if (!settings) return;
    try {
        const root = document.documentElement;
        const c = settings.calls || {};
        const p = settings.privacy || {};

        root.setAttribute('data-calls-who-can-call', c.whoCanCallMe || 'friendsOnly');
        root.setAttribute('data-calls-auto-reject',   String(!!c.autoReject));
        root.setAttribute('data-calls-auto-answer',   String(!!c.autoAnswer));
        root.setAttribute('data-calls-ringtone',      c.callRingtone || 'default');
        root.setAttribute('data-calls-vibration',     String(c.vibrateOnCall !== false));
        root.setAttribute('data-calls-speaker-default', String(c.speakerDefault !== false));
        root.setAttribute('data-calls-microphone-default', c.microphoneDefault || 'default');
        root.setAttribute('data-calls-video-quality', c.videoQuality || 'auto');
        root.setAttribute('data-calls-noise-cancel',  String(c.noiseCancellation !== false));
        root.setAttribute('data-calls-echo-cancel',   String(c.echoCancellation !== false));
        root.setAttribute('data-calls-live-reactions',String(c.liveReactions !== false));
        root.setAttribute('data-calls-in-call-chat',  String(c.inCallChat !== false));

        // Call permission drives whether the call button is shown for a contact
        if (p.friendPermissions) {
            root.setAttribute('data-perm-can-call', String(p.friendPermissions.canCall !== false));
        }

        if (settings.notifications) {
            root.setAttribute('data-notification-callNotifications',
                String(settings.notifications.callNotifications !== false));
        }

        if (settings.appearance && settings.appearance.theme) {
            if (window.ThemeManager) window.ThemeManager.setTheme(settings.appearance.theme);
            else root.setAttribute('data-theme', (window.__resolveThemeForDOM ? window.__resolveThemeForDOM(settings.appearance.theme) : settings.appearance.theme));
        }

        document.dispatchEvent(new CustomEvent('callsSettingsApplied', {
            detail: { calls: c, privacy: p }
        }));
    } catch (e) {
        console.warn('[applyCallsSettings] Error:', e.message);
    }
};

/**
 * GROUPS MODULE — apply settings
 */
window.applyGroupsSettings = window.applyGroupsSettings || function applyGroupsSettings(settings) {
    if (!settings) return;
    try {
        const root = document.documentElement;
        const g = settings.groups || {};
        const n = settings.notifications || {};

        root.setAttribute('data-groups-invitations',   g.groupInvitations || 'friends');
        root.setAttribute('data-groups-privacy',       g.groupPrivacy     || 'public');
        root.setAttribute('data-groups-announcements', String(g.groupAnnouncements !== false));
        root.setAttribute('data-groups-approval',      String(!!g.messageApproval));
        root.setAttribute('data-groups-spam',          String(g.groupSpamDetection !== false));
        root.setAttribute('data-groups-warnings',      String(g.memberWarnings !== false));
        root.setAttribute('data-groups-keyword-filter',String(!!g.keywordFiltering));
        root.setAttribute('data-groups-media-download',String(!!g.groupMediaDownload));
        root.setAttribute('data-groups-notifications', String(n.groupNotifications !== false));

        if (settings.appearance && settings.appearance.theme) {
            if (window.ThemeManager) window.ThemeManager.setTheme(settings.appearance.theme);
            else root.setAttribute('data-theme', (window.__resolveThemeForDOM ? window.__resolveThemeForDOM(settings.appearance.theme) : settings.appearance.theme));
        }

        document.dispatchEvent(new CustomEvent('groupsSettingsApplied', {
            detail: { groups: g, notifications: n }
        }));
    } catch (e) {
        console.warn('[applyGroupsSettings] Error:', e.message);
    }
};

/**
 * STATUS MODULE — apply settings
 */
window.applyStatusSettings = window.applyStatusSettings || function applyStatusSettings(settings) {
    if (!settings) return;
    try {
        const root = document.documentElement;
        const s  = settings.status  || {};
        const p  = settings.privacy || {};
        const n  = settings.notifications || {};

        // Who can see the user's status
        const visibility = p.statusVisibility || s.visibility || 'everyone';
        root.setAttribute('data-status-visibility',    visibility);
        root.setAttribute('data-status-auto-download', String(s.autoDownloadMedia !== false));
        root.setAttribute('data-status-mood-share',    String(!!s.moodAutoShare));
        root.setAttribute('data-privacy-readReceipts', String(p.readReceipts !== false));

        // Mood visibility (nested privacy)
        if (p.moodVisibility) {
            root.setAttribute('data-mood-visible-to',   p.moodVisibility.showMoodTo || 'friends');
            root.setAttribute('data-mood-history',      String(p.moodVisibility.moodHistory !== false));
        }

        root.setAttribute('data-notification-statusNotifications',
            String(n.statusNotifications !== false));

        if (settings.appearance && settings.appearance.theme) {
            if (window.ThemeManager) window.ThemeManager.setTheme(settings.appearance.theme);
            else root.setAttribute('data-theme', (window.__resolveThemeForDOM ? window.__resolveThemeForDOM(settings.appearance.theme) : settings.appearance.theme));
        }

        document.dispatchEvent(new CustomEvent('statusSettingsApplied', {
            detail: { status: s, privacy: p }
        }));
    } catch (e) {
        console.warn('[applyStatusSettings] Error:', e.message);
    }
};
