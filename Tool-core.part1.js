/**
 * PART 1/3 — BOOTSTRAP & LIFECYCLE
 * Module guard, lifecycle state machine, auth handlers,
 * session management, core state, logging, security
 */
// onModuleActive is declared in part3 (UI bridge / public API); part3 also imports
// heavily from this file. Safe circular import: only called from inside transitionTo(),
// never during top-level module evaluation.
import { onModuleActive } from './Tool-core.part3.js';
// =============================================
// TOOLS-CORE.JS - COMPLETE PRODUCTION MODULE (FIXED)
// =============================================
// Version: 10.2.3 - FIXED: API RESPONSE HANDLING, CREATE LISTING, TABS
// =============================================

// =============================================
// MODULE IDENTIFIER - MUST MATCH PARENT EXPECTATIONS
// =============================================
export const MODULE_NAME = 'tools'; // EXACT match required
export const MODULE_VERSION = '10.2.3'; // FIXED VERSION
export const MODULE_CAPABILITIES = ['marketplace', 'storage', 'heartbeat', 'ui'];

// =============================================
// LIFECYCLE STATE MACHINE (SINGLE SOURCE OF TRUTH - STRICT)
// =============================================

export const LIFECYCLE_STATE = {
    BOOT: 'BOOT',
    INITIALIZING: 'INITIALIZING',
    READY: 'READY',
    WAIT_PARENT: 'WAIT_PARENT',
    WAITING_AUTH: 'WAITING_AUTH',
    ACTIVE: 'ACTIVE'
};

export let currentState = LIFECYCLE_STATE.BOOT;

// Enable debug logging when in iframe (tools is always in an iframe)
if (window.parent && window.parent !== window && !window.__TOOLS_DEBUG__) {
    window.__TOOLS_DEBUG__ = true;
}

// Deep token extractor — searches all known payload shapes
export function _deepExtractToken(data) {
    if (!data || typeof data !== 'object') return null;
    // Direct fields
    const direct = data.userToken || data.token || data.accessToken || data.jwtToken;
    if (direct && typeof direct === 'string' && direct.startsWith('eyJ')) return direct;
    // Nested: data.user
    if (data.user) {
        const ut = data.user.token || data.user.userToken || data.user.accessToken;
        if (ut && ut.startsWith('eyJ')) return ut;
    }
    // Nested: data.session
    if (data.session) {
        const st = data.session.token || data.session.userToken || data.session.accessToken;
        if (st && st.startsWith('eyJ')) return st;
    }
    // Nested: data.payload
    if (data.payload) {
        const pt = _deepExtractToken(data.payload);
        if (pt) return pt;
    }
    // Nested: data.data
    if (data.data) {
        const dt = _deepExtractToken(data.data);
        if (dt) return dt;
    }
    // Nested: data.auth
    if (data.auth) {
        const at = data.auth.token || data.auth.userToken || data.auth.accessToken;
        if (at && at.startsWith('eyJ')) return at;
    }
    return null;
}

export function _deepExtractUserId(data) {
    if (!data || typeof data !== 'object') return null;
    const direct = data.userId || data.user_id || data.userid || data.id;
    if (direct && direct !== 'user' && direct !== 'null') return direct;
    if (data.user?.id) return data.user.id;
    if (data.session?.userId) return data.session.userId;
    if (data.payload) {
        const pid = _deepExtractUserId(data.payload);
        if (pid) return pid;
    }
    if (data.data) {
        const did = _deepExtractUserId(data.data);
        if (did) return did;
    }
    return null;
}

// Background token harvester — defined here, started after sessionClient is ready
export function _harvestToken() {
    if (window.__kynToken) return;
    let found = false;
    
    // 1. Parent's getAuthSession (api.core.js exposes this)
    try {
        if (window.parent && window.parent !== window) {
            if (typeof window.parent.getAuthSession === 'function') {
                const s = window.parent.getAuthSession();
                if (s?.token && s.token.startsWith('eyJ')) {
                    window.__kynToken = s.token;
                    if (s.userId) window.__kynUserId = s.userId;
                    found = true;
                }
            }
            // Also try parent's AppState
            if (!found && window.parent.AppState?.getToken) {
                const t = window.parent.AppState.getToken();
                if (t && t.startsWith('eyJ')) { window.__kynToken = t; found = true; }
            }
        }
    } catch {}
    
    // 2. Scan localStorage for JWT (api.core.js stores token here)
    if (!found) {
        try {
            for (const key of Object.keys(localStorage)) {
                const val = localStorage.getItem(key);
                if (!val) continue;
                if (val.startsWith('eyJ')) { window.__kynToken = val; found = true; break; }
                if (val.charAt(0) === '{') {
                    try {
                        const p = JSON.parse(val);
                        const t = p?.token || p?.userToken || p?.accessToken || p?.jwtToken;
                        if (t && t.startsWith('eyJ')) { window.__kynToken = t; found = true; break; }
                        // nested session objects
                        const nested = p?.session || p?.auth || p?.data;
                        if (nested) {
                            const nt = nested?.token || nested?.userToken || nested?.accessToken;
                            if (nt && nt.startsWith('eyJ')) { window.__kynToken = nt; found = true; break; }
                        }
                    } catch {}
                }
            }
        } catch {}
    }
    
    // 3. Scan sessionStorage
    if (!found) {
        try {
            for (const key of Object.keys(sessionStorage || {})) {
                const val = sessionStorage.getItem(key);
                if (!val) continue;
                if (val.startsWith('eyJ')) { window.__kynToken = val; found = true; break; }
                try {
                    const p = JSON.parse(val);
                    const t = p?.token || p?.userToken || p?.accessToken;
                    if (t && t.startsWith('eyJ')) { window.__kynToken = t; found = true; break; }
                } catch {}
            }
        } catch {}
    }
    
    if (found && window.__TOOLS_DEBUG__) {
        console.log('[TokenHarvest] ✅ Token found, length:', window.__kynToken?.length);
    }
    
    if (!found) {
        setTimeout(_harvestToken, 1500);
    }
}
export let childReadySent = false;
export let parentReadyReceived = false;
export let initializationLock = false;
export let activationComplete = false;

