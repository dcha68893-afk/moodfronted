// group-core_patch.js — v3.0.0
// ============================================================
// FIXES IN v3.0.0:
//   FIX 1: createGroupOnline timeout → offline-first optimistic create
//          Group appears instantly in UI, queued for backend sync
//   FIX 2: Members tab fully wired — loads friends, search, chips,
//          badge count, selectedFriends kept in sync
//   FIX 3: apiRequest bridge multi-strategy so Queue+Sync always work
//   FIX 4: socket group:localSync handler for all action types
//   FIX 5: IDB hydration after fast LS bootstrap
//   FIX 6: Queue success remaps tempId → serverId
//   FIX 7: Import paths use underscore naming
//   FIX 8: startBackgroundSync guarded, setSessionReady debounced
// ============================================================

import LocalGroupStore                          from './localStore_groups.js';
import GroupQueueManager, { QUEUE_ACTIONS }     from './groupQueue_manager.js';
import GroupSyncEngine                          from './groupSync_engine.js';

let _patchApplied = false;
let _patchRetries = 0;
const _selectedMembers = new Set();

function boot() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(applyPatch, 0));
    } else {
        setTimeout(applyPatch, 0);
    }
}

async function applyPatch() {
    if (_patchApplied) return;
    const GC = window.GroupCore || (typeof GroupCore !== 'undefined' ? GroupCore : null);
    if (!GC) {
        if (++_patchRetries > 40) { console.error('[patch] GroupCore never appeared'); return; }
        return setTimeout(applyPatch, 200);
    }
    _patchApplied = true;
    console.log('[patch] v3.0.0 applying...');

    // 1. Wire dependencies
    GroupQueueManager.setStore(LocalGroupStore);
    GroupQueueManager.setApiCall(_apiBridge);
    GroupSyncEngine.setup({ store: LocalGroupStore, queueManager: GroupQueueManager, groupCore: GC, apiRequest: _apiBridge });

    // 2. Fast LS bootstrap
    _applyLsBootstrap(GC);

    // 3. Patch saveGroups
    const _origSave = GC.saveGroups.bind(GC);
    GC.saveGroups = async function () {
        _origSave();
        const seen = new Set();
        [...(this.groups||[]),...(this.myGroups||[]),...(this.joinedGroups||[]),...(this.adminGroups||[])].forEach(g => {
            if (!g?.id || seen.has(String(g.id))) return;
            seen.add(String(g.id));
            LocalGroupStore.saveGroupLocal(g).catch(() => {});
        });
    };

    // 4. Patch updateGroupInLists
    const _origUpdate = GC.updateGroupInLists.bind(GC);
    GC.updateGroupInLists = function (g) {
        _origUpdate(g);
        LocalGroupStore.saveGroupLocal({ ...g, syncState: 'synced' }).catch(() => {});
    };

    // 5. Patch loadCachedData — IDB merge
    const _origLoad = GC.loadCachedData.bind(GC);
    GC.loadCachedData = async function () {
        _origLoad();
        try {
            const idbGroups = await LocalGroupStore.getAllGroups();
            if (!idbGroups.length) return;
            const uid = String(this.currentUser?.id || this.currentUser?.uid || '');
            const memIds = new Set(this.groups.map(g => String(g.id)));
            const added = idbGroups.filter(g => !memIds.has(String(g.id)));
            if (!added.length) return;
            this.groups = [...this.groups, ...added];
            this.myGroups = this.groups.filter(g => String(g.createdBy) === uid || g.isCreator);
            this.adminGroups = this.groups.filter(g => g.isAdmin || g.isCreator);
            this.joinedGroups = this.groups.filter(g => !g.isCreator && !g.isAdmin);
            this.emit('groups:loaded', { groups: this.groups, source: 'idb' });
        } catch (e) { console.warn('[patch] IDB load error:', e); }
    };

    // 6. FIX: Patch createGroup — OFFLINE-FIRST (fixes "Request timeout")
    const _origCreate = GC.createGroup?.bind(GC);
    GC.createGroup = async function (groupData) {
        const uid = this.currentUser?.id || this.currentUser?.uid;

        // Merge picker selections into memberIds
        const pickerIds = [..._selectedMembers].filter(id => String(id) !== String(uid));
        if (pickerIds.length) {
            groupData = { ...groupData, memberIds: [...new Set([...(groupData.memberIds || []), ...pickerIds])] };
        }

        // Create locally first — instant UI, no waiting
        const localGroup = await GroupSyncEngine.optimisticCreate(groupData, uid);
        console.log('[patch] Group created locally:', localGroup.name, '— syncing to backend...');

        // Fire backend in background — never blocks UI
        if (navigator.onLine && _origCreate) {
            _origCreate(groupData).then(async (res) => {
                if (res?.success && res.data?.group) {
                    await _remapGroupId(GC, localGroup.id, res.data.group);
                    if (pickerIds.length) _inviteMembers(res.data.group.id, pickerIds, uid);
                }
            }).catch(() => { /* stays queued */ });
        } else if (pickerIds.length) {
            for (const mid of pickerIds) {
                GroupQueueManager.enqueue(QUEUE_ACTIONS.ADD_MEMBER, localGroup.id, mid, { role: 'member' }).catch(() => {});
            }
        }

        // Reset picker
        _selectedMembers.clear();
        _renderChips();
        _updateTabBadge();

        return { success: true, data: localGroup };
    };

    // 7. Patch addMember — offline-first
    const _origAdd = GC.addMember?.bind(GC);
    if (_origAdd) {
        GC.addMember = async function (groupId, userId, role) {
            if (!navigator.onLine) return GroupSyncEngine.optimisticAddMember(groupId, userId, role);
            const res = await _origAdd(groupId, userId, role);
            if (res?.success) {
                const member = res.data?.member || { id: `${groupId}_${userId}`, groupId, userId, role: role || 'member', joinedAt: new Date().toISOString() };
                await LocalGroupStore.saveMemberLocal({ ...member, isLocalOnly: false });
            }
            return res;
        };
    }

    // 8. Patch removeMember — offline-first
    const _origRemove = GC.removeMember?.bind(GC);
    if (_origRemove) {
        GC.removeMember = async function (groupId, userId) {
            if (!navigator.onLine) return GroupSyncEngine.optimisticRemoveMember(groupId, userId);
            const res = await _origRemove(groupId, userId);
            if (res?.success) LocalGroupStore.deleteMemberLocal(`${groupId}_${userId}`, groupId).catch(() => {});
            return res;
        };
    }

    // 9. Queue handlers
    GroupQueueManager.onSuccess(async (item, result) => {
        if (item.action === QUEUE_ACTIONS.CREATE_GROUP && result?.data?.group?.id) {
            await _remapGroupId(GC, item.groupId, result.data.group);
        }
        GroupSyncEngine.triggerSync();
    });
    GroupQueueManager.onFailure((item) => {
        if (item.action === QUEUE_ACTIONS.CREATE_GROUP) {
            LocalGroupStore.markSyncState(item.groupId, 'failed').catch(() => {});
        }
    });

    // 10. Background services
    GroupQueueManager.startAutoProcess();
    GC.on('groups:list-updated', () => GroupSyncEngine.setSessionReady(true));
    _waitForActiveAndSync(GC);

    // 11. Network events
    window.addEventListener('online', async () => {
        const el = document.querySelector('#offlineIndicator, .offline-banner');
        if (el) el.style.display = 'none';
        await GroupQueueManager.processNow();
        await GroupSyncEngine.syncAll({ silent: false });
    });
    window.addEventListener('offline', () => {
        const el = document.querySelector('#offlineIndicator, .offline-banner');
        if (el) el.style.display = 'block';
    });

    // 12. Socket + postMessage handlers
    _setupSocketHandlers(GC);

    // 13. Member picker UI (wires #friendsPickerList inside createGroupModal)
    _initMemberPicker(GC);

    // 14. IDB async hydration
    setTimeout(async () => {
        try { await LocalGroupStore.ready(); await GC.loadCachedData(); } catch (_) {}
    }, 80);

    // 15. Diagnostics
    window.__groupDiag = async () => {
        const [s, q, sy] = await Promise.all([LocalGroupStore.getDiagnostics(), GroupQueueManager.getStatus(), Promise.resolve(GroupSyncEngine.getStatus())]);
        console.table({ ...s, ...q, ...sy });
    };

    window.LocalGroupStore = LocalGroupStore;
    window.GroupQueueManager = GroupQueueManager;
    window.GroupSyncEngine = GroupSyncEngine;

    console.log('[patch] v3.0.0 applied');
}

