/**
 * callSession.manager.js
 * Ephemeral in-memory call session manager.
 * Enforces single active call, tracks session state, never touches storage.
 * @version 1.0.0
 */

(function () {
    'use strict';

    // ── One-shot log dedup (suppress same message within 5s) ────────────────
    const _sessLogs = new Map();
    function _log(msg, data) {
        const k = msg; const now = Date.now();
        if (_sessLogs.has(k) && now - _sessLogs.get(k) < 5000) return;
        _sessLogs.set(k, now);
        if (data !== undefined) console.log('[CallSession] ' + msg, data);
        else console.log('[CallSession] ' + msg);
    }
    function _warn(msg, data) {
        const k = 'w:' + msg; const now = Date.now();
        if (_sessLogs.has(k) && now - _sessLogs.get(k) < 5000) return;
        _sessLogs.set(k, now);
        if (data !== undefined) console.warn('[CallSession] ' + msg, data);
        else console.warn('[CallSession] ' + msg);
    }

    // ── Session States ───────────────────────────────────────────────────────
    const SESSION_STATE = {
        IDLE:     'idle',
        CALLING:  'calling',
        RINGING:  'ringing',
        IN_CALL:  'in-call',
        ENDED:    'ended'
    };

    // ── Minimal UUID helper ──────────────────────────────────────────────────
    function uuid() {
        return 'sess-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    // ── Session Manager ──────────────────────────────────────────────────────
    class CallSessionManager {
        constructor() {
            this._session    = null;
            this._listeners  = new Set();
            this._historyRef = null; // reference to KynectaCallLocalStore

            // Resolve store lazily to avoid init-order issues
            window.addEventListener('load', () => {
                this._historyRef = window.KynectaCallLocalStore || null;
            });

            window.KynectaCallSession = this;
            console.log('[CallSession] ✅ Manager initialized');
        }

        // ── Read ─────────────────────────────────────────────────────────────

        /** Current session object (null if idle). */
        get current() { return this._session ? { ...this._session } : null; }

        /** True while a session exists and is not in ENDED state. */
        get isActive() {
            return !!(this._session && this._session.state !== SESSION_STATE.ENDED && this._session.state !== SESSION_STATE.IDLE);
        }

        get state() {
            return this._session ? this._session.state : SESSION_STATE.IDLE;
        }

        get sessionId() {
            return this._session ? this._session.sessionId : null;
        }

        get localCallId() {
            return this._session ? this._session.localCallId : null;
        }

        get serverCallId() {
            return this._session ? this._session.serverCallId : null;
        }

        get peerConnection() {
            return this._session ? this._session.peerConnection : null;
        }

        get retryCount() {
            return this._session ? this._session.retryCount : 0;
        }

        // ── Session Lifecycle ────────────────────────────────────────────────

        /**
         * Start a new outgoing call session.
         * Throws if a session is already active.
         */
        startOutgoing({ callerId, receiverId, callType, localCallId, participants = [], callerName, callerAvatar } = {}) {
            if (this.isActive) {
                throw new Error(`[CallSession] Cannot start — session already active (${this._session.state})`);
            }

            const session = {
                sessionId:     uuid(),
                direction:     'outgoing',
                state:         SESSION_STATE.CALLING,
                callType:      callType || 'audio',
                callerId:      callerId || null,
                receiverId:    receiverId || null,
                participants:  participants,
                localCallId:   localCallId || null,
                serverCallId:  null,
                peerConnection: null,
                retryCount:    0,
                startedAt:     null,
                endedAt:       null,
                createdAt:     Date.now(),
                localHistoryId: null,
                callerName:    callerName || null,
                callerAvatar:  callerAvatar || null
            };

            this._session = session;
            this._notify('session_started', session);
            console.log('[CallSession] ▶ Outgoing session started', session.sessionId);

            // Create local history record immediately
            this._createLocalHistory({
                callerId, receiverId, type: callType, status: 'initiated', participants, callerName, callerAvatar
            });

            return { ...session };
        }

        /**
         * Register an incoming call into a ringing session.
         */
        startIncoming({ callId, callerId, receiverId, callType, callerName, callerAvatar, participants = [] } = {}) {
            if (this.isActive) {
                console.warn('[CallSession] Busy — incoming call rejected (already in session)');
                return null;
            }

            const session = {
                sessionId:      uuid(),
                direction:      'incoming',
                state:          SESSION_STATE.RINGING,
                callType:       callType || 'audio',
                callerId:       callerId || null,
                receiverId:     receiverId || null,
                participants:   participants,
                localCallId:    callId || null,
                serverCallId:   callId || null,
                peerConnection: null,
                retryCount:     0,
                startedAt:      null,
                endedAt:        null,
                createdAt:      Date.now(),
                localHistoryId: null,
                callerName:     callerName || null,
                callerAvatar:   callerAvatar || null
            };

            this._session = session;
            this._notify('session_ringing', session);
            console.log('[CallSession] 📲 Incoming session registered', session.sessionId);

            // Create local history record (status = 'ringing')
            this._createLocalHistory({
                callerId, receiverId, type: callType, status: 'ringing', participants, callerName, callerAvatar
            });

            return { ...session };
        }

        /**
         * Transition session to IN_CALL (both sides connected).
         */
        markConnected() {
            if (!this._session) return;
            this._session.state     = SESSION_STATE.IN_CALL;
            this._session.startedAt = this._session.startedAt || Date.now();
            this._notify('session_connected', this._session);
            this._updateLocalHistory({ status: 'connected', startedAt: this._session.startedAt });
            console.log('[CallSession] ✅ Session connected', this._session.sessionId);
        }

        /**
         * End the current session with a final status.
         * @param {string} finalStatus  ended|missed|rejected|failed|cancelled
         */
        end(finalStatus = 'ended') {
            if (!this._session) return null;

            const endedAt = Date.now();
            const duration = this._session.startedAt
                ? Math.floor((endedAt - this._session.startedAt) / 1000)
                : 0;

            const ended = {
                ...this._session,
                state:    SESSION_STATE.ENDED,
                endedAt,
                duration,
                finalStatus
            };

            this._session = null;

            this._notify('session_ended', ended);
            this._updateLocalHistory({ status: finalStatus, endedAt, duration });

            console.log('[CallSession] 🔴 Session ended', ended.sessionId, finalStatus, duration + 's');
            return ended;
        }

        /**
         * Attach the real server call UUID received from the backend.
         */
        setServerCallId(serverCallId) {
            if (!this._session) return;
            this._session.serverCallId = serverCallId;
            if (this._session.localHistoryId && this._historyRef) {
                this._historyRef.linkServerId(this._session.localHistoryId, serverCallId).catch(() => {});
            }
        }

        /**
         * Attach the RTCPeerConnection (for cleanup on end).
         */
        setPeerConnection(pc) {
            if (this._session) this._session.peerConnection = pc;
        }

        /** Increment retry counter. Returns new count. */
        incrementRetry() {
            if (this._session) this._session.retryCount++;
            return this._session ? this._session.retryCount : 0;
        }

        /** Reset retry counter. */
        resetRetry() {
            if (this._session) this._session.retryCount = 0;
        }

        /**
         * Force-clear any stale session without persisting.
         * Used on unexpected crashes or page reloads.
         */
        forceReset(reason = 'force_reset') {
            if (this._session) {
                const stale = { ...this._session };
                this._session = null;
                this._notify('session_force_reset', { session: stale, reason });
                this._updateLocalHistory({ status: 'failed', endedAt: Date.now() });
                console.warn('[CallSession] ⚡ Force reset', stale.sessionId, reason);
            }
        }

        // ── Listeners ────────────────────────────────────────────────────────

        on(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
            return () => this._listeners.delete(listener);
        }

        off(listener) { this._listeners.delete(listener); }

        // ── Private ──────────────────────────────────────────────────────────

        _notify(event, data) {
            this._listeners.forEach(fn => {
                try { fn(event, data); } catch (e) {
                    console.error('[CallSession] Listener error', e);
                }
            });
            // Also dispatch as DOM event for cross-module listening
            window.dispatchEvent(new CustomEvent('kyn:callSession', { detail: { event, data } }));
        }

        async _createLocalHistory(data) {
            // Try multiple storage options with fallbacks
            let store = this._historyRef || window.KynectaCallLocalStore || window.AppCache || window.KynectaCache;
            
            if (!store) {
                // Try to wait for store to become available (increased timeout)
                let attempts = 0;
                const maxAttempts = 50; // Increased from 10 to 50
                while (!store && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    store = window.KynectaCallLocalStore || window.AppCache || window.KynectaCache;
                    attempts++;
                }
                
                if (!store) {
                    _warn('No storage available, using localStorage fallback');
                    // Fallback to localStorage
                    try {
                        const callKey = `call_${data.id}_${Date.now()}`;
                        localStorage.setItem(callKey, JSON.stringify({
                            ...data,
                            savedAt: Date.now(),
                            storageType: 'localStorage_fallback'
                        }));
                        console.log('[CallSession] Call saved to localStorage fallback');
                        return;
                    } catch (e) {
                        console.error('[CallSession] All storage options failed', e.message);
                        return;
                    }
                }
                this._historyRef = store;
            }
            
            try {
                // Try different save methods based on store type
                if (store.createCall) {
                    const record = await store.createCall(data);
                    if (this._session) {
                        this._session.localHistoryId = record.id;
                    }
                } else if (store.save) {
                    await store.save(data);
                    console.log('[CallSession] Call saved using generic save method');
                } else {
                    throw new Error('No compatible save method found');
                }
            } catch (e) {
                _warn('Failed to create local history', e.message);
                // Final fallback to localStorage
                try {
                    const callKey = `call_${data.id}_${Date.now()}`;
                    localStorage.setItem(callKey, JSON.stringify({
                        ...data,
                        savedAt: Date.now(),
                        storageType: 'localStorage_error_fallback'
                    }));
                } catch (fallbackError) {
                    console.error('[CallSession] Even localStorage failed', fallbackError.message);
                }
            }
        }

        _updateLocalHistory(fields) {
            // We track localHistoryId on the ended session snapshot or still on this._session
            const id = (this._session && this._session.localHistoryId)
                || this._lastLocalHistoryId;
            if (!id) return;

            const store = this._historyRef || window.KynectaCallLocalStore;
            if (!store) return;

            store.updateFields(id, fields).catch(e => {
                _warn('Failed to update local history', e.message);
            });
        }
    }

    // Export singleton
    window.KynectaCallSession = new CallSessionManager();
    console.log('[CallSession] ✅ Singleton ready');
})();