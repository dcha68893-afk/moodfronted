/**
 * BackgroundReliabilityService.js
 * Phase 5 — Background Services Layer (Frontend)
 *
 * Ensures the app survives:
 *  - Hidden browser tabs (visibilitychange orchestration)
 *  - Android Doze / iOS background suspension
 *  - Multiple browser tabs (BroadcastChannel coordination)
 *  - Service Worker background sync
 *  - Push wake recovery
 *
 * Integrates with existing BackgroundSyncService (Phase 2) — extends it.
 * Uses moodchat_ prefix for storage keys.
 *
 * @version 5.0.0
 * @phase 5 — Background Reliability
 */

(function () {
  'use strict';

  if (window.__BackgroundReliabilityService) return;

  const BC_CHANNEL_NAME   = 'moodchat_bg_sync';
  const LEADER_PING_MS    = 10000;
  const LEADER_TIMEOUT_MS = 25000;
  const SW_SYNC_TAG       = 'moodchat-bg-sync-v5';
  const HIDDEN_SYNC_THRESHOLD_S = 20;

  // ─── BroadcastChannelCoordinator ─────────────────────────────────────────

  class BroadcastChannelCoordinator {
    constructor() {
      this._channel     = null;
      this._tabId       = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      this._isLeader    = false;
      this._leaderSeen  = Date.now();
      this._handlers    = new Map();
      this._pingTimer   = null;
    }

    init() {
      if (!window.BroadcastChannel) {
        console.debug('[BGReliability] BroadcastChannel not supported — using fallback');
        this._fallback();
        return;
      }

      try {
        this._channel = new BroadcastChannel(BC_CHANNEL_NAME);
        this._channel.onmessage = (e) => this._onMessage(e.data);
        this._electLeader();
        console.log('[BGReliability] BroadcastChannel initialized, tabId:', this._tabId);
      } catch (_) {
        this._fallback();
      }
    }

    broadcast(type, payload) {
      if (!this._channel) return;
      try {
        this._channel.postMessage({ type, payload, tabId: this._tabId, ts: Date.now() });
      } catch (_) {}
    }

    on(type, fn) {
      if (!this._handlers.has(type)) this._handlers.set(type, []);
      this._handlers.get(type).push(fn);
      return () => {
        const arr = this._handlers.get(type);
        if (arr) this._handlers.set(type, arr.filter(h => h !== fn));
      };
    }

    isLeader()  { return this._isLeader; }
    getTabId()  { return this._tabId; }

    destroy() {
      if (this._pingTimer) clearInterval(this._pingTimer);
      try { this._channel?.close(); } catch (_) {}
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _onMessage(data) {
      if (!data || !data.type) return;
      const handlers = this._handlers.get(data.type) || [];
      handlers.forEach(fn => { try { fn(data); } catch (_) {} });

      if (data.type === 'leader:ping') {
        this._leaderSeen = data.ts || Date.now();
        if (data.tabId === this._tabId) return; // own ping
        this._isLeader = false; // another tab is leader
      }

      if (data.type === 'leader:claim') {
        if (data.tabId !== this._tabId) this._isLeader = false;
      }

      // Sync unread counts and queue state across tabs
      if (data.type === 'sync:unread' && data.payload) {
        this._applyUnreadSync(data.payload);
      }

      if (data.type === 'sync:message' && data.payload) {
        // Forward to EventBus so this tab processes the message too
        const bus = window.KynectaEventBus;
        if (bus) bus.emit('MESSAGE_RECEIVED', data.payload, { async: true });
      }
    }

    _electLeader() {
      // Simple election: the tab that sees no leader ping for LEADER_TIMEOUT_MS claims leadership
      setTimeout(() => {
        if (Date.now() - this._leaderSeen > LEADER_TIMEOUT_MS) {
          this._isLeader = true;
          this.broadcast('leader:claim', { tabId: this._tabId });
        }
      }, LEADER_TIMEOUT_MS + Math.random() * 1000);

      // Leader pings every 10s
      this._pingTimer = setInterval(() => {
        if (this._isLeader) {
          this.broadcast('leader:ping', { tabId: this._tabId });
        }
        // Check if leader is gone
        if (!this._isLeader && Date.now() - this._leaderSeen > LEADER_TIMEOUT_MS) {
          this._isLeader = true;
          this.broadcast('leader:claim', { tabId: this._tabId });
        }
      }, LEADER_PING_MS);
    }

    _applyUnreadSync(unreadMap) {
      const notif = window.__SocialNotificationEngine;
      if (!notif) return;
      for (const [scope, count] of Object.entries(unreadMap)) {
        // Only update if count is higher (take max across tabs)
        if (count > notif.getGroupUnread(scope.replace('group:', ''))) {
          notif._unread._counts.set(scope, count);
        }
      }
    }

    _fallback() {
      // Use localStorage events as fallback for cross-tab communication
      this._isLeader = true; // Assume leader if no BroadcastChannel
      window.addEventListener('storage', e => {
        if (e.key !== 'moodchat_bc_msg') return;
        try {
          const data = JSON.parse(e.newValue || '{}');
          this._onMessage(data);
        } catch (_) {}
      });
    }
  }

  // ─── ServiceWorkerCoordinator ─────────────────────────────────────────────

  class ServiceWorkerCoordinator {
    constructor() {
      this._registration = null;
    }

    async init() {
      if (!('serviceWorker' in navigator)) return false;
      try {
        this._registration = await navigator.serviceWorker.ready;
        this._attachMessageListener();
        console.log('[BGReliability] SW ready:', this._registration.scope);
        return true;
      } catch (_) { return false; }
    }

    async requestSync() {
      if (!this._registration || !('sync' in this._registration)) return false;
      try {
        await this._registration.sync.register(SW_SYNC_TAG);
        return true;
      } catch (_) { return false; }
    }

    async sendMessage(type, payload) {
      const sw = this._registration?.active || navigator.serviceWorker.controller;
      if (!sw) return;
      sw.postMessage({ type, payload, ts: Date.now() });
    }

    _attachMessageListener() {
      navigator.serviceWorker.addEventListener('message', e => {
        const { type, payload } = e.data || {};
        if (!type) return;

        if (type === 'sw:sync_triggered') {
          window.__OfflineMessageQueue?.flushAll();
          window.__DurableQueueLayer?.flushAll();
        }
        if (type === 'sw:push_received') {
          window.KynectaEventBus?.emit('PUSH_NOTIFICATION', payload, { async: true });
        }
      });
    }
  }

  // ─── VisibilityOrchestrator ───────────────────────────────────────────────

  class VisibilityOrchestrator {
    constructor(bc, onRestore) {
      this._bc         = bc;
      this._onRestore  = onRestore;
      this._hiddenAt   = null;
      this._hiddenSec  = 0;
    }

    attach() {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this._hiddenAt = Date.now();
          this._bc.broadcast('tab:hidden', { tabId: this._bc.getTabId() });
        } else {
          this._hiddenSec = this._hiddenAt ? (Date.now() - this._hiddenAt) / 1000 : 0;
          this._hiddenAt  = null;
          this._onRestore(this._hiddenSec);
          this._bc.broadcast('tab:visible', {
            tabId: this._bc.getTabId(),
            hiddenSec: this._hiddenSec,
          });
        }
      });
    }
  }

  // ─── BackgroundReliabilityService (main) ─────────────────────────────────

  class BackgroundReliabilityService {
    constructor() {
      this._bc         = new BroadcastChannelCoordinator();
      this._sw         = new ServiceWorkerCoordinator();
      this._visibility = new VisibilityOrchestrator(this._bc, (hiddenSec) => {
        this._onTabRestore(hiddenSec);
      });
      this._started = false;
    }

    async start() {
      if (this._started) return;
      this._started = true;

      this._bc.init();
      await this._sw.init();
      this._visibility.attach();
      this._attachCrossTabSync();
      this._attachReconnectBroadcast();

      console.log('[BGReliability] ✅ Started — leader:', this._bc.isLeader());
    }

    // ── Public API ──────────────────────────────────────────────────────────

    isLeaderTab()   { return this._bc.isLeader(); }

    broadcastMessage(msg) {
      this._bc.broadcast('sync:message', msg);
    }

    broadcastUnread(unreadMap) {
      this._bc.broadcast('sync:unread', unreadMap);
    }

    async requestSWSync() {
      return this._sw.requestSync();
    }

    onCrossTabMessage(fn) {
      return this._bc.on('sync:message', fn);
    }

    getDiagnostics() {
      return {
        isLeader:  this._bc.isLeader(),
        tabId:     this._bc.getTabId(),
        swReady:   !!this._sw._registration,
        started:   this._started,
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _onTabRestore(hiddenSec) {
      console.log(`[BGReliability] Tab visible after ${Math.round(hiddenSec)}s`);

      if (hiddenSec > HIDDEN_SYNC_THRESHOLD_S) {
        // Significant absence — trigger full recovery
        window.__OfflineMessageQueue?.flushAll();
        window.__DurableQueueLayer?.flushAll();
        window.__DeviceMediaManager?.recoverTracks?.();

        const bus = window.KynectaEventBus;
        if (bus) bus.emit('SYNC_STARTED', { reason: 'tab_restore', hiddenSec }, { async: true });

        // Reconnect if socket dropped while hidden
        const socket = window.KynectaRealtime?._socket;
        if (socket && !socket.connected) {
          window.__ReconnectOrchestrator?._scheduleReconnect?.();
        }
      }

      // Always re-sync unread counts
      const notif = window.__SocialNotificationEngine;
      if (notif) this.broadcastUnread(notif.getAllUnreads?.() || {});
    }

    _attachCrossTabSync() {
      // When another tab receives a message, also process it here
      this._bc.on('sync:message', data => {
        if (!data.payload) return;
        const bus = window.KynectaEventBus;
        if (bus) bus.emit('MESSAGE_RECEIVED', data.payload, { async: true });
      });

      // When another tab sends an unread update
      this._bc.on('sync:unread', data => {
        if (!data.payload) return;
        const notif = window.__SocialNotificationEngine;
        if (!notif) return;
        for (const [scope, count] of Object.entries(data.payload)) {
          if (count > (notif._unread?.getCount?.(scope) || 0)) {
            notif._unread?._counts?.set(scope, count);
          }
        }
      });
    }

    _attachReconnectBroadcast() {
      // When this tab reconnects, tell other tabs
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_CONNECTED', () => {
          this._bc.broadcast('tab:reconnected', { tabId: this._bc.getTabId() });
          this._sw.requestSync();
        });
      }

      // When another tab reconnects, also attempt our reconnect
      this._bc.on('tab:reconnected', data => {
        if (data.tabId === this._bc.getTabId()) return;
        const socket = window.KynectaRealtime?._socket;
        if (socket && !socket.connected) {
          socket.connect();
        }
      });
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const service = new BackgroundReliabilityService();
  service.start().catch(e => console.warn('[BGReliability] Start error:', e.message));

  window.__BackgroundReliabilityService = service;
  window.BGReliability                  = service;

  console.log('[BGReliability] ✅ Ready');
})();
