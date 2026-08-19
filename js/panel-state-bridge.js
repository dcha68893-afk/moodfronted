/**
 * panel-state-bridge.js
 * Standardized parent/child panel state plus cross-frame notification/presence
 * hardening. Loaded by chat.html and its module iframes.
 */
(function () {
    'use strict';

    var MODULE_NAME = (document.body && document.body.dataset && document.body.dataset.module) ||
        (window.location.pathname.split('/').pop() || '').replace('.html', '') || 'unknown';

    function looksEncrypted(value) {
        if (typeof value !== 'string') return false;
        var text = value.trim();
        if (!text || text.charAt(0) !== '{') return false;
        try {
            var obj = JSON.parse(text);
            return !!obj && typeof obj === 'object' &&
                (('v' in obj) || ('kid' in obj) || ('ct' in obj) || ('iv' in obj) ||
                 ('eph' in obj) || ('sid' in obj) || ('n' in obj));
        } catch (_) { return false; }
    }

    function safePreview(value) {
        if (typeof value !== 'string' || !value.trim() || looksEncrypted(value)) {
            return 'You have a new message';
        }
        return value.trim().slice(0, 240);
    }

    // Patch the presence engine's known offline-event bug without replacing
    // the engine. The original _markOffline mutates prev.status before testing
    // whether it changed, so the offline transition can be silently swallowed.
    // This wrapper emits the missing transition after the original bookkeeping.
    function installPresenceEnginePatch() {
        var engine = window.PresenceEngine;
        if (!engine || engine.__kynPresenceBridgePatched) return !!engine;
        engine.__kynPresenceBridgePatched = true;
        if (typeof engine._markOffline === 'function') {
            var originalOffline = engine._markOffline.bind(engine);
            engine._markOffline = function (userId, meta) {
                var before = this._onlineUsers && this._onlineUsers.get(String(userId));
                var wasOnline = !!before && before.status !== 'offline';
                originalOffline(userId, meta || {});
                if (wasOnline && typeof this._emit === 'function') {
                    try { this._emit({ event: 'presence:change', userId: String(userId), status: 'offline' }); } catch (_) {}
                }
            };
        }
        return true;
    }

    // ------------------------------------------------------------------
    // CHILD SIDE
    // ------------------------------------------------------------------
    if (window.parent && window.parent !== window) {
        function send(type, panelId, extra) {
            try {
                window.parent.postMessage(Object.assign({
                    type: type,
                    module: MODULE_NAME,
                    panel: panelId || null,
                    timestamp: Date.now()
                }, extra || {}), '*');
            } catch (_) {}
        }

        window.KynPanel = {
            opened: function (panelId) { send('PanelOpened', panelId); },
            closed: function (panelId) { send('PanelClosed', panelId); },
            focused: function () { send('PanelFocused', null); },
            hidden: function () { send('PanelHidden', null); }
        };

        if (!window.__kynNotificationPreviewBridge) {
            window.__kynNotificationPreviewBridge = true;
            window.addEventListener('kyn:incomingMessage', function (event) {
                try {
                    var detail = event.detail || {};
                    var message = detail.message || detail;
                    if (!message || !message.senderId || !looksEncrypted(message.content)) return;
                    var started = Date.now();
                    var poll = function () {
                        if (message.content && !looksEncrypted(message.content)) {
                            window.parent.postMessage({
                                type: 'KYN_DECRYPTED_NOTIFICATION_PREVIEW',
                                preview: {
                                    id: message.id || message.serverId || message.localId || null,
                                    chatId: detail.chatId || message.chatId || message.conversationId || null,
                                    senderId: message.senderId,
                                    senderName: (message.sender && (message.sender.displayName || message.sender.username)) ||
                                                message.senderName || message.displayName || message.username || 'New message',
                                    content: String(message.content).slice(0, 240),
                                    timestamp: Date.now()
                                }
                            }, '*');
                            return;
                        }
                        if (Date.now() - started < 3500) setTimeout(poll, 100);
                    };
                    setTimeout(poll, 80);
                } catch (_) {}
            });
        }

        try {
            var observedRoot = document.body;
            if (observedRoot && 'MutationObserver' in window) {
                var mo = new MutationObserver(function (mutations) {
                    mutations.forEach(function (m) {
                        if (m.type !== 'attributes') return;
                        var el = m.target;
                        if (!el.hasAttribute || !el.hasAttribute('data-panel')) return;
                        var visible = el.classList.contains('active') || el.classList.contains('open') ||
                            (el.style && (el.style.display === 'flex' || el.style.display === 'block'));
                        var panelId = el.getAttribute('data-panel');
                        if (visible && el.dataset.__kynPanelState !== 'open') {
                            el.dataset.__kynPanelState = 'open'; send('PanelOpened', panelId);
                        } else if (!visible && el.dataset.__kynPanelState === 'open') {
                            el.dataset.__kynPanelState = 'closed'; send('PanelClosed', panelId);
                        }
                    });
                });
                mo.observe(observedRoot, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
            }
        } catch (_) {}

        document.addEventListener('visibilitychange', function () {
            send(document.hidden ? 'PanelHidden' : 'PanelFocused', null);
        });

        var childPresenceTimer = setInterval(function () {
            if (installPresenceEnginePatch()) clearInterval(childPresenceTimer);
        }, 300);
        setTimeout(function () { clearInterval(childPresenceTimer); }, 15000);
    }

    // ------------------------------------------------------------------
    // PARENT SIDE
    // ------------------------------------------------------------------
    if (window.parent === window) {
        window.__kynPanelState = window.__kynPanelState || {};

        var presenceRequests = new Map();
        var PRESENCE_TTL = 4000;

        function requestPresence(userId) {
            var uid = String(userId || '');
            if (!uid) return;
            var now = Date.now();
            if (now - (presenceRequests.get(uid) || 0) < PRESENCE_TTL) return;
            presenceRequests.set(uid, now);
            try {
                var rt = window.KynectaRealtime;
                if (rt && typeof rt.emit === 'function') {
                    var p = rt.emit('check_user_online', { targetUserId: uid }, { retry: false });
                    if (p && typeof p.catch === 'function') p.catch(function () {});
                }
            } catch (_) {}
        }

        function broadcastPresence(payload) {
            if (!payload || payload.userId == null) return;
            var normalized = {
                userId: String(payload.userId),
                online: payload.online === true,
                timestamp: payload.timestamp || Date.now(),
                source: 'server-authoritative'
            };
            try { installPresenceEnginePatch(); } catch (_) {}
            try {
                var engine = window.PresenceEngine;
                if (engine) {
                    if (normalized.online && typeof engine._markOnline === 'function') engine._markOnline(normalized.userId, normalized);
                    else if (!normalized.online && typeof engine._markOffline === 'function') engine._markOffline(normalized.userId, normalized);
                }
            } catch (_) {}
            try { window.dispatchEvent(new CustomEvent('kyn:authoritativePresence', { detail: normalized })); } catch (_) {}
            try {
                document.querySelectorAll('iframe').forEach(function (frame) {
                    try {
                        frame.contentWindow.postMessage({
                            type: normalized.online ? 'user:online' : 'user:offline',
                            userId: normalized.userId,
                            online: normalized.online,
                            timestamp: normalized.timestamp,
                            source: normalized.source
                        }, '*');
                    } catch (_) {}
                });
            } catch (_) {}
        }

        if (!window.__kynEncryptedNotificationGuard) {
            window.__kynEncryptedNotificationGuard = true;
            try {
                var OriginalNotification = window.Notification;
                if (typeof OriginalNotification === 'function') {
                    var pending = new Map();
                    var WrappedNotification = function (title, options) {
                        options = options || {};
                        var body = options.body || '';
                        if (!looksEncrypted(body)) return new OriginalNotification(title, options);
                        var key = String(options.tag || ('encrypted-' + Date.now()));
                        var timer = setTimeout(function () {
                            var entry = pending.get(key);
                            if (!entry) return;
                            pending.delete(key);
                            try {
                                new OriginalNotification(entry.title, Object.assign({}, entry.options, { body: 'You have a new message' }));
                            } catch (_) {}
                        }, 3800);
                        pending.set(key, { title: title || 'New message', options: options, timer: timer });
                        return { close: function () {} };
                    };
                    try { Object.setPrototypeOf(WrappedNotification, OriginalNotification); } catch (_) {}
                    window.Notification = WrappedNotification;
                    window.__kynOriginalNotification = OriginalNotification;
                    window.__kynPendingEncryptedNotifications = pending;
                }
            } catch (_) {}
        }

        function showIncomingBanner(data) {
            var detail = data && (data.detail || data);
            var message = detail && (detail.message || detail);
            if (!message) return;
            var senderId = message.senderId || message.userId;
            var myId = window.cachedUserId || window.SessionManager?.getUserId?.() || window.SessionManager?.getCurrentUserId?.();
            if (myId && senderId && String(myId) === String(senderId)) return;
            var chatId = detail.chatId || message.chatId || message.conversationId;
            if (senderId) requestPresence(senderId);
            var body = safePreview(message.content);
            var title = message.senderName || message.sender || message.username || 'New message';
            try {
                if (window.NotifStab && typeof window.NotifStab.notifyApp === 'function') {
                    window.NotifStab.notifyApp(title, body, { module: 'dm', contextId: chatId || senderId || 'message', icon: '💬' });
                }
            } catch (_) {}
        }

        window.addEventListener('message', function (event) {
            var data = event && event.data;
            if (!data || typeof data !== 'object') return;

            if (data.type === 'KYN_DECRYPTED_NOTIFICATION_PREVIEW' && data.preview) {
                var preview = data.preview;
                if (!preview.content || looksEncrypted(preview.content)) return;
                var map = window.__kynPendingEncryptedNotifications;
                if (map) {
                    var matched = null;
                    map.forEach(function (entry, key) {
                        var tag = entry.options && entry.options.tag ? String(entry.options.tag) : '';
                        if (!matched && (!tag || tag.indexOf(String(preview.id || '')) !== -1 || tag.indexOf(String(preview.chatId || '')) !== -1)) matched = key;
                    });
                    if (matched) {
                        var entry = map.get(matched);
                        map.delete(matched);
                        clearTimeout(entry.timer);
                        try {
                            new window.__kynOriginalNotification(preview.senderName || entry.title || 'New message', Object.assign({}, entry.options, { body: safePreview(preview.content) }));
                        } catch (_) {}
                    }
                }
                return;
            }

            if (data.type === 'kyn:incomingMessage') {
                showIncomingBanner(data);
                return;
            }
            if (data.type === 'user_online_status' || data.type === 'presence:user_online_status') {
                broadcastPresence(data);
                return;
            }

            var type = data.type;
            if (type !== 'PanelOpened' && type !== 'PanelClosed' && type !== 'PanelFocused' && type !== 'PanelHidden') return;
            var mod = data.module || 'unknown';
            window.__kynPanelState[mod] = window.__kynPanelState[mod] || {};
            if (type === 'PanelOpened') window.__kynPanelState[mod].panel = data.panel || true;
            else if (type === 'PanelClosed') window.__kynPanelState[mod].panel = null;
            else if (type === 'PanelFocused') window.__kynPanelState[mod].focused = true;
            else if (type === 'PanelHidden') window.__kynPanelState[mod].focused = false;
            try { document.dispatchEvent(new CustomEvent('kyn:panelstate', { detail: { module: mod, type: type, panel: data.panel, state: window.__kynPanelState[mod] } })); } catch (_) {}
        });

        function bindPresenceBus() {
            var bus = window.KynectaEventBus || window.appEvents;
            if (!bus || typeof bus.on !== 'function' || window.__kynPanelPresenceBusBound) return !!window.__kynPanelPresenceBusBound;
            window.__kynPanelPresenceBusBound = true;
            bus.on('SOCKET_EVENT', function (payload) {
                if (!payload) return;
                if (payload.type === 'user_online_status') broadcastPresence(payload);
                else if (payload.type === 'user:online' || payload.type === 'presence:online') broadcastPresence({ userId: payload.userId || payload.user?.id, online: true, timestamp: payload.timestamp });
                else if (payload.type === 'user:offline' || payload.type === 'presence:offline') broadcastPresence({ userId: payload.userId || payload.user?.id, online: false, timestamp: payload.timestamp });
            });
            return true;
        }
        installPresenceEnginePatch();
        bindPresenceBus();
        var presenceTimer = setInterval(function () {
            installPresenceEnginePatch();
            if (bindPresenceBus()) clearInterval(presenceTimer);
        }, 500);
        setTimeout(function () { clearInterval(presenceTimer); }, 15000);
    }
})();
