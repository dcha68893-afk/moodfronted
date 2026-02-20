// =============================================
// STATUS SYSTEM - CENTRALIZED TOKEN ACCESS - CORE
// HARDENED ENHANCED VERSION v5.0 - PARENT INTEGRATION
// WITH IFRAME AUTHORITY, STARTUP GOVERNOR & RESILIENCE ENGINE
// COMPLETE RELIABILITY OVERHAUL - PRESERVES ALL EXISTING FEATURES
// =============================================
// EXPORT CONTRACT: ALL SYMBOLS REQUIRED BY status-ui.js
// =============================================

// =============================================
// ENVIRONMENT AUTO-DETECTION SYSTEM (ENHANCED)
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
            
            // Silent log - only once
            if (!window.__ENV_LOGGED__) {
                window.__ENV_LOGGED__ = true;
                console.log(`[Environment] Type: ${this.type}`);
            }
            
            return this.type;
        } catch (e) {
            this.type = 'UNKNOWN';
            return this.type;
        }
    },
    
    getConfig() {
        const baseConfig = {
            handshakeTimeout: 15000,
            heartbeatInterval: 30000,
            maxRetries: 5,
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
                    handshakeTimeout: 10000,
                    heartbeatInterval: 30000,
                    maxRetries: 5,
                    maxRecoveryAttempts: 5,
                    originChecks: 'relaxed',
                    crypto: 'disabled',
                    compatibilityMode: true,
                    batchMessages: false,
                    keepalive: false
                };
            case 'RENDER_HOSTED':
                return {
                    ...baseConfig,
                    handshakeTimeout: 15000,
                    heartbeatInterval: 25000,
                    maxRetries: 7,
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
                    handshakeTimeout: 30000,
                    heartbeatInterval: 45000,
                    maxRetries: 10,
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
                    handshakeTimeout: 10000,
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
        // Silent - already logged once
    }
};

// Initialize the detector
IframeEnvironment.detect();

// =============================================
// FIX 1 — Robust Parent Handshake with Guard
// =============================================
if (!window.__STATUS_HANDSHAKE_INITIALIZED__) {
    window.__STATUS_HANDSHAKE_INITIALIZED__ = true;

    let handshakeAttempts = 0;
    const maxAttempts = 5;

    function initiateHandshake() {
        if (handshakeAttempts >= maxAttempts) return;

        handshakeAttempts++;

        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: "CHILD_HANDSHAKE",
                    source: "status-core",
                    handshakeId: `handshake_${Date.now()}_${handshakeAttempts}`,
                    timestamp: Date.now()
                }, "*");
            }
        } catch (e) {
            // Silent fail
        }
    }

    // Only set interval if not already set
    if (!window.__HANDSHAKE_INTERVAL__) {
        window.__HANDSHAKE_INTERVAL__ = setInterval(() => {
            if (window.__PARENT_ACK_RECEIVED__) {
                clearInterval(window.__HANDSHAKE_INTERVAL__);
                window.__HANDSHAKE_INTERVAL__ = null;
            } else {
                initiateHandshake();
            }
        }, 2000);
    }

    // Add message listener if not already added
    if (!window.__HANDSHAKE_LISTENER_ADDED__) {
        window.__HANDSHAKE_LISTENER_ADDED__ = true;
        
        window.addEventListener("message", (event) => {
            if (!event.data) return;

            if (event.data.type === "PARENT_ACK") {
                window.__PARENT_ACK_RECEIVED__ = true;
                
                // Update state if available
                if (typeof state !== 'undefined') {
                    state.parentDetected = true;
                    state.handshakeState = 'handshake_acked';
                }
                
                if (typeof IframeAuthority !== 'undefined') {
                    IframeAuthority.parentDetected = true;
                }
                
                // Clear interval
                if (window.__HANDSHAKE_INTERVAL__) {
                    clearInterval(window.__HANDSHAKE_INTERVAL__);
                    window.__HANDSHAKE_INTERVAL__ = null;
                }
            }
        });
    }

    // Start initial handshake
    initiateHandshake();
}

// =============================================
// FIX 2 — Fetch Failure Safe Handling
// =============================================
async function safeFetch(url, options = {}) {
    // Check if we should attempt fetch
    if (!navigator.onLine) {
        return { success: false, message: "Network offline", offline: true };
    }
    
    // Track attempts to prevent console spam
    const fetchKey = `fetch_${url}`;
    if (!window.__FETCH_ATTEMPTS__) window.__FETCH_ATTEMPTS__ = {};
    
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
        if (window.__FETCH_ATTEMPTS__[fetchKey]) {
            delete window.__FETCH_ATTEMPTS__[fetchKey];
        }
        
        return data;
    } catch (error) {
        // Count attempts
        window.__FETCH_ATTEMPTS__[fetchKey] = (window.__FETCH_ATTEMPTS__[fetchKey] || 0) + 1;
        
        // Only log first 3 attempts, then be silent
        if (window.__FETCH_ATTEMPTS__[fetchKey] <= 3) {
            console.error("status fetch failed:", error.message);
        }
        
        return { success: false, message: "Network issue", error: error.message };
    }
}

// =============================================
// COMPATIBILITY BRIDGE - ENSURES BACKWARD COMPATIBILITY
// =============================================
const CompatibilityBridge = {
    version: '5.0',
    legacyMode: false,
    adapters: new Map(),
    transforms: new Map(),
    fallbacks: new Map(),
    
    initialize() {
        this.legacyMode = IframeEnvironment.type === 'LOCAL_DEV' || IframeEnvironment.isSandboxed;
        this.registerAdapters();
        this.registerTransforms();
        this.registerFallbacks();
        // Silent initialization
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
                return {
                    ...msg,
                    type: msg.type || msg.event,
                    payload: msg.data || msg.payload,
                    messageId: msg.id || msg.messageId,
                    timestamp: msg.timestamp || Date.now()
                };
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

if (isStandaloneMode) {
    // Silent standalone mode - no console warning
    
    // Override TransportAgent.send to be no-op in standalone mode
    const originalSend = TransportAgent?.send;
    if (typeof TransportAgent !== 'undefined') {
        TransportAgent.send = function(type, payload = {}, options = {}) {
            if (type === 'PING' || type === 'HEARTBEAT') {
                return Promise.resolve({ success: true, standalone: true });
            }
            
            if (options.requiresAck) {
                if (type === 'CHILD_READY' || type === 'HANDSHAKE_REQUEST' || type === 'SESSION_SYNC') {
                    setTimeout(() => {
                        const mockResponse = {
                            type: type === 'CHILD_READY' ? 'PARENT_READY' : 
                                  type === 'HANDSHAKE_REQUEST' ? 'HANDSHAKE_ACK' : 'SESSION_SYNC',
                            inResponseTo: options.messageId,
                            payload: {
                                session: {
                                    user: { id: 'guest', displayName: 'Guest User' },
                                    token: 'standalone-token',
                                    permissions: ['guest', 'view_statuses']
                                }
                            }
                        };
                        
                        if (typeof receiveFromParent !== 'undefined') {
                            receiveFromParent({ data: mockResponse, origin: window.location.origin });
                        }
                    }, 100);
                    
                    return new Promise((resolve) => {
                        setTimeout(() => resolve({ success: true, standalone: true }), 200);
                    });
                }
            }
            
            return Promise.resolve({ success: true, standalone: true });
        };
    }
    
    // Override startEnhancedHeartbeat
    if (typeof startEnhancedHeartbeat !== 'undefined') {
        const originalHeartbeat = startEnhancedHeartbeat;
        startEnhancedHeartbeat = function() {
            // Silent - heartbeat disabled
            return;
        };
    }
    
    // Mark as handshake complete
    setTimeout(() => {
        if (typeof state !== 'undefined') {
            state.parentDetected = true;
            state.handshakeComplete = true;
            state.handshakeState = 'active';
            state.sessionActive = true;
            state.isGuestMode = false;
            state.sessionMirror = {
                validated: true,
                user: { id: 'guest', displayName: 'Guest User' },
                token: 'standalone-token',
                permissions: ['guest', 'view_statuses']
            };
        }
        
        if (typeof isTokenReady !== 'undefined') {
            isTokenReady = true;
            if (typeof triggerTokenReadyCallbacks !== 'undefined') {
                triggerTokenReadyCallbacks();
            }
        }
        
        // Silent activation
    }, 500);
}

// =============================================
// IFRAME AUTHORITY - CENTRALIZED CONTROL
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
        return this;
    },
    
    detectParent() {
        try {
            this.parentDetected = !!(window.parent && window.parent !== window);
            if (this.parentDetected && document.referrer) {
                try {
                    this.parentOrigin = new URL(document.referrer).origin;
                    this.addTrustedDomain(this.parentOrigin);
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
// DIAGNOSTICS AGENT - TELEMETRY & DEBUGGING
// =============================================
const DiagnosticsAgent = {
    enabled: false, // Disabled by default - no console noise
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
        offlineOperations: 0
    },
    events: [],
    maxEvents: 1000,
    
    enable() {
        this.enabled = true;
        // Silent enable
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
            // Silent - no console
        } else if (level === 'warn') {
            this.metrics.warnings++;
            // Silent - no console
        }
    },
    
    sanitize(data) {
        if (!data) return data;
        if (typeof data !== 'object') return data;
        
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
            offlineOperations: 0
        };
    }
};

// =============================================
// LOGGING SYSTEM - STRUCTURED, NO SPAM
// =============================================
const LOG_LEVEL = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

let currentLogLevel = LOG_LEVEL.ERROR; // Only errors by default
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
        } else if (level === LOG_LEVEL.DEBUG) {
            DiagnosticsAgent.debug(module, message, data);
        } else {
            DiagnosticsAgent.info(module, message, data);
        }
    } catch (e) {}
}

// =============================================
// SAFE STORAGE LAYER - FALLBACK TO MEMORY
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
// STARTUP GOVERNOR - PREVENTS DUPLICATE INITIALIZATION
// =============================================
const StartupGovernor = {
    state: 'INIT', // INIT, WAIT_PARENT, HANDSHAKING, SYNCING, ACTIVE, DEGRADED, RECOVERING
    lock: false,
    initializationAttempted: false,
    handshakeAttempted: false,
    handshakeCompleted: false,
    handshakeStartTime: null,
    handshakeEndTime: null,
    parentReadyReceived: false,
    childReadySent: false,
    handshakeRetries: 0,
    maxHandshakeRetries: IframeEnvironment.getConfig().maxRetries,
    handshakeTimeout: IframeEnvironment.getConfig().handshakeTimeout,
    stateChangeListeners: new Set(),
    mutex: false,
    recoveryAttempts: 0,
    maxRecoveryAttempts: IframeEnvironment.getConfig().maxRecoveryAttempts,
    
    transition(newState) {
        if (this.state === newState) return;
        
        const oldState = this.state;
        this.state = newState;
        
        // Silent transition - no logging
        
        this.stateChangeListeners.forEach(listener => {
            try {
                listener(oldState, newState);
            } catch (e) {}
        });
        
        document.dispatchEvent(new CustomEvent('governorStateChange', {
            detail: { oldState, newState }
        }));
    },
    
    canInitialize() {
        if (this.mutex) return false;
        if (this.lock) return false;
        if (this.initializationAttempted && this.handshakeCompleted) return false;
        return true;
    },
    
    acquireLock() {
        if (this.mutex) return false;
        this.mutex = true;
        return true;
    },
    
    releaseLock() {
        this.mutex = false;
    },
    
    startHandshake() {
        if (this.handshakeAttempted && this.handshakeCompleted) return false;
        
        this.transition('WAIT_PARENT');
        this.handshakeAttempted = true;
        this.handshakeStartTime = Date.now();
        DiagnosticsAgent.increment('handshakeAttempts');
        
        return true;
    },
    
    completeHandshake() {
        this.transition('SYNCING');
        this.handshakeCompleted = true;
        this.handshakeEndTime = Date.now();
        DiagnosticsAgent.increment('handshakeSuccess');
    },
    
    activate() {
        this.transition('ACTIVE');
        this.recoveryAttempts = 0;
    },
    
    degrade(reason) {
        this.transition('DEGRADED');
        // Silent degrade
    },
    
    recover() {
        this.transition('RECOVERING');
        this.recoveryAttempts++;
        DiagnosticsAgent.increment('recoveryAttempts');
    },
    
    recoverySucceeded() {
        DiagnosticsAgent.increment('recoverySuccess');
        this.activate();
    },
    
    recoveryFailed() {
        DiagnosticsAgent.increment('recoveryFailures');
        this.degrade('Recovery failed');
    },
    
    isActive() {
        return this.state === 'ACTIVE';
    },
    
    isHandshaking() {
        return this.state === 'HANDSHAKING' || this.state === 'WAIT_PARENT' || this.state === 'SYNCING';
    },
    
    shouldRetryHandshake() {
        return this.handshakeRetries < this.maxHandshakeRetries && !this.handshakeCompleted;
    },
    
    shouldAttemptRecovery() {
        return this.recoveryAttempts < this.maxRecoveryAttempts;
    },
    
    incrementRetry() {
        this.handshakeRetries++;
    },
    
    resetRetries() {
        this.handshakeRetries = 0;
    },
    
    getMetrics() {
        return {
            state: this.state,
            handshakeCompleted: this.handshakeCompleted,
            handshakeRetries: this.handshakeRetries,
            handshakeDuration: this.handshakeEndTime ? this.handshakeEndTime - this.handshakeStartTime : null,
            parentReadyReceived: this.parentReadyReceived,
            childReadySent: this.childReadySent,
            recoveryAttempts: this.recoveryAttempts
        };
    }
};

