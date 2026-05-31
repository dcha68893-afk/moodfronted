/**
 * OfflineMessageQueue.js
 * Phase 2 — Offline Queue Engine (Frontend)
 *
 * Queues messages when offline.  Messages:
 *  - Appear in UI instantly (optimistic render)
 *  - Persist in IndexedDB across restarts
 *  - Auto-send when connectivity restores
 *  - Preserve strict order
 *  - Never duplicate on retry
 *
 * @version 2.0.0
 * @phase 2 — Offline Queue
 */

(function () {
  'use strict';

  if (window.__OfflineMessageQueue) return;

  const DB_NAME    = 'kyn_offline_queue';
  const DB_VERSION = 2;
  const STORE_NAME = 'pending_messages';

  const PRIORITY = Object.freeze({ HIGH: 3, MEDIUM: 2, LOW: 1 });

  const MSG_TYPE_PRIORITY = {
    call:         PRIORITY.HIGH,
    call_signal:  PRIORITY.HIGH,
    call_ack:     PRIORITY.HIGH,
    message:      PRIORITY.MEDIUM,
    reply:        PRIORITY.MEDIUM,
    reaction:     PRIORITY.MEDIUM,
    read_receipt: PRIORITY.MEDIUM,
    presence:     PRIORITY.LOW,
    typing:       PRIORITY.LOW,
    analytics:    PRIORITY.LOW,
  };

  // ─── IndexedDB persistence layer ─────────────────────────────────────────

  class QueuePersistence {
    constructor() {
      this._db = null;
    }

    async open() {
      if (this._db) return this._db;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
          const db    = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('priority',  'priority',  { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
            store.createIndex('chatId',    'chatId',    { unique: false });
          }
        };
        req.onsuccess = e => { this._db = e.target.result; resolve(this._db); };
        req.onerror   = e => reject(e.target.error);
      });
    }

    async save(entry) {
      const db    = await this.open();
      return new Promise((resolve, reject) => {
        const tx    = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req   = store.put(entry);
        req.onsuccess = () => resolve(entry);
        req.onerror   = e => reject(e.target.error);
      });
    }

    async remove(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx    = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req   = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror   = e => reject(e.target.error);
      });
    }

    async loadAll() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx    = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req   = store.getAll();
        req.onsuccess = e => resolve(e.target.result || []);
        req.onerror   = e => reject(e.target.error);
      });
    }

    async clear() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx    = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req   = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror   = e => reject(e.target.error);
      });
    }

    async count() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx    = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req   = store.count();
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
      });
    }
  }

  // ─── RetryScheduler ─────────────────────────────────────────────────────

  class RetryScheduler {
    constructor() {
      this._timers = new Map();
      this._baseMs = 2000;
      this._maxMs  = 60000;
    }

    schedule(id, attempts, fn) {
      const delay = Math.min(this._baseMs * Math.pow(2, attempts), this._maxMs);
      if (this._timers.has(id)) clearTimeout(this._timers.get(id));
      const tid = setTimeout(() => {
        this._timers.delete(id);
        fn();
      }, delay);
      this._timers.set(id, tid);
      return delay;
    }

    cancel(id) {
      if (this._timers.has(id)) { clearTimeout(this._timers.get(id)); this._timers.delete(id); }
    }

    cancelAll() {
      for (const tid of this._timers.values()) clearTimeout(tid);
      this._timers.clear();
    }
  }

  // ─── OfflineMessageQueue (main) ──────────────────────────────────────────

  class OfflineMessageQueue {
    constructor() {
      this._persistence = new QueuePersistence();
      this._scheduler   = new RetryScheduler();
      this._queue       = new Map();     // id -> entry
      this._processing  = false;
      this._listeners   = [];
      this._sendHandler = null;          // set by caller: async fn(entry) => void
      this._maxRetries  = 8;
      this._expireMs    = 24 * 60 * 60 * 1000; // 24h
    }

    async init() {
      await this._hydrate();
      this._attachNetworkListener();
      console.log(`[OfflineQueue] ✅ Initialized — ${this._queue.size} queued`);
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Register the function that actually sends a message over the network.
     * Must return a Promise. Throw on failure.
     */
    setSendHandler(fn) { this._sendHandler = fn; }

    /**
     * Enqueue a message for delivery.
     * Returns the entry. Message appears in UI optimistically immediately.
     */
    async enqueue(msg) {
      const entry = {
        id:        msg.localId || msg.id || this._genId(),
        chatId:    msg.chatId  || msg.conversationId || null,
        type:      msg.type    || 'message',
        priority:  MSG_TYPE_PRIORITY[msg.type] || PRIORITY.MEDIUM,
        payload:   msg,
        state:     'QUEUED',
        attempts:  0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + this._expireMs,
      };

      this._queue.set(entry.id, entry);
      await this._persistence.save(entry);
      this._notify(entry);

      // If online, try immediately
      if (this._isOnline()) {
        this._trySend(entry.id);
      }

      return entry;
    }

    /**
     * Mark a queued message as delivered (remove from queue).
     */
    async markDelivered(id) {
      const entry = this._queue.get(id);
      if (!entry) return;
      entry.state = 'DELIVERED';
      this._queue.delete(id);
      this._scheduler.cancel(id);
      await this._persistence.remove(id);
      this._notify(entry);
    }

    /**
     * Flush all queued messages now (call after reconnect).
     */
    async flushAll() {
      if (!this._isOnline() || this._processing) return;
      this._processing = true;

      const sorted = Array.from(this._queue.values())
        .filter(e => e.state !== 'SENDING' && e.state !== 'DELIVERED')
        .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

      for (const entry of sorted) {
        await this._trySend(entry.id);
        // Brief pause between sends to avoid overwhelming server
        await new Promise(r => setTimeout(r, 100));
      }

      this._processing = false;
    }

    getPending()   { return Array.from(this._queue.values()).filter(e => e.state === 'QUEUED'); }
    getFailed()    { return Array.from(this._queue.values()).filter(e => e.state === 'FAILED'); }
    size()         { return this._queue.size; }

    onStateChange(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    getDiagnostics() {
      return {
        total:     this._queue.size,
        queued:    this.getPending().length,
        failed:    this.getFailed().length,
        sending:   Array.from(this._queue.values()).filter(e => e.state === 'SENDING').length,
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    async _trySend(id) {
      const entry = this._queue.get(id);
      if (!entry || entry.state === 'SENDING' || entry.state === 'DELIVERED') return;

      // Expiry check
      if (Date.now() > entry.expiresAt) {
        entry.state = 'EXPIRED';
        this._queue.delete(id);
        await this._persistence.remove(id);
        return;
      }

      if (!this._sendHandler) {
        console.warn('[OfflineQueue] No send handler registered');
        return;
      }

      entry.state    = 'SENDING';
      entry.attempts++;
      entry.updatedAt = Date.now();
      this._notify(entry);

      try {
        // PHASE11: Route through COR if available, otherwise use setSendHandler
        let sent = false;
        const cor = window.__COR;
        if (cor && !this._sendHandler) {
          const event = entry.payload?._event || (entry.payload?.groupId ? 'group:message:send' : 'message:send');
          const result = await cor.send(event, entry.payload, { type: 'message' }).catch(() => null);
          sent = result?.ok === true;
        }
        if (!sent && this._sendHandler) {
          await this._sendHandler(entry.payload);
          sent = true;
        }
        if (!sent) throw new Error('No send handler available');
        await this.markDelivered(id);

        // Update UI delivery status when queue item is sent
        try {
          const localId = entry.payload?.localId || entry.payload?.id || id;
          const chatId  = entry.payload?.chatId  || entry.payload?.conversationId;
          const ChatManager = window.ChatManager || window.KynectaChatManager;
          if (localId && ChatManager?.updateMessageStatus) {
            ChatManager.updateMessageStatus(localId, 'sent', {
              localId, chatId, optimistic: false, isLocalOnly: false,
            });
          }
          // PHASE11: Record in COR delivery pipeline
          window.__COR?.delivery?.(localId, 'ACKED', { transport: 'OFFLINE_FLUSH' });
        } catch (_) {}

      } catch (err) {
        entry.state    = entry.attempts >= this._maxRetries ? 'FAILED' : 'QUEUED';
        entry.lastError = err?.message || String(err);
        entry.updatedAt = Date.now();
        this._notify(entry);

        if (entry.state === 'QUEUED') {
          this._scheduler.schedule(id, entry.attempts, () => this._trySend(id));
        } else {
          // Final failure — keep in IDB so user can see/retry manually
          await this._persistence.save(entry);
        }
      }
    }

    async _hydrate() {
      try {
        const entries = await this._persistence.loadAll();
        const now = Date.now();
        for (const entry of entries) {
          if (entry.expiresAt && now > entry.expiresAt) {
            await this._persistence.remove(entry.id);
            continue;
          }
          entry.state = 'QUEUED'; // reset SENDING state from crash
          this._queue.set(entry.id, entry);
        }
      } catch (err) {
        console.warn('[OfflineQueue] Hydration error:', err.message);
      }
    }

    _attachNetworkListener() {
      window.addEventListener('online', () => this.flushAll());
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_CONNECTED', () => setTimeout(() => this.flushAll(), 1000));
        bus.on('SOCKET_EVENT', payload => {
          if (payload?.type === 'socket:reconnected' || payload?.type === 'socket:connected') {
            setTimeout(() => this.flushAll(), 1000);
          }
        });
      }
    }

    _isOnline() {
      if (!navigator.onLine) return false;
      const netState = window.__networkState;
      if (netState && !netState.internetAvailable) return false;
      const socket = window.KynectaRealtime?._socket;
      return socket ? socket.connected : true;
    }

    _notify(entry) {
      for (const fn of this._listeners) {
        try { fn({ ...entry }); } catch (_) {}
      }
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.emit('SOCKET_EVENT', {
          type:    'queue:state_changed',
          id:      entry.id,
          state:   entry.state,
          chatId:  entry.chatId,
        }, { async: true });
      }
    }

    _genId() {
      return 'omq_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const queue = new OfflineMessageQueue();
  queue.init().catch(e => console.warn('[OfflineQueue] Init error:', e.message));

  window.__OfflineMessageQueue = queue;
  window.OfflineQueue = queue;

  console.log('[OfflineQueue] ✅ Ready');
})();
