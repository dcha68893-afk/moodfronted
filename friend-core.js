// =============================================
// FRIEND PAGE - CORE IMPLEMENTATION v2.5.1
// Production-Ready Micro-Frontend Core Engine
// Enhanced with KYN Protocol Compliance v2 + All Required Modules
// =============================================

import {
    login,
    register,
    logout,
    getValidToken as originalGetValidToken,
    secureFetch,
    escapeHtml as importedEscapeHtml,
    formatTimeAgo as importedFormatTimeAgo,
    getTrustScoreClass as importedGetTrustScoreClass,
    showNotification as importedShowNotification,
    navigateToChat as importedNavigateToChat,
    navigateToCall as importedNavigateToCall,
    simulateContactSync as importedSimulateContactSync,
    KnectaError,
    SessionError,
    ValidationError
} from './js/api.core.js';

import {
    generateMessageId,
    validateMessageSchema,
    getMessages
} from './js/api.messages.js';

// Handle NetworkError export gracefully
let NetworkError;
try {
    const apiCore = await import('./js/api.core.js');
    NetworkError = apiCore.NetworkError;
} catch (e) {
    NetworkError = class NetworkError extends Error {
        constructor(message) {
            super(message || 'Network error');
            this.name = 'NetworkError';
        }
    };
}

// =============================================
// [1] SAFE STORAGE LAYER - CRITICAL
// =============================================

export const SafeStorage = {
    _memoryStore: new Map(),
    _storageAvailable: null,
    _warningsShown: new Set(),
    
    init() {
        this._checkAvailability();
    },
    
    _checkAvailability() {
        if (this._storageAvailable !== null) return;
        
        try {
            const testKey = `__test_${Date.now()}`;
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            this._storageAvailable = true;
            this._showOnce('storage', 'LocalStorage available', 'debug');
        } catch (e) {
            this._storageAvailable = false;
            
            if (e.name === 'QuotaExceededError') {
                this._showOnce('storage_quota', 'Storage quota exceeded, using memory fallback', 'warn');
            } else if (e.name === 'SecurityError' || e.message.includes('tracking')) {
                this._showOnce('storage_blocked', 'Storage access blocked by browser, using memory fallback', 'warn');
            } else {
                this._showOnce('storage_error', 'Storage unavailable, using memory fallback', 'debug');
            }
        }
    },
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[SafeStorage] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || window.location.hostname === 'localhost')) {
            console.log(`[SafeStorage] ${message}`);
        }
    },
    
    getItem(key) {
        this._checkAvailability();
        
        if (this._storageAvailable) {
            try {
                const value = localStorage.getItem(key);
                if (value !== null) return value;
            } catch (e) {
                this._showOnce('get_failed', `Failed to read from storage, using memory`, 'debug');
            }
        }
        
        return this._memoryStore.get(key) || null;
    },
    
    setItem(key, value) {
        this._checkAvailability();
        
        if (this._storageAvailable) {
            try {
                localStorage.setItem(key, String(value));
                return true;
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    this._showOnce('quota_exceeded', 'Storage quota exceeded', 'warn');
                }
            }
        }
        
        this._memoryStore.set(key, String(value));
        return true;
    },
    
    removeItem(key) {
        this._checkAvailability();
        
        if (this._storageAvailable) {
            try {
                localStorage.removeItem(key);
            } catch (e) {
                // Ignore
            }
        }
        
        this._memoryStore.delete(key);
        return true;
    },
    
    getObject(key) {
        const value = this.getItem(key);
        if (!value) return null;
        
        try {
            return JSON.parse(value);
        } catch (e) {
            return null;
        }
    },
    
    setObject(key, obj) {
        try {
            return this.setItem(key, JSON.stringify(obj));
        } catch (e) {
            return false;
        }
    },
    
    clear() {
        this._memoryStore.clear();
        
        if (this._storageAvailable) {
            try {
                localStorage.clear();
            } catch (e) {
                // Ignore
            }
        }
    }
};

SafeStorage.init();

// =============================================
// [2] IFRAME ENVIRONMENT DETECTOR - UNIFIED
// =============================================

export const IframeEnvironment = {
    type: 'UNKNOWN',
    features: {
        isLocal: false,
        isRenderHosted: false,
        isVpnNetwork: false,
        isProduction: false,
        isSecure: false,
        highLatency: false,
        unstableNetwork: false,
        saveData: false,
        effectiveType: 'unknown',
        rtt: 0,
        downlink: 0,
        isIframe: false,
        isCrossOrigin: false,
        parentOrigin: null,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        connectionType: 'unknown'
    },
    
    _detected: false,
    _warningsShown: new Set(),
    
    detect() {
        if (this._detected) return this.type;
        
        try {
            this._detectEnvironment();
            this._detectNetworkConditions();
            this._detectIframeStatus();
            this._detectVpn();
            this._detected = true;
            
            this._showOnce('environment', `Environment detected: ${this.type}`, 'debug');
            
        } catch (error) {
            this._showOnce('detect_error', `Environment detection failed: ${error.message}`, 'debug');
            this.type = 'UNKNOWN';
        }
        
        return this.type;
    },
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[IframeEnvironment] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || window.location.hostname === 'localhost')) {
            console.log(`[IframeEnvironment] ${message}`);
        }
    },
    
    _detectEnvironment() {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        
        if (hostname === 'localhost' || 
            hostname === '127.0.0.1' || 
            hostname === '[::1]' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('172.16.') ||
            hostname.startsWith('172.17.') ||
            hostname.startsWith('172.18.') ||
            hostname.startsWith('172.19.') ||
            hostname.startsWith('172.20.') ||
            hostname.startsWith('172.21.') ||
            hostname.startsWith('172.22.') ||
            hostname.startsWith('172.23.') ||
            hostname.startsWith('172.24.') ||
            hostname.startsWith('172.25.') ||
            hostname.startsWith('172.26.') ||
            hostname.startsWith('172.27.') ||
            hostname.startsWith('172.28.') ||
            hostname.startsWith('172.29.') ||
            hostname.startsWith('172.30.') ||
            hostname.startsWith('172.31.')) {
            this.type = 'LOCAL_DEV';
            this.features.isLocal = true;
        }
        else if (hostname.includes('.onrender.com') || hostname.includes('render.com')) {
            this.type = 'RENDER_HOSTED';
            this.features.isRenderHosted = true;
        }
        else if (protocol === 'https:' && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
            this.type = 'PRODUCTION';
            this.features.isProduction = true;
        }
        else {
            this.type = 'UNKNOWN';
        }
        
        this.features.isSecure = protocol === 'https:';
    },
    
    _detectNetworkConditions() {
        try {
            if (navigator.connection) {
                const conn = navigator.connection;
                this.features.saveData = conn.saveData || false;
                this.features.effectiveType = conn.effectiveType || 'unknown';
                this.features.rtt = conn.rtt || 0;
                this.features.downlink = conn.downlink || 0;
                this.features.connectionType = conn.type || 'unknown';
                
                this.features.highLatency = conn.rtt > 300;
                
                let changes = 0;
                const handler = () => {
                    changes++;
                    if (changes > 3) {
                        this.features.unstableNetwork = true;
                    }
                };
                
                try {
                    conn.addEventListener('change', handler, { once: true });
                    setTimeout(() => {
                        try {
                            conn.removeEventListener('change', handler);
                        } catch (e) {}
                    }, 5000);
                } catch (e) {}
            }
            
            if (!this.features.rtt && performance.timing) {
                const timing = performance.timing;
                if (timing.responseEnd && timing.requestStart) {
                    const measuredRtt = timing.responseEnd - timing.requestStart;
                    this.features.rtt = measuredRtt;
                    this.features.highLatency = measuredRtt > 300;
                }
            }
        } catch (error) {
            this._showOnce('network_detect_error', `Network detection failed: ${error.message}`, 'debug');
        }
    },
    
    _detectIframeStatus() {
        try {
            this.features.isIframe = window.parent !== window && window.parent !== null;
            
            if (this.features.isIframe) {
                try {
                    this.features.parentOrigin = window.parent.location.origin;
                    this.features.isCrossOrigin = this.features.parentOrigin !== window.location.origin;
                } catch (e) {
                    this.features.isCrossOrigin = true;
                    this.features.parentOrigin = 'cross-origin';
                }
            }
        } catch (error) {
            this.features.isIframe = false;
        }
    },
    
    _detectVpn() {
        const hostname = window.location.hostname;
        
        const vpnPatterns = [
            /^10\.8\./,
            /^10\.9\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./,
            /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./
        ];
        
        const isVpnIp = vpnPatterns.some(pattern => pattern.test(hostname));
        
        this.features.isVpnNetwork = isVpnIp || 
            (this.features.highLatency && this.features.effectiveType === '4g');
        
        if (this.features.isVpnNetwork && this.type === 'UNKNOWN') {
            this.type = 'VPN_NETWORK';
        }
    },
    
    getAdaptiveConfig() {
        const baseConfig = {
            handshakeTimeout: 10000,
            maxRetries: 10,
            backoffBase: 100,
            heartbeatInterval: 30000,
            sessionRefresh: 300000,
            ackTimeout: 5000,
            batchSize: 10,
            useKeepalive: false,
            compression: false
        };
        
        switch (this.type) {
            case 'LOCAL_DEV':
                return {
                    ...baseConfig,
                    handshakeTimeout: 3000,
                    maxRetries: 3,
                    backoffBase: 50,
                    heartbeatInterval: 5000,
                    ackTimeout: 1000,
                    debug: true,
                    useKeepalive: false,
                    compression: false
                };
                
            case 'VPN_NETWORK':
                return {
                    ...baseConfig,
                    handshakeTimeout: 20000,
                    maxRetries: 15,
                    backoffBase: 200,
                    heartbeatInterval: 15000,
                    ackTimeout: 10000,
                    batchSize: 5,
                    useKeepalive: true,
                    compression: true
                };
                
            case 'RENDER_HOSTED':
                return {
                    ...baseConfig,
                    handshakeTimeout: 15000,
                    maxRetries: 8,
                    backoffBase: 150,
                    heartbeatInterval: 25000,
                    ackTimeout: 8000,
                    useKeepalive: true,
                    compression: false
                };
                
            case 'PRODUCTION':
                return {
                    ...baseConfig,
                    handshakeTimeout: 10000,
                    maxRetries: 5,
                    backoffBase: 100,
                    heartbeatInterval: 30000,
                    ackTimeout: 5000,
                    useKeepalive: false,
                    compression: false
                };
                
            default:
                return baseConfig;
        }
    },
    
    adaptToConditions() {
        if (this.features.highLatency && this.features.unstableNetwork) {
            return {
                mode: 'DEGRADED',
                increaseTimeouts: true,
                reduceRetries: false,
                batchMessages: true,
                enableKeepalive: true
            };
        }
        
        if (this.features.saveData) {
            return {
                mode: 'DATA_SAVER',
                reduceHeartbeats: true,
                compressMessages: true,
                disableAutoSync: true
            };
        }
        
        return { mode: 'NORMAL' };
    },
    
    getInfo() {
        return {
            type: this.type,
            features: { ...this.features },
            config: this.getAdaptiveConfig()
        };
    }
};

IframeEnvironment.detect();

// =============================================
// [3] COMPATIBILITY BRIDGE - MISSING EXPORT FIX
// =============================================

export const CompatibilityBridge = {
    mode: 'auto',
    legacyDetected: false,
    parentCapabilities: null,
    _warningsShown: new Set(),
    
    detectParentCapabilities() {
        const stored = SafeStorage.getItem('parent_capabilities');
        if (stored) {
            try {
                this.parentCapabilities = JSON.parse(stored);
                this.determineMode();
                return this.parentCapabilities;
            } catch (e) {}
        }
        
        this.parentCapabilities = {
            modern: false,
            kyn: false,
            signatures: false,
            heartbeats: false,
            batching: false,
            protocol: 'unknown'
        };
        
        return this.parentCapabilities;
    },
    
    determineMode() {
        if (!this.parentCapabilities) {
            this.detectParentCapabilities();
        }
        
        if (this.parentCapabilities.modern === false || 
            this.legacyDetected ||
            (window.kynState && window.kynState.compatibilityMode)) {
            this.mode = 'legacy';
            return 'legacy';
        }
        
        if (this.parentCapabilities.kyn) {
            this.mode = 'modern';
            return 'modern';
        }
        
        this.mode = 'auto';
        return 'auto';
    },
    
    adaptOutgoing(message) {
        this.determineMode();
        
        if (this.mode === 'legacy') {
            return this.toLegacyFormat(message);
        }
        
        if (this.mode === 'modern') {
            return message;
        }
        
        return message;
    },
    
    adaptIncoming(message) {
        if (!message) return null;
        
        if (message.protocol === 'KYN-1.0' || message.protocol === 'KYN-2.0') {
            return message;
        }
        
        if (this.isLegacyFormat(message)) {
            this.legacyDetected = true;
            return this.fromLegacyFormat(message);
        }
        
        return this.inferFormat(message);
    },
    
    toLegacyFormat(message) {
        return {
            type: message.type,
            data: message.payload,
            messageId: message.messageId,
            timestamp: message.timestamp,
            source: message.source || 'iframe',
            target: 'parent'
        };
    },
    
    fromLegacyFormat(message) {
        return {
            protocol: 'KYN-1.0',
            messageId: message.messageId || `legacy_${Date.now()}`,
            type: message.type,
            source: message.source || 'parent',
            target: 'iframe',
            frameId: message.frameId || (window.kynState ? window.kynState.frameId : `frame_${Date.now()}`),
            timestamp: message.timestamp || Date.now(),
            payload: message.payload || message.data || message,
            legacy: true
        };
    },
    
    isLegacyFormat(message) {
        return !message.protocol && 
               (message.type && !message.payload) && 
               (message.data || !message.frameId);
    },
    
    inferFormat(message) {
        return {
            protocol: 'INFERRED',
            messageId: message.id || message.messageId || `inf_${Date.now()}`,
            type: message.type || message.event || 'UNKNOWN',
            source: message.source || 'parent',
            target: 'iframe',
            frameId: message.frameId || (window.kynState ? window.kynState.frameId : `frame_${Date.now()}`),
            timestamp: message.timestamp || Date.now(),
            payload: message.payload || message.data || message,
            inferred: true
        };
    },
    
    setParentCapabilities(capabilities) {
        this.parentCapabilities = capabilities;
        SafeStorage.setObject('parent_capabilities', capabilities);
        this.determineMode();
    },
    
    _showOnce(key, message) {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
            console.log(`[CompatibilityBridge] ${message}`);
        }
    }
};

// =============================================
// [4] ORIGIN TRUST ADAPTER - Security
// =============================================

export const OriginAdapter = {
    trustStore: new Set(),
    dynamicTrust: new Map(),
    trustScore: new Map(),
    trustedOrigins: [],
    backendDomains: ['moodchat-fy56.onrender.com', 'moodfronted.onrender.com'],
    _warningsShown: new Set(),
    
    init() {
        this.addTrustedOrigin(window.location.origin);
        
        this.addTrustedOrigin('http://localhost:5500');
        this.addTrustedOrigin('http://127.0.0.1:5500');
        this.addTrustedOrigin('http://localhost:3000');
        this.addTrustedOrigin('http://127.0.0.1:3000');
        this.addTrustedOrigin('http://localhost:8080');
        this.addTrustedOrigin('file://');
        
        this.addTrustedOrigin('https://moodchat-fy56.onrender.com');
        this.addTrustedOrigin('https://moodfronted.onrender.com');
        
        this.addTrustedPattern(/^https:\/\/.*\.onrender\.com$/);
        this.addTrustedPattern(/^https:\/\/.*\.render\.com$/);
        
        this.addTrustedPattern(/^https:\/\/knecta\.app$/);
        this.addTrustedPattern(/^https:\/\/.*\.knecta\.app$/);
        
        this.addTrustedPattern(/^http:\/\/192\.168\..*/);
        this.addTrustedPattern(/^http:\/\/10\..*/);
        this.addTrustedPattern(/^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\..*/);
        
        this._showOnce('init', `Initialized with ${this.trustStore.size} trusted origins`, 'debug');
    },
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[OriginAdapter] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || window.location.hostname === 'localhost')) {
            console.log(`[OriginAdapter] ${message}`);
        }
    },
    
    addTrustedOrigin(origin) {
        if (origin) {
            this.trustStore.add(origin);
            this.trustedOrigins.push(origin);
        }
    },
    
    addTrustedPattern(pattern) {
        this.dynamicTrust.set(pattern, true);
    },
    
    isOriginTrusted(origin) {
        if (!origin) return false;
        
        if (this.trustStore.has(origin)) return true;
        
        for (const pattern of this.dynamicTrust.keys()) {
            if (pattern.test(origin)) {
                this.trustStore.add(origin);
                return true;
            }
        }
        
        try {
            if (window.parent && window.parent !== window) {
                try {
                    const parentOrigin = window.parent.location.origin;
                    if (origin === parentOrigin || origin === '*') {
                        return true;
                    }
                } catch (e) {}
            }
        } catch (e) {}
        
        if (IframeEnvironment.type === 'LOCAL_DEV' || IframeEnvironment.type === 'VPN_NETWORK') {
            return true;
        }
        
        const score = this.calculateTrustScore(origin);
        this.trustScore.set(origin, score);
        
        if (score > 0.7) return true;
        
        this._showOnce('untrusted', `Untrusted origin: ${origin} (score: ${score})`, 'warn');
        return false;
    },
    
    calculateTrustScore(origin) {
        let score = 0;
        
        try {
            const url = new URL(origin);
            
            if (url.protocol === 'https:') score += 0.3;
            
            if (url.hostname.endsWith('.com') || 
                url.hostname.endsWith('.org') || 
                url.hostname.endsWith('.net') ||
                url.hostname.endsWith('.io') ||
                url.hostname.endsWith('.app')) {
                score += 0.2;
            }
            
            if (!/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
                score += 0.2;
            }
            
            if (url.hostname.includes('knecta')) score += 0.3;
            if (url.hostname.includes('chat')) score += 0.1;
            if (this.backendDomains.some(d => url.hostname.includes(d))) score += 0.4;
            
            if (this.trustScore.has(origin)) score += 0.1;
            
        } catch (error) {}
        
        return Math.min(score, 1.0);
    },
    
    getTrustedOriginForParent() {
        try {
            if (window.parent && window.parent !== window) {
                try {
                    return window.parent.location.origin;
                } catch (e) {
                    return '*';
                }
            }
        } catch (error) {}
        return '*';
    },
    
    validateMessage(event) {
        if (!event || !event.origin) return false;
        return this.isOriginTrusted(event.origin);
    }
};

OriginAdapter.init();

// =============================================
// [5] IFRAME TRANSPORT - CENTRALIZED COMMUNICATION (FIXED v2)
// =============================================