// =============================================
// ORIGIN TRUST ADAPTER - DYNAMIC TRUST EVALUATION
// =============================================
const OriginTrustAdapter = {
    trustedOrigins: new Set(),
    blockedOrigins: new Set(),
    dynamicTrustCache: new Map(),
    trustLevel: 'standard', // relaxed, standard, strict
    parentOrigin: null,
    backendDomain: 'https://moodchat-fy56.onrender.com',
    frontendDomain: 'https://moodfronted.onrender.com',
    
    initialize() {
        this.loadBuiltinTrustedOrigins();
        this.setTrustLevelFromEnvironment();
        this.addTrustedOrigin(this.backendDomain);
        this.addTrustedOrigin(this.frontendDomain);
        
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
// MESSAGE BUS - CENTRALIZED COMMUNICATION
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
// RELIABILITY ENGINE - ACK/RETRY WITH EXPONENTIAL BACKOFF
// =============================================
const ReliabilityEngine = {
    messageQueue: [],
    retryQueue: new Map(),
    pendingAcks: new Map(),
    maxRetries: IframeEnvironment.getConfig().maxRetries,
    baseDelay: 1000,
    maxDelay: 30000,
    jitter: true,
    backoffType: IframeEnvironment.getConfig().retryBackoff,
    processing: false,
    stats: {
        sent: 0,
        received: 0,
        retried: 0,
        failed: 0,
        timedout: 0,
        queued: 0
    },
    
    initialize() {
        return this;
    },
    
    send(message, options = {}) {
        return new Promise((resolve, reject) => {
            const messageId = message.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            
            const enhancedMessage = {
                ...message,
                messageId,
                timestamp: Date.now(),
                retryCount: 0,
                maxRetries: options.maxRetries || this.maxRetries,
                requiresAck: options.requiresAck !== false,
                timeout: options.timeout || 10000,
                priority: options.priority || 'normal'
            };
            
            this.stats.sent++;
            
            if (enhancedMessage.requiresAck) {
                const timer = setTimeout(() => {
                    if (this.pendingAcks.has(messageId)) {
                        const handler = this.pendingAcks.get(messageId);
                        
                        if (enhancedMessage.retryCount < enhancedMessage.maxRetries) {
                            this.retry(messageId, enhancedMessage, handler);
                        } else {
                            this.stats.timedout++;
                            handler.reject(new Error('ACK timeout'));
                            this.pendingAcks.delete(messageId);
                        }
                    }
                }, enhancedMessage.timeout);
                
                this.pendingAcks.set(messageId, {
                    resolve,
                    reject,
                    timer,
                    message: enhancedMessage,
                    startTime: Date.now()
                });
            }
            
            try {
                if (typeof window.parent !== 'undefined' && window.parent !== window) {
                    window.parent.postMessage(enhancedMessage, '*');
                    
                    if (!enhancedMessage.requiresAck) {
                        resolve({ success: true, messageId });
                    }
                } else {
                    this.queueMessage(enhancedMessage, resolve, reject);
                }
            } catch (error) {
                if (enhancedMessage.retryCount < enhancedMessage.maxRetries) {
                    this.queueForRetry(enhancedMessage, resolve, reject);
                } else {
                    this.stats.failed++;
                    reject(error);
                }
            }
        });
    },
    
    queueMessage(message, resolve, reject) {
        this.messageQueue.push({ message, resolve, reject, timestamp: Date.now() });
        this.stats.queued++;
        
        if (!this.processing) {
            this.processQueue();
        }
    },
    
    async processQueue() {
        if (this.processing || this.messageQueue.length === 0) return;
        
        this.processing = true;
        
        while (this.messageQueue.length > 0) {
            const item = this.messageQueue.shift();
            
            // Remove expired items (older than 5 minutes)
            if (Date.now() - item.timestamp > 300000) {
                item.reject(new Error('Message expired in queue'));
                continue;
            }
            
            try {
                const result = await this.send(item.message, { requiresAck: true });
                item.resolve(result);
            } catch (error) {
                item.reject(error);
            }
            
            // Small delay between messages
            await new Promise(r => setTimeout(r, 10));
        }
        
        this.processing = false;
    },
    
    queueForRetry(message, resolve, reject) {
        const retryId = `retry_${message.messageId}_${Date.now()}`;
        
        const retryItem = {
            message,
            resolve,
            reject,
            attempt: message.retryCount + 1,
            timestamp: Date.now()
        };
        
        this.retryQueue.set(retryId, retryItem);
        
        const delay = this.calculateDelay(message.retryCount);
        
        setTimeout(() => {
            this.processRetry(retryId);
        }, delay);
        
        this.stats.retried++;
    },
    
    calculateDelay(attempt) {
        let delay;
        
        if (this.backoffType === 'exponential') {
            delay = Math.min(this.baseDelay * Math.pow(2, attempt), this.maxDelay);
        } else if (this.backoffType === 'fibonacci') {
            const fib = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
            delay = Math.min(this.baseDelay * fib[Math.min(attempt, fib.length - 1)], this.maxDelay);
        } else {
            delay = Math.min(this.baseDelay * (attempt + 1), this.maxDelay);
        }
        
        if (this.jitter) {
            const jitterFactor = 0.1 + (Math.random() * 0.3);
            delay = Math.floor(delay * (1 + jitterFactor));
        }
        
        return delay;
    },
    
    processRetry(retryId) {
        const item = this.retryQueue.get(retryId);
        if (!item) return;
        
        this.retryQueue.delete(retryId);
        
        item.message.retryCount = item.attempt;
        
        this.send(item.message, { requiresAck: true })
            .then(item.resolve)
            .catch(item.reject);
    },
    
    handleAck(messageId) {
        const handler = this.pendingAcks.get(messageId);
        if (handler) {
            clearTimeout(handler.timer);
            handler.resolve({ success: true, messageId, ack: true });
            this.pendingAcks.delete(messageId);
            this.stats.received++;
        }
    },
    
    getStats() {
        return { ...this.stats, pendingAcks: this.pendingAcks.size, retryQueue: this.retryQueue.size };
    },
    
    reset() {
        this.messageQueue = [];
        this.retryQueue.clear();
        this.pendingAcks.clear();
        this.stats = {
            sent: 0,
            received: 0,
            retried: 0,
            failed: 0,
            timedout: 0,
            queued: 0
        };
    }
}.initialize();

// =============================================
// MESSAGE TYPES - ENHANCED
// =============================================
const MESSAGE_TYPES = {
    READY: 'STATUS_READY',
    ACK: 'STATUS_ACK',
    SESSION: 'STATUS_SESSION',
    SESSION_DATA: 'SESSION_DATA',
    DATA: 'STATUS_DATA',
    ERROR: 'STATUS_ERROR',
    HEARTBEAT: 'STATUS_HEARTBEAT',
    STATUS: 'STATUS_UPDATE',
    REQUEST_SESSION: 'STATUS_REQUEST_SESSION',
    CHILD_LOADED: 'STATUS_CHILD_LOADED',
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
    PARENT_READY: 'PARENT_READY',
    CHILD_READY: 'CHILD_READY',
    HANDSHAKE_ACK: 'HANDSHAKE_ACK',
    SESSION_SYNC: 'SESSION_SYNC',
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
    HIGHLIGHT_REMOVE_STATUS: 'HIGHLIGHT_REMOVE_STATUS'
};

// =============================================
// RECOVERY MANAGER - SYSTEM RESILIENCE
// =============================================
const RecoveryManager = {
    recoveryAttempts: 0,
    maxRecoveryAttempts: IframeEnvironment.getConfig().maxRecoveryAttempts,
    recoveryInProgress: false,
    lastRecoveryTime: null,
    recoveryStrategies: new Map(),
    recoveryHistory: [],
    
    initialize() {
        this.registerStrategies();
        return this;
    },
    
    registerStrategies() {
        this.recoveryStrategies.set('handshake', this.recoverHandshake.bind(this));
        this.recoveryStrategies.set('session', this.recoverSession.bind(this));
        this.recoveryStrategies.set('connection', this.recoverConnection.bind(this));
        this.recoveryStrategies.set('token', this.recoverToken.bind(this));
        this.recoveryStrategies.set('storage', this.recoverStorage.bind(this));
        this.recoveryStrategies.set('ui', this.recoverUI.bind(this));
        this.recoveryStrategies.set('parent', this.recoverParent.bind(this));
    },
    
    async recover(problem, context = {}) {
        if (this.recoveryInProgress) {
            return { success: false, reason: 'Recovery already in progress' };
        }
        
        if (!StartupGovernor.shouldAttemptRecovery()) {
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
            
            if (result.success) {
                StartupGovernor.recoverySucceeded();
            } else {
                StartupGovernor.recoveryFailed();
            }
            
            this.recoveryInProgress = false;
            return result;
        } catch (error) {
            this.recoveryInProgress = false;
            StartupGovernor.recoveryFailed();
            
            return { success: false, error: error.message };
        }
    },
    
    async recoverHandshake(context) {
        StartupGovernor.recover();
        
        if (typeof state !== 'undefined') {
            state.handshakeComplete = false;
            state.handshakeState = 'idle';
            state.childReadySent = false;
            state.parentReadyReceived = false;
            state.handshakeAckReceived = false;
            state.sessionSyncReceived = false;
        }
        
        await new Promise(r => setTimeout(r, 1000));
        
        try {
            if (typeof HandshakeClient !== 'undefined' && HandshakeClient.execute) {
                const result = await HandshakeClient.execute({ 
                    maxRetries: 3,
                    force: true 
                });
                
                if (result && result.success) {
                    StartupGovernor.activate();
                    return { success: true };
                }
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
        
        return { success: false };
    },
    
    async recoverSession(context) {
        try {
            if (typeof sendToParent !== 'undefined') {
                const response = await sendToParent(MESSAGE_TYPES.REQUEST_SESSION, {
                    timestamp: Date.now(),
                    frameId: IframeAuthority.id,
                    force: true
                }, { requiresAck: true, timeout: 10000 });
                
                if (response && response.payload && response.payload.session) {
                    if (typeof updateSessionMirror !== 'undefined') {
                        updateSessionMirror(response.payload.session, 'recovery');
                    }
                    return { success: true };
                }
            }
        } catch (error) {}
        
        // Try to load from cache
        if (typeof SafeStorage !== 'undefined') {
            const cached = SafeStorage.getJSON('session_cache');
            if (cached) {
                if (typeof updateSessionMirror !== 'undefined') {
                    updateSessionMirror(cached, 'cache');
                }
                return { success: true, cached: true };
            }
        }
        
        return { success: false };
    },
    
    async recoverConnection(context) {
        try {
            if (typeof TransportAgent !== 'undefined') {
                if (TransportAgent.stopHeartbeat) TransportAgent.stopHeartbeat();
                await new Promise(r => setTimeout(r, 2000));
                if (TransportAgent.startHeartbeat) TransportAgent.startHeartbeat();
            }
            
            if (typeof sendToParent !== 'undefined') {
                await sendToParent('PING', {
                    timestamp: Date.now(),
                    frameId: IframeAuthority.id
                }, { requiresAck: true, timeout: 5000 });
                
                return { success: true };
            }
        } catch (error) {}
        
        return { success: false };
    },
    
    async recoverToken(context) {
        if (typeof state === 'undefined' || !state.sessionMirror?.refreshToken) {
            return { success: false, reason: 'No refresh token' };
        }
        
        try {
            if (typeof sendToParent !== 'undefined') {
                const response = await sendToParent(MESSAGE_TYPES.TOKEN_REFRESH, {
                    timestamp: Date.now(),
                    refreshToken: state.sessionMirror.refreshToken
                }, { requiresAck: true, timeout: 10000 });
                
                if (response && response.payload && response.payload.token) {
                    state.token = response.payload.token;
                    state.sessionMirror.token = response.payload.token;
                    state.sessionMirror.lastRefresh = Date.now();
                    
                    if (response.payload.refreshToken) {
                        state.sessionMirror.refreshToken = response.payload.refreshToken;
                    }
                    
                    SafeStorage.set(UNIFIED_TOKEN_KEY, state.token);
                    
                    return { success: true };
                }
            }
        } catch (error) {}
        
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
    
    async recoverParent(context) {
        try {
            if (typeof window.parent !== 'undefined' && window.parent !== window) {
                IframeAuthority.detectParent();
                
                if (IframeAuthority.parentDetected) {
                    return { success: true };
                }
            }
        } catch (error) {}
        
        return { success: false };
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
// IFRAME HANDSHAKE AUTHORITY - SINGLE HANDSHAKE CONTROLLER
// =============================================
const IframeHandshakeAuthority = {
    status: 'idle', // idle, in-progress, complete, failed
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
    
    initialize() {
        this.reset();
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
        
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    },
    
    async execute(options = {}) {
        // Check if already in progress
        if (this.handshakeInProgress) {
            return this.handshakePromise;
        }
        
        // Check if already complete
        if (typeof state !== 'undefined' && state.handshakeComplete) {
            return { success: true, cached: true };
        }
        
        // Check if we should start
        if (!StartupGovernor.canInitialize()) {
            return { success: false, reason: 'Governor blocked' };
        }
        
        // Acquire lock
        if (this.handshakeLock) {
            return { success: false, reason: 'Lock acquired by another instance' };
        }
        
        this.handshakeLock = true;
        
        this.reset();
        this.status = 'in-progress';
        this.handshakeId = `handshake_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
        this.startTime = Date.now();
        this.maxRetries = options.maxRetries || this.maxRetries;
        this.handshakeInProgress = true;
        
        if (typeof state !== 'undefined') {
            state.handshakeId = this.handshakeId;
            state.handshakeState = 'handshake_started';
            state.handshakeStartTime = Date.now();
        }
        
        this.handshakePromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            this.startHandshakeSequence();
        });
        
        return this.handshakePromise;
    },
    
    async startHandshakeSequence() {
        try {
            // Step 1: Send CHILD_READY
            await this.sendChildReady();
            
            // Step 2: Wait for PARENT_READY
            await this.waitForParentReady();
            
            // Step 3: Send HANDSHAKE_REQUEST
            await this.sendHandshakeRequest();
            
            // Step 4: Wait for HANDSHAKE_ACK
            await this.waitForHandshakeAck();
            
            // Step 5: Request SESSION_SYNC
            await this.requestSessionSync();
            
            // Step 6: Wait for SESSION_SYNC
            await this.waitForSessionSync();
            
            // Step 7: Negotiate capabilities
            await this.negotiateCapabilities();
            
            // Step 8: Validate origin
            if (!IframeAuthority.compatibilityMode) {
                await this.validateOrigin();
            }
            
            // Step 9: Complete handshake
            this.completeHandshake();
            
        } catch (error) {
            this.handleHandshakeError(error);
        } finally {
            this.handshakeLock = false;
            this.handshakeInProgress = false;
        }
    },
    
    async sendChildReady() {
        const payload = {
            frameId: IframeAuthority.id,
            instanceId: IframeAuthority.instanceId,
            timestamp: Date.now(),
            protocolVersion: '5.0',
            module: 'status',
            environment: IframeEnvironment.type,
            capabilities: IframeEnvironment.getCapabilities(),
            userAgent: navigator.userAgent,
            screenSize: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            connection: {
                online: navigator.onLine,
                type: IframeEnvironment.connectionType,
                latency: IframeEnvironment.latency,
                effectiveType: IframeEnvironment.effectiveType
            },
            handshakeId: this.handshakeId
        };
        
        try {
            if (typeof sendToParent !== 'undefined') {
                await sendToParent(MESSAGE_TYPES.CHILD_READY, payload, {
                    requiresAck: true,
                    timeout: IframeEnvironment.isVPNNetwork ? 10000 : 5000,
                    retry: true,
                    messageId: this.handshakeId + '_child_ready'
                });
                
                this.childReadySent = true;
                
                if (typeof state !== 'undefined') {
                    state.childReadySent = true;
                    state.handshakeState = 'child_ready_sent';
                }
            }
        } catch (error) {}
    },
    
    waitForParentReady() {
        return new Promise((resolve) => {
            if (this.parentReadyReceived) {
                resolve();
                return;
            }
            
            const timeout = setTimeout(() => {
                if (!this.parentReadyReceived) {
                    resolve();
                }
            }, IframeEnvironment.isVPNNetwork ? 6000 : 3000);
            
            const handler = (message) => {
                if (message.type === MESSAGE_TYPES.PARENT_READY) {
                    clearTimeout(timeout);
                    
                    if (typeof MessageBus !== 'undefined') {
                        MessageBus.removeMessageHandler(MESSAGE_TYPES.PARENT_READY, handler);
                    }
                    
                    this.parentReadyReceived = true;
                    
                    if (typeof StartupGovernor !== 'undefined') {
                        StartupGovernor.parentReadyReceived = true;
                    }
                    
                    if (typeof state !== 'undefined') {
                        state.parentReadyReceived = true;
                        state.handshakeState = 'parent_ready_received';
                    }
                    
                    resolve();
                }
            };
            
            if (typeof MessageBus !== 'undefined') {
                MessageBus.addMessageHandler(MESSAGE_TYPES.PARENT_READY, handler);
            }
        });
    },
    
    async sendHandshakeRequest() {
        const payload = {
            messageId: this.handshakeId,
            timestamp: Date.now(),
            protocolVersion: '5.0',
            module: 'status',
            frameId: IframeAuthority.id,
            instanceId: IframeAuthority.instanceId,
            environment: IframeEnvironment.type,
            session: {
                cached: typeof state !== 'undefined' && state.sessionMirror?.validated || false,
                token: typeof state !== 'undefined' && state.sessionMirror?.token ? 'present' : 'none',
                timestamp: typeof state !== 'undefined' ? state.sessionMirror?.timestamp : 0
            },
            capabilities: IframeEnvironment.getCapabilities(),
            security: {
                signatureRequired: IframeEnvironment.type === 'PRODUCTION',
                originValidation: true
            },
            handshakeId: this.handshakeId
        };
        
        try {
            if (typeof sendToParent !== 'undefined') {
                const response = await sendToParent(MESSAGE_TYPES.HANDSHAKE_REQUEST, payload, {
                    requiresAck: true,
                    timeout: IframeEnvironment.isVPNNetwork ? 10000 : 5000,
                    messageId: this.handshakeId,
                    retry: true
                });
                
                if (typeof state !== 'undefined') {
                    state.handshakeState = 'handshake_sent';
                }
                
                return response;
            }
        } catch (error) {
            throw error;
        }
    },
    
    waitForHandshakeAck() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!this.handshakeAckReceived) {
                    if (this.retries > 0) {
                        reject(new Error('HANDSHAKE_ACK timeout'));
                    } else {
                        resolve();
                    }
                }
            }, IframeEnvironment.isVPNNetwork ? 10000 : 5000);
            
            const handler = (message) => {
                if (message.type === MESSAGE_TYPES.HANDSHAKE_ACK && 
                    (message.inResponseTo === this.handshakeId || message.payload?.inResponseTo === this.handshakeId)) {
                    
                    clearTimeout(timeout);
                    
                    if (typeof MessageBus !== 'undefined') {
                        MessageBus.removeMessageHandler(MESSAGE_TYPES.HANDSHAKE_ACK, handler);
                    }
                    
                    this.handshakeAckReceived = true;
                    
                    if (typeof state !== 'undefined') {
                        state.handshakeAckReceived = true;
                        state.handshakeState = 'handshake_acked';
                    }
                    
                    // Process any session data in the ACK
                    if (message.payload && message.payload.session) {
                        if (typeof updateSessionMirror !== 'undefined') {
                            updateSessionMirror(message.payload.session, 'handshake_ack');
                        }
                    }
                    
                    resolve();
                }
            };
            
            if (typeof MessageBus !== 'undefined') {
                MessageBus.addMessageHandler(MESSAGE_TYPES.HANDSHAKE_ACK, handler);
            }
        });
    },
    
    async requestSessionSync() {
        const payload = {
            messageId: this.handshakeId + '_session',
            timestamp: Date.now(),
            frameId: IframeAuthority.id,
            instanceId: IframeAuthority.instanceId,
            cached: typeof state !== 'undefined' && state.sessionMirror?.validated || false,
            capabilities: IframeEnvironment.getCapabilities(),
            handshakeId: this.handshakeId
        };
        
        try {
            if (typeof sendToParent !== 'undefined') {
                await sendToParent(MESSAGE_TYPES.SESSION_SYNC, payload, {
                    requiresAck: true,
                    timeout: IframeEnvironment.isVPNNetwork ? 10000 : 5000,
                    messageId: this.handshakeId + '_session',
                    retry: true
                });
                
                if (typeof state !== 'undefined') {
                    state.handshakeState = 'session_requested';
                }
            }
        } catch (error) {}
    },
    
    waitForSessionSync() {
        return new Promise((resolve) => {
            if (this.sessionSyncReceived) {
                resolve();
                return;
            }
            
            const timeout = setTimeout(() => {
                if (!this.sessionSyncReceived) {
                    // If we have cached session, continue
                    if (typeof state !== 'undefined' && state.sessionMirror?.validated) {
                        if (typeof activateSessionFromMirror !== 'undefined') {
                            activateSessionFromMirror();
                        }
                        resolve();
                    } else {
                        // Enable guest mode and continue
                        if (typeof enableGuestMode !== 'undefined') {
                            enableGuestMode();
                        }
                        resolve();
                    }
                }
            }, IframeEnvironment.isVPNNetwork ? 10000 : 5000);
            
            const handler = (message) => {
                if (message.type === MESSAGE_TYPES.SESSION_SYNC) {
                    clearTimeout(timeout);
                    
                    if (typeof MessageBus !== 'undefined') {
                        MessageBus.removeMessageHandler(MESSAGE_TYPES.SESSION_SYNC, handler);
                    }
                    
                    this.sessionSyncReceived = true;
                    
                    if (typeof state !== 'undefined') {
                        state.sessionSyncReceived = true;
                    }
                    
                    // Process session data
                    if (message.payload) {
                        if (typeof updateSessionMirror !== 'undefined') {
                            updateSessionMirror(message.payload, 'session_sync');
                        }
                    }
                    
                    resolve();
                }
            };
            
            if (typeof MessageBus !== 'undefined') {
                MessageBus.addMessageHandler(MESSAGE_TYPES.SESSION_SYNC, handler);
            }
        });
    },
    
    async negotiateCapabilities() {
        const payload = {
            messageId: this.handshakeId + '_capabilities',
            timestamp: Date.now(),
            frameId: IframeAuthority.id,
            capabilities: Object.keys(IframeEnvironment.getCapabilities()),
            required: ['session', 'heartbeat', 'retry', 'storage']
        };
        
        try {
            if (typeof sendToParent !== 'undefined') {
                const response = await sendToParent(MESSAGE_TYPES.CAPABILITY_REQUEST, payload, {
                    requiresAck: true,
                    timeout: IframeEnvironment.isVPNNetwork ? 6000 : 3000,
                    messageId: this.handshakeId + '_capabilities'
                });
                
                if (response && response.payload && response.payload.capabilities) {
                    response.payload.capabilities.forEach(cap => {
                        if (typeof IframeAuthority !== 'undefined') {
                            IframeAuthority.parentCapabilities.add(cap);
                        }
                    });
                }
            }
        } catch (error) {}
    },
    
    async validateOrigin() {
        if (typeof state !== 'undefined' && state.securityContext?.originValidated) {
            return;
        }
        
        const payload = {
            messageId: this.handshakeId + '_origin',
            timestamp: Date.now(),
            frameId: IframeAuthority.id,
            origin: window.location.origin,
            instanceId: IframeAuthority.instanceId,
            backendDomain: IframeAuthority.backendDomain,
            frontendDomain: IframeAuthority.frontendDomain
        };
        
        try {
            if (typeof sendToParent !== 'undefined') {
                const response = await sendToParent(MESSAGE_TYPES.ORIGIN_VALIDATION, payload, {
                    requiresAck: true,
                    timeout: 3000,
                    messageId: this.handshakeId + '_origin'
                });
                
                if (response && response.payload && response.payload.valid) {
                    if (typeof state !== 'undefined') {
                        state.securityContext.originValidated = true;
                    }
                }
            }
        } catch (error) {}
    },
    
    completeHandshake() {
        this.status = 'complete';
        this.endTime = Date.now();
        
        if (typeof state !== 'undefined') {
            state.handshakeComplete = true;
            state.handshakeState = 'active';
            state.handshakeEndTime = Date.now();
            state.metrics.lastHandshake = Date.now();
            state.handshakeRetries = 0;
        }
        
        if (typeof StartupGovernor !== 'undefined') {
            StartupGovernor.completeHandshake();
            StartupGovernor.activate();
        }
        
        if (this.resolve) {
            this.resolve({ 
                success: true, 
                session: typeof getSessionMirror !== 'undefined' ? getSessionMirror() : null,
                protocolVersion: '5.0',
                capabilities: typeof IframeAuthority !== 'undefined' ? Array.from(IframeAuthority.parentCapabilities) : []
            });
        }
        
        // Send completion acknowledgment
        if (typeof sendToParent !== 'undefined') {
            sendToParent(MESSAGE_TYPES.ACK, {
                inResponseTo: this.handshakeId,
                status: 'success',
                timestamp: Date.now(),
                frameId: IframeAuthority.id
            }, { requiresAck: false, silent: true });
        }
        
        // Start heartbeat
        if (typeof startEnhancedHeartbeat !== 'undefined') {
            startEnhancedHeartbeat();
        }
        
        // Request configuration
        if (typeof requestParentConfig !== 'undefined') {
            requestParentConfig();
        }
    },
    
    handleHandshakeError(error) {
        this.retries++;
        this.status = 'failed';
        
        if (typeof state !== 'undefined') {
            state.metrics.handshakeFailures++;
        }
        
        if (typeof StartupGovernor !== 'undefined') {
            StartupGovernor.incrementRetry();
        }
        
        if (this.retries < this.maxRetries) {
            // Retry with exponential backoff
            const baseDelay = IframeEnvironment.isVPNNetwork ? 2000 : 1000;
            const delay = Math.min(baseDelay * Math.pow(2, this.retries - 1), 10000);
            
            setTimeout(() => {
                this.startHandshakeSequence();
            }, delay);
        } else {
            // Max retries exceeded, enable guest mode
            
            if (typeof state !== 'undefined' && state.sessionMirror?.validated) {
                if (typeof activateSessionFromMirror !== 'undefined') {
                    activateSessionFromMirror();
                }
            } else {
                if (typeof enableGuestMode !== 'undefined') {
                    enableGuestMode();
                }
            }
            
            if (typeof state !== 'undefined') {
                state.handshakeComplete = true;
                state.handshakeState = 'active_fallback';
            }
            
            if (typeof StartupGovernor !== 'undefined') {
                StartupGovernor.degrade('Handshake failed, using fallback');
            }
            
            if (this.reject) {
                this.reject(error);
            }
            
            // Attempt recovery
            if (typeof RecoveryManager !== 'undefined' && RecoveryManager.canRecover()) {
                RecoveryManager.recover('handshake', { error });
            }
        }
    }
}.initialize();

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
    
    // Retry queue with backoff
    retryQueue: [],
    retryTimers: new Map(),
    maxRetryAttempts: IframeEnvironment.getConfig().maxRetries,
    baseRetryDelay: 1000,
    maxRetryDelay: 30000,
    
    // Offline buffer
    offlineBuffer: [],
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    offlineModeEnabled: false,
    
    // Heartbeat tracking
    heartbeatInterval: null,
    lastHeartbeatSent: null,
    lastHeartbeatReceived: null,
    heartbeatMissed: 0,
    maxMissedHeartbeats: 3,
    
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
        successfulRecoveries: 0
    },
    
    handshakeId: null,
    handshakePromise: null,
    handshakeResolve: null,
    handshakeReject: null,
    handshakeTimer: null,
    handshakeRetries: 0,
    maxHandshakeRetries: IframeEnvironment.getConfig().maxRetries,
    
    protocolVersion: '5.0',
    parentProtocolVersion: null,
    
    diagnosticsEnabled: false,
    diagnosticData: []
};

// =============================================
// IFRAME TRANSPORT - CENTRALIZED COMMUNICATION LAYER
// =============================================
const IframeTransport = {
    version: '5.0',
    messageQueue: [],
    isProcessing: false,
    retryQueue: new Map(),
    maxRetries: IframeEnvironment.getConfig().maxRetries,
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
    
    initialize() {
        return this;
    },
    
    send(type, payload = {}, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                if (!IframeAuthority.parentDetected && !options.bypassParentCheck) {
                    if (options.offlineQueue) {
                        this.queueOffline(type, payload, options, resolve, reject);
                    } else {
                        reject(new Error('Parent not detected'));
                    }
                    return;
                }
                
                const messageId = `msg_${Date.now()}_${++this.messageCounter}_${Math.random().toString(36).substr(2, 6)}`;
                const timestamp = Date.now();
                
                const message = {
                    protocol: options.protocol || 'KYN-5.0',
                    version: this.version,
                    messageId,
                    type,
                    source: 'iframe',
                    target: options.target || 'parent',
                    frameId: IframeAuthority.id,
                    instanceId: IframeAuthority.instanceId,
                    timestamp,
                    payload: this.sanitizePayload(payload),
                    requiresAck: options.requiresAck !== false,
                    retryCount: options.retryCount || 0,
                    maxRetries: options.maxRetries || this.maxRetries,
                    priority: options.priority || 'normal',
                    ...options
                };
                
                if (options.includeToken !== false && typeof state !== 'undefined' && state.token) {
                    message.token = state.token;
                }
                
                if (options.legacy || CompatibilityBridge.isLegacy()) {
                    message.legacy = true;
                }
                
                if (message.requiresAck) {
                    const timeout = options.timeout || (IframeEnvironment.isVPNNetwork ? 15000 : 10000);
                    
                    const timer = setTimeout(() => {
                        if (this.pendingAcks.has(messageId)) {
                            const handler = this.pendingAcks.get(messageId);
                            
                            if (message.retryCount < message.maxRetries) {
                                this.retryMessage(message, options, handler);
                            } else {
                                handler.reject(new Error('ACK timeout'));
                                this.pendingAcks.delete(messageId);
                            }
                        }
                    }, timeout);
                    
                    this.pendingAcks.set(messageId, {
                        resolve,
                        reject,
                        timer,
                        timestamp,
                        message,
                        startTime: Date.now()
                    });
                }
                
                // Send via postMessage
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage(message, '*');
                    DiagnosticsAgent.increment('messagesSent');
                    
                    if (!message.requiresAck) {
                        resolve({ success: true, messageId });
                    }
                } else {
                    this.queueOffline(type, payload, options, resolve, reject);
                }
                
                this.cleanupPendingAcks();
                
            } catch (error) {
                if (options.retry !== false) {
                    this.retryMessage({ type, payload, options }, options, { reject });
                } else {
                    reject(error);
                }
            }
        });
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
    },
    
    retryMessage(message, options, handler) {
        const retryId = `retry_${message.messageId || Date.now()}_${message.retryCount || 0}`;
        const retryCount = (message.retryCount || 0) + 1;
        
        const retryItem = {
            message,
            options,
            handler,
            retryCount,
            timestamp: Date.now()
        };
        
        this.retryQueue.set(retryId, retryItem);
        
        const delay = this.calculateRetryDelay(retryCount);
        
        setTimeout(() => {
            this.processRetry(retryId);
        }, delay);
    },
    
    calculateRetryDelay(attempt) {
        const baseDelay = IframeEnvironment.isVPNNetwork ? 2000 : 1000;
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), this.maxRetryDelay);
        
        // Add jitter
        const jitter = Math.random() * 200;
        return delay + jitter;
    },
    
    processRetry(retryId) {
        const item = this.retryQueue.get(retryId);
        if (!item) return;
        
        this.retryQueue.delete(retryId);
        
        const message = {
            ...item.message,
            retryCount: item.retryCount
        };
        
        this.send(message.type, message.payload, {
            ...item.options,
            retry: false,
            requiresAck: true,
            timeout: IframeEnvironment.isVPNNetwork ? 15000 : 10000
        })
        .then(item.handler?.resolve || (() => {}))
        .catch(item.handler?.reject || (() => {}));
    },
    
    handleAck(messageId) {
        const handler = this.pendingAcks.get(messageId);
        if (handler) {
            clearTimeout(handler.timer);
            handler.resolve({ success: true, messageId, ack: true });
            this.pendingAcks.delete(messageId);
        }
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
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, IframeEnvironment.getConfig().heartbeatInterval || 30000);
    },
    
    async sendHeartbeat() {
        if (!IframeAuthority.parentDetected) return;
        
        this.lastHeartbeatSent = Date.now();
        
        try {
            await this.send('PING', {
                timestamp: this.lastHeartbeatSent,
                frameId: IframeAuthority.id,
                instanceId: IframeAuthority.instanceId,
                state: typeof StartupGovernor !== 'undefined' ? StartupGovernor.state : 'unknown',
                queueSize: this.messageQueue.length,
                offlineBuffer: this.offlineBuffer.length,
                metrics: {
                    messagesSent: DiagnosticsAgent.metrics.messagesSent,
                    errors: DiagnosticsAgent.metrics.errors
                }
            }, { requiresAck: false, silent: true });
            
            // Check for missed heartbeats
            if (this.lastHeartbeatReceived) {
                const timeSinceResponse = Date.now() - this.lastHeartbeatReceived;
                if (timeSinceResponse > IframeEnvironment.getConfig().heartbeatInterval * 2) {
                    this.heartbeatMissed++;
                    
                    if (this.heartbeatMissed >= this.maxMissedHeartbeats) {
                        this.connectionStatus = 'degraded';
                        
                        if (typeof StartupGovernor !== 'undefined') {
                            StartupGovernor.degrade('Heartbeat missed');
                        }
                        
                        // Attempt recovery
                        if (typeof RecoveryManager !== 'undefined') {
                            RecoveryManager.recover('connection');
                        }
                    }
                }
            }
        } catch (e) {}
    },
    
    handlePong() {
        this.lastHeartbeatReceived = Date.now();
        this.heartbeatMissed = 0;
        this.connectionStatus = 'connected';
    },
    
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    },
    
    async processOfflineQueue() {
        if (this.offlineBuffer.length === 0 || !IframeAuthority.parentDetected) return;
        
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
// NAVIGATION GUARD - PROTECTS PAGE TRANSITIONS
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
// ERROR BOUNDARY SYSTEM
// =============================================
function createErrorBoundary(fn, featureName, fallback = null) {
    return async function(...args) {
        if (typeof state !== 'undefined' && state.disabledFeatures?.has(featureName)) {
            return typeof fallback === 'function' ? fallback(...args) : fallback;
        }

        try {
            return await fn(...args);
        } catch (error) {
            DiagnosticsAgent.error('ErrorBoundary', `${featureName}: ${error.message}`, error);
            
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
// CIRCUIT BREAKER
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
    },
    
    recordSuccess(service) {
        this.failures[service] = 0;
    }
};

function isCircuitOpen(service) {
    return CIRCUIT_BREAKER.isOpen(service);
}

// =============================================
// MESSAGE FIREWALL & PARSER
// =============================================
const MessageFirewall = {
    validators: new Map(),
    replayCache: new Set(),
    maxCacheSize: 1000,
    sequenceTracker: new Map(),
    
    init() {
        this.registerValidators();
        return this;
    },
    
    registerValidators() {
        this.validators.set('SESSION_DATA', (msg) => {
            return msg.payload && 
                   (msg.payload.token || msg.payload.user) &&
                   (!msg.payload.token || typeof msg.payload.token === 'string') &&
                   (!msg.payload.user || (msg.payload.user.id && msg.payload.user.displayName));
        });
        
        this.validators.set('HANDSHAKE_REQUEST', (msg) => {
            return msg.payload && 
                   msg.payload.messageId &&
                   msg.payload.protocolVersion;
        });
        
        this.validators.set('HANDSHAKE_RESPONSE', (msg) => {
            return msg.payload && 
                   msg.payload.messageId &&
                   msg.payload.session;
        });
        
        this.validators.set('STATUS_ACK', (msg) => {
            return msg.inResponseTo || msg.payload?.inResponseTo;
        });
        
        this.validators.set('STATUS_READY', (msg) => {
            return msg.payload && msg.payload.module === 'status';
        });
        
        this.validators.set('API_REQUEST', (msg) => {
            return msg.payload && msg.payload.requestId && msg.payload.endpoint;
        });
        
        this.validators.set('API_RESPONSE', (msg) => {
            return msg.payload && msg.payload.requestId;
        });
        
        this.validators.set('API_ERROR', (msg) => {
            return msg.payload && msg.payload.requestId;
        });
        
        this.validators.set('PARENT_READY', (msg) => {
            return msg.payload && msg.payload.timestamp;
        });
        
        this.validators.set('CHILD_READY', (msg) => {
            return msg.payload && msg.payload.frameId && msg.payload.instanceId;
        });
        
        this.validators.set('HANDSHAKE_ACK', (msg) => {
            return msg.inResponseTo || msg.payload?.inResponseTo;
        });
        
        this.validators.set('SESSION_SYNC', (msg) => {
            return msg.payload && 
                   (msg.payload.sessionId || msg.payload.token || msg.payload.user);
        });
        
        this.validators.set('SESSION_ACK', (msg) => {
            return msg.inResponseTo || msg.payload?.inResponseTo;
        });
        
        this.validators.set('PING', (msg) => {
            return msg.payload && msg.payload.timestamp;
        });
        
        this.validators.set('PONG', (msg) => {
            return msg.inResponseTo || msg.payload?.inResponseTo;
        });
        
        this.validators.set('PAGE_ACTIVATED', (msg) => {
            return msg.payload && msg.payload.timestamp;
        });
        
        this.validators.set('NAVIGATE', (msg) => {
            return msg.payload && msg.payload.path;
        });
        
        this.validators.set('CAPABILITY_RESPONSE', (msg) => {
            return msg.payload && Array.isArray(msg.payload.capabilities);
        });
        
        this.validators.set('TOKEN_REFRESH_RESPONSE', (msg) => {
            return msg.payload && (msg.payload.token || msg.payload.error);
        });
        
        this.validators.set('ORIGIN_VALIDATION_RESPONSE', (msg) => {
            return msg.payload && msg.payload.valid !== undefined;
        });
        
        this.validators.set('CONFIG_RESPONSE', (msg) => {
            return msg.payload && msg.payload.config;
        });
        
        this.validators.set('RECOVERY_RESPONSE', (msg) => {
            return msg.payload && msg.payload.success !== undefined;
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
                return false;
            }
            
            // Required fields
            if (!message.type) {
                return false;
            }
            
            // Replay protection
            if (message.messageId || message.id) {
                const msgId = message.messageId || message.id;
                const cacheKey = `${origin}:${msgId}`;
                
                if (this.replayCache.has(cacheKey) && state.securityContext.replayProtection) {
                    return false;
                }
                
                this.replayCache.add(cacheKey);
                if (this.replayCache.size > this.maxCacheSize) {
                    const first = this.replayCache.values().next().value;
                    this.replayCache.delete(first);
                }
            }
            
            // Sequence validation
            if (message.sequence && state.securityContext.replayProtection) {
                const sourceKey = `${origin}:${message.source || 'unknown'}`;
                const lastSequence = this.sequenceTracker.get(sourceKey) || 0;
                
                if (message.sequence <= lastSequence) {
                    return false;
                }
                
                this.sequenceTracker.set(sourceKey, message.sequence);
            }
            
            // Timestamp validation
            if (message.timestamp && state.securityContext.timestampTolerance > 0) {
                const now = Date.now();
                const tolerance = state.securityContext.timestampTolerance;
                
                if (Math.abs(now - message.timestamp) > tolerance) {
                    if (!IframeAuthority.compatibilityMode) {
                        return false;
                    }
                }
            }
            
            // Schema validation
            const validator = this.validators.get(message.type);
            if (validator && !validator(message) && !IframeAuthority.compatibilityMode) {
                return false;
            }
            
            return true;
        } catch (e) {
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
// MESSAGE ID GENERATOR
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
// ORIGIN VALIDATION & SECURITY
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

function signMessage(message) {
    const signed = {
        ...message,
        id: generateMessageId(),
        messageId: generateMessageId(),
        timestamp: Date.now(),
        origin: window.location.origin,
        protocolVersion: state.protocolVersion,
        frameId: state.frameId,
        instanceId: state.instanceId,
        source: 'status-core',
        target: 'parent'
    };
    
    // Add signature if token available and not in compatibility mode
    if (state.token && state.securityContext.signatureRequired && !IframeAuthority.compatibilityMode) {
        try {
            const payload = JSON.stringify(signed.payload || {});
            signed.signature = btoa(`${signed.type}:${signed.timestamp}:${state.token.substring(0, 10)}:${payload.length}`);
        } catch (e) {}
    }
    
    return signed;
}

// =============================================
// CANONICAL MESSAGE FORMATTER
// =============================================
function formatCanonicalMessage(type, payload = {}, options = {}) {
    const message = {
        protocol: options.protocol || 'KYN-5.0',
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
// COMMUNICATION ENGINE - WITH ACK/RETRY
// =============================================
const messageHandlers = new Map();

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
        
        // Validate message
        if (!validateMessage(event.data, event.origin)) {
            return;
        }
        
        // Adapt legacy message if needed
        const adaptedMessage = adaptLegacyMessage(event.data);
        const message = MessageFirewall.sanitize(adaptedMessage);
        
        if (typeof state !== 'undefined') {
            state.metrics.messagesReceived++;
        }
        
        // Update parent origin
        if (typeof state !== 'undefined' && !state.securityContext.parentOrigin) {
            state.securityContext.parentOrigin = event.origin;
            OriginTrustAdapter.setParentOrigin(event.origin);
        }
        
        // Update parent protocol version
        if (message.protocolVersion) {
            if (typeof state !== 'undefined') {
                state.parentProtocolVersion = message.protocolVersion;
            }
        } else if (message.protocol) {
            if (typeof state !== 'undefined') {
                state.parentProtocolVersion = message.protocol;
            }
        }
        
        // Handle ACK messages via ReliabilityEngine
        if ((message.type === MESSAGE_TYPES.ACK || message.type === 'ACK' || message.type === MESSAGE_TYPES.HANDSHAKE_ACK) && 
            (message.inResponseTo || message.payload?.inResponseTo)) {
            const responseTo = message.inResponseTo || message.payload.inResponseTo;
            
            if (typeof IframeTransport !== 'undefined') {
                IframeTransport.handleAck(responseTo);
            }
            
            if (typeof ReliabilityEngine !== 'undefined') {
                ReliabilityEngine.handleAck(responseTo);
            }
            
            if (message.type === MESSAGE_TYPES.HANDSHAKE_ACK) {
                if (typeof state !== 'undefined') {
                    state.handshakeAckReceived = true;
                    state.handshakeState = 'handshake_acked';
                }
            }
            return;
        }
        
        // Handle PONG responses
        if (message.type === MESSAGE_TYPES.PONG) {
            if (typeof state !== 'undefined') {
                state.lastHeartbeatReceived = Date.now();
                state.heartbeatMissed = 0;
            }
            
            if (typeof IframeTransport !== 'undefined') {
                IframeTransport.handlePong();
            }
            return;
        }
        
        // Handle PAGE_ACTIVATED
        if (message.type === MESSAGE_TYPES.PAGE_ACTIVATED) {
            if (typeof state !== 'undefined') {
                state.pageActivated = true;
            }
        }
        
        // Handle PARENT_READY
        if (message.type === MESSAGE_TYPES.PARENT_READY) {
            if (typeof state !== 'undefined') {
                state.parentReadyReceived = true;
                state.handshakeState = 'parent_ready_received';
            }
            
            if (typeof StartupGovernor !== 'undefined') {
                StartupGovernor.parentReadyReceived = true;
            }
            
            // Continue handshake if not already complete
            if (typeof state !== 'undefined' && !state.handshakeComplete && 
                typeof StartupGovernor !== 'undefined' && StartupGovernor.shouldRetryHandshake()) {
                setTimeout(() => {
                    if (typeof sendHandshakeRequest !== 'undefined') {
                        sendHandshakeRequest();
                    }
                }, 100);
            }
        }
        
        // Handle SESSION_SYNC
        if (message.type === MESSAGE_TYPES.SESSION_SYNC) {
            if (typeof state !== 'undefined') {
                state.sessionSyncReceived = true;
            }
            
            const sessionData = message.payload;
            
            // Update session mirror
            if (sessionData.token || sessionData.user) {
                if (typeof updateSessionMirror !== 'undefined') {
                    updateSessionMirror(sessionData, 'session_sync');
                }
            }
            
            // Send SESSION_ACK
            if (typeof sendToParent !== 'undefined') {
                sendToParent(MESSAGE_TYPES.SESSION_ACK, {
                    inResponseTo: message.messageId,
                    status: 'success',
                    timestamp: Date.now(),
                    frameId: IframeAuthority.id
                }, { requiresAck: false, silent: true });
            }
            
            // Update handshake state
            if (typeof state !== 'undefined') {
                state.handshakeState = 'session_received';
                state.handshakeComplete = true;
                state.handshakeEndTime = Date.now();
            }
            
            if (typeof StartupGovernor !== 'undefined') {
                StartupGovernor.completeHandshake();
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
            
            // Activate
            if (typeof StartupGovernor !== 'undefined') {
                StartupGovernor.activate();
            }
        }
        
        // Handle SESSION_ACK
        if (message.type === MESSAGE_TYPES.SESSION_ACK) {
            // Silent
        }
        
        // Handle PING
        if (message.type === MESSAGE_TYPES.PING) {
            if (typeof sendToParent !== 'undefined') {
                sendToParent(MESSAGE_TYPES.PONG, {
                    inResponseTo: message.messageId,
                    timestamp: Date.now()
                }, { requiresAck: false, silent: true });
            }
        }
        
        // Handle CAPABILITY_RESPONSE
        if (message.type === MESSAGE_TYPES.CAPABILITY_RESPONSE) {
            if (message.payload && Array.isArray(message.payload.capabilities)) {
                message.payload.capabilities.forEach(cap => {
                    if (typeof state !== 'undefined' && state.parentCapabilities) {
                        state.parentCapabilities.add(cap);
                    }
                    if (typeof IframeAuthority !== 'undefined') {
                        IframeAuthority.parentCapabilities.add(cap);
                    }
                });
                
                if (typeof state !== 'undefined') {
                    state.metrics.capabilityNegotiations++;
                }
            }
        }
        
        // Handle TOKEN_REFRESH_RESPONSE
        if (message.type === MESSAGE_TYPES.TOKEN_REFRESH_RESPONSE) {
            if (message.payload && message.payload.token) {
                if (typeof state !== 'undefined') {
                    state.token = message.payload.token;
                }
                
                SafeStorage.set(UNIFIED_TOKEN_KEY, message.payload.token);
                
                if (message.payload.refreshToken && typeof state !== 'undefined') {
                    state.sessionMirror.refreshToken = message.payload.refreshToken;
                }
                
                if (typeof state !== 'undefined') {
                    state.metrics.tokenRefreshes++;
                }
            }
        }
        
        // Handle ORIGIN_VALIDATION_RESPONSE
        if (message.type === MESSAGE_TYPES.ORIGIN_VALIDATION_RESPONSE) {
            if (message.payload && message.payload.valid) {
                if (typeof state !== 'undefined') {
                    state.securityContext.originValidated = true;
                    state.metrics.originValidations++;
                }
            }
        }
        
        // Handle CONFIG_RESPONSE
        if (message.type === MESSAGE_TYPES.CONFIG_RESPONSE) {
            if (message.payload && message.payload.config) {
                if (typeof applyParentConfig !== 'undefined') {
                    applyParentConfig(message.payload.config);
                }
            }
        }
        
        // Handle RECOVERY_RESPONSE
        if (message.type === MESSAGE_TYPES.RECOVERY_RESPONSE) {
            if (message.payload && message.payload.success) {
                if (typeof state !== 'undefined') {
                    state.metrics.successfulRecoveries++;
                }
            }
        }
        
        // Handle legacy STATUS_ACK
        if (message.type === 'STATUS_ACK' && message.inResponseTo) {
            const ackHandler = state.pendingAcks.get(message.inResponseTo);
            if (ackHandler) {
                ackHandler.resolve(message);
                state.pendingAcks.delete(message.inResponseTo);
                if (ackHandler.timer) clearTimeout(ackHandler.timer);
            }
            return;
        }
        
        // Publish to message bus
        if (typeof MessageBus !== 'undefined') {
            MessageBus.publish('parent-messages', message);
        }
        
        const handlers = messageHandlers.get(message.type) || [];
        for (const handler of handlers) {
            handler(message, event.origin);
        }
        
    } catch (e) {
        DiagnosticsAgent.error('Receive', e.message, e);
        
        // Attempt recovery for critical errors
        if (typeof RecoveryManager !== 'undefined' && RecoveryManager.canRecover()) {
            RecoveryManager.recover('connection', { error: e });
        }
    }
}, 'receiveFromParent', null);

const sendToParent = createErrorBoundary(async function(type, payload = {}, options = {}) {
    return IframeTransport.send(type, payload, options);
}, 'sendToParent', null);

// =============================================
// RETRY QUEUE WITH EXPONENTIAL BACKOFF
// =============================================
function queueForRetry(type, payload, options, resolve, reject) {
    const retryItem = {
        id: generateMessageId(),
        type,
        payload,
        options: {
            ...options,
            retry: false
        },
        resolve,
        reject,
        attempts: 0,
        timestamp: Date.now(),
        frameId: state.frameId,
        instanceId: state.instanceId
    };
    
    state.retryQueue.push(retryItem);
    state.metrics.retryCount++;
    
    // Start retry processor if not already running
    if (!state.retryTimers.has('processor')) {
        processRetryQueue();
    }
}

async function processRetryQueue() {
    if (state.retryQueue.length === 0) return;
    
    const now = Date.now();
    const remainingItems = [];
    
    for (const item of state.retryQueue) {
        // Remove items older than 5 minutes
        if (now - item.timestamp > 300000) {
            item.reject(new Error('Retry timeout'));
            continue;
        }
        
        // Increment attempt counter
        item.attempts++;
        
        if (item.attempts > state.maxRetryAttempts) {
            item.reject(new Error('Max retry attempts exceeded'));
            continue;
        }
        
        // Calculate backoff delay with environment awareness
        const baseDelay = IframeEnvironment.isVPNNetwork ? state.baseRetryDelay * 2 : state.baseRetryDelay;
        const delay = Math.min(baseDelay * Math.pow(2, item.attempts - 1), state.maxRetryDelay);
        const jitter = Math.random() * 200;
        const totalDelay = delay + jitter;
        
        // Schedule retry
        const timer = setTimeout(async () => {
            try {
                const result = await sendToParent(item.type, item.payload, {
                    ...item.options,
                    retry: false,
                    requiresAck: true,
                    timeout: IframeEnvironment.isVPNNetwork ? 15000 : 10000
                });
                
                item.resolve(result);
            } catch (error) {
                // Re-queue for next attempt
                if (item.attempts < state.maxRetryAttempts) {
                    state.retryQueue.push(item);
                } else {
                    item.reject(error);
                }
            }
        }, totalDelay);
        
        state.retryTimers.set(item.id, timer);
    }
    
    state.retryQueue = remainingItems;
    
    // Schedule next processing
    const nextTimer = setTimeout(processRetryQueue, 5000);
    state.retryTimers.set('processor', nextTimer);
}

// =============================================
// ENHANCED HANDSHAKE CLIENT
// =============================================
const HandshakeClient = IframeHandshakeAuthority;

// =============================================
// SESSION CLIENT - RESILIENT SESSION MANAGEMENT
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
                await this.refreshSession();
            }
        }
    },
    
    async refreshSession() {
        if (this.refreshInProgress) return this.session;
        
        this.refreshInProgress = true;
        
        try {
            const response = await sendToParent(MESSAGE_TYPES.TOKEN_REFRESH, {
                timestamp: Date.now(),
                refreshToken: this.session?.refreshToken
            }, { requiresAck: true, timeout: 10000 });
            
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
                
                return this.session;
            }
        } catch (error) {
            // If refresh fails, try recovery
            if (typeof RecoveryManager !== 'undefined' && RecoveryManager.canRecover()) {
                RecoveryManager.recover('token', { error });
            }
            
            // Enable offline mode
            this.offlineMode = true;
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
// SESSION MIRROR LAYER - ENHANCED
// =============================================
function updateSessionMirror(sessionData, source = 'parent') {
    try {
        if (!sessionData) return false;
        
        const previousState = { ...state.sessionMirror };
        
        // Update token if provided
        if (sessionData.token && typeof sessionData.token === 'string') {
            state.sessionMirror.token = sessionData.token;
            state.token = sessionData.token;
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
        DiagnosticsAgent.error('Session', 'updateSessionMirror error', error);
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
// ENHANCED HEARTBEAT SYSTEM
// =============================================
function startEnhancedHeartbeat() {
    if (state.heartbeatInterval) {
        clearInterval(state.heartbeatInterval);
    }
    
    state.heartbeatInterval = setInterval(async () => {
        try {
            if (!state.parentDetected || !state.handshakeComplete) return;
            
            state.lastHeartbeatSent = Date.now();
            
            await sendToParent(MESSAGE_TYPES.PING, {
                timestamp: state.lastHeartbeatSent,
                frameId: state.frameId,
                instanceId: state.instanceId,
                readyState: state.readyState,
                guestMode: state.isGuestMode,
                sessionValid: isSessionMirrorValid(),
                online: state.isOnline,
                environment: IframeEnvironment.type,
                metrics: {
                    messagesSent: state.metrics.messagesSent,
                    messagesReceived: state.metrics.messagesReceived,
                    uptime: Date.now() - state.metrics.startTime,
                    retryQueue: state.retryQueue.length,
                    pendingAcks: state.pendingAcks.size,
                    handshakeState: state.handshakeState
                }
            }, { requiresAck: false, silent: true });
            
            // Check for missed heartbeats
            if (state.lastHeartbeatReceived) {
                const timeSinceLastResponse = Date.now() - state.lastHeartbeatReceived;
                const heartbeatThreshold = IframeEnvironment.isVPNNetwork ? 60000 : 45000;
                
                if (timeSinceLastResponse > heartbeatThreshold) {
                    state.heartbeatMissed++;
                    
                    if (state.heartbeatMissed >= state.maxMissedHeartbeats) {
                        // Trigger recovery
                        if (typeof RecoveryManager !== 'undefined') {
                            RecoveryManager.recover('connection');
                        }
                    }
                }
            }
            
        } catch (e) {}
    }, IframeEnvironment.getConfig().heartbeatInterval || 30000);
    
    state.intervals.add(state.heartbeatInterval);
}

async function triggerConnectionRecovery() {
    if (state.metrics.recoveryAttempts > 3) {
        return;
    }
    
    state.metrics.recoveryAttempts++;
    
    try {
        // Send recovery request
        const response = await sendToParent(MESSAGE_TYPES.RECOVERY_REQUEST, {
            timestamp: Date.now(),
            frameId: state.frameId,
            instanceId: state.instanceId,
            metrics: {
                heartbeatMissed: state.heartbeatMissed,
                lastHeartbeatSent: state.lastHeartbeatSent,
                lastHeartbeatReceived: state.lastHeartbeatReceived
            }
        }, { requiresAck: true, timeout: 10000 });
        
        if (response && response.payload && response.payload.success) {
            state.heartbeatMissed = 0;
        }
    } catch (error) {
        // If recovery fails, attempt re-handshake
        if (state.metrics.recoveryAttempts >= 2) {
            if (typeof reestablishConnection !== 'undefined') {
                reestablishConnection();
            }
        }
    }
}

async function reestablishConnection() {
    state.handshakeComplete = false;
    state.handshakeState = 'reconnecting';
    
    if (typeof StartupGovernor !== 'undefined') {
        StartupGovernor.recover();
    }
    
    try {
        const result = await HandshakeClient.execute({ maxRetries: 3 });
        
        if (result && result.success) {
            state.heartbeatMissed = 0;
            
            if (typeof StartupGovernor !== 'undefined') {
                StartupGovernor.activate();
            }
        }
    } catch (error) {
        // Enable offline mode
        state.offlineModeEnabled = true;
        if (typeof isOfflineMode !== 'undefined') {
            isOfflineMode = true;
        }
        
        if (typeof StartupGovernor !== 'undefined') {
            StartupGovernor.degrade('Connection lost');
        }
        
        // Show offline UI
        document.dispatchEvent(new CustomEvent('connectionLost', {
            detail: { message: 'Connection lost. Using offline mode.' }
        }));
    }
}

// =============================================
// PARENT CONFIGURATION REQUEST
// =============================================
async function requestParentConfig() {
    try {
        const response = await sendToParent(MESSAGE_TYPES.CONFIG_REQUEST, {
            timestamp: Date.now(),
            frameId: state.frameId,
            instanceId: state.instanceId,
            required: ['heartbeatInterval', 'sessionTimeout', 'maxRetries']
        }, { requiresAck: true, timeout: 5000 });
        
        if (response && response.payload && response.payload.config) {
            applyParentConfig(response.payload.config);
        }
    } catch (error) {}
}

function applyParentConfig(config) {
    try {
        if (config.heartbeatInterval) {
            // Adjust heartbeat interval if needed
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
        
        document.dispatchEvent(new CustomEvent('configApplied', {
            detail: config
        }));
        
    } catch (error) {}
}

// =============================================
// TOKEN REFRESH HANDLER
// =============================================
async function refreshToken() {
    if (state.sessionMirror.refreshInProgress) return state.token;
    
    state.sessionMirror.refreshInProgress = true;
    
    try {
        const response = await sendToParent(MESSAGE_TYPES.TOKEN_REFRESH, {
            timestamp: Date.now(),
            frameId: state.frameId,
            instanceId: state.instanceId,
            refreshToken: state.sessionMirror.refreshToken
        }, { requiresAck: true, timeout: 10000 });
        
        if (response && response.payload && response.payload.token) {
            state.token = response.payload.token;
            state.sessionMirror.token = response.payload.token;
            state.sessionMirror.lastRefresh = Date.now();
            
            if (response.payload.refreshToken) {
                state.sessionMirror.refreshToken = response.payload.refreshToken;
            }
            
            SafeStorage.set(UNIFIED_TOKEN_KEY, state.token);
            
            return state.token;
        }
    } catch (error) {
        // Try recovery
        if (typeof RecoveryManager !== 'undefined' && RecoveryManager.canRecover()) {
            RecoveryManager.recover('token', { error });
        }
    } finally {
        state.sessionMirror.refreshInProgress = false;
    }
    
    return state.token;
}

// =============================================
// PARENT AVAILABILITY DETECTION
// =============================================
const ParentDetector = {
    status: 'unknown',
    checkCount: 0,
    maxChecks: 5,
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
                    
                    resolve(false);
                    return;
                }
            };
            
            // First check immediately
            check();
            
            // Then check every 100ms
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
// INITIALIZATION PIPELINE - PREFLIGHT → READY
// =============================================
async function preflightStage() {
    try {
        if (typeof window === 'undefined') throw new Error('Window not available');
        if (typeof document === 'undefined') throw new Error('Document not available');
        
        // Detect environment
        IframeEnvironment.detect();
        
        return { success: true };
    } catch (error) {
        DiagnosticsAgent.error('Init', `Preflight failed: ${error.message}`, error);
        return { success: false, fallback: true };
    }
}

async function dependencyCheckStage() {
    try {
        const requiredApis = ['localStorage', 'postMessage', 'addEventListener'];
        const missing = requiredApis.filter(api => typeof window[api] === 'undefined');
        
        if (missing.length > 0) {
            state.dependenciesLoaded = false;
            return { success: false, fallback: true, missing };
        }
        
        state.dependenciesLoaded = true;
        return { success: true };
    } catch (error) {
        DiagnosticsAgent.error('Init', `Dependency check failed: ${error.message}`, error);
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
        return { success: false, fallback: true };
    }
    
    try {
        const result = await HandshakeClient.execute({
            maxRetries: options.maxRetries || IframeEnvironment.getConfig().maxRetries
        });
        
        if (result && result.success) {
            return { success: true };
        }
    } catch (error) {
        DiagnosticsAgent.error('Init', `Handshake failed: ${error.message}`, error);
    }
    
    state.handshakeComplete = false;
    return { success: false, fallback: true };
}

async function sessionSyncStage(timeout = 5000) {
    if (!state.handshakeComplete || !state.parentDetected) {
        if (state.sessionMirror.validated) {
            activateSessionFromMirror();
            return { success: true, guestMode: false, cached: true };
        }
        
        enableGuestMode();
        return { success: false, guestMode: true };
    }
    
    try {
        const sessionPromise = new Promise(async (resolveSession) => {
            const handler = (message) => {
                const payload = message.payload || message.data || {};
                
                if (message.type === MESSAGE_TYPES.SESSION || 
                    message.type === MESSAGE_TYPES.SESSION_DATA ||
                    message.type === MESSAGE_TYPES.SESSION_UPDATE ||
                    message.type === MESSAGE_TYPES.SESSION_SYNC) {
                    
                    removeMessageHandler(MESSAGE_TYPES.SESSION, handler);
                    removeMessageHandler(MESSAGE_TYPES.SESSION_DATA, handler);
                    removeMessageHandler(MESSAGE_TYPES.SESSION_UPDATE, handler);
                    removeMessageHandler(MESSAGE_TYPES.SESSION_SYNC, handler);
                    
                    resolveSession(payload);
                }
            };
            
            addMessageHandler(MESSAGE_TYPES.SESSION, handler);
            addMessageHandler(MESSAGE_TYPES.SESSION_DATA, handler);
            addMessageHandler(MESSAGE_TYPES.SESSION_UPDATE, handler);
            addMessageHandler(MESSAGE_TYPES.SESSION_SYNC, handler);
            
            await sendToParent(MESSAGE_TYPES.REQUEST_SESSION, {
                module: 'status',
                timestamp: Date.now(),
                handshakeId: state.handshakeId,
                frameId: state.frameId
            }, { requiresAck: false });
        });
        
        const timeoutPromise = new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error('Session timeout')), timeout);
            state.timeouts.add(timer);
        });
        
        const sessionData = await Promise.race([sessionPromise, timeoutPromise]).catch(() => null);
        
        if (sessionData && (sessionData.token || sessionData.user)) {
            updateSessionMirror(sessionData, 'session_sync');
            activateSessionFromMirror();
            
            return { success: true, guestMode: false, user: state.user };
        }
    } catch (error) {
        DiagnosticsAgent.error('Init', `Session sync failed: ${error.message}`, error);
    }
    
    if (state.sessionMirror.validated) {
        activateSessionFromMirror();
        return { success: true, guestMode: false, cached: true };
    }
    
    enableGuestMode();
    return { success: false, guestMode: true };
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
    
    return true;
}

async function serviceInitStage() {
    try {
        const cachedSession = loadCachedSession();
        if (cachedSession && !state.sessionActive && !state.sessionMirror.validated) {
            updateSessionMirror(cachedSession, 'cache');
        }
        
        return { success: true };
    } catch (error) {
        DiagnosticsAgent.error('Init', `Service init failed: ${error.message}`, error);
        return { success: false, fallback: true };
    }
}

function readyStage() {
    state.initialized = true;
    state.readyState = 'ready';
    
    if (typeof StartupGovernor !== 'undefined') {
        StartupGovernor.activate();
    }
    
    window.addEventListener('message', receiveFromParent);
    state.listeners.add({ type: 'message', handler: receiveFromParent });
    
    startEnhancedHeartbeat();
    
    return { success: true, state: state.readyState, guestMode: state.isGuestMode };
}

const initializeCore = createErrorBoundary(async function(options = {}) {
    if (state.initialized) {
        return { success: true, state: state.readyState };
    }
    
    if (!StartupGovernor.canInitialize()) {
        return { success: false, reason: 'Governor blocked' };
    }
    
    StartupGovernor.acquireLock();
    
    try {
        state.readyState = 'preflight';
        await preflightStage();
        
        state.readyState = 'dependencyCheck';
        await dependencyCheckStage();
        
        state.readyState = 'parentDetect';
        await parentDetectStage(options.parentTimeout || 2000);
        
        state.readyState = 'handshake';
        await handshakeStage({ maxRetries: options.handshakeRetries || IframeEnvironment.getConfig().maxRetries });
        
        state.readyState = 'sessionSync';
        await sessionSyncStage(options.sessionTimeout || 5000);
        
        state.readyState = 'serviceInit';
        await serviceInitStage();
        
        state.readyState = 'ready';
        const result = readyStage();
        
        StartupGovernor.releaseLock();
        return result;
        
    } catch (error) {
        DiagnosticsAgent.error('Core', `Initialization failed: ${error.message}`, error);
        
        if (state.sessionMirror.validated) {
            activateSessionFromMirror();
        } else {
            enableGuestMode();
        }
        
        state.initialized = true;
        state.readyState = 'ready';
        
        if (typeof StartupGovernor !== 'undefined') {
            StartupGovernor.degrade('Initialization failed');
            StartupGovernor.releaseLock();
        }
        
        return { success: false, state: 'ready', guestMode: state.isGuestMode };
    }
}, 'initializeCore', { success: false, guestMode: true });

const startHandshake = createErrorBoundary(async function(options = { retries: 5 }) {
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
}

function loadCachedSession() {
    try {
        const userData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER);
        const token = getUnifiedToken();
        const refreshToken = SafeStorage.getJSON('REFRESH_TOKEN');
        
        if (userData && token) {
            const user = userData;
            if (user && user.id) {
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
        DiagnosticsAgent.error('Session', `Failed to load cached session: ${error.message}`, error);
    }
    return null;
}

function startHeartbeat() {
    // Legacy heartbeat - replaced by enhanced version
    startEnhancedHeartbeat();
}

// =============================================
// SHUTDOWN & RESOURCE MANAGEMENT
// =============================================
const shutdownCore = createErrorBoundary(async function() {
    if (state.shutdownInProgress) return;
    
    state.shutdownInProgress = true;
    
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
        if (state.parentDetected && state.handshakeComplete) {
            await sendToParent(MESSAGE_TYPES.STATUS_SHUTDOWN, {
                timestamp: Date.now(),
                metrics: state.metrics,
                frameId: state.frameId,
                instanceId: state.instanceId
            }, { requiresAck: false, silent: true });
        }
        
    } catch (error) {
        DiagnosticsAgent.error('Core', `Shutdown error: ${error.message}`, error);
    } finally {
        state.shutdownInProgress = false;
    }
}, 'shutdownCore', null);

// =============================================
// MESSAGE HANDLER REGISTRATION
// =============================================
addMessageHandler(MESSAGE_TYPES.ACK, (message) => {});
addMessageHandler(MESSAGE_TYPES.STATUS, (message) => {
    document.dispatchEvent(new CustomEvent('statusUpdate', {
        detail: message.payload
    }));
});
addMessageHandler(MESSAGE_TYPES.ERROR, (message) => {
    DiagnosticsAgent.error('Parent', 'Error from parent', message.payload);
});
addMessageHandler(MESSAGE_TYPES.DATA, (message) => {
    document.dispatchEvent(new CustomEvent('coreData', {
        detail: message.payload
    }));
});

// Handshake response handler
addMessageHandler(MESSAGE_TYPES.HANDSHAKE_RESPONSE, (message) => {
    HandshakeClient.handleResponse(message);
});

// Session handlers
addMessageHandler(MESSAGE_TYPES.SESSION, (message) => {
    HandshakeClient.handleSessionInit(message);
});
addMessageHandler(MESSAGE_TYPES.SESSION_DATA, (message) => {
    HandshakeClient.handleSessionInit(message);
});
addMessageHandler(MESSAGE_TYPES.SESSION_UPDATE, (message) => {
    const payload = message.payload || message.data || {};
    updateSessionMirror(payload, 'session_update');
});
addMessageHandler(MESSAGE_TYPES.AUTH_VALIDATED, (message) => {
    const payload = message.payload || message.data || {};
    if (payload.success) {
        if (typeof isTokenReady !== 'undefined') {
            isTokenReady = true;
            if (typeof triggerTokenReadyCallbacks !== 'undefined') {
                triggerTokenReadyCallbacks();
            }
        }
    }
});

// Parent ready handler
addMessageHandler(MESSAGE_TYPES.PARENT_READY, (message) => {
    if (!state.handshakeComplete && StartupGovernor.shouldRetryHandshake()) {
        HandshakeClient.execute().catch(() => {});
    }
});

// Logout handler
addMessageHandler(MESSAGE_TYPES.LOGOUT, (message) => {
    handleLogout(message.payload);
});

// API response handlers
addMessageHandler(MESSAGE_TYPES.API_RESPONSE, (message) => {
    handleApiResponse(message.payload);
});
addMessageHandler(MESSAGE_TYPES.API_ERROR, (message) => {
    handleApiError(message.payload);
});

// Enhanced handlers
addMessageHandler(MESSAGE_TYPES.PONG, (message) => {
    state.lastHeartbeatReceived = Date.now();
    state.heartbeatMissed = 0;
    IframeTransport.handlePong();
});

addMessageHandler(MESSAGE_TYPES.PAGE_ACTIVATED, (message) => {
    state.pageActivated = true;
});

addMessageHandler(MESSAGE_TYPES.NAVIGATE, (message) => {
    if (message.payload && message.payload.path) {
        // Handle navigation if needed
        document.dispatchEvent(new CustomEvent('navigate', {
            detail: message.payload
        }));
    }
});

addMessageHandler(MESSAGE_TYPES.CAPABILITY_RESPONSE, (message) => {
    if (message.payload && Array.isArray(message.payload.capabilities)) {
        message.payload.capabilities.forEach(cap => {
            state.parentCapabilities.add(cap);
            IframeAuthority.parentCapabilities.add(cap);
        });
    }
});

addMessageHandler(MESSAGE_TYPES.TOKEN_REFRESH_RESPONSE, (message) => {
    if (message.payload && message.payload.token) {
        state.token = message.payload.token;
        SafeStorage.set(UNIFIED_TOKEN_KEY, message.payload.token);
        
        if (message.payload.refreshToken) {
            state.sessionMirror.refreshToken = message.payload.refreshToken;
        }
    }
});

addMessageHandler(MESSAGE_TYPES.ORIGIN_VALIDATION_RESPONSE, (message) => {
    if (message.payload && message.payload.valid) {
        state.securityContext.originValidated = true;
    }
});

addMessageHandler(MESSAGE_TYPES.CONFIG_RESPONSE, (message) => {
    if (message.payload && message.payload.config) {
        applyParentConfig(message.payload.config);
    }
});

addMessageHandler(MESSAGE_TYPES.RECOVERY_RESPONSE, (message) => {
    if (message.payload && message.payload.success) {
        state.metrics.successfulRecoveries++;
    }
});

// =============================================
// FEATURE ISOLATION SYSTEM
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
        DiagnosticsAgent.error('Feature', `Registration failed ${name}: ${e.message}`, e);
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
        DiagnosticsAgent.error('Feature', `Execution failed ${name}: ${error.message}`, error);
        state.disabledFeatures.add(name);
        return null;
    }
}

// =============================================
// SESSION & TOKEN MANAGEMENT
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
// HEALTH METRICS
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
        heartbeatMissed: state.heartbeatMissed,
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
        
        // Startup governor state
        governor: StartupGovernor.getMetrics(),
        
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
// PARENT COORDINATION - ENHANCED FOR UI REQUIREMENTS
// =============================================
const parentCoordinator = {
    isInitialized: false,
    handshakeComplete: false,
    sessionData: null,
    messageChannel: null,
    handshakeRetries: 0,
    maxHandshakeRetries: 10,
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
        
        startSecureHandshake();
        
    } catch (error) {
        DiagnosticsAgent.error('Parent', 'initializeParentCoordination error', error);
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
        
        if (!MessageFirewall.validate(event.data, event.origin)) {
            return;
        }
        
        const message = MessageFirewall.sanitize(event.data);
        
        const messageKey = `${message.type}:${message.messageId || message.id || 'no-id'}:${message.timestamp || Date.now()}`;
        if (state.messageCache.has(messageKey)) return;
        state.messageCache.add(messageKey);
        
        if (state.messageCache.size > 100) {
            const firstKey = state.messageCache.values().next().value;
            state.messageCache.delete(firstKey);
        }
        
        switch (message.type) {
            case 'SESSION_DATA':
            case MESSAGE_TYPES.SESSION:
            case MESSAGE_TYPES.SESSION_DATA:
            case MESSAGE_TYPES.SESSION_UPDATE:
                handleSecureSessionData(message);
                break;
            case MESSAGE_TYPES.SESSION_SYNC:
                handleSecureSessionData(message);
                break;
            case 'SESSION_UPDATE':
                handleSessionUpdate(message.data || message.payload);
                break;
            case 'LOGOUT':
                handleLogout(message.data || message.payload);
                break;
            case 'API_RESPONSE':
                handleApiResponse(message.data || message.payload);
                break;
            case 'API_ERROR':
                handleApiError(message.data || message.payload);
                break;
            case 'AUTH_VALIDATED':
                handleAuthValidated(message.data || message.payload);
                break;
            case MESSAGE_TYPES.HANDSHAKE_RESPONSE:
                HandshakeClient.handleResponse(message);
                break;
            case MESSAGE_TYPES.PARENT_READY:
                parentCoordinator.parentReadyReceived = true;
                parentCoordinator.handshakeState = 'parent_ready_received';
                StartupGovernor.parentReadyReceived = true;
                break;
            case MESSAGE_TYPES.PONG:
                state.lastHeartbeatReceived = Date.now();
                state.heartbeatMissed = 0;
                IframeTransport.handlePong();
                break;
            case MESSAGE_TYPES.PAGE_ACTIVATED:
                parentCoordinator.handshakeState = 'active';
                break;
        }
    } catch (error) {
        DiagnosticsAgent.error('Parent', 'handleEnhancedParentMessage error', error);
    }
}

function startSecureHandshake() {
    try {
        clearSecureHandshake();
        
        // Send CHILD_READY
        sendChildReadyMessage();
        
        // Request session
        requestSessionFromParent();
        
    } catch (error) {
        DiagnosticsAgent.error('Parent', 'startSecureHandshake error', error);
    }
}

function sendChildReadyMessage() {
    try {
        if (parentCoordinator.childReadySent) return;
        
        const message = {
            type: MESSAGE_TYPES.CHILD_READY,
            source: 'status-core',
            frameId: state.frameId,
            instanceId: state.instanceId,
            timestamp: Date.now(),
            module: 'status',
            protocolVersion: state.protocolVersion,
            environment: IframeEnvironment.type
        };
        
        window.parent.postMessage(message, '*');
        parentCoordinator.childReadySent = true;
        state.childReadySent = true;
        
    } catch (error) {
        DiagnosticsAgent.error('Parent', 'sendChildReadyMessage error', error);
    }
}

function requestSessionFromParent() {
    try {
        if (parentCoordinator.handshakeInProgress) return;
        
        parentCoordinator.handshakeInProgress = true;
        parentCoordinator.sessionRequestSent = true;
        parentCoordinator.sequenceId = generateSequenceId();
        
        const message = {
            type: MESSAGE_TYPES.REQUEST_SESSION,
            source: 'status-core',
            sequenceId: parentCoordinator.sequenceId,
            timestamp: Date.now(),
            module: 'status',
            protocolVersion: state.protocolVersion,
            frameId: state.frameId,
            instanceId: state.instanceId,
            capabilities: Array.from(state.capabilities.keys()),
            environment: IframeEnvironment.type
        };
        
        window.parent.postMessage(message, '*');
        
        const timeoutMs = IframeEnvironment.isVPNNetwork ? 10000 : 5000;
        
        parentCoordinator.handshakeTimeout = setTimeout(() => {
            if (!parentCoordinator.sessionValid) {
                if (!parentCoordinator.handshakeRetries || parentCoordinator.handshakeRetries < 1) {
                    parentCoordinator.handshakeRetries++;
                    parentCoordinator.handshakeInProgress = false;
                    setTimeout(requestSessionFromParent, 1000);
                } else {
                    handleSessionFailed();
                }
            }
        }, timeoutMs);
        
    } catch (error) {
        DiagnosticsAgent.error('Parent', 'requestSessionFromParent error', error);
        parentCoordinator.handshakeInProgress = false;
        handleSessionFailed();
    }
}

function handleSecureSessionData(message) {
    try {
        if (message.source !== 'parent' && message.source !== 'PARENT') return;
        
        if (parentCoordinator.sequenceId && message.sequenceId && 
            message.sequenceId !== parentCoordinator.sequenceId) return;
        
        const sessionData = message.data || message.payload;
        
        if (!sessionData) {
            parentCoordinator.handshakeInProgress = false;
            clearTimeout(parentCoordinator.handshakeTimeout);
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
            
            bindUIAfterSession();
            
            sendSecureResponseToParent(MESSAGE_TYPES.AUTH_VALIDATED, {
                success: true,
                module: 'status',
                sequenceId: parentCoordinator.sequenceId,
                frameId: state.frameId
            });
            
            startBackgroundInitializationWithSession();
        } else {
            parentCoordinator.handshakeInProgress = false;
            clearTimeout(parentCoordinator.handshakeTimeout);
        }
        
    } catch (error) {
        DiagnosticsAgent.error('Parent', 'handleSecureSessionData error', error);
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
        DiagnosticsAgent.error('Parent', 'bindUIAfterSession error', error);
    }
}

function updateUIBasedOnAuth() {
    try {
        document.dispatchEvent(new CustomEvent('sessionReady', {
            detail: { user: currentUser }
        }));
    } catch (error) {
        DiagnosticsAgent.error('Parent', 'updateUIBasedOnAuth error', error);
    }
}

function sendSecureResponseToParent(type, data = {}) {
    try {
        if (!window.parent || window.parent === window) return;
        
        const message = signMessage({
            type,
            payload: {
                ...data,
                source: 'status-core',
                timestamp: Date.now(),
                sequenceId: parentCoordinator.sequenceId || generateSequenceId(),
                frameId: state.frameId
            }
        });
        
        window.parent.postMessage(message, '*');
        
    } catch (error) {
        DiagnosticsAgent.error('Parent', 'sendSecureResponseToParent error', error);
    }
}

function handleSessionFailed() {
    parentCoordinator.handshakeInProgress = false;
    parentCoordinator.handshakeComplete = false;
    parentCoordinator.handshakeState = 'failed';
    
    if (typeof StartupGovernor !== 'undefined') {
        StartupGovernor.degrade('Session failed');
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
        DiagnosticsAgent.error('Parent', 'clearSecureHandshake error', error);
    }
}

function handleSessionData(sessionData) {
    try {
        if (!validateSessionData(sessionData)) {
            sendToParent(MESSAGE_TYPES.ERROR, {
                error: 'INVALID_SESSION_SCHEMA',
                message: 'Session data validation failed'
            });
            return;
        }
        
        updateSessionMirror(sessionData, 'session_data');
        
        parentCoordinator.sessionData = sessionData;
        parentCoordinator.handshakeComplete = true;
        parentCoordinator.handshakeState = 'active';
        
        if (typeof StartupGovernor !== 'undefined') {
            StartupGovernor.completeHandshake();
        }
        
        if (parentCoordinator.handshakeInterval) {
            clearInterval(parentCoordinator.handshakeInterval);
            parentCoordinator.handshakeInterval = null;
        }
        
        sendToParent(MESSAGE_TYPES.AUTH_VALIDATED, {
            module: 'status',
            success: true,
            frameId: state.frameId
        });
        
        startBackgroundInitializationWithSession();
        
    } catch (error) {
        DiagnosticsAgent.error('Parent', 'handleSessionData error', error);
        sendToParent(MESSAGE_TYPES.ERROR, {
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
        DiagnosticsAgent.error('Parent', 'handleSessionUpdate error', error);
    }
}

function handleLogout(logoutData) {
    try {
        parentCoordinator.sessionData = null;
        parentCoordinator.handshakeComplete = false;
        parentCoordinator.sessionValid = false;
        parentCoordinator.handshakeState = 'idle';
        
        if (typeof StartupGovernor !== 'undefined') {
            StartupGovernor.transition('INIT');
        }
        
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
        
        sendToParent(MESSAGE_TYPES.CHILD_LOADED, {
            module: 'status',
            loggedOut: true,
            timestamp: Date.now(),
            frameId: state.frameId
        });
        
    } catch (error) {
        DiagnosticsAgent.error('Parent', 'handleLogout error', error);
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
    if (typeof isOfflineMode !== 'undefined') isOfflineMode = true;
    
    if (typeof StartupGovernor !== 'undefined') {
        StartupGovernor.degrade('Parent unavailable');
    }
}

function startBackgroundInitializationWithSession() {
    if (typeof isBackgroundInitialized !== 'undefined' && isBackgroundInitialized) return;
    
    try {
        setTimeout(async () => {
            try {
                if (typeof loadFreshDataInBackground !== 'undefined') {
                    await loadFreshDataInBackground();
                }
                
                if (typeof isBackgroundInitialized !== 'undefined') {
                    isBackgroundInitialized = true;
                }
                
                if (parentCoordinator.handshakeComplete) {
                    sendToParent(MESSAGE_TYPES.UI_READY, {
                        module: 'status',
                        timestamp: Date.now(),
                        frameId: state.frameId
                    });
                }
            } catch (error) {
                DiagnosticsAgent.error('Background', 'startBackgroundInitializationWithSession error', error);
            }
        }, 1000);
    } catch (error) {
        DiagnosticsAgent.error('Background', 'startBackgroundInitializationWithSession error', error);
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
                    
                    if (message.type === 'API_RESPONSE' || message.type === MESSAGE_TYPES.API_RESPONSE) {
                        window.removeEventListener('message', responseHandler);
                        resolve(message.payload.response || message.payload.data);
                    } else if (message.type === 'API_ERROR' || message.type === MESSAGE_TYPES.API_ERROR) {
                        window.removeEventListener('message', responseHandler);
                        reject(new Error(message.payload.error || 'API Error'));
                    }
                } catch (error) {
                    window.removeEventListener('message', responseHandler);
                    reject(error);
                }
            };
            
            window.addEventListener('message', responseHandler);
            
            const message = signMessage({
                type: MESSAGE_TYPES.API_REQUEST,
                payload: {
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
                }
            });
            
            window.parent.postMessage(message, '*');
            
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
    DiagnosticsAgent.error('API', 'API Error', errorData);
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
        }
    } catch (error) {
        DiagnosticsAgent.error('Auth', 'handleAuthValidated error', error);
    }
}

// =============================================
// CENTRALIZED TOKEN ACCESS SYSTEM
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
                    DiagnosticsAgent.error('Token', 'waitForTokenReady.checkToken error', error);
                    resolve(false);
                }
            };
            
            checkToken();
        } catch (error) {
            DiagnosticsAgent.error('Token', 'waitForTokenReady error', error);
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
        DiagnosticsAgent.error('Token', 'onTokenReady error', error);
    }
}

function triggerTokenReadyCallbacks() {
    try {
        while (tokenReadyCallbacks.length > 0) {
            const callback = tokenReadyCallbacks.shift();
            try {
                callback();
            } catch (error) {
                DiagnosticsAgent.error('Token', 'triggerTokenReadyCallbacks callback error', error);
            }
        }
    } catch (error) {
        DiagnosticsAgent.error('Token', 'triggerTokenReadyCallbacks error', error);
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
        DiagnosticsAgent.error('Token', 'getUnifiedToken error', error);
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
        DiagnosticsAgent.error('Token', 'migrateLegacyTokens error', error);
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
        DiagnosticsAgent.error('Auth', 'isAuthenticated error', error);
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
            DiagnosticsAgent.error('API', 'queueApiRequest error', error);
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
                DiagnosticsAgent.error('API', 'processPendingApiRequests error', error);
                reject(error);
            }
        }
    } catch (error) {
        DiagnosticsAgent.error('API', 'processPendingApiRequests error', error);
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
                    DiagnosticsAgent.error('Token', 'startTokenReadinessCheck timeout');
                }
            } catch (error) {
                DiagnosticsAgent.error('Token', 'startTokenReadinessCheck.interval error', error);
            }
        }, 100);
    } catch (error) {
        DiagnosticsAgent.error('Token', 'startTokenReadinessCheck error', error);
    }
}

// =============================================
// SECURE API CALL WITH FALLBACK - Using safeFetch
// =============================================
const secureApiCall = createErrorBoundary(async function(endpoint, options = {}) {
    if (state.offlineModeEnabled && options.method && options.method !== 'GET') {
        throw new Error('Offline mode');
    }
    
    if (parentCoordinator.handshakeComplete) {
        try {
            return await makeParentApiRequest(endpoint, options);
        } catch (error) {
            // Fall through to local fetch
        }
    }
    
    const token = getUnifiedToken();
    if (!token) {
        return queueApiRequest(() => secureApiCall(endpoint, options));
    }
    
    try {
        // Use safeFetch with token
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
            if (typeof isOfflineMode !== 'undefined') isOfflineMode = true;
            handleAuthError('Authentication failed. Using offline mode.');
            
            // Try to refresh token
            await refreshToken();
        }
        throw error;
    }
}, 'secureApiCall', null);

// =============================================
// GLOBAL STATE VARIABLES
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
// INSTANT UI RENDERING WITH CACHED DATA
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
        
    } catch (error) {
        DiagnosticsAgent.error('UI', 'initializeUIWithCachedData error', error);
    }
}

function loadUserFromCache() {
    try {
        const userData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER);
        if (userData && userData !== 'undefined' && userData !== 'null') {
            if (userData && typeof userData === 'object' && userData.id) {
                currentUser = userData;
            }
        }
    } catch (error) {
        DiagnosticsAgent.error('UI', 'loadUserFromCache error', error);
    }
}

function loadCachedDataInstantly() {
    try {
        const statusesData = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.STATUSES);
        if (statusesData) {
            try { statuses = statusesData || []; } catch { statuses = []; }
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
        
    } catch (error) {
        DiagnosticsAgent.error('UI', 'loadCachedDataInstantly error', error);
    }
}

// =============================================
// BACKGROUND INITIALIZATION
// =============================================
async function startBackgroundInitialization() {
    if (isBackgroundInitialized) return;
    
    try {
        onTokenReady(async () => {
            try {
                await loadFreshDataInBackground();
                isBackgroundInitialized = true;
                
                if (parentCoordinator.handshakeComplete) {
                    sendToParent(MESSAGE_TYPES.UI_READY, {
                        module: 'status',
                        timestamp: Date.now(),
                        frameId: state.frameId
                    });
                }
            } catch (error) {
                DiagnosticsAgent.error('Background', 'startBackgroundInitialization.onTokenReady error', error);
            }
        });
        
        if (getUnifiedToken() || parentCoordinator.handshakeComplete || state.token || state.sessionMirror.validated) {
            try {
                await loadFreshDataInBackground();
                isBackgroundInitialized = true;
                
                if (parentCoordinator.handshakeComplete) {
                    sendToParent(MESSAGE_TYPES.UI_READY, {
                        module: 'status',
                        timestamp: Date.now(),
                        frameId: state.frameId
                    });
                }
            } catch (error) {
                DiagnosticsAgent.error('Background', 'startBackgroundInitialization.immediate error', error);
            }
        }
        
    } catch (error) {
        DiagnosticsAgent.error('Background', 'startBackgroundInitialization error', error);
    }
}

async function loadFreshDataInBackground() {
    try {
        const loadPromises = [];
        loadPromises.push(safeApiOperation(() => loadStatusesInBackground()));
        loadPromises.push(safeApiOperation(() => loadMyStatusesInBackground()));
        loadPromises.push(safeApiOperation(() => loadHighlightsInBackground()));
        loadPromises.push(safeApiOperation(() => loadUserDataInBackground()));
        await Promise.allSettled(loadPromises);
    } catch (error) {
        DiagnosticsAgent.error('Background', 'loadFreshDataInBackground error', error);
    }
}

async function safeApiOperation(operation) {
    try {
        if (!isAuthenticated()) throw new Error('Not authenticated');
        return await operation();
    } catch (error) {
        DiagnosticsAgent.error('API', 'safeApiOperation error', error);
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
        }
    } catch (error) {
        throw error;
    }
}

// =============================================
// BOOTSTRAP APPLICATION - ALIASED AS bootstrapApplication FOR COMPATIBILITY
// =============================================
async function bootstrapApp() {
    try {
        initializeParentCoordination();
        initializeUIWithCachedData();
        startTokenReadinessCheck();
        
        setTimeout(() => {
            sendToParent(MESSAGE_TYPES.CHILD_LOADED, {
                module: 'status',
                timestamp: Date.now(),
                frameId: state.frameId
            });
        }, 500);
        
        return true;
    } catch (error) {
        DiagnosticsAgent.error('Bootstrap', 'bootstrapApp error', error);
        return false;
    }
}

const bootstrapApplication = bootstrapApp;

// =============================================
// AUTHENTICATION ERROR HANDLING
// =============================================
function handleAuthError(message) {
    try {
        if (parentCoordinator.handshakeComplete) {
            sendToParent(MESSAGE_TYPES.NEEDS_AUTH, {
                module: 'status',
                error: message,
                timestamp: Date.now(),
                frameId: state.frameId
            });
        }
        
        if (statuses.length === 0 && myStatuses.length === 0) {
            // No action needed
        } else {
            state.offlineModeEnabled = true;
            isOfflineMode = true;
            
            if (typeof StartupGovernor !== 'undefined') {
                StartupGovernor.degrade('Auth error');
            }
        }
    } catch (error) {
        DiagnosticsAgent.error('Auth', 'handleAuthError error', error);
    }
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
        
        if (typeof StartupGovernor !== 'undefined') {
            StartupGovernor.degrade('Data load timeout');
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
        
    } catch (error) {
        DiagnosticsAgent.error('Init', 'loadInitialData error', error);
        throw error;
    }
}

// =============================================
// CORE STATUS FUNCTIONS
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
        DiagnosticsAgent.error('Status', 'filterStatusesByPrivacy error', error);
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
        DiagnosticsAgent.error('Status', 'getStatusPreviewText error', error);
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
        DiagnosticsAgent.error('Status', 'filterStatusesByType error', error);
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
        DiagnosticsAgent.error('Status', 'getEmptyStateMessage error', error);
        return 'No statuses available';
    }
}

// =============================================
// STATUS ACTIONS - WITH SECURE API CALLS
// =============================================
const addReactionToStatus = createErrorBoundary(async function(statusId, reaction) {
    if (!statusId || !reaction) throw new Error('Missing required parameters');
    
    if (state.offlineModeEnabled) {
        pendingReactions.push({ statusId, reaction, timestamp: new Date().toISOString() });
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, pendingReactions);
        return { success: true, offline: true };
    }
    
    const response = await secureApiCall(`/api/statuses/${statusId}/react`, {
        method: 'POST',
        body: JSON.stringify({ reaction })
    });
    
    return response;
}, 'addReactionToStatus', { success: false });

const voteOnPoll = createErrorBoundary(async function(statusId, optionId) {
    if (!statusId || !optionId) throw new Error('Missing required parameters');
    
    if (state.offlineModeEnabled) return { success: false, offline: true };
    
    const response = await secureApiCall(`/api/statuses/${statusId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ optionId })
    });
    
    return response;
}, 'voteOnPoll', { success: false });

const pinStatus = createErrorBoundary(async function(statusData) {
    if (!statusData || !statusData.id) throw new Error('Invalid status data');
    
    const response = await secureApiCall(`/api/statuses/${statusData.id}/pin`, {
        method: 'POST'
    });
    
    if (response && response.success) {
        statusData.isPinned = true;
        pinnedStatuses.push(statusData);
    }
    return response;
}, 'pinStatus', { success: false });

const unpinStatus = createErrorBoundary(async function(statusData) {
    if (!statusData || !statusData.id) throw new Error('Invalid status data');
    
    const response = await secureApiCall(`/api/statuses/${statusData.id}/pin`, {
        method: 'DELETE'
    });
    
    if (response && response.success) {
        statusData.isPinned = false;
        pinnedStatuses = pinnedStatuses.filter(s => s && s.id !== statusData.id);
    }
    return response;
}, 'unpinStatus', { success: false });

const muteUser = createErrorBoundary(async function(userId) {
    if (!userId) throw new Error('Invalid user ID');
    
    const response = await secureApiCall(`/api/users/${userId}/mute`, {
        method: 'POST'
    });
    
    if (response && response.success) {
        mutedUsers.add(userId);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MUTED_USERS, Array.from(mutedUsers));
    }
    return response;
}, 'muteUser', { success: false });

const unmuteUser = createErrorBoundary(async function(userId) {
    if (!userId) throw new Error('Invalid user ID');
    
    const response = await secureApiCall(`/api/users/${userId}/mute`, {
        method: 'DELETE'
    });
    
    if (response && response.success) {
        mutedUsers.delete(userId);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MUTED_USERS, Array.from(mutedUsers));
    }
    return response;
}, 'unmuteUser', { success: false });

const postStatus = createErrorBoundary(async function(statusData) {
    if (!statusData) throw new Error('Invalid status data');
    
    const sanitizedData = sanitizeStatusData(statusData);
    
    if (state.offlineModeEnabled) {
        const offlineQueue = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE) || [];
        sanitizedData.id = 'offline_' + Date.now();
        sanitizedData.createdAt = new Date().toISOString();
        sanitizedData.offline = true;
        offlineQueue.push(sanitizedData);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);
        
        statuses.unshift(sanitizedData);
        myStatuses.unshift(sanitizedData);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
        
        lastPostDate = new Date();
        SafeStorage.set(LOCAL_STORAGE_KEYS.LAST_POST_DATE, lastPostDate.toISOString());
        updateStreakCounter();
        
        return { success: true, status: sanitizedData, offline: true };
    }
    
    const response = await secureApiCall('/api/statuses/create', {
        method: 'POST',
        body: JSON.stringify(sanitizedData)
    });
    
    if (response && response.status) {
        statuses.unshift(response.status);
        myStatuses.unshift(response.status);
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
    }
    return response;
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
        DiagnosticsAgent.error('Status', 'sanitizeStatusData error', error);
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
    } catch (error) {
        DiagnosticsAgent.error('Status', 'updateStreakCounter error', error);
    }
}

