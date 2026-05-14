/**
 * localStore.settings.js
 * LOCAL-FIRST SETTINGS STORE — Primary source of truth
 * All reads happen from here. Server is optional sync only.
 * Version: 1.0.0
 */

(function (global) {
    'use strict';

    // ─── Storage Keys ───────────────────────────────────────────────────────────
    const KEYS = {
        SETTINGS:   'knecta_settings_cache',
        SYNC_QUEUE: 'knecta_settings_sync_queue',
        META:       'knecta_settings_meta',
        VERSION:    'knecta_settings_version'
    };

    const CURRENT_VERSION = '1.0.0';

    // ─── Default Settings Schema ─────────────────────────────────────────────────
    const DEFAULT_SETTINGS = {
        userId: null,
        theme: 'light',
        language: 'en',
        notifications: {
            messages: true,
            calls: true,
            groups: true
        },
        privacy: {
            lastSeen: 'everyone',
            readReceipts: true,
            statusVisibility: 'everyone'
        },
        chat: {
            autoDownloadMedia: true,
            fontSize: 'medium'
        },
        syncEnabled: false,
        updatedAt: null
    };

    // ─── In-memory cache (avoid repeated JSON.parse) ─────────────────────────────
    let _memCache = null;
    let _meta     = null;

    // ─── Safe localStorage helpers ───────────────────────────────────────────────
    function _lsGet(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }
    function _lsSet(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
    }
    function _lsRemove(key) {
        try { localStorage.removeItem(key); } catch (_) {}
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────
    function _now() { return new Date().toISOString(); }

    function _deepMerge(target, source) {
        if (!source || typeof source !== 'object') return target;
        const out = Object.assign({}, target);
        Object.keys(source).forEach(key => {
            if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                out[key] = _deepMerge(target[key] || {}, source[key]);
            } else if (source[key] !== undefined) {
                out[key] = source[key];
            }
        });
        return out;
    }

    // ─── Core Read / Write ───────────────────────────────────────────────────────

    /**
     * Load settings from localStorage into memory cache.
     * Falls back to defaults if nothing is stored or data is corrupt.
     */
    function load() {
        try {
            const raw = _lsGet(KEYS.SETTINGS);
            if (!raw) {
                _memCache = _deepMerge({}, DEFAULT_SETTINGS);
                _memCache.updatedAt = _now();
                return _memCache;
            }
            const parsed = JSON.parse(raw);
            // Merge with defaults so new fields always have values
            _memCache = _deepMerge(DEFAULT_SETTINGS, parsed.data || parsed);
            return _memCache;
        } catch (e) {
            console.warn('[LocalStore.Settings] Corrupt cache — falling back to defaults:', e.message);
            _memCache = _deepMerge({}, DEFAULT_SETTINGS);
            _memCache.updatedAt = _now();
            return _memCache;
        }
    }

    /**
     * Persist current in-memory settings to localStorage.
     */
    function persist(settings) {
        const payload = {
            data: settings,
            timestamp: Date.now(),
            version: CURRENT_VERSION
        };
        const ok = _lsSet(KEYS.SETTINGS, JSON.stringify(payload));
        if (!ok) console.warn('[LocalStore.Settings] Failed to persist settings (storage may be full)');
        return ok;
    }

    /**
     * Get the full settings object (from memory if cached, else load).
     */
    function getAll() {
        if (!_memCache) load();
        return Object.assign({}, _memCache);
    }

    /**
     * Get a single top-level key or a nested path like 'notifications.messages'.
     */
    function get(path, defaultValue = undefined) {
        const settings = getAll();
        if (!path) return settings;
        const parts = path.split('.');
        let curr = settings;
        for (const part of parts) {
            if (curr == null || typeof curr !== 'object') return defaultValue;
            curr = curr[part];
        }
        return curr !== undefined ? curr : defaultValue;
    }

    /**
     * Set a nested path. E.g. set('notifications.messages', false)
     * Immediately persists and updates timestamp.
     */
    function set(path, value) {
        if (!_memCache) load();

        // Validate
        const { valid, reason } = validate(path, value);
        if (!valid) {
            console.warn(`[LocalStore.Settings] Validation failed for "${path}": ${reason}`);
            return false;
        }

        const parts = path.split('.');
        let cursor = _memCache;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (cursor[part] == null || typeof cursor[part] !== 'object') {
                cursor[part] = {};
            }
            cursor = cursor[part];
        }

        cursor[parts[parts.length - 1]] = value;
        _memCache.updatedAt = _now();

        persist(_memCache);
        _notifyListeners(path, value);
        return true;
    }

    /**
     * Merge a partial settings object into the store.
     */
    function merge(partial) {
        if (!_memCache) load();
        _memCache = _deepMerge(_memCache, partial);
        _memCache.updatedAt = _now();
        persist(_memCache);
        _notifyListeners('*', _memCache);
        return true;
    }

    /**
     * Reset to defaults (preserves userId if present).
     */
    function reset() {
        const userId = _memCache ? _memCache.userId : null;
        _memCache = _deepMerge({}, DEFAULT_SETTINGS);
        _memCache.userId = userId;
        _memCache.updatedAt = _now();
        persist(_memCache);
        _notifyListeners('*', _memCache);
        return _memCache;
    }

    /**
     * Wipe everything including sync queue.
     */
    function clear() {
        _memCache = null;
        _lsRemove(KEYS.SETTINGS);
        _lsRemove(KEYS.SYNC_QUEUE);
        _lsRemove(KEYS.META);
    }

    // ─── Sync Queue ───────────────────────────────────────────────────────────────

    function _loadSyncQueue() {
        try {
            const raw = _lsGet(KEYS.SYNC_QUEUE);
            return raw ? JSON.parse(raw) : [];
        } catch (_) { return []; }
    }

    function _saveSyncQueue(queue) {
        // Keep max 200 items, drop oldest
        const trimmed = queue.slice(-200);
        _lsSet(KEYS.SYNC_QUEUE, JSON.stringify(trimmed));
    }

    /**
     * Enqueue a pending change for later server sync.
     */
    function enqueueSyncItem(path, value) {
        const queue = _loadSyncQueue();
        // Deduplicate: replace any existing entry for same path
        const idx = queue.findIndex(i => i.path === path);
        const item = { path, value, ts: Date.now(), retries: 0 };
        if (idx !== -1) queue[idx] = item;
        else queue.push(item);
        _saveSyncQueue(queue);
    }

    function getSyncQueue() {
        return _loadSyncQueue();
    }

    function clearSyncQueue() {
        _lsRemove(KEYS.SYNC_QUEUE);
    }

    function removeSyncItem(path) {
        const queue = _loadSyncQueue().filter(i => i.path !== path);
        _saveSyncQueue(queue);
    }

    function incrementRetry(path) {
        const queue = _loadSyncQueue();
        const item = queue.find(i => i.path === path);
        if (item) {
            item.retries = (item.retries || 0) + 1;
            _saveSyncQueue(queue);
        }
    }

    // ─── Change Listeners ─────────────────────────────────────────────────────────
    const _listeners = [];

    function subscribe(callback) {
        _listeners.push(callback);
        return () => {
            const idx = _listeners.indexOf(callback);
            if (idx !== -1) _listeners.splice(idx, 1);
        };
    }

    function _notifyListeners(path, value) {
        _listeners.forEach(fn => {
            try { fn(path, value, _memCache); } catch (e) {}
        });
    }

    // ─── Validation ───────────────────────────────────────────────────────────────
    function validate(path, value) {
        const rules = {
            'theme': v => (['light','dark','system'].includes(v) ? true : 'Must be light|dark|system'),
            'language': v => (typeof v === 'string' && v.length >= 2 ? true : 'Must be a 2+ char string'),
            'notifications.messages': v => (typeof v === 'boolean' ? true : 'Must be boolean'),
            'notifications.calls':    v => (typeof v === 'boolean' ? true : 'Must be boolean'),
            'notifications.groups':   v => (typeof v === 'boolean' ? true : 'Must be boolean'),
            'privacy.lastSeen':       v => (['everyone','contacts','nobody'].includes(v) ? true : 'Must be everyone|contacts|nobody'),
            'privacy.readReceipts':   v => (typeof v === 'boolean' ? true : 'Must be boolean'),
            'privacy.statusVisibility': v => (['everyone','contacts','nobody'].includes(v) ? true : 'Must be everyone|contacts|nobody'),
            'chat.autoDownloadMedia': v => (typeof v === 'boolean' ? true : 'Must be boolean'),
            'chat.fontSize':          v => (['small','medium','large'].includes(v) ? true : 'Must be small|medium|large'),
            'syncEnabled':            v => (typeof v === 'boolean' ? true : 'Must be boolean'),
        };

        if (rules[path]) {
            const result = rules[path](value);
            if (result !== true) return { valid: false, reason: result };
        }
        return { valid: true };
    }

    // ─── Metadata ─────────────────────────────────────────────────────────────────
    function getMeta() {
        if (_meta) return _meta;
        try {
            const raw = _lsGet(KEYS.META);
            _meta = raw ? JSON.parse(raw) : {};
        } catch (_) { _meta = {}; }
        return _meta;
    }

    function setMeta(key, value) {
        const meta = getMeta();
        meta[key] = value;
        _lsSet(KEYS.META, JSON.stringify(meta));
    }

    // ─── Diagnostics ──────────────────────────────────────────────────────────────
    function diagnostics() {
        const queue = getSyncQueue();
        let rawSize = 0;
        try {
            const raw = _lsGet(KEYS.SETTINGS);
            rawSize = raw ? raw.length : 0;
        } catch (_) {}
        return {
            loaded: !!_memCache,
            storageKey: KEYS.SETTINGS,
            storageSizeBytes: rawSize,
            syncQueueLength: queue.length,
            pendingPaths: queue.map(i => i.path),
            updatedAt: _memCache ? _memCache.updatedAt : null,
            version: CURRENT_VERSION
        };
    }

    // ─── Public API ───────────────────────────────────────────────────────────────
    const LocalStoreSettings = {
        DEFAULTS: DEFAULT_SETTINGS,
        KEYS,

        load,
        getAll,
        get,
        set,
        merge,
        persist,
        reset,
        clear,

        enqueueSyncItem,
        getSyncQueue,
        clearSyncQueue,
        removeSyncItem,
        incrementRetry,

        subscribe,
        validate,

        getMeta,
        setMeta,
        diagnostics
    };

    global.LocalStoreSettings = LocalStoreSettings;

    // Auto-load on first access (warm the cache)
    load();

    console.log('[LocalStore.Settings] ✅ Initialized — local-first settings store ready');

})(typeof window !== 'undefined' ? window : global);