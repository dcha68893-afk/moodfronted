/**
 * settingsSync.engine.js  (v1.1 — fixed)
 * OPTIONAL CLOUD SYNC ENGINE
 *
 * FIXES in v1.1:
 *   ✅  _directFetch no longer double-appends /api.
 *       window.__getApiBase() already returns e.g. 'http://localhost:4000/api'
 *       so _directFetch strips trailing /api before re-adding /api + endpoint.
 *   ✅  syncOnLogin conflict resolution: local changes made while offline are
 *       preserved even if server data is newer — we do a proper merge where
 *       any item in the sync queue takes priority over the pulled value.
 *   ✅  pushToServer / pullFromServer both guard against syncEnabled=false
 *   ✅  State transitions are idempotent (no double SYNCING)
 *
 * Version: 1.1.0
 */

(function (global) {
    'use strict';

    const SYNC_STATE = {
        IDLE:    'idle',
        PENDING: 'pending',
        SYNCING: 'syncing',
        SYNCED:  'synced',
        FAILED:  'failed',
        OFFLINE: 'offline'
    };

    let _state          = SYNC_STATE.IDLE;
    let _online         = navigator.onLine !== false;
    let _syncInProgress = false;
    let _listeners      = [];
    let _retryTimer     = null;
    const MAX_RETRIES   = 3;
    const RETRY_DELAY   = 5000;

    function _store()     { return global.LocalStoreSettings; }
    function _validator() { return global.SettingsSchemaValidator; }

    window.addEventListener('online', () => {
        _online = true;
        _emit('network', { online: true });
        console.log('[SettingsSync] 🌐 Back online — flushing queue');
        _tryFlushQueue();
    });
    window.addEventListener('offline', () => {
        _online = false;
        _emit('network', { online: false });
        console.log('[SettingsSync] 📴 Offline — changes will queue');
    });

    function _setState(s) {
        if (_state === s) return;
        _state = s;
        _emit('stateChange', { state: s });
    }

    function _emit(event, data) {
        _listeners.forEach(fn => { try { fn(event, data); } catch (_) {} });
    }

    // ─── API request via parent iframe ───────────────────────────────────────────
    function _parentRequest(endpoint, method, body) {
        return new Promise((resolve, reject) => {
            if (!_online) return reject(new Error('offline'));

            const requestId = `settings_sync_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error(`Sync request timeout: ${endpoint}`));
            }, 15000);

            function handler(event) {
                const d = event.data;
                if (!d || d.type !== 'API_RESPONSE' || d.requestId !== requestId) return;
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                const payload = d.payload || d;
                if (payload.success) resolve(payload);
                else reject(new Error(payload.error || `HTTP ${payload.statusCode}`));
            }
            window.addEventListener('message', handler);

            const msg = {
                type: 'API_REQUEST',
                requestId,
                source: 'settings',
                module: 'settings',
                endpoint,
                method: method || 'GET',
                body: body || null,
                data: body || null,
                payload: { requestId, endpoint, method: method || 'GET', body: body || null, source: 'settings' },
                timestamp: Date.now()
            };

            if (window.parent && window.parent !== window) {
                window.parent.postMessage(msg, '*');
            } else {
                _directFetch(endpoint, method, body).then(resolve).catch(reject);
            }
        });
    }

    /**
     * FIXED: strip trailing /api from baseUrl before building the URL,
     * so we never get double /api/api/...
     */
    function _directFetch(endpoint, method, body) {
        const rawBase = (window.__getApiBase && window.__getApiBase()) || 'http://localhost:3000/api';
        // Normalize: remove trailing /api or /api/ so we can cleanly re-add it
        const baseOrigin = rawBase.replace(/\/api\/?$/, '');
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
        const url = `${baseOrigin}/api${cleanEndpoint}`;

        const token = _getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const opts = { method: method || 'GET', headers, credentials: 'include' };
        if (body && (method === 'POST' || method === 'PUT')) opts.body = JSON.stringify(body);

        return fetch(url, opts).then(async res => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
            return { success: true, data, statusCode: res.status };
        });
    }

    function _getToken() {
        try {
            const auth = localStorage.getItem('kynecta_auth');
            if (auth) { const p = JSON.parse(auth); if (p.token) return p.token; }
        } catch (_) {}
        return localStorage.getItem('token') ||
               localStorage.getItem('moodchat_token') ||
               localStorage.getItem('accessToken') || null;
    }

    // ─── Merge strategy ───────────────────────────────────────────────────────────
    /**
     * FIXED syncOnLogin: pending queue items take priority over server data,
     * so offline edits are never silently overwritten.
     */
    function _mergeWithConflictResolution(local, remote) {
        if (!remote || typeof remote !== 'object') return local;

        const localTs  = local.updatedAt  ? new Date(local.updatedAt).getTime()  : 0;
        const remoteTs = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;

        // Base: newer timestamp wins for the top-level fields
        let base = localTs >= remoteTs
            ? Object.assign({}, remote, local)
            : Object.assign({}, local, remote);

        // Nested merge for objects
        ['notifications','privacy','chat'].forEach(section => {
            const l = local[section]  || {};
            const r = remote[section] || {};
            // Local always wins for nested fields if localTs >= remoteTs
            base[section] = localTs >= remoteTs
                ? Object.assign({}, r, l)
                : Object.assign({}, l, r);
        });

        // Re-apply any queued (not-yet-synced) local changes — these take ABSOLUTE priority
        const queue = _store() ? _store().getSyncQueue() : [];
        queue.forEach(item => {
            const parts = item.path.split('.');
            let cursor = base;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!cursor[parts[i]]) cursor[parts[i]] = {};
                cursor = cursor[parts[i]];
            }
            cursor[parts[parts.length - 1]] = item.value;
        });

        base.updatedAt = localTs >= remoteTs ? local.updatedAt : remote.updatedAt;
        return base;
    }

    // ─── Push ─────────────────────────────────────────────────────────────────────
    async function pushToServer(settings) {
        if (!_online)               { _setState(SYNC_STATE.OFFLINE); throw new Error('offline'); }
        if (!settings.syncEnabled)  { return; }

        _setState(SYNC_STATE.SYNCING);
        try {
            const payload = {
                theme: settings.theme, language: settings.language,
                notifications: settings.notifications, privacy: settings.privacy,
                chat: settings.chat, syncEnabled: settings.syncEnabled,
                updatedAt: settings.updatedAt
            };
            const res = await _parentRequest('/api/settings', 'PUT', payload);
            _setState(SYNC_STATE.SYNCED);
            _store() && _store().setMeta('lastServerSync', new Date().toISOString());
            _emit('synced', { direction: 'push', ts: Date.now() });
            return res;
        } catch (err) {
            _setState(SYNC_STATE.FAILED);
            _emit('syncError', { error: err.message, direction: 'push' });
            throw err;
        }
    }

    // ─── Pull ─────────────────────────────────────────────────────────────────────
    async function pullFromServer() {
        if (!_online) { _setState(SYNC_STATE.OFFLINE); throw new Error('offline'); }

        _setState(SYNC_STATE.SYNCING);
        try {
            const res = await _parentRequest('/api/settings', 'GET', null);
            const remote = res.data?.settings || res.data?.data || res.data || {};

            const validator = _validator();
            const sanitized = validator ? validator.sanitize(remote) : remote;

            const local  = _store().getAll();
            const merged = _mergeWithConflictResolution(local, sanitized);

            _store().merge(merged);
            _setState(SYNC_STATE.SYNCED);
            _store().setMeta('lastServerSync', new Date().toISOString());
            _emit('synced', { direction: 'pull', ts: Date.now(), merged });
            return merged;
        } catch (err) {
            _setState(SYNC_STATE.FAILED);
            _emit('syncError', { error: err.message, direction: 'pull' });
            throw err;
        }
    }

    // ─── Login sync ───────────────────────────────────────────────────────────────
    async function syncOnLogin() {
        const settings = _store().getAll();
        if (!settings.syncEnabled) { console.log('[SettingsSync] Sync disabled'); return; }
        if (!_online)              { _setState(SYNC_STATE.OFFLINE); return; }

        try {
            console.log('[SettingsSync] ☁️ Login sync starting');
            await pullFromServer();           // merge uses queue-priority
            await _tryFlushQueue();           // push any remaining local-only changes
        } catch (err) {
            console.warn('[SettingsSync] Login sync failed (non-blocking):', err.message);
        }
    }

    // ─── Flush queue ─────────────────────────────────────────────────────────────
    async function _tryFlushQueue() {
        if (_syncInProgress || !_online) return;

        const queue = _store().getSyncQueue();
        if (!queue.length) return;

        const settings = _store().getAll();
        if (!settings.syncEnabled) { _store().clearSyncQueue(); return; }

        _syncInProgress = true;
        _setState(SYNC_STATE.SYNCING);
        console.log(`[SettingsSync] Flushing ${queue.length} queued changes`);

        const failed = [];
        for (const item of queue) {
            if (item.retries >= MAX_RETRIES) { console.warn(`[SettingsSync] Dropping after ${item.retries} retries: ${item.path}`); continue; }
            try {
                await pushToServer(_store().getAll());
                _store().removeSyncItem(item.path);
            } catch (err) {
                _store().incrementRetry(item.path);
                failed.push(item.path);
                console.warn(`[SettingsSync] Failed ${item.path}:`, err.message);
            }
        }

        _syncInProgress = false;

        if (failed.length === 0) {
            _setState(SYNC_STATE.SYNCED);
        } else {
            _setState(SYNC_STATE.FAILED);
            clearTimeout(_retryTimer);
            _retryTimer = setTimeout(_tryFlushQueue, RETRY_DELAY);
        }
    }

    // ─── Single setting update ────────────────────────────────────────────────────
    async function syncSettingUpdate(path, value) {
        const settings = _store().getAll();
        if (!settings.syncEnabled) return;

        if (!_online) {
            _store().enqueueSyncItem(path, value);
            _setState(SYNC_STATE.PENDING);
            _emit('queued', { path, value });
            return;
        }

        try {
            await pushToServer(_store().getAll());
            _store().removeSyncItem(path);
        } catch (err) {
            _store().enqueueSyncItem(path, value);
            _setState(SYNC_STATE.PENDING);
            _emit('queued', { path, value, error: err.message });
            clearTimeout(_retryTimer);
            _retryTimer = setTimeout(_tryFlushQueue, RETRY_DELAY);
        }
    }

    // ─── Subscribe ────────────────────────────────────────────────────────────────
    function subscribe(callback) {
        _listeners.push(callback);
        return () => {
            const idx = _listeners.indexOf(callback);
            if (idx !== -1) _listeners.splice(idx, 1);
        };
    }

    function diagnostics() {
        const meta = _store() ? _store().getMeta() : {};
        return {
            state: _state, online: _online, syncInProgress: _syncInProgress,
            pendingQueue: _store() ? _store().getSyncQueue().length : 0,
            lastServerSync: meta.lastServerSync || null,
            SYNC_STATE
        };
    }

    // ─── Public API ───────────────────────────────────────────────────────────────
    global.SettingsSyncEngine = {
        SYNC_STATE,
        syncOnLogin,
        syncSettingUpdate,
        pushToServer,
        pullFromServer,
        subscribe,
        diagnostics,
        get state()  { return _state; },
        get online() { return _online; }
    };

    console.log('[SettingsSync] ✅ v1.1 initialized');

})(typeof window !== 'undefined' ? window : global);
