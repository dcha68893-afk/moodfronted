// =============================================
// STATUS SYSTEM - PASSIVE IFRAME MODULE
// DETERMINISTIC MICRO-FRONTEND VERSION v8.1
// PARENT-AUTHORITY ARCHITECTURE - STRICT LIFECYCLE
// ALL EXISTING FEATURES PRESERVED - TIMEOUTS REMOVED
// =============================================

// =============================================
// CLEAN CONSOLE LOGGING - SINGLE INSTANCE, NO SPAM
// =============================================
const DEBUG = true;
const MODULE_NAME = "status";

// Track which messages have been logged - prevents duplicates
const _loggedMessages = new Set();
const _loggedStatuses = new Set();

function logStatus(type, message, data = null) {
    // Create a unique key for this message
    const key = `${type}:${message}`;
    
    // If we've already logged this exact status, don't log again
    if (_loggedStatuses.has(key)) {
        return;
    }
    
    // Mark as logged
    _loggedStatuses.add(key);
    
    const now = Date.now();
    const emoji = {
        'INIT': '🚀',
        'SENDING': '📤',
        'WAITING': '⏳',
        'SUCCESS': '✅',
        'FAILED': '❌',
        'READY': '🔵',
        'WARNING': '⚠️',
        'DISCONNECTED': '🔴',
        'VIEW': '👁️',
        'REACTION': '👍',
        'POST': '📝',
        'EXPIRE': '⌛'
    }[type] || '📋';
    
    console.log(`%c[${MODULE_NAME}] ${emoji} ${type}: ${message}`, 
        type === 'FAILED' || type === 'DISCONNECTED' ? 'color: #ff3b30; font-weight: bold;' :
        type === 'SUCCESS' || type === 'READY' ? 'color: #34c759; font-weight: bold;' :
        type === 'WARNING' ? 'color: #ff9500; font-weight: bold;' :
        type === 'SENDING' || type === 'WAITING' ? 'color: #0084ff; font-weight: bold;' :
        type === 'VIEW' ? 'color: #5856d6; font-weight: bold;' :
        type === 'REACTION' ? 'color: #ff2d55; font-weight: bold;' :
        type === 'POST' ? 'color: #64d2ff; font-weight: bold;' :
        'color: #5856d6; font-weight: bold;'
    );
    
    if (data && Object.keys(data).length > 0) {
        console.log('  📦', data);
    }
}

// Debug functions - each logs only once
const _debugLogs = new Set();
function debugLog(...args) {
    if (!DEBUG) return;
    
    const key = args.join('|');
    if (_debugLogs.has(key)) return;
    _debugLogs.add(key);
    
    console.log(`[${MODULE_NAME}]`, ...args);
}

const _debugErrors = new Set();
function debugError(...args) {
    if (!DEBUG) return;
    
    const key = args.join('|');
    if (_debugErrors.has(key)) return;
    _debugErrors.add(key);
    
    console.error(`[${MODULE_NAME} ERROR]`, ...args);
}

const _debugWarns = new Set();
function debugWarn(...args) {
    if (!DEBUG) return;
    
    const key = args.join('|');
    if (_debugWarns.has(key)) return;
    _debugWarns.add(key);
    
    console.warn(`[${MODULE_NAME} WARN]`, ...args);
}

// =============================================
// LIFECYCLE STATE MACHINE - DETERMINISTIC (STRICT)
// =============================================
const LifecycleState = {
    BOOTING: 'BOOTING',
    INITIALIZING: 'INITIALIZING',
    READY: 'READY',
    WAIT_PARENT: 'WAIT_PARENT',
    ACTIVE: 'ACTIVE'
};

let _currentLifecycleState = LifecycleState.BOOTING;
let _previousLifecycleState = null;
let _lifecycleTransitionLock = false;

const _allowedLifecycleTransitions = {
    [LifecycleState.BOOTING]: [LifecycleState.INITIALIZING],
    [LifecycleState.INITIALIZING]: [LifecycleState.READY],
    [LifecycleState.READY]: [LifecycleState.WAIT_PARENT],
    [LifecycleState.WAIT_PARENT]: [LifecycleState.ACTIVE],
    [LifecycleState.ACTIVE]: []
};

function setLifecycleState(newState) {
    if (_lifecycleTransitionLock) {
        debugWarn(`Transition blocked - lock active: ${_currentLifecycleState} → ${newState}`);
        return false;
    }
    
    if (_currentLifecycleState === newState) {
        return true;
    }
    
    const allowed = _allowedLifecycleTransitions[_currentLifecycleState] || [];
    if (!allowed.includes(newState)) {
        debugWarn(`Invalid transition: ${_currentLifecycleState} → ${newState}`);
        return false;
    }
    
    _lifecycleTransitionLock = true;
    _previousLifecycleState = _currentLifecycleState;
    _currentLifecycleState = newState;
    
    const key = `lifecycle_${_previousLifecycleState}_to_${newState}`;
    if (!_loggedMessages.has(key)) {
        _loggedMessages.add(key);
        logStatus('INFO', `Lifecycle: ${_previousLifecycleState} → ${newState}`);
    }
    
    _lifecycleTransitionLock = false;
    return true;
}

function isLifecycleState(state) {
    return _currentLifecycleState === state;
}

function canTransitionToLifecycleState(state) {
    const allowed = _allowedLifecycleTransitions[_currentLifecycleState] || [];
    return allowed.includes(state);
}

function resetLifecycleState() {
    _currentLifecycleState = LifecycleState.BOOTING;
    _previousLifecycleState = null;
}

const LifecycleFSM = {
    currentState: _currentLifecycleState,
    previousState: _previousLifecycleState,
    transitionLock: _lifecycleTransitionLock,
    allowedTransitions: _allowedLifecycleTransitions,
    
    transition(newState) {
        return setLifecycleState(newState);
    },
    
    is(state) {
        return isLifecycleState(state);
    },
    
    canTransitionTo(state) {
        return canTransitionToLifecycleState(state);
    },
    
    reset() {
        resetLifecycleState();
    }
};

// =============================================
// STANDARDIZED MESSAGE SCHEMA VALIDATOR - STRICT
// =============================================
const MessageValidator = {
    requiredFields: ['type', 'source', 'target', 'messageId', 'timestamp'],
    
    validate(message) {
        try {
            if (!message || typeof message !== 'object') {
                return { valid: false, reason: 'Not an object' };
            }
            
            // Check required fields
            for (const field of this.requiredFields) {
                if (!message[field]) {
                    return { valid: false, reason: `Missing required field: ${field}` };
                }
            }
            
            // Validate field types
            if (typeof message.type !== 'string') {
                return { valid: false, reason: 'type must be string' };
            }
            
            if (typeof message.source !== 'string') {
                return { valid: false, reason: 'source must be string' };
            }
            
            if (message.target !== 'parent') {
                return { valid: false, reason: `Invalid target: ${message.target} - must be 'parent'` };
            }
            
            if (typeof message.messageId !== 'string') {
                return { valid: false, reason: 'messageId must be string' };
            }
            
            if (typeof message.timestamp !== 'number') {
                return { valid: false, reason: 'timestamp must be number' };
            }
            
            // Validate timestamp recency (within 5 minutes) - warning only, not blocking
            const now = Date.now();
            if (Math.abs(now - message.timestamp) > 300000) {
                debugWarn(`Timestamp out of range for ${message.type}: ${message.timestamp}`);
            }
            
            return { valid: true };
        } catch (error) {
            return { valid: false, reason: error.message };
        }
    },
    
    createMessage(type, payload = {}, options = {}) {
        return {
            type,
            source: MODULE_NAME,
            target: 'parent',
            messageId: this.generateMessageId(),
            timestamp: Date.now(),
            payload,
            ...options
        };
    },
    
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${Math.floor(Math.random() * 1000)}`;
    }
};

// Duplicate message protection
const processedMessages = new Set();

function isDuplicate(messageId) {
    if (processedMessages.has(messageId)) return true;
    processedMessages.add(messageId);
    
    // Limit set size
    if (processedMessages.size > 1000) {
        const first = processedMessages.values().next().value;
        processedMessages.delete(first);
    }
    return false;
}

// =============================================
// ENVIRONMENT AUTO-DETECTION SYSTEM (PRESERVED)
// =============================================
const IframeEnvironment = {
    type: 'UNKNOWN',
    isLocalDev: false,
    isRenderHosted: false,
    isVPNNetwork: false,
    isProduction: false,
    isSandboxed: false,
    isSecure: false,
    latency: 0,
    bandwidth: 0,
    connectionType: 'unknown',
    effectiveType: 'unknown',
    rtt: 0,
    downlink: 0,
    saveData: false,
    
    detect() {
        try {
            const start = performance.now();
            
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;
            const isSecureContext = window.isSecureContext || protocol === 'https:';
            
            // Local development detection
            this.isLocalDev = (
                hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname.startsWith('192.168.') ||
                hostname.startsWith('10.') ||
                hostname.includes('.local') ||
                hostname.includes('.test') ||
                protocol === 'file:' ||
                hostname.includes('::1')
            );
            
            // Render.com hosted detection
            this.isRenderHosted = (
                hostname.includes('.onrender.com') ||
                hostname.includes('.render.com') ||
                hostname.includes('render.com')
            );
            
            // VPN/High latency detection using Network Information API
            if (navigator.connection) {
                const conn = navigator.connection;
                this.latency = conn.rtt || 0;
                this.bandwidth = conn.downlink || 0;
                this.connectionType = conn.type || 'unknown';
                this.effectiveType = conn.effectiveType || 'unknown';
                this.rtt = conn.rtt || 0;
                this.downlink = conn.downlink || 0;
                this.saveData = conn.saveData || false;
                
                // Detect VPN based on latency patterns
                this.isVPNNetwork = (
                    this.latency > 300 ||
                    this.effectiveType === 'slow-2g' ||
                    this.effectiveType === '2g' ||
                    (this.latency > 150 && this.latency < 300 && this.saveData)
                );
            } else {
                // Fallback detection using fetch timing
                const end = performance.now();
                this.latency = end - start;
                this.isVPNNetwork = this.latency > 300;
            }
            
            // Production detection
            this.isProduction = (
                !this.isLocalDev &&
                !this.isRenderHosted &&
                isSecureContext &&
                !hostname.includes('.local') &&
                !hostname.includes('.test') &&
                hostname.includes('.')
            );
            
            // Sandbox detection
            try {
                this.isSandboxed = (
                    !window.parent ||
                    window.parent === window ||
                    (() => {
                        try {
                            return !window.parent.location;
                        } catch {
                            return true;
                        }
                    })()
                );
            } catch {
                this.isSandboxed = true;
            }
            
            this.isSecure = isSecureContext;
            
            // Determine environment type
            if (this.isLocalDev) this.type = 'LOCAL_DEV';
            else if (this.isRenderHosted) this.type = 'RENDER_HOSTED';
            else if (this.isVPNNetwork) this.type = 'VPN_NETWORK';
            else if (this.isProduction) this.type = 'PRODUCTION';
            else this.type = 'UNKNOWN';
            
            logStatus('INIT', `Environment: ${this.type}`);
            
            return this.type;
        } catch (e) {
            debugError('Environment detection failed:', e);
            this.type = 'UNKNOWN';
            return this.type;
        }
    },
    
    getConfig() {
        const baseConfig = {
            handshakeTimeout: 5000,
            heartbeatInterval: 30000,
            maxRetries: 3,
            maxRecoveryAttempts: 3,
            originChecks: 'standard',
            crypto: 'enabled',
            compatibilityMode: false,
            batchMessages: false,
            keepalive: false,
            offlineBufferSize: 100,
            retryBackoff: 'exponential',
            jitter: true
        };
        
        switch(this.type) {
            case 'LOCAL_DEV':
                return {
                    ...baseConfig,
                    handshakeTimeout: 5000,
                    heartbeatInterval: 30000,
                    maxRetries: 3,
                    maxRecoveryAttempts: 3,
                    originChecks: 'relaxed',
                    crypto: 'disabled',
                    compatibilityMode: true,
                    batchMessages: false,
                    keepalive: false
                };
            case 'RENDER_HOSTED':
                return {
                    ...baseConfig,
                    handshakeTimeout: 8000,
                    heartbeatInterval: 25000,
                    maxRetries: 5,
                    maxRecoveryAttempts: 4,
                    originChecks: 'strict',
                    crypto: 'enabled',
                    compatibilityMode: false,
                    batchMessages: true,
                    keepalive: true
                };
            case 'VPN_NETWORK':
                return {
                    ...baseConfig,
                    handshakeTimeout: 15000,
                    heartbeatInterval: 45000,
                    maxRetries: 7,
                    maxRecoveryAttempts: 5,
                    originChecks: 'standard',
                    crypto: 'enabled',
                    compatibilityMode: false,
                    batchMessages: true,
                    keepalive: true,
                    offlineBufferSize: 200,
                    retryBackoff: 'fibonacci'
                };
            case 'PRODUCTION':
                return {
                    ...baseConfig,
                    handshakeTimeout: 5000,
                    heartbeatInterval: 20000,
                    maxRetries: 3,
                    maxRecoveryAttempts: 2,
                    originChecks: 'strict',
                    crypto: 'enabled',
                    compatibilityMode: false,
                    batchMessages: false,
                    keepalive: false
                };
            default:
                return baseConfig;
        }
    },
    
    getCapabilities() {
        return {
            localStorage: !!window.localStorage,
            sessionStorage: !!window.sessionStorage,
            serviceWorker: 'serviceWorker' in navigator,
            indexedDB: !!window.indexedDB,
            webWorker: !!window.Worker,
            webSocket: !!window.WebSocket,
            webRTC: !!window.RTCPeerConnection,
            crypto: !!window.crypto && !!window.crypto.subtle,
            mediaDevices: !!navigator.mediaDevices,
            geolocation: !!navigator.geolocation,
            notifications: 'Notification' in window,
            bluetooth: !!navigator.bluetooth,
            usb: !!navigator.usb,
            hid: !!navigator.hid,
            serial: !!navigator.serial,
            webShare: !!navigator.share,
            webAssembly: !!window.WebAssembly,
            bigInt: typeof BigInt !== 'undefined',
            webGL: (() => {
                try {
                    const canvas = document.createElement('canvas');
                    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
                } catch {
                    return false;
                }
            })(),
            webGL2: (() => {
                try {
                    const canvas = document.createElement('canvas');
                    return !!canvas.getContext('webgl2');
                } catch {
                    return false;
                }
            })(),
            webAudio: !!window.AudioContext || !!window.webkitAudioContext,
            webMIDI: !!navigator.requestMIDIAccess,
            webUSB: !!navigator.usb,
            webBluetooth: !!navigator.bluetooth,
            webNFC: !!navigator.nfc,
            webXR: !!navigator.xr,
            webVTT: !!window.VTTCue,
            webAnimation: !!document.createElement('div').animate,
            webSpeech: !!window.SpeechRecognition || !!window.webkitSpeechRecognition,
            webPayment: !!window.PaymentRequest,
            webCredentials: !!navigator.credentials,
            webLocks: !!navigator.locks,
            webStorage: !!window.localStorage,
            webDatabase: !!window.openDatabase,
            webSQL: !!window.openDatabase,
            webIndexedDB: !!window.indexedDB,
            webFileSystem: !!window.requestFileSystem || !!window.webkitRequestFileSystem,
            webFileReader: !!window.FileReader,
            webFileWriter: !!window.FileWriter,
            webFile: !!window.File,
            webBlob: !!window.Blob,
            webFormData: !!window.FormData,
            webURL: !!window.URL,
            webURLSearchParams: !!window.URLSearchParams,
            webHeaders: !!window.Headers,
            webRequest: !!window.Request,
            webResponse: !!window.Response,
            webFetch: !!window.fetch,
            webAbortController: !!window.AbortController,
            webAbortSignal: !!window.AbortSignal,
            webIntersectionObserver: !!window.IntersectionObserver,
            webMutationObserver: !!window.MutationObserver,
            webResizeObserver: !!window.ResizeObserver,
            webPerformanceObserver: !!window.PerformanceObserver,
            webReportingObserver: !!window.ReportingObserver,
            webGamepad: !!navigator.getGamepads,
            webBattery: !!navigator.getBattery,
            webVibrate: !!navigator.vibrate,
            webWakeLock: !!navigator.wakeLock,
            webSMS: !!navigator.sms,
            webContacts: !!navigator.contacts,
            webClipboard: !!navigator.clipboard,
            webPermissions: !!navigator.permissions,
            webPresentation: !!navigator.presentation,
            webNetworkInformation: !!navigator.connection,
            webDeviceMemory: !!navigator.deviceMemory,
            webHardwareConcurrency: !!navigator.hardwareConcurrency,
            webMaxTouchPoints: !!navigator.maxTouchPoints,
            webCookieEnabled: navigator.cookieEnabled,
            webDoNotTrack: navigator.doNotTrack,
            webLanguages: !!navigator.languages,
            webPlatform: !!navigator.platform,
            webProduct: !!navigator.product,
            webVendor: !!navigator.vendor
        };
    },
    
    logEnvironment() {
        // Already logged in detect()
    }
};

// Initialize the detector
IframeEnvironment.detect();

// =============================================
// COMPATIBILITY BRIDGE - ENSURES BACKWARD COMPATIBILITY (PRESERVED)
// =============================================
const CompatibilityBridge = {
    version: '8.0',
    legacyMode: false,
    adapters: new Map(),
    transforms: new Map(),
    fallbacks: new Map(),
    
    initialize() {
        this.legacyMode = IframeEnvironment.type === 'LOCAL_DEV' || IframeEnvironment.isSandboxed;
        this.registerAdapters();
        this.registerTransforms();
        this.registerFallbacks();
        debugLog('CompatibilityBridge initialized, legacyMode:', this.legacyMode);
        return this;
    },
    
    registerAdapters() {
        // Message adapters
        this.adapters.set('message', {
            toLegacy: (msg) => {
                if (!msg) return msg;
                return {
                    ...msg,
                    type: msg.type || msg.event,
                    data: msg.payload || msg.data,
                    id: msg.messageId || msg.id,
                    timestamp: msg.timestamp || Date.now()
                };
            },
            fromLegacy: (msg) => {
                if (!msg) return msg;
                return MessageValidator.createMessage(
                    msg.type || msg.event,
                    msg.data || msg.payload || {},
                    { messageId: msg.id || msg.messageId }
                );
            }
        });
        
        // Session adapters
        this.adapters.set('session', {
            toLegacy: (session) => {
                if (!session) return session;
                return {
                    ...session,
                    user: session.user || session.userData,
                    token: session.token || session.accessToken,
                    refreshToken: session.refreshToken || session.refresh_token
                };
            },
            fromLegacy: (session) => {
                if (!session) return session;
                return {
                    ...session,
                    user: session.user || session.userData,
                    token: session.token || session.accessToken,
                    refreshToken: session.refreshToken || session.refresh_token
                };
            }
        });
        
        // Storage adapters
        this.adapters.set('storage', {
            toLegacy: (key, value) => {
                return { key, value };
            },
            fromLegacy: (key, value) => {
                return { key, value };
            }
        });
    },
    
    registerTransforms() {
        this.transforms.set('handshake', (data) => {
            if (this.legacyMode) {
                return {
                    ...data,
                    protocol: '1.0',
                    handshake: data.handshake || data.handshakeId
                };
            }
            return data;
        });
        
        this.transforms.set('status', (data) => {
            if (this.legacyMode) {
                return {
                    ...data,
                    statusId: data.statusId || data.id,
                    userId: data.userId || data.user?.id
                };
            }
            return data;
        });
        
        this.transforms.set('reaction', (data) => {
            if (this.legacyMode) {
                return {
                    ...data,
                    reactionType: data.reactionType || data.reaction,
                    statusId: data.statusId || data.id
                };
            }
            return data;
        });
    },
    
    registerFallbacks() {
        this.fallbacks.set('postMessage', (target, message, origin) => {
            try {
                if (typeof target.postMessage === 'function') {
                    return target.postMessage(message, origin || '*');
                }
                return false;
            } catch (e) {
                return false;
            }
        });
        
        this.fallbacks.set('localStorage', {
            get: (key) => {
                try {
                    return localStorage.getItem(key);
                } catch {
                    return null;
                }
            },
            set: (key, value) => {
                try {
                    localStorage.setItem(key, value);
                    return true;
                } catch {
                    return false;
                }
            },
            remove: (key) => {
                try {
                    localStorage.removeItem(key);
                    return true;
                } catch {
                    return false;
                }
            }
        });
        
        this.fallbacks.set('fetch', async (url, options) => {
            try {
                return await fetch(url, options);
            } catch (e) {
                throw new Error('Fetch failed in compatibility mode');
            }
        });
    },
    
    adapt(type, data, direction = 'to') {
        const adapter = this.adapters.get(type);
        if (!adapter) return data;
        
        try {
            return direction === 'to' ? adapter.toLegacy(data) : adapter.fromLegacy(data);
        } catch (e) {
            return data;
        }
    },
    
    transform(type, data) {
        const transform = this.transforms.get(type);
        if (!transform) return data;
        
        try {
            return transform(data);
        } catch (e) {
            return data;
        }
    },
    
    fallback(type, ...args) {
        const fallback = this.fallbacks.get(type);
        if (!fallback) return null;
        
        try {
            return typeof fallback === 'function' ? fallback(...args) : fallback;
        } catch (e) {
            return null;
        }
    },
    
    isLegacy() {
        return this.legacyMode;
    }
}.initialize();

// =============================================
// STANDALONE MODE DETECTION
// =============================================
const isStandaloneMode = !window.parent || window.parent === window || !document.referrer;

if (isStandaloneMode && !_loggedMessages.has('standalone')) {
    _loggedMessages.add('standalone');
    debugLog('Running in standalone mode (no parent iframe)');
}

// =============================================
// IFRAME AUTHORITY - CENTRALIZED CONTROL (PRESERVED)
// =============================================
const IframeAuthority = {
    id: `iframe_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`,
    instanceId: `instance_${Date.now()}_${Math.random().toString(36).substr(2, 15)}`,
    parentOrigin: null,
    parentDetected: false,
    parentCapabilities: new Set(),
    securityLevel: 'standard',
    compatibilityMode: IframeEnvironment.type === 'LOCAL_DEV' || IframeEnvironment.isSandboxed,
    backendDomain: 'https://moodchat-fy56.onrender.com',
    frontendDomain: 'https://moodfronted.onrender.com',
    trustedDomains: new Set([
        'https://moodchat-fy56.onrender.com',
        'https://moodfronted.onrender.com',
        'http://localhost:3000',
        'http://localhost:5500',
        'http://localhost:5000',
        'http://localhost:8080',
        'https://localhost:3000',
        'https://localhost:5500',
        'https://localhost:5000',
        'https://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5500',
        'http://127.0.0.1:5000',
        'http://127.0.0.1:8080',
        'https://127.0.0.1:3000',
        'https://127.0.0.1:5500',
        'https://127.0.0.1:5000',
        'https://127.0.0.1:8080'
    ]),
    
    initialize() {
        this.detectParent();
        this.validateSecurityContext();
        this.addTrustedDomain(this.backendDomain);
        this.addTrustedDomain(this.frontendDomain);
        debugLog('IframeAuthority initialized');
        return this;
    },
    
    detectParent() {
        try {
            this.parentDetected = !!(window.parent && window.parent !== window);
            if (this.parentDetected && document.referrer) {
                try {
                    this.parentOrigin = new URL(document.referrer).origin;
                    this.addTrustedDomain(this.parentOrigin);
                    debugLog('Parent detected from referrer:', this.parentOrigin);
                } catch {}
            }
        } catch (e) {
            this.parentDetected = false;
        }
    },
    
    validateSecurityContext() {
        if (this.compatibilityMode || IframeEnvironment.isSandboxed) {
            this.securityLevel = 'compatibility';
        } else if (IframeEnvironment.type === 'PRODUCTION') {
            this.securityLevel = 'strict';
        } else {
            this.securityLevel = 'standard';
        }
    },
    
    addTrustedDomain(domain) {
        if (domain) {
            this.trustedDomains.add(domain);
        }
    },
    
    isTrustedOrigin(origin) {
        if (!origin) return false;
        if (this.securityLevel === 'compatibility') return true;
        
        // Check exact match
        if (this.trustedDomains.has(origin)) return true;
        
        // Check wildcard patterns
        if (origin.includes('.onrender.com') || origin.includes('.render.com')) return true;
        
        // Check localhost variations
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) return true;
        
        // Parent origin from referrer
        if (this.parentOrigin && origin === this.parentOrigin) return true;
        
        return false;
    },
    
    getCapabilities() {
        return Array.from(this.parentCapabilities);
    },
    
    getBackendURL(path = '') {
        return `${this.backendDomain}${path}`;
    },
    
    getFrontendURL(path = '') {
        return `${this.frontendDomain}${path}`;
    }
}.initialize();

// =============================================
// DIAGNOSTICS AGENT - TELEMETRY & DEBUGGING (PRESERVED)
// =============================================
const DiagnosticsAgent = {
    enabled: true,
    reports: [],
    maxReports: 100,
    metrics: {
        startTime: Date.now(),
        messagesSent: 0,
        messagesReceived: 0,
        errors: 0,
        warnings: 0,
        handshakeAttempts: 0,
        handshakeSuccess: 0,
        handshakeFailures: 0,
        recoveryAttempts: 0,
        recoverySuccess: 0,
        recoveryFailures: 0,
        tokenRefreshes: 0,
        apiCalls: 0,
        apiErrors: 0,
        storageReads: 0,
        storageWrites: 0,
        storageErrors: 0,
        offlineOperations: 0,
        statusViews: 0,
        statusReactions: 0,
        statusPosts: 0,
        statusExpired: 0
    },
    events: [],
    maxEvents: 1000,
    
    enable() {
        this.enabled = true;
        debugLog('Diagnostics enabled');
    },
    
    disable() {
        this.enabled = false;
    },
    
    log(level, module, message, data = null) {
        if (!this.enabled && level !== 'error') return;
        
        const entry = {
            timestamp: Date.now(),
            level,
            module,
            message,
            data: this.sanitize(data),
            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
        };
        
        this.events.push(entry);
        
        if (this.events.length > this.maxEvents) {
            this.events.shift();
        }
        
        if (level === 'error') {
            this.metrics.errors++;
        } else if (level === 'warn') {
            this.metrics.warnings++;
        }
    },
    
    sanitize(data) {
        if (!data || typeof data !== 'object') return data;
        
        try {
            return JSON.parse(JSON.stringify(data, (key, value) => {
                if (key === 'token' || key === 'accessToken' || key === 'refreshToken') {
                    return '[REDACTED]';
                }
                if (typeof value === 'string' && value.length > 1000) {
                    return value.substring(0, 1000) + '... [truncated]';
                }
                return value;
            }));
        } catch {
            return data;
        }
    },
    
    error(module, message, data) {
        this.log('error', module, message, data);
    },
    
    warn(module, message, data) {
        this.log('warn', module, message, data);
    },
    
    info(module, message, data) {
        this.log('info', module, message, data);
    },
    
    debug(module, message, data) {
        this.log('debug', module, message, data);
    },
    
    increment(metric) {
        if (this.metrics[metric] !== undefined) {
            this.metrics[metric]++;
        }
    },
    
    getReport() {
        return {
            timestamp: Date.now(),
            uptime: Date.now() - this.metrics.startTime,
            metrics: { ...this.metrics },
            recentEvents: this.events.slice(-20),
            environment: {
                type: IframeEnvironment.type,
                isLocalDev: IframeEnvironment.isLocalDev,
                isRenderHosted: IframeEnvironment.isRenderHosted,
                isVPNNetwork: IframeEnvironment.isVPNNetwork,
                isProduction: IframeEnvironment.isProduction,
                isSandboxed: IframeEnvironment.isSandboxed,
                latency: IframeEnvironment.latency,
                connectionType: IframeEnvironment.connectionType
            },
            authority: {
                id: IframeAuthority.id,
                instanceId: IframeAuthority.instanceId,
                parentDetected: IframeAuthority.parentDetected,
                parentOrigin: IframeAuthority.parentOrigin,
                securityLevel: IframeAuthority.securityLevel,
                compatibilityMode: IframeAuthority.compatibilityMode
            }
        };
    },
    
    clear() {
        this.events = [];
        this.metrics = {
            startTime: Date.now(),
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0,
            warnings: 0,
            handshakeAttempts: 0,
            handshakeSuccess: 0,
            handshakeFailures: 0,
            recoveryAttempts: 0,
            recoverySuccess: 0,
            recoveryFailures: 0,
            tokenRefreshes: 0,
            apiCalls: 0,
            apiErrors: 0,
            storageReads: 0,
            storageWrites: 0,
            storageErrors: 0,
            offlineOperations: 0,
            statusViews: 0,
            statusReactions: 0,
            statusPosts: 0,
            statusExpired: 0
        };
    }
};

// =============================================
// LOGGING SYSTEM - STRUCTURED, NO DUPLICATES
// =============================================
const LOG_LEVEL = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

let currentLogLevel = LOG_LEVEL.DEBUG;
const errorCache = new Set();
const warningCache = new Set();

function log(level, module, message, data = null) {
    try {
        if (level < currentLogLevel) return;
        
        if (level === LOG_LEVEL.ERROR) {
            const key = `${module}:${message}`;
            if (!errorCache.has(key)) {
                errorCache.add(key);
                DiagnosticsAgent.error(module, message, data);
                setTimeout(() => errorCache.delete(key), 60000);
            }
        } else if (level === LOG_LEVEL.WARN) {
            const key = `${module}:${message}`;
            if (!warningCache.has(key)) {
                warningCache.add(key);
                DiagnosticsAgent.warn(module, message, data);
                setTimeout(() => warningCache.delete(key), 30000);
            }
        }
    } catch (e) {}
}

// =============================================
// SAFE STORAGE LAYER - FALLBACK TO MEMORY (PRESERVED)
// =============================================
const SafeStorage = {
    memoryStore: new Map(),
    storageAvailable: true,
    storageType: 'localStorage',
    quota: 5 * 1024 * 1024, // 5MB
    used: 0,
    
    initialize() {
        this.checkAvailability();
        this.calculateUsage();
        debugLog('SafeStorage initialized, available:', this.storageAvailable, 'type:', this.storageType);
        return this;
    },
    
    checkAvailability() {
        try {
            const testKey = '_knecta_storage_test_';
            const testValue = 'test';
            
            localStorage.setItem(testKey, testValue);
            const result = localStorage.getItem(testKey);
            localStorage.removeItem(testKey);
            
            this.storageAvailable = result === testValue;
            this.storageType = 'localStorage';
        } catch (e) {
            try {
                sessionStorage.setItem('_test_', 'test');
                sessionStorage.removeItem('_test_');
                this.storageAvailable = true;
                this.storageType = 'sessionStorage';
            } catch {
                this.storageAvailable = false;
                this.storageType = 'memory';
            }
        }
    },
    
    calculateUsage() {
        if (!this.storageAvailable || this.storageType === 'memory') return 0;
        
        try {
            let total = 0;
            const storage = this.storageType === 'localStorage' ? localStorage : sessionStorage;
            
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                const value = storage.getItem(key);
                total += (key.length + (value ? value.length : 0)) * 2; // Approximate bytes
            }
            
            this.used = total;
            return total;
        } catch {
            return 0;
        }
    },
    
    hasQuota(size) {
        return this.used + size <= this.quota;
    },
    
    get(key, fallback = null) {
        DiagnosticsAgent.increment('storageReads');
        
        if (this.storageAvailable) {
            try {
                const storage = this.storageType === 'localStorage' ? localStorage : sessionStorage;
                const value = storage.getItem(key);
                if (value !== null) return value;
            } catch (e) {
                DiagnosticsAgent.increment('storageErrors');
                // Silent error
            }
        }
        
        return this.memoryStore.has(key) ? this.memoryStore.get(key) : fallback;
    },
    
    set(key, value) {
        DiagnosticsAgent.increment('storageWrites');
        
        let success = false;
        const size = (key.length + value.length) * 2;
        
        if (this.storageAvailable && this.hasQuota(size)) {
            try {
                const storage = this.storageType === 'localStorage' ? localStorage : sessionStorage;
                storage.setItem(key, String(value));
                this.used += size;
                success = true;
            } catch (e) {
                DiagnosticsAgent.increment('storageErrors');
                // Silent error
            }
        }
        
        this.memoryStore.set(key, String(value));
        return success;
    },
    
    remove(key) {
        if (this.storageAvailable) {
            try {
                const storage = this.storageType === 'localStorage' ? localStorage : sessionStorage;
                const value = storage.getItem(key);
                if (value) {
                    storage.removeItem(key);
                    this.used -= (key.length + value.length) * 2;
                }
            } catch (e) {
                // Silent error
            }
        }
        this.memoryStore.delete(key);
    },
    
    getJSON(key, fallback = null) {
        const value = this.get(key);
        if (!value) return fallback;
        
        try {
            return JSON.parse(value);
        } catch (e) {
            return fallback;
        }
    },
    
    setJSON(key, value) {
        try {
            return this.set(key, JSON.stringify(value));
        } catch (e) {
            return false;
        }
    },
    
    clear() {
        this.memoryStore.clear();
        
        if (this.storageAvailable) {
            try {
                const storage = this.storageType === 'localStorage' ? localStorage : sessionStorage;
                storage.clear();
                this.used = 0;
            } catch (e) {}
        }
    },
    
    keys() {
        const keys = new Set();
        
        if (this.storageAvailable) {
            try {
                const storage = this.storageType === 'localStorage' ? localStorage : sessionStorage;
                for (let i = 0; i < storage.length; i++) {
                    keys.add(storage.key(i));
                }
            } catch (e) {}
        }
        
        this.memoryStore.forEach((_, key) => keys.add(key));
        return Array.from(keys);
    },
    
    size() {
        return this.keys().length;
    }
}.initialize();

// =============================================
// ORIGIN TRUST ADAPTER - DYNAMIC TRUST EVALUATION (PRESERVED)
// =============================================
const OriginTrustAdapter = {
    trustedOrigins: new Set(),
    blockedOrigins: new Set(),
    dynamicTrustCache: new Map(),
    trustLevel: 'standard',
    parentOrigin: null,
    backendDomain: 'https://moodchat-fy56.onrender.com',
    frontendDomain: 'https://moodfronted.onrender.com',
    
    initialize() {
        this.loadBuiltinTrustedOrigins();
        this.setTrustLevelFromEnvironment();
        this.addTrustedOrigin(this.backendDomain);
        this.addTrustedOrigin(this.frontendDomain);
        debugLog('OriginTrustAdapter initialized, trustLevel:', this.trustLevel);
        return this;
    },
    
    loadBuiltinTrustedOrigins() {
        const builtin = [
            window.location.origin,
            'http://localhost',
            'http://127.0.0.1',
            'https://localhost',
            'https://127.0.0.1',
            'http://localhost:3000',
            'http://localhost:5500',
            'http://localhost:5000',
            'http://localhost:8080',
            'https://localhost:3000',
            'https://localhost:5500',
            'https://localhost:5000',
            'https://localhost:8080',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5500',
            'http://127.0.0.1:5000',
            'http://127.0.0.1:8080',
            'https://127.0.0.1:3000',
            'https://127.0.0.1:5500',
            'https://127.0.0.1:5000',
            'https://127.0.0.1:8080',
            'https://moodchat-fy56.onrender.com',
            'https://moodfronted.onrender.com'
        ];
        
        builtin.forEach(origin => this.trustedOrigins.add(origin));
        
        // Render.com domains (wildcard)
        this.trustedOrigins.add('https://*.onrender.com');
        this.trustedOrigins.add('https://*.render.com');
    },
    
    setTrustLevelFromEnvironment() {
        if (IframeEnvironment.type === 'LOCAL_DEV' || IframeAuthority.compatibilityMode) {
            this.trustLevel = 'relaxed';
        } else if (IframeEnvironment.type === 'PRODUCTION') {
            this.trustLevel = 'strict';
        } else {
            this.trustLevel = 'standard';
        }
    },
    
    isTrusted(origin) {
        if (!origin) return false;
        
        // Check cache
        if (this.dynamicTrustCache.has(origin)) {
            return this.dynamicTrustCache.get(origin);
        }
        
        // Check blocked
        if (this.blockedOrigins.has(origin)) {
            this.dynamicTrustCache.set(origin, false);
            return false;
        }
        
        // Check trusted set
        if (this.trustedOrigins.has(origin)) {
            this.dynamicTrustCache.set(origin, true);
            return true;
        }
        
        // Check wildcard patterns
        for (const trusted of this.trustedOrigins) {
            if (trusted.includes('*')) {
                const pattern = trusted.replace(/\*/g, '[^.]+').replace(/\./g, '\\.');
                const regex = new RegExp(`^${pattern}$`);
                if (regex.test(origin)) {
                    this.dynamicTrustCache.set(origin, true);
                    return true;
                }
            }
        }
        
        // Check if ends with trusted domain
        for (const trusted of this.trustedOrigins) {
            if (!trusted.includes('*') && origin.endsWith(trusted.replace(/^https?:\/\//, ''))) {
                this.dynamicTrustCache.set(origin, true);
                return true;
            }
        }
        
        // Relaxed trust - accept if same origin or subdomain
        if (this.trustLevel === 'relaxed') {
            try {
                const originHostname = new URL(origin).hostname;
                const currentHostname = window.location.hostname;
                
                if (originHostname === currentHostname ||
                    originHostname.endsWith('.' + currentHostname) ||
                    currentHostname.endsWith('.' + originHostname)) {
                    this.dynamicTrustCache.set(origin, true);
                    return true;
                }
            } catch {}
        }
        
        // Check if from parent referrer
        if (this.parentOrigin && origin === this.parentOrigin) {
            this.dynamicTrustCache.set(origin, true);
            return true;
        }
        
        // Default based on trust level
        const trusted = this.trustLevel === 'relaxed' || 
                       (this.trustLevel === 'standard' && origin.startsWith('https://'));
        
        this.dynamicTrustCache.set(origin, trusted);
        return trusted;
    },
    
    addTrustedOrigin(origin) {
        if (origin) {
            this.trustedOrigins.add(origin);
            this.dynamicTrustCache.delete(origin);
        }
    },
    
    blockOrigin(origin) {
        if (origin) {
            this.blockedOrigins.add(origin);
            this.dynamicTrustCache.delete(origin);
        }
    },
    
    setParentOrigin(origin) {
        if (origin) {
            this.parentOrigin = origin;
            this.addTrustedOrigin(origin);
        }
    },
    
    validateMessageOrigin(origin) {
        if (!origin) return false;
        if (this.trustLevel === 'relaxed' && !origin.includes('chrome-extension')) return true;
        return this.isTrusted(origin);
    },
    
    getTrustLevel() {
        return this.trustLevel;
    },
    
    reset() {
        this.dynamicTrustCache.clear();
        this.blockedOrigins.clear();
    }
}.initialize();

// =============================================
// MESSAGE BUS - CENTRALIZED COMMUNICATION (PRESERVED)
// =============================================
const MessageBus = {
    channels: new Map(),
    messageQueue: [],
    processing: false,
    maxQueueSize: 100,
    messageCounter: 0,
    pendingAcks: new Map(),
    messageHandlers: new Map(),
    history: new Map(),
    maxHistory: 100,
    
    createChannel(channelName) {
        if (!this.channels.has(channelName)) {
            this.channels.set(channelName, {
                subscribers: new Set(),
                messageHistory: []
            });
        }
        return this.channels.get(channelName);
    },
    
    subscribe(channelName, handler) {
        const channel = this.createChannel(channelName);
        channel.subscribers.add(handler);
        
        return () => {
            channel.subscribers.delete(handler);
        };
    },
    
    publish(channelName, message) {
        const channel = this.channels.get(channelName);
        if (!channel) return;
        
        const messageId = ++this.messageCounter;
        const enrichedMessage = {
            ...message,
            messageId,
            timestamp: Date.now(),
            channel: channelName,
            source: 'message-bus',
            busId: `bus_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
        };
        
        // Store in history
        channel.messageHistory.push(enrichedMessage);
        if (channel.messageHistory.length > 50) {
            channel.messageHistory.shift();
        }
        
        // Global history
        if (!this.history.has(channelName)) {
            this.history.set(channelName, []);
        }
        const history = this.history.get(channelName);
        history.push(enrichedMessage);
        if (history.length > this.maxHistory) {
            history.shift();
        }
        
        // Notify subscribers
        channel.subscribers.forEach(handler => {
            try {
                handler(enrichedMessage);
            } catch (e) {}
        });
    },
    
    request(channelName, message, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const responseChannel = `${channelName}_response_${requestId}`;
            
            const timeoutId = setTimeout(() => {
                this.unsubscribe(responseChannel, responseHandler);
                reject(new Error(`Request timeout on channel ${channelName}`));
            }, timeout);
            
            const responseHandler = (response) => {
                clearTimeout(timeoutId);
                this.unsubscribe(responseChannel, responseHandler);
                resolve(response);
            };
            
            this.subscribe(responseChannel, responseHandler);
            this.publish(channelName, {
                ...message,
                requestId,
                responseChannel
            });
        });
    },
    
    addMessageHandler(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, new Set());
        }
        this.messageHandlers.get(type).add(handler);
    },
    
    removeMessageHandler(type, handler) {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            handlers.delete(handler);
        }
    },
    
    processMessage(message) {
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(message);
                } catch (e) {}
            });
        }
    },
    
    getHistory(channelName) {
        return this.history.get(channelName) || [];
    },
    
    clearHistory() {
        this.history.clear();
        this.channels.forEach(channel => {
            channel.messageHistory = [];
        });
    }
};

