/**
 * adaptive-bitrate.js — Adaptive bitrate & bandwidth detection for WebRTC calls
 *
 * Phase 2 feature: Adaptive bitrate / bandwidth detection during calls
 *
 * Hooks into the existing calls-core.js RTCPeerConnection via the global
 * callsState object. Runs getStats() every 3 seconds, measures:
 *   - Available send bandwidth (googAvailableSendBandwidth / candidatePair)
 *   - Round-trip time
 *   - Packet loss %
 *   - Video bitrate (outbound-rtp)
 *
 * Then adjusts RTCRtpSender encoding parameters to match network conditions:
 *   - Strong  (>= 1.5Mbps, <2% loss)  → HD: maxBitrate 1.2Mbps, scaleDown 1.0
 *   - Medium  (>= 400Kbps)            → SD: maxBitrate 500Kbps,  scaleDown 1.5
 *   - Weak    (<  400Kbps or >5% loss)→ LD: maxBitrate 150Kbps,  scaleDown 2.5
 *
 * Also shows a live network quality indicator in the call UI (1–3 bars).
 */

(function (global) {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  const POLL_INTERVAL_MS = 3000;

  const PROFILES = {
    strong: { label: 'HD',  maxBitrateBps: 1_200_000, scaleDown: 1.0, maxFramerate: 30 },
    medium: { label: 'SD',  maxBitrateBps:   500_000, scaleDown: 1.5, maxFramerate: 24 },
    weak:   { label: 'LD',  maxBitrateBps:   150_000, scaleDown: 2.5, maxFramerate: 15 },
  };

  // ── State ──────────────────────────────────────────────────────────────────
  let _pollTimer   = null;
  let _lastProfile = null;
  let _prevStats   = null; // for delta calculations

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-abr-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-abr-styles';
    s.textContent = `
      #kynNetQuality {
        position: absolute;
        top: 12px; right: 12px;
        display: flex;
        align-items: flex-end;
        gap: 2px;
        z-index: 50;
        cursor: default;
      }
      .kyn-bar {
        width: 4px;
        border-radius: 2px;
        background: rgba(255,255,255,0.25);
        transition: background 0.4s, height 0.3s;
      }
      .kyn-bar:nth-child(1) { height: 8px;  }
      .kyn-bar:nth-child(2) { height: 13px; }
      .kyn-bar:nth-child(3) { height: 18px; }

      /* Strong — all green */
      #kynNetQuality.strong .kyn-bar { background: #22c55e; }

      /* Medium — 2 bars yellow */
      #kynNetQuality.medium .kyn-bar:nth-child(1),
      #kynNetQuality.medium .kyn-bar:nth-child(2) { background: #eab308; }

      /* Weak — 1 bar red */
      #kynNetQuality.weak .kyn-bar:nth-child(1) { background: #ef4444; }

      /* Tooltip on hover */
      #kynNetQuality::after {
        content: attr(data-tip);
        position: absolute;
        right: 0; top: 26px;
        background: rgba(0,0,0,0.75);
        color: #fff;
        font-size: 10px;
        padding: 3px 7px;
        border-radius: 6px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s;
      }
      #kynNetQuality:hover::after { opacity: 1; }

      /* Weak-connection banner */
      #kynWeakBanner {
        position: absolute;
        top: 44px; left: 50%;
        transform: translateX(-50%);
        background: rgba(239,68,68,0.85);
        color: #fff;
        font-size: 11px; font-weight: 600;
        padding: 4px 12px;
        border-radius: 20px;
        z-index: 60;
        pointer-events: none;
        animation: weakBannerIn 0.3s ease;
      }
      @keyframes weakBannerIn {
        from { opacity:0; transform:translateX(-50%) translateY(-8px) }
        to   { opacity:1; transform:translateX(-50%) translateY(0) }
      }
    `;
    document.head.appendChild(s);
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  function _getOrCreateQualityIcon() {
    let el = document.getElementById('kynNetQuality');
    if (el) return el;

    const callScreen = document.getElementById('callScreen') ||
                       document.getElementById('callContainer') ||
                       document.querySelector('.call-screen, .calls-screen');
    if (!callScreen) return null;

    el = document.createElement('div');
    el.id = 'kynNetQuality';
    el.title = 'Network quality';
    el.innerHTML = '<div class="kyn-bar"></div><div class="kyn-bar"></div><div class="kyn-bar"></div>';
    callScreen.style.position = callScreen.style.position || 'relative';
    callScreen.appendChild(el);
    return el;
  }

  function _updateQualityIcon(tier, rtt, loss, kbps) {
    const el = _getOrCreateQualityIcon();
    if (!el) return;
    el.className = tier;
    el.dataset.tip = `${PROFILES[tier].label} · ${Math.round(kbps)}Kbps · ${rtt}ms RTT · ${loss.toFixed(1)}% loss`;

    // Show weak banner only when tier changes to weak
    if (tier === 'weak' && _lastProfile !== 'weak') {
      _showWeakBanner();
    } else if (tier !== 'weak') {
      document.getElementById('kynWeakBanner')?.remove();
    }
  }

  function _showWeakBanner() {
    if (document.getElementById('kynWeakBanner')) return;
    const callScreen = document.getElementById('callScreen') ||
                       document.getElementById('callContainer') ||
                       document.querySelector('.call-screen');
    if (!callScreen) return;
    const b = document.createElement('div');
    b.id = 'kynWeakBanner';
    b.textContent = '⚠️ Poor connection — switching to low quality';
    callScreen.appendChild(b);
    setTimeout(() => b?.remove(), 4000);
  }

  // ── Get RTCPeerConnection ──────────────────────────────────────────────────
  function _getPeerConnection() {
    // calls-core.js exposes it in a few places depending on version
    return global.callsState?._peerConnection ||
           global.callsState?.peerConnection   ||
           global.__callsPeerConnection        ||
           global._peerConnection              ||
           null;
  }

  // ── Stats collection ───────────────────────────────────────────────────────
  async function _collectStats(pc) {
    const stats = await pc.getStats();
    let rtt = 0, lossRate = 0, availKbps = 0, outKbps = 0;
    let candidatePair = null;
    let outboundRtp   = null;

    stats.forEach(r => {
      if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) {
        candidatePair = r;
      }
      if (r.type === 'outbound-rtp' && r.kind === 'video') {
        outboundRtp = r;
      }
    });

    if (candidatePair) {
      rtt       = Math.round((candidatePair.currentRoundTripTime || 0) * 1000);
      availKbps = ((candidatePair.availableOutgoingBitrate || 0) / 1000) || 0;
    }

    if (outboundRtp && _prevStats) {
      const prev = _prevStats;
      const dtMs = POLL_INTERVAL_MS;
      const bytesDelta   = (outboundRtp.bytesSent   || 0) - (prev.bytesSent   || 0);
      const pktsDelta    = (outboundRtp.packetsSent  || 0) - (prev.packetsSent  || 0);
      const lostDelta    = ((outboundRtp.packetsLost || 0) - (prev.packetsLost  || 0));
      outKbps  = (bytesDelta * 8) / dtMs;
      lossRate = pktsDelta > 0 ? Math.max(0, (lostDelta / (pktsDelta + lostDelta)) * 100) : 0;
    }

    _prevStats = outboundRtp ? { ...outboundRtp } : null;

    // Prefer measured outgoing bitrate over available estimate
    const kbps = outKbps > 0 ? outKbps : availKbps;
    return { rtt, lossRate, kbps };
  }

  // ── Choose quality tier ────────────────────────────────────────────────────
  function _chooseTier(rtt, lossRate, kbps) {
    if (kbps === 0 && rtt === 0) return _lastProfile || 'strong'; // no data yet

    if (lossRate > 5 || kbps < 400 || rtt > 300) return 'weak';
    if (lossRate > 2 || kbps < 1500 || rtt > 150) return 'medium';
    return 'strong';
  }

  // ── Apply encoding params ──────────────────────────────────────────────────
  async function _applyProfile(pc, tier) {
    if (tier === _lastProfile) return; // no change
    _lastProfile = tier;

    const profile  = PROFILES[tier];
    const senders  = pc.getSenders?.() || [];
    const videoSnd = senders.find(s => s.track?.kind === 'video');
    if (!videoSnd) return;

    try {
      const params = videoSnd.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings.forEach(enc => {
        enc.maxBitrate            = profile.maxBitrateBps;
        enc.scaleResolutionDownBy = profile.scaleDown;
        enc.maxFramerate          = profile.maxFramerate;
      });
      await videoSnd.setParameters(params);
      console.log(`[ABR] Switched to ${profile.label} (${Math.round(profile.maxBitrateBps / 1000)}Kbps)`);
    } catch (e) {
      console.warn('[ABR] setParameters failed:', e.message);
    }

    // Notify call UI
    window.dispatchEvent(new CustomEvent('kyn:qualityChanged', {
      detail: { tier, label: profile.label }
    }));
  }

  // ── Poll loop ──────────────────────────────────────────────────────────────
  async function _poll() {
    const pc = _getPeerConnection();
    if (!pc || pc.connectionState === 'closed') {
      stop();
      return;
    }

    try {
      const { rtt, lossRate, kbps } = await _collectStats(pc);
      const tier = _chooseTier(rtt, lossRate, kbps);
      _updateQualityIcon(tier, rtt, lossRate, kbps);
      await _applyProfile(pc, tier);
    } catch (e) {
      console.warn('[ABR] Stats poll error:', e.message);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function start() {
    if (_pollTimer) return;
    _lastProfile = null;
    _prevStats   = null;
    _pollTimer   = setInterval(_poll, POLL_INTERVAL_MS);
    console.log('[ABR] Adaptive bitrate monitoring started');
  }

  function stop() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
    _lastProfile = null;
    _prevStats   = null;
    document.getElementById('kynNetQuality')?.remove();
    document.getElementById('kynWeakBanner')?.remove();
    console.log('[ABR] Adaptive bitrate monitoring stopped');
  }

  // ── Hook into calls-core events ────────────────────────────────────────────
  function _hook() {
    // calls-core fires these custom events on window
    window.addEventListener('call:connected',     () => { setTimeout(start, 1000); });
    window.addEventListener('call:ended',         stop);
    window.addEventListener('call:disconnected',  stop);

    // Also watch callsState directly (for when event isn't fired)
    const _watchState = setInterval(() => {
      const state = global.callsState?.connectionState ||
                    global.callsState?.state;
      if (state === 'connected' && !_pollTimer) start();
      if ((state === 'ended' || state === 'idle') && _pollTimer) stop();
    }, 2000);

    // Stop watcher when page unloads
    window.addEventListener('beforeunload', () => clearInterval(_watchState));
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    _injectStyles();
    _hook();
    global.kynAdaptiveBitrate = { start, stop };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }

}(window));
