/**
 * AdaptiveBitrateEngine.js
 * Phase 3 — Adaptive Media Engine + Call Recovery Engine (Frontend)
 *
 * Keeps calls alive on poor networks:
 *  - Monitors RTC stats (RTT, packet loss, jitter, bandwidth)
 *  - Adapts quality: HD → SD → audio-only WITHOUT dropping call
 *  - Peer health monitoring with automatic ICE restart
 *  - Background/hidden-tab call recovery
 *  - Transport failover during active calls
 *
 * @version 3.0.0
 * @phase 3 — Adaptive Media + Recovery
 */

(function () {
  'use strict';

  if (window.__AdaptiveBitrateEngine) return;

  // ─── Quality Profiles ─────────────────────────────────────────────────────

  const QUALITY_PROFILES = {
    HD:         { width: 1280, height: 720,  frameRate: 30, maxBitrate: 2000000, audioBitrate: 128000 },
    SD:         { width: 640,  height: 480,  frameRate: 24, maxBitrate: 800000,  audioBitrate: 64000  },
    LOW:        { width: 320,  height: 240,  frameRate: 15, maxBitrate: 300000,  audioBitrate: 32000  },
    AUDIO_ONLY: { width: 0,    height: 0,    frameRate: 0,  maxBitrate: 0,       audioBitrate: 32000  },
  };

  const QUALITY_ORDER = ['HD', 'SD', 'LOW', 'AUDIO_ONLY'];

  // ─── NetworkQualityScorer ─────────────────────────────────────────────────

  class NetworkQualityScorer {
    score(stats) {
      if (!stats) return 'LOW';
      const { roundTripTime, packetsLost, bytesReceived } = stats;
      const rttMs = (roundTripTime || 0) * 1000;

      if (rttMs < 100 && packetsLost < 5)   return 'HD';
      if (rttMs < 300 && packetsLost < 20)  return 'SD';
      if (rttMs < 600 && packetsLost < 50)  return 'LOW';
      return 'AUDIO_ONLY';
    }
  }

  // ─── BitrateController ────────────────────────────────────────────────────

  class BitrateController {
    async setMaxBitrate(sender, maxBitrateBps) {
      if (!sender) return;
      try {
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = maxBitrateBps;
        await sender.setParameters(params);
      } catch (err) {
        // setParameters not supported in all browsers — silently degrade
        console.debug('[AdaptiveBR] setParameters not supported:', err.message);
      }
    }

    async applyProfile(peerConnection, profile) {
      if (!peerConnection) return;
      try {
        const senders = peerConnection.getSenders();
        for (const sender of senders) {
          if (!sender.track) continue;
          if (sender.track.kind === 'video' && profile.maxBitrate > 0) {
            await this.setMaxBitrate(sender, profile.maxBitrate);
          }
          if (sender.track.kind === 'audio') {
            await this.setMaxBitrate(sender, profile.audioBitrate);
          }
        }
      } catch (_) {}
    }
  }

  // ─── PeerHealthMonitor ────────────────────────────────────────────────────

  class PeerHealthMonitor {
    constructor(onHealthChange) {
      this._onHealthChange = onHealthChange;
      this._timers         = new Map(); // peerKey → intervalId
      this._lastQuality    = new Map(); // peerKey → quality string
    }

    startMonitoring(peerId, callId, getPeerSessionFn) {
      const key = `${peerId}:${callId}`;
      if (this._timers.has(key)) return;

      const timer = setInterval(async () => {
        const session = getPeerSessionFn(peerId, callId);
        if (!session) { this.stopMonitoring(peerId, callId); return; }

        const stats = await session.getStats().catch(() => null);
        if (!stats) return;

        const quality  = new NetworkQualityScorer().score(stats);
        const lastQual = this._lastQuality.get(key);

        if (quality !== lastQual) {
          this._lastQuality.set(key, quality);
          this._onHealthChange(peerId, callId, quality, stats);
        }
      }, 3000);

      this._timers.set(key, timer);
    }

    stopMonitoring(peerId, callId) {
      const key   = `${peerId}:${callId}`;
      const timer = this._timers.get(key);
      if (timer) { clearInterval(timer); this._timers.delete(key); }
      this._lastQuality.delete(key);
    }

    stopAll() {
      for (const timer of this._timers.values()) clearInterval(timer);
      this._timers.clear();
      this._lastQuality.clear();
    }
  }

  // ─── CallRecoveryEngine ───────────────────────────────────────────────────

  class CallRecoveryEngine {
    constructor() {
      this._recovering  = false;
      this._hiddenAt    = null;
      this._listeners   = [];
    }

    attach() {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this._hiddenAt = Date.now();
        } else {
          this._onTabVisible();
        }
      });

      // Network restoration recovery
      window.addEventListener('online', () => this._onNetworkRestored());

      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_CONNECTED', () => this._onSocketReconnected());
      }

      console.log('[CallRecovery] Attached');
    }

    onRecovery(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    // ── Private recovery flows ────────────────────────────────────────────

    _onTabVisible() {
      const hiddenSec = this._hiddenAt ? (Date.now() - this._hiddenAt) / 1000 : 0;
      this._hiddenAt  = null;

      const active = window.__CallStateMachine?.getActive();
      if (!active) return;

      console.log(`[CallRecovery] Tab visible after ${Math.round(hiddenSec)}s — checking call health`);

      // Recover media tracks that may have ended while backgrounded
      window.__DeviceMediaManager?.recoverTracks().then(() => {
        if (hiddenSec > 10) {
          // Long absence — try ICE restart
          this._triggerICERestart(active);
        }
        this._notify('recovery:tab_visible', { hiddenSec, callId: active.callId });
      });
    }

    _onNetworkRestored() {
      const active = window.__CallStateMachine?.getActive();
      if (!active) return;

      console.log('[CallRecovery] Network restored during call — triggering ICE restart');
      setTimeout(() => this._triggerICERestart(active), 1500);
      this._notify('recovery:network_restored', { callId: active.callId });
    }

    _onSocketReconnected() {
      const active = window.__CallStateMachine?.getActive();
      if (!active) return;

      if (active.state === window.CALL_STATE?.RECONNECTING) {
        console.log('[CallRecovery] Socket reconnected — restoring signaling for call');
        window.__CallStateMachine?.transition(active.callId, window.CALL_STATE.CONNECTING);
        this._triggerICERestart(active);
        this._notify('recovery:socket_reconnected', { callId: active.callId });
      }
    }

    _triggerICERestart(session) {
      if (!session || !session.peerId || !session.callId) return;
      window.__CallOrchestrator?.restartICE(session.callId, session.peerId)
        .catch(err => console.warn('[CallRecovery] ICE restart error:', err.message));
    }

    _notify(event, data) {
      this._listeners.forEach(fn => { try { fn({ event, ...data }); } catch (_) {} });
    }
  }

  // ─── AdaptiveBitrateEngine (main) ─────────────────────────────────────────

  class AdaptiveBitrateEngine {
    constructor() {
      this._scorer     = new NetworkQualityScorer();
      this._bitrate    = new BitrateController();
      this._health     = new PeerHealthMonitor((peerId, callId, quality, stats) => {
        this._onQualityChange(peerId, callId, quality, stats);
      });
      this._recovery   = new CallRecoveryEngine();
      this._currentQuality = new Map(); // peerKey → quality level index
      this._listeners  = [];
    }

    start() {
      this._recovery.attach();

      // Watch for new peer connections
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_EVENT', payload => {
          if (payload?.type === 'call:peer_connected') {
            const { peerId, callId } = payload;
            if (peerId && callId) {
              this._health.startMonitoring(peerId, callId,
                (pid, cid) => window.__PeerConnectionManager?.getSession(pid, cid)
              );
            }
          }
        });
      }

      // Watch via CallStateMachine
      window.__CallStateMachine?.watchAll(({ callId, state, session }) => {
        if (state === window.CALL_STATE?.CONNECTED && session?.peerId) {
          this._health.startMonitoring(session.peerId, callId,
            (pid, cid) => window.__PeerConnectionManager?.getSession(pid, cid)
          );
        }
        if (state === window.CALL_STATE?.ENDED || state === window.CALL_STATE?.FAILED) {
          this._health.stopAll();
        }
      });

      console.log('[AdaptiveBR] ✅ Started');
    }

    getRecovery() { return this._recovery; }

    onChange(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    getDiagnostics() {
      return {
        currentQuality: Object.fromEntries(this._currentQuality),
        monitoredPeers: this._health._timers.size,
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    async _onQualityChange(peerId, callId, newQuality, stats) {
      const key         = `${peerId}:${callId}`;
      const prevIndex   = this._currentQuality.get(key) ?? 0;
      const newIndex    = QUALITY_ORDER.indexOf(newQuality);
      if (newIndex === prevIndex) return;

      const profile = QUALITY_PROFILES[newQuality];
      this._currentQuality.set(key, newIndex);

      console.log(`[AdaptiveBR] Quality change for ${peerId}: ${QUALITY_ORDER[prevIndex]} → ${newQuality}`);

      // Adapt video track constraints
      const media = window.__DeviceMediaManager;
      if (newQuality === 'AUDIO_ONLY') {
        media?.disableVideo(true);
      } else if (prevIndex >= QUALITY_ORDER.indexOf('AUDIO_ONLY')) {
        media?.disableVideo(false); // Restore video if we were audio-only
      }

      // Apply bitrate caps to all senders for this peer
      const peerSession = window.__PeerConnectionManager?.getSession(peerId, callId);
      if (peerSession?._pc) {
        await this._bitrate.applyProfile(peerSession._pc, profile);
      }

      // Adapt video resolution
      if (newQuality !== 'AUDIO_ONLY') {
        await media?.adaptQuality(newQuality === 'HD' ? 'high' : newQuality === 'SD' ? 'medium' : 'low');
      }

      this._listeners.forEach(fn => {
        try { fn({ event: 'quality:changed', peerId, callId, quality: newQuality, stats }); } catch (_) {}
      });

      // Notify calls.html via CustomEvent
      window.dispatchEvent(new CustomEvent('kyn:call:quality_changed', {
        detail: { peerId, callId, quality: newQuality, stats }
      }));

      // Report stats to backend for quality analytics (non-blocking, best-effort)
      if (callId && stats) {
        try {
          const _apiBase = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) ||
                           (window.config && window.config.apiUrl) || '';
          const _token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
          if (_apiBase && _token) {
            fetch(`${_apiBase}/api/calls/${callId}/stats`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_token}` },
              body: JSON.stringify({
                rtt:          stats.rtt || 0,
                packetLoss:   stats.packetsLost || 0,
                jitter:       stats.jitter || 0,
                bitrate:      stats.bitrate || 0,
                qualityLevel: newQuality,
                timestamp:    Date.now(),
              }),
            }).catch(() => {}); // fully non-blocking
          }
        } catch (_) {}
      }
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const engine = new AdaptiveBitrateEngine();

  // Start after dependencies ready
  const tryStart = () => {
    if (window.__CallStateMachine && window.__PeerConnectionManager) {
      engine.start();
    } else {
      setTimeout(tryStart, 500);
    }
  };
  tryStart();

  window.__AdaptiveBitrateEngine = engine;
  window.AdaptiveBR              = engine;
  window.__CallRecoveryEngine    = engine.getRecovery();

  console.log('[AdaptiveBR] ✅ Ready');
})();
