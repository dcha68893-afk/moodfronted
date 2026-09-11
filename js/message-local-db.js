// =============================================================================
// message-local-db.js — persistent, account-isolated local cache for 1:1 chat history
// =============================================================================
(function (global) {
  'use strict';

  if (global.KynectaMessageCache) return;

  const DB_NAME = 'nexopa_message_lifecycle_v1';
  const DB_VERSION = 2;
  const MESSAGES_STORE = 'messages';
  const CONVERSATIONS_STORE = 'conversations';

  let dbPromise = null;
  let closed = false;

  // FIX (CHAT-HISTORY-NOT-PERSISTING-ACROSS-RELOAD/RELOGIN): this read
  // global.currentUser and global.AuthStorage — neither is ever set inside
  // this file's actual window. message.html (the only page that loads this
  // script) never loads js/authStorage.js and nothing here ever assigns
  // window.currentUser, so currentUserId() always returned null, which
  // silently no-op'd every KynectaMessageCache read/write
  // (hydrateConversationsFromCache/putConversation/putMessage in
  // message-client.js) — the "cache-first sidebar, no blank flash, works
  // offline" feature those functions exist for was dead code. What actually
  // made the sidebar look populated after reload before was
  // waitForApiThenLoadConversations()'s live network re-fetch finishing
  // quickly enough to be invisible — so this only ever "worked" on a fast,
  // reliable connection, which is why it looked fine on desktop/laptop and
  // fell apart on mobile once that fetch was slow, dropped, or ran into a
  // stale/rotated token before finishing.
  // Fix: resolve the account id straight from the localStorage keys this
  // app's real auth code actually writes to (kynecta_auth is authStorage.js's
  // AUTH_STORAGE_KEY; currentUser/nexopa_user are the plain mirrors
  // finalizeLoginSuccess() in index.html also writes on every login) —
  // localStorage is shared across same-origin iframes/reloads/relogins, so
  // this works regardless of which scripts happen to be loaded in whichever
  // window calls it, and survives exactly the reload/refresh/relogin cases
  // that were breaking.
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
      const tryKeys = ['kynecta_auth', 'currentUser', 'nexopa_user', 'user'];
      for (const key of tryKeys) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const u = parsed && parsed.user ? parsed.user : parsed;
          const id = u && (u.id || u.userId || u.uid || u._id);
          if (id != null) return String(id);
        } catch (_) { /* try next key */ }
      }
      return null;
    } catch (_) { return null; }
  }

  function openDb() {
    if (closed) closed = false;
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (_) { resolve(null); return; }
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const store = db.createObjectStore(MESSAGES_STORE, { keyPath: 'key' });
          store.createIndex('chatId', 'chatId', { unique: false });
          store.createIndex('accountId', 'accountId', { unique: false });
        } else if (event.oldVersion < 2) {
          const store = event.target.transaction.objectStore(MESSAGES_STORE);
          if (!store.indexNames.contains('accountId')) store.createIndex('accountId', 'accountId', { unique: false });
        }
        if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
          const store = db.createObjectStore(CONVERSATIONS_STORE, { keyPath: 'key' });
          store.createIndex('accountId', 'accountId', { unique: false });
        } else if (event.oldVersion < 2) {
          const store = event.target.transaction.objectStore(CONVERSATIONS_STORE);
          if (!store.indexNames.contains('accountId')) store.createIndex('accountId', 'accountId', { unique: false });
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

  // Account switching must NOT destroy this database. authStorage.js sends
  // kyn:accountSwitchWipe before attempting its broad IndexedDB cleanup; we
  // deliberately keep this connection open so the destructive delete is
  // blocked, while every record below is isolated by accountId. This gives
  // each signed-in account durable history without exposing account A to B.
  global.addEventListener('kyn:accountSwitchWipe', () => {
    closed = false;
    // Intentionally do not close dbPromise.
  });

  function withStore(storeName, mode) {
    return openDb().then((db) => {
      if (!db) return null;
      try { const tx = db.transaction(storeName, mode); return { tx, store: tx.objectStore(storeName) }; }
      catch (_) { return null; }
    });
  }

  function reqToPromise(req) {
    return new Promise((resolve) => { req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(undefined); });
  }

  function msgKey(accountId, chatId, id) { return `${accountId}::${chatId}::${id}`; }
  function convKey(accountId, chatId) { return `${accountId}::${chatId}`; }

  async function getMessages(chatId) {
    const accountId = currentUserId();
    if (!accountId) return [];
    const ctx = await withStore(MESSAGES_STORE, 'readonly');
    if (!ctx) return [];
    try {
      const idx = ctx.store.index('chatId');
      const rows = await reqToPromise(idx.getAll(IDBKeyRange.only(String(chatId))));
      return Array.isArray(rows)
        ? rows.filter(r => String(r.accountId || '') === accountId).map(r => r.message)
        : [];
    } catch (_) { return []; }
  }

  async function putMessage(chatId, message) {
    const accountId = currentUserId();
    if (!accountId || !chatId || !message || message.id == null) return;
    const ctx = await withStore(MESSAGES_STORE, 'readwrite');
    if (!ctx) return;
    try { ctx.store.put({ key: msgKey(accountId, chatId, message.id), accountId, chatId: String(chatId), id: message.id, message }); } catch (_) {}
  }

  async function putMessages(chatId, messages) {
    const accountId = currentUserId();
    if (!accountId || !chatId || !Array.isArray(messages) || !messages.length) return;
    const ctx = await withStore(MESSAGES_STORE, 'readwrite');
    if (!ctx) return;
    try { messages.forEach(message => { if (message && message.id != null) ctx.store.put({ key: msgKey(accountId, chatId, message.id), accountId, chatId: String(chatId), id: message.id, message }); }); } catch (_) {}
  }

  async function deleteMessage(chatId, id) {
    const accountId = currentUserId();
    if (!accountId || !chatId || id == null) return;
    const ctx = await withStore(MESSAGES_STORE, 'readwrite');
    if (!ctx) return;
    try { ctx.store.delete(msgKey(accountId, chatId, id)); } catch (_) {}
  }

  async function deleteChatMessages(chatId) {
    const accountId = currentUserId();
    if (!accountId || !chatId) return;
    const ctx = await withStore(MESSAGES_STORE, 'readwrite');
    if (!ctx) return;
    try {
      const idx = ctx.store.index('chatId');
      const req = idx.openKeyCursor(IDBKeyRange.only(String(chatId)));
      req.onsuccess = () => { const cursor = req.result; if (cursor) { if (String(cursor.value.accountId || '') === accountId) ctx.store.delete(cursor.primaryKey); cursor.continue(); } };
    } catch (_) {}
  }

  async function getLastMessageId(chatId) {
    const rows = await getMessages(chatId);
    let max = null;
    rows.forEach(m => { if (typeof m.id === 'number' && (max === null || m.id > max)) max = m.id; });
    return max;
  }

  async function getConversations() {
    const accountId = currentUserId();
    if (!accountId) return [];
    const ctx = await withStore(CONVERSATIONS_STORE, 'readonly');
    if (!ctx) return [];
    try {
      const idx = ctx.store.index('accountId');
      const rows = await reqToPromise(idx.getAll(IDBKeyRange.only(accountId)));
      return Array.isArray(rows) ? rows.map(r => r.conversation) : [];
    } catch (_) { return []; }
  }

  async function putConversation(chatId, conversation) {
    const accountId = currentUserId();
    if (!accountId || !chatId || !conversation) return;
    const ctx = await withStore(CONVERSATIONS_STORE, 'readwrite');
    if (!ctx) return;
    try { ctx.store.put({ key: convKey(accountId, chatId), accountId, chatId: String(chatId), conversation }); } catch (_) {}
  }

  async function deleteConversation(chatId) {
    const accountId = currentUserId();
    if (!accountId || !chatId) return;
    const ctx = await withStore(CONVERSATIONS_STORE, 'readwrite');
    if (!ctx) return;
    try { ctx.store.delete(convKey(accountId, chatId)); } catch (_) {}
  }

  global.KynectaMessageCache = { getMessages, putMessage, putMessages, deleteMessage, deleteChatMessages, getLastMessageId, getConversations, putConversation, deleteConversation };
})(window);
