/**
 * DurableQueueLayer.js
 * Phase 5 — Durable Queue Layer (Frontend)
 *
 * Unified queue for ALL pending operations — survives refresh, reconnect, app kill.
 * Queue types: message, media, status, call, sync, presence, notification, group.
 *
 * Integrates with existing OfflineMessageQueue (Phase 2) by extending it,
 * not replacing it. Adds IDB persistence, priorities, dead-letter, idempotency.
 *
 * Uses `nexopa_` prefix for all storage keys.
 *
 * @version 5.0.0
 * @phase 5 — Durable Queue
 */

(function () {
  'use strict';

  if (window.__DurableQueueLayer) return;

  const DB_NAME    = 'nexopa_dq_v1';
  const DB_VERSION = 1;

  // ─── Queue Priority ───────────────────────────────────────────────────────

  const QUEUE_PRIORITY = Object.freeze({
    CALL_SIGNAL: 9,
    MESSAGE:     7,
    STATUS:      5,
    MEDIA:       4,
    GROUP:       4,
    PRESENCE:    2,
    NOTIFICATION:1,
    SYNC:        1,
    ANALYTICS:   0,
  });

  const QUEUE_TYPE_PRIORITY = {
    call:         QUEUE_PRIORITY.CALL_SIGNAL,
    call_signal:  QUEUE_PRIORITY.CALL_SIGNAL,
    message:      QUEUE_PRIORITY.MESSAGE,
    reply:        QUEUE_PRIORITY.MESSAGE,
    reaction:     QUEUE_PRIORITY.MESSAGE,
    status:       QUEUE_PRIORITY.STATUS,
    media_upload: QUEUE_PRIORITY.MEDIA,
    group:        QUEUE_PRIORITY.GROUP,
    presence:     QUEUE_PRIORITY.PRESENCE,
    notification: QUEUE_PRIORITY.NOTIFICATION,
    sync:         QUEUE_PRIORITY.SYNC,
    analytics:    QUEUE_PRIORITY.ANALYTICS,
  };

  // ─── DeadLetterQueue ──────────────────────────────────────────────────────

  class DeadLetterQueue {
    constructor() {
      this._items = [];
      this._max   = 50;
    }

    add(op, reason) {
      this._items.push({ ...op, failedAt: Date.now(), reason });
      if (this._items.length > this._max) this._items.shift();
    }

    getAll()   { return [...this._items]; }
    count()    { return this._items.length; }
    clear()    { this._items = []; }
  }

  // ─── IdempotencyGuard ─────────────────────────────────────────────────────

  class IdempotencyGuard {
    constructor() {
      this._sent    = new Map(); // opId → ts
      this._window  = 10 * 60 * 1000; // 10 min
    }

    hasBeenSent(opId) {
      const now  = Date.now();
      for (const [k, ts] of this._sent) {
        if (now - ts > this._window) this._sent.delete(k);
      }
      return this._sent.has(opId);
    }

    markSent(opId) { this._sent.set(opId, Date.now()); }
  }

  // ─── IDB Queue Persistence ────────────────────────────────────────────────

  class IDBQueueStore {
    constructor() { this._db = null; }

    async open() {
      if (this._db) return this._db;
      // PHASE10: Fall back to localStorage when IDB unavailable (private browsing, iOS restrictions)
      if (!window.indexedDB) {
        this._fallback = true;
        return null;
      }
      return new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('ops')) {
              const store = db.createObjectStore('ops', { keyPath: 'id' });
              store.createIndex('priority',  'priority',  { unique: false });
              store.createIndex('queueType', 'queueType', { unique: false });
              store.createIndex('state',     'state',     { unique: false });
              store.createIndex('createdAt', 'createdAt', { unique: false });
            }
          };
          req.onsuccess = e => {
            this._db = e.target.result;
            // Account-switch isolation: release this connection the moment
            // authStorage.js's wipePreviousAccountData() tries to delete this
            // DB, otherwise deleteDatabase() blocks forever and this account's
            // durable op queue survives the switch silently.
            this._db.onversionchange = () => { try { this._db.close(); } catch (_) {} this._db = null; };
            resolve(this._db);
          };
          req.onerror   = e => {
            console.warn('[DurableQueue] IDB open failed, using localStorage fallback:', e.target.error);
            this._fallback = true;
            resolve(null); // non-fatal
          };
          req.onblocked = () => {
            console.warn('[DurableQueue] IDB blocked — resolving with null');
            this._fallback = true;
            resolve(null);
          };
        } catch (err) {
          console.warn('[DurableQueue] IDB exception, using localStorage fallback:', err.message);
          this._fallback = true;
          resolve(null);
        }
      });
    }

    async put(op) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction('ops', 'readwrite');
        tx.objectStore('ops').put(op);
        tx.oncomplete = () => resolve(op);
        tx.onerror    = e => reject(e.target.error);
      });
    }

    async remove(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('ops', 'readwrite');
        tx.objectStore('ops').delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror    = e => reject(e.target.error);
      });
    }

    async loadAll() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const req = db.transaction('ops', 'readonly').objectStore('ops').getAll();
        req.onsuccess = e => resolve(e.target.result || []);
        req.onerror   = e => reject(e.target.error);
      });
    }

    async countByState(state) {
      const all = await this.loadAll();
      return all.filter(op => op.state === state).length;
    }
  }

  // ─── QueueOperation ──────────────────────────────────────────────────────

  function createOp(type, payload, options = {}) {
    return {
      id:         options.id || 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      queueType:  type,
      priority:   options.priority ?? (QUEUE_TYPE_PRIORITY[type] || 1),
      payload:    payload,
      state:      'PENDING',
      attempts:   0,
      maxRetries: options.maxRetries ?? 8,
      createdAt:  Date.now(),
      updatedAt:  Date.now(),
      expiresAt:  Date.now() + (options.ttlMs || 24 * 60 * 60 * 1000),
      lastError:  null,
      idempotencyKey: options.idempotencyKey || null,
    };
  }

  // ─── DurableQueueLayer (main) ─────────────────────────────────────────────

  class DurableQueueLayer {
    constructor() {
      this._store     = new IDBQueueStore();
      this._dlq       = new DeadLetterQueue();
      this._idempotency = new IdempotencyGuard();
      this._ops       = new Map();  // in-memory index
      this._handlers  = new Map();  // queueType → async fn(op)
      this._timers    = new Map();  // opId → retryTimerId
      this._processing = false;
      this._listeners = [];
    }

    async init() {
      await this._hydrate();
      this._attachReconnectListener();

      // Prune expired ops every 5 min
      setInterval(() => this._pruneExpired(), 5 * 60 * 1000);

      console.log(`[DurableQueue] ✅ Initialized — ${this._ops.size} ops loaded`);
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Register a send handler for a queue type.
     * @param {string} type - Queue type (e.g. 'message', 'status')
     * @param {Function} handler - async fn(op) => void — throw on failure
     */
    registerHandler(type, handler) {
      this._handlers.set(type, handler);
    }

    /**
     * Enqueue an operation.
     * @param {string} type - Queue type
     * @param {*} payload - Operation data
     * @param {Object} options - { id, priority, maxRetries, ttlMs, idempotencyKey }
     * @returns {string} opId
     */
    async enqueue(type, payload, options = {}) {
      // Idempotency check
      const iKey = options.idempotencyKey || (payload?.id && `${type}:${payload.id}`);
      if (iKey && this._idempotency.hasBeenSent(iKey)) {
        console.debug(`[DurableQueue] Duplicate op suppressed: ${iKey}`);
        return null;
      }

      const op = createOp(type, payload, options);
      this._ops.set(op.id, op);
      await this._store.put(op).catch(() => {});

      this._notify(op);

      // Try immediately if online
      if (this._isOnline()) {
        this._execute(op.id);
      }

      return op.id;
    }

    /**
     * Mark operation as delivered (remove from queue).
     */
    async markDelivered(opId, iKey = null) {
      const op = this._ops.get(opId);
      if (!op) return;

      op.state    = 'DELIVERED';
      op.updatedAt = Date.now();

      if (iKey || op.idempotencyKey) {
        this._idempotency.markSent(iKey || op.idempotencyKey);
      }

      this._ops.delete(opId);
      this._cancelRetry(opId);
      await this._store.remove(opId).catch(() => {});
      this._notify(op);
    }

    /**
     * Flush all pending operations (call after reconnect).
     */
    async flushAll() {
      if (this._processing || !this._isOnline()) return 0;
      this._processing = true;

      const pending = Array.from(this._ops.values())
        .filter(op => op.state === 'PENDING' || op.state === 'FAILED')
        .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

      let flushed = 0;
      for (const op of pending) {
        await this._execute(op.id);
        await new Promise(r => setTimeout(r, 80)); // pace
        flushed++;
      }

      this._processing = false;
      return flushed;
    }

    getPending()    { return Array.from(this._ops.values()).filter(op => op.state === 'PENDING'); }
    getFailed()     { return Array.from(this._ops.values()).filter(op => op.state === 'FAILED'); }
    getDeadLetter() { return this._dlq.getAll(); }
    size()          { return this._ops.size; }

    onStateChange(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    getDiagnostics() {
      const byType  = {};
      const byState = {};
      for (const op of this._ops.values()) {
        byType[op.queueType]  = (byType[op.queueType]  || 0) + 1;
        byState[op.state]     = (byState[op.state]     || 0) + 1;
      }
      return {
        total:     this._ops.size,
        byType,
        byState,
        deadLetter: this._dlq.count(),
        handlers:  Array.from(this._handlers.keys()),
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    async _execute(opId) {
      const op = this._ops.get(opId);
      if (!op || op.state === 'SENDING' || op.state === 'DELIVERED') return;
      if (Date.now() > op.expiresAt) { await this._expire(opId); return; }

      const handler = this._handlers.get(op.queueType);
      if (!handler) {
        console.warn(`[DurableQueue] No handler for type: ${op.queueType}`);
        return;
      }

      op.state      = 'SENDING';
      op.attempts++;
      op.updatedAt  = Date.now();
      this._notify(op);

      try {
        await handler(op);
        await this.markDelivered(opId, op.idempotencyKey);
      } catch (err) {
        op.lastError = err?.message || String(err);
        op.state     = 'FAILED';
        op.updatedAt = Date.now();
        await this._store.put(op).catch(() => {});

        if (op.attempts >= op.maxRetries) {
          this._dlq.add(op, op.lastError);
          this._ops.delete(opId);
          await this._store.remove(opId).catch(() => {});
          console.warn(`[DurableQueue] Op ${opId} sent to DLQ after ${op.attempts} attempts`);
        } else {
          this._scheduleRetry(opId, op.attempts);
        }

        this._notify(op);
      }
    }

    _scheduleRetry(opId, attempts) {
      this._cancelRetry(opId);
      const delay = Math.min(1000 * Math.pow(2, attempts) + Math.random() * 1000, 60000);
      const tid   = setTimeout(() => {
        this._timers.delete(opId);
        if (this._isOnline()) this._execute(opId);
      }, delay);
      this._timers.set(opId, tid);
    }

    _cancelRetry(opId) {
      const tid = this._timers.get(opId);
      if (tid) { clearTimeout(tid); this._timers.delete(opId); }
    }

    async _expire(opId) {
      const op = this._ops.get(opId);
      if (!op) return;
      op.state = 'EXPIRED';
      this._ops.delete(opId);
      await this._store.remove(opId).catch(() => {});
      this._notify(op);
    }

    async _pruneExpired() {
      const now = Date.now();
      for (const [id, op] of this._ops) {
        if (op.expiresAt < now) await this._expire(id);
      }
    }

    async _hydrate() {
      try {
        const stored = await this._store.loadAll();
        const now    = Date.now();
        for (const op of stored) {
          if (op.expiresAt < now) { await this._store.remove(op.id); continue; }
          // Reset SENDING state from crash
          if (op.state === 'SENDING') op.state = 'PENDING';
          this._ops.set(op.id, op);
        }
      } catch (err) {
        console.warn('[DurableQueue] Hydration error:', err.message);
      }
    }

    _attachReconnectListener() {
      window.addEventListener('online', () => setTimeout(() => this.flushAll(), 1000));
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_CONNECTED', () => setTimeout(() => this.flushAll(), 1500));
      }
      window.addEventListener('kyn:recovery:state', e => {
        if (e.detail?.state === 'RECOVERED') setTimeout(() => this.flushAll(), 1000);
      });
    }

    _isOnline() {
      if (!navigator.onLine) return false;
      return window.KynectaRealtime?._socket?.connected || false;
    }

    _notify(op) {
      this._listeners.forEach(fn => { try { fn({ ...op }); } catch (_) {} });
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.emit('QUEUE_STATE_CHANGED', { opId: op.id, state: op.state, type: op.queueType }, { async: true });
      }
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const layer = new DurableQueueLayer();
  layer.init().then(() => {
    // Wire default handlers using existing infrastructure
    layer.registerHandler('message', async op => {
      const q = window.__OfflineMessageQueue;
      if (q) return q._sendHandler?.(op.payload);
      throw new Error('No send handler');
    });

    layer.registerHandler('presence', async op => {
      const socket = window.KynectaRealtime?._socket;
      if (!socket?.connected) throw new Error('Not connected');
      socket.emit('heartbeat', op.payload);
    });

    layer.registerHandler('sync', async () => {
      const bus = window.KynectaEventBus;
      if (bus) bus.emit('SYNC_STARTED', { reason: 'queue_flush' }, { async: true });
    });
  }).catch(e => console.warn('[DurableQueue] Init error:', e.message));

  window.__DurableQueueLayer = layer;
  window.DurableQueue        = layer;
  window.QUEUE_PRIORITY      = QUEUE_PRIORITY;

  console.log('[DurableQueue] ✅ Ready');
})();
