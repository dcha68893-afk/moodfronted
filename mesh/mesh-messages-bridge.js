/**
 * mesh-messages-bridge.js
 *
 * Bridges MeshEngine ↔ messages-core / messages-ui.
 *
 * Responsibilities:
 *  1. Intercept outgoing messages when offline → route via MeshEngine
 *  2. Inject incoming mesh messages into the active chat UI
 *  3. Update delivery indicators (mesh state icons)
 *  4. Register this device with the mesh relay server
 *  5. Handle mesh-specific postMessage events from parent iframe
 */
'use strict';

(function _installMeshMessagesBridge() {

    // ── Wait for MeshEngine + messages-core to be ready ───────────────────
    let _bridgeInstalled = false;

    function _tryInstall() {
        if (_bridgeInstalled) return;
        if (!window.MeshEngine || !window.MeshTransport) {
            setTimeout(_tryInstall, 500);
            return;
        }
        _bridgeInstalled = true;
        _install();
    }

    function _install() {
        const myDeviceId = MeshEngine.getDeviceId();

        // ── 1. Register device with backend mesh relay ─────────────────────
        function _registerWithRelay() {
            const ws = window.wsService;
            if (!ws) return;
            const userId = _getMyUserId();
            ws.emit('mesh:register_device', { deviceId: myDeviceId, userId });
            console.log('[MeshBridge] Registered device with relay:', myDeviceId);
        }

        // Register now and on every reconnect
        _registerWithRelay();
        window.addEventListener('kyn:realtimeReady', _registerWithRelay);
        if (window.wsService) {
            window.wsService.on('connect', _registerWithRelay);
        }

        // ── 2. Intercept send — if offline, route via mesh ─────────────────
        function _hookSendMessage() {
            const core = window.messagesCore || window.getMessagesCore?.();
            if (!core || core.__meshHooked) return;
            core.__meshHooked = true;

            const _origSend = core.sendMessage?.bind(core);
            if (!_origSend) return;

            core.sendMessage = async function meshSendInterceptor(opts) {
                // Always try normal path first
                try {
                    const result = await _origSend(opts);
                    if (result && result.success !== false) return result;
                } catch (_) {}

                // Normal send failed — try mesh
                if (!MeshEngine.isOnline()) {
                    const toDeviceId = _resolveDeviceId(opts.to || opts.userId);
                    return MeshEngine.sendMessage({
                        to         : opts.to || opts.userId,
                        toDeviceId,
                        content    : opts.content || opts.message,
                        type       : opts.type || 'text',
                        chatId     : opts.chatId,
                        messageId  : opts.messageId || opts.tempId,
                        priority   : opts.priority || 1,
                    });
                }
                throw new Error('SEND_FAILED');
            };
            console.log('[MeshBridge] sendMessage interceptor installed');
        }

        // ── 3. Incoming mesh message → inject into chat UI ─────────────────
        MeshEngine.on('message_received', function(msg) {
            console.log('[MeshBridge] Incoming mesh message:', msg.messageId);
            _injectMessageToUI(msg);
        });
        window.addEventListener('mesh:message_received', function(e) {
            _injectMessageToUI(e.detail || {});
        });

        function _injectMessageToUI(msg) {
            const { messageId, chatId, from, content, type, timestamp, hops } = msg;

            // Try to use messages-core directly
            const core = window.messagesCore || window.getMessagesCore?.();
            if (core && typeof core.handleRealtimePayload === 'function') {
                core.handleRealtimePayload('message:new', {
                    id        : messageId,
                    chatId,
                    senderId  : from,
                    content,
                    type,
                    createdAt : new Date(timestamp).toISOString(),
                    meshRelay : true,
                    hopCount  : hops,
                });
                return;
            }

            // Fallback: postMessage to parent
            window.parent?.postMessage({
                type   : 'REALTIME_EVENT:message:new',
                payload: { id: messageId, chatId, senderId: from, content, type, createdAt: new Date(timestamp).toISOString(), meshRelay: true },
            }, '*');
        }

        // ── 4. Delivery state → update message bubble indicator ────────────
        MeshEngine.on('delivery_state_changed', function({ messageId, state }) {
            _updateDeliveryBubble(messageId, state);
        });

        function _updateDeliveryBubble(messageId, state) {
            const stateIcons = {
                queued           : { icon: '⏳', title: 'Queued for delivery',          color: '#9ca3af' },
                searching_route  : { icon: '🔍', title: 'Finding nearby relay…',        color: '#f59e0b' },
                relaying         : { icon: '📡', title: 'Relaying through nearby peer', color: '#60a5fa' },
                delivered        : { icon: '✓✓', title: 'Delivered via mesh',           color: '#34d399' },
                failed           : { icon: '✗',  title: 'Delivery failed',              color: '#ef4444' },
                expired          : { icon: '⌛', title: 'Message expired',              color: '#6b7280' },
            };
            const info = stateIcons[state] || { icon: '•', title: state, color: '#9ca3af' };
            document.querySelectorAll(
                `[data-message-id="${messageId}"] .delivery-indicator,
                 [data-id="${messageId}"] .delivery-indicator`
            ).forEach(el => {
                el.textContent = info.icon;
                el.style.color = info.color;
                el.title = info.title;
                el.dataset.meshState = state;
            });
        }

        // ── 5. Handle MESH_DELIVER from parent frame ───────────────────────
        window.addEventListener('message', function(evt) {
            if (!evt.data || typeof evt.data !== 'object') return;
            if (evt.data.type === 'MESH_DELIVER') {
                const p = evt.data.payload || {};
                MeshEngine.sendMessage(p).catch(function(){});
            }
        });

        // ── 6. Offline/online state updates in the chat input ──────────────
        function _updateChatInputState() {
            const online = MeshEngine.isOnline();
            const peers  = MeshEngine.getPeerCount();
            document.querySelectorAll('.message-input-area, .chat-input-container').forEach(el => {
                el.dataset.meshOnline = online ? 'true' : 'false';
            });
            document.querySelectorAll('#sendBtn, .send-btn, [data-action="send"]').forEach(btn => {
                if (!online && peers === 0) {
                    btn.title = 'Offline — message will send when connected';
                } else if (!online && peers > 0) {
                    btn.title = `Send via ${peers} nearby relay${peers>1?'s':''}`;
                } else {
                    btn.title = 'Send message';
                }
            });
        }

        setInterval(_updateChatInputState, 5000);
        window.addEventListener('online',  _updateChatInputState);
        window.addEventListener('offline', _updateChatInputState);
        _updateChatInputState();

        // Hook send after core ready
        setTimeout(_hookSendMessage, 2000);
        document.addEventListener('kyn:coreReady', _hookSendMessage);

        console.log('[MeshBridge] ✅ Bridge installed for device', myDeviceId);
    }

    // ── Helpers ────────────────────────────────────────────────────────────
    function _getMyUserId() {
        try {
            const session = JSON.parse(localStorage.getItem('kyn_session') || localStorage.getItem('user_session') || '{}');
            return session.userId || session.id || session.user?.id || null;
        } catch(_) { return null; }
    }

    function _resolveDeviceId(userId) {
        // Try to get the target device ID from a peer map or profile cache
        try {
            const profiles = JSON.parse(localStorage.getItem('kyn_peer_device_ids') || '{}');
            return profiles[String(userId)] || null;
        } catch(_) { return null; }
    }

    _tryInstall();
    console.log('[MeshBridge] Waiting for MeshEngine…');
})();