// =============================================
// PARENT READY PROMISE - EVENT-DRIVEN WAITING
// =============================================
let _parentReadyResolver = null;
let _parentReadyRejecter = null;
const _parentReadyPromise = new Promise((resolve, reject) => {
    _parentReadyResolver = resolve;
    _parentReadyRejecter = reject;
});

// =============================================
// PARENT COMMUNICATION LAYER - STANDARDIZED PROTOCOL (STRICT)
// =============================================
const ParentCommunication = {
    childReadySent: false,
    moduleRegistered: false,
    parentReadyReceived: false,
    sessionSynced: false,
    messageQueue: [],
    
    initialize() {
        debugLog('ParentCommunication initialized');
        return this;
    },
    
    // Send CHILD_READY exactly once - only when in READY state
    sendChildReady() {
        if (this.childReadySent) {
            debugLog('CHILD_READY already sent, skipping');
            return false;
        }
        
        if (!isLifecycleState(LifecycleState.READY)) {
            debugWarn(`Cannot send CHILD_READY in state ${_currentLifecycleState} - must be READY`);
            return false;
        }
        
        const message = MessageValidator.createMessage('CHILD_READY', {
            moduleName: MODULE_NAME,
            moduleVersion: '8.1',
            capabilities: [
                'view_statuses',
                'post_statuses',
                'react_to_statuses',
                'track_views',
                'expiration_management'
            ]
        });
        
        const success = this.postToParent(message);
        
        if (success) {
            this.childReadySent = true;
            setLifecycleState(LifecycleState.WAIT_PARENT);
            logStatus('SENDING', 'CHILD_READY sent');
        }
        
        return success;
    },
    
    // Send REGISTER_MODULE exactly once
    sendRegistration() {
        if (this.moduleRegistered) {
            debugLog('Already registered, skipping');
            return false;
        }
        
        if (!isLifecycleState(LifecycleState.WAIT_PARENT)) {
            debugWarn(`Cannot register in state ${_currentLifecycleState} - must be WAIT_PARENT`);
            return false;
        }
        
        const message = MessageValidator.createMessage('REGISTER_MODULE', {
            moduleName: MODULE_NAME,
            moduleVersion: '8.1',
            capabilities: IframeEnvironment.getCapabilities(),
            features: [
                'status_text',
                'status_media',
                'status_poll',
                'reactions',
                'view_tracking',
                'expiration'
            ]
        });
        
        const success = this.postToParent(message);
        
        if (success) {
            this.moduleRegistered = true;
            logStatus('SENDING', 'REGISTER_MODULE sent');
        }
        
        return success;
    },
    
    // Send HEARTBEAT_ACK in response to parent heartbeat
    sendHeartbeatAck(inResponseTo) {
        const message = MessageValidator.createMessage('HEARTBEAT_ACK', {
            inResponseTo,
            timestamp: Date.now()
        });
        
        return this.postToParent(message);
    },
    
    // Handle session sync from parent
    handleSessionSync(sessionData) {
        if (!sessionData) return false;
        
        // Update session state
        this.updateSessionState(sessionData);
        
        setLifecycleState(LifecycleState.ACTIVE);
        logStatus('SUCCESS', 'Session synchronized');
        
        return true;
    },
    
    // Update session state from parent data
    updateSessionState(sessionData) {
        try {
            if (sessionData.user) {
                currentUser = sessionData.user;
                userData = sessionData.user;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER, sessionData.user);
            }
            
            if (sessionData.token) {
                SafeStorage.set(UNIFIED_TOKEN_KEY, sessionData.token);
                state.token = sessionData.token;
            }
            
            if (sessionData.permissions) {
                state.permissionsGranted = sessionData.permissions;
            }
            
            if (sessionData.sessionId) {
                state.sessionId = sessionData.sessionId;
            }
            
            // Update mirror
            updateSessionMirror(sessionData, 'session_sync');
            SessionClient.updateSession(sessionData, 'session_sync');
            
            isTokenReady = true;
            triggerTokenReadyCallbacks();
            processPendingApiRequests();
            
        } catch (error) {
            debugError('Failed to update session state:', error);
        }
    },
    
    // Post message to parent with validation
    postToParent(message) {
        try {
            if (!window.parent || window.parent === window) {
                debugLog('No parent window available');
                return false;
            }
            
            // Validate message schema
            const validation = MessageValidator.validate(message);
            if (!validation.valid) {
                debugError('Invalid message schema:', validation.reason, message);
                return false;
            }
            
            window.parent.postMessage(message, '*');
            DiagnosticsAgent.increment('messagesSent');
            
            const logKey = `sent_${message.type}`;
            if (!_loggedMessages.has(logKey)) {
                _loggedMessages.add(logKey);
                logStatus('SENDING', `${message.type} sent`);
            }
            
            return true;
        } catch (error) {
            debugError('Failed to post to parent:', error);
            return false;
        }
    },
    
    // Handle incoming parent messages
    handleParentMessage(message) {
        if (!message || !message.type) {
            return;
        }
        
        // Check for duplicates
        if (message.messageId && isDuplicate(message.messageId)) {
            return;
        }
        
        switch (message.type) {
            case 'PARENT_READY':
                this.parentReadyReceived = true;
                logStatus('SUCCESS', 'PARENT_READY received');
                if (_parentReadyResolver) {
                    _parentReadyResolver(message);
                }
                this.sendRegistration();
                break;
                
            case 'MODULE_REGISTERED':
                if (message.payload?.moduleName === MODULE_NAME) {
                    this.moduleRegistered = true;
                    logStatus('SUCCESS', 'Module registered');
                }
                break;
                
            case 'SESSION_DATA':
                this.handleSessionSync(message.payload);
                break;
                
            case 'HEARTBEAT':
                this.sendHeartbeatAck(message.messageId);
                break;
                
            case 'SESSION_ACTIVE':
                this.handleSessionSync(message.payload);
                break;
                
            default:
                // Pass to other handlers
                break;
        }
    },
    
    // Send user action to parent
    sendAction(action, payload = {}) {
        if (!isLifecycleState(LifecycleState.ACTIVE)) {
            debugWarn(`Cannot send action in state ${_currentLifecycleState}`);
            return null;
        }
        
        const message = MessageValidator.createMessage('ACTION', {
            action,
            module: MODULE_NAME,
            payload
        });
        
        this.postToParent(message);
        return message.messageId;
    },
    
    reset() {
        this.childReadySent = false;
        this.parentReadyReceived = false;
        this.moduleRegistered = false;
        this.sessionSynced = false;
        this.messageQueue = [];
        resetLifecycleState();
    }
}.initialize();

// =============================================
// CONTROLLED RETRY ENGINE - MINIMAL, PASSIVE
// =============================================
const ControlledRetryEngine = {
    maxRetries: 1,
    retryInterval: 5000,
    retryCounts: new Map(),
    retryTimers: new Map(),
    
    canRetry(messageId) {
        const count = this.retryCounts.get(messageId) || 0;
        return count < this.maxRetries;
    },
    
    recordAttempt(messageId) {
        const count = (this.retryCounts.get(messageId) || 0) + 1;
        this.retryCounts.set(messageId, count);
        return count;
    },
    
    scheduleRetry(messageId, retryFunction) {
        if (!this.canRetry(messageId)) {
            debugWarn(`Max retries reached for ${messageId}`);
            return false;
        }
        
        const attempt = this.recordAttempt(messageId);
        
        if (this.retryTimers.has(messageId)) {
            clearTimeout(this.retryTimers.get(messageId));
        }
        
        const timer = setTimeout(() => {
            this.retryTimers.delete(messageId);
            retryFunction();
        }, this.retryInterval);
        
        this.retryTimers.set(messageId, timer);
        
        return true;
    },
    
    clearRetry(messageId) {
        if (this.retryTimers.has(messageId)) {
            clearTimeout(this.retryTimers.get(messageId));
            this.retryTimers.delete(messageId);
        }
        this.retryCounts.delete(messageId);
    },
    
    reset() {
        for (const timer of this.retryTimers.values()) {
            clearTimeout(timer);
        }
        this.retryTimers.clear();
        this.retryCounts.clear();
    }
};

// =============================================
// MESSAGE TYPES - ENHANCED (PRESERVED)
// =============================================
const MESSAGE_TYPES = {
    // Core lifecycle messages (STANDARDIZED)
    CHILD_READY: 'CHILD_READY',
    PARENT_READY: 'PARENT_READY',
    REGISTER_MODULE: 'REGISTER_MODULE',
    MODULE_REGISTERED: 'MODULE_REGISTERED',
    SESSION_DATA: 'SESSION_DATA',
    HEARTBEAT: 'HEARTBEAT',
    HEARTBEAT_ACK: 'HEARTBEAT_ACK',
    ACK: 'ACK',
    ACTION: 'ACTION',
    SESSION_ACTIVE: 'SESSION_ACTIVE',
    
    // Legacy messages (PRESERVED FOR COMPATIBILITY)
    READY: 'STATUS_READY',
    SESSION: 'STATUS_SESSION',
    DATA: 'STATUS_DATA',
    ERROR: 'STATUS_ERROR',
    STATUS: 'STATUS_UPDATE',
    REQUEST_SESSION: 'STATUS_REQUEST_SESSION',
    UI_READY: 'STATUS_UI_READY',
    NEEDS_AUTH: 'STATUS_NEEDS_AUTH',
    API_REQUEST: 'API_REQUEST',
    API_RESPONSE: 'API_RESPONSE',
    API_ERROR: 'API_ERROR',
    AUTH_VALIDATED: 'AUTH_VALIDATED',
    SESSION_UPDATE: 'SESSION_UPDATE',
    LOGOUT: 'LOGOUT',
    IFRAME_READY: 'IFRAME_READY',
    STATUS_SHUTDOWN: 'STATUS_SHUTDOWN',
    USER_ACTIVE: 'USER_ACTIVE',
    USER_INACTIVE: 'USER_INACTIVE',
    HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
    HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',
    HANDSHAKE_ACK: 'HANDSHAKE_ACK',
    SESSION_ACK: 'SESSION_ACK',
    PING: 'PING',
    PONG: 'PONG',
    PAGE_ACTIVATED: 'PAGE_ACTIVATED',
    NAVIGATE: 'NAVIGATE',
    CAPABILITY_REQUEST: 'CAPABILITY_REQUEST',
    CAPABILITY_RESPONSE: 'CAPABILITY_RESPONSE',
    TOKEN_REFRESH: 'TOKEN_REFRESH',
    TOKEN_REFRESH_RESPONSE: 'TOKEN_REFRESH_RESPONSE',
    ORIGIN_VALIDATION: 'ORIGIN_VALIDATION',
    ORIGIN_VALIDATION_RESPONSE: 'ORIGIN_VALIDATION_RESPONSE',
    CONFIG_REQUEST: 'CONFIG_REQUEST',
    CONFIG_RESPONSE: 'CONFIG_RESPONSE',
    DIAGNOSTICS: 'DIAGNOSTICS',
    RECOVERY_REQUEST: 'RECOVERY_REQUEST',
    RECOVERY_RESPONSE: 'RECOVERY_RESPONSE',
    STATUS_VIEW: 'STATUS_VIEW',
    STATUS_REACT: 'STATUS_REACT',
    STATUS_REPLY: 'STATUS_REPLY',
    STATUS_PIN: 'STATUS_PIN',
    STATUS_UNPIN: 'STATUS_UNPIN',
    STATUS_MUTE: 'STATUS_MUTE',
    STATUS_UNMUTE: 'STATUS_UNMUTE',
    STATUS_REPORT: 'STATUS_REPORT',
    STATUS_DRAFT_SAVE: 'STATUS_DRAFT_SAVE',
    STATUS_DRAFT_LOAD: 'STATUS_DRAFT_LOAD',
    STATUS_DRAFT_DELETE: 'STATUS_DRAFT_DELETE',
    STATUS_SCHEDULE: 'STATUS_SCHEDULE',
    STATUS_SCHEDULE_CANCEL: 'STATUS_SCHEDULE_CANCEL',
    HIGHLIGHT_CREATE: 'HIGHLIGHT_CREATE',
    HIGHLIGHT_UPDATE: 'HIGHLIGHT_UPDATE',
    HIGHLIGHT_DELETE: 'HIGHLIGHT_DELETE',
    HIGHLIGHT_ADD_STATUS: 'HIGHLIGHT_ADD_STATUS',
    HIGHLIGHT_REMOVE_STATUS: 'HIGHLIGHT_REMOVE_STATUS',
    IFRAME_REGISTERED: 'IFRAME_REGISTERED',
    
    // NEW STATUS-SPECIFIC MESSAGE TYPES
    STATUS_CREATE: 'STATUS_CREATE',
    STATUS_POSTED: 'STATUS_POSTED',
    STATUS_VIEWED: 'STATUS_VIEWED',
    STATUS_REACTED: 'STATUS_REACTED',
    STATUS_REACTION_REMOVED: 'STATUS_REACTION_REMOVED',
    STATUS_EXPIRED: 'STATUS_EXPIRED',
    STATUS_SYNC_REQUEST: 'STATUS_SYNC_REQUEST',
    STATUS_SYNC_RESPONSE: 'STATUS_SYNC_RESPONSE',
    STATUSES_UPDATE: 'STATUSES_UPDATE',
    VIEWER_TRACKED: 'VIEWER_TRACKED',
    REACTION_ADDED: 'REACTION_ADDED',
    REACTION_REMOVED: 'REACTION_REMOVED',
    REACTION_CHANGED: 'REACTION_CHANGED',
    REACTIONS_UPDATE: 'REACTIONS_UPDATE',
    VIEWERS_UPDATE: 'VIEWERS_UPDATE',
    EXPIRED_STATUS_CLEANUP: 'EXPIRED_STATUS_CLEANUP'
};

// =============================================
// RECOVERY MANAGER - PASSIVE, WAITS FOR PARENT (PRESERVED)
// =============================================
const RecoveryManager = {
    recoveryAttempts: 0,
    maxRecoveryAttempts: 2,
    recoveryInProgress: false,
    lastRecoveryTime: null,
    recoveryStrategies: new Map(),
    recoveryHistory: [],
    
    initialize() {
        this.registerStrategies();
        debugLog('RecoveryManager initialized');
        return this;
    },
    
    registerStrategies() {
        this.recoveryStrategies.set('handshake', this.recoverHandshake.bind(this));
        this.recoveryStrategies.set('session', this.recoverSession.bind(this));
        this.recoveryStrategies.set('connection', this.recoverConnection.bind(this));
        this.recoveryStrategies.set('token', this.recoverToken.bind(this));
        this.recoveryStrategies.set('storage', this.recoverStorage.bind(this));
        this.recoveryStrategies.set('ui', this.recoverUI.bind(this));
    },
    
    async recover(problem, context = {}) {
        if (this.recoveryInProgress) {
            return { success: false, reason: 'Recovery already in progress' };
        }
        
        if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
            debugWarn('Max recovery attempts reached, entering passive waiting');
            setLifecycleState(LifecycleState.WAIT_PARENT);
            return { success: false, reason: 'Max attempts exceeded' };
        }
        
        this.recoveryAttempts++;
        this.recoveryInProgress = true;
        this.lastRecoveryTime = Date.now();
        
        const strategy = this.recoveryStrategies.get(problem);
        if (!strategy) {
            this.recoveryInProgress = false;
            return { success: false, reason: 'No recovery strategy' };
        }
        
        try {
            const result = await strategy(context);
            
            this.recoveryHistory.push({
                problem,
                attempt: this.recoveryAttempts,
                success: result.success,
                timestamp: Date.now()
            });
            
            this.recoveryInProgress = false;
            return result;
        } catch (error) {
            this.recoveryInProgress = false;
            return { success: false, error: error.message };
        }
    },
    
    async recoverHandshake(context) {
        // Wait for parent instead of retrying
        if (!ParentCommunication.parentReadyReceived) {
            setLifecycleState(LifecycleState.WAIT_PARENT);
            return { success: true, waiting: true };
        }
        return { success: false };
    },
    
    async recoverSession(context) {
        try {
            if (state.sessionMirror.validated) {
                updateSessionMirror(state.sessionMirror, 'cache');
                return { success: true, cached: true };
            }
            
            // Try to load from cache
            const cached = SafeStorage.getJSON('session_cache');
            if (cached) {
                updateSessionMirror(cached, 'cache');
                return { success: true, cached: true };
            }
        } catch (error) {}
        
        return { success: false };
    },
    
    async recoverConnection(context) {
        // Wait for parent heartbeat
        return { success: true, waiting: true };
    },
    
    async recoverToken(context) {
        return { success: false };
    },
    
    async recoverStorage(context) {
        try {
            SafeStorage.initialize();
            return { success: true };
        } catch (error) {}
        return { success: false };
    },
    
    async recoverUI(context) {
        if (typeof window !== 'undefined') {
            document.dispatchEvent(new CustomEvent('uiRecovery', {
                detail: { timestamp: Date.now() }
            }));
        }
        return { success: true };
    },
    
    canRecover() {
        return this.recoveryAttempts < this.maxRecoveryAttempts && !this.recoveryInProgress;
    },
    
    reset() {
        this.recoveryAttempts = 0;
        this.recoveryInProgress = false;
        this.recoveryHistory = [];
    },
    
    getHistory() {
        return [...this.recoveryHistory];
    }
}.initialize();

// =============================================
// MESSAGE FIREWALL & PARSER (PRESERVED)
// =============================================
const MessageFirewall = {
    validators: new Map(),
    replayCache: new Set(),
    maxCacheSize: 1000,
    sequenceTracker: new Map(),
    
    init() {
        this.registerValidators();
        debugLog('MessageFirewall initialized');
        return this;
    },
    
    registerValidators() {
        this.validators.set('SESSION_DATA', (msg) => {
            return msg.payload && 
                   (msg.payload.token || msg.payload.user) &&
                   (!msg.payload.token || typeof msg.payload.token === 'string') &&
                   (!msg.payload.user || (msg.payload.user.id && msg.payload.user.displayName));
        });
        
        this.validators.set('PARENT_READY', (msg) => {
            return msg.payload && msg.payload.timestamp;
        });
        
        this.validators.set('MODULE_REGISTERED', (msg) => {
            return msg.payload && msg.payload.moduleName;
        });
        
        this.validators.set('HEARTBEAT', (msg) => {
            return msg.payload && msg.payload.timestamp;
        });
        
        this.validators.set('HEARTBEAT_ACK', (msg) => {
            return msg.inResponseTo || msg.payload?.inResponseTo;
        });
        
        this.validators.set('SESSION_ACTIVE', (msg) => {
            return msg.payload && 
                   (msg.payload.sessionId || msg.payload.token || msg.payload.user);
        });
        
        this.validators.set('STATUS_POSTED', (msg) => {
            return msg.payload && msg.payload.status && msg.payload.status.id;
        });
        
        this.validators.set('STATUS_VIEWED', (msg) => {
            return msg.payload && msg.payload.statusId && msg.payload.userId;
        });
        
        this.validators.set('STATUS_REACTED', (msg) => {
            return msg.payload && msg.payload.statusId && msg.payload.userId && msg.payload.emoji;
        });
        
        this.validators.set('STATUS_EXPIRED', (msg) => {
            return msg.payload && msg.payload.statusId;
        });
        
        this.validators.set('VIEWER_TRACKED', (msg) => {
            return msg.payload && msg.payload.statusId && msg.payload.viewerCount !== undefined;
        });
        
        this.validators.set('REACTION_ADDED', (msg) => {
            return msg.payload && msg.payload.statusId && msg.payload.userId && msg.payload.emoji;
        });
        
        this.validators.set('REACTION_REMOVED', (msg) => {
            return msg.payload && msg.payload.statusId && msg.payload.userId && msg.payload.emoji;
        });
        
        this.validators.set('REACTION_CHANGED', (msg) => {
            return msg.payload && msg.payload.statusId && msg.payload.userId && 
                   msg.payload.oldEmoji && msg.payload.newEmoji;
        });
    },
    
    validate(message, origin) {
        try {
            // Structural validation
            if (!message || typeof message !== 'object') {
                return false;
            }
            
            // Origin validation using trust adapter
            if (!OriginTrustAdapter.validateMessageOrigin(origin)) {
                const originKey = `invalid_origin_${origin}`;
                if (!_loggedMessages.has(originKey)) {
                    _loggedMessages.add(originKey);
                    debugWarn(`Invalid origin: ${origin}`);
                }
                return false;
            }
            
            // Required fields
            if (!message.type) {
                return false;
            }
            
            // Replay protection
            if (message.messageId) {
                if (this.replayCache.has(message.messageId)) {
                    const replayKey = `replay_${message.messageId}`;
                    if (!_loggedMessages.has(replayKey)) {
                        _loggedMessages.add(replayKey);
                        debugWarn(`Replay detected: ${message.messageId}`);
                    }
                    return false;
                }
                
                this.replayCache.add(message.messageId);
                if (this.replayCache.size > this.maxCacheSize) {
                    const first = this.replayCache.values().next().value;
                    this.replayCache.delete(first);
                }
            }
            
            // Schema validation
            const validator = this.validators.get(message.type);
            if (validator && !validator(message) && !IframeAuthority.compatibilityMode) {
                const schemaKey = `schema_${message.type}`;
                if (!_loggedMessages.has(schemaKey)) {
                    _loggedMessages.add(schemaKey);
                    debugWarn(`Schema validation failed for ${message.type}`);
                }
                return false;
            }
            
            return true;
        } catch (e) {
            debugError('Message validation error:', e);
            return false;
        }
    },
    
    sanitize(message) {
        try {
            const sanitized = { ...message };
            
            // Sanitize strings
            if (sanitized.payload) {
                sanitized.payload = JSON.parse(JSON.stringify(sanitized.payload, (key, value) => {
                    if (typeof value === 'string') {
                        return value
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/&/g, '&amp;')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#039;');
                    }
                    return value;
                }));
            }
            
            // Redact tokens for logging
            if (sanitized.payload && sanitized.payload.token) {
                sanitized.payload.token = '[REDACTED]';
            }
            if (sanitized.token) {
                sanitized.token = '[REDACTED]';
            }
            
            return sanitized;
        } catch (e) {
            return message;
        }
    }
}.init();

