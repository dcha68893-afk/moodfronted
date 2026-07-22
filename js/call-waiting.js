/**
 * call-waiting.js — Call waiting and call hold for MoodChat
 *
 * Phase remaining: Call waiting / call on hold
 *
 * Features:
 *   1. CALL HOLD — mute all tracks and signal remote party
 *      hold  → replaceTrack with silent/black track + socket emit 'call:hold'
 *      unhold → restore original tracks + socket emit 'call:unhold'
 *
 *   2. CALL WAITING — incoming call during active call
 *      Shows a compact incoming-call banner (not full screen)
 *      Options: Accept (puts current on hold) | Decline | End current & accept
 *
 *   3. CALL SWAP — switch between held and active call
 *
 * Hooks into existing calls-core.js and calls-ui.js events.
 * Does NOT modify calls-core.js — purely additive overlay.
 */

(function (global) {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let _activeCall    = null; // current call object
  let _waitingCall   = null; // incoming call while active
  let _onHold        = false;
  let _origTracks    = { audio: null, video: null }; // original MediaStreamTracks

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-callwait-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-callwait-styles';
    s.textContent = `
      /* Hold indicator overlay */
      #kynHoldOverlay {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 80;
        color: #fff;
        font-size: 16px;
        font-weight: 600;
        gap: 12px;
        backdrop-filter: blur(4px);
      }
      #kynHoldOverlay i { font-size: 36px; color: rgba(255,255,255,0.7); }
      #kynHoldOverlay .hold-timer {
        font-size: 24px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        letter-spacing: 2px;
      }
      #kynResumeBtn {
        margin-top: 8px;
        padding: 12px 28px;
        background: #22c55e;
        border: none;
        border-radius: 28px;
        color: #fff;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.1s;
      }
      #kynResumeBtn:active { transform: scale(0.95); }

      /* Hold button in call controls */
      #kynHoldBtn {
        width: 52px; height: 52px;
        border-radius: 50%;
        border: none;
        background: rgba(255,255,255,0.12);
        color: #fff;
        font-size: 18px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      #kynHoldBtn.on-hold { background: #eab308; color: #000; }
      #kynHoldBtn:hover   { background: rgba(255,255,255,0.2); }

      /* Waiting call banner */
      #kynWaitingBanner {
        position: fixed;
        top: 16px; left: 50%;
        transform: translateX(-50%);
        background: var(--bg-primary, #141420);
        border: 1px solid var(--border-color, rgba(255,255,255,0.1));
        border-radius: 16px;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 9999;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        min-width: 280px;
        animation: waitBannerIn 0.25s ease;
      }
      @keyframes waitBannerIn {
        from { opacity:0; transform:translateX(-50%) translateY(-20px) }
        to   { opacity:1; transform:translateX(-50%) translateY(0) }
      }
      #kynWaitingBanner .wb-avatar {
        width: 42px; height: 42px; border-radius: 50%;
        background: var(--accent, #7c3aed);
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-weight: 700; font-size: 16px;
        flex-shrink: 0;
        animation: callPulse 1.5s ease-in-out infinite;
      }
      @keyframes callPulse {
        0%,100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
        50%      { box-shadow: 0 0 0 12px rgba(124,58,237,0); }
      }
      #kynWaitingBanner .wb-info { flex: 1; min-width: 0; }
      #kynWaitingBanner .wb-label {
        font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
        color: var(--text-muted, #888); font-weight: 700;
      }
      #kynWaitingBanner .wb-name {
        font-size: 15px; font-weight: 700; color: var(--text-primary, #fff);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #kynWaitingBanner .wb-actions { display: flex; gap: 8px; }
      .wb-action-btn {
        width: 40px; height: 40px; border-radius: 50%; border: none;
        font-size: 16px; cursor: pointer; display: flex;
        align-items: center; justify-content: center; flex-shrink: 0;
        transition: transform 0.1s;
      }
      .wb-action-btn:active { transform: scale(0.9); }
      .wb-accept  { background: #22c55e; color: #fff; }
      .wb-decline { background: #ef4444; color: #fff; }
      .wb-end-accept { background: #f59e0b; color: #fff; font-size: 12px; }
    `;
    document.head.appendChild(s);
  }

  // ── HOLD ───────────────────────────────────────────────────────────────────
  async function holdCall() {
    if (_onHold) return;
    const pc = global.__callsPeerConnection;
    if (!pc) return;

    _onHold = true;

    // Save original tracks and replace with silent/black
    const senders = pc.getSenders?.() || [];
    for (const sender of senders) {
      if (!sender.track) continue;
      if (sender.track.kind === 'audio') {
        _origTracks.audio = sender.track;
        // Create silent audio track
        const ctx = new AudioContext();
        const dst = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator();
        osc.frequency.value = 0;
        osc.connect(dst);
        osc.start();
        await sender.replaceTrack(dst.stream.getAudioTracks()[0]);
      }
      if (sender.track.kind === 'video') {
        _origTracks.video = sender.track;
        // Create black video track
        const canvas = document.createElement('canvas');
        canvas.width = 2; canvas.height = 2;
        const blackStream = canvas.captureStream(0);
        await sender.replaceTrack(blackStream.getVideoTracks()[0]);
      }
    }

    // Signal remote party
    const socket = window.KynectaRealtime?._socket;
    if (socket && _activeCall?.callId) {
      socket.emit('call:hold', { callId: _activeCall.callId });
    }

    _showHoldUI();
    console.log('[CallWaiting] Call on hold');
  }

  async function resumeCall() {
    if (!_onHold) return;
    _onHold = false;

    const pc = global.__callsPeerConnection;
    if (!pc) return;

    const senders = pc.getSenders?.() || [];
    for (const sender of senders) {
      if (sender.track?.kind === 'audio' && _origTracks.audio) {
        await sender.replaceTrack(_origTracks.audio);
      }
      if (sender.track?.kind === 'video' && _origTracks.video) {
        await sender.replaceTrack(_origTracks.video);
      }
    }

    const socket = window.KynectaRealtime?._socket;
    if (socket && _activeCall?.callId) {
      socket.emit('call:unhold', { callId: _activeCall.callId });
    }

    _hideHoldUI();
    console.log('[CallWaiting] Call resumed');
  }

  // ── Hold UI ────────────────────────────────────────────────────────────────
  let _holdTimerInterval = null;
  let _holdStart = 0;

  function _showHoldUI() {
    const callScreen = document.getElementById('callScreen') ||
                       document.querySelector('.call-screen, .calls-screen');
    if (!callScreen) return;

    const overlay = document.createElement('div');
    overlay.id = 'kynHoldOverlay';
    overlay.innerHTML = `
      <i class="fas fa-pause-circle"></i>
      <div>Call on hold</div>
      <div class="hold-timer" id="kynHoldTimer">0:00</div>
      <button id="kynResumeBtn">
        <i class="fas fa-play"></i> Resume
      </button>
    `;
    overlay.querySelector('#kynResumeBtn').addEventListener('click', resumeCall);
    callScreen.style.position = callScreen.style.position || 'relative';
    callScreen.appendChild(overlay);

    _holdStart = Date.now();
    _holdTimerInterval = setInterval(() => {
      const el   = document.getElementById('kynHoldTimer');
      const secs = Math.floor((Date.now() - _holdStart) / 1000);
      if (el) el.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }, 500);

    // Update hold button
    const holdBtn = document.getElementById('kynHoldBtn');
    if (holdBtn) holdBtn.classList.add('on-hold');
  }

  function _hideHoldUI() {
    clearInterval(_holdTimerInterval);
    document.getElementById('kynHoldOverlay')?.remove();
    const holdBtn = document.getElementById('kynHoldBtn');
    if (holdBtn) holdBtn.classList.remove('on-hold');
  }

  // ── Inject hold button into call controls ──────────────────────────────────
  function _injectHoldButton() {
    if (document.getElementById('kynHoldBtn')) return;

    const controls = document.querySelector('.call-controls, #callControls, .call-actions');
    if (!controls) return;

    const btn = document.createElement('button');
    btn.id    = 'kynHoldBtn';
    btn.title = 'Hold / Resume';
    btn.innerHTML = '<i class="fas fa-pause"></i>';
    btn.addEventListener('click', () => {
      if (_onHold) resumeCall();
      else         holdCall();
    });

    // Insert before the end-call button
    const endBtn = controls.querySelector('[id*="end"], [id*="hang"], .end-call-btn');
    if (endBtn) controls.insertBefore(btn, endBtn);
    else        controls.appendChild(btn);
  }

  // ── CALL WAITING ───────────────────────────────────────────────────────────
  function showWaitingCall(callData) {
    if (document.getElementById('kynWaitingBanner')) return;
    _waitingCall = callData;

    const callerName = callData.callerName || callData.caller?.username || 'Unknown';
    const initials   = callerName.slice(0, 2).toUpperCase();

    const banner = document.createElement('div');
    banner.id = 'kynWaitingBanner';
    banner.innerHTML = `
      <div class="wb-avatar">${initials}</div>
      <div class="wb-info">
        <div class="wb-label">Incoming call</div>
        <div class="wb-name">${callerName}</div>
      </div>
      <div class="wb-actions">
        <button class="wb-action-btn wb-end-accept" id="kynWbEndAccept" title="End current & accept">
          <i class="fas fa-phone-alt"></i>
        </button>
        <button class="wb-action-btn wb-accept" id="kynWbAccept" title="Hold current & accept">
          <i class="fas fa-phone"></i>
        </button>
        <button class="wb-action-btn wb-decline" id="kynWbDecline" title="Decline">
          <i class="fas fa-phone-slash"></i>
        </button>
      </div>
    `;

    banner.querySelector('#kynWbAccept').addEventListener('click', () => {
      _dismissWaiting();
      holdCall().then(() => _acceptWaitingCall(callData));
    });

    banner.querySelector('#kynWbEndAccept').addEventListener('click', () => {
      _dismissWaiting();
      window.dispatchEvent(new CustomEvent('kyn:endCall', { detail: { reason: 'call_waiting_swap' } }));
      setTimeout(() => _acceptWaitingCall(callData), 800);
    });

    banner.querySelector('#kynWbDecline').addEventListener('click', () => {
      _dismissWaiting();
      _declineWaitingCall(callData);
    });

    document.body.appendChild(banner);

    // Auto-dismiss after 30 seconds (caller hangs up)
    setTimeout(_dismissWaiting, 30_000);
    // FIX (Notifications audit): this vibrated unconditionally regardless of
    // Settings > Notifications > "Call Notifications". Reading the settings
    // cache directly here (rather than a window.__callNotificationsEnabled
    // global) since there's no guarantee this iframe's settings listener has
    // run yet by the time a waiting-call banner shows.
    let _callVibrateOn = true;
    try {
        const raw = localStorage.getItem('knecta_settings_cache');
        const n = raw && JSON.parse(raw)?.data?.notifications;
        if (n) {
            _callVibrateOn = n.callNotifications !== false && n.notificationVibration !== false;
        }
    } catch (_) {}
    if (navigator.vibrate && _callVibrateOn) navigator.vibrate([200, 100, 200, 100, 200]);
  }

  function _dismissWaiting() {
    document.getElementById('kynWaitingBanner')?.remove();
    _waitingCall = null;
  }

  function _acceptWaitingCall(callData) {
    window.dispatchEvent(new CustomEvent('kyn:acceptCall', { detail: callData }));
  }

  function _declineWaitingCall(callData) {
    const socket = window.KynectaRealtime?._socket;
    if (socket) socket.emit('call:decline', { callId: callData.callId });
  }

  // ── Remote hold notification ───────────────────────────────────────────────
  function _handleRemoteHold(onHold) {
    const callScreen = document.getElementById('callScreen') ||
                       document.querySelector('.call-screen');
    if (!callScreen) return;

    const existing = document.getElementById('kynRemoteHoldNotice');
    if (onHold && !existing) {
      const notice = document.createElement('div');
      notice.id = 'kynRemoteHoldNotice';
      notice.style.cssText = `
        position:absolute; top:60px; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,0.7); color:#fff; font-size:13px; font-weight:600;
        padding:6px 16px; border-radius:20px; z-index:90; white-space:nowrap;
      `;
      notice.textContent = 'Call on hold by the other party';
      callScreen.appendChild(notice);
    } else if (!onHold && existing) {
      existing.remove();
    }
  }

  // ── Hook Socket.IO events ──────────────────────────────────────────────────
  function _hookSocket() {
    const socket = window.KynectaRealtime?._socket;
    if (!socket) { setTimeout(_hookSocket, 1500); return; }

    socket.on('call:hold',   () => _handleRemoteHold(true));
    socket.on('call:unhold', () => _handleRemoteHold(false));

    // Intercept incoming call when already in a call
    socket.on('call:incoming', (data) => {
      if (_activeCall && !_onHold) {
        showWaitingCall(data);
      }
    });
  }

  // ── Track active call state from calls-core events ─────────────────────────
  function _hookCallEvents() {
    window.addEventListener('call:connected', (e) => {
      _activeCall = e.detail || {};
      _injectHoldButton();
    });
    window.addEventListener('call:ended', () => {
      _activeCall  = null;
      _waitingCall = null;
      _onHold      = false;
      _hideHoldUI();
      _dismissWaiting();
    });
    window.addEventListener('kyn:call:connected', (e) => {
      _activeCall = e.detail || {};
      _injectHoldButton();
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  global.kynCallWaiting = { holdCall, resumeCall, showWaitingCall };

  function init() {
    _injectStyles();
    _hookCallEvents();
    setTimeout(_hookSocket, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }

}(window));
