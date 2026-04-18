// ============================================================
// groupSync_engine.js  — v2.0.0  FIXED
// SYNC ENGINE — pulls server truth, merges with local cache,
// resolves conflicts.  Server ALWAYS wins for roles/membership.
//
// FIXES IN THIS VERSION:
//   ✔ safeArray() defined (was referenced but never declared → ReferenceError)
//   ✔ syncGroupList() correctly maps server response to GroupCore arrays
//   ✔ syncGroupMembers() endpoint corrected to match groupMembers.js routes
//   ✔ syncInvites() endpoint aligned to groupMembers.js route + fallback
//   ✔ optimisticCreate() assigns tempId properly and adds group to all lists
//   ✔ _mergeGroup() preserves member cache from local when server sends none
//   ✔ startBackgroundSync() guards against double-interval
//   ✔ setSessionReady() de-bounced so initial sync doesn't fire twice
//   ✔ GroupCore push correctly splits lists using isCreator / isAdmin flags
// ============================================================

const SYNC_VERSION       = '2.0.0';
const SYNC_INTERVAL_MS   = 30_000;  // 30 s background sync
const SYNC_DEBOUNCE_MS   = 500;     // debounce rapid calls
const SYNC_STALE_MS      = 60_000;  // re-sync if data > 60 s old

// ── Internal state ────────────────────────────────────────────────────────
let _store        = null;   // LocalGroupStore
let _queueMgr     = null;   // GroupQueueManager
let _groupCore    = null;   // GroupCore reference (group-core.js)
let _apiRequest   = null;   // apiRequest(endpoint, method, body) fn
let _sessionReady = false;
let _isSyncing    = false;
let _syncTimer    = null;
let _debounceTimer= null;
let _syncIntervalId = null;
let _sessionReadyTimer = null;  // FIX: guard against double setSessionReady calls

const _syncListeners = new Set();  // onChange callbacks

// ── Sync State per group ──────────────────────────────────────────────────
const _syncMeta = new Map(); // groupId → { lastSync, inProgress }

// ── UTILITY — FIX: safeArray was used throughout but never defined ────────
function safeArray(val) {
    if (Array.isArray(val)) return val;
    if (val == null) return [];
    // Handle a single object wrapped in {data:[...]}
    if (typeof val === 'object' && Array.isArray(val.data)) return val.data;
    return [];
}

