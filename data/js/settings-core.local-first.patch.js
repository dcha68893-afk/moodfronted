/**
 * settings-core.local-first.patch.js  (v1.1 — fixed)
 * LOCAL-FIRST PATCH for settings-core.js
 *
 * FIXES in v1.1:
 *   ✅  enterToSend maps to 'chat.enterKeySends' (NOT 'chat.autoDownloadMedia')
 *   ✅  fontSize thresholds fixed: ≤14→small, 15-17→medium, ≥18→large
 *       (16px default correctly maps to 'medium')
 *   ✅  SettingsState is an ES module export — NOT on window by default.
 *       Patch now hooks 'settingsLoaded' CustomEvent (reliable) instead of polling
 *       window.SettingsState. Also supports window.__SETTINGS_STATE_OBJ__ as an
 *       opt-in escape hatch settings-core.js can use: window.__SETTINGS_STATE_OBJ__ = SettingsState
 *   ✅  initLocalFirstLoad no longer races with SettingsState init
 *   ✅  Coordinates with MoodChatSettingsManager after local load
 *   ✅  No _directFetch /api double-append (fixed in settingsSync.engine.js)
 *
 * LOAD ORDER (settings.html):
 *   1. localStore.settings.js
 *   2. settingsSchema.validator.js
 *   3. settingsSync.engine.js
 *   4. THIS FILE          ← before settings-core.js
 *   5. settings-core.js   (type="module")
 *   6. settings-ui.js     (type="module")
 *   7. settings-ui.local-first.patch.js
 */