const scheduleStatus = createErrorBoundary(async function(statusData, scheduleTime) {
    if (!statusData || !scheduleTime) throw new Error('Missing required parameters');
    
    const sanitizedData = sanitizeStatusData(statusData);
    
    const response = await secureApiCall('/api/statuses/schedule', {
        method: 'POST',
        body: JSON.stringify({
            ...sanitizedData,
            scheduledFor: scheduleTime
        })
    });
    
    if (response && response.success) {
        scheduledStatuses.push({ ...sanitizedData, scheduledFor: scheduleTime });
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SCHEDULED, scheduledStatuses);
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
        return { success: true };
    } catch (error) {
        DiagnosticsAgent.error('Draft', 'saveDraft error', error);
        throw error;
    }
}

const reportStatus = createErrorBoundary(async function(statusId, reason, details) {
    if (!statusId || !reason) throw new Error('Missing required parameters');
    
    const sanitizedDetails = escapeHtml(details || '');
    
    const response = await secureApiCall(`/api/statuses/${statusId}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason, details: sanitizedDetails })
    });
    
    return response;
}, 'reportStatus', { success: false });

// =============================================
// USER STATUS TRACKING
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
        startEnhancedHeartbeat();
        updateUserStatus();
        
        isTrackingInitialized = true;
        
    } catch (error) {
        DiagnosticsAgent.error('Status', 'initializeUserStatusTracking error', error);
    }
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
    } catch (error) {
        DiagnosticsAgent.error('Status', 'setupNetworkDetection error', error);
    }
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
    } catch (error) {
        DiagnosticsAgent.error('Status', 'setupActivityTracking error', error);
    }
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
        }
        
        // Attempt recovery
        if (!parentCoordinator.handshakeComplete && RecoveryManager.canRecover()) {
            HandshakeClient.execute().catch(() => {});
        }
    } catch (error) {
        DiagnosticsAgent.error('Status', 'handleOnlineStatus error', error);
    }
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
            
            if (typeof StartupGovernor !== 'undefined') {
                StartupGovernor.degrade('Offline');
            }
        }
    } catch (error) {
        DiagnosticsAgent.error('Status', 'handleOfflineStatus error', error);
    }
}

function sendUserActive() {
    try {
        if (parentCoordinator.handshakeComplete && currentUser?.id) {
            sendToParent('USER_ACTIVE', {
                timestamp: Date.now(),
                userId: currentUser.id,
                sequenceId: generateSequenceId(),
                frameId: state.frameId
            }, { silent: true });
        }
    } catch (error) {
        DiagnosticsAgent.error('Status', 'sendUserActive error', error);
    }
}

function sendUserInactive() {
    try {
        if (parentCoordinator.handshakeComplete && currentUser?.id) {
            sendToParent('USER_INACTIVE', {
                timestamp: Date.now(),
                userId: currentUser.id,
                lastActive: lastActivityTime,
                sequenceId: generateSequenceId(),
                frameId: state.frameId
            }, { silent: true });
        }
    } catch (error) {
        DiagnosticsAgent.error('Status', 'sendUserInactive error', error);
    }
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
            sendToParent('STATUS_UPDATE', {
                userId: userId,
                status: status,
                lastSeen: new Date().toISOString(),
                isOnline: isOnline,
                timestamp: Date.now(),
                sequenceId: generateSequenceId(),
                source: 'status-core',
                frameId: state.frameId
            }, { silent: true });
        }
        
        if (isOnline && !state.offlineModeEnabled) {
            try {
                await secureApiCall('/api/user/status', {
                    method: 'POST',
                    body: JSON.stringify({ status: status, lastSeen: new Date().toISOString() })
                });
            } catch (apiError) {
                DiagnosticsAgent.error('Status', 'updateUserStatus.api error', apiError);
            }
        }
        
    } catch (error) {
        DiagnosticsAgent.error('Status', 'updateUserStatus error', error);
    }
}

async function syncPendingData() {
    try {
        const reactionsToSync = [...pendingReactions];
        for (const reaction of reactionsToSync) {
            try {
                await secureApiCall(`/api/statuses/${reaction.statusId}/react`, {
                    method: 'POST',
                    body: JSON.stringify({ reaction: reaction.reaction })
                });
                pendingReactions = pendingReactions.filter(r => 
                    !(r.statusId === reaction.statusId && r.reaction === reaction.reaction)
                );
            } catch (error) {
                DiagnosticsAgent.error('Sync', 'syncPendingData.reaction error', error);
            }
        }
        
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, pendingReactions);
        
        const offlineQueue = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE) || [];
        for (const statusData of offlineQueue) {
            try {
                await secureApiCall('/api/statuses/create', {
                    method: 'POST',
                    body: JSON.stringify(statusData)
                });
            } catch (error) {
                DiagnosticsAgent.error('Sync', 'syncPendingData.offline error', error);
            }
        }
        
        SafeStorage.remove(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
        await loadFreshDataInBackground();
        
    } catch (error) {
        DiagnosticsAgent.error('Sync', 'syncPendingData error', error);
    }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================
function escapeHtml(text) {
    try {
        if (!text) return '';
        if (typeof document === 'undefined') return text;
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    } catch (error) {
        DiagnosticsAgent.error('Util', 'escapeHtml error', error);
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
        DiagnosticsAgent.error('Util', 'formatTimeAgo error', error);
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
        DiagnosticsAgent.error('Util', 'retryOperation error', error);
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
        DiagnosticsAgent.error('Util', 'generateSampleMoodData error', error);
        return [];
    }
}

// =============================================
// SAFE LOG ERROR UTILITY
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
            DiagnosticsAgent.warn(module, `${functionName} error: ${error?.message || error}`);
        }
        
        if (functionName.includes('get') || functionName.includes('load')) {
            return Array.isArray(data) ? [] : null;
        }
    } catch (e) {}
}

// =============================================
// USER GUARD AND API GUARD
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
// STUB FUNCTIONS FOR COMPATIBILITY
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
// NEW FUNCTION: updateLocalStateWithSession - REQUIRED BY status-ui.js
// =============================================
function updateLocalStateWithSession(sessionData) {
    try {
        if (!sessionData) return false;
        
        DiagnosticsAgent.info('Session', 'Updating local state with session data');
        
        // Update currentUser
        if (sessionData.user) {
            currentUser = sessionData.user;
            userData = sessionData.user;
            
            // Cache user
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER, sessionData.user);
        }
        
        // Update token
        if (sessionData.token) {
            SafeStorage.set(UNIFIED_TOKEN_KEY, sessionData.token);
            state.token = sessionData.token;
        }
        
        // Update refresh token
        if (sessionData.refreshToken) {
            SafeStorage.setJSON('REFRESH_TOKEN', sessionData.refreshToken);
            state.sessionMirror.refreshToken = sessionData.refreshToken;
        }
        
        // Update permissions
        if (sessionData.permissions && Array.isArray(sessionData.permissions)) {
            state.permissionsGranted = [...sessionData.permissions];
        }
        
        // Update capabilities
        if (sessionData.capabilities && Array.isArray(sessionData.capabilities)) {
            state.sessionMirror.capabilities = [...sessionData.capabilities];
        }
        
        // Update session ID
        if (sessionData.sessionId) {
            state.sessionId = sessionData.sessionId;
        }
        
        // Update session mirror
        updateSessionMirror(sessionData, 'local_update');
        
        // Also update session client
        SessionClient.updateSession(sessionData, 'local_update');
        
        // Trigger token ready
        isTokenReady = true;
        triggerTokenReadyCallbacks();
        processPendingApiRequests();
        
        return true;
    } catch (error) {
        DiagnosticsAgent.error('Session', 'updateLocalStateWithSession error', error);
        return false;
    }
}

// =============================================
// DIAGNOSTICS AND MONITORING
// =============================================
function enableDiagnostics() {
    state.diagnosticsEnabled = true;
    window.__IFRAME_DEBUG__ = true;
    DiagnosticsAgent.enable();
}

function disableDiagnostics() {
    state.diagnosticsEnabled = false;
    window.__IFRAME_DEBUG__ = false;
    DiagnosticsAgent.disable();
}

function getDiagnostics() {
    return {
        health: getHealthMetrics(),
        diagnosticLog: state.diagnosticData,
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
        governor: StartupGovernor.getMetrics(),
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
// SANDBOX DETECTION
// =============================================
function detectSandbox() {
    try {
        const sandboxed = !window.parent || window.parent === window || 
                          (() => { try { return !window.parent.location; } catch { return true; } })();
        
        if (sandboxed) {
            // Adjust security for sandbox
            state.securityContext.signatureRequired = false;
            state.securityContext.encryptionRequired = false;
            state.securityContext.replayProtection = false;
            
            // Add sandbox to trusted origins
            try {
                if (document.referrer) {
                    const referrerOrigin = new URL(document.referrer).origin;
                    TRUSTED_ORIGINS.add(referrerOrigin);
                }
            } catch (e) {}
            
            return true;
        }
        
        return false;
    } catch (error) {
        DiagnosticsAgent.warn('Sandbox', 'Error detecting sandbox', error);
        return true; // Assume sandboxed on error
    }
}

// =============================================
// CLEANUP AND MEMORY MANAGEMENT
// =============================================
function cleanup() {
    try {
        if (apiCheckInterval) { clearInterval(apiCheckInterval); apiCheckInterval = null; }
        if (parentCoordinator.handshakeInterval) { clearInterval(parentCoordinator.handshakeInterval); parentCoordinator.handshakeInterval = null; }
        if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
        if (autoAdvanceInterval) { clearInterval(autoAdvanceInterval); autoAdvanceInterval = null; }
        if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
        if (parentCoordinator.handshakeTimeout) { clearTimeout(parentCoordinator.handshakeTimeout); parentCoordinator.handshakeTimeout = null; }
        if (activityThrottleTimer) { clearTimeout(activityThrottleTimer); activityThrottleTimer = null; }
        if (HandshakeClient.timer) { clearTimeout(HandshakeClient.timer); HandshakeClient.timer = null; }
        
        // Clear retry timers
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
// SAFE INITIALIZATION WITH PARENT HANDSHAKE
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
    DiagnosticsAgent.log(level, 'StatusCore', msg);
}

async function safeInit() {
    if (_INITIALIZATION_STARTED_) {
        return;
    }
    
    _INITIALIZATION_STARTED_ = true;
    
    let tries = 0;
    const maxTries = 5;
    
    // Detect environment
    IframeEnvironment.detect();
    
    // Detect sandbox
    detectSandbox();
    
    // Use ParentDetector for reliable detection
    const parentAvailable = await ParentDetector.detect();
    
    if (parentAvailable) {
        // Execute enhanced handshake
        const handshakeResult = await HandshakeClient.execute({ maxRetries: IframeEnvironment.getConfig().maxRetries }).catch(() => null);
        
        if (handshakeResult && handshakeResult.success) {
            _PARENT_READY_ = true;
            _HANDSHAKE_DONE_ = true;
        } else {
            // Try to load from mirror
            if (state.sessionMirror.validated) {
                activateSessionFromMirror();
            } else {
                enableGuestMode();
            }
        }
    } else {
        if (state.sessionMirror.validated) {
            activateSessionFromMirror();
        } else {
            enableGuestMode();
        }
    }
    
    try {
        initializeUIWithCachedData();
        
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
    if (_HANDSHAKE_DONE_) return;
    
    if (_HANDSHAKE_RETRIES_ >= MAX_HANDSHAKE) {
        return;
    }
    
    if (window.parent && window.parent !== window) {
        try {
            const message = signMessage({
                type: MESSAGE_TYPES.IFRAME_READY,
                source: 'iframe',
                page: location.pathname,
                module: 'status-core',
                timestamp: Date.now(),
                version: '5.0',
                protocolVersion: state.protocolVersion,
                frameId: state.frameId,
                environment: IframeEnvironment.type
            });
            
            window.parent.postMessage(message, '*');
            
            _HANDSHAKE_RETRIES_++;
        } catch (error) {
            logOnce('error', 'Failed to send handshake to parent');
        }
    }
}

function initPageCore() {
    try {
        setTimeout(() => {
            safeInit().catch(error => {
                safeLogError('Status', 'initPageCore.safeInit', error);
            });
        }, 50);
    } catch (error) {
        safeLogError('Status', 'initPageCore', error);
    }
}

// =============================================
// PAGE CORE COMPATIBILITY LAYER
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
// AUTO-CLEANUP ON UNLOAD
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
// GLOBAL EXPOSURE - LEGACY SUPPORT
// =============================================
if (typeof window !== 'undefined') {
    try {
        window.statusCore = {
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
            
            // New exports
            HandshakeClient,
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
            
            // New enhanced modules
            IframeEnvironment,
            IframeAuthority,
            StartupGovernor,
            OriginTrustAdapter,
            MessageBus,
            IframeTransport,
            RecoveryManager,
            SessionClient,
            CompatibilityBridge,
            NavigationGuard,
            DiagnosticsAgent,
            ReliabilityEngine,
            IframeHandshakeAuthority,
            
            // Safe fetch
            safeFetch
        };
        
        // Enable debug mode if URL parameter present
        if (window.location.search.includes('debug=true')) {
            enableDiagnostics();
        }
    } catch (error) {
        safeLogError('Status', 'globalExposure', error);
    }
}

// =============================================
// EXPORT CONTRACT - ALL SYMBOLS REQUIRED BY status-ui.js
// =============================================
export {
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
    StartupGovernor,
    OriginTrustAdapter,
    MessageBus,
    IframeTransport,
    RecoveryManager,
    SessionClient,
    CompatibilityBridge,
    NavigationGuard,
    DiagnosticsAgent,
    ReliabilityEngine,
    IframeHandshakeAuthority,
    SafeStorage,
    
    // Safe fetch
    safeFetch
};

// =============================================
// CORE INITIALIZATION - AUTOMATIC
// =============================================
if (typeof window !== 'undefined' && !state.initialized) {
    setTimeout(() => {
        initPageCore();
    }, 10);
}

// Silent initialization - no console log