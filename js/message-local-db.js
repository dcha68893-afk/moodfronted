// =============================================================================
// message-local-db.js — persistent local cache for 1:1 chat history
// -----------------------------------------------------------------------------
// PROBLEM (WhatsApp-Web parity gap): js/message-client.js's `state` object
// (conversations + messagesByConversation) is a plain in-memory Map. It is
// the single source of truth for the UI, but it lives only for the lifetime
// of the page. On every reload, relogin, or fresh tab, that Map starts empty
// — so openChat() always falls back to a full network fetch
// (`GET /messages/:chatId`) AND every one of those messages goes back through
// the full E2E decrypt path (window.KynectaE2E.decryptMessageForDisplay),
// even for messages that were already fetched and already decrypted in a
// previous session, seconds or months ago. That's both the unnecessary
// network round trip and the unnecessary crypto work the user asked to
// eliminate — this file is what's missing to actually do that.
//
// This module is a small, self-contained IndexedDB wrapper. It does not
// replace message-client.js's in-memory state — it's a write-through/
// read-through cache underneath it: message-client.js still owns rendering
// and the network/realtime pipeline, it just also (a) hydrates its in-memory
// state from here before ever touching the network, and (b) writes every
// message it sees — and every decrypted plaintext it resolves — back here.
//
// DB NAME: deliberately reusing 'nexopa_message_lifecycle_v1'. That exact
// name already existed as a *comment* in js/authStorage.js's
// KNOWN_INDEXEDDB_NAMES wipe-allowlist ("Message history — ... uses this
// exact fallback list"), reserved for a message-history DB that was never
// actually built. Using that name here (instead of inventing a new one)
// means the existing account-switch wipe logic — which already deletes this
// exact name on sign-in-as-a-different-user — works correctly with zero
// changes to authStorage.js, and a stale cache can never leak across
// accounts on a shared device.
//
// SCOPE NOTE: not per-user-namespaced by design — account switches are
// handled by authStorage.js deleting the whole DB (see above), and a plain
// logout/relogin as the *same* user is exactly the case this cache is meant
// to survive (per the request: "reload or relogin" should not need
// refetching or redecrypting anything already seen).
// =============================================================================

