const STORE_KEYS = Object.freeze({
    GROUPS: 'groups',
    MY_GROUPS: 'myGroups',
    JOINED_GROUPS: 'joinedGroups',
    ADMIN_GROUPS: 'adminGroups',
    GROUP_INVITES: 'groupInvites',
    PENDING_QUEUE: 'pendingGroupQueue',
    LAST_SYNC: 'lastGroupSync',
    MESSAGES_PREFIX: 'group_messages_',
    MEMBERS_PREFIX: 'group_members_'
});

function nowIso() {
    return new Date().toISOString();
}

function makeId(prefix = 'group') {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return `${prefix}_${window.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function currentUserId() {
    return window.__PARENT_SESSION__?.userId || window.AUTH_SESSION?.userId || window.KynectaStore?.get?.('user.id') || null;
}

function parseList(raw) {
    return Array.isArray(raw) ? raw : [];
}

const LocalGroupStore = {
    async init() {
        if (window.AppCache && typeof window.AppCache.initDB === 'function') {
            await window.AppCache.initDB();
        }
        console.log('[CACHE] Group local store ready');
        return this;
    },

    async ready() {
        return this.init();
    },

    async migrateFromSafeStorage(groupArrays) {
        const items = []
            .concat(groupArrays?.groups || [])
            .concat(groupArrays?.myGroups || [])
            .concat(groupArrays?.joinedGroups || [])
            .concat(groupArrays?.adminGroups || []);
        const seen = new Set();
        for (const item of items) {
            if (!item?.id || seen.has(item.id)) continue;
            seen.add(item.id);
            await this.saveGroupLocal(item);
        }
    },

    async saveGroupLocal(groupData) {
        if (!groupData) return false;
        const record = {
            ...groupData,
            id: String(groupData.id || groupData.groupId || groupData.serverId || makeId('group')),
            groupId: String(groupData.groupId || groupData.id || groupData.serverId || ''),
            userId: String(groupData.userId || currentUserId() || 'unknown'),
            serverId: groupData.serverId || null,
            createdAt: groupData.createdAt || nowIso(),
            updatedAt: nowIso(),
            syncState: groupData.syncState || 'synced',
            isLocalOnly: groupData.isLocalOnly === true
        };
        await window.AppCache.save('groups', record);
        console.log('[CACHE] Saved:', 'groups');
        return true;
    },

    async saveGroup(groupData) {
        return this.saveGroupLocal(groupData);
    },

    async getGroup(id) {
        return window.AppCache.get('groups', String(id));
    },

    async getAllGroups() {
        const all = await window.AppCache.getAll('groups');
        return all.filter((group) => group.status !== 'deleted');
    },

    async getMyGroups() {
        const all = await this.getAllGroups();
        const uid = String(currentUserId() || '');
        return all.filter((group) => String(group.createdBy || group.userId || '') === uid || group.isCreator === true);
    },

    async getJoinedGroups() {
        const all = await this.getAllGroups();
        const mine = new Set((await this.getMyGroups()).map((group) => String(group.id)));
        return all.filter((group) => !mine.has(String(group.id)));
    },

    async getAdminGroups() {
        const all = await this.getAllGroups();
        return all.filter((group) => group.isAdmin === true || group.role === 'admin' || group.role === 'owner');
    },

    async getPendingInvites() {
        const all = await this.getAllGroups();
        return all.filter((group) => group.invitePending === true || group.status === 'invited');
    },

    async getGroupsBySyncState(syncState) {
        const all = await this.getAllGroups();
        return all.filter((group) => group.syncState === syncState);
    },

    async markSyncState(groupId, syncState, extra = {}) {
        const existing = await this.getGroup(groupId);
        if (!existing) return false;
        await this.saveGroupLocal({ ...existing, syncState, ...extra });
        return true;
    },

    async deleteGroupLocal(groupId) {
        return window.AppCache.remove('groups', String(groupId));
    },

    async saveMemberLocal(memberData) {
        const group = await this.getGroup(memberData?.groupId);
        if (!group) return false;
        const members = parseList(group.members);
        const id = String(memberData.id || `${memberData.groupId}_${memberData.userId || makeId('member')}`);
        const record = {
            ...memberData,
            id,
            createdAt: memberData.createdAt || nowIso(),
            updatedAt: nowIso()
        };
        const next = members.filter((item) => String(item.id) !== id);
        next.push(record);
        await this.saveGroupLocal({ ...group, members: next });
        return true;
    },

    async getMembersForGroup(groupId) {
        const group = await this.getGroup(groupId);
        return parseList(group?.members);
    },

    async deleteMemberLocal(memberId, groupId) {
        const group = await this.getGroup(groupId);
        if (!group) return false;
        const next = parseList(group.members).filter((item) => String(item.id) !== String(memberId));
        await this.saveGroupLocal({ ...group, members: next });
        return true;
    },

    async saveMessageLocal(messageData) {
        const group = await this.getGroup(messageData?.groupId);
        if (!group) return false;
        const messages = parseList(group.messages);
        const id = String(messageData.id || messageData.serverId || makeId('groupmsg'));
        const record = {
            ...messageData,
            id,
            createdAt: messageData.createdAt || nowIso(),
            updatedAt: nowIso(),
            timestamp: messageData.timestamp || Date.now()
        };
        const next = messages.filter((item) => String(item.id) !== id);
        next.push(record);
        next.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
        await this.saveGroupLocal({ ...group, messages: next });
        return true;
    },

    async saveMessage(groupId, messageData) {
        return this.saveMessageLocal({ ...(messageData || {}), groupId });
    },

    async getMessagesForGroup(groupId) {
        const group = await this.getGroup(groupId);
        return parseList(group?.messages).sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    },

    async enqueueAction(action) {
        const record = {
            ...action,
            id: String(action?.queueId || action?.id || makeId('sync')),
            queueId: String(action?.queueId || action?.id || makeId('sync')),
            type: action?.type || 'group',
            action: action?.action || 'unknown',
            groupId: action?.groupId || null,
            userId: action?.userId || currentUserId(),
            status: action?.status || 'pending',
            createdAt: action?.createdAt || nowIso(),
            updatedAt: nowIso()
        };
        const saved = await window.AppCache.save('syncQueue', record);
        console.log('[CACHE] Saved:', 'syncQueue');
        return saved.queueId;
    },

    async dequeueAction(queueId) {
        return window.AppCache.remove('syncQueue', String(queueId));
    },

    async getPendingQueue() {
        const all = await window.AppCache.getAll('syncQueue');
        return all.filter((item) => item.type === 'group' || item.groupId);
    },

    async updateQueueItem(queueId, updates) {
        return window.AppCache.update('syncQueue', String(queueId), { ...(updates || {}), updatedAt: nowIso() });
    },

    async setLastSync(timestamp) {
        await window.AppCache.save('settings', {
            id: 'group_last_sync',
            key: 'group_last_sync',
            value: timestamp,
            data: timestamp,
            userId: currentUserId()
        });
        return true;
    },

    getLastSync() {
        return window.AppCache.get('settings', 'group_last_sync').then((record) => record?.value ?? null);
    },

    bootstrapFromLS() {
        const groups = window.KynectaStore?.get?.('groups.list') || [];
        const myGroups = window.KynectaStore?.get?.('groups.myGroups') || [];
        const joinedGroups = window.KynectaStore?.get?.('groups.joinedGroups') || [];
        const adminGroups = window.KynectaStore?.get?.('groups.adminGroups') || [];
        return { groups, myGroups, joinedGroups, adminGroups, groupInvites: [] };
    },

    async clearAll() {
        await window.AppCache.clear('groups');
        const queue = await window.AppCache.getAll('syncQueue');
        await Promise.all(queue
            .filter((item) => item.type === 'group' || item.groupId)
            .map((item) => window.AppCache.remove('syncQueue', item.id)));
        return true;
    },

    async getDiagnostics() {
        const groups = await this.getAllGroups();
        const queue = await this.getPendingQueue();
        const lastSync = await this.getLastSync();
        return {
            groupCount: groups.length,
            queueLength: queue.length,
            lastSync,
            dbReady: true,
            usingIndexedDB: true
        };
    }
};

LocalGroupStore.init().catch((error) => console.error('[CACHE] Group store init error', error));

if (typeof window !== 'undefined') {
    window.LocalGroupStore = LocalGroupStore;
}

export default LocalGroupStore;
export { LocalGroupStore, STORE_KEYS };