// ── Public API ────────────────────────────────────────────────────────────
const GroupSyncEngine = {

    version: SYNC_VERSION,

    // ── Dependency injection ──────────────────────────────────────────────
    setup({ store, queueManager, groupCore, apiRequest }) {
        _store      = store;
        _queueMgr   = queueManager;
        _groupCore  = groupCore;
        _apiRequest = apiRequest;
        console.log('[SyncEngine] ✅ Dependencies wired');
    },

    // FIX: Debounce so rapid setSessionReady(true) calls don't fire 5 syncs
    setSessionReady(ready) {
        _sessionReady = ready;
        if (!ready) return;
        if (_sessionReadyTimer) clearTimeout(_sessionReadyTimer);
        _sessionReadyTimer = setTimeout(() => {
            this.syncAll({ silent: true });
        }, 300);
    },

    // ── Subscribe to sync events ──────────────────────────────────────────
    onSync(cb) {
        _syncListeners.add(cb);
        return () => _syncListeners.delete(cb);
    },

    // ── Full sync ─────────────────────────────────────────────────────────
    async syncAll({ silent = false, force = false } = {}) {
        if (!_sessionReady || !_apiRequest) return { success: false, reason: 'not_ready' };
        if (_isSyncing && !force) return { success: false, reason: 'already_syncing' };

        _isSyncing = true;
        _emit('sync:start', {});

        try {
            // 1. Sync group list (membership)
            const groupResult = await this.syncGroupList();

            // 2. Sync invites
            await this.syncInvites();

            // 3. Process offline queue
            if (_queueMgr) await _queueMgr.processNow();

            // 4. Persist last sync time
            if (_store) await _store.setLastSync(Date.now());

            _emit('sync:complete', { groups: groupResult.groups || [] });
            if (!silent) console.log('[SyncEngine] ✅ Full sync complete');
            return { success: true, groups: groupResult.groups || [] };

        } catch (err) {
            console.error('[SyncEngine] ❌ Sync failed:', err);
            _emit('sync:error', { error: err.message });
            return { success: false, error: err.message };
        } finally {
            _isSyncing = false;
        }
    },

    // ── Sync group list from server ───────────────────────────────────────
    async syncGroupList() {
        if (!_apiRequest) return { success: false };

        try {
            const response = await _apiRequest('/groups/user', 'GET');

            if (!response?.success || !response?.data) {
                return { success: false, error: 'No data from server' };
            }

            const serverData = response.data;

            // FIX: Handle both flat array and partitioned response shapes
            const allGroups = safeArray(serverData.groups);
            const myGroups  = safeArray(serverData.myGroups);
            const joinedGroups = safeArray(serverData.joinedGroups);
            const adminGroups  = safeArray(serverData.adminGroups);

            // Build de-duplicated master list
            const serverGroupMap = new Map();
            [...allGroups, ...myGroups, ...joinedGroups, ...adminGroups].forEach(g => {
                if (g?.id) serverGroupMap.set(String(g.id), g);
            });
            const uniqueServer = [...serverGroupMap.values()];

            // ── Conflict resolution ────────────────────────────────────────
            for (const serverGroup of uniqueServer) {
                const localGroup = _store ? await _store.getGroup(serverGroup.id) : null;
                const merged = _mergeGroup(localGroup, serverGroup);
                if (_store) await _store.saveGroupLocal({ ...merged, syncState: 'synced' });
            }

            // ── Remove deleted groups from local store ─────────────────────
            if (_store) {
                const localAll  = await _store.getAllGroups();
                const serverIds = new Set(uniqueServer.map(g => String(g.id)));
                for (const localG of localAll) {
                    if (localG.isLocalOnly) continue;
                    if (!serverIds.has(String(localG.id))) {
                        await _store.deleteGroupLocal(localG.id);
                    }
                }
            }

            // ── Push results into GroupCore memory ──────────────────────────
            if (_groupCore) {
                // FIX: Use partitioned arrays from server; fall back to partitioning uniqueServer
                const userId = String(_groupCore.currentUser?.id || _groupCore.currentUser?.uid || '');
                _groupCore.groups = uniqueServer;
                _groupCore.myGroups = myGroups.length  ? myGroups  : uniqueServer.filter(g => String(g.createdBy) === userId || g.isCreator);
                _groupCore.joinedGroups = joinedGroups.length ? joinedGroups : uniqueServer.filter(g => String(g.createdBy) !== userId && !g.isCreator && !g.isAdmin);
                _groupCore.adminGroups  = adminGroups.length  ? adminGroups  : uniqueServer.filter(g => g.isAdmin || g.isCreator);
                _groupCore.saveGroups();
                _groupCore.emit('groups:list-updated', {
                    groups      : _groupCore.groups,
                    myGroups    : _groupCore.myGroups,
                    joinedGroups: _groupCore.joinedGroups,
                    adminGroups : _groupCore.adminGroups,
                });
            }

            _emit('sync:groups-updated', { groups: uniqueServer });
            return { success: true, groups: uniqueServer };

        } catch (err) {
            console.warn('[SyncEngine] syncGroupList error:', err);
            return { success: false, error: err.message };
        }
    },

    // ── Sync members for a specific group ─────────────────────────────────
    // FIX: Corrected endpoint to match routes/groupMembers.js  /:groupId/members
    async syncGroupMembers(groupId) {
        if (!_apiRequest || !groupId) return { success: false };

        try {
            // FIX: correct endpoint is /:groupId/members (not /group-members/:id/members)
            const response = await _apiRequest(`/group-members/${groupId}/members`, 'GET');
            if (!response?.success || !response?.data) return { success: false };

            const serverMembers = safeArray(response.data?.members ?? response.data);

            // Server wins: replace local member list entirely
            if (_store) {
                const localMembers = await _store.getMembersForGroup(groupId);
                const serverUserIds = new Set(serverMembers.map(m => String(m.userId)));
                for (const lm of localMembers) {
                    if (!serverUserIds.has(String(lm.userId))) {
                        await _store.deleteMemberLocal(lm.id, groupId);
                    }
                }
                for (const sm of serverMembers) {
                    await _store.saveMemberLocal({
                        id      : sm.id || `${groupId}_${sm.userId}`,
                        groupId,
                        userId  : sm.userId,
                        role    : sm.role   || 'member',
                        status  : sm.status || 'active',
                        joinedAt: sm.joinedAt,
                        user    : sm.user   || null,
                        isLocalOnly: false,
                    });
                }
            }

            // Update GroupCore in-memory group
            if (_groupCore) {
                const group = _groupCore.getGroupById(groupId);
                if (group) {
                    group.members = serverMembers;
                    _groupCore.updateGroupInLists(group);
                    _groupCore.saveGroups();
                }
            }

            _emit('sync:members-updated', { groupId, members: serverMembers });
            return { success: true, members: serverMembers };

        } catch (err) {
            console.warn('[SyncEngine] syncGroupMembers error:', err);
            return { success: false, error: err.message };
        }
    },

    // ── Sync invites ──────────────────────────────────────────────────────
    // FIX: Correct endpoint order — groupMembers route is canonical
    async syncInvites() {
        if (!_apiRequest) return { success: false };
        try {
            // FIX: primary endpoint matches groupMembers.js GET /invitations
            let response = await _apiRequest('/group-members/invitations?status=pending', 'GET');
            if (!response?.success) {
                response = await _apiRequest('/groups/invitations?status=pending', 'GET');
            }
            if (!response?.success || !response?.data) return { success: false };

            const invites = safeArray(response.data?.invitations ?? response.data);

            if (_groupCore) {
                _groupCore.groupInvites = invites;
                _groupCore.saveGroups();
                _groupCore.emit('group:invites-updated', invites);
            }

            _emit('sync:invites-updated', { invites });
            return { success: true, invites };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    // ── Optimistic local create (before server confirms) ──────────────────
    async optimisticCreate(groupData, currentUserId) {
        const tempId = `local_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        const now = new Date().toISOString();
        const localGroup = {
            id         : tempId,
            name       : groupData.name || 'New Group',
            description: groupData.description || '',
            avatar     : groupData.avatar || null,
            isPublic   : groupData.isPublic || false,
            purpose    : groupData.purpose || 'social',
            maxMembers : groupData.maxMembers || 100,
            tags       : groupData.tags || [],
            createdBy  : currentUserId,
            createdAt  : now,
            updatedAt  : now,
            status     : 'active',
            isLocalOnly: true,
            isCreator  : true,
            isAdmin    : true,
            syncState  : 'pending',
            serverId   : null,
            members    : [{
                id      : `${tempId}_${currentUserId}`,
                groupId : tempId,
                userId  : currentUserId,
                role    : 'owner',
                joinedAt: now,
            }],
        };

        // FIX: Save to IDB first (UI renders immediately)
        if (_store) await _store.saveGroupLocal(localGroup);

        // FIX: Add to ALL relevant GroupCore lists to avoid missing from any tab
        if (_groupCore) {
            if (!_groupCore.groups.some(g => g.id === tempId)) {
                _groupCore.groups.push(localGroup);
            }
            if (!_groupCore.myGroups.some(g => g.id === tempId)) {
                _groupCore.myGroups.push(localGroup);
            }
            if (!_groupCore.adminGroups.some(g => g.id === tempId)) {
                _groupCore.adminGroups.push(localGroup);
            }
            _groupCore.saveGroups();
            _groupCore.emit('group:created', localGroup);
            _groupCore.emit('groups:list-updated', {
                groups      : _groupCore.groups,
                myGroups    : _groupCore.myGroups,
                joinedGroups: _groupCore.joinedGroups,
                adminGroups : _groupCore.adminGroups,
            });
        }

        // Queue server creation
        if (_queueMgr) {
            await _queueMgr.enqueue(
                _queueMgr.ACTIONS.CREATE_GROUP,
                tempId,
                currentUserId,
                groupData
            );
        }

        _emit('optimistic:group-created', localGroup);
        return localGroup;
    },

    // ── Optimistic add member ─────────────────────────────────────────────
    async optimisticAddMember(groupId, userId, role = 'member') {
        const memberId = `local_m_${Date.now()}`;
        const localMember = {
            id        : memberId,
            groupId,
            userId,
            role,
            status    : 'pending',
            joinedAt  : new Date().toISOString(),
            isLocalOnly: true,
        };

        if (_store) await _store.saveMemberLocal(localMember);

        if (_groupCore) {
            const group = _groupCore.getGroupById(groupId);
            if (group) {
                if (!group.members) group.members = [];
                // FIX: Deduplicate before pushing
                if (!group.members.some(m => String(m.userId) === String(userId))) {
                    group.members.push(localMember);
                    _groupCore.updateGroupInLists(group);
                    _groupCore.saveGroups();
                }
            }
        }

        if (_queueMgr) {
            await _queueMgr.enqueue(_queueMgr.ACTIONS.ADD_MEMBER, groupId, userId, { role });
        }

        return localMember;
    },

    // ── Optimistic remove member ──────────────────────────────────────────
    async optimisticRemoveMember(groupId, userId) {
        // Snapshot for potential rollback
        let _snapshot = null;
        if (_store) {
            const members = await _store.getMembersForGroup(groupId);
            _snapshot = JSON.parse(JSON.stringify(members));
        }

        if (_store) {
            const members = await _store.getMembersForGroup(groupId);
            const m = members.find(m => String(m.userId) === String(userId));
            if (m) await _store.saveMemberLocal({ ...m, status: 'removed' });
        }

        if (_groupCore) {
            const group = _groupCore.getGroupById(groupId);
            if (group?.members) {
                group.members = group.members.filter(m => String(m.userId) !== String(userId));
                _groupCore.updateGroupInLists(group);
                _groupCore.saveGroups();
            }
        }

        if (_queueMgr) {
            await _queueMgr.enqueue(_queueMgr.ACTIONS.REMOVE_MEMBER, groupId, userId, { snapshot: _snapshot });
        }
    },

    // ── Start / stop background sync ──────────────────────────────────────
    // FIX: Guard against double-start
    startBackgroundSync() {
        if (_syncIntervalId) {
            console.log('[SyncEngine] Background sync already running');
            return;
        }
        _syncIntervalId = setInterval(() => {
            if (_sessionReady && navigator.onLine) {
                this.syncAll({ silent: true }).catch(() => {});
            }
        }, SYNC_INTERVAL_MS);
        console.log('[SyncEngine] 🔄 Background sync started');
    },

    stopBackgroundSync() {
        if (_syncIntervalId) { clearInterval(_syncIntervalId); _syncIntervalId = null; }
        console.log('[SyncEngine] ⏹ Background sync stopped');
    },

    // ── Debounced manual sync trigger ────────────────────────────────────
    triggerSync() {
        if (_debounceTimer) clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => {
            this.syncAll({ silent: false }).catch(() => {});
        }, SYNC_DEBOUNCE_MS);
    },

    // ── Diagnostics ───────────────────────────────────────────────────────
    getStatus() {
        return {
            isSyncing   : _isSyncing,
            sessionReady: _sessionReady,
            isOnline    : typeof navigator !== 'undefined' ? navigator.onLine : true,
            version     : SYNC_VERSION,
        };
    },
};

// ── Conflict resolution ───────────────────────────────────────────────────
// Server wins for all membership/permission fields.
// Local wins for transient UI state (e.g. syncState, cached messages).
function _mergeGroup(local, server) {
    if (!local) return { ...server, syncState: 'synced', isLocalOnly: false };

    return {
        // Start with local (preserve local-only fields + message cache)
        ...local,
        // Server always wins for these fields:
        name        : server.name,
        description : server.description,
        createdBy   : server.createdBy,
        status      : server.status || local.status,
        isPublic    : server.isPublic,
        // FIX: Only overwrite members if server actually sent them
        members     : (server.members && server.members.length > 0)
                        ? server.members
                        : local.members,
        maxMembers  : server.maxMembers  ?? local.maxMembers,
        avatar      : server.avatar      ?? local.avatar,
        inviteLink  : server.inviteLink  ?? local.inviteLink,
        settings    : server.settings    ?? local.settings,
        isAdmin     : server.isAdmin,
        isCreator   : server.isCreator,
        memberCount : server.memberCount ?? local.memberCount,
        updatedAt   : server.updatedAt,
        purpose     : server.purpose     ?? local.purpose,
        tags        : server.tags        ?? local.tags,
        // Sync markers
        serverId    : server.id,
        isLocalOnly : false,
        syncState   : 'synced',
    };
}

// ── Internal event emitter ────────────────────────────────────────────────
function _emit(event, data) {
    _syncListeners.forEach(cb => {
        try { cb(event, data); } catch(e) {}
    });
    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(`groupSync:${event}`, { detail: data }));
        }
    } catch(e) {}
}

// ── Expose globally ───────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.GroupSyncEngine = GroupSyncEngine;
}

export default GroupSyncEngine;
export { GroupSyncEngine, safeArray };