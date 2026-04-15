// ============================================================
// group-core.patch.js
// INTEGRATION PATCH — wires LocalGroupStore + GroupSyncEngine +
// GroupQueueManager into the existing group-core.js system.
//
// HOW TO USE:
//   Add this <script type="module"> AFTER group-core.js loads.
//   It monkey-patches the existing GroupCore object so all existing
//   code keeps working, and adds local-first persistence everywhere.
//
// SUCCESS CRITERIA (all must be true):
//   ✔ saveGroupLocal() is called on every group mutation
//   ✔ localStorage/IndexedDB has data after first server response
//   ✔ UI loads from local cache FIRST (instant render)
//   ✔ App works offline (actions queued, UI reads from cache)
//   ✔ Page refresh does NOT delete groups
// ============================================================

import LocalGroupStore, { STORE_KEYS }         from './localStore.groups.js';
import GroupQueueManager, { QUEUE_ACTIONS }     from './groupQueue.manager.js';
import GroupSyncEngine                          from './groupSync.engine.js';

// ── Wait for group-core.js to be ready ───────────────────────────────────
// GroupCore, SafeStorage, apiRequest, session are all globals from group-core.js

let _patchApplied  = false;
let _patchRetries  = 0;
const MAX_PATCH_RETRIES = 30;