// =============================================
// MESSAGE ID GENERATOR (PRESERVED)
// =============================================
function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${state.messageId++}`;
}

function generateSequenceId() {
    return `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateHandshakeId() {
    return `handshake_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}

function generateFrameId() {
    return `frame_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}

function generateInstanceId() {
    return `instance_${Date.now()}_${Math.random().toString(36).substr(2, 15)}`;
}

// =============================================
// ORIGIN VALIDATION & SECURITY (PRESERVED)
// =============================================
const TRUSTED_ORIGINS = new Set([
    window.location.origin,
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:5000',
    'http://localhost:5000',
    'http://127.0.0.1:8080',
    'http://localhost:8080',
    'https://127.0.0.1:5500',
    'https://localhost:5500',
    'https://127.0.0.1:3000',
    'https://localhost:3000',
    'https://127.0.0.1:5000',
    'https://localhost:5000',
    'https://127.0.0.1:8080',
    'https://localhost:8080',
    'https://*.onrender.com',
    'https://moodchat-fy56.onrender.com',
    'https://moodfronted.onrender.com'
]);

function isValidOrigin(origin) {
    try {
        if (!origin) return false;
        if (origin === window.location.origin) return true;
        if (TRUSTED_ORIGINS.has(origin)) return true;
        
        // Check wildcard patterns
        for (const trusted of TRUSTED_ORIGINS) {
            if (trusted.includes('*')) {
                const pattern = trusted.replace(/\*/g, '[^.]+').replace(/\./g, '\\.');
                const regex = new RegExp(`^${pattern}$`);
                if (regex.test(origin)) return true;
            } else if (origin.endsWith(trusted.replace(/^https?:\/\//, ''))) {
                return true;
            }
        }
        
        // Check for render.com domains
        if (origin.includes('.onrender.com') || origin.includes('.render.com')) {
            return true;
        }
        
        return false;
    } catch (e) {
        return false;
    }
}

function validateMessage(message, origin) {
    return MessageFirewall.validate(message, origin);
}

// =============================================
// LEGACY MESSAGE ADAPTER
// =============================================
function adaptLegacyMessage(message) {
    try {
        // Already in canonical format
        if (message.protocol) return message;
        
        const adapted = {
            protocol: 'KYN-1.0',
            messageId: message.id || message.messageId || generateMessageId(),
            type: message.type,
            source: message.source || 'iframe',
            target: 'parent',
            frameId: state.frameId,
            instanceId: state.instanceId,
            timestamp: message.timestamp || Date.now(),
            payload: message.payload || message.data || {},
            legacy: true
        };
        
        // Copy legacy fields
        if (message.inResponseTo) adapted.inResponseTo = message.inResponseTo;
        if (message.token) adapted.token = message.token;
        if (message.signature) adapted.signature = message.signature;
        
        return adapted;
    } catch (e) {
        DiagnosticsAgent.error('Adapter', `Failed to adapt legacy message: ${e.message}`, e);
        return message;
    }
}

// =============================================
// CANONICAL MESSAGE FORMATTER (PRESERVED)
// =============================================
function formatCanonicalMessage(type, payload = {}, options = {}) {
    const message = {
        protocol: options.protocol || 'KYN-7.0',
        messageId: options.messageId || generateMessageId(),
        type: type,
        source: options.source || 'iframe',
        target: options.target || 'parent',
        frameId: state.frameId,
        instanceId: state.instanceId,
        timestamp: Date.now(),
        payload: payload,
        sequence: options.sequence || Date.now()
    };
    
    // Add token if available and required
    if (options.includeToken !== false && state.token) {
        message.token = state.token;
    }
    
    // Add signature if required
    if (options.sign !== false && state.securityContext.signatureRequired && state.token && !IframeAuthority.compatibilityMode) {
        try {
            const signaturePayload = `${message.type}:${message.timestamp}:${message.messageId}:${state.frameId}`;
            message.signature = btoa(signaturePayload);
        } catch (e) {}
    }
    
    // Add legacy flag for compatibility
    if (options.legacy) {
        message.legacy = true;
    }
    
    return message;
}

// =============================================
// COMMUNICATION ENGINE - PARENT-ONLY ROUTING
// =============================================
const messageHandlers = new Map();
const _messageHandlerLogs = new Set();

function addMessageHandler(type, handler) {
    if (!messageHandlers.has(type)) {
        messageHandlers.set(type, []);
    }
    messageHandlers.get(type).push(createErrorBoundary(handler, `Message:${type}`));
}

function removeMessageHandler(type, handler) {
    if (!messageHandlers.has(type)) return;
    const handlers = messageHandlers.get(type);
    const index = handlers.indexOf(handler);
    if (index !== -1) handlers.splice(index, 1);
}

// Enhanced receiveFromParent to handle parent messages with standard protocol
const receiveFromParent = createErrorBoundary(async function(event) {
    try {
        // Update online status
        if (typeof state !== 'undefined') {
            state.isOnline = navigator.onLine;
        }
        
        // Validate message using trust adapter
        if (!OriginTrustAdapter.validateMessageOrigin(event.origin)) {
            return;
        }
        
        const message = event.data;
        
        // Validate message structure
        if (!message || typeof message !== 'object') return;
        
        // Check for duplicates
        if (message.messageId && isDuplicate(message.messageId)) {
            return;
        }
        
        // Validate message schema
        if (!MessageValidator.validate(message).valid) {
            return;
        }
        
        const sanitizedMessage = MessageFirewall.sanitize(message);
        
        if (typeof state !== 'undefined') {
            state.metrics.messagesReceived++;
        }
        
        // Only log received messages once per type
        const receiveKey = `received_${sanitizedMessage.type}`;
        if (!_messageHandlerLogs.has(receiveKey)) {
            _messageHandlerLogs.add(receiveKey);
            debugLog(`Received from parent: ${sanitizedMessage.type}`);
        }
        
        // Update parent origin
        if (typeof state !== 'undefined' && !state.securityContext.parentOrigin) {
            state.securityContext.parentOrigin = event.origin;
            OriginTrustAdapter.setParentOrigin(event.origin);
            IframeAuthority.parentDetected = true;
            state.parentDetected = true;
        }
        
        // Let ParentCommunication handle lifecycle messages
        ParentCommunication.handleParentMessage(sanitizedMessage);
        
        // Handle PAGE_ACTIVATED
        if (sanitizedMessage.type === 'PAGE_ACTIVATED') {
            if (typeof state !== 'undefined') {
                state.pageActivated = true;
            }
            
            const pageKey = 'page_activated';
            if (!_messageHandlerLogs.has(pageKey)) {
                _messageHandlerLogs.add(pageKey);
                logStatus('SUCCESS', 'Page activated');
            }
            
            // Trigger data refresh when page becomes active
            if (typeof loadFreshDataInBackground !== 'undefined' && isLifecycleState(LifecycleState.ACTIVE)) {
                setTimeout(() => {
                    loadFreshDataInBackground();
                }, 100);
            }
            
            // Dispatch event for UI
            document.dispatchEvent(new CustomEvent('pageActivated', {
                detail: { timestamp: Date.now() }
            }));
            
            return;
        }
        
        // =============================================
        // STATUS-SPECIFIC MESSAGE HANDLERS (PRESERVED)
        // =============================================
        
        // Handle STATUS_POSTED (new status created)
        if (sanitizedMessage.type === MESSAGE_TYPES.STATUS_POSTED) {
            const statusData = sanitizedMessage.payload.status;
            if (statusData && statusData.id) {
                const postKey = `status_posted_${statusData.id}`;
                if (!_messageHandlerLogs.has(postKey)) {
                    _messageHandlerLogs.add(postKey);
                    logStatus('POST', `New status from ${statusData.userId}`, { id: statusData.id });
                }
                
                // Add to statuses list
                if (!statuses.some(s => s.id === statusData.id)) {
                    statuses.unshift(statusData);
                    statuses = filterStatusesByPrivacy(statuses);
                    
                    // Save to storage
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
                    
                    // If it's my status, add to myStatuses
                    if (statusData.userId === state.sessionMirror.user?.id) {
                        if (!myStatuses.some(s => s.id === statusData.id)) {
                            myStatuses.unshift(statusData);
                            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
                        }
                    }
                    
                    // Dispatch event for UI
                    document.dispatchEvent(new CustomEvent('statusUpdate', {
                        detail: { type: 'new', status: statusData }
                    }));
                }
            }
        }
        
        // Handle STATUS_VIEWED (someone viewed a status)
        if (sanitizedMessage.type === MESSAGE_TYPES.STATUS_VIEWED) {
            const { statusId, userId } = sanitizedMessage.payload;
            
            if (statusId && userId) {
                const viewKey = `status_viewed_${statusId}_${userId}`;
                if (!_messageHandlerLogs.has(viewKey)) {
                    _messageHandlerLogs.add(viewKey);
                    logStatus('VIEW', `Status ${statusId} viewed by ${userId}`);
                }
                
                // Find the status
                const status = statuses.find(s => s.id === statusId);
                
                if (status) {
                    // Initialize viewers array if needed
                    if (!status.viewers) status.viewers = [];
                    
                    // Check if already viewed by this user
                    const existingViewer = status.viewers.find(v => v.userId === userId);
                    
                    if (!existingViewer) {
                        // Add new viewer
                        status.viewers.push({
                            userId,
                            viewedAt: sanitizedMessage.payload.timestamp || Date.now()
                        });
                        
                        // Update viewer count
                        const viewerCount = status.viewers.length;
                        
                        // Save to storage
                        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
                        
                        // Update metrics
                        DiagnosticsAgent.increment('statusViews');
                        
                        // Dispatch event for UI
                        document.dispatchEvent(new CustomEvent('viewerUpdate', {
                            detail: { statusId, viewerCount }
                        }));
                        
                        // If this is my status, update myStatuses too
                        if (status.userId === state.sessionMirror.user?.id) {
                            const myStatus = myStatuses.find(s => s.id === statusId);
                            if (myStatus) {
                                if (!myStatus.viewers) myStatus.viewers = [];
                                if (!myStatus.viewers.some(v => v.userId === userId)) {
                                    myStatus.viewers.push({
                                        userId,
                                        viewedAt: sanitizedMessage.payload.timestamp || Date.now()
                                    });
                                }
                                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
                            }
                        }
                    }
                }
            }
        }
        
        // Handle STATUS_REACTED (someone reacted to a status)
        if (sanitizedMessage.type === MESSAGE_TYPES.STATUS_REACTED) {
            const { statusId, userId, emoji, reactionId } = sanitizedMessage.payload;
            
            if (statusId && userId && emoji) {
                const reactKey = `status_reacted_${statusId}_${userId}_${emoji}`;
                if (!_messageHandlerLogs.has(reactKey)) {
                    _messageHandlerLogs.add(reactKey);
                    logStatus('REACTION', `${userId} reacted with ${emoji} to ${statusId}`);
                }
                
                // Find the status
                const status = statuses.find(s => s.id === statusId);
                
                if (status) {
                    // Initialize reactions array if needed
                    if (!status.reactions) status.reactions = [];
                    
                    // Check if already reacted by this user
                    const existingReaction = status.reactions.find(r => r.userId === userId);
                    
                    if (!existingReaction) {
                        // Add new reaction
                        status.reactions.push({
                            userId,
                            emoji,
                            reactedAt: sanitizedMessage.payload.timestamp || Date.now(),
                            reactionId: reactionId || `reaction_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
                        });
                        
                        // Save to storage
                        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
                        
                        // Update metrics
                        DiagnosticsAgent.increment('statusReactions');
                        
                        // Dispatch event for UI
                        document.dispatchEvent(new CustomEvent('reactionUpdate', {
                            detail: { statusId, reactions: status.reactions }
                        }));
                        
                        // If this is my status, update myStatuses too
                        if (status.userId === state.sessionMirror.user?.id) {
                            const myStatus = myStatuses.find(s => s.id === statusId);
                            if (myStatus) {
                                if (!myStatus.reactions) myStatus.reactions = [];
                                if (!myStatus.reactions.some(r => r.userId === userId)) {
                                    myStatus.reactions.push({
                                        userId,
                                        emoji,
                                        reactedAt: sanitizedMessage.payload.timestamp || Date.now(),
                                        reactionId: reactionId || `reaction_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
                                    });
                                }
                                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
                            }
                        }
                    } else if (existingReaction.emoji !== emoji) {
                        // Change reaction
                        existingReaction.emoji = emoji;
                        existingReaction.updatedAt = sanitizedMessage.payload.timestamp || Date.now();
                        
                        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
                        
                        document.dispatchEvent(new CustomEvent('reactionUpdate', {
                            detail: { statusId, reactions: status.reactions }
                        }));
                    }
                }
            }
        }
        
        // Handle REACTION_REMOVED (someone removed a reaction)
        if (sanitizedMessage.type === MESSAGE_TYPES.REACTION_REMOVED) {
            const { statusId, userId, emoji } = sanitizedMessage.payload;
            
            if (statusId && userId) {
                const removeKey = `reaction_removed_${statusId}_${userId}`;
                if (!_messageHandlerLogs.has(removeKey)) {
                    _messageHandlerLogs.add(removeKey);
                    logStatus('REACTION', `${userId} removed reaction from ${statusId}`);
                }
                
                // Find the status
                const status = statuses.find(s => s.id === statusId);
                
                if (status && status.reactions) {
                    // Remove the reaction
                    const initialLength = status.reactions.length;
                    status.reactions = status.reactions.filter(r => !(r.userId === userId && r.emoji === emoji));
                    
                    if (status.reactions.length !== initialLength) {
                        // Save to storage
                        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
                        
                        // Dispatch event for UI
                        document.dispatchEvent(new CustomEvent('reactionUpdate', {
                            detail: { statusId, reactions: status.reactions }
                        }));
                        
                        // If this is my status, update myStatuses too
                        if (status.userId === state.sessionMirror.user?.id) {
                            const myStatus = myStatuses.find(s => s.id === statusId);
                            if (myStatus && myStatus.reactions) {
                                myStatus.reactions = myStatus.reactions.filter(r => !(r.userId === userId && r.emoji === emoji));
                                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
                            }
                        }
                    }
                }
            }
        }
        
        // Handle REACTION_CHANGED (someone changed their reaction)
        if (sanitizedMessage.type === MESSAGE_TYPES.REACTION_CHANGED) {
            const { statusId, userId, oldEmoji, newEmoji } = sanitizedMessage.payload;
            
            if (statusId && userId && oldEmoji && newEmoji) {
                const changeKey = `reaction_changed_${statusId}_${userId}`;
                if (!_messageHandlerLogs.has(changeKey)) {
                    _messageHandlerLogs.add(changeKey);
                    logStatus('REACTION', `${userId} changed reaction from ${oldEmoji} to ${newEmoji} on ${statusId}`);
                }
                
                // Find the status
                const status = statuses.find(s => s.id === statusId);
                
                if (status && status.reactions) {
                    // Find and update the reaction
                    const reaction = status.reactions.find(r => r.userId === userId && r.emoji === oldEmoji);
                    
                    if (reaction) {
                        reaction.emoji = newEmoji;
                        reaction.updatedAt = sanitizedMessage.payload.timestamp || Date.now();
                        
                        // Save to storage
                        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
                        
                        // Dispatch event for UI
                        document.dispatchEvent(new CustomEvent('reactionUpdate', {
                            detail: { statusId, reactions: status.reactions }
                        }));
                        
                        // If this is my status, update myStatuses too
                        if (status.userId === state.sessionMirror.user?.id) {
                            const myStatus = myStatuses.find(s => s.id === statusId);
                            if (myStatus && myStatus.reactions) {
                                const myReaction = myStatus.reactions.find(r => r.userId === userId && r.emoji === oldEmoji);
                                if (myReaction) {
                                    myReaction.emoji = newEmoji;
                                    myReaction.updatedAt = sanitizedMessage.payload.timestamp || Date.now();
                                }
                                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
                            }
                        }
                    }
                }
            }
        }
        
        // Handle STATUS_EXPIRED (status has expired)
        if (sanitizedMessage.type === MESSAGE_TYPES.STATUS_EXPIRED) {
            const { statusId } = sanitizedMessage.payload;
            
            if (statusId) {
                const expireKey = `status_expired_${statusId}`;
                if (!_messageHandlerLogs.has(expireKey)) {
                    _messageHandlerLogs.add(expireKey);
                    logStatus('EXPIRE', `Status ${statusId} expired`);
                }
                
                // Remove from statuses
                statuses = statuses.filter(s => s.id !== statusId);
                
                // Remove from myStatuses
                myStatuses = myStatuses.filter(s => s.id !== statusId);
                
                // Remove from all category arrays
                friendsStatuses = friendsStatuses.filter(s => s.id !== statusId);
                closeFriendsStatuses = closeFriendsStatuses.filter(s => s.id !== statusId);
                pinnedStatuses = pinnedStatuses.filter(s => s.id !== statusId);
                mutedStatuses = mutedStatuses.filter(s => s.id !== statusId);
                microCirclesStatuses = microCirclesStatuses.filter(s => s.id !== statusId);
                
                // Remove from highlights
                highlights.forEach(highlight => {
                    if (highlight.statusIds) {
                        highlight.statusIds = highlight.statusIds.filter(id => id !== statusId);
                        highlight.count = highlight.statusIds.length;
                    }
                });
                
                // Update metrics
                DiagnosticsAgent.increment('statusExpired');
                
                // Save to storage
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.HIGHLIGHTS, highlights);
                
                // Dispatch event for UI
                document.dispatchEvent(new CustomEvent('statusExpired', {
                    detail: { statusId }
                }));
            }
        }
        
        // Handle STATUSES_UPDATE (bulk update of statuses)
        if (sanitizedMessage.type === MESSAGE_TYPES.STATUSES_UPDATE) {
            const newStatuses = sanitizedMessage.payload.statuses;
            
            if (newStatuses && Array.isArray(newStatuses)) {
                const bulkKey = 'statuses_update_bulk';
                if (!_messageHandlerLogs.has(bulkKey)) {
                    _messageHandlerLogs.add(bulkKey);
                    logStatus('SUCCESS', `Received ${newStatuses.length} statuses`);
                }
                
                // Merge statuses, avoiding duplicates
                const existingIds = new Set(statuses.map(s => s.id));
                const newUniqueStatuses = newStatuses.filter(s => !existingIds.has(s.id));
                
                statuses = [...newUniqueStatuses, ...statuses];
                statuses = filterStatusesByPrivacy(statuses);
                statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                
                // Save to storage
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
                
                // Dispatch event for UI
                document.dispatchEvent(new CustomEvent('statusUpdate', {
                    detail: { type: 'bulk', statuses: statuses.slice(0, 10) }
                }));
            }
        }
        
        // Publish to message bus
        if (typeof MessageBus !== 'undefined') {
            MessageBus.publish('parent-messages', sanitizedMessage);
        }
        
        const handlers = messageHandlers.get(sanitizedMessage.type) || [];
        for (const handler of handlers) {
            handler(sanitizedMessage, event.origin);
        }
        
    } catch (e) {
        const errorKey = `receive_error_${e.message}`;
        if (!_messageHandlerLogs.has(errorKey)) {
            _messageHandlerLogs.add(errorKey);
            logStatus('FAILED', `receiveFromParent: ${e.message}`);
        }
    }
}, 'receiveFromParent', null);

// Legacy sendToParent - now delegates to ParentCommunication
const sendToParent = createErrorBoundary(async function(type, payload = {}, options = {}) {
    // If this is a core lifecycle message, use ParentCommunication
    if (type === 'CHILD_READY') {
        return ParentCommunication.sendChildReady();
    }
    
    if (type === 'REGISTER_MODULE') {
        return ParentCommunication.sendRegistration();
    }
    
    // For user actions, use the action wrapper
    if (type === 'ACTION' || type.startsWith('STATUS_')) {
        const action = type.startsWith('STATUS_') ? type : payload.action;
        return ParentCommunication.sendAction(action, payload.payload || payload);
    }
    
    // Otherwise, create and send a standard message
    const message = MessageValidator.createMessage(type, payload, {
        expectAck: options.requiresAck || false
    });
    
    return ParentCommunication.postToParent(message);
}, 'sendToParent', null);

// =============================================
// INITIALIZATION SEQUENCE - DETERMINISTIC (NO TIMEOUTS)
// =============================================
let initializationStarted = false;

function initializeModule() {
    if (initializationStarted) {
        debugLog('Initialization already started');
        return;
    }
    
    initializationStarted = true;
    
    // Start in BOOTING state
    setLifecycleState(LifecycleState.INITIALIZING);
    
    logStatus('INIT', 'Module initializing');
    
    // Move to READY state (synchronously, no timeout)
    setLifecycleState(LifecycleState.READY);
    logStatus('READY', 'Module ready');
    
    // Send CHILD_READY exactly once
    ParentCommunication.sendChildReady();
}

// =============================================
// PASSIVE REGISTRATION - ONCE ONLY
// =============================================
let statusRegistered = false;
let lastStatusRegister = 0;

function registerStatusModule() {
    if (statusRegistered) return;
    
    const now = Date.now();
    if (now - lastStatusRegister < 3000) return;
    
    lastStatusRegister = now;
    
    // Use new lifecycle instead
    if (!ParentCommunication.childReadySent && isLifecycleState(LifecycleState.READY)) {
        ParentCommunication.sendChildReady();
        statusRegistered = true;
    }
}

window.addEventListener('load', registerStatusModule);

// =============================================
// GLOBAL STATE - MODULE SCOPED (PRESERVED)
// =============================================
const state = {
    initialized: false,
    parentDetected: false,
    handshakeComplete: false,
    sessionActive: false,
    permissionsGranted: ['guest', 'view_statuses'],
    dependenciesLoaded: false,
    readyState: 'preflight',
    shutdownInProgress: false,
    
    // Enhanced handshake tracking
    handshakeState: 'idle',
    handshakeStartTime: null,
    handshakeEndTime: null,
    handshakeRetryCount: 0,
    handshakeMaxRetries: IframeEnvironment.getConfig().maxRetries,
    handshakeTimeoutMs: IframeEnvironment.getConfig().handshakeTimeout,
    parentReadyReceived: false,
    childReadySent: false,
    handshakeAckReceived: false,
    sessionSyncReceived: false,
    pageActivated: false,
    
    // Frame identification
    frameId: IframeAuthority.id,
    instanceId: IframeAuthority.instanceId,
    sessionId: null,
    
    // Capability tracking
    capabilities: new Map(),
    parentCapabilities: new Set(),
    
    // Security context
    securityContext: {
        originValidated: false,
        parentOrigin: null,
        signatureRequired: !IframeEnvironment.isSandboxed && IframeEnvironment.type !== 'LOCAL_DEV',
        encryptionRequired: false,
        hmacKey: null,
        timestampTolerance: IframeEnvironment.isVPNNetwork ? 60000 : 30000,
        replayProtection: !IframeEnvironment.isSandboxed,
        messageSequence: new Map()
    },
    
    // Session Mirror Layer
    sessionMirror: {
        token: null,
        user: null,
        expiry: null,
        permissions: [],
        timestamp: 0,
        messageId: null,
        validated: false,
        source: null,
        refreshToken: null,
        lastRefresh: null,
        refreshInProgress: false,
        capabilities: []
    },
    
    sessionData: null,
    token: null,
    user: null,
    isGuestMode: true,
    sessionExpiry: null,
    
    messageId: 0,
    pendingAcks: new Map(),
    pendingRequests: new Map(),
    messageCache: new Set(),
    messageSequence: new Map(),
    originValidated: false,
    
    // Retry queue - replaced by controlled retry
    retryQueue: [],
    retryTimers: new Map(),
    maxRetryAttempts: 3,
    baseRetryDelay: 1000,
    maxRetryDelay: 30000,
    
    // Offline buffer
    offlineBuffer: [],
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    offlineModeEnabled: false,
    
    // Heartbeat tracking - TOLERANT
    heartbeatFailures: 0,
    maxHeartbeatFailures: 3,
    lastHeartbeatSent: null,
    lastHeartbeatReceived: null,
    
    listeners: new Set(),
    intervals: new Set(),
    timeouts: new Set(),
    
    features: new Map(),
    disabledFeatures: new Set(),
    
    metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        handshakeAttempts: 0,
        errorsLogged: 0,
        startTime: Date.now(),
        lastHandshake: 0,
        handshakeFailures: 0,
        retryCount: 0,
        offlineOperations: 0,
        tokenRefreshes: 0,
        originValidations: 0,
        capabilityNegotiations: 0,
        recoveryAttempts: 0,
        successfulRecoveries: 0,
        statusViews: 0,
        statusReactions: 0,
        statusPosts: 0,
        statusExpired: 0
    },
    
    handshakeId: null,
    handshakePromise: null,
    handshakeResolve: null,
    handshakeReject: null,
    handshakeTimer: null,
    handshakeRetries: 0,
    maxHandshakeRetries: IframeEnvironment.getConfig().maxRetries,
    
    protocolVersion: '8.1',
    parentProtocolVersion: null,
    
    diagnosticsEnabled: true,
    diagnosticData: []
};

// =============================================
// IFRAME TRANSPORT - CENTRALIZED COMMUNICATION LAYER (PRESERVED)
// =============================================
const IframeTransport = {
    version: '8.1',
    messageQueue: [],
    isProcessing: false,
    maxRetries: 3,
    baseRetryDelay: 1000,
    maxRetryDelay: 30000,
    messageCounter: 0,
    pendingAcks: new Map(),
    heartbeatInterval: null,
    lastHeartbeatSent: null,
    lastHeartbeatReceived: null,
    heartbeatMissed: 0,
    maxMissedHeartbeats: 3,
    connectionStatus: 'disconnected',
    offlineBuffer: [],
    batchMessages: IframeEnvironment.getConfig().batchMessages,
    keepalive: IframeEnvironment.getConfig().keepalive,
    _messageLogs: new Set(),
    
    initialize() {
        debugLog('IframeTransport initialized');
        return this;
    },
    
    send(type, payload = {}, options = {}) {
        // Delegate to ParentCommunication
        if (type === 'CHILD_READY') {
            ParentCommunication.sendChildReady();
            return Promise.resolve({ success: true });
        }
        
        if (type === 'REGISTER_MODULE') {
            ParentCommunication.sendRegistration();
            return Promise.resolve({ success: true });
        }
        
        // For actions, use the action wrapper
        const message = MessageValidator.createMessage(type, payload, {
            expectAck: options.requiresAck || false
        });
        
        const sent = ParentCommunication.postToParent(message);
        if (sent) {
            return Promise.resolve({ success: true, messageId: message.messageId });
        } else {
            return Promise.reject(new Error('Failed to send message'));
        }
    },
    
    sanitizePayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;
        
        try {
            return JSON.parse(JSON.stringify(payload, (key, value) => {
                if (typeof value === 'string' && value.length > 10000) {
                    return value.substring(0, 10000) + '... [truncated]';
                }
                if (key === 'token' && typeof value === 'string') {
                    return '[REDACTED]';
                }
                return value;
            }));
        } catch {
            return payload;
        }
    },
    
    queueOffline(type, payload, options, resolve, reject) {
        const offlineItem = {
            id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
            type,
            payload,
            options,
            resolve,
            reject,
            timestamp: Date.now()
        };
        
        this.offlineBuffer.push(offlineItem);
        
        DiagnosticsAgent.increment('offlineOperations');
        
        const offlineKey = `offline_${type}`;
        if (!this._messageLogs.has(offlineKey)) {
            this._messageLogs.add(offlineKey);
            logStatus('WARNING', `Offline - queued ${type}`);
        }
    },
    
    calculateRetryDelay(attempt) {
        const baseDelay = IframeEnvironment.isVPNNetwork ? 2000 : 1000;
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), this.maxRetryDelay);
        
        // Add jitter
        const jitter = Math.random() * 200;
        return delay + jitter;
    },
    
    cleanupPendingAcks() {
        const now = Date.now();
        for (const [id, handler] of this.pendingAcks.entries()) {
            if (now - handler.timestamp > 30000) {
                clearTimeout(handler.timer);
                this.pendingAcks.delete(id);
            }
        }
    },
    
    startHeartbeat() {
        // Disabled - heartbeat now initiated by parent
        debugLog('Heartbeat disabled - waiting for parent heartbeats');
    },
    
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    },
    
    async processOfflineQueue() {
        if (this.offlineBuffer.length === 0 || !IframeAuthority.parentDetected) return;
        
        const processKey = 'offline_process';
        if (!this._messageLogs.has(processKey)) {
            this._messageLogs.add(processKey);
            logStatus('INFO', `Processing ${this.offlineBuffer.length} offline messages`);
        }
        
        const queue = [...this.offlineBuffer];
        this.offlineBuffer = [];
        
        for (const item of queue) {
            try {
                const result = await this.send(item.type, item.payload, item.options);
                item.resolve(result);
            } catch (error) {
                item.reject(error);
            }
            
            // Small delay between messages
            await new Promise(r => setTimeout(r, 10));
        }
        
        const completeKey = 'offline_complete';
        if (!this._messageLogs.has(completeKey)) {
            this._messageLogs.add(completeKey);
            logStatus('SUCCESS', 'Offline queue processed');
        }
    },
    
    getStatus() {
        return {
            connectionStatus: this.connectionStatus,
            pendingAcks: this.pendingAcks.size,
            retryQueue: this.retryQueue.size,
            offlineBuffer: this.offlineBuffer.length,
            heartbeatMissed: this.heartbeatMissed,
            lastHeartbeatSent: this.lastHeartbeatSent,
            lastHeartbeatReceived: this.lastHeartbeatReceived
        };
    }
}.initialize();