// =============================================================================
// MEMBER PICKER
// =============================================================================

function _initMemberPicker(GC) {
    // Load friends list when Members tab is clicked
    document.addEventListener('click', (e) => {
        const tab = e.target.closest('.create-group-tab[data-tab="members"]');
        if (tab && tab.closest('#createGroupModal')) _loadMemberPicker(GC);

        const anyTab = e.target.closest('.create-group-tab');
        if (anyTab && anyTab.closest('#createGroupModal')) _syncTabActive(anyTab);
    });

    // Reset on close
    document.addEventListener('click', (e) => {
        if (e.target.closest('#closeCreateGroupModal') || e.target.closest('#cancelCreateGroupBtn')) {
            _selectedMembers.clear();
            _renderChips();
            _updateTabBadge();
        }
    });

    // Search filter
    document.addEventListener('input', (e) => {
        if (e.target.id === 'memberSearchInput') _filterFriendsList(e.target.value.toLowerCase().trim());
    });

    // Auto-load when modal becomes visible
    const mo = new MutationObserver(() => {
        const modal = document.getElementById('createGroupModal');
        if (!modal) return;
        const visible = modal.classList.contains('active') || modal.style.display === 'flex' || modal.style.display === 'block';
        const list = document.getElementById('friendsPickerList');
        if (visible && list && !list._loaded) _loadMemberPicker(GC);
    });
    mo.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
}