if (window.__SETTINGS_LOCAL_FIRST_PATCH__) {
    console.log('[settings-core:patch] Already applied — skipping');
} else {
    window.__SETTINGS_LOCAL_FIRST_PATCH__ = true;

    (function applyLocalFirstPatch() {
        'use strict';

        function _store()     { return window.LocalStoreSettings; }
        function _validator() { return window.SettingsSchemaValidator; }
        function _sync()      { return window.SettingsSyncEngine; }

        // ─── saveSettingsLocal — PRIMARY SAVE FUNCTION ────────────────────────────
        window.saveSettingsLocal = function saveSettingsLocal(section, key, value) {
            const store = _store();
            if (!store) {
                console.warn('[settings-core:patch] saveSettingsLocal: LocalStoreSettings not loaded');
                return false;
            }

            const path        = _mapToLocalPath(section, key);
            const mappedValue = _mapValue(section, key, value);

            const validator = _validator();
            if (validator) {
                const { valid, reason } = validator.validateField(path, mappedValue);
                if (!valid) console.warn(`[settings-core:patch] Validation [${path}]: ${reason} — saving anyway`);
            }

            const ok = store.set(path, mappedValue);

            const sync = _sync();
            if (sync) sync.syncSettingUpdate(path, mappedValue).catch(() => {});

            try {
                window.dispatchEvent(new CustomEvent('settingsSavedLocal', {
                    detail: { section, key, value, path, ts: Date.now() }
                }));
            } catch (_) {}

            return ok;
        };

        // ─── Path mapping ─────────────────────────────────────────────────────────
        function _mapToLocalPath(section, key) {
            switch (section) {
                case 'appearance':
                    if (key === 'theme')    return 'theme';
                    if (key === 'language') return 'language';
                    if (key === 'fontSize') return 'chat.fontSize';
                    return key;

                case 'notifications':
                    if (key === 'messageNotifications' || key === 'messages') return 'notifications.messages';
                    if (key === 'groupNotifications'   || key === 'groups')   return 'notifications.groups';
                    if (key === 'callNotifications'    || key === 'calls')    return 'notifications.calls';
                    return `notifications.${key}`;

                case 'privacy':
                    if (key === 'readReceipts')       return 'privacy.readReceipts';
                    if (key === 'typingIndicators')   return 'privacy.readReceipts';
                    if (key === 'profileVisibility')  return 'privacy.statusVisibility';
                    if (key === 'lastSeen')           return 'privacy.lastSeen';
                    return `privacy.${key}`;

                case 'chat':
                    // FIXED: enterToSend → chat.enterKeySends (not autoDownloadMedia)
                    if (key === 'enterToSend' || key === 'enterKeySends') return 'chat.enterKeySends';
                    if (key === 'mediaAutoDownload' || key === 'autoDownloadMedia') return 'chat.autoDownloadMedia';
                    if (key === 'messageFontSize' || key === 'fontSize')            return 'chat.fontSize';
                    return `chat.${key}`;

                case 'advanced':
                    if (key === 'syncEnabled') return 'syncEnabled';
                    return key;

                default:
                    return key;
            }
        }

        // ─── Value coercion ───────────────────────────────────────────────────────
        function _mapValue(section, key, value) {
            const boolFields = [
                'messageNotifications','groupNotifications','callNotifications',
                'readReceipts','typingIndicators','enterToSend','enterKeySends',
                'autoDownloadMedia','messages','calls','groups',
                'enableNotifications','notificationSound','notificationVibration','syncEnabled'
            ];
            if (boolFields.includes(key)) return Boolean(value);

            // FIXED: fontSize thresholds — 16 (default) → 'medium'
            if (key === 'fontSize' || key === 'messageFontSize') {
                if (typeof value === 'string' && ['small','medium','large'].includes(value)) return value;
                if (typeof value === 'number') {
                    if (value <= 14) return 'small';
                    if (value >= 18) return 'large';
                    return 'medium';  // 15, 16, 17 all → 'medium'
                }
                return 'medium';
            }

            if (key === 'theme') {
                const t = String(value).toLowerCase();
                if (['light','dark','system'].includes(t)) return t;
                if (t === 'auto') return 'system';
                return 'light';
            }

            if (['lastSeen','profileVisibility','statusVisibility'].includes(key)) {
                if (typeof value === 'boolean') return value ? 'everyone' : 'nobody';
                if (['everyone','contacts','nobody'].includes(value)) return value;
                return 'everyone';
            }

            return value;
        }

        // ─── SettingsState patching (ES module safe) ──────────────────────────────
        // settings-core.js is a module. SettingsState is NOT on window unless the
        // module explicitly sets window.__SETTINGS_STATE_OBJ__ = SettingsState.
        // We hook 'settingsLoaded' (dispatched by settings-core.js after loading)
        // as the reliable trigger, and also poll for __SETTINGS_STATE_OBJ__.

        let _settingsStateCaptured = false;
        let _pollAttempts = 0;

        function _tryPatchSettingsState() {
            const ss = window.SettingsState || window.__SETTINGS_STATE_OBJ__;
            if (!ss) {
                if (_pollAttempts++ < 25) setTimeout(_tryPatchSettingsState, 300);
                else console.warn('[settings-core:patch] SettingsState not found on window — patch skipped.\n' +
                    'TIP: add `window.__SETTINGS_STATE_OBJ__ = SettingsState;` in settings-core.js');
                return;
            }
            if (ss.__localFirstPatched) return;
            ss.__localFirstPatched = true;

            const origUpdate = ss.update.bind(ss);
            ss.update = async function localFirstUpdate(section, key, value) {
                window.saveSettingsLocal(section, key, value);
                return origUpdate(section, key, value);
            };

            const origSaveToCache = ss._saveToCache.bind(ss);
            ss._saveToCache = function localFirstSaveToCache() {
                origSaveToCache();
                const store = _store();
                if (store && ss.data) { try { store.merge(ss.data); } catch (_) {} }
            };

            console.log('[settings-core:patch] ✅ SettingsState patched');
        }

        window.addEventListener('settingsLoaded', function onSettingsLoaded(e) {
            if (!_settingsStateCaptured) {
                _settingsStateCaptured = true;
                const settings = e && e.detail && e.detail.settings;
                if (settings) {
                    const store = _store();
                    if (store) { try { store.merge(settings); } catch (_) {} }
                    _syncToMoodChatManager(settings);
                }
            }
            _tryPatchSettingsState();
        });

        window.addEventListener('coreUIInitialized', _tryPatchSettingsState);

        // Start polling immediately (covers case where settingsLoaded fires before listener registered)
        setTimeout(_tryPatchSettingsState, 100);

        // ─── Init: local-first load on startup ───────────────────────────────────
        function initLocalFirstLoad() {
            const store = _store();
            if (!store) return;

            const local = store.load();
            if (!local || Object.keys(local).length <= 1) return;

            _applyImmediateVisuals(local);

            const ss = window.SettingsState || window.__SETTINGS_STATE_OBJ__;
            if (ss && !ss.loaded) {
                const mapped = _localToSettingsCoreSchema(local);
                if (mapped && Object.keys(mapped).length > 0) {
                    ss.data   = Object.assign({}, ss.data || {}, mapped);
                    ss.loaded = true;
                    try {
                        window.dispatchEvent(new CustomEvent('settingsLoaded', {
                            detail: { settings: ss.data, fromLocal: true, timestamp: Date.now() }
                        }));
                    } catch (_) {}
                }
            }

            _syncToMoodChatManager(local);
            console.log('[settings-core:patch] ✅ Local settings applied on startup');
        }

        function _applyImmediateVisuals(local) {
            try {
                if (local.theme) {
                    const t = local.theme === 'system'
                        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                        : local.theme;
                    document.documentElement.setAttribute('data-theme', t);
                }
                if (local.chat && local.chat.fontSize) {
                    const px = { small: '14px', medium: '16px', large: '18px' };
                    document.documentElement.style.fontSize = px[local.chat.fontSize] || '16px';
                }
            } catch (_) {}
        }

        function _localToSettingsCoreSchema(local) {
            if (!local) return {};
            const out = {};
            if (local.theme || local.language) {
                out.appearance = {};
                if (local.theme)    out.appearance.theme    = local.theme;
                if (local.language) out.appearance.language = local.language;
            }
            if (local.notifications) {
                out.notifications = {
                    messageNotifications: local.notifications.messages !== false,
                    groupNotifications:   local.notifications.groups   !== false,
                    callNotifications:    local.notifications.calls    !== false,
                };
            }
            if (local.privacy) out.privacy = Object.assign({}, local.privacy);
            if (local.chat) {
                out.chat = {};
                if (local.chat.autoDownloadMedia !== undefined) out.chat.autoDownloadMedia = local.chat.autoDownloadMedia;
                if (local.chat.enterKeySends     !== undefined) out.chat.enterKeySends     = local.chat.enterKeySends;
                if (local.chat.fontSize) {
                    out.appearance = out.appearance || {};
                    out.appearance.fontSize = { small: 14, medium: 16, large: 18 }[local.chat.fontSize] || 16;
                }
            }
            return out;
        }

        function _syncToMoodChatManager(settings) {
            const mgr = window.MoodChatSettingsManager;
            if (!mgr || !mgr.initialized) return;
            try {
                if (settings.theme)    mgr.setNestedValue(mgr.currentSettings, 'appearance.theme',    settings.theme);
                if (settings.language) mgr.setNestedValue(mgr.currentSettings, 'appearance.language', settings.language);
                if (settings.notifications) {
                    mgr.setNestedValue(mgr.currentSettings, 'notifications.messageNotifications', settings.notifications.messages !== false);
                    mgr.setNestedValue(mgr.currentSettings, 'notifications.groupNotifications',   settings.notifications.groups   !== false);
                    mgr.setNestedValue(mgr.currentSettings, 'notifications.callNotifications',    settings.notifications.calls    !== false);
                }
                if (settings.privacy && settings.privacy.readReceipts !== undefined) {
                    mgr.setNestedValue(mgr.currentSettings, 'privacy.readReceipts', settings.privacy.readReceipts !== false);
                }
            } catch (_) {}
        }

        // ─── Sync engine watch ────────────────────────────────────────────────────
        function _watchSyncState() {
            const sync = _sync();
            if (!sync) { setTimeout(_watchSyncState, 500); return; }
            sync.subscribe((event, data) => {
                if (event === 'stateChange') {
                    try {
                        window.dispatchEvent(new CustomEvent('settingsSyncStatus', {
                            detail: { state: data.state, timestamp: Date.now() }
                        }));
                    } catch (_) {}
                }
                if (event === 'synced' && data.direction === 'pull') {
                    const mgr = window.MoodChatSettingsManager;
                    if (mgr) mgr.loadSettings().catch(() => {});
                }
            });
        }
        _watchSyncState();

        window.addEventListener('parentReady', () => {
            const sync = _sync();
            if (sync) setTimeout(() => sync.syncOnLogin().catch(() => {}), 1000);
        });

        window.addEventListener('settingsLoaded', (e) => {
            if (e.detail && e.detail.settings && !e.detail.fromLocal) {
                const store = _store();
                if (store) { try { store.merge(e.detail.settings); } catch (_) {} }
                _syncToMoodChatManager(e.detail.settings);
            }
        });

        // Boot
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initLocalFirstLoad);
        } else {
            initLocalFirstLoad();
        }

        console.log('[settings-core:patch] 🚀 v1.1 ready');

    })();
}