// =============================================
// NAVIGATION GUARD - PROTECTS PAGE TRANSITIONS (PRESERVED)
// =============================================
const NavigationGuard = {
    active: false,
    pendingOperations: 0,
    guardElement: null,
    beforeUnloadHandler: null,
    navigationListeners: new Set(),
    historyState: [],
    maxHistory: 50,
    
    initialize() {
        this.createGuardElement();
        this.setupBeforeUnload();
        this.setupHistoryTracking();
        this.setupNavigationListeners();
        debugLog('NavigationGuard initialized');
        return this;
    },
    
    createGuardElement() {
        if (document.getElementById('navigationGuard')) return;
        
        const guard = document.createElement('div');
        guard.id = 'navigationGuard';
        guard.className = 'navigation-guard';
        guard.innerHTML = `
            <i class="fas fa-sync-alt fa-spin"></i>
            <span>Operation in progress. Please wait...</span>
        `;
        
        document.body.appendChild(guard);
        this.guardElement = guard;
    },
    
    setupBeforeUnload() {
        this.beforeUnloadHandler = (e) => {
            if (this.pendingOperations > 0) {
                e.preventDefault();
                e.returnValue = 'There are pending operations. Are you sure you want to leave?';
                return e.returnValue;
            }
        };
        
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
    },
    
    setupHistoryTracking() {
        const pushState = history.pushState;
        const replaceState = history.replaceState;
        
        history.pushState = (...args) => {
            const result = pushState.apply(history, args);
            this.trackHistoryChange('push', args[2]);
            return result;
        };
        
        history.replaceState = (...args) => {
            const result = replaceState.apply(history, args);
            this.trackHistoryChange('replace', args[2]);
            return result;
        };
        
        window.addEventListener('popstate', () => {
            this.trackHistoryChange('pop', window.location.pathname);
        });
    },
    
    trackHistoryChange(type, url) {
        this.historyState.push({
            type,
            url,
            timestamp: Date.now()
        });
        
        if (this.historyState.length > this.maxHistory) {
            this.historyState.shift();
        }
    },
    
    setupNavigationListeners() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href && link.target !== '_blank') {
                this.handleNavigation(link.href);
            }
        });
        
        window.addEventListener('pagehide', () => {
            this.handlePageHide();
        });
    },
    
    handleNavigation(url) {
        if (this.pendingOperations > 0) {
            if (!confirm('There are pending operations. Navigate away?')) {
                return false;
            }
        }
        return true;
    },
    
    handlePageHide() {
        if (this.pendingOperations > 0 && typeof sendToParent !== 'undefined') {
            sendToParent('PAGE_HIDE', {
                pendingOperations: this.pendingOperations,
                timestamp: Date.now()
            }, { requiresAck: false, silent: true });
        }
    },
    
    startOperation(operation) {
        this.pendingOperations++;
        this.active = true;
        this.updateGuard();
    },
    
    endOperation(operation) {
        this.pendingOperations = Math.max(0, this.pendingOperations - 1);
        this.active = this.pendingOperations > 0;
        this.updateGuard();
    },
    
    updateGuard() {
        if (!this.guardElement) return;
        
        if (this.pendingOperations > 0) {
            this.guardElement.classList.add('active');
        } else {
            this.guardElement.classList.remove('active');
        }
    },
    
    wrapOperation(fn, operationName) {
        return async (...args) => {
            this.startOperation(operationName);
            try {
                return await fn(...args);
            } finally {
                this.endOperation(operationName);
            }
        };
    },
    
    addNavigationListener(listener) {
        this.navigationListeners.add(listener);
        return () => this.navigationListeners.delete(listener);
    },
    
    getState() {
        return {
            active: this.active,
            pendingOperations: this.pendingOperations,
            historySize: this.historyState.length
        };
    },
    
    reset() {
        this.pendingOperations = 0;
        this.active = false;
        this.updateGuard();
        this.historyState = [];
    }
}.initialize();

// =============================================
// ERROR BOUNDARY SYSTEM (PRESERVED)
// =============================================
function createErrorBoundary(fn, featureName, fallback = null) {
    return async function(...args) {
        if (typeof state !== 'undefined' && state.disabledFeatures?.has(featureName)) {
            return typeof fallback === 'function' ? fallback(...args) : fallback;
        }

        try {
            return await fn(...args);
        } catch (error) {
            // Only log each error once
            const errorKey = `error_${featureName}`;
            if (!_loggedMessages.has(errorKey)) {
                _loggedMessages.add(errorKey);
                logStatus('FAILED', `${featureName}: ${error.message}`);
            }
            
            if (typeof state !== 'undefined' && state.disabledFeatures) {
                state.disabledFeatures.add(featureName);
            }
            
            const key = featureName.split(':')[0];
            if (typeof CIRCUIT_BREAKER !== 'undefined') {
                CIRCUIT_BREAKER.failures[key] = (CIRCUIT_BREAKER.failures[key] || 0) + 1;
                CIRCUIT_BREAKER.lastFailure[key] = Date.now();
            }
            
            return typeof fallback === 'function' ? fallback(...args) : fallback;
        }
    };
}

// =============================================
// CIRCUIT BREAKER (PRESERVED)
// =============================================
const CIRCUIT_BREAKER = {
    failures: {},
    threshold: 5,
    timeout: 30000,
    lastFailure: {},
    
    isOpen(service) {
        const failures = this.failures[service] || 0;
        const lastFailure = this.lastFailure[service] || 0;
        const timeSinceFailure = Date.now() - lastFailure;
        
        if (failures >= this.threshold && timeSinceFailure < this.timeout) {
            return true;
        }
        
        if (timeSinceFailure >= this.timeout) {
            this.failures[service] = 0;
            return false;
        }
        
        return false;
    },
    
    recordFailure(service) {
        this.failures[service] = (this.failures[service] || 0) + 1;
        this.lastFailure[service] = Date.now();
        
        const key = `circuit_${service}`;
        if (!_loggedMessages.has(key)) {
            _loggedMessages.add(key);
            logStatus('WARNING', `Circuit failure for ${service}: ${this.failures[service]}`);
        }
    },
    
    recordSuccess(service) {
        this.failures[service] = 0;
    }
};

function isCircuitOpen(service) {
    return CIRCUIT_BREAKER.isOpen(service);
}

// =============================================
// ENHANCED HANDSHAKE CLIENT (PRESERVED)
// =============================================
const HandshakeClient = {
    status: 'idle',
    handshakeId: null,
    startTime: null,
    endTime: null,
    resolve: null,
    reject: null,
    timer: null,
    retries: 0,
    maxRetries: IframeEnvironment.getConfig().maxRetries,
    childReadySent: false,
    parentReadyReceived: false,
    handshakeAckReceived: false,
    sessionSyncReceived: false,
    handshakePromise: null,
    handshakeInProgress: false,
    handshakeLock: false,
    _handshakeLogged: false,
    
    initialize() {
        this.reset();
        debugLog('HandshakeClient initialized');
        return this;
    },
    
    reset() {
        this.status = 'idle';
        this.handshakeId = null;
        this.startTime = null;
        this.endTime = null;
        this.resolve = null;
        this.reject = null;
        this.retries = 0;
        this.childReadySent = false;
        this.parentReadyReceived = false;
        this.handshakeAckReceived = false;
        this.sessionSyncReceived = false;
        this.handshakeInProgress = false;
        this._handshakeLogged = false;
        
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    },
    
    async execute(options = {}) {
        // Use ParentCommunication instead
        if (!ParentCommunication.childReadySent && isLifecycleState(LifecycleState.READY)) {
            ParentCommunication.sendChildReady();
        }
        
        return { success: true, delegated: true };
    },
    
    handleResponse(message) {
        // Delegate to ParentCommunication
        if (message.type === 'PARENT_READY') {
            ParentCommunication.parentReadyReceived = true;
        }
        
        if (message.type === 'MODULE_REGISTERED') {
            ParentCommunication.moduleRegistered = true;
        }
        
        if (message.type === 'SESSION_DATA' || message.type === 'SESSION_ACTIVE') {
            ParentCommunication.handleSessionSync(message.payload);
        }
    },
    
    handleSessionInit(message) {
        ParentCommunication.handleSessionSync(message.payload || message.data);
    }
}.initialize();

// =============================================
// IFRAME HANDSHAKE AUTHORITY - DETERMINISTIC HANDSHAKE
// =============================================
const IframeHandshakeAuthority = {
    status: 'idle',
    handshakeId: null,
    startTime: null,
    endTime: null,
    resolve: null,
    reject: null,
    timer: null,
    retries: 0,
    maxRetries: IframeEnvironment.getConfig().maxRetries,
    childReadySent: false,
    parentReadyReceived: false,
    handshakeAckReceived: false,
    sessionSyncReceived: false,
    handshakePromise: null,
    handshakeInProgress: false,
    handshakeLock: false,
    _handshakeLogged: false,
    
    initialize() {
        this.reset();
        debugLog('IframeHandshakeAuthority initialized');
        return this;
    },
    
    reset() {
        this.status = 'idle';
        this.handshakeId = null;
        this.startTime = null;
        this.endTime = null;
        this.resolve = null;
        this.reject = null;
        this.retries = 0;
        this.childReadySent = false;
        this.parentReadyReceived = false;
        this.handshakeAckReceived = false;
        this.sessionSyncReceived = false;
        this.handshakeInProgress = false;
        this._handshakeLogged = false;
        
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    },
    
    async execute(options = {}) {
        if (this.handshakeInProgress) {
            return this.handshakePromise;
        }
        
        this.handshakeInProgress = true;
        this.status = 'connecting';
        this.startTime = Date.now();
        this.handshakeId = generateHandshakeId();
        
        this.handshakePromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            
            // Send CHILD_READY
            if (!ParentCommunication.childReadySent && isLifecycleState(LifecycleState.READY)) {
                ParentCommunication.sendChildReady();
                this.childReadySent = true;
            }
        });
        
        return this.handshakePromise;
    },
    
    handleResponse(message) {
        if (message.type === 'PARENT_READY') {
            this.parentReadyReceived = true;
            this.status = 'parent_ready';
            
        } else if (message.type === 'MODULE_REGISTERED') {
            this.handshakeAckReceived = true;
            this.status = 'registered';
            
        } else if (message.type === 'SESSION_DATA' || message.type === 'SESSION_ACTIVE') {
            this.sessionSyncReceived = true;
            this.status = 'connected';
            this.endTime = Date.now();
            this.handshakeInProgress = false;
            
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }
            
            if (this.resolve) {
                this.resolve({ success: true, handshakeId: this.handshakeId });
            }
        }
    },
    
    handleSessionInit(message) {
        ParentCommunication.handleSessionSync(message.payload || message.data);
    }
}.initialize();

// =============================================
// STARTUP GOVERNOR - CONTROLLED INITIALIZATION
// =============================================
const StartupGovernor = {
    state: 'PENDING',
    stages: {
        PREFLIGHT: 'PREFLIGHT',
        DEPENDENCY_CHECK: 'DEPENDENCY_CHECK',
        PARENT_DETECT: 'PARENT_DETECT',
        HANDSHAKE: 'HANDSHAKE',
        REGISTRATION: 'REGISTRATION',
        SESSION_SYNC: 'SESSION_SYNC',
        ACTIVE: 'ACTIVE',
        DEGRADED: 'DEGRADED',
        RECOVERING: 'RECOVERING'
    },
    currentStage: 'PREFLIGHT',
    startTime: Date.now(),
    stageTimes: {},
    errors: [],
    
    initialize() {
        debugLog('StartupGovernor initialized');
        return this;
    },
    
    transitionTo(stage) {
        this.stageTimes[stage] = Date.now() - this.startTime;
        this.currentStage = stage;
        this.state = stage;
        
        document.dispatchEvent(new CustomEvent('governorStateChange', {
            detail: { newState: stage, previousState: this.currentStage }
        }));
        
        debugLog(`StartupGovernor: ${stage}`);
    },
    
    recordError(error) {
        this.errors.push({
            stage: this.currentStage,
            error: error.message,
            timestamp: Date.now()
        });
    },
    
    canProceed() {
        return this.state !== 'DEGRADED';
    },
    
    getMetrics() {
        return {
            currentStage: this.currentStage,
            stageTimes: this.stageTimes,
            errors: this.errors,
            totalTime: Date.now() - this.startTime
        };
    }
}.initialize();

// =============================================
// SESSION CLIENT - RESILIENT SESSION MANAGEMENT (PRESERVED)
// =============================================
const SessionClient = {
    session: null,
    sessionValid: false,
    sessionExpiry: null,
    refreshInProgress: false,
    refreshTimer: null,
    sessionListeners: new Set(),
    offlineMode: false,
    
    initialize() {
        this.loadCachedSession();
        this.setupRefreshTimer();
        debugLog('SessionClient initialized');
        return this;
    },
    
    loadCachedSession() {
        try {
            const cached = SafeStorage.getJSON('session_cache');
            if (cached && cached.token && cached.user) {
                this.session = cached;
                this.sessionValid = true;
                this.sessionExpiry = cached.expiry ? new Date(cached.expiry) : null;
                
                if (this.sessionExpiry && this.sessionExpiry > new Date()) {
                    const cacheKey = 'cached_session_loaded';
                    if (!_loggedMessages.has(cacheKey)) {
                        _loggedMessages.add(cacheKey);
                        logStatus('SUCCESS', 'Cached session loaded');
                    }
                    return true;
                }
            }
        } catch (e) {}
        return false;
    },
    
    setupRefreshTimer() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        // Check session every 5 minutes
        this.refreshTimer = setInterval(() => {
            this.checkSession();
        }, 300000);
    },
    
    async checkSession() {
        if (!this.sessionValid) return;
        
        // Check if session is about to expire (within 5 minutes)
        if (this.sessionExpiry) {
            const timeToExpiry = this.sessionExpiry - new Date();
            if (timeToExpiry < 300000 && timeToExpiry > 0) {
                const expiryKey = 'session_expiring';
                if (!_loggedMessages.has(expiryKey)) {
                    _loggedMessages.add(expiryKey);
                    logStatus('WARNING', 'Session expiring soon, refreshing...');
                }
                await this.refreshSession();
            }
        }
    },
    
    async refreshSession() {
        if (this.refreshInProgress) return this.session;
        
        this.refreshInProgress = true;
        
        try {
            const response = await ParentCommunication.sendAction('TOKEN_REFRESH', {
                refreshToken: this.session?.refreshToken
            });
            
            if (response && response.payload && response.payload.token) {
                this.session.token = response.payload.token;
                if (response.payload.refreshToken) {
                    this.session.refreshToken = response.payload.refreshToken;
                }
                if (response.payload.expiry) {
                    this.session.expiry = response.payload.expiry;
                    this.sessionExpiry = new Date(response.payload.expiry);
                }
                
                this.cacheSession();
                this.notifyListeners('refreshed', this.session);
                
                const refreshKey = 'session_refreshed';
                if (!_loggedMessages.has(refreshKey)) {
                    _loggedMessages.add(refreshKey);
                    logStatus('SUCCESS', 'Session refreshed');
                }
                
                return this.session;
            }
        } catch (error) {
            // If refresh fails, use cached if available
            if (this.session) {
                const failKey = 'session_refresh_failed';
                if (!_loggedMessages.has(failKey)) {
                    _loggedMessages.add(failKey);
                    logStatus('FAILED', 'Session refresh failed');
                }
                
                this.offlineMode = true;
            }
        } finally {
            this.refreshInProgress = false;
        }
        
        return this.session;
    },
    
    updateSession(sessionData, source = 'parent') {
        if (!sessionData) return false;
        
        const oldSession = this.session ? { ...this.session } : null;
        
        if (sessionData.token) {
            if (!this.session) this.session = {};
            this.session.token = sessionData.token;
            if (typeof state !== 'undefined') {
                state.token = sessionData.token;
            }
        }
        
        if (sessionData.user) {
            if (!this.session) this.session = {};
            this.session.user = {
                id: sessionData.user.id || sessionData.user.userId,
                displayName: sessionData.user.displayName || sessionData.user.name,
                photoURL: sessionData.user.photoURL || sessionData.user.avatar,
                email: sessionData.user.email,
                isGuest: sessionData.user.isGuest || false
            };
            if (typeof state !== 'undefined') {
                state.user = this.session.user;
            }
        }
        
        if (sessionData.refreshToken) {
            if (!this.session) this.session = {};
            this.session.refreshToken = sessionData.refreshToken;
        }
        
        if (sessionData.expiry) {
            this.session.expiry = sessionData.expiry;
            this.sessionExpiry = new Date(sessionData.expiry);
        }
        
        if (sessionData.permissions) {
            if (!this.session) this.session = {};
            this.session.permissions = [...sessionData.permissions];
            if (typeof state !== 'undefined') {
                state.permissionsGranted = [...sessionData.permissions];
            }
        }
        
        if (sessionData.sessionId && typeof state !== 'undefined') {
            state.sessionId = sessionData.sessionId;
        }
        
        this.sessionValid = true;
        this.cacheSession();
        
        this.notifyListeners('updated', this.session, oldSession);
        
        const updateKey = `session_updated_${source}`;
        if (!_loggedMessages.has(updateKey)) {
            _loggedMessages.add(updateKey);
            logStatus('SUCCESS', `Session updated from ${source}`);
        }
        
        // Disable offline mode
        this.offlineMode = false;
        
        return true;
    },
    
    clearSession() {
        this.session = null;
        this.sessionValid = false;
        this.sessionExpiry = null;
        this.offlineMode = true;
        
        SafeStorage.remove('session_cache');
        
        this.notifyListeners('cleared', null);
        
        const clearKey = 'session_cleared';
        if (!_loggedMessages.has(clearKey)) {
            _loggedMessages.add(clearKey);
            logStatus('WARNING', 'Session cleared');
        }
    },
    
    cacheSession() {
        if (this.session) {
            SafeStorage.setJSON('session_cache', this.session);
        }
    },
    
    getSession() {
        return this.session ? { ...this.session } : null;
    },
    
    isAuthenticated() {
        return this.sessionValid && !!this.session?.token && !!this.session?.user;
    },
    
    isGuest() {
        return !this.isAuthenticated() || this.session?.user?.isGuest === true;
    },
    
    isOfflineMode() {
        return this.offlineMode;
    },
    
    addListener(listener) {
        this.sessionListeners.add(listener);
        return () => this.sessionListeners.delete(listener);
    },
    
    notifyListeners(event, session, oldSession = null) {
        this.sessionListeners.forEach(listener => {
            try {
                listener({ event, session, oldSession });
            } catch (e) {}
        });
    }
}.initialize();

// =============================================
// SESSION MIRROR LAYER - ENHANCED (PRESERVED)
// =============================================
function updateSessionMirror(sessionData, source = 'parent') {
    try {
        if (!sessionData) return false;
        
        const previousState = { ...state.sessionMirror };
        
        // Update token if provided
        if (sessionData.token && typeof sessionData.token === 'string') {
            // Handle 'present' placeholder - if we have actual token, use it
            if (sessionData.token === 'present' && sessionData.actualToken) {
                state.sessionMirror.token = sessionData.actualToken;
                state.token = sessionData.actualToken;
            } else {
                state.sessionMirror.token = sessionData.token;
                state.token = sessionData.token;
            }
        }
        
        // Update refresh token if provided
        if (sessionData.refreshToken) {
            state.sessionMirror.refreshToken = sessionData.refreshToken;
        }
        
        // Update user if provided
        if (sessionData.user) {
            state.sessionMirror.user = {
                id: sessionData.user.id || sessionData.user.userId,
                displayName: sessionData.user.displayName || sessionData.user.name,
                photoURL: sessionData.user.photoURL || sessionData.user.avatar,
                email: sessionData.user.email,
                isGuest: sessionData.user.isGuest || false
            };
            state.user = state.sessionMirror.user;
        }
        
        // Update permissions
        if (sessionData.permissions && Array.isArray(sessionData.permissions)) {
            state.sessionMirror.permissions = [...sessionData.permissions];
            state.permissionsGranted = [...sessionData.permissions];
        }
        
        // Update capabilities
        if (sessionData.capabilities && Array.isArray(sessionData.capabilities)) {
            state.sessionMirror.capabilities = [...sessionData.capabilities];
        }
        
        // Update expiry
        if (sessionData.expiry) {
            state.sessionMirror.expiry = new Date(sessionData.expiry);
            state.sessionExpiry = state.sessionMirror.expiry;
        }
        
        // Update session ID
        if (sessionData.sessionId) {
            state.sessionId = sessionData.sessionId;
        }
        
        // Update metadata
        state.sessionMirror.timestamp = Date.now();
        state.sessionMirror.source = source;
        state.sessionMirror.messageId = sessionData.messageId || sessionData.id;
        
        // Validate session
        if (state.sessionMirror.token && state.sessionMirror.user) {
            state.sessionMirror.validated = true;
            state.sessionActive = true;
            state.isGuestMode = false;
            
            // Also update session client
            SessionClient.updateSession(sessionData, source);
            
            // Cache session
            SafeStorage.setJSON(UNIFIED_TOKEN_KEY, state.sessionMirror.token);
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER, state.sessionMirror.user);
            if (state.sessionMirror.refreshToken) {
                SafeStorage.setJSON('REFRESH_TOKEN', state.sessionMirror.refreshToken);
            }
            
            const updateKey = `mirror_updated_${source}`;
            if (!_loggedMessages.has(updateKey)) {
                _loggedMessages.add(updateKey);
                logStatus('SUCCESS', `Session mirror updated from ${source}`);
            }
            
            // Trigger callbacks
            if (typeof isTokenReady !== 'undefined') {
                isTokenReady = true;
                if (typeof triggerTokenReadyCallbacks !== 'undefined') {
                    triggerTokenReadyCallbacks();
                }
            }
            
            if (typeof processPendingApiRequests !== 'undefined') {
                processPendingApiRequests();
            }
            
            return true;
        }
        
        return false;
    } catch (error) {
        const errorKey = `mirror_update_${error.message}`;
        if (!_loggedMessages.has(errorKey)) {
            _loggedMessages.add(errorKey);
            logStatus('FAILED', `updateSessionMirror: ${error.message}`);
        }
        return false;
    }
}

function getSessionMirror() {
    return {
        ...state.sessionMirror,
        user: state.sessionMirror.user ? { ...state.sessionMirror.user } : null,
        capabilities: state.sessionMirror.capabilities ? [...state.sessionMirror.capabilities] : []
    };
}

function isSessionMirrorValid() {
    if (!state.sessionMirror.validated) return false;
    if (!state.sessionMirror.token || !state.sessionMirror.user) return false;
    if (state.sessionMirror.expiry && new Date() >= state.sessionMirror.expiry) return false;
    return true;
}

// =============================================
// PARENT CONFIGURATION REQUEST (PRESERVED)
// =============================================
async function requestParentConfig() {
    if (!isLifecycleState(LifecycleState.ACTIVE)) {
        debugLog('Cannot request config - not active');
        return;
    }
    
    ParentCommunication.sendAction('REQUEST_CONFIG', {});
}

function applyParentConfig(config) {
    try {
        if (config.heartbeatInterval) {
            // Adjust if needed
            IframeEnvironment.getConfig().heartbeatInterval = config.heartbeatInterval;
        }
        
        if (config.sessionTimeout) {
            state.sessionExpiry = new Date(Date.now() + config.sessionTimeout);
        }
        
        if (config.maxRetries) {
            state.maxRetryAttempts = config.maxRetries;
        }
        
        if (config.security) {
            if (config.security.signatureRequired !== undefined) {
                state.securityContext.signatureRequired = config.security.signatureRequired && !IframeAuthority.compatibilityMode;
            }
            if (config.security.timestampTolerance) {
                state.securityContext.timestampTolerance = config.security.timestampTolerance;
            }
        }
        
        const applyKey = 'config_applied';
        if (!_loggedMessages.has(applyKey)) {
            _loggedMessages.add(applyKey);
            logStatus('SUCCESS', 'Parent config applied');
        }
        
        document.dispatchEvent(new CustomEvent('configApplied', {
            detail: config
        }));
        
    } catch (error) {}
}

// =============================================
// TOKEN REFRESH HANDLER (PRESERVED)
// =============================================
async function refreshToken() {
    if (state.sessionMirror.refreshInProgress) return state.token;
    
    state.sessionMirror.refreshInProgress = true;
    
    try {
        const response = await ParentCommunication.sendAction('TOKEN_REFRESH', {
            refreshToken: state.sessionMirror.refreshToken
        });
        
        if (response && response.payload && response.payload.token) {
            state.token = response.payload.token;
            state.sessionMirror.token = response.payload.token;
            state.sessionMirror.lastRefresh = Date.now();
            
            if (response.payload.refreshToken) {
                state.sessionMirror.refreshToken = response.payload.refreshToken;
            }
            
            SafeStorage.set(UNIFIED_TOKEN_KEY, state.token);
            
            const refreshKey = 'token_refreshed';
            if (!_loggedMessages.has(refreshKey)) {
                _loggedMessages.add(refreshKey);
                logStatus('SUCCESS', 'Token refreshed');
            }
            
            return state.token;
        }
    } catch (error) {
        // Don't retry aggressively
        const failKey = 'token_refresh_failed';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', 'Token refresh failed');
        }
    } finally {
        state.sessionMirror.refreshInProgress = false;
    }
    
    return state.token;
}

// =============================================
// PARENT AVAILABILITY DETECTION (PRESERVED)
// =============================================
const ParentDetector = {
    status: 'unknown',
    checkCount: 0,
    maxChecks: 3,
    checkInterval: null,
    
    detect() {
        return new Promise((resolve) => {
            this.status = 'checking';
            this.checkCount = 0;
            
            const check = () => {
                this.checkCount++;
                
                const isAvailable = this.checkAvailability();
                
                if (isAvailable) {
                    this.status = 'available';
                    state.parentDetected = true;
                    IframeAuthority.parentDetected = true;
                    
                    if (this.checkInterval) {
                        clearInterval(this.checkInterval);
                        this.checkInterval = null;
                    }
                    
                    const detectKey = 'parent_detected';
                    if (!_loggedMessages.has(detectKey)) {
                        _loggedMessages.add(detectKey);
                        logStatus('SUCCESS', 'Parent detected');
                    }
                    
                    resolve(true);
                    return;
                }
                
                if (this.checkCount >= this.maxChecks) {
                    this.status = 'unavailable';
                    state.parentDetected = false;
                    IframeAuthority.parentDetected = false;
                    
                    if (this.checkInterval) {
                        clearInterval(this.checkInterval);
                        this.checkInterval = null;
                    }
                    
                    const noParentKey = 'parent_not_detected';
                    if (!_loggedMessages.has(noParentKey)) {
                        _loggedMessages.add(noParentKey);
                        logStatus('WARNING', 'Parent not detected');
                    }
                    
                    resolve(false);
                    return;
                }
            };
            
            // First check immediately
            check();
            
            // Then check every 100ms (limited)
            this.checkInterval = setInterval(check, 100);
        });
    },
    
    checkAvailability() {
        try {
            // Check if in iframe
            if (window.self === window.top) {
                return false;
            }
            
            // Check if parent accessible
            if (!window.parent || window.parent === window) {
                return false;
            }
            
            // Check postMessage availability
            if (typeof window.parent.postMessage !== 'function') {
                return false;
            }
            
            return true;
        } catch (e) {
            // Cross-origin errors indicate parent exists but is cross-origin
            if (e.name === 'SecurityError') {
                return true;
            }
            return false;
        }
    },
    
    isAvailable() {
        return this.status === 'available';
    },
    
    reset() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.status = 'unknown';
        this.checkCount = 0;
    }
};

// =============================================
// INITIALIZATION PIPELINE - PREFLIGHT → READY (NO TIMEOUTS)
// =============================================
async function preflightStage() {
    try {
        if (typeof window === 'undefined') throw new Error('Window not available');
        if (typeof document === 'undefined') throw new Error('Document not available');
        
        // Detect environment
        IframeEnvironment.detect();
        
        const preflightKey = 'preflight_complete';
        if (!_loggedMessages.has(preflightKey)) {
            _loggedMessages.add(preflightKey);
            logStatus('SUCCESS', 'Preflight complete');
        }
        
        return { success: true };
    } catch (error) {
        const failKey = 'preflight_failed';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Preflight failed: ${error.message}`);
        }
        return { success: false, fallback: true };
    }
}

async function dependencyCheckStage() {
    try {
        const requiredApis = ['localStorage', 'postMessage', 'addEventListener'];
        const missing = requiredApis.filter(api => typeof window[api] === 'undefined');
        
        if (missing.length > 0) {
            state.dependenciesLoaded = false;
            const missingKey = 'missing_deps_' + missing.join('_');
            if (!_loggedMessages.has(missingKey)) {
                _loggedMessages.add(missingKey);
                logStatus('WARNING', `Missing dependencies: ${missing.join(', ')}`);
            }
            return { success: false, fallback: true, missing };
        }
        
        state.dependenciesLoaded = true;
        
        const depsKey = 'deps_ok';
        if (!_loggedMessages.has(depsKey)) {
            _loggedMessages.add(depsKey);
            logStatus('SUCCESS', 'Dependencies OK');
        }
        
        return { success: true };
    } catch (error) {
        const failKey = 'deps_failed';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Dependency check failed: ${error.message}`);
        }
        state.dependenciesLoaded = false;
        return { success: false, fallback: true };
    }
}

async function parentDetectStage(timeout = 2000) {
    const detected = await ParentDetector.detect();
    
    if (detected) {
        return { success: true };
    } else {
        return { success: false, fallback: true };
    }
}