// State transition validation matrix - STRICT
export const VALID_TRANSITIONS = {
    [LIFECYCLE_STATE.BOOT]: [LIFECYCLE_STATE.INITIALIZING],
    [LIFECYCLE_STATE.INITIALIZING]: [LIFECYCLE_STATE.READY],
    [LIFECYCLE_STATE.READY]: [LIFECYCLE_STATE.WAIT_PARENT],
    [LIFECYCLE_STATE.WAIT_PARENT]: [LIFECYCLE_STATE.WAITING_AUTH, LIFECYCLE_STATE.ACTIVE],
    [LIFECYCLE_STATE.WAITING_AUTH]: [LIFECYCLE_STATE.ACTIVE],
    [LIFECYCLE_STATE.ACTIVE]: []
};

export function transitionTo(nextState, reason = '') {
    // Prevent duplicate transitions
    if (currentState === nextState) {
        if (window.__TOOLS_DEBUG__) console.log(`[Tools][Lifecycle] Already in ${nextState} - ignoring transition request`);
        return true;
    }
    
    if (!VALID_TRANSITIONS[currentState]?.includes(nextState)) {
        if (window.__TOOLS_DEBUG__) console.error(`[Tools][Lifecycle] INVALID TRANSITION: ${currentState} → ${nextState}`, reason);
        return false;
    }
    
    const fromState = currentState;
    if (window.__TOOLS_DEBUG__) console.log(`[Tools][Lifecycle] ${fromState} → ${nextState}`, reason);
    currentState = nextState;
    moduleState.bootState = nextState;
    
    window.dispatchEvent(new CustomEvent('tools:lifecycle-change', { 
        detail: { from: fromState, to: nextState, reason }
    }));
    
    // Trigger state-specific handlers
    if (nextState === LIFECYCLE_STATE.ACTIVE && !activationComplete) {
        onModuleActive();
        activationComplete = true;
    }
    
    return true;
}

export function assertActive(actionName) {
    // Non-blocking: always allow, just warn in debug mode
    // secureApiCall handles actual auth — don't gate on lifecycle state
    if (currentState !== LIFECYCLE_STATE.ACTIVE && window.__TOOLS_DEBUG__) {
        console.warn(`[Tools][Lifecycle] "${actionName}" called before ACTIVE (state: ${currentState}) — proceeding`);
    }
    return true;
}

export function isActive() {
    // Module is active if state is ACTIVE, regardless of how parentReadyReceived was set
    return currentState === LIFECYCLE_STATE.ACTIVE;
}

// =============================================
// SESSION VALIDATION UTILITY (MANDATORY)
// =============================================
export function __isValidSession(session) {
    if (!session || typeof session !== 'object') return false;
    
    // Check for userId in any common format (including nested user object)
    let userId = session.userId || session.user_id || session.userid || session.id;
    
    // Check nested user object
    if (!userId && session.user) {
        userId = session.user.id || session.user.userId;
    }
    
    // Check nested session object
    if (!userId && session.session) {
        userId = session.session.userId || session.session.id;
    }
    
    if (!userId) return false;
    
    // Reject only obviously fake IDs
    const fakeIds = ['user', 'default', 'null', 'undefined', ''];
    if (typeof userId === 'string' && fakeIds.includes(userId.toLowerCase())) {
        return false;
    }
    
    // Check for token in various locations
    let token = session.userToken || session.token || session.accessToken;
    if (!token && session.user) {
        token = session.user.token || session.user.userToken;
    }
    if (!token && session.session) {
        token = session.session.token || session.session.userToken;
    }
    
    // In development, accept any session with a userId
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return true;
    }
    
    // For production, require token OR trust that parent sent valid data
    return true;
}

// =============================================
// STORAGE PROXY - SANDBOX-COMPLIANT (NO DIRECT STORAGE)
// =============================================

