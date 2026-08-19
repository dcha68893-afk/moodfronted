/**
 * panel-state-bridge.js — Standardized parent/child panel-state contract.
 * (Spec item 6: "Parent Window Listening")
 *
 * WHY THIS FILE EXISTS
 * The app already has several working, independently-evolved ways a child
 * module tells the parent shell what it's doing: CHILD_CLOSING, GO_BACK_TO_LIST,
 * MODULE_FOCUSED/MODULE_BLURRED, CALL_SCREEN_ACTIVE, body classes like
 * .chat-panel-active, etc. Those are left exactly as-is (item 11: no
 * regressions) — this file does NOT replace them.
 *
 * What was missing was a single, consistently-named event contract any
 * module (or any panel WITHIN a module — a modal, an overlay, a sub-screen)
 * can emit so the parent shell always has one place to look, instead of
 * bolting on another one-off message type per feature. This file adds
 * exactly that, as a thin layer on top of the existing postMessage system:
 *
 *   PanelOpened  — a panel/modal/overlay/sub-screen became visible
 *   PanelClosed  — it was dismissed
 *   PanelFocused — this module/panel became the active one
 *   PanelHidden  — this module/panel is no longer visible (backgrounded,
 *                  not necessarily closed — e.g. switched away from)
 *
 * Loaded in every module iframe (same pages that already load back-nav.js)
 * AND in the parent shell (chat.html). Detects which context it's in by
 * checking window.parent !== window.
 */
