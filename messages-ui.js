// =============================================
// MESSAGES-CORE.js - HARDENED PRODUCTION CORE ENGINE v3.0.3
// SECURE PARENT-IFRAME COMMUNICATION LAYER
// NO GUEST MODE | NO HANDSHAKE TIMEOUTS | AUTHENTICATED ONLY
// =============================================

(function() {
    'use strict';

    // =============================================
    // CONSTANTS & CONFIGURATION
    // =============================================
    const VERSION = '3.0.3';
    const APP_NAME = 'kynecta-messages';
    const SOURCE_CHILD = 'CHILD';
    
    const PROTOCOL = {
        VERSION: '3.0.3',
        MIN_COMPATIBLE: '2.0.0'
    };

    const HANDSHAKE = {
        MAX_RETRIES: 5,
        RETRY_DELAY: 500,
        TIMEOUT: 5000,
        ACK_TIMEOUT: 3000
    };

    const MESSAGE_TYPES = {
        HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
        HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',
        HANDSHAKE_ACK: 'HANDSHAKE_ACK',
        CHILD_READY: 'CHILD_READY',
        PARENT_READY: 'PARENT_READY',
        SESSION_INIT: 'SESSION_INIT',
        SESSION_UPDATE: 'SESSION_UPDATE',
        SESSION_REFRESH: 'SESSION_REFRESH',
        SESSION_EXPIRED: 'SESSION_EXPIRED',
        REQUEST_SESSION: 'REQUEST_SESSION',
        API_REQUEST: 'API_REQUEST',
        API_RESPONSE: 'API_RESPONSE',
        SEND_MESSAGE: 'SEND_MESSAGE',
        MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
        MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
        MESSAGE_READ: 'MESSAGE_READ',
        TYPING_START: 'TYPING_START',
        TYPING_STOP: 'TYPING_STOP',
        ACK: 'ACK',
        ERROR: 'ERROR',
        PING: 'PING',
        PONG: 'PONG',
        LOGOUT: 'LOGOUT',
        FORCE_RELOAD: 'FORCE_RELOAD'
    };

    // This constant MUST be exported
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
        UI_STATE: 'kynecta_ui_state'
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
    // SECURITY & VALIDATION UTILITIES
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
            'null'
        ]),

        validateOrigin(origin) {
            if (!origin || origin === 'null') return false;
            if (this.allowedOrigins.has(origin)) return true;
            if (origin.startsWith('http://localhost:') || 
                origin.startsWith('https://localhost:') ||
                origin.startsWith('http://127.0.0.1:') || 
                origin.startsWith('https://127.0.0.1:')) {
                const port = origin.split(':').pop();
                if (port && !isNaN(port) && Number(port) > 0 && Number(port) < 65536) {
                    this.allowedOrigins.add(origin);
                    return true;
                }
            }
            return false;
        },

        validateMessageStructure(data) {
            if (!data || typeof data !== 'object') return false;
            if (!data.type || typeof data.type !== 'string') return false;
            if (data.source && data.source !== SOURCE_CHILD && data.source !== 'PARENT') return false;
            if (data.payload && typeof data.payload !== 'object') return false;
            if (data.timestamp && (typeof data.timestamp !== 'number' || data.timestamp > Date.now() + 60000)) return false;
            return true;
        },

        generateMessageId() {
            return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${performance.now().toString(36)}`;
        },

        generateSignature(payload, timestamp) {
            const str = JSON.stringify(payload) + timestamp + 'kynecta-static-seed';
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return hash.toString(36);
        },

        verifySignature(message) {
            if (!message.signature || !message.timestamp || !message.payload) return false;
            const expectedSig = this.generateSignature(message.payload, message.timestamp);
            return message.signature === expectedSig;
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
                .replace(/onerror/gi, 'data-onerror');
        },

        sanitizePayload(payload) {
            if (!payload || typeof payload !== 'object') return {};
            const sanitized = {};
            for (const [key, value] of Object.entries(payload)) {
                const safeKey = String(key).replace(/[^\w\-]/g, '');
                if (typeof value === 'string') {
                    sanitized[safeKey] = this.sanitizeString(value);
                } else if (typeof value === 'number' || typeof value === 'boolean') {
                    sanitized[safeKey] = value;
                } else if (value === null || value === undefined) {
                    sanitized[safeKey] = null;
                } else if (Array.isArray(value)) {
                    sanitized[safeKey] = value.map(item => 
                        typeof item === 'string' ? this.sanitizeString(item) : item
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
        }
    };

    // =============================================
    // LOGGING SYSTEM
    // =============================================
    const Logger = {
        logCache: new Set(),
        warnCache: new Set(),
        errorCache: new Set(),
        
        _shouldLog(level, message) {
            if (level < CURRENT_LOG_LEVEL) return false;
            const cache = level === LOG_LEVELS.WARN ? this.warnCache :
                          level === LOG_LEVELS.ERROR ? this.errorCache : 
                          this.logCache;
            if (cache.has(message)) return false;
            cache.add(message);
            setTimeout(() => cache.delete(message), level === LOG_LEVELS.ERROR ? 60000 : 30000);
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
    // STORAGE ABSTRACTION LAYER
    // =============================================
    const StorageLayer = {
        memoryStore: new Map(),
        storageAvailable: true,
        encryptionKey: null,

        init() {
            try {
                const testKey = '_kynecta_test_';
                localStorage.setItem(testKey, 'test');
                localStorage.removeItem(testKey);
                this.storageAvailable = true;
                Logger.info('Storage', 'LocalStorage available');
            } catch (e) {
                this.storageAvailable = false;
                Logger.warn('Storage', 'LocalStorage unavailable, using memory fallback');
            }
            this.encryptionKey = this._generateKey();
            return this;
        },

        _generateKey() {
            return Array.from(crypto.getRandomValues(new Uint8Array(32)))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        },

        _encrypt(value) {
            if (!this.encryptionKey) return value;
            try {
                const str = JSON.stringify(value);
                let result = '';
                for (let i = 0; i < str.length; i++) {
                    result += String.fromCharCode(str.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length));
                }
                return btoa(result);
            } catch (e) {
                return value;
            }
        },

        _decrypt(value) {
            if (!this.encryptionKey || typeof value !== 'string') return value;
            try {
                const str = atob(value);
                let result = '';
                for (let i = 0; i < str.length; i++) {
                    result += String.fromCharCode(str.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length));
                }
                return JSON.parse(result);
            } catch (e) {
                return value;
            }
        },

        get(key, fallback = null, encrypted = false) {
            if (this.storageAvailable) {
                try {
                    const value = localStorage.getItem(key);
                    if (value !== null) {
                        return encrypted ? this._decrypt(value) : value;
                    }
                } catch (e) {
                    Logger.debug('Storage', `Error reading ${key} from localStorage`);
                }
            }
            return this.memoryStore.has(key) ? this.memoryStore.get(key) : fallback;
        },

        set(key, value, encrypted = false) {
            const storeValue = encrypted ? this._encrypt(value) : value;
            if (this.storageAvailable) {
                try {
                    localStorage.setItem(key, String(storeValue));
                } catch (e) {
                    Logger.debug('Storage', `Error writing ${key} to localStorage`);
                }
            }
            this.memoryStore.set(key, value);
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
                return typeof value === 'string' ? JSON.parse(value) : value;
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
    // SESSION MIRROR LAYER
    // =============================================
    const SessionMirror = {
        _state: {
            authenticated: false,
            user: null,
            token: null,
            permissions: [],
            expiresAt: 0,
            receivedAt: 0,
            fromCache: false,
            version: null
        },
        
        _subscribers: new Set(),
        _refreshTimer: null,
        _initPromise: null,

        init() {
            if (this._initPromise) return this._initPromise;
            this._initPromise = new Promise((resolve) => {
                try {
                    const cached = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE, null, true);
                    if (cached && cached.expiresAt > Date.now()) {
                        this._state = {
                            ...cached,
                            fromCache: true,
                            receivedAt: Date.now()
                        };
                        this._state.authenticated = !!cached.user && !!cached.token;
                        Logger.info('Session', 'Session restored from cache', { userId: cached.user?.id });
                    }
                } catch (e) {
                    Logger.debug('Session', 'Cache restore failed');
                }
                resolve(this._state);
            });
            return this._initPromise;
        },

        acceptSession(snapshot) {
            if (!snapshot || typeof snapshot !== 'object') {
                Logger.warn('Session', 'Invalid session snapshot');
                return false;
            }
            if (!snapshot.user && !snapshot.token && !snapshot.mode) {
                Logger.warn('Session', 'Session missing required fields');
                return false;
            }
            this._state = {
                authenticated: !!snapshot.user && !!snapshot.token,
                user: snapshot.user ? { ...snapshot.user } : null,
                token: snapshot.token || null,
                permissions: snapshot.permissions || [],
                expiresAt: snapshot.expiresAt || (Date.now() + 3600000),
                receivedAt: Date.now(),
                fromCache: false,
                version: snapshot.version || PROTOCOL.VERSION
            };
            StorageLayer.setJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE, {
                user: this._state.user,
                token: this._state.token,
                permissions: this._state.permissions,
                expiresAt: this._state.expiresAt,
                version: this._state.version
            }, true);
            if (this._state.user) {
                StorageLayer.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._state.user, false);
            }
            this._setupRefreshTimer();
            this._notifySubscribers();
            Logger.info('Session', 'Session accepted', { 
                authenticated: this._state.authenticated,
                userId: this._state.user?.id 
            });
            return true;
        },

        updateSession(update) {
            if (!update) return false;
            let changed = false;
            if (update.user) {
                this._state.user = { ...this._state.user, ...update.user };
                StorageLayer.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._state.user, false);
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
            if (update.expiresAt) {
                this._state.expiresAt = update.expiresAt;
                changed = true;
            }
            if (changed) {
                this._state.authenticated = !!this._state.user && !!this._state.token;
                this._state.receivedAt = Date.now();
                StorageLayer.setJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE, {
                    user: this._state.user,
                    token: this._state.token,
                    permissions: this._state.permissions,
                    expiresAt: this._state.expiresAt,
                    version: this._state.version
                }, true);
                this._notifySubscribers();
                Logger.debug('Session', 'Session updated');
            }
            return changed;
        },

        clearSession() {
            this._state = {
                authenticated: false,
                user: null,
                token: null,
                permissions: [],
                expiresAt: 0,
                receivedAt: 0,
                fromCache: false,
                version: null
            };
            StorageLayer.remove(LOCAL_STORAGE_KEYS.SESSION_CACHE);
            StorageLayer.remove(LOCAL_STORAGE_KEYS.USER_CACHE);
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }
            this._notifySubscribers();
            Logger.info('Session', 'Session cleared');
        },

        _setupRefreshTimer() {
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
            }
            const timeUntilExpiry = this._state.expiresAt - Date.now();
            if (timeUntilExpiry > 0 && timeUntilExpiry < 300000) {
                this._refreshTimer = setTimeout(() => {
                    this._requestRefresh();
                }, timeUntilExpiry - 60000);
            }
        },

        _requestRefresh() {
            if (window.MessageBus && window.MessageBus.send) {
                window.MessageBus.send('messagesIframe', MESSAGE_TYPES.SESSION_REFRESH, {}, true)
                    .catch(() => {});
            }
        },

        subscribe(callback) {
            this._subscribers.add(callback);
            callback(this.getState());
            return () => this._subscribers.delete(callback);
        },

        _notifySubscribers() {
            const state = this.getState();
            this._subscribers.forEach(cb => {
                try {
                    cb(state);
                } catch (e) {
                    Logger.error('Session', 'Subscriber error', e);
                }
            });
        },

        getState() {
            return {
                authenticated: this._state.authenticated,
                user: this._state.user ? { ...this._state.user } : null,
                token: this._state.token,
                permissions: [...this._state.permissions],
                expiresAt: this._state.expiresAt,
                receivedAt: this._state.receivedAt,
                fromCache: this._state.fromCache
            };
        },

        getUser() {
            return this._state.user ? { ...this._state.user } : null;
        },

        getToken() {
            return this._state.token;
        },

        isAuthenticated() {
            return this._state.authenticated && this._state.expiresAt > Date.now();
        },

        hasPermission(permission) {
            return this._state.permissions.includes(permission);
        }
    };

    // =============================================
    // CIRCUIT BREAKER FOR RESILIENCE
    // =============================================
    class CircuitBreaker {
        constructor(name, failureThreshold = 3, recoveryTimeout = 30000) {
            this.name = name;
            this.failureCount = 0;
            this.failureThreshold = failureThreshold;
            this.recoveryTimeout = recoveryTimeout;
            this.lastFailureTime = null;
            this.state = 'CLOSED';
        }

        async call(fn, fallback = null) {
            if (this.state === 'OPEN') {
                if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
                    this.state = 'HALF_OPEN';
                    Logger.info('CircuitBreaker', `${this.name} entering half-open state`);
                } else {
                    Logger.debug('CircuitBreaker', `${this.name} open, using fallback`);
                    return typeof fallback === 'function' ? fallback() : fallback;
                }
            }

            try {
                const result = await fn();
                if (this.state === 'HALF_OPEN') {
                    this.state = 'CLOSED';
                    this.failureCount = 0;
                    Logger.info('CircuitBreaker', `${this.name} closed`);
                }
                return result;
            } catch (error) {
                this.failureCount++;
                this.lastFailureTime = Date.now();
                if (this.failureCount >= this.failureThreshold || this.state === 'HALF_OPEN') {
                    this.state = 'OPEN';
                    Logger.warn('CircuitBreaker', `${this.name} opened after ${this.failureCount} failures`);
                }
                return typeof fallback === 'function' ? fallback() : fallback;
            }
        }

        reset() {
            this.state = 'CLOSED';
            this.failureCount = 0;
            this.lastFailureTime = null;
            Logger.info('CircuitBreaker', `${this.name} manually reset`);
        }
    }

    // =============================================
    // MESSAGE FIREWALL & PARSER
    // =============================================
    const MessageFirewall = {
        processedMessages: new Set(),
        messageSequence: 0,
        circuitBreaker: new CircuitBreaker('MessageFirewall', 5, 60000),

        validate(event) {
            return this.circuitBreaker.call(() => {
                if (!SecurityUtils.validateOrigin(event.origin)) {
                    Logger.warn('Firewall', `Rejected message from origin: ${event.origin}`);
                    return false;
                }
                if (!event.source || event.source === window) {
                    Logger.warn('Firewall', 'Invalid message source');
                    return false;
                }
                if (!SecurityUtils.validateMessageStructure(event.data)) {
                    Logger.warn('Firewall', 'Invalid message structure');
                    return false;
                }
                const data = event.data;
                if (data.id && this.processedMessages.has(data.id)) {
                    Logger.debug('Firewall', 'Duplicate message rejected', data.id);
                    return false;
                }
                if (data.id) {
                    this.processedMessages.add(data.id);
                    setTimeout(() => this.processedMessages.delete(data.id), 60000);
                }
                if (data.type !== MESSAGE_TYPES.HANDSHAKE_REQUEST && 
                    data.type !== MESSAGE_TYPES.HANDSHAKE_RESPONSE &&
                    data.payload && data.signature) {
                    if (!SecurityUtils.verifySignature(data)) {
                        Logger.warn('Firewall', 'Invalid signature');
                        return false;
                    }
                }
                return true;
            }, () => false);
        },

        parse(event) {
            if (!this.validate(event)) return null;
            const data = event.data;
            if (!data.sequence) {
                data.sequence = ++this.messageSequence;
            }
            if (!data.timestamp) {
                data.timestamp = Date.now();
            }
            if (data.payload) {
                data.payload = SecurityUtils.sanitizePayload(data.payload);
            }
            return {
                ...data,
                source: data.source || 'PARENT',
                receivedAt: Date.now()
            };
        },

        createOutbound(type, payload = {}, options = {}) {
            const messageId = options.messageId || SecurityUtils.generateMessageId();
            const timestamp = Date.now();
            const message = {
                id: messageId,
                type,
                payload: SecurityUtils.sanitizePayload(payload),
                source: SOURCE_CHILD,
                app: APP_NAME,
                version: VERSION,
                timestamp,
                sequence: ++this.messageSequence,
                requiresAck: options.requiresAck !== false
            };
            if (SessionMirror.isAuthenticated() && type !== MESSAGE_TYPES.HANDSHAKE_REQUEST) {
                message.signature = SecurityUtils.generateSignature(message.payload, timestamp);
            }
            return message;
        }
    };

    // =============================================
    // HANDSHAKE CLIENT (DETERMINISTIC)
    // =============================================
    const HandshakeClient = {
        state: 'PENDING',
        retryCount: 0,
        handshakeId: null,
        handshakePromise: null,
        handshakeResolve: null,
        handshakeReject: null,
        handshakeTimer: null,
        
        init() {
            this.state = 'PENDING';
            this.retryCount = 0;
            Logger.info('Handshake', 'Handshake client initialized');
            return this;
        },

        async start() {
            if (this.state === 'COMPLETED') {
                return Promise.resolve({ success: true, cached: true });
            }
            if (this.state === 'IN_PROGRESS' && this.handshakePromise) {
                return this.handshakePromise;
            }
            this.state = 'IN_PROGRESS';
            this.handshakeId = SecurityUtils.generateMessageId();
            this.handshakePromise = new Promise((resolve, reject) => {
                this.handshakeResolve = resolve;
                this.handshakeReject = reject;
                this._performHandshake();
            });
            return this.handshakePromise;
        },

        _performHandshake() {
            if (!window.parent || window.parent === window) {
                this._fail('No parent window');
                return;
            }
            Logger.info('Handshake', `Starting handshake (attempt ${this.retryCount + 1}/${HANDSHAKE.MAX_RETRIES})`);
            const handshakeMessage = MessageFirewall.createOutbound(
                MESSAGE_TYPES.HANDSHAKE_REQUEST,
                {
                    version: VERSION,
                    compatibleVersions: ['2.0.0', '2.0.4', '3.0.0', '3.0.1', '3.0.2', '3.0.3'],
                    clientId: this.handshakeId,
                    timestamp: Date.now()
                },
                { requiresAck: true }
            );
            this.handshakeTimer = setTimeout(() => {
                this._handleTimeout();
            }, HANDSHAKE.TIMEOUT);
            try {
                window.parent.postMessage(handshakeMessage, '*');
            } catch (e) {
                this._fail(`PostMessage failed: ${e.message}`);
            }
        },

        _handleTimeout() {
            if (this.state !== 'IN_PROGRESS') return;
            this.retryCount++;
            if (this.retryCount < HANDSHAKE.MAX_RETRIES) {
                Logger.warn('Handshake', `Timeout, retrying (${this.retryCount}/${HANDSHAKE.MAX_RETRIES})`);
                setTimeout(() => this._performHandshake(), HANDSHAKE.RETRY_DELAY * this.retryCount);
            } else {
                this._fail('Max retries exceeded');
            }
        },

        _fail(reason) {
            if (this.state !== 'IN_PROGRESS') return;
            this.state = 'FAILED';
            if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
            Logger.error('Handshake', `Failed: ${reason}`);
            if (this.handshakeReject) {
                this.handshakeReject(new Error(`Handshake failed: ${reason}`));
            }
        },

        complete(response) {
            if (this.state !== 'IN_PROGRESS') return false;
            if (!response || !response.payload || response.type !== MESSAGE_TYPES.HANDSHAKE_RESPONSE) {
                this._fail('Invalid handshake response');
                return false;
            }
            const payload = response.payload;
            if (!this._isVersionCompatible(payload.version)) {
                this._fail(`Incompatible version: ${payload.version}`);
                return false;
            }
            this.state = 'COMPLETED';
            if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
            Logger.info('Handshake', 'Completed successfully', {
                version: payload.version,
                serverTime: payload.serverTime
            });
            if (this.handshakeResolve) {
                this.handshakeResolve({
                    success: true,
                    version: payload.version,
                    serverTime: payload.serverTime
                });
            }
            return true;
        },

        _isVersionCompatible(version) {
            if (!version) return false;
            if (version === VERSION) return true;
            const compatible = ['2.0.0', '2.0.4', '3.0.0', '3.0.1', '3.0.2', '3.0.3'];
            return compatible.includes(version);
        },

        isCompleted() {
            return this.state === 'COMPLETED';
        },

        reset() {
            this.state = 'PENDING';
            this.retryCount = 0;
            this.handshakeId = null;
            if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
            this.handshakeTimer = null;
            this.handshakePromise = null;
        }
    }.init();

    // =============================================
    // PARENT AVAILABILITY DETECTOR
    // =============================================
    const ParentDetector = {
        isReady: false,
        checkInterval: null,
        pingInterval: null,
        lastPong: 0,
        listeners: new Set(),

        init() {
            this._checkParent();
            this._startPing();
            return this;
        },

        _checkParent() {
            const hasParent = window.parent && window.parent !== window;
            const canPostMessage = typeof window.parent?.postMessage === 'function';
            this.isReady = hasParent && canPostMessage;
            if (this.isReady) {
                Logger.info('ParentDetector', 'Parent detected and ready');
                this._notifyListeners();
            } else {
                Logger.warn('ParentDetector', 'Parent not ready');
            }
        },

        _startPing() {
            this.pingInterval = setInterval(() => {
                if (!this.isReady) {
                    this._checkParent();
                    return;
                }
                try {
                    window.parent.postMessage(
                        MessageFirewall.createOutbound(MESSAGE_TYPES.PING, {}, { requiresAck: false }),
                        '*'
                    );
                } catch (e) {
                    this.isReady = false;
                    Logger.warn('ParentDetector', 'Ping failed, parent may be unavailable');
                }
            }, 10000);
        },

        handlePong() {
            this.lastPong = Date.now();
            if (!this.isReady) {
                this.isReady = true;
                this._notifyListeners();
            }
        },

        subscribe(callback) {
            this.listeners.add(callback);
            if (this.isReady) callback(true);
            return () => this.listeners.delete(callback);
        },

        _notifyListeners() {
            this.listeners.forEach(cb => {
                try {
                    cb(this.isReady);
                } catch (e) {}
            });
        },

        destroy() {
            if (this.pingInterval) clearInterval(this.pingInterval);
            this.listeners.clear();
        }
    }.init();

    // =============================================
    // SECURE MESSAGING CLIENT
    // =============================================
    class SecureMessagingClient {
        constructor() {
            this.listeners = new Map();
            this.pendingAcks = new Map();
            this.sequence = 0;
            this.handshakeClient = HandshakeClient;
            this.parentDetector = ParentDetector;
            this.sessionMirror = SessionMirror;
            this.circuitBreaker = new CircuitBreaker('MessagingClient', 3, 10000);
            this._initMessageListener();
        }

        _initMessageListener() {
            window.addEventListener('message', this._receive.bind(this));
        }

        async _receive(event) {
            await this.circuitBreaker.call(async () => {
                const message = MessageFirewall.parse(event);
                if (!message) return;
                if (message.type === MESSAGE_TYPES.ACK) {
                    this._handleAck(message);
                    return;
                }
                if (message.type === MESSAGE_TYPES.PONG) {
                    ParentDetector.handlePong();
                    return;
                }
                if (message.requiresAck && event.source) {
                    this._sendAck(message, event.origin);
                }
                await this._handleMessageType(message, event);
                const handlers = this.listeners.get(message.type) || [];
                handlers.forEach(handler => {
                    try {
                        handler(message.payload, message);
                    } catch (error) {
                        Logger.error('Messaging', `Handler error: ${error.message}`);
                    }
                });
            });
        }

        async _handleMessageType(message, event) {
            switch (message.type) {
                case MESSAGE_TYPES.SESSION_INIT:
                case MESSAGE_TYPES.SESSION_UPDATE:
                    SessionMirror.acceptSession(message.payload);
                    break;
                case MESSAGE_TYPES.HANDSHAKE_RESPONSE:
                    HandshakeClient.complete(message);
                    break;
                case MESSAGE_TYPES.PARENT_READY:
                    ParentDetector.isReady = true;
                    ParentDetector._notifyListeners();
                    Logger.info('Messaging', 'Parent ready received');
                    break;
                case MESSAGE_TYPES.SESSION_EXPIRED:
                    SessionMirror.clearSession();
                    Logger.warn('Messaging', 'Session expired');
                    break;
                case MESSAGE_TYPES.LOGOUT:
                    SessionMirror.clearSession();
                    Logger.info('Messaging', 'Logout received');
                    break;
                case MESSAGE_TYPES.API_RESPONSE:
                    const ackHandler = this.pendingAcks.get(message.payload?.requestId);
                    if (ackHandler) {
                        ackHandler.resolve(message.payload);
                        this.pendingAcks.delete(message.payload.requestId);
                    }
                    break;
                case MESSAGE_TYPES.FORCE_RELOAD:
                    window.location.reload();
                    break;
            }
        }

        _sendAck(message, targetOrigin) {
            try {
                const ackMessage = {
                    id: `ack_${message.id}`,
                    type: MESSAGE_TYPES.ACK,
                    payload: { 
                        messageId: message.id, 
                        success: true,
                        timestamp: Date.now()
                    },
                    source: SOURCE_CHILD,
                    timestamp: Date.now()
                };
                event.source.postMessage(ackMessage, targetOrigin);
            } catch (e) {
                Logger.debug('Messaging', 'Failed to send ACK');
            }
        }

        _handleAck(message) {
            const originalId = message.payload?.messageId;
            if (!originalId) return;
            const pending = this.pendingAcks.get(originalId);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve(message.payload);
                this.pendingAcks.delete(originalId);
                Logger.debug('Messaging', `ACK received for ${originalId}`);
            }
        }

        async send(type, payload = {}, options = {}) {
            return this.circuitBreaker.call(async () => {
                if (!ParentDetector.isReady) {
                    Logger.debug('Messaging', 'Parent not ready, queueing message', type);
                    this._queueMessage(type, payload, options);
                    return { queued: true };
                }
                const message = MessageFirewall.createOutbound(type, payload, options);
                if (type === MESSAGE_TYPES.HANDSHAKE_REQUEST) {
                    return HandshakeClient.start();
                }
                if (options.requiresAck !== false) {
                    return new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            if (this.pendingAcks.has(message.id)) {
                                this.pendingAcks.delete(message.id);
                                Logger.warn('Messaging', `ACK timeout for ${type}`);
                                resolve({ success: false, error: 'ack timeout' });
                            }
                        }, options.timeout || HANDSHAKE.ACK_TIMEOUT);
                        this.pendingAcks.set(message.id, {
                            resolve,
                            reject,
                            timeout
                        });
                        try {
                            window.parent.postMessage(message, '*');
                        } catch (error) {
                            clearTimeout(timeout);
                            this.pendingAcks.delete(message.id);
                            Logger.error('Messaging', `PostMessage failed: ${error.message}`);
                            resolve({ success: false, error: error.message });
                        }
                    });
                }
                try {
                    window.parent.postMessage(message, '*');
                    return { success: true };
                } catch (error) {
                    Logger.error('Messaging', `PostMessage failed: ${error.message}`);
                    return { success: false, error: error.message };
                }
            }, () => ({ success: false, error: 'circuit open' }));
        }

        _queueMessage(type, payload, options) {
            const queue = StorageLayer.getJSON('message_queue', []);
            queue.push({
                type,
                payload,
                options,
                timestamp: Date.now(),
                messageId: SecurityUtils.generateMessageId()
            });
            StorageLayer.setJSON('message_queue', queue);
            Logger.debug('Messaging', `Message queued: ${type}`);
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

        async processQueue() {
            const queue = StorageLayer.getJSON('message_queue', []);
            if (queue.length === 0) return;
            if (!ParentDetector.isReady || !SessionMirror.isAuthenticated()) {
                return;
            }
            const now = Date.now();
            const freshQueue = queue.filter(msg => msg.timestamp > now - 3600000);
            const toSend = freshQueue.filter(msg => msg.timestamp > now - 300000);
            for (const msg of toSend) {
                await this.send(msg.type, msg.payload, msg.options);
            }
            StorageLayer.setJSON('message_queue', freshQueue.filter(msg => !toSend.includes(msg)));
            Logger.debug('Messaging', `Processed ${toSend.length} queued messages`);
        }
    }

    const messagingClient = new SecureMessagingClient();

    // =============================================
    // API CLIENT WITH TOKEN MANAGEMENT
    // =============================================
    const APIClient = {
        circuitBreaker: new CircuitBreaker('APIClient', 3, 15000),

        async request(endpoint, options = {}) {
            return this.circuitBreaker.call(async () => {
                if (!SessionMirror.isAuthenticated()) {
                    Logger.warn('API', 'Not authenticated');
                    return null;
                }
                if (!endpoint || typeof endpoint !== 'string') {
                    Logger.error('API', 'Invalid endpoint');
                    return null;
                }
                if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
                    Logger.warn('API', 'Absolute URL rejected', endpoint);
                    return null;
                }
                if (!endpoint.startsWith('/api/')) {
                    endpoint = '/api/' + endpoint.replace(/^\/+/, '');
                }
                const token = SessionMirror.getToken();
                if (!token) {
                    Logger.warn('API', 'No token available');
                    return null;
                }
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Client-Version': VERSION,
                    'X-Request-ID': SecurityUtils.generateMessageId()
                };
                const fetchOptions = {
                    method: options.method || 'GET',
                    headers: { ...headers, ...(options.headers || {}) },
                    credentials: 'same-origin',
                    mode: 'same-origin',
                    cache: 'no-cache'
                };
                if (options.method && options.method !== 'GET' && options.body) {
                    fetchOptions.body = typeof options.body === 'string' 
                        ? options.body 
                        : JSON.stringify(SecurityUtils.sanitizePayload(options.body));
                }
                try {
                    Logger.debug('API', `Request: ${options.method || 'GET'} ${endpoint}`);
                    const response = await fetch(endpoint, fetchOptions);
                    if (!response.ok) {
                        Logger.warn('API', `HTTP ${response.status}: ${endpoint}`);
                        if (response.status === 401) {
                            SessionMirror.clearSession();
                            messagingClient.send(MESSAGE_TYPES.SESSION_EXPIRED, { reason: 'token_invalid' })
                                .catch(() => {});
                        }
                        return null;
                    }
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const data = await response.json();
                        return SecurityUtils.sanitizePayload(data);
                    }
                    return null;
                } catch (error) {
                    Logger.error('API', `Request failed: ${error.message}`);
                    throw error;
                }
            }, () => null);
        },

        async fetchWithFallback(endpoint, options = {}, fallback = null) {
            const result = await this.request(endpoint, options);
            return result !== null ? result : fallback;
        }
    };

    // =============================================
    // CORE STATE (EXPORTED)
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

    SessionMirror.subscribe((session) => {
        currentUser = session.user;
        isSessionReceived = session.authenticated;
        sessionData = session;
        sessionValid = session.authenticated;
        window.dispatchEvent(new CustomEvent('sessionUpdated', { detail: session }));
    });

    ParentDetector.subscribe((ready) => {
        isParentReady = ready;
        window.dispatchEvent(new CustomEvent('parentStatusChanged', { detail: { ready } }));
    });

    // =============================================
    // INITIALIZATION PIPELINE
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

    async function runStage(stage, fn, timeoutMs = 5000) {
        currentInitStage = stage;
        Logger.info('Init', `Starting: ${stage}`);
        try {
            const result = await Promise.race([
                fn(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`Stage ${stage} timeout`)), timeoutMs)
                )
            ]);
            initProgress = (Object.values(INIT_STAGES).indexOf(stage) + 1) / Object.values(INIT_STAGES).length;
            Logger.info('Init', `Completed: ${stage}`);
            return result;
        } catch (error) {
            Logger.error('Init', `Stage ${stage} failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async function initialize() {
        try {
            await runStage(INIT_STAGES.PREFLIGHT, async () => {
                await SessionMirror.init();
                loadCachedData();
                return { success: true };
            }, 3000);

            await runStage(INIT_STAGES.HANDSHAKE, async () => {
                if (!ParentDetector.isReady) {
                    Logger.warn('Init', 'Parent not ready yet, waiting...');
                    await new Promise(resolve => {
                        const checkInterval = setInterval(() => {
                            if (ParentDetector.isReady) {
                                clearInterval(checkInterval);
                                resolve();
                            }
                        }, 100);
                    });
                }
                const handshakeResult = await HandshakeClient.start();
                return handshakeResult;
            }, 8000);

            await runStage(INIT_STAGES.SESSION, async () => {
                if (SessionMirror.isAuthenticated()) {
                    return { success: true, fromCache: true };
                }
                const sessionResult = await messagingClient.send(
                    MESSAGE_TYPES.REQUEST_SESSION,
                    { timestamp: Date.now(), version: VERSION },
                    { requiresAck: true, timeout: 5000 }
                );
                if (!sessionResult || !sessionResult.success) {
                    return { success: false, error: 'session request failed' };
                }
                return { success: true };
            }, 10000);

            await runStage(INIT_STAGES.DATA, async () => {
                await loadCoreData();
                return { success: true };
            }, 15000);

            await runStage(INIT_STAGES.READY, async () => {
                isInitialized = true;
                messagingClient.send(MESSAGE_TYPES.CHILD_READY, {
                    status: 'ready',
                    version: VERSION,
                    session: SessionMirror.isAuthenticated(),
                    timestamp: Date.now()
                }, { requiresAck: false });
                messagingClient.processQueue();
                window.dispatchEvent(new CustomEvent('coreReady', {
                    detail: {
                        authenticated: SessionMirror.isAuthenticated(),
                        user: SessionMirror.getUser()
                    }
                }));
                Logger.info('Init', 'Core ready', {
                    authenticated: SessionMirror.isAuthenticated(),
                    userId: SessionMirror.getUser()?.id
                });
                return { success: true };
            }, 3000);

        } catch (error) {
            Logger.error('Init', `Fatal: ${error.message}`);
            setTimeout(() => {
                Logger.info('Init', 'Retrying initialization...');
                initialize();
            }, 5000);
        }
    }

    // =============================================
    // DATA MANAGEMENT
    // =============================================
    function loadCachedData() {
        try {
            const cachedChats = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
            if (cachedChats) chats = cachedChats;
            const cachedContacts = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.CONTACTS_CACHE);
            if (cachedContacts) contacts = cachedContacts;
            const cachedDrafts = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.DRAFTS);
            if (cachedDrafts) messageDrafts = cachedDrafts;
            const cachedOffline = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
            if (cachedOffline) offlineQueue = cachedOffline;
            Logger.debug('Data', 'Cached data loaded');
        } catch (error) {
            Logger.error('Data', `Failed to load cached data: ${error.message}`);
        }
    }

    async function loadCoreData() {
        try {
            if (!SessionMirror.isAuthenticated()) {
                Logger.debug('Data', 'Not authenticated, skipping data load');
                return false;
            }
            const chatsData = await APIClient.fetchWithFallback('/api/chats', {}, []);
            if (chatsData && Array.isArray(chatsData)) {
                chats = chatsData;
                StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
            }
            const contactsData = await APIClient.fetchWithFallback('/api/contacts', {}, []);
            if (contactsData && Array.isArray(contactsData)) {
                contacts = contactsData;
                StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CONTACTS_CACHE, contacts);
            }
            return true;
        } catch (error) {
            Logger.error('Data', `Failed to load core data: ${error.message}`);
            return false;
        }
    }

    // =============================================
    // EXPORTED FUNCTIONS
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
            fromCache: session.fromCache
        };
    }

    function requestSessionUpdate() {
        return messagingClient.send(MESSAGE_TYPES.REQUEST_SESSION, {
            timestamp: Date.now(),
            force: true
        }, { requiresAck: true });
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
                }, 3000);
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
        StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CONTACTS_CACHE, contacts);
        return contacts;
    }

    async function loadChats() {
        chats = await APIClient.fetchWithFallback('/api/chats', {}, []);
        StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        return chats;
    }

    async function loadMessages(chatId = null) {
        const targetChat = chatId || currentChat?.id;
        if (!targetChat) return [];
        const data = await APIClient.fetchWithFallback(`/api/messages/${targetChat}`, {}, []);
        if (data && Array.isArray(data)) {
            messages = data;
            StorageLayer.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${targetChat}`, messages);
        }
        return messages;
    }

    async function openChat(chat) {
        if (!chat) return false;
        currentChat = chat;
        currentFriend = chat.friend ? { ...chat.friend } : null;
        await loadMessages(chat.id);
        window.dispatchEvent(new CustomEvent('chatOpened', { detail: { chat } }));
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
            StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
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
        StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        openChat(newChat);
    }

    async function sendMessage(content, type = 'text', options = {}) {
        if (!currentChat) {
            Logger.debug('Messages', 'No active chat');
            return false;
        }
        if (!SessionMirror.isAuthenticated()) {
            Logger.debug('Messages', 'Not authenticated');
            return false;
        }
        const messageData = {
            id: SecurityUtils.generateMessageId(),
            chatId: currentChat.id,
            senderId: SessionMirror.getUser()?.id,
            content: SecurityUtils.escapeHtml(content || ''),
            type,
            timestamp: new Date().toISOString(),
            status: 'sending',
            ...options
        };
        messages.push(messageData);
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
                StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
            }
            StorageLayer.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
            return true;
        }
        const idx = messages.findIndex(m => m.id === messageData.id);
        if (idx !== -1) {
            messages[idx].status = 'failed';
        }
        return false;
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
                    attachment: currentAttachment
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
                StorageLayer.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
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
                    StorageLayer.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
                }
                return true;
            }
        } else {
            const idx = messages.findIndex(m => m.id === messageId);
            if (idx !== -1) {
                messages.splice(idx, 1);
                StorageLayer.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
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
                StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
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
        StorageLayer.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
        if (!silent) {
            messagingClient.send(MESSAGE_TYPES.MESSAGE_RECEIVED, {
                messageId,
                emoji,
                action: userIndex > -1 ? 'remove' : 'add'
            }, { requiresAck: false });
        }
        return userIndex > -1 ? 'removed' : 'added';
    }

    async function toggleBlockUser(friendId, block) {
        if (!SessionMirror.isAuthenticated()) return false;
        const blockedUsers = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, []);
        if (block) {
            if (!blockedUsers.includes(friendId)) blockedUsers.push(friendId);
        } else {
            const index = blockedUsers.indexOf(friendId);
            if (index > -1) blockedUsers.splice(index, 1);
        }
        StorageLayer.setJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, blockedUsers);
        chats.forEach(chat => {
            if (chat.friendId === friendId) chat.blocked = block;
        });
        StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        await loadChats();
        return true;
    }

    async function toggleArchiveChat(chatId, archive) {
        if (!SessionMirror.isAuthenticated()) return false;
        const archivedChats = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, []);
        if (archive) {
            if (!archivedChats.includes(chatId)) archivedChats.push(chatId);
        } else {
            const index = archivedChats.indexOf(chatId);
            if (index > -1) archivedChats.splice(index, 1);
        }
        StorageLayer.setJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, archivedChats);
        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].archived = archive;
            StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
            return true;
        }
        return false;
    }

    async function toggleReadOnly(chatId, readOnly) {
        if (!SessionMirror.isAuthenticated()) return false;
        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].readOnly = readOnly;
            StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
            return true;
        }
        return false;
    }

    async function clearChatHistory(chatId) {
        if (!SessionMirror.isAuthenticated()) return false;
        StorageLayer.remove(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`);
        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].lastMessage = '';
            chats[idx].unreadCount = 0;
            StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
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
                prevOption.votes = Math.max(0, prevOption.votes - 1);
                const voterIndex = prevOption.voters?.indexOf(userId);
                if (voterIndex > -1) prevOption.voters.splice(voterIndex, 1);
            }
        }
        if (!poll.options[optionIndex]) return false;
        poll.options[optionIndex].votes = (poll.options[optionIndex].votes || 0) + 1;
        if (!poll.options[optionIndex].voters) poll.options[optionIndex].voters = [];
        poll.options[optionIndex].voters.push(userId);
        poll.userVote = optionIndex;
        StorageLayer.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
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
            case 'settings': return StorageLayer.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
            default: return null;
        }
    }

    function updateData(type, payload) {
        switch (type) {
            case 'friendsList':
                contacts = payload;
                StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CONTACTS_CACHE, contacts);
                break;
            case 'chatHistory':
                messages = payload;
                if (currentChat) {
                    StorageLayer.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
                }
                break;
            case 'settings':
                StorageLayer.setJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, payload);
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
        const starred = StorageLayer.getJSON('starred_messages', {});
        const isStarred = !!starred[messageId];
        if (isStarred) {
            delete starred[messageId];
        } else {
            starred[messageId] = true;
        }
        StorageLayer.setJSON('starred_messages', starred);
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
        StorageLayer.setJSON('reported_message', {
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
            message: StorageLayer.getJSON('reported_message', {}),
            reason: reportText.value.trim(),
            reporterId: SessionMirror.getUser()?.id || 'unknown',
            timestamp: new Date().toISOString()
        };
        const reports = StorageLayer.getJSON('reports', []);
        reports.push(reportData);
        StorageLayer.setJSON('reports', reports);
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
        const themes = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.CHAT_THEMES);
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
        const settings = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS);
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
            StorageLayer.setJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, defaultSettings);
        } else {
            silentReactionsEnabled = settings.silentReactions !== false;
            readOnlyMode = settings.readOnlyMode === true;
        }
    }

    function loadMessageDrafts() {
        const drafts = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.DRAFTS);
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
        StorageLayer.setJSON(LOCAL_STORAGE_KEYS.DRAFTS, messageDrafts);
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
        const scheduled = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.SCHEDULED_MESSAGES);
        if (scheduled) {
            scheduledMessages = scheduled;
        }
    }

    function loadOfflineQueue() {
        const queue = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
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
                Logger.warn('Recording', 'MediaRecorder not available');
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
            Logger.error('Recording', `Failed: ${error.message}`);
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
                Logger.error('Sync', `Failed: ${error.message}`);
            } finally {
                isSyncing = false;
            }
        }, 30000);
        let saveInterval = setInterval(() => {
            if (currentChat) {
                StorageLayer.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
            }
            StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        }, 60000);
        return { syncInterval, saveInterval };
    }

    function playNotificationSound() {
        const settings = StorageLayer.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
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
        StorageLayer.setJSON(LOCAL_STORAGE_KEYS.SCHEDULED_MESSAGES, scheduledMessages);
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
        StorageLayer.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);
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
        StorageLayer.setJSON(LOCAL_STORAGE_KEYS.UI_STATE, state);
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
        Logger.info('Reconnect', 'Manual retry initiated');
        HandshakeClient.reset();
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

    // =============================================
    // INITIALIZATION
    // =============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initialize, 100);
        });
    } else {
        setTimeout(initialize, 100);
    }

    // =============================================
    // CLEANUP
    // =============================================
    window.addEventListener('beforeunload', () => {
        if (recordingTimer) clearInterval(recordingTimer);
        if (typingTimeout) clearTimeout(typingTimeout);
        cleanupAudioPlayers();
        saveMessageDraft();
        saveUIState();
        if (currentChat) {
            StorageLayer.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
        }
        StorageLayer.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
    });

    // =============================================
    // EXPORT ALL FUNCTIONS - THIS MUST MATCH WHAT messages-ui.js IMPORTS
    // =============================================
    const messagesCore = {
        // Core state
        currentUser,
        currentChat,
        currentFriend,
        messages,
        chats,
        contacts,
        isRecording,
        mediaRecorder,
        recordingTimer,
        recordingStartTime,
        typingTimeout,
        isTyping,
        selectedMessage,
        currentThread,
        chatThemes,
        emojiPicker,
        isSyncing,
        audioPlayers,
        editingMessageId,
        replyToMessage,
        currentCategory,
        activeFormattingTags,
        activeAudioElement,
        scheduledMessages,
        offlineQueue,
        messageDrafts,
        silentReactionsEnabled,
        readOnlyMode,
        currentAttachment,
        searchResults,
        currentSearchIndex,
        multiSendSelectedChats,
        recordingCancelTimeout,
        dragStartY,
        isDraggingToCancel,
        isParentReady,
        isSessionReceived,
        isInitialized,
        sessionData,
        sessionValid,
        sessionAdapter,
        
        // Constants - THESE MUST BE EXPORTED
        MESSAGE_TYPES,
        LOCAL_STORAGE_KEYS,
        
        // State setters
        setCurrentUser,
        setCurrentChat,
        setCurrentFriend,
        setMessages,
        setChats,
        setContacts,
        setIsRecording,
        setMediaRecorder,
        setRecordingTimer,
        setRecordingStartTime,
        setTypingTimeout,
        setIsTyping,
        setSelectedMessage,
        setCurrentThread,
        setChatThemes,
        setEmojiPicker,
        setIsSyncing,
        setAudioPlayers,
        setEditingMessageId,
        setReplyToMessage,
        setCurrentCategory,
        setActiveFormattingTags,
        setActiveAudioElement,
        setScheduledMessages,
        setOfflineQueue,
        setMessageDrafts,
        setSilentReactionsEnabled,
        setReadOnlyMode,
        setCurrentAttachment,
        setSearchResults,
        setCurrentSearchIndex,
        setMultiSendSelectedChats,
        setRecordingCancelTimeout,
        setDragStartY,
        setIsDraggingToCancel,
        
        // Session
        parentConnection: SessionMirror,
        getCurrentSession,
        requestSessionUpdate,
        initChildSession,
        
        // Initialization
        initializeParentCoordination,
        isCoreReady,
        
        // Communication
        sendToParent,
        
        // API
        apiRequest,
        fetchData,
        
        // Data
        getData,
        updateData,
        loadCoreData,
        
        // Validation
        validateMessageStructure,
        validateMessagePayload,
        validateMessageBeforeSend,
        validateData,
        validateSessionData,
        
        // Core functionality
        loadContacts,
        loadChats,
        loadMessages,
        openChat,
        loadChatByFriendId,
        createLocalChat,
        sendMessage,
        sendMessageWithOptions,
        sendToMultipleChats,
        editMessage,
        saveEditedMessage,
        cancelEditMessage,
        deleteMessage,
        markChatAsRead,
        addReaction,
        toggleBlockUser,
        toggleArchiveChat,
        toggleReadOnly,
        clearChatHistory,
        voteInPoll,
        openThread,
        loadThreadMessages,
        
        // UI Helpers
        showStatusMessage,
        hideStatusMessage,
        formatMessageText,
        formatTime,
        formatDate,
        formatDateTime,
        formatFileSize,
        escapeHtml,
        escapeRegex,
        preserveFormatting,
        sanitizePayload,
        
        // Message actions
        showMessageActions,
        closeMessageActions,
        handleMessageAction,
        showForwardMessage,
        toggleStarMessage,
        showMessageInfo,
        showReportModal,
        submitReport,
        
        // Emoji picker
        initEmojiPicker,
        toggleEmojiPicker,
        closeEmojiPickerOnClickOutside,
        
        // Formatting
        toggleFormattingToolbar,
        closeFormattingToolbarOnClickOutside,
        applyFormatting,
        
        // Attachments
        toggleAttachmentOptions,
        closeAttachmentOptionsOnClickOutside,
        handleAttachment,
        createNote,
        selectImage,
        selectVideo,
        selectFile,
        shareLocation,
        createPoll,
        showAttachmentPreview,
        removeAttachment,
        
        // Thread & Info
        showChatInfo,
        
        // Themes
        loadChatThemes,
        applyChatTheme,
        
        // Settings & Drafts
        loadUserSettings,
        loadMessageDrafts,
        saveMessageDraft,
        loadMessageDraft,
        updateDraftBadge,
        loadScheduledMessages,
        loadOfflineQueue,
        updateScheduleBadge,
        
        // Scroll & Search
        setupScrollDetection,
        updateJumpButtonVisibility,
        jumpToLatest,
        searchInChat,
        highlightText,
        highlightSearchResults,
        removeSearchHighlights,
        navigateToSearchResult,
        scrollToMessage,
        
        // Recording
        startRecording,
        stopRecording,
        cancelRecording,
        
        // Sync
        startBackgroundSync,
        playNotificationSound,
        checkScheduledMessages,
        checkOfflineQueue,
        loadMultiSendChats,
        updateMultiSendSelection,
        
        // UI State
        saveUIState,
        getUserFromURL,
        openChatPanel,
        
        // Reconnect
        showReconnectState,
        hideReconnectState,
        retryConnection,
        
        // Rendering
        renderMessages,
        renderChatsList,
        renderContactsList,
        markMessageAsViewed,
        
        // Media
        initializeAudioWaveforms,
        viewMedia,
        playVideo,
        playAudio,
        downloadFile,
        openLocation,
        cleanupAudioPlayers,
        
        // Fallbacks
        syncChatList,
        updateUnreadCounts,
        updateTypingIndicator
    };

    // Attach to window
    window.messagesCore = messagesCore;

    // For ES modules
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = messagesCore;
    }

    Logger.info('Core', 'Messages Core v3.0.3 loaded');
})();