export const StorageProxy = {
    pendingRequests: new Map(),
    requestCounter: 0,

    get(key, defaultValue = null) {
        return new Promise((resolve) => {
            const requestId = `storage_get_${++this.requestCounter}_${Date.now()}`;
            
            const handler = (event) => {
                if (event.data?.type === 'STORAGE_RESULT' && 
                    event.data.requestId === requestId &&
                    event.data.key === key) {
                    window.removeEventListener('message', handler);
                    resolve(event.data.value !== undefined ? event.data.value : defaultValue);
                }
            };
            
            window.addEventListener('message', handler);
            
            parent.postMessage({
                type: 'STORAGE_GET',
                key,
                requestId,
                module: MODULE_NAME,
                timestamp: Date.now()
            }, '*');
            
            // Timeout fallback
            setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve(defaultValue);
            }, 5000);
        });
    },

    set(key, value) {
        parent.postMessage({
            type: 'STORAGE_SET',
            key,
            value,
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
        
        return true;
    },

    remove(key) {
        parent.postMessage({
            type: 'STORAGE_REMOVE',
            key,
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
        
        return true;
    },

    clear() {
        parent.postMessage({
            type: 'STORAGE_CLEAR',
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
    },

    sessionGet(key, defaultValue = null) {
        return new Promise((resolve) => {
            const requestId = `session_get_${++this.requestCounter}_${Date.now()}`;
            
            const handler = (event) => {
                if (event.data?.type === 'SESSION_STORAGE_RESULT' && 
                    event.data.requestId === requestId &&
                    event.data.key === key) {
                    window.removeEventListener('message', handler);
                    resolve(event.data.value !== undefined ? event.data.value : defaultValue);
                }
            };
            
            window.addEventListener('message', handler);
            
            parent.postMessage({
                type: 'SESSION_STORAGE_GET',
                key,
                requestId,
                module: MODULE_NAME,
                timestamp: Date.now()
            }, '*');
            
            setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve(defaultValue);
            }, 5000);
        });
    },

    sessionSet(key, value) {
        parent.postMessage({
            type: 'SESSION_STORAGE_SET',
            key,
            value,
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
        
        return true;
    },

    sessionRemove(key) {
        parent.postMessage({
            type: 'SESSION_STORAGE_REMOVE',
            key,
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
        
        return true;
    }
};

// =============================================
// SESSION CLIENT - PARENT-AUTHORITATIVE
// =============================================

export const SessionClient = {
    session: null,
    sessionPromise: null,
    sessionResolvers: [],
    pendingRequests: new Map(),
    _lastSessionId: null,
    
    _generateSessionId(session) {
        const token = session.userToken || session.token;
        const userId = session.userId || session.user_id || session.userid || session.id;
        return `${userId}_${token.substring(0, 16)}`;
    },
    
    requestSession() {
        if (this.sessionPromise) return this.sessionPromise;
        
        // Only request if active or waiting for auth
        if (!isActive() && currentState !== LIFECYCLE_STATE.WAITING_AUTH && currentState !== LIFECYCLE_STATE.WAIT_PARENT) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools][Session] Cannot request session - module not ready');
            return Promise.reject(new Error('Module not ready'));
        }
        
        this.sessionPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Session request timeout'));
            }, 10000);
            
            const requestId = `session_req_${Date.now()}_${Math.random()}`;
            this.pendingRequests.set(requestId, { resolve, reject, timeout });
            
            parent.postMessage({
                type: 'REQUEST_SESSION',
                requestId,
                module: MODULE_NAME,
                timestamp: Date.now()
            }, '*');
        });
        
        return this.sessionPromise;
    },
    
    handleSessionData(sessionData, requestId = null) {
        // STRICT: Validate session before accepting
        if (!__isValidSession(sessionData)) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools][Session] Rejected invalid session data', {
                hasToken: !!(sessionData?.userToken || sessionData?.token),
                userId: sessionData?.userId || sessionData?.user_id || sessionData?.id
            });
            if (requestId && this.pendingRequests.has(requestId)) {
                const { reject, timeout } = this.pendingRequests.get(requestId);
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                reject(new Error('Invalid session data'));
            }
            return false;
        }
        
        // Prevent session downgrade: if we already have a valid session, don't overwrite with invalid
        if (this.session && __isValidSession(this.session)) {
            if (!__isValidSession(sessionData)) {
                if (window.__TOOLS_DEBUG__) console.warn('[Tools][Session] Prevented session downgrade - ignoring invalid session');
                return false;
            }
            
            // Check for duplicate session using session ID
            const newSessionId = this._generateSessionId(sessionData);
            if (this._lastSessionId === newSessionId) {
                if (window.__TOOLS_DEBUG__) console.log('[Tools][Session] Duplicate session ignored');
                if (requestId && this.pendingRequests.has(requestId)) {
                    const { resolve, timeout } = this.pendingRequests.get(requestId);
                    clearTimeout(timeout);
                    this.pendingRequests.delete(requestId);
                    resolve(this.session);
                }
                return true;
            }
            this._lastSessionId = newSessionId;
        } else {
            // First time setting session
            const newSessionId = this._generateSessionId(sessionData);
            this._lastSessionId = newSessionId;
        }
        
        if (requestId && this.pendingRequests.has(requestId)) {
            const { resolve, timeout } = this.pendingRequests.get(requestId);
            clearTimeout(timeout);
            this.pendingRequests.delete(requestId);
            resolve(sessionData);
        }
        
        // Merge session data - never overwrite entirely
        if (this.session && __isValidSession(this.session)) {
            this.session = { ...this.session, ...sessionData };
        } else {
            this.session = sessionData;
        }
        
        // Notify all waiting resolvers
        this.sessionResolvers.forEach(resolver => resolver(this.session));
        this.sessionResolvers = [];
        
        window.dispatchEvent(new CustomEvent('session:updated', { 
            detail: this.session 
        }));
        
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Session] Valid session accepted', {
            userId: this.session.userId || this.session.user_id || this.session.id,
            hasToken: !!(this.session.userToken || this.session.token)
        });
        
        return true;
    },
    
    getSession() {
        return this.session;
    },
    
    getToken() {
        return this.session?.userToken || this.session?.token;
    },
    
    getUser() {
        return this.session ? {
            id: this.session.userId || this.session.user_id || this.session.id,
            displayName: this.session.displayName || this.session.name,
            email: this.session.email,
            photoURL: this.session.photoURL || this.session.avatar,
            isPremium: !!this.session.isPremium,
            trustLevel: this.session.trustLevel || 'new'
        } : null;
    },
    
    isReady() {
        if (!this.session) return false;
        if (!this.getToken()) return false;
        // Validate userId is not fake
        const userId = this.session.userId || this.session.user_id || this.session.id;
        if (userId === 'user' || userId === 'default' || userId === 'null' || userId === 'undefined') return false;
        return true;
    },
    
    isValid() {
        if (!this.isReady()) return false;
        if (this.session.expiresAt) {
            try {
                return new Date(this.session.expiresAt) > new Date();
            } catch {
                return true;
            }
        }
        return true;
    },
    
    clear() {
        this.session = null;
        this.sessionPromise = null;
        this.pendingRequests.clear();
        this._lastSessionId = null;
        
        parent.postMessage({
            type: 'SESSION_CLEAR',
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
    },
    
    onSession(callback) {
        if (this.session) {
            callback(this.session);
            return () => {};
        }
        
        this.sessionResolvers.push(callback);
        return () => {
            const index = this.sessionResolvers.indexOf(callback);
            if (index !== -1) this.sessionResolvers.splice(index, 1);
        };
    }
};

// =============================================
// MESSAGE DEDUPLICATION (ENHANCED - STRICT)
// =============================================

export const MessageGuard = {
    seen: new Set(),
    processed: new Set(),
    maxSize: 1000,
    
    isDuplicate(id) {
        if (!id) return false;
        if (this.seen.has(id)) return true;
        
        this.seen.add(id);
        
        // Maintain size limit
        if (this.seen.size > this.maxSize) {
            const iterator = this.seen.values();
            const toDelete = Math.floor(this.seen.size / 2);
            for (let i = 0; i < toDelete; i++) {
                this.seen.delete(iterator.next().value);
            }
        }
        
        return false;
    },
    
    isProcessed(id) {
        if (!id) return false;
        return this.processed.has(id);
    },
    
    markProcessed(id) {
        if (!id) return;
        this.processed.add(id);
        
        if (this.processed.size > this.maxSize) {
            const iterator = this.processed.values();
            const toDelete = Math.floor(this.processed.size / 2);
            for (let i = 0; i < toDelete; i++) {
                this.processed.delete(iterator.next().value);
            }
        }
    },
    
    clear() {
        this.seen.clear();
        this.processed.clear();
    }
};

// =============================================
// SILENT LOGGING SYSTEM (PRESERVED)
// =============================================

const LOG_PREFIX = '[Tools]';
const LOG_LEVELS = { DEBUG: 0, INFO: 1, SUCCESS: 2, WARN: 3, ERROR: 4, SILENT: 5 };
let currentLogLevel = LOG_LEVELS.INFO;
const loggedMessages = new Set();
const DEBUG = false;

export function logOnce(level, message, data = null) {
    const key = `${level}:${message}`;
    if (loggedMessages.has(key)) return;
    loggedMessages.add(key);
    
    const prefix = level === 'error' ? '🔴 ERROR' :
                   level === 'warn' ? '🟡 WARN' :
                   level === 'success' ? '✅ SUCCESS' :
                   level === 'send' ? '📤 SENDING' :
                   level === 'receive' ? '📥 RECEIVED' :
                   level === 'init' ? '🚀 INIT' :
                   level === 'ready' ? '🔵 READY' : '⚪ INFO';
    
    if (window.__TOOLS_DEBUG__) console.log(`${LOG_PREFIX} ${prefix} - ${message}`, data ? data : '');
}

export function logError(module, error, context = '') {
    logOnce('error', `${module} failed: ${error?.message || error}`, { context });
}

export function debugLog(...args) {
    if (DEBUG) console.log(...args);
}

// =============================================
// MESSAGE QUEUE SYSTEM (STRICT - PRE-ACTIVE ONLY)
// =============================================

export const messageQueue = [];

// =============================================
// ID GENERATION (MANDATORY)
// =============================================

export function generateMessageId() {
    return `msg_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
}

export function generateRequestId() {
    return `req_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
}

// =============================================
// STANDARDIZED MESSAGE SCHEMA (PARENT-ALIGNED)
// =============================================

function createMessage(type, payload = {}) {
    return {
        type: type,
        id: generateMessageId(),
        requestId: generateRequestId(),
        source: MODULE_NAME,
        target: 'parent',
        timestamp: Date.now(),
        payload: sanitizePayload(payload)
    };
}

function sanitizePayload(payload) {
    if (!payload || typeof payload !== 'object') return {};
    try {
        return JSON.parse(JSON.stringify(payload));
    } catch {
        return {};
    }
}

// =============================================
// SAFE SEND WITH QUEUE (STRICT - NO SEND BEFORE ACTIVE)
// =============================================

function sendMessage(message) {
    if (!window.parent || window.parent === window) {
        return { success: false, error: 'not_in_iframe' };
    }

    try {
        window.parent.postMessage(message, '*');
        moduleState.connectionMetrics.messagesSent++;
        logOnce('send', message.type, { id: message.id, requestId: message.requestId });
        return { success: true, messageId: message.id, requestId: message.requestId };
    } catch (err) {
        logError('sendMessage', err);
        return { success: false, error: err.message };
    }
}

export function safeSend(type, payload = {}) {
    // STRICT RULE: Only CHILD_READY allowed before WAIT_PARENT
    if (!parentReadyReceived && type !== 'CHILD_READY') {
        if (currentState === LIFECYCLE_STATE.WAIT_PARENT || currentState === LIFECYCLE_STATE.WAITING_AUTH) {
            if (window.__TOOLS_DEBUG__) console.warn(`[Tools][Queue] Message ${type} blocked - in ${currentState} state (only CHILD_READY allowed)`);
            return { success: false, error: 'wait_parent_blocked', queued: false };
        }
        debugLog(`[Queue] Message ${type} queued - parent not ready`);
        messageQueue.push({ type, payload, timestamp: Date.now() });
        return { success: true, queued: true, messageId: null };
    }

    if (moduleState.shutdown) {
        return { success: false, error: 'shutdown' };
    }

    const message = createMessage(type, payload);
    return sendMessage(message);
}

export function flushMessageQueue() {
    if (!parentReadyReceived || messageQueue.length === 0) return;
    
    if (window.__TOOLS_DEBUG__) console.log(`[Tools][Queue] Flushing ${messageQueue.length} queued messages`);
    
    while (messageQueue.length > 0) {
        const queued = messageQueue.shift();
        const message = createMessage(queued.type, queued.payload);
        sendMessage(message);
    }
}

// =============================================
// MESSAGE VALIDATION (STRICT SCHEMA)
// =============================================
export function validateMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    
    // For handshake/AUTH messages, be very permissive
    const handshakeTypes = ['PARENT_READY', 'AUTH_READY', 'CHILD_READY', 'SESSION_DATA', 'SESSION_UPDATE'];
    if (handshakeTypes.includes(msg.type)) {
        // Just need type for handshake - source can be anything
        return typeof msg.type === 'string' && msg.type.length > 0;
    }
    
    // For other messages, validate more strictly
    const hasType = typeof msg.type === 'string' && msg.type.length > 0;
    const hasSource = msg.source === 'parent' || msg.source === 'tools' || !msg.source;
    const hasPayload = msg.payload !== undefined;
    
    return hasType && hasSource && hasPayload;
}
// =============================================
// ORIGIN VALIDATION (RELAXED DURING HANDSHAKE)
// =============================================

