/**
 * CallStateMachine.js
 * Phase 3 — Call State Machine (Frontend)
 *
 * Manages authoritative call lifecycle state.
 * Integrates with the existing kyn:call:* CustomEvent system used by
 * calls.html and the existing sendSignal() / webrtc:signal pipeline.
 *
 * Existing events wired (from app.realtime.socket.js):
 *   kyn:call:incoming  → RINGING
 *   kyn:call:accepted  → CONNECTING
 *   kyn:call:rejected  → ENDED
 *   kyn:call:ended     → ENDED
 *   kyn:call:cancelled → ENDED
 *   webrtc:signal      → handled by PeerConnectionManager
 *
 * @version 3.0.0
 * @phase 3 — WebRTC Call Engine
 */

(function () {
  'use strict';

  if (window.__CallStateMachine) return;

  // ─── Call States ──────────────────────────────────────────────────────────

  const CALL_STATE = Object.freeze({
    IDLE:          'IDLE',
    INITIATING:    'INITIATING',    // Outbound: waiting for callee to ring
    RINGING:       'RINGING',       // Inbound: showing incoming call UI
    CONNECTING:    'CONNECTING',    // ICE + media negotiation
    CONNECTED:     'CONNECTED',     // Media flowing
    RECONNECTING:  'RECONNECTING',  // Recovering from transport loss
    ENDING:        'ENDING',        // Teardown in progress
    ENDED:         'ENDED',         // Terminal
    FAILED:        'FAILED',        // Terminal — error
    SCHEDULED:     'SCHEDULED',     // Scheduled future call — waiting for start time
    WAITING_ROOM:  'WAITING_ROOM',  // Host not yet admitted participant
  });

  const CALL_TYPE = Object.freeze({
    AUDIO:  'audio',
    VIDEO:  'video',
    GROUP:  'group',
    LAN:    'lan',
    SCREEN: 'screen',
  });

  // ─── CallSession ─────────────────────────────────────────────────────────

  class CallSession {
    constructor(callId, callType, peerId, isOutbound) {
      this.callId      = callId;
      this.callType    = callType;
      this.peerId      = peerId;        // userId or groupId
      this.isOutbound  = isOutbound;
      this.state       = CALL_STATE.IDLE;
      this.startedAt   = Date.now();
      this.connectedAt = null;
      this.endedAt     = null;
      this.transport   = 'INTERNET';    // INTERNET | LAN | MESH
      this.groupParticipants = new Map(); // userId → state
      this.reconnectAttempts = 0;
      this.maxReconnects     = 5;
    }

    get duration() {
      if (!this.connectedAt) return 0;
      const end = this.endedAt || Date.now();
      return Math.floor((end - this.connectedAt) / 1000);
    }

    canTransition(newState) {
      const allowed = {
        [CALL_STATE.IDLE]:          [CALL_STATE.INITIATING, CALL_STATE.RINGING, CALL_STATE.SCHEDULED],
        [CALL_STATE.INITIATING]:    [CALL_STATE.RINGING, CALL_STATE.CONNECTING, CALL_STATE.ENDED, CALL_STATE.FAILED],
        [CALL_STATE.RINGING]:       [CALL_STATE.CONNECTING, CALL_STATE.WAITING_ROOM, CALL_STATE.ENDED, CALL_STATE.FAILED],
        [CALL_STATE.CONNECTING]:    [CALL_STATE.CONNECTED, CALL_STATE.RECONNECTING, CALL_STATE.ENDED, CALL_STATE.FAILED],
        [CALL_STATE.CONNECTED]:     [CALL_STATE.RECONNECTING, CALL_STATE.ENDING, CALL_STATE.ENDED, CALL_STATE.FAILED],
        [CALL_STATE.RECONNECTING]:  [CALL_STATE.CONNECTED, CALL_STATE.ENDED, CALL_STATE.FAILED],
        [CALL_STATE.ENDING]:        [CALL_STATE.ENDED],
        [CALL_STATE.ENDED]:         [],
        [CALL_STATE.FAILED]:        [],
        [CALL_STATE.SCHEDULED]:     [CALL_STATE.INITIATING, CALL_STATE.RINGING, CALL_STATE.ENDED],
        [CALL_STATE.WAITING_ROOM]:  [CALL_STATE.CONNECTING, CALL_STATE.ENDED, CALL_STATE.FAILED],
      };
      return (allowed[this.state] || []).includes(newState);
    }
  }

  // ─── CallStateMachine ─────────────────────────────────────────────────────

  class CallStateMachine {
    constructor() {
      this._sessions  = new Map();    // callId → CallSession
      this._active    = null;         // current active session
      this._listeners = new Map();    // callId → [fn]
      this._global    = [];
    }

    // ── Public API ──────────────────────────────────────────────────────────

    createSession(callId, callType, peerId, isOutbound) {
      if (this._sessions.has(callId)) return this._sessions.get(callId);
      const session = new CallSession(callId, callType, peerId, isOutbound);
      this._sessions.set(callId, session);
      this._active = session;
      return session;
    }

    transition(callId, newState, meta = {}) {
      const session = this._sessions.get(callId);
      if (!session) return null;

      if (!session.canTransition(newState)) {
        console.warn(`[CallState] Invalid transition: ${session.state} → ${newState} for call ${callId}`);
        return session;
      }

      const prev = session.state;
      session.state = newState;

      if (newState === CALL_STATE.CONNECTED) session.connectedAt = Date.now();
      if (newState === CALL_STATE.ENDED || newState === CALL_STATE.FAILED) {
        session.endedAt = Date.now();
        // Schedule cleanup after UI has time to show final state
        setTimeout(() => this._cleanup(callId), 5000);
      }

      Object.assign(session, meta);

      this._emit(callId, { callId, state: newState, prev, session: { ...session } });
      return session;
    }

    getSession(callId)   { return this._sessions.get(callId) || null; }
    getActive()          { return this._active; }
    getState(callId)     { return this._sessions.get(callId)?.state || CALL_STATE.IDLE; }

    end(callId, reason = 'normal') {
      const session = this._sessions.get(callId);
      if (!session) return;
      if (session.state !== CALL_STATE.ENDED && session.state !== CALL_STATE.FAILED) {
        this.transition(callId, CALL_STATE.ENDING);
        this.transition(callId, CALL_STATE.ENDED, { endReason: reason });
      }
    }

    watch(callId, fn) {
      if (!this._listeners.has(callId)) this._listeners.set(callId, []);
      this._listeners.get(callId).push(fn);
      return () => {
        const arr = this._listeners.get(callId);
        if (arr) this._listeners.set(callId, arr.filter(l => l !== fn));
      };
    }

    watchAll(fn) {
      this._global.push(fn);
      return () => { this._global = this._global.filter(l => l !== fn); };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _emit(callId, data) {
      (this._listeners.get(callId) || []).forEach(fn => { try { fn(data); } catch (_) {} });
      this._global.forEach(fn => { try { fn(data); } catch (_) {} });

      // Dispatch kyn: CustomEvent so calls.html listeners receive it
      try {
        window.dispatchEvent(new CustomEvent(`kyn:call:state_changed`, { detail: data }));
      } catch (_) {}
    }

    _cleanup(callId) {
      const session = this._sessions.get(callId);
      if (session && (session.state === CALL_STATE.ENDED || session.state === CALL_STATE.FAILED)) {
        this._sessions.delete(callId);
        if (this._active?.callId === callId) this._active = null;
        this._listeners.delete(callId);
      }
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  window.__CallStateMachine = new CallStateMachine();
  window.CallStateMachine   = window.__CallStateMachine;
  window.CALL_STATE         = CALL_STATE;
  window.CALL_TYPE          = CALL_TYPE;

  console.log('[CallState] ✅ Ready');
})();
