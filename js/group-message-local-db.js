// Persistent, account-isolated local cache for GROUP chat history.
// Mirrors js/message-local-db.js's design (same account-scoping rules,
// same key shape, same best-effort semantics) so group chats get the same
// "history is already here, reload doesn't lose it" behavior 1:1 chats
// already have. Kept as a separate IndexedDB database/store on purpose —
// this never touches the 1:1 cache or its data.
(function (global) {
  'use strict';
  if (global.KynectaGroupMessageCache) return;
  const DB_NAME = 'necpra_group_message_lifecycle_v1';
  const DB_VERSION = 1;
  const MESSAGES_STORE = 'groupMessages';
  let dbPromise = null;
  let closed = false;

  // Same account-detection strategy as message-local-db.js, kept in sync
  // deliberately — both caches must agree on "whose data is this" or a
  // shared device could leak one account's group history into another's.
  function currentUserId() {
    try {
      if (global.currentUser && (global.currentUser.id || global.currentUser.userId || global.currentUser._id)) {
        const u = global.currentUser;
        return String(u.id || u.userId || u._id);
      }
      if (global.AuthStorage && typeof global.AuthStorage.getUser === 'function') {
        const u = global.AuthStorage.getUser();
        const id = u && (u.id || u.userId || u.uid || u._id);
        if (id != null) return String(id);
      }
      for (const key of ['kynecta_auth', 'currentUser', 'necpa_user', 'user']) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const u = parsed && parsed.user ? parsed.user : parsed;
          const id = u && (u.id || u.userId || u.uid || u._id);
          if (id != null) return String(id);
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  function openDb() {
    if (closed) closed = false;
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (_) { return resolve(null); }
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const s = db.createObjectStore(MESSAGES_STORE, { keyPath: 'key' });
          s.createIndex('groupId', 'groupId', { unique: false });
          s.createIndex('accountId', 'accountId', { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { try { db.close(); } catch (_) {} dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  // Same account-switch signal message-local-db.js listens for, so both
  // caches re-open cleanly under the newly active account.
  global.addEventListener('kyn:accountSwitchWipe', () => { closed = false; });

  function withStore(mode) {
    return openDb().then((db) => {
      if (!db) return null;
      try {
        const tx = db.transaction(MESSAGES_STORE, mode);
        return { tx, store: tx.objectStore(MESSAGES_STORE) };
      } catch (_) { return null; }
    });
  }
  function reqToPromise(req) {
    return new Promise((resolve) => { req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(undefined); });
  }
  function msgKey(accountId, groupId, id) { return `${accountId}::${groupId}::${id}`; }
  function chronological(rows) {
    return rows.slice().sort((a, b) => {
      const an = typeof a.id === 'number' ? a.id : Number(a.id) || null;
      const bn = typeof b.id === 'number' ? b.id : Number(b.id) || null;
      if (an !== null && bn !== null) return an - bn;
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return at - bt;
    });
  }

  async function getMessages(groupId) {
    const accountId = currentUserId();
    if (!accountId || groupId == null) return [];
    const ctx = await withStore('readonly');
    if (!ctx) return [];
    try {
      const rows = await reqToPromise(ctx.store.index('groupId').getAll(IDBKeyRange.only(String(groupId))));
      return Array.isArray(rows) ? chronological(rows.filter((r) => String(r.accountId || '') === accountId).map((r) => r.message)) : [];
    } catch (_) { return []; }
  }

  async function putMessages(groupId, messages) {
    const accountId = currentUserId();
    if (!accountId || groupId == null || !Array.isArray(messages) || !messages.length) return;
    const ctx = await withStore('readwrite');
    if (!ctx) return;
    try {
      for (const message of messages) {
        const id = message && (message.id != null ? message.id : message.messageId);
        if (!message || id == null) continue;
        const key = msgKey(accountId, groupId, id);
        ctx.store.put({ key, accountId, groupId: String(groupId), id, message });
      }
    } catch (_) {}
  }

  async function deleteGroupMessages(groupId) {
    const accountId = currentUserId();
    if (!accountId || groupId == null) return;
    const ctx = await withStore('readwrite');
    if (!ctx) return;
    try {
      const req = ctx.store.index('groupId').openCursor(IDBKeyRange.only(String(groupId)));
      req.onsuccess = () => {
        const c = req.result;
        if (c) {
          if (String(c.value.accountId || '') === accountId) ctx.store.delete(c.primaryKey);
          c.continue();
        }
      };
    } catch (_) {}
  }

  global.KynectaGroupMessageCache = { getMessages, putMessages, deleteGroupMessages };
})(window);
