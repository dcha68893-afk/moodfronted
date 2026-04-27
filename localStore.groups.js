/**
 * localStore-groups.js  (Offline-First Edition v2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Group local storage built on the shared AppCache (app.cache.js).
 *
 * Standard interface:
 *   getAll()           — all non-deleted groups
 *   getById(id)        — single group
 *   save(data)         — upsert group (alias: saveGroup / saveGroupLocal)
 *   update(id, patch)  — partial update
 *   delete(id)         — soft-delete (marks status = 'deleted')
 *   hardDelete(id)     — physical removal from store
 *
 * Additional helpers:
 *   getMyGroups()                       groups created by current user
 *   getJoinedGroups()                   joined but not created by current user
 *   getAdminGroups()                    groups where user is admin/owner
 *   getPendingInvites()                 groups with pending invite
 *   getGroupsBySyncState(state)         filter by syncState field
 *   markSyncState(groupId, state, extra)
 *   saveMemberLocal(memberData)         embed member in group.members array
 *   getMembersForGroup(groupId)
 *   deleteMemberLocal(memberId, groupId)
 *   saveMessageLocal(messageData)       embed message in group.messages array
 *   saveMessage(groupId, messageData)   alias
 *   getMessagesForGroup(groupId)
 *   enqueueAction(action)               add to syncQueue
 *   dequeueAction(queueId)
 *   getPendingQueue()                   pending group sync actions
 *   updateQueueItem(queueId, updates)
 *   setLastSync(ts) / getLastSync()
 *   clearAll()
 *   getDiagnostics()
 *   migrateFromSafeStorage(arrays)      one-time migration helper
 *
 * @version 2.0.0
 */