async function _loadMemberPicker(GC) {
    const list = document.getElementById('friendsPickerList');
    if (!list) return;
    if (list._loaded) { _renderFriendsList(list, list._friends || []); return; }

    list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-secondary)"><i class="fas fa-spinner fa-spin"></i> Loading friends...</div>`;

    let raw = [];

    // Strategy 1: GroupCore in-memory friends
    if (GC.friends?.length) raw = GC.friends;
    // Strategy 2: window.__friendsList (cached from FRIENDS_LIST_UPDATE)
    else if (window.__friendsList?.length) raw = window.__friendsList;
    // Strategy 3: KynectaStore
    else {
        try { raw = window.KynectaStore?.get?.('friends.list') || []; } catch (_) {}
    }
    // Strategy 4: Direct fetch
    if (!raw.length) {
        try {
            const token = _getToken();
            if (token) {
                const base = window.__API_BASE_URL || window.API_BASE_URL || 'http://localhost:4000/api';
                const res = await fetch(`${base}/friends`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
                if (res.ok) {
                    const d = await res.json();
                    raw = d?.data?.friends || d?.data || d?.friends || [];
                }
            }
        } catch (_) {}
    }

    const friends = raw.map(f => ({
        id      : String(f.id || f.userId || f.friendId || ''),
        name    : f.displayName || f.name || [f.firstName, f.lastName].filter(Boolean).join(' ') || f.username || 'Unknown',
        username: f.username || '',
        avatar  : f.avatar || f.photoURL || null,
        online  : f.status === 'online' || f.isOnline === true,
    })).filter(f => f.id);

    list._friends = friends;
    list._loaded = true;
    _renderFriendsList(list, friends);
}

