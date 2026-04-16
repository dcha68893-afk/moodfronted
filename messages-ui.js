// =============================================
// MESSAGES-UI.js - HARDENED PRODUCTION UI ENGINE v4.3.5
// FIXED: Duplicate function declarations removed
// FIXED: Properly syncs with MessagesCore (capital M)
// FIXED: Session state synchronization
// FIXED: Lifecycle state detection
// FIXED: Chat panel display and message input box
// ADDED: Auto-open chat event handler for external messages
// =============================================

(function() {
    'use strict';

    // =============================================
    // CONSTANTS & CONFIGURATION
    // =============================================
    const VERSION = '4.3.5';
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

    function ensureSafeArray(data) {
        if (typeof window.safeArray === 'function') return window.safeArray(data);
        return Array.isArray(data) ? data : [];
    }

    function ensureSafeObject(data) {
        if (typeof window.safeObject === 'function') return window.safeObject(data);
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    }

    function sanitizeHTML(html) {
        if (typeof html !== 'string') return '';
        return html
            .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
            .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
            .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/data:text\/html/gi, '');
    }

    // =============================================
    // GET CORE REFERENCE (WORKS WITH BOTH CASES)
    // =============================================
    function getMessagesCore() {
        if (window.MessagesCore && typeof window.MessagesCore === 'object') {
            return window.MessagesCore;
        }
        if (window.messagesCore && typeof window.messagesCore === 'object') {
            return window.messagesCore;
        }
        return null;
    }

    // Helper function to get current user ID
    function getCurrentUserId() {
        const core = getMessagesCore();
        if (core && core.getCurrentUserId) {
            return core.getCurrentUserId();
        }
        if (core && core.SessionManager && core.SessionManager.getCurrentUserId) {
            return core.SessionManager.getCurrentUserId();
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
        _hasTriggeredInitialDataFetch: false,
        _pendingFetchTimer: null,
        _lastDataFetchAt: 0,
        
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
                element.innerHTML = sanitizeHTML(html);
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
        
        isSessionValid() {
            const core = this._getCore();
            if (core && core.isAuthenticated) {
                return core.isAuthenticated();
            }
            return false;
        },
        
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
            
            if (this.isCoreReady()) {
                return LIFECYCLE_STATES.ACTIVE;
            }
            
            return 'UNKNOWN';
        },
        
        hasValidSession() {
            const core = this._getCore();
            
            if (core && core.isAuthenticated && core.isAuthenticated()) {
                this._cachedCoreSessionValid = true;
                return true;
            }
            
            if (core && core.SessionManager && core.SessionManager.isAuthenticated?.()) {
                this._cachedCoreSessionValid = true;
                return true;
            }
            
            const coreState = core?.getState?.();
            if (coreState && coreState.hasValidSession === true) {
                this._cachedCoreSessionValid = true;
                return true;
            }
            
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
                const directUserId = core.getCurrentUserId?.();
                if (directUserId && typeof directUserId === 'number' && directUserId !== 0) {
                    isValid = true;
                    userId = directUserId;
                }
            }
            
            if (userId && (typeof userId !== 'number' || userId === 0)) {
                isValid = false;
            }
            
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
            const now = Date.now();

            if (this._pendingFetchTimer) {
                return;
            }
            if (this._hasTriggeredInitialDataFetch && (now - this._lastDataFetchAt) < 15000) {
                return;
            }
            
            const coreState = core?.getState?.();
            const coreIsActive = coreState?.state === 'ACTIVE';
            
            if (!coreIsActive) {
                console.log('[messagesUI] Core not ACTIVE yet, scheduling retry for data fetch');
                this._pendingFetchTimer = setTimeout(() => {
                    this._pendingFetchTimer = null;
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
            this._hasTriggeredInitialDataFetch = true;
            this._lastDataFetchAt = now;
            
            if (core && core.fetchConversations) {
                console.log('[messagesUI] Triggering real data fetch from backend');
                core.fetchConversations();
            }
            if (core && core.FriendManager && core.FriendManager.fetchFriends) {
                core.FriendManager.fetchFriends().then(() => {
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

                        // Force immediate re-render of the messages container
                        // if the incoming message belongs to the active chat
                        const core = getMessagesCore();
                        const activeChat = core?.getCurrentConversation?.() || core?.ChatManager?.getActiveChat?.();
                        const incomingChatId = e.detail.message.chatId || e.detail.message.conversationId;
                        if (activeChat && String(activeChat.id) === String(incomingChatId)) {
                            const messages    = core?.getMessages?.() || [];
                            const currentUser = core?.getCurrentUser?.();
                            UIRenderer.renderMessages(messages, activeChat, currentUser);
                        }
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
                    this._forceSyncSessionState();
                    
                    const lifecycleState = UIFailsafe.getLifecycleState();
                    if (lifecycleState !== this.state.lifecycleState && lifecycleState !== 'UNKNOWN') {
                        this.state.lifecycleState = lifecycleState;
                        this._notifyListeners('lifecycleState', lifecycleState);
                        this._updateLifecycleUI(lifecycleState);
                    } else if (lifecycleState === 'UNKNOWN' && this.state.coreSessionValid) {
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
            }, 2000);
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
                    UIFailsafe.safeSetStyle(indicator, 'display', 'none');
                } else {
                    UIFailsafe.safeAddClass(indicator, 'authenticating');
                    UIFailsafe.safeSetText(text, 'Connecting...');
                    UIFailsafe.safeSetStyle(indicator, 'display', 'none');
                }
            }
        },

        _updateConnectionUI(ready, quality) {
            const tokenStatus = UIFailsafe.safeGetElement('tokenStatus');
            if (tokenStatus) {
                UIFailsafe.safeSetStyle(tokenStatus, 'display', 'none');
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

    function updateChatHeader(chat) {
        const nameEl = document.getElementById('chatFriendName');
        const avatarEl = document.getElementById('chatFriendAvatar');
        const statusEl = document.getElementById('chatStatusText');
        const indicatorEl = document.getElementById('chatStatusIndicator');
        
        if (nameEl) {
            nameEl.textContent = chat.friendName || chat.name || 'User';
        }
        if (statusEl) {
            const core = getMessagesCore();
            if (core && core.formatLastSeen) {
                statusEl.textContent = core.formatLastSeen(chat.lastSeen || null, !!chat.online);
            } else {
                statusEl.textContent = chat.online ? 'Active now' : 'Offline';
            }
        }
        if (indicatorEl) {
            indicatorEl.className = `chat-status ${chat.online ? 'online' : 'offline'}`;
        }
        
        if (avatarEl) {
            avatarEl.innerHTML = '';
            
            let avatarUrl = chat.friendAvatar || chat.avatar;
            
            if (!avatarUrl && window.currentUser && window.currentUser.avatar) {
                avatarUrl = window.currentUser.avatar;
            }
            
            if (!avatarUrl && window.__CHILD_SESSION__ && window.__CHILD_SESSION__.user) {
                avatarUrl = window.__CHILD_SESSION__.user.avatar || window.__CHILD_SESSION__.user.photoURL;
            }
            
            if (avatarUrl) {
                const img = document.createElement('img');
                img.src = avatarUrl;
                img.alt = chat.friendName || 'User';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '50%';
                img.onerror = () => {
                    avatarEl.innerHTML = `<i class="fas fa-user"></i>`;
                    if (indicatorEl) avatarEl.appendChild(indicatorEl);
                };
                avatarEl.appendChild(img);
            } else {
                const name = chat.friendName || chat.name || 'U';
                const initial = name.charAt(0).toUpperCase();
                avatarEl.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea,#764ba2);color:white;font-weight:bold;font-size:18px;">${initial}</div>`;
            }
            
            if (indicatorEl) avatarEl.appendChild(indicatorEl);
        }
    }

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
                    const chats = e.detail?.conversations || e.detail?.chats || [];
                    this.renderChatsList(chats, e.detail?.currentChat, e.detail?.currentCategory, e.detail?.messageDrafts);
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
            const coreHasSession = UIFailsafe.hasValidSession();
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
            const normalizedMessages = ensureSafeArray(messages);
            const currentChatId = currentChat?.id ? String(currentChat.id) : '';
            const renderSignature = `${currentChatId}|${normalizedMessages.length}|${normalizedMessages.map(m => `${m.id}:${m.status || ''}:${m.timestamp || m.createdAt || ''}`).join(',')}`;

            if (!this._canRender()) {
                if (currentChat && normalizedMessages.length > 0) {
                    const groupedMessages = this._groupMessagesByDate(normalizedMessages);
                    if (this._lastRenderedMessagesSignature !== renderSignature) {
                        container.innerHTML = '';
                        this._renderMessageBatches(container, groupedMessages, currentUser);
                        this._lastRenderedMessagesSignature = renderSignature;
                    }
                    return;
                }
                UIFailsafe.safeSetHTML(container, this._getPassiveLoadingState());
                return;
            }

            if (!currentChat) {
                container.innerHTML = '';
                this._lastRenderedMessagesSignature = null;
                UIFailsafe.safeSetHTML(container, this._getEmptyChatHTML());
                return;
            }

            if (normalizedMessages.length === 0) {
                container.innerHTML = '';
                this._lastRenderedMessagesSignature = `${currentChatId}|empty`;
                UIFailsafe.safeSetHTML(container, this._getEmptyMessagesHTML(currentChat));
                return;
            }

            if (this._lastRenderedMessagesSignature === renderSignature) {
                return;
            }

            container.innerHTML = '';
            const groupedMessages = this._groupMessagesByDate(normalizedMessages);
            this._renderMessageBatches(container, groupedMessages, currentUser);
            this._lastRenderedMessagesSignature = renderSignature;
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
            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();
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
            // Use createdAt first (set at send time for sender, server time for receiver)
            const msgTs = message.createdAt || message.timestamp || Date.now();
            const time = core?.formatTime ? 
                core.formatTime(msgTs) : 
                new Date(msgTs).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:true});
            
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
            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();
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
            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();
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
            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();
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
            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();
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
            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();
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
            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();
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
            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();
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
            const normalizedChats = ensureSafeArray(chats);
            const normalizedCategory = ['all', 'unread', 'archived', 'blocked', 'notes'].includes(category) ? category : 'all';
            const normalizedDrafts = ensureSafeObject(messageDrafts);

            if (!this._canRender()) {
                if (normalizedChats.length > 0) {
                    // Allow cached sidebar data to remain visible before ACTIVE to avoid flash-to-empty.
                } else {
                    UIFailsafe.safeSetHTML(container, this._getPassiveLoadingState());
                    return;
                }
            }

            if (!this._canRender() && normalizedChats.length === 0) {
                UIFailsafe.safeSetHTML(container, this._getPassiveLoadingState());
                return;
            }

            if (normalizedChats.length === 0) {
                UIFailsafe.safeSetHTML(container, `
                    <div class="empty-state">
                        <i class="fas fa-comments empty-icon"></i>
                        <div class="empty-title">No chats yet</div>
                        <div class="empty-message">Start a new conversation by clicking the + button</div>
                    </div>
                `);
                return;
            }

            let filteredChats = normalizedChats;
            if (normalizedCategory === 'unread') {
                filteredChats = normalizedChats.filter(c => (Number(c?.unreadCount) || 0) > 0);
            } else if (normalizedCategory === 'archived') {
                filteredChats = normalizedChats.filter(c => !!c?.archived);
            } else if (normalizedCategory === 'blocked') {
                filteredChats = normalizedChats.filter(c => !!c?.blocked);
            } else if (normalizedCategory === 'notes') {
                filteredChats = normalizedChats.filter(c => c?.type === 'note');
            } else {
                filteredChats = normalizedChats.filter(c => !c?.archived && !c?.blocked);
            }

            filteredChats.sort((a, b) => {
                return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
            });

            let html = '';
            filteredChats.forEach(chat => {
                const hasDraft = normalizedDrafts && normalizedDrafts[chat.id];
                const isSelected = currentChat?.id === chat.id;
                const unreadCount = Number(chat?.unreadCount) || 0;
                const unreadBadge = unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : '';
                const draftBadge = hasDraft ? '<span class="draft-badge">Draft</span>' : '';
                const status = chat.online ? 'online' : 'offline';
                const core = getMessagesCore();
                // Robust time: handle string ISO, number ms, or missing
                const _rawTs = chat.lastMessageAt;
                let _parsedTs = 0;
                if (_rawTs) {
                    _parsedTs = typeof _rawTs === 'number' ? _rawTs : new Date(_rawTs).getTime();
                    if (isNaN(_parsedTs)) _parsedTs = 0;
                }
                const time = _parsedTs > 0
                    ? (core?.formatTime ? core.formatTime(_parsedTs) : new Date(_parsedTs).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))
                    : '';
                
                const _rawLast = (chat.lastMessage || '').trim();
                const _words = _rawLast.split(/\s+/).filter(Boolean);
                const lastMsgDisplay = _words.length > 8
                    ? _words.slice(0, 8).join(' ') + '...'
                    : _rawLast;
                
                const safeChat = JSON.stringify(chat).replace(/"/g, '&quot;');
                
                const avatarSrc = chat.friendAvatar || chat.avatar || chat.photoURL || '';
                const avatarInitial = (chat.friendName || 'U').charAt(0).toUpperCase();
                const avatarHtml = avatarSrc
                    ? `<img class="avatar-photo" src="${avatarSrc}" alt="${chat.friendName || 'User'}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none;width:100%;height:100%;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;align-items:center;justify-content:center;font-weight:700;font-size:17px;border-radius:50%;">${avatarInitial}</span>`
                    : `<span style="width:100%;height:100%;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;border-radius:50%;">${avatarInitial}</span>`;
                html += `
                    <div class="chat-item ${isSelected ? 'selected' : ''}" data-chat-id="${chat.id}" onclick="window.messagesUI?.openChat(${safeChat})">
                        <div class="chat-avatar" style="overflow:hidden;">
                            ${avatarHtml}
                            <div class="chat-status ${status}"></div>
                        </div>
                        <div class="chat-info">
                            <div class="chat-name-row">
                                <span class="chat-name">${chat.friendName || 'User'}</span>
                                <span class="chat-time">${time}</span>
                            </div>
                            <div class="chat-last-message">
                                <span class="last-message-text">${lastMsgDisplay}</span>
                                ${draftBadge}
                                ${unreadBadge}
                            </div>
                            ${chat.typing ? '<div class="chat-typing">typing...</div>' : ''}
                        </div>
                    </div>
                `;
            });

            UIFailsafe.safeSetHTML(container, html);
            this._updateCategoryBadges(normalizedChats);
        },

        _updateCategoryBadges(chats) {
            const normalizedChats = ensureSafeArray(chats);
            const allBadge = UIFailsafe.safeGetElement('allBadge');
            const unreadBadge = UIFailsafe.safeGetElement('unreadBadge');
            const archivedBadge = UIFailsafe.safeGetElement('archivedBadge');
            const blockedBadge = UIFailsafe.safeGetElement('blockedBadge');
            const notesBadge = UIFailsafe.safeGetElement('notesBadge');

            if (allBadge) UIFailsafe.safeSetText(allBadge, normalizedChats.filter(c => !c?.archived && !c?.blocked).length);
            if (unreadBadge) UIFailsafe.safeSetText(unreadBadge, normalizedChats.filter(c => (Number(c?.unreadCount) || 0) > 0).length);
            if (archivedBadge) UIFailsafe.safeSetText(archivedBadge, normalizedChats.filter(c => !!c?.archived).length);
            if (blockedBadge) UIFailsafe.safeSetText(blockedBadge, normalizedChats.filter(c => !!c?.blocked).length);
            if (notesBadge) UIFailsafe.safeSetText(notesBadge, normalizedChats.filter(c => c?.type === 'note').length);
        },

        renderContactsList(contacts) {
            const container = UIFailsafe.safeGetElement('contactsList');
            if (!container) return;

            if (!contacts || contacts.length === 0) {
                const core = getMessagesCore();
                const coreFriends = core?.getFriends?.() || [];
                if (coreFriends.length > 0) {
                    contacts = coreFriends;
                } else {
                    UIFailsafe.safeSetHTML(container, `
                        <div class="empty-state" style="padding:32px 16px;text-align:center;">
                            <i class="fas fa-user-friends" style="font-size:40px;color:#d1d5db;margin-bottom:12px;display:block;"></i>
                            <div style="font-weight:600;color:#374151;margin-bottom:6px;">No friends yet</div>
                            <div style="font-size:13px;color:#9ca3af;">Go to the Friends tab to add people</div>
                        </div>
                    `);
                    return;
                }
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
            const displayName = contact.displayName || contact.username || contact.name || 'User';
            const avatarUrl = contact.avatar || contact.photoURL || contact.avatarUrl || '';
            const initials = displayName.charAt(0).toUpperCase();
            
            const escapedName = displayName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            
            return `
                <div class="contact-item" data-contact-id="${contact.id}" data-contact-name="${escapedName}"
                     style="cursor:pointer; display:flex; align-items:center; padding:12px 16px; gap:12px; border-bottom:1px solid rgba(0,0,0,0.05);"
                     onclick="window.messagesUI?.loadChatByFriendId('${contact.id}', '${escapedName}')">
                    <div class="contact-avatar" style="position:relative; flex-shrink:0;">
                        ${avatarUrl
                            ? `<img src="${avatarUrl}" alt="${displayName}" loading="lazy" 
                                style="width:42px;height:42px;border-radius:50%;object-fit:cover;"
                                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                               <div style="display:none;width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);color:white;align-items:center;justify-content:center;font-weight:bold;font-size:16px;">${initials}</div>`
                            : `<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:16px;">${initials}</div>`
                        }
                        <div class="contact-status ${status}" 
                             style="position:absolute;bottom:1px;right:1px;width:11px;height:11px;border-radius:50%;border:2px solid white;background:${contact.online ? '#10b981' : '#9ca3af'};"></div>
                    </div>
                    <div class="contact-info" style="flex:1;min-width:0;">
                        <div class="contact-name" style="font-weight:600;font-size:14px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${displayName}</div>
                        <div class="contact-status-text" style="font-size:12px;color:${contact.online ? '#10b981' : '#9ca3af'};">${statusText}</div>
                    </div>
                    <button style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;white-space:nowrap;"
                            onclick="event.stopPropagation();window.messagesUI?.loadChatByFriendId('${contact.id}', '${escapedName}')">
                        Chat
                    </button>
                </div>
            `;
        },

        _updateChatHeader(chat) {
            const nameEl = UIFailsafe.safeGetElement('chatFriendName');
            const avatarEl = UIFailsafe.safeGetElement('chatFriendAvatar');
            const statusEl = UIFailsafe.safeGetElement('chatStatusText');
            const indicatorEl = UIFailsafe.safeGetElement('chatStatusIndicator');

            if (nameEl) UIFailsafe.safeSetText(nameEl, chat.friendName || 'User');
            // Use real online status from FriendManager if available
            const _core = getMessagesCore();
            let _isOnline = !!chat.online;
            if (_core && _core.FriendManager) {
                const _fid = chat.friendId || chat.userId || chat.otherUserId;
                if (_fid) {
                    const _friend = _core.FriendManager.getFriend(_fid) || _core.FriendManager.getFriend(parseInt(_fid));
                    if (_friend) _isOnline = !!_friend.online;
                }
            }
            if (statusEl) {
                if (_core && _core.formatLastSeen) {
                    UIFailsafe.safeSetText(statusEl, _core.formatLastSeen(chat.lastSeen || null, _isOnline));
                } else {
                    UIFailsafe.safeSetText(statusEl, _isOnline ? 'Active now' : 'Offline');
                }
            }
            if (indicatorEl) UIFailsafe.safeSetAttribute(indicatorEl, 'class', `chat-status ${_isOnline ? 'online' : 'offline'}`);
            
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
            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();
            
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

            if (!chats || chats.length === 0) {
                UIFailsafe.safeSetHTML(container, `
                    <div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;">
                        <i class="fas fa-comments" style="font-size:32px;display:block;margin-bottom:8px;"></i>
                        No chats yet — start a conversation first
                    </div>
                `);
                return;
            }

            let html = '';
            chats.forEach(chat => {
                const core = getMessagesCore();
                const selectedSet = core?.multiSendSelectedChats;
                const isSelected = selectedSet instanceof Set ? selectedSet.has(chat.id) : false;
                const name = chat.friendName || chat.name || 'Chat';
                const lastMsg = chat.lastMessage || '';
                const avatarUrl = chat.friendAvatar || chat.avatar || '';
                const initials = name.charAt(0).toUpperCase();
                
                html += `
                    <div class="chat-item ${isSelected ? 'selected' : ''}" data-chat-id="${chat.id}"
                         style="display:flex;align-items:center;padding:10px 14px;gap:10px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.05);${isSelected ? 'background:rgba(102,126,234,0.08);' : ''}"
                         onclick="window.messagesUI?.toggleMultiSendItem('${chat.id}', this)">
                        <input type="checkbox" class="multi-send-checkbox" ${isSelected ? 'checked' : ''}
                               style="width:18px;height:18px;flex-shrink:0;cursor:pointer;accent-color:#667eea;"
                               onclick="event.stopPropagation()"
                               onchange="window.messagesUI?.toggleMultiSendItem('${chat.id}', this.closest('.chat-item'))">
                        <div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;overflow:hidden;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">
                            ${avatarUrl
                                ? `<img src="${avatarUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.textContent='${initials}'">`
                                : initials
                            }
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:600;font-size:13px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
                            ${lastMsg ? `<div style="font-size:12px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${lastMsg}</div>` : ''}
                        </div>
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
                const selectedSet = core?.multiSendSelectedChats;
                const count = selectedSet instanceof Set ? selectedSet.size : 0;
                UIFailsafe.safeSetText(countEl, `${count} selected`);
            }
        }
    }.init();

    // =============================================
    // CALL BUTTON HANDLERS (COMPLETE REAL IMPLEMENTATION)
    // =============================================

    function setupCallHandlers() {
        const voiceCallBtn = document.getElementById('voiceCallBtn');
        const videoCallBtn = document.getElementById('videoCallBtn');
        
        if (!voiceCallBtn && !videoCallBtn) {
            console.log('[CallHandler] Call buttons not found in DOM');
            return;
        }
        
        function getActiveChatInfo() {
            const core = getMessagesCore();
            if (!core) return null;
            
            let activeChat = core.getCurrentConversation?.();
            
            if (!activeChat && core.ChatManager) {
                activeChat = core.ChatManager.getActiveChat?.();
            }
            
            if (!activeChat && window.__currentActiveChat) {
                activeChat = window.__currentActiveChat;
            }
            
            if (!activeChat) {
                const selectedChat = document.querySelector('.chat-item.selected');
                if (selectedChat && selectedChat.dataset.chatId) {
                    const chatId = selectedChat.dataset.chatId;
                    activeChat = core.getConversation?.(chatId);
                }
            }
            
            if (!activeChat) return null;
            
            const receiverId = activeChat.friendId || 
                              activeChat.pendingReceiverId || 
                              activeChat.otherUserId ||
                              activeChat.userId || 
                              activeChat.participantId ||
                              activeChat.id;
            
            const receiverName = activeChat.friendName || 
                                activeChat.name || 
                                activeChat.displayName || 
                                activeChat.userName || 
                                'User';
            
            const receiverAvatar = activeChat.friendAvatar || 
                                  activeChat.avatar || 
                                  activeChat.photoURL;
            
            if (!receiverId) return null;
            
            return { 
                receiverId: parseInt(receiverId), 
                receiverName, 
                receiverAvatar,
                chatId: activeChat.id 
            };
        }
        
        async function fetchUserDetails(userId) {
            try {
                const core = getMessagesCore();
                if (core && core.FriendManager) {
                    const friend = core.FriendManager.getFriend(userId);
                    if (friend) {
                        return {
                            name: friend.displayName || friend.username || friend.name,
                            avatar: friend.avatar || friend.photoURL
                        };
                    }
                }
            } catch (e) {
                console.warn('[CallHandler] Could not fetch user details:', e);
            }
            return { name: 'User', avatar: null };
        }
        
        async function initiateCall(callType) {
            if (window._callInProgress) {
                UIRenderer.showNotification('Call already in progress...', 'warning');
                return;
            }
            
            let info = getActiveChatInfo();
            
            if (!info) {
                await new Promise(resolve => setTimeout(resolve, 300));
                info = getActiveChatInfo();
                
                if (!info) {
                    UIRenderer.showNotification('Open a chat first before calling', 'warning');
                    return;
                }
            }
            
            window._callInProgress = true;
            if (voiceCallBtn) {
                voiceCallBtn.disabled = true;
                voiceCallBtn.classList.add('call-initiating');
            }
            if (videoCallBtn) {
                videoCallBtn.disabled = true;
                videoCallBtn.classList.add('call-initiating');
            }
            
            try {
                const userDetails = await fetchUserDetails(info.receiverId);
                const finalUserName = userDetails.name || info.receiverName;
                const finalUserAvatar = userDetails.avatar || info.receiverAvatar;
                
                window.__messageChatReturnUserId = info.receiverId;
                window.__messageChatReturnName = finalUserName;
                window.__messageChatReturnId = info.chatId;
                
                console.log(`[CallHandler] Initiating ${callType} call with:`, {
                    userId: info.receiverId,
                    userName: finalUserName,
                    chatId: info.chatId
                });
                
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'SWITCH_MODULE',
                        module: 'calls',
                        payload: {
                            userId: info.receiverId,
                            userName: finalUserName,
                            userAvatar: finalUserAvatar,
                            callType: callType,
                            returnTo: 'messages',
                            chatUserId: info.receiverId,
                            chatId: info.chatId,
                            source: 'messages-module',
                            timestamp: Date.now()
                        },
                        timestamp: Date.now()
                    }, '*');
                    
                    setTimeout(() => {
                        window.parent.postMessage({
                            type: 'INITIATE_CALL',
                            payload: {
                                userId: info.receiverId,
                                userName: finalUserName,
                                callType: callType,
                                source: 'messages'
                            }
                        }, '*');
                    }, 100);
                    
                    UIRenderer.showNotification(`Starting ${callType} call...`, 'info');
                    return;
                }
                
                const callUrl = `/calls.html?userId=${info.receiverId}&name=${encodeURIComponent(finalUserName)}&type=${callType}&returnTo=messages`;
                window.open(callUrl, '_blank');
                UIRenderer.showNotification(`Opening ${callType} call in new tab...`, 'info');
                
            } catch (error) {
                console.error('[CallHandler] Error initiating call:', error);
                UIRenderer.showNotification(`Failed to start ${callType} call: ${error.message}`, 'error');
            } finally {
                setTimeout(() => {
                    window._callInProgress = false;
                    if (voiceCallBtn) {
                        voiceCallBtn.disabled = false;
                        voiceCallBtn.classList.remove('call-initiating');
                    }
                    if (videoCallBtn) {
                        videoCallBtn.disabled = false;
                        videoCallBtn.classList.remove('call-initiating');
                    }
                }, 3000);
            }
        }
        
        if (voiceCallBtn) {
            const newVoiceBtn = voiceCallBtn.cloneNode(true);
            voiceCallBtn.parentNode?.replaceChild(newVoiceBtn, voiceCallBtn);
            
            newVoiceBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                initiateCall('voice');
            });
        }
        
        if (videoCallBtn) {
            const newVideoBtn = videoCallBtn.cloneNode(true);
            videoCallBtn.parentNode?.replaceChild(newVideoBtn, videoCallBtn);
            
            newVideoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                initiateCall('video');
            });
        }
        
        console.log('[CallHandler] Call handlers initialized');
    }

    // CALL RETURN HANDLER - re-opens the same chat after call ends
    function setupCallReturnHandler() {
        window.addEventListener('message', (event) => {
            const data = event.data || {};
            
            if (data.type === 'CALL_ENDED_RETURN' || data.type === 'CALL_ENDED') {
                console.log('[CallHandler] Call ended, returning to chat');
                
                const returnUserId = window.__messageChatReturnUserId;
                const returnChatId = window.__messageChatReturnId;
                const returnName = window.__messageChatReturnName;
                
                if (returnUserId && window.messagesUI?.loadChatByFriendId) {
                    setTimeout(() => {
                        window.messagesUI.loadChatByFriendId(returnUserId, returnName || '');
                    }, 300);
                } else if (returnChatId && window.messagesUI?.openChat) {
                    setTimeout(() => {
                        window.messagesUI.openChat({ id: returnChatId });
                    }, 300);
                }
                
                delete window.__messageChatReturnUserId;
                delete window.__messageChatReturnId;
                delete window.__messageChatReturnName;
            }
            
            if (data.type === 'INCOMING_CALL') {
                const { callerId, callerName, callType } = data.payload || {};
                console.log(`[CallHandler] Incoming ${callType} call from ${callerName || callerId}`);
                UIRenderer.showNotification(`Incoming ${callType} call from ${callerName || 'Someone'}...`, 'info');
            }
        });
        
        window.addEventListener('incomingCall', (event) => {
            const { callerId, callerName, callType } = event.detail || {};
            console.log(`[CallHandler] Incoming call via event:`, event.detail);
            UIRenderer.showNotification(`Incoming ${callType} call from ${callerName || callerId}`, 'info');
        });
    }

    // Call quality monitoring
    function setupCallQualityMonitoring() {
        let callActive = false;
        let qualityInterval = null;
        
        window.addEventListener('callStarted', () => {
            callActive = true;
            qualityInterval = setInterval(() => {
                if (callActive) {
                    const connection = navigator.connection;
                    if (connection) {
                        const downlink = connection.downlink || 0;
                        if (downlink < 1) {
                            UIRenderer.showNotification('Poor connection quality', 'warning');
                        }
                    }
                }
            }, 5000);
        });
        
        window.addEventListener('callEnded', () => {
            callActive = false;
            if (qualityInterval) {
                clearInterval(qualityInterval);
                qualityInterval = null;
            }
        });
    }

    // =============================================
    // MESSAGE ACTIONS MENU (FIXED)
    // =============================================

    let currentActionMessage = null;
    let actionMenuTimeout = null;

    function showMessageActions(message, x, y) {
        if (actionMenuTimeout) clearTimeout(actionMenuTimeout);

        const existingMenu = document.getElementById('dynamicMessageActions');
        if (existingMenu) existingMenu.remove();

        currentActionMessage = message;

        const currentUserId = getCurrentUserId();
        const isOwnMessage = message.senderId == currentUserId;

        const menu = document.createElement('div');
        menu.id = 'dynamicMessageActions';
        menu.className = 'message-actions-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: #fff;
            border-radius: 14px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.18);
            z-index: 10000;
            min-width: 200px;
            overflow: hidden;
            animation: _msgActFade 0.18s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;

        // Emoji quick-react row — only shown for received messages
        const emojiRow = !isOwnMessage ? `
            <div style="display:flex;align-items:center;justify-content:space-around;padding:8px 12px;border-bottom:1px solid #f0f0f0;">
                ${['❤️','👍','😂','😮','😢','🙏'].map(e => `
                    <span class="msg-quick-emoji" data-emoji="${e}" style="font-size:22px;cursor:pointer;padding:4px;border-radius:50%;transition:transform 0.15s;" title="React ${e}">${e}</span>
                `).join('')}
            </div>
        ` : '';

        const sep = `<div style="height:1px;background:#f0f0f0;margin:2px 0;"></div>`;

        const item = (action, icon, label, color = '#111') => `
            <div class="msg-menu-item" data-action="${action}" style="padding:11px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:background 0.15s;">
                <i class="${icon}" style="width:18px;color:${color};font-size:14px;"></i>
                <span style="font-size:14px;color:${color};">${label}</span>
            </div>`;

        menu.innerHTML = `
            ${emojiRow}
            <div style="padding:4px 0;">
                ${item('reply',   'fas fa-reply',       'Reply')}
                ${isOwnMessage ? item('edit', 'fas fa-edit', 'Edit') : ''}
                ${item('forward', 'fas fa-share',       'Forward')}
                ${item('copy',    'fas fa-copy',        'Copy')}
                ${sep}
                ${item('star',    'far fa-star',        'Star',   '#f59e0b')}
                ${item('info',    'fas fa-info-circle', 'Info',   '#6b7280')}
                ${!isOwnMessage ? item('report', 'fas fa-flag', 'Report', '#f97316') : ''}
                ${sep}
                ${item('delete',  'fas fa-trash',       isOwnMessage ? 'Delete' : 'Delete for me', '#ef4444')}
            </div>
        `;

        document.body.appendChild(menu);

        // Inject styles once
        if (!document.getElementById('_msgActStyles')) {
            const s = document.createElement('style');
            s.id = '_msgActStyles';
            s.textContent = `
                .msg-menu-item:hover { background: #f5f5f5; }
                .msg-quick-emoji:hover { transform: scale(1.3); background: #f0f0f0; }
                @keyframes _msgActFade {
                    from { opacity: 0; transform: scale(0.93) translateY(-4px); }
                    to   { opacity: 1; transform: scale(1)    translateY(0); }
                }
            `;
            document.head.appendChild(s);
        }

        // Reposition if out of viewport
        requestAnimationFrame(() => {
            const r = menu.getBoundingClientRect();
            if (r.right  > window.innerWidth)  menu.style.left = (window.innerWidth  - r.width  - 10) + 'px';
            if (r.bottom > window.innerHeight)  menu.style.top  = (window.innerHeight - r.height - 10) + 'px';
            if (parseFloat(menu.style.left) < 6) menu.style.left = '6px';
            if (parseFloat(menu.style.top)  < 6) menu.style.top  = '6px';
        });

        // Quick emoji reaction clicks
        menu.querySelectorAll('.msg-quick-emoji').forEach(el => {
            el.addEventListener('click', e => {
                e.stopPropagation();
                const emoji = el.dataset.emoji;
                const core = getMessagesCore();
                if (core && core.addReaction) core.addReaction(currentActionMessage.id, emoji, true);
                hideMessageActions();
            });
        });

        // Action item clicks
        menu.querySelectorAll('.msg-menu-item').forEach(item => {
            item.addEventListener('click', e => {
                e.stopPropagation();
                handleMessageAction(item.dataset.action, currentActionMessage);
                hideMessageActions();
            });
        });

        // 10-second auto-close
        actionMenuTimeout = setTimeout(hideMessageActions, 10000);

        // Click-outside dismiss
        const closeHandler = e => {
            if (!menu.contains(e.target)) {
                hideMessageActions();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 10);
    }

    function hideMessageActions() {
        const menu = document.getElementById('dynamicMessageActions');
        if (menu) menu.remove();
        if (actionMenuTimeout) clearTimeout(actionMenuTimeout);
        currentActionMessage = null;
    }

    function handleMessageAction(action, message) {
        if (!message) return;
        
        const core = getMessagesCore();
        
        switch (action) {
            case 'reply':
                setReplyToMessage(message);
                const input = document.getElementById('messageInput');
                if (input) input.focus();
                showNotificationInMessages('Replying to message...', 'info');
                break;
                
            case 'edit':
                if (core && core.editMessage) {
                    const newContent = prompt('Edit your message:', message.content);
                    if (newContent && newContent.trim()) {
                        core.editMessage(message.id, newContent.trim());
                    }
                }
                break;
                
            case 'forward':
                showForwardModal(message);
                break;
                
            case 'copy':
                navigator.clipboard.writeText(message.content || '');
                showNotificationInMessages('Copied to clipboard', 'success');
                break;
                
            case 'star':
                if (core && core.UIStateManager && core.UIStateManager.toggleStarred) {
                    const isStarred = core.UIStateManager.toggleStarred(message.id);
                    showNotificationInMessages(isStarred ? 'Message starred' : 'Message unstarred', 'info');
                }
                break;
                
            case 'report':
                showReportModal(message);
                break;
                
            case 'react-like':
                if (core && core.addReaction) {
                    core.addReaction(message.id, '👍', true);
                }
                break;
                
            case 'react-love':
                if (core && core.addReaction) {
                    core.addReaction(message.id, '❤️', true);
                }
                break;
                
            case 'react-laugh':
                if (core && core.addReaction) {
                    core.addReaction(message.id, '😂', true);
                }
                break;
                
            case 'delete':
                if (confirm('Delete this message?')) {
                    if (core && core.deleteMessage) {
                        core.deleteMessage(message.id, false);
                    }
                }
                break;
                
            case 'info':
                showMessageInfo(message);
                break;
        }
    }

    function setReplyToMessage(message) {
        window.replyToMessage = message;

        const replyIndicator = document.getElementById('replyIndicator');
        const replyText = document.getElementById('replyToText');
        if (replyIndicator && replyText) {
            const core = getMessagesCore();
            // Resolve sender name
            let senderName = 'Unknown';
            if (core && core.FriendManager) {
                const f = core.FriendManager.getFriend(message.senderId);
                if (f) senderName = f.displayName || f.username || 'Unknown';
            }
            const currentUserId = getCurrentUserId();
            if (message.senderId == currentUserId) senderName = 'You';

            const preview = (message.content || '').length > 60
                ? (message.content || '').substring(0, 60) + '…'
                : (message.content || '');

            replyText.innerHTML = `
                <span style="font-weight:600;color:#667eea;">${senderName}</span>
                <span style="color:#6b7280;margin-left:6px;">${preview}</span>
            `;
            replyIndicator.style.display = 'flex';
        }
    }

    function cancelReply() {
        window.replyToMessage = null;
        const replyIndicator = document.getElementById('replyIndicator');
        if (replyIndicator) replyIndicator.style.display = 'none';
    }

    function showForwardModal(message) {
        alert('Forward feature - select a contact to forward this message');
    }

    function showReportModal(message) {
        // Remove any existing modal
        const existing = document.getElementById('_reportModalOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = '_reportModalOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:20000;display:flex;align-items:center;justify-content:center;';

        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;width:min(340px,90vw);padding:24px;font-family:-apple-system,sans-serif;">
                <h3 style="margin:0 0 6px;font-size:17px;font-weight:700;">Report Message</h3>
                <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">What's the issue with this message?</p>
                <div id="_reportOptions" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
                    ${['Spam or scam','Harassment or bullying','Hate speech','Misleading information','Inappropriate content','Other'].map(r => `
                        <label style="display:flex;align-items:center;gap:10px;padding:10px;border:1.5px solid #e5e7eb;border-radius:10px;cursor:pointer;font-size:14px;">
                            <input type="radio" name="_reportReason" value="${r}" style="accent-color:#667eea;">
                            ${r}
                        </label>
                    `).join('')}
                </div>
                <textarea id="_reportDetail" placeholder="Additional details (optional)" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;resize:vertical;min-height:70px;font-family:inherit;margin-bottom:14px;box-sizing:border-box;"></textarea>
                <div style="display:flex;gap:8px;">
                    <button id="_reportCancel" style="flex:1;padding:10px;border:1.5px solid #e5e7eb;border-radius:10px;background:#fff;font-size:14px;cursor:pointer;">Cancel</button>
                    <button id="_reportSubmit" style="flex:1;padding:10px;border:none;border-radius:10px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Report</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('_reportCancel').onclick = () => overlay.remove();
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        document.getElementById('_reportSubmit').onclick = () => {
            const reason = overlay.querySelector('input[name="_reportReason"]:checked')?.value;
            const detail = document.getElementById('_reportDetail').value.trim();
            if (!reason) { showNotificationInMessages('Please select a reason', 'error'); return; }
            const core = getMessagesCore();
            if (core && core.reportMessage) core.reportMessage(message.id, reason + (detail ? ': ' + detail : ''));
            showNotificationInMessages('Report submitted. Thank you.', 'success');
            overlay.remove();
        };
    }

    // View the profile of the person in the active chat
    function viewReceiverProfile() {
        const core = getMessagesCore();
        const chat = core?.getCurrentConversation?.() || core?.ChatManager?.getActiveChat?.();
        if (!chat) return;

        const userId   = chat.friendId || chat.otherUserId || chat.userId;
        const name     = chat.friendName || chat.name || 'User';
        const avatar   = chat.friendAvatar || chat.avatar || '';
        const username = chat.friendUsername || chat.username || '';

        let onlineStatus = 'Offline';
        if (core && core.FriendManager && userId) {
            const f = core.FriendManager.getFriend(userId) || core.FriendManager.getFriend(parseInt(userId));
            if (f) onlineStatus = f.online ? 'Active now' : (f.lastSeen ? 'Last seen recently' : 'Offline');
        }

        const existing = document.getElementById('_profileViewOverlay');
        if (existing) existing.remove();

        const initials = (name.charAt(0) || '?').toUpperCase();
        const overlay = document.createElement('div');
        overlay.id = '_profileViewOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:20000;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:20px;width:min(320px,88vw);overflow:hidden;font-family:-apple-system,sans-serif;box-shadow:0 12px 48px rgba(0,0,0,0.2);">
                <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:32px 24px 24px;text-align:center;position:relative;">
                    <button id="_profileClose" style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:32px;height:32px;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
                    <div style="width:80px;height:80px;border-radius:50%;overflow:hidden;margin:0 auto 12px;border:3px solid rgba(255,255,255,0.5);background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;">
                        ${avatar
                            ? `<img src="${avatar}" alt="${name}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<span style=\\'color:white;font-size:28px;font-weight:700;\\'>${initials}</span>'">`
                            : `<span style="color:white;font-size:28px;font-weight:700;">${initials}</span>`
                        }
                    </div>
                    <div style="color:#fff;font-size:19px;font-weight:700;">${name}</div>
                    ${username ? `<div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:2px;">@${username}</div>` : ''}
                    <div style="margin-top:8px;display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.15);padding:4px 12px;border-radius:20px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${onlineStatus === 'Active now' ? '#10b981' : '#9ca3af'};display:inline-block;"></span>
                        <span style="color:#fff;font-size:12px;">${onlineStatus}</span>
                    </div>
                </div>
                <div style="padding:20px 24px;">
                    <div style="display:flex;gap:10px;">
                        <button onclick="window.messagesUI?.initiateCall?.('voice'); document.getElementById('_profileViewOverlay')?.remove();" style="flex:1;padding:10px;border:1.5px solid #e5e7eb;border-radius:12px;background:#fff;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;"><i class="fas fa-phone" style="color:#667eea;"></i> Call</button>
                        <button onclick="window.messagesUI?.initiateCall?.('video'); document.getElementById('_profileViewOverlay')?.remove();" style="flex:1;padding:10px;border:1.5px solid #e5e7eb;border-radius:12px;background:#fff;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;"><i class="fas fa-video" style="color:#667eea;"></i> Video</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        document.getElementById('_profileClose').onclick = () => overlay.remove();
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    }

    // Expose globally
    window.viewReceiverProfile = viewReceiverProfile;

    function showMessageInfo(message) {
        const info = `Message Info:
ID: ${message.id}
From: ${message.senderId}
To: ${message.receiverId}
Time: ${new Date(message.timestamp).toLocaleString()}
Status: ${message.status || 'sent'}
Type: ${message.type || 'text'}`;
        alert(info);
    }

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
            // Back to chats button
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

            // New chat button
            const newChatBtn = UIFailsafe.safeGetElement('newChatBtn');
            if (newChatBtn) {
                newChatBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const contactsSidebar = UIFailsafe.safeGetElement('contactsSidebar');
                        if (!contactsSidebar) return;

                        UIFailsafe.safeRemoveClass(contactsSidebar, 'hidden');
                        contactsSidebar.style.pointerEvents = '';

                        const isMobile = window.innerWidth <= 768;
                        if (isMobile) {
                            const sidebar = UIFailsafe.safeGetElement('sidebar');
                            if (sidebar) UIFailsafe.safeRemoveClass(sidebar, 'active');
                        }

                        UIStateManager.setState('contactsVisible', true);

                        const contactsList = UIFailsafe.safeGetElement('contactsList');
                        if (contactsList && contactsList.children.length === 0) {
                            UIFailsafe.safeSetHTML(contactsList, `
                                <div class="empty-state subtle">
                                    <i class="fas fa-spinner fa-spin empty-icon" style="opacity:0.4;"></i>
                                    <div class="empty-title" style="font-size:14px;">Loading friends...</div>
                                </div>
                            `);
                        }

                        const core = getMessagesCore();
                        if (core) {
                            const cached = core.getFriends?.() || [];
                            if (cached.length > 0) UIRenderer.renderContactsList(cached);
                            if (core.FriendManager?.fetchFriends) core.FriendManager.fetchFriends();
                        }
                    });
                });
            }

            // Back from contacts button
            const backFromContacts = UIFailsafe.safeGetElement('backToChatsFromContactsBtn');
            if (backFromContacts) {
                backFromContacts.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const contactsSidebar = UIFailsafe.safeGetElement('contactsSidebar');
                        const sidebar = UIFailsafe.safeGetElement('sidebar');
                        if (contactsSidebar) { 
                            UIFailsafe.safeAddClass(contactsSidebar, 'hidden'); 
                            contactsSidebar.style.pointerEvents = 'none'; 
                        }
                        if (sidebar) UIFailsafe.safeAddClass(sidebar, 'active');
                        UIStateManager.setState('contactsVisible', false);
                    });
                });
            }

            // Send button
            const sendBtn = UIFailsafe.safeGetElement('sendButton');
            if (sendBtn) {
                sendBtn.addEventListener('click', async () => {
                    await UIFailsafe.queueAction(async () => {
                        if (!this._canPerformAction('sendMessage')) return;
                        await this._handleSendMessage();
                    });
                });
            }

            // Emoji button
            const emojiBtn = UIFailsafe.safeGetElement('emojiBtn');
            if (emojiBtn) {
                const _buildEmojiPicker = () => {
                    const container = UIFailsafe.safeGetElement('emojiPickerContainer');
                    if (!container || container.dataset.built) return;
                    
                    container.innerHTML = '';
                    
                    const EMOJI_CATEGORIES = {
                        'Smileys & Emotion': ['😀','😂','😅','😊','😍','🥰','😎','🤔','😢','😡','🤗','😜','😇','🥳','😤','😴','🤩','😬','🙄','🤭','😈','👻','💀','🤖'],
                        'Gestures & Body': ['👍','👎','👌','✌️','🤞','🙏','👏','🤝','💪','👀','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💯'],
                        'Symbols & Objects': ['🔥','✅','❌','⚠️','🎉','🎊','🎶','🌟','💫','⭐','⚡','💡','🔔','🔕','📌','📍','💎','🎈','🎁','🏆'],
                        'Food & Drink': ['🍕','🍔','🍩','☕','🍎','🍺','🍷','🍣','🍜','🍦','🍫','🍪','🍯','🥑','🥝','🌮','🥗','🍿','🥤','🍻'],
                        'Animals & Nature': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐸','🐒','🐔','🐧','🐦','🐤','🐴','🐝','🐛','🦋','🐌']
                    };
                    
                    const scrollContainer = document.createElement('div');
                    scrollContainer.className = 'emoji-scroll-container';
                    scrollContainer.style.cssText = 'max-height: 260px; overflow-y: auto;';
                    
                    for (const [category, emojis] of Object.entries(EMOJI_CATEGORIES)) {
                        const categoryHeader = document.createElement('div');
                        categoryHeader.className = 'emoji-category-header';
                        categoryHeader.textContent = category;
                        categoryHeader.style.cssText = 'font-size: 12px; font-weight: 600; color: #666; padding: 8px 12px 4px 12px; background: white; position: sticky; top: 0; z-index: 1;';
                        
                        if (document.documentElement.getAttribute('data-theme') === 'dark') {
                            categoryHeader.style.background = '#2d2d2d';
                            categoryHeader.style.color = '#aaa';
                        }
                        
                        scrollContainer.appendChild(categoryHeader);
                        
                        const grid = document.createElement('div');
                        grid.className = 'emoji-grid';
                        grid.style.cssText = 'display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; padding: 4px 12px 12px 12px;';
                        
                        emojis.forEach(emoji => {
                            const span = document.createElement('span');
                            span.className = 'emoji-item';
                            span.textContent = emoji;
                            span.title = emoji;
                            span.style.cssText = 'cursor: pointer; font-size: 22px; text-align: center; padding: 6px 4px; border-radius: 8px; transition: all 0.2s; user-select: none;';
                            
                            span.addEventListener('mouseenter', () => {
                                span.style.background = 'rgba(0, 0, 0, 0.05)';
                                span.style.transform = 'scale(1.1)';
                            });
                            span.addEventListener('mouseleave', () => {
                                span.style.background = '';
                                span.style.transform = 'scale(1)';
                            });
                            
                            span.addEventListener('click', (e) => {
                                e.stopPropagation();
                                const input = document.getElementById('messageInput');
                                if (input) {
                                    const start = input.selectionStart ?? input.value.length;
                                    const end = input.selectionEnd ?? input.value.length;
                                    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
                                    input.selectionStart = input.selectionEnd = start + emoji.length;
                                    input.focus();
                                    input.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                                UIFailsafe.safeRemoveClass(container, 'active');
                                UIStateManager.setState('emojiPickerActive', false);
                            });
                            
                            grid.appendChild(span);
                        });
                        
                        scrollContainer.appendChild(grid);
                    }
                    
                    container.appendChild(scrollContainer);
                    container.dataset.built = '1';
                    
                    const style = document.createElement('style');
                    style.textContent = `
                        .emoji-category-header {
                            position: sticky;
                            top: 0;
                            background: white;
                            z-index: 2;
                            backdrop-filter: blur(4px);
                        }
                        [data-theme="dark"] .emoji-category-header {
                            background: #2d2d2d;
                        }
                        .emoji-scroll-container::-webkit-scrollbar {
                            width: 6px;
                        }
                        .emoji-scroll-container::-webkit-scrollbar-track {
                            background: #f1f1f1;
                            border-radius: 3px;
                        }
                        .emoji-scroll-container::-webkit-scrollbar-thumb {
                            background: #c1c1c1;
                            border-radius: 3px;
                        }
                        [data-theme="dark"] .emoji-scroll-container::-webkit-scrollbar-track {
                            background: #3d3d3d;
                        }
                        [data-theme="dark"] .emoji-scroll-container::-webkit-scrollbar-thumb {
                            background: #666;
                        }
                    `;
                    document.head.appendChild(style);
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

                document.addEventListener('click', (e) => {
                    if (!e.target.closest('#emojiPickerContainer') && !e.target.closest('#emojiBtn')) {
                        const container = UIFailsafe.safeGetElement('emojiPickerContainer');
                        if (container) UIFailsafe.safeRemoveClass(container, 'active');
                        UIStateManager.setState('emojiPickerActive', false);
                    }
                });
            }

            // Format button
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

            // Format buttons
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

            // Attach button
            const attachBtn = UIFailsafe.safeGetElement('attachBtn');
            if (attachBtn) {
                attachBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('attachment')) return;
                        const core = getMessagesCore();
                        const chat = core?.getCurrentConversation?.();
                        if (!chat?.id) {
                            UIRenderer.showNotification('Open a conversation first', 'error');
                            return;
                        }

                        const fileInput = document.createElement('input');
                        fileInput.type = 'file';
                        fileInput.accept = 'image/*,video/*,audio/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.zip';
                        fileInput.style.display = 'none';
                        document.body.appendChild(fileInput);

                        fileInput.onchange = async (e) => {
                            const file = e.target.files?.[0];
                            try { document.body.removeChild(fileInput); } catch (_) {}
                            if (!file) return;

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

            // Jump to latest button
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

            // Chat search button
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

            // Close chat search button
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

            // In-chat search input
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

            // Chat filter search
            const chatSearch = UIFailsafe.safeGetElement('chatSearch');
            if (chatSearch) {
                chatSearch.addEventListener('input', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('filterChats')) return;
                        this._filterChats(e.target.value);
                    });
                });
            }

            // Contact search
            const contactSearch = UIFailsafe.safeGetElement('contactSearch');
            if (contactSearch) {
                contactSearch.addEventListener('input', (e) => {
                    UIFailsafe.queueAction(() => {
                        this._filterContacts(e.target.value);
                    });
                });
            }

            // Category tabs
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

            // Multi-send toggle
            const multiSendToggle = UIFailsafe.safeGetElement('multiSendToggleBtn');
            if (multiSendToggle) {
                multiSendToggle.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('multiSend')) return;
                        this._toggleMultiSend();
                    });
                });
            }

            // Close multi-send
            const closeMultiSend = UIFailsafe.safeGetElement('closeMultiSendBtn');
            if (closeMultiSend) {
                closeMultiSend.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        this._closeMultiSend();
                    });
                });
            }

            const multiSendCancelBtn = UIFailsafe.safeGetElement('multiSendCancelBtn');
            if (multiSendCancelBtn) {
                multiSendCancelBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        this._closeMultiSend();
                    });
                });
            }

            // Multi-send send button
            const multiSendBtn = UIFailsafe.safeGetElement('multiSendBtn');
            if (multiSendBtn) {
                multiSendBtn.addEventListener('click', async () => {
                    await UIFailsafe.queueAction(async () => {
                        if (!this._canPerformAction('multiSend')) return;
                        await this._handleMultiSend();
                    });
                });
            }

            // Multi-send search
            const multiSendSearch = UIFailsafe.safeGetElement('multiSendSearch');
            if (multiSendSearch) {
                multiSendSearch.addEventListener('input', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('filterMultiSend')) return;
                        this._filterMultiSendChats(e.target.value);
                    });
                });
            }

            // Schedule button
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

            // Close schedule modal
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

            // Video call button
            const videoCallBtn = UIFailsafe.safeGetElement('videoCallBtn');
            if (videoCallBtn && !videoCallBtn.__kynCallBound) {
                videoCallBtn.__kynCallBound = true;
                videoCallBtn.addEventListener('click', () => {
                    const core = getMessagesCore();
                    const activeChat = core?.getCurrentConversation?.() || core?.currentChat || window.__currentActiveChat;
                    if (!activeChat) { UIRenderer.showNotification('Open a chat first before calling', 'warning'); return; }
                    const receiverId = activeChat.friendId || activeChat.pendingReceiverId || activeChat.otherUserId || activeChat.userId;
                    const receiverName = activeChat.friendName || activeChat.name || activeChat.displayName || 'User';
                    if (!receiverId) { UIRenderer.showNotification('Cannot identify call recipient', 'error'); return; }
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            type: 'SWITCH_MODULE', module: 'calls',
                            payload: { userId: receiverId, userName: receiverName, callType: 'video', returnTo: 'messages', chatUserId: receiverId, source: 'messages-module' },
                            timestamp: Date.now()
                        }, '*');
                    }
                });
            }

            // Chat options button
            const chatOptionsBtn = UIFailsafe.safeGetElement('chatOptionsBtn');
            if (chatOptionsBtn) {
                chatOptionsBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('chatOptions')) return;
                        const core = getMessagesCore();
                        const chat = core?.getCurrentConversation?.();
                        if (chat && core) {
                            const info = core.showChatInfo?.(chat);
                            this._showChatInfoModal(info);
                        }
                    });
                });
            }

            // Close chat info modal
            const closeChatInfo = UIFailsafe.safeGetElement('closeChatInfoBtn');
            if (closeChatInfo) {
                closeChatInfo.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const chatInfoModal = UIFailsafe.safeGetElement('chatInfoModal');
                        if (chatInfoModal) UIFailsafe.safeRemoveClass(chatInfoModal, 'active');
                    });
                });
            }

            // Close thread button
            const closeThread = UIFailsafe.safeGetElement('closeThreadBtn');
            if (closeThread) {
                closeThread.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        UIRenderer.closeThread();
                    });
                });
            }

            // Thread send button
            const threadSend = UIFailsafe.safeGetElement('threadSendBtn');
            if (threadSend) {
                threadSend.addEventListener('click', async () => {
                    await UIFailsafe.queueAction(async () => {
                        if (!this._canPerformAction('threadReply')) return;
                        await this._handleThreadReply();
                    });
                });
            }

            // Dismiss offline button
            const dismissOffline = UIFailsafe.safeGetElement('dismissOfflineBtn');
            if (dismissOffline) {
                dismissOffline.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const offlineOverlay = UIFailsafe.safeGetElement('offlineOverlay');
                        if (offlineOverlay) UIFailsafe.safeRemoveClass(offlineOverlay, 'active');
                    });
                });
            }

            // Cancel report button
            const cancelReport = UIFailsafe.safeGetElement('cancelReportBtn');
            if (cancelReport) {
                cancelReport.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        const reportModal = UIFailsafe.safeGetElement('reportModal');
                        if (reportModal) UIFailsafe.safeRemoveClass(reportModal, 'active');
                    });
                });
            }

            // Submit report button
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

            // Cancel recording button
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

            // Message action items
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

            // Retry connection button
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
                        if (core?.getCurrentConversation?.()) {
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
            const currentChat = core?.getCurrentConversation?.();
            if (!currentChat) return;

            if (!core.isTyping) {
                core.setIsTyping?.(true);
                core.sendTyping?.(currentChat.id, true);

                if (core.typingTimeout) {
                    clearTimeout(core.typingTimeout);
                }

                core.setTypingTimeout?.(setTimeout(() => {
                    if (core) {
                        core.setIsTyping?.(false);
                        core.sendTyping?.(currentChat.id, false);
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
                const nameEl = item.querySelector('.contact-name') || item.querySelector('[style*="font-weight:600"]');
                const name = (nameEl?.textContent || item.textContent || '').toLowerCase();
                UIFailsafe.safeSetStyle(item, 'display', (!searchTerm || name.includes(searchTerm)) ? 'flex' : 'none');
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
                const chats = core?.getConversations?.() || [];
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
            if (core?.multiSendSelectedChats instanceof Set) {
                core.multiSendSelectedChats.clear();
            }
            UIStateManager.setState('multiSendVisible', false);
        },

        async _handleMultiSend() {
            const input = UIFailsafe.safeGetElement('multiSendInput');
            const content = input?.value?.trim() || '';
            const core = getMessagesCore();

            if (!content) {
                UIRenderer.showNotification('Please type a message first', 'error');
                return;
            }

            const selectedChats = core?.multiSendSelectedChats;
            if (!selectedChats || selectedChats.size === 0) {
                UIRenderer.showNotification('Select at least one chat to send to', 'error');
                return;
            }

            const chatIds = Array.from(selectedChats);
            let successCount = 0;
            let failCount = 0;

            const previousChat = core?.getCurrentConversation?.();

            for (const chatId of chatIds) {
                try {
                    const result = await core.sendMessage(content, { conversationId: chatId });
                    if (result && result.success !== false) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (e) {
                    failCount++;
                }
            }

            if (successCount > 0) {
                UIRenderer.showNotification(`✓ Sent to ${successCount} chat${successCount > 1 ? 's' : ''}${failCount > 0 ? ` (${failCount} failed)` : ''}`);
                this._closeMultiSend();
                if (input) input.value = '';
            } else {
                UIRenderer.showNotification('Failed to send messages — please try again', 'error');
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
                chatId: core?.getCurrentConversation?.()?.id,
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
    // AUTO-OPEN CHAT FROM EXTERNAL REQUEST
    // =============================================

    function setupAutoOpenChat() {
        console.log('[MessageUI] Setting up auto-open chat listener');
        
        window.addEventListener('messages:openChat', function(event) {
            const { userId, userName, recipientId, recipientName } = event.detail || {};
            const targetUserId = userId || recipientId;
            const targetUserName = userName || recipientName || 'User';
            
            console.log('[MessageUI] Auto-open chat requested:', { targetUserId, targetUserName });
            
            if (!targetUserId) {
                console.error('[MessageUI] No user ID provided for auto-open');
                return;
            }
            
            openChatWithUserInUI(targetUserId, targetUserName);
        });

        window.addEventListener('message', function(event) {
            const msg = event.data || {};
            if (msg.type !== 'OPEN_CHAT_WITH_USER') return;

            const payload = msg.payload || {};
            const targetUserId = payload.userId || payload.recipientId;
            const targetUserName = payload.userName || payload.recipientName || 'User';

            console.log('[MessageUI] Received OPEN_CHAT_WITH_USER postMessage:', { targetUserId, targetUserName });

            if (!targetUserId) {
                console.error('[MessageUI] OPEN_CHAT_WITH_USER: No userId in payload');
                return;
            }

            openChatWithUserInUI(targetUserId, targetUserName);
        });
        
        const pendingChatRaw = sessionStorage.getItem('open_chat_on_load') || sessionStorage.getItem('pending_chat');
        if (pendingChatRaw) {
            try {
                const chatData = JSON.parse(pendingChatRaw);
                console.log('[MessageUI] Found pending chat in sessionStorage:', chatData);
                
                sessionStorage.removeItem('open_chat_on_load');
                sessionStorage.removeItem('pending_chat');
                
                openChatWithUserInUI(chatData.userId, chatData.userName || 'User');
            } catch (e) {
                console.error('[MessageUI] Failed to parse pending chat:', e);
            }
        }
    }

    function openChatWithUserInUI(userId, userName) {
        console.log('[MessageUI] Opening chat with user:', { userId, userName });
        
        const numericUserId = parseInt(userId);
        const core = getMessagesCore();
        
        const chatPanel = document.getElementById('chatPanel');
        const sidebar = document.getElementById('sidebar');
        const contactsSidebar = document.getElementById('contactsSidebar');
        
        if (contactsSidebar) contactsSidebar.classList.add('hidden');
        if (sidebar) sidebar.classList.add('active');
        if (chatPanel) {
            chatPanel.classList.remove('hidden');
            UIStateManager.setState('chatVisible', true);
            
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                messagesContainer.innerHTML = `
                    <div class="loading-chat">
                        <div class="loading-spinner"></div>
                        <p>Opening conversation with ${userName}...</p>
                    </div>
                `;
            }
        }
        
        window.currentFriendName = userName;
        if (window.messagesUI && typeof window.messagesUI.loadChatByFriendId === 'function') {
            console.log('[MessageUI] Using messagesUI.loadChatByFriendId');
            window.messagesUI.loadChatByFriendId(numericUserId, userName);
            return;
        }

        if (core && typeof core.openConversation === 'function') {
            console.log('[MessageUI] Using core.openConversation');
            core.openConversation(numericUserId);
            
            setTimeout(() => {
                const nameEl = document.getElementById('chatFriendName');
                if (nameEl) nameEl.textContent = userName;
                const statusEl = document.getElementById('chatStatusText');
                if (statusEl) {
                    const _core2 = getMessagesCore();
                    let _realOnline = false;
                    if (_core2 && _core2.FriendManager) {
                        const _f = _core2.FriendManager.getFriend(numericUserId);
                        if (_f) _realOnline = !!_f.online;
                    }
                    statusEl.textContent = _realOnline ? 'Active now' : 'Offline';
                }
                const indicatorEl = document.getElementById('chatStatusIndicator');
                if (indicatorEl) indicatorEl.className = 'chat-status online';
                
                const messagesContainer = document.getElementById('messagesContainer');
                if (messagesContainer && messagesContainer.innerHTML.includes('loading-chat')) {
                    messagesContainer.innerHTML = `
                        <div class="empty-chat">
                            <i class="fas fa-comment-dots empty-chat-icon"></i>
                            <div class="empty-chat-title">No messages yet</div>
                            <div class="empty-chat-message">Type your first message below to start the conversation with ${userName}</div>
                        </div>
                    `;
                }
            }, 100);
            return;
        }
        
        if (core && core.ConversationManager && typeof core.ConversationManager.createConversation === 'function') {
            console.log('[MessageUI] Using ConversationManager.createConversation');
            const result = core.ConversationManager.createConversation([numericUserId]);
            
            const openPanel = () => {
                setTimeout(() => {
                    const nameEl = document.getElementById('chatFriendName');
                    if (nameEl) nameEl.textContent = userName;
                    const messagesContainer = document.getElementById('messagesContainer');
                    if (messagesContainer && messagesContainer.innerHTML.includes('loading-chat')) {
                        messagesContainer.innerHTML = `
                            <div class="empty-chat">
                                <i class="fas fa-comment-dots empty-chat-icon"></i>
                                <div class="empty-chat-title">No messages yet</div>
                                <div class="empty-chat-message">Type your first message below to start the conversation with ${userName}</div>
                            </div>
                        `;
                    }
                }, 100);
            };
            
            if (result && typeof result.then === 'function') {
                result.then((conversation) => {
                    console.log('[MessageUI] Conversation opened:', conversation);
                    openPanel();
                }).catch((error) => {
                    console.error('[MessageUI] Failed to open conversation:', error);
                    openPanel();
                });
            } else {
                openPanel();
            }
            return;
        }
        
        if (window.ChatManager && typeof window.ChatManager.openChat === 'function') {
            console.log('[MessageUI] Using ChatManager.openChat');
            window.ChatManager.openChat(numericUserId, userName);
            return;
        }
        
        const selectors = [
            `.contact-item[data-contact-id="${numericUserId}"]`,
            `.friend-item[data-user-id="${numericUserId}"]`,
            `.conversation-item[data-user-id="${numericUserId}"]`,
            `.chat-item[data-user-id="${numericUserId}"]`,
            `.user-item[data-user-id="${numericUserId}"]`
        ];
        
        for (const selector of selectors) {
            const userElement = document.querySelector(selector);
            if (userElement) {
                console.log('[MessageUI] Found user element:', selector);
                const chatButton = userElement.querySelector('.chat-btn, .start-chat, [data-action="start-chat"], button:last-child');
                if (chatButton) {
                    chatButton.click();
                } else {
                    userElement.click();
                }
                return;
            }
        }
        
        const searchInput = document.querySelector('.contact-search, .search-input, #contactSearch, #searchUsers, .user-search, [placeholder*="search"]');
        if (searchInput) {
            console.log('[MessageUI] Searching for user:', userName);
            searchInput.value = userName;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            const newChatBtn = document.getElementById('newChatBtn');
            if (newChatBtn && !document.getElementById('contactsSidebar')?.classList.contains('active')) {
                newChatBtn.click();
            }
            
            setTimeout(() => {
                const firstResult = document.querySelector('.contact-item, .friend-item, .user-search-item');
                if (firstResult) {
                    firstResult.click();
                    setTimeout(() => {
                        if (chatPanel) {
                            chatPanel.classList.remove('hidden');
                            UIStateManager.setState('chatVisible', true);
                        }
                    }, 200);
                } else {
                    console.log('[MessageUI] No search results found for:', userName);
                    showNotificationInMessages(`Click + New Chat to start conversation with ${userName}`, 'info');
                }
            }, 600);
        } else {
            console.log('[MessageUI] Could not find way to open chat with user:', userId);
            showNotificationInMessages(`Click + New Chat to start conversation with ${userName}`, 'info');
            if (chatPanel) {
                chatPanel.classList.remove('hidden');
                UIStateManager.setState('chatVisible', true);
            }
        }
    }

    function showNotificationInMessages(message, type = 'info') {
        if (window.messagesUI && typeof window.messagesUI.showNotification === 'function') {
            window.messagesUI.showNotification(message, type);
        } else if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else if (UIRenderer && typeof UIRenderer.showNotification === 'function') {
            UIRenderer.showNotification(message, type);
        } else {
            console.log('[MessageUI] Notification:', message);
        }
    }

    // =============================================
    // UI INITIALIZATION (PASSIVE UNTIL ACTIVE)
    // =============================================
    function initializeUI() {
        _ensureStatusIndicators();
        _removeLoadingOverlays();
        
        setupAutoOpenChat();

        const primeCachedUi = () => {
            const core = getMessagesCore();
            if (!core) return false;

            const conversations = core.getConversations?.() || [];
            const currentChat = core.getCurrentConversation?.();
            const currentCategory = core.getCurrentCategory?.() || 'all';
            const friends = core.getFriends?.() || [];
            const messages = core.getMessages?.() || [];
            const user = core.getCurrentUser?.();

            if (conversations.length > 0) {
                UIRenderer.renderChatsList(conversations, currentChat, currentCategory, {});
            }
            if (friends.length > 0) {
                UIRenderer.renderContactsList(friends);
            }
            if (currentChat && messages.length > 0) {
                UIRenderer.renderMessages(messages, currentChat, user);
            }

            return conversations.length > 0 || friends.length > 0;
        };

        setTimeout(() => {
            UIFailsafe.queueAction(() => {
                primeCachedUi();
            });
        }, 0);
        
        const setupCoreSubscriptions = () => {
            const core = getMessagesCore();
            if (!core) return false;
            
            window.addEventListener('conversationsUpdated', (e) => {
                const conversations = e.detail?.conversations || core.getConversations?.() || [];
                if (UIRenderer._canRender()) {
                    const currentChat = core.getCurrentConversation?.();
                    const drafts = core.UI?.getDraft ? {} : {};
                    const currentCategory = core.getCurrentCategory?.() || 'all';
                    UIRenderer.renderChatsList(conversations, currentChat, currentCategory, drafts);
                }
            });
            
            window.addEventListener('friendsUpdated', (e) => {
                const friends = e.detail?.friends || core.getFriends?.() || [];
                UIRenderer.renderContactsList(friends);
            });
            
            if (core.ChatManager && core.ChatManager.subscribe) {
                core.ChatManager.subscribe((conversations, activeChat, messages) => {
                    if (UIRenderer._canRender()) {
                        const currentCategory = core.getCurrentCategory?.() || 'all';
                        UIRenderer.renderChatsList(conversations || [], activeChat, currentCategory, {});
                        if (activeChat && messages) {
                            const user = core.getCurrentUser?.();
                            UIRenderer.renderMessages(messages, activeChat, user);
                        }
                    }
                });
            }
            
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
                
                setupCoreSubscriptions();
                
                setTimeout(() => {
                    const core = getMessagesCore();
                    UIFailsafe.queueAction(() => {
                        if (core?.initEmojiPicker) core.initEmojiPicker();
                        if (core?.loadUserSettings) core.loadUserSettings();
                        if (core?.loadChatThemes) core.loadChatThemes();
                        if (core?.loadMessageDrafts) core.loadMessageDrafts();
                        if (core?.loadScheduledMessages) core.loadScheduledMessages();
                        if (core?.loadOfflineQueue) core.loadOfflineQueue();
                        if (core?.setupScrollDetection) core.setupScrollDetection();
                        if (core?.startBackgroundSync) core.startBackgroundSync();

                        if (core) {
                            core.renderChatsList?.();
                            core.renderContactsList?.();
                        }
                        
                        if (core) {
                            const conversations = core.getConversations?.() || [];
                            const friends = core.getFriends?.() || [];
                            if (conversations.length > 0 && UIRenderer._canRender()) {
                                const currentCategory = core.getCurrentCategory?.() || 'all';
                                UIRenderer.renderChatsList(conversations, core.getCurrentConversation?.(), currentCategory, {});
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
                if (core && core.fetchConversations) core.fetchConversations();
                if (core && core.FriendManager && core.FriendManager.fetchFriends) core.FriendManager.fetchFriends();
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
        }, 120);

        setTimeout(() => {
            if (UIFailsafe.hasValidSession() && UIStateManager.getState('sessionValid') !== true) {
                console.log('[UI] 3s timeout - forcing UI enable');
                UIFailsafe.forceEnableUI();
                const core = getMessagesCore();
                if (core && core.fetchConversations) core.fetchConversations();
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
        
        toggleMultiSendItem: (chatId, rowEl) => {
            const core = getMessagesCore();
            if (!core) return;
            if (!(core.multiSendSelectedChats instanceof Set)) {
                core.multiSendSelectedChats = new Set();
            }
            const id = parseInt(chatId, 10);
            if (!id) return;
            const checkbox = rowEl?.querySelector?.('.multi-send-checkbox');
            if (core.multiSendSelectedChats.has(id)) {
                core.multiSendSelectedChats.delete(id);
                rowEl?.classList?.remove('selected');
                rowEl?.style && (rowEl.style.background = '');
                if (checkbox) checkbox.checked = false;
            } else {
                core.multiSendSelectedChats.add(id);
                rowEl?.classList?.add('selected');
                rowEl?.style && (rowEl.style.background = 'rgba(102,126,234,0.08)');
                if (checkbox) checkbox.checked = true;
            }
            UIRenderer.updateSelectedCount();
        },
        
        updateMultiSendSelection: (chatId, checked) => {
            const core = getMessagesCore();
            if (!core) return;
            if (!(core.multiSendSelectedChats instanceof Set)) core.multiSendSelectedChats = new Set();
            const id = parseInt(chatId, 10);
            if (!id) return;
            if (checked) { core.multiSendSelectedChats.add(id); }
            else { core.multiSendSelectedChats.delete(id); }
            UIRenderer.updateSelectedCount();
        },
        
        openThread: UIRenderer.openThread.bind(UIRenderer),
        closeThread: UIRenderer.closeThread.bind(UIRenderer),
        
        showMessageActions: showMessageActions,
        hideMessageActions: hideMessageActions,
        handleMessageAction: handleMessageAction,
        
        getConnectionQuality: () => UIStateManager.getState('connectionQuality'),
        isRecoveryMode: () => UIStateManager.getState('recoveryMode'),
        isOfflineMode: () => UIStateManager.getState('offlineMode'),
        isParentReady: () => UIStateManager.getState('parentReady'),
        getLifecycleState: () => UIStateManager.getState('lifecycleState'),
        hasValidSession: () => UIStateManager.getState('sessionValid'),
        
        MESSAGE_TYPES: getMessagesCore()?.MESSAGE_TYPES || {},
        
        forceSyncWithCore: () => UIStateManager._forceSyncSessionState(),
        
        getCore: getMessagesCore,
        
        openChat: (chat) => {
            const core = getMessagesCore();
            if (core && core.openConversation) {
                core.openConversation(chat.id || chat);
            }
        },
        
        loadChatByFriendId: (friendId, friendName) => {
            const core = getMessagesCore();
            if (!core) {
                console.log('[messagesUI] Core not available, retrying in 500ms');
                setTimeout(() => {
                    const retryCore = getMessagesCore();
                    if (retryCore) {
                        window.messagesUI.loadChatByFriendId(friendId, friendName);
                    }
                }, 500);
                return;
            }

            const displayName = friendName || 'User';
            window.currentFriendName = displayName;
            
            console.log('[messagesUI] loadChatByFriendId called with:', { friendId, friendName: displayName });

            const id = parseInt(friendId, 10);
            if (!id) {
                console.error('[messagesUI] Invalid friend ID:', friendId);
                return;
            }

            const existingConversation = core.getConversations?.()?.find?.((conversation) =>
                String(conversation?.friendId) === String(id) ||
                String(conversation?.otherParticipant?.id) === String(id) ||
                String(conversation?.otherUserId) === String(id) ||
                String(conversation?.userId) === String(id) ||
                (Array.isArray(conversation?.participants) && conversation.participants.some((participant) => String(participant?.id || participant) === String(id)))
            );

            const contactsSidebar = document.getElementById('contactsSidebar');
            const sidebar = document.getElementById('sidebar');
            const chatPanel = document.getElementById('chatPanel');
            
            if (contactsSidebar) { contactsSidebar.classList.add('hidden'); contactsSidebar.style.pointerEvents = 'none'; }
            if (sidebar) sidebar.classList.add('active');
            
            const nameEl = document.getElementById('chatFriendName');
            if (nameEl) {
                nameEl.textContent = displayName;
            }
            
            if (chatPanel) {
                chatPanel.classList.remove('hidden');
                UIStateManager.setState('chatVisible', true);
                
                const messagesContainer = document.getElementById('messagesContainer');
                if (messagesContainer) {
                    const cachedMessages = existingConversation?.id && core.getCachedMessages
                        ? core.getCachedMessages(existingConversation.id)
                        : [];
                    if (Array.isArray(cachedMessages) && cachedMessages.length > 0) {
                        UIRenderer.renderMessages(cachedMessages);
                    } else {
                        messagesContainer.innerHTML = `
                            <div class="loading-chat">
                                <div class="loading-spinner"></div>
                                <p>Opening conversation with ${displayName}...</p>
                            </div>
                        `;
                    }
                }
            }

            const ensureChatPanelOpen = (conversationId) => {
                console.log('[messagesUI] Ensuring chat panel open with ID:', conversationId);
                
                if (chatPanel) {
                    chatPanel.classList.remove('hidden');
                    UIStateManager.setState('chatVisible', true);
                }
                
                const nameEl = document.getElementById('chatFriendName');
                if (nameEl) {
                    nameEl.textContent = displayName;
                }
                
                const coreInstance = getMessagesCore();
                if (coreInstance) {
                    const friends = coreInstance.getFriends ? coreInstance.getFriends() : [];
                    const friend = friends.find(f => f.id === id);
                    if (friend) {
                        const avatarEl = document.getElementById('chatFriendAvatar');
                        const statusEl = document.getElementById('chatStatusText');
                        const indicatorEl = document.getElementById('chatStatusIndicator');
                        
                        if (nameEl) nameEl.textContent = friend.displayName || friend.username || displayName;
                        if (statusEl) statusEl.textContent = friend.online ? 'Online' : 'Offline';
                        if (indicatorEl) indicatorEl.className = `chat-status ${friend.online ? 'online' : 'offline'}`;
                        if (avatarEl) {
                            if (friend.avatar || friend.photoURL) {
                                avatarEl.innerHTML = `<img src="${friend.avatar || friend.photoURL}" alt="${friend.displayName}" loading="lazy">`;
                            } else {
                                avatarEl.innerHTML = '<i class="fas fa-user"></i>';
                            }
                            if (indicatorEl) avatarEl.appendChild(indicatorEl);
                        }
                    } else {
                        const avatarEl = document.getElementById('chatFriendAvatar');
                        if (avatarEl) {
                            const initials = displayName.charAt(0).toUpperCase();
                            avatarEl.innerHTML = `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:16px;">${initials}</div>`;
                            const indicatorEl = document.getElementById('chatStatusIndicator');
                            if (indicatorEl) avatarEl.appendChild(indicatorEl);
                        }
                    }
                }
                
                const messagesContainer = document.getElementById('messagesContainer');
                if (messagesContainer && messagesContainer.innerHTML.includes('loading-chat')) {
                    setTimeout(() => {
                        if (messagesContainer.innerHTML.includes('loading-chat')) {
                            messagesContainer.innerHTML = `
                                <div class="empty-chat">
                                    <i class="fas fa-comment-dots empty-chat-icon"></i>
                                    <div class="empty-chat-title">No messages yet</div>
                                    <div class="empty-chat-message">Type your first message below to start the conversation with ${displayName}</div>
                                </div>
                            `;
                        }
                    }, 1000);
                }
                
            };

            if (existingConversation?.id && core.openConversation) {
                console.log('[messagesUI] Opening existing conversation instantly:', existingConversation.id);
                core.openConversation(existingConversation.id, { minFetchGap: 25000 }).catch?.(() => {});
                ensureChatPanelOpen(existingConversation.id);
                return;
            }

            if (core.ConversationManager?.createConversation) {
                console.log('[messagesUI] Using ConversationManager.createConversation');
                const result = core.ConversationManager.createConversation([id]);
                
                if (result && typeof result.then === 'function') {
                    result.then((conversation) => {
                        console.log('[messagesUI] Conversation created/opened:', conversation);
                        if (conversation === false || conversation === null) {
                            console.log('[messagesUI] createConversation returned false, opening panel anyway');
                            ensureChatPanelOpen(id);
                        } else {
                            const conversationId = conversation?.id || conversation;
                            ensureChatPanelOpen(conversationId);
                        }
                    }).catch((error) => {
                        console.error('[messagesUI] Failed to create conversation:', error);
                        ensureChatPanelOpen(id);
                    });
                } else {
                    const conversationId = (result === false || result === null) ? id : (result?.id || result);
                    ensureChatPanelOpen(conversationId);
                }
            } else if (core.createConversation) {
                console.log('[messagesUI] Using core.createConversation');
                const result = core.createConversation([id]);
                if (result && typeof result.then === 'function') {
                    result.then((conversation) => {
                        const conversationId = (conversation === false || conversation === null) ? id : (conversation?.id || conversation);
                        ensureChatPanelOpen(conversationId);
                    }).catch(() => {
                        ensureChatPanelOpen(id);
                    });
                } else {
                    const conversationId = (result === false || result === null) ? id : (result?.id || result);
                    ensureChatPanelOpen(conversationId);
                }
            } else if (core.openConversation) {
                console.log('[messagesUI] Using core.openConversation');
                core.openConversation(id);
                ensureChatPanelOpen(id);
            } else {
                console.warn('[messagesUI] No conversation creation method available');
                ensureChatPanelOpen(id);
            }
        },
        
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
        
        closeMediaViewer: () => {
            const viewer = document.getElementById('mediaViewer');
            if (viewer) viewer.classList.remove('active');
        },
        
        playVideo: (url) => {
            window.open(url, '_blank');
        },
        
        downloadFile: (url, name) => {
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        },
        
        openLocation: (lat, lng) => {
            window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
        },
        
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
        
        voteInPoll: (messageId, optionIndex) => {
            const core = getMessagesCore();
            if (core && core.addReaction) {
                core.addReaction(messageId, `poll_${optionIndex}`, true);
            }
        },
        
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
        
        cancelEditMessage: () => {
            const core = getMessagesCore();
            if (core && core.fetchMessages) {
                const currentChat = core.getCurrentConversation();
                if (currentChat) {
                    core.fetchMessages(currentChat.id);
                }
            }
        },

        viewReceiverProfile: () => viewReceiverProfile(),

        initiateCall: (callType = 'voice') => {
            const core = getMessagesCore();
            const chat = core?.getCurrentConversation?.() || core?.ChatManager?.getActiveChat?.();
            if (!chat) return;
            const userId = chat.friendId || chat.otherUserId || chat.userId;
            const userName = chat.friendName || chat.name || 'User';
            if (!userId) return;
            window.parent?.postMessage({
                type: 'INITIATE_CALL',
                payload: { userId, userName, callType, returnTo: 'messages' }
            }, '*');
        }
    };

    window.messagesUI = messagesUI;
    
    const closeMediaViewerBtn = document.getElementById('closeMediaViewer');
    if (closeMediaViewerBtn) {
        closeMediaViewerBtn.addEventListener('click', () => {
            const viewer = document.getElementById('mediaViewer');
            if (viewer) viewer.classList.remove('active');
        });
    }

    // Initialize call handlers
    setupCallHandlers();
    setupCallReturnHandler();
    setupCallQualityMonitoring();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = messagesUI;
    }
})();
// =============================================
// SETTINGS LIVE-APPLY BRIDGE (UI Layer)
// Applies setting changes to the DOM as they arrive,
// both from the core's CustomEvents and from direct postMessages.
// =============================================
(function installSettingsUIBridge() {
    function applyUISettingChange(section, key, value) {
        if (section === 'appearance') {
            if (key === 'theme') {
                var t = value === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
                document.documentElement.setAttribute('data-theme', t);
                document.body.setAttribute('data-theme', t);
                document.body.classList.toggle('dark-theme', t === 'dark');
                document.documentElement.style.colorScheme = t;
            }
            if (key === 'fontSize') document.documentElement.style.fontSize = parseInt(value) + 'px';
            if (key === 'accentColor') {
                document.documentElement.style.setProperty('--accent-color', value);
                document.documentElement.style.setProperty('--primary-color', value);
            }
            if (key === 'compactMode') {
                document.documentElement.setAttribute('data-compact', value ? 'true' : 'false');
                document.body.classList.toggle('compact-mode', !!value);
            }
            if (key === 'animationsEnabled' || key === 'animations') {
                document.body.classList.toggle('no-animations', !value);
                document.documentElement.setAttribute('data-animations', value ? 'true' : 'false');
            }
            if (key === 'language') document.documentElement.setAttribute('lang', value);
        }
        if (section === 'advanced') {
            if (key === 'reduceMotion') { document.body.classList.toggle('reduce-motion', !!value); document.documentElement.setAttribute('data-reduce-motion', value ? 'true' : 'false'); }
            if (key === 'performanceMode') document.documentElement.setAttribute('data-performance-mode', value ? 'true' : 'false');
        }
        if (section === 'mood' && key === 'currentMood') document.documentElement.setAttribute('data-mood', value);
    }

    // Listen for custom events dispatched by core's applySettingToMessagesModule
    window.addEventListener('settingChanged', function(e) {
        try { var d = e.detail; applyUISettingChange(d.section, d.key, d.value); } catch(err) {}
    });
    window.addEventListener('settingsUpdated', function(e) {
        try {
            var s = e.detail && e.detail.settings;
            if (!s) return;
            Object.entries(s).forEach(function(se) {
                var sec = se[0], val = se[1];
                if (val && typeof val === 'object') {
                    Object.entries(val).forEach(function(ke) { applyUISettingChange(sec, ke[0], ke[1]); });
                }
            });
        } catch(err) {}
    });

    // Also listen directly on window.message as a fallback
    window.addEventListener('message', function(e) {
        try {
            var data = e.data;
            if (!data || typeof data !== 'object') return;
            if (data.type === 'SETTING_CHANGED') {
                var p = data.payload || data;
                if (p.section && p.key !== undefined) applyUISettingChange(p.section, p.key, p.value);
            }
            if (data.type === 'SETTINGS_UPDATED') {
                var settings = (data.payload && data.payload.settings) || data.settings;
                if (settings && typeof settings === 'object') {
                    Object.entries(settings).forEach(function(se) {
                        var sec = se[0], secVal = se[1];
                        if (secVal && typeof secVal === 'object') {
                            Object.entries(secVal).forEach(function(ke) { applyUISettingChange(sec, ke[0], ke[1]); });
                        }
                    });
                }
            }
        } catch(err) {}
    });

    // Apply from cache on load
    try {
        var cached = localStorage.getItem('knecta_settings_cache');
        if (cached) {
            var parsed = JSON.parse(cached);
            var settings = (parsed && parsed.data) ? parsed.data : parsed;
            if (settings && typeof settings === 'object') {
                if (parsed.timestamp && (Date.now() - parsed.timestamp) < 86400000) {
                    Object.entries(settings).forEach(function(se) {
                        var sec = se[0], secVal = se[1];
                        if (secVal && typeof secVal === 'object') {
                            Object.entries(secVal).forEach(function(ke) { try { applyUISettingChange(sec, ke[0], ke[1]); } catch(e) {} });
                        }
                    });
                }
            }
        }
    } catch(e) {}
})();
