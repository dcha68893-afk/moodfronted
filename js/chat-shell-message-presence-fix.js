/**
 * chat-shell-message-presence-fix.js
 *
 * Parent-shell bridge for 1:1 messages.
 *
 * Responsibilities:
 *  1. Never show an encrypted E2E envelope as an in-app notification preview.
 *  2. Decrypt an already-received message in the trusted browser context when
 *     keys are available; otherwise show a safe generic preview.
 *  3. Ask the backend's authoritative Socket.IO presence registry whether the
 *     sender/peer is currently connected and broadcast that answer to all
 *     module iframes.
 *  4. Keep online/idle/typing/backgrounded states from being rendered as
 *     "offline" by downstream message-module presence consumers.
 *
 * This does NOT weaken E2E. Plaintext is never sent to the backend or service
 * worker. It exists only in browser memory for the notification UI.
 */
(function () {
    'use strict';

    if (window.__KynChatShellMessagePresenceFix) return;
    window.__KynChatShellMessagePresenceFix = true;

    const statusRequests = new Map();
    const REQUEST_TTL_MS = 4000;

    function runtimeEmit(event, payload) {
        try {
            const rt = window.KynectaRealtime;
            if (rt && typeof rt.emit === 'function') {
                const result = rt.emit(event, payload, { retry: false });
                if (result && typeof result.catch === 'function') result.catch(() => {});
                return true;
            }
        } catch (_) {}
        return false;
    }

    function broadcastToModules(type, payload) {
        try {
            window.dispatchEvent(new CustomEvent(type, { detail: payload }));
        } catch (_) {}
        try {
            document.querySelectorAll('iframe').forEach((frame) => {
                try {
                    frame.contentWindow.postMessage({ type, ...payload }, '*');
                } catch (_) {}
            });
        } catch (_) {}
    }

    function requestPresence(userId) {
        const uid = String(userId || '');
        if (!uid) return;
        const now = Date.now();
        const previous = statusRequests.get(uid) || 0;
        if (now - previous < REQUEST_TTL_MS) return;
        statusRequests.set(uid, now);
        runtimeEmit('check_user_online', { targetUserId: uid });
    }

    function applyPresence(payload) {
        if (!payload || payload.userId == null) return;
        const normalized = {
            userId: String(payload.userId),
            online: payload.online === true,
            timestamp: payload.timestamp || Date.now(),
            source: 'server-authoritative'
        };

        // Tell every iframe. PresenceEngineFoundation already understands
        // window messages and will update its local cache immediately.
        broadcastToModules('kyn:authoritativePresence', normalized);
        broadcastToModules('user_online_status', normalized);

        // Best-effort DOM update for parent-shell headers/status labels. The
        // selectors are intentionally generic so this remains compatible with
        // header revisions and module-specific status elements.
        try {
            const uid = normalized.userId;
            const nodes = document.querySelectorAll(
                `[data-user-id="${CSS.escape(uid)}"], ` +
                `[data-peer-id="${CSS.escape(uid)}"]`
            );
            nodes.forEach((node) => {
                const role = (node.getAttribute('data-presence-role') || '').toLowerCase();
                if (role && role !== 'status' && role !== 'presence') return;
                if (node.classList.contains('chat-status') || node.classList.contains('presence-status') ||
                    node.classList.contains('chat-status-text') || node.classList.contains('online-status')) {
                    node.textContent = normalized.online ? 'online' : 'offline';
                    node.classList.toggle('online', normalized.online);
                    node.classList.toggle('offline', !normalized.online);
                }
            });
        } catch (_) {}
    }

    function looksEncrypted(value) {
        if (value && typeof value === 'object') return true;
        if (typeof value !== 'string') return false;
        const text = value.trim();
        if (!text || text[0] !== '{') return false;
        try {
            const obj = JSON.parse(text);
            return !!obj && typeof obj === 'object' &&
                (('v' in obj) || ('kid' in obj) || ('ct' in obj) ||
                 ('iv' in obj) || ('eph' in obj) || ('sid' in obj) || ('n' in obj));
        } catch (_) {
            return false;
        }
    }

    async function getNotificationText(message, chatId) {
        let value = message && message.content;
        if (!looksEncrypted(value)) {
            return typeof value === 'string' && value.trim()
                ? value.trim().slice(0, 240)
                : 'You have a new message';
        }

        // The parent shell has its own KynectaE2E instance. If its keys/session
        // are ready, decrypt locally. Never send the plaintext anywhere else.
        try {
            if (window.KynectaE2E && typeof window.KynectaE2E.decryptFromChat === 'function') {
                const senderId = message.senderId || message.userId;
                if (senderId && chatId) {
                    const plain = await window.KynectaE2E.decryptFromChat(
                        String(value), String(chatId), String(senderId)
                    );
                    if (plain && plain !== value && !looksEncrypted(plain)) {
                        return String(plain).slice(0, 240);
                    }
                }
            }
        } catch (_) {}

        // Critical privacy rule: never expose ciphertext JSON as UI text.
        return 'You have a new message';
    }

    async function showIncomingMessageNotification(detail) {
        const message = detail && (detail.message || detail);
        if (!message) return;

        const senderId = message.senderId || message.userId;
        const myId = window.cachedUserId || window.SessionManager?.getUserId?.();
        if (myId && senderId && String(myId) === String(senderId)) return;

        const chatId = detail.chatId || message.chatId || message.conversationId;
        if (senderId) requestPresence(senderId);

        const body = await getNotificationText(message, chatId);
        const title = message.senderName || message.sender || message.username || 'New message';

        // Use the existing centralized in-app banner when available. This is
        // the banner visible in the screenshot and prevents raw ciphertext
        // from reaching it.
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

    // Parent receives this from messages-core.ui-bridge.js.
    window.addEventListener('message', function (event) {
        const data = event && event.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === 'kyn:incomingMessage') {
            showIncomingMessageNotification(data.detail || data).catch(() => {});
            return;
        }

        if (data.type === 'user_online_status' || data.type === 'presence:user_online_status') {
            applyPresence(data);
        }
    });

    // EventBus path used by app.realtime.socket.js.
    function bindEventBus() {
        const bus = window.KynectaEventBus || window.appEvents;
        if (!bus || typeof bus.on !== 'function') return false;
        if (window.__KynChatShellPresenceBusBound) return true;
        window.__KynChatShellPresenceBusBound = true;
        bus.on('SOCKET_EVENT', function (payload) {
            if (!payload) return;
            if (payload.type === 'user_online_status') applyPresence(payload);
            if (payload.type === 'user:online' || payload.type === 'presence:online') {
                applyPresence({ userId: payload.userId || payload.user?.id, online: true, timestamp: payload.timestamp });
            }
            if (payload.type === 'user:offline' || payload.type === 'presence:offline') {
                applyPresence({ userId: payload.userId || payload.user?.id, online: false, timestamp: payload.timestamp });
            }
        });
        return true;
    }

    bindEventBus();
    const busTimer = setInterval(() => {
        if (bindEventBus()) clearInterval(busTimer);
    }, 500);
    setTimeout(() => clearInterval(busTimer), 15000);

    // Any incoming message gives us a reliable peer id. Ask the authoritative
    // backend immediately so the header cannot remain on a stale offline value.
    window.addEventListener('message', function (event) {
        const data = event && event.data;
        if (!data || data.type !== 'kyn:incomingMessage') return;
        const message = data.detail?.message || data.detail;
        if (message?.senderId) requestPresence(message.senderId);
    });

    console.log('[ChatShellFix] ✅ notification/presence bridge ready');
})();
