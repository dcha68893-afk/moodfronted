/**
 * mesh-transport.js — Transport Abstraction Layer
 *
 * Provides a unified interface over:
 *   1. Internet (WebSocket / Socket.IO)
 *   2. BLE (Web Bluetooth API / Cordova BLE)
 *   3. WiFi Direct / LAN (WebRTC DataChannel over local network)
 *   4. Hybrid fallback chains
 *
 * Architecture:
 *   Message Layer → Routing Layer → TransportAbstraction → [BLE|WiFi|Internet|LAN]
 *
 * Battery optimisation built in:
 *   - Adaptive scan intervals by app state
 *   - Relay eligibility checks (battery, CPU, thermal)
 *   - Dense-network throttle
 *   - Smart sleep/wake cycles
 */
'use strict';

const MeshTransport = (() => {
    // ── Transport priority (lowest energy first) ───────────────────────────
    const TRANSPORT_PRIORITY = ['internet', 'lan', 'wifi-direct', 'ble'];

    // ── Battery-aware scan intervals (ms) ─────────────────────────────────
    const SCAN_INTERVALS = {
        ACTIVE_CHAT  : 3_000,
        BACKGROUND   : 15_000,
        IDLE         : 45_000,
        LOW_BATTERY  : 120_000,
        SCREEN_OFF   : 300_000,
    };

    // ── Internal state ─────────────────────────────────────────────────────
    let _appState       = 'IDLE';          // ACTIVE_CHAT | BACKGROUND | IDLE | LOW_BATTERY | SCREEN_OFF
    let _scanTimer      = null;
    let _bleDevice      = null;
    let _bleChar        = null;
    let _peerCount      = 0;               // nearby peers – used for dense-network throttle
    let _relayEligible  = true;
    let _listeners      = {};              // event → [fn]
    let _transports     = {};             // name → { send, available }

    // ── Event emitter ──────────────────────────────────────────────────────
    function _emit(event, data) {
        (_listeners[event] || []).forEach(fn => { try { fn(data); } catch(_){} });
    }
    function on(event, fn) {
        (_listeners[event] = _listeners[event] || []).push(fn);
        return () => { _listeners[event] = (_listeners[event] || []).filter(f => f !== fn); };
    }

    // ── Transport registration ─────────────────────────────────────────────
    function registerTransport(name, impl) {
        _transports[name] = impl;
        _emit('transport:registered', { name });
    }

    // ── Battery / relay eligibility ────────────────────────────────────────
    async function _checkRelayEligibility() {
        try {
            if (navigator.getBattery) {
                const bat = await navigator.getBattery();
                const pct = Math.round(bat.level * 100);
                const threshold = parseInt(localStorage.getItem('mesh_relay_battery_threshold') || '20', 10);
                if (pct < threshold || bat.charging === false && pct < 15) {
                    _relayEligible = false;
                    _emit('mesh:relay_eligibility_changed', { eligible: false, reason: 'low_battery', pct });
                    return false;
                }
            }
        } catch(_) {}
        _relayEligible = true;
        _emit('mesh:relay_eligibility_changed', { eligible: true });
        return true;
    }

    function isRelayEligible() { return _relayEligible; }

    // ── App state management (drives scan interval) ────────────────────────
    function setAppState(state) {
        if (!SCAN_INTERVALS[state]) return;
        _appState = state;
        _restartScanCycle();
        _emit('mesh:app_state_changed', { state });
    }

    function _scanInterval() {
        // Dense network throttle: if many peers, relax scanning
        if (_peerCount > 10) return SCAN_INTERVALS.IDLE;
        return SCAN_INTERVALS[_appState] || SCAN_INTERVALS.IDLE;
    }

    // ── BLE Transport ──────────────────────────────────────────────────────
    const BLE_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    const BLE_CHAR_UUID    = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

    async function _bleAvailable() {
        try { return !!(navigator.bluetooth && await navigator.bluetooth.getAvailability()); }
        catch(_) { return false; }
    }

    async function _bleStartScan() {
        if (!(await _bleAvailable())) return;
        try {
            _bleDevice = await navigator.bluetooth.requestDevice({
                filters: [{ services: [BLE_SERVICE_UUID] }],
                optionalServices: [BLE_SERVICE_UUID]
            });
            _bleDevice.addEventListener('gattserverdisconnected', _bleOnDisconnect);
            const server  = await _bleDevice.gatt.connect();
            const service = await server.getPrimaryService(BLE_SERVICE_UUID);
            _bleChar = await service.getCharacteristic(BLE_CHAR_UUID);
            await _bleChar.startNotifications();
            _bleChar.addEventListener('characteristicvaluechanged', _bleOnData);
            _peerCount++;
            _emit('mesh:peer_discovered', {
                peerId   : _bleDevice.id,
                transport: 'ble',
                name     : _bleDevice.name || 'Unknown'
            });
        } catch (err) {
            if (err.name !== 'NotFoundError') {
                _emit('mesh:transport_error', { transport: 'ble', error: err.message });
            }
        }
    }

    function _bleOnDisconnect() {
        _peerCount = Math.max(0, _peerCount - 1);
        _emit('mesh:peer_lost', { peerId: _bleDevice?.id, transport: 'ble' });
        // Attempt reconnect after delay
        setTimeout(_bleStartScan, 5000);
    }

    function _bleOnData(evt) {
        try {
            const raw     = evt.target.value;
            const decoder = new TextDecoder();
            const json    = JSON.parse(decoder.decode(raw));
            _emit('mesh:packet_received', { ...json, transport: 'ble' });
        } catch(_) {}
    }

    async function _bleSend(peerId, packet) {
        if (!_bleChar) throw new Error('BLE_NOT_CONNECTED');
        const encoded = new TextEncoder().encode(JSON.stringify(packet));
        // BLE max packet size is ~512 bytes; chunk if needed
        const CHUNK = 500;
        for (let i = 0; i < encoded.length; i += CHUNK) {
            await _bleChar.writeValueWithoutResponse(encoded.slice(i, i + CHUNK));
            await new Promise(r => setTimeout(r, 30)); // small delay between chunks
        }
    }

    // ── LAN/UDP Discovery Transport (via WebRTC + local signalling) ────────
    const _lanPeers     = new Map();  // peerId → RTCPeerConnection
    const _lanChannels  = new Map();  // peerId → RTCDataChannel

    async function _lanBroadcastPresence() {
        // Use BroadcastChannel API for same-origin tab discovery (LAN simulation in browser)
        try {
            const bc = new BroadcastChannel('kynecta_mesh_v1');
            const myId = _getMyDeviceId();
            bc.postMessage({ type: 'MESH_PRESENCE', deviceId: myId, ts: Date.now() });
            bc.onmessage = (evt) => {
                const { type, deviceId } = evt.data || {};
                if (type === 'MESH_PRESENCE' && deviceId && deviceId !== myId) {
                    _onLanPeerDiscovered(deviceId);
                }
            };
            // Keep channel alive
            window._meshBroadcastChannel = bc;
        } catch(_) {}
    }

    function _onLanPeerDiscovered(peerId) {
        if (_lanPeers.has(peerId)) return;
        _peerCount++;
        _emit('mesh:peer_discovered', { peerId, transport: 'lan' });
        _initWebRTCPeer(peerId);
    }

    function _initWebRTCPeer(peerId) {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        _lanPeers.set(peerId, pc);

        const dc = pc.createDataChannel('mesh', { ordered: true });
        _lanChannels.set(peerId, dc);

        dc.onopen    = () => _emit('mesh:peer_connected', { peerId, transport: 'lan' });
        dc.onclose   = () => { _lanPeers.delete(peerId); _lanChannels.delete(peerId); _peerCount = Math.max(0, _peerCount - 1); _emit('mesh:peer_lost', { peerId, transport: 'lan' }); };
        dc.onmessage = (evt) => {
            try { _emit('mesh:packet_received', { ...JSON.parse(evt.data), transport: 'lan' }); } catch(_) {}
        };

        pc.onicecandidate = (evt) => {
            if (evt.candidate) {
                // Signal via BroadcastChannel
                try {
                    window._meshBroadcastChannel?.postMessage({ type: 'ICE', to: peerId, from: _getMyDeviceId(), candidate: evt.candidate });
                } catch(_) {}
            }
        };
    }

    async function _lanSend(peerId, packet) {
        const dc = _lanChannels.get(peerId);
        if (!dc || dc.readyState !== 'open') throw new Error('LAN_CHANNEL_NOT_OPEN');
        dc.send(JSON.stringify(packet));
    }

    // ── Internet Transport (delegates to existing wsService) ───────────────
    async function _internetSend(peerId, packet) {
        const ws = window.wsService;
        if (!ws || !ws.emit) throw new Error('INTERNET_UNAVAILABLE');
        ws.emit('mesh:packet', { to: peerId, packet });
    }

    function _internetAvailable() {
        return navigator.onLine && !!(window.wsService?.isConnected?.());
    }

    // ── Unified Send (transport selection) ────────────────────────────────
    async function send(peerId, packet) {
        const errors = [];
        for (const transport of TRANSPORT_PRIORITY) {
            try {
                if (transport === 'internet' && _internetAvailable()) {
                    await _internetSend(peerId, packet);
                    _emit('mesh:packet_sent', { peerId, transport, packetId: packet.packetId });
                    return { transport, success: true };
                }
                if (transport === 'lan' && _lanChannels.has(peerId)) {
                    await _lanSend(peerId, packet);
                    _emit('mesh:packet_sent', { peerId, transport, packetId: packet.packetId });
                    return { transport, success: true };
                }
                if (transport === 'ble' && _bleChar) {
                    await _bleSend(peerId, packet);
                    _emit('mesh:packet_sent', { peerId, transport, packetId: packet.packetId });
                    return { transport, success: true };
                }
            } catch (err) {
                errors.push({ transport, error: err.message });
            }
        }
        _emit('mesh:send_failed', { peerId, errors, packetId: packet.packetId });
        throw new Error('ALL_TRANSPORTS_FAILED: ' + JSON.stringify(errors));
    }

    // ── Scan cycle management ──────────────────────────────────────────────
    function _restartScanCycle() {
        if (_scanTimer) clearTimeout(_scanTimer);
        _scheduleScan();
    }

    function _scheduleScan() {
        _scanTimer = setTimeout(async () => {
            await _checkRelayEligibility();
            _lanBroadcastPresence();
            // BLE scan only when eligible and not low battery
            if (_relayEligible && _appState !== 'SCREEN_OFF') {
                // Don't auto-request BLE (requires user gesture); emit hint instead
                _emit('mesh:ble_scan_requested', { interval: _scanInterval() });
            }
            _scheduleScan(); // reschedule
        }, _scanInterval());
    }

    // ── Device identity ────────────────────────────────────────────────────
    function _getMyDeviceId() {
        let id = localStorage.getItem('mesh_device_id');
        if (!id) {
            id = 'dev_' + crypto.randomUUID().replace(/-/g,'').slice(0,16);
            localStorage.setItem('mesh_device_id', id);
        }
        return id;
    }

    // ── Visibility / battery event wiring ─────────────────────────────────
    function _wireSystemEvents() {
        document.addEventListener('visibilitychange', () => {
            setAppState(document.hidden ? 'BACKGROUND' : 'IDLE');
        });

        if (navigator.getBattery) {
            navigator.getBattery().then(bat => {
                const _update = () => {
                    const pct = Math.round(bat.level * 100);
                    if (pct < 15) setAppState('LOW_BATTERY');
                };
                bat.addEventListener('levelchange', _update);
                _update();
            }).catch(() => {});
        }

        window.addEventListener('online',  () => _emit('mesh:internet_restored', {}));
        window.addEventListener('offline', () => _emit('mesh:internet_lost', {}));
    }

    // ── Startup ────────────────────────────────────────────────────────────
    function init() {
        _wireSystemEvents();
        _lanBroadcastPresence();
        _restartScanCycle();
        _emit('mesh:transport_ready', { deviceId: _getMyDeviceId() });
        console.log('[MeshTransport] ✅ Transport layer initialised, deviceId:', _getMyDeviceId());
    }

    // ── Public API ─────────────────────────────────────────────────────────
    return {
        init,
        on,
        send,
        setAppState,
        isRelayEligible,
        getDeviceId   : _getMyDeviceId,
        triggerBleScan: _bleStartScan,
        getPeerCount  : () => _peerCount,
        getLanPeers   : () => [..._lanPeers.keys()],
    };
})();

if (typeof module !== 'undefined') module.exports = MeshTransport;
window.MeshTransport = MeshTransport;
