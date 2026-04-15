// ============================================================
// localStore.groups.js
// LOCAL-FIRST GROUP STORAGE — IndexedDB primary, localStorage fallback
// Satisfies: saveGroupLocal() → UI loads from cache → offline works → refresh-safe
// ============================================================

const LOCAL_STORE_VERSION = 1;
const DB_NAME   = 'knecta_groups_db';
const DB_VER    = 1;

// ── Storage key constants (mirror SafeStorage keys so they stay in sync) ────
const STORE_KEYS = Object.freeze({
    GROUPS           : 'groups',
    MY_GROUPS        : 'myGroups',
    JOINED_GROUPS    : 'joinedGroups',
    ADMIN_GROUPS     : 'adminGroups',
    GROUP_INVITES    : 'groupInvites',
    PENDING_QUEUE    : 'pendingGroupQueue',
    LAST_SYNC        : 'lastGroupSync',
    MESSAGES_PREFIX  : 'group_messages_',
    UNREAD_PREFIX    : 'group_unread_',
    META_PREFIX      : 'group_meta_',
    MEMBERS_PREFIX   : 'group_members_',
});

// ── IndexedDB setup ─────────────────────────────────────────────────────────
let _db = null;
let _dbReady = false;
const _dbReadyCallbacks = [];

function _openDB() {
    return new Promise((resolve, reject) => {
        if (_db) { resolve(_db); return; }

        if (!window.indexedDB) {
            // No IndexedDB → fall back gracefully to localStorage only
            _db = null;
            _dbReady = true;
            resolve(null);
            return;
        }

        const req = window.indexedDB.open(DB_NAME, DB_VER);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;

            // Main KV store
            if (!db.objectStoreNames.contains('kv')) {
                db.createObjectStore('kv', { keyPath: 'k' });
            }
            // Groups dedicated store with indices
            if (!db.objectStoreNames.contains('groups')) {
                const gs = db.createObjectStore('groups', { keyPath: 'id' });
                gs.createIndex('serverId', 'serverId', { unique: false });
                gs.createIndex('status',   'status',   { unique: false });
                gs.createIndex('syncState','syncState',{ unique: false });
            }
            // Members store
            if (!db.objectStoreNames.contains('members')) {
                const ms = db.createObjectStore('members', { keyPath: 'id' });
                ms.createIndex('groupId', 'groupId', { unique: false });
                ms.createIndex('userId',  'userId',  { unique: false });
            }
            // Messages store
            if (!db.objectStoreNames.contains('messages')) {
                const msgs = db.createObjectStore('messages', { keyPath: 'id' });
                msgs.createIndex('groupId',   'groupId',   { unique: false });
                msgs.createIndex('timestamp', 'timestamp', { unique: false });
            }
            // Offline action queue
            if (!db.objectStoreNames.contains('queue')) {
                const q = db.createObjectStore('queue', { keyPath: 'queueId' });
                q.createIndex('action',      'action',      { unique: false });
                q.createIndex('retryCount',  'retryCount',  { unique: false });
            }
        };

        req.onsuccess = (e) => {
            _db = e.target.result;
            _dbReady = true;
            _dbReadyCallbacks.forEach(cb => cb(_db));
            _dbReadyCallbacks.length = 0;
            resolve(_db);
        };

        req.onerror = () => {
            console.warn('[localStore] IndexedDB open failed, using localStorage fallback');
            _dbReady = true;
            _dbReadyCallbacks.forEach(cb => cb(null));
            _dbReadyCallbacks.length = 0;
            resolve(null); // graceful degradation
        };
    });
}

function _whenDBReady() {
    if (_dbReady) return Promise.resolve(_db);
    return new Promise(resolve => _dbReadyCallbacks.push(resolve));
}

