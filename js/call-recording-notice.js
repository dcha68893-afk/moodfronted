/**
 * call-recording-notice.js — Call recording legal notification banner
 *
 * Phase 1 feature: Call recording notification (legal requirement)
 *
 * - Shows a banner when a call recording starts/stops
 * - Legally required in many jurisdictions (all-party consent states)
 * - Does NOT implement actual recording — only the notification layer
 * - Works with existing calls-core.js and calls-ui.js
 * - Banner also shown to the remote party via Socket.IO signal
 *
 * Integration: calls-core.js fires 'call:recordingStarted' / 'call:recordingStopped' events
 */

(function (global) {
  'use strict';

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-call-rec-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-call-rec-styles';
    s.textContent = `
      #kynRecordingBanner {
        position: fixed;
        top: 0; left: 0; right: 0;
        background: #dc2626;
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        text-align: center;
        padding: 10px 16px;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        animation: recBannerIn 0.3s ease;
        box-shadow: 0 2px 12px rgba(220,38,38,0.4);
      }
      @keyframes recBannerIn {
        from { transform: translateY(-100%); opacity: 0 }
        to   { transform: translateY(0);    opacity: 1 }
      }
      #kynRecordingBanner.hiding {
        animation: recBannerOut 0.3s ease forwards;
      }
      @keyframes recBannerOut {
        to { transform: translateY(-100%); opacity: 0 }
      }
      #kynRecordingBanner .rec-dot {
        width: 8px; height: 8px;
        background: #fff;
        border-radius: 50%;
        animation: recPulse 1s ease-in-out infinite;
      }
      @keyframes recPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.4; transform: scale(0.7); }
      }
      #kynRecordingBanner .rec-dismiss {
        position: absolute;
        right: 12px;
        background: none; border: none;
        color: rgba(255,255,255,0.7);
        cursor: pointer; font-size: 16px; padding: 0;
      }

      /* In-call recording indicator (smaller, in calls UI) */
      #kynInCallRecIndicator {
        position: absolute;
        top: 12px; left: 50%;
        transform: translateX(-50%);
        background: rgba(220,38,38,0.9);
        color: #fff;
        font-size: 11px; font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        padding: 4px 10px;
        border-radius: 20px;
        display: flex; gap: 5px; align-items: center;
        z-index: 100;
      }
      #kynInCallRecIndicator .rec-dot {
        width: 6px; height: 6px;
        background: #fff; border-radius: 50%;
        animation: recPulse 1s ease-in-out infinite;
      }

      /* Consent dialog */
      #kynRecordingConsent {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.7);
        z-index: 10001;
        display: flex; align-items: center; justify-content: center;
      }
      #kynRecordingConsentBox {
        background: var(--bg-primary, #141420);
        border-radius: 16px;
        padding: 24px 20px;
        max-width: 320px; width: 90%;
        text-align: center;
        border: 1px solid rgba(220,38,38,0.3);
      }
      #kynRecordingConsentBox .rec-icon {
        font-size: 32px; margin-bottom: 12px;
      }
      #kynRecordingConsentBox h3 {
        font-size: 16px; font-weight: 700;
        color: var(--text-primary, #fff);
        margin: 0 0 8px;
      }
      #kynRecordingConsentBox p {
        font-size: 13px; color: var(--text-muted, #999);
        line-height: 1.5; margin: 0 0 20px;
      }
      #kynRecordingConsentBox .consent-btns {
        display: flex; gap: 10px;
      }
      #kynRecordingConsentBox button {
        flex: 1; padding: 10px;
        border-radius: 10px; border: none;
        font-size: 14px; font-weight: 600; cursor: pointer;
      }
      #kynConsentDecline {
        background: var(--bg-secondary, #1e1e2e);
        color: var(--text-muted, #888);
      }
      #kynConsentAccept {
        background: #dc2626; color: #fff;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Banner ─────────────────────────────────────────────────────────────────
  function _showBanner(message) {
    _hideBanner(true); // remove any existing

    const banner = document.createElement('div');
    banner.id = 'kynRecordingBanner';
    banner.innerHTML = `
      <div class="rec-dot"></div>
      <span>${message}</span>
      <button class="rec-dismiss" title="Dismiss">×</button>
    `;
    banner.querySelector('.rec-dismiss').addEventListener('click', _hideBanner);
    document.body.prepend(banner);
  }

  function _hideBanner(immediate = false) {
    const banner = document.getElementById('kynRecordingBanner');
    if (!banner) return;
    if (immediate) { banner.remove(); return; }
    banner.classList.add('hiding');
    setTimeout(() => banner.remove(), 320);
  }

  // ── In-call indicator ───────────────────────────────────────────────────────
  function _showInCallIndicator() {
    if (document.getElementById('kynInCallRecIndicator')) return;
    const callUi = document.getElementById('callScreen') ||
                   document.getElementById('callContainer') ||
                   document.querySelector('.call-screen');
    if (!callUi) return;
    callUi.style.position = callUi.style.position || 'relative';
    const el = document.createElement('div');
    el.id = 'kynInCallRecIndicator';
    el.innerHTML = '<div class="rec-dot"></div> Recording';
    callUi.appendChild(el);
  }

  function _hideInCallIndicator() {
    document.getElementById('kynInCallRecIndicator')?.remove();
  }

  // ── Consent dialog ─────────────────────────────────────────────────────────
  function showConsentDialog(callerName, onAccept, onDecline) {
    const overlay = document.createElement('div');
    overlay.id = 'kynRecordingConsent';
    overlay.innerHTML = `
      <div id="kynRecordingConsentBox">
        <div class="rec-icon">⏺️</div>
        <h3>Recording in progress</h3>
        <p><strong>${_esc(callerName)}</strong> is recording this call.
           By continuing, you consent to being recorded.
           Recording may be subject to local laws.</p>
        <div class="consent-btns">
          <button id="kynConsentDecline">Leave call</button>
          <button id="kynConsentAccept">Continue</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#kynConsentDecline').addEventListener('click', () => {
      overlay.remove();
      if (typeof onDecline === 'function') onDecline();
    });
    overlay.querySelector('#kynConsentAccept').addEventListener('click', () => {
      overlay.remove();
      _showBanner('🔴 This call is being recorded');
      _showInCallIndicator();
      if (typeof onAccept === 'function') onAccept();
    });
  }

  // ── Recording started handler ───────────────────────────────────────────────
  function onRecordingStarted({ initiatorName = 'The other party', isLocal = false } = {}) {
    if (isLocal) {
      // Local user started recording — show banner and in-call indicator
      _showBanner('🔴 You are recording this call');
      _showInCallIndicator();
    } else {
      // Remote party started recording — must show consent dialog
      const endCall = () => {
        window.dispatchEvent(new CustomEvent('kyn:endCall', { detail: { reason: 'recording_declined' } }));
      };
      showConsentDialog(initiatorName, () => {}, endCall);
    }
  }

  function onRecordingStopped({ isLocal = false } = {}) {
    _hideInCallIndicator();
    _showBanner('Recording stopped');
    setTimeout(_hideBanner, 3000);
  }

  // ── Hook into calls-core events ────────────────────────────────────────────
  function _hookCallsCore() {
    // calls-core.js fires CustomEvents on window
    window.addEventListener('call:recordingStarted', (e) => onRecordingStarted(e.detail || {}));
    window.addEventListener('call:recordingStopped', (e) => onRecordingStopped(e.detail || {}));

    // Also hook via Socket.IO for remote-initiated recording notification
    const socket = global.__socket || global.socket;
    if (socket) {
      socket.on('call:recording:started', (data) => onRecordingStarted({ ...data, isLocal: false }));
      socket.on('call:recording:stopped', (data) => onRecordingStopped({ ...data, isLocal: false }));
    } else {
      // Retry when socket connects
      window.addEventListener('kyn:socketConnected', () => {
        const s = global.__socket || global.socket;
        if (s) {
          s.on('call:recording:started', (data) => onRecordingStarted({ ...data, isLocal: false }));
          s.on('call:recording:stopped', (data) => onRecordingStopped({ ...data, isLocal: false }));
        }
      });
    }
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    _injectStyles();
    _hookCallsCore();

    global.kynCallRecording = {
      onRecordingStarted,
      onRecordingStopped,
      showConsentDialog,
      showBanner: _showBanner,
      hideBanner: _hideBanner,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }

}(window));
