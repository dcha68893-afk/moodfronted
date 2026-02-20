// =============================================
// MESSAGES-CORE.js - PASSIVE IFRAME MODULE v3.5.1
// PARENT-CONTROLLED LIFECYCLE
// NO INDEPENDENT HANDSHAKE - NO RETRY LOOPS - NO RECOVERY
// WITH MESSAGE LIFECYCLE STATE & VISIBLE FAILURES
// =============================================

(function() {
    'use strict';

    // =============================================
    // CONSTANTS & CONFIGURATION
    // =============================================
    const VERSION = '3.5.1';
    const APP_NAME = 'kynecta-messages';
    const SOURCE_IFRAME = 'iframe';
    const FRAME_ID = 'messagesIframe';
    
    const PROTOCOL = {
        VERSION: 'KYN-2.0'
    };

    const MESSAGE_TYPES = {
        // Registration
        IFRAME_REGISTERED: 'IFRAME_REGISTERED',
        PARENT_READY: 'PARENT_READY',
        CHILD_READY: 'CHILD_READY',
        REGISTRATION_ACK: 'REGISTRATION_ACK',
        
        // Session
        SESSION_INIT: 'SESSION_INIT',
        SESSION_UPDATE: 'SESSION_UPDATE',
        SESSION_SYNC: 'SESSION_SYNC',
        SESSION_DATA: 'SESSION_DATA',
        SESSION_ACK: 'SESSION_ACK',
        REQUEST_SESSION: 'REQUEST_SESSION',
        SESSION_EXPIRED: 'SESSION_EXPIRED',
        
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
        HEARTBEAT: 'HEARTBEAT',
        HEARTBEAT_ACK: 'HEARTBEAT_ACK',
        PAGE_ACTIVATED: 'PAGE_ACTIVATED',
        FORCE_RELOAD: 'FORCE_RELOAD',
        MESSAGES_STATUS_WARNING: 'MESSAGES_STATUS_WARNING',
        LOGOUT: 'LOGOUT',
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
        MESSAGE_QUEUE: 'kynecta_message_queue'
    };

    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4
    };

    const CURRENT_LOG_LEVEL = LOG_LEVELS.NONE;

    // Heartbeat configuration
    const HEARTBEAT = {
        failures: 0,
        maxFailures: 3,
        lastHeartbeat: 0,
        interval: null
    };

    // Registration state
    let registrationSent = false;
    let parentReady = false;
    let parentOrigin = window.location.origin;

    // =============================================
    // STATUS INDICATOR - SINGLE STATUS, NO REPEATS
    // =============================================
    const StatusIndicator = {
        currentStatus: null,
        statusMap: {
            'INIT': '🚀',
            'SENDING': '📤',
            'WAITING': '⏳',
            'SUCCESS': '✅',
            'FAILED': '❌',
            'READY': '🔵',
            'WARNING': '⚠️',
            'DISCONNECTED': '🔴'
        },
        
        show(status) {
            if (!this.statusMap[status]) return;
            if (this.currentStatus === status) return;
            
            this.currentStatus = status;
            const emoji = this.statusMap[status];
            console.log(`${emoji} ${status} ${emoji}`);
            
            window.dispatchEvent(new CustomEvent('statusChange', {
                detail: { status, emoji }
            }));
        },
        
        reset() {
            this.currentStatus = null;
        }
    };

    // Show INIT once at start
    StatusIndicator.show('INIT');

    // =============================================
    // SAFE STORAGE LAYER
    // =============================================
    const SafeStorage = {
        memoryStore: new Map(),
        storageAvailable: false,
        quotaExceeded: false,
        
        init() {
            this._checkStorage();
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
        
        get(key, fallback = null) {
            if (this.storageAvailable && !this.quotaExceeded) {
                try {
                    const value = localStorage.getItem(key);
                    if (value !== null) return value;
                } catch (e) {}
            }
            
            if (this.memoryStore.has(key)) {
                return this.memoryStore.get(key);
            }
            
            return fallback;
        },
        
        set(key, value) {
            this.memoryStore.set(key, value);
            
            if (this.storageAvailable && !this.quotaExceeded) {
                try {
                    localStorage.setItem(key, String(value));
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
        
        getJSON(key, fallback = null) {
            const value = this.get(key, null);
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
            if (this.storageAvailable) {
                try {
                    localStorage.clear();
                } catch (e) {}
            }
            this.memoryStore.clear();
        }
    }.init();

    // =============================================
    // SECURITY & VALIDATION UTILITIES
    // =============================================
    const SecurityUtils = {
        allowedOrigins: new Set([
            window.location.origin,
            'https://moodchat-fy56.onrender.com',
            'https://moodfronted.onrender.com'
        ]),

        messageIdCounter: 0,
        replayWindow: 300000,
        replayCache: new Map(),
        maxReplayEntries: 1000,

        initOriginTrust() {
            const hostname = window.location.hostname;
            this.allowedOrigins.add(`https://${hostname}`);
            this.allowedOrigins.add(`http://${hostname}`);
            this.allowedOrigins.add(window.location.origin);
            
            if (hostname.endsWith('.onrender.com')) {
                this.allowedOrigins.add(`https://${hostname}`);
            }
        },

        validateOrigin(origin) {
            if (!origin || origin === 'null') return true;
            if (this.allowedOrigins.has(origin)) return true;
            return origin === window.location.origin;
        },

        validateMessageStructure(data) {
            if (!data || typeof data !== 'object') return false;
            if (!data.type || typeof data.type !== 'string') return false;
            return true;
        },

        generateMessageId() {
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 10);
            const counter = (this.messageIdCounter++ % 1000).toString(36);
            return `msg_${timestamp}_${random}_${counter}`;
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
                .replace(/onload/gi, 'data-onload')
                .replace(/onerror/gi, 'data-onerror')
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

        checkReplay(messageId, timestamp) {
            if (!messageId) return false;
            
            const now = Date.now();
            const age = now - timestamp;
            
            if (age > this.replayWindow) return true;
            if (timestamp > now + 120000) return true;
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

        isForThisFrame(message) {
            const targetFrame = message.target || message.frameId;
            return !targetFrame || targetFrame === 'iframe' || targetFrame === FRAME_ID;
        }
    };

    SecurityUtils.initOriginTrust();

    // =============================================
    // DIAGNOSTICS AGENT
    // =============================================
    const DiagnosticsAgent = {
        enabled: false,
        metrics: {
            messagesSent: 0,
            messagesReceived: 0,
            acksReceived: 0,
            acksSent: 0,
            errors: [],
            startTime: Date.now(),
            pingRtt: [],
            sessionRefreshes: 0,
            cacheHits: 0,
            cacheMisses: 0
        },
        loggedErrors: new Set(),
        
        init(enabled = false) {
            this.enabled = enabled && (window.location.hostname === 'localhost' || 
                                       window.location.hostname === '127.0.0.1' ||
                                       window.__IFRAME_DEBUG__ === true);
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
                acksReceived: 0,
                acksSent: 0,
                errors: [],
                startTime: Date.now(),
                pingRtt: [],
                sessionRefreshes: 0,
                cacheHits: 0,
                cacheMisses: 0
            };
            this.loggedErrors.clear();
        }
    };

    // =============================================
    // SILENT LOGGER
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
        },

        info(module, message, data = null) {
            if (!this._shouldLog(LOG_LEVELS.INFO, message)) return;
        },

        warn(module, message, data = null) {
            if (!this._shouldLog(LOG_LEVELS.WARN, message)) return;
        },

        error(module, message, data = null) {
            if (!this._shouldLog(LOG_LEVELS.ERROR, message)) return;
        }
    };

    // =============================================
    // MESSAGE LIFECYCLE MANAGER
    // =============================================
    const MessageLifecycle = {
        TIMEOUT_DURATION: 7000,
        MAX_RETRIES: 2,
        pendingMessages: new Map(),

        createMessage(messageData) {
            return {
                id: messageData.id,
                status: "sending",
                reason: null,
                timestamp: Date.now(),
                retryCount: 0,
                timeoutRef: null,
                ...messageData
            };
        },

        startTracking(message, sendFn) {
            const messageId = message.id;
            
            const timeoutRef = setTimeout(() => {
                this.handleTimeout(messageId);
            }, this.TIMEOUT_DURATION);

            message.timeoutRef = timeoutRef;
            this.pendingMessages.set(messageId, { message, sendFn });
            return message;
        },

        handleAck(messageId) {
            const pending = this.pendingMessages.get(messageId);
            if (pending) {
                clearTimeout(pending.message.timeoutRef);
                pending.message.status = "delivered";
                pending.message.reason = null;
                this.updateMessageUI(pending.message);
                this.pendingMessages.delete(messageId);
            }
        },

        handleTimeout(messageId) {
            const pending = this.pendingMessages.get(messageId);
            if (!pending) return;

            const message = pending.message;
            
            if (!SessionMirror || !SessionMirror.isAuthenticated()) {
                message.reason = "Session not available";
            } else if (!navigator.onLine) {
                message.reason = "No internet connection";
            } else if (!ParentDetector || !ParentDetector.isReady) {
                message.reason = "Connection not established";
            } else {
                message.reason = "Recipient not responding";
            }

            if (message.retryCount < this.MAX_RETRIES) {
                message.retryCount++;
                message.status = "sending";
                message.reason = null;
                
                clearTimeout(message.timeoutRef);
                
                try {
                    pending.sendFn();
                    message.timeoutRef = setTimeout(() => {
                        this.handleTimeout(messageId);
                    }, this.TIMEOUT_DURATION);
                    return;
                } catch (e) {}
            }

            message.status = "failed";
            if (!message.reason) {
                message.reason = "Message delivery failed after retries";
            }
            
            clearTimeout(message.timeoutRef);
            this.updateMessageUI(message);
            this.pendingMessages.delete(messageId);
        },

        updateMessageUI(message) {
            const index = messages.findIndex(m => m.id === message.id);
            if (index !== -1) {
                messages[index] = { ...messages[index], ...message };
                
                window.dispatchEvent(new CustomEvent('messageStatusChanged', {
                    detail: { message: messages[index] }
                }));
            }
        },

        isReadyToSend() {
            if (!SessionMirror || !SessionMirror.isAuthenticated()) {
                return { ready: false, reason: "Session not initialized" };
            }
            if (!ParentDetector || !ParentDetector.isReady) {
                return { ready: false, reason: "Connection not ready" };
            }
            if (!navigator.onLine) {
                return { ready: false, reason: "No internet connection" };
            }
            return { ready: true };
        }
    };

    // =============================================
    // MESSAGE TRANSPORT LAYER - WITH LIFECYCLE
    // =============================================
    const MessageTransport = {
        pendingAcks: new Map(),
        messageQueue: [],
        sequenceNumber: 0,
        outboundMessages: new Map(),
        maxRetries: 0,
        maxQueueSize: 100,
        
        init() {
            return this;
        },
        
        send(type, payload = {}, options = {}) {
            const messageId = options.messageId || SecurityUtils.generateMessageId();
            const timestamp = Date.now();

            const readyCheck = MessageLifecycle.isReadyToSend();
            if (!readyCheck.ready) {
                const failedMessage = {
                    id: messageId,
                    status: "failed",
                    reason: readyCheck.reason,
                    timestamp,
                    type,
                    payload
                };
                MessageLifecycle.updateMessageUI(failedMessage);
                return Promise.resolve({ 
                    success: false, 
                    error: readyCheck.reason,
                    messageId,
                    status: "failed",
                    reason: readyCheck.reason
                });
            }
            
            const message = {
                protocol: PROTOCOL.VERSION,
                messageId: messageId,
                type: type,
                source: SOURCE_IFRAME,
                target: 'parent',
                frameId: FRAME_ID,
                timestamp: timestamp,
                payload: SecurityUtils.sanitizePayload(payload),
                app: APP_NAME,
                version: VERSION,
                requiresAck: options.requiresAck !== false,
                sequence: ++this.sequenceNumber
            };

            return this._postMessage(message, options);
        },
        
        _postMessage(message, options = {}) {
            const targetOrigin = options.targetOrigin || parentOrigin;
            const requiresAck = options.requiresAck !== false;
            
            return new Promise((resolve) => {
                if (!window.parent || window.parent === window) {
                    this._queueMessage(message, requiresAck, resolve);
                    return;
                }

                if (requiresAck) {
                    const lifecycleMessage = MessageLifecycle.createMessage({
                        id: message.messageId,
                        type: message.type,
                        payload: message.payload,
                        timestamp: message.timestamp
                    });

                    MessageLifecycle.startTracking(lifecycleMessage, () => {
                        this._sendWithAck(message, targetOrigin, resolve, true);
                    });

                    this._sendWithAck(message, targetOrigin, resolve, false);
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
        
        _sendWithAck(message, targetOrigin, resolve, isRetry = false) {
            const messageId = message.messageId;
            
            StatusIndicator.show('SENDING');
            
            const timer = setTimeout(() => {
                const pending = this.pendingAcks.get(messageId);
                if (pending) {
                    this.pendingAcks.delete(messageId);
                    this.outboundMessages.delete(messageId);
                    
                    if (!isRetry) {
                        MessageLifecycle.handleTimeout(messageId);
                    }
                    
                    StatusIndicator.show('FAILED');
                    resolve({ 
                        success: false, 
                        error: 'timeout', 
                        messageId,
                        status: 'failed',
                        reason: 'Recipient not responding'
                    });
                }
            }, MessageLifecycle.TIMEOUT_DURATION);

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
                
                if (!isRetry) {
                    MessageLifecycle.handleTimeout(messageId);
                }
                
                this._queueMessage(message, true, resolve);
            }
        },
        
        _queueMessage(message, requiresAck, resolve) {
            if (this.messageQueue.length >= this.maxQueueSize) {
                resolve({ 
                    success: false, 
                    error: 'queue_full', 
                    messageId: message.messageId,
                    status: 'failed',
                    reason: 'Message queue full'
                });
                return;
            }

            this.messageQueue.push({
                message,
                requiresAck,
                timestamp: Date.now(),
                messageId: message.messageId,
                resolve
            });
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MESSAGE_QUEUE, this.messageQueue);
        },
        
        handleAck(ackMessage) {
            const originalId = ackMessage.payload?.messageId || ackMessage.payload?.originalId;
            if (!originalId) return false;

            MessageLifecycle.handleAck(originalId);

            const pending = this.pendingAcks.get(originalId);
            if (pending) {
                clearTimeout(pending.timer);
                this.pendingAcks.delete(originalId);
                this.outboundMessages.delete(originalId);
                
                StatusIndicator.show('SUCCESS');
                
                pending.resolve({ 
                    success: true, 
                    ack: ackMessage.payload,
                    receivedAt: Date.now(),
                    status: 'delivered'
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
            
            const freshQueue = this.messageQueue.filter(msg => msg.timestamp > now - oneHour);

            for (const queued of freshQueue) {
                try {
                    await this._postMessage(
                        queued.message,
                        { requiresAck: queued.requiresAck }
                    );
                    
                    const index = freshQueue.findIndex(q => q.messageId === queued.messageId);
                    if (index !== -1) freshQueue.splice(index, 1);
                } catch (error) {}
            }

            this.messageQueue = freshQueue;
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
                MessageLifecycle.pendingMessages.delete(messageId);
            } else {
                for (const [_, pending] of this.pendingAcks) {
                    clearTimeout(pending.timer);
                }
                this.pendingAcks.clear();
                this.outboundMessages.clear();
                MessageLifecycle.pendingMessages.clear();
            }
        },
        
        getStats() {
            return {
                pendingAcks: this.pendingAcks.size,
                queuedMessages: this.messageQueue.length,
                outboundMessages: this.outboundMessages.size,
                sequenceNumber: this.sequenceNumber,
                pendingLifecycle: MessageLifecycle.pendingMessages.size
            };
        }
    }.init();

    // =============================================
    // MESSAGE FIREWALL
    // =============================================
    const MessageFirewall = {
        processedMessages: new Set(),
        messageSequence: 0,
        transport: MessageTransport,

        validate(event) {
            if (!SecurityUtils.validateOrigin(event.origin)) return false;
            if (!event.source || event.source === window) return false;
            if (!SecurityUtils.validateMessageStructure(event.data)) return false;

            const data = event.data;
            if (!SecurityUtils.isForThisFrame(data)) return false;

            const messageId = data.messageId || data.id;
            if (messageId && SecurityUtils.checkReplay(messageId, data.timestamp || 0)) return false;
            if (messageId && this.processedMessages.has(messageId)) return false;

            if (messageId) {
                this.processedMessages.add(messageId);
                setTimeout(() => this.processedMessages.delete(messageId), 60000);
            }

            return true;
        },

        parse(event) {
            if (!this.validate(event)) return null;

            const data = event.data;
            
            if (data.protocol === PROTOCOL.VERSION) {
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

            if (data.type === MESSAGE_TYPES.ACK || data.type === MESSAGE_TYPES.HEARTBEAT_ACK) {
                this.transport.handleAck(data);
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

            if (data.type === MESSAGE_TYPES.ACK || data.type === MESSAGE_TYPES.HEARTBEAT_ACK) {
                this.transport.handleAck(data);
            }

            return canonical;
        },

        createOutbound(type, payload = {}, options = {}) {
            const messageId = options.messageId || SecurityUtils.generateMessageId();
            const timestamp = Date.now();
            
            const message = {
                protocol: PROTOCOL.VERSION,
                messageId,
                type,
                source: SOURCE_IFRAME,
                target: 'parent',
                frameId: FRAME_ID,
                timestamp,
                payload: SecurityUtils.sanitizePayload(payload),
                app: APP_NAME,
                version: VERSION,
                requiresAck: options.requiresAck !== false,
                sequence: ++this.messageSequence
            };

            return message;
        },

        send(type, payload = {}, options = {}) {
            if (options.requiresAck !== false) {
                StatusIndicator.show('SENDING');
            }
            return this.transport.send(type, payload, options);
        },

        processQueue() {
            return this.transport.processQueue();
        },

        getStats() {
            return {
                processedMessages: this.processedMessages.size,
                messageSequence: this.messageSequence,
                transport: this.transport.getStats()
            };
        }
    };

    // =============================================
    // SINGLE PASSIVE REGISTRATION
    // =============================================
    function registerWithParent() {
        if (registrationSent) return;
        if (!window.parent || window.parent === window) {
            return;
        }

        registrationSent = true;
        parentOrigin = window.location.origin;

        try {
            window.parent.postMessage({
                type: MESSAGE_TYPES.IFRAME_REGISTERED,
                module: "messages",
                frameId: FRAME_ID,
                version: VERSION,
                timestamp: Date.now()
            }, parentOrigin);
        } catch (e) {
            registrationSent = false;
        }
    }

    // =============================================
    // PARENT DETECTOR & HEARTBEAT
    // =============================================
    const ParentDetector = {
        isReady: false,
        pingInterval: null,
        lastPong: 0,
        listeners: new Set(),
        pingIntervalMs: 15000,
        connectionQuality: 'unknown',
        lastPingTime: 0,
        heartbeatEnabled: true,
        lastWarningTime: 0,
        lastDisconnectTime: 0,

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
                StatusIndicator.show('READY');
                this._notifyListeners();
            } else {
                StatusIndicator.show('DISCONNECTED');
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
            if (!this.heartbeatEnabled) return;
            
            try {
                this.lastPingTime = Date.now();
                
                const message = {
                    protocol: PROTOCOL.VERSION,
                    type: MESSAGE_TYPES.HEARTBEAT,
                    source: SOURCE_IFRAME,
                    target: 'parent',
                    frameId: FRAME_ID,
                    messageId: SecurityUtils.generateMessageId(),
                    timestamp: this.lastPingTime,
                    payload: { 
                        timestamp: this.lastPingTime,
                        frameId: FRAME_ID
                    }
                };
                
                window.parent.postMessage(message, parentOrigin);
                
            } catch (e) {}
        },

        handleHeartbeatAck(ackMessage) {
            const now = Date.now();
            const rtt = now - (ackMessage.payload?.timestamp || this.lastPingTime || now);
            
            this.lastPong = now;
            HEARTBEAT.failures = 0;
            HEARTBEAT.lastHeartbeat = now;
            
            if (!this.isReady) {
                this.isReady = true;
                StatusIndicator.show('READY');
                this._notifyListeners();
            }
            
            DiagnosticsAgent.recordPingRtt(rtt);
        },

        handlePong(pongMessage) {
            const now = Date.now();
            const rtt = now - (pongMessage.payload?.timestamp || this.lastPingTime || now);
            
            this.lastPong = now;
            HEARTBEAT.failures = 0;
            HEARTBEAT.lastHeartbeat = now;
            
            if (!this.isReady) {
                this.isReady = true;
                StatusIndicator.show('READY');
                this._notifyListeners();
            }
            
            DiagnosticsAgent.recordPingRtt(rtt);
        },

        handleHeartbeatMiss() {
            HEARTBEAT.failures++;
            HEARTBEAT.lastHeartbeat = Date.now();

            if (HEARTBEAT.failures < HEARTBEAT.maxFailures) {
                const now = Date.now();
                if (now - this.lastWarningTime > 30000) {
                    StatusIndicator.show('WARNING');
                    this.lastWarningTime = now;
                }
                return;
            }

            if (HEARTBEAT.failures === HEARTBEAT.maxFailures) {
                const now = Date.now();
                if (now - this.lastDisconnectTime > 60000) {
                    StatusIndicator.show('DISCONNECTED');
                    this.lastDisconnectTime = now;
                }
                this._requestStatusRefresh();
            }
        },

        _requestStatusRefresh() {
            if (!window.parent || window.parent === window) return;

            try {
                window.parent.postMessage({
                    type: MESSAGE_TYPES.MESSAGES_STATUS_WARNING,
                    severity: "soft",
                    frameId: FRAME_ID,
                    timestamp: Date.now()
                }, parentOrigin);
            } catch (e) {}
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
                lastPong: this.lastPong
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
                heartbeatFailures: HEARTBEAT.failures
            };
        },

        destroy() {
            if (this.pingInterval) clearInterval(this.pingInterval);
            this.listeners.clear();
        }
    }.init();

    // =============================================
    // SESSION MIRROR
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

        init() {
            if (this._initPromise) return this._initPromise;
            
            this._initPromise = new Promise((resolve) => {
                const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE);
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

        acceptSession(snapshot) {
            if (!snapshot || typeof snapshot !== 'object') return false;

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
                version: snapshot.version || VERSION,
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
            });

            if (this._state.user) {
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._state.user);
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
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._state.user);
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
                });
                
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
                        MESSAGE_TYPES.SESSION_SYNC,
                        { 
                            timestamp: Date.now(),
                            frameId: FRAME_ID,
                            sessionId: this._state.sessionId
                        },
                        { requiresAck: true, timeout: 5000 }
                    );
                    
                    if (message) {
                        window.parent.postMessage(message, parentOrigin);
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

        getTimeUntilExpiry() {
            if (!this._state.authenticated) return 0;
            return Math.max(0, this._state.expiresAt - Date.now());
        },

        isExpiringSoon(threshold = 300000) {
            return this._state.authenticated && this.getTimeUntilExpiry() < threshold;
        }
    };

    // =============================================
    // SESSION CLIENT - PASSIVE
    // =============================================
    const SessionClient = {
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
            
            if (!window.parent || window.parent === window) return false;

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
                MESSAGE_TYPES.SESSION_SYNC,
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
    // MESSAGING CLIENT
    // =============================================
    class MessagingClient {
        constructor() {
            this.listeners = new Map();
            this.parentDetector = ParentDetector;
            this.sessionMirror = SessionMirror;
            this.sessionClient = SessionClient;
            this.messageFirewall = MessageFirewall;
            this.transport = MessageTransport;
            this._pendingPromises = new Map();
            this._initMessageListener();
            this._initVisibilityHandler();
            this._initNetworkHandler();
            this._initHeartbeatMonitor();
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

        _initHeartbeatMonitor() {
            setInterval(() => {
                const now = Date.now();
                if (HEARTBEAT.lastHeartbeat > 0 && 
                    now - HEARTBEAT.lastHeartbeat > 20000 && 
                    HEARTBEAT.failures < HEARTBEAT.maxFailures) {
                    ParentDetector.handleHeartbeatMiss();
                }
            }, 10000);
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
            try {
                if (!SecurityUtils.validateOrigin(event.origin)) return;
                if (event.origin !== window.location.origin) return;
                if (!event.data || typeof event.data !== 'object') return;

                const message = this.messageFirewall.parse(event);
                if (!message) return;

                DiagnosticsAgent.increment('messagesReceived');

                if (message.type === MESSAGE_TYPES.ACK || message.type === MESSAGE_TYPES.HEARTBEAT_ACK) {
                    this.transport.handleAck(message);
                }

                switch (message.type) {
                    case MESSAGE_TYPES.PONG:
                    case MESSAGE_TYPES.HEARTBEAT_ACK:
                        ParentDetector.handleHeartbeatAck(message);
                        return;

                    case MESSAGE_TYPES.PARENT_READY:
                        parentReady = true;
                        ParentDetector.isReady = true;
                        StatusIndicator.show('READY');
                        ParentDetector._notifyListeners();
                        SecurityUtils.allowedOrigins.add(event.origin);
                        return;

                    case MESSAGE_TYPES.REGISTRATION_ACK:
                        return;

                    case MESSAGE_TYPES.SESSION_DATA:
                    case MESSAGE_TYPES.SESSION_INIT:
                        this.sessionClient.handleSessionData(message);
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
            } catch (e) {}
        }

        async send(type, payload = {}, options = {}) {
            try {
                const result = await this.transport.send(type, payload, options);
                if (result.success) {
                    DiagnosticsAgent.increment('messagesSent');
                }
                return result;
            } catch (error) {
                return { success: false, error: error.message };
            }
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
            return {
                parentReady: ParentDetector.isReady,
                connectionQuality: ParentDetector.connectionQuality,
                sessionValid: SessionMirror.isAuthenticated(),
                heartbeatFailures: HEARTBEAT.failures,
                uptime: DiagnosticsAgent.getUptime()
            };
        }

        reset() {
            this._pendingPromises.clear();
        }
    }

    const messagingClient = new MessagingClient();

    // =============================================
    // SAFE FETCH UTILITY
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
    // API CLIENT
    // =============================================
    const APIClient = {
        pendingRequests: new Map(),
        baseUrl: '',
        defaultTimeout: 30000,

        setBaseUrl(url) {
            this.baseUrl = url;
        },

        async request(endpoint, options = {}) {
            try {
                if (!endpoint || typeof endpoint !== 'string') return null;

                if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return null;

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

                if (ParentDetector.isReady && options.useParent !== false) {
                    return this._requestViaParent(endpoint, options, requestId);
                }

                return this._requestDirect(endpoint, options, headers, requestId);
            } catch (error) {
                return null;
            }
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
    // CORE STATE
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

    SessionMirror.subscribe((event) => {
        currentUser = event.state.user;
        window.dispatchEvent(new CustomEvent('sessionUpdated', { 
            detail: { session: event.state, changeType: event.type }
        }));
    });

    ParentDetector.subscribe((data) => {
        window.dispatchEvent(new CustomEvent('parentStatusChanged', { detail: data }));
    });

    // =============================================
    // INITIALIZATION
    // =============================================
    async function initialize() {
        try {
            DiagnosticsAgent.init(window.location.hostname === 'localhost' || window.__IFRAME_DEBUG__);
            
            if (!window.parent || window.parent === window) {
                window.dispatchEvent(new CustomEvent('coreReady', {
                    detail: {
                        authenticated: false,
                        standalone: true,
                        user: null
                    }
                }));
                return;
            }

            await SessionMirror.init();

            registerWithParent();

            loadCachedData();

            StatusIndicator.show('READY');

            window.dispatchEvent(new CustomEvent('coreReady', {
                detail: {
                    authenticated: SessionMirror.isAuthenticated(),
                    user: SessionMirror.getUser(),
                    frameId: FRAME_ID,
                    registered: registrationSent
                }
            }));

            messagingClient.processQueue();

        } catch (error) {
            DiagnosticsAgent.recordError(error, 'Init.fatal');
            StatusIndicator.show('FAILED');

            window.dispatchEvent(new CustomEvent('coreReady', {
                detail: {
                    authenticated: false,
                    user: null,
                    fallback: true,
                    error: error.message
                }
            }));
        }
    }

    // =============================================
    // DATA MANAGEMENT
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
            if (!SessionMirror.isAuthenticated()) return false;

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
            fromCache: session.fromCache,
            userId: session.userId
        };
    }

    function requestSessionUpdate() {
        return SessionClient.requestSession(true);
    }

    function initChildSession() {
        return new Promise((resolve) => {
            if (SessionMirror.isAuthenticated() && currentUser) {
                resolve({ user: currentUser, sessionData: SessionMirror.getState() });
            } else {
                const checkInterval = setInterval(() => {
                    if (SessionMirror.isAuthenticated() && currentUser) {
                        clearInterval(checkInterval);
                        resolve({ user: currentUser, sessionData: SessionMirror.getState() });
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
        if (!currentChat) return false;

        StatusIndicator.show('SENDING');

        const messageData = {
            id: SecurityUtils.generateMessageId(),
            chatId: currentChat.id,
            senderId: SessionMirror.getUser()?.id || 'local',
            content: SecurityUtils.escapeHtml(content || ''),
            type,
            timestamp: new Date().toISOString(),
            status: 'sending',
            reason: null,
            frameId: FRAME_ID,
            ...options
        };

        messages.push(messageData);

        const handleStatusChange = (event) => {
            const updatedMessage = event.detail.message;
            if (updatedMessage.id === messageData.id) {
                const idx = messages.findIndex(m => m.id === updatedMessage.id);
                if (idx !== -1) {
                    messages[idx] = updatedMessage;
                    
                    window.dispatchEvent(new CustomEvent('messagesUpdated', {
                        detail: { messages }
                    }));
                    
                    if (updatedMessage.status === 'failed' && updatedMessage.reason) {
                        showStatusMessage(`❌ Message failed: ${updatedMessage.reason}`);
                    }
                }
            }
        };

        window.addEventListener('messageStatusChanged', handleStatusChange, { once: true });

        if (SessionMirror.isAuthenticated()) {
            const result = await APIClient.request('/api/messages/send', {
                method: 'POST',
                body: JSON.stringify(messageData)
            });

            if (result) {
                const idx = messages.findIndex(m => m.id === messageData.id);
                if (idx !== -1) {
                    messages[idx] = { ...result, status: 'sent' };
                    
                    const sendResult = await messagingClient.send(MESSAGE_TYPES.SEND_MESSAGE, messages[idx]);
                    
                    if (!sendResult.success) {
                        messages[idx].status = 'failed';
                        messages[idx].reason = sendResult.reason || 'Message delivery failed';
                        showStatusMessage(`❌ ${messages[idx].reason}`);
                    }
                }

                const chatIdx = chats.findIndex(c => c.id === currentChat.id);
                if (chatIdx !== -1) {
                    chats[chatIdx].lastMessage = content;
                    chats[chatIdx].lastMessageAt = new Date().toISOString();
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
                }

                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);

                StatusIndicator.show('SUCCESS');

                return true;
            }

            const idx = messages.findIndex(m => m.id === messageData.id);
            if (idx !== -1) {
                messages[idx].status = 'failed';
                messages[idx].reason = 'Server rejected message';
                showStatusMessage(`❌ Server rejected message`);
            }

            StatusIndicator.show('FAILED');

            return false;
        }

        offlineQueue.push(messageData);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);

        StatusIndicator.show('SUCCESS');

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

    function isCoreReady() {
        return true;
    }

    function getConnectionHealth() {
        return messagingClient.getHealth();
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
    // START INITIALIZATION
    // =============================================
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

    // =============================================
    // EXPORT
    // =============================================
    const messagesCore = {
        // Core exports
        VERSION,
        MESSAGE_TYPES,
        LOCAL_STORAGE_KEYS,
        SOURCE_IFRAME,
        FRAME_ID,
        
        // Status
        StatusIndicator,
        
        // Lifecycle
        MessageLifecycle,
        
        // State
        currentUser, currentChat, currentFriend, messages, chats, contacts,
        isRecording, mediaRecorder, recordingTimer, recordingStartTime,
        typingTimeout, isTyping, selectedMessage, currentThread, chatThemes,
        emojiPicker, isSyncing, audioPlayers, editingMessageId, replyToMessage,
        currentCategory, activeFormattingTags, activeAudioElement, scheduledMessages,
        offlineQueue, messageDrafts, silentReactionsEnabled, readOnlyMode,
        currentAttachment, searchResults, currentSearchIndex, multiSendSelectedChats,
        recordingCancelTimeout, dragStartY, isDraggingToCancel,

        // Setters
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

        // Session & Communication
        SessionMirror,
        ParentDetector,
        SessionClient,
        messagingClient,
        MessageTransport,
        
        getCurrentSession,
        requestSessionUpdate,
        initChildSession,
        isCoreReady,
        getConnectionHealth,
        sendToParent,
        
        // API
        apiRequest,
        fetchData,
        APIClient,
        
        // Data management
        getData,
        updateData,
        loadCoreData,
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

        // Validation
        validateMessageStructure,
        validateMessagePayload,
        validateMessageBeforeSend,
        validateData,
        validateSessionData,

        // Utilities
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
        SecurityUtils,
        SafeStorage,

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

        // Threads
        openThread,
        showChatInfo,

        // Themes & Settings
        loadChatThemes,
        applyChatTheme,
        loadUserSettings,
        loadMessageDrafts,
        saveMessageDraft,
        loadMessageDraft,
        updateDraftBadge,
        loadScheduledMessages,
        loadOfflineQueue,
        updateScheduleBadge,

        // Scrolling & Search
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

        // Background
        startBackgroundSync,
        playNotificationSound,
        checkScheduledMessages,
        checkOfflineQueue,
        loadMultiSendChats,
        updateMultiSendSelection,
        saveUIState,
        getUserFromURL,
        openChatPanel,

        // Recovery
        showReconnectState,
        hideReconnectState,
        retryConnection,

        // Rendering triggers
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

        // Sync
        syncChatList,
        updateUnreadCounts,
        updateTypingIndicator,

        // Diagnostics
        DiagnosticsAgent,
        getHealthStatus: getConnectionHealth,
        
        // Registration
        registerWithParent,
        registrationSent: () => registrationSent
    };

    window.messagesCore = messagesCore;

    if (window.location.hash === '#debug' || localStorage.getItem('kynecta_debug') === 'true') {
        window.__IFRAME_DEBUG__ = true;
        DiagnosticsAgent.enabled = true;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = messagesCore;
    }
})();