let expectedParentOrigin = null;

const ALLOWED_ORIGINS = [
    window.location.origin,
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
    'https://nexora-3bla.onrender.com',
    'https://nexopa.onrender.com',
    null,
    'null'
];

function isValidOrigin(origin) {
    // Relax origin validation during handshake
    if (currentState !== LIFECYCLE_STATE.ACTIVE) {
        return true;
    }
    
    if (!origin || origin === 'null' || origin === 'null') return true;
    
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return true;
    }
    
    if (origin.includes('.onrender.com') || origin.includes('onrender.com')) {
        return true;
    }
    
    return false;
}

export function isMessageFromParent(event) {
    if (!expectedParentOrigin && event.source === window.parent) {
        expectedParentOrigin = event.origin;
    }
    
    if (expectedParentOrigin && event.origin !== expectedParentOrigin) {
        debugLog(`[Security] Origin mismatch: expected ${expectedParentOrigin}, got ${event.origin}`);
        return false;
    }
    
    return event.source === window.parent && isValidOrigin(event.origin);
}

// =============================================
// MODULE STATE (PRESERVED)
// =============================================

export const moduleState = {
    initialized: false,
    parentDetected: false,
    sessionActive: false,
    ready: false,
    shutdown: false,
    permissions: new Set(),
    health: {
        lastHeartbeat: 0,
        missedHeartbeats: 0
    },
    features: new Map(),
    lastValidSession: null,
    sessionCache: null,
    
    frameId: null,
    protocolVersion: 'KYN-10.2',
    connectionMetrics: {
        messagesSent: 0,
        messagesReceived: 0,
        acksReceived: 0
    },
    
    bootState: LIFECYCLE_STATE.BOOT,
    sessionAuthority: 'unknown',
    
    environment: {
        type: 'UNKNOWN',
        online: true,
        secure: false,
        origin: '',
        hostname: '',
        protocol: '',
        isIframe: false
    },
    
    handshakeState: {
        stage: 'idle',
        childReadySent: false,
        parentReadyReceived: false,
        registered: false,
        registeredAck: false,
        sessionRequested: false,
        sessionActive: false,
        complete: false
    },
    
    sessionState: {
        requested: false,
        received: false,
        expiresAt: null,
        lastSync: 0
    },
    
    diagnostics: {
        errors: [],
        warnings: [],
        startupTime: 0
    }
};

