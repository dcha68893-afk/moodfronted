/**
 * Kynecta E2E storage layer v2.
 *
 * REDESIGN GOAL: eliminate "message sent before a key/session reset becomes
 * permanently unreadable" as a routine failure mode, the way Signal/WhatsApp
 * do it — not by making resets impossible (forward secrecy means old keys
 * are intentionally unrecoverable once discarded), but by making resets RARE
 * and RECOVERABLE:
 *
 *   1. Durable storage: IndexedDB instead of localStorage. localStorage is
 *      cleared by "Clear browsing data", private-mode exit, low-disk
 *      eviction, and some browser/extension "site data" cleanups that don't
 *      touch IndexedDB the same way. Not indestructible, but meaningfully
 *      more durable, and with far higher quota so nothing gets silently
 *      dropped for space.
 *   2. Recoverable: a password-protected encrypted backup export/import, so
 *      even a genuine storage wipe (new device, reinstalled browser) can be
 *      recovered from instead of permanently losing history — this is the
 *      actual mechanism WhatsApp/Signal use (backup key / PIN-wrapped
 *      backup), not a smarter ratchet.
 *   3. Never silently discard: anything this module would otherwise
 *      overwrite is archived first (see archiveBeforeOverwrite), so a
 *      version-migration bug or a bad isNewBootstrap() decision doesn't
 *      turn into instant, undiagnosable, unrecoverable data loss the way it
 *      could when saveState() just clobbered the localStorage key directly.
 *
 * This module is intentionally a plain async key/value store with the same
 * key-namespacing e2e-session-init.js already uses (kyn_x3dh_sessions_v7_*,
 * kyn_x3dh_prekeys_v1_*, kyn_x3dh_sent_cache_v1_*, etc) so it's a drop-in
 * replacement for the localStorage.getItem/setItem calls there, not a
 * parallel system.
 */