(function () {
  'use strict';

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function nowIso() { return new Date().toISOString(); }

  function makeId(prefix) {
    prefix = prefix || 'group';
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return prefix + '_' + window.crypto.randomUUID();
    }
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function currentUserId() {
    return (
      (window.__PARENT_SESSION__ && window.__PARENT_SESSION__.userId) ||
      (window.AUTH_SESSION       && window.AUTH_SESSION.userId)       ||
      (window.KynectaStore       && typeof window.KynectaStore.get === 'function' && window.KynectaStore.get('user.id')) ||
      null
    );
  }

  function parseList(raw) { return Array.isArray(raw) ? raw : []; }

  /* ── Wait for AppCache ───────────────────────────────────────────────────── */
  function getCache() {
    if (window.AppCache) return Promise.resolve(window.AppCache);
    return new Promise((resolve, reject) => {
      let tries = 0;
      const timer = setInterval(() => {
        tries++;
        if (window.AppCache) { clearInterval(timer); resolve(window.AppCache); return; }
        if (tries >= 100) { clearInterval(timer); reject(new Error('[GroupLocalStore] AppCache unavailable')); }
      }, 50);
    });
  }

  /* ── Record normaliser ───────────────────────────────────────────────────── */
  function normaliseGroup(data) {
    const g = data || {};
    return {
      ...g,
      id:         String(g.id || g.groupId || g.serverId || makeId('group')),
      groupId:    String(g.groupId || g.id || g.serverId || ''),
      userId:     String(g.userId || currentUserId() || 'unknown'),
      serverId:   g.serverId || null,
      status:     g.status   || 'active',
      createdAt:  g.createdAt || nowIso(),
      updatedAt:  nowIso(),
      syncState:  g.syncState || 'synced',
      isLocalOnly:g.isLocalOnly === true,
      members:    parseList(g.members),
      messages:   parseList(g.messages)
    };
  }

  /* ── Public API ──────────────────────────────────────────────────────────── */
  const LocalGroupStore = {

    /* ── Lifecycle ───────────────────────────────────────────────────────── */
    async init() {
      const cache = await getCache();
      await cache.initDB();
      
      return this;
    },

    async ready() { return this.init(); },

    /* ── Standard interface ──────────────────────────────────────────────── */

    /** All non-deleted groups. */
    async getAll() {
      const cache = await getCache();
      const all = await cache.getAll('groups');
      return all.filter(g => g.status !== 'deleted');
    },

    /** Single group by local id. */
    async getById(id) {
      const cache = await getCache();
      return cache.get('groups', String(id));
    },

    /** Upsert a group record. */
    async save(data) {
      if (!data) return false;
      const cache  = await getCache();
      const record = normaliseGroup(data);
      await cache.save('groups', record);
      return true;
    },

    /** Partial update on a group. */
    async update(id, patch) {
      const cache    = await getCache();
      const existing = await cache.get('groups', String(id));
      if (!existing) return null;
      const updated = normaliseGroup({ ...existing, ...patch, id: existing.id });
      return cache.save('groups', updated);
    },

    /** Soft-delete (marks status = 'deleted'). */
    async delete(id) {
      return this.update(id, { status: 'deleted', syncState: 'pending_delete' });
    },

    /** Physical removal from store. */
    async hardDelete(id) {
      const cache = await getCache();
      return cache.remove('groups', String(id));
    },

    /* ── Aliases used by existing code ──────────────────────────────────── */
    async saveGroup(data)      { return this.save(data); },
    async saveGroupLocal(data) { return this.save(data); },
    async getGroup(id)         { return this.getById(id); },
    async getAllGroups()        { return this.getAll(); },
    async deleteGroupLocal(id) { return this.hardDelete(id); },

    /* ── Filtered views ──────────────────────────────────────────────────── */

    async getMyGroups() {
      const all = await this.getAll();
      const uid = String(currentUserId() || '');
      return all.filter(g =>
        String(g.createdBy || g.userId || '') === uid || g.isCreator === true
      );
    },

    async getJoinedGroups() {
      const all  = await this.getAll();
      const mine = new Set((await this.getMyGroups()).map(g => String(g.id)));
      return all.filter(g => !mine.has(String(g.id)));
    },

    async getAdminGroups() {
      const all = await this.getAll();
      return all.filter(g => g.isAdmin === true || g.role === 'admin' || g.role === 'owner');
    },

    async getPendingInvites() {
      const all = await this.getAll();
      return all.filter(g => g.invitePending === true || g.status === 'invited');
    },

    async getGroupsBySyncState(syncState) {
      const all = await this.getAll();
      return all.filter(g => g.syncState === syncState);
    },

    async markSyncState(groupId, syncState, extra) {
      const existing = await this.getById(groupId);
      if (!existing) return false;
      await this.save({ ...existing, syncState, ...(extra || {}) });
      return true;
    },

    /* ── Members (stored inline in group.members array) ─────────────────── */

    async saveMemberLocal(memberData) {
      const group = await this.getById(memberData && memberData.groupId);
      if (!group) return false;
      const members = parseList(group.members);
      const id = String(memberData.id || (memberData.groupId + '_' + (memberData.userId || makeId('member'))));
      const record = { ...memberData, id, createdAt: memberData.createdAt || nowIso(), updatedAt: nowIso() };
      const next = members.filter(m => String(m.id) !== id);
      next.push(record);
      await this.save({ ...group, members: next });
      return true;
    },

    async getMembersForGroup(groupId) {
      const group = await this.getById(groupId);
      return parseList(group && group.members);
    },

    async deleteMemberLocal(memberId, groupId) {
      const group = await this.getById(groupId);
      if (!group) return false;
      const next = parseList(group.members).filter(m => String(m.id) !== String(memberId));
      await this.save({ ...group, members: next });
      return true;
    },

    /* ── Messages (stored inline in group.messages array) ───────────────── */

    async saveMessageLocal(messageData) {
      const group = await this.getById(messageData && messageData.groupId);
      if (!group) return false;
      const messages = parseList(group.messages);
      const id = String(messageData.id || messageData.serverId || makeId('groupmsg'));
      const record = {
        ...messageData, id,
        createdAt: messageData.createdAt || nowIso(),
        updatedAt: nowIso(),
        timestamp: messageData.timestamp || Date.now()
      };
      const next = messages.filter(m => String(m.id) !== id);
      next.push(record);
      next.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
      await this.save({ ...group, messages: next });
      return true;
    },

    async saveMessage(groupId, messageData) {
      return this.saveMessageLocal({ ...(messageData || {}), groupId });
    },

    async getMessagesForGroup(groupId) {
      const group = await this.getById(groupId);
      return parseList(group && group.messages)
        .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    },

    /* ── Offline action queue ────────────────────────────────────────────── */

    async enqueueAction(action) {
      const cache = await getCache();
      const record = {
        ...action,
        id:       String((action && action.queueId) || (action && action.id) || makeId('sync')),
        queueId:  String((action && action.queueId) || (action && action.id) || makeId('sync')),
        type:     (action && action.type)   || 'group',
        action:   (action && action.action) || 'unknown',
        groupId:  (action && action.groupId)|| null,
        userId:   (action && action.userId) || currentUserId(),
        status:   (action && action.status) || 'pending',
        createdAt:(action && action.createdAt) || nowIso(),
        updatedAt: nowIso()
      };
      const saved = await cache.save('syncQueue', record);
      return saved.queueId;
    },

    async dequeueAction(queueId) {
      const cache = await getCache();
      return cache.remove('syncQueue', String(queueId));
    },

    async getPendingQueue() {
      const cache = await getCache();
      const all = await cache.getAll('syncQueue');
      return all.filter(item => item.type === 'group' || item.groupId);
    },

    async updateQueueItem(queueId, updates) {
      const cache = await getCache();
      return cache.update('syncQueue', String(queueId), { ...(updates || {}), updatedAt: nowIso() });
    },

    /* ── Last-sync timestamp ─────────────────────────────────────────────── */

    async setLastSync(timestamp) {
      const cache = await getCache();
      await cache.save('settings', {
        id: 'group_last_sync', key: 'group_last_sync',
        value: timestamp, data: timestamp, userId: currentUserId()
      });
      return true;
    },

    async getLastSync() {
      const cache  = await getCache();
      const record = await cache.get('settings', 'group_last_sync');
      return (record && record.value) != null ? record.value : null;
    },

    /* ── Migration helper ────────────────────────────────────────────────── */

    async migrateFromSafeStorage(groupArrays) {
      const items = []
        .concat((groupArrays && groupArrays.groups)       || [])
        .concat((groupArrays && groupArrays.myGroups)     || [])
        .concat((groupArrays && groupArrays.joinedGroups) || [])
        .concat((groupArrays && groupArrays.adminGroups)  || []);
      const seen = new Set();
      for (const item of items) {
        if (!item || !item.id || seen.has(item.id)) continue;
        seen.add(item.id);
        await this.save(item);
      }
    },

    /** Read legacy KynectaStore data (non-destructive bootstrap helper). */
    bootstrapFromLS() {
      const store = window.KynectaStore;
      const get   = store && typeof store.get === 'function' ? store.get.bind(store) : () => [];
      return {
        groups:       get('groups.list')       || [],
        myGroups:     get('groups.myGroups')   || [],
        joinedGroups: get('groups.joinedGroups')|| [],
        adminGroups:  get('groups.adminGroups') || [],
        groupInvites: []
      };
    },

    /* ── Merge from server (preserves local-only records) ───────────────── */

    async mergeFromServer(serverRecords) {
      if (!Array.isArray(serverRecords)) return;
      if (window.CacheUnified && typeof window.CacheUnified.mergeFromServer === 'function') {
        return window.CacheUnified.mergeFromServer('groups', serverRecords);
      }
      // Fallback
      const toSave = serverRecords.map(r => normaliseGroup({ ...r, isLocalOnly: false }));
      const cache  = await getCache();
      return cache.save('groups', toSave);
    },

    /* ── Clear all ───────────────────────────────────────────────────────── */

    async clearAll() {
      const cache = await getCache();
      await cache.clear('groups');
      const queue = await cache.getAll('syncQueue');
      await Promise.all(
        queue
          .filter(item => item.type === 'group' || item.groupId)
          .map(item => cache.remove('syncQueue', item.id))
      );
      return true;
    },

    /* ── Diagnostics ─────────────────────────────────────────────────────── */

    async getDiagnostics() {
      const groups   = await this.getAll();
      const queue    = await this.getPendingQueue();
      const lastSync = await this.getLastSync();
      return {
        groupCount:  groups.length,
        queueLength: queue.length,
        lastSync,
        dbReady:       true,
        usingIndexedDB: !!(window.AppCache && window.AppCache._db)
      };
    }
  };

  /* ── Bootstrap immediately ───────────────────────────────────────────────── */
  LocalGroupStore.init().catch(function (err) {
    console.error('[CACHE] Group store init error', err);
  });

  /* ── Expose globally — NO ES module export (script tag compatibility) ────── */
  window.LocalGroupStore = LocalGroupStore;

  

})();