async function applyPatch() {
    if (_patchApplied) return;

    // group-core.js exports GroupCore as a global window reference
    // (also exposed via window.GroupCore in some builds).
    // We look for it in window AND in the module scope via dynamic check.
    const GC = window.GroupCore || (typeof GroupCore !== 'undefined' ? GroupCore : null);

    if (!GC) {
        if (++_patchRetries > MAX_PATCH_RETRIES) {
            console.error('[patch] GroupCore never became available. Patch aborted.');
            return;
        }
        setTimeout(applyPatch, 200);
        return;
    }

    _patchApplied = true;
    console.log('[patch] 🔧 Applying local-first patch to GroupCore...');

    // ── 1. Wire up dependencies ───────────────────────────────────────────
    GroupQueueManager.setStore(LocalGroupStore);
    GroupQueueManager.setApiCall(_apiCallBridge);

    GroupSyncEngine.setup({
        store      : LocalGroupStore,
        queueManager: GroupQueueManager,
        groupCore  : GC,
        apiRequest : _apiCallBridge,
    });

    // ── 2. FAST BOOT: load from localStorage SYNCHRONOUSLY ───────────────
    // This fires before any async IDB call so the first render is instant.
    const bootstrap = LocalGroupStore.bootstrapFromLS();
    _applyBootstrap(GC, bootstrap);
    console.log('[patch] ⚡ Bootstrap loaded from localStorage instantly');

    // ── 3. Patch GroupCore.saveGroups to also call saveGroupLocal ─────────
    const _origSaveGroups = GC.saveGroups.bind(GC);
    GC.saveGroups = async function() {
        _origSaveGroups(); // keep SafeStorage writes

        // Also persist each group to IDB via localStore
        const allGroups = [
            ...(this.groups       || []),
            ...(this.myGroups     || []),
            ...(this.joinedGroups || []),
            ...(this.adminGroups  || []),
        ];
        const seen = new Set();
        for (const g of allGroups) {
            if (!g?.id || seen.has(g.id)) continue;
            seen.add(g.id);
            await LocalGroupStore.saveGroupLocal(g).catch(() => {});
        }
    };

    // ── 4. Patch GroupCore.createGroup — optimistic local-first ──────────
    const _origCreate = GC.createGroup.bind(GC);
    GC.createGroup = async function(groupData) {
        const userId = this.currentUser?.id || this.currentUser?.uid;

        // Optimistic: render immediately, queue if offline
        if (!navigator.onLine) {
            return GroupSyncEngine.optimisticCreate(groupData, userId);
        }

        const result = await _origCreate(groupData);

        if (result?.success && result?.data) {
            await LocalGroupStore.saveGroupLocal({
                ...result.data,
                syncState: 'synced',
                isLocalOnly: false,
            });
        } else if (!result?.success && !result?.queued) {
            // Server failed → store locally as pending
            await GroupSyncEngine.optimisticCreate(groupData, userId);
        }

        return result;
    };

    // ── 5. Patch GroupCore.updateGroupInLists to also persist ────────────
    const _origUpdateInLists = GC.updateGroupInLists.bind(GC);
    GC.updateGroupInLists = function(updatedGroup) {
        _origUpdateInLists(updatedGroup);
        LocalGroupStore.saveGroupLocal({ ...updatedGroup, syncState: 'synced' }).catch(() => {});
    };

    // ── 6. Patch GroupCore.addMember — optimistic ─────────────────────────
    const _origAddMember = GC.addMember?.bind(GC);
    if (_origAddMember) {
        GC.addMember = async function(groupId, userId, role) {
            if (!navigator.onLine) {
                return GroupSyncEngine.optimisticAddMember(groupId, userId, role);
            }
            const result = await _origAddMember(groupId, userId, role);
            if (result?.success) {
                await LocalGroupStore.saveMemberLocal({
                    id: `${groupId}_${userId}`,
                    groupId, userId, role: role || 'member',
                    status: 'active',
                    joinedAt: new Date().toISOString(),
                    isLocalOnly: false,
                });
            }
            return result;
        };
    }

    // ── 7. Patch GroupCore.removeMember — optimistic ──────────────────────
    const _origRemoveMember = GC.removeMember?.bind(GC);
    if (_origRemoveMember) {
        GC.removeMember = async function(groupId, userId) {
            if (!navigator.onLine) {
                await GroupSyncEngine.optimisticRemoveMember(groupId, userId);
                return { success: true, optimistic: true };
            }
            const result = await _origRemoveMember(groupId, userId);
            if (result?.success) {
                await LocalGroupStore.deleteMemberLocal(`${groupId}_${userId}`, groupId);
            }
            return result;
        };
    }

    // ── 8. Patch GroupCore.loadCachedData — IDB-first ────────────────────
    const _origLoadCached = GC.loadCachedData.bind(GC);
    GC.loadCachedData = async function() {
        _origLoadCached(); // SafeStorage loads first (sync)

        // Then upgrade with IDB data (async, richer)
        try {
            const allGroups = await LocalGroupStore.getAllGroups();
            if (allGroups.length > 0) {
                // Partition into lists
                const userId = this.currentUser?.id || this.currentUser?.uid;
                const myG    = allGroups.filter(g => g.createdBy === userId || g.isCreator);
                const adminG = allGroups.filter(g => g.isAdmin || g.isCreator);
                const joinedG= allGroups.filter(g => !g.isCreator && !g.isAdmin);

                // Only update if IDB has more data
                if (allGroups.length > this.groups.length) {
                    this.groups        = allGroups;
                    this.myGroups      = myG;
                    this.adminGroups   = adminG;
                    this.joinedGroups  = joinedG;
                    this.emit('groups:loaded', { groups: allGroups, source: 'idb' });
                    console.log(`[patch] 📦 IDB loaded ${allGroups.length} groups`);
                }
            }
        } catch(e) {}
    };

    // ── 9. Patch saveGroupsToLocalStorage global fn ───────────────────────
    // The existing function just calls GroupCore.saveGroups()
    // Our patched version handles IDB too, so nothing extra needed here.
    window.saveGroupLocal = async function(groupData) {
        return LocalGroupStore.saveGroupLocal(groupData);
    };

    // ── 10. Patch saveMessageToCache to also persist to IDB ──────────────
    // saveMessageToCache is defined in group-core.js
    const _origSaveMsg = window.saveMessageToCache;
    if (typeof _origSaveMsg === 'function') {
        window.saveMessageToCache = async function(groupId, message) {
            // Original SafeStorage write
            _origSaveMsg(groupId, message);
            // IDB write
            if (message?.id) {
                await LocalGroupStore.saveMessageLocal({ ...message, groupId }).catch(() => {});
            }
        };
    }

    // ── 11. Wire session readiness → sync engine ──────────────────────────
    // Listen for the groups:loaded event or sessionReady to trigger sync
    GC.on('groups:list-updated', () => {
        GroupSyncEngine.setSessionReady(true);
    });

    // ── 12. Set up GroupQueueManager success handler ──────────────────────
    GroupQueueManager.onSuccess(async (item, result) => {
        if (item.action === QUEUE_ACTIONS.CREATE_GROUP && result?.data?.id) {
            // Server confirmed creation → update local record with real serverId
            const localGroup = await LocalGroupStore.getGroup(item.groupId);
            if (localGroup) {
                await LocalGroupStore.saveGroupLocal({
                    ...localGroup,
                    ...result.data,
                    id         : result.data.id,     // real server ID
                    serverId   : result.data.id,
                    isLocalOnly: false,
                    syncState  : 'synced',
                });
                // Remove the temp local entry if ID changed
                if (localGroup.id !== result.data.id) {
                    await LocalGroupStore.deleteGroupLocal(localGroup.id);
                }
            }
        }
        // Trigger a fresh sync after any queue item succeeds
        GroupSyncEngine.triggerSync();
    });

    GroupQueueManager.onFailure((item) => {
        if (item.action === QUEUE_ACTIONS.CREATE_GROUP) {
            LocalGroupStore.markSyncState(item.groupId, 'failed').catch(() => {});
        }
    });

    // ── 13. Start background services ────────────────────────────────────
    GroupQueueManager.startAutoProcess();

    // Start background sync once session is ready
    // We hook into the LifecycleState ACTIVE transition
    const _checkAndStartSync = () => {
        if (typeof sessionReady !== 'undefined' && sessionReady) {
            GroupSyncEngine.setSessionReady(true);
            GroupSyncEngine.startBackgroundSync();
        } else {
            // Retry after 1s
            setTimeout(_checkAndStartSync, 1000);
        }
    };
    setTimeout(_checkAndStartSync, 2000);

    // ── 14. Tab/click instant rendering fix ───────────────────────────────
    // Category tabs (My Groups, Joined, Invites, Admin) fire updateCurrentSection.
    // We ensure local data is shown even before server responds.
    _patchTabInstantRender(GC);

    // ── 15. Online/offline UI state ───────────────────────────────────────
    _setupOnlineOfflineHandlers();

    // ── 16. Export diagnostics ────────────────────────────────────────────
    window.__groupLocalDiag = async () => {
        const sd = await LocalGroupStore.getDiagnostics();
        const qs = await GroupQueueManager.getStatus();
        const ss = GroupSyncEngine.getStatus();
        console.table({ ...sd, ...qs, ...ss });
        return { store: sd, queue: qs, sync: ss };
    };

    console.log('[patch] ✅ Local-first patch applied successfully');
}

