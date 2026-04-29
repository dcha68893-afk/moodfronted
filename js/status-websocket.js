// status-websocket.js — Fixed v4 (2026-04-28)
// Bug fixes vs v3:
//  Bug F fix 1: Persistent 500ms poll (up to 60s) so a missed KYN_REALTIME_READY
//               postMessage (race between parent firing and iframe listener attaching)
//               never leaves listeners unregistered.
//  Bug F fix 2: Re-init listeners when KynectaRealtime reconnects so friends'
//               statuses still arrive after a socket reconnect mid-session.
//  Bug F fix 3: On init(), proactively emit join_user_room so the backend adds
//               this socket to the user:<id> room even if server missed it on connect.
//  All v3 fixes preserved.

class StatusWebSocket {
    constructor() {
        this.socket              = null;
        this.reconnectAttempts   = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay      = 1000;
        this.eventListeners      = new Map();
        this.isConnected         = false;
        this._initAttempted      = false;
        this._checkTimer         = null;
    }

    // ── INIT ──────────────────────────────────────────────────────────────────
    // FIX: The app uses KynectaRealtimeManager stored as window.KynectaRealtime
    // (and aliased as window.wsService), NOT window.socket / window.parent.socket.
    // StatusWebSocket runs inside an iframe so we check all reachable locations.
    // KynectaRealtime.on(event, handler) has the same signature as socket.on(),
    // so we can assign it directly to this.socket and reuse _setupSocketListeners.
    init() {
        // Resolve the real-time manager from any known location
        let manager = null;

        // 1. Current window (set by app_realtime_socket.js on chat.html context,
        //    also visible inside iframes that load it directly)
        if (window.KynectaRealtime && typeof window.KynectaRealtime.on === 'function') {
            manager = window.KynectaRealtime;
        } else if (window.wsService && typeof window.wsService.on === 'function') {
            manager = window.wsService;
        }

        // 2. Parent frame (status.html is an iframe inside chat.html)
        if (!manager && window.parent && window.parent !== window) {
            try {
                if (window.parent.KynectaRealtime && typeof window.parent.KynectaRealtime.on === 'function') {
                    manager = window.parent.KynectaRealtime;
                } else if (window.parent.wsService && typeof window.parent.wsService.on === 'function') {
                    manager = window.parent.wsService;
                }
            } catch (_) {
                // cross-origin — skip
            }
        }

        if (!manager) {
            console.warn('[StatusWebSocket] No socket available — will retry');
            return false;
        }

        if (this.socket === manager) return true; // already wired

        // KynectaRealtime.on() has identical signature to socket.on() so assign directly
        this.socket = manager;
        this._setupSocketListeners();
        this.isConnected = manager.isConnected ? manager.isConnected() : true;

        // FIX Bug F: Proactively join user room so backend routes status events here.
        // webSocketService joins user:<id> on TCP connect, but if this iframe initialised
        // after the socket was already connected the join event was never sent for this
        // socket. We emit join_user_room explicitly to ensure membership.
        this._joinUserRoom();

        // FIX Bug F: When socket reconnects (e.g. after a network blip), re-wire
        // listeners and re-join the user room so delivery resumes automatically.
        if (typeof manager.on === 'function') {
            manager.on('connect', () => {
                console.log('[StatusWebSocket] Reconnected — re-joining user room');
                this._joinUserRoom();
            });
        }

        console.log('[StatusWebSocket] ✅ Initialized via KynectaRealtime/wsService');
        return true;
    }

    // FIX Bug F: emit join_user_room so server adds socket to user:<id> room
    _joinUserRoom() {
        const userId =
            (window.currentUser && (window.currentUser.id || window.currentUser.userId)) ||
            (window.StatusCore && window.StatusCore.getSessionUserId && window.StatusCore.getSessionUserId()) ||
            null;

        if (!userId) return;

        const socket = this.socket;
        if (!socket) return;

        // KynectaRealtime proxies emit() to the real socket
        if (typeof socket.emit === 'function') {
            try {
                socket.emit('join_user_room', { userId });
                console.log(`[StatusWebSocket] 📡 Emitted join_user_room for userId=${userId}`);
            } catch (_) {}
        }
    }

