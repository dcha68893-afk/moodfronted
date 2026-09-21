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

  // Same account-detection rule as message-local-db.js (kept identical on purpose —
  // both caches must agree on "whose data is this"): persisted auth is the source of
  // truth, and a window whose in-memory user disagrees with it is stale (e.g. an
  // account was switched from another tab/iframe), so the cache is not used at all
  // rather than filing one account's fetched history under another's partition.
  function idFrom(u) { const id = u && (u.id || u.userId || u.uid || u._id); return id != null ? String(id) : null; }
  function currentUserId() {
    let stored = null, mem = null;
    try {
      try { const raw = localStorage.getItem('kynecta_auth'); if (raw) { const p = JSON.parse(raw); stored = idFrom(p && p.user ? p.user : p); } } catch (_) {}
      if (stored == null) {
        for (const key of ['currentUser', 'necpa_user', 'user']) {
          try { const raw = localStorage.getItem(key); if (!raw) continue; const p = JSON.parse(raw); const id = idFrom(p && p.user ? p.user : p); if (id != null) { stored = id; break; } } catch (_) {}
        }
      }
      if (global.currentUser) mem = idFrom(global.currentUser);
      if (mem == null && global.AuthStorage && typeof global.AuthStorage.getUser === 'function') mem = idFrom(global.AuthStorage.getUser());
    } catch (_) {}
    if (stored != null && mem != null && stored !== mem) return null;
    return stored != null ? stored : mem;
  }
  // Transient UI flags that must never be persisted.
  const TRANSIENT_FIELDS = ['_decryptPending', '_error', '_hint', '_autoTries', '_readinessWait', '_optimistic'];
  function forDisk(message) {
    const out = Object.assign({}, message);
    TRANSIENT_FIELDS.forEach((f) => { delete out[f]; });
    return out;
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
    // NEVER STORE WHAT WE COULD NOT READ: a row whose decryption is still pending
    // carries only the raw envelope. Group sender-key ratchets are one-way, so a
    // message that is not decrypted in this session may never be decryptable again;
    // writing the envelope over a row that already holds plaintext (same key) used to
    // destroy the only readable copy. Pending rows are skipped entirely — the next
    // successful decrypt writes the real one.
    const writable = messages.filter((m) => m && !m._decryptPending && !m._optimistic && (m.id != null || m.messageId != null));
    if (!writable.length) return;
    const ctx = await withStore('readwrite');
    if (!ctx) return;
    for (const message of writable) {
      // One bad row (e.g. a non-cloneable value) must not abort the rest of the batch.
      try {
        const id = message.id != null ? message.id : message.messageId;
        const key = msgKey(accountId, groupId, id);
        ctx.store.put({ key, accountId, groupId: String(groupId), id, message: forDisk(message) });
      } catch (_) {}
    }
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
