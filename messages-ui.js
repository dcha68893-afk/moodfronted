// =============================================
// MESSAGES-UI.js - HARDENED PRODUCTION UI ENGINE v3.6.0
// DETERMINISTIC PARENT-CONTROLLED UI LAYER
// STRICT LIFECYCLE ALIGNMENT WITH CORE v7.6.0
// PASSIVE UI UNTIL ACTIVE STATE - NO AUTONOMOUS ACTIONS
// WAIT_PARENT DEAD STOP ENFORCEMENT
// UI FAILURE RESILIENCE - NEVER BLOCKS RENDERING
// =============================================

(function() {
    'use strict';

    // =============================================
    // CONSTANTS & CONFIGURATION
    // =============================================
    const VERSION = '3.6.0';
    const APP_NAME = 'kynecta-messages-ui';
    const SOURCE_CHILD = 'CHILD';
    const FRAME_ID = 'messagesIframe';
    
    // Lifecycle states (aligned with core v7.6.0 - DETERMINISTIC)
    const LIFECYCLE_STATES = {
        BOOT: 'BOOT',
        INITIALIZING: 'INITIALIZING',
        READY: 'READY',
        WAIT_PARENT: 'WAIT_PARENT',
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
        LIFECYCLE_STATE: 'lifecycle_state'
    };

    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4
    };

    const CURRENT_LOG_LEVEL = LOG_LEVELS.NONE;

    // =============================================
    // UI LOGGING SYSTEM (SILENT)
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
    // UI FAILSAFE (PREVENTS FREEZING)
    // =============================================
    const UIFailsafe = {
        enabled: true,
        pendingActions: [],
        processing: false,
        lastActionTime: 0,
        actionThrottle: 100,
        
        init() {
            this._setupErrorBoundary();
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
            if (!this.enabled) return action();
            
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

        // DETERMINISTIC: Safe check if core is ready (only ACTIVE state)
        isCoreReady() {
            return !!(window.messagesCore && 
                     window.messagesCore.isReady && 
                     window.messagesCore.isReady());
        },

        // DETERMINISTIC: Safe check if parent is ready (only when ACTIVE)
        isParentReady() {
            return !!(window.messagesCore && 
                     window.messagesCore.getState && 
                     window.messagesCore.getState().parentReadyReceived);
        },
        
        // DETERMINISTIC: Get lifecycle state from core
        getLifecycleState() {
            if (window.messagesCore && window.messagesCore.getState) {
                return window.messagesCore.getState().state || 'UNKNOWN';
            }
            return 'UNKNOWN';
        },
        
        // DETERMINISTIC: Check if UI actions are allowed (only when ACTIVE)
        canPerformUIAction() {
            const state = this.getLifecycleState();
            return state === LIFECYCLE_STATES.ACTIVE;
        },
        
        // DETERMINISTIC: Check if UI is in WAIT_PARENT (dead stop)
        isInWaitParent() {
            const state = this.getLifecycleState();
            return state === LIFECYCLE_STATES.WAIT_PARENT;
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
            offlineMode: !navigator.onLine,
            syncInProgress: false,
            startupState: 'INIT',
            parentReady: false,
            lifecycleState: 'BOOT'  // DETERMINISTIC: Track lifecycle state
        },
        
        listeners: new Map(),

        init() {
            this._loadSavedState();
            this._setupEventListeners();
            this._startPeriodicSync();
            this._checkParentReady();
            this._checkLifecycleState();
            
            return this;
        },

        // DETERMINISTIC: Check parent ready state from core
        _checkParentReady() {
            if (UIFailsafe.isParentReady()) {
                this.state.parentReady = true;
                this._notifyListeners('parentReady', true);
                this._updateConnectionUI(true, 'excellent');
            }
        },
        
        // DETERMINISTIC: Check lifecycle state from core
        _checkLifecycleState() {
            const lifecycleState = UIFailsafe.getLifecycleState();
            if (lifecycleState !== this.state.lifecycleState) {
                this.state.lifecycleState = lifecycleState;
                this._notifyListeners('lifecycleState', lifecycleState);
                this._updateLifecycleUI(lifecycleState);
            }
        },
        
        // DETERMINISTIC: Update UI based on lifecycle state
        _updateLifecycleUI(lifecycleState) {
            const statusEl = UIFailsafe.safeGetElement('handshakeStatus');
            if (!statusEl) return;
            
            UIFailsafe.safeSetStyle(statusEl, 'display', 'flex');
            
            const lifecycleMessages = {
                'BOOT': { text: 'Initializing...', icon: 'fa-cog fa-spin', color: '#ff9800', action: false },
                'INITIALIZING': { text: 'Loading module...', icon: 'fa-cog fa-spin', color: '#ff9800', action: false },
                'READY': { text: 'Ready...', icon: 'fa-circle', color: '#ff9800', action: false },
                'WAIT_PARENT': { text: '', icon: '', color: 'transparent', action: false, hidden: true },
                'ACTIVE': { text: 'Connected', icon: 'fa-check-circle', color: '#4caf50', action: true }
            };
            
            const info = lifecycleMessages[lifecycleState] || { text: '', icon: '', color: 'transparent', action: false, hidden: true };
            
            // For WAIT_PARENT, hide the status indicator completely
            if (lifecycleState === 'WAIT_PARENT') {
                UIFailsafe.safeSetStyle(statusEl, 'display', 'none');
            } else {
                UIFailsafe.safeSetStyle(statusEl, 'display', 'flex');
                UIFailsafe.safeSetHTML(statusEl, `
                    <i class="fas ${info.icon}" style="color: ${info.color};"></i>
                    <span>${info.text}</span>
                `);
            }
            
            console.log(`[messagesUI] Lifecycle: ${lifecycleState}`);
            
            // Update UI interaction based on lifecycle state
            this._updateUIInteractionState(info.action);
            
            // Update connection status based on lifecycle
            if (lifecycleState === 'ACTIVE') {
                this._updateConnectionUI(true, 'excellent');
            } else if (lifecycleState === 'WAIT_PARENT') {
                this._updateConnectionUI(false, 'unknown');
                // Background connection only - no visual loading state
            } else {
                this._updateConnectionUI(false, 'unknown');
            }
        },
        
        // DETERMINISTIC: Update UI interaction state (disable when not ACTIVE)
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
            
            if (!isActive) {
                // Disable all interactive elements
                if (messageInput) UIFailsafe.safeSetProperty(messageInput, 'disabled', true);
                if (sendButton) UIFailsafe.safeSetProperty(sendButton, 'disabled', true);
                if (attachBtn) UIFailsafe.safeSetProperty(attachBtn, 'disabled', true);
                if (emojiBtn) UIFailsafe.safeSetProperty(emojiBtn, 'disabled', true);
                if (formatBtn) UIFailsafe.safeSetProperty(formatBtn, 'disabled', true);
                if (voiceCallBtn) UIFailsafe.safeSetProperty(voiceCallBtn, 'disabled', true);
                if (videoCallBtn) UIFailsafe.safeSetProperty(videoCallBtn, 'disabled', true);
                if (chatOptionsBtn) UIFailsafe.safeSetProperty(chatOptionsBtn, 'disabled', true);
                if (multiSendToggle) UIFailsafe.safeSetProperty(multiSendToggle, 'disabled', true);
                
                // Add disabled class for styling
                if (messageInput) UIFailsafe.safeAddClass(messageInput, 'ui-disabled');
            } else {
                // Enable interactive elements
                if (messageInput) UIFailsafe.safeSetProperty(messageInput, 'disabled', false);
                if (sendButton) UIFailsafe.safeSetProperty(sendButton, 'disabled', false);
                if (attachBtn) UIFailsafe.safeSetProperty(attachBtn, 'disabled', false);
                if (emojiBtn) UIFailsafe.safeSetProperty(emojiBtn, 'disabled', false);
                if (formatBtn) UIFailsafe.safeSetProperty(formatBtn, 'disabled', false);
                if (voiceCallBtn) UIFailsafe.safeSetProperty(voiceCallBtn, 'disabled', false);
                if (videoCallBtn) UIFailsafe.safeSetProperty(videoCallBtn, 'disabled', false);
                if (chatOptionsBtn) UIFailsafe.safeSetProperty(chatOptionsBtn, 'disabled', false);
                if (multiSendToggle) UIFailsafe.safeSetProperty(multiSendToggle, 'disabled', false);
                
                // Remove disabled class
                if (messageInput) UIFailsafe.safeRemoveClass(messageInput, 'ui-disabled');
            }
        },
        
        // DETERMINISTIC: Show WAIT_PARENT state in UI (BACKGROUND ONLY - NO VISIBLE LOADING)
        _showWaitParentState() {
            // DO NOT SHOW VISIBLE LOADING STATE IN FOREGROUND
            // Connection happens silently in background
            // Remove any existing wait-parent-state elements if they exist
            const waitParentElements = UIFailsafe.safeQuerySelectorAll('.wait-parent-state');
            UIFailsafe.safeForEach(waitParentElements, (el) => {
                if (el && el.remove) {
                    el.remove();
                }
            });
            
            // Keep UI clean - no loading overlays or connection messages
            // The user sees a clean interface while connection happens in background
        },

        _loadSavedState() {
            UIFailsafe.queueAction(() => {
                if (window.messagesCore && window.messagesCore.SafeStorage) {
                    const saved = window.messagesCore.SafeStorage.getJSON('ui_state', {});
                    if (saved.theme) this.state.currentTheme = saved.theme;
                    if (saved.fontSize) this.state.fontSize = saved.fontSize;
                    if (saved.sidebarVisible !== undefined) this.state.sidebarVisible = saved.sidebarVisible;
                }
            });
        },

        _setupEventListeners() {
            // DETERMINISTIC: Listen for messagesLifecycleChange from core
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
                        // Background connection - no UI blocking
                    } else if (newState === LIFECYCLE_STATES.READY) {
                        this.state.parentReady = false;
                        this._notifyListeners('parentReady', false);
                    }
                });
            });

            window.addEventListener('sessionUpdated', (e) => {
                UIFailsafe.queueAction(() => {
                    if (e.detail.user) {
                        this._updateUserUI(e.detail.user);
                    }
                    this.state.sessionStatus = e.detail.authenticated ? 'authenticated' : 'anonymous';
                    this._notifyListeners('sessionStatus', this.state.sessionStatus);
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
        },

        _startPeriodicSync() {
            setInterval(() => {
                UIFailsafe.queueAction(() => {
                    // Only sync lifecycle state periodically
                    const lifecycleState = UIFailsafe.getLifecycleState();
                    if (lifecycleState !== this.state.lifecycleState) {
                        this.state.lifecycleState = lifecycleState;
                        this._notifyListeners('lifecycleState', lifecycleState);
                        this._updateLifecycleUI(lifecycleState);
                    }
                    
                    if (UIFailsafe.isParentReady() && !this.state.parentReady) {
                        this.state.parentReady = true;
                        this._notifyListeners('parentReady', true);
                    }
                });
            }, 10000);
        },
        
        // DETERMINISTIC: Initialize UI when ACTIVE
        _initializeActiveUI() {
            // Trigger initial data load
            if (window.messagesCore && window.messagesCore.fetchConversations) {
                window.messagesCore.fetchConversations();
            }
            
            // Load user data
            if (window.messagesCore && window.messagesCore.getCurrentUser) {
                const user = window.messagesCore.getCurrentUser();
                if (user) {
                    this._updateUserUI(user);
                }
            }
            
            // Remove any leftover wait-parent-state elements if present
            const waitParentState = UIFailsafe.safeQuerySelector('.wait-parent-state');
            if (waitParentState) {
                waitParentState.remove();
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
            UIFailsafe.queueAction(() => {
                if (window.messagesCore && window.messagesCore.SafeStorage) {
                    window.messagesCore.SafeStorage.setJSON('ui_state', {
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
                
                if (user) {
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
                        // No visible message for WAIT_PARENT - hide status
                        UIFailsafe.safeSetStyle(tokenStatus, 'display', 'none');
                        return;
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
                // Hide in-progress handshake for WAIT_PARENT
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
    // UI RENDERER (ENHANCED WITH DETERMINISTIC LIFECYCLE)
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
        },

        // DETERMINISTIC: Check if UI can render (only when ACTIVE)
        _canRender() {
            const lifecycleState = UIStateManager.getState('lifecycleState');
            return lifecycleState === LIFECYCLE_STATES.ACTIVE;
        },

        // DETERMINISTIC: Get passive loading state for initial rendering
        _getPassiveLoadingState() {
            const lifecycleState = UIStateManager.getState('lifecycleState');
            let message = 'Loading...';
            
            if (lifecycleState === 'BOOT' || lifecycleState === 'INITIALIZING') {
                message = 'Initializing module...';
            } else if (lifecycleState === 'READY') {
                message = 'Ready...';
            } else if (lifecycleState === 'WAIT_PARENT') {
                // Return minimal content for WAIT_PARENT - no visible loading
                return `<div class="passive-loading-state" data-lifecycle="${lifecycleState}" style="opacity:0; height:0; overflow:hidden;"></div>`;
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

        // =========================================
        // MESSAGE RENDERING (WITH DETERMINISTIC LIFECYCLE CHECK)
        // =========================================
        renderMessages(messages, currentChat, currentUser) {
            const container = UIFailsafe.safeGetElement('messagesContainer');
            if (!container) return;

            // DETERMINISTIC: If not active, show passive loading state - NO ACTIONS
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
            
            messages.forEach(message => {
                const date = window.messagesCore?.formatDate ? 
                    window.messagesCore.formatDate(message.timestamp) : 
                    new Date(message.timestamp).toLocaleDateString();
                if (!groups[date]) {
                    groups[date] = [];
                }
                groups[date].push(message);
            });
            
            return groups;
        },

        _createTextMessageTemplate(message, currentUser) {
            const isSent = message.senderId === currentUser?.id;
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
            const content = window.messagesCore?.formatMessageText ? 
                window.messagesCore.formatMessageText(message.content) : 
                message.content;
            const time = window.messagesCore?.formatTime ? 
                window.messagesCore.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'} ${deletedClass} ${failedClass} ${sendingClass}" data-message-id="${message.id}" data-message-type="text" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesCore?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
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
            const isSent = message.senderId === currentUser?.id;
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const time = window.messagesCore?.formatTime ? 
                window.messagesCore.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="image" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesCore?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div class="message-image" onclick="window.messagesCore?.viewMedia('${message.content}', '${message.fileName || 'image'}')">
                            <img src="${message.content}" alt="${message.fileName || 'Image'}" loading="lazy">
                        </div>
                        ${message.caption ? `<div class="message-caption">${window.messagesCore?.escapeHtml ? window.messagesCore.escapeHtml(message.caption) : message.caption}</div>` : ''}
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
            const isSent = message.senderId === currentUser?.id;
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const time = window.messagesCore?.formatTime ? 
                window.messagesCore.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="video" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesCore?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div class="message-video" onclick="window.messagesCore?.playVideo('${message.content}')">
                            <video src="${message.content}" poster="${message.thumbnail || ''}" controls></video>
                        </div>
                        ${message.caption ? `<div class="message-caption">${window.messagesCore?.escapeHtml ? window.messagesCore.escapeHtml(message.caption) : message.caption}</div>` : ''}
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
            const isSent = message.senderId === currentUser?.id;
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const duration = message.duration ? this._formatDuration(message.duration) : '';
            const time = window.messagesCore?.formatTime ? 
                window.messagesCore.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="audio" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesCore?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div class="message-audio">
                            <button class="audio-play-btn" onclick="this.classList.toggle('playing'); window.messagesCore?.playAudio('${message.id}', '${message.content}', ${message.duration || 0})">
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
            const isSent = message.senderId === currentUser?.id;
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const fileSize = message.fileSize && window.messagesCore?.formatFileSize ? 
                window.messagesCore.formatFileSize(message.fileSize) : '';
            const fileIcon = this._getFileIcon(message.fileName || '');
            const time = window.messagesCore?.formatTime ? 
                window.messagesCore.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="file" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesCore?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div class="message-file" onclick="window.messagesCore?.downloadFile('${message.content}', '${message.fileName || 'file'}')">
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
            const isSent = message.senderId === currentUser?.id;
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const time = window.messagesCore?.formatTime ? 
                window.messagesCore.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="location" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesCore?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div class="message-location" onclick="window.messagesCore?.openLocation(${message.latitude || 0}, ${message.longitude || 0})">
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
            const isSent = message.senderId === currentUser?.id;
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const totalVotes = message.options?.reduce((sum, opt) => sum + (opt.votes || 0), 0) || 0;
            const time = window.messagesCore?.formatTime ? 
                window.messagesCore.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            let optionsHTML = '';
            if (message.options) {
                message.options.forEach((option, index) => {
                    const percentage = totalVotes > 0 ? Math.round((option.votes || 0) / totalVotes * 100) : 0;
                    optionsHTML += `
                        <div class="poll-option" onclick="window.messagesCore?.voteInPoll('${message.id}', ${index})">
                            <div class="poll-option-text">${option.text}</div>
                            <div class="poll-option-bar" style="width: ${percentage}%"></div>
                            <div class="poll-option-stats">${option.votes || 0} (${percentage}%)</div>
                        </div>
                    `;
                });
            }
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="poll" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesCore?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
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
            const isSent = message.senderId === currentUser?.id;
            const status = message.status || 'sent';
            const statusIcon = status === 'sending' ? 'fa-clock' :
                              status === 'failed' ? 'fa-exclamation-circle' :
                              status === 'read' ? 'fa-check-double' : 'fa-check';
            
            const reactions = this._renderReactions(message.reactions);
            const content = window.messagesCore?.formatMessageText ? 
                window.messagesCore.formatMessageText(message.content) : 
                message.content;
            const time = window.messagesCore?.formatTime ? 
                window.messagesCore.formatTime(message.timestamp) : 
                new Date(message.timestamp).toLocaleTimeString();
            
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            
            return `
                <div class="message note-message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="note" data-status="${status}">
                    <div class="message-bubble" onclick="window.messagesCore?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
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

        // =========================================
        // CHATS LIST RENDERING (WITH DETERMINISTIC LIFECYCLE CHECK)
        // =========================================
        renderChatsList(chats, currentChat, category, messageDrafts) {
            const container = UIFailsafe.safeGetElement('chatsList');
            if (!container) return;

            // DETERMINISTIC: If not active, show passive loading state
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
                const time = window.messagesCore?.formatTime ? 
                    window.messagesCore.formatTime(chat.lastMessageAt) : 
                    chat.lastMessageAt ? new Date(chat.lastMessageAt).toLocaleTimeString() : '';
                
                const safeChat = JSON.stringify(chat).replace(/"/g, '&quot;');
                
                html += `
                    <div class="chat-item ${isSelected ? 'selected' : ''}" data-chat-id="${chat.id}" onclick="window.messagesCore?.openChat(${safeChat})">
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

        // =========================================
        // CONTACTS LIST RENDERING (WITH DETERMINISTIC LIFECYCLE CHECK)
        // =========================================
        renderContactsList(contacts) {
            const container = UIFailsafe.safeGetElement('contactsList');
            if (!container) return;

            // DETERMINISTIC: If not active, show passive loading state
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
                <div class="contact-item" data-contact-id="${contact.id}" onclick="window.messagesCore?.loadChatByFriendId('${contact.id}')">
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

        // =========================================
        // UI UPDATES
        // =========================================
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
            if (starItem && window.messagesCore?.SafeStorage) {
                const starred = window.messagesCore.SafeStorage.getJSON('starred_messages', {})[message.id];
                UIFailsafe.safeSetAttribute(starItem, 'class', starred ? 'fas fa-star' : 'far fa-star');
            }

            const editItem = menu.querySelector('[data-action="edit"]');
            const deleteItem = menu.querySelector('[data-action="delete"]');
            
            if (editItem) {
                UIFailsafe.safeSetStyle(editItem, 'display', message.senderId === window.messagesCore?.getCurrentUser()?.id ? 'flex' : 'none');
            }
            
            if (deleteItem) {
                UIFailsafe.safeSetStyle(deleteItem, 'display', message.senderId === window.messagesCore?.getCurrentUser()?.id ? 'flex' : 'flex');
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
            
            switch (action) {
                case 'reply':
                    if (window.messagesCore) {
                        window.messagesCore.setReplyToMessage(message);
                        document.getElementById('messageInput')?.focus();
                    }
                    break;
                    
                case 'edit':
                    if (window.messagesCore) {
                        window.messagesCore.setEditingMessageId(message.id);
                        this._showEditInput(message);
                    }
                    break;
                    
                case 'forward':
                    if (window.messagesCore) {
                        window.messagesCore.showForwardMessage(message);
                        this.showNotification('Message copied for forwarding');
                    }
                    break;
                    
                case 'copy':
                    navigator.clipboard.writeText(message.content || '');
                    this.showNotification('Copied to clipboard');
                    break;
                    
                case 'star':
                    if (window.messagesCore) {
                        const starred = window.messagesCore.toggleStarMessage(message.id);
                        this.showNotification(starred ? 'Message starred' : 'Message unstarred');
                    }
                    break;
                    
                case 'report':
                    if (window.messagesCore) {
                        window.messagesCore.showReportModal(message);
                        document.getElementById('reportModal')?.classList.add('active');
                    }
                    break;
                    
                case 'react-like':
                    if (window.messagesCore) {
                        window.messagesCore.addReaction(message.id, '👍', true);
                    }
                    break;
                    
                case 'react-love':
                    if (window.messagesCore) {
                        window.messagesCore.addReaction(message.id, '❤️', true);
                    }
                    break;
                    
                case 'react-laugh':
                    if (window.messagesCore) {
                        window.messagesCore.addReaction(message.id, '😂', true);
                    }
                    break;
                    
                case 'delete':
                    if (window.messagesCore && confirm('Delete this message?')) {
                        window.messagesCore.deleteMessage(message.id, false);
                        this.showNotification('Message deleted');
                    }
                    break;
                    
                case 'info':
                    if (window.messagesCore) {
                        const info = window.messagesCore.showMessageInfo(message);
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
            const escaped = window.messagesCore?.escapeHtml ? 
                window.messagesCore.escapeHtml(originalContent) : originalContent;
            
            UIFailsafe.safeSetHTML(messageEl, `
                <input type="text" id="${inputId}" class="edit-message-input" value="${escaped}" 
                       onkeydown="if(event.key==='Enter' && !event.shiftKey) { event.preventDefault(); window.messagesCore?.saveEditedMessage('${message.id}') }">
                <div class="edit-actions">
                    <button class="edit-btn cancel" onclick="window.messagesCore?.cancelEditMessage()">Cancel</button>
                    <button class="edit-btn save" onclick="window.messagesCore?.saveEditedMessage('${message.id}')">Save</button>
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
            
            let attachment = null;
            
            switch (type) {
                case 'image':
                    if (window.messagesCore) attachment = await window.messagesCore.selectImage();
                    break;
                case 'video':
                    if (window.messagesCore) attachment = await window.messagesCore.selectVideo();
                    break;
                case 'audio':
                    if (window.messagesCore) {
                        attachment = await window.messagesCore.startRecording();
                        if (attachment) {
                            UIStateManager.setState('recordingActive', true);
                        }
                    }
                    break;
                case 'file':
                    if (window.messagesCore) attachment = await window.messagesCore.selectFile();
                    break;
                case 'location':
                    if (window.messagesCore) attachment = await window.messagesCore.shareLocation();
                    break;
                case 'poll':
                    if (window.messagesCore) attachment = window.messagesCore.createPoll();
                    break;
                case 'note':
                    if (window.messagesCore) await window.messagesCore.createNote();
                    return;
            }

            if (attachment && window.messagesCore) {
                window.messagesCore.setCurrentAttachment(attachment);
                window.messagesCore.showAttachmentPreview(attachment);
                
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

        // =========================================
        // MULTI-SEND RENDERING (WITH DETERMINISTIC LIFECYCLE CHECK)
        // =========================================
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
                const isSelected = window.messagesCore?.multiSendSelectedChats?.has(chat.id);
                
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
                               onchange="window.messagesCore?.updateMultiSendSelection('${chat.id}', this.checked); window.messagesUI?.updateSelectedCount()">
                    </div>
                `;
            });

            UIFailsafe.safeSetHTML(container, html);
            this.updateSelectedCount();
        },

        updateSelectedCount() {
            const countEl = UIFailsafe.safeGetElement('selectedCount');
            if (countEl) {
                const count = window.messagesCore?.multiSendSelectedChats?.size || 0;
                UIFailsafe.safeSetText(countEl, `${count} selected`);
            }
        }
    }.init();

    // =============================================
    // UI EVENT HANDLERS (ENHANCED WITH DETERMINISTIC LIFECYCLE CHECKS)
    // =============================================
    const UIEventHandlers = {
        init() {
            this._setupDOMEventListeners();
            this._setupInputHandlers();
            this._setupClickOutsideHandlers();
            this._setupKeyboardHandlers();
            this._setupResizeHandler();
            this._setupOnlineOfflineHandlers();
            this._setupDragAndDropHandlers();
            return this;
        },

        // DETERMINISTIC: Check if action is allowed (only when ACTIVE)
        _canPerformAction(actionName) {
            const lifecycleState = UIStateManager.getState('lifecycleState');
            if (lifecycleState !== LIFECYCLE_STATES.ACTIVE) {
                UILogger.warn('UIEventHandlers', `Action '${actionName}' blocked - not ACTIVE (state: ${lifecycleState})`);
                this._showPassiveNotification(`Please wait while connection is established...`);
                return false;
            }
            return true;
        },
        
        // DETERMINISTIC: Show passive notification for blocked actions
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
                        
                        if (window.messagesCore?.contacts?.length === 0) {
                            window.messagesCore.loadContacts();
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
                emojiBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('emojiPicker')) return;
                        if (window.messagesCore) window.messagesCore.toggleEmojiPicker();
                        UIStateManager.toggleState('emojiPickerActive');
                    });
                });
            }

            const formatBtn = UIFailsafe.safeGetElement('formatBtn');
            if (formatBtn) {
                formatBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('formatting')) return;
                        if (window.messagesCore) window.messagesCore.toggleFormattingToolbar();
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
                        if (tag && window.messagesCore) {
                            window.messagesCore.applyFormatting(tag);
                        }
                    });
                });
            });

            const attachBtn = UIFailsafe.safeGetElement('attachBtn');
            if (attachBtn) {
                attachBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('attachment')) return;
                        if (window.messagesCore) window.messagesCore.toggleAttachmentOptions();
                        UIStateManager.toggleState('attachmentOptionsActive');
                    });
                });
            }

            const attachmentOptions = UIFailsafe.safeQuerySelectorAll('.attachment-option');
            UIFailsafe.safeForEach(attachmentOptions, (btn) => {
                btn.addEventListener('click', (e) => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('attachment')) return;
                        const type = e.currentTarget.dataset.type;
                        if (type && window.messagesCore) {
                            window.messagesCore.handleAttachment(type);
                            if (window.messagesCore) window.messagesCore.closeAttachmentOptionsOnClickOutside(e);
                            UIStateManager.setState('attachmentOptionsActive', false);
                        }
                    });
                });
            });

            const jumpBtn = UIFailsafe.safeGetElement('jumpToLatestBtn');
            if (jumpBtn) {
                jumpBtn.addEventListener('click', () => {
                    UIFailsafe.queueAction(() => {
                        if (!this._canPerformAction('jumpToLatest')) return;
                        if (window.messagesCore) window.messagesCore.jumpToLatest();
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
                        if (window.messagesCore) window.messagesCore.removeSearchHighlights();
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
                        if (window.messagesCore) {
                            window.messagesCore.setCurrentCategory(category);
                            window.messagesCore.renderChatsList();
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
                        const chat = window.messagesCore?.currentChat;
                        if (chat && window.messagesCore) {
                            const info = window.messagesCore.showChatInfo(chat);
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
                        if (window.messagesCore?.submitReport()) {
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
                        if (window.messagesCore) {
                            window.messagesCore.cancelRecording();
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
                        if (window.messagesCore) {
                            window.messagesCore.cancelRecording();
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
                        if (window.messagesCore) window.messagesCore.retryConnection();
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
                    
                    if (window.messagesCore?.saveMessageDraft) {
                        window.messagesCore.saveMessageDraft();
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
                    if (UIStateManager.getState('emojiPickerActive') && window.messagesCore) {
                        window.messagesCore.closeEmojiPickerOnClickOutside(e);
                    }
                });
            });

            document.addEventListener('click', (e) => {
                UIFailsafe.queueAction(() => {
                    if (UIStateManager.getState('formattingToolbarActive') && window.messagesCore) {
                        window.messagesCore.closeFormattingToolbarOnClickOutside(e);
                    }
                });
            });

            document.addEventListener('click', (e) => {
                UIFailsafe.queueAction(() => {
                    if (UIStateManager.getState('attachmentOptionsActive') && window.messagesCore) {
                        window.messagesCore.closeAttachmentOptionsOnClickOutside(e);
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
                        if (window.messagesCore?.currentChat) {
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
                    
                    if (window.messagesCore?.checkOfflineQueue) {
                        window.messagesCore.checkOfflineQueue();
                    }
                    
                    if (window.messagesCore?.fetchConversations) {
                        window.messagesCore.fetchConversations();
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
                if (window.messagesCore) window.messagesCore.setDragStartY(dragStartY);
                
                const handleDrag = (e) => {
                    const deltaY = e.clientY - dragStartY;
                    if (deltaY < -50) {
                        const recordingCancelOverlay = UIFailsafe.safeGetElement('recordingCancelOverlay');
                        if (recordingCancelOverlay) UIFailsafe.safeAddClass(recordingCancelOverlay, 'active');
                        if (window.messagesCore) window.messagesCore.setIsDraggingToCancel(true);
                    } else {
                        const recordingCancelOverlay = UIFailsafe.safeGetElement('recordingCancelOverlay');
                        if (recordingCancelOverlay) UIFailsafe.safeRemoveClass(recordingCancelOverlay, 'active');
                        if (window.messagesCore) window.messagesCore.setIsDraggingToCancel(false);
                    }
                };
                
                const handleDragEnd = () => {
                    document.removeEventListener('mousemove', handleDrag);
                    document.removeEventListener('mouseup', handleDragEnd);
                    
                    if (window.messagesCore?.isDraggingToCancel) {
                        if (window.messagesCore) {
                            window.messagesCore.cancelRecording();
                            UIStateManager.setState('recordingActive', false);
                            const recordingIndicator = UIFailsafe.safeGetElement('recordingIndicator');
                            if (recordingIndicator) UIFailsafe.safeSetStyle(recordingIndicator, 'display', 'none');
                        }
                    }
                    
                    const recordingCancelOverlay = UIFailsafe.safeGetElement('recordingCancelOverlay');
                    if (recordingCancelOverlay) UIFailsafe.safeRemoveClass(recordingCancelOverlay, 'active');
                    if (window.messagesCore) window.messagesCore.setIsDraggingToCancel(false);
                };
                
                document.addEventListener('mousemove', handleDrag);
                document.addEventListener('mouseup', handleDragEnd);
            });
        },

        async _handleSendMessage() {
            const input = UIFailsafe.safeGetElement('messageInput');
            if (!input) return;

            const content = input.value.trim();
            const attachment = window.messagesCore?.currentAttachment;
            
            if (!content && !attachment) return;

            const result = window.messagesCore?.sendMessage(content, {
                type: attachment?.type || 'text',
                attachment: attachment
            });

            if (result && typeof result.then === 'function') {
                result.then((response) => {
                    if (response && response.success) {
                        input.value = '';
                        input.style.height = 'auto';
                        if (window.messagesCore) {
                            window.messagesCore.removeAttachment();
                            if (window.messagesCore.replyToMessage) {
                                window.messagesCore.setReplyToMessage(null);
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
                if (window.messagesCore) {
                    window.messagesCore.removeAttachment();
                    if (window.messagesCore.replyToMessage) {
                        window.messagesCore.setReplyToMessage(null);
                    }
                }
                UIRenderer.showNotification('Message sent');
            } else {
                UIRenderer.showNotification('Failed to send', 'error');
            }
        },

        _handleTypingIndicator() {
            if (!window.messagesCore?.currentChat) return;

            if (!window.messagesCore.isTyping) {
                window.messagesCore.setIsTyping(true);
                window.messagesCore.sendTyping(window.messagesCore.currentChat.id, true);

                if (window.messagesCore.typingTimeout) {
                    clearTimeout(window.messagesCore.typingTimeout);
                }

                window.messagesCore.setTypingTimeout(setTimeout(() => {
                    if (window.messagesCore) {
                        window.messagesCore.setIsTyping(false);
                        window.messagesCore.sendTyping(window.messagesCore.currentChat.id, false);
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
                    if (window.messagesCore) {
                        window.messagesCore.setCurrentAttachment(attachment);
                        window.messagesCore.showAttachmentPreview(attachment);
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
                            if (window.messagesCore) {
                                window.messagesCore.setCurrentAttachment(attachment);
                                window.messagesCore.showAttachmentPreview(attachment);
                            }
                        };
                    } else {
                        if (window.messagesCore) {
                            window.messagesCore.setCurrentAttachment(attachment);
                            window.messagesCore.showAttachmentPreview(attachment);
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
                if (window.messagesCore) window.messagesCore.removeSearchHighlights();
                return;
            }

            const results = window.messagesCore?.searchInChat(query);
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
                    
                    if (window.messagesCore) {
                        window.messagesCore.highlightSearchResults(query);
                        window.messagesCore.setCurrentSearchIndex(0);
                        window.messagesCore.navigateToSearchResult(0);
                    }
                    
                    const prevBtn = UIFailsafe.safeGetElement('prevSearchResult');
                    if (prevBtn) {
                        prevBtn.addEventListener('click', () => {
                            UIFailsafe.queueAction(() => {
                                if (!this._canPerformAction('searchNavigation')) return;
                                const current = window.messagesCore?.currentSearchIndex;
                                if (current > 0 && window.messagesCore) {
                                    window.messagesCore.setCurrentSearchIndex(current - 1);
                                    window.messagesCore.navigateToSearchResult(current - 1);
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
                                const current = window.messagesCore?.currentSearchIndex;
                                if (current < results.length - 1 && window.messagesCore) {
                                    window.messagesCore.setCurrentSearchIndex(current + 1);
                                    window.messagesCore.navigateToSearchResult(current + 1);
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
                const chats = window.messagesCore?.loadMultiSendChats?.() || [];
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
            if (window.messagesCore) window.messagesCore.setMultiSendSelectedChats(new Set());
            UIStateManager.setState('multiSendVisible', false);
        },

        async _handleMultiSend() {
            const input = UIFailsafe.safeGetElement('multiSendInput');
            const content = input?.value?.trim() || '';
            const selectedChats = window.messagesCore?.multiSendSelectedChats;
            
            if ((!content && !window.messagesCore?.currentAttachment) || !selectedChats || selectedChats.size === 0) {
                UIRenderer.showNotification('No content or chats selected', 'error');
                return;
            }

            const chatIds = Array.from(selectedChats);
            const promises = chatIds.map(chatId => 
                window.messagesCore?.forwardMessage(window.messagesCore?.currentAttachment?.id || content, [chatId])
            );
            
            try {
                const results = await Promise.all(promises);
                const successCount = results.filter(r => r && r.success).length;
                
                if (successCount > 0) {
                    UIRenderer.showNotification(`Message sent to ${successCount} chats`);
                    this._closeMultiSend();
                    if (input) input.value = '';
                    if (window.messagesCore) window.messagesCore.removeAttachment();
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

            if (sendNow?.checked) {
                if (window.messagesCore) {
                    const result = window.messagesCore.sendMessage(messageInput.value);
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
                id: window.messagesCore?.SecurityUtils?.generateMessageId?.() || 'msg_' + Date.now(),
                chatId: window.messagesCore?.currentChat?.id,
                content: messageInput.value,
                attachment: window.messagesCore?.currentAttachment,
                scheduleTime: scheduleDateTime,
                status: 'scheduled',
                createdAt: Date.now()
            };

            const scheduled = window.messagesCore?.scheduledMessages || [];
            scheduled.push(scheduledMessage);
            if (window.messagesCore) window.messagesCore.setScheduledMessages(scheduled);
            
            if (window.messagesCore?.SafeStorage) {
                window.messagesCore.SafeStorage.setJSON(
                    window.messagesCore.LOCAL_STORAGE_KEYS.SCHEDULED_MESSAGES,
                    scheduled
                );
            }

            const scheduleModal = UIFailsafe.safeGetElement('scheduleModal');
            if (scheduleModal) UIFailsafe.safeRemoveClass(scheduleModal, 'active');
            UIRenderer.showNotification('Message scheduled');
            if (window.messagesCore) window.messagesCore.updateScheduleBadge?.();
        },

        async _handleThreadReply() {
            const input = UIFailsafe.safeGetElement('threadInput');
            const content = input?.value?.trim();
            
            if (!content || !window.messagesCore?.currentThread) return;

            const result = window.messagesCore.sendMessage(content, {
                conversationId: window.messagesCore.currentThread.id,
                replyTo: window.messagesCore.currentThread.messageId
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
        
        // No visible WAIT_PARENT state - connection happens in background
        // UI remains clean until ACTIVE

        const checkCore = setInterval(() => {
            const lifecycleState = UIFailsafe.getLifecycleState();
            if (lifecycleState === LIFECYCLE_STATES.ACTIVE) {
                clearInterval(checkCore);
                
                setTimeout(() => {
                    UIFailsafe.queueAction(() => {
                        // Initialize UI features only when ACTIVE
                        if (window.messagesCore?.initEmojiPicker) {
                            window.messagesCore.initEmojiPicker();
                        }
                        
                        if (window.messagesCore?.loadUserSettings) {
                            window.messagesCore.loadUserSettings();
                        }
                        
                        if (window.messagesCore?.loadChatThemes) {
                            window.messagesCore.loadChatThemes();
                        }
                        
                        if (window.messagesCore?.loadMessageDrafts) {
                            window.messagesCore.loadMessageDrafts();
                        }
                        
                        if (window.messagesCore?.loadScheduledMessages) {
                            window.messagesCore.loadScheduledMessages();
                        }
                        
                        if (window.messagesCore?.loadOfflineQueue) {
                            window.messagesCore.loadOfflineQueue();
                        }
                        
                        if (window.messagesCore?.setupScrollDetection) {
                            window.messagesCore.setupScrollDetection();
                        }

                        if (window.messagesCore?.startBackgroundSync) {
                            window.messagesCore.startBackgroundSync();
                        }

                        if (window.messagesCore) {
                            window.messagesCore.renderChatsList();
                            window.messagesCore.renderContactsList();
                        }
                        
                        UIStateManager._initializeActiveUI();
                    });
                }, 0);
            } else if (lifecycleState === LIFECYCLE_STATES.WAIT_PARENT) {
                // Ensure no visible WAIT_PARENT UI is shown - background only
                const waitParentElements = UIFailsafe.safeQuerySelectorAll('.wait-parent-state, .connecting-overlay, .connection-waiting');
                UIFailsafe.safeForEach(waitParentElements, (el) => {
                    if (el && el.remove) {
                        el.remove();
                    }
                });
            }
        }, 100);

        setTimeout(() => {
            clearInterval(checkCore);
            const lifecycleState = UIFailsafe.getLifecycleState();
            if (lifecycleState !== LIFECYCLE_STATES.ACTIVE) {
                _updateFallbackUI();
            }
        }, 10000);
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
        
        // Remove any wait-parent-state elements
        const waitParentElements = UIFailsafe.safeQuerySelectorAll('.wait-parent-state');
        UIFailsafe.safeForEach(waitParentElements, (el) => {
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
        if (window.messagesCore && window.messagesCore.saveUIState) {
            window.messagesCore.saveUIState();
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
        
        LIFECYCLE_STATES,
        MESSAGE_TYPES: window.messagesCore?.MESSAGE_TYPES || {}
    };

    window.messagesUI = messagesUI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = messagesUI;
    }
})();