(function () {
  'use strict';

  const DB_NAME = 'kynecta-e2e-store-v2';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const ARCHIVE_STORE = 'archive';
  const MIGRATION_FLAG = 'kyn_e2e_store_v2_migrated';

  let _dbPromise = null;
  function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(ARCHIVE_STORE)) db.createObjectStore(ARCHIVE_STORE, { autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  async function idbGet(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result != null ? r.result : null);
        r.onerror = () => reject(r.error);
      });
    } catch (_) { return null; }
  }

  async function idbSet(key, value) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) { return false; }
  }

  async function idbDelete(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) { return false; }
  }

  async function idbAllKeys() {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).getAllKeys();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => reject(r.error);
      });
    } catch (_) { return []; }
  }

  async function idbArchive(key, value) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(ARCHIVE_STORE, 'readwrite');
        tx.objectStore(ARCHIVE_STORE).add({ key, value, archivedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) { return false; }
  }

  // ── Public KV API (async — the drop-in replacement for localStorage) ──────
  async function get(key) { return idbGet(key); }
  async function set(key, value) { return idbSet(key, value); }
  async function del(key) { return idbDelete(key); }
  async function keys() { return idbAllKeys(); }

  // Archives the current value under `key` before it gets overwritten, so an
  // unexpected/incorrect overwrite (bad migration, a bootstrap-mismatch
  // false positive, a future bug) is a support ticket instead of a silent,
  // permanent loss. Archive entries are never read automatically — they're
  // a manual recovery path only (see recoverArchived below).
  async function archiveBeforeOverwrite(key) {
    const existing = await idbGet(key);
    if (existing != null) await idbArchive(key, existing);
  }

  async function recoverArchived(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(ARCHIVE_STORE, 'readonly');
        const out = [];
        const r = tx.objectStore(ARCHIVE_STORE).openCursor();
        r.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) { resolve(out); return; }
          if (cursor.value && cursor.value.key === key) out.push(cursor.value);
          cursor.continue();
        };
        r.onerror = () => reject(r.error);
      });
    } catch (_) { return []; }
  }

  // ── One-time migration from localStorage ───────────────────────────────
  // Copies every key this app's E2E code has ever used into IndexedDB, but
  // deliberately does NOT delete the localStorage originals — leaving them
  // in place is free insurance against a migration bug, and localStorage
  // reads/writes for these keys are no longer on the hot path once this
  // module is wired in (e2e-session-init.js is patched to call get/set here
  // instead), so leftover localStorage copies are harmless, just stale.
  const MIGRATE_PREFIXES = ['kyn_x3dh_', 'kyn_e2e_'];
  async function migrateFromLocalStorageOnce() {
    try {
      if (localStorage.getItem(MIGRATION_FLAG) === '1') return;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (!MIGRATE_PREFIXES.some(p => key.startsWith(p))) continue;
        const existing = await idbGet(key);
        if (existing == null) await idbSet(key, localStorage.getItem(key));
      }
      localStorage.setItem(MIGRATION_FLAG, '1');
    } catch (e) { console.warn('[E2E/store-v2] migration skipped:', e?.message || e); }
  }

  // ── Encrypted backup / restore ──────────────────────────────────────────
  // Password-derived AES-256-GCM export of everything this module manages —
  // the actual answer to "a device/browser reset shouldn't mean lost
  // history forever". The backup file never contains the password itself;
  // losing the password makes the backup as unrecoverable as the live data
  // would have been, same tradeoff Signal/WhatsApp make with their PIN.
  async function deriveBackupKey(password, salt) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }
  const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function exportBackup(password) {
    if (!password) throw new Error('backup password required');
    const allKeys = await idbAllKeys();
    const payload = {};
    for (const k of allKeys) payload[k] = await idbGet(k);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(password, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
    return {
      v: 1,
      createdAt: new Date().toISOString(),
      salt: b64(salt),
      iv: b64(iv),
      ct: b64(ct),
    };
  }

  // Triggers a browser download of the backup — the simplest, most portable
  // "restore on a new device" story without needing new server endpoints.
  // (A server-stored backup blob, so restore doesn't require finding the
  // downloaded file, is a reasonable Phase-1.5 addition once this is
  // validated — see the accompanying write-up.)
  async function downloadBackup(password) {
    const backup = await exportBackup(password);
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kynecta-e2e-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function importBackup(backupJsonOrObject, password) {
    const backup = typeof backupJsonOrObject === 'string' ? JSON.parse(backupJsonOrObject) : backupJsonOrObject;
    if (!backup || backup.v !== 1) throw new Error('unrecognized backup format');
    const salt = unb64(backup.salt);
    const iv = unb64(backup.iv);
    const key = await deriveBackupKey(password, salt);
    let plaintext;
    try {
      plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, unb64(backup.ct));
    } catch (_) {
      throw new Error('wrong password, or backup file is corrupted');
    }
    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    for (const [k, v] of Object.entries(payload)) {
      await archiveBeforeOverwrite(k); // never blindly clobber whatever's already here
      await idbSet(k, v);
    }
    try { document.dispatchEvent(new CustomEvent('kyn:e2eUnlocked')); } catch (_) {}
    return { restoredKeys: Object.keys(payload).length };
  }

  // ── Stable per-install device identifier (Phase 2: multi-device) ────────
  // Generated once, persisted in the durable store, and reused for the
  // lifetime of this browser/install — this is what lets the server tell
  // "your phone" and "your laptop" apart as two different devices to fan
  // messages out to, the same concept as Signal's "linked devices".
  async function getOrCreateDeviceId() {
    const key = 'kyn_e2e_device_id_v1';
    let id = await idbGet(key);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await idbSet(key, id);
    }
    return id;
  }

  window.KynectaE2EStore = {
    get, set, del, keys,
    archiveBeforeOverwrite, recoverArchived,
    migrateFromLocalStorageOnce,
    exportBackup, downloadBackup, importBackup,
    getOrCreateDeviceId,
  };

  migrateFromLocalStorageOnce();
})();
