/**
 * calls-core.part4.js — PART 4/8 — TRANSPORT & SIGNALING
 * Configuration, environment detection, helpers, origin security, safe storage, message registry, iframe transport layer, and the real call-signaling message handlers that ride on top of it.
 *
 * This file is SELF-CONTAINED: it runs in its own IIFE and shares state with
 * the other 7 calls-core.partN.js files through window.__CallsCoreShared, not
 * through a JS closure. Load all 8 files, in numeric order, as plain classic
 * <script> tags (no type="module", no defer/async) — see calls.html.
 */
(function () {

    'use strict';

    var __CC = window.__CallsCoreShared = window.__CallsCoreShared || {};
    if (__CC.__aborted) { return; }

/**
 * PART 4/8 — TRANSPORT & SIGNALING
 * Configuration, environment detection, helpers, origin security, safe storage, message registry, iframe transport layer, and the real call-signaling message handlers that ride on top of it.
 *
 * This file is a SOURCE FRAGMENT of calls-core.js, not a standalone script.
 * It shares the single closure of the original module and must be concatenated
 * in numeric order (part 0..7) — see build.js — before it is served to the browser.
 * Do NOT <script src> this file directly on its own; it will throw ReferenceErrors
 * for symbols defined in the other parts of the same closure.
 */
    // ==================== CONFIGURATION ====================



    window.__CallsCoreShared.CONFIG = {



        VERSION: '9.0.4',



        PROTOCOL_VERSION: 'KYN-9.0',

        // FIX: Centralised audio constraints used by ALL call paths (caller + callee + reconnect).
        // Previously callee used plain `audio: true` which skips echo cancellation on many devices,
        // causing echo feedback and occasional null audio tracks on Android WebView.
        AUDIO_CONSTRAINTS: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl:  true,
            sampleRate:       48000,
            channelCount:     1,
        },

        


        PARENT_READY_TIMEOUT: 20000,



        REGISTRATION_TIMEOUT: 5000,



        



        MAX_REGISTRATION_ATTEMPTS: 1,



        MAX_CHILD_READY_ATTEMPTS: 1,



        MAX_SESSION_REQUESTS: 3,



        



        HEARTBEAT_ACK_TIMEOUT: 1000,



        



        ICE_RESTART_TIMEOUT: 5000,



        MAX_ICE_RESTARTS: 3,



        



        CALL_INVITATION_TIMEOUT: 180000,  // 3 minutes ring timeout



        // ✅ FIX: Raised from 15s → 45s. The WebSocket may take a few retries



        // to connect (exponential backoff). Giving it more time prevents the



        // "Connection timeout reached" teardown while the socket is still reconnecting.



        CALL_CONNECTION_TIMEOUT: 45000,



        



        STORAGE_PREFIX: 'calls_core_',



        



        TRUSTED_DOMAINS: [



            'moodchat-fy56.onrender.com',



            'moodfronted.onrender.com',



            'localhost',



            '127.0.0.1'



        ],



        



        MESSAGE_CACHE_MAX_SIZE: 1000,



        MESSAGE_CACHE_TTL: 30000,



        



        MAX_QUEUE_SIZE: 100,



        



        MAX_MESSAGES_PER_SECOND: 50,



        MESSAGE_WINDOW_MS: 1000,



        



        CHILD_READY_MAX_RETRIES: 1,



        CHILD_READY_RETRY_DELAY: 100



    };



    



    // ==================== ENVIRONMENT DETECTION ====================



    window.__CallsCoreShared.ENVIRONMENT = {



        current: null,



        isDevelopment: false,



        isProduction: false,



        



        detect: function() {



            const hostname = window.location.hostname;



            



            if (hostname === 'localhost' || hostname === '127.0.0.1' || 



                hostname.startsWith('192.168.') || hostname.startsWith('10.')) {



                this.current = 'development';



                this.isDevelopment = true;



                this.isProduction = false;



            }



            else if (hostname.endsWith('.onrender.com')) {



                this.current = 'production';



                this.isDevelopment = false;



                this.isProduction = true;



            }



            else {



                this.current = 'production';



                this.isDevelopment = false;



                this.isProduction = true;



            }



            



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, `Environment detected: ${this.current}`);



            return this;



        }



    };



    



    window.__CallsCoreShared.ENVIRONMENT.detect();



    



    // ==================== HELPER FUNCTIONS ====================



    window.__CallsCoreShared.isValidOrigin = function isValidOrigin(origin) {



        if (!origin) return true;



        // Relaxed during init - strict after activation



        if (typeof window.__CallsCoreShared.currentState !== 'undefined' && window.__CallsCoreShared.currentState !== window.__CallsCoreShared.LifecycleState.ACTIVE) return true;



        return window.__CallsCoreShared.CONFIG.TRUSTED_DOMAINS.some(domain => 



            origin.includes(domain) || origin === `http://${domain}` || origin === `https://${domain}`



        );



    };



    



    const processedMessages = new Set();



    



    function isDuplicate(id) {



        if (processedMessages.has(id)) return true;



        processedMessages.add(id);



        if (processedMessages.size > window.__CallsCoreShared.CONFIG.MESSAGE_CACHE_MAX_SIZE) {



            processedMessages.clear();



        }



        return false;



    }



    



    window.__CallsCoreShared.validateMessage = function validateMessage(msg) {



        return (



            msg &&



            typeof msg.type === 'string' &&



            (msg.source === undefined || typeof msg.source === 'string') &&



            (msg.messageId === undefined || typeof msg.messageId === 'string')



        );



    };



    



    // ==================== ORIGIN SECURITY ====================



    window.__CallsCoreShared.OriginSecurity = {



        _trustedOrigins: new Set(),



        _trustedDomains: new Set(window.__CallsCoreShared.CONFIG.TRUSTED_DOMAINS),



        _strictMode: true,



        _cache: new Map(),



        



        initialize: function() {



            this._addTrustedOrigin(window.location.origin);



            try {



                if (window.parent && window.parent !== window && window.parent.location) {



                    this._addTrustedOrigin(window.parent.location.origin);



                }



            } catch (e) {}



            



            window.__CallsCoreShared.CONFIG.TRUSTED_DOMAINS.forEach(domain => {



                if (domain.includes('.')) this._trustedDomains.add(domain);



            });



            



            window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, 'OriginSecurity initialized');



            return this;



        },



        



        _addTrustedOrigin: function(origin) {



            if (!origin) return;



            try {



                const url = new URL(origin);



                this._trustedOrigins.add(origin);



                



                const parts = url.hostname.split('.');



                if (parts.length > 2) {



                    const domain = parts.slice(-2).join('.');



                    this._trustedDomains.add(domain);



                }



            } catch (e) {}



        },



        



        isTrusted: function(origin) {



            if (!origin) return false;



            if (this._cache.has(origin)) return this._cache.get(origin);



            



            let trusted = false;



            



            if (this._trustedOrigins.has(origin)) trusted = true;



            



            if (!trusted) {



                try {



                    const url = new URL(origin);



                    const hostname = url.hostname;



                    



                    for (const domain of this._trustedDomains) {



                        if (hostname === domain || hostname.endsWith('.' + domain)) {



                            trusted = true;



                            break;



                        }



                    }



                } catch (e) {}



            }



            



            this._cache.set(origin, trusted);



            setTimeout(() => this._cache.delete(origin), 60000);



            return trusted;



        },



        



        validateEvent: function(event) {



            if (!event || !event.origin) return false;



            // Relaxed during init



            if (typeof window.__CallsCoreShared.currentState !== 'undefined' && window.__CallsCoreShared.currentState !== window.__CallsCoreShared.LifecycleState.ACTIVE) return true;



            return this.isTrusted(event.origin);



        },



        



        lockParentOrigin: function(origin) {



            if (!window.__CallsCoreShared.callsState.parentOriginLocked && origin) {



                window.__CallsCoreShared.callsState.parentOrigin = origin;



                window.__CallsCoreShared.callsState.parentOriginLocked = true;



                window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Parent origin locked', { origin });



            }



        },



        



        getTargetOrigin: function() {



            if (window.__CallsCoreShared.callsState.parentOriginLocked && window.__CallsCoreShared.callsState.parentOrigin) {



                return window.__CallsCoreShared.callsState.parentOrigin;



            }



            try {



                if (window.parent && window.parent.location) {



                    return window.parent.location.origin;



                }



            } catch (e) {}



            return '*';



        },



        



        getMode: function() {



            return {



                strictMode: this._strictMode,



                trustedOrigins: this._trustedOrigins.size,



                trustedDomains: this._trustedDomains.size,



                parentLocked: window.__CallsCoreShared.callsState.parentOriginLocked



            };



        }



    };



    



    window.__CallsCoreShared.OriginSecurity.initialize();



    



    // ==================== SAFE STORAGE (SANDBOX-COMPLIANT) ====================



    // CRITICAL: No direct localStorage access in sandboxed iframe



    // NOTE: Storage is ONLY for UI preferences, NEVER for call state



    window.__CallsCoreShared.SafeStorage = {



        _memory: new Map(),



        _strategy: 'proxy',



        _available: true,



        



        initialize: function() {



            window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, `SafeStorage initialized (${this._strategy})`);



            return this;



        },



        



        get: async function(key, fallback = null) {



            // CRITICAL: Never store or retrieve call state from storage



            if (key === 'session' || key.includes('token') || key.includes('call')) {



                console.warn(`[${window.__CallsCoreShared.MODULE}] SafeStorage.get('${key}') blocked - use session/call from memory only`);



                return fallback;



            }



            



            const fullKey = window.__CallsCoreShared.CONFIG.STORAGE_PREFIX + key;



            



            try {



                // Use StorageProxy for sandbox-compliant storage



                const value = await window.__CallsCoreShared.StorageProxy.get(fullKey);



                return value !== null ? this._deserialize(value) : fallback;



            } catch (e) {



                console.warn(`[${window.__CallsCoreShared.MODULE}] SafeStorage.get failed for ${key}:`, e);



                return fallback;



            }



        },



        



        set: function(key, value) {



            // CRITICAL: Never store call state to storage



            if (key === 'session' || key.includes('token') || key.includes('call')) {



                console.warn(`[${window.__CallsCoreShared.MODULE}] SafeStorage.set('${key}') blocked - use session/call from memory only`);



                return false;



            }



            



            const fullKey = window.__CallsCoreShared.CONFIG.STORAGE_PREFIX + key;



            const serialized = this._serialize(value);



            



            try {



                window.__CallsCoreShared.StorageProxy.set(fullKey, serialized);



                return true;



            } catch (e) {



                console.warn(`[${window.__CallsCoreShared.MODULE}] SafeStorage.set failed for ${key}:`, e);



                return false;



            }



        },



        



        remove: function(key) {



            const fullKey = window.__CallsCoreShared.CONFIG.STORAGE_PREFIX + key;



            try {



                window.__CallsCoreShared.StorageProxy.remove(fullKey);



                return true;



            } catch (e) {



                console.warn(`[${window.__CallsCoreShared.MODULE}] SafeStorage.remove failed for ${key}:`, e);



                return false;



            }



        },



        



        clear: function() {



            try {



                window.__CallsCoreShared.StorageProxy.clear();



                this._memory.clear();



                return true;



            } catch (e) {



                console.warn(`[${window.__CallsCoreShared.MODULE}] SafeStorage.clear failed:`, e);



                return false;



            }



        },



        



        _serialize: function(value) {



            if (value === undefined) return 'undefined';



            if (value === null) return 'null';



            try {



                return JSON.stringify(value);



            } catch (e) {



                return String(value);



            }



        },



        



        _deserialize: function(str) {



            if (str === 'undefined') return undefined;



            if (str === 'null') return null;



            try {



                return JSON.parse(str);



            } catch (e) {



                return str;



            }



        },



        



        getStrategy: function() { return this._strategy; },



        isAvailable: function() { return this._available; }



    };



    



    window.__CallsCoreShared.SafeStorage.initialize();



    



    // ==================== MESSAGE REGISTRY ====================



    window.__CallsCoreShared.MessageRegistry = {



        _pendingMessages: new Map(),



        _processedMessages: new Set(),



        _ackTimeout: 3000,



        _cleanupTimer: null,



        _messageRateCounter: 0,



        _messageRateResetTimer: null,



        



        initialize: function() {



            this._startCleanup();



            this._startRateLimiting();



            window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, 'MessageRegistry initialized');



            return this;



        },



        



        _startCleanup: function() {



            if (this._cleanupTimer) clearInterval(this._cleanupTimer);



            this._cleanupTimer = setInterval(() => this._cleanup(), 30000);



        },



        



        _startRateLimiting: function() {



            this._messageRateCounter = 0;



            if (this._messageRateResetTimer) clearInterval(this._messageRateResetTimer);



            this._messageRateResetTimer = setInterval(() => {



                this._messageRateCounter = 0;



            }, window.__CallsCoreShared.CONFIG.MESSAGE_WINDOW_MS);



        },



        



        _cleanup: function() {



            const now = Date.now();



            



            for (const [messageId, pending] of this._pendingMessages) {



                if (pending.expiry && pending.expiry < now) {



                    this._failWithReason(messageId, 'expired');



                } else if (pending.timeoutId && !pending.resolved) {



                    // Clean up timeout promises



                    clearTimeout(pending.timeoutId);



                    if (pending.resolve) {



                        pending.resolve({ success: false, reason: 'timeout', error: 'Request timeout' });



                        pending.resolved = true;



                    }



                    this._pendingMessages.delete(messageId);



                }



            }



            



            if (this._processedMessages.size > window.__CallsCoreShared.CONFIG.MESSAGE_CACHE_MAX_SIZE) {



                this._processedMessages.clear();



            }



            



            if (window.__CallsCoreShared.callsState.processedMessageIds.size > window.__CallsCoreShared.CONFIG.MESSAGE_CACHE_MAX_SIZE) {



                window.__CallsCoreShared.callsState.processedMessageIds.clear();



            }



        },



        



        register: function(messageId, type, options = {}) {



            if (this._processedMessages.has(messageId)) {



                return Promise.resolve({ success: true, cached: true });



            }



            



            if (this._messageRateCounter >= window.__CallsCoreShared.CONFIG.MAX_MESSAGES_PER_SECOND) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Message rate limit exceeded', { type, messageId });



                return Promise.reject(new Error('Rate limit exceeded'));



            }



            this._messageRateCounter++;



            



            for (const [id, pending] of this._pendingMessages) {



                if (pending.originalId === messageId || pending.options?.originalId === messageId) {



                    return pending.promise;



                }



            }



            



            const timeout = options.timeout || this._ackTimeout;



            



            let resolve, reject;



            const promise = new Promise((res, rej) => {



                resolve = res;



                reject = rej;



            });



            



            const timer = setTimeout(() => {



                this._failWithReason(messageId, 'timeout');



            }, timeout);



            



            this._pendingMessages.set(messageId, {



                type,



                resolve,



                reject,



                timer,



                expiry: Date.now() + timeout,



                options,



                originalId: messageId,



                promise,



                resolved: false



            });



            



            return promise;



        },



        



        acknowledge: function(messageId, payload = {}) {



            this._processedMessages.add(messageId);



            



            let pending = this._pendingMessages.get(messageId);



            



            if (!pending) {



                for (const [id, p] of this._pendingMessages.entries()) {



                    if (p.options && p.options.originalId === messageId) {



                        pending = p;



                        break;



                    }



                }



            }



            



            if (pending && !pending.resolved) {



                clearTimeout(pending.timer);



                pending.resolve(payload);



                pending.resolved = true;



                this._pendingMessages.delete(pending.originalId || messageId);



                return true;



            }



            



            return false;



        },



        



        _failWithReason: function(messageId, reason) {



            const pending = this._pendingMessages.get(messageId);



            if (!pending || pending.resolved) return;



            



            clearTimeout(pending.timer);



            pending.reject(new Error(`Message failed: ${reason}`));



            pending.resolved = true;



            this._pendingMessages.delete(messageId);



        },



        



        hasPending: function(messageId) {



            return this._pendingMessages.has(messageId);



        },



        



        getPendingCount: function() {



            return this._pendingMessages.size;



        },



        



        isProcessed: function(messageId) {



            return this._processedMessages.has(messageId) || 



                   window.__CallsCoreShared.callsState.processedMessageIds.has(messageId);



        },



        



        reset: function() {



            for (const [messageId, pending] of this._pendingMessages) {



                if (!pending.resolved) {



                    clearTimeout(pending.timer);



                    pending.reject(new Error('Registry reset'));



                    pending.resolved = true;



                }



            }



            this._pendingMessages.clear();



            this._processedMessages.clear();



        }



    };



    



    window.__CallsCoreShared.MessageRegistry.initialize();



    



    // ==================== IFRAME TRANSPORT ====================



    window.__CallsCoreShared.IframeTransport = {



        _messageId: 0,



        _queue: [],



        _processing: false,



        _online: navigator.onLine,



        _listeners: new Set(),



        _targetOrigin: window.__CallsCoreShared.OriginSecurity.getTargetOrigin(),



        _sessionRequested: false,



        _sessionRequestTimer: null,



        _sessionActive: false,



        _messageHandler: null,



        _rateLimitCounter: 0,



        _rateLimitResetTimer: null,



        _initialized: false,



        



        initialize: function() {



            if (this._initialized) return this;



            this._setupMessageHandler();



            this._setupListeners();



            this._startRateLimiting();



            this._initialized = true;



            window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, 'IframeTransport initialized');



            return this;



        },



        



        _startRateLimiting: function() {



            this._rateLimitCounter = 0;



            if (this._rateLimitResetTimer) clearInterval(this._rateLimitResetTimer);



            this._rateLimitResetTimer = setInterval(() => {



                this._rateLimitCounter = 0;



            }, window.__CallsCoreShared.CONFIG.MESSAGE_WINDOW_MS);



        },



        



        _setupMessageHandler: function() {



            if (this._messageHandler) {



                window.removeEventListener('message', this._messageHandler);



            }



            



            this._messageHandler = (event) => {



                setTimeout(() => this.handleIncoming(event), 0);



            };



            



            window.addEventListener('message', this._messageHandler);



            



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Message handler installed');



        },



        



        _setupListeners: function() {




            window.addEventListener('online', () => {

                this._online = true;

                this._notifyListeners('online', {});

                window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Network online — attempting call recovery if active');

                // If a call is active, trigger ICE restart to recover the connection
                try {
                    // FIX: window.callsState was never actually exposed (always undefined),
                    // so this recovery path never ran. Use the real in-scope callsState.
                    var activeCallId = window.__CallsCoreShared.callsState && (window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.serverCallId);
                    if (activeCallId) {
                        window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Triggering ICE restart after network recovery');
                        setTimeout(function() {
                            // FIX: window.__PeerConnectionManager is a separate, unpopulated
                            // shadow WebRTC engine (no real sessions registered in it) —
                            // calling it here was a silent no-op. WebRTCManager owns the
                            // actual live peer connection for this call; restart it directly.
                            try { window.__CallsCoreShared.WebRTCManager.handleIceFailure && window.__CallsCoreShared.WebRTCManager.handleIceFailure(); } catch(_e) {}
                        }, 800); // Short delay to let network stabilise
                    }
                } catch(_e) {}

            });




            



            window.addEventListener('offline', () => {



                this._online = false;



                this._notifyListeners('offline', {});



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Network offline');



            });



        },



        



        _generateMessageId: function() {



            return `${Date.now()}-${++this._messageId}-${Math.random().toString(36).substring(2, 9)}`;



        },



        



        _validateMessage: function(type, payload, options) {



            if (!this._canSend()) {



                return { valid: false, reason: 'cannot_send' };



            }



            



            if (this._rateLimitCounter >= window.__CallsCoreShared.CONFIG.MAX_MESSAGES_PER_SECOND) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Send rate limit exceeded', { type });



                return { valid: false, reason: 'rate_limit' };



            }



            



            return { valid: true };



        },



        



        _canSend: function() {



            const allowedStates = [



                window.__CallsCoreShared.LifecycleState.ACTIVE



            ];



            



            return allowedStates.includes(window.__CallsCoreShared.currentState) && 



                   this._online && 



                   window.parent && 



                   window.parent !== window;



        },



        



        send: function(type, payload = {}, options = {}) {



            return window.__CallsCoreShared.safeSend(type, payload, options.requireAck || false);



        },



        



        sendAction: function(action, payload = {}) {



            if (!window.__CallsCoreShared.assertActive(action)) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            return this.send('ACTION', {



                action: action,



                data: payload,



                timestamp: Date.now()



            }, { requireAck: false });



        },



        



        sendChildReady: function() {



            return window.__CallsCoreShared.sendChildReady();



        },



        



        requestSessionFromParent: function() {



            if (window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.ACTIVE) {



                window.__CallsCoreShared.SessionClient.requestSession();



            } else {



                console.warn(`[${window.__CallsCoreShared.MODULE_NAME}] Cannot request session - not ACTIVE (current: ${window.__CallsCoreShared.currentState})`);



            }



        },



        



        handleIncoming: function(event) {



            try {



                if (!window.__CallsCoreShared.OriginSecurity.validateEvent(event)) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Invalid origin', { origin: event.origin });



                    return;



                }



                



                const message = event.data;



                



                if (!message || typeof message !== 'object') return;



                if (!window.__CallsCoreShared.validateMessage(message)) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Invalid message format', message);



                    return;



                }



                



                // Use MessageGuard for deduplication



                if (message.messageId && window.__CallsCoreShared.MessageGuard.isDuplicate(message.messageId)) {



                    window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Duplicate message ignored', { messageId: message.messageId });



                    return;



                }



                



                if (message.source && message.source !== 'parent') {



                    return;



                }



                



                window.__CallsCoreShared.OriginSecurity.lockParentOrigin(event.origin);



                



                if (message.messageId) {



                    window.__CallsCoreShared.callsState.processedMessageIds.add(message.messageId);



                }



                



                // Handle storage responses



                if (window.__CallsCoreShared.StorageProxy.handleStorageResponse(event)) {



                    return;



                }



                



                // Handle session messages



                if (window.__CallsCoreShared.SessionClient.handleSessionMessage(event)) {



                    return;



                }



                



                // ==================== CRITICAL: PARENT_READY HANDLER ====================



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.PARENT_READY) {



                    window.__CallsCoreShared.handleParentReady(message);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.ACK) {



                    const ackId = message.payload?.ackId || message.ackId || message.messageId;



                    if (ackId) {



                        window.__CallsCoreShared.MessageRegistry.acknowledge(ackId, message.payload);



                    }



                    return;



                }



                



                // Handle API_RESPONSE



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.API_RESPONSE) {



                    const requestId = message.requestId || message.payload?.requestId;



                    if (requestId && window.__CallsCoreShared.MessageRegistry._pendingMessages.has(requestId)) {



                        const pending = window.__CallsCoreShared.MessageRegistry._pendingMessages.get(requestId);



                        if (pending && pending.resolve && !pending.resolved) {



                            clearTimeout(pending.timeoutId);



                            pending.resolve({



                                success: message.success !== false,



                                data: message.payload?.data || message.data,



                                error: message.payload?.error || message.error,



                                requestId: requestId



                            });



                            pending.resolved = true;



                            window.__CallsCoreShared.MessageRegistry._pendingMessages.delete(requestId);



                        }



                    }



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.HEARTBEAT) {



                    this._handleHeartbeat(message);



                    return;



                }



                



                if (message.type === 'MODULE_REGISTERED') {



                    this._handleModuleRegistered(message);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.SESSION_SYNC) {



                    this._handleSessionSync(message);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.MODULE_INIT_DATA) {



                    window.__CallsCoreShared.handleInitData(message);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.SESSION_RESPONSE || 



                    message.type === window.__CallsCoreShared.MESSAGE_TYPES.SESSION_DATA || 



                    message.type === window.__CallsCoreShared.MESSAGE_TYPES.SESSION_ACTIVE) {



                    



                    this._handleSessionMessage(message);



                    return;



                }



                



                if (message.type === 'SESSION_NULL') {



                    window.__CallsCoreShared.callsState.session = null;



                    window.__CallsCoreShared.callsState.token = null;



                    window.__CallsCoreShared.callsState.sessionReceived = false;



                    window.__CallsCoreShared.callsState.sessionStatus = 'invalid';



                    window.__CallsCoreShared.validSessionConfirmed;



                    this._sessionActive = false;



                    window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'SESSION_NULL received');



                    return;



                }



                



                if (message.type === 'VERIFY_RESPONSE' || message.type === 'SESSION_VERIFIED') {



    const requestId = message.requestId || message.payload?.requestId || message.messageId || message.id;



    const isValid = message.payload?.valid === true || message.valid === true;



    



    // Update state



    window.__CallsCoreShared.callsState.verified = isValid;



    window.__CallsCoreShared.callsState.verificationLock = false;



    



    // CRITICAL: Properly resolve the pending promise in MessageRegistry



    if (requestId && window.__CallsCoreShared.MessageRegistry._pendingMessages.has(requestId)) {



        const pending = window.__CallsCoreShared.MessageRegistry._pendingMessages.get(requestId);



        if (pending && pending.resolve && !pending.resolved) {



            clearTimeout(pending.timeoutId);



            pending.resolve({



                success: true,



                payload: { valid: isValid },



                result: { valid: isValid }



            });



            pending.resolved = true;



            window.__CallsCoreShared.MessageRegistry._pendingMessages.delete(requestId);



        }



    } else if (requestId) {



        // Fallback to acknowledge method



        window.__CallsCoreShared.MessageRegistry.acknowledge(requestId, { valid: isValid });



    }



    



    // Also update validSessionConfirmed if needed



    if (isValid && window.__CallsCoreShared.callsState.session) {



        window.__CallsCoreShared.validSessionConfirmed;



    }



    



    window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, `VERIFY_RESPONSE received: ${isValid ? 'valid' : 'invalid'}`);



    return;



}



                



                // ==================== CALL SIGNALING HANDLERS (REAL) ====================



                // ── FIX: accept all naming variants from banner-bridge, ws-bridge, and direct WS ──



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_INCOMING ||



                    message.type === 'CALL_INCOMING' ||



                    message.type === 'incoming_call' ||



                    message.type === 'call_incoming') {



                    console.log('[CallsCore] 📞 CALL_INCOMING message received, routing to handleIncomingCall');



                    window.__CallsCoreShared.handleIncomingCall(message.payload || message.data || message);



                    return;



                }



                



                // Bug 4: AUTO_ACCEPT_CALL sent by parent banner → accept the call



                if (message.type === 'AUTO_ACCEPT_CALL') {



                    const callId = (message.payload || {}).callId || window.__CallsCoreShared.callsState.activeCallId;



                    if (callId && window.callCore && window.callCore.answerCall) {



                        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'AUTO_ACCEPT_CALL received from parent banner', { callId });



                        window.callCore.answerCall(callId).catch(e => {



                            window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'AUTO_ACCEPT answerCall failed', e);



                        });



                    }



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_INITIATED) {



                    window.__CallsCoreShared.handleCallInitiated(message.payload || message.data);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_ACCEPT) {



                    window.__CallsCoreShared.handleCallAccepted(message.payload || message.data);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_STARTED) {



                    window.__CallsCoreShared.handleCallStarted(message.payload || message.data);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_CONNECTED) {



                    window.__CallsCoreShared.handleCallConnected(message.payload || message.data);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_REJECTED) {



                    window.__CallsCoreShared.handleCallRejected(message.payload || message.data);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_ENDED) {



                    window.__CallsCoreShared.handleCallEnded(message.payload || message.data);



                    return;



                }



                



                // FIXED: Handle CALL_CANCELLED so cancelling immediately clears receiver UI



                if (message.type === 'CALL_CANCELLED' || message.type === 'call:cancelled' || message.type === 'call_cancelled') {



                    window.__CallsCoreShared.handleCallForceEnd(message.payload || message.data || {});



                    window.__CallsCoreShared.notifyListeners('call_cancelled', message.payload || message.data || {});



                    return;



                }



                



