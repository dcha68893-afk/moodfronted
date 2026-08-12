/**
 * CallManager.js — compatibility facade for the canonical calls-core engine.
 *
 * IMPORTANT: calls-core.part1..part8 + calls-ui.js own the real call lifecycle.
 * This facade intentionally owns NO second state machine, socket listeners,
 * timers, WebRTC PeerConnection, media tracks, or navigation state.
 *
 * Older modules may continue calling window.__CallManager, but every operation
 * is delegated to the one authoritative window.callCore instance.
 */
(function () {
  'use strict';

  if (window.__CallManager) return;

  function core() {
    return window.callCore || window.CallsCore || window.callsCore || null;
  }

  function waitForCore(timeoutMs = 10000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      (function poll() {
        const c = core();
        if (c) return resolve(c);
        if (Date.now() - started >= timeoutMs) {
          return reject(new Error('Canonical callCore is not ready'));
        }
        setTimeout(poll, 50);
      })();
    });
  }

  function state() {
    const c = core();
    try { return c && typeof c.getState === 'function' ? c.getState() : {}; }
    catch (_) { return {}; }
  }

  function activeCallId() {
    const s = state();
    return s.activeCallId || s.serverCallId || s.localCallId ||
      (window.callsState && (window.callsState.activeCallId || window.callsState.serverCallId)) || null;
  }

  class CallManagerFacade {
    constructor() {
      this._ready = true;
      this._listeners = new Set();
      this._readyPromise = waitForCore().catch(() => null);
      console.log('[CallManager] Canonical facade loaded — calls-core is the sole lifecycle owner');
    }

    async startOutgoingCall(_callId, callType, targetUserId, peerInfo = {}) {
      const c = await waitForCore();
      if (typeof c.startCall !== 'function') throw new Error('callCore.startCall is unavailable');
      return c.startCall(targetUserId, callType || 'audio', peerInfo || {});
    }

    handleIncomingCall(_data) {
      // Incoming-call delivery is already owned by calls-core. Do not process it
      // a second time here; returning the canonical state keeps legacy callers safe.
      return state();
    }

    async acceptCall() {
      const c = await waitForCore();
      if (typeof c.acceptCall !== 'function') throw new Error('callCore.acceptCall is unavailable');
      return c.acceptCall();
    }

    async rejectCall() {
      const c = await waitForCore();
      if (typeof c.rejectCall === 'function') return c.rejectCall();
      if (typeof c.declineCall === 'function') return c.declineCall();
    }

    async cancelCall() {
      const c = await waitForCore();
      if (typeof c.endCall !== 'function') throw new Error('callCore.endCall is unavailable');
      return c.endCall();
    }

    async endCall() {
      const c = await waitForCore();
      if (typeof c.endCall !== 'function') throw new Error('callCore.endCall is unavailable');
      return c.endCall();
    }

    onRemoteEnded(callId, data) {
      const c = core();
      if (c && typeof c.handleCallEnded === 'function') return c.handleCallEnded(data || { callId });
      return state();
    }

    missCall() {
      const c = core();
      if (c && typeof c.handleCallTimeout === 'function') return c.handleCallTimeout();
      return state();
    }

    onBusy(data) {
      const c = core();
      if (c && typeof c.handleCallRejected === 'function') return c.handleCallRejected({ ...(data || {}), reason: 'busy' });
      return state();
    }

    failCall(data) {
      const c = core();
      if (c && typeof c.handleCallFailed === 'function') return c.handleCallFailed(data || {});
      return state();
    }

    onNegotiating() { return state(); }
    onConnected() { return state(); }
    onReconnecting() { return state(); }
    onReconnected() { return state(); }

    toggleMute() {
      const c = core();
      return c && typeof c.toggleMute === 'function' ? c.toggleMute() : false;
    }

    toggleVideo() {
      const c = core();
      return c && typeof c.toggleVideo === 'function' ? c.toggleVideo() : false;
    }

    async switchCamera() {
      const c = await waitForCore();
      if (typeof c.switchCamera === 'function') return c.switchCamera();
      return false;
    }

    setSpeaker(on) {
      const c = core();
      if (c && typeof c.setSpeaker === 'function') return c.setSpeaker(on);
      if (c && typeof c.toggleSpeaker === 'function') return c.toggleSpeaker(on);
      return false;
    }

    async startScreenShare() {
      const c = await waitForCore();
      if (typeof c.startScreenShare === 'function') return c.startScreenShare();
      return false;
    }

    async stopScreenShare() {
      const c = await waitForCore();
      if (typeof c.stopScreenShare === 'function') return c.stopScreenShare();
      return false;
    }

    getSession() {
      const s = state();
      return s.activeCall || s.callData || null;
    }

    getCallId() { return activeCallId(); }

    getLocalStream() {
      const s = state();
      return s.localStream || (window.callsUI && window.callsUI.UIState && window.callsUI.UIState.localStream) || null;
    }

    getPeerStream() {
      const s = state();
      return s.remoteStream || null;
    }

    isInCall() {
      const c = core();
      if (c && typeof c.isInCall === 'function') return !!c.isInCall();
      const s = state();
      return !!(s.callActive && ['connecting', 'connected', 'in-call', 'in_call'].includes(s.callState));
    }

    setPeerStream(stream) {
      try {
        const s = window.__CallsCoreShared;
        if (s && s.callsState) s.callsState.remoteStream = stream || null;
      } catch (_) {}
    }

    watch(fn) {
      const c = core();
      if (c && typeof c.watch === 'function') return c.watch(fn);
      if (typeof fn !== 'function') return () => {};
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }

    getDiagnostics() {
      const s = state();
      return {
        activeCall: s.activeCallId || s.serverCallId || s.localCallId ? {
          callId: s.activeCallId || s.serverCallId || s.localCallId,
          state: s.callState,
          duration: s.callDuration || 0,
        } : null,
        canonical: true,
      };
    }
  }

  window.__CallManager = new CallManagerFacade();
  window.CallManager = window.__CallManager;
})();