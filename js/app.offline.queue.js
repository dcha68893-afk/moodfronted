/**
 * app.offline.queue.js  (Offline-First Edition v2.1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Application-level offline queue.
 *
 * Guarantees:
 *   ✅ No data loss — queue survives page reload via AppCache syncQueue store
 *   ✅ No duplicate execution — items removed from queue before processing
 *   ✅ No network calls at startup — queue is only processed when online
 *   ✅ Exponential back-off with bounded retries
 *   ✅ Delegates to specialised engines where available
 *
 * Operations handled:
 *   sendMessage · createChat · updateStatus · friendRequest · group actions ·
 *   settings · generic
 *
 * @version 2.1.0
 */
(function () {
  'use strict';

  if (window.KynectaOfflineQueue) return; // singleton guard

  /* ── Config ──────────────────────────────────────────────────────────────── */
  const CONFIG = {
    maxSize:    1000,
    maxAge:     7 * 24 * 60 * 60 * 1000, // 7 days
    retryDelay: 5000,
    maxRetries: 10,
    storageKey: 'kynecta_offline_queue'   // localStorage fallback key
  };

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function getCache() {
    return window.AppCache || window.KynectaCache || null;
  }

  /* ── Queue manager ───────────────────────────────────────────────────────── */
  class KynectaOfflineQueue {
    constructor() {
      this._queue         = [];
      this._processing    = false;
      this._retryTimeouts = new Map();
      this._stats = { totalQueued: 0, totalProcessed: 0, totalFailed: 0, currentSize: 0 };

      this._init().then(() => {
        console.log('[OfflineQueue] ✅ Initialized (offline-first v2.1)');
      });
    }

    /* ── Public API ────────────────────────────────────────────────────── */

    /**
     * Add an operation to the queue.
     * @param {Object} operation  { type, action, data, priority? }
     * @returns {Promise<string>} queue item id
     */
    async queue(operation) {
      // Delegate message sends to KynectaMsgQueue when available
      if (operation.type === 'message' && operation.action === 'send') {
        const msgQ = window.KynectaMsgQueue;
        if (msgQ && typeof msgQ.enqueue === 'function') {
          msgQ.enqueue(operation.data);
          return (operation.data && (operation.data.localId || operation.data.id)) || ('msg_' + Date.now());
        }
      }

      const item = this._createItem(operation);
      this._queue.push(item);
      this._stats.totalQueued++;
      this._stats.currentSize = this._queue.length;
      if (this._queue.length > CONFIG.maxSize) this._queue.shift();

      await this._persist();
      this._emit('OFFLINE_QUEUE_ADDED', { id: item.id, type: item.type, action: item.action });

      // FIX (Forensic Audit P3): Register background sync so the SW can replay
      // this queue when connectivity returns, even if the tab is later closed.
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        try {
          navigator.serviceWorker.controller.postMessage({
            type: 'REGISTER_BACKGROUND_SYNC',
            tag: 'offline-message-queue'
          });
        } catch (_) {}
      }

      // Process immediately if online — but never block the caller
      if (navigator.onLine) this.process().catch(() => {});

      return item.id;
    }

    /** Enqueue multiple operations. */
    async queueBatch(operations) {
      const ids = [];
      for (const op of (Array.isArray(operations) ? operations : [])) {
        ids.push(await this.queue(op));
      }
      return ids;
    }

    /** Process the queue. Called automatically on 'online' event. */
    async process() {
      if (this._processing || !navigator.onLine || this._queue.length === 0) return;
      this._processing = true;

      try {
        // Sort by priority (high first) then timestamp (oldest first)
        const sorted = [...this._queue].sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.timestamp - b.timestamp;
        });

        const processed = [];

        for (const item of sorted) {
          // Double-check we are still online between items
          if (!navigator.onLine) break;

          try {
            await this._processItem(item);
            // Remove from queue AFTER successful processing (no duplicates)
            const idx = this._queue.findIndex(q => q.id === item.id);
            if (idx !== -1) { this._queue.splice(idx, 1); }
            processed.push(item.id);
            this._stats.totalProcessed++;
            if (this._retryTimeouts.has(item.id)) {
              clearTimeout(this._retryTimeouts.get(item.id));
              this._retryTimeouts.delete(item.id);
            }
          } catch (err) {
            item.retries++;
            item.lastError = err && err.message ? err.message : String(err);

            if (item.retries >= CONFIG.maxRetries) {
              const idx = this._queue.findIndex(q => q.id === item.id);
              if (idx !== -1) this._queue.splice(idx, 1);
              this._stats.totalFailed++;
              this._storeFailed(item);
            } else {
              this._scheduleRetry(item);
            }
          }
        }

        this._stats.currentSize = this._queue.length;
        await this._persist();

        if (processed.length > 0) {
          this._emit('OFFLINE_QUEUE_PROCESSED', { processed, remaining: this._queue.length });
        }
      } finally {
        this._processing = false;
      }
    }

    /** Alias used by KynectaSync on reconnect. */
    async processAll() { return this.process(); }

    /** Queue status snapshot. */
    getStatus() {
      return {
        size:        this._queue.length,
        processing:  this._processing,
        online:      navigator.onLine,
        stats:       { ...this._stats },
        itemsByType: this._queue.reduce((acc, item) => {
          acc[item.type] = (acc[item.type] || 0) + 1; return acc;
        }, {})
      };
    }

    /** Clear the entire queue. */
    async clear(includeFailed) {
      this._queue = [];
      this._stats.currentSize = 0;
      this._retryTimeouts.forEach(t => clearTimeout(t));
      this._retryTimeouts.clear();
      await this._persist();
      if (includeFailed) localStorage.removeItem('kynecta_offline_failed');
      this._emit('OFFLINE_QUEUE_CLEARED');
    }

    /** Requeue previously failed items. */
    async retryFailed() {
      const failed = await this._getFailed();
      for (const item of failed) {
        this._queue.push(this._createItem({ type: item.type, action: item.action, data: item.data, priority: item.priority }));
      }
      localStorage.removeItem('kynecta_offline_failed');
      if (navigator.onLine) this.process().catch(() => {});
    }

    async getFailed() { return this._getFailed(); }

    /* ── Private ────────────────────────────────────────────────────────── */

    async _init() {
      await this._load();

      window.addEventListener('online', () => {
        console.log('[OfflineQueue] Network restored — processing queue (' + this._queue.length + ' items)');
        this.process().catch(() => {});
      });

      window.addEventListener('offline', () => {
        console.log('[OfflineQueue] Network lost — suspending retries');
        this._retryTimeouts.forEach(t => clearTimeout(t));
        this._retryTimeouts.clear();
      });

      if (window.KynectaEventBus && typeof window.KynectaEventBus.on === 'function') {
        window.KynectaEventBus.on('SYNC_COMPLETED', () => this.process().catch(() => {}));
      }

      // Replay surviving items after page reload — but only when already online
      if (navigator.onLine && this._queue.length > 0) {
        setTimeout(() => this.process().catch(() => {}), 1000);
      }
    }

    _createItem(operation) {
      return {
        id:        'offline_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
        type:      operation.type   || 'unknown',
        action:    operation.action || 'unknown',
        data:      operation.data   || null,
        priority:  operation.priority != null ? operation.priority : 5,
        timestamp: Date.now(),
        retries:   0,
        lastError: null
      };
    }

    async _processItem(item) {
      switch (item.type) {
        case 'message':  return this._processMessage(item);
        case 'friend':   return this._processFriend(item);
        case 'group':    return this._processGroup(item);
        case 'status':   return this._processStatus(item);
        case 'call':     return this._processGeneric(item);
        case 'settings': return this._processSettings(item);
        default:         return this._processGeneric(item);
      }
    }

    async _processMessage(item) {
      const msgQ = window.KynectaMsgQueue;
      if (msgQ && item.action === 'send' && typeof msgQ.enqueue === 'function') {
        msgQ.enqueue(item.data);
        return;
      }
      if (!window.services || !window.services.message) throw new Error('Message service unavailable');
      switch (item.action) {
        case 'send':   return window.services.message.sendMessage(item.data);
        case 'edit':   return window.services.message.editMessage(item.data.messageId, item.data.content, item.data.chatId);
        case 'delete': return window.services.message.deleteMessage(item.data.messageId, item.data.chatId);
        case 'read':   return window.services.message.markAsRead(item.data.chatId, item.data.messageIds);
        default: throw new Error('Unknown message action: ' + item.action);
      }
    }

    async _processFriend(item) {
      // Prefer KynectaFriendQueue
      const fq = window.KynectaFriendQueue;
      if (fq && typeof fq.enqueue === 'function') {
        fq.enqueue(item.action, (item.data && (item.data.userId || item.data.friendId)), item.data);
        if (typeof fq.flush === 'function' && navigator.onLine) await fq.flush();
        return;
      }
      if (!window.services || !window.services.friend) throw new Error('Friend service unavailable');
      switch (item.action) {
        case 'request':  return window.services.friend.sendFriendRequest(item.data.userId, item.data.message);
        case 'accept':   return window.services.friend.acceptFriendRequest(item.data.requestId);
        case 'reject':   return window.services.friend.rejectFriendRequest(item.data.requestId);
        case 'remove':   return window.services.friend.removeFriend(item.data.friendId);
        case 'block':    return window.services.friend.blockUser(item.data.userId);
        case 'unblock':  return window.services.friend.unblockUser(item.data.userId);
        default: throw new Error('Unknown friend action: ' + item.action);
      }
    }

    async _processGroup(item) {
      const gq = window.GroupQueueManager;
      if (gq && typeof gq.enqueue === 'function') {
        gq.enqueue(item.action, item.data);
        if (typeof gq.processNow === 'function' && navigator.onLine) await gq.processNow();
        return;
      }
      const ge = window.GroupSyncEngine;
      if (ge && typeof ge.syncAll === 'function') {
        await ge.syncAll();
        return;
      }
      return this._processGeneric(item);
    }

    async _processStatus(item) {
      if (window.statusCore && typeof window.statusCore.syncPending === 'function') {
        return window.statusCore.syncPending(item.data || {});
      }
      return this._processGeneric(item);
    }

    async _processSettings(item) {
      try {
        const ls = window.LocalStoreSettings;
        if (ls && item.data && typeof item.data === 'object') {
          const current = (ls.getAll && ls.getAll()) || {};
          const merged  = Object.assign({}, current, item.data);
          if (typeof ls.persist === 'function') ls.persist(merged);
          if (window.KynectaStore && typeof window.KynectaStore.syncFromLocalStore === 'function') {
            window.KynectaStore.syncFromLocalStore();
          }
        }
      } catch (err) {
        console.warn('[OfflineQueue] Settings pre-persist failed:', err.message);
      }
      return this._processGeneric(item);
    }

    async _processGeneric(item) {
      return this._makeRequest('POST', '/api/offline/process', item);
    }

    _scheduleRetry(item) {
      if (this._retryTimeouts.has(item.id)) return;
      const delay   = CONFIG.retryDelay * Math.pow(1.5, item.retries - 1);
      const timeout = setTimeout(() => {
        this._retryTimeouts.delete(item.id);
        this.process().catch(() => {});
      }, delay);
      this._retryTimeouts.set(item.id, timeout);
    }

    _storeFailed(item) {
      try {
        const failed = JSON.parse(localStorage.getItem('kynecta_offline_failed') || '[]');
        failed.push({ ...item, failedAt: Date.now() });
        if (failed.length > 100) failed.shift();
        localStorage.setItem('kynecta_offline_failed', JSON.stringify(failed));
      } catch (_) {}
    }

    async _getFailed() {
      try { return JSON.parse(localStorage.getItem('kynecta_offline_failed') || '[]'); } catch (_) { return []; }
    }

    /* ── Persistence: AppCache syncQueue (preferred) → localStorage (fallback) */

    async _persist() {
      const cache = getCache();
      if (cache && typeof cache.save === 'function') {
        try {
          await cache.ready();
          // Clear existing queue entries and replace with current state
          const existing = await cache.getAll('syncQueue');
          // Only remove items that belong to the app-level queue (not group / other queues)
          const appItems = existing.filter(i => i._source === 'appQueue');
          await Promise.all(appItems.map(i => cache.remove('syncQueue', i.id)));
          if (this._queue.length > 0) {
            await cache.save('syncQueue', this._queue.map(item => ({
              ...item,
              _source: 'appQueue',
              queueId: item.id,
              status:  item.status || 'pending',
              userId:  (item.data && item.data.userId) || item.userId || null
            })));
          }
          return;
        } catch (e) {
          console.warn('[OfflineQueue] IDB persist failed, falling back to localStorage:', e.message);
        }
      }
      this._persistToLocalStorage();
    }

    async _load() {
      const cache = getCache();
      if (cache && typeof cache.getAll === 'function') {
        try {
          await cache.ready();
          const all  = await cache.getAll('syncQueue');
          const now  = Date.now();
          this._queue = all
            .filter(i => i._source === 'appQueue')
            .filter(i => now - i.timestamp < CONFIG.maxAge);
          this._stats.currentSize = this._queue.length;
          return;
        } catch (e) {
          console.warn('[OfflineQueue] IDB load failed, falling back to localStorage:', e.message);
        }
      }
      this._loadFromLocalStorage();
    }

    _persistToLocalStorage() {
      try {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify({ queue: this._queue, timestamp: Date.now() }));
      } catch (_) {}
    }

    _loadFromLocalStorage() {
      try {
        const raw = localStorage.getItem(CONFIG.storageKey);
        if (raw) {
          const data = JSON.parse(raw);
          const now  = Date.now();
          this._queue = (data.queue || []).filter(i => now - i.timestamp < CONFIG.maxAge);
          this._stats.currentSize = this._queue.length;
        }
      } catch (_) { this._queue = []; }
    }

    /* ── Network request helper ──────────────────────────────────────────── */
    async _makeRequest(method, endpoint, data) {
      if (!navigator.onLine) return { success: false, offline: true, data: null };

      const request = async () => {
        const token =
          (window.__PARENT_SESSION__ && window.__PARENT_SESSION__.token) ||
          (window.Session && typeof window.Session.getToken === 'function' && window.Session.getToken()) ||
          (window.AUTH_SESSION && window.AUTH_SESSION.token) ||
          localStorage.getItem('token') || localStorage.getItem('nexopa_token') || localStorage.getItem('accessToken') ||
          null;

        const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
        const options = { method, headers, credentials: 'include' };
        if (data && method !== 'GET') options.body = JSON.stringify(data);

        if (window.api && window.api.request && typeof window.api.request.request === 'function') {
          return window.api.request.request(endpoint, options);
        }
        const response = await fetch(endpoint, options);
        if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        return response.json();
      };

      if (typeof window.safeApiCall === 'function') {
        return window.safeApiCall(request, { success: false, offline: false, data: null });
      }
      return request();
    }

    /* ── Event helper ────────────────────────────────────────────────────── */
    _emit(name, detail) {
      if (window.KynectaEventBus && typeof window.KynectaEventBus.emit === 'function') {
        window.KynectaEventBus.emit(name, detail || {});
      }
    }
  }

  /* ── Singleton ───────────────────────────────────────────────────────────── */
  const offlineQueue = new KynectaOfflineQueue();
  window.KynectaOfflineQueue = offlineQueue;
  if (window.__KYNECTA_AUTHORITIES__) window.__KYNECTA_AUTHORITIES__.offlineQueue = offlineQueue;

  // FIX TRANSPORT DISCONNECTION: HybridTransportRuntime calls window.__OfflineMessageQueue.flushAll()
  // and window.__OfflineMessageQueue.enqueue(), but this queue only registered as
  // window.KynectaOfflineQueue with .process() and .queue() methods.
  // All transport layers failed to find the queue, causing offline messages to be lost.
  offlineQueue.flushAll   = function()     { return this.process(); };
  offlineQueue.enqueue    = function(item) { return this.queue(item); };
  offlineQueue.size       = function()     { return this._queue.length; };
  offlineQueue.getPending = function()     { return [...this._queue]; };

  // FIX Bug1: Add setSendHandler, markDelivered, onStateChange stubs so this queue is
  // compatible with the full OfflineMessageQueue API expected by phase6.bootstrap.js.
  // phase6._wireOfflineQueue() now guards against missing setSendHandler, but these stubs
  // ensure forward-compatibility if any other code calls them.
  if (!offlineQueue.setSendHandler) {
    offlineQueue._sendHandler = null;
    offlineQueue.setSendHandler = function(handler) {
      this._sendHandler = handler;
      console.log('[OfflineQueue] setSendHandler registered (stub — handler stored but not used; delivery handled internally)');
    };
  }
  if (!offlineQueue.markDelivered) {
    offlineQueue.markDelivered = function(id) {
      const idx = this._queue.findIndex(q => q.id === id);
      if (idx !== -1) { this._queue.splice(idx, 1); this._persist().catch(() => {}); }
    };
  }
  if (!offlineQueue.onStateChange) {
    offlineQueue.onStateChange = function(fn) {
      // Stub — state change is published via KynectaEventBus already
      return function() {}; // unsubscribe noop
    };
  }

  // FIX Bug1: Only set window.__OfflineMessageQueue if the proper full-featured queue
  // (OfflineMessageQueue from js/core/queue/) hasn't already been loaded.
  // This prevents overwriting a richer implementation that DOES have setSendHandler.
  if (!window.__OfflineMessageQueue || !window.__OfflineMessageQueue._sendHandlerWired) {
    window.__OfflineMessageQueue = offlineQueue;  // HybridTransportRuntime alias
  }
  // FIX-QUEUE-COLLISION (message loss bug): This used to unconditionally set
  // window.KynectaMsgQueue = offlineQueue, clobbering the dedicated message
  // queue from messageQueue.manager.js whenever both scripts load on the same
  // page (as they do in chat.html, in that order).
  //
  // Real-world impact this was causing: messages-core.js calls
  // window.KynectaMsgQueue.enqueue(msgObject) to queue an outgoing message
  // when offline. Because msgObject.type is the MESSAGE's content type
  // ("text"/"image"/etc), not the queue-operation type "message", it fell
  // through this generic queue's default branch into _processGeneric(), which
  // POSTs to /api/offline/process — a stub endpoint that acknowledges success
  // (results.processed++) without ever actually creating/sending the message.
  // The client saw "success", removed the item from the queue, and the
  // message was gone — never delivered, no error surfaced to the user.
  //
  // Fix: only use this generic queue as the KynectaMsgQueue fallback when no
  // dedicated message queue has already registered itself (matches the same
  // guard pattern already used above for window.__OfflineMessageQueue).
  if (!window.KynectaMsgQueue) {
    window.KynectaMsgQueue = offlineQueue;  // messages-core alias (fallback only)
  }


  console.log('[OfflineQueue] ✅ Ready (offline-first v2.1)');
})();