function _renderFriendsList(list, friends) {
    if (!list) return;
    if (!friends.length) {
        list.innerHTML = `
            <div style="text-align:center;padding:24px;color:var(--text-secondary)">
                <i class="fas fa-user-friends" style="font-size:28px;opacity:0.4"></i>
                <p style="margin:10px 0 4px;font-weight:500">No friends found</p>
                <p style="font-size:12px;opacity:0.7">Add friends first to invite them to groups</p>
            </div>`;
        return;
    }
    list.innerHTML = '';
    friends.forEach(f => {
        const div = document.createElement('div');
        div.dataset.friendId = f.id;
        div.dataset.searchName = (f.name + ' ' + f.username).toLowerCase();
        const sel = _selectedMembers.has(f.id);
        const initials = (f.name.match(/\b\w/g) || ['?']).slice(0,2).join('').toUpperCase();
        div.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:4px;transition:all .15s;background:${sel?'var(--primary-color,#667eea)1a':'transparent'};border:1.5px solid ${sel?'var(--primary-color,#667eea)':'transparent'};`;
        div.innerHTML = `
            <div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;overflow:hidden;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px;">
                ${f.avatar ? `<img src="${f.avatar}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : ''}
                <span ${f.avatar ? 'style="display:none"' : ''}>${initials}</span>
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:500;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
                <div style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:4px">
                    ${f.username ? `@${f.username} &middot; ` : ''}
                    <span style="width:7px;height:7px;border-radius:50%;display:inline-block;background:${f.online?'#4caf50':'#bdbdbd'}"></span>
                    ${f.online?'Online':'Offline'}
                </div>
            </div>
            <div class="_chk" style="width:22px;height:22px;border-radius:50%;border:2px solid ${sel?'var(--primary-color,#667eea)':'var(--border-color,#ccc)'};background:${sel?'var(--primary-color,#667eea)':'transparent'};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s">
                ${sel?'<i class="fas fa-check" style="color:#fff;font-size:11px"></i>':''}
            </div>`;
        div.addEventListener('click', () => _toggleMember(f, div));
        list.appendChild(div);
    });
}

function _toggleMember(f, el) {
    const nowSel = !_selectedMembers.has(f.id);
    if (nowSel) _selectedMembers.add(f.id); else _selectedMembers.delete(f.id);
    el.style.background = nowSel ? 'var(--primary-color,#667eea)1a' : 'transparent';
    el.style.borderColor = nowSel ? 'var(--primary-color,#667eea)' : 'transparent';
    const chk = el.querySelector('._chk');
    if (chk) {
        chk.style.background = nowSel ? 'var(--primary-color,#667eea)' : 'transparent';
        chk.style.borderColor = nowSel ? 'var(--primary-color,#667eea)' : 'var(--border-color,#ccc)';
        chk.innerHTML = nowSel ? '<i class="fas fa-check" style="color:#fff;font-size:11px"></i>' : '';
    }
    _renderChips();
    _updateTabBadge();
    // Keep window.__patchSelectedMembers in sync (createGroupOnline reads selectedFriends from core scope)
    window.__patchSelectedMembers = [..._selectedMembers];
}

function _filterFriendsList(q) {
    document.getElementById('friendsPickerList')?.querySelectorAll('[data-friend-id]').forEach(el => {
        el.style.display = (!q || el.dataset.searchName?.includes(q)) ? '' : 'none';
    });
}

function _renderChips() {
    const chips = document.getElementById('selectedMembersChips');
    if (!chips) return;
    chips.innerHTML = '';
    const friends = document.getElementById('friendsPickerList')?._friends || [];
    _selectedMembers.forEach(id => {
        const f = friends.find(fr => fr.id === id);
        if (!f) return;
        const chip = document.createElement('span');
        chip.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:var(--primary-color,#667eea)1a;border:1px solid var(--primary-color,#667eea)55;border-radius:20px;font-size:12px;color:var(--text-primary);`;
        chip.innerHTML = `${f.name} <i class="fas fa-times" style="cursor:pointer;opacity:0.6;font-size:10px"></i>`;
        chip.querySelector('i').addEventListener('click', () => {
            _selectedMembers.delete(id);
            const row = document.querySelector(`[data-friend-id="${id}"]`);
            if (row) {
                row.style.background = 'transparent'; row.style.borderColor = 'transparent';
                const chk = row.querySelector('._chk');
                if (chk) { chk.style.background = 'transparent'; chk.style.borderColor = 'var(--border-color,#ccc)'; chk.innerHTML = ''; }
            }
            _renderChips();
            _updateTabBadge();
            window.__patchSelectedMembers = [..._selectedMembers];
        });
        chips.appendChild(chip);
    });
}

function _updateTabBadge() {
    const tab = document.querySelector('.create-group-tab[data-tab="members"]');
    if (!tab) return;
    const count = _selectedMembers.size;
    let badge = tab.querySelector('._mbadge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = '_mbadge';
        badge.style.cssText = 'margin-left:5px;background:var(--primary-color,#667eea);color:#fff;border-radius:10px;padding:1px 6px;font-size:11px;font-weight:700;';
        tab.appendChild(badge);
    }
    badge.style.display = count ? '' : 'none';
    badge.textContent = count;
}

function _syncTabActive(clickedTab) {
    const modal = clickedTab.closest('#createGroupModal');
    if (!modal) return;
    modal.querySelectorAll('.create-group-tab').forEach(t => t.classList.remove('active'));
    clickedTab.classList.add('active');
    const target = clickedTab.dataset.tab;
    modal.querySelectorAll('.create-group-tab-content').forEach(c => c.classList.toggle('active', c.id === `${target}Tab`));
}

// =============================================================================
// SOCKET HANDLERS
// =============================================================================
function _setupSocketHandlers(GC) {
    const _wire = (socket) => {
        socket.on('group:localSync', async ({ action, group, groupId, member, userId }) => {
            try {
                if (action === 'create' || action === 'upsert' || action === 'update') {
                    if (group?.id) { await LocalGroupStore.saveGroupLocal({ ...group, syncState: 'synced', isLocalOnly: false }); GC.updateGroupInLists(group); GC.emit('group:updated', group); }
                } else if (action === 'delete') {
                    const gid = groupId || group?.id; if (!gid) return;
                    await LocalGroupStore.deleteGroupLocal(gid);
                    ['groups','myGroups','adminGroups','joinedGroups'].forEach(k => { if (Array.isArray(GC[k])) GC[k] = GC[k].filter(g => String(g.id) !== String(gid)); });
                    GC.saveGroups(); GC.emit('group:deleted', { groupId: gid });
                } else if (action === 'member_add') {
                    if (!member?.groupId || !member?.userId) return;
                    await LocalGroupStore.saveMemberLocal({ ...member, isLocalOnly: false });
                    const grp = GC.getGroupById(member.groupId);
                    if (grp) { if (!grp.members) grp.members = []; if (!grp.members.some(m => String(m.userId) === String(member.userId))) grp.members.push(member); GC.updateGroupInLists(grp); GC.saveGroups(); GC.emit('group:member-added', { groupId: member.groupId, member }); }
                } else if (action === 'member_remove') {
                    if (!groupId || !userId) return;
                    await LocalGroupStore.deleteMemberLocal(`${groupId}_${userId}`, groupId);
                    const grp = GC.getGroupById(groupId);
                    if (grp?.members) { grp.members = grp.members.filter(m => String(m.userId) !== String(userId)); GC.updateGroupInLists(grp); GC.saveGroups(); GC.emit('group:member-removed', { groupId, userId }); }
                } else if (action === 'member_role_update') {
                    if (!member?.groupId || !member?.userId) return;
                    await LocalGroupStore.saveMemberLocal({ ...member, isLocalOnly: false });
                    const grp = GC.getGroupById(member.groupId);
                    if (grp?.members) { const idx = grp.members.findIndex(m => String(m.userId) === String(member.userId)); if (idx !== -1) grp.members[idx] = { ...grp.members[idx], ...member }; GC.updateGroupInLists(grp); GC.saveGroups(); }
                } else if (action === 'member_leave') {
                    if (!groupId || !userId) return;
                    await LocalGroupStore.deleteMemberLocal(`${groupId}_${userId}`, groupId);
                    const grp = GC.getGroupById(groupId);
                    if (grp?.members) { grp.members = grp.members.filter(m => String(m.userId) !== String(userId)); GC.updateGroupInLists(grp); GC.saveGroups(); }
                } else if (action === 'ownership_transfer') {
                    GroupSyncEngine.triggerSync();
                }
            } catch (e) { console.warn('[patch] socket localSync error:', e); }
        });

        socket.on('group:invitation:received', (data) => {
            if (!GC.groupInvites) GC.groupInvites = [];
            GC.groupInvites.push(data);
            GC.saveGroups();
            GC.emit('group:invites-updated', GC.groupInvites);
        });

        console.log('[patch] Socket handlers wired');
    };

    const s = window.socket || window.__socket;
    if (s) { _wire(s); return; }
    const poll = setInterval(() => { const s2 = window.socket || window.__socket; if (s2) { clearInterval(poll); _wire(s2); } }, 500);
    setTimeout(() => clearInterval(poll), 15000);
}

// Cache friends from parent FRIENDS_LIST_UPDATE broadcast
window.addEventListener('message', (e) => {
    if (e.data?.type === 'FRIENDS_LIST_UPDATE') {
        const list = e.data?.payload?.friends || e.data?.friends || [];
        if (list.length) window.__friendsList = list;
    }
});

// =============================================================================
// HELPERS
// =============================================================================

function _applyLsBootstrap(GC) {
    if (GC.groups.length) return;
    const bs = LocalGroupStore.bootstrapFromLS();
    if (!bs) return;
    const seen = new Set();
    const dedup = arr => (arr||[]).filter(g => { if (!g?.id || seen.has(String(g.id))) return false; seen.add(String(g.id)); return true; });
    GC.groups       = dedup([...(bs.groups||[]),...(bs.myGroups||[]),...(bs.joinedGroups||[]),...(bs.adminGroups||[])]);
    GC.myGroups     = dedup(bs.myGroups || []);
    GC.joinedGroups = dedup(bs.joinedGroups || []);
    GC.adminGroups  = dedup(bs.adminGroups || []);
    if (bs.groupInvites) GC.groupInvites = bs.groupInvites;
    if (GC.groups.length) GC.emit('groups:loaded', { groups: GC.groups, source: 'localStorage' });
}

async function _remapGroupId(GC, tempId, serverGroup) {
    ['groups','myGroups','adminGroups','joinedGroups'].forEach(k => {
        if (!Array.isArray(GC[k])) return;
        const idx = GC[k].findIndex(g => String(g.id) === String(tempId));
        if (idx !== -1) GC[k][idx] = { ...GC[k][idx], ...serverGroup, id: serverGroup.id, serverId: serverGroup.id, isLocalOnly: false, syncState: 'synced' };
    });
    GC.saveGroups();
    await LocalGroupStore.deleteGroupLocal(tempId).catch(() => {});
    await LocalGroupStore.saveGroupLocal({ ...serverGroup, serverId: serverGroup.id, isLocalOnly: false, syncState: 'synced' });
}

async function _inviteMembers(groupId, memberIds, myUserId) {
    const token = _getToken();
    if (!token || !groupId) return;
    const base = window.__API_BASE_URL || window.API_BASE_URL || 'http://localhost:4000/api';
    for (const uid of memberIds) {
        if (String(uid) === String(myUserId)) continue;
        try {
            await fetch(`${base}/group-members/${groupId}/invitations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ inviteeId: uid, role: 'member' }),
            });
        } catch (_) {
            GroupQueueManager.enqueue(QUEUE_ACTIONS.ADD_MEMBER, groupId, uid, { role: 'member' }).catch(() => {});
        }
    }
}

async function _apiBridge(endpoint, method = 'GET', body = null) {
    try {
        if (typeof apiRequest === 'function') return await apiRequest(endpoint, method, body);
        if (window.__groupCoreApiRequest) return await window.__groupCoreApiRequest(endpoint, method, body);
        if (window.api?.request?.request) {
            const token = _getToken();
            const r = await window.api.request.request(method, endpoint, { data: body, token, headers: token ? { Authorization: `Bearer ${token}` } : {} });
            return { success: r?.ok !== false && r?.success !== false, data: r?.data ?? null, error: r?.error || null };
        }
        return await _rawFetch(endpoint, method, body);
    } catch (e) { return { success: false, error: e.message }; }
}

async function _rawFetch(endpoint, method = 'GET', body = null) {
    const base = window.__API_BASE_URL || window.API_BASE_URL || 'http://localhost:4000/api';
    const token = _getToken();
    const url = endpoint.startsWith('http') ? endpoint : `${base}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const opts = { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    return res.ok ? { success: true, data } : { success: false, error: data?.message || `HTTP ${res.status}` };
}

function _getToken() {
    return window.__AUTH_TOKEN || window.session?.token || window.__PARENT_SESSION__?.token || window.__SESSION__?.token
        || sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token')
        || localStorage.getItem('authToken') || localStorage.getItem('token') || null;
}

function _waitForActiveAndSync(GC) {
    let attempts = 0;
    const check = () => {
        attempts++;
        const active = (typeof LifecycleState !== 'undefined' && LifecycleState.getState?.() === 'ACTIVE') || GC.isActive?.() || window.__groupCoreActive;
        if (active) { GroupSyncEngine.setSessionReady(true); GroupSyncEngine.startBackgroundSync(); }
        else if (attempts < 30) setTimeout(check, 1000);
    };
    setTimeout(check, 2000);
    GC.on?.('groups:list-updated', () => {
        GroupSyncEngine.setSessionReady(true);
        if (!GroupSyncEngine._bgStarted) { GroupSyncEngine._bgStarted = true; GroupSyncEngine.startBackgroundSync(); }
    });
}

try { if (typeof apiRequest === 'function') window.__groupCoreApiRequest = apiRequest; } catch (_) {}

boot();

export { LocalGroupStore, GroupQueueManager, GroupSyncEngine };