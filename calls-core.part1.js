/**
 * PART 1/8 — BOOTSTRAP & SESSION
 * Module guard/registration, session validation (__isValidSession), sandbox StorageProxy, sandbox SessionClient. Establishes the module's identity and secure session handling before anything else runs.
 *
 * This file is a SOURCE FRAGMENT of calls-core.js, not a standalone script.
 * It shares the single closure of the original module and must be concatenated
 * in numeric order (part 0..7) — see build.js — before it is served to the browser.
 * Do NOT <script src> this file directly on its own; it will throw ReferenceErrors
 * for symbols defined in the other parts of the same closure.
 */
// calls-core.js



// ==================== CALL IFRAME CORE MODULE - DETERMINISTIC LIFECYCLE ====================



// Version: 9.1.0 - CRITICAL FIXES: Stale call state recovery, illegal state transitions, auto-cleanup



// ============================================================================================







(function() {



    'use strict';







    const MODULE_NAME = 'calls';  // EXACT module name per contract



    if (window.registerModuleInit && !window.registerModuleInit('calls-core')) {



        console.warn('[calls] calls-core already initialized, skipping duplicate boot');



        return;



    }



    



    // ==================== SESSION VALIDATION GUARD (CRITICAL PATCH) ====================



function __isValidSession(session) {



    if (!session) return false;



    



    if (!session.token || typeof session.token !== 'string' || session.token.length < 10) {



        return false;



    }



    



    let userId = session.userId;



    if (!userId && session.user) {



        userId = session.user.id || session.user.userId;



    }



    if (!userId && session.userData) {



        userId = session.userData.id || session.userData.userId;



    }



    



    if (userId === undefined || userId === null) {



        return false;



    }



    



    if (typeof userId === 'string') {



        const trimmedUserId = userId.trim();



        if (trimmedUserId === '' || trimmedUserId === 'user' || trimmedUserId === 'default' || 



            trimmedUserId === 'null' || trimmedUserId === 'undefined') {



            return false;



        }



    }



    



    if (typeof userId === 'number' && userId === 0) {



        return false;



    }



    



    if (session.authenticated !== true) {



        return false;



    }



    



    if (session.expiresAt && session.expiresAt < Date.now()) {



        return false;



    }



    



    return true;



}







    // ==================== SANDBOX-COMPLIANT STORAGE PROXY ====================



    // CRITICAL: No direct localStorage/sessionStorage access in sandboxed iframe



    // NOTE: Storage is ONLY for non-critical UI preferences, NEVER for call state



    const StorageProxy = {



        _pendingRequests: new Map(),



        _requestId: 0,



        



        _generateRequestId() {



            return `storage_${++this._requestId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;



        },



        



        get(key, defaultValue = null) {



            return new Promise((resolve) => {



                const requestId = this._generateRequestId();



                



                const timeout = setTimeout(() => {



                    if (this._pendingRequests.has(requestId)) {



                        this._pendingRequests.delete(requestId);



                        resolve(defaultValue);



                        // Only warn once per key to avoid repeated noise on page load
                        const _warnKey = '_storageTimeoutWarn_' + key;
                        if (!window[_warnKey]) { window[_warnKey] = true; console.warn('[' + MODULE_NAME + '][StorageProxy] GET timeout for key: ' + key + ' (once only)'); }



                    }



                // FIX (Issue 6): Increased timeout to handle slow parent init
                }, 8000);



                



                this._pendingRequests.set(requestId, { resolve, timeout, key });



                



                try {



                    window.parent.postMessage({



                        type: 'STORAGE_GET',



                        key: key,



                        requestId: requestId,



                        module: MODULE_NAME,



                        timestamp: Date.now()



                    }, '*');



                } catch (error) {



                    clearTimeout(timeout);



                    this._pendingRequests.delete(requestId);



                    console.error(`[${MODULE_NAME}][StorageProxy] Failed to send storage get request`, error);



                    resolve(defaultValue);



                }



            });



        },



        



        set(key, value) {



            try {



                window.parent.postMessage({



                    type: 'STORAGE_SET',



                    key: key,



                    value: value,



                    module: MODULE_NAME,



                    timestamp: Date.now()



                }, '*');



                return true;



            } catch (error) {



                console.error(`[${MODULE_NAME}][StorageProxy] Failed to send storage set request`, error);



                return false;



            }



        },



        



        remove(key) {



            try {



                window.parent.postMessage({



                    type: 'STORAGE_REMOVE',



                    key: key,



                    module: MODULE_NAME,



                    timestamp: Date.now()



                }, '*');



                return true;



            } catch (error) {



                console.error(`[${MODULE_NAME}][StorageProxy] Failed to send storage remove request`, error);



                return false;



            }



        },



        



        clear() {



            try {



                window.parent.postMessage({



                    type: 'STORAGE_CLEAR',



                    module: MODULE_NAME,



                    timestamp: Date.now()



                }, '*');



                return true;



            } catch (error) {



                console.error(`[${MODULE_NAME}][StorageProxy] Failed to send storage clear request`, error);



                return false;



            }



        },



        



        handleStorageResponse(event) {



            if (!event.data || event.data.type !== 'STORAGE_RESULT') return false;



            



            const { requestId, key, value, error } = event.data;



            const pending = this._pendingRequests.get(requestId);



            



            if (pending) {



                clearTimeout(pending.timeout);



                this._pendingRequests.delete(requestId);



                



                if (error) {



                    console.warn(`[${MODULE_NAME}][StorageProxy] Storage error for key ${key}:`, error);



                    pending.resolve(null);



                } else {



                    pending.resolve(value);



                }



                return true;



            }



            



            return false;



        },



        



        cleanup() {



            for (const [requestId, pending] of this._pendingRequests) {



                clearTimeout(pending.timeout);



                this._pendingRequests.delete(requestId);



            }



        }



    };



    



    // ==================== SANDBOX-COMPLIANT SESSION CLIENT ====================



    // CRITICAL: No direct token access, always request from parent



    const SessionClient = {



        _session: null,



        _token: null,



        _userId: null,



        _isAuthenticated: false,



        _pendingRequests: new Map(),



        _requestId: 0,



        _listeners: new Set(),



        _lastSessionId: null,



        _validSessionSet: false,  // Track if we already have a valid session



        



        _generateRequestId() {



            return `session_${++this._requestId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;



        },



        



        requestSession() {



            try {



                window.parent.postMessage({



                    type: 'REQUEST_SESSION',



                    module: MODULE_NAME,



                    timestamp: Date.now()



                }, '*');



                console.log(`[${MODULE_NAME}][SessionClient] Session requested from parent`);



            } catch (error) {



                console.error(`[${MODULE_NAME}][SessionClient] Failed to request session`, error);



            }



        },



        



        getSession() {



            return this._session ? { ...this._session } : null;



        },



        



        getToken() {



            return this._token;



        },



        



        getUserId() {



            return this._userId;



        },



        



        isAuthenticated() {



            return this._isAuthenticated && !!this._token && this._validSessionSet;



        },



        



        handleSessionMessage(event) {



            if (!event.data) return false;



            



            const message = event.data;



            



            // CRITICAL: Session deduplication using sessionId



            const sessionId = message.sessionId || message.payload?.sessionId || message.data?.sessionId;



            if (sessionId && this._lastSessionId === sessionId) {



                console.log(`[${MODULE_NAME}][SessionClient] Duplicate session message ignored (sessionId: ${sessionId})`);



                return true;



            }



            



            // Handle different session message types



            if (message.type === 'SESSION_DATA' || message.type === 'SESSION_ACTIVE') {



                const sessionData = message.payload || message.data || message;



                



                // ==================== CRITICAL: SESSION VALIDATION ====================



                // Extract and validate session data



                const candidateSession = {



                    token: sessionData.token || sessionData.jwt || sessionData.accessToken,



                    userId: sessionData.userId || sessionData.user?.id,



                    user: sessionData.user || {},



                    expiresAt: sessionData.expiresAt || sessionData.expiry || (Date.now() + 3600000),



                    authenticated: sessionData.authenticated !== false,



                    sessionId: sessionId || Date.now()



                };



                



                // REJECT INVALID SESSION IMMEDIATELY



                if (!__isValidSession(candidateSession)) {



                    console.warn(`[${MODULE_NAME}][SessionClient] Rejected invalid session data`, {



                        hasToken: !!candidateSession.token,



                        userId: candidateSession.userId,



                        authenticated: candidateSession.authenticated



                    });



                    return true;



                }



                



                // IMMUTABLE SESSION PROTECTION: Prevent overwriting valid session with invalid data



                if (this._validSessionSet && this._session && __isValidSession(this._session)) {



                    if (!__isValidSession(candidateSession)) {



                        console.warn(`[${MODULE_NAME}][SessionClient] Prevented session downgrade - keeping existing valid session`);



                        return true;



                    }



                }



                



                // Safe update



                this._session = candidateSession;



                this._token = this._session.token;



                this._userId = this._session.userId;



                this._isAuthenticated = this._session.authenticated && !!this._token;



                this._validSessionSet = true;



                



                if (sessionId) {



                    this._lastSessionId = sessionId;



                }



                



                this._notifyListeners('session_updated', this._session);



                



                console.log(`[${MODULE_NAME}][SessionClient] Valid session received:`, {



                    authenticated: this._isAuthenticated,



                    userId: this._userId,



                    sessionId: this._session.sessionId



                });



                



                return true;



            }



            



            if (message.type === 'SESSION_NULL' || message.type === 'SESSION_INVALID') {



                this._session = null;



                this._token = null;



                this._userId = null;



                this._isAuthenticated = false;



                this._lastSessionId = null;



                this._validSessionSet = false;



                



                this._notifyListeners('session_invalid', {});



                console.log(`[${MODULE_NAME}][SessionClient] Session invalidated`);



                



                return true;



            }



            



            if (message.type === 'TOKEN_UPDATE' || message.type === 'SESSION_REFRESHED') {



                const tokenData = message.payload || message.data;



                if (tokenData && tokenData.token) {



                    // Only update token if we have a valid session



                    if (this._validSessionSet && this._session && __isValidSession(this._session)) {



                        this._token = tokenData.token;



                        this._session.token = tokenData.token;



                        this._isAuthenticated = true;



                        this._notifyListeners('token_updated', { token: this._token });



                        console.log(`[${MODULE_NAME}][SessionClient] Token refreshed`);



                    } else {



                        console.warn(`[${MODULE_NAME}][SessionClient] Token refresh ignored - no valid session`);



                    }



                }



                return true;



            }



            



            if (message.type === 'AUTH_ERROR') {



                this._session = null;



                this._token = null;



                this._userId = null;



                this._isAuthenticated = false;



                this._lastSessionId = null;



                this._validSessionSet = false;



                this._notifyListeners('auth_error', message.payload || {});



                console.warn(`[${MODULE_NAME}][SessionClient] Auth error received`);



                return true;



            }



            



            return false;



        },



        



        addListener(listener) {



            if (typeof listener === 'function') {



                this._listeners.add(listener);



            }



        },



        



        removeListener(listener) {



            this._listeners.delete(listener);



        },



        



        _notifyListeners(event, data) {



            this._listeners.forEach(listener => {



                try {



                    listener(event, data);



                } catch (error) {



                    console.error(`[${MODULE_NAME}][SessionClient] Listener error:`, error);



                }



            });



        },



        



        cleanup() {



            this._pendingRequests.clear();



            this._listeners.clear();



            this._validSessionSet = false;



        }



    };



    




