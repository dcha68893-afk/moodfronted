// =============================================
// MESSAGES-UI.js - HARDENED PRODUCTION UI ENGINE v4.3.4
// FIXED: Properly syncs with MessagesCore (capital M)
// FIXED: Session state synchronization
// FIXED: Lifecycle state detection
// FIXED: Chat panel display and message input box
// =============================================

(function() {
    'use strict';

    // =============================================
    // CONSTANTS & CONFIGURATION
    // =============================================
    const VERSION = '4.3.4';
    const APP_NAME = 'kynecta-messages-ui';
    const SOURCE_CHILD = 'CHILD';
    const FRAME_ID = 'messagesIframe';
    
    // Lifecycle states (aligned with core v8.0.3 - DETERMINISTIC)
    const LIFECYCLE_STATES = {
        BOOT: 'BOOT',
        INITIALIZING: 'INITIALIZING',
        READY: 'READY',
        WAIT_PARENT: 'WAIT_PARENT',
        WAITING_AUTH: 'WAITING_AUTH',
        ACTIVE: 'ACTIVE'
    };
    
    const UI_STATE = {
        SIDEBAR_VISIBLE: 'sidebar_visible',
        CONTACTS_VISIBLE: 'contacts_visible',
        CHAT_VISIBLE: 'chat_visible',
        THREAD_VISIBLE: 'thread_visible',
        MULTI_SEND_VISIBLE: 'multi_send_visible',
        CURRENT_THEME: 'current_theme',
        FONT_SIZE: 'font_size',
        CONNECTION_QUALITY: 'connection_quality',
        RECOVERY_MODE: 'recovery_mode',
        HANDSHAKE_STATUS: 'handshake_status',
        SESSION_STATUS: 'session_status',
        PARENT_READY: 'parent_ready',
        LIFECYCLE_STATE: 'lifecycle_state',
        SESSION_VALID: 'session_valid'
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
    // UI LOGGING SYSTEM (SILENT WITH DEDUPLICATION)
    // =============================================
    const UILogger = {
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
    // SESSION VALIDATION UTILITY (CRITICAL)
    // =============================================
    function __isValidSession(session) {
        if (!session) return false;
        
        if (!session.token || typeof session.token !== 'string') return false;
        
        if (session.userId === undefined || session.userId === null) return false;
        if (typeof session.userId !== 'number') return false;
        if (session.userId === 0) return false;
        
        const userIdStr = String(session.userId);
        if (userIdStr === 'user' || userIdStr === 'default' || userIdStr === '') return false;
        
        return true;
    }

    // =============================================
    // GET CORE REFERENCE (WORKS WITH BOTH CASES)
    // =============================================
    function getMessagesCore() {
        // Try window.MessagesCore first (capital M - what core exports)
        if (window.MessagesCore && typeof window.MessagesCore === 'object') {
            return window.MessagesCore;
        }
        // Fallback to window.messagesCore
        if (window.messagesCore && typeof window.messagesCore === 'object') {
            return window.messagesCore;
        }
        return null;
    }

    // =============================================
    // UI FAILSAFE (PREVENTS FREEZING WITH ENHANCED SAFETY)
    // =============================================
    const UIFailsafe = {
        enabled: true,
        pendingActions: [],
        processing: false,
        lastActionTime: 0,
        actionThrottle: 100,
        _initialized: false,
        _cachedCoreSessionValid: false,
        _lastCoreCheckTime: 0,
        
        init() {
            if (this._initialized) return this;
            this._setupErrorBoundary();
            this._initialized = true;
            return this;
        },
        
        _setupErrorBoundary() {
            window.addEventListener('error', (event) => {
                this.handleUIError(event.error || event.message);
                return false;
            });
            
            window.addEventListener('unhandledrejection', (event) => {
                this.handleUIError(event.reason);
            });
        },
        
        handleUIError(error) {
            UILogger.error('UIFailsafe', 'UI Error caught', error);
            
            const buttons = document.querySelectorAll('button');
            buttons.forEach(btn => {
                if (btn.disabled) {
                    btn.disabled = false;
                }
            });
            
            const inputs = document.querySelectorAll('input, textarea');
            inputs.forEach(input => {
                if (input.disabled && !input.closest('.reconnect-overlay')) {
                    input.disabled = false;
                }
            });
        },
        
        queueAction(action, fallback = null) {
            if (!this.enabled) {
                try {
                    return action();
                } catch (e) {
                    this.handleUIError(e);
                    return fallback;
                }
            }
            
            const now = Date.now();
            if (now - this.lastActionTime < this.actionThrottle) {
                this.pendingActions.push(action);
                if (!this.processing) {
                    setTimeout(() => this.processQueue(), this.actionThrottle);
                }
                return fallback;
            }
            
            this.lastActionTime = now;
            try {
                return action();
            } catch (e) {
                this.handleUIError(e);
                return fallback;
            }
        },
        
        processQueue() {
            if (this.processing || this.pendingActions.length === 0) return;
            
            this.processing = true;
            this.lastActionTime = Date.now();
            
            const action = this.pendingActions.shift();
            try {
                action();
            } catch (e) {
                this.handleUIError(e);
            }
            
            this.processing = false;
            
            if (this.pendingActions.length > 0) {
                setTimeout(() => this.processQueue(), this.actionThrottle);
            }
        },
        
        safeSetAttribute(element, attr, value) {
            if (!element) return;
            try {
                element.setAttribute(attr, value);
            } catch (e) {}
        },
        
        safeRemoveAttribute(element, attr) {
            if (!element) return;
            try {
                element.removeAttribute(attr);
            } catch (e) {}
        },
        
        safeSetProperty(element, prop, value) {
            if (!element) return;
            try {
                element[prop] = value;
            } catch (e) {}
        },
        
        safeSetStyle(element, property, value) {
            if (!element || !element.style) return;
            try {
                element.style[property] = value;
            } catch (e) {}
        },
        
        safeAddClass(element, className) {
            if (!element || !element.classList) return;
            try {
                element.classList.add(className);
            } catch (e) {}
        },
        
        safeRemoveClass(element, className) {
            if (!element || !element.classList) return;
            try {
                element.classList.remove(className);
            } catch (e) {}
        },
        
        safeToggleClass(element, className, force) {
            if (!element || !element.classList) return;
            try {
                element.classList.toggle(className, force);
            } catch (e) {}
        },
        
        safeSetHTML(element, html) {
            if (!element) return;
            try {
                element.innerHTML = html;
            } catch (e) {}
        },
        
        safeSetText(element, text) {
            if (!element) return;
            try {
                element.textContent = text;
            } catch (e) {}
        },
        
        safeGetElement(id) {
            try {
                return document.getElementById(id);
            } catch (e) {
                return null;
            }
        },
        
        safeQuerySelector(selector) {
            try {
                return document.querySelector(selector);
            } catch (e) {
                return null;
            }
        },
        
        safeQuerySelectorAll(selector) {
            try {
                return document.querySelectorAll(selector);
            } catch (e) {
                return [];
            }
        },

        safeGetDataset(element, key) {
            if (!element || !element.dataset) return null;
            try {
                return element.dataset[key];
            } catch (e) {
                return null;
            }
        },

        safeSetDataset(element, key, value) {
            if (!element || !element.dataset) return false;
            try {
                element.dataset[key] = value;
                return true;
            } catch (e) {
                return false;
            }
        },

        safeForEach(collection, callback) {
            if (!collection) return;
            try {
                if (collection.forEach) {
                    collection.forEach(callback);
                } else {
                    for (let i = 0; i < collection.length; i++) {
                        const item = collection[i];
                        if (item) callback(item, i);
                    }
                }
            } catch (e) {}
        },

        safeProcessMessageElements(container, callback) {
            if (!container) return;
            try {
                const elements = container.querySelectorAll('.message');
                if (elements && elements.length > 0) {
                    for (let i = 0; i < elements.length; i++) {
                        const el = elements[i];
                        if (el && el.dataset) {
                            callback(el);
                        }
                    }
                }
            } catch (e) {}
        },

        // FIXED: Get core instance with proper case handling
        _getCore() {
            return getMessagesCore();
        },

        isCoreReady() {
            const core = this._getCore();
            if (core) {
                if (core.isReady && core.isReady()) {
                    return true;
                }
                const coreState = core.getState?.();
                if (coreState && coreState.state === LIFECYCLE_STATES.ACTIVE) {
                    return true;
                }
                if (core.SessionManager && core.SessionManager.isSessionReady?.()) {
                    return true;
                }
            }
            return false;
        },
        
        // FIXED: Check session validity from core
        isSessionValid() {
            const core = this._getCore();
            if (core && core.isAuthenticated) {
                return core.isAuthenticated();
            }
            return false;
        },
        
        // FIXED: Get session user ID from core
        getSessionUserId() {
            const core = this._getCore();
            if (core && core.getCurrentUserId) {
                return core.getCurrentUserId();
            }
            return null;
        },

        isParentReady() {
            const core = this._getCore();
            if (core && core.getState) {
                const coreState = core.getState();
                return coreState.parentReadyReceived || false;
            }
            return false;
        },
        
        // FIXED: Get lifecycle state from core
        getLifecycleState() {
            const core = this._getCore();
            if (core && core.getState) {
                const coreState = core.getState();
                const state = coreState.state;
                if (state === LIFECYCLE_STATES.ACTIVE) {
                    return LIFECYCLE_STATES.ACTIVE;
                }
                return state || 'UNKNOWN';
            }
            
            // Fallback: check if core is ready directly
            if (this.isCoreReady()) {
                return LIFECYCLE_STATES.ACTIVE;
            }
            
            return 'UNKNOWN';
        },
        
        // FIXED: Check if core has valid session
        hasValidSession() {
            const core = this._getCore();
            
            // Method 1: Use isAuthenticated
            if (core && core.isAuthenticated && core.isAuthenticated()) {
                this._cachedCoreSessionValid = true;
                return true;
            }
            
            // Method 2: Check SessionManager directly
            if (core && core.SessionManager && core.SessionManager.isAuthenticated?.()) {
                this._cachedCoreSessionValid = true;
                return true;
            }
            
            // Method 3: Check getState
            const coreState = core?.getState?.();
            if (coreState && coreState.hasValidSession === true) {
                this._cachedCoreSessionValid = true;
                return true;
            }
            
            // Method 4: Check getCurrentUserId
            const userId = core?.getCurrentUserId?.();
            if (userId && typeof userId === 'number' && userId !== 0) {
                this._cachedCoreSessionValid = true;
                return true;
            }
            
            this._cachedCoreSessionValid = false;
            return false;
        },
        
        canPerformUIAction() {
            const coreState = this._getCore()?.getState?.();
            if (coreState && coreState.state === LIFECYCLE_STATES.ACTIVE) {
                return true;
            }
            const hasSession = this.hasValidSession();
            if (hasSession) {
                return true;
            }
            const state = this.getLifecycleState();
            return state === LIFECYCLE_STATES.ACTIVE && hasSession;
        },
        
        forceEnableUI() {
            console.log('[UIFailsafe] Forcing UI enable');
            if (window.messagesUI && window.messagesUI.UIStateManager) {
                window.messagesUI.UIStateManager.state.sessionValid = true;
                window.messagesUI.UIStateManager.state.lifecycleState = LIFECYCLE_STATES.ACTIVE;
                window.messagesUI.UIStateManager.state.coreSessionValid = true;
                if (window.messagesUI.UIStateManager._updateUIInteractionState) {
                    window.messagesUI.UIStateManager._updateUIInteractionState(true);
                }
                if (window.messagesUI.UIStateManager._updateConnectionUI) {
                    window.messagesUI.UIStateManager._updateConnectionUI(true, 'excellent');
                }
            }
            document.querySelectorAll('button, input, textarea, [disabled]').forEach(el => {
                el.disabled = false;
                el.removeAttribute('disabled');
            });
            
            // Also enable chat panel input specifically
            const messageInput = document.getElementById('messageInput');
            if (messageInput) messageInput.disabled = false;
            const sendButton = document.getElementById('sendButton');
            if (sendButton) sendButton.disabled = false;
        },
        
        isInWaitParent() {
            const state = this.getLifecycleState();
            return state === LIFECYCLE_STATES.WAIT_PARENT;
        },
        
        isInWaitingAuth() {
            const state = this.getLifecycleState();
            return state === LIFECYCLE_STATES.WAITING_AUTH;
        }
    }.init();

    // =============================================
    // UI STATE MANAGER (ENHANCED WITH DETERMINISTIC LIFECYCLE)
    // =============================================
    const UIStateManager = {
        state: {
            sidebarVisible: true,
            contactsVisible: false,
            chatVisible: false,
            threadVisible: false,
            multiSendVisible: false,
            currentTheme: 'light',
            fontSize: 'medium',
            emojiPickerActive: false,
            formattingToolbarActive: false,
            attachmentOptionsActive: false,
            messageActionsVisible: false,
            currentMessageAction: null,
            searchActive: false,
            recordingActive: false,
            typingIndicator: false,
            connectionQuality: 'unknown',
            recoveryMode: false,
            handshakeStatus: 'pending',
            sessionStatus: 'pending',
            sessionValid: false,
            coreSessionValid: false,
            offlineMode: !navigator.onLine,
            syncInProgress: false,
            startupState: 'INIT',
            parentReady: false,
            lifecycleState: 'BOOT'
        },
        
        listeners: new Map(),
        _initialized: false,
        _eventListenersSetup: false,

        init() {
            if (this._initialized) return this;
            
            this._loadSavedState();
            this._setupEventListeners();
            this._startPeriodicSync();
            this._checkParentReady();
            this._checkLifecycleState();
            this._checkSessionValidity();
            this._initialized = true;
            
            UILogger.info('UIStateManager', 'Initialized');
            return this;
        },

        _checkParentReady() {
            if (UIFailsafe.isParentReady()) {
                this.state.parentReady = true;
                this._notifyListeners('parentReady', true);
                this._updateConnectionUI(true, 'excellent');
            }
        },
        
        _checkSessionValidity() {
            const coreValid = UIFailsafe.hasValidSession();
            this.state.coreSessionValid = coreValid;
            
            let isValid = coreValid;
            let userId = null;
            
            const core = getMessagesCore();
            if (core) {
                if (core.isAuthenticated && core.isAuthenticated()) {
                    isValid = true;
                    userId = core.getCurrentUserId?.();
                }
                const coreState = core.getState?.();
                if (coreState && coreState.hasValidSession === true) {
                    isValid = true;
                    if (!userId) userId = coreState.userId;
                }
                if (core.SessionManager && core.SessionManager.isAuthenticated?.()) {
                    isValid = true;
                }
                // Check direct userId
                const directUserId = core.getCurrentUserId?.();
                if (directUserId && typeof directUserId === 'number' && directUserId !== 0) {
                    isValid = true;
                    userId = directUserId;
                }
            }
            
            if (userId && (typeof userId !== 'number' || userId === 0)) {
                isValid = false;
            }
            
            // CRITICAL FIX: If core has valid session, force state to be valid
            if (coreValid && !this.state.sessionValid) {
                console.log('[UIStateManager] Force setting sessionValid true - core has valid session');
                isValid = true;
            }
            
            if (isValid !== this.state.sessionValid) {
                console.log('[UIStateManager] Session validity changed:', { 
                    was: this.state.sessionValid, 
                    now: isValid,
                    coreValid: coreValid,
                    userId: userId
                });
                this.state.sessionValid = isValid;
                this.state.sessionStatus = isValid ? 'authenticated' : 'pending';
                this._notifyListeners('sessionValid', isValid);
                this._notifyListeners('sessionStatus', this.state.sessionStatus);
                
                if (isValid && (this.state.lifecycleState === LIFECYCLE_STATES.WAITING_AUTH || 
                                this.state.lifecycleState === LIFECYCLE_STATES.WAIT_PARENT ||
                                this.state.lifecycleState === 'UNKNOWN')) {
                    this.state.lifecycleState = LIFECYCLE_STATES.ACTIVE;
                    this._notifyListeners('lifecycleState', LIFECYCLE_STATES.ACTIVE);
                    this._updateLifecycleUI(LIFECYCLE_STATES.ACTIVE);
                    this._updateUIInteractionState(true);
                    this._triggerRealDataFetch();
                }
                
                if (isValid && this.state.lifecycleState === LIFECYCLE_STATES.ACTIVE) {
                    this._updateUIInteractionState(true);
                    this._updateConnectionUI(true, 'excellent');
                    this._triggerRealDataFetch();
                }
            }
            
            return isValid;
        },
        
        _forceSyncSessionState() {
            // Force a direct check and sync with core
            const coreHasSession = UIFailsafe.hasValidSession();
            const coreUserId = getMessagesCore()?.getCurrentUserId?.();
            
            if (coreHasSession && coreUserId && typeof coreUserId === 'number' && coreUserId !== 0) {
                if (!this.state.sessionValid || this.state.lifecycleState !== LIFECYCLE_STATES.ACTIVE) {
                    console.log('[UIStateManager] Force syncing session state - core has valid session');
                    this.state.sessionValid = true;
                    this.state.coreSessionValid = true;
                    this.state.lifecycleState = LIFECYCLE_STATES.ACTIVE;
                    this.state.sessionStatus = 'authenticated';
                    this._notifyListeners('sessionValid', true);
                    this._notifyListeners('lifecycleState', LIFECYCLE_STATES.ACTIVE);
                    this._updateLifecycleUI(LIFECYCLE_STATES.ACTIVE);
                    this._updateUIInteractionState(true);
                    this._updateConnectionUI(true, 'excellent');
                    this._triggerRealDataFetch();
                    return true;
                } else if (this.state.sessionValid === false && coreHasSession) {
                    // Fix: if core has session but UI state says false
                    console.log('[UIStateManager] Fixing mismatched session state - core has session but UI says false');
                    this.state.sessionValid = true;
                    this.state.coreSessionValid = true;
                    this.state.lifecycleState = LIFECYCLE_STATES.ACTIVE;
                    this.state.sessionStatus = 'authenticated';
                    this._notifyListeners('sessionValid', true);
                    this._notifyListeners('lifecycleState', LIFECYCLE_STATES.ACTIVE);
                    this._updateLifecycleUI(LIFECYCLE_STATES.ACTIVE);
                    this._updateUIInteractionState(true);
                    this._updateConnectionUI(true, 'excellent');
                    this._triggerRealDataFetch();
                    return true;
                }
            }
            return false;
        },
        
        _checkLifecycleState() {
            const lifecycleState = UIFailsafe.getLifecycleState();
            if (lifecycleState !== this.state.lifecycleState && lifecycleState !== 'UNKNOWN') {
                this.state.lifecycleState = lifecycleState;
                this._notifyListeners('lifecycleState', lifecycleState);
                this._updateLifecycleUI(lifecycleState);
            } else if (lifecycleState === 'UNKNOWN' && this.state.coreSessionValid) {
                // Fix: If core has session but lifecycle is UNKNOWN, set to ACTIVE
                this.state.lifecycleState = LIFECYCLE_STATES.ACTIVE;
                this._notifyListeners('lifecycleState', LIFECYCLE_STATES.ACTIVE);
                this._updateLifecycleUI(LIFECYCLE_STATES.ACTIVE);
            }
        },
        
        _updateLifecycleUI(lifecycleState) {
            const statusEl = UIFailsafe.safeGetElement('handshakeStatus');
            if (!statusEl) return;
            
            UIFailsafe.safeSetStyle(statusEl, 'display', 'flex');
            
            const lifecycleMessages = {
                'BOOT': { text: 'Initializing...', icon: 'fa-cog fa-spin', color: '#ff9800', action: false },
                'INITIALIZING': { text: 'Loading module...', icon: 'fa-cog fa-spin', color: '#ff9800', action: false },
                'READY': { text: 'Ready...', icon: 'fa-circle', color: '#ff9800', action: false },
                'WAIT_PARENT': { text: '', icon: '', color: 'transparent', action: false, hidden: true },
                'WAITING_AUTH': { text: 'Waiting for session...', icon: 'fa-circle', color: '#ff9800', action: false },
                'ACTIVE': { text: 'Connected', icon: 'fa-check-circle', color: '#4caf50', action: true }
            };
            
            const info = lifecycleMessages[lifecycleState] || { text: '', icon: '', color: 'transparent', action: false, hidden: true };
            
            if (lifecycleState === 'WAIT_PARENT') {
                UIFailsafe.safeSetStyle(statusEl, 'display', 'none');
            } else if (lifecycleState === 'WAITING_AUTH') {
                UIFailsafe.safeSetStyle(statusEl, 'display', 'flex');
                UIFailsafe.safeSetHTML(statusEl, `
                    <i class="fas ${info.icon}" style="color: ${info.color};"></i>
                    <span>${info.text}</span>
                `);
            } else {
                UIFailsafe.safeSetStyle(statusEl, 'display', 'flex');
                UIFailsafe.safeSetHTML(statusEl, `
                    <i class="fas ${info.icon}" style="color: ${info.color};"></i>
                    <span>${info.text}</span>
                `);
            }
            
            console.log(`[messagesUI] Lifecycle: ${lifecycleState}`);
            
            const hasSession = UIFailsafe.hasValidSession();
            this._updateUIInteractionState(info.action && hasSession);
            
            if (lifecycleState === 'ACTIVE' && hasSession) {
                this._updateConnectionUI(true, 'excellent');
                this._triggerRealDataFetch();
            } else if (lifecycleState === 'WAIT_PARENT') {
                this._updateConnectionUI(false, 'unknown');
            } else if (lifecycleState === 'WAITING_AUTH') {
                this._updateConnectionUI(false, 'unknown');
                this._showWaitingAuthState();
            } else {
                this._updateConnectionUI(false, 'unknown');
            }
        },
        
        _showWaitingAuthState() {
            const statusEl = UIFailsafe.safeGetElement('sessionStatus');
            if (statusEl) {
                UIFailsafe.safeSetText(statusEl, 'Waiting for authentication...');
                UIFailsafe.safeSetStyle(statusEl, 'display', 'block');
            }
        },
        
        _triggerRealDataFetch() {
            const core = getMessagesCore();
            
            // Check if core is actually ACTIVE before triggering fetch
            const coreState = core?.getState?.();
            const coreIsActive = coreState?.state === 'ACTIVE';
            
            if (!coreIsActive) {
                console.log('[messagesUI] Core not ACTIVE yet, scheduling retry for data fetch');
                // Retry after a short delay
                setTimeout(() => {
                    const coreStateRetry = getMessagesCore()?.getState?.();
                    if (coreStateRetry?.state === 'ACTIVE') {
                        this._triggerRealDataFetch();
                    }
                }, 500);
                return;
            }
            
            if (!UIFailsafe.hasValidSession()) {
                console.log('[messagesUI] No valid session, skipping data fetch');
                return;
            }
            
            if (core && core.fetchConversations) {
                console.log('[messagesUI] Triggering real data fetch from backend');
                core.fetchConversations();
            }
            if (core && core.FriendManager && core.FriendManager.fetchFriends) {
                core.FriendManager.fetchFriends().then(() => {
                    // FIXED: If user has no friends, fall back to fetching all users
                    // so the "Start Chat" contact picker is never empty.
                    const friends = core.getFriends ? core.getFriends() : [];
                    if (!friends || friends.length === 0) {
                        core.FriendManager._fetchAllUsersAsFallback?.();
                    }
                }).catch(() => {
                    core.FriendManager._fetchAllUsersAsFallback?.();
                });
            }
        },
        
        _updateUIInteractionState(isActive) {
            const messageInput = UIFailsafe.safeGetElement('messageInput');
            const sendButton = UIFailsafe.safeGetElement('sendButton');
            const attachBtn = UIFailsafe.safeGetElement('attachBtn');
            const emojiBtn = UIFailsafe.safeGetElement('emojiBtn');
            const formatBtn = UIFailsafe.safeGetElement('formatBtn');
            const voiceCallBtn = UIFailsafe.safeGetElement('voiceCallBtn');
            const videoCallBtn = UIFailsafe.safeGetElement('videoCallBtn');
            const chatOptionsBtn = UIFailsafe.safeGetElement('chatOptionsBtn');
            const multiSendToggle = UIFailsafe.safeGetElement('multiSendToggleBtn');
            const newChatBtn = UIFailsafe.safeGetElement('newChatBtn');
            
            if (!isActive) {
                if (messageInput) UIFailsafe.safeSetProperty(messageInput, 'disabled', true);
                if (sendButton) UIFailsafe.safeSetProperty(sendButton, 'disabled', true);
                if (attachBtn) UIFailsafe.safeSetProperty(attachBtn, 'disabled', true);
                if (emojiBtn) UIFailsafe.safeSetProperty(emojiBtn, 'disabled', true);
                if (formatBtn) UIFailsafe.safeSetProperty(formatBtn, 'disabled', true);
                if (voiceCallBtn) UIFailsafe.safeSetProperty(voiceCallBtn, 'disabled', true);
                if (videoCallBtn) UIFailsafe.safeSetProperty(videoCallBtn, 'disabled', true);
                if (chatOptionsBtn) UIFailsafe.safeSetProperty(chatOptionsBtn, 'disabled', true);
                if (multiSendToggle) UIFailsafe.safeSetProperty(multiSendToggle, 'disabled', true);
                if (newChatBtn) UIFailsafe.safeSetProperty(newChatBtn, 'disabled', true);
                
                if (messageInput) UIFailsafe.safeAddClass(messageInput, 'ui-disabled');
            } else {
                if (messageInput) UIFailsafe.safeSetProperty(messageInput, 'disabled', false);
                if (sendButton) UIFailsafe.safeSetProperty(sendButton, 'disabled', false);
                if (attachBtn) UIFailsafe.safeSetProperty(attachBtn, 'disabled', false);
                if (emojiBtn) UIFailsafe.safeSetProperty(emojiBtn, 'disabled', false);
                if (formatBtn) UIFailsafe.safeSetProperty(formatBtn, 'disabled', false);
                if (voiceCallBtn) UIFailsafe.safeSetProperty(voiceCallBtn, 'disabled', false);
                if (videoCallBtn) UIFailsafe.safeSetProperty(videoCallBtn, 'disabled', false);
                if (chatOptionsBtn) UIFailsafe.safeSetProperty(chatOptionsBtn, 'disabled', false);
                if (multiSendToggle) UIFailsafe.safeSetProperty(multiSendToggle, 'disabled', false);
                if (newChatBtn) UIFailsafe.safeSetProperty(newChatBtn, 'disabled', false);
                
                if (messageInput) UIFailsafe.safeRemoveClass(messageInput, 'ui-disabled');
            }
        },
        
        _showWaitParentState() {
            const waitParentElements = UIFailsafe.safeQuerySelectorAll('.wait-parent-state');
            UIFailsafe.safeForEach(waitParentElements, (el) => {
                if (el && el.remove) {
                    el.remove();
                }
            });
        },

        _loadSavedState() {
            const core = getMessagesCore();
            UIFailsafe.queueAction(() => {
                if (core && core.SafeStorage) {
                    const saved = core.SafeStorage.getJSON('ui_state', {});
                    if (saved.theme) this.state.currentTheme = saved.theme;
                    if (saved.fontSize) this.state.fontSize = saved.fontSize;
                    if (saved.sidebarVisible !== undefined) this.state.sidebarVisible = saved.sidebarVisible;
                }
            });
        },

        _setupEventListeners() {
            if (this._eventListenersSetup) return;
            
            window.addEventListener('messagesLifecycleChange', (e) => {
                UIFailsafe.queueAction(() => {
                    const newState = e.detail.state;
                    this.state.lifecycleState = newState;
                    this._notifyListeners('lifecycleState', newState);
                    this._updateLifecycleUI(newState);
                    
                    if (newState === LIFECYCLE_STATES.ACTIVE) {
                        this.state.parentReady = true;
                        this._notifyListeners('parentReady', true);
                        this._updateConnectionUI(true, 'excellent');
                        this._initializeActiveUI();
                    } else if (newState === LIFECYCLE_STATES.WAIT_PARENT) {
                        this.state.parentReady = false;
                        this._notifyListeners('parentReady', false);
                        this._updateConnectionUI(false, 'unknown');
                    } else if (newState === LIFECYCLE_STATES.WAITING_AUTH) {
                        this.state.parentReady = false;
                        this._notifyListeners('parentReady', false);
                        this._updateConnectionUI(false, 'unknown');
                    }
                });
            });

            window.addEventListener('sessionUpdated', (e) => {
                UIFailsafe.queueAction(() => {
                    if (e.detail.user) {
                        this._updateUserUI(e.detail.user);
                    }
                    
                    let isValid = false;
                    
                    if (e.detail.authenticated === true) {
                        isValid = true;
                    }
                    
                    const userId = e.detail.userId;
                    if (userId && typeof userId === 'number' && userId !== 0) {
                        isValid = true;
                    }
                    
                    if (e.detail.user && e.detail.user.id && typeof e.detail.user.id === 'number' && e.detail.user.id !== 0) {
                        isValid = true;
                    }
                    
                    console.log('[UIStateManager] SessionUpdated event:', { 
                        detail: e.detail,
                        isValid: isValid,
                        userId: e.detail.userId,
                        authenticated: e.detail.authenticated
                    });
                    
                    this.state.sessionValid = isValid;
                    this.state.coreSessionValid = isValid;
                    this.state.sessionStatus = isValid ? 'authenticated' : 'pending';
                    this._notifyListeners('sessionValid', isValid);
                    this._notifyListeners('sessionStatus', this.state.sessionStatus);
                    
                    if (isValid && this.state.lifecycleState !== LIFECYCLE_STATES.ACTIVE) {
                        this.state.lifecycleState = LIFECYCLE_STATES.ACTIVE;
                        this._notifyListeners('lifecycleState', LIFECYCLE_STATES.ACTIVE);
                        this._updateLifecycleUI(LIFECYCLE_STATES.ACTIVE);
                        this._updateUIInteractionState(true);
                        this._updateConnectionUI(true, 'excellent');
                        this._triggerRealDataFetch();
                    } else if (isValid && this.state.lifecycleState === LIFECYCLE_STATES.ACTIVE) {
                        this._updateUIInteractionState(true);
                        this._updateConnectionUI(true, 'excellent');
                        this._triggerRealDataFetch();
                    }
                });
            });

            window.addEventListener('parentStatusChanged', (e) => {
                UIFailsafe.queueAction(() => {
                    this._updateConnectionUI(e.detail.ready, e.detail.connectionQuality);
                    this.state.connectionQuality = e.detail.connectionQuality || 'unknown';
                    this.state.parentReady = e.detail.ready || false;
                    this._notifyListeners('connectionQuality', this.state.connectionQuality);
                    this._notifyListeners('parentReady', this.state.parentReady);
                });
            });

            window.addEventListener('handshakeCompleted', (e) => {
                UIFailsafe.queueAction(() => {
                    this._updateHandshakeStatus(e.detail);
                    this.state.handshakeStatus = e.detail.state?.toLowerCase() || 'completed';
                    this._notifyListeners('handshakeStatus', this.state.handshakeStatus);
                });
            });

            window.addEventListener('networkOffline', () => {
                UIFailsafe.queueAction(() => {
                    this.state.offlineMode = true;
                    this._notifyListeners('offlineMode', true);
                    this._showOfflineUI();
                });
            });

            window.addEventListener('networkRestored', () => {
                UIFailsafe.queueAction(() => {
                    this.state.offlineMode = false;
                    this._notifyListeners('offlineMode', false);
                    this._hideOfflineUI();
                });
            });

            window.addEventListener('online', () => {
                UIFailsafe.queueAction(() => {
                    this.state.offlineMode = false;
                    this._notifyListeners('offlineMode', false);
                    this._hideOfflineUI();
                });
            });

            window.addEventListener('offline', () => {
                UIFailsafe.queueAction(() => {
                    this.state.offlineMode = true;
                    this._notifyListeners('offlineMode', true);
                    this._showOfflineUI();
                });
            });
            
            window.addEventListener('newMessage', (e) => {
                UIFailsafe.queueAction(() => {
                    if (e.detail && e.detail.message) {
                        this._notifyListeners('newMessage', e.detail.message);
                    }
                });
            });
            
            window.addEventListener('conversationsUpdated', (e) => {
                UIFailsafe.queueAction(() => {
                    if (e.detail && e.detail.conversations) {
                        this._notifyListeners('conversationsUpdated', e.detail.conversations);
                    }
                });
            });
            
            this._eventListenersSetup = true;
        },

        _startPeriodicSync() {
            setInterval(() => {
                UIFailsafe.queueAction(() => {
                    // First, force sync session state from core
                    this._forceSyncSessionState();
                    
                    const lifecycleState = UIFailsafe.getLifecycleState();
                    if (lifecycleState !== this.state.lifecycleState && lifecycleState !== 'UNKNOWN') {
                        this.state.lifecycleState = lifecycleState;
                        this._notifyListeners('lifecycleState', lifecycleState);
                        this._updateLifecycleUI(lifecycleState);
                    } else if (lifecycleState === 'UNKNOWN' && this.state.coreSessionValid) {
                        // Fix: If core has session but lifecycle is UNKNOWN, set to ACTIVE
                        this.state.lifecycleState = LIFECYCLE_STATES.ACTIVE;
                        this._notifyListeners('lifecycleState', LIFECYCLE_STATES.ACTIVE);
                        this._updateLifecycleUI(LIFECYCLE_STATES.ACTIVE);
                    }
                    
                    const sessionValid = UIFailsafe.hasValidSession();
                    if (sessionValid !== this.state.sessionValid) {
                        console.log('[UIStateManager] Periodic sync - session valid changed:', { was: this.state.sessionValid, now: sessionValid });
                        this.state.sessionValid = sessionValid;
                        this._notifyListeners('sessionValid', sessionValid);
                        if (sessionValid && this.state.lifecycleState !== LIFECYCLE_STATES.ACTIVE) {
                            this.state.lifecycleState = LIFECYCLE_STATES.ACTIVE;
                            this._notifyListeners('lifecycleState', LIFECYCLE_STATES.ACTIVE);
                            this._updateLifecycleUI(LIFECYCLE_STATES.ACTIVE);
                            this._updateUIInteractionState(true);
                            this._triggerRealDataFetch();
                        }
                    } else if (sessionValid && !this.state.sessionValid) {
                        // Fix: If sessionValid from core is true but UI state says false
                        console.log('[UIStateManager] Periodic sync - fixing mismatched session state');
                        this.state.sessionValid = true;
                        this._notifyListeners('sessionValid', true);
                        if (this.state.lifecycleState !== LIFECYCLE_STATES.ACTIVE) {
                            this.state.lifecycleState = LIFECYCLE_STATES.ACTIVE;
                            this._notifyListeners('lifecycleState', LIFECYCLE_STATES.ACTIVE);
                            this._updateLifecycleUI(LIFECYCLE_STATES.ACTIVE);
                            this._updateUIInteractionState(true);
                            this._triggerRealDataFetch();
                        }
                    }
                    
                    if (UIFailsafe.isParentReady() && !this.state.parentReady) {
                        this.state.parentReady = true;
                        this._notifyListeners('parentReady', true);
                    }
                });
            }, 2000); // Check every 2 seconds
        },
        
        _initializeActiveUI() {
            const core = getMessagesCore();
            if (!UIFailsafe.hasValidSession()) {
                console.log('[messagesUI] No valid session, waiting for authentication');
                return;
            }
            
            if (core && core.fetchConversations) {
                core.fetchConversations();
            }
            
            if (core && core.getCurrentUser) {
                const user = core.getCurrentUser();
                if (user) {
                    this._updateUserUI(user);
                }
            }
            
            const waitParentState = UIFailsafe.safeQuerySelector('.wait-parent-state');
            if (waitParentState) {
                waitParentState.remove();
            }
            
            const waitingAuthState = UIFailsafe.safeQuerySelector('.waiting-auth-state');
            if (waitingAuthState) {
                waitingAuthState.remove();
            }
        },

        setState(key, value) {
            if (this.state[key] !== undefined) {
                const oldValue = this.state[key];
                this.state[key] = value;
                this._notifyListeners(key, value, oldValue);
                this._saveState();
            }
        },

        getState(key) {
            return this.state[key];
        },

        toggleState(key) {
            if (this.state[key] !== undefined) {
                this.state[key] = !this.state[key];
                this._notifyListeners(key, this.state[key]);
                this._saveState();
                return this.state[key];
            }
            return false;
        },

        subscribe(key, callback) {
            if (!this.listeners.has(key)) {
                this.listeners.set(key, new Set());
            }
            this.listeners.get(key).add(callback);
            
            try {
                callback(this.state[key], key);
            } catch (e) {}
            
            return () => this.listeners.get(key).delete(callback);
        },

        _notifyListeners(key, value, oldValue) {
            if (this.listeners.has(key)) {
                this.listeners.get(key).forEach(cb => {
                    try {
                        cb(value, oldValue, key);
                    } catch (e) {}
                });
            }
        },

        _saveState() {
            const core = getMessagesCore();
            UIFailsafe.queueAction(() => {
                if (core && core.SafeStorage) {
                    core.SafeStorage.setJSON('ui_state', {
                        theme: this.state.currentTheme,
                        fontSize: this.state.fontSize,
                        sidebarVisible: this.state.sidebarVisible,
                        timestamp: Date.now()
                    });
                }
            });
        },

        _applyTheme() {
            const theme = this.state.currentTheme;
            UIFailsafe.safeSetAttribute(document.documentElement, 'data-theme', theme);
            
            let metaTheme = UIFailsafe.safeQuerySelector('meta[name="theme-color"]');
            if (!metaTheme) {
                metaTheme = document.createElement('meta');
                metaTheme.name = 'theme-color';
                document.head.appendChild(metaTheme);
            }
            UIFailsafe.safeSetProperty(metaTheme, 'content', theme === 'dark' ? '#1a1a1a' : '#0084ff');
        },

        _applyFontSize() {
            const size = this.state.fontSize === 'small' ? '14px' :
                        this.state.fontSize === 'large' ? '18px' : '16px';
            UIFailsafe.safeSetStyle(document.documentElement, 'fontSize', size);
        },

        _updateUserUI(user) {
            const indicator = UIFailsafe.safeGetElement('authStatusIndicator');
            const text = UIFailsafe.safeGetElement('authStatusText');
            
            if (indicator && text) {
                UIFailsafe.safeRemoveClass(indicator, 'authenticating');
                UIFailsafe.safeRemoveClass(indicator, 'authenticated');
                UIFailsafe.safeRemoveClass(indicator, 'error');
                
                if (user && user.id && typeof user.id === 'number') {
                    UIFailsafe.safeAddClass(indicator, 'authenticated');
                    UIFailsafe.safeSetText(text, `Logged in as ${user.displayName || user.username || 'User'}`);
                    UIFailsafe.safeSetStyle(indicator, 'display', 'flex');
                } else {
                    UIFailsafe.safeAddClass(indicator, 'authenticating');
                    UIFailsafe.safeSetText(text, 'Connecting...');
                    UIFailsafe.safeSetStyle(indicator, 'display', 'flex');
                }
            }
        },

        _updateConnectionUI(ready, quality) {
            const tokenStatus = UIFailsafe.safeGetElement('tokenStatus');
            if (tokenStatus) {
                UIFailsafe.safeRemoveClass(tokenStatus, 'ready');
                UIFailsafe.safeRemoveClass(tokenStatus, 'pending');
                UIFailsafe.safeRemoveClass(tokenStatus, 'error');
                UIFailsafe.safeRemoveClass(tokenStatus, 'poor');
                UIFailsafe.safeRemoveClass(tokenStatus, 'dead');
                
                if (!ready) {
                    UIFailsafe.safeAddClass(tokenStatus, 'pending');
                    const lifecycleState = this.state.lifecycleState;
                    let message = 'Connecting...';
                    if (lifecycleState === 'READY') {
                        message = 'Ready...';
                    } else if (lifecycleState === 'WAIT_PARENT') {
                        UIFailsafe.safeSetStyle(tokenStatus, 'display', 'none');
                        return;
                    } else if (lifecycleState === 'WAITING_AUTH') {
                        message = 'Waiting for authentication...';
                    }
                    UIFailsafe.safeSetText(tokenStatus, message);
                    UIFailsafe.safeSetStyle(tokenStatus, 'display', 'block');
                } else if (quality === 'excellent') {
                    UIFailsafe.safeAddClass(tokenStatus, 'ready');
                    UIFailsafe.safeSetText(tokenStatus, '🟢 Connected');
                    UIFailsafe.safeSetStyle(tokenStatus, 'display', 'block');
                } else if (quality === 'fair' || quality === 'good') {
                    UIFailsafe.safeAddClass(tokenStatus, 'ready');
                    UIFailsafe.safeSetText(tokenStatus, '🟡 Connected (slow)');
                    UIFailsafe.safeSetStyle(tokenStatus, 'display', 'block');
                } else if (quality === 'poor') {
                    UIFailsafe.safeAddClass(tokenStatus, 'poor');
                    UIFailsafe.safeSetText(tokenStatus, '🟠 Weak connection');
                    UIFailsafe.safeSetStyle(tokenStatus, 'display', 'block');
                } else if (quality === 'dead') {
                    UIFailsafe.safeAddClass(tokenStatus, 'dead');
                    UIFailsafe.safeSetText(tokenStatus, '🔴 Disconnected');
                    UIFailsafe.safeSetStyle(tokenStatus, 'display', 'block');
                } else {
                    UIFailsafe.safeSetStyle(tokenStatus, 'display', 'none');
                }
            }
            
            const bgIndicator = UIFailsafe.safeGetElement('backgroundFetchIndicator');
            if (bgIndicator) {
                if (quality === 'poor') {
                    UIFailsafe.safeAddClass(bgIndicator, 'active');
                    const span = bgIndicator.querySelector('span');
                    if (span) UIFailsafe.safeSetText(span, 'Slow connection...');
                } else if (quality === 'dead') {
                    UIFailsafe.safeAddClass(bgIndicator, 'active');
                    const span = bgIndicator.querySelector('span');
                    if (span) UIFailsafe.safeSetText(span, 'Reconnecting...');
                } else {
                    UIFailsafe.safeRemoveClass(bgIndicator, 'active');
                }
            }
            
            const syncIndicator = UIFailsafe.safeGetElement('syncingIndicator');
            if (syncIndicator) {
                UIFailsafe.safeSetStyle(syncIndicator, 'display', quality === 'poor' ? 'flex' : 'none');
            }
        },

        _updateHandshakeStatus(handshakeInfo) {
            const statusEl = UIFailsafe.safeGetElement('handshakeStatus');
            if (!statusEl) return;
            
            if (!handshakeInfo) {
                this._updateLifecycleUI(this.state.lifecycleState);
                return;
            }
            
            UIFailsafe.safeSetStyle(statusEl, 'display', 'flex');
            
            if (handshakeInfo.state === 'COMPLETED') {
                UIFailsafe.safeSetHTML(statusEl, `
                    <i class="fas fa-handshake" style="color: #4caf50;"></i>
                    <span>Handshake: ${handshakeInfo.version || 'legacy'} (${Math.round(handshakeInfo.duration)}ms)</span>
                `);
            } else if (handshakeInfo.state === 'IN_PROGRESS') {
                if (this.state.lifecycleState === 'WAIT_PARENT') {
                    UIFailsafe.safeSetStyle(statusEl, 'display', 'none');
                } else {
                    UIFailsafe.safeSetHTML(statusEl, `
                        <div class="background-fetch-spinner"></div>
                        <span>Handshake in progress...</span>
                    `);
                }
            } else {
                UIFailsafe.safeSetHTML(statusEl, `
                    <i class="fas fa-handshake" style="color: #ff9800;"></i>
                    <span>Handshake pending</span>
                `);
            }
        },

        _showOfflineUI() {
            const offlineOverlay = UIFailsafe.safeGetElement('offlineOverlay');
            if (offlineOverlay) UIFailsafe.safeAddClass(offlineOverlay, 'active');
            
            const offlineIndicator = UIFailsafe.safeGetElement('offlineIndicator');
            if (offlineIndicator) UIFailsafe.safeSetStyle(offlineIndicator, 'display', 'flex');
        },

        _hideOfflineUI() {
            const offlineOverlay = UIFailsafe.safeGetElement('offlineOverlay');
            if (offlineOverlay) UIFailsafe.safeRemoveClass(offlineOverlay, 'active');
            
            const offlineIndicator = UIFailsafe.safeGetElement('offlineIndicator');
            if (offlineIndicator) UIFailsafe.safeSetStyle(offlineIndicator, 'display', 'none');
        },

        getFullState() {
            return { ...this.state };
        }
    }.init();

    // =============================================
    // UI RENDERER (ENHANCED WITH DETERMINISTIC LIFECYCLE & REAL DATA)
    // =============================================
    const UIRenderer = {
        messageTemplates: new Map(),
        chatTemplates: new Map(),
        contactTemplates: new Map(),
        renderQueue: [],
        renderTimer: null,
        renderBatchSize: 50,
        renderBatchDelay: 16,
        notificationTimeout: null,

        init() {
            this._loadTemplates();
            this._setupEventListeners();
            return this;
        },

        _loadTemplates() {
            this.messageTemplates.set('text', this._createTextMessageTemplate);
            this.messageTemplates.set('image', this._createImageMessageTemplate);
            this.messageTemplates.set('video', this._createVideoMessageTemplate);
            this.messageTemplates.set('audio', this._createAudioMessageTemplate);
            this.messageTemplates.set('file', this._createFileMessageTemplate);
            this.messageTemplates.set('location', this._createLocationMessageTemplate);
            this.messageTemplates.set('poll', this._createPollMessageTemplate);
            this.messageTemplates.set('note', this._createNoteMessageTemplate);
        },

        _setupEventListeners() {
            window.addEventListener('renderMessages', (e) => {
                UIFailsafe.queueAction(() => {
                    this.renderMessages(e.detail.messages, e.detail.currentChat, e.detail.currentUser);
                });
            });

            window.addEventListener('renderChatsList', (e) => {
                UIFailsafe.queueAction(() => {
                    this.renderChatsList(e.detail.chats, e.detail.currentChat, e.detail.currentCategory, e.detail.messageDrafts);
                });
            });

            window.addEventListener('renderContactsList', (e) => {
                UIFailsafe.queueAction(() => {
                    this.renderContactsList(e.detail.contacts);
                });
            });

            window.addEventListener('chatOpened', (e) => {
                UIFailsafe.queueAction(() => {
                    this._updateChatHeader(e.detail.chat);
                });
            });

            window.addEventListener('showMessageActions', (e) => {
                UIFailsafe.queueAction(() => {
                    this.showMessageActions(e.detail.message, e.detail.x, e.detail.y);
                });
            });

            window.addEventListener('closeMessageActions', () => {
                UIFailsafe.queueAction(() => {
                    this.hideMessageActions();
                });
            });

            window.addEventListener('handleMessageAction', (e) => {
                UIFailsafe.queueAction(() => {
                    this.handleMessageAction(e.detail.action, e.detail.message);
                });
            });

            window.addEventListener('openThread', (e) => {
                UIFailsafe.queueAction(() => {
                    this.openThread(e.detail.messageId);
                });
            });

            window.addEventListener('handleAttachment', (e) => {
                UIFailsafe.queueAction(() => {
                    this.handleAttachment(e.detail.type);
                });
            });

            window.addEventListener('sessionUpdated', (e) => {
                UIFailsafe.queueAction(() => {
                    if (e.detail.user) {
                        this._updateUserAvatar(e.detail.user);
                    }
                });
            });
            
            window.addEventListener('conversationsUpdated', (e) => {
                UIFailsafe.queueAction(() => {
                    if (e.detail && e.detail.conversations) {
                        const core = getMessagesCore();
                        const currentChat = core?.getCurrentConversation?.();
                        const currentCategory = core?.getCurrentCategory?.() || 'all';
                        const drafts = core?.UI?.getDrafts?.() || {};
                        this.renderChatsList(e.detail.conversations, currentChat, currentCategory, drafts);
                    }
                });
            });
            
            window.addEventListener('newMessage', (e) => {
                UIFailsafe.queueAction(() => {
                    if (e.detail && e.detail.message) {
                        const core = getMessagesCore();
                        const currentChat = core?.getCurrentConversation?.();
                        const currentUser = core?.getCurrentUser?.();
                        const messages = core?.getMessages?.() || [];
                        this.renderMessages(messages, currentChat, currentUser);
                    }
                });
            });
            
            window.addEventListener('messageStatusUpdated', (e) => {
                UIFailsafe.queueAction(() => {
                    const messageEl = UIFailsafe.safeQuerySelector(`[data-message-id="${e.detail.messageId}"]`);
                    if (messageEl) {
                        const statusIcon = messageEl.querySelector('.message-status i');
                        if (statusIcon) {
                            const status = e.detail.status;
                            const iconClass = status === 'sending' ? 'fa-clock' :
                                            status === 'failed' ? 'fa-exclamation-circle' :
                                            status === 'read' ? 'fa-check-double' : 'fa-check';
                            statusIcon.className = `fas ${iconClass}`;
                        }
                        if (e.detail.status === 'failed') {
                            UIFailsafe.safeAddClass(messageEl, 'message-failed');
                        }
                    }
                });
            });
        },

        _canRender() {
            const lifecycleState = UIStateManager.getState('lifecycleState');
            const sessionValid = UIStateManager.getState('sessionValid');
            // If core has valid session but UI state is not yet updated, still allow render
            const coreHasSession = UIFailsafe.hasValidSession();
            // Also allow render if core itself reports ACTIVE state
            const core = typeof getMessagesCore === 'function' ? getMessagesCore() : null;
            const coreIsActive = core?.getState?.()?.state === 'ACTIVE';
            return (lifecycleState === LIFECYCLE_STATES.ACTIVE && sessionValid) || coreHasSession || coreIsActive;
        },

        _getPassiveLoadingState() {
            const lifecycleState = UIStateManager.getState('lifecycleState');
            let message = 'Loading...';
            
            if (lifecycleState === 'BOOT' || lifecycleState === 'INITIALIZING') {
                message = 'Initializing module...';
            } else if (lifecycleState === 'READY') {
                message = 'Ready...';
            } else if (lifecycleState === 'WAIT_PARENT') {
                return `<div class="passive-loading-state" data-lifecycle="${lifecycleState}" style="opacity:0; height:0; overflow:hidden;"></div>`;
            } else if (lifecycleState === 'WAITING_AUTH') {
                message = 'Waiting for authentication...';
            } else if (lifecycleState === 'ACTIVE') {
                message = 'Ready';
            }
            
            return `
                <div class="passive-loading-state" data-lifecycle="${lifecycleState}">
                    <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: var(--primary-color); margin-bottom: 10px;"></i>
                    <p>${message}</p>
                    <p class="subtext" style="font-size: 10px; margin-top: 5px;">${lifecycleState}</p>
                </div>
            `;
        },

        renderMessages(messages, currentChat, currentUser) {
            const container = UIFailsafe.safeGetElement('messagesContainer');
            if (!container) return;

            // FIXED: Always clear first to prevent duplicate message accumulation.
            // Previously _renderMessageBatches used innerHTML += in a loop without
            // clearing, so every re-render appended a full duplicate copy.
            container.innerHTML = '';

            if (!this._canRender()) {
                UIFailsafe.safeSetHTML(container, this._getPassiveLoadingState());
                return;
            }

            if (!currentChat) {
                UIFailsafe.safeSetHTML(container, this._getEmptyChatHTML());
                return;
            }

            if (!messages || messages.length === 0) {
                UIFailsafe.safeSetHTML(container, this._getEmptyMessagesHTML(currentChat));
                return;
            }

            const groupedMessages = this._groupMessagesByDate(messages);
            this._renderMessageBatches(container, groupedMessages, currentUser);
            this.scrollToBottom(container);
        },

        _renderMessageBatches(container, groupedMessages, currentUser) {
            let html = '';
            let batchCount = 0;
            
            for (const [date, dateMessages] of Object.entries(groupedMessages)) {
                html += `<div class="message-date-separator"><span>${date}</span></div>`;
                
                for (const message of dateMessages) {
                    const template = this.messageTemplates.get(message.type || 'text');
                    if (template) {
                        html += template.call(this, message, currentUser);
                    } else {
                        html += this.messageTemplates.get('text').call(this, message, currentUser);
                    }
                    
                    batchCount++;
                    
                    if (batchCount >= this.renderBatchSize) {
                        container.innerHTML += html;
                        html = '';
                        batchCount = 0;
                    }
                }
            }
            
            if (html) {
                container.innerHTML += html;
            }
        },

        _groupMessagesByDate(messages) {
            const groups = {};
            const core = getMessagesCore();
            
            messages.forEach(message => {
                const date = core?.formatDate ? 
                    core.formatDate(message.timestamp) : 
                    new Date(message.timestamp).toLocaleDateString();
                if (!groups[date]) {
                    groups[date] = [];
                }
                groups[date].push(message);
            });
            
            return groups;
        },

        _createTextMessageTemplate(message, currentUser) {
            const core = getMessagesCore();
            const currentUserId = core?.getCurrentUserId?.();
            const isSent = String(message.senderId) === String(currentUserId);
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const replyIndicator = message.replyTo ? '<div class="reply-indicator"><i class="fas fa-reply"></i> Reply</div>' : '';
            const editedIndicator = message.edited ? '<span class="edited-indicator">(edited)</span>' : '';
            const deletedClass = message.deleted ? 'deleted-message' : '';
            const failedClass = status === 'failed' ? 'message-failed' : '';
            const sendingClass = status === 'sending' ? 'message-sending' : '';
            const content = core?.formatMessageText ? 
                core.formatMessageText(message.content) : 
                message.content;
            const time = core?.formatTime ? 
                core.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'} ${deletedClass} ${failedClass} ${sendingClass}" data-message-id="${message.id}" data-message-type="text" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        ${replyIndicator}
                        <div class="message-content">${content}</div>
                        <div class="message-meta">
                            <span class="message-time">${time}</span>
                            ${editedIndicator}
                            ${isSent ? `<span class="message-status"><i class="fas ${statusIcon}"></i></span>` : ''}
                        </div>
                        ${reactions}
                    </div>
                </div>
            `;
        },

        _createImageMessageTemplate(message, currentUser) {
            const core = getMessagesCore();
            const currentUserId = core?.getCurrentUserId?.();
            const isSent = String(message.senderId) === String(currentUserId);
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const time = core?.formatTime ? 
                core.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="image" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div class="message-image" onclick="window.messagesUI?.viewMedia('${message.content}', '${message.fileName || 'image'}')">
                            <img src="${message.content}" alt="${message.fileName || 'Image'}" loading="lazy">
                        </div>
                        ${message.caption ? `<div class="message-caption">${core?.escapeHtml ? core.escapeHtml(message.caption) : message.caption}</div>` : ''}
                        <div class="message-meta">
                            <span class="message-time">${time}</span>
                            ${isSent ? `<span class="message-status"><i class="fas ${statusIcon}"></i></span>` : ''}
                        </div>
                        ${reactions}
                    </div>
                </div>
            `;
        },

        _createVideoMessageTemplate(message, currentUser) {
            const core = getMessagesCore();
            const currentUserId = core?.getCurrentUserId?.();
            const isSent = String(message.senderId) === String(currentUserId);
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const time = core?.formatTime ? 
                core.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="video" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div class="message-video" onclick="window.messagesUI?.playVideo('${message.content}')">
                            <video src="${message.content}" poster="${message.thumbnail || ''}" controls></video>
                        </div>
                        ${message.caption ? `<div class="message-caption">${core?.escapeHtml ? core.escapeHtml(message.caption) : message.caption}</div>` : ''}
                        <div class="message-meta">
                            <span class="message-time">${time}</span>
                            ${isSent ? `<span class="message-status"><i class="fas ${statusIcon}"></i></span>` : ''}
                        </div>
                        ${reactions}
                    </div>
                </div>
            `;
        },

        _createAudioMessageTemplate(message, currentUser) {
            const core = getMessagesCore();
            const currentUserId = core?.getCurrentUserId?.();
            const isSent = String(message.senderId) === String(currentUserId);
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const duration = message.duration ? this._formatDuration(message.duration) : '';
            const time = core?.formatTime ? 
                core.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="audio" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div class="message-audio">
                            <button class="audio-play-btn" onclick="this.classList.toggle('playing'); window.messagesUI?.playAudio('${message.id}', '${message.content}', ${message.duration || 0})">
                                <i class="fas fa-play"></i>
                            </button>
                            <div class="audio-waveform" id="waveform-${message.id}"></div>
                            <span class="audio-duration">${duration}</span>
                        </div>
                        <div class="message-meta">
                            <span class="message-time">${time}</span>
                            ${isSent ? `<span class="message-status"><i class="fas ${statusIcon}"></i></span>` : ''}
                        </div>
                        ${reactions}
                    </div>
                </div>
            `;
        },

        _createFileMessageTemplate(message, currentUser) {
            const core = getMessagesCore();
            const currentUserId = core?.getCurrentUserId?.();
            const isSent = String(message.senderId) === String(currentUserId);
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const fileSize = message.fileSize && core?.formatFileSize ? 
                core.formatFileSize(message.fileSize) : '';
            const fileIcon = this._getFileIcon(message.fileName || '');
            const time = core?.formatTime ? 
                core.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="file" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div class="message-file" onclick="window.messagesUI?.downloadFile('${message.content}', '${message.fileName || 'file'}')">
                            <i class="fas ${fileIcon} file-icon"></i>
                            <div class="file-info">
                                <div class="file-name">${message.fileName || 'File'}</div>
                                <div class="file-size">${fileSize}</div>
                            </div>
                            <i class="fas fa-download download-icon"></i>
                        </div>
                        <div class="message-meta">
                            <span class="message-time">${time}</span>
                            ${isSent ? `<span class="message-status"><i class="fas ${statusIcon}"></i></span>` : ''}
                        </div>
                        ${reactions}
                    </div>
                </div>
            `;
        },

        _createLocationMessageTemplate(message, currentUser) {
            const core = getMessagesCore();
            const currentUserId = core?.getCurrentUserId?.();
            const isSent = String(message.senderId) === String(currentUserId);
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const time = core?.formatTime ? 
                core.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="location" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div class="message-location" onclick="window.messagesUI?.openLocation(${message.latitude || 0}, ${message.longitude || 0})">
                            <iframe src="${message.content}" frameborder="0" style="width:100%; height:200px;" allowfullscreen loading="lazy"></iframe>
                            <div class="location-name">${message.name || 'Location'}</div>
                        </div>
                        <div class="message-meta">
                            <span class="message-time">${time}</span>
                            ${isSent ? `<span class="message-status"><i class="fas ${statusIcon}"></i></span>` : ''}
                        </div>
                        ${reactions}
                    </div>
                </div>
            `;
        },

        _createPollMessageTemplate(message, currentUser) {
            const core = getMessagesCore();
            const currentUserId = core?.getCurrentUserId?.();
            const isSent = String(message.senderId) === String(currentUserId);
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const totalVotes = message.options?.reduce((sum, opt) => sum + (opt.votes || 0), 0) || 0;
            const time = core?.formatTime ? 
                core.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            let optionsHTML = '';
            if (message.options) {
                message.options.forEach((option, index) => {
                    const percentage = totalVotes > 0 ? Math.round((option.votes || 0) / totalVotes * 100) : 0;
                    optionsHTML += `
                        <div class="poll-option" onclick="window.messagesUI?.voteInPoll('${message.id}', ${index})">
                            <div class="poll-option-text">${option.text}</div>
                            <div class="poll-option-bar" style="width: ${percentage}%"></div>
                            <div class="poll-option-stats">${option.votes || 0} (${percentage}%)</div>
                        </div>
                    `;
                });
            }
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="poll" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div class="poll-question">${message.question || 'Poll'}</div>
                        <div class="poll-options">
                            ${optionsHTML}
                        </div>
                        <div class="poll-total">${totalVotes} votes</div>
                        <div class="message-meta">
                            <span class="message-time">${time}</span>
                            ${isSent ? `<span class="message-status"><i class="fas ${statusIcon}"></i></span>` : ''}
                        </div>
                        ${reactions}
                    </div>
                </div>
            `;
        },

        _createNoteMessageTemplate(message, currentUser) {
            const core = getMessagesCore();
            const currentUserId = core?.getCurrentUserId?.();
            const isSent = String(message.senderId) === String(currentUserId);
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const content = core?.formatMessageText ? 
                core.formatMessageText(message.content) : 
                message.content;
            const time = core?.formatTime ? 
                core.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message note-message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="note" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div class="note-icon"><i class="fas fa-sticky-note"></i></div>
                        <div class="message-content">${content}</div>
                        <div class="message-meta">
                            <span class="message-time">${time}</span>
                            ${isSent ? `<span class="message-status"><i class="fas ${statusIcon}"></i></span>` : ''}
                        </div>
                        ${reactions}
                    </div>
                </div>
            `;
        },

        _formatDuration(seconds) {
            if (!seconds) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        },

        _renderReactions(reactions) {
            if (!reactions || Object.keys(reactions).length === 0) return '';
            
            let html = '<div class="message-reactions">';
            for (const [emoji, users] of Object.entries(reactions)) {
                if (users && users.length > 0) {
                    html += `<span class="reaction" title="${users.length} ${users.length === 1 ? 'person' : 'people'}">${emoji} ${users.length}</span>`;
                }
            }
            html += '</div>';
            return html;
        },

        _getFileIcon(fileName) {
            const ext = fileName.split('.').pop()?.toLowerCase();
            const icons = {
                pdf: 'fa-file-pdf',
                doc: 'fa-file-word',
                docx: 'fa-file-word',
                xls: 'fa-file-excel',
                xlsx: 'fa-file-excel',
                zip: 'fa-file-archive',
                rar: 'fa-file-archive',
                '7z': 'fa-file-archive',
                mp3: 'fa-file-audio',
                wav: 'fa-file-audio',
                mp4: 'fa-file-video',
                avi: 'fa-file-video',
                jpg: 'fa-file-image',
                jpeg: 'fa-file-image',
                png: 'fa-file-image',
                gif: 'fa-file-image'
            };
            return icons[ext] || 'fa-file';
        },

        _getEmptyChatHTML() {
            return `
                <div class="empty-chat">
                    <i class="fas fa-comments empty-chat-icon"></i>
                    <div class="empty-chat-title">No chat selected</div>
                    <div class="empty-chat-message">Select a chat from the sidebar to start messaging</div>
                </div>
            `;
        },

        _getEmptyMessagesHTML(chat) {
            return `
                <div class="empty-chat">
                    <i class="fas fa-comment-dots empty-chat-icon"></i>
                    <div class="empty-chat-title">No messages yet</div>
                    <div class="empty-chat-message">Start a conversation with ${chat.friendName || 'this user'}</div>
                </div>
            `;
        },

        renderChatsList(chats, currentChat, category, messageDrafts) {
            const container = UIFailsafe.safeGetElement('chatsList');
            if (!container) return;

            if (!this._canRender()) {
                UIFailsafe.safeSetHTML(container, this._getPassiveLoadingState());
                return;
            }

            if (!chats || chats.length === 0) {
                UIFailsafe.safeSetHTML(container, `
                    <div class="empty-state">
                        <i class="fas fa-comments empty-icon"></i>
                        <div class="empty-title">No chats yet</div>
                        <div class="empty-message">Start a new conversation by clicking the + button</div>
                    </div>
                `);
                return;
            }

            let filteredChats = chats;
            if (category === 'unread') {
                filteredChats = chats.filter(c => c.unreadCount > 0);
            } else if (category === 'archived') {
                filteredChats = chats.filter(c => c.archived);
            } else if (category === 'blocked') {
                filteredChats = chats.filter(c => c.blocked);
            } else if (category === 'notes') {
                filteredChats = chats.filter(c => c.type === 'note');
            } else {
                filteredChats = chats.filter(c => !c.archived && !c.blocked);
            }

            filteredChats.sort((a, b) => {
                return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
            });

            let html = '';
            filteredChats.forEach(chat => {
                const hasDraft = messageDrafts && messageDrafts[chat.id];
                const isSelected = currentChat?.id === chat.id;
                const unreadBadge = chat.unreadCount > 0 ? `<span class="unread-badge">${chat.unreadCount}</span>` : '';
                const draftBadge = hasDraft ? '<span class="draft-badge">Draft</span>' : '';
                const status = chat.online ? 'online' : 'offline';
                const core = getMessagesCore();
                const time = core?.formatTime ? 
                    core.formatTime(chat.lastMessageAt) : 
                    chat.lastMessageAt ? new Date(chat.lastMessageAt).toLocaleTimeString() : '';
                
                const safeChat = JSON.stringify(chat).replace(/"/g, '&quot;');
                
                html += `
                    <div class="chat-item ${isSelected ? 'selected' : ''}" data-chat-id="${chat.id}" onclick="window.messagesUI?.openChat(${safeChat})">
                        <div class="chat-avatar">
                            ${chat.friendAvatar ? `<img src="${chat.friendAvatar}" alt="${chat.friendName}" loading="lazy">` : `<i class="fas fa-user"></i>`}
                            <div class="chat-status ${status}"></div>
                        </div>
                        <div class="chat-info">
                            <div class="chat-name-row">
                                <span class="chat-name">${chat.friendName || 'User'}</span>
                                <span class="chat-time">${time}</span>
                            </div>
                            <div class="chat-last-message">
                                <span class="last-message-text">${chat.lastMessage || 'No messages yet'}</span>
                                ${draftBadge}
                                ${unreadBadge}
                            </div>
                            ${chat.typing ? '<div class="chat-typing">typing...</div>' : ''}
                        </div>
                    </div>
                `;
            });

            UIFailsafe.safeSetHTML(container, html);
            this._updateCategoryBadges(chats);
        },

        _updateCategoryBadges(chats) {
            const allBadge = UIFailsafe.safeGetElement('allBadge');
            const unreadBadge = UIFailsafe.safeGetElement('unreadBadge');
            const archivedBadge = UIFailsafe.safeGetElement('archivedBadge');
            const blockedBadge = UIFailsafe.safeGetElement('blockedBadge');
            const notesBadge = UIFailsafe.safeGetElement('notesBadge');

            if (allBadge) UIFailsafe.safeSetText(allBadge, chats.filter(c => !c.archived && !c.blocked).length);
            if (unreadBadge) UIFailsafe.safeSetText(unreadBadge, chats.filter(c => c.unreadCount > 0).length);
            if (archivedBadge) UIFailsafe.safeSetText(archivedBadge, chats.filter(c => c.archived).length);
            if (blockedBadge) UIFailsafe.safeSetText(blockedBadge, chats.filter(c => c.blocked).length);
            if (notesBadge) UIFailsafe.safeSetText(notesBadge, chats.filter(c => c.type === 'note').length);
        },

        renderContactsList(contacts) {
            const container = UIFailsafe.safeGetElement('contactsList');
            if (!container) return;

            if (!this._canRender()) {
                UIFailsafe.safeSetHTML(container, this._getPassiveLoadingState());
                return;
            }

            if (!contacts || contacts.length === 0) {
                UIFailsafe.safeSetHTML(container, `
                    <div class="empty-state">
                        <i class="fas fa-address-book empty-icon"></i>
                        <div class="empty-title">No contacts yet</div>
                        <div class="empty-message">Add friends to start chatting</div>
                    </div>
                `);
                return;
            }

            const onlineContacts = contacts.filter(c => c.online);
            const offlineContacts = contacts.filter(c => !c.online);

            let html = '';
            
            if (onlineContacts.length > 0) {
                html += '<div class="contact-group"><div class="contact-group-title">Online</div>';
                onlineContacts.forEach(contact => {
                    html += this._renderContactItem(contact);
                });
                html += '</div>';
            }
            
            if (offlineContacts.length > 0) {
                html += '<div class="contact-group"><div class="contact-group-title">Offline</div>';
                offlineContacts.forEach(contact => {
                    html += this._renderContactItem(contact);
                });
                html += '</div>';
            }

            UIFailsafe.safeSetHTML(container, html);
        },

        _renderContactItem(contact) {
            const status = contact.online ? 'online' : 'offline';
            const statusText = contact.status || (contact.online ? 'Online' : 'Offline');
            
            return `
                <div class="contact-item" data-contact-id="${contact.id}" onclick="window.messagesUI?.loadChatByFriendId('${contact.id}')">
                    <div class="contact-avatar">
                        ${contact.photoURL ? `<img src="${contact.photoURL}" alt="${contact.displayName}" loading="lazy">` : `<i class="fas fa-user"></i>`}
                        <div class="contact-status ${status}"></div>
                    </div>
                    <div class="contact-info">
                        <div class="contact-name">${contact.displayName || 'User'}</div>
                        <div class="contact-status-text">${statusText}</div>
                    </div>
                </div>
            `;
        },

        _updateChatHeader(chat) {
            const nameEl = UIFailsafe.safeGetElement('chatFriendName');
            const avatarEl = UIFailsafe.safeGetElement('chatFriendAvatar');
            const statusEl = UIFailsafe.safeGetElement('chatStatusText');
            const indicatorEl = UIFailsafe.safeGetElement('chatStatusIndicator');

            if (nameEl) UIFailsafe.safeSetText(nameEl, chat.friendName || 'User');
            if (statusEl) UIFailsafe.safeSetText(statusEl, chat.online ? 'Online' : 'Offline');
            if (indicatorEl) UIFailsafe.safeSetAttribute(indicatorEl, 'class', `chat-status ${chat.online ? 'online' : 'offline'}`);
            
            if (avatarEl) {
                if (chat.friendAvatar) {
                    UIFailsafe.safeSetHTML(avatarEl, `<img src="${chat.friendAvatar}" alt="${chat.friendName}" loading="lazy">`);
                } else {
                    UIFailsafe.safeSetHTML(avatarEl, '<i class="fas fa-user"></i>');
                }
                if (indicatorEl) avatarEl.appendChild(indicatorEl);
            }
        },

        _updateUserAvatar(user) {
            const avatarEl = UIFailsafe.safeGetElement('chatFriendAvatar');
            if (avatarEl && user?.photoURL) {
                const img = avatarEl.querySelector('img');
                if (img) {
                    UIFailsafe.safeSetProperty(img, 'src', user.photoURL);
                } else {
                    UIFailsafe.safeSetHTML(avatarEl, `<img src="${user.photoURL}" alt="${user.displayName}" loading="lazy">`);
                    avatarEl.appendChild(document.getElementById('chatStatusIndicator'));
                }
            }
        },

        showMessageActions(message, x, y) {
            const menu = UIFailsafe.safeGetElement('messageActions');
            if (!menu) return;

            const menuWidth = 200;
            const menuHeight = 400;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            let left = x;
            let top = y;
            
            if (left + menuWidth > viewportWidth) {
                left = viewportWidth - menuWidth - 10;
            }
            
            if (top + menuHeight > viewportHeight) {
                top = viewportHeight - menuHeight - 10;
            }
            
            UIFailsafe.safeSetStyle(menu, 'display', 'block');
            UIFailsafe.safeSetStyle(menu, 'left', Math.max(10, left) + 'px');
            UIFailsafe.safeSetStyle(menu, 'top', Math.max(10, top) + 'px');

            const starItem = menu.querySelector('[data-action="star"] i');
            const core = getMessagesCore();
            if (starItem && core?.SafeStorage) {
                const starred = core.SafeStorage.getJSON('starred_messages', {})[message.id];
                UIFailsafe.safeSetAttribute(starItem, 'class', starred ? 'fas fa-star' : 'far fa-star');
            }

            const editItem = menu.querySelector('[data-action="edit"]');
            const deleteItem = menu.querySelector('[data-action="delete"]');
            const currentUserId = core?.getCurrentUserId?.();
            
            if (editItem) {
                UIFailsafe.safeSetStyle(editItem, 'display', message.senderId === currentUserId ? 'flex' : 'none');
            }
            
            if (deleteItem) {
                UIFailsafe.safeSetStyle(deleteItem, 'display', 'flex');
            }

            UIStateManager.setState('messageActionsVisible', true);
            UIStateManager.setState('currentMessageAction', message);
        },

        hideMessageActions() {
            const menu = UIFailsafe.safeGetElement('messageActions');
            if (menu) {
                UIFailsafe.safeSetStyle(menu, 'display', 'none');
            }
            UIStateManager.setState('messageActionsVisible', false);
            UIStateManager.setState('currentMessageAction', null);
        },

        handleMessageAction(action, message) {
            if (!UIFailsafe.canPerformUIAction()) {
                this.showNotification('Please wait while connection is established...');
                return;
            }
            
            const core = getMessagesCore();
            switch (action) {
                case 'reply':
                    if (core) {
                        core.setReplyToMessage?.(message);
                        document.getElementById('messageInput')?.focus();
                    }
                    break;
                    
                case 'edit':
                    if (core) {
                        core.setEditingMessageId?.(message.id);
                        this._showEditInput(message);
                    }
                    break;
                    
                case 'forward':
                    if (core) {
                        core.showForwardMessage?.(message);
                        this.showNotification('Message copied for forwarding');
                    }
                    break;
                    
                case 'copy':
                    navigator.clipboard.writeText(message.content || '');
                    this.showNotification('Copied to clipboard');
                    break;
                    
                case 'star':
                    if (core) {
                        const starred = core.toggleStarMessage?.(message.id);
                        this.showNotification(starred ? 'Message starred' : 'Message unstarred');
                    }
                    break;
                    
                case 'report':
                    if (core) {
                        core.showReportModal?.(message);
                        document.getElementById('reportModal')?.classList.add('active');
                    }
                    break;
                    
                case 'react-like':
                    if (core) {
                        core.addReaction?.(message.id, '👍', true);
                    }
                    break;
                    
                case 'react-love':
                    if (core) {
                        core.addReaction?.(message.id, '❤️', true);
                    }
                    break;
                    
                case 'react-laugh':
                    if (core) {
                        core.addReaction?.(message.id, '😂', true);
                    }
                    break;
                    
                case 'delete':
                    if (core && confirm('Delete this message?')) {
                        core.deleteMessage?.(message.id, false);
                        this.showNotification('Message deleted');
                    }
                    break;
                    
                case 'info':
                    if (core) {
                        const info = core.showMessageInfo?.(message);
                        alert(info);
                    }
                    break;
            }
            
            this.hideMessageActions();
        },

        _showEditInput(message) {
            const messageEl = document.querySelector(`[data-message-id="${message.id}"] .message-content`);
            if (!messageEl) return;

            const originalContent = message.content;
            const inputId = `editMessageInput_${message.id}`;
            const core = getMessagesCore();
            const escaped = core?.escapeHtml ? 
                core.escapeHtml(originalContent) : originalContent;
            
            UIFailsafe.safeSetHTML(messageEl, `
                <input type="text" id="${inputId}" class="edit-message-input" value="${escaped}" 
                       onkeydown="if(event.key==='Enter' && !event.shiftKey) { event.preventDefault(); window.messagesUI?.saveEditedMessage('${message.id}') }">
                <div class="edit-actions">
                    <button class="edit-btn cancel" onclick="window.messagesUI?.cancelEditMessage()">Cancel</button>
                    <button class="edit-btn save" onclick="window.messagesUI?.saveEditedMessage('${message.id}')">Save</button>
                </div>
            `);

            document.getElementById(inputId)?.focus();
        },

        openThread(messageId) {
            const panel = UIFailsafe.safeGetElement('threadPanel');
            const container = UIFailsafe.safeGetElement('threadMessages');
            const countEl = UIFailsafe.safeGetElement('threadCount');

            if (!panel || !container) return;

            UIFailsafe.safeSetHTML(container, '<div class="loading-state"><div class="loading-spinner"></div><div>Loading thread...</div></div>');
            
            UIFailsafe.safeAddClass(panel, 'active');
            UIStateManager.setState('threadVisible', true);

            if (countEl) UIFailsafe.safeSetText(countEl, '0 replies');
        },

        closeThread() {
            const panel = UIFailsafe.safeGetElement('threadPanel');
            if (panel) {
                UIFailsafe.safeRemoveClass(panel, 'active');
            }
            UIStateManager.setState('threadVisible', false);
        },

        async handleAttachment(type) {
            if (!UIFailsafe.canPerformUIAction()) {
                this.showNotification('Please wait while connection is established...');
                return;
            }
            
            const core = getMessagesCore();
            let attachment = null;
            
            switch (type) {
                case 'image':
                    if (core) attachment = await core.selectImage?.();
                    break;
                case 'video':
                    if (core) attachment = await core.selectVideo?.();
                    break;
                case 'audio':
                    if (core) {
                        attachment = await core.startRecording?.();
                        if (attachment) {
                            UIStateManager.setState('recordingActive', true);
                        }
                    }
                    break;
                case 'file':
                    if (core) attachment = await core.selectFile?.();
                    break;
                case 'location':
                    if (core) attachment = await core.shareLocation?.();
                    break;
                case 'poll':
                    if (core) attachment = core.createPoll?.();
                    break;
                case 'note':
                    if (core) await core.createNote?.();
                    return;
            }

            if (attachment && core) {
                core.setCurrentAttachment?.(attachment);
                core.showAttachmentPreview?.(attachment);
                
                document.getElementById('attachmentOptions')?.classList.remove('active');
                UIStateManager.setState('attachmentOptionsActive', false);
            }
        },

        showNotification(message, type = 'success') {
            const notification = UIFailsafe.safeGetElement('notification');
            const text = UIFailsafe.safeGetElement('notificationText');
            
            if (notification && text) {
                UIFailsafe.safeSetText(text, message);
                UIFailsafe.safeSetAttribute(notification, 'class', `notification ${type}`);
                UIFailsafe.safeSetStyle(notification, 'display', 'flex');
                
                clearTimeout(this.notificationTimeout);
                this.notificationTimeout = setTimeout(() => {
                    UIFailsafe.safeSetStyle(notification, 'display', 'none');
                }, 3000);
            }
        },

        scrollToBottom(container) {
            if (!container) return;
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 100);
        },

        renderMultiSendChats(chats) {
            const container = UIFailsafe.safeGetElement('multiSendChatsList');
            if (!container) return;

            if (!this._canRender()) {
                UIFailsafe.safeSetHTML(container, '<div class="empty-state">Waiting for connection...</div>');
                return;
            }

            if (!chats || chats.length === 0) {
                UIFailsafe.safeSetHTML(container, '<div class="empty-state">No chats available</div>');
                return;
            }

            let html = '';
            chats.forEach(chat => {
                const core = getMessagesCore();
                const isSelected = core?.multiSendSelectedChats?.has(chat.id);
                
                html += `
                    <div class="chat-item ${isSelected ? 'selected' : ''}" data-chat-id="${chat.id}">
                        <div class="chat-avatar">
                            ${chat.friendAvatar ? `<img src="${chat.friendAvatar}" alt="${chat.friendName}" loading="lazy">` : `<i class="fas fa-user"></i>`}
                        </div>
                        <div class="chat-info">
                            <div class="chat-name">${chat.friendName || 'User'}</div>
                            <div class="chat-last-message">${chat.lastMessage || 'No messages'}</div>
                        </div>
                        <input type="checkbox" class="multi-send-checkbox" ${isSelected ? 'checked' : ''} 
                               onchange="window.messagesUI?.updateMultiSendSelection('${chat.id}', this.checked); window.messagesUI?.updateSelectedCount()">
                    </div>
                `;
            });

            UIFailsafe.safeSetHTML(container, html);
            this.updateSelectedCount();
        },

        updateSelectedCount() {
            const countEl = UIFailsafe.safeGetElement('selectedCount');
            if (countEl) {
                const core = getMessagesCore();
                const count = core?.multiSendSelectedChats?.size || 0;
                UIFailsafe.safeSetText(countEl, `${count} selected`);
            }
        }
    }.init();

    // =============================================
    // UI EVENT HANDLERS (ENHANCED WITH DETERMINISTIC LIFECYCLE CHECKS)
    // =============================================
    const UIEventHandlers = {
        _initialized: false,
        
        init() {
            if (this._initialized) return this;
            this._setupDOMEventListeners();
            this._setupInputHandlers();
            this._setupClickOutsideHandlers();
            this._setupKeyboardHandlers();
            this._setupResizeHandler();
            this._setupOnlineOfflineHandlers();
            this._setupDragAndDropHandlers();
            this._initialized = true;
            return this;
        },

        _canPerformAction(actionName) {
            // First check if core has valid session directly
            if (UIFailsafe.hasValidSession()) {
                return true;
            }
            
            const lifecycleState = UIStateManager.getState('lifecycleState');
            const sessionValid = UIStateManager.getState('sessionValid');
            
            if (lifecycleState !== LIFECYCLE_STATES.ACTIVE || !sessionValid) {
                UILogger.warn('UIEventHandlers', `Action '${actionName}' blocked - not ACTIVE or no valid session (state: ${lifecycleState}, sessionValid: ${sessionValid})`);
                this._showPassiveNotification(`Please wait while connection is established...`);
                return false;
            }
            return true;
        },
        
        _showPassiveNotification(message) {
            const notification = UIFailsafe.safeGetElement('notification');
            const text = UIFailsafe.safeGetElement('notificationText');
            
            if (notification && text) {
                UIFailsafe.safeSetText(text, message);
                UIFailsafe.safeSetAttribute(notification, 'class', 'notification info');
                UIFailsafe.safeSetStyle(notification, 'display', 'flex');
                
                setTimeout(() => {
                    UIFailsafe.safeSetStyle(notification, 'display', 'none');
                }, 2000);
            }
        },

        _setupDOMEventListeners() {
            const backBtn = UIFailsafe.safeGetElement('backToChatsBtn');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('backToChats')) return;
                        const chatPanel = UIFailsafe.safeGetElement('chatPanel');
                        const sidebar = UIFailsafe.safeGetElement('sidebar');
                        if (chatPanel) UIFailsafe.safeAddClass(chatPanel, 'hidden');
                        if (sidebar) UIFailsafe.safeAddClass(sidebar, 'active');
                        UIStateManager.setState('chatVisible', false);
                    });
                });
            }

            const newChatBtn = UIFailsafe.safeGetElement('newChatBtn');
            if (newChatBtn) {
                newChatBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('newChat')) return;
                        const sidebar = UIFailsafe.safeGetElement('sidebar');
                        const contactsSidebar = UIFailsafe.safeGetElement('contactsSidebar');
                        if (sidebar) UIFailsafe.safeRemoveClass(sidebar, 'active');
                        if (contactsSidebar) UIFailsafe.safeRemoveClass(contactsSidebar, 'hidden');
                        UIStateManager.setState('contactsVisible', true);
                        
                        const core = getMessagesCore();
                        if (core && core.createConversation) {
                            core.createConversation([core.getCurrentUserId()], {
                                type: 'note',
                                name: 'My Notes'
                            });
                        }
                        
                        if (core?.contacts?.length === 0) {
                            core?.loadContacts?.();
                        }
                    });
                });
            }

            const backFromContacts = UIFailsafe.safeGetElement('backToChatsFromContactsBtn');
            if (backFromContacts) {
                backFromContacts.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('backFromContacts')) return;
                        const contactsSidebar = UIFailsafe.safeGetElement('contactsSidebar');
                        const sidebar = UIFailsafe.safeGetElement('sidebar');
                        if (contactsSidebar) UIFailsafe.safeAddClass(contactsSidebar, 'hidden');
                        if (sidebar) UIFailsafe.safeAddClass(sidebar, 'active');
                        UIStateManager.setState('contactsVisible', false);
                    });
                });
            }

            const sendBtn = UIFailsafe.safeGetElement('sendButton');
            if (sendBtn) {
                sendBtn.addEventListener('click', async () => {
                    await UIFailsafe.queueAction(async () => {
                        if (!this._canPerformAction('sendMessage')) return;
                        await this._handleSendMessage();
                    });
                });
            }

            const emojiBtn = UIFailsafe.safeGetElement('emojiBtn');
            if (emojiBtn) {
                // FIXED: Build a real emoji grid the first time the picker opens.
                // Previously the handler only toggled a state flag; the container
                // was always empty so the picker never showed any emojis.
                const _buildEmojiPicker = () => {
                    const container = UIFailsafe.safeGetElement('emojiPickerContainer');
                    if (!container || container.dataset.built) return;
                    const EMOJIS = [
                        '😀','😂','😅','😊','😍','🥰','😎','🤔','😢','😡',
                        '🤗','😜','😇','🥳','😤','😴','🤩','😬','🙄','🤭',
                        '👍','👎','👌','✌️','🤞','🙏','👏','🤝','💪','👀',
                        '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💯',
                        '🔥','✅','❌','⚠️','🎉','🎊','🎶','🌟','💫','⭐',
                        '😈','👻','💀','🤖','🐶','🐱','🍕','🍔','🍩','☕'
                    ];
                    const grid = document.createElement('div');
                    grid.className = 'emoji-grid';
                    grid.style.cssText = 'display:grid;grid-template-columns:repeat(10,1fr);gap:4px;padding:8px;max-height:180px;overflow-y:auto;';
                    EMOJIS.forEach(emoji => {
                        const span = document.createElement('span');
                        span.className = 'emoji-item';
                        span.textContent = emoji;
                        span.title = emoji;
                        span.style.cssText = 'cursor:pointer;font-size:20px;text-align:center;padding:4px;border-radius:4px;user-select:none;';
                        span.addEventListener('mouseenter', () => { span.style.background = 'rgba(0,0,0,0.1)'; });
                        span.addEventListener('mouseleave', () => { span.style.background = ''; });
                        span.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const input = document.getElementById('messageInput');
                            if (input) {
                                const start = input.selectionStart ?? input.value.length;
                                const end = input.selectionEnd ?? input.value.length;
                                input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
                                input.selectionStart = input.selectionEnd = start + emoji.length;
                                input.focus();
                                // Trigger input event so auto-resize fires
                                input.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            // Close picker
                            UIFailsafe.safeRemoveClass(container, 'active');
                            UIStateManager.setState('emojiPickerActive', false);
                        });
                        grid.appendChild(span);
                    });
                    container.appendChild(grid);
                    container.dataset.built = '1';
                };

                emojiBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('emojiPicker')) return;
                        const container = UIFailsafe.safeGetElement('emojiPickerContainer');
                        _buildEmojiPicker();
                        const isActive = UIStateManager.getState('emojiPickerActive');
                        UIStateManager.setState('emojiPickerActive', !isActive);
                        if (container) {
                            if (!isActive) UIFailsafe.safeAddClass(container, 'active');
                            else UIFailsafe.safeRemoveClass(container, 'active');
                        }
                    });
                });

                // Close picker when clicking outside
                document.addEventListener('click', (e) => {
                    if (!e.target.closest('#emojiPickerContainer') && !e.target.closest('#emojiBtn')) {
                        const container = UIFailsafe.safeGetElement('emojiPickerContainer');
                        if (container) UIFailsafe.safeRemoveClass(container, 'active');
                        UIStateManager.setState('emojiPickerActive', false);
                    }
                });
            }

            const formatBtn = UIFailsafe.safeGetElement('formatBtn');
            if (formatBtn) {
                formatBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('formatting')) return;
                        const core = getMessagesCore();
                        if (core) core.toggleFormattingToolbar?.();
                        UIStateManager.toggleState('formattingToolbarActive');
                    });
                });
            }

            const formatBtns = UIFailsafe.safeQuerySelectorAll('.format-btn');
            UIFailsafe.safeForEach(formatBtns, (btn) => {
                btn.addEventListener('click', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('formatting')) return;
                        const tag = e.currentTarget.dataset.tag;
                        const core = getMessagesCore();
                        if (tag && core) {
                            core.applyFormatting?.(tag);
                        }
                    });
                });
            });

            const attachBtn = UIFailsafe.safeGetElement('attachBtn');
            if (attachBtn) {
                // FIXED: The old handler called core.toggleAttachmentOptions() and
                // core.handleAttachment() which do not exist on MessagesCore, so clicking
                // the attach button did nothing. Replaced with a real <input type="file">
                // that uploads to /api/messages/:chatId/upload and sends a message.
                attachBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('attachment')) return;
                        const core = getMessagesCore();
                        const chat = core?.getCurrentConversation?.();
                        if (!chat?.id) {
                            UIRenderer.showNotification('Open a conversation first', 'error');
                            return;
                        }

                        // Create a hidden file input and click it programmatically
                        const fileInput = document.createElement('input');
                        fileInput.type = 'file';
                        fileInput.accept = 'image/*,video/*,audio/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.zip';
                        fileInput.style.display = 'none';
                        document.body.appendChild(fileInput);

                        fileInput.onchange = async (e) => {
                            const file = e.target.files?.[0];
                            try { document.body.removeChild(fileInput); } catch (_) {}
                            if (!file) return;

                            // Size guard: match the 10 MB server limit
                            const MAX_MB = 10;
                            if (file.size > MAX_MB * 1024 * 1024) {
                                UIRenderer.showNotification(`File too large (max ${MAX_MB} MB)`, 'error');
                                return;
                            }

                            UIRenderer.showNotification('Uploading…', 'info');

                            try {
                                const token = core?.SessionManager?._session?.token
                                    || core?.isAuthenticated?.()
                                    ? core?.SessionManager?._session?.token
                                    : null;

                                const formData = new FormData();
                                formData.append('file', file);
                                if (document.getElementById('messageInput')?.value?.trim()) {
                                    formData.append('caption', document.getElementById('messageInput').value.trim());
                                }

                                const res = await fetch(`/api/messages/${chat.id}/upload`, {
                                    method: 'POST',
                                    headers: token ? { 'Authorization': 'Bearer ' + token } : {},
                                    body: formData
                                });

                                const result = await res.json().catch(() => ({}));

                                if (res.ok) {
                                    UIRenderer.showNotification('File sent!', 'success');
                                    // Refresh messages so the uploaded file appears
                                    core?.fetchMessages?.(chat.id);
                                } else {
                                    UIRenderer.showNotification('Upload failed: ' + (result.message || res.statusText), 'error');
                                }
                            } catch (uploadErr) {
                                console.error('[attachBtn] Upload error:', uploadErr);
                                UIRenderer.showNotification('Upload failed — check connection', 'error');
                            }
                        };

                        fileInput.click();
                    });
                });
            }

            // .attachment-option buttons are now unused (replaced by direct file input above),
            // but kept wired in case the HTML still renders them, to avoid silent JS errors.
            const attachmentOptions = UIFailsafe.safeQuerySelectorAll('.attachment-option');
            UIFailsafe.safeForEach(attachmentOptions, (btn) => {
                btn.addEventListener('click', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('attachment')) return;
                        // Trigger the same file picker as the main attach button
                        const attachBtnEl = UIFailsafe.safeGetElement('attachBtn');
                        if (attachBtnEl) attachBtnEl.click();
                        UIStateManager.setState('attachmentOptionsActive', false);
                    });
                });
            });

            const jumpBtn = UIFailsafe.safeGetElement('jumpToLatestBtn');
            if (jumpBtn) {
                jumpBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('jumpToLatest')) return;
                        const core = getMessagesCore();
                        if (core) core.jumpToLatest?.();
                    });
                });
            }

            const chatSearchBtn = UIFailsafe.safeGetElement('chatSearchBtn');
            if (chatSearchBtn) {
                chatSearchBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('chatSearch')) return;
                        const chatSearchBar = UIFailsafe.safeGetElement('chatSearchBar');
                        if (chatSearchBar) UIFailsafe.safeToggleClass(chatSearchBar, 'active');
                        const inChatSearch = UIFailsafe.safeGetElement('inChatSearch');
                        if (inChatSearch) inChatSearch.focus();
                    });
                });
            }

            const closeChatSearch = UIFailsafe.safeGetElement('closeChatSearchBtn');
            if (closeChatSearch) {
                closeChatSearch.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const chatSearchBar = UIFailsafe.safeGetElement('chatSearchBar');
                        const searchResults = UIFailsafe.safeGetElement('searchResults');
                        if (chatSearchBar) UIFailsafe.safeRemoveClass(chatSearchBar, 'active');
                        if (searchResults) UIFailsafe.safeRemoveClass(searchResults, 'active');
                        const core = getMessagesCore();
                        if (core) core.removeSearchHighlights?.();
                    });
                });
            }

            const inChatSearch = UIFailsafe.safeGetElement('inChatSearch');
            if (inChatSearch) {
                inChatSearch.addEventListener('input', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('search')) return;
                        this._handleChatSearch(e.target.value);
                    });
                });
                
                inChatSearch.addEventListener('keydown', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (e.key === 'Enter') {
                            if (!this._canPerformAction('search')) return;
                            e.preventDefault();
                            this._handleChatSearch(e.target.value);
                        } else if (e.key === 'Escape') {
                            const closeBtn = UIFailsafe.safeGetElement('closeChatSearchBtn');
                            if (closeBtn) closeBtn.click();
                        }
                    });
                });
            }

            const chatSearch = UIFailsafe.safeGetElement('chatSearch');
            if (chatSearch) {
                chatSearch.addEventListener('input', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('filterChats')) return;
                        this._filterChats(e.target.value);
                    });
                });
            }

            const contactSearch = UIFailsafe.safeGetElement('contactSearch');
            if (contactSearch) {
                contactSearch.addEventListener('input', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('filterContacts')) return;
                        this._filterContacts(e.target.value);
                    });
                });
            }

            const categoryTabs = UIFailsafe.safeQuerySelectorAll('.category-tab');
            UIFailsafe.safeForEach(categoryTabs, (tab) => {
                tab.addEventListener('click', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('changeCategory')) return;
                        UIFailsafe.safeForEach(categoryTabs, (t) => UIFailsafe.safeRemoveClass(t, 'active'));
                        UIFailsafe.safeAddClass(e.currentTarget, 'active');
                        
                        const category = e.currentTarget.dataset.category;
                        const core = getMessagesCore();
                        if (core) {
                            core.setCurrentCategory?.(category);
                            core.renderChatsList?.();
                        }
                    });
                });
            });

            const multiSendToggle = UIFailsafe.safeGetElement('multiSendToggleBtn');
            if (multiSendToggle) {
                multiSendToggle.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('multiSend')) return;
                        this._toggleMultiSend();
                    });
                });
            }

            const closeMultiSend = UIFailsafe.safeGetElement('closeMultiSendBtn');
            if (closeMultiSend) {
                closeMultiSend.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        this._closeMultiSend();
                    });
                });
            }

            const multiSendBtn = UIFailsafe.safeGetElement('multiSendBtn');
            if (multiSendBtn) {
                multiSendBtn.addEventListener('click', async () => {
                    await UIFailsafe.queueAction(async () => {
                        if (!this._canPerformAction('multiSend')) return;
                        await this._handleMultiSend();
                    });
                });
            }

            const multiSendSearch = UIFailsafe.safeGetElement('multiSendSearch');
            if (multiSendSearch) {
                multiSendSearch.addEventListener('input', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('filterMultiSend')) return;
                        this._filterMultiSendChats(e.target.value);
                    });
                });
            }

            const scheduleBtn = UIFailsafe.safeGetElement('scheduleBtn');
            if (scheduleBtn) {
                scheduleBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('schedule')) return;
                        const scheduleModal = UIFailsafe.safeGetElement('scheduleModal');
                        if (scheduleModal) UIFailsafe.safeAddClass(scheduleModal, 'active');
                        this._populateScheduleDefaults();
                    });
                });
            }

            const closeSchedule = UIFailsafe.safeGetElement('closeScheduleBtn');
            if (closeSchedule) {
                closeSchedule.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const scheduleModal = UIFailsafe.safeGetElement('scheduleModal');
                        if (scheduleModal) UIFailsafe.safeRemoveClass(scheduleModal, 'active');
                    });
                });
            }

            const cancelSchedule = UIFailsafe.safeGetElement('cancelScheduleBtn');
            if (cancelSchedule) {
                cancelSchedule.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const scheduleModal = UIFailsafe.safeGetElement('scheduleModal');
                        if (scheduleModal) UIFailsafe.safeRemoveClass(scheduleModal, 'active');
                    });
                });
            }

            const confirmSchedule = UIFailsafe.safeGetElement('confirmScheduleBtn');
            if (confirmSchedule) {
                confirmSchedule.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('schedule')) return;
                        this._handleScheduleMessage();
                    });
                });
            }

            const sendNowCheckbox = UIFailsafe.safeGetElement('sendNow');
            if (sendNowCheckbox) {
                sendNowCheckbox.addEventListener('change', (e) => {
                    UIFailsafe.queueAction(() => {
                        const dateInput = UIFailsafe.safeGetElement('scheduleDate');
                        const timeInput = UIFailsafe.safeGetElement('scheduleTime');
                        if (dateInput && timeInput) {
                            UIFailsafe.safeSetProperty(dateInput, 'disabled', e.target.checked);
                            UIFailsafe.safeSetProperty(timeInput, 'disabled', e.target.checked);
                        }
                    });
                });
            }

            const voiceCallBtn = UIFailsafe.safeGetElement('voiceCallBtn');
            if (voiceCallBtn) {
                voiceCallBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('voiceCall')) return;
                        if (UIStateManager.getState('connectionQuality') !== 'poor') {
                            this.showNotification('Call feature coming soon');
                        }
                    });
                });
            }

            const videoCallBtn = UIFailsafe.safeGetElement('videoCallBtn');
            if (videoCallBtn) {
                videoCallBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('videoCall')) return;
                        if (UIStateManager.getState('connectionQuality') !== 'poor') {
                            this.showNotification('Video call feature coming soon');
                        }
                    });
                });
            }

            const chatOptionsBtn = UIFailsafe.safeGetElement('chatOptionsBtn');
            if (chatOptionsBtn) {
                chatOptionsBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('chatOptions')) return;
                        const core = getMessagesCore();
                        const chat = core?.currentChat;
                        if (chat && core) {
                            const info = core.showChatInfo?.(chat);
                            this._showChatInfoModal(info);
                        }
                    });
                });
            }

            const closeChatInfo = UIFailsafe.safeGetElement('closeChatInfoBtn');
            if (closeChatInfo) {
                closeChatInfo.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const chatInfoModal = UIFailsafe.safeGetElement('chatInfoModal');
                        if (chatInfoModal) UIFailsafe.safeRemoveClass(chatInfoModal, 'active');
                    });
                });
            }

            const closeThread = UIFailsafe.safeGetElement('closeThreadBtn');
            if (closeThread) {
                closeThread.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        UIRenderer.closeThread();
                    });
                });
            }

            const threadSend = UIFailsafe.safeGetElement('threadSendBtn');
            if (threadSend) {
                threadSend.addEventListener('click', async () => {
                    await UIFailsafe.queueAction(async () => {
                        if (!this._canPerformAction('threadReply')) return;
                        await this._handleThreadReply();
                    });
                });
            }

            const dismissOffline = UIFailsafe.safeGetElement('dismissOfflineBtn');
            if (dismissOffline) {
                dismissOffline.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const offlineOverlay = UIFailsafe.safeGetElement('offlineOverlay');
                        if (offlineOverlay) UIFailsafe.safeRemoveClass(offlineOverlay, 'active');
                    });
                });
            }

            const cancelReport = UIFailsafe.safeGetElement('cancelReportBtn');
            if (cancelReport) {
                cancelReport.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const reportModal = UIFailsafe.safeGetElement('reportModal');
                        if (reportModal) UIFailsafe.safeRemoveClass(reportModal, 'active');
                    });
                });
            }

            const submitReport = UIFailsafe.safeGetElement('submitReportBtn');
            if (submitReport) {
                submitReport.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('report')) return;
                        const core = getMessagesCore();
                        if (core?.submitReport?.()) {
                            const reportModal = UIFailsafe.safeGetElement('reportModal');
                            if (reportModal) UIFailsafe.safeRemoveClass(reportModal, 'active');
                            UIRenderer.showNotification('Report submitted');
                        }
                    });
                });
            }

            const cancelRecording = UIFailsafe.safeGetElement('cancelRecordingBtn');
            if (cancelRecording) {
                cancelRecording.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const core = getMessagesCore();
                        if (core) {
                            core.cancelRecording?.();
                            UIStateManager.setState('recordingActive', false);
                            const recordingIndicator = UIFailsafe.safeGetElement('recordingIndicator');
                            if (recordingIndicator) UIFailsafe.safeSetStyle(recordingIndicator, 'display', 'none');
                        }
                    });
                });
            }

            const cancelRecordingOverlay = UIFailsafe.safeGetElement('cancelRecordingOverlayBtn');
            if (cancelRecordingOverlay) {
                cancelRecordingOverlay.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const core = getMessagesCore();
                        if (core) {
                            core.cancelRecording?.();
                            const recordingCancelOverlay = UIFailsafe.safeGetElement('recordingCancelOverlay');
                            if (recordingCancelOverlay) UIFailsafe.safeRemoveClass(recordingCancelOverlay, 'active');
                            UIStateManager.setState('recordingActive', false);
                        }
                    });
                });
            }

            const messageActionItems = UIFailsafe.safeQuerySelectorAll('#messageActions .action-item');
            UIFailsafe.safeForEach(messageActionItems, (item) => {
                item.addEventListener('click', (e) => {
                    UIFailsafe.queueAction(() => {
                        const action = e.currentTarget.dataset.action;
                        const message = UIStateManager.getState('currentMessageAction');
                        if (action && message) {
                            UIRenderer.handleMessageAction(action, message);
                        }
                    });
                });
            });

            const retryBtn = UIFailsafe.safeGetElement('retryConnectionBtn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const core = getMessagesCore();
                        if (core) core.retryConnection?.();
                    });
                });
            }
        },

        _setupInputHandlers() {
            const messageInput = UIFailsafe.safeGetElement('messageInput');
            if (!messageInput) return;

            messageInput.addEventListener('input', () => {
                UIFailsafe.queueAction(() => {
                    if (!this._canPerformAction('typing')) return;
                    messageInput.style.height = 'auto';
                    messageInput.style.height = messageInput.scrollHeight + 'px';
                    
                    this._handleTypingIndicator();
                    
                    const core = getMessagesCore();
                    if (core?.saveMessageDraft) {
                        core.saveMessageDraft();
                    }
                });
            });

            messageInput.addEventListener('keydown', (e) => {
                UIFailsafe.queueAction(() => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!this._canPerformAction('sendMessage')) return;
                        this._handleSendMessage();
                    }
                });
            });

            messageInput.addEventListener('paste', (e) => {
                UIFailsafe.queueAction(() => {
                    if (!this._canPerformAction('paste')) return;
                    const items = e.clipboardData?.items;
                    if (items) {
                        for (const item of items) {
                            if (item.type.indexOf('image') !== -1) {
                                e.preventDefault();
                                this._handleImagePaste(item);
                                break;
                            }
                        }
                    }
                });
            });

            messageInput.addEventListener('dragover', (e) => {
                e.preventDefault();
                UIFailsafe.safeAddClass(messageInput, 'drag-over');
            });

            messageInput.addEventListener('dragleave', () => {
                UIFailsafe.safeRemoveClass(messageInput, 'drag-over');
            });

            messageInput.addEventListener('drop', (e) => {
                e.preventDefault();
                UIFailsafe.safeRemoveClass(messageInput, 'drag-over');
                
                if (!this._canPerformAction('drop')) return;
                const files = e.dataTransfer?.files;
                if (files && files.length > 0) {
                    this._handleFileDrop(files[0]);
                }
            });
        },

        _setupClickOutsideHandlers() {
            document.addEventListener('click', (e) => {
                UIFailsafe.queueAction(() => {
                    if (UIStateManager.getState('emojiPickerActive')) {
                        const core = getMessagesCore();
                        if (core) core.closeEmojiPickerOnClickOutside?.(e);
                    }
                });
            });

            document.addEventListener('click', (e) => {
                UIFailsafe.queueAction(() => {
                    if (UIStateManager.getState('formattingToolbarActive')) {
                        const core = getMessagesCore();
                        if (core) core.closeFormattingToolbarOnClickOutside?.(e);
                    }
                });
            });

            document.addEventListener('click', (e) => {
                UIFailsafe.queueAction(() => {
                    if (UIStateManager.getState('attachmentOptionsActive')) {
                        const core = getMessagesCore();
                        if (core) core.closeAttachmentOptionsOnClickOutside?.(e);
                    }
                });
            });

            document.addEventListener('click', (e) => {
                UIFailsafe.queueAction(() => {
                    if (UIStateManager.getState('messageActionsVisible')) {
                        const menu = UIFailsafe.safeGetElement('messageActions');
                        if (menu && !menu.contains(e.target)) {
                            UIRenderer.hideMessageActions();
                        }
                    }
                });
            });

            const chatInfoModals = UIFailsafe.safeQuerySelectorAll('.chat-info-modal');
            UIFailsafe.safeForEach(chatInfoModals, (modal) => {
                modal.addEventListener('click', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (e.target === modal) {
                            UIFailsafe.safeRemoveClass(modal, 'active');
                        }
                    });
                });
            });

            const reportModals = UIFailsafe.safeQuerySelectorAll('.report-modal');
            UIFailsafe.safeForEach(reportModals, (modal) => {
                modal.addEventListener('click', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (e.target === modal) {
                            UIFailsafe.safeRemoveClass(modal, 'active');
                        }
                    });
                });
            });

            const scheduleModals = UIFailsafe.safeQuerySelectorAll('.schedule-modal');
            UIFailsafe.safeForEach(scheduleModals, (modal) => {
                modal.addEventListener('click', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (e.target === modal) {
                            UIFailsafe.safeRemoveClass(modal, 'active');
                        }
                    });
                });
            });
        },

        _setupKeyboardHandlers() {
            document.addEventListener('keydown', (e) => {
                UIFailsafe.queueAction(() => {
                    if (e.key === 'Escape') {
                        if (UIStateManager.getState('messageActionsVisible')) {
                            UIRenderer.hideMessageActions();
                        }
                        
                        if (UIStateManager.getState('emojiPickerActive')) {
                            const emojiPickerContainer = UIFailsafe.safeGetElement('emojiPickerContainer');
                            if (emojiPickerContainer) UIFailsafe.safeRemoveClass(emojiPickerContainer, 'active');
                            UIStateManager.setState('emojiPickerActive', false);
                        }
                        
                        if (UIStateManager.getState('threadVisible')) {
                            UIRenderer.closeThread();
                        }
                        
                        if (UIStateManager.getState('multiSendVisible')) {
                            this._closeMultiSend();
                        }
                        
                        const chatSearchBar = UIFailsafe.safeGetElement('chatSearchBar');
                        if (chatSearchBar && chatSearchBar.classList.contains('active')) {
                            const closeBtn = UIFailsafe.safeGetElement('closeChatSearchBtn');
                            if (closeBtn) closeBtn.click();
                        }
                    }

                    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                        e.preventDefault();
                        if (!this._canPerformAction('searchChats')) return;
                        const chatSearch = UIFailsafe.safeGetElement('chatSearch');
                        if (chatSearch) chatSearch.focus();
                    }

                    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                        e.preventDefault();
                        if (!this._canPerformAction('searchInChat')) return;
                        const core = getMessagesCore();
                        if (core?.currentChat) {
                            const chatSearchBar = UIFailsafe.safeGetElement('chatSearchBar');
                            if (chatSearchBar) UIFailsafe.safeAddClass(chatSearchBar, 'active');
                            const inChatSearch = UIFailsafe.safeGetElement('inChatSearch');
                            if (inChatSearch) inChatSearch.focus();
                        }
                    }

                    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                        e.preventDefault();
                        if (!this._canPerformAction('newChat')) return;
                        const newChatBtn = UIFailsafe.safeGetElement('newChatBtn');
                        if (newChatBtn) newChatBtn.click();
                    }

                    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
                        e.preventDefault();
                        if (!this._canPerformAction('multiSend')) return;
                        const multiSendToggle = UIFailsafe.safeGetElement('multiSendToggleBtn');
                        if (multiSendToggle) multiSendToggle.click();
                    }
                });
            });
        },

        _setupResizeHandler() {
            let resizeTimer;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    UIFailsafe.queueAction(() => {
                        this._handleResize();
                    });
                }, 250);
            });
            
            setTimeout(() => this._handleResize(), 100);
        },

        _setupOnlineOfflineHandlers() {
            window.addEventListener('online', () => {
                UIFailsafe.queueAction(() => {
                    const offlineOverlay = UIFailsafe.safeGetElement('offlineOverlay');
                    if (offlineOverlay) UIFailsafe.safeRemoveClass(offlineOverlay, 'active');
                    UIRenderer.showNotification('Back online', 'success');
                    
                    const core = getMessagesCore();
                    if (core?.checkOfflineQueue) {
                        core.checkOfflineQueue();
                    }
                    
                    if (core?.fetchConversations) {
                        core.fetchConversations();
                    }
                });
            });

            window.addEventListener('offline', () => {
                UIFailsafe.queueAction(() => {
                    const offlineOverlay = UIFailsafe.safeGetElement('offlineOverlay');
                    if (offlineOverlay) UIFailsafe.safeAddClass(offlineOverlay, 'active');
                    UIRenderer.showNotification('You are offline', 'warning');
                });
            });
        },

        _setupDragAndDropHandlers() {
            const recordingIndicator = UIFailsafe.safeGetElement('recordingIndicator');
            if (!recordingIndicator) return;

            let dragStartY = 0;
            
            recordingIndicator.addEventListener('mousedown', (e) => {
                if (!UIStateManager.getState('recordingActive')) return;
                dragStartY = e.clientY;
                const core = getMessagesCore();
                if (core) core.setDragStartY?.(dragStartY);
                
                const handleDrag = (e) => {
                    const deltaY = e.clientY - dragStartY;
                    if (deltaY < -50) {
                        const recordingCancelOverlay = UIFailsafe.safeGetElement('recordingCancelOverlay');
                        if (recordingCancelOverlay) UIFailsafe.safeAddClass(recordingCancelOverlay, 'active');
                        if (core) core.setIsDraggingToCancel?.(true);
                    } else {
                        const recordingCancelOverlay = UIFailsafe.safeGetElement('recordingCancelOverlay');
                        if (recordingCancelOverlay) UIFailsafe.safeRemoveClass(recordingCancelOverlay, 'active');
                        if (core) core.setIsDraggingToCancel?.(false);
                    }
                };
                
                const handleDragEnd = () => {
                    document.removeEventListener('mousemove', handleDrag);
                    document.removeEventListener('mouseup', handleDragEnd);
                    
                    const core = getMessagesCore();
                    if (core?.isDraggingToCancel) {
                        if (core) {
                            core.cancelRecording?.();
                            UIStateManager.setState('recordingActive', false);
                            const recordingIndicator = UIFailsafe.safeGetElement('recordingIndicator');
                            if (recordingIndicator) UIFailsafe.safeSetStyle(recordingIndicator, 'display', 'none');
                        }
                    }
                    
                    const recordingCancelOverlay = UIFailsafe.safeGetElement('recordingCancelOverlay');
                    if (recordingCancelOverlay) UIFailsafe.safeRemoveClass(recordingCancelOverlay, 'active');
                    if (core) core.setIsDraggingToCancel?.(false);
                };
                
                document.addEventListener('mousemove', handleDrag);
                document.addEventListener('mouseup', handleDragEnd);
            });
        },

        async _handleSendMessage() {
            const input = UIFailsafe.safeGetElement('messageInput');
            if (!input) return;

            const content = input.value.trim();
            const core = getMessagesCore();
            const attachment = core?.currentAttachment;
            
            if (!content && !attachment) return;

            const result = core?.sendMessage(content, {
                type: attachment?.type || 'text',
                attachment: attachment
            });

            if (result && typeof result.then === 'function') {
                result.then((response) => {
                    if (response && response.success) {
                        input.value = '';
                        input.style.height = 'auto';
                        if (core) {
                            core.removeAttachment?.();
                            if (core.replyToMessage) {
                                core.setReplyToMessage?.(null);
                            }
                        }
                        UIRenderer.showNotification('Message sent');
                    } else {
                        UIRenderer.showNotification('Failed to send', 'error');
                    }
                }).catch((error) => {
                    UIRenderer.showNotification('Failed to send: ' + error.message, 'error');
                });
            } else if (result && result.success) {
                input.value = '';
                input.style.height = 'auto';
                if (core) {
                    core.removeAttachment?.();
                    if (core.replyToMessage) {
                        core.setReplyToMessage?.(null);
                    }
                }
                UIRenderer.showNotification('Message sent');
            } else {
                UIRenderer.showNotification('Failed to send', 'error');
            }
        },

        _handleTypingIndicator() {
            const core = getMessagesCore();
            if (!core?.currentChat) return;

            if (!core.isTyping) {
                core.setIsTyping?.(true);
                core.sendTyping?.(core.currentChat.id, true);

                if (core.typingTimeout) {
                    clearTimeout(core.typingTimeout);
                }

                core.setTypingTimeout?.(setTimeout(() => {
                    if (core) {
                        core.setIsTyping?.(false);
                        core.sendTyping?.(core.currentChat.id, false);
                    }
                }, 3000));
            }
        },

        async _handleImagePaste(item) {
            const file = item.getAsFile();
            if (!file) return;

            if (file.size > 10 * 1024 * 1024) {
                UIRenderer.showNotification('Image too large (max 10MB)', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                UIFailsafe.queueAction(() => {
                    const attachment = {
                        type: 'image',
                        data: reader.result,
                        name: file.name,
                        size: file.size
                    };
                    const core = getMessagesCore();
                    if (core) {
                        core.setCurrentAttachment?.(attachment);
                        core.showAttachmentPreview?.(attachment);
                    }
                });
            };
            reader.readAsDataURL(file);
        },

        async _handleFileDrop(file) {
            if (!file) return;

            const maxSize = 100 * 1024 * 1024;
            if (file.size > maxSize) {
                UIRenderer.showNotification('File too large (max 100MB)', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                UIFailsafe.queueAction(() => {
                    const type = file.type.startsWith('image/') ? 'image' :
                                file.type.startsWith('video/') ? 'video' :
                                file.type.startsWith('audio/') ? 'audio' : 'file';
                    
                    const attachment = {
                        type,
                        data: reader.result,
                        name: file.name,
                        size: file.size
                    };
                    
                    if (type === 'audio') {
                        const audio = new Audio(reader.result);
                        audio.onloadedmetadata = () => {
                            attachment.duration = Math.floor(audio.duration);
                            const core = getMessagesCore();
                            if (core) {
                                core.setCurrentAttachment?.(attachment);
                                core.showAttachmentPreview?.(attachment);
                            }
                        };
                    } else {
                        const core = getMessagesCore();
                        if (core) {
                            core.setCurrentAttachment?.(attachment);
                            core.showAttachmentPreview?.(attachment);
                        }
                    }
                });
            };
            reader.readAsDataURL(file);
        },

        _handleChatSearch(query) {
            if (!query.trim()) {
                const searchResults = UIFailsafe.safeGetElement('searchResults');
                if (searchResults) UIFailsafe.safeRemoveClass(searchResults, 'active');
                const core = getMessagesCore();
                if (core) core.removeSearchHighlights?.();
                return;
            }

            const core = getMessagesCore();
            const results = core?.searchInChat?.(query);
            const container = UIFailsafe.safeGetElement('searchResults');
            
            if (container) {
                if (results && results.length > 0) {
                    UIFailsafe.safeSetHTML(container, `
                        <div class="search-results-header">
                            <span>${results.length} ${results.length === 1 ? 'result' : 'results'}</span>
                            <div class="search-navigation">
                                <button class="search-nav-btn" id="prevSearchResult"><i class="fas fa-chevron-up"></i></button>
                                <button class="search-nav-btn" id="nextSearchResult"><i class="fas fa-chevron-down"></i></button>
                            </div>
                        </div>
                    `);
                    UIFailsafe.safeAddClass(container, 'active');
                    
                    if (core) {
                        core.highlightSearchResults?.(query);
                        core.setCurrentSearchIndex?.(0);
                        core.navigateToSearchResult?.(0);
                    }
                    
                    const prevBtn = UIFailsafe.safeGetElement('prevSearchResult');
                    if (prevBtn) {
                        prevBtn.addEventListener('click', () => {
                            UIFailsafe.queueAction(() => {
                                if (!this._canPerformAction('searchNavigation')) return;
                                const current = core?.currentSearchIndex;
                                if (current > 0 && core) {
                                    core.setCurrentSearchIndex?.(current - 1);
                                    core.navigateToSearchResult?.(current - 1);
                                    const span = UIFailsafe.safeGetElement('searchResultIndex');
                                    if (span) UIFailsafe.safeSetText(span, `${current}/${results.length}`);
                                }
                            });
                        });
                    }
                    
                    const nextBtn = UIFailsafe.safeGetElement('nextSearchResult');
                    if (nextBtn) {
                        nextBtn.addEventListener('click', () => {
                            UIFailsafe.queueAction(() => {
                                if (!this._canPerformAction('searchNavigation')) return;
                                const current = core?.currentSearchIndex;
                                if (current < results.length - 1 && core) {
                                    core.setCurrentSearchIndex?.(current + 1);
                                    core.navigateToSearchResult?.(current + 1);
                                    const span = UIFailsafe.safeGetElement('searchResultIndex');
                                    if (span) UIFailsafe.safeSetText(span, `${current + 2}/${results.length}`);
                                }
                            });
                        });
                    }
                } else {
                    UIFailsafe.safeSetHTML(container, '<div class="search-results-header">No results found</div>');
                    UIFailsafe.safeAddClass(container, 'active');
                }
            }
        },

        _filterChats(query) {
            const items = UIFailsafe.safeQuerySelectorAll('#chatsList .chat-item');
            const searchTerm = query.toLowerCase().trim();
            
            UIFailsafe.safeForEach(items, (item) => {
                const name = item.querySelector('.chat-name')?.textContent.toLowerCase() || '';
                const lastMessage = item.querySelector('.last-message-text')?.textContent.toLowerCase() || '';
                
                UIFailsafe.safeSetStyle(item, 'display', 
                    name.includes(searchTerm) || lastMessage.includes(searchTerm) ? 'flex' : 'none');
            });
        },

        _filterContacts(query) {
            const items = UIFailsafe.safeQuerySelectorAll('#contactsList .contact-item');
            const searchTerm = query.toLowerCase().trim();
            
            UIFailsafe.safeForEach(items, (item) => {
                const name = item.querySelector('.contact-name')?.textContent.toLowerCase() || '';
                UIFailsafe.safeSetStyle(item, 'display', name.includes(searchTerm) ? 'flex' : 'none');
            });
        },

        _filterMultiSendChats(query) {
            const items = UIFailsafe.safeQuerySelectorAll('#multiSendChatsList .chat-item');
            const searchTerm = query.toLowerCase().trim();
            
            UIFailsafe.safeForEach(items, (item) => {
                const name = item.querySelector('.chat-name')?.textContent.toLowerCase() || '';
                UIFailsafe.safeSetStyle(item, 'display', name.includes(searchTerm) ? 'flex' : 'none');
            });
        },

        _toggleMultiSend() {
            const panel = UIFailsafe.safeGetElement('multiSendPanel');
            if (!panel) return;

            if (panel.classList.contains('active')) {
                UIFailsafe.safeRemoveClass(panel, 'active');
                UIStateManager.setState('multiSendVisible', false);
            } else {
                const core = getMessagesCore();
                const chats = core?.loadMultiSendChats?.() || [];
                UIRenderer.renderMultiSendChats(chats);
                UIFailsafe.safeAddClass(panel, 'active');
                UIStateManager.setState('multiSendVisible', true);
                const multiSendSearch = UIFailsafe.safeGetElement('multiSendSearch');
                if (multiSendSearch) multiSendSearch.focus();
            }
        },

        _closeMultiSend() {
            const panel = UIFailsafe.safeGetElement('multiSendPanel');
            if (panel) {
                UIFailsafe.safeRemoveClass(panel, 'active');
            }
            const core = getMessagesCore();
            if (core) core.setMultiSendSelectedChats?.(new Set());
            UIStateManager.setState('multiSendVisible', false);
        },

        async _handleMultiSend() {
            const input = UIFailsafe.safeGetElement('multiSendInput');
            const content = input?.value?.trim() || '';
            const core = getMessagesCore();
            const selectedChats = core?.multiSendSelectedChats;
            
            if ((!content && !core?.currentAttachment) || !selectedChats || selectedChats.size === 0) {
                UIRenderer.showNotification('No content or chats selected', 'error');
                return;
            }

            const chatIds = Array.from(selectedChats);
            const promises = chatIds.map(chatId => 
                core?.forwardMessage?.(core?.currentAttachment?.id || content, [chatId])
            );
            
            try {
                const results = await Promise.all(promises);
                const successCount = results.filter(r => r && r.success).length;
                
                if (successCount > 0) {
                    UIRenderer.showNotification(`Message sent to ${successCount} chats`);
                    this._closeMultiSend();
                    if (input) input.value = '';
                    if (core) core.removeAttachment?.();
                } else {
                    UIRenderer.showNotification('Failed to send messages', 'error');
                }
            } catch (error) {
                UIRenderer.showNotification('Error sending messages: ' + error.message, 'error');
            }
        },

        _populateScheduleDefaults() {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            const dateInput = UIFailsafe.safeGetElement('scheduleDate');
            const timeInput = UIFailsafe.safeGetElement('scheduleTime');
            const messageInput = UIFailsafe.safeGetElement('scheduleMessage');
            
            if (dateInput) {
                const year = tomorrow.getFullYear();
                const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
                const day = String(tomorrow.getDate()).padStart(2, '0');
                dateInput.value = `${year}-${month}-${day}`;
            }
            
            if (timeInput) {
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                timeInput.value = `${hours}:${minutes}`;
            }
            
            if (messageInput) {
                const mainInput = UIFailsafe.safeGetElement('messageInput');
                messageInput.value = mainInput?.value || '';
            }
        },

        _handleScheduleMessage() {
            const dateInput = UIFailsafe.safeGetElement('scheduleDate');
            const timeInput = UIFailsafe.safeGetElement('scheduleTime');
            const messageInput = UIFailsafe.safeGetElement('scheduleMessage');
            const sendNow = UIFailsafe.safeGetElement('sendNow');

            if (!dateInput || !timeInput || !messageInput) return;

            const core = getMessagesCore();
            if (sendNow?.checked) {
                if (core) {
                    const result = core.sendMessage?.(messageInput.value);
                    if (result && typeof result.then === 'function') {
                        result.then(() => {
                            const scheduleModal = UIFailsafe.safeGetElement('scheduleModal');
                            if (scheduleModal) UIFailsafe.safeRemoveClass(scheduleModal, 'active');
                            UIRenderer.showNotification('Message sent');
                        }).catch((error) => {
                            UIRenderer.showNotification('Failed to send: ' + error.message, 'error');
                        });
                    } else if (result && result.success) {
                        const scheduleModal = UIFailsafe.safeGetElement('scheduleModal');
                        if (scheduleModal) UIFailsafe.safeRemoveClass(scheduleModal, 'active');
                        UIRenderer.showNotification('Message sent');
                    }
                }
                return;
            }

            const scheduleDate = dateInput.value;
            const scheduleTime = timeInput.value;
            
            if (!scheduleDate || !scheduleTime) {
                UIRenderer.showNotification('Please select date and time', 'error');
                return;
            }

            const scheduleDateTime = new Date(`${scheduleDate}T${scheduleTime}`).getTime();
            
            if (scheduleDateTime <= Date.now()) {
                UIRenderer.showNotification('Schedule time must be in the future', 'error');
                return;
            }

            const scheduledMessage = {
                id: core?.SecurityUtils?.generateMessageId?.() || 'msg_' + Date.now(),
                chatId: core?.currentChat?.id,
                content: messageInput.value,
                attachment: core?.currentAttachment,
                scheduleTime: scheduleDateTime,
                status: 'scheduled',
                createdAt: Date.now()
            };

            const scheduled = core?.scheduledMessages || [];
            scheduled.push(scheduledMessage);
            if (core) core.setScheduledMessages?.(scheduled);
            
            if (core?.SafeStorage) {
                core.SafeStorage.setJSON(
                    core.LOCAL_STORAGE_KEYS?.SCHEDULED_MESSAGES,
                    scheduled
                );
            }

            const scheduleModal = UIFailsafe.safeGetElement('scheduleModal');
            if (scheduleModal) UIFailsafe.safeRemoveClass(scheduleModal, 'active');
            UIRenderer.showNotification('Message scheduled');
            if (core) core.updateScheduleBadge?.();
        },

        async _handleThreadReply() {
            const input = UIFailsafe.safeGetElement('threadInput');
            const content = input?.value?.trim();
            const core = getMessagesCore();
            
            if (!content || !core?.currentThread) return;

            const result = core.sendMessage?.(content, {
                conversationId: core.currentThread.id,
                replyTo: core.currentThread.messageId
            });

            if (result && typeof result.then === 'function') {
                result.then(() => {
                    input.value = '';
                    UIRenderer.showNotification('Reply sent');
                }).catch((error) => {
                    UIRenderer.showNotification('Failed to send reply: ' + error.message, 'error');
                });
            } else if (result && result.success) {
                input.value = '';
                UIRenderer.showNotification('Reply sent');
            }
        },

        _showChatInfoModal(info) {
            const modal = UIFailsafe.safeGetElement('chatInfoModal');
            const body = UIFailsafe.safeGetElement('chatInfoBody');
            const nameEl = UIFailsafe.safeGetElement('chatInfoName');

            if (!modal || !body) return;

            if (nameEl) UIFailsafe.safeSetText(nameEl, info.title);

            let html = '';
            info.sections.forEach(section => {
                html += `<div class="chat-info-section">`;
                html += `<div class="chat-info-title">${section.title}</div>`;
                
                section.items.forEach(item => {
                    html += `
                        <div class="chat-info-item">
                            <div class="chat-info-label">${item.label}</div>
                            <div class="chat-info-value">${item.value}</div>
                        </div>
                    `;
                });
                
                html += `</div>`;
            });

            UIFailsafe.safeSetHTML(body, html);
            UIFailsafe.safeAddClass(modal, 'active');
        },

        _handleResize() {
            const width = window.innerWidth;
            
            if (width <= 768) {
                if (UIStateManager.getState('chatVisible')) {
                    const sidebar = UIFailsafe.safeGetElement('sidebar');
                    if (sidebar) UIFailsafe.safeRemoveClass(sidebar, 'active');
                } else {
                    const sidebar = UIFailsafe.safeGetElement('sidebar');
                    if (sidebar) UIFailsafe.safeAddClass(sidebar, 'active');
                }
            } else {
                const sidebar = UIFailsafe.safeGetElement('sidebar');
                if (sidebar) UIFailsafe.safeAddClass(sidebar, 'active');
            }

            const messagesContainer = UIFailsafe.safeGetElement('messagesContainer');
            if (messagesContainer) {
                const chatPanel = UIFailsafe.safeQuerySelector('.chat-panel');
                if (chatPanel) {
                    const header = chatPanel.querySelector('.chat-header');
                    const searchBar = chatPanel.querySelector('.chat-search-bar');
                    const inputArea = chatPanel.querySelector('.input-area');
                    
                    let height = chatPanel.clientHeight;
                    if (header) height -= header.clientHeight;
                    if (searchBar?.classList.contains('active')) height -= searchBar.clientHeight;
                    if (inputArea) height -= inputArea.clientHeight;
                    
                    UIFailsafe.safeSetStyle(messagesContainer, 'height', Math.max(200, height) + 'px');
                }
            }
        },

        showNotification(message, type = 'success') {
            UIRenderer.showNotification(message, type);
        }
    }.init();

    // =============================================
    // UI INITIALIZATION (PASSIVE UNTIL ACTIVE)
    // =============================================
    function initializeUI() {
        _ensureStatusIndicators();
        _removeLoadingOverlays();
        
        // Subscribe to core data events to re-render UI when real data arrives
        const setupCoreSubscriptions = () => {
            const core = getMessagesCore();
            if (!core) return false;
            
            // Listen for conversations updated (from real backend or demo)
            window.addEventListener('conversationsUpdated', (e) => {
                const conversations = e.detail?.conversations || core.getConversations?.() || [];
                if (UIRenderer._canRender()) {
                    const currentChat = core.getCurrentConversation?.();
                    const drafts = core.UI?.getDraft ? {} : {};
                    UIRenderer.renderChatsList(conversations, currentChat, 'all', drafts);
                }
            });
            
            // Listen for friends updated
            window.addEventListener('friendsUpdated', (e) => {
                const friends = e.detail?.friends || core.getFriends?.() || [];
                if (UIRenderer._canRender()) {
                    UIRenderer.renderContactsList(friends);
                }
            });
            
            // Subscribe to ChatManager via core subscribers
            if (core.ChatManager && core.ChatManager.subscribe) {
                core.ChatManager.subscribe((conversations, activeChat, messages) => {
                    if (UIRenderer._canRender()) {
                        UIRenderer.renderChatsList(conversations || [], activeChat, 'all', {});
                        if (activeChat && messages) {
                            const user = core.getCurrentUser?.();
                            UIRenderer.renderMessages(messages, activeChat, user);
                        }
                    }
                });
            }
            
            // Subscribe to FriendManager via core subscribers  
            if (core.FriendManager && core.FriendManager.subscribe) {
                core.FriendManager.subscribe((friends) => {
                    if (UIRenderer._canRender()) {
                        UIRenderer.renderContactsList(friends || []);
                    }
                });
            }
            
            return true;
        };
        
        let checkCount = 0;
        const checkCore = setInterval(() => {
            checkCount++;
            const lifecycleState = UIFailsafe.getLifecycleState();
            const hasValidSession = UIFailsafe.hasValidSession();
            
            console.log('[UI] CheckCore:', { lifecycleState, hasValidSession, checkCount });
            
            if ((lifecycleState === LIFECYCLE_STATES.ACTIVE && hasValidSession) || hasValidSession) {
                clearInterval(checkCore);
                
                // Setup core subscriptions now that core is ready
                setupCoreSubscriptions();
                
                setTimeout(() => {
                    const core = getMessagesCore();
                    UIFailsafe.queueAction(() => {
                        if (core?.initEmojiPicker) {
                            core.initEmojiPicker();
                        }
                        
                        if (core?.loadUserSettings) {
                            core.loadUserSettings();
                        }
                        
                        if (core?.loadChatThemes) {
                            core.loadChatThemes();
                        }
                        
                        if (core?.loadMessageDrafts) {
                            core.loadMessageDrafts();
                        }
                        
                        if (core?.loadScheduledMessages) {
                            core.loadScheduledMessages();
                        }
                        
                        if (core?.loadOfflineQueue) {
                            core.loadOfflineQueue();
                        }
                        
                        if (core?.setupScrollDetection) {
                            core.setupScrollDetection();
                        }

                        if (core?.startBackgroundSync) {
                            core.startBackgroundSync();
                        }

                        if (core) {
                            core.renderChatsList?.();
                            core.renderContactsList?.();
                        }
                        
                        // Immediately render any existing conversations from core
                        if (core) {
                            const conversations = core.getConversations?.() || [];
                            const friends = core.getFriends?.() || [];
                            if (conversations.length > 0 && UIRenderer._canRender()) {
                                UIRenderer.renderChatsList(conversations, core.getCurrentConversation?.(), 'all', {});
                            }
                            if (friends.length > 0 && UIRenderer._canRender()) {
                                UIRenderer.renderContactsList(friends);
                            }
                        }
                        
                        UIStateManager._initializeActiveUI();
                    });
                }, 0);
            } else if (hasValidSession) {
                console.log('[UI] Force enabling UI - valid session detected');
                UIFailsafe.forceEnableUI();
                clearInterval(checkCore);
                setupCoreSubscriptions();
                const core = getMessagesCore();
                if (core && core.fetchConversations) {
                    core.fetchConversations();
                }
                if (core && core.FriendManager && core.FriendManager.fetchFriends) {
                    core.FriendManager.fetchFriends();
                }
            } else if (lifecycleState === LIFECYCLE_STATES.WAIT_PARENT) {
                const waitParentElements = UIFailsafe.safeQuerySelectorAll('.wait-parent-state, .connecting-overlay, .connection-waiting');
                UIFailsafe.safeForEach(waitParentElements, (el) => {
                    if (el && el.remove) el.remove();
                });
            } else if (lifecycleState === LIFECYCLE_STATES.WAITING_AUTH) {
                const statusEl = UIFailsafe.safeGetElement('sessionStatus');
                if (statusEl && statusEl.style.display !== 'block') {
                    UIFailsafe.safeSetText(statusEl, 'Waiting for authentication...');
                    UIFailsafe.safeSetStyle(statusEl, 'display', 'block');
                }
            }
            
            if (checkCount > 20) {
                if (UIFailsafe.hasValidSession()) {
                    console.log('[UI] Timeout but session valid - forcing UI enable');
                    UIFailsafe.forceEnableUI();
                    setupCoreSubscriptions();
                } else {
                    console.log('[UI] Timeout - no session, showing fallback');
                    _updateFallbackUI();
                }
                clearInterval(checkCore);
            }
        }, 500);

        setTimeout(() => {
            if (UIFailsafe.hasValidSession() && UIStateManager.getState('sessionValid') !== true) {
                console.log('[UI] 3s timeout - forcing UI enable');
                UIFailsafe.forceEnableUI();
                const core = getMessagesCore();
                if (core && core.fetchConversations) {
                    core.fetchConversations();
                }
            }
        }, 3000);
    }

    function _ensureStatusIndicators() {
        if (!UIFailsafe.safeGetElement('handshakeStatus')) {
            const statusDiv = document.createElement('div');
            statusDiv.id = 'handshakeStatus';
            statusDiv.className = 'handshake-status';
            statusDiv.style.display = 'none';
            document.body.appendChild(statusDiv);
        }
        
        if (!UIFailsafe.safeGetElement('sessionStatus')) {
            const statusDiv = document.createElement('div');
            statusDiv.id = 'sessionStatus';
            statusDiv.className = 'session-status';
            statusDiv.style.display = 'none';
            document.body.appendChild(statusDiv);
        }
        
        if (!UIFailsafe.safeGetElement('recoveryIndicator')) {
            const indicator = document.createElement('div');
            indicator.id = 'recoveryIndicator';
            indicator.className = 'recovery-indicator';
            indicator.style.display = 'none';
            indicator.innerHTML = '<div class="background-fetch-spinner"></div><span>Recovering...</span>';
            document.body.appendChild(indicator);
        }
        
        if (!UIFailsafe.safeGetElement('lifecycleStatus')) {
            const lifecycleDiv = document.createElement('div');
            lifecycleDiv.id = 'lifecycleStatus';
            lifecycleDiv.className = 'lifecycle-status';
            lifecycleDiv.style.display = 'none';
            document.body.appendChild(lifecycleDiv);
        }
    }

    function _removeLoadingOverlays() {
        const loadingOverlays = UIFailsafe.safeQuerySelectorAll('.loading-overlay, .initial-loading, .splash-screen');
        UIFailsafe.safeForEach(loadingOverlays, (overlay) => {
            UIFailsafe.safeSetStyle(overlay, 'display', 'none');
            overlay.remove();
        });
        
        const loadingElements = UIFailsafe.safeQuerySelectorAll('.loading-state, .loading-spinner');
        UIFailsafe.safeForEach(loadingElements, (el) => {
            if (el.closest('#chatsList') || el.closest('#messagesContainer')) {
                UIFailsafe.safeSetStyle(el, 'opacity', '0.5');
            }
        });
        
        const waitParentElements = UIFailsafe.safeQuerySelectorAll('.wait-parent-state');
        UIFailsafe.safeForEach(waitParentElements, (el) => {
            if (el && el.remove) {
                el.remove();
            }
        });
        
        const waitingAuthElements = UIFailsafe.safeQuerySelectorAll('.waiting-auth-state');
        UIFailsafe.safeForEach(waitingAuthElements, (el) => {
            if (el && el.remove) {
                el.remove();
            }
        });
    }

    function _updateFallbackUI() {
        const chatsList = UIFailsafe.safeGetElement('chatsList');
        if (chatsList && chatsList.children.length === 0) {
            UIFailsafe.safeSetHTML(chatsList, `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle empty-icon"></i>
                    <div class="empty-title">Connection issue</div>
                    <div class="empty-message">Waiting for connection...</div>
                    <div class="empty-submessage">This should resolve automatically</div>
                </div>
            `);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initializeUI, 50);
        });
    } else {
        setTimeout(initializeUI, 50);
    }

    window.addEventListener('beforeunload', () => {
        const core = getMessagesCore();
        if (core && core.saveUIState) {
            core.saveUIState();
        }
        
        if (UIRenderer.notificationTimeout) {
            clearTimeout(UIRenderer.notificationTimeout);
        }
    });

    const messagesUI = {
        version: VERSION,
        UIStateManager,
        UIRenderer,
        UIEventHandlers,
        UIFailsafe,
        LIFECYCLE_STATES,
        
        getUIState: (key) => UIStateManager.getState(key),
        setUIState: (key, value) => UIStateManager.setState(key, value),
        toggleUIState: (key) => UIStateManager.toggleState(key),
        subscribeToUI: (key, callback) => UIStateManager.subscribe(key, callback),
        getFullUIState: () => UIStateManager.getFullState(),
        
        showNotification: UIRenderer.showNotification.bind(UIRenderer),
        
        renderMultiSendChats: UIRenderer.renderMultiSendChats.bind(UIRenderer),
        updateSelectedCount: UIRenderer.updateSelectedCount.bind(UIRenderer),
        
        openThread: UIRenderer.openThread.bind(UIRenderer),
        closeThread: UIRenderer.closeThread.bind(UIRenderer),
        
        showMessageActions: UIRenderer.showMessageActions.bind(UIRenderer),
        hideMessageActions: UIRenderer.hideMessageActions.bind(UIRenderer),
        handleMessageAction: UIRenderer.handleMessageAction.bind(UIRenderer),
        
        getConnectionQuality: () => UIStateManager.getState('connectionQuality'),
        isRecoveryMode: () => UIStateManager.getState('recoveryMode'),
        isOfflineMode: () => UIStateManager.getState('offlineMode'),
        isParentReady: () => UIStateManager.getState('parentReady'),
        getLifecycleState: () => UIStateManager.getState('lifecycleState'),
        hasValidSession: () => UIStateManager.getState('sessionValid'),
        
        MESSAGE_TYPES: getMessagesCore()?.MESSAGE_TYPES || {},
        
        // Helper to force sync with core
        forceSyncWithCore: () => UIStateManager._forceSyncSessionState(),
        
        // Helper to get core instance
        getCore: getMessagesCore,
        
        // Helper to open chat programmatically
        openChat: (chat) => {
            const core = getMessagesCore();
            if (core && core.openConversation) {
                core.openConversation(chat.id || chat);
            }
        },
        
        // Helper to load chat by friend ID
        loadChatByFriendId: (friendId) => {
            const core = getMessagesCore();
            if (core && core.createConversation) {
                core.createConversation([parseInt(friendId)]);
            }
        },
        
        // Helper to view media
        viewMedia: (url, name) => {
            const viewer = document.getElementById('mediaViewer');
            const img = document.getElementById('mediaViewerImage');
            const fileName = document.getElementById('mediaFileName');
            if (viewer && img) {
                img.src = url;
                if (fileName) fileName.textContent = name || 'Media';
                viewer.classList.add('active');
            }
        },
        
        // Helper to close media viewer
        closeMediaViewer: () => {
            const viewer = document.getElementById('mediaViewer');
            if (viewer) viewer.classList.remove('active');
        },
        
        // Helper to play video
        playVideo: (url) => {
            window.open(url, '_blank');
        },
        
        // Helper to download file
        downloadFile: (url, name) => {
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        },
        
        // Helper to open location
        openLocation: (lat, lng) => {
            window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
        },
        
        // Helper to play audio
        playAudio: (id, url, duration) => {
            const audio = new Audio(url);
            audio.play();
            const btn = document.querySelector(`#waveform-${id}`).parentElement.querySelector('.audio-play-btn i');
            if (btn) {
                btn.classList.remove('fa-play');
                btn.classList.add('fa-pause');
            }
            audio.onended = () => {
                if (btn) {
                    btn.classList.remove('fa-pause');
                    btn.classList.add('fa-play');
                }
            };
        },
        
        // Helper to vote in poll
        voteInPoll: (messageId, optionIndex) => {
            const core = getMessagesCore();
            if (core && core.addReaction) {
                core.addReaction(messageId, `poll_${optionIndex}`, true);
            }
        },
        
        // Helper to save edited message
        saveEditedMessage: (messageId) => {
            const input = document.querySelector(`#editMessageInput_${messageId}`);
            if (input) {
                const newContent = input.value;
                const core = getMessagesCore();
                if (core && core.editMessage) {
                    core.editMessage(messageId, newContent);
                }
            }
        },
        
        // Helper to cancel edit
        cancelEditMessage: () => {
            // Reload messages to revert
            const core = getMessagesCore();
            if (core && core.fetchMessages) {
                const currentChat = core.getCurrentConversation();
                if (currentChat) {
                    core.fetchMessages(currentChat.id);
                }
            }
        }
    };

    window.messagesUI = messagesUI;
    
    // Add media viewer close handler
    const closeMediaViewer = document.getElementById('closeMediaViewer');
    if (closeMediaViewer) {
        closeMediaViewer.addEventListener('click', () => {
            const viewer = document.getElementById('mediaViewer');
            if (viewer) viewer.classList.remove('active');
        });
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = messagesUI;
    }
})();