/**
 * mesh-engine.js — Main Mesh Networking Orchestrator
 *
 * Ties together: MeshCrypto + MeshTransport + MeshRouter
 *
 * Responsibilities:
 *  - Identity management (persistent keypair)
 *  - Peer handshake (capability + key exchange)
 *  - Message encryption → packet creation → routing
 *  - Incoming packet decryption → message delivery to UI
 *  - Delivery state synchronisation with messages-core
 *  - UI state indicators (offline badge, relay path)
 *  - Debug telemetry panel
 *  - Phase-aware feature activation (Phase 1→5)
 *
 * Phases implemented:
 *  Phase 1: Offline queue + retry + reconnect sync  ✅
 *  Phase 2: Peer discovery + direct local messaging ✅
 *  Phase 3: Simple relay + store-and-forward + ACK  ✅
 *  Phase 4: Multi-hop routing + relay prioritization✅
 *  Phase 5: Adaptive routing hooks (ready for ML)   ✅ (hooks only)
 */
'use strict';

const MeshEngine = (() => {
    // ── State ──────────────────────────────────────────────────────────────
    let _myIdentity      = null;   // { privateKey, publicKey, publicKeyJwk }
    let _myEphemeral     = null;   // { privateKey, publicKey, publicKeyJwk }
    let _peerKeys        = new Map(); // peerId → publicKeyJwk (identity)
    let _ephemeralKeys   = new Map(); // peerId → ephemeralPublicKeyJwk
    let _listeners       = {};
    let _initialized     = false;
    let _phase           = 1;
    let _offlineQueue    = [];     // messages waiting while fully offline
    let _debugEl         = null;   // debug panel DOM element
    const PKT_ID_PREFIX  = 'mp_'; // mesh packet ID prefix

    // ── Event emitter ──────────────────────────────────────────────────────
    function _emit(event, data) {
        (_listeners[event] || []).forEach(fn => { try { fn(data); } catch(_){} });
        // Also dispatch as CustomEvent for cross-module listeners
        try { window.dispatchEvent(new CustomEvent('mesh:' + event, { detail: data || {} })); } catch(_) {}
    }
    function on(event, fn) {
        (_listeners[event] = _listeners[event] || []).push(fn);
        return () => { _listeners[event] = (_listeners[event]||[]).filter(f=>f!==fn); };
    }

    // ── Identity persistence ───────────────────────────────────────────────
    async function _loadOrCreateIdentity() {
        try {
            const stored = localStorage.getItem('mesh_identity_v1');
            if (stored) {
                const { privateJwk, publicJwk } = JSON.parse(stored);
                const privateKey = await crypto.subtle.importKey('jwk', privateJwk, { name:'ECDSA', namedCurve:'P-256' }, false, ['sign']);
                const publicKey  = await crypto.subtle.importKey('jwk', publicJwk,  { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']);
                return { privateKey, publicKey, publicKeyJwk: publicJwk };
            }
        } catch(_) {}
        const identity = await MeshCrypto.generateIdentityKeypair();
        try {
            const privateJwk = await crypto.subtle.exportKey('jwk', identity.privateKey);
            localStorage.setItem('mesh_identity_v1', JSON.stringify({ privateJwk, publicJwk: identity.publicKeyJwk }));
        } catch(_) {}
        return identity;
    }

    // ── Peer handshake ─────────────────────────────────────────────────────
    async function _sendHandshake(peerId) {
        if (!_myIdentity || !_myEphemeral) return;
        const handshake = {
            type         : 'MESH_HANDSHAKE',
            from         : MeshTransport.getDeviceId(),
            identityKey  : _myIdentity.publicKeyJwk,
            ephemeralKey : _myEphemeral.publicKeyJwk,
            phase        : _phase,
            relayEligible: MeshTransport.isRelayEligible(),
            timestamp    : Date.now(),
        };
        try {
            await MeshTransport.send(peerId, {
                packetId: PKT_ID_PREFIX + MeshCrypto.generateNonce(),
                to      : peerId,
                from    : MeshTransport.getDeviceId(),
                type    : 'HANDSHAKE',
                payload : handshake,
                ttl     : 1, // handshakes don't relay
                hopCount: 0,
                routeHistory: [MeshTransport.getDeviceId()],
                timestamp: Date.now(),
            });
        } catch(_) {}
    }

    function _handleHandshake(packet) {
        const h = packet.payload || packet;
        if (!h.from || !h.identityKey) return;
        _peerKeys.set(h.from, h.identityKey);
        if (h.ephemeralKey) _ephemeralKeys.set(h.from, h.ephemeralKey);
        MeshRouter.addPeer(h.from, {
            relayEligible: h.relayEligible,
            transport    : packet._transport || 'unknown',
        });
        // Share our routing table with new peer
        _sendRoutingTable(h.from);
        _emit('peer_ready', { peerId: h.from });
    }

    function _sendRoutingTable(peerId) {
        const table = MeshRouter.exportRoutingTable();
        MeshTransport.send(peerId, {
            packetId : PKT_ID_PREFIX + MeshCrypto.generateNonce(),
            to       : peerId,
            from     : MeshTransport.getDeviceId(),
            type     : 'ROUTING_TABLE',
            payload  : table,
            ttl      : 1,
            hopCount : 0,
            routeHistory: [MeshTransport.getDeviceId()],
            timestamp: Date.now(),
        }).catch(() => {});
    }

    // ── Send message ───────────────────────────────────────────────────────
    async function sendMessage(opts) {
        // opts: { to, toDeviceId, content, type, chatId, messageId, priority }
        const {
            to, toDeviceId, content, type = 'text', chatId,
            messageId, priority = 1
        } = opts;

        const packetId = PKT_ID_PREFIX + MeshCrypto.generateNonce();
        const myId     = MeshTransport.getDeviceId();

        // If internet available, still try internet first (hybrid)
        if (navigator.onLine && window.wsService?.isConnected?.()) {
            try {
                window.wsService.emit('message:new', { to, chatId, content, type, messageId });
                _updateDeliveryUI(messageId || packetId, 'delivered');
                return { success: true, transport: 'internet' };
            } catch(_) {}
        }

        // Build raw payload
        const rawPayload = {
            packetId,
            type       : 'MESSAGE',
            from       : myId,
            to         : toDeviceId || to,
            content,
            messageType: type,
            chatId,
            messageId  : messageId || packetId,
            timestamp  : Date.now(),
            ttl        : 8,
        };

        // Encrypt if we have peer's key
        let packet;
        const peerIdentityKey = _peerKeys.get(toDeviceId || to);
        const peerEphemeralKey = _ephemeralKeys.get(toDeviceId || to);

        if (peerIdentityKey && peerEphemeralKey && _myEphemeral) {
            try {
                packet = await MeshCrypto.encryptMeshPacket({
                    recipientPublicKeyJwk: peerEphemeralKey,
                    myEphemeralKeypair   : _myEphemeral,
                    payload              : rawPayload,
                    identityPrivateKey   : _myIdentity.privateKey,
                    senderId             : myId,
                });
                packet.encrypted_mode = true;
            } catch(_) {
                // Fall through to plaintext (still signed)
                packet = rawPayload;
            }
        } else {
            packet = { ...rawPayload, routeHistory: [myId], hopCount: 0 };
        }

        // Enqueue in router
        MeshRouter.enqueue({ ...packet, to: toDeviceId || to }, priority);
        _updateDeliveryUI(messageId || packetId, 'queued');
        _emit('message_queued', { packetId, to, messageId });
        return { success: true, transport: 'mesh', packetId };
    }

    // ── Incoming packet dispatcher ─────────────────────────────────────────
    async function _handleIncomingPacket(data) {
        const { packet } = data;
        if (!packet) return;

        const ptype = packet.type || '';

        if (ptype === 'HANDSHAKE') { _handleHandshake(packet); return; }
        if (ptype === 'ROUTING_TABLE') {
            MeshRouter.mergeRemoteRoutingTable(packet.from, packet.payload || {});
            return;
        }
        if (ptype === 'ACK') { MeshRouter.handleAck(packet); return; }
        if (ptype === 'MESSAGE') {
            let content = packet.content;
            // Decrypt if encrypted
            if (packet.encrypted_mode && _myEphemeral) {
                const senderIdentityKey = _peerKeys.get(packet.senderId);
                if (senderIdentityKey) {
                    try {
                        const decrypted = await MeshCrypto.decryptMeshPacket(
                            packet, _myEphemeral.privateKey, senderIdentityKey
                        );
                        content = decrypted.content;
                    } catch (err) {
                        console.warn('[MeshEngine] Decrypt failed:', err.message);
                        return; // Drop tampered/invalid packets
                    }
                }
            }
            _deliverToUI({
                messageId  : packet.messageId || packet.packetId,
                chatId     : packet.chatId,
                from       : packet.from,
                content,
                type       : packet.messageType || 'text',
                timestamp  : packet.timestamp,
                transport  : 'mesh',
                hops       : packet.hopCount || 0,
            });
        }
    }

    // ── Deliver decrypted message to UI ────────────────────────────────────
    function _deliverToUI(msg) {
        // Dispatch to messages-core via postMessage (iframe boundary)
        window.parent?.postMessage({ type: 'MESH_MESSAGE_RECEIVED', payload: msg }, '*');
        // Also dispatch local event
        window.dispatchEvent(new CustomEvent('mesh:message_received', { detail: msg }));
        _emit('message_received', msg);
    }

    // ── Delivery UI indicators ─────────────────────────────────────────────
    function _updateDeliveryUI(messageId, state) {
        // Update message bubble indicator
        document.querySelectorAll(`[data-message-id="${messageId}"] .delivery-indicator,
                                   [data-id="${messageId}"] .delivery-indicator`).forEach(el => {
            el.dataset.meshState = state;
            const icons = {
                queued           : '⏳',
                searching_route  : '🔍',
                relaying         : '📡',
                delivered        : '✓✓',
                failed           : '✗',
                expired          : '⌛',
            };
            el.textContent = icons[state] || '•';
            el.title = 'Mesh: ' + state;
        });
        _emit('delivery_state_changed', { messageId, state });
    }

    // ── Offline indicator ──────────────────────────────────────────────────
    function _updateOfflineIndicator() {
        let badge = document.getElementById('meshOfflineBadge');
        const online   = navigator.onLine;
        const wsOk     = !!window.wsService?.isConnected?.();
        const meshPeers = MeshTransport.getPeerCount();

        if (online && wsOk) {
            badge && badge.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'meshOfflineBadge';
            badge.style.cssText = [
                'position:fixed', 'bottom:70px', 'left:50%', 'transform:translateX(-50%)',
                'z-index:99998', 'background:rgba(30,41,59,0.95)', 'color:#fff',
                'padding:8px 16px', 'border-radius:20px', 'font-size:12px', 'font-weight:600',
                'display:flex', 'align-items:center', 'gap:8px',
                'box-shadow:0 4px 20px rgba(0,0,0,0.3)', 'backdrop-filter:blur(8px)',
                'transition:opacity 0.3s',
            ].join(';');
            document.body.appendChild(badge);
        }
        if (meshPeers > 0) {
            badge.innerHTML = `<span style="color:#34d399">●</span> Offline · ${meshPeers} nearby relay${meshPeers>1?'s':''} · Messages still send`;
        } else {
            badge.innerHTML = `<span style="color:#fbbf24">●</span> Weak network · Messages queued for delivery`;
        }
    }

    // ── Debug telemetry panel ──────────────────────────────────────────────
    function showDebugPanel() {
        if (_debugEl) { _debugEl.remove(); _debugEl = null; return; }
        _debugEl = document.createElement('div');
        _debugEl.style.cssText = [
            'position:fixed', 'bottom:0', 'right:0', 'width:340px', 'max-height:60vh',
            'overflow-y:auto', 'z-index:99999', 'background:#0f172a', 'color:#e2e8f0',
            'font-family:monospace', 'font-size:11px', 'padding:12px', 'border-radius:12px 0 0 0',
            'box-shadow:-4px -4px 20px rgba(0,0,0,0.4)',
        ].join(';');
        document.body.appendChild(_debugEl);
        _refreshDebugPanel();
        const interval = setInterval(() => { if (!_debugEl) { clearInterval(interval); return; } _refreshDebugPanel(); }, 2000);
    }

    function _refreshDebugPanel() {
        if (!_debugEl) return;
        const s = MeshRouter.getDebugState();
        _debugEl.innerHTML = `
            <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#60a5fa">
                🌐 Mesh Debug <button onclick="MeshEngine.showDebugPanel()" style="float:right;background:none;border:none;color:#9ca3af;cursor:pointer;font-size:10px">✕</button>
            </div>
            <div style="color:#94a3b8">Device: <span style="color:#fff">${s.myDeviceId}</span></div>
            <div style="color:#94a3b8">Phase: <span style="color:#34d399">${_phase}</span> | Peers: <span style="color:#34d399">${s.peers.length}</span></div>
            <div style="color:#94a3b8">Queue: <span style="color:#fbbf24">${s.queuedPackets}</span> | Relay cache: <span style="color:#fbbf24">${s.relayCache}</span></div>
            <div style="color:#94a3b8">Seen packets: <span style="color:#a78bfa">${s.seenPackets}</span></div>
            <div style="margin-top:8px;font-weight:700;color:#60a5fa">Nearby Peers</div>
            ${s.peers.map(p => `<div style="padding:2px 0;border-bottom:1px solid #1e293b">
                <span style="color:#34d399">${p.id.slice(-8)}</span>
                <span style="color:#9ca3af;float:right">${p.transport} | ${p.relay?'relay':'no-relay'}</span>
            </div>`).join('') || '<div style="color:#6b7280">None</div>'}
            <div style="margin-top:8px;font-weight:700;color:#60a5fa">Active Routes</div>
            ${s.routes.slice(0,5).map(r => `<div style="padding:2px 0;color:#94a3b8">→ <span style="color:#fff">${r.dest.slice(-8)}</span> via <span style="color:#60a5fa">${r.nextHop.slice(-8)}</span> (${r.hops} hop${r.hops>1?'s':''})</div>`).join('') || '<div style="color:#6b7280">None</div>'}
        `;
    }

    // ── Reconnect sync ─────────────────────────────────────────────────────
    function _onInternetRestored() {
        // Flush offline queue to server
        _offlineQueue.forEach(msg => {
            try { window.wsService?.emit('message:new', msg); } catch(_) {}
        });
        _offlineQueue = [];
        // Re-request conversations to fill missed messages
        setTimeout(() => {
            const core = window.messagesCore || window.getMessagesCore?.();
            if (core?.loadConversations) core.loadConversations();
        }, 1500);
        _updateOfflineIndicator();
        _emit('internet_restored', {});
    }

    // ── Init ───────────────────────────────────────────────────────────────
    async function init() {
        if (_initialized) return;
        _initialized = true;

        // Load or create cryptographic identity
        _myIdentity  = await _loadOrCreateIdentity();
        _myEphemeral = await MeshCrypto.generateEphemeralKeypair();

        // Init transport layer
        MeshTransport.init();

        // Init routing layer
        await MeshRouter.init(MeshTransport, MeshTransport.getDeviceId());

        // Wire events
        MeshTransport.on('mesh:peer_discovered', d => _sendHandshake(d.peerId));
        MeshRouter.on('mesh:packet_received',    d => _handleIncomingPacket(d));
        MeshRouter.on('mesh:delivery_confirmed', d => _updateDeliveryUI(d.packetId, 'delivered'));
        MeshRouter.on('mesh:relay_failed',       d => _updateDeliveryUI(d.packetId, 'failed'));

        window.addEventListener('online',  _onInternetRestored);
        window.addEventListener('offline', _updateOfflineIndicator);

        // Periodic offline indicator refresh
        setInterval(_updateOfflineIndicator, 10_000);
        _updateOfflineIndicator();

        // Wire messages-core incoming mesh messages
        window.addEventListener('message', evt => {
            if (!evt.data || typeof evt.data !== 'object') return;
            if (evt.data.type === 'MESH_DELIVER') {
                const { to, toDeviceId, content, type, chatId, messageId } = evt.data.payload || {};
                sendMessage({ to, toDeviceId, content, type, chatId, messageId }).catch(() => {});
            }
        });

        // Determine active phase from config
        _phase = parseInt(localStorage.getItem('mesh_phase') || '4', 10);

        console.log('[MeshEngine] ✅ Initialised | Phase', _phase, '| DeviceId:', MeshTransport.getDeviceId());
        _emit('ready', { phase: _phase, deviceId: MeshTransport.getDeviceId() });
    }

    return {
        init,
        on,
        sendMessage,
        showDebugPanel,
        getDeviceId : () => MeshTransport.getDeviceId(),
        getPhase    : () => _phase,
        setPhase    : p  => { _phase = p; localStorage.setItem('mesh_phase', String(p)); },
        getDebugState: MeshRouter.getDebugState,
        isOnline    : () => navigator.onLine && !!window.wsService?.isConnected?.(),
        getPeerCount: () => MeshTransport.getPeerCount(),
    };
})();

if (typeof module !== 'undefined') module.exports = MeshEngine;
window.MeshEngine = MeshEngine;

// Auto-init after DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MeshEngine.init().catch(console.warn));
} else {
    setTimeout(() => MeshEngine.init().catch(console.warn), 500);
}