export const IframeTransport = {
    _messageId: 0,
    _pendingAcks: new Map(),
    _handlers: new Map(), // Now properly stores arrays
    _messageCache: new Set(),
    _frameId: null,
    _parentOrigin: '*',
    _config: IframeEnvironment.getAdaptiveConfig(),
    _warningsShown: new Set(),
    _messageHandler: null, // Store bound handler for removal
    
    init(frameId) {
        this._frameId = frameId || this._generateFrameId();
        this._setupListener();
        if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
            console.log('[IframeTransport] Transport initialized');
        }
    },
    
    _generateFrameId() {
        const stored = SafeStorage.getItem('kyn_frame_id_v2');
        if (stored) return stored;
        
        const newId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_v2`;
        SafeStorage.setItem('kyn_frame_id_v2', newId);
        return newId;
    },
    
    _setupListener() {
        // Store bound handler so we can remove it later
        this._messageHandler = this._handleMessage.bind(this);
        window.addEventListener('message', this._messageHandler);
    },
    
    _handleMessage(event) {
        if (!OriginAdapter.validateMessage(event)) {
            if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                console.warn('[IframeTransport] Rejected message from untrusted origin:', event.origin);
            }
            return;
        }
        
        const adapted = CompatibilityBridge.adaptIncoming(event.data);
        if (!adapted) return;
        
        const { type, messageId, ack } = adapted;
        
        if (this._messageCache.has(messageId)) {
            return; // Silent duplicate
        }
        
        this._messageCache.add(messageId);
        setTimeout(() => this._messageCache.delete(messageId), 60000);
        
        if (ack) {
            const pending = this._pendingAcks.get(messageId);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve(adapted);
                this._pendingAcks.delete(messageId);
            }
            return;
        }
        
        const handlers = this._handlers.get(type);
        if (handlers && Array.isArray(handlers) && handlers.length > 0) {
            // Execute all handlers for this message type
            handlers.forEach(handler => {
                if (typeof handler === 'function') {
                    try {
                        handler(adapted, event);
                    } catch (error) {
                        if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                            console.error(`[IframeTransport] Handler error for ${type}:`, error);
                        }
                    }
                } else {
                    if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                        console.warn(`[IframeTransport] Invalid handler for ${type}:`, handler);
                    }
                }
            });
        }
        
        if (adapted.requireAck) {
            this.send('ACK', { messageId, ack: true }, { requireAck: false });
        }
    },
    
    send(type, payload = {}, options = {}) {
        const messageId = options.messageId || this._generateMessageId();
        const requireAck = options.requireAck !== false;
        const timeout = options.timeout || this._config.ackTimeout;
        const retry = options.retry !== false;
        
        const message = {
            protocol: 'KYN-2.0',
            messageId,
            type,
            source: 'iframe',
            target: 'parent',
            frameId: this._frameId,
            timestamp: Date.now(),
            payload: this._sanitizePayload(payload),
            version: '2.5.1',
            requireAck
        };
        
        if (options.priority) message.priority = options.priority;
        
        const token = getValidTokenInternal();
        if (token) message.token = token;
        
        const adapted = CompatibilityBridge.adaptOutgoing(message);
        
        if (requireAck) {
            return this._sendWithAck(adapted, timeout, retry);
        }
        
        const success = this._postMessage(adapted);
        return success ? { success: true, messageId } : { success: false, error: 'send_failed' };
    },
    
    _sendWithAck(message, timeout, retry) {
        return new Promise((resolve, reject) => {
            const messageId = message.messageId;
            
            const timeoutId = setTimeout(() => {
                this._pendingAcks.delete(messageId);
                
                if (retry && this._config.maxRetries > 0) {
                    if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                        console.log('[IframeTransport] ACK timeout, queuing for retry');
                    }
                    ReliabilityEngine.queue(message, this._config.maxRetries);
                    resolve({ success: false, queued: true, messageId });
                } else {
                    reject(new Error(`ACK timeout for ${message.type}`));
                }
            }, timeout);
            
            this._pendingAcks.set(messageId, {
                resolve,
                reject,
                timeout: timeoutId,
                message
            });
            
            const sent = this._postMessage(message);
            
            if (!sent) {
                clearTimeout(timeoutId);
                this._pendingAcks.delete(messageId);
                
                if (retry) {
                    ReliabilityEngine.queue(message, this._config.maxRetries);
                    resolve({ success: false, queued: true, messageId });
                } else {
                    reject(new Error('Failed to send message'));
                }
            }
        });
    },
    
    _postMessage(message) {
        if (!window.parent || window.parent === window) {
            if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                console.log('[IframeTransport] No parent window');
            }
            return false;
        }
        
        try {
            window.parent.postMessage(message, this._parentOrigin);
            return true;
        } catch (error) {
            if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                console.error('[IframeTransport] postMessage failed:', error);
            }
            return false;
        }
    },
    
    _generateMessageId() {
        this._messageId++;
        return `msg_${Date.now()}_${this._messageId}_${Math.random().toString(36).substr(2, 4)}`;
    },
    
    _sanitizePayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;
        try {
            return JSON.parse(JSON.stringify(payload));
        } catch (e) {
            return {};
        }
    },
    
    on(type, handler) {
        if (typeof handler !== 'function') {
            if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                console.warn(`[IframeTransport] Attempted to register non-function handler for ${type}`);
            }
            return;
        }
        
        if (!this._handlers.has(type)) {
            this._handlers.set(type, []);
        }
        
        const handlers = this._handlers.get(type);
        // Avoid duplicate handlers
        if (!handlers.includes(handler)) {
            handlers.push(handler);
        }
    },
    
    off(type, handler) {
        if (!this._handlers.has(type)) return;
        
        if (handler) {
            const handlers = this._handlers.get(type).filter(h => h !== handler);
            if (handlers.length === 0) {
                this._handlers.delete(type);
            } else {
                this._handlers.set(type, handlers);
            }
        } else {
            this._handlers.delete(type);
        }
    },
    
    setParentOrigin(origin) {
        this._parentOrigin = origin || '*';
    },
    
    getFrameId() {
        return this._frameId;
    },
    
    destroy() {
        this._pendingAcks.forEach((pending, id) => {
            clearTimeout(pending.timeout);
        });
        this._pendingAcks.clear();
        this._handlers.clear();
        this._messageCache.clear();
        
        if (this._messageHandler) {
            window.removeEventListener('message', this._messageHandler);
            this._messageHandler = null;
        }
    }
};
// =============================================
// [6] RELIABILITY ENGINE - ACK/RETRY QUEUE
// =============================================

export const ReliabilityEngine = {
    queue: [],
    processing: false,
    config: IframeEnvironment.getAdaptiveConfig(),
    stats: {
        queued: 0,
        processed: 0,
        failed: 0,
        retries: 0
    },
    _warningsShown: new Set(),
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[ReliabilityEngine] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV')) {
            console.log(`[ReliabilityEngine] ${message}`);
        }
    },
    
    queue(message, maxRetries = 5) {
        const entry = {
            message,
            attempts: 0,
            maxRetries,
            timestamp: Date.now(),
            nextAttempt: Date.now() + this._getBackoff(0)
        };
        
        this.queue.push(entry);
        this.stats.queued++;
        
        this._showOnce('queued', `Message ${message.messageId} queued`, 'debug');
        
        if (!this.processing) {
            this.process();
        }
        
        return entry;
    },
    
    process() {
        if (this.processing) return;
        this.processing = true;
        
        const processNext = () => {
            if (this.queue.length === 0) {
                this.processing = false;
                return;
            }
            
            const now = Date.now();
            const remaining = [];
            
            this.queue.forEach(entry => {
                if (entry.attempts >= entry.maxRetries) {
                    this.stats.failed++;
                    this._showOnce('dropped', `Message ${entry.message.messageId} dropped after ${entry.attempts} attempts`, 'warn');
                    return;
                }
                
                if (now >= entry.nextAttempt) {
                    entry.attempts++;
                    this.stats.retries++;
                    
                    const delay = this._getBackoff(entry.attempts);
                    entry.nextAttempt = now + delay;
                    
                    const success = IframeTransport.send(
                        entry.message.type,
                        entry.message.payload,
                        { requireAck: false, retry: false }
                    );
                    
                    if (success && success.success) {
                        this.stats.processed++;
                        this._showOnce('processed', `Message ${entry.message.messageId} processed on attempt ${entry.attempts}`, 'debug');
                    } else {
                        remaining.push(entry);
                        this._showOnce('retry', `Message ${entry.message.messageId} failed, retry ${entry.attempts} in ${delay}ms`, 'debug');
                    }
                } else {
                    remaining.push(entry);
                }
            });
            
            this.queue = remaining;
            
            if (this.queue.length > 0) {
                setTimeout(processNext, 1000);
            } else {
                this.processing = false;
            }
        };
        
        setTimeout(processNext, 100);
    },
    
    _getBackoff(attempt) {
        const base = this.config.backoffBase || 100;
        const delay = base * Math.pow(2, attempt);
        const jitter = Math.random() * 0.3 * delay;
        return Math.min(delay + jitter, 30000);
    },
    
    clearStale(maxAgeMs = 60000) {
        const now = Date.now();
        const originalLength = this.queue.length;
        
        this.queue = this.queue.filter(entry => {
            const age = now - entry.timestamp;
            return age < maxAgeMs && entry.attempts < entry.maxRetries;
        });
        
        if (originalLength !== this.queue.length) {
            this._showOnce('cleared', `Cleared ${originalLength - this.queue.length} stale messages`, 'debug');
        }
    },
    
    getStats() {
        return { ...this.stats, queueLength: this.queue.length };
    }
};

// =============================================
// [7] STARTUP GOVERNOR - Lifecycle Management
// =============================================

export const StartupGovernor = {
    state: {
        phase: 'INIT',
        lock: false,
        startedAt: Date.now(),
        lastTransition: Date.now(),
        attempts: 0,
        maxAttempts: 5,
        backoffMs: 1000,
        error: null,
        parentDetected: false,
        parentReadyReceived: false,
        handshakeCompleted: false,
        sessionValid: false
    },
    
    listeners: new Set(),
    _warningsShown: new Set(),
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[StartupGovernor] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV')) {
            console.log(`[StartupGovernor] ${message}`);
        }
    },
    
    init() {
        this._transitionTo('INIT');
        this._detectParent();
        this._showOnce('init', 'StartupGovernor initialized', 'debug');
    },
    
    _detectParent() {
        try {
            if (window.parent && window.parent !== window) {
                this.state.parentDetected = true;
                this._showOnce('parent_detected', 'Parent detected', 'debug');
            } else {
                this.state.parentDetected = false;
                this._showOnce('no_parent', 'No parent detected', 'debug');
            }
        } catch (error) {
            this.state.parentDetected = true;
            this._showOnce('parent_cross', 'Parent detection ambiguous', 'debug');
        }
    },
    
    _transitionTo(phase, reason = null) {
        if (this.state.lock && phase !== 'RECOVERING') {
            this._showOnce('locked', `Transition blocked: ${this.state.phase} -> ${phase}`, 'debug');
            return false;
        }
        
        const oldPhase = this.state.phase;
        this.state.phase = phase;
        this.state.lastTransition = Date.now();
        
        if (reason) this.state.error = reason;
        
        if (window.kynState) window.kynState.startupPhase = phase;
        
        this._showOnce('transition', `Phase: ${oldPhase} -> ${phase}`, 'debug');
        this._notifyListeners({ oldPhase, newPhase: phase, reason });
        
        return true;
    },
    
    canProceed(expectedPhase) {
        if (this.state.phase !== expectedPhase) {
            this._showOnce('cannot_proceed', `Expected ${expectedPhase}, actual ${this.state.phase}`, 'debug');
            return false;
        }
        return !this.state.lock;
    },
    
    acquireLock() {
        if (this.state.lock) {
            this._showOnce('lock_held', 'Lock already acquired', 'debug');
            return false;
        }
        this.state.lock = true;
        return true;
    },
    
    releaseLock() {
        this.state.lock = false;
    },
    
    shouldRetry() {
        if (this.state.attempts >= this.state.maxAttempts) return false;
        if (Date.now() - this.state.startedAt > 30000) return false;
        return true;
    },
    
    getBackoffDelay() {
        const delay = this.state.backoffMs * Math.pow(1.5, this.state.attempts);
        this.state.attempts++;
        return Math.min(delay, 10000);
    },
    
    waitForParent(timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (this.state.parentReadyReceived) {
                resolve();
                return;
            }
            
            const timeoutId = setTimeout(() => {
                this._transitionTo('DEGRADED', 'Parent ready timeout');
                reject(new Error('Parent ready timeout'));
            }, timeout);
            
            const handler = () => {
                clearTimeout(timeoutId);
                this.state.parentReadyReceived = true;
                resolve();
            };
            
            window.addEventListener('parentReadyReceived', handler, { once: true });
        });
    },
    
    onTransition(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    },
    
    _notifyListeners(data) {
        this.listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {}
        });
    },
    
    reset() {
        this.state = {
            phase: 'INIT',
            lock: false,
            startedAt: Date.now(),
            lastTransition: Date.now(),
            attempts: 0,
            maxAttempts: 5,
            backoffMs: 1000,
            error: null,
            parentDetected: false,
            parentReadyReceived: false,
            handshakeCompleted: false,
            sessionValid: false
        };
    }
};

StartupGovernor.init();

// =============================================
// [8] IFRAME HANDSHAKE AUTHORITY - Single Authority
// =============================================

export const IframeHandshakeAuthority = {
    state: {
        status: 'idle',
        retryCount: 0,
        maxRetries: IframeEnvironment.getAdaptiveConfig().maxRetries,
        backoffMs: IframeEnvironment.getAdaptiveConfig().backoffBase,
        handshakeId: null,
        parentVersion: null,
        completed: false,
        failed: false
    },
    
    _handlers: [],
    _parentReadyHandler: null,
    _warningsShown: new Set(),
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[HandshakeAuthority] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV')) {
            console.log(`[HandshakeAuthority] ${message}`);
        }
    },
    
    start() {
        if (this.state.completed) {
            this._showOnce('already_complete', 'Handshake already completed', 'debug');
            return Promise.resolve({ success: true, already: true });
        }
        
        if (this.state.status !== 'idle' && this.state.status !== 'failed') {
            this._showOnce('in_progress', `Handshake in progress: ${this.state.status}`, 'debug');
            return Promise.reject(new Error('Handshake in progress'));
        }
        
        if (!StartupGovernor.acquireLock()) {
            this._showOnce('locked', 'Cannot start handshake - governor locked', 'debug');
            return Promise.reject(new Error('Governor locked'));
        }
        
        StartupGovernor._transitionTo('HANDSHAKING');
        this.state.status = 'child_ready_sent';
        this.state.handshakeId = `hs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this._showOnce('starting', `Starting handshake (attempt ${this.state.retryCount + 1})`, 'debug');
        
        return this._sendChildReady();
    },
    
    _sendChildReady() {
        return new Promise((resolve, reject) => {
            const message = {
                type: 'CHILD_READY',
                payload: {
                    frameId: IframeTransport.getFrameId(),
                    version: '2.5.1',
                    timestamp: Date.now(),
                    features: [],
                    protocol: 'KYN-2.0',
                    handshakeId: this.state.handshakeId
                }
            };
            
            const sent = IframeTransport.send('CHILD_READY', message.payload, { requireAck: false });
            
            if (!sent || !sent.success) {
                this._showOnce('send_failed', 'Failed to send CHILD_READY', 'warn');
                this._scheduleRetry(resolve, reject);
                StartupGovernor.releaseLock();
                return;
            }
            
            this.state.status = 'awaiting_parent_ready';
            
            this._parentReadyHandler = (data) => {
                this._handleParentReady(data, resolve, reject);
            };
            
            IframeTransport.on('PARENT_READY', this._parentReadyHandler);
            
            setTimeout(() => {
                if (this.state.status === 'awaiting_parent_ready') {
                    this._showOnce('timeout', 'PARENT_READY timeout', 'warn');
                    IframeTransport.off('PARENT_READY', this._parentReadyHandler);
                    this._scheduleRetry(resolve, reject);
                }
            }, IframeEnvironment.getAdaptiveConfig().handshakeTimeout);
        });
    },
    
    _handleParentReady(data, resolve, reject) {
        if (this.state.status !== 'awaiting_parent_ready') return;
        
        this._showOnce('parent_ready', 'PARENT_READY received', 'debug');
        
        this.state.parentVersion = data.payload?.version || 'unknown';
        
        window.dispatchEvent(new CustomEvent('parentReadyReceived'));
        
        if (window.kynState) {
            window.kynState.parentReady = true;
            window.kynState.parentOrigin = data.origin || data.payload?.origin || '*';
        }
        
        IframeTransport.setParentOrigin(data.origin || data.payload?.origin || '*');
        
        this.state.status = 'handshake_sent';
        
        this._sendHandshakeRequest(resolve, reject);
    },
    
    _sendHandshakeRequest(resolve, reject) {
        const message = {
            type: 'HANDSHAKE_REQUEST',
            payload: {
                frameId: IframeTransport.getFrameId(),
                timestamp: Date.now(),
                handshakeId: this.state.handshakeId,
                protocol: 'KYN-2.0',
                environment: IframeEnvironment.type,
                capabilities: {
                    heartbeat: true,
                    retry: true,
                    batch: false,
                    compression: IframeEnvironment.features.saveData,
                    keepalive: IframeEnvironment.features.isVpnNetwork
                }
            }
        };
        
        IframeTransport.send('HANDSHAKE_REQUEST', message.payload, { requireAck: true, timeout: 5000 })
            .then(response => {
                this._handleHandshakeAck(response, resolve, reject);
            })
            .catch(error => {
                this._showOnce('ack_failed', `Handshake ACK failed: ${error.message}`, 'warn');
                this._scheduleRetry(resolve, reject);
            });
    },
    
    _handleHandshakeAck(response, resolve, reject) {
        if (response.payload?.session) {
            this._completeHandshake(response.payload);
            resolve({ success: true, session: response.payload.session });
        } else if (response.payload?.status === 'acknowledged') {
            this.state.status = 'awaiting_ack';
            
            setTimeout(() => {
                if (this.state.status === 'awaiting_ack') {
                    this._showOnce('session_timeout', 'Session timeout', 'warn');
                    this._scheduleRetry(resolve, reject);
                }
            }, IframeEnvironment.getAdaptiveConfig().handshakeTimeout);
        } else {
            this._showOnce('invalid_response', 'Invalid handshake response', 'warn');
            this._scheduleRetry(resolve, reject);
        }
    },
    
    _completeHandshake(sessionData) {
        this.state.status = 'completed';
        this.state.completed = true;
        this.state.retryCount = 0;
        
        if (window.kynState) {
            window.kynState.handshakeCompleted = true;
            window.kynState.handshakeAttempts = this.state.retryCount;
        }
        
        StartupGovernor.state.handshakeCompleted = true;
        StartupGovernor._transitionTo('SYNCING');
        
        this._showOnce('complete', 'Handshake completed successfully', 'debug');
        
        IframeTransport.off('PARENT_READY', this._parentReadyHandler);
        StartupGovernor.releaseLock();
        
        window.dispatchEvent(new CustomEvent('kynHandshakeComplete', {
            detail: {
                timestamp: Date.now(),
                parentVersion: this.state.parentVersion,
                attempts: this.state.retryCount
            }
        }));
        
        if (sessionData) {
            IframeSessionClient.handleSessionData(sessionData);
        }
    },
    
    _scheduleRetry(resolve, reject) {
        this.state.retryCount++;
        
        IframeTransport.off('PARENT_READY', this._parentReadyHandler);
        
        if (this.state.retryCount > this.state.maxRetries) {
            this._showOnce('max_retries', `Max retries exceeded (${this.state.maxRetries})`, 'warn');
            this.state.status = 'failed';
            this.state.failed = true;
            
            if (window.kynState) window.kynState.compatibilityMode = true;
            StartupGovernor._transitionTo('DEGRADED', 'Handshake failed');
            
            window.dispatchEvent(new CustomEvent('kynHandshakeFailed', {
                detail: {
                    compatibilityMode: true,
                    reason: 'max_retries',
                    retries: this.state.retryCount
                }
            }));
            
            StartupGovernor.releaseLock();
            reject(new Error('Handshake failed after max retries'));
            return;
        }
        
        const delay = this._getBackoff(this.state.retryCount);
        this._showOnce('scheduling', `Scheduling retry ${this.state.retryCount} in ${delay}ms`, 'debug');
        
        setTimeout(() => {
            this.state.status = 'idle';
            this.start().then(resolve).catch(reject);
        }, delay);
    },
    
    _getBackoff(attempt) {
        const base = this.state.backoffMs;
        const delay = base * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.3 * delay;
        return Math.min(delay + jitter, 30000);
    },
    
    isComplete() {
        return this.state.completed || this.state.failed;
    },
    
    reset() {
        this.state = {
            status: 'idle',
            retryCount: 0,
            maxRetries: IframeEnvironment.getAdaptiveConfig().maxRetries,
            backoffMs: IframeEnvironment.getAdaptiveConfig().backoffBase,
            handshakeId: null,
            parentVersion: null,
            completed: false,
            failed: false
        };
    }
};

// =============================================
// [9] IFRAME SESSION CLIENT - Session Management
// =============================================