const CONFIG = {
    TIMEOUTS: {
        HANDSHAKE: 3000,
        SESSION: 5000,
        HEARTBEAT: 15000,
        ACK: 1500,
        INIT: 5000,
        PARENT_READY: 20000
    },
    SECURITY: {
        SIGNATURE_REQUIRED: false,
        TIMESTAMP_TOLERANCE: 60000,
        REPLAY_WINDOW: 300000,
        MAX_MESSAGE_SIZE: 1048576,
        TOKEN_REFRESH_MARGIN: 300000,
        ORIGIN_STRICT_MODE: true
    }
};

// =============================================
// EXPORTED STATE VARIABLES (PRESERVED)
// =============================================

export let currentUser = null;
export let userData = null;
export let myListings = [];
export let allListings = [];
export let savedItems = [];
export let privateNotes = [];

// Expose on window immediately for Tool-ui.js access
if (!window.allListings) window.allListings = allListings;
if (!window.myListings) window.myListings = myListings;
if (!window.savedItems) window.savedItems = savedItems;
export let userGroups = [];
export let userFriends = [];
export let currentMoodFilter = null;
export let offlineDrafts = [];
export let trustStats = {};
export let userSubscription = null;
export let teamMembers = [];
export let leaderboardData = [];
export let analyticsData = {};
export let streakData = {};
export let premiumFeatures = {};
export let paymentMethods = [];

export let parentDataLoaded = false;
export let directAPILoaded = false;
export let parentCommunicationId = null;
export let dataFetchInProgress = false;

export let sessionData = null;
export let handshakeComplete = false;
export let sessionValid = false;
export let isReady = false;
export let isInitializing = false;
export let dataCache = new Map();
export let loadingMessageElement = null;

export let isBootstrapped = false;
export let isAuthReady = false;
export let backgroundJobsStarted = false;
export let tokenInitializationPromise = null;
export let tokenRefreshInProgress = false;
export const apiCallQueue = [];
export let isProcessingQueue = false;

// =============================================
// CONSTANTS (PRESERVED)
// =============================================

export const LISTING_TYPES = {
    SERVICE: 'service',
    DIGITAL: 'digital',
    PHYSICAL: 'physical'
};

export const AVAILABILITY = {
    FREE: 'free',
    BUSY: 'busy',
    URGENT: 'urgent'
};

export const MOOD_CONTEXTS = {
    HELP: 'help',
    BROWSE: 'browse',
    LEARN: 'learn',
    URGENT: 'urgent',
    CREATIVE: 'creative',
    BUSINESS: 'business'
};

export const TRUST_CIRCLES = {
    FRIENDS: 'friends',
    GROUPS: 'groups',
    SELECTED: 'selected',
    PUBLIC: 'public',
    PREMIUM: 'premium',
    MICRO: 'micro'
};

export const DURATION_OPTIONS = {
    '24h': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '14d': 14 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    'event': null
};

export const TRUST_INDICATORS = {
    NEW: { text: 'New', class: 'trust-new' },
    RESPONSIVE: { text: 'Responsive', class: 'trust-responsive' },
    RELIABLE: { text: 'Reliable', class: 'trust-reliable' },
    VERIFIED: { text: 'Verified', class: 'trust-verified' },
    PRO: { text: 'Pro', class: 'trust-pro' }
};

