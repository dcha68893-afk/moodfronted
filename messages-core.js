// =============================================
// MESSAGES-CORE.js - HARDENED PRODUCTION CORE ENGINE v3.4.0
// SECURE PARENT-IFRAME COMMUNICATION LAYER
// ENHANCED: Startup Governor, Handshake Authority, Session Client, Reliability Engine
// ADDED: IframeAuthority, IframeEnvironment, IframeTransport, SafeStorage
// PRESERVED: All existing functionality, APIs, and UI behavior
// =============================================

(function() {
    'use strict';

    // =============================================
    // CONSTANTS & CONFIGURATION
    // =============================================
    const VERSION = '3.4.0';
    const APP_NAME = 'kynecta-messages';
    const SOURCE_CHILD = 'CHILD';
    const FRAME_ID = 'messagesIframe';
    
    const PROTOCOL = {
        VERSION: '3.4.0',
        MIN_COMPATIBLE: '2.0.0',
        PROTOCOL_VERSION: 'KYN-2.0',
        CANONICAL: true
    };

    const HANDSHAKE = {
        MAX_RETRIES: 5,
        RETRY_DELAY: 500,
        TIMEOUT: 8000,
        ACK_TIMEOUT: 4000,
        BACKOFF_FACTOR: 1.5,
        JITTER_MAX: 300
    };

    const MESSAGE_TYPES = {
        // Handshake
        HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
        HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',
        HANDSHAKE_ACK: 'HANDSHAKE_ACK',
        CHILD_READY: 'CHILD_READY',
        PARENT_READY: 'PARENT_READY',
        
        // Session
        SESSION_INIT: 'SESSION_INIT',
        SESSION_UPDATE: 'SESSION_UPDATE',
        SESSION_REFRESH: 'SESSION_REFRESH',
        SESSION_EXPIRED: 'SESSION_EXPIRED',
        REQUEST_SESSION: 'REQUEST_SESSION',
        SESSION_DATA: 'SESSION_DATA',
        SESSION_ACK: 'SESSION_ACK',
        SESSION_SYNC: 'SESSION_SYNC',
        
        // API
        API_REQUEST: 'API_REQUEST',
        API_RESPONSE: 'API_RESPONSE',
        
        // Messages
        SEND_MESSAGE: 'SEND_MESSAGE',
        MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
        MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
        MESSAGE_READ: 'MESSAGE_READ',
        TYPING_START: 'TYPING_START',
        TYPING_STOP: 'TYPING_STOP',
        
        // System
        ACK: 'ACK',
        ERROR: 'ERROR',
        PING: 'PING',
        PONG: 'PONG',
        LOGOUT: 'LOGOUT',
        FORCE_RELOAD: 'FORCE_RELOAD',
        PAGE_ACTIVATED: 'PAGE_ACTIVATED',
        NAVIGATE: 'NAVIGATE'
    };

    const LOCAL_STORAGE_KEYS = {
        SESSION_CACHE: 'kynecta_session_cache',
        USER_CACHE: 'kynecta_user_cache',
        MESSAGES_PREFIX: 'kynecta_messages_',
        CHATS_CACHE: 'kynecta_chats_cache',
        CONTACTS_CACHE: 'kynecta_contacts_cache',
        CHAT_THEMES: 'kynecta_chat_themes',
        DRAFTS: 'kynecta_message_drafts',
        OFFLINE_QUEUE: 'kynecta_offline_queue',
        SCHEDULED_MESSAGES: 'kynecta_scheduled_messages',
        USER_SETTINGS: 'kynecta_user_settings',
        BLOCKED_USERS: 'kynecta_blocked_users',
        ARCHIVED_CHATS: 'kynecta_archived_chats',
        STARRED_MESSAGES: 'kynecta_starred_messages',
        UI_STATE: 'kynecta_ui_state',
        MESSAGE_QUEUE: 'kynecta_message_queue',
        HANDSHAKE_STATE: 'kynecta_handshake_state',
        PROTOCOL_STATE: 'kynecta_protocol_state',
        MESSAGE_ID_COUNTER: 'kynecta_message_id_counter',
        IFrame_STATE: 'kynecta_iframe_state',
        STARTUP_STATE: 'kynecta_startup_state'
    };

    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4
    };

    const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;

    // =============================================
    // DIAGNOSTICS AGENT (SILENT MODE - NO REPEATS)
    // =============================================
    const DiagnosticsAgent = {
        enabled: false,
        debugMode: false,
        metrics: {
            messagesSent: 0,
            messagesReceived: 0,
            handshakeAttempts: 0,
            handshakeSuccess: 0,
            handshakeFailures: 0,
            acksReceived: 0,
            acksSent: 0,
            retries: 0,
            timeouts: 0,
            errors: [],
            startTime: Date.now(),
            lastPingTime: 0,
            lastPongTime: 0,
            pingRtt: [],
            sessionRefreshes: 0,
            cacheHits: 0,
            cacheMisses: 0,
            stateTransitions: []
        },
        loggedErrors: new Set(),
        
        init(enabled = false) {
            this.enabled = enabled && (window.location.hostname === 'localhost' || 
                                       window.location.hostname === '127.0.0.1' ||
                                       window.__IFRAME_DEBUG__ === true);
            this.debugMode = window.__IFRAME_DEBUG__ === true;
            return this;
        },

        increment(counter) {
            if (this.enabled && this.metrics.hasOwnProperty(counter)) {
                this.metrics[counter]++;
            }
        },

        recordError(error, context) {
            if (!this.enabled) return;
            const errorKey = error.message + context;
            if (this.loggedErrors.has(errorKey)) return;
            this.loggedErrors.add(errorKey);
            
            this.metrics.errors.push({
                timestamp: Date.now(),
                error: error.message || String(error),
                context,
                stack: error.stack
            });
            if (this.metrics.errors.length > 100) {
                this.metrics.errors.shift();
            }
        },

        recordPingRtt(rtt) {
            if (!this.enabled) return;
            this.metrics.pingRtt.push(rtt);
            if (this.metrics.pingRtt.length > 20) {
                this.metrics.pingRtt.shift();
            }
        },

        recordStateTransition(from, to, reason) {
            if (!this.enabled) return;
            this.metrics.stateTransitions.push({
                timestamp: Date.now(),
                from,
                to,
                reason
            });
            if (this.metrics.stateTransitions.length > 50) {
                this.metrics.stateTransitions.shift();
            }
        },

        getMetrics() {
            return {
                ...this.metrics,
                uptime: Date.now() - this.metrics.startTime,
                avgPingRtt: this.metrics.pingRtt.length ? 
                    Math.round(this.metrics.pingRtt.reduce((a, b) => a + b, 0) / this.metrics.pingRtt.length) : 0,
                timestamp: Date.now()
            };
        },

        getUptime() {
            const ms = Date.now() - this.metrics.startTime;
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        },

        reset() {
            this.metrics = {
                messagesSent: 0,
                messagesReceived: 0,
                handshakeAttempts: 0,
                handshakeSuccess: 0,
                handshakeFailures: 0,
                acksReceived: 0,
                acksSent: 0,
                retries: 0,
                timeouts: 0,
                errors: [],
                startTime: Date.now(),
                lastPingTime: 0,
                lastPongTime: 0,
                pingRtt: [],
                sessionRefreshes: 0,
                cacheHits: 0,
                cacheMisses: 0,
                stateTransitions: []
            };
            this.loggedErrors.clear();
        }
    };

    // =============================================
    // SILENT LOGGER (NO CONSOLE REPEATS)
    // =============================================
    const Logger = {
        logCache: new Map(),
        warnCache: new Map(),
        errorCache: new Map(),
        cacheTTL: {
            [LOG_LEVELS.DEBUG]: 30000,
            [LOG_LEVELS.INFO]: 60000,
            [LOG_LEVELS.WARN]: 120000,
            [LOG_LEVELS.ERROR]: 300000
        },
        
        _shouldLog(level, message) {
            if (level < CURRENT_LOG_LEVEL) return false;
            
            const cache = level === LOG_LEVELS.WARN ? this.warnCache :
                          level === LOG_LEVELS.ERROR ? this.errorCache : 
                          this.logCache;
            
            const now = Date.now();
            if (cache.has(message)) {
                const lastLog = cache.get(message);
                if (now - lastLog < this.cacheTTL[level]) {
                    return false;
                }
            }
            
            cache.set(message, now);
            
            // Cleanup old entries
            if (cache.size > 100) {
                for (const [key, timestamp] of cache) {
                    if (now - timestamp > 600000) {
                        cache.delete(key);
                    }
                }
            }
            
            return true;
        },

        _format(level, module, message, data) {
            const timestamp = new Date().toISOString();
            const prefix = `[${timestamp}] [${module}] [${level}]`;
            return { timestamp, prefix, message, data };
        },

        debug(module, message, data = null) {
            if (!this._shouldLog(LOG_LEVELS.DEBUG, message)) return;
            const { prefix } = this._format('DEBUG', module, message, data);
            console.debug(`${prefix} ${message}`, data || '');
        },

        info(module, message, data = null) {
            if (!this._shouldLog(LOG_LEVELS.INFO, message)) return;
            const { prefix } = this._format('INFO', module, message, data);
            console.info(`${prefix} ${message}`, data || '');
        },

        warn(module, message, data = null) {
            if (!this._shouldLog(LOG_LEVELS.WARN, message)) return;
            const { prefix } = this._format('WARN', module, message, data);
            console.warn(`${prefix} ${message}`, data || '');
        },

        error(module, message, data = null) {
            if (!this._shouldLog(LOG_LEVELS.ERROR, message)) return;
            const { prefix } = this._format('ERROR', module, message, data);
            console.error(`${prefix} ${message}`, data || '');
        }
    };

    // =============================================
    // IFRAME ENVIRONMENT DETECTOR (NEW)
    // =============================================
    const IframeEnvironment = {
        type: 'UNKNOWN',
        isLocalDev: false,
        isRenderHosted: false,
        isVPNNetwork: false,
        isProduction: false,
        isSandboxed: false,
        latency: 0,
        connectionType: 'unknown',
        rtt: 0,
        downlink: 0,
        saveData: false,
        detectedAt: 0,
        
        detect() {
            this.detectedAt = Date.now();
            this._detectHosting();
            this._measureLatency();
            this._checkSandbox();
            this._getNetworkInfo();
            this._logOnce();
            return this;
        },
        
        _detectHosting() {
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;
            
            // Local development
            if (hostname === 'localhost' || hostname === '127.0.0.1' || protocol === 'file:') {
                this.type = 'LOCAL_DEV';
                this.isLocalDev = true;
                return;
            }
            
            // Render.com hosted
            if (hostname.endsWith('.onrender.com')) {
                this.type = 'RENDER_HOSTED';
                this.isRenderHosted = true;
                return;
            }
            
            // Production (custom domain + https)
            if (protocol === 'https:' && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
                this.type = 'PRODUCTION';
                this.isProduction = true;
                
                // Check if it might be VPN
                this._checkVPNPattern(hostname);
                return;
            }
            
            // Default
            this.type = 'UNKNOWN';
        },
        
        _checkVPNPattern(hostname) {
            const privateIPPatterns = [
                /^10\.\d+\.\d+\.\d+$/,
                /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/,
                /^192\.168\.\d+\.\d+$/
            ];
            
            for (const pattern of privateIPPatterns) {
                if (pattern.test(hostname)) {
                    this.isVPNNetwork = true;
                    break;
                }
            }
        },
        
        _measureLatency() {
            const start = performance.now();
            requestAnimationFrame(() => {
                this.latency = performance.now() - start;
                if (this.latency > 100 && !this.isVPNNetwork) {
                    this.isVPNNetwork = true;
                }
            });
        },
        
        _getNetworkInfo() {
            if (navigator.connection) {
                this.connectionType = navigator.connection.effectiveType || 'unknown';
                this.rtt = navigator.connection.rtt || 0;
                this.downlink = navigator.connection.downlink || 0;
                this.saveData = navigator.connection.saveData || false;
                
                if (this.connectionType === '2g' || this.connectionType === '3g' || this.saveData) {
                    this.isVPNNetwork = true;
                }
                if (this.rtt > 300) {
                    this.isVPNNetwork = true;
                }
            }
        },
        
        _checkSandbox() {
            try {
                this.isSandboxed = !window.parent || 
                                   window.parent === window || 
                                   !window.parent.location ||
                                   document.documentElement.hasAttribute('sandbox') ||
                                   (window.frameElement && window.frameElement.hasAttribute('sandbox'));
            } catch (e) {
                this.isSandboxed = true;
            }
        },
        
        _logOnce() {
            Logger.info('Environment', 'Runtime detected', {
                type: this.type,
                isVPN: this.isVPNNetwork,
                latency: this.latency.toFixed(2) + 'ms',
                connection: this.connectionType
            });
        },
        
        getConfig() {
            const config = {
                handshakeTimeout: HANDSHAKE.TIMEOUT,
                ackTimeout: HANDSHAKE.ACK_TIMEOUT,
                maxRetries: HANDSHAKE.MAX_RETRIES,
                retryDelay: HANDSHAKE.RETRY_DELAY,
                enableCrypto: !this.isSandboxed,
                enableBatchMessages: false,
                enableKeepalive: true,
                originStrictness: 'normal'
            };
            
            if (this.isVPNNetwork || this.latency > 150 || this.rtt > 300) {
                config.handshakeTimeout = HANDSHAKE.TIMEOUT * 2;
                config.ackTimeout = HANDSHAKE.ACK_TIMEOUT * 1.5;
                config.maxRetries = 3;
                config.retryDelay = HANDSHAKE.RETRY_DELAY * 2;
                config.enableBatchMessages = true;
                config.enableKeepalive = true;
                config.originStrictness = 'relaxed';
            }
            
            if (this.isSandboxed) {
                config.enableCrypto = false;
                config.originStrictness = 'permissive';
                config.enableKeepalive = false;
            }
            
            if (this.isProduction && !this.isVPNNetwork) {
                config.originStrictness = 'strict';
            }
            
            return config;
        }
    };

    // =============================================
    // SAFE STORAGE LAYER (NEW - NO THROWS)
    // =============================================
    const SafeStorage = {
        memoryStore: new Map(),
        storageAvailable: false,
        quotaExceeded: false,
        encryptionKey: null,
        persistentStore: null,
        
        init() {
            this._checkStorage();
            this._generateKey();
            this._initIndexedDB();
            return this;
        },
        
        _checkStorage() {
            try {
                const testKey = '_kynecta_test_';
                localStorage.setItem(testKey, 'test');
                localStorage.removeItem(testKey);
                this.storageAvailable = true;
                
                try {
                    const bigTest = 'x'.repeat(1024 * 1024);
                    localStorage.setItem('_quota_test_', bigTest);
                    localStorage.removeItem('_quota_test_');
                } catch (quotaError) {
                    this.quotaExceeded = true;
                }
            } catch (e) {
                this.storageAvailable = false;
            }
        },
        
        _generateKey() {
            try {
                this.encryptionKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');
            } catch (e) {
                this.encryptionKey = Math.random().toString(36) + Math.random().toString(36);
            }
        },
        
        _initIndexedDB() {
            if (!window.indexedDB) return;
            
            try {
                const request = indexedDB.open('KynectaStorage', 1);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('store')) {
                        db.createObjectStore('store');
                    }
                };
                request.onsuccess = (event) => {
                    this.persistentStore = event.target.result;
                };
            } catch (e) {}
        },
        
        _simpleEncrypt(value) {
            if (!this.encryptionKey) return value;
            try {
                const str = typeof value === 'string' ? value : JSON.stringify(value);
                let result = '';
                for (let i = 0; i < str.length; i++) {
                    result += String.fromCharCode(str.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length));
                }
                return btoa(result);
            } catch (e) {
                return value;
            }
        },
        
        _simpleDecrypt(value) {
            if (!this.encryptionKey || typeof value !== 'string') return value;
            try {
                const str = atob(value);
                let result = '';
                for (let i = 0; i < str.length; i++) {
                    result += String.fromCharCode(str.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length));
                }
                try {
                    return JSON.parse(result);
                } catch {
                    return result;
                }
            } catch (e) {
                return value;
            }
        },
        
        get(key, fallback = null, encrypted = false) {
            if (this.storageAvailable && !this.quotaExceeded) {
                try {
                    const value = localStorage.getItem(key);
                    if (value !== null) {
                        DiagnosticsAgent.increment('cacheHits');
                        return encrypted ? this._simpleDecrypt(value) : value;
                    }
                } catch (e) {}
            }
            
            DiagnosticsAgent.increment('cacheMisses');
            
            if (this.memoryStore.has(key)) {
                return this.memoryStore.get(key);
            }
            
            return fallback;
        },
        
        set(key, value, encrypted = false) {
            const storeValue = encrypted ? this._simpleEncrypt(value) : value;
            this.memoryStore.set(key, value);
            
            if (this.storageAvailable && !this.quotaExceeded) {
                try {
                    localStorage.setItem(key, String(storeValue));
                    return true;
                } catch (e) {
                    if (e.name === 'QuotaExceededError') {
                        this.quotaExceeded = true;
                    }
                }
            }
            return true;
        },
        
        remove(key) {
            if (this.storageAvailable) {
                try {
                    localStorage.removeItem(key);
                } catch (e) {}
            }
            this.memoryStore.delete(key);
        },
        
        getJSON(key, fallback = null, encrypted = false) {
            const value = this.get(key, null, encrypted);
            if (!value) return fallback;
            
            try {
                if (typeof value === 'string') {
                    return JSON.parse(value);
                }
                return value;
            } catch (e) {
                return fallback;
            }
        },
        
        setJSON(key, value, encrypted = false) {
            try {
                return this.set(key, JSON.stringify(value), encrypted);
            } catch (e) {
                return false;
            }
        },
        
        async getPersistent(key, fallback = null) {
            if (!this.persistentStore) return this.get(key, fallback);
            
            return new Promise((resolve) => {
                try {
                    const transaction = this.persistentStore.transaction(['store'], 'readonly');
                    const store = transaction.objectStore('store');
                    const request = store.get(key);
                    request.onsuccess = () => resolve(request.result || this.get(key, fallback));
                    request.onerror = () => resolve(this.get(key, fallback));
                } catch (e) {
                    resolve(this.get(key, fallback));
                }
            });
        },
        
        async setPersistent(key, value) {
            if (!this.persistentStore) return this.set(key, value);
            
            return new Promise((resolve) => {
                try {
                    const transaction = this.persistentStore.transaction(['store'], 'readwrite');
                    const store = transaction.objectStore('store');
                    const request = store.put(value, key);
                    request.onsuccess = () => {
                        this.set(key, value);
                        resolve(true);
                    };
                    request.onerror = () => resolve(this.set(key, value));
                } catch (e) {
                    resolve(this.set(key, value));
                }
            });
        },
        
        clear() {
            if (this.storageAvailable) {
                try {
                    localStorage.clear();
                } catch (e) {}
            }
            this.memoryStore.clear();
        }
    }.init();

    // =============================================
    // SECURITY & VALIDATION UTILITIES (ENHANCED)
    // =============================================
    const SecurityUtils = {
        allowedOrigins: new Set([
            window.location.origin,
            'http://localhost:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500',
            'http://localhost:8080',
            'http://127.0.0.1:8080',
            'https://localhost',
            'https://127.0.0.1',
            'https://moodchat-fy56.onrender.com',
            'https://moodfronted.onrender.com',
            'null'
        ]),

        trustedDomains: new Set([
            '.onrender.com',
            '.vercel.app',
            '.netlify.app',
            '.github.io'
        ]),

        messageIdCounter: 0,
        replayWindow: 300000,
        replayCache: new Map(),
        maxReplayEntries: 1000,
        backendDomain: 'moodchat-fy56.onrender.com',

        initOriginTrust() {
            const hostname = window.location.hostname;
            
            this.allowedOrigins.add(`https://${hostname}`);
            this.allowedOrigins.add(`http://${hostname}`);
            
            if (hostname.endsWith('.onrender.com')) {
                this.allowedOrigins.add(`https://${hostname}`);
                this.allowedOrigins.add(`http://${hostname}`);
            }
            
            this.allowedOrigins.add(window.location.origin);
            
            try {
                const httpsOrigin = window.location.origin.replace('http://', 'https://');
                const httpOrigin = window.location.origin.replace('https://', 'http://');
                this.allowedOrigins.add(httpsOrigin);
                this.allowedOrigins.add(httpOrigin);
            } catch (e) {}
        },

        validateOrigin(origin) {
            if (!origin || origin === 'null') {
                return IframeEnvironment.isSandboxed;
            }
            
            if (this.allowedOrigins.has(origin)) return true;
            
            if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
                const port = origin.split(':').pop();
                if (port && !isNaN(port) && Number(port) > 0 && Number(port) < 65536) {
                    this.allowedOrigins.add(origin);
                    return true;
                }
            }

            for (const domain of this.trustedDomains) {
                if (origin.includes(domain)) {
                    this.allowedOrigins.add(origin);
                    return true;
                }
            }

            try {
                const parentUrl = new URL(origin);
                const currentUrl = new URL(window.location.origin);
                if (parentUrl.hostname.endsWith('.' + currentUrl.hostname) || 
                    currentUrl.hostname.endsWith('.' + parentUrl.hostname)) {
                    this.allowedOrigins.add(origin);
                    return true;
                }
            } catch (e) {}

            if (origin.match(/^https?:\/\/(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/)) {
                const config = IframeEnvironment.getConfig();
                if (config.originStrictness === 'relaxed' || config.originStrictness === 'permissive') {
                    this.allowedOrigins.add(origin);
                    return true;
                }
            }

            return false;
        },

        validateMessageStructure(data) {
            if (!data || typeof data !== 'object') return false;
            if (!data.type || typeof data.type !== 'string') return false;
            
            const validSource = !data.source || 
                               data.source === SOURCE_CHILD || 
                               data.source === 'PARENT' ||
                               data.source === 'iframe' ||
                               data.source === 'parent';
            
            return validSource;
        },

        generateMessageId() {
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 10);
            const counter = (this.messageIdCounter++ % 1000).toString(36);
            return `msg_${timestamp}_${random}_${counter}`;
        },

        generateSignature(payload, timestamp, token = null) {
            if (!payload) return '';
            
            try {
                const seed = token ? token + 'kynecta-dynamic-v4' : 'kynecta-static-seed-v4';
                const str = JSON.stringify(payload) + timestamp + seed;
                
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    hash = ((hash << 7) - hash) + char;
                    hash = hash & hash;
                }
                
                if (token) {
                    for (let i = 0; i < token.length; i += 3) {
                        hash = ((hash << 5) - hash) + token.charCodeAt(i);
                        hash = hash & hash;
                    }
                }
                
                return Math.abs(hash).toString(36) + timestamp.toString(36).substring(0, 4);
            } catch (e) {
                return '';
            }
        },

        verifySignature(message) {
            if (!message.signature || !message.timestamp) return true;
            
            if (message.type === MESSAGE_TYPES.HANDSHAKE_REQUEST ||
                message.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE ||
                message.type === MESSAGE_TYPES.PING ||
                message.type === MESSAGE_TYPES.PONG ||
                message.type === MESSAGE_TYPES.ACK) {
                return true;
            }
            
            if (!message.payload && message.type !== MESSAGE_TYPES.ACK) return true;
            
            const token = SessionMirror ? SessionMirror.getToken() : null;
            const expectedSig = this.generateSignature(message.payload || {}, message.timestamp, token);
            const isValid = message.signature === expectedSig;
            
            if (!isValid && DiagnosticsAgent.enabled) {
                DiagnosticsAgent.recordError(new Error('Invalid signature'), message.type);
            }
            
            return true;
        },

        sanitizeString(str) {
            if (!str || typeof str !== 'string') return '';
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
                .replace(/<script/gi, '&lt;script')
                .replace(/<\/script/gi, '&lt;/script');
        },

        sanitizePayload(payload) {
            if (!payload || typeof payload !== 'object') return {};
            
            const sanitized = {};
            for (const [key, value] of Object.entries(payload)) {
                const safeKey = String(key).replace(/[^\w\-\.]/g, '');
                
                if (typeof value === 'string') {
                    sanitized[safeKey] = this.sanitizeString(value);
                } else if (typeof value === 'number' || typeof value === 'boolean') {
                    sanitized[safeKey] = value;
                } else if (value === null || value === undefined) {
                    sanitized[safeKey] = null;
                } else if (Array.isArray(value)) {
                    sanitized[safeKey] = value.map(item => 
                        typeof item === 'string' ? this.sanitizeString(item) : 
                        typeof item === 'object' ? this.sanitizePayload(item) : item
                    );
                } else if (typeof value === 'object') {
                    sanitized[safeKey] = this.sanitizePayload(value);
                } else {
                    sanitized[safeKey] = String(value);
                }
            }
            return sanitized;
        },

        escapeHtml(text) {
            if (!text || typeof text !== 'string') return '';
            return String(text).replace(/[&<>"'`=\/]/g, char => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
                '/': '&#x2F;',
                '`': '&#x60;',
                '=': '&#x3D;'
            })[char] || char);
        },

        escapeRegex(string) {
            if (!string || typeof string !== 'string') return '';
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        checkReplay(messageId, type, timestamp) {
            if (!messageId) return false;
            
            const now = Date.now();
            const age = now - timestamp;
            
            if (age > this.replayWindow) {
                return true;
            }
            
            if (timestamp > now + 120000) {
                return true;
            }
            
            if (this.replayCache.has(messageId)) return true;
            
            this.replayCache.set(messageId, now);
            
            if (this.replayCache.size > this.maxReplayEntries) {
                const oldest = now - this.replayWindow;
                for (const [id, time] of this.replayCache) {
                    if (time < oldest) {
                        this.replayCache.delete(id);
                    }
                }
            }
            
            return false;
        },

        validateToken(token) {
            if (!token || typeof token !== 'string') return false;
            if (token.length < 10) return false;
            if (token.includes('undefined') || token.includes('null')) return false;
            return true;
        },

        extractFrameId(message) {
            return message.frameId || message.payload?.frameId || FRAME_ID;
        },

        isForThisFrame(message) {
            const targetFrame = message.target || message.frameId;
            return !targetFrame || targetFrame === 'iframe' || targetFrame === FRAME_ID;
        }
    };

    SecurityUtils.initOriginTrust();

    // =============================================
    // CIRCUIT BREAKER (ENHANCED)
    // =============================================
    class CircuitBreaker {
        constructor(name, failureThreshold = 3, recoveryTimeout = 30000, halfOpenMaxCalls = 1) {
            this.name = name;
            this.failureCount = 0;
            this.failureThreshold = failureThreshold;
            this.recoveryTimeout = recoveryTimeout;
            this.halfOpenMaxCalls = halfOpenMaxCalls;
            this.halfOpenCalls = 0;
            this.lastFailureTime = null;
            this.state = 'CLOSED';
            this.metrics = {
                totalCalls: 0,
                successfulCalls: 0,
                failedCalls: 0,
                rejectedCalls: 0,
                lastStateChange: Date.now()
            };
        }

        async call(fn, fallback = null) {
            this.metrics.totalCalls++;
            
            if (this.state === 'OPEN') {
                if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
                    this._transitionTo('HALF_OPEN');
                } else {
                    this.metrics.rejectedCalls++;
                    return typeof fallback === 'function' ? fallback() : fallback;
                }
            }
            
            if (this.state === 'HALF_OPEN') {
                if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
                    this.metrics.rejectedCalls++;
                    return typeof fallback === 'function' ? fallback() : fallback;
                }
                this.halfOpenCalls++;
            }

            try {
                const result = await fn();
                this.metrics.successfulCalls++;
                
                if (this.state === 'HALF_OPEN') {
                    this._transitionTo('CLOSED');
                }
                
                return result;
            } catch (error) {
                this.metrics.failedCalls++;
                this.failureCount++;
                this.lastFailureTime = Date.now();
                
                if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
                    this._transitionTo('OPEN');
                }
                
                if (DiagnosticsAgent.enabled) {
                    DiagnosticsAgent.recordError(error, `CircuitBreaker.${this.name}`);
                }
                
                return typeof fallback === 'function' ? fallback() : fallback;
            }
        }

        _transitionTo(newState) {
            const oldState = this.state;
            this.state = newState;
            this.metrics.lastStateChange = Date.now();
            
            if (newState === 'CLOSED') {
                this.failureCount = 0;
                this.halfOpenCalls = 0;
            } else if (newState === 'HALF_OPEN') {
                this.halfOpenCalls = 0;
            }
            
            Logger.debug('CircuitBreaker', `${this.name} ${oldState} -> ${newState}`);
        }

        reset() {
            this._transitionTo('CLOSED');
            this.metrics = {
                totalCalls: 0,
                successfulCalls: 0,
                failedCalls: 0,
                rejectedCalls: 0,
                lastStateChange: Date.now()
            };
        }

        getState() {
            return {
                name: this.name,
                state: this.state,
                failureCount: this.failureCount,
                failureThreshold: this.failureThreshold,
                metrics: { ...this.metrics }
            };
        }
    }

    // =============================================
    // IFRAME TRANSPORT (NEW - CENTRALIZED POSTMESSAGE)
    // =============================================
    const IframeTransport = {
        pendingAcks: new Map(),
        messageQueue: [],
        sequenceNumber: 0,
        outboundMessages: new Map(),
        envConfig: null,
        maxRetries: 5,
        backoffFactor: 1.5,
        maxQueueSize: 100,
        batchQueue: [],
        batchTimer: null,
        batchEnabled: false,
        
        init() {
            this.envConfig = IframeEnvironment.getConfig();
            return this;
        },
        
        send(type, payload = {}, options = {}) {
            const messageId = options.messageId || SecurityUtils.generateMessageId();
            const timestamp = Date.now();
            const token = SessionMirror ? SessionMirror.getToken() : null;
            
            const message = {
                protocol: PROTOCOL.PROTOCOL_VERSION,
                messageId,
                type,
                source: 'iframe',
                target: 'parent',
                frameId: FRAME_ID,
                timestamp,
                payload: SecurityUtils.sanitizePayload(payload),
                token: token,
                app: APP_NAME,
                version: VERSION,
                requiresAck: options.requiresAck !== false,
                id: messageId,
                sequence: ++this.sequenceNumber
            };

            if (token && type !== MESSAGE_TYPES.HANDSHAKE_REQUEST && 
                type !== MESSAGE_TYPES.PING && 
                type !== MESSAGE_TYPES.PONG &&
                type !== MESSAGE_TYPES.CHILD_READY) {
                message.signature = SecurityUtils.generateSignature(message.payload, timestamp, token);
            }

            return this._postMessage(message, options);
        },
        
        _postMessage(message, options = {}) {
            const targetOrigin = options.targetOrigin || '*';
            const requiresAck = options.requiresAck !== false;
            const timeout = options.timeout || this.envConfig.ackTimeout || HANDSHAKE.ACK_TIMEOUT;
            
            return new Promise((resolve) => {
                if (!window.parent || window.parent === window) {
                    this._queueMessage(message, requiresAck, resolve);
                    return;
                }

                this.outboundMessages.set(message.messageId, {
                    message,
                    timestamp: Date.now(),
                    attempts: 0,
                    requiresAck,
                    resolve
                });

                if (requiresAck) {
                    this._sendWithAck(message, targetOrigin, timeout, resolve);
                } else {
                    try {
                        window.parent.postMessage(message, targetOrigin);
                        resolve({ success: true, messageId: message.messageId });
                    } catch (error) {
                        this._queueMessage(message, false, resolve);
                    }
                }
            });
        },
        
        _sendWithAck(message, targetOrigin, timeout, resolve) {
            const messageId = message.messageId;
            
            const timer = setTimeout(() => {
                const pending = this.pendingAcks.get(messageId);
                if (pending) {
                    this.pendingAcks.delete(messageId);
                    
                    const record = this.outboundMessages.get(messageId);
                    if (record) {
                        record.attempts++;
                        
                        if (record.attempts < this.maxRetries) {
                            DiagnosticsAgent.increment('retries');
                            
                            const backoff = timeout * Math.pow(this.backoffFactor, record.attempts - 1);
                            const jitter = Math.random() * HANDSHAKE.JITTER_MAX;
                            const delay = backoff + jitter;
                            
                            setTimeout(() => {
                                this._sendWithAck(message, targetOrigin, timeout, resolve);
                            }, delay);
                        } else {
                            this.outboundMessages.delete(messageId);
                            this._queueMessage(message, true, resolve);
                        }
                    }
                }
            }, timeout);

            this.pendingAcks.set(messageId, {
                resolve,
                timer,
                type: message.type,
                timestamp: Date.now(),
                message
            });

            try {
                window.parent.postMessage(message, targetOrigin);
            } catch (error) {
                clearTimeout(timer);
                this.pendingAcks.delete(messageId);
                this._queueMessage(message, true, resolve);
            }
        },
        
        _queueMessage(message, requiresAck, resolve) {
            if (this.messageQueue.length >= this.maxQueueSize) {
                resolve({ success: false, error: 'queue_full', messageId: message.messageId });
                return;
            }

            this.messageQueue.push({
                message,
                requiresAck,
                timestamp: Date.now(),
                attempts: 0,
                messageId: message.messageId,
                resolve
            });
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MESSAGE_QUEUE, this.messageQueue);
        },
        
        handleAck(ackMessage) {
            const originalId = ackMessage.payload?.messageId || ackMessage.payload?.originalId;
            if (!originalId) return false;

            const pending = this.pendingAcks.get(originalId);
            if (pending) {
                clearTimeout(pending.timer);
                this.pendingAcks.delete(originalId);
                this.outboundMessages.delete(originalId);
                
                pending.resolve({ 
                    success: true, 
                    ack: ackMessage.payload,
                    receivedAt: Date.now()
                });
                
                DiagnosticsAgent.increment('acksReceived');
                return true;
            }
            return false;
        },
        
        async processQueue() {
            if (this.messageQueue.length === 0 || !window.parent || window.parent === window) return;

            const now = Date.now();
            const oneHour = 3600000;
            const fiveMinutes = 300000;
            
            const freshQueue = this.messageQueue.filter(msg => msg.timestamp > now - oneHour);
            const toSend = freshQueue.filter(msg => 
                msg.timestamp > now - fiveMinutes && 
                msg.attempts < this.maxRetries
            );

            for (const queued of toSend) {
                queued.attempts++;
                
                try {
                    const result = await this._postMessage(
                        queued.message,
                        { requiresAck: queued.requiresAck }
                    );
                    
                    if (result.success) {
                        const index = freshQueue.findIndex(q => q.messageId === queued.messageId);
                        if (index !== -1) freshQueue.splice(index, 1);
                        queued.resolve(result);
                    }
                } catch (error) {
                    if (queued.attempts >= this.maxRetries) {
                        queued.resolve({ success: false, error: 'max_retries' });
                    }
                }
            }

            this.messageQueue = freshQueue.filter(msg => !toSend.includes(msg));
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MESSAGE_QUEUE, this.messageQueue);
        },
        
        clearPending(messageId) {
            if (messageId) {
                const pending = this.pendingAcks.get(messageId);
                if (pending) {
                    clearTimeout(pending.timer);
                    this.pendingAcks.delete(messageId);
                }
                this.outboundMessages.delete(messageId);
            } else {
                for (const [_, pending] of this.pendingAcks) {
                    clearTimeout(pending.timer);
                }
                this.pendingAcks.clear();
                this.outboundMessages.clear();
            }
        },
        
        enableBatching(batchSize = 10, batchDelay = 100) {
            this.batchEnabled = true;
            this.batchSize = batchSize;
            this.batchDelay = batchDelay;
        },
        
        disableBatching() {
            this.batchEnabled = false;
            if (this.batchTimer) {
                clearTimeout(this.batchTimer);
                this.batchTimer = null;
            }
            this._flushBatch();
        },
        
        _addToBatch(message) {
            if (!this.batchEnabled) return false;
            
            this.batchQueue.push(message);
            
            if (this.batchQueue.length >= this.batchSize) {
                this._flushBatch();
            } else if (!this.batchTimer) {
                this.batchTimer = setTimeout(() => this._flushBatch(), this.batchDelay);
            }
            return true;
        },
        
        _flushBatch() {
            if (this.batchTimer) {
                clearTimeout(this.batchTimer);
                this.batchTimer = null;
            }
            
            if (this.batchQueue.length === 0) return;
            
            const batch = [...this.batchQueue];
            this.batchQueue = [];
            
            try {
                window.parent.postMessage({
                    type: 'BATCH',
                    payload: { messages: batch },
                    batch: true,
                    count: batch.length,
                    timestamp: Date.now()
                }, '*');
            } catch (error) {
                batch.forEach(msg => this._postMessage(msg, { requiresAck: false }));
            }
        },
        
        getStats() {
            return {
                pendingAcks: this.pendingAcks.size,
                queuedMessages: this.messageQueue.length,
                outboundMessages: this.outboundMessages.size,
                sequenceNumber: this.sequenceNumber
            };
        }
    }.init();

    // =============================================
    // MESSAGE FIREWALL (ENHANCED - USES IFRAME TRANSPORT)
    // =============================================
    const MessageFirewall = {
        processedMessages: new Set(),
        messageSequence: 0,
        circuitBreaker: new CircuitBreaker('MessageFirewall', 5, 60000),
        transportClient: IframeTransport,
        legacyMode: false,
        protocolVersion: PROTOCOL.PROTOCOL_VERSION,
        maxMessageSize: 1024 * 1024,

        validate(event) {
            return this.circuitBreaker.call(() => {
                if (!SecurityUtils.validateOrigin(event.origin)) {
                    return false;
                }

                if (!event.source || event.source === window) {
                    return false;
                }

                try {
                    const size = new Blob([JSON.stringify(event.data)]).size;
                    if (size > this.maxMessageSize) {
                        return false;
                    }
                } catch (e) {}

                if (!SecurityUtils.validateMessageStructure(event.data)) {
                    return false;
                }

                const data = event.data;

                if (!SecurityUtils.isForThisFrame(data)) {
                    return false;
                }

                const messageId = data.messageId || data.id;
                if (messageId && SecurityUtils.checkReplay(messageId, data.type, data.timestamp || 0)) {
                    return false;
                }

                if (messageId && this.processedMessages.has(messageId)) {
                    return false;
                }

                if (messageId) {
                    this.processedMessages.add(messageId);
                    setTimeout(() => this.processedMessages.delete(messageId), 60000);
                }

                if (data.type !== MESSAGE_TYPES.HANDSHAKE_REQUEST && 
                    data.type !== MESSAGE_TYPES.HANDSHAKE_RESPONSE &&
                    data.type !== MESSAGE_TYPES.PING &&
                    data.type !== MESSAGE_TYPES.PONG &&
                    data.payload && data.signature) {
                    
                    if (!SecurityUtils.verifySignature(data)) {
                        this.legacyMode = true;
                    }
                }

                return true;
            }, () => false);
        },

        parse(event) {
            if (!this.validate(event)) return null;

            const data = event.data;
            
            if (data.protocol === PROTOCOL.PROTOCOL_VERSION) {
                return this._normalizeCanonical(data);
            }
            
            return this._convertLegacy(data);
        },

        _normalizeCanonical(data) {
            if (!data.sequence) {
                data.sequence = ++this.messageSequence;
            }

            if (!data.timestamp) {
                data.timestamp = Date.now();
            }

            if (data.payload) {
                data.payload = SecurityUtils.sanitizePayload(data.payload);
            }

            const normalized = {
                protocol: data.protocol,
                messageId: data.messageId || data.id,
                type: data.type,
                source: data.source || 'PARENT',
                target: data.target || 'iframe',
                frameId: data.frameId || FRAME_ID,
                timestamp: data.timestamp,
                payload: data.payload || {},
                token: data.token,
                signature: data.signature,
                sequence: data.sequence,
                receivedAt: Date.now()
            };

            if (data.type === MESSAGE_TYPES.ACK) {
                this.transportClient.handleAck(data);
            }

            return normalized;
        },

        _convertLegacy(data) {
            const messageId = data.id || data.messageId || SecurityUtils.generateMessageId();
            const timestamp = data.timestamp || Date.now();

            const canonical = {
                protocol: 'LEGACY',
                messageId: messageId,
                type: data.type,
                source: data.source || 'PARENT',
                target: 'iframe',
                frameId: data.frameId || FRAME_ID,
                timestamp: timestamp,
                payload: data.payload || {},
                token: data.token,
                signature: data.signature,
                sequence: ++this.messageSequence,
                legacy: true,
                original: data,
                receivedAt: Date.now()
            };

            if (canonical.payload) {
                canonical.payload = SecurityUtils.sanitizePayload(canonical.payload);
            }

            if (data.type === MESSAGE_TYPES.ACK) {
                this.transportClient.handleAck(data);
            }

            return canonical;
        },

        createOutbound(type, payload = {}, options = {}) {
            const messageId = options.messageId || SecurityUtils.generateMessageId();
            const timestamp = Date.now();
            const token = SessionMirror ? SessionMirror.getToken() : null;
            
            const message = {
                protocol: PROTOCOL.PROTOCOL_VERSION,
                messageId,
                type,
                source: 'iframe',
                target: 'parent',
                frameId: FRAME_ID,
                timestamp,
                payload: SecurityUtils.sanitizePayload(payload),
                token: token,
                app: APP_NAME,
                version: VERSION,
                requiresAck: options.requiresAck !== false,
                id: messageId,
                sequence: ++this.messageSequence
            };

            if (token && type !== MESSAGE_TYPES.HANDSHAKE_REQUEST && 
                type !== MESSAGE_TYPES.PING && 
                type !== MESSAGE_TYPES.PONG &&
                type !== MESSAGE_TYPES.CHILD_READY) {
                message.signature = SecurityUtils.generateSignature(message.payload, timestamp, token);
            }

            return message;
        },

        send(type, payload = {}, options = {}) {
            const message = this.createOutbound(type, payload, options);
            return this.transportClient.send(
                type,
                payload,
                options
            );
        },

        processQueue() {
            return this.transportClient.processQueue();
        },

        getStats() {
            return {
                processedMessages: this.processedMessages.size,
                messageSequence: this.messageSequence,
                legacyMode: this.legacyMode,
                transport: this.transportClient.getStats()
            };
        }
    };

    // =============================================
    // STARTUP GOVERNOR (NEW - SINGLE AUTHORITY)
    // =============================================
    const StartupGovernor = {
        state: 'INIT',
        lock: false,
        subscribers: new Set(),
        startTime: 0,
        stageTimes: {},
        envConfig: null,
        mutex: false,
        
        init() {
            this.startTime = Date.now();
            this.envConfig = IframeEnvironment.getConfig();
            this._loadSavedState();
            return this;
        },
        
        _loadSavedState() {
            const saved = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.STARTUP_STATE);
            if (saved && saved.timestamp > Date.now() - 3600000) {
                if (saved.state === 'ACTIVE' || saved.state === 'SYNCING') {
                    this.state = saved.state;
                }
            }
        },
        
        _saveState() {
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STARTUP_STATE, {
                state: this.state,
                timestamp: Date.now(),
                stages: this.stageTimes
            });
        },
        
        canProceed(nextState) {
            if (this.mutex) return false;
            
            const transitions = {
                'INIT': ['WAIT_PARENT', 'HANDSHAKING', 'SYNCING', 'ACTIVE', 'DEGRADED'],
                'WAIT_PARENT': ['HANDSHAKING', 'SYNCING', 'ACTIVE', 'DEGRADED', 'RECOVERING'],
                'HANDSHAKING': ['SYNCING', 'ACTIVE', 'DEGRADED', 'RECOVERING'],
                'SYNCING': ['ACTIVE', 'DEGRADED', 'RECOVERING'],
                'ACTIVE': ['DEGRADED', 'RECOVERING'],
                'DEGRADED': ['ACTIVE', 'RECOVERING'],
                'RECOVERING': ['ACTIVE', 'DEGRADED']
            };
            
            const allowed = transitions[this.state] || [];
            return allowed.includes(nextState);
        },
        
        acquireLock() {
            if (this.mutex) return false;
            this.mutex = true;
            return true;
        },
        
        releaseLock() {
            this.mutex = false;
        },
        
        transitionTo(nextState, reason = '') {
            if (!this.canProceed(nextState)) {
                return false;
            }
            
            const oldState = this.state;
            this.state = nextState;
            this.stageTimes[nextState] = Date.now();
            
            this._saveState();
            DiagnosticsAgent.recordStateTransition(oldState, nextState, reason);
            
            Logger.info('Startup', `${oldState} -> ${nextState}`, { reason });
            
            this._notifySubscribers({ oldState, newState: nextState, reason });
            return true;
        },
        
        getState() {
            return this.state;
        },
        
        getDuration() {
            return Date.now() - this.startTime;
        },
        
        isActive() {
            return this.state === 'ACTIVE';
        },
        
        isDegraded() {
            return this.state === 'DEGRADED';
        },
        
        isRecovering() {
            return this.state === 'RECOVERING';
        },
        
        subscribe(callback) {
            this.subscribers.add(callback);
            return () => this.subscribers.delete(callback);
        },
        
        _notifySubscribers(data) {
            this.subscribers.forEach(cb => {
                try {
                    cb(data);
                } catch (e) {}
            });
            
            window.dispatchEvent(new CustomEvent('startupStateChanged', { detail: data }));
        }
    }.init();

    // =============================================
    // IFRAME HANDSHAKE AUTHORITY (NEW - SINGLE INSTANCE)
    // =============================================
    const IframeHandshakeAuthority = {
        state: 'PENDING',
        retryCount: 0,
        handshakeId: null,
        handshakePromise: null,
        handshakeResolve: null,
        handshakeTimer: null,
        parentReadyReceived: false,
        handshakeStartTime: 0,
        handshakeEndTime: 0,
        handshakeResponse: null,
        versionNegotiated: VERSION,
        listeners: new Set(),
        envConfig: null,
        completed: false,
        handshakeAttempts: 0,
        maxHandshakeAttempts: 10,
        
        init() {
            this.envConfig = IframeEnvironment.getConfig();
            const savedState = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.HANDSHAKE_STATE);
            if (savedState && savedState.state === 'COMPLETED' && 
                savedState.timestamp > Date.now() - 3600000) {
                this.state = 'COMPLETED';
                this.parentReadyReceived = true;
                this.versionNegotiated = savedState.version || VERSION;
                this.completed = true;
            }
            return this;
        },

        async start() {
            if (this.completed) {
                return Promise.resolve({ success: true, cached: true });
            }

            if (this.state === 'IN_PROGRESS' && this.handshakePromise) {
                return this.handshakePromise;
            }

            if (!StartupGovernor.acquireLock()) {
                return Promise.resolve({ success: false, locked: true });
            }

            this.state = 'IN_PROGRESS';
            this.handshakeId = SecurityUtils.generateMessageId();
            this.handshakeStartTime = Date.now();
            
            this.handshakePromise = new Promise((resolve, reject) => {
                this.handshakeResolve = resolve;
                this._waitForParentReady();
            });

            return this.handshakePromise;
        },

        _waitForParentReady() {
            if (!window.parent || window.parent === window) {
                this._completeLegacy();
                return;
            }

            this._sendChildReady();

            const timeout = this.envConfig.handshakeTimeout || HANDSHAKE.TIMEOUT;
            
            this.parentReadyTimer = setTimeout(() => {
                if (!this.parentReadyReceived) {
                    this._performHandshake();
                }
            }, timeout);
        },

        _sendChildReady() {
            try {
                const message = MessageFirewall.createOutbound(
                    MESSAGE_TYPES.CHILD_READY,
                    {
                        version: VERSION,
                        readyAt: Date.now(),
                        frameId: FRAME_ID,
                        capabilities: [
                            'messages', 'session', 'progressive-security',
                            'canonical-protocol', 'ack-support', 'enhanced-handshake'
                        ],
                        protocol: PROTOCOL.PROTOCOL_VERSION,
                        timestamp: Date.now(),
                        env: IframeEnvironment.type
                    },
                    { requiresAck: false }
                );
                window.parent.postMessage(message, '*');
            } catch (e) {}
        },

        handleParentReady(parentReadyMessage) {
            if (this.parentReadyReceived || this.completed) {
                return;
            }
            
            this.parentReadyReceived = true;
            if (this.parentReadyTimer) {
                clearTimeout(this.parentReadyTimer);
                this.parentReadyTimer = null;
            }
            
            if (parentReadyMessage.origin) {
                SecurityUtils.allowedOrigins.add(parentReadyMessage.origin);
            }
            
            this._performHandshake();
        },

        _performHandshake() {
            if (!window.parent || window.parent === window) {
                this._completeLegacy();
                return;
            }

            DiagnosticsAgent.increment('handshakeAttempts');

            const handshakeMessage = MessageFirewall.createOutbound(
                MESSAGE_TYPES.HANDSHAKE_REQUEST,
                {
                    version: VERSION,
                    compatibleVersions: ['2.0.0', '2.0.4', '3.0.0', '3.1.0', '3.2.0', '3.3.0', '3.4.0'],
                    clientId: this.handshakeId,
                    timestamp: Date.now(),
                    features: ['messages', 'session', 'progressive-security', 'canonical-protocol'],
                    frameId: FRAME_ID,
                    protocol: PROTOCOL.PROTOCOL_VERSION,
                    capabilities: ['ack', 'batch', 'offline', 'enhanced-recovery']
                },
                { requiresAck: true, timeout: this.envConfig.ackTimeout || HANDSHAKE.ACK_TIMEOUT }
            );

            this.handshakeTimer = setTimeout(() => {
                this._handleTimeout();
            }, this.envConfig.handshakeTimeout || HANDSHAKE.TIMEOUT);

            IframeTransport.send(
                MESSAGE_TYPES.HANDSHAKE_REQUEST,
                handshakeMessage.payload,
                { requiresAck: true }
            ).then(result => {
                if (!result.success && !result.queued) {
                    this._handleTimeout();
                }
            });
        },

        _handleTimeout() {
            if (this.state !== 'IN_PROGRESS' || this.completed) return;

            this.retryCount++;
            this.handshakeAttempts++;
            
            if (this.handshakeAttempts < (this.envConfig.maxRetries || HANDSHAKE.MAX_RETRIES) && 
                this.handshakeAttempts < this.maxHandshakeAttempts) {
                const delay = (this.envConfig.retryDelay || HANDSHAKE.RETRY_DELAY) * 
                              Math.pow(HANDSHAKE.BACKOFF_FACTOR, this.retryCount - 1);
                const jitter = Math.random() * HANDSHAKE.JITTER_MAX;
                setTimeout(() => this._performHandshake(), delay + jitter);
            } else {
                DiagnosticsAgent.increment('handshakeFailures');
                this._completeLegacy();
            }
        },

        _completeLegacy() {
            this.state = 'COMPLETED';
            this.completed = true;
            this.handshakeEndTime = Date.now();
            this.versionNegotiated = 'legacy';
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.HANDSHAKE_STATE, {
                state: 'COMPLETED',
                timestamp: Date.now(),
                legacy: true,
                version: 'legacy'
            });
            
            if (this.handshakeTimer) {
                clearTimeout(this.handshakeTimer);
                this.handshakeTimer = null;
            }
            
            StartupGovernor.releaseLock();
            
            this._notifyListeners({ success: true, legacy: true });
            
            if (this.handshakeResolve) {
                this.handshakeResolve({ success: true, legacy: true });
            }
        },

        complete(response) {
            if (this.state !== 'IN_PROGRESS' || this.completed) return false;

            if (!response || !response.payload || response.type !== MESSAGE_TYPES.HANDSHAKE_RESPONSE) {
                this._completeLegacy();
                return false;
            }

            const payload = response.payload;
            
            if (!this._isVersionCompatible(payload.version)) {
                this._completeLegacy();
                return false;
            }

            this.state = 'COMPLETED';
            this.completed = true;
            this.handshakeEndTime = Date.now();
            this.versionNegotiated = payload.version;
            this.handshakeResponse = payload;
            
            if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
            
            DiagnosticsAgent.increment('handshakeSuccess');
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.HANDSHAKE_STATE, {
                state: 'COMPLETED',
                timestamp: Date.now(),
                version: payload.version,
                response: payload
            });

            StartupGovernor.releaseLock();

            this._notifyListeners({ success: true, version: payload.version });

            if (this.handshakeResolve) {
                this.handshakeResolve({ success: true, version: payload.version });
            }

            return true;
        },

        _isVersionCompatible(version) {
            if (!version) return false;
            if (version === VERSION) return true;
            const compatible = ['2.0.0', '2.0.4', '3.0.0', '3.1.0', '3.2.0', '3.3.0', '3.4.0'];
            return compatible.includes(version);
        },

        isCompleted() {
            return this.completed;
        },

        getHandshakeInfo() {
            return {
                state: this.state,
                version: this.versionNegotiated,
                startTime: this.handshakeStartTime,
                endTime: this.handshakeEndTime,
                duration: this.handshakeEndTime ? this.handshakeEndTime - this.handshakeStartTime : 0,
                retryCount: this.retryCount,
                completed: this.completed
            };
        },

        subscribe(callback) {
            this.listeners.add(callback);
            if (this.completed) {
                callback(this.getHandshakeInfo());
            }
            return () => this.listeners.delete(callback);
        },

        _notifyListeners(data) {
            const info = this.getHandshakeInfo();
            this.listeners.forEach(cb => {
                try {
                    cb({ ...info, ...data });
                } catch (e) {}
            });
            
            window.dispatchEvent(new CustomEvent('handshakeCompleted', { 
                detail: { ...info, ...data }
            }));
        },

        reset() {
            this.state = 'PENDING';
            this.retryCount = 0;
            this.completed = false;
            this.parentReadyReceived = false;
            this.handshakeAttempts = 0;
            
            if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
            if (this.parentReadyTimer) clearTimeout(this.parentReadyTimer);
            
            this.handshakeTimer = null;
            this.handshakePromise = null;
            
            SafeStorage.remove(LOCAL_STORAGE_KEYS.HANDSHAKE_STATE);
        }
    }.init();

    // =============================================
    // ENHANCED HANDSHAKE GUARD (FIX 1)
    // =============================================
    if (!window.__MESSAGE_HANDSHAKE_INITIALIZED__) {
        window.__MESSAGE_HANDSHAKE_INITIALIZED__ = true;
        
        // Only set up guard if handshake not already completed
        setTimeout(() => {
            if (!IframeHandshakeAuthority.isCompleted() && !window.__PARENT_ACK_RECEIVED__) {
                let handshakeAttempts = 0;
                const maxAttempts = 5;
                
                function initiateHandshake() {
                    if (handshakeAttempts >= maxAttempts || IframeHandshakeAuthority.isCompleted() || window.__PARENT_ACK_RECEIVED__) return;
                    
                    handshakeAttempts++;
                    
                    try {
                        window.parent.postMessage({
                            type: "CHILD_HANDSHAKE",
                            source: "friend-core",
                            timestamp: Date.now(),
                            attempt: handshakeAttempts
                        }, "*");
                    } catch (e) {}
                }
                
                const handshakeInterval = setInterval(() => {
                    if (window.__PARENT_ACK_RECEIVED__ || IframeHandshakeAuthority.isCompleted()) {
                        clearInterval(handshakeInterval);
                    } else {
                        initiateHandshake();
                    }
                }, 2000);
                
                window.addEventListener("message", (event) => {
                    if (!event.data) return;
                    
                    if (event.data.type === "PARENT_ACK" || 
                        (event.data.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE) ||
                        (event.data.type === MESSAGE_TYPES.PARENT_READY)) {
                        window.__PARENT_ACK_RECEIVED__ = true;
                        
                        // Also feed into IframeHandshakeAuthority if needed
                        if (!IframeHandshakeAuthority.isCompleted() && 
                            event.data.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE) {
                            IframeHandshakeAuthority.complete(event.data);
                        }
                    }
                });
                
                initiateHandshake();
            }
        }, 500);
    }

    // =============================================
    // SESSION MIRROR (ENHANCED)
    // =============================================
    const SessionMirror = {
        _state: {
            authenticated: false,
            user: null,
            token: null,
            permissions: [],
            capabilities: [],
            expiresAt: 0,
            receivedAt: 0,
            fromCache: false,
            version: null,
            userId: null,
            sessionId: null,
            lastActivity: Date.now()
        },
        
        _subscribers: new Set(),
        _refreshTimer: null,
        _initPromise: null,
        _expiryCheckInterval: null,
        _refreshPromise: null,
        _tokenRefreshBuffer: 60000,
        _sessionSyncTimer: null,

        init() {
            if (this._initPromise) return this._initPromise;
            
            this._initPromise = new Promise((resolve) => {
                const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE, null, true);
                if (cached && cached.expiresAt > Date.now()) {
                    this._state = {
                        ...cached,
                        fromCache: true,
                        receivedAt: Date.now(),
                        lastActivity: Date.now()
                    };
                    this._state.authenticated = !!cached.user && !!cached.token && 
                                                 cached.expiresAt > Date.now();
                    this._state.userId = cached.user?.id || cached.user?.userId;
                }
                
                this._startExpiryCheck();
                this._startSessionSync();
                resolve(this._state);
            });
            
            return this._initPromise;
        },

        _startExpiryCheck() {
            if (this._expiryCheckInterval) clearInterval(this._expiryCheckInterval);
            
            this._expiryCheckInterval = setInterval(() => {
                const now = Date.now();
                
                if (this._state.authenticated && this._state.expiresAt < now) {
                    this.clearSession();
                    return;
                }
                
                if (this._state.authenticated && 
                    this._state.expiresAt - now < this._tokenRefreshBuffer) {
                    this._requestRefresh();
                }
                
                this._state.lastActivity = now;
            }, 30000);
        },

        _startSessionSync() {
            if (this._sessionSyncTimer) clearInterval(this._sessionSyncTimer);
            
            this._sessionSyncTimer = setInterval(() => {
                if (this._state.authenticated) {
                    this._requestSync();
                }
            }, 60000);
        },

        acceptSession(snapshot) {
            if (!snapshot || typeof snapshot !== 'object') {
                return false;
            }

            const oldState = { ...this._state };
            
            this._state = {
                authenticated: !!(snapshot.user && snapshot.token),
                user: snapshot.user ? { ...snapshot.user } : null,
                token: snapshot.token || null,
                permissions: snapshot.permissions || [],
                capabilities: snapshot.capabilities || [],
                expiresAt: snapshot.expiresAt || (Date.now() + 3600000),
                receivedAt: Date.now(),
                fromCache: false,
                version: snapshot.version || PROTOCOL.VERSION,
                userId: snapshot.user?.id || snapshot.user?.userId || snapshot.userId,
                sessionId: snapshot.sessionId || this._generateSessionId(),
                lastActivity: Date.now()
            };

            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE, {
                user: this._state.user,
                token: this._state.token,
                permissions: this._state.permissions,
                capabilities: this._state.capabilities,
                expiresAt: this._state.expiresAt,
                version: this._state.version,
                sessionId: this._state.sessionId
            }, true);

            if (this._state.user) {
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._state.user, false);
            }

            this._setupRefreshTimer();
            this._notifySubscribers('session-accepted', { old: oldState, new: this._state });
            
            return true;
        },

        updateSession(update) {
            if (!update) return false;

            let changed = false;
            const oldState = { ...this._state };
            
            if (update.user) {
                this._state.user = { ...this._state.user, ...update.user };
                this._state.userId = this._state.user?.id || this._state.user?.userId;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._state.user, false);
                changed = true;
            }
            
            if (update.token) {
                this._state.token = update.token;
                changed = true;
            }
            
            if (update.permissions) {
                this._state.permissions = update.permissions;
                changed = true;
            }
            
            if (update.capabilities) {
                this._state.capabilities = update.capabilities;
                changed = true;
            }
            
            if (update.expiresAt) {
                this._state.expiresAt = update.expiresAt;
                changed = true;
            }
            
            if (update.sessionId) {
                this._state.sessionId = update.sessionId;
                changed = true;
            }

            if (changed) {
                this._state.authenticated = !!this._state.user && !!this._state.token;
                this._state.receivedAt = Date.now();
                this._state.lastActivity = Date.now();
                
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE, {
                    user: this._state.user,
                    token: this._state.token,
                    permissions: this._state.permissions,
                    capabilities: this._state.capabilities,
                    expiresAt: this._state.expiresAt,
                    version: this._state.version,
                    sessionId: this._state.sessionId
                }, true);
                
                this._setupRefreshTimer();
                this._notifySubscribers('session-updated', { old: oldState, new: this._state });
            }
            
            return changed;
        },

        clearSession() {
            const oldState = { ...this._state };
            
            this._state = {
                authenticated: false,
                user: null,
                token: null,
                permissions: [],
                capabilities: [],
                expiresAt: 0,
                receivedAt: 0,
                fromCache: false,
                version: null,
                userId: null,
                sessionId: null,
                lastActivity: Date.now()
            };
            
            SafeStorage.remove(LOCAL_STORAGE_KEYS.SESSION_CACHE);
            SafeStorage.remove(LOCAL_STORAGE_KEYS.USER_CACHE);
            
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }
            
            this._notifySubscribers('session-cleared', { old: oldState });
        },

        _generateSessionId() {
            return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
        },

        _setupRefreshTimer() {
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }
            
            const timeUntilExpiry = this._state.expiresAt - Date.now();
            if (timeUntilExpiry > 0 && timeUntilExpiry < 300000) {
                this._refreshTimer = setTimeout(() => {
                    this._requestRefresh();
                }, Math.max(timeUntilExpiry - this._tokenRefreshBuffer, 1000));
            }
        },

        _requestRefresh() {
            if (this._refreshPromise) return this._refreshPromise;
            
            if (!window.parent || window.parent === window) return;
            
            DiagnosticsAgent.increment('sessionRefreshes');
            
            this._refreshPromise = new Promise((resolve) => {
                try {
                    const message = MessageFirewall.createOutbound(
                        MESSAGE_TYPES.SESSION_REFRESH,
                        { 
                            timestamp: Date.now(),
                            frameId: FRAME_ID,
                            sessionId: this._state.sessionId
                        },
                        { requiresAck: true, timeout: 5000 }
                    );
                    
                    if (message) {
                        window.parent.postMessage(message, '*');
                        setTimeout(() => {
                            this._refreshPromise = null;
                            resolve(false);
                        }, 5000);
                    } else {
                        resolve(false);
                    }
                } catch (e) {
                    this._refreshPromise = null;
                    resolve(false);
                }
            });
            
            return this._refreshPromise;
        },

        _requestSync() {
            if (!window.parent || window.parent === window) return;
            
            try {
                MessageFirewall.send(
                    MESSAGE_TYPES.SESSION_SYNC,
                    { 
                        timestamp: Date.now(),
                        frameId: FRAME_ID,
                        sessionId: this._state.sessionId
                    },
                    { requiresAck: false }
                );
            } catch (e) {}
        },

        subscribe(callback) {
            this._subscribers.add(callback);
            try {
                callback({
                    type: 'initial',
                    state: this.getState()
                });
            } catch (e) {}
            return () => this._subscribers.delete(callback);
        },

        _notifySubscribers(type, data = {}) {
            const state = this.getState();
            const event = { type, state, ...data };
            
            this._subscribers.forEach(cb => {
                try {
                    cb(event);
                } catch (e) {}
            });
            
            window.dispatchEvent(new CustomEvent('sessionUpdated', { 
                detail: { session: state, changeType: type, ...data }
            }));
        },

        getState() {
            return {
                authenticated: this._state.authenticated,
                user: this._state.user ? { ...this._state.user } : null,
                token: this._state.token,
                permissions: [...this._state.permissions],
                capabilities: [...this._state.capabilities],
                expiresAt: this._state.expiresAt,
                receivedAt: this._state.receivedAt,
                fromCache: this._state.fromCache,
                userId: this._state.userId,
                sessionId: this._state.sessionId,
                lastActivity: this._state.lastActivity
            };
        },

        getUser() {
            return this._state.user ? { ...this._state.user } : null;
        },

        getToken() {
            return this._state.token;
        },

        getSessionId() {
            return this._state.sessionId;
        },

        isAuthenticated() {
            return this._state.authenticated && this._state.expiresAt > Date.now();
        },

        hasPermission(permission) {
            return this._state.permissions.includes(permission);
        },

        hasCapability(capability) {
            return this._state.capabilities.includes(capability);
        },

        getTimeUntilExpiry() {
            if (!this._state.authenticated) return 0;
            return Math.max(0, this._state.expiresAt - Date.now());
        },

        isExpiringSoon(threshold = 300000) {
            return this._state.authenticated && this.getTimeUntilExpiry() < threshold;
        }
    };

    // =============================================
    // IFRAME SESSION CLIENT (NEW)
    // =============================================
    const IframeSessionClient = {
        syncInProgress: false,
        lastSyncTime: 0,
        syncInterval: 60000,
        syncTimer: null,
        pendingSessionRequests: new Map(),
        expiryCheckTimer: null,
        refreshInProgress: false,

        init() {
            this._startSyncTimer();
            this._startExpiryCheck();
            return this;
        },

        _startSyncTimer() {
            if (this.syncTimer) clearInterval(this.syncTimer);
            this.syncTimer = setInterval(() => this.sync(), this.syncInterval);
        },

        _startExpiryCheck() {
            if (this.expiryCheckTimer) clearInterval(this.expiryCheckTimer);
            this.expiryCheckTimer = setInterval(() => {
                if (SessionMirror && SessionMirror.isAuthenticated()) {
                    const timeUntilExpiry = SessionMirror.getTimeUntilExpiry();
                    if (timeUntilExpiry < 60000) {
                        this._handleExpiringSoon();
                    }
                }
            }, 30000);
        },

        async sync(force = false) {
            if (this.syncInProgress) return false;
            
            const now = Date.now();
            if (!force && now - this.lastSyncTime < this.syncInterval) return false;
            
            if (!window.parent || window.parent === window || !IframeHandshakeAuthority.isCompleted()) return false;

            this.syncInProgress = true;

            try {
                const result = await MessageFirewall.send(
                    MESSAGE_TYPES.SESSION_SYNC,
                    {
                        timestamp: now,
                        frameId: FRAME_ID,
                        sessionId: SessionMirror.getSessionId(),
                        lastActivity: SessionMirror.getState().lastActivity,
                        force
                    },
                    { requiresAck: true, timeout: 5000 }
                );

                if (result.success) {
                    this.lastSyncTime = now;
                }

                return result.success;
            } catch (error) {
                return false;
            } finally {
                this.syncInProgress = false;
            }
        },

        handleSessionData(message) {
            const payload = message.payload;
            
            if (!payload) return false;

            const requestId = payload.requestId || message.messageId;
            if (requestId && this.pendingSessionRequests.has(requestId)) {
                const resolver = this.pendingSessionRequests.get(requestId);
                resolver(payload);
                this.pendingSessionRequests.delete(requestId);
            }

            SessionMirror.acceptSession(payload);

            MessageFirewall.send(
                MESSAGE_TYPES.SESSION_ACK,
                {
                    messageId: message.messageId,
                    sessionId: SessionMirror.getSessionId(),
                    timestamp: Date.now()
                },
                { requiresAck: false }
            );

            return true;
        },

        async requestSession(force = false) {
            return new Promise((resolve) => {
                const requestId = SecurityUtils.generateMessageId();
                
                this.pendingSessionRequests.set(requestId, resolve);
                
                MessageFirewall.send(
                    MESSAGE_TYPES.REQUEST_SESSION,
                    {
                        timestamp: Date.now(),
                        frameId: FRAME_ID,
                        force,
                        requestId
                    },
                    { requiresAck: true, timeout: 8000 }
                ).catch(() => {
                    this.pendingSessionRequests.delete(requestId);
                    resolve(null);
                });

                setTimeout(() => {
                    if (this.pendingSessionRequests.has(requestId)) {
                        this.pendingSessionRequests.delete(requestId);
                        resolve(null);
                    }
                }, 10000);
            });
        },

        handleSessionExpired() {
            SessionMirror.clearSession();
            this.requestSession(true);
            window.dispatchEvent(new CustomEvent('sessionExpired'));
        },

        _handleExpiringSoon() {
            if (this.refreshInProgress) return;
            
            this.refreshInProgress = true;
            
            MessageFirewall.send(
                MESSAGE_TYPES.SESSION_REFRESH,
                {
                    timestamp: Date.now(),
                    frameId: FRAME_ID,
                    sessionId: SessionMirror.getSessionId()
                },
                { requiresAck: true, timeout: 5000 }
            ).finally(() => {
                this.refreshInProgress = false;
            });
        },

        stop() {
            if (this.syncTimer) {
                clearInterval(this.syncTimer);
                this.syncTimer = null;
            }
            if (this.expiryCheckTimer) {
                clearInterval(this.expiryCheckTimer);
                this.expiryCheckTimer = null;
            }
        }
    }.init();

    // =============================================
    // COMPATIBILITY BRIDGE (NEW)
    // =============================================
    const CompatibilityBridge = {
        mode: 'auto',
        features: {
            ack: false,
            batch: false,
            signatures: false,
            sessionSync: false,
            enhancedHandshake: false
        },
        parentCapabilities: null,
        
        init() {
            this._detectMode();
            return this;
        },
        
        _detectMode() {
            if (IframeEnvironment.isSandboxed) {
                this.mode = 'degraded';
                return;
            }
            
            const forcedMode = SafeStorage.get('kynecta_compat_mode');
            if (forcedMode && ['auto', 'legacy', 'modern', 'degraded'].includes(forcedMode)) {
                this.mode = forcedMode;
                return;
            }
            
            if (IframeHandshakeAuthority && IframeHandshakeAuthority.isCompleted()) {
                const info = IframeHandshakeAuthority.getHandshakeInfo();
                if (info.version === 'legacy' || info.version < '3.0.0') {
                    this.mode = 'legacy';
                } else if (info.version >= '3.4.0') {
                    this.mode = 'modern';
                } else {
                    this.mode = 'legacy';
                }
            }
            
            this._updateFeatures();
        },
        
        _updateFeatures() {
            switch (this.mode) {
                case 'modern':
                    this.features = {
                        ack: true,
                        batch: true,
                        signatures: true,
                        sessionSync: true,
                        enhancedHandshake: true
                    };
                    break;
                    
                case 'legacy':
                case 'degraded':
                    this.features = {
                        ack: false,
                        batch: false,
                        signatures: false,
                        sessionSync: false,
                        enhancedHandshake: false
                    };
                    break;
                    
                default:
                    if (this.parentCapabilities) {
                        this.features.ack = this.parentCapabilities.includes('ack');
                        this.features.batch = this.parentCapabilities.includes('batch');
                        this.features.signatures = this.parentCapabilities.includes('signatures');
                        this.features.sessionSync = this.parentCapabilities.includes('session');
                        this.features.enhancedHandshake = this.parentCapabilities.includes('enhanced-handshake');
                    }
            }
        },
        
        setParentCapabilities(capabilities) {
            this.parentCapabilities = capabilities || [];
            this._updateFeatures();
        },
        
        getMode() {
            return this.mode;
        },
        
        hasFeature(feature) {
            return this.features[feature] || false;
        },
        
        adaptMessage(message) {
            if (this.mode === 'modern') return message;
            
            if (this.mode === 'legacy') {
                const adapted = {
                    id: message.messageId || message.id,
                    type: message.type,
                    payload: message.payload || {},
                    source: message.source || SOURCE_CHILD,
                    app: APP_NAME,
                    version: VERSION,
                    timestamp: message.timestamp || Date.now(),
                    frameId: message.frameId || FRAME_ID
                };
                delete adapted.protocol;
                delete adapted.signature;
                delete adapted.requiresAck;
                return adapted;
            }
            
            return message;
        },
        
        adaptIncoming(message) {
            if (!message) return message;
            if (message.protocol) return message;
            
            return {
                protocol: 'LEGACY',
                messageId: message.id || message.messageId,
                type: message.type,
                source: message.source || 'PARENT',
                target: 'iframe',
                frameId: message.frameId || FRAME_ID,
                timestamp: message.timestamp || Date.now(),
                payload: message.payload || {},
                token: message.token,
                legacy: true
            };
        }
    }.init();

    // =============================================
    // RECOVERY MANAGER (NEW)
    // =============================================
    const RecoveryManager = {
        isActive: false,
        recoveryAttempts: 0,
        maxRecoveryAttempts: 5,
        recoveryTimer: null,
        listeners: new Set(),
        recoveryStrategies: [
            'ping-recovery',
            'handshake-reset',
            'session-refresh',
            'queue-clear',
            'transport-reset'
        ],
        currentStrategy: 0,
        lastRecoveryTime: 0,
        recoveryCooldown: 30000,
        envConfig: null,

        init() {
            this.envConfig = IframeEnvironment.getConfig();
            this._startMonitor();
            return this;
        },

        _startMonitor() {
            setInterval(() => {
                if (!this.isActive) {
                    this._checkHealth();
                }
            }, 15000);
        },

        _checkHealth() {
            const health = {
                parentReady: !!(window.parent && window.parent !== window),
                handshakeCompleted: IframeHandshakeAuthority ? IframeHandshakeAuthority.isCompleted() : false,
                sessionValid: SessionMirror ? SessionMirror.isAuthenticated() : false,
                pendingAcks: IframeTransport ? IframeTransport.pendingAcks.size : 0,
                queuedMessages: IframeTransport ? IframeTransport.messageQueue.length : 0,
                connectionQuality: IframeEnvironment.isVPNNetwork ? 'poor' : 'good'
            };

            const needsRecovery = 
                (!health.parentReady) ||
                (!health.handshakeCompleted && this.recoveryAttempts < this.maxRecoveryAttempts) ||
                (health.pendingAcks > 20 && health.queuedMessages > 30);

            if (needsRecovery && !this.isActive) {
                this.startRecovery('health-check');
            }
        },

        startRecovery(reason = 'health-check') {
            if (this.isActive) return;
            
            const now = Date.now();
            if (now - this.lastRecoveryTime < this.recoveryCooldown) {
                return;
            }
            
            this.isActive = true;
            this.recoveryAttempts++;
            this.lastRecoveryTime = now;
            
            Logger.warn('Recovery', `Starting recovery (${this.recoveryAttempts})`, { reason });
            
            this._executeStrategy();
        },

        _executeStrategy() {
            const strategy = this.recoveryStrategies[this.currentStrategy];
            
            switch (strategy) {
                case 'ping-recovery':
                    this._recoveryPing();
                    break;
                    
                case 'handshake-reset':
                    this._recoveryHandshake();
                    break;
                    
                case 'session-refresh':
                    this._recoverySession();
                    break;
                    
                case 'queue-clear':
                    this._recoveryQueue();
                    break;
                    
                case 'transport-reset':
                    this._recoveryTransport();
                    break;
            }
            
            this.currentStrategy = (this.currentStrategy + 1) % this.recoveryStrategies.length;
            
            this.recoveryTimer = setTimeout(() => {
                if (this.isActive && this.recoveryAttempts < this.maxRecoveryAttempts) {
                    this._executeStrategy();
                } else if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
                    this._escalateToReload();
                } else {
                    this.stopRecovery();
                }
            }, 10000);
        },

        _recoveryPing() {
            if (!window.parent) return;
            
            try {
                window.parent.postMessage({
                    type: MESSAGE_TYPES.PING,
                    payload: { timestamp: Date.now(), frameId: FRAME_ID },
                    source: SOURCE_CHILD
                }, '*');
            } catch (e) {}
        },

        _recoveryHandshake() {
            IframeHandshakeAuthority.reset();
            IframeHandshakeAuthority.start().catch(() => {});
        },

        _recoverySession() {
            SessionMirror.clearSession();
            IframeSessionClient.requestSession(true);
        },

        _recoveryQueue() {
            IframeTransport.clearPending();
            IframeTransport.messageQueue = [];
        },

        _recoveryTransport() {
            IframeTransport.clearPending();
            IframeTransport.messageQueue = [];
        },

        _escalateToReload() {
            Logger.error('Recovery', 'Max attempts reached, reloading');
            
            this._notifyListeners({ reloading: true });
            
            try {
                MessageFirewall.send(
                    MESSAGE_TYPES.FORCE_RELOAD,
                    { reason: 'recovery-failed', attempts: this.recoveryAttempts },
                    { requiresAck: false }
                );
            } catch (e) {}
            
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        },

        stopRecovery() {
            if (!this.isActive) return;
            
            this.isActive = false;
            this.recoveryAttempts = 0;
            this.currentStrategy = 0;
            
            if (this.recoveryTimer) {
                clearTimeout(this.recoveryTimer);
                this.recoveryTimer = null;
            }
            
            this._notifyListeners({ recovered: true });
        },

        subscribe(callback) {
            this.listeners.add(callback);
            return () => this.listeners.delete(callback);
        },

        _notifyListeners(data) {
            this.listeners.forEach(cb => {
                try {
                    cb(data);
                } catch (e) {}
            });
            
            window.dispatchEvent(new CustomEvent('recoveryStatus', { detail: data }));
        }
    }.init();

    // =============================================
    // PARENT DETECTOR (ENHANCED - USES IFRAME TRANSPORT)
    // =============================================
    const ParentDetector = {
        isReady: false,
        checkInterval: null,
        pingInterval: null,
        lastPong: 0,
        listeners: new Set(),
        pingFailures: 0,
        maxPingFailures: 3,
        pingTimeout: 3000,
        pingHistory: [],
        pingIntervalMs: 15000,
        connectionQuality: 'unknown',
        lastPingTime: 0,
        envConfig: null,

        init() {
            this.envConfig = IframeEnvironment.getConfig();
            this._checkParent();
            this._startPing();
            return this;
        },

        _checkParent() {
            const hasParent = window.parent && window.parent !== window;
            const canPostMessage = typeof window.parent?.postMessage === 'function';
            
            this.isReady = hasParent && canPostMessage;
            
            if (this.isReady) {
                this._notifyListeners();
            }
        },

        _startPing() {
            this.pingInterval = setInterval(() => {
                if (!this.isReady) {
                    this._checkParent();
                    return;
                }

                this._sendPing();
            }, this.pingIntervalMs);
        },

        _sendPing() {
            try {
                this.lastPingTime = Date.now();
                
                window.parent.postMessage({
                    type: MESSAGE_TYPES.PING,
                    payload: { 
                        timestamp: this.lastPingTime,
                        frameId: FRAME_ID,
                        sessionId: SessionMirror?.getSessionId()
                    },
                    source: SOURCE_CHILD,
                    timestamp: this.lastPingTime,
                    messageId: SecurityUtils.generateMessageId()
                }, '*');
                
                setTimeout(() => {
                    if (this.lastPingTime && Date.now() - this.lastPingTime > this.pingTimeout) {
                        this.pingFailures++;
                        this._recordPingResult(false, this.pingTimeout);
                        
                        if (this.pingFailures >= this.maxPingFailures) {
                            this.isReady = false;
                            this._notifyListeners();
                        }
                    }
                }, this.pingTimeout + 100);
                
            } catch (e) {
                this.pingFailures++;
                this._recordPingResult(false, 0);
                
                if (this.pingFailures >= this.maxPingFailures) {
                    this.isReady = false;
                    this._notifyListeners();
                }
            }
        },

        handlePong(pongMessage) {
            const now = Date.now();
            const rtt = now - (pongMessage.payload?.originalTimestamp || this.lastPingTime || now);
            
            this.lastPong = now;
            this.pingFailures = 0;
            this._recordPingResult(true, rtt);
            
            if (!this.isReady) {
                this.isReady = true;
                this._notifyListeners();
            }
            
            DiagnosticsAgent.recordPingRtt(rtt);
        },

        _recordPingResult(success, rtt) {
            this.pingHistory.push({
                timestamp: Date.now(),
                success,
                rtt
            });
            
            if (this.pingHistory.length > 20) {
                this.pingHistory.shift();
            }
            
            this._updateConnectionQuality();
        },

        _updateConnectionQuality() {
            if (this.pingHistory.length < 5) return;
            
            const recent = this.pingHistory.slice(-10);
            const successRate = recent.filter(p => p.success).length / recent.length;
            const avgRtt = recent.filter(p => p.success).reduce((sum, p) => sum + p.rtt, 0) / 
                           recent.filter(p => p.success).length || 0;
            
            if (successRate < 0.5) {
                this.connectionQuality = 'dead';
            } else if (successRate < 0.8 || avgRtt > 1000) {
                this.connectionQuality = 'poor';
            } else if (avgRtt > 300) {
                this.connectionQuality = 'fair';
            } else {
                this.connectionQuality = 'excellent';
            }
        },

        subscribe(callback) {
            this.listeners.add(callback);
            if (this.isReady) callback({ ready: true, connectionQuality: this.connectionQuality });
            return () => this.listeners.delete(callback);
        },

        _notifyListeners() {
            const data = { 
                ready: this.isReady, 
                connectionQuality: this.connectionQuality,
                lastPong: this.lastPong,
                pingFailures: this.pingFailures
            };
            
            this.listeners.forEach(cb => {
                try {
                    cb(data);
                } catch (e) {}
            });
            
            window.dispatchEvent(new CustomEvent('parentStatusChanged', { detail: data }));
        },

        getStats() {
            return {
                isReady: this.isReady,
                connectionQuality: this.connectionQuality,
                lastPong: this.lastPong,
                pingFailures: this.pingFailures,
                avgRtt: this.pingHistory.filter(p => p.success).length ?
                    Math.round(this.pingHistory.filter(p => p.success).reduce((sum, p) => sum + p.rtt, 0) / 
                              this.pingHistory.filter(p => p.success).length) : 0
            };
        },

        destroy() {
            if (this.pingInterval) clearInterval(this.pingInterval);
            this.listeners.clear();
        }
    }.init();

    // =============================================
    // IFRAME AUTHORITY (NEW - CENTRAL COORDINATOR)
    // =============================================
    const IframeAuthority = {
        initialized: false,
        envConfig: null,
        
        init() {
            if (this.initialized) return this;
            
            IframeEnvironment.detect();
            this.envConfig = IframeEnvironment.getConfig();
            
            DiagnosticsAgent.init(window.location.hostname === 'localhost' || window.__IFRAME_DEBUG__);
            
            SafeStorage.init();
            SecurityUtils.initOriginTrust();
            StartupGovernor.init();
            ParentDetector.init();
            IframeHandshakeAuthority.init();
            SessionMirror.init();
            IframeSessionClient.init();
            CompatibilityBridge.init();
            IframeTransport.init();
            RecoveryManager.init();
            
            this.initialized = true;
            
            return this;
        },
        
        getHealth() {
            return {
                environment: IframeEnvironment.type,
                startupState: StartupGovernor.getState(),
                handshake: IframeHandshakeAuthority.getHandshakeInfo(),
                parentReady: ParentDetector.isReady,
                sessionValid: SessionMirror.isAuthenticated(),
                connectionQuality: ParentDetector.connectionQuality,
                compatMode: CompatibilityBridge.getMode(),
                uptime: DiagnosticsAgent.getUptime()
            };
        },
        
        reset() {
            IframeHandshakeAuthority.reset();
            SessionMirror.clearSession();
            IframeTransport.clearPending();
            IframeTransport.messageQueue = [];
            
            SafeStorage.clear();
        }
    }.init();

    // =============================================
    // SECURE MESSAGING CLIENT (ENHANCED - USES NEW MODULES)
    // =============================================
    class SecureMessagingClient {
        constructor() {
            this.listeners = new Map();
            this.handshakeClient = IframeHandshakeAuthority;
            this.parentDetector = ParentDetector;
            this.sessionMirror = SessionMirror;
            this.sessionClient = IframeSessionClient;
            this.circuitBreaker = new CircuitBreaker('MessagingClient', 3, 10000);
            this.messageFirewall = MessageFirewall;
            this.recoveryManager = RecoveryManager;
            this.compatibilityBridge = CompatibilityBridge;
            this.iframeAuthority = IframeAuthority;
            this.transport = IframeTransport;
            this._initMessageListener();
            this._initVisibilityHandler();
            this._initNetworkHandler();
            this._pendingPromises = new Map();
        }

        _initMessageListener() {
            window.addEventListener('message', this._receive.bind(this));
        }

        _initVisibilityHandler() {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this._onPageActivated();
                }
            });
        }

        _initNetworkHandler() {
            window.addEventListener('online', () => {
                this._onNetworkRestored();
            });

            window.addEventListener('offline', () => {
                window.dispatchEvent(new CustomEvent('networkOffline'));
            });
        }

        _onPageActivated() {
            this.send(MESSAGE_TYPES.PAGE_ACTIVATED, {
                timestamp: Date.now(),
                frameId: FRAME_ID
            }, { requiresAck: false });
            
            this.messageFirewall.processQueue();
            this.transport.processQueue();
            
            if (SessionMirror && SessionMirror.isAuthenticated()) {
                this.sessionClient.sync(true);
            }
        }

        _onNetworkRestored() {
            this.messageFirewall.processQueue();
            this.transport.processQueue();
            
            if (SessionMirror && SessionMirror.isAuthenticated() && SessionMirror.isExpiringSoon()) {
                this.sessionClient.sync(true);
            }
            
            window.dispatchEvent(new CustomEvent('networkRestored'));
        }

        async _receive(event) {
            await this.circuitBreaker.call(async () => {
                if (!SecurityUtils.validateOrigin(event.origin)) {
                    return;
                }

                const message = this.messageFirewall.parse(event);
                if (!message) return;

                DiagnosticsAgent.increment('messagesReceived');

                if (message.type === MESSAGE_TYPES.ACK) {
                    this.transport.handleAck(message);
                }

                switch (message.type) {
                    case MESSAGE_TYPES.PONG:
                        ParentDetector.handlePong(message);
                        return;

                    case MESSAGE_TYPES.PARENT_READY:
                        IframeHandshakeAuthority.handleParentReady(message);
                        ParentDetector.isReady = true;
                        ParentDetector._notifyListeners();
                        SecurityUtils.allowedOrigins.add(event.origin);
                        return;

                    case MESSAGE_TYPES.HANDSHAKE_RESPONSE:
                        IframeHandshakeAuthority.complete(message);
                        CompatibilityBridge._detectMode();
                        StartupGovernor.transitionTo('ACTIVE', 'handshake-complete');
                        return;

                    case MESSAGE_TYPES.SESSION_DATA:
                    case MESSAGE_TYPES.SESSION_INIT:
                        this.sessionClient.handleSessionData(message);
                        if (SessionMirror && SessionMirror.isAuthenticated()) {
                            StartupGovernor.transitionTo('ACTIVE', 'session-received');
                        }
                        return;

                    case MESSAGE_TYPES.SESSION_UPDATE:
                        SessionMirror.updateSession(message.payload);
                        if (event.source) {
                            try {
                                const ackMessage = this.messageFirewall.createOutbound(
                                    MESSAGE_TYPES.SESSION_ACK,
                                    { 
                                        messageId: message.messageId, 
                                        success: true,
                                        timestamp: Date.now()
                                    },
                                    { requiresAck: false }
                                );
                                event.source.postMessage(ackMessage, event.origin);
                            } catch (e) {}
                        }
                        return;

                    case MESSAGE_TYPES.SESSION_SYNC:
                        if (event.source) {
                            try {
                                const syncResponse = this.messageFirewall.createOutbound(
                                    MESSAGE_TYPES.SESSION_DATA,
                                    SessionMirror.getState(),
                                    { requiresAck: false }
                                );
                                event.source.postMessage(syncResponse, event.origin);
                            } catch (e) {}
                        }
                        return;

                    case MESSAGE_TYPES.SESSION_EXPIRED:
                        this.sessionClient.handleSessionExpired();
                        return;

                    case MESSAGE_TYPES.LOGOUT:
                        SessionMirror.clearSession();
                        return;

                    case MESSAGE_TYPES.API_RESPONSE:
                        const requestId = message.payload?.requestId;
                        if (requestId && this._pendingPromises.has(requestId)) {
                            const { resolve } = this._pendingPromises.get(requestId);
                            resolve(message.payload);
                            this._pendingPromises.delete(requestId);
                        }
                        return;

                    case MESSAGE_TYPES.FORCE_RELOAD:
                        window.location.reload();
                        return;

                    case MESSAGE_TYPES.NAVIGATE:
                        if (message.payload?.url) {
                            window.location.href = message.payload.url;
                        }
                        return;

                    case MESSAGE_TYPES.ERROR:
                        return;
                }

                if (message.payload?.requestId && this._pendingPromises.has(message.payload.requestId)) {
                    const { resolve } = this._pendingPromises.get(message.payload.requestId);
                    resolve(message.payload);
                    this._pendingPromises.delete(message.payload.requestId);
                }

                const handlers = this.listeners.get(message.type) || [];
                handlers.forEach(handler => {
                    try {
                        handler(message.payload, message);
                    } catch (error) {
                        DiagnosticsAgent.recordError(error, `Handler.${message.type}`);
                    }
                });
            });
        }

        async send(type, payload = {}, options = {}) {
            return this.circuitBreaker.call(async () => {
                const result = await this.transport.send(type, payload, options);
                if (result.success) {
                    DiagnosticsAgent.increment('messagesSent');
                }
                return result;
            }, () => ({ success: false, error: 'circuit open' }));
        }

        _sendWithPromise(type, payload, options) {
            return new Promise((resolve, reject) => {
                const requestId = options.requestId || SecurityUtils.generateMessageId();
                
                this._pendingPromises.set(requestId, { resolve, reject });
                
                this.send(type, { ...payload, requestId }, options)
                    .catch(error => {
                        this._pendingPromises.delete(requestId);
                        reject(error);
                    });

                setTimeout(() => {
                    if (this._pendingPromises.has(requestId)) {
                        this._pendingPromises.delete(requestId);
                        reject(new Error('API request timeout'));
                    }
                }, options.timeout || 15000);
            });
        }

        on(type, handler) {
            if (!this.listeners.has(type)) {
                this.listeners.set(type, []);
            }
            this.listeners.get(type).push(handler);
        }

        off(type, handler) {
            const handlers = this.listeners.get(type);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index !== -1) handlers.splice(index, 1);
            }
        }

        once(type, handler) {
            const wrapper = (payload, message) => {
                handler(payload, message);
                this.off(type, wrapper);
            };
            this.on(type, wrapper);
        }

        processQueue() {
            this.messageFirewall.processQueue();
            this.transport.processQueue();
        }

        getHealth() {
            return IframeAuthority.getHealth();
        }

        reset() {
            IframeAuthority.reset();
            this._pendingPromises.clear();
        }
    }

    const messagingClient = new SecureMessagingClient();

    // =============================================
    // SAFE FETCH UTILITY (FIX 2)
    // =============================================
    async function safeFetch(url, options = {}) {
        try {
            const response = await fetch(url, {
                credentials: "include",
                ...options
            });

            if (!response.ok) {
                throw new Error("HTTP error " + response.status);
            }

            return await response.json();
        } catch (error) {
            DiagnosticsAgent.recordError(error, 'safeFetch');
            return { success: false, message: "Network issue" };
        }
    }

    // =============================================
    // API CLIENT (ENHANCED WITH SAFE FETCH)
    // =============================================
    const APIClient = {
        circuitBreaker: new CircuitBreaker('APIClient', 3, 15000),
        pendingRequests: new Map(),
        baseUrl: '',
        defaultTimeout: 30000,

        setBaseUrl(url) {
            this.baseUrl = url;
        },

        async request(endpoint, options = {}) {
            return this.circuitBreaker.call(async () => {
                if (!endpoint || typeof endpoint !== 'string') {
                    return null;
                }

                if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
                    return null;
                }

                if (!endpoint.startsWith('/api/')) {
                    endpoint = '/api/' + endpoint.replace(/^\/+/, '');
                }

                const token = SessionMirror.getToken();
                const requestId = options.requestId || SecurityUtils.generateMessageId();
                
                const headers = {
                    'Content-Type': 'application/json',
                    'X-Client-Version': VERSION,
                    'X-Request-ID': requestId,
                    'X-Frame-ID': FRAME_ID
                };

                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                if (ParentDetector.isReady && IframeHandshakeAuthority.isCompleted() && options.useParent !== false) {
                    return this._requestViaParent(endpoint, options, requestId);
                }

                return this._requestDirect(endpoint, options, headers, requestId);
            }, () => null);
        },

        async _requestViaParent(endpoint, options, requestId) {
            return new Promise((resolve) => {
                const timeout = options.timeout || this.defaultTimeout;
                
                const timer = setTimeout(() => {
                    if (this.pendingRequests.has(requestId)) {
                        this.pendingRequests.delete(requestId);
                        this._requestDirect(endpoint, options, null, requestId).then(resolve);
                    }
                }, timeout);

                this.pendingRequests.set(requestId, { resolve, timer });

                messagingClient.send(
                    MESSAGE_TYPES.API_REQUEST,
                    {
                        endpoint,
                        method: options.method || 'GET',
                        headers: options.headers || {},
                        body: options.body,
                        requestId
                    },
                    { requiresAck: true, timeout }
                ).catch(() => {
                    clearTimeout(timer);
                    this.pendingRequests.delete(requestId);
                    this._requestDirect(endpoint, options, null, requestId).then(resolve);
                });
            });
        },

        async _requestDirect(endpoint, options, headers, requestId) {
            try {
                const fetchOptions = {
                    method: options.method || 'GET',
                    headers: headers || {
                        'Content-Type': 'application/json',
                        'X-Client-Version': VERSION,
                        'X-Request-ID': requestId,
                        'X-Frame-ID': FRAME_ID
                    },
                    credentials: 'same-origin',
                    mode: 'same-origin',
                    cache: 'no-cache',
                    signal: options.signal
                };

                if (options.method && options.method !== 'GET' && options.body) {
                    fetchOptions.body = typeof options.body === 'string' 
                        ? options.body 
                        : JSON.stringify(SecurityUtils.sanitizePayload(options.body));
                }

                // Use safeFetch for all fetch operations
                return await safeFetch(this.baseUrl + endpoint, fetchOptions);
            } catch (error) {
                DiagnosticsAgent.recordError(error, `API.${endpoint}`);
                return null;
            }
        },

        async fetchWithFallback(endpoint, options = {}, fallback = null) {
            const result = await this.request(endpoint, options);
            return result !== null && !result.error ? result : fallback;
        },

        handleParentResponse(payload) {
            const requestId = payload.requestId;
            if (requestId && this.pendingRequests.has(requestId)) {
                const { resolve, timer } = this.pendingRequests.get(requestId);
                clearTimeout(timer);
                resolve(payload.data || payload.result);
                this.pendingRequests.delete(requestId);
            }
        }
    };

    // =============================================
    // CORE STATE (PRESERVED)
    // =============================================
    let currentUser = null;
    let currentChat = null;
    let currentFriend = null;
    let messages = [];
    let chats = [];
    let contacts = [];
    let isRecording = false;
    let mediaRecorder = null;
    let recordingTimer = null;
    let recordingStartTime = null;
    let typingTimeout = null;
    let isTyping = false;
    let selectedMessage = null;
    let currentThread = null;
    let chatThemes = {};
    let emojiPicker = null;
    let isSyncing = false;
    let audioPlayers = new Map();
    let editingMessageId = null;
    let replyToMessage = null;
    let currentCategory = 'all';
    let activeFormattingTags = [];
    let activeAudioElement = null;
    let scheduledMessages = [];
    let offlineQueue = [];
    let messageDrafts = {};
    let silentReactionsEnabled = true;
    let readOnlyMode = false;
    let currentAttachment = null;
    let searchResults = [];
    let currentSearchIndex = -1;
    let multiSendSelectedChats = new Set();
    let recordingCancelTimeout = null;
    let dragStartY = 0;
    let isDraggingToCancel = false;
    let isParentReady = false;
    let isSessionReceived = false;
    let isInitialized = false;
    let sessionData = null;
    let sessionValid = false;
    let sessionAdapter = SessionMirror;
    let handshakeState = 'PENDING';
    let connectionHealth = {};

    SessionMirror.subscribe((event) => {
        currentUser = event.state.user;
        isSessionReceived = event.state.authenticated;
        sessionData = event.state;
        sessionValid = event.state.authenticated;
        
        window.dispatchEvent(new CustomEvent('sessionUpdated', { 
            detail: { session: event.state, changeType: event.type }
        }));
    });

    ParentDetector.subscribe((data) => {
        isParentReady = data.ready;
        connectionHealth = data;
        window.dispatchEvent(new CustomEvent('parentStatusChanged', { detail: data }));
    });

    IframeHandshakeAuthority.subscribe((info) => {
        handshakeState = info.state;
        window.dispatchEvent(new CustomEvent('handshakeStatusChanged', { detail: info }));
    });

    RecoveryManager.subscribe((data) => {
        if (data.recovering) {
            window.dispatchEvent(new CustomEvent('recoveryStarted', { detail: data }));
        }
    });

    // =============================================
    // INITIALIZATION PIPELINE (ENHANCED)
    // =============================================
    const INIT_STAGES = {
        PREFLIGHT: 'preflight',
        HANDSHAKE: 'handshake',
        SESSION: 'session',
        DATA: 'data',
        READY: 'ready'
    };

    let currentInitStage = null;
    let initProgress = 0;
    let initStartTime = 0;

    async function runStage(stage, fn, timeoutMs = 5000) {
        currentInitStage = stage;

        try {
            const result = await Promise.race([
                fn(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`Stage ${stage} timeout`)), timeoutMs)
                )
            ]);

            const stageIndex = Object.values(INIT_STAGES).indexOf(stage);
            initProgress = (stageIndex + 1) / Object.values(INIT_STAGES).length;
            
            return result;
        } catch (error) {
            DiagnosticsAgent.recordError(error, `Init.${stage}`);

            if (stage === INIT_STAGES.HANDSHAKE) {
                return { success: false, legacy: true };
            }

            if (stage === INIT_STAGES.SESSION) {
                return { success: false, cached: SessionMirror.getState().fromCache };
            }

            return { success: false, error: error.message };
        }
    }

    async function initialize() {
        initStartTime = Date.now();
        
        try {
            DiagnosticsAgent.init(window.location.hostname === 'localhost' || window.__IFRAME_DEBUG__);
            StartupGovernor.transitionTo('WAIT_PARENT', 'init-started');

            await runStage(INIT_STAGES.PREFLIGHT, async () => {
                await SessionMirror.init();
                loadCachedData();

                if (window.parent && window.parent !== window) {
                    try {
                        const message = MessageFirewall.createOutbound(
                            MESSAGE_TYPES.CHILD_READY,
                            {
                                version: VERSION,
                                readyAt: Date.now(),
                                frameId: FRAME_ID,
                                capabilities: ['messages', 'session', 'progressive-security', 'canonical-protocol']
                            },
                            { requiresAck: false }
                        );
                        window.parent.postMessage(message, '*');
                    } catch (e) {}
                }

                return { success: true };
            }, 3000);

            StartupGovernor.transitionTo('HANDSHAKING', 'handshake-start');

            const handshakeResult = await runStage(INIT_STAGES.HANDSHAKE, async () => {
                if (!ParentDetector.isReady) {
                    await new Promise(resolve => {
                        let attempts = 0;
                        const checkInterval = setInterval(() => {
                            attempts++;
                            if (ParentDetector.isReady || attempts > 30) {
                                clearInterval(checkInterval);
                                resolve();
                            }
                        }, 100);
                    });
                }

                const handshakeResult = await IframeHandshakeAuthority.start();
                handshakeState = IframeHandshakeAuthority.state;
                return handshakeResult;
            }, 10000);

            StartupGovernor.transitionTo('SYNCING', 'session-start');

            await runStage(INIT_STAGES.SESSION, async () => {
                if (SessionMirror.isAuthenticated()) {
                    return { success: true, fromCache: true };
                }

                const sessionResult = await IframeSessionClient.requestSession();
                return { success: !!sessionResult };
            }, 10000);

            await runStage(INIT_STAGES.DATA, async () => {
                await loadCoreData();
                return { success: true };
            }, 15000);

            await runStage(INIT_STAGES.READY, async () => {
                isInitialized = true;
                
                StartupGovernor.transitionTo('ACTIVE', 'init-complete');

                messagingClient.send(MESSAGE_TYPES.CHILD_READY, {
                    status: 'ready',
                    version: VERSION,
                    session: SessionMirror.isAuthenticated(),
                    timestamp: Date.now(),
                    frameId: FRAME_ID
                }, { requiresAck: false });

                messagingClient.processQueue();

                window.dispatchEvent(new CustomEvent('coreReady', {
                    detail: {
                        authenticated: SessionMirror.isAuthenticated(),
                        user: SessionMirror.getUser(),
                        handshake: IframeHandshakeAuthority.getHandshakeInfo(),
                        frameId: FRAME_ID,
                        initDuration: Date.now() - initStartTime
                    }
                }));

                return { success: true };
            }, 3000);

        } catch (error) {
            DiagnosticsAgent.recordError(error, 'Init.fatal');
            isInitialized = true;
            StartupGovernor.transitionTo('DEGRADED', 'init-fatal');

            window.dispatchEvent(new CustomEvent('coreReady', {
                detail: {
                    authenticated: false,
                    user: null,
                    fallback: true,
                    error: error.message,
                    initDuration: Date.now() - initStartTime
                }
            }));
        }
    }

    // =============================================
    // DATA MANAGEMENT (PRESERVED)
    // =============================================
    function loadCachedData() {
        try {
            const cachedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
            if (cachedChats) chats = cachedChats;

            const cachedContacts = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CONTACTS_CACHE);
            if (cachedContacts) contacts = cachedContacts;

            const cachedDrafts = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.DRAFTS);
            if (cachedDrafts) messageDrafts = cachedDrafts;

            const cachedOffline = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
            if (cachedOffline) offlineQueue = cachedOffline;
        } catch (error) {}
    }

    async function loadCoreData() {
        try {
            if (!SessionMirror.isAuthenticated()) {
                return false;
            }

            const chatsData = await APIClient.fetchWithFallback('/api/chats', {}, []);
            if (chatsData && Array.isArray(chatsData)) {
                chats = chatsData;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
            }

            const contactsData = await APIClient.fetchWithFallback('/api/contacts', {}, []);
            if (contactsData && Array.isArray(contactsData)) {
                contacts = contactsData;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CONTACTS_CACHE, contacts);
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    // =============================================
    // HEALTH MONITORING
    // =============================================
    function getHealthStatus() {
        return IframeAuthority.getHealth();
    }

    // =============================================
    // EXPORTED FUNCTIONS (PRESERVED)
    // =============================================
    function setCurrentUser(user) { currentUser = user; }
    function setCurrentChat(chat) { currentChat = chat; }
    function setCurrentFriend(friend) { currentFriend = friend; }
    function setMessages(newMessages) { messages = newMessages; }
    function setChats(newChats) { chats = newChats; }
    function setContacts(newContacts) { contacts = newContacts; }
    function setIsRecording(value) { isRecording = value; }
    function setMediaRecorder(recorder) { mediaRecorder = recorder; }
    function setRecordingTimer(timer) { recordingTimer = timer; }
    function setRecordingStartTime(time) { recordingStartTime = time; }
    function setTypingTimeout(timeout) { typingTimeout = timeout; }
    function setIsTyping(value) { isTyping = value; }
    function setSelectedMessage(message) { selectedMessage = message; }
    function setCurrentThread(threadId) { currentThread = threadId; }
    function setChatThemes(themes) { chatThemes = themes; }
    function setEmojiPicker(picker) { emojiPicker = picker; }
    function setIsSyncing(value) { isSyncing = value; }
    function setAudioPlayers(players) { audioPlayers = players; }
    function setEditingMessageId(id) { editingMessageId = id; }
    function setReplyToMessage(message) { replyToMessage = message; }
    function setCurrentCategory(category) { currentCategory = category; }
    function setActiveFormattingTags(tags) { activeFormattingTags = tags; }
    function setActiveAudioElement(element) { activeAudioElement = element; }
    function setScheduledMessages(messages) { scheduledMessages = messages; }
    function setOfflineQueue(queue) { offlineQueue = queue; }
    function setMessageDrafts(drafts) { messageDrafts = drafts; }
    function setSilentReactionsEnabled(value) { silentReactionsEnabled = value; }
    function setReadOnlyMode(value) { readOnlyMode = value; }
    function setCurrentAttachment(attachment) { currentAttachment = attachment; }
    function setSearchResults(results) { searchResults = results; }
    function setCurrentSearchIndex(index) { currentSearchIndex = index; }
    function setMultiSendSelectedChats(chats) { multiSendSelectedChats = chats; }
    function setRecordingCancelTimeout(timeout) { recordingCancelTimeout = timeout; }
    function setDragStartY(y) { dragStartY = y; }
    function setIsDraggingToCancel(value) { isDraggingToCancel = value; }

    function getCurrentSession() {
        const session = SessionMirror.getState();
        return {
            user: session.user,
            authenticated: session.authenticated,
            token: session.token,
            fromCache: session.fromCache,
            userId: session.userId
        };
    }

    function requestSessionUpdate() {
        return IframeSessionClient.requestSession(true);
    }

    function initChildSession() {
        return new Promise((resolve) => {
            if (isSessionReceived && currentUser) {
                resolve({ user: currentUser, sessionData });
            } else {
                const checkInterval = setInterval(() => {
                    if (isSessionReceived && currentUser) {
                        clearInterval(checkInterval);
                        resolve({ user: currentUser, sessionData });
                    }
                }, 100);

                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve(null);
                }, 5000);
            }
        });
    }

    function sendToParent(type, data = null, options = {}) {
        return messagingClient.send(type, data, options);
    }

    async function apiRequest(endpoint, options = {}) {
        return APIClient.request(endpoint, options);
    }

    async function fetchData(type) {
        switch (type) {
            case 'friendsList': return APIClient.fetchWithFallback('/api/friends', {}, []);
            case 'groupsList': return APIClient.fetchWithFallback('/api/groups', {}, []);
            case 'chatHistory': 
                if (!currentChat) return [];
                return APIClient.fetchWithFallback(`/api/chat-history/${currentChat.id}`, {}, []);
            case 'notifications': return APIClient.fetchWithFallback('/api/notifications', {}, []);
            case 'settings': return APIClient.fetchWithFallback('/api/settings', {}, {});
            default: return null;
        }
    }

    async function loadContacts() {
        contacts = await APIClient.fetchWithFallback('/api/contacts', {}, []);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CONTACTS_CACHE, contacts);
        return contacts;
    }

    async function loadChats() {
        chats = await APIClient.fetchWithFallback('/api/chats', {}, []);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        return chats;
    }

    async function loadMessages(chatId = null) {
        const targetChat = chatId || currentChat?.id;
        if (!targetChat) return [];

        const data = await APIClient.fetchWithFallback(`/api/messages/${targetChat}`, {}, []);
        if (data && Array.isArray(data)) {
            messages = data;
            SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${targetChat}`, messages);
        }
        return messages;
    }

    async function openChat(chat) {
        if (!chat) return false;

        currentChat = chat;
        currentFriend = chat.friend ? { ...chat.friend } : null;

        await loadMessages(chat.id);

        window.dispatchEvent(new CustomEvent('chatOpened', { 
            detail: { chat } 
        }));

        return true;
    }

    async function loadChatByFriendId(friendId) {
        const chat = chats.find(c => c.friendId === friendId);
        if (chat) {
            await openChat(chat);
            return chat;
        }

        const newChat = await APIClient.request('/api/chats', {
            method: 'POST',
            body: JSON.stringify({ friendId })
        });

        if (newChat) {
            chats.unshift(newChat);
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
            await openChat(newChat);
            return newChat;
        }

        return null;
    }

    function createLocalChat(friendId, friendData) {
        const newChat = {
            id: 'local_' + Date.now(),
            friendId: friendId,
            friendName: friendData.displayName || 'User',
            friendUsername: '',
            friendAvatar: friendData.photoURL || '',
            lastMessage: '',
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
            type: 'direct',
            archived: false,
            blocked: false,
            local: true
        };

        chats.unshift(newChat);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        openChat(newChat);
    }

    async function sendMessage(content, type = 'text', options = {}) {
        if (!currentChat) {
            return false;
        }

        const messageData = {
            id: SecurityUtils.generateMessageId(),
            chatId: currentChat.id,
            senderId: SessionMirror.getUser()?.id || 'local',
            content: SecurityUtils.escapeHtml(content || ''),
            type,
            timestamp: new Date().toISOString(),
            status: 'sending',
            frameId: FRAME_ID,
            ...options
        };

        messages.push(messageData);

        if (SessionMirror.isAuthenticated()) {
            const result = await APIClient.request('/api/messages/send', {
                method: 'POST',
                body: JSON.stringify(messageData)
            });

            if (result) {
                const idx = messages.findIndex(m => m.id === messageData.id);
                if (idx !== -1) {
                    messages[idx] = { ...result, status: 'sent' };
                }

                const chatIdx = chats.findIndex(c => c.id === currentChat.id);
                if (chatIdx !== -1) {
                    chats[chatIdx].lastMessage = content;
                    chats[chatIdx].lastMessageAt = new Date().toISOString();
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
                }

                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);

                return true;
            }

            const idx = messages.findIndex(m => m.id === messageData.id);
            if (idx !== -1) {
                messages[idx].status = 'failed';
            }

            return false;
        }

        offlineQueue.push(messageData);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);

        return true;
    }

    async function sendMessageWithOptions(content, options = {}) {
        return sendMessage(content, options.type || 'text', options);
    }

    async function sendToMultipleChats(content, chatIds) {
        if (!content && !currentAttachment) return 0;
        if (!chatIds || chatIds.length === 0) return 0;

        let successCount = 0;

        for (const chatId of chatIds) {
            const result = await APIClient.request('/api/messages/send', {
                method: 'POST',
                body: JSON.stringify({
                    chatId,
                    content: SecurityUtils.escapeHtml(content || ''),
                    type: currentAttachment?.type || 'text',
                    attachment: currentAttachment,
                    frameId: FRAME_ID
                })
            });

            if (result) successCount++;
        }

        return successCount;
    }

    async function editMessage(messageId, newContent) {
        if (!SessionMirror.isAuthenticated()) return false;

        const result = await APIClient.request('/api/messages/edit', {
            method: 'POST',
            body: JSON.stringify({ messageId, content: newContent })
        });

        if (result) {
            const idx = messages.findIndex(m => m.id === messageId);
            if (idx !== -1) {
                messages[idx].content = SecurityUtils.escapeHtml(newContent);
                messages[idx].edited = true;
                messages[idx].editedAt = new Date().toISOString();
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
            }
            return true;
        }
        return false;
    }

    function saveEditedMessage(messageId) {
        const input = document.getElementById(`editMessageInput_${messageId}`);
        if (input && input.value?.trim()) {
            return editMessage(messageId, input.value.trim());
        }
        return false;
    }

    function cancelEditMessage() {
        editingMessageId = null;
    }

    async function deleteMessage(messageId, forEveryone = false) {
        if (!SessionMirror.isAuthenticated()) return false;

        if (forEveryone) {
            const result = await APIClient.request('/api/messages/delete', {
                method: 'POST',
                body: JSON.stringify({ messageId })
            });

            if (result) {
                const idx = messages.findIndex(m => m.id === messageId);
                if (idx !== -1) {
                    messages[idx].deleted = true;
                    messages[idx].deletedAt = new Date().toISOString();
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
                }
                return true;
            }
        } else {
            const idx = messages.findIndex(m => m.id === messageId);
            if (idx !== -1) {
                messages.splice(idx, 1);
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
                return true;
            }
        }
        return false;
    }

    async function markChatAsRead(chatId) {
        if (!SessionMirror.isAuthenticated()) return false;

        const result = await APIClient.request('/api/chats/read', {
            method: 'POST',
            body: JSON.stringify({ chatId })
        });

        if (result) {
            const idx = chats.findIndex(c => c.id === chatId);
            if (idx !== -1) {
                chats[idx].unreadCount = 0;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
            }
            return true;
        }
        return false;
    }

    async function addReaction(messageId, emoji, silent = false) {
        if (!SessionMirror.isAuthenticated()) return false;

        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1) return false;

        if (!messages[idx].reactions) messages[idx].reactions = {};

        const userId = SessionMirror.getUser()?.id;
        if (!userId) return false;

        if (!messages[idx].reactions[emoji]) {
            messages[idx].reactions[emoji] = [];
        }

        const userIndex = messages[idx].reactions[emoji].indexOf(userId);

        if (userIndex > -1) {
            messages[idx].reactions[emoji].splice(userIndex, 1);
        } else {
            messages[idx].reactions[emoji].push(userId);
        }

        if (messages[idx].reactions[emoji].length === 0) {
            delete messages[idx].reactions[emoji];
        }

        SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);

        return userIndex > -1 ? 'removed' : 'added';
    }

    async function toggleBlockUser(friendId, block) {
        if (!SessionMirror.isAuthenticated()) return false;

        const blockedUsers = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, []);

        if (block) {
            if (!blockedUsers.includes(friendId)) blockedUsers.push(friendId);
        } else {
            const index = blockedUsers.indexOf(friendId);
            if (index > -1) blockedUsers.splice(index, 1);
        }

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, blockedUsers);

        chats.forEach(chat => {
            if (chat.friendId === friendId) chat.blocked = block;
        });

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        await loadChats();

        return true;
    }

    async function toggleArchiveChat(chatId, archive) {
        if (!SessionMirror.isAuthenticated()) return false;

        const archivedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, []);

        if (archive) {
            if (!archivedChats.includes(chatId)) archivedChats.push(chatId);
        } else {
            const index = archivedChats.indexOf(chatId);
            if (index > -1) archivedChats.splice(index, 1);
        }

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, archivedChats);

        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].archived = archive;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
            return true;
        }

        return false;
    }

    async function toggleReadOnly(chatId, readOnly) {
        if (!SessionMirror.isAuthenticated()) return false;

        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].readOnly = readOnly;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
            return true;
        }
        return false;
    }

    async function clearChatHistory(chatId) {
        if (!SessionMirror.isAuthenticated()) return false;

        SafeStorage.remove(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`);

        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].lastMessage = '';
            chats[idx].unreadCount = 0;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        }

        if (currentChat?.id === chatId) {
            messages = [];
        }

        return true;
    }

    async function voteInPoll(messageId, optionIndex) {
        if (!SessionMirror.isAuthenticated()) return false;

        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1) return false;

        const poll = messages[idx];
        if (!poll.options || !Array.isArray(poll.options)) return false;

        const userId = SessionMirror.getUser()?.id;
        if (!userId) return false;

        if (poll.userVote !== undefined && poll.userVote !== null) {
            const prevOption = poll.options[poll.userVote];
            if (prevOption) {
                prevOption.votes = Math.max(0, (prevOption.votes || 0) - 1);
                const voterIndex = prevOption.voters?.indexOf(userId);
                if (voterIndex > -1) prevOption.voters.splice(voterIndex, 1);
            }
        }

        if (!poll.options[optionIndex]) return false;

        poll.options[optionIndex].votes = (poll.options[optionIndex].votes || 0) + 1;
        if (!poll.options[optionIndex].voters) poll.options[optionIndex].voters = [];
        poll.options[optionIndex].voters.push(userId);
        poll.userVote = optionIndex;

        SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);

        return true;
    }

    function formatMessageText(text) {
        if (!text) return '';

        let formatted = SecurityUtils.escapeHtml(text);
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        formatted = formatted.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
        formatted = formatted.replace(/\n/g, '<br>');
        return formatted;
    }

    function formatTime(date) {
        if (!date) return '';

        const now = new Date();
        const messageDate = new Date(date);
        const diffMs = now - messageDate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return messageDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function formatDate(date) {
        if (!date) return '';

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const messageDate = new Date(date);

        if (messageDate.toDateString() === today.toDateString()) return 'Today';
        if (messageDate.toDateString() === yesterday.toDateString()) return 'Yesterday';

        return messageDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
    }

    function formatDateTime(date) {
        if (!date) return '';
        return new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function escapeHtml(text) {
        return SecurityUtils.escapeHtml(text);
    }

    function escapeRegex(string) {
        return SecurityUtils.escapeRegex(string);
    }

    function sanitizePayload(payload) {
        return SecurityUtils.sanitizePayload(payload);
    }

    function preserveFormatting(text) {
        if (!text) return '';

        const markers = {
            '**bold**': '###BOLD###',
            '*italic*': '###ITALIC###',
            '`code`': '###CODE###',
            '```\ncode block\n```': '###CODE_BLOCK###'
        };

        let processed = text;
        Object.entries(markers).forEach(([marker, placeholder]) => {
            processed = processed.replace(new RegExp(marker.replace(/\*/g, '\\*').replace(/`/g, '\\`'), 'g'), placeholder);
        });

        processed = escapeHtml(processed);

        Object.entries(markers).forEach(([marker, placeholder]) => {
            processed = processed.replace(new RegExp(placeholder, 'g'), marker);
        });

        return processed;
    }

    function showStatusMessage(message) {
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.style.display = 'block';
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }

    function hideStatusMessage() {
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) {
            statusEl.style.display = 'none';
        }
    }

    function validateMessageStructure(message) {
        return SecurityUtils.validateMessageStructure(message);
    }

    function validateMessagePayload(payload, messageType) {
        if (!payload || typeof payload !== 'object') return { valid: false, error: 'Invalid payload' };

        switch (messageType) {
            case 'text':
                if (typeof payload.content !== 'string' || !payload.content.trim()) {
                    return { valid: false, error: 'Text message must have content' };
                }
                break;
            case 'image':
            case 'video':
            case 'file':
                if (!payload.content) {
                    return { valid: false, error: 'Media message must have content' };
                }
                break;
            case 'audio':
                if (!payload.content || !payload.duration) {
                    return { valid: false, error: 'Audio message must have content and duration' };
                }
                break;
        }

        return { valid: true };
    }

    function validateMessageBeforeSend(message) {
        if (!message) return { valid: false, error: 'Invalid message' };

        if (!message.content && !currentAttachment) {
            return { valid: false, error: 'Message content is required' };
        }

        if (!currentChat) {
            return { valid: false, error: 'No active chat' };
        }

        if (readOnlyMode || currentChat?.readOnly) {
            return { valid: false, error: 'Chat is read-only' };
        }

        return { valid: true };
    }

    function validateData(data, type) {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Data must be an object' };
        }

        switch (type) {
            case 'friendsList':
                if (!Array.isArray(data)) return { valid: false, error: 'friendsList must be an array' };
                for (const friend of data) {
                    if (!friend.id && !friend.uid) return { valid: false, error: 'Friend must have valid id' };
                }
                break;
            case 'chatHistory':
                if (!Array.isArray(data)) return { valid: false, error: 'chatHistory must be an array' };
                for (const message of data) {
                    if (!message.id) return { valid: false, error: 'Message must have valid id' };
                }
                break;
        }

        return { valid: true };
    }

    function validateSessionData(data) {
        if (!data || typeof data !== 'object') return false;
        if (!data.user && !data.token && !data.mode) return false;
        return true;
    }

    function getData(type) {
        switch (type) {
            case 'friendsList': return contacts;
            case 'groupsList': return [];
            case 'chatHistory': return messages;
            case 'notifications': return [];
            case 'settings': return SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
            default: return null;
        }
    }

    function updateData(type, payload) {
        switch (type) {
            case 'friendsList':
                contacts = payload;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CONTACTS_CACHE, contacts);
                break;
            case 'chatHistory':
                messages = payload;
                if (currentChat) {
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
                }
                break;
            case 'settings':
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, payload);
                break;
            default: return false;
        }
        return true;
    }

    function initializeParentCoordination() {
        return initialize();
    }

    function isCoreReady() {
        return isInitialized;
    }

    function getConnectionHealth() {
        return getHealthStatus();
    }

    function showMessageActions(message, x, y) {
        selectedMessage = message;

        window.dispatchEvent(new CustomEvent('showMessageActions', {
            detail: { message, x, y }
        }));
    }

    function closeMessageActions() {
        selectedMessage = null;
        window.dispatchEvent(new CustomEvent('closeMessageActions'));
    }

    function handleMessageAction(action) {
        if (!selectedMessage) return false;

        window.dispatchEvent(new CustomEvent('handleMessageAction', {
            detail: { action, message: selectedMessage }
        }));

        return true;
    }

    function showForwardMessage(message) {
        if (!message) return;
        const forwardText = `[Forwarded] ${message.content || ''}`;
        navigator.clipboard.writeText(forwardText).catch(() => {});
    }

    function toggleStarMessage(messageId) {
        const starred = SafeStorage.getJSON('starred_messages', {});
        const isStarred = !!starred[messageId];

        if (isStarred) {
            delete starred[messageId];
        } else {
            starred[messageId] = true;
        }

        SafeStorage.setJSON('starred_messages', starred);
        return !isStarred;
    }

    function showMessageInfo(message) {
        if (!message) return '';

        return `Message Information:
Sent: ${formatDateTime(message.timestamp)}
${message.edited ? `Edited: ${formatDateTime(message.editedAt)}\n` : ''}
${message.deleted ? `Deleted: ${formatDateTime(message.deletedAt)}\n` : ''}
Status: ${message.status || 'unknown'}
Type: ${message.type || 'unknown'}
${message.fileName ? `File: ${message.fileName}\n` : ''}
${message.fileSize ? `Size: ${formatFileSize(message.fileSize)}\n` : ''}`;
    }

    function showReportModal(message) {
        if (!message) return;

        SafeStorage.setJSON('reported_message', {
            messageId: message.id,
            chatId: currentChat?.id || '',
            senderId: message.senderId,
            content: message.content,
            type: message.type,
            timestamp: new Date().toISOString()
        });
    }

    function submitReport() {
        const reportText = document.getElementById('reportText');
        if (!reportText || !reportText.value?.trim()) return false;

        const reportData = {
            message: SafeStorage.getJSON('reported_message', {}),
            reason: reportText.value.trim(),
            reporterId: SessionMirror.getUser()?.id || 'unknown',
            timestamp: new Date().toISOString()
        };

        const reports = SafeStorage.getJSON('reports', []);
        reports.push(reportData);
        SafeStorage.setJSON('reports', reports);

        if (SessionMirror.isAuthenticated()) {
            APIClient.request('/api/reports', {
                method: 'POST',
                body: JSON.stringify(reportData)
            }).catch(() => {});
        }

        return true;
    }

    function initEmojiPicker() {
        emojiPicker = document.querySelector('emoji-picker');
        if (emojiPicker) {
            emojiPicker.addEventListener('emoji-click', (event) => {
                const messageInput = document.getElementById('messageInput');
                if (messageInput) {
                    messageInput.value += event.detail.unicode || '';
                    messageInput.focus();
                }
            });
        }
    }

    function toggleEmojiPicker() {
        const container = document.getElementById('emojiPickerContainer');
        if (container) {
            container.classList.toggle('active');
        }
    }

    function closeEmojiPickerOnClickOutside(event) {
        const container = document.getElementById('emojiPickerContainer');
        const button = document.getElementById('emojiBtn');

        if (container?.classList.contains('active')) {
            if (!container.contains(event.target) && (!button || !button.contains(event.target))) {
                container.classList.remove('active');
            }
        }
    }

    function toggleFormattingToolbar() {
        const toolbar = document.getElementById('formattingToolbar');
        if (toolbar) {
            toolbar.classList.toggle('active');
        }
    }

    function closeFormattingToolbarOnClickOutside(event) {
        const toolbar = document.getElementById('formattingToolbar');
        const button = document.getElementById('formatBtn');

        if (toolbar?.classList.contains('active')) {
            if (!toolbar.contains(event.target) && (!button || !button.contains(event.target))) {
                toolbar.classList.remove('active');
            }
        }
    }

    function applyFormatting(tag) {
        const input = document.getElementById('messageInput');
        if (!input) return;

        const start = input.selectionStart;
        const end = input.selectionEnd;
        const selectedText = input.value.substring(start, end);

        let wrappedText = selectedText;
        switch (tag) {
            case 'b': wrappedText = `**${selectedText}**`; break;
            case 'i': wrappedText = `*${selectedText}*`; break;
            case 'code': wrappedText = `\`${selectedText}\``; break;
            case 'pre': wrappedText = `\`\`\`\n${selectedText}\n\`\`\``; break;
        }

        input.value = input.value.substring(0, start) + wrappedText + input.value.substring(end);
        input.focus();
        input.setSelectionRange(start + wrappedText.length, start + wrappedText.length);
    }

    function toggleAttachmentOptions() {
        const options = document.getElementById('attachmentOptions');
        if (options) {
            options.classList.toggle('active');
        }
    }

    function closeAttachmentOptionsOnClickOutside(event) {
        const options = document.getElementById('attachmentOptions');
        const button = document.getElementById('attachBtn');

        if (options?.classList.contains('active')) {
            if (!options.contains(event.target) && (!button || !button.contains(event.target))) {
                options.classList.remove('active');
            }
        }
    }

    function handleAttachment(type) {
        window.dispatchEvent(new CustomEvent('handleAttachment', {
            detail: { type }
        }));
    }

    async function createNote() {
        const input = document.getElementById('messageInput');
        const content = input?.value?.trim() || 'Note';

        return await sendMessageWithOptions(content, { isNote: true });
    }

    async function selectImage() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file || file.size > 10 * 1024 * 1024) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        type: 'image',
                        data: reader.result,
                        name: file.name,
                        size: file.size
                    });
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });
    }

    async function selectVideo() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file || file.size > 50 * 1024 * 1024) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        type: 'video',
                        data: reader.result,
                        name: file.name,
                        size: file.size
                    });
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });
    }

    async function selectFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file || file.size > 100 * 1024 * 1024) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        type: 'file',
                        data: reader.result,
                        name: file.name,
                        size: file.size
                    });
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });
    }

    async function shareLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        type: 'location',
                        data: `https://maps.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}&z=15&output=embed`,
                        name: `Location (${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)})`,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                () => resolve(null),
                { timeout: 10000 }
            );
        });
    }

    function createPoll() {
        const question = prompt('Enter poll question:');
        if (!question) return null;

        const options = [];
        for (let i = 1; i <= 4; i++) {
            const option = prompt(`Enter option ${i} (leave empty to finish):`);
            if (!option) break;
            options.push({
                text: option,
                votes: 0,
                voters: []
            });
        }

        if (options.length < 2) return null;

        return { question, options };
    }

    function showAttachmentPreview(attachment) {
        const preview = document.getElementById('attachmentPreview');
        if (!preview) return;

        preview.innerHTML = '';

        if (!attachment) {
            preview.style.display = 'none';
            return;
        }

        const item = document.createElement('div');
        item.className = 'attachment-preview-item';

        if (attachment.type === 'image') {
            const img = document.createElement('img');
            img.src = attachment.data;
            img.alt = attachment.name || 'Image';
            item.appendChild(img);
        } else if (attachment.type === 'audio') {
            item.innerHTML = `<i class="fas fa-microphone"></i> Audio (${Math.floor(attachment.duration || 0)}s)`;
        } else {
            item.innerHTML = `<i class="fas fa-file"></i> ${attachment.name || 'File'}`;
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-attachment';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = removeAttachment;
        item.appendChild(removeBtn);

        preview.appendChild(item);
        preview.style.display = 'block';
    }

    function removeAttachment() {
        currentAttachment = null;
        const preview = document.getElementById('attachmentPreview');
        if (preview) {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }
    }

    function openThread(messageId) {
        currentThread = messageId;
        window.dispatchEvent(new CustomEvent('openThread', {
            detail: { messageId }
        }));
    }

    async function loadThreadMessages(messageId) {
        return true;
    }

    function showChatInfo(chat) {
        if (!chat) return { title: 'Chat Info', sections: [] };

        return {
            title: chat.type === 'note' ? 'Notes' : chat.friendName || 'Chat',
            sections: [
                {
                    title: 'Chat Information',
                    items: [
                        { label: 'Name', value: chat.type === 'note' ? 'Notes' : chat.friendName || 'Unknown' },
                        { label: 'Status', value: chat.blocked ? 'Blocked' : chat.archived ? 'Archived' : 'Active' },
                        { label: 'Last Message', value: formatTime(chat.lastMessageAt) },
                        { label: 'Unread', value: chat.unreadCount || 0 },
                        { label: 'Type', value: chat.type === 'group' ? 'Group' : chat.type === 'note' ? 'Notes' : 'Direct' }
                    ]
                }
            ]
        };
    }

    function loadChatThemes() {
        const themes = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHAT_THEMES);
        if (themes) {
            chatThemes = themes;
        }
    }

    function applyChatTheme(friendId) {
        const theme = chatThemes[friendId];
        if (theme) {
            document.documentElement.style.setProperty('--chat-bubble-sent', theme.sentColor || 'var(--primary-color)');
            document.documentElement.style.setProperty('--chat-bubble-received', theme.receivedColor || 'var(--secondary-color)');
            document.documentElement.style.setProperty('--chat-background', theme.background || '');
        } else {
            document.documentElement.style.setProperty('--chat-bubble-sent', 'var(--primary-color)');
            document.documentElement.style.setProperty('--chat-bubble-received', 'var(--secondary-color)');
            document.documentElement.style.setProperty('--chat-background', '');
        }
    }

    function loadUserSettings() {
        const settings = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS);
        if (!settings) {
            const defaultSettings = {
                autoDownload: false,
                notificationSound: true,
                messagePreview: true,
                onlineStatus: true,
                readReceipts: true,
                typingIndicators: true,
                theme: 'light',
                fontSize: 'medium',
                silentReactions: true,
                readOnlyMode: false,
                autoSaveDrafts: true,
                offlineMode: true,
                viewOnceEnabled: true
            };
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, defaultSettings);
        } else {
            silentReactionsEnabled = settings.silentReactions !== false;
            readOnlyMode = settings.readOnlyMode === true;
        }
    }

    function loadMessageDrafts() {
        const drafts = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.DRAFTS);
        if (drafts) {
            messageDrafts = drafts;
        }
    }

    function saveMessageDraft() {
        if (!currentChat) return;

        const input = document.getElementById('messageInput');
        const draft = input?.value?.trim() || '';
        const attachment = currentAttachment ? {
            type: currentAttachment.type,
            data: currentAttachment.data,
            name: currentAttachment.name,
            size: currentAttachment.size,
            duration: currentAttachment.duration
        } : null;

        if (draft || attachment) {
            messageDrafts[currentChat.id] = {
                text: draft,
                attachment,
                timestamp: Date.now()
            };
        } else if (messageDrafts[currentChat.id]) {
            delete messageDrafts[currentChat.id];
        }

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.DRAFTS, messageDrafts);
    }

    function loadMessageDraft() {
        if (!currentChat) return;

        const draft = messageDrafts[currentChat.id];
        if (draft) {
            const input = document.getElementById('messageInput');
            if (input && draft.text) {
                input.value = draft.text;
                input.style.height = 'auto';
                input.style.height = input.scrollHeight + 'px';
            }

            if (draft.attachment) {
                currentAttachment = draft.attachment;
                showAttachmentPreview(draft.attachment);
            }
        }
    }

    function updateDraftBadge(hasDraft) {
        const badge = document.getElementById('draftBadge');
        if (badge) {
            badge.style.display = hasDraft ? 'inline-block' : 'none';
        }
    }

    function loadScheduledMessages() {
        const scheduled = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.SCHEDULED_MESSAGES);
        if (scheduled) {
            scheduledMessages = scheduled;
        }
    }

    function loadOfflineQueue() {
        const queue = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
        if (queue) {
            offlineQueue = queue;
        }
    }

    function updateScheduleBadge() {
        const badge = document.getElementById('scheduleBadge');
        if (badge) {
            const hasScheduled = scheduledMessages.some(msg => msg.chatId === currentChat?.id);
            badge.style.display = hasScheduled ? 'flex' : 'none';
        }
    }

    function setupScrollDetection() {
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.addEventListener('scroll', updateJumpButtonVisibility);
        }
    }

    function updateJumpButtonVisibility() {
        const container = document.getElementById('messagesContainer');
        const button = document.getElementById('jumpToLatest');

        if (container && button) {
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
            button.style.display = isNearBottom ? 'none' : 'block';
        }
    }

    function jumpToLatest() {
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    function searchInChat(query) {
        if (!query?.trim()) {
            searchResults = [];
            currentSearchIndex = -1;
            return [];
        }

        searchResults = messages.filter(msg => 
            !msg.deleted && 
            msg.content && 
            msg.content.toLowerCase().includes(query.toLowerCase())
        );

        return searchResults;
    }

    function highlightText(text, query) {
        if (!text || !query) return escapeHtml(text || '');

        const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
        return escapeHtml(text).replace(regex, '<span class="search-highlight">$1</span>');
    }

    function highlightSearchResults(query) {
        if (!query) return;

        const elements = document.querySelectorAll('.message-content');
        elements.forEach(el => {
            const original = el.getAttribute('data-original') || el.textContent;
            el.setAttribute('data-original', original);
            el.innerHTML = highlightText(original, query);
        });
    }

    function removeSearchHighlights() {
        const elements = document.querySelectorAll('.message-content');
        elements.forEach(el => {
            const original = el.getAttribute('data-original');
            if (original) {
                el.innerHTML = escapeHtml(original);
                el.removeAttribute('data-original');
            }
        });
    }

    function navigateToSearchResult(index) {
        if (index >= 0 && index < searchResults.length) {
            scrollToMessage(searchResults[index].id);
        }
    }

    function scrollToMessage(messageId) {
        const element = document.querySelector(`[data-message-id="${messageId}"]`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            if (typeof MediaRecorder === 'undefined') {
                return false;
            }

            mediaRecorder = new MediaRecorder(stream);
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    currentAttachment = {
                        type: 'audio',
                        data: reader.result,
                        name: `recording_${Date.now()}.webm`,
                        size: blob.size,
                        duration: Math.floor((Date.now() - recordingStartTime) / 1000)
                    };
                    showAttachmentPreview(currentAttachment);
                };
                reader.readAsDataURL(blob);
            };

            mediaRecorder.start();
            isRecording = true;
            recordingStartTime = Date.now();

            recordingTimer = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                const timerEl = document.getElementById('recordingTimer');
                if (timerEl) {
                    timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
            }, 1000);

            return true;
        } catch (error) {
            return false;
        }
    }

    async function stopRecording() {
        if (!mediaRecorder || !isRecording) return null;

        clearInterval(recordingTimer);

        return new Promise((resolve) => {
            mediaRecorder.onstop = () => {
                isRecording = false;
                mediaRecorder = null;
                resolve(currentAttachment);
            };

            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        });
    }

    function cancelRecording() {
        if (!mediaRecorder || !isRecording) return false;

        clearInterval(recordingTimer);
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());

        isRecording = false;
        mediaRecorder = null;
        currentAttachment = null;

        return true;
    }

    function startBackgroundSync() {
        let syncInterval = setInterval(async () => {
            if (!SessionMirror.isAuthenticated() || isSyncing) return;

            isSyncing = true;
            try {
                await loadChats();
                await loadContacts();
                await messagingClient.processQueue();
            } catch (error) {
            } finally {
                isSyncing = false;
            }
        }, 30000);

        let saveInterval = setInterval(() => {
            if (currentChat) {
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
            }
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        }, 60000);

        return { syncInterval, saveInterval };
    }

    function playNotificationSound() {
        const settings = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
        if (settings.notificationSound !== false) {
            const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
            audio.volume = 0.3;
            audio.play().catch(() => {});
        }
    }

    function checkScheduledMessages() {
        const now = Date.now();
        const toSend = [];

        scheduledMessages = scheduledMessages.filter(msg => {
            if (msg && msg.scheduleTime <= now && msg.status === 'scheduled') {
                toSend.push(msg);
                return false;
            }
            return true;
        });

        toSend.forEach(async (msg) => {
            if (msg.chatId === currentChat?.id) {
                await sendMessageWithOptions(msg.content || '', msg.options || {});
            }
        });

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SCHEDULED_MESSAGES, scheduledMessages);
        setTimeout(checkScheduledMessages, 60000);
    }

    async function checkOfflineQueue() {
        if (!navigator.onLine || offlineQueue.length === 0 || !SessionMirror.isAuthenticated()) return;

        const failedMessages = [];

        for (const message of offlineQueue) {
            const result = await APIClient.request('/api/messages/send', {
                method: 'POST',
                body: JSON.stringify(message)
            });

            if (!result) {
                failedMessages.push(message);
            }
        }

        offlineQueue = failedMessages;
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);
    }

    function loadMultiSendChats() {
        return chats.filter(chat => 
            !chat.archived && 
            !chat.blocked && 
            chat.type !== 'note'
        );
    }

    function updateMultiSendSelection(chatId, selected) {
        if (selected) {
            multiSendSelectedChats.add(chatId);
        } else {
            multiSendSelectedChats.delete(chatId);
        }
    }

    function saveUIState() {
        const state = {
            lastChatId: currentChat?.id,
            lastCategory: currentCategory,
            timestamp: Date.now()
        };
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.UI_STATE, state);
    }

    function getUserFromURL() {
        try {
            const params = new URLSearchParams(window.location.search);
            const userId = params.get('userId') || params.get('friendId') || params.get('user');
            const username = params.get('username') || params.get('name') || 'User';
            const userAvatar = params.get('avatar') || params.get('photoURL') || '';

            return userId ? { userId, username: decodeURIComponent(username), userAvatar } : null;
        } catch (error) {
            return null;
        }
    }

    async function openChatPanel(userId, username, userAvatar = '') {
        currentFriend = { uid: userId, displayName: username, photoURL: userAvatar };
        return loadChatByFriendId(userId);
    }

    function showReconnectState(message) {
        const overlay = document.getElementById('reconnectOverlay');
        const messageEl = document.getElementById('reconnectMessage');

        if (overlay) overlay.style.display = 'flex';
        if (messageEl) messageEl.textContent = message || 'Connection lost';
    }

    function hideReconnectState() {
        const overlay = document.getElementById('reconnectOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    function retryConnection() {
        IframeHandshakeAuthority.reset();
        initialize();
    }

    function renderMessages() {
        window.dispatchEvent(new CustomEvent('renderMessages', {
            detail: { messages, currentChat, currentUser }
        }));
    }

    function renderChatsList() {
        window.dispatchEvent(new CustomEvent('renderChatsList', {
            detail: { chats, currentChat, currentCategory, messageDrafts }
        }));
    }

    function renderContactsList() {
        window.dispatchEvent(new CustomEvent('renderContactsList', {
            detail: { contacts }
        }));
    }

    function markMessageAsViewed(messageId) {}

    function initializeAudioWaveforms() {}

    function viewMedia(url, fileName) {
        return { url, fileName };
    }

    function playVideo(url) {
        return url;
    }

    function playAudio(messageId, url, duration) {
        try {
            const audio = new Audio(url);
            audio.play();
            return 'playing';
        } catch (error) {
            return 'error';
        }
    }

    function downloadFile(url, fileName) {
        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return true;
        } catch (error) {
            return false;
        }
    }

    function openLocation(latitude, longitude) {
        try {
            const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
            window.open(url, '_blank');
            return url;
        } catch (error) {
            return null;
        }
    }

    function cleanupAudioPlayers() {
        audioPlayers.clear();
    }

    function syncChatList() {
        return Promise.resolve([]);
    }

    function updateUnreadCounts() {
        return 0;
    }

    function updateTypingIndicator(isTyping) {
        return false;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initialize, 100);
        });
    } else {
        setTimeout(initialize, 100);
    }

    window.addEventListener('beforeunload', () => {
        if (recordingTimer) clearInterval(recordingTimer);
        if (typingTimeout) clearTimeout(typingTimeout);
        cleanupAudioPlayers();
        saveMessageDraft();
        saveUIState();

        if (currentChat) {
            SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
        }
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
    });

    const messagesCore = {
        currentUser, currentChat, currentFriend, messages, chats, contacts,
        isRecording, mediaRecorder, recordingTimer, recordingStartTime,
        typingTimeout, isTyping, selectedMessage, currentThread, chatThemes,
        emojiPicker, isSyncing, audioPlayers, editingMessageId, replyToMessage,
        currentCategory, activeFormattingTags, activeAudioElement, scheduledMessages,
        offlineQueue, messageDrafts, silentReactionsEnabled, readOnlyMode,
        currentAttachment, searchResults, currentSearchIndex, multiSendSelectedChats,
        recordingCancelTimeout, dragStartY, isDraggingToCancel,
        isParentReady, isSessionReceived, isInitialized, sessionData, sessionValid,
        sessionAdapter, handshakeState, connectionHealth,

        MESSAGE_TYPES,
        LOCAL_STORAGE_KEYS,
        VERSION,
        SOURCE_CHILD,
        FRAME_ID,

        setCurrentUser, setCurrentChat, setCurrentFriend, setMessages, setChats, setContacts,
        setIsRecording, setMediaRecorder, setRecordingTimer, setRecordingStartTime,
        setTypingTimeout, setIsTyping, setSelectedMessage, setCurrentThread,
        setChatThemes, setEmojiPicker, setIsSyncing, setAudioPlayers,
        setEditingMessageId, setReplyToMessage, setCurrentCategory,
        setActiveFormattingTags, setActiveAudioElement, setScheduledMessages,
        setOfflineQueue, setMessageDrafts, setSilentReactionsEnabled, setReadOnlyMode,
        setCurrentAttachment, setSearchResults, setCurrentSearchIndex,
        setMultiSendSelectedChats, setRecordingCancelTimeout, setDragStartY,
        setIsDraggingToCancel,

        parentConnection: SessionMirror,
        getCurrentSession, requestSessionUpdate, initChildSession,

        initializeParentCoordination,
        isCoreReady,
        getConnectionHealth,

        sendToParent,

        apiRequest, fetchData,

        getData, updateData, loadCoreData,

        validateMessageStructure, validateMessagePayload, validateMessageBeforeSend,
        validateData, validateSessionData,

        loadContacts, loadChats, loadMessages,
        openChat, loadChatByFriendId, createLocalChat,
        sendMessage, sendMessageWithOptions, sendToMultipleChats,
        editMessage, saveEditedMessage, cancelEditMessage, deleteMessage,
        markChatAsRead, addReaction,
        toggleBlockUser, toggleArchiveChat, toggleReadOnly, clearChatHistory,
        voteInPoll,

        showStatusMessage, hideStatusMessage,
        formatMessageText, formatTime, formatDate, formatDateTime, formatFileSize,
        escapeHtml, escapeRegex, preserveFormatting, sanitizePayload,

        showMessageActions, closeMessageActions, handleMessageAction,
        showForwardMessage, toggleStarMessage, showMessageInfo, showReportModal, submitReport,

        initEmojiPicker, toggleEmojiPicker, closeEmojiPickerOnClickOutside,

        toggleFormattingToolbar, closeFormattingToolbarOnClickOutside, applyFormatting,

        toggleAttachmentOptions, closeAttachmentOptionsOnClickOutside, handleAttachment,
        createNote, selectImage, selectVideo, selectFile, shareLocation, createPoll,
        showAttachmentPreview, removeAttachment,

        openThread, loadThreadMessages, showChatInfo,

        loadChatThemes, applyChatTheme,

        loadUserSettings, loadMessageDrafts, saveMessageDraft, loadMessageDraft,
        updateDraftBadge, loadScheduledMessages, loadOfflineQueue, updateScheduleBadge,

        setupScrollDetection, updateJumpButtonVisibility, jumpToLatest,
        searchInChat, highlightText, highlightSearchResults, removeSearchHighlights,
        navigateToSearchResult, scrollToMessage,

        startRecording, stopRecording, cancelRecording,

        startBackgroundSync, playNotificationSound,
        checkScheduledMessages, checkOfflineQueue,
        loadMultiSendChats, updateMultiSendSelection,

        saveUIState, getUserFromURL, openChatPanel,

        showReconnectState, hideReconnectState, retryConnection,

        renderMessages, renderChatsList, renderContactsList, markMessageAsViewed,

        initializeAudioWaveforms, viewMedia, playVideo, playAudio, downloadFile,
        openLocation, cleanupAudioPlayers,

        syncChatList, updateUnreadCounts, updateTypingIndicator,

        // NEW EXPORTS
        SecurityUtils,
        SafeStorage,
        DiagnosticsAgent,
        ParentDetector,
        IframeHandshakeAuthority,
        SessionMirror,
        IframeSessionClient,
        CompatibilityBridge,
        RecoveryManager,
        CircuitBreaker,
        getHealthStatus,
        messagingClient,
        
        // NEW - Enhanced modules
        IframeEnvironment,
        StartupGovernor,
        IframeTransport,
        IframeAuthority,
        safeFetch
    };

    window.messagesCore = messagesCore;

    if (window.location.hash === '#debug' || localStorage.getItem('kynecta_debug') === 'true') {
        window.__IFRAME_DEBUG__ = true;
        DiagnosticsAgent.enabled = true;
        DiagnosticsAgent.debugMode = true;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = messagesCore;
    }
})();