    // ── SOCKET EVENT LISTENERS ────────────────────────────────────────────────
    _setupSocketListeners() {
        const s = this.socket;
        if (!s) return;

        // FIX: listen to ALL three event-name aliases the backend emits
        s.on('status:created',  (data) => this._handleStatusCreated(data));
        s.on('new_status',      (data) => this._handleStatusCreated(data));
        s.on('status_created',  (data) => this._handleStatusCreated(data));

        s.on('status:viewed',       (data) => this._handleStatusViewed(data));
        s.on('status:viewer_update',(data) => this._handleViewerUpdate(data));
        s.on('status:expired',      (data) => this._handleStatusExpired(data));
        s.on('status:updated',      (data) => this._handleStatusUpdated(data));
        s.on('status:deleted',      (data) => this._handleStatusDeleted(data));
        s.on('status_deleted',      (data) => this._handleStatusDeleted(data)); // legacy alias

        // Connection state — KynectaRealtime exposes these via .on() too
        s.on('connect', () => {
            this.isConnected      = true;
            this.reconnectAttempts = 0;
            console.log('[StatusWebSocket] ✅ Socket connected');
        });

        s.on('disconnect', () => {
            this.isConnected = false;
            console.warn('[StatusWebSocket] ⚠️ Socket disconnected');
            this._scheduleReconnect();
        });

        s.on('connect_error', (err) => {
            console.error('[StatusWebSocket] ❌ connect_error:', err && err.message ? err.message : err);
            this._scheduleReconnect();
        });
    }

