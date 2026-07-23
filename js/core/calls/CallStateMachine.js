/**
 * CallStateMachine.js
 * Phase 3 — Complete Call State Machine (Frontend)
 *
 * Implements ALL 20 states required by the production call module specification:
 *   IDLE, OUTGOING, INCOMING, RINGING, CONNECTING, NEGOTIATING,
 *   CONNECTED_AUDIO, CONNECTED_VIDEO, SCREEN_SHARING, HOLD, MUTED,
 *   RECONNECTING, FAILED, BUSY, REJECTED, MISSED, ENDED, REMOTE_ENDED,
 *   TIMEOUT, ERROR
 *
 * Acts as single source of truth for all call state.
 * Every transition is validated; invalid transitions are blocked and logged.
 * Emits kyn:call:state_changed CustomEvents for all consumers.
 *
 * @version 4.0.0
 */

(function () {
  'use strict';

  if (window.__CallStateMachine) return;

  // ─── Call States (all 20 required) ─────────────────────────────────────────

  const CALL_STATE = Object.freeze({
    IDLE:            'IDLE',
    OUTGOING:        'OUTGOING',        // Caller: waiting for callee to ring/answer
    INCOMING:        'INCOMING',        // Callee: showing full-screen incoming call UI
    RINGING:         'RINGING',         // Callee is ringing (both parties aware)
    CONNECTING:      'CONNECTING',      // Media negotiation in progress
    NEGOTIATING:     'NEGOTIATING',     // SDP offer/answer exchange
    CONNECTED_AUDIO: 'CONNECTED_AUDIO', // Audio-only call connected
    CONNECTED_VIDEO: 'CONNECTED_VIDEO', // Video call connected
    SCREEN_SHARING:  'SCREEN_SHARING',  // Screen share active
    HOLD:            'HOLD',            // Call on hold
    MUTED:           'MUTED',           // Mic muted (sub-state of CONNECTED)
    RECONNECTING:    'RECONNECTING',    // Network lost, attempting recovery
    FAILED:          'FAILED',          // Terminal — unrecoverable error
    BUSY:            'BUSY',            // Callee is in another call
    REJECTED:        'REJECTED',        // Callee declined
    MISSED:          'MISSED',          // Callee did not answer (timeout)
    ENDED:           'ENDED',           // Normal end (either party)
    REMOTE_ENDED:    'REMOTE_ENDED',    // Remote party ended the call
    TIMEOUT:         'TIMEOUT',         // No answer within timeout window
    ERROR:           'ERROR',           // Terminal — unexpected error
  });

  const CALL_TYPE = Object.freeze({
    AUDIO:  'audio',
    VIDEO:  'video',
    GROUP:  'group',
    LAN:    'lan',
    SCREEN: 'screen',
  });

  // ─── Valid state transitions ────────────────────────────────────────────────
  // Strict allowlist: any transition not in this map is blocked.

  const TRANSITIONS = Object.freeze({
    [CALL_STATE.IDLE]:            [CALL_STATE.OUTGOING, CALL_STATE.INCOMING, CALL_STATE.ERROR],
    [CALL_STATE.OUTGOING]:        [CALL_STATE.RINGING, CALL_STATE.CONNECTING, CALL_STATE.BUSY,
                                   CALL_STATE.REJECTED, CALL_STATE.TIMEOUT, CALL_STATE.MISSED,
                                   CALL_STATE.FAILED, CALL_STATE.ENDED, CALL_STATE.ERROR],
    [CALL_STATE.INCOMING]:        [CALL_STATE.CONNECTING, CALL_STATE.REJECTED, CALL_STATE.MISSED,
                                   CALL_STATE.TIMEOUT, CALL_STATE.ENDED, CALL_STATE.ERROR],
    [CALL_STATE.RINGING]:         [CALL_STATE.CONNECTING, CALL_STATE.REJECTED, CALL_STATE.MISSED,
                                   CALL_STATE.BUSY, CALL_STATE.TIMEOUT, CALL_STATE.ENDED, CALL_STATE.ERROR],
    [CALL_STATE.CONNECTING]:      [CALL_STATE.NEGOTIATING, CALL_STATE.CONNECTED_AUDIO,
                                   CALL_STATE.CONNECTED_VIDEO, CALL_STATE.RECONNECTING,
                                   CALL_STATE.FAILED, CALL_STATE.ENDED, CALL_STATE.REMOTE_ENDED, CALL_STATE.ERROR],
    [CALL_STATE.NEGOTIATING]:     [CALL_STATE.CONNECTED_AUDIO, CALL_STATE.CONNECTED_VIDEO,
                                   CALL_STATE.RECONNECTING, CALL_STATE.FAILED, CALL_STATE.ENDED, CALL_STATE.ERROR],
    [CALL_STATE.CONNECTED_AUDIO]: [CALL_STATE.CONNECTED_VIDEO, CALL_STATE.SCREEN_SHARING,
                                   CALL_STATE.HOLD, CALL_STATE.MUTED, CALL_STATE.RECONNECTING,
                                   CALL_STATE.ENDED, CALL_STATE.REMOTE_ENDED, CALL_STATE.FAILED, CALL_STATE.ERROR],
    [CALL_STATE.CONNECTED_VIDEO]: [CALL_STATE.CONNECTED_AUDIO, CALL_STATE.SCREEN_SHARING,
                                   CALL_STATE.HOLD, CALL_STATE.MUTED, CALL_STATE.RECONNECTING,
                                   CALL_STATE.ENDED, CALL_STATE.REMOTE_ENDED, CALL_STATE.FAILED, CALL_STATE.ERROR],
    [CALL_STATE.SCREEN_SHARING]:  [CALL_STATE.CONNECTED_AUDIO, CALL_STATE.CONNECTED_VIDEO,
                                   CALL_STATE.RECONNECTING, CALL_STATE.ENDED, CALL_STATE.REMOTE_ENDED,
                                   CALL_STATE.FAILED, CALL_STATE.ERROR],
    [CALL_STATE.HOLD]:            [CALL_STATE.CONNECTED_AUDIO, CALL_STATE.CONNECTED_VIDEO,
                                   CALL_STATE.ENDED, CALL_STATE.REMOTE_ENDED, CALL_STATE.FAILED, CALL_STATE.ERROR],
    [CALL_STATE.MUTED]:           [CALL_STATE.CONNECTED_AUDIO, CALL_STATE.CONNECTED_VIDEO,
                                   CALL_STATE.HOLD, CALL_STATE.RECONNECTING, CALL_STATE.ENDED,
                                   CALL_STATE.REMOTE_ENDED, CALL_STATE.FAILED, CALL_STATE.ERROR],
    [CALL_STATE.RECONNECTING]:    [CALL_STATE.CONNECTED_AUDIO, CALL_STATE.CONNECTED_VIDEO,
                                   CALL_STATE.FAILED, CALL_STATE.ENDED, CALL_STATE.REMOTE_ENDED, CALL_STATE.ERROR],
    // Terminal states — no outbound transitions
    [CALL_STATE.FAILED]:          [],
    [CALL_STATE.BUSY]:            [],
    [CALL_STATE.REJECTED]:        [],
    [CALL_STATE.MISSED]:          [],
    [CALL_STATE.ENDED]:           [],
    [CALL_STATE.REMOTE_ENDED]:    [],
    [CALL_STATE.TIMEOUT]:         [],
    [CALL_STATE.ERROR]:           [],
  });

  // Terminal states used for cleanup timing
  const TERMINAL_STATES = new Set([
    CALL_STATE.FAILED, CALL_STATE.BUSY, CALL_STATE.REJECTED,
    CALL_STATE.MISSED, CALL_STATE.ENDED, CALL_STATE.REMOTE_ENDED,
    CALL_STATE.TIMEOUT, CALL_STATE.ERROR,
  ]);

  // ─── CallSession ───────────────────────────────────────────────────────────

  class CallSession {
    constructor(callId, callType, peerId, isOutbound) {
      this.callId            = callId;
      this.callType          = callType;
      this.peerId            = peerId;
      this.isOutbound        = isOutbound;
      this.state             = CALL_STATE.IDLE;
      this.prevState         = null;
      this.startedAt         = Date.now();
      this.connectedAt       = null;
      this.endedAt           = null;
      this.endReason         = null;
      this.transport         = 'INTERNET';
      this.isMuted           = false;
      this.isVideoEnabled    = (callType === CALL_TYPE.VIDEO);
      this.isSpeakerOn       = false;
      this.isScreenSharing   = false;
      this.isOnHold          = false;
      this.groupParticipants = new Map();
      this.reconnectAttempts = 0;
      this.maxReconnects     = 5;
      this.peerName          = null;
      this.peerAvatar        = null;
    }

    get duration() {
      if (!this.connectedAt) return 0;
      const end = this.endedAt || Date.now();
      return Math.floor((end - this.connectedAt) / 1000);
    }

    get durationFormatted() {
      const d   = this.duration;
      const h   = Math.floor(d / 3600);
      const m   = Math.floor((d % 3600) / 60);
      const s   = d % 60;
      if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      return `${m}:${String(s).padStart(2,'0')}`;
    }

    canTransition(newState) {
      return (TRANSITIONS[this.state] || []).includes(newState);
    }

    isTerminal() {
      return TERMINAL_STATES.has(this.state);
    }

    isConnected() {
      return [CALL_STATE.CONNECTED_AUDIO, CALL_STATE.CONNECTED_VIDEO,
              CALL_STATE.SCREEN_SHARING, CALL_STATE.HOLD, CALL_STATE.MUTED].includes(this.state);
    }
  }

  // ─── CallStateMachine ──────────────────────────────────────────────────────

  class CallStateMachine {
    constructor() {
      this._sessions       = new Map();   // callId → CallSession
      this._active         = null;        // current active CallSession
      this._listeners      = new Map();   // callId → [fn]
      this._globalListeners = [];
      this._cleanupTimers  = new Map();   // callId → timeoutId
    }

    // ── Session Management ─────────────────────────────────────────────────

    createSession(callId, callType, peerId, isOutbound) {
      if (this._sessions.has(callId)) {
        return this._sessions.get(callId);
      }
      const session = new CallSession(callId, callType, peerId, isOutbound);
      this._sessions.set(callId, session);
      if (!this._active || this._active.isTerminal()) {
        this._active = session;
      }
      return session;
    }

    getSession(callId)  { return this._sessions.get(callId) || null; }
    getActive()         { return this._active; }
    getState(callId)    { return this._sessions.get(callId)?.state || CALL_STATE.IDLE; }
    hasActive()         { return !!this._active && !this._active.isTerminal(); }

    // ── State Transition ────────────────────────────────────────────────────

    /**
     * Transition a call to a new state.
     * @param {string} callId
     * @param {string} newState  — must be a CALL_STATE value
     * @param {object} meta      — optional metadata merged into session
     * @returns {CallSession|null}
     */
    transition(callId, newState, meta = {}) {
      const session = this._sessions.get(callId);
      if (!session) {
        console.warn(`[CallState] transition(): no session for callId=${callId}`);
        return null;
      }

      // Block invalid transitions
      if (!session.canTransition(newState)) {
        console.warn(`[CallState] BLOCKED: ${session.state} → ${newState} for call ${callId}`);
        return session;
      }

      // Block duplicate transitions (idempotent guard)
      if (session.state === newState) {
        console.debug(`[CallState] Duplicate transition ignored: ${newState} for call ${callId}`);
        return session;
      }

      const prev = session.state;
      session.prevState = prev;
      session.state     = newState;

      // Side effects on specific states
      if (newState === CALL_STATE.CONNECTED_AUDIO || newState === CALL_STATE.CONNECTED_VIDEO) {
        if (!session.connectedAt) session.connectedAt = Date.now();
      }
      if (TERMINAL_STATES.has(newState)) {
        session.endedAt    = Date.now();
        session.endReason  = meta.endReason || meta.reason || newState.toLowerCase();
        // Schedule cleanup: allow UI 5s to render terminal state
        const tid = setTimeout(() => this._cleanup(callId), 5000);
        this._cleanupTimers.set(callId, tid);
      }

      // Merge any extra metadata
      if (meta && typeof meta === 'object') {
        const safeKeys = ['peerName','peerAvatar','isMuted','isVideoEnabled','isSpeakerOn',
                          'isScreenSharing','isOnHold','endReason','reconnectAttempts'];
        for (const k of safeKeys) {
          if (meta[k] !== undefined) session[k] = meta[k];
        }
      }

      // If this is the active session, keep pointer current
      if (this._active?.callId === callId) this._active = session;

      // Emit to all listeners
      const payload = { callId, state: newState, prev, session };
      this._emit(callId, payload);

      console.log(`[CallState] ${prev} → ${newState} (call ${callId})`);
      return session;
    }

    // ── Convenience Transitions ────────────────────────────────────────────

    end(callId, reason = 'normal') {
      const session = this._sessions.get(callId);
      if (!session || session.isTerminal()) return;
      this.transition(callId, CALL_STATE.ENDED, { endReason: reason });
    }

    remoteEnd(callId) {
      const session = this._sessions.get(callId);
      if (!session || session.isTerminal()) return;
      this.transition(callId, CALL_STATE.REMOTE_ENDED);
    }

    fail(callId, reason = 'error') {
      const session = this._sessions.get(callId);
      if (!session || session.isTerminal()) return;
      // FAILED allowed from most states; ERROR is the fallback
      const target = session.canTransition(CALL_STATE.FAILED)
        ? CALL_STATE.FAILED
        : (session.canTransition(CALL_STATE.ERROR) ? CALL_STATE.ERROR : null);
      if (target) this.transition(callId, target, { endReason: reason });
    }

    // ── Watchers ───────────────────────────────────────────────────────────

    watch(callId, fn) {
      if (!this._listeners.has(callId)) this._listeners.set(callId, []);
      this._listeners.get(callId).push(fn);
      return () => {
        const arr = this._listeners.get(callId);
        if (arr) this._listeners.set(callId, arr.filter(l => l !== fn));
      };
    }

    watchAll(fn) {
      this._globalListeners.push(fn);
      return () => {
        this._globalListeners = this._globalListeners.filter(l => l !== fn);
      };
    }

    // ── Private ────────────────────────────────────────────────────────────

    _emit(callId, data) {
      const fns = this._listeners.get(callId) || [];
      fns.forEach(fn => { try { fn(data); } catch (e) { console.warn('[CallState] listener error:', e); } });
      this._globalListeners.forEach(fn => { try { fn(data); } catch (e) { console.warn('[CallState] global listener error:', e); } });

      // Dispatch CustomEvent for iframe/postMessage consumers
      try {
        window.dispatchEvent(new CustomEvent('kyn:call:state_changed', { detail: data }));
      } catch (_) {}
    }

    _cleanup(callId) {
      const session = this._sessions.get(callId);
      if (session && session.isTerminal()) {
        this._sessions.delete(callId);
        this._listeners.delete(callId);
        if (this._active?.callId === callId) this._active = null;
      }
      const tid = this._cleanupTimers.get(callId);
      if (tid) { clearTimeout(tid); this._cleanupTimers.delete(callId); }
    }

    // ── Debug ──────────────────────────────────────────────────────────────

    snapshot() {
      return {
        active:   this._active?.callId || null,
        sessions: Array.from(this._sessions.entries()).map(([id, s]) => ({
          callId: id, state: s.state, type: s.callType, duration: s.duration,
        })),
      };
    }
  }

  // ─── Singleton ─────────────────────────────────────────────────────────────

  const instance = new CallStateMachine();

  window.__CallStateMachine = instance;
  window.CallStateMachine   = instance;
  window.CALL_STATE         = CALL_STATE;
  window.CALL_TYPE          = CALL_TYPE;

  console.log('[CallStateMachine] ✅ Ready — 20 states, strict transition validation');
})();
