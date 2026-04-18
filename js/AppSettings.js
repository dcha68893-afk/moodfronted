/**
 * AppSettings.js  — v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH for all settings across every module.
 *
 * LOAD ORDER: must come BEFORE settingsManager.js, settings-core.js,
 *             settings-ui.js and any module (friends, calls, groups, status…)
 *
 * DESIGN
 * ──────
 *  • Cache-first: reads from localStorage synchronously at boot.
 *  • Reactive:   any module can subscribe; all are notified on every change.
 *  • Offline-safe: writes succeed even with no network.
 *  • Bridge:     stays in sync with the existing SettingsState / MoodChatSettingsManager
 *                objects so we don't break any existing code.
 *
 * PUBLIC API
 * ──────────
 *  window.AppSettings.get(keyPath?)           → value | full settings object
 *  window.AppSettings.set(keyPath, value)     → void  (triggers subscribers)
 *  window.AppSettings.merge(partialSettings)  → void  (deep merge + notify)
 *  window.AppSettings.subscribe(fn)           → unsubscribe()
 *  window.AppSettings.reset()                 → void  (resets to defaults)
 *  window.AppSettings.getAll()                → deep-clone of current settings
 *  window.AppSettings.ready                   → Promise resolved when loaded
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    // Guard: only one instance
    if (global.AppSettings) {
        console.warn('[AppSettings] Already loaded — skipping');
        return;
    }

    // ─── Constants ────────────────────────────────────────────────────────────
    const STORAGE_KEY   = 'app_settings_global';
    const LEGACY_KEY    = 'knecta_settings_cache'; // written by settings-core.js
    const BROADCAST_CH  = 'app_settings_global';

    // ─── Default settings (superset of all modules) ───────────────────────────
    const DEFAULTS = {
        appearance: {
            theme:           'light',
            accentColor:     '#4F46E5',
            fontSize:        16,
            reduceMotion:    false,
            language:        'en',
            timeFormat:      '12h',
            dateFormat:      'mm/dd/yyyy',
            moodColorScheme: 'vibrant',
            moodAnimation:   true
        },
        notifications: {
            messageNotifications:      true,
            groupNotifications:        true,
            friendRequestNotifications:true,
            callNotifications:         true,
            statusNotifications:       true,
            moodNotifications:         true,
            notificationSound:         true,
            notificationVibration:     true,
            popupNotifications:        false,
            doNotDisturb:              false
        },
        privacy: {
            whoCanAddMe:       'friendsOfFriends',
            readReceipts:      true,
            typingIndicators:  true,
            messageForwarding: true,
            contactDiscovery:  true,
            lastSeen:          true,
            onlineStatus:      true,
            profileVisibility: 'friends',
            statusVisibility:  'everyone',
            moodVisibility: {
                showMoodTo:    'friends',
                moodHistory:   true,
                moodAnalytics: true
            }
        },
        chat: {
            wallpaper:            'default',
            enterKeySends:        false,
            mediaDownload:        'wifi',
            saveMedia:            false,
            messageHistory:       'forever',
            disappearingMessages: 'off',
            fontSize:             'medium',
            autoDownloadMedia:    true,
            aiFeatures: {
                smartReplies:       true,
                messageTranslation: false,
                chatSummarization:  false,
                spamDetection:      true
            }
        },
        friends: {
            discoverByPhone:    true,
            discoverByEmail:    false,
            nearbyDiscovery:    false,
            friendSuggestions:  true,
            temporaryFriends:   false,
            friendCategories:   true,
            trustScore:         false,
            friendAnalytics:    false
        },
        groups: {
            autoJoinGroups:      false,
            groupInvitations:    'friends',
            groupPrivacy:        'public',
            groupAnnouncements:  true,
            groupMediaDownload:  false,
            messageApproval:     false,
            keywordFiltering:    false,
            groupSpamDetection:  true,
            memberWarnings:      true
        },
        calls: {
            whoCanCallMe:       'friends',
            callVerification:   false,
            ringtone:           'default',
            callVibration:      true,
            autoAnswer:         false,
            autoReject:         false,
            videoQuality:       'auto',
            cameraDefault:      'front',
            noiseCancellation:  true,
            echoCancellation:   true,
            liveReactions:      true,
            inCallChat:         true
        },
        status: {
            visibility:         'everyone',
            autoDownloadMedia:  true,
            moodAutoShare:      false
        },
        account: {
            displayName:        'User',
            username:           'user123',
            bio:                "Hello! I'm using MoodChat",
            profileVisibility:  'friends',
            lastSeen:           true,
            onlineStatus:       true,
            photoVisibility:    'friends'
        },
        advanced: {
            offlineMode:        true,
            lowBandwidth:       false,
            debugMode:          false,
            dataSaver:          false,
            syncEnabled:        false
        }
    };

    // ─── Internal state ───────────────────────────────────────────────────────
    let _data        = {};                // live settings object
    let _subscribers = [];               // [{id, fn, filter}]
    let _bc          = null;             // BroadcastChannel
    let _readyResolve;
    const _ready = new Promise(r => { _readyResolve = r; });

    // ─── Deep helpers ─────────────────────────────────────────────────────────
    function _clone(obj) {
        try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return obj; }
    }

    function _merge(target, source) {
        if (!source || typeof source !== 'object') return target;
        const out = Object.assign({}, target);
        Object.keys(source).forEach(k => {
            if (source[k] !== null && typeof source[k] === 'object' && !Array.isArray(source[k]) &&
                target[k] !== null && typeof target[k] === 'object' && !Array.isArray(target[k])) {
                out[k] = _merge(target[k], source[k]);
            } else if (source[k] !== undefined) {
                out[k] = source[k];
            }
        });
        return out;
    }

    function _getByPath(obj, path) {
        if (!path) return obj;
        return path.split('.').reduce((cur, k) => (cur != null && typeof cur === 'object' ? cur[k] : undefined), obj);
    }

    function _setByPath(obj, path, value) {
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
            cur = cur[keys[i]];
        }
        cur[keys[keys.length - 1]] = value;
    }

    // ─── Persistence ──────────────────────────────────────────────────────────
    function _persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                data:      _data,
                version:   '1.0.0',
                updatedAt: Date.now()
            }));
        } catch (e) {
            console.warn('[AppSettings] localStorage write failed:', e.message);
        }
    }

    function _loadFromStorage() {
        // Priority 1: our own key
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.data && typeof parsed.data === 'object') {
                    return parsed.data;
                }
            }
        } catch (_) {}

        // Priority 2: legacy knecta_settings_cache (written by settings-core.js)
        try {
            const raw = localStorage.getItem(LEGACY_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                // settings-core stores {data:{…}, timestamp:…, version:…}
                const data = parsed.data || parsed;
                if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                    return _normalizeLegacy(data);
                }
            }
        } catch (_) {}

        return null;
    }

    /**
     * The legacy knecta_settings_cache uses section keys like appearance, notifications…
     * Normalize them into our expected shape.
     */
    function _normalizeLegacy(data) {
        const out = _clone(DEFAULTS);
        if (data.appearance)    out.appearance    = _merge(out.appearance,    data.appearance);
        if (data.notifications) out.notifications = _merge(out.notifications, data.notifications);
        if (data.privacy)       out.privacy       = _merge(out.privacy,       data.privacy);
        if (data.chat)          out.chat          = _merge(out.chat,          data.chat);
        if (data.friends)       out.friends       = _merge(out.friends,       data.friends);
        if (data.groups)        out.groups        = _merge(out.groups,        data.groups);
        if (data.calls)         out.calls         = _merge(out.calls,         data.calls);
        if (data.status)        out.status        = _merge(out.status,        data.status);
        if (data.account)       out.account       = _merge(out.account,       data.account);
        if (data.advanced)      out.advanced      = _merge(out.advanced,      data.advanced);
        // Flat LocalStoreSettings shape (theme, language, syncEnabled at top level)
        if (data.theme)         out.appearance.theme = data.theme;
        if (data.language)      out.appearance.language = data.language;
        if (data.syncEnabled !== undefined) out.advanced.syncEnabled = data.syncEnabled;
        return out;
    }

    // ─── Notification ─────────────────────────────────────────────────────────
    function _notify(path, value, all) {
        const snapshot = _clone(_data);
        _subscribers.forEach(sub => {
            try {
                if (!sub.filter || path.startsWith(sub.filter)) {
                    sub.fn(snapshot, path, value);
                }
            } catch (e) {
                console.error('[AppSettings] Subscriber error:', e);
            }
        });

        // Dispatch DOM event for modules that use addEventListener
        try {
            global.dispatchEvent(new CustomEvent('appSettingsChanged', {
                detail: { settings: snapshot, path, value, timestamp: Date.now() }
            }));
        } catch (_) {}

        // Cross-tab via BroadcastChannel
        if (_bc) {
            try {
                _bc.postMessage({ type: 'SETTINGS_CHANGE', path, value, data: snapshot, ts: Date.now() });
            } catch (_) {}
        }
    }

    function _notifyFull(settings) {
        _notify('*', null, settings);
    }

    // ─── BroadcastChannel (cross-tab sync) ────────────────────────────────────
    function _setupBroadcast() {
        if (typeof BroadcastChannel === 'undefined') return;
        try {
            _bc = new BroadcastChannel(BROADCAST_CH);
            _bc.onmessage = (evt) => {
                const msg = evt.data || {};
                if (msg.type !== 'SETTINGS_CHANGE') return;
                // Silently apply without re-broadcasting
                if (msg.path && msg.path !== '*') {
                    _setByPath(_data, msg.path, msg.value);
                } else if (msg.data) {
                    _data = _merge(_clone(DEFAULTS), msg.data);
                }
                _persist();
                // Notify local subscribers (but skip cross-tab broadcast this time)
                const snapshot = _clone(_data);
                _subscribers.forEach(sub => {
                    try { sub.fn(snapshot, msg.path, msg.value); } catch (_) {}
                });
                try {
                    global.dispatchEvent(new CustomEvent('appSettingsChanged', {
                        detail: { settings: snapshot, path: msg.path, value: msg.value, fromBroadcast: true }
                    }));
                } catch (_) {}
            };
        } catch (e) {
            console.warn('[AppSettings] BroadcastChannel unavailable:', e.message);
        }
    }

    // ─── Bridge: keep legacy stores in sync ───────────────────────────────────
    /**
     * When AppSettings changes, push the update into existing stores
     * (MoodChatSettingsManager, SettingsState, LocalStoreSettings, SettingsStore)
     * so that old code that reads those stores still works.
     */
    function _bridgeLegacyStores(path, value) {
        // SettingsStore (simple key/value)
        try {
            if (global.SettingsStore && path !== '*') {
                global.SettingsStore.set(path, value);
            }
        } catch (_) {}

        // LocalStoreSettings
        try {
            if (global.LocalStoreSettings && path && path !== '*') {
                global.LocalStoreSettings.set(path, value);
            }
        } catch (_) {}

        // MoodChatSettingsManager
        try {
            const mgr = global.MoodChatSettingsManager;
            if (mgr && mgr.initialized && path && path !== '*') {
                // Only if value differs to avoid infinite loop
                const cur = mgr.getNestedValue ? mgr.getNestedValue(mgr.currentSettings, path) : undefined;
                if (JSON.stringify(cur) !== JSON.stringify(value)) {
                    mgr.setNestedValue && mgr.setNestedValue(mgr.currentSettings, path, value);
                    mgr.applySetting && mgr.applySetting(path, value);
                }
            }
        } catch (_) {}
    }

    // ─── Apply settings effects to the DOM ────────────────────────────────────
    function _applyToDOM(settings) {
        if (!settings) return;
        try {
            const root = document.documentElement;

            // Theme
            if (settings.appearance) {
                const theme = settings.appearance.theme || 'light';
                root.classList.remove('theme-light', 'theme-dark', 'theme-auto');
                root.classList.add('theme-' + theme);
                root.setAttribute('data-theme', theme);
                if (theme === 'dark') {
                    root.style.setProperty('--bg-color', '#1a1a1a');
                    root.style.setProperty('--text-primary', '#ffffff');
                    root.style.setProperty('--text-secondary', '#b0b3b8');
                    root.style.setProperty('--card-bg', '#242526');
                    root.style.setProperty('--border-color', '#3e4042');
                } else {
                    root.style.setProperty('--bg-color', '#ffffff');
                    root.style.setProperty('--text-primary', '#050505');
                    root.style.setProperty('--text-secondary', '#65676b');
                    root.style.setProperty('--card-bg', '#ffffff');
                    root.style.setProperty('--border-color', '#dddfe2');
                }
                if (settings.appearance.accentColor) {
                    root.style.setProperty('--primary-color', settings.appearance.accentColor);
                }
                if (settings.appearance.fontSize) {
                    root.style.setProperty('--base-font-size', settings.appearance.fontSize + 'px');
                    root.style.fontSize = settings.appearance.fontSize + 'px';
                }
                if (settings.appearance.language) {
                    root.lang = settings.appearance.language;
                }
                if (settings.appearance.reduceMotion !== undefined) {
                    root.classList.toggle('reduce-motion', !!settings.appearance.reduceMotion);
                }
            }

            // Notifications
            if (settings.notifications) {
                Object.entries(settings.notifications).forEach(([k, v]) => {
                    root.setAttribute('data-notification-' + k, String(v));
                });
                root.classList.toggle('do-not-disturb', !!settings.notifications.doNotDisturb);
            }

            // Privacy
            if (settings.privacy) {
                Object.entries(settings.privacy).forEach(([k, v]) => {
                    if (typeof v !== 'object') {
                        root.setAttribute('data-privacy-' + k, String(v));
                    }
                });
            }

            // Calls
            if (settings.calls) {
                root.setAttribute('data-calls-who-can-call', settings.calls.whoCanCallMe || 'friends');
                root.setAttribute('data-calls-auto-reject', String(!!settings.calls.autoReject));
            }

            // Groups
            if (settings.groups) {
                root.setAttribute('data-groups-invitations', settings.groups.groupInvitations || 'friends');
                root.setAttribute('data-groups-notifications', String(settings.groups.groupAnnouncements !== false));
            }

            // Status
            if (settings.status) {
                root.setAttribute('data-status-visibility', settings.status.visibility || 'everyone');
            }
        } catch (e) {
            console.warn('[AppSettings] DOM apply error:', e.message);
        }
    }

    // ─── Boot: load from storage, apply, then resolve ready promise ───────────
    function _boot() {
        const stored = _loadFromStorage();
        _data = stored ? _merge(_clone(DEFAULTS), stored) : _clone(DEFAULTS);
        _setupBroadcast();
        _applyToDOM(_data);
        _persist(); // ensure our own key is written

        // Signal readiness
        _readyResolve();
        global.__APP_SETTINGS_READY__ = true;
        try {
            global.dispatchEvent(new CustomEvent('appSettingsReady', {
                detail: { settings: _clone(_data), timestamp: Date.now() }
            }));
        } catch (_) {}

        console.log('[AppSettings] ✅ Loaded & ready');

        // If legacy SettingsState is already loaded, pull its data in
        _syncFromLegacy();
    }

    function _syncFromLegacy() {
        try {
            const legacyState = global.__SETTINGS_STATE_OBJ__;
            if (legacyState && legacyState.loaded && legacyState.data && Object.keys(legacyState.data).length > 0) {
                _data = _merge(_data, legacyState.data);
                _persist();
            }
        } catch (_) {}
        try {
            const mgr = global.MoodChatSettingsManager;
            if (mgr && mgr.initialized && mgr.currentSettings) {
                _data = _merge(_data, mgr.currentSettings);
                _persist();
            }
        } catch (_) {}
    }

    // ─── Public API ───────────────────────────────────────────────────────────
    const AppSettings = {
        /**
         * Resolved when settings are loaded from localStorage.
         * Modules should await this before reading values.
         */
        get ready() { return _ready; },

        /**
         * Get a setting by dot-path, or the entire object if no path.
         * e.g. AppSettings.get('appearance.theme')
         */
        get(path) {
            if (!path) return _clone(_data);
            const v = _getByPath(_data, path);
            return v !== undefined ? _clone(v) : undefined;
        },

        /**
         * Get the full settings snapshot (deep clone).
         */
        getAll() {
            return _clone(_data);
        },

        /**
         * Set a single setting by dot-path.
         * e.g. AppSettings.set('appearance.theme', 'dark')
         *
         * Saves to localStorage immediately, notifies all subscribers,
         * and applies DOM effects.
         */
        set(path, value, options = {}) {
            if (!path) return;
            const prev = _getByPath(_data, path);
            if (!options.force && JSON.stringify(prev) === JSON.stringify(value)) return;

            _setByPath(_data, path, value);
            _persist();
            _applyToDOM(_data);
            if (!options.silent) {
                _notify(path, value, _data);
                _bridgeLegacyStores(path, value);
            }
        },

        /**
         * Deep-merge a partial settings object.
         * e.g. AppSettings.merge({ appearance: { theme: 'dark' }, calls: { autoReject: true } })
         */
        merge(partial, options = {}) {
            if (!partial || typeof partial !== 'object') return;
            _data = _merge(_data, partial);
            _persist();
            _applyToDOM(_data);
            if (!options.silent) {
                _notifyFull(_data);
            }
        },

        /**
         * Subscribe to settings changes.
         * callback(settingsSnapshot, changedPath, changedValue)
         * filter (optional): only receive callbacks when a path starting with filter changes
         * Returns an unsubscribe function.
         */
        subscribe(callback, filter) {
            if (typeof callback !== 'function') return () => {};
            const sub = { id: Date.now() + Math.random(), fn: callback, filter: filter || null };
            _subscribers.push(sub);
            // Immediately invoke with current settings
            try { callback(_clone(_data), null, null); } catch (_) {}
            return function unsubscribe() {
                const idx = _subscribers.indexOf(sub);
                if (idx !== -1) _subscribers.splice(idx, 1);
            };
        },

        /**
         * Reset all settings to built-in defaults.
         */
        reset() {
            _data = _clone(DEFAULTS);
            _persist();
            _applyToDOM(_data);
            _notifyFull(_data);
            console.log('[AppSettings] Reset to defaults');
        },

        /**
         * Force a re-sync from legacy stores (call after they initialize).
         */
        syncFromLegacy() {
            _syncFromLegacy();
            _applyToDOM(_data);
            _notifyFull(_data);
        },

        /**
         * Expose defaults for reference.
         */
        DEFAULTS,

        /**
         * Diagnostics helper.
         */
        diagnostics() {
            return {
                subscriberCount: _subscribers.length,
                broadcastEnabled: !!_bc,
                data: _clone(_data)
            };
        }
    };

    // Expose globally
    global.AppSettings = AppSettings;

    // Boot immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _boot, { once: true });
    } else {
        _boot();
    }

    // Listen for legacy events so AppSettings stays in sync when old code fires events
    global.addEventListener('settingsUpdated', (evt) => {
        const s = evt.detail && evt.detail.settings;
        if (s && typeof s === 'object') {
            AppSettings.merge(s, { silent: false });
        }
    });

    global.addEventListener('SETTINGS_GLOBAL_UPDATE', (evt) => {
        const d = evt.detail || {};
        if (d.section && d.key !== undefined) {
            AppSettings.set(d.section + '.' + d.key, d.value);
        }
    });

    // When SettingsState fires its own _notify, mirror to AppSettings
    global.addEventListener('settingsSaved', () => { AppSettings.syncFromLegacy(); });
    global.addEventListener('settings-store-ready', () => { AppSettings.syncFromLegacy(); });

    console.log('[AppSettings] Module registered');

})(typeof window !== 'undefined' ? window : global);