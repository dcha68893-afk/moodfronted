/**
 * calls-core.part1.js — PART 1/8 — BOOTSTRAP & SESSION
 * Module guard/registration, session validation (__isValidSession), sandbox StorageProxy, sandbox SessionClient. Establishes the module's identity and secure session handling before anything else runs.
 *
 * This file is SELF-CONTAINED: it runs in its own IIFE and shares state with
 * the other 7 calls-core.partN.js files through window.__CallsCoreShared, not
 * through a JS closure. Load all 8 files, in numeric order, as plain classic
 * <script> tags (no type="module", no defer/async) — see calls.html.
 */
(function () {

    'use strict';

    var __CC = window.__CallsCoreShared = window.__CallsCoreShared || {};




    'use strict';







    window.__CallsCoreShared.MODULE_NAME = 'calls';  // EXACT module name per contract

    // FIX (calls-core split): applySettingToCallsModule was a bare top-level
    // function in the pre-split monolithic calls-core.js, callable from every
    // closure in that single file. The 8-way split wraps each part in its own
    // IIFE, and this function was dropped entirely during the split (not moved
    // to any part) — leaving part4.js and part8.js calling a symbol that no
    // longer existed anywhere, hence 'applySettingToCallsModule is not defined'.
    // Restored here (loads first) on window.__CallsCoreShared so every part can
    // reach it; call sites updated to window.__CallsCoreShared.applySettingToCallsModule(...).
    window.__CallsCoreShared.applySettingToCallsModule = function applySettingToCallsModule(section, key, value) {
        if (section === 'appearance') {
            if (key === 'theme') {
                var theme = value === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
                document.documentElement.setAttribute('data-theme', theme);
                document.body.setAttribute('data-theme', theme);
            }
            if (key === 'fontSize') document.documentElement.style.fontSize = value + 'px';
            if (key === 'language') { window.__appLanguage = value; document.documentElement.setAttribute('lang', value); }
            if (key === 'accentColor') document.documentElement.style.setProperty('--accent-color', value);
            if (key === 'compactMode') { document.documentElement.setAttribute('data-compact', value ? 'true' : 'false'); document.body.classList.toggle('compact-mode', !!value); }
            if (key === 'animationsEnabled' || key === 'animations') { document.documentElement.setAttribute('data-animations', value ? 'true' : 'false'); document.body.classList.toggle('no-animations', !value); }
        }
        if (section === 'notifications') {
            if (key === 'soundEnabled' || key === 'notificationSound') window.__notificationSoundEnabled = value;
            if (key === 'vibrationEnabled' || key === 'notificationVibration') window.__vibrationEnabled = value;
            if (key === 'callNotifications' || key === 'enableNotifications') window.__callNotificationsEnabled = value;
            if (key === 'messageNotifications') window.__messageNotificationsEnabled = value;
            if (key === 'groupNotifications') window.__groupNotificationsEnabled = value;
            if (key === 'mentionNotifications') window.__mentionNotificationsEnabled = value;
            if (key === 'desktopEnabled') window.__desktopNotificationsEnabled = value;
        }
        if (section === 'privacy') {
            if (key === 'onlineStatus') window.__showOnlineStatus = value;
            if (key === 'lastSeen') window.__showLastSeen = value;
            if (key === 'readReceipts') { window.__readReceiptsEnabled = value; document.documentElement.setAttribute('data-read-receipts', value ? 'true' : 'false'); }
            if (key === 'typingIndicators') { window.__typingIndicatorsEnabled = value; document.documentElement.setAttribute('data-typing-indicators', value ? 'true' : 'false'); }
            if (key === 'whoCanAddMe') window.__whoCanAddMe = value;
            if (key === 'canMessageMe') window.__canMessageMe = value;
            if (key === 'contactDiscovery') window.__contactDiscovery = value;
        }
        if (section === 'calls') {
            if (key === 'ringtone' || key === 'callRingtone') window.__callRingtone = value;
            if (key === 'videoEnabled' || key === 'cameraOnStart') window.__videoEnabled = value;
            if (key === 'audioEnabled') window.__audioEnabled = value;
            if (key === 'allowIncomingCalls' || key === 'whoCanCallMe') window.__allowIncomingCalls = value;
            if (key === 'vibrateOnCall' || key === 'callVibration') window.__callVibration = value;
            if (key === 'videoQuality') window.__videoQuality = value;
            if (key === 'voiceQuality') window.__voiceQuality = value;
            if (key === 'allowScreenShare') window.__allowScreenShare = value;
            // Sync the in-page settings panel toggle checkboxes
            const callsToggleMap = {
                emotionalContext: 'emotionalContextToggle',
                emotionalContextEnabled: 'emotionalContextToggle',
                callIntention: 'callIntentionToggle',
                callIntentionEnabled: 'callIntentionToggle',
                inCallChat: 'inCallChatToggle',
                inCallChatEnabled: 'inCallChatToggle',
                whiteboard: 'whiteboardToggle',
                whiteboardEnabled: 'whiteboardToggle',
                polls: 'pollsToggle',
                pollsEnabled: 'pollsToggle',
                sharedNotes: 'notesToggle',
                notesEnabled: 'notesToggle',
                focusMode: 'focusModeToggle',
                focusModeEnabled: 'focusModeToggle',
                liveReactions: 'liveReactionsToggle',
                liveReactionsEnabled: 'liveReactionsToggle'
            };
            var toggleId = callsToggleMap[key];
            if (toggleId) {
                var toggleEl = document.getElementById(toggleId);
                if (toggleEl) toggleEl.checked = !!value;
            }
        }
        if (section === 'chat') {
            if (key === 'enterToSend' || key === 'enterKeySends') window.__enterToSend = value;
            if (key === 'showTimestamps') { window.__showTimestamps = value; document.documentElement.setAttribute('data-show-timestamps', value ? 'true' : 'false'); }
            if (key === 'mediaAutoDownload' || key === 'autoDownloadMedia') window.__mediaAutoDownload = value;
            if (key === 'allowReactions') { window.__allowReactions = value; document.documentElement.setAttribute('data-allow-reactions', value ? 'true' : 'false'); }
        }
        if (section === 'profile') {
            if (key === 'displayName') window.__currentUserDisplayName = value;
            if (key === 'photoUrl') window.__currentUserAvatar = value;
            if (key === 'lastSeen') window.__showLastSeen = value;
            if (key === 'profileVisibility') window.__profileVisibility = value;
            if (key === 'currentMood') window.__currentMood = value;
        }
        if (section === 'security') {
            // FIX (Security settings audit): this module runs inside an
            // iframe and has no access to the auth session or logout — writing
            // __sessionTimeout here did nothing because nothing (in this frame
            // or any other) ever read it. The actual inactivity timeout is now
            // enforced by SESSION_COORDINATOR in the parent frame's
            // app.core.session.js, which reads the saved value straight from
            // localStorage('knecta_settings_cache').security.sessionTimeout.
            if (key === 'sessionTimeout') window.__sessionTimeout = value; // kept for any legacy readers; not the enforcement path
        }
        if (section === 'mood') {
            if (key === 'currentMood') { window.__currentMood = value; document.documentElement.setAttribute('data-mood', value); }
            if (key === 'autoMoodDetection') window.__autoMoodDetection = value;
            if (key === 'shareMoodStatus') window.__shareMoodStatus = value;
            if (key === 'showMoodTo') window.__showMoodTo = value;
        }
        if (section === 'advanced') {
            if (key === 'developerMode' || key === 'developerTools') window.__developerMode = value;
            if (key === 'debugLogging' || key === 'debugMode') window.__debugLogging = value;
            if (key === 'performanceMode') { window.__performanceMode = value; document.documentElement.setAttribute('data-performance-mode', value ? 'true' : 'false'); }
            if (key === 'dataSaver') window.__dataSaver = value;
            if (key === 'offlineMode') window.__offlineMode = value;
            if (key === 'reduceMotion') { document.documentElement.setAttribute('data-reduce-motion', value ? 'true' : 'false'); document.body.classList.toggle('reduce-motion', !!value); }
            if (key === 'experimentalFeatures') window.__experimentalFeatures = value;
        }
        if (section === 'storage') {
            if (key === 'autoClearCache') window.__autoClearCache = value;
        }
        if (section === 'status') {
            if (key === 'whoCanViewMyStatus') window.__whoCanViewMyStatus = value;
            if (key === 'autoExpireStatus') window.__autoExpireStatus = value;
            if (key === 'allowStatusReplies') window.__allowStatusReplies = value;
            if (key === 'showStatusTo') window.__showStatusTo = value;
        }
        if (section === 'friends') {
            if (key === 'showOnlineStatus') window.__showOnlineStatus = value;
        }
    };




    if (window.registerModuleInit && !window.registerModuleInit('calls-core')) {



        console.warn('[calls] calls-core already initialized, skipping duplicate boot');



        window.__CallsCoreShared.__aborted = true;
        return;



    }



    



    // ==================== SESSION VALIDATION GUARD (CRITICAL PATCH) ====================



window.__CallsCoreShared.__isValidSession = function __isValidSession(session) {



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



};







    // ==================== SANDBOX-COMPLIANT STORAGE PROXY ====================



    // CRITICAL: No direct localStorage/sessionStorage access in sandboxed iframe



    // NOTE: Storage is ONLY for non-critical UI preferences, NEVER for call state



    window.__CallsCoreShared.StorageProxy = {



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
                        if (!window[_warnKey]) { window[_warnKey] = true; console.warn('[' + window.__CallsCoreShared.MODULE_NAME + '][StorageProxy] GET timeout for key: ' + key + ' (once only)'); }



                    }



                // FIX (Issue 6): Increased timeout to handle slow parent init
                }, 8000);



                



                this._pendingRequests.set(requestId, { resolve, timeout, key });



                



                try {



                    window.parent.postMessage({



                        type: 'STORAGE_GET',



                        key: key,



                        requestId: requestId,



                        module: window.__CallsCoreShared.MODULE_NAME,



                        timestamp: Date.now()



                    }, '*');



                } catch (error) {



                    clearTimeout(timeout);



                    this._pendingRequests.delete(requestId);



                    console.error(`[${window.__CallsCoreShared.MODULE_NAME}][StorageProxy] Failed to send storage get request`, error);



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



                    module: window.__CallsCoreShared.MODULE_NAME,



                    timestamp: Date.now()



                }, '*');



                return true;



            } catch (error) {



                console.error(`[${window.__CallsCoreShared.MODULE_NAME}][StorageProxy] Failed to send storage set request`, error);



                return false;



            }



        },



        



        remove(key) {



            try {



                window.parent.postMessage({



                    type: 'STORAGE_REMOVE',



                    key: key,



                    module: window.__CallsCoreShared.MODULE_NAME,



                    timestamp: Date.now()



                }, '*');



                return true;



            } catch (error) {



                console.error(`[${window.__CallsCoreShared.MODULE_NAME}][StorageProxy] Failed to send storage remove request`, error);



                return false;



            }



        },



        



        clear() {



            try {



                window.parent.postMessage({



                    type: 'STORAGE_CLEAR',



                    module: window.__CallsCoreShared.MODULE_NAME,



                    timestamp: Date.now()



                }, '*');



                return true;



            } catch (error) {



                console.error(`[${window.__CallsCoreShared.MODULE_NAME}][StorageProxy] Failed to send storage clear request`, error);



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



                    console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][StorageProxy] Storage error for key ${key}:`, error);



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



    window.__CallsCoreShared.SessionClient = {



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



                    module: window.__CallsCoreShared.MODULE_NAME,



                    timestamp: Date.now()



                }, '*');



                console.log(`[${window.__CallsCoreShared.MODULE_NAME}][SessionClient] Session requested from parent`);



            } catch (error) {



                console.error(`[${window.__CallsCoreShared.MODULE_NAME}][SessionClient] Failed to request session`, error);



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



                console.log(`[${window.__CallsCoreShared.MODULE_NAME}][SessionClient] Duplicate session message ignored (sessionId: ${sessionId})`);



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



                if (!window.__CallsCoreShared.__isValidSession(candidateSession)) {



                    console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][SessionClient] Rejected invalid session data`, {



                        hasToken: !!candidateSession.token,



                        userId: candidateSession.userId,



                        authenticated: candidateSession.authenticated



                    });



                    return true;



                }



                



                // IMMUTABLE SESSION PROTECTION: Prevent overwriting valid session with invalid data



                if (this._validSessionSet && this._session && window.__CallsCoreShared.__isValidSession(this._session)) {



                    if (!window.__CallsCoreShared.__isValidSession(candidateSession)) {



                        console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][SessionClient] Prevented session downgrade - keeping existing valid session`);



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



                



                console.log(`[${window.__CallsCoreShared.MODULE_NAME}][SessionClient] Valid session received:`, {



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



                console.log(`[${window.__CallsCoreShared.MODULE_NAME}][SessionClient] Session invalidated`);



                



                return true;



            }



            



            if (message.type === 'TOKEN_UPDATE' || message.type === 'SESSION_REFRESHED') {



                const tokenData = message.payload || message.data;



                if (tokenData && tokenData.token) {



                    // Only update token if we have a valid session



                    if (this._validSessionSet && this._session && window.__CallsCoreShared.__isValidSession(this._session)) {



                        this._token = tokenData.token;



                        this._session.token = tokenData.token;



                        this._isAuthenticated = true;



                        this._notifyListeners('token_updated', { token: this._token });



                        console.log(`[${window.__CallsCoreShared.MODULE_NAME}][SessionClient] Token refreshed`);



                    } else {



                        console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][SessionClient] Token refresh ignored - no valid session`);



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



                console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][SessionClient] Auth error received`);



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



                    console.error(`[${window.__CallsCoreShared.MODULE_NAME}][SessionClient] Listener error:`, error);



                }



            });



        },



        



        cleanup() {



            this._pendingRequests.clear();



            this._listeners.clear();



            this._validSessionSet = false;



        }



    };



    

})();
