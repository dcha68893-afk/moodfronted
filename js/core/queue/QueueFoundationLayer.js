/**
 * QueueFoundationLayer.js
 * Phase 1 — Operation Queue Foundation
 *
 * Defines architecture, tracks pending operations, exposes retry hooks.
 * DOES NOT reroute operations, implement mesh retry, or peer relay.
 *
 * @version 1.0.0
 * @phase 1 — Foundation Stabilization
 */

(function () {
  'use strict';

  if (window.__QueueFoundationLayer) {
    console.log('[QueueFoundation] Already initialized — skipping.');
    return;
  }

  // ─── Delivery States ─────────────────────────────────────────────────────────

  const DELIVERY_STATE = Object.freeze({
    PENDING:   'PENDING',
    SENDING:   'SENDING',
    SENT:      'SENT',
    DELIVERED: 'DELIVERED',
    READ:      'READ',
    FAILED:    'FAILED',
    RETRYING:  'RETRYING',
    EXPIRED:   'EXPIRED',
  });

  const MAX_RETRIES = 5;
  const RETRY_BASE_DELAY_MS = 2000;
  const RETRY_MAX_DELAY_MS = 60000;
  const EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  // ─── PendingOperationRegistry ────────────────────────────────────────────────

  class PendingOperationRegistry {
    constructor() {
      this._ops = new Map(); // opId -> operation
    }

    register(op) {
      const entry = {
        ...op,
        state: DELIVERY_STATE.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attempts: 0,
        lastError: null,
      };
      this._ops.set(op.id, entry);
      return entry;
    }

    get(id) { return this._ops.get(id) || null; }

    setState(id, state, meta = {}) {
      const op = this._ops.get(id);
      if (!op) return false;
      op.state = state;
      op.updatedAt = Date.now();
      Object.assign(op, meta);
      return true;
    }

    remove(id) { this._ops.delete(id); }

    getAll(filterState = null) {
      const ops = Array.from(this._ops.values());
      if (filterState) return ops.filter((o) => o.state === filterState);
      return ops;
    }

    getPending() { return this.getAll(DELIVERY_STATE.PENDING); }
    getFailed() { return this.getAll(DELIVERY_STATE.FAILED); }
    getRetrying() { return this.getAll(DELIVERY_STATE.RETRYING); }

    pruneExpired() {
      const now = Date.now();
      let pruned = 0;
      for (const [id, op] of this._ops) {
        if (now - op.createdAt > EXPIRY_MS) {
          op.state = DELIVERY_STATE.EXPIRED;
          this._ops.delete(id);
          pruned++;
        }
      }
      return pruned;
    }

    size() { return this._ops.size; }
  }

  // ─── RetryCoordinator ───────────────────────────────────────────────────────

  class RetryCoordinator {
    constructor(registry) {
      this._registry = registry;
      this._retryHandlers = new Map(); // opType -> handler fn
      this._timers = new Map(); // opId -> timeoutId
    }

    /**
     * Register a retry handler for a given operation type.
     * The handler receives the operation and should return a Promise.
     */
    register(opType, handler) {
      this._retryHandlers.set(opType, handler);
    }

    scheduleRetry(opId) {
      const op = this._registry.get(opId);
      if (!op) return;

      if (op.attempts >= MAX_RETRIES) {
        this._registry.setState(opId, DELIVERY_STATE.FAILED, {
          lastError: `Max retries (${MAX_RETRIES}) reached`,
        });
        return;
      }

      const delay = Math.min(
        RETRY_BASE_DELAY_MS * Math.pow(2, op.attempts),
        RETRY_MAX_DELAY_MS
      );

      this._registry.setState(opId, DELIVERY_STATE.RETRYING, {
        attempts: op.attempts + 1,
        nextRetryAt: Date.now() + delay,
      });

      // Cancel any existing timer
      if (this._timers.has(opId)) clearTimeout(this._timers.get(opId));

      const tid = setTimeout(() => {
        this._timers.delete(opId);
        this._execute(opId);
      }, delay);

      this._timers.set(opId, tid);
    }

    cancelRetry(opId) {
      const tid = this._timers.get(opId);
      if (tid) {
        clearTimeout(tid);
        this._timers.delete(opId);
      }
    }

    async _execute(opId) {
      const op = this._registry.get(opId);
      if (!op) return;

      const handler = this._retryHandlers.get(op.type);
      if (!handler) {
        console.warn(`[QueueFoundation] No retry handler for type: ${op.type}`);
        this._registry.setState(opId, DELIVERY_STATE.FAILED, {
          lastError: 'No retry handler registered',
        });
        return;
      }

      this._registry.setState(opId, DELIVERY_STATE.SENDING);

      try {
        await handler(op);
        this._registry.setState(opId, DELIVERY_STATE.SENT);
      } catch (err) {
        const op2 = this._registry.get(opId);
        if (op2 && op2.attempts < MAX_RETRIES) {
          this.scheduleRetry(opId);
        } else {
          this._registry.setState(opId, DELIVERY_STATE.FAILED, {
            lastError: err?.message || String(err),
          });
        }
      }
    }
  }

  // ─── DeliveryStateTracker ────────────────────────────────────────────────────

  class DeliveryStateTracker {
    constructor(registry) {
      this._registry = registry;
      this._listeners = new Map(); // opId -> Set<fn>
      this._globalListeners = [];
    }

    /**
     * Watch delivery state changes for a specific operation.
     */
    watch(opId, fn) {
      if (!this._listeners.has(opId)) this._listeners.set(opId, new Set());
      this._listeners.get(opId).add(fn);
      return () => {
        const set = this._listeners.get(opId);
        if (set) set.delete(fn);
      };
    }

    /**
     * Watch all delivery state changes.
     */
    watchAll(fn) {
      this._globalListeners.push(fn);
      return () => { this._globalListeners = this._globalListeners.filter((l) => l !== fn); };
    }

    notify(opId, newState, op) {
      const listeners = this._listeners.get(opId);
      if (listeners) {
        for (const fn of listeners) {
          try { fn(newState, op); } catch (_) {}
        }
      }
      for (const fn of this._globalListeners) {
        try { fn(opId, newState, op); } catch (_) {}
      }

      // Broadcast via event bus
      const bus = window.KynectaEventBus || window.appEvents;
      if (bus) {
        bus.emit('queue:state_changed', { opId, state: newState, op }, { async: true });
      }
    }
  }

  // ─── OperationQueueManager (main) ────────────────────────────────────────────

  class OperationQueueManager {
    constructor() {
      this._registry = new PendingOperationRegistry();
      this._delivery = new DeliveryStateTracker(this._registry);
      this._retry = new RetryCoordinator(this._registry);
      this._processInterval = null;
    }

    start() {
      // Prune expired operations every 30s
      this._processInterval = setInterval(() => {
        const pruned = this._registry.pruneExpired();
        if (pruned > 0) {
          console.log(`[QueueFoundation] Pruned ${pruned} expired operations`);
        }
      }, 30000);

      // On reconnect, retry all FAILED / RETRYING operations
      window.addEventListener('message', (e) => {
        if (!e.data) return;
        const type = e.data.type || (e.data.event && e.data.event.type);
        if (type === 'SOCKET_CONNECTED' || type === 'socket:reconnected') {
          this._retryFailed();
        }
      });

      const bus = window.KynectaEventBus || window.appEvents;
      if (bus) {
        bus.on('SOCKET_EVENT', (payload) => {
          if (payload?.type === 'socket:reconnected' || payload?.type === 'socket:connected') {
            this._retryFailed();
          }
        });
      }

      console.log('[QueueFoundation] ✅ Started');
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Enqueue a new operation.
     * @param {Object} op - { id, type, payload, ...}
     */
    enqueue(op) {
      if (!op.id) op.id = 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const entry = this._registry.register(op);
      this._delivery.notify(op.id, DELIVERY_STATE.PENDING, entry);
      return op.id;
    }

    setState(opId, state, meta = {}) {
      const ok = this._registry.setState(opId, state, meta);
      if (ok) {
        const op = this._registry.get(opId);
        this._delivery.notify(opId, state, op);
      }
    }

    /**
     * Register a retry handler for an operation type.
     * @param {string} opType - e.g. 'message', 'read_receipt', 'presence'
     * @param {Function} handler - async fn(op) => void
     */
    registerRetryHandler(opType, handler) {
      this._retry.register(opType, handler);
    }

    markFailed(opId, error) {
      this.setState(opId, DELIVERY_STATE.FAILED, { lastError: error?.message || String(error) });
      this._retry.scheduleRetry(opId);
    }

    markDelivered(opId) {
      this.setState(opId, DELIVERY_STATE.DELIVERED);
      this._registry.remove(opId);
    }

    markRead(opId) {
      this.setState(opId, DELIVERY_STATE.READ);
      this._registry.remove(opId);
    }

    watchOp(opId, fn) { return this._delivery.watch(opId, fn); }
    watchAll(fn) { return this._delivery.watchAll(fn); }

    getPending() { return this._registry.getPending(); }
    getFailed() { return this._registry.getFailed(); }

    getDiagnostics() {
      return {
        total: this._registry.size(),
        byState: Object.values(DELIVERY_STATE).reduce((acc, s) => {
          acc[s] = this._registry.getAll(s).length;
          return acc;
        }, {}),
      };
    }

    // ── Private ────────────────────────────────────────────────────────────────

    _retryFailed() {
      const failed = this._registry.getFailed();
      if (!failed.length) return;
      console.log(`[QueueFoundation] Retrying ${failed.length} failed operations after reconnect`);
      for (const op of failed) {
        this._retry.scheduleRetry(op.id);
      }
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────────

  const layer = new OperationQueueManager();
  layer.start();

  window.__QueueFoundationLayer = layer;
  window.OperationQueue = layer;
  window.DELIVERY_STATE = DELIVERY_STATE;

  console.log('[QueueFoundation] ✅ Ready');
})();
