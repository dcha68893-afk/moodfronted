(function () {
  "use strict";

  if (window.AppCache && window.KynectaCache) return;

  const DB_NAME = "AppDB";
  const DB_VERSION = 1;
  const SESSION_KEY = "kynecta_auth";
  const SETTINGS_KEY = "knecta_settings_cache";
  const STORE_NAMES = [
    "users",
    "friends",
    "messages",
    "chats",
    "groups",
    "calls",
    "status",
    "settings",
    "syncQueue"
  ];

  const STORE_CONFIG = {
    users: { indexes: [["userId", "userId"], ["updatedAt", "updatedAt"]] },
    friends: { indexes: [["userId", "userId"], ["friendId", "friendId"], ["status", "status"], ["updatedAt", "updatedAt"]] },
    messages: { indexes: [["userId", "userId"], ["chatId", "chatId"], ["serverId", "serverId"], ["status", "status"], ["updatedAt", "updatedAt"]] },
    chats: { indexes: [["userId", "userId"], ["updatedAt", "updatedAt"]] },
    groups: { indexes: [["userId", "userId"], ["serverId", "serverId"], ["updatedAt", "updatedAt"]] },
    calls: { indexes: [["userId", "userId"], ["chatId", "chatId"], ["updatedAt", "updatedAt"]] },
    status: { indexes: [["userId", "userId"], ["updatedAt", "updatedAt"]] },
    settings: { indexes: [["userId", "userId"], ["updatedAt", "updatedAt"]] },
    syncQueue: { indexes: [["userId", "userId"], ["type", "type"], ["action", "action"], ["status", "status"], ["updatedAt", "updatedAt"]] }
  };

  const ID_KEY_BY_COLLECTION = {
    users: ["id", "userId", "uid"],
    friends: ["id", "friendId", "serverId"],
    messages: ["id", "localId", "serverId"],
    chats: ["id", "chatId", "conversationId"],
    groups: ["id", "groupId", "serverId"],
    calls: ["id", "callId", "serverId"],
    status: ["id", "statusId", "serverId"],
    settings: ["id", "key", "userId"],
    syncQueue: ["id", "queueId"]
  };

  function nowTs() {
    return Date.now();
  }

  function clone(value) {
    if (value === null || value === undefined) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return value;
    }
  }

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function generateId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  class UnifiedAppCache {
    constructor() {
      this._db = null;
      this._memory = new Map(STORE_NAMES.map((name) => [name, new Map()]));
      this._bootstrapped = false;
      this._readyPromise = this.initDB();
    }

    async initDB() {
      if (this._db) return this._db;
      if (!window.indexedDB) {
        console.warn("[CACHE] IndexedDB unavailable, using memory fallback");
        return null;
      }

      return new Promise((resolve) => {
        let request;
        try {
          request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (error) {
          console.warn("[CACHE] IndexedDB open threw, using memory fallback:", error.message);
          resolve(null);
          return;
        }

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          STORE_NAMES.forEach((storeName) => {
            if (!db.objectStoreNames.contains(storeName)) {
              const store = db.createObjectStore(storeName, { keyPath: "id" });
              (STORE_CONFIG[storeName]?.indexes || []).forEach(([name, keyPath]) => {
                if (!store.indexNames.contains(name)) {
                  store.createIndex(name, keyPath, { unique: false });
                }
              });
              return;
            }

            const store = request.transaction.objectStore(storeName);
            (STORE_CONFIG[storeName]?.indexes || []).forEach(([name, keyPath]) => {
              if (!store.indexNames.contains(name)) {
                store.createIndex(name, keyPath, { unique: false });
              }
            });
          });
        };

        request.onsuccess = () => {
          this._db = request.result;
          console.log("[CACHE] DB initialized");
          this._bootstrapFromLocalSources().finally(() => resolve(this._db));
        };

        request.onerror = () => {
          console.warn("[CACHE] IndexedDB failed, using memory fallback");
          resolve(null);
        };
      });
    }

    async ready() {
      return this._readyPromise;
    }

    _safeJson(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (_error) {
        return fallback;
      }
    }

    async _seedCollectionIfEmpty(collection, records) {
      const normalized = (Array.isArray(records) ? records : []).filter(Boolean);
      if (normalized.length === 0) return;
      const existing = await this.getAll(collection);
      if (existing.length > 0) return;
      await this.save(collection, normalized);
    }

    async _bootstrapFromLocalSources() {
      if (this._bootstrapped) return;
      this._bootstrapped = true;

      const session = this.getSession();
      if (session?.user) {
        await this._seedCollectionIfEmpty("users", [{
          ...session.user,
          id: session.user.id || session.user.userId || generateId("user"),
          userId: session.user.id || session.user.userId || null
        }]);
      }

      const settings = this.getSettings();
      if (settings && Object.keys(settings).length > 0) {
        await this.setModuleSnapshot("settings", settings);
      }

      const messageSnapshot = this._safeJson("kynecta_messages_cache");
      if (messageSnapshot?.byId || messageSnapshot?.byChat) {
        await this.setModuleSnapshot("messages", messageSnapshot);
      }

      const friendSnapshot = this._safeJson("kynecta_friends_cache");
      if (friendSnapshot?.list || friendSnapshot?.byId) {
        await this.setModuleSnapshot("friends", friendSnapshot);
      } else {
        const legacyFriends = this._safeJson("friends", []);
        if (Array.isArray(legacyFriends) && legacyFriends.length > 0) {
          await this._seedCollectionIfEmpty("friends", legacyFriends);
        }
      }

      const groupSnapshot = this._safeJson("kynecta_groups_cache");
      if (groupSnapshot?.list || groupSnapshot?.byId) {
        await this.setModuleSnapshot("groups", groupSnapshot);
      } else {
        const legacyGroups = this._safeJson("knecta_groups_groups", []);
        if (Array.isArray(legacyGroups) && legacyGroups.length > 0) {
          await this._seedCollectionIfEmpty("groups", legacyGroups);
        }
      }

      const chatsCache = this._safeJson("kynecta_chats_cache_v8") || this._safeJson("knecta_chats_cache_v8");
      if (Array.isArray(chatsCache?.conversations) && chatsCache.conversations.length > 0) {
        await this._seedCollectionIfEmpty("chats", chatsCache.conversations);
      }

      const callsCache = this._safeJson("cached_call_history");
      if (Array.isArray(callsCache?.calls) && callsCache.calls.length > 0) {
        await this._seedCollectionIfEmpty("calls", callsCache.calls);
      } else if (Array.isArray(callsCache) && callsCache.length > 0) {
        await this._seedCollectionIfEmpty("calls", callsCache);
      }

      const statusSnapshot = this._safeJson("kynecta_status_cache");
      if (statusSnapshot?.list || statusSnapshot?.byId) {
        await this.setModuleSnapshot("status", statusSnapshot);
      }
    }

    _normalizeCollection(collection) {
      const key = String(collection || "");
      if (!STORE_NAMES.includes(key)) {
        throw new Error(`[CACHE] Unknown collection: ${key}`);
      }
      return key;
    }

    _ensureId(collection, record) {
      const keys = ID_KEY_BY_COLLECTION[collection] || ["id"];
      let resolvedId = null;
      keys.some((key) => {
        if (record[key] !== null && record[key] !== undefined && record[key] !== "") {
          resolvedId = String(record[key]);
          return true;
        }
        return false;
      });
      if (!resolvedId) resolvedId = generateId(collection);
      return resolvedId;
    }

    _normalizeRecord(collection, input) {
      const record = isObject(input) ? { ...input } : { value: input };
      record.id = this._ensureId(collection, record);
      if (record.userId === undefined || record.userId === null) {
        record.userId = record.user?.id || record.user?.userId || null;
      }
      if (record.chatId === undefined || record.chatId === null) {
        record.chatId = record.conversationId || record.groupId || null;
      }
      if (!record.createdAt) record.createdAt = nowTs();
      record.updatedAt = nowTs();
      return record;
    }

    _memoryStore(collection) {
      return this._memory.get(collection);
    }

    _requestToPromise(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async save(collection, data) {
      const storeName = this._normalizeCollection(collection);
      await this.ready();

      const items = (Array.isArray(data) ? data : [data]).filter((item) => item !== undefined && item !== null);
      const normalized = items.map((item) => this._normalizeRecord(storeName, item));
      if (normalized.length === 0) return [];

      if (!this._db) {
        const mem = this._memoryStore(storeName);
        normalized.forEach((record) => mem.set(record.id, clone(record)));
        console.log("[CACHE] Saved:", storeName);
        return Array.isArray(data) ? normalized : normalized[0];
      }

      await new Promise((resolve, reject) => {
        const tx = this._db.transaction([storeName], "readwrite");
        const store = tx.objectStore(storeName);
        normalized.forEach((record) => store.put(record));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
      }).catch((error) => {
        console.warn(`[CACHE] Save fallback for ${storeName}:`, error?.message || error);
        const mem = this._memoryStore(storeName);
        normalized.forEach((record) => mem.set(record.id, clone(record)));
      });

      console.log("[CACHE] Saved:", storeName);
      return Array.isArray(data) ? normalized : normalized[0];
    }

    async get(collection, query) {
      const storeName = this._normalizeCollection(collection);
      await this.ready();

      if (query === undefined || query === null) return null;

      if (!this._db) {
        const all = Array.from(this._memoryStore(storeName).values());
        return this._queryCollection(all, query, true);
      }

      try {
        if (typeof query === "string" || typeof query === "number") {
          const tx = this._db.transaction([storeName], "readonly");
          const result = await this._requestToPromise(tx.objectStore(storeName).get(String(query)));
          console.log("[CACHE] Loaded:", storeName);
          return result || null;
        }

        const all = await this.getAll(storeName);
        return this._queryCollection(all, query, true);
      } catch (_error) {
        const all = Array.from(this._memoryStore(storeName).values());
        return this._queryCollection(all, query, true);
      }
    }

    async getAll(collection) {
      const storeName = this._normalizeCollection(collection);
      await this.ready();

      if (!this._db) {
        const items = Array.from(this._memoryStore(storeName).values()).map((item) => clone(item));
        console.log("[CACHE] Loaded:", storeName);
        return items;
      }

      try {
        const tx = this._db.transaction([storeName], "readonly");
        const records = await this._requestToPromise(tx.objectStore(storeName).getAll());
        console.log("[CACHE] Loaded:", storeName);
        return Array.isArray(records) ? records : [];
      } catch (_error) {
        const items = Array.from(this._memoryStore(storeName).values()).map((item) => clone(item));
        console.log("[CACHE] Loaded:", storeName);
        return items;
      }
    }

    _queryCollection(items, query, firstOnly) {
      const list = Array.isArray(items) ? items : [];
      if (typeof query === "string" || typeof query === "number") {
        const found = list.find((item) => String(item.id) === String(query)) || null;
        return firstOnly ? found : (found ? [found] : []);
      }

      const matches = list.filter((item) => {
        return Object.entries(query || {}).every(([key, value]) => {
          if (value === undefined) return true;
          return item[key] === value;
        });
      });

      return firstOnly ? (matches[0] || null) : matches;
    }

    async update(collection, id, updates) {
      const existing = await this.get(collection, id);
      if (!existing) return null;
      const saved = await this.save(collection, { ...existing, ...(updates || {}), id: existing.id });
      return saved;
    }

    async remove(collection, id) {
      const storeName = this._normalizeCollection(collection);
      await this.ready();
      const key = String(id);

      if (!this._db) {
        this._memoryStore(storeName).delete(key);
        return true;
      }

      return new Promise((resolve) => {
        try {
          const tx = this._db.transaction([storeName], "readwrite");
          tx.objectStore(storeName).delete(key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch (_error) {
          resolve(false);
        }
      });
    }

    async clear(collection) {
      const storeName = this._normalizeCollection(collection);
      await this.ready();

      if (!this._db) {
        this._memoryStore(storeName).clear();
        return true;
      }

      return new Promise((resolve) => {
        try {
          const tx = this._db.transaction([storeName], "readwrite");
          tx.objectStore(storeName).clear();
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch (_error) {
          resolve(false);
        }
      });
    }

    getSession() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (_error) {
        return null;
      }
    }

    setSession(session) {
      if (!session || !session.token) return false;
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        ["authToken", "token", "accessToken", "moodchat_token", "USER_TOKEN"].forEach((key) => {
          localStorage.setItem(key, session.token);
        });
        if (session.user) {
          const userJson = JSON.stringify(session.user);
          ["currentUser", "user", "moodchat_user"].forEach((key) => localStorage.setItem(key, userJson));
        }
        localStorage.setItem("isLoggedIn", "true");
        return true;
      } catch (_error) {
        return false;
      }
    }

    clearSession() {
      try {
        localStorage.removeItem(SESSION_KEY);
        ["authToken", "token", "accessToken", "moodchat_token", "USER_TOKEN", "currentUser", "user", "moodchat_user", "isLoggedIn"].forEach((key) => localStorage.removeItem(key));
        return true;
      } catch (_error) {
        return false;
      }
    }

    getSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && parsed.data !== undefined ? parsed.data : parsed;
      } catch (_error) {
        return null;
      }
    }

    setSettings(settings) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
          data: settings || {},
          timestamp: nowTs()
        }));
        return true;
      } catch (_error) {
        return false;
      }
    }

    async enqueueSync(action) {
      return this.save("syncQueue", {
        ...action,
        id: action?.id || action?.queueId || generateId("sync"),
        status: action?.status || "pending",
        userId: action?.userId || null
      });
    }

    async getPendingSyncQueue() {
      const items = await this.getAll("syncQueue");
      return items.filter((item) => item.status !== "completed");
    }

    _recordsToMessageSnapshot(records) {
      const snapshot = { byId: {}, byChat: {}, unread: {}, typing: {}, drafts: {} };
      records.forEach((record) => {
        snapshot.byId[record.id] = record;
        const chatId = record.chatId || "unknown";
        if (!snapshot.byChat[chatId]) snapshot.byChat[chatId] = [];
        snapshot.byChat[chatId].push(record);
      });
      Object.keys(snapshot.byChat).forEach((chatId) => {
        snapshot.byChat[chatId].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      });
      return snapshot;
    }

    _recordsToFriendsSnapshot(records) {
      const snapshot = { byId: {}, list: [], online: [], requests: [], blocked: [] };
      records.forEach((record) => {
        const friendId = String(record.friendId || record.id);
        const entry = {
          id: friendId,
          friendId,
          displayName: record.displayName || record.username || friendId,
          username: record.username || "",
          avatar: record.avatar || "",
          photoURL: record.avatar || record.photoURL || "",
          status: record.status || "offline",
          online: record.online === true,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          isLocalOnly: record.isLocalOnly === true
        };
        snapshot.byId[friendId] = entry;
        if (record.status === "blocked") snapshot.blocked.push(entry);
        else if (record.status === "pending_received" || record.status === "pending_sent") snapshot.requests.push(entry);
        else snapshot.list.push(entry);
        if (entry.online) snapshot.online.push(friendId);
      });
      return snapshot;
    }

    _recordsToChatSnapshot(records) {
      return {
        byId: records.reduce((acc, record) => {
          acc[record.id] = record;
          return acc;
        }, {}),
        list: records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      };
    }

    _recordsToGroupsSnapshot(records) {
      const byId = {};
      records.forEach((record) => { byId[record.id] = record; });
      return {
        byId,
        list: records,
        myGroups: records.filter((record) => record.isCreator || record.role === "owner"),
        joinedGroups: records.filter((record) => !record.isCreator),
        adminGroups: records.filter((record) => record.isAdmin || record.role === "admin"),
        members: {},
        messages: {},
        invites: [],
        pendingQueue: [],
        syncState: { syncing: false, lastSync: 0, pendingCount: 0, failedIds: [] },
        lastSync: 0
      };
    }

    _recordsToCallsSnapshot(records) {
      return {
        active: null,
        history: records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
        missed: records.filter((record) => record.status === "missed"),
        ringing: null
      };
    }

    _recordsToStatusSnapshot(records) {
      return {
        byId: records.reduce((acc, record) => {
          acc[record.id] = record;
          return acc;
        }, {}),
        list: records,
        viewed: {}
      };
    }

    _recordsToSettingsSnapshot(records) {
      const merged = {};
      records.forEach((record) => {
        if (record.key && record.value !== undefined) {
          merged[record.key] = record.value;
        } else {
          Object.assign(merged, record.data || record);
        }
      });
      return merged;
    }

    async getModuleSnapshot(moduleName) {
      const module = String(moduleName || "");
      switch (module) {
        case "messages":
          return this._recordsToMessageSnapshot(await this.getAll("messages"));
        case "friends":
          return this._recordsToFriendsSnapshot(await this.getAll("friends"));
        case "calls":
          return this._recordsToCallsSnapshot(await this.getAll("calls"));
        case "groups":
          return this._recordsToGroupsSnapshot(await this.getAll("groups"));
        case "status":
          return this._recordsToStatusSnapshot(await this.getAll("status"));
        case "settings":
          return this._recordsToSettingsSnapshot(await this.getAll("settings")) || this.getSettings() || {};
        case "user":
          return (await this.getAll("users"))[0] || null;
        case "session":
          return this.getSession();
        case "chats":
          return this._recordsToChatSnapshot(await this.getAll("chats"));
        default:
          return null;
      }
    }

    async setModuleSnapshot(moduleName, value) {
      const module = String(moduleName || "");
      if (!value) return false;

      switch (module) {
        case "messages": {
          const records = Object.values(value.byId || {});
          await this.clear("messages");
          await this.save("messages", records);
          return true;
        }
        case "friends": {
          const records = []
            .concat(Array.isArray(value.list) ? value.list : [])
            .concat(Array.isArray(value.requests) ? value.requests : [])
            .concat(Array.isArray(value.blocked) ? value.blocked : []);
          await this.clear("friends");
          await this.save("friends", records);
          return true;
        }
        case "calls":
          await this.clear("calls");
          await this.save("calls", Array.isArray(value.history) ? value.history : []);
          return true;
        case "groups":
          await this.clear("groups");
          await this.save("groups", Array.isArray(value.list) ? value.list : []);
          return true;
        case "status":
          await this.clear("status");
          await this.save("status", Array.isArray(value.list) ? value.list : []);
          return true;
        case "settings": {
          const flattened = Object.entries(value || {}).map(([key, itemValue]) => ({
            id: key,
            key,
            value: itemValue,
            data: itemValue
          }));
          await this.clear("settings");
          await this.save("settings", flattened);
          this.setSettings(value);
          return true;
        }
        case "user":
          await this.clear("users");
          await this.save("users", value);
          return true;
        case "session":
          return this.setSession(value);
        case "chats": {
          const records = Array.isArray(value.list) ? value.list : Object.values(value.byId || {});
          await this.clear("chats");
          await this.save("chats", records);
          return true;
        }
        default:
          return false;
      }
    }

    async hydrateStoreFromCache() {
      await this.ready();
      if (!window.KynectaStore) return {};

      const hydration = {
        user: await this.getModuleSnapshot("user"),
        session: await this.getModuleSnapshot("session"),
        messages: await this.getModuleSnapshot("messages"),
        friends: await this.getModuleSnapshot("friends"),
        groups: await this.getModuleSnapshot("groups"),
        calls: await this.getModuleSnapshot("calls"),
        status: await this.getModuleSnapshot("status"),
        settings: await this.getModuleSnapshot("settings")
      };

      Object.entries(hydration).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          try {
            window.KynectaStore.set(key, value, { silent: true, persist: false });
          } catch (_error) {}
        }
      });

      return hydration;
    }

    async debugSummary() {
      await this.ready();
      const summary = {};
      for (const storeName of STORE_NAMES) {
        summary[storeName] = (await this.getAll(storeName)).length;
      }
      console.log("[CACHE] Summary:", summary);
      return summary;
    }
  }

  const cache = new UnifiedAppCache();
  window.AppCache = cache;
  window.KynectaCache = cache;
})();
