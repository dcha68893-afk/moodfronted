/**
 * app.cache.unified.js — Single Source of Truth Cache Layer
 *
 * Account-scoped cache boundary. This file runs after app.cache.js and keeps
 * the existing cache API while ensuring user-owned records are isolated by
 * the active account. No new cache database or patch file is introduced.
 */
(function () {
  'use strict';

  if (window.__CacheUnifiedLoaded__) return;
  window.__CacheUnifiedLoaded__ = true;

  function onAppCacheReady(callback) {
    if (window.AppCache) { callback(window.AppCache); return; }
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (window.AppCache) { clearInterval(timer); callback(window.AppCache); return; }
      if (tries >= 50) {
        clearInterval(timer);
        console.error('[CacheUnified] AppCache never appeared — offline features degraded');
      }
    }, 50);
  }

  onAppCacheReady(function (base) {
    window.AppCache = base;
    window.KynectaCache = base;

    const ACCOUNT_SCOPED_COLLECTIONS = new Set([
      'users', 'friends', 'messages', 'chats', 'groups', 'calls',
      'status', 'settings', 'syncQueue'
    ]);

    const rawGetAll = base.getAll.bind(base);
    const rawGet = base.get.bind(base);
    const rawSave = base.save.bind(base);
    const rawRemove = base.remove.bind(base);
    const rawUpdate = base.update.bind(base);
    const rawClear = base.clear.bind(base);
    const rawGetModuleSnapshot = base.getModuleSnapshot.bind(base);
    const rawSetModuleSnapshot = base.setModuleSnapshot.bind(base);
    const rawGetSettings = base.getSettings.bind(base);
    const rawSetSettings = base.setSettings.bind(base);
    const rawEnqueueSync = base.enqueueSync.bind(base);
    const rawGetPendingSyncQueue = base.getPendingSyncQueue.bind(base);

    function activeAccountId() {
      try {
        const user = window.currentUser || window.AuthStorage?.getUser?.();
        const id = user?.id ?? user?.userId ?? user?.uid ?? user?._id;
        if (id !== undefined && id !== null && String(id) !== '') return String(id);
      } catch (_) {}
      try {
        const auth = JSON.parse(localStorage.getItem('kynecta_auth') || 'null');
        const id = auth?.user?.id ?? auth?.user?.userId ?? auth?.user?.uid ?? auth?.user?._id;
        if (id !== undefined && id !== null && String(id) !== '') return String(id);
      } catch (_) {}
      return null;
    }

    function scopedId(accountId, id) {
      const raw = String(id ?? '');
      if (!accountId || !raw) return raw;
      const prefix = `${accountId}::`;
      return raw.startsWith(prefix) ? raw : `${prefix}${raw}`;
    }

    function originalId(record) {
      if (record && record._cacheOriginalId !== undefined && record._cacheOriginalId !== null) {
        return String(record._cacheOriginalId);
      }
      const accountId = record?.userId != null ? String(record.userId) : null;
      const id = record?.id != null ? String(record.id) : '';
      if (accountId && id.startsWith(`${accountId}::`)) return id.slice(accountId.length + 2);
      return id;
    }

    function normalizeForAccount(collection, input, accountId) {
      const source = input && typeof input === 'object' && !Array.isArray(input)
        ? { ...input }
        : { value: input };
      if (!ACCOUNT_SCOPED_COLLECTIONS.has(collection) || !accountId) return source;

      const owner = source.userId ?? source.user?.id ?? source.user?.userId ?? source.user?.uid;
      if (owner === undefined || owner === null || String(owner) === '') {
        source.userId = accountId;
      } else {
        source.userId = String(owner);
      }

      const rawId = source._cacheOriginalId ?? source.id ?? source.friendId ?? source.chatId ?? source.conversationId ?? source.groupId ?? source.callId ?? source.statusId ?? source.queueId;
      if (rawId !== undefined && rawId !== null && String(rawId) !== '') {
        source._cacheOriginalId = String(rawId).replace(`${source.userId}::`, '');
        source.id = scopedId(String(source.userId), source._cacheOriginalId);
      }
      return source;
    }

    function restoreRecord(record) {
      if (!record || typeof record !== 'object') return record;
      const copy = { ...record };
      const rawId = originalId(copy);
      if (rawId) copy.id = rawId;
      delete copy._cacheOriginalId;
      return copy;
    }

    function belongsToAccount(record, accountId) {
      if (!accountId) return false;
      const owner = record?.userId ?? record?.user?.id ?? record?.user?.userId ?? record?.user?.uid;
      return owner !== undefined && owner !== null && String(owner) === String(accountId);
    }

    async function migrateAndRead(collection) {
      const accountId = activeAccountId();
      const rawRecords = await rawGetAll(collection);
      if (!ACCOUNT_SCOPED_COLLECTIONS.has(collection) || !accountId) return rawRecords;

      const visible = [];
      const migrations = [];

      for (const record of rawRecords || []) {
        let owner = record?.userId ?? record?.user?.id ?? record?.user?.userId ?? record?.user?.uid;
        if (owner === undefined || owner === null || String(owner) === '') {
          // Legacy cache records had no owner. They were created under the
          // account that was active when the migration first runs, so assign
          // them once instead of exposing them to every account.
          owner = accountId;
        }
        owner = String(owner);

        const rawId = originalId(record) || record.id;
        const migrated = normalizeForAccount(collection, { ...record, userId: owner, _cacheOriginalId: rawId }, owner);
        const needsMigration = String(record.userId ?? '') !== owner || String(record.id ?? '') !== String(migrated.id ?? '');

        if (needsMigration) {
          migrations.push({ oldId: record.id, record: migrated });
        }
        if (owner === accountId) visible.push(restoreRecord(migrated));
      }

      if (migrations.length) {
        // Migrate in place. Existing records keep their original logical id,
        // but the physical IndexedDB key becomes accountId::logicalId.
        for (const item of migrations) {
          try {
            await rawSave(collection, item.record);
            if (String(item.oldId) !== String(item.record.id)) await rawRemove(collection, item.oldId);
          } catch (_) {}
        }
      }
      return visible;
    }

    // Replace the low-level methods on the singleton so callers that use
    // window.AppCache directly receive the same account isolation as the
    // CacheUnified facade.
    base.save = async function (collection, data) {
      const accountId = activeAccountId();
      if (!ACCOUNT_SCOPED_COLLECTIONS.has(collection) || !accountId) return rawSave(collection, data);
      const items = Array.isArray(data) ? data : [data];
      const scoped = items.map(item => normalizeForAccount(collection, item, accountId));
      const result = await rawSave(collection, scoped);
      return Array.isArray(data) ? result : result;
    };

    base.getAll = async function (collection) {
      return migrateAndRead(collection);
    };

    base.get = async function (collection, query) {
      const accountId = activeAccountId();
      if (!ACCOUNT_SCOPED_COLLECTIONS.has(collection) || !accountId) return rawGet(collection, query);
      if (query && typeof query === 'object') {
        return (await migrateAndRead(collection)).find(record => Object.entries(query).every(([key, value]) => value === undefined || record[key] === value)) || null;
      }
      const logicalId = String(query ?? '');
      if (!logicalId) return null;
      const scoped = scopedId(accountId, logicalId);
      const found = await rawGet(collection, scoped);
      return found && belongsToAccount(found, accountId) ? restoreRecord(found) : null;
    };

    base.remove = async function (collection, id) {
      const accountId = activeAccountId();
      if (!ACCOUNT_SCOPED_COLLECTIONS.has(collection) || !accountId) return rawRemove(collection, id);
      return rawRemove(collection, scopedId(accountId, id));
    };

    base.update = async function (collection, id, updates) {
      const existing = await base.get(collection, id);
      if (!existing) return null;
      return base.save(collection, { ...existing, ...(updates || {}), id });
    };

    base.clear = async function (collection) {
      const accountId = activeAccountId();
      if (!ACCOUNT_SCOPED_COLLECTIONS.has(collection) || !accountId) return rawClear(collection);
      const records = await migrateAndRead(collection);
      await Promise.all(records.map(record => rawRemove(collection, scopedId(accountId, record.id))));
      return true;
    };

    // Snapshot operations in app.cache.js use this.getAll/save/clear, so the
    // wrapped methods above make snapshots account-scoped as well. Keep the
    // original snapshot methods available for their existing implementation.
    base.getModuleSnapshot = async function (moduleName) {
      return rawGetModuleSnapshot(moduleName);
    };
    base.setModuleSnapshot = async function (moduleName, value) {
      return rawSetModuleSnapshot(moduleName, value);
    };

    const CacheUnified = {
      ready() { return base.ready(); },
      async set(collection, data) { return base.save(collection, data); },
      async get(collection, query) { return base.get(collection, query); },
      async getAll(collection) { return base.getAll(collection); },
      async update(collection, id, updates) { return base.update(collection, id, updates); },
      async delete(collection, id) { return base.remove(collection, id); },
      async clear(collection) { return base.clear(collection); },
      async upsert(collection, record) { return base.save(collection, record); },

      async mergeFromServer(collection, serverRecords) {
        if (!Array.isArray(serverRecords) || serverRecords.length === 0) return;
        const existing = await base.getAll(collection);
        const localOnly = existing.filter(r => r.isLocalOnly === true);
        const incomingIds = new Set(serverRecords.map(r => String(r.id ?? r._id ?? r.friendId ?? r.groupId ?? r.callId ?? r.statusId ?? '')));
        for (const record of existing) {
          if (record.isLocalOnly !== true && !incomingIds.has(String(record.id))) {
            await base.remove(collection, record.id);
          }
        }
        await base.save(collection, serverRecords.map(r => ({ ...r, isLocalOnly: false })));
        if (localOnly.length) await base.save(collection, localOnly);
      },

      async getSnapshot(module) { return base.getModuleSnapshot(module); },
      async setSnapshot(module, value) { return base.setModuleSnapshot(module, value); },

      getSession() { return base.getSession(); },
      setSession(s) { return base.setSession(s); },
      clearSession() { return base.clearSession(); },
      getSettings() {
        const accountId = activeAccountId();
        if (!accountId) return rawGetSettings();
        return base.getModuleSnapshot('settings');
      },
      setSettings(s) {
        const accountId = activeAccountId();
        if (!accountId) return rawSetSettings(s);
        return base.setModuleSnapshot('settings', s);
      },

      async enqueueSync(action) {
        const accountId = activeAccountId();
        return base.save('syncQueue', { ...(action || {}), userId: accountId || action?.userId || null });
      },
      async getPendingSyncQueue() {
        return (await base.getAll('syncQueue')).filter(item => item.status !== 'completed');
      },
      async hydrateStoreFromCache() { return base.hydrateStoreFromCache(); },
      async debugSummary() {
        const summary = {};
        for (const name of ['users','friends','messages','chats','groups','calls','status','settings','syncQueue']) {
          summary[name] = (await base.getAll(name)).length;
        }
        console.log('[CACHE] Account-scoped summary:', summary, 'accountId=', activeAccountId());
        return summary;
      },
      async initDB() { return base.initDB(); }
    };

    window.CacheUnified = CacheUnified;

    // Existing code often calls AppCache directly; keep all aliases on the
    // same wrapped singleton.
    base.mergeFromServer = CacheUnified.mergeFromServer.bind(CacheUnified);
    base.upsert = CacheUnified.upsert.bind(CacheUnified);
    base.getSnapshot = CacheUnified.getSnapshot.bind(CacheUnified);
    base.setSnapshot = CacheUnified.setSnapshot.bind(CacheUnified);
    base.set = CacheUnified.set.bind(CacheUnified);
    base.delete = CacheUnified.delete.bind(CacheUnified);

    try {
      window.dispatchEvent(new CustomEvent('CACHE_UNIFIED_READY', {
        detail: { at: Date.now(), accountId: activeAccountId() }
      }));
    } catch (_) {}

    console.log('[CacheUnified] Account-scoped cache boundary active — accountId=', activeAccountId());
  });
})();