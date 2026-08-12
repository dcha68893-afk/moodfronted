/**
 * calls-core.part7.js — PART 7/8 — RELIABILITY & ORCHESTRATION
 * Reliability engine, recovery manager, compatibility bridge, diagnostics agent, multi-module coordinator, navigation guard, lifecycle controller, session pipeline, and another set of real call-signaling handlers used during orchestration.
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

    // ==================== RELIABILITY ENGINE ====================



    window.__CallsCoreShared.ReliabilityEngine = {



        _circuitBreakers: new Map(),



        _retryCounters: new Map(),



        _backoffBase: 500,



        _maxRetries: 1,



        _offlineQueue: [],



        _online: navigator.onLine,



        _listeners: new Set(),



        _sessionActive: false,



        



        initialize: function() {



            this._setupListeners();



            window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, 'ReliabilityEngine initialized');



            return this;



        },



        



        _setupListeners: function() {



            window.addEventListener('online', () => {



                this._online = true;



                this._processOfflineQueue();



            });



            



            window.addEventListener('offline', () => {



                this._online = false;



            });



        },



        



        getCircuitBreaker: function(name) {



            if (!this._circuitBreakers.has(name)) {



                this._circuitBreakers.set(name, new CircuitBreaker(name));



            }



            return this._circuitBreakers.get(name);



        },



        



        canRetry: function(key) {



            return false;



        },



        



        incrementRetry: function(key) {



            return 1;



        },



        



        resetRetry: function(key) {



            this._retryCounters.delete(key);



        },



        



        recordFailure: function(key) {



            const breaker = this.getCircuitBreaker(key);



            breaker.failure();



        },



        



        getBackoffDelay: function(key) {



            return 0;



        },



        



        executeWithRetry: async function(fn, key, options = {}) {



            try {



                return await fn();



            } catch (error) {



                this.recordFailure(key);



                throw error;



            }



        },



        



        queueOffline: function(operation) {



            this._offlineQueue.push({ ...operation, timestamp: Date.now() });



            this._notifyListeners('queued', { type: operation.type });



        },



        



        _processOfflineQueue: function() {



            if (this._offlineQueue.length === 0) return;



            



            const queue = [...this._offlineQueue];



            this._offlineQueue = [];



            



            queue.forEach(operation => {



                try {



                    if (operation.execute) {



                        operation.execute().catch(() => {



                            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Offline operation failed', { type: operation.type });



                        });



                    }



                } catch (e) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Offline operation error', e);



                }



            });



        },



        



        setSessionActive: function(active) {



            this._sessionActive = active;



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



                circuitBreakers: this._circuitBreakers.size,



                retryCounters: this._retryCounters.size,



                offlineQueueSize: this._offlineQueue.length,



                sessionActive: this._sessionActive



            };



        }



    };



    



    class CircuitBreaker {



        constructor(name) {



            this.name = name;



            this.failureThreshold = 1;



            this.resetTimeout = 30000;



            this.state = 'CLOSED';



            this.failureCount = 0;



            this.lastFailureTime = null;



            this.nextAttemptTime = null;



        }



        



        success() {



            this.state = 'CLOSED';



            this.failureCount = 0;



        }



        



        failure() {



            this.failureCount++;



            this.lastFailureTime = Date.now();



            



            if (this.failureCount >= this.failureThreshold) {



                this.state = 'OPEN';



                this.nextAttemptTime = Date.now() + this.resetTimeout;



            }



        }



        



        canExecute() {



            if (this.state === 'CLOSED') return true;



            



            if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTime) {



                this.state = 'HALF_OPEN';



                return true;



            }



            



            return this.state === 'HALF_OPEN';



        }



        



        getState() { return this.state; }



    }



    



    window.__CallsCoreShared.ReliabilityEngine.initialize();



    



    // ==================== RECOVERY MANAGER ====================



    window.__CallsCoreShared.RecoveryManager = {



        _recoveryInProgress: false,



        _recoveryAttempts: 0,



        _maxRecoveryAttempts: 1,



        _recoveryBackoff: 5000,



        _lastCheckpoint: null,



        _checkpoints: [],



        _recoveryTimer: null,



        _listeners: new Set(),



        _recoveryPromise: null,



        



        initialize: function() {



            this._recoveryAttempts = 0;



            this._recoveryInProgress = false;



            this._loadLastCheckpoint();



            window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, 'RecoveryManager initialized');



            return this;



        },



        



        createCheckpoint: function(name, data = {}) {



            // CRITICAL: Never store call state in checkpoints



            const checkpoint = {



                name,



                timestamp: Date.now(),



                state: window.__CallsCoreShared.StateGovernor.getState(),



                sessionValid: window.__CallsCoreShared.IframeSessionClient.isValid(),



                environment: 'production',



                data: { ...data, callState: undefined } // Strip call state



            };



            



            this._checkpoints.push(checkpoint);



            if (this._checkpoints.length > 10) this._checkpoints.shift();



            this._lastCheckpoint = checkpoint;



            



            this._saveCheckpoint();



            



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, `Checkpoint created: ${name}`);



            return checkpoint;



        },



        



        _saveCheckpoint: function() {



            if (this._lastCheckpoint) {



                const safeCheckpoint = {



                    name: this._lastCheckpoint.name,



                    timestamp: this._lastCheckpoint.timestamp,



                    state: this._lastCheckpoint.state



                };



                window.__CallsCoreShared.SafeStorage.set('checkpoint', safeCheckpoint);



            }



        },



        



        _loadLastCheckpoint: function() {



            try {



                window.__CallsCoreShared.SafeStorage.get('checkpoint').then(stored => {



                    if (stored) {



                        this._lastCheckpoint = stored;



                        window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Loaded last checkpoint', stored);



                    }



                }).catch(() => {});



            } catch (error) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Failed to load checkpoint', error);



            }



        },



        



        recover: async function() {



            if (this._recoveryPromise) return this._recoveryPromise;



            



            if (this._recoveryInProgress) {



                return { success: false, reason: 'in_progress' };



            }



            



            if (this._recoveryAttempts >= this._maxRecoveryAttempts) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Max recovery attempts reached');



                return { success: false, reason: 'max_attempts' };



            }



            



            this._recoveryInProgress = true;



            this._recoveryAttempts++;



            



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, `Starting recovery (attempt ${this._recoveryAttempts})`);



            this._notifyListeners('start', { attempt: this._recoveryAttempts });



            



            this._recoveryPromise = (async () => {



                try {



                    if (!navigator.onLine) {



                        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Recovery: Offline, waiting for network');



                        await this._waitForNetwork();



                    }



                    



                    if (!window.parent || window.parent === window) {



                        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Recovery: No parent window');



                        this._recoveryInProgress = false;



                        this._notifyListeners('failed', { reason: 'no_parent' });



                        return { success: false, reason: 'no_parent' };



                    }



                    



                    window.__CallsCoreShared.safeSend('RECOVERY_REQUEST', {



                        module: window.__CallsCoreShared.MODULE_NAME,



                        timestamp: Date.now(),



                        attempts: this._recoveryAttempts



                    }, { requireAck: false }).catch(() => {});



                    



                    window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Recovery request sent, waiting for parent');



                    



                    this._recoveryAttempts = 0;



                    this._recoveryInProgress = false;



                    



                    window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE, 'Recovery request sent');



                    this._notifyListeners('request_sent', {});



                    



                    return { success: true, requested: true };



                    



                } catch (error) {



                    window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Recovery failed', error);



                    this._recoveryInProgress = false;



                    this._notifyListeners('failed', { error: error.message });



                    return { success: false, reason: error.message };



                } finally {



                    this._recoveryPromise = null;



                }



            })();



            



            return this._recoveryPromise;



        },



        



        _waitForNetwork: function() {



            return new Promise((resolve) => {



                if (navigator.onLine) {



                    resolve();



                    return;



                }



                const handler = () => {



                    window.removeEventListener('online', handler);



                    resolve();



                };



                window.addEventListener('online', handler);



                setTimeout(() => {



                    window.removeEventListener('online', handler);



                    resolve();



                }, 60000);



            });



        },



        



        scheduleRecovery: function(delay = 5000) {



            if (this._recoveryTimer) clearTimeout(this._recoveryTimer);



            



            this._recoveryTimer = setTimeout(() => {



                if (window.__CallsCoreShared.currentState !== window.__CallsCoreShared.LifecycleState.ACTIVE && !window.__CallsCoreShared.callsState.inPassiveMode) {



                    this.recover();



                }



            }, delay);



        },



        



        cancelRecovery: function() {



            if (this._recoveryTimer) {



                clearTimeout(this._recoveryTimer);



                this._recoveryTimer = null;



            }



            if (this._recoveryPromise) this._recoveryPromise = null;



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



                recoveryInProgress: this._recoveryInProgress,



                recoveryAttempts: this._recoveryAttempts,



                maxRecoveryAttempts: this._maxRecoveryAttempts,



                lastCheckpoint: this._lastCheckpoint ? {



                    name: this._lastCheckpoint.name,



                    timestamp: this._lastCheckpoint.timestamp,



                    state: this._lastCheckpoint.state



                } : null,



                checkpoints: this._checkpoints.length



            };



        }



    };



    



    window.__CallsCoreShared.RecoveryManager.initialize();



    



    // ==================== COMPATIBILITY BRIDGE ====================



    window.__CallsCoreShared.CompatibilityBridge = {



        _legacyMode: false,



        _parentCapabilities: new Set(),



        _detected: false,



        _version: window.__CallsCoreShared.CONFIG.VERSION,



        



        detect: function() {



            if (this._detected) return this._legacyMode;



            



            try {



                const parentProtocol = window.parent?.__PROTOCOL_VERSION__;



                



                if (parentProtocol && parentProtocol >= 'KYN-6.0') {



                    this._legacyMode = false;



                    this._parentCapabilities.add('modern_protocol');



                    window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Modern parent protocol detected', { version: parentProtocol });



                } else {



                    this._legacyMode = false;



                }



            } catch (e) {



                this._legacyMode = false;



            }



            



            this._detected = true;



            



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, `Compatibility bridge: ${this._legacyMode ? 'legacy' : 'modern'} mode`);



            return this._legacyMode;



        },



        



        adaptOutgoing: function(message) {



            return message;



        },



        



        adaptIncoming: function(rawMessage) {



            if (!rawMessage || typeof rawMessage !== 'object') return null;



            return rawMessage;



        },



        



        supports: function(feature) {



            this.detect();



            return this._parentCapabilities.has(feature);



        },



        



        getStatus: function() {



            return {



                legacyMode: this._legacyMode,



                capabilities: Array.from(this._parentCapabilities),



                version: this._version



            };



        }



    };



    



    window.__CallsCoreShared.CompatibilityBridge.detect();



    



    // ==================== DIAGNOSTICS AGENT ====================



    window.__CallsCoreShared.DiagnosticsAgent = {



        _enabled: window.__IFRAME_DEBUG__ || false,



        _metrics: {



            messagesSent: 0,



            messagesReceived: 0,



            handshakeAttempts: 0,



            handshakeSuccesses: 0,



            sessionUpdates: 0,



            errors: 0,



            retries: 0,



            recoveries: 0,



            stateChanges: 0,



            callStartTime: 0,



            callEndReason: null,



            recoveryTriggers: 0,



            sessionRefreshes: 0,



            callsInitiated: 0,



            callsAccepted: 0,



            callsRejected: 0,



            callsEnded: 0,



            callsFailed: 0,



            signalingMessagesSent: 0,



            signalingMessagesReceived: 0



        },



        _history: [],



        _startTime: Date.now(),



        _snapshots: [],



        _maxHistory: 100,



        _maxSnapshots: 20,



        



        enable: function() {



            this._enabled = true;



            this._startTime = Date.now();



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'DiagnosticsAgent enabled');



        },



        



        disable: function() { this._enabled = false; },



        



        record: function(name, data = {}) {



            if (!this._enabled) return;



            



            if (this._metrics.hasOwnProperty(name)) this._metrics[name]++;



            



            if (name === 'call_start') {



                this._metrics.callStartTime = Date.now();



                this._metrics.callEndReason = null;



                this._metrics.callsInitiated++;



            }



            if (name === 'call_accept') {



                this._metrics.callsAccepted++;



            }



            if (name === 'call_reject') {



                this._metrics.callsRejected++;



            }



            if (name === 'call_end') {



                this._metrics.callsEnded++;



                if (data.reason) this._metrics.callEndReason = data.reason;



            }



            if (name === 'call_fail') {



                this._metrics.callsFailed++;



            }



            if (name === 'recovery_trigger') {



                this._metrics.recoveryTriggers++;



            }



            if (name === 'session_refresh') {



                this._metrics.sessionRefreshes++;



            }



            if (name === 'signaling_send') {



                this._metrics.signalingMessagesSent++;



            }



            if (name === 'signaling_recv') {



                this._metrics.signalingMessagesReceived++;



            }



            



            const entry = {



                name,



                data,



                timestamp: Date.now(),



                state: {



                    coreState: window.__CallsCoreShared.StateGovernor.getState(),



                    sessionValid: window.__CallsCoreShared.IframeSessionClient.isValid(),



                    online: navigator.onLine,



                    visible: !document.hidden,



                    v5State: window.__CallsCoreShared.V5StateGovernor ? window.__CallsCoreShared.V5StateGovernor.getState() : 'unknown',



                    tokenValid: !!window.__CallsCoreShared.callsState.token,



                    lifecycleState: window.__CallsCoreShared.currentState,



                    callActive: window.__CallsCoreShared.callsState.callActive,



                    callState: window.__CallsCoreShared.callsState.callState,



                    inPassiveMode: false



                }



            };



            



            this._history.push(entry);



            if (this._history.length > this._maxHistory) this._history.shift();



        },



        



        snapshot: function(label) {



            if (!this._enabled) return;



            



            const snapshot = {



                label,



                timestamp: Date.now(),



                metrics: { ...this._metrics },



                state: {



                    coreState: window.__CallsCoreShared.StateGovernor.getState(),



                    sessionValid: window.__CallsCoreShared.IframeSessionClient.isValid(),



                    online: navigator.onLine,



                    visible: !document.hidden,



                    v5State: window.__CallsCoreShared.V5StateGovernor ? window.__CallsCoreShared.V5StateGovernor.getState() : 'unknown',



                    tokenValid: !!window.__CallsCoreShared.callsState.token,



                    lifecycleState: window.__CallsCoreShared.currentState,



                    callActive: window.__CallsCoreShared.callsState.callActive,



                    callState: window.__CallsCoreShared.callsState.callState,



                    inPassiveMode: false



                },



                environment: { environment: window.__CallsCoreShared.ENVIRONMENT.current },



                transport: window.__CallsCoreShared.IframeTransport.getStatus(),



                handshake: { state: 'unknown' },



                session: window.__CallsCoreShared.IframeSessionClient.isValid() ? {



                    valid: true,



                    timeRemaining: window.__CallsCoreShared.IframeSessionClient.getTimeRemaining()



                } : { valid: false },



                recovery: window.__CallsCoreShared.RecoveryManager.getStatus(),



                callsState: { 



                    ...window.__CallsCoreShared.callsState,



                    localStream: !!window.__CallsCoreShared.callsState.localStream,



                    remoteStream: !!window.__CallsCoreShared.callsState.remoteStream,



                    remoteStreams: window.__CallsCoreShared.callsState.remoteStreams.size



                }



            };



            



            this._snapshots.push(snapshot);



            if (this._snapshots.length > this._maxSnapshots) this._snapshots.shift();



        },



        



        getReport: function() {



            const uptime = Date.now() - this._startTime;



            



            return {



                uptime,



                metrics: { ...this._metrics },



                history: this._history.slice(-10),



                snapshots: this._snapshots.slice(-5),



                state: {



                    coreState: window.__CallsCoreShared.StateGovernor.getState(),



                    sessionValid: window.__CallsCoreShared.IframeSessionClient.isValid(),



                    online: navigator.onLine,



                    visible: !document.hidden,



                    v5State: window.__CallsCoreShared.V5StateGovernor ? window.__CallsCoreShared.V5StateGovernor.getState() : 'unknown',



                    tokenValid: !!window.__CallsCoreShared.callsState.token,



                    lifecycleState: window.__CallsCoreShared.currentState,



                    callActive: window.__CallsCoreShared.callsState.callActive,



                    callState: window.__CallsCoreShared.callsState.callState,



                    inPassiveMode: false



                },



                environment: { environment: window.__CallsCoreShared.ENVIRONMENT.current },



                transport: window.__CallsCoreShared.IframeTransport.getStatus(),



                session: window.__CallsCoreShared.IframeSessionClient.isValid() ? {



                    valid: true,



                    timeRemaining: window.__CallsCoreShared.IframeSessionClient.getTimeRemaining()



                } : { valid: false },



                recovery: window.__CallsCoreShared.RecoveryManager.getStatus(),



                callsState: { 



                    ...window.__CallsCoreShared.callsState,



                    localStream: !!window.__CallsCoreShared.callsState.localStream,



                    remoteStream: !!window.__CallsCoreShared.callsState.remoteStream,



                    remoteStreams: window.__CallsCoreShared.callsState.remoteStreams.size



                }



            };



        },



        



        reset: function() {



            this._metrics = {



                messagesSent: 0,



                messagesReceived: 0,



                handshakeAttempts: 0,



                handshakeSuccesses: 0,



                sessionUpdates: 0,



                errors: 0,



                retries: 0,



                recoveries: 0,



                stateChanges: 0,



                callStartTime: 0,



                callEndReason: null,



                recoveryTriggers: 0,



                sessionRefreshes: 0,



                callsInitiated: 0,



                callsAccepted: 0,



                callsRejected: 0,



                callsEnded: 0,



                callsFailed: 0,



                signalingMessagesSent: 0,



                signalingMessagesReceived: 0



            };



            this._history = [];



            this._snapshots = [];



            this._startTime = Date.now();



        }



    };



    



    if (window.__IFRAME_DEBUG__) window.__CallsCoreShared.DiagnosticsAgent.enable();



    



    // ==================== MULTI-MODULE COORDINATOR ====================



    window.__CallsCoreShared.MultiModuleCoordinator = {



        _modules: new Map(),



        _authority: null,



        _initialized: false,



        



        initialize: function() {



            if (this._initialized) return this;



            



            this._authority = {



                environment: window.__CallsCoreShared.ENVIRONMENT,



                storage: window.__CallsCoreShared.SafeStorage,



                transport: window.__CallsCoreShared.IframeTransport,



                session: window.__CallsCoreShared.IframeSessionClient,



                reliability: window.__CallsCoreShared.ReliabilityEngine,



                recovery: window.__CallsCoreShared.RecoveryManager,



                compatibility: window.__CallsCoreShared.CompatibilityBridge,



                diagnostics: window.__CallsCoreShared.DiagnosticsAgent,



                origin: window.__CallsCoreShared.OriginSecurity,



                state: window.__CallsCoreShared.StateGovernor,



                v5State: window.__CallsCoreShared.V5StateGovernor,



                callsState: window.__CallsCoreShared.callsState,



                webRTC: window.__CallsCoreShared.WebRTCManager,



                media: window.__CallsCoreShared.MediaManager,



                callsGovernor: window.__CallsCoreShared.CallsStateGovernor



            };



            



            this._initialized = true;



            window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, 'MultiModuleCoordinator initialized');



            



            return this;



        },



        



        register: function(name, module) {



            if (this._modules.has(name)) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, `Module ${name} already registered, overriding`);



            }



            this._modules.set(name, module);



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, `Module registered: ${name}`);



        },



        



        get: function(name) {



            return this._authority?.[name] || this._modules.get(name);



        },



        



        getAuthority: function() { return this._authority; },



        



        getStatus: function() {



            const status = { authority: {}, modules: {} };



            



            if (this._authority) {



                Object.keys(this._authority).forEach(key => {



                    const module = this._authority[key];



                    if (module && typeof module.getStatus === 'function') {



                        status.authority[key] = module.getStatus();



                    } else {



                        status.authority[key] = { available: !!module };



                    }



                });



            }



            



            this._modules.forEach((module, name) => {



                if (module && typeof module.getStatus === 'function') {



                    status.modules[name] = module.getStatus();



                } else {



                    status.modules[name] = { available: !!module };



                }



            });



            



            return status;



        }



    };



    



    window.__CallsCoreShared.MultiModuleCoordinator.initialize();



    



    // Replace the entire UIFailsafe object in calls-core.js (around line 5200)







window.__CallsCoreShared.UIFailsafe = {



    _enabled: true,



    _fallbackMode: false,



    _disabledButtons: new Set(),



    _disabledInputs: new Set(),



    _originalStates: new Map(),



    _listeners: new Set(),



    _lastMessageShown: null,



    _notificationContainer: null,



    



    initialize: function() {



        // Create notification container if it doesn't exist



        this._ensureNotificationContainer();



        window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, 'UIFailsafe initialized');



        return this;



    },



    



    _ensureNotificationContainer: function() {



        if (this._notificationContainer && document.body.contains(this._notificationContainer)) {



            return this._notificationContainer;



        }



        



        let container = document.getElementById('call-notification-container');



        if (!container) {



            container = document.createElement('div');



            container.id = 'call-notification-container';



            container.style.cssText = `



                position: fixed;



                top: 20px;



                right: 20px;



                z-index: 10000;



                display: flex;



                flex-direction: column;



                gap: 10px;



                max-width: 350px;



                pointer-events: none;



            `;



            document.body.appendChild(container);



        }



        



        // Add styles if not present



        if (!document.getElementById('call-notification-styles')) {



            const style = document.createElement('style');



            style.id = 'call-notification-styles';



            style.textContent = `



                @keyframes callNotifySlideIn {



                    from { transform: translateX(100%); opacity: 0; }



                    to { transform: translateX(0); opacity: 1; }



                }



                @keyframes callNotifySlideOut {



                    from { transform: translateX(0); opacity: 1; }



                    to { transform: translateX(100%); opacity: 0; }



                }



                .call-notification {



                    pointer-events: auto;



                    transition: all 0.3s ease;



                    animation: callNotifySlideIn 0.3s ease;



                }



                .call-notification-removing {



                    animation: callNotifySlideOut 0.3s ease forwards;



                }



            `;



            document.head.appendChild(style);



        }



        



        this._notificationContainer = container;



        return container;



    },



    



    // Replace the showFallbackMessage method in UIFailsafe (around line 5900-5950)







showFallbackMessage: function(message, type = 'warning') {



    // Prevent duplicate notifications



    const messageKey = `${type}:${message}`;



    const now = Date.now();



    



    if (this._lastMessageShown && this._lastMessageShown.key === messageKey && 



        (now - this._lastMessageShown.time) < 3000) {



        return;



    }



    



    this._lastMessageShown = { key: messageKey, time: now };



    



    // Get or create notification container



    let container = document.getElementById('call-notification-container');



    if (!container) {



        container = document.createElement('div');



        container.id = 'call-notification-container';



        container.style.cssText = `



            position: fixed;



            top: 20px;



            right: 20px;



            z-index: 10000;



            display: flex;



            flex-direction: column;



            gap: 10px;



            max-width: 350px;



        `;



        document.body.appendChild(container);



    }



    



    // Check for existing similar notification



    const existing = container.querySelector(`.call-notification[data-message="${message.replace(/"/g, '&quot;')}"]`);



    if (existing) {



        // Update existing notification



        const titleEl = existing.querySelector('.call-notification-title');



        if (titleEl) titleEl.textContent = type.charAt(0).toUpperCase() + type.slice(1);



        if (existing._timeout) clearTimeout(existing._timeout);



        existing._timeout = setTimeout(() => existing.remove(), 4000);



        return;



    }



    



    // Colors



    const colors = {



        success: '#4caf50',



        error: '#f44336', 



        warning: '#ff9800',



        info: '#2196f3'



    };



    



    // Create notification element



    const notification = document.createElement('div');



    notification.className = `call-notification call-notification-${type}`;



    notification.setAttribute('data-message', message);



    notification.style.cssText = `



        background: ${colors[type] || colors.info};



        color: white;



        border-radius: 8px;



        padding: 12px 16px;



        box-shadow: 0 4px 12px rgba(0,0,0,0.15);



        display: flex;



        align-items: center;



        justify-content: space-between;



        min-width: 250px;



        animation: slideInRight 0.3s ease;



    `;



    



    notification.innerHTML = `



        <div style="flex: 1;">



            <div class="call-notification-title" style="font-weight: bold; margin-bottom: 4px;">${type.charAt(0).toUpperCase() + type.slice(1)}</div>



            <div class="call-notification-message" style="font-size: 14px;">${this._escapeHtml(message)}</div>



        </div>



        <button class="call-notification-close" style="



            background: transparent;



            border: none;



            color: white;



            cursor: pointer;



            font-size: 16px;



            padding: 4px 8px;



            margin-left: 12px;



            opacity: 0.7;



        ">&times;</button>



    `;



    



    // Close button handler



    const closeBtn = notification.querySelector('.call-notification-close');



    if (closeBtn) {



        closeBtn.onclick = () => {



            if (notification._timeout) clearTimeout(notification._timeout);



            notification.remove();



        };



    }



    



    // Auto remove after 4 seconds



    notification._timeout = setTimeout(() => {



        if (notification.parentNode) notification.remove();



    }, 4000);



    



    container.appendChild(notification);



},







_escapeHtml: function(text) {



    if (!text) return '';



    return text



        .replace(/&/g, '&amp;')



        .replace(/</g, '&lt;')



        .replace(/>/g, '&gt;')



        .replace(/"/g, '&quot;')



        .replace(/'/g, '&#39;');



},



    



    _escapeHtml: function(text) {



        if (!text) return '';



        const div = document.createElement('div');



        div.textContent = text;



        return div.innerHTML;



    },



    



    _removeNotification: function(notification) {



        if (!notification || !notification.parentNode) return;



        if (notification._timeout) clearTimeout(notification._timeout);



        notification.classList.add('call-notification-removing');



        setTimeout(() => {



            if (notification.parentNode) notification.remove();



        }, 300);



    },



    



    clearAllNotifications: function() {



        if (this._notificationContainer) {



            const notifications = this._notificationContainer.querySelectorAll('.call-notification');



            notifications.forEach(notification => this._removeNotification(notification));



        }



        this._lastMessageShown = null;



    },



    



    enableFallbackMode: function() {



        if (this._fallbackMode) return;



        this._fallbackMode = true;



        this._notifyListeners('fallback', { enabled: true });



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'UI fallback mode enabled');



    },



    



    disableFallbackMode: function() {



        if (!this._fallbackMode) return;



        this._fallbackMode = false;



        this._restoreUI();



        this._notifyListeners('fallback', { enabled: false });



        window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'UI fallback mode disabled');



    },



    



    protectButton: function(button, fallbackHandler) {



        if (!button) return;



        const id = button.id || `btn-${Date.now()}-${Math.random()}`;



        this._originalStates.set(id, { disabled: button.disabled, onclick: button.onclick });



        



        const originalClick = button.onclick;



        button.onclick = (e) => {



            if (this._fallbackMode) {



                if (fallbackHandler) {



                    fallbackHandler(e);



                } else {



                    e.preventDefault();



                    e.stopPropagation();



                }



            } else if (originalClick) {



                originalClick.call(button, e);



            }



        };



        this._disabledButtons.add(id);



    },



    



    protectInput: function(input, fallbackValue) {



        if (!input) return;



        const id = input.id || `input-${Date.now()}-${Math.random()}`;



        this._originalStates.set(id, { disabled: input.disabled, value: input.value, oninput: input.oninput });



        



        const originalInput = input.oninput;



        input.oninput = (e) => {



            if (this._fallbackMode) {



                e.preventDefault();



                e.stopPropagation();



                if (fallbackValue !== undefined) input.value = fallbackValue;



            } else if (originalInput) {



                originalInput.call(input, e);



            }



        };



        this._disabledInputs.add(id);



    },



    



    _restoreUI: function() {



        this._originalStates.forEach((state, id) => {



            const element = document.getElementById(id);



            if (element) {



                if (state.disabled !== undefined) element.disabled = state.disabled;



                if (state.value !== undefined) element.value = state.value;



                if (state.onclick) element.onclick = state.onclick;



                if (state.oninput) element.oninput = state.oninput;



            }



        });



        this._originalStates.clear();



        this._disabledButtons.clear();



        this._disabledInputs.clear();



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



            enabled: this._enabled,



            fallbackMode: this._fallbackMode,



            protectedButtons: this._disabledButtons.size,



            protectedInputs: this._disabledInputs.size



        };



    }



};



    



    window.__CallsCoreShared.UIFailsafe.initialize();







    /**



     * _showCallNotification — safe toast helper.



     * Tries UIFailsafe.showFallbackMessage first (richest UI),



     * then falls back to a simple DOM toast so the user ALWAYS sees the message.



     * This fixes the "not implemented" / silent-failure path where UIFailsafe



     * was not ready and the else-branch only did console.warn.



     */



    function _showCallNotification(message, type) {



        type = type || 'info';



        try {



            if (typeof window.__CallsCoreShared.UIFailsafe !== 'undefined' && window.__CallsCoreShared.UIFailsafe && typeof window.__CallsCoreShared.UIFailsafe.showFallbackMessage === 'function') {



                window.__CallsCoreShared.UIFailsafe.showFallbackMessage(message, type);



                return;



            }



        } catch (_) {}







        // DOM fallback — always works even if UIFailsafe isn't ready



        try {



            const colors = { success: '#4caf50', error: '#f44336', warning: '#ff9800', info: '#2196f3' };



            const icons  = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };



            let container = document.getElementById('call-notification-container');



            if (!container) {



                container = document.createElement('div');



                container.id = 'call-notification-container';



                container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;max-width:360px;pointer-events:none;';



                document.body.appendChild(container);



            }



            const toast = document.createElement('div');



            toast.style.cssText = `background:${colors[type]||colors.info};color:#fff;border-radius:10px;padding:12px 16px;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;gap:10px;pointer-events:auto;font-size:14px;font-family:system-ui,sans-serif;`;



            toast.innerHTML = `<span style="font-size:18px;flex-shrink:0">${icons[type]||icons.info}</span><span style="flex:1">${message}</span><span style="cursor:pointer;opacity:.7;font-size:18px;margin-left:8px" onclick="this.parentElement.remove()">&times;</span>`;



            container.appendChild(toast);



            setTimeout(() => { toast.style.opacity='0'; toast.style.transition='opacity .4s'; setTimeout(()=>toast.remove(), 400); }, 4500);



        } catch (domErr) {



            console.warn('[CallsCore] _showCallNotification DOM fallback failed:', message, domErr);



        }



    }







    // ==================== NAVIGATION GUARD ====================



    window.__CallsCoreShared.NavigationGuard = {



        _currentPath: window.location.pathname,



        _currentHash: window.location.hash,



        _navigationInProgress: false,



        _pendingNavigation: null,



        _listeners: new Set(),



        



        initialize: function() {



            this._setupListeners();



            window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, 'NavigationGuard initialized');



            return this;



        },



        



        _setupListeners: function() {



            const originalPushState = history.pushState;



            const originalReplaceState = history.replaceState;



            



            history.pushState = (...args) => {



                if (this.shouldBlockNavigation()) {



                    return false;



                }



                this._handleNavigation('pushState', args);



                return originalPushState.apply(history, args);



            };



            



            history.replaceState = (...args) => {



                if (this.shouldBlockNavigation()) {



                    return false;



                }



                this._handleNavigation('replaceState', args);



                return originalReplaceState.apply(history, args);



            };



            



            window.addEventListener('popstate', () => {



                if (this.shouldBlockNavigation()) {



                    return false;



                }



                this._handleNavigation('popstate', {});



            });



            



            window.addEventListener('hashchange', () => {



                if (this.shouldBlockNavigation()) {



                    return false;



                }



                this._handleNavigation('hashchange', { hash: window.location.hash });



            });



        },



        



        shouldBlockNavigation: function() {



            return window.__CallsCoreShared.callsState.callActive === true;



        },



        



        _handleNavigation: function(type, data) {



            if (this._navigationInProgress) {



                this._pendingNavigation = { type, data };



                return;



            }



            



            const oldPath = this._currentPath;



            const oldHash = this._currentHash;



            



            this._currentPath = window.location.pathname;



            this._currentHash = window.location.hash;



            



            this._notifyListeners('navigation', {



                type, oldPath, newPath: this._currentPath, oldHash, newHash: this._currentHash, data



            });



        },



        



        guard: function(callback) {



            this.addListener((event, data) => {



                if (event === 'navigation') callback(data);



            });



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



        



        getCurrentPath: function() { return this._currentPath; },



        getCurrentHash: function() { return this._currentHash; },



        getStatus: function() {



            return {



                currentPath: this._currentPath,



                currentHash: this._currentHash,



                navigationInProgress: this._navigationInProgress,



                hasPendingNavigation: !!this._pendingNavigation,



                blockActive: window.__CallsCoreShared.callsState.callActive



            };



        }



    };



    



    window.__CallsCoreShared.NavigationGuard.initialize();



    



    // ==================== LIFECYCLE CONTROLLER ====================



    window.__CallsCoreShared.LifecycleController = {



        _initializationPromise: null,



        _initializationLock: false,



        _pipelineCompleted: false,



        _pipelineStage: null,



        _pipelineStartTime: 0,



        _pipelineResults: {},



        _listeners: new Set(),



        _handshakeCompleted: false,



        _sessionAcquired: false,



        _pipelineAttempts: 0,



        _maxPipelineAttempts: 1,



        



        initialize: function() {



            window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, 'LifecycleController initialized');



            return this;



        },



        



        runDeterministicPipeline: async function() {



            if (this._initializationPromise) {



                return this._initializationPromise;



            }



            



            if (this._initializationLock) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Pipeline already running, waiting');



                return new Promise(resolve => {



                    const checkInterval = setInterval(() => {



                        if (this._pipelineCompleted || !this._initializationLock) {



                            clearInterval(checkInterval);



                            resolve(this._pipelineResults);



                        }



                    }, 100);



                });



            }



            



            this._pipelineAttempts++;



            if (this._pipelineAttempts > this._maxPipelineAttempts) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Max pipeline attempts reached, completing');



                this._pipelineResults = { success: true, degraded: true };



                this._pipelineCompleted = true;



                return this._pipelineResults;



            }



            



            this._initializationLock = true;



            this._pipelineStartTime = Date.now();



            this._pipelineResults = {};



            



            this._initializationPromise = this._executePipeline();



            



            return this._initializationPromise;



        },



        



        _executePipeline: async function() {



            try {



                window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Starting deterministic pipeline');



                



                window.__CallsCoreShared.StateGovernor.enableTransitions();



                



                const pipelineResult = await window.__CallsCoreShared.SessionPipeline.run();



                



                this._pipelineResults = pipelineResult;



                this._pipelineCompleted = true;



                this._initializationLock = false;



                



                if (pipelineResult.success) {



                    window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE, `Deterministic pipeline completed in ${pipelineResult.duration || 0}ms`, { degraded: pipelineResult.degraded });



                    



                    window.dispatchEvent(new CustomEvent('core.ready', {



                        detail: {



                            timestamp: Date.now(),



                            version: window.__CallsCoreShared.CONFIG.VERSION,



                            environment: window.__CallsCoreShared.ENVIRONMENT.current,



                            duration: pipelineResult.duration || 0,



                            degraded: pipelineResult.degraded || false



                        }



                    }));



                    



                    return pipelineResult;



                } else {



                    throw new Error(pipelineResult.error || 'Pipeline failed');



                }



                



            } catch (error) {



                window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Pipeline execution failed', error);



                this._initializationLock = false;



                window.__CallsCoreShared.StateGovernor._currentState = window.__CallsCoreShared.STATE.ERROR_FATAL;



                window.__CallsCoreShared.RecoveryManager.scheduleRecovery();



                



                this._pipelineResults.success = false;



                this._pipelineResults.error = error.message;



                return this._pipelineResults;



            } finally {



                window.__CallsCoreShared.StateGovernor.disableTransitions();



            }



        },



        



        getPipelineStatus: function() {



            return {



                stage: this._pipelineStage,



                completed: this._pipelineCompleted,



                locked: this._initializationLock,



                startTime: this._pipelineStartTime,



                duration: this._pipelineStartTime ? Date.now() - this._pipelineStartTime : 0,



                results: this._pipelineResults



            };



        },



        



        reset: function() {



            this._initializationPromise = null;



            this._initializationLock = false;



            this._pipelineCompleted = false;



            this._pipelineStage = null;



            this._pipelineStartTime = 0;



            this._pipelineResults = {};



            this._handshakeCompleted = false;



            this._sessionAcquired = false;



            this._pipelineAttempts = 0;



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



        }



    };



    



    window.__CallsCoreShared.LifecycleController.initialize();



    



    // ==================== SESSION PIPELINE ====================



    window.__CallsCoreShared.SessionPipeline = {



        _stages: [



            'preflight',



            'dependencyCheck',



            'parentDetection',



            'handshake',



            'sessionSync',



            'serviceInit',



            'ready'



        ],



        _currentStage: null,



        _stageResults: {},



        _stageAttempts: {},



        _maxAttempts: 1,



        _pipelineInProgress: false,



        _pipelineCompleted: false,



        _pipelineDegraded: false,



        _pipelineStartTime: 0,



        _pipelineEndTime: 0,



        _listeners: new Set(),



        



        initialize: function() {



            this._reset();



            window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, 'SessionPipeline initialized');



            return this;



        },



        



        _reset: function() {



            this._currentStage = null;



            this._stageResults = {};



            this._stageAttempts = {};



            this._pipelineInProgress = false;



            this._pipelineCompleted = false;



            this._pipelineDegraded = false;



        },



        



        run: async function() {



            if (this._pipelineInProgress) {



                logPipeline(window.__CallsCoreShared.MODULE, 'pipeline', 'already in progress');



                return this._waitForCompletion();



            }



            



            if (this._pipelineCompleted) {



                logPipeline(window.__CallsCoreShared.MODULE, 'pipeline', 'already completed', { degraded: this._pipelineDegraded });



                return { success: true, completed: true, degraded: this._pipelineDegraded };



            }



            



            this._pipelineInProgress = true;



            this._pipelineStartTime = Date.now();



            this._pipelineDegraded = false;



            



            logPipeline(window.__CallsCoreShared.MODULE, 'pipeline', 'start');



            



            for (const stage of this._stages) {



                this._currentStage = stage;



                this._stageAttempts[stage] = 0;



                



                logPipeline(window.__CallsCoreShared.MODULE, stage, 'start');



                



                const stageResult = await this._executeStageWithRetry(stage);



                this._stageResults[stage] = stageResult;



                



                if (stageResult.success) {



                    logPipeline(window.__CallsCoreShared.MODULE, stage, 'success', { attempt: stageResult.attempt });



                } else {



                    logPipeline(window.__CallsCoreShared.MODULE, stage, 'fail', { attempt: stageResult.attempt, error: stageResult.error });



                    



                    const criticalStages = ['preflight', 'dependencyCheck'];



                    



                    if (criticalStages.includes(stage)) {



                        logPipeline(window.__CallsCoreShared.MODULE, 'pipeline', 'critical failure', { stage });



                        this._pipelineInProgress = false;



                        return { success: false, stage, error: stageResult.error };



                    }



                    



                    this._pipelineDegraded = true;



                    



                    if (stage === 'sessionSync') {



                        logPipeline(window.__CallsCoreShared.MODULE, 'pipeline', 'continuing in degraded mode', { stage });



                    } else {



                        logPipeline(window.__CallsCoreShared.MODULE, 'pipeline', 'continuing despite failure', { stage });



                    }



                }



            }



            



            this._pipelineCompleted = true;



            this._pipelineInProgress = false;



            this._pipelineEndTime = Date.now();



            



            const duration = this._pipelineEndTime - this._pipelineStartTime;



            



            logPipeline(window.__CallsCoreShared.MODULE, 'pipeline', 'complete', { 



                degraded: this._pipelineDegraded,



                duration: duration + 'ms'



            });



            



            return { success: true, degraded: this._pipelineDegraded, duration };



        },



        



        _runPreflight: async function() {



            const capabilities = {



                postMessage: typeof window.postMessage === 'function',



                addEventListener: typeof window.addEventListener === 'function',



                Promise: typeof Promise !== 'undefined'



            };



            



            const missing = Object.entries(capabilities)



                .filter(([_, available]) => !available)



                .map(([name]) => name);



            



            if (missing.length > 0) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Preflight: missing capabilities', { missing });



                return { success: false, error: `Missing: ${missing.join(', ')}` };



            }



            



            return { success: true, capabilities, readyState: document.readyState };



        },



        



        _runDependencyCheck: async function() {



            const dependencies = {



                window: typeof window !== 'undefined',



                document: typeof document !== 'undefined',



                navigator: typeof navigator !== 'undefined',



                mediaDevices: typeof navigator.mediaDevices !== 'undefined'



            };



            



            const missing = Object.entries(dependencies)



                .filter(([_, available]) => !available)



                .map(([name]) => name);



            



            if (missing.length > 0) {



                return { success: false, error: `Missing dependencies: ${missing.join(', ')}` };



            }



            



            return { success: true, dependencies };



        },



        



        _runParentDetection: async function() {



            const parentDetected = !!(window.parent && window.parent !== window);



            let sameOrigin = false;



            let parentOrigin = null;



            



            if (parentDetected) {



                try {



                    parentOrigin = window.parent.location.origin;



                    sameOrigin = window.location.origin === parentOrigin;



                } catch (e) {



                    sameOrigin = false;



                }



            }



            



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Parent detection', { parentDetected, sameOrigin, parentOrigin });



            



            return { 



                success: true, 



                parentDetected, 



                sameOrigin, 



                parentOrigin 



            };



        },



        



        _runHandshake: async function() {



            try {



                window.__CallsCoreShared.sendChildReady();



                return { success: true };



            } catch (error) {



                window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Handshake failed', error);



                return { success: true, degraded: true, error: error.message };



            }



        },



        



        _runSessionSync: async function() {



            if (window.__CallsCoreShared.IframeSessionClient && window.__CallsCoreShared.IframeSessionClient.isValid()) {



                window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'already valid');



                return { success: true, cached: true };



            }



            



            try {



                window.__CallsCoreShared.SessionClient.requestSession();



                



                const sessionResult = await window.__CallsCoreShared.StateGovernor.waitForSession(5000);



                



                if (sessionResult && sessionResult.success) {



                    window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'acquired');



                    return { success: true };



                }



            } catch (error) {



                window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'failed', error.message);



            }



            



            return { success: true, pending: true, error: 'Session sync failed - continuing with pending state' };



        },



        



        _runServiceInit: async function() {



            return { success: true };



        },



        



        _waitForCompletion: function() {



            return new Promise((resolve) => {



                const checkInterval = setInterval(() => {



                    if (!this._pipelineInProgress) {



                        clearInterval(checkInterval);



                        resolve({ 



                            success: this._pipelineCompleted, 



                            degraded: this._pipelineDegraded,



                            stages: this._stageResults 



                        });



                    }



                }, 100);



                



                setTimeout(() => {



                    clearInterval(checkInterval);



                    resolve({ 



                        success: this._pipelineCompleted, 



                        degraded: this._pipelineDegraded,



                        timeout: true 



                    });



                }, 30000);



            });



        },



        



        getStatus: function() {



            return {



                currentStage: this._currentStage,



                pipelineInProgress: this._pipelineInProgress,



                pipelineCompleted: this._pipelineCompleted,



                pipelineDegraded: this._pipelineDegraded,



                startTime: this._pipelineStartTime,



                endTime: this._pipelineEndTime,



                duration: this._pipelineEndTime ? this._pipelineEndTime - this._pipelineStartTime : 0,



                stages: this._stageResults,



                attempts: { ...this._stageAttempts }



            };



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



        }



    };



    



    function logPipeline(module, stage, status, data = null) {



        const key = `${module}:pipeline:${stage}:${status}`;



        const icon = status === 'start' ? '🚀' : status === 'success' ? '✅' : status === 'fail' ? '❌' : '⏳';



        console.log(`[${module}] ${icon} Pipeline stage: ${stage} - ${status}`, data ? data : '', window.__CallsCoreShared._buildStructuredLog(module, `pipeline:${stage}:${status}`, data));



    }



    



    window.__CallsCoreShared.SessionPipeline.initialize();



    



    // ==================== CALL SIGNALING HANDLERS (REAL) ====================



    



    // FIX: 'friendsOnly' calling tier — asks the parent page (which holds the
    // real friends list; this iframe has no access to it) whether the caller
    // is a friend, then force-rejects if confirmed not. Self-contained (does
    // not use the VERIFY_SESSION/MessageRegistry machinery, which is gated on
    // an active call — this needs to run for a call that hasn't been accepted
    // yet). Fails open on timeout, error, or missing parent — an unconfirmed
    // caller is let through rather than risk blocking a real friend.
    window.__CallsCoreShared._enforceFriendsOnlyTier = function (callData) {
        try {
            const requestId = 'friend_check_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            let responded = false;

            const onMessage = function (event) {
                const msg = event.data;
                if (!msg || msg.type !== 'CHECK_FRIEND_RESPONSE' || msg.requestId !== requestId) return;
                if (responded) return;
                responded = true;
                window.removeEventListener('message', onMessage);
                clearTimeout(timeoutId);

                const isFriend = !!(msg.payload && msg.payload.isFriend);
                if (!isFriend) {
                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE,
                        'Incoming call rejected — caller is not a friend (Friends Only setting)',
                        { callerId: callData.callerId });
                    window.__CallsCoreShared.safeSend('CALL_REJECT', {
                        callId: callData.callId,
                        reason: 'calls_restricted',
                        timestamp: Date.now()
                    }, false);
                    if (window.hideIncomingCallUI) { try { window.hideIncomingCallUI(); } catch (e) {} }
                    document.dispatchEvent(new CustomEvent('call:forceRejectedNotFriend', { detail: { callId: callData.callId } }));
                }
            };

            const timeoutId = setTimeout(function () {
                if (responded) return;
                responded = true;
                window.removeEventListener('message', onMessage);
                // Fail open — no response in time, let the call proceed
            }, 1500);

            window.addEventListener('message', onMessage);
            window.parent.postMessage({
                type: 'CHECK_FRIEND',
                requestId: requestId,
                payload: { requestId: requestId, callerId: callData.callerId }
            }, '*');
        } catch (e) {
            // Fail open — never let this check throw and block a legitimate call
        }
    };

    window.__CallsCoreShared.handleIncomingCall = function handleIncomingCall(callData) {


        // ── FIX: Capture the receiver's origin page (tagged by chat.html as
        // _receiverReturnTo) so that after this call ends, POST_CALL_RESTORE
        // navigates back to where the receiver actually was — not always
        // 'conversations'/'messages'. Only set once per call (first message wins).
        try {
            if (callData && callData._receiverReturnTo && !window.__CallsCoreShared.callsState.pendingCallReturnTo) {
                window.__CallsCoreShared.callsState.pendingCallReturnTo = callData._receiverReturnTo;
            }
            // FIX (call-end return navigation — receiver side): also carry the
            // SPECIFIC chat that was open, if any, so returning after the call
            // reopens that exact conversation instead of just the chat list.
            if (callData && callData._receiverReturnChatUserId && !window.__CallsCoreShared.callsState.pendingCallReturnChatUserId) {
                window.__CallsCoreShared.callsState.pendingCallReturnChatUserId = callData._receiverReturnChatUserId;
                window.__CallsCoreShared.callsState.pendingCallReturnChatName = callData._receiverReturnChatName || null;
            }
        } catch (_e) {}

        // ── Multi-tab guard: only the leader tab handles incoming calls ────────
        // Other tabs suppress the UI but keep the call record for history.
        if (typeof window.__CallsCoreShared._isActiveCallTab === 'function' && !window.__CallsCoreShared._isActiveCallTab()) {
            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, '[multi-tab] Suppressing call:incoming — not the active call tab');
            // Notify the call broadcast channel so the leader knows another tab received it
            if (window.__CallsCoreShared._callBroadcast) {
                try { window.__CallsCoreShared._callBroadcast.postMessage({ type: 'CALL_INCOMING_SUPPRESSED', callId: callData && callData.callId, tabId: window.__CallsCoreShared._tabId }); } catch(_e) {}
            }
            return;
        }




        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleIncomingCall', callData);



        console.log('[CallsCore] 📞 RECEIVED incoming call event:', JSON.stringify({



            callId: callData && (callData.callId || callData.id),



            callerName: callData && callData.callerName,



            callType: callData && (callData.callType || callData.type),



            state: window.__CallsCoreShared.currentState



        }));







        // ── FIX: NEVER block incoming calls on parentReady or assertActive.



        // Service worker reloads and delayed handshakes reset lifecycle state.



        // Only hard-block if the module has not started initialising at all.



        const blockedStates = [window.__CallsCoreShared.LifecycleState.BOOT, window.__CallsCoreShared.LifecycleState.INITIALIZING];



        if (blockedStates.includes(window.__CallsCoreShared.currentState)) {



            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, `Incoming call ignored — module not yet initialised (state: ${window.__CallsCoreShared.currentState})`);



            return;



        }







        // Auto-promote: if we have a valid session but lifecycle is still



        // WAIT_PARENT (e.g. after a SW reload), force-promote to ACTIVE so



        // the incoming call is not silently dropped.



        if (window.__CallsCoreShared.currentState !== window.__CallsCoreShared.LifecycleState.ACTIVE) {



            const sess = window.__CallsCoreShared.callsState.session || (window.__CallsCoreShared.CallsStateGovernor && window.__CallsCoreShared.CallsStateGovernor._session);



            if (sess && sess.authenticated) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, `Auto-promoting ${window.__CallsCoreShared.currentState} → ACTIVE to handle incoming call`);



                window.__CallsCoreShared.currentState = window.__CallsCoreShared.LifecycleState.ACTIVE;



            } else {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, `Cannot auto-promote — no valid session (state: ${window.__CallsCoreShared.currentState}). Incoming call dropped.`);



                return;



            }



        }







        // ── DEDUP: ignore duplicate incoming events for the same call ────────



        const incomingId = callData.callId || callData.id;



        if (window.__CallsCoreShared.callsState.activeCallId && window.__CallsCoreShared.callsState.activeCallId === incomingId && window.__CallsCoreShared.callsState.callState === 'incoming') {



            return; // already processing this call



        }







        // CRITICAL: Check for existing GENUINELY active call (not just stale state)



        // Only block if we're actually in a call (in-call state), not idle/ended stale



        if (window.__CallsCoreShared.callsState.callActive && window.__CallsCoreShared.callsState.callState === 'in-call') {
            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Incoming call rejected - already in a call (in-call state)');
            window.__CallsCoreShared.safeSend('CALL_REJECT', {
                callId: callData.callId,
                reason: 'busy',
                timestamp: Date.now()
            }, false);
            return;
        }

        // ── PRIVACY ENFORCEMENT: whoCanCallMe / autoReject ──────────────────
        // FIX: settings.calls.autoReject and settings.privacy/calls.whoCanCallMe
        // were propagated all the way down to this page (as window.AppSettings
        // data and as data-calls-* attributes) but nothing ever actually checked
        // them before letting an incoming call ring through — the settings were
        // cosmetic. We enforce the two cases we can check with certainty here:
        //   - autoReject === true            → reject every incoming call
        //   - whoCanCallMe === 'nobody'       → reject every incoming call
        // The 'friendsOnly' tier is checked separately, below, via an async
        // cross-iframe query — see _enforceFriendsOnlyTier(). Both settings
        // still fail open (no data → call proceeds normally).
        try {
            const _callsCfg = (window.AppSettings && window.AppSettings.get('calls')) || {};
            const _whoCanCall = _callsCfg.whoCanCallMe
                || document.documentElement.getAttribute('data-calls-who-can-call');
            const _autoReject = _callsCfg.autoReject === true
                || document.documentElement.getAttribute('data-calls-auto-reject') === 'true';

            if (_autoReject || _whoCanCall === 'nobody') {
                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Incoming call auto-rejected by privacy setting', { autoReject: _autoReject, whoCanCallMe: _whoCanCall });
                window.__CallsCoreShared.safeSend('CALL_REJECT', {
                    callId: callData.callId,
                    reason: _autoReject ? 'auto_reject_enabled' : 'calls_restricted',
                    timestamp: Date.now()
                }, false);
                return;
            }

            // FIX: 'friendsOnly' tier — query the parent (which holds window.friends)
            // for whether this caller is a friend. Runs in parallel with the call
            // already ringing (no added latency for the common friend-calling case);
            // if the parent confirms the caller is NOT a friend, the call is force-
            // rejected a moment later. Fails open on timeout/error/no data — an
            // unconfirmed friend is allowed through rather than risk blocking a
            // real friend due to a slow or missing parent response.
            if (_whoCanCall === 'friendsOnly' && callData.callerId != null && window.parent && window.parent !== window) {
                window.__CallsCoreShared._enforceFriendsOnlyTier(callData);
            }
        } catch (_privacyErr) {
            // Fail open — never let a settings-read error block a legitimate call
        }


        // If stale state from a previous call, reset it first



        if (window.__CallsCoreShared.callsState.callActive && window.__CallsCoreShared.callsState.callState !== 'in-call') {



            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Resetting stale call state before incoming call');



            window.__CallsCoreShared.callsState.callActive = false;



            window.__CallsCoreShared.callsState.callState = 'idle';



            window.__CallsCoreShared.callsState.activeCallId = null;



        }







        // CRITICAL FIX: Set activeCallId for incoming calls



        
        // FIX-PHASE15: Normalize callerName from all payload shapes.
        // Backend may send: callData.callerName, callData.caller.username,
        // callData.caller.displayName, or callData.fromUserName.
        if (!callData.callerName || callData.callerName === 'Unknown') {
            var _c = callData.caller || {};
            var _first = _c.firstName || '';
            var _last  = _c.lastName  || '';
            var _full  = (_first + (_last ? ' ' + _last : '')).trim();
            callData.callerName = _full
                || _c.displayName || _c.username
                || callData.fromUserName || callData.senderName
                || (callData.callerId ? ('User ' + callData.callerId) : 'Unknown Caller');
        }
        if (!callData.callerAvatar) {
            callData.callerAvatar = (callData.caller && callData.caller.avatar) || null;
        }
        if (!callData.callType && callData.type) callData.callType = callData.type;

        window.__CallsCoreShared.callsState.callData = callData;



        window.__CallsCoreShared.callsState.callState = 'incoming';


        // CALLMANAGER BRIDGE: create CM session for incoming call
        try {
            var _smInc = window.__CallStateMachine;
            var _CSInc = window.CALL_STATE;
            if (_smInc && _CSInc) {
                var _incId = window.__CallsCoreShared.callsState.activeCallId;
                if (_incId && !_smInc.getSession(_incId)) {
                    _smInc.createSession(_incId, (callData && callData.callType) || 'audio', (callData && callData.callerId), false);
                    _smInc.transition(_incId, _CSInc.INCOMING);
                    if (callData && callData.callerName) { var _is = _smInc.getSession(_incId); if(_is) _is.peerName = callData.callerName; }
                }
            }
        } catch(_incBE) {}

        window.__CallsCoreShared.callsState.activeCallId = callData.callId || callData.id || window.__CallsCoreShared.callsState.activeCallId;  // ← CRITICAL: Set activeCallId for incoming calls







        // ── SESSION MANAGER: register incoming session ──────────────────────



        (function _registerIncomingSession() {



            const mgr = window.KynectaCallSession;



            if (!mgr || mgr.isActive) return;



            try {



                mgr.startIncoming({



                    callId:      callData.callId,



                    callerId:    callData.callerId,



                    callType:    callData.callType || callData.type || 'audio',



                    callerName:  callData.callerName,



                    callerAvatar:callData.callerAvatar,



                    isGroupCall: callData.isGroupCall || false



                });



            } catch(e) { console.warn('[CallsCore] Session mgr incoming failed:', e.message); }



        })();







        // ── LOCAL-FIRST: record ringing immediately ─────────────────────────



        (function _saveIncomingLocally() {



            const store = window.KynectaCallLocalStore;



            if (!store) return;



            const id = callData.callId || callData.id;



            if (!id) return;



            store.save({



                id, serverId: id,



                callerId: callData.callerId || null,



                receiverId: window.__CallsCoreShared.callsState.session?.userId || null,



                type: callData.callType || callData.type || 'audio',



                status: 'ringing',



                callerName: callData.callerName || null,



                callerAvatar: callData.callerAvatar || null,



                isLocalOnly: false,



                createdAt: callData.timestamp || Date.now()



            }).catch(() => {});



        })();







        // FIX-PHASE15: Enrich callData before notifying so ALL listeners
        // (calls-ui.js, callOverlay.manager.js, etc.) get callerName populated.
        var _enrichedCall = Object.assign({}, callData, {
            callerName:   callData.callerName   || (callData.caller && (callData.caller.username || callData.caller.displayName)) || ('User ' + callData.callerId),
            callerAvatar: callData.callerAvatar || (callData.caller && callData.caller.avatar) || null,
            callType:     callData.callType     || callData.type || 'audio',
        });
        window.__CallsCoreShared.notifyListeners('incoming_call', _enrichedCall);

        // FIX-CALL-ACK: Emit call:received to backend so caller gets confirmation
        // and the 20-second no-answer timer is cleared on the server side.
        try {
            var _ackSocket = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
            if (_ackSocket && typeof _ackSocket.emit === 'function') {
                _ackSocket.emit('call:received', {
                    callId:   callData.callId || callData.id,
                    callerId: callData.callerId || callData.caller,
                });
                console.log('[CallsCore] ✅ call:received ack sent to server');
            }
        } catch(_ackErr) { console.warn('[CallsCore] call:received ack failed', _ackErr); }
    };



    window.__CallsCoreShared.handleCallInitiated = function handleCallInitiated(callData) {



    window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleCallInitiated', callData);



    



    // Offline fix: backend returned success:false + offline:true



    // Show call UI anyway for 3 minutes with ringtone even if receiver is offline



    if (callData.offline === true || (callData.success === false && callData.offline)) {



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Receiver is offline - showing call UI for 3 minutes', callData);







        // Continue with call flow but mark receiver as offline



        callData.receiverOnline = false;



        callData.success = true; // Force success to show UI



        



        // Show notification that user is offline but continue



        const offlineMsg = callData.error || callData.message || 'User is currently offline. Call will display for 3 minutes.';



        _showCallNotification(offlineMsg, 'info');



        



        // Continue to normal call UI flow below



    }







    // CRITICAL: Check if the call initiation was successful



    if (callData.success === false || callData.error) {



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Call initiation failed, cleaning up', { 



            error: callData.error, 



            callId: callData.callId 



        });



        



        // Clean up the call state



        if (window.__CallsCoreShared.callsState.activeCallId === callData.callId || window.__CallsCoreShared.callsState.callActive) {



            window.__CallsCoreShared.resetCallState();



            window.__CallsCoreShared.callsState.callActive = false;



            window.__CallsCoreShared.callsState.callState = 'idle';



            window.__CallsCoreShared.callsState.activeCallId = null;



            window.__CallsCoreShared.callsState.serverCallId = null;



            window.__CallsCoreShared.callsState.localCallId = null;



        }



        



        // CRITICAL FIX: Restore governor to ACTIVE so next call attempt works



        if (window.__CallsCoreShared.CallsStateGovernor) {



            window.__CallsCoreShared.CallsStateGovernor._transitionLock = false;



            window.__CallsCoreShared.CallsStateGovernor._previousState = window.__CallsCoreShared.CallsStateGovernor._currentState;



            window.__CallsCoreShared.CallsStateGovernor._currentState = window.__CallsCoreShared.CALLS_STATE.ACTIVE;



        }



        



        // Clear any pending invitation timer



        if (window.__CallsCoreShared.callsState.callInvitationTimer) {



            clearTimeout(window.__CallsCoreShared.callsState.callInvitationTimer);



            window.__CallsCoreShared.callsState.callInvitationTimer = null;



        }



        



        // Notify UI of failure



        window.__CallsCoreShared.notifyListeners('call_initiation_failed', { 



            callId: callData.callId, 



            error: callData.error || 'Call initiation failed'



        });



        



        // Show error notification



        _showCallNotification(callData.error || 'Failed to start call', 'error');



        return;



    }



    



    // Success path — callData.callId is the real server UUID from /calls/start



    window.__CallsCoreShared.callsState.callData = callData;



    window.__CallsCoreShared.callsState.callState = 'initiated';



    // If server returned a real UUID (not our local call_ string), use it



    const serverCallId = callData.callId || callData.id || callData.serverCallId;



    const localCallId = callData.localCallId || window.__CallsCoreShared.callsState.activeCallId;



    window.__CallsCoreShared.callsState.activeCallId = serverCallId || localCallId;



    window.__CallsCoreShared.callsState.localCallId = localCallId;   // keep local id for reference



    window.__CallsCoreShared.callsState.serverCallId = serverCallId; // real DB UUID







    // ── SESSION MANAGER: link server ID ──────────────────────────────────



    (function _linkServerId() {



        const mgr = window.KynectaCallSession;



        if (mgr && mgr.isActive && serverCallId) mgr.setServerCallId(serverCallId);



        // Also link in local store



        const store = window.KynectaCallLocalStore;



        if (store && localCallId && serverCallId && localCallId !== serverCallId) {



            store.linkServerId(localCallId, serverCallId).catch(() => {});



        }



    })();



    window.__CallsCoreShared.callsState.callParticipants = callData.participants || callData.call?.participants || [];



    window.__CallsCoreShared.callsState.callStartTime = Date.now();



    window.__CallsCoreShared.callsState.callType = callData.callType || callData.call?.type;



    window.__CallsCoreShared.callsState.callActive = true;



    



    if (window.__CallsCoreShared.callsState.callInvitationTimer) {



        clearTimeout(window.__CallsCoreShared.callsState.callInvitationTimer);



        window.__CallsCoreShared.callsState.callInvitationTimer = null;



    }



    



    window.__CallsCoreShared.notifyListeners('call_initiated', callData);



    



    // Show success notification


    // FIX-NAME: resolve callee display name for the calling screen.
    // Server returns callerName (our own name), not the callee's name.
    // Read from UIState.pendingCallUser (set by calls-ui.js before initiation)
    // or from window.__activePeerName (set by __dispatchCallToIframe in chat.html
    // frame — but that is the parent frame's window, so read it via sessionStorage
    // which IS shared between parent and iframe on same origin).
    let _resolvedCalleeName = callData.calleeName
        || (window.callsUI && window.callsUI.UIState && window.callsUI.UIState.pendingCallUser && window.callsUI.UIState.pendingCallUser.userName) // FIX: was window.UIState (never assigned)
        || window.__activePeerName;
    // sessionStorage is same-origin shared across frames
    if (!_resolvedCalleeName) {
        try {
            const _pendingCall = JSON.parse(sessionStorage.getItem('pending_call') || '{}');
            _resolvedCalleeName = _pendingCall.userName || _pendingCall.name || '';
        } catch(_) {}
    }
    _resolvedCalleeName = _resolvedCalleeName || 'User';
    // Update calling screen name element if it still shows a placeholder
    try {
        ['callingName','callingContactName'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el && (!el.textContent || el.textContent === 'User' || el.textContent === 'Calling...' || el.textContent === '')) {
                el.textContent = _resolvedCalleeName;
            }
        });
    } catch(_ne) {}
    window.__activePeerName = _resolvedCalleeName;
    _showCallNotification(`${callData.callType === 'video' ? 'Video' : 'Voice'} call started with ${_resolvedCalleeName}`, 'success');



};







    window.__CallsCoreShared.handleCallAccepted = function handleCallAccepted(callData) {

        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleCallAccepted', callData);

        const acceptedCallId = callData && (callData.callId || callData.id);

        // FIX: this event reaches handleCallAccepted through two independent
        // listener pipelines (the CALL_EVENT_MAP DOM-event bridge just below
        // — 'kyn:call_accepted' / 'kyn:call:accepted' / 'kyn:call_answered'
        // — AND _bindRealtime()'s direct 'call_accepted' / 'call:accepted' /
        // 'call_answered' socket.io bindings further down). A single real
        // acceptance from the server can therefore invoke this function
        // twice. What follows is NOT safe to run twice in a row on the same
        // RTCPeerConnection — in particular WebRTCManager.createOffer() +
        // setLocalDescription() on the caller side. The second attempt fails
        // while the first negotiation is still in flight and takes the
        // connection down with it, which is what made calls die right after
        // being accepted instead of staying connected (in-call screen
        // briefly shown, then caller goes dark / receiver drops to idle).
        // Once acceptance for a given callId has been processed once, treat
        // any further delivery of the same event as a duplicate and no-op.
        if (acceptedCallId && window.__CallsCoreShared.callsState._acceptedCallIds && window.__CallsCoreShared.callsState._acceptedCallIds.has(acceptedCallId)) {
            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleCallAccepted: duplicate delivery for already-accepted call, ignoring', acceptedCallId);
            return;
        }
        if (!window.__CallsCoreShared.callsState._acceptedCallIds) window.__CallsCoreShared.callsState._acceptedCallIds = new Set();
        if (acceptedCallId) window.__CallsCoreShared.callsState._acceptedCallIds.add(acceptedCallId);

        // FIX-ACCEPT-BEFORE-ACK-RACE: if the receiver accepts fast enough
        // that this event arrives before call:initiated_ack has come back
        // (handleCallInitiatedAck is what normally aliases the caller's
        // pre-ack local id to the server's real UUID), callsState has no
        // server-confirmed id yet at all. The comment above assumed
        // resolveCallId() already covered this — it doesn't: there's no
        // alias to resolve through until the ack actually runs, so the raw
        // local id and the incoming server id compare as different strings
        // and _isStaleCallEvent below would wrongly call this "a different/
        // previous call" and drop it, even though it's plainly this call's
        // own first (and only) accept. When there's no server-confirmed id
        // yet, treat this accept as the ack itself — do the same
        // reconciliation handleCallInitiatedAck would have done — rather
        // than rejecting a legitimately-first accept.
        if (acceptedCallId && !window.__CallsCoreShared.callsState.serverCallId) {
            const _priorLocalId = window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.localCallId;
            if (!window.__CallsCoreShared.callsState._callIdAliases) window.__CallsCoreShared.callsState._callIdAliases = new Map();
            if (_priorLocalId && _priorLocalId !== acceptedCallId) {
                window.__CallsCoreShared.callsState._callIdAliases.set(_priorLocalId, acceptedCallId);
            }
            window.__CallsCoreShared.callsState._callIdAliases.set(acceptedCallId, acceptedCallId);
            window.__CallsCoreShared.callsState.serverCallId = acceptedCallId;
            try {
                if (typeof window.__CallsCoreShared.WebRTCManager !== 'undefined' && window.__CallsCoreShared.WebRTCManager && window.__CallsCoreShared.WebRTCManager._currentCallId && window.__CallsCoreShared.WebRTCManager._currentCallId !== acceptedCallId) {
                    window.__CallsCoreShared.WebRTCManager._currentCallId = acceptedCallId;
                }
            } catch (_) {}
        }

        // FIX-CALLID-RECONCILE (Phase 2): the dedup check above only catches
        // a duplicate delivery of the SAME accept event for the call
        // already being tracked. It does not catch a late-arriving accept
        // for a DIFFERENT, earlier call attempt (e.g. a quick redial after
        // no answer) arriving after a new call has already started —
        // that case would fall through to the assignment below and
        // overwrite callsState.activeCallId with the WRONG call's id,
        // hijacking tracking away from the genuinely active call for the
        // rest of its lifetime. Uses the same resolveCallId()-aware
        // staleness check as handleCallEnded/handleCallConnected so a
        // legitimate first accept (where activeCallId is still the
        // pre-ack local id) is correctly recognized as the same call, not
        // rejected as stale.
        if (typeof window.__CallsCoreShared._isStaleCallEvent === 'function' && window.__CallsCoreShared._isStaleCallEvent(callData)) {
            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleCallAccepted: ignoring stale accept for a different/previous call', acceptedCallId);
            return;
        }

        if (acceptedCallId) {
            window.__CallsCoreShared.callsState.activeCallId = acceptedCallId;
            window.__CallsCoreShared.callsState.serverCallId = window.__CallsCoreShared.callsState.serverCallId || acceptedCallId;
        }
        if (callData && (callData.callType || callData.type)) {
            window.__CallsCoreShared.callsState.callType = callData.callType || callData.type;
        }
        window.__CallsCoreShared.callsState.callState = 'connecting';
        window.__CallsCoreShared.callsState.callActive = true;

        // FIX-PREMATURE-45S-END-WHILE-RINGING (caller side): the connection
        // timeout used to be armed the instant the caller started dialing,
        // which cut calls off after 45s of ringing instead of the intended
        // 3-minute window. It belongs here instead — now that the receiver
        // has actually accepted, give ICE/media negotiation a bounded window
        // to complete. window.__callReceiverAccepted (set by the UI layer
        // when it processes this same acceptance) keeps this timer from
        // firing once negotiation succeeds and the call is genuinely in-call.
        try {
            if (window.__CallsCoreShared.WebRTCManager && typeof window.__CallsCoreShared.WebRTCManager.setConnectionTimeout === 'function') {
                window.__CallsCoreShared.WebRTCManager.setConnectionTimeout(window.__CallsCoreShared.CONFIG.CALL_CONNECTION_TIMEOUT);
            }
        } catch (_) {}

        window.__CallsCoreShared.notifyListeners('call_accepted', callData);







        // ── CRITICAL FIX: Start WebRTC negotiation ──────────────────────────



        // The caller must create and send an SDP offer immediately after the



        // receiver accepts. Without this, WebRTC never connects → no audio.



        // Only the CALLER side creates the offer (not the receiver).



        // ✅ FIX: Use multiple sources for currentUserId
        const currentUserId = (window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.callsState.session.userId)
            || (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.userId)
            || (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.user && window.__CHILD_SESSION__.user.id)
            || null;

        // ✅ FIX: isCaller with robust fallbacks
        const _isCallerByUserId = !!(currentUserId && callData && callData.callerId &&
            String(callData.callerId) === String(currentUserId));
        const _isCallerByState  = !!(window.__CallsCoreShared.callsState._isCaller === true);
        const _isCallerByInit   = !!(window.__callerCallId && callData &&
            (callData.callId || callData.id) &&
            String(window.__callerCallId) === String(callData.callId || callData.id));
        const isCaller = _isCallerByUserId || _isCallerByState || _isCallerByInit;

        console.log('[CallsCore] isCaller:', { isCaller, currentUserId, callerId: callData && callData.callerId });







        if (!isCaller) {



            console.log('[CallsCore] ℹ️ CALL ACCEPTED received on receiver side — waiting for caller offer');

            // C-08 FIX: For GROUP calls the receiver also needs to join the
            // signaling mesh immediately on accept, because the caller-side
            // 1:1 WebRTCManager path only opens one connection (to the first
            // acceptor). GroupCallEngine.joinGroupCall() builds the N-way mesh
            // correctly for every participant regardless of caller/callee role.
            if (callData && (callData.isGroupCall || callData.type === 'group')) {
                const _gce = window.__GroupCallEngine || window.GroupCall;
                if (_gce && typeof _gce.joinGroupCall === 'function') {
                    const _gcCallId   = callData.callId || window.__CallsCoreShared.callsState.activeCallId;
                    const _gcGroupId  = callData.groupId || _gcCallId;
                    const _gcLocalUid = String(
                        (window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.callsState.session.userId) ||
                        (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.userId) || ''
                    );
                    if (_gcCallId && _gcLocalUid) {
                        console.log('[CallsCore] 🔀 GROUP CALL — receiver joining mesh via GroupCallEngine', _gcCallId);
                        _gce.joinGroupCall(_gcGroupId, _gcCallId, _gcLocalUid, {
                            callType: callData.callType || callData.type || 'audio',
                            // FIX-HOST-ONLY-END: only the call's original caller may end a
                            // group call for everyone (mute/remove already gated the same
                            // way). The receiver here is by definition never the host.
                            isHost: false,
                        }).catch(function(e) {
                            console.warn('[CallsCore] GroupCallEngine.joinGroupCall (receiver) failed:', e.message);
                        });
                    }
                }
            }

            return;



        }



        // C-08 FIX (CALLER SIDE): when this is a group call, the caller must
        // join the mesh engine rather than opening a single 1:1 WebRTC
        // connection. Previously every group call fell through to
        // WebRTCManager.createOffer() which only opens one PeerConnection
        // (to whoever accepted first) and ignores all other participants.
        // GroupCallEngine.joinGroupCall() builds the correct N-way mesh.
        if (callData && (callData.isGroupCall || callData.type === 'group') && isCaller) {
            var _gce2 = window.__GroupCallEngine || window.GroupCall;
            if (_gce2 && typeof _gce2.joinGroupCall === 'function') {
                var _gcCallId2   = callData.callId || window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.serverCallId;
                var _gcGroupId2  = callData.groupId || _gcCallId2;
                var _gcLocalUid2 = String(currentUserId || '');
                if (_gcCallId2 && _gcLocalUid2) {
                    console.log('[CallsCore] 🔀 GROUP CALL — caller joining mesh via GroupCallEngine', _gcCallId2);
                    _gce2.joinGroupCall(_gcGroupId2, _gcCallId2, _gcLocalUid2, {
                        callType: callData.callType || callData.type || 'audio',
                        // FIX-HOST-ONLY-END: the caller/initiator is the call's host —
                        // matches the backend's isHost(callId, userId) check, which is
                        // keyed off the same callerId recorded at call:initiate time.
                        isHost: true,
                    }).catch(function(e) {
                        console.warn('[CallsCore] GroupCallEngine.joinGroupCall (caller) failed:', e.message);
                    });
                    return; // GroupCallEngine handles all WebRTC from here
                }
            }
            // GroupCallEngine not available — fall through to single-peer path
            // (degraded but better than silent failure)
            console.warn('[CallsCore] GroupCallEngine not available for group call — degrading to single-peer');
        }

        if (window.__CallsCoreShared.WebRTCManager._peerConnection && window.__CallsCoreShared.callsState.callActive) {

            console.log('[CallsCore] ✅ CALL ACCEPTED — creating SDP offer for WebRTC');

            // FIX: Resolve the target user (receiver) for the offer.
            // callsState.activeCall.participants[0] is set when startCall() is called.
            // Also check callData fields as fallback.
            var _resolveOfferTarget = function() {
                if (window.__CallsCoreShared.callsState.activeCall && window.__CallsCoreShared.callsState.activeCall.participants && window.__CallsCoreShared.callsState.activeCall.participants.length > 0) {
                    var p = window.__CallsCoreShared.callsState.activeCall.participants[0];
                    return typeof p === 'object' ? (p.id || p.userId) : p;
                }
                return callData && (callData.receiverId || callData.calleeId || callData.targetUserId || callData.remoteUserId) || null;
            };

            window.__CallsCoreShared.WebRTCManager.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })



                .then(function(offer) {

                    const callId = window.__CallsCoreShared.callsState.serverCallId || window.__CallsCoreShared.callsState.activeCallId || (callData && callData.callId);

                    // FIX: targetUserId MUST be in the payload — backend silently drops offer if missing.
                    // Resolve from participants (set at startCall) or callData fields.
                    var _resolvedTarget = (function() {
                        if (window.__CallsCoreShared.callsState.activeCall && window.__CallsCoreShared.callsState.activeCall.participants && window.__CallsCoreShared.callsState.activeCall.participants.length > 0) {
                            var p = window.__CallsCoreShared.callsState.activeCall.participants[0];
                            return typeof p === 'object' ? (p.id || p.userId) : p;
                        }
                        return (callData && (callData.receiverId || callData.calleeId || callData.targetUserId || callData.remoteUserId)) || null;
                    })();

                    var _offerPayload = {
                        callId: callId,
                        offer: offer,
                        targetUserId: _resolvedTarget,
                        remoteUserId: _resolvedTarget,
                        timestamp: Date.now()
                    };
                    // FIX-DUP-SIGNAL-DELIVERY (offer): this used to ALWAYS postMessage
                    // the offer to the parent (chat.html), which independently relays
                    // it onward via its own 'call:webrtc_offer'/'webrtc:signal' socket
                    // emits, AND THEN separately emit 'call:webrtc_offer' again directly
                    // over this frame's own socket below — delivering the same SDP
                    // offer to the receiver 2-3 times over different event names. Each
                    // extra delivery re-enters handleSignalOffer on the receiver and,
                    // even though a same-call/same-length dedup guard exists there,
                    // corrupts the receiver's negotiation state often enough that its
                    // ontrack never routes real remote audio/video (both sides end up
                    // seeing only local video). Deliver via exactly ONE path: prefer the
                    // direct Socket.IO emit (lowest latency, has delivery ack/retry);
                    // fall back to the postMessage→chat.html relay only when no direct
                    // socket is available.
                    var _directSocket = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
                    var _offerId = callId;
                    var _offTarget = _resolvedTarget;
                    if (_directSocket && typeof _directSocket.emit === 'function' && _offTarget) {
                        // FIX-SIGNALING-ACK (Phase 20): the offer is the single
                        // most critical signaling message — if it's lost (e.g.
                        // the target's socket had just dropped and hadn't been
                        // pruned server-side yet), the call never connects at
                        // all with no recovery. This was previously a bare
                        // fire-and-forget emit with zero delivery confirmation.
                        // Now retries (capped) if the server doesn't ack
                        // delivery, and bails out early if this call is no
                        // longer the one actually active (already connected via
                        // a parallel path, or already ended/cancelled) so a
                        // stale retry can't disrupt a call that's since moved on.
                        (function sendOfferWithRetry(attempt) {
                            var _acked = false;
                            var _payload = { callId: _offerId, targetUserId: _offTarget, offer: offer };
                            _directSocket.emit('call:webrtc_offer', _payload, function(ackResp) {
                                _acked = true;
                                if (ackResp && ackResp.delivered) {
                                    window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'Offer delivery confirmed by server', { callId: _offerId, attempt: attempt });
                                }
                            });
                            setTimeout(function() {
                                if (_acked) return;
                                var stillRelevant = typeof window.__CallsCoreShared._isStaleCallEvent !== 'function' || !window.__CallsCoreShared._isStaleCallEvent({ callId: _offerId });
                                // FIX-SIGNALING-ACK: don't retry into an already-connected
                                // call. An ack can go missing (network blip on the way
                                // back) even though the offer itself was delivered and
                                // the call proceeded to connect fine — resending in that
                                // case would hit setRemoteDescription('offer') on an
                                // already-stable peer connection and break it, per the
                                // documented InvalidStateError failure mode elsewhere in
                                // this file (see handleSignalOffer's duplicate-delivery fix).
                                var alreadyConnected = window.__CallsCoreShared.callsState.callState === 'connected' || window.__CallsCoreShared.callsState.callState === 'in-call';
                                if (!stillRelevant || alreadyConnected) {
                                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Offer ack timeout — not retrying (call no longer pending)', { callId: _offerId, state: window.__CallsCoreShared.callsState.callState });
                                    return;
                                }
                                if (attempt < 3) {
                                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, `Offer ack timeout — retrying (attempt ${attempt + 1}/3)`, _offerId);
                                    sendOfferWithRetry(attempt + 1);
                                } else {
                                    window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Offer delivery failed after 3 attempts — target may be unreachable', null, { callId: _offerId });
                                }
                            }, 3000);
                        })(1);
                        console.log('[CallsCore] ✅ OFFER sent via Socket.IO to targetUserId:', _offTarget);
                    } else {
                        window.__CallsCoreShared.safeSend('SIGNAL_OFFER', _offerPayload, false);
                        console.log('[CallsCore] ✅ OFFER sent via safeSend (no direct socket). targetUserId:', _offTarget);
                    }



                })



                .catch(function(e) {



                    window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'createOffer failed after call_accepted', e);



                });



        } else {



            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleCallAccepted: no peer connection — offer NOT sent', {



                hasPeerConn: !!window.__CallsCoreShared.WebRTCManager._peerConnection,



                callActive:  window.__CallsCoreShared.callsState.callActive



            });



        }



    };



    



    window.__CallsCoreShared.handleCallStarted = function handleCallStarted(callData) {
            // SCREEN MANAGER: switch to calling screen
            if (typeof window.showScreen === "function") { window.showScreen("calling"); }
            var __ov = document.getElementById("callOverlay"); if (__ov) __ov.setAttribute("data-state", "idle");



        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleCallStarted', callData);



        



        window.__CallsCoreShared.callsState.callState = 'starting';



        window.__CallsCoreShared.notifyListeners('call_started', callData);



    };



    



    window.__CallsCoreShared.handleCallConnected = function handleCallConnected(callData) {
            // FIX: dedup, mirroring the same protection already on
            // handleCallAccepted (callsState._acceptedCallIds). This file has
            // multiple independent delivery paths for the same logical event
            // (two separate window 'message' listeners, plus the
            // oniceconnectionstatechange handler, each capable of reaching
            // handleCallConnected for the same call) and nothing here stopped
            // a second/third delivery from re-running this function's side
            // effects for a call that was already marked connected.
            var __connectedId = (callData && (callData.callId || callData.id)) || window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.serverCallId || window.__CallsCoreShared.callsState.localCallId;
            var __resolveConn = (typeof window.__CallsCoreShared.resolveCallId === 'function') ? window.__CallsCoreShared.resolveCallId : function(x){ return x; };
            if (__connectedId) __connectedId = __resolveConn(__connectedId);
            if (__connectedId && window.__CallsCoreShared.callsState._connectedCallIds && window.__CallsCoreShared.callsState._connectedCallIds.has(__connectedId)) {
                window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleCallConnected: duplicate delivery ignored', __connectedId);
                return;
            }
            if (!window.__CallsCoreShared.callsState._connectedCallIds) window.__CallsCoreShared.callsState._connectedCallIds = new Set();
            if (__connectedId) window.__CallsCoreShared.callsState._connectedCallIds.add(__connectedId);

            // SCREEN MANAGER: switch to in-call screen
            if (typeof window.showScreen === "function") { window.showScreen("in-call"); }
            var __ov = document.getElementById("callOverlay"); if (__ov) __ov.setAttribute("data-state", "idle");



        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleCallConnected', callData);



        



        window.__CallsCoreShared.callsState.callState = 'connected';

        // FIX-ROOT-CAUSE-45S-FORCE-END (completing the fix described on
        // WebRTCManager.clearConnectionTimeout): explicitly cancel the
        // connection timer now that the call is genuinely connected, rather
        // than only relying on the reactive callState check inside the timer
        // callback — that check runs at the exact moment the timer fires and
        // can miss a transient state reset. This was defined but never
        // actually invoked anywhere in the codebase.
        try {
            if (window.__CallsCoreShared.WebRTCManager && typeof window.__CallsCoreShared.WebRTCManager.clearConnectionTimeout === 'function') {
                window.__CallsCoreShared.WebRTCManager.clearConnectionTimeout();
            }
        } catch (_) {}



        window.__CallsCoreShared.callsState.callActive = true;



        window.__CallsCoreShared.callsState.callStartTime = window.__CallsCoreShared.callsState.callStartTime || Date.now();

        // CALLMANAGER BRIDGE: delegate connected event so CM owns the timer
        try {
            var _cm2 = window.__CallManager;
            var _sm2 = window.__CallStateMachine;
            var _CS2 = window.CALL_STATE;
            if (_cm2 && _sm2 && _CS2) {
                var _cid2 = window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.serverCallId || window.__CallsCoreShared.callsState.localCallId;
                if (_cid2) {
                    if (!_sm2.getSession(_cid2)) {
                        _sm2.createSession(_cid2, window.__CallsCoreShared.callsState.callType || 'audio', (window.__CallsCoreShared.callsState.callParticipants && window.__CallsCoreShared.callsState.callParticipants[0]) || (window.__CallsCoreShared.callsState.callData && window.__CallsCoreShared.callsState.callData.callerId) || null, !!window.__CallsCoreShared.callsState._isCaller);
                        _sm2.transition(_cid2, _CS2.OUTGOING);
                        _sm2.transition(_cid2, _CS2.CONNECTING);
                    }
                    var _isVid2 = !!(window.__CallsCoreShared.callsState.callType === 'video');
                    _cm2.onConnected(_cid2, _isVid2);
                    window.__CallsCoreShared._cmTimerDelegated = true;
                }
            }
        } catch(_be2) {}







        // ── SESSION MANAGER: mark connected ──────────────────────────────────



        const mgr = window.KynectaCallSession;



        if (mgr && mgr.isActive) mgr.markConnected();







        // ── LOCAL-FIRST: update status to connected ───────────────────────────



        (function _markConnectedLocally() {



            const store = window.KynectaCallLocalStore;



            if (!store) return;



            const id = callData.callId || window.__CallsCoreShared.callsState.activeCallId;



            if (!id) return;



            store.updateStatus(id, 'connected').catch(() => {});



        })();







        window.__CallsCoreShared.notifyListeners('call_connected', callData);



    };



    



    // FIX-MULTI-DEVICE-RING: the backend (CallSignalingService, see FEAT-02)
    // already emits 'call:accepted_elsewhere' to every OTHER socket of a user
    // when one of their devices accepts an incoming call — but calls-core.js's
    // _bindRealtime() RT_MAP never listened for it, so a second device (another
    // tab, phone + laptop, etc.) kept ringing indefinitely after the call was
    // answered elsewhere. resetCallState() only clears local state — it does
    // not emit any reject/end signal to the server — so calling it here is
    // safe: the server already knows the call was accepted on the other device.
    window.__CallsCoreShared.handleCallAcceptedElsewhere = function handleCallAcceptedElsewhere(callData) {

        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleCallAcceptedElsewhere', callData);

        // FIX-CALLID-RECONCILE (Phase 2): added retroactively — this handler
        // was modeled on the (at-the-time-also-unguarded) handleCallRejected
        // and inherited the same gap. A stale accepted_elsewhere for a
        // previous ring shouldn't be able to tear down a newer active call.
        if (typeof window.__CallsCoreShared._isStaleCallEvent === 'function' && window.__CallsCoreShared._isStaleCallEvent(callData)) {
            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleCallAcceptedElsewhere: ignoring stale event for a different/previous call', callData && (callData.callId || callData.id));
            return;
        }

        window.__CallsCoreShared.resetCallState();

        window.__CallsCoreShared.notifyListeners('call_accepted_elsewhere', callData);

    };

    window.__CallsCoreShared.handleCallRejected = function handleCallRejected(callData) {

        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleCallRejected', callData);

        // FIX-CALLID-RECONCILE (Phase 2): this handler had no staleness/
        // callId-match check at all, unlike its sibling handlers
        // (handleCallEnded, handleCallConnected, handleCallFailed) which all
        // guard via _isStaleCallEvent(). A stale/duplicate call:rejected
        // event -- e.g. left over from a quick redial after a previous
        // attempt was declined, or a duplicate delivery racing a newer,
        // already-connected call -- would unconditionally call
        // resetCallState(), tearing down a perfectly healthy different call.
        if (typeof window.__CallsCoreShared._isStaleCallEvent === 'function' && window.__CallsCoreShared._isStaleCallEvent(callData)) {
            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleCallRejected: ignoring stale event for a different/previous call', callData && (callData.callId || callData.id));
            return;
        }

        window.__CallsCoreShared.resetCallState();

        window.__CallsCoreShared.notifyListeners('call_rejected', callData);

    };



    



    window.__CallsCoreShared.handleCallEnded = function handleCallEnded(callData) {
            // FIX: validate this event actually belongs to the call that's
            // currently active before doing ANY teardown. Previously this ran
            // unconditionally — stopping local media tracks and forcing the
            // idle screen — for ANY CALL_ENDED delivery regardless of which
            // call it was for. Combined with the local-id/server-uuid mismatch
            // (see handleCallInitiatedAck/resolveCallId above) and this file's
            // multiple redundant message-listener paths, a stale or
            // differently-tagged event could kill a different, currently
            // healthy, already-connected call. Mirrors the same guard already
            // added to calls-ui.js's handleCallEnded (UIState layer).
            var __endedIncomingId = callData && (callData.callId || callData.id);
            if (__endedIncomingId) {
                var __endedCurrentId = (window.callsState && (window.callsState.activeCallId || window.callsState.serverCallId || window.callsState.localCallId)) || null;
                if (__endedCurrentId) {
                    var __resolveId = (typeof window.__CallsCoreShared.resolveCallId === 'function') ? window.__CallsCoreShared.resolveCallId : function(x){ return x; };
                    if (String(__resolveId(__endedIncomingId)) !== String(__resolveId(__endedCurrentId))) {
                        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleCallEnded: ignoring stale event for a different/previous call', __endedIncomingId, __endedCurrentId);
                        // FIX-STALE-END-SAFETY-NET: don't tear down media/session state
                        // for what might genuinely be a different, still-healthy call —
                        // but don't just trust that assumption forever either. If this
                        // guard is wrong (e.g. a resolveCallId format gap rather than an
                        // actual different call), nothing else will ever send
                        // POST_CALL_RESTORE, and whichever side received this event is
                        // stuck on the call screen with no way back. Check again shortly;
                        // if the call screen is STILL showing active with no other
                        // cleanup having happened, treat it as this call's real end after
                        // all and run the safe, idempotent nav-restore (not the media/
                        // session teardown above it).
                        var __staleCallIdAtCheck = __endedCurrentId;
                        setTimeout(function() {
                            var __stillSameCall = window.callsState &&
                                String((window.callsState.activeCallId || window.callsState.serverCallId || window.callsState.localCallId) || '') === String(__staleCallIdAtCheck);
                            var __screenStillActive = window.callsUI && window.callsUI.UIState && window.callsUI.UIState.callActive;
                            if (__stillSameCall && __screenStillActive) {
                                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleCallEnded: stale-echo guard was likely a false positive (call still stuck active) — running nav-restore safety net for', __staleCallIdAtCheck);
                                try {
                                    if (window.parent && window.parent !== window) {
                                        window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: (window.callsState.pendingCallReturnTo || window.callsState.pendingCallSource) || 'conversations', chatUserId: window.callsState.pendingCallReturnChatUserId || null, chatUserName: window.callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
                                    }
                                } catch (_e) {}
                            }
                        }, 4000);
                        return;
                    }
                }
            }

            // FIX: resilience check against premature/spurious call-end signals.
            // Several backend and client paths can emit an end/force-end event
            // for reasons that are administrative guesses rather than an
            // explicit hangup (e.g. 'stale_cleanup', 'timeout', 'no_answer') —
            // if one of those arrives within a few seconds of the connection
            // actually going live (ICE connected/completed) and media is
            // STILL live right now, this is almost certainly a false positive
            // racing the real connection rather than a genuine end. Re-check
            // once, shortly, instead of tearing down immediately; only proceed
            // with teardown if the connection has actually gone away by then.
            // Explicit user actions (declined/rejected/ended/hangup/busy) are
            // never delayed — those are always trusted immediately.
            var _deferredSuspiciousEnd = (function () {
                var _reason = (callData && callData.reason) || '';
                var _explicitReasons = ['declined', 'rejected', 'ended', 'user_ended', 'hangup', 'busy', 'cancelled', 'accepted_elsewhere', 'auto_reject_enabled', 'calls_restricted'];
                var _isAmbiguous = _reason && _explicitReasons.indexOf(_reason) === -1;
                var _connectedAt = window.__CallsCoreShared.callsState._iceConnectedAt;
                var _sinceConnected = _connectedAt ? (Date.now() - _connectedAt) : Infinity;
                var _pc = window.__CallsCoreShared.WebRTCManager && window.__CallsCoreShared.WebRTCManager._peerConnection;
                var _iceState = _pc && _pc.iceConnectionState;
                var _stillLiveNow = _iceState === 'connected' || _iceState === 'completed';

                if (_isAmbiguous && _connectedAt && _sinceConnected < 8000 && _stillLiveNow) {
                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE,
                        'handleCallEnded: suspicious end signal (' + _reason + ') arrived ' + _sinceConnected +
                        'ms after connect while media is still live — verifying before teardown', callData);
                    setTimeout(function () {
                        var _pc2 = window.__CallsCoreShared.WebRTCManager && window.__CallsCoreShared.WebRTCManager._peerConnection;
                        var _iceState2 = _pc2 && _pc2.iceConnectionState;
                        var _stillLive2 = _iceState2 === 'connected' || _iceState2 === 'completed';
                        if (_stillLive2) {
                            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE,
                                'handleCallEnded: suspicious end signal ignored — connection is still live', callData);
                        } else {
                            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE,
                                'handleCallEnded: connection genuinely gone on re-check — proceeding with teardown', callData);
                            // Re-run this same handler; _iceConnectedAt guard above is skipped
                            // this time because _stillLiveNow will now be false, so it falls
                            // straight through to the real teardown below.
                            window.__CallsCoreShared.handleCallEnded(callData);
                        }
                    }, 1500);
                    return true;
                }
                return false;
            })();
            if (_deferredSuspiciousEnd) { return; }

            // FIX-020: Guaranteed ringtone stop — must run BEFORE anything else
            // to prevent ringtone looping when UI reset path fails
            try {
                if (window._incomingRingtone) {
                    window._incomingRingtone.pause();
                    window._incomingRingtone.currentTime = 0;
                    window._incomingRingtone = null;
                }
                if (window._callerRingtone) {
                    window._callerRingtone.pause();
                    window._callerRingtone.currentTime = 0;
                    window._callerRingtone = null;
                }
                if (window._callRingTimer)    { clearInterval(window._callRingTimer);    window._callRingTimer    = null; }
                if (window._outgoingRingTimer) { clearInterval(window._outgoingRingTimer); window._outgoingRingTimer = null; }
                // Also stop any HTMLAudioElement playing call tones
                document.querySelectorAll('audio[data-call-tone]').forEach(function(a) {
                    try { a.pause(); a.currentTime = 0; } catch(_) {}
                });
            } catch(_) {}

            // SCREEN MANAGER: call ended — go idle then navigate back
            if (typeof window.showScreen === "function") { window.showScreen("idle"); }
            var __ov2 = document.getElementById("callOverlay"); if (__ov2) __ov2.setAttribute("data-state", "idle");
            // Stop all media tracks immediately on call end
            // FIX: was window.UIState (never assigned) — real path is window.callsUI.UIState
            if (window.callsUI && window.callsUI.UIState && window.callsUI.UIState.localStream) {
                try { window.callsUI.UIState.localStream.getTracks().forEach(function(t) { t.stop(); }); } catch(e) {}
                window.callsUI.UIState.localStream = null;
            }
            // Clear caller flag on call end
            if (window.callsState) window.callsState._isCaller = false;
            window.__callerCallId = null;



        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleCallEnded', callData);







        // ── SESSION MANAGER: end session ─────────────────────────────────────



        (function _endSession() {



            const mgr = window.KynectaCallSession;



            if (mgr && mgr.isActive) {



                const status = callData.status || 'ended';



                mgr.end(status);



            }



        })();







        // ── LOCAL-FIRST: finalize local history record ──────────────────────



        (function _finalizeLocally() {



            const store = window.KynectaCallLocalStore;



            if (!store) return;



            const id = callData.callId || window.__CallsCoreShared.callsState.activeCallId;



            if (!id) return;



            const status = callData.status || 'ended';



            const duration = callData.duration || 



                (window.__CallsCoreShared.callsState.callStartTime ? Math.floor((Date.now() - window.__CallsCoreShared.callsState.callStartTime) / 1000) : 0);



            store.updateStatus(id, status, { duration, endedAt: Date.now() }).catch(() => {});



        })();



        



        // ── FIX: This is the remote-hangup path (other party ended the call via
        // WebSocket). The comment above said "go idle then navigate back" but
        // resetCallState() wiped pendingCallReturnTo without ever telling the
        // parent to navigate — so whichever side received this event (caller
        // if receiver hung up, or vice versa) was left stuck on the call screen.
        var _hceReturnTarget = (window.__CallsCoreShared.callsState && (window.__CallsCoreShared.callsState.pendingCallReturnTo || window.__CallsCoreShared.callsState.pendingCallSource)) || 'conversations';

        window.__CallsCoreShared.resetCallState();

        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _hceReturnTarget, chatUserId: window.__CallsCoreShared.callsState.pendingCallReturnChatUserId || null, chatUserName: window.__CallsCoreShared.callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
            }
        } catch (_e) {}

        window.__CallsCoreShared.notifyListeners('call_ended', callData);



    };



    