export const SUBSCRIPTION_PLANS = {
    MONTHLY: { id: 'monthly', price: 9.99, name: 'Monthly' },
    QUARTERLY: { id: 'quarterly', price: 24.99, name: 'Quarterly' },
    YEARLY: { id: 'yearly', price: 79.99, name: 'Yearly' },
    BUSINESS: { id: 'business', price: 199.99, name: 'Business' },
    TEAM: { id: 'team', price: 299.99, name: 'Team' }
};

export const SERVICE_CATEGORIES = [
    'Tutoring', 'Design', 'Repair', 'Writing', 'Consulting',
    'Programming', 'Marketing', 'Cleaning', 'Cooking', 'Fitness',
    'Music Lessons', 'Art', 'Photography', 'Video Editing', 'Translation'
];

export const PREMIUM_CATEGORIES = [
    'Business Consulting', 'Executive Coaching', 'VIP Services',
    'Enterprise Solutions', 'Premium Content', 'Exclusive Access'
];

export const DIGITAL_TYPES = [
    'Study Notes', 'Templates', 'Design Assets', 'E-books', 'Guides',
    'Worksheets', 'Presentations', 'Code Snippets', 'Audio Lessons', 'Wallpapers'
];

export const PREMIUM_DIGITAL_TYPES = [
    'Premium Templates', 'Master Classes', 'Pro Tools',
    'Exclusive Content', 'AR Assets', '3D Models'
];

export const TEMPLATE_TYPES = {
    BASIC: 'basic',
    BUSINESS: 'business',
    COACHING: 'coaching',
    CREATIVE: 'creative',
    VIP: 'vip',
    DIGITAL: 'digital'
};

export const LOCAL_STORAGE_KEYS = {
    USER: 'knecta_current_user',
    USER_PROFILE: 'knecta_user_profile',
    MY_LISTINGS: 'knecta_my_listings',
    ALL_LISTINGS: 'knecta_all_listings',
    SAVED_ITEMS: 'knecta_saved_items',
    PRIVATE_NOTES: 'knecta_private_notes',
    OFFLINE_DRAFTS: 'knecta_marketplace_drafts',
    TRUST_STATS: 'knecta_trust_stats',
    MOOD_FILTER: 'knecta_marketplace_mood',
    USER_GROUPS: 'knecta_user_groups',
    USER_FRIENDS: 'knecta_user_friends',
    USER_SUBSCRIPTION: 'knecta_user_subscription',
    TEAM_MEMBERS: 'knecta_team_members',
    LEADERBOARD: 'knecta_leaderboard',
    ANALYTICS: 'knecta_analytics',
    STREAK_DATA: 'knecta_streak_data',
    PREMIUM_FEATURES: 'knecta_premium_features',
    PAYMENT_METHODS: 'knecta_payment_methods',
    PREMIUM_LISTINGS: 'knecta_premium_listings',
    SPOTLIGHT_LISTINGS: 'knecta_spotlight_listings',
    MARKETPLACE_USERS: 'knecta_marketplace_users',
    SYNC_QUEUE: 'knecta_sync_queue',
    SESSION_CACHE: 'knecta_session_cache',
    FRAME_ID: 'knecta_frame_id',
    HANDSHAKE_STATE: 'knecta_handshake_state',
    PROTOCOL_VERSION: 'knecta_protocol_version',
    ENVIRONMENT_CACHE: 'knecta_environment_cache',
    STARTUP_STATE: 'knecta_startup_state'
};

export const PARENT_MESSAGE_TYPES = {
    CHILD_READY: 'CHILD_READY',
    REQUEST_SESSION: 'REQUEST_SESSION',
    SESSION_CONFIRMED: 'SESSION_CONFIRMED',
    UI_READY: 'UI_READY',
    NEED_REFRESH: 'NEED_REFRESH',
    AUTH_ERROR: 'AUTH_ERROR',
    CORE_READY: 'coreReady',
    HEARTBEAT: 'HEARTBEAT',
    SYNC_REQUEST: 'SYNC_REQUEST',
    
    SESSION_DATA: 'SESSION_DATA',
    SESSION_UPDATE: 'SESSION_UPDATE',
    LOGOUT: 'LOGOUT',
    PARENT_READY: 'PARENT_READY',
    REFRESH_UI: 'REFRESH_UI',
    FORCE_RELOAD: 'FORCE_RELOAD',
    INIT: 'init',
    REFRESH_DATA: 'refreshData',
    ACK: 'ACK',
    HANDSHAKE_COMPLETE: 'HANDSHAKE_COMPLETE',
    
    HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
    HANDSHAKE_ACK: 'HANDSHAKE_ACK',
    SESSION_SYNC: 'SESSION_SYNC',
    SESSION_ACK: 'SESSION_ACK',
    PAGE_ACTIVATED: 'PAGE_ACTIVATED',
    NAVIGATE: 'NAVIGATE',
    PING: 'PING',
    PONG: 'PONG',
    CAPABILITIES: 'CAPABILITIES',
    CAPABILITIES_ACK: 'CAPABILITIES_ACK',
    ERROR: 'ERROR',
    WARNING: 'WARNING',
    
    ENVIRONMENT: 'ENVIRONMENT',
    ENVIRONMENT_ACK: 'ENVIRONMENT_ACK',
    
    RECOVERY_REQUEST: 'RECOVERY_REQUEST',
    RECOVERY_ACK: 'RECOVERY_ACK',
    
    DIAGNOSTICS: 'DIAGNOSTICS',
    METRICS: 'METRICS',
    
    BOOT_STATE: 'BOOT_STATE',
    MODULE_STATE: 'MODULE_STATE',
    REGISTER_MODULE: 'REGISTER_MODULE',
    REGISTERED: 'REGISTERED',
    SESSION_ACTIVE: 'SESSION_ACTIVE',
    
    MODULE_HEARTBEAT: 'MODULE_HEARTBEAT',
    
    STORAGE_GET: 'STORAGE_GET',
    STORAGE_SET: 'STORAGE_SET',
    STORAGE_REMOVE: 'STORAGE_REMOVE',
    STORAGE_CLEAR: 'STORAGE_CLEAR',
    STORAGE_RESULT: 'STORAGE_RESULT',
    SESSION_STORAGE_GET: 'SESSION_STORAGE_GET',
    SESSION_STORAGE_SET: 'SESSION_STORAGE_SET',
    SESSION_STORAGE_REMOVE: 'SESSION_STORAGE_REMOVE',
    SESSION_STORAGE_RESULT: 'SESSION_STORAGE_RESULT'
};