// ── Bootstrap helper ──────────────────────────────────────────────────────
function _applyBootstrap(GC, bootstrap) {
    if (!bootstrap) return;

    // Only apply if GC has no data yet
    if (GC.groups.length === 0 && bootstrap.groups.length > 0) {
        GC.groups       = bootstrap.groups;
        GC.myGroups     = bootstrap.myGroups;
        GC.joinedGroups = bootstrap.joinedGroups;
        GC.adminGroups  = bootstrap.adminGroups;
        if (bootstrap.groupInvites) GC.groupInvites = bootstrap.groupInvites;

        GC.emit('groups:loaded', { groups: GC.groups, source: 'localStorage' });

        // Update global mirror variables used by group-ui.js render functions
        if (typeof groups !== 'undefined') {
            try {
                // These are module-level `let` in group-core.js.
                // We can't reassign them from here, but GroupCore's arrays
                // are shared references used by render functions.
                // The render functions read from GroupCore.* so we're safe.
            } catch(e) {}
        }
    }
}

// ── Tab instant-render patch ──────────────────────────────────────────────
// When a user clicks a tab, the render functions (renderMyGroups, etc.)
// should show local data IMMEDIATELY. They already do if GroupCore arrays
// are populated — which our bootstrap handles. This patch ensures that
// after clicking a tab we also trigger a background sync.
function _patchTabInstantRender(GC) {
    const tabs = document.querySelectorAll('.category-btn, [data-section]');
    tabs.forEach(tab => {
        // Capture the original click handler already bound by setupUIEventListeners.
        // We ADD our own listener (doesn't remove theirs).
        tab.addEventListener('click', () => {
            // After local render (which runs synchronously in the existing handler),
            // trigger a background sync to refresh data.
            if (navigator.onLine && typeof sessionReady !== 'undefined' && sessionReady) {
                setTimeout(() => GroupSyncEngine.syncAll({ silent: true }).catch(() => {}), 100);
            }
        });
    });

    // Also re-run on DOMContentLoaded in case tabs are added late
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.category-btn, [data-section]').forEach(tab => {
            tab.addEventListener('click', () => {
                if (navigator.onLine) {
                    setTimeout(() => GroupSyncEngine.syncAll({ silent: true }).catch(() => {}), 100);
                }
            });
        });
    });
}