async function handshakeStage(options = {}) {
    if (!state.parentDetected) {
        state.handshakeComplete = false;
        const noParentKey = 'handshake_no_parent';
        if (!_loggedMessages.has(noParentKey)) {
            _loggedMessages.add(noParentKey);
            logStatus('WARNING', 'No parent detected, skipping handshake');
        }
        return { success: false, fallback: true };
    }
    
    // Use ParentCommunication instead
    if (isLifecycleState(LifecycleState.READY)) {
        ParentCommunication.sendChildReady();
    }
    
    return { success: true, delegated: true };
}

async function sessionSyncStage(timeout = 5000) {
    if (!state.handshakeComplete || !state.parentDetected) {
        if (state.sessionMirror.validated) {
            activateSessionFromMirror();
            const cacheKey = 'using_cached_session';
            if (!_loggedMessages.has(cacheKey)) {
                _loggedMessages.add(cacheKey);
                logStatus('SUCCESS', 'Using cached session');
            }
            return { success: true, guestMode: false, cached: true };
        }
        
        enableGuestMode();
        const noSessionKey = 'no_session_guest';
        if (!_loggedMessages.has(noSessionKey)) {
            _loggedMessages.add(noSessionKey);
            logStatus('WARNING', 'No session, using guest mode');
        }
        return { success: false, guestMode: true };
    }
    
    return { success: true, waiting: true };
}

function activateSessionFromMirror() {
    if (!state.sessionMirror.validated) return false;
    
    state.sessionActive = true;
    state.isGuestMode = false;
    state.token = state.sessionMirror.token;
    state.user = state.sessionMirror.user;
    state.permissionsGranted = state.sessionMirror.permissions.length > 0 ? 
        state.sessionMirror.permissions : ['view_statuses', 'create_status'];
    state.sessionData = {
        user: state.user,
        token: state.token,
        permissions: state.permissionsGranted,
        expiry: state.sessionMirror.expiry,
        capabilities: state.sessionMirror.capabilities
    };
    
    const activateKey = 'session_activated';
    if (!_loggedMessages.has(activateKey)) {
        _loggedMessages.add(activateKey);
        logStatus('SUCCESS', 'Session activated from mirror');
    }
    
    return true;
}

async function serviceInitStage() {
    try {
        const cachedSession = loadCachedSession();
        if (cachedSession && !state.sessionActive && !state.sessionMirror.validated) {
            updateSessionMirror(cachedSession, 'cache');
        }
        
        const serviceKey = 'service_init_complete';
        if (!_loggedMessages.has(serviceKey)) {
            _loggedMessages.add(serviceKey);
            logStatus('SUCCESS', 'Service init complete');
        }
        
        return { success: true };
    } catch (error) {
        const failKey = 'service_init_failed';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Service init failed: ${error.message}`);
        }
        return { success: false, fallback: true };
    }
}

function readyStage() {
    state.initialized = true;
    state.readyState = 'ready';
    
    window.addEventListener('message', receiveFromParent);
    state.listeners.add({ type: 'message', handler: receiveFromParent });
    
    const readyKey = 'status_core_ready';
    if (!_loggedMessages.has(readyKey)) {
        _loggedMessages.add(readyKey);
        logStatus('READY', 'Status core ready');
    }
    
    return { success: true, state: state.readyState, guestMode: state.isGuestMode };
}

const initializeCore = createErrorBoundary(async function(options = {}) {
    if (state.initialized) {
        const alreadyKey = 'core_already_initialized';
        if (!_loggedMessages.has(alreadyKey)) {
            _loggedMessages.add(alreadyKey);
            logStatus('INFO', 'Core already initialized');
        }
        return { success: true, state: state.readyState };
    }
    
    const startKey = 'core_init_start';
    if (!_loggedMessages.has(startKey)) {
        _loggedMessages.add(startKey);
        logStatus('INIT', 'Starting core initialization');
    }
    
    try {
        state.readyState = 'preflight';
        await preflightStage();
        
        state.readyState = 'dependencyCheck';
        await dependencyCheckStage();
        
        state.readyState = 'parentDetect';
        await parentDetectStage(options.parentTimeout || 2000);
        
        state.readyState = 'handshake';
        await handshakeStage({ maxRetries: 3 });
        
        state.readyState = 'sessionSync';
        await sessionSyncStage(options.sessionTimeout || 5000);
        
        state.readyState = 'serviceInit';
        await serviceInitStage();
        
        state.readyState = 'ready';
        const result = readyStage();
        
        return result;
        
    } catch (error) {
        const failKey = 'core_init_failed';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Core initialization: ${error.message}`);
        }
        
        if (state.sessionMirror.validated) {
            activateSessionFromMirror();
        } else {
            enableGuestMode();
        }
        
        state.initialized = true;
        state.readyState = 'ready';
        
        return { success: false, state: 'ready', guestMode: state.isGuestMode };
    }
}, 'initializeCore', { success: false, guestMode: true });

const startHandshake = createErrorBoundary(async function(options = { retries: 3 }) {
    return handshakeStage({ maxRetries: options.retries });
}, 'startHandshake', { success: false });

const requestSession = createErrorBoundary(async function(options = { timeout: 5000 }) {
    return sessionSyncStage(options.timeout);
}, 'requestSession', { guestMode: true });

function enableGuestMode() {
    if (state.isGuestMode) return;
    
    state.isGuestMode = true;
    state.sessionActive = false;
    state.permissionsGranted = ['guest', 'view_statuses'];
    state.sessionData = {
        user: { id: 'guest', displayName: 'Guest', isGuest: true },
        permissions: ['guest', 'view_statuses'],
        guestMode: true
    };
    state.user = state.sessionData.user;
    state.token = null;
    
    // Update mirror but mark as not validated
    state.sessionMirror = {
        ...state.sessionMirror,
        validated: false,
        guestMode: true
    };
    
    const guestKey = 'guest_mode_enabled';
    if (!_loggedMessages.has(guestKey)) {
        _loggedMessages.add(guestKey);
        logStatus('INFO', 'Guest mode enabled');
    }
    
    // Dispatch event for UI
    document.dispatchEvent(new CustomEvent('guestModeEnabled', {
        detail: { timestamp: Date.now() }
    }));
}

function loadCachedSession() {
    try {
        const userData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER);
        const token = getUnifiedToken();
        const refreshToken = SafeStorage.getJSON('REFRESH_TOKEN');
        
        if (userData && token) {
            const user = userData;
            if (user && user.id) {
                const cacheKey = 'cached_session_loaded';
                if (!_loggedMessages.has(cacheKey)) {
                    _loggedMessages.add(cacheKey);
                    logStatus('INFO', 'Loaded cached session');
                }
                return { 
                    user, 
                    token, 
                    refreshToken,
                    permissions: ['view_statuses'],
                    capabilities: []
                };
            }
        }
    } catch (error) {
        debugError('Failed to load cached session:', error);
    }
    return null;
}

// =============================================
// SHUTDOWN & RESOURCE MANAGEMENT (PRESERVED)
// =============================================
const shutdownCore = createErrorBoundary(async function() {
    if (state.shutdownInProgress) return;
    
    state.shutdownInProgress = true;
    
    const shutdownKey = 'shutdown_start';
    if (!_loggedMessages.has(shutdownKey)) {
        _loggedMessages.add(shutdownKey);
        logStatus('INFO', 'Shutting down core');
    }
    
    try {
        // Clear intervals
        state.intervals.forEach(clearInterval);
        state.intervals.clear();
        
        // Clear timeouts
        state.timeouts.forEach(clearTimeout);
        state.timeouts.clear();
        
        // Clear retry timers
        state.retryTimers.forEach((timer) => clearTimeout(timer));
        state.retryTimers.clear();
        
        // Clear event listeners
        state.listeners.forEach(({ type, handler }) => {
            try {
                window.removeEventListener(type, handler);
            } catch (e) {}
        });
        state.listeners.clear();
        
        // Clear pending ACKs
        state.pendingAcks.forEach((handler) => {
            clearTimeout(handler.timer);
        });
        state.pendingAcks.clear();
        
        // Clear queues
        state.pendingRequests.clear();
        state.messageCache.clear();
        state.retryQueue = [];
        
        // Clear message handlers
        messageHandlers.clear();
        
        // Notify parent
        if (state.parentDetected) {
            ParentCommunication.sendAction('STATUS_SHUTDOWN', {
                metrics: state.metrics
            });
        }
        
        const completeKey = 'shutdown_complete';
        if (!_loggedMessages.has(completeKey)) {
            _loggedMessages.add(completeKey);
            logStatus('SUCCESS', 'Core shutdown complete');
        }
        
    } catch (error) {
        const failKey = 'shutdown_error';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Shutdown error: ${error.message}`);
        }
    } finally {
        state.shutdownInProgress = false;
    }
}, 'shutdownCore', null);

// =============================================
// MESSAGE HANDLER REGISTRATION (PRESERVED)
// =============================================
addMessageHandler('ACK', (message) => {});
addMessageHandler('STATUS', (message) => {
    document.dispatchEvent(new CustomEvent('statusUpdate', {
        detail: message.payload
    }));
});
addMessageHandler('ERROR', (message) => {
    const errorKey = `parent_error_${message.payload?.error || 'unknown'}`;
    if (!_loggedMessages.has(errorKey)) {
        _loggedMessages.add(errorKey);
        logStatus('FAILED', `Error from parent: ${message.payload?.error || 'Unknown error'}`);
    }
});
addMessageHandler('DATA', (message) => {
    document.dispatchEvent(new CustomEvent('coreData', {
        detail: message.payload
    }));
});

// Handshake response handler
addMessageHandler('HANDSHAKE_RESPONSE', (message) => {
    HandshakeClient.handleResponse(message);
});

// Session handlers
addMessageHandler('SESSION', (message) => {
    HandshakeClient.handleSessionInit(message);
});
addMessageHandler('SESSION_DATA', (message) => {
    HandshakeClient.handleSessionInit(message);
});
addMessageHandler('SESSION_UPDATE', (message) => {
    const payload = message.payload || message.data || {};
    updateSessionMirror(payload, 'session_update');
});
addMessageHandler('SESSION_ACTIVE', (message) => {
    const payload = message.payload || message.data || {};
    updateSessionMirror(payload, 'session_active');
});
addMessageHandler('AUTH_VALIDATED', (message) => {
    const payload = message.payload || message.data || {};
    if (payload.success) {
        if (typeof isTokenReady !== 'undefined') {
            isTokenReady = true;
            if (typeof triggerTokenReadyCallbacks !== 'undefined') {
                triggerTokenReadyCallbacks();
            }
        }
        const authKey = 'auth_validated';
        if (!_loggedMessages.has(authKey)) {
            _loggedMessages.add(authKey);
            logStatus('SUCCESS', 'Auth validated');
        }
    }
});

// Parent ready handler
addMessageHandler('PARENT_READY', (message) => {
    ParentCommunication.parentReadyReceived = true;
    if (_parentReadyResolver) {
        _parentReadyResolver(message);
    }
});

// Module registered handler
addMessageHandler('MODULE_REGISTERED', (message) => {
    if (message.payload?.moduleName === MODULE_NAME) {
        ParentCommunication.moduleRegistered = true;
    }
});

// Heartbeat handler
addMessageHandler('HEARTBEAT', (message) => {
    ParentCommunication.sendHeartbeatAck(message.messageId);
});

// Logout handler
addMessageHandler('LOGOUT', (message) => {
    handleLogout(message.payload);
});

// API response handlers
addMessageHandler('API_RESPONSE', (message) => {
    handleApiResponse(message.payload);
});
addMessageHandler('API_ERROR', (message) => {
    handleApiError(message.payload);
});

// Enhanced handlers
addMessageHandler('PONG', (message) => {
    state.lastHeartbeatReceived = Date.now();
    state.heartbeatFailures = 0;
});

// PAGE_ACTIVATED handler
addMessageHandler('PAGE_ACTIVATED', (message) => {
    state.pageActivated = true;
    
    const pageKey = 'page_activated_handler';
    if (!_loggedMessages.has(pageKey)) {
        _loggedMessages.add(pageKey);
        logStatus('INFO', 'Page activated');
    }
    
    // Trigger data refresh when page becomes active
    if (typeof loadFreshDataInBackground !== 'undefined' && isLifecycleState(LifecycleState.ACTIVE)) {
        setTimeout(() => {
            loadFreshDataInBackground();
        }, 100);
    }
    
    // Dispatch event for UI to refresh
    document.dispatchEvent(new CustomEvent('pageActivated', {
        detail: { timestamp: Date.now() }
    }));
});

addMessageHandler('NAVIGATE', (message) => {
    if (message.payload && message.payload.path) {
        // Handle navigation if needed
        document.dispatchEvent(new CustomEvent('navigate', {
            detail: message.payload
        }));
    }
});

addMessageHandler('CAPABILITY_RESPONSE', (message) => {
    if (message.payload && Array.isArray(message.payload.capabilities)) {
        message.payload.capabilities.forEach(cap => {
            state.parentCapabilities.add(cap);
            IframeAuthority.parentCapabilities.add(cap);
        });
    }
});

addMessageHandler('TOKEN_REFRESH_RESPONSE', (message) => {
    if (message.payload && message.payload.token) {
        state.token = message.payload.token;
        SafeStorage.set(UNIFIED_TOKEN_KEY, message.payload.token);
        
        if (message.payload.refreshToken) {
            state.sessionMirror.refreshToken = message.payload.refreshToken;
        }
    }
});

addMessageHandler('ORIGIN_VALIDATION_RESPONSE', (message) => {
    if (message.payload && message.payload.valid) {
        state.securityContext.originValidated = true;
    }
});

addMessageHandler('CONFIG_RESPONSE', (message) => {
    if (message.payload && message.payload.config) {
        applyParentConfig(message.payload.config);
    }
});

addMessageHandler('RECOVERY_RESPONSE', (message) => {
    if (message.payload && message.payload.success) {
        state.metrics.successfulRecoveries++;
    }
});

addMessageHandler('IFRAME_REGISTERED', (message) => {
    if (message.payload && message.payload.module === 'status') {
        // Acknowledgment received
    }
});

// =============================================
// FEATURE ISOLATION SYSTEM (PRESERVED)
// =============================================
function registerFeature(name, implementation) {
    try {
        if (state.features.has(name)) {
            return false;
        }
        
        const wrappedImplementation = createErrorBoundary(implementation, `Feature:${name}`, null);
        state.features.set(name, wrappedImplementation);
        return true;
    } catch (e) {
        const regKey = `feature_reg_fail_${name}`;
        if (!_loggedMessages.has(regKey)) {
            _loggedMessages.add(regKey);
            logStatus('FAILED', `Feature registration failed: ${name} - ${e.message}`);
        }
        return false;
    }
}

function executeFeature(name, ...args) {
    try {
        if (isCircuitOpen(`feature:${name}`)) {
            return null;
        }
        
        if (state.disabledFeatures.has(name)) {
            return null;
        }
        
        const feature = state.features.get(name);
        if (!feature) {
            return null;
        }
        
        return feature(...args);
    } catch (error) {
        const execKey = `feature_exec_fail_${name}`;
        if (!_loggedMessages.has(execKey)) {
            _loggedMessages.add(execKey);
            logStatus('FAILED', `Feature execution failed: ${name} - ${error.message}`);
        }
        state.disabledFeatures.add(name);
        return null;
    }
}

// =============================================
// SESSION & TOKEN MANAGEMENT (PRESERVED)
// =============================================
function getSession() {
    if (state.sessionMirror.validated) {
        return {
            active: true,
            user: state.sessionMirror.user,
            token: state.sessionMirror.token,
            expiry: state.sessionMirror.expiry,
            guestMode: false,
            permissions: [...state.sessionMirror.permissions],
            validated: true,
            source: state.sessionMirror.source,
            capabilities: state.sessionMirror.capabilities ? [...state.sessionMirror.capabilities] : []
        };
    }
    
    return {
        active: state.sessionActive,
        user: state.user,
        token: state.token,
        expiry: state.sessionExpiry,
        guestMode: state.isGuestMode,
        permissions: [...state.permissionsGranted],
        validated: state.sessionMirror.validated,
        capabilities: []
    };
}

function isSessionValid() {
    if (state.isGuestMode) return true;
    if (state.sessionMirror.validated) {
        if (!state.sessionMirror.expiry) return true;
        return new Date() < state.sessionMirror.expiry;
    }
    if (!state.sessionActive || !state.sessionExpiry) return false;
    return new Date() < state.sessionExpiry;
}

// =============================================
// HEALTH METRICS (PRESERVED)
// =============================================
function getHealthMetrics() {
    return {
        ...state.metrics,
        uptime: Date.now() - state.metrics.startTime,
        readyState: state.readyState,
        initialized: state.initialized,
        parentDetected: state.parentDetected,
        handshakeComplete: state.handshakeComplete,
        handshakeState: state.handshakeState,
        sessionActive: state.sessionActive,
        sessionMirrorValid: state.sessionMirror.validated,
        guestMode: state.isGuestMode,
        protocolVersion: state.protocolVersion,
        parentProtocolVersion: state.parentProtocolVersion,
        frameId: state.frameId,
        instanceId: state.instanceId,
        sessionId: state.sessionId,
        circuitBreakers: { ...CIRCUIT_BREAKER.failures },
        disabledFeatures: Array.from(state.disabledFeatures),
        pendingAcks: state.pendingAcks.size,
        pendingRequests: state.pendingRequests.size,
        retryQueue: state.retryQueue.length,
        offlineBuffer: state.offlineBuffer.length,
        features: state.features.size,
        messageCacheSize: state.messageCache.size,
        lastHeartbeat: state.lastHeartbeatSent,
        lastHeartbeatReceived: state.lastHeartbeatReceived,
        heartbeatFailures: state.heartbeatFailures,
        isOnline: state.isOnline,
        offlineModeEnabled: state.offlineModeEnabled,
        parentCapabilities: Array.from(state.parentCapabilities),
        originValidated: state.securityContext.originValidated,
        diagnosticsEnabled: state.diagnosticsEnabled,
        
        // Environment metrics
        environment: IframeEnvironment.type,
        environmentDetails: {
            isLocalDev: IframeEnvironment.isLocalDev,
            isRenderHosted: IframeEnvironment.isRenderHosted,
            isVPNNetwork: IframeEnvironment.isVPNNetwork,
            isProduction: IframeEnvironment.isProduction,
            isSandboxed: IframeEnvironment.isSandboxed,
            latency: IframeEnvironment.latency,
            connectionType: IframeEnvironment.connectionType
        },
        
        // Lifecycle state
        lifecycle: _currentLifecycleState,
        
        // Transport status
        transport: IframeTransport.getStatus(),
        
        // Session client
        sessionClient: {
            sessionValid: SessionClient.sessionValid,
            sessionExpiry: SessionClient.sessionExpiry,
            offlineMode: SessionClient.offlineMode
        },
        
        // Navigation guard
        navigation: NavigationGuard.getState()
    };
}

// =============================================
// PARENT COORDINATION - ENHANCED FOR UI REQUIREMENTS (PRESERVED)
// =============================================
const parentCoordinator = {
    isInitialized: false,
    handshakeComplete: false,
    sessionData: null,
    messageChannel: null,
    handshakeRetries: 0,
    maxHandshakeRetries: 3,
    handshakeInterval: null,
    parentOrigin: null,
    handshakeInProgress: false,
    sessionValid: false,
    handshakeTimeout: null,
    sessionRequestSent: false,
    trustedOrigins: TRUSTED_ORIGINS,
    lastMessageOrigin: null,
    sequenceId: null,
    
    // Enhanced fields
    frameId: state.frameId,
    instanceId: state.instanceId,
    handshakeState: 'idle',
    childReadySent: false,
    parentReadyReceived: false,
    capabilities: new Set()
};

function initializeParentCoordination() {
    if (parentCoordinator.isInitialized) return;
    
    try {
        if (!window.parent || window.parent === window) {
            handleParentUnavailable();
            return;
        }
        
        parentCoordinator.trustedOrigins.add(window.location.origin);
        parentCoordinator.parentOrigin = window.location.origin;
        
        window.removeEventListener('message', handleEnhancedParentMessage);
        window.addEventListener('message', handleEnhancedParentMessage);
        parentCoordinator.messageChannel = window;
        parentCoordinator.isInitialized = true;
        
        const initKey = 'parent_coord_init';
        if (!_loggedMessages.has(initKey)) {
            _loggedMessages.add(initKey);
            logStatus('INFO', 'Parent coordination initialized');
        }
        
        // Use deterministic lifecycle instead
        if (isLifecycleState(LifecycleState.READY)) {
            ParentCommunication.sendChildReady();
        }
        
    } catch (error) {
        const failKey = 'parent_coord_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Parent coordination: ${error.message}`);
        }
        handleParentUnavailable();
    }
}

function handleEnhancedParentMessage(event) {
    try {
        parentCoordinator.lastMessageOrigin = event.origin;
        
        // Use origin trust adapter
        if (!OriginTrustAdapter.validateMessageOrigin(event.origin)) {
            return;
        }
        
        const message = event.data;
        
        // Check for duplicates
        if (message.messageId && isDuplicate(message.messageId)) {
            return;
        }
        
        // Validate message schema
        if (!MessageValidator.validate(message).valid) {
            return;
        }
        
        const sanitizedMessage = MessageFirewall.sanitize(message);
        
        const messageKey = `${sanitizedMessage.type}:${sanitizedMessage.messageId || 'no-id'}:${sanitizedMessage.timestamp || Date.now()}`;
        if (state.messageCache.has(messageKey)) return;
        state.messageCache.add(messageKey);
        
        if (state.messageCache.size > 100) {
            const firstKey = state.messageCache.values().next().value;
            state.messageCache.delete(firstKey);
        }
        
        switch (sanitizedMessage.type) {
            case 'SESSION_DATA':
            case 'SESSION':
            case 'SESSION_ACTIVE':
            case 'SESSION_UPDATE':
                handleSecureSessionData(sanitizedMessage);
                break;
            case 'SESSION_SYNC':
                handleSecureSessionData(sanitizedMessage);
                break;
            case 'SESSION_UPDATE':
                handleSessionUpdate(sanitizedMessage.data || sanitizedMessage.payload);
                break;
            case 'LOGOUT':
                handleLogout(sanitizedMessage.data || sanitizedMessage.payload);
                break;
            case 'API_RESPONSE':
                handleApiResponse(sanitizedMessage.data || sanitizedMessage.payload);
                break;
            case 'API_ERROR':
                handleApiError(sanitizedMessage.data || sanitizedMessage.payload);
                break;
            case 'AUTH_VALIDATED':
                handleAuthValidated(sanitizedMessage.data || sanitizedMessage.payload);
                break;
            case 'HANDSHAKE_RESPONSE':
                HandshakeClient.handleResponse(sanitizedMessage);
                break;
            case 'PARENT_READY':
                parentCoordinator.parentReadyReceived = true;
                parentCoordinator.handshakeState = 'parent_ready_received';
                ParentCommunication.parentReadyReceived = true;
                if (_parentReadyResolver) {
                    _parentReadyResolver(sanitizedMessage);
                }
                break;
            case 'MODULE_REGISTERED':
                ParentCommunication.moduleRegistered = true;
                break;
            case 'HEARTBEAT':
                ParentCommunication.sendHeartbeatAck(sanitizedMessage.messageId);
                break;
            case 'PONG':
                state.lastHeartbeatReceived = Date.now();
                state.heartbeatFailures = 0;
                break;
            case 'PAGE_ACTIVATED':
                parentCoordinator.handshakeState = 'active';
                // Trigger data refresh
                if (typeof loadFreshDataInBackground !== 'undefined' && isLifecycleState(LifecycleState.ACTIVE)) {
                    setTimeout(() => {
                        loadFreshDataInBackground();
                    }, 100);
                }
                break;
                
            // NEW: Handle status-specific messages from parent
            case 'STATUS_POSTED':
            case 'STATUS_VIEWED':
            case 'STATUS_REACTED':
            case 'REACTION_REMOVED':
            case 'REACTION_CHANGED':
            case 'STATUS_EXPIRED':
            case 'STATUSES_UPDATE':
                // These are already handled in receiveFromParent
                // But we also need to dispatch events for UI
                document.dispatchEvent(new CustomEvent('parentStatusUpdate', {
                    detail: { type: sanitizedMessage.type, payload: sanitizedMessage.payload }
                }));
                break;
        }
    } catch (error) {
        const handlerKey = `enhanced_parent_msg_${error.message}`;
        if (!_loggedMessages.has(handlerKey)) {
            _loggedMessages.add(handlerKey);
            logStatus('FAILED', `handleEnhancedParentMessage: ${error.message}`);
        }
    }
}

function startSecureHandshake() {
    try {
        clearSecureHandshake();
        
        // Send CHILD_READY using deterministic lifecycle
        if (isLifecycleState(LifecycleState.READY)) {
            ParentCommunication.sendChildReady();
        }
        
    } catch (error) {
        const failKey = 'secure_handshake_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Secure handshake: ${error.message}`);
        }
    }
}

function sendChildReadyMessage() {
    if (isLifecycleState(LifecycleState.READY)) {
        ParentCommunication.sendChildReady();
    }
}

function requestSessionFromParent() {
    // No longer needed - session sync handled by parent
    debugLog('Session request disabled - waiting for parent');
}

function handleSecureSessionData(message) {
    try {
        if (message.source !== 'parent' && message.source !== 'PARENT') return;
        
        const sessionData = message.data || message.payload;
        
        if (!sessionData) {
            return;
        }
        
        const updated = updateSessionMirror(sessionData, 'secure_handshake');
        
        if (updated) {
            parentCoordinator.sessionValid = true;
            parentCoordinator.handshakeComplete = true;
            parentCoordinator.handshakeState = 'active';
            parentCoordinator.handshakeInProgress = false;
            clearTimeout(parentCoordinator.handshakeTimeout);
            parentCoordinator.sessionData = sessionData;
            
            ParentCommunication.handleSessionSync(sessionData);
            
            const dataKey = 'secure_session_data';
            if (!_loggedMessages.has(dataKey)) {
                _loggedMessages.add(dataKey);
                logStatus('SUCCESS', 'Secure session data received');
            }
            
            bindUIAfterSession();
            
            sendSecureResponseToParent('AUTH_VALIDATED', {
                success: true,
                module: MODULE_NAME,
                frameId: state.frameId
            });
            
            startBackgroundInitializationWithSession();
        } else {
            parentCoordinator.handshakeInProgress = false;
            clearTimeout(parentCoordinator.handshakeTimeout);
        }
        
    } catch (error) {
        const failKey = 'secure_session_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `handleSecureSessionData: ${error.message}`);
        }
        parentCoordinator.handshakeInProgress = false;
        clearTimeout(parentCoordinator.handshakeTimeout);
    }
}

function bindUIAfterSession() {
    try {
        if (typeof window.initializeStatusUI === 'function') {
            window.initializeStatusUI();
        }
        updateUIBasedOnAuth();
    } catch (error) {
        const bindKey = 'ui_bind_fail';
        if (!_loggedMessages.has(bindKey)) {
            _loggedMessages.add(bindKey);
            logStatus('FAILED', `bindUIAfterSession: ${error.message}`);
        }
    }
}

function updateUIBasedOnAuth() {
    try {
        document.dispatchEvent(new CustomEvent('sessionReady', {
            detail: { user: currentUser }
        }));
    } catch (error) {
        const uiKey = 'ui_auth_fail';
        if (!_loggedMessages.has(uiKey)) {
            _loggedMessages.add(uiKey);
            logStatus('FAILED', `updateUIBasedOnAuth: ${error.message}`);
        }
    }
}

function sendSecureResponseToParent(type, data = {}) {
    try {
        if (!window.parent || window.parent === window) return;
        
        const message = MessageValidator.createMessage(type, {
            ...data,
            source: MODULE_NAME,
            timestamp: Date.now(),
            frameId: state.frameId
        });
        
        window.parent.postMessage(message, '*');
        
    } catch (error) {
        const sendKey = 'secure_response_fail';
        if (!_loggedMessages.has(sendKey)) {
            _loggedMessages.add(sendKey);
            logStatus('FAILED', `sendSecureResponseToParent: ${error.message}`);
        }
    }
}

function handleSessionFailed() {
    parentCoordinator.handshakeInProgress = false;
    parentCoordinator.handshakeComplete = false;
    parentCoordinator.handshakeState = 'failed';
    
    setLifecycleState(LifecycleState.WAIT_PARENT);
    
    const failKey = 'session_failed';
    if (!_loggedMessages.has(failKey)) {
        _loggedMessages.add(failKey);
        logStatus('WARNING', 'Session failed');
    }
    
    if (state.sessionMirror.validated) {
        activateSessionFromMirror();
    } else {
        loadCachedDataInstantly();
        enableGuestMode();
    }
    
    initializeUIWithCachedData();
}

function clearSecureHandshake() {
    try {
        if (parentCoordinator.handshakeTimeout) {
            clearTimeout(parentCoordinator.handshakeTimeout);
            parentCoordinator.handshakeTimeout = null;
        }
        parentCoordinator.handshakeInProgress = false;
        parentCoordinator.sessionValid = false;
        parentCoordinator.sessionRequestSent = false;
        parentCoordinator.handshakeRetries = 0;
    } catch (error) {
        const clearKey = 'clear_handshake_fail';
        if (!_loggedMessages.has(clearKey)) {
            _loggedMessages.add(clearKey);
            logStatus('FAILED', `clearSecureHandshake: ${error.message}`);
        }
    }
}

function handleSessionData(sessionData) {
    try {
        if (!validateSessionData(sessionData)) {
            sendToParent('ERROR', {
                error: 'INVALID_SESSION_SCHEMA',
                message: 'Session data validation failed'
            });
            return;
        }
        
        updateSessionMirror(sessionData, 'session_data');
        
        parentCoordinator.sessionData = sessionData;
        parentCoordinator.handshakeComplete = true;
        parentCoordinator.handshakeState = 'active';
        
        ParentCommunication.handleSessionSync(sessionData);
        
        if (parentCoordinator.handshakeInterval) {
            clearInterval(parentCoordinator.handshakeInterval);
            parentCoordinator.handshakeInterval = null;
        }
        
        const dataKey = 'session_data_received';
        if (!_loggedMessages.has(dataKey)) {
            _loggedMessages.add(dataKey);
            logStatus('SUCCESS', 'Session data received');
        }
        
        sendToParent('AUTH_VALIDATED', {
            module: MODULE_NAME,
            success: true,
            frameId: state.frameId
        });
        
        startBackgroundInitializationWithSession();
        
    } catch (error) {
        const failKey = 'session_data_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `handleSessionData: ${error.message}`);
        }
        sendToParent('ERROR', {
            error: 'SESSION_PROCESSING_ERROR',
            message: error.message
        });
    }
}