export const IframeSessionClient = {
    state: {
        status: 'idle',
        lastSync: null,
        expiresAt: null,
        refreshTimer: null,
        pendingRefresh: false,
        sessionData: null,
        refreshAttempts: 0,
        maxRefreshAttempts: 3,
        token: null,
        user: null
    },
    
    _warningsShown: new Set(),
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[IframeSessionClient] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV')) {
            console.log(`[IframeSessionClient] ${message}`);
        }
    },
    
    request() {
        if (!IframeHandshakeAuthority.isComplete() && !window.kynState?.compatibilityMode) {
            this._showOnce('wait_handshake', 'Handshake not complete, delaying session request', 'debug');
            return;
        }
        
        if (this.state.status === 'requesting' || this.state.pendingRefresh) {
            this._showOnce('already_pending', 'Session request already pending', 'debug');
            return;
        }
        
        this.state.status = 'requesting';
        
        this._showOnce('requesting', 'Requesting session from parent', 'debug');
        
        IframeTransport.send('REQUEST_SESSION', {
            frameId: IframeTransport.getFrameId(),
            timestamp: Date.now(),
            protocol: 'KYN-2.0',
            environment: IframeEnvironment.type
        }, { requireAck: true, timeout: 5000 })
            .then(response => {
                if (response.payload?.session) {
                    this.handleSessionData(response.payload.session);
                } else {
                    this.state.status = 'idle';
                    this._tryCached();
                }
            })
            .catch(error => {
                this._showOnce('request_failed', `Session request failed: ${error.message}`, 'warn');
                this.state.status = 'idle';
                this._tryCached();
            });
    },
    
    handleSessionData(session) {
        if (!session || (!session.token && !session.user)) {
            this._showOnce('invalid_session', 'Invalid session data', 'warn');
            return;
        }
        
        const token = session.token || session.accessToken;
        const user = session.user || session.profile;
        
        if (!token || !user) {
            this._showOnce('incomplete', 'Incomplete session data', 'warn');
            return;
        }
        
        SafeStorage.setItem('USER_TOKEN', token);
        SafeStorage.setObject('USER_DATA', user);
        
        this.state.status = 'active';
        this.state.lastSync = Date.now();
        this.state.expiresAt = session.expiresAt || Date.now() + 3600000;
        this.state.sessionData = session;
        this.state.token = token;
        this.state.user = user;
        this.state.refreshAttempts = 0;
        
        if (window.currentUser) window.currentUser = user;
        if (window.userData) window.userData = user;
        
        this._setupRefreshTimer();
        
        StartupGovernor.state.sessionValid = true;
        StartupGovernor._transitionTo('ACTIVE');
        
        this._showOnce('active', 'Session activated', 'debug');
        
        IframeTransport.send('SESSION_ACK', {
            frameId: IframeTransport.getFrameId(),
            timestamp: Date.now(),
            status: 'accepted',
            expiresAt: this.state.expiresAt
        }, { requireAck: false });
        
        window.dispatchEvent(new CustomEvent('kynSessionReady', {
            detail: { session, timestamp: Date.now() }
        }));
    },
    
    _tryCached() {
        const token = SafeStorage.getItem('USER_TOKEN');
        const userStr = SafeStorage.getItem('USER_DATA');
        
        if (token && userStr) {
            try {
                const user = JSON.parse(userStr);
                this.state.status = 'cached';
                this.state.token = token;
                this.state.user = user;
                this.state.sessionData = { token, user };
                this.state.expiresAt = Date.now() + 3600000;
                
                if (window.currentUser) window.currentUser = user;
                if (window.userData) window.userData = user;
                
                this._showOnce('cached', 'Using cached session', 'debug');
                
                window.dispatchEvent(new CustomEvent('kynSessionCached', {
                    detail: { user, timestamp: Date.now() }
                }));
                
                StartupGovernor._transitionTo('ACTIVE', 'Using cached session');
            } catch (e) {
                this._showOnce('cache_invalid', 'Cached session invalid', 'warn');
                this.state.status = 'expired';
            }
        } else {
            this._showOnce('no_session', 'No session available', 'debug');
            this.state.status = 'expired';
            StartupGovernor._transitionTo('DEGRADED', 'No session');
        }
    },
    
    _setupRefreshTimer() {
        if (this.state.refreshTimer) clearTimeout(this.state.refreshTimer);
        if (!this.state.expiresAt) return;
        
        const refreshTime = this.state.expiresAt - 300000;
        
        if (refreshTime > Date.now()) {
            this.state.refreshTimer = setTimeout(() => {
                this._refresh();
            }, refreshTime - Date.now());
            
            this._showOnce('refresh_scheduled', `Refresh scheduled`, 'debug');
        }
    },
    
    _refresh() {
        if (this.state.pendingRefresh) return;
        if (this.state.refreshAttempts >= this.state.maxRefreshAttempts) {
            this._showOnce('refresh_max', 'Max refresh attempts exceeded', 'warn');
            this._expire();
            return;
        }
        
        this.state.pendingRefresh = true;
        this.state.refreshAttempts++;
        
        this._showOnce('refreshing', `Refreshing session (attempt ${this.state.refreshAttempts})`, 'debug');
        
        IframeTransport.send('REFRESH_SESSION', {
            frameId: IframeTransport.getFrameId(),
            timestamp: Date.now(),
            currentExpiry: this.state.expiresAt
        }, { requireAck: true, timeout: 5000 })
            .then(response => {
                if (response.payload?.session) {
                    this.handleSessionData(response.payload.session);
                    this.state.refreshAttempts = 0;
                } else {
                    throw new Error('Invalid refresh response');
                }
            })
            .catch(error => {
                this._showOnce('refresh_failed', `Session refresh failed: ${error.message}`, 'warn');
                this.request();
            })
            .finally(() => {
                this.state.pendingRefresh = false;
            });
    },
    
    _expire() {
        this.state.status = 'expired';
        this.state.sessionData = null;
        this.state.token = null;
        this.state.user = null;
        
        SafeStorage.removeItem('USER_TOKEN');
        SafeStorage.removeItem('USER_DATA');
        
        if (window.currentUser) window.currentUser = null;
        if (window.userData) window.userData = null;
        
        StartupGovernor.state.sessionValid = false;
        StartupGovernor._transitionTo('DEGRADED', 'Session expired');
        
        window.dispatchEvent(new CustomEvent('kynSessionExpired'));
    },
    
    isValid() {
        return this.state.status === 'active' || this.state.status === 'cached';
    },
    
    getToken() {
        return this.state.token || SafeStorage.getItem('USER_TOKEN');
    },
    
    getUser() {
        return this.state.user || SafeStorage.getObject('USER_DATA');
    },
    
    getSession() {
        return this.state.sessionData;
    },
    
    clear() {
        if (this.state.refreshTimer) clearTimeout(this.state.refreshTimer);
        this.state = {
            status: 'idle',
            lastSync: null,
            expiresAt: null,
            refreshTimer: null,
            pendingRefresh: false,
            sessionData: null,
            refreshAttempts: 0,
            maxRefreshAttempts: 3,
            token: null,
            user: null
        };
    }
};

// =============================================
// [10] RECOVERY MANAGER - Self-Healing
// =============================================

export const RecoveryManager = {
    state: {
        recoveryInProgress: false,
        lastRecovery: null,
        recoveryAttempts: 0,
        maxRecoveryAttempts: 3,
        recoveryBackoff: 5000
    },
    
    _warningsShown: new Set(),
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[RecoveryManager] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV')) {
            console.log(`[RecoveryManager] ${message}`);
        }
    },
    
    attempt(mode = 'full') {
        if (this.state.recoveryInProgress) {
            this._showOnce('already_recovering', 'Recovery already in progress', 'debug');
            return;
        }
        
        this.state.recoveryInProgress = true;
        this.state.recoveryAttempts++;
        this.state.lastRecovery = Date.now();
        
        this._showOnce('attempting', `Recovery attempt ${this.state.recoveryAttempts} (${mode})`, 'debug');
        
        window.dispatchEvent(new CustomEvent('kynRecoveryStarted', { detail: { mode } }));
        StartupGovernor._transitionTo('RECOVERING', `Recovery: ${mode}`);
        
        if (mode === 'full') {
            this._fullRecovery();
        } else if (mode === 'session') {
            this._sessionRecovery();
        } else {
            this._handshakeRecovery();
        }
    },
    
    _fullRecovery() {
        IframeHandshakeAuthority.reset();
        IframeSessionClient.clear();
        
        setTimeout(() => {
            IframeHandshakeAuthority.start()
                .then(() => {
                    IframeSessionClient.request();
                    this._complete();
                })
                .catch(() => {
                    this._fail();
                });
        }, 1000);
    },
    
    _sessionRecovery() {
        IframeSessionClient.clear();
        setTimeout(() => {
            IframeSessionClient.request();
            setTimeout(() => {
                if (IframeSessionClient.isValid()) {
                    this._complete();
                } else {
                    this._fail();
                }
            }, 3000);
        }, 500);
    },
    
    _handshakeRecovery() {
        IframeHandshakeAuthority.reset();
        setTimeout(() => {
            IframeHandshakeAuthority.start()
                .then(() => this._complete())
                .catch(() => this._fail());
        }, 500);
    },
    
    _complete() {
        this.state.recoveryInProgress = false;
        this.state.recoveryAttempts = 0;
        
        this._showOnce('recovered', 'Recovery successful', 'debug');
        
        StartupGovernor._transitionTo('ACTIVE', 'Recovery successful');
        
        window.dispatchEvent(new CustomEvent('kynRecoveryComplete', {
            detail: { timestamp: Date.now() }
        }));
    },
    
    _fail() {
        this.state.recoveryInProgress = false;
        
        if (this.state.recoveryAttempts < this.state.maxRecoveryAttempts) {
            const delay = this.state.recoveryBackoff * Math.pow(2, this.state.recoveryAttempts - 1);
            this._showOnce('scheduling', `Scheduling retry in ${delay}ms`, 'warn');
            
            setTimeout(() => {
                this.attempt('full');
            }, delay);
        } else {
            this._showOnce('failed', 'Recovery failed after max attempts', 'error');
            
            if (window.kynState) window.kynState.compatibilityMode = true;
            StartupGovernor._transitionTo('DEGRADED', 'Recovery failed');
            
            window.dispatchEvent(new CustomEvent('kynRecoveryFailed', {
                detail: { attempts: this.state.recoveryAttempts }
            }));
        }
    },
    
    checkHealth() {
        if (!IframeHandshakeAuthority.isComplete() && !window.kynState?.compatibilityMode) {
            if (Date.now() - StartupGovernor.state.lastTransition > 30000) {
                this._showOnce('health_handshake', 'Handshake stale, recovering', 'warn');
                this.attempt('handshake');
                return false;
            }
        }
        
        if (!IframeSessionClient.isValid() && IframeHandshakeAuthority.isComplete()) {
            if (Date.now() - (IframeSessionClient.state.lastSync || 0) > 60000) {
                this._showOnce('health_session', 'Session stale, recovering', 'warn');
                this.attempt('session');
                return false;
            }
        }
        
        return true;
    }
};

// =============================================
// [11] DIAGNOSTICS AGENT - Telemetry
// =============================================

export const DiagnosticsAgent = {
    enabled: window.location.hostname === 'localhost' || 
             window.location.hostname === '127.0.0.1' ||
             SafeStorage.getItem('kyn_debug') === 'true',
    
    metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        acksReceived: 0,
        retries: 0,
        failures: 0,
        handshakeTime: null,
        handshakeAttempts: 0,
        sessionRefreshes: 0,
        recoveries: 0,
        compatibilityMode: false,
        startupTime: Date.now(),
        environment: IframeEnvironment.type
    },
    
    events: [],
    maxEvents: 50,
    _warningsShown: new Set(),
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[DiagnosticsAgent] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV')) {
            console.log(`[DiagnosticsAgent] ${message}`);
        }
    },
    
    enable() {
        this.enabled = true;
        this._showOnce('enabled', 'Diagnostics enabled', 'debug');
    },
    
    disable() {
        this.enabled = false;
    },
    
    trackSend(type) {
        if (!this.enabled) return;
        this.metrics.messagesSent++;
        this._logEvent('send', { type });
    },
    
    trackReceive(type) {
        if (!this.enabled) return;
        this.metrics.messagesReceived++;
        this._logEvent('receive', { type });
    },
    
    trackAck() {
        if (!this.enabled) return;
        this.metrics.acksReceived++;
    },
    
    trackRetry() {
        if (!this.enabled) return;
        this.metrics.retries++;
        this._logEvent('retry', {});
    },
    
    trackFailure(error, context) {
        if (!this.enabled) return;
        this.metrics.failures++;
        this._logEvent('failure', { error: error?.message, context });
    },
    
    trackHandshake(phase) {
        if (!this.enabled) return;
        if (phase === 'complete') {
            this.metrics.handshakeTime = Date.now() - this.metrics.startupTime;
            this.metrics.handshakeAttempts++;
        }
        this._logEvent('handshake', { phase });
    },
    
    trackSessionRefresh() {
        if (!this.enabled) return;
        this.metrics.sessionRefreshes++;
        this._logEvent('session_refresh', {});
    },
    
    trackRecovery(success) {
        if (!this.enabled) return;
        if (success) this.metrics.recoveries++;
        this._logEvent('recovery', { success });
    },
    
    _logEvent(category, data) {
        this.events.push({
            category,
            data,
            timestamp: Date.now()
        });
        
        if (this.events.length > this.maxEvents) {
            this.events.shift();
        }
    },
    
    getMetrics() {
        return {
            ...this.metrics,
            queueLength: ReliabilityEngine.queue.length,
            handshakeComplete: IframeHandshakeAuthority.isComplete(),
            sessionValid: IframeSessionClient.isValid(),
            sessionStatus: IframeSessionClient.state.status,
            handshakeStatus: IframeHandshakeAuthority.state.status,
            transportStats: {
                pendingAcks: IframeTransport._pendingAcks.size,
                messageCache: IframeTransport._messageCache.size
            },
            uptime: Date.now() - this.metrics.startupTime
        };
    },
    
    getHealth() {
        const metrics = this.getMetrics();
        
        let status = 'healthy';
        if (window.kynState?.compatibilityMode) {
            status = 'degraded';
        } else if (!IframeHandshakeAuthority.isComplete()) {
            status = 'connecting';
        } else if (!IframeSessionClient.isValid()) {
            status = 'degraded';
        }
        
        return {
            status,
            metrics,
            environment: IframeEnvironment.type,
            timestamp: Date.now()
        };
    },
    
    getEvents(limit = 20) {
        return this.events.slice(-limit);
    },
    
    clear() {
        this.metrics = {
            messagesSent: 0,
            messagesReceived: 0,
            acksReceived: 0,
            retries: 0,
            failures: 0,
            handshakeTime: null,
            handshakeAttempts: 0,
            sessionRefreshes: 0,
            recoveries: 0,
            compatibilityMode: false,
            startupTime: Date.now(),
            environment: IframeEnvironment.type
        };
        this.events = [];
    }
};

// =============================================
// [12] NAVIGATION GUARD - Protect Routes
// =============================================

export const NavigationGuard = {
    _guarded: false,
    _warningsShown: new Set(),
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[NavigationGuard] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV')) {
            console.log(`[NavigationGuard] ${message}`);
        }
    },
    
    guard() {
        if (this._guarded) return;
        
        window.addEventListener('beforeunload', (e) => {
            SafeStorage.setObject('navigation_state', {
                section: UIState?.activeSection,
                friendId: UIState?.selectedFriendId,
                timestamp: Date.now()
            });
        });
        
        this._guarded = true;
        this._showOnce('guarded', 'Navigation guard active', 'debug');
    },
    
    restore() {
        const state = SafeStorage.getObject('navigation_state');
        if (state && Date.now() - state.timestamp < 300000) {
            this._showOnce('restored', `Restoring navigation state`, 'debug');
            return state;
        }
        return null;
    }
};

// =============================================
// [13] UI FAILSAFE - UI Resilience
// =============================================