// ADD THIS FUNCTION RIGHT AFTER handleCallEnded



window.__CallsCoreShared.handleCallForceEnd = function handleCallForceEnd(callData) {



    window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'Force ending call', callData);

    // FIX-CALLID-RECONCILE (Phase 2): both real-world triggers for this
    // function (CALL_CANCELLED, CALL_FORCE_END) carry a specific callId and
    // should be validated like every other terminal event -- a stale
    // force-end/cancel for an old call attempt shouldn't be able to nuke a
    // newer, genuinely active call's state.
    if (typeof window.__CallsCoreShared._isStaleCallEvent === 'function' && window.__CallsCoreShared._isStaleCallEvent(callData)) {
        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleCallForceEnd: ignoring stale event for a different/previous call', callData && (callData.callId || callData.id));
        return;
    }




    



    // Immediately reset all call state



    window.__CallsCoreShared.resetCallState();



    window.__CallsCoreShared.callsState.callActive = false;



    window.__CallsCoreShared.callsState.callState = 'idle';



    window.__CallsCoreShared.callsState.activeCallId = null;



    window.__CallsCoreShared.callsState.activeCall = null;



    window.__CallsCoreShared.callsState.callType = null;



    window.__CallsCoreShared.callsState.callParticipants = [];



    window.__CallsCoreShared.callsState.callStartTime = null;



    window.__CallsCoreShared.callsState.connectionState = 'new';



    window.__CallsCoreShared.callsState.signalingState = 'new';



    window.__CallsCoreShared.callsState.callData = null;



    



    // Clear timers



    if (window.__CallsCoreShared.callsState.callInvitationTimer) {



        clearTimeout(window.__CallsCoreShared.callsState.callInvitationTimer);



        window.__CallsCoreShared.callsState.callInvitationTimer = null;



    }



    



    // Clean up media



    if (window.__CallsCoreShared.MediaManager && window.__CallsCoreShared.MediaManager.stopLocalStream) {



        window.__CallsCoreShared.MediaManager.stopLocalStream();



    }



    if (window.__CallsCoreShared.WebRTCManager && window.__CallsCoreShared.WebRTCManager.close) {



        window.__CallsCoreShared.WebRTCManager.close();



    }



    



    // Notify UI to close



    window.__CallsCoreShared.notifyListeners('call_force_ended', callData);



    window.__CallsCoreShared.notifyListeners('call_ended', callData);



    



    // Force UI update



    if (typeof window.__CallsCoreShared.UIBridge !== 'undefined' && window.__CallsCoreShared.UIBridge._closeCallUI) {



        window.__CallsCoreShared.UIBridge._closeCallUI();



    }



    



    console.log('[CallsCore] Call force ended by remote user');



};







