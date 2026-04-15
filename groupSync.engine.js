// ============================================================
// groupSync.engine.js
// SYNC ENGINE — pulls server truth, merges with local cache,
// resolves conflicts.  Server ALWAYS wins for roles/membership.
// ============================================================

const SYNC_VERSION       = '1.0.0';
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

const _syncListeners = new Set();  // onChange callbacks

// ── Sync State per group ──────────────────────────────────────────────────
const _syncMeta = new Map(); // groupId → { lastSync, inProgress }

// ── Public API ────────────────────────────────────────────────────────────
const GroupSyncEngine = {

    version: SYNC_VERSION,

    // ── Dependency injection ──────────────────────────────────────────────
    setup({ store, queueManager, groupCore, apiRequest }) {
        _store      = store;
        _queueMgr   = queueManager;
        _groupCore  = groupCore;
        _apiRequest = apiRequest;
    },

    setSessionReady(ready) {
        _sessionReady = ready;
        if (ready) this.syncAll({ silent: true });
    },

    // ── Subscribe to sync events ──────────────────────────────────────────
    onSync(cb) {
        _syncListeners.add(cb);
        return () => _syncListeners.delete(cb);
    },

    // ── Full sync ─────────────────────────────────────────────────────────
    async syncAll({ silent = false, force = false } = {}) {
        console.log('[SYNC START] GroupSyncEngine.syncAll');
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
            const serverGroups = [
                ...(serverData.groups       || []),
                ...(serverData.myGroups     || []),
                ...(serverData.joinedGroups || []),
                ...(serverData.adminGroups  || []),
            ];

            // Deduplicate by id
            const seen = new Set();
            const uniqueServer = serverGroups.filter(g => {
                if (!g?.id || seen.has(g.id)) return false;
                seen.add(g.id);
                return true;
            });

            // ── Conflict resolution ────────────────────────────────────────
            // Rule: server ALWAYS wins for roles, membership, permissions.
            // Local-only additions get preserved until server confirms them.
            for (const serverGroup of uniqueServer) {
                const localGroup = _store ? await _store.getGroup(serverGroup.id) : null;

                const merged = _mergeGroup(localGroup, serverGroup);

                // Save merged result locally
                if (_store) await _store.saveGroupLocal({ ...merged, syncState: 'synced' });
            }

            // ── Remove deleted/archived groups from local ─────────────────
            if (_store) {
                const localAll  = await _store.getAllGroups();
                const serverIds = new Set(uniqueServer.map(g => String(g.id)));

                for (const localG of localAll) {
                    // Keep local-only groups (not yet confirmed by server)
                    if (localG.isLocalOnly) continue;
                    if (!serverIds.has(String(localG.id))) {
                        // Server no longer knows about this group → remove locally
                        await _store.markSyncState(localG.id, 'synced', { status: 'deleted' });
                        if (_store) await _store.deleteGroupLocal(localG.id);
                    }
                }
            }

            // ── Push results into GroupCore memory ───────────────────────
            if (_groupCore) {
                _groupCore.groups       = serverData.groups       || [];
                _groupCore.myGroups     = serverData.myGroups     || [];
                _groupCore.joinedGroups = serverData.joinedGroups || [];
                _groupCore.adminGroups  = serverData.adminGroups  || [];
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
    async syncGroupMembers(groupId) {
        if (!_apiRequest || !groupId) return { success: false };

        try {
            const response = await _apiRequest(`/group-members/${groupId}/members`, 'GET');
            if (!response?.success || !response?.data) return { success: false };

            const serverMembers = safeArray(response.data?.members || response.data);

            // Server wins: replace local member list entirely
            if (_store) {
                const localMembers = await _store.getMembersForGroup(groupId);
                // Delete members no longer on server
                const serverUserIds = new Set(serverMembers.map(m => String(m.userId)));
                for (const lm of localMembers) {
                    if (!serverUserIds.has(String(lm.userId))) {
                        await _store.deleteMemberLocal(lm.id, groupId);
                    }
                }
                // Upsert server members
                for (const sm of serverMembers) {
                    await _store.saveMemberLocal({
                        id      : sm.id || `${groupId}_${sm.userId}`,
                        groupId,
                        userId  : sm.userId,
                        role    : sm.role   || 'member',
                        status  : sm.status || 'active',
                        joinedAt: sm.joinedAt,
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
    async syncInvites() {
        if (!_apiRequest) return { success: false };
        try {
            let response = await _apiRequest('/group-members/invitations?status=pending', 'GET');
            if (!response?.success) {
                response = await _apiRequest('/groups/invitations?status=pending', 'GET');
            }
            if (!response?.success || !response?.data) return { success: false };

            const invites = safeArray(response.data?.invitations || response.data);

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
    // Immediately updates local state + queues server call.
    async optimisticCreate(groupData, currentUserId) {
        const tempId = `local_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        const localGroup = {
            ...groupData,
            id         : tempId,
            serverId   : null,
            createdBy  : currentUserId,
            createdAt  : new Date().toISOString(),
            updatedAt  : new Date().toISOString(),
            status     : 'active',
            isLocalOnly: true,
            syncState  : 'pending',
        };

        // Save locally FIRST (UI renders immediately)
        if (_store) await _store.saveGroupLocal(localGroup);

        // Update GroupCore memory
        if (_groupCore) {
            _groupCore.groups.push(localGroup);
            _groupCore.myGroups.push(localGroup);
            _groupCore.adminGroups.push(localGroup);
            _groupCore.saveGroups();
            _groupCore.emit('group:created', localGroup);
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

        // Update GroupCore
        if (_groupCore) {
            const group = _groupCore.getGroupById(groupId);
            if (group) {
                if (!group.members) group.members = [];
                group.members.push(localMember);
                _groupCore.updateGroupInLists(group);
                _groupCore.saveGroups();
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

        // Mark removed locally
        if (_store) {
            const members = await _store.getMembersForGroup(groupId);
            const m = members.find(m => m.userId === userId);
            if (m) await _store.saveMemberLocal({ ...m, status: 'removed' });
        }

        if (_groupCore) {
            const group = _groupCore.getGroupById(groupId);
            if (group?.members) {
                const m = group.members.find(m => m.userId === userId);
                if (m) { m.status = 'removed'; _groupCore.saveGroups(); }
            }
        }

        // Queue with rollback data
        if (_queueMgr) {
            await _queueMgr.enqueue(_queueMgr.ACTIONS.REMOVE_MEMBER, groupId, userId, { snapshot: _snapshot });
        }
    },

    // ── Start / stop background sync ──────────────────────────────────────
    startBackgroundSync() {
        if (_syncIntervalId) return;
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
            isSyncing  : _isSyncing,
            sessionReady: _sessionReady,
            isOnline   : navigator.onLine,
            lastSync   : _store?.getLastSync?.() || null,
        };
    },
};

// ── Conflict resolution ───────────────────────────────────────────────────
// Server wins for all membership/permission fields.
// Local wins for transient UI state (e.g. syncState).
function _mergeGroup(local, server) {
    if (!local) return { ...server, syncState: 'synced', isLocalOnly: false };

    return {
        // Start with local (preserve local-only fields)
        ...local,
        // Server always wins for these fields:
        name        : server.name,
        description : server.description,
        createdBy   : server.createdBy,
        status      : server.status,
        isPublic    : server.isPublic,
        members     : server.members     ?? local.members,
        maxMembers  : server.maxMembers  ?? local.maxMembers,
        avatar      : server.avatar      ?? local.avatar,
        inviteLink  : server.inviteLink  ?? local.inviteLink,
        settings    : server.settings    ?? local.settings,
        isAdmin     : server.isAdmin,
        isCreator   : server.isCreator,
        memberCount : server.memberCount ?? local.memberCount,
        updatedAt   : server.updatedAt,
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
    // Also fire on window for any external listeners
    try {
        window.dispatchEvent(new CustomEvent(`groupSync:${event}`, { detail: data }));
    } catch(e) {}
}

// ── Expose globally ───────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.GroupSyncEngine = GroupSyncEngine;
}

export default GroupSyncEngine;
export { GroupSyncEngine };