export const UIFailsafe = {
    _buttonStates: new Map(),
    _warningsShown: new Set(),
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[UIFailsafe] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV')) {
            console.log(`[UIFailsafe] ${message}`);
        }
    },
    
    protectButton(button, action) {
        if (!button) return;
        
        const originalClick = button.onclick;
        const disabled = button.disabled;
        
        this._buttonStates.set(button, {
            originalClick,
            disabled,
            action
        });
        
        button.addEventListener('click', (e) => {
            if (!IframeSessionClient.isValid() && !window.kynState?.compatibilityMode) {
                e.preventDefault();
                e.stopPropagation();
                this._showOnce('button_blocked', `Button blocked - no session`, 'warn');
                return false;
            }
        });
    },
    
    restoreButtons() {
        this._buttonStates.forEach((state, button) => {
            if (button && button.onclick !== state.originalClick) {
                button.onclick = state.originalClick;
                button.disabled = state.disabled;
            }
        });
    },
    
    showFallback(container, message = 'Temporarily unavailable') {
        if (!container) return;
        
        const fallback = document.createElement('div');
        fallback.className = 'empty-state';
        fallback.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: var(--warning-color);"></i>
            <p>${message}</p>
            <p class="subtext">Please try again later</p>
        `;
        
        container.innerHTML = '';
        container.appendChild(fallback);
    }
};

// =============================================
// [14] SANDBOX & CSP AWARE MODE
// =============================================

export const SandboxDetector = {
    detected: false,
    restrictions: {
        localStorage: true,
        cookies: true,
        parentAccess: true,
        postMessage: true,
        crypto: true
    },
    _warningsShown: new Set(),
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[SandboxDetector] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV')) {
            console.log(`[SandboxDetector] ${message}`);
        }
    },
    
    detect() {
        try {
            this._testLocalStorage();
            this._testParentAccess();
            this._testCrypto();
            
            if (!this.restrictions.localStorage || !this.restrictions.parentAccess) {
                this.detected = true;
                if (window.kynState) window.kynState.sandboxDetected = true;
                this._showOnce('detected', 'Sandbox restrictions detected', 'warn');
            }
            
        } catch (error) {
            this._showOnce('detect_error', `Sandbox detection error: ${error.message}`, 'error');
        }
        
        return this.detected;
    },
    
    _testLocalStorage() {
        try {
            localStorage.setItem('__test__', 'test');
            localStorage.removeItem('__test__');
        } catch (e) {
            this.restrictions.localStorage = false;
        }
    },
    
    _testParentAccess() {
        try {
            if (window.parent && window.parent !== window) {
                const test = window.parent.location.href;
            }
        } catch (e) {
            this.restrictions.parentAccess = false;
        }
    },
    
    _testCrypto() {
        try {
            if (!window.crypto || !window.crypto.subtle) {
                this.restrictions.crypto = false;
            }
        } catch (e) {
            this.restrictions.crypto = false;
        }
    },
    
    adapt() {
        if (this.detected) {
            if (window.kynState) window.kynState.compatibilityMode = true;
            if (window.featureFlags) {
                window.featureFlags.messageSigning = false;
                window.featureFlags.heartbeat = false;
            }
            this._showOnce('adapted', 'Compatibility mode enabled', 'warn');
        }
    }
};

SandboxDetector.detect();
SandboxDetector.adapt();


export const ModuleCoordinator = {
    initialized: false,
    modules: {
        transport: false,
        handshake: false,
        session: false,
        recovery: false,
        diagnostics: false
    },
    _warningsShown: new Set(),
    _startPromise: null, // Prevent multiple starts
    
    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        
        if (level === 'warn') {
            console.warn(`[ModuleCoordinator] ${message}`);
        } else if (level === 'debug' && (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV')) {
            console.log(`[ModuleCoordinator] ${message}`);
        }
    },
    
    init() {
        if (this.initialized) return this;
        
        const frameId = IframeTransport.getFrameId();
        
        window.kynState = window.kynState || {
            frameId,
            handshakeCompleted: false,
            handshakeAttempts: 0,
            sessionValid: false,
            parentReady: false,
            parentOrigin: '*',
            lastPong: Date.now(),
            pingInterval: null,
            retryQueue: [],
            pendingAcks: new Map(),
            messageSequence: 0,
            protocolVersion: 'KYN-2.0',
            compatibilityMode: SandboxDetector.detected,
            sandboxDetected: SandboxDetector.detected,
            startupPhase: 'INIT',
            startupLock: false
        };
        
        IframeTransport.init(frameId);
        this.modules.transport = true;
        
        window.IframeTransport = IframeTransport;
        window.IframeHandshakeAuthority = IframeHandshakeAuthority;
        window.IframeSessionClient = IframeSessionClient;
        window.RecoveryManager = RecoveryManager;
        window.DiagnosticsAgent = DiagnosticsAgent;
        window.IframeEnvironment = IframeEnvironment;
        window.StartupGovernor = StartupGovernor;
        window.SafeStorage = SafeStorage;
        window.CompatibilityBridge = CompatibilityBridge;
        window.ReliabilityEngine = ReliabilityEngine;
        window.NavigationGuard = NavigationGuard;
        window.UIFailsafe = UIFailsafe;
        window.SandboxDetector = SandboxDetector;
        
        this.initialized = true;
        
        if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
            console.log('[ModuleCoordinator] All modules coordinated');
        }
        
        return this;
    },
    
        start() {
        // Prevent multiple start attempts
        if (this._startPromise) {
            if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                console.log('[ModuleCoordinator] Start already in progress');
            }
            return this._startPromise;
        }
        
        if (!this.initialized) this.init();
        
        this._startPromise = new Promise((resolve, reject) => {
            // Small delay to ensure everything is ready
            setTimeout(() => {
                // Check if we're already in a handshake or if governor is locked
                if (StartupGovernor.state.lock) {
                    if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                        console.log('[ModuleCoordinator] Governor locked, waiting for release...');
                    }
                    
                    // Wait for governor to be unlocked, then proceed
                    const checkInterval = setInterval(() => {
                        if (!StartupGovernor.state.lock) {
                            clearInterval(checkInterval);
                            this._proceedWithStart(resolve, reject);
                        }
                    }, 100);
                    
                    // Timeout after 5 seconds
                    setTimeout(() => {
                        clearInterval(checkInterval);
                        if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                            console.warn('[ModuleCoordinator] Governor lock timeout, forcing start');
                        }
                        // Force unlock and proceed
                        StartupGovernor.releaseLock();
                        this._proceedWithStart(resolve, reject);
                    }, 5000);
                } else {
                    this._proceedWithStart(resolve, reject);
                }
            }, 100);
        });
        
        return this._startPromise;
    },
    
    _proceedWithStart(resolve, reject) {
        IframeHandshakeAuthority.start()
            .then((result) => {
                this.modules.handshake = true;
                IframeSessionClient.request();
                this.modules.session = true;
                this.modules.recovery = true;
                this.modules.diagnostics = true;
                if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                    console.log('[ModuleCoordinator] All modules started');
                }
                resolve(result);
            })
            .catch((error) => {
                if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                    console.error('[ModuleCoordinator] Start failed:', error.message);
                }
                reject(error);
            });
    },
    // Health check intervals - start once
    startHealthChecks() {
        if (this._healthInterval) return;
        
        this._healthInterval = setInterval(() => {
            if (RecoveryManager && !window.kynState?.compatibilityMode) {
                RecoveryManager.checkHealth();
            }
        }, 30000);
        
        this._staleInterval = setInterval(() => {
            if (ReliabilityEngine) {
                ReliabilityEngine.clearStale();
            }
        }, 60000);
    },
    
    // Call this after successful start
    afterStart() {
        this.startHealthChecks();
    }
};

// =============================================
// [16] DEBUG FLAG
// =============================================

window.__IFRAME_DEBUG__ = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          SafeStorage.getItem('kyn_debug') === 'true';

// =============================================
// [17] SYSTEM STATE & CONSTANTS (Original - Preserved)
// =============================================

export let currentUser = null;
export let userData = null;
export let friends = [];
export let contacts = [];
export let friendRequests = [];
export let sentRequests = [];
export let temporaryFriends = [];
export let pinnedFriends = [];
export let mutedFriends = [];
export let selectedFriend = null;
export let currentCategoryFilter = 'all';
export let currentSearchTerm = '';
export let isMobile = window.innerWidth <= 768;
export let mutualFriendsCache = {};
export let groups = [];
export let allUsers = [];
export let cameraStream = null;
export let currentCamera = 'environment';
export let flashOn = false;
export let apiReady = false;
export let scanningActive = false;
export let isInitialized = false;
export let initializationStarted = false;
export let backgroundSyncInterval = null;
export let isAuthReady = false;
export let backgroundTasksStarted = false;
export let cacheLoaded = false;

export let kynState = window.kynState || {
    frameId: null,
    handshakeCompleted: false,
    handshakeAttempts: 0,
    sessionValid: false,
    parentReady: false,
    parentOrigin: '*',
    lastPong: Date.now(),
    pingInterval: null,
    retryQueue: [],
    pendingAcks: new Map(),
    messageSequence: 0,
    protocolVersion: 'KYN-2.0',
    compatibilityMode: SandboxDetector.detected,
    sandboxDetected: SandboxDetector.detected,
    startupPhase: 'INIT',
    startupLock: false,
    sessionExpiresAt: null,
    lastSync: null,
    degradedReason: null,
    recoveryAttempts: 0
};

export const featureFlags = {
    qrCode: true,
    camera: true,
    contactsSync: true,
    mutualFriends: true,
    groups: true,
    temporaryFriends: true,
    pinnedFriends: true,
    mutedFriends: true,
    discovery: true,
    notes: true,
    kynProtocol: true,
    messageSigning: !SandboxDetector.detected,
    heartbeat: !SandboxDetector.detected,
    retryQueue: true,
    offlineBuffer: true,
    batchMessages: IframeEnvironment.features.isVpnNetwork,
    compression: IframeEnvironment.features.saveData,
    keepalive: IframeEnvironment.features.isVpnNetwork
};

export const friendCategories = {
    'acquaintance': { 
        name: 'Acquaintance', 
        color: 'var(--category-acquaintance)', 
        icon: 'fas fa-handshake', 
        description: 'Someone you know casually' 
    },
    'friend': { 
        name: 'Friend', 
        color: 'var(--category-friend)', 
        icon: 'fas fa-user-friends', 
        description: 'A regular friend' 
    },
    'close-friend': { 
        name: 'Close Friend', 
        color: 'var(--category-close-friend)', 
        icon: 'fas fa-heart', 
        description: 'A close personal friend' 
    },
    'family': { 
        name: 'Family', 
        color: 'var(--category-family)', 
        icon: 'fas fa-users', 
        description: 'Family member' 
    },
    'business': { 
        name: 'Business', 
        color: 'var(--category-business)', 
        icon: 'fas fa-briefcase', 
        description: 'Business contact' 
    },
    'pinned': { 
        name: 'Pinned', 
        color: 'var(--warning-color)', 
        icon: 'fas fa-thumbtack', 
        description: 'Pinned friend' 
    },
    'muted': { 
        name: 'Muted', 
        color: 'var(--text-secondary)', 
        icon: 'fas fa-volume-mute', 
        description: 'Muted friend' 
    }
};

export const LOCAL_STORAGE_KEYS = {
    USER: 'knecta_current_user',
    USER_TOKEN: 'USER_TOKEN',
    USER_DATA: 'USER_DATA',
    FRIENDS: 'knecta_friends_cache',
    CONTACTS: 'knecta_contacts_cache',
    REQUESTS: 'knecta_friend_requests_cache',
    SENT_REQUESTS: 'knecta_sent_requests_cache',
    TEMPORARY_FRIENDS: 'knecta_temporary_friends_cache',
    PINNED_FRIENDS: 'knecta_pinned_friends_cache',
    MUTED_FRIENDS: 'knecta_muted_friends_cache',
    LAST_SYNC: 'knecta_friends_last_sync',
    USER_PROFILE: 'knecta_user_profile_cache',
    UNIQUE_QR_CODE: 'knecta_unique_qr_code',
    MUTUAL_FRIENDS_CACHE: 'knecta_mutual_friends_cache',
    USER_GROUPS: 'knecta_user_groups_cache',
    LAST_INTERACTIONS: 'knecta_last_interactions',
    PRIVATE_NOTES: 'knecta_private_notes',
    ALL_USERS_CACHE: 'knecta_all_users_cache',
    KYN_SESSION: 'kyn_session_cache_v2',
    KYN_MESSAGE_QUEUE: 'kyn_message_queue_v2',
    KYN_STATE: 'kyn_state_cache',
    KYN_ORIGIN_TRUST: 'kyn_origin_trust'
};

export const dataSource = {
    source: 'parent',
    userData: null,
    token: null,
    fetching: false,
    fetched: false,
    parentSessionReceived: false,
    parentControlled: true,
    fallbackMode: false
};

const ENV_CONFIG = IframeEnvironment.getAdaptiveConfig();

// =============================================
// [18] HANDLESHAKE CLIENT v2 (Wrapped by Authority)
// =============================================

export const HandshakeClient = {
    state: IframeHandshakeAuthority.state,
    startHandshake: () => IframeHandshakeAuthority.start(),
    isComplete: () => IframeHandshakeAuthority.isComplete(),
    reset: () => IframeHandshakeAuthority.reset()
};

// =============================================
// [19] SESSION CLIENT v2 (Wrapped)
// =============================================

export const SessionClient = {
    state: IframeSessionClient.state,
    requestSession: () => IframeSessionClient.request(),
    handleSessionData: (data) => IframeSessionClient.handleSessionData(data),
    isValid: () => IframeSessionClient.isValid(),
    getSession: () => IframeSessionClient.getSession(),
    clear: () => IframeSessionClient.clear()
};

// =============================================
// [20] HEARTBEAT CLIENT v2 (Simplified)
// =============================================

export const HeartbeatClient = {
    interval: null,
    missedPongs: 0,
    maxMissed: IframeEnvironment.features.highLatency ? 5 : 3,
    pingInterval: ENV_CONFIG.heartbeatInterval,
    lastPingTime: null,
    lastPongTime: null,
    
    start() {
        if (this.interval) return;
        if (!featureFlags.heartbeat) return;
        
        this.interval = setInterval(() => this.sendPing(), this.pingInterval);
        if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
            console.log('[HeartbeatClient] Heartbeat started');
        }
    },
    
    sendPing() {
        if (!kynState.parentReady) return;
        
        this.lastPingTime = Date.now();
        
        IframeTransport.send('PING', { timestamp: this.lastPingTime }, { requireAck: false });
        
        setTimeout(() => {
            if (Date.now() - kynState.lastPong > this.pingInterval * 1.5) {
                this.missedPongs++;
                if (this.missedPongs >= this.maxMissed) {
                    this.handleConnectionLost();
                }
            }
        }, this.pingInterval);
    },
    
    handlePong(data) {
        kynState.lastPong = Date.now();
        this.lastPongTime = kynState.lastPong;
        this.missedPongs = 0;
        
        if (data.payload?.timestamp && this.lastPingTime) {
            const latency = kynState.lastPong - this.lastPingTime;
            if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
                console.log(`[HeartbeatClient] Latency: ${latency}ms`);
            }
        }
    },
    
    handleConnectionLost() {
        this.stop();
        kynState.parentReady = false;
        kynState.handshakeCompleted = false;
        StartupGovernor._transitionTo('RECOVERING', 'Connection lost');
        RecoveryManager.attempt('handshake');
    },
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.missedPongs = 0;
    },
    
    reset() {
        this.stop();
        this.missedPongs = 0;
        this.lastPingTime = null;
        this.lastPongTime = null;
    },
    
    getAverageLatency() {
        return 0;
    }
};

IframeTransport.on('PONG', (data) => HeartbeatClient.handlePong(data));

// =============================================
// [21] TRANSPORT AGENT (Wrapped)
// =============================================

export const TransportAgent = {
    config: ENV_CONFIG,
    stats: ReliabilityEngine.getStats,
    sendReliable: (type, payload, options) => IframeTransport.send(type, payload, options),
    getStats: () => ReliabilityEngine.getStats()
};

// =============================================
// [22] SECURITY MANAGER (Preserved)
// =============================================

export const SecurityManager = {
    originWhitelist: OriginAdapter.trustStore,
    token: null,
    
    init() {
        OriginAdapter.trustedOrigins.forEach(origin => this.originWhitelist.add(origin));
    },
    
    isOriginTrusted: (origin) => OriginAdapter.isOriginTrusted(origin),
    
    sanitizeMessage(data) {
        if (!data || typeof data !== 'object') return null;
        try {
            return JSON.parse(JSON.stringify(data));
        } catch (e) {
            return null;
        }
    },
    
    signMessage(message) {
        if (kynState.compatibilityMode || !message.token) return null;
        try {
            const data = `${message.messageId}:${message.type}:${message.timestamp}:${message.token}`;
            let hash = 0;
            for (let i = 0; i < data.length; i++) {
                hash = ((hash << 5) - hash) + data.charCodeAt(i);
                hash = hash & hash;
            }
            return Math.abs(hash).toString(16) + Date.now().toString(16).substr(-8);
        } catch (e) {
            return null;
        }
    },
    
    verifySignature(message) {
        if (!message.signature || kynState.compatibilityMode) return true;
        const expected = this.signMessage(message);
        return expected === message.signature;
    },
    
    validateOrigin: (event) => OriginAdapter.validateMessage(event),
    
    detectSandbox: () => SandboxDetector.detect(),
    
    configureForEnvironment() {
        if (kynState.sandboxDetected) {
            featureFlags.messageSigning = false;
            featureFlags.heartbeat = false;
        }
    },
    
    isolateToken(token) {
        this.token = token;
        return () => this.token;
    },
    
    clearToken() {
        this.token = null;
    }
};

SecurityManager.init();

// =============================================
// [23] MESSAGE BUS (Wrapped)
// =============================================

export const MessageBus = {
    handlers: new Map(),
    pendingAcks: new Map(),
    messageCache: new Set(),
    
    init() {
        this._setupListener();
    },
    
    _setupListener() {
        window.addEventListener('message', this.handleIncoming.bind(this));
    },
    
    validateOrigin: (origin) => OriginAdapter.isOriginTrusted(origin),
    
    validateMessage(data) {
        return !!(data && data.type && data.messageId);
    },
    
    handleIncoming(event) {
        if (!this.validateOrigin(event.origin)) return;
        if (!this.validateMessage(event.data)) return;
        
        const adapted = CompatibilityBridge.adaptIncoming(event.data);
        if (!adapted) return;
        
        DiagnosticsAgent.trackReceive(adapted.type);
        
        const { messageId, type, ack } = adapted;
        
        if (this.messageCache.has(messageId)) return;
        this.messageCache.add(messageId);
        setTimeout(() => this.messageCache.delete(messageId), 60000);
        
        if (ack) {
            const pending = this.pendingAcks.get(messageId);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve(adapted);
                this.pendingAcks.delete(messageId);
            }
            return;
        }
        
        const handler = this.handlers.get(type);
        if (handler) {
            try {
                handler(adapted, event);
            } catch (e) {}
        }
        
        if (adapted.requireAck) {
            this.send(event.source, {
                type: 'ACK',
                messageId,
                ack: true,
                timestamp: Date.now()
            }, event.origin);
        }
    },
    
    send(target, message, targetOrigin = '*') {
        if (!target || !message) return false;
        
        if (!message.messageId) {
            message.messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        message.timestamp = message.timestamp || Date.now();
        
        const adapted = CompatibilityBridge.adaptOutgoing(message);
        
        try {
            target.postMessage(adapted, targetOrigin);
            DiagnosticsAgent.trackSend(adapted.type);
            return true;
        } catch (e) {
            return false;
        }
    },
    
    sendToParent(message) {
        if (!window.parent || window.parent === window) return false;
        return this.send(window.parent, message, kynState.parentOrigin || '*');
    },
    
    sendWithAck(message, timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (!this.sendToParent(message)) {
                reject(new Error('Failed to send message'));
                return;
            }
            
            const messageId = message.messageId;
            const timeoutId = setTimeout(() => {
                this.pendingAcks.delete(messageId);
                reject(new Error('ACK timeout'));
            }, timeout);
            
            this.pendingAcks.set(messageId, { resolve, reject, timeout: timeoutId });
        });
    },
    
    on(type, handler) {
        this.handlers.set(type, handler);
    },
    
    off(type, handler) {
        this.handlers.delete(type);
    },
    
    destroy() {
        window.removeEventListener('message', this.handleIncoming.bind(this));
        this.pendingAcks.forEach((pending, id) => clearTimeout(pending.timeout));
        this.pendingAcks.clear();
        this.handlers.clear();
        this.messageCache.clear();
    }
};

MessageBus.init();

// =============================================
// [24] ERROR HANDLING
// =============================================

export const ErrorHandler = {
    boundaries: new Map(),
    circuitBreakers: new Map(),
    _logger: null,
    
    setLogger(logger) {
        this._logger = logger;
    },
    
    init() {
        window.addEventListener('error', (event) => {
            this.handleGlobalError(event.error || event.message);
            event.preventDefault();
            return true;
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.handleGlobalError(event.reason || 'Unhandled Promise rejection');
            event.preventDefault();
            return true;
        });
    },
    
    handleGlobalError(error) {
        const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        DiagnosticsAgent.trackFailure(error, { global: true, errorId });
    },
    
    createCircuitBreaker(name, options = {}) {
        const defaults = { failureThreshold: 3, successThreshold: 1, timeout: 30000 };
        const config = { ...defaults, ...options };
        
        const breaker = {
            name,
            state: 'CLOSED',
            failures: 0,
            successes: 0,
            lastFailure: null,
            nextAttempt: null,
            
            async execute(fn) {
                if (this.state === 'OPEN') {
                    if (Date.now() >= this.nextAttempt) {
                        this.state = 'HALF_OPEN';
                    } else {
                        throw new Error(`Circuit breaker OPEN for ${name}`);
                    }
                }
                
                try {
                    const result = await fn();
                    
                    if (this.state === 'HALF_OPEN') {
                        this.successes++;
                        if (this.successes >= config.successThreshold) {
                            this.reset();
                        }
                    }
                    
                    return result;
                } catch (error) {
                    this.failures++;
                    this.lastFailure = Date.now();
                    
                    if (this.state === 'CLOSED' && this.failures >= config.failureThreshold) {
                        this.state = 'OPEN';
                        this.nextAttempt = Date.now() + config.timeout;
                    }
                    
                    if (this.state === 'HALF_OPEN') {
                        this.state = 'OPEN';
                        this.nextAttempt = Date.now() + config.timeout;
                    }
                    
                    throw error;
                }
            },
            
            reset() {
                this.state = 'CLOSED';
                this.failures = 0;
                this.successes = 0;
                this.lastFailure = null;
                this.nextAttempt = null;
            }
        };
        
        this.circuitBreakers.set(name, breaker);
        return breaker;
    },
    
    getCircuitBreaker(name) {
        return this.circuitBreakers.get(name);
    },
    
    createBoundary(name, fn, fallback = null) {
        return function(...args) {
            try {
                return fn.apply(this, args);
            } catch (error) {
                DiagnosticsAgent.trackFailure(error, { boundary: name });
                if (typeof fallback === 'function') {
                    return fallback.apply(this, args);
                }
                return fallback;
            }
        };
    }
};

ErrorHandler.init();

// =============================================
// [25] LOGGING SYSTEM
// =============================================

export const Logger = {
    levels: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 },
    currentLevel: IframeEnvironment.type === 'LOCAL_DEV' ? 0 : 1,
    module: 'FriendCore',
    onceTracker: new Set(),
    
    format(level, module, message, data) {
        return `[${new Date().toISOString()}] [${this.module}:${module}] [${level}] ${message}`;
    },
    
    debug(module, message, data) {
        if (this.currentLevel > this.levels.DEBUG) return;
        if (window.__IFRAME_DEBUG__ || IframeEnvironment.type === 'LOCAL_DEV') {
            console.debug(this.format('DEBUG', module, message), data || '');
        }
    },
    
    info(module, message, data) {
        if (this.currentLevel > this.levels.INFO) return;
        console.info(this.format('INFO', module, message), data || '');
    },
    
    warn(module, message, data) {
        if (this.currentLevel > this.levels.WARN) return;
        console.warn(this.format('WARN', module, message), data || '');
    },
    
    error(module, message, error, data) {
        if (this.currentLevel > this.levels.ERROR) return;
        console.error(this.format('ERROR', module, message), error || '', data || '');
        DiagnosticsAgent.trackFailure(error || message, { module });
    },
    
    once(key, message, error, data) {
        if (this.onceTracker.has(key)) return;
        this.onceTracker.add(key);
        if (error instanceof Error) {
            this.error('Once', message, error, { ...data, key });
        } else {
            this.warn('Once', `${message} (once)`, { ...data, key });
        }
    },
    
    clearCache() {
        this.onceTracker.clear();
    }
};

ErrorHandler.setLogger(Logger);

// =============================================
// [26] RESOURCE MANAGEMENT
// =============================================

export const ResourceManager = {
    timers: new Set(),
    listeners: new Map(),
    observers: new Set(),
    intervals: new Set(),
    
    registerTimer(timerId) {
        this.timers.add(timerId);
        return timerId;
    },
    
    clearTimer(timerId) {
        clearTimeout(timerId);
        clearInterval(timerId);
        this.timers.delete(timerId);
    },
    
    registerInterval(intervalId) {
        this.intervals.add(intervalId);
        return intervalId;
    },
    
    clearInterval(intervalId) {
        clearInterval(intervalId);
        this.intervals.delete(intervalId);
    },
    
    registerListener(target, type, handler, options = {}) {
        target.addEventListener(type, handler, options);
        const key = Symbol('listener');
        this.listeners.set(key, { target, type, handler, options });
        return key;
    },
    
    registerObserver(observer) {
        this.observers.add(observer);
        return observer;
    },
    
    release() {
        this.timers.forEach(id => {
            clearTimeout(id);
            clearInterval(id);
        });
        this.timers.clear();
        
        this.intervals.forEach(id => clearInterval(id));
        this.intervals.clear();
        
        this.listeners.forEach(({ target, type, handler, options }) => {
            target.removeEventListener(type, handler, options);
        });
        this.listeners.clear();
        
        this.observers.forEach(observer => {
            if (observer.disconnect) observer.disconnect();
        });
        this.observers.clear();
        
        IframeTransport.destroy();
        MessageBus.destroy();
        HeartbeatClient.stop();
    }
};

// =============================================
// [27] SAFETY GUARDS
// =============================================

export const SafetyGuards = {
    loggedErrors: new Set(),
    retryCounters: new Map(),
    messageCache: new Set(),
    
    safeLogError: function(module, functionName, error, data = null) {
        const errorKey = `${module}:${functionName}:${error?.message || error}`;
        if (!this.loggedErrors.has(errorKey)) {
            this.loggedErrors.add(errorKey);
            Logger.error(module, `${functionName} failed`, error, data);
        }
    },
    
    safeGetElement: function(id) {
        try {
            return document.getElementById(id);
        } catch (error) {
            return null;
        }
    },
    
    isSessionValid: function() {
        return !!(SessionClient.isValid() || (SessionManager.current && SessionManager.current.token));
    },
    
    isUserDataValid: function() {
        return !!(currentUser?.id || userData?.id || dataSource.userData?.id);
    },
    
    safeExecute: function(funcName, func, fallbackValue = null, context = null) {
        try {
            return func.call(context || this);
        } catch (error) {
            this.safeLogError('SafetyGuard', 'safeExecute', error);
            return fallbackValue;
        }
    }
};

// =============================================
// [28] PARENT COORDINATOR (Original - Preserved)
// =============================================

export const ParentCoordinator = {
    config: {
        parentOrigin: window.location.origin,
        handshakeTimeout: ENV_CONFIG.handshakeTimeout,
        maxRetries: ENV_CONFIG.maxRetries,
        retryBaseDelay: ENV_CONFIG.backoffBase,
        sessionExpiry: 30 * 60 * 1000,
        debug: IframeEnvironment.type === 'LOCAL_DEV'
    },
    
    state: {
        parentDetected: StartupGovernor.state.parentDetected,
        handshakeComplete: false,
        sessionReceived: false,
        sessionData: null,
        lastSync: null,
        initializationLock: false,
        retryCount: 0,
        messageHandlersBound: false,
        parentReachable: false,
        authReady: false,
        parentOrigin: '*'
    },
    
    ui: {
        protectedUIBlocked: true,
        authErrorDisplayed: false,
        reconnectionDisplayed: false
    },
    
    reconnectionInterval: null,
    
    init: async function() {
        if (this.state.initializationLock) return;
        this.state.initializationLock = true;
        
        try {
            await this.detectParent();
            this.bindEnhancedMessageHandlers();
            this.setupReconnectionMonitor();
            
            IframeHandshakeAuthority.start();
            
            setTimeout(() => IframeSessionClient.request(), 100);
        } catch (error) {
            this.handleParentUnavailable();
        } finally {
            this.state.initializationLock = false;
        }
    },
    
    detectParent: function() {
        return new Promise((resolve, reject) => {
            if (window.parent === window || !window.parent) {
                this.state.parentDetected = false;
                reject(new Error('Parent window not available'));
                return;
            }
            
            try {
                const parentOrigin = window.parent.location.origin;
                this.state.parentDetected = true;
                this.state.parentOrigin = parentOrigin;
                kynState.parentOrigin = parentOrigin;
                resolve();
            } catch (error) {
                this.state.parentDetected = true;
                this.state.parentOrigin = '*';
                kynState.parentOrigin = '*';
                resolve();
            }
        });
    },
    
    initiateHandshakeWithAck: function() {
        return new Promise((resolve, reject) => {
            if (!this.state.parentDetected) {
                reject(new Error('Parent not detected'));
                return;
            }
            
            const messageId = generateMessageId?.() || `hs_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            const handler = (event) => {
                if (event.data?.type === 'HANDSHAKE_ACK' && event.data?.messageId === messageId) {
                    MessageBus.off('HANDSHAKE_ACK', handler);
                    this.state.handshakeComplete = true;
                    resolve(event.data);
                }
            };
            
            MessageBus.on('HANDSHAKE_ACK', handler);
            
            const success = MessageBus.sendToParent({
                type: 'CHILD_READY',
                messageId,
                source: 'friend.html',
                timestamp: Date.now(),
                version: '2.5.1',
                requireAck: true,
                protocol: 'KYN-2.0'
            });
            
            if (!success) {
                MessageBus.off('HANDSHAKE_ACK', handler);
                reject(new Error('Failed to send handshake'));
            }
            
            setTimeout(() => {
                MessageBus.off('HANDSHAKE_ACK', handler);
                reject(new Error('Handshake timeout'));
            }, this.config.handshakeTimeout);
        });
    },
    
    getSessionWithTimeout: function(timeout = 3000) {
        return new Promise((resolve, reject) => {
            if (!this.state.parentDetected) {
                reject(new Error('Parent not detected'));
                return;
            }
            
            const messageId = generateMessageId?.() || `session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            const handler = (data) => {
                if (data.type === 'SESSION_DATA' && data.messageId === messageId) {
                    MessageBus.off('SESSION_DATA', handler);
                    
                    if (data.session) {
                        this.state.sessionData = data.session;
                        this.state.sessionReceived = true;
                        resolve(data.session);
                    } else {
                        reject(new Error('Invalid session data'));
                    }
                }
            };
            
            MessageBus.on('SESSION_DATA', handler);
            
            const success = MessageBus.sendToParent({
                type: 'REQUEST_SESSION',
                messageId,
                source: 'friend.html',
                timestamp: Date.now(),
                requireAck: true
            });
            
            if (!success) {
                MessageBus.off('SESSION_DATA', handler);
                reject(new Error('Failed to request session'));
            }
            
            setTimeout(() => {
                MessageBus.off('SESSION_DATA', handler);
                reject(new Error('Session request timeout'));
            }, timeout);
        });
    },
    
    bindEnhancedMessageHandlers: function() {
        if (this.state.messageHandlersBound) return;
        
        MessageBus.on('SESSION_DATA', this.handleSessionData.bind(this));
        MessageBus.on('SESSION_UPDATE', this.handleSessionUpdate.bind(this));
        MessageBus.on('LOGOUT', this.handleLogout.bind(this));
        MessageBus.on('PARENT_READY', this.handleParentReady.bind(this));
        MessageBus.on('AUTH_STATE_CHANGED', this.handleAuthStateChanged.bind(this));
        MessageBus.on('USER_PROFILE_UPDATED', this.handleProfileUpdated.bind(this));
        
        window.addEventListener('knectaAuthReady', this.handleAuthReady.bind(this));
        window.addEventListener('knectaTokenExpired', this.handleTokenExpired.bind(this));
        window.addEventListener('knectaAuthError', this.handleAuthError.bind(this));
        
        this.state.messageHandlersBound = true;
    },
    
    handleSessionData: function(data) {
        if (!data.session) return;
        
        this.state.sessionData = data.session;
        this.state.sessionReceived = true;
        this.state.lastSync = Date.now();
        this.state.authReady = true;
        this.ui.protectedUIBlocked = false;
        
        IframeSessionClient.handleSessionData(data.session);
        
        window.dispatchEvent(new CustomEvent('parentSessionReady', {
            detail: { session: data.session, source: 'parent_coordinator' }
        }));
    },
    
    handleSessionUpdate: function(data) {
        if (!data.session) return;
        this.state.sessionData = data.session;
        this.state.lastSync = Date.now();
        IframeSessionClient.handleSessionData(data.session);
        window.dispatchEvent(new CustomEvent('parentSessionUpdated', { detail: { session: data.session } }));
    },
    
    handleLogout: function() {
        this.state.sessionData = null;
        this.state.sessionReceived = false;
        this.state.authReady = false;
        this.ui.protectedUIBlocked = true;
        IframeSessionClient.clear();
        window.dispatchEvent(new CustomEvent('parentSessionLogout'));
    },
    
    handleParentReady: function() {
        this.state.parentReachable = true;
        kynState.parentReady = true;
        if (!this.state.sessionReceived) {
            IframeSessionClient.request();
        }
    },
    
    handleAuthStateChanged: function(data) {
        if (data.authenticated && data.session) {
            this.handleSessionData({ session: data.session });
        } else {
            this.handleLogout();
        }
    },
    
    handleProfileUpdated: function(data) {
        if (this.state.sessionData?.user && data.userData) {
            this.state.sessionData.user = { ...this.state.sessionData.user, ...data.userData };
            IframeSessionClient.handleSessionData({ session: this.state.sessionData });
            window.dispatchEvent(new CustomEvent('parentProfileUpdated', { detail: { user: this.state.sessionData.user } }));
        }
    },
    
    handleAuthReady: function(event) {
        if (this.state.sessionReceived) return;
        if (event.detail?.token && event.detail?.user) {
            this.state.authReady = true;
            this.ui.protectedUIBlocked = false;
            IframeSessionClient.handleSessionData({
                session: { token: event.detail.token, user: event.detail.user, source: 'unified_auth' }
            });
        }
    },
    
    handleTokenExpired: function() {
        MessageBus.sendToParent({ type: 'TOKEN_EXPIRED', source: 'friend.html', timestamp: Date.now() });
        this.ui.protectedUIBlocked = true;
        IframeSessionClient._expire();
    },
    
    handleAuthError: function() {
        MessageBus.sendToParent({ type: 'AUTH_ERROR', source: 'friend.html', timestamp: Date.now() });
        this.ui.protectedUIBlocked = true;
    },
    
    handleParentUnavailable: function() {
        this.state.parentReachable = false;
        this.ui.protectedUIBlocked = true;
    },
    
    setupReconnectionMonitor: function() {
        if (this.reconnectionInterval) clearInterval(this.reconnectionInterval);
        this.reconnectionInterval = ResourceManager.registerInterval(setInterval(() => {
            if (!this.state.parentReachable && this.state.parentDetected) {
                this.attemptParentReconnection();
            }
        }, 10000));
    },
    
    attemptParentReconnection: function() {
        MessageBus.sendToParent({ type: 'RECONNECT_ATTEMPT', source: 'friend.html', timestamp: Date.now() });
        RecoveryManager.attempt('handshake');
    },
    
    sendToParent: function(message) {
        return MessageBus.sendToParent(message);
    },
    
    shouldBlockProtectedUI: function() {
        return this.ui.protectedUIBlocked;
    },
    
    getSession: function() {
        return this.state.sessionData || IframeSessionClient.getSession();
    },
    
    isAuthenticated: function() {
        return !!(this.state.sessionReceived && this.state.sessionData?.token) || IframeSessionClient.isValid();
    },
    
    getUser: function() {
        return this.state.sessionData?.user || IframeSessionClient.getUser() || null;
    },
    
    getToken: function() {
        return this.state.sessionData?.token || IframeSessionClient.getToken() || null;
    },
    
    apiRequest: async function(endpoint, options = {}) {
        try {
            if (this.state.parentReachable && this.state.sessionReceived) {
                return await this.apiRequestViaParent(endpoint, options);
            }
            return await this.apiRequestDirect(endpoint, options);
        } catch (error) {
            Logger.error('ParentCoordinator', 'API request failed', error, { endpoint });
            throw error;
        }
    },
    
    apiRequestViaParent: function(endpoint, options) {
        return new Promise((resolve, reject) => {
            const messageId = generateMessageId?.() || `api_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            const handler = (data) => {
                if (data.type === 'API_RESPONSE' && data.messageId === messageId) {
                    MessageBus.off('API_RESPONSE', handler);
                    if (data.success) {
                        resolve(data.data);
                    } else {
                        reject(new Error(data.error || 'API request failed'));
                    }
                }
            };
            
            MessageBus.on('API_RESPONSE', handler);
            
            const success = MessageBus.sendToParent({
                type: 'API_REQUEST',
                messageId,
                endpoint,
                options,
                timestamp: Date.now(),
                source: 'friend.html',
                requireAck: false
            });
            
            if (!success) {
                MessageBus.off('API_RESPONSE', handler);
                reject(new Error('Failed to send API request'));
            }
            
            setTimeout(() => {
                MessageBus.off('API_RESPONSE', handler);
                reject(new Error('API request timeout'));
            }, 30000);
        });
    },
    
    apiRequestDirect: async function(endpoint, options = {}) {
        const token = this.getToken() || SessionManager.current?.token;
        if (!token && options.requireAuth !== false) throw new Error('Authentication token not available');
        
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (token && options.requireAuth !== false) headers.Authorization = `Bearer ${token}`;
        
        const response = await secureFetch(endpoint, {
            method: options.method || 'GET',
            headers,
            body: options.body
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                this.handleTokenExpired();
                throw new Error('Session expired');
            }
            throw new Error(`API error: ${response.status}`);
        }
        
        return response.json();
    },
    
    showAuthError: function(message) {
        this.ui.authErrorDisplayed = true;
        const overlay = SafetyGuards.safeGetElement('authErrorOverlay');
        const messageElement = SafetyGuards.safeGetElement('authErrorMessage');
        if (overlay && messageElement) {
            messageElement.textContent = message || 'Authentication required';
            overlay.classList.add('active');
        } else {
            showNotification?.(message || 'Authentication error', 'error');
        }
    },
    
    hideAuthError: function() {
        this.ui.authErrorDisplayed = false;
        const overlay = SafetyGuards.safeGetElement('authErrorOverlay');
        if (overlay) overlay.classList.remove('active');
    },
    
    showReconnectionState: function() {
        this.ui.reconnectionDisplayed = true;
        showReconnectionState?.();
    },
    
    hideReconnectionState: function() {
        this.ui.reconnectionDisplayed = false;
        hideReconnectionState?.();
    },
    
    log: function(message, data) {
        if (this.config.debug) Logger.debug('ParentCoordinator', message, data);
    },
    
    logError: function(message, error) {
        Logger.error('ParentCoordinator', message, error);
    }
};