// FIX: handleCallFailed/handleCallTimeout previously tore down whatever call
// was currently active via resetCallState() with NO check that the event
// they received actually belongs to that call. This file has multiple
// independent window 'message' listeners plus DOM-event and socket.io
// bridges all capable of delivering these events — so a stale CALL_TIMEOUT
// or CALL_FAILED left over from an earlier attempt (busy-retry, a quick
// redial after a dropped call, or a duplicate delivery racing a newer,
// successfully-connected call) could reach here and kill a perfectly
// healthy, already-connected call seconds after it connected — exactly the
// "shows in-call then disappears" pattern being reported. Also resolves
// through resolveCallId() so a locally-generated id and its server-assigned
// UUID (see handleCallInitiatedAck above) are recognized as the same call.
window.__CallsCoreShared._isStaleCallEvent = function _isStaleCallEvent(callData) {
    var incomingId = callData && (callData.callId || callData.id);
    if (!incomingId) return false;
    var currentId = window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.serverCallId || window.__CallsCoreShared.callsState.localCallId;
    if (!currentId) return false;
    var resolve = (typeof window.__CallsCoreShared.resolveCallId === 'function') ? window.__CallsCoreShared.resolveCallId : function(x){ return x; };
    return String(resolve(incomingId)) !== String(resolve(currentId));
};

