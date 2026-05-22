/**
 * MeshRelayEngine.js
 * Phase 2 — Mesh Relay Engine (Frontend)
 *
 * Enables multi-hop delivery: A → B → C → D → E
 *  - Hop discovery and trust scoring
 *  - TTL-based packet expiry
 *  - Loop prevention via seen-packet cache
 *  - Encrypted relay packets (E2EE — relay nodes CANNOT decrypt)
 *  - Dynamic rerouting on relay failure
 *
 * @version 2.0.0
 * @phase 2 — Mesh Relay
 */

(function () {
  'use strict';

  if (window.__MeshRelayEngine) return;

  const MAX_TTL           = 6;    // max hops
  const PACKET_DEDUP_MS   = 300000; // 5-min dedup window
  const TRUST_SCORE_MIN   = 0.3;  // minimum trust to relay through
  const MAX_RELAY_ROUTES  = 3;    // parallel routes attempted
  const ROUTE_EXPIRY_MS   = 60000;

  // ─── PacketDeduplicator ──────────────────────────────────────────────────

  class PacketDeduplicator {
    constructor() { this._seen = new Map(); }

    isDuplicate(packetId) {
      const now  = Date.now();
      const last = this._seen.get(packetId);
      for (const [id, ts] of this._seen) {
        if (now - ts > PACKET_DEDUP_MS) this._seen.delete(id);
      }
      if (last) return true;
      this._seen.set(packetId, now);
      return false;
    }
  }

  // ─── RoutingTable ────────────────────────────────────────────────────────

  class RoutingTable {
    constructor() {
      // targetUserId -> [{ path: [deviceId], score, discoveredAt }]
      this._routes = new Map();
    }

    addRoute(targetId, path, score) {
      if (!this._routes.has(targetId)) this._routes.set(targetId, []);
      const routes = this._routes.get(targetId);

      // Dedup by path
      const exists = routes.find(r => r.path.join(',') === path.join(','));
      if (exists) { exists.score = score; exists.discoveredAt = Date.now(); return; }

      routes.push({ path, score, discoveredAt: Date.now() });
      routes.sort((a, b) => b.score - a.score);
      if (routes.length > MAX_RELAY_ROUTES) routes.splice(MAX_RELAY_ROUTES);
    }

    getBestRoute(targetId) {
      const now    = Date.now();
      const routes = (this._routes.get(targetId) || [])
        .filter(r => now - r.discoveredAt < ROUTE_EXPIRY_MS);
      return routes[0] || null;
    }

    removeStale() {
      const now = Date.now();
      for (const [id, routes] of this._routes) {
        const fresh = routes.filter(r => now - r.discoveredAt < ROUTE_EXPIRY_MS);
        if (!fresh.length) this._routes.delete(id);
        else this._routes.set(id, fresh);
      }
    }

    size() { return this._routes.size; }
  }

  // ─── TrustScorer ────────────────────────────────────────────────────────

  class TrustScorer {
    constructor() {
      // deviceId -> { score, successCount, failCount }
      this._scores = new Map();
    }

    getScore(deviceId) {
      return this._scores.get(deviceId)?.score ?? 0.5;
    }

    recordSuccess(deviceId) {
      this._update(deviceId, true);
    }

    recordFailure(deviceId) {
      this._update(deviceId, false);
    }

    isTrusted(deviceId) {
      return this.getScore(deviceId) >= TRUST_SCORE_MIN;
    }

    _update(deviceId, success) {
      const entry = this._scores.get(deviceId) || { score: 0.5, successCount: 0, failCount: 0 };
      if (success) { entry.successCount++; } else { entry.failCount++; }
      const total = entry.successCount + entry.failCount;
      entry.score = total > 0 ? entry.successCount / total : 0.5;
      this._scores.set(deviceId, entry);
    }
  }

  // ─── MeshPacket ─────────────────────────────────────────────────────────

  function createPacket(payload, targetDeviceId, path = []) {
    return {
      packetId:       'pkt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      targetDeviceId,
      originDeviceId: window.__kynDeviceId || 'unknown',
      ttl:            MAX_TTL,
      hops:           path,
      encryptedPayload: payload, // E2EE — relay nodes only see this opaque blob
      createdAt:      Date.now(),
      signature:      null,       // Phase 3: PKI signing
    };
  }

  // ─── MeshRelayEngine (main) ──────────────────────────────────────────────

  class MeshRelayEngine {
    constructor() {
      this._dedup   = new PacketDeduplicator();
      this._routing = new RoutingTable();
      this._trust   = new TrustScorer();
      this._started = false;
      this._listeners = [];
    }

    start() {
      if (this._started) return;
      this._started = true;
      this._attachSocketListeners();
      this._startRouteMaintenace();
      console.log('[MeshRelay] ✅ Started');
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Send a payload via mesh relay to a specific device.
     * Returns true if a route was found and packet forwarded.
     */
    relay(payload, targetDeviceId) {
      const route = this._routing.getBestRoute(targetDeviceId);
      if (!route) {
        console.debug(`[MeshRelay] No route to device ${targetDeviceId}`);
        return false;
      }

      const nextHop = route.path[0];
      if (!this._trust.isTrusted(nextHop)) {
        console.debug(`[MeshRelay] Next hop ${nextHop} not trusted`);
        return false;
      }

      const packet = createPacket(payload, targetDeviceId, route.path);
      this._forwardPacket(packet, nextHop);
      return true;
    }

    /**
     * Forward a received relay packet (decrement TTL, check loop, forward).
     */
    forwardRelayed(packet) {
      if (this._dedup.isDuplicate(packet.packetId)) return false;
      if (!packet.ttl || packet.ttl <= 1) {
        console.debug('[MeshRelay] Packet TTL expired:', packet.packetId);
        return false;
      }

      const myDeviceId = window.__kynDeviceId || null;

      // Check if we are the target
      if (packet.targetDeviceId === myDeviceId) {
        this._deliverLocally(packet);
        return true;
      }

      // Check relay permission
      const battery = window.__NetworkIntelligenceManager?.getState()?.lowBattery;
      if (battery) return false; // Don't relay on low battery

      // Decrement TTL and forward
      const forwarded = { ...packet, ttl: packet.ttl - 1, hops: [...packet.hops, myDeviceId] };
      const route = this._routing.getBestRoute(packet.targetDeviceId);
      if (route) {
        this._forwardPacket(forwarded, route.path[0]);
        return true;
      }

      // Flood to all known relays (limited)
      this._flood(forwarded);
      return true;
    }

    addRoute(targetId, path, score) { this._routing.addRoute(targetId, path, score); }
    trustDevice(deviceId) { this._trust._update(deviceId, true); }
    recordRelaySuccess(deviceId) { this._trust.recordSuccess(deviceId); }
    recordRelayFailure(deviceId) { this._trust.recordFailure(deviceId); }

    isReachable(deviceId) { return !!this._routing.getBestRoute(deviceId); }

    onRelayReceived(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    getDiagnostics() {
      return {
        routingTableSize: this._routing.size(),
        started: this._started,
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _forwardPacket(packet, nextHopDeviceId) {
      const socket = window.KynectaRealtime?._socket;
      if (!socket?.connected) return;
      socket.emit('mesh:relay', { packet, nextHop: nextHopDeviceId });
    }

    _flood(packet) {
      const socket = window.KynectaRealtime?._socket;
      if (!socket?.connected) return;
      socket.emit('mesh:flood', { packet });
    }

    _deliverLocally(packet) {
      const bus = window.KynectaEventBus;
      if (bus) bus.emit('MESSAGE_RECEIVED', packet.encryptedPayload, { async: true });
      this._listeners.forEach(fn => { try { fn(packet); } catch (_) {} });
    }

    _attachSocketListeners() {
      const bus = window.KynectaEventBus;
      if (!bus) { setTimeout(() => this._attachSocketListeners(), 1000); return; }

      bus.on('SOCKET_EVENT', payload => {
        // Incoming relay packet
        if (payload?.type === 'mesh:relay_received') {
          this.forwardRelayed(payload.packet);
        }
        // Route advertisement from server
        if (payload?.type === 'mesh:routes') {
          for (const route of (payload.routes || [])) {
            this._routing.addRoute(route.targetId, route.path, route.score);
          }
        }
        // Relay success/failure feedback
        if (payload?.type === 'mesh:relay_ack') {
          this._trust.recordSuccess(payload.relayDeviceId);
        }
        if (payload?.type === 'mesh:relay_fail') {
          this._trust.recordFailure(payload.relayDeviceId);
        }
      });
    }

    _startRouteMaintenace() {
      setInterval(() => this._routing.removeStale(), 30000);
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const engine = new MeshRelayEngine();
  engine.start();

  window.__MeshRelayEngine = engine;
  window.MeshRelay = engine;

  console.log('[MeshRelay] ✅ Ready');
})();
