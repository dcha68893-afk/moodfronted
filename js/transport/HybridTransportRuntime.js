/**
 * transport/HybridTransportRuntime.js — Phase 10 Frontend
 *
 * THE canonical client-side transport authority.
 * All modules route sends through this singleton — never directly to Socket.IO.
 *
 * Priority: INTERNET → LAN → MESH → OFFLINE QUEUE
 *
 * Wraps the existing HybridTransportEngine and LANCommunicationEngine,
 * wires them together, and exposes a single deliver() API.
 */
(function () {
  'use strict';

  if (window.__Phase10TransportRuntime) return;

  const TRANSPORT = Object.freeze({
    INTERNET : 'INTERNET',
    LAN      : 'LAN',
    MESH     : 'MESH',
    OFFLINE  : 'OFFLINE',
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const _stats = { internet: 0, lan: 0, mesh: 0, offline: 0, total: 0, failed: 0 };

  // ── Health snapshot (delegates to HybridTransportEngine) ─────────────────
  function _getBest() {
    const engine = window.__HybridTransportEngine;
    if (engine?.getBestTransport) return engine.getBestTransport();
    return navigator.onLine ? TRANSPORT.INTERNET : TRANSPORT.OFFLINE;
  }

  function _isOnline() {
    return navigator.onLine &&
      (window.KynectaRealtime?._socket?.connected === true ||
       window.KynectaRealtime?.state === 'authenticated');
  }

  function _hasLAN() {
    return window.__LANCommunicationEngine?.hasPeers?.() === true;
  }

  function _hasMesh() {
    const m = window.__MeshMessagesTransport || window.__MeshEngine;
    return !!(m?.isConnected?.() || m?.peers?.size > 0);
  }

  // ── Core deliver function ─────────────────────────────────────────────────
  /**
   * deliver(event, payload, options)
   *   options.transport — force a transport
   *   options.chatId    — for LAN routing context
   * Returns: { ok, transport, queued? }
   */
  async function deliver(event, payload, options = {}) {
    _stats.total++;
    const best = options.transport || _getBest();

    // ── OFFLINE queue path ───────────────────────────────────────────────
    if (!_isOnline() && !_hasLAN() && !_hasMesh()) {
      return _enqueueOffline(event, payload, options);
    }

    // Try in priority order
    const order = [best, TRANSPORT.INTERNET, TRANSPORT.LAN, TRANSPORT.MESH]
      .filter((t, i, a) => a.indexOf(t) === i); // dedupe

    for (const t of order) {
      if (t === TRANSPORT.OFFLINE) continue;
      const ok = await _sendVia(t, event, payload, options);
      if (ok) {
        _stats[t.toLowerCase()] = (_stats[t.toLowerCase()] || 0) + 1;
        window.__HybridTransportEngine?.recordSuccess?.(t, 0);
        return { ok: true, transport: t };
      }
    }

    // All online transports failed — enqueue
    window.__HybridTransportEngine?.recordFailure?.(TRANSPORT.INTERNET);
    return _enqueueOffline(event, payload, options);
  }

  async function _sendVia(transport, event, payload, options) {
    switch (transport) {
      case TRANSPORT.INTERNET: return _sendInternet(event, payload);
      case TRANSPORT.LAN:      return _sendLAN(event, payload, options);
      case TRANSPORT.MESH:     return _sendMesh(event, payload);
      default:                 return false;
    }
  }

  function _sendInternet(event, payload) {
    try {
      const socket = window.KynectaRealtime?._socket;
      if (socket?.connected) { socket.emit(event, payload); return true; }
      // Try KynectaRealtime.send()
      if (window.KynectaRealtime?.send) {
        window.KynectaRealtime.send(event, payload);
        return true;
      }
      return false;
    } catch (_) { return false; }
  }

  function _sendLAN(event, payload, options) {
    try {
      const lan = window.__LANCommunicationEngine;
      if (!lan?.hasPeers?.()) return false;
      return lan.send({ event, payload, chatId: options.chatId }) !== false;
    } catch (_) { return false; }
  }

  function _sendMesh(event, payload) {
    try {
      const mesh = window.__MeshMessagesTransport || window.__MeshEngine;
      if (!mesh) return false;
      mesh.send?.({ event, payload });
      return true;
    } catch (_) { return false; }
  }

  async function _enqueueOffline(event, payload, options) {
    try {
      const q = window.__OfflineMessageQueue;
      if (q?.enqueue) {
        await q.enqueue({ ...payload, _event: event, type: options.type || 'message' });
        _stats.offline++;
        return { ok: false, queued: true, transport: TRANSPORT.OFFLINE };
      }
    } catch (_) {}
    _stats.failed++;
    return { ok: false, queued: false };
  }

  // ── Public API ────────────────────────────────────────────────────────────
  const runtime = {
    deliver,
    getStats()       { return { ..._stats }; },
    getBestTransport: _getBest,
    isOnline:        _isOnline,
    hasLAN:          _hasLAN,
    hasMesh:         _hasMesh,
    TRANSPORT,

    getDiagnostics() {
      return {
        best         : _getBest(),
        online       : _isOnline(),
        lan          : _hasLAN(),
        mesh         : _hasMesh(),
        stats        : _stats,
        hybridHealth : window.__HybridTransportEngine?.getDiagnostics?.() || null,
        lanDiag      : window.__LANCommunicationEngine?.getDiagnostics?.() || null,
        offlineQueue : {
          size    : window.__OfflineMessageQueue?.size?.() || 0,
          pending : window.__OfflineMessageQueue?.getPending?.()?.length || 0,
        },
      };
    },
  };

  window.__Phase10TransportRuntime = runtime;
  window.TransportRuntime          = runtime; // short alias

  // Expose on event bus for other modules
  const bus = window.KynectaEventBus;
  if (bus) bus.emit('TRANSPORT_RUNTIME_READY', { transport: _getBest() });

  // Flush offline queue on reconnect
  window.addEventListener('online', () => {
    setTimeout(() => window.__OfflineMessageQueue?.flushAll?.(), 1000);
  });
  window.addEventListener('kyn:connected', () => {
    setTimeout(() => window.__OfflineMessageQueue?.flushAll?.(), 1000);
  });

  console.log('[Phase10] TransportRuntime ✅ active — best:', _getBest());
})();