// =============================================
// [29] KNECTA AUTH (Original - Preserved)
// =============================================

export const KnectaAuth = {
    token: null,
    tokenReady: false,
    tokenPromise: null,
    currentUser: null,
    userReady: false,
    cacheReady: false,
    migrationPerformed: false,
    parentControlled: true,
    
    init: async function() {
        try {
            this.checkTokenMigration();
            await this.waitForParentCoordinator();
            this.loadCachedData();
            this.cacheReady = true;
            this.dispatchCacheReadyEvent();
        } catch (error) {
            Logger.error('KnectaAuth', 'Init failed', error);
            this.loadCachedData();
            this.cacheReady = true;
            this.dispatchCacheReadyEvent();
        }
    },
    
    checkTokenMigration: function() {
        const unifiedToken = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
        if (unifiedToken) return;
        
        const oldKeys = ['moodchat_token', 'accessToken', 'knecta_token', 'token', 'authToken', 'sessionToken'];
        for (const key of oldKeys) {
            const token = localStorage.getItem(key);
            if (token) {
                SafeStorage.setItem(LOCAL_STORAGE_KEYS.USER_TOKEN, token);
                this.migrationPerformed = true;
                break;
            }
        }
    },
    
    waitForParentCoordinator: function() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 50;
            const check = () => {
                attempts++;
                if (window.parentCoordinator) {
                    this.parentControlled = true;
                    resolve();
                    return;
                }
                if (attempts >= maxAttempts) {
                    this.parentControlled = false;
                    resolve();
                    return;
                }
                setTimeout(check, 100);
            };
            check();
        });
    },
    
    loadCachedData: function() {
        const token = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
        if (token) this.token = token;
        
        const userStr = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA);
        if (userStr) {
            try {
                this.currentUser = JSON.parse(userStr);
            } catch (e) {}
        }
    },
    
    dispatchReadyEvent: function() {
        window.dispatchEvent(new CustomEvent('knectaAuthReady', {
            detail: { token: this.token, user: this.currentUser, migrationPerformed: this.migrationPerformed, parentControlled: this.parentControlled }
        }));
        window.knectaToken = this.token;
        window.knectaUser = this.currentUser;
        window.authReady = true;
    },
    
    dispatchCacheReadyEvent: function() {
        window.dispatchEvent(new CustomEvent('knectaCacheReady', {
            detail: { token: this.token, user: this.currentUser, cacheOnly: true }
        }));
    },
    
    getTokenAsync: function() {
        if (window.parentCoordinator?.getToken()) return Promise.resolve(window.parentCoordinator.getToken());
        if (this.tokenReady && this.token) return Promise.resolve(this.token);
        
        if (!this.tokenPromise) {
            this.tokenPromise = new Promise((resolve, reject) => {
                let attempts = 0;
                const maxAttempts = 100;
                const check = () => {
                    attempts++;
                    if (window.parentCoordinator?.getToken()) {
                        resolve(window.parentCoordinator.getToken());
                        return;
                    }
                    if (this.tokenReady && this.token) {
                        resolve(this.token);
                        return;
                    }
                    if (attempts >= maxAttempts) {
                        reject(new Error('Token not available'));
                        return;
                    }
                    setTimeout(check, 100);
                };
                check();
            });
        }
        
        return this.tokenPromise;
    },
    
    secureApiCall: async function(apiPath, options = {}, requireAuth = true) {
        if (window.parentCoordinator?.isAuthenticated()) {
            return window.parentCoordinator.apiRequest(apiPath, options);
        }
        return this.secureApiCallFallback(apiPath, options, requireAuth);
    },
    
    secureApiCallFallback: async function(apiPath, options = {}, requireAuth = true) {
        this.showLoading(requireAuth);
        
        try {
            let token = null;
            if (requireAuth) {
                token = await this.getTokenAsync();
                if (!token) throw new Error('Authentication required');
            }
            
            const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
            if (token && requireAuth) headers.Authorization = `Bearer ${token}`;
            
            const response = await secureFetch(apiPath, {
                method: options.method || 'GET',
                headers,
                body: options.body
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleTokenExpired();
                    throw new Error('Session expired');
                }
                throw new Error(`API error: ${response.status}`);
            }
            
            return response.json();
        } finally {
            this.showLoading(false);
        }
    },
    
    showLoading: function(show) {
        const overlay = SafetyGuards.safeGetElement('loadingOverlay');
        if (overlay) overlay.classList.toggle('active', show);
    },
    
    handleTokenExpired: function() {
        this.token = null;
        this.tokenReady = false;
        SafeStorage.removeItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
        if (window.parentCoordinator) {
            window.parentCoordinator.handleTokenExpired();
        } else {
            showNotification?.('Session expired', 'error');
            window.dispatchEvent(new CustomEvent('knectaTokenExpired'));
        }
    },
    
    handleAuthError: function() {
        showNotification?.('Please log in to continue', 'warning');
        window.dispatchEvent(new CustomEvent('knectaAuthError'));
    },
    
    showNotification: function(message, type = 'success') {
        if (window.parentCoordinator) {
            window.parentCoordinator.showAuthError?.(message);
        } else {
            showNotification?.(message, type);
        }
    },
    
    isAuthenticated: function() {
        return !!(window.parentCoordinator?.isAuthenticated() || (this.token && this.tokenReady));
    },
    
    getUser: function() {
        return window.parentCoordinator?.getUser() || this.currentUser;
    },
    
    getToken: function() {
        return window.parentCoordinator?.getToken() || this.token;
    }
};

// =============================================
// [30] SESSION MANAGER (Original - Preserved)
// =============================================

export const SessionManager = {
    current: null,
    sources: ['parent', 'auth', 'cache', 'guest', 'demo'],
    activeSource: null,
    listeners: new Set(),
    
    async getSession(options = { timeout: 3000, source: 'any' }) {
        if (this.current && this.isValid(this.current)) return this.current;
        
        let session = null;
        
        if (options.source === 'any' || options.source === 'parent') {
            session = await this.fromParent(options.timeout);
            if (session) this.activeSource = 'parent';
        }
        
        if (!session && (options.source === 'any' || options.source === 'auth')) {
            session = this.fromAuth();
            if (session) this.activeSource = 'auth';
        }
        
        if (!session && (options.source === 'any' || options.source === 'cache')) {
            session = this.fromCache();
            if (session) this.activeSource = 'cache';
        }
        
        if (session) {
            this.current = session;
            this.notifyListeners('session:update', session);
        }
        
        return session;
    },
    
    isValid(session) {
        if (!session || !session.token || !session.user) return false;
        if (session.expiresAt && session.expiresAt < Date.now()) return false;
        return true;
    },
    
    async fromParent(timeout) {
        if (!ParentCoordinator.state.parentDetected) return null;
        try {
            const response = await ParentCoordinator.getSessionWithTimeout(timeout);
            if (response?.token && response?.user) {
                return { token: response.token, user: response.user, expiresAt: response.expiresAt || Date.now() + 3600000, source: 'parent' };
            }
        } catch (e) {}
        return null;
    },
    
    fromAuth() {
        if (!window.KnectaAuth) return null;
        try {
            const token = window.KnectaAuth.getToken?.();
            const user = window.KnectaAuth.getUser?.();
            if (token && user) {
                return { token, user, expiresAt: Date.now() + 3600000, source: 'auth' };
            }
        } catch (e) {}
        return null;
    },
    
    fromCache() {
        try {
            const token = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
            const userStr = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA);
            if (token && userStr) {
                const user = JSON.parse(userStr);
                if (user && user.id) {
                    return { token, user, expiresAt: Date.now() + 3600000, source: 'cache' };
                }
            }
        } catch (e) {}
        return null;
    },
    
    updateSession(session) {
        if (this.isValid(session)) {
            this.current = session;
            this.notifyListeners('session:update', session);
            if (session.source === 'parent' || session.source === 'auth') {
                SafeStorage.setItem(LOCAL_STORAGE_KEYS.USER_TOKEN, session.token);
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.USER_DATA, session.user);
            }
        }
    },
    
    clearSession() {
        this.current = null;
        this.activeSource = null;
        this.notifyListeners('session:clear', null);
    },
    
    on(event, callback) {
        this.listeners.add({ event, callback });
    },
    
    off(event, callback) {
        this.listeners.forEach(listener => {
            if (listener.event === event && listener.callback === callback) {
                this.listeners.delete(listener);
            }
        });
    },
    
    notifyListeners(event, data) {
        this.listeners.forEach(listener => {
            if (listener.event === event) {
                try {
                    listener.callback(data);
                } catch (e) {}
            }
        });
    }
};

