/**
 * calls-core.part9-state-sync.js — STATE SYNCHRONIZATION BRIDGE
 *
 * FIX: The call stack maintains state in four independent places:
 *   - window.__CallsCoreShared.callsState.callState (plain object, mutated
 *     directly from ~30 call sites across parts 3-8 — VERIFIED BY GREP:
 *     only ONE of those sites, the main endCall() in part6, also updates
 *     CallsStateGovernor. The other ~29, including handleCallForceEnd
 *     (remote hangup/cancel) and every declined/missed/timeout/error path,
 *     reset callsState.callState to 'idle' WITHOUT ever touching the
 *     governor. That is a confirmed, reproducible cause of "Core says
 *     CONNECTED, Governor says CALL_READY" style divergence, not just a
 *     theoretical risk.)
 *   - window.__CallsCoreShared.CallsStateGovernor._currentState
 *   - window.__CallsCoreShared.V5StateGovernor._currentState
 *   - window.__CallsCoreShared.StateGovernor._currentState (the latter two
 *     track module/session bootstrap, a different concern from call
 *     lifecycle — see CALL_PHASE mapping below)
 *
 * FIX APPROACH: rather than editing ~29 call sites by hand (high risk of
 * missing one, or of introducing a typo in code this size with no way to
 * test live against the real signaling server), this file converts
 * `callsState.callState` from a plain field into an accessor. Every
 * existing line of code that does `callsState.callState = 'connected'`
 * (or 'idle', etc.) keeps working exactly as written — the setter now
 * ALSO drives CallsStateGovernor to match, for every call site, automatically:
 *
 *   'idle'      -> CallsStateGovernor -> CALL_READY  (matches the existing
 *                  convention already used by endCall() itself)
 *   'connected' -> CallsStateGovernor -> IN_CALL
 *
 * Transitional values (initiating/incoming/connecting/etc.) are left alone
 * on purpose: the governor's SESSION_PENDING/SESSION_RECEIVED/ACTIVE states
 * encode signaling-handshake detail that doesn't map 1:1 to callsState's
 * simpler vocabulary, and guessing wrong there risks causing new thrashing.
 * The two states synced are exactly the two that matter for the reported
 * symptom: is a call live, or not.
 *
 * The governor's own transition() legality table is tried first (so normal
 * in-order flow still goes through its guardrails and logging). If the
 * table would reject the transition — which happens exactly in the buggy
 * cases above, because the governor is stuck in a stale prior state — the
 * bridge forces the update anyway and logs it, because a stale guard must
 * never be allowed to block the fix.
 *
 * A parallel, unthrottled console warning + 'calls:state-divergence' event
 * still fires whenever the two disagree, so any remaining gap is visible
 * in logs/telemetry instead of silently producing a stuck UI.
 *
 * Must load AFTER calls-core.part8.js and BEFORE calls-ui.js (installs the
 * accessor before any call-flow code runs, since all the writes above
 * happen inside event handlers, not at module-load time).
 */
