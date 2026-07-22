/**
 * PART 7/8 — RELIABILITY & ORCHESTRATION
 * Reliability engine, recovery manager, compatibility bridge, diagnostics agent, multi-module coordinator, navigation guard, lifecycle controller, session pipeline, and another set of real call-signaling handlers used during orchestration.
 *
 * This file is a SOURCE FRAGMENT of calls-core.js, not a standalone script.
 * It shares the single closure of the original module and must be concatenated
 * in numeric order (part 0..7) — see build.js — before it is served to the browser.
 * Do NOT <script src> this file directly on its own; it will throw ReferenceErrors
 * for symbols defined in the other parts of the same closure.
 */
    // ==================== RELIABILITY ENGINE ====================



    const ReliabilityEngine = {



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



            logReady(MODULE, 'ReliabilityEngine initialized');



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



                            logWarn(MODULE, 'Offline operation failed', { type: operation.type });



                        });



                    }



                } catch (e) {



                    logWarn(MODULE, 'Offline operation error', e);



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



    



    ReliabilityEngine.initialize();



    



    // ==================== RECOVERY MANAGER ====================



    const RecoveryManager = {



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



            logReady(MODULE, 'RecoveryManager initialized');



            return this;



        },



        



        createCheckpoint: function(name, data = {}) {



            // CRITICAL: Never store call state in checkpoints



            const checkpoint = {



                name,



                timestamp: Date.now(),



                state: StateGovernor.getState(),



                sessionValid: IframeSessionClient.isValid(),



                environment: 'production',



                data: { ...data, callState: undefined } // Strip call state



            };



            



            this._checkpoints.push(checkpoint);



            if (this._checkpoints.length > 10) this._checkpoints.shift();



            this._lastCheckpoint = checkpoint;



            



            this._saveCheckpoint();



            



            logInfo(MODULE, `Checkpoint created: ${name}`);



            return checkpoint;



        },



        



        _saveCheckpoint: function() {



            if (this._lastCheckpoint) {



                const safeCheckpoint = {



                    name: this._lastCheckpoint.name,



                    timestamp: this._lastCheckpoint.timestamp,



                    state: this._lastCheckpoint.state



                };



                SafeStorage.set('checkpoint', safeCheckpoint);



            }



        },



        



        _loadLastCheckpoint: function() {



            try {



                SafeStorage.get('checkpoint').then(stored => {



                    if (stored) {



                        this._lastCheckpoint = stored;



                        logInfo(MODULE, 'Loaded last checkpoint', stored);



                    }



                }).catch(() => {});



            } catch (error) {



                logWarn(MODULE, 'Failed to load checkpoint', error);



            }



        },



        



        recover: async function() {



            if (this._recoveryPromise) return this._recoveryPromise;



            



            if (this._recoveryInProgress) {



                return { success: false, reason: 'in_progress' };



            }



            



            if (this._recoveryAttempts >= this._maxRecoveryAttempts) {



                logWarn(MODULE, 'Max recovery attempts reached');



                return { success: false, reason: 'max_attempts' };



            }



            



            this._recoveryInProgress = true;



            this._recoveryAttempts++;



            



            logInfo(MODULE, `Starting recovery (attempt ${this._recoveryAttempts})`);



            this._notifyListeners('start', { attempt: this._recoveryAttempts });



            



            this._recoveryPromise = (async () => {



                try {



                    if (!navigator.onLine) {



                        logWarn(MODULE, 'Recovery: Offline, waiting for network');



                        await this._waitForNetwork();



                    }



                    



                    if (!window.parent || window.parent === window) {



                        logWarn(MODULE, 'Recovery: No parent window');



                        this._recoveryInProgress = false;



                        this._notifyListeners('failed', { reason: 'no_parent' });



                        return { success: false, reason: 'no_parent' };



                    }



                    



                    safeSend('RECOVERY_REQUEST', {



                        module: MODULE_NAME,



                        timestamp: Date.now(),



                        attempts: this._recoveryAttempts



                    }, { requireAck: false }).catch(() => {});



                    



                    logInfo(MODULE, 'Recovery request sent, waiting for parent');



                    



                    this._recoveryAttempts = 0;



                    this._recoveryInProgress = false;



                    



                    logSuccess(MODULE, 'Recovery request sent');



                    this._notifyListeners('request_sent', {});



                    



                    return { success: true, requested: true };



                    



                } catch (error) {



                    logError(MODULE, 'Recovery failed', error);



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



                if (currentState !== LifecycleState.ACTIVE && !callsState.inPassiveMode) {



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



    



    RecoveryManager.initialize();



    



    // ==================== COMPATIBILITY BRIDGE ====================



    const CompatibilityBridge = {



        _legacyMode: false,



        _parentCapabilities: new Set(),



        _detected: false,



        _version: CONFIG.VERSION,



        



        detect: function() {



            if (this._detected) return this._legacyMode;



            



            try {



                const parentProtocol = window.parent?.__PROTOCOL_VERSION__;



                



                if (parentProtocol && parentProtocol >= 'KYN-6.0') {



                    this._legacyMode = false;



                    this._parentCapabilities.add('modern_protocol');



                    logInfo(MODULE, 'Modern parent protocol detected', { version: parentProtocol });



                } else {



                    this._legacyMode = false;



                }



            } catch (e) {



                this._legacyMode = false;



            }



            



            this._detected = true;



            



            logInfo(MODULE, `Compatibility bridge: ${this._legacyMode ? 'legacy' : 'modern'} mode`);



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



    



    CompatibilityBridge.detect();



    



    // ==================== DIAGNOSTICS AGENT ====================



    const DiagnosticsAgent = {



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



            logInfo(MODULE, 'DiagnosticsAgent enabled');



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



                    coreState: StateGovernor.getState(),



                    sessionValid: IframeSessionClient.isValid(),



                    online: navigator.onLine,



                    visible: !document.hidden,



                    v5State: V5StateGovernor ? V5StateGovernor.getState() : 'unknown',



                    tokenValid: !!callsState.token,



                    lifecycleState: currentState,



                    callActive: callsState.callActive,



                    callState: callsState.callState,



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



                    coreState: StateGovernor.getState(),



                    sessionValid: IframeSessionClient.isValid(),



                    online: navigator.onLine,



                    visible: !document.hidden,



                    v5State: V5StateGovernor ? V5StateGovernor.getState() : 'unknown',



                    tokenValid: !!callsState.token,



                    lifecycleState: currentState,



                    callActive: callsState.callActive,



                    callState: callsState.callState,



                    inPassiveMode: false



                },



                environment: { environment: ENVIRONMENT.current },



                transport: IframeTransport.getStatus(),



                handshake: { state: 'unknown' },



                session: IframeSessionClient.isValid() ? {



                    valid: true,



                    timeRemaining: IframeSessionClient.getTimeRemaining()



                } : { valid: false },



                recovery: RecoveryManager.getStatus(),



                callsState: { 



                    ...callsState,



                    localStream: !!callsState.localStream,



                    remoteStream: !!callsState.remoteStream,



                    remoteStreams: callsState.remoteStreams.size



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



                    coreState: StateGovernor.getState(),



                    sessionValid: IframeSessionClient.isValid(),



                    online: navigator.onLine,



                    visible: !document.hidden,



                    v5State: V5StateGovernor ? V5StateGovernor.getState() : 'unknown',



                    tokenValid: !!callsState.token,



                    lifecycleState: currentState,



                    callActive: callsState.callActive,



                    callState: callsState.callState,



                    inPassiveMode: false



                },



                environment: { environment: ENVIRONMENT.current },



                transport: IframeTransport.getStatus(),



                session: IframeSessionClient.isValid() ? {



                    valid: true,



                    timeRemaining: IframeSessionClient.getTimeRemaining()



                } : { valid: false },



                recovery: RecoveryManager.getStatus(),



                callsState: { 



                    ...callsState,



                    localStream: !!callsState.localStream,



                    remoteStream: !!callsState.remoteStream,



                    remoteStreams: callsState.remoteStreams.size



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



    



    if (window.__IFRAME_DEBUG__) DiagnosticsAgent.enable();



    



    // ==================== MULTI-MODULE COORDINATOR ====================



    const MultiModuleCoordinator = {



        _modules: new Map(),



        _authority: null,



        _initialized: false,



        



        initialize: function() {



            if (this._initialized) return this;



            



            this._authority = {



                environment: ENVIRONMENT,



                storage: SafeStorage,



                transport: IframeTransport,



                session: IframeSessionClient,



                reliability: ReliabilityEngine,



                recovery: RecoveryManager,



                compatibility: CompatibilityBridge,



                diagnostics: DiagnosticsAgent,



                origin: OriginSecurity,



                state: StateGovernor,



                v5State: V5StateGovernor,



                callsState: callsState,



                webRTC: WebRTCManager,



                media: MediaManager,



                callsGovernor: CallsStateGovernor



            };



            



            this._initialized = true;



            logReady(MODULE, 'MultiModuleCoordinator initialized');



            



            return this;



        },



        



        register: function(name, module) {



            if (this._modules.has(name)) {



                logWarn(MODULE, `Module ${name} already registered, overriding`);



            }



            this._modules.set(name, module);



            logInfo(MODULE, `Module registered: ${name}`);



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



    



    MultiModuleCoordinator.initialize();



    



    // Replace the entire UIFailsafe object in calls-core.js (around line 5200)







const UIFailsafe = {



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



        logReady(MODULE, 'UIFailsafe initialized');



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



        logWarn(MODULE, 'UI fallback mode enabled');



    },



    



    disableFallbackMode: function() {



        if (!this._fallbackMode) return;



        this._fallbackMode = false;



        this._restoreUI();



        this._notifyListeners('fallback', { enabled: false });



        logInfo(MODULE, 'UI fallback mode disabled');



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



    



    UIFailsafe.initialize();







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



            if (typeof UIFailsafe !== 'undefined' && UIFailsafe && typeof UIFailsafe.showFallbackMessage === 'function') {



                UIFailsafe.showFallbackMessage(message, type);



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



    const NavigationGuard = {



        _currentPath: window.location.pathname,



        _currentHash: window.location.hash,



        _navigationInProgress: false,



        _pendingNavigation: null,



        _listeners: new Set(),



        



        initialize: function() {



            this._setupListeners();



            logReady(MODULE, 'NavigationGuard initialized');



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



            return callsState.callActive === true;



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



                blockActive: callsState.callActive



            };



        }



    };



    



    NavigationGuard.initialize();



    



    // ==================== LIFECYCLE CONTROLLER ====================



    const LifecycleController = {



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



            logReady(MODULE, 'LifecycleController initialized');



            return this;



        },



        



        runDeterministicPipeline: async function() {



            if (this._initializationPromise) {



                return this._initializationPromise;



            }



            



            if (this._initializationLock) {



                logWarn(MODULE, 'Pipeline already running, waiting');



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



                logWarn(MODULE, 'Max pipeline attempts reached, completing');



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



                logInfo(MODULE, 'Starting deterministic pipeline');



                



                StateGovernor.enableTransitions();



                



                const pipelineResult = await SessionPipeline.run();



                



                this._pipelineResults = pipelineResult;



                this._pipelineCompleted = true;



                this._initializationLock = false;



                



                if (pipelineResult.success) {



                    logSuccess(MODULE, `Deterministic pipeline completed in ${pipelineResult.duration || 0}ms`, { degraded: pipelineResult.degraded });



                    



                    window.dispatchEvent(new CustomEvent('core.ready', {



                        detail: {



                            timestamp: Date.now(),



                            version: CONFIG.VERSION,



                            environment: ENVIRONMENT.current,



                            duration: pipelineResult.duration || 0,



                            degraded: pipelineResult.degraded || false



                        }



                    }));



                    



                    return pipelineResult;



                } else {



                    throw new Error(pipelineResult.error || 'Pipeline failed');



                }



                



            } catch (error) {



                logError(MODULE, 'Pipeline execution failed', error);



                this._initializationLock = false;



                StateGovernor._currentState = STATE.ERROR_FATAL;



                RecoveryManager.scheduleRecovery();



                



                this._pipelineResults.success = false;



                this._pipelineResults.error = error.message;



                return this._pipelineResults;



            } finally {



                StateGovernor.disableTransitions();



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



    



    LifecycleController.initialize();



    



    // ==================== SESSION PIPELINE ====================



    const SessionPipeline = {



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



            logReady(MODULE, 'SessionPipeline initialized');



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



                logPipeline(MODULE, 'pipeline', 'already in progress');



                return this._waitForCompletion();



            }



            



            if (this._pipelineCompleted) {



                logPipeline(MODULE, 'pipeline', 'already completed', { degraded: this._pipelineDegraded });



                return { success: true, completed: true, degraded: this._pipelineDegraded };



            }



            



            this._pipelineInProgress = true;



            this._pipelineStartTime = Date.now();



            this._pipelineDegraded = false;



            



            logPipeline(MODULE, 'pipeline', 'start');



            



            for (const stage of this._stages) {



                this._currentStage = stage;



                this._stageAttempts[stage] = 0;



                



                logPipeline(MODULE, stage, 'start');



                



                const stageResult = await this._executeStageWithRetry(stage);



                this._stageResults[stage] = stageResult;



                



                if (stageResult.success) {



                    logPipeline(MODULE, stage, 'success', { attempt: stageResult.attempt });



                } else {



                    logPipeline(MODULE, stage, 'fail', { attempt: stageResult.attempt, error: stageResult.error });



                    



                    const criticalStages = ['preflight', 'dependencyCheck'];



                    



                    if (criticalStages.includes(stage)) {



                        logPipeline(MODULE, 'pipeline', 'critical failure', { stage });



                        this._pipelineInProgress = false;



                        return { success: false, stage, error: stageResult.error };



                    }



                    



                    this._pipelineDegraded = true;



                    



                    if (stage === 'sessionSync') {



                        logPipeline(MODULE, 'pipeline', 'continuing in degraded mode', { stage });



                    } else {



                        logPipeline(MODULE, 'pipeline', 'continuing despite failure', { stage });



                    }



                }



            }



            



            this._pipelineCompleted = true;



            this._pipelineInProgress = false;



            this._pipelineEndTime = Date.now();



            



            const duration = this._pipelineEndTime - this._pipelineStartTime;



            



            logPipeline(MODULE, 'pipeline', 'complete', { 



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



                logWarn(MODULE, 'Preflight: missing capabilities', { missing });



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



            



            logInfo(MODULE, 'Parent detection', { parentDetected, sameOrigin, parentOrigin });



            



            return { 



                success: true, 



                parentDetected, 



                sameOrigin, 



                parentOrigin 



            };



        },



        



        _runHandshake: async function() {



            try {



                sendChildReady();



                return { success: true };



            } catch (error) {



                logError(MODULE, 'Handshake failed', error);



                return { success: true, degraded: true, error: error.message };



            }



        },



        



        _runSessionSync: async function() {



            if (IframeSessionClient && IframeSessionClient.isValid()) {



                logSession(MODULE, 'already valid');



                return { success: true, cached: true };



            }



            



            try {



                SessionClient.requestSession();



                



                const sessionResult = await StateGovernor.waitForSession(5000);



                



                if (sessionResult && sessionResult.success) {



                    logSession(MODULE, 'acquired');



                    return { success: true };



                }



            } catch (error) {



                logSession(MODULE, 'failed', error.message);



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



        console.log(`[${module}] ${icon} Pipeline stage: ${stage} - ${status}`, data ? data : '', _buildStructuredLog(module, `pipeline:${stage}:${status}`, data));



    }



    



    SessionPipeline.initialize();



    



    // ==================== CALL SIGNALING HANDLERS (REAL) ====================



    



    function handleIncomingCall(callData) {

        // ── FIX: Capture the receiver's origin page (tagged by chat.html as
        // _receiverReturnTo) so that after this call ends, POST_CALL_RESTORE
        // navigates back to where the receiver actually was — not always
        // 'conversations'/'messages'. Only set once per call (first message wins).
        try {
            if (callData && callData._receiverReturnTo && !callsState.pendingCallReturnTo) {
                callsState.pendingCallReturnTo = callData._receiverReturnTo;
            }
            // FIX (call-end return navigation — receiver side): also carry the
            // SPECIFIC chat that was open, if any, so returning after the call
            // reopens that exact conversation instead of just the chat list.
            if (callData && callData._receiverReturnChatUserId && !callsState.pendingCallReturnChatUserId) {
                callsState.pendingCallReturnChatUserId = callData._receiverReturnChatUserId;
                callsState.pendingCallReturnChatName = callData._receiverReturnChatName || null;
            }
        } catch (_e) {}

        // ── Multi-tab guard: only the leader tab handles incoming calls ────────
        // Other tabs suppress the UI but keep the call record for history.
        if (typeof _isActiveCallTab === 'function' && !_isActiveCallTab()) {
            logInfo(MODULE, '[multi-tab] Suppressing call:incoming — not the active call tab');
            // Notify the call broadcast channel so the leader knows another tab received it
            if (_callBroadcast) {
                try { _callBroadcast.postMessage({ type: 'CALL_INCOMING_SUPPRESSED', callId: callData && callData.callId, tabId: _tabId }); } catch(_e) {}
            }
            return;
        }




        logCall(MODULE, 'handleIncomingCall', callData);



        console.log('[CallsCore] 📞 RECEIVED incoming call event:', JSON.stringify({



            callId: callData && (callData.callId || callData.id),



            callerName: callData && callData.callerName,



            callType: callData && (callData.callType || callData.type),



            state: currentState



        }));







        // ── FIX: NEVER block incoming calls on parentReady or assertActive.



        // Service worker reloads and delayed handshakes reset lifecycle state.



        // Only hard-block if the module has not started initialising at all.



        const blockedStates = [LifecycleState.BOOT, LifecycleState.INITIALIZING];



        if (blockedStates.includes(currentState)) {



            logWarn(MODULE, `Incoming call ignored — module not yet initialised (state: ${currentState})`);



            return;



        }







        // Auto-promote: if we have a valid session but lifecycle is still



        // WAIT_PARENT (e.g. after a SW reload), force-promote to ACTIVE so



        // the incoming call is not silently dropped.



        if (currentState !== LifecycleState.ACTIVE) {



            const sess = callsState.session || (CallsStateGovernor && CallsStateGovernor._session);



            if (sess && sess.authenticated) {



                logWarn(MODULE, `Auto-promoting ${currentState} → ACTIVE to handle incoming call`);



                currentState = LifecycleState.ACTIVE;



            } else {



                logWarn(MODULE, `Cannot auto-promote — no valid session (state: ${currentState}). Incoming call dropped.`);



                return;



            }



        }







        // ── DEDUP: ignore duplicate incoming events for the same call ────────



        const incomingId = callData.callId || callData.id;



        if (callsState.activeCallId && callsState.activeCallId === incomingId && callsState.callState === 'incoming') {



            return; // already processing this call



        }







        // CRITICAL: Check for existing GENUINELY active call (not just stale state)



        // Only block if we're actually in a call (in-call state), not idle/ended stale



        if (callsState.callActive && callsState.callState === 'in-call') {
            logWarn(MODULE, 'Incoming call rejected - already in a call (in-call state)');
            safeSend('CALL_REJECT', {
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
        // The 'friends'-only tier is deliberately NOT enforced here: it would
        // require a reliable cross-iframe friends-list lookup this file doesn't
        // have, and incorrectly rejecting a real friend is worse than today's
        // no-op. Both settings still fail open (no data → call proceeds normally).
        try {
            const _callsCfg = (window.AppSettings && window.AppSettings.get('calls')) || {};
            const _whoCanCall = _callsCfg.whoCanCallMe
                || document.documentElement.getAttribute('data-calls-who-can-call');
            const _autoReject = _callsCfg.autoReject === true
                || document.documentElement.getAttribute('data-calls-auto-reject') === 'true';

            if (_autoReject || _whoCanCall === 'nobody') {
                logWarn(MODULE, 'Incoming call auto-rejected by privacy setting', { autoReject: _autoReject, whoCanCallMe: _whoCanCall });
                safeSend('CALL_REJECT', {
                    callId: callData.callId,
                    reason: _autoReject ? 'auto_reject_enabled' : 'calls_restricted',
                    timestamp: Date.now()
                }, false);
                return;
            }
        } catch (_privacyErr) {
            // Fail open — never let a settings-read error block a legitimate call
        }

        // If stale state from a previous call, reset it first



        if (callsState.callActive && callsState.callState !== 'in-call') {



            logWarn(MODULE, 'Resetting stale call state before incoming call');



            callsState.callActive = false;



            callsState.callState = 'idle';



            callsState.activeCallId = null;



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

        callsState.callData = callData;



        callsState.callState = 'incoming';


        // CALLMANAGER BRIDGE: create CM session for incoming call
        try {
            var _smInc = window.__CallStateMachine;
            var _CSInc = window.CALL_STATE;
            if (_smInc && _CSInc) {
                var _incId = callsState.activeCallId;
                if (_incId && !_smInc.getSession(_incId)) {
                    _smInc.createSession(_incId, (callData && callData.callType) || 'audio', (callData && callData.callerId), false);
                    _smInc.transition(_incId, _CSInc.INCOMING);
                    if (callData && callData.callerName) { var _is = _smInc.getSession(_incId); if(_is) _is.peerName = callData.callerName; }
                }
            }
        } catch(_incBE) {}

        callsState.activeCallId = callData.callId || callData.id || callsState.activeCallId;  // ← CRITICAL: Set activeCallId for incoming calls







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



                receiverId: callsState.session?.userId || null,



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
        notifyListeners('incoming_call', _enrichedCall);

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
    }



    function handleCallInitiated(callData) {



    logCall(MODULE, 'handleCallInitiated', callData);



    



    // Offline fix: backend returned success:false + offline:true



    // Show call UI anyway for 3 minutes with ringtone even if receiver is offline



    if (callData.offline === true || (callData.success === false && callData.offline)) {



        logWarn(MODULE, 'Receiver is offline - showing call UI for 3 minutes', callData);







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



        logWarn(MODULE, 'Call initiation failed, cleaning up', { 



            error: callData.error, 



            callId: callData.callId 



        });



        



        // Clean up the call state



        if (callsState.activeCallId === callData.callId || callsState.callActive) {



            resetCallState();



            callsState.callActive = false;



            callsState.callState = 'idle';



            callsState.activeCallId = null;



            callsState.serverCallId = null;



            callsState.localCallId = null;



        }



        



        // CRITICAL FIX: Restore governor to ACTIVE so next call attempt works



        if (CallsStateGovernor) {



            CallsStateGovernor._transitionLock = false;



            CallsStateGovernor._previousState = CallsStateGovernor._currentState;



            CallsStateGovernor._currentState = CALLS_STATE.ACTIVE;



        }



        



        // Clear any pending invitation timer



        if (callsState.callInvitationTimer) {



            clearTimeout(callsState.callInvitationTimer);



            callsState.callInvitationTimer = null;



        }



        



        // Notify UI of failure



        notifyListeners('call_initiation_failed', { 



            callId: callData.callId, 



            error: callData.error || 'Call initiation failed'



        });



        



        // Show error notification



        _showCallNotification(callData.error || 'Failed to start call', 'error');



        return;



    }



    



    // Success path — callData.callId is the real server UUID from /calls/start



    callsState.callData = callData;



    callsState.callState = 'initiated';



    // If server returned a real UUID (not our local call_ string), use it



    const serverCallId = callData.callId || callData.id || callData.serverCallId;



    const localCallId = callData.localCallId || callsState.activeCallId;



    callsState.activeCallId = serverCallId || localCallId;



    callsState.localCallId = localCallId;   // keep local id for reference



    callsState.serverCallId = serverCallId; // real DB UUID







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



    callsState.callParticipants = callData.participants || callData.call?.participants || [];



    callsState.callStartTime = Date.now();



    callsState.callType = callData.callType || callData.call?.type;



    callsState.callActive = true;



    



    if (callsState.callInvitationTimer) {



        clearTimeout(callsState.callInvitationTimer);



        callsState.callInvitationTimer = null;



    }



    



    notifyListeners('call_initiated', callData);



    



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



}







    function handleCallAccepted(callData) {

        logCall(MODULE, 'handleCallAccepted', callData);

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
        if (acceptedCallId && callsState._acceptedCallIds && callsState._acceptedCallIds.has(acceptedCallId)) {
            logWarn(MODULE, 'handleCallAccepted: duplicate delivery for already-accepted call, ignoring', acceptedCallId);
            return;
        }
        if (!callsState._acceptedCallIds) callsState._acceptedCallIds = new Set();
        if (acceptedCallId) callsState._acceptedCallIds.add(acceptedCallId);

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
        if (acceptedCallId && !callsState.serverCallId) {
            const _priorLocalId = callsState.activeCallId || callsState.localCallId;
            if (!callsState._callIdAliases) callsState._callIdAliases = new Map();
            if (_priorLocalId && _priorLocalId !== acceptedCallId) {
                callsState._callIdAliases.set(_priorLocalId, acceptedCallId);
            }
            callsState._callIdAliases.set(acceptedCallId, acceptedCallId);
            callsState.serverCallId = acceptedCallId;
            try {
                if (typeof WebRTCManager !== 'undefined' && WebRTCManager && WebRTCManager._currentCallId && WebRTCManager._currentCallId !== acceptedCallId) {
                    WebRTCManager._currentCallId = acceptedCallId;
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
        if (typeof _isStaleCallEvent === 'function' && _isStaleCallEvent(callData)) {
            logWarn(MODULE, 'handleCallAccepted: ignoring stale accept for a different/previous call', acceptedCallId);
            return;
        }

        if (acceptedCallId) {
            callsState.activeCallId = acceptedCallId;
            callsState.serverCallId = callsState.serverCallId || acceptedCallId;
        }
        if (callData && (callData.callType || callData.type)) {
            callsState.callType = callData.callType || callData.type;
        }
        callsState.callState = 'connecting';
        callsState.callActive = true;



        notifyListeners('call_accepted', callData);







        // ── CRITICAL FIX: Start WebRTC negotiation ──────────────────────────



        // The caller must create and send an SDP offer immediately after the



        // receiver accepts. Without this, WebRTC never connects → no audio.



        // Only the CALLER side creates the offer (not the receiver).



        // ✅ FIX: Use multiple sources for currentUserId
        const currentUserId = (callsState.session && callsState.session.userId)
            || (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.userId)
            || (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.user && window.__CHILD_SESSION__.user.id)
            || null;

        // ✅ FIX: isCaller with robust fallbacks
        const _isCallerByUserId = !!(currentUserId && callData && callData.callerId &&
            String(callData.callerId) === String(currentUserId));
        const _isCallerByState  = !!(callsState._isCaller === true);
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
                    const _gcCallId   = callData.callId || callsState.activeCallId;
                    const _gcGroupId  = callData.groupId || _gcCallId;
                    const _gcLocalUid = String(
                        (callsState.session && callsState.session.userId) ||
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
                var _gcCallId2   = callData.callId || callsState.activeCallId || callsState.serverCallId;
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

        if (WebRTCManager._peerConnection && callsState.callActive) {

            console.log('[CallsCore] ✅ CALL ACCEPTED — creating SDP offer for WebRTC');

            // FIX: Resolve the target user (receiver) for the offer.
            // callsState.activeCall.participants[0] is set when startCall() is called.
            // Also check callData fields as fallback.
            var _resolveOfferTarget = function() {
                if (callsState.activeCall && callsState.activeCall.participants && callsState.activeCall.participants.length > 0) {
                    var p = callsState.activeCall.participants[0];
                    return typeof p === 'object' ? (p.id || p.userId) : p;
                }
                return callData && (callData.receiverId || callData.calleeId || callData.targetUserId || callData.remoteUserId) || null;
            };

            WebRTCManager.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })



                .then(function(offer) {

                    const callId = callsState.serverCallId || callsState.activeCallId || (callData && callData.callId);

                    // FIX: targetUserId MUST be in the payload — backend silently drops offer if missing.
                    // Resolve from participants (set at startCall) or callData fields.
                    var _resolvedTarget = (function() {
                        if (callsState.activeCall && callsState.activeCall.participants && callsState.activeCall.participants.length > 0) {
                            var p = callsState.activeCall.participants[0];
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
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: 'SIGNAL_OFFER', payload: _offerPayload, source: 'calls-core-direct' }, '*');
                    }
                    // FIX-CALL-DIRECT: Emit directly via Socket.IO for lowest latency
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
                                    logCall(MODULE, 'Offer delivery confirmed by server', { callId: _offerId, attempt: attempt });
                                }
                            });
                            setTimeout(function() {
                                if (_acked) return;
                                var stillRelevant = typeof _isStaleCallEvent !== 'function' || !_isStaleCallEvent({ callId: _offerId });
                                // FIX-SIGNALING-ACK: don't retry into an already-connected
                                // call. An ack can go missing (network blip on the way
                                // back) even though the offer itself was delivered and
                                // the call proceeded to connect fine — resending in that
                                // case would hit setRemoteDescription('offer') on an
                                // already-stable peer connection and break it, per the
                                // documented InvalidStateError failure mode elsewhere in
                                // this file (see handleSignalOffer's duplicate-delivery fix).
                                var alreadyConnected = callsState.callState === 'connected' || callsState.callState === 'in-call';
                                if (!stillRelevant || alreadyConnected) {
                                    logWarn(MODULE, 'Offer ack timeout — not retrying (call no longer pending)', { callId: _offerId, state: callsState.callState });
                                    return;
                                }
                                if (attempt < 3) {
                                    logWarn(MODULE, `Offer ack timeout — retrying (attempt ${attempt + 1}/3)`, _offerId);
                                    sendOfferWithRetry(attempt + 1);
                                } else {
                                    logError(MODULE, 'Offer delivery failed after 3 attempts — target may be unreachable', null, { callId: _offerId });
                                }
                            }, 3000);
                        })(1);
                        console.log('[CallsCore] ✅ OFFER sent via Socket.IO to targetUserId:', _offTarget);
                    } else {
                        safeSend('SIGNAL_OFFER', _offerPayload, false);
                        console.log('[CallsCore] ✅ OFFER sent via safeSend (no direct socket). targetUserId:', _offTarget);
                    }



                })



                .catch(function(e) {



                    logError(MODULE, 'createOffer failed after call_accepted', e);



                });



        } else {



            logWarn(MODULE, 'handleCallAccepted: no peer connection — offer NOT sent', {



                hasPeerConn: !!WebRTCManager._peerConnection,



                callActive:  callsState.callActive



            });



        }



    }



    



    function handleCallStarted(callData) {
            // SCREEN MANAGER: switch to calling screen
            if (typeof window.showScreen === "function") { window.showScreen("calling"); }
            var __ov = document.getElementById("callOverlay"); if (__ov) __ov.setAttribute("data-state", "idle");



        logCall(MODULE, 'handleCallStarted', callData);



        



        callsState.callState = 'starting';



        notifyListeners('call_started', callData);



    }



    



    function handleCallConnected(callData) {
            // FIX: dedup, mirroring the same protection already on
            // handleCallAccepted (callsState._acceptedCallIds). This file has
            // multiple independent delivery paths for the same logical event
            // (two separate window 'message' listeners, plus the
            // oniceconnectionstatechange handler, each capable of reaching
            // handleCallConnected for the same call) and nothing here stopped
            // a second/third delivery from re-running this function's side
            // effects for a call that was already marked connected.
            var __connectedId = (callData && (callData.callId || callData.id)) || callsState.activeCallId || callsState.serverCallId || callsState.localCallId;
            var __resolveConn = (typeof resolveCallId === 'function') ? resolveCallId : function(x){ return x; };
            if (__connectedId) __connectedId = __resolveConn(__connectedId);
            if (__connectedId && callsState._connectedCallIds && callsState._connectedCallIds.has(__connectedId)) {
                logCall(MODULE, 'handleCallConnected: duplicate delivery ignored', __connectedId);
                return;
            }
            if (!callsState._connectedCallIds) callsState._connectedCallIds = new Set();
            if (__connectedId) callsState._connectedCallIds.add(__connectedId);

            // SCREEN MANAGER: switch to in-call screen
            if (typeof window.showScreen === "function") { window.showScreen("in-call"); }
            var __ov = document.getElementById("callOverlay"); if (__ov) __ov.setAttribute("data-state", "idle");



        logCall(MODULE, 'handleCallConnected', callData);



        



        callsState.callState = 'connected';



        callsState.callActive = true;



        callsState.callStartTime = callsState.callStartTime || Date.now();

        // CALLMANAGER BRIDGE: delegate connected event so CM owns the timer
        try {
            var _cm2 = window.__CallManager;
            var _sm2 = window.__CallStateMachine;
            var _CS2 = window.CALL_STATE;
            if (_cm2 && _sm2 && _CS2) {
                var _cid2 = callsState.activeCallId || callsState.serverCallId || callsState.localCallId;
                if (_cid2) {
                    if (!_sm2.getSession(_cid2)) {
                        _sm2.createSession(_cid2, callsState.callType || 'audio', (callsState.callParticipants && callsState.callParticipants[0]) || (callsState.callData && callsState.callData.callerId) || null, !!callsState._isCaller);
                        _sm2.transition(_cid2, _CS2.OUTGOING);
                        _sm2.transition(_cid2, _CS2.CONNECTING);
                    }
                    var _isVid2 = !!(callsState.callType === 'video');
                    _cm2.onConnected(_cid2, _isVid2);
                    _cmTimerDelegated = true;
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



            const id = callData.callId || callsState.activeCallId;



            if (!id) return;



            store.updateStatus(id, 'connected').catch(() => {});



        })();







        notifyListeners('call_connected', callData);



    }



    



    // FIX-MULTI-DEVICE-RING: the backend (CallSignalingService, see FEAT-02)
    // already emits 'call:accepted_elsewhere' to every OTHER socket of a user
    // when one of their devices accepts an incoming call — but calls-core.js's
    // _bindRealtime() RT_MAP never listened for it, so a second device (another
    // tab, phone + laptop, etc.) kept ringing indefinitely after the call was
    // answered elsewhere. resetCallState() only clears local state — it does
    // not emit any reject/end signal to the server — so calling it here is
    // safe: the server already knows the call was accepted on the other device.
    function handleCallAcceptedElsewhere(callData) {

        logCall(MODULE, 'handleCallAcceptedElsewhere', callData);

        // FIX-CALLID-RECONCILE (Phase 2): added retroactively — this handler
        // was modeled on the (at-the-time-also-unguarded) handleCallRejected
        // and inherited the same gap. A stale accepted_elsewhere for a
        // previous ring shouldn't be able to tear down a newer active call.
        if (typeof _isStaleCallEvent === 'function' && _isStaleCallEvent(callData)) {
            logWarn(MODULE, 'handleCallAcceptedElsewhere: ignoring stale event for a different/previous call', callData && (callData.callId || callData.id));
            return;
        }

        resetCallState();

        notifyListeners('call_accepted_elsewhere', callData);

    }

    function handleCallRejected(callData) {

        logCall(MODULE, 'handleCallRejected', callData);

        // FIX-CALLID-RECONCILE (Phase 2): this handler had no staleness/
        // callId-match check at all, unlike its sibling handlers
        // (handleCallEnded, handleCallConnected, handleCallFailed) which all
        // guard via _isStaleCallEvent(). A stale/duplicate call:rejected
        // event -- e.g. left over from a quick redial after a previous
        // attempt was declined, or a duplicate delivery racing a newer,
        // already-connected call -- would unconditionally call
        // resetCallState(), tearing down a perfectly healthy different call.
        if (typeof _isStaleCallEvent === 'function' && _isStaleCallEvent(callData)) {
            logWarn(MODULE, 'handleCallRejected: ignoring stale event for a different/previous call', callData && (callData.callId || callData.id));
            return;
        }

        resetCallState();

        notifyListeners('call_rejected', callData);

    }



    



    function handleCallEnded(callData) {
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
                    var __resolveId = (typeof resolveCallId === 'function') ? resolveCallId : function(x){ return x; };
                    if (String(__resolveId(__endedIncomingId)) !== String(__resolveId(__endedCurrentId))) {
                        logWarn(MODULE, 'handleCallEnded: ignoring stale event for a different/previous call', __endedIncomingId, __endedCurrentId);
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
                                logWarn(MODULE, 'handleCallEnded: stale-echo guard was likely a false positive (call still stuck active) — running nav-restore safety net for', __staleCallIdAtCheck);
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



        logCall(MODULE, 'handleCallEnded', callData);







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



            const id = callData.callId || callsState.activeCallId;



            if (!id) return;



            const status = callData.status || 'ended';



            const duration = callData.duration || 



                (callsState.callStartTime ? Math.floor((Date.now() - callsState.callStartTime) / 1000) : 0);



            store.updateStatus(id, status, { duration, endedAt: Date.now() }).catch(() => {});



        })();



        



        // ── FIX: This is the remote-hangup path (other party ended the call via
        // WebSocket). The comment above said "go idle then navigate back" but
        // resetCallState() wiped pendingCallReturnTo without ever telling the
        // parent to navigate — so whichever side received this event (caller
        // if receiver hung up, or vice versa) was left stuck on the call screen.
        var _hceReturnTarget = (callsState && (callsState.pendingCallReturnTo || callsState.pendingCallSource)) || 'conversations';

        resetCallState();

        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _hceReturnTarget, chatUserId: callsState.pendingCallReturnChatUserId || null, chatUserName: callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
            }
        } catch (_e) {}

        notifyListeners('call_ended', callData);



    }



    



// ADD THIS FUNCTION RIGHT AFTER handleCallEnded



function handleCallForceEnd(callData) {



    logCall(MODULE, 'Force ending call', callData);

    // FIX-CALLID-RECONCILE (Phase 2): both real-world triggers for this
    // function (CALL_CANCELLED, CALL_FORCE_END) carry a specific callId and
    // should be validated like every other terminal event -- a stale
    // force-end/cancel for an old call attempt shouldn't be able to nuke a
    // newer, genuinely active call's state.
    if (typeof _isStaleCallEvent === 'function' && _isStaleCallEvent(callData)) {
        logWarn(MODULE, 'handleCallForceEnd: ignoring stale event for a different/previous call', callData && (callData.callId || callData.id));
        return;
    }




    



    // Immediately reset all call state



    resetCallState();



    callsState.callActive = false;



    callsState.callState = 'idle';



    callsState.activeCallId = null;



    callsState.activeCall = null;



    callsState.callType = null;



    callsState.callParticipants = [];



    callsState.callStartTime = null;



    callsState.connectionState = 'new';



    callsState.signalingState = 'new';



    callsState.callData = null;



    



    // Clear timers



    if (callsState.callInvitationTimer) {



        clearTimeout(callsState.callInvitationTimer);



        callsState.callInvitationTimer = null;



    }



    



    // Clean up media



    if (MediaManager && MediaManager.stopLocalStream) {



        MediaManager.stopLocalStream();



    }



    if (WebRTCManager && WebRTCManager.close) {



        WebRTCManager.close();



    }



    



    // Notify UI to close



    notifyListeners('call_force_ended', callData);



    notifyListeners('call_ended', callData);



    



    // Force UI update



    if (typeof UIBridge !== 'undefined' && UIBridge._closeCallUI) {



        UIBridge._closeCallUI();



    }



    



    console.log('[CallsCore] Call force ended by remote user');



}







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
function _isStaleCallEvent(callData) {
    var incomingId = callData && (callData.callId || callData.id);
    if (!incomingId) return false;
    var currentId = callsState.activeCallId || callsState.serverCallId || callsState.localCallId;
    if (!currentId) return false;
    var resolve = (typeof resolveCallId === 'function') ? resolveCallId : function(x){ return x; };
    return String(resolve(incomingId)) !== String(resolve(currentId));
}

function handleCallFailed(callData) {

    logCall(MODULE, 'handleCallFailed', callData);

    if (_isStaleCallEvent(callData)) {
        logWarn(MODULE, 'handleCallFailed: ignoring stale event for a different/previous call', callData && (callData.callId || callData.id));
        return;
    }

    resetCallState();

    notifyListeners('call_failed', callData);

}

// De-duplicated: this used to be a second, full copy of handleCallFailed
// (identical body) rather than a genuine second implementation — collapsed
// to a thin alias so there's only one place to fix/maintain the logic above.
function handleCallFailed2(callData) { return handleCallFailed(callData); }

function handleCallTimeout(callData) {

    logCall(MODULE, 'handleCallTimeout', callData);

    if (_isStaleCallEvent(callData)) {
        logWarn(MODULE, 'handleCallTimeout: ignoring stale event for a different/previous call', callData && (callData.callId || callData.id));
        return;
    }

    resetCallState();

    notifyListeners('call_timeout', callData);

}

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



            window.showNotification(`New message from ${messageData.senderName}: ${messageData.text}`, 'message');



        }



    }



}







function _handleUserStatus(statusData) {



    console.log('[CallsCore] User status update:', statusData);



    



    // Update online status indicators



    updateOnlineStatusIndicators(statusData.userId, statusData.status === 'online');



    



    // Update call UI if user is in current call



    if (callsState.activeCallId && callsState.participants) {



        const participant = callsState.participants.find(p => p.id === statusData.userId);



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



            handleCallInitiated(callData);



            break;



        case 'call_accepted':



            handleCallAccepted(callData);
            // SCREEN MANAGER: directly switch to in-call screen, bypassing callOverlay
            if (typeof window.showScreen === "function") { window.showScreen("in-call"); }
            var __ov = document.getElementById("callOverlay"); if (__ov) __ov.setAttribute("data-state", "idle");



            break;



        case 'call_started':



            handleCallStarted(callData);



            break;



        case 'call_connected':



            handleCallConnected(callData);



            break;



        case 'call_rejected':



            handleCallRejected(callData);



            break;



        case 'call_ended':



            handleCallEnded(callData);



            break;



        case 'incoming_call':



            handleIncomingCall(callData);



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







    function handleCallBusy(callData) {



        logCall(MODULE, 'handleCallBusy', callData);



        



        resetCallState();



        notifyListeners('call_busy', callData);



    }



    



    // WebRTC Signaling Handlers (Real)



    function resolveCallId(id) {
        if (!id) return id;
        if (callsState._callIdAliases && callsState._callIdAliases.has(id)) {
            return callsState._callIdAliases.get(id);
        }
        return id;
    }

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
    function handleCallInitiatedAck(payload) {
        const serverCallId = payload && payload.callId;
        const localCallId = callsState.activeCallId || callsState.localCallId;
        logCall(MODULE, 'handleCallInitiatedAck', { serverCallId, localCallId });
        if (!serverCallId) return;

        if (!callsState._callIdAliases) callsState._callIdAliases = new Map();
        if (localCallId && localCallId !== serverCallId) {
            callsState._callIdAliases.set(localCallId, serverCallId);
        }
        callsState._callIdAliases.set(serverCallId, serverCallId);

        callsState.serverCallId = serverCallId;
        callsState.activeCallId = serverCallId;

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
            if (typeof WebRTCManager !== 'undefined' && WebRTCManager && WebRTCManager._currentCallId && WebRTCManager._currentCallId !== serverCallId) {
                WebRTCManager._currentCallId = serverCallId;
            }
        } catch (_) {}

        try { notifyListeners('call_initiated_ack', { callId: serverCallId, calleeName: payload.calleeName }); } catch (_) {}

        // FIX: also fixes the outgoing-call screen showing "User" instead of
        // the real callee name when calling from the Calls module — the
        // resolved name lives in this same payload and was never applied
        // because nothing was listening for this event at all.
        if (payload.calleeName) {
            callsState.remoteUserName = payload.calleeName;
            try {
                const nameEl = document.getElementById('callerName') || document.getElementById('outgoingCallName') || document.querySelector('.call-name');
                if (nameEl && (!nameEl.textContent || nameEl.textContent.trim() === 'User')) {
                    nameEl.textContent = payload.calleeName;
                }
            } catch (_) {}
        }
    }

    async function handleSignalOffer(payload) {



    logCall(MODULE, 'handleSignalOffer', { callId: payload.callId });

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
        if (!callsState._processedOfferKeys) callsState._processedOfferKeys = new Set();
        if (callsState._processedOfferKeys.has(_offerDedupKey)) {
            logWarn(MODULE, 'handleSignalOffer: duplicate delivery of same offer, ignoring', _offerDedupKey);
            return;
        }
        callsState._processedOfferKeys.add(_offerDedupKey);
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
    if (_offerCallId && typeof _isStaleCallEvent === 'function' && _isStaleCallEvent({ callId: _offerCallId })) {
        logWarn(MODULE, 'handleSignalOffer: ignoring stale offer for a different/previous call', _offerCallId);
        return;
    }



    



    // ✅ FIX: Force callsState.callActive = true when offer arrives on receiver side
    // so the offer is never dropped due to inactive state guard
    const _validOfferStates = ['initiating','initiated','incoming','connecting','in-call',
                               'starting','ringing','connected','in_call','in-progress',
                               'accepted','answering','call_ready'];
    // ✅ FIX: Queue offer if call not active yet — receiver may get offer before acceptCall completes
    if (!callsState.callActive && !_validOfferStates.includes(callsState.callState)) {
        if (!window.__pendingOfferPayload) {
            window.__pendingOfferPayload = payload;
            window.__pendingOfferRetries = 0;
            var _offerRetryInterval = setInterval(function() {
                window.__pendingOfferRetries = (window.__pendingOfferRetries || 0) + 1;
                if (callsState.callActive || _validOfferStates.includes(callsState.callState)) {
                    clearInterval(_offerRetryInterval);
                    var _q = window.__pendingOfferPayload; window.__pendingOfferPayload = null;
                    if (_q) handleSignalOffer(_q);
                } else if (window.__pendingOfferRetries >= 15) {
                    clearInterval(_offerRetryInterval);
                    callsState.callActive = true;
                    var _q2 = window.__pendingOfferPayload; window.__pendingOfferPayload = null;
                    if (_q2) handleSignalOffer(_q2);
                }
            }, 200);
        }
        logWarn(MODULE, 'Signal offer queued — callState:', callsState.callState);
        return;
    }
    if (!callsState.callActive && _validOfferStates.includes(callsState.callState)) {
        callsState.callActive = true;
        console.log('[CallsCore] handleSignalOffer: forced callActive=true (state:', callsState.callState, ')');
    }



    



    if (!WebRTCManager._peerConnection) {



        // Receiver may not have set up PC yet if acceptCall hasn't finished



        logWarn(MODULE, 'No peer connection for signal offer — attempting to create one');



        try {



            const constraints = { audio: CONFIG.AUDIO_CONSTRAINTS, video: callsState.callType === 'video' };



            const streamResult = await MediaManager.getLocalStream(constraints);



            if (streamResult.success) {



                WebRTCManager.createPeerConnection();



                WebRTCManager.addStream(streamResult.stream);



                WebRTCManager.setCurrentCallId(callsState.activeCallId);



                console.log('[CallsCore] ✅ Peer connection created for incoming offer');



            } else {



                logError(MODULE, 'Could not get local stream for offer handling');



                return;



            }



        } catch (e) {



            logError(MODULE, 'Failed to create peer connection for offer', e);



            return;



        }



    }



    



    try {



        await WebRTCManager.setRemoteDescription(payload.offer);



        console.log('[CallsCore] Remote description (offer) set');







        const answer = await WebRTCManager.createAnswer();



        



        // FIXED: Send as direct message type, not as ACTION



        // FIX: targetUserId MUST be in the answer payload — the backend routes the
        // answer back to the original caller. payload.callerId is the caller's ID.
        var _answerTargetId = (payload && (payload.callerId || payload.callerId)) ||
                              (callsState.callData && callsState.callData.callerId) || null;
        var _answerPayload = {
            callId: payload.callId || callsState.activeCallId,
            answer: answer,
            targetUserId: _answerTargetId,
            remoteUserId: _answerTargetId,
            timestamp: Date.now()
        };
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'SIGNAL_ANSWER', payload: _answerPayload, source: 'calls-core-direct' }, '*');
        }
        // Also emit directly via Socket.IO for reliability
        var _directSockAns = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
        if (_directSockAns && typeof _directSockAns.emit === 'function' && _answerTargetId) {
            _directSockAns.emit('call:webrtc_answer', {
                callId: _answerPayload.callId, targetUserId: _answerTargetId, answer: answer,
            });
            console.log('[CallsCore] ✅ ANSWER sent via Socket.IO to caller:', _answerTargetId);
        } else {
            safeSend('SIGNAL_ANSWER', _answerPayload, false);
            console.log('[CallsCore] ✅ ANSWER sent via safeSend. targetUserId:', _answerTargetId);
        }
        DiagnosticsAgent.record('signaling_send');



        



    } catch (error) {



        logError(MODULE, 'Failed to handle signal offer', error);



    }



}



    async function handleSignalAnswer(payload) {



        logCall(MODULE, 'handleSignalAnswer', { callId: payload.callId });

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
        if (!callsState._processedAnswerKeys) callsState._processedAnswerKeys = new Set();
        if (callsState._processedAnswerKeys.has(_ansDedupKey)) {
            logWarn(MODULE, 'handleSignalAnswer: duplicate delivery of same answer, ignoring', _ansDedupKey);
            return;
        }
        callsState._processedAnswerKeys.add(_ansDedupKey);
    }

    // FIX-CALLID-RECONCILE (Phase 2): call:answer is explicitly one of the
    // events that must be verified against the single immutable callId —
    // same gap and same fix as handleSignalOffer above, on the caller's
    // side this time. A stale answer for a previous, already-ended call
    // attempt arriving late would otherwise be applied via
    // setRemoteDescription() to whatever peer connection is CURRENTLY
    // active, corrupting the real negotiation.
    if (_ansCallId && typeof _isStaleCallEvent === 'function' && _isStaleCallEvent({ callId: _ansCallId })) {
        logWarn(MODULE, 'handleSignalAnswer: ignoring stale answer for a different/previous call', _ansCallId);
        return;
    }



        



        // FIX: allow all valid mid-call states for signal answer too
        const _validAnsStates = ['initiating','initiated','connecting','in-call',
                                  'in_call','starting','ringing','connected',
                                  'in-progress','accepted','answering','call_ready','incoming'];
        if (!callsState.callActive && !_validAnsStates.includes(callsState.callState)) {



            logWarn(MODULE, 'Signal answer received but no active call');



            return;



        }



        



        // ✅ FIX: Queue answer if no peer connection yet (timing issue)
        if (!WebRTCManager._peerConnection) {
            if (!window.__pendingAnswerPayload) {
                window.__pendingAnswerPayload = payload;
                var _ansRetries = 0;
                var _ansInterval = setInterval(function() {
                    _ansRetries++;
                    if (WebRTCManager._peerConnection) {
                        clearInterval(_ansInterval);
                        var q = window.__pendingAnswerPayload; window.__pendingAnswerPayload = null;
                        if (q) handleSignalAnswer(q);
                    } else if (_ansRetries >= 15) {
                        clearInterval(_ansInterval);
                        window.__pendingAnswerPayload = null;
                        logWarn(MODULE, 'Answer dropped: no peer connection after 3s');
                    }
                }, 200);
            }
            logWarn(MODULE, 'Signal answer queued — waiting for peer connection');
            return;
        }



        



        try {



            await WebRTCManager.setRemoteDescription(payload.answer);



            DiagnosticsAgent.record('signaling_recv');



            console.log('[CallsCore] ✅ ANSWER RECEIVED — remote description set');







            // Flush any ICE candidates that arrived before the answer was set



            if (callsState.iceCandidates && callsState.iceCandidates.length > 0) {



                console.log('[CallsCore] Flushing', callsState.iceCandidates.length, 'queued ICE candidates');



                const queued = callsState.iceCandidates.splice(0);



                for (const candidate of queued) {



                    try { await WebRTCManager.addIceCandidate(candidate); } catch (_) {}



                }



            }



        } catch (error) {



            logError(MODULE, 'Failed to handle signal answer', error);



        }



    }



    



    async function handleIceCandidate(payload) {



    logCall(MODULE, 'handleIceCandidate', { callId: payload.callId });

    // FIX: same dual-listener duplicate-delivery pattern as handleSignalOffer
    // and handleSignalAnswer above. Duplicate ICE candidates are usually
    // harmless (browsers silently ignore an already-added candidate), but
    // skip the redundant work and log noise consistently with those fixes.
    const _iceCallId = payload && (payload.callId || payload.id);
    const _iceCandKey = payload && payload.candidate ? JSON.stringify(payload.candidate).length + ':' + (payload.candidate.sdpMLineIndex || 0) : 0;
    const _iceDedupKey = _iceCallId ? (String(_iceCallId) + ':' + _iceCandKey) : null;
    if (_iceDedupKey) {
        if (!callsState._processedIceKeys) callsState._processedIceKeys = new Set();
        if (callsState._processedIceKeys.has(_iceDedupKey)) {
            return;
        }
        callsState._processedIceKeys.add(_iceDedupKey);
    }



    



    // ✅ FIX: Accept ICE candidates in all transitional states including 'incoming' and 'ringing'
    const _validIceStates = ['initiating','initiated','incoming','ringing','connecting','in-call','in_call','connected','starting'];
    if (!callsState.callActive && !_validIceStates.includes(callsState.callState)) {
        // Queue the candidate for later rather than dropping it
        if (!callsState.iceCandidates) callsState.iceCandidates = [];
        callsState.iceCandidates.push(payload.candidate);
        logWarn(MODULE, 'ICE candidate queued (no active call yet) — state:', callsState.callState);
        return;
    }



    



    if (!WebRTCManager._peerConnection) {



        logWarn(MODULE, 'No peer connection for ICE candidate — queueing');



        // Queue the candidate if remote description not yet set



        callsState.iceCandidates.push(payload.candidate);



        return;



    }



    



    try {



        await WebRTCManager.addIceCandidate(payload.candidate);



        DiagnosticsAgent.record('signaling_recv');



        console.log('[CallsCore] ✅ ICE CANDIDATE applied from remote peer');



        // NOTE: Do NOT re-forward received ICE candidates — that causes a loop.



        // Outbound ICE candidates are sent in WebRTCManager._setupPeerConnectionListeners



        // via the onicecandidate callback.



    } catch (error) {



        logError(MODULE, 'Failed to add ICE candidate', error);



    }



}



    



    function handleRemoteStreamAdded(payload) {



        if (payload.stream) {



            callsState.remoteStream = payload.stream;



            logCall(MODULE, 'Remote stream added');



            notifyListeners('remote_stream_added', payload);



        }



    }



    



    function handleRemoteStreamRemoved(payload) {



        callsState.remoteStream = null;



        logCall(MODULE, 'Remote stream removed');



        notifyListeners('remote_stream_removed', payload);



    }



    



    function handleInitData(message) {



        const data = message.payload || message.data || {};



        



        logSuccess(MODULE, 'Received module init data', {



            hasSession: !!(data.session || data.user)



        });



        



        if (data.session) {



            // Validate session before applying



            if (__isValidSession(data.session)) {



                callsState.session = data.session;



                if (data.session.token) callsState.token = data.session.token;



                callsState.sessionReceived = true;



                callsState.sessionStatus = 'valid';



                validSessionConfirmed = true;



            } else {



                logWarn(MODULE, 'Init data session rejected - invalid', data.session);



            }



        } else if (data.user) {



            const candidateSession = {



                user: data.user,



                token: data.token,



                authenticated: data.authenticated !== false,



                userId: data.user.id,



                expiresAt: data.expiresAt || Date.now() + 3600000



            };



            if (__isValidSession(candidateSession)) {



                callsState.session = candidateSession;



                if (data.token) callsState.token = data.token;



                if (data.user && data.token) {



                    callsState.sessionReceived = true;



                    callsState.sessionStatus = 'valid';



                    validSessionConfirmed = true;



                }



            } else {



                logWarn(MODULE, 'Init data session rejected - invalid user data');



            }



        }



        



        if (data.isPremium !== undefined) {



            callsState.isPremium = data.isPremium;



        }



        



        if (data.premiumFeatures) {



            callsState.premiumFeatures = { ...callsState.premiumFeatures, ...data.premiumFeatures };



        }



        



        callsState.initialized = true;



        



        notifyListeners('module_ready', {



            session: callsState.session,



            isPremium: callsState.isPremium



        });



        



        logSuccess(MODULE, 'Module initialization complete');



    }



    