// ── Online/Offline UI handling ────────────────────────────────────────────
function _setupOnlineOfflineHandlers() {
    window.addEventListener('online', async () => {
        console.log('[patch] 🌐 Online — processing queue and syncing');
        await GroupQueueManager.processNow();
        await GroupSyncEngine.syncAll({ silent: false });
    });

    window.addEventListener('offline', () => {
        console.log('[patch] ✈️  Offline — UI continues from local cache');
        // Show offline indicator if present
        const offlineEl = document.querySelector('#offlineIndicator, .offline-banner');
        if (offlineEl) offlineEl.style.display = 'block';
    });

    // Hide offline indicator on online
    window.addEventListener('online', () => {
        const offlineEl = document.querySelector('#offlineIndicator, .offline-banner');
        if (offlineEl) offlineEl.style.display = 'none';
    });
}

// ── API bridge — wraps the existing apiRequest from group-core.js ─────────
// apiRequest is defined at module scope in group-core.js.
// We access it via window or fallback to a direct import reference.
async function _apiCallBridge(endpoint, method, body) {
    try {
        // Prefer the existing module-scope apiRequest fn
        const fn = window.__groupCoreApiRequest || (typeof apiRequest === 'function' ? apiRequest : null);
        if (!fn) return { success: false, error: 'apiRequest not available' };

        const result = await fn(endpoint, method, body);
        return result;
    } catch(e) {
        return { success: false, error: e.message };
    }
}

// ── Expose apiRequest reference from group-core.js ────────────────────────
// group-core.js doesn't export apiRequest to window, but we can detect it
// via the GroupCore.requestGroupList internals which use it.
// The safest approach: expose it ourselves at module load time.
// (This is a no-op if it's already on window from group-core.js)
if (typeof apiRequest === 'function' && !window.__groupCoreApiRequest) {
    window.__groupCoreApiRequest = apiRequest;
}

// ── Kick off patch ────────────────────────────────────────────────────────
// We need group-core.js to have defined GroupCore first.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPatch);
} else {
    // DOM already ready — apply after current call stack clears
    setTimeout(applyPatch, 0);
}

// ── Re-expose key objects for debugging ──────────────────────────────────
window.LocalGroupStore   = LocalGroupStore;
window.GroupQueueManager = GroupQueueManager;
window.GroupSyncEngine   = GroupSyncEngine;

export { LocalGroupStore, GroupQueueManager, GroupSyncEngine };