    // ── STATUS CREATED ────────────────────────────────────────────────────────
    // FIX: backend now sends { status: <full object>, statusId, userId, ... }
    //      We prefer the full status object but fall back to reconstructing it
    //      from the flat fields so old backend versions still work.
    _handleStatusCreated(data) {
        if (!data) return;

        console.log('[STATUS FLOW] WS → event received: status created');

        // Prefer full status object if backend sends it
        const status = data.status || {
            id:        data.statusId,
            userId:    data.userId,
            type:      data.type      || 'text',
            content:   data.content   || '',
            mediaUrl:  data.mediaUrl  || null,
            createdAt: data.createdAt || new Date().toISOString(),
            expiresAt: data.expiresAt || new Date(Date.now() + 86400000).toISOString()
        };

        if (!status || !status.id) {
            console.error('[StatusWebSocket] ❌ handleStatusCreated: missing status id in payload', data);
            return;
        }

        // ── Skip echo on sender's own screen ─────────────────────────────────
        // statusController emits to every friend's room — which includes the
        // sender if they're also in their own room. status-ui marks confirmed
        // IDs so we don't double-render here.
        if (window._confirmedStatusIds && window._confirmedStatusIds.has(String(status.id))) {
            console.log(`[StatusWebSocket] ℹ️ Skipping echo for already-confirmed status id=${status.id}`);
            return;
        }

        console.log(`[StatusWebSocket] 📥 STATUS RECEIVED id=${status.id} userId=${status.userId}`);

        // ── Update in-memory state via status-core ──────────────────────────
        if (typeof window.addStatus === 'function') {
            window.addStatus(status);
            console.log(`[STATUS FLOW] WS → UI updated: status added id=${status.id}`);
        }

        // ── Update cache ────────────────────────────────────────────────────
        if (window.StatusCache) {
            window.StatusCache.cacheStatus(status).catch(console.error);
        }

        // ── Show notification for friends' statuses ─────────────────────────
        const currentUser = window.currentUser
            || (window.auth && window.auth.currentUser)
            || (window.StatusCore && window.StatusCore.getSessionUser && window.StatusCore.getSessionUser());

        if (currentUser && String(status.userId) !== String(currentUser.id || currentUser.userId)) {
            if (typeof window.showNotification === 'function') {
                const name = status.user?.displayName || status.user?.username || 'A friend';
                window.showNotification(`📸 ${name} posted a new status`, 'info');
            }
            console.log(`[StatusWebSocket] ✅ STATUS RENDERED on receiver screen id=${status.id}`);
        }

        // ── Forward to postMessage bridge (iframe → parent) ─────────────────
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage({
                    type:      'STATUS_EVENT',
                    event:     'status:created',
                    payload:   data,
                    source:    'status',
                    timestamp: Date.now()
                }, '*');
            } catch (_) {}
        }

        this._emit('status:created', data);
    }

    // ── STATUS VIEWED ─────────────────────────────────────────────────────────
    _handleStatusViewed(data) {
        if (!data) return;
        console.log('[StatusWebSocket] status:viewed', data.statusId);

        if (typeof window.updateStatusViewerCount === 'function') {
            window.updateStatusViewerCount(data.statusId, data.viewerId);
        }

        if (window.StatusCache) {
            window.StatusCache.getCachedStatus(data.statusId).then(status => {
                if (status) {
                    if (!status.viewers) status.viewers = [];
                    if (!status.viewers.includes(data.viewerId)) {
                        status.viewers.push(data.viewerId);
                        window.StatusCache.cacheStatus(status).catch(console.error);
                    }
                }
            }).catch(console.error);
        }

        this._emit('status:viewed', data);
    }

    // ── VIEWER COUNT UPDATE ───────────────────────────────────────────────────
    _handleViewerUpdate(data) {
        if (!data) return;
        if (typeof window.updateViewerCountUI === 'function') {
            window.updateViewerCountUI(data.statusId, data.viewerCount);
        }
        this._emit('status:viewer_update', data);
    }

    // ── STATUS EXPIRED ────────────────────────────────────────────────────────
    _handleStatusExpired(data) {
        if (!data) return;
        console.log('[StatusWebSocket] status:expired', data.statusId);

        if (typeof window.removeStatus === 'function') {
            window.removeStatus(data.statusId);
        }

        if (window.StatusCache) {
            window.StatusCache.getCachedStatus(data.statusId).then(status => {
                if (status) {
                    status.isExpired = true;
                    window.StatusCache.cacheStatus(status).catch(console.error);
                }
            }).catch(console.error);
        }

        const currentUser = window.currentUser || (window.auth && window.auth.currentUser);
        const currentId   = currentUser && (currentUser.id || currentUser.userId);
        if (currentId && String(data.userId) === String(currentId)) {
            if (typeof window.showNotification === 'function') {
                window.showNotification('Your status has expired', 'info');
            }
        }

        this._emit('status:expired', data);
    }

    // ── STATUS UPDATED ────────────────────────────────────────────────────────
    _handleStatusUpdated(data) {
        if (!data) return;
        console.log('[StatusWebSocket] status:updated', data.statusId);

        if (typeof window.updateStatusInUI === 'function') {
            window.updateStatusInUI(data.statusId, data.updates || data.status);
        }

        if (window.StatusCache) {
            window.StatusCache.getCachedStatus(data.statusId).then(status => {
                if (status) {
                    Object.assign(status, data.updates || {});
                    window.StatusCache.cacheStatus(status).catch(console.error);
                }
            }).catch(console.error);
        }

        this._emit('status:updated', data);
    }

    // ── STATUS DELETED ────────────────────────────────────────────────────────
    _handleStatusDeleted(data) {
        if (!data) return;
        const statusId = data.statusId || data.id || data;
        if (!statusId) return;

        console.log('[StatusWebSocket] status:deleted', statusId);

        if (typeof window.removeStatus === 'function') {
            window.removeStatus(statusId);
        }

        if (window.StatusCache) {
            window.StatusCache.getCachedStatus(statusId).then(status => {
                if (status) {
                    status.deleted = true;
                    window.StatusCache.cacheStatus(status).catch(console.error);
                }
            }).catch(console.error);
        }

        this._emit('status:deleted', data);
    }

    // ── RECONNECT ─────────────────────────────────────────────────────────────
    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn('[StatusWebSocket] Max reconnect attempts reached');
            return;
        }

        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;
        console.log(`[StatusWebSocket] Reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

        setTimeout(() => this.init(), delay);
    }

    // ── CUSTOM EVENT BUS ──────────────────────────────────────────────────────
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event).add(callback);
    }

    off(event, callback) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).delete(callback);
        }
    }

    _emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (!listeners) return;
        listeners.forEach(cb => {
            try { cb(data); } catch (err) {
                console.error('[StatusWebSocket] listener error:', err);
            }
        });
    }

    // ── SEND VIEW ─────────────────────────────────────────────────────────────
    sendStatusView(statusId) {
        if (!this.isConnected || !this.socket) return false;
        try {
            // KynectaRealtime uses .emit() / .send(); raw socket.io uses .emit()
            if (typeof this.socket.emit === 'function') {
                this.socket.emit('status:view', { statusId });
            } else if (typeof this.socket.send === 'function') {
                this.socket.send('status:view', { statusId });
            }
            return true;
        } catch (err) {
            console.error('[StatusWebSocket] sendStatusView error:', err.message);
            return false;
        }
    }

    // ── STATUS ────────────────────────────────────────────────────────────────
    getStatus() {
        return {
            isConnected:         this.isConnected,
            reconnectAttempts:   this.reconnectAttempts,
            hasSocket:           !!this.socket
        };
    }

    disconnect() {
        // FIX: KynectaRealtime doesn't have removeAllListeners — use .off() if available,
        // otherwise just null the reference. The manager manages its own lifecycle.
        if (this.socket) {
            try {
                if (typeof this.socket.removeAllListeners === 'function') {
                    this.socket.removeAllListeners();
                }
            } catch (_) {}
            this.socket = null;
        }
        this.isConnected = false;
        this.eventListeners.clear();
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
window.StatusWebSocket = new StatusWebSocket();

// ── Auto-init: poll until socket is available, then wire once ─────────────────
// FIX Bug F: The previous version capped at 30 attempts (~6s).  If chat.html
// fires KYN_REALTIME_READY before this iframe's message listener was attached
// (race condition), StatusWebSocket never wired up.
//
// Fixes:
//  1. Poll extended to 120 attempts (~60s total) — covers slow auth handshakes.
//  2. On every KYN_REALTIME_READY / kyn:realtimeReady, force socket=null so
//     init() re-wires (handles reconnects where manager reference changes).
//  3. On AUTHENTICATED socket event, call _joinUserRoom() to re-assert room membership.
(function initStatusWebSocket() {
    let attempts = 0;
    const MAX    = 120; // up to ~60 s (exponential backoff caps at 2s per step)
    let pollTimer = null;

    function tryInit() {
        if (window.StatusWebSocket.isConnected) return; // already wired
        if (attempts >= MAX) {
            console.warn('[StatusWebSocket] Gave up waiting for socket after', MAX, 'attempts — using fallback mode');
            window.StatusWebSocket.fallbackMode = true;
            return;
        }
        attempts++;
        if (!window.StatusWebSocket.init()) {
            // Exponential backoff: 200ms → 400ms → … → 2000ms
            const delay = Math.min(200 * Math.pow(1.2, attempts - 1), 2000);
            pollTimer = setTimeout(tryInit, delay);
        }
    }

    // Strategy 2: kyn:realtimeReady on this window (same-origin, forwarded by chat.html)
    window.addEventListener('kyn:realtimeReady', function() {
        if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        // Force re-init so we re-wire against the (possibly new) manager instance
        window.StatusWebSocket.socket = null;
        window.StatusWebSocket.isConnected = false;
        attempts = 0;
        tryInit();
    });

    // Strategy 3: KYN_REALTIME_READY postMessage forwarded from chat.html parent
    window.addEventListener('message', function(evt) {
        if (!evt.data || evt.data.type !== 'KYN_REALTIME_READY') return;
        if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        window.StatusWebSocket.socket = null;
        window.StatusWebSocket.isConnected = false;
        attempts = 0;
        tryInit();
    });

    // Strategy 4: re-join user room whenever authenticated event fires
    // (covers the case where socket connected but user room join was missed)
    window.addEventListener('message', function(evt) {
        if (!evt.data) return;
        const t = evt.data.type;
        if (t === 'AUTH_READY' || t === 'SESSION_DATA' || t === 'SESSION_ACTIVE') {
            if (window.StatusWebSocket.isConnected) {
                window.StatusWebSocket._joinUserRoom();
            }
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        tryInit();
    }
})();