// =============================================
// [31] FEATURE SANDBOXING
// =============================================

const featureSandbox = async (feature, fn, fallback = null) => {
    const featureName = feature.split(':')[0] || feature;
    try {
        return await fn();
    } catch (error) {
        Logger.once(`feature:${featureName}`, `Feature '${feature}' failed`, error);
        if (featureFlags.hasOwnProperty(featureName)) featureFlags[featureName] = false;
        DiagnosticsAgent.trackFailure(error, { feature });
        return fallback;
    }
};

const featureSandboxSync = (feature, fn, fallback = null) => {
    const featureName = feature.split(':')[0] || feature;
    try {
        return fn();
    } catch (error) {
        Logger.once(`feature:${featureName}`, `Feature '${feature}' failed`, error);
        if (featureFlags.hasOwnProperty(featureName)) featureFlags[featureName] = false;
        DiagnosticsAgent.trackFailure(error, { feature });
        return fallback;
    }
};

// =============================================
// [32] DEPENDENCY CONTROL
// =============================================

export const DependencyManager = {
    status: 'ok',
    missing: [],
    fallbackMode: false,
    
    check(dependencies) {
        const missing = [];
        for (const [name, dep] of Object.entries(dependencies)) {
            if (dep === undefined || dep === null) missing.push(name);
        }
        if (missing.length > 0) {
            this.missing = [...this.missing, ...missing];
            this.status = 'degraded';
            this.fallbackMode = true;
            Logger.once('dependency:missing', `Missing dependencies: ${missing.join(', ')}`);
        }
        return missing.length === 0;
    },
    
    getFallback(name, type = 'function') {
        if (type === 'function') {
            return (...args) => {
                Logger.once(`fallback:${name}`, `Using fallback for ${name}`);
                if (name === 'showNotification') {
                    console.log(`[Notification] ${args[0] || ''}`, args[1] || 'info');
                    return null;
                }
                if (name === 'navigateToChat' || name === 'navigateToCall') {
                    Logger.info('Navigation', `${name} not available (fallback mode)`);
                    return null;
                }
                return null;
            };
        }
        if (type === 'string') return '';
        if (type === 'object') return {};
        return null;
    }
};

// =============================================
// [33] INITIALIZATION PIPELINE
// =============================================

const INIT_TIMEOUT = 10000;
const HANDSHAKE_TIMEOUT = 5000;

export const initPipeline = {
    status: 'idle',
    stages: {
        preflight: false,
        dependencyCheck: false,
        parentDetect: false,
        handshake: false,
        sessionSync: false,
        serviceInit: false,
        ready: false
    },
    errors: [],
    timeout: null
};

async function stagePreflight() {
    return featureSandbox('init:preflight', async () => {
        if (typeof window === 'undefined' || !document) throw new Error('Browser environment required');
        if (typeof Promise === 'undefined') throw new Error('Promise support required');
        
        try {
            SafeStorage.setItem('__test__', 'test');
            SafeStorage.removeItem('__test__');
        } catch (e) {}
        
        IframeEnvironment.detect();
        initPipeline.stages.preflight = true;
        return true;
    }, false);
}

async function stageDependencyCheck() {
    return featureSandbox('init:dependency', async () => {
        const requiredImports = [
            { name: 'generateMessageId', fn: generateMessageId },
            { name: 'validateMessageSchema', fn: validateMessageSchema },
            { name: 'secureFetch', fn: secureFetch },
            { name: 'importedShowNotification', fn: importedShowNotification }
        ];
        
        const missing = requiredImports.filter(dep => !dep.fn);
        if (missing.length > 0) {
            missing.forEach(dep => Logger.once(`dep:${dep.name}`, `Missing dependency: ${dep.name}`));
            return false;
        }
        
        initPipeline.stages.dependencyCheck = true;
        return true;
    }, false);
}

async function stageParentDetect() {
    return featureSandbox('init:parentDetect', async () => {
        const result = { detected: false, origin: null, crossOrigin: false };
        
        try {
            if (window.parent && window.parent !== window) {
                result.detected = true;
                try {
                    result.origin = window.parent.location.origin;
                    result.crossOrigin = result.origin !== window.location.origin;
                    kynState.parentOrigin = result.origin;
                } catch (e) {
                    result.origin = '*';
                    result.crossOrigin = true;
                    kynState.parentOrigin = '*';
                }
                ParentCoordinator.state.parentDetected = true;
                ParentCoordinator.state.parentOrigin = result.origin;
                StartupGovernor.state.parentDetected = true;
            }
        } catch (error) {}
        
        initPipeline.stages.parentDetect = true;
        return result;
    }, { detected: false, origin: null, crossOrigin: false });
}

async function stageHandshake() {
    return featureSandbox('init:handshake', async () => {
        if (!ParentCoordinator.state.parentDetected) {
            StartupGovernor._transitionTo('DEGRADED', 'No parent detected');
            return { success: false, mode: 'standalone' };
        }
        
        StartupGovernor._transitionTo('HANDSHAKING');
        
        const handshakeResult = await Promise.race([
            IframeHandshakeAuthority.start(),
            timeoutPromise(HANDSHAKE_TIMEOUT, 'Handshake timeout')
        ]);
        
        initPipeline.stages.handshake = true;
        return handshakeResult || { success: false, mode: 'timeout' };
    }, { success: false, mode: 'fallback' });
}

async function stageSessionSync() {
    return featureSandbox('init:sessionSync', async () => {
        let session = null;
        
        if (ParentCoordinator.state.parentDetected && IframeHandshakeAuthority.isComplete()) {
            session = await ParentCoordinator.getSessionWithTimeout(3000);
        }
        
        if (!session || !session.token) {
            const cachedToken = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
            const cachedUser = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA);
            if (cachedToken && cachedUser) {
                try {
                    session = { token: cachedToken, user: JSON.parse(cachedUser) };
                } catch (e) {}
            }
        }
        
        if (session?.token && session?.user) {
            dataSource.token = session.token;
            dataSource.userData = session.user;
            dataSource.fetched = true;
            currentUser = session.user;
            userData = session.user;
            IframeSessionClient.handleSessionData(session);
            SafeStorage.setItem(LOCAL_STORAGE_KEYS.USER_TOKEN, session.token);
            SafeStorage.setObject(LOCAL_STORAGE_KEYS.USER_DATA, session.user);
            StartupGovernor._transitionTo('SYNCING');
        } else {
            throw new Error('No valid session from parent');
        }
        
        initPipeline.stages.sessionSync = true;
        return { success: !!session, session };
    }, { success: false, session: null });
}

async function stageServiceInit() {
    return featureSandbox('init:serviceInit', async () => {
        loadCachedDataInstantly();
        cacheLoaded = true;
        
        initializeParentChildCommunication();
        
        if (SafetyGuards.isSessionValid()) {
            setTimeout(() => startParallelDataLoading().catch(() => {}), 500);
        }
        
        if (currentUser?.id && featureFlags.qrCode) {
            setTimeout(generateUniqueQRCode, 300);
        }
        
        StartupGovernor._transitionTo('ACTIVE');
        
        initPipeline.stages.serviceInit = true;
        return true;
    }, false);
}

async function stageReady() {
    return featureSandbox('init:ready', async () => {
        apiReady = true;
        isInitialized = true;
        initPipeline.status = 'ready';
        initPipeline.stages.ready = true;
        
        window.dispatchEvent(new CustomEvent('friendCoreReady', {
            detail: {
                timestamp: Date.now(),
                fallbackMode: false,
                sessionValid: !!dataSource.token,
                stages: initPipeline.stages,
                kyn: {
                    handshakeCompleted: kynState.handshakeCompleted,
                    compatibilityMode: kynState.compatibilityMode,
                    startupPhase: kynState.startupPhase,
                    environment: IframeEnvironment.type
                }
            }
        }));
        
        return true;
    }, false);
}

export async function enhancedInitialize() {
    if (initializationStarted) return isInitialized;
    initializationStarted = true;
    initPipeline.status = 'running';
    
    try {
        await withTimeout(stagePreflight(), 2000, 'Preflight timeout');
        await withTimeout(stageDependencyCheck(), 2000, 'Dependency check timeout');
        await withTimeout(stageParentDetect(), 2000, 'Parent detect timeout');
        await withTimeout(stageHandshake(), 5000, 'Handshake timeout');
        await withTimeout(stageSessionSync(), 3000, 'Session sync timeout');
        await withTimeout(stageServiceInit(), 3000, 'Service init timeout');
        await withTimeout(stageReady(), 1000, 'Ready timeout');
        
    } catch (error) {
        initPipeline.errors.push({ stage: initPipeline.status, error: error.message, timestamp: Date.now() });
        throw error;
    }
    
    return isInitialized;
}

// =============================================
// [34] CACHED DATA FALLBACK
// =============================================

export function attemptCachedDataFallback() {
    Logger.info('Fallback', 'Attempting cached data fallback (UI compatibility only)');
    
    if (!currentUser && !userData) {
        const cachedUser = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA);
        if (cachedUser) {
            try {
                const user = JSON.parse(cachedUser);
                currentUser = user;
                userData = user;
                Logger.info('Fallback', 'Loaded user from cache for UI display');
            } catch (e) {}
        }
    }
    
    if (friends.length === 0) {
        const cachedFriends = SafeStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (cachedFriends) {
            try {
                const parsed = JSON.parse(cachedFriends);
                friends = Array.isArray(parsed) ? parsed.filter(f => validateFriendData(f)) : [];
                Logger.info('Fallback', `Loaded ${friends.length} friends from cache for UI display`);
            } catch (e) {}
        }
    }
    
    window.dispatchEvent(new CustomEvent('friendCoreFallback', {
        detail: { timestamp: Date.now(), hasUser: !!currentUser, friendCount: friends.length }
    }));
    
    return { success: true, user: currentUser, friends: friends, fromCache: true };
}

// =============================================
// [35] API INTEGRATION FUNCTIONS
// =============================================

export async function apiCallWithRetry(url, options = {}, maxRetries = 3) {
    const circuitBreaker = ErrorHandler.getCircuitBreaker('api') || 
        ErrorHandler.createCircuitBreaker('api', { failureThreshold: 5, timeout: 60000 });
    
    return circuitBreaker.execute(async () => {
        if (!SafetyGuards.isSessionValid() && !url.includes('/public/')) {
            throw new Error('Session invalid');
        }
        
        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const token = getValidToken();
                
                const fetchOptions = {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json', ...options.headers },
                    ...options
                };
                
                if (token && !fetchOptions.headers.Authorization) {
                    fetchOptions.headers.Authorization = `Bearer ${token}`;
                }
                
                const response = await secureFetch(url, fetchOptions);
                
                if (!response.ok) {
                    if (response.status === 401) {
                        window.dispatchEvent(new CustomEvent('knectaTokenExpired'));
                        throw new Error('Session expired');
                    }
                    const errorMessage = await getErrorMessageFromResponse(response);
                    throw new Error(`API error: ${response.status} - ${errorMessage}`);
                }
                
                return await response.json();
                
            } catch (error) {
                lastError = error;
                
                if (error.message === 'Session expired' || 
                    (error.message.includes('API error: 4') && !error.message.includes('API error: 429'))) {
                    throw error;
                }
                
                if (attempt === maxRetries) break;
                
                const delay = TransportAgent.calculateBackoff(attempt);
                
                if (attempt === 0) {
                    showNotification?.('Connection issue, retrying...', 'warning');
                }
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw new Error(lastError?.message || 'API request failed after retries');
    });
}

async function getErrorMessageFromResponse(response) {
    try {
        const text = await response.text();
        if (text) {
            try {
                const json = JSON.parse(text);
                return json.message || json.error || text.substring(0, 100);
            } catch {
                return text.substring(0, 100);
            }
        }
    } catch {}
    return response.statusText || 'Unknown error';
}

export function getValidToken() {
    try {
        if (window.parentCoordinator?.getToken()) return window.parentCoordinator.getToken();
        if (SessionManager.current?.token) return SessionManager.current.token;
        if (IframeSessionClient.getToken()) return IframeSessionClient.getToken();
        if (window.KnectaAuth?.getToken) return window.KnectaAuth.getToken();
        return SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
    } catch (error) {
        return null;
    }
}

function getValidTokenInternal() {
    return getValidToken();
}

export function getCurrentUser() {
    try {
        if (window.parentCoordinator?.getUser()) return window.parentCoordinator.getUser();
        if (dataSource.userData) return dataSource.userData;
        if (window.KnectaAuth?.getUser()) return window.KnectaAuth.getUser();
        if (SessionManager.current?.user) return SessionManager.current.user;
        if (IframeSessionClient.getUser()) return IframeSessionClient.getUser();
        const userStr = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA);
        if (userStr) return JSON.parse(userStr);
    } catch (error) {}
    return null;
}

// =============================================
// [36] FRIEND REQUEST MANAGEMENT (Original - Preserved)
// =============================================

export async function sendFriendRequest(friendId, category = 'friend', note = '', isTemporary = false, duration = null, isBusiness = false) {
    return featureSandbox('friendRequest', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false, error: 'Session invalid' };
        }
        
        if (!friendId || typeof friendId !== 'string') {
            showNotification?.('Invalid friend ID', 'error');
            return { success: false, error: 'Invalid friend ID' };
        }
        
        if (!validateFriendId(friendId)) {
            showNotification?.('Invalid friend ID format', 'error');
            return { success: false, error: 'Invalid format' };
        }
        
        if (isTemporary && (!duration || duration < 1)) {
            showNotification?.('Please specify a valid duration', 'error');
            return { success: false, error: 'Invalid duration' };
        }
        
        try {
            const response = await apiCallWithRetry('/api/friend-requests/send', {
                method: 'POST',
                body: JSON.stringify({ receiverId: friendId, category, note, isTemporary, duration, isBusiness })
            }, 2);
            
            if (response?.success) {
                try {
                    const sentResponse = await apiCallWithRetry('/api/friend-requests/sent', null, 1);
                    if (sentResponse?.requests) {
                        sentRequests = sentResponse.requests;
                        SafeStorage.setObject(LOCAL_STORAGE_KEYS.SENT_REQUESTS, sentRequests);
                    }
                } catch (e) {}
                
                fetchAllUsersFromBackend().catch(() => {});
                updateCurrentSection?.();
                showNotification?.('Friend request sent successfully', 'success');
                
                return { success: true, response };
            }
            
            showNotification?.('Failed to send friend request', 'error');
            return { success: false, error: 'API returned error' };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('sendFriendRequest', 'API call failed', error, { friendId });
                showNotification?.('Failed to send friend request', 'error');
            }
            return { success: false, error: error.message };
        }
    }, { success: false, error: 'Feature disabled' });
}