window.__CallsCoreShared.handleCallFailed = function handleCallFailed(callData) {

    window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleCallFailed', callData);

    if (window.__CallsCoreShared._isStaleCallEvent(callData)) {
        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleCallFailed: ignoring stale event for a different/previous call', callData && (callData.callId || callData.id));
        return;
    }

    window.__CallsCoreShared.resetCallState();

    window.__CallsCoreShared.notifyListeners('call_failed', callData);

};

// De-duplicated: this used to be a second, full copy of handleCallFailed
// (identical body) rather than a genuine second implementation — collapsed
// to a thin alias so there's only one place to fix/maintain the logic above.
function handleCallFailed2(callData) { return window.__CallsCoreShared.handleCallFailed(callData); }

window.__CallsCoreShared.handleCallTimeout = function handleCallTimeout(callData) {

    window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleCallTimeout', callData);

    if (window.__CallsCoreShared._isStaleCallEvent(callData)) {
        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleCallTimeout: ignoring stale event for a different/previous call', callData && (callData.callId || callData.id));
        return;
    }

    window.__CallsCoreShared.resetCallState();

    window.__CallsCoreShared.notifyListeners('call_timeout', callData);

};

// Real-time message handlers for instant messaging and status updates



function _handleRealtimeMessage(messageData) {



    console.log('[CallsCore] Received real-time message:', messageData);



    



    // Forward to message system if available



    if (window.MessagesCore && window.MessagesCore.addMessage) {



        window.MessagesCore.addMessage(messageData);



    }



    



    // Show notification if not in chat



    if (document.hidden || !window.location.href.includes('chat.html')) {



        if (window.showNotification) {



            const _rawText = messageData && messageData.text;
            const _looksEncrypted = typeof _rawText === 'string' && _rawText.trim().charAt(0) === '{' &&
                (_rawText.indexOf('"v"') !== -1 || _rawText.indexOf('"eph"') !== -1 || _rawText.indexOf('"ct"') !== -1);
            window.showNotification(`New message from ${messageData.senderName}: ${_looksEncrypted ? '🔒 New message' : _rawText}`, 'message');



        }



    }



}







