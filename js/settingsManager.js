/**
 * settingsManager.js  (Local-First Edition)
 * Centralized settings management for MoodChat.
 *
 * FIXES applied:
 *   ✅  saveSetting() now calls saveSettingsLocal() + LocalStoreSettings.set()
 *   ✅  loadSettings() reads from LocalStoreSettings (knecta_settings_cache) first,
 *       then falls back to legacy moodchat_settings_<userId> key and migrates it
 *   ✅  saveToLocalStorage() writes to BOTH legacy key AND LocalStoreSettings
 *   ✅  broadcastChange() reset branch fixed (was sending wrong type wrapper)
 *   ✅  initialize() accepts null/undefined userId gracefully
 *   ✅  queueBackendSync() now delegates to SettingsSyncEngine if available
 *   ✅  Coordinates with MoodChatSettingsManager ↔ LocalStoreSettings ↔ KynectaStore
 */

(function () {
    'use strict';

    if (window.MoodChatSettingsManager) {
        console.warn('[SettingsManager] Already loaded — skipping');
        return;
    }

    // ─── Storage key helpers ──────────────────────────────────────────────────────
    const UNIFIED_KEY = 'knecta_settings_cache';  // LocalStoreSettings canonical key

    function _legacyKey(userId) {
        return 'moodchat_settings_' + (userId || 'default');
    }

    class SettingsManager {
        constructor() {
            this.defaultSettings = {
                account: {
                    displayName: 'User',
                    username: 'user123',
                    bio: "Hello! I'm using MoodChat",
                    profileVisibility: 'friends',
                    lastSeen: true,
                    onlineStatus: true,
                    photoVisibility: 'friends'
                },
                privacy: {
                    whoCanAddMe: 'friendsOfFriends',
                    readReceipts: true,
                    typingIndicators: true,
                    messageForwarding: true,
                    contactDiscovery: true,
                    friendPermissions: {
                        canMessage: true,
                        canCall: true,
                        canSeeStatus: true,
                        canSeePhoto: true,
                        canSeeLastSeen: true,
                        canForward: true,
                        canScreenshot: false
                    },
                    moodVisibility: {
                        showMoodTo: 'friends',
                        moodHistory: true,
                        moodAnalytics: true
                    }
                },
                chat: {
                    wallpaper: 'default',
                    enterKeySends: false,
                    mediaDownload: 'wifi',
                    saveMedia: false,
                    messageHistory: 'forever',
                    disappearingMessages: 'off',
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
                    qrCode: true,
                    friendSuggestions: true,
                    temporaryFriends: false,
                    friendshipNotes: true,
                    friendCategories: true,
                    trustScore: false,
                    friendAnalytics: false
                },
                groups: {
                    autoJoinGroups: false,
                    groupInvitations: 'friends',
                    groupPrivacy: 'public',
                    groupAnnouncements: true,
                    groupMediaDownload: false,
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
                    videoQuality: 'auto',
                    cameraDefault: 'front',
                    noiseCancellation: true,
                    echoCancellation: true,
                    liveReactions: true,
                    inCallChat: true,
                    sharedWhiteboard: true,
                    sharedNotes: true,
                    polls: true
                },
                notifications: {
                    messageNotifications: true,
                    groupNotifications: true,
                    friendRequestNotifications: true,
                    callNotifications: true,
                    statusNotifications: true,
                    moodNotifications: true,
                    notificationSound: true,
                    notificationVibration: true,
                    popupNotifications: false,
                    notificationLight: false,
                    doNotDisturb: false,
                    dndSchedule: 'custom',
                    dndAllowCalls: false,
                    dndAllowMoodUpdates: true
                },
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
                advanced: {
                    offlineMode: true,
                    intranetSupport: false,
                    lowBandwidth: false,
                    debugMode: false,
                    dataSaver: false,
                    syncEnabled: false   // ← cloud sync toggle lives here
                }
            };

            this.currentSettings = {};
            this.broadcastChannel = null;
            this.userId = null;
            this.changeListeners = new Map();
            this.initialized = false;
            this.pendingChanges = [];

            console.log('[SettingsManager] Constructor complete');
        }

        // ─── Public API ───────────────────────────────────────────────────────────

        async initialize(userId) {
            // Accept null / undefined / empty string safely
            this.userId = (userId && userId !== 'default' && userId !== 'null') ? userId : _tryReadUserId();

            try {
                await this.loadSettings();
                this.setupBroadcastChannel();
                this.applySettings(this.currentSettings);
                this.setupStorageListener();
                this._subscribeToLocalStore();       // ← NEW: stay in sync
                this._bridgeToKynectaStore();        // ← NEW: push into reactive store

                this.initialized = true;
                console.log('[SettingsManager] Initialized for user:', this.userId);
                this.triggerChange('initialized', this.currentSettings);

                // Push loaded settings into AppSettings (single source of truth)
                if (window.AppSettings) {
                    window.AppSettings.merge(this.currentSettings, { silent: false });
                }

                // Subscribe to AppSettings so external changes (other modules, iframes)
                // flow back into MoodChatSettingsManager without infinite loops.
                if (window.AppSettings && !this._appSettingsUnsub) {
                    this._appSettingsUnsub = window.AppSettings.subscribe((settings, path) => {
                        if (!path) return; // skip the initial full-call we just did
                        const cur = this.getNestedValue(this.currentSettings, path);
                        const next = window.AppSettings.get(path);
                        if (JSON.stringify(cur) !== JSON.stringify(next)) {
                            this.setNestedValue(this.currentSettings, path, next);
                            this.applySetting(path, next);
                        }
                    });
                }
            } catch (error) {
                console.error('[SettingsManager] Init failed:', error);
                this.currentSettings = this.cloneDeep(this.defaultSettings);
                this.applySettings(this.currentSettings);
            }
        }

        async loadSettings() {
            // Priority 1: LocalStoreSettings (knecta_settings_cache) — the canonical store
            const store = window.LocalStoreSettings;
            if (store) {
                const local = store.load();
                if (local && Object.keys(local).length > 1) {
                    // Map LocalStoreSettings flat schema → full MoodChat settings schema
                    const mapped = _localToMoodChat(local, this.defaultSettings);
                    this.currentSettings = this.mergeDeep(
                        this.cloneDeep(this.defaultSettings),
                        mapped
                    );
                    console.log('[SettingsManager] Loaded from LocalStoreSettings (canonical)');
                    this._saveToLegacyKey(); // keep legacy key in sync
                    return;
                }
            }

            // Priority 2: Legacy moodchat_settings_<userId> key
            const legacyKey = _legacyKey(this.userId);
            try {
                const saved = localStorage.getItem(legacyKey);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    this.currentSettings = this.mergeDeep(
                        this.cloneDeep(this.defaultSettings),
                        parsed
                    );
                    console.log('[SettingsManager] Loaded from legacy key — migrating to LocalStoreSettings');
                    // Migrate to canonical store
                    this.saveToLocalStorage();
                    return;
                }
            } catch (e) { console.warn('[SettingsManager] Legacy load failed:', e.message); }

            // Fallback: defaults
            this.currentSettings = this.cloneDeep(this.defaultSettings);
            console.log('[SettingsManager] Using defaults');
            this.saveToLocalStorage();
        }

        /**
         * Save a setting value.
         * FIXED: now calls saveSettingsLocal() and LocalStoreSettings.set()
         */
        saveSetting(key, value, immediate = true) {
            if (!this.initialized) {
                console.warn('[SettingsManager] Not initialized yet — queuing:', key);
                this.pendingChanges.push({ key, value, timestamp: Date.now() });
                return;
            }

            // 1. Update in-memory cache
            this.setNestedValue(this.currentSettings, key, value);

            // 2. Persist to canonical local store immediately (offline-safe)
            this._saveToLocalStoreByKey(key, value);

            // 3. Persist to legacy key for backwards compat
            this._saveToLegacyKey();
            if (window.SettingsStore) {
                window.SettingsStore.set(key, value);
            }

            // 4. Broadcast to other tabs
            this.broadcastChange({ key, value });

            // 5. Apply to UI instantly
            if (immediate) this.applySetting(key, value);

            // 6. Trigger listeners
            this.triggerChange(key, value);

            // 7. Queue cloud sync (non-blocking)
            this.queueBackendSync(key, value);

            // 8. Push into AppSettings (single source of truth) — avoids infinite loop
            //    because AppSettings.set() checks JSON equality before re-notifying.
            if (window.AppSettings) {
                window.AppSettings.set(key, value);
            }

            console.log('[SettingsManager] Saved:', key, '=', value);
        }

        getSetting(key) {
            return this.getNestedValue(this.currentSettings, key);
        }

        getAllSettings() {
            return this.cloneDeep(this.currentSettings);
        }

        resetToDefaults() {
            this.currentSettings = this.cloneDeep(this.defaultSettings);
            this.saveToLocalStorage();
            this.applySettings(this.currentSettings);

            // FIX: broadcast as type:'reset' inside the standard wrapper
            if (this.broadcastChannel) {
                try {
                    this.broadcastChannel.postMessage({
                        type: 'reset',    // top-level type so receiver can switch on it
                        timestamp: Date.now(),
                        userId: this.userId
                    });
                } catch (e) { console.error('[SettingsManager] Broadcast reset error:', e); }
            }
            // Sync reset into AppSettings
            if (window.AppSettings) window.AppSettings.merge(this.currentSettings);
            console.log('[SettingsManager] Reset to defaults');
        }

        exportSettings() {
            return JSON.stringify(this.currentSettings, null, 2);
        }

        importSettings(json) {
            try {
                const imported = JSON.parse(json);
                this.currentSettings = this.mergeDeep(
                    this.cloneDeep(this.defaultSettings),
                    imported
                );
                this.saveToLocalStorage();
                this.applySettings(this.currentSettings);
                if (this.broadcastChannel) {
                    try {
                        this.broadcastChannel.postMessage({ type: 'import', timestamp: Date.now(), userId: this.userId });
                    } catch (_) {}
                }
                console.log('[SettingsManager] Settings imported');
                return true;
            } catch (e) {
                console.error('[SettingsManager] Import failed:', e);
                return false;
            }
        }

        addChangeListener(key, callback)    {
            if (!this.changeListeners.has(key)) this.changeListeners.set(key, []);
            this.changeListeners.get(key).push(callback);
        }
        removeChangeListener(key, callback) {
            if (this.changeListeners.has(key)) {
                const arr = this.changeListeners.get(key);
                const i = arr.indexOf(callback);
                if (i > -1) arr.splice(i, 1);
            }
        }

        isFeatureEnabled(feature) {
            const featureMap = {
                moodSharing:      'privacy.moodVisibility.showMoodTo',
                moodHistory:      'privacy.moodVisibility.moodHistory',
                smartReplies:     'chat.aiFeatures.smartReplies',
                liveReactions:    'calls.liveReactions',
                sharedWhiteboard: 'calls.sharedWhiteboard'
            };
            const path  = featureMap[feature];
            if (!path) return false;
            const value = this.getSetting(path);
            return value !== false && value !== 'nobody' && value !== 'off';
        }

        getCurrentTheme()       { return this.getSetting('appearance.theme')       || 'light'; }
        getCurrentAccentColor() { return this.getSetting('appearance.accentColor') || '#4F46E5'; }

        // ─── Apply methods (unchanged logic, kept complete) ───────────────────────

        applySettings(settings) {
            if (!settings) return;
            if (settings.appearance)  this.applyAppearanceSettings(settings.appearance);
            if (settings.notifications) this.applyNotificationSettings(settings.notifications);
            if (settings.privacy)     this.applyPrivacySettings(settings.privacy);
            this.triggerChange('settingsApplied', settings);
        }

        applySetting(key, value) {
            if (key.startsWith('appearance.'))   this.applyAppearanceSetting(key.replace('appearance.', ''), value);
            else if (key.startsWith('notifications.')) this.applyNotificationSetting(key.replace('notifications.', ''), value);
            else if (key.startsWith('privacy.'))  this.applyPrivacySetting(key.replace('privacy.', ''), value);
            this.triggerChange('settingApplied:' + key, value);
        }

        applyAppearanceSettings(appearance) {
            if (!appearance) return;
            if (appearance.theme)        this.applyTheme(appearance.theme);
            if (appearance.accentColor)  this.applyAccentColor(appearance.accentColor);
            if (appearance.fontSize)     this.applyFontSize(appearance.fontSize);
            if (appearance.language)     this.applyLanguage(appearance.language);
            if (appearance.reduceMotion !== undefined) this.applyReduceMotion(appearance.reduceMotion);
            if (appearance.moodColorScheme) this.applyMoodColorScheme(appearance.moodColorScheme);
            if (appearance.moodAnimation !== undefined) this.applyMoodAnimation(appearance.moodAnimation);
        }

        applyAppearanceSetting(key, value) {
            const map = {
                theme: () => this.applyTheme(value),
                accentColor: () => this.applyAccentColor(value),
                fontSize: () => this.applyFontSize(value),
                language: () => this.applyLanguage(value),
                reduceMotion: () => this.applyReduceMotion(value),
                moodColorScheme: () => this.applyMoodColorScheme(value),
                moodAnimation: () => this.applyMoodAnimation(value)
            };
            if (map[key]) map[key]();
        }

        applyTheme(theme) {
            const html = document.documentElement;
            html.classList.remove('theme-light', 'theme-dark', 'theme-auto');
            html.classList.add('theme-' + theme);
            html.setAttribute('data-theme', theme);
            if (theme === 'dark') {
                this.setCssVariable('--bg-color', '#1a1a1a');
                this.setCssVariable('--text-primary', '#ffffff');
                this.setCssVariable('--text-secondary', '#b0b3b8');
                this.setCssVariable('--card-bg', '#242526');
                this.setCssVariable('--border-color', '#3e4042');
            } else {
                this.setCssVariable('--bg-color', '#ffffff');
                this.setCssVariable('--text-primary', '#050505');
                this.setCssVariable('--text-secondary', '#65676b');
                this.setCssVariable('--card-bg', '#ffffff');
                this.setCssVariable('--border-color', '#dddfe2');
            }
        }

        applyAccentColor(color) {
            this.setCssVariable('--primary-color', color);
            this.setCssVariable('--primary-dark', this.shadeColor(color, -20));
            try { localStorage.setItem('moodchat_accent_color', color); } catch (_) {}
        }

        applyFontSize(size) {
            this.setCssVariable('--base-font-size', size + 'px');
            document.documentElement.style.fontSize = size + 'px';
        }

        applyLanguage(language) {
            document.documentElement.lang = language;
            console.log('[SettingsManager] Language →', language);
        }

        applyReduceMotion(reduceMotion) {
            document.documentElement.classList.toggle('reduce-motion', !!reduceMotion);
        }

        applyMoodColorScheme(scheme) {
            const html = document.documentElement;
            html.classList.remove('mood-scheme-vibrant', 'mood-scheme-pastel', 'mood-scheme-monochrome');
            html.classList.add('mood-scheme-' + scheme);
            const palettes = {
                vibrant:    { happy: '#FFD700', sad: '#4169E1', excited: '#FF4500', calm: '#32CD32' },
                pastel:     { happy: '#FFFACD', sad: '#ADD8E6', excited: '#FFB6C1', calm: '#98FB98' },
                monochrome: { happy: '#808080', sad: '#606060', excited: '#404040', calm: '#A0A0A0' }
            };
            const p = palettes[scheme] || palettes.vibrant;
            this.setCssVariable('--mood-happy',   p.happy);
            this.setCssVariable('--mood-sad',     p.sad);
            this.setCssVariable('--mood-excited', p.excited);
            this.setCssVariable('--mood-calm',    p.calm);
        }

        applyMoodAnimation(enabled) {
            document.documentElement.classList.toggle('mood-animation-enabled', !!enabled);
        }

        applyNotificationSettings(notifications) {
            Object.keys(notifications).forEach(key => {
                if (typeof notifications[key] === 'boolean') {
                    this.applyNotificationSetting(key, notifications[key]);
                }
            });
        }

        applyNotificationSetting(key, value) {
            document.documentElement.setAttribute('data-notification-' + key, value.toString());
            if (key === 'doNotDisturb') {
                document.documentElement.classList.toggle('do-not-disturb', !!value);
            }
        }

        applyPrivacySettings(privacy) {
            Object.keys(privacy).forEach(key => {
                if (typeof privacy[key] === 'boolean' || typeof privacy[key] === 'string') {
                    this.applyPrivacySetting(key, privacy[key]);
                }
            });
        }

        applyPrivacySetting(key, value) {
            document.documentElement.setAttribute('data-privacy-' + key, value.toString());
            if (key === 'whoCanAddMe')  this.updateFriendRequestUI(value);
            if (key === 'moodVisibility') this.updateMoodVisibilityUI(value);
        }

        updateFriendRequestUI(permission) {
            console.log('[SettingsManager] Friend request UI →', permission);
        }

        updateMoodVisibilityUI(visibility) {
            console.log('[SettingsManager] Mood visibility UI →', visibility);
        }

        // ─── Storage helpers ──────────────────────────────────────────────────────

        /**
         * FIXED saveToLocalStorage: writes to BOTH canonical store AND legacy key.
         */
        saveToLocalStorage() {
            // 1. Write to LocalStoreSettings (canonical)
            const store = window.LocalStoreSettings;
            if (store) {
                try {
                    const flat = _moodChatToLocal(this.currentSettings);
                    store.merge(flat);
                } catch (e) { console.warn('[SettingsManager] LocalStoreSettings merge failed:', e.message); }
            }

            // 2. Write to legacy key (backwards compat)
            this._saveToLegacyKey();

            // 3. Sync into KynectaStore if available
            this._syncToKynectaStore();
        }

        _saveToLegacyKey() {
            const key = _legacyKey(this.userId);
            try {
                localStorage.setItem(key, JSON.stringify(this.currentSettings));
                localStorage.setItem(key + '_updated', Date.now().toString());
            } catch (e) {
                if (e.name === 'QuotaExceededError') this.handleStorageFull();
            }
        }

        /**
         * FIXED: write a single path into LocalStoreSettings using the correct key mapping.
         */
        _saveToLocalStoreByKey(path, value) {
            if (window.saveSettingsLocal) {
                // Derive section + key from dot path
                const parts = path.split('.');
                const section = parts[0];
                const key = parts.slice(1).join('.') || parts[0];
                window.saveSettingsLocal(section, key, value);
            } else if (window.LocalStoreSettings) {
                // Direct write using same path
                window.LocalStoreSettings.set(path, value);
            }
        }

        handleStorageFull() {
            console.warn('[SettingsManager] localStorage full — cleaning up');
            const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k && k.startsWith('moodchat_')) {
                    const ts = parseInt(localStorage.getItem(k + '_updated') || '0', 10);
                    if (ts < weekAgo) {
                        localStorage.removeItem(k);
                        localStorage.removeItem(k + '_updated');
                    }
                }
            }
        }

        // ─── Backend sync (now delegates to SettingsSyncEngine) ──────────────────

        queueBackendSync(key, value) {
            this.pendingChanges.push({ key, value, timestamp: Date.now(), synced: false });

            // Delegate to SettingsSyncEngine if available
            const sync = window.SettingsSyncEngine;
            if (sync) {
                sync.syncSettingUpdate(key, value).catch(() => {});
            }
        }

        // ─── Cross-module bridges ─────────────────────────────────────────────────

        /** Subscribe to LocalStoreSettings so external writes sync back in */
        _subscribeToLocalStore() {
            const store = window.LocalStoreSettings;
            if (!store) return;
            store.subscribe((path, value, allSettings) => {
                // Avoid infinite loop — only apply if value differs
                const current = this.getNestedValue(this.currentSettings, path);
                if (JSON.stringify(current) !== JSON.stringify(value)) {
                    this.setNestedValue(this.currentSettings, path, value);
                    this.applySetting(path, value);
                    this.triggerChange(path, value);
                }
            });
        }

        /** Push settings into KynectaStore reactive layer */
        _bridgeToKynectaStore() {
            this._syncToKynectaStore();
            // Also update KynectaStore whenever settings change
            this.addChangeListener('all', () => this._syncToKynectaStore());
        }

        _syncToKynectaStore() {
            const kStore = window.KynectaStore;
            if (!kStore) return;
            try {
                const flat = _moodChatToKynectaStore(this.currentSettings);
                kStore.set('settings', flat, { persist: true, silent: false });
            } catch (e) { /* KynectaStore may not be ready */ }
        }

        // ─── BroadcastChannel ─────────────────────────────────────────────────────

        setupBroadcastChannel() {
            if (typeof BroadcastChannel === 'undefined') return;
            try {
                this.broadcastChannel = new BroadcastChannel('moodchat_settings');
                this.broadcastChannel.onmessage = (event) => {
                    const msg = event.data || {};

                    // FIXED: check top-level type (reset/import) or settingsChange
                    if (msg.type === 'settingsChange' && msg.data) {
                        const { key, value } = msg.data;
                        this.setNestedValue(this.currentSettings, key, value);
                        this.applySetting(key, value);
                        this.triggerChange(key, value);
                    } else if (msg.type === 'reset') {
                        // Avoid calling resetToDefaults() (which re-broadcasts) — apply silently
                        this.currentSettings = this.cloneDeep(this.defaultSettings);
                        this.applySettings(this.currentSettings);
                    } else if (msg.type === 'import') {
                        this.loadSettings().then(() => this.applySettings(this.currentSettings));
                    }
                };
                console.log('[SettingsManager] BroadcastChannel ready');
            } catch (e) { console.error('[SettingsManager] BroadcastChannel error:', e); }
        }

        broadcastChange(data) {
            if (!this.broadcastChannel) return;
            try {
                this.broadcastChannel.postMessage({
                    type: 'settingsChange',
                    data,                          // { key, value }
                    timestamp: Date.now(),
                    userId: this.userId
                });
            } catch (e) { console.error('[SettingsManager] Broadcast error:', e); }
        }

        setupStorageListener() {
            window.addEventListener('storage', (event) => {
                if (event.key !== _legacyKey(this.userId) || !event.newValue) return;
                try {
                    const newSettings = JSON.parse(event.newValue);
                    const changes = this.findChanges(this.currentSettings, newSettings);
                    changes.forEach(({ key, value }) => {
                        this.setNestedValue(this.currentSettings, key, value);
                        this.applySetting(key, value);
                        this.triggerChange(key, value);
                    });
                } catch (e) { console.error('[SettingsManager] Storage event error:', e); }
            });
        }

        // ─── Change listeners ─────────────────────────────────────────────────────

        triggerChange(key, value) {
            [key, 'all'].forEach(k => {
                (this.changeListeners.get(k) || []).forEach(fn => {
                    try { fn(value, key); } catch (e) { console.error('[SettingsManager] Listener error:', e); }
                });
            });
        }

        // ─── Utilities ────────────────────────────────────────────────────────────

        setNestedValue(obj, path, value) {
            const keys = path.split('.');
            let cur = obj;
            for (let i = 0; i < keys.length - 1; i++) {
                if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
                cur = cur[keys[i]];
            }
            cur[keys[keys.length - 1]] = value;
        }

        getNestedValue(obj, path) {
            return path.split('.').reduce((cur, k) => (cur != null && typeof cur === 'object' ? cur[k] : undefined), obj);
        }

        cloneDeep(obj) { return JSON.parse(JSON.stringify(obj)); }

        mergeDeep(target, source) {
            const out = Object.assign({}, target);
            if (this.isObject(target) && this.isObject(source)) {
                Object.keys(source).forEach(key => {
                    if (this.isObject(source[key])) {
                        out[key] = key in target ? this.mergeDeep(target[key], source[key]) : source[key];
                    } else {
                        out[key] = source[key];
                    }
                });
            }
            return out;
        }

        isObject(item) { return item && typeof item === 'object' && !Array.isArray(item); }

        findChanges(oldObj, newObj) {
            const changes = [];
            const walk = (o1, o2, path) => {
                const keys = new Set([...Object.keys(o1 || {}), ...Object.keys(o2 || {})]);
                keys.forEach(k => {
                    const p = path ? path + '.' + k : k;
                    if (this.isObject(o1?.[k]) && this.isObject(o2?.[k])) walk(o1[k], o2[k], p);
                    else if (o1?.[k] !== o2?.[k]) changes.push({ key: p, value: o2?.[k] });
                });
            };
            walk(oldObj, newObj, '');
            return changes;
        }

        setCssVariable(name, value) {
            document.documentElement.style.setProperty(name, value);
        }

        shadeColor(color, percent) {
            const hex = color.replace('#', '');
            let R = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(0,2),16) * (100+percent)/100)));
            let G = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(2,4),16) * (100+percent)/100)));
            let B = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(4,6),16) * (100+percent)/100)));
            return '#' + [R,G,B].map(n => n.toString(16).padStart(2,'0')).join('');
        }
    }

    // ─── Schema translation helpers ───────────────────────────────────────────────

    /** LocalStoreSettings flat schema → MoodChat nested schema */
    function _localToMoodChat(local, defaults) {
        const out = {};
        if (local.theme || local.language) {
            out.appearance = {};
            if (local.theme)    out.appearance.theme    = local.theme;
            if (local.language) out.appearance.language = local.language;
        }
        if (local.notifications) {
            out.notifications = {
                messageNotifications: local.notifications.messages  !== false,
                groupNotifications:   local.notifications.groups    !== false,
                callNotifications:    local.notifications.calls     !== false,
            };
        }
        if (local.privacy) {
            out.privacy = Object.assign({}, local.privacy);
        }
        if (local.chat) {
            out.chat = {
                mediaDownload:  local.chat.autoDownloadMedia ? 'wifi' : 'never',
                enterKeySends:  local.chat.enterKeySends !== undefined ? local.chat.enterKeySends : false,
            };
            if (local.chat.fontSize) {
                const sizeMap = { small: 14, medium: 16, large: 18 };
                out.appearance = out.appearance || {};
                out.appearance.fontSize = sizeMap[local.chat.fontSize] || 16;
            }
        }
        if (local.syncEnabled !== undefined) {
            out.advanced = { syncEnabled: local.syncEnabled };
        }
        return out;
    }

    /** MoodChat nested schema → LocalStoreSettings flat schema */
    function _moodChatToLocal(s) {
        const out = {};
        if (s.appearance) {
            if (s.appearance.theme)    out.theme    = s.appearance.theme;
            if (s.appearance.language) out.language = s.appearance.language;
            if (s.appearance.fontSize) {
                const n = s.appearance.fontSize;
                out.chat = out.chat || {};
                out.chat.fontSize = n <= 14 ? 'small' : n >= 18 ? 'large' : 'medium';
            }
        }
        if (s.notifications) {
            out.notifications = {
                messages: s.notifications.messageNotifications !== false,
                groups:   s.notifications.groupNotifications   !== false,
                calls:    s.notifications.callNotifications    !== false,
            };
        }
        if (s.privacy) {
            out.privacy = {
                lastSeen:         s.privacy.lastSeen !== undefined ? (s.privacy.lastSeen ? 'everyone' : 'nobody') : 'everyone',
                readReceipts:     s.privacy.readReceipts !== false,
                statusVisibility: s.privacy.profileVisibility || 'everyone',
            };
        }
        if (s.chat) {
            out.chat = out.chat || {};
            out.chat.autoDownloadMedia = s.chat.mediaDownload !== 'never';
            out.chat.enterKeySends     = s.chat.enterKeySends === true;
        }
        if (s.advanced) {
            out.syncEnabled = s.advanced.syncEnabled === true;
        }
        return out;
    }

    /** MoodChat settings → KynectaStore settings shape */
    function _moodChatToKynectaStore(s) {
        return {
            theme:         (s.appearance && s.appearance.theme)    || 'light',
            fontSize:      (s.appearance && s.appearance.fontSize) || 16,
            language:      (s.appearance && s.appearance.language) || 'en',
            notifications: (s.notifications && s.notifications.messageNotifications) !== false,
            soundEnabled:  (s.notifications && s.notifications.notificationSound)    !== false,
            wallpaper:     (s.chat && s.chat.wallpaper) || null,
            privacy:       s.privacy || {},
            // Preserve any existing KynectaStore settings keys not in MoodChat schema
        };
    }

    /** Try to read userId from common storage locations */
    function _tryReadUserId() {
        try {
            const auth = localStorage.getItem('kynecta_auth');
            if (auth) { const p = JSON.parse(auth); if (p.userId || p.id) return String(p.userId || p.id); }
            const uid = localStorage.getItem('moodchat_user_id') || localStorage.getItem('currentUserId');
            if (uid && uid !== 'null') return uid;
        } catch (_) {}
        return 'default';
    }

    // ─── Bootstrap ────────────────────────────────────────────────────────────────

    const instance = new SettingsManager();
    window.MoodChatSettingsManager      = instance;
    window.MoodChatSettingsManagerClass = SettingsManager;
    window.SettingsStore = window.SettingsStore || {
        data: {},
        listeners: {},
        load() {
            this.data = JSON.parse(localStorage.getItem('app_settings') || '{}');
            return this.data;
        },
        save() {
            localStorage.setItem('app_settings', JSON.stringify(this.data));
        },
        set(key, value) {
            // Validate key and value to prevent undefined logging
            if (key === undefined || key === null || key === 'undefined') {
                console.warn('[SETTINGS] Invalid key provided to set:', key);
                return;
            }
            if (value === undefined && key !== undefined) {
                console.warn('[SETTINGS] Setting undefined value for key:', key);
                // Don't store undefined values, delete instead
                delete this.data[key];
                this.save();
                this.notify(key, undefined);
                return;
            }
            this.data[key] = value;
            this.save();
            console.log('[SETTINGS UPDATED]', key, value);
            this.notify(key, value);
        },
        get(key) {
            return this.data[key];
        },
        subscribe(key, callback) {
            if (!this.listeners[key]) this.listeners[key] = [];
            this.listeners[key].push(callback);
            return () => {
                this.listeners[key] = (this.listeners[key] || []).filter((cb) => cb !== callback);
            };
        },
        notify(key, value) {
            (this.listeners[key] || []).forEach((cb) => cb(value, key));
            (this.listeners['*'] || []).forEach((cb) => cb(value, key));
        }
    };

    function autoInitialize() {
        const userId = _tryReadUserId();
        window.SettingsStore.load();
        window.dispatchEvent(new CustomEvent('settings-store-ready'));
        instance.initialize(userId).catch(err => {
            console.error('[SettingsManager] Auto-init failed:', err);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInitialize);
    } else {
        // Defer one tick so LocalStoreSettings + SettingsSyncEngine have a chance to load
        setTimeout(autoInitialize, 0);
    }

    console.log('[SettingsManager] Module loaded');
})();