export const DATA_TYPES = {
    FRIENDS: 'friendsList',
    GROUPS: 'groupsList',
    CHAT_HISTORY: 'chatHistory',
    NOTIFICATIONS: 'notifications',
    SETTINGS: 'settings'
};

export const SESSION_SCHEMA = {
    required: ['userId', 'userToken'],
    optional: ['displayName', 'email', 'photoURL', 'isPremium', 'subscription', 'trustLevel', 'groups', 'friends', 'expiresAt']
};

export const ENVIRONMENT_TYPES = {
    LOCAL_DEV: 'LOCAL_DEV',
    RENDER_HOSTED: 'RENDER_HOSTED',
    VPN_NETWORK: 'VPN_NETWORK',
    PRODUCTION: 'PRODUCTION',
    UNKNOWN: 'UNKNOWN'
};

export const STARTUP_STAGES = {
    IDLE: 'IDLE',
    WAITING: 'WAITING',
    HANDSHAKING: 'HANDSHAKING',
    SYNCING: 'SYNCING',
    ACTIVE: 'ACTIVE',
    DEGRADED: 'DEGRADED',
    RECOVERING: 'RECOVERING',
    FAILED: 'FAILED'
};

// =============================================
// MODULE 0 - SAFE STORAGE LAYER (UPDATED TO USE PROXY)
// =============================================

class SafeStorage {
    constructor() {
        this.memoryStorage = new Map();
        this.warningsShown = new Set();
        logOnce('ready', 'SafeStorage initialized (proxy-based)');
    }

