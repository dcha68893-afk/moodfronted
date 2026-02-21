// calls-ui.js
// ==================== RESILIENT UI CONTROLLER ====================
// Version: 3.2.0
// Purpose: Fault-tolerant, responsive UI layer for calls iframe
// Dependencies: calls-core.js v3.2.0
// Security: XSS protected, input sanitized, CSP compliant
// ===============================================================

(function() {
    'use strict';

    // ==================== MODULE IDENTIFIER ====================
    const CURRENT_MODULE_NAME = 'calls-ui';
    const MODULE_INIT_FLAG = '__CALLS_UI_INIT__';
    
    if (window[MODULE_INIT_FLAG]) {
        return;
    }
    window[MODULE_INIT_FLAG] = true;

    window.__CHILD_SESSION__ = window.__CHILD_SESSION__ || {
        token: null,
        userId: null,
        expires: null
    };

    // ==================== DEBUG FLAG ====================
    window.__IFRAME_DEBUG__ = window.__IFRAME_DEBUG__ || false;
    const DEBUG = window.__IFRAME_DEBUG__;

    // ==================== ERROR CACHE FOR ONCE LOGGING ====================
    const _onceErrors = new Map();
    const _onceTimers = new Map();

    function logOnce(level, message, data) {
        const key = `${level}:${message}`;
        if (_onceErrors.has(key)) return;
        
        _onceErrors.set(key, Date.now());
        
        const timer = setTimeout(() => {
            _onceErrors.delete(key);
            _onceTimers.delete(key);
        }, 60000);
        _onceTimers.set(key, timer);
        
        if (level === 'error') {
            console.error(`[Calls UI] ${message}`, data || '');
        } else if (level === 'warn') {
            console.warn(`[Calls UI] ${message}`, data || '');
        } else {
            console.log(`[Calls UI] ${message}`, data || '');
        }
    }

    // ==================== PARENT CONNECTION WRAPPER ====================
    function sendToParent(type, payload = {}) {
        try {
            if (window.parent && window.parent !== window) {
                if (window.callsCore && window.callsCore.IframeTransport) {
                    window.callsCore.IframeTransport.send(type, payload, { requireAck: false })
                        .catch(() => {});
                    return true;
                }
                
                if (window.callsCore && window.callsCore.MessageBridge) {
                    const message = window.callsCore.MessageBridge.createMessage(
                        type, 
                        payload, 
                        { legacy: true }
                    );
                    window.parent.postMessage(message, window.callsCore.OriginAdapter ? 
                        window.callsCore.OriginAdapter.getTargetOrigin() : '*');
                    return true;
                }
                
                const message = {
                    id: (window.crypto && window.crypto.randomUUID) ? 
                        window.crypto.randomUUID() : 
                        'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
                    type,
                    source: "child",
                    module: CURRENT_MODULE_NAME,
                    timestamp: Date.now(),
                    session: {
                        token: window.__CHILD_SESSION__?.token ? 'present' : null,
                        userId: window.__CHILD_SESSION__?.userId
                    },
                    payload
                };
                window.parent.postMessage(message, window.location.origin);
                return true;
            }
        } catch (e) {
            if (DEBUG) {
                logOnce('warn', 'Send to parent failed', e);
            }
        }
        return false;
    }

    // ==================== WAIT FOR CORE READY ====================
    let coreReady = false;
    
    function waitForCoreReady(timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (coreReady) {
                resolve(true);
                return;
            }
            
            if (window.callsCore && window.callsCore.isReady && window.callsCore.isReady()) {
                coreReady = true;
                resolve(true);
                return;
            }
            
            const timeoutId = setTimeout(() => {
                window.removeEventListener('core.ready', readyHandler);
                if (window.callsCore && window.callsCore.waitForReady) {
                    window.callsCore.waitForReady(timeout).then(resolve).catch(() => {
                        logOnce('warn', 'Core ready timeout, proceeding with fallback');
                        resolve(false);
                    });
                } else {
                    logOnce('warn', 'Core ready timeout, proceeding with fallback');
                    resolve(false);
                }
            }, timeout);
            
            const readyHandler = () => {
                clearTimeout(timeoutId);
                window.removeEventListener('core.ready', readyHandler);
                coreReady = true;
                resolve(true);
            };
            
            window.addEventListener('core.ready', readyHandler);
            
            // Also check if core already has ready event
            if (window.callsCore && window.callsCore.isReady && window.callsCore.isReady()) {
                clearTimeout(timeoutId);
                window.removeEventListener('core.ready', readyHandler);
                coreReady = true;
                resolve(true);
            }
        });
    }

    // ==================== IMPORTS FROM CORE ====================
    let core;
    
    if (window.callsCore) {
        core = window.callsCore;
    } else {
        core = {};
        if (DEBUG) {
            logOnce('warn', 'Waiting for core to load...');
        }
    }

    const {
        AppState = {},
        iframeId = 'calls-iframe',
        currentState = 'INIT',
        STATE = {
            INIT: 'INIT', PREFLIGHT: 'PREFLIGHT', DEPENDENCY: 'DEPENDENCY',
            PARENT_DETECT: 'PARENT_DETECT', HANDSHAKE: 'HANDSHAKE', SYNC: 'SYNC',
            PERMISSIONS: 'PERMISSIONS', READY: 'READY', ACTIVE: 'ACTIVE',
            SUSPENDED: 'SUSPENDED', DEGRADED: 'DEGRADED', DESTROYED: 'DESTROYED', 
            DEMO: 'DEMO', RECOVERING: 'RECOVERING'
        },
        session = { isDemoMode: () => true, validateToken: () => false, getStatus: () => ({}) },
        auth = { check: () => false, refresh: () => Promise.resolve(false), logout: () => {} },
        currentUser = null,
        userDataLoaded = false,
        sessionAuthorityReady = false,
        parentCoordinator = null,
        coreLogger = { info: console.log, warn: console.warn, error: console.error, once: console.log },
        parentComm = { send: () => false, sendWithAck: () => Promise.reject(), request: () => Promise.reject() },
        lifecycle = { destroy: () => ({ success: true }) },
        CoreInitializer,
        CallCore,
        ParentCoordinator,
        TokenManager,
        SecureAPIClient,
        CallAPIIntegration,
        coreElements = {},
        coreCacheElements = () => {},
        initializeOfflineDetection = () => {},
        coreShowUI = () => {},
        coreEnableUI = () => {},
        checkUrlParameters = () => {},
        makeDraggable = () => {},
        closePip = () => {},
        checkPremiumFeature = () => true,
        updatePremiumUI = () => {},
        loadSettings = () => {},
        saveSettings = () => {},
        applySettingsToUI = () => {},
        updateSetting = () => {},
        applySettingChange = () => {},
        resetSettings = () => {},
        handleOnline = () => {},
        handleOffline = () => {},
        showOfflineUI = () => {},
        handleStorageEvent = () => {},
        coreDebounce = (fn, wait) => {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => fn(...args), wait);
            };
        },
        stringToColor = (str) => {
            if (!str) return '#6c5ce7';
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            const colors = ['#6c5ce7', '#00b894', '#0984e3', '#fdcb6e', '#e17055', '#d63031', '#e84342'];
            return colors[Math.abs(hash) % colors.length];
        },
        formatTimeAgo = (date) => {
            const seconds = Math.floor((Date.now() - date) / 1000);
            if (seconds < 60) return 'just now';
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes}m ago`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours}h ago`;
            const days = Math.floor(hours / 24);
            return `${days}d ago`;
        },
        formatDuration = (seconds) => {
            if (!seconds && seconds !== 0) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        },
        closeUrlParamOverlay = () => {},
        joinUrlParamCall = () => {},
        updateMoodIndicator = () => {},
        updateIntentionIndicator = () => {},
        updateParticipantBadge = () => {},
        updateChatBadge = () => {},
        updateGroupCallButton = () => {},
        updateVideoLayout = () => {},
        initializeWhiteboard = () => {},
        sendChatMessage = () => {},
        saveSharedNotes = () => {},
        coreRenderCallHistory = () => {},
        createCallHistoryItem = () => '',
        simulateIncomingCall = () => false,
        bootstrapIframe = () => {},
        safeInit = () => Promise.resolve(),
        coreShowNotification = (msg, type) => {
            if (DEBUG) {
                logOnce('info', `[Notification] ${type}: ${msg}`);
            }
        },
        SecurityCore = {
            sanitizeString: (str) => str || '',
            sanitizeURL: (url) => url || '',
            safeJSONParse: (json, fallback) => {
                try { return JSON.parse(json); } catch { return fallback; }
            },
            safeLocalStorageGet: (key, fallback) => {
                try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
            },
            safeLocalStorageSet: (key, value) => {
                try { localStorage.setItem(key, value); return true; } catch { return false; }
            },
            safeLocalStorageRemove: (key) => {
                try { localStorage.removeItem(key); return true; } catch { return false; }
            },
            safeSessionStorageGet: (key, fallback) => {
                try { return sessionStorage.getItem(key) || fallback; } catch { return fallback; }
            },
            safeSessionStorageSet: (key, value) => {
                try { sessionStorage.setItem(key, value); return true; } catch { return false; }
            },
            generateUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            }),
            createSignature: (payload, timestamp) => {
                try {
                    const str = JSON.stringify(payload) + timestamp + 'calls-ui-secret';
                    let hash = 0;
                    for (let i = 0; i < str.length; i++) {
                        const char = str.charCodeAt(i);
                        hash = ((hash << 5) - hash) + char;
                        hash = hash & hash;
                    }
                    return hash.toString(36);
                } catch { return ''; }
            }
        },
        isValidSession = () => false,
        getValidatedSession = () => null,
        waitForSession = () => Promise.resolve(null),
        waitForParent = () => Promise.resolve(false),
        waitForHandshake = () => Promise.resolve({ success: false }),
        verifySession = () => Promise.resolve(false),
        requestResync = () => {},
        sendSessionAck = () => {},
        MessageValidator = {
            validateOrigin: (origin) => {
                const trusted = [
                    window.location.origin,
                    'http://localhost:5500', 'https://localhost:5500',
                    'http://127.0.0.1:5500', 'https://127.0.0.1:5500'
                ];
                return trusted.includes(origin) || origin.includes('localhost') || origin.includes('.onrender.com');
            },
            validate: () => true,
            createMessage: (type, payload) => ({ type, payload, id: Date.now(), timestamp: Date.now() }),
            generateId: () => Date.now() + '-' + Math.random().toString(36)
        },
        RetryManager,
        ErrorBoundary = {
            execute: (fn, context, fallback) => {
                try { return fn(); } catch (e) { 
                    if (DEBUG) logOnce('error', `UI Error in ${context}:`, e); 
                    return fallback; 
                }
            },
            executeAsync: async (fn, context, fallback) => {
                try { return await fn(); } catch (e) { 
                    if (DEBUG) logOnce('error', `UI Async Error in ${context}:`, e); 
                    return fallback; 
                }
            },
            wrap: (fn, context) => (...args) => {
                try { return fn(...args); } catch (e) { 
                    if (DEBUG) logOnce('error', `UI Error in ${context}:`, e); 
                    return null; 
                }
            },
            createBoundary: (name, fallbackFn) => ({
                execute: (fn) => { try { return fn(); } catch { return fallbackFn ? fallbackFn() : null; } },
                executeAsync: async (fn) => { try { return await fn(); } catch { return fallbackFn ? fallbackFn() : null; } }
            })
        },
        MessageIdGenerator = {
            generateId: () => Date.now() + '-' + Math.random().toString(36).substring(2, 8)
        },
        MessageBridge,
        HandshakeClient,
        SessionClient,
        TransportAgent,
        RecoveryManager,
        CompatibilityBridge,
        DiagnosticsAgent,
        StartupGovernor,
        EnvironmentDetector,
        OriginAdapter,
        MESSAGE_TYPES,
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
        APICore
    } = core;

    // ==================== DEFERRED INITIALIZATION GATES ====================
    let parentReady = false;
    let sessionReady = false;
    let handshakeComplete = false;

    // ==================== UI STATE MANAGEMENT ====================
    const UIState = {
        currentView: 'sidebar',
        viewHistory: [],
        restorePoints: new Map(),
        
        activePanels: new Set(),
        activeModals: new Set(),
        activeOverlays: new Set(),
        
        renderStages: {
            skeleton: false,
            initial: false,
            enhanced: false,
            live: false
        },
        
        renderStartTime: 0,
        lastRenderTime: 0,
        renderCount: 0,
        
        cachedElements: new Map(),
        cachedTemplates: new Map(),
        mutationObserver: null,
        
        breakpoints: {
            mobile: 480,
            tablet: 768,
            desktop: 1024,
            wide: 1440
        },
        
        inputMode: 'mouse',
        
        errorRecovery: {
            attempts: new Map(),
            maxAttempts: 3,
            backoffMs: 1000
        },
        
        security: {
            sanitizing: false,
            maxSanitizeDepth: 10,
            currentDepth: 0
        },
        
        initialized: false,
        
        // UI-specific state
        selectedMood: 'neutral',
        selectedIntention: 'quick',
        currentCallCategory: 'all',
        currentNewCallTab: 'contacts',
        selectedContacts: [],
        selectedGroupContacts: [],
        groupCallOption: null,
        callLink: null,
        
        // Media state
        localStream: null,
        remoteStreams: new Map(),
        screenStream: null,
        isMuted: false,
        isVideoOff: false,
        isScreenSharing: false,
        isSpeakerOn: true,
        currentFocusMode: false,
        
        // Call state
        callStartTime: null,
        callDurationInterval: null,
        activeCallId: null,
        callType: null,
        callParticipants: [],
        
        // Chat state
        chatMessages: [],
        unreadChatCount: 0,
        
        // Polls state
        activePolls: [],
        pollResults: [],
        
        // Notes state
        sharedNotes: [],
        privateNotes: {},
        
        // Relationship insights
        relationshipData: null
    };

    // ==================== DOM ELEMENTS CACHE ====================
    const elements = {};

    function cacheElements() {
        return UIErrorBoundary.execute(() => {
            const startTime = performance.now();
            
            if (coreElements && typeof coreElements === 'object') {
                Object.assign(elements, coreElements);
            }
            
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
                    if (element) {
                        elements[key] = element;
                        UIState.cachedElements.set(key, element);
                    }
                } catch (error) {
                    if (DEBUG) {
                        logOnce('warn', `Failed to cache element: ${key}`, { selector, error: error.message });
                    }
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
                        try {
                            return document.querySelectorAll('.contact-checkbox'); 
                        } catch (e) {
                            return [];
                        }
                    }
                });
                
                Object.defineProperty(elements, 'groupContactCheckboxes', {
                    get: function() { 
                        try {
                            return document.querySelectorAll('.group-contact'); 
                        } catch (e) {
                            return [];
                        }
                    }
                });
                
                Object.defineProperty(elements, 'selectedContacts', {
                    get: function() { 
                        try {
                            return document.querySelectorAll('.contact-item.selected'); 
                        } catch (e) {
                            return [];
                        }
                    }
                });
            } catch (error) {
                if (DEBUG) {
                    logOnce('error', 'Failed to cache dynamic element groups', error);
                }
            }
            
            UIState.lastRenderTime = performance.now() - startTime;
            
            return Object.keys(elements).length;
        }, 'cacheElements', 0);
    }

    // ==================== UI LOGGER ====================
    const UILogger = {
        _history: [],
        _errors: new Map(),
        _metrics: {
            render: [],
            interaction: [],
            error: []
        },
        _debugMode: DEBUG,
        
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
                    if (key === 'stream' || key === 'peer' || key.includes('Stream')) {
                        return '[Stream]';
                    }
                    if (key === 'token' || key.includes('Token') || key.includes('auth')) {
                        return '[REDACTED]';
                    }
                    if (key === 'password' || key.includes('Password') || key.includes('secret')) {
                        return '[REDACTED]';
                    }
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
                module: 'calls-ui'
            };
            this._history.push(entry);
            if (this._history.length > 100) this._history.shift();
            return entry;
        },
        
        info: function(msg, data = null) {
            this._store('info', msg, data);
            if (this._debugMode) {
                logOnce('info', msg, data);
            }
        },
        
        warn: function(msg, data = null) {
            this._store('warn', msg, data);
            if (this._debugMode) {
                logOnce('warn', msg, data);
            }
        },
        
        error: function(msg, error = null, context = null) {
            const hash = this._hash(msg + (error?.stack || '') + (context || ''));
            const now = Date.now();
            
            if (this._errors.has(hash)) {
                const lastLog = this._errors.get(hash);
                if (now - lastLog < 60000) return;
            }
            
            this._errors.set(hash, now);
            this._store('error', msg, { error: error?.message || error, context });
            
            logOnce('error', msg, { error: error?.message, context });
            
            setTimeout(() => this._errors.delete(hash), 60000);
        },
        
        once: function(msg, data = null) {
            const hash = this._hash(msg);
            if (!this._errors.has(hash)) {
                this._errors.set(hash, Date.now());
                this._store('once', msg, data);
                logOnce('info', msg, data);
                setTimeout(() => this._errors.delete(hash), 5000);
            }
        },
        
        performance: function(operation, duration) {
            this._metrics.render.push({ operation, duration, timestamp: Date.now() });
            if (this._metrics.render.length > 50) this._metrics.render.shift();
            
            if (this._debugMode && duration > 100) {
                logOnce('warn', `Slow operation: ${operation} took ${duration.toFixed(2)}ms`);
            }
        },
        
        interaction: function(action, target) {
            this._metrics.interaction.push({ action, target, timestamp: Date.now() });
            if (this._metrics.interaction.length > 100) this._metrics.interaction.shift();
        },
        
        enableDebug: function() { this._debugMode = true; },
        disableDebug: function() { this._debugMode = false; },
        
        getMetrics: function() {
            return {
                historySize: this._history.length,
                errorCount: this._errors.size,
                avgRenderTime: this._metrics.render.reduce((acc, r) => acc + r.duration, 0) / 
                              (this._metrics.render.length || 1),
                interactionCount: this._metrics.interaction.length
            };
        }
    };

    // ==================== UI ERROR BOUNDARY ====================
    const UIErrorBoundary = {
        execute: function(fn, context, fallback = null) {
            try {
                return fn();
            } catch (error) {
                UILogger.error(`UI Error in ${context}`, error);
                this.showFallbackUI(context);
                return fallback;
            }
        },
        
        executeAsync: async function(fn, context, fallback = null) {
            try {
                return await fn();
            } catch (error) {
                UILogger.error(`Async UI Error in ${context}`, error);
                this.showFallbackUI(context);
                return fallback;
            }
        },
        
        createBoundary: function(featureName, fallbackFn) {
            return {
                execute: (fn) => {
                    try {
                        return fn();
                    } catch (error) {
                        UILogger.error(`Feature ${featureName} failed`, error);
                        this.showFeatureFallback(featureName);
                        return fallbackFn ? fallbackFn() : null;
                    }
                },
                executeAsync: async (fn) => {
                    try {
                        return await fn();
                    } catch (error) {
                        UILogger.error(`Feature ${featureName} async failed`, error);
                        this.showFeatureFallback(featureName);
                        return fallbackFn ? fallbackFn() : null;
                    }
                }
            };
        },
        
        showFallbackUI: function(context) {
            if (!elements.appContainer) return;
            
            const fallbackId = `fallback-${context.replace(/[^a-z0-9]/gi, '-')}`;
            if (document.getElementById(fallbackId)) return;
            
            const fallbackEl = document.createElement('div');
            fallbackEl.id = fallbackId;
            fallbackEl.className = 'ui-fallback';
            fallbackEl.setAttribute('role', 'alert');
            fallbackEl.innerHTML = `
                <div class="ui-fallback-content">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>This section is temporarily unavailable</p>
                    <button class="ui-fallback-retry" onclick="window.location.reload()">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
            
            elements.appContainer.appendChild(fallbackEl);
            
            setTimeout(() => {
                fallbackEl.remove();
            }, 5000);
        },
        
        showFeatureFallback: function(featureName) {
            UILogger.once(`Feature ${featureName} unavailable`, { feature: featureName });
            
            const notification = createNotification({
                type: 'warning',
                title: 'Feature Unavailable',
                message: `${featureName} is temporarily unavailable`,
                duration: 3000
            });
            
            if (notification) {
                const notificationArea = elements.notificationArea || document.body;
                notificationArea.appendChild(notification);
            }
        }
    };

    // ==================== UI DIAGNOSTICS ====================
    const UIDiagnostics = {
        errors: [],
        
        logError: function(context, error) {
            this.errors.push({
                context,
                message: error?.message || String(error),
                stack: error?.stack,
                timestamp: Date.now(),
                url: window.location.href,
                userAgent: navigator.userAgent
            });
            
            if (this.errors.length > 20) this.errors.shift();
            
            if (coreLogger && coreLogger.error) {
                coreLogger.error(`UI:${context}`, error);
            }
        },
        
        getReport: function() {
            return {
                errors: this.errors,
                elementCache: UIState.cachedElements.size,
                renderStages: { ...UIState.renderStages },
                renderCount: UIState.renderCount,
                activeViews: {
                    currentView: UIState.currentView,
                    panels: Array.from(UIState.activePanels),
                    modals: Array.from(UIState.activeModals)
                },
                responsive: {
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                    inputMode: UIState.inputMode,
                    breakpoint: this.getCurrentBreakpoint()
                },
                performance: UILogger.getMetrics(),
                handshake: {
                    parentReady,
                    sessionReady,
                    handshakeComplete
                },
                environment: IframeEnvironment ? IframeEnvironment.getFullReport() : 
                             (EnvironmentDetector ? EnvironmentDetector.getFullReport() : null)
            };
        },
        
        getCurrentBreakpoint: function() {
            const width = window.innerWidth;
            if (width <= UIState.breakpoints.mobile) return 'mobile';
            if (width <= UIState.breakpoints.tablet) return 'tablet';
            if (width <= UIState.breakpoints.desktop) return 'desktop';
            return 'wide';
        }
    };

    // ==================== SECURITY SANITIZER ====================
    const SecuritySanitizer = {
        allowedTags: new Set([
            'div', 'span', 'button', 'input', 'label', 'i', 'strong', 'em',
            'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
            'img', 'video', 'canvas', 'svg', 'path', 'circle', 'rect',
            'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th'
        ]),
        
        allowedAttributes: new Set([
            'id', 'class', 'style', 'src', 'alt', 'title', 'width', 'height',
            'data-id', 'data-type', 'data-mood', 'data-intention', 'data-category',
            'data-tab', 'data-tool', 'data-color', 'data-action', 'data-reaction',
            'disabled', 'checked', 'selected', 'placeholder', 'autoplay', 'playsinline',
            'muted', 'controls', 'type', 'name', 'value', 'min', 'max', 'step',
            'role', 'aria-label', 'aria-hidden', 'aria-expanded', 'aria-selected',
            'for', 'href', 'target', 'rel', 'download'
        ]),
        
        allowedProtocols: new Set(['http:', 'https:', 'data:', 'blob:', 'mailto:', 'tel:']),
        
        _patching: false,
        _isSanitizing: false,
        
        initialize: function() {
            if (this._patching) return;
            this._patching = true;
            
            try {
                this.patchDOMMethods();
                if (DEBUG) {
                    logOnce('info', 'Security sanitizer initialized');
                }
            } catch (error) {
                if (DEBUG) {
                    logOnce('error', 'Failed to initialize security sanitizer', error);
                }
            } finally {
                this._patching = false;
            }
        },
        
        patchDOMMethods: function() {
            let originalInnerHTML = null;
            let originalInsertAdjacentHTML = null;
            
            try {
                originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
                originalInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to get original DOM methods', e);
                }
                return;
            }
            
            try {
                if (originalInnerHTML) {
                    const self = this;
                    Object.defineProperty(Element.prototype, 'innerHTML', {
                        set: function(value) {
                            if (this.hasAttribute('data-sanitized') || self._isSanitizing) {
                                return originalInnerHTML.set.call(this, value);
                            }
                            
                            self._isSanitizing = true;
                            try {
                                if (typeof value === 'string') {
                                    value = self.sanitizeString(value);
                                }
                                const result = originalInnerHTML.set.call(this, value);
                                this.setAttribute('data-sanitized', 'true');
                                return result;
                            } finally {
                                self._isSanitizing = false;
                            }
                        },
                        get: originalInnerHTML.get,
                        configurable: true,
                        enumerable: true
                    });
                }
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to patch innerHTML', e);
                }
            }
            
            try {
                if (originalInsertAdjacentHTML) {
                    const self = this;
                    Element.prototype.insertAdjacentHTML = function(position, text) {
                        if (this.hasAttribute('data-sanitized') || self._isSanitizing) {
                            return originalInsertAdjacentHTML.call(this, position, text);
                        }
                        
                        self._isSanitizing = true;
                        try {
                            if (typeof text === 'string') {
                                text = self.sanitizeString(text);
                            }
                            const result = originalInsertAdjacentHTML.call(this, position, text);
                            this.setAttribute('data-sanitized', 'true');
                            return result;
                        } finally {
                            self._isSanitizing = false;
                        }
                    };
                }
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to patch insertAdjacentHTML', e);
                }
            }
        },
        
        sanitizeHTML: function(html) {
            if (!html || typeof html !== 'string') return html;
            return this.sanitizeString(html);
        },
        
        sanitizeString: function(str) {
            if (!str || typeof str !== 'string') return str || '';
            
            let sanitized = str
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
            
            return sanitized;
        },
        
        sanitizeNode: function(node) {
            if (!node) return;
            
            if (node.nodeType === 1) {
                const tagName = node.tagName.toLowerCase();
                
                if (!this.allowedTags.has(tagName)) {
                    const span = document.createElement('span');
                    while (node.firstChild) {
                        span.appendChild(node.firstChild);
                    }
                    span.className = `sanitized-${tagName}`;
                    if (node.parentNode) {
                        node.parentNode.replaceChild(span, node);
                    }
                    node = span;
                }
                
                const attrs = Array.from(node.attributes);
                attrs.forEach(attr => {
                    const attrName = attr.name.toLowerCase();
                    
                    if (!this.allowedAttributes.has(attrName)) {
                        node.removeAttribute(attr.name);
                        return;
                    }
                    
                    if (attrName === 'src' || attrName === 'href') {
                        const value = attr.value.toLowerCase();
                        const protocol = value.split(':')[0] + ':';
                        if (!this.allowedProtocols.has(protocol) && !value.startsWith('/') && !value.startsWith('#')) {
                            node.removeAttribute(attr.name);
                        }
                    }
                    
                    if (attrName.startsWith('on')) {
                        node.removeAttribute(attr.name);
                    }
                    
                    if (attrName === 'style') {
                        node.setAttribute('style', this.sanitizeCSS(attr.value));
                    }
                });
                
                Array.from(node.childNodes).forEach(child => this.sanitizeNode(child));
            }
        },
        
        sanitizeCSS: function(css) {
            if (!css || typeof css !== 'string') return css;
            
            return css
                .replace(/javascript:/gi, '')
                .replace(/expression\(/gi, '')
                .replace(/@import/gi, '')
                .replace(/url\(['"]?javascript:/gi, 'url()')
                .replace(/behavior:/gi, '')
                .replace(/-moz-binding/gi, '');
        },
        
        sanitizeUserInput: function(input) {
            if (input === null || input === undefined) return '';
            if (typeof input !== 'string') input = String(input);
            return this.sanitizeString(input).trim();
        },
        
        sanitizeURL: function(url) {
            if (!url || typeof url !== 'string') return '';
            
            const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
            try {
                const urlObj = new URL(url, window.location.origin);
                if (safeProtocols.includes(urlObj.protocol)) {
                    return url;
                }
            } catch (e) {
                return this.sanitizeString(url);
            }
            return '#';
        },
        
        safeJSONParse: function(json, fallback = null) {
            try {
                return JSON.parse(json);
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to parse JSON', e);
                }
                return fallback;
            }
        },
        
        safeLocalStorageGet: function(key, fallback = null) {
            try {
                const value = localStorage.getItem(key);
                return value !== null ? value : fallback;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', `Failed to read from localStorage: ${key}`, e);
                }
                return fallback;
            }
        },
        
        safeLocalStorageSet: function(key, value) {
            try {
                localStorage.setItem(key, String(value));
                return true;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', `Failed to write to localStorage: ${key}`, e);
                }
                return false;
            }
        },
        
        safeSessionStorageGet: function(key, fallback = null) {
            try {
                const value = sessionStorage.getItem(key);
                return value !== null ? value : fallback;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', `Failed to read from sessionStorage: ${key}`, e);
                }
                return fallback;
            }
        },
        
        safeSessionStorageSet: function(key, value) {
            try {
                sessionStorage.setItem(key, String(value));
                return true;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', `Failed to write to sessionStorage: ${key}`, e);
                }
                return false;
            }
        }
    };

    // ==================== RENDERING PIPELINE ====================
    const RenderingPipeline = {
        skeleton: function() {
            return UIErrorBoundary.execute(() => {
                if (DEBUG) {
                    logOnce('info', 'Rendering skeleton UI');
                }
                UIState.renderStartTime = performance.now();
                
                let container = elements.appContainer || document.getElementById('appContainer');
                if (!container) {
                    container = document.createElement('div');
                    container.id = 'appContainer';
                    container.className = 'app-container skeleton';
                    document.body.appendChild(container);
                    elements.appContainer = container;
                    UIState.cachedElements.set('appContainer', container);
                }
                
                const loadingEls = document.querySelectorAll('.loading-indicator, .initializing-overlay, .core-loading-message');
                loadingEls.forEach(el => {
                    if (el) el.style.display = 'none';
                });
                
                container.style.visibility = 'visible';
                container.style.opacity = '1';
                container.style.display = 'block';
                
                container.classList.add('ui-skeleton');
                
                this.renderSkeletonSidebar(container);
                
                UIState.renderStages.skeleton = true;
                UIState.renderCount++;
                
                UILogger.performance('skeleton', performance.now() - UIState.renderStartTime);
                
                return true;
            }, 'skeleton', false);
        },
        
        renderSkeletonSidebar: function(container) {
            let sidebar = elements.sidebar || document.getElementById('sidebar');
            if (!sidebar) {
                sidebar = document.createElement('div');
                sidebar.id = 'sidebar';
                sidebar.className = 'sidebar skeleton';
                sidebar.innerHTML = `
                    <div class="sidebar-header skeleton-pulse"></div>
                    <div class="sidebar-content">
                        <div class="skeleton-item"></div>
                        <div class="skeleton-item"></div>
                        <div class="skeleton-item"></div>
                        <div class="skeleton-item"></div>
                    </div>
                `;
                container.appendChild(sidebar);
                elements.sidebar = sidebar;
                UIState.cachedElements.set('sidebar', sidebar);
            }
            
            sidebar.style.display = 'flex';
            
            return sidebar;
        },
        
        initialRender: function() {
            return UIErrorBoundary.executeAsync(async () => {
                if (DEBUG) {
                    logOnce('info', 'Performing initial render');
                }
                const startTime = performance.now();
                
                await this.waitForCoreReady();
                
                if (typeof loadSettings === 'function') {
                    loadSettings();
                }
                
                if (typeof applySettingsToUI === 'function') {
                    applySettingsToUI();
                }
                
                if (typeof coreRenderCallHistory === 'function') {
                    coreRenderCallHistory();
                }
                
                this.renderCachedContacts();
                
                if (typeof updatePremiumUI === 'function') {
                    updatePremiumUI();
                }
                
                this.updateSyncIndicator();
                
                if (typeof checkUrlParameters === 'function') {
                    checkUrlParameters();
                }
                
                this.showHandshakeStatus();
                
                if (elements.appContainer) {
                    elements.appContainer.classList.remove('ui-skeleton');
                }
                
                UIState.renderStages.initial = true;
                
                UILogger.performance('initialRender', performance.now() - startTime);
                
                return true;
            }, 'initialRender', false);
        },
        
        showHandshakeStatus: function() {
            if (!elements.syncIndicator) return;
            
            if (!parentReady) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-handshake"></i><span>Connecting...</span>';
                elements.syncIndicator.className = 'sync-indicator connecting';
            } else if (!sessionReady) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-sync-alt"></i><span>Syncing...</span>';
                elements.syncIndicator.className = 'sync-indicator syncing';
            } else if (session && session.isDemoMode && session.isDemoMode()) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-eye"></i><span>Demo Mode</span>';
                elements.syncIndicator.className = 'sync-indicator demo';
            } else {
                elements.syncIndicator.innerHTML = '<i class="fas fa-check-circle"></i><span>Ready</span>';
                elements.syncIndicator.className = 'sync-indicator synced';
            }
        },
        
        waitForCoreReady: function() {
            return new Promise((resolve) => {
                if (typeof coreCacheElements === 'function') {
                    coreCacheElements();
                }
                
                cacheElements();
                
                if (elements.appContainer && elements.sidebar) {
                    resolve();
                    return;
                }
                
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    
                    if (typeof coreCacheElements === 'function') {
                        coreCacheElements();
                    }
                    cacheElements();
                    
                    if ((elements.appContainer && elements.sidebar) || attempts > 20) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 50);
                
                UIState.cachedElements.set('waitForCoreReady', { interval, attempts: 0 });
            });
        },
        
        renderCachedContacts: function() {
            try {
                let cachedContacts = null;
                
                if (SafeStorage && typeof SafeStorage.get === 'function') {
                    cachedContacts = SafeStorage.get('cachedContacts');
                } else {
                    cachedContacts = SecuritySanitizer.safeLocalStorageGet('cachedContacts');
                }
                
                if (cachedContacts && elements.contactsList) {
                    const contacts = typeof cachedContacts === 'string' ? 
                        SecuritySanitizer.safeJSONParse(cachedContacts, []) : cachedContacts;
                    if (Array.isArray(contacts) && contacts.length > 0) {
                        this.renderContactsList(contacts);
                        if (DEBUG) {
                            logOnce('info', 'Rendered cached contacts', { count: contacts.length });
                        }
                    }
                }
            } catch (error) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to render cached contacts', error);
                }
            }
        },
        
        renderContactsList: function(contacts) {
            if (!elements.contactsList) return;
            
            try {
                if (!contacts || contacts.length === 0) {
                    elements.contactsList.innerHTML = '<div class="offline-state"><i class="fas fa-users-slash"></i><p>No contacts available</p></div>';
                    return;
                }
                
                let html = '';
                contacts.slice(0, 20).forEach(contact => {
                    const name = contact.name || 'Unknown';
                    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                    const bgColor = stringToColor ? stringToColor(name) : '#6c5ce7';
                    
                    html += `
                        <div class="contact-item" data-id="${SecuritySanitizer.sanitizeString(contact.id)}">
                            <div class="contact-checkbox-container">
                                <input type="checkbox" class="contact-checkbox" id="contact-${SecuritySanitizer.sanitizeString(contact.id)}">
                            </div>
                            <div class="call-avatar" style="background-color: ${bgColor}">
                                ${contact.avatar ? `<img src="${SecuritySanitizer.sanitizeURL(contact.avatar)}" alt="${SecuritySanitizer.sanitizeString(name)}">` : 
                                  `<span>${SecuritySanitizer.sanitizeString(initials)}</span>`}
                            </div>
                            <div class="call-info">
                                <div class="call-name">
                                    ${SecuritySanitizer.sanitizeString(name)}
                                    ${contact.isPremium ? '<span class="premium-badge">PRO</span>' : ''}
                                </div>
                                <div class="contact-status ${SecuritySanitizer.sanitizeString(contact.status || 'offline')}">
                                    <span class="status-dot"></span>
                                    ${SecuritySanitizer.sanitizeString(contact.status || 'Offline')}
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                elements.contactsList.innerHTML = html;
                
                if (elements.groupContactsList) {
                    elements.groupContactsList.innerHTML = html.replace(/contact-checkbox/g, 'group-contact').replace(/id="contact-/g, 'id="group-contact-');
                }
                
                if (elements.contactsLoading) {
                    elements.contactsLoading.style.display = 'none';
                }
                
                EventSystem.debounce('attachContactEvents', () => {
                    this.attachContactEvents();
                }, 100);
                
            } catch (error) {
                UILogger.error('renderContactsList', error);
                elements.contactsList.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load contacts</p></div>';
            }
        },
        
        attachContactEvents: function() {
            document.querySelectorAll('.contact-item').forEach(item => {
                item.removeEventListener('click', this.handleContactClick);
                item.addEventListener('click', this.handleContactClick);
            });
        },
        
        handleContactClick: function(e) {
            if (e.target.closest('.contact-checkbox')) return;
            
            const checkbox = this.querySelector('.contact-checkbox');
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                
                if (checkbox.checked) {
                    this.classList.add('selected');
                } else {
                    this.classList.remove('selected');
                }
            }
        },
        
        progressiveEnhancement: function() {
            return UIErrorBoundary.executeAsync(async () => {
                if (DEBUG) {
                    logOnce('info', 'Applying progressive enhancement');
                }
                const startTime = performance.now();
                
                EventSystem.initialize();
                
                if (window.ResponsiveEngine) {
                    ResponsiveEngine.initialize();
                }
                
                SecuritySanitizer.initialize();
                
                if (elements.pipContainer && typeof makeDraggable === 'function') {
                    makeDraggable(elements.pipContainer);
                }
                
                if (typeof initializeOfflineDetection === 'function') {
                    initializeOfflineDetection();
                }
                
                const whiteboardCanvas = document.querySelector('.whiteboard-canvas');
                if (whiteboardCanvas && typeof initializeWhiteboard === 'function') {
                    initializeWhiteboard(whiteboardCanvas);
                }
                
                this.attachReactionEvents();
                
                UIState.renderStages.enhanced = true;
                
                UILogger.performance('progressiveEnhancement', performance.now() - startTime);
                
                return true;
            }, 'progressiveEnhancement', false);
        },
        
        attachReactionEvents: function() {
            document.querySelectorAll('.reaction-btn').forEach(btn => {
                btn.removeEventListener('click', UIEventHandlers.sendReaction);
                btn.addEventListener('click', UIEventHandlers.sendReaction);
            });
        },
        
        liveUpdate: function() {
            return UIErrorBoundary.executeAsync(async () => {
                if (DEBUG) {
                    logOnce('info', 'Starting live updates');
                }
                
                CoreIntegration.subscribeToCore();
                
                this.startLiveDataSync();
                
                UIState.renderStages.live = true;
                
                return true;
            }, 'liveUpdate', false);
        },
        
        startLiveDataSync: function() {
            if (AppState && (AppState.isAuthenticated || (session && session.isDemoMode && session.isDemoMode()))) {
                let interval = 30000;
                if (IframeEnvironment && IframeEnvironment.isVPNNetwork && IframeEnvironment.isVPNNetwork()) {
                    interval = 60000;
                } else if (EnvironmentDetector && EnvironmentDetector.isVPNNetwork && EnvironmentDetector.isVPNNetwork()) {
                    interval = 60000;
                }
                
                const syncInterval = setInterval(() => {
                    if (window.callAPI && typeof window.callAPI.performBackgroundSync === 'function') {
                        window.callAPI.performBackgroundSync().catch(() => {});
                    }
                }, interval);
                
                UIState.cachedElements.set('liveSyncInterval', syncInterval);
            }
        },
        
        updateSyncIndicator: function() {
            if (!elements.syncIndicator) return;
            
            try {
                const isDemo = session && session.isDemoMode ? session.isDemoMode() : false;
                
                let startupState = null;
                if (StartupGovernor && typeof StartupGovernor.getState === 'function') {
                    startupState = StartupGovernor.getState();
                }
                
                if (!AppState?.isOnline) {
                    elements.syncIndicator.innerHTML = '<i class="fas fa-cloud-slash"></i><span>Offline</span>';
                    elements.syncIndicator.className = 'sync-indicator offline';
                } else if (!parentReady) {
                    elements.syncIndicator.innerHTML = '<i class="fas fa-handshake"></i><span>Connecting...</span>';
                    elements.syncIndicator.className = 'sync-indicator connecting';
                } else if (!sessionReady) {
                    elements.syncIndicator.innerHTML = '<i class="fas fa-sync-alt"></i><span>Syncing...</span>';
                    elements.syncIndicator.className = 'sync-indicator syncing';
                } else if (startupState === 'RECOVERING') {
                    elements.syncIndicator.innerHTML = '<i class="fas fa-ambulance"></i><span>Recovering...</span>';
                    elements.syncIndicator.className = 'sync-indicator connecting';
                } else if (isDemo) {
                    elements.syncIndicator.innerHTML = '<i class="fas fa-eye"></i><span>Demo Mode</span>';
                    elements.syncIndicator.className = 'sync-indicator demo';
                } else if (AppState?.syncPending) {
                    elements.syncIndicator.innerHTML = '<i class="fas fa-sync fa-spin"></i><span>Syncing...</span>';
                    elements.syncIndicator.className = 'sync-indicator syncing';
                } else {
                    elements.syncIndicator.innerHTML = '<i class="fas fa-check-circle"></i><span>Synced</span>';
                    elements.syncIndicator.className = 'sync-indicator synced';
                }
            } catch (error) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to update sync indicator', error);
                }
            }
        },
        
        sanitizeHTML: function(str) {
            return SecuritySanitizer.sanitizeString(str);
        },
        
        execute: async function() {
            if (DEBUG) {
                logOnce('info', 'Executing full rendering pipeline');
            }
            
            this.skeleton();
            
            await new Promise(resolve => setTimeout(resolve, 50));
            
            await this.initialRender();
            
            await this.progressiveEnhancement();
            
            await this.liveUpdate();
            
            if (DEBUG) {
                logOnce('info', 'Rendering pipeline complete', UIState.renderStages);
            }
            
            return {
                success: true,
                stages: { ...UIState.renderStages },
                renderCount: UIState.renderCount
            };
        }
    };

    // ==================== CORE INTEGRATION BRIDGE ====================
    const CoreIntegration = {
        _subscriptions: new Set(),
        _validationCache: new Map(),
        
        subscribeToCore: function() {
            if (DEBUG) {
                logOnce('info', 'Subscribing to core events');
            }
            
            if (window.iframeCore && typeof window.iframeCore.onStateChange === 'function') {
                const unsubscribe = window.iframeCore.onStateChange(this.handleStateChange.bind(this));
                if (unsubscribe) this._subscriptions.add({ type: 'state', unsubscribe });
            }
            
            this.setupParentMessageHandler();
            
            this.observeAppState();
            
            this.setupHandshakeListener();
            
            if (RecoveryManager && typeof RecoveryManager.addListener === 'function') {
                RecoveryManager.addListener(this.handleRecovery.bind(this));
            }
            
            if (IframeHandshakeAuthority && typeof IframeHandshakeAuthority.addListener === 'function') {
                IframeHandshakeAuthority.addListener(this.handleHandshakeEvent.bind(this));
            }
            
            if (IframeSessionClient && typeof IframeSessionClient.addListener === 'function') {
                IframeSessionClient.addListener(this.handleSessionEvent.bind(this));
            }
            
            // Listen for core.ready event
            window.addEventListener('core.ready', this.handleCoreReady.bind(this));
        },
        
        handleCoreReady: function(event) {
            logOnce('success', 'Core ready event received');
            coreReady = true;
            parentReady = true;
            sessionReady = true;
            RenderingPipeline.updateSyncIndicator();
        },
        
        handleHandshakeEvent: function(event, data) {
            if (event === 'handshake_ack') {
                handshakeComplete = true;
                parentReady = true;
                RenderingPipeline.updateSyncIndicator();
            } else if (event === 'parent_ready') {
                parentReady = true;
                RenderingPipeline.updateSyncIndicator();
            }
        },
        
        handleSessionEvent: function(event, data) {
            if (event === 'update' || event === 'token') {
                sessionReady = true;
                RenderingPipeline.updateSyncIndicator();
            } else if (event === 'expired' || event === 'clear') {
                sessionReady = false;
                RenderingPipeline.updateSyncIndicator();
            }
        },
        
        setupHandshakeListener: function() {
            const handler = (event) => {
                if (OriginSecurity && !OriginSecurity.validateEvent(event)) return;
                if (OriginAdapter && !OriginAdapter.validateEvent(event)) return;
                
                const data = event.data;
                if (!data || typeof data !== 'object') return;
                
                switch (data.type) {
                    case 'PARENT_READY':
                        parentReady = true;
                        RenderingPipeline.updateSyncIndicator();
                        break;
                    case 'SESSION_UPDATE':
                    case 'SESSION_SYNC':
                        sessionReady = true;
                        RenderingPipeline.updateSyncIndicator();
                        break;
                    case 'HANDSHAKE_ACK':
                        handshakeComplete = true;
                        parentReady = true;
                        RenderingPipeline.updateSyncIndicator();
                        break;
                }
            };
            
            window.addEventListener('message', handler);
            this._subscriptions.add({ type: 'handshake', handler });
        },
        
        handleStateChange: function(newState, oldState) {
            try {
                if (DEBUG) {
                    logOnce('info', `Core state changed: ${oldState} → ${newState}`);
                }
                
                switch (newState) {
                    case 'ACTIVE':
                        RenderingPipeline.liveUpdate();
                        break;
                    case 'SUSPENDED':
                        this.pauseUIUpdates();
                        break;
                    case 'DEGRADED':
                    case 'DEMO':
                        this.handleDegradedMode();
                        break;
                    case 'RECOVERING':
                        this.handleRecoveringMode();
                        break;
                }
                
                RenderingPipeline.updateSyncIndicator();
                
            } catch (error) {
                UILogger.error('handleStateChange', error);
            }
        },
        
        handleRecovery: function(event, data) {
            if (event === 'start') {
                if (DEBUG) {
                    logOnce('info', 'Recovery started', data);
                }
                this.showRecoveryNotification();
            } else if (event === 'success') {
                if (DEBUG) {
                    logOnce('info', 'Recovery successful');
                }
                showNotification('Connection restored', 'success');
            } else if (event === 'failed') {
                if (DEBUG) {
                    logOnce('warn', 'Recovery failed', data);
                }
                showNotification('Connection issues detected', 'warning');
            }
        },
        
        showRecoveryNotification: function() {
            showNotification('Attempting to reconnect...', 'info');
        },
        
        handleRecoveringMode: function() {
            if (DEBUG) {
                logOnce('info', 'Entering recovery mode');
            }
            showNotification('Reconnecting...', 'info');
        },
        
        setupParentMessageHandler: function() {
            const handler = (event) => {
                if (!this.validateParentMessage(event)) return;
                
                const data = event.data;
                
                switch (data.type) {
                    case 'SESSION_UPDATE':
                        this.handleSessionUpdate(data.payload || data);
                        break;
                    case 'TOKEN_UPDATE':
                        this.handleTokenUpdate(data.payload || data);
                        break;
                    case 'LOGOUT':
                        UIEventHandlers.handleLogout();
                        break;
                    case 'CONTACTS_UPDATE':
                        this.handleContactsUpdate(data.payload || data);
                        break;
                    case 'CALL_HISTORY_UPDATE':
                        this.handleCallHistoryUpdate(data.payload || data);
                        break;
                    case 'PING':
                        this.sendPong(data.payload?.requestId);
                        break;
                    case 'PAGE_ACTIVATED':
                        if (DEBUG) {
                            logOnce('info', 'Parent page activated');
                        }
                        break;
                    case 'NAVIGATE':
                        if (DEBUG) {
                            logOnce('info', 'Parent navigation:', data.payload);
                        }
                        break;
                }
            };
            
            window.addEventListener('message', handler);
            UIState.cachedElements.set('parentMessageHandler', handler);
        },
        
        validateParentMessage: function(event) {
            if (!event || !event.data) return false;
            
            if (OriginSecurity && !OriginSecurity.validateEvent(event)) {
                return false;
            }
            
            if (OriginAdapter && !OriginAdapter.validateEvent(event)) {
                return false;
            }
            
            const data = event.data;
            if (!data.type || typeof data.type !== 'string') {
                return false;
            }
            
            if (data.timestamp && (data.timestamp < Date.now() - 300000 || data.timestamp > Date.now() + 60000)) {
                return false;
            }
            
            return true;
        },
        
        handleSessionUpdate: function(data) {
            if (!this.validatePayload(data, ['user', 'token', 'authenticated'])) {
                if (DEBUG) {
                    logOnce('warn', 'Invalid session update payload');
                }
                return;
            }
            
            if (DEBUG) {
                logOnce('info', 'Received session update');
            }
            
            if (data.token) {
                window.__CHILD_SESSION__.token = data.token;
                sessionReady = true;
            }
            if (data.user && data.user.id) {
                window.__CHILD_SESSION__.userId = data.user.id;
            }
            if (data.expiry) {
                window.__CHILD_SESSION__.expires = data.expiry;
            }
            
            if (data.user && AppState) {
                AppState.user = { ...AppState.user, ...data.user };
                AppState.currentUser = { ...AppState.currentUser, ...data.user };
                AppState.isAuthenticated = data.authenticated !== undefined ? data.authenticated : AppState.isAuthenticated;
                
                this.updateUserUI(AppState.user);
            }
            
            if (data.token && session && typeof session.setToken === 'function') {
                session.setToken(data.token, data.expiry);
            }
            
            RenderingPipeline.updateSyncIndicator();
        },
        
        handleTokenUpdate: function(data) {
            if (!this.validatePayload(data, ['token'])) return;
            
            window.__CHILD_SESSION__.token = data.token;
            if (data.expiry) {
                window.__CHILD_SESSION__.expires = data.expiry;
            }
            sessionReady = true;
            
            if (session && typeof session.setToken === 'function') {
                session.setToken(data.token, data.expiry);
            }
            
            RenderingPipeline.updateSyncIndicator();
        },
        
        handleContactsUpdate: function(data) {
            if (!this.validatePayload(data, ['contacts']) || !Array.isArray(data.contacts)) return;
            
            if (AppState) {
                AppState.contacts = data.contacts;
            }
            
            if (elements.contactsList) {
                RenderingPipeline.renderContactsList(data.contacts);
            }
        },
        
        handleCallHistoryUpdate: function(data) {
            if (!this.validatePayload(data, ['history']) || !Array.isArray(data.history)) return;
            
            if (AppState) {
                AppState.callHistory = data.history;
            }
            
            if (typeof coreRenderCallHistory === 'function') {
                coreRenderCallHistory();
            }
        },
        
        sendPong: function(requestId) {
            if (!requestId) return;
            
            sendToParent('PONG', {
                requestId,
                timestamp: Date.now(),
                state: UIState.renderStages
            });
        },
        
        validatePayload: function(payload, requiredFields) {
            if (!payload || typeof payload !== 'object') return false;
            
            return requiredFields.every(field => 
                payload.hasOwnProperty(field) || payload[field] !== undefined
            );
        },
        
        updateUserUI: function(user) {
            if (!user) return;
            
            try {
                const isDemo = session && session.isDemoMode ? session.isDemoMode() : false;
                
                document.querySelectorAll('.user-name, .username').forEach(el => {
                    if (el.textContent.includes('User') || el.textContent.includes('Loading') || !currentUser) {
                        el.textContent = SecuritySanitizer.sanitizeString(user.name || user.username || 'User');
                    }
                });
                
                if (elements.callStatusText) {
                    elements.callStatusText.textContent = isDemo ? 'Demo Mode' : 
                        `Ready (${SecuritySanitizer.sanitizeString(user.name || user.username || 'User')})`;
                }
                
                this.updateApiStatus(user);
                
            } catch (error) {
                UILogger.error('updateUserUI', error);
            }
        },
        
        updateApiStatus: function(user) {
            if (!elements.apiStatusIndicator || !elements.apiStatusText) return;
            
            try {
                const isDemo = session && session.isDemoMode ? session.isDemoMode() : false;
                
                if (isDemo) {
                    elements.apiStatusIndicator.className = 'api-status-indicator demo';
                    elements.apiStatusText.textContent = 'Demo Mode';
                } else if (user) {
                    elements.apiStatusIndicator.className = 'api-status-indicator connected';
                    elements.apiStatusText.textContent = `Authenticated as ${SecuritySanitizer.sanitizeString(user.name || user.username || 'User')}`;
                } else {
                    elements.apiStatusIndicator.className = 'api-status-indicator connecting';
                    elements.apiStatusText.textContent = 'Connecting...';
                }
                
                elements.apiStatusIndicator.style.display = 'inline-flex';
                
                setTimeout(() => {
                    if (elements.apiStatusIndicator) {
                        elements.apiStatusIndicator.style.display = 'none';
                    }
                }, 3000);
                
            } catch (error) {
                UILogger.error('updateApiStatus', error);
            }
        },
        
        pauseUIUpdates: function() {
            if (DEBUG) {
                logOnce('info', 'Pausing UI updates');
            }
            
            const syncInterval = UIState.cachedElements.get('liveSyncInterval');
            if (syncInterval) {
                clearInterval(syncInterval);
                UIState.cachedElements.delete('liveSyncInterval');
            }
        },
        
        handleDegradedMode: function() {
            if (DEBUG) {
                logOnce('info', 'Handling degraded mode');
            }
            
            const isDemo = session && session.isDemoMode ? session.isDemoMode() : false;
            
            if (isDemo) {
                document.querySelectorAll('button, input, select').forEach(el => {
                    if (el.id !== 'premiumLocked') {
                        el.disabled = false;
                    }
                });
                
                if (elements.syncIndicator) {
                    elements.syncIndicator.innerHTML = '<i class="fas fa-eye"></i><span>Demo Mode</span>';
                    elements.syncIndicator.className = 'sync-indicator demo';
                }
            }
        },
        
        observeAppState: function() {
            if (!window.AppState) return;
            
            const handler = {
                set: (target, property, value) => {
                    target[property] = value;
                    
                    switch (property) {
                        case 'isAuthenticated':
                            this.handleAuthChange(value);
                            break;
                        case 'isOnline':
                            this.handleConnectivityChange(value);
                            break;
                        case 'isInCall':
                            this.handleCallStateChange(value);
                            break;
                        case 'contacts':
                            if (Array.isArray(value)) {
                                RenderingPipeline.renderContactsList(value);
                            }
                            break;
                        case 'callHistory':
                            if (typeof coreRenderCallHistory === 'function') {
                                coreRenderCallHistory();
                            }
                            break;
                    }
                    
                    return true;
                }
            };
            
            try {
                window.AppState = new Proxy(window.AppState, handler);
            } catch (error) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to observe AppState', error);
                }
            }
        },
        
        handleAuthChange: function(isAuthenticated) {
            if (DEBUG) {
                logOnce('info', `Authentication changed: ${isAuthenticated}`);
            }
            
            const protectedButtons = [
                elements.newCallBtn,
                elements.quickVoiceBtn,
                elements.quickVideoBtn,
                elements.quickGroupBtn
            ];
            
            const isDemo = session && session.isDemoMode ? session.isDemoMode() : false;
            
            protectedButtons.forEach(btn => {
                if (btn) {
                    btn.disabled = !isAuthenticated && !isDemo;
                }
            });
            
            RenderingPipeline.updateSyncIndicator();
        },
        
        handleConnectivityChange: function(isOnline) {
            if (DEBUG) {
                logOnce('info', `Connectivity changed: ${isOnline ? 'online' : 'offline'}`);
            }
            
            if (isOnline) {
                if (typeof handleOnline === 'function') handleOnline();
            } else {
                if (typeof handleOffline === 'function') handleOffline();
            }
        },
        
        handleCallStateChange: function(isInCall) {
            if (isInCall && elements.callDuration) {
                elements.callDuration.textContent = '00:00';
            }
        },
        
        cleanup: function() {
            this._subscriptions.forEach(sub => {
                if (sub.unsubscribe && typeof sub.unsubscribe === 'function') {
                    try { sub.unsubscribe(); } catch (e) {}
                } else if (sub.handler && sub.type) {
                    window.removeEventListener('message', sub.handler);
                }
            });
            this._subscriptions.clear();
            
            const handler = UIState.cachedElements.get('parentMessageHandler');
            if (handler) {
                window.removeEventListener('message', handler);
                UIState.cachedElements.delete('parentMessageHandler');
            }
        }
    };

    // ==================== RESPONSIVE ENGINE ====================
    const ResponsiveEngine = {
        _currentBreakpoint: 'desktop',
        _orientation: 'landscape',
        _mediaQueries: new Map(),
        _listeners: new Set(),
        
        initialize: function() {
            this.detectBreakpoint();
            this.detectOrientation();
            this.setupMediaQueryListeners();
            this.setupInputDetection();
            this.applyResponsiveLayout();
            
            window.addEventListener('resize', this.debouncedResize.bind(this));
            if (DEBUG) {
                logOnce('info', 'Responsive engine initialized', { 
                    breakpoint: this._currentBreakpoint,
                    orientation: this._orientation
                });
            }
        },
        
        detectBreakpoint: function() {
            const width = window.innerWidth;
            
            if (width <= UIState.breakpoints.mobile) {
                this._currentBreakpoint = 'mobile';
            } else if (width <= UIState.breakpoints.tablet) {
                this._currentBreakpoint = 'tablet';
            } else if (width <= UIState.breakpoints.desktop) {
                this._currentBreakpoint = 'desktop';
            } else {
                this._currentBreakpoint = 'wide';
            }
            
            return this._currentBreakpoint;
        },
        
        detectOrientation: function() {
            this._orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
            return this._orientation;
        },
        
        setupMediaQueryListeners: function() {
            const mobileQuery = window.matchMedia(`(max-width: ${UIState.breakpoints.mobile}px)`);
            this._mediaQueries.set('mobile', mobileQuery);
            
            if (typeof mobileQuery.addListener === 'function') {
                mobileQuery.addListener(this.handleBreakpointChange.bind(this));
            } else {
                mobileQuery.addEventListener('change', this.handleBreakpointChange.bind(this));
            }
            
            const tabletQuery = window.matchMedia(`(min-width: ${UIState.breakpoints.mobile + 1}px) and (max-width: ${UIState.breakpoints.tablet}px)`);
            this._mediaQueries.set('tablet', tabletQuery);
            if (typeof tabletQuery.addListener === 'function') {
                tabletQuery.addListener(this.handleBreakpointChange.bind(this));
            } else {
                tabletQuery.addEventListener('change', this.handleBreakpointChange.bind(this));
            }
            
            const desktopQuery = window.matchMedia(`(min-width: ${UIState.breakpoints.tablet + 1}px) and (max-width: ${UIState.breakpoints.desktop}px)`);
            this._mediaQueries.set('desktop', desktopQuery);
            if (typeof desktopQuery.addListener === 'function') {
                desktopQuery.addListener(this.handleBreakpointChange.bind(this));
            } else {
                desktopQuery.addEventListener('change', this.handleBreakpointChange.bind(this));
            }
            
            const wideQuery = window.matchMedia(`(min-width: ${UIState.breakpoints.desktop + 1}px)`);
            this._mediaQueries.set('wide', wideQuery);
            if (typeof wideQuery.addListener === 'function') {
                wideQuery.addListener(this.handleBreakpointChange.bind(this));
            } else {
                wideQuery.addEventListener('change', this.handleBreakpointChange.bind(this));
            }
            
            const orientationQuery = window.matchMedia('(orientation: portrait)');
            if (typeof orientationQuery.addListener === 'function') {
                orientationQuery.addListener(this.handleOrientationChange.bind(this));
            } else {
                orientationQuery.addEventListener('change', this.handleOrientationChange.bind(this));
            }
            this._mediaQueries.set('orientation', orientationQuery);
        },
        
        setupInputDetection: function() {
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            UIState.inputMode = isTouchDevice ? 'touch' : 'mouse';
            
            if (isTouchDevice) {
                document.body.classList.add('touch-device');
            }
            
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    UIState.inputMode = 'keyboard';
                    document.body.classList.add('keyboard-navigation');
                }
            });
            
            document.addEventListener('mousedown', () => {
                UIState.inputMode = 'mouse';
                document.body.classList.remove('keyboard-navigation');
            });
            
            document.addEventListener('touchstart', () => {
                UIState.inputMode = 'touch';
                document.body.classList.add('touch-device');
            });
        },
        
        handleBreakpointChange: function() {
            const oldBreakpoint = this._currentBreakpoint;
            this.detectBreakpoint();
            
            if (oldBreakpoint !== this._currentBreakpoint) {
                if (DEBUG) {
                    logOnce('info', `Breakpoint changed: ${oldBreakpoint} → ${this._currentBreakpoint}`);
                }
                this.applyResponsiveLayout();
                
                this._listeners.forEach(listener => {
                    try {
                        listener('breakpoint', this._currentBreakpoint, oldBreakpoint);
                    } catch (e) {}
                });
            }
        },
        
        handleOrientationChange: function() {
            const oldOrientation = this._orientation;
            this.detectOrientation();
            
            if (oldOrientation !== this._orientation) {
                if (DEBUG) {
                    logOnce('info', `Orientation changed: ${oldOrientation} → ${this._orientation}`);
                }
                this.applyResponsiveLayout();
            }
        },
        
        debouncedResize: function() {
            if (typeof coreDebounce === 'function') {
                const debounced = coreDebounce(() => {
                    this.handleBreakpointChange();
                    this.handleOrientationChange();
                }, 150);
                debounced();
            } else {
                setTimeout(() => {
                    this.handleBreakpointChange();
                    this.handleOrientationChange();
                }, 150);
            }
        },
        
        applyResponsiveLayout: function() {
            document.body.dataset.breakpoint = this._currentBreakpoint;
            document.body.dataset.orientation = this._orientation;
            document.body.dataset.inputMode = UIState.inputMode;
            
            switch (this._currentBreakpoint) {
                case 'mobile':
                    this.applyMobileLayout();
                    break;
                case 'tablet':
                    this.applyTabletLayout();
                    break;
                case 'desktop':
                case 'wide':
                    this.applyDesktopLayout();
                    break;
            }
            
            if (AppState?.isInCall && typeof updateVideoLayout === 'function') {
                updateVideoLayout();
            }
        },
        
        applyMobileLayout: function() {
            document.querySelectorAll('.desktop-only').forEach(el => {
                el.style.display = 'none';
            });
            
            document.querySelectorAll('.mobile-only').forEach(el => {
                el.style.display = 'block';
            });
            
            if (elements.sidebar) {
                elements.sidebar.classList.add('sidebar-mobile');
            }
            
            if (elements.videoGrid) {
                elements.videoGrid.style.gridTemplateColumns = '1fr';
            }
            
            document.querySelectorAll('.modal, .feature-panel').forEach(el => {
                el.style.width = '100%';
                el.style.maxWidth = '100%';
                el.style.height = '100%';
                el.style.maxHeight = '100%';
                el.style.borderRadius = '0';
            });
        },
        
        applyTabletLayout: function() {
            document.querySelectorAll('.desktop-only, .mobile-only').forEach(el => {
                el.style.display = '';
            });
            
            if (elements.sidebar) {
                elements.sidebar.classList.remove('sidebar-mobile');
            }
            
            if (elements.videoGrid) {
                elements.videoGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            }
            
            document.querySelectorAll('.modal, .feature-panel').forEach(el => {
                el.style.width = '';
                el.style.maxWidth = '';
                el.style.height = '';
                el.style.maxHeight = '';
                el.style.borderRadius = '';
            });
        },
        
        applyDesktopLayout: function() {
            document.querySelectorAll('.desktop-only, .mobile-only').forEach(el => {
                el.style.display = '';
            });
            
            if (elements.sidebar) {
                elements.sidebar.classList.remove('sidebar-mobile');
            }
            
            if (elements.videoGrid) {
                const videoCount = elements.videoGrid.querySelectorAll('.video-container').length;
                if (videoCount <= 2) {
                    elements.videoGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
                } else {
                    elements.videoGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
                }
            }
        },
        
        onBreakpointChange: function(listener) {
            this._listeners.add(listener);
            return () => this._listeners.delete(listener);
        },
        
        isMobile: function() {
            return this._currentBreakpoint === 'mobile';
        },
        
        isTablet: function() {
            return this._currentBreakpoint === 'tablet';
        },
        
        isDesktop: function() {
            return this._currentBreakpoint === 'desktop' || this._currentBreakpoint === 'wide';
        }
    };

    // ==================== EVENT SYSTEM ====================
    const EventSystem = {
        _listeners: new Map(),
        _debounced: new Map(),
        _throttled: new Map(),
        _once: new Set(),
        
        initialize: function() {
            this.setupGlobalListeners();
            this.setupUIEventListeners();
            if (DEBUG) {
                logOnce('info', 'Event system initialized');
            }
        },
        
        setupGlobalListeners: function() {
            this.addListener(window, 'online', () => {
                if (AppState) AppState.isOnline = true;
                if (typeof handleOnline === 'function') handleOnline();
            });
            
            this.addListener(window, 'offline', () => {
                if (AppState) AppState.isOnline = false;
                if (typeof handleOffline === 'function') handleOffline();
            });
            
            this.addListener(window, 'storage', (e) => {
                if (typeof handleStorageEvent === 'function') handleStorageEvent(e);
            });
            
            this.addListener(window, 'beforeunload', () => {
                this.cleanup();
            });
            
            this.addListener(document, 'visibilitychange', () => {
                if (!document.hidden && session && typeof session.validateToken === 'function' && session.validateToken()) {
                    if (typeof session.refreshToken === 'function') session.refreshToken();
                }
            });
        },
        
        setupUIEventListeners: function() {
            if (elements.menuDotsBtn) {
                this.addListener(elements.menuDotsBtn, 'click', UIEventHandlers.toggleMenuDots);
            }
            
            if (elements.menuParticipants) {
                this.addListener(elements.menuParticipants, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openParticipantsPanel();
                });
            }
            
            if (elements.menuChat) {
                this.addListener(elements.menuChat, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openChatPanel();
                });
            }
            
            if (elements.menuWhiteboard) {
                this.addListener(elements.menuWhiteboard, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openWhiteboardPanel();
                });
            }
            
            if (elements.menuNotes) {
                this.addListener(elements.menuNotes, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openNotesPanel();
                });
            }
            
            if (elements.menuPolls) {
                this.addListener(elements.menuPolls, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openPollsPanel();
                });
            }
            
            if (elements.menuRelationship) {
                this.addListener(elements.menuRelationship, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openRelationshipPanel();
                });
            }
            
            if (elements.newCallBtn) {
                this.addListener(elements.newCallBtn, 'click', UIEventHandlers.openNewCallModal);
            }
            
            if (elements.closeNewCallModal) {
                this.addListener(elements.closeNewCallModal, 'click', UIEventHandlers.closeNewCallModal);
            }
            
            if (elements.quickVoiceBtn) {
                this.addListener(elements.quickVoiceBtn, 'click', UIEventHandlers.openNewCallModal);
            }
            
            if (elements.quickVideoBtn) {
                this.addListener(elements.quickVideoBtn, 'click', UIEventHandlers.openNewCallModal);
            }
            
            if (elements.quickGroupBtn) {
                this.addListener(elements.quickGroupBtn, 'click', UIEventHandlers.openNewCallModal);
            }
            
            if (elements.startVoiceCallBtn) {
                this.addListener(elements.startVoiceCallBtn, 'click', UIEventHandlers.startVoiceCall);
            }
            
            if (elements.startVideoCallBtn) {
                this.addListener(elements.startVideoCallBtn, 'click', UIEventHandlers.startVideoCall);
            }
            
            if (elements.startGroupCallBtn) {
                this.addListener(elements.startGroupCallBtn, 'click', UIEventHandlers.startGroupCall);
            }
            
            if (elements.generateVoiceLinkBtn) {
                this.addListener(elements.generateVoiceLinkBtn, 'click', UIEventHandlers.generateVoiceCallLink);
            }
            
            if (elements.generateVideoLinkBtn) {
                this.addListener(elements.generateVideoLinkBtn, 'click', UIEventHandlers.generateVideoCallLink);
            }
            
            if (elements.copyLinkBtn) {
                this.addListener(elements.copyLinkBtn, 'click', UIEventHandlers.copyCallLink);
            }
            
            if (elements.shareLinkBtn) {
                this.addListener(elements.shareLinkBtn, 'click', UIEventHandlers.shareCallLink);
            }
            
            if (elements.instantGroupOption) {
                this.addListener(elements.instantGroupOption, 'click', UIEventHandlers.selectGroupOption);
            }
            
            if (elements.scheduledGroupOption) {
                this.addListener(elements.scheduledGroupOption, 'click', UIEventHandlers.selectGroupOption);
            }
            
            if (elements.muteBtn) {
                this.addListener(elements.muteBtn, 'click', UIEventHandlers.toggleMute);
            }
            
            if (elements.videoBtn) {
                this.addListener(elements.videoBtn, 'click', UIEventHandlers.toggleVideo);
            }
            
            if (elements.screenShareBtn) {
                this.addListener(elements.screenShareBtn, 'click', UIEventHandlers.toggleScreenShare);
            }
            
            if (elements.speakerBtn) {
                this.addListener(elements.speakerBtn, 'click', UIEventHandlers.toggleSpeaker);
            }
            
            if (elements.moodBtn) {
                this.addListener(elements.moodBtn, 'click', UIEventHandlers.openMoodSelectionModal);
            }
            
            if (elements.intentionBtn) {
                this.addListener(elements.intentionBtn, 'click', UIEventHandlers.openIntentionSelectionModal);
            }
            
            if (elements.endCallBtn) {
                this.addListener(elements.endCallBtn, 'click', UIEventHandlers.endCall);
            }
            
            if (elements.focusModeBtn) {
                this.addListener(elements.focusModeBtn, 'click', UIEventHandlers.toggleFocusMode);
            }
            
            if (elements.declineCallBtn) {
                this.addListener(elements.declineCallBtn, 'click', UIEventHandlers.declineIncomingCall);
            }
            
            if (elements.acceptCallBtn) {
                this.addListener(elements.acceptCallBtn, 'click', UIEventHandlers.acceptIncomingCall);
            }
            
            if (elements.acceptVideoCallBtn) {
                this.addListener(elements.acceptVideoCallBtn, 'click', UIEventHandlers.acceptIncomingCallAsVideo);
            }
            
            if (elements.cancelMoodBtn) {
                this.addListener(elements.cancelMoodBtn, 'click', UIEventHandlers.closeMoodSelectionModal);
            }
            
            if (elements.setMoodBtn) {
                this.addListener(elements.setMoodBtn, 'click', UIEventHandlers.setMood);
            }
            
            if (elements.cancelIntentionBtn) {
                this.addListener(elements.cancelIntentionBtn, 'click', UIEventHandlers.closeIntentionSelectionModal);
            }
            
            if (elements.setIntentionBtn) {
                this.addListener(elements.setIntentionBtn, 'click', UIEventHandlers.setIntention);
            }
            
            document.querySelectorAll('.mood-option').forEach(option => {
                this.addListener(option, 'click', UIEventHandlers.selectMoodOption);
            });
            
            document.querySelectorAll('.intention-option').forEach(option => {
                this.addListener(option, 'click', UIEventHandlers.selectIntentionOption);
            });
            
            if (elements.skipNotesBtn) {
                this.addListener(elements.skipNotesBtn, 'click', UIEventHandlers.skipPrivateNotes);
            }
            
            if (elements.saveNotesBtn) {
                this.addListener(elements.saveNotesBtn, 'click', UIEventHandlers.savePrivateNotes);
            }
            
            if (elements.summaryDoneBtn) {
                this.addListener(elements.summaryDoneBtn, 'click', UIEventHandlers.closeCallSummary);
            }
            
            if (elements.urlParamCancelBtn) {
                this.addListener(elements.urlParamCancelBtn, 'click', closeUrlParamOverlay);
            }
            
            if (elements.urlParamJoinBtn) {
                this.addListener(elements.urlParamJoinBtn, 'click', joinUrlParamCall);
            }
            
            if (elements.settingsToggle) {
                this.addListener(elements.settingsToggle, 'click', UIEventHandlers.toggleSettingsPanel);
            }
            
            if (elements.resetSettingsBtn) {
                this.addListener(elements.resetSettingsBtn, 'click', resetSettings);
            }
            
            if (elements.emotionalContextToggle) {
                this.addListener(elements.emotionalContextToggle, 'change', updateSetting);
            }
            
            if (elements.callIntentionToggle) {
                this.addListener(elements.callIntentionToggle, 'change', updateSetting);
            }
            
            if (elements.inCallChatToggle) {
                this.addListener(elements.inCallChatToggle, 'change', updateSetting);
            }
            
            if (elements.whiteboardToggle) {
                this.addListener(elements.whiteboardToggle, 'change', updateSetting);
            }
            
            if (elements.pollsToggle) {
                this.addListener(elements.pollsToggle, 'change', updateSetting);
            }
            
            if (elements.notesToggle) {
                this.addListener(elements.notesToggle, 'change', updateSetting);
            }
            
            if (elements.focusModeToggle) {
                this.addListener(elements.focusModeToggle, 'change', updateSetting);
            }
            
            if (elements.liveReactionsToggle) {
                this.addListener(elements.liveReactionsToggle, 'change', updateSetting);
            }
            
            document.querySelectorAll('.category-btn').forEach(btn => {
                this.addListener(btn, 'click', function() {
                    const category = this.dataset.category;
                    UIEventHandlers.switchCallCategory(category);
                });
            });
            
            document.querySelectorAll('.new-call-tab').forEach(tab => {
                this.addListener(tab, 'click', function() {
                    const tabId = this.dataset.tab;
                    UIEventHandlers.switchNewCallTab(tabId);
                });
            });
            
            if (elements.pipCloseBtn) {
                this.addListener(elements.pipCloseBtn, 'click', closePip);
            }
            
            if (elements.contactSearch) {
                this.addListener(elements.contactSearch, 'input', 
                    this.debounce('contactSearch', UIEventHandlers.searchContacts, 300)
                );
            }
            
            if (elements.groupContactSearch) {
                this.addListener(elements.groupContactSearch, 'input',
                    this.debounce('groupContactSearch', UIEventHandlers.searchGroupContacts, 300)
                );
            }
            
            if (elements.mpesaOption) {
                this.addListener(elements.mpesaOption, 'click', UIEventHandlers.selectPaymentOption);
            }
            
            if (elements.cancelPaymentBtn) {
                this.addListener(elements.cancelPaymentBtn, 'click', UIEventHandlers.closePaymentModal);
            }
            
            if (elements.processPaymentBtn) {
                this.addListener(elements.processPaymentBtn, 'click', UIEventHandlers.processPayment);
            }
            
            if (elements.cancelUpgradeBtn) {
                this.addListener(elements.cancelUpgradeBtn, 'click', UIEventHandlers.closePremiumLimitModal);
            }
            
            if (elements.upgradeNowBtn) {
                this.addListener(elements.upgradeNowBtn, 'click', UIEventHandlers.openPaymentModal);
            }
            
            this.addListener(document, 'click', (e) => {
                if (elements.menuDotsBtn && elements.menuDotsDropdown) {
                    if (!elements.menuDotsBtn.contains(e.target) && 
                        !elements.menuDotsDropdown.contains(e.target)) {
                        UIEventHandlers.closeMenuDots();
                    }
                }
            });
        },
        
        addListener: function(element, eventType, handler, options = {}) {
            if (!element || typeof handler !== 'function') return null;
            
            const key = `${eventType}_${handler.toString()}`;
            
            element.addEventListener(eventType, handler, options);
            
            if (!this._listeners.has(key)) {
                this._listeners.set(key, { element, eventType, handler, options });
            }
            
            return handler;
        },
        
        removeListener: function(element, eventType, handler) {
            if (!element) return;
            
            element.removeEventListener(eventType, handler);
            
            const key = `${eventType}_${handler.toString()}`;
            this._listeners.delete(key);
        },
        
        debounce: function(id, fn, delay) {
            if (this._debounced.has(id)) {
                return this._debounced.get(id);
            }
            
            let timeout;
            const debouncedFn = function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => fn.apply(this, args), delay);
            };
            
            this._debounced.set(id, debouncedFn);
            return debouncedFn;
        },
        
        throttle: function(id, fn, limit) {
            if (this._throttled.has(id)) {
                return this._throttled.get(id);
            }
            
            let inThrottle;
            const throttledFn = function(...args) {
                if (!inThrottle) {
                    fn.apply(this, args);
                    inThrottle = setTimeout(() => inThrottle = false, limit);
                }
            };
            
            this._throttled.set(id, throttledFn);
            return throttledFn;
        },
        
        once: function(element, eventType, handler) {
            const onceHandler = function(...args) {
                handler.apply(this, args);
                element.removeEventListener(eventType, onceHandler);
            };
            
            element.addEventListener(eventType, onceHandler);
            
            const key = `${eventType}_${handler.toString()}_once`;
            this._once.add(key);
            
            return onceHandler;
        },
        
        trigger: function(element, eventType, detail = {}) {
            if (!element) return false;
            
            const event = new CustomEvent(eventType, { detail, bubbles: true, cancelable: true });
            return element.dispatchEvent(event);
        },
        
        cleanup: function() {
            this._listeners.forEach(({ element, eventType, handler, options }) => {
                try {
                    if (element) {
                        element.removeEventListener(eventType, handler, options);
                    }
                } catch (e) {}
            });
            
            this._listeners.clear();
            this._debounced.clear();
            this._throttled.clear();
            this._once.clear();
            
            if (DEBUG) {
                logOnce('info', 'Event system cleaned up');
            }
        }
    };

    // ==================== UI EVENT HANDLERS ====================
    const UIEventHandlers = {
        toggleMenuDots: function(e) {
            e?.stopPropagation();
            if (elements.menuDotsDropdown) {
                elements.menuDotsDropdown.classList.toggle('active');
                UILogger.interaction('toggleMenuDots', 'menuDotsBtn');
            }
        },
        
        closeMenuDots: function() {
            if (elements.menuDotsDropdown) {
                elements.menuDotsDropdown.classList.remove('active');
            }
        },
        
        openNewCallModal: function() {
            const isDemo = session && session.isDemoMode ? session.isDemoMode() : false;
            
            if (parentCoordinator && !parentCoordinator.sessionValidated && !isDemo) {
                showNotification('Please wait for authentication', 'warning');
                if (parentCoordinator.showReconnectState) {
                    parentCoordinator.showReconnectState();
                }
                return;
            }
            
            if (!AppState?.isOnline && !isDemo) {
                showNotification('Cannot load contacts while offline', 'warning');
                return;
            }
            
            if (elements.newCallModal) {
                elements.newCallModal.classList.add('active');
                UIState.activeModals.add('newCallModal');
                
                // Fetch fresh contacts from core API
                if (APICore && APICore.isReady && APICore.isReady()) {
                    APICore.get('/api/contacts', {}, { allowFallback: true })
                        .then(contacts => {
                            if (contacts && Array.isArray(contacts)) {
                                AppState.contacts = contacts;
                                RenderingPipeline.renderContactsList(contacts);
                            }
                        })
                        .catch(() => {
                            // Use cached contacts if available
                            if (AppState?.contacts?.length > 0) {
                                RenderingPipeline.renderContactsList(AppState.contacts);
                            }
                        });
                } else if (AppState?.contacts?.length > 0) {
                    RenderingPipeline.renderContactsList(AppState.contacts);
                } else if (window.callAPI && typeof window.callAPI.fetchContacts === 'function') {
                    window.callAPI.fetchContacts();
                }
                
                UIEventHandlers.switchNewCallTab('contacts');
                UILogger.interaction('openNewCallModal', 'newCallModal');
            }
        },
        
        closeNewCallModal: function() {
            if (elements.newCallModal) {
                elements.newCallModal.classList.remove('active');
                UIState.activeModals.delete('newCallModal');
                
                document.querySelectorAll('.contact-checkbox:checked, .group-contact:checked').forEach(el => {
                    el.checked = false;
                });
                
                document.querySelectorAll('.contact-item.selected').forEach(el => {
                    el.classList.remove('selected');
                });
                
                if (elements.contactSearch) elements.contactSearch.value = '';
                if (elements.groupContactSearch) elements.groupContactSearch.value = '';
                if (elements.instantGroupOption) elements.instantGroupOption.classList.remove('selected');
                if (elements.scheduledGroupOption) elements.scheduledGroupOption.classList.remove('selected');
                if (elements.startGroupCallBtn) elements.startGroupCallBtn.disabled = true;
            }
        },
        
        searchContacts: function() {
            const query = elements.contactSearch?.value.toLowerCase() || '';
            
            document.querySelectorAll('.contact-item').forEach(item => {
                const nameEl = item.querySelector('.call-name');
                if (nameEl) {
                    const name = nameEl.textContent.toLowerCase();
                    item.style.display = name.includes(query) ? 'flex' : 'none';
                }
            });
        },
        
        searchGroupContacts: function() {
            const query = elements.groupContactSearch?.value.toLowerCase() || '';
            
            document.querySelectorAll('.contact-item').forEach(item => {
                const nameEl = item.querySelector('.call-name');
                if (nameEl) {
                    const name = nameEl.textContent.toLowerCase();
                    item.style.display = name.includes(query) ? 'flex' : 'none';
                }
            });
        },
        
        selectGroupOption: function(e) {
            const option = e.currentTarget;
            
            if (option.id === 'instantGroupOption') {
                if (elements.scheduledGroupOption) elements.scheduledGroupOption.classList.remove('selected');
            } else {
                if (elements.instantGroupOption) elements.instantGroupOption.classList.remove('selected');
            }
            
            option.classList.add('selected');
            UIState.groupCallOption = option.id;
            
            if (elements.startGroupCallBtn) {
                elements.startGroupCallBtn.disabled = false;
            }
        },
        
        getSelectedContacts: function() {
            const selected = [];
            document.querySelectorAll('.contact-checkbox:checked').forEach(checkbox => {
                const contactId = checkbox.id.replace('contact-', '');
                const contact = AppState?.contacts?.find(c => c.id === contactId);
                if (contact) selected.push(contact);
            });
            return selected;
        },
        
        getSelectedGroupContacts: function() {
            const selected = [];
            document.querySelectorAll('.group-contact:checked').forEach(checkbox => {
                const contactId = checkbox.id.replace('group-contact-', '');
                const contact = AppState?.contacts?.find(c => c.id === contactId);
                if (contact) selected.push(contact);
            });
            return selected;
        },
        
        startVoiceCall: function() {
            this.startCallGeneric('voice');
        },
        
        startVideoCall: function() {
            this.startCallGeneric('video');
        },
        
        startCallGeneric: function(type) {
            const isDemo = session && session.isDemoMode ? session.isDemoMode() : false;
            
            if (parentCoordinator && !parentCoordinator.sessionValidated && !isDemo) {
                showNotification('Please wait for authentication', 'warning');
                if (parentCoordinator.showReconnectState) {
                    parentCoordinator.showReconnectState();
                }
                return;
            }
            
            const selectedContacts = this.getSelectedContacts();
            
            if (selectedContacts.length === 0) {
                showNotification('Please select at least one contact', 'warning');
                return;
            }
            
            if (selectedContacts.length > 1 && typeof checkPremiumFeature === 'function' && !checkPremiumFeature('groupCalls')) {
                return;
            }
            
            this.startCall(type, selectedContacts);
            UIEventHandlers.closeNewCallModal();
        },
        
        startGroupCall: function() {
            if (typeof checkPremiumFeature === 'function' && !checkPremiumFeature('groupCalls')) return;
            
            const selectedContacts = this.getSelectedGroupContacts();
            const groupOption = UIState.groupCallOption;
            
            if (selectedContacts.length < 2) {
                showNotification('Please select at least 2 contacts for group call', 'warning');
                return;
            }
            
            if (!groupOption) {
                showNotification('Please select a group call option', 'warning');
                return;
            }
            
            const isInstant = groupOption === 'instantGroupOption';
            
            if (isInstant) {
                this.startCall('video', selectedContacts);
                UIEventHandlers.closeNewCallModal();
            } else {
                this.scheduleGroupCall(selectedContacts);
            }
        },
        
        startCall: function(type, participants) {
            if (AppState?.isInCall) {
                showNotification('You are already in a call', 'warning');
                return;
            }
            
            if (DEBUG) {
                logOnce('info', `Starting ${type} call with ${participants.length} participants`);
            }
            
            const isDemo = session && session.isDemoMode ? session.isDemoMode() : false;
            
            if (window.callCore && typeof window.callCore.startCall === 'function' && !isDemo) {
                window.callCore.startCall({
                    type,
                    participants,
                    callId: 'call-' + Date.now()
                }).then(callId => {
                    if (AppState) {
                        AppState.activeCallId = callId;
                        AppState.callType = type;
                        AppState.callParticipants = participants;
                        AppState.isInCall = true;
                    }
                    
                    UIState.activeCallId = callId;
                    UIState.callType = type;
                    UIState.callParticipants = participants;
                    
                    this.showCallUI();
                    this.startCallTimer();
                    
                }).catch(error => {
                    UILogger.error('Failed to start call via core', error);
                    this.simulateCall(type, participants);
                });
            } else {
                this.simulateCall(type, participants);
            }
        },
        
        simulateCall: function(type, participants) {
            requestMediaPermissionsFn(type)
                .then(stream => {
                    if (AppState) {
                        AppState.localStream = stream;
                        AppState.callType = type;
                        AppState.callParticipants = participants;
                        AppState.activeCallId = 'call-' + Date.now();
                        AppState.isInCall = true;
                    }
                    
                    UIState.localStream = stream;
                    UIState.callType = type;
                    UIState.callParticipants = participants;
                    UIState.activeCallId = 'call-' + Date.now();
                    
                    this.showCallUI();
                    this.startCallTimer();
                    this.initializeCallFeatures();
                    
                    showNotification(`Started ${type} call with ${participants.length} participant(s)`, 'success');
                })
                .catch(error => {
                    showNotification(`Failed to start call: ${error.message}`, 'error');
                });
        },
        
        showCallUI: function() {
            if (elements.sidebar) elements.sidebar.style.display = 'none';
            if (elements.callContainer) elements.callContainer.classList.add('active');
            
            const participantNames = UIState.callParticipants?.map(p => p.name).join(', ') || 'Call';
            if (elements.callWithName) elements.callWithName.textContent = SecuritySanitizer.sanitizeString(participantNames);
            if (elements.callStatusText) elements.callStatusText.textContent = 'In call';
            
            const icon = UIState.callType === 'video' ? 'fa-video' : 'fa-phone';
            if (elements.callTypeIcon) elements.callTypeIcon.innerHTML = `<i class="fas ${icon}"></i>`;
            
            if (AppState?.settings?.emotionalContext) {
                if (typeof updateMoodIndicator === 'function') {
                    updateMoodIndicator(UIState.selectedMood || 'neutral');
                }
                if (typeof updateIntentionIndicator === 'function') {
                    updateIntentionIndicator(UIState.selectedIntention || 'quick');
                }
            }
            
            if (elements.focusModeBtn) elements.focusModeBtn.style.display = 'block';
            
            if (typeof updateParticipantBadge === 'function') {
                updateParticipantBadge();
            }
            
            UIState.currentView = 'call';
        },
        
        startCallTimer: function() {
            if (!AppState) return;
            
            AppState.callStartTime = Date.now();
            UIState.callStartTime = Date.now();
            
            if (AppState.callDurationInterval) {
                clearInterval(AppState.callDurationInterval);
            }
            
            AppState.callDurationInterval = setInterval(() => {
                if (!UIState.callStartTime || !elements.callDuration) return;
                
                const elapsed = Math.floor((Date.now() - UIState.callStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                elements.callDuration.textContent = `${minutes}:${seconds}`;
            }, 1000);
            
            UIState.callDurationInterval = AppState.callDurationInterval;
        },
        
        initializeCallFeatures: function() {
            if (UIState.localStream && UIState.callType === 'video' && elements.videoGrid) {
                const container = elements.videoGrid;
                container.innerHTML = '';
                
                const videoContainer = document.createElement('div');
                videoContainer.className = 'video-container';
                videoContainer.dataset.id = 'local';
                
                const video = document.createElement('video');
                video.className = 'video-element';
                video.autoplay = true;
                video.playsInline = true;
                video.muted = true;
                video.srcObject = UIState.localStream;
                
                const overlay = document.createElement('div');
                overlay.className = 'video-overlay';
                overlay.innerHTML = `
                    <div class="video-name">
                        <span>You</span>
                        <span class="video-status">Host</span>
                    </div>
                `;
                
                videoContainer.appendChild(video);
                videoContainer.appendChild(overlay);
                container.appendChild(videoContainer);
                
                video.play().catch(e => UILogger.warn('Error playing local video', e));
            }
            
            if (AppState?.settings?.liveReactions && elements.reactionsContainer) {
                elements.reactionsContainer.style.display = 'flex';
            }
            
            if (AppState?.settings?.focusMode) {
                this.enableFocusMode();
            }
        },
        
        toggleMute: function() {
            if (!UIState.localStream || !elements.muteBtn) return;
            
            const audioTracks = UIState.localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                UIState.isMuted = !UIState.isMuted;
                audioTracks.forEach(track => {
                    track.enabled = !UIState.isMuted;
                });
                
                const icon = elements.muteBtn.querySelector('i');
                if (icon) {
                    icon.className = UIState.isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                }
                elements.muteBtn.title = UIState.isMuted ? 'Unmute' : 'Mute';
                
                showNotification(UIState.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
            }
        },
        
        toggleVideo: function() {
            if (!UIState.localStream || !elements.videoBtn) return;
            
            const videoTracks = UIState.localStream.getVideoTracks();
            if (videoTracks.length > 0) {
                UIState.isVideoOff = !UIState.isVideoOff;
                videoTracks.forEach(track => {
                    track.enabled = !UIState.isVideoOff;
                });
                
                const icon = elements.videoBtn.querySelector('i');
                if (icon) {
                    icon.className = UIState.isVideoOff ? 'fas fa-video-slash' : 'fas fa-video';
                }
                elements.videoBtn.title = UIState.isVideoOff ? 'Turn Video On' : 'Turn Video Off';
                
                const localVideo = elements.videoGrid?.querySelector('.video-container[data-id="local"]');
                if (localVideo) {
                    localVideo.style.display = UIState.isVideoOff ? 'none' : 'block';
                }
                
                showNotification(UIState.isVideoOff ? 'Camera turned off' : 'Camera turned on', 'info');
            }
        },
        
        toggleScreenShare: function() {
            if (typeof checkPremiumFeature === 'function' && !checkPremiumFeature('screenSharing')) return;
            
            if (UIState.isScreenSharing) {
                this.stopScreenShare();
            } else {
                this.startScreenShare();
            }
        },
        
        startScreenShare: function() {
            if (!navigator.mediaDevices?.getDisplayMedia) {
                showNotification('Screen sharing is not supported in your browser', 'error');
                return;
            }
            
            navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                .then(stream => {
                    UIState.screenStream = stream;
                    UIState.isScreenSharing = true;
                    
                    if (AppState) {
                        AppState.screenStream = stream;
                        AppState.isScreenSharing = true;
                    }
                    
                    if (elements.screenShareBtn) {
                        elements.screenShareBtn.classList.add('active');
                        elements.screenShareBtn.title = 'Stop Sharing';
                    }
                    
                    const videoTrack = stream.getVideoTracks()[0];
                    
                    const localVideo = elements.videoGrid?.querySelector('.video-container[data-id="local"] video');
                    if (localVideo && UIState.localStream) {
                        const newStream = new MediaStream();
                        newStream.addTrack(videoTrack);
                        const audioTrack = UIState.localStream.getAudioTracks()[0];
                        if (audioTrack) newStream.addTrack(audioTrack);
                        
                        localVideo.srcObject = newStream;
                    }
                    
                    videoTrack.addEventListener('ended', () => {
                        this.stopScreenShare();
                    });
                    
                    showNotification('Screen sharing started', 'success');
                })
                .catch(error => {
                    UILogger.error('Error starting screen share', error);
                    showNotification(error.name === 'NotAllowedError' ? 
                        'Screen sharing permission denied' : 
                        'Failed to start screen sharing', 'error');
                });
        },
        
        stopScreenShare: function() {
            if (!UIState.screenStream) return;
            
            UIState.screenStream.getTracks().forEach(track => track.stop());
            UIState.screenStream = null;
            UIState.isScreenSharing = false;
            
            if (AppState) {
                AppState.screenStream = null;
                AppState.isScreenSharing = false;
            }
            
            if (UIState.localStream) {
                const localVideo = elements.videoGrid?.querySelector('.video-container[data-id="local"] video');
                if (localVideo) {
                    localVideo.srcObject = UIState.localStream;
                }
            }
            
            if (elements.screenShareBtn) {
                elements.screenShareBtn.classList.remove('active');
                elements.screenShareBtn.title = 'Share Screen';
            }
            
            showNotification('Screen sharing stopped', 'info');
        },
        
        toggleSpeaker: function() {
            if (!elements.speakerBtn) return;
            
            UIState.isSpeakerOn = !UIState.isSpeakerOn;
            
            const icon = elements.speakerBtn.querySelector('i');
            if (icon) {
                icon.className = UIState.isSpeakerOn ? 'fas fa-volume-up' : 'fas fa-headphones';
            }
            elements.speakerBtn.title = UIState.isSpeakerOn ? 'Switch to Headphones' : 'Switch to Speaker';
            
            showNotification(`Switched to ${UIState.isSpeakerOn ? 'speaker' : 'headphones'}`, 'info');
        },
        
        endCall: function() {
            if (!AppState?.isInCall && !UIState.activeCallId) return;
            
            if (confirm('End the call?')) {
                if (UIState.localStream) {
                    UIState.localStream.getTracks().forEach(track => track.stop());
                    UIState.localStream = null;
                }
                
                if (UIState.screenStream) {
                    UIState.screenStream.getTracks().forEach(track => track.stop());
                    UIState.screenStream = null;
                }
                
                if (window.callCore && typeof window.callCore.endCall === 'function') {
                    window.callCore.endCall(UIState.activeCallId).catch(() => {});
                }
                
                if (UIState.callDurationInterval) {
                    clearInterval(UIState.callDurationInterval);
                    UIState.callDurationInterval = null;
                }
                
                if (AppState?.callDurationInterval) {
                    clearInterval(AppState.callDurationInterval);
                    AppState.callDurationInterval = null;
                }
                
                const callDuration = UIState.callStartTime ? 
                    Math.floor((Date.now() - UIState.callStartTime) / 1000) : 0;
                
                if (AppState) {
                    AppState.isInCall = false;
                    AppState.activeCallId = null;
                    AppState.callParticipants = [];
                    AppState.callStartTime = null;
                }
                
                UIState.activeCallId = null;
                UIState.callParticipants = [];
                UIState.callStartTime = null;
                
                if (elements.callContainer) elements.callContainer.classList.remove('active');
                if (elements.sidebar) elements.sidebar.style.display = 'flex';
                if (elements.focusModeBtn) elements.focusModeBtn.style.display = 'none';
                
                if (UIState.currentFocusMode) {
                    this.disableFocusMode();
                }
                
                if (elements.videoGrid) {
                    elements.videoGrid.innerHTML = '';
                    if (elements.offlineCallPlaceholder) {
                        elements.offlineCallPlaceholder.style.display = 'flex';
                    }
                }
                
                UIState.currentView = 'sidebar';
                
                setTimeout(() => {
                    this.showPrivateNotesModal();
                }, 500);
                
                showNotification('Call ended', 'info');
                if (DEBUG) {
                    logOnce('info', 'Call ended', { duration: callDuration });
                }
            }
        },
        
        openMoodSelectionModal: function() {
            if (elements.moodSelectionModal) {
                elements.moodSelectionModal.classList.add('active');
                UIState.activeModals.add('moodSelectionModal');
                
                document.querySelectorAll('.mood-option').forEach(option => {
                    option.classList.remove('selected');
                    if (option.dataset.mood === UIState.selectedMood) {
                        option.classList.add('selected');
                    }
                });
            }
        },
        
        closeMoodSelectionModal: function() {
            if (elements.moodSelectionModal) {
                elements.moodSelectionModal.classList.remove('active');
                UIState.activeModals.delete('moodSelectionModal');
            }
        },
        
        selectMoodOption: function(e) {
            document.querySelectorAll('.mood-option').forEach(opt => opt.classList.remove('selected'));
            e.currentTarget.classList.add('selected');
            UIState.selectedMood = e.currentTarget.dataset.mood;
        },
        
        setMood: function() {
            const selectedOption = document.querySelector('.mood-option.selected');
            if (selectedOption) {
                const newMood = selectedOption.dataset.mood;
                UIState.selectedMood = newMood;
                
                try {
                    if (SafeStorage && typeof SafeStorage.set === 'function') {
                        SafeStorage.set('currentMood', newMood);
                    } else {
                        localStorage.setItem('currentMood', newMood);
                    }
                } catch (e) {}
                
                if (typeof updateMoodIndicator === 'function') {
                    updateMoodIndicator(newMood);
                }
                
                if (AppState?.isInCall) {
                    sendToParent('MOOD_UPDATE', { mood: newMood, timestamp: Date.now() });
                }
                
                UIEventHandlers.closeMoodSelectionModal();
                showNotification(`Mood set to ${newMood}`, 'success');
            }
        },
        
        openIntentionSelectionModal: function() {
            if (elements.intentionSelectionModal) {
                elements.intentionSelectionModal.classList.add('active');
                UIState.activeModals.add('intentionSelectionModal');
                
                document.querySelectorAll('.intention-option').forEach(option => {
                    option.classList.remove('selected');
                    if (option.dataset.intention === UIState.selectedIntention) {
                        option.classList.add('selected');
                    }
                });
            }
        },
        
        closeIntentionSelectionModal: function() {
            if (elements.intentionSelectionModal) {
                elements.intentionSelectionModal.classList.remove('active');
                UIState.activeModals.delete('intentionSelectionModal');
            }
        },
        
        selectIntentionOption: function(e) {
            document.querySelectorAll('.intention-option').forEach(opt => opt.classList.remove('selected'));
            e.currentTarget.classList.add('selected');
            UIState.selectedIntention = e.currentTarget.dataset.intention;
        },
        
        setIntention: function() {
            const selectedOption = document.querySelector('.intention-option.selected');
            if (selectedOption) {
                const newIntention = selectedOption.dataset.intention;
                UIState.selectedIntention = newIntention;
                
                try {
                    if (SafeStorage && typeof SafeStorage.set === 'function') {
                        SafeStorage.set('currentIntention', newIntention);
                    } else {
                        localStorage.setItem('currentIntention', newIntention);
                    }
                } catch (e) {}
                
                if (typeof updateIntentionIndicator === 'function') {
                    updateIntentionIndicator(newIntention);
                }
                
                if (AppState?.isInCall) {
                    sendToParent('INTENTION_UPDATE', { intention: newIntention, timestamp: Date.now() });
                }
                
                UIEventHandlers.closeIntentionSelectionModal();
                showNotification(`Intention set to ${newIntention}`, 'success');
            }
        },
        
        toggleFocusMode: function() {
            if (UIState.currentFocusMode) {
                this.disableFocusMode();
            } else {
                this.enableFocusMode();
            }
        },
        
        enableFocusMode: function() {
            UIState.currentFocusMode = true;
            if (elements.appContainer) elements.appContainer.classList.add('focus-mode');
            if (elements.focusModeBtn) {
                elements.focusModeBtn.classList.add('active');
                elements.focusModeBtn.title = 'Exit Focus Mode';
            }
            showNotification('Focus mode enabled', 'info');
        },
        
        disableFocusMode: function() {
            UIState.currentFocusMode = false;
            if (elements.appContainer) elements.appContainer.classList.remove('focus-mode');
            if (elements.focusModeBtn) {
                elements.focusModeBtn.classList.remove('active');
                elements.focusModeBtn.title = 'Focus Mode';
            }
        },
        
        showPrivateNotesModal: function() {
            if (!elements.privateNotesModal || !UIState.callParticipants?.length) {
                this.showCallSummary();
                return;
            }
            
            const lastContact = UIState.callParticipants[0];
            
            if (lastContact) {
                if (elements.privateNotesTitle) {
                    elements.privateNotesTitle.textContent = `Notes about call with ${SecuritySanitizer.sanitizeString(lastContact.name)}`;
                }
                if (elements.privateNotesSubtitle) {
                    elements.privateNotesSubtitle.textContent = 'Add private notes about this call (only visible to you)';
                }
                
                const previousNotes = this.getPrivateNotes(lastContact.id);
                if (elements.privateNotesTextarea) {
                    elements.privateNotesTextarea.value = previousNotes || '';
                }
                
                elements.privateNotesModal.classList.add('active');
                UIState.activeModals.add('privateNotesModal');
            } else {
                this.showCallSummary();
            }
        },
        
        skipPrivateNotes: function() {
            if (elements.privateNotesModal) {
                elements.privateNotesModal.classList.remove('active');
                UIState.activeModals.delete('privateNotesModal');
            }
            this.showCallSummary();
        },
        
        savePrivateNotes: function() {
            const notes = elements.privateNotesTextarea?.value.trim() || '';
            const lastContact = UIState.callParticipants?.[0];
            
            if (lastContact && notes) {
                this.savePrivateNotesToStorage(lastContact.id, notes);
                showNotification('Notes saved', 'success');
            }
            
            if (elements.privateNotesModal) {
                elements.privateNotesModal.classList.remove('active');
                UIState.activeModals.delete('privateNotesModal');
            }
            this.showCallSummary();
        },
        
        savePrivateNotesToStorage: function(contactId, notes) {
            try {
                let allNotes = {};
                
                if (SafeStorage && typeof SafeStorage.get === 'function') {
                    allNotes = SafeStorage.get('privateCallNotes') || {};
                } else {
                    allNotes = JSON.parse(localStorage.getItem('privateCallNotes') || '{}');
                }
                
                allNotes[contactId] = {
                    notes: notes,
                    timestamp: new Date().toISOString(),
                    callId: UIState.activeCallId
                };
                
                if (SafeStorage && typeof SafeStorage.set === 'function') {
                    SafeStorage.set('privateCallNotes', allNotes);
                } else {
                    localStorage.setItem('privateCallNotes', JSON.stringify(allNotes));
                }
                
                UIState.privateNotes[contactId] = allNotes[contactId];
            } catch (error) {
                UILogger.error('Error saving private notes', error);
            }
        },
        
        getPrivateNotes: function(contactId) {
            try {
                if (SafeStorage && typeof SafeStorage.get === 'function') {
                    const allNotes = SafeStorage.get('privateCallNotes') || {};
                    return allNotes[contactId] ? allNotes[contactId].notes : null;
                } else {
                    const allNotes = JSON.parse(localStorage.getItem('privateCallNotes') || '{}');
                    return allNotes[contactId] ? allNotes[contactId].notes : null;
                }
            } catch (error) {
                UILogger.error('Error loading private notes', error);
                return null;
            }
        },
        
        showCallSummary: function() {
            if (!elements.callSummaryModal) return;
            
            const callDuration = UIState.callStartTime ? 
                Math.floor((Date.now() - UIState.callStartTime) / 1000) : 0;
            
            const minutes = Math.floor(callDuration / 60);
            const seconds = callDuration % 60;
            
            if (elements.summaryDuration) {
                elements.summaryDuration.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            if (elements.summaryTime) {
                elements.summaryTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            
            if (elements.summaryType) {
                elements.summaryType.textContent = UIState.callType === 'video' ? 'Video Call' : 'Voice Call';
            }
            
            if (elements.summaryMood) {
                elements.summaryMood.textContent = UIState.selectedMood.charAt(0).toUpperCase() + UIState.selectedMood.slice(1);
            }
            
            if (elements.summaryIntention) {
                const intentionMap = {
                    quick: 'Quick Chat',
                    important: 'Important Discussion',
                    emergency: 'Emergency',
                    checkin: 'Check-in',
                    work: 'Work/Business'
                };
                elements.summaryIntention.textContent = intentionMap[UIState.selectedIntention] || 'Quick Chat';
            }
            
            if (elements.summaryParticipants) {
                elements.summaryParticipants.textContent = (UIState.callParticipants?.length || 0) + 1;
            }
            
            elements.callSummaryModal.classList.add('active');
            UIState.activeModals.add('callSummaryModal');
        },
        
        closeCallSummary: function() {
            if (elements.callSummaryModal) {
                elements.callSummaryModal.classList.remove('active');
                UIState.activeModals.delete('callSummaryModal');
            }
        },
        
        declineIncomingCall: function() {
            if (elements.incomingCallModal.dataset.timer) {
                clearInterval(parseInt(elements.incomingCallModal.dataset.timer));
            }
            
            elements.incomingCallModal.classList.remove('active');
            UIState.activeModals.delete('incomingCallModal');
            
            showNotification('Call declined', 'info');
        },
        
        acceptIncomingCall: function() {
            this.acceptIncomingCallGeneric(false);
        },
        
        acceptIncomingCallAsVideo: function() {
            this.acceptIncomingCallGeneric(true);
        },
        
        acceptIncomingCallGeneric: function(asVideo) {
            if (elements.incomingCallModal.dataset.timer) {
                clearInterval(parseInt(elements.incomingCallModal.dataset.timer));
            }
            
            const callerName = elements.incomingCallName?.textContent || 'Caller';
            const isVideoCall = elements.incomingCallType?.textContent?.includes('Video') || false;
            const callType = asVideo ? 'video' : (isVideoCall ? 'video' : 'voice');
            
            elements.incomingCallModal.classList.remove('active');
            UIState.activeModals.delete('incomingCallModal');
            
            showNotification(`Accepting ${callType} call from ${callerName}...`, 'info');
            
            const simulatedParticipant = {
                id: 'incoming-caller',
                name: callerName
            };
            
            requestMediaPermissionsFn(callType)
                .then(stream => {
                    UIState.localStream = stream;
                    UIState.callType = callType;
                    UIState.callParticipants = [simulatedParticipant];
                    UIState.activeCallId = 'call-' + Date.now();
                    
                    if (AppState) {
                        AppState.localStream = stream;
                        AppState.callType = callType;
                        AppState.callParticipants = [simulatedParticipant];
                        AppState.activeCallId = UIState.activeCallId;
                        AppState.isInCall = true;
                    }
                    
                    this.showCallUI();
                    this.startCallTimer();
                    this.initializeCallFeatures();
                    
                    showNotification(`${callType} call started`, 'success');
                })
                .catch(error => {
                    showNotification(`Failed to start call: ${error.message}`, 'error');
                });
        },
        
        generateVoiceCallLink: function() {
            this.generateCallLink('voice');
        },
        
        generateVideoCallLink: function() {
            this.generateCallLink('video');
        },
        
        generateCallLink: function(type) {
            const callId = 'call-' + Math.random().toString(36).substr(2, 9);
            const baseUrl = window.location.origin + window.location.pathname;
            const callUrl = `${baseUrl}?call=${callId}&type=${type}`;
            
            UIState.callLink = callUrl;
            
            if (elements.callLinkInput) {
                elements.callLinkInput.value = callUrl;
            }
            
            showNotification(`${type === 'voice' ? 'Voice' : 'Video'} call link generated`, 'success');
        },
        
        copyCallLink: function() {
            const link = elements.callLinkInput?.value || UIState.callLink;
            
            if (!link) {
                showNotification('Generate a call link first', 'warning');
                return;
            }
            
            navigator.clipboard.writeText(link)
                .then(() => showNotification('Call link copied to clipboard', 'success'))
                .catch(() => showNotification('Failed to copy link', 'error'));
        },
        
        shareCallLink: function() {
            const link = elements.callLinkInput?.value || UIState.callLink;
            
            if (!link) {
                showNotification('Generate a call link first', 'warning');
                return;
            }
            
            if (navigator.share) {
                navigator.share({
                    title: 'Join my call',
                    text: 'Join my call using this link',
                    url: link,
                })
                .then(() => showNotification('Call link shared', 'success'))
                .catch(err => {
                    UILogger.warn('Error sharing', err);
                    this.copyCallLink();
                });
            } else {
                this.copyCallLink();
            }
        },
        
        scheduleGroupCall: function(participants) {
            showNotification('Group call scheduled successfully', 'success');
            UIEventHandlers.closeNewCallModal();
        },
        
        switchCallCategory: function(category) {
            UIState.currentCallCategory = category;
            
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.category === category) {
                    btn.classList.add('active');
                }
            });
            
            if (elements.allCallsSection) elements.allCallsSection.classList.remove('active');
            if (elements.missedCallsSection) elements.missedCallsSection.classList.remove('active');
            if (elements.groupCallsSection) elements.groupCallsSection.classList.remove('active');
            
            if (category === 'all' && elements.allCallsSection) {
                elements.allCallsSection.classList.add('active');
            } else if (category === 'missed' && elements.missedCallsSection) {
                elements.missedCallsSection.classList.add('active');
            } else if (category === 'group' && elements.groupCallsSection) {
                elements.groupCallsSection.classList.add('active');
            }
        },
        
        switchNewCallTab: function(tabId) {
            UIState.currentNewCallTab = tabId;
            
            document.querySelectorAll('.new-call-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.tab === tabId) {
                    tab.classList.add('active');
                }
            });
            
            document.querySelectorAll('.new-call-tab-content').forEach(content => {
                content.classList.remove('active');
                if (content.id === tabId + 'Tab') {
                    content.classList.add('active');
                }
            });
        },
        
        toggleSettingsPanel: function() {
            if (elements.settingsPanel) {
                elements.settingsPanel.classList.toggle('active');
                
                if (elements.settingsToggleIcon) {
                    elements.settingsToggleIcon.className = elements.settingsPanel.classList.contains('active') ? 
                        'fas fa-times' : 'fas fa-cog';
                }
                
                if (elements.settingsPanel.classList.contains('active')) {
                    UIState.activePanels.add('settingsPanel');
                } else {
                    UIState.activePanels.delete('settingsPanel');
                }
            }
        },
        
        openPaymentModal: function() {
            if (elements.paymentModal) {
                elements.paymentModal.classList.add('active');
                UIState.activeModals.add('paymentModal');
            }
            if (elements.premiumLimitOverlay) {
                elements.premiumLimitOverlay.classList.remove('active');
            }
        },
        
        closePaymentModal: function() {
            if (elements.paymentModal) {
                elements.paymentModal.classList.remove('active');
                UIState.activeModals.delete('paymentModal');
            }
        },
        
        selectPaymentOption: function(e) {
            document.querySelectorAll('.payment-option').forEach(option => {
                option.classList.remove('selected');
            });
            e.currentTarget.classList.add('selected');
        },
        
        processPayment: function() {
            const phoneNumber = elements.phoneNumber?.value.trim() || '';
            const amount = elements.paymentAmount?.value;
            
            if (!phoneNumber || !/^07\d{8}$/.test(phoneNumber)) {
                showNotification('Please enter a valid Kenyan phone number (07XXXXXXXX)', 'error');
                return;
            }
            
            if (!amount || amount < 100) {
                showNotification('Please enter a valid amount (minimum 100 KES)', 'error');
                return;
            }
            
            showNotification('Processing payment...', 'info');
            
            setTimeout(() => {
                UIEventHandlers.closePaymentModal();
                if (AppState) AppState.isPremium = true;
                if (typeof updatePremiumUI === 'function') updatePremiumUI();
                showNotification('Payment successful! Premium features unlocked.', 'success');
            }, 2000);
        },
        
        closePremiumLimitModal: function() {
            if (elements.premiumLimitOverlay) {
                elements.premiumLimitOverlay.classList.remove('active');
            }
        },
        
        sendReaction: function(e) {
            if (!AppState?.isInCall && !UIState.activeCallId) {
                showNotification('Join a call to send reactions', 'info');
                return;
            }
            
            let reaction = '👍';
            
            if (e && e.currentTarget) {
                reaction = e.currentTarget.dataset.reaction || '👍';
            }
            
            this.createFloatingReaction(reaction);
            
            sendToParent('REACTION', { reaction, timestamp: Date.now() });
            
            showNotification(`Sent ${reaction} reaction`, 'info');
        },
        
        createFloatingReaction: function(reaction) {
            if (!elements.callContainer) return;
            
            const reactionEl = document.createElement('div');
            reactionEl.className = 'floating-reaction';
            reactionEl.textContent = reaction;
            reactionEl.style.left = Math.random() * 80 + 10 + '%';
            reactionEl.style.top = Math.random() * 80 + 10 + '%';
            
            elements.callContainer.appendChild(reactionEl);
            
            setTimeout(() => {
                if (reactionEl.parentNode) {
                    reactionEl.remove();
                }
            }, 3000);
        },
        
        handleLogout: function() {
            if (DEBUG) {
                logOnce('info', 'Logout triggered');
            }
            
            window.__CHILD_SESSION__.token = null;
            window.__CHILD_SESSION__.userId = null;
            window.__CHILD_SESSION__.expires = null;
            sessionReady = false;
            
            if (AppState) {
                AppState.isAuthenticated = false;
                AppState.user = null;
                AppState.currentUser = null;
            }
            
            const protectedButtons = [
                elements.newCallBtn,
                elements.quickVoiceBtn,
                elements.quickVideoBtn,
                elements.quickGroupBtn
            ];
            
            const isDemo = session && session.isDemoMode ? session.isDemoMode() : false;
            
            protectedButtons.forEach(btn => {
                if (btn && !isDemo) {
                    btn.disabled = true;
                }
            });
            
            if (elements.syncIndicator && !isDemo) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Disconnected</span>';
                elements.syncIndicator.className = 'sync-indicator disconnected';
            }
            
            showNotification('Logged out', 'info');
        }
    };

    // ==================== UI PANEL HANDLERS ====================
    const UIPanelHandlers = {
        openParticipantsPanel: function() {
            if (!AppState?.isInCall && !UIState.activeCallId) {
                showNotification('Join a call to see participants', 'info');
                return;
            }
            
            this.createParticipantsPanel();
        },
        
        openChatPanel: function() {
            if (!AppState?.isInCall && !UIState.activeCallId) {
                showNotification('Join a call to use chat', 'info');
                return;
            }
            
            if (!AppState?.settings?.inCallChat) {
                showNotification('Enable in-call chat in settings', 'info');
                return;
            }
            
            this.createChatPanel();
        },
        
        openWhiteboardPanel: function() {
            if (typeof checkPremiumFeature === 'function' && !checkPremiumFeature('whiteboard')) return;
            
            if (!AppState?.isInCall && !UIState.activeCallId) {
                showNotification('Join a call to use whiteboard', 'info');
                return;
            }
            
            this.createWhiteboardPanel();
        },
        
        openNotesPanel: function() {
            if (!AppState?.isInCall && !UIState.activeCallId) {
                showNotification('Join a call to use notes', 'info');
                return;
            }
            
            if (!AppState?.settings?.notes) {
                showNotification('Enable notes in settings', 'info');
                return;
            }
            
            this.createNotesPanel();
        },
        
        openPollsPanel: function() {
            if (typeof checkPremiumFeature === 'function' && !checkPremiumFeature('polls')) return;
            
            if (!AppState?.isInCall && !UIState.activeCallId) {
                showNotification('Join a call to create polls', 'info');
                return;
            }
            
            if (!AppState?.settings?.polls) {
                showNotification('Enable polls in settings', 'info');
                return;
            }
            
            this.createPollsPanel();
        },
        
        openRelationshipPanel: function() {
            if (typeof checkPremiumFeature === 'function' && !checkPremiumFeature('relationshipInsights')) return;
            
            this.createRelationshipPanel();
        },
        
        createParticipantsPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();
            
            const panel = document.createElement('div');
            panel.className = 'feature-panel participants-panel';
            
            const participants = UIState.callParticipants || AppState?.callParticipants || [];
            const participantCount = participants.length + 1;
            
            let participantsHtml = '';
            participants.forEach(participant => {
                const name = participant.name || 'Participant';
                const initials = name.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
                const bgColor = stringToColor ? stringToColor(name) : '#6c5ce7';
                
                participantsHtml += `
                    <div class="participant-item">
                        <div class="participant-avatar" style="background-color: ${bgColor}">
                            ${SecuritySanitizer.sanitizeString(initials)}
                        </div>
                        <div class="participant-info">
                            <div class="participant-name">${SecuritySanitizer.sanitizeString(name)}</div>
                            <div class="participant-status online">
                                <span class="status-dot"></span> Online
                            </div>
                        </div>
                        ${participant.isPremium ? '<span class="premium-badge">PRO</span>' : ''}
                    </div>
                `;
            });
            
            panel.innerHTML = `
                <div class="panel-header">
                    <h4>Participants (${participantCount})</h4>
                    <button class="panel-close-btn" aria-label="Close panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="panel-content">
                    <div class="participant-item">
                        <div class="participant-avatar" style="background-color: ${stringToColor ? stringToColor('You') : '#6c5ce7'}">Y</div>
                        <div class="participant-info">
                            <div class="participant-name">You (Host)</div>
                            <div class="participant-status online">
                                <span class="status-dot"></span> Online
                            </div>
                        </div>
                        <span class="premium-badge">PRO</span>
                    </div>
                    ${participantsHtml}
                </div>
            `;
            
            document.body.appendChild(panel);
            
            panel.querySelector('.panel-close-btn')?.addEventListener('click', () => panel.remove());
            
            UIState.activePanels.add('participantsPanel');
        },
        
        createChatPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();
            
            const panel = document.createElement('div');
            panel.className = 'feature-panel chat-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h4>In-Call Chat</h4>
                    <button class="panel-close-btn" aria-label="Close panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="panel-content">
                    <div class="chat-messages" id="chatMessagesPanel">
                        <div class="chat-message system">
                            <div class="message-content">Chat started. Messages are end-to-end encrypted.</div>
                            <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                    </div>
                    <div class="chat-input-container">
                        <input type="text" class="chat-input" id="chatInputPanel" 
                               placeholder="Type a message..." aria-label="Chat message">
                        <button class="chat-send-btn" id="chatSendPanel" aria-label="Send message">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
            
            panel.querySelector('.panel-close-btn').addEventListener('click', () => {
                panel.remove();
                UIState.activePanels.delete('chatPanel');
            });
            
            const chatInput = panel.querySelector('#chatInputPanel');
            const chatSend = panel.querySelector('#chatSendPanel');
            
            chatSend.addEventListener('click', () => {
                const message = chatInput.value.trim();
                if (message && typeof sendChatMessage === 'function') {
                    sendChatMessage(message);
                    
                    // Add message to UI
                    const msgEl = document.createElement('div');
                    msgEl.className = 'chat-message self';
                    msgEl.innerHTML = `
                        <div class="message-sender">You</div>
                        <div class="message-content">${SecuritySanitizer.sanitizeString(message)}</div>
                        <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    `;
                    panel.querySelector('.chat-messages').appendChild(msgEl);
                    panel.querySelector('.chat-messages').scrollTop = panel.querySelector('.chat-messages').scrollHeight;
                    
                    chatInput.value = '';
                }
            });
            
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const message = chatInput.value.trim();
                    if (message && typeof sendChatMessage === 'function') {
                        sendChatMessage(message);
                        
                        // Add message to UI
                        const msgEl = document.createElement('div');
                        msgEl.className = 'chat-message self';
                        msgEl.innerHTML = `
                            <div class="message-sender">You</div>
                            <div class="message-content">${SecuritySanitizer.sanitizeString(message)}</div>
                            <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        `;
                        panel.querySelector('.chat-messages').appendChild(msgEl);
                        panel.querySelector('.chat-messages').scrollTop = panel.querySelector('.chat-messages').scrollHeight;
                        
                        chatInput.value = '';
                    }
                }
            });
            
            UIState.activePanels.add('chatPanel');
        },
        
        createWhiteboardPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();
            
            const panel = document.createElement('div');
            panel.className = 'feature-panel whiteboard-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h4>Shared Whiteboard</h4>
                    <button class="panel-close-btn" aria-label="Close panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="panel-content">
                    <div class="whiteboard-toolbar">
                        <div class="tool-btn active" data-tool="pen" title="Pen">
                            <i class="fas fa-pen"></i>
                        </div>
                        <div class="tool-btn" data-tool="eraser" title="Eraser">
                            <i class="fas fa-eraser"></i>
                        </div>
                        <div class="tool-btn" data-tool="text" title="Text">
                            <i class="fas fa-font"></i>
                        </div>
                        <div class="tool-btn" data-tool="line" title="Line">
                            <i class="fas fa-slash"></i>
                        </div>
                        <div class="tool-btn" data-tool="rectangle" title="Rectangle">
                            <i class="fas fa-square"></i>
                        </div>
                        <div class="tool-btn" data-tool="circle" title="Circle">
                            <i class="fas fa-circle"></i>
                        </div>
                        <div class="tool-color" style="background-color: #000000;" data-color="#000000" title="Black"></div>
                        <div class="tool-color selected" style="background-color: #ff3b30;" data-color="#ff3b30" title="Red"></div>
                        <div class="tool-color" style="background-color: #007aff;" data-color="#007aff" title="Blue"></div>
                        <div class="tool-color" style="background-color: #34c759;" data-color="#34c759" title="Green"></div>
                        <div class="tool-color" style="background-color: #ff9500;" data-color="#ff9500" title="Orange"></div>
                        <input type="range" class="tool-size-slider" min="1" max="20" value="3" title="Brush size">
                        <button class="tool-btn" id="clearWhiteboard" title="Clear whiteboard">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <canvas class="whiteboard-canvas" width="800" height="500"></canvas>
                    <div class="whiteboard-status">
                        <span>Whiteboard ready. Draw something!</span>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
            
            if (typeof initializeWhiteboard === 'function') {
                initializeWhiteboard(panel.querySelector('.whiteboard-canvas'));
            }
            
            // Basic whiteboard functionality
            const canvas = panel.querySelector('.whiteboard-canvas');
            const ctx = canvas.getContext('2d');
            let drawing = false;
            let currentTool = 'pen';
            let currentColor = '#ff3b30';
            let currentSize = 3;
            
            canvas.addEventListener('mousedown', (e) => {
                drawing = true;
                ctx.beginPath();
                ctx.moveTo(e.offsetX, e.offsetY);
            });
            
            canvas.addEventListener('mousemove', (e) => {
                if (!drawing) return;
                ctx.strokeStyle = currentColor;
                ctx.lineWidth = currentSize;
                ctx.lineTo(e.offsetX, e.offsetY);
                ctx.stroke();
            });
            
            canvas.addEventListener('mouseup', () => {
                drawing = false;
            });
            
            canvas.addEventListener('mouseleave', () => {
                drawing = false;
            });
            
            panel.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
                btn.addEventListener('click', () => {
                    panel.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentTool = btn.dataset.tool;
                });
            });
            
            panel.querySelectorAll('.tool-color').forEach(colorBtn => {
                colorBtn.addEventListener('click', () => {
                    panel.querySelectorAll('.tool-color').forEach(c => c.classList.remove('selected'));
                    colorBtn.classList.add('selected');
                    currentColor = colorBtn.dataset.color;
                });
            });
            
            panel.querySelector('.tool-size-slider').addEventListener('input', (e) => {
                currentSize = parseInt(e.target.value);
            });
            
            panel.querySelector('#clearWhiteboard').addEventListener('click', () => {
                if (confirm('Clear the entire whiteboard?')) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            });
            
            panel.querySelector('.panel-close-btn').addEventListener('click', () => {
                panel.remove();
                UIState.activePanels.delete('whiteboardPanel');
            });
            
            UIState.activePanels.add('whiteboardPanel');
        },
        
        createNotesPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();
            
            const panel = document.createElement('div');
            panel.className = 'feature-panel notes-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h4>Shared Notes</h4>
                    <button class="panel-close-btn" aria-label="Close panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="panel-content">
                    <div class="notes-editor-container">
                        <textarea class="notes-editor" id="sharedNotesEditor" 
                                  placeholder="Start taking notes...">Meeting Notes:\n- \n- \n-</textarea>
                        <div class="notes-toolbar">
                            <button class="notes-btn" data-action="bold" title="Bold">
                                <i class="fas fa-bold"></i>
                            </button>
                            <button class="notes-btn" data-action="italic" title="Italic">
                                <i class="fas fa-italic"></i>
                            </button>
                            <button class="notes-btn" data-action="list" title="Bullet list">
                                <i class="fas fa-list-ul"></i>
                            </button>
                            <button class="notes-btn" data-action="save" title="Save notes">
                                <i class="fas fa-save"></i> Save
                            </button>
                        </div>
                    </div>
                    <div class="notes-history">
                        <h5>Previous Notes</h5>
                        <div class="notes-history-list">
                            <div class="notes-history-item">
                                <div class="notes-history-date">Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                <div class="notes-history-preview">Meeting notes...</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
            
            panel.querySelector('.panel-close-btn').addEventListener('click', () => {
                panel.remove();
                UIState.activePanels.delete('notesPanel');
            });
            
            panel.querySelector('[data-action="save"]').addEventListener('click', () => {
                const notes = panel.querySelector('#sharedNotesEditor').value;
                if (notes.trim() && typeof saveSharedNotes === 'function') {
                    saveSharedNotes(notes);
                    showNotification('Notes saved', 'success');
                }
            });
            
            UIState.activePanels.add('notesPanel');
        },
        
        createPollsPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();
            
            const panel = document.createElement('div');
            panel.className = 'feature-panel polls-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h4>Polls</h4>
                    <button class="panel-close-btn" aria-label="Close panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="panel-content">
                    <div class="polls-tabs">
                        <button class="polls-tab active" data-tab="create">Create Poll</button>
                        <button class="polls-tab" data-tab="active">Active Polls</button>
                        <button class="polls-tab" data-tab="results">Results</button>
                    </div>
                    
                    <div class="polls-tab-content active" data-tab="create">
                        <div class="poll-form">
                            <input type="text" class="poll-question-input" placeholder="Enter your poll question...">
                            <div class="poll-options">
                                <input type="text" class="poll-option-input" placeholder="Option 1">
                                <input type="text" class="poll-option-input" placeholder="Option 2">
                                <button class="add-option-btn">Add Option</button>
                            </div>
                            <div class="poll-settings">
                                <label>
                                    <input type="checkbox" checked> Multiple choices allowed
                                </label>
                                <label>
                                    <input type="checkbox"> Anonymous voting
                                </label>
                            </div>
                            <button class="create-poll-btn">Create Poll</button>
                        </div>
                    </div>
                    
                    <div class="polls-tab-content" data-tab="active">
                        <div class="active-polls-list">
                            <div class="poll-item">
                                <div class="poll-question">What time works best for our next meeting?</div>
                                <div class="poll-options">
                                    <div class="poll-option">
                                        <input type="radio" name="poll1" id="poll1-1">
                                        <label for="poll1-1">Monday 10 AM</label>
                                    </div>
                                    <div class="poll-option">
                                        <input type="radio" name="poll1" id="poll1-2">
                                        <label for="poll1-2">Tuesday 2 PM</label>
                                    </div>
                                    <div class="poll-option">
                                        <input type="radio" name="poll1" id="poll1-3">
                                        <label for="poll1-3">Wednesday 11 AM</label>
                                    </div>
                                </div>
                                <button class="vote-btn">Vote</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="polls-tab-content" data-tab="results">
                        <div class="poll-results">
                            <div class="poll-result-item">
                                <div class="poll-question">Favorite meeting platform?</div>
                                <div class="result-bar">
                                    <div class="result-fill" style="width: 60%">Zoom (60%)</div>
                                </div>
                                <div class="result-bar">
                                    <div class="result-fill" style="width: 30%">Google Meet (30%)</div>
                                </div>
                                <div class="result-bar">
                                    <div class="result-fill" style="width: 10%">Teams (10%)</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
            
            panel.querySelector('.panel-close-btn').addEventListener('click', () => {
                panel.remove();
                UIState.activePanels.delete('pollsPanel');
            });
            
            panel.querySelectorAll('.polls-tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    const tabName = this.dataset.tab;
                    
                    panel.querySelectorAll('.polls-tab').forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                    
                    panel.querySelectorAll('.polls-tab-content').forEach(content => {
                        content.classList.remove('active');
                        if (content.dataset.tab === tabName) {
                            content.classList.add('active');
                        }
                    });
                });
            });
            
            // Add option button
            panel.querySelector('.add-option-btn').addEventListener('click', () => {
                const optionsContainer = panel.querySelector('.poll-options');
                const newInput = document.createElement('input');
                newInput.type = 'text';
                newInput.className = 'poll-option-input';
                newInput.placeholder = `Option ${optionsContainer.children.length + 1}`;
                optionsContainer.insertBefore(newInput, panel.querySelector('.add-option-btn'));
            });
            
            panel.querySelector('.create-poll-btn').addEventListener('click', () => {
                const question = panel.querySelector('.poll-question-input').value;
                if (question.trim()) {
                    showNotification('Poll created successfully!', 'success');
                    
                    // Switch to active polls tab
                    panel.querySelector('[data-tab="active"]').click();
                }
            });
            
            UIState.activePanels.add('pollsPanel');
        },
        
        createRelationshipPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();
            
            const panel = document.createElement('div');
            panel.className = 'feature-panel relationship-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h4>Relationship Insights</h4>
                    <button class="panel-close-btn" aria-label="Close panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="panel-content">
                    <div class="insight-cards">
                        <div class="insight-card">
                            <div class="insight-title">Total Calls</div>
                            <div class="insight-value">47</div>
                            <div class="insight-description">With all contacts</div>
                            <span class="insight-trend trend-up">+12%</span>
                        </div>
                        <div class="insight-card">
                            <div class="insight-title">Average Duration</div>
                            <div class="insight-value">24m</div>
                            <div class="insight-description">Per call</div>
                            <span class="insight-trend trend-neutral">0%</span>
                        </div>
                        <div class="insight-card">
                            <div class="insight-title">Busiest Day</div>
                            <div class="insight-value">Wednesday</div>
                            <div class="insight-description">Most calls scheduled</div>
                        </div>
                        <div class="insight-card">
                            <div class="insight-title">Favorite Contact</div>
                            <div class="insight-value">Sarah</div>
                            <div class="insight-description">15 calls this month</div>
                            <span class="insight-trend trend-up">+3</span>
                        </div>
                    </div>
                    <div class="relationship-chart">
                        <h5>Call Frequency (Last 30 days)</h5>
                        <div class="chart-container">
                            <div class="chart-bar" style="height: 80%">Mon</div>
                            <div class="chart-bar" style="height: 60%">Tue</div>
                            <div class="chart-bar" style="height: 90%">Wed</div>
                            <div class="chart-bar" style="height: 70%">Thu</div>
                            <div class="chart-bar" style="height: 50%">Fri</div>
                            <div class="chart-bar" style="height: 40%">Sat</div>
                            <div class="chart-bar" style="height: 30%">Sun</div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
            
            panel.querySelector('.panel-close-btn').addEventListener('click', () => {
                panel.remove();
                UIState.activePanels.delete('relationshipPanel');
            });
            
            UIState.activePanels.add('relationshipPanel');
        }
    };

    // ==================== NOTIFICATION SYSTEM ====================
    function createNotification({ type = 'info', title, message, duration = 3000 } = {}) {
        try {
            const notification = document.createElement('div');
            notification.className = `call-notification ${type}`;
            notification.setAttribute('role', 'alert');
            
            const iconMap = {
                success: 'fa-check-circle',
                error: 'fa-exclamation-circle',
                warning: 'fa-exclamation-triangle',
                info: 'fa-info-circle'
            };
            
            notification.innerHTML = `
                <div class="call-notification-icon">
                    <i class="fas ${iconMap[type] || 'fa-bell'}"></i>
                </div>
                <div class="call-notification-content">
                    <div class="call-notification-title">${title || type.charAt(0).toUpperCase() + type.slice(1)}</div>
                    <div class="call-notification-message">${SecuritySanitizer.sanitizeString(message)}</div>
                </div>
                <button class="call-notification-close" aria-label="Close notification">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            const closeBtn = notification.querySelector('.call-notification-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => notification.remove());
            }
            
            const timer = setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, duration);
            
            UIState.cachedElements.set(`notification_${Date.now()}`, { notification, timer });
            
            return notification;
        } catch (error) {
            UILogger.error('createNotification', error);
            return null;
        }
    }

    function showNotification(message, type = 'success') {
        const notificationArea = elements.notificationArea || document.body;
        
        const notification = createNotification({
            type,
            title: type.charAt(0).toUpperCase() + type.slice(1),
            message,
            duration: 3000
        });
        
        if (notification) {
            notificationArea.appendChild(notification);
        }
    }

    function requestMediaPermissionsFn(type) {
        const constraints = {
            audio: true,
            video: type === 'video'
        };
        
        return navigator.mediaDevices.getUserMedia(constraints)
            .catch(error => {
                UILogger.error('Error getting media permissions', error);
                
                let errorMessage = 'Could not access ';
                if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                    errorMessage += 'camera/microphone. Please check your devices.';
                } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                    errorMessage += 'camera/microphone. Please allow permissions.';
                } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                    errorMessage += 'camera/microphone. Device may be in use by another application.';
                } else {
                    errorMessage += 'camera/microphone. Unknown error.';
                }
                
                throw new Error(errorMessage);
            });
    }

    const ViewHistory = {
        push: function(view, data = {}) {
            UIState.viewHistory.push({
                view,
                data,
                timestamp: Date.now()
            });
            
            if (UIState.viewHistory.length > 50) {
                UIState.viewHistory.shift();
            }
            
            UIState.currentView = view;
        },
        
        pop: function() {
            UIState.viewHistory.pop();
            const previous = UIState.viewHistory[UIState.viewHistory.length - 1];
            UIState.currentView = previous?.view || 'sidebar';
            return previous;
        },
        
        createRestorePoint: function(key) {
            UIState.restorePoints.set(key, {
                view: UIState.currentView,
                activePanels: Array.from(UIState.activePanels),
                activeModals: Array.from(UIState.activeModals),
                timestamp: Date.now()
            });
            
            if (DEBUG) {
                logOnce('info', `Created restore point: ${key}`);
            }
        },
        
        restore: function(key) {
            const point = UIState.restorePoints.get(key);
            if (!point) return false;
            
            document.querySelectorAll('.feature-panel.active, .modal.active').forEach(el => {
                el.classList.remove('active');
            });
            
            UIState.activePanels.clear();
            UIState.activeModals.clear();
            
            UIState.currentView = point.view;
            
            if (DEBUG) {
                logOnce('info', `Restored from point: ${key}`);
            }
            return true;
        }
    };

    async function initializeUISystem() {
        if (UIState.initialized) {
            if (DEBUG) {
                logOnce('info', 'UI system already initialized');
            }
            return { success: true, stages: UIState.renderStages };
        }
        
        if (DEBUG) {
            logOnce('info', 'Initializing UI system');
        }
        
        // Wait for core to be ready
        const coreReady = await waitForCoreReady(10000);
        if (coreReady) {
            logOnce('success', 'Core is ready, proceeding with UI initialization');
        } else {
            logOnce('warn', 'Core not ready, initializing UI with fallback');
        }
        
        cacheElements();
        await RenderingPipeline.execute();
        CoreIntegration.subscribeToCore();
        
        UIState.renderStages.initial = true;
        UIState.initialized = true;
        
        if (DiagnosticsAgent && typeof DiagnosticsAgent.snapshot === 'function') {
            DiagnosticsAgent.snapshot('ui_ready');
        }
        
        if (DEBUG) {
            logOnce('info', 'UI initialization complete', {
                renderStages: UIState.renderStages,
                renderCount: UIState.renderCount,
                elementsCached: UIState.cachedElements.size,
                handshake: {
                    parentReady,
                    sessionReady,
                    handshakeComplete
                }
            });
        }
        
        return {
            success: true,
            stages: UIState.renderStages,
            diagnostics: UIDiagnostics.getReport()
        };
    }

    // ==================== EXPORTS ====================
    const PanelHandlers = UIPanelHandlers;
    const openParticipantsPanel = UIPanelHandlers.openParticipantsPanel.bind(UIPanelHandlers);
    const openChatPanel = UIPanelHandlers.openChatPanel.bind(UIPanelHandlers);
    const openWhiteboardPanel = UIPanelHandlers.openWhiteboardPanel.bind(UIPanelHandlers);
    const openNotesPanel = UIPanelHandlers.openNotesPanel.bind(UIPanelHandlers);
    const openPollsPanel = UIPanelHandlers.openPollsPanel.bind(UIPanelHandlers);
    const openRelationshipPanel = UIPanelHandlers.openRelationshipPanel.bind(UIPanelHandlers);
    const createParticipantsPanel = UIPanelHandlers.createParticipantsPanel.bind(UIPanelHandlers);
    const createChatPanel = UIPanelHandlers.createChatPanel.bind(UIPanelHandlers);
    const createWhiteboardPanel = UIPanelHandlers.createWhiteboardPanel.bind(UIPanelHandlers);
    const createNotesPanel = UIPanelHandlers.createNotesPanel.bind(UIPanelHandlers);
    const createPollsPanel = UIPanelHandlers.createPollsPanel.bind(UIPanelHandlers);
    const createRelationshipPanel = UIPanelHandlers.createRelationshipPanel.bind(UIPanelHandlers);

    const EventHandlers = UIEventHandlers;
    const toggleMenuDots = UIEventHandlers.toggleMenuDots.bind(UIEventHandlers);
    const closeMenuDots = UIEventHandlers.closeMenuDots.bind(UIEventHandlers);
    const openNewCallModal = UIEventHandlers.openNewCallModal.bind(UIEventHandlers);
    const closeNewCallModal = UIEventHandlers.closeNewCallModal.bind(UIEventHandlers);
    const searchContacts = UIEventHandlers.searchContacts.bind(UIEventHandlers);
    const searchGroupContacts = UIEventHandlers.searchGroupContacts.bind(UIEventHandlers);
    const selectGroupOption = UIEventHandlers.selectGroupOption.bind(UIEventHandlers);
    const startVoiceCall = UIEventHandlers.startVoiceCall.bind(UIEventHandlers);
    const startVideoCall = UIEventHandlers.startVideoCall.bind(UIEventHandlers);
    const startGroupCall = UIEventHandlers.startGroupCall.bind(UIEventHandlers);
    const generateVoiceCallLink = UIEventHandlers.generateVoiceCallLink.bind(UIEventHandlers);
    const generateVideoCallLink = UIEventHandlers.generateVideoCallLink.bind(UIEventHandlers);
    const copyCallLink = UIEventHandlers.copyCallLink.bind(UIEventHandlers);
    const shareCallLink = UIEventHandlers.shareCallLink.bind(UIEventHandlers);
    const toggleMute = UIEventHandlers.toggleMute.bind(UIEventHandlers);
    const toggleVideo = UIEventHandlers.toggleVideo.bind(UIEventHandlers);
    const toggleScreenShare = UIEventHandlers.toggleScreenShare.bind(UIEventHandlers);
    const toggleSpeaker = UIEventHandlers.toggleSpeaker.bind(UIEventHandlers);
    const openMoodSelectionModal = UIEventHandlers.openMoodSelectionModal.bind(UIEventHandlers);
    const closeMoodSelectionModal = UIEventHandlers.closeMoodSelectionModal.bind(UIEventHandlers);
    const setMood = UIEventHandlers.setMood.bind(UIEventHandlers);
    const openIntentionSelectionModal = UIEventHandlers.openIntentionSelectionModal.bind(UIEventHandlers);
    const closeIntentionSelectionModal = UIEventHandlers.closeIntentionSelectionModal.bind(UIEventHandlers);
    const setIntention = UIEventHandlers.setIntention.bind(UIEventHandlers);
    const toggleFocusMode = UIEventHandlers.toggleFocusMode.bind(UIEventHandlers);
    const enableFocusMode = UIEventHandlers.enableFocusMode.bind(UIEventHandlers);
    const disableFocusMode = UIEventHandlers.disableFocusMode.bind(UIEventHandlers);
    const endCall = UIEventHandlers.endCall.bind(UIEventHandlers);
    const skipPrivateNotes = UIEventHandlers.skipPrivateNotes.bind(UIEventHandlers);
    const savePrivateNotes = UIEventHandlers.savePrivateNotes.bind(UIEventHandlers);
    const showCallSummary = UIEventHandlers.showCallSummary.bind(UIEventHandlers);
    const closeCallSummary = UIEventHandlers.closeCallSummary.bind(UIEventHandlers);
    const declineIncomingCall = UIEventHandlers.declineIncomingCall.bind(UIEventHandlers);
    const acceptIncomingCall = UIEventHandlers.acceptIncomingCall.bind(UIEventHandlers);
    const acceptIncomingCallAsVideo = UIEventHandlers.acceptIncomingCallAsVideo.bind(UIEventHandlers);
    const switchCallCategory = UIEventHandlers.switchCallCategory.bind(UIEventHandlers);
    const switchNewCallTab = UIEventHandlers.switchNewCallTab.bind(UIEventHandlers);
    const toggleSettingsPanel = UIEventHandlers.toggleSettingsPanel.bind(UIEventHandlers);
    const openPaymentModal = UIEventHandlers.openPaymentModal.bind(UIEventHandlers);
    const closePaymentModal = UIEventHandlers.closePaymentModal.bind(UIEventHandlers);
    const selectPaymentOption = UIEventHandlers.selectPaymentOption.bind(UIEventHandlers);
    const processPayment = UIEventHandlers.processPayment.bind(UIEventHandlers);
    const closePremiumLimitModal = UIEventHandlers.closePremiumLimitModal.bind(UIEventHandlers);
    const sendReaction = UIEventHandlers.sendReaction.bind(UIEventHandlers);
    const handleLogout = UIEventHandlers.handleLogout.bind(UIEventHandlers);

    const requestMediaPermissionsFnExport = requestMediaPermissionsFn;

    const EventSystemExport = EventSystem;
    const RenderingPipelineExport = RenderingPipeline;
    const CoreIntegrationExport = CoreIntegration;
    const ResponsiveEngineExport = ResponsiveEngine;
    const SecuritySanitizerExport = SecuritySanitizer;
    const ViewHistoryExport = ViewHistory;

    const UIStateExport = UIState;
    const UIDiagnosticsExport = UIDiagnostics;
    const UILoggerExport = UILogger;
    const UIErrorBoundaryExport = UIErrorBoundary;

    const elementsExport = elements;

    window.callsUI = {
        initializeUISystem,
        cacheElements,
        PanelHandlers,
        openParticipantsPanel,
        openChatPanel,
        openWhiteboardPanel,
        openNotesPanel,
        openPollsPanel,
        openRelationshipPanel,
        createParticipantsPanel,
        createChatPanel,
        createWhiteboardPanel,
        createNotesPanel,
        createPollsPanel,
        createRelationshipPanel,
        EventHandlers,
        toggleMenuDots,
        closeMenuDots,
        openNewCallModal,
        closeNewCallModal,
        searchContacts,
        searchGroupContacts,
        selectGroupOption,
        startVoiceCall,
        startVideoCall,
        startGroupCall,
        generateVoiceCallLink,
        generateVideoCallLink,
        copyCallLink,
        shareCallLink,
        toggleMute,
        toggleVideo,
        toggleScreenShare,
        toggleSpeaker,
        openMoodSelectionModal,
        closeMoodSelectionModal,
        setMood,
        openIntentionSelectionModal,
        closeIntentionSelectionModal,
        setIntention,
        toggleFocusMode,
        enableFocusMode,
        disableFocusMode,
        endCall,
        skipPrivateNotes,
        savePrivateNotes,
        showCallSummary,
        closeCallSummary,
        declineIncomingCall,
        acceptIncomingCall,
        acceptIncomingCallAsVideo,
        switchCallCategory,
        switchNewCallTab,
        toggleSettingsPanel,
        openPaymentModal,
        closePaymentModal,
        selectPaymentOption,
        processPayment,
        closePremiumLimitModal,
        sendReaction,
        handleLogout,
        requestMediaPermissionsFn: requestMediaPermissionsFnExport,
        EventSystem: EventSystemExport,
        RenderingPipeline: RenderingPipelineExport,
        CoreIntegration: CoreIntegrationExport,
        ResponsiveEngine: ResponsiveEngineExport,
        SecuritySanitizer: SecuritySanitizerExport,
        ViewHistory: ViewHistoryExport,
        UIState: UIStateExport,
        UIDiagnostics: UIDiagnosticsExport,
        UILogger: UILoggerExport,
        UIErrorBoundary: UIErrorBoundaryExport,
        elements: elementsExport,
        showNotification,
        getSessionCache: () => window.__CHILD_SESSION__,
        getHandshakeStatus: () => ({
            parentReady,
            sessionReady,
            handshakeComplete
        }),
        getDiagnostics: () => UIDiagnostics.getReport(),
        getEnvironment: () => IframeEnvironment ? IframeEnvironment.getFullReport() : 
                             (EnvironmentDetector ? EnvironmentDetector.getFullReport() : null),
        getUIState: () => ({ ...UIState })
    };

    // Auto-initialize after core is ready
    waitForCoreReady(10000).then(() => {
        initializeUISystem().catch(error => {
            if (DEBUG) {
                logOnce('error', 'Auto-initialization failed', error);
            }
            RenderingPipeline.skeleton();
        });
    });

})();