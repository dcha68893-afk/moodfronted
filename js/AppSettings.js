/**
 * AppSettings.js
 * Canonical global settings store for all modules/pages.
 *
 * Responsibilities:
 * - Load cached settings immediately on startup
 * - Namespace cache per user to avoid cross-account bleed
 * - Fetch backend settings as soon as auth is available
 * - Apply theme/privacy/notification/chat/call settings globally
 * - Notify all subscribers and frames on every change
 * - Mirror settings to legacy caches that older modules still read
 */

(function (global) {
    'use strict';

    if (global.AppSettings) {
        return;
    }

    const STORAGE_PREFIX = 'app_settings_global';
    const LAST_USER_KEY = 'app_settings_last_user';
    const LEGACY_CACHE_KEY = 'knecta_settings_cache';
    const BROADCAST_CHANNEL = 'app_settings_global';
    const DEBUG_FLAG_KEY = 'app_settings_debug';
    const VERSION = '2.0.0';

    const DEFAULTS = {
        appearance: {
            theme: 'light',
            accentColor: '#4F46E5',
            fontSize: 16,
            reduceMotion: false,
            language: 'en',
            timeFormat: '12h',
            dateFormat: 'mm/dd/yyyy',
            moodColorScheme: 'vibrant',
            moodAnimation: true
        },
        notifications: {
            enabled: true,
            messageNotifications: true,
            groupNotifications: true,
            friendRequestNotifications: true,
            callNotifications: true,
            statusNotifications: true,
            moodNotifications: true,
            notificationSound: true,
            notificationVibration: true,
            popupNotifications: true,
            doNotDisturb: false
        },
        privacy: {
            whoCanAddMe: 'friendsOfFriends',
            readReceipts: true,
            typingIndicators: true,
            messageForwarding: true,
            contactDiscovery: true,
            lastSeen: 'everyone',
            onlineStatus: true,
            profileVisibility: 'everyone',
            photoVisibility: 'everyone',
            statusVisibility: 'everyone'
        },
        chat: {
            wallpaper: 'default',
            enterKeySends: false,
            mediaDownload: 'wifi',
            saveMedia: false,
            messageHistory: 'forever',
            disappearingMessages: 'off',
            fontSize: 'medium',
            autoDownloadMedia: true,
            bubbleStyle: 'default',
            aiFeatures: {
                smartReplies: true,
                messageTranslation: false,
                chatSummarization: false,
                spamDetection: true
            }
        },
        friends: {
            discoverByPhone: true,
            discoverByEmail: false,
            nearbyDiscovery: false,
            friendSuggestions: true,
            friendCategories: true,
            trustScore: false
        },
        groups: {
            autoJoinGroups: false,
            groupInvitations: 'friends',
            groupPrivacy: 'public',
            groupAnnouncements: true,
            groupMediaDownload: true,
            messageApproval: false,
            keywordFiltering: false,
            groupSpamDetection: true,
            memberWarnings: true
        },
        calls: {
            whoCanCallMe: 'friends',
            callVerification: false,
            ringtone: 'default',
            callVibration: true,
            autoAnswer: false,
            autoReject: false,
            speakerDefault: false,
            videoQuality: 'auto',
            microphoneDefault: 'default',
            cameraDefault: 'front',
            noiseCancellation: true,
            echoCancellation: true,
            liveReactions: true,
            inCallChat: true
        },
        status: {
            visibility: 'everyone',
            autoDownloadMedia: true,
            moodAutoShare: false
        },
        account: {
            displayName: 'User',
            username: 'user',
            bio: "Hello! I'm using MoodChat",
            profileVisibility: 'everyone',
            photoVisibility: 'everyone',
            lastSeen: 'everyone',
            onlineStatus: true
        },
        advanced: {
            offlineMode: true,
            lowBandwidth: false,
            debugMode: false,
            dataSaver: false,
            syncEnabled: true
        }
    };

    let _data = clone(DEFAULTS);
    let _subscribers = [];
    let _broadcast = null;
    let _activeUserId = 'guest';
    let _serverSyncPromise = null;
    let _readyResolve;
    const _ready = new Promise((resolve) => { _readyResolve = resolve; });
    let _notificationProxyInstalled = false;
    let _callAudioProxyInstalled = false;
    let _settingsServiceBridgeInstalled = false;
    let _showNotificationImpl = null;
    let _playOutgoingRingImpl = null;
    let _playIncomingRingImpl = null;
    let _legacySettingsCallbacks = {};
    const _warnedKeys = new Set();

    function clone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return value;
        }
    }

    function isDebugEnabled() {
        try {
            return global.__APP_SETTINGS_DEBUG__ === true
                || global.localStorage?.getItem(DEBUG_FLAG_KEY) === '1';
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

    function warnOnce(key) {
        if (_warnedKeys.has(key)) return;
        _warnedKeys.add(key);
        console.warn.apply(console, Array.prototype.slice.call(arguments, 1));
    }

    function isEqual(left, right) {
        try {
            return JSON.stringify(left) === JSON.stringify(right);
        } catch (_) {
            return left === right;
        }
    }

    function isObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function mergeDeep(target, source) {
        if (!isObject(source)) return clone(target);
        const base = isObject(target) ? clone(target) : {};
        Object.keys(source).forEach((key) => {
            const incoming = source[key];
            if (isObject(incoming) && isObject(base[key])) {
                base[key] = mergeDeep(base[key], incoming);
            } else if (incoming !== undefined) {
                base[key] = clone(incoming);
            }
        });
        return base;
    }

    function getByPath(obj, path) {
        if (!path) return obj;
        return String(path).split('.').reduce((current, key) => (
            current != null && typeof current === 'object' ? current[key] : undefined
        ), obj);
    }

    function setByPath(obj, path, value) {
        const keys = String(path).split('.');
        let cursor = obj;
        for (let i = 0; i < keys.length - 1; i += 1) {
            const key = keys[i];
            if (!isObject(cursor[key])) cursor[key] = {};
            cursor = cursor[key];
        }
        cursor[keys[keys.length - 1]] = value;
    }

    function createFallbackNotification(message, type, duration) {
        try {
            if (!document || !document.body) return null;

            let container = document.getElementById('notification-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'notification-container';
                container.style.cssText = [
                    'position:fixed',
                    'top:20px',
                    'right:20px',
                    'z-index:9999',
                    'max-width:400px',
                    'display:flex',
                    'flex-direction:column',
                    'gap:10px'
                ].join(';');
                document.body.appendChild(container);
            }

            const notification = document.createElement('div');
            const background = type === 'error'
                ? '#f87171'
                : type === 'success'
                    ? '#10b981'
                    : type === 'warning'
                        ? '#f59e0b'
                        : '#3b82f6';

            notification.className = `notification notification-${type || 'info'}`;
            notification.style.cssText = [
                `background:${background}`,
                'color:white',
                'padding:12px 16px',
                'border-radius:8px',
                'box-shadow:0 4px 6px rgba(0,0,0,0.15)',
                'display:flex',
                'align-items:center',
                'justify-content:space-between',
                'gap:12px'
            ].join(';');
            notification.innerHTML = `
                <span>${String(message || '')}</span>
                <button type="button" style="background:transparent;border:none;color:white;cursor:pointer;font-size:18px;">&times;</button>
            `;

            const close = function () {
                if (notification.parentNode) notification.remove();
            };

            container.appendChild(notification);
            const button = notification.querySelector('button');
            if (button) button.addEventListener('click', close);

            if (duration > 0) {
                setTimeout(close, duration);
            }

            return notification;
        } catch (error) {
            debugWarn('[AppSettings] Fallback notification failed:', error.message);
            return null;
        }
    }

    function notificationsEnabled() {
        return _data.notifications?.enabled !== false && _data.notifications?.popupNotifications !== false;
    }

    function notificationSoundsEnabled() {
        return _data.notifications?.enabled !== false
            && _data.notifications?.notificationSound !== false;
    }

    function callAudioEnabled() {
        return notificationSoundsEnabled()
            && _data.notifications?.callNotifications !== false
            && _data.calls?.ringtone !== 'none'
            && _data.calls?.ringtone !== 'silent';
    }

    function stopManagedAudio() {
        ['_callerRingtone', '_incomingRingtone'].forEach((key) => {
            try {
                const audio = global[key];
                if (audio && typeof audio.pause === 'function') {
                    audio.pause();
                    if (typeof audio.currentTime === 'number') {
                        audio.currentTime = 0;
                    }
                }
                global[key] = null;
            } catch (_) {}
        });
    }

    function installNotificationProxy() {
        if (_notificationProxyInstalled) return;

        const wrappedShowNotification = function (message, type, duration) {
            if (!notificationsEnabled()) {
                return null;
            }

            if (_showNotificationImpl) {
                try {
                    return _showNotificationImpl(message, type, duration);
                } catch (error) {
                    console.warn('[AppSettings] Notification delegate failed:', error.message);
                }
            }

            return createFallbackNotification(message, type || 'info', duration || 5000);
        };

        try {
            if (typeof global.showNotification === 'function') {
                _showNotificationImpl = global.showNotification.bind(global);
            }

            const descriptor = Object.getOwnPropertyDescriptor(global, 'showNotification');
            if (descriptor && descriptor.configurable === false) {
                try {
                    global.showNotification = wrappedShowNotification;
                    _notificationProxyInstalled = global.showNotification === wrappedShowNotification;
                    return;
                } catch (_) {
                    _notificationProxyInstalled = false;
                    return;
                }
            }

            Object.defineProperty(global, 'showNotification', {
                configurable: true,
                enumerable: true,
                get() {
                    return wrappedShowNotification;
                },
                set(fn) {
                    if (fn === wrappedShowNotification) return;
                    _showNotificationImpl = typeof fn === 'function' ? fn.bind(global) : null;
                }
            });

            _notificationProxyInstalled = true;
        } catch (error) {
            debugWarn('[AppSettings] Notification proxy install failed:', error.message);
        }
    }

    function installCallAudioProxy() {
        if (_callAudioProxyInstalled) return;

        const wrappedOutgoing = function () {
            if (!callAudioEnabled()) {
                stopManagedAudio();
                return null;
            }
            return _playOutgoingRingImpl ? _playOutgoingRingImpl.apply(global, arguments) : null;
        };

        const wrappedIncoming = function () {
            if (!callAudioEnabled()) {
                stopManagedAudio();
                return null;
            }
            return _playIncomingRingImpl ? _playIncomingRingImpl.apply(global, arguments) : null;
        };

        try {
            if (typeof global._playOutgoingRing === 'function') {
                _playOutgoingRingImpl = global._playOutgoingRing.bind(global);
            }
            if (typeof global._playIncomingRing === 'function') {
                _playIncomingRingImpl = global._playIncomingRing.bind(global);
            }

            Object.defineProperty(global, '_playOutgoingRing', {
                configurable: true,
                enumerable: true,
                get() {
                    return wrappedOutgoing;
                },
                set(fn) {
                    if (fn === wrappedOutgoing) return;
                    _playOutgoingRingImpl = typeof fn === 'function' ? fn.bind(global) : null;
                }
            });

            Object.defineProperty(global, '_playIncomingRing', {
                configurable: true,
                enumerable: true,
                get() {
                    return wrappedIncoming;
                },
                set(fn) {
                    if (fn === wrappedIncoming) return;
                    _playIncomingRingImpl = typeof fn === 'function' ? fn.bind(global) : null;
                }
            });

            _callAudioProxyInstalled = true;
        } catch (error) {
            console.warn('[AppSettings] Call audio proxy install failed:', error.message);
        }
    }

    function toLegacySettingsServiceShape(settings) {
        return {
            theme: settings.appearance?.theme || 'light',
            language: settings.appearance?.language || 'en',
            accentColor: settings.appearance?.accentColor || '#4F46E5',
            fontSize: settings.appearance?.fontSize || 16,
            notifications: settings.notifications?.messageNotifications !== false,
            soundEnabled: settings.notifications?.notificationSound !== false,
            popupNotifications: settings.notifications?.popupNotifications !== false,
            wallpaper: settings.chat?.wallpaper || 'default',
            privacy: clone(settings.privacy || {}),
            syncEnabled: settings.advanced?.syncEnabled !== false,
            appearance: clone(settings.appearance || {}),
            chat: clone(settings.chat || {}),
            calls: clone(settings.calls || {}),
            groups: clone(settings.groups || {}),
            status: clone(settings.status || {}),
            account: clone(settings.account || {}),
            advanced: clone(settings.advanced || {})
        };
    }

    function resolveLegacySetting(key) {
        const legacy = toLegacySettingsServiceShape(_data);
        if (!key) return clone(legacy);
        if (Object.prototype.hasOwnProperty.call(legacy, key)) return clone(legacy[key]);
        return clone(getByPath(_data, key));
    }

    function notifyLegacySettingsCallbacks() {
        const payload = toLegacySettingsServiceShape(_data);
        Object.entries(_legacySettingsCallbacks).forEach(([name, callback]) => {
            if (typeof callback !== 'function') return;
            try {
                callback(clone(payload));
            } catch (error) {
                console.warn('[AppSettings] Legacy settings callback failed:', name, error.message);
            }
        });
    }

    function installSettingsServiceBridge() {
        if (!_settingsServiceBridgeInstalled && global._settingsCallbacks && typeof global._settingsCallbacks === 'object') {
            _legacySettingsCallbacks = Object.assign({}, global._settingsCallbacks);
        }

        const target = global.SETTINGS_SERVICE && typeof global.SETTINGS_SERVICE === 'object'
            ? global.SETTINGS_SERVICE
            : {};

        try {
            Object.defineProperty(target, 'current', {
                configurable: true,
                enumerable: true,
                get() {
                    return toLegacySettingsServiceShape(_data);
                }
            });
        } catch (_) {
            target.current = toLegacySettingsServiceShape(_data);
        }

        target.applyTheme = function () {
            applyToDOM(_data);
            return _data.appearance?.theme || 'light';
        };

        target.getSetting = function (key) {
            return resolveLegacySetting(key);
        };

        target.clearUserSettings = function () {
            try {
                localStorage.removeItem('moodchat_settings');
            } catch (_) {}
            AppSettings.reset();
        };

        target.registerPageCallback = function (name, callback) {
            if (typeof callback !== 'function') return function noop() {};
            const callbackName = name || `callback_${Date.now()}`;
            _legacySettingsCallbacks[callbackName] = callback;
            try {
                callback(clone(toLegacySettingsServiceShape(_data)));
            } catch (_) {}
            global._settingsCallbacks = _legacySettingsCallbacks;
            return function unregisterCallback() {
                delete _legacySettingsCallbacks[callbackName];
                global._settingsCallbacks = _legacySettingsCallbacks;
            };
        };

        global.SETTINGS_SERVICE = target;
        global._settingsCallbacks = _legacySettingsCallbacks;
        _settingsServiceBridgeInstalled = true;
    }

    function normalizeFontSizeLabel(value) {
        if (value === 'small' || value === 'medium' || value === 'large') return value;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 'medium';
        if (numeric <= 14) return 'small';
        if (numeric >= 18) return 'large';
        return 'medium';
    }

    function normalizeIncomingSettings(raw) {
        const merged = mergeDeep(DEFAULTS, raw || {});
        const theme = merged.appearance?.theme || raw?.theme || 'light';
        const language = merged.appearance?.language || raw?.language || 'en';
        const fontLabel = normalizeFontSizeLabel(
            merged.chat?.fontSize || raw?.font_size || merged.chat_settings?.font_size || merged.appearance?.fontSize
        );
        const wallpaper = merged.chat?.wallpaper || raw?.wallpaper || merged.chat_settings?.wallpaper || 'default';
        const lastSeen = merged.privacy?.lastSeen || raw?.privacy_last_seen || 'everyone';
        const photoVisibility = merged.privacy?.photoVisibility || raw?.privacy_profile_photo || merged.privacy?.profileVisibility || 'everyone';
        const statusVisibility = merged.privacy?.statusVisibility || raw?.privacy_status || 'everyone';
        const notificationsEnabled = raw?.notification_enabled !== false && merged.notifications?.enabled !== false;
        const ringtoneEnabled = raw?.ringtone_enabled !== false && merged.notifications?.notificationSound !== false;
        const readReceipts = raw?.read_receipts !== false && merged.privacy?.readReceipts !== false;
        const autoDownloadMedia = raw?.auto_download_media !== false && merged.chat?.autoDownloadMedia !== false;

        return mergeDeep(merged, {
            appearance: {
                theme,
                language,
                fontSize: fontLabel === 'small' ? 14 : fontLabel === 'large' ? 18 : 16
            },
            notifications: {
                enabled: notificationsEnabled,
                messageNotifications: notificationsEnabled && merged.notifications?.messageNotifications !== false,
                groupNotifications: notificationsEnabled && merged.notifications?.groupNotifications !== false,
                friendRequestNotifications: notificationsEnabled && merged.notifications?.friendRequestNotifications !== false,
                callNotifications: notificationsEnabled && merged.notifications?.callNotifications !== false,
                statusNotifications: notificationsEnabled && merged.notifications?.statusNotifications !== false,
                moodNotifications: notificationsEnabled && merged.notifications?.moodNotifications !== false,
                notificationSound: ringtoneEnabled,
                popupNotifications: notificationsEnabled && merged.notifications?.popupNotifications !== false
            },
            privacy: {
                lastSeen,
                photoVisibility,
                profileVisibility: merged.privacy?.profileVisibility || photoVisibility,
                statusVisibility,
                readReceipts
            },
            chat: {
                wallpaper,
                fontSize: fontLabel,
                autoDownloadMedia,
                mediaDownload: autoDownloadMedia ? (merged.chat?.mediaDownload || 'wifi') : 'never',
                bubbleStyle: merged.chat?.bubbleStyle || merged.chat_settings?.bubble_style || 'default',
                enterKeySends: merged.chat?.enterKeySends === true || merged.chat_settings?.enter_to_send === true
            },
            calls: {
                ringtone: merged.calls?.ringtone || merged.call_settings?.ringtone || 'default',
                callVibration: merged.calls?.callVibration !== false && merged.call_settings?.vibration !== false,
                speakerDefault: merged.calls?.speakerDefault === true || merged.call_settings?.speaker_default === true,
                videoQuality: merged.calls?.videoQuality || merged.call_settings?.video_quality || 'auto',
                microphoneDefault: merged.calls?.microphoneDefault || merged.call_settings?.microphone_default || 'default',
                noiseCancellation: merged.calls?.noiseCancellation !== false && merged.call_settings?.noise_cancellation !== false,
                echoCancellation: merged.calls?.echoCancellation !== false && merged.call_settings?.echo_cancellation !== false
            },
            status: {
                visibility: statusVisibility,
                autoDownloadMedia
            },
            account: {
                profileVisibility: merged.account?.profileVisibility || photoVisibility,
                photoVisibility,
                lastSeen
            },
            advanced: {
                syncEnabled: merged.advanced?.syncEnabled !== false && raw?.syncEnabled !== false
            },
            theme,
            language,
            notification_enabled: notificationsEnabled,
            ringtone_enabled: ringtoneEnabled,
            dark_mode: theme === 'dark',
            privacy_last_seen: lastSeen,
            privacy_profile_photo: photoVisibility,
            privacy_status: statusVisibility,
            read_receipts: readReceipts,
            auto_download_media: autoDownloadMedia,
            font_size: fontLabel,
            wallpaper,
            syncEnabled: merged.advanced?.syncEnabled !== false && raw?.syncEnabled !== false
        });
    }

    function storageKeyForUser(userId) {
        return `${STORAGE_PREFIX}:${String(userId || 'guest')}`;
    }

    function toLocalStoreShape(settings) {
        return {
            userId: _activeUserId,
            theme: settings.appearance?.theme || 'light',
            language: settings.appearance?.language || 'en',
            notifications: {
                messages: settings.notifications?.messageNotifications !== false,
                calls: settings.notifications?.callNotifications !== false,
                groups: settings.notifications?.groupNotifications !== false
            },
            privacy: {
                lastSeen: settings.privacy?.lastSeen || 'everyone',
                readReceipts: settings.privacy?.readReceipts !== false,
                statusVisibility: settings.privacy?.statusVisibility || 'everyone'
            },
            chat: {
                autoDownloadMedia: settings.chat?.autoDownloadMedia !== false,
                fontSize: settings.chat?.fontSize || 'medium',
                enterKeySends: settings.chat?.enterKeySends === true
            },
            syncEnabled: settings.advanced?.syncEnabled !== false,
            updatedAt: new Date().toISOString()
        };
    }

    function persist() {
        const payload = {
            version: VERSION,
            userId: _activeUserId,
            updatedAt: Date.now(),
            data: _data
        };

        try {
            localStorage.setItem(storageKeyForUser(_activeUserId), JSON.stringify(payload));
            localStorage.setItem(LAST_USER_KEY, String(_activeUserId));
            localStorage.setItem(LEGACY_CACHE_KEY, JSON.stringify(payload));
            // FIX-009: Write canonical key so all iframes can read settings on init
            // without waiting for postMessage/BroadcastChannel delivery
            localStorage.setItem('kyn_app_settings', JSON.stringify(_data));
        } catch (error) {
            console.warn('[AppSettings] Failed to persist cache:', error.message);
        }

        // FIX-009: Dispatch CustomEvent for same-tab iframes (BroadcastChannel covers other tabs)
        try {
            global.dispatchEvent(new CustomEvent('kyn:settings:changed', { detail: _data }));
        } catch (_) {}

        try {
            if (global.LocalStoreSettings && typeof global.LocalStoreSettings.merge === 'function') {
                global.LocalStoreSettings.merge(toLocalStoreShape(_data));
            }
        } catch (error) {
            console.warn('[AppSettings] LocalStoreSettings sync failed:', error.message);
        }
    }

    function loadFromStorage(userId) {
        const candidates = [
            storageKeyForUser(userId),
            storageKeyForUser(localStorage.getItem(LAST_USER_KEY) || 'guest'),
            LEGACY_CACHE_KEY
        ];

        for (let i = 0; i < candidates.length; i += 1) {
            const key = candidates[i];
            if (!key) continue;
            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                const data = parsed?.data || parsed;
                if (data && typeof data === 'object') {
                    return normalizeIncomingSettings(data);
                }
            } catch (_) {}
        }

        return clone(DEFAULTS);
    }

    function readAuthSnapshot() {
        let userId = null;
        let token = global.__kynToken || global.__accessToken || null;

        try {
            const auth = localStorage.getItem('kynecta_auth');
            if (auth) {
                const parsed = JSON.parse(auth);
                userId = parsed?.userId || parsed?.user?.id || userId;
                token = parsed?.token || token;
            }
        } catch (_) {}

        if (!token) {
            try {
                token = localStorage.getItem('authToken')
                    || localStorage.getItem('token')
                    || localStorage.getItem('moodchat_token')
                    || localStorage.getItem('accessToken')
                    || null;
            } catch (_) {}
        }

        if (!userId) {
            try {
                const userRaw = localStorage.getItem('user') || localStorage.getItem('user_data');
                if (userRaw) {
                    const parsedUser = JSON.parse(userRaw);
                    userId = parsedUser?.id || parsedUser?.userId || null;
                }
            } catch (_) {}
        }

        return {
            userId: String(userId || 'guest'),
            token: token || null
        };
    }

    function normalizeApiBase(baseUrl) {
        return String(baseUrl || '').replace(/\/+$/, '');
    }

    function resolveSettingsApiBase() {
        const candidates = [
            function () { return typeof global.__getApiBase === 'function' ? global.__getApiBase() : ''; },
            function () { return typeof global.parent?.__getApiBase === 'function' ? global.parent.__getApiBase() : ''; },
            function () { return global.__API_GATEWAY?.baseUrl || ''; },
            function () { return global.parent?.__API_GATEWAY?.baseUrl || ''; },
            function () { return global.API_CONFIG?.baseUrl || ''; },
            function () { return global.parent?.API_CONFIG?.baseUrl || ''; },
            function () { return global.API_BASE_URL || ''; },
            function () { return global.parent?.API_BASE_URL || ''; },
            function () {
                if (!global.location) return '';
                return /^(localhost|127\.0\.0\.1)$/i.test(global.location.hostname)
                    ? 'http://localhost:4000/api'
                    : '';
            }
        ];

        for (let i = 0; i < candidates.length; i += 1) {
            try {
                const candidate = normalizeApiBase(candidates[i]());
                if (candidate) return candidate;
            } catch (_) {}
        }

        return '/api';
    }

    function getSettingsEndpoint() {
        return `${resolveSettingsApiBase()}/settings`;
    }

    function applyToDOM(settings) {
        try {
            const root = document.documentElement;
            // 'auto' theme has been removed app-wide — it required an async
            // matchMedia resolution that ran independently (and sometimes
            // inconsistently) on every page, which was one of the causes of
            // the theme "sparking" between modules. Only 'light' and 'dark'
            // are valid now; anything else falls back to 'light'.
            const theme = settings.appearance?.theme === 'dark' ? 'dark' : 'light';

            root.classList.remove('theme-light', 'theme-dark', 'theme-auto');
            root.classList.add(`theme-${theme}`);
            root.classList.toggle('dark-theme', theme === 'dark');
            root.setAttribute('data-theme', theme);
            root.setAttribute('data-theme-preference', theme);
            root.setAttribute('lang', settings.appearance?.language || 'en');
            root.style.fontSize = `${settings.appearance?.fontSize || 16}px`;
            root.style.setProperty('--base-font-size', `${settings.appearance?.fontSize || 16}px`);
            root.style.setProperty('--primary-color', settings.appearance?.accentColor || '#4F46E5');
            root.classList.toggle('reduce-motion', !!settings.appearance?.reduceMotion);
            try {
                localStorage.setItem('app_theme', theme);
                localStorage.setItem('app_font_size', String(settings.appearance?.fontSize || 16));
            } catch (_) {}

            if (theme === 'dark') {
                root.style.setProperty('--bg-color', '#111b21');
                root.style.setProperty('--text-primary', '#e9edef');
                root.style.setProperty('--text-secondary', '#8696a0');
                root.style.setProperty('--card-bg', '#202c33');
                root.style.setProperty('--border-color', '#2f3b43');
                root.style.setProperty('--input-bg', '#233138');
                root.style.setProperty('--hover-bg', '#1f2c33');
            } else {
                root.style.setProperty('--bg-color', '#ffffff');
                root.style.setProperty('--text-primary', '#111b21');
                root.style.setProperty('--text-secondary', '#667781');
                root.style.setProperty('--card-bg', '#ffffff');
                root.style.setProperty('--border-color', '#d1d7db');
                root.style.setProperty('--input-bg', '#f0f2f5');
                root.style.setProperty('--hover-bg', '#f5f6f6');
            }

            // FIX: several pages (settings.html, friend.html, status.html,
            // chat.html, admin-calls.html, game.html, index.html) style panels
            // and cards using var(--surface, ...), var(--accent, ...) and
            // var(--border, ...) — variable names this function never actually
            // set. Every one of those elements was silently using its
            // hardcoded fallback color forever, regardless of theme, which is
            // why some cards/panels within a module didn't match the rest of
            // the page once dark/light actually started working elsewhere.
            // Alias the real variables under these names so existing var()
            // references resolve correctly without editing every call site.
            root.style.setProperty('--surface', root.style.getPropertyValue('--card-bg'));
            root.style.setProperty('--accent', root.style.getPropertyValue('--primary-color'));
            root.style.setProperty('--border', root.style.getPropertyValue('--border-color'));

            Object.entries(settings.notifications || {}).forEach(([key, value]) => {
                if (typeof value !== 'object') {
                    root.setAttribute(`data-notification-${key}`, String(value));
                }
            });

            Object.entries(settings.privacy || {}).forEach(([key, value]) => {
                if (typeof value !== 'object') {
                    root.setAttribute(`data-privacy-${key}`, String(value));
                }
            });

            Object.entries(settings.chat || {}).forEach(([key, value]) => {
                if (typeof value !== 'object') {
                    root.setAttribute(`data-chat-${key}`, String(value));
                }
            });

            Object.entries(settings.calls || {}).forEach(([key, value]) => {
                if (typeof value !== 'object') {
                    root.setAttribute(`data-calls-${key}`, String(value));
                }
            });

            Object.entries(settings.groups || {}).forEach(([key, value]) => {
                if (typeof value !== 'object') {
                    root.setAttribute(`data-groups-${key}`, String(value));
                }
            });

            Object.entries(settings.status || {}).forEach(([key, value]) => {
                if (typeof value !== 'object') {
                    root.setAttribute(`data-status-${key}`, String(value));
                }
            });

            if (settings.chat?.wallpaper) {
                root.setAttribute('data-chat-wallpaper', settings.chat.wallpaper);
            }

            if (!callAudioEnabled()) {
                stopManagedAudio();
            }
        } catch (error) {
            console.warn('[AppSettings] DOM apply failed:', error.message);
        }
    }

    function syncLegacyStores() {
        installSettingsServiceBridge();

        try {
            if (global.SettingsStore && typeof global.SettingsStore.load === 'function') {
                global.SettingsStore.load();
            }
        } catch (_) {}

        try {
            if (global.MoodChatSettingsManager && global.MoodChatSettingsManager.currentSettings) {
                global.MoodChatSettingsManager.currentSettings = clone(_data);
            }
        } catch (_) {}

        notifyLegacySettingsCallbacks();
    }

    function broadcastMessage(message) {
        if (!_broadcast) return;
        try {
            _broadcast.postMessage({
                ...message,
                userId: _activeUserId,
                source: 'AppSettings',
                timestamp: Date.now()
            });
        } catch (_) {}
    }

    function notifySubscribers(path, value, meta) {
        const snapshot = clone(_data);
        _subscribers.forEach((subscriber) => {
            try {
                if (!subscriber.filter || path === '*' || String(path || '').startsWith(subscriber.filter)) {
                    subscriber.callback(snapshot, path, value, meta || {});
                }
            } catch (error) {
                console.error('[AppSettings] Subscriber error:', error);
            }
        });

        // Only fire appSettingsChanged (and downstream SETTING_CHANGED postMessages)
        // when the change was user-triggered or explicitly flagged. Background loads
        // (server sync, boot, broadcast-receive) should NOT flood the console or
        // cause iframe storm with SETTING_CHANGED messages.
        const source = (meta && meta.source) || '';
        const isUserChange = (meta && meta.userTriggered === true) ||
                             source === 'user-action' ||
                             source === 'ui-save' ||
                             source === 'local-set';
        const isBackgroundLoad = source === 'server-sync' || source === 'broadcast' ||
                                 source === 'boot' || source === 'login-event' ||
                                 source === 'parent-socket-relay' || source === 'merge';

        try {
            global.dispatchEvent(new CustomEvent('appSettingsChanged', {
                detail: {
                    settings: snapshot,
                    path,
                    value,
                    userId: _activeUserId,
                    userTriggered: isUserChange,
                    backgroundLoad: isBackgroundLoad,
                    ...(meta || {})
                }
            }));
        } catch (_) {}
    }

    function setActiveUser(userId) {
        const nextUserId = String(userId || 'guest');
        if (_activeUserId === nextUserId) return;
        _activeUserId = nextUserId;
        _data = loadFromStorage(_activeUserId);
        applyToDOM(_data);
        persist();
        notifySubscribers('*', _data, { reason: 'user-switch' });
        debugLog('[AppSettings] Switched cache namespace to user:', _activeUserId);
    }

    function setupBroadcast() {
        if (typeof BroadcastChannel === 'undefined') return;
        try {
            _broadcast = new BroadcastChannel(BROADCAST_CHANNEL);
            _broadcast.onmessage = function (event) {
                const message = event.data || {};
                if (message.source === 'AppSettings' && message.userId === _activeUserId) {
                    if (message.type === 'set' && message.path) {
                        AppSettings.set(message.path, message.value, { silent: false, skipBroadcast: true, source: 'broadcast' });
                    }
                    if (message.type === 'merge' && message.settings) {
                        AppSettings.merge(message.settings, { silent: false, skipBroadcast: true, source: 'broadcast' });
                    }
                }
            };
        } catch (error) {
            debugWarn('[AppSettings] BroadcastChannel unavailable:', error.message);
        }
    }

    async function fetchServerSettings() {
        const auth = readAuthSnapshot();
        // Bail out silently — no token means we are pre-login or in an iframe that
        // hasn't received the session yet.  Attempting the request would always fail
        // with a 401/500 and flood the console with "Backend settings load failed".
        if (!auth.token || !auth.userId || auth.userId === 'guest') return null;

        setActiveUser(auth.userId);

        const response = await fetch(getSettingsEndpoint(), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${auth.token}`
            },
            credentials: 'include'
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
        }
        return payload?.data?.settings || payload?.settings || payload?.data || payload || null;
    }

    function setupAuthListeners() {
        const loginHandler = function (event) {
            const detail = event?.detail || {};
            const incomingUserId = detail?.user?.id || detail?.userId || detail?.id || null;
            if (incomingUserId) {
                setActiveUser(incomingUserId);
            }
            if (detail.settings && typeof detail.settings === 'object') {
                AppSettings.merge(detail.settings, { silent: false, source: 'login-event' });
            }
            AppSettings.refreshFromServer({ force: true, reason: 'login-event' }).catch(() => {});
        };

        global.addEventListener('session:ready', loginHandler);
        global.addEventListener('user-login', loginHandler);
        global.addEventListener('user-logged-in', loginHandler);
        global.addEventListener('token:stored', function () {
            AppSettings.refreshFromServer({ force: true, reason: 'token-stored' }).catch(() => {});
        });

        global.addEventListener('user-logout', function () {
            setActiveUser('guest');
        });

        global.addEventListener('storage', function (event) {
            if (event.key === 'kynecta_auth' || event.key === LAST_USER_KEY) {
                const auth = readAuthSnapshot();
                setActiveUser(auth.userId);
                AppSettings.refreshFromServer({ force: true, reason: 'storage-sync' }).catch(() => {});
            }
        });
    }

    function boot() {
        const auth = readAuthSnapshot();
        _activeUserId = auth.userId || 'guest';
        _data = loadFromStorage(_activeUserId);
        installNotificationProxy();
        installCallAudioProxy();
        installSettingsServiceBridge();
        setupBroadcast();
        applyToDOM(_data);
        persist();
        setupAuthListeners();

        _readyResolve();
        try {
            global.dispatchEvent(new CustomEvent('appSettingsReady', {
                detail: {
                    settings: clone(_data),
                    userId: _activeUserId
                }
            }));
        } catch (_) {}

        debugLog('[AppSettings] Ready with local cache for user:', _activeUserId);

        if (auth.token && auth.userId && auth.userId !== 'guest') {
            AppSettings.refreshFromServer({ force: false, reason: 'boot' }).catch(() => {});
        }
    }

    const AppSettings = {
        get ready() {
            return _ready;
        },

        get DEFAULTS() {
            return DEFAULTS;
        },

        get currentUserId() {
            return _activeUserId;
        },

        get(path) {
            if (!path) return clone(_data);
            return clone(getByPath(_data, path));
        },

        getAll() {
            return clone(_data);
        },

        set(path, value, options) {
            const opts = options || {};
            if (!path) return;

            const current = getByPath(_data, path);
            if (!opts.force && isEqual(current, value)) return;

            setByPath(_data, path, clone(value));
            _data = normalizeIncomingSettings(_data);
            persist();
            applyToDOM(_data);
            syncLegacyStores();

            if (!opts.silent) {
                notifySubscribers(path, value, { source: opts.source || 'local-set' });
            }

            if (!opts.skipBroadcast) {
                broadcastMessage({ type: 'set', path, value });
            }

            debugLog('[AppSettings] Applied setting:', path, value);
        },

        merge(partial, options) {
            const opts = options || {};
            if (!partial || typeof partial !== 'object') return;

            const nextData = normalizeIncomingSettings(mergeDeep(_data, partial));
            if (!opts.force && isEqual(_data, nextData)) return;

            _data = nextData;
            persist();
            applyToDOM(_data);
            syncLegacyStores();

            if (!opts.silent) {
                notifySubscribers('*', clone(_data), { source: opts.source || 'merge' });
            }

            if (!opts.skipBroadcast) {
                broadcastMessage({ type: 'merge', settings: clone(partial) });
            }

            debugLog('[AppSettings] Merged settings payload');
        },

        reset() {
            _data = clone(DEFAULTS);
            persist();
            applyToDOM(_data);
            syncLegacyStores();
            notifySubscribers('*', clone(_data), { source: 'reset' });
            broadcastMessage({ type: 'merge', settings: clone(_data) });
        },

        subscribe(callback, filter) {
            if (typeof callback !== 'function') return function noop() {};
            const subscription = {
                id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                callback,
                filter: filter || null
            };
            _subscribers.push(subscription);
            try {
                callback(clone(_data), null, null, { source: 'initial' });
            } catch (_) {}
            return function unsubscribe() {
                _subscribers = _subscribers.filter((entry) => entry.id !== subscription.id);
            };
        },

        loadLocal(userId) {
            setActiveUser(userId || readAuthSnapshot().userId || 'guest');
            return clone(_data);
        },

        async refreshFromServer(options) {
            const opts = options || {};
            if (_serverSyncPromise && !opts.force) return _serverSyncPromise;

            _serverSyncPromise = fetchServerSettings()
                .then((serverSettings) => {
                    if (!serverSettings || typeof serverSettings !== 'object') return null;
                    debugLog('[AppSettings] Loaded settings from backend');
                    AppSettings.merge(serverSettings, {
                        silent: false,
                        skipBroadcast: true,
                        source: opts.reason || 'server-sync'
                    });
                    return clone(_data);
                })
                .catch((error) => {
                    const message = error?.message || 'Unknown error';
                    // Only log in debug mode — these are expected while the backend
                    // is starting up or when the user is not yet authenticated.
                    // Using debugWarn (not console.warn) prevents console noise on every page load.
                    debugWarn('[AppSettings] Backend settings load failed:', message);
                    return null;
                })
                .finally(() => {
                    _serverSyncPromise = null;
                });

            return _serverSyncPromise;
        },

        syncOnLogin(detail) {
            const payload = detail || {};
            const incomingUserId = payload?.user?.id || payload?.userId || readAuthSnapshot().userId;
            if (incomingUserId) {
                setActiveUser(incomingUserId);
            }
            if (payload.settings && typeof payload.settings === 'object') {
                AppSettings.merge(payload.settings, {
                    silent: false,
                    source: 'login-payload'
                });
            }
            return AppSettings.refreshFromServer({ force: true, reason: 'sync-on-login' });
        },

        diagnostics() {
            return {
                version: VERSION,
                userId: _activeUserId,
                subscriberCount: _subscribers.length,
                hasBroadcastChannel: !!_broadcast,
                data: clone(_data)
            };
        }
    };

    global.AppSettings = AppSettings;

    global.addEventListener('settingsUpdated', function (event) {
        const settings = event?.detail?.settings || event?.detail || null;
        if (settings && typeof settings === 'object') {
            AppSettings.merge(settings, { source: 'legacy-settingsUpdated' });
        }
    });

    global.addEventListener('settings_updated', function (event) {
        const settings = event?.detail?.settings || event?.detail || null;
        if (settings && typeof settings === 'object') {
            AppSettings.merge(settings, {
                skipBroadcast: true,
                source: 'socket-settings_updated'
            });
        }
    });

    global.addEventListener('SETTINGS_GLOBAL_UPDATE', function (event) {
        const detail = event?.detail || {};
        if (detail.section && detail.key !== undefined) {
            AppSettings.set(`${detail.section}.${detail.key}`, detail.value, { source: 'legacy-global-update' });
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    debugLog('[AppSettings] Module registered');

    // FIX-009: KynSettings — uniform API for all modules/iframes to read settings
    // Usage: const s = window.KynSettings.load(); window.KynSettings.onChange(cb);
    global.KynSettings = {
        load: function() {
            try { return JSON.parse(localStorage.getItem('kyn_app_settings') || '{}'); } catch(_) { return {}; }
        },
        onChange: function(cb) {
            if (typeof cb !== 'function') return function(){};
            function onCustom(e) { cb(e.detail || global.KynSettings.load()); }
            function onStorage(e) {
                if (e.key === 'kyn_app_settings') {
                    try { cb(JSON.parse(e.newValue || '{}')); } catch(_) { cb(global.KynSettings.load()); }
                }
            }
            global.addEventListener('kyn:settings:changed', onCustom);
            global.addEventListener('storage', onStorage);
            return function() {
                global.removeEventListener('kyn:settings:changed', onCustom);
                global.removeEventListener('storage', onStorage);
            };
        },
        apply: function(partial) {
            if (global.AppSettings && typeof global.AppSettings.merge === 'function') {
                global.AppSettings.merge(partial);
            }
        }
    };

})(typeof window !== 'undefined' ? window : globalThis);