function validateSessionData(sessionData) {
    try {
        if (!sessionData || typeof sessionData !== 'object') return false;
        
        if (sessionData.token && typeof sessionData.token !== 'string') return false;
        if (sessionData.user && (!sessionData.user.id || !sessionData.user.displayName)) return false;
        
        return true;
    } catch (error) {
        return false;
    }
}

function handleSessionUpdate(updateData) {
    try {
        if (!updateData) return;
        
        updateSessionMirror(updateData, 'session_update');
        
    } catch (error) {
        const updateKey = 'session_update_fail';
        if (!_loggedMessages.has(updateKey)) {
            _loggedMessages.add(updateKey);
            logStatus('FAILED', `handleSessionUpdate: ${error.message}`);
        }
    }
}

function handleLogout(logoutData) {
    try {
        parentCoordinator.sessionData = null;
        parentCoordinator.handshakeComplete = false;
        parentCoordinator.sessionValid = false;
        parentCoordinator.handshakeState = 'idle';
        
        resetLifecycleState();
        
        state.sessionMirror = {
            token: null,
            user: null,
            expiry: null,
            permissions: [],
            timestamp: 0,
            messageId: null,
            validated: false,
            source: null,
            refreshToken: null,
            lastRefresh: null,
            refreshInProgress: false,
            capabilities: []
        };
        
        if (typeof currentUser !== 'undefined') currentUser = null;
        if (typeof userData !== 'undefined') userData = null;
        
        SafeStorage.remove(LOCAL_STORAGE_KEYS.USER);
        SafeStorage.remove(UNIFIED_TOKEN_KEY);
        SafeStorage.remove('REFRESH_TOKEN');
        
        if (typeof isTokenReady !== 'undefined') isTokenReady = false;
        state.sessionActive = false;
        state.user = null;
        state.token = null;
        enableGuestMode();
        
        const logoutKey = 'logout_handled';
        if (!_loggedMessages.has(logoutKey)) {
            _loggedMessages.add(logoutKey);
            logStatus('INFO', 'Logout handled');
        }
        
        ParentCommunication.sendAction('CHILD_LOADED', {
            module: MODULE_NAME,
            loggedOut: true
        });
        
    } catch (error) {
        const failKey = 'logout_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `handleLogout: ${error.message}`);
        }
    }
}

function handleParentUnavailable() {
    loadCachedDataInstantly();
    
    if (state.sessionMirror.validated) {
        activateSessionFromMirror();
    } else {
        enableGuestMode();
    }
    
    state.offlineModeEnabled = true;
    
    const unavailKey = 'parent_unavailable';
    if (!_loggedMessages.has(unavailKey)) {
        _loggedMessages.add(unavailKey);
        logStatus('WARNING', 'Parent unavailable');
    }
    
    setLifecycleState(LifecycleState.WAIT_PARENT);
}

function startBackgroundInitializationWithSession() {
    if (typeof isBackgroundInitialized !== 'undefined' && isBackgroundInitialized) return;
    
    try {
        setTimeout(async () => {
            try {
                if (typeof loadFreshDataInBackground !== 'undefined' && isLifecycleState(LifecycleState.ACTIVE)) {
                    await loadFreshDataInBackground();
                }
                
                if (typeof isBackgroundInitialized !== 'undefined') {
                    isBackgroundInitialized = true;
                }
                
                if (parentCoordinator.handshakeComplete) {
                    ParentCommunication.sendAction('UI_READY', {
                        module: MODULE_NAME
                    });
                }
                
                const bgKey = 'background_init_complete';
                if (!_loggedMessages.has(bgKey)) {
                    _loggedMessages.add(bgKey);
                    logStatus('SUCCESS', 'Background initialization complete');
                }
            } catch (error) {
                const bgFailKey = 'background_init_fail';
                if (!_loggedMessages.has(bgFailKey)) {
                    _loggedMessages.add(bgFailKey);
                    logStatus('FAILED', `startBackgroundInitialization: ${error.message}`);
                }
            }
        }, 1000);
    } catch (error) {
        const bgSetupKey = 'background_init_setup_fail';
        if (!_loggedMessages.has(bgSetupKey)) {
            _loggedMessages.add(bgSetupKey);
            logStatus('FAILED', `startBackgroundInitialization: ${error.message}`);
        }
    }
}

async function makeParentApiRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const responseHandler = (event) => {
                try {
                    if (!OriginTrustAdapter.validateMessageOrigin(event.origin)) return;
                    
                    const message = event.data;
                    if (!message || !message.type || !message.payload || message.payload.requestId !== requestId) return;
                    
                    if (message.type === 'API_RESPONSE') {
                        window.removeEventListener('message', responseHandler);
                        resolve(message.payload.response || message.payload.data);
                    } else if (message.type === 'API_ERROR') {
                        window.removeEventListener('message', responseHandler);
                        reject(new Error(message.payload.error || 'API Error'));
                    }
                } catch (error) {
                    window.removeEventListener('message', responseHandler);
                    reject(error);
                }
            };
            
            window.addEventListener('message', responseHandler);
            
            const message = MessageValidator.createMessage('API_REQUEST', {
                requestId,
                endpoint,
                options: {
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.body,
                    credentials: 'include'
                },
                timestamp: Date.now(),
                frameId: state.frameId
            });
            
            window.parent.postMessage(message, '*');
            
            const reqKey = `api_req_${endpoint}`;
            if (!_loggedMessages.has(reqKey)) {
                _loggedMessages.add(reqKey);
                logStatus('SENDING', `API request: ${endpoint}`);
            }
            
            const timeoutMs = IframeEnvironment.isVPNNetwork ? 60000 : 30000;
            
            const timer = setTimeout(() => {
                window.removeEventListener('message', responseHandler);
                reject(new Error('Request timeout'));
            }, timeoutMs);
            
            state.timeouts.add(timer);
            
        } catch (error) {
            reject(error);
        }
    });
}

function handleApiResponse(responseData) {
    document.dispatchEvent(new CustomEvent('apiResponse', {
        detail: responseData
    }));
}

function handleApiError(errorData) {
    const errorKey = `api_error_${errorData.error || 'unknown'}`;
    if (!_loggedMessages.has(errorKey)) {
        _loggedMessages.add(errorKey);
        logStatus('FAILED', `API Error: ${errorData.error || 'Unknown error'}`);
    }
}

function handleAuthValidated(data) {
    try {
        if (data.success) {
            if (typeof isTokenReady !== 'undefined') {
                isTokenReady = true;
                if (typeof triggerTokenReadyCallbacks !== 'undefined') {
                    triggerTokenReadyCallbacks();
                }
            }
            const authKey = 'auth_validated_handler';
            if (!_loggedMessages.has(authKey)) {
                _loggedMessages.add(authKey);
                logStatus('SUCCESS', 'Auth validated');
            }
        }
    } catch (error) {
        const failKey = 'auth_validated_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `handleAuthValidated: ${error.message}`);
        }
    }
}

// =============================================
// CENTRALIZED TOKEN ACCESS SYSTEM (PRESERVED)
// =============================================
let isTokenReady = false;
let tokenReadyCallbacks = [];
let pendingApiRequests = [];
let apiCheckInterval = null;
let apiReadyReceived = false;
let authValidated = false;
let authChecked = false;

const UNIFIED_TOKEN_KEY = 'USER_TOKEN';

function waitForTokenReady() {
    return new Promise((resolve) => {
        try {
            if (isTokenReady) {
                resolve(true);
                return;
            }
            
            if (state.sessionMirror.validated && state.sessionMirror.token) {
                isTokenReady = true;
                resolve(true);
                triggerTokenReadyCallbacks();
                return;
            }
            
            if (parentCoordinator.handshakeComplete && parentCoordinator.sessionData) {
                isTokenReady = true;
                resolve(true);
                triggerTokenReadyCallbacks();
                return;
            }
            
            const checkToken = () => {
                try {
                    const token = getUnifiedToken();
                    if (token) {
                        isTokenReady = true;
                        resolve(true);
                        triggerTokenReadyCallbacks();
                        return;
                    }
                    setTimeout(checkToken, 100);
                } catch (error) {
                    resolve(false);
                }
            };
            
            checkToken();
        } catch (error) {
            resolve(false);
        }
    });
}

function onTokenReady(callback) {
    try {
        if (isTokenReady) {
            callback();
        } else {
            tokenReadyCallbacks.push(callback);
        }
    } catch (error) {
        const readyKey = 'token_ready_callback_fail';
        if (!_loggedMessages.has(readyKey)) {
            _loggedMessages.add(readyKey);
            logStatus('FAILED', `onTokenReady: ${error.message}`);
        }
    }
}

function triggerTokenReadyCallbacks() {
    try {
        while (tokenReadyCallbacks.length > 0) {
            const callback = tokenReadyCallbacks.shift();
            try {
                callback();
            } catch (error) {
                const cbKey = 'token_callback_fail';
                if (!_loggedMessages.has(cbKey)) {
                    _loggedMessages.add(cbKey);
                    logStatus('FAILED', `triggerTokenReadyCallbacks: ${error.message}`);
                }
            }
        }
    } catch (error) {
        const triggerKey = 'token_trigger_fail';
        if (!_loggedMessages.has(triggerKey)) {
            _loggedMessages.add(triggerKey);
            logStatus('FAILED', `triggerTokenReadyCallbacks: ${error.message}`);
        }
    }
}

function getUnifiedToken() {
    try {
        if (state.sessionMirror.validated && state.sessionMirror.token) {
            return state.sessionMirror.token;
        }
        
        if (parentCoordinator.handshakeComplete && parentCoordinator.sessionData && parentCoordinator.sessionData.token) {
            return parentCoordinator.sessionData.token;
        }
        
        if (state.token) return state.token;
        
        try {
            if (typeof window.getUserToken === 'function') {
                const token = window.getUserToken();
                if (token && typeof token === 'string' && token.length > 10) return token;
            }
        } catch (error) {}
        
        try {
            const token = SafeStorage.get(UNIFIED_TOKEN_KEY);
            if (token && typeof token === 'string' && token.length > 10 && token !== 'undefined' && token !== 'null') {
                if (token.split('.').length === 3) return token;
            }
        } catch (error) {}
        
        const legacyToken = migrateLegacyTokens();
        if (legacyToken) return legacyToken;
        
        return null;
    } catch (error) {
        return null;
    }
}

function migrateLegacyTokens() {
    try {
        const legacyKeys = [
            'knecta_access_token',
            'accessToken',
            'moodchat_token',
            'auth_token',
            'knecta_token'
        ];
        
        for (const key of legacyKeys) {
            try {
                const token = SafeStorage.get(key);
                if (token && typeof token === 'string' && token.length > 10 && token !== 'undefined' && token !== 'null') {
                    if (token.split('.').length === 3) {
                        SafeStorage.set(UNIFIED_TOKEN_KEY, token);
                        return token;
                    }
                }
            } catch (error) {}
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

function isAuthenticated() {
    try {
        if (state.sessionMirror.validated && state.sessionMirror.token && state.sessionMirror.user) return true;
        if (parentCoordinator.handshakeComplete && parentCoordinator.sessionData) return true;
        if (state.sessionActive && !state.isGuestMode) return true;
        return getUnifiedToken() !== null;
    } catch (error) {
        return false;
    }
}

async function queueApiRequest(requestFunction) {
    if (isTokenReady) return requestFunction();
    
    return new Promise((resolve, reject) => {
        try {
            pendingApiRequests.push({ requestFunction, resolve, reject });
            if (!apiCheckInterval) startTokenReadinessCheck();
        } catch (error) {
            reject(error);
        }
    });
}

function processPendingApiRequests() {
    try {
        while (pendingApiRequests.length > 0) {
            const { requestFunction, resolve, reject } = pendingApiRequests.shift();
            try {
                requestFunction().then(resolve).catch(reject);
            } catch (error) {
                reject(error);
            }
        }
    } catch (error) {
        const processKey = 'process_api_fail';
        if (!_loggedMessages.has(processKey)) {
            _loggedMessages.add(processKey);
            logStatus('FAILED', `processPendingApiRequests: ${error.message}`);
        }
    }
}

function startTokenReadinessCheck() {
    try {
        if (apiCheckInterval) clearInterval(apiCheckInterval);
        
        let checkCount = 0;
        const maxChecks = 30;
        
        apiCheckInterval = setInterval(() => {
            try {
                checkCount++;
                
                if (isTokenReady || getUnifiedToken() || parentCoordinator.handshakeComplete || 
                    state.token || state.sessionMirror.validated) {
                    clearInterval(apiCheckInterval);
                    apiCheckInterval = null;
                    isTokenReady = true;
                    processPendingApiRequests();
                    triggerTokenReadyCallbacks();
                } else if (checkCount >= maxChecks) {
                    clearInterval(apiCheckInterval);
                    apiCheckInterval = null;
                }
            } catch (error) {}
        }, 100);
    } catch (error) {
        const startKey = 'token_check_start_fail';
        if (!_loggedMessages.has(startKey)) {
            _loggedMessages.add(startKey);
            logStatus('FAILED', `startTokenReadinessCheck: ${error.message}`);
        }
    }
}

// =============================================
// SECURE API CALL WITH FALLBACK - Using parent proxy (PRESERVED)
// =============================================
const secureApiCall = createErrorBoundary(async function(endpoint, options = {}) {
    if (state.offlineModeEnabled && options.method && options.method !== 'GET') {
        throw new Error('Offline mode');
    }
    
    if (parentCoordinator.handshakeComplete) {
        try {
            return await makeParentApiRequest(endpoint, options);
        } catch (error) {
            // Fall through
        }
    }
    
    const token = getUnifiedToken();
    if (!token) {
        return queueApiRequest(() => secureApiCall(endpoint, options));
    }
    
    try {
        // Use safeFetch with token as fallback
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await safeFetch(endpoint, {
            ...options,
            headers
        });
        
        return response;
    } catch (error) {
        const isAuthError = error.message?.includes('401') || 
                           error.message?.includes('403') ||
                           error.message?.includes('Unauthorized') || 
                           error.message?.includes('Authentication') || 
                           error.message?.includes('Session');
        
        if (isAuthError) {
            state.offlineModeEnabled = true;
            handleAuthError('Authentication failed. Using offline mode.');
            
            // Try to refresh token
            await refreshToken();
        }
        throw error;
    }
}, 'secureApiCall', null);

// =============================================
// GLOBAL STATE VARIABLES (PRESERVED)
// =============================================
let currentUser = null;
let userData = null;

let statuses = [];
let myStatuses = [];
let friendsStatuses = [];
let closeFriendsStatuses = [];
let pinnedStatuses = [];
let mutedStatuses = [];
let microCirclesStatuses = [];
let highlights = [];
let drafts = [];
let scheduledStatuses = [];

let viewedStatuses = new Set();
let mutedUsers = new Set();
let currentViewerStatus = null;
let currentSlideIndex = 0;
let autoAdvanceInterval = null;
let isAutoAdvancePaused = false;
let progressInterval = null;
let currentCategoryFilter = 'all';
let currentIntentFilter = null;
let currentMoodFilter = null;
let isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
let isOfflineMode = false;
let pendingReplies = [];
let pendingReactions = [];
let moodChartData = [];
let streakCount = 0;
let lastPostDate = null;
let activeFilters = new Set();
let selectedDraft = null;
let isBackgroundInitialized = false;

const statusTypes = {
    'text': { name: 'Text Status', icon: 'fas fa-font', color: 'var(--primary-color)' },
    'media': { name: 'Media Status', icon: 'fas fa-image', color: 'var(--success-color)' },
    'poll': { name: 'Poll Status', icon: 'fas fa-poll', color: 'var(--warning-color)' }
};

const statusIntents = {
    'feedback': { name: 'Looking for feedback', icon: 'fas fa-comments', color: 'var(--intent-feedback)' },
    'achievement': { name: 'Sharing achievement', icon: 'fas fa-trophy', color: 'var(--intent-achievement)' },
    'advice': { name: 'Need advice', icon: 'fas fa-hands-helping', color: 'var(--intent-advice)' },
    'chat': { name: 'Available to chat', icon: 'fas fa-comment-dots', color: 'var(--intent-chat)' },
    'venting': { name: 'Just venting', icon: 'fas fa-wind', color: 'var(--intent-venting)' },
    'reflection': { name: 'Personal reflection', icon: 'fas fa-brain', color: 'var(--intent-reflection)' },
    'question': { name: 'Asking a question', icon: 'fas fa-question-circle', color: 'var(--intent-question)' },
    'celebration': { name: 'Celebration', icon: 'fas fa-glass-cheers', color: 'var(--intent-celebration)' }
};

const statusMoods = {
    'happy': { name: 'Happy', emoji: '😊', color: 'var(--mood-happy)' },
    'stressed': { name: 'Stressed', emoji: '😫', color: 'var(--mood-stressed)' },
    'motivated': { name: 'Motivated', emoji: '💪', color: 'var(--mood-motivated)' },
    'lonely': { name: 'Lonely', emoji: '😔', color: 'var(--mood-lonely)' },
    'excited': { name: 'Excited', emoji: '🤩', color: 'var(--mood-excited)' },
    'calm': { name: 'Calm', emoji: '😌', color: 'var(--mood-calm)' },
    'sad': { name: 'Sad', emoji: '😢', color: 'var(--mood-sad)' },
    'angry': { name: 'Angry', emoji: '😠', color: 'var(--mood-angry)' }
};

const statusCategories = {
    'life': { name: 'Life', icon: 'fas fa-heart', color: 'var(--category-life)' },
    'business': { name: 'Business', icon: 'fas fa-briefcase', color: 'var(--category-business)' },
    'study': { name: 'Study', icon: 'fas fa-graduation-cap', color: 'var(--category-study)' },
    'motivation': { name: 'Motivation', icon: 'fas fa-fire', color: 'var(--category-motivation)' },
    'event': { name: 'Event', icon: 'fas fa-calendar-alt', color: 'var(--category-event)' }
};

const actionButtons = {
    'message': { name: 'Message me', icon: 'fas fa-comments', color: 'var(--primary-color)' },
    'join': { name: 'Join discussion', icon: 'fas fa-users', color: 'var(--success-color)' },
    'vote': { name: 'Vote now', icon: 'fas fa-vote-yea', color: 'var(--warning-color)' },
    'book': { name: 'Book a call', icon: 'fas fa-phone', color: 'var(--info-color)' },
    'learn': { name: 'Learn more', icon: 'fas fa-book', color: 'var(--primary-color)' },
    'support': { name: 'Show support', icon: 'fas fa-hands-helping', color: 'var(--success-color)' },
    'collaborate': { name: 'Collaborate', icon: 'fas fa-handshake', color: 'var(--warning-color)' },
    'resource': { name: 'View resource', icon: 'fas fa-external-link-alt', color: 'var(--info-color)' }
};

const privacySettings = {
    'everyone': { name: 'Everyone', description: 'Visible to all Knecta users', icon: 'fas fa-globe' },
    'friends': { name: 'Friends Only', description: 'Visible to your friends only', icon: 'fas fa-user-friends' },
    'close-friends': { name: 'Close Friends', description: 'Visible to close friends only', icon: 'fas fa-heart' },
    'except': { name: 'All Except...', description: 'Hide from specific people', icon: 'fas fa-user-minus' },
    'specific': { name: 'Specific People...', description: 'Share with select individuals', icon: 'fas fa-user-check' },
    'micro-circle': { name: 'Micro Circle', description: 'Share with a specific group', icon: 'fas fa-users' }
};

const durationOptions = {
    '3600': '1 hour',
    '21600': '6 hours',
    '43200': '12 hours',
    '86400': '24 hours',
    '0': 'Permanent'
};

const reportReasons = {
    'spam': 'Spam',
    'inappropriate': 'Inappropriate Content',
    'harassment': 'Harassment',
    'false-info': 'False Information',
    'violence': 'Violence',
    'hate-speech': 'Hate Speech',
    'self-harm': 'Self-Harm',
    'copyright': 'Copyright Violation'
};

const reactions = {
    'like': '👍',
    'love': '❤️',
    'helpful': '💡',
    'inspiring': '✨',
    'funny': '😂',
    'not-useful': '👎'
};

const emojis = ['😊', '😂', '🥰', '😍', '🤩', '😎', '🤔', '😴', '🥳', '😢', '😠', '😱', '👍', '👎', '❤️', '🔥', '💯', '✨', '🎉', '🙏', '🤝', '💪', '👏', '🙌', '🤗', '😇', '🥺', '🤯', '😳', '🤪', '😜', '🤓', '😎', '🥶', '😈', '👻', '💀', '👀', '🦄', '🐶', '🐱', '🦁', '🐯', '🦊', '🐻', '🐼', '🐨', '🐵', '🦉', '🐣', '🦋', '🐝', '🐙', '🦑', '🐋', '🦈', '🐊', '🦒', '🐘', '🦏', '🦘', '🐫', '🦙', '🦌', '🐎', '🐖', '🐑', '🐕', '🐈', '🐇', '🦔', '🐿️', '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌎', '🌍', '🌏', '🪐', '💫', '⭐', '🌟', '✨', '⚡', '☄️', '💥', '🔥', '🌈', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '🌬️', '💨', '💧', '💦', '☔', '☂️', '🌊', '🌫️'];

const backgroundOptions = [
    { id: '1', type: 'solid', color: 'var(--status-bg-1)' },
    { id: '2', type: 'solid', color: 'var(--status-bg-2)' },
    { id: '3', type: 'solid', color: 'var(--status-bg-3)' },
    { id: '4', type: 'solid', color: 'var(--status-bg-4)' },
    { id: '5', type: 'solid', color: 'var(--status-bg-5)' },
    { id: '6', type: 'solid', color: 'var(--status-bg-6)' },
    { id: '7', type: 'solid', color: 'var(--status-bg-7)' },
    { id: '8', type: 'solid', color: 'var(--status-bg-8)' },
    { id: 'gradient-1', type: 'gradient', gradient: 'linear-gradient(45deg, #667eea, #764ba2)' },
    { id: 'gradient-2', type: 'gradient', gradient: 'linear-gradient(45deg, #f6d365, #fda085)' },
    { id: 'gradient-3', type: 'gradient', gradient: 'linear-gradient(45deg, #a8edea, #fed6e3)' },
    { id: 'gradient-4', type: 'gradient', gradient: 'linear-gradient(45deg, #ff6b6b, #ffa726)' }
];

const statusTemplates = {
    'motivation': {
        name: 'Motivation',
        text: 'Today is a new opportunity to be better than yesterday. Keep pushing forward! 💪',
        background: 'gradient-2',
        mood: 'motivated',
        intent: 'reflection'
    },
    'question': {
        name: 'Question',
        text: 'What\'s the best piece of advice you\'ve ever received? 🤔',
        background: '3',
        mood: 'curious',
        intent: 'question'
    },
    'achievement': {
        name: 'Achievement',
        text: 'Just reached a personal milestone! Celebrating small wins along the way. 🎉',
        background: 'gradient-1',
        mood: 'happy',
        intent: 'achievement'
    },
    'reflection': {
        name: 'Reflection',
        text: 'Taking a moment to reflect on what truly matters in life. Peace comes from within. ✨',
        background: '6',
        mood: 'calm',
        intent: 'reflection'
    }
};

const LOCAL_STORAGE_KEYS = {
    USER: 'knecta_current_user',
    USER_TOKEN: 'knecta_user_token',
    STATUSES: 'knecta_statuses_cache',
    MY_STATUSES: 'knecta_my_statuses_cache',
    VIEWED_STATUSES: 'knecta_viewed_statuses',
    MUTED_USERS: 'knecta_muted_users',
    HIGHLIGHTS: 'knecta_status_highlights',
    DRAFTS: 'knecta_status_drafts',
    SCHEDULED: 'knecta_scheduled_statuses',
    PENDING_REPLIES: 'knecta_pending_replies',
    PENDING_REACTIONS: 'knecta_pending_reactions',
    MOOD_DATA: 'knecta_mood_data',
    STREAK: 'knecta_posting_streak',
    LAST_POST_DATE: 'knecta_last_post_date',
    OFFLINE_QUEUE: 'knecta_offline_status_queue',
    LAST_SYNC: 'knecta_status_last_sync'
};

// =============================================
// INSTANT UI RENDERING WITH CACHED DATA (PRESERVED)
// =============================================
function initializeUIWithCachedData() {
    try {
        loadUserFromCache();
        loadCachedDataInstantly();
        
        if (typeof window.initializeStatusUI === 'function') {
            window.initializeStatusUI();
        }
        
        if (parentCoordinator.handshakeComplete) {
            startBackgroundInitializationWithSession();
        }
        
        const uiKey = 'ui_cached_init';
        if (!_loggedMessages.has(uiKey)) {
            _loggedMessages.add(uiKey);
            logStatus('INFO', 'UI initialized with cached data');
        }
        
    } catch (error) {
        const failKey = 'ui_cached_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `initializeUIWithCachedData: ${error.message}`);
        }
    }
}

function loadUserFromCache() {
    try {
        const userData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER);
        if (userData && userData !== 'undefined' && userData !== 'null') {
            if (userData && typeof userData === 'object' && userData.id) {
                currentUser = userData;
                
                const userKey = 'user_cached';
                if (!_loggedMessages.has(userKey)) {
                    _loggedMessages.add(userKey);
                    logStatus('INFO', 'User loaded from cache');
                }
            }
        }
    } catch (error) {}
}

function loadCachedDataInstantly() {
    try {
        const statusesData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.STATUSES);
        if (statusesData) {
            try { statuses = statusesData || []; } catch { statuses = []; }
            
            const statusKey = 'statuses_cached';
            if (!_loggedMessages.has(statusKey)) {
                _loggedMessages.add(statusKey);
                logStatus('INFO', `Loaded ${statuses.length} statuses from cache`);
            }
        }
        
        const myStatusesData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.MY_STATUSES);
        if (myStatusesData) {
            try { myStatuses = myStatusesData || []; } catch { myStatuses = []; }
        }
        
        const viewedStatusesData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.VIEWED_STATUSES);
        if (viewedStatusesData) {
            try { viewedStatuses = new Set(viewedStatusesData || []); } catch { viewedStatuses = new Set(); }
        }
        
        const mutedUsersData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.MUTED_USERS);
        if (mutedUsersData) {
            try { mutedUsers = new Set(mutedUsersData || []); } catch { mutedUsers = new Set(); }
        }
        
        const highlightsData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.HIGHLIGHTS);
        if (highlightsData) {
            try { highlights = highlightsData || []; } catch { highlights = []; }
        }
        
        const draftsData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.DRAFTS);
        if (draftsData) {
            try { drafts = draftsData || []; } catch { drafts = []; }
        }
        
        const scheduledData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.SCHEDULED);
        if (scheduledData) {
            try { scheduledStatuses = scheduledData || []; } catch { scheduledStatuses = []; }
        }
        
        const pendingRepliesData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.PENDING_REPLIES);
        if (pendingRepliesData) {
            try { pendingReplies = pendingRepliesData || []; } catch { pendingReplies = []; }
        }
        
        const pendingReactionsData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS);
        if (pendingReactionsData) {
            try { pendingReactions = pendingReactionsData || []; } catch { pendingReactions = []; }
        }
        
        const moodData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.MOOD_DATA);
        if (moodData) {
            try { moodChartData = moodData || []; } catch { moodChartData = []; }
        }
        
        const streakData = SafeStorage.get(LOCAL_STORAGE_KEYS.STREAK);
        if (streakData) {
            try { streakCount = parseInt(streakData) || 0; } catch { streakCount = 0; }
        }
        
        const lastPostDateData = SafeStorage.get(LOCAL_STORAGE_KEYS.LAST_POST_DATE);
        if (lastPostDateData) {
            try { lastPostDate = new Date(lastPostDateData); } catch { lastPostDate = null; }
        }
        
    } catch (error) {}
}

// =============================================
// BACKGROUND INITIALIZATION (PRESERVED)
// =============================================
async function startBackgroundInitialization() {
    if (isBackgroundInitialized) return;
    
    try {
        onTokenReady(async () => {
            try {
                await loadFreshDataInBackground();
                isBackgroundInitialized = true;
                
                if (parentCoordinator.handshakeComplete) {
                    ParentCommunication.sendAction('UI_READY', {
                        module: MODULE_NAME
                    });
                }
                
                const bgKey = 'background_init_complete';
                if (!_loggedMessages.has(bgKey)) {
                    _loggedMessages.add(bgKey);
                    logStatus('SUCCESS', 'Background initialization complete');
                }
            } catch (error) {}
        });
        
        if (getUnifiedToken() || parentCoordinator.handshakeComplete || state.token || state.sessionMirror.validated) {
            try {
                await loadFreshDataInBackground();
                isBackgroundInitialized = true;
                
                if (parentCoordinator.handshakeComplete) {
                    ParentCommunication.sendAction('UI_READY', {
                        module: MODULE_NAME
                    });
                }
                
                const bgKey = 'background_init_complete';
                if (!_loggedMessages.has(bgKey)) {
                    _loggedMessages.add(bgKey);
                    logStatus('SUCCESS', 'Background initialization complete');
                }
            } catch (error) {}
        }
        
    } catch (error) {}
}

async function loadFreshDataInBackground() {
    try {
        const loadPromises = [];
        loadPromises.push(safeApiOperation(() => loadStatusesInBackground()));
        loadPromises.push(safeApiOperation(() => loadMyStatusesInBackground()));
        loadPromises.push(safeApiOperation(() => loadHighlightsInBackground()));
        loadPromises.push(safeApiOperation(() => loadUserDataInBackground()));
        await Promise.allSettled(loadPromises);
    } catch (error) {}
}

async function safeApiOperation(operation) {
    try {
        if (!isAuthenticated()) throw new Error('Not authenticated');
        return await operation();
    } catch (error) {
        return null;
    }
}

async function loadStatusesInBackground() {
    try {
        const response = await secureApiCall('/api/statuses');
        if (response && response.statuses) {
            statuses = response.statuses;
            statuses = filterStatusesByPrivacy(statuses);
            statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
            
            const loadKey = 'statuses_loaded_bg';
            if (!_loggedMessages.has(loadKey)) {
                _loggedMessages.add(loadKey);
                logStatus('SUCCESS', `Loaded ${statuses.length} statuses`);
            }
        }
    } catch (error) {
        throw error;
    }
}

async function loadMyStatusesInBackground() {
    try {
        const response = await secureApiCall('/api/statuses/my');
        if (response && response.statuses) {
            myStatuses = response.statuses;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
        }
    } catch (error) {
        throw error;
    }
}

async function loadHighlightsInBackground() {
    try {
        const response = await secureApiCall('/api/statuses/highlights');
        if (response && response.highlights) {
            highlights = response.highlights;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.HIGHLIGHTS, highlights);
        }
    } catch (error) {
        throw error;
    }
}