function _handleUserStatus(statusData) {



    console.log('[CallsCore] User status update:', statusData);



    



    // Update online status indicators



    updateOnlineStatusIndicators(statusData.userId, statusData.status === 'online');



    



    // Update call UI if user is in current call



    if (window.__CallsCoreShared.callsState.activeCallId && window.__CallsCoreShared.callsState.participants) {



        const participant = window.__CallsCoreShared.callsState.participants.find(p => p.id === statusData.userId);



        if (participant) {



            participant.online = statusData.status === 'online';



            updateCallUI();



        }



    }



    



    // Dispatch event for other components



    window.dispatchEvent(new CustomEvent('user_online_status', {



        detail: { userId: statusData.userId, isOnline: statusData.status === 'online' }



    }));



}







function _handleCallStatus(callData) {



    console.log('[CallsCore] Call status update:', callData);



    



    switch (callData.type) {



        case 'call_initiated':



            window.__CallsCoreShared.handleCallInitiated(callData);



            break;



        case 'call_accepted':



            window.__CallsCoreShared.handleCallAccepted(callData);
            // SCREEN MANAGER: directly switch to in-call screen, bypassing callOverlay
            if (typeof window.showScreen === "function") { window.showScreen("in-call"); }
            var __ov = document.getElementById("callOverlay"); if (__ov) __ov.setAttribute("data-state", "idle");



            break;



        case 'call_started':



            window.__CallsCoreShared.handleCallStarted(callData);



            break;



        case 'call_connected':



            window.__CallsCoreShared.handleCallConnected(callData);



            break;



        case 'call_rejected':



            window.__CallsCoreShared.handleCallRejected(callData);



            break;



        case 'call_ended':



            window.__CallsCoreShared.handleCallEnded(callData);



            break;



        case 'incoming_call':



            window.__CallsCoreShared.handleIncomingCall(callData);



            break;



        default:



            console.log('[CallsCore] Unknown call status:', callData.type);



    }



}







