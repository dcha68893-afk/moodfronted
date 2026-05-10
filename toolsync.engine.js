/**
 * toolsync.engine.js — Non-Blocking Background Sync Engine
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (root, factory) {
    'use strict';
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(
            require('./toolregistry.manager.js'),
            require('./toolpermission.guard.js'),
            require('./localstore.tools.js')
        );
    } else {
        root.ToolSyncEngine = factory(
            root.ToolRegistryManager,
            root.ToolPermissionGuard,
            root.LocalStoreTools
        );
        window.ToolSyncEngine = root.ToolSyncEngine;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (ToolRegistryManager, ToolPermissionGuard, LocalStoreTools) {
    'use strict';

    const SYNC_INTERVAL_MS = 5 * 60 * 1000;
    const MAX_QUEUE_SIZE = 100;
    const MAX_RETRIES = 3;

    let _syncInterval = null;
    let _retryTimer = null;
    let _isSyncing = false;
    let _lastSyncAt = 0;
    let _authorizedFetch = null;
    let _subscribers = new Set();

    const _queue = [];

    function _emit(event, detail) {
        _subscribers.forEach(cb => { try { cb(event, detail); } catch(e) {} });
        try {
            window.dispatchEvent(new CustomEvent('toolSync:' + event, { detail }));
        } catch(e) {}
    }

    function _log(msg, ...args) {
        console.log('[ToolSync]', msg, ...args);
    }

    function _setSyncStatus(status, label) {
        try {
            window.dispatchEvent(new CustomEvent('localStoreTools:syncStatus', {
                detail: { status, label }
            }));
        } catch(e) {}
    }

    function _normalizeEndpoint(endpoint) {
        if (!endpoint || typeof endpoint !== 'string') return endpoint;
        // Map both /api/marketplace/ and /api/tools/marketplace/ to the same base
        if (endpoint.startsWith('/api/marketplace/')) {
            return endpoint.replace('/api/marketplace/', '/api/tools/marketplace/');
        }
        // Also map new /api/marketplace/products to listings for backward compat
        if (endpoint.includes('/api/tools/marketplace/products')) {
            return endpoint; // already normalized
        }
        return endpoint;
    }

    async function _doFetch(endpoint, options = {}) {
        if (typeof _authorizedFetch !== 'function') {
            throw new Error('authorizedFetch not injected — cannot sync');
        }
        return _authorizedFetch(_normalizeEndpoint(endpoint), options);
    }

    function _enqueue(type, payload) {
        if (_queue.length >= MAX_QUEUE_SIZE) _queue.shift();
        _queue.push({ type, payload, retries: 0, queuedAt: Date.now() });
        if (LocalStoreTools) {
            LocalStoreTools.setMeta('syncQueue', _queue).catch(() => {});
        }
    }

    async function _loadQueueFromStorage() {
        if (!LocalStoreTools) return;
        try {
            const saved = LocalStoreTools.getMeta('syncQueue');
            if (Array.isArray(saved)) {
                _queue.push(...saved.filter(i => i && i.type));
            }
        } catch(e) {}
    }

    async function _flushQueue() {
        if (!navigator.onLine || _queue.length === 0) return;
        const batch = _queue.slice();
        for (const item of batch) {
            try {
                await _processSyncItem(item);
                const idx = _queue.indexOf(item);
                if (idx !== -1) _queue.splice(idx, 1);
            } catch (e) {
                item.retries++;
                if (item.retries >= MAX_RETRIES) {
                    const idx = _queue.indexOf(item);
                    if (idx !== -1) _queue.splice(idx, 1);
                    _log(`Dropped sync item after ${MAX_RETRIES} retries:`, item.type);
                }
            }
        }
        if (LocalStoreTools) {
            LocalStoreTools.setMeta('syncQueue', _queue).catch(() => {});
        }
    }

    async function _processSyncItem(item) {
        switch (item.type) {
            case 'listing_created':
                await _doFetch('/api/marketplace/listings', {
                    method: 'POST',
                    body: JSON.stringify(item.payload),
                    headers: { 'Content-Type': 'application/json' }
                });
                break;
            case 'listing_deleted':
                await _doFetch(`/api/marketplace/listings/${item.payload.id}`, { method: 'DELETE' });
                break;
            case 'listing_updated':
                await _doFetch(`/api/marketplace/listings/${item.payload.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(item.payload),
                    headers: { 'Content-Type': 'application/json' }
                });
                break;
            case 'tool_installed':
                _log('Skipping unsupported server sync item:', item.type);
                break;
            case 'tool_removed':
                _log('Skipping unsupported server sync item:', item.type);
                break;
            default:
                _log('Unknown sync item type:', item.type);
        }
    }

    async function syncToolRegistry() {
        _log('Syncing tool registry from server…');
        let rawTools = [];
        try {
            const resp = await _doFetch('/api/tools/registry');
            rawTools = resp?.data?.tools || resp?.tools || [];
        } catch(e) {
            _log('Registry sync failed:', e.message);
            return { synced: 0, updated: 0 };
        }

        let synced = 0, updated = 0;
        for (const serverTool of rawTools) {
            if (!serverTool?.id) continue;

            if (ToolPermissionGuard && !ToolPermissionGuard.verifyToolSignature(serverTool)) {
                _log('Rejected unsigned tool from server:', serverTool.id);
                continue;
            }

            const existing = ToolRegistryManager ? ToolRegistryManager.getRegisteredTool(serverTool.id) : null;
            const result = ToolRegistryManager ? ToolRegistryManager.registerTool(serverTool) : { success: false };
            if (result.success) {
                synced++;
                if (existing && existing.version !== serverTool.version) updated++;
            }
        }

        if (ToolRegistryManager) {
            const serverIds = new Set(rawTools.map(t => t.id));
            const localTools = ToolRegistryManager.getAllRegistered();
            for (const local of localTools) {
                if (!serverIds.has(local.id) && !local.isLocalOnly) {
                    if (!local.isInstalled) {
                        ToolRegistryManager.unregisterTool(local.id);
                        _log('Removed deprecated tool:', local.id);
                    } else {
                        ToolRegistryManager.markActive(local.id, false);
                        _log('Deprecated installed tool (kept, marked inactive):', local.id);
                    }
                }
            }
        }

        if (LocalStoreTools && ToolRegistryManager) {
            await LocalStoreTools.mergeFromServer(
                ToolRegistryManager.getAllRegistered(),
                LocalStoreTools.STORES.TOOLS
            );
        }

        _log(`Registry sync: ${synced} synced, ${updated} updated`);
        _emit('registrySynced', { synced, updated });
        return { synced, updated };
    }

    async function syncListings(page = 1, limit = 50) {
        let listings = [];
        try {
            const resp = await _doFetch(`/api/marketplace/listings?page=${page}&limit=${limit}`);
            listings = resp?.data?.listings || resp?.listings || [];
        } catch(e) {
            _log('Listings sync failed:', e.message);
            return { synced: 0 };
        }

        if (!listings.length) return { synced: 0 };

        if (LocalStoreTools) {
            await LocalStoreTools.mergeFromServer(listings, LocalStoreTools.STORES.LISTINGS);
        }

        _emit('listingsSynced', { count: listings.length });
        return { synced: listings.length };
    }

    async function checkVersionUpdates() {
        if (!ToolRegistryManager) return [];
        const installed = ToolRegistryManager.getInstalledTools();
        if (!installed.length) return [];

        let serverTools = [];
        try {
            const resp = await _doFetch('/api/tools/registry');
            serverTools = resp?.data?.tools || resp?.tools || [];
        } catch(e) { return []; }

        const updates = [];
        for (const local of installed) {
            const server = serverTools.find(t => t.id === local.id);
            if (server && server.version !== local.version) {
                updates.push({ toolId: local.id, current: local.version, latest: server.version });
            }
        }

        if (updates.length) {
            _emit('updatesAvailable', { updates });
            _log('Updates available:', updates.map(u => `${u.toolId} (${u.current} → ${u.latest})`).join(', '));
        }
        return updates;
    }

    async function _runSyncCycle() {
        if (_isSyncing) return;
        if (!navigator.onLine) {
            _log('Offline — skipping sync cycle');
            return;
        }

        _isSyncing = true;
        _setSyncStatus('syncing', 'Syncing…');
        _emit('start', { timestamp: Date.now() });

        try {
            await Promise.allSettled([
                syncToolRegistry(),
                syncListings(),
                _flushQueue(),
            ]);

            _lastSyncAt = Date.now();
            if (LocalStoreTools) LocalStoreTools.setMeta('lastSyncAt', _lastSyncAt).catch(() => {});
            _setSyncStatus('saved', 'Synced ✓');
            _emit('complete', { timestamp: _lastSyncAt });
        } catch(e) {
            console.error('[ToolSync] Cycle error:', e.message);
            _setSyncStatus('offline', 'Sync failed');
            _emit('error', { error: e.message });
        } finally {
            _isSyncing = false;
        }
    }

    const ToolSyncEngine = {

        async init(fetchFn) {
            if (typeof fetchFn === 'function') _authorizedFetch = fetchFn;
            await _loadQueueFromStorage();
            _log('✅ SyncEngine initialized');
            return this;
        },

        startPolling(intervalMs = SYNC_INTERVAL_MS) {
            if (_syncInterval) return;
            setTimeout(() => _runSyncCycle(), 2000);
            _syncInterval = setInterval(_runSyncCycle, intervalMs);
            _log('Background polling started');
        },

        stopPolling() {
            if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
            if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
            _log('Background polling stopped');
        },

        sync() { return _runSyncCycle(); },
        syncToolRegistry() { return syncToolRegistry(); },
        syncListings(p, l) { return syncListings(p, l); },
        checkVersionUpdates() { return checkVersionUpdates(); },
        flushQueue() { return _flushQueue(); },

        queueListingCreated(listing) { _enqueue('listing_created', listing); },
        queueListingDeleted(id) { _enqueue('listing_deleted', { id }); },
        queueListingUpdated(listing) { _enqueue('listing_updated', listing); },
        queueToolInstalled(toolDef) { _enqueue('tool_installed', toolDef); },
        queueToolRemoved(toolId) { _enqueue('tool_removed', { id: toolId }); },

        async installTool(toolId) {
            if (!ToolRegistryManager) {
                return { success: false, reason: 'Registry manager not available' };
            }
            const def = ToolRegistryManager.getRegisteredTool(toolId);
            if (!def) return { success: false, reason: 'Tool not in registry' };
            if (ToolPermissionGuard && !ToolPermissionGuard.verifyToolSignature(def)) {
                return { success: false, reason: 'Invalid signature — cannot install' };
            }

            ToolRegistryManager.markInstalled(toolId, true);
            if (LocalStoreTools) {
                await LocalStoreTools.saveToolLocal(
                    { ...def, isInstalled: true, installedAt: new Date().toISOString() },
                    LocalStoreTools.STORES.TOOLS
                );
            }

            this.queueToolInstalled(def);
            _emit('toolInstalled', { toolId, def });
            return { success: true };
        },

        async removeTool(toolId) {
            if (!ToolRegistryManager) {
                return { success: false, reason: 'Registry manager not available' };
            }
            ToolRegistryManager.markInstalled(toolId, false);
            ToolRegistryManager.markActive(toolId, false);
            if (LocalStoreTools) {
                await LocalStoreTools.deleteToolLocal(toolId, LocalStoreTools.STORES.TOOLS);
            }
            this.queueToolRemoved(toolId);
            _emit('toolRemoved', { toolId });
            return { success: true };
        },

        subscribe(callback) {
            _subscribers.add(callback);
            return () => _subscribers.delete(callback);
        },

        getStatus() {
            return {
                isSyncing: _isSyncing,
                lastSyncAt: _lastSyncAt,
                queueLength: _queue.length,
                online: navigator.onLine,
                polling: !!_syncInterval,
            };
        },

        getQueue() { return [..._queue]; },
    };

    window.addEventListener('online', () => {
        _log('Back online — triggering sync');
        setTimeout(_runSyncCycle, 1000);
    });
    window.addEventListener('offline', () => {
        _log('Gone offline — sync paused');
    });

    return ToolSyncEngine;
}));