export async function acceptFriendRequestOnline(requestId, friendId) {
    return featureSandbox('friendRequest', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!requestId || !friendId) {
            showNotification?.('Invalid request data', 'error');
            return { success: false };
        }
        
        try {
            const response = await apiCallWithRetry(`/api/friend-requests/${requestId}/accept`, {
                method: 'POST'
            }, 2);
            
            if (response?.success) {
                startParallelDataLoading();
                showNotification?.('Friend request accepted', 'success');
                return { success: true };
            }
            
            showNotification?.('Failed to accept friend request', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('acceptFriendRequestOnline', 'API call failed', error, { requestId, friendId });
                showNotification?.('Failed to accept friend request', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

export async function declineFriendRequest(requestData) {
    return featureSandbox('friendRequest', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!requestData?.id) {
            showNotification?.('Invalid request data', 'error');
            return { success: false };
        }
        
        try {
            const response = await apiCallWithRetry(`/api/friend-requests/${requestData.id}/decline`, {
                method: 'POST'
            }, 2);
            
            if (response?.success) {
                try {
                    const requestsResponse = await apiCallWithRetry('/api/friend-requests/incoming', null, 1);
                    if (requestsResponse?.requests) {
                        friendRequests = requestsResponse.requests;
                        SafeStorage.setObject(LOCAL_STORAGE_KEYS.REQUESTS, friendRequests);
                    }
                } catch (e) {}
                
                fetchAllUsersFromBackend().catch(() => {});
                updateCurrentSection?.();
                showNotification?.('Friend request declined', 'success');
                
                return { success: true };
            }
            
            showNotification?.('Failed to decline friend request', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('declineFriendRequest', 'API call failed', error);
                showNotification?.('Failed to decline friend request', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

export async function cancelFriendRequest(requestData) {
    return featureSandbox('friendRequest', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!requestData?.id) {
            showNotification?.('Invalid request data', 'error');
            return { success: false };
        }
        
        try {
            const response = await apiCallWithRetry(`/api/friend-requests/${requestData.id}`, {
                method: 'DELETE'
            }, 2);
            
            if (response?.success) {
                try {
                    const sentResponse = await apiCallWithRetry('/api/friend-requests/sent', null, 1);
                    if (sentResponse?.requests) {
                        sentRequests = sentResponse.requests;
                        SafeStorage.setObject(LOCAL_STORAGE_KEYS.SENT_REQUESTS, sentRequests);
                    }
                } catch (e) {}
                
                fetchAllUsersFromBackend().catch(() => {});
                updateCurrentSection?.();
                showNotification?.('Friend request cancelled', 'success');
                
                return { success: true };
            }
            
            showNotification?.('Failed to cancel friend request', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('cancelFriendRequest', 'API call failed', error);
                showNotification?.('Failed to cancel friend request', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

function validateFriendId(friendId) {
    if (typeof friendId !== 'string') return false;
    if (friendId.trim().length === 0) return false;
    if (friendId.length > 100) return false;
    const validPattern = /^[a-zA-Z0-9_\-:.@]+$/;
    return validPattern.test(friendId);
}

function validateFriendData(friendData) {
    if (!friendData || typeof friendData !== 'object') return false;
    if (!friendData.id || typeof friendData.id !== 'string') return false;
    if (!validateFriendId(friendData.id)) return false;
    if (friendData.displayName && typeof friendData.displayName !== 'string') return false;
    if (friendData.username && typeof friendData.username !== 'string') return false;
    if (friendData.email && typeof friendData.email !== 'string') return false;
    return true;
}

// =============================================
// [37] DATA LOADING FUNCTIONS (Original - Preserved)
// =============================================

export async function loadFriendsFromBackend() {
    return featureSandbox('friends', async () => {
        if (!SafetyGuards.isSessionValid()) throw new Error('Authentication required');
        
        try {
            const response = await apiCallWithRetry('/api/friends', null, 2);
            
            if (response?.friends) {
                friends = response.friends.filter(f => validateFriendData(f));
                friends.sort((a, b) => {
                    if (a.online !== b.online) return b.online ? 1 : -1;
                    return (a.displayName || '').localeCompare(b.displayName || '');
                });
                
                updateFriendCounts?.();
                
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.FRIENDS, friends);
                SafeStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, Date.now().toString());
                
                window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: { friends } }));
                
                return { success: true, count: friends.length };
            }
        } catch (error) {
            Logger.error('loadFriendsFromBackend', 'Failed to load friends', error);
            
            const cached = SafeStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    friends = Array.isArray(parsed) ? parsed.filter(f => validateFriendData(f)) : [];
                    updateFriendCounts?.();
                } catch (e) {
                    friends = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function loadFriendRequestsFromBackend() {
    return featureSandbox('requests', async () => {
        if (!SafetyGuards.isSessionValid()) throw new Error('Authentication required');
        
        try {
            const response = await apiCallWithRetry('/api/friend-requests/incoming', null, 2);
            
            if (response?.requests) {
                friendRequests = response.requests;
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.REQUESTS, friendRequests);
                window.dispatchEvent(new CustomEvent('requestsUpdated', { detail: { requests: friendRequests } }));
                return { success: true, count: friendRequests.length };
            }
        } catch (error) {
            Logger.error('loadFriendRequestsFromBackend', 'Failed to load requests', error);
            
            const cached = SafeStorage.getItem(LOCAL_STORAGE_KEYS.REQUESTS);
            if (cached) {
                try {
                    friendRequests = JSON.parse(cached);
                } catch (e) {
                    friendRequests = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function loadSentRequestsFromBackend() {
    return featureSandbox('requests', async () => {
        if (!SafetyGuards.isSessionValid()) throw new Error('Authentication required');
        
        try {
            const response = await apiCallWithRetry('/api/friend-requests/sent', null, 2);
            
            if (response?.requests) {
                sentRequests = response.requests;
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.SENT_REQUESTS, sentRequests);
                window.dispatchEvent(new CustomEvent('sentRequestsUpdated', { detail: { requests: sentRequests } }));
                return { success: true, count: sentRequests.length };
            }
        } catch (error) {
            Logger.error('loadSentRequestsFromBackend', 'Failed to load sent requests', error);
            
            const cached = SafeStorage.getItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS);
            if (cached) {
                try {
                    sentRequests = JSON.parse(cached);
                } catch (e) {
                    sentRequests = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function loadPinnedFriendsFromBackend() {
    return featureSandbox('pinned', async () => {
        if (!SafetyGuards.isSessionValid()) throw new Error('Authentication required');
        
        try {
            const response = await apiCallWithRetry('/api/friends/pinned', null, 2);
            
            if (response?.friends) {
                pinnedFriends = response.friends.filter(f => validateFriendData(f));
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, pinnedFriends);
                return { success: true, count: pinnedFriends.length };
            }
        } catch (error) {
            Logger.error('loadPinnedFriendsFromBackend', 'Failed to load pinned friends', error);
            
            const cached = SafeStorage.getItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS);
            if (cached) {
                try {
                    pinnedFriends = JSON.parse(cached);
                } catch (e) {
                    pinnedFriends = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function loadMutedFriendsFromBackend() {
    return featureSandbox('muted', async () => {
        if (!SafetyGuards.isSessionValid()) throw new Error('Authentication required');
        
        try {
            const response = await apiCallWithRetry('/api/friends/muted', null, 2);
            
            if (response?.friends) {
                mutedFriends = response.friends.filter(f => validateFriendData(f));
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, mutedFriends);
                return { success: true, count: mutedFriends.length };
            }
        } catch (error) {
            Logger.error('loadMutedFriendsFromBackend', 'Failed to load muted friends', error);
            
            const cached = SafeStorage.getItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS);
            if (cached) {
                try {
                    mutedFriends = JSON.parse(cached);
                } catch (e) {
                    mutedFriends = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function loadContactsFromBackend() {
    return featureSandbox('contacts', async () => {
        if (!SafetyGuards.isSessionValid()) throw new Error('Authentication required');
        
        try {
            const response = await apiCallWithRetry('/api/contacts/synced', null, 2);
            
            if (response?.contacts) {
                contacts = response.contacts;
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.CONTACTS, contacts);
                window.dispatchEvent(new CustomEvent('contactsUpdated', { detail: { contacts } }));
                return { success: true, count: contacts.length };
            }
        } catch (error) {
            Logger.error('loadContactsFromBackend', 'Failed to load contacts', error);
            
            const cached = SafeStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
            if (cached) {
                try {
                    contacts = JSON.parse(cached);
                } catch (e) {
                    contacts = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function loadGroupsFromBackend() {
    return featureSandbox('groups', async () => {
        if (!SafetyGuards.isSessionValid()) throw new Error('Authentication required');
        
        try {
            const response = await apiCallWithRetry('/api/group/user', null, 2);
            
            if (response?.groups) {
                groups = response.groups;
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.USER_GROUPS, groups);
                return { success: true, count: groups.length };
            }
        } catch (error) {
            Logger.error('loadGroupsFromBackend', 'Failed to load groups', error);
            
            const cached = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_GROUPS);
            if (cached) {
                try {
                    groups = JSON.parse(cached);
                } catch (e) {
                    groups = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function fetchAllUsersFromBackend() {
    return featureSandbox('discovery', async () => {
        if (!SafetyGuards.isSessionValid()) throw new Error('Authentication required');
        
        const cached = SafeStorage.getItem(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE);
        const lastSync = localStorage.getItem('all_users_last_sync');
        const now = Date.now();
        
        if (cached && lastSync && (now - parseInt(lastSync)) < 10 * 60 * 1000) {
            try {
                allUsers = JSON.parse(cached);
                return { success: true, count: allUsers.length, cached: true };
            } catch (e) {}
        }
        
        try {
            const response = await apiCallWithRetry('/api/users/all?limit=50', null, 2);
            
            if (response?.users) {
                const currentUserId = currentUser?.id;
                allUsers = response.users.filter(user => user.id !== currentUserId);
                
                allUsers.sort((a, b) => {
                    if (a.online !== b.online) return b.online ? 1 : -1;
                    return (a.displayName || '').localeCompare(b.displayName || '');
                });
                
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE, allUsers);
                localStorage.setItem('all_users_last_sync', Date.now().toString());
                
                return { success: true, count: allUsers.length };
            }
        } catch (error) {
            Logger.error('fetchAllUsersFromBackend', 'Failed to fetch users', error);
            
            if (cached) {
                try {
                    allUsers = JSON.parse(cached);
                    return { success: true, count: allUsers.length, cached: true };
                } catch (e) {
                    allUsers = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

// =============================================
// [38] INITIALIZATION & CACHE FUNCTIONS (Original - Preserved)
// =============================================

export function loadCachedDataInstantly() {
    try {
        const cachedUser = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA) || 
                           SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            currentUser = JSON.parse(cachedUser);
            userData = currentUser;
        }
        
        const friendsData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (friendsData) {
            const parsed = JSON.parse(friendsData);
            friends = Array.isArray(parsed) ? parsed.filter(f => validateFriendData(f)) : [];
            updateFriendCounts?.();
        }
        
        const contactsData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
        if (contactsData) contacts = JSON.parse(contactsData) || [];
        
        const requestsData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.REQUESTS);
        if (requestsData) friendRequests = JSON.parse(requestsData) || [];
        
        const sentRequestsData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS);
        if (sentRequestsData) sentRequests = JSON.parse(sentRequestsData) || [];
        
        const pinnedData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS);
        if (pinnedData) {
            const parsed = JSON.parse(pinnedData);
            pinnedFriends = Array.isArray(parsed) ? parsed.filter(f => validateFriendData(f)) : [];
        }
        
        const mutedData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS);
        if (mutedData) {
            const parsed = JSON.parse(mutedData);
            mutedFriends = Array.isArray(parsed) ? parsed.filter(f => validateFriendData(f)) : [];
        }
        
        const allUsersData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE);
        if (allUsersData) allUsers = JSON.parse(allUsersData) || [];
        
        const mutualCache = SafeStorage.getItem(LOCAL_STORAGE_KEYS.MUTUAL_FRIENDS_CACHE);
        if (mutualCache) mutualFriendsCache = JSON.parse(mutualCache) || {};
        
        const groupsData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (groupsData) groups = JSON.parse(groupsData) || [];
        
        const interactionsData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.LAST_INTERACTIONS);
        if (interactionsData) window.lastInteractions = JSON.parse(interactionsData) || {};
        
        const notesData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.PRIVATE_NOTES);
        if (notesData) window.privateNotes = JSON.parse(notesData) || {};
        
    } catch (error) {
        Logger.error('Cache', 'Failed to load cached data', error);
    }
}

export function startParallelDataLoading() {
    if (backgroundTasksStarted) return;
    if (!SafetyGuards.isSessionValid() || !getValidToken()) return;
    
    backgroundTasksStarted = true;
    
    KnectaAuth.showLoading?.(true);
    
    const loaders = [
        loadFriendsFromBackend(),
        loadFriendRequestsFromBackend(),
        loadSentRequestsFromBackend(),
        loadPinnedFriendsFromBackend(),
        loadMutedFriendsFromBackend(),
        loadContactsFromBackend(),
        loadGroupsFromBackend(),
        fetchAllUsersFromBackend()
    ];
    
    Promise.allSettled(loaders).then(() => {
        updateCurrentSection?.();
        showNotification?.('Friends data loaded', 'success');
        KnectaAuth.showLoading?.(false);
    });
}

// =============================================
// [39] UTILITY FUNCTIONS (Original - Preserved)
// =============================================

export function checkMobile() {
    try {
        isMobile = window.innerWidth <= 768;
    } catch (error) {}
}

// =============================================
// [40] CAMERA AND QR CODE FUNCTIONS (Original - Preserved)
// =============================================

export async function startCameraScanner() {
    return featureSandbox('camera', async () => {
        const video = SafetyGuards.safeGetElement('cameraVideo');
        const canvas = SafetyGuards.safeGetElement('scannerCanvas');
        
        if (!video || !canvas) {
            showNotification?.('Camera elements not found', 'error');
            return;
        }
        
        if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
        
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: currentCamera },
                audio: false
            });
            
            video.srcObject = cameraStream;
            
            startRealQRCodeScanning(video, canvas);
            showNotification?.('Camera started', 'success');
            
        } catch (error) {
            Logger.error('Camera', 'Failed to start camera', error);
            
            const container = document.querySelector('.camera-container');
            if (container) {
                container.innerHTML = `
                    <div class="no-camera-message">
                        <i class="fas fa-video-slash"></i>
                        <h3>Camera Access Required</h3>
                        <p>Please allow camera access to scan QR codes.</p>
                    </div>
                `;
            }
            
            showNotification?.('Could not access camera', 'error');
        }
    });
}

function startRealQRCodeScanning(video, canvas) {
    if (!featureFlags.qrCode) return;
    
    const ctx = canvas.getContext('2d');
    scanningActive = true;
    
    function scan() {
        if (!scanningActive || !document.getElementById('cameraScannerModal')?.classList.contains('active')) {
            return;
        }
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            try {
                if (typeof jsQR === 'function') {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert"
                    });
                    
                    if (code) {
                        drawQRCodeRect(code.location, ctx);
                        processScannedQRCodeReal(code.data);
                        return;
                    }
                }
            } catch (e) {}
        }
        
        requestAnimationFrame(scan);
    }
    
    function drawQRCodeRect(location, ctx) {
        try {
            ctx.beginPath();
            ctx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
            ctx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
            ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
            ctx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
            ctx.closePath();
            ctx.lineWidth = 4;
            ctx.strokeStyle = "#00FF00";
            ctx.stroke();
        } catch (e) {}
    }
    
    scan();
}

function processScannedQRCodeReal(qrData) {
    try {
        let parsed;
        try {
            parsed = JSON.parse(qrData);
        } catch (e) {
            parsed = { data: qrData, userId: qrData };
        }
        
        if (!parsed.userId) {
            showNotification?.('Invalid QR code format', 'error');
            return;
        }
        
        if (!validateFriendId(parsed.userId)) {
            showNotification?.('Invalid user ID in QR code', 'error');
            return;
        }
        
        showFriendRequestFromQRReal(parsed);
        
        stopCameraScanner();
        
        const modal = SafetyGuards.safeGetElement('cameraScannerModal');
        if (modal) modal.classList.remove('active');
        
        showNotification?.('QR code scanned!', 'success');
        
    } catch (error) {
        Logger.error('QR', 'Failed to process QR code', error);
        showNotification?.('Error processing QR code', 'error');
    }
}

function showFriendRequestFromQRReal(qrData) {
    fetchUserInfoFromQR(qrData.userId)
        .then(user => {
            const avatar = SafetyGuards.safeGetElement('requestAvatar');
            const name = SafetyGuards.safeGetElement('requestName');
            const username = SafetyGuards.safeGetElement('requestUsername');
            const mutual = SafetyGuards.safeGetElement('mutualCount');
            const accept = SafetyGuards.safeGetElement('acceptRequestBtn');
            const modal = SafetyGuards.safeGetElement('friendRequestModal');
            
            if (avatar) {
                avatar.innerHTML = `<div style="width:100%;height:100%;border-radius:50%;background:var(--primary-color);color:white;display:flex;align-items:center;justify-content:center;font-size:24px;">
                    ${(user.displayName || 'U').charAt(0).toUpperCase()}
                </div>`;
            }
            
            if (name) name.textContent = user.displayName || 'QR Code User';
            if (username) username.textContent = user.username || '@unknown';
            if (mutual) mutual.textContent = '0';
            if (accept) {
                accept.dataset.userId = qrData.userId;
                accept.dataset.userName = user.displayName || 'User';
                accept.dataset.qrData = JSON.stringify(qrData);
            }
            if (modal) modal.classList.add('active');
        })
        .catch(error => {
            Logger.error('QR', 'Failed to fetch user info', error);
            
            const avatar = SafetyGuards.safeGetElement('requestAvatar');
            const name = SafetyGuards.safeGetElement('requestName');
            const username = SafetyGuards.safeGetElement('requestUsername');
            const accept = SafetyGuards.safeGetElement('acceptRequestBtn');
            const modal = SafetyGuards.safeGetElement('friendRequestModal');
            
            if (avatar) {
                avatar.innerHTML = `<div style="width:100%;height:100%;border-radius:50%;background:var(--primary-color);color:white;display:flex;align-items:center;justify-content:center;font-size:24px;">
                    ${(qrData.displayName || 'U').charAt(0).toUpperCase()}
                </div>`;
            }
            
            if (name) name.textContent = qrData.displayName || 'QR Code User';
            if (username) username.textContent = qrData.username || '@unknown';
            if (accept) {
                accept.dataset.userId = qrData.userId;
                accept.dataset.userName = qrData.displayName || 'User';
                accept.dataset.qrData = JSON.stringify(qrData);
            }
            if (modal) modal.classList.add('active');
        });
}

async function fetchUserInfoFromQR(userId) {
    if (!SafetyGuards.isSessionValid()) throw new Error('No valid token');
    
    try {
        const response = await apiCallWithRetry(`/api/users/${userId}`, null, 2);
        if (response?.user && validateFriendData(response.user)) return response.user;
        throw new Error('User not found');
    } catch (error) {
        Logger.error('QR', 'Failed to fetch user', error, { userId });
        throw error;
    }
}

export function stopCameraScanner() {
    scanningActive = false;
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
    const video = SafetyGuards.safeGetElement('cameraVideo');
    if (video) video.srcObject = null;
}

export async function toggleCamera() {
    return featureSandbox('camera', async () => {
        currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
        await startCameraScanner();
    });
}

export function toggleFlash() {
    return featureSandbox('camera', () => {
        if (!cameraStream) return;
        
        const track = cameraStream.getVideoTracks()[0];
        if (!track?.getCapabilities) {
            showNotification?.('Flash not supported', 'warning');
            return;
        }
        
        const caps = track.getCapabilities();
        if (!caps.torch) {
            showNotification?.('Flash not supported on this camera', 'warning');
            return;
        }
        
        flashOn = !flashOn;
        track.applyConstraints({ advanced: [{ torch: flashOn }] });
        
        const btn = SafetyGuards.safeGetElement('toggleFlashBtn');
        if (btn) {
            btn.innerHTML = flashOn ? '<i class="fas fa-lightbulb"></i> Flash On' : '<i class="far fa-lightbulb"></i> Flash Off';
            btn.style.backgroundColor = flashOn ? 'var(--warning-color)' : 'var(--primary-color)';
        }
        
        showNotification?.(flashOn ? 'Flash on' : 'Flash off', 'info');
    });
}

// =============================================
// [41] QR CODE GENERATION (Original - Preserved)
// =============================================

export function generateUniqueQRCode() {
    return featureSandbox('qrCode', () => {
        const container = SafetyGuards.safeGetElement('qrCodeContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (typeof QRCode === 'undefined') {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px; color: var(--primary-color);"></i>
                    <p>Your unique QR code</p>
                    <p style="font-size: 12px; margin-top: 10px;">Scan to add as friend</p>
                </div>
            `;
            return;
        }
        
        const user = currentUser || userData;
        if (!user || !user.id) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>Sign in to generate QR code</p>
                </div>
            `;
            return;
        }
        
        if (!validateFriendData(user)) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>Invalid user data</p>
                </div>
            `;
            return;
        }
        
        const qrData = JSON.stringify({
            type: 'knecta_friend_request',
            userId: user.id,
            username: user.username || `user_${Math.random().toString(36).substr(2, 9)}`,
            displayName: user.displayName || 'Knecta User',
            timestamp: Date.now(),
            app: 'Knecta Chat',
            version: '2.5.1',
            hash: generateVerificationHash(user.id, user.username || '')
        });
        
        try {
            new QRCode(container, {
                text: qrData,
                width: 200,
                height: 200,
                colorDark: '#0084ff',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            
            SafeStorage.setItem(LOCAL_STORAGE_KEYS.UNIQUE_QR_CODE, qrData);
            
        } catch (error) {
            Logger.error('QR', 'Failed to generate QR code', error);
            
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px; color: var(--primary-color);"></i>
                    <p>Your unique QR code</p>
                    <p style="font-size: 10px; margin-top: 5px;">User: ${user.username || user.id}</p>
                </div>
            `;
        }
    });
}

function generateVerificationHash(userId, username) {
    try {
        const data = userId + username + Date.now();
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            hash = ((hash << 5) - hash) + data.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    } catch (error) {
        return 'error_' + Date.now();
    }
}

// =============================================
// [42] MUTUAL FRIENDS FUNCTIONS (Original - Preserved)
// =============================================

export async function showMutualFriends(userId, userName) {
    return featureSandbox('mutualFriends', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return;
        }
        
        if (!validateFriendId(userId)) {
            showNotification?.('Invalid user ID', 'error');
            return;
        }
        
        try {
            const response = await apiCallWithRetry(`/api/friends/mutual/${userId}`, null, 2);
            
            if (response?.mutualFriends) {
                const mutual = response.mutualFriends;
                
                if (mutual.length === 0) {
                    showNotification?.(`No mutual friends with ${userName}`, 'info');
                    return;
                }
                
                displayMutualFriendsModal(mutual, userName);
            } else {
                showNotification?.('No mutual friends found', 'info');
            }
            
        } catch (error) {
            Logger.error('MutualFriends', 'Failed to load mutual friends', error, { userId });
            showNotification?.('Error loading mutual friends', 'error');
        }
    });
}

function displayMutualFriendsModal(mutualFriends, userName) {
    try {
        const countText = SafetyGuards.safeGetElement('mutualCountText');
        const listEl = SafetyGuards.safeGetElement('mutualFriendsList');
        const modal = SafetyGuards.safeGetElement('mutualFriendsModal');
        
        if (!countText || !listEl || !modal) return;
        
        countText.textContent = `${mutualFriends.length} mutual friends with ${userName}`;
        listEl.innerHTML = '';
        
        if (mutualFriends.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No mutual friends found</p>
                </div>
            `;
        } else {
            mutualFriends.forEach(friend => {
                const initials = friend.displayName
                    ? friend.displayName.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2)
                    : 'U';
                
                const item = document.createElement('div');
                item.className = 'mutual-friend-item';
                item.innerHTML = `
                    <div class="mutual-friend-avatar" ${friend.photoURL ? `style="background-image: url('${escapeHtml(friend.photoURL)}')"` : ''}>
                        ${friend.photoURL ? '' : `<span>${initials}</span>`}
                    </div>
                    <div class="mutual-friend-info">
                        <div class="mutual-friend-name">${escapeHtml(friend.displayName || 'Unknown')}</div>
                        ${friend.username ? `<div class="mutual-friend-username">${escapeHtml(friend.username)}</div>` : ''}
                    </div>
                `;
                
                item.addEventListener('click', () => {
                    showFriendDetails?.(friend, 'friend');
                    modal.classList.remove('active');
                });
                
                listEl.appendChild(item);
            });
        }
        
        modal.classList.add('active');
        
    } catch (error) {
        Logger.error('MutualFriends', 'Failed to display modal', error);
    }
}

// =============================================
// [43] FRIEND OPTIONS AND MANAGEMENT (Original - Preserved)
// =============================================

export async function togglePinFriend(friendData) {
    return featureSandbox('pinned', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!validateFriendData(friendData)) {
            showNotification?.('Invalid friend data', 'error');
            return { success: false };
        }
        
        const friendId = friendData.id;
        const isPinned = pinnedFriends.some(f => f && f.id === friendId);
        
        try {
            const response = await apiCallWithRetry(`/api/friends/${friendId}/pin`, {
                method: isPinned ? 'DELETE' : 'POST'
            }, 2);
            
            if (response?.success) {
                if (isPinned) {
                    pinnedFriends = pinnedFriends.filter(f => f.id !== friendId);
                } else {
                    pinnedFriends.push(friendData);
                }
                
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, pinnedFriends);
                
                updateCurrentSection?.();
                updateFriendCounts?.();
                showNotification?.(isPinned ? 'Friend unpinned' : 'Friend pinned', 'success');
                
                return { success: true };
            }
            
            showNotification?.('Failed to update pin status', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('togglePinFriend', 'Failed to toggle pin', error);
                showNotification?.('Failed to update pin status', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

export async function toggleMuteFriend(friendData) {
    return featureSandbox('muted', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!validateFriendData(friendData)) {
            showNotification?.('Invalid friend data', 'error');
            return { success: false };
        }
        
        const friendId = friendData.id;
        const isMuted = mutedFriends.some(f => f && f.id === friendId);
        
        try {
            const response = await apiCallWithRetry(`/api/friends/${friendId}/mute`, {
                method: isMuted ? 'DELETE' : 'POST'
            }, 2);
            
            if (response?.success) {
                if (isMuted) {
                    mutedFriends = mutedFriends.filter(f => f.id !== friendId);
                } else {
                    mutedFriends.push(friendData);
                }
                
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, mutedFriends);
                
                updateCurrentSection?.();
                updateFriendCounts?.();
                showNotification?.(isMuted ? 'Friend unmuted' : 'Friend muted', 'success');
                
                return { success: true };
            }
            
            showNotification?.('Failed to update mute status', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('toggleMuteFriend', 'Failed to toggle mute', error);
                showNotification?.('Failed to update mute status', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

export function savePrivateNote(friendId, note) {
    return featureSandbox('notes', () => {
        if (!validateFriendId(friendId)) {
            showNotification?.('Invalid friend ID', 'error');
            return false;
        }
        
        if (note && note.length > 1000) {
            showNotification?.('Note is too long (max 1000 characters)', 'error');
            return false;
        }
        
        try {
            if (!window.privateNotes) window.privateNotes = {};
            window.privateNotes[friendId] = note;
            
            SafeStorage.setObject(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, window.privateNotes);
            showNotification?.('Note saved', 'success');
            
            return true;
            
        } catch (error) {
            Logger.error('Notes', 'Failed to save note', error, { friendId });
            showNotification?.('Failed to save note', 'error');
            return false;
        }
    }, false);
}

export function getLastInteraction(friendId) {
    try {
        if (!window.lastInteractions) window.lastInteractions = {};
        
        const interaction = window.lastInteractions[friendId];
        if (!interaction?.timestamp) return null;
        
        const now = new Date();
        const then = new Date(interaction.timestamp);
        const minutes = Math.floor((now - then) / 60000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        
        return `${Math.floor(days / 7)}w ago`;
    } catch (error) {
        return null;
    }
}

export async function removeFriend(friendData) {
    return featureSandbox('friends', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!validateFriendData(friendData)) {
            showNotification?.('Invalid friend data', 'error');
            return { success: false };
        }
        
        try {
            const response = await apiCallWithRetry(`/api/friends/${friendData.id}`, {
                method: 'DELETE'
            }, 2);
            
            if (response?.success) {
                friends = friends.filter(f => f.id !== friendData.id);
                pinnedFriends = pinnedFriends.filter(f => f.id !== friendData.id);
                mutedFriends = mutedFriends.filter(f => f.id !== friendData.id);
                
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.FRIENDS, friends);
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, pinnedFriends);
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, mutedFriends);
                
                updateCurrentSection?.();
                updateFriendCounts?.();
                showNotification?.('Friend removed', 'success');
                
                return { success: true };
            }
            
            showNotification?.('Failed to remove friend', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('removeFriend', 'Failed to remove friend', error);
                showNotification?.('Failed to remove friend', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

export async function blockUser(friendData) {
    return featureSandbox('friends', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!validateFriendData(friendData)) {
            showNotification?.('Invalid user data', 'error');
            return { success: false };
        }
        
        try {
            const response = await apiCallWithRetry(`/api/users/${friendData.id}/block`, {
                method: 'POST'
            }, 2);
            
            if (response?.success) {
                friends = friends.filter(f => f.id !== friendData.id);
                pinnedFriends = pinnedFriends.filter(f => f.id !== friendData.id);
                mutedFriends = mutedFriends.filter(f => f.id !== friendData.id);
                
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.FRIENDS, friends);
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, pinnedFriends);
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, mutedFriends);
                
                updateCurrentSection?.();
                updateFriendCounts?.();
                showNotification?.('User blocked', 'success');
                
                return { success: true };
            }
            
            showNotification?.('Failed to block user', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('blockUser', 'Failed to block user', error);
                showNotification?.('Failed to block user', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

// =============================================
// [44] DATA PERSISTENCE FUNCTIONS (Original - Preserved)
// =============================================

export function saveFriendsToLocalStorage() {
    try {
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.FRIENDS, friends);
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.CONTACTS, contacts);
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.REQUESTS, friendRequests);
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.SENT_REQUESTS, sentRequests);
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.TEMPORARY_FRIENDS, temporaryFriends);
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, pinnedFriends);
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, mutedFriends);
        SafeStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, Date.now().toString());
        return true;
    } catch (error) {
        Logger.error('Persistence', 'Failed to save to localStorage', error);
        return false;
    }
}

// =============================================
// [45] UI UPDATE FUNCTIONS (Original - Preserved)
// =============================================

export function updateUIWithUserData(userData) {
    try {
        currentUser = userData;
        userData = userData;
        updateUserDisplayElements(userData);
        if (userData?.id && featureFlags.qrCode) setTimeout(generateUniqueQRCode, 100);
        window.dispatchEvent(new CustomEvent('userDataLoaded', { detail: { userData, source: dataSource.source } }));
    } catch (error) {
        Logger.error('UI', 'Failed to update UI with user data', error);
    }
}

function updateUserDisplayElements(userData) {}

export function updateDataSourceIndicator(source) {
    try {
        const indicator = SafetyGuards.safeGetElement('dataSourceIndicator');
        if (!indicator) return;
        
        indicator.className = 'data-source-indicator active';
        indicator.classList.add(source);
        
        const text = SafetyGuards.safeGetElement('dataSourceText');
        if (text) {
            const labels = {
                'parent': 'Data from Parent',
                'unified_auth': 'Data from Auth System',
                'cache': 'Cached Data',
                'direct': 'Data from API',
                'standalone': 'Standalone Mode',
                'guest': 'Guest Mode'
            };
            text.textContent = labels[source] || 'Unknown Source';
        }
        
        setTimeout(() => indicator.classList.remove('active'), 5000);
        
    } catch (error) {}
}

export function initializeMainFunctionality() {
    try {
        hideAuthError();
        if (typeof enhancedInitialize === 'function') {
            enhancedInitialize();
        } else {
            initializeOriginalFunctionality();
        }
    } catch (error) {
        Logger.error('Init', 'Failed to initialize main functionality', error);
    }
}

function initializeOriginalFunctionality() {
    try {
        loadCachedDataInstantly();
        cacheLoaded = true;
        setTimeout(startParallelDataLoading, 1000);
        setTimeout(updateCurrentSection, 500);
    } catch (error) {}
}

export function showAuthError(message) {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.showAuthError(message);
            return;
        }
        
        const overlay = SafetyGuards.safeGetElement('authErrorOverlay');
        const msgEl = SafetyGuards.safeGetElement('authErrorMessage');
        
        if (overlay && msgEl) {
            msgEl.textContent = message || 'Authentication required';
            overlay.classList.add('active');
        }
    } catch (error) {}
}

export function hideAuthError() {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.hideAuthError();
            return;
        }
        
        const overlay = SafetyGuards.safeGetElement('authErrorOverlay');
        if (overlay) overlay.classList.remove('active');
    } catch (error) {}
}

export function showReconnectionState() {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.showReconnectionState();
            return;
        }
        
        if (!SafetyGuards.safeGetElement('reconnectionIndicator')) {
            const indicator = document.createElement('div');
            indicator.id = 'reconnectionIndicator';
            indicator.className = 'reconnection-indicator';
            indicator.innerHTML = `
                <div class="reconnection-content">
                    <i class="fas fa-sync-alt fa-spin"></i>
                    <span>Reconnecting...</span>
                </div>
            `;
            document.body.appendChild(indicator);
        }
    } catch (error) {}
}

export function hideReconnectionState() {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.hideReconnectionState();
            return;
        }
        
        const indicator = SafetyGuards.safeGetElement('reconnectionIndicator');
        if (indicator) indicator.remove();
    } catch (error) {}
}

// =============================================
// [46] PARENT COORDINATION INTEGRATION (Original - Preserved)
// =============================================

export function initializeParentChildCommunication() {
    try {
        setupSessionEventListeners();
        loadCachedDataInstantly();
        waitForParentSession();
    } catch (error) {
        Logger.error('ParentChild', 'Failed to initialize communication', error);
    }
}

function setupSessionEventListeners() {
    try {
        window.addEventListener('parentSessionReady', handleParentSessionReady);
        window.addEventListener('parentSessionUpdated', handleParentSessionUpdate);
        window.addEventListener('parentSessionLogout', handleParentLogout);
        window.addEventListener('parentProfileUpdated', handleParentProfileUpdate);
        window.addEventListener('knectaAuthReady', handleUnifiedAuthReady);
        window.addEventListener('knectaCacheReady', handleUnifiedCacheReady);
    } catch (error) {}
}

function handleParentSessionReady(event) {
    try {
        dataSource.parentSessionReceived = true;
        dataSource.fetched = true;
        dataSource.fallbackMode = false;
        
        const session = event.detail.session;
        
        dataSource.source = 'parent';
        dataSource.userData = session.user;
        dataSource.token = session.token;
        
        currentUser = session.user;
        userData = session.user;
        
        SessionManager.updateSession(session);
        IframeSessionClient.handleSessionData(session);
        
        updateUIWithUserData(session.user);
        updateDataSourceIndicator('parent');
        
        initializeMainFunctionality();
    } catch (error) {}
}

function handleParentSessionUpdate(event) {
    try {
        const session = event.detail.session;
        dataSource.userData = session.user;
        dataSource.token = session.token;
        currentUser = session.user;
        userData = session.user;
        SessionManager.updateSession(session);
        IframeSessionClient.handleSessionData(session);
        updateUIWithUserData(session.user);
    } catch (error) {}
}

function handleParentLogout(event) {
    try {
        dataSource.userData = null;
        dataSource.token = null;
        dataSource.fetched = false;
        dataSource.parentSessionReceived = false;
        currentUser = null;
        userData = null;
        friends = [];
        contacts = [];
        friendRequests = [];
        sentRequests = [];
        SessionManager.clearSession();
        IframeSessionClient.clear();
        updateCurrentSection?.();
        showAuthError('You have been logged out. Please log in again.');
    } catch (error) {}
}

function handleParentProfileUpdate(event) {
    try {
        const user = event.detail.user;
        dataSource.userData = user;
        currentUser = user;
        userData = user;
        updateUIWithUserData(user);
        showNotification?.('Profile updated', 'success');
    } catch (error) {}
}

function handleUnifiedAuthReady(event) {
    try {
        if (!dataSource.parentSessionReceived) {
            const detail = event.detail;
            dataSource.source = 'unified_auth';
            dataSource.userData = detail.user;
            dataSource.token = detail.token;
            dataSource.fetched = true;
            currentUser = detail.user;
            userData = detail.user;
            SessionManager.updateSession({ token: detail.token, user: detail.user, source: 'unified_auth' });
            updateUIWithUserData(detail.user);
            updateDataSourceIndicator('unified_auth');
            initializeMainFunctionality();
            showNotification?.('Using authentication system. Parent coordination not available.', 'warning');
        }
    } catch (error) {}
}

function handleUnifiedCacheReady(event) {
    try {
        if (!dataSource.fetched) {
            const detail = event.detail;
            if (detail.user) {
                dataSource.source = 'cache';
                dataSource.userData = detail.user;
                dataSource.token = detail.token;
                dataSource.fetched = true;
                currentUser = detail.user;
                userData = detail.user;
                updateUIWithUserData(detail.user);
                updateDataSourceIndicator('cache');
                initializeMainFunctionality();
                showNotification?.('Using cached data. Sign in for live updates.', 'warning');
            }
        }
    } catch (error) {}
}

function waitForParentSession() {
    let attempts = 0;
    const maxAttempts = 10;
    
    const check = () => {
        attempts++;
        if (dataSource.parentSessionReceived || dataSource.fetched) return;
        if (attempts >= maxAttempts) {
            showAuthError('Unable to connect to parent. Please refresh the page.');
            return;
        }
        setTimeout(check, 1000);
    };
    
    check();
}

// =============================================
// [47] MISSING FUNCTION WRAPPERS (Stubs - Preserved)
// =============================================

export function updateCurrentSection() {
    window.dispatchEvent(new CustomEvent('updateCurrentSection'));
}

export function updateFriendCounts() {
    window.dispatchEvent(new CustomEvent('updateFriendCounts'));
}

export function showFriendDetails(friend, type) {
    window.dispatchEvent(new CustomEvent('showFriendDetails', { detail: { friend, type } }));
}

export function renderFriendsListInstantly() {
    window.dispatchEvent(new CustomEvent('renderFriendsListInstantly'));
}

export function addFriendItem(friendData, container, type) {}

export function addFriendItemInstant(friendData, container, type) {}

export function renderContacts() {
    window.dispatchEvent(new CustomEvent('renderContacts'));
}

export function renderFriends() {
    window.dispatchEvent(new CustomEvent('renderFriends'));
}

export function renderFriendRequests() {
    window.dispatchEvent(new CustomEvent('renderFriendRequests'));
}

export function renderSentRequests() {
    window.dispatchEvent(new CustomEvent('renderSentRequests'));
}

export function addFriendRequestItem(requestData, container, type) {}

export function handleFriendAction(action, friendData, type, button) {}

export function handleRequestAction(action, requestData, button) {}

export function filterFriendsByCategory(category) {
    currentCategoryFilter = category;
    window.dispatchEvent(new CustomEvent('filterFriendsByCategory', { detail: { category } }));
}

export function searchFriends(searchTerm) {
    currentSearchTerm = searchTerm?.toLowerCase().trim() || '';
    window.dispatchEvent(new CustomEvent('searchFriends', { detail: { searchTerm } }));
}

export function renderAllUsersList() {
    window.dispatchEvent(new CustomEvent('renderAllUsersList'));
}

export function loadFriendDetails(friendData, type) {
    window.dispatchEvent(new CustomEvent('loadFriendDetails', { detail: { friendData, type } }));
}

export function showFriendRequestProfile(requestData) {
    window.dispatchEvent(new CustomEvent('showFriendRequestProfile', { detail: { requestData } }));
}

export function showFriendOptions(friendData) {
    window.dispatchEvent(new CustomEvent('showFriendOptions', { detail: { friendData } }));
}

export function viewChatHistory(friendData) {
    navigateToChat?.(friendData.id, friendData.displayName || 'User');
}

export function viewCallHistory(friendData) {
    navigateToCall?.(friendData.id, friendData.displayName || 'User');
}

export function showChangeCategoryModal(friendData) {
    window.dispatchEvent(new CustomEvent('showChangeCategoryModal', { detail: { friendData } }));
}

export function renderTemporaryFriends() {
    window.dispatchEvent(new CustomEvent('renderTemporaryFriends'));
}

export function renderPinnedFriends() {
    window.dispatchEvent(new CustomEvent('renderPinnedFriends'));
}

export function renderMutedFriends() {
    window.dispatchEvent(new CustomEvent('renderMutedFriends'));
}

export function showStartChatModal() {
    window.dispatchEvent(new CustomEvent('showStartChatModal'));
}

export function setupEventListeners() {}

// =============================================
// [48] DELEGATED EXPORTS
// =============================================

export function showNotification(message, type = 'success', duration = 3000) {
    if (typeof importedShowNotification === 'function') return importedShowNotification(message, type, duration);
    console.log(`[Notification] ${type.toUpperCase()}: ${message}`);
    return null;
}

export function navigateToChat(userId, userName) {
    if (typeof importedNavigateToChat === 'function') return importedNavigateToChat(userId, userName);
    Logger.warn('Navigation', 'navigateToChat not available', { userId, userName });
    return null;
}

export function navigateToCall(userId, userName) {
    if (typeof importedNavigateToCall === 'function') return importedNavigateToCall(userId, userName);
    Logger.warn('Navigation', 'navigateToCall not available', { userId, userName });
    return null;
}

export function simulateContactSync() {
    if (typeof importedSimulateContactSync === 'function') return importedSimulateContactSync();
    Logger.warn('Contacts', 'simulateContactSync not available');
    return Promise.resolve({ success: false, error: 'Not available' });
}

export function escapeHtml(text) {
    if (typeof importedEscapeHtml === 'function') return importedEscapeHtml(text);
    if (typeof text !== 'string') return text;
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function formatTimeAgo(date) {
    if (typeof importedFormatTimeAgo === 'function') return importedFormatTimeAgo(date);
    if (!date) return '';
    try {
        const now = new Date();
        const then = new Date(date);
        const diff = Math.floor((now - then) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return `${Math.floor(diff / 604800)}w ago`;
    } catch (e) {
        return String(date);
    }
}

export function formatDate(date) {
    try {
        const d = new Date(date);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        return String(date);
    }
}

export function getTrustScoreClass(score) {
    if (typeof importedGetTrustScoreClass === 'function') return importedGetTrustScoreClass(score);
    if (score >= 8) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
}

function timeoutPromise(ms, message) {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message || 'Timeout')), ms);
    });
}

async function withTimeout(promise, ms, message) {
    try {
        return await Promise.race([promise, timeoutPromise(ms, message)]);
    } catch (error) {
        throw error;
    }
}

const dependencyLogger = {
    missing: new Set(),
    logMissing(deps) {
        deps.forEach(dep => {
            if (!this.missing.has(dep)) {
                this.missing.add(dep);
                Logger.warn('Dependency', `Missing dependency: ${dep} - using fallback`);
            }
        });
    }
};

// =============================================
// [49] GLOBAL REGISTRATION
// =============================================

ModuleCoordinator.init();
ModuleCoordinator.start();

window.SafetyGuards = SafetyGuards;
window.ParentCoordinator = ParentCoordinator;
window.KnectaAuth = KnectaAuth;
window.MessageBus = MessageBus;
window.SessionManager = SessionManager;
window.Logger = Logger;
window.ResourceManager = ResourceManager;
window.SecurityManager = SecurityManager;
window.ErrorHandler = ErrorHandler;
window.featureFlags = featureFlags;
window.IframeEnvironment = IframeEnvironment;
window.IframeTransport = IframeTransport;
window.IframeHandshakeAuthority = IframeHandshakeAuthority;
window.IframeSessionClient = IframeSessionClient;
window.RecoveryManager = RecoveryManager;
window.DiagnosticsAgent = DiagnosticsAgent;
window.CompatibilityBridge = CompatibilityBridge;
window.ReliabilityEngine = ReliabilityEngine;
window.NavigationGuard = NavigationGuard;
window.UIFailsafe = UIFailsafe;
window.SandboxDetector = SandboxDetector;
window.ModuleCoordinator = ModuleCoordinator;
window.SafeStorage = SafeStorage;

window.KYN = {
    IframeTransport,
    IframeHandshakeAuthority,
    IframeSessionClient,
    HeartbeatClient,
    SecurityManager,
    TransportAgent: { ...TransportAgent, sendReliable: IframeTransport.send },
    RecoveryManager,
    CompatibilityBridge,
    DiagnosticsAgent,
    StartupGovernor,
    OriginAdapter,
    IframeEnvironment,
    state: kynState
};

window.friendCore = {
    version: '2.5.1',
    initialized: false,
    fallbackMode: false,
    init: enhancedInitialize,
    attemptCachedDataFallback: attemptCachedDataFallback,
    kyn: window.KYN,
    diagnostics: DiagnosticsAgent
};

if (window.__IFRAME_DEBUG__) {
    console.log('🔍 KYN Debug Mode Enabled', {
        environment: IframeEnvironment.type,
        features: IframeEnvironment.features,
        config: ENV_CONFIG,
        kynState
    });
}

// =============================================
// [50] DOM READY INITIALIZATION
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    if (window.__IFRAME_DEBUG__) DiagnosticsAgent.enable();
    
    enhancedInitialize().catch(error => {
        Logger.error('Init', 'Failed to initialize friend core', error);
        showAuthError('Failed to connect to parent. Please refresh the page.');
        apiReady = false;
        isInitialized = false;
        window.dispatchEvent(new CustomEvent('friendCoreReady', { detail: { error: true, message: error.message, timestamp: Date.now() } }));
    });
});

// =============================================
// [51] CLEANUP ON UNLOAD
// =============================================

window.addEventListener('beforeunload', () => {
    saveFriendsToLocalStorage();
    stopCameraScanner();
    if (backgroundSyncInterval) clearInterval(backgroundSyncInterval);
    HeartbeatClient.stop();
    IframeTransport.destroy();
    ResourceManager.release();
    MessageBus.destroy();
    if (window.__IFRAME_DEBUG__) console.log('🔍 KYN Cleanup Complete', DiagnosticsAgent.getMetrics());
});

// =============================================
// EXPORT VERIFICATION COMPLETE
// Version: 2.5.1
// ✅ Environment Auto-Detection
// ✅ Safe Storage Layer
// ✅ Origin Trust Adapter
// ✅ Compatibility Bridge Export Fixed
// ✅ Transport Agent Added
// ✅ Reliability Engine Added
// ✅ Startup Governor
// ✅ Handshake Authority
// ✅ Session Client
// ✅ Recovery Manager
// ✅ Diagnostics Agent
// ✅ Navigation Guard
// ✅ UI Failsafe
// ✅ Sandbox Detection
// ✅ Module Coordinator
// ✅ Logger Race Condition Fixed
// ✅ No Duplicate Handshake
// ✅ No Console Noise
// ✅ All Original Code Preserved
// =============================================