if (message.type === 'CALL_FORCE_END' || message.type === 'call:force_end') {



    window.__CallsCoreShared.handleCallForceEnd(message.payload || message.data);



    return;



}







if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_FAILED) {



    window.__CallsCoreShared.handleCallFailed(message.payload || message.data);



    return;



}







                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_FAILED) {



                    window.__CallsCoreShared.handleCallFailed(message.payload || message.data);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_TIMEOUT) {



                    window.__CallsCoreShared.handleCallTimeout(message.payload || message.data);



                    return;



                }



                



                // CALL_FORCE_ENDED: backend cleaned up a stale call, reset UI immediately



                if (message.type === 'CALL_FORCE_ENDED' || message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_FORCE_ENDED) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Received CALL_FORCE_ENDED — resetting call state', message.payload);



                    window.__CallsCoreShared.resetCallState();



                    window.__CallsCoreShared.callsState.callActive = false;



                    window.__CallsCoreShared.callsState.callState = 'idle';



                    window.__CallsCoreShared.callsState.activeCallId = null;



                    window.__CallsCoreShared.callsState.serverCallId = null;



                    window.__CallsCoreShared.callsState.callData = null;



                    if (window.__CallsCoreShared.CallsStateGovernor) {



                        window.__CallsCoreShared.CallsStateGovernor._transitionLock = false;



                        window.__CallsCoreShared.CallsStateGovernor._currentState = window.__CallsCoreShared.CALLS_STATE.ACTIVE;



                    }



                    window.__CallsCoreShared.notifyListeners('call_force_ended', message.payload || {});



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_BUSY) {



                    window.__CallsCoreShared.handleCallBusy(message.payload || message.data);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_INITIATED_ACK) {

                    window.__CallsCoreShared.handleCallInitiatedAck(message.payload || message.data);

                    return;

                }

                // WebRTC Signaling (real)



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.SIGNAL_OFFER) {



                    window.__CallsCoreShared.handleSignalOffer(message.payload || message.data);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.SIGNAL_ANSWER) {



                    window.__CallsCoreShared.handleSignalAnswer(message.payload || message.data);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.ICE_CANDIDATE) {



                    window.__CallsCoreShared.handleIceCandidate(message.payload || message.data);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.REMOTE_STREAM_ADDED) {



                    window.__CallsCoreShared.handleRemoteStreamAdded(message.payload || message.data);



                    return;



                }



                



                if (message.type === window.__CallsCoreShared.MESSAGE_TYPES.REMOTE_STREAM_REMOVED) {



                    window.__CallsCoreShared.handleRemoteStreamRemoved(message.payload || message.data);



                    return;



                }



                



                if (message.type === 'FRIEND_UPDATE' || message.type === 'CONTACTS_UPDATE') {



                    window.__CallsCoreShared.notifyListeners('contacts_update', message.payload || message.data);



                    return;



                }



                



                if (message.type === 'CALL_HISTORY_UPDATE') {



                    window.__CallsCoreShared.notifyListeners('call_history_update', message.payload || message.data);



                    return;



                }



                



                // ── OFFLINE-FIRST: Apply per-key setting changes immediately ──



