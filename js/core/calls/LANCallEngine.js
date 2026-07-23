/**
 * LANCallEngine.js
 * Phase 3 — LAN/Campus Call Engine (Frontend)
 *
 * Enables WebRTC calls on local network WITHOUT internet:
 *  - Local SDP exchange via LAN WebSocket
 *  - mDNS-assisted peer discovery
 *  - Campus WiFi calling
 *  - AP isolation fallback via local relay signaling
 *  - Integrates with HybridTransportEngine for seamless failover
 *
 * @version 3.0.0
 * @phase 3 — LAN Call Engine
 */

(function () {
  'use strict';

  if (window.__LANCallEngine) return;

  const LAN_SIGNAL_TIMEOUT = 10000;

  // ─── LANSignalingChannel ─────────────────────────────────────────────────

  class LANSignalingChannel {
    constructor() {
      this._ws       = null;
      this._handlers = new Map();
      this._pending  = [];
    }

    async connect(wsUrl) {
      return new Promise((resolve, reject) => {
        try {
          this._ws = new WebSocket(wsUrl);
          const timer = setTimeout(() => reject(new Error('LAN signaling timeout')), LAN_SIGNAL_TIMEOUT);

          this._ws.onopen = () => {
            clearTimeout(timer);
            // Flush pending
            for (const msg of this._pending) this._ws.send(JSON.stringify(msg));
            this._pending = [];
            resolve(this);
          };

          this._ws.onmessage = e => {
            try {
              const msg = JSON.parse(e.data);
              const handler = this._handlers.get(msg.type);
              if (handler) handler(msg);
            } catch (_) {}
          };

          this._ws.onclose = () => {
            this._ws = null;
          };

          this._ws.onerror = () => {
            clearTimeout(timer);
            reject(new Error('LAN signaling connection error'));
          };
        } catch (err) {
          reject(err);
        }
      });
    }

    send(type, payload) {
      const msg = { type, ...payload, ts: Date.now() };
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify(msg));
      } else {
        this._pending.push(msg);
      }
    }

    on(type, handler) { this._handlers.set(type, handler); }

    isConnected() {
      return this._ws?.readyState === WebSocket.OPEN;
    }

    close() {
      this._ws?.close();
      this._ws = null;
    }
  }

  // ─── LANCallEngine (main) ─────────────────────────────────────────────────

  class LANCallEngine {
    constructor() {
      this._signal   = new LANSignalingChannel();
      this._active   = false;
      this._callId   = null;
      this._peerId   = null;
    }

    async start() {
      // Try to connect to LAN signaling (pushed by server via lan:peer_list)
      window.addEventListener('kyn:lan:signal_server', async e => {
        const wsUrl = e.detail?.wsUrl;
        if (!wsUrl) return;
        try {
          await this._signal.connect(wsUrl);
          this._attachSignalHandlers();
          console.log('[LANCall] Connected to LAN signaling server:', wsUrl);
        } catch (err) {
          console.debug('[LANCall] LAN signaling unavailable:', err.message);
        }
      });

      console.log('[LANCall] ✅ Started');
    }

    /**
     * Initiate a call via LAN signaling.
     * Returns true if LAN signaling sent, false if LAN unavailable.
     */
    async initiateCall(targetPeerId, callId, localStream) {
      if (!this._signal.isConnected()) return false;

      this._active = true;
      this._callId = callId;
      this._peerId = targetPeerId;

      // Create peer as initiator
      const peerSession = await window.__PeerConnectionManager.createSession(
        targetPeerId, callId, true, localStream
      );

      // Override signal function to use LAN channel
      peerSession._signal = payload => {
        this._signal.send('call:signal', { ...payload, targetPeerId, callId });
      };

      this._signal.send('call:lan:initiate', { callId, targetPeerId, timestamp: Date.now() });
      return true;
    }

    /**
     * Accept a call from LAN signaling.
     */
    async acceptLANCall(callId, callerId, localStream) {
      if (!this._signal.isConnected()) return false;

      this._active = true;
      this._callId = callId;
      this._peerId = callerId;

      const peerSession = await window.__PeerConnectionManager.createSession(
        callerId, callId, false, localStream
      );

      peerSession._signal = payload => {
        this._signal.send('call:signal', { ...payload, targetPeerId: callerId, callId });
      };

      this._signal.send('call:lan:accept', { callId, callerId, timestamp: Date.now() });
      return true;
    }

    isAvailable() { return this._signal.isConnected(); }
    isActive()    { return this._active; }

    getDiagnostics() {
      return {
        signaling: this._signal.isConnected(),
        active:    this._active,
        callId:    this._callId,
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _attachSignalHandlers() {
      this._signal.on('call:signal', async data => {
        const { callId, senderId, ...signalPayload } = data;
        if (!callId || !senderId) return;
        await window.__PeerConnectionManager.handleSignal(senderId, callId, signalPayload);
      });

      this._signal.on('call:lan:initiate', data => {
        // Incoming LAN call — fire same event as internet call for UI consistency
        window.dispatchEvent(new CustomEvent('kyn:call:incoming', {
          detail: { callId: data.callId, callerId: data.targetPeerId, transport: 'LAN' }
        }));
      });

      this._signal.on('call:lan:end', data => {
        this._active = false;
        window.__CallStateMachine?.end(data.callId, 'remote_ended');
      });
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const engine = new LANCallEngine();
  engine.start().catch(() => {});

  window.__LANCallEngine = engine;
  window.LANCall         = engine;

  console.log('[LANCall] ✅ Ready');
})();
