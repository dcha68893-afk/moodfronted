// status-websocket.js — Fixed v3 (2026-04-22)
// SW cache busted: v3 — KynectaRealtime socket detection, kyn:realtimeReady listener
// Key fixes:
//  1. handleStatusCreated: reads status from data.status OR reconstructs from flat fields
//     (backend now sends both — this file handles either shape for resilience)
//  2. Listens for ALL alias event names: status:created, new_status, status_created
//  3. Removed polling fallback that was masking real-time failures
//  4. init() retries without setInterval spam — uses a single backoff attempt
//  5. No more silent failures — every handler logs clearly on success and error

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
        console.log('[StatusWebSocket] ✅ Initialized via KynectaRealtime/wsService');
        return true;
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
// Uses multiple strategies since StatusWebSocket runs inside an iframe:
//  1. Direct polling — catches cases where KynectaRealtime was already ready
//  2. kyn:realtimeReady event — fired on this window if same-origin
//  3. KYN_REALTIME_READY postMessage — forwarded by chat.html into this iframe
(function initStatusWebSocket() {
    let attempts = 0;
    const MAX    = 30; // up to ~6 s of polling at 200ms each

    function tryInit() {
        if (window.StatusWebSocket.isConnected) return; // already done
        if (attempts >= MAX) {
            console.warn('[StatusWebSocket] Gave up waiting for socket after', MAX, 'attempts');
            return;
        }
        attempts++;
        if (!window.StatusWebSocket.init()) {
            setTimeout(tryInit, 200);
        }
    }

    // Strategy 2: kyn:realtimeReady on this window (same-origin, forwarded by chat.html)
    window.addEventListener('kyn:realtimeReady', function() {
        if (!window.StatusWebSocket.isConnected) {
            window.StatusWebSocket.socket = null; // force re-init
            window.StatusWebSocket.init();
        }
    });

    // Strategy 3: KYN_REALTIME_READY postMessage forwarded from chat.html parent
    window.addEventListener('message', function(evt) {
        if (!evt.data || evt.data.type !== 'KYN_REALTIME_READY') return;
        if (!window.StatusWebSocket.isConnected) {
            window.StatusWebSocket.socket = null;
            window.StatusWebSocket.init();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        tryInit();
    }
})();