if (message.type === 'SETTING_CHANGED' || message.type === 'SETTINGS_UPDATED') {



    const data = message.payload || message.data || {};







    if (message.type === 'SETTING_CHANGED' && data.section && data.key !== undefined) {



        const { section, key, value } = data;



        applySettingToCallsModule(section, key, value);



        // Keep premium feature updates



        if (data.premium !== undefined) window.__CallsCoreShared.callsState.isPremium = data.premium;



        if (data.premiumFeatures) window.__CallsCoreShared.callsState.premiumFeatures = { ...window.__CallsCoreShared.callsState.premiumFeatures, ...data.premiumFeatures };



        window.dispatchEvent(new CustomEvent('settingChanged', { detail: { section, key, value, timestamp: Date.now() } }));



        window.__CallsCoreShared.notifyListeners('setting_changed', { section, key, value });



        return;



    }







    if (message.type === 'SETTINGS_UPDATED' && data.settings) {



        const s = data.settings;



        Object.entries(s).forEach(([sec, secVal]) => {



            if (secVal && typeof secVal === 'object')



                Object.entries(secVal).forEach(([k, v]) => applySettingToCallsModule(sec, k, v));



        });



        if (s.premium !== undefined) window.__CallsCoreShared.callsState.isPremium = s.premium;



        if (s.premiumFeatures) window.__CallsCoreShared.callsState.premiumFeatures = { ...window.__CallsCoreShared.callsState.premiumFeatures, ...s.premiumFeatures };



        window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: { settings: s, timestamp: Date.now() } }));



        window.__CallsCoreShared.notifyListeners('settings_update', s);



        return;



    }



    return;



}







                if (message.type === 'USER_LOGGED_OUT') {



                    // Clean up call state on logout



                    window.__CallsCoreShared.resetCallState();



                    window.__CallsCoreShared.callsState.session = null;



                    window.__CallsCoreShared.callsState.token = null;



                    window.__CallsCoreShared.callsState.verified = false;



                    window.__CallsCoreShared.callsState.sessionReceived = false;



                    window.__CallsCoreShared.callsState.sessionStatus = 'invalid';



                    window.__CallsCoreShared.validSessionConfirmed;



                    this._sessionActive = false;



                    window.__CallsCoreShared.notifyListeners('logout', {});



                    return;



                }



                



                if (message.type === 'SESSION_REFRESHED') {



                    if ((message.payload || message.data) && (message.payload || message.data).token) {



                        const data = message.payload || message.data;



                        // Only update token if we have a valid session



                        if (window.__CallsCoreShared.validSessionConfirmed && window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



                            window.__CallsCoreShared.callsState.token = data.token;



                            if (window.__CallsCoreShared.callsState.session) {



                                window.__CallsCoreShared.callsState.session.token = data.token;



                            }



                        }



                    }



                    return;



                }



                



                if (message.type === 'SESSION_INVALIDATED') {



                    window.__CallsCoreShared.resetCallState();



                    window.__CallsCoreShared.callsState.session = null;



                    window.__CallsCoreShared.callsState.token = null;



                    window.__CallsCoreShared.callsState.sessionReceived = false;



                    window.__CallsCoreShared.callsState.sessionStatus = 'invalid';



                    window.__CallsCoreShared.validSessionConfirmed;



                    this._sessionActive = false;



                    return;



                }



                



                if (message.type === 'NEW_MESSAGE' && (message.payload || message.data)) {



                    window.__CallsCoreShared.notifyListeners('new_message', message.payload || message.data);



                    return;



                }



                



                if (message.type === 'STATUS_UPDATE' && (message.payload || message.data)) {



                    window.__CallsCoreShared.notifyListeners('status_update', message.payload || message.data);



                    return;



                }



                



                if (message.type === 'GROUP_UPDATE' && (message.payload || message.data)) {



                    window.__CallsCoreShared.notifyListeners('group_update', message.payload || message.data);



                    return;



                }



                



                this._notifyListeners('received', { type: message.type, data: message });



            } catch (error) {



                window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Error handling incoming message', error);



            }



        },



        



        _handleHeartbeat: function(message) {



            if (!window.__CallsCoreShared.assertActive('HEARTBEAT')) return;



            



            window.__CallsCoreShared.logHeartbeat(window.__CallsCoreShared.MODULE, 'Heartbeat received from parent');



            



            window.__CallsCoreShared.safeSend('HEARTBEAT_ACK', {



                ackId: message.messageId,



                module: window.__CallsCoreShared.MODULE_NAME,



                timestamp: Date.now()



            });



        },



        



        _handleModuleRegistered: function(message) {



            if (window.__CallsCoreShared.callsState.registered) {



                window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Already registered, ignoring duplicate');



                return;



            }



            



            window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE, 'MODULE_REGISTERED received');



            window.__CallsCoreShared.callsState.registered = true;



            



            if (message.expectAck) {



                window.__CallsCoreShared.safeSend('ACK', {



                    ackId: message.messageId



                }, false).catch(() => {});



            }



            



            if (window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.ACTIVE) {



                setTimeout(() => {



                    window.__CallsCoreShared.SessionClient.requestSession();



                }, 100);



            }



        },



        



        _handleSessionSync: function(message) {



            const sessionData = message.payload || message.data || {};



            



            window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'SESSION_SYNC received', {



                hasToken: !!(sessionData.token || sessionData.jwt)



            });



            



            const token = sessionData.token || sessionData.jwt || sessionData.accessToken;



            if (token) {



                const candidateSession = {



                    token: token,



                    user: sessionData.user || { id: sessionData.userId },



                    userId: sessionData.userId || sessionData.user?.id,



                    expiresAt: sessionData.expiresAt || sessionData.expiry || (Date.now() + 3600000),



                    authenticated: sessionData.authenticated !== false



                };



                



                // CRITICAL: Validate session before applying



                if (!window.__CallsCoreShared.__isValidSession(candidateSession)) {



                    console.warn(`[${window.__CallsCoreShared.MODULE}] SESSION_SYNC rejected - invalid session data`);



                    return;



                }



                



                window.__CallsCoreShared.callsState.session = candidateSession;



                window.__CallsCoreShared.callsState.token = token;



                window.__CallsCoreShared.callsState.sessionStatus = 'valid';



                window.__CallsCoreShared.callsState.sessionReceived = true;



                window.__CallsCoreShared.validSessionConfirmed;



                this._sessionActive = true;



                



                window.__CallsCoreShared.safeSend('SESSION_ACK', {



                    status: 'synced',



                    timestamp: Date.now()



                }, false).catch(() => {});



                



                window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {



                    detail: { core: window.callCore, timestamp: Date.now() }



                }));



                



                window.dispatchEvent(new CustomEvent('MODULE_READY', {



                    detail: { module: window.__CallsCoreShared.MODULE_NAME, timestamp: Date.now() }



                }));



            }



        },



        



      _handleSessionMessage: function(message) {



    this._sessionRequested = false;



    if (this._sessionRequestTimer) {



        clearTimeout(this._sessionRequestTimer);



        this._sessionRequestTimer = null;



    }



    



    const requestId = message.requestId || message.payload?.requestId || message.id;



    if (requestId) {



        window.__CallsCoreShared.MessageRegistry.acknowledge(requestId, message.payload);



    }



    



    // CRITICAL FIX: Extract session data from all possible locations



    let sessionData = message.payload || message.data || message;



    



    // If sessionData has a 'session' property, use that (some messages wrap it)



    if (sessionData.session) {



        sessionData = sessionData.session;



    }



    



    // If sessionData has a 'payload' property with session, use that



    if (sessionData.payload && sessionData.payload.session) {



        sessionData = sessionData.payload.session;



    }



    



    window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'Session message received from parent', { 



        hasToken: !!(sessionData.token || sessionData.jwt || sessionData.accessToken),



        hasRootUserId: !!sessionData.userId,



        hasUserIdInUser: !!(sessionData.user && (sessionData.user.id || sessionData.user.userId)),



        sessionDataKeys: Object.keys(sessionData)



    });



    



    const token = sessionData.token || sessionData.jwt || sessionData.accessToken;



    if (token) {



        // CRITICAL: Extract userId from various possible locations



        let userId = sessionData.userId;



        if (!userId && sessionData.user) {



            userId = sessionData.user.id || sessionData.user.userId;



        }



        if (!userId && sessionData.userData) {



            userId = sessionData.userData.id || sessionData.userData.userId;



        }



        if (!userId && sessionData.id && typeof sessionData.id === 'number') {



            userId = sessionData.id;



        }



        



        // Log what we found



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}][_handleSessionMessage] Extracted userId:`, userId);



        



        const candidateSession = {



            token: token,



            user: sessionData.user || { id: userId, userId: userId },



            userId: userId,



            expiresAt: sessionData.expiresAt || sessionData.expiry || (Date.now() + 3600000),



            authenticated: sessionData.authenticated !== false,



            sessionId: sessionData.sessionId || sessionData.id || Date.now()



        };



        



        // CRITICAL: Validate session before applying



        if (!window.__CallsCoreShared.__isValidSession(candidateSession)) {



            console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Session message rejected - invalid session data`, {



                hasToken: !!candidateSession.token,



                userId: candidateSession.userId,



                authenticated: candidateSession.authenticated,



                rawUserId: userId,



                sessionDataKeys: Object.keys(sessionData)



            });



            return;



        }



        



        // IMMUTABLE SESSION PROTECTION



        if (window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



            if (!window.__CallsCoreShared.__isValidSession(candidateSession)) {



                console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Prevented session downgrade`);



                return;



            }



        }



        



        // Session deduplication



        const sessionId = candidateSession.sessionId;



        if (sessionId && window.__CallsCoreShared.callsState.lastSessionId === sessionId) {



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Duplicate session message ignored', { sessionId });



            return;



        }



        



        if (sessionId) {



            window.__CallsCoreShared.callsState.lastSessionId = sessionId;



        }



        



        window.__CallsCoreShared.callsState.session = candidateSession;



        window.__CallsCoreShared.callsState.token = token;



        window.__CallsCoreShared.callsState.sessionStatus = 'valid';



        window.__CallsCoreShared.callsState.sessionReceived = true;



        window.__CallsCoreShared.validSessionConfirmed;



        



        window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'Session activated', { 



            authenticated: candidateSession.authenticated,



            userId: candidateSession.userId,



            sessionId: candidateSession.sessionId



        });



        



        // If we're in WAIT_PARENT and have parent ready, transition to ACTIVE



        if (window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.WAIT_PARENT && window.__CallsCoreShared.parentReadyReceived) {



            window.__CallsCoreShared.transitionTo(window.__CallsCoreShared.LifecycleState.ACTIVE, 'session_received_after_parent_ready');



            window.__CallsCoreShared.flushQueue();



            window.__CallsCoreShared.onModuleActive();



            console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] ✅ Module activated after valid session received`);



        }



        



        window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {



            detail: { core: window.callCore, timestamp: Date.now() }



        }));



        



        window.dispatchEvent(new CustomEvent('MODULE_READY', {



            detail: { module: window.__CallsCoreShared.MODULE_NAME, timestamp: Date.now() }



        }));



    }



},







        _processQueue: function() {



            if (this._processing) return;



            if (this._queue.length === 0) return;



            



            this._processing = true;



            



            const now = Date.now();



            const validQueue = this._queue.filter(item => {



                return now - item.timestamp < 30000;



            });



            



            this._queue = [];



            



            validQueue.forEach(item => {



                this.send(item.type, item.payload, item.options)



                    .then(item.resolve)



                    .catch(item.reject);



            });



            



            this._processing = false;



        },



        



        addListener: function(listener) {



            if (typeof listener === 'function') this._listeners.add(listener);



        },



        



        removeListener: function(listener) {



            this._listeners.delete(listener);



        },



        



        _notifyListeners: function(event, data) {



            this._listeners.forEach(listener => {



                try { listener(event, data); } catch (e) {}



            });



        },



        



        getStatus: function() {



            return {



                online: this._online,



                queueSize: this._queue.length,



                pendingAcks: window.__CallsCoreShared.MessageRegistry.getPendingCount(),



                targetOrigin: this._targetOrigin,



                sessionRequested: this._sessionRequested,



                sessionActive: this._sessionActive,



                rateLimitCounter: this._rateLimitCounter,



                parentReady: window.__CallsCoreShared.parentReady,



                messageQueueSize: window.__CallsCoreShared.messageQueue.length



            };



        },



        



        cleanup: function() {



            if (this._sessionRequestTimer) {



                clearTimeout(this._sessionRequestTimer);



                this._sessionRequestTimer = null;



            }



            if (this._rateLimitResetTimer) {



                clearInterval(this._rateLimitResetTimer);



                this._rateLimitResetTimer = null;



            }



            if (this._messageHandler) {



                window.removeEventListener('message', this._messageHandler);



                this._messageHandler = null;



            }



            this._queue = [];



            window.__CallsCoreShared.messageQueue.length = 0;



            window.__CallsCoreShared.MessageRegistry.reset();



            this._listeners.clear();



            this._initialized = false;



        }



    };



    



    window.__CallsCoreShared.IframeTransport.initialize();



    

})();