async function loadUserDataInBackground() {
    try {
        const response = await secureApiCall('/api/user/me');
        if (response && response.user) {
            currentUser = response.user;
            userData = response.user;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER, response.user);
            
            const userKey = 'user_data_loaded';
            if (!_loggedMessages.has(userKey)) {
                _loggedMessages.add(userKey);
                logStatus('SUCCESS', 'User data loaded');
            }
        }
    } catch (error) {
        throw error;
    }
}

// =============================================
// BOOTSTRAP APPLICATION (PRESERVED)
// =============================================
async function bootstrapApp() {
    try {
        initializeParentCoordination();
        initializeUIWithCachedData();
        startTokenReadinessCheck();
        
        setTimeout(() => {
            ParentCommunication.sendAction('CHILD_LOADED', {
                module: MODULE_NAME
            });
        }, 500);
        
        const bootKey = 'app_bootstrapped';
        if (!_loggedMessages.has(bootKey)) {
            _loggedMessages.add(bootKey);
            logStatus('SUCCESS', 'App bootstrapped');
        }
        
        return true;
    } catch (error) {
        const failKey = 'bootstrap_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `bootstrapApp: ${error.message}`);
        }
        return false;
    }
}

const bootstrapApplication = bootstrapApp;

// =============================================
// AUTHENTICATION ERROR HANDLING (PRESERVED)
// =============================================
function handleAuthError(message) {
    try {
        if (parentCoordinator.handshakeComplete) {
            ParentCommunication.sendAction('NEEDS_AUTH', {
                module: MODULE_NAME,
                error: message
            });
        }
        
        if (statuses.length === 0 && myStatuses.length === 0) {
            // No action needed
        } else {
            state.offlineModeEnabled = true;
            isOfflineMode = true;
            
            setLifecycleState(LifecycleState.WAIT_PARENT);
        }
        
        const authKey = 'auth_error';
        if (!_loggedMessages.has(authKey)) {
            _loggedMessages.add(authKey);
            logStatus('WARNING', message);
        }
    } catch (error) {}
}

async function initializeStatusSystem() {
    try {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout loading data')), 10000)
        );
        
        await Promise.race([loadInitialData(), timeoutPromise]);
        
    } catch (error) {
        loadCachedDataInstantly();
        if (!state.offlineModeEnabled) state.offlineModeEnabled = true;
        if (!isOfflineMode) isOfflineMode = true;
        
        setLifecycleState(LifecycleState.WAIT_PARENT);
        
        const timeoutKey = 'data_load_timeout';
        if (!_loggedMessages.has(timeoutKey)) {
            _loggedMessages.add(timeoutKey);
            logStatus('WARNING', 'Data load timeout, using cached data');
        }
    }
}

async function loadInitialData() {
    try {
        const loadPromises = [];
        
        loadPromises.push(safeApiOperation(async () => {
            const statusesResponse = await secureApiCall('/api/statuses');
            if (statusesResponse && statusesResponse.statuses) {
                statuses = statusesResponse.statuses;
                statuses = filterStatusesByPrivacy(statuses);
                statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
            }
        }));
        
        loadPromises.push(safeApiOperation(async () => {
            const myStatusesResponse = await secureApiCall('/api/statuses/my');
            if (myStatusesResponse && myStatusesResponse.statuses) {
                myStatuses = myStatusesResponse.statuses;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
            }
        }));
        
        loadPromises.push(safeApiOperation(async () => {
            const highlightsResponse = await secureApiCall('/api/statuses/highlights');
            if (highlightsResponse && highlightsResponse.highlights) {
                highlights = highlightsResponse.highlights;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.HIGHLIGHTS, highlights);
            }
        }));
        
        loadPromises.push(safeApiOperation(async () => {
            const userResponse = await secureApiCall('/api/user/me');
            if (userResponse && userResponse.user) {
                currentUser = userResponse.user;
                userData = userResponse.user;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER, userResponse.user);
            }
        }));
        
        await Promise.allSettled(loadPromises);
        
        const initKey = 'initial_data_loaded';
        if (!_loggedMessages.has(initKey)) {
            _loggedMessages.add(initKey);
            logStatus('SUCCESS', 'Initial data loaded');
        }
    } catch (error) {
        throw error;
    }
}

// =============================================
// CORE STATUS FUNCTIONS (PRESERVED)
// =============================================
function filterStatusesByPrivacy(statuses) {
    try {
        if (!Array.isArray(statuses)) return [];
        
        return statuses.filter(status => {
            if (!status || !status.userId) return false;
            if (mutedUsers.has(status.userId)) return false;
            
            const privacy = status.privacy || 'friends';
            
            switch(privacy) {
                case 'everyone': return true;
                case 'friends': return true;
                case 'close-friends': return false;
                case 'except': return true;
                case 'specific': return false;
                case 'micro-circle': return false;
                default: return true;
            }
        });
    } catch (error) {
        return [];
    }
}

function getStatusPreviewText(status) {
    try {
        if (!status) return 'Status';
        
        if (status.type === 'text') {
            return status.text && status.text.length > 30 ? status.text.substring(0, 30) + '...' : status.text || 'Text status';
        } else if (status.type === 'media') {
            return status.caption ? status.caption.substring(0, 30) + '...' : 'Media status';
        } else if (status.type === 'poll') {
            return status.question ? status.question.substring(0, 30) + '...' : 'Poll status';
        }
        return 'Status';
    } catch (error) {
        return 'Status';
    }
}

function filterStatusesByType(type) {
    try {
        if (!Array.isArray(statuses)) return [];
        
        switch(type) {
            case 'friends':
                return statuses.filter(status => status && (status.privacy === 'friends' || status.privacy === 'everyone'));
            case 'close-friends':
                return statuses.filter(status => status && status.privacy === 'close-friends');
            case 'pinned':
                return statuses.filter(status => status && status.isPinned);
            case 'muted':
                return statuses.filter(status => status && mutedUsers.has(status.userId));
            case 'micro-circle':
                return statuses.filter(status => status && status.privacy === 'micro-circle');
            default:
                return statuses;
        }
    } catch (error) {
        return [];
    }
}

function getEmptyStateMessage() {
    try {
        if (activeFilters.size > 0) {
            return `No statuses match your filters`;
        }
        if (currentIntentFilter) {
            return `No statuses with "${statusIntents[currentIntentFilter]?.name || currentIntentFilter}" intent`;
        }
        if (currentMoodFilter) {
            return `No statuses with "${statusMoods[currentMoodFilter]?.name || currentMoodFilter}" mood`;
        }
        return 'Be the first to post a status!';
    } catch (error) {
        return 'No statuses available';
    }
}

// =============================================
// STATUS ACTIONS - WITH PARENT ROUTING (PRESERVED)
// =============================================
const addReactionToStatus = createErrorBoundary(async function(statusId, reaction) {
    if (!statusId || !reaction) throw new Error('Missing required parameters');
    
    const reactKey = `reaction_add_${statusId}_${reaction}`;
    if (!_loggedMessages.has(reactKey)) {
        _loggedMessages.add(reactKey);
        logStatus('REACTION', `Adding ${reaction} to ${statusId}`);
    }
    
    if (state.offlineModeEnabled) {
        pendingReactions.push({ statusId, reaction, timestamp: new Date().toISOString() });
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, pendingReactions);
        const offlineKey = `reaction_offline_${statusId}_${reaction}`;
        if (!_loggedMessages.has(offlineKey)) {
            _loggedMessages.add(offlineKey);
            logStatus('SUCCESS', `Reaction queued offline: ${reaction}`);
        }
        return { success: true, offline: true };
    }
    
    // Send to parent using action wrapper
    return ParentCommunication.sendAction('ADD_REACTION', { statusId, reaction });
}, 'addReactionToStatus', { success: false });

const removeReactionFromStatus = createErrorBoundary(async function(statusId, reaction) {
    if (!statusId || !reaction) throw new Error('Missing required parameters');
    
    const removeKey = `reaction_remove_${statusId}_${reaction}`;
    if (!_loggedMessages.has(removeKey)) {
        _loggedMessages.add(removeKey);
        logStatus('REACTION', `Removing ${reaction} from ${statusId}`);
    }
    
    if (state.offlineModeEnabled) {
        pendingReactions = pendingReactions.filter(r => !(r.statusId === statusId && r.reaction === reaction));
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, pendingReactions);
        const offlineKey = `reaction_remove_offline_${statusId}`;
        if (!_loggedMessages.has(offlineKey)) {
            _loggedMessages.add(offlineKey);
            logStatus('SUCCESS', `Reaction removal queued offline`);
        }
        return { success: true, offline: true };
    }
    
    return ParentCommunication.sendAction('REMOVE_REACTION', { statusId, reaction });
}, 'removeReactionFromStatus', { success: false });

const changeReaction = createErrorBoundary(async function(statusId, oldEmoji, newEmoji) {
    if (!statusId || !oldEmoji || !newEmoji) throw new Error('Missing required parameters');
    
    const changeKey = `reaction_change_${statusId}_${oldEmoji}_to_${newEmoji}`;
    if (!_loggedMessages.has(changeKey)) {
        _loggedMessages.add(changeKey);
        logStatus('REACTION', `Changing from ${oldEmoji} to ${newEmoji} on ${statusId}`);
    }
    
    if (state.offlineModeEnabled) {
        pendingReactions = pendingReactions.filter(r => !(r.statusId === statusId && r.reaction === oldEmoji));
        pendingReactions.push({ statusId, reaction: newEmoji, timestamp: new Date().toISOString() });
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, pendingReactions);
        const offlineKey = `reaction_change_offline_${statusId}`;
        if (!_loggedMessages.has(offlineKey)) {
            _loggedMessages.add(offlineKey);
            logStatus('SUCCESS', `Reaction change queued offline`);
        }
        return { success: true, offline: true };
    }
    
    return ParentCommunication.sendAction('CHANGE_REACTION', { statusId, oldEmoji, newEmoji });
}, 'changeReaction', { success: false });

const trackStatusView = createErrorBoundary(async function(statusId) {
    if (!statusId) throw new Error('Missing status ID');
    
    if (viewedStatuses.has(statusId)) {
        const viewedKey = `status_already_viewed_${statusId}`;
        if (!_loggedMessages.has(viewedKey)) {
            _loggedMessages.add(viewedKey);
            logStatus('VIEW', `Status ${statusId} already viewed`);
        }
        return { success: true, alreadyViewed: true };
    }
    
    const trackKey = `track_view_${statusId}`;
    if (!_loggedMessages.has(trackKey)) {
        _loggedMessages.add(trackKey);
        logStatus('VIEW', `Tracking view for ${statusId}`);
    }
    
    if (state.offlineModeEnabled) {
        viewedStatuses.add(statusId);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.VIEWED_STATUSES, Array.from(viewedStatuses));
        const offlineKey = `view_offline_${statusId}`;
        if (!_loggedMessages.has(offlineKey)) {
            _loggedMessages.add(offlineKey);
            logStatus('VIEW', `View tracked offline for ${statusId}`);
        }
        return { success: true, offline: true };
    }
    
    viewedStatuses.add(statusId);
    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.VIEWED_STATUSES, Array.from(viewedStatuses));
    
    return ParentCommunication.sendAction('VIEW_STATUS', { statusId });
}, 'trackStatusView', { success: false });

const voteOnPoll = createErrorBoundary(async function(statusId, optionId) {
    if (!statusId || !optionId) throw new Error('Missing required parameters');
    
    const voteKey = `vote_${statusId}_${optionId}`;
    if (!_loggedMessages.has(voteKey)) {
        _loggedMessages.add(voteKey);
        logStatus('SENDING', `Voting on poll ${statusId}, option ${optionId}`);
    }
    
    if (state.offlineModeEnabled) return { success: false, offline: true };
    
    return ParentCommunication.sendAction('VOTE_POLL', { statusId, optionId });
}, 'voteOnPoll', { success: false });

const pinStatus = createErrorBoundary(async function(statusData) {
    if (!statusData || !statusData.id) throw new Error('Invalid status data');
    
    const pinKey = `pin_${statusData.id}`;
    if (!_loggedMessages.has(pinKey)) {
        _loggedMessages.add(pinKey);
        logStatus('SENDING', `Pinning status ${statusData.id}`);
    }
    
    return ParentCommunication.sendAction('PIN_STATUS', { statusId: statusData.id });
}, 'pinStatus', { success: false });

const unpinStatus = createErrorBoundary(async function(statusData) {
    if (!statusData || !statusData.id) throw new Error('Invalid status data');
    
    const unpinKey = `unpin_${statusData.id}`;
    if (!_loggedMessages.has(unpinKey)) {
        _loggedMessages.add(unpinKey);
        logStatus('SENDING', `Unpinning status ${statusData.id}`);
    }
    
    return ParentCommunication.sendAction('UNPIN_STATUS', { statusId: statusData.id });
}, 'unpinStatus', { success: false });

const muteUser = createErrorBoundary(async function(userId) {
    if (!userId) throw new Error('Invalid user ID');
    
    const muteKey = `mute_${userId}`;
    if (!_loggedMessages.has(muteKey)) {
        _loggedMessages.add(muteKey);
        logStatus('SENDING', `Muting user ${userId}`);
    }
    
    mutedUsers.add(userId);
    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MUTED_USERS, Array.from(mutedUsers));
    
    return ParentCommunication.sendAction('MUTE_USER', { userId });
}, 'muteUser', { success: false });

const unmuteUser = createErrorBoundary(async function(userId) {
    if (!userId) throw new Error('Invalid user ID');
    
    const unmuteKey = `unmute_${userId}`;
    if (!_loggedMessages.has(unmuteKey)) {
        _loggedMessages.add(unmuteKey);
        logStatus('SENDING', `Unmuting user ${userId}`);
    }
    
    mutedUsers.delete(userId);
    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MUTED_USERS, Array.from(mutedUsers));
    
    return ParentCommunication.sendAction('UNMUTE_USER', { userId });
}, 'unmuteUser', { success: false });

const postStatus = createErrorBoundary(async function(statusData) {
    if (!statusData) throw new Error('Invalid status data');
    
    const postKey = `post_status_${Date.now()}`;
    if (!_loggedMessages.has(postKey)) {
        _loggedMessages.add(postKey);
        logStatus('POST', 'Posting new status', { type: statusData.type });
    }
    
    const sanitizedData = sanitizeStatusData(statusData);
    
    if (state.offlineModeEnabled) {
        const offlineQueue = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE) || [];
        sanitizedData.id = 'offline_' + Date.now();
        sanitizedData.createdAt = new Date().toISOString();
        sanitizedData.offline = true;
        sanitizedData.expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();
        offlineQueue.push(sanitizedData);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);
        
        statuses.unshift(sanitizedData);
        myStatuses.unshift(sanitizedData);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
        
        lastPostDate = new Date();
        SafeStorage.set(LOCAL_STORAGE_KEYS.LAST_POST_DATE, lastPostDate.toISOString());
        updateStreakCounter();
        
        const offlineKey = 'status_queued_offline';
        if (!_loggedMessages.has(offlineKey)) {
            _loggedMessages.add(offlineKey);
            logStatus('POST', 'Status queued offline');
        }
        
        return { success: true, status: sanitizedData, offline: true };
    }
    
    const messageId = ParentCommunication.sendAction('UPLOAD_STATUS', sanitizedData);
    
    if (messageId) {
        // Optimistic update
        const tempStatus = {
            ...sanitizedData,
            id: `temp_${Date.now()}`,
            createdAt: new Date().toISOString(),
            pending: true
        };
        
        statuses.unshift(tempStatus);
        myStatuses.unshift(tempStatus);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
        
        lastPostDate = new Date();
        SafeStorage.set(LOCAL_STORAGE_KEYS.LAST_POST_DATE, lastPostDate.toISOString());
        updateStreakCounter();
        
        if (sanitizedData.mood) {
            moodChartData.push({
                mood: sanitizedData.mood,
                value: 50 + Math.floor(Math.random() * 30),
                date: new Date().toISOString()
            });
            if (moodChartData.length > 30) moodChartData = moodChartData.slice(-30);
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MOOD_DATA, moodChartData);
        }
        
        DiagnosticsAgent.increment('statusPosts');
        
        return { success: true, status: tempStatus, pending: true };
    }
    
    return { success: false };
}, 'postStatus', { success: false });

function sanitizeStatusData(statusData) {
    try {
        const sanitized = { ...statusData };
        
        if (sanitized.text) sanitized.text = escapeHtml(sanitized.text);
        if (sanitized.caption) sanitized.caption = escapeHtml(sanitized.caption);
        if (sanitized.question) sanitized.question = escapeHtml(sanitized.question);
        
        if (sanitized.privacy && !privacySettings[sanitized.privacy]) sanitized.privacy = 'friends';
        if (sanitized.mood && !statusMoods[sanitized.mood]) sanitized.mood = null;
        if (sanitized.intent && !statusIntents[sanitized.intent]) sanitized.intent = null;
        if (sanitized.category && !statusCategories[sanitized.category]) sanitized.category = null;
        
        validateStatusPayload(sanitized);
        
        return sanitized;
    } catch (error) {
        return statusData;
    }
}

function validateStatusPayload(payload) {
    if (payload.type === 'text') {
        if (!payload.text || typeof payload.text !== 'string' || payload.text.trim().length === 0) {
            throw new Error('Text status requires non-empty text');
        }
        if (payload.text.length > 5000) throw new Error('Text too long (max 5000 characters)');
    }
    
    if (payload.type === 'media') {
        if (!payload.mediaUrls || !Array.isArray(payload.mediaUrls) || payload.mediaUrls.length === 0) {
            throw new Error('Media status requires media URLs');
        }
        if (payload.caption && payload.caption.length > 1000) throw new Error('Caption too long (max 1000 characters)');
    }
    
    if (payload.type === 'poll') {
        if (!payload.question || typeof payload.question !== 'string' || payload.question.trim().length === 0) {
            throw new Error('Poll requires a question');
        }
        if (!payload.options || !Array.isArray(payload.options) || payload.options.length < 2) {
            throw new Error('Poll requires at least 2 options');
        }
        if (payload.options.length > 10) throw new Error('Too many poll options (max 10)');
    }
    
    if (payload.duration && !durationOptions[payload.duration.toString()]) throw new Error('Invalid duration option');
    if (payload.mood && !statusMoods[payload.mood]) throw new Error('Invalid mood');
    if (payload.intent && !statusIntents[payload.intent]) throw new Error('Invalid intent');
    if (payload.category && !statusCategories[payload.category]) throw new Error('Invalid category');
    if (payload.privacy && !privacySettings[payload.privacy]) throw new Error('Invalid privacy setting');
}

function updateStreakCounter() {
    try {
        const today = new Date().toDateString();
        if (lastPostDate && lastPostDate.toDateString() === today) return;
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastPostDate && lastPostDate.toDateString() === yesterday.toDateString()) {
            streakCount++;
        } else if (lastPostDate) {
            streakCount = 1;
        } else {
            streakCount = 1;
        }
        
        SafeStorage.set(LOCAL_STORAGE_KEYS.STREAK, streakCount.toString());
    } catch (error) {}
}

const scheduleStatus = createErrorBoundary(async function(statusData, scheduleTime) {
    if (!statusData || !scheduleTime) throw new Error('Missing required parameters');
    
    const scheduleKey = `schedule_${Date.now()}`;
    if (!_loggedMessages.has(scheduleKey)) {
        _loggedMessages.add(scheduleKey);
        logStatus('SENDING', `Scheduling status for ${scheduleTime}`);
    }
    
    const sanitizedData = sanitizeStatusData(statusData);
    
    const response = await ParentCommunication.sendAction('SCHEDULE_STATUS', {
        ...sanitizedData,
        scheduledFor: scheduleTime
    });
    
    if (response) {
        scheduledStatuses.push({ ...sanitizedData, scheduledFor: scheduleTime });
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SCHEDULED, scheduledStatuses);
        const successKey = 'schedule_success';
        if (!_loggedMessages.has(successKey)) {
            _loggedMessages.add(successKey);
            logStatus('SUCCESS', 'Status scheduled');
        }
    }
    return response;
}, 'scheduleStatus', { success: false });

function saveDraft(statusData) {
    try {
        if (!statusData) throw new Error('Invalid status data');
        
        const sanitizedData = sanitizeStatusData(statusData);
        sanitizedData.id = 'draft_' + Date.now();
        sanitizedData.createdAt = new Date().toISOString();
        sanitizedData.isDraft = true;
        drafts.unshift(sanitizedData);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.DRAFTS, drafts);
        
        const draftKey = 'draft_saved';
        if (!_loggedMessages.has(draftKey)) {
            _loggedMessages.add(draftKey);
            logStatus('SUCCESS', 'Draft saved');
        }
        return { success: true };
    } catch (error) {
        throw error;
    }
}

const reportStatus = createErrorBoundary(async function(statusId, reason, details) {
    if (!statusId || !reason) throw new Error('Missing required parameters');
    
    const reportKey = `report_${statusId}`;
    if (!_loggedMessages.has(reportKey)) {
        _loggedMessages.add(reportKey);
        logStatus('SENDING', `Reporting status ${statusId}`);
    }
    
    const sanitizedDetails = escapeHtml(details || '');
    
    return ParentCommunication.sendAction('REPORT_STATUS', { statusId, reason, details: sanitizedDetails });
}, 'reportStatus', { success: false });

// =============================================
// EXPIRATION MANAGEMENT (PRESERVED)
// =============================================

let expirationCheckInterval = null;

function startExpirationMonitoring() {
    if (expirationCheckInterval) {
        clearInterval(expirationCheckInterval);
    }
    
    const startKey = 'expiration_monitoring_start';
    if (!_loggedMessages.has(startKey)) {
        _loggedMessages.add(startKey);
        logStatus('INFO', 'Starting expiration monitoring');
    }
    
    expirationCheckInterval = setInterval(() => {
        checkAndCleanExpiredStatuses();
    }, 60000);
    
    state.intervals.add(expirationCheckInterval);
}

function stopExpirationMonitoring() {
    if (expirationCheckInterval) {
        clearInterval(expirationCheckInterval);
        expirationCheckInterval = null;
        state.intervals.delete(expirationCheckInterval);
        
        const stopKey = 'expiration_monitoring_stop';
        if (!_loggedMessages.has(stopKey)) {
            _loggedMessages.add(stopKey);
            logStatus('INFO', 'Expiration monitoring stopped');
        }
    }
}

function checkAndCleanExpiredStatuses() {
    const now = Date.now();
    let hasExpired = false;
    let expiredCount = 0;
    
    const initialStatusCount = statuses.length;
    statuses = statuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) {
                hasExpired = true;
                expiredCount++;
                
                const expireKey = `status_expired_${status.id}`;
                if (!_loggedMessages.has(expireKey)) {
                    _loggedMessages.add(expireKey);
                    logStatus('EXPIRE', `Status ${status.id} expired`);
                }
                
                ParentCommunication.sendAction('STATUS_EXPIRED', {
                    statusId: status.id,
                    userId: status.userId
                });
                
                document.dispatchEvent(new CustomEvent('statusExpired', {
                    detail: { statusId: status.id }
                }));
                
                return false;
            }
        }
        return true;
    });
    
    if (initialStatusCount !== statuses.length) {
        const removedKey = `expired_removed_${Date.now()}`;
        if (!_loggedMessages.has(removedKey)) {
            _loggedMessages.add(removedKey);
            logStatus('EXPIRE', `Removed ${initialStatusCount - statuses.length} expired statuses`);
        }
    }
    
    myStatuses = myStatuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) return false;
        }
        return true;
    });
    
    friendsStatuses = friendsStatuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) return false;
        }
        return true;
    });
    
    closeFriendsStatuses = closeFriendsStatuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) return false;
        }
        return true;
    });
    
    pinnedStatuses = pinnedStatuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) return false;
        }
        return true;
    });
    
    mutedStatuses = mutedStatuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) return false;
        }
        return true;
    });
    
    microCirclesStatuses = microCirclesStatuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) return false;
        }
        return true;
    });
    
    if (hasExpired) {
        highlights.forEach(highlight => {
            if (highlight.statusIds) {
                const originalLength = highlight.statusIds.length;
                highlight.statusIds = highlight.statusIds.filter(id => {
                    return statuses.some(s => s.id === id) || myStatuses.some(s => s.id === id);
                });
                if (highlight.statusIds.length !== originalLength) {
                    highlight.count = highlight.statusIds.length;
                }
            }
        });
        
        DiagnosticsAgent.metrics.statusExpired += expiredCount;
        
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.HIGHLIGHTS, highlights);
        
        document.dispatchEvent(new CustomEvent('statusUpdate', {
            detail: { type: 'bulk', statuses: statuses.slice(0, 10) }
        }));
    }
}

// =============================================
// USER STATUS TRACKING (PRESERVED)
// =============================================
let userStatusInterval = null;
let lastActivityTime = Date.now();
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let heartbeatInterval = null;
let isTrackingInitialized = false;
let lastOnlineStatus = typeof navigator !== 'undefined' ? navigator.onLine : true;
let activityThrottleTimer = null;
let activityEventHandlers = [];

function initializeUserStatusTracking() {
    if (isTrackingInitialized) return;
    
    try {
        isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        lastOnlineStatus = isOnline;
        state.isOnline = isOnline;
        
        setupNetworkDetection();
        setupActivityTracking();
        updateUserStatus();
        
        isTrackingInitialized = true;
        
        const trackKey = 'user_tracking_initialized';
        if (!_loggedMessages.has(trackKey)) {
            _loggedMessages.add(trackKey);
            logStatus('SUCCESS', 'User status tracking initialized');
        }
        
    } catch (error) {}
}

function setupNetworkDetection() {
    try {
        if (typeof window === 'undefined') return;
        
        const handleNetworkChange = () => {
            const currentOnline = navigator.onLine;
            if (currentOnline === lastOnlineStatus) return;
            
            lastOnlineStatus = currentOnline;
            state.isOnline = currentOnline;
            
            if (currentOnline) {
                handleOnlineStatus();
            } else {
                handleOfflineStatus();
            }
        };
        
        window.removeEventListener('online', handleNetworkChange);
        window.removeEventListener('offline', handleNetworkChange);
        
        window.addEventListener('online', handleNetworkChange);
        window.addEventListener('offline', handleNetworkChange);
        
        activityEventHandlers.push({ element: window, type: 'online', handler: handleNetworkChange });
        activityEventHandlers.push({ element: window, type: 'offline', handler: handleNetworkChange });
    } catch (error) {}
}

function setupActivityTracking() {
    try {
        if (typeof document === 'undefined') return;
        
        const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
        
        const updateActivity = () => {
            if (activityThrottleTimer) clearTimeout(activityThrottleTimer);
            activityThrottleTimer = setTimeout(() => {
                lastActivityTime = Date.now();
                activityThrottleTimer = null;
            }, 1000);
        };
        
        activityEvents.forEach(eventType => {
            document.removeEventListener(eventType, updateActivity);
        });
        
        activityEvents.forEach(eventType => {
            document.addEventListener(eventType, updateActivity);
            activityEventHandlers.push({ element: document, type: eventType, handler: updateActivity });
        });
    } catch (error) {}
}

function handleOnlineStatus() {
    try {
        if (isOnline) return;
        
        isOnline = true;
        state.isOnline = true;
        
        setTimeout(() => { updateUserStatus(); }, 100);
        
        if (state.offlineModeEnabled) {
            state.offlineModeEnabled = false;
            isOfflineMode = false;
            setTimeout(() => { syncPendingData(); }, 500);
            
            const onlineKey = 'online_status';
            if (!_loggedMessages.has(onlineKey)) {
                _loggedMessages.add(onlineKey);
                logStatus('SUCCESS', 'Online - syncing pending data');
            }
        }
        
        if (!parentCoordinator.handshakeComplete && RecoveryManager.canRecover()) {
            // Wait for parent instead of actively recovering
            setLifecycleState(LifecycleState.WAIT_PARENT);
        }
    } catch (error) {}
}

function handleOfflineStatus() {
    try {
        if (!isOnline) return;
        
        isOnline = false;
        state.isOnline = false;
        
        setTimeout(() => { updateUserStatus(); }, 100);
        
        if (!state.offlineModeEnabled) {
            state.offlineModeEnabled = true;
            isOfflineMode = true;
            
            const offlineKey = 'offline_status';
            if (!_loggedMessages.has(offlineKey)) {
                _loggedMessages.add(offlineKey);
                logStatus('WARNING', 'Offline mode enabled');
            }
            
            setLifecycleState(LifecycleState.WAIT_PARENT);
        }
    } catch (error) {}
}

function sendUserActive() {
    try {
        if (parentCoordinator.handshakeComplete && currentUser?.id) {
            ParentCommunication.sendAction('USER_ACTIVE', {
                userId: currentUser.id
            });
        }
    } catch (error) {}
}

function sendUserInactive() {
    try {
        if (parentCoordinator.handshakeComplete && currentUser?.id) {
            ParentCommunication.sendAction('USER_INACTIVE', {
                userId: currentUser.id,
                lastActive: lastActivityTime
            });
        }
    } catch (error) {}
}

async function updateUserStatus() {
    try {
        if (!currentUser && !state.user && !isAuthenticated()) return;
        
        const userId = currentUser?.id || state.user?.id;
        if (!userId) return;
        
        const status = isOnline ? 'online' : 'offline';
        
        if (currentUser) {
            currentUser.status = status;
            currentUser.lastSeen = new Date().toISOString();
        }
        
        if (parentCoordinator.handshakeComplete) {
            ParentCommunication.sendAction('STATUS_UPDATE', {
                userId: userId,
                status: status,
                lastSeen: new Date().toISOString(),
                isOnline: isOnline
            });
        }
        
        if (isOnline && !state.offlineModeEnabled) {
            try {
                await secureApiCall('/api/user/status', {
                    method: 'POST',
                    body: JSON.stringify({ status: status, lastSeen: new Date().toISOString() })
                });
            } catch (apiError) {}
        }
        
    } catch (error) {}
}

async function syncPendingData() {
    try {
        const reactionsToSync = [...pendingReactions];
        for (const reaction of reactionsToSync) {
            try {
                await ParentCommunication.sendAction('ADD_REACTION', { 
                    statusId: reaction.statusId, 
                    reaction: reaction.reaction 
                });
                pendingReactions = pendingReactions.filter(r => 
                    !(r.statusId === reaction.statusId && r.reaction === reaction.reaction)
                );
            } catch (error) {}
        }
        
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, pendingReactions);
        
        const offlineQueue = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE) || [];
        for (const statusData of offlineQueue) {
            try {
                await ParentCommunication.sendAction('UPLOAD_STATUS', statusData);
            } catch (error) {}
        }
        
        SafeStorage.remove(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
        await loadFreshDataInBackground();
        
        const syncKey = 'pending_data_synced';
        if (!_loggedMessages.has(syncKey)) {
            _loggedMessages.add(syncKey);
            logStatus('SUCCESS', 'Pending data synced');
        }
        
    } catch (error) {}
}

