/**
 * ReliableDeliveryEngine.js
 * Phase 2 — Reliable Message Delivery Engine (Frontend)
 *
 * Implements true guaranteed delivery:
 *  - Full delivery state machine per message
 *  - ACK tracking with timeout retry
 *  - Deduplication on receive
 *  - UI state sync for every state transition
 *
 * Delivery states:
 *   CREATED → QUEUED → ROUTING → RELAYED → DELIVERED_TO_DEVICE
 *   → DELIVERED_TO_CLIENT → SEEN → FAILED | RETRYING | EXPIRED
 *
 * @version 2.0.0
 * @phase 2 — Reliable Delivery
 */

(function () {
  'use strict';

  if (window.__ReliableDeliveryEngine) return;

  const DELIVERY = Object.freeze({
    CREATED:              'CREATED',
    QUEUED:               'QUEUED',
    ROUTING:              'ROUTING',
    RELAYED:              'RELAYED',
    DELIVERED_TO_DEVICE:  'DELIVERED_TO_DEVICE',
    DELIVERED_TO_CLIENT:  'DELIVERED_TO_CLIENT',
    SEEN:                 'SEEN',
    FAILED:               'FAILED',
    RETRYING:             'RETRYING',
    EXPIRED:              'EXPIRED',
  });

  const ACK_TIMEOUT_MS   = 15000;
  const MAX_ACK_RETRIES  = 5;
  const DEDUP_WINDOW_MS  = 120000;

  // ─── DeliveryStateTracker ────────────────────────────────────────────────

  class DeliveryStateTracker {
    constructor() {
      // messageId -> { state, transport, attempts, timestamps, localId, chatId }
      this._messages  = new Map();
      this._listeners = new Map(); // messageId -> [fn]
      this._global    = [];
    }

    register(msg) {
      const entry = {
        id:         msg.id || msg.localId,
        localId:    msg.localId || msg.id,
        serverId:   msg.serverId || null,
        chatId:     msg.chatId,
        state:      DELIVERY.CREATED,
        transport:  null,
        attempts:   0,
        timestamps: { created: Date.now() },
        lastError:  null,
      };
      this._messages.set(entry.id, entry);
      return entry;
    }

    transition(id, newState, meta = {}) {
      const entry = this._messages.get(id);
      if (!entry) return null;

      const prev  = entry.state;
      entry.state = newState;
      entry.timestamps[newState.toLowerCase()] = Date.now();
      Object.assign(entry, meta);

      this._emit(id, { ...entry, prev });
      return entry;
    }

    get(id)   { return this._messages.get(id) || null; }
    remove(id) { this._messages.delete(id); }

    watch(id, fn) {
      if (!this._listeners.has(id)) this._listeners.set(id, []);
      this._listeners.get(id).push(fn);
      return () => {
        const arr = this._listeners.get(id);
        if (arr) this._listeners.set(id, arr.filter(l => l !== fn));
      };
    }

    watchAll(fn) {
      this._global.push(fn);
      return () => { this._global = this._global.filter(l => l !== fn); };
    }

    _emit(id, entry) {
      (this._listeners.get(id) || []).forEach(fn => { try { fn(entry); } catch (_) {} });
      this._global.forEach(fn => { try { fn(entry); } catch (_) {} });
      // Sync delivery icon in UI via EventBus
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.emit('MESSAGE_DELIVERED', {
          messageId: id,
          localId:   entry.localId,
          state:     entry.state,
          chatId:    entry.chatId,
        }, { async: true });
      }
    }

    getByChat(chatId) {
      return Array.from(this._messages.values()).filter(m => m.chatId === chatId);
    }

    snapshot() {
      return {
        total:    this._messages.size,
        byState:  Object.values(DELIVERY).reduce((acc, s) => {
          acc[s] = Array.from(this._messages.values()).filter(m => m.state === s).length;
          return acc;
        }, {}),
      };
    }
  }

  // ─── AckManager ─────────────────────────────────────────────────────────

  class AckManager {
    constructor(tracker) {
      this._tracker  = tracker;
      this._pending  = new Map(); // messageId -> { timer, attempts }
      this._retryFns = new Map(); // messageId -> retry fn
    }

    expectAck(messageId, retryFn) {
      this._retryFns.set(messageId, retryFn);
      this._scheduleTimeout(messageId, 0);
    }

    ack(messageId) {
      const p = this._pending.get(messageId);
      if (p) { clearTimeout(p.timer); this._pending.delete(messageId); }
      this._retryFns.delete(messageId);
      this._tracker.transition(messageId, DELIVERY.DELIVERED_TO_DEVICE);
    }

    cancel(messageId) {
      const p = this._pending.get(messageId);
      if (p) { clearTimeout(p.timer); this._pending.delete(messageId); }
      this._retryFns.delete(messageId);
    }

    _scheduleTimeout(messageId, attempts) {
      const timer = setTimeout(() => {
        this._pending.delete(messageId);
        const retry = this._retryFns.get(messageId);
        if (!retry) return;

        if (attempts >= MAX_ACK_RETRIES) {
          this._tracker.transition(messageId, DELIVERY.FAILED, { lastError: 'ACK timeout' });
          this._retryFns.delete(messageId);
          return;
        }

        this._tracker.transition(messageId, DELIVERY.RETRYING, { attempts: attempts + 1 });
        retry(attempts + 1);
        this._scheduleTimeout(messageId, attempts + 1);
      }, ACK_TIMEOUT_MS);

      this._pending.set(messageId, { timer, attempts });
    }
  }

  // ─── InboundDeduplicator ─────────────────────────────────────────────────

  class InboundDeduplicator {
    constructor() {
      this._seen = new Map();
    }

    isDuplicate(messageId) {
      const now  = Date.now();
      const last = this._seen.get(messageId);

      // Prune old
      for (const [id, ts] of this._seen) {
        if (now - ts > DEDUP_WINDOW_MS) this._seen.delete(id);
      }

      if (last) return true;
      this._seen.set(messageId, now);
      return false;
    }
  }

  // ─── ReliableDeliveryEngine (main) ──────────────────────────────────────

  class ReliableDeliveryEngine {
    constructor() {
      this._tracker    = new DeliveryStateTracker();
      this._ack        = new AckManager(this._tracker);
      this._dedup      = new InboundDeduplicator();
    }

    start() {
      this._attachSocketListeners();
      console.log('[ReliableDelivery] ✅ Started');
    }

    // ── Sender API ──────────────────────────────────────────────────────────

    /**
     * Track a message being sent.
     * Returns the tracked entry.
     */
    trackSend(msg) {
      const entry = this._tracker.register(msg);
      this._tracker.transition(entry.id, DELIVERY.QUEUED);
      return entry;
    }

    /**
     * Call when message is actually transmitted.
     */
    markSending(id, transport) {
      this._tracker.transition(id, DELIVERY.ROUTING, { transport });
    }

    /**
     * Call when server acknowledges receipt.
     */
    onAck(messageId) {
      this._ack.ack(messageId);
    }

    /**
     * Expect an ACK for this message. retryFn is called on timeout.
     */
    expectAck(messageId, retryFn) {
      this._ack.expectAck(messageId, retryFn);
    }

    /**
     * Mark a message as read (seen by recipient).
     */
    markSeen(messageId) {
      this._tracker.transition(messageId, DELIVERY.SEEN);
      this._ack.cancel(messageId);
    }

    /**
     * Mark as failed permanently.
     */
    markFailed(messageId, error) {
      this._ack.cancel(messageId);
      this._tracker.transition(messageId, DELIVERY.FAILED, {
        lastError: error?.message || String(error),
      });
      // PHASE11: Mirror to COR delivery pipeline
      try { window.__COR?.delivery?.(messageId, 'FAILED', { error: error?.message }); } catch(_) {}
    }

    // ── Receiver API ────────────────────────────────────────────────────────

    /**
     * Process an inbound message packet.
     * Returns false if duplicate (should be dropped).
     */
    receiveMessage(msg) {
      const id = msg.id || msg.messageId || msg.serverId;
      if (!id) return true; // no id — let through

      if (this._dedup.isDuplicate(id)) {
        console.debug(`[ReliableDelivery] Duplicate dropped: ${id}`);
        return false;
      }

      return true; // valid — process normally
    }

    // ── Watch API ───────────────────────────────────────────────────────────

    watchMessage(id, fn) { return this._tracker.watch(id, fn); }
    watchAll(fn)         { return this._tracker.watchAll(fn); }
    getState(id)         { return this._tracker.get(id); }

    getDiagnostics() {
      return {
        tracked: this._tracker.snapshot(),
        pendingAcks: this._ack._pending.size,
        dedupWindow: this._dedup._seen.size,
      };
    }

    // ── Socket event listeners ───────────────────────────────────────────────

    _attachSocketListeners() {
      const bus = window.KynectaEventBus;
      if (!bus) return;

      bus.on('SOCKET_EVENT', payload => {
        const type = payload?.type;

        // ACKs from server
        if (type === 'message:ack' || type === 'message_ack' || type === 'MESSAGE_ACK') {
          const id = payload?.messageId || payload?.localId || payload?.id;
          if (id) this.onAck(id);
        }

        // Read receipts
        if (type === 'message:read' || type === 'read_receipt' || type === 'MESSAGE_READ') {
          const id = payload?.messageId || payload?.id;
          if (id) this.markSeen(id);
        }

        // Delivered confirmations
        if (type === 'message:delivered' || type === 'MESSAGE_DELIVERED') {
          const id = payload?.messageId || payload?.id;
          if (id) this._tracker.transition(id, DELIVERY.DELIVERED_TO_CLIENT);
        }
      });
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const engine = new ReliableDeliveryEngine();
  engine.start();

  window.__ReliableDeliveryEngine = engine;
  window.ReliableDelivery = engine;
  window.DELIVERY_STATE_V2 = DELIVERY;

  console.log('[ReliableDelivery] ✅ Ready');
})();
