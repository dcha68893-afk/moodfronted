/**
 * mesh-router.js — Distributed Routing Engine
 *
 * Implements:
 *   - Peer graph (adjacency list with RSSI/latency scoring)
 *   - Dynamic multi-hop route discovery (Dijkstra + opportunistic)
 *   - Store-and-forward queue with exponential backoff
 *   - TTL + hop-count enforcement (loop prevention)
 *   - Seen-packet deduplication registry
 *   - Route history tracking (anti-loop)
 *   - Priority queue (direct > group > broadcast)
 *   - Delivery state machine
 *   - Opportunistic delivery on peer reconnect
 *   - Full persistent queue (survives page reload via IndexedDB)
 */
'use strict';

const MeshRouter = (() => {
    // ── Constants ──────────────────────────────────────────────────────────
    const MAX_TTL           = 8;
    const MAX_HOPS          = 6;
    const MAX_QUEUE_SIZE    = 500;
    const MAX_RELAY_CACHE   = 1000;
    const PACKET_EXPIRY_MS  = 48 * 60 * 60 * 1000;   // 48h
    const SEEN_PKT_TTL_MS   = 10 * 60 * 1000;         // 10 min
    const RETRY_BASE_MS     = 2_000;
    const RETRY_MAX_MS      = 5 * 60 * 1000;           // 5 min cap
    const RATE_LIMIT_WINDOW = 60_000;
    const RATE_LIMIT_MAX    = 60;                       // packets/min per peer

    // ── Delivery states ────────────────────────────────────────────────────
    const DELIVERY_STATES = {
        QUEUED             : 'queued',
        SEARCHING_ROUTE    : 'searching_route',
        RELAYING           : 'relaying',
        PARTIALLY_DELIVERED: 'partially_delivered',
        DELIVERED          : 'delivered',
        READ               : 'read',
        FAILED             : 'failed',
        EXPIRED            : 'expired',
    };

    // ── Internal state ─────────────────────────────────────────────────────
    let _myDeviceId     = null;
    let _peerGraph      = new Map();  // peerId → { rssi, latency, battery, hopCost, lastSeen, transport }
    let _routeTable     = new Map();  // destId  → { nextHop, cost, hops, ts }
    let _seenPackets    = new Map();  // packetId → expiry
    let _outboundQueue  = [];         // { packet, retries, nextRetryAt, priority, state }
    let _relayCache     = new Map();  // packetId → { packet, cachedAt }
    let _deliveryStates = new Map();  // packetId → DELIVERY_STATE
    let _peerRateLimit  = new Map();  // peerId   → { count, windowStart }
    let _listeners      = {};
    let _retryTimer     = null;
    let _transport      = null;

    // ── Event emitter ──────────────────────────────────────────────────────
    function _emit(event, data) {
        (_listeners[event] || []).forEach(fn => { try { fn(data); } catch(_){} });
    }
    function on(event, fn) {
        (_listeners[event] = _listeners[event] || []).push(fn);
        return () => { _listeners[event] = (_listeners[event] || []).filter(f => f !== fn); };
    }

    // ── Peer graph management ──────────────────────────────────────────────
    function addPeer(peerId, meta = {}) {
        _peerGraph.set(peerId, {
            rssi     : meta.rssi      || -70,
            latency  : meta.latency   || 100,
            battery  : meta.battery   || 100,
            hopCost  : _calcHopCost(meta),
            lastSeen : Date.now(),
            transport: meta.transport || 'unknown',
            relay    : meta.relayEligible !== false,
        });
        _updateRoutes();
        _emit('mesh:peer_discovered', { peerId, ...meta });
        // Deliver any queued packets for this peer opportunistically
        _opportunisticDeliver(peerId);
    }

    function removePeer(peerId) {
        _peerGraph.delete(peerId);
        // Invalidate routes through this peer
        for (const [dest, route] of _routeTable) {
            if (route.nextHop === peerId) _routeTable.delete(dest);
        }
        _emit('mesh:peer_lost', { peerId });
    }

    function _calcHopCost(meta) {
        // Lower cost = better route
        const rssiFactor    = Math.max(0, (meta.rssi || -90) + 100) / 30;   // 0–3
        const latencyFactor = Math.max(0, 1 - (meta.latency || 200) / 500); // 0–1
        const batteryFactor = (meta.battery || 50) / 100;                    // 0–1
        return Math.max(0.1, 3 - rssiFactor - latencyFactor - batteryFactor);
    }

    // ── Route computation (Dijkstra over peer graph) ───────────────────────
    function _updateRoutes() {
        // Simple single-hop direct routes first (we only know 1-hop neighbours)
        // Multi-hop routes are built from exchanged routing tables
        for (const [peerId, meta] of _peerGraph) {
            if (!_routeTable.has(peerId) || meta.hopCost < (_routeTable.get(peerId)?.cost || Infinity)) {
                _routeTable.set(peerId, { nextHop: peerId, cost: meta.hopCost, hops: 1, ts: Date.now() });
            }
        }
    }

    function mergeRemoteRoutingTable(fromPeerId, remoteTable) {
        // When a peer shares its routing table, integrate it (adding 1 hop)
        for (const [destId, route] of Object.entries(remoteTable)) {
            if (destId === _myDeviceId) continue; // don't route to self
            const newCost = route.cost + (_peerGraph.get(fromPeerId)?.hopCost || 1);
            const newHops = route.hops + 1;
            if (newHops > MAX_HOPS) continue;
            const existing = _routeTable.get(destId);
            if (!existing || newCost < existing.cost) {
                _routeTable.set(destId, { nextHop: fromPeerId, cost: newCost, hops: newHops, ts: Date.now() });
                _emit('mesh:route_updated', { destId, nextHop: fromPeerId, hops: newHops });
            }
        }
        // Opportunity: deliver queued packets whose route was just found
        for (const [destId] of _routeTable) _opportunisticDeliver(destId);
    }

    function getBestRoute(destId) {
        return _routeTable.get(destId) || null;
    }

    function exportRoutingTable() {
        const out = {};
        for (const [dest, route] of _routeTable) out[dest] = route;
        return out;
    }

    // ── Seen-packet dedup ──────────────────────────────────────────────────
    function _cleanSeenPackets() {
        const now = Date.now();
        for (const [id, expiry] of _seenPackets) {
            if (expiry < now) _seenPackets.delete(id);
        }
    }

    function _isSeen(packetId) {
        _cleanSeenPackets();
        return _seenPackets.has(packetId);
    }

    function _markSeen(packetId) {
        _seenPackets.set(packetId, Date.now() + SEEN_PKT_TTL_MS);
        if (_seenPackets.size > 10000) {
            // Prune oldest 20%
            const arr = [..._seenPackets.entries()].sort((a,b) => a[1]-b[1]);
            arr.slice(0, 2000).forEach(([k]) => _seenPackets.delete(k));
        }
    }

    // ── Rate limiting (per peer) ───────────────────────────────────────────
    function _checkRateLimit(peerId) {
        const now    = Date.now();
        const entry  = _peerRateLimit.get(peerId) || { count: 0, windowStart: now };
        if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
            entry.count = 0; entry.windowStart = now;
        }
        entry.count++;
        _peerRateLimit.set(peerId, entry);
        return entry.count <= RATE_LIMIT_MAX;
    }

    // ── Outbound queue ─────────────────────────────────────────────────────
    function enqueue(packet, priority = 1) {
        if (_outboundQueue.length >= MAX_QUEUE_SIZE) {
            // Drop lowest priority
            _outboundQueue.sort((a,b) => a.priority - b.priority);
            _outboundQueue.shift();
        }
        const entry = {
            packet,
            retries    : 0,
            nextRetryAt: Date.now(),
            priority,
            state      : DELIVERY_STATES.QUEUED,
            queuedAt   : Date.now(),
        };
        _outboundQueue.push(entry);
        _deliveryStates.set(packet.packetId, DELIVERY_STATES.QUEUED);
        _emit('mesh:queue_updated', { queued: _outboundQueue.length, packetId: packet.packetId });
        _persistQueue();
        // Try immediate delivery
        _processQueue();
    }

    function _calcRetryDelay(retries) {
        return Math.min(RETRY_BASE_MS * Math.pow(2, retries), RETRY_MAX_MS);
    }

    async function _processQueue() {
        const now = Date.now();
        const pending = _outboundQueue.filter(e =>
            e.nextRetryAt <= now &&
            e.state !== DELIVERY_STATES.DELIVERED &&
            e.state !== DELIVERY_STATES.FAILED &&
            e.state !== DELIVERY_STATES.EXPIRED
        ).sort((a,b) => b.priority - a.priority);

        for (const entry of pending) {
            // Check expiry
            if (now - entry.queuedAt > PACKET_EXPIRY_MS) {
                entry.state = DELIVERY_STATES.EXPIRED;
                _deliveryStates.set(entry.packet.packetId, DELIVERY_STATES.EXPIRED);
                _emit('mesh:delivery_expired', { packetId: entry.packet.packetId });
                continue;
            }
            await _trySend(entry);
        }
        // Remove delivered/expired
        _outboundQueue = _outboundQueue.filter(e =>
            e.state !== DELIVERY_STATES.DELIVERED &&
            e.state !== DELIVERY_STATES.EXPIRED
        );
        _persistQueue();
    }

    async function _trySend(entry) {
        const { packet } = entry;
        const route = getBestRoute(packet.to);
        if (!route) {
            entry.state = DELIVERY_STATES.SEARCHING_ROUTE;
            _deliveryStates.set(packet.packetId, DELIVERY_STATES.SEARCHING_ROUTE);
            entry.retries++;
            entry.nextRetryAt = Date.now() + _calcRetryDelay(entry.retries);
            _emit('mesh:queue_retry', { packetId: packet.packetId, retries: entry.retries });
            return;
        }
        try {
            entry.state = DELIVERY_STATES.RELAYING;
            _deliveryStates.set(packet.packetId, DELIVERY_STATES.RELAYING);
            await _transport.send(route.nextHop, packet);
            entry.state = DELIVERY_STATES.DELIVERED;
            _deliveryStates.set(packet.packetId, DELIVERY_STATES.DELIVERED);
            _emit('mesh:packet_sent', { packetId: packet.packetId, nextHop: route.nextHop });
        } catch (err) {
            entry.retries++;
            entry.nextRetryAt = Date.now() + _calcRetryDelay(entry.retries);
            if (entry.retries > 10) {
                entry.state = DELIVERY_STATES.FAILED;
                _deliveryStates.set(packet.packetId, DELIVERY_STATES.FAILED);
                _emit('mesh:relay_failed', { packetId: packet.packetId, error: err.message });
            }
        }
    }

    function _opportunisticDeliver(peerId) {
        const queued = _outboundQueue.filter(e =>
            (e.state === DELIVERY_STATES.SEARCHING_ROUTE || e.state === DELIVERY_STATES.QUEUED) &&
            (_routeTable.get(e.packet.to)?.nextHop === peerId || e.packet.to === peerId)
        );
        if (queued.length > 0) {
            queued.forEach(e => { e.nextRetryAt = Date.now(); });
            _processQueue();
        }
    }

    // ── Incoming packet handler ────────────────────────────────────────────
    async function handleIncomingPacket(packet, fromPeerId) {
        // 1. Rate limit check
        if (!_checkRateLimit(fromPeerId)) {
            _emit('mesh:flood_detected', { fromPeerId, packetId: packet.packetId });
            return;
        }

        // 2. Dedup check
        if (_isSeen(packet.packetId)) return;
        _markSeen(packet.packetId);

        // 3. TTL / hop count enforcement
        if ((packet.ttl || 0) <= 0 || (packet.hopCount || 0) >= MAX_HOPS) {
            _emit('mesh:packet_expired_ttl', { packetId: packet.packetId });
            return;
        }

        // 4. Route history anti-loop check
        const history = packet.routeHistory || [];
        if (history.includes(_myDeviceId)) return; // already passed through us

        // 5. Am I the destination?
        if (packet.to === _myDeviceId) {
            _emit('mesh:packet_received', { packet, fromPeerId, transport: packet._transport });
            _sendAck(packet, fromPeerId);
            return;
        }

        // 6. Relay if eligible
        if (!MeshTransport.isRelayEligible()) {
            _cacheForRelay(packet); // store-and-forward for later
            return;
        }

        _relayPacket(packet, fromPeerId);
    }

    async function _relayPacket(packet, fromPeerId) {
        const relayed = {
            ...packet,
            ttl       : packet.ttl - 1,
            hopCount  : (packet.hopCount || 0) + 1,
            routeHistory: [...(packet.routeHistory || []), _myDeviceId],
        };

        const route = getBestRoute(relayed.to);
        if (route) {
            try {
                await _transport.send(route.nextHop, relayed);
                _emit('mesh:packet_relayed', { packetId: packet.packetId, nextHop: route.nextHop, hops: relayed.hopCount });
            } catch (_) {
                _cacheForRelay(relayed);
            }
        } else {
            // Broadcast to all known peers (flooding with TTL protection)
            for (const peerId of _peerGraph.keys()) {
                if (peerId === fromPeerId) continue;
                try { await _transport.send(peerId, relayed); } catch(_) {}
            }
        }
    }

    function _cacheForRelay(packet) {
        if (_relayCache.size >= MAX_RELAY_CACHE) {
            // Evict oldest
            const oldest = [..._relayCache.entries()].sort((a,b) => a[1].cachedAt - b[1].cachedAt)[0];
            if (oldest) _relayCache.delete(oldest[0]);
        }
        _relayCache.set(packet.packetId, { packet, cachedAt: Date.now() });
    }

    function _flushRelayCache() {
        const now = Date.now();
        for (const [id, { packet, cachedAt }] of _relayCache) {
            if (now - cachedAt > PACKET_EXPIRY_MS) { _relayCache.delete(id); continue; }
            const route = getBestRoute(packet.to);
            if (route) {
                _relayCache.delete(id);
                _relayPacket(packet, null);
            }
        }
    }

    function _sendAck(packet, toPeerId) {
        const ack = {
            packetId   : 'ack_' + packet.packetId,
            type       : 'ACK',
            to         : packet.from,
            from       : _myDeviceId,
            ackFor     : packet.packetId,
            ttl        : MAX_TTL,
            hopCount   : 0,
            routeHistory: [_myDeviceId],
            timestamp  : Date.now(),
        };
        enqueue(ack, 3); // high priority
        _emit('mesh:delivery_ack', { packetId: packet.packetId, from: _myDeviceId });
    }

    function handleAck(ack) {
        const originalId = ack.ackFor;
        if (_deliveryStates.get(originalId) !== DELIVERY_STATES.DELIVERED) {
            _deliveryStates.set(originalId, DELIVERY_STATES.DELIVERED);
            // Remove from outbound queue
            _outboundQueue = _outboundQueue.filter(e => e.packet.packetId !== originalId);
            _emit('mesh:delivery_confirmed', { packetId: originalId });
            _persistQueue();
        }
    }

    // ── Queue persistence (IndexedDB) ─────────────────────────────────────
    const IDB_NAME    = 'kynectaMesh';
    const IDB_STORE   = 'outboundQueue';
    let _idb          = null;

    async function _openIDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'packetId' });
                }
            };
            req.onsuccess = e => {
                const db = e.target.result;
                // Account-switch isolation: release this connection the moment
                // authStorage.js's wipePreviousAccountData() tries to delete this
                // DB, otherwise deleteDatabase() blocks forever and mesh queue
                // data from the previous account survives the switch silently.
                db.onversionchange = () => { try { db.close(); } catch (_) {} _idb = null; };
                resolve(db);
            };
            req.onerror   = e => reject(e.target.error);
        });
    }

    async function _persistQueue() {
        try {
            if (!_idb) _idb = await _openIDB();
            const tx    = _idb.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            store.clear();
            _outboundQueue.forEach(e => {
                try { store.put({ ...e.packet, packetId: e.packet.packetId, _meta: { retries: e.retries, state: e.state, queuedAt: e.queuedAt, priority: e.priority } }); } catch(_) {}
            });
        } catch(_) {}
    }

    async function _restoreQueue() {
        try {
            if (!_idb) _idb = await _openIDB();
            const tx    = _idb.transaction(IDB_STORE, 'readonly');
            const store = tx.objectStore(IDB_STORE);
            const items = await new Promise((resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = e => resolve(e.target.result || []);
                req.onerror   = e => reject(e.target.error);
            });
            const now = Date.now();
            items.forEach(item => {
                const meta = item._meta || {};
                if (now - (meta.queuedAt || 0) > PACKET_EXPIRY_MS) return; // expired
                if (meta.state === DELIVERY_STATES.DELIVERED || meta.state === DELIVERY_STATES.EXPIRED) return;
                _outboundQueue.push({
                    packet     : item,
                    retries    : meta.retries || 0,
                    nextRetryAt: Date.now() + 1000,
                    priority   : meta.priority || 1,
                    state      : DELIVERY_STATES.QUEUED, // reset to queued on restore
                    queuedAt   : meta.queuedAt || now,
                });
            });
            _emit('mesh:queue_restored', { count: _outboundQueue.length });
        } catch(_) {}
    }

    // ── Cleanup ────────────────────────────────────────────────────────────
    function _startCleanupCycle() {
        setInterval(() => {
            const now = Date.now();
            // Expire stale peers
            for (const [id, meta] of _peerGraph) {
                if (now - meta.lastSeen > 5 * 60_000) removePeer(id);
            }
            // Expire relay cache
            for (const [id, { cachedAt }] of _relayCache) {
                if (now - cachedAt > PACKET_EXPIRY_MS) _relayCache.delete(id);
            }
            // Flush relay cache opportunistically
            _flushRelayCache();
            // Process retry queue
            _processQueue();
            // Stale route table pruning
            for (const [dest, route] of _routeTable) {
                if (now - route.ts > 10 * 60_000 && !_peerGraph.has(route.nextHop)) _routeTable.delete(dest);
            }
        }, 30_000);
    }

    // ── Init ───────────────────────────────────────────────────────────────
    async function init(transport, myDeviceId) {
        _transport  = transport;
        _myDeviceId = myDeviceId || MeshTransport.getDeviceId();

        // Wire transport events
        transport.on('mesh:peer_discovered', d => addPeer(d.peerId, d));
        transport.on('mesh:peer_lost',       d => removePeer(d.peerId));
        transport.on('mesh:packet_received', d => handleIncomingPacket(d, d._fromPeer));
        transport.on('mesh:internet_restored', () => {
            // flush queue when internet comes back
            setTimeout(_processQueue, 1000);
        });

        // Also handle packets from internet (wsService relay)
        if (window.wsService) {
            window.wsService.on('mesh:packet', data => {
                handleIncomingPacket(data.packet || data, data.from || 'internet');
            });
            window.wsService.on('mesh:ack', data => handleAck(data));
        }

        // Restore persisted queue
        await _restoreQueue();

        // Start maintenance cycles
        _startCleanupCycle();

        // Start retry scheduler
        _retryTimer = setInterval(_processQueue, 5_000);

        _emit('mesh:router_ready', { myDeviceId: _myDeviceId });
        console.log('[MeshRouter] ✅ Router ready, deviceId:', _myDeviceId);
    }

    // ── Telemetry / debug ──────────────────────────────────────────────────
    function getDebugState() {
        return {
            myDeviceId     : _myDeviceId,
            peers          : [..._peerGraph.entries()].map(([id,m]) => ({ id, ...m })),
            routes         : [..._routeTable.entries()].map(([dest,r]) => ({ dest, ...r })),
            queuedPackets  : _outboundQueue.length,
            relayCache     : _relayCache.size,
            seenPackets    : _seenPackets.size,
            deliveryStates : Object.fromEntries([..._deliveryStates.entries()].slice(-20)),
        };
    }

    return {
        init,
        on,
        enqueue,
        addPeer,
        removePeer,
        handleIncomingPacket,
        handleAck,
        mergeRemoteRoutingTable,
        exportRoutingTable,
        getBestRoute,
        getDeliveryState   : id => _deliveryStates.get(id) || DELIVERY_STATES.QUEUED,
        getDebugState,
        DELIVERY_STATES,
    };
})();

if (typeof module !== 'undefined') module.exports = MeshRouter;
window.MeshRouter = MeshRouter;