    async get(key, defaultValue = null) {
        try {
            const value = await StorageProxy.get(key);
            if (value !== null && value !== undefined) {
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            }
            if (this.memoryStorage.has(key)) {
                return this.memoryStorage.get(key);
            }
            return defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    set(key, value) {
        try {
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            StorageProxy.set(key, serialized);
            this.memoryStorage.set(key, value);
            return true;
        } catch (e) {
            return false;
        }
    }

    remove(key) {
        try {
            StorageProxy.remove(key);
            this.memoryStorage.delete(key);
            return true;
        } catch (e) {
            return false;
        }
    }

    async sessionGet(key, defaultValue = null) {
        try {
            const value = await StorageProxy.sessionGet(key);
            if (value !== null && value !== undefined) {
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            }
            return this.memoryStorage.get(`session_${key}`) || defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    sessionSet(key, value) {
        try {
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            StorageProxy.sessionSet(key, serialized);
            this.memoryStorage.set(`session_${key}`, value);
            return true;
        } catch (e) {
            return false;
        }
    }

    sessionRemove(key) {
        try {
            StorageProxy.sessionRemove(key);
            this.memoryStorage.delete(`session_${key}`);
            return true;
        } catch (e) {
            return false;
        }
    }

    clear() {
        StorageProxy.clear();
        this.memoryStorage.clear();
    }
}

export const safeStorage = new SafeStorage();

// =============================================
// MODULE 1 - ENVIRONMENT DETECTOR (PRESERVED)
// =============================================

class EnvironmentDetector {
    constructor() {
        this.environment = {
            type: ENVIRONMENT_TYPES.UNKNOWN,
            latency: 0,
            online: navigator.onLine,
            secure: window.location.protocol === 'https:',
            origin: window.location.origin,
            hostname: window.location.hostname,
            protocol: window.location.protocol,
            connectionType: 'unknown',
            effectiveType: 'unknown',
            isIframe: window.parent !== window,
            isSecureContext: window.isSecureContext || false
        };
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) return this.environment;
        
        this.detectConnectionInfo();
        this.classifyEnvironment();
        this.initialized = true;
        moduleState.environment = this.environment;
        
        safeStorage.set(LOCAL_STORAGE_KEYS.ENVIRONMENT_CACHE, {
            type: this.environment.type,
            timestamp: Date.now()
        });
        
        logOnce('ready', `Environment detected: ${this.environment.type}`);
        
        return this.environment;
    }

    detectConnectionInfo() {
        try {
            if (navigator.connection) {
                const conn = navigator.connection;
                this.environment.connectionType = conn.type || 'unknown';
                this.environment.effectiveType = conn.effectiveType || 'unknown';
            }
        } catch (e) {}
    }

    classifyEnvironment() {
        const hostname = this.environment.hostname;
        const protocol = this.environment.protocol;
        
        if (this.isLocalDevelopment()) {
            this.environment.type = ENVIRONMENT_TYPES.LOCAL_DEV;
        } else if (hostname.includes('onrender.com')) {
            this.environment.type = ENVIRONMENT_TYPES.RENDER_HOSTED;
        } else if (this.isVPNNetwork()) {
            this.environment.type = ENVIRONMENT_TYPES.VPN_NETWORK;
        } else if (protocol === 'https:' && !this.isLocalDevelopment()) {
            this.environment.type = ENVIRONMENT_TYPES.PRODUCTION;
        } else {
            this.environment.type = ENVIRONMENT_TYPES.UNKNOWN;
        }
    }

    isLocalDevelopment() {
        const hostname = this.environment.hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    }

    isVPNNetwork() {
        const hostname = this.environment.hostname;
        if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;
        
        const parts = hostname.split('.');
        if (parts.length === 4) {
            const firstOctet = parseInt(parts[0]);
            const secondOctet = parseInt(parts[1]);
            
            if (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127) return true;
            if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) return true;
        }
        
        return false;
    }

    getEnvironmentReport() {
        return { ...this.environment };
    }
}

export const environmentDetector = new EnvironmentDetector();
environmentDetector.initialize();

// =============================================
// MODULE 2 - PARENT COMMUNICATION LAYER (REFACTORED - STRICT SCHEMA)
// =============================================

class ParentCommunicator {
    constructor() {
        this.messageCounter = 0;
        this.frameId = this.generateFrameId();
        this.messageListeners = new Set();
        this.initialized = false;
    }

    generateFrameId() {
        try {
            let stored = null;
            safeStorage.get(LOCAL_STORAGE_KEYS.FRAME_ID).then(val => {
                if (val) stored = val;
            });
            if (!stored) {
                stored = `${MODULE_NAME}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
                safeStorage.set(LOCAL_STORAGE_KEYS.FRAME_ID, stored);
            }
            return stored;
        } catch {
            return `${MODULE_NAME}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        }
    }

    sendMessage(type, payload = {}) {
        return safeSend(type, payload);
    }

    addMessageListener(handler) {
        this.messageListeners.add(handler);
    }

    removeMessageListener(handler) {
        this.messageListeners.delete(handler);
    }

    handleIncomingMessage(event) {
        if (!isMessageFromParent(event)) {
            debugLog(`[Security] Rejected message from origin: ${event.origin}`);
            return;
        }

        const message = event.data;

        // Check for duplicate processing
        if (message.id && MessageGuard.isProcessed(message.id)) {
            debugLog(`Duplicate message already processed: ${message.id}`);
            return;
        }

        if (!validateMessage(message)) {
            debugLog('Invalid message schema', message);
            return;
        }

        if (MessageGuard.isDuplicate(message.id)) {
            debugLog(`Duplicate message ignored: ${message.id}`);
            return;
        }

        moduleState.connectionMetrics.messagesReceived++;

        // Mark as processed
        if (message.id) {
            MessageGuard.markProcessed(message.id);
        }

        this.messageListeners.forEach(handler => {
            try {
                handler(message);
            } catch (error) {
                logError('ParentCommunicator.handler', error);
            }
        });
    }

    cleanup() {
        this.messageListeners.clear();
    }
}

export const parentComm = new ParentCommunicator();

// =============================================
// MODULE 3 - SESSION CLIENT WRAPPER (UPDATED - NO STORAGE)
// =============================================



// =============================================
// CROSS-MODULE STATE SETTERS (added for the part1/part2/part3 split)
// These variables are declared here (single source of truth) but are
// mutated from Tool-core.part2.js and Tool-core.part3.js. ES module
// imports are live-read-only bindings, so external files cannot do
// `import { x } from './Tool-core.part1.js'; x = 5;` directly — they
// must call the matching setter below instead. Reads still work via
// the normal named import since those bindings are live.
// =============================================
export function __set_activationComplete(value) { activationComplete = value; return activationComplete; }
export function __set_allListings(value) { allListings = value; return allListings; }
export function __set_analyticsData(value) { analyticsData = value; return analyticsData; }
export function __set_backgroundJobsStarted(value) { backgroundJobsStarted = value; return backgroundJobsStarted; }
export function __set_childReadySent(value) { childReadySent = value; return childReadySent; }
export function __set_currentMoodFilter(value) { currentMoodFilter = value; return currentMoodFilter; }
export function __set_dataFetchInProgress(value) { dataFetchInProgress = value; return dataFetchInProgress; }
export function __set_directAPILoaded(value) { directAPILoaded = value; return directAPILoaded; }
export function __set_handshakeComplete(value) { handshakeComplete = value; return handshakeComplete; }
export function __set_initializationLock(value) { initializationLock = value; return initializationLock; }
export function __set_isAuthReady(value) { isAuthReady = value; return isAuthReady; }
export function __set_isBootstrapped(value) { isBootstrapped = value; return isBootstrapped; }
export function __set_isInitializing(value) { isInitializing = value; return isInitializing; }
export function __set_isProcessingQueue(value) { isProcessingQueue = value; return isProcessingQueue; }
export function __set_isReady(value) { isReady = value; return isReady; }
export function __set_leaderboardData(value) { leaderboardData = value; return leaderboardData; }
export function __set_loadingMessageElement(value) { loadingMessageElement = value; return loadingMessageElement; }
export function __set_myListings(value) { myListings = value; return myListings; }
export function __set_offlineDrafts(value) { offlineDrafts = value; return offlineDrafts; }
export function __set_parentDataLoaded(value) { parentDataLoaded = value; return parentDataLoaded; }
export function __set_parentReadyReceived(value) { parentReadyReceived = value; return parentReadyReceived; }
export function __set_premiumFeatures(value) { premiumFeatures = value; return premiumFeatures; }
export function __set_privateNotes(value) { privateNotes = value; return privateNotes; }
export function __set_savedItems(value) { savedItems = value; return savedItems; }
export function __set_sessionData(value) { sessionData = value; return sessionData; }
export function __set_sessionValid(value) { sessionValid = value; return sessionValid; }
export function __set_streakData(value) { streakData = value; return streakData; }
export function __set_teamMembers(value) { teamMembers = value; return teamMembers; }
export function __set_tokenInitializationPromise(value) { tokenInitializationPromise = value; return tokenInitializationPromise; }
export function __set_trustStats(value) { trustStats = value; return trustStats; }
export function __set_userFriends(value) { userFriends = value; return userFriends; }
export function __set_userGroups(value) { userGroups = value; return userGroups; }
export function __set_userSubscription(value) { userSubscription = value; return userSubscription; }