// ── Low-level IDB helpers ─────────────────────────────────────────────────
function _idbPut(storeName, value) {
    return new Promise((resolve, reject) => {
        if (!_db) { resolve(false); return; }
        try {
            const tx = _db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(value);
            tx.oncomplete = () => resolve(true);
            tx.onerror    = (e) => { console.warn('[localStore] idbPut error', e); resolve(false); };
        } catch (e) { resolve(false); }
    });
}

function _idbGet(storeName, key) {
    return new Promise((resolve) => {
        if (!_db) { resolve(null); return; }
        try {
            const tx = _db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror   = () => resolve(null);
        } catch (e) { resolve(null); }
    });
}

function _idbGetAll(storeName, indexName, value) {
    return new Promise((resolve) => {
        if (!_db) { resolve([]); return; }
        try {
            const tx = _db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = indexName
                ? store.index(indexName).getAll(value)
                : store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror   = () => resolve([]);
        } catch (e) { resolve([]); }
    });
}

function _idbDelete(storeName, key) {
    return new Promise((resolve) => {
        if (!_db) { resolve(false); return; }
        try {
            const tx = _db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).delete(key);
            tx.oncomplete = () => resolve(true);
            tx.onerror    = () => resolve(false);
        } catch (e) { resolve(false); }
    });
}

// ── localStorage KV helpers (fallback + fast bootstrap) ──────────────────
const LS_PREFIX = 'knecta_lsg_';

function _lsSet(key, value) {
    try {
        localStorage.setItem(LS_PREFIX + key, JSON.stringify({ v: value, t: Date.now() }));
        return true;
    } catch (e) { return false; }
}