(function () {
    'use strict';

    var MODULE_NAME = (document.body && document.body.dataset && document.body.dataset.module) ||
        (window.location.pathname.split('/').pop() || '').replace('.html', '') || 'unknown';

    // ------------------------------------------------------------------
    // CHILD SIDE — running inside an iframe
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

        try {
            var observedRoot = document.body;
            if (observedRoot && 'MutationObserver' in window) {
                var mo = new MutationObserver(function (mutations) {
                    mutations.forEach(function (m) {
                        if (m.type !== 'attributes') return;
                        var el = m.target;
                        if (!el.hasAttribute || !el.hasAttribute('data-panel')) return;
                        var isVisible = el.classList.contains('active') ||
                            el.classList.contains('open') ||
                            (el.style && (el.style.display === 'flex' || el.style.display === 'block'));
                        var panelId = el.getAttribute('data-panel');
                        if (isVisible && el.dataset.__kynPanelState !== 'open') {
                            el.dataset.__kynPanelState = 'open';
                            send('PanelOpened', panelId);
                        } else if (!isVisible && el.dataset.__kynPanelState === 'open') {
                            el.dataset.__kynPanelState = 'closed';
                            send('PanelClosed', panelId);
                        }
                    });
                });
                mo.observe(observedRoot, {
                    attributes: true, subtree: true,
                    attributeFilter: ['class', 'style']
                });
            }
        } catch (_) {}

        document.addEventListener('visibilitychange', function () {
            send(document.hidden ? 'PanelHidden' : 'PanelFocused', null);
        });
    }

    // ------------------------------------------------------------------
    // PARENT SIDE — the top-level shell (chat.html)
    // ------------------------------------------------------------------
    if (window.parent === window) {
        window.__kynPanelState = window.__kynPanelState || {};

        window.addEventListener('message', function (event) {
            var data = event.data;
            if (!data || typeof data !== 'object') return;
            var type = data.type;
            if (type !== 'PanelOpened' && type !== 'PanelClosed' &&
                type !== 'PanelFocused' && type !== 'PanelHidden') return;

            var mod = data.module || 'unknown';
            window.__kynPanelState[mod] = window.__kynPanelState[mod] || {};

            if (type === 'PanelOpened') {
                window.__kynPanelState[mod].panel = data.panel || true;
            } else if (type === 'PanelClosed') {
                window.__kynPanelState[mod].panel = null;
            } else if (type === 'PanelFocused') {
                window.__kynPanelState[mod].focused = true;
            } else if (type === 'PanelHidden') {
                window.__kynPanelState[mod].focused = false;
            }

            try {
                document.dispatchEvent(new CustomEvent('kyn:panelstate', {
                    detail: { module: mod, type: type, panel: data.panel, state: window.__kynPanelState[mod] }
                }));
            } catch (_) {}
        });

        // ================================================================
        // MESSAGE NOTIFICATION + PRESENCE HARDENING
        // ================================================================
        // The screenshot bug was not an encryption failure. The message was
        // already delivered/decrypted by the receiver, but the shell banner
        // was receiving the transport envelope and rendering it verbatim.
        // Never display an E2E envelope as notification text.

        var _presenceRequests = new Map();
        var PRESENCE_REQUEST_TTL = 4000;

        function _looksEncrypted(value) {
            if (value && typeof value === 'object') return true;
            if (typeof value !== 'string') return false;
            var text = value.trim();
            if (!text || text.charAt(0) !== '{') return false;
            try {
                var obj = JSON.parse(text);
                return !!obj && typeof obj === 'object' &&
                    (('v' in obj) || ('kid' in obj) || ('ct' in obj) ||
                     ('iv' in obj) || ('eph' in obj) || ('sid' in obj) || ('n' in obj));
            } catch (_) { return false; }
        }

        function _safePreview(value) {
            if (typeof value !== 'string' || !value.trim() || _looksEncrypted(value)) {
                return 'You have a new message';
            }
            return value.trim().slice(0, 240);
        }

        function _requestAuthoritativePresence(userId) {
            var uid = String(userId || '');
            if (!uid) return;
            var now = Date.now();
            var previous = _presenceRequests.get(uid) || 0;
            if (now - previous < PRESENCE_REQUEST_TTL) return;
            _presenceRequests.set(uid, now);

            try {
                var rt = window.KynectaRealtime;
                if (rt && typeof rt.emit === 'function') {
                    var result = rt.emit('check_user_online', { targetUserId: uid }, { retry: false });
                    if (result && typeof result.catch === 'function') result.catch(function () {});
                }
            } catch (_) {}
        }

        function _broadcastPresence(payload) {
            if (!payload || payload.userId == null) return;
            var normalized = {
                userId: String(payload.userId),
                online: payload.online === true,
                timestamp: payload.timestamp || Date.now(),
                source: 'server-authoritative'
            };

            // PresenceEngineFoundation already listens to window.postMessage.
            try {
                window.dispatchEvent(new CustomEvent('kyn:authoritativePresence', { detail: normalized }));
            } catch (_) {}

            try {
                document.querySelectorAll('iframe').forEach(function (frame) {
                    try { frame.contentWindow.postMessage({ type: 'user_online_status', ...normalized }, '*'); } catch (_) {}
                });
            } catch (_) {}

            // Also update generic parent-shell presence elements if a module
            // exposes data-user-id/data-peer-id. Do not touch arbitrary text.
            try {
                var selector = '[data-user-id="' + CSS.escape(normalized.userId) + '"], [data-peer-id="' + CSS.escape(normalized.userId) + '"]';
                document.querySelectorAll(selector).forEach(function (node) {
                    var role = (node.getAttribute('data-presence-role') || '').toLowerCase();
                    if (role && role !== 'status' && role !== 'presence') return;
                    if (node.classList.contains('chat-status') ||
                        node.classList.contains('presence-status') ||
                        node.classList.contains('chat-status-text') ||
                        node.classList.contains('online-status')) {
                        node.textContent = normalized.online ? 'online' : 'offline';
                        node.classList.toggle('online', normalized.online);
                        node.classList.toggle('offline', !normalized.online);
                    }
                });
            } catch (_) {}
        }

        function _showIncomingMessageBanner(data) {
            var detail = data && (data.detail || data);
            var message = detail && (detail.message || detail);
            if (!message) return;

            var senderId = message.senderId || message.userId;
            var myId = window.cachedUserId || window.SessionManager?.getUserId?.() || window.SessionManager?.getCurrentUserId?.();
            if (myId && senderId && String(myId) === String(senderId)) return;

            var chatId = detail.chatId || message.chatId || message.conversationId;
            if (senderId) _requestAuthoritativePresence(senderId);

            var body = _safePreview(message.content);
            var title = message.senderName || message.sender || message.username || 'New message';

            // If the child already decrypted the message, its content is used.
            // If it did not, the shell deliberately shows a generic preview —
            // raw ciphertext must never be exposed in a notification.
            try {
                if (window.NotifStab && typeof window.NotifStab.notifyApp === 'function') {
                    window.NotifStab.notifyApp(title, body, {
                        module: 'dm',
                        contextId: chatId || senderId || 'message',
                        icon: '💬'
                    });
                }
            } catch (_) {}
        }

        window.addEventListener('message', function (event) {
            var data = event && event.data;
            if (!data || typeof data !== 'object') return;

            if (data.type === 'kyn:incomingMessage') {
                _showIncomingMessageBanner(data);
                return;
            }

            if (data.type === 'user_online_status' || data.type === 'presence:user_online_status') {
                _broadcastPresence(data);
            }
        });

        function _bindPresenceBus() {
            var bus = window.KynectaEventBus || window.appEvents;
            if (!bus || typeof bus.on !== 'function') return false;
            if (window.__kynPanelPresenceBusBound) return true;
            window.__kynPanelPresenceBusBound = true;
            bus.on('SOCKET_EVENT', function (payload) {
                if (!payload) return;
                if (payload.type === 'user_online_status') _broadcastPresence(payload);
                if (payload.type === 'user:online' || payload.type === 'presence:online') {
                    _broadcastPresence({ userId: payload.userId || payload.user?.id, online: true, timestamp: payload.timestamp });
                }
                if (payload.type === 'user:offline' || payload.type === 'presence:offline') {
                    _broadcastPresence({ userId: payload.userId || payload.user?.id, online: false, timestamp: payload.timestamp });
                }
            });
            return true;
        }

        _bindPresenceBus();
        var _presenceBusTimer = setInterval(function () {
            if (_bindPresenceBus()) clearInterval(_presenceBusTimer);
        }, 500);
        setTimeout(function () { clearInterval(_presenceBusTimer); }, 15000);
    }
})();