// =============================================
// UTILITY FUNCTIONS (PRESERVED)
// =============================================
function escapeHtml(text) {
    try {
        if (!text) return '';
        if (typeof document === 'undefined') return text;
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    } catch (error) {
        return text || '';
    }
}

function formatTimeAgo(date) {
    try {
        if (!date) return 'Unknown';
        
        const dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) return 'Unknown';
        
        const now = new Date();
        const diffMs = now - dateObj;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return `${Math.floor(diffDays / 7)}w ago`;
    } catch (error) {
        return 'Unknown';
    }
}

async function retryOperation(operation, maxRetries = 3) {
    try {
        let lastError;
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                if (i < maxRetries - 1) {
                    const baseDelay = IframeEnvironment.isVPNNetwork ? 2000 : 1000;
                    const delay = Math.min(baseDelay * Math.pow(2, i), 10000);
                    const jitter = Math.random() * 200;
                    await new Promise(resolve => setTimeout(resolve, delay + jitter));
                }
            }
        }
        
        throw lastError;
    } catch (error) {
        throw error;
    }
}

function generateSampleMoodData() {
    try {
        const moods = Object.keys(statusMoods);
        const sampleData = [];
        const now = new Date();
        
        for (let i = 29; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            
            const randomMood = moods[Math.floor(Math.random() * moods.length)];
            sampleData.push({
                mood: randomMood,
                value: 40 + Math.floor(Math.random() * 50),
                date: date.toISOString().split('T')[0],
                timestamp: date.getTime()
            });
        }
        
        sampleData.sort((a, b) => a.timestamp - b.timestamp);
        return sampleData;
    } catch (error) {
        return [];
    }
}

// =============================================
// SAFE LOG ERROR UTILITY (PRESERVED)
// =============================================
let errorLogCounts = {};
let maxErrorLogs = 1;
let retryCounts = {};
let maxRetries = 3;
let messageCache = new Set();

function safeLogError(module, functionName, error, data = null) {
    try {
        const errorKey = `${module}:${functionName}:${error?.message || 'unknown'}`;
        
        if (!errorLogCounts[errorKey]) errorLogCounts[errorKey] = 0;
        errorLogCounts[errorKey]++;
        
        if (errorLogCounts[errorKey] <= maxErrorLogs) {
            logStatus('FAILED', `${module}: ${functionName} - ${error?.message || error}`);
        }
        
        if (functionName.includes('get') || functionName.includes('load')) {
            return Array.isArray(data) ? [] : null;
        }
    } catch (e) {}
}

// =============================================
// USER GUARD AND API GUARD (PRESERVED)
// =============================================
function withUserGuard(fn, defaultValue = null) {
    return function(...args) {
        try {
            if (!state.sessionActive && !state.isGuestMode && !currentUser && !parentCoordinator.sessionData && !state.sessionMirror.validated) {
                safeLogError('Status', fn.name || 'anonymous', new Error('No user session'));
                return defaultValue;
            }
            return fn(...args);
        } catch (error) {
            safeLogError('Status', fn.name || 'anonymous', error);
            return defaultValue;
        }
    };
}

function withApiGuard(fn, defaultValue = null) {
    return async function(...args) {
        try {
            return await fn(...args);
        } catch (error) {
            safeLogError('Status', fn.name || 'anonymous', error);
            return defaultValue;
        }
    };
}

function safeGetElement(selector) {
    try {
        const element = document.querySelector(selector);
        if (!element) safeLogError('Status', 'safeGetElement', new Error(`Element not found: ${selector}`));
        return element;
    } catch (error) {
        safeLogError('Status', 'safeGetElement', error);
        return null;
    }
}

// =============================================
// STUB FUNCTIONS FOR COMPATIBILITY (PRESERVED)
// =============================================
function getFriendsStatuses() {
    try { return friendsStatuses || []; } catch (error) { safeLogError('Status', 'getFriendsStatuses', error); return []; }
}

function getCloseFriendsStatuses() {
    try { return closeFriendsStatuses || []; } catch (error) { safeLogError('Status', 'getCloseFriendsStatuses', error); return []; }
}

function getMicroCirclesStatuses() {
    try { return microCirclesStatuses || []; } catch (error) { safeLogError('Status', 'getMicroCirclesStatuses', error); return []; }
}

function getMutedStatuses() {
    try { return mutedStatuses || []; } catch (error) { safeLogError('Status', 'getMutedStatuses', error); return []; }
}

function setCurrentViewerStatus(status) {
    try { currentViewerStatus = status; } catch (error) { safeLogError('Status', 'setCurrentViewerStatus', error); }
}

function getCurrentViewerStatus() {
    try { return currentViewerStatus; } catch (error) { safeLogError('Status', 'getCurrentViewerStatus', error); return null; }
}

function setCurrentSlideIndex(index) {
    try { currentSlideIndex = index || 0; } catch (error) { safeLogError('Status', 'setCurrentSlideIndex', error); }
}

function getCurrentSlideIndex() {
    try { return currentSlideIndex || 0; } catch (error) { safeLogError('Status', 'getCurrentSlideIndex', error); return 0; }
}

function toggleAutoAdvancePause() {
    try { isAutoAdvancePaused = !isAutoAdvancePaused; return isAutoAdvancePaused; } catch (error) { safeLogError('Status', 'toggleAutoAdvancePause', error); return false; }
}

function setCurrentCategoryFilter(category) {
    try { currentCategoryFilter = category || 'all'; } catch (error) { safeLogError('Status', 'setCurrentCategoryFilter', error); }
}

function getCurrentCategoryFilter() {
    try { return currentCategoryFilter || 'all'; } catch (error) { safeLogError('Status', 'getCurrentCategoryFilter', error); return 'all'; }
}

function setCurrentIntentFilter(intent) {
    try { currentIntentFilter = intent; } catch (error) { safeLogError('Status', 'setCurrentIntentFilter', error); }
}

function getCurrentIntentFilter() {
    try { return currentIntentFilter; } catch (error) { safeLogError('Status', 'getCurrentIntentFilter', error); return null; }
}

function setCurrentMoodFilter(mood) {
    try { currentMoodFilter = mood; } catch (error) { safeLogError('Status', 'setCurrentMoodFilter', error); }
}

function getCurrentMoodFilter() {
    try { return currentMoodFilter; } catch (error) { safeLogError('Status', 'getCurrentMoodFilter', error); return null; }
}

function getPendingReplies() {
    try { return pendingReplies || []; } catch (error) { safeLogError('Status', 'getPendingReplies', error); return []; }
}

function getPendingReactions() {
    try { return pendingReactions || []; } catch (error) { safeLogError('Status', 'getPendingReactions', error); return []; }
}

function getMoodChartData() {
    try { return moodChartData || []; } catch (error) { safeLogError('Status', 'getMoodChartData', error); return []; }
}

function getStreakCount() {
    try { return streakCount || 0; } catch (error) { safeLogError('Status', 'getStreakCount', error); return 0; }
}

function getLastPostDate() {
    try { return lastPostDate; } catch (error) { safeLogError('Status', 'getLastPostDate', error); return null; }
}

function getActiveFilters() {
    try { return activeFilters || new Set(); } catch (error) { safeLogError('Status', 'getActiveFilters', error); return new Set(); }
}

function getSelectedDraft() {
    try { return selectedDraft; } catch (error) { safeLogError('Status', 'getSelectedDraft', error); return null; }
}

function setSelectedDraft(draft) {
    try { selectedDraft = draft; } catch (error) { safeLogError('Status', 'setSelectedDraft', error); }
}

// =============================================
// NEW FUNCTION: updateLocalStateWithSession - REQUIRED BY status-ui.js (PRESERVED)
// =============================================
function updateLocalStateWithSession(sessionData) {
    try {
        if (!sessionData) return false;
        
        if (sessionData.user) {
            currentUser = sessionData.user;
            userData = sessionData.user;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER, sessionData.user);
        }
        
        if (sessionData.token) {
            SafeStorage.set(UNIFIED_TOKEN_KEY, sessionData.token);
            state.token = sessionData.token;
        }
        
        if (sessionData.refreshToken) {
            SafeStorage.setJSON('REFRESH_TOKEN', sessionData.refreshToken);
            state.sessionMirror.refreshToken = sessionData.refreshToken;
        }
        
        if (sessionData.permissions && Array.isArray(sessionData.permissions)) {
            state.permissionsGranted = [...sessionData.permissions];
        }
        
        if (sessionData.capabilities && Array.isArray(sessionData.capabilities)) {
            state.sessionMirror.capabilities = [...sessionData.capabilities];
        }
        
        if (sessionData.sessionId) {
            state.sessionId = sessionData.sessionId;
        }
        
        updateSessionMirror(sessionData, 'local_update');
        SessionClient.updateSession(sessionData, 'local_update');
        
        isTokenReady = true;
        triggerTokenReadyCallbacks();
        processPendingApiRequests();
        
        const updateKey = 'local_state_updated';
        if (!_loggedMessages.has(updateKey)) {
            _loggedMessages.add(updateKey);
            logStatus('SUCCESS', 'Local state updated with session');
        }
        
        return true;
    } catch (error) {
        const failKey = 'local_state_update_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `updateLocalStateWithSession: ${error.message}`);
        }
        return false;
    }
}

// =============================================
// DIAGNOSTICS AND MONITORING (PRESERVED)
// =============================================
function enableDiagnostics() {
    state.diagnosticsEnabled = true;
    window.__IFRAME_DEBUG__ = true;
    DiagnosticsAgent.enable();
    
    const enableKey = 'diagnostics_enabled';
    if (!_loggedMessages.has(enableKey)) {
        _loggedMessages.add(enableKey);
        logStatus('INFO', 'Diagnostics enabled');
    }
}

function disableDiagnostics() {
    state.diagnosticsEnabled = false;
    window.__IFRAME_DEBUG__ = false;
    DiagnosticsAgent.disable();
    
    const disableKey = 'diagnostics_disabled';
    if (!_loggedMessages.has(disableKey)) {
        _loggedMessages.add(disableKey);
        logStatus('INFO', 'Diagnostics disabled');
    }
}

function getDiagnostics() {
    return {
        health: getHealthMetrics(),
        diagnosticLog: state.diagnosticData,
        lifecycle: _currentLifecycleState,
        handshake: {
            state: state.handshakeState,
            startTime: state.handshakeStartTime,
            endTime: state.handshakeEndTime,
            duration: state.handshakeEndTime ? state.handshakeEndTime - state.handshakeStartTime : null,
            childReadySent: state.childReadySent,
            parentReadyReceived: state.parentReadyReceived,
            handshakeAckReceived: state.handshakeAckReceived,
            sessionSyncReceived: state.sessionSyncReceived,
            pageActivated: state.pageActivated
        },
        session: getSessionMirror(),
        security: state.securityContext,
        frame: {
            id: state.frameId,
            instanceId: state.instanceId
        },
        parent: {
            detected: state.parentDetected,
            origin: state.securityContext.parentOrigin,
            protocol: state.parentProtocolVersion,
            capabilities: Array.from(state.parentCapabilities)
        },
        retry: {
            queueSize: state.retryQueue.length,
            pendingAcks: state.pendingAcks.size
        },
        offline: {
            enabled: state.offlineModeEnabled,
            isOnline: state.isOnline,
            bufferSize: state.offlineBuffer.length
        },
        environment: {
            type: IframeEnvironment.type,
            isLocalDev: IframeEnvironment.isLocalDev,
            isRenderHosted: IframeEnvironment.isRenderHosted,
            isVPNNetwork: IframeEnvironment.isVPNNetwork,
            isProduction: IframeEnvironment.isProduction,
            isSandboxed: IframeEnvironment.isSandboxed,
            latency: IframeEnvironment.latency,
            connectionType: IframeEnvironment.connectionType
        },
        sessionClient: {
            sessionValid: SessionClient.sessionValid,
            sessionExpiry: SessionClient.sessionExpiry,
            offlineMode: SessionClient.offlineMode
        },
        transport: IframeTransport.getStatus(),
        navigation: NavigationGuard.getState(),
        diagnostics: DiagnosticsAgent.getReport()
    };
}

// =============================================
// SANDBOX DETECTION (PRESERVED)
// =============================================
function detectSandbox() {
    try {
        const sandboxed = !window.parent || window.parent === window || 
                          (() => { try { return !window.parent.location; } catch { return true; } })();
        
        if (sandboxed) {
            state.securityContext.signatureRequired = false;
            state.securityContext.encryptionRequired = false;
            state.securityContext.replayProtection = false;
            
            try {
                if (document.referrer) {
                    const referrerOrigin = new URL(document.referrer).origin;
                    TRUSTED_ORIGINS.add(referrerOrigin);
                }
            } catch (e) {}
            
            const sandboxKey = 'sandbox_detected';
            if (!_loggedMessages.has(sandboxKey)) {
                _loggedMessages.add(sandboxKey);
                logStatus('INFO', 'Sandbox detected');
            }
            
            return true;
        }
        
        return false;
    } catch (error) {
        return true;
    }
}

// =============================================
// CLEANUP AND MEMORY MANAGEMENT (PRESERVED)
// =============================================
function cleanup() {
    try {
        stopExpirationMonitoring();
        
        if (apiCheckInterval) { clearInterval(apiCheckInterval); apiCheckInterval = null; }
        if (parentCoordinator.handshakeInterval) { clearInterval(parentCoordinator.handshakeInterval); parentCoordinator.handshakeInterval = null; }
        if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
        if (autoAdvanceInterval) { clearInterval(autoAdvanceInterval); autoAdvanceInterval = null; }
        if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
        if (parentCoordinator.handshakeTimeout) { clearTimeout(parentCoordinator.handshakeTimeout); parentCoordinator.handshakeTimeout = null; }
        if (activityThrottleTimer) { clearTimeout(activityThrottleTimer); activityThrottleTimer = null; }
        if (HandshakeClient.timer) { clearTimeout(HandshakeClient.timer); HandshakeClient.timer = null; }
        
        state.retryTimers.forEach((timer) => clearTimeout(timer));
        state.retryTimers.clear();
        
        cleanupEventListeners();
        
        tokenReadyCallbacks = [];
        pendingApiRequests = [];
        state.retryQueue = [];
        
        parentCoordinator.handshakeInProgress = false;
        parentCoordinator.sessionValid = false;
        parentCoordinator.sessionRequestSent = false;
        parentCoordinator.handshakeRetries = 0;
        
        errorLogCounts = {};
        retryCounts = {};
        messageCache.clear();
        
        const cleanupKey = 'cleanup_complete';
        if (!_loggedMessages.has(cleanupKey)) {
            _loggedMessages.add(cleanupKey);
            logStatus('INFO', 'Cleanup complete');
        }
        
        shutdownCore().catch(() => {});
        
    } catch (error) {
        safeLogError('Status', 'cleanup', error);
    }
}

function cleanupEventListeners() {
    try {
        activityEventHandlers.forEach(({ element, type, handler }) => {
            try { element.removeEventListener(type, handler); } catch (error) {}
        });
        activityEventHandlers = [];
        
        window.removeEventListener('message', handleEnhancedParentMessage);
        window.removeEventListener('message', receiveFromParent);
        
        isTrackingInitialized = false;
    } catch (error) {
        safeLogError('Status', 'cleanupEventListeners', error);
    }
}

// =============================================
// SAFE INITIALIZATION WITH PARENT HANDSHAKE (PRESERVED)
// =============================================
let _PARENT_READY_ = false;
let _HANDSHAKE_DONE_ = false;
let _HANDSHAKE_RETRIES_ = 0;
const MAX_HANDSHAKE = 3;
let _INITIALIZATION_STARTED_ = false;
let _UI_BINDING_DONE_ = false;
let _CORE_READY_ = false;
let _PAGE_LOADED_ = false;
let _LOADING_MESSAGE_ = null;
let _ERROR_CACHE_ = new Set();

function logOnce(level, msg) {
    if (_ERROR_CACHE_.has(msg)) return;
    _ERROR_CACHE_.add(msg);
    logStatus(level === 'error' ? 'FAILED' : 'WARNING', msg);
}

async function safeInit() {
    if (_INITIALIZATION_STARTED_) {
        return;
    }
    
    _INITIALIZATION_STARTED_ = true;
    
    let tries = 0;
    const maxTries = 5;
    
    const initKey = 'safe_init_start';
    if (!_loggedMessages.has(initKey)) {
        _loggedMessages.add(initKey);
        logStatus('INIT', 'Starting safe initialization');
    }
    
    IframeEnvironment.detect();
    detectSandbox();
    
    window.addEventListener('message', receiveFromParent);
    state.listeners.add({ type: 'message', handler: receiveFromParent });
    
    const parentAvailable = await ParentDetector.detect();
    
    if (parentAvailable) {
        const parentKey = 'parent_available';
        if (!_loggedMessages.has(parentKey)) {
            _loggedMessages.add(parentKey);
            logStatus('INFO', 'Parent available, starting handshake');
        }
        
        // Use deterministic lifecycle
        initializeModule();
        
    } else {
        const noParentKey = 'parent_not_available';
        if (!_loggedMessages.has(noParentKey)) {
            _loggedMessages.add(noParentKey);
            logStatus('WARNING', 'Parent not available');
        }
        if (state.sessionMirror.validated) {
            setLifecycleState(LifecycleState.ACTIVE);
            logStatus('SUCCESS', 'Session activated from cache');
        } else {
            enableGuestMode();
        }
    }
    
    try {
        initializeUIWithCachedData();
        startExpirationMonitoring();
        
        const uiKey = 'ui_cached_init_complete';
        if (!_loggedMessages.has(uiKey)) {
            _loggedMessages.add(uiKey);
            logStatus('SUCCESS', 'UI initialized with cached data');
        }
        
        setTimeout(async () => {
            try {
                await bootstrapApp();
                setTimeout(() => { initializeUserStatusTracking(); }, 1000);
            } catch (error) {
                safeLogError('Status', 'safeInit.bootstrap', error);
            }
        }, 50);
        
    } catch (e) {
        logOnce('error', `Initialization failed: ${e.message}`);
    }
}

function notifyParentReady() {
    // Delegate to ParentCommunication
    if (!ParentCommunication.childReadySent && isLifecycleState(LifecycleState.READY)) {
        ParentCommunication.sendChildReady();
    }
}

function initPageCore() {
    try {
        setTimeout(() => {
            safeInit().catch(error => {
                safeLogError('Status', 'initPageCore.safeInit', error);
            });
        }, 10);
    } catch (error) {
        safeLogError('Status', 'initPageCore', error);
    }
}

// =============================================
// FETCH FAILURE SAFE HANDLING (PRESERVED)
// =============================================
const _fetchAttempts = {};

async function safeFetch(url, options = {}) {
    // Check if we should attempt fetch
    if (!navigator.onLine) {
        logStatus('WARNING', 'Network offline');
        return { success: false, message: "Network offline", offline: true };
    }
    
    const fetchKey = `fetch_${url}`;
    
    try {
        const response = await fetch(url, {
            credentials: "include",
            ...options
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();
        
        // Reset attempt counter on success
        if (_fetchAttempts[fetchKey]) {
            delete _fetchAttempts[fetchKey];
        }
        
        // Only log successful fetch once per URL
        if (!_loggedMessages.has(`fetch_success_${url}`)) {
            _loggedMessages.add(`fetch_success_${url}`);
            logStatus('SUCCESS', `Fetch: ${url}`);
        }
        
        return data;
    } catch (error) {
        // Count attempts
        _fetchAttempts[fetchKey] = (_fetchAttempts[fetchKey] || 0) + 1;
        
        // Only log first attempt failure
        if (_fetchAttempts[fetchKey] === 1 && !_loggedMessages.has(`fetch_fail_${url}`)) {
            _loggedMessages.add(`fetch_fail_${url}`);
            logStatus('FAILED', `Fetch: ${url} - ${error.message}`);
        }
        
        return { success: false, message: "Network issue", error: error.message };
    }
}

// =============================================
// PAGE CORE COMPATIBILITY LAYER (PRESERVED)
// =============================================
const pageCore = {
    isReady: () => state.initialized,
    getData: (type) => {
        switch(type) {
            case 'statuses': return statuses;
            case 'myStatuses': return myStatuses;
            case 'friendsList': return [];
            case 'notifications': return [];
            default: return null;
        }
    },
    updateData: () => {},
    showMessage: () => {},
    sendToParent
};

// =============================================
// AUTO-CLEANUP ON UNLOAD (PRESERVED)
// =============================================
if (typeof window !== 'undefined') {
    try {
        window.addEventListener('beforeunload', cleanup);
        window.addEventListener('pagehide', cleanup);
    } catch (error) {
        safeLogError('Status', 'initPageCore.eventListeners', error);
    }
}

// =============================================
// GLOBAL EXPOSURE - LEGACY SUPPORT (PRESERVED)
// =============================================
if (typeof window !== 'undefined') {
    try {
        window.statusCore = {
            // New deterministic modules
            LifecycleFSM,
            MessageValidator,
            ParentCommunication,
            ControlledRetryEngine,
            
            // Core functions
            initializeModule,
            initializeCore,
            startHandshake,
            sendToParent,
            requestSession,
            receiveFromParent,
            shutdownCore,
            initializeParentCoordination,
            getUnifiedToken,
            secureApiCall,
            initializeUserStatusTracking,
            cleanup,
            generateSampleMoodData,
            startSecureHandshake,
            safeLogError,
            withUserGuard,
            withApiGuard,
            safeGetElement,
            logOnce,
            safeInit,
            getData: pageCore.getData,
            updateData: pageCore.updateData,
            isReady: () => state.initialized || pageCore.isReady(),
            getHealthMetrics,
            getSession,
            isSessionValid,
            UNIFIED_TOKEN_KEY,
            LOCAL_STORAGE_KEYS,
            bootstrapApplication,
            handleSessionData,
            validateSessionData,
            updateLocalStateWithSession,
            handleSessionUpdate,
            handleLogout,
            handleParentUnavailable,
            startBackgroundInitializationWithSession,
            makeParentApiRequest,
            handleAuthValidated,
            waitForTokenReady,
            onTokenReady,
            triggerTokenReadyCallbacks,
            migrateLegacyTokens,
            isAuthenticated,
            queueApiRequest,
            processPendingApiRequests,
            startTokenReadinessCheck,
            initializeUIWithCachedData,
            loadUserFromCache,
            loadCachedDataInstantly,
            startBackgroundInitialization,
            loadFreshDataInBackground,
            safeApiOperation,
            loadStatusesInBackground,
            loadMyStatusesInBackground,
            loadHighlightsInBackground,
            loadUserDataInBackground,
            handleAuthError,
            initializeStatusSystem,
            loadInitialData,
            filterStatusesByPrivacy,
            getStatusPreviewText,
            filterStatusesByType,
            getEmptyStateMessage,
            addReactionToStatus,
            removeReactionFromStatus,
            changeReaction,
            trackStatusView,
            voteOnPoll,
            pinStatus,
            unpinStatus,
            muteUser,
            unmuteUser,
            postStatus,
            sanitizeStatusData,
            validateStatusPayload,
            updateStreakCounter,
            scheduleStatus,
            saveDraft,
            reportStatus,
            escapeHtml,
            formatTimeAgo,
            retryOperation,
            getFriendsStatuses,
            getCloseFriendsStatuses,
            getMicroCirclesStatuses,
            getMutedStatuses,
            setCurrentViewerStatus,
            getCurrentViewerStatus,
            setCurrentSlideIndex,
            getCurrentSlideIndex,
            toggleAutoAdvancePause,
            setCurrentCategoryFilter,
            getCurrentCategoryFilter,
            setCurrentIntentFilter,
            getCurrentIntentFilter,
            setCurrentMoodFilter,
            getCurrentMoodFilter,
            getPendingReplies,
            getPendingReactions,
            getMoodChartData,
            getStreakCount,
            getLastPostDate,
            getActiveFilters,
            getSelectedDraft,
            setSelectedDraft,
            
            // Expiration management
            startExpirationMonitoring,
            stopExpirationMonitoring,
            checkAndCleanExpiredStatuses,
            
            // Enhanced modules
            ParentDetector,
            SafeStorage,
            MessageFirewall,
            getSessionMirror,
            isSessionMirrorValid,
            refreshToken,
            requestParentConfig,
            enableDiagnostics,
            disableDiagnostics,
            getDiagnostics,
            formatCanonicalMessage,
            adaptLegacyMessage,
            detectSandbox,
            
            // Enhanced modules
            IframeEnvironment,
            IframeAuthority,
            OriginTrustAdapter,
            MessageBus,
            IframeTransport,
            RecoveryManager,
            SessionClient,
            CompatibilityBridge,
            NavigationGuard,
            DiagnosticsAgent,
            
            // Safe fetch
            safeFetch,
            logStatus,
            
            // Add missing exports
            IframeHandshakeAuthority,
            StartupGovernor,
            HandshakeClient
        };
        
        if (window.location.search.includes('debug=true')) {
            enableDiagnostics();
        }
        
        const globalKey = 'status_core_global';
        if (!_loggedMessages.has(globalKey)) {
            _loggedMessages.add(globalKey);
            logStatus('READY', 'Status core exposed globally');
        }
        
    } catch (error) {
        safeLogError('Status', 'globalExposure', error);
    }
}

// =============================================
// EXPORT CONTRACT - ALL SYMBOLS REQUIRED BY status-ui.js
// =============================================
export {
    // New deterministic modules
    LifecycleFSM,
    MessageValidator,
    ParentCommunication,
    ControlledRetryEngine,
    
    // Core state & session
    currentUser,
    userData,
    statuses,
    myStatuses,
    friendsStatuses,
    closeFriendsStatuses,
    pinnedStatuses,
    mutedStatuses,
    microCirclesStatuses,
    highlights,
    drafts,
    scheduledStatuses,
    viewedStatuses,
    mutedUsers,
    currentViewerStatus,
    currentSlideIndex,
    autoAdvanceInterval,
    isAutoAdvancePaused,
    progressInterval,
    currentCategoryFilter,
    currentIntentFilter,
    currentMoodFilter,
    isMobile,
    isOfflineMode,
    pendingReplies,
    pendingReactions,
    moodChartData,
    streakCount,
    lastPostDate,
    activeFilters,
    selectedDraft,
    isBackgroundInitialized,
    isTokenReady,
    
    // Parent coordination
    parentCoordinator,
    
    // Status definitions
    statusTypes,
    statusIntents,
    statusMoods,
    statusCategories,
    actionButtons,
    privacySettings,
    durationOptions,
    reportReasons,
    reactions,
    emojis,
    backgroundOptions,
    statusTemplates,
    
    // Storage keys
    LOCAL_STORAGE_KEYS,
    UNIFIED_TOKEN_KEY,
    
    // Core functions
    initializeModule,
    initializeCore,
    startHandshake,
    sendToParent,
    requestSession,
    receiveFromParent,
    shutdownCore,
    getHealthMetrics,
    getSession,
    isSessionValid,
    registerFeature,
    executeFeature,
    initializeParentCoordination,
    getUnifiedToken,
    secureApiCall,
    initializeUserStatusTracking,
    cleanup,
    generateSampleMoodData,
    startSecureHandshake,
    safeLogError,
    withUserGuard,
    withApiGuard,
    safeGetElement,
    logOnce,
    safeInit,
    initPageCore,
    bootstrapApp,
    bootstrapApplication,
    handleSessionData,
    validateSessionData,
    updateLocalStateWithSession,
    handleSessionUpdate,
    handleLogout,
    handleParentUnavailable,
    startBackgroundInitializationWithSession,
    makeParentApiRequest,
    handleAuthValidated,
    waitForTokenReady,
    onTokenReady,
    triggerTokenReadyCallbacks,
    migrateLegacyTokens,
    isAuthenticated,
    queueApiRequest,
    processPendingApiRequests,
    startTokenReadinessCheck,
    initializeUIWithCachedData,
    loadUserFromCache,
    loadCachedDataInstantly,
    startBackgroundInitialization,
    loadFreshDataInBackground,
    safeApiOperation,
    loadStatusesInBackground,
    loadMyStatusesInBackground,
    loadHighlightsInBackground,
    loadUserDataInBackground,
    handleAuthError,
    initializeStatusSystem,
    loadInitialData,
    filterStatusesByPrivacy,
    getStatusPreviewText,
    filterStatusesByType,
    getEmptyStateMessage,
    addReactionToStatus,
    removeReactionFromStatus,
    changeReaction,
    trackStatusView,
    voteOnPoll,
    pinStatus,
    unpinStatus,
    muteUser,
    unmuteUser,
    postStatus,
    sanitizeStatusData,
    validateStatusPayload,
    updateStreakCounter,
    scheduleStatus,
    saveDraft,
    reportStatus,
    escapeHtml,
    formatTimeAgo,
    retryOperation,
    getFriendsStatuses,
    getCloseFriendsStatuses,
    getMicroCirclesStatuses,
    getMutedStatuses,
    setCurrentViewerStatus,
    getCurrentViewerStatus,
    setCurrentSlideIndex,
    getCurrentSlideIndex,
    toggleAutoAdvancePause,
    setCurrentCategoryFilter,
    getCurrentCategoryFilter,
    setCurrentIntentFilter,
    getCurrentIntentFilter,
    setCurrentMoodFilter,
    getCurrentMoodFilter,
    getPendingReplies,
    getPendingReactions,
    getMoodChartData,
    getStreakCount,
    getLastPostDate,
    getActiveFilters,
    getSelectedDraft,
    setSelectedDraft,
    
    // Enhanced functionality
    getSessionMirror,
    isSessionMirrorValid,
    refreshToken,
    requestParentConfig,
    enableDiagnostics,
    disableDiagnostics,
    getDiagnostics,
    formatCanonicalMessage,
    adaptLegacyMessage,
    detectSandbox,
    
    // Enhanced modules
    IframeEnvironment,
    IframeAuthority,
    OriginTrustAdapter,
    MessageBus,
    IframeTransport,
    RecoveryManager,
    SessionClient,
    CompatibilityBridge,
    NavigationGuard,
    DiagnosticsAgent,
    SafeStorage,
    
    // ===== CRITICAL FIX: Properly export these modules =====
    IframeHandshakeAuthority,
    StartupGovernor,
    HandshakeClient,
    logStatus,
    
    // Expiration management
    startExpirationMonitoring,
    stopExpirationMonitoring,
    checkAndCleanExpiredStatuses,
    
    // Safe fetch and logging
    safeFetch
};

// =============================================
// CORE INITIALIZATION - AUTOMATIC (PRESERVED)
// =============================================
if (typeof window !== 'undefined' && !state.initialized) {
    setTimeout(() => {
        initPageCore();
    }, 10);
}

logStatus('READY', 'Status core initialized v8.1 (deterministic micro-frontend)');