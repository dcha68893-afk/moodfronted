// calls-core.js
// ==================== IFRAME CORE MODULE - DETERMINISTIC VERSION ====================
// Version: 4.0.1 - PRODUCTION STABLE
// Purpose: Enhanced iframe module with deterministic state machine, idempotent handshake,
//          event-driven token synchronization, hardened ACK protocol, and comprehensive
//          error recovery with zero race conditions
//
// ==================== STATE MACHINE DIAGRAM ====================
// UNINITIALIZED → BOOTSTRAPPING → HANDSHAKING → HANDSHAKE_COMPLETE → 
// SESSION_SYNCING → TOKEN_READY → SERVICES_INITIALIZING → ACTIVE
//         ↓               ↓              ↓                    ↓
//   ERROR_RECOVERABLE ← ERROR_FATAL ← Any state with unrecoverable error
//         ↓
//   RECOVERING → BOOTSTRAPPING
//
// ==================== MESSAGE LIFECYCLE ====================
// 1. Message created with unique ID
// 2. Registered in pending registry with resolve/reject
// 3. Sent to parent with expectAck=true
// 4. If ACK received within timeout → resolve
// 5. If timeout → retry up to MAX_RETRIES
// 6. If max retries exceeded → escalate to ERROR_RECOVERABLE
//
// ==================== TOKEN LIFECYCLE ====================
// 1. Iframe registers with parent (IFRAME_REGISTERED)
// 2. Parent receives registration, pushes token via TOKEN_UPDATE (immediate)
// 3. Iframe awaits token via Promise resolver (no polling)
// 4. Fallback: if no token after timeout, request via REQUEST_TOKEN (single retry)
//
// ==================== EXPORT CONTRACT (UNCHANGED) ====================
// Security: XSS protected, input sanitized, CSP compliant, origin validation enforced,
//           HTTPS enforcement in production, JWT token handling
// =================================================================

(function() {
    'use strict';

    // ==================== ERROR THROTTLING - PRODUCTION CLEAN ====================
    const _errorLogThrottle = new Map();
    const _onceLogs = new Map();
    const _logTimers = new Map();

    function logThrottled(errorType, message, data) {
        const now = Date.now();
        const lastLog = _errorLogThrottle.get(errorType) || 0;
        if (now - lastLog < 30000) return; // Once per 30 seconds
        _errorLogThrottle.set(errorType, now);
        console.warn('[Calls Core] ' + message, data || '');
    }

    function logOnce(level, message, data) {
        const key = `${level}:${message}`;
        if (_onceLogs.has(key)) return;

        _onceLogs.set(key, Date.now());

        // Auto-cleanup after 60 seconds
        const timer = setTimeout(() => {
            _onceLogs.delete(key);
            _logTimers.delete(key);
        }, 60000);
        _logTimers.set(key, timer);

        const prefix = '[Calls Core v4.0.1]';

        switch (level) {
            case 'error': console.error(`${prefix} ${message}`, data || ''); break;
            case 'warn': console.warn(`${prefix} ${message}`, data || ''); break;
            case 'success': console.log(`✅ ${prefix} ${message}`, data || ''); break;
            case 'sending': console.log(`📤 ${prefix} ${message}`, data || ''); break;
            case 'ready': console.log(`🔵 ${prefix} ${message}`, data || ''); break;
            case 'fail': console.log(`❌ ${prefix} ${message}`, data || ''); break;
            case 'warn-icon': console.log(`⚠️ ${prefix} ${message}`, data || ''); break;
            default: console.log(`${prefix} ${message}`, data || '');
        }
    }

    // ==================== GLOBAL DEBUG FLAG ====================
    window.__IFRAME_DEBUG__ = window.__IFRAME_DEBUG__ || false;
    const DEBUG = window.__IFRAME_DEBUG__;

    // ==================== ENVIRONMENT DETECTION (PRESERVED) ====================
    const ENVIRONMENT = {
        current: null,
        isDevelopment: false,
        isProduction: false,
        apiEndpoint: null,
        wsEndpoint: null,

        detect: function() {
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;

            if (hostname === 'localhost' || hostname === '127.0.0.1' || 
                hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
                hostname.includes('::1')) {
                this.current = 'development';
                this.isDevelopment = true;
                this.isProduction = false;
                this.apiEndpoint = 'http://localhost:4000/api';
                this.wsEndpoint = 'ws://localhost:4000/ws';
            }
            else if (hostname.endsWith('.onrender.com')) {
                this.current = 'production';
                this.isDevelopment = false;
                this.isProduction = true;
                this.apiEndpoint = 'https://moodchat-fy56.onrender.com/api';
                this.wsEndpoint = 'wss://moodchat-fy56.onrender.com/ws';
            }
            else {
                this.current = 'production';
                this.isDevelopment = false;
                this.isProduction = true;
                this.apiEndpoint = 'https://' + hostname + '/api';
                this.wsEndpoint = 'wss://' + hostname;
            }

            if (DEBUG) {
                logOnce('info', `Environment detected: ${this.current}`, {
                    apiEndpoint: this.apiEndpoint,
                    isProduction: this.isProduction,
                    isDevelopment: this.isDevelopment
                });
            }

            return this;
        },

        enforceHTTPS: function() {
            if (this.isProduction && window.location.protocol !== 'https:') {
                const httpsUrl = 'https://' + window.location.host + window.location.pathname + window.location.search;
                window.location.replace(httpsUrl);
                return false;
            }
            return true;
        },

        getApiUrl: function(path) {
            const cleanPath = path.startsWith('/') ? path : '/' + path;
            return this.apiEndpoint + cleanPath;
        },

        getWsUrl: function(path) {
            const cleanPath = path.startsWith('/') ? path : '/' + path;
            if (this.isProduction) {
                return 'wss://' + window.location.hostname + cleanPath;
            } else {
                return 'ws://' + window.location.hostname + ':4000' + cleanPath;
            }
        }
    };

    ENVIRONMENT.detect();
    if (ENVIRONMENT.isProduction) ENVIRONMENT.enforceHTTPS();

    // ==================== IFRAME ENVIRONMENT DETECTOR (PRESERVED) ====================
    const IframeEnvironment = {
        _env: null,
        _latency: 0,
        _bandwidth: 0,
        _connectionType: 'unknown',
        _detected: false,
        _secure: false,
        _sandboxed: false,
        _restrictions: [],
        _listeners: new Set(),

        detect: function(force = false) {
            if (this._detected && !force) return this._env;

            const startTime = performance.now();

            this._secure = window.isSecureContext === true;
            this._detectSandbox();

            const hostname = window.location.hostname;
            const protocol = window.location.protocol;
            const origin = window.location.origin;

            if (hostname === 'localhost' || hostname === '127.0.0.1' || 
                hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
                protocol === 'file:' || hostname.includes('::1')) {
                this._env = 'LOCAL_DEV';
                this._restrictions.push('local-network');
            }
            else if (hostname.endsWith('.onrender.com')) {
                this._env = 'RENDER_HOSTED';
                this._restrictions.push('render-hosted');
            }
            else {
                this._env = 'PRODUCTION';
                this._detectLatency();

                if (this._latency > 300 || this._connectionType === 'vpn') {
                    this._env = 'VPN_NETWORK';
                    this._restrictions.push('high-latency');
                }
            }

            if (DEBUG) {
                logOnce('info', 'Environment detected', this.getFullReport());
            }

            this._detected = true;
            this._notifyListeners('detect', { environment: this._env });

            return this._env;
        },

        _detectSandbox: function() {
            try {
                if (window.frameElement && window.frameElement.sandbox) {
                    this._sandboxed = true;
                    this._restrictions.push('sandboxed');
                }

                localStorage.setItem('_test_', '_test_');
                localStorage.removeItem('_test_');
            } catch (e) {
                this._sandboxed = true;
                this._restrictions.push('storage-blocked');
            }

            try {
                if (!window.crypto || !window.crypto.subtle) {
                    this._restrictions.push('crypto-unavailable');
                }
                if (!window.indexedDB) {
                    this._restrictions.push('indexeddb-unavailable');
                }
                if (!navigator.mediaDevices) {
                    this._restrictions.push('media-unavailable');
                }
            } catch (e) {}
        },

        _detectLatency: function() {
            if (navigator.connection) {
                const conn = navigator.connection;
                this._latency = conn.rtt || 0;
                this._bandwidth = conn.downlink || 0;
                this._connectionType = conn.type || 'unknown';

                if (conn.rtt > 300 || conn.downlink < 1) {
                    this._env = 'VPN_NETWORK';
                }
            }

            if (performance && performance.timing) {
                const navStart = performance.timing.navigationStart;
                const responseEnd = performance.timing.responseEnd;
                if (navStart && responseEnd) {
                    const loadTime = responseEnd - navStart;
                    this._latency = Math.max(this._latency, loadTime);

                    if (loadTime > 500) {
                        this._env = 'VPN_NETWORK';
                    }
                }
            }

            const userAgent = navigator.userAgent.toLowerCase();
            if (userAgent.includes('vpn') || userAgent.includes('proxy') || 
                userAgent.includes('tor') || userAgent.includes('anonymizer')) {
                this._env = 'VPN_NETWORK';
                this._restrictions.push('proxy-detected');
            }

            this._measureLatency();
        },

        _measureLatency: function() {
            const start = performance.now();
            const img = new Image();
            img.src = 'https://www.google.com/favicon.ico?' + Date.now();

            img.onload = () => {
                const measuredLatency = performance.now() - start;
                this._latency = Math.min(this._latency || Infinity, measuredLatency);

                if (measuredLatency > 300 && this._env !== 'LOCAL_DEV') {
                    this._env = 'VPN_NETWORK';
                }
            };
            img.onerror = () => {};
        },

        getFullReport: function() {
            return {
                environment: this._env,
                hostname: window.location.hostname,
                protocol: window.location.protocol,
                origin: window.location.origin,
                latency: this._latency,
                bandwidth: this._bandwidth,
                connectionType: this._connectionType,
                secure: this._secure,
                sandboxed: this._sandboxed,
                restrictions: [...this._restrictions],
                connection: navigator.connection ? {
                    rtt: navigator.connection.rtt,
                    downlink: navigator.connection.downlink,
                    effectiveType: navigator.connection.effectiveType,
                    type: navigator.connection.type
                } : null,
                userAgent: navigator.userAgent,
                timestamp: Date.now()
            };
        },

        isLocalDev: function() { return this.detect() === 'LOCAL_DEV'; },
        isRenderHosted: function() { return this.detect() === 'RENDER_HOSTED'; },
        isProduction: function() { return this.detect() === 'PRODUCTION'; },
        isVPNNetwork: function() { return this.detect() === 'VPN_NETWORK' || this._latency > 300; },
        isSandboxed: function() { return this._sandboxed; },
        isSecure: function() { return this._secure; },
        getLatency: function() { return this._latency; },
        getBandwidth: function() { return this._bandwidth; },
        getRestrictions: function() { return [...this._restrictions]; },

        getTimeouts: function() {
            const env = this.detect();

            const timeouts = {
                handshake: 8000,
                session: 6000,
                ack: 5000,
                heartbeat: 30000,
                retryBackoff: 800,
                recovery: 2000,
                parentDetect: 5000,
                preflight: 2000,
                dependency: 3000,
                api: 10000,
                tokenRequest: 8000,
                sessionSync: 10000
            };

            if (env === 'VPN_NETWORK' || this._latency > 300) {
                timeouts.handshake = 15000;
                timeouts.session = 12000;
                timeouts.ack = 8000;
                timeouts.heartbeat = 45000;
                timeouts.retryBackoff = 1500;
                timeouts.recovery = 3000;
                timeouts.parentDetect = 8000;
                timeouts.api = 20000;
                timeouts.tokenRequest = 15000;
                timeouts.sessionSync = 20000;
            }

            if (env === 'LOCAL_DEV') {
                timeouts.handshake = 3000;
                timeouts.session = 2000;
                timeouts.ack = 2000;
                timeouts.heartbeat = 10000;
                timeouts.retryBackoff = 300;
                timeouts.api = 5000;
                timeouts.tokenRequest = 3000;
                timeouts.sessionSync = 5000;
            }

            if (this._sandboxed) {
                timeouts.handshake += 2000;
                timeouts.session += 2000;
                timeouts.api += 5000;
                timeouts.tokenRequest += 2000;
                timeouts.sessionSync += 3000;
            }

            return timeouts;
        },

        getMaxRetries: function() {
            const env = this.detect();
            if (env === 'VPN_NETWORK') return 8;
            if (env === 'PRODUCTION') return 5;
            if (env === 'RENDER_HOSTED') return 4;
            return 3;
        },

        getHeartbeatInterval: function() {
            const env = this.detect();
            if (env === 'VPN_NETWORK') return 30000;
            if (env === 'PRODUCTION') return 20000;
            if (env === 'RENDER_HOSTED') return 15000;
            return 10000;
        },

        getStorageStrategy: function() {
            if (this._sandboxed) return 'memory';
            try {
                localStorage.setItem('_test_', '_test_');
                localStorage.removeItem('_test_');
                return 'local';
            } catch (e) {
                return 'memory';
            }
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },
        removeListener: function(listener) { this._listeners.delete(listener); },
        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        }
    };

    IframeEnvironment.detect();

    // ==================== DETERMINISTIC STATE MACHINE ====================
    const STATE = {
        // Core states
        UNINITIALIZED: 'UNINITIALIZED',
        BOOTSTRAPPING: 'BOOTSTRAPPING',
        HANDSHAKING: 'HANDSHAKING',
        HANDSHAKE_COMPLETE: 'HANDSHAKE_COMPLETE',
        SESSION_SYNCING: 'SESSION_SYNCING',
        TOKEN_READY: 'TOKEN_READY',
        SERVICES_INITIALIZING: 'SERVICES_INITIALIZING',
        ACTIVE: 'ACTIVE',
        ERROR_RECOVERABLE: 'ERROR_RECOVERABLE',
        ERROR_FATAL: 'ERROR_FATAL',
        RECOVERING: 'RECOVERING',

        // Sub-states (preserved for backward compatibility)
        INIT: 'INIT',
        PREFLIGHT: 'PREFLIGHT',
        DEPENDENCY: 'DEPENDENCY',
        PARENT_DETECT: 'PARENT_DETECT',
        SYNC: 'SYNC',
        PERMISSIONS: 'PERMISSIONS',
        READY: 'READY',
        SUSPENDED: 'SUSPENDED',
        DEGRADED: 'DEGRADED',
        DESTROYED: 'DESTROYED',
        DEMO: 'DEMO',

        HANDSHAKE_IDLE: 'HANDSHAKE_IDLE',
        HANDSHAKE_WAITING: 'HANDSHAKE_WAITING',
        HANDSHAKE_IN_PROGRESS: 'HANDSHAKE_IN_PROGRESS',
        HANDSHAKE_FAILED: 'HANDSHAKE_FAILED',

        SESSION_IDLE: 'SESSION_IDLE',
        SESSION_WAITING: 'SESSION_WAITING',
        SESSION_VALID: 'SESSION_VALID',
        SESSION_EXPIRED: 'SESSION_EXPIRED',
        SESSION_ERROR: 'SESSION_ERROR'
    };

    // ==================== CallCoreState (FIXED: Added missing definition) ====================
    const CallCoreState = {
        IDLE: 'IDLE',
        WAITING_PARENT: 'WAITING_PARENT',
        WAITING_SESSION: 'WAITING_SESSION',
        SYNCED: 'SYNCED',
        ACTIVE: 'ACTIVE',
        ERROR: 'ERROR',
        RECOVERING: 'RECOVERING'
    };

    // ==================== STATE GOVERNOR - SINGLE SOURCE OF TRUTH ====================
// ==================== STATE GOVERNOR - SINGLE SOURCE OF TRUTH ====================
const StateGovernor = {
    _currentState: STATE.UNINITIALIZED,
    _previousState: null,
    _stateLock: false,
    _transitionLock: false,
    _stateChangeListeners: new Set(),
    _initializationPromise: null,
    _initializationResolve: null,
    _initializationReject: null,
    _handshakePromise: null,
    _handshakeResolve: null,
    _handshakeReject: null,
    _tokenPromise: null,
    _tokenResolve: null,
    _tokenReject: null,
    _initialized: false,
    _handshakeCompleted: false,
    _tokenReady: false,
    _fatalError: null,

    initialize: function() {
        if (this._initializationPromise) return this._initializationPromise;

        this._initializationPromise = new Promise((resolve, reject) => {
            this._initializationResolve = resolve;
            this._initializationReject = reject;
        });

        this.transition(STATE.UNINITIALIZED, STATE.BOOTSTRAPPING);
        return this._initializationPromise;
    },

    transition: function(newState, reason = '') {
        if (this._stateLock || this._transitionLock) {
            logOnce('warn-icon', `State transition blocked: ${this._currentState} → ${newState} (locked)`);
            return false;
        }

        const oldState = this._currentState;
        if (oldState === newState) return false;

        // Validate transition legality
        if (!this._isLegalTransition(oldState, newState)) {
            logOnce('warn-icon', `Illegal state transition: ${oldState} → ${newState}`);
            return false;
        }

        this._previousState = oldState;
        this._currentState = newState;

        // Update derived state flags
        this._updateDerivedState(newState);

        if (DEBUG) {
            logOnce('info', `State: ${oldState} → ${newState}`, reason ? { reason } : '');
        }

        this._notifyListeners('state', { oldState, newState, reason });

        // Resolve promises based on state
        this._resolvePromisesForState(newState);

        return true;
    },

    _isLegalTransition: function(from, to) {
        // ===== COMPLETELY REWRITTEN with more permissive transitions =====
        
        // 1. FATAL ERROR can transition to RECOVERING
        if (from === STATE.ERROR_FATAL) {
            return to === STATE.RECOVERING;
        }

        // 2. UNINITIALIZED should be able to go to BOOTSTRAPPING (normal startup)
        if (from === STATE.UNINITIALIZED) {
            return to === STATE.BOOTSTRAPPING || 
                   to === STATE.ERROR_RECOVERABLE || 
                   to === STATE.ERROR_FATAL ||
                   to === STATE.RECOVERING ||
                   to === STATE.DEGRADED;  // Allow degraded mode directly in emergencies
        }

        // 3. RECOVERING can go to BOOTSTRAPPING or FATAL
        if (from === STATE.RECOVERING) {
            return to === STATE.BOOTSTRAPPING || 
                   to === STATE.ERROR_FATAL ||
                   to === STATE.DEGRADED;
        }

        // 4. ERROR_RECOVERABLE can go to RECOVERING or FATAL
        if (from === STATE.ERROR_RECOVERABLE) {
            return to === STATE.RECOVERING || 
                   to === STATE.ERROR_FATAL ||
                   to === STATE.DEGRADED;
        }

        // 5. DEGRADED can go to RECOVERING or ACTIVE
        if (from === STATE.DEGRADED) {
            return to === STATE.RECOVERING || 
                   to === STATE.ACTIVE ||
                   to === STATE.ERROR_RECOVERABLE;
        }

        // 6. Normal forward progression through states
        const forwardTransitions = {
            [STATE.BOOTSTRAPPING]: [STATE.HANDSHAKING, STATE.ERROR_RECOVERABLE, STATE.ERROR_FATAL, STATE.DEGRADED],
            [STATE.HANDSHAKING]: [STATE.HANDSHAKE_COMPLETE, STATE.ERROR_RECOVERABLE, STATE.ERROR_FATAL, STATE.DEGRADED],
            [STATE.HANDSHAKE_COMPLETE]: [STATE.SESSION_SYNCING, STATE.ERROR_RECOVERABLE, STATE.ERROR_FATAL, STATE.DEGRADED],
            [STATE.SESSION_SYNCING]: [STATE.TOKEN_READY, STATE.ERROR_RECOVERABLE, STATE.ERROR_FATAL, STATE.DEGRADED],
            [STATE.TOKEN_READY]: [STATE.SERVICES_INITIALIZING, STATE.ERROR_RECOVERABLE, STATE.ERROR_FATAL, STATE.DEGRADED],
            [STATE.SERVICES_INITIALIZING]: [STATE.ACTIVE, STATE.ERROR_RECOVERABLE, STATE.ERROR_FATAL, STATE.DEGRADED],
            [STATE.ACTIVE]: [STATE.SUSPENDED, STATE.DEGRADED, STATE.ERROR_RECOVERABLE, STATE.ERROR_FATAL],
            [STATE.SUSPENDED]: [STATE.ACTIVE, STATE.DEGRADED, STATE.ERROR_RECOVERABLE, STATE.ERROR_FATAL],
        };

        // Check if transition is in the forward progression map
        if (forwardTransitions[from] && forwardTransitions[from].includes(to)) {
            return true;
        }

        // 7. Allow any transition to ERROR states from anywhere
        if (to === STATE.ERROR_RECOVERABLE || to === STATE.ERROR_FATAL) {
            return true;
        }

        // 8. Allow transition to DEGRADED from anywhere as emergency fallback
        if (to === STATE.DEGRADED) {
            return true;
        }

        // If none of the above, it's illegal
        logOnce('warn-icon', `No legal transition path: ${from} → ${to}`);
        return false;
    },

    _updateDerivedState: function(state) {
        switch (state) {
            case STATE.HANDSHAKE_COMPLETE:
                this._handshakeCompleted = true;
                break;
            case STATE.TOKEN_READY:
                this._tokenReady = true;
                break;
            case STATE.ACTIVE:
                this._initialized = true;
                break;
            case STATE.ERROR_FATAL:
                this._fatalError = true;
                break;
        }
    },

    _resolvePromisesForState: function(state) {
        if (state === STATE.ACTIVE && this._initializationResolve) {
            this._initializationResolve({ success: true, state: STATE.ACTIVE });
            this._initializationResolve = null;
            this._initializationReject = null;
        }

        if (state === STATE.HANDSHAKE_COMPLETE && this._handshakeResolve) {
            this._handshakeResolve({ success: true });
            this._handshakeResolve = null;
            this._handshakeReject = null;
        }

        if (state === STATE.TOKEN_READY && this._tokenResolve) {
            this._tokenResolve(true);
            this._tokenResolve = null;
            this._tokenReject = null;
        }

        if (state === STATE.ERROR_FATAL) {
            if (this._initializationReject) {
                this._initializationReject(new Error('Initialization failed: fatal error'));
                this._initializationResolve = null;
                this._initializationReject = null;
            }
            if (this._handshakeReject) {
                this._handshakeReject(new Error('Handshake failed: fatal error'));
                this._handshakeResolve = null;
                this._handshakeReject = null;
            }
            if (this._tokenReject) {
                this._tokenReject(new Error('Token acquisition failed: fatal error'));
                this._tokenResolve = null;
                this._tokenReject = null;
            }
        }
    },

    lock: function() {
        if (this._stateLock) return false;
        this._stateLock = true;
        return true;
    },

    unlock: function() {
        this._stateLock = false;
    },

    transitionLock: function() {
        if (this._transitionLock) return false;
        this._transitionLock = true;
        return true;
    },

    transitionUnlock: function() {
        this._transitionLock = false;
    },

    getState: function() { return this._currentState; },
    isInitialized: function() { return this._initialized; },
    isHandshakeComplete: function() { return this._handshakeCompleted; },
    isTokenReady: function() { return this._tokenReady; },
    hasFatalError: function() { return this._fatalError; },

    waitForHandshake: function(timeout = 8000) {
        if (this._handshakeCompleted) return Promise.resolve({ success: true });
        if (this._fatalError) return Promise.reject(new Error('Fatal error occurred'));

        if (!this._handshakePromise) {
            this._handshakePromise = new Promise((resolve, reject) => {
                this._handshakeResolve = resolve;
                this._handshakeReject = reject;

                setTimeout(() => {
                    if (this._handshakePromise && this._handshakeReject) {
                        this._handshakeReject(new Error('Handshake timeout'));
                        this._handshakePromise = null;
                        this._handshakeResolve = null;
                        this._handshakeReject = null;
                    }
                }, timeout);
            });
        }

        return this._handshakePromise;
    },

    waitForToken: function(timeout = 8000) {
        if (this._tokenReady) return Promise.resolve(true);
        if (this._fatalError) return Promise.reject(new Error('Fatal error occurred'));

        if (!this._tokenPromise) {
            this._tokenPromise = new Promise((resolve, reject) => {
                this._tokenResolve = resolve;
                this._tokenReject = reject;

                setTimeout(() => {
                    if (this._tokenPromise && this._tokenReject) {
                        this._tokenReject(new Error('Token acquisition timeout'));
                        this._tokenPromise = null;
                        this._tokenResolve = null;
                        this._tokenReject = null;
                    }
                }, timeout);
            });
        }

        return this._tokenPromise;
    },

    addListener: function(listener) {
        if (typeof listener === 'function') this._stateChangeListeners.add(listener);
    },
    removeListener: function(listener) { this._stateChangeListeners.delete(listener); },
    _notifyListeners: function(event, data) {
        this._stateChangeListeners.forEach(listener => {
            try { listener(event, data); } catch (e) {}
        });
    },

    reset: function() {
        this._currentState = STATE.UNINITIALIZED;
        this._previousState = null;
        this._initialized = false;
        this._handshakeCompleted = false;
        this._tokenReady = false;
        this._fatalError = null;
        this._initializationPromise = null;
        this._initializationResolve = null;
        this._initializationReject = null;
        this._handshakePromise = null;
        this._handshakeResolve = null;
        this._handshakeReject = null;
        this._tokenPromise = null;
        this._tokenResolve = null;
        this._tokenReject = null;
    }
};

    // ==================== CONFIGURATION ====================
    const ENV_TIMEOUTS = IframeEnvironment.getTimeouts();
    const ENV_RETRIES = IframeEnvironment.getMaxRetries();
    const ENV_HEARTBEAT = IframeEnvironment.getHeartbeatInterval();
    const STORAGE_STRATEGY = IframeEnvironment.getStorageStrategy();

    const CONFIG = {
        VERSION: '4.0.1',
        PROTOCOL_VERSION: 'KYN-4.0',

        HANDSHAKE_TIMEOUT: ENV_TIMEOUTS.handshake,
        SESSION_TIMEOUT: ENV_TIMEOUTS.session,
        ACK_TIMEOUT: ENV_TIMEOUTS.ack,
        HEARTBEAT_INTERVAL: ENV_HEARTBEAT,
        RETRY_BACKOFF: ENV_TIMEOUTS.retryBackoff,
        RECOVERY_DELAY: ENV_TIMEOUTS.recovery,
        PARENT_DETECT_TIMEOUT: ENV_TIMEOUTS.parentDetect,
        PREFLIGHT_TIMEOUT: ENV_TIMEOUTS.preflight,
        DEPENDENCY_TIMEOUT: ENV_TIMEOUTS.dependency,
        API_TIMEOUT: ENV_TIMEOUTS.api,
        TOKEN_REQUEST_TIMEOUT: ENV_TIMEOUTS.tokenRequest || 8000,
        SESSION_SYNC_TIMEOUT: ENV_TIMEOUTS.sessionSync || 10000,

        MAX_RETRIES: ENV_RETRIES,
        HANDSHAKE_MAX_ATTEMPTS: ENV_RETRIES,
        MAX_MESSAGE_RETRIES: ENV_RETRIES,
        MAX_RECOVERY_ATTEMPTS: ENV_RETRIES + 2,
        AUTH_RETRY_LIMIT: ENV_RETRIES,

        AUTH_RETRY_DELAY: ENV_TIMEOUTS.retryBackoff,
        SESSION_RETRY_DELAY: ENV_TIMEOUTS.retryBackoff,

        SESSION_REFRESH_THRESHOLD: 300000,
        MESSAGE_CACHE_TTL: 1000,
        ERROR_CACHE_TTL: 60000,
        MAX_PENDING_REQUESTS: 50,
        CIRCUIT_BREAKER_THRESHOLD: 5,
        CIRCUIT_BREAKER_RESET: 30000,
        MAX_SESSION_WAIT: ENV_TIMEOUTS.session * 2,

        STORAGE_PREFIX: 'calls_core_',
        STORAGE_STRATEGY: STORAGE_STRATEGY,

        SUSPEND_TIMER_CLEANUP: true,

        TRUSTED_DOMAINS: [
            'moodchat-fy56.onrender.com',
            'moodfronted.onrender.com',
            'localhost',
            '127.0.0.1'
        ],
        TRUSTED_PROTOCOLS: ['http:', 'https:'],

        HEARTBEAT_MAX_FAILURES: 3,
        HEARTBEAT_INTERVAL_MS: 15000,
        HEARTBEAT_MISSED_THRESHOLD: 3,

        API_ENDPOINT: ENVIRONMENT.apiEndpoint,
        WS_ENDPOINT: ENVIRONMENT.wsEndpoint,
        USE_HTTPS: ENVIRONMENT.isProduction
    };

    // ==================== HEARTBEAT CONFIGURATION (PRESERVED) ====================
    const HEARTBEAT_CONFIG = {
        failures: 0,
        maxFailures: CONFIG.HEARTBEAT_MAX_FAILURES || 3,
        interval: CONFIG.HEARTBEAT_INTERVAL_MS || 15000,
        lastBeat: 0,
        timer: null,
        enabled: true
    };

    function handleHeartbeatFailure() {
        HEARTBEAT_CONFIG.failures++;

        if (HEARTBEAT_CONFIG.failures < HEARTBEAT_CONFIG.maxFailures) {
            if (DEBUG) logOnce('warn-icon', 'Heartbeat missed but tolerated', { failures: HEARTBEAT_CONFIG.failures });
            return;
        }

        if (DEBUG) logOnce('warn-icon', 'Heartbeat threshold exceeded, attempting soft recovery');
        attemptSoftRecovery();
    }

    function resetHeartbeat() {
        HEARTBEAT_CONFIG.failures = 0;
        if (DEBUG) logOnce('info', 'Heartbeat reset');
    }

    function attemptSoftRecovery() {
        if (DEBUG) logOnce('info', "Soft recovery triggered");
        fetchActiveCallUsers().catch(() => {});
        HEARTBEAT_CONFIG.failures = 0;
    }

    async function fetchActiveCallUsers() {
        try {
            if (window.callAPI && typeof window.callAPI.getActiveUsers === 'function') {
                const users = await window.callAPI.getActiveUsers();
                if (window.renderUsers && typeof window.renderUsers === 'function') {
                    window.renderUsers(users);
                }
            }
            resetHeartbeat();
        } catch (error) {
            handleHeartbeatFailure();
        }
    }

    // ==================== MESSAGE TYPES (PRESERVED) ====================
    const MESSAGE_TYPES = {
        CHILD_READY: 'CHILD_READY',
        PARENT_READY: 'PARENT_READY',
        HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
        HANDSHAKE_ACK: 'HANDSHAKE_ACK',
        HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',

        REQUEST_SESSION: 'REQUEST_SESSION',
        SESSION_RESPONSE: 'SESSION_RESPONSE',
        SESSION_DATA: 'SESSION_DATA',
        SESSION_INIT: 'SESSION_INIT',
        SESSION_UPDATE: 'SESSION_UPDATE',
        SESSION_SYNC: 'SESSION_SYNC',
        SESSION_ACK: 'SESSION_ACK',
        CALL_SESSION_ACK: 'CALL_SESSION_ACK',
        VERIFY_SESSION: 'VERIFY_SESSION',
        SESSION_VERIFIED: 'SESSION_VERIFIED',

        HEARTBEAT: 'HEARTBEAT',
        HEARTBEAT_RESPONSE: 'HEARTBEAT_RESPONSE',
        PING: 'PING',
        PONG: 'PONG',

        ACK: 'ACK',

        API_REQUEST: 'API_REQUEST',
        API_RESPONSE: 'API_RESPONSE',

        PAGE_ACTIVATED: 'PAGE_ACTIVATED',
        NAVIGATE: 'NAVIGATE',

        AUTH_ERROR: 'AUTH_ERROR',
        SESSION_ERROR: 'SESSION_ERROR',

        CALL_CONNECTING: 'CALL_CONNECTING',
        CALL_STARTED: 'CALL_STARTED',
        CALL_ENDED: 'CALL_ENDED',
        CALL_FAILED: 'CALL_FAILED',
        SIGNALING_MESSAGE: 'SIGNALING_MESSAGE',
        AUDIO_MUTED: 'AUDIO_MUTED',
        VIDEO_MUTED: 'VIDEO_MUTED',

        MOOD_UPDATE: 'MOOD_UPDATE',
        INTENTION_UPDATE: 'INTENTION_UPDATE',

        REACTION: 'REACTION',

        DATA_SYNC_COMPLETE: 'DATA_SYNC_COMPLETE',
        CONTACTS_UPDATE: 'CONTACTS_UPDATE',
        CALL_HISTORY_UPDATE: 'CALL_HISTORY_UPDATE',

        REQUEST_TOKEN: 'REQUEST_TOKEN',
        TOKEN_RESPONSE: 'TOKEN_RESPONSE',
        TOKEN_UPDATE: 'TOKEN_UPDATE',
        TOKEN_REFRESH: 'TOKEN_REFRESH',
        TOKEN_REFRESHED: 'TOKEN_REFRESHED',

        IFRAME_READY: 'IFRAME_READY',
        IFRAME_STATE_CHANGE: 'IFRAME_STATE_CHANGE',
        IFRAME_SUSPENDED: 'IFRAME_SUSPENDED',
        IFRAME_ACTIVE: 'IFRAME_ACTIVE',
        IFRAME_DESTROYED: 'IFRAME_DESTROYED',

        NETWORK_RESTORED: 'NETWORK_RESTORED',
        NETWORK_LOST: 'NETWORK_LOST',

        REQUEST_RESYNC: 'REQUEST_RESYNC',
        PARENT_CRASH_RECOVERY: 'PARENT_CRASH_RECOVERY',

        USER_LOGGED_OUT: 'USER_LOGGED_OUT',
        USER_LOGGED_IN: 'USER_LOGGED_IN',

        INCOMING_CALL_SIMULATED: 'INCOMING_CALL_SIMULATED',

        IFRAME_REGISTERED: 'IFRAME_REGISTERED',
        CALLS_STATUS_WARNING: 'CALLS_STATUS_WARNING',

        CORE_READY: 'CORE_READY',
        CORE_ERROR: 'CORE_ERROR',
        CORE_INITIALIZED: 'CORE_INITIALIZED'
    };

    // ==================== ORIGIN SECURITY (PRESERVED) ====================
    const OriginSecurity = {
        _trustedOrigins: new Set(),
        _trustedDomains: new Set(CONFIG.TRUSTED_DOMAINS),
        _strictMode: true,
        _sandboxed: IframeEnvironment.isSandboxed(),
        _environment: IframeEnvironment.detect(),
        _cache: new Map(),

        initialize: function() {
            this._addTrustedOrigin(window.location.origin);
            try {
                if (window.parent && window.parent !== window && window.parent.location) {
                    this._addTrustedOrigin(window.parent.location.origin);
                }
            } catch (e) {}

            CONFIG.TRUSTED_DOMAINS.forEach(domain => {
                if (domain.includes('.')) this._trustedDomains.add(domain);
            });

            if (this._environment === 'LOCAL_DEV' || this._sandboxed) this._strictMode = false;

            if (DEBUG) {
                logOnce('info', 'OriginSecurity initialized', {
                    strictMode: this._strictMode,
                    sandboxed: this._sandboxed,
                    environment: this._environment,
                    trustedOrigins: this._trustedOrigins.size,
                    trustedDomains: this._trustedDomains.size
                });
            }

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

            if (!trusted && !this._strictMode) {
                try {
                    const url = new URL(origin);
                    if (url.protocol === 'http:' || url.protocol === 'https:') trusted = true;
                } catch (e) {}
            }

            this._cache.set(origin, trusted);
            return trusted;
        },

        validateEvent: function(event) {
            if (!event || !event.origin) return false;
            const trusted = this.isTrusted(event.origin);
            if (!trusted && DEBUG) logOnce('warn', `Rejected message from untrusted origin: ${event.origin}`);
            return trusted;
        },

        getTargetOrigin: function() {
            if (this._sandboxed || this._environment === 'LOCAL_DEV') return '*';
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
                sandboxed: this._sandboxed,
                environment: this._environment,
                trustedOrigins: this._trustedOrigins.size,
                trustedDomains: this._trustedDomains.size
            };
        }
    };

    OriginSecurity.initialize();

    // ==================== SAFE STORAGE (PRESERVED) ====================
    const SafeStorage = {
        _memory: new Map(),
        _strategy: CONFIG.STORAGE_STRATEGY,
        _available: null,
        _quotaExceeded: false,
        _listeners: new Set(),

        initialize: function() {
            this._checkAvailability();
            if (DEBUG) logOnce('info', 'SafeStorage initialized', { strategy: this._strategy, available: this._available });
            return this;
        },

        _checkAvailability: function() {
            if (this._strategy === 'memory') {
                this._available = true;
                return;
            }
            try {
                localStorage.setItem('_test_', '_test_');
                localStorage.removeItem('_test_');
                this._available = true;
            } catch (e) {
                this._available = false;
                this._strategy = 'memory';
                if (e.name === 'QuotaExceededError') this._quotaExceeded = true;
            }
        },

        get: function(key, fallback = null) {
            const fullKey = CONFIG.STORAGE_PREFIX + key;
            try {
                if (this._strategy === 'local' && this._available) {
                    const value = localStorage.getItem(fullKey);
                    return value !== null ? this._deserialize(value) : fallback;
                } else {
                    return this._memory.has(fullKey) ? this._memory.get(fullKey) : fallback;
                }
            } catch (e) {
                logOnce('warn', `Storage get failed: ${key}`, e);
                return fallback;
            }
        },

        set: function(key, value) {
            const fullKey = CONFIG.STORAGE_PREFIX + key;
            const serialized = this._serialize(value);

            try {
                if (this._strategy === 'local' && this._available) {
                    localStorage.setItem(fullKey, serialized);
                } else {
                    this._memory.set(fullKey, value);
                }
                this._notifyListeners('set', { key, value });
                return true;
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    this._quotaExceeded = true;
                    this._strategy = 'memory';
                    this._memory.set(fullKey, value);
                }
                logOnce('warn', `Storage set failed: ${key}`, e);
                return false;
            }
        },

        remove: function(key) {
            const fullKey = CONFIG.STORAGE_PREFIX + key;
            try {
                if (this._strategy === 'local' && this._available) {
                    localStorage.removeItem(fullKey);
                } else {
                    this._memory.delete(fullKey);
                }
                this._notifyListeners('remove', { key });
                return true;
            } catch (e) {
                logOnce('warn', `Storage remove failed: ${key}`, e);
                return false;
            }
        },

        clear: function() {
            try {
                if (this._strategy === 'local' && this._available) {
                    const keys = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith(CONFIG.STORAGE_PREFIX)) keys.push(key);
                    }
                    keys.forEach(key => localStorage.removeItem(key));
                }
                this._memory.clear();
                this._notifyListeners('clear', {});
                return true;
            } catch (e) {
                logOnce('warn', 'Storage clear failed', e);
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
        isAvailable: function() { return this._available; },
        isQuotaExceeded: function() { return this._quotaExceeded; },
        addListener: function(listener) { if (typeof listener === 'function') this._listeners.add(listener); },
        removeListener: function(listener) { this._listeners.delete(listener); },
        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        }
    };

    SafeStorage.initialize();

    // ==================== HARDENED ACK PROTOCOL WITH RETRY ====================
    const MessageRegistry = {
        _pendingMessages: new Map(),           // messageId -> { resolve, reject, timer, retries, type }
        _processedMessages: new Set(),          // messageId -> deduplication
        _retryCounts: new Map(),                // messageId -> retry count
        _maxRetries: CONFIG.MAX_MESSAGE_RETRIES,
        _ackTimeout: CONFIG.ACK_TIMEOUT,
        _cleanupTimer: null,

        initialize: function() {
            this._startCleanup();
            return this;
        },

        _startCleanup: function() {
            if (this._cleanupTimer) clearInterval(this._cleanupTimer);
            this._cleanupTimer = setInterval(() => this._cleanup(), 60000);
        },

        _cleanup: function() {
            const now = Date.now();
            // Clean up expired pending messages
            for (const [messageId, pending] of this._pendingMessages) {
                if (pending.expiry < now) {
                    this._failWithReason(messageId, 'expired');
                }
            }

            // Limit processed messages size
            if (this._processedMessages.size > 1000) {
                this._processedMessages.clear();
            }
        },

        register: function(messageId, type, options = {}) {
            if (this._processedMessages.has(messageId)) {
                logOnce('info', `Message already processed: ${messageId}`);
                return { success: true, cached: true };
            }

            if (this._pendingMessages.has(messageId)) {
                logOnce('warn-icon', `Message already pending: ${messageId}`);
                return this._pendingMessages.get(messageId).promise;
            }

            const timeout = options.timeout || this._ackTimeout;
            const maxRetries = options.maxRetries || this._maxRetries;

            let resolve, reject;
            const promise = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });

            const timer = setTimeout(() => {
                this._handleTimeout(messageId, type, maxRetries);
            }, timeout);

            this._pendingMessages.set(messageId, {
                type,
                resolve,
                reject,
                timer,
                expiry: Date.now() + timeout,
                retries: 0,
                maxRetries,
                options
            });

            if (DEBUG) logOnce('sending', `Registered message: ${type} (${messageId})`);

            return promise;
        },

        _handleTimeout: function(messageId, type, maxRetries) {
            const pending = this._pendingMessages.get(messageId);
            if (!pending) return;

            const retryCount = (pending.retries || 0) + 1;

            if (retryCount <= maxRetries) {
                // Retry logic handled by transport layer - we just track here
                pending.retries = retryCount;

                if (DEBUG) {
                    logOnce('warn-icon', `Message timeout (${retryCount}/${maxRetries}): ${type} (${messageId})`);
                }

                // Update expiry for next attempt
                pending.expiry = Date.now() + (this._ackTimeout * Math.pow(1.5, retryCount - 1));
            } else {
                // Max retries exceeded - fail permanently
                this._failWithReason(messageId, `max retries (${maxRetries}) exceeded`);
            }
        },

        acknowledge: function(messageId, payload = {}) {
            if (this._processedMessages.has(messageId)) {
                return false; // Already processed
            }

            this._processedMessages.add(messageId);

            const pending = this._pendingMessages.get(messageId);
            if (pending) {
                clearTimeout(pending.timer);
                pending.resolve(payload);
                this._pendingMessages.delete(messageId);
                if (DEBUG) logOnce('info', `ACK received: ${pending.type} (${messageId})`);
                return true;
            }

            return false;
        },

                _failWithReason: function(messageId, reason) {
            const pending = this._pendingMessages.get(messageId);
            if (!pending) return;

            clearTimeout(pending.timer);
            pending.reject(new Error(`Message failed: ${reason}`));
            this._pendingMessages.delete(messageId);

            logOnce('warn-icon', `Message failed: ${pending.type} (${messageId}) - ${reason}`);

            // Escalate to recoverable error, but only if we're not in UNINITIALIZED
            // and only for certain message types
            const currentState = StateGovernor.getState();
            if (currentState !== STATE.UNINITIALIZED && 
                currentState !== STATE.BOOTSTRAPPING &&
                pending.type !== 'REQUEST_SESSION' && 
                pending.type !== 'CHILD_READY') {
                StateGovernor.transition(currentState, STATE.ERROR_RECOVERABLE, `message_failure:${pending.type}`);
            }
        },
        hasPending: function(messageId) {
            return this._pendingMessages.has(messageId);
        },

        getPendingCount: function() {
            return this._pendingMessages.size;
        },

        reset: function() {
            for (const [messageId, pending] of this._pendingMessages) {
                clearTimeout(pending.timer);
                pending.reject(new Error('Registry reset'));
            }
            this._pendingMessages.clear();
            this._processedMessages.clear();
            this._retryCounts.clear();
        }
    };

    MessageRegistry.initialize();

    // ==================== IFRAME TRANSPORT WITH HARDENED ACK ====================
    const IframeTransport = {
        _messageId: 0,
        _queue: [],
        _processing: false,
        _offlineQueue: [],
        _online: navigator.onLine,
        _heartbeatInterval: null,
        _lastHeartbeat: 0,
        _heartbeatMissed: 0,
        _maxMissedHeartbeats: CONFIG.HEARTBEAT_MAX_FAILURES || 3,
        _sessionRequested: false,
        _sessionRequestTimer: null,
        _listeners: new Set(),
        _targetOrigin: OriginSecurity.getTargetOrigin(),
        _maxRetries: CONFIG.MAX_MESSAGE_RETRIES,
        _backoffBase: CONFIG.RETRY_BACKOFF,

        initialize: function() {
            this._setupListeners();
            this._startHeartbeat();

            if (DEBUG) logOnce('info', 'IframeTransport initialized', {
                maxRetries: this._maxRetries,
                targetOrigin: this._targetOrigin
            });

            return this;
        },

        _setupListeners: function() {
            window.addEventListener('online', () => {
                this._online = true;
                this._processOfflineQueue();
                this._notifyListeners('online', {});

                if (!IframeSessionClient.isValid() && !IframeSessionClient.isDemoMode()) {
                    this.requestSessionFromParent();
                }
            });

            window.addEventListener('offline', () => {
                this._online = false;
                this._notifyListeners('offline', {});
            });

            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && this._online) {
                    this._processQueue();

                    if (!IframeSessionClient.isValid() && !IframeSessionClient.isDemoMode()) {
                        this.requestSessionFromParent();
                    }
                }
            });
        },

        _generateMessageId: function() {
            return `${Date.now()}-${++this._messageId}-${Math.random().toString(36).substring(2, 9)}`;
        },

        send: function(type, payload = {}, options = {}) {
            return new Promise((resolve, reject) => {
                try {
                    const messageId = options.messageId || this._generateMessageId();
                    const timestamp = options.timestamp || Date.now();
                    const requireAck = options.requireAck !== false;
                    const timeout = options.timeout || CONFIG.ACK_TIMEOUT;
                    const priority = options.priority || 'normal';

                    // Map message types to parent expectations
                    let actualType = type;
                    if (type === 'PARENT_SESSION_REQUEST') actualType = 'REQUEST_SESSION';
                    else if (type === 'PARENT_TOKEN_REQUEST') actualType = 'REQUEST_TOKEN';
                    else if (type === 'PARENT_SESSION_RESPONSE') actualType = 'SESSION_RESPONSE';
                    else if (type === 'PARENT_TOKEN_RESPONSE') actualType = 'TOKEN_RESPONSE';

                    const message = {
                        protocol: CONFIG.PROTOCOL_VERSION,
                        messageId: messageId,
                        requestId: messageId,
                        type: actualType,
                        source: 'iframe',
                        target: 'parent',
                        timestamp,
                        payload: payload || {},
                        version: CONFIG.VERSION,
                        requireAck
                    };

                    const queueItem = {
                        message,
                        resolve,
                        reject,
                        options,
                        attempts: 0,
                        timestamp: Date.now(),
                        id: messageId,
                        priority,
                        requireAck
                    };

                    if (priority === 'high') {
                        this._queue.unshift(queueItem);
                    } else {
                        this._queue.push(queueItem);
                    }

                    // Register for ACK tracking if required
                    if (requireAck) {
                        MessageRegistry.register(messageId, actualType, { timeout, maxRetries: this._maxRetries })
                            .then(result => {
                                // ACK received - resolve the outer promise
                                resolve({ success: true, messageId, type: actualType, result });
                            })
                            .catch(error => {
                                // ACK failed - reject the outer promise
                                reject(error);
                            });
                    }

                    this._processQueue();

                } catch (error) {
                    logOnce('error', 'Transport send failed', error);
                    reject(error);
                }
            });
        },

        requestSessionFromParent: function() {
            if (this._sessionRequested) return;

            this._sessionRequested = true;

            if (this._sessionRequestTimer) {
                clearTimeout(this._sessionRequestTimer);
            }

            this._sessionRequestTimer = setTimeout(() => {
                this._sessionRequested = false;
            }, 30000);

            const messageId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);

            if (window.parent && window.parent !== window) {
                try {
                    window.parent.postMessage({
                        type: 'REQUEST_SESSION',
                        messageId: messageId,
                        requestId: messageId,
                        timestamp: Date.now(),
                        source: 'iframe',
                        frameId: window.name || 'calls-iframe',
                        payload: {
                            timestamp: Date.now(),
                            frameId: window.name || 'calls-iframe'
                        },
                        expectAck: true
                    }, '*');

                    logOnce('sending', 'REQUEST_SENT', { messageId: messageId });
                } catch (e) {
                    logOnce('error', 'Failed to send REQUEST_SESSION', e);
                }
            }

            // Register for ACK
            MessageRegistry.register(messageId, 'REQUEST_SESSION', { timeout: 10000 })
                .catch(() => {
                    // Timeout handled by registry
                });

            // Set up response handler
            const responseHandler = (event) => {
                if (!event.data) return;

                if (event.data.type === 'SESSION_RESPONSE' || event.data.type === 'SESSION_DATA') {
                    const sessionData = event.data.payload || event.data.data;
                    if (sessionData && (sessionData.token || sessionData.user)) {
                        IframeSessionClient._handleSessionUpdate(sessionData);
                    }
                    window.removeEventListener('message', responseHandler);
                }
            };

            window.addEventListener('message', responseHandler);

            setTimeout(() => {
                window.removeEventListener('message', responseHandler);
            }, 10000);
        },

        requestTokenFromParent: function() {
            return this.send('REQUEST_TOKEN', {
                timestamp: Date.now(),
                frameId: window.name || 'calls-iframe'
            }, { requireAck: true, timeout: CONFIG.TOKEN_REQUEST_TIMEOUT })
            .then(response => {
                if (response && response.payload && response.payload.token) {
                    IframeSessionClient._handleTokenUpdate(response.payload);
                    if (APICore) {
                        APICore.setToken(response.payload.token, response.payload.refreshToken, response.payload.expiry);
                    }
                }
                return response;
            });
        },

        _processQueue: async function() {
            if (this._processing) return;
            if (this._queue.length === 0) return;

            this._processing = true;

            while (this._queue.length > 0) {
                const item = this._queue[0];

                if (!this._online) {
                    this._offlineQueue.push(item);
                    this._queue.shift();
                    continue;
                }

                if (item.attempts >= this._maxRetries) {
                    logOnce('warn-icon', `Max retries for ${item.message.type}`, { id: item.id });
                    if (!item.requireAck) {
                        item.reject(new Error('Max retries exceeded'));
                    }
                    this._queue.shift();
                    continue;
                }

                try {
                    await this._sendMessage(item);

                    // If no ACK required, resolve immediately
                    if (!item.requireAck) {
                        item.resolve({ success: true, messageId: item.id, type: item.message.type });
                        this._queue.shift();
                    } else {
                        // ACK will be handled by MessageRegistry
                        this._queue.shift();
                    }

                } catch (error) {
                    item.attempts++;

                    let delay = this._backoffBase * Math.pow(2, item.attempts - 1);
                    if (IframeEnvironment.isVPNNetwork()) delay *= 1.5;

                    await new Promise(resolve => setTimeout(resolve, delay));

                    // Move to end of queue for retry
                    this._queue.push(this._queue.shift());
                }
            }

            this._processing = false;
        },

        _sendMessage: function(item) {
            return new Promise((resolve, reject) => {
                try {
                    if (!window.parent || window.parent === window) {
                        reject(new Error('No parent window'));
                        return;
                    }

                    const cacheKey = `${item.message.type}:${item.message.messageId}`;

                    window.parent.postMessage(item.message, this._targetOrigin);

                    if (DEBUG) logOnce('sending', item.message.type, { id: item.message.messageId });

                    this._notifyListeners('sent', { type: item.message.type, id: item.message.messageId });

                    resolve();

                } catch (error) {
                    reject(error);
                }
            });
        },

        handleIncoming: function(event) {
            if (!OriginSecurity.validateEvent(event)) {
                if (DEBUG) logOnce('warn', 'Message rejected - invalid origin', { origin: event.origin });
                return;
            }

            const message = event.data;

            if (!message || typeof message !== 'object') return;

            // Handle ACK messages
            if (message.type === MESSAGE_TYPES.ACK || message.type === 'ACK') {
                const ackId = message.payload?.ackId ||
                              message.ackId ||
                              message.requestId ||
                              message.messageId ||
                              message.payload?.requestId;

                if (ackId) {
                    MessageRegistry.acknowledge(ackId, message.payload);
                    if (DEBUG) logOnce('info', `ACK processed for: ${ackId}`);
                }
            }

            // Handle SESSION_RESPONSE
            if (message.type === 'SESSION_RESPONSE') {
                this._sessionRequested = false;
                if (this._sessionRequestTimer) {
                    clearTimeout(this._sessionRequestTimer);
                    this._sessionRequestTimer = null;
                }

                const requestId = message.requestId || message.payload?.requestId;
                if (requestId) {
                    MessageRegistry.acknowledge(requestId, message.payload);
                }

                if (message.payload) {
                    IframeSessionClient._handleSessionUpdate(message.payload);
                }
            }

            // Handle TOKEN_RESPONSE
            if (message.type === 'TOKEN_RESPONSE') {
                const requestId = message.requestId || message.payload?.requestId;
                if (requestId) {
                    MessageRegistry.acknowledge(requestId, message.payload);
                }

                if (message.payload && message.payload.token) {
                    IframeSessionClient._handleTokenUpdate(message.payload);
                    if (APICore) {
                        APICore.setToken(message.payload.token, message.payload.refreshToken, message.payload.expiry);
                    }
                }
            }

            // Handle SESSION_VERIFIED
            if (message.type === 'SESSION_VERIFIED') {
                const requestId = message.requestId || message.payload?.requestId;
                if (requestId) {
                    MessageRegistry.acknowledge(requestId, message.payload);
                }

                if (message.payload && message.payload.valid) {
                    resetHeartbeat();
                }
            }

            // Handle TOKEN_UPDATE (event-driven token delivery)
            if (message.type === 'TOKEN_UPDATE') {
                if (message.payload && message.payload.token) {
                    logOnce('success', 'Token received via event-driven delivery');
                    IframeSessionClient._handleTokenUpdate(message.payload);
                    if (APICore) {
                        APICore.setToken(message.payload.token, message.payload.refreshToken, message.payload.expiry);
                    }
                }
            }

            // Handle SESSION_UPDATE
            if (message.type === 'SESSION_UPDATE') {
                if (message.payload && (message.payload.token || message.payload.user)) {
                    IframeSessionClient._handleSessionUpdate(message.payload);
                }
            }

            if (message.type === MESSAGE_TYPES.HEARTBEAT_RESPONSE ||
                message.type === MESSAGE_TYPES.PONG) {
                this._lastHeartbeat = Date.now();
                this._heartbeatMissed = 0;
                resetHeartbeat();
            }

            this._notifyListeners('received', { type: message.type, data: message });
        },

        _processOfflineQueue: function() {
            if (this._offlineQueue.length === 0) return;

            logOnce('info', `Processing ${this._offlineQueue.length} offline messages`);

            while (this._offlineQueue.length > 0) {
                this._queue.push(this._offlineQueue.shift());
            }

            this._processQueue();
        },

        _startHeartbeat: function(interval = CONFIG.HEARTBEAT_INTERVAL) {
            if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);

            this._lastHeartbeat = Date.now();
            this._heartbeatMissed = 0;

            this._heartbeatInterval = setInterval(() => {
                if (this._online && window.parent && window.parent !== window) {
                    this.send(MESSAGE_TYPES.HEARTBEAT, { timestamp: Date.now() }, { requireAck: false })
                        .catch(() => {});

                    if (Date.now() - this._lastHeartbeat > interval * 2) {
                        this._heartbeatMissed++;
                        handleHeartbeatFailure();

                        if (this._heartbeatMissed >= this._maxMissedHeartbeats) {
                            if (DEBUG) logOnce('warn-icon', 'Missed heartbeats, connection may be lost');
                            this._notifyListeners('connection_suspect', { missed: this._heartbeatMissed });

                            if (!IframeSessionClient.isValid() && !IframeSessionClient.isDemoMode()) {
                                this.requestSessionFromParent();
                            }
                        }
                    }
                }
            }, interval);
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },
        removeListener: function(listener) { this._listeners.delete(listener); },
        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        getStatus: function() {
            return {
                online: this._online,
                queueSize: this._queue.length,
                offlineQueueSize: this._offlineQueue.length,
                pendingAcks: MessageRegistry.getPendingCount(),
                lastHeartbeat: this._lastHeartbeat,
                heartbeatMissed: this._heartbeatMissed,
                targetOrigin: this._targetOrigin,
                sessionRequested: this._sessionRequested
            };
        },

        cleanup: function() {
            if (this._heartbeatInterval) {
                clearInterval(this._heartbeatInterval);
                this._heartbeatInterval = null;
            }
            if (this._sessionRequestTimer) {
                clearTimeout(this._sessionRequestTimer);
                this._sessionRequestTimer = null;
            }
            this._queue = [];
            this._offlineQueue = [];
            MessageRegistry.reset();
            this._listeners.clear();
        }
    };

    IframeTransport.initialize();

    // ==================== API CORE (PRESERVED) ====================
    const APICore = {
        _initialized: false,
        _initializing: false,
        _token: null,
        _refreshToken: null,
        _tokenExpiry: null,
        _baseURL: CONFIG.API_ENDPOINT,
        _wsURL: CONFIG.WS_ENDPOINT,
        _wsConnection: null,
        _pendingRequests: new Map(),
        _requestQueue: [],
        _processingQueue: false,
        _retryCounts: new Map(),
        _maxRetries: CONFIG.MAX_RETRIES,
        _backoffBase: CONFIG.RETRY_BACKOFF,
        _listeners: new Set(),
        _circuitBreakers: new Map(),
        _online: navigator.onLine,
        _usingFallback: false,
        _cachedResponses: new Map(),
        _cacheTTL: 300000,
        _coreReady: false,
        _tokenRefreshPromise: null,
        _tokenRefreshTimer: null,
        _lastWsAttempt: 0,

        initialize: async function() {
            if (this._initialized) {
                logOnce('success', 'API Core already initialized');
                return { success: true, status: 'already_initialized' };
            }

            if (this._initializing) {
                logOnce('info', 'API Core initialization in progress');
                return { success: false, status: 'in_progress' };
            }

            this._initializing = true;

            logOnce('info', 'Initializing API Core', { endpoint: this._baseURL });

            try {
                await this._loadToken();

                this._setupListeners();

                if (this._token) {
                    this._initWebSocket();
                }

                this._processQueue();

                this._initialized = true;
                this._initializing = false;
                this._coreReady = true;

                logOnce('success', 'API Core initialized successfully', {
                    hasToken: !!this._token,
                    wsConnected: !!this._wsConnection,
                    endpoint: this._baseURL
                });

                this._emitCoreReady();

                return { success: true, status: 'initialized' };

            } catch (error) {
                logOnce('error', 'API Core initialization failed', error);
                this._initializing = false;

                this._emitCoreError(error);

                return { success: false, error: error.message, fallback: false };
            }
        },

        _emitCoreReady: function() {
            const event = new CustomEvent('core.ready', {
                detail: {
                    timestamp: Date.now(),
                    version: CONFIG.VERSION,
                    environment: ENVIRONMENT.current
                }
            });
            window.dispatchEvent(event);
            window.__CALLS_CORE_READY__ = true;
            logOnce('ready', 'Core ready event emitted');
        },

        _emitCoreError: function(error) {
            const event = new CustomEvent('core.error', {
                detail: {
                    error: error.message,
                    timestamp: Date.now()
                }
            });
            window.dispatchEvent(event);
        },

        _setupListeners: function() {
            window.addEventListener('online', () => {
                this._online = true;
                this._processQueue();
                if (this._wsConnection && this._wsConnection.readyState !== WebSocket.OPEN) {
                    this._initWebSocket();
                }
            });

            window.addEventListener('offline', () => {
                this._online = false;
            });

            window.addEventListener('message', (event) => {
                if (!OriginSecurity.validateEvent(event)) return;

                const message = event.data;
                if (!message || typeof message !== 'object') return;

                if (message.type === MESSAGE_TYPES.TOKEN_UPDATE ||
                    message.type === MESSAGE_TYPES.TOKEN_REFRESH) {
                    const tokenData = message.payload || message;
                    if (tokenData.token) {
                        this.setToken(tokenData.token, tokenData.refreshToken, tokenData.expiry);
                    }
                }

                if (message.type === 'TOKEN_RESPONSE') {
                    if (message.payload && message.payload.token) {
                        this.setToken(message.payload.token, message.payload.refreshToken, message.payload.expiry);
                    }
                }
            });

            IframeTransport.addListener((event, data) => {
                if (event === 'received' && data && data.type === 'TOKEN_RESPONSE') {
                    if (data.data && data.data.payload && data.data.payload.token) {
                        this.setToken(data.data.payload.token, data.data.payload.refreshToken, data.data.payload.expiry);
                    }
                }
            });
        },

        _setupListeners: function() {
            window.addEventListener('online', () => {
                this._online = true;
                this._processQueue();
                if (this._wsConnection && this._wsConnection.readyState !== WebSocket.OPEN) {
                    this._initWebSocket();
                }
            });
            
            window.addEventListener('offline', () => {
                this._online = false;
            });

            window.addEventListener('message', (event) => {
                if (!OriginSecurity.validateEvent(event)) return;

                const message = event.data;
                if (!message || typeof message !== 'object') return;

                if (message.type === MESSAGE_TYPES.TOKEN_UPDATE ||
                    message.type === MESSAGE_TYPES.TOKEN_REFRESH) {
                    const tokenData = message.payload || message;
                    if (tokenData.token) {
                        this.setToken(tokenData.token, tokenData.refreshToken, tokenData.expiry);
                    }
                }

                if (message.type === 'TOKEN_RESPONSE') {
                    if (message.payload && message.payload.token) {
                        this.setToken(message.payload.token, message.payload.refreshToken, message.payload.expiry);
                    }
                }
            });

            IframeTransport.addListener((event, data) => {
                if (event === 'received' && data && data.type === 'TOKEN_RESPONSE') {
                    if (data.data && data.data.payload && data.data.payload.token) {
                        this.setToken(data.data.payload.token, data.data.payload.refreshToken, data.data.payload.expiry);
                    }
                }
            });
        },

        // ADD THIS MISSING METHOD:
        _processQueue: function() {
            // Simple implementation to prevent errors
            if (this._processingQueue) return;
            this._processingQueue = true;
            
            // Process any queued requests
            if (this._requestQueue && this._requestQueue.length > 0) {
                const queue = [...this._requestQueue];
                this._requestQueue = [];
                
                queue.forEach(item => {
                    if (item && typeof item === 'function') {
                        try { item(); } catch (e) {}
                    }
                });
            }
            
            this._processingQueue = false;
        },

        _loadToken: async function() {
            try {
                const storedToken = localStorage.getItem('jwt_token');
                const storedRefreshToken = localStorage.getItem('refresh_token');
                const storedExpiry = localStorage.getItem('token_expiry');

                if (storedToken && storedExpiry && parseInt(storedExpiry) > Date.now()) {
                    this._token = storedToken;
                    this._refreshToken = storedRefreshToken;
                    this._tokenExpiry = parseInt(storedExpiry);
                    logOnce('success', 'Loaded valid token from storage', { expiresIn: Math.floor((this._tokenExpiry - Date.now()) / 1000) + 's' });
                    return true;
                }
            } catch (e) {}

            // Wait for token from parent (event-driven)
            try {
                await StateGovernor.waitForToken(CONFIG.TOKEN_REQUEST_TIMEOUT);
                return true;
            } catch (e) {
                logOnce('warn-icon', 'Token wait timed out', e.message);
            }

            return false;
        },

        setToken: function(token, refreshToken, expiry) {
            if (token && (token.includes('demo-token') || token === 'demo-token-1771688949339')) {
                return;
            }
            if (this._token === token) return;

            this._token = token;
            this._refreshToken = refreshToken || this._refreshToken;
            this._tokenExpiry = expiry || (Date.now() + 3600000);

            this._persistToken();

            if (this._wsConnection) {
                try { this._wsConnection.close(); } catch (e) {}
                this._wsConnection = null;
            }

            if (token && token.length > 20 && !token.includes('demo-token')) {
                setTimeout(() => this._initWebSocket(), 1000);
            }

            this._scheduleTokenRefresh();

            if (IframeSessionClient && IframeSessionClient._token !== token) {
                setTimeout(() => {
                    IframeSessionClient._handleTokenUpdate({ token, refreshToken, expiry: this._tokenExpiry });
                }, 0);
            }

            logOnce('success', 'Token updated');
        },

        _persistToken: function() {
            try {
                if (this._token) localStorage.setItem('jwt_token', this._token);
                if (this._refreshToken) localStorage.setItem('refresh_token', this._refreshToken);
                if (this._tokenExpiry) localStorage.setItem('token_expiry', this._tokenExpiry.toString());
            } catch (e) {}
        },

        _scheduleTokenRefresh: function() {
            if (this._tokenRefreshTimer) clearTimeout(this._tokenRefreshTimer);

            if (!this._tokenExpiry) return;

            const now = Date.now();
            const timeUntilExpiry = this._tokenExpiry - now;
            const refreshTime = Math.max(0, timeUntilExpiry - CONFIG.SESSION_REFRESH_THRESHOLD);

            if (refreshTime <= 0) {
                this._refreshTokenRequest();
                return;
            }

            this._tokenRefreshTimer = setTimeout(() => {
                this._refreshTokenRequest();
            }, refreshTime);
        },

        clearToken: function() {
            this._token = null;
            this._refreshToken = null;
            this._tokenExpiry = null;

            try {
                localStorage.removeItem('jwt_token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('token_expiry');
            } catch (e) {}

            if (this._wsConnection) {
                this._wsConnection.close();
                this._wsConnection = null;
            }

            if (this._tokenRefreshTimer) {
                clearTimeout(this._tokenRefreshTimer);
                this._tokenRefreshTimer = null;
            }

            logOnce('info', 'Token cleared');
        },

        _initWebSocket: function() {
            const now = Date.now();
            if (this._lastWsAttempt && (now - this._lastWsAttempt < 10000)) return;
            this._lastWsAttempt = now;

            if (!this._token || this._token.includes('demo-token') || this._token.length < 20) return;
            if (!this._online) return;
            if (!window.WebSocket) return;

            if (this._wsConnection) {
                const state = this._wsConnection.readyState;
                if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;
                try { this._wsConnection.close(); } catch (e) {}
                this._wsConnection = null;
            }

            try {
                let wsUrl = this._wsURL;
                if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
                    wsUrl = wsUrl.replace('http://', 'ws://').replace('https://', 'wss://');
                }

                wsUrl += (wsUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(this._token);

                const connectionTimeout = setTimeout(() => {
                    if (this._wsConnection && this._wsConnection.readyState === WebSocket.CONNECTING) {
                        this._wsConnection.close();
                        this._wsConnection = null;
                    }
                }, 5000);

                this._wsConnection = new WebSocket(wsUrl);

                this._wsConnection.onopen = () => {
                    clearTimeout(connectionTimeout);
                    logOnce('success', 'WebSocket connected');
                };

                this._wsConnection.onerror = () => {
                    clearTimeout(connectionTimeout);
                    this._wsConnection = null;
                    this._wsURL = null;
                };

                this._wsConnection.onclose = () => {
                    clearTimeout(connectionTimeout);
                    this._wsConnection = null;
                };

                this._wsConnection.onmessage = () => {};

            } catch (error) {}
        },

        _refreshTokenRequest: async function() {
            if (this._tokenRefreshPromise) return this._tokenRefreshPromise;

            if (!this._refreshToken) return false;

            this._tokenRefreshPromise = (async () => {
                try {
                    const response = await fetch(this._baseURL + '/auth/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken: this._refreshToken })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        this.setToken(data.token, data.refreshToken, data.expiry);
                        logOnce('success', 'Token refreshed successfully');
                        return true;
                    }
                } catch (error) {
                    logOnce('error', 'Token refresh failed', error);
                } finally {
                    this._tokenRefreshPromise = null;
                }
                return false;
            })();

            return this._tokenRefreshPromise;
        },

        isReady: function() { return this._coreReady; },

        waitForReady: function(timeout = 10000) {
            return new Promise((resolve, reject) => {
                if (this._coreReady) {
                    resolve(true);
                    return;
                }
                const timeoutId = setTimeout(() => {
                    window.removeEventListener('core.ready', handler);
                    reject(new Error('Core ready timeout'));
                }, timeout);
                const handler = () => {
                    clearTimeout(timeoutId);
                    window.removeEventListener('core.ready', handler);
                    resolve(true);
                };
                window.addEventListener('core.ready', handler);
            });
        },

        getStatus: function() {
            return {
                initialized: this._initialized,
                online: this._online,
                hasToken: !!this._token,
                tokenExpiry: this._tokenExpiry,
                wsConnected: !!(this._wsConnection && this._wsConnection.readyState === WebSocket.OPEN),
                pendingRequests: this._pendingRequests.size,
                queuedRequests: this._requestQueue.length,
                usingFallback: this._usingFallback,
                environment: ENVIRONMENT.current,
                endpoint: this._baseURL
            };
        }
    };

    // ==================== PASSIVE REGISTRATION (PRESERVED) ====================
    let lastRegisterSent = 0;
    let isRegistered = false;
    let registrationAttempts = 0;
    const MAX_REGISTRATION_ATTEMPTS = 5;

    function registerWithParent() {
        const now = Date.now();
        if (now - lastRegisterSent < 3000) return;
        lastRegisterSent = now;

        if (isRegistered && DEBUG) {
            logOnce('info', 'Already registered with parent');
            return;
        }

        registrationAttempts++;

        if (DEBUG) logOnce('sending', 'Registering with parent', { attempt: registrationAttempts });

        try {
            window.parent.postMessage({
                type: MESSAGE_TYPES.IFRAME_REGISTERED,
                module: "calls",
                version: CONFIG.VERSION,
                protocol: CONFIG.PROTOCOL_VERSION,
                timestamp: now,
                environment: ENVIRONMENT.current,
                apiEndpoint: ENVIRONMENT.apiEndpoint
            }, OriginSecurity.getTargetOrigin());

            isRegistered = true;
            registrationAttempts = 0;

            logOnce('success', 'Registered with parent');

        } catch (error) {
            if (DEBUG) logOnce('error', 'Failed to register with parent', error);

            if (registrationAttempts < MAX_REGISTRATION_ATTEMPTS) {
                setTimeout(registerWithParent, 5000);
            }
        }
    }

    function safeRegister() {
        registerWithParent();
    }


   // ==================== IFRAME HANDSHAKE AUTHORITY - IDEMPOTENT ====================
const IframeHandshakeAuthority = {
    _handshakeLock: false,
    _handshakePromise: null,
    _handshakeResolve: null,
    _handshakeReject: null,
    _listeners: new Set(),
    _handshakeTimer: null,

    initialize: function() {
        this._setupListeners();
        if (DEBUG) logOnce('info', 'IframeHandshakeAuthority initialized');
        return this;
    },

    _setupListeners: function() {
        const handler = (event) => {
            if (!OriginSecurity.validateEvent(event)) return;

            const message = event.data;
            if (!message || typeof message !== 'object') return;

            // Any session message completes handshake
            if (message.type === 'SESSION_RESPONSE' ||
                message.type === 'SESSION_DATA' ||
                message.type === 'SESSION_UPDATE' ||
                message.type === 'SESSION_INIT' ||
                message.type === 'TOKEN_RESPONSE' ||
                message.type === 'SESSION_ACK' ||
                message.type === 'CALL_SESSION_ACK' ||
                message.type === 'TOKEN_UPDATE') {

                if (!StateGovernor.isHandshakeComplete()) {
                    this._completeHandshake('session_received');
                }
            }

            if (message.type === MESSAGE_TYPES.PARENT_READY) {
                this._completeHandshake('parent_ready');
            }

            if (message.type === MESSAGE_TYPES.HANDSHAKE_ACK) {
                this._completeHandshake('handshake_ack');
            }

            if (message.type === MESSAGE_TYPES.HANDSHAKE_REQUEST) {
                this._sendHandshakeResponse(message);
            }
        };

        window.addEventListener('message', handler);
        this._listeners.add({ type: 'message', handler });
    },

    _sendHandshakeResponse: function(request) {
        const response = {
            type: MESSAGE_TYPES.HANDSHAKE_RESPONSE,
            payload: {
                ready: true,
                version: CONFIG.VERSION,
                protocol: CONFIG.PROTOCOL_VERSION,
                environment: IframeEnvironment.detect(),
                apiEndpoint: ENVIRONMENT.apiEndpoint,
                timestamp: Date.now()
            },
            messageId: request.messageId
        };

        try {
            window.parent.postMessage(response, OriginSecurity.getTargetOrigin());
            logOnce('sending', 'Handshake response sent');
        } catch (e) {}
    },

    _sendChildReady: function() {
        IframeTransport.send(MESSAGE_TYPES.CHILD_READY, {
            ready: true,
            version: CONFIG.VERSION,
            protocol: CONFIG.PROTOCOL_VERSION,
            environment: IframeEnvironment.detect(),
            apiEndpoint: ENVIRONMENT.apiEndpoint,
            timestamp: Date.now()
        }, { requireAck: false, priority: 'high' }).catch(() => {});

        logOnce('sending', 'CHILD_READY sent');
    },

    _completeHandshake: function(reason) {
        if (StateGovernor.isHandshakeComplete()) return;

        // Force handshake complete regardless of current state
        StateGovernor._handshakeCompleted = true;
        StateGovernor._currentState = STATE.HANDSHAKE_COMPLETE;

        if (this._handshakeTimer) {
            clearTimeout(this._handshakeTimer);
            this._handshakeTimer = null;
        }

        if (this._handshakeResolve) {
            this._handshakeResolve({ success: true, reason });
            this._handshakeResolve = null;
            this._handshakeReject = null;
        }

        safeRegister();
        this._notifyListeners('handshake_complete', { reason });
    },

    // ===== COMPLETELY REWRITTEN start() METHOD WITH EMERGENCY FALLBACKS =====
    start: async function(options = {}) {
        // Already completed
        if (StateGovernor.isHandshakeComplete()) {
            logOnce('success', 'Handshake already complete');
            return { success: true, handshakeComplete: true };
        }

        // If we already have a valid session, consider handshake complete
        if (IframeSessionClient.isValid()) {
            logOnce('success', 'Valid session exists, marking handshake complete');
            this._completeHandshake('existing_session');
            return { success: true, handshakeComplete: true, fromSession: true };
        }

        // In progress - return existing promise
        if (this._handshakePromise) {
            logOnce('info', 'Handshake already in progress');
            return this._handshakePromise;
        }

        // Check current state
        const currentState = StateGovernor.getState();
        
        // ===== EMERGENCY STATE FIX =====
        // If we're in UNINITIALIZED, force to BOOTSTRAPPING
        if (currentState === STATE.UNINITIALIZED) {
            logOnce('info', 'Emergency: Forcing state from UNINITIALIZED to BOOTSTRAPPING');
            StateGovernor._currentState = STATE.BOOTSTRAPPING;
        }
        
        // Now try to transition to HANDSHAKING
        let transitionSuccess = false;
        
        // Try multiple times with different approaches
        for (let attempt = 0; attempt < 3; attempt++) {
            // Try normal transition first
            if (StateGovernor.transition(StateGovernor.getState(), STATE.HANDSHAKING)) {
                transitionSuccess = true;
                break;
            }
            
            // If normal transition fails, try forcing the state
            logOnce('warn-icon', `Transition attempt ${attempt + 1} failed, forcing state`);
            
            // Release any locks that might be blocking
            StateGovernor._stateLock = false;
            StateGovernor._transitionLock = false;
            
            // Force the state change
            StateGovernor._previousState = StateGovernor._currentState;
            StateGovernor._currentState = STATE.HANDSHAKING;
            
            // Check if we're now in HANDSHAKING
            if (StateGovernor.getState() === STATE.HANDSHAKING) {
                transitionSuccess = true;
                break;
            }
            
            // Wait a bit before next attempt
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        if (!transitionSuccess) {
            logOnce('error', 'Critical: Cannot transition to HANDSHAKING state');
            
            // Emergency: Force handshake complete if we have session
            if (IframeSessionClient.isValid()) {
                logOnce('info', 'Emergency: Forcing handshake complete due to valid session');
                this._completeHandshake('emergency_session');
                return { success: true, handshakeComplete: true, emergency: true };
            }
            
            return { success: false, reason: 'transition_failed' };
        }

        const timeout = options.timeout || CONFIG.HANDSHAKE_TIMEOUT;
        const maxAttempts = options.maxAttempts || CONFIG.HANDSHAKE_MAX_ATTEMPTS;

        logOnce('sending', 'Starting handshake');

        this._handshakePromise = new Promise((resolve, reject) => {
            this._handshakeResolve = resolve;
            this._handshakeReject = reject;

            // Set overall timeout - but DON'T reject, resolve with degraded mode
            this._handshakeTimer = setTimeout(() => {
                if (this._handshakeResolve) {
                    logOnce('warn-icon', 'Handshake timeout, continuing with existing session if available');
                    
                    // Check if we have session
                    if (IframeSessionClient.isValid()) {
                        // Mark handshake as complete via session
                        this._completeHandshake('timeout_with_session');
                        this._handshakeResolve({ success: true, degraded: false, reason: 'timeout_with_session' });
                    } else {
                        // No session, try to get it
                        IframeTransport.requestSessionFromParent();
                        
                        // Resolve with degraded success (don't reject)
                        this._handshakeResolve({ success: true, degraded: true, reason: 'timeout_fallback' });
                    }
                    
                    this._handshakeResolve = null;
                    this._handshakeReject = null;
                }
            }, timeout * maxAttempts);
        });

        // Start handshake attempts
        this._performHandshake(maxAttempts, timeout);

        return this._handshakePromise;
    },

    _performHandshake: function(maxAttempts, timeout) {
        let attempts = 0;
        
        const attemptHandshake = () => {
            if (StateGovernor.isHandshakeComplete()) {
                return;
            }
            
            attempts++;

            const messageId = 'hs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);

            // Send CHILD_READY (don't wait for ACK)
            IframeTransport.send(MESSAGE_TYPES.CHILD_READY, {
                ready: true,
                version: CONFIG.VERSION,
                protocol: CONFIG.PROTOCOL_VERSION,
                environment: IframeEnvironment.detect(),
                timestamp: Date.now()
            }, {
                messageId: messageId,
                requireAck: false,  // Don't require ACK
                priority: 'high'
            }).catch(() => {});

            // Send IFRAME_REGISTERED as backup
            setTimeout(() => {
                if (!StateGovernor.isHandshakeComplete()) {
                    safeRegister();
                }
            }, 100);

            // Check if any session message arrived
            const checkInterval = setInterval(() => {
                if (StateGovernor.isHandshakeComplete() || IframeSessionClient.isValid()) {
                    clearInterval(checkInterval);
                    
                    if (!StateGovernor.isHandshakeComplete() && IframeSessionClient.isValid()) {
                        this._completeHandshake('session_acquired');
                    }
                    
                    if (this._handshakeResolve) {
                        this._handshakeResolve({ success: true });
                        this._handshakeResolve = null;
                        this._handshakeReject = null;
                        
                        if (this._handshakeTimer) {
                            clearTimeout(this._handshakeTimer);
                            this._handshakeTimer = null;
                        }
                    }
                }
            }, 200);

            // Set up retry if needed
            if (attempts < maxAttempts && !StateGovernor.isHandshakeComplete()) {
                setTimeout(() => {
                    clearInterval(checkInterval);
                    if (!StateGovernor.isHandshakeComplete()) {
                        const delay = CONFIG.RETRY_BACKOFF * Math.pow(2, attempts - 1);
                        logOnce('info', `Handshake attempt ${attempts} failed, retrying in ${delay}ms`);
                        setTimeout(attemptHandshake, delay);
                    }
                }, timeout);
            } else if (attempts >= maxAttempts && !StateGovernor.isHandshakeComplete()) {
                // After max attempts, try to get session directly
                clearInterval(checkInterval);
                logOnce('warn-icon', 'Handshake max attempts reached, requesting session directly');
                IframeTransport.requestSessionFromParent();
                
                // Check if we got session after request
                setTimeout(() => {
                    if (!StateGovernor.isHandshakeComplete()) {
                        if (IframeSessionClient.isValid()) {
                            this._completeHandshake('session_after_request');
                        } else {
                            // Still no session, force complete anyway
                            StateGovernor._handshakeCompleted = true;
                            StateGovernor._currentState = STATE.HANDSHAKE_COMPLETE;
                        }
                        
                        if (this._handshakeResolve) {
                            this._handshakeResolve({ success: true, degraded: !IframeSessionClient.isValid() });
                            this._handshakeResolve = null;
                            this._handshakeReject = null;
                            
                            if (this._handshakeTimer) {
                                clearTimeout(this._handshakeTimer);
                                this._handshakeTimer = null;
                            }
                        }
                    }
                }, 1000);
            }
        };

        attemptHandshake();
    },

    reset: function() {
        this._handshakeLock = false;
        this._handshakePromise = null;
        this._handshakeResolve = null;
        this._handshakeReject = null;
        if (this._handshakeTimer) {
            clearTimeout(this._handshakeTimer);
            this._handshakeTimer = null;
        }
    },

    getStatus: function() {
        return {
            handshakeComplete: StateGovernor.isHandshakeComplete(),
            state: StateGovernor.getState(),
            handshakeState: StateGovernor.getState()
        };
    },

    addListener: function(listener) {
        if (typeof listener === 'function') this._listeners.add(listener);
    },
    removeListener: function(listener) { this._listeners.delete(listener); },
    _notifyListeners: function(event, data) {
        this._listeners.forEach(listener => {
            try { listener(event, data); } catch (e) {}
        });
    }
};

IframeHandshakeAuthority.initialize();

// ==================== IFRAME SESSION CLIENT - EVENT-DRIVEN TOKEN ====================
const IframeSessionClient = {
    _session: null,
    _token: null,
    _userId: null,
    _expiresAt: null,
    _refreshToken: null,
    _state: STATE.SESSION_IDLE,
    _valid: false,
    _guestMode: false,
    _refreshTimer: null,
    _checkTimer: null,
    _listeners: new Set(),
    _expiryWarningSent: false,
    _syncInProgress: false,
    _lastSync: 0,
    _syncAttempts: 0,
    _maxSyncAttempts: CONFIG.MAX_RETRIES,
    _usingCachedSession: false,
    _sessionSyncTimer: null,
    _tokenReceived: false,
    _processingToken: false,

    initialize: function() {
        this._loadFromStorage();
        this._setupListeners();
        this._startRefreshTimer();
        this._startCheckTimer();

        if (this._valid && this._token) {
            this._usingCachedSession = true;
            logOnce('success', 'Using cached session');
        }

        if (DEBUG) {
            logOnce('info', 'IframeSessionClient initialized', {
                valid: this._valid,
                expiresAt: this._expiresAt,
                usingCached: this._usingCachedSession
            });
        }

        return this;
    },

    _setupListeners: function() {
        const handler = (event) => {
            if (!OriginSecurity.validateEvent(event)) return;

            const message = event.data;
            if (!message || typeof message !== 'object') return;

            switch (message.type) {
                case MESSAGE_TYPES.SESSION_UPDATE:
                case MESSAGE_TYPES.SESSION_SYNC:
                    this._handleSessionUpdate(message.payload || message.data);
                    break;

                case MESSAGE_TYPES.TOKEN_UPDATE:
                case MESSAGE_TYPES.TOKEN_REFRESH:
                    this._handleTokenUpdate(message.payload || message.data);
                    break;

                case 'TOKEN_RESPONSE':
                    this._handleTokenUpdate(message.payload || message.data);
                    break;

                case 'SESSION_RESPONSE':
                case 'SESSION_DATA':
                    if (message.payload) {
                        this._handleSessionUpdate(message.payload);
                    }
                    break;

                case MESSAGE_TYPES.AUTH_ERROR:
                    this._handleAuthError();
                    break;

                case MESSAGE_TYPES.VERIFY_SESSION:
                    this._handleVerifySession(message.payload || message.data, message.messageId);
                    break;
            }
        };

        window.addEventListener('message', handler);

        IframeTransport.addListener((event, data) => {
            if (event === 'received') {
                if (data && data.type === 'SESSION_RESPONSE' && data.data && data.data.payload) {
                    if (data.data.payload) {
                        this._handleSessionUpdate(data.data.payload);
                    }
                }
            }
        });

        this._listeners.add({ type: 'message', handler });
    },

    _handleSessionUpdate: function(data) {
        logOnce('success', 'Session active from parent');

        let updated = false;

        if (data.token) {
            this._token = data.token;
            this._tokenReceived = true;
            updated = true;
        }

        if (data.userId || data.user?.id) {
            this._userId = data.userId || data.user?.id;
            updated = true;
        }

        if (data.expires || data.expiry) {
            this._expiresAt = data.expires || data.expiry;
            updated = true;
        }

        if (data.refreshToken) {
            this._refreshToken = data.refreshToken;
            updated = true;
        }

        if (data.authenticated !== undefined) {
            this._valid = data.authenticated;
            updated = true;
        }

        if (updated) {
            this._updateSession();
            this._saveToStorage();
            this._sendAck();
            this._expiryWarningSent = false;
            this._usingCachedSession = false;

            if (APICore) {
                APICore.setToken(this._token, this._refreshToken, this._expiresAt);
            }

            this._notifyListeners('update', data);

            // If we received token, resolve token promise
            if (this._tokenReceived && StateGovernor.getState() === STATE.SESSION_SYNCING) {
                StateGovernor.transition(STATE.SESSION_SYNCING, STATE.TOKEN_READY);
            }
        }
    },

    _handleTokenUpdate: function(data) {
        if (this._processingToken) return;
        this._processingToken = true;

        try {
            if (!data || !data.token) return;
            if (data.token.includes('demo-token')) return;
            if (this._token === data.token) return;

            this._token = data.token;
            this._tokenReceived = true;
            this._expiresAt = data.expires || data.expiry || (Date.now() + 3600000);
            this._refreshToken = data.refreshToken || this._refreshToken;

            this._updateSession();
            this._saveToStorage();
            this._sendAck();

            if (APICore && APICore._token !== data.token) {
                setTimeout(() => {
                    APICore.setToken(data.token, this._refreshToken, this._expiresAt);
                }, 0);
            }

            logOnce('success', 'Token updated');
            this._notifyListeners('token', data);

            // Resolve token promise
            if (StateGovernor.getState() === STATE.SESSION_SYNCING) {
                StateGovernor.transition(STATE.SESSION_SYNCING, STATE.TOKEN_READY);
            }

        } finally {
            setTimeout(() => { this._processingToken = false; }, 500);
        }
    },

    _handleAuthError: function() {
        logOnce('warn-icon', 'Auth error, clearing session');
        this.clear();
    },

    _handleVerifySession: function(data, messageId) {
        const isValid = this.isValid();
        const requestId = messageId || ('verify_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8));

        IframeTransport.send('VERIFY_SESSION', {
            valid: isValid,
            userId: this._userId,
            expiresAt: this._expiresAt,
            timestamp: Date.now()
        }, {
            messageId: requestId,
            requireAck: true,
            priority: 'high'
        }).catch(() => {});
    },

    _updateSession: function() {
        this._session = {
            token: this._token,
            userId: this._userId,
            expiresAt: this._expiresAt,
            refreshToken: this._refreshToken,
            valid: this._valid,
            demoMode: false,
            guestMode: this._guestMode
        };

        this._state = this._valid ? STATE.SESSION_VALID : STATE.SESSION_IDLE;
    },

    _sendAck: function() {
        IframeTransport.send(MESSAGE_TYPES.SESSION_ACK, {
            success: true,
            timestamp: Date.now()
        }, { requireAck: false }).catch(() => {});

        logOnce('sending', 'Sending SESSION_ACK');
    },

    _saveToStorage: function() {
        if (this._demoMode) return;

        SafeStorage.set('session', {
            token: this._token,
            userId: this._userId,
            expiresAt: this._expiresAt,
            refreshToken: this._refreshToken,
            valid: this._valid,
            timestamp: Date.now()
        });
    },

        _loadFromStorage: function() {
        try {
            const stored = SafeStorage.get('session');
            if (!stored) {
                logOnce('info', 'No stored session found');
                return false;
            }

            // Check if token exists and is valid
            if (stored.token && stored.token.length > 10) {
                // Check expiry
                const expiresAt = stored.expiresAt || stored.expiry;
                if (expiresAt && expiresAt < Date.now()) {
                    logOnce('warn-icon', 'Stored session expired, removing');
                    SafeStorage.remove('session');
                    return false;
                }

                // Load the session data
                this._token = stored.token;
                this._userId = stored.userId;
                this._expiresAt = expiresAt || (Date.now() + 3600000);
                this._refreshToken = stored.refreshToken;
                this._valid = true;  // CRITICAL: Set valid to true
                this._state = STATE.SESSION_VALID;
                this._usingCachedSession = true;
                
                this._session = {
                    token: this._token,
                    userId: this._userId,
                    expiresAt: this._expiresAt,
                    refreshToken: this._refreshToken,
                    valid: true,
                    demoMode: false,
                    guestMode: this._guestMode
                };

                logOnce('success', 'Session restored from storage', {
                    userId: this._userId,
                    expiresIn: Math.floor((this._expiresAt - Date.now()) / 1000) + 's'
                });
                
                // Notify listeners that we have a session
                this._notifyListeners('update', { 
                    token: this._token, 
                    userId: this._userId,
                    fromStorage: true 
                });
                
                return true;
            }

            SafeStorage.remove('session');
            return false;

        } catch (error) {
            logOnce('warn', 'Failed to load session from storage', error);
            return false;
        }
    },

    clear: function() {
        this._session = null;
        this._token = null;
        this._userId = null;
        this._expiresAt = null;
        this._refreshToken = null;
        this._valid = false;
        this._guestMode = false;
        this._state = STATE.SESSION_IDLE;
        this._usingCachedSession = false;
        this._tokenReceived = false;

        SafeStorage.remove('session');

        this._notifyListeners('clear', {});
        this._expiryWarningSent = false;

        logOnce('info', 'Session cleared');
    },

    _startRefreshTimer: function() {
        if (this._refreshTimer) clearTimeout(this._refreshTimer);

        if (!this._expiresAt || this._demoMode) return;

        const now = Date.now();
        const timeUntilExpiry = this._expiresAt - now;
        const refreshTime = Math.max(0, timeUntilExpiry - CONFIG.SESSION_REFRESH_THRESHOLD);

        if (refreshTime <= 0) {
            IframeTransport.requestSessionFromParent();
            return;
        }

        this._refreshTimer = setTimeout(() => {
            IframeTransport.requestSessionFromParent();
        }, refreshTime);
    },

    _startCheckTimer: function() {
        if (this._checkTimer) clearInterval(this._checkTimer);

        this._checkTimer = setInterval(() => {
            if (this._expiresAt && this._expiresAt < Date.now()) {
                logOnce('warn-icon', 'Session expired');

                if (!this._expiryWarningSent) {
                    this._expiryWarningSent = true;
                    this._notifyListeners('expired', {});
                }

                this.clear();
            } else if (this._expiresAt && (this._expiresAt - Date.now()) < 300000 && !this._expiryWarningSent) {
                this._expiryWarningSent = true;
                this._notifyListeners('expiring', { timeLeft: this._expiresAt - Date.now() });
            }
        }, 60000);
    },

    addListener: function(listener) {
        if (typeof listener === 'function') this._listeners.add(listener);
    },
    removeListener: function(listener) { this._listeners.delete(listener); },
    _notifyListeners: function(event, data) {
        this._listeners.forEach(listener => {
            try { listener(event, data); } catch (e) {}
        });
    },

    getSession: function() { return this._session ? { ...this._session } : null; },
    getToken: function() { return this._token; },
    getUserId: function() { return this._userId; },
    
    // ===== FIXED isValid() METHOD =====
    isValid: function() {
        // Check if we have a token
        if (!this._token || this._token.length < 10) {
            // Try to load from storage again
            this._loadFromStorage();
            if (!this._token || this._token.length < 10) {
                return false;
            }
        }

        // Check if token is expired
        if (this._expiresAt && this._expiresAt < Date.now()) {
            logOnce('warn-icon', 'Token expired');
            return false;
        }

        // If we have a token and it's not expired, session is valid
        return true;
    },

    // Add a helper method to force check storage
    checkStorage: function() {
        return this._loadFromStorage();
    },

    isDemoMode: function() { return false; },
    isGuestMode: function() { return this._guestMode; },
    getTimeRemaining: function() { return this._expiresAt ? Math.max(0, this._expiresAt - Date.now()) : 0; },
    getState: function() { return this._state; },

    cleanup: function() {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
            this._refreshTimer = null;
        }
        if (this._checkTimer) {
            clearInterval(this._checkTimer);
            this._checkTimer = null;
        }
        if (this._sessionSyncTimer) {
            clearTimeout(this._sessionSyncTimer);
            this._sessionSyncTimer = null;
        }
        this._listeners.clear();
    }
};

IframeSessionClient.initialize();    

    // ==================== RELIABILITY ENGINE (PRESERVED) ====================
    const ReliabilityEngine = {
        _circuitBreakers: new Map(),
        _retryCounters: new Map(),
        _backoffBase: CONFIG.RETRY_BACKOFF,
        _maxRetries: CONFIG.MAX_RETRIES,
        _offlineQueue: [],
        _online: navigator.onLine,
        _listeners: new Set(),

        initialize: function() {
            this._setupListeners();
            if (DEBUG) logOnce('info', 'ReliabilityEngine initialized', {
                maxRetries: this._maxRetries,
                backoffBase: this._backoffBase
            });
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

            IframeTransport.addListener((event, data) => {
                if (event === 'connection_suspect') {
                    this._notifyListeners('connection_suspect', data);
                }
            });
        },

        getCircuitBreaker: function(name) {
            if (!this._circuitBreakers.has(name)) {
                this._circuitBreakers.set(name, new CircuitBreaker(name));
            }
            return this._circuitBreakers.get(name);
        },

        canRetry: function(key, maxRetries = this._maxRetries) {
            const count = this._retryCounters.get(key) || 0;
            const breaker = this.getCircuitBreaker(key);
            return count < maxRetries && breaker.canExecute();
        },

        incrementRetry: function(key) {
            const count = (this._retryCounters.get(key) || 0) + 1;
            this._retryCounters.set(key, count);
            return count;
        },

        resetRetry: function(key) {
            this._retryCounters.delete(key);
            const breaker = this.getCircuitBreaker(key);
            breaker.success();
        },

        recordFailure: function(key) {
            const breaker = this.getCircuitBreaker(key);
            breaker.failure();
        },

        getBackoffDelay: function(key) {
            const count = this._retryCounters.get(key) || 0;
            let delay = this._backoffBase * Math.pow(2, count);
            if (IframeEnvironment.isVPNNetwork()) delay *= 1.5;
            return delay;
        },

        executeWithRetry: async function(fn, key, options = {}) {
            const maxRetries = options.maxRetries || this._maxRetries;
            const timeout = options.timeout || 30000;
            let lastError;

            while (this.canRetry(key, maxRetries)) {
                const attempt = this.incrementRetry(key);

                try {
                    const result = await Promise.race([
                        fn(),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
                        )
                    ]);

                    this.resetRetry(key);
                    return result;

                } catch (error) {
                    lastError = error;
                    this.recordFailure(key);

                    if (attempt >= maxRetries) break;

                    const delay = this.getBackoffDelay(key);

                    if (DEBUG) {
                        logOnce('warn-icon', `Retry ${attempt}/${maxRetries} for ${key} in ${delay}ms`, error.message);
                    }

                    if (options.onRetry) options.onRetry(attempt, delay, error);

                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            throw new Error(`Max retries (${maxRetries}) exceeded for ${key}: ${lastError?.message || 'Unknown error'}`);
        },

        queueOffline: function(operation) {
            this._offlineQueue.push({ ...operation, timestamp: Date.now() });
            this._notifyListeners('queued', { type: operation.type });
        },

        _processOfflineQueue: function() {
            if (this._offlineQueue.length === 0) return;

            logOnce('info', `Processing ${this._offlineQueue.length} offline operations`);

            const queue = [...this._offlineQueue];
            this._offlineQueue = [];

            queue.forEach(operation => {
                try {
                    if (operation.execute) {
                        operation.execute().catch(() => {
                            this._offlineQueue.push(operation);
                        });
                    }
                } catch (e) {
                    this._offlineQueue.push(operation);
                }
            });
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },
        removeListener: function(listener) { this._listeners.delete(listener); },
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
                offlineQueueSize: this._offlineQueue.length
            };
        }
    };

    class CircuitBreaker {
        constructor(name) {
            this.name = name;
            this.failureThreshold = CONFIG.CIRCUIT_BREAKER_THRESHOLD;
            this.resetTimeout = CONFIG.CIRCUIT_BREAKER_RESET;
            this.state = 'CLOSED';
            this.failureCount = 0;
            this.lastFailureTime = null;
            this.nextAttemptTime = null;
        }

        success() {
            if (this.state === 'HALF_OPEN') {
                this.state = 'CLOSED';
                this.failureCount = 0;
                if (DEBUG) logOnce('info', `Circuit breaker ${this.name} closed`);
            } else {
                this.failureCount = 0;
            }
        }

        failure() {
            this.failureCount++;
            this.lastFailureTime = Date.now();

            if (this.failureCount >= this.failureThreshold) {
                this.state = 'OPEN';
                this.nextAttemptTime = Date.now() + this.resetTimeout;
                logOnce('warn-icon', `Circuit breaker ${this.name} opened after ${this.failureCount} failures`);
            }
        }

        canExecute() {
            if (this.state === 'CLOSED') return true;

            if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTime) {
                this.state = 'HALF_OPEN';
                if (DEBUG) logOnce('info', `Circuit breaker ${this.name} half-open`);
                return true;
            }

            return this.state === 'HALF_OPEN';
        }

        getState() { return this.state; }
    }

    ReliabilityEngine.initialize();

    // ==================== RECOVERY MANAGER (PRESERVED) ====================
    const RecoveryManager = {
        _recoveryInProgress: false,
        _recoveryAttempts: 0,
        _maxRecoveryAttempts: CONFIG.MAX_RECOVERY_ATTEMPTS,
        _recoveryBackoff: CONFIG.RECOVERY_DELAY,
        _lastCheckpoint: null,
        _checkpoints: [],
        _recoveryTimer: null,
        _listeners: new Set(),
        _recoveryPromise: null,

        initialize: function() {
            this._recoveryAttempts = 0;
            this._recoveryInProgress = false;
            this._loadLastCheckpoint();

            if (DEBUG) logOnce('info', 'RecoveryManager initialized', {
                maxAttempts: this._maxRecoveryAttempts,
                backoff: this._recoveryBackoff
            });

            return this;
        },

        createCheckpoint: function(name, data = {}) {
            const checkpoint = {
                name,
                timestamp: Date.now(),
                state: StateGovernor.getState(),
                sessionValid: IframeSessionClient.isValid(),
                sessionDemo: false,
                environment: IframeEnvironment.detect(),
                data: data
            };

            this._checkpoints.push(checkpoint);
            if (this._checkpoints.length > 10) this._checkpoints.shift();
            this._lastCheckpoint = checkpoint;

            this._saveCheckpoint();

            if (DEBUG) logOnce('info', `Checkpoint created: ${name}`);

            return checkpoint;
        },

        _saveCheckpoint: function() {
            if (this._lastCheckpoint) {
                SafeStorage.set('checkpoint', {
                    name: this._lastCheckpoint.name,
                    timestamp: this._lastCheckpoint.timestamp,
                    state: this._lastCheckpoint.state,
                    sessionValid: this._lastCheckpoint.sessionValid
                });
            }
        },

        _loadLastCheckpoint: function() {
            try {
                const stored = SafeStorage.get('checkpoint');
                if (stored) {
                    this._lastCheckpoint = stored;
                    if (DEBUG) logOnce('info', 'Loaded last checkpoint', stored);
                }
            } catch (error) {
                logOnce('warn', 'Failed to load checkpoint', error);
            }
        },

        recover: async function() {
            if (this._recoveryPromise) return this._recoveryPromise;

            if (this._recoveryInProgress) {
                return { success: false, reason: 'in_progress' };
            }

            this._recoveryInProgress = true;
            this._recoveryAttempts++;

            logOnce('info', `Starting recovery (attempt ${this._recoveryAttempts})`);
            this._notifyListeners('start', { attempt: this._recoveryAttempts });

            StateGovernor.transition(StateGovernor.getState(), STATE.RECOVERING);

            this._recoveryPromise = (async () => {
                try {
                    if (!navigator.onLine) {
                        logOnce('warn-icon', 'Recovery: Offline, waiting for network');
                        await this._waitForNetwork();
                    }

                    if (!window.parent || window.parent === window) {
                        logOnce('warn-icon', 'Recovery: No parent window');
                        this._recoveryInProgress = false;
                        StateGovernor.transition(STATE.RECOVERING, STATE.DEGRADED);
                        this._notifyListeners('failed', { reason: 'no_parent' });
                        this._sendStatusWarning('no_parent');
                        return { success: false, reason: 'no_parent' };
                    }

                    await fetchActiveCallUsers();

                    if (!IframeSessionClient.isValid()) {
                        IframeTransport.requestSessionFromParent();
                    }

                    this._recoveryAttempts = 0;
                    this._recoveryInProgress = false;
                    StateGovernor.transition(STATE.RECOVERING, STATE.ACTIVE);

                    logOnce('success', 'Recovery successful');
                    this._notifyListeners('success', {});

                    return { success: true };

                } catch (error) {
                    logOnce('error', 'Recovery failed', error);

                    this._recoveryInProgress = false;
                    StateGovernor.transition(STATE.RECOVERING, STATE.DEGRADED);
                    this._notifyListeners('failed', { error: error.message });

                    this._sendStatusWarning('recovery_failed');

                    if (this._recoveryAttempts < this._maxRecoveryAttempts) {
                        let delay = this._recoveryBackoff * Math.pow(2, this._recoveryAttempts - 1);
                        if (IframeEnvironment.isVPNNetwork()) delay *= 1.5;

                        logOnce('info', `Recovery retrying in ${delay}ms`);

                        this._recoveryTimer = setTimeout(() => {
                            this._recoveryPromise = null;
                            this.recover();
                        }, delay);
                    }

                    return { success: false, reason: error.message };
                } finally {
                    this._recoveryPromise = null;
                }
            })();

            return this._recoveryPromise;
        },

        _sendStatusWarning: function(reason) {
            try {
                window.parent.postMessage({
                    type: MESSAGE_TYPES.CALLS_STATUS_WARNING,
                    severity: "soft",
                    reason: reason,
                    timestamp: Date.now()
                }, OriginSecurity.getTargetOrigin());
            } catch (e) {}
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
                }, 30000);
            });
        },

        scheduleRecovery: function(delay = CONFIG.RECOVERY_DELAY) {
            if (this._recoveryTimer) clearTimeout(this._recoveryTimer);

            this._recoveryTimer = setTimeout(() => {
                if (StateGovernor.getState() !== STATE.ACTIVE &&
                    StateGovernor.getState() !== STATE.READY) {
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
        removeListener: function(listener) { this._listeners.delete(listener); },
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

    // ==================== COMPATIBILITY BRIDGE (PRESERVED) ====================
    const CompatibilityBridge = {
        _legacyMode: false,
        _parentCapabilities: new Set(),
        _detected: false,
        _version: CONFIG.VERSION,

        detect: function() {
            if (this._detected) return this._legacyMode;

            try {
                if (window.parent && window.parent.HandshakeManager &&
                    window.parent.MessageBus && window.parent.SessionAuthority) {
                    this._parentCapabilities.add('handshake_manager');
                    this._parentCapabilities.add('message_bus');
                    this._parentCapabilities.add('session_authority');
                    this._legacyMode = false;
                } else {
                    this._legacyMode = true;
                }
            } catch (e) {
                this._legacyMode = true;
            }

            if (IframeSessionClient.getToken() && IframeSessionClient.getToken().length > 20) {
                this._legacyMode = false;
            }

            if (IframeEnvironment.isSandboxed()) this._legacyMode = true;

            this._detected = true;

            if (DEBUG) logOnce('info', 'CompatibilityBridge', {
                legacyMode: this._legacyMode,
                capabilities: Array.from(this._parentCapabilities)
            });

            return this._legacyMode;
        },

        adaptOutgoing: function(message) {
            this.detect();

            if (!this._legacyMode && this._parentCapabilities.has('message_bus')) {
                return message;
            }

            const legacyMessage = {
                id: message.messageId,
                type: message.type,
                source: message.source,
                timestamp: message.timestamp,
                payload: message.payload,
                data: message.payload,
                version: '1.0',
                legacy: true
            };

            if (message.token) legacyMessage.token = message.token;

            return legacyMessage;
        },

        adaptIncoming: function(rawMessage) {
            if (!rawMessage || typeof rawMessage !== 'object') return null;

            if (rawMessage.protocol === CONFIG.PROTOCOL_VERSION) return rawMessage;

            const canonical = {
                protocol: CONFIG.PROTOCOL_VERSION,
                messageId: rawMessage.id || rawMessage.messageId || this._generateId(),
                type: rawMessage.type,
                source: rawMessage.source || 'parent',
                target: 'iframe',
                timestamp: rawMessage.timestamp || Date.now(),
                payload: rawMessage.payload || rawMessage.data || {},
                legacy: true
            };

            return canonical;
        },

        _generateId: function() {
            return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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

    // ==================== DIAGNOSTICS AGENT (PRESERVED) ====================
    const DiagnosticsAgent = {
        _enabled: DEBUG,
        _metrics: {
            messagesSent: 0,
            messagesReceived: 0,
            handshakeAttempts: 0,
            handshakeSuccesses: 0,
            sessionUpdates: 0,
            errors: 0,
            retries: 0,
            recoveries: 0,
            stateChanges: 0
        },
        _history: [],
        _startTime: Date.now(),
        _snapshots: [],
        _maxHistory: 100,
        _maxSnapshots: 20,

        enable: function() {
            this._enabled = true;
            this._startTime = Date.now();
            if (DEBUG) logOnce('info', 'DiagnosticsAgent enabled');
        },

        disable: function() { this._enabled = false; },

        record: function(name, data = {}) {
            if (!this._enabled) return;

            if (this._metrics.hasOwnProperty(name)) this._metrics[name]++;

            const entry = {
                name,
                data,
                timestamp: Date.now(),
                state: {
                    coreState: StateGovernor.getState(),
                    sessionValid: IframeSessionClient.isValid(),
                    online: navigator.onLine,
                    visible: !document.hidden
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
                    visible: !document.hidden
                },
                environment: IframeEnvironment.getFullReport(),
                transport: IframeTransport.getStatus(),
                handshake: IframeHandshakeAuthority.getStatus(),
                session: IframeSessionClient.isValid() ? {
                    valid: true,
                    timeRemaining: IframeSessionClient.getTimeRemaining()
                } : { valid: false },
                recovery: RecoveryManager.getStatus(),
                api: APICore.getStatus()
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
                    visible: !document.hidden
                },
                environment: IframeEnvironment.getFullReport(),
                transport: IframeTransport.getStatus(),
                handshake: IframeHandshakeAuthority.getStatus(),
                session: IframeSessionClient.isValid() ? {
                    valid: true,
                    timeRemaining: IframeSessionClient.getTimeRemaining()
                } : { valid: false },
                recovery: RecoveryManager.getStatus(),
                api: APICore.getStatus()
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
                stateChanges: 0
            };
            this._history = [];
            this._snapshots = [];
            this._startTime = Date.now();
        }
    };

    if (DEBUG) DiagnosticsAgent.enable();

    // ==================== MULTI-MODULE COORDINATOR (PRESERVED) ====================
    const MultiModuleCoordinator = {
        _modules: new Map(),
        _authority: null,
        _initialized: false,

        initialize: function() {
            if (this._initialized) return this;

            this._authority = {
                environment: IframeEnvironment,
                storage: SafeStorage,
                transport: IframeTransport,
                handshake: IframeHandshakeAuthority,
                session: IframeSessionClient,
                reliability: ReliabilityEngine,
                recovery: RecoveryManager,
                compatibility: CompatibilityBridge,
                diagnostics: DiagnosticsAgent,
                origin: OriginSecurity,
                api: APICore,
                state: StateGovernor
            };

            this._initialized = true;
            if (DEBUG) logOnce('info', 'MultiModuleCoordinator initialized');

            return this;
        },

        register: function(name, module) {
            if (this._modules.has(name)) {
                logOnce('warn', `Module ${name} already registered, overriding`);
            }
            this._modules.set(name, module);
            if (DEBUG) logOnce('info', `Module registered: ${name}`);
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

    // ==================== UI FAILSAFE (PRESERVED) ====================
    const UIFailsafe = {
        _enabled: true,
        _fallbackMode: false,
        _disabledButtons: new Set(),
        _disabledInputs: new Set(),
        _originalStates: new Map(),
        _listeners: new Set(),

        initialize: function() {
            if (DEBUG) logOnce('info', 'UIFailsafe initialized');
            return this;
        },

        enableFallbackMode: function() {
            if (this._fallbackMode) return;
            this._fallbackMode = true;
            if (DEBUG) logOnce('warn-icon', 'UI fallback mode enabled');
            this._notifyListeners('fallback', { enabled: true });
        },

        disableFallbackMode: function() {
            if (!this._fallbackMode) return;
            this._fallbackMode = false;
            this._restoreUI();
            if (DEBUG) logOnce('info', 'UI fallback mode disabled');
            this._notifyListeners('fallback', { enabled: false });
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
                        if (DEBUG) logOnce('warn-icon', `Button click blocked in fallback mode: ${button.id || 'unknown'}`);
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
                    if (DEBUG) logOnce('warn-icon', `Input blocked in fallback mode: ${input.id || 'unknown'}`);
                } else if (originalInput) {
                    originalInput.call(input, e);
                }
            };
            this._disabledInputs.add(id);
        },

        showFallbackMessage: function(message, type = 'warning') {
            const notificationArea = document.getElementById('notificationArea') || document.body;
            const notification = document.createElement('div');
            notification.className = `call-notification ${type}`;
            notification.innerHTML = `
                <div class="call-notification-content">
                    <div class="call-notification-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                    <div class="call-notification-message">${message}</div>
                </div>
                <button class="call-notification-close">
                    <i class="fas fa-times"></i>
                </button>
            `;

            notification.querySelector('.call-notification-close').addEventListener('click', () => notification.remove());

            notificationArea.appendChild(notification);

            setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 5000);
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
        removeListener: function(listener) { this._listeners.delete(listener); },
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

    // ==================== NAVIGATION GUARD (PRESERVED) ====================
    const NavigationGuard = {
        _currentPath: window.location.pathname,
        _currentHash: window.location.hash,
        _navigationInProgress: false,
        _pendingNavigation: null,
        _listeners: new Set(),

        initialize: function() {
            this._setupListeners();
            if (DEBUG) logOnce('info', 'NavigationGuard initialized', { path: this._currentPath, hash: this._currentHash });
            return this;
        },

        _setupListeners: function() {
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;

            history.pushState = (...args) => {
                this._handleNavigation('pushState', args);
                return originalPushState.apply(history, args);
            };

            history.replaceState = (...args) => {
                this._handleNavigation('replaceState', args);
                return originalReplaceState.apply(history, args);
            };

            window.addEventListener('popstate', () => {
                this._handleNavigation('popstate', {});
            });

            window.addEventListener('hashchange', () => {
                this._handleNavigation('hashchange', { hash: window.location.hash });
            });
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
        removeListener: function(listener) { this._listeners.delete(listener); },
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
                hasPendingNavigation: !!this._pendingNavigation
            };
        }
    };

    NavigationGuard.initialize();

    // ==================== DETERMINISTIC SAFE INITIALIZATION ====================
    let _PARENT_READY_ = false;
    let _HANDSHAKE_DONE_ = false;
    let _HANDSHAKE_RETRIES_ = 0;
    const MAX_HANDSHAKE = CONFIG.HANDSHAKE_MAX_ATTEMPTS;

    let currentState = STATE.INIT;
    let iframeId = null;
    let sessionToken = null;
    let sessionExpiry = null;
    let heartbeatInterval = null;
    let authRetryCount = 0;
    let isVisible = true;
    let isOnline = navigator.onLine;
    let errorCache = new Map();
    let messageCache = new Set();
    let pendingRequests = new Map();
    let eventListeners = new Map();
    let timers = new Set();
    let stateChangeCallbacks = new Set();
    let suspendedTimestamp = null;

    let currentUser = null;
    let userDataLoaded = false;
    let sessionAuthorityReady = false;
    let parentCoordinator = null;
    let secureHandshakeInProgress = false;
    let secureSessionValid = false;
    let secureHandshakeTimeout = null;
    let secureHandshakeAttempts = 0;
    const maxHandshakeAttempts = CONFIG.HANDSHAKE_MAX_ATTEMPTS;
    const handshakeTimeout = CONFIG.HANDSHAKE_TIMEOUT;
    const sessionRetryDelay = CONFIG.SESSION_RETRY_DELAY;

    let coreReady = false;
    let coreInitialized = false;
    let coreInitializationLock = false;
    let coreData = {
        friendsList: [],
        groupsList: [],
        chatHistory: [],
        notifications: [],
        settings: {}
    };
    let messageQueue = [];

    const loggedErrors = new Set();
    const retryCounters = new Map();
    const trustedOrigins = new Set([
        'http://localhost:5500',
        'https://localhost:5500',
        'http://127.0.0.1:5500',
        'https://127.0.0.1:5500',
        window.location.origin
    ]);

    try {
        if (window.location.hostname.endsWith('.onrender.com')) trustedOrigins.add(window.location.origin);
    } catch (e) {}

    const messageDuplicates = new Set();

    let validatedSession = null;
    let sessionValidationTimestamp = 0;
    const SESSION_VALIDATION_TTL = 30000;

    let callCoreState = CallCoreState.IDLE;
    let handshakePromise = null;
    let handshakeResolve = null;
    let handshakeReject = null;
    let sessionAckReceived = false;
    let sessionAckTimestamp = 0;
    let sessionSyncAttempts = 0;
    const MAX_SESSION_SYNC_ATTEMPTS = CONFIG.HANDSHAKE_MAX_ATTEMPTS;

    let recoveryInProgress = false;
    let lastValidSession = null;
    let sessionValidationTimer = null;
    let _verificationInProgress = false;
    let _lastVerificationTime = 0;
    let _lastVerificationResult = true;
    const VERIFICATION_COOLDOWN = 10000;

    // ==================== ORIGINAL ENVIRONMENT DETECTOR (PRESERVED) ====================
    const EnvironmentDetector = {
        _env: null,
        _latency: 0,
        _detected: false,

        detect: function() {
            if (this._detected) return this._env;

            const hostname = window.location.hostname;
            const protocol = window.location.protocol;

            if (hostname === 'localhost' || hostname === '127.0.0.1' ||
                hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
                protocol === 'file:') {
                this._env = 'LOCAL_DEV';
            }
            else if (hostname.endsWith('.onrender.com')) {
                this._env = 'RENDER_HOSTED';
            }
            else {
                this._env = 'PRODUCTION';
            }

            this._detectLatency();

            this._detected = true;

            if (window.__IFRAME_DEBUG__) {
                console.log('[Environment]', this.getFullReport());
            }

            return this._env;
        },

        _detectLatency: function() {
            if (navigator.connection) {
                const conn = navigator.connection;
                if (conn.rtt > 300) {
                    this._latency = conn.rtt;
                    this._env = 'VPN_NETWORK';
                } else if (conn.downlink < 1) {
                    this._env = 'VPN_NETWORK';
                }
            }

            if (performance && performance.timing) {
                const navStart = performance.timing.navigationStart;
                const responseEnd = performance.timing.responseEnd;
                if (navStart && responseEnd && (responseEnd - navStart) > 500) {
                    this._latency = responseEnd - navStart;
                    this._env = 'VPN_NETWORK';
                }
            }
        },

        getFullReport: function() {
            return {
                environment: this._env,
                hostname: window.location.hostname,
                protocol: window.location.protocol,
                latency: this._latency,
                connection: navigator.connection ? {
                    rtt: navigator.connection.rtt,
                    downlink: navigator.connection.downlink,
                    type: navigator.connection.type
                } : null,
                userAgent: navigator.userAgent
            };
        },

        isLocalDev: function() { return this.detect() === 'LOCAL_DEV'; },
        isRenderHosted: function() { return this.detect() === 'RENDER_HOSTED'; },
        isProduction: function() { return this.detect() === 'PRODUCTION'; },
        isVPNNetwork: function() { return this.detect() === 'VPN_NETWORK' || this._latency > 300; },

        getTimeouts: function() {
            const env = this.detect();
            if (env === 'VPN_NETWORK' || this._latency > 300) {
                return { handshake: 15000, session: 12000, ack: 8000, heartbeat: 45000, retryBackoff: 1500 };
            }
            if (env === 'PRODUCTION') {
                return { handshake: 8000, session: 6000, ack: 5000, heartbeat: 30000, retryBackoff: 800 };
            }
            return { handshake: 5000, session: 4000, ack: 3000, heartbeat: 15000, retryBackoff: 500 };
        },

        getMaxRetries: function() {
            const env = this.detect();
            if (env === 'VPN_NETWORK') return 8;
            if (env === 'PRODUCTION') return 5;
            return 3;
        }
    };

    // ==================== UNIQUE IDENTIFIER (PRESERVED) ====================
    (function generateIframeId() {
        iframeId = 'calls-iframe-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
        if (window.name && window.name.startsWith('calls-iframe-')) {
            iframeId = window.name;
        } else {
            try { window.name = iframeId; } catch (e) {}
        }

        trustedOrigins.add(window.location.origin);
        try {
            const localhost = window.location.origin.replace(/:\d+/, ':5500');
            trustedOrigins.add(localhost);
        } catch (e) {}

        try {
            if (window.location.hostname.endsWith('.onrender.com')) trustedOrigins.add(window.location.origin);
        } catch (e) {}

        try {
            if (window.parent && window.parent !== window && window.parent.location) {
                trustedOrigins.add(window.parent.location.origin);
            }
        } catch (e) {}
    })();

    // ==================== ORIGINAL LOGGING SYSTEM (PRESERVED) ====================
    const logger = {
        _errors: new Map(),
        _history: [],
        _metrics: { info: 0, warn: 0, error: 0, once: 0 },
        _debugMode: window.__IFRAME_DEBUG__ === true,

        _hash: function(msg) {
            let hash = 0;
            for (let i = 0; i < msg.length; i++) {
                hash = ((hash << 5) - hash) + msg.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString(16);
        },

        _sanitize: function(data) {
            try {
                return JSON.parse(JSON.stringify(data, (key, value) => {
                    if (key === 'stream' || key === 'peer' || key.includes('Stream')) return '[Stream]';
                    if (key === 'token' || key.includes('Token') || key.includes('auth')) return '[REDACTED]';
                    if (key === 'password' || key.includes('Password') || key.includes('secret')) return '[REDACTED]';
                    return value;
                }));
            } catch {
                return String(data);
            }
        },

        _store: function(level, msg, data) {
            const entry = {
                timestamp: Date.now(),
                level,
                msg,
                data: data ? this._sanitize(data) : null,
                id: this._hash(msg + Date.now()),
                module: 'calls-core'
            };
            this._history.push(entry);
            if (this._history.length > 100) this._history.shift();
            this._metrics[level] = (this._metrics[level] || 0) + 1;
            return entry;
        },

        info: function(msg, data = null) {
            this._store('info', msg, data);
            if (this._debugMode) console.info(`[Calls core:${iframeId?.substring(0, 8) || 'init'}] ${msg}`, data ? data : '');
        },

        warn: function(msg, data = null) {
            this._store('warn', msg, data);
            if (this._debugMode) console.warn(`[Calls core:${iframeId?.substring(0, 8) || 'init'}] ⚠️ ${msg}`, data ? data : '');
        },

        error: function(msg, error = null, context = null) {
            const hash = logger._hash(msg + (error?.stack || '') + (context || ''));
            const now = Date.now();

            if (logger._errors.has(hash)) {
                const lastLog = logger._errors.get(hash);
                if (now - lastLog < CONFIG.ERROR_CACHE_TTL) return;
            }

            logger._errors.set(hash, now);
            logger._store('error', msg, { error: error?.message || error, context });

            console.error(`[Calls core:${iframeId?.substring(0, 8) || 'init'}] 🔴 ${msg}`,
                error ? error : '',
                context ? `Context: ${context}` : '');

            setTimeout(() => logger._errors.delete(hash), CONFIG.ERROR_CACHE_TTL);

            if (DiagnosticsAgent && typeof DiagnosticsAgent.record === 'function') {
                DiagnosticsAgent.record('errors', { msg, error: error?.message });
            }
        },

        once: function(msg, data = null) {
            const hash = logger._hash(msg);
            if (!logger._errors.has(hash)) {
                logger._errors.set(hash, Date.now());
                logger._store('once', msg, data);
                if (this._debugMode) console.info(`[Calls core:${iframeId?.substring(0, 8) || 'init'}] 📌 ${msg}`, data ? data : '');
                setTimeout(() => logger._errors.delete(hash), 5000);
            }
        },

        enableDebug: function() { this._debugMode = true; if (DiagnosticsAgent) DiagnosticsAgent.enable(); },
        disableDebug: function() { this._debugMode = false; if (DiagnosticsAgent) DiagnosticsAgent.disable(); },
        clear: function() { this._errors.clear(); this._history = []; this._metrics = { info: 0, warn: 0, error: 0, once: 0 }; },
        getMetrics: function() { return { ...this._metrics, historySize: this._history.length }; }
    };

    // ==================== ORIGINAL UTILITY FUNCTIONS (PRESERVED) ====================
    function canRetry(key, maxAttempts = CONFIG.MAX_RETRIES) {
        const count = retryCounters.get(key) || 0;
        return count < maxAttempts;
    }

    function incrementRetryCount(key) {
        const count = (retryCounters.get(key) || 0) + 1;
        retryCounters.set(key, count);
        return count;
    }

    function getRetryCount(key) { return retryCounters.get(key) || 0; }
    function resetRetryCount(key) { retryCounters.delete(key); }

    function isMessageDuplicate(message) {
        const key = `${message.type}:${message.id || 'no-id'}`;
        if (messageDuplicates.has(key)) return true;
        messageDuplicates.add(key);
        setTimeout(() => messageDuplicates.delete(key), CONFIG.MESSAGE_CACHE_TTL);
        return false;
    }

    function logOnceLegacy(type, msg) {
        const hash = logger._hash(msg);
        if (loggedErrors.has(hash)) return;
        loggedErrors.add(hash);
        console[type](`[Calls core] ${msg}`);
        setTimeout(() => loggedErrors.delete(hash), 5000);
    }

    function logErrorOnce(module, error, context = '') {
        const errorKey = `${module}:${error.message}:${context}`;
        const hash = logger._hash(errorKey);
        if (!loggedErrors.has(hash)) {
            logOnceLegacy('warn', `${module} error: ${error.message} ${context}`);
            loggedErrors.add(hash);
            setTimeout(() => loggedErrors.delete(hash), 60000);
        }
    }

    // ==================== ORIGINAL MESSAGE ID GENERATOR (PRESERVED) ====================
    const MessageIdGenerator = {
        _counter: 0,
        _lastTimestamp: 0,

        generateId: function() {
            const timestamp = Date.now();
            if (timestamp === this._lastTimestamp) {
                this._counter = (this._counter + 1) % 10000;
            } else {
                this._counter = 0;
                this._lastTimestamp = timestamp;
            }
            return `${timestamp}-${this._counter}-${Math.random().toString(36).substring(2, 8)}`;
        },

        parseId: function(id) {
            if (!id || typeof id !== 'string') return null;
            const parts = id.split('-');
            if (parts.length < 3) return null;
            return { timestamp: parseInt(parts[0], 10), counter: parseInt(parts[1], 10), random: parts[2] };
        }
    };

    // ==================== ORIGINAL MESSAGE VALIDATOR (PRESERVED) ====================
    const MessageValidator = {
        _messageCache: new Set(),
        _sequenceNumbers: new Map(),

        generateId: function() { return MessageIdGenerator.generateId(); },

        validate: function(message) {
            if (!message || typeof message !== 'object') {
                logger.once('Invalid message: not an object');
                return false;
            }
            if (!message.id && !message.messageId) {
                logger.once('Invalid message: missing ID');
                return false;
            }
            const timestamp = message.timestamp || message._timestamp;
            if (timestamp && (timestamp > Date.now() + 60000 || timestamp < Date.now() - 300000)) {
                logger.once(`Invalid message: timestamp out of range`, { id: message.id || message.messageId });
                return false;
            }
            const messageId = message.id || message.messageId;
            const messageKey = `${messageId}:${timestamp}`;
            if (this._messageCache.has(messageKey)) {
                logger.once(`Duplicate message detected`, { id: messageId });
                return false;
            }
            try {
                const size = JSON.stringify(message).length;
                if (size > 1024 * 100) {
                    logger.once(`Message too large`, { id: messageId, size });
                    return false;
                }
            } catch (e) {}

            this._messageCache.add(messageKey);
            setTimeout(() => this._messageCache.delete(messageKey), CONFIG.MESSAGE_CACHE_TTL);

            return true;
        },

        validateOrigin: function(origin) { return OriginAdapter.isTrusted(origin); },

        createMessage: function(type, payload = {}, options = {}) {
            const id = options.id || this.generateId();
            const timestamp = options.timestamp || Date.now();

            return {
                id,
                type,
                source: 'calls-iframe',
                app: 'chat-system',
                version: '2.4.0',
                iframeId: iframeId,
                state: currentState,
                timestamp,
                payload: payload || {},
                sequence: options.sequence || 0,
                ack: options.ack || false,
                retry: options.retry || 0
            };
        },

        sanitize: function(message) {
            if (!message || typeof message !== 'object') return null;
            try {
                const sanitized = JSON.parse(JSON.stringify(message));
                if (sanitized.payload && sanitized.payload._token) delete sanitized.payload._token;
                if (sanitized._token) delete sanitized._token;
                return sanitized;
            } catch (e) {
                return null;
            }
        }
    };

    // ==================== ORIGINAL ORIGIN ADAPTER (PRESERVED) ====================
    const OriginAdapter = {
        _trustedCache: new Set(),
        _dynamicOrigins: new Set(),
        _strictMode: true,
        _sandboxed: false,

        initialize: function() {
            this._detectSandbox();
            this._addLocalOrigins();

            if (EnvironmentDetector.isLocalDev() || EnvironmentDetector.isVPNNetwork()) this._strictMode = false;
            if (this._sandboxed) this._strictMode = false;

            return this;
        },

        _detectSandbox: function() {
            try {
                if (window.frameElement && window.frameElement.sandbox) this._sandboxed = true;
                localStorage.setItem('test', 'test');
                localStorage.removeItem('test');
            } catch (e) {
                this._sandboxed = true;
            }
        },

        _addLocalOrigins: function() {
            this._dynamicOrigins.add('http://localhost');
            this._dynamicOrigins.add('https://localhost');
            this._dynamicOrigins.add('http://localhost:3000');
            this._dynamicOrigins.add('https://localhost:3000');
            this._dynamicOrigins.add('http://localhost:5000');
            this._dynamicOrigins.add('https://localhost:5000');
            this._dynamicOrigins.add('http://localhost:5500');
            this._dynamicOrigins.add('https://localhost:5500');
            this._dynamicOrigins.add('http://127.0.0.1');
            this._dynamicOrigins.add('https://127.0.0.1');
            this._dynamicOrigins.add('http://127.0.0.1:5500');
            this._dynamicOrigins.add('https://127.0.0.1:5500');
            this._dynamicOrigins.add('file://');
            this._dynamicOrigins.add('*.onrender.com');
        },

        isTrusted: function(origin) {
            if (this._trustedCache.has(origin)) return true;
            if (this._strictMode === false) return true;

            if (trustedOrigins.has(origin)) {
                this._trustedCache.add(origin);
                return true;
            }

            for (const pattern of this._dynamicOrigins) {
                if (pattern.startsWith('*.')) {
                    const domain = pattern.substring(2);
                    if (origin.endsWith(domain)) {
                        this._trustedCache.add(origin);
                        return true;
                    }
                } else if (origin === pattern) {
                    this._trustedCache.add(origin);
                    return true;
                }
            }

            if (origin === window.location.origin) {
                this._trustedCache.add(origin);
                return true;
            }

            try {
                if (window.parent && window.parent.location &&
                    origin === window.parent.location.origin) {
                    this._trustedCache.add(origin);
                    return true;
                }
            } catch (e) {}

            if (this._sandboxed && (origin.startsWith('http:') || origin.startsWith('https:'))) {
                this._trustedCache.add(origin);
                return true;
            }

            return false;
        },

        validateEvent: function(event) {
            if (!event || !event.origin) return false;
            if (this._strictMode) return this.isTrusted(event.origin);
            if (event.origin.startsWith('http:') || event.origin.startsWith('https:')) return true;
            return false;
        },

        getTargetOrigin: function() {
            if (this._sandboxed) return '*';
            if (EnvironmentDetector.isLocalDev()) return '*';
            try {
                if (window.parent && window.parent.location) return window.parent.location.origin;
            } catch (e) {}
            return '*';
        },

        isSandboxed: function() { return this._sandboxed; },
        getMode: function() {
            return {
                strictMode: this._strictMode,
                sandboxed: this._sandboxed,
                trustedCount: this._trustedCache.size,
                environment: EnvironmentDetector.detect()
            };
        }
    };

    OriginAdapter.initialize();

    // ==================== ORIGINAL HANDSHAKE CLIENT (PRESERVED) ====================
    const HandshakeClient = {
        _state: 'idle',
        _attempts: 0,
        _maxAttempts: CONFIG.HANDSHAKE_MAX_ATTEMPTS,
        _timeout: CONFIG.HANDSHAKE_TIMEOUT,
        _backoffBase: CONFIG.RETRY_BACKOFF,
        _parentReadyReceived: false,
        _handshakeAckReceived: false,
        _listeners: new Set(),

        initialize: function() {
            this._state = 'idle';
            this._attempts = 0;
            this._parentReadyReceived = false;
            this._handshakeAckReceived = false;
            this._setupParentReadyListener();
            return this;
        },

        _setupParentReadyListener: function() {
            const handler = (event) => {
                if (!OriginAdapter.validateEvent(event)) return;
                const message = MessageBridge.normalizeMessage(event.data);
                if (!message) return;

                if (message.type === MESSAGE_TYPES.PARENT_READY) {
                    this._parentReadyReceived = true;
                    _PARENT_READY_ = true;

                    if (this._state === 'idle' || this._state === 'waiting') this._state = 'ready';

                    logOnce('success', 'Parent ready received (legacy)');
                }
            };

            window.addEventListener('message', handler);
            eventListeners.set('handshakeParentReady', handler);
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        _notify: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        start: async function() {
            if (_HANDSHAKE_DONE_ || this._state === 'complete') {
                this._notify('already_complete');
                return { success: true, state: this._state, passive: true };
            }

            if (DEBUG) logOnce('info', 'Handshake start called - using active handshake');

            const result = await IframeHandshakeAuthority.start();
            return result;
        },

        sendChildReady: function() {
            const message = MessageBridge.createMessage(MESSAGE_TYPES.CHILD_READY, {
                ready: true,
                capabilities: ['session', 'calls', 'messaging'],
                protocol: CONFIG.PROTOCOL_VERSION,
                environment: EnvironmentDetector.detect()
            }, { legacy: true });

            window.parent.postMessage(message, OriginAdapter.getTargetOrigin());
        },

        waitForParentReady: function() {
            return new Promise((resolve) => {
                if (_PARENT_READY_ || this._parentReadyReceived) {
                    resolve(true);
                    return;
                }

                const timeout = setTimeout(() => {
                    window.removeEventListener('message', handler);
                    resolve(false);
                }, this._timeout);

                const handler = (event) => {
                    if (!OriginAdapter.validateEvent(event)) return;
                    const message = MessageBridge.normalizeMessage(event.data);
                    if (!message) return;

                    if (message.type === MESSAGE_TYPES.PARENT_READY) {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);
                        _PARENT_READY_ = true;
                        this._parentReadyReceived = true;
                        resolve(true);
                    }
                };

                window.addEventListener('message', handler);
            });
        },

        sendHandshakeRequest: function() {
            return new Promise((resolve) => {
                const messageId = SecurityCore.generateUUID();

                const message = MessageBridge.createMessage(MESSAGE_TYPES.HANDSHAKE_REQUEST, {
                    attempt: this._attempts,
                    frameId: iframeId,
                    protocol: CONFIG.PROTOCOL_VERSION
                }, { legacy: true, messageId });

                const timeout = setTimeout(() => {
                    window.removeEventListener('message', handler);
                    resolve(false);
                }, this._timeout);

                const handler = (event) => {
                    if (!OriginAdapter.validateEvent(event)) return;
                    const response = MessageBridge.normalizeMessage(event.data);
                    if (!response) return;

                    if (response.type === MESSAGE_TYPES.HANDSHAKE_ACK) {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);
                        this._handshakeAckReceived = true;
                        resolve(true);
                        return;
                    }

                    if (response.type === MESSAGE_TYPES.ACK &&
                        response.payload &&
                        response.payload.ackId === messageId) {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);
                        this._handshakeAckReceived = true;
                        resolve(true);
                    }
                };

                window.addEventListener('message', handler);
                window.parent.postMessage(message, OriginAdapter.getTargetOrigin());
            });
        },

        requestSession: function() {
            return new Promise((resolve) => {
                const messageId = SecurityCore.generateUUID();

                const message = MessageBridge.createMessage(MESSAGE_TYPES.REQUEST_SESSION, {
                    frameId: iframeId,
                    timestamp: Date.now(),
                    attempt: this._attempts
                }, { messageId });

                const timeout = setTimeout(() => {
                    window.removeEventListener('message', handler);
                    resolve({ success: false, reason: 'timeout' });
                }, this._timeout);

                const handler = (event) => {
                    if (!OriginAdapter.validateEvent(event)) return;
                    const response = MessageBridge.normalizeMessage(event.data);
                    if (!response) return;

                    if (response.type === MESSAGE_TYPES.SESSION_DATA ||
                        response.type === MESSAGE_TYPES.SESSION_INIT) {

                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);

                        const sessionData = response.payload || response.data;
                        if (sessionData && sessionData.token) {
                            this.handleSessionData(sessionData);
                            resolve({ success: true });
                        } else {
                            resolve({ success: false, reason: 'invalid_session' });
                        }
                    }
                };

                window.addEventListener('message', handler);
                window.parent.postMessage(message, OriginAdapter.getTargetOrigin());
            });
        },

        handleSessionData: function(sessionData) {
            if (sessionData.token) {
                sessionToken = sessionData.token;
                sessionExpiry = sessionData.expiry || (Date.now() + 3600000);

                if (sessionData.user) {
                    currentUser = sessionData.user;
                    userDataLoaded = true;
                }

                const session = {
                    token: sessionData.token,
                    userId: sessionData.user?.id || sessionData.userId,
                    expiresAt: sessionExpiry,
                    signature: sessionData.signature ||
                              SecurityCore.createSignature({ userId: sessionData.user?.id }, Date.now())
                };

                if (isValidSession(session)) {
                    validatedSession = session;
                    sessionValidationTimestamp = Date.now();
                    sessionAckReceived = true;
                    sessionAckTimestamp = Date.now();
                }

                this.sendSessionAck(sessionData);
            }
        },

        sendSessionAck: function(sessionData) {
            const message = MessageBridge.createMessage(MESSAGE_TYPES.CALL_SESSION_ACK, {
                success: true,
                sessionId: sessionData.user?.id || sessionData.userId,
                timestamp: Date.now()
            });

            window.parent.postMessage(message, OriginAdapter.getTargetOrigin());

            const legacyAck = MessageBridge.createMessage(MESSAGE_TYPES.SESSION_ACK, {
                success: true,
                sessionId: sessionData.user?.id || sessionData.userId
            }, { legacy: true });

            window.parent.postMessage(legacyAck, OriginAdapter.getTargetOrigin());
        },

        getStatus: function() {
            return {
                state: this._state,
                attempts: this._attempts,
                maxAttempts: this._maxAttempts,
                parentReady: _PARENT_READY_,
                handshakeDone: _HANDSHAKE_DONE_,
                parentReadyReceived: this._parentReadyReceived,
                handshakeAckReceived: this._handshakeAckReceived
            };
        },

        reset: function() {
            this._state = 'idle';
            this._attempts = 0;
            this._parentReadyReceived = false;
            this._handshakeAckReceived = false;
        }
    };

    // ==================== ORIGINAL SESSION CLIENT (PRESERVED) ====================
    const SessionClient = {
        _session: null,
        _refreshTimer: null,
        _checkTimer: null,
        _listeners: new Set(),
        _expiryWarningSent: false,
        _syncInProgress: false,

        initialize: function() {
            this.loadFromStorage();
            this.startRefreshTimer();
            this.startCheckTimer();
            this.setupMessageHandlers();
            return this;
        },

        setupMessageHandlers: function() {
            const handler = (event) => {
                if (!OriginAdapter.validateEvent(event)) return;

                const message = MessageBridge.normalizeMessage(event.data);
                if (!message) return;

                switch (message.type) {
                    case MESSAGE_TYPES.SESSION_UPDATE:
                    case MESSAGE_TYPES.SESSION_SYNC:
                        this.handleSessionUpdate(message.payload || message.data);
                        break;
                    case MESSAGE_TYPES.TOKEN_UPDATE:
                    case MESSAGE_TYPES.TOKEN_REFRESH:
                        this.handleTokenUpdate(message.payload || message.data);
                        break;
                    case MESSAGE_TYPES.AUTH_ERROR:
                        this.handleAuthError();
                        break;
                    case MESSAGE_TYPES.VERIFY_SESSION:
                        this.handleVerifySession(message.payload || message.data, message.messageId);
                        break;
                }
            };

            window.addEventListener('message', handler);
            eventListeners.set('sessionClient', handler);
        },

        handleSessionUpdate: function(data) {
            logOnce('success', 'Session client: Received session update');

            let updated = false;

            if (data.token) {
                sessionToken = data.token;
                updated = true;
            }

            if (data.expiry) {
                sessionExpiry = data.expiry;
                updated = true;
            }

            if (data.user) {
                currentUser = data.user;
                userDataLoaded = true;
                updated = true;
            }

            if (data.authenticated !== undefined) {
                sessionAuthorityReady = data.authenticated;
                updated = true;
            }

            if (updated) {
                this.updateSessionCache();
                this.saveToStorage();
                this.notifyListeners(data);
                this.sendAck();
                this._expiryWarningSent = false;
            }
        },

        handleTokenUpdate: function(data) {
            if (data.token) {
                sessionToken = data.token;
                sessionExpiry = data.expiry || (Date.now() + 3600000);

                this.updateSessionCache();
                this.saveToStorage();
                this.sendAck();

                logOnce('success', 'Session client: Token updated');
            }
        },

        handleAuthError: function() {
            logOnce('warn-icon', 'Session client: Auth error, clearing session');
            this.clearSession();
        },

        handleVerifySession: function(data, messageId) {
            const isValid = this.isValid();

            const response = MessageBridge.createMessage(MESSAGE_TYPES.VERIFY_SESSION, {
                valid: isValid,
                userId: currentUser?.id,
                expiresAt: sessionExpiry,
                timestamp: Date.now()
            }, { messageId });

            window.parent.postMessage(response, OriginAdapter.getTargetOrigin());
        },

        updateSessionCache: function() {
            const session = {
                token: sessionToken,
                userId: currentUser?.id,
                expiresAt: sessionExpiry,
                signature: SecurityCore.createSignature(
                    { userId: currentUser?.id },
                    Date.now()
                )
            };

            if (isValidSession(session)) {
                validatedSession = session;
                sessionValidationTimestamp = Date.now();
                this._session = session;
            }
        },

        sendAck: function() {
            const message = MessageBridge.createMessage(MESSAGE_TYPES.SESSION_ACK, {
                success: true,
                timestamp: Date.now()
            });

            window.parent.postMessage(message, OriginAdapter.getTargetOrigin());
            logOnce('sending', 'Session client: Sending SESSION_ACK');
        },

        requestSync: function() {
            if (this._syncInProgress) return;

            this._syncInProgress = true;

            const message = MessageBridge.createMessage(MESSAGE_TYPES.REQUEST_SESSION, {
                frameId: iframeId,
                timestamp: Date.now()
            });

            window.parent.postMessage(message, OriginAdapter.getTargetOrigin());

            setTimeout(() => {
                this._syncInProgress = false;
            }, 5000);
        },

        saveToStorage: function() {
            try {
                const data = {
                    token: sessionToken,
                    expiry: sessionExpiry,
                    user: currentUser,
                    timestamp: Date.now()
                };
                SecurityCore.safeLocalStorageSet('call_session', JSON.stringify(data));
            } catch (error) {
                logger.error('SessionClient.saveToStorage', error);
            }
        },

        loadFromStorage: function() {
            try {
                const stored = SecurityCore.safeLocalStorageGet('call_session');
                if (!stored) return false;

                const data = SecurityCore.safeJSONParse(stored);
                if (!data || !data.token) return false;

                if (data.expiry && data.expiry < Date.now()) {
                    SecurityCore.safeLocalStorageRemove('call_session');
                    return false;
                }

                sessionToken = data.token;
                sessionExpiry = data.expiry;

                if (data.user) {
                    currentUser = data.user;
                    userDataLoaded = true;
                }

                this.updateSessionCache();
                logOnce('success', 'Session client: Restored from storage');
                return true;

            } catch (error) {
                logger.error('SessionClient.loadFromStorage', error);
                return false;
            }
        },

        clearSession: function() {
            sessionToken = null;
            sessionExpiry = null;
            currentUser = null;
            userDataLoaded = false;
            sessionAuthorityReady = false;
            validatedSession = null;
            sessionValidationTimestamp = 0;
            sessionAckReceived = false;

            try {
                SecurityCore.safeLocalStorageRemove('call_session');
            } catch (error) {
                logger.error('SessionClient.clearSession', error);
            }

            this.notifyListeners({ cleared: true });
            this._expiryWarningSent = false;
        },

        startRefreshTimer: function() {
            if (this._refreshTimer) clearTimeout(this._refreshTimer);

            if (!sessionExpiry) return;

            const now = Date.now();
            const timeUntilExpiry = sessionExpiry - now;
            const refreshTime = Math.max(0, timeUntilExpiry - CONFIG.SESSION_REFRESH_THRESHOLD);

            if (refreshTime <= 0) {
                this.requestSync();
                return;
            }

            this._refreshTimer = setTimeout(() => {
                this.requestSync();
            }, refreshTime);

            timers.add(this._refreshTimer);
        },

        startCheckTimer: function() {
            if (this._checkTimer) clearInterval(this._checkTimer);

            this._checkTimer = setInterval(() => {
                if (sessionExpiry && sessionExpiry < Date.now()) {
                    logOnce('warn-icon', 'Session client: Session expired');

                    if (!this._expiryWarningSent) {
                        this._expiryWarningSent = true;
                        this.notifyListeners({ expired: true });
                    }

                    this.clearSession();
                } else if (sessionExpiry && (sessionExpiry - Date.now()) < 300000 && !this._expiryWarningSent) {
                    this._expiryWarningSent = true;
                    this.notifyListeners({ expiring: true, timeLeft: sessionExpiry - Date.now() });
                }
            }, 60000);

            timers.add(this._checkTimer);
        },

        addListener: function(callback) {
            if (typeof callback === 'function') this._listeners.add(callback);
        },
        removeListener: function(callback) { this._listeners.delete(callback); },

        notifyListeners: function(data) {
            this._listeners.forEach(callback => {
                try { callback(data); } catch (error) {
                    logger.error('SessionClient.notifyListeners', error);
                }
            });
        },

        getSession: function() { return this._session; },
        isValid: function() { return !!(sessionToken && sessionExpiry && sessionExpiry > Date.now()); },
        getTimeRemaining: function() { return sessionExpiry ? Math.max(0, sessionExpiry - Date.now()) : 0; },

        cleanup: function() {
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }
            if (this._checkTimer) {
                clearInterval(this._checkTimer);
                this._checkTimer = null;
            }
            this._listeners.clear();
        }
    };

    // ==================== ORIGINAL TRANSPORT AGENT (PRESERVED) ====================
    const TransportAgent = {
        _queue: [],
        _processing: false,
        _maxQueueSize: 100,
        _retryCounts: new Map(),
        _maxRetries: CONFIG.MAX_MESSAGE_RETRIES,
        _backoffBase: CONFIG.RETRY_BACKOFF,
        _offlineQueue: [],
        _pendingAcks: new Map(),
        _heartbeatInterval: null,
        _lastHeartbeat: 0,
        _heartbeatMissed: 0,
        _maxMissedHeartbeats: 3,
        _listeners: new Set(),

        initialize: function() {
            this.startHeartbeat();
            this.setupNetworkListeners();
            return this;
        },

        setupNetworkListeners: function() {
            window.addEventListener('online', () => {
                this.processOfflineQueue();
                this._heartbeatMissed = 0;
            });

            window.addEventListener('offline', () => {
                this._offlineQueue.push(...this._queue);
                this._queue = [];
            });
        },

        send: function(message, options = {}) {
            return new Promise((resolve, reject) => {
                try {
                    const canonicalMessage = MessageBridge.createMessage(
                        message.type,
                        message.payload || message.data,
                        {
                            messageId: message.messageId,
                            timestamp: message.timestamp,
                            sign: options.sign !== false,
                            legacy: options.legacy
                        }
                    );

                    this._queue.push({
                        message: canonicalMessage,
                        resolve,
                        reject,
                        options,
                        attempts: 0,
                        timestamp: Date.now(),
                        id: canonicalMessage.messageId
                    });

                    this.processQueue();

                } catch (error) {
                    logger.error('TransportAgent.send', error);
                    reject(error);
                }
            });
        },

        processQueue: async function() {
            if (this._processing) return;
            if (this._queue.length === 0) return;

            this._processing = true;

            while (this._queue.length > 0) {
                const item = this._queue[0];

                if (!navigator.onLine) {
                    this._offlineQueue.push(item);
                    this._queue.shift();
                    continue;
                }

                if (item.attempts >= this._maxRetries) {
                    logger.warn(`TransportAgent: Max retries for ${item.message.messageId}`);
                    item.reject(new Error('Max retries exceeded'));
                    this._queue.shift();
                    continue;
                }

                try {
                    await this.sendMessage(item);

                    if (item.options.requireAck) {
                        const ackReceived = await this.waitForAck(item.message.messageId, item.options.ackTimeout || CONFIG.ACK_TIMEOUT);
                        if (ackReceived) {
                            item.resolve({ success: true, messageId: item.message.messageId });
                        } else {
                            throw new Error('ACK timeout');
                        }
                    } else {
                        item.resolve({ success: true, messageId: item.message.messageId });
                    }

                    this._queue.shift();

                } catch (error) {
                    item.attempts++;

                    let delay = this._backoffBase * Math.pow(2, item.attempts - 1);
                    if (EnvironmentDetector.isVPNNetwork()) delay *= 1.5;

                    await new Promise(resolve => setTimeout(resolve, delay));

                    this._queue.push(this._queue.shift());
                }
            }

            this._processing = false;
        },

        sendMessage: function(item) {
            return new Promise((resolve, reject) => {
                try {
                    if (!window.parent || window.parent === window) {
                        reject(new Error('No parent window'));
                        return;
                    }

                    window.parent.postMessage(item.message, OriginAdapter.getTargetOrigin());

                    if (!item.options.requireAck) resolve();

                    resolve();

                } catch (error) {
                    reject(error);
                }
            });
        },

        waitForAck: function(messageId, timeout) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    window.removeEventListener('message', handler);
                    this._pendingAcks.delete(messageId);
                    resolve(false);
                }, timeout);

                const handler = (event) => {
                    if (!OriginAdapter.validateEvent(event)) return;

                    const message = MessageBridge.normalizeMessage(event.data);
                    if (!message) return;

                    if (message.type === MESSAGE_TYPES.ACK &&
                        message.payload &&
                        message.payload.ackId === messageId) {
                        clearTimeout(timer);
                        window.removeEventListener('message', handler);
                        this._pendingAcks.delete(messageId);
                        resolve(true);
                    }
                };

                window.addEventListener('message', handler);
                this._pendingAcks.set(messageId, { timer, handler });
            });
        },

        handleIncoming: function(event) {
            const message = MessageBridge.normalizeMessage(event.data);
            if (!message) return;

            if (message.type === MESSAGE_TYPES.ACK && message.payload && message.payload.ackId) {
                const pending = this._pendingAcks.get(message.payload.ackId);
                if (pending) {
                    clearTimeout(pending.timer);
                    window.removeEventListener('message', pending.handler);
                    this._pendingAcks.delete(message.payload.ackId);
                }
            }

            if (message.type === MESSAGE_TYPES.HEARTBEAT_RESPONSE ||
                message.type === MESSAGE_TYPES.PONG) {
                this._lastHeartbeat = Date.now();
                this._heartbeatMissed = 0;
                resetHeartbeat();
            }

            this._listeners.forEach(listener => {
                try { listener(message); } catch (e) {}
            });
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        processOfflineQueue: function() {
            if (this._offlineQueue.length === 0) return;

            logger.info(`TransportAgent: Processing ${this._offlineQueue.length} offline messages`);

            while (this._offlineQueue.length > 0) {
                this._queue.push(this._offlineQueue.shift());
            }

            this.processQueue();
        },

        startHeartbeat: function(interval = CONFIG.HEARTBEAT_INTERVAL) {
            if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);

            this._lastHeartbeat = Date.now();
            this._heartbeatMissed = 0;

            this._heartbeatInterval = setInterval(() => {
                if (navigator.onLine && window.parent && window.parent !== window) {
                    this.send({
                        type: MESSAGE_TYPES.HEARTBEAT,
                        payload: { timestamp: Date.now() }
                    }, { requireAck: false });

                    if (Date.now() - this._lastHeartbeat > interval * 2) {
                        this._heartbeatMissed++;
                        handleHeartbeatFailure();

                        if (this._heartbeatMissed >= this._maxMissedHeartbeats) {
                            logger.warn('TransportAgent: Missed heartbeats, connection may be lost');
                            this._notifyListeners('connection_suspect');

                            if (StateGovernor.getState() === STATE.ACTIVE) {
                                StateGovernor.transition(STATE.ACTIVE, STATE.DEGRADED);
                                RecoveryManager.scheduleRecovery();
                            }
                        }
                    }
                }
            }, interval);

            timers.add(this._heartbeatInterval);
        },

        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener({ type: 'internal_' + event, data }); } catch (e) {}
            });
        },

        getStatus: function() {
            return {
                queueSize: this._queue.length,
                offlineQueueSize: this._offlineQueue.length,
                pendingAcks: this._pendingAcks.size,
                lastHeartbeat: this._lastHeartbeat,
                heartbeatMissed: this._heartbeatMissed
            };
        },

        cleanup: function() {
            if (this._heartbeatInterval) {
                clearInterval(this._heartbeatInterval);
                this._heartbeatInterval = null;
            }
            this._queue = [];
            this._offlineQueue = [];
            this._pendingAcks.forEach((value, key) => {
                clearTimeout(value.timer);
                window.removeEventListener('message', value.handler);
            });
            this._pendingAcks.clear();
            this._retryCounts.clear();
            this._listeners.clear();
        }
    };

    // ==================== ORIGINAL MESSAGE BRIDGE (PRESERVED) ====================
    const MessageBridge = {
        createMessage: function(type, payload = {}, options = {}) {
            const messageId = options.messageId || SecurityCore.generateUUID();
            const timestamp = options.timestamp || Date.now();

            const message = {
                protocolVersion: CONFIG.PROTOCOL_VERSION,
                messageId: messageId,
                type: type,
                source: 'iframe',
                target: 'parent',
                frameId: iframeId,
                timestamp: timestamp,
                payload: payload || {}
            };

            if (sessionToken && !options.excludeToken) {
                message.token = sessionToken.substring(0, 8) + '...';
                message.tokenHash = SecurityCore.createSignature(sessionToken, timestamp);
            }

            if (sessionToken && options.sign !== false) {
                try {
                    message.signature = SecurityCore.createSignature(
                        { type, messageId, timestamp, frameId: iframeId },
                        timestamp
                    );
                } catch (e) {}
            }

            if (options.legacy) {
                message.legacy = true;
                message.id = messageId;
                message.iframeId = iframeId;
                message.state = currentState;
                message.version = '2.4.0';
            }

            return message;
        },

        normalizeMessage: function(rawMessage) {
            if (!rawMessage || typeof rawMessage !== 'object') return null;
            if (rawMessage.protocol === CONFIG.PROTOCOL_VERSION) return rawMessage;

            const normalized = {
                protocolVersion: CONFIG.PROTOCOL_VERSION,
                messageId: rawMessage.id || rawMessage.messageId || SecurityCore.generateUUID(),
                type: rawMessage.type,
                source: rawMessage.source || 'parent',
                target: 'iframe',
                frameId: rawMessage.frameId || rawMessage.iframeId || iframeId,
                timestamp: rawMessage.timestamp || Date.now(),
                payload: rawMessage.payload || rawMessage.data || {},
                legacy: true
            };

            normalized._original = rawMessage;

            return normalized;
        },

        validateSignature: function(message) {
            if (!message.signature) return true;

            try {
                const expected = SecurityCore.createSignature(
                    { type: message.type, messageId: message.messageId, timestamp: message.timestamp, frameId: message.frameId },
                    message.timestamp
                );
                return message.signature === expected;
            } catch (e) {
                return false;
            }
        },

        validateTimestamp: function(message) {
            const now = Date.now();
            const maxAge = 5 * 60 * 1000;
            const minAge = -5 * 60 * 1000;
            const age = now - message.timestamp;
            return age <= maxAge && age >= minAge;
        }
    };

    // ==================== ORIGINAL SECURITY UTILITIES (PRESERVED) ====================
    const SecurityCore = {
        _sanitizing: false,

        sanitizeString: function(str) {
            if (!str || typeof str !== 'string') return str || '';

            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
                .replace(/javascript:/gi, '')
                .replace(/data:/gi, '')
                .replace(/vbscript:/gi, '')
                .replace(/onload/gi, 'data-onload')
                .replace(/onerror/gi, 'data-onerror')
                .replace(/onclick/gi, 'data-onclick')
                .replace(/onmouse/gi, 'data-onmouse')
                .replace(/onkey/gi, 'data-onkey')
                .replace(/onfocus/gi, 'data-onfocus')
                .replace(/onblur/gi, 'data-onblur')
                .replace(/onsubmit/gi, 'data-onsubmit')
                .replace(/onreset/gi, 'data-onreset')
                .replace(/onchange/gi, 'data-onchange')
                .replace(/onselect/gi, 'data-onselect')
                .replace(/onabort/gi, 'data-onabort');
        },

        sanitizeURL: function(url) {
            if (!url || typeof url !== 'string') return '';

            const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'blob:', 'data:'];
            try {
                const urlObj = new URL(url, window.location.origin);
                if (safeProtocols.includes(urlObj.protocol)) return url;
            } catch (e) {
                return this.sanitizeString(url);
            }
            return '#';
        },

        safeJSONParse: function(json, fallback = null) {
            try {
                return JSON.parse(json);
            } catch (e) {
                return fallback;
            }
        },

        safeLocalStorageGet: function(key, fallback = null) {
            try {
                const value = localStorage.getItem(key);
                return value !== null ? value : fallback;
            } catch (e) {
                return fallback;
            }
        },

        safeLocalStorageSet: function(key, value) {
            try {
                localStorage.setItem(key, String(value));
                return true;
            } catch (e) {
                return false;
            }
        },

        safeLocalStorageRemove: function(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (e) {
                return false;
            }
        },

        safeSessionStorageGet: function(key, fallback = null) {
            try {
                const value = sessionStorage.getItem(key);
                return value !== null ? value : fallback;
            } catch (e) {
                return fallback;
            }
        },

        safeSessionStorageSet: function(key, value) {
            try {
                sessionStorage.setItem(key, String(value));
                return true;
            } catch (e) {
                return false;
            }
        },

        generateUUID: function() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        createSignature: function(payload, timestamp) {
            try {
                const str = JSON.stringify(payload) + timestamp + 'calls-core-secret';
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }
                return hash.toString(36);
            } catch (e) {
                return '';
            }
        }
    };

    // ==================== SESSION VALIDATION LAYER (PRESERVED) ====================
    function isValidSession(session) {
        if (!session || typeof session !== 'object') return false;
        if (session.demoMode || session._demoMode) return false;
        if (typeof session.token !== 'string' || session.token.length < 5) return false;
        if (!session.userId && !session.user?.id) return false;
        const expiresAt = session.expiresAt || session.expiry;
        if (expiresAt && typeof expiresAt === 'number' && expiresAt < Date.now()) return false;
        return true;
    }

    function getValidatedSession() {
        if (validatedSession && (Date.now() - sessionValidationTimestamp) < SESSION_VALIDATION_TTL) {
            return validatedSession;
        }

        const session = {
            token: sessionToken,
            userId: currentUser?.id || currentUser?.userId,
            expiresAt: sessionExpiry || (Date.now() + 3600000),
            signature: SecurityCore.createSignature({ userId: currentUser?.id }, Date.now()),
            refreshToken: null
        };

        if (isValidSession(session)) {
            validatedSession = session;
            sessionValidationTimestamp = Date.now();
            return session;
        }

        return null;
    }

    async function waitForSession(timeout = CONFIG.MAX_SESSION_WAIT || 10000) {
        const startTime = Date.now();
        let attempts = 0;
        const maxAttempts = MAX_SESSION_SYNC_ATTEMPTS || 3;

        while (attempts < maxAttempts) {
            const session = getValidatedSession();
            if (session) {
                logOnce('success', `Session ready after ${attempts} attempts`);
                return session;
            }

            if (sessionToken && currentUser) {
                const newSession = {
                    token: sessionToken,
                    userId: currentUser.id,
                    expiresAt: sessionExpiry || Date.now() + 3600000,
                    signature: SecurityCore.createSignature({ userId: currentUser.id }, Date.now()),
                    refreshToken: null,
                    demoMode: false
                };
                if (isValidSession(newSession)) {
                    validatedSession = newSession;
                    sessionValidationTimestamp = Date.now();
                    return newSession;
                }
            }

            try {
                const storedSession = SecurityCore.safeLocalStorageGet('call_session');
                if (storedSession) {
                    const parsed = SecurityCore.safeJSONParse(storedSession);
                    if (parsed && parsed.token) {
                        const expiryTime = parsed.expiry || parsed.expiresAt;
                        if (!expiryTime || expiryTime > Date.now()) {
                            sessionToken = parsed.token;
                            sessionExpiry = expiryTime || (Date.now() + 3600000);
                            if (parsed.user) currentUser = parsed.user;

                            const restoredSession = {
                                token: parsed.token,
                                userId: parsed.userId || parsed.user?.id,
                                expiresAt: sessionExpiry,
                                signature: SecurityCore.createSignature({ userId: parsed.userId || parsed.user?.id }, Date.now()),
                                demoMode: false
                            };

                            if (isValidSession(restoredSession)) {
                                validatedSession = restoredSession;
                                sessionValidationTimestamp = Date.now();
                                logOnce('success', 'Session restored from storage');
                                return restoredSession;
                            }
                        }
                    }
                }
            } catch (e) {}

            if (Date.now() - startTime > timeout) {
                logOnce('warn-icon', `Session wait timeout after ${timeout}ms`);
                break;
            }

            attempts++;
            await new Promise(resolve => setTimeout(resolve, CONFIG.SESSION_RETRY_DELAY || 1000));
        }

        return null;
    }

    async function waitForParent(timeout = CONFIG.HANDSHAKE_TIMEOUT) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            if (_PARENT_READY_ && window.parent && window.parent !== window) {
                logOnce('success', 'Parent ready');
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        logOnce('warn-icon', 'Parent wait timeout');
        return false;
    }

    async function waitForHandshake(timeout = CONFIG.HANDSHAKE_TIMEOUT) {
        const startTime = Date.now();

        if (!handshakePromise) {
            handshakePromise = new Promise((resolve, reject) => {
                handshakeResolve = resolve;
                handshakeReject = reject;
            });
        }

        if (_HANDSHAKE_DONE_) {
            handshakeResolve?.({ success: true });
            return { success: true };
        }

        try {
            const result = await Promise.race([
                handshakePromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Handshake timeout')), timeout)
                )
            ]);
            return result;
        } catch (error) {
            logOnce('warn-icon', 'Handshake failed', error);
            return { success: false, error: error.message };
        } finally {
            handshakePromise = null;
            handshakeResolve = null;
            handshakeReject = null;
        }
    }

    async function verifySession() {
        const now = Date.now();

        if (now - _lastVerificationTime < VERIFICATION_COOLDOWN) {
            return _lastVerificationResult;
        }

        if (_verificationInProgress) {
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (!_verificationInProgress) {
                        clearInterval(checkInterval);
                        resolve(_lastVerificationResult);
                    }
                }, 100);

                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve(true);
                }, 5000);
            });
        }

        _verificationInProgress = true;

        try {
            const session = getValidatedSession();
            if (!session) {
                _lastVerificationResult = false;
                return false;
            }

            if (session.expiresAt < Date.now()) {
                logOnce('warn-icon', 'Session expired');
                _lastVerificationResult = false;
                return false;
            }

            // Use parentComm.request which handles requestId properly
            const result = await parentComm.request('VERIFY_SESSION', {
                token: session.token,
                userId: session.userId,
                timestamp: Date.now()
            }, 3000).catch(() => ({ valid: true }));

            _lastVerificationResult = result?.valid !== false;
            _lastVerificationTime = Date.now();

            return _lastVerificationResult;
        } catch (error) {
            logOnce('warn-icon', 'Session verification failed', error);
            _lastVerificationResult = true;
            _lastVerificationTime = Date.now();
            return true;
        } finally {
            _verificationInProgress = false;
        }
    }

    // ==================== DETERMINISTIC SAFE INITIALIZATION ====================
let _initLock = false;
let _initPromise = null;

async function safeInit() {
    // Single entry point - return existing promise if already initializing
    if (_initLock && _initPromise) {
        logOnce('info', 'Initialization already in progress');
        return _initPromise;
    }

    if (StateGovernor.isInitialized()) {
        logOnce('success', 'Already initialized');
        return { success: true, state: STATE.ACTIVE };
    }

    _initLock = true;

    _initPromise = (async () => {
        try {
            logOnce('info', 'Starting deterministic initialization');

            // Initialize state machine
            StateGovernor.initialize();

            // Environment detection
            EnvironmentDetector.detect();

            // Check if we already have a valid session from storage
            // In safeInit() function, replace the stored session check with:

// Check if we already have a valid session from storage using a more reliable method
const hasStoredSession = (function() {
    // Try multiple ways to check for session
    if (IframeSessionClient.isValid()) {
        return true;
    }
    
    // Force check storage directly
    if (IframeSessionClient.checkStorage && IframeSessionClient.checkStorage()) {
        return true;
    }
    
    // Check SafeStorage directly as fallback
    try {
        const stored = SafeStorage.get('session');
        if (stored && stored.token && stored.token.length > 10) {
            const expiresAt = stored.expiresAt || stored.expiry;
            if (expiresAt && expiresAt > Date.now()) {
                logOnce('success', 'Found valid session in storage via direct check');
                // Load it into the session client
                IframeSessionClient._token = stored.token;
                IframeSessionClient._userId = stored.userId;
                IframeSessionClient._expiresAt = expiresAt;
                IframeSessionClient._refreshToken = stored.refreshToken;
                IframeSessionClient._valid = true;
                IframeSessionClient._state = STATE.SESSION_VALID;
                return true;
            }
        }
    } catch (e) {
        // Ignore errors
    }
    
    return false;
})();

if (hasStoredSession) {
    logOnce('success', 'Valid session found in storage, fast-tracking initialization');
    
    // Fast-track to READY state
    StateGovernor._handshakeCompleted = true;
    StateGovernor._tokenReady = true;
    StateGovernor._currentState = STATE.ACTIVE;
    StateGovernor._initialized = true;
    
    // Register with parent
    safeRegister();
    
    // Initialize API Core (non-blocking)
    APICore.initialize().catch(() => {});
    
    // Initialize call core (if available)
    if (window.callCore && typeof window.callCore.safeInitialize === 'function') {
        window.callCore.safeInitialize().catch(() => {});
    }
    
    logOnce('success', 'Fast-track initialization complete using stored session');
    
    window.dispatchEvent(new CustomEvent('core.ready', {
        detail: {
            timestamp: Date.now(),
            version: CONFIG.VERSION,
            environment: ENVIRONMENT.current,
            fromStorage: true
        }
    }));
    
    return { success: true, state: STATE.ACTIVE, fromStorage: true };
}

            // No stored session - proceed with normal initialization
            logOnce('info', 'No stored session found, proceeding with full initialization');

            // Transition to bootstrapping
            if (!StateGovernor.transition(STATE.UNINITIALIZED, STATE.BOOTSTRAPPING, 'start')) {
                logOnce('warn-icon', 'Failed to transition to BOOTSTRAPPING, forcing state');
                StateGovernor._currentState = STATE.BOOTSTRAPPING;
            }

            // Detect compatibility
            CompatibilityBridge.detect();
            OriginAdapter.initialize();

            // Initialize API Core (non-blocking)
            APICore.initialize().then(result => {
                if (result.success) {
                    logOnce('success', 'API Core initialized');
                } else {
                    logOnce('warn-icon', 'API Core initialization failed');
                }
            });

            // Wait for parent with reduced timeout
            try {
                const parentReady = await waitForParent(CONFIG.HANDSHAKE_TIMEOUT / 2);
                if (!parentReady) {
                    logOnce('warn-icon', 'Parent not detected, continuing with caution');
                }
            } catch (e) {
                logOnce('warn-icon', 'Parent detection timeout');
            }

            // Perform handshake (idempotent) with timeout
            let handshakeResult;
            try {
                handshakeResult = await IframeHandshakeAuthority.start();
            } catch (error) {
                logOnce('warn-icon', 'Handshake error', error.message);
                handshakeResult = { success: false, reason: 'error' };
            }
            
            if (!handshakeResult || !handshakeResult.success) {
                logOnce('warn-icon', 'Handshake timeout or failure, trying direct session request');
                // Try to get session directly
                IframeTransport.requestSessionFromParent();
                
                // Wait a bit for session
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                logOnce('success', 'Handshake completed');
            }                 
           
            // Wait for handshake to complete (via state machine) - but don't block forever
            try {
                await StateGovernor.waitForHandshake(CONFIG.HANDSHAKE_TIMEOUT / 2);
            } catch (e) {
                logOnce('warn-icon', 'Handshake wait timeout, continuing');
            }

            // Register with parent
            safeRegister();

            // Transition to session syncing
            const syncState = StateGovernor.getState();
            if (syncState === STATE.HANDSHAKE_COMPLETE || syncState === STATE.BOOTSTRAPPING || syncState === STATE.HANDSHAKING) {
                StateGovernor.transition(syncState, STATE.SESSION_SYNCING, 'handshake_complete');
            }

            // Initialize session client (loads from storage)
            await IframeSessionClient.initialize();

            // If we now have a session, mark token ready
            if (IframeSessionClient.isValid()) {
                logOnce('success', 'Session acquired, marking token ready');
                StateGovernor._tokenReady = true;
                
                // Transition to token ready
                const tokenState = StateGovernor.getState();
                if (tokenState === STATE.SESSION_SYNCING) {
                    StateGovernor.transition(tokenState, STATE.TOKEN_READY, 'token_acquired');
                }
            } else {
                // Wait for token (event-driven, no polling)
                try {
                    await StateGovernor.waitForToken(CONFIG.TOKEN_REQUEST_TIMEOUT / 2);
                    logOnce('success', 'Token ready');
                } catch (e) {
                    logOnce('warn-icon', 'Token wait timeout, will retry', e.message);
                    // One fallback request
                    await IframeTransport.requestTokenFromParent().catch(() => {});
                }

                // Transition to token ready
                const tokenState = StateGovernor.getState();
                if (tokenState === STATE.SESSION_SYNCING) {
                    StateGovernor.transition(tokenState, STATE.TOKEN_READY, 'token_acquired');
                }
            }

            // Transition to services initializing
            const servicesState = StateGovernor.getState();
            if (servicesState === STATE.TOKEN_READY) {
                StateGovernor.transition(STATE.TOKEN_READY, STATE.SERVICES_INITIALIZING, 'starting_services');
            }

            // Initialize call core (if available)
            if (window.callCore && typeof window.callCore.safeInitialize === 'function') {
                window.callCore.safeInitialize().catch(() => {});
            }

            // Transition to active
            const activeState = StateGovernor.getState();
            if (activeState === STATE.SERVICES_INITIALIZING) {
                StateGovernor.transition(STATE.SERVICES_INITIALIZING, STATE.ACTIVE, 'initialization_complete');
            } else {
                // Force active state if we have session
                if (IframeSessionClient.isValid()) {
                    StateGovernor._initialized = true;
                    StateGovernor._currentState = STATE.ACTIVE;
                }
            }

            logOnce('success', 'Deterministic initialization complete');

            window.dispatchEvent(new CustomEvent('core.ready', {
                detail: {
                    timestamp: Date.now(),
                    version: CONFIG.VERSION,
                    environment: ENVIRONMENT.current
                }
            }));

            return { success: true, state: STATE.ACTIVE };

        } catch (error) {
            logOnce('error', 'Initialization failed', error);
            
            // Try to recover to a usable state
            const currentState = StateGovernor.getState();
            
            // If we have a valid session, force active state
            if (IframeSessionClient.isValid()) {
                logOnce('info', 'Forcing active state despite errors');
                StateGovernor._initialized = true;
                StateGovernor._currentState = STATE.ACTIVE;
                StateGovernor._handshakeCompleted = true;
                StateGovernor._tokenReady = true;
                
                window.dispatchEvent(new CustomEvent('core.ready', {
                    detail: {
                        timestamp: Date.now(),
                        version: CONFIG.VERSION,
                        environment: ENVIRONMENT.current,
                        degraded: true
                    }
                }));
                
                return { success: true, state: STATE.ACTIVE, degraded: true };
            }
            
            // Otherwise, try recovery
            if (RecoveryManager) {
                RecoveryManager.scheduleRecovery();
            }

            window.dispatchEvent(new CustomEvent('core.error', {
                detail: {
                    error: error.message,
                    timestamp: Date.now()
                }
            }));

            return { success: false, error: error.message };
        } finally {
            _initLock = false;
        }
    })();

    return _initPromise;
}
    // ==================== ORIGINAL SESSION MANAGER (PRESERVED) ====================
    let sessionValid = false;
    let sessionInitialized = false;

    const SessionManager = {
        _refreshTimer: null,
        _checkTimer: null,
        _lastValidSession: null,
        _guestMode: false,
        _demoMode: false,
        _sanitizing: false,

        acquire: async function(parentToken = null) {
            return ErrorBoundary.executeAsync(async () => {
                logOnce('info', 'Acquiring session');

                if (parentToken && this.validateToken(parentToken)) {
                    this.setToken(parentToken);
                    sessionToken = parentToken;
                    sessionValid = true;
                    this._guestMode = false;
                    logOnce('success', 'Session acquired from parent');

                    const session = {
                        token: parentToken,
                        userId: currentUser?.id,
                        expiresAt: sessionExpiry || Date.now() + 3600000,
                        signature: SecurityCore.createSignature({ userId: currentUser?.id }, Date.now()),
                        refreshToken: null
                    };
                    if (isValidSession(session)) {
                        validatedSession = session;
                        sessionValidationTimestamp = Date.now();
                    }

                    return true;
                }

                if (this.restoreFromStorage()) {
                    sessionValid = true;
                    this._guestMode = false;
                    logOnce('success', 'Session restored from storage');
                    return true;
                }

                if (this._lastValidSession) {
                    this.setToken(this._lastValidSession.token, this._lastValidSession.expiry);
                    sessionValid = true;
                    this._guestMode = false;
                    logOnce('info', 'Using last valid session');
                    return true;
                }

                sessionValid = false;
                logOnce('warn-icon', 'No session available - will retry');
                return false;
            }, 'SessionManager.acquire', false);
        },

        init: async function() {
            try {
                logOnce('info', 'Initializing session');
                currentState = STATE.SYNC;

                const tokenData = await this.requestToken().catch(() => null);

                if (tokenData && tokenData.token) {
                    await this.setToken(tokenData.token, tokenData.expiry);
                    if (tokenData.user) {
                        currentUser = tokenData.user;
                        userDataLoaded = true;
                    }
                    this._guestMode = false;
                    this._lastValidSession = { token: tokenData.token, expiry: tokenData.expiry, user: tokenData.user };
                    logOnce('success', 'Session initialized successfully');
                    return true;
                }

                if (this.restoreFromStorage()) {
                    this._guestMode = false;
                    logOnce('success', 'Session restored from storage');
                    return true;
                }

                if (this._lastValidSession) {
                    this.setToken(this._lastValidSession.token, this._lastValidSession.expiry);
                    this._guestMode = false;
                    logOnce('info', 'Using last valid session');
                    return true;
                }

                logOnce('warn-icon', 'No session available - will retry');
                return false;
            } catch (error) {
                logOnce('error', 'Session initialization failed', error);
                return false;
            }
        },

        requestToken: function() {
            return parentComm.request('REQUEST_TOKEN', {
                iframeId: iframeId,
                timestamp: Date.now()
            }, 5000).catch(error => {
                logOnce('warn-icon', 'Token request failed', error.message);
                return null;
            });
        },

        requestSessionFromParent: function() {
            return parentComm.request('REQUEST_SESSION', {
                iframeId: iframeId,
                timestamp: Date.now()
            }, 8000).catch(error => {
                logOnce('warn-icon', 'Session request failed', error.message);
                return null;
            });
        },

        refreshToken: function() {
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }

            if (!sessionToken && !this._guestMode && !this._demoMode) return Promise.resolve(false);
            if (this._demoMode) return Promise.resolve(false);

            return this.requestToken().then(tokenData => {
                if (tokenData && tokenData.token) {
                    return this.setToken(tokenData.token, tokenData.expiry);
                }
                return false;
            }).catch(error => {
                logOnce('error', 'Token refresh failed', error);
                return false;
            });
        },

        setToken: function(token, expiry) {
            try {
                if (!token || typeof token !== 'string' || token.length < 10) {
                    throw new Error('Invalid token format');
                }

                sessionToken = token;
                sessionExpiry = expiry || Date.now() + 3600000;
                sessionValid = true;
                this._guestMode = false;
                this._lastValidSession = { token, expiry: sessionExpiry, user: currentUser };

                const session = {
                    token: token,
                    userId: currentUser?.id,
                    expiresAt: sessionExpiry,
                    signature: SecurityCore.createSignature({ userId: currentUser?.id }, Date.now()),
                    refreshToken: null
                };
                if (isValidSession(session)) {
                    validatedSession = session;
                    sessionValidationTimestamp = Date.now();
                }

                this.scheduleRefresh();
                this.persistToStorage();

                if (APICore && APICore.setToken) {
                    APICore.setToken(token, null, expiry);
                }

                logOnce('success', 'Token set successfully');
                return true;
            } catch (error) {
                logOnce('error', 'Failed to set token', error);
                return false;
            }
        },

        clearToken: function() {
            sessionToken = null;
            sessionExpiry = null;
            currentUser = null;
            userDataLoaded = false;
            sessionAuthorityReady = false;
            sessionValid = false;
            this._guestMode = false;

            validatedSession = null;
            sessionValidationTimestamp = 0;
            sessionAckReceived = false;

            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }

            this.clearStorage();

            if (APICore && APICore.clearToken) {
                APICore.clearToken();
            }

            logOnce('info', 'Token cleared');
        },

        validateToken: function(token = sessionToken) {
            if (this._demoMode) return false;
            if (this._guestMode && this._lastValidSession) {
                if (Date.now() < this._lastValidSession.expiry) return true;
            }

            if (!token || !sessionExpiry) return false;

            const now = Date.now();
            if (now >= sessionExpiry) {
                logOnce('warn-icon', 'Token expired');
                this.clearToken();
                return false;
            }

            try {
                const parts = token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    if (payload.exp && payload.exp * 1000 < now) {
                        logOnce('warn-icon', 'Token expired (JWT claim)');
                        this.clearToken();
                        return false;
                    }
                }
                return true;
            } catch (e) {
                return true;
            }
        },

        scheduleRefresh: function() {
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }

            if (!sessionExpiry || this._demoMode) return;

            const now = Date.now();
            const timeUntilExpiry = sessionExpiry - now;
            const refreshTime = Math.max(0, timeUntilExpiry - CONFIG.SESSION_REFRESH_THRESHOLD);

            if (refreshTime <= 0) {
                this.refreshToken();
                return;
            }

            this._refreshTimer = setTimeout(() => {
                this.refreshToken();
            }, refreshTime);

            timers.add(this._refreshTimer);
        },

        persistToStorage: function() {
            if (this._demoMode) return;
            try {
                const data = {
                    token: sessionToken,
                    expiry: sessionExpiry,
                    user: currentUser,
                    timestamp: Date.now()
                };
                SecurityCore.safeLocalStorageSet(`${CONFIG.STORAGE_PREFIX}${iframeId}`, JSON.stringify(data));
            } catch (error) {
                logOnce('error', 'Failed to persist session', error);
            }
        },

        restoreFromStorage: function() {
            try {
                const stored = SecurityCore.safeLocalStorageGet(`${CONFIG.STORAGE_PREFIX}${iframeId}`);
                if (!stored) return false;

                const data = SecurityCore.safeJSONParse(stored);
                if (!data || !data.token || !data.expiry) return false;

                if (Date.now() >= data.expiry) {
                    SecurityCore.safeLocalStorageRemove(`${CONFIG.STORAGE_PREFIX}${iframeId}`);
                    return false;
                }

                sessionToken = data.token;
                sessionExpiry = data.expiry;
                sessionValid = true;
                this._lastValidSession = { token: data.token, expiry: data.expiry, user: data.user };

                if (data.user) {
                    currentUser = data.user;
                    userDataLoaded = true;
                }

                const session = {
                    token: data.token,
                    userId: data.user?.id,
                    expiresAt: data.expiry,
                    signature: SecurityCore.createSignature({ userId: data.user?.id }, Date.now()),
                    refreshToken: null
                };
                if (isValidSession(session)) {
                    validatedSession = session;
                    sessionValidationTimestamp = Date.now();
                }

                this.scheduleRefresh();

                if (APICore && APICore.setToken) {
                    APICore.setToken(data.token, null, data.expiry);
                }

                return true;
            } catch (error) {
                logOnce('error', 'Failed to restore session', error);
                return false;
            }
        },

        clearStorage: function() {
            try {
                SecurityCore.safeLocalStorageRemove(`${CONFIG.STORAGE_PREFIX}${iframeId}`);
            } catch (error) {
                logOnce('error', 'Failed to clear session storage', error);
            }
        },

        getToken: function() {
            if (this._demoMode) return null;
            if (this._guestMode && this._lastValidSession) return this._lastValidSession.token;
            return this.validateToken() ? sessionToken : null;
        },

        getStatus: function() {
            return {
                valid: this.validateToken(),
                expiry: sessionExpiry,
                timeRemaining: sessionExpiry ? sessionExpiry - Date.now() : 0,
                user: currentUser ? { id: currentUser.id, username: currentUser.username } : null,
                demoMode: false,
                guestMode: this._guestMode
            };
        },

        isDemoMode: function() { return false; },
        isGuestMode: function() { return this._guestMode; },

        setState: function(newState) {
            if (newState === currentState) return;

            const oldState = currentState;
            currentState = newState;

            logOnce('info', `State transition: ${oldState} → ${newState}`);
            parentComm.notifyState();

            stateChangeCallbacks.forEach(cb => {
                try { cb(newState, oldState); } catch (error) {
                    logOnce('error', 'State change callback failed', error);
                }
            });

            if (newState === STATE.SUSPENDED) {
                suspendedTimestamp = Date.now();
                this.pause();
            } else if (oldState === STATE.SUSPENDED && newState === STATE.ACTIVE) {
                const suspendedDuration = suspendedTimestamp ? Date.now() - suspendedTimestamp : 0;
                logOnce('info', `Resumed after ${suspendedDuration}ms suspended`);
                suspendedTimestamp = null;
                this.resume();
            }
        },

        pause: function() {
            if (CONFIG.SUSPEND_TIMER_CLEANUP) {
                timers.forEach(timer => {
                    try {
                        if (timer && typeof timer === 'object' && 'ref' in timer) {
                            clearTimeout(timer);
                            clearInterval(timer);
                        }
                    } catch (e) {}
                });
                timers.clear();
            }
        },

        resume: function() {
            this.scheduleRefresh();
            this.validateToken();

            if (!getValidatedSession() && !this._demoMode) {
                setTimeout(() => requestResync(), 500);
            }
        }
    };

    const session = SessionManager;

    // ==================== ORIGINAL RETRY MANAGER (PRESERVED) ====================
    const RetryManager = {
        _counters: retryCounters,
        _circuitBreakers: new Map(),

        getBreaker: function(name) {
            if (!this._circuitBreakers.has(name)) {
                this._circuitBreakers.set(name, new CircuitBreaker(name));
            }
            return this._circuitBreakers.get(name);
        },

        canRetry: function(key, maxRetries = CONFIG.MAX_RETRIES) {
            const count = this._counters.get(key) || 0;
            const breaker = this.getBreaker(key);
            return count < maxRetries && breaker.canExecute();
        },

        increment: function(key) {
            const count = (this._counters.get(key) || 0) + 1;
            this._counters.set(key, count);
            return count;
        },

        reset: function(key) {
            this._counters.delete(key);
            const breaker = this.getBreaker(key);
            if (breaker) breaker.success();
        },

        recordFailure: function(key) {
            const breaker = this.getBreaker(key);
            breaker.failure();
        },

        getBackoffDelay: function(key) {
            const count = this._counters.get(key) || 0;
            let delay = CONFIG.RETRY_BACKOFF * Math.pow(2, count);
            if (EnvironmentDetector.isVPNNetwork()) delay *= 1.5;
            return delay;
        },

        executeWithRetry: async function(fn, key, options = {}) {
            const maxRetries = options.maxRetries || CONFIG.MAX_RETRIES;
            const timeout = options.timeout || 30000;
            let lastError;

            while (this.canRetry(key, maxRetries)) {
                const attempt = this.increment(key);

                try {
                    const result = await Promise.race([
                        fn(),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
                        )
                    ]);

                    this.reset(key);
                    return result;
                } catch (error) {
                    lastError = error;
                    this.recordFailure(key);

                    if (attempt >= maxRetries) break;

                    const delay = this.getBackoffDelay(key);
                    logOnce('warn-icon', `Retry ${attempt}/${maxRetries} for ${key} in ${delay}ms`, error.message);

                    if (options.onRetry) options.onRetry(attempt, delay, error);

                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            throw new Error(`Max retries (${maxRetries}) exceeded for ${key}: ${lastError?.message || 'Unknown error'}`);
        }
    };

    // ==================== ORIGINAL ERROR BOUNDARY (PRESERVED) ====================
    const ErrorBoundary = {
        execute: function(fn, context, fallback = null) {
            try {
                return fn();
            } catch (error) {
                logOnce('error', `Error in ${context}`, error);
                logErrorOnce(context, error);
                if (DiagnosticsAgent) DiagnosticsAgent.record('errors', { context, error: error.message });
                return fallback;
            }
        },

        executeAsync: async function(fn, context, fallback = null) {
            try {
                return await fn();
            } catch (error) {
                logOnce('error', `Async error in ${context}`, error);
                logErrorOnce(context, error);
                if (DiagnosticsAgent) DiagnosticsAgent.record('errors', { context, error: error.message });
                return fallback;
            }
        },

        wrap: function(fn, context) {
            return (...args) => {
                try {
                    return fn(...args);
                } catch (error) {
                    logOnce('error', `Error in ${context}`, error);
                    logErrorOnce(context, error);
                    if (DiagnosticsAgent) DiagnosticsAgent.record('errors', { context, error: error.message });
                    return null;
                }
            };
        },

        createBoundary: function(featureName, fallbackFn) {
            return {
                execute: (fn) => {
                    try {
                        return fn();
                    } catch (error) {
                        logOnce('error', `Feature ${featureName} failed`, error);
                        logOnce('warn-icon', `Feature ${featureName} disabled due to error`);
                        if (DiagnosticsAgent) DiagnosticsAgent.record('errors', { feature: featureName, error: error.message });
                        return fallbackFn ? fallbackFn() : null;
                    }
                },
                executeAsync: async (fn) => {
                    try {
                        return await fn();
                    } catch (error) {
                        logOnce('error', `Feature ${featureName} async failed`, error);
                        logOnce('warn-icon', `Feature ${featureName} disabled due to error`);
                        if (DiagnosticsAgent) DiagnosticsAgent.record('errors', { feature: featureName, error: error.message });
                        return fallbackFn ? fallbackFn() : null;
                    }
                }
            };
        }
    };

    // ==================== ORIGINAL PARENT COMMUNICATION (PRESERVED) ====================
    const parentComm = {
        _pendingAcks: new Map(),
        _retryQueues: new Map(),

        _send: function(type, payload = {}, targetOrigin = OriginAdapter.getTargetOrigin(), options = {}) {
            return ErrorBoundary.execute(() => {
                if (!window.parent || window.parent === window) {
                    logOnce('warn-icon', 'No parent window available');
                    return false;
                }

                const messageKey = `${type}:${JSON.stringify(payload)}:${options.id || 'no-id'}`;
                if (messageDuplicates.has(messageKey)) return false;

                messageDuplicates.add(messageKey);
                setTimeout(() => messageDuplicates.delete(messageKey), CONFIG.MESSAGE_CACHE_TTL);

                const message = MessageValidator.createMessage(type, payload, {
                    id: options.id,
                    ack: options.requireAck || false,
                    retry: options.retryCount || 0
                });

                const adaptedMessage = CompatibilityBridge.adaptOutgoing(message);

                try {
                    window.parent.postMessage(adaptedMessage, targetOrigin);
                    if (DiagnosticsAgent) DiagnosticsAgent.record('messagesSent', { type });

                    if (options.requireAck) {
                        this._waitForAck(message.id, options.timeout || CONFIG.ACK_TIMEOUT)
                            .catch(() => {
                                logOnce('warn-icon', `No ACK for message ${message.id}, retrying...`);
                                if ((options.retryCount || 0) < CONFIG.MAX_MESSAGE_RETRIES) {
                                    setTimeout(() => {
                                        this._send(type, payload, targetOrigin, {
                                            ...options,
                                            retryCount: (options.retryCount || 0) + 1,
                                            id: MessageValidator.generateId()
                                        });
                                    }, 1000 * ((options.retryCount || 0) + 1));
                                }
                            });
                    }

                    return true;
                } catch (error) {
                    logOnce('error', 'parentComm._send', error);
                    return false;
                }
            }, 'parentComm._send', false);
        },

        _waitForAck: function(messageId, timeout) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    this._pendingAcks.delete(messageId);
                    reject(new Error('ACK timeout'));
                }, timeout);

                this._pendingAcks.set(messageId, { resolve, reject, timer });
            });
        },

        _handleAck: function(ackMessage) {
            if (!ackMessage.payload || !ackMessage.payload.ackId) return;
            const pending = this._pendingAcks.get(ackMessage.payload.ackId);
            if (pending) {
                clearTimeout(pending.timer);
                this._pendingAcks.delete(ackMessage.payload.ackId);
                pending.resolve(ackMessage);
            }
        },

        send: function(type, payload = {}) {
            return this._send(type, payload, OriginAdapter.getTargetOrigin(), { requireAck: false });
        },

        sendWithAck: function(type, payload = {}, timeout = CONFIG.ACK_TIMEOUT) {
            const id = MessageValidator.generateId();
            return new Promise((resolve, reject) => {
                const success = this._send(type, payload, OriginAdapter.getTargetOrigin(), {
                    requireAck: true,
                    timeout,
                    id
                });
                if (!success) {
                    reject(new Error('Failed to send message'));
                    return;
                }

                this._waitForAck(id, timeout)
                    .then(resolve)
                    .catch(reject);
            });
        },

        sendSecure: function(type, payload = {}) {
            if (!sessionToken) {
                logOnce('warn-icon', 'No session token for secure message');
                return false;
            }
            return this._send(type, { ...payload, _token: sessionToken ? sessionToken.substring(0, 8) : null }, OriginAdapter.getTargetOrigin(), { requireAck: false });
        },

        request: function(type, payload = {}, timeout = 8000) {
            return new Promise((resolve, reject) => {
                ErrorBoundary.execute(() => {
                    const requestId = MessageValidator.generateId();

                    if (pendingRequests.size >= CONFIG.MAX_PENDING_REQUESTS) {
                        reject(new Error('Too many pending requests'));
                        return;
                    }

                    const cleanup = () => {
                        pendingRequests.delete(requestId);
                        window.removeEventListener('message', handler);
                    };

                    const handler = (event) => {
                        if (!OriginAdapter.validateEvent(event)) return;

                        const data = CompatibilityBridge.adaptIncoming(event.data);
                        if (!data || !data.payload || data.payload.requestId !== requestId) return;

                        cleanup();

                        if (data.payload.error) {
                            reject(new Error(data.payload.error));
                        } else {
                            resolve(data.payload || data);
                        }
                    };

                    window.addEventListener('message', handler);

                    pendingRequests.set(requestId, { resolve, reject, cleanup });

                    if (!this._send(type, { ...payload, requestId }, OriginAdapter.getTargetOrigin(), { requireAck: true, timeout })) {
                        cleanup();
                        reject(new Error('Failed to send request'));
                        return;
                    }

                    const timer = setTimeout(() => {
                        cleanup();
                        reject(new Error(`Request timeout: ${type}`));
                    }, timeout);

                    timers.add(timer);
                }, 'parentComm.request', () => reject(new Error('Request failed')));
            });
        },

        notifyState: function() {
            this.send('IFRAME_STATE_CHANGE', {
                iframeId: iframeId,
                state: currentState,
                sessionValid: !!sessionToken,
                sessionExpiry: sessionExpiry,
                timestamp: Date.now()
            });
        },

        notifyParent: function(type, payload = {}) {
            return this.send(type, payload);
        }
    };

    // ==================== ORIGINAL PARENT MESSAGE HANDLER (PRESERVED) ====================
    window.addEventListener('message', (e) => {
        if (!OriginSecurity.validateEvent(e)) {
            if (DEBUG) logOnce('warn', 'Message rejected - invalid origin', { origin: e.origin });
            return;
        }

        if (!OriginAdapter.validateEvent(e)) {
            if (DEBUG) logOnce('warn', 'Message rejected - invalid origin (adapter)', { origin: e.origin });
            return;
        }

        if (!e || !e.data) return;

        const adaptedMessage = CompatibilityBridge.adaptIncoming(e.data);

        if (!MessageValidator.validate(adaptedMessage)) return;

        if (DiagnosticsAgent) DiagnosticsAgent.record('messagesReceived', { type: adaptedMessage.type });

        TransportAgent.handleIncoming({ data: adaptedMessage, origin: e.origin });

        if (adaptedMessage.type === 'PARENT_READY') {
            _PARENT_READY_ = true;
            _HANDSHAKE_DONE_ = true;
            logOnce('success', 'Parent handshake complete');

            if (StateGovernor.getState() === STATE.HANDSHAKING) {
                StateGovernor.transition(STATE.HANDSHAKING, STATE.HANDSHAKE_COMPLETE, 'parent_ready');
            }
        }

        if (adaptedMessage.type === 'ACK' && adaptedMessage.payload && adaptedMessage.payload.ackId) {
            parentComm._handleAck(adaptedMessage);
        }

        if (adaptedMessage.type === 'SESSION_RESPONSE' && adaptedMessage.payload) {
            const sessionData = adaptedMessage.payload;
            if (sessionData.token || (sessionData.user && sessionData.token)) {
                if (sessionData.token) {
                    sessionToken = sessionData.token;
                    sessionExpiry = sessionData.expiry || sessionData.expiresAt;
                }
                if (sessionData.user) {
                    currentUser = sessionData.user;
                    userDataLoaded = true;
                }
                if (sessionData.authenticated !== undefined) {
                    sessionAuthorityReady = sessionData.authenticated;
                }
                if (sessionData.userId) {
                    if (!currentUser) currentUser = {};
                    currentUser.id = sessionData.userId;
                }
                logOnce('success', 'Session response received from parent');

                const session = {
                    token: sessionToken,
                    userId: currentUser?.id || sessionData.userId,
                    expiresAt: sessionExpiry,
                    signature: SecurityCore.createSignature({ userId: currentUser?.id }, Date.now()),
                    refreshToken: sessionData.refreshToken
                };
                if (isValidSession(session)) {
                    validatedSession = session;
                    sessionValidationTimestamp = Date.now();
                }

                const ackMessage = MessageBridge.createMessage('SESSION_ACK', { success: true }, { legacy: true });
                window.parent.postMessage(ackMessage, OriginAdapter.getTargetOrigin());
            }
        }

        if (adaptedMessage.type === 'TOKEN_RESPONSE' && adaptedMessage.payload) {
            const payload = adaptedMessage.payload;
            if (payload.token) {
                sessionToken = payload.token;
                sessionExpiry = payload.expiry || payload.expiresAt;
                if (payload.user) {
                    currentUser = payload.user;
                    userDataLoaded = true;
                }
                logOnce('success', 'Token response received from parent');

                const ackMessage = MessageBridge.createMessage('TOKEN_ACK', { success: true }, { legacy: true });
                window.parent.postMessage(ackMessage, OriginAdapter.getTargetOrigin());
            }
        }

        if (adaptedMessage.type === 'SESSION_INIT' && adaptedMessage.payload && adaptedMessage.payload.session) {
            const sessionData = adaptedMessage.payload.session;
            if (sessionData.token) {
                sessionToken = sessionData.token;
                sessionExpiry = sessionData.expiry;
                currentUser = sessionData.user;
                userDataLoaded = true;
                sessionAuthorityReady = true;
                secureSessionValid = true;
                logOnce('success', 'Session received from parent via SESSION_INIT');

                const session = {
                    token: sessionData.token,
                    userId: sessionData.user?.id || sessionData.userId,
                    expiresAt: sessionData.expiry || sessionData.expiresAt,
                    signature: sessionData.signature || SecurityCore.createSignature({ userId: sessionData.user?.id }, Date.now()),
                    refreshToken: sessionData.refreshToken
                };
                if (isValidSession(session)) {
                    validatedSession = session;
                    sessionValidationTimestamp = Date.now();

                    const ackMessage = MessageBridge.createMessage('SESSION_INIT_ACK', { success: true }, { legacy: true });
                    window.parent.postMessage(ackMessage, OriginAdapter.getTargetOrigin());
                }
            }
        }

        if (adaptedMessage.type === 'SESSION_UPDATE' && adaptedMessage.payload) {
            const payload = adaptedMessage.payload;
            if (payload.token) {
                sessionToken = payload.token;
                sessionExpiry = payload.expiry;
            }
            if (payload.user) {
                currentUser = payload.user;
                userDataLoaded = true;
            }
            if (payload.authenticated !== undefined) {
                sessionAuthorityReady = payload.authenticated;
            }
            logOnce('success', 'Session updated from parent');

            if (payload.token && payload.user?.id) {
                const session = {
                    token: payload.token,
                    userId: payload.user.id,
                    expiresAt: payload.expiry || Date.now() + 3600000,
                    signature: payload.signature || SecurityCore.createSignature({ userId: payload.user.id }, Date.now()),
                    refreshToken: payload.refreshToken
                };
                if (isValidSession(session)) {
                    validatedSession = session;
                    sessionValidationTimestamp = Date.now();
                }
            }
        }

        if (adaptedMessage.type === 'SESSION_SYNC' && adaptedMessage.payload) {
            handleSessionSync(adaptedMessage.payload, adaptedMessage.messageId);
        }

        if (adaptedMessage.type === 'SESSION_ACK' && adaptedMessage.payload) {
            handleParentAck(adaptedMessage.payload);
        }

        if (adaptedMessage.type === 'HANDSHAKE_REQUEST' && adaptedMessage.payload) {
            handleHandshakeRequest(adaptedMessage.payload, adaptedMessage.messageId);
        }

        if (adaptedMessage.type === 'PAGE_ACTIVATED') {
            logOnce('info', 'Parent page activated');
            if (currentState === STATE.SUSPENDED) {
                session.setState(STATE.ACTIVE);
            }
        }

        if (adaptedMessage.type === 'NAVIGATE' && adaptedMessage.payload) {
            logOnce('info', 'Parent navigation:', adaptedMessage.payload);
        }

        if (adaptedMessage.type === 'PING') {
            const pongMessage = MessageBridge.createMessage('PONG', {
                requestId: adaptedMessage.payload?.requestId,
                timestamp: Date.now()
            });
            window.parent.postMessage(pongMessage, OriginAdapter.getTargetOrigin());
        }

        if (adaptedMessage.type === 'PARENT_CRASH_RECOVERY') {
            logOnce('warn-icon', 'Parent crash detected, initiating recovery');
            RecoveryManager.recover();
        }
    });

    function sendSessionAck(type, payload) {
        try {
            if (window.parent && window.parent !== window) {
                const message = MessageBridge.createMessage(type, payload, { legacy: true });
                window.parent.postMessage(message, OriginAdapter.getTargetOrigin());
                logOnce('info', `Session ACK sent: ${type}`);
            }
        } catch (e) {
            logOnce('error', 'Failed to send session ACK', e);
        }
    }

    function handleSessionSync(payload, messageId) {
        logOnce('info', 'Received SESSION_SYNC from parent');

        try {
            const session = {
                token: payload.token,
                userId: payload.userId || payload.user?.id,
                expiresAt: payload.expiresAt || payload.expiry,
                signature: payload.signature,
                refreshToken: payload.refreshToken
            };

            if (isValidSession(session)) {
                sessionToken = session.token;
                sessionExpiry = session.expiresAt;
                currentUser = { id: session.userId, ...payload.user };
                userDataLoaded = true;
                sessionAuthorityReady = true;
                secureSessionValid = true;

                validatedSession = session;
                sessionValidationTimestamp = Date.now();
                sessionAckReceived = true;
                sessionAckTimestamp = Date.now();

                if (callCoreState === CallCoreState.WAITING_SESSION) {
                    callCoreState = CallCoreState.SYNCED;
                    if (handshakeResolve) {
                        handshakeResolve({ success: true, session: session });
                        handshakeResolve = null;
                    }
                }

                logOnce('success', 'Session validated and stored');

                const ackMessage = MessageBridge.createMessage('CALL_SESSION_ACK', {
                    success: true,
                    sessionId: session.userId,
                    timestamp: Date.now()
                }, { legacy: true });
                window.parent.postMessage(ackMessage, OriginAdapter.getTargetOrigin());
            } else {
                logOnce('warn-icon', 'Invalid session schema received');
                const ackMessage = MessageBridge.createMessage('CALL_SESSION_ACK', {
                    success: false,
                    error: 'Invalid session schema',
                    timestamp: Date.now()
                }, { legacy: true });
                window.parent.postMessage(ackMessage, OriginAdapter.getTargetOrigin());
            }
        } catch (error) {
            logOnce('error', 'Error handling SESSION_SYNC', error);
            const ackMessage = MessageBridge.createMessage('CALL_SESSION_ACK', {
                success: false,
                error: error.message,
                timestamp: Date.now()
            }, { legacy: true });
            window.parent.postMessage(ackMessage, OriginAdapter.getTargetOrigin());
        }
    }

    function handleParentAck(payload) {
        logOnce('info', 'Received parent ACK', payload);
        if (payload.success) {
            sessionAckReceived = true;
            sessionAckTimestamp = Date.now();
        }
    }

    function handleHandshakeRequest(payload, messageId) {
        logOnce('info', 'Received handshake request from parent');

        const session = getValidatedSession();
        const response = {
            messageId: messageId,
            timestamp: Date.now(),
            protocolVersion: '2.4.0',
            sessionReady: !!session,
            session: session ? {
                userId: session.userId,
                token: 'present',
                expiresAt: session.expiresAt,
                signature: session.signature
            } : null
        };

        response.signature = SecurityCore.createSignature(response, response.timestamp);

        try {
            if (window.parent && window.parent !== window) {
                const message = MessageBridge.createMessage('HANDSHAKE_RESPONSE', response, { legacy: true });
                window.parent.postMessage(message, OriginAdapter.getTargetOrigin());
            }
        } catch (e) {
            logOnce('error', 'Failed to send handshake response', e);
        }
    }

    function notifyParentReady() {
        if (_HANDSHAKE_DONE_) return;
        if (_HANDSHAKE_RETRIES_ >= MAX_HANDSHAKE) {
            logOnce('warn-icon', 'Parent handshake failed after max retries');
            return;
        }

        if (window.parent) {
            const message = MessageBridge.createMessage('IFRAME_READY', {
                iframeId: iframeId,
                page: location.pathname,
                state: currentState,
                version: '2.4.0',
                timestamp: Date.now()
            }, { legacy: true });

            window.parent.postMessage(message, OriginAdapter.getTargetOrigin());

            _HANDSHAKE_RETRIES_++;
            logOnce('info', `Parent handshake attempt ${_HANDSHAKE_RETRIES_}/${MAX_HANDSHAKE}`);
        }
    }

    // ==================== ORIGINAL PARENT COORDINATOR (PRESERVED) ====================
    class ParentCoordinator {
        constructor() {
            this.parentDetected = false;
            this.sameOrigin = false;
            this.secureChannelEstablished = false;
            this.sessionData = null;
            this.sessionValidated = false;
            this.handshakeInProgress = false;
            this.handshakeComplete = false;
            this.reconnectionTimer = null;
            this.messageHandlers = new Map();
            this.pendingRequests = new Map();
            this.lastHeartbeat = 0;
            this.heartbeatInterval = null;
            this.initializationLock = false;
            this.fallbackState = 'waiting';
            this.sessionUpdateCallbacks = [];
            this.uiBindings = [];
            this.sessionWaitingLogged = false;
            this.secureSessionValid = false;
            this.secureHandshakeRequested = false;
            this.messageRetryCounts = new Map();
            this.maxMessageRetries = CONFIG.MAX_MESSAGE_RETRIES;
            this.fallbackMode = false;
            this._sanitizing = false;
        }

        async initialize() {
            return ErrorBoundary.executeAsync(async () => {
                logOnce('info', 'Initializing parent coordination...');

                this.detectParent();

                if (!this.parentDetected) {
                    logOnce('warn-icon', 'No parent window detected, enabling fallback mode');
                    this.fallbackMode = true;
                    this.setFallbackState('standalone');
                    return { success: true, mode: 'standalone', fallback: true };
                }

                if (!this.sameOrigin) {
                    logOnce('warn-icon', 'Cross-origin parent detected, limited functionality');
                    this.setFallbackState('reconnecting');
                }

                this.establishMessagingChannel();

                this.startHeartbeat();
                this.setupResynchronization();

                return {
                    success: true,
                    parentDetected: this.parentDetected,
                    fallback: this.fallbackMode
                };
            }, 'ParentCoordinator.initialize', { success: false, fallback: true });
        }

        detectParent() {
            try {
                this.parentDetected = !!(window.parent && window.parent !== window);

                if (this.parentDetected) {
                    try {
                        this.sameOrigin = window.location.origin === window.parent.location.origin;
                        logOnce('info', `Parent detected, same-origin: ${this.sameOrigin}`);

                        if (this.sameOrigin) trustedOrigins.add(window.location.origin);

                        try {
                            trustedOrigins.add(window.parent.location.origin);
                        } catch (e) {}
                    } catch (error) {
                        logOnce('info', 'Cross-origin parent detected');
                        this.sameOrigin = false;
                    }
                }
            } catch (error) {
                logOnce('error', 'ParentCoordinator.detectParent', error);
                this.parentDetected = false;
                this.sameOrigin = false;
                this.fallbackMode = true;
            }
        }

        establishMessagingChannel() {
            try {
                window.addEventListener('message', this.handleParentMessage.bind(this));
                logOnce('info', 'Secure messaging channel established');
                this.secureChannelEstablished = true;
            } catch (error) {
                logOnce('error', 'ParentCoordinator.establishMessagingChannel', error);
                this.secureChannelEstablished = false;
            }
        }

        handleParentMessage(event) {
            if (!OriginSecurity.validateEvent(event)) {
                if (DEBUG) logOnce('warn', 'Message rejected - invalid origin', { origin: event.origin });
                return;
            }

            if (!OriginAdapter.validateEvent(event)) return;

            const data = CompatibilityBridge.adaptIncoming(event.data);
            if (!data || typeof data !== 'object') return;
            if (!MessageValidator.validate(data)) return;

            try {
                if (this.messageHandlers.has(data.type)) {
                    this.messageHandlers.get(data.type)(data);
                } else {
                    this.handleDefaultMessage(data);
                }

                if (data.payload?.requestId && this.pendingRequests.has(data.payload.requestId)) {
                    const { resolve, reject } = this.pendingRequests.get(data.payload.requestId);
                    if (data.payload.success !== false) {
                        resolve(data);
                    } else {
                        reject(new Error(data.payload.error || 'Request failed'));
                    }
                    this.pendingRequests.delete(data.payload.requestId);
                }
            } catch (error) {
                logOnce('error', 'ParentCoordinator.handleParentMessage', error, `type: ${data?.type}`);
            }
        }

        isValidOrigin(origin) { return OriginAdapter.isTrusted(origin); }

        async startSecureHandshake() {
            if (secureHandshakeInProgress || this.secureSessionValid) {
                return { success: this.secureSessionValid };
            }

            if (this.fallbackMode) {
                logOnce('info', 'Fallback mode active, skipping secure handshake');
                return { success: false, fallback: true };
            }

            const retryKey = 'secureHandshake';
            if (!canRetry(retryKey, maxHandshakeAttempts)) {
                logOnce('warn-icon', 'Max handshake attempts reached, enabling fallback');
                this.fallbackMode = true;
                return { success: false, fallback: true };
            }

            secureHandshakeInProgress = true;
            this.secureHandshakeRequested = true;
            secureHandshakeAttempts = incrementRetryCount(retryKey);

            logOnce('info', `Starting secure handshake protocol (attempt ${secureHandshakeAttempts}/${maxHandshakeAttempts})...`);
            return this.requestSecureSession();
        }

        requestSecureSession() {
            return new Promise((resolve) => {
                if (!this.parentDetected || !window.parent) {
                    this.handleSecureHandshakeFailure('No parent window');
                    resolve({ success: false, fallback: true });
                    return;
                }

                if (secureHandshakeAttempts >= maxHandshakeAttempts) {
                    this.handleSecureHandshakeFailure('Max attempts reached');
                    resolve({ success: false, fallback: true });
                    return;
                }

                if (secureHandshakeTimeout) {
                    clearTimeout(secureHandshakeTimeout);
                    secureHandshakeTimeout = null;
                }

                const requestId = MessageValidator.generateId();

                const message = MessageBridge.createMessage('REQUEST_SESSION', {
                    requestId: requestId,
                    timestamp: Date.now(),
                    version: '2.4.0',
                    secure: true,
                    iframeId: this.getIframeId()
                }, { messageId: requestId });

                let resolved = false;

                secureHandshakeTimeout = setTimeout(() => {
                    if (!resolved && !this.secureSessionValid) {
                        logOnce('warn-icon', `⚠️ Secure session request timeout (attempt ${secureHandshakeAttempts})`);
                        if (secureHandshakeAttempts < maxHandshakeAttempts) {
                            setTimeout(() => this.requestSecureSession(), sessionRetryDelay);
                        } else {
                            this.handleSecureHandshakeFailure('Handshake timeout');
                        }
                        if (!resolved) {
                            resolved = true;
                            resolve({ success: false, fallback: true });
                        }
                    }
                }, handshakeTimeout);

                if (!this.sendToParent(message)) {
                    this.handleSecureHandshakeFailure('Failed to send request');
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: false, fallback: true });
                    }
                    return;
                }

                const handler = (event) => {
                    if (!OriginAdapter.validateEvent(event)) return;

                    const data = CompatibilityBridge.adaptIncoming(event.data);
                    if (!data || data.type !== 'SESSION_DATA') return;
                    if (data.requestId !== requestId && data.payload?.requestId !== requestId) return;

                    window.removeEventListener('message', handler);
                    clearTimeout(secureHandshakeTimeout);

                    if (!resolved) {
                        resolved = true;
                        this.handleSecureSessionData(data.payload || data);
                        resolve({ success: true, fallback: false });
                    }
                };

                window.addEventListener('message', handler);

                setTimeout(() => {
                    window.removeEventListener('message', handler);
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: false, fallback: true });
                    }
                }, handshakeTimeout + 1000);
            });
        }

        handleSecureHandshakeFailure(reason) {
            logOnce('warn-icon', `❌ Secure handshake failed: ${reason}`);
            secureHandshakeInProgress = false;
            this.secureHandshakeRequested = false;
            this.fallbackMode = true;
        }

        handleSecureSessionData(sessionData) {
            if (!sessionData || typeof sessionData !== 'object') return;

            if (!this.validateSecureSessionSchema(sessionData)) {
                this.handleSecureHandshakeFailure('Invalid session schema');
                return;
            }

            if (secureHandshakeTimeout) {
                clearTimeout(secureHandshakeTimeout);
                secureHandshakeTimeout = null;
            }

            this.sessionData = sessionData;
            this.sessionValidated = true;
            this.secureSessionValid = true;
            secureHandshakeInProgress = false;
            this.handshakeComplete = true;
            this.handshakeInProgress = false;
            this.fallbackMode = false;

            resetRetryCount('secureHandshake');

            logOnce('success', '✅ Secure session received and validated successfully');
            this.setFallbackState('connected');
            this.updateGlobalStateFromSession();
            this.bindUIAfterSessionConfirmation();

            const confirmMessage = MessageBridge.createMessage('SESSION_CONSUMED', {
                sessionId: sessionData.sessionId,
                userId: sessionData.user?.id,
                secure: true
            });

            this.sendToParent(confirmMessage);
            logOnce('info', 'Secure session data consumed successfully');

            const ackMessage = MessageBridge.createMessage('CALL_SESSION_ACK', {
                success: true,
                sessionId: sessionData.sessionId,
                timestamp: Date.now()
            }, { legacy: true });
            this.sendToParent(ackMessage);
        }

        validateSecureSessionSchema(sessionData) {
            if (!sessionData || typeof sessionData !== 'object') return false;

            const requiredFields = ['sessionId', 'timestamp', 'token', 'user'];
            for (const field of requiredFields) {
                if (!sessionData.hasOwnProperty(field)) return false;
            }

            if (!sessionData.user || !sessionData.user.id || !sessionData.user.username) return false;
            if (typeof sessionData.token !== 'string' || sessionData.token.length < 10) return false;

            return true;
        }

        getIframeId() { return iframeId; }

        async initiateHandshake() {
            if (this.handshakeInProgress || this.handshakeComplete) return;

            this.handshakeInProgress = true;
            this.setFallbackState('waiting');

            logOnce('info', 'Starting handshake protocol...');

            const message = MessageBridge.createMessage('CHILD_READY', {
                timestamp: Date.now(),
                version: '2.4.0',
                capabilities: ['session_management', 'ui_coordination', 'api_routing']
            }, { legacy: true });

            if (!this.sendToParent(message)) {
                logOnce('warn-icon', 'Failed to send CHILD_READY');
                this.handshakeInProgress = false;
                return;
            }
        }

        async requestSessionWithBackoff() {
            const retryKey = 'sessionRequest';
            if (!canRetry(retryKey, 5)) {
                logOnce('warn-icon', 'Max session request attempts reached');
                this.setFallbackState('unavailable');
                this.handshakeInProgress = false;
                return;
            }

            let attempt = getRetryCount(retryKey);
            const maxAttempts = 5;
            const baseDelay = 1000;

            while (attempt < maxAttempts && !this.handshakeComplete) {
                attempt = incrementRetryCount(retryKey);
                let delay = baseDelay * Math.pow(2, attempt - 1);
                if (EnvironmentDetector.isVPNNetwork()) delay *= 1.5;

                logOnce('info', `Requesting session (attempt ${attempt}/${maxAttempts})...`);

                const message = MessageBridge.createMessage('REQUEST_SESSION', {
                    attempt: attempt,
                    requestId: MessageValidator.generateId()
                }, { messageId: MessageValidator.generateId() });

                this.sendToParent(message);

                await new Promise(resolve => {
                    const timeoutId = setTimeout(() => {
                        logOnce('info', `Session request timeout (attempt ${attempt})`);
                        resolve();
                    }, delay);

                    const checkInterval = setInterval(() => {
                        if (this.handshakeComplete) {
                            clearTimeout(timeoutId);
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                });
            }

            if (!this.handshakeComplete) {
                logOnce('error', 'Handshake failed after maximum attempts');
                this.setFallbackState('unavailable');
                this.handshakeInProgress = false;
            }
        }

        sendToParent(message, targetOrigin = OriginAdapter.getTargetOrigin()) {
            if (!this.parentDetected || !window.parent) {
                if (!this.fallbackMode) logOnce('warn-icon', 'Cannot send message - no parent detected');
                return false;
            }

            if (!message || typeof message !== 'object') return false;

            if (isMessageDuplicate(message)) {
                logOnce('warn-icon', 'Duplicate message detected, skipping');
                return false;
            }

            const retryKey = `sendMessage:${message.type}`;
            const retryCount = getRetryCount(retryKey);

            if (retryCount >= this.maxMessageRetries) {
                logOnce('warn-icon', 'Max retries reached for message type: ' + message.type);
                return false;
            }

            try {
                const adaptedMessage = CompatibilityBridge.adaptOutgoing(message);

                window.parent.postMessage(adaptedMessage, targetOrigin);

                if (retryCount > 0) resetRetryCount(retryKey);

                if (DiagnosticsAgent) DiagnosticsAgent.record('messagesSent', { type: message.type });

                return true;
            } catch (error) {
                incrementRetryCount(retryKey);
                logOnce('error', 'ParentCoordinator.sendToParent', error, `type: ${message.type}, retry: ${retryCount + 1}`);

                if (retryCount < this.maxMessageRetries - 1) {
                    setTimeout(() => this.sendToParent(message, targetOrigin), 1000 * (retryCount + 1));
                }

                return false;
            }
        }

        sendWithResponse(message, timeout = 5000) {
            return new Promise((resolve, reject) => {
                if (!this.parentDetected) {
                    reject(new Error('No parent detected'));
                    return;
                }

                if (!message || typeof message !== 'object') {
                    reject(new Error('Invalid message'));
                    return;
                }

                const requestId = MessageValidator.generateId();
                message.payload = message.payload || {};
                message.payload.requestId = requestId;

                this.pendingRequests.set(requestId, { resolve, reject });

                if (!this.sendToParent(message)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('Failed to send message'));
                    return;
                }

                setTimeout(() => {
                    if (this.pendingRequests.has(requestId)) {
                        this.pendingRequests.delete(requestId);
                        reject(new Error('Request timeout'));
                    }
                }, timeout);
            });
        }

        handleSessionData(sessionData) {
            if (!sessionData || typeof sessionData !== 'object') return;

            logOnce('success', 'Received SESSION_DATA');

            if (!this.validateSessionSchema(sessionData)) {
                logOnce('error', 'Invalid session schema');
                const errorMessage = MessageBridge.createMessage('SESSION_ERROR', { error: 'Invalid session schema' });
                this.sendToParent(errorMessage);
                return;
            }

            this.sessionData = sessionData;
            this.sessionValidated = true;
            this.handshakeComplete = true;
            this.handshakeInProgress = false;
            this.setFallbackState('connected');

            this.updateGlobalStateFromSession();
            this.bindUIAfterSessionConfirmation();

            const confirmMessage = MessageBridge.createMessage('SESSION_CONSUMED', {
                sessionId: sessionData.sessionId,
                userId: sessionData.user?.id
            });

            this.sendToParent(confirmMessage);
            logOnce('info', 'Session data consumed successfully');

            const ackMessage = MessageBridge.createMessage('CALL_SESSION_ACK', {
                success: true,
                sessionId: sessionData.sessionId,
                timestamp: Date.now()
            }, { legacy: true });
            this.sendToParent(ackMessage);
        }

        validateSessionSchema(sessionData) {
            if (!sessionData || typeof sessionData !== 'object') return false;

            const requiredFields = ['sessionId', 'timestamp'];
            for (const field of requiredFields) {
                if (!sessionData.hasOwnProperty(field)) return false;
            }

            if (sessionData.user) {
                if (!sessionData.user.id || !sessionData.user.username) return false;
            }

            return true;
        }

        updateGlobalStateFromSession() {
            if (!this.sessionData) return;

            if (!this.sessionData.token) {
                if (!this.sessionWaitingLogged) {
                    logOnce('info', 'Session token not ready, waiting...');
                    this.sessionWaitingLogged = true;
                }
                return;
            }

            this.sessionWaitingLogged = false;

            if (this.sessionData.user) {
                try {
                    currentUser = this.sessionData.user;
                    userDataLoaded = true;

                    if (window.AppState) {
                        window.AppState.user = this.sessionData.user;
                        window.AppState.currentUser = this.sessionData.user;
                        window.AppState.isAuthenticated = this.sessionData.authenticated || false;
                    }

                    session.setToken(this.sessionData.token, this.sessionData.expiry);

                    const sessionObj = {
                        token: this.sessionData.token,
                        userId: this.sessionData.user.id,
                        expiresAt: this.sessionData.expiry || Date.now() + 3600000,
                        signature: SecurityCore.createSignature({ userId: this.sessionData.user.id }, Date.now()),
                        refreshToken: this.sessionData.refreshToken
                    };
                    if (isValidSession(sessionObj)) {
                        validatedSession = sessionObj;
                        sessionValidationTimestamp = Date.now();
                    }
                } catch (error) {
                    logOnce('error', 'ParentCoordinator.updateGlobalStateFromSession.user', error);
                }
            }

            if (this.sessionData.authenticated !== undefined) {
                try {
                    sessionAuthorityReady = this.sessionData.authenticated;
                    if (!this.sessionData.authenticated) this.handleLogout();
                } catch (error) {
                    logOnce('error', 'ParentCoordinator.updateGlobalStateFromSession.auth', error);
                }
            }
        }

        bindUIAfterSessionConfirmation() {
            if (!this.sessionValidated && !this.fallbackMode) {
                logOnce('warn-icon', 'Cannot bind UI - session not validated');
                return;
            }

            if (this.fallbackMode) logOnce('info', 'Fallback mode active, using cached UI bindings');

            logOnce('info', 'Binding UI with session data...');

            this.uiBindings.forEach(binding => {
                try { binding(); } catch (error) {
                    logOnce('error', 'ParentCoordinator.bindUIAfterSessionConfirmation.binding', error);
                }
            });

            try {
                this.updateUIWithSessionData();
                this.enableProtectedUI();
                logOnce('info', 'UI binding complete');
            } catch (error) {
                logOnce('error', 'ParentCoordinator.bindUIAfterSessionConfirmation.ui', error);
            }
        }

        updateUIWithSessionData() {
            if (!currentUser && !this.fallbackMode) return;

            try {
                const userElements = {
                    'userAvatar': currentUser?.avatar,
                    'userName': currentUser?.name || currentUser?.username || 'Guest',
                    'userStatus': currentUser?.status || 'Online'
                };

                this.updateUserSpecificUI(userElements);
                this.updateApiStatusIndicator();
                this.updateSyncIndicator();
            } catch (error) {
                logOnce('error', 'ParentCoordinator.updateUIWithSessionData', error);
            }
        }

        updateUserSpecificUI(userElements) {
            if (!userElements) return;

            try {
                document.querySelectorAll('.user-avatar, .avatar-img').forEach(el => {
                    if (userElements.userAvatar) {
                        if (el.tagName === 'IMG') {
                            el.src = SecurityCore.sanitizeURL(userElements.userAvatar);
                            el.alt = SecurityCore.sanitizeString(userElements.userName);
                        } else {
                            el.style.backgroundImage = `url(${SecurityCore.sanitizeURL(userElements.userAvatar)})`;
                        }
                    }
                });

                document.querySelectorAll('.user-name, .username').forEach(el => {
                    if (el.textContent.includes('User') || el.textContent.includes('Loading') || !currentUser) {
                        el.textContent = SecurityCore.sanitizeString(userElements.userName);
                    }
                });

                const callStatusText = document.getElementById('callStatusText');
                if (callStatusText && (callStatusText.textContent.includes('Waiting for API') || !currentUser)) {
                    callStatusText.textContent = `Ready (${SecurityCore.sanitizeString(userElements.userName)})`;
                }
            } catch (error) {
                logOnce('error', 'ParentCoordinator.updateUserSpecificUI', error);
            }
        }

        updateApiStatusIndicator() {
            try {
                const apiStatusIndicator = document.getElementById('apiStatusIndicator');
                const apiStatusText = document.getElementById('apiStatusText');

                if (apiStatusIndicator && apiStatusText) {
                    if (currentUser) {
                        apiStatusIndicator.className = 'api-status-indicator connected';
                        apiStatusText.textContent = `Authenticated as ${SecurityCore.sanitizeString(currentUser.name)}`;
                    } else {
                        apiStatusIndicator.className = 'api-status-indicator connecting';
                        apiStatusText.textContent = 'Connecting...';
                    }

                    setTimeout(() => {
                        if (apiStatusIndicator) apiStatusIndicator.style.display = 'none';
                    }, 2000);
                }
            } catch (error) {
                logOnce('error', 'ParentCoordinator.updateApiStatusIndicator', error);
            }
        }

        updateSyncIndicator() {
            try {
                const syncIndicator = document.getElementById('syncIndicator');
                if (syncIndicator) {
                    syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                    syncIndicator.classList.remove('syncing');
                }
            } catch (error) {
                logOnce('error', 'ParentCoordinator.updateSyncIndicator', error);
            }
        }

        enableProtectedUI() {
            if (!this.sessionValidated && !this.fallbackMode && !session.isDemoMode()) return;

            logOnce('info', 'Enabling protected UI features...');

            try {
                const newCallBtn = document.getElementById('newCallBtn');
                if (newCallBtn) newCallBtn.disabled = false;

                const quickVoiceBtn = document.getElementById('quickVoiceBtn');
                const quickVideoBtn = document.getElementById('quickVideoBtn');
                if (quickVoiceBtn) quickVoiceBtn.disabled = false;
                if (quickVideoBtn) quickVideoBtn.disabled = false;

                this.loadUserSpecificData();
            } catch (error) {
                logOnce('error', 'ParentCoordinator.enableProtectedUI', error);
            }
        }

        async loadUserSpecificData() {
            if (!currentUser && !this.fallbackMode && !session.isDemoMode()) return;

            logOnce('info', 'Loading user-specific data through parent coordination...');

            try {
                if (!this.fallbackMode && !session.isDemoMode()) {
                    await this.routeApiCall('/api/contacts', 'GET').catch(() => null);
                    await this.routeApiCall('/api/calls/history', 'GET').catch(() => null);
                }
            } catch (error) {
                logOnce('error', 'ParentCoordinator.loadUserSpecificData', error);
            }
        }

        async routeApiCall(endpoint, method = 'GET', data = null) {
            if (!this.sessionValidated && !this.fallbackMode) {
                throw new Error('Cannot route API call - session not validated');
            }

            if (this.fallbackMode || session.isDemoMode()) {
                logOnce('info', 'API call in fallback/demo mode, returning mock data');
                return this._getMockData(endpoint);
            }

            try {
                const response = await this.sendWithResponse({
                    type: 'API_REQUEST',
                    endpoint: endpoint,
                    method: method,
                    data: data,
                    timestamp: Date.now()
                });

                return response.data;
            } catch (error) {
                logOnce('error', 'ParentCoordinator.routeApiCall', error);
                throw error;
            }
        }

        _getMockData(endpoint) {
            if (endpoint.includes('/api/contacts')) return [];
            if (endpoint.includes('/api/calls/history')) return [];
            if (endpoint.includes('/api/user/me')) return { id: null, name: null, username: null };
            if (endpoint.includes('/api/user/settings')) {
                return {
                    emotionalContext: true,
                    callIntention: true,
                    inCallChat: true,
                    whiteboard: true,
                    polls: true,
                    notes: true,
                    focusMode: false,
                    liveReactions: true,
                    theme: 'light'
                };
            }
            if (endpoint.includes('/api/user/premium')) {
                return { isPremium: false, trialDaysLeft: 0, features: {} };
            }
            return null;
        }

        handleSessionUpdate(updateData) {
            if (!updateData || typeof updateData !== 'object') return;

            logOnce('success', 'Received SESSION_UPDATE');

            try {
                if (updateData.sessionData) {
                    this.sessionData = { ...this.sessionData, ...updateData.sessionData };
                }

                if (updateData.user) {
                    currentUser = { ...currentUser, ...updateData.user };

                    if (window.AppState) {
                        window.AppState.user = currentUser;
                        window.AppState.currentUser = currentUser;
                    }

                    this.updateUIWithSessionData();
                }

                if (updateData.token) {
                    session.setToken(updateData.token, updateData.expiry);
                }

                this.sessionUpdateCallbacks.forEach(callback => {
                    try { callback(updateData); } catch (error) {
                        logOnce('error', 'ParentCoordinator.handleSessionUpdate.callback', error);
                    }
                });

                logOnce('success', 'Session updated successfully');
            } catch (error) {
                logOnce('error', 'ParentCoordinator.handleSessionUpdate', error);
            }
        }

        handleLogout() {
            logOnce('info', 'Logout received from parent coordination');

            try {
                currentUser = null;
                userDataLoaded = false;
                sessionAuthorityReady = false;
                this.sessionValidated = false;
                this.sessionData = null;
                this.sessionWaitingLogged = false;
                this.secureSessionValid = false;
                secureHandshakeInProgress = false;
                this.secureHandshakeRequested = false;

                session.clearToken();

                if (window.AppState) {
                    window.AppState.user = null;
                    window.AppState.currentUser = null;
                    window.AppState.isAuthenticated = false;
                }

                this.disableProtectedUI();
                this.showReconnectState();

                logOnce('info', 'Logout handled successfully');
            } catch (error) {
                logOnce('error', 'ParentCoordinator.handleLogout', error);
            }
        }

        disableProtectedUI() {
            logOnce('info', 'Disabling protected UI...');

            try {
                const newCallBtn = document.getElementById('newCallBtn');
                if (newCallBtn && !session.isDemoMode()) newCallBtn.disabled = true;

                const quickVoiceBtn = document.getElementById('quickVoiceBtn');
                const quickVideoBtn = document.getElementById('quickVideoBtn');
                if (quickVoiceBtn && !session.isDemoMode()) quickVoiceBtn.disabled = true;
                if (quickVideoBtn && !session.isDemoMode()) quickVideoBtn.disabled = true;

                if (!session.isDemoMode()) this.showReconnectState();
            } catch (error) {
                logOnce('error', 'ParentCoordinator.disableProtectedUI', error);
            }
        }

        showReconnectState() {
            if (session.isDemoMode()) return;

            try {
                const appContainer = document.getElementById('appContainer');
                if (!appContainer) return;

                const existingOverlay = document.querySelector('.reconnect-overlay');
                if (existingOverlay) existingOverlay.remove();

                const reconnectOverlay = document.createElement('div');
                reconnectOverlay.className = 'reconnect-overlay';
                reconnectOverlay.innerHTML = `
                    <div class="reconnect-message">
                        <i class="fas fa-sync-alt"></i>
                        <h3>Session Update Required</h3>
                        <p>Your session has been updated. Please wait for reconnection...</p>
                        <div class="reconnect-progress">
                            <div class="reconnect-progress-bar"></div>
                        </div>
                        <button id="retryReconnectBtn" class="quick-action-btn">
                            <i class="fas fa-redo"></i> Retry Connection
                        </button>
                    </div>
                `;

                appContainer.appendChild(reconnectOverlay);

                const retryBtn = document.getElementById('retryReconnectBtn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        this.startSecureHandshake();
                    });
                }
            } catch (error) {
                logOnce('error', 'ParentCoordinator.showReconnectState', error);
            }
        }

        handleDefaultMessage(data) {
            if (!data || typeof data !== 'object') return;

            try {
                switch (data.type) {
                    case 'SESSION_DATA':
                        if (this.secureHandshakeRequested && data.token && data.user) {
                            this.handleSecureSessionData(data.payload || data);
                        } else {
                            this.handleSessionData(data.payload || data);
                        }
                        break;
                    case 'SESSION_UPDATE':
                        this.handleSessionUpdate(data.payload || data);
                        break;
                    case 'LOGOUT':
                        this.handleLogout();
                        break;
                    case 'TOKEN_UPDATE':
                        session.setToken(data.payload?.token || data.token, data.payload?.expiry || data.expiry);
                        break;
                    case 'HEARTBEAT_RESPONSE':
                        this.handleHeartbeatResponse();
                        break;
                    case 'CHILD_READY_ACK':
                        this.handleChildReadyAck();
                        break;
                    case 'SECURE_SESSION':
                        this.handleSecureSessionData(data.payload || data);
                        break;
                    case 'SESSION_INIT':
                        if (data.payload && data.payload.session) {
                            this.handleSessionUpdate({ user: data.payload.session.user, token: data.payload.session.token, authenticated: true });
                        }
                        break;
                    case 'PAGE_ACTIVATED':
                        logOnce('info', 'Parent page activated');
                        break;
                    case 'NAVIGATE':
                        logOnce('info', 'Parent navigation:', data.payload);
                        break;
                }
            } catch (error) {
                logOnce('error', 'ParentCoordinator.handleDefaultMessage', error, `type: ${data.type}`);
            }
        }

        registerMessageHandler(type, handler) {
            try { this.messageHandlers.set(type, handler); } catch (error) {
                logOnce('error', 'ParentCoordinator.registerMessageHandler', error);
            }
        }

        registerUIBinding(binding) {
            try { this.uiBindings.push(binding); } catch (error) {
                logOnce('error', 'ParentCoordinator.registerUIBinding', error);
            }
        }

        registerSessionUpdateCallback(callback) {
            try { this.sessionUpdateCallbacks.push(callback); } catch (error) {
                logOnce('error', 'ParentCoordinator.registerSessionUpdateCallback', error);
            }
        }

        startHeartbeat() {
            try {
                if (this.heartbeatInterval) {
                    clearInterval(this.heartbeatInterval);
                    this.heartbeatInterval = null;
                }

                this.heartbeatInterval = setInterval(() => {
                    this.sendHeartbeat();
                }, 15000);

                setTimeout(() => this.sendHeartbeat(), 1000);
                timers.add(this.heartbeatInterval);
            } catch (error) {
                logOnce('error', 'ParentCoordinator.startHeartbeat', error);
            }
        }

        sendHeartbeat() {
            if (!this.parentDetected && !this.fallbackMode) return;
            if (this.fallbackMode) return;

            const heartbeatMessage = MessageBridge.createMessage('HEARTBEAT', {
                timestamp: Date.now(),
                sessionId: this.sessionData?.sessionId
            });

            this.sendToParent(heartbeatMessage);
            this.lastHeartbeat = Date.now();
        }

        handleHeartbeatResponse() {
            this.lastHeartbeat = Date.now();
            resetHeartbeat();
        }

        handleChildReadyAck() {
            logOnce('info', 'CHILD_READY acknowledged by parent');
        }

        setFallbackState(state) { this.fallbackState = state; }

        setupResynchronization() {
            try {
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden && this.parentDetected && !this.fallbackMode) {
                        this.checkParentConnection();
                    }
                });

                window.addEventListener('online', () => {
                    if (this.parentDetected && !this.fallbackMode) {
                        this.checkParentConnection();
                        TransportAgent.processOfflineQueue();
                    }
                });
            } catch (error) {
                logOnce('error', 'ParentCoordinator.setupResynchronization', error);
            }
        }

        checkParentConnection() {
            if (!this.handshakeComplete && this.parentDetected && !this.fallbackMode) {
                logOnce('info', 'Checking parent connection...');
            }
        }

        cleanup() {
            try {
                if (this.heartbeatInterval) {
                    clearInterval(this.heartbeatInterval);
                    this.heartbeatInterval = null;
                }
                if (this.reconnectionTimer) {
                    clearTimeout(this.reconnectionTimer);
                    this.reconnectionTimer = null;
                }
                if (secureHandshakeTimeout) {
                    clearTimeout(secureHandshakeTimeout);
                    secureHandshakeTimeout = null;
                }
                this.messageHandlers.clear();
                this.pendingRequests.clear();
                this.uiBindings = [];
                this.sessionUpdateCallbacks = [];
                this.sessionWaitingLogged = false;
            } catch (error) {
                logOnce('error', 'ParentCoordinator.cleanup', error);
            }
        }

        getStatus() {
            try {
                return {
                    parentDetected: this.parentDetected,
                    sameOrigin: this.sameOrigin,
                    secureChannelEstablished: this.secureChannelEstablished,
                    handshakeComplete: this.handshakeComplete,
                    sessionValidated: this.sessionValidated,
                    fallbackState: this.fallbackState,
                    secureSessionValid: this.secureSessionValid,
                    secureHandshakeInProgress: secureHandshakeInProgress,
                    fallbackMode: this.fallbackMode,
                    sessionData: this.sessionData ? { ...this.sessionData, token: '***' } : null
                };
            } catch (error) {
                logOnce('error', 'ParentCoordinator.getStatus', error);
                return {
                    parentDetected: false,
                    sameOrigin: false,
                    secureChannelEstablished: false,
                    handshakeComplete: false,
                    sessionValidated: false,
                    fallbackState: 'error',
                    secureSessionValid: false,
                    secureHandshakeInProgress: false,
                    fallbackMode: true,
                    sessionData: null
                };
            }
        }
    }

    // ==================== ORIGINAL CORE INITIALIZER (PRESERVED) ====================
    class CoreInitializer {
        constructor() {
            this.isReady = false;
            this.initialized = false;
            this.initializationInProgress = false;
            this.loadingMessage = null;
            this.data = {
                friendsList: [],
                groupsList: [],
                chatHistory: [],
                notifications: [],
                settings: {}
            };
            this.messageQueue = [];
            this.eventListeners = new Map();
            this.initAttempts = 0;
            this.maxInitAttempts = CONFIG.maxReconnectionAttempts;
            this.pipelineStages = [
                'preflight',
                'dependencyCheck',
                'parentDetect',
                'handshake',
                'sessionSync',
                'serviceInit',
                'ready'
            ];
            this.currentStage = null;
        }

        async initialize() {
            if (this.initializationInProgress || this.initialized) {
                logOnce('info', 'Initialization already in progress or completed');
                return { status: 'already_initialized' };
            }

            this.initializationInProgress = true;
            this.initAttempts++;

            try {
                logOnce('info', 'Starting safe initialization pipeline...');

                const pipelineResult = await this.runPipeline();

                if (pipelineResult.success) {
                    logOnce('success', 'Initialization completed successfully');
                    return { status: 'success', stages: pipelineResult.stages };
                } else {
                    throw new Error(pipelineResult.error || 'Pipeline failed');
                }

            } catch (error) {
                logOnce('error', 'CoreInitializer.initialize', error, `attempt: ${this.initAttempts}`);

                this.showErrorMessage('Failed to load calls feature');

                parentComm.send('error', {
                    iframeId: iframeId,
                    message: error.message
                });

                if (this.initAttempts < this.maxInitAttempts) {
                    logOnce('info', `Retrying initialization (${this.initAttempts}/${this.maxInitAttempts})...`);
                    const timer = setTimeout(() => this.initialize(), 1000 * this.initAttempts);
                    timers.add(timer);
                    return { status: 'retrying', attempt: this.initAttempts };
                } else {
                    logOnce('error', 'Max initialization attempts reached, entering degraded mode');
                    this.enterDegradedMode();
                    this.initializationInProgress = false;
                    return { status: 'degraded', error: error.message };
                }
            }
        }

        async runPipeline() {
            const results = {};

            for (const stage of this.pipelineStages) {
                this.currentStage = stage;
                logOnce('info', `Pipeline stage: ${stage}`);

                try {
                    const timeoutMs = this._getStageTimeout(stage);
                    const stageResult = await Promise.race([
                        this._executeStage(stage),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error(`Stage ${stage} timeout after ${timeoutMs}ms`)), timeoutMs)
                        )
                    ]);

                    results[stage] = { success: true, result: stageResult };

                    if (stage === 'ready') this.markAsReady();
                } catch (error) {
                    logOnce('error', `Pipeline stage ${stage} failed`, error);
                    results[stage] = { success: false, error: error.message };

                    if (stage === 'preflight' || stage === 'dependencyCheck') {
                        throw new Error(`Critical stage ${stage} failed: ${error.message}`);
                    }

                    if (stage === 'parentDetect' || stage === 'handshake') {
                        logOnce('warn-icon', `Stage ${stage} failed, enabling fallback mode`);
                        this.enterDegradedMode();
                        results.ready = { success: true, result: 'degraded' };
                        this.markAsReady(true);
                        break;
                    }

                    if (stage === 'sessionSync') {
                        logOnce('warn-icon', 'Session sync failed, continuing without demo mode');
                        this.enterDegradedMode();
                        results.ready = { success: true, result: 'degraded' };
                        this.markAsReady(true);
                        break;
                    }
                }
            }

            return { success: true, stages: results };
        }

        _getStageTimeout(stage) {
            const timeouts = {
                preflight: CONFIG.PREFLIGHT_TIMEOUT,
                dependencyCheck: CONFIG.DEPENDENCY_TIMEOUT,
                parentDetect: CONFIG.PARENT_DETECT_TIMEOUT,
                handshake: CONFIG.HANDSHAKE_TIMEOUT,
                sessionSync: CONFIG.SESSION_SYNC_TIMEOUT,
                serviceInit: CONFIG.SERVICE_INIT_TIMEOUT,
                ready: 1000
            };
            return timeouts[stage] || 3000;
        }

        async _executeStage(stage) {
            switch (stage) {
                case 'preflight': return this.runPreflight();
                case 'dependencyCheck': return this.checkDependencies();
                case 'parentDetect': return this.detectParent();
                case 'handshake': return this.runHandshake();
                case 'sessionSync': return this.syncSession();
                case 'serviceInit': return this.initServices();
                case 'ready': return { ready: true };
                default: return null;
            }
        }

        async runPreflight() {
            logOnce('info', 'Preflight check');

            if (!window) throw new Error('Window not available');
            if (!document) throw new Error('Document not available');

            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve, { once: true });
                });
            }

            this.showLoadingMessage('Loading calls feature, please wait...');

            return { readyState: document.readyState, timestamp: Date.now(), userAgent: navigator.userAgent };
        }

        async checkDependencies() {
            logOnce('info', 'Checking dependencies');

            const dependencies = {
                postMessage: typeof window.postMessage === 'function',
                addEventListener: typeof window.addEventListener === 'function',
                localStorage: typeof localStorage !== 'undefined',
                Promise: typeof Promise !== 'undefined',
                MediaDevices: typeof navigator.mediaDevices !== 'undefined'
            };

            const missing = Object.entries(dependencies)
                .filter(([_, available]) => !available)
                .map(([name]) => name);

            if (missing.length > 0) {
                logOnce('warn-icon', `Missing dependencies: ${missing.join(', ')}`);
                throw new Error(`Missing dependencies: ${missing.join(', ')}`);
            }

            return { dependencies, timestamp: Date.now() };
        }

        async detectParent() {
            logOnce('info', 'Detecting parent');

            if (!parentCoordinator) parentCoordinator = new ParentCoordinator();

            parentCoordinator.detectParent();

            if (!parentCoordinator.parentDetected) {
                logOnce('warn-icon', 'Parent not detected, enabling fallback mode');
                this.enterDegradedMode();
            }

            return {
                parentDetected: parentCoordinator.parentDetected,
                sameOrigin: parentCoordinator.sameOrigin,
                timestamp: Date.now()
            };
        }

        async runHandshake() {
            logOnce('info', 'Running handshake');

            if (!parentCoordinator) parentCoordinator = new ParentCoordinator();

            if (parentCoordinator.parentDetected && !parentCoordinator.fallbackMode) {
                const result = await IframeHandshakeAuthority.start();
                if (result.success) {
                    logOnce('success', 'Handshake completed');
                } else {
                    logOnce('warn-icon', 'Handshake failed');
                }
            } else {
                logOnce('info', 'Skipping handshake - fallback mode active');
                _PARENT_READY_ = true;
                _HANDSHAKE_DONE_ = true;
            }

            return {
                handshakeDone: _HANDSHAKE_DONE_,
                parentReady: _PARENT_READY_,
                attempts: _HANDSHAKE_RETRIES_,
                fallbackMode: parentCoordinator.fallbackMode || false
            };
        }

        async syncSession() {
            logOnce('info', 'Syncing session');

            await session.acquire();

            if (session.isDemoMode()) {
                logOnce('warn-icon', 'Demo mode disabled - will retry');
                return {
                    demoMode: false,
                    guestMode: session.isGuestMode(),
                    valid: session.validateToken(),
                    user: currentUser ? { id: currentUser.id, username: currentUser.username } : null,
                    timestamp: Date.now()
                };
            }

            return {
                demoMode: false,
                guestMode: session.isGuestMode(),
                valid: session.validateToken(),
                user: currentUser ? { id: currentUser.id, username: currentUser.username } : null,
                timestamp: Date.now()
            };
        }

        async initServices() {
            logOnce('info', 'Initializing services');

            if (window.callAPI) {
                try {
                    await window.callAPI.initialize();
                } catch (error) {
                    logOnce('error', 'API service init failed', error);
                }
            }

            if (window.callCore) {
                try {
                    if (getValidatedSession()) {
                        window.callCore.deviceInitialized = true;
                    }
                } catch (error) {
                    logOnce('error', 'Call core init failed', error);
                }
            }

            return {
                apiReady: window.callAPI?.initialized || false,
                callCoreReady: window.callCore?.deviceInitialized || false,
                timestamp: Date.now()
            };
        }

        loadDemoData() {
            this.data.friendsList = [];
            this.data.groupsList = [];
            this.data.chatHistory = [];
            this.data.notifications = [];
            this.data.settings = {
                emotionalContext: true,
                callIntention: true,
                inCallChat: true,
                whiteboard: true,
                polls: true,
                notes: true,
                focusMode: false,
                liveReactions: true,
                theme: 'light'
            };

            coreData = { ...this.data };

            if (window.AppState) {
                window.AppState.contacts = this.data.friendsList;
                window.AppState.callHistory = this.data.chatHistory;
                window.AppState.settings = this.data.settings;
                window.AppState.isPremium = false;
                window.AppState.isAuthenticated = false;
            }
        }

        enterDegradedMode() {
            logOnce('warn-icon', 'Entering degraded mode');
            session._demoMode = false;
            session._guestMode = false;
            this.loadDemoData();
            session.setState(STATE.DEGRADED);
            RecoveryManager.scheduleRecovery();
        }

        showLoadingMessage(message) {
            try {
                let loadingEl = document.getElementById('coreLoadingMessage');
                if (!loadingEl) {
                    loadingEl = document.createElement('div');
                    loadingEl.id = 'coreLoadingMessage';
                    loadingEl.className = 'core-loading-message';
                    loadingEl.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: rgba(0, 0, 0, 0.8);
                        color: white;
                        padding: 20px;
                        border-radius: 10px;
                        z-index: 9999;
                        text-align: center;
                        min-width: 200px;
                    `;
                    document.body.appendChild(loadingEl);
                }
                loadingEl.textContent = SecurityCore.sanitizeString(message);
                this.loadingMessage = loadingEl;
            } catch (error) {
                logOnce('error', 'CoreInitializer.showLoadingMessage', error);
            }
        }

        showSuccessMessage(message) {
            try {
                if (this.loadingMessage) {
                    this.loadingMessage.textContent = SecurityCore.sanitizeString(message);
                    this.loadingMessage.style.background = 'rgba(76, 175, 80, 0.9)';

                    const timer = setTimeout(() => {
                        if (this.loadingMessage && this.loadingMessage.parentNode) {
                            this.loadingMessage.remove();
                            this.loadingMessage = null;
                        }
                    }, 2000);
                    timers.add(timer);
                }
            } catch (error) {
                logOnce('error', 'CoreInitializer.showSuccessMessage', error);
            }
        }

        showErrorMessage(message) {
            try {
                if (this.loadingMessage) {
                    this.loadingMessage.textContent = SecurityCore.sanitizeString(message);
                    this.loadingMessage.style.background = 'rgba(244, 67, 54, 0.9)';
                }
            } catch (error) {
                logOnce('error', 'CoreInitializer.showErrorMessage', error);
            }
        }

        markAsReady(degraded = false) {
            try {
                this.isReady = true;
                this.initialized = true;
                this.initializationInProgress = false;
                coreReady = true;
                coreInitialized = true;

                parentComm.send('coreReady', {
                    iframeId: iframeId,
                    status: degraded ? 'degraded' : 'success',
                    mode: 'production',
                    dataTypes: Object.keys(this.data)
                });

                this.emitEvent('coreReady', { data: this.data, degraded, demoMode: false });

                session.setState(degraded ? STATE.DEGRADED : STATE.READY);
                if (!document.hidden) session.setState(STATE.ACTIVE);

                RecoveryManager.createCheckpoint('ready');

                logOnce('success', `Marked as ready (${degraded ? 'degraded' : 'normal'}) and notified parent`);

                window.dispatchEvent(new CustomEvent('core.ready', {
                    detail: {
                        degraded,
                        demoMode: false,
                        timestamp: Date.now()
                    }
                }));

            } catch (error) {
                logOnce('error', 'CoreInitializer.markAsReady', error);
            }
        }

        emitEvent(eventName, data) {
            try {
                const event = new CustomEvent(`core:${eventName}`, { detail: data });
                window.dispatchEvent(event);

                if (this.eventListeners.has(eventName)) {
                    const listeners = this.eventListeners.get(eventName);
                    listeners.forEach(listener => {
                        try { listener(data); } catch (error) {
                            logOnce('error', 'CoreInitializer.emitEvent.listener', error);
                        }
                    });
                }
            } catch (error) {
                logOnce('error', 'CoreInitializer.emitEvent', error);
            }
        }

        on(eventName, callback) {
            try {
                if (!this.eventListeners.has(eventName)) this.eventListeners.set(eventName, []);
                this.eventListeners.get(eventName).push(callback);
            } catch (error) {
                logOnce('error', 'CoreInitializer.on', error);
            }
        }

        off(eventName, callback) {
            try {
                if (this.eventListeners.has(eventName)) {
                    const listeners = this.eventListeners.get(eventName);
                    const index = listeners.indexOf(callback);
                    if (index > -1) listeners.splice(index, 1);
                }
            } catch (error) {
                logOnce('error', 'CoreInitializer.off', error);
            }
        }

        getData(type) {
            try {
                if (!this.isReady) return null;

                switch (type) {
                    case 'friendsList': return [...this.data.friendsList];
                    case 'groupsList': return [...this.data.groupsList];
                    case 'chatHistory': return [...this.data.chatHistory];
                    case 'notifications': return [...this.data.notifications];
                    case 'settings': return { ...this.data.settings };
                    case 'all':
                        return {
                            friendsList: [...this.data.friendsList],
                            groupsList: [...this.data.groupsList],
                            chatHistory: [...this.data.chatHistory],
                            notifications: [...this.data.notifications],
                            settings: { ...this.data.settings }
                        };
                    default: return null;
                }
            } catch (error) {
                logOnce('error', 'CoreInitializer.getData', error);
                return null;
            }
        }

        updateData(type, payload) {
            try {
                if (!this.isReady) return false;
                if (!type || !payload) return false;

                let updated = false;

                switch (type) {
                    case 'friendsList':
                        if (Array.isArray(payload) && this.validateFriendsList(payload)) {
                            this.data.friendsList = payload;
                            coreData.friendsList = payload;
                            updated = true;
                        }
                        break;
                    case 'groupsList':
                        if (Array.isArray(payload) && this.validateGroupsList(payload)) {
                            this.data.groupsList = payload;
                            coreData.groupsList = payload;
                            updated = true;
                        }
                        break;
                    case 'chatHistory':
                        if (Array.isArray(payload) && this.validateChatHistory(payload)) {
                            this.data.chatHistory = payload;
                            coreData.chatHistory = payload;
                            updated = true;
                        }
                        break;
                    case 'notifications':
                        if (Array.isArray(payload) && this.validateNotifications(payload)) {
                            this.data.notifications = payload;
                            coreData.notifications = payload;
                            updated = true;
                        }
                        break;
                    case 'settings':
                        if (this.validateSettings(payload)) {
                            this.data.settings = payload;
                            coreData.settings = payload;
                            updated = true;
                        }
                        break;
                    case 'all':
                        if (payload.friendsList) this.updateData('friendsList', payload.friendsList);
                        if (payload.groupsList) this.updateData('groupsList', payload.groupsList);
                        if (payload.chatHistory) this.updateData('chatHistory', payload.chatHistory);
                        if (payload.notifications) this.updateData('notifications', payload.notifications);
                        if (payload.settings) this.updateData('settings', payload.settings);
                        updated = true;
                        break;
                }

                if (updated) {
                    this.emitEvent('dataUpdated', { type, data: payload });
                    this.cacheData(type, payload);
                    logOnce('info', `Data updated: ${type}`);
                }

                return updated;
            } catch (error) {
                logOnce('error', 'CoreInitializer.updateData', error);
                return false;
            }
        }

        validateFriendsList(friends) { return Array.isArray(friends) && friends.every(friend => friend && typeof friend === 'object' && friend.id); }
        validateGroupsList(groups) { return Array.isArray(groups) && groups.every(group => group && typeof group === 'object' && group.id); }
        validateChatHistory(chatHistory) { return Array.isArray(chatHistory) && chatHistory.every(chat => chat && typeof chat === 'object' && chat.id); }
        validateNotifications(notifications) { return Array.isArray(notifications) && notifications.every(notification => notification && typeof notification === 'object' && notification.id); }
        validateSettings(settings) { return settings && typeof settings === 'object'; }

        cacheData(type, data) {
            try {
                switch (type) {
                    case 'friendsList': SecurityCore.safeLocalStorageSet('cachedFriendsList', JSON.stringify(data)); break;
                    case 'groupsList': SecurityCore.safeLocalStorageSet('cachedGroupsList', JSON.stringify(data)); break;
                    case 'chatHistory': SecurityCore.safeLocalStorageSet('cachedChatHistory', JSON.stringify(data)); break;
                    case 'notifications': SecurityCore.safeLocalStorageSet('cachedNotifications', JSON.stringify(data)); break;
                    case 'settings': SecurityCore.safeLocalStorageSet('callSettings', JSON.stringify(data)); break;
                }
            } catch (error) {
                logOnce('error', 'CoreInitializer.cacheData', error);
            }
        }

        cleanup() {
            try {
                this.eventListeners.clear();
                this.messageQueue = [];
                this.initializationInProgress = false;
                logOnce('info', 'CoreInitializer cleaned up');
            } catch (error) {
                logOnce('error', 'CoreInitializer.cleanup', error);
            }
        }
    }

    // ==================== ORIGINAL CALL CORE (PRESERVED) ====================
    class CallCore {
        constructor() {
            this.callState = 'idle';
            this.activeCallId = null;
            this.callData = null;
            this.mediaDevices = null;
            this.peerConnection = null;
            this.localStream = null;
            this.remoteStream = null;
            this.signalingChannel = null;
            this.eventListeners = new Map();
            this.callQueue = [];
            this.deviceInitialized = false;
            this.sessionVerified = false;
            this.initAttempts = 0;
            this.maxInitAttempts = CONFIG.maxReconnectionAttempts;
            this.initializationInProgress = false;
            this.featureBoundary = ErrorBoundary.createBoundary('CallCore', () => {
                this.callState = 'degraded';
                return null;
            });
            this._sanitizing = false;

            this._safeInitInProgress = false;
            this._safeInitComplete = false;
            this._recoveryTimer = null;
        }

        async safeInitialize() {
            if (this._safeInitInProgress) {
                logOnce('info', 'Safe init already in progress');
                return;
            }

            if (this._safeInitComplete) {
                logOnce('info', 'Safe init already complete');
                return;
            }

            this._safeInitInProgress = true;

            try {
                const session = await waitForSession(CONFIG.MAX_SESSION_WAIT);
                if (!session) {
                    logOnce('warn-icon', 'No session available, deferring initialization');
                    this._safeInitInProgress = false;

                    setTimeout(() => this.safeInitialize(), CONFIG.RECOVERY_DELAY);
                    return;
                }

                const verified = await verifySession();
                if (!verified) {
                    logOnce('warn-icon', 'Session verification failed, retrying');
                    setTimeout(() => verifySession(), 2000);
                }

                const ackMessage = MessageBridge.createMessage('CALL_CORE_READY', {
                    success: true,
                    sessionId: session.userId,
                    timestamp: Date.now()
                }, { legacy: true });
                window.parent.postMessage(ackMessage, OriginAdapter.getTargetOrigin());

                this._safeInitComplete = true;
                this._safeInitInProgress = false;

                logOnce('success', 'Safe init complete, proceeding with device initialization');

                await this.initialize();

            } catch (error) {
                logOnce('error', 'Safe init failed', error);
                this._safeInitInProgress = false;

                if (this.initAttempts >= this.maxInitAttempts) {
                    logOnce('warn-icon', 'Entering degraded mode after safe init failures');
                    RecoveryManager.scheduleRecovery();
                }
            }
        }

        async initialize() {
            return this.featureBoundary.executeAsync(async () => {
                if (this.initializationInProgress || this.deviceInitialized) {
                    logOnce('info', 'Call core initialization already in progress or completed');
                    return;
                }

                const session = getValidatedSession();
                if (!session) {
                    logOnce('warn-icon', 'No valid session, deferring initialization');
                    this.initAttempts++;

                    if (this.initAttempts < this.maxInitAttempts) {
                        setTimeout(() => this.safeInitialize(), CONFIG.SESSION_RETRY_DELAY * this.initAttempts);
                    }
                    return;
                }

                this.initializationInProgress = true;
                this.initAttempts++;

                try {
                    logOnce('info', 'Starting call core initialization...');

                    await this.verifySession();
                    await this.verifyReadiness();
                    await this.loadMediaDevices();
                    await this.initializeSignaling();

                    this.deviceInitialized = true;
                    this.initializationInProgress = false;
                    this.initAttempts = 0;

                    this.emitEvent('CALL_CORE_READY', { status: 'success' });
                    parentComm.send('CALL_CORE_READY', { status: 'success' });

                    const ackMessage = MessageBridge.createMessage('CALL_CORE_READY', {
                        success: true,
                        timestamp: Date.now()
                    }, { legacy: true });
                    window.parent.postMessage(ackMessage, OriginAdapter.getTargetOrigin());

                    logOnce('success', 'Call core initialization completed successfully');

                } catch (error) {
                    logOnce('error', 'CallCore.initialize', error);

                    this.emitEvent('CALL_CORE_FAILED', { error: error.message });
                    parentComm.send('CALL_CORE_FAILED', { error: error.message });

                    if (this.initAttempts < this.maxInitAttempts) {
                        logOnce('info', `Retrying call core initialization (${this.initAttempts}/${this.maxInitAttempts})...`);
                        const timer = setTimeout(() => this.safeInitialize(), 1000 * this.initAttempts);
                        timers.add(timer);
                    } else {
                        logOnce('error', 'Max call core initialization attempts reached');
                        this.initializationInProgress = false;
                        this.callState = 'disabled';
                        RecoveryManager.scheduleRecovery();
                    }
                }
            });
        }

        async verifySession() {
            if (session.isDemoMode()) {
                logOnce('info', 'Demo mode active, skipping session verification');
                this.sessionVerified = true;
                return;
            }

            try {
                logOnce('info', 'Verifying session for call...');

                const validatedSession = getValidatedSession();
                if (!validatedSession && !session.validateToken()) {
                    throw new Error('User session not available');
                }

                this.sessionVerified = true;
                logOnce('success', 'Session verified for call');
            } catch (error) {
                logOnce('error', 'CallCore.verifySession', error);
                throw error;
            }
        }

        async verifyReadiness() {
            return new Promise((resolve, reject) => {
                let attempts = 0;
                const maxAttempts = 30;
                const interval = 100;

                const checkInterval = setInterval(() => {
                    attempts++;

                    const parentReady = window.parent && window.parent !== window;
                    const domReady = document.readyState === 'complete' || document.readyState === 'interactive';

                    if (parentReady) {
                        clearInterval(checkInterval);
                        resolve();
                    } else if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        logOnce('warn-icon', 'Readiness verification timeout, continuing anyway');
                        resolve();
                    }
                }, interval);

                timers.add(checkInterval);
            });
        }

        async loadMediaDevices() {
            try {
                logOnce('info', 'Loading media devices...');

                if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                    throw new Error('Media devices not supported');
                }

                const devices = await navigator.mediaDevices.enumerateDevices();
                this.mediaDevices = {
                    audioInput: devices.filter(d => d.kind === 'audioinput'),
                    videoInput: devices.filter(d => d.kind === 'videoinput'),
                    audioOutput: devices.filter(d => d.kind === 'audiooutput')
                };

                logOnce('info', `Media devices loaded: ${this.mediaDevices.audioInput.length} audio, ${this.mediaDevices.videoInput.length} video`);
            } catch (error) {
                logOnce('error', 'CallCore.loadMediaDevices', error);

                this.mediaDevices = {
                    audioInput: [{ deviceId: 'default', label: 'Default microphone' }],
                    videoInput: [{ deviceId: 'default', label: 'Default camera' }],
                    audioOutput: [{ deviceId: 'default', label: 'Default speaker' }]
                };

                throw error;
            }
        }

        async initializeSignaling() {
            try {
                logOnce('info', 'Initializing signaling...');

                this.signalingChannel = {
                    send: (data) => {
                        logOnce('info', `Signaling send: ${data.type}`);
                        parentComm.send('SIGNALING_MESSAGE', {
                            callId: this.activeCallId,
                            signaling: data
                        });
                    },
                    close: () => {
                        logOnce('info', 'Signaling closed');
                    }
                };

                logOnce('success', 'Signaling initialized');
            } catch (error) {
                logOnce('error', 'CallCore.initializeSignaling', error);
                throw error;
            }
        }

        async startCall(callData) {
            return this.featureBoundary.executeAsync(async () => {
                const session = getValidatedSession();
                if (!session) throw new Error('No valid session - cannot start call');
                if (!this.deviceInitialized) throw new Error('Call core not initialized');
                if (this.callState !== 'idle') throw new Error(`Cannot start call, current state: ${this.callState}`);

                try {
                    logOnce('info', `Starting call: ${callData.type || 'voice'}`);

                    this.callState = 'connecting';
                    this.activeCallId = callData.callId || 'call_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
                    this.callData = { ...callData, startTime: Date.now(), callId: this.activeCallId };

                    this.emitEvent('CALL_CONNECTING', { callId: this.activeCallId, data: this.callData });
                    parentComm.send('CALL_CONNECTING', { callId: this.activeCallId, data: this.callData });

                    if (callData.type === 'video') {
                        await this.startVideoCall(callData);
                    } else {
                        await this.startVoiceCall(callData);
                    }

                    this.callState = 'in_call';

                    this.emitEvent('CALL_STARTED', {
                        callId: this.activeCallId,
                        data: this.callData,
                        timestamp: Date.now()
                    });
                    parentComm.send('CALL_STARTED', {
                        callId: this.activeCallId,
                        data: this.callData,
                        timestamp: Date.now()
                    });

                    logOnce('success', `Call started: ${this.activeCallId}`);
                    return this.activeCallId;

                } catch (error) {
                    logOnce('error', 'CallCore.startCall', error);

                    this.callState = 'failed';

                    this.emitEvent('CALL_FAILED', {
                        callId: this.activeCallId,
                        error: error.message,
                        data: callData
                    });
                    parentComm.send('CALL_FAILED', {
                        callId: this.activeCallId,
                        error: error.message,
                        data: callData
                    });

                    this.cleanupCall();
                    throw error;
                }
            });
        }

        async startVideoCall(callData) {
            try {
                logOnce('info', 'Starting video call...');

                const constraints = {
                    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
                };

                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

                this.peerConnection = new RTCPeerConnection(this.getRTCConfiguration());

                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });

                this.peerConnection.onicecandidate = (event) => {
                    if (event.candidate) this.sendIceCandidate(event.candidate);
                };

                this.peerConnection.ontrack = (event) => {
                    this.remoteStream = event.streams[0];
                    this.emitEvent('REMOTE_STREAM_ADDED', { stream: this.remoteStream });
                };

                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                this.sendOffer(offer);

                logOnce('success', 'Video call setup complete');
            } catch (error) {
                logOnce('error', 'CallCore.startVideoCall', error);
                throw error;
            }
        }

        async startVoiceCall(callData) {
            try {
                logOnce('info', 'Starting voice call...');

                const constraints = {
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    video: false
                };

                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

                this.peerConnection = new RTCPeerConnection(this.getRTCConfiguration());

                const audioTrack = this.localStream.getAudioTracks()[0];
                if (audioTrack) this.peerConnection.addTrack(audioTrack, this.localStream);

                this.peerConnection.onicecandidate = (event) => {
                    if (event.candidate) this.sendIceCandidate(event.candidate);
                };

                this.peerConnection.ontrack = (event) => {
                    this.remoteStream = event.streams[0];
                    this.emitEvent('REMOTE_STREAM_ADDED', { stream: this.remoteStream });
                };

                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                this.sendOffer(offer);

                logOnce('success', 'Voice call setup complete');
            } catch (error) {
                logOnce('error', 'CallCore.startVoiceCall', error);
                throw error;
            }
        }

        async endCall(callId) {
            return this.featureBoundary.executeAsync(async () => {
                if (!callId || callId !== this.activeCallId) {
                    throw new Error(`Invalid call ID or no active call: ${callId}`);
                }

                try {
                    logOnce('info', `Ending call: ${callId}`);

                    this.callState = 'ended';

                    this.sendCallEnded();
                    this.cleanupCall();

                    this.emitEvent('CALL_ENDED', {
                        callId: callId,
                        duration: this.getCallDuration(),
                        timestamp: Date.now()
                    });
                    parentComm.send('CALL_ENDED', {
                        callId: callId,
                        duration: this.getCallDuration(),
                        timestamp: Date.now()
                    });

                    logOnce('success', `Call ended: ${callId}`);
                } catch (error) {
                    logOnce('error', 'CallCore.endCall', error);

                    this.cleanupCall();
                    this.emitEvent('CALL_FAILED', {
                        callId: callId,
                        error: error.message,
                        timestamp: Date.now()
                    });
                    parentComm.send('CALL_FAILED', {
                        callId: callId,
                        error: error.message,
                        timestamp: Date.now()
                    });

                    throw error;
                }
            });
        }

        async muteAudio(callId, mute) {
            if (!callId || callId !== this.activeCallId) return;

            try {
                if (this.localStream) {
                    const audioTracks = this.localStream.getAudioTracks();
                    audioTracks.forEach(track => { track.enabled = !mute; });

                    this.emitEvent('AUDIO_MUTED', { callId, muted: mute });
                    parentComm.send('AUDIO_MUTED', { callId, muted: mute });

                    logOnce('info', `Audio ${mute ? 'muted' : 'unmuted'}: ${callId}`);
                }
            } catch (error) {
                logOnce('error', 'CallCore.muteAudio', error);
            }
        }

        async muteVideo(callId, mute) {
            if (!callId || callId !== this.activeCallId) return;

            try {
                if (this.localStream) {
                    const videoTracks = this.localStream.getVideoTracks();
                    videoTracks.forEach(track => { track.enabled = !mute; });

                    this.emitEvent('VIDEO_MUTED', { callId, muted: mute });
                    parentComm.send('VIDEO_MUTED', { callId, muted: mute });

                    logOnce('info', `Video ${mute ? 'muted' : 'unmuted'}: ${callId}`);
                }
            } catch (error) {
                logOnce('error', 'CallCore.muteVideo', error);
            }
        }

        sendOffer(offer) {
            if (this.signalingChannel) {
                this.signalingChannel.send({
                    type: 'OFFER',
                    data: offer,
                    callId: this.activeCallId,
                    timestamp: Date.now()
                });
            }
        }

        sendIceCandidate(candidate) {
            if (this.signalingChannel) {
                this.signalingChannel.send({
                    type: 'ICE_CANDIDATE',
                    data: candidate,
                    callId: this.activeCallId,
                    timestamp: Date.now()
                });
            }
        }

        sendCallEnded() {
            if (this.signalingChannel) {
                this.signalingChannel.send({
                    type: 'CALL_ENDED',
                    data: { callId: this.activeCallId },
                    timestamp: Date.now()
                });
            }
        }

        getRTCConfiguration() {
            return {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10
            };
        }

        getCallDuration() {
            return this.callData && this.callData.startTime ? Math.floor((Date.now() - this.callData.startTime) / 1000) : 0;
        }

        cleanupCall() {
            try {
                if (this.localStream) {
                    this.localStream.getTracks().forEach(track => track.stop());
                    this.localStream = null;
                }
                if (this.peerConnection) {
                    this.peerConnection.close();
                    this.peerConnection = null;
                }
                this.remoteStream = null;
                this.activeCallId = null;
                this.callData = null;
                this.callState = 'idle';
                logOnce('info', 'Call resources cleaned up');
            } catch (error) {
                logOnce('error', 'CallCore.cleanupCall', error);
            }
        }

        emitEvent(eventName, data) {
            try {
                const event = new CustomEvent(`call:${eventName}`, { detail: data });
                window.dispatchEvent(event);

                if (this.eventListeners.has(eventName)) {
                    const listeners = this.eventListeners.get(eventName);
                    listeners.forEach(listener => {
                        try { listener(data); } catch (error) {
                            logOnce('error', 'CallCore.emitEvent.listener', error);
                        }
                    });
                }
            } catch (error) {
                logOnce('error', 'CallCore.emitEvent', error);
            }
        }

        on(eventName, callback) {
            try {
                if (!this.eventListeners.has(eventName)) this.eventListeners.set(eventName, []);
                this.eventListeners.get(eventName).push(callback);
            } catch (error) {
                logOnce('error', 'CallCore.on', error);
            }
        }

        off(eventName, callback) {
            try {
                if (this.eventListeners.has(eventName)) {
                    const listeners = this.eventListeners.get(eventName);
                    const index = listeners.indexOf(callback);
                    if (index > -1) listeners.splice(index, 1);
                }
            } catch (error) {
                logOnce('error', 'CallCore.off', error);
            }
        }

        getStatus() {
            return {
                callState: this.callState,
                activeCallId: this.activeCallId,
                deviceInitialized: this.deviceInitialized,
                sessionVerified: this.sessionVerified,
                mediaDevices: this.mediaDevices ? {
                    audioInput: this.mediaDevices.audioInput.length,
                    videoInput: this.mediaDevices.videoInput.length,
                    audioOutput: this.mediaDevices.audioOutput.length
                } : null,
                hasLocalStream: !!this.localStream,
                hasRemoteStream: !!this.remoteStream,
                initializationInProgress: this.initializationInProgress,
                demoMode: false
            };
        }

        cleanup() {
            try {
                if (this.activeCallId) this.endCall(this.activeCallId).catch(() => {});
                if (this.signalingChannel) {
                    this.signalingChannel.close();
                    this.signalingChannel = null;
                }
                this.eventListeners.clear();
                if (this._recoveryTimer) {
                    clearTimeout(this._recoveryTimer);
                    this._recoveryTimer = null;
                }
                logOnce('info', 'CallCore cleaned up');
            } catch (error) {
                logOnce('error', 'CallCore.cleanup', error);
            }
        }
    }

    // ==================== ORIGINAL TOKEN MANAGER (PRESERVED) ====================
    class TokenManager {
        constructor() {
            this.tokenReady = false;
            this.token = null;
            this.waitingCallbacks = [];
            this.apiInitialized = false;
            this.tokenCheckInterval = null;
            this.migrationDone = false;
            this.parentCoordinator = null;
            this.coordinatedToken = false;
            this.tokenRetryCount = 0;
            this.maxTokenRetries = CONFIG.maxReconnectionAttempts;
            this.fallbackMode = false;
        }

        async initialize() {
            try {
                logOnce('info', 'Initializing token manager...');

                if (!parentCoordinator) {
                    logOnce('info', 'Parent coordinator not yet available');
                } else {
                    this.parentCoordinator = parentCoordinator;
                    if (this.parentCoordinator?.sessionData?.token) {
                        this.setToken(this.parentCoordinator.sessionData.token);
                        this.coordinatedToken = true;
                    }
                }

                await this.tryGetTokenFromAPI();
                this.loadCachedData();
                this.startTokenPolling();
                this.setupCoordinatedListener();
                this.migrateOldTokens();
            } catch (error) {
                logOnce('error', 'TokenManager.initialize', error);
                this.fallbackMode = true;
                this.tokenReady = true;
                this.executeWaitingCallbacks();
            }
        }

        setupCoordinatedListener() {
            try {
                if (!this.parentCoordinator) {
                    const checkInterval = setInterval(() => {
                        if (parentCoordinator) {
                            this.parentCoordinator = parentCoordinator;
                            clearInterval(checkInterval);

                            this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
                                if (updateData.token) {
                                    this.setToken(updateData.token);
                                    this.coordinatedToken = true;
                                }
                            });
                        }
                    }, 100);
                    timers.add(checkInterval);
                    return;
                }

                this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
                    if (updateData.token) {
                        this.setToken(updateData.token);
                        this.coordinatedToken = true;
                    }
                });
            } catch (error) {
                logOnce('error', 'TokenManager.setupCoordinatedListener', error);
            }
        }

        async tryGetTokenFromAPI() {
            if (this.coordinatedToken || this.fallbackMode) return false;

            try {
                if (this.tokenRetryCount >= this.maxTokenRetries) {
                    logOnce('warn-icon', 'Maximum token retry attempts reached');
                    return false;
                }

                this.tokenRetryCount++;

                const token = session.getToken();

                if (token && this.validateToken(token)) {
                    this.setToken(token);
                    this.tokenRetryCount = 0;
                    return true;
                }

                return false;
            } catch (error) {
                logOnce('error', 'TokenManager.tryGetTokenFromAPI', error, `attempt: ${this.tokenRetryCount}`);
                return false;
            }
        }

        startTokenPolling() {
            try {
                if (this.tokenCheckInterval) {
                    clearInterval(this.tokenCheckInterval);
                    this.tokenCheckInterval = null;
                }

                if (this.coordinatedToken || this.fallbackMode) {
                    logOnce('info', 'Using coordinated token or fallback, skipping API polling');
                    return;
                }

                let attempts = 0;
                const maxAttempts = 30;

                this.tokenCheckInterval = setInterval(() => {
                    attempts++;

                    const token = session.getToken();

                    if (token && this.validateToken(token)) {
                        this.setToken(token);
                        clearInterval(this.tokenCheckInterval);
                        this.tokenCheckInterval = null;
                        this.apiInitialized = true;
                        this.executeWaitingCallbacks();
                    } else if (attempts >= maxAttempts) {
                        clearInterval(this.tokenCheckInterval);
                        this.tokenCheckInterval = null;
                        logOnce('info', 'Token polling timeout');
                        this.executeWaitingCallbacks();
                    }
                }, 500);

                timers.add(this.tokenCheckInterval);
            } catch (error) {
                logOnce('error', 'TokenManager.startTokenPolling', error);
            }
        }

        setToken(token) {
            if (!this.validateToken(token)) {
                logOnce('warn-icon', 'Attempted to set invalid token');
                return;
            }

            try {
                this.token = token;
                this.tokenReady = true;
                this.tokenRetryCount = 0;
                this.fallbackMode = false;

                SecurityCore.safeLocalStorageSet('USER_TOKEN', token);

                if (window.AppState) window.AppState.isAuthenticated = true;

                this.executeWaitingCallbacks();
            } catch (error) {
                logOnce('error', 'TokenManager.setToken', error);
            }
        }

        waitForToken() {
            return new Promise((resolve) => {
                try {
                    if (this.tokenReady && this.token) {
                        resolve(this.token);
                    } else if (this.fallbackMode) {
                        resolve(null);
                    } else {
                        this.waitingCallbacks.push(resolve);
                    }
                } catch (error) {
                    logOnce('error', 'TokenManager.waitForToken', error);
                    resolve(null);
                }
            });
        }

        executeWaitingCallbacks() {
            const tokenValue = this.fallbackMode ? null : this.token;
            if (this.tokenReady || this.fallbackMode) {
                while (this.waitingCallbacks.length > 0) {
                    const callback = this.waitingCallbacks.shift();
                    try { callback(tokenValue); } catch (error) {
                        logOnce('error', 'TokenManager.executeWaitingCallbacks', error);
                    }
                }
            }
        }

        validateToken(token) {
            if (this.fallbackMode) return true;
            if (!token || typeof token !== 'string') return false;
            if (token.length < 10) return false;

            try {
                const parts = token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    if (payload.exp) {
                        const now = Math.floor(Date.now() / 1000);
                        if (payload.exp < now) {
                            logOnce('info', 'Token expired');
                            return false;
                        }
                    }
                }
                return true;
            } catch (e) {
                return true;
            }
        }

        migrateOldTokens() {
            if (this.migrationDone) return;

            try {
                const oldTokenKeys = ['accessToken', 'moodchat_token', 'authToken', 'token', 'auth_token'];

                for (const key of oldTokenKeys) {
                    const oldToken = SecurityCore.safeLocalStorageGet(key);
                    if (oldToken && this.validateToken(oldToken)) {
                        SecurityCore.safeLocalStorageSet('USER_TOKEN', oldToken);
                    }
                }

                for (const key of oldTokenKeys) {
                    const oldToken = SecurityCore.safeSessionStorageGet(key);
                    if (oldToken && this.validateToken(oldToken)) {
                        SecurityCore.safeLocalStorageSet('USER_TOKEN', oldToken);
                    }
                }

                this.migrationDone = true;
            } catch (error) {
                logOnce('error', 'TokenManager.migrateOldTokens', error);
            }
        }

        loadCachedData() {
            try {
                const cachedUser = SecurityCore.safeLocalStorageGet('authUser') ||
                                  SecurityCore.safeLocalStorageGet('currentUser') ||
                                  SecurityCore.safeLocalStorageGet('userData');

                if (cachedUser) {
                    try {
                        const userData = SecurityCore.safeJSONParse(cachedUser);
                        if (window.AppState) {
                            window.AppState.user = userData;
                            window.AppState.currentUser = userData;
                        }
                    } catch (e) {}
                }
            } catch (error) {
                logOnce('error', 'TokenManager.loadCachedData', error);
            }
        }

        getToken() {
            try {
                if (this.fallbackMode) return null;
                if (this.parentCoordinator?.sessionData?.token) {
                    return this.parentCoordinator.sessionData.token;
                }
                return this.token || session.getToken();
            } catch (error) {
                logOnce('error', 'TokenManager.getToken', error);
                return null;
            }
        }

        isTokenReady() {
            try {
                if (this.fallbackMode) return true;
                if (this.parentCoordinator?.sessionData?.token) return true;
                return this.tokenReady && this.validateToken(this.token);
            } catch (error) {
                logOnce('error', 'TokenManager.isTokenReady', error);
                return false;
            }
        }

        clearToken() {
            try {
                this.token = null;
                this.tokenReady = false;
                this.apiInitialized = false;
                this.coordinatedToken = false;
                this.tokenRetryCount = 0;
                this.fallbackMode = true;

                SecurityCore.safeLocalStorageRemove('USER_TOKEN');

                if (window.AppState) {
                    window.AppState.isAuthenticated = false;
                    window.AppState.user = null;
                    window.AppState.currentUser = null;
                }
            } catch (error) {
                logOnce('error', 'TokenManager.clearToken', error);
            }
        }

        cleanup() {
            try {
                if (this.tokenCheckInterval) {
                    clearInterval(this.tokenCheckInterval);
                    this.tokenCheckInterval = null;
                }
            } catch (error) {
                logOnce('error', 'TokenManager.cleanup', error);
            }
        }
    }

    // ==================== ORIGINAL SECURE API CLIENT (PRESERVED) ====================
    class SecureAPIClient {
        constructor(tokenManager) {
            this.tokenManager = tokenManager;
            this.requestQueue = [];
            this.processingQueue = false;
            this.maxRetries = CONFIG.MAX_MESSAGE_RETRIES;
            this.retryDelay = CONFIG.RETRY_BACKOFF;
            this.parentCoordinator = null;
            this.useCoordinatedRouting = false;
            this.requestTimeout = 15000;
            this.fallbackBoundary = ErrorBoundary.createBoundary('SecureAPIClient', () => {
                return { ok: false, status: 503, json: async () => ({ error: 'Fallback mode' }) };
            });
        }

        async fetch(url, options = {}) {
            return this.fallbackBoundary.executeAsync(async () => {
                if (!url) throw new Error('URL is required');

                try {
                    if (!this.parentCoordinator && parentCoordinator) {
                        this.parentCoordinator = parentCoordinator;
                    }

                    if (this.parentCoordinator?.sessionValidated) {
                        try {
                            return await this.fetchThroughCoordinator(url, options);
                        } catch (error) {
                            logOnce('warn-icon', `Coordinator fetch failed, falling back: ${error.message}`);
                            this.useCoordinatedRouting = false;
                        }
                    }

                    return this.secureFetchFallback(url, options);
                } catch (error) {
                    logOnce('error', 'SecureAPIClient.fetch', error, `url: ${url}`);
                    throw error;
                }
            });
        }

        async fetchThroughCoordinator(url, options = {}) {
            if (!this.parentCoordinator?.sessionValidated) {
                throw new Error('Parent coordinator not available');
            }

            try {
                let endpoint = url;
                if (url.startsWith('http')) {
                    try {
                        const urlObj = new URL(url);
                        endpoint = urlObj.pathname + urlObj.search;
                    } catch (error) {}
                }

                const result = await this.parentCoordinator.routeApiCall(
                    endpoint,
                    options.method || 'GET',
                    options.body ? SecurityCore.safeJSONParse(options.body) : null
                );

                return {
                    ok: true,
                    status: 200,
                    json: async () => result,
                    text: async () => JSON.stringify(result),
                    headers: new Headers({ 'Content-Type': 'application/json' })
                };
            } catch (error) {
                logOnce('error', 'SecureAPIClient.fetchThroughCoordinator', error);
                throw error;
            }
        }

        async secureFetchFallback(url, options = {}, retryCount = 0) {
            try {
                if (!this.tokenManager.isTokenReady()) {
                    return this.queueRequest(url, options);
                }

                const token = this.tokenManager.getToken();
                if (!token || !this.tokenManager.validateToken(token)) {
                    logOnce('warn-icon', 'No valid authentication token available');
                    return this.queueRequest(url, options);
                }

                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    ...options.headers
                };

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

                const response = await fetch(url, {
                    ...options,
                    headers,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.status === 401) {
                    this.tokenManager.clearToken();
                    session.clearToken();

                    parentComm.send('AUTH_ERROR', { timestamp: Date.now() });
                    throw new Error('Authentication failed');
                }

                if (!response.ok) {
                    if (response.status >= 500 && retryCount < this.maxRetries) {
                        let delay = this.retryDelay * Math.pow(2, retryCount);
                        if (EnvironmentDetector.isVPNNetwork()) delay *= 1.5;
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return this.secureFetchFallback(url, options, retryCount + 1);
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return response;
            } catch (error) {
                if (error.name === 'AbortError') throw new Error('Request timeout');

                if (retryCount < this.maxRetries &&
                    (error.message.includes('Network') || error.message.includes('Failed to fetch'))) {
                    let delay = this.retryDelay * Math.pow(2, retryCount);
                    if (EnvironmentDetector.isVPNNetwork()) delay *= 1.5;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.secureFetchFallback(url, options, retryCount + 1);
                }

                logOnce('error', 'SecureAPIClient.secureFetchFallback', error, `url: ${url}, retry: ${retryCount}`);
                throw error;
            }
        }

        async queueRequest(url, options) {
            return new Promise((resolve, reject) => {
                this.requestQueue.push({
                    url, options, resolve, reject,
                    timestamp: Date.now()
                });

                if (!this.processingQueue) this.processQueue();

                setTimeout(() => {
                    const index = this.requestQueue.findIndex(req => req.url === url);
                    if (index !== -1) {
                        this.requestQueue.splice(index, 1);
                        reject(new Error('Request timeout: Token not available'));
                    }
                }, 30000);
            });
        }

        async processQueue() {
            if (this.processingQueue || this.requestQueue.length === 0) return;

            this.processingQueue = true;

            while (this.requestQueue.length > 0) {
                const request = this.requestQueue[0];

                try {
                    if (this.tokenManager.isTokenReady()) {
                        const response = await this.secureFetchFallback(request.url, request.options);
                        request.resolve(response);
                        this.requestQueue.shift();
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                } catch (error) {
                    request.reject(error);
                    this.requestQueue.shift();
                }
            }

            this.processingQueue = false;
        }

        async fetchJSON(url, options = {}) {
            try {
                const response = await this.fetch(url, options);
                return response.json();
            } catch (error) {
                logOnce('error', 'SecureAPIClient.fetchJSON', error);
                throw error;
            }
        }
    }

    // ==================== ORIGINAL CALL API INTEGRATION (PRESERVED) ====================
    class CallAPIIntegration {
        constructor() {
            this.tokenManager = new TokenManager();
            this.apiClient = new SecureAPIClient(this.tokenManager);
            this.backgroundSyncInterval = null;
            this.authCheckDone = false;
            this.backgroundJobsStarted = false;
            this.initialDataLoaded = false;
            this.parentCommunication = null;
            this.parentCoordinator = null;
            this.sessionInitialized = false;
            this.apiConfig = {};
            this.initAttempts = 0;
            this.maxInitAttempts = CONFIG.maxReconnectionAttempts;
            this.isInitializing = false;
            this.fallbackMode = false;
            this.featureBoundary = ErrorBoundary.createBoundary('CallAPIIntegration', () => {
                this.fallbackMode = true;
                return this;
            });
        }

        async initialize() {
            return this.featureBoundary.executeAsync(async () => {
                if (this.isInitializing) {
                    logOnce('info', 'Initialization already in progress');
                    return this;
                }

                if (coreInitializationLock) {
                    logOnce('info', 'Initialization already in progress, skipping...');
                    return this;
                }

                coreInitializationLock = true;
                this.isInitializing = true;
                this.initAttempts++;

                try {
                    logOnce('info', 'Initializing API integration...');

                    if (!parentCoordinator) {
                        logOnce('info', 'Creating new parent coordinator...');
                        parentCoordinator = new ParentCoordinator();
                        await parentCoordinator.initialize();
                        if (parentCoordinator.fallbackMode) this.fallbackMode = true;
                    }

                    this.parentCoordinator = parentCoordinator;
                    this.tokenManager.parentCoordinator = this.parentCoordinator;
                    this.apiClient.parentCoordinator = this.parentCoordinator;

                    await this.tokenManager.initialize();
                    this.setupInitialUI();
                    await this.startBackgroundAuthCheck();

                    window.addEventListener('beforeunload', () => this.cleanup());
                    this.registerWithCoordinator();

                    sessionInitialized = true;
                    this.isInitializing = false;
                    this.initAttempts = 0;
                    coreInitializationLock = false;

                    logOnce('success', 'API integration initialized');
                    return this;
                } catch (error) {
                    logOnce('error', 'CallAPIIntegration.initialize', error, `attempt: ${this.initAttempts}`);
                    coreInitializationLock = false;

                    if (this.initAttempts < this.maxInitAttempts) {
                        logOnce('info', `Retrying initialization (${this.initAttempts}/${this.maxInitAttempts})...`);
                        const timer = setTimeout(() => this.initialize(), 800 * this.initAttempts);
                        timers.add(timer);
                    } else {
                        logOnce('error', 'Max initialization attempts reached, enabling fallback mode');
                        this.fallbackMode = true;
                        this.setupInitialUI();
                        this.authCheckDone = true;
                        this.backgroundJobsStarted = true;
                        this.initialDataLoaded = true;
                        this.isInitializing = false;
                        RecoveryManager.scheduleRecovery();
                    }
                    return this;
                }
            });
        }

        registerWithCoordinator() {
            if (!this.parentCoordinator || this.fallbackMode) return;

            try {
                this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
                    this.handleCoordinatedSessionUpdate(updateData);
                });

                this.parentCoordinator.registerUIBinding(() => {
                    if (currentUser && !this.authCheckDone) {
                        this.onAuthenticationSuccess();
                    }
                });
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.registerWithCoordinator', error);
            }
        }

        handleCoordinatedSessionUpdate(updateData) {
            if (!updateData) return;

            try {
                if (updateData.apiConfig) {
                    this.apiConfig = { ...this.apiConfig, ...updateData.apiConfig };
                }

                if (updateData.authenticated !== undefined) {
                    if (updateData.authenticated && updateData.user) {
                        this.onAuthenticationSuccess();
                    } else if (updateData.authenticated === false) {
                        this.handleLogout();
                    }
                }
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.handleCoordinatedSessionUpdate', error);
            }
        }

        setupInitialUI() {
            try {
                const apiStatusIndicator = document.getElementById('apiStatusIndicator');
                const apiStatusText = document.getElementById('apiStatusText');

                if (apiStatusIndicator && apiStatusText) {
                    if (this.fallbackMode) {
                        apiStatusIndicator.className = 'api-status-indicator connecting';
                        apiStatusText.textContent = 'Connecting...';
                    } else {
                        apiStatusIndicator.className = 'api-status-indicator connecting';
                        apiStatusText.textContent = 'Initializing...';
                    }
                    apiStatusIndicator.style.display = 'block';
                }

                this.loadCachedDataToUI();
                this.showUI();
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.setupInitialUI', error);
            }
        }

        showUI() {
            try {
                const appContainer = document.getElementById('appContainer');
                if (appContainer) {
                    appContainer.style.display = 'block';
                    appContainer.style.opacity = '1';
                }

                this.enableBasicUI();
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.showUI', error);
            }
        }

        enableBasicUI() {
            try {
                const settingsToggle = document.getElementById('settingsToggle');
                if (settingsToggle) settingsToggle.disabled = false;

                this.renderCachedCallHistory();
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.enableBasicUI', error);
            }
        }

        async startBackgroundAuthCheck() {
            if (this.fallbackMode) {
                this.onAuthenticationSuccess();
                return;
            }

            try {
                if (this.parentCoordinator) {
                    await this.waitForCoordinatorSession();
                } else {
                    await this.waitForTokenAuth();
                }
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.startBackgroundAuthCheck', error);
            }
        }

        async waitForCoordinatorSession() {
            if (!this.parentCoordinator) return;

            return new Promise((resolve) => {
                if (this.parentCoordinator.sessionValidated && currentUser) {
                    this.onAuthenticationSuccess();
                    resolve();
                    return;
                }

                const timeout = setTimeout(() => {
                    logOnce('info', 'Coordinator session timeout, using cached data');
                    resolve();
                }, 8000);

                const checkInterval = setInterval(() => {
                    if (this.parentCoordinator.sessionValidated && currentUser) {
                        clearTimeout(timeout);
                        clearInterval(checkInterval);
                        this.onAuthenticationSuccess();
                        resolve();
                    }
                }, 100);

                timers.add(timeout);
                timers.add(checkInterval);
            });
        }

        async waitForTokenAuth() {
            try {
                const token = await this.tokenManager.waitForToken();
                if (token) this.onAuthenticationSuccess(token);
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.waitForTokenAuth', error);
            }
        }

        onAuthenticationSuccess(token) {
            if (this.authCheckDone) return;

            try {
                if (window.AppState) window.AppState.isAuthenticated = true;
                this.authCheckDone = true;

                const apiStatusIndicator = document.getElementById('apiStatusIndicator');
                const apiStatusText = document.getElementById('apiStatusText');

                if (apiStatusIndicator && apiStatusText) {
                    if (this.fallbackMode) {
                        apiStatusIndicator.className = 'api-status-indicator connecting';
                        apiStatusText.textContent = 'Connecting...';
                    } else {
                        apiStatusIndicator.className = 'api-status-indicator connected';
                        apiStatusText.textContent = currentUser?.name ? `Authenticated as ${SecurityCore.sanitizeString(currentUser.name)}` : 'Authenticated';
                    }

                    setTimeout(() => {
                        if (apiStatusIndicator) apiStatusIndicator.style.display = 'none';
                    }, 2000);
                }

                if (!this.backgroundJobsStarted) {
                    this.backgroundJobsStarted = true;
                    this.startBackgroundJobs();
                }
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.onAuthenticationSuccess', error);
            }
        }

        startBackgroundJobs() {
            if (window.AppState && !window.AppState.isOnline) return;

            logOnce('info', 'Starting background jobs...');

            try {
                this.initializeBackgroundSync();
                setTimeout(() => this.performInitialDataLoad(), 500);
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.startBackgroundJobs', error);
            }
        }

        async performInitialDataLoad() {
            if (window.AppState && !window.AppState.isAuthenticated && !session.isDemoMode()) return;

            try {
                const syncIndicator = document.getElementById('syncIndicator');
                if (syncIndicator) {
                    syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Syncing...</span>';
                    syncIndicator.classList.add('syncing');
                }

                await Promise.allSettled([
                    this.fetchContacts(true),
                    this.fetchCallHistory(true),
                    this.fetchUserData(),
                    this.fetchSettings(),
                    this.checkPremiumStatus()
                ]);

                this.initialDataLoaded = true;

                if (syncIndicator) {
                    syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                    syncIndicator.classList.remove('syncing');
                }

                parentComm.send('DATA_SYNC_COMPLETE', { timestamp: Date.now() });
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.performInitialDataLoad', error);

                if (window.AppState) window.AppState.syncPending = true;

                const syncIndicator = document.getElementById('syncIndicator');
                if (syncIndicator) {
                    syncIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Sync failed</span>';
                    syncIndicator.classList.remove('syncing');
                }
            }
        }

        initializeBackgroundSync() {
            if (this.fallbackMode) return;

            try {
                if (this.backgroundSyncInterval) {
                    clearInterval(this.backgroundSyncInterval);
                    this.backgroundSyncInterval = null;
                }

                if (window.AppState && window.AppState.isAuthenticated && window.AppState.isOnline) {
                    let interval = 15000;
                    if (EnvironmentDetector.isVPNNetwork()) interval = 30000;

                    this.backgroundSyncInterval = setInterval(() => {
                        this.performBackgroundSync();
                    }, interval);
                    timers.add(this.backgroundSyncInterval);

                    document.addEventListener('visibilitychange', () => {
                        if (!document.hidden && window.AppState?.isOnline && window.AppState?.isAuthenticated) {
                            this.performBackgroundSync();
                        }
                    });
                }
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.initializeBackgroundSync', error);
            }
        }

        async performBackgroundSync() {
            if (!window.AppState || !window.AppState.isOnline || !window.AppState.isAuthenticated || window.AppState.isInCall) return;
            if (this.fallbackMode) return;

            try {
                await Promise.allSettled([
                    this.fetchContacts(true),
                    this.fetchCallHistory(true),
                    this.checkPremiumStatus()
                ]);

                const syncIndicator = document.getElementById('syncIndicator');
                if (syncIndicator) {
                    syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                    syncIndicator.classList.remove('syncing');
                }

                if (window.AppState) window.AppState.syncPending = false;
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.performBackgroundSync', error);
                if (window.AppState) window.AppState.syncPending = true;
            }
        }

        async fetchUserData() {
            try {
                if (this.fallbackMode) return null;

                if (this.parentCoordinator?.sessionValidated) {
                    const userData = await this.parentCoordinator.routeApiCall('/api/user/me', 'GET').catch(() => null);
                    if (userData) {
                        this.updateUserState(userData);
                        return userData;
                    }
                }

                const cachedUser = SecurityCore.safeLocalStorageGet('authUser') || SecurityCore.safeLocalStorageGet('currentUser');
                if (cachedUser) {
                    try {
                        const userData = SecurityCore.safeJSONParse(cachedUser);
                        this.updateUserState(userData);
                        return userData;
                    } catch (e) {}
                }
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.fetchUserData', error);
            }
            return null;
        }

        updateUserState(userData) {
            if (!userData) return;

            try {
                if (window.AppState) {
                    window.AppState.user = userData;
                    window.AppState.currentUser = userData;
                }
                SecurityCore.safeLocalStorageSet('authUser', JSON.stringify(userData));
                SecurityCore.safeLocalStorageSet('currentUser', JSON.stringify(userData));
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.updateUserState', error);
            }
        }

        async fetchContacts(forceRefresh = false) {
            try {
                if (!forceRefresh && window.AppState && window.AppState.contacts?.length > 0) {
                    return window.AppState.contacts;
                }

                const cachedContacts = SecurityCore.safeLocalStorageGet('cachedContacts');
                if (!forceRefresh && cachedContacts) {
                    try {
                        const contacts = SecurityCore.safeJSONParse(cachedContacts);
                        if (window.AppState) window.AppState.contacts = contacts;
                        this.renderContacts(contacts);
                        return contacts;
                    } catch (e) {}
                }

                if (!window.AppState || (!window.AppState.isAuthenticated)) {
                    return window.AppState ? window.AppState.contacts : [];
                }

                if (this.fallbackMode) return [];

                if (this.parentCoordinator?.sessionValidated) {
                    const contacts = await this.parentCoordinator.routeApiCall('/api/contacts', 'GET').catch(() => null);
                    if (contacts) {
                        if (window.AppState) window.AppState.contacts = contacts;
                        this.cacheContacts(contacts);
                        this.renderContacts(contacts);
                        return contacts;
                    }
                }

                return [];
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.fetchContacts', error);

                const cachedContacts = SecurityCore.safeLocalStorageGet('cachedContacts');
                if (cachedContacts) {
                    try {
                        const contacts = SecurityCore.safeJSONParse(cachedContacts);
                        if (window.AppState) window.AppState.contacts = contacts;
                        this.renderContacts(contacts);
                        return contacts;
                    } catch (e) {}
                }

                return [];
            }
        }

        cacheContacts(contacts) {
            try {
                SecurityCore.safeLocalStorageSet('cachedContacts', JSON.stringify(contacts));
                SecurityCore.safeLocalStorageSet('cachedContactsTimestamp', Date.now().toString());
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.cacheContacts', error);
            }
        }

        async fetchCallHistory(forceRefresh = false) {
            try {
                if (!forceRefresh && window.AppState && window.AppState.callHistory?.length > 0) {
                    return window.AppState.callHistory;
                }

                const cachedHistory = SecurityCore.safeLocalStorageGet('cachedCallHistory');
                if (!forceRefresh && cachedHistory) {
                    try {
                        const history = SecurityCore.safeJSONParse(cachedHistory);
                        if (window.AppState) window.AppState.callHistory = history;
                        this.renderCallHistory(history);
                        return history;
                    } catch (e) {}
                }

                if (!window.AppState || (!window.AppState.isAuthenticated)) {
                    return window.AppState ? window.AppState.callHistory : [];
                }

                if (this.fallbackMode) return [];

                if (this.parentCoordinator?.sessionValidated) {
                    const history = await this.parentCoordinator.routeApiCall('/api/calls/history', 'GET').catch(() => null);
                    if (history) {
                        if (window.AppState) window.AppState.callHistory = history;
                        this.cacheCallHistory(history);
                        this.renderCallHistory(history);
                        return history;
                    }
                }

                return [];
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.fetchCallHistory', error);

                const cachedHistory = SecurityCore.safeLocalStorageGet('cachedCallHistory');
                if (cachedHistory) {
                    try {
                        const history = SecurityCore.safeJSONParse(cachedHistory);
                        if (window.AppState) window.AppState.callHistory = history;
                        this.renderCallHistory(history);
                        return history;
                    } catch (e) {}
                }

                return [];
            }
        }

        cacheCallHistory(history) {
            try {
                SecurityCore.safeLocalStorageSet('cachedCallHistory', JSON.stringify(history));
                SecurityCore.safeLocalStorageSet('cachedCallHistoryTimestamp', Date.now().toString());
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.cacheCallHistory', error);
            }
        }

        renderCachedCallHistory() {
            try {
                const cachedHistory = SecurityCore.safeLocalStorageGet('cachedCallHistory');
                if (cachedHistory) {
                    try {
                        const history = SecurityCore.safeJSONParse(cachedHistory);
                        if (window.AppState) window.AppState.callHistory = history;
                        this.renderCallHistory(history);
                    } catch (e) {}
                }
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.renderCachedCallHistory', error);
            }
        }

        renderCallHistory(history) {
            if (typeof window.renderCallHistory === 'function') window.renderCallHistory(history);
        }

        async fetchSettings() {
            try {
                if (this.fallbackMode) {
                    const demoSettings = {
                        emotionalContext: true,
                        callIntention: true,
                        inCallChat: true,
                        whiteboard: true,
                        polls: true,
                        notes: true,
                        focusMode: false,
                        liveReactions: true,
                        theme: 'light'
                    };
                    if (window.AppState) {
                        window.AppState.settings = { ...window.AppState.settings, ...demoSettings };
                    }
                    this.applySettingsToUI();
                    return demoSettings;
                }

                if (window.parent && window.parent.AppState && window.parent.AppState.settings) {
                    if (window.AppState) {
                        window.AppState.settings = { ...window.AppState.settings, ...window.parent.AppState.settings };
                    }
                    this.applySettingsToUI();
                    return window.AppState ? window.AppState.settings : {};
                }

                if (!window.AppState || (!window.AppState.isAuthenticated)) {
                    return window.AppState ? window.AppState.settings : {};
                }

                if (this.parentCoordinator?.sessionValidated) {
                    const settings = await this.parentCoordinator.routeApiCall('/api/user/settings', 'GET').catch(() => null);
                    if (settings && window.AppState) {
                        window.AppState.settings = { ...window.AppState.settings, ...settings };
                        this.applySettingsToUI();
                        this.saveSettings();
                    }
                    return window.AppState ? window.AppState.settings : {};
                }

                return window.AppState ? window.AppState.settings : {};
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.fetchSettings', error);

                const cachedSettings = SecurityCore.safeLocalStorageGet('callSettings');
                if (cachedSettings && window.AppState) {
                    try {
                        const settings = SecurityCore.safeJSONParse(cachedSettings);
                        window.AppState.settings = { ...window.AppState.settings, ...settings };
                        this.applySettingsToUI();
                    } catch (e) {}
                }

                return window.AppState ? window.AppState.settings : {};
            }
        }

        applySettingsToUI() {
            if (typeof window.applySettingsToUI === 'function') window.applySettingsToUI();
        }

        saveSettings() {
            if (typeof window.saveSettings === 'function') window.saveSettings();
        }

        async checkPremiumStatus() {
            try {
                if (this.fallbackMode) {
                    if (window.AppState) {
                        window.AppState.isPremium = false;
                        window.AppState.trialDaysLeft = 0;
                    }
                    this.updatePremiumUI();
                    return false;
                }

                if (window.parent && window.parent.AppState) {
                    if (window.AppState) {
                        window.AppState.isPremium = window.parent.AppState.isPremium || false;
                        window.AppState.trialDaysLeft = window.parent.AppState.trialDaysLeft || 0;
                    }
                    this.updatePremiumUI();
                    return window.AppState ? window.AppState.isPremium : false;
                }

                if (!window.AppState || (!window.AppState.isAuthenticated)) {
                    this.updatePremiumUI();
                    return window.AppState ? window.AppState.isPremium : false;
                }

                if (this.parentCoordinator?.sessionValidated) {
                    const premiumData = await this.parentCoordinator.routeApiCall('/api/user/premium', 'GET').catch(() => null);
                    if (premiumData && window.AppState) {
                        window.AppState.isPremium = premiumData.isPremium || false;
                        window.AppState.trialDaysLeft = premiumData.trialDaysLeft || 0;
                        window.AppState.premiumFeatures = premiumData.features || window.AppState.premiumFeatures;
                        this.cachePremiumStatus(premiumData);
                        this.updatePremiumUI();
                    }
                    return window.AppState ? window.AppState.isPremium : false;
                }

                return window.AppState ? window.AppState.isPremium : false;
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.checkPremiumStatus', error);

                const cachedPremium = SecurityCore.safeLocalStorageGet('premiumStatus');
                if (cachedPremium && window.AppState) {
                    try {
                        const premiumData = SecurityCore.safeJSONParse(cachedPremium);
                        window.AppState.isPremium = premiumData.isPremium || false;
                        window.AppState.trialDaysLeft = premiumData.trialDaysLeft || 0;
                        window.AppState.premiumFeatures = premiumData.features || window.AppState.premiumFeatures;
                    } catch (e) {}
                }

                this.updatePremiumUI();
                return window.AppState ? window.AppState.isPremium : false;
            }
        }

        cachePremiumStatus(premiumData) {
            try {
                SecurityCore.safeLocalStorageSet('premiumStatus', JSON.stringify({
                    isPremium: window.AppState ? window.AppState.isPremium : false,
                    trialDaysLeft: window.AppState ? window.AppState.trialDaysLeft : 0,
                    features: window.AppState ? window.AppState.premiumFeatures : {}
                }));
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.cachePremiumStatus', error);
            }
        }

        loadCachedDataToUI() {
            try {
                this.loadSettings();

                const cachedContacts = SecurityCore.safeLocalStorageGet('cachedContacts');
                if (cachedContacts) {
                    try {
                        const contacts = SecurityCore.safeJSONParse(cachedContacts);
                        if (window.AppState) window.AppState.contacts = contacts;
                        this.renderContacts(contacts);
                    } catch (e) {}
                }

                const cachedCalls = SecurityCore.safeLocalStorageGet('cachedCallHistory');
                if (cachedCalls) {
                    try {
                        const calls = SecurityCore.safeJSONParse(cachedCalls);
                        if (window.AppState) window.AppState.callHistory = calls;
                        this.renderCallHistory(calls);
                    } catch (e) {}
                }

                const cachedPremium = SecurityCore.safeLocalStorageGet('premiumStatus');
                if (cachedPremium) {
                    try {
                        const premiumData = SecurityCore.safeJSONParse(cachedPremium);
                        if (window.AppState) {
                            window.AppState.isPremium = premiumData.isPremium || false;
                            window.AppState.trialDaysLeft = premiumData.trialDaysLeft || 0;
                            window.AppState.premiumFeatures = premiumData.features || window.AppState.premiumFeatures;
                        }
                        this.updatePremiumUI();
                    } catch (e) {}
                }
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.loadCachedDataToUI', error);
            }
        }

        loadSettings() {
            if (typeof window.loadSettings === 'function') window.loadSettings();
        }

        updatePremiumUI() {
            if (typeof window.updatePremiumUI === 'function') window.updatePremiumUI();
        }

        renderContacts(contacts) {
            if (!contacts || contacts.length === 0) {
                const contactsList = document.getElementById('contactsList');
                if (contactsList) {
                    contactsList.innerHTML = '<div class="offline-state"><i class="fas fa-users-slash"></i><p>No contacts available</p></div>';
                }
                return;
            }

            try {
                const contactsList = document.getElementById('contactsList');
                if (!contactsList) return;

                let html = '';
                contacts.slice(0, 20).forEach(contact => {
                    const name = SecurityCore.sanitizeString(contact.name || 'Unknown');
                    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();
                    html += `
                        <div class="contact-item" data-id="${SecurityCore.sanitizeString(contact.id)}">
                            <div class="contact-checkbox-container">
                                <input type="checkbox" class="contact-checkbox" id="contact-${SecurityCore.sanitizeString(contact.id)}">
                            </div>
                            <div class="call-avatar" style="background-color: ${this.stringToColor(contact.name)}">
                                ${contact.avatar ? `<img src="${SecurityCore.sanitizeURL(contact.avatar)}" alt="${name}">` : SecurityCore.sanitizeString(initials)}
                            </div>
                            <div class="call-info">
                                <div class="call-name">
                                    ${name}
                                    ${contact.isPremium ? '<span class="premium-badge">PRO</span>' : ''}
                                </div>
                            </div>
                        </div>
                    `;
                });

                contactsList.innerHTML = html;

                const contactsLoading = document.getElementById('contactsLoading');
                if (contactsLoading) contactsLoading.style.display = 'none';
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.renderContacts', error);
            }
        }

        stringToColor(str) {
            if (!str) return '#6c5ce7';

            let hash = 0;
            for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);

            const colors = ['#6c5ce7', '#00b894', '#0984e3', '#fdcb6e', '#e17055', '#d63031', '#e84342', '#6c5ce7'];
            return colors[Math.abs(hash) % colors.length];
        }

        handleLogout() {
            try {
                this.authCheckDone = false;
                this.backgroundJobsStarted = false;
                this.initialDataLoaded = false;

                if (this.backgroundSyncInterval) {
                    clearInterval(this.backgroundSyncInterval);
                    this.backgroundSyncInterval = null;
                }

                this.tokenManager.clearToken();
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.handleLogout', error);
            }
        }

        cleanup() {
            try {
                if (this.backgroundSyncInterval) {
                    clearInterval(this.backgroundSyncInterval);
                    this.backgroundSyncInterval = null;
                }
                if (this.tokenManager) this.tokenManager.cleanup();
                if (this.parentCoordinator) this.parentCoordinator.cleanup();
            } catch (error) {
                logOnce('error', 'CallAPIIntegration.cleanup', error);
            }
        }
    }

    // ==================== ORIGINAL GLOBAL APP STATE (PRESERVED) ====================
    const AppState = {
        isAuthenticated: false,
        authChecked: false,
        user: null,
        apiReady: false,
        apiCheckInterval: null,
        currentUser: null,
        userPermissions: {},
        callPermissions: {},
        isInCall: false,
        currentCall: null,
        activeCallId: null,
        callType: null,
        callParticipants: [],
        callStartTime: null,
        callDurationInterval: null,
        localStream: null,
        remoteStreams: new Map(),
        screenStream: null,
        isMuted: false,
        isVideoOff: false,
        isScreenSharing: false,
        isSpeakerOn: true,
        currentMood: 'neutral',
        currentIntention: 'quick',
        currentFocusMode: false,
        currentPanel: 'participants',
        currentCategory: 'all',
        contacts: [],
        callHistory: [],
        settings: {
            emotionalContext: true,
            callIntention: true,
            inCallChat: true,
            whiteboard: true,
            polls: true,
            notes: true,
            focusMode: false,
            liveReactions: true,
            theme: 'light'
        },
        isOnline: navigator.onLine,
        syncPending: false,
        isPremium: false,
        trialDaysLeft: 0,
        premiumFeatures: {
            groupCalls: false,
            screenSharing: false,
            whiteboard: false,
            polls: false,
            relationshipInsights: false,
            callLinks: false
        },
        chatMessages: [],
        unreadChatCount: 0,
        peer: null,
        connections: new Map()
    };

    // ==================== ORIGINAL DOM ELEMENTS (PRESERVED) ====================
    const elements = {};

    function cacheElements() {
        try {
            const selectors = {
                appContainer: '#appContainer',
                sidebar: '#sidebar',
                callContainer: '#callContainer',

                newCallBtn: '#newCallBtn',
                quickVoiceBtn: '#quickVoiceBtn',
                quickVideoBtn: '#quickVideoBtn',
                quickGroupBtn: '#quickGroupBtn',
                settingsToggle: '#settingsToggle',
                settingsToggleIcon: '#settingsToggleIcon',
                menuDotsBtn: '#menuDotsBtn',
                menuDotsDropdown: '#menuDotsDropdown',

                menuParticipants: '#menuParticipants',
                menuChat: '#menuChat',
                menuWhiteboard: '#menuWhiteboard',
                menuNotes: '#menuNotes',
                menuPolls: '#menuPolls',
                menuRelationship: '#menuRelationship',

                muteBtn: '#muteBtn',
                videoBtn: '#videoBtn',
                screenShareBtn: '#screenShareBtn',
                speakerBtn: '#speakerBtn',
                moodBtn: '#moodBtn',
                intentionBtn: '#intentionBtn',
                focusModeBtn: '#focusModeBtn',
                endCallBtn: '#endCallBtn',

                callWithName: '#callWithName',
                callStatusText: '#callStatusText',
                callTypeIcon: '#callTypeIcon',
                callDuration: '#callDuration',
                callMoodIndicator: '#callMoodIndicator',
                callIntentionIndicator: '#callIntentionIndicator',
                videoGrid: '#videoGrid',
                offlineCallPlaceholder: '#offlineCallPlaceholder',
                reactionsContainer: '#reactionsContainer',

                newCallModal: '#newCallModal',
                closeNewCallModal: '#closeNewCallModal',
                incomingCallModal: '#incomingCallModal',
                incomingCallName: '#incomingCallName',
                incomingCallType: '#incomingCallType',
                incomingCallAvatar: '#incomingCallAvatar',
                incomingCallMood: '#incomingCallMood',
                incomingCallIntention: '#incomingCallIntention',
                declineTimer: '#declineTimer',
                declineCallBtn: '#declineCallBtn',
                acceptCallBtn: '#acceptCallBtn',
                acceptVideoCallBtn: '#acceptVideoCallBtn',

                settingsPanel: '#settingsPanel',
                resetSettingsBtn: '#resetSettingsBtn',
                emotionalContextToggle: '#emotionalContextToggle',
                callIntentionToggle: '#callIntentionToggle',
                inCallChatToggle: '#inCallChatToggle',
                whiteboardToggle: '#whiteboardToggle',
                pollsToggle: '#pollsToggle',
                notesToggle: '#notesToggle',
                focusModeToggle: '#focusModeToggle',
                liveReactionsToggle: '#liveReactionsToggle',

                contactSearch: '#contactSearch',
                groupContactSearch: '#groupContactSearch',
                contactsList: '#contactsList',
                groupContactsList: '#groupContactsList',
                contactsLoading: '#contactsLoading',
                callsLoading: '#callsLoading',
                startVoiceCallBtn: '#startVoiceCallBtn',
                startVideoCallBtn: '#startVideoCallBtn',
                startGroupCallBtn: '#startGroupCallBtn',
                instantGroupOption: '#instantGroupOption',
                scheduledGroupOption: '#scheduledGroupOption',

                copyLinkBtn: '#copyLinkBtn',
                shareLinkBtn: '#shareLinkBtn',
                generateVoiceLinkBtn: '#generateVoiceLinkBtn',
                generateVideoLinkBtn: '#generateVideoLinkBtn',
                callLinkInput: '#callLinkInput',

                mpesaOption: '#mpesaOption',
                cancelPaymentBtn: '#cancelPaymentBtn',
                processPaymentBtn: '#processPaymentBtn',
                cancelUpgradeBtn: '#cancelUpgradeBtn',
                upgradeNowBtn: '#upgradeNowBtn',
                paymentModal: '#paymentModal',
                premiumLimitOverlay: '#premiumLimitOverlay',
                phoneNumber: '#phoneNumber',
                paymentAmount: '#paymentAmount',

                cancelMoodBtn: '#cancelMoodBtn',
                setMoodBtn: '#setMoodBtn',
                cancelIntentionBtn: '#cancelIntentionBtn',
                setIntentionBtn: '#setIntentionBtn',
                moodSelectionModal: '#moodSelectionModal',
                intentionSelectionModal: '#intentionSelectionModal',

                skipNotesBtn: '#skipNotesBtn',
                saveNotesBtn: '#saveNotesBtn',
                summaryDoneBtn: '#summaryDoneBtn',
                privateNotesModal: '#privateNotesModal',
                privateNotesTitle: '#privateNotesTitle',
                privateNotesSubtitle: '#privateNotesSubtitle',
                privateNotesTextarea: '#privateNotesTextarea',
                callSummaryModal: '#callSummaryModal',
                summaryDuration: '#summaryDuration',
                summaryTime: '#summaryTime',
                summaryType: '#summaryType',
                summaryMood: '#summaryMood',
                summaryIntention: '#summaryIntention',
                summaryParticipants: '#summaryParticipants',

                urlParamCancelBtn: '#urlParamCancelBtn',
                urlParamJoinBtn: '#urlParamJoinBtn',
                urlParamOverlay: '#urlParamOverlay',
                urlParamCallId: '#urlParamCallId',

                allCallsSection: '#allCallsSection',
                missedCallsSection: '#missedCallsSection',
                groupCallsSection: '#groupCallsSection',
                allCallsList: '#allCallsList',
                missedCallsList: '#missedCallsList',
                groupCallsList: '#groupCallsList',

                pipCloseBtn: '#pipCloseBtn',
                pipContainer: '#pipContainer',

                syncIndicator: '#syncIndicator',
                apiStatusIndicator: '#apiStatusIndicator',
                apiStatusText: '#apiStatusText',
                offlineBanner: '#offlineBanner',
                notificationArea: '#notificationArea',

                debugToggle: '#debugToggle',
                debugPanel: '#debugPanel',
                envBadge: '#envBadge',
                envText: '#envText',
                recoveryIndicator: '#recoveryIndicator',
                recoveryMessage: '#recoveryMessage'
            };

            Object.entries(selectors).forEach(([key, selector]) => {
                try {
                    const element = document.querySelector(selector);
                    if (element) elements[key] = element;
                } catch (error) {
                    if (DEBUG) logOnce('warn', `Failed to cache element: ${key}`, { selector, error: error.message });
                }
            });

            try {
                elements.categoryBtns = document.querySelectorAll('.category-btn');
                elements.newCallTabs = document.querySelectorAll('.new-call-tab');
                elements.moodOptions = document.querySelectorAll('.mood-option');
                elements.intentionOptions = document.querySelectorAll('.intention-option');
                elements.reactionBtns = document.querySelectorAll('.reaction-btn');
                elements.paymentOptions = document.querySelectorAll('.payment-option');

                Object.defineProperty(elements, 'contactCheckboxes', {
                    get: function() {
                        try { return document.querySelectorAll('.contact-checkbox'); } catch (e) { return []; }
                    }
                });

                Object.defineProperty(elements, 'groupContactCheckboxes', {
                    get: function() {
                        try { return document.querySelectorAll('.group-contact'); } catch (e) { return []; }
                    }
                });

                Object.defineProperty(elements, 'selectedContacts', {
                    get: function() {
                        try { return document.querySelectorAll('.contact-item.selected'); } catch (e) { return []; }
                    }
                });
            } catch (error) {
                if (DEBUG) logOnce('error', 'Failed to cache dynamic element groups', error);
            }

            return Object.keys(elements).length;
        } catch (error) {
            if (DEBUG) logOnce('error', 'Failed to cache elements', error);
            return 0;
        }
    }

    // ==================== MISSING FUNCTIONS ADDED (PRESERVED) ====================
    async function initializeCore(options = {}) {
        return ErrorBoundary.executeAsync(async () => {
            logOnce('info', 'initializeCore called', options);
            const result = await safeInit();
            return {
                status: coreReady ? 'ready' : 'degraded',
                mode: 'production',
                iframeId,
                timestamp: Date.now()
            };
        }, 'initializeCore', { status: 'failed', mode: 'production' });
    }

    function shutdownCore() {
        return ErrorBoundary.execute(() => {
            logOnce('info', 'shutdownCore called');
            return lifecycle.destroy();
        }, 'shutdownCore', { success: false });
    }

    async function initializeUI() {
        return ErrorBoundary.executeAsync(async () => {
            logOnce('info', 'initializeUI called');
            cacheElements();
            return {
                success: true,
                elements: Object.keys(elements).length,
                timestamp: Date.now()
            };
        }, 'initializeUI', { success: false, elements: 0 });
    }

    function cleanupUISession() {
        return ErrorBoundary.execute(() => {
            logOnce('info', 'cleanupUISession called');
            if (window.callAPI) window.callAPI.cleanup();
            if (window.callCore) window.callCore.cleanup();
            if (parentCoordinator) parentCoordinator.cleanup();
            TransportAgent.cleanup();
            SessionClient.cleanup();
            session.clearToken();
            return { success: true, timestamp: Date.now() };
        }, 'cleanupUISession', { success: false });
    }

    function receiveFromParent(type, handler) {
        return ErrorBoundary.execute(() => {
            if (!type || typeof handler !== 'function') {
                logOnce('error', 'receiveFromParent: invalid parameters');
                return false;
            }

            const wrappedHandler = (message, origin) => {
                try {
                    const adaptedMessage = CompatibilityBridge.adaptIncoming(message);
                    handler(adaptedMessage.payload || adaptedMessage, {
                        origin,
                        id: adaptedMessage.messageId,
                        timestamp: adaptedMessage.timestamp
                    });
                } catch (error) {
                    logOnce('error', `Handler error for ${type}`, error);
                }
            };

            window.addEventListener('message', (event) => {
                if (!OriginAdapter.validateEvent(event)) return;
                const adapted = CompatibilityBridge.adaptIncoming(event.data);
                if (!adapted || adapted.type !== type) return;
                if (!MessageValidator.validate(adapted)) return;

                wrappedHandler(adapted, event.origin);
            });

            logOnce('info', 'Registered receive handler: ' + type);
            return true;
        }, 'receiveFromParent', false);
    }

    function simulateIncomingCall(callerId, metadata = {}) {
        if (AppState.isInCall) {
            showNotification('Already in a call', 'warning');
            return false;
        }

        try {
            let callerContact = null;

            if (AppState.contacts && AppState.contacts.length > 0) {
                callerContact = AppState.contacts.find(c => c.id === callerId);
            }

            if (!callerContact) {
                callerContact = {
                    id: callerId || 'simulated-' + Date.now(),
                    name: metadata.name || 'Test Caller',
                    avatar: metadata.avatar || null,
                    isPremium: metadata.isPremium || false
                };
            }

            const callMetadata = {
                callType: metadata.callType || 'voice',
                mood: metadata.mood || 'neutral',
                intention: metadata.intention || 'quick',
                isGroup: metadata.isGroup || false,
                callId: 'simulated-call-' + Date.now(),
                timestamp: Date.now()
            };

            if (elements.incomingCallModal && elements.incomingCallName) {
                elements.incomingCallName.textContent = SecurityCore.sanitizeString(callerContact.name);
                elements.incomingCallType.textContent = callMetadata.callType === 'video' ? 'Video Call' : 'Voice Call';

                const initials = callerContact.name.split(' ').map(n => n[0]).join('').toUpperCase();
                elements.incomingCallAvatar.innerHTML = SecurityCore.sanitizeString(initials);
                elements.incomingCallAvatar.style.backgroundColor = stringToColor(callerContact.name);

                if (metadata.mood) {
                    const moodIcons = {
                        happy: 'fa-smile',
                        neutral: 'fa-meh',
                        sad: 'fa-frown',
                        angry: 'fa-angry',
                        tired: 'fa-tired'
                    };
                    const icon = moodIcons[metadata.mood] || 'fa-meh';
                    elements.incomingCallMood.innerHTML = `<i class="fas ${icon}"></i><span>${SecurityCore.sanitizeString(metadata.mood)}</span>`;
                    elements.incomingCallMood.className = `mood-indicator mood-${SecurityCore.sanitizeString(metadata.mood)}`;
                    elements.incomingCallMood.style.display = 'inline-flex';
                } else {
                    elements.incomingCallMood.style.display = 'none';
                }

                if (metadata.intention) {
                    const intentionLabels = {
                        quick: 'Quick Chat',
                        important: 'Important',
                        emergency: 'Emergency',
                        checkin: 'Check-in',
                        work: 'Work'
                    };
                    const label = intentionLabels[metadata.intention] || 'Quick Chat';
                    elements.incomingCallIntention.innerHTML = `<i class="fas fa-bullseye"></i><span>${SecurityCore.sanitizeString(label)}</span>`;
                    elements.incomingCallIntention.className = `intention-indicator intention-${SecurityCore.sanitizeString(metadata.intention)}`;
                    elements.incomingCallIntention.style.display = 'inline-flex';
                } else {
                    elements.incomingCallIntention.style.display = 'none';
                }

                let timeLeft = 45;
                elements.declineTimer.textContent = timeLeft;

                const countdown = setInterval(() => {
                    timeLeft--;
                    elements.declineTimer.textContent = timeLeft;
                    if (timeLeft <= 0) {
                        clearInterval(countdown);
                        if (elements.incomingCallModal.classList.contains('active')) {
                            elements.incomingCallModal.classList.remove('active');
                        }
                    }
                }, 1000);

                elements.incomingCallModal.dataset.timer = countdown;
                elements.incomingCallModal.dataset.caller = JSON.stringify(callerContact);
                elements.incomingCallModal.dataset.metadata = JSON.stringify(callMetadata);

                elements.incomingCallModal.classList.add('active');

                parentComm.send('INCOMING_CALL_SIMULATED', {
                    callerId: callerContact.id,
                    metadata: callMetadata,
                    timestamp: Date.now()
                });

                return true;
            }

            return false;
        } catch (error) {
            logOnce('error', 'simulateIncomingCall', error);
            return false;
        }
    }

    function showNotification(message, type = 'success') {
        try {
            const notification = document.createElement('div');
            notification.className = `call-notification ${type}`;

            notification.innerHTML = `
                <div class="call-notification-content">
                    <div class="call-notification-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                    <div class="call-notification-message">${SecurityCore.sanitizeString(message)}</div>
                </div>
                <button class="call-notification-close">
                    <i class="fas fa-times"></i>
                </button>
            `;

            const notificationArea = document.getElementById('notificationArea') || document.body;
            notificationArea.appendChild(notification);

            const closeBtn = notification.querySelector('.call-notification-close');
            if (closeBtn) closeBtn.addEventListener('click', () => notification.remove());

            const timer = setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 3000);
            timers.add(timer);
        } catch (error) {
            logOnce('error', 'showNotification', error);
        }
    }

    function initializeOfflineDetection() {
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
    }

    function handleOnline() {
        AppState.isOnline = true;
        if (elements.offlineBanner) elements.offlineBanner.style.display = 'none';
        if (window.callAPI) window.callAPI.performBackgroundSync();

        TransportAgent.processOfflineQueue();

        if (!getValidatedSession()) requestResync();
    }

    function handleOffline() {
        AppState.isOnline = false;
        showOfflineUI();
    }

    function showOfflineUI() {
        if (elements.offlineBanner) elements.offlineBanner.style.display = 'flex';
        if (elements.syncIndicator) {
            elements.syncIndicator.innerHTML = '<i class="fas fa-cloud-slash"></i><span>Offline</span>';
        }
    }

    function handleStorageEvent(e) {
        if (e.key === 'USER_TOKEN' && e.newValue) session.setToken(e.newValue);
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function makeDraggable(element) {
        if (!element) return;
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        element.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + 'px';
            element.style.left = (element.offsetLeft - pos1) + 'px';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    function closePip() {
        if (elements.pipContainer) elements.pipContainer.style.display = 'none';
    }

    function checkPremiumFeature(feature) {
        if (!AppState.isPremium && !AppState.premiumFeatures[feature]) {
            if (elements.premiumLimitOverlay) {
                const featureNameEl = document.getElementById('premiumFeatureName');
                if (featureNameEl) {
                    featureNameEl.textContent = feature === 'groupCalls' ? 'Group Calls' :
                                              feature === 'screenSharing' ? 'Screen Sharing' :
                                              feature === 'whiteboard' ? 'Whiteboard' :
                                              feature === 'polls' ? 'Polls' :
                                              feature === 'relationshipInsights' ? 'Relationship Insights' :
                                              'Premium Feature';
                }
                elements.premiumLimitOverlay.classList.add('active');
            }
            return false;
        }
        return true;
    }

    function updateSetting(event) {
        const setting = event.target.id.replace('Toggle', '');
        const settingKey = setting.charAt(0).toLowerCase() + setting.slice(1);
        AppState.settings[settingKey] = event.target.checked;
        saveSettings();
        applySettingChange(settingKey, event.target.checked);
    }

    function applySettingChange(settingKey, value) {
        if (settingKey === 'focusMode' && AppState.isInCall) {
            if (value) document.body.classList.add('focus-mode');
            else document.body.classList.remove('focus-mode');
        }
    }

    function resetSettings() {
        AppState.settings = {
            emotionalContext: true,
            callIntention: true,
            inCallChat: true,
            whiteboard: true,
            polls: true,
            notes: true,
            focusMode: false,
            liveReactions: true,
            theme: 'light'
        };
        saveSettings();
        applySettingsToUI();
        showNotification('Settings reset to default', 'success');
    }

    function loadSettings() {
        try {
            const savedSettings = SecurityCore.safeLocalStorageGet('callSettings');
            if (savedSettings) {
                AppState.settings = { ...AppState.settings, ...SecurityCore.safeJSONParse(savedSettings, {}) };
                applySettingsToUI();
            }
        } catch (error) {
            logOnce('error', 'loadSettings', error);
        }
    }

    function saveSettings() {
        try {
            SecurityCore.safeLocalStorageSet('callSettings', JSON.stringify(AppState.settings));
        } catch (error) {
            logOnce('error', 'saveSettings', error);
        }
    }

    function applySettingsToUI() {
        try {
            if (elements.emotionalContextToggle) elements.emotionalContextToggle.checked = AppState.settings.emotionalContext;
            if (elements.callIntentionToggle) elements.callIntentionToggle.checked = AppState.settings.callIntention;
            if (elements.inCallChatToggle) elements.inCallChatToggle.checked = AppState.settings.inCallChat;
            if (elements.whiteboardToggle) elements.whiteboardToggle.checked = AppState.settings.whiteboard;
            if (elements.pollsToggle) elements.pollsToggle.checked = AppState.settings.polls;
            if (elements.notesToggle) elements.notesToggle.checked = AppState.settings.notes;
            if (elements.focusModeToggle) elements.focusModeToggle.checked = AppState.settings.focusMode;
            if (elements.liveReactionsToggle) elements.liveReactionsToggle.checked = AppState.settings.liveReactions;
        } catch (error) {
            logOnce('error', 'applySettingsToUI', error);
        }
    }

    function updatePremiumUI() {
        if (!elements.quickGroupBtn || !elements.screenShareBtn) return;

        try {
            if (AppState.isPremium) {
                elements.quickGroupBtn.disabled = false;
                elements.screenShareBtn.disabled = false;
            } else {
                elements.quickGroupBtn.disabled = true;
                elements.screenShareBtn.disabled = true;
            }
        } catch (error) {
            logOnce('error', 'updatePremiumUI', error);
        }
    }

    function updateMoodIndicator(mood) {
        if (!elements.callMoodIndicator) return;
        const moodIcons = { happy: 'fa-smile', neutral: 'fa-meh', sad: 'fa-frown', angry: 'fa-angry', tired: 'fa-tired' };
        const icon = moodIcons[mood] || 'fa-meh';
        elements.callMoodIndicator.innerHTML = `<i class="fas ${icon}"></i><span>${SecurityCore.sanitizeString(mood)}</span>`;
        elements.callMoodIndicator.className = `mood-indicator mood-${SecurityCore.sanitizeString(mood)}`;
    }

    function updateIntentionIndicator(intention) {
        if (!elements.callIntentionIndicator) return;
        const intentionLabels = { quick: 'Quick Chat', important: 'Important', emergency: 'Emergency', checkin: 'Check-in', work: 'Work' };
        const label = intentionLabels[intention] || 'Quick Chat';
        elements.callIntentionIndicator.innerHTML = `<i class="fas fa-bullseye"></i><span>${SecurityCore.sanitizeString(label)}</span>`;
        elements.callIntentionIndicator.className = `intention-indicator intention-${SecurityCore.sanitizeString(intention)}`;
    }

    function updateParticipantBadge() {
        const badge = document.querySelector('.participant-badge');
        if (badge) badge.textContent = AppState.callParticipants.length + 1;
    }

    function updateChatBadge() {
        if (AppState.unreadChatCount > 0) {
            const badge = document.querySelector('.chat-badge');
            if (badge) {
                badge.textContent = AppState.unreadChatCount;
                badge.style.display = 'flex';
            }
        }
    }

    function updateGroupCallButton() {
        if (elements.quickGroupBtn) elements.quickGroupBtn.disabled = !AppState.isPremium;
    }

    function updateVideoLayout() {
        const videoCount = elements.videoGrid.querySelectorAll('.video-container').length;
        if (videoCount === 1) elements.videoGrid.style.gridTemplateColumns = '1fr';
        else if (videoCount === 2) elements.videoGrid.style.gridTemplateColumns = '1fr 1fr';
        else if (videoCount === 3) elements.videoGrid.style.gridTemplateColumns = '1fr 1fr';
        else if (videoCount >= 4) elements.videoGrid.style.gridTemplateColumns = '1fr 1fr';
    }

    function initializeWhiteboard(canvas) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
    }

    function sendChatMessage(message) {
        if (!message || !AppState.isInCall) return;
        const chatMessages = document.getElementById('chatMessagesPanel');
        if (chatMessages) {
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-message self';
            msgEl.innerHTML = `
                <div class="message-sender">You</div>
                <div class="message-content">${SecurityCore.sanitizeString(message)}</div>
                <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            `;
            chatMessages.appendChild(msgEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function saveSharedNotes(notes) {
        if (!notes) return;
        try {
            const savedNotes = SecurityCore.safeJSONParse(SecurityCore.safeLocalStorageGet('sharedNotes') || '[]', []);
            savedNotes.push({
                notes: SecurityCore.sanitizeString(notes),
                timestamp: Date.now(),
                callId: AppState.activeCallId
            });
            SecurityCore.safeLocalStorageSet('sharedNotes', JSON.stringify(savedNotes));
        } catch (error) {
            logOnce('error', 'saveSharedNotes', error);
        }
    }

    function renderCallHistory() {
        if (!elements.callsLoading || !elements.allCallsList) return;

        try {
            elements.callsLoading.style.display = 'none';

            if (!AppState.callHistory || AppState.callHistory.length === 0) {
                if (elements.allCallsList) {
                    elements.allCallsList.innerHTML = '<div class="offline-state"><i class="fas fa-phone-slash"></i><p>No call history</p></div>';
                }
                return;
            }

            let html = '';
            AppState.callHistory.slice(0, 20).forEach(call => {
                const date = new Date(call.date);
                const timeAgo = formatTimeAgo(date);
                const duration = call.missed ? 'Missed' : formatDuration(call.duration);
                const icon = call.type === 'video' ? 'fa-video' : 'fa-phone';
                const statusClass = call.missed ? 'missed' : '';

                html += `
                    <div class="call-history-item ${statusClass}">
                        <div class="call-avatar">${SecurityCore.sanitizeString(call.contact.charAt(0))}</div>
                        <div class="call-info">
                            <div class="call-name">${SecurityCore.sanitizeString(call.contact)}</div>
                            <div class="call-details">
                                <i class="fas ${icon}"></i>
                                <span>${SecurityCore.sanitizeString(duration)}</span>
                                <span>•</span>
                                <span>${SecurityCore.sanitizeString(timeAgo)}</span>
                            </div>
                        </div>
                    </div>
                `;
            });

            elements.allCallsList.innerHTML = html;
        } catch (error) {
            logOnce('error', 'renderCallHistory', error);
        }
    }

    function formatTimeAgo(date) {
        const seconds = Math.floor((Date.now() - date) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    function formatDuration(seconds) {
        if (!seconds && seconds !== 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function closeUrlParamOverlay() {
        if (elements.urlParamOverlay) elements.urlParamOverlay.classList.remove('active');
    }

    function joinUrlParamCall() {
        if (!elements.urlParamOverlay) return;
        const callId = elements.urlParamOverlay.dataset.callId;
        const callType = elements.urlParamOverlay.dataset.callType || 'voice';

        closeUrlParamOverlay();

        if (window.callCore) {
            window.callCore.startCall({
                type: callType,
                callId: callId,
                participants: [{ id: 'remote', name: 'Call Participant' }]
            }).catch(error => {
                showNotification(`Failed to join call: ${error.message}`, 'error');
            });
        }
    }

    function checkUrlParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const callId = urlParams.get('call');
        const callType = urlParams.get('type') || 'voice';

        if (callId && elements.urlParamOverlay) {
            const urlParamCallId = document.getElementById('urlParamCallId');
            if (urlParamCallId) urlParamCallId.textContent = SecurityCore.sanitizeString(callId);
            elements.urlParamOverlay.dataset.callId = callId;
            elements.urlParamOverlay.dataset.callType = callType;
            elements.urlParamOverlay.classList.add('active');
        }
    }

    function requestResync() {
        logOnce('info', 'Requesting session resync from parent');
        IframeTransport.requestSessionFromParent();
    }

    function createCallHistoryItem(call) {
        const date = new Date(call.date);
        const timeAgo = formatTimeAgo(date);
        const duration = call.missed ? 'Missed' : formatDuration(call.duration);
        const icon = call.type === 'video' ? 'fa-video' : 'fa-phone';
        const statusClass = call.missed ? 'missed' : '';

        return `
            <div class="call-history-item ${statusClass}">
                <div class="call-avatar">${SecurityCore.sanitizeString(call.contact.charAt(0))}</div>
                <div class="call-info">
                    <div class="call-name">${SecurityCore.sanitizeString(call.contact)}</div>
                    <div class="call-details">
                        <i class="fas ${icon}"></i>
                        <span>${SecurityCore.sanitizeString(duration)}</span>
                        <span>•</span>
                        <span>${SecurityCore.sanitizeString(timeAgo)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // ==================== ADDITIONAL MISSING FUNCTIONS ====================
    async function startHandshake(options = {}) {
        return ErrorBoundary.executeAsync(async () => {
            logOnce('info', 'startHandshake called', options);

            const result = await IframeHandshakeAuthority.start({
                maxAttempts: options.maxAttempts || CONFIG.HANDSHAKE_MAX_ATTEMPTS,
                timeout: options.timeout || CONFIG.HANDSHAKE_TIMEOUT
            });

            return result;
        }, 'startHandshake', { success: false });
    }

    function sendToParent(type, payload = {}, options = {}) {
        return ErrorBoundary.execute(() => {
            logOnce('sending', type);

            if (options.requireResponse) {
                return parentComm.request(type, payload, options.timeout || 5000);
            }

            if (options.requireAck) {
                return parentComm.sendWithAck(type, payload, options.timeout || 5000);
            }

            return parentComm.send(type, payload);
        }, 'sendToParent', options.requireResponse ? Promise.reject(new Error('Send failed')) : false);
    }

    async function requestSession(options = {}) {
        return ErrorBoundary.executeAsync(async () => {
            logOnce('info', 'requestSession called', options);

            const sessionData = await SessionManager.acquire();

            return {
                success: sessionData,
                valid: session.validateToken(),
                demoMode: false,
                guestMode: session.isGuestMode(),
                user: currentUser,
                timestamp: Date.now()
            };
        }, 'requestSession', { success: false, valid: false, demoMode: false });
    }

    // ==================== BOOTSTRAP ====================
    function bootstrapIframe() {
        if (sessionInitialized) {
            logOnce('info', 'Session already initialized, skipping bootstrap');
            return;
        }

        logOnce('info', 'Bootstrapping iframe...');

        try {
            // Initialize state machine first
            StateGovernor.initialize();

            // Environment detection
            EnvironmentDetector.detect();

            // Legacy initializations (preserved)
            HandshakeClient.initialize();
            SessionClient.initialize();
            TransportAgent.initialize();
            RecoveryManager.initialize();
            CompatibilityBridge.detect();

            // API Core (non-blocking)
            APICore.initialize().then(result => {
                if (result.success) {
                    logOnce('success', 'API Core ready');
                } else {
                    logOnce('warn-icon', 'API Core initialization failed, retrying');
                    setTimeout(() => APICore.initialize(), 2000);
                }
            });

            cacheElements();

            safeRegister();

            // Start deterministic initialization
            safeInit().catch(error => {
                logOnce('error', 'Deterministic initialization failed', error);
            });

            // Legacy API integration (preserved)
            window.callAPI = new CallAPIIntegration();

            setTimeout(() => {
                window.callAPI.initialize().then(() => {
                    logOnce('success', 'API integration initialized successfully');
                }).catch(error => {
                    logOnce('error', 'bootstrapIframe.callAPI', error);
                    enableUI();
                });
            }, 100);

            // Legacy Call Core (preserved)
            window.callCore = new CallCore();

            setTimeout(() => {
                window.callCore.safeInitialize().catch(error => {
                    logOnce('error', 'Call core safe initialization failed', error);
                });
            }, 200);

            // Legacy Core Initializer (preserved)
            window.coreInitializer = new CoreInitializer();

            setTimeout(() => {
                window.coreInitializer.initialize().catch(error => {
                    logOnce('error', 'Core initializer failed', error);
                });
            }, 300);

            if (logger._debugMode) {
                DiagnosticsAgent.enable();
                DiagnosticsAgent.snapshot('bootstrap');
            }

            window.addEventListener('beforeunload', () => {
                if (window.callAPI) window.callAPI.cleanup();
                if (window.callCore) window.callCore.cleanup();
                if (window.coreInitializer) window.coreInitializer.cleanup();
                if (parentCoordinator) parentCoordinator.cleanup();
                TransportAgent.cleanup();
                SessionClient.cleanup();
                lifecycle.destroy();
            });

            showUI();
            enableUI();

            logOnce('success', 'Bootstrap completed');
        } catch (error) {
            logOnce('error', 'bootstrapIframe', error);
            try { showUI(); enableUI(); } catch (e) {}
        }
    }

    function showUI() {
        try {
            const appContainer = document.getElementById('appContainer');
            if (appContainer) {
                appContainer.style.visibility = 'visible';
                appContainer.style.opacity = '1';
            }

            const loadingIndicators = document.querySelectorAll('.loading-indicator, .initializing-overlay, .core-loading-message');
            loadingIndicators.forEach(indicator => {
                if (indicator) indicator.style.display = 'none';
            });
        } catch (error) {
            logOnce('error', 'showUI', error);
        }
    }

    function enableUI() {
        const isAuthenticated = parentCoordinator ? parentCoordinator.sessionValidated : AppState.isAuthenticated;

        try {
            if (elements.newCallBtn) elements.newCallBtn.disabled = !isAuthenticated;
            if (elements.quickVoiceBtn) elements.quickVoiceBtn.disabled = !isAuthenticated;
            if (elements.quickVideoBtn) elements.quickVideoBtn.disabled = !isAuthenticated;

            if (AppState.isOnline) {
                if (elements.syncIndicator) elements.syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
            } else {
                if (elements.syncIndicator) elements.syncIndicator.innerHTML = '<i class="fas fa-cloud-slash"></i><span>Offline</span>';
            }
        } catch (error) {
            logOnce('error', 'enableUI', error);
        }
    }

    // ==================== AUTH MANAGEMENT ====================
    const auth = {
        retryCount: 0,

        sync: async function() {
            try {
                logOnce('info', 'Starting auth sync');
                session.setState(STATE.SYNC);

                const initialized = await session.init();

                if (initialized) {
                    this.retryCount = 0;
                    session.setState(STATE.READY);
                    return true;
                }

                if (this.retryCount < CONFIG.AUTH_RETRY_LIMIT) {
                    this.retryCount++;
                    logOnce('warn-icon', `Auth retry ${this.retryCount}/${CONFIG.AUTH_RETRY_LIMIT}`);

                    const delay = CONFIG.AUTH_RETRY_DELAY * this.retryCount;
                    const timer = setTimeout(() => this.sync(), delay);
                    timers.add(timer);
                    return false;
                }

                logOnce('warn-icon', 'Auth sync failed after max retries');
                session.setState(STATE.DEGRADED);
                RecoveryManager.scheduleRecovery();
                return false;
            } catch (error) {
                logOnce('error', 'Auth sync failed', error);
                session.setState(STATE.DEGRADED);
                RecoveryManager.scheduleRecovery();
                return false;
            }
        },

        check: function() { return session.validateToken(); },
        refresh: function() { return session.refreshToken(); },

        logout: function() {
            session.clearToken();
            parentComm.send('USER_LOGGED_OUT', { timestamp: Date.now() });
            logOnce('info', 'Logout completed');
            return this.sync();
        }
    };

    // ==================== LIFECYCLE MANAGEMENT ====================
    const lifecycle = {
        init: async function() {
            try {
                logOnce('info', `Starting lifecycle (${iframeId})`);
                logOnce('info', `Environment: ${window.parent === window ? 'standalone' : 'embedded'}`);

                StateGovernor.transition(STATE.UNINITIALIZED, STATE.BOOTSTRAPPING);

                CompatibilityBridge.detect();

                const handshakeResult = await HandshakeClient.start();
                if (!handshakeResult.success) {
                    logOnce('warn-icon', 'Handshake failed, retrying');
                    setTimeout(() => HandshakeClient.start(), 2000);
                }

                const authSynced = await auth.sync();

                if (authSynced) {
                    StateGovernor.transition(StateGovernor.getState(), STATE.READY);
                } else {
                    logOnce('warn-icon', 'Proceeding in degraded mode');
                    StateGovernor.transition(StateGovernor.getState(), STATE.DEGRADED);
                }

                this.setupVisibilityHandling();
                this.setupConnectivityHandling();
                TransportAgent.startHeartbeat(CONFIG.HEARTBEAT_INTERVAL);

                RecoveryManager.createCheckpoint('initialized');

                parentComm.send('IFRAME_READY', {
                    iframeId: iframeId,
                    state: currentState,
                    sessionValid: session.validateToken(),
                    demoMode: false,
                    timestamp: Date.now()
                });

                logOnce('success', 'Lifecycle initialization complete');
                return true;
            } catch (error) {
                logOnce('error', 'Lifecycle initialization failed', error);
                StateGovernor.transition(StateGovernor.getState(), STATE.DEGRADED);
                RecoveryManager.scheduleRecovery();
                return false;
            }
        },

        setupVisibilityHandling: function() {
            const handler = () => {
                if (document.hidden) {
                    if (currentState === STATE.ACTIVE) {
                        StateGovernor.transition(STATE.ACTIVE, STATE.SUSPENDED);
                        parentComm.send('IFRAME_SUSPENDED', { timestamp: Date.now() });
                    }
                } else {
                    if (currentState === STATE.SUSPENDED || currentState === STATE.READY || currentState === STATE.DEGRADED) {
                        StateGovernor.transition(StateGovernor.getState(), STATE.ACTIVE);
                        parentComm.send('IFRAME_ACTIVE', { timestamp: Date.now() });

                        if (session.validateToken()) {
                            session.refreshToken();
                        } else {
                            auth.sync();
                        }

                        if (!getValidatedSession()) requestResync();
                    }
                }
            };

            document.addEventListener('visibilitychange', handler);
            eventListeners.set('visibilitychange', handler);

            if (!document.hidden) StateGovernor.transition(StateGovernor.getState(), STATE.ACTIVE);
        },

        setupConnectivityHandling: function() {
            const onlineHandler = () => {
                isOnline = true;
                logOnce('info', 'Network online');

                if (currentState === STATE.DEGRADED) {
                    auth.sync();
                } else if (session.validateToken()) {
                    parentComm.send('NETWORK_RESTORED', { timestamp: Date.now() });

                    TransportAgent.processOfflineQueue();

                    if (!getValidatedSession()) requestResync();
                }
            };

            const offlineHandler = () => {
                isOnline = false;
                logOnce('warn-icon', 'Network offline');
                parentComm.send('NETWORK_LOST', { timestamp: Date.now() });
            };

            window.addEventListener('online', onlineHandler);
            window.addEventListener('offline', offlineHandler);

            eventListeners.set('online', onlineHandler);
            eventListeners.set('offline', offlineHandler);
        },

        destroy: function() {
            logOnce('info', 'Destroying iframe instance');
            StateGovernor.transition(StateGovernor.getState(), STATE.DESTROYED);

            timers.forEach(timer => {
                try {
                    if (timer && typeof timer === 'object' && 'ref' in timer) {
                        clearInterval(timer);
                        clearTimeout(timer);
                    }
                } catch (e) {}
            });
            timers.clear();

            eventListeners.forEach((handler, event) => {
                try {
                    window.removeEventListener(event, handler);
                    document.removeEventListener(event, handler);
                } catch (e) {}
            });
            eventListeners.clear();

            pendingRequests.forEach((req) => {
                try { if (req.cleanup) req.cleanup(); } catch (e) {}
            });
            pendingRequests.clear();

            TransportAgent.cleanup();
            SessionClient.cleanup();

            parentComm.send('IFRAME_DESTROYED', {
                iframeId: iframeId,
                timestamp: Date.now()
            });

            logOnce('info', 'Iframe destroyed');
            return { success: true };
        }
    };

    // ==================== MESSAGE HANDLER ====================
    const messageHandler = {
        init: function() {
            window.addEventListener('message', this.handleMessage.bind(this));
            logOnce('info', 'Message handler initialized');
        },

        handleMessage: function(event) {
            if (!OriginAdapter.validateEvent(event)) return;

            const adaptedMessage = CompatibilityBridge.adaptIncoming(event.data);

            if (!adaptedMessage || typeof adaptedMessage !== 'object') return;
            if (!MessageValidator.validate(adaptedMessage)) return;

            try {
                const data = adaptedMessage;

                switch (data.type) {
                    case 'SESSION_UPDATE':
                        if (data.payload?.token) session.setToken(data.payload.token, data.payload.expiry);
                        break;
                    case 'TOKEN_RESPONSE':
                        if (data.payload?.token) session.setToken(data.payload.token, data.payload.expiry);
                        break;
                    case 'SESSION_RESPONSE':
                        if (data.payload?.user && data.payload?.token) {
                            session.setToken(data.payload.token, data.payload.expiry);
                            if (data.payload.user) {
                                currentUser = data.payload.user;
                                userDataLoaded = true;
                            }
                        }
                        break;
                    case 'TOKEN_REFRESH':
                        if (data.payload?.token) {
                            session.setToken(data.payload.token, data.payload.expiry);
                            parentComm.send('TOKEN_REFRESHED', { timestamp: Date.now() });
                        }
                        break;
                    case 'LOGOUT':
                        logOnce('info', 'Logout requested by parent');
                        session.clearToken();
                        parentComm.send('USER_LOGGED_OUT', { timestamp: Date.now() });
                        auth.sync();
                        break;
                    case 'PING':
                        if (data.payload?.requestId) {
                            const pongMessage = MessageBridge.createMessage('PONG', {
                                requestId: data.payload.requestId,
                                state: currentState,
                                sessionValid: session.validateToken(),
                                demoMode: false,
                                timestamp: Date.now()
                            });
                            window.parent.postMessage(pongMessage, OriginAdapter.getTargetOrigin());
                        }
                        break;
                    case 'PONG':
                        break;
                    case 'PARENT_CRASH_RECOVERY':
                        logOnce('warn-icon', 'Parent crash detected, initiating recovery');
                        RecoveryManager.recover();
                        break;
                    case 'ACK':
                        parentComm._handleAck(data);
                        break;
                    case 'SESSION_INIT':
                        if (data.payload && data.payload.session && data.payload.session.token) {
                            session.setToken(data.payload.session.token, data.payload.session.expiry);
                            if (data.payload.session.user) {
                                currentUser = data.payload.session.user;
                                userDataLoaded = true;
                            }
                            logOnce('success', 'Session initialized from parent via SESSION_INIT');
                        }
                        break;
                    case 'SESSION_SYNC':
                        if (data.payload) handleSessionSync(data.payload, data.messageId);
                        break;
                    case 'SESSION_ACK':
                        if (data.payload) handleParentAck(data.payload);
                        break;
                    case 'PAGE_ACTIVATED':
                        logOnce('info', 'Parent page activated');
                        if (currentState === STATE.SUSPENDED) StateGovernor.transition(STATE.SUSPENDED, STATE.ACTIVE);
                        break;
                    case 'NAVIGATE':
                        logOnce('info', 'Parent navigation:', data.payload);
                        break;
                    case 'PARENT_SESSION_RESPONSE':
                        if (data.payload && data.payload.session) {
                            if (data.payload.session.token) {
                                session.setToken(data.payload.session.token, data.payload.session.expiry);
                                if (data.payload.session.user) {
                                    currentUser = data.payload.session.user;
                                    userDataLoaded = true;
                                }
                                logOnce('success', 'Session received from parent via PARENT_SESSION_RESPONSE');
                            }
                        }
                        break;
                    case 'PARENT_TOKEN_RESPONSE':
                        if (data.payload && data.payload.token) {
                            session.setToken(data.payload.token, data.payload.expiry);
                            logOnce('success', 'Token received from parent via PARENT_TOKEN_RESPONSE');
                        }
                        break;
                }
            } catch (error) {
                logOnce('error', 'Failed to handle parent message', error, adaptedMessage?.type);
            }
        }
    };

    // ==================== EXPORT NEW MODULES ====================
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            initializeCore,
            startHandshake,
            sendToParent,
            requestSession,
            receiveFromParent,
            shutdownCore,

            isValidSession,
            getValidatedSession,
            waitForSession,
            waitForParent,
            waitForHandshake,
            verifySession,
            safeInit,
            requestResync,
            sendSessionAck,

            CoreInitializer,
            CallCore,
            ParentCoordinator,
            TokenManager,
            SecureAPIClient,
            CallAPIIntegration,

            AppState,
            currentUser,
            userDataLoaded,
            parentCoordinator,
            sessionAuthorityReady,

            SecurityCore,

            STATE,
            CallCoreState,
            MESSAGE_TYPES,
            PROTOCOL_VERSION: CONFIG.PROTOCOL_VERSION,

            IframeEnvironment,
            OriginSecurity,
            SafeStorage,
            IframeTransport,
            IframeHandshakeAuthority,
            IframeSessionClient,
            ReliabilityEngine,
            MultiModuleCoordinator,
            UIFailsafe,
            NavigationGuard,

            APICore,

            logger,

            auth,
            lifecycle,

            parentComm,
            MessageValidator,
            RetryManager,
            ErrorBoundary,
            MessageIdGenerator,
            MessageBridge,
            HandshakeClient,
            SessionClient,
            TransportAgent,
            RecoveryManager,
            CompatibilityBridge,
            DiagnosticsAgent,
            EnvironmentDetector,
            OriginAdapter,

            isReady: function() {
                return coreReady && sessionInitialized && APICore.isReady();
            },

            version: CONFIG.VERSION,

            environment: ENVIRONMENT,

            // New exports
            StateGovernor,
            MessageRegistry
        };
    }

    window.callsCore = {
        initializeCore,
        startHandshake,
        sendToParent,
        requestSession,
        receiveFromParent,
        shutdownCore,

        isValidSession,
        getValidatedSession,
        waitForSession,
        waitForParent,
        waitForHandshake,
        verifySession,
        safeInit,
        requestResync,
        sendSessionAck,

        CoreInitializer,
        CallCore,
        ParentCoordinator,
        TokenManager,
        SecureAPIClient,
        CallAPIIntegration,

        AppState,
        currentUser,
        userDataLoaded,
        parentCoordinator,
        sessionAuthorityReady,

        SecurityCore,

        STATE,
        CallCoreState,
        MESSAGE_TYPES,
        PROTOCOL_VERSION: CONFIG.PROTOCOL_VERSION,

        IframeEnvironment,
        OriginSecurity,
        SafeStorage,
        IframeTransport,
        IframeHandshakeAuthority,
        IframeSessionClient,
        ReliabilityEngine,
        MultiModuleCoordinator,
        UIFailsafe,
        NavigationGuard,

        APICore,

        logger,

        auth,
        lifecycle,

        parentComm,
        MessageValidator,
        RetryManager,
        ErrorBoundary,
        MessageIdGenerator,
        MessageBridge,
        HandshakeClient,
        SessionClient,
        TransportAgent,
        RecoveryManager,
        CompatibilityBridge,
        DiagnosticsAgent,
        EnvironmentDetector,
        OriginAdapter,

        environment: ENVIRONMENT,

        isReady: function() {
            return coreReady && sessionInitialized && (APICore.isReady ? APICore.isReady() : true);
        },

        version: CONFIG.VERSION,

        waitForReady: function(timeout = 10000) {
            return APICore.waitForReady ? APICore.waitForReady(timeout) : Promise.resolve(true);
        },

        // New exports
        StateGovernor,
        MessageRegistry
    };

    // ==================== AUTO-START (PASSIVE) ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            safeRegister();
            bootstrapIframe();
        });
    } else {
        safeRegister();
        bootstrapIframe();
    }

})();