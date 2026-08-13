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

    // FIX: removed the 'settingsUI' entry that used to be here
    // (fn: () => global.applySettingsToUI). settings.html loads settings-core.js
    // and settings-ui.js as <script type="module">, and applySettingsToUI is a
    // plain top-level `function applySettingsToUI(...)` inside settings-core.js —
    // module scripts don't leak top-level declarations onto window, so
    // global.applySettingsToUI was always undefined and this entry could never
    // register. It wasn't needed anyway: settings-ui.js subscribes to
    // window.AppSettings directly itself (see its own initializeUI()), which is
    // how the settings page actually stays in sync — this entry was dead code.
    const AUTO_MODULES = [
        { name: 'friends',  fn: () => global.applyFriendsSettings },
        { name: 'calls',    fn: () => global.applyCallsSettings    },
        { name: 'groups',   fn: () => global.applyGroupsSettings   },
        { name: 'status',   fn: () => global.applyStatusSettings   },
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

    // FIX: friend-core.ui-bridge.js actually dispatches 'friendModuleReady'
    // (singular "friend"), not 'friendsModuleReady' — this listener's name
    // never matched what's actually fired, so it never ran. Listening for
    // both now. (In practice this path is a redundant safety net either way:
    // applyFriendsSettings is defined synchronously as a fallback further
    // down this file, so the very first auto-attach poll at t=0 already
    // registers it — but fixing the name mismatch costs nothing and makes
    // this listener do what its comment always claimed it did.)
    global.addEventListener('friendModuleReady', () => {
        if (global.applyFriendsSettings) register('friends', global.applyFriendsSettings);
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

    // ─── postMessage bridge ─────────────────────────────────────────────────
    // FIX (duplicate listener / race): this file used to register its own
    // 'message' listener here, handling SETTINGS_UPDATED / SETTINGS_GLOBAL_UPDATE /
    // THEME_CHANGED / LANGUAGE_CHANGED / PRIVACY_UPDATED by calling
    // AppSettings.merge()/set() directly with no options.
    //
    // settings-global-propagation.js is loaded on every page this file is
    // loaded on (chat.html and every module iframe) and already has its own
    // listener for the exact same message types, calling merge()/set() with
    // { silent: false, skipBroadcast: true } so the change also re-notifies
    // this page's own subscribers and re-broadcasts to sibling iframes.
    // With both listeners active, a single incoming postMessage triggered
    // AppSettings.merge()/set() TWICE — once via each listener — which is
    // wasteful and, worse, meant whichever listener's subscriber-notification
    // ran second could clobber DOM state written by the first pass (see the
    // applyCallsSettings fix below for a concrete case this caused). Rather
    // than keep two competing bridges in sync, this file now defers entirely
    // to the listener in settings-global-propagation.js (which also handles
    // PRIVACY_UPDATED — added there as part of this fix).

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

        root.setAttribute('data-calls-who-can-call', c.whoCanCallMe || 'friends');
        root.setAttribute('data-calls-auto-reject',   String(!!c.autoReject));
        root.setAttribute('data-calls-auto-answer',   String(!!c.autoAnswer));
        // FIX (wrong key name): AppSettings' canonical schema (js/AppSettings.js)
        // stores this as calls.ringtone, not calls.callRingtone — that key is
        // never populated by AppSettings, so this always fell back to 'default'
        // regardless of what the user actually chose in Settings. Confirmed by
        // tracing js/AppSettings.js's default schema and its normalize/merge path.
        root.setAttribute('data-calls-ringtone',      c.ringtone || 'default');
        // FIX (RINGTONE-FILES-NOT-SUPPORTED): stashed as window globals rather
        // than DOM attributes since these can be multi-hundred-KB data URLs —
        // calls-ui.js's incoming-ringtone player reads these when
        // data-calls-ringtone === 'custom' (audio) or whenever a video clip is
        // set (independent of the audio choice).
        window.__customRingtoneAudio = c.customRingtoneAudio || null;
        window.__customRingtoneVideo = c.customRingtoneVideo || null;
        // FIX (wrong key name): canonical key is calls.callVibration, not
        // calls.vibrateOnCall — same class of bug as ringtone above.
        root.setAttribute('data-calls-vibration',     String(c.callVibration !== false));
        // FIX (inverted default): AppSettings' canonical default for
        // calls.speakerDefault is false (see js/AppSettings.js), but this used
        // `!== false`, which defaults an unset value to true — the opposite of
        // the real default. Speakerphone would appear "on by default" here
        // even though the rest of the app defaults it to off.
        root.setAttribute('data-calls-speaker-default', String(c.speakerDefault === true));
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