function _lsGet(key) {
    try {
        const raw = localStorage.getItem(LS_PREFIX + key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.v ?? null;
    } catch (e) { return null; }
}

function _lsDel(key) {
    try { localStorage.removeItem(LS_PREFIX + key); return true; }
    catch (e) { return false; }
}

// ────────────────────────────────────────────────────────────────────────────
//  PUBLIC API
// ────────────────────────────────────────────────────────────────────────────
const LocalGroupStore = {

    // ── Initialise (call once at module boot) ─────────────────────────────
    async init() {
        await _openDB();
        console.log('[localStore] ✅ Initialised', _db ? '(IndexedDB)' : '(localStorage fallback)');
        return this;
    },

    // ── Sync state from SafeStorage KV into IDB groups store ─────────────
    // Called once after SafeStorage loads its in-memory map, so IDB reflects it.
    async migrateFromSafeStorage(groupArrays) {
        const { groups = [], myGroups = [], joinedGroups = [], adminGroups = [] } = groupArrays;
        const seen = new Set();
        const all  = [...groups, ...myGroups, ...joinedGroups, ...adminGroups];

        for (const g of all) {
            if (!g?.id || seen.has(g.id)) continue;
            seen.add(g.id);
            await this.saveGroupLocal(g);
        }
    },

    // ─────────────────────────────────────────────────────────────────────
    //  saveGroupLocal(groupData)
    //  THE PRIMARY ENTRY POINT.  Everything the spec requires happens here:
    //    ✔ localStorage/IndexedDB has data
    //    ✔ UI loads from local first
    //    ✔ app works offline
    //    ✔ refresh does not delete group
    // ─────────────────────────────────────────────────────────────────────
    async saveGroupLocal(groupData) {
        if (!groupData?.id) {
            console.warn('[localStore] saveGroupLocal: missing id', groupData);
            return false;
        }

        const record = {
            // Mandatory fields from spec data model
            id          : groupData.id,
            serverId    : groupData.serverId    ?? groupData.id ?? null,
            name        : groupData.name        ?? '',
            description : groupData.description ?? '',
            createdBy   : groupData.createdBy   ?? null,
            createdAt   : groupData.createdAt   ?? new Date().toISOString(),
            updatedAt   : groupData.updatedAt   ?? new Date().toISOString(),
            status      : groupData.status      ?? 'active',
            isLocalOnly : groupData.isLocalOnly ?? false,
            syncState   : groupData.syncState   ?? 'synced', // 'synced'|'pending'|'failed'
            // Extra fields preserved verbatim
            ...groupData,
        };

        // ① IndexedDB (durable, survives refresh)
        await _whenDBReady();
        await _idbPut('groups', record);

        // ② localStorage (fast bootstrap on next load)
        _lsSet(`group_${record.id}`, record);

        // ③ Keep the group-lists LS keys in sync so SafeStorage picks them up
        this._updateGroupListCache(record);

        return true;
    },

    // Update the aggregated list caches in localStorage
    _updateGroupListCache(group) {
        const lists = {
            groups      : _lsGet('all_groups')   || [],
            myGroups    : _lsGet('my_groups')    || [],
            joinedGroups: _lsGet('joined_groups')|| [],
            adminGroups : _lsGet('admin_groups') || [],
        };

        // Upsert into 'groups' (the master list)
        const idx = lists.groups.findIndex(g => g.id === group.id);
        if (idx !== -1) lists.groups[idx] = group;
        else lists.groups.push(group);

        // Upsert into correct sub-list
        if (group.isCreator || group.createdBy === group._currentUserId) {
            _upsert(lists.myGroups,   group);
            _upsert(lists.adminGroups,group);
        } else if (group.isAdmin) {
            _upsert(lists.adminGroups,group);
            _upsert(lists.joinedGroups,group);
        } else {
            _upsert(lists.joinedGroups,group);
        }

        _lsSet('all_groups',    lists.groups);
        _lsSet('my_groups',     lists.myGroups);
        _lsSet('joined_groups', lists.joinedGroups);
        _lsSet('admin_groups',  lists.adminGroups);

        // Also write to SafeStorage-compatible keys so loadCachedDataInstantly works
        try {
            localStorage.setItem('knecta_groups_groups',       JSON.stringify(lists.groups));
            localStorage.setItem('knecta_groups_myGroups',     JSON.stringify(lists.myGroups));
            localStorage.setItem('knecta_groups_joinedGroups', JSON.stringify(lists.joinedGroups));
            localStorage.setItem('knecta_groups_adminGroups',  JSON.stringify(lists.adminGroups));
        } catch(e) {}
    },

    // ── Get single group ──────────────────────────────────────────────────
    async getGroup(id) {
        await _whenDBReady();
        // IDB first
        const fromIDB = await _idbGet('groups', id);
        if (fromIDB) return fromIDB;
        // LS fallback
        return _lsGet(`group_${id}`);
    },

    // ── Get all groups ────────────────────────────────────────────────────
    async getAllGroups() {
        await _whenDBReady();
        if (_db) {
            const all = await _idbGetAll('groups');
            return all.filter(g => g.status !== 'deleted');
        }
        // LS fallback
        return _lsGet('all_groups') || [];
    },

    // ── Get groups by syncState ───────────────────────────────────────────
    async getGroupsBySyncState(syncState) {
        await _whenDBReady();
        if (_db) return _idbGetAll('groups', 'syncState', syncState);
        const all = _lsGet('all_groups') || [];
        return all.filter(g => g.syncState === syncState);
    },

    // ── Mark group sync state ─────────────────────────────────────────────
    async markSyncState(groupId, syncState, extra = {}) {
        const existing = await this.getGroup(groupId);
        if (!existing) return false;
        return this.saveGroupLocal({ ...existing, syncState, ...extra });
    },

    // ── Delete group locally ──────────────────────────────────────────────
    async deleteGroupLocal(groupId) {
        await _whenDBReady();
        await _idbDelete('groups', groupId);
        _lsDel(`group_${groupId}`);

        // Remove from list caches
        ['all_groups','my_groups','joined_groups','admin_groups'].forEach(k => {
            const arr = _lsGet(k) || [];
            _lsSet(k, arr.filter(g => g.id !== groupId));
        });
        // SafeStorage-compatible keys
        ['groups','myGroups','joinedGroups','adminGroups'].forEach(k => {
            try {
                const raw = localStorage.getItem(`knecta_groups_${k}`);
                if (!raw) return;
                const arr = JSON.parse(raw) || [];
                localStorage.setItem(`knecta_groups_${k}`, JSON.stringify(arr.filter(g => g.id !== groupId)));
            } catch(e) {}
        });
        return true;
    },

    // ── Members ───────────────────────────────────────────────────────────
    async saveMemberLocal(memberData) {
        if (!memberData?.id || !memberData?.groupId) return false;
        const record = {
            id        : memberData.id,
            groupId   : memberData.groupId,
            userId    : memberData.userId,
            role      : memberData.role   ?? 'member',
            status    : memberData.status ?? 'active',
            joinedAt  : memberData.joinedAt ?? new Date().toISOString(),
            isLocalOnly: memberData.isLocalOnly ?? false,
            ...memberData,
        };
        await _whenDBReady();
        await _idbPut('members', record);
        // LS fallback
        const key = `members_${record.groupId}`;
        const list = _lsGet(key) || [];
        const idx  = list.findIndex(m => m.id === record.id);
        if (idx !== -1) list[idx] = record; else list.push(record);
        _lsSet(key, list);
        return true;
    },

    async getMembersForGroup(groupId) {
        await _whenDBReady();
        if (_db) return _idbGetAll('members', 'groupId', groupId);
        return _lsGet(`members_${groupId}`) || [];
    },

    async deleteMemberLocal(memberId, groupId) {
        await _whenDBReady();
        await _idbDelete('members', memberId);
        if (groupId) {
            const key  = `members_${groupId}`;
            const list = _lsGet(key) || [];
            _lsSet(key, list.filter(m => m.id !== memberId));
        }
        return true;
    },

    // ── Messages ──────────────────────────────────────────────────────────
    async saveMessageLocal(messageData) {
        if (!messageData?.id || !messageData?.groupId) return false;
        const record = { timestamp: Date.now(), ...messageData };
        await _whenDBReady();
        await _idbPut('messages', record);
        // LS fallback (keep last 100)
        const key  = `msgs_${record.groupId}`;
        const list = _lsGet(key) || [];
        const idx  = list.findIndex(m => m.id === record.id);
        if (idx !== -1) list[idx] = record; else list.push(record);
        list.sort((a,b) => a.timestamp - b.timestamp);
        _lsSet(key, list.slice(-100));
        // SafeStorage-compatible
        try { localStorage.setItem(`knecta_groups_group_messages_${record.groupId}`, JSON.stringify(list.slice(-100))); } catch(e) {}
        return true;
    },

    async getMessagesForGroup(groupId) {
        await _whenDBReady();
        if (_db) {
            const all = await _idbGetAll('messages', 'groupId', groupId);
            return all.sort((a,b) => a.timestamp - b.timestamp);
        }
        return _lsGet(`msgs_${groupId}`) || [];
    },

    // ── Offline action queue ──────────────────────────────────────────────
    async enqueueAction(action) {
        const record = {
            queueId    : action.queueId     || `q_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
            action     : action.action,     // 'create_group'|'add_member'|'remove_member'|'update_role'
            groupId    : action.groupId    ?? null,
            userId     : action.userId     ?? null,
            payload    : action.payload    ?? {},
            retryCount : action.retryCount ?? 0,
            lastAttempt: action.lastAttempt ?? null,
            createdAt  : action.createdAt  ?? new Date().toISOString(),
        };
        await _whenDBReady();
        await _idbPut('queue', record);
        // LS fallback
        const q = _lsGet('pending_queue') || [];
        const ei = q.findIndex(i => i.queueId === record.queueId);
        if (ei !== -1) q[ei] = record; else q.push(record);
        _lsSet('pending_queue', q);
        return record.queueId;
    },

    async dequeueAction(queueId) {
        await _whenDBReady();
        await _idbDelete('queue', queueId);
        const q = _lsGet('pending_queue') || [];
        _lsSet('pending_queue', q.filter(i => i.queueId !== queueId));
        return true;
    },

    async getPendingQueue() {
        await _whenDBReady();
        if (_db) return _idbGetAll('queue');
        return _lsGet('pending_queue') || [];
    },

    async updateQueueItem(queueId, updates) {
        const q = _lsGet('pending_queue') || [];
        const idx = q.findIndex(i => i.queueId === queueId);
        if (idx !== -1) {
            q[idx] = { ...q[idx], ...updates };
            _lsSet('pending_queue', q);
        }
        // IDB
        if (_db) {
            const existing = await _idbGet('queue', queueId);
            if (existing) await _idbPut('queue', { ...existing, ...updates });
        }
        return true;
    },

    // ── Sync metadata ─────────────────────────────────────────────────────
    async setLastSync(timestamp) {
        _lsSet('last_sync', timestamp);
        try { localStorage.setItem('knecta_groups_lastSync', String(timestamp)); } catch(e) {}
    },

    getLastSync() {
        return _lsGet('last_sync') || null;
    },

    // ── FAST BOOTSTRAP (synchronous) ──────────────────────────────────────
    // Called BEFORE IDB is ready, returns whatever is in localStorage right now.
    // This is what makes UI load instantly on first paint.
    bootstrapFromLS() {
        const bootstrap = {
            groups      : [],
            myGroups    : [],
            joinedGroups: [],
            adminGroups : [],
            groupInvites: [],
        };
        try {
            // Try SafeStorage-compatible keys first (most up-to-date)
            const keys = { groups:'groups', myGroups:'myGroups', joinedGroups:'joinedGroups', adminGroups:'adminGroups' };
            for (const [prop, k] of Object.entries(keys)) {
                const raw = localStorage.getItem(`knecta_groups_${k}`);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) { bootstrap[prop] = parsed; continue; }
                }
                // Fallback to our own LS prefix
                const our = _lsGet(k === 'groups' ? 'all_groups'
                                  : k === 'myGroups' ? 'my_groups'
                                  : k === 'joinedGroups' ? 'joined_groups'
                                  : 'admin_groups');
                if (our) bootstrap[prop] = our;
            }
            const invRaw = localStorage.getItem('knecta_groups_groupInvites');
            if (invRaw) { const p = JSON.parse(invRaw); if (Array.isArray(p)) bootstrap.groupInvites = p; }
        } catch(e) {}
        return bootstrap;
    },

    // ── Utility ───────────────────────────────────────────────────────────
    async clearAll() {
        await _whenDBReady();
        if (_db) {
            ['groups','members','messages','queue'].forEach(s => {
                try {
                    const tx = _db.transaction(s, 'readwrite');
                    tx.objectStore(s).clear();
                } catch(e) {}
            });
        }
        // Clear LS
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith(LS_PREFIX) || k.startsWith('knecta_groups_')) {
                try { localStorage.removeItem(k); } catch(e) {}
            }
        });
        console.log('[localStore] 🗑️ All local group data cleared');
    },

    async getDiagnostics() {
        const q = await this.getPendingQueue();
        const g = await this.getAllGroups();
        return {
            groupCount   : g.length,
            queueLength  : q.length,
            lastSync     : this.getLastSync(),
            dbReady      : _dbReady,
            usingIndexedDB: !!_db,
        };
    }
};

// ── helper ───────────────────────────────────────────────────────────────────
function _upsert(arr, item) {
    const idx = arr.findIndex(i => i.id === item.id);
    if (idx !== -1) arr[idx] = item; else arr.push(item);
}

// ── Auto-init ─────────────────────────────────────────────────────────────
LocalGroupStore.init().catch(e => console.error('[localStore] init error', e));

// ── Expose globally ───────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.LocalGroupStore = LocalGroupStore;
}

export default LocalGroupStore;
export { LocalGroupStore, STORE_KEYS };