(function (global) {
  'use strict';

  if (global.KynectaMessageCache) return; // idempotent if this script is ever included twice

  const DB_NAME = 'nexopa_message_lifecycle_v1';
  const DB_VERSION = 1;
  const MESSAGES_STORE = 'messages';
  const CONVERSATIONS_STORE = 'conversations';

  let dbPromise = null;
  let closed = false;

  function openDb() {
    if (closed) closed = false; // allow re-open after a wipe-triggered close
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (_) { resolve(null); return; }

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const store = db.createObjectStore(MESSAGES_STORE, { keyPath: 'key' });
          store.createIndex('chatId', 'chatId', { unique: false });
        }
        if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
          db.createObjectStore(CONVERSATIONS_STORE, { keyPath: 'chatId' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // If another tab/account-switch asks every connection to close (see
        // authStorage.js's kyn:accountSwitchWipe dispatch below), honor it so
        // indexedDB.deleteDatabase() there doesn't hang forever blocked on
        // this open connection.
        db.onversionchange = () => { try { db.close(); } catch (_) {} dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => resolve(null); // caching is a pure optimization — never let it break the app
      req.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  // authStorage.js's account-switch wipe fires this *before* calling
  // indexedDB.deleteDatabase(DB_NAME, ...). Without closing our own
  // connection here, that delete would sit blocked (onblocked) waiting on
  // this exact tab's open handle for up to its own grace-period timeout.
  global.addEventListener('kyn:accountSwitchWipe', () => {
    if (dbPromise) {
      dbPromise.then((db) => { try { db && db.close(); } catch (_) {} });
    }
    dbPromise = null;
    closed = true;
  });

  function withStore(storeName, mode) {
    return openDb().then((db) => {
      if (!db) return null;
      try {
        const tx = db.transaction(storeName, mode);
        return { tx, store: tx.objectStore(storeName) };
      } catch (_) { return null; }
    });
  }

  function reqToPromise(req) {
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
  }

  function msgKey(chatId, id) { return `${chatId}::${id}`; }

  // ── Messages ────────────────────────────────────────────────────────────

  // Returns cached messages for a chat, oldest-first, each with whatever
  // displayContent (decrypted plaintext) had already been resolved for it
  // last time it was seen. Never touches the network or the E2E module.
  async function getMessages(chatId) {
    const ctx = await withStore(MESSAGES_STORE, 'readonly');
    if (!ctx) return [];
    try {
      const idx = ctx.store.index('chatId');
      const rows = await reqToPromise(idx.getAll(IDBKeyRange.only(String(chatId))));
      return Array.isArray(rows) ? rows.map((r) => r.message) : [];
    } catch (_) { return []; }
  }

  // Upserts one message record (fire-and-forget from the caller's point of
  // view — caching must never be on the critical path for rendering or
  // sending). `message` should already carry `displayContent` when it's
  // known; if decryption resolves later, call this again with the updated
  // object to overwrite the cached copy.
  async function putMessage(chatId, message) {
    if (!chatId || !message || message.id == null) return;
    const ctx = await withStore(MESSAGES_STORE, 'readwrite');
    if (!ctx) return;
    try {
      ctx.store.put({ key: msgKey(chatId, message.id), chatId: String(chatId), id: message.id, message });
    } catch (_) { /* best-effort */ }
  }

  async function putMessages(chatId, messages) {
    if (!chatId || !Array.isArray(messages) || !messages.length) return;
    const ctx = await withStore(MESSAGES_STORE, 'readwrite');
    if (!ctx) return;
    try {
      messages.forEach((message) => {
        if (message && message.id != null) {
          ctx.store.put({ key: msgKey(chatId, message.id), chatId: String(chatId), id: message.id, message });
        }
      });
    } catch (_) { /* best-effort */ }
  }

  // For optimistic (pre-server-ack) local echoes, which are deliberately
  // never written here in the first place (see message-client.js sendMessage
  // — only the server-confirmed message gets persisted). This exists for the
  // rare case one WAS cached under an id that's since been superseded/moved
  // (e.g. the synthetic "pending:<receiverId>" chatId a brand-new
  // conversation's first message is optimistically filed under, before the
  // server assigns the real chatId).
  async function deleteMessage(chatId, id) {
    if (!chatId || id == null) return;
    const ctx = await withStore(MESSAGES_STORE, 'readwrite');
    if (!ctx) return;
    try { ctx.store.delete(msgKey(chatId, id)); } catch (_) { /* best-effort */ }
  }

  // Drops every cached message for a chatId — used when a synthetic
  // "pending:<receiverId>" bucket gets folded into the real, server-assigned
  // chatId on first send, so the synthetic id's cache entries don't linger
  // as orphaned duplicates.
  async function deleteChatMessages(chatId) {
    if (!chatId) return;
    const ctx = await withStore(MESSAGES_STORE, 'readwrite');
    if (!ctx) return;
    try {
      const idx = ctx.store.index('chatId');
      const req = idx.openKeyCursor(IDBKeyRange.only(String(chatId)));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) { ctx.store.delete(cursor.primaryKey); cursor.continue(); }
      };
    } catch (_) { /* best-effort */ }
  }

  // Highest numeric message id cached for a chat — used as the delta-sync
  // cursor (fetch only what's newer than this) instead of re-fetching the
  // last N messages on every chat open. Optimistic local-echo ids (strings
  // like "optimistic:<id>") are ignored; only server-assigned numeric ids
  // are valid sync cursors.
  async function getLastMessageId(chatId) {
    const rows = await getMessages(chatId);
    let max = null;
    rows.forEach((m) => {
      if (typeof m.id === 'number' && (max === null || m.id > max)) max = m.id;
    });
    return max;
  }

  // ── Conversations (sidebar list) ───────────────────────────────────────

  async function getConversations() {
    const ctx = await withStore(CONVERSATIONS_STORE, 'readonly');
    if (!ctx) return [];
    try {
      const rows = await reqToPromise(ctx.store.getAll());
      return Array.isArray(rows) ? rows.map((r) => r.conversation) : [];
    } catch (_) { return []; }
  }

  async function putConversation(chatId, conversation) {
    if (!chatId || !conversation) return;
    const ctx = await withStore(CONVERSATIONS_STORE, 'readwrite');
    if (!ctx) return;
    try {
      ctx.store.put({ chatId: String(chatId), conversation });
    } catch (_) { /* best-effort */ }
  }

  async function deleteConversation(chatId) {
    if (!chatId) return;
    const ctx = await withStore(CONVERSATIONS_STORE, 'readwrite');
    if (!ctx) return;
    try { ctx.store.delete(String(chatId)); } catch (_) { /* best-effort */ }
  }

  global.KynectaMessageCache = {
    getMessages,
    putMessage,
    putMessages,
    deleteMessage,
    deleteChatMessages,
    getLastMessageId,
    getConversations,
    putConversation,
    deleteConversation,
  };
})(window);