function _handleOnlineUsers(usersData) {



    console.log('[CallsCore] Online users update:', usersData);



    



    if (usersData.users && Array.isArray(usersData.users)) {



        usersData.users.forEach(user => {



            _handleUserStatus({



                type: 'user_status',



                userId: user.id,



                status: 'online',



                lastSeen: user.lastSeen



            });



        });



    }



}







function _handleTyping(typingData) {



    console.log('[CallsCore] Typing indicator:', typingData);



    



    // Update typing indicators in chat



    if (window.MessagesCore && window.MessagesCore.showTyping) {



        window.MessagesCore.showTyping(typingData.userId, typingData.isTyping);



    }



}







function _handleAuthSuccess(authData) {



    console.log('[CallsCore] Authentication successful:', authData);



    



    // Update connection status



    if (window.KynectaRealtime) {



        window.KynectaRealtime._authenticated = true;



        window.KynectaRealtime._state = 'authenticated';



    }



}







function _handleAuthError(authData) {



    console.error('[CallsCore] Authentication failed:', authData);



    



    // Show error notification



    if (window.showNotification) {



        window.showNotification('Authentication failed. Please log in again.', 'error');



    }



}







function updateOnlineStatusIndicators(userId, isOnline) {



    // Update all online/offline indicators for this user



    const indicators = document.querySelectorAll(`[data-user-id="${userId}"] .online-status, [data-user-id="${userId}"] .status-indicator`);



    



    indicators.forEach(indicator => {



        if (isOnline) {



            indicator.classList.add('online');



            indicator.classList.remove('offline');



            indicator.title = 'Online';



        } else {



            indicator.classList.add('offline');



            indicator.classList.remove('online');



            indicator.title = 'Offline';



        }



    });



}







