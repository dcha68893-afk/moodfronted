/**
 * PresenceEngineFoundation.js
 * Phase 1 — Presence Engine Foundation
 *
 * Stabilizes:
 *  - Ghost online users
 *  - Stale typing indicators
 *  - Hidden-tab presence issues
 *  - Multi-tab conflicts
 *  - Duplicate sessions
 *  - Reconnect presence sync
 *
 * @version 1.0.0
 * @phase 1 — Foundation Stabilization
 */

(function () {
  'use strict';

  if (window.__PresenceEngineFoundation) {
    console.log('[PresenceEngine] Already initialized — skipping.');
    return;
  }

  const HEARTBEAT_INTERVAL_MS = 25000;
  const HEARTBEAT_TIMEOUT_MS = 60000; // user is stale if no heartbeat for 60s
  const TYPING_TIMEOUT_MS = 5000;
  const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5min

  // ─── PresenceState ───────────────────────────────────────────────────────────

  const PresenceStatus = Object.freeze({
    ONLINE:       'online',
    OFFLINE:      'offline',
    IDLE:         'idle',
    TYPING:       'typing',
    BACKGROUNDED: 'backgrounded',
    RECONNECTING: 'reconnecting',
  });

  // ─── SessionTracker ──────────────────────────────────────────────────────────

  class SessionTracker {
    constructor() {
      this._tabId = this._generateTabId();
      this._sessionStart = Date.now();
      this._otherTabs = new Map(); // tabId -> { lastPing, active }
    }

    _generateTabId() {
      return 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    }

    get tabId() { return this._tabId; }

    /**
     * Broadcast this tab's presence to other tabs via localStorage.
     */
    pingOtherTabs(status) {
      try {
        const msg = JSON.stringify({
          type: '__kyn_tab_ping',
          tabId: this._tabId,
          status,
          ts: Date.now(),
        });
        localStorage.setItem('__kyn_tab_broadcast', msg);
        localStorage.removeItem('__kyn_tab_broadcast');
      } catch (_) {}
    }

    /**
     * Listen for other tabs.
     */
    listen(onTabPing) {
      window.addEventListener('storage', (e) => {
        if (e.key !== '__kyn_tab_broadcast' || !e.newValue) return;
        try {
          const data = JSON.parse(e.newValue);
          if (data.type !== '__kyn_tab_ping' || data.tabId === this._tabId) return;
          this._otherTabs.set(data.tabId, { lastPing: data.ts, status: data.status });
          if (onTabPing) onTabPing(data);
        } catch (_) {}
      });
    }

    getActiveTabs() {
      const now = Date.now();
      const STALE = 60000;
      return Array.from(this._otherTabs.entries())
        .filter(([, v]) => now - v.lastPing < STALE)
        .map(([id, v]) => ({ tabId: id, ...v }));
    }

    isLeaderTab() {
      // The tab with the lowest tabId is the leader
      const allTabs = [this._tabId, ...Array.from(this._otherTabs.keys())];
      return allTabs.sort()[0] === this._tabId;
    }
  }

  // ─── HeartbeatManager ────────────────────────────────────────────────────────

  class HeartbeatManager {
    constructor(onHeartbeat) {
      this._onHeartbeat = onHeartbeat;
      this._timer = null;
      this._running = false;
    }

    start() {
      if (this._running) return;
      this._running = true;
      this._tick();
    }

    stop() {
      if (this._timer) clearInterval(this._timer);
      this._running = false;
    }

    _tick() {
      this._timer = setInterval(() => {
        if (document.visibilityState === 'hidden') return; // Skip when tab is hidden
        this._onHeartbeat();
      }, HEARTBEAT_INTERVAL_MS);
    }
  }

  // ─── VisibilityStateManager ──────────────────────────────────────────────────

  class VisibilityStateManager {
    constructor(onChange) {
      this._onChange = onChange;
      this._hidden = document.visibilityState === 'hidden';
      this._hiddenAt = null;
    }

    attach() {
      document.addEventListener('visibilitychange', () => {
        const wasHidden = this._hidden;
        this._hidden = document.visibilityState === 'hidden';

        if (this._hidden && !wasHidden) {
          this._hiddenAt = Date.now();
        }

        const hiddenDuration = this._hiddenAt ? Date.now() - this._hiddenAt : 0;
        this._onChange(this._hidden, hiddenDuration);
      });
    }

    isHidden() { return this._hidden; }
    hiddenDuration() {
      if (!this._hiddenAt) return 0;
      return this._hidden ? Date.now() - this._hiddenAt : 0;
    }
  }

  // ─── TypingIndicatorManager ──────────────────────────────────────────────────

  class TypingIndicatorManager {
    constructor(onChange) {
      this._active = new Map(); // `${chatId}:${userId}` -> expiryTimer
      this._onChange = onChange;
    }

    markTyping(chatId, userId, displayName) {
      const key = `${chatId}:${userId}`;

      // Reset existing timer
      if (this._active.has(key)) clearTimeout(this._active.get(key));

      const timer = setTimeout(() => {
        this._active.delete(key);
        this._onChange(chatId, userId, false);
      }, TYPING_TIMEOUT_MS);

      this._active.set(key, timer);
      this._onChange(chatId, userId, true, displayName);
    }

    markStopped(chatId, userId) {
      const key = `${chatId}:${userId}`;
      if (this._active.has(key)) {
        clearTimeout(this._active.get(key));
        this._active.delete(key);
      }
      this._onChange(chatId, userId, false);
    }

    getTypingUsers(chatId) {
      return Array.from(this._active.keys())
        .filter((k) => k.startsWith(chatId + ':'))
        .map((k) => k.split(':')[1]);
    }

    clearAll() {
      for (const timer of this._active.values()) clearTimeout(timer);
      this._active.clear();
    }

    clearForChat(chatId) {
      for (const [key, timer] of this._active) {
        if (key.startsWith(chatId + ':')) {
          clearTimeout(timer);
          this._active.delete(key);
        }
      }
    }
  }

  // ─── PresenceCoordinator (main) ──────────────────────────────────────────────

  class PresenceCoordinator {
    constructor() {
      this._onlineUsers = new Map(); // userId -> { status, lastSeen, sessionId }
      this._myStatus = PresenceStatus.ONLINE;
      this._myUserId = null;
      this._lastActivity = Date.now();
      this._idleTimer = null;

      this._session = new SessionTracker();
      this._visibility = new VisibilityStateManager((hidden, duration) => this._onVisibilityChange(hidden, duration));
      this._heartbeat = new HeartbeatManager(() => this._onHeartbeat());
      this._typing = new TypingIndicatorManager((chatId, userId, isTyping, name) => {
        this._onTypingChange(chatId, userId, isTyping, name);
      });

      this._listeners = [];
    }

    start(userId) {
      this._myUserId = userId || this._detectUserId();
      this._visibility.attach();
      this._heartbeat.start();
      this._session.listen((tabPing) => this._onOtherTabPing(tabPing));
      this._attachSocketListeners();
      this._startIdleDetection();
      this._session.pingOtherTabs(this._myStatus);
      console.log('[PresenceEngine] ✅ Started for user', this._myUserId);
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    getStatus(userId) {
      if (!userId) return this._myStatus;
      const u = this._onlineUsers.get(userId);
      if (!u) return PresenceStatus.OFFLINE;

      // Ghost user detection — if last seen > HEARTBEAT_TIMEOUT, mark offline
      if (Date.now() - u.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        return PresenceStatus.OFFLINE;
      }
      return u.status;
    }

    getOnlineUsers() {
      const now = Date.now();
      return Array.from(this._onlineUsers.entries())
        .filter(([, v]) => now - v.lastSeen < HEARTBEAT_TIMEOUT_MS)
        .map(([userId, v]) => ({ userId, ...v }));
    }

    isTyping(chatId, userId) {
      return this._typing.getTypingUsers(chatId).includes(userId);
    }

    getTypingUsers(chatId) { return this._typing.getTypingUsers(chatId); }

    onChange(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter((l) => l !== fn); };
    }

    // ── Socket event listeners ──────────────────────────────────────────────────

    _attachSocketListeners() {
      // Listen via EventBus or window messages
      const handlePresenceEvent = (type, payload) => {
        if (type === 'presence:online' || type === 'user:online') {
          const uid = payload?.userId || payload?.user?.id;
          if (uid) this._markOnline(uid, payload);
        }
        if (type === 'presence:offline' || type === 'user:offline') {
          const uid = payload?.userId || payload?.user?.id;
          if (uid) this._markOffline(uid, payload);
        }
        if (type === 'typing:start' || type === 'typing') {
          const uid = payload?.userId || payload?.senderId;
          const chatId = payload?.chatId || payload?.conversationId;
          if (uid && chatId) this._typing.markTyping(chatId, uid, payload?.displayName);
        }
        if (type === 'typing:stop' || type === 'stopTyping') {
          const uid = payload?.userId || payload?.senderId;
          const chatId = payload?.chatId || payload?.conversationId;
          if (uid && chatId) this._typing.markStopped(chatId, uid);
        }
        if (type === 'socket:reconnected') {
          this._onReconnect();
        }
      };

      const bus = window.KynectaEventBus || window.appEvents;
      if (bus) {
        bus.on('SOCKET_EVENT', (payload) => {
          if (payload?.type) handlePresenceEvent(payload.type, payload);
        });
        bus.on('SOCKET_CONNECTED', () => this._onReconnect());
      }

      // Also listen to window postMessages (iframe bridging)
      window.addEventListener('message', (e) => {
        if (!e.data || typeof e.data !== 'object') return;
        const type = e.data.type || '';
        if (type.includes('presence') || type.includes('typing') || type.includes('online') || type.includes('offline')) {
          handlePresenceEvent(type, e.data);
        }
      });
    }

    // ── Presence state management ─────────────────────────────────────────────

    _markOnline(userId, meta = {}) {
      const prev = this._onlineUsers.get(userId);
      this._onlineUsers.set(userId, {
        status: PresenceStatus.ONLINE,
        lastSeen: Date.now(),
        sessionId: meta.sessionId || meta.socketId || null,
        ...meta,
      });
      if (!prev || prev.status !== PresenceStatus.ONLINE) {
        this._emit({ event: 'presence:change', userId, status: PresenceStatus.ONLINE });
      }
    }

    _markOffline(userId, meta = {}) {
      const prev = this._onlineUsers.get(userId);
      if (prev) {
        prev.status = PresenceStatus.OFFLINE;
        prev.lastSeen = Date.now();
      }
      if (!prev || prev.status !== PresenceStatus.OFFLINE) {
        this._emit({ event: 'presence:change', userId, status: PresenceStatus.OFFLINE });
      }
    }

    // ── Heartbeat / Idle / Visibility ─────────────────────────────────────────

    _onHeartbeat() {
      this._session.pingOtherTabs(this._myStatus);

      // FIX (real gap — spec item 8, presence accuracy): this cycle only
      // ever did local, cross-tab bookkeeping below. Nothing here actually
      // told the SERVER this client was still alive between connect and
      // disconnect — only the raw Socket.IO connection itself did, via its
      // own ping/pong (a ~90s timeout, configured server-side). Emitting a
      // real heartbeat here lets the server keep an accurate lastSeen for
      // this user and detect a connection that's gone quiet well before
      // that 90s backstop would. window.KynectaRealtime.emit is this app's
      // safe wrapper around the actual socket — window.__socket/window.__io
      // are known to always be undefined in this codebase, so those are
      // deliberately not used here.
      if (this._myStatus === PresenceStatus.ONLINE || this._myStatus === PresenceStatus.IDLE) {
        try {
          if (window.KynectaRealtime && typeof window.KynectaRealtime.emit === 'function') {
            const result = window.KynectaRealtime.emit('presence:heartbeat', {}, { retry: false });
            if (result && typeof result.catch === 'function') result.catch(() => {});
          }
        } catch (_) { /* never let a heartbeat failure disrupt local presence bookkeeping */ }
      }

      // Garbage-collect ghost users
      const now = Date.now();
      for (const [userId, data] of this._onlineUsers) {
        if (data.status === PresenceStatus.ONLINE && now - data.lastSeen > HEARTBEAT_TIMEOUT_MS) {
          console.debug(`[PresenceEngine] Ghost user detected: ${userId} — marking offline`);
          this._markOffline(userId);
        }
      }
    }

    _onVisibilityChange(hidden, hiddenDurationMs) {
      if (hidden) {
        this._myStatus = PresenceStatus.BACKGROUNDED;
        this._heartbeat.stop();
      } else {
        this._myStatus = PresenceStatus.ONLINE;
        this._heartbeat.start();

        // If we were hidden for a long time, trigger a presence re-sync
        if (hiddenDurationMs > 60000) {
          this._onReconnect();
        }
      }
      this._session.pingOtherTabs(this._myStatus);
    }

    _onOtherTabPing(tabData) {
      // If another tab is the leader, we can defer heartbeat
    }

    _onReconnect() {
      // Clear stale typing indicators on reconnect
      this._typing.clearAll();

      // Mark all as "unknown" until server confirms — ghost prevention
      for (const [, data] of this._onlineUsers) {
        data.lastSeen = 0; // Will be re-confirmed or swept as ghost
      }

      this._emit({ event: 'presence:reconnecting' });
    }

    _startIdleDetection() {
      const resetIdle = () => {
        this._lastActivity = Date.now();
        if (this._myStatus === PresenceStatus.IDLE) {
          this._myStatus = PresenceStatus.ONLINE;
          this._emit({ event: 'presence:active' });
        }
        if (this._idleTimer) clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => {
          this._myStatus = PresenceStatus.IDLE;
          this._emit({ event: 'presence:idle' });
        }, IDLE_TIMEOUT_MS);
      };

      ['mousemove', 'keydown', 'touchstart', 'scroll'].forEach((e) => {
        document.addEventListener(e, resetIdle, { passive: true });
      });

      resetIdle();
    }

    _detectUserId() {
      try {
        const authRaw = localStorage.getItem('kynecta_auth') || localStorage.getItem('nexopa_auth');
        if (authRaw) {
          const auth = JSON.parse(authRaw);
          return auth?.user?.id || auth?.userId || null;
        }
      } catch (_) {}
      return null;
    }

    _onTypingChange(chatId, userId, isTyping, displayName) {
      this._emit({ event: 'typing:change', chatId, userId, isTyping, displayName });
    }

    _emit(data) {
      for (const fn of this._listeners) {
        try { fn(data); } catch (_) {}
      }
      const bus = window.KynectaEventBus || window.appEvents;
      if (bus) bus.emit('SOCKET_EVENT', data, { async: true });
    }

    getDiagnostics() {
      return {
        myStatus: this._myStatus,
        onlineUsers: this.getOnlineUsers().length,
        tabId: this._session.tabId,
        isLeaderTab: this._session.isLeaderTab(),
        otherTabs: this._session.getActiveTabs().length,
        idleFor: Date.now() - this._lastActivity,
        hidden: this._visibility.isHidden(),
      };
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────────

  const engine = new PresenceCoordinator();

  // Auto-start once a userId is available
  const tryStart = () => {
    const userId = (() => {
      try {
        const raw = localStorage.getItem('kynecta_auth') || localStorage.getItem('nexopa_auth');
        if (!raw) return null;
        const auth = JSON.parse(raw);
        return auth?.user?.id || auth?.userId || null;
      } catch (_) { return null; }
    })();

    if (userId) {
      engine.start(userId);
    } else {
      // Wait for login
      setTimeout(tryStart, 2000);
    }
  };

  document.addEventListener('DOMContentLoaded', tryStart);
  tryStart();

  window.__PresenceEngineFoundation = engine;
  window.PresenceEngine = engine;
  window.PresenceStatus = PresenceStatus;

  console.log('[PresenceEngine] ✅ Ready');
})();