(function () {

    'use strict';

    var __CC = window.__CallsCoreShared = window.__CallsCoreShared || {};
    if (__CC.__aborted) { return; }

    var CALL_PHASE = {
        idle: 'idle',
        initiating: 'connecting',
        initiated: 'connecting',
        starting: 'connecting',
        connecting: 'connecting',
        incoming: 'ringing',
        connected: 'active',

        INIT: 'idle',
        TERMINATED: 'idle',
        REGISTERING: 'idle',
        REGISTERED: 'idle',
        SESSION_PENDING: 'connecting',
        SESSION_RECEIVED: 'ringing',
        // CALL_READY is treated as 'idle' to match the governor's own
        // existing convention (endCall() transitions IN_CALL -> CALL_READY
        // to mean "call over, ready for the next one" — see part6.js).
        CALL_READY: 'idle',
        ACTIVE: 'active',
        IN_CALL: 'active'
    };

    function classify(stateName) {
        if (!stateName) return 'unknown';
        return CALL_PHASE.hasOwnProperty(stateName) ? CALL_PHASE[stateName] : 'unknown';
    }

    // callsState.callState value -> the CallsStateGovernor state it must match.
    var FORCE_SYNC_MAP = {
        idle: 'CALL_READY',
        connected: 'IN_CALL'
    };

    var Bridge = {

        _snapshot: {
            callsState: null,
            CallsStateGovernor: null,
            V5StateGovernor: null,
            StateGovernor: null
        },

        _lastDivergenceWarnAt: 0,
        _syncing: false,

        initialize: function () {
            this._attachGovernorListener('CallsStateGovernor');
            this._attachGovernorListener('V5StateGovernor');
            this._attachGovernorListener('StateGovernor');
            this._installCallStateAccessor();
            __CC.getUnifiedCallState = this.getUnifiedCallState.bind(this);
            __CC.getStateDivergence = this.getStateDivergence.bind(this);
            if (__CC.logReady) {
                __CC.logReady(__CC.MODULE, 'StateSyncBridge initialized (active sync mode)');
            }
            return this;
        },

        _attachGovernorListener: function (name) {
            var governor = __CC[name];
            if (!governor || typeof governor.addListener !== 'function') {
                return;
            }
            var self = this;
            governor.addListener(function (event, data) {
                if (event !== 'state') return;
                self._snapshot[name] = data && data.newState;
                self._checkDivergence();
            });
            this._snapshot[name] = governor._currentState;
        },

        // Turns callsState.callState into an accessor so every existing
        // `callsState.callState = 'x'` line anywhere in parts 3-8 keeps
        // working unmodified, but now also drives the governor.
        _installCallStateAccessor: function () {
            var cs = __CC.callsState;
            if (!cs || typeof cs !== 'object') {
                if (__CC.logWarn) {
                    __CC.logWarn(__CC.MODULE, 'StateSyncBridge: callsState missing, cannot install accessor');
                }
                return;
            }

            var shadow = cs.callState;
            var self = this;

            try {
                Object.defineProperty(cs, 'callState', {
                    configurable: true,
                    enumerable: true,
                    get: function () {
                        return shadow;
                    },
                    set: function (value) {
                        var changed = shadow !== value;
                        shadow = value;
                        self._snapshot.callsState = value;
                        // Always attempt governor sync, even if the value
                        // didn't change — the governor may have drifted
                        // independently since the last time this was set,
                        // and re-asserting idle/connected must always win.
                        self._syncGovernorFrom(value);
                        if (changed) {
                            self._checkDivergence();
                        }
                    }
                });
            } catch (e) {
                if (__CC.logWarn) {
                    __CC.logWarn(__CC.MODULE, 'StateSyncBridge: failed to install callState accessor', e);
                }
                return;
            }

            this._snapshot.callsState = shadow;
        },

        _syncGovernorFrom: function (callStateValue) {
            var target = FORCE_SYNC_MAP[callStateValue];
            if (!target) return;

            var governor = __CC.CallsStateGovernor;
            var states = __CC.CALLS_STATE;
            if (!governor || !states || !states[target]) return;
            if (governor._currentState === states[target]) return;

            this._syncing = true;
            try {
                var applied = false;
                if (typeof governor.transition === 'function') {
                    applied = governor.transition(states[target], 'state-sync-bridge:' + callStateValue);
                }
                if (!applied && governor._currentState !== states[target]) {
                    // Legality table rejected it — the governor is stuck on a
                    // stale prior state, which is exactly the bug being fixed.
                    // Force it and notify listeners the same way transition() does.
                    var oldState = governor._currentState;
                    governor._previousState = oldState;
                    governor._currentState = states[target];
                    if (typeof governor._notifyListeners === 'function') {
                        governor._notifyListeners('state', {
                            oldState: oldState,
                            newState: states[target],
                            reason: 'state-sync-bridge-forced:' + callStateValue
                        });
                    }
                    if (__CC.logWarn) {
                        __CC.logWarn(__CC.MODULE, 'StateSyncBridge: forced CallsStateGovernor ' + oldState + ' -> ' + states[target] + ' (legal-transition table rejected it)');
                    }
                }
                this._snapshot.CallsStateGovernor = governor._currentState;
            } finally {
                this._syncing = false;
            }
        },

        getUnifiedCallState: function () {
            var s = this._snapshot;
            var phases = [classify(s.callsState), classify(s.CallsStateGovernor)]
                .filter(function (c) { return c !== 'unknown'; });

            var uniquePhases = phases.filter(function (p, i) { return phases.indexOf(p) === i; });
            var agree = uniquePhases.length <= 1;
            var phase = agree ? (uniquePhases[0] || 'unknown') : 'diverged';

            return {
                phase: phase,
                isActive: phase === 'active',
                isIdle: phase === 'idle',
                agree: agree,
                raw: {
                    callsState: s.callsState,
                    CallsStateGovernor: s.CallsStateGovernor,
                    V5StateGovernor: s.V5StateGovernor,
                    StateGovernor: s.StateGovernor
                }
            };
        },

        getStateDivergence: function () {
            var unified = this.getUnifiedCallState();
            return unified.agree ? null : unified.raw;
        },

        _checkDivergence: function () {
            var divergence = this.getStateDivergence();
            if (!divergence) return;

            var now = Date.now();
            if (now - this._lastDivergenceWarnAt < 500) return;
            this._lastDivergenceWarnAt = now;

            if (__CC.logWarn) {
                __CC.logWarn(__CC.MODULE, 'Call state divergence detected across governors', divergence);
            } else if (window.console && console.warn) {
                console.warn('[calls-core] state divergence:', divergence);
            }

            try {
                window.dispatchEvent(new CustomEvent('calls:state-divergence', { detail: divergence }));
            } catch (e) { /* ignore in environments without CustomEvent */ }
        }
    };

    __CC.StateSyncBridge = Bridge;
    Bridge.initialize();

})();

