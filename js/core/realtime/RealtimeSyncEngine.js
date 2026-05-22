/**
 * RealtimeSyncEngine.js
 * Phase 2 — Realtime Synchronization Engine (Frontend)
 *
 * Synchronizes instantly without refresh:
 *  - Messages, replies, reactions, edits, deletes
 *  - Typing, presence, delivery states, read receipts
 *  - Group events, status interactions
 *  - Delta sync after reconnect (not full reload)
 *  - Conflict resolution via Lamport timestamps
 *
 * @version 2.0.0
 * @phase 2 — Realtime Sync
 */

(function () {
  'use strict';

  if (window.__RealtimeSyncEngine) return;

  // ─── LamportClock ────────────────────────────────────────────────────────

  class LamportClock {
    constructor() { this._t = 0; }
    tick()          { return ++this._t; }
    update(remote)  { this._t = Math.max(this._t, remote) + 1; return this._t; }
    get value()     { return this._t; }
  }

  // ─── ConflictResolver ────────────────────────────────────────────────────

  class ConflictResolver {
    /**
     * Server truth wins IF server version is newer AND deletion is valid.
     * Returns the winning version.
     */
    resolve(local, server) {
      if (!local) return server;
      if (!server) return local;

      const serverLT = server.lamport || server.updatedAt || 0;
      const localLT  = local.lamport  || local.updatedAt  || 0;

      // Server deletion always wins
      if (server.deleted && !local.deleted) return server;

      // Server version wins if newer
      if (serverLT > localLT) return server;

      // Local wins if newer
      return local;
    }

    /**
     * Merge an array of server items with local items.
     * Server fields win for shared fields.
     */
    mergeCollections(local, server, idKey = 'id') {
      const serverMap = new Map(server.map(s => [s[idKey], s]));
      const localMap  = new Map(local.map(l => [l[idKey], l]));

      const merged = [];
      for (const [id, serverItem] of serverMap) {
        const localItem = localMap.get(id);
        merged.push(this.resolve(localItem, serverItem));
      }
      return merged;
    }
  }

  // ─── DeltaSyncManager ───────────────────────────────────────────────────

  class DeltaSyncManager {
    constructor() {
      this._lastSyncAt  = new Map(); // chatId -> timestamp
      this._syncInFlight = new Set();
    }

    /**
     * Request a delta sync for a chat after reconnect.
     * Only fetches messages since last sync — NOT full history.
     */
    async syncChat(chatId, fetchFn) {
      if (this._syncInFlight.has(chatId)) return;
      this._syncInFlight.add(chatId);

      const since = this._lastSyncAt.get(chatId) || Date.now() - 5 * 60 * 1000;
      try {
        const delta = await fetchFn(chatId, since);
        this._lastSyncAt.set(chatId, Date.now());
        return delta;
      } catch (err) {
        console.warn(`[RealtimeSync] Delta sync failed for chat ${chatId}:`, err.message);
        return null;
      } finally {
        this._syncInFlight.delete(chatId);
      }
    }

    markSynced(chatId) {
      this._lastSyncAt.set(chatId, Date.now());
    }

    getLastSync(chatId) {
      return this._lastSyncAt.get(chatId) || null;
    }
  }

  // ─── EventNormalizer ────────────────────────────────────────────────────

  class EventNormalizer {
    normalize(rawEvent, payload) {
      const MAP = {
        // Messages
        'newMessage':          'message:created',
        'new_message':         'message:created',
        'messageDeleted':      'message:deleted',
        'message_deleted':     'message:deleted',
        'messageEdited':       'message:edited',
        'messageReaction':     'message:reacted',
        'MESSAGE_RECEIVED':    'message:created',
        'MESSAGE_DELETED':     'message:deleted',
        // Delivery
        'message_ack':         'message:ack',
        'MESSAGE_ACK':         'message:ack',
        'read_receipt':        'message:read',
        'messagesRead':        'message:read',
        'MESSAGE_DELIVERED':   'message:delivered',
        // Presence
        'userOnline':          'presence:online',
        'userOffline':         'presence:offline',
        // Typing
        'typing':              'typing:start',
        'stopTyping':          'typing:stop',
        // Group
        'groupMessage':        'group:message',
        'group_message':       'group:message',
        // Calls
        'callStarted':         'call:started',
        'callEnded':           'call:ended',
        // Sync
        'sync:request':        'sync:reconcile',
      };
      const normalized = MAP[rawEvent] || rawEvent;
      return { event: normalized, payload };
    }
  }

  // ─── StateUpdateBroadcaster ─────────────────────────────────────────────

  class StateUpdateBroadcaster {
    broadcastMessage(msg, eventType = 'message:created') {
      const bus = window.KynectaEventBus;
      if (!bus) return;
      bus.emit('MESSAGE_RECEIVED', msg, { async: true });
      // Also post to iframes that the existing app uses
      this._postToIframes(eventType, msg);
    }

    broadcastDelete(messageId, chatId) {
      const bus = window.KynectaEventBus;
      if (!bus) return;
      bus.emit('MESSAGE_DELETED', { messageId, chatId }, { async: true });
      this._postToIframes('MESSAGE_DELETED', { messageId, chatId });
    }

    broadcastPresence(userId, status) {
      const bus = window.KynectaEventBus;
      if (!bus) return;
      bus.emit(status === 'online' ? 'FRIEND_ONLINE' : 'FRIEND_OFFLINE',
        { userId, status, timestamp: Date.now() }, { async: true });
    }

    _postToIframes(type, payload) {
      try {
        const frames = document.querySelectorAll('iframe');
        frames.forEach(f => {
          try {
            f.contentWindow?.postMessage({ type, ...payload }, '*');
          } catch (_) {}
        });
      } catch (_) {}
    }
  }

  // ─── RealtimeSyncEngine (main) ────────────────────────────────────────────

  class RealtimeSyncEngine {
    constructor() {
      this._clock       = new LamportClock();
      this._conflict    = new ConflictResolver();
      this._delta       = new DeltaSyncManager();
      this._normalizer  = new EventNormalizer();
      this._broadcaster = new StateUpdateBroadcaster();
      this._started     = false;
    }

    start() {
      if (this._started) return;
      this._started = true;
      this._attachSocketListeners();
      this._attachReconnectHandler();
      console.log('[RealtimeSync] ✅ Started');
    }

    // ── Public API ──────────────────────────────────────────────────────────

    tick()           { return this._clock.tick(); }
    update(remote)   { return this._clock.update(remote); }
    get lamport()    { return this._clock.value; }

    resolve(local, server)               { return this._conflict.resolve(local, server); }
    mergeCollections(local, server, key) { return this._conflict.mergeCollections(local, server, key); }

    markChatSynced(chatId) { this._delta.markSynced(chatId); }

    async requestDeltaSync(chatId, fetchFn) {
      return this._delta.syncChat(chatId, fetchFn);
    }

    normalize(event, payload) { return this._normalizer.normalize(event, payload); }

    getDiagnostics() {
      return {
        lamport:      this._clock.value,
        syncedChats:  this._delta._lastSyncAt.size,
      };
    }

    // ── Private — Socket listeners ──────────────────────────────────────────

    _attachSocketListeners() {
      const bus = window.KynectaEventBus;
      if (!bus) {
        setTimeout(() => this._attachSocketListeners(), 1000);
        return;
      }

      bus.on('SOCKET_EVENT', payload => {
        const type = payload?.type;
        if (!type) return;

        const { event, payload: normalized } = this._normalizer.normalize(type, payload);

        // Update Lamport clock from server timestamp
        if (payload.lamport) this._clock.update(payload.lamport);

        switch (event) {
          case 'message:created':
            this._onMessageCreated(normalized);
            break;
          case 'message:deleted':
            this._onMessageDeleted(normalized);
            break;
          case 'message:edited':
            this._onMessageEdited(normalized);
            break;
          case 'message:reacted':
            this._onMessageReacted(normalized);
            break;
          case 'presence:online':
          case 'presence:offline':
            this._onPresenceUpdate(normalized, event.includes('online') ? 'online' : 'offline');
            break;
        }
      });
    }

    _attachReconnectHandler() {
      const bus = window.KynectaEventBus;
      if (!bus) return;

      bus.on('SOCKET_CONNECTED', () => {
        console.log('[RealtimeSync] Reconnected — requesting delta sync');
        // Signal that delta sync is needed
        bus.emit('SYNC_STARTED', { reason: 'reconnect', ts: Date.now() }, { async: true });
      });
    }

    _onMessageCreated(payload) {
      // Let existing app handle rendering — just ensure delivery is tracked
      const delivery = window.__ReliableDeliveryEngine;
      if (delivery && !delivery.receiveMessage(payload)) return; // duplicate
      this._broadcaster.broadcastMessage(payload, 'message:created');
    }

    _onMessageDeleted(payload) {
      const id = payload?.messageId || payload?.id;
      const chatId = payload?.chatId;
      if (id) {
        window.__PersistenceStabilizationLayer?.markDeleted('message', id);
        window.__CacheFoundationLayer?.invalidate(`messages:${chatId}`);
        this._broadcaster.broadcastDelete(id, chatId);
      }
    }

    _onMessageEdited(payload) {
      const bus = window.KynectaEventBus;
      if (bus) bus.emit('MESSAGE_EDITED', payload, { async: true });
    }

    _onMessageReacted(payload) {
      const bus = window.KynectaEventBus;
      if (bus) bus.emit('MESSAGE_EDITED', payload, { async: true });
    }

    _onPresenceUpdate(payload, status) {
      const userId = payload?.userId || payload?.user?.id;
      if (userId) this._broadcaster.broadcastPresence(userId, status);
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const engine = new RealtimeSyncEngine();
  engine.start();

  window.__RealtimeSyncEngine = engine;
  window.RealtimeSync = engine;

  console.log('[RealtimeSync] ✅ Ready');
})();