function updateCallUI() {
    // Drive screen transitions through the injected window.showScreen manager
    // This replaces the callsUI delegation which was triggering the call panel overlay.
    var state = (window.callsState && window.callsState.callState) || "idle";
    if (typeof window.showScreen === "function") {
        if (state === "initiating" || state === "ringing") {
            window.showScreen("calling");
        } else if (state === "connected" || state === "in-call" || state === "connecting") {
            window.showScreen("in-call");
        } else if (state === "idle") {
            window.showScreen("idle");
        }
    } else if (window.callsUI && window.callsUI.updateCallUI) {
        // Fallback only if showScreen not yet available
        window.callsUI.updateCallUI();
    }
    // Always suppress callOverlay
    var overlay = document.getElementById("callOverlay");
    if (overlay) overlay.setAttribute("data-state", "idle");
}










// Expose handlers globally for WebSocket integration



window.CallHandlers = {



    _handleRealtimeMessage,



    _handleUserStatus,



    _handleCallStatus,



    _handleOnlineUsers,



    _handleTyping,



    _handleAuthSuccess,



    _handleAuthError



};







    window.__CallsCoreShared.handleCallBusy = function handleCallBusy(callData) {



        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleCallBusy', callData);



        



        window.__CallsCoreShared.resetCallState();



        window.__CallsCoreShared.notifyListeners('call_busy', callData);



    };



    



    // WebRTC Signaling Handlers (Real)



    window.__CallsCoreShared.resolveCallId = function resolveCallId(id) {
        if (!id) return id;
        if (window.__CallsCoreShared.callsState._callIdAliases && window.__CallsCoreShared.callsState._callIdAliases.has(id)) {
            return window.__CallsCoreShared.callsState._callIdAliases.get(id);
        }
        return id;
    };

    // FIX: root cause of "mismatched callId" call-ending across every call
    // path (traced directly from console logs showing e.g. handleCallEnded
    // ignored - mismatched callId <server-uuid> call_<timestamp>_<random>).
    // The client generates its own local id the moment it starts a call,
    // before the server has created anything. The server later creates the
    // real call record and sends back its own UUID via call:initiated_ack
    // (now actually reachable now that the dead-code bug in
    // CallSignalingService.js elsewhere in this batch was fixed) — but the
    // frontend never had a listener for that event at all, so it kept
    // tracking the call under its made-up local id forever. Every real
    // signal about that call from then on (accept, end, offer/answer)
    // arrives tagged with the server's real UUID, never matches the
    // client's local id, and gets rejected as "mismatched" — while other
    // local cleanup code fires anyway and finds "no active call". This
    // reconciles the two ids the moment the ack arrives, and keeps the old
    // local id mapped as an alias so anything still holding a reference to
    // it resolves correctly instead of breaking.
    window.__CallsCoreShared.handleCallInitiatedAck = function handleCallInitiatedAck(payload) {
        const serverCallId = payload && payload.callId;
        const localCallId = window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.localCallId;
        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleCallInitiatedAck', { serverCallId, localCallId });
        if (!serverCallId) return;

        if (!window.__CallsCoreShared.callsState._callIdAliases) window.__CallsCoreShared.callsState._callIdAliases = new Map();
        if (localCallId && localCallId !== serverCallId) {
            window.__CallsCoreShared.callsState._callIdAliases.set(localCallId, serverCallId);
        }
        window.__CallsCoreShared.callsState._callIdAliases.set(serverCallId, serverCallId);

        window.__CallsCoreShared.callsState.serverCallId = serverCallId;
        window.__CallsCoreShared.callsState.activeCallId = serverCallId;

        // FIX-CALLID-RECONCILE: WebRTCManager keeps its own copy of the call
        // id (_currentCallId) separately from callsState, set once when the
        // peer connection is created. Without updating it here too, every
        // ICE candidate and every locally-detected call_failed/call_ended
        // notification sent for the rest of THIS call would keep using the
        // stale pre-ack local id forever — the receiver (and the server)
        // only ever recognize the server UUID, so those signals would be
        // silently unmatchable on the far end. This is the root cause behind
        // "receiver accepts, briefly connects, then goes dark while caller
        // stays in-call": the caller's own end-of-call/failure signal never
        // matched anything on the receiver's side.
        try {
            if (typeof window.__CallsCoreShared.WebRTCManager !== 'undefined' && window.__CallsCoreShared.WebRTCManager && window.__CallsCoreShared.WebRTCManager._currentCallId && window.__CallsCoreShared.WebRTCManager._currentCallId !== serverCallId) {
                window.__CallsCoreShared.WebRTCManager._currentCallId = serverCallId;
            }
        } catch (_) {}

        try { window.__CallsCoreShared.notifyListeners('call_initiated_ack', { callId: serverCallId, calleeName: payload.calleeName }); } catch (_) {}

        // FIX: also fixes the outgoing-call screen showing "User" instead of
        // the real callee name when calling from the Calls module — the
        // resolved name lives in this same payload and was never applied
        // because nothing was listening for this event at all.
        if (payload.calleeName) {
            window.__CallsCoreShared.callsState.remoteUserName = payload.calleeName;
            try {
                const nameEl = document.getElementById('callerName') || document.getElementById('outgoingCallName') || document.querySelector('.call-name');
                if (nameEl && (!nameEl.textContent || nameEl.textContent.trim() === 'User')) {
                    nameEl.textContent = payload.calleeName;
                }
            } catch (_) {}
        }
    };

    window.__CallsCoreShared.handleSignalOffer = async function handleSignalOffer(payload) {



    window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleSignalOffer', { callId: payload.callId });

    // FIX: this function is reachable from two independent window 'message'
    // listeners in this file, both of which forward MESSAGE_TYPES.SIGNAL_OFFER
    // here. A single real offer from the caller was therefore being processed
    // twice on the receiver's side — the second setRemoteDescription() call
    // fails because the connection is already past the have-remote-offer
    // state from the first, breaking the receiver's WebRTC setup entirely
    // while the caller (who never handles incoming offers) stays fine. That
    // asymmetry is exactly the "caller shows in-call, receiver goes dark"
    // pattern. Ignore a duplicate delivery of the same offer for the same call.
    const _offerCallId = payload && (payload.callId || payload.id);
    const _offerSdpKey = payload && payload.offer && payload.offer.sdp ? payload.offer.sdp.length : (payload && payload.sdp ? String(payload.sdp).length : 0);
    const _offerDedupKey = _offerCallId ? (String(_offerCallId) + ':' + _offerSdpKey) : null;
    if (_offerDedupKey) {
        if (!window.__CallsCoreShared.callsState._processedOfferKeys) window.__CallsCoreShared.callsState._processedOfferKeys = new Set();
        if (window.__CallsCoreShared.callsState._processedOfferKeys.has(_offerDedupKey)) {
            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleSignalOffer: duplicate delivery of same offer, ignoring', _offerDedupKey);
            return;
        }
        window.__CallsCoreShared.callsState._processedOfferKeys.add(_offerDedupKey);
    }

    // FIX-CALLID-RECONCILE (Phase 2): call:offer is explicitly one of the
    // events that must be verified against the single immutable callId for
    // this call — this handler previously only deduped an EXACT repeat
    // delivery of the same offer, with no check that the offer belongs to
    // the call currently being tracked at all. A stale offer left over from
    // a previous, already-ended call attempt (delayed/retried network
    // delivery) arriving after a new call has started would otherwise be
    // applied to the CURRENT peer connection via setRemoteDescription(),
    // corrupting the real negotiation. Only checked when this device
    // already has an active call tracked (a fresh incoming call's very
    // first offer legitimately arrives before any prior local id exists,
    // and _isStaleCallEvent() already returns false — "not stale" — in
    // that case, so this doesn't block the normal flow).
    if (_offerCallId && typeof window.__CallsCoreShared._isStaleCallEvent === 'function' && window.__CallsCoreShared._isStaleCallEvent({ callId: _offerCallId })) {
        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleSignalOffer: ignoring stale offer for a different/previous call', _offerCallId);
        return;
    }



    



    // ✅ FIX: Force callsState.callActive = true when offer arrives on receiver side
    // so the offer is never dropped due to inactive state guard
    const _validOfferStates = ['initiating','initiated','incoming','connecting','in-call',
                               'starting','ringing','connected','in_call','in-progress',
                               'accepted','answering','call_ready'];
    // ✅ FIX: Queue offer if call not active yet — receiver may get offer before acceptCall completes
    if (!window.__CallsCoreShared.callsState.callActive && !_validOfferStates.includes(window.__CallsCoreShared.callsState.callState)) {
        if (!window.__pendingOfferPayload) {
            window.__pendingOfferPayload = payload;
            window.__pendingOfferRetries = 0;
            // FIX-STALE-OFFER-REVIVES-ENDED-CALL: this loop used to keep its
            // setInterval handle in a function-local var only, so nothing
            // outside this closure could ever cancel it. The call-end reset
            // path (calls-core.part5.js / part6.js) clears
            // window.__pendingOfferPayload back to null, but that alone
            // doesn't stop THIS interval from continuing to tick every
            // 200ms in the background. If the user ended the call inside
            // that ~3s retry window, the interval's final branch still ran,
            // force-set callActive=true unconditionally, and (had the
            // payload not been nulled out first) would re-open the call UI
            // the user had just closed — exactly the "call restarts right
          // after being ended" symptom. Fix: track a generation token +
            // expose the interval handle globally so an explicit end can
            // invalidate this specific retry loop outright, and re-check
            // the token (not just the payload) before ever forcing
            // callActive back to true.
            var _offerRetryGen = (window.__pendingOfferRetryGen = (window.__pendingOfferRetryGen || 0) + 1);
            var _offerRetryInterval = setInterval(function() {
                if (window.__pendingOfferRetryGen !== _offerRetryGen) {
                    // A newer offer, or an explicit call-end, has invalidated
                    // this retry loop — stop silently, never touch state.
                    clearInterval(_offerRetryInterval);
                    return;
                }
                window.__pendingOfferRetries = (window.__pendingOfferRetries || 0) + 1;
                if (window.__CallsCoreShared.callsState.callActive || _validOfferStates.includes(window.__CallsCoreShared.callsState.callState)) {
                    clearInterval(_offerRetryInterval);
                    var _q = window.__pendingOfferPayload; window.__pendingOfferPayload = null;
                    if (_q) window.__CallsCoreShared.handleSignalOffer(_q);
                } else if (window.__pendingOfferRetries >= 15) {
                    clearInterval(_offerRetryInterval);
                    // Only force-activate if this generation is still the
                    // live one AND a payload is still actually queued —
                    // both get invalidated/cleared by an explicit call-end.
                    if (window.__pendingOfferRetryGen === _offerRetryGen && window.__pendingOfferPayload) {
                        window.__CallsCoreShared.callsState.callActive = true;
                        var _q2 = window.__pendingOfferPayload; window.__pendingOfferPayload = null;
                        window.__CallsCoreShared.handleSignalOffer(_q2);
                    }
                }
            }, 200);
            window.__pendingOfferRetryIntervalId = _offerRetryInterval;
        }
        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Signal offer queued — callState:', window.__CallsCoreShared.callsState.callState);
        return;
    }
    if (!window.__CallsCoreShared.callsState.callActive && _validOfferStates.includes(window.__CallsCoreShared.callsState.callState)) {
        window.__CallsCoreShared.callsState.callActive = true;
        console.log('[CallsCore] handleSignalOffer: forced callActive=true (state:', window.__CallsCoreShared.callsState.callState, ')');
    }



    



    if (!window.__CallsCoreShared.WebRTCManager._peerConnection) {



        // Receiver may not have set up PC yet if acceptCall hasn't finished



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'No peer connection for signal offer — attempting to create one');



        try {



            const constraints = { audio: window.__CallsCoreShared.getAudioConstraints(), video: window.__CallsCoreShared.getVideoConstraints(window.__CallsCoreShared.callsState.callType) };



            const streamResult = await window.__CallsCoreShared.MediaManager.getLocalStream(constraints);



            if (streamResult.success) {



                window.__CallsCoreShared.WebRTCManager.createPeerConnection();



                window.__CallsCoreShared.WebRTCManager.addStream(streamResult.stream);



                window.__CallsCoreShared.WebRTCManager.setCurrentCallId(window.__CallsCoreShared.callsState.activeCallId);



                console.log('[CallsCore] ✅ Peer connection created for incoming offer');



            } else {



                window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Could not get local stream for offer handling');



                return;



            }



        } catch (e) {



            window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Failed to create peer connection for offer', e);



            return;



        }



    }



    



    try {



        await window.__CallsCoreShared.WebRTCManager.setRemoteDescription(payload.offer);



        console.log('[CallsCore] Remote description (offer) set');







        const answer = await window.__CallsCoreShared.WebRTCManager.createAnswer();



        



        // FIXED: Send as direct message type, not as ACTION



        // FIX: targetUserId MUST be in the answer payload — the backend routes the
        // answer back to the original caller. payload.callerId is the caller's ID.
        var _answerTargetId = (payload && (payload.callerId || payload.callerId)) ||
                              (window.__CallsCoreShared.callsState.callData && window.__CallsCoreShared.callsState.callData.callerId) || null;
        var _answerPayload = {
            callId: payload.callId || window.__CallsCoreShared.callsState.activeCallId,
            answer: answer,
            targetUserId: _answerTargetId,
            remoteUserId: _answerTargetId,
            timestamp: Date.now()
        };
        // FIX-DUP-SIGNAL-DELIVERY (answer): same bug class as the offer-sending
        // fix above — this used to ALWAYS postMessage the answer to chat.html
        // (which relays it onward over its own socket emits) AND separately
        // emit 'call:webrtc_answer' directly below, delivering the same SDP
        // answer to the caller multiple times and risking a second
        // setRemoteDescription() on an already-stable connection, which is
        // exactly why the caller could end up with no working remote video
        // even though the offer/answer exchange appeared to complete. Deliver
        // via exactly ONE path: direct Socket.IO when available, otherwise
        // fall back to the postMessage→chat.html relay.
        var _directSockAns = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
        if (_directSockAns && typeof _directSockAns.emit === 'function' && _answerTargetId) {
            _directSockAns.emit('call:webrtc_answer', {
                callId: _answerPayload.callId, targetUserId: _answerTargetId, answer: answer,
            });
            console.log('[CallsCore] ✅ ANSWER sent via Socket.IO to caller:', _answerTargetId);
        } else {
            window.__CallsCoreShared.safeSend('SIGNAL_ANSWER', _answerPayload, false);
            console.log('[CallsCore] ✅ ANSWER sent via safeSend. targetUserId:', _answerTargetId);
        }
        window.__CallsCoreShared.DiagnosticsAgent.record('signaling_send');



        



    } catch (error) {



        window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Failed to handle signal offer', error);



    }



};



    window.__CallsCoreShared.handleSignalAnswer = async function handleSignalAnswer(payload) {



        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleSignalAnswer', { callId: payload.callId });

    // FIX: same duplicate-delivery problem as handleSignalOffer above, but on
    // the CALLER's side this time — this function is also reachable from the
    // two independent window 'message' listeners in this file. A single real
    // answer from the receiver was being processed twice, and the second
    // setRemoteDescription() call fails on a connection already past that
    // state from the first, breaking the CALLER's peer connection this time
    // (receiver, who never handles incoming answers, stays fine). This is
    // the "caller goes dark" half of the same bug class.
    const _ansCallId = payload && (payload.callId || payload.id);
    const _ansSdpKey = payload && payload.answer && payload.answer.sdp ? payload.answer.sdp.length : (payload && payload.sdp ? String(payload.sdp).length : 0);
    const _ansDedupKey = _ansCallId ? (String(_ansCallId) + ':' + _ansSdpKey) : null;
    if (_ansDedupKey) {
        if (!window.__CallsCoreShared.callsState._processedAnswerKeys) window.__CallsCoreShared.callsState._processedAnswerKeys = new Set();
        if (window.__CallsCoreShared.callsState._processedAnswerKeys.has(_ansDedupKey)) {
            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleSignalAnswer: duplicate delivery of same answer, ignoring', _ansDedupKey);
            return;
        }
        window.__CallsCoreShared.callsState._processedAnswerKeys.add(_ansDedupKey);
    }

    // FIX-CALLID-RECONCILE (Phase 2): call:answer is explicitly one of the
    // events that must be verified against the single immutable callId —
    // same gap and same fix as handleSignalOffer above, on the caller's
    // side this time. A stale answer for a previous, already-ended call
    // attempt arriving late would otherwise be applied via
    // setRemoteDescription() to whatever peer connection is CURRENTLY
    // active, corrupting the real negotiation.
    if (_ansCallId && typeof window.__CallsCoreShared._isStaleCallEvent === 'function' && window.__CallsCoreShared._isStaleCallEvent({ callId: _ansCallId })) {
        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'handleSignalAnswer: ignoring stale answer for a different/previous call', _ansCallId);
        return;
    }



        



        // FIX: allow all valid mid-call states for signal answer too
        const _validAnsStates = ['initiating','initiated','connecting','in-call',
                                  'in_call','starting','ringing','connected',
                                  'in-progress','accepted','answering','call_ready','incoming'];
        if (!window.__CallsCoreShared.callsState.callActive && !_validAnsStates.includes(window.__CallsCoreShared.callsState.callState)) {



            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Signal answer received but no active call');



            return;



        }



        



        // ✅ FIX: Queue answer if no peer connection yet (timing issue)
        if (!window.__CallsCoreShared.WebRTCManager._peerConnection) {
            if (!window.__pendingAnswerPayload) {
                window.__pendingAnswerPayload = payload;
                var _ansRetries = 0;
                var _ansInterval = setInterval(function() {
                    _ansRetries++;
                    if (window.__CallsCoreShared.WebRTCManager._peerConnection) {
                        clearInterval(_ansInterval);
                        var q = window.__pendingAnswerPayload; window.__pendingAnswerPayload = null;
                        if (q) window.__CallsCoreShared.handleSignalAnswer(q);
                    } else if (_ansRetries >= 15) {
                        clearInterval(_ansInterval);
                        window.__pendingAnswerPayload = null;
                        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Answer dropped: no peer connection after 3s');
                    }
                }, 200);
            }
            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Signal answer queued — waiting for peer connection');
            return;
        }



        



        try {



            await window.__CallsCoreShared.WebRTCManager.setRemoteDescription(payload.answer);



            window.__CallsCoreShared.DiagnosticsAgent.record('signaling_recv');



            console.log('[CallsCore] ✅ ANSWER RECEIVED — remote description set');







            // Flush any ICE candidates that arrived before the answer was set



            if (window.__CallsCoreShared.callsState.iceCandidates && window.__CallsCoreShared.callsState.iceCandidates.length > 0) {



                console.log('[CallsCore] Flushing', window.__CallsCoreShared.callsState.iceCandidates.length, 'queued ICE candidates');



                const queued = window.__CallsCoreShared.callsState.iceCandidates.splice(0);



                for (const candidate of queued) {



                    try { await window.__CallsCoreShared.WebRTCManager.addIceCandidate(candidate); } catch (_) {}



                }



            }



        } catch (error) {



            window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Failed to handle signal answer', error);



        }



    };



    



    window.__CallsCoreShared.handleIceCandidate = async function handleIceCandidate(payload) {



    window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'handleIceCandidate', { callId: payload.callId });

    // FIX: same dual-listener duplicate-delivery pattern as handleSignalOffer
    // and handleSignalAnswer above. Duplicate ICE candidates are usually
    // harmless (browsers silently ignore an already-added candidate), but
    // skip the redundant work and log noise consistently with those fixes.
    const _iceCallId = payload && (payload.callId || payload.id);
    const _iceCandKey = payload && payload.candidate ? JSON.stringify(payload.candidate).length + ':' + (payload.candidate.sdpMLineIndex || 0) : 0;
    const _iceDedupKey = _iceCallId ? (String(_iceCallId) + ':' + _iceCandKey) : null;
    if (_iceDedupKey) {
        if (!window.__CallsCoreShared.callsState._processedIceKeys) window.__CallsCoreShared.callsState._processedIceKeys = new Set();
        if (window.__CallsCoreShared.callsState._processedIceKeys.has(_iceDedupKey)) {
            return;
        }
        window.__CallsCoreShared.callsState._processedIceKeys.add(_iceDedupKey);
    }



    



    // ✅ FIX: Accept ICE candidates in all transitional states including 'incoming' and 'ringing'
    const _validIceStates = ['initiating','initiated','incoming','ringing','connecting','in-call','in_call','connected','starting'];
    if (!window.__CallsCoreShared.callsState.callActive && !_validIceStates.includes(window.__CallsCoreShared.callsState.callState)) {
        // Queue the candidate for later rather than dropping it
        if (!window.__CallsCoreShared.callsState.iceCandidates) window.__CallsCoreShared.callsState.iceCandidates = [];
        window.__CallsCoreShared.callsState.iceCandidates.push(payload.candidate);
        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'ICE candidate queued (no active call yet) — state:', window.__CallsCoreShared.callsState.callState);
        return;
    }



    



    if (!window.__CallsCoreShared.WebRTCManager._peerConnection) {



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'No peer connection for ICE candidate — queueing');



        // Queue the candidate if remote description not yet set



        window.__CallsCoreShared.callsState.iceCandidates.push(payload.candidate);



        return;



    }



    



    try {



        await window.__CallsCoreShared.WebRTCManager.addIceCandidate(payload.candidate);



        window.__CallsCoreShared.DiagnosticsAgent.record('signaling_recv');



        console.log('[CallsCore] ✅ ICE CANDIDATE applied from remote peer');



        // NOTE: Do NOT re-forward received ICE candidates — that causes a loop.



        // Outbound ICE candidates are sent in WebRTCManager._setupPeerConnectionListeners



        // via the onicecandidate callback.



    } catch (error) {



        window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Failed to add ICE candidate', error);



    }



};



    



    window.__CallsCoreShared.handleRemoteStreamAdded = function handleRemoteStreamAdded(payload) {



        if (payload.stream) {



            window.__CallsCoreShared.callsState.remoteStream = payload.stream;



            window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'Remote stream added');



            window.__CallsCoreShared.notifyListeners('remote_stream_added', payload);



        }



    };



    



    window.__CallsCoreShared.handleRemoteStreamRemoved = function handleRemoteStreamRemoved(payload) {



        window.__CallsCoreShared.callsState.remoteStream = null;



        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'Remote stream removed');



        window.__CallsCoreShared.notifyListeners('remote_stream_removed', payload);



    };



    



    window.__CallsCoreShared.handleInitData = function handleInitData(message) {



        const data = message.payload || message.data || {};



        



        window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE, 'Received module init data', {



            hasSession: !!(data.session || data.user)



        });



        



        if (data.session) {



            // Validate session before applying



            if (window.__CallsCoreShared.__isValidSession(data.session)) {



                window.__CallsCoreShared.callsState.session = data.session;



                if (data.session.token) window.__CallsCoreShared.callsState.token = data.session.token;



                window.__CallsCoreShared.callsState.sessionReceived = true;



                window.__CallsCoreShared.callsState.sessionStatus = 'valid';



                window.__CallsCoreShared.validSessionConfirmed = true;



            } else {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Init data session rejected - invalid', data.session);



            }



        } else if (data.user) {



            const candidateSession = {



                user: data.user,



                token: data.token,



                authenticated: data.authenticated !== false,



                userId: data.user.id,



                expiresAt: data.expiresAt || Date.now() + 3600000



            };



            if (window.__CallsCoreShared.__isValidSession(candidateSession)) {



                window.__CallsCoreShared.callsState.session = candidateSession;



                if (data.token) window.__CallsCoreShared.callsState.token = data.token;



                if (data.user && data.token) {



                    window.__CallsCoreShared.callsState.sessionReceived = true;



                    window.__CallsCoreShared.callsState.sessionStatus = 'valid';



                    window.__CallsCoreShared.validSessionConfirmed = true;



                }



            } else {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Init data session rejected - invalid user data');



            }



        }



        



        if (data.isPremium !== undefined) {



            window.__CallsCoreShared.callsState.isPremium = data.isPremium;



        }



        



        if (data.premiumFeatures) {



            window.__CallsCoreShared.callsState.premiumFeatures = { ...window.__CallsCoreShared.callsState.premiumFeatures, ...data.premiumFeatures };



        }



        



        window.__CallsCoreShared.callsState.initialized = true;



        



        window.__CallsCoreShared.notifyListeners('module_ready', {



            session: window.__CallsCoreShared.callsState.session,



            isPremium: window.__CallsCoreShared.callsState.isPremium



        });



        



        window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE, 'Module initialization complete');



    };



    

})();
