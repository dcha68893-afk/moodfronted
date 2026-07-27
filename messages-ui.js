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
    const _uiLog = (...a) => { if (window.__MESSAGES_DEBUG__) console.log(...a); };

    // FIX (chat-more-btn-tap-swallowed): safeSetHTML() runs every chat-list
    // render through sanitizeHTML(), which strips ALL inline event handler
    // attributes (onclick, onmousedown, etc.) — that's by design, to block
    // script injection from any untrusted string that ends up in this HTML.
    // The side effect: the three-dot button's own onclick, and the
    // stopPropagation() calls that were supposed to protect it, never
    // attach. The only thing still listening is an older delegated listener
    // in messages-core.ui-bridge.js that opens the chat for ANY click inside
    // a .chat-item — including a tap on the three dots.
    //
    // Fix: a real (non-inline, sanitizer-proof) delegated listener, attached
    // in the CAPTURE phase so it runs before that legacy bubble-phase
    // listener. If the click landed on or inside .chat-more-btn, this opens
    // the context menu and calls stopPropagation() so the legacy listener
    // never sees the event and can't also open the chat underneath.
    if (!window.__chatMoreBtnDelegatedListenerBound) {
        window.__chatMoreBtnDelegatedListenerBound = true;
        document.addEventListener('click', function (e) {
            const moreBtn = e.target && e.target.closest && e.target.closest('.chat-more-btn');
            if (!moreBtn) return;
            e.stopPropagation();
            e.preventDefault();
            document.body.classList.remove('chat-item-pressing');
            const chatId = moreBtn.dataset && moreBtn.dataset.moreChatId;
            if (chatId && window.messagesUI && typeof window.messagesUI._showChatContextMenu === 'function') {
                window.messagesUI._showChatContextMenu(chatId, e);
            }
        }, true); // capture phase — runs before ui-bridge's bubble-phase listener
    }

    // BUG FIX (PROFILE-LIVE-UPDATE-NOT-WIRED-TO-MESSAGES-MODULE): chat.html's
    // realtime bridge fans out backend profile:updated events (a contact
    // changed their own avatar) as REALTIME_EVENT:profile:updated to every
    // iframe — but nothing in this module ever listened for it, so a
    // contact's new avatar only ever showed up in the chat list/header after
    // a full reload. This patches any already-rendered row for that user in
    // place. Checks several container selectors and both markup styles
    // (<img src> and inline background-image) since this file renders chat
    // avatars via multiple different functions that don't share one markup
    // pattern. Mirrors the same fix already applied in status-ui.js,
    // friend-ui.js, and group-core.js.
    if (!window.__messagesProfileLiveListenerBound) {
        window.__messagesProfileLiveListenerBound = true;
        window.addEventListener('message', function (event) {
            const data = event && event.data;
            if (!data || data.type !== 'REALTIME_EVENT:profile:updated') return;
            const payload = data.payload || {};
            if (!payload.userId || !payload.avatar) return;
            const uid = String(payload.userId);
            try {
                const containers = document.querySelectorAll(
                    `.contact-item[data-contact-id="${uid}"], ` +
                    `.conversation-item[data-user-id="${uid}"], ` +
                    `.chat-item[data-user-id="${uid}"], ` +
                    `.user-item[data-user-id="${uid}"]`
                );
                containers.forEach(function (container) {
                    const img = container.querySelector('img');
                    if (img) { img.src = payload.avatar; return; }
                    const bgEl = container.querySelector('[style*="background"]') || container;
                    bgEl.style.backgroundImage = `url('${payload.avatar}')`;
                    bgEl.style.backgroundSize = 'cover';
                    bgEl.style.backgroundPosition = 'center';
                    bgEl.textContent = '';
                });
                // Also patch the 1:1 chat header avatar (#hdrChatAvatar, owned by
                // chat.html) if this contact's chat happens to be open right now.
                if (window.parent && window.parent !== window && window.parent.document) {
                    const hdrAvatar = window.parent.document.getElementById('hdrChatAvatar');
                    if (hdrAvatar && hdrAvatar.dataset && String(hdrAvatar.dataset.userId) === uid) {
                        hdrAvatar.style.backgroundImage = `url('${payload.avatar}')`;
                        hdrAvatar.style.backgroundSize = 'cover';
                        hdrAvatar.style.backgroundPosition = 'center';
                        hdrAvatar.innerHTML = '';
                    }
                }
            } catch (_) { /* non-fatal — next natural re-render will pick it up */ }
        });
    }


    // FIX-AUDIT: Guaranteed local HTML escape — does NOT depend on `core` being
    // loaded. The caption rendering paths below previously did
    // `core?.escapeHtml ? core.escapeHtml(x) : x` — if core was unavailable for
    // any reason (load order race, module failure), this silently fell through
    // to raw unescaped content, a stored XSS vector. _safeEscapeHtml always
    // escapes regardless of core's load state.
    function _safeEscapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text).replace(/[&<>"'`=\/]/g, (ch) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
            "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
        })[ch] || ch);
    }



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



    function getEntityUserId(entity) {

        if (entity === null || entity === undefined) return '';

        if (typeof entity === 'object') {

            const value = entity.id ?? entity.userId ?? entity.friendId ?? entity.otherUserId;

            return value === null || value === undefined ? '' : String(value);

        }

        return String(entity);

    }



    function getConversationPeerId(conversation, currentUserId) {

        if (!conversation) return '';

        const explicitPeerId = (
            conversation.friendId ??
            conversation.otherUserId ??
            conversation.otherParticipant?.id ??
            conversation.otherParticipant?.userId ??
            conversation.pendingReceiverId
        );

        if (explicitPeerId !== null && explicitPeerId !== undefined && String(explicitPeerId) !== '') {

            return String(explicitPeerId);

        }

        const currentId = currentUserId === null || currentUserId === undefined ? '' : String(currentUserId);

        const otherParticipantId = ensureSafeArray(conversation.participantIds).find((participantId) => {

            const normalizedId = getEntityUserId(participantId);

            return normalizedId && normalizedId !== currentId;

        });

        if (otherParticipantId) {

            return String(otherParticipantId);

        }

        const otherParticipant = ensureSafeArray(conversation.participants).find((participant) => {

            const participantId = getEntityUserId(participant);

            return participantId && participantId !== currentId;

        });

        return getEntityUserId(otherParticipant);

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

        // FIX Bug6: fallback to globally-cached userId set by SessionManager on login.
        // This ensures message bubbles always resolve sent/received correctly even
        // when the core reference is not yet available during async renders.
        if (window._kynCurrentUserId) {
            return window._kynCurrentUserId;
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
            const isEventLike = error && typeof error === 'object' && !error.message && !error.stack;
            if (!isEventLike || window.__MESSAGES_DEBUG__ === true) {
                UILogger.error('UIFailsafe', 'UI Error caught', error);
            }

            

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

            // FIX: userId may be a string "3" or number 3 — accept both
            if (userId && userId !== 0 && userId !== '0' && userId !== '') {

                this._cachedCoreSessionValid = true;

                return true;

            }

            // Fallback: check localStorage/window directly
            try {
                const tok = localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('accessToken');
                const uid = localStorage.getItem('userId') || localStorage.getItem('user_id');
                if (tok && uid && uid !== '0') { this._cachedCoreSessionValid = true; return true; }
                if (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.token && window.__CHILD_SESSION__.userId) {
                    this._cachedCoreSessionValid = true; return true;
                }
            } catch(_) {}

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

            _uiLog('[UIFailsafe] Forcing UI enable');

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

            
            // FIX: do NOT set isValid=false just because userId is a string.
            // String userIds like "3" are perfectly valid — parseInt them for check.
            if (userId !== null && userId !== undefined && userId !== 0 && userId !== '0' && userId !== '') {
                isValid = true; // any truthy non-zero userId means authenticated
            }

            

            if (coreValid && !this.state.sessionValid) {

                _uiLog('[UIStateManager] Force setting sessionValid true - core has valid session');

                isValid = true;

            }

            

            if (isValid !== this.state.sessionValid) {

                _uiLog('[UIStateManager] Session validity changed:', { 

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

                    _uiLog('[UIStateManager] Force syncing session state - core has valid session');

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

                    _uiLog('[UIStateManager] Fixing mismatched session state - core has session but UI says false');

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

            

            _uiLog(`[messagesUI] Lifecycle: ${lifecycleState}`);

            

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

                if (!this._pendingFetchTimer) {

                    _uiLog('[messagesUI] Core not ACTIVE yet, polling until ready...');

                    let attempts = 0;

                    const maxAttempts = 40; // 40 × 250ms = 10 seconds max

                    const poll = () => {

                        attempts++;

                        const retryCore = getMessagesCore();

                        const retryState = retryCore?.getState?.();

                        if (retryState?.state === 'ACTIVE') {

                            this._pendingFetchTimer = null;

                            this._triggerRealDataFetch();

                        } else if (attempts < maxAttempts) {

                            this._pendingFetchTimer = setTimeout(poll, 250);

                        } else {

                            // Last resort: force-enable and fetch anyway

                            this._pendingFetchTimer = null;

                            _uiLog('[messagesUI] Core still not ACTIVE after polling — forcing fetch');

                            UIFailsafe.forceEnableUI();

                            if (retryCore && retryCore.fetchConversations) retryCore.fetchConversations();

                        }

                    };

                    this._pendingFetchTimer = setTimeout(poll, 250);

                }

                return;

            }

            

            if (!UIFailsafe.hasValidSession()) {

                _uiLog('[messagesUI] No valid session, skipping data fetch');

                return;

            }

            this._hasTriggeredInitialDataFetch = true;

            this._lastDataFetchAt = now;

            

            if (core && core.fetchConversations) {

                _uiLog('[messagesUI] Triggering real data fetch from backend');

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

                    

                    _uiLog('[UIStateManager] SessionUpdated event:', { 

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

                        const core = getMessagesCore();
                        const activeChat = (core && core.getCurrentConversation && core.getCurrentConversation()) || (core && core.ChatManager && core.ChatManager.getActiveChat && core.ChatManager.getActiveChat());
                        const incomingChatId = String(e.detail.message.chatId || e.detail.message.conversationId || '');
                        const _ts = function(m) { const v = m.createdAt || m.timestamp || 0; return typeof v === 'string' ? new Date(v).getTime() : Number(v); };
                        if (activeChat && incomingChatId && String(activeChat.id) === incomingChatId) {
                            const allMsgs = (core && core.getMessages && core.getMessages()) || [];
                            const chatMsgs = allMsgs.filter(function(m) { return String(m.chatId || m.conversationId || '') === incomingChatId; }).sort(function(a,b) { return _ts(a)-_ts(b); });
                            // FIX: Never fall back to allMsgs — that causes cross-chat contamination.
                            // If chatMsgs is empty (race condition), inject the new message directly.
                            const msgsToRender = chatMsgs.length > 0 ? chatMsgs : [e.detail.message];
                            UIRenderer.renderMessages(msgsToRender, activeChat, core && core.getCurrentUser && core.getCurrentUser());
                            try { var c2=document.getElementById('messagesContainer'); if(c2) requestAnimationFrame(function(){c2.scrollTop=c2.scrollHeight;}); } catch(_e){}
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

                        _uiLog('[UIStateManager] Periodic sync - session valid changed:', { was: this.state.sessionValid, now: sessionValid });

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

                        _uiLog('[UIStateManager] Periodic sync - fixing mismatched session state');

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

                _uiLog('[messagesUI] No valid session, waiting for authentication');

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

            // FIX: Do NOT display any "offline" or "cached data" text on screen.

            // The app keeps working with cached data silently — no banner needed.

            // Just ensure the UI stays interactive (no blocking overlays).

            const banners = [

                document.getElementById('kyn-offline-banner'),

                document.querySelector('.offline-banner'),

                document.querySelector('[data-offline-banner]')

            ];

            banners.forEach(b => { if (b) b.style.display = 'none'; });

        },



        _hideOfflineUI() {

            const banner = document.getElementById('kyn-offline-banner');

            if (banner) banner.style.display = 'none';

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
            const _rawName = chat.friendName || chat.name || 'User';
            nameEl.textContent = _rawName.replace(/\s+User$/i, '').trim() || _rawName;
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

            

            let avatarUrl = (window.Identity && window.Identity.resolveAvatar(chat)) || chat.friendAvatar || chat.avatar; // IDENTITY-CENTRALIZATION

            

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



    // FIX-DOUBLE-DECRYPT-RACE-2: two independent code paths in this file can
    // decrypt an incoming E2E message — the normal render pipeline
    // (UIRenderer._decryptRenderedMessages) and a separate direct-append
    // bypass listener (_appendMessageBubbleDirect, further down this file)
    // that renders real-time messages immediately without waiting for a full
    // re-render. They operate on separate message object copies, so neither
    // one's per-object _decrypted/_decryptAttempted flags are visible to the
    // other. Because the underlying ratchet advances irreversibly the instant
    // decryptFromChat() runs — success or failure — if both paths decrypt the
    // same envelope, the second call corrupts the receive chain for every
    // message after it (this is what produced "[Decryption failed — message
    // may be out of order or corrupted]"). window.__kynClaimDecrypt(key)
    // gives whichever path gets there first exclusive rights to decrypt a
    // given message id; the other path must skip it and let the first one's
    // render stand.
    window.__kynDecryptClaims = window.__kynDecryptClaims || new Set();
    window.__kynClaimDecrypt = window.__kynClaimDecrypt || function(key) {
        key = String(key || '');
        if (!key) return true; // no id to dedupe on — let it proceed, can't do better
        if (window.__kynDecryptClaims.has(key)) return false;
        window.__kynDecryptClaims.add(key);
        return true;
    };
    // Writes a successful decrypt back into ChatManager's canonical store
    // (whichever path performed it), so a later full re-render — which reads
    // from ChatManager._messages, not from either path's local copy — shows
    // the plaintext instead of regressing back to raw ciphertext.
    window.__kynCommitDecrypt = window.__kynCommitDecrypt || function(id, localId, plaintext) {
        try {
            const cm = window.ChatManager;
            if (!cm || !cm._messagesMap) return;
            const stored = cm._messagesMap.get(String(id || '')) || (localId && cm._messagesMap.get(String(localId)));
            if (stored) {
                stored.content = plaintext;
                stored._decrypted = true;
                stored._decryptAttempted = true;
                stored._decryptInFlight = false;

                // FIX-ROOT-CAUSE-DECRYPT-ON-RELOAD: the in-memory update above
                // only lasts for this page session. Without also writing the
                // plaintext into the durable local cache, the message stays
                // stored as ciphertext there — so every future reload (or any
                // re-render sourced from that cache instead of a live socket
                // event) feeds the SAME ciphertext through decryptFromChat()
                // again. The Double Ratchet guard added alongside this fix
                // catches that safely now instead of silently corrupting the
                // chain, but it still means the message shows a transient
                // "already processed" flash and wastes a decrypt cycle every
                // single reload, forever. Persist the plaintext once, here,
                // so a reload reads it straight from cache and never asks the
                // ratchet to decrypt that message again at all.
                try {
                    if (window.KynectaLocalStore?.saveMessage && (stored.id || stored.serverId)) {
                        window.KynectaLocalStore.saveMessage({
                            id: stored.id,
                            serverId: stored.serverId || stored.id,
                            localId: stored.localId,
                            chatId: stored.chatId || stored.conversationId,
                            content: plaintext,
                            encrypted: false
                        }).catch(() => {});
                    }
                } catch (_) { /* best-effort only */ }
            }
        } catch (_) { /* best-effort only */ }
    };

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

            this.messageTemplates.set('call', this._createCallMessageTemplate);

            this.messageTemplates.set('voice_call', this._createCallMessageTemplate);

            this.messageTemplates.set('video_call', this._createCallMessageTemplate);

            // ── Phase 1: new message types ───────────────────────────────────
            this.messageTemplates.set('gif',        this._createGifMessageTemplate);
            this.messageTemplates.set('view_once',  this._createViewOnceMessageTemplate);

            // ── Phase 2: new message types ───────────────────────────────────
            this.messageTemplates.set('sticker',    this._createStickerMessageTemplate);

        },



        _setupEventListeners() {

            // PHASE10: Guard against duplicate listener attachment (called by multiple code paths)
            if (this._renderListenersSetup) return;
            this._renderListenersSetup = true;

            window.addEventListener('renderMessages', (e) => {

                UIFailsafe.queueAction(() => {

                    const currentChat = e.detail.currentChat;
                    let messages = e.detail.messages || [];
                    let currentUser = e.detail.currentUser;
                    if (!currentUser) {
                        const _uid = getCurrentUserId();
                        if (_uid) currentUser = { id: _uid, userId: _uid };
                    }
                    const _ts = function(m) { const v = m.createdAt || m.timestamp || 0; return typeof v === 'string' ? new Date(v).getTime() : Number(v); };
                    // FIX-MSG-VANISH-B: same root cause as FIX-MSG-VANISH-A in
                    // messages-core.ui-bridge.js's renderRealtimeUpdate, but that
                    // fix only normalized the 'pending_' prefix in ITS OWN filter —
                    // this handler runs a second, independent chatId match right
                    // after and was never given the same normalization. A message
                    // stored under chatId 'pending_5' (sent before the server
                    // confirmed the real numeric id) failed this raw `mid === cid`
                    // check the instant currentChat.id became the real '5' — e.g.
                    // exactly when the other user's reply arrived — silently
                    // wiping the whole panel to an empty render even though
                    // renderRealtimeUpdate had already found and forwarded the
                    // message correctly.
                    const _stripPend2 = function(s) { s = String(s || ''); return s.startsWith('pending_') ? s.slice(8) : s; };
                    if (currentChat && currentChat.id && messages.length > 0) {
                        const cid = String(currentChat.id);
                        const cidStripped = _stripPend2(cid);
                        const filtered = messages.filter(function(m) {
                            const mid = String(m.chatId || m.conversationId || '');
                            const midStripped = _stripPend2(mid);
                            return mid === cid || mid === '' || midStripped === cidStripped;
                        });
                        if (filtered.length > 0) {
                            messages = filtered.sort(function(a,b) { return _ts(a)-_ts(b); });
                        } else {
                            this.renderMessages([], currentChat, currentUser);
                            return;
                        }
                    }
                    this.renderMessages(messages, currentChat, currentUser);

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

                    if (!e.detail || !e.detail.message) return;
                    const core = getMessagesCore();
                    const currentChat = core && core.getCurrentConversation && core.getCurrentConversation();

                    const msg = e.detail.message;
                    const incomingChatId = String(msg.chatId || msg.conversationId || '');
                    const _ts = function(m) { const v = m.createdAt || m.timestamp || 0; return typeof v === 'string' ? new Date(v).getTime() : Number(v); };

                    // ROOT-FIX: Always re-render the sidebar so unread badges update even when
                    // the user is NOT inside the chat panel. The old code bailed with
                    // `if (!currentChat) return` which meant the badge never appeared.
                    const chatPanel = document.getElementById('chatPanel');
                    const panelIsHidden = !chatPanel || chatPanel.classList.contains('hidden');

                    try {
                        const _cm = core && core.ChatManager;
                        if (_cm) {
                            window.dispatchEvent(new CustomEvent('renderChatsList', {
                                detail: {
                                    conversations: (_cm._conversations || []),
                                    currentChat: _cm._activeConversation,
                                    currentCategory: _cm.getCurrentCategory ? _cm.getCurrentCategory() : 'all',
                                    messageDrafts: {}
                                }
                            }));
                        }
                    } catch (_e) {}

                    // Only render message bubbles when the correct chat panel is open
                    let shouldRender = !panelIsHidden && !!(incomingChatId && currentChat && String(currentChat.id) === incomingChatId);
                    if (!shouldRender && !panelIsHidden && currentChat && msg.senderId) {
                        const _afid = String(currentChat.friendId || currentChat.otherUserId ||
                            (currentChat.otherParticipant && currentChat.otherParticipant.id) || '');
                        if (_afid && _afid === String(msg.senderId)) shouldRender = true;
                    }
                    if (!shouldRender) return;

                    let currentUser = core && core.getCurrentUser && core.getCurrentUser();
                    if (!currentUser) {
                        const _uid = getCurrentUserId();
                        if (_uid) currentUser = { id: _uid, userId: _uid };
                    }

                    const allMsgs = (core && core.getMessages && core.getMessages()) || [];
                    const cid = currentChat ? String(currentChat.id) : '';
                    let chatMsgs = allMsgs.filter(function(m) {
                        const mid = String(m.chatId || m.conversationId || '');
                        return mid === cid || mid === incomingChatId || mid === '';
                    }).sort(function(a,b) { return _ts(a)-_ts(b); });

                    const _has = chatMsgs.some(function(m) { return msg.id && m.id && String(m.id) === String(msg.id); });
                    if (!_has) chatMsgs = chatMsgs.concat([msg]).sort(function(a,b){return _ts(a)-_ts(b);});

                    this.renderMessages(chatMsgs, currentChat, currentUser);
                    try {
                        var _c = document.getElementById('messagesContainer');
                        if (_c) requestAnimationFrame(function(){ _c.scrollTop = _c.scrollHeight; });
                    } catch(_e){}

                });

            });

            

            window.addEventListener('messageStatusUpdated', (e) => {

                UIFailsafe.queueAction(() => {

                    const messageEl = UIFailsafe.safeQuerySelector(`[data-message-id="${e.detail.messageId}"]`);

                    if (messageEl) {

                        const statusIcon = messageEl.querySelector('.message-status i');
                        const statusSpan = messageEl.querySelector('.message-status'); // FIX: was undefined (ReferenceError), which aborted this whole handler

                        if (statusIcon) {

                            const status = e.detail.status;

                            const iconClass = status === 'sending' ? 'fa-clock' :

                                            status === 'failed' ? 'fa-exclamation-circle' :

                                            (status === 'read' || status === 'delivered') ? 'fa-check-double' : 'fa-check';

                            statusIcon.className = `fas ${iconClass}`;
                            statusIcon.style.color = ''; // FIX-2: let CSS class control colour
                            if (statusSpan) statusSpan.className = `message-status status-${status}`;

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

            const coreIsActive = !!(core && (
                (typeof core.getState === 'function' && (() => {
                    try { const st = core.getState(); return st === 'ACTIVE' || !!(st && st.state === 'ACTIVE'); } catch(_){ return false; }
                })()) ||
                (core.getCurrentConversation && !!core.getCurrentConversation()) ||
                (core.ChatManager && !!core.ChatManager._activeConversation)
            ));

            return (lifecycleState === LIFECYCLE_STATES.ACTIVE && sessionValid) || coreHasSession || coreIsActive;

        },



        _getPassiveLoadingState() {
            // Return invisible placeholder — no visible spinner box while lifecycle boots
            const lifecycleState = UIStateManager.getState('lifecycleState');
            return `<div class="passive-loading-state" data-lifecycle="${lifecycleState}" style="opacity:0;height:0;overflow:hidden;pointer-events:none;"></div>`;
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

                // FIX-MSG-CLEAR-ON-REFRESH: don't wipe an already-rendered chat just
                // because this particular call happened to receive an empty array —
                // that's frequently a transient state (e.g. the local/IndexedDB or
                // server fetch hasn't resolved yet after a refresh, or a filter on
                // another call site produced zero matches). Only show the "no
                // messages" empty state when we don't already have this exact chat's
                // history rendered; otherwise leave what's on screen untouched.
                const _alreadyRenderedThisChat = container.dataset.renderedChatId === currentChatId &&
                    container.querySelectorAll('[data-message-id]').length > 0;
                if (_alreadyRenderedThisChat) {
                    return;
                }

                container.innerHTML = '';

                this._lastRenderedMessagesSignature = `${currentChatId}|empty`;

                UIFailsafe.safeSetHTML(container, this._getEmptyMessagesHTML(currentChat));

                return;

            }



            if (this._lastRenderedMessagesSignature === renderSignature) {

                return;

            }

            // Smart render: only clear container when switching conversations
            // When adding new messages to same conversation, append only new ones
            const prevChatId = container.dataset.renderedChatId || '';
            const isSameConversation = prevChatId && prevChatId === currentChatId;

            if (isSameConversation && normalizedMessages.length > 0) {
                // Find which messages are already rendered.
                // FIX-AUDIT: also include IDs trimmed by the DOM-windowing module
                // (see end of file) — those messages are still "known/rendered"
                // from the user's perspective, just detached from the DOM for
                // performance. Without this, a trimmed message would look "new"
                // here and get re-appended as a visual duplicate when restored.
                const _trimmedIds = (typeof window._kynGetTrimmedIds === 'function') ? window._kynGetTrimmedIds() : null;
                const renderedIds = new Set(
                    Array.from(container.querySelectorAll('[data-message-id]'))
                        .map(el => el.dataset.messageId)
                );
                if (_trimmedIds) _trimmedIds.forEach(id => renderedIds.add(id));
                const newMessages = normalizedMessages.filter(m =>
                    m.id && !renderedIds.has(String(m.id))
                );
                // Only do full re-render if message order changed or messages were deleted.
                // FIX-AUDIT: containerMsgCount must include trimmed-but-known messages too,
                // otherwise windowing would make this number artificially low and could
                // spuriously trigger fullReRenderNeeded once enough bubbles are trimmed.
                const containerMsgCount = container.querySelectorAll('[data-message-id]').length + (_trimmedIds ? _trimmedIds.size : 0);
                const fullReRenderNeeded = containerMsgCount > normalizedMessages.length;

                if (!fullReRenderNeeded && newMessages.length > 0) {
                    // Append only new messages
                    const grouped = this._groupMessagesByDate(newMessages);
                    this._renderMessageBatches(container, grouped, currentUser);
                    this._lastRenderedMessagesSignature = renderSignature;
                    this.scrollToBottom(container);
                    return;
                } else if (!fullReRenderNeeded && newMessages.length === 0) {
                    // No new messages, just update signatures and statuses
                    this._lastRenderedMessagesSignature = renderSignature;
                    return;
                }
                // Fall through to full re-render only when needed
            }

            // CRITICAL: Before clearing, collect any DOM messages NOT in normalizedMessages
            // (added directly by _appendMessageBubbleDirect visibility patch)
            // so we merge them into the render list and don't lose them
            const existingDomIds = new Set(normalizedMessages.map(m => String(m.id || '')));
            const domOnlyMessages = [];
            const domOnlyRawNodes = []; // FIX-MSG-VANISH-B: last-resort clones, never lost
            // FIX-MSG-ORDER: track the nearest preceding bubble id that WILL be
            // re-rendered (from normalizedMessages or recovered domOnlyMessages), so
            // any raw-fallback node can be reinserted in its correct relative position
            // afterward instead of always being dumped at the end of the container.
            let _lastAnchorId = null;
            container.querySelectorAll('[data-message-id]').forEach(el => {
                const domId = el.dataset.messageId;
                // FIX-MSG-VANISH-B: previously excluded any id starting with 'tmp_', but
                // that's exactly the placeholder id a locally-sent message carries before
                // the server confirms it — meaning THIS safety net was disabled for the
                // one message most likely to get dropped by an upstream filter (e.g. a
                // pending_<id> chatId mismatch when a reply triggers a re-render). A
                // currently-visible bubble should never be silently deleted just because
                // its id looks temporary.
                if (domId && !existingDomIds.has(domId)) {
                    // Try ChatManager's map first (keyed by current id)...
                    let stored = window.ChatManager && window.ChatManager._messagesMap && window.ChatManager._messagesMap.get(domId);
                    // ...but once a temp/local id is reconciled to a real server id,
                    // _messagesMap deletes the old temp key, so also scan _messages by
                    // id OR localId so a stale DOM id still finds its message.
                    if (!stored && window.ChatManager && Array.isArray(window.ChatManager._messages)) {
                        stored = window.ChatManager._messages.find(m =>
                            m && (String(m.id || '') === domId || String(m.localId || '') === domId));
                    }
                    if (stored) {
                        domOnlyMessages.push(stored);
                        _lastAnchorId = domId;
                    } else {
                        // Nothing recoverable as structured data — keep the raw node itself
                        // as an absolute last resort so the bubble is never simply deleted.
                        domOnlyRawNodes.push({ node: el.cloneNode(true), afterId: _lastAnchorId });
                    }
                } else if (domId) {
                    _lastAnchorId = domId;
                }
            });
            // Merge dom-only messages into normalizedMessages before rendering
            const allMessages = domOnlyMessages.length > 0
                ? [...normalizedMessages, ...domOnlyMessages].sort((a, b) => {
                    const ts = m => { const v = m.createdAt || m.timestamp || 0; return typeof v === 'string' ? new Date(v).getTime() : Number(v); };
                    return ts(a) - ts(b);
                })
                : normalizedMessages;

            container.innerHTML = '';
            container.dataset.renderedChatId = currentChatId;

            const groupedMessages = this._groupMessagesByDate(allMessages);

            this._renderMessageBatches(container, groupedMessages, currentUser);

            // FIX-MSG-ORDER / FIX-MSG-VANISH-B: re-attach any bubbles that had no
            // recoverable structured data, each right after the bubble it originally
            // followed (falling back to the very start of the container if it was the
            // first message), instead of always appending at the end — which previously
            // visibly scrambled send/receive order whenever this fallback fired.
            if (domOnlyRawNodes.length > 0) {
                domOnlyRawNodes.forEach(({ node, afterId }) => {
                    const anchorEl = afterId ? container.querySelector(`[data-message-id="${CSS.escape(String(afterId))}"]`) : null;
                    if (anchorEl) {
                        anchorEl.insertAdjacentElement('afterend', node);
                    } else {
                        container.insertBefore(node, container.firstChild);
                    }
                });
            }

            this._lastRenderedMessagesSignature = renderSignature;

            this.scrollToBottom(container);

            // FIX-E2E-DECRYPT-WIRING: messages get encrypted before sending
            // (see messages-core.js's encryptForChat call) but nothing ever
            // called the matching decryptFromChat when rendering — so
            // encrypted content (a JSON envelope) was displayed as raw text
            // instead of the actual message. Decrypt in place, post-render,
            // so this works regardless of which of renderMessages' several
            // call sites triggered this render.
            this._decryptRenderedMessages(allMessages, currentChat, currentUser);
        },

        // FIX-E2E-DECRYPT-WIRING: scan just-rendered messages for encrypted
        // envelopes and replace the bubble's visible text with the decrypted
        // plaintext once available. Non-blocking — the bubble already shows
        // something (the raw envelope) synchronously; this patches it in
        // place a moment later, same pattern as other async UI patches in
        // this file (avatar/name updates, etc.).
        _decryptRenderedMessages(messages, currentChat, currentUser, _attemptsLeft) {
            if (!Array.isArray(messages) || messages.length === 0) return;
            // FIX-DOUBLE-DECRYPT-RACE: also exclude messages that are already
            // in-flight or have already been attempted (success OR failure).
            // decryptFromChat() is async, and renderMessages() can fire again
            // (typing indicator, status update, a new message arriving) before
            // the first call resolves — without this guard, the SAME still-
            // "!m._decrypted" message would be handed to decryptFromChat() a
            // second time. The Double Ratchet is stateful: a second decrypt of
            // the same envelope permanently advances/desyncs the receive chain,
            // which is what produced "[Decryption failed — message may be out
            // of order or corrupted]" on every message after it in that chat.
            // FIX-DOUBLE-DECRYPT-RACE-2: also consult the shared cross-path claim
            // registry (see window.__kynClaimDecrypt below) so a message that the
            // OTHER decrypt path (the direct-append bypass listener further down
            // this file) has already claimed doesn't get decrypted a second time
            // here — the two paths work from separate message object copies, so
            // the per-object _decryptInFlight/_decryptAttempted flags above don't
            // protect against each other.
            const pending = messages.filter(m => m && (!m.type || m.type === 'text') &&
                typeof m.content === 'string' && m.content.charAt(0) === '{' && m.content.indexOf('"v"') !== -1 &&
                !m._decrypted && !m._decryptAttempted && !m._decryptInFlight &&
                (window.__kynClaimDecrypt ? window.__kynClaimDecrypt(m.id || m.localId) : true));
            if (pending.length === 0) return;

            // FIX (bubbles must never stay invisible forever): the old version
            // returned immediately if E2E wasn't enabled/loaded yet, which
            // under the new hidden-until-ready render (no ciphertext, no
            // "Decrypting…" text) meant those messages would just never
            // appear at all. Give the module a moment to finish loading —
            // it usually does within a second or two — before falling back.
            if (!window.KynectaE2E || !window.KynectaE2E.enabled) {
                const attemptsLeft = _attemptsLeft === undefined ? 6 : _attemptsLeft;
                if (attemptsLeft > 0) {
                    setTimeout(() => this._decryptRenderedMessages(messages, currentChat, currentUser, attemptsLeft - 1), 300);
                    return;
                }
                // Module never became available — reveal with a neutral
                // fallback rather than leaving these messages invisible.
                pending.forEach(message => this._revealDecryptedBubble(message, '[Unable to decrypt message]', true));
                return;
            }

            const currentUserId = currentUser?.id || currentUser?.userId;
            const otherPartyId = currentChat?.friendId || currentChat?.otherUserId || currentChat?.id;
            const chatId = currentChat?.id;
            pending.forEach(message => {
                const raw = message.content;
                const isSent = String(message.senderId) === String(currentUserId);
                const senderForDecrypt = isSent ? otherPartyId : message.senderId;
                if (!senderForDecrypt || !chatId) {
                    this._revealDecryptedBubble(message, '[Unable to decrypt message]', true);
                    return;
                }
                // Claim this message synchronously, before the async call starts,
                // so a second _decryptRenderedMessages() pass (which can run
                // before this promise resolves) skips it via the `pending` filter.
                message._decryptInFlight = true;
                window.KynectaE2E.decryptFromChat(raw, chatId, senderForDecrypt).then(plaintext => {
                    if (!plaintext || plaintext === raw) {
                        this._revealDecryptedBubble(message, '[Unable to decrypt message]', true);
                        return;
                    }
                    this._revealDecryptedBubble(message, plaintext, false);
                }).catch(() => {
                    this._revealDecryptedBubble(message, '[Unable to decrypt message]', true);
                });
            });
        },

        // Fills in the real (or, on failure, a neutral fallback — never raw
        // ciphertext) text and un-hides the bubble that was rendered with
        // the `pending-decrypt` class. Caches the result on the message
        // object so a later re-render shows it immediately, no re-decrypt.
        _revealDecryptedBubble(message, text, isFallback) {
            const wrapper = document.querySelector(`[data-message-id="${message.id}"]`);
            const bubble = wrapper ? wrapper.querySelector('.message-content') : null;
            if (bubble) {
                const core = this._getCore ? this._getCore() : null;
                bubble.innerHTML = (!isFallback && core?.formatMessageText) ? core.formatMessageText(text) : _safeEscapeHtml(text);
            }
            if (wrapper) wrapper.classList.remove('pending-decrypt');
            // FIX-DOUBLE-DECRYPT-RACE: mark as attempted regardless of outcome.
            // The ratchet key for this envelope is consumed the instant decrypt()
            // runs, whether it succeeds or fails — retrying a failed one on a
            // later render would call decryptFromChat() again on the same
            // envelope with an already-advanced chain, turning one bad message
            // into a permanent decrypt failure for every message after it.
            message._decryptInFlight = false;
            message._decryptAttempted = true;
            if (!isFallback) {
                message.content = text;
                message._decrypted = true;
                if (window.__kynCommitDecrypt) window.__kynCommitDecrypt(message.id, message.localId, text);
            }
        },



        _renderMessageBatches(container, groupedMessages, currentUser) {

            let html = '';

            let batchCount = 0;

            // FIX (WhatsApp-layout spec item 7 — spacing): track the previous
            // message rendered so consecutive messages from the same sender
            // within a short window get a tighter 'grouped' spacing class,
            // and the gap goes back to normal whenever the sender changes or
            // there's a time jump. Resets at each date separator too.
            const _tsOf = function(m) {
                const v = (m && (m.createdAt || m.timestamp)) || 0;
                return typeof v === 'string' ? new Date(v).getTime() : Number(v) || 0;
            };
            const GROUP_WINDOW_MS = 60 * 1000;
            let _prevMsg = null;

            for (const [date, dateMessages] of Object.entries(groupedMessages)) {

                html += `<div class="message-date-separator"><span>${date}</span></div>`;

                _prevMsg = null; // a new date always starts a fresh (ungrouped) message

                for (const message of dateMessages) {

                    const template = this.messageTemplates.get(message.type || 'text');

                    let messageHtml;
                    if (template) {

                        messageHtml = template.call(this, message, currentUser);

                    } else {

                        messageHtml = this.messageTemplates.get('text').call(this, message, currentUser);

                    }

                    const isGrouped = !!(_prevMsg &&
                        String(_prevMsg.senderId) === String(message.senderId) &&
                        (_tsOf(message) - _tsOf(_prevMsg)) < GROUP_WINDOW_MS &&
                        (_tsOf(message) - _tsOf(_prevMsg)) >= 0);
                    if (isGrouped) {
                        messageHtml = messageHtml.replace('class="message ', 'class="message grouped ');
                    }
                    html += messageHtml;
                    _prevMsg = message;

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

            const core = getMessagesCore();
            // FIX: parse ISO strings to ms for reliable numeric sort
            const _ts = function(m) { const v = m.createdAt || m.timestamp || 0; return typeof v === 'string' ? new Date(v).getTime() : Number(v); };
            // Sort ALL messages by server timestamp ASC — strict timeline, no sender batching
            const sorted = [...messages].sort(function(a, b) { return _ts(a) - _ts(b); });
            // Map preserves insertion order = chronological date order
            const groupMap = new Map();
            sorted.forEach(function(msg) {
                const ms = _ts(msg);
                const date = (core && core.formatDate) ? core.formatDate(ms) : new Date(ms).toLocaleDateString();
                if (!groupMap.has(date)) groupMap.set(date, []);
                groupMap.get(date).push(msg);
            });
            const groups = {};
            groupMap.forEach(function(msgs, date) { groups[date] = msgs; });
            return groups;

        },



        _createTextMessageTemplate(message, currentUser) {

            const core = getMessagesCore();

            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();

            const isSent = String(message.senderId) === String(currentUserId);

            const status = message.status || 'sent';

            const statusIcon = status === 'sending' ? 'fa-clock' :

                              status === 'failed' ? 'fa-exclamation-circle' :

                              (status === 'read' || status === 'delivered') ? 'fa-check-double' : 'fa-check';

            

            const reactions = this._renderReactions(message.reactions);

            let replyIndicator = '';
            if (message.replyTo || message.replyToId) {
                const rd = message.replyTo || {};
                const _rRawContent = rd.content || rd.text || '';
                // FIX (ciphertext leak in reply quotes): the main message body
                // already hides undecrypted E2E envelopes via _isEncryptedEnvelope
                // below, but this reply-quote preview used rd.content directly —
                // so replying to / being replied to on a message that hadn't
                // finished decrypting yet showed raw ciphertext JSON in the quote
                // bar. Apply the same envelope heuristic here.
                const _rIsEncryptedEnvelope = !rd._decrypted && typeof _rRawContent === 'string' &&
                    _rRawContent.charAt(0) === '{' && _rRawContent.indexOf('"v"') !== -1;
                const rContent = _rIsEncryptedEnvelope ? '' : _rRawContent;
                const rSender = rd.senderName || (rd.sender && rd.sender.username) || '';
                const rPreview = rContent.length > 60 ? rContent.substring(0, 60) + '\u2026' : rContent;
                const rId = String(rd.id || rd.messageId || '').replace(/[^0-9]/g, ''); // numeric-only, no injection
                // FIX-XSS: escape user-controlled strings before innerHTML injection
                const _esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
                replyIndicator = '<div class="reply-quote" onclick="window.messagesUI&&window.messagesUI.scrollToMessage&&window.messagesUI.scrollToMessage(\'' + _esc(rId) + '\')">' +
                    '<div class="reply-quote-bar"></div><div class="reply-quote-body">' +
                    (rSender ? '<span class="reply-quote-sender">' + _esc(rSender) + '</span>' : '') +
                    '<span class="reply-quote-text">' + (_esc(rPreview) || '\uD83D\uDCCE Media') + '</span>' +
                    '</div></div>';
            }

            const editedIndicator = message.edited ? '<span class="edited-indicator">(edited)</span>' : '';

            const deletedClass = message.deleted ? 'deleted-message' : '';

            const failedClass = status === 'failed' ? 'message-failed' : '';

            const sendingClass = status === 'sending' ? 'message-sending' : '';

            // FIX (ciphertext AND any visible "decrypting" state must never
            // render — decryption happens fully in the background, only the
            // real final message is ever shown): detect the same encrypted-
            // envelope heuristic _decryptRenderedMessages uses, before ever
            // building HTML. An encrypted-and-not-yet-decrypted message
            // renders with empty content and a `pending-decrypt` class that
            // CSS hides entirely (no ciphertext, no loading text, no empty
            // box) — _decryptRenderedMessages fills in the real text and
            // removes that class once plaintext is actually ready.
            const _rawContent = message.content;
            const _isEncryptedEnvelope = !message._decrypted && typeof _rawContent === 'string' &&
                _rawContent.charAt(0) === '{' && _rawContent.indexOf('"v"') !== -1;

            const content = _isEncryptedEnvelope
                ? ''
                : (core?.formatMessageText ? 

                core.formatMessageText(message.content) : 

                _safeEscapeHtml(message.content));

            const pendingDecryptClass = _isEncryptedEnvelope ? 'pending-decrypt' : '';

            // FIX: Always use createdAt (real server time) first, fallback to timestamp

            const msgTs = message.createdAt || message.timestamp || Date.now();

            const time = core?.formatTime ? 

                core.formatTime(msgTs) : 

                new Date(msgTs).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:true});

            

            const safeMessage = JSON.stringify(_isEncryptedEnvelope ? { ...message, content: '' } : message).replace(/"/g, '&quot;');

            

            return `

                <div class="message ${isSent ? 'sent' : 'received'} ${deletedClass} ${failedClass} ${sendingClass} ${pendingDecryptClass}" data-message-id="${message.id}" data-message-type="text" data-status="${status}">

                    <div class="message-bubble ${isSent ? 'sent' : 'received'}" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">

                        ${replyIndicator}

                        <div class="message-content">${content}</div>

                        <div class="message-meta">

                            <span class="message-time">${time}</span>

                            ${editedIndicator}

                            ${isSent ? `<span class="message-status status-${status}"><i class="fas ${statusIcon}"></i></span>` : ''}

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

                              (status === 'read' || status === 'delivered') ? 'fa-check-double' : 'fa-check';

            

            const reactions = this._renderReactions(message.reactions);

            const time = core?.formatTime ? 

                core.formatTime(message.createdAt || message.timestamp) : 

                new Date(message.createdAt || message.timestamp).toLocaleTimeString([], {hour:"numeric",minute:"2-digit",hour12:true});

            

            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');

            

            return `

                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="image" data-status="${status}">

                    <div class="message-bubble" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">

                        <div class="message-image" onclick="window.messagesUI?.viewMedia('${message.mediaUrl || message.fileUrl || message.content}', '${message.fileName || 'image'}')">

                            ${(() => {
                                // FIX: window.__mediaAutoDownload was propagated all the way down from
                                // Settings (chat.autoDownloadMedia) but nothing ever actually checked it —
                                // images always loaded immediately regardless of the setting. Received
                                // images now respect it: when auto-download is off, show a tap-to-load
                                // placeholder instead of fetching the image. Your own sent images always
                                // load immediately since you already have that data locally.
                                const _mediaSrc = message.mediaUrl || message.fileUrl || message.content;
                                const _autoDl = window.__mediaAutoDownload !== false; // default true, matches AppSettings default
                                if (isSent || _autoDl) {
                                    return `<img src="${_mediaSrc}" alt="${message.fileName || 'Image'}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='flex')">
                            <div style="display:none;align-items:center;justify-content:center;padding:12px;color:#888;font-size:13px">📷 Image unavailable</div>`;
                                }
                                return `<div class="message-image-placeholder" data-media-src="${_mediaSrc}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;color:#888;font-size:13px;cursor:pointer;background:rgba(0,0,0,0.04);border-radius:8px" onclick="event.stopPropagation();window.messagesUI?.loadMediaOnDemand(this)">
                                <i class="fas fa-download"></i>
                                <span>Tap to download image</span>
                            </div>`;
                            })()}

                        </div>

                        ${message.content && message.type === 'image' && message.content !== (message.mediaUrl||message.fileUrl) ? `<div class="message-caption">${_safeEscapeHtml(message.content)}</div>` : ''}

                        <div class="message-meta">

                            <span class="message-time">${time}</span>

                            ${isSent ? `<span class="message-status status-${status}"><i class="fas ${statusIcon}"></i></span>` : ''}

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

                              (status === 'read' || status === 'delivered') ? 'fa-check-double' : 'fa-check';

            

            const reactions = this._renderReactions(message.reactions);

            const time = core?.formatTime ? 

                core.formatTime(message.createdAt || message.timestamp) : 

                new Date(message.createdAt || message.timestamp).toLocaleTimeString([], {hour:"numeric",minute:"2-digit",hour12:true});

            

            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');

            

            return `

                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="video" data-status="${status}">

                    <div class="message-bubble" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">

                        <div class="message-video" onclick="window.messagesUI?.playVideo('${message.mediaUrl || message.fileUrl || message.content}')">

                            <video src="${message.mediaUrl || message.fileUrl || message.content}" poster="${message.thumbnail || ''}" controls preload="metadata"></video>

                        </div>

                        ${message.content && message.content !== (message.mediaUrl||message.fileUrl) ? `<div class="message-caption">${_safeEscapeHtml(message.content)}</div>` : ''}

                        <div class="message-meta">

                            <span class="message-time">${time}</span>

                            ${isSent ? `<span class="message-status status-${status}"><i class="fas ${statusIcon}"></i></span>` : ''}

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

                              (status === 'read' || status === 'delivered') ? 'fa-check-double' : 'fa-check';

            

            const reactions = this._renderReactions(message.reactions);

            const duration = message.duration ? this._formatDuration(message.duration) : '';

            const time = core?.formatTime ? 

                core.formatTime(message.createdAt || message.timestamp) : 

                new Date(message.createdAt || message.timestamp).toLocaleTimeString([], {hour:"numeric",minute:"2-digit",hour12:true});

            

            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');

            

            return `

                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="audio" data-status="${status}">

                    <div class="message-bubble" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">

                        <div class="message-audio">

                            <button class="audio-play-btn" onclick="this.classList.toggle('playing'); window.messagesUI?.playAudio('${message.id}', '${message.mediaUrl || message.fileUrl || message.content}', ${message.duration || 0})">

                                <i class="fas fa-play"></i>

                            </button>

                            <div class="audio-waveform" id="waveform-${message.id}"></div>

                            <span class="audio-duration">${duration}</span>

                        </div>

                        <div class="message-meta">

                            <span class="message-time">${time}</span>

                            ${isSent ? `<span class="message-status status-${status}"><i class="fas ${statusIcon}"></i></span>` : ''}

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

                              (status === 'read' || status === 'delivered') ? 'fa-check-double' : 'fa-check';

            

            const reactions = this._renderReactions(message.reactions);

            const fileSize = message.fileSize && core?.formatFileSize ? 

                core.formatFileSize(message.fileSize) : '';

            const fileIcon = this._getFileIcon(message.fileName || '');

            const time = core?.formatTime ? 

                core.formatTime(message.createdAt || message.timestamp) : 

                new Date(message.createdAt || message.timestamp).toLocaleTimeString([], {hour:"numeric",minute:"2-digit",hour12:true});

            

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

                            ${isSent ? `<span class="message-status status-${status}"><i class="fas ${statusIcon}"></i></span>` : ''}

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

                              (status === 'read' || status === 'delivered') ? 'fa-check-double' : 'fa-check';

            

            const reactions = this._renderReactions(message.reactions);

            const time = core?.formatTime ? 

                core.formatTime(message.createdAt || message.timestamp) : 

                new Date(message.createdAt || message.timestamp).toLocaleTimeString([], {hour:"numeric",minute:"2-digit",hour12:true});

            

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

                            ${isSent ? `<span class="message-status status-${status}"><i class="fas ${statusIcon}"></i></span>` : ''}

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

                              (status === 'read' || status === 'delivered') ? 'fa-check-double' : 'fa-check';

            

            const reactions = this._renderReactions(message.reactions);

            const totalVotes = message.options?.reduce((sum, opt) => sum + (opt.votes || 0), 0) || 0;

            const time = core?.formatTime ? 

                core.formatTime(message.createdAt || message.timestamp) : 

                new Date(message.createdAt || message.timestamp).toLocaleTimeString([], {hour:"numeric",minute:"2-digit",hour12:true});

            

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

                            ${isSent ? `<span class="message-status status-${status}"><i class="fas ${statusIcon}"></i></span>` : ''}

                        </div>

                        ${reactions}

                    </div>

                </div>

            `;

        },



        // ── Phase 1: GIF message template ─────────────────────────────────
        _createGifMessageTemplate(message, currentUser) {
            const core = getMessagesCore();
            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();
            const isSent = String(message.senderId) === String(currentUserId);
            const time = core?.formatTime
                ? core.formatTime(message.createdAt || message.timestamp)
                : new Date(message.createdAt || message.timestamp).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:true});
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            const reactions = this._renderReactions(message.reactions);

            // Delegate rendering to gif-picker.js if loaded, otherwise inline fallback
            let gifHtml;
            if (window.kynGifPicker?.renderGifBubble) {
                gifHtml = window.kynGifPicker.renderGifBubble(message);
            } else {
                const meta = message.metadata || {};
                const url  = meta.gifUrl || meta.gifFullUrl || message.content;
                gifHtml = `<div class="msg-gif-container"><img src="${url}" alt="GIF" loading="lazy" style="max-width:240px;border-radius:10px;display:block;"/><span style="position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.55);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;">GIF</span></div>`;
            }

            return `
                <div class="message-wrapper ${isSent ? 'sent-wrapper' : 'received-wrapper'}" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                    <div class="message-bubble ${isSent ? 'sent' : 'received'}" style="padding:4px;background:transparent;border:none;">
                        ${gifHtml}
                        <div class="message-meta" style="padding:0 4px 2px;">
                            <span class="message-time">${time}</span>
                            ${isSent ? `<i class="fas fa-check message-status-icon"></i>` : ''}
                        </div>
                    </div>
                    ${reactions}
                </div>`;
        },

        // ── Phase 1: View-once message template ───────────────────────────
        _createViewOnceMessageTemplate(message, currentUser) {
            const core = getMessagesCore();
            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();
            const isSent = String(message.senderId) === String(currentUserId);
            const time = core?.formatTime
                ? core.formatTime(message.createdAt || message.timestamp)
                : new Date(message.createdAt || message.timestamp).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:true});
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            const reactions = this._renderReactions(message.reactions);

            let voHtml;
            if (window.kynViewOnce?.renderViewOnceBubble) {
                voHtml = window.kynViewOnce.renderViewOnceBubble(message, isSent);
            } else {
                voHtml = `<div style="padding:10px 14px;border:1px dashed #7c3aed;border-radius:12px;color:#fff;font-size:13px;">📷 View once</div>`;
            }

            return `
                <div class="message-wrapper ${isSent ? 'sent-wrapper' : 'received-wrapper'}" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                    <div class="message-bubble ${isSent ? 'sent' : 'received'}">
                        ${voHtml}
                        <div class="message-meta">
                            <span class="message-time">${time}</span>
                            ${isSent ? `<i class="fas fa-check message-status-icon"></i>` : ''}
                        </div>
                    </div>
                    ${reactions}
                </div>`;
        },

        // ── Phase 2: Sticker message template ─────────────────────────
        _createStickerMessageTemplate(message, currentUser) {
            const core = getMessagesCore();
            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();
            const isSent = String(message.senderId) === String(currentUserId);
            const time = core?.formatTime
                ? core.formatTime(message.createdAt || message.timestamp)
                : new Date(message.createdAt || message.timestamp).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:true});
            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');
            const reactions = this._renderReactions(message.reactions);

            let stickerHtml;
            if (window.kynStickerPicker?.renderStickerBubble) {
                stickerHtml = window.kynStickerPicker.renderStickerBubble(message);
            } else {
                const meta = message.metadata || {};
                stickerHtml = `<div class="msg-sticker" style="font-size:72px;line-height:1">${meta.stickerEmoji || '😊'}</div>`;
            }

            return `
                <div class="message-wrapper ${isSent ? 'sent-wrapper' : 'received-wrapper'}" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                    <div class="message-bubble ${isSent ? 'sent' : 'received'}" style="background:transparent;border:none;padding:4px;">
                        ${stickerHtml}
                        <div class="message-meta" style="padding:0 2px;">
                            <span class="message-time">${time}</span>
                        </div>
                    </div>
                    ${reactions}
                </div>`;
        },

        _createNoteMessageTemplate(message, currentUser) {

            const core = getMessagesCore();

            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();

            const isSent = String(message.senderId) === String(currentUserId);

            const status = message.status || 'sent';

            const statusIcon = status === 'sending' ? 'fa-clock' :

                              status === 'failed' ? 'fa-exclamation-circle' :

                              (status === 'read' || status === 'delivered') ? 'fa-check-double' : 'fa-check';

            

            const reactions = this._renderReactions(message.reactions);

            const content = core?.formatMessageText ? 

                core.formatMessageText(message.content) : 

                _safeEscapeHtml(message.content);

            const time = core?.formatTime ? 

                core.formatTime(message.createdAt || message.timestamp) : 

                new Date(message.createdAt || message.timestamp).toLocaleTimeString([], {hour:"numeric",minute:"2-digit",hour12:true});

            

            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');

            

            return `

                <div class="message note-message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="note" data-status="${status}">

                    <div class="message-bubble ${isSent ? 'sent' : 'received'}" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">

                        <div class="note-icon"><i class="fas fa-sticky-note"></i></div>

                        <div class="message-content">${content}</div>

                        <div class="message-meta">

                            <span class="message-time">${time}</span>

                            ${isSent ? `<span class="message-status status-${status}"><i class="fas ${statusIcon}"></i></span>` : ''}

                        </div>

                        ${reactions}

                    </div>

                </div>

            `;

        },

        _createCallMessageTemplate(message, currentUser) {

            const core = getMessagesCore();

            const currentUserId = core?.getCurrentUserId?.() || getCurrentUserId();

            const isSent = String(message.senderId) === String(currentUserId);

            const time = core?.formatTime ?

                core.formatTime(message.createdAt || message.timestamp) :

                new Date(message.createdAt || message.timestamp).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:true});

            // Determine call type and status
            const callType = message.callType || (message.type === 'video_call' ? 'video' : 'voice');
            const isVideo = callType === 'video';
            const callStatus = message.callStatus || message.status || 'ended';
            const isMissed = callStatus === 'missed' || callStatus === 'rejected' || callStatus === 'cancelled';
            const duration = message.duration || message.callDuration;

            // Format duration like "38 secs" or "2 min 14 secs"
            let durationText = '';
            if (duration && !isMissed) {
                const d = parseInt(duration);
                if (d >= 60) {
                    const m = Math.floor(d / 60), s = d % 60;
                    durationText = s > 0 ? `${m} min ${s} secs` : `${m} min`;
                } else {
                    durationText = `${d} secs`;
                }
            }

            const iconClass = isVideo ? 'fa-video' : 'fa-phone';
            const iconColor = isMissed ? '#ff3b30' : '#00a884';
            const callLabel = isVideo ? 'Video call' : 'Voice call';
            const statusText = isMissed ? 'Missed call' : (durationText || 'Call ended');

            const safeMessage = JSON.stringify(message).replace(/"/g, '&quot;');

            // WhatsApp-style: call appears as a special bubble with icon + label + duration
            return `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-message-type="call" data-status="${callStatus}">
                    <div class="message-bubble ${isSent ? 'sent' : 'received'} call-message-bubble" style="min-width:180px;cursor:pointer;" onclick="window.messagesUI?.showMessageActions(${safeMessage}, event.clientX, event.clientY)">
                        <div style="display:flex;align-items:center;gap:10px;padding:2px 0;">
                            <div style="width:36px;height:36px;border-radius:50%;background:rgba(${isMissed?'255,59,48':'0,168,132'},0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                <i class="fas ${iconClass}" style="color:${iconColor};font-size:15px;${isSent && !isVideo ? 'transform:scaleX(-1);' : ''}"></i>
                            </div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:600;font-size:14px;color:#e9edef;">${callLabel}</div>
                                <div style="font-size:12px;color:#8696a0;margin-top:1px;">${statusText}</div>
                            </div>
                        </div>
                        <div class="message-meta">
                            <span class="message-time">${time}</span>
                            ${isSent ? `<span class="message-status"><i class="fas fa-check-double" style="color:#53bdeb;"></i></span>` : ''}
                        </div>
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

            if (!reactions || typeof reactions !== 'object' || Object.keys(reactions).length === 0) return '';
            const core = getMessagesCore();
            const myId = (core && core.getCurrentUserId && core.getCurrentUserId()) || null;
            let html = '<div class="message-reactions">';
            for (const [emoji, users] of Object.entries(reactions)) {
                const ul = Array.isArray(users) ? users : (users ? [users] : []);
                if (!ul.length) continue;
                const isMine = myId && ul.some(function(u) { return String(u) === String(myId); });
                html += '<span class="reaction' + (isMine ? ' reaction-mine' : '') + '" title="' + ul.length + ' ' + (ul.length === 1 ? 'person' : 'people') + '">' + emoji + ' ' + ul.length + '</span>';
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

            // FIX (chat-more-btn-tap-swallowed): a re-render here replaces every
            // .chat-item / .chat-more-btn DOM node. If that happens between a
            // user's press-down and their click (e.g. a socket event triggers
            // refreshChatsList() while they're tapping the three-dot button),
            // the element they pressed is gone by the time the click event
            // would fire — the tap silently does nothing, and re-tapping lands
            // on the freshly-rendered row instead and opens the chat. Defer the
            // rebuild slightly while a context menu is open or a press/long-
            // press is in flight, rather than yanking the DOM out mid-tap.
            if (document.getElementById('chatContextMenu') || document.body.classList.contains('chat-item-pressing')) {
                clearTimeout(this._renderChatsListRetry);
                this._renderChatsListRetry = setTimeout(() => {
                    this.renderChatsList(chats, currentChat, category, messageDrafts);
                }, 400);
                return;
            }

            let normalizedChats = ensureSafeArray(chats);

            // Apply hidden filtering + pin-first sorting
            try {
                const _hiddenIds2 = JSON.parse(localStorage.getItem('kyn_hidden_chats_v1') || '[]');
                const _pinnedIds2 = JSON.parse(localStorage.getItem('kyn_pinned_chats_v1') || '[]');
                normalizedChats = normalizedChats.filter(c => !_hiddenIds2.includes(String(c.id)));
                normalizedChats = normalizedChats.slice().sort(function(a, b) {
                    const ap = _pinnedIds2.includes(String(a.id)) ? 1 : 0;
                    const bp = _pinnedIds2.includes(String(b.id)) ? 1 : 0;
                    if (bp !== ap) return bp - ap;
                    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
                    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
                    return tb - ta;
                });
            } catch(_normalizeErr) {}

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

            const _localSetHas = function(key, id) {
                try { return (JSON.parse(localStorage.getItem(key) || '[]')).includes(String(id)); } catch(_) { return false; }
            };

            if (normalizedCategory === 'unread') {

                filteredChats = normalizedChats.filter(c => (Number(c?.unreadCount) || 0) > 0);

            } else if (normalizedCategory === 'archived') {

                filteredChats = normalizedChats.filter(c => !!c?.archived || _localSetHas('kyn_archived_chats_v1', c.id));

            } else if (normalizedCategory === 'blocked') {

                filteredChats = normalizedChats.filter(c => !!c?.blocked || _localSetHas('kyn_blocked_chats_v1', c.id));

            } else if (normalizedCategory === 'notes') {

                filteredChats = normalizedChats.filter(c => c?.type === 'note');

            } else {

                filteredChats = normalizedChats.filter(c => !c?.archived && !_localSetHas('kyn_archived_chats_v1', c.id) && !c?.blocked && !_localSetHas('kyn_blocked_chats_v1', c.id));

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

                const core = getMessagesCore();

                // FIX: Always resolve online status from FriendManager for real-time accuracy

                let _chatOnline = !!chat.online;

                if (core && core.FriendManager) {

                    const _fid = chat.friendId || chat.userId || (chat.otherParticipant && chat.otherParticipant.id);

                    if (_fid) {

                        const _f = core.FriendManager.getFriend(_fid) || core.FriendManager.getFriend(parseInt(_fid));

                        if (_f) _chatOnline = !!(_f.online || _f.status === 'online');

                    }

                }

                const status = _chatOnline ? 'online' : 'offline';

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

                

                const _rawLast = (function() {
                    const v = (chat.lastMessage || '').trim();
                    // FIX: same root cause as the message-bubble decrypt issue —
                    // don't ever show the raw encrypted envelope as literal text.
                    if (v.charAt(0) === '{' && v.indexOf('"v"') !== -1 && v.indexOf('"ct"') !== -1) return '🔒 Encrypted message';
                    return v;
                })();

                const _words = _rawLast.split(/\s+/).filter(Boolean);

                const lastMsgDisplay = _safeEscapeHtml(_words.length > 8

                    ? _words.slice(0, 8).join(' ') + '...'

                    : _rawLast);

                

                const safeChat = JSON.stringify(chat).replace(/"/g, '&quot;');

                

                const avatarSrc = chat.friendAvatar || chat.avatar || chat.photoURL || '';

                const avatarInitial = (chat.friendName || 'U').charAt(0).toUpperCase();

                const avatarHtml = avatarSrc

                    ? `<img class="avatar-photo" src="${avatarSrc}" alt="${chat.friendName || 'User'}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none;width:100%;height:100%;background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 68%,#06b6d4 100%);color:#fff;align-items:center;justify-content:center;font-weight:700;font-size:17px;border-radius:50%;">${avatarInitial}</span>`

                    : `<span style="width:100%;height:100%;background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 68%,#06b6d4 100%);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;border-radius:50%;">${avatarInitial}</span>`;

                // Apply pin/block data attrs for CSS
                const _isPinned  = (function(){ try{ return (JSON.parse(localStorage.getItem('kyn_pinned_chats_v1')||'[]')).includes(String(chat.id)); }catch(_){return false;} })();
                const _isBlocked = (function(){ try{ return (JSON.parse(localStorage.getItem('kyn_blocked_chats_v1')||'[]')).includes(String(chat.id)); }catch(_){return false;} })();
                html += `

                    <div class="chat-item ${isSelected ? 'selected' : ''}" data-chat-id="${chat.id}" data-pinned="${_isPinned}" data-blocked="${_isBlocked}" data-long-press-chat="${chat.id}"
                         ontouchstart="window.messagesUI?._chatLongPressStart(event,'${chat.id}')"
                         ontouchend="window.messagesUI?._chatLongPressEnd(event,'${chat.id}')"
                         ontouchcancel="window.messagesUI?._chatLongPressCancel()"
                         onmousedown="window.messagesUI?._chatLongPressStart(event,'${chat.id}')"
                         onmouseup="window.messagesUI?._chatLongPressEnd(event,'${chat.id}')"
                         onmouseleave="window.messagesUI?._chatLongPressCancel()"
                         onclick="window.messagesUI?._chatItemClick(event,'${chat.id}',${safeChat})">

                        <div class="chat-avatar" style="overflow:hidden;">

                            ${avatarHtml}

                            <div class="chat-status ${status}"></div>

                        </div>

                        <div class="chat-info">

                            <div class="chat-name-row">

                                <span class="chat-name">${(chat.friendName || 'User').replace(/\s+User$/i, '').trim() || (chat.friendName || 'User')}</span>

                            </div>

                            <div class="chat-last-message">

                                <span class="last-message-text">${lastMsgDisplay}</span>

                                ${draftBadge}

                                ${unreadBadge}

                            </div>

                            ${chat.typing ? '<div class="chat-typing">typing...</div>' : ''}

                        </div>

                        <div class="chat-item-right">

                            <span class="chat-time">${time}</span>

                            <button class="chat-more-btn" data-more-chat-id="${chat.id}" title="More options"
                                onmousedown="event.stopPropagation();document.body.classList.add('chat-item-pressing');"
                                ontouchstart="event.stopPropagation();document.body.classList.add('chat-item-pressing');"
                                onmouseup="event.stopPropagation();document.body.classList.remove('chat-item-pressing');"
                                ontouchend="event.stopPropagation();document.body.classList.remove('chat-item-pressing');"
                                ontouchcancel="document.body.classList.remove('chat-item-pressing');"
                                onclick="event.stopPropagation();event.preventDefault();document.body.classList.remove('chat-item-pressing');if(window.messagesUI&&typeof window.messagesUI._showChatContextMenu==='function'){window.messagesUI._showChatContextMenu('${chat.id}', event);}"
                                style="border:none;background:none;cursor:pointer;color:var(--text-secondary);padding:10px 12px;margin:-4px;border-radius:8px;font-size:16px;flex-shrink:0;line-height:1;position:relative;z-index:2;min-width:40px;min-height:40px;display:flex;align-items:center;justify-content:center;">
                                <i class="fas fa-ellipsis-v" style="pointer-events:none;"></i>
                            </button>

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

                    try {

                        const cachedFriends = JSON.parse(localStorage.getItem('friends') || '[]');

                        if (Array.isArray(cachedFriends) && cachedFriends.length > 0) {

                            contacts = cachedFriends.map(friend => ({

                                ...friend,

                                id: friend.id || friend.userId,

                                name: friend.displayName || friend.username || friend.name || 'User',

                                displayName: friend.displayName || friend.username || friend.name || 'User',

                                online: friend.online === true || friend.status === 'online'

                            }));

                        }

                    } catch (_) {}

                }

                if (!contacts || contacts.length === 0) {

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

            const avatarUrl = (window.Identity && window.Identity.resolveAvatar(contact)) || contact.avatar || contact.photoURL || contact.avatarUrl || ''; // IDENTITY-CENTRALIZATION

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



            // FIX: prefer firstName+lastName for real name display
            const _op = chat.otherParticipant || null;
            const friendName = (function() {
                if (_op) {
                    const fn = (_op.firstName || '').trim(); const ln = (_op.lastName || '').trim();
                    if (fn && ln) return fn + ' ' + ln;
                    if (fn) return fn;
                    return _op.displayName || _op.username || chat.friendName || chat.name || 'User';
                }
                return chat.friendName || chat.name || 'User';
            })();

            if (nameEl) UIFailsafe.safeSetText(nameEl, friendName);

            // Use real online status from FriendManager if available
            const _core = getMessagesCore();
            let _isOnline = !!(chat.online || chat.status === 'online');

            if (_core && _core.FriendManager) {

                const _fid = chat.friendId || chat.userId || chat.otherUserId;

                if (_fid) {

                    const _friend = _core.FriendManager.getFriend(_fid)
                                 || _core.FriendManager.getFriend(parseInt(_fid))
                                 || _core.FriendManager.getFriend(String(_fid));

                    // FIX: don't let a stale FriendManager cache entry
                    // override a fresher "online" already known from chat.online
                    // (this was the "shows offline while actually online" bug —
                    // any cached friend record, even a stale one, unconditionally
                    // won here before). Either source saying online now wins.
                    if (_friend) _isOnline = _isOnline || !!(_friend.online || _friend.status === 'online');

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

                    UIFailsafe.safeSetHTML(avatarEl, `<img src="${chat.friendAvatar}" alt="${friendName}" loading="lazy">`);

                } else {

                    // Show initials instead of generic icon

                    const initials = friendName.charAt(0).toUpperCase();

                    UIFailsafe.safeSetHTML(avatarEl, `<span style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;">${initials}</span>`);

                }

                if (indicatorEl) avatarEl.appendChild(indicatorEl);

            }



            // Push history state so device back-button returns to sidebar

            try {

                const chatId = chat.id || chat.friendId || chat.userId;

                history.pushState({ view: 'chat', chatId, friendName }, '', '');

            } catch (_e) {}

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

                       onkeydown="if(event.isComposing || event.keyCode===229) return; if(event.key==='Enter' && !event.shiftKey) { event.preventDefault(); window.messagesUI?.saveEditedMessage('${message.id}') }">

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

                    // Phase 1: Use dm-poll.js modal (works in DMs + groups)
                    if (window.kynDmPoll?.openModal) {
                        window.kynDmPoll.openModal();
                    } else if (core) {
                        attachment = core.createPoll?.();
                    }

                    return; // modal handles send itself

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



        scrollToBottom(container, force) {

            if (!container) return;

            // FIX-074: Only auto-scroll if user is already near the bottom (within 150px)

            // so we don't hijack their scroll position while reading history.

            // Pass force=true when a new message is sent by current user.

            const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

            if (force || distFromBottom < 150) {

                requestAnimationFrame(function() {

                    container.scrollTop = container.scrollHeight;

                });

            }

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

                const normalizedChatId = String(chat.id);
                const isSelected = selectedSet instanceof Set ? selectedSet.has(normalizedChatId) : false;

                const name = chat.friendName || chat.name || 'Chat';

                const lastMsg = (function() {
                    const v = chat.lastMessage || '';
                    if (v.charAt(0) === '{' && v.indexOf('"v"') !== -1 && v.indexOf('"ct"') !== -1) return '🔒 Encrypted message';
                    return v;
                })();

                const avatarUrl = (window.Identity && window.Identity.resolveAvatar(chat)) || chat.friendAvatar || chat.avatar || ''; // IDENTITY-CENTRALIZATION

                const initials = name.charAt(0).toUpperCase();

                

                html += `

                    <div class="chat-item ${isSelected ? 'selected' : ''}" data-chat-id="${normalizedChatId}"

                         style="display:flex;align-items:center;padding:10px 14px;gap:10px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.05);${isSelected ? 'background:rgba(102,126,234,0.08);' : ''}"

                         onclick="window.messagesUI?.toggleMultiSendItem('${normalizedChatId}', this)">

                        <input type="checkbox" class="multi-send-checkbox" ${isSelected ? 'checked' : ''}

                               style="width:18px;height:18px;flex-shrink:0;cursor:pointer;accent-color:#667eea;"

                               onclick="event.stopPropagation()"

                               onchange="window.messagesUI?.toggleMultiSendItem('${normalizedChatId}', this.closest('.chat-item'))">

                        <div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;overflow:hidden;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">

                            ${avatarUrl

                                ? `<img src="${avatarUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.textContent='${initials}'">`

                                : initials

                            }

                        </div>

                        <div style="flex:1;min-width:0;">

                            <div class="chat-name" style="font-weight:600;font-size:13px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>

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

            _uiLog('[CallHandler] Call buttons not found in DOM');

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

            

            // FIX Bug2: if none of the explicit friend-id fields are present, fall back to
            // activeChat.id only after stripping a 'pending_<id>' prefix (the id embedded in a
            // pending conversation IS the friend/user id). Without this, a not-yet-cached chat's
            // placeholder conversation (which has no friendId of its own) would resolve to the
            // conversation id itself, so calls/messages could be sent to the wrong id.
            const _stripPendingPrefix = function(v) {
                const s = String(v || '');
                return s.startsWith('pending_') ? s.slice(8) : s;
            };

            const receiverId = activeChat.friendId || 

                              activeChat.pendingReceiverId || 

                              activeChat.otherUserId ||

                              activeChat.userId || 

                              activeChat.participantId ||

                              _stripPendingPrefix(activeChat.id);

            

            // FIX (calling-screen-shows-User): activeChat.friendName can briefly be ''
            // — openConversation() seeds a temp placeholder with an empty friendName
            // while the real conversation is still loading, specifically so the header
            // never flashes "Loading...". If the call button is pressed in that window,
            // every field in the chain below was empty and this fell straight to the
            // literal 'User' placeholder — which is exactly what showed on the outgoing
            // calling screen. The header (#chatFriendName) is populated from the same
            // real name as soon as it's known, so check it before giving up.
            const _headerNameEl = document.getElementById('chatFriendName');
            const _headerName = _headerNameEl && _headerNameEl.textContent &&
                                 _headerNameEl.textContent.trim() &&
                                 _headerNameEl.textContent.trim() !== 'Select a chat'
                                 ? _headerNameEl.textContent.trim() : null;

            const receiverName = activeChat.friendName || 
                                activeChat.name || 
                                activeChat.displayName || 
                                activeChat.userName || 
                                _headerName ||
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

                

                _uiLog(`[CallHandler] Initiating ${callType} call with:`, {

                    userId: info.receiverId,

                    userName: finalUserName,

                    chatId: info.chatId

                });

                

                if (window.parent && window.parent !== window) {

                    // FIX: previously this ALSO sent a second, separate 'INITIATE_CALL'
                    // postMessage 100ms after this one. chat.html treats both message
                    // types as a complete, independent call-dispatch trigger (each one
                    // calls __dispatchCallToIframe), so a single "start call" tap was
                    // resulting in TWO calls being dispatched a moment apart — the same
                    // duplicate-initiation problem that caused calls to die right after
                    // being accepted elsewhere in this app. SWITCH_MODULE below already
                    // carries everything chat.html needs (including the correct
                    // returnTo:'messages'), so it alone is sufficient.
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

        

        _uiLog('[CallHandler] Call handlers initialized');

    }



    // CALL RETURN HANDLER - re-opens the same chat after call ends

    function setupCallReturnHandler() {
        if (window.__callReturnHandlerBound) return;
        window.__callReturnHandlerBound = true;

        window.addEventListener('message', (event) => {

            const data = event.data || {};

            

            if (data.type === 'CALL_ENDED_RETURN' || data.type === 'CALL_ENDED') {
                const _now = Date.now();
                if (window.__lastCallEndedHandled && (_now - window.__lastCallEndedHandled) < 3000) return;
                window.__lastCallEndedHandled = _now;

                _uiLog('[CallHandler] Call ended, returning to chat');

                

                const returnUserId = window.__messageChatReturnUserId;

                const returnChatId = window.__messageChatReturnId;

                const returnName = window.__messageChatReturnName;



                // Set global flag BEFORE opening the chat so _showChatPanel (messages-core)
                // and openChatWithUserInUI both know we are returning from a call.
                window.__returningFromCall = true;
                // Do NOT hide back button here — CSS handles mobile/desktop visibility.
                // Restore flag after navigation settles.
                setTimeout(() => { window.__returningFromCall = false; }, 1500);

                

                if (returnUserId && window.messagesUI?.loadChatByFriendId) {

                    setTimeout(() => {

                        window.messagesUI.loadChatByFriendId(returnUserId, returnName || '');
                        // Clear the flag after the panel has fully opened
                        setTimeout(() => { window.__returningFromCall = false; }, 1500);

                    }, 300);

                } else if (returnChatId && window.messagesUI?.openChat) {

                    setTimeout(() => {

                        window.messagesUI.openChat({ id: returnChatId });
                        setTimeout(() => { window.__returningFromCall = false; }, 1500);

                    }, 300);

                } else {
                    // No specific chat to open — still clear the flag
                    setTimeout(() => { window.__returningFromCall = false; }, 1500);
                }

                

                delete window.__messageChatReturnUserId;

                delete window.__messageChatReturnId;

                delete window.__messageChatReturnName;

            }

            

            if (data.type === 'INCOMING_CALL') {

                // FIXED: Only show mini modal if calls iframe is NOT visible
                // (i.e. user is in messages module and calls screen isn't shown)
                const callsContent = window.parent?.document?.getElementById?.('callsContent');
                const callsVisible = callsContent && !callsContent.classList.contains('hidden');
                const callScreenActive = window.parent?.document?.body?.classList?.contains?.('call-screen-active');
                if (!callsVisible && !callScreenActive) {
                    _uiLog('[CallHandler] 📞 Incoming call postMessage (mini modal)', data.payload);

                    _showIncomingCallModal(data.payload || {});

                } else {

                    _uiLog('[CallHandler] 📞 Incoming call — calls screen already handling');

                }

            }

        });



        window.addEventListener('incomingCall', (event) => {

            _uiLog('[CallHandler] 📞 Incoming call window event', event.detail);

            _showIncomingCallModal(event.detail || {});

        });



        // FIXED: kyn:call:* events are handled exclusively by chat.html (parent frame)
        // which routes to the calls iframe. Listening here causes DOUBLE call notification.
        // Only show the mini CallModal overlay for INCOMING_CALL postMessage from parent
        // when the current module is NOT already showing the calls screen.
        // DO NOT add kyn:call:incoming listeners here - chat.html handles them.

    }



    // ✅ FIX 6: Full-screen incoming call modal with Accept / Reject.

    // Replaces the previous toast-only implementation which gave the receiver

    // no way to interact with the call.

    function _showIncomingCallModal(callData) {

        // Deduplicate — don't stack modals

        const existing = document.getElementById('kyn-incoming-call-overlay');

        if (existing) return;



        const { callerId, callerName, callType = 'voice', callId, roomId } = callData;

        const displayName = callerName || 'Someone';

        const isVideo = String(callType).toLowerCase().includes('video');

        const icon = isVideo ? '📹' : '📞';



        _uiLog(`[CallModal] 📞 Showing incoming ${callType} call modal from ${displayName}`);



        const overlay = document.createElement('div');

        overlay.id = 'kyn-incoming-call-overlay';

        overlay.style.cssText = [

            'position:fixed', 'inset:0', 'z-index:99999',

            'display:flex', 'align-items:center', 'justify-content:center',

            'background:rgba(0,0,0,0.72)', 'backdrop-filter:blur(4px)',

            'animation:kynCallFadeIn 0.25s ease'

        ].join(';');



        overlay.innerHTML = `

            <style>

                @keyframes kynCallFadeIn { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }

                @keyframes kynCallPulse  { 0%,100% { box-shadow:0 0 0 0 rgba(74,222,128,0.5); } 60% { box-shadow:0 0 0 18px rgba(74,222,128,0); } }

                #kyn-incoming-call-overlay .kyn-call-box {

                    background:#1a1a2e; color:#fff; border-radius:24px; padding:40px 32px 32px;

                    text-align:center; min-width:300px; max-width:360px; width:90vw;

                    box-shadow:0 24px 80px rgba(0,0,0,0.6);

                }

                #kyn-incoming-call-overlay .kyn-call-avatar {

                    width:84px; height:84px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2);

                    display:flex; align-items:center; justify-content:center;

                    font-size:36px; margin:0 auto 16px; border:3px solid rgba(255,255,255,0.15);

                }

                #kyn-incoming-call-overlay .kyn-call-label { font-size:13px; color:#a0a0b0; margin-bottom:6px; letter-spacing:0.5px; }

                #kyn-incoming-call-overlay .kyn-call-name  { font-size:24px; font-weight:700; margin-bottom:4px; }

                #kyn-incoming-call-overlay .kyn-call-type  { font-size:14px; color:#94a3b8; margin-bottom:32px; }

                #kyn-incoming-call-overlay .kyn-call-btns  { display:flex; justify-content:center; gap:32px; }

                #kyn-incoming-call-overlay .kyn-btn-reject {

                    width:64px; height:64px; border-radius:50%; border:none; cursor:pointer;

                    background:#ef4444; font-size:28px; display:flex; align-items:center;

                    justify-content:center; transition:transform 0.15s,background 0.15s;

                }

                #kyn-incoming-call-overlay .kyn-btn-reject:hover { background:#dc2626; transform:scale(1.08); }

                #kyn-incoming-call-overlay .kyn-btn-accept {

                    width:64px; height:64px; border-radius:50%; border:none; cursor:pointer;

                    background:#22c55e; font-size:28px; display:flex; align-items:center;

                    justify-content:center; animation:kynCallPulse 1.5s infinite; transition:transform 0.15s;

                }

                #kyn-incoming-call-overlay .kyn-btn-accept:hover { background:#16a34a; transform:scale(1.08); }

                #kyn-incoming-call-overlay .kyn-call-timer { font-size:12px; color:#64748b; margin-top:20px; }

            </style>

            <div class="kyn-call-box">

                <div class="kyn-call-avatar">${icon}</div>

                <div class="kyn-call-label">INCOMING ${isVideo ? 'VIDEO' : 'VOICE'} CALL</div>

                <div class="kyn-call-name">${displayName}</div>

                <div class="kyn-call-type">${isVideo ? 'Video Call' : 'Voice Call'}</div>

                <div class="kyn-call-btns">

                    <button class="kyn-btn-reject" title="Decline">📵</button>

                    <button class="kyn-btn-accept" title="Accept">📞</button>

                </div>

                <div class="kyn-call-timer" id="kynCallCountdown">Ringing... 30s</div>

            </div>`;



        document.body.appendChild(overlay);



        // Countdown timer — auto-reject after 30s

        let secondsLeft = 30;

        const countdown = overlay.querySelector('#kynCallCountdown');

        const timerInterval = setInterval(() => {

            secondsLeft--;

            if (countdown) countdown.textContent = `Ringing... ${secondsLeft}s`;

            if (secondsLeft <= 0) { clearInterval(timerInterval); _dismissCallModal('timeout'); }

        }, 1000);



        function _dismissCallModal(reason) {

            clearInterval(timerInterval);

            const el = document.getElementById('kyn-incoming-call-overlay');

            if (el) el.remove();

            _uiLog(`[CallModal] Dismissed: ${reason}`);

        }



        overlay.querySelector('.kyn-btn-reject').addEventListener('click', () => {

            _dismissCallModal('rejected');

            _uiLog('[CallModal] 📵 User REJECTED call from', displayName);

            // Notify parent/calls iframe

            try { window.parent.postMessage({ type: 'CALL_REJECTED', payload: { callerId, callId, roomId }, source: 'messages-ui' }, '*'); } catch(_) {}

            window.dispatchEvent(new CustomEvent('callRejectedByUser', { detail: { callerId, callId, callType } }));

            // Notify backend via KynectaRealtime

            if (window.KynectaRealtime?.emit) {

                window.KynectaRealtime.emit('call:reject', { callId, roomId, callerId }).catch(() => {});

            }

        });



        overlay.querySelector('.kyn-btn-accept').addEventListener('click', () => {

            _dismissCallModal('accepted');

            _uiLog('[CallModal] ✅ User ACCEPTED call from', displayName);

            // Notify parent/calls iframe

            try { window.parent.postMessage({ type: 'CALL_ACCEPTED', payload: { callerId, callId, roomId, callType }, source: 'messages-ui' }, '*'); } catch(_) {}

            window.dispatchEvent(new CustomEvent('callAcceptedByUser', { detail: { callerId, callId, callType, roomId } }));

            // Notify backend via KynectaRealtime

            if (window.KynectaRealtime?.emit) {

                window.KynectaRealtime.emit('call:accept', { callId, roomId, callerId }).catch(() => {});

            }

        });



        // Dismiss if a call:ended / call:cancelled arrives while modal is open

        const _dismissOnEnd = () => _dismissCallModal('remote-end');

        window.addEventListener('kyn:call:ended',     _dismissOnEnd, { once: true });

        window.addEventListener('kyn:call:cancelled', _dismissOnEnd, { once: true });

        window.addEventListener('kyn:call_ended',     _dismissOnEnd, { once: true });

        window.addEventListener('kyn:call_cancelled', _dismissOnEnd, { once: true });

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

                ${window.__messageForwardingEnabled === false ? '' : item('forward', 'fas fa-share', 'Forward')}

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

                if (window.__messageForwardingEnabled === false) {
                    UIRenderer?.showNotification?.('Message forwarding is turned off in Settings', 'info');
                    break;
                }
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



    async function showForwardModal(message) {
        // FIX: was alert() stub — now calls POST /api/messages/:id/forward
        const core = getMessagesCore();
        const conversations = core?.getConversations?.() || [];
        if (!conversations.length) {
            UIRenderer.showNotification('No conversations to forward to', 'info');
            return;
        }

        // Build a simple selection modal
        const existing = document.getElementById('_forwardModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = '_forwardModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
        modal.innerHTML = `
          <div style="background:var(--kyn-bg-modal);border-radius:16px;width:100%;max-width:360px;padding:20px;max-height:70vh;overflow-y:auto;">
            <h3 style="margin:0 0 16px;font-size:16px;color:var(--text-primary)">Forward to</h3>
            <div id="_fwdList" style="display:flex;flex-direction:column;gap:8px;">
              ${conversations.slice(0,20).map(c => `
                <button data-chat-id="${c.id}" style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;border:none;background:var(--kyn-bg-panel);cursor:pointer;color:var(--text-primary);font-size:14px;text-align:left;">
                  <img src="${c.avatar || c.participantAvatar || ''}" onerror="this.style.display='none'" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                  <span>${UIFailsafe.escapeHtml(c.name || c.participantName || 'Chat')}</span>
                </button>`).join('')}
            </div>
            <button id="_fwdCancel" style="margin-top:16px;width:100%;padding:10px;border-radius:10px;border:none;background:var(--kyn-bg-panel);color:var(--kyn-text-muted);cursor:pointer;">Cancel</button>
          </div>`;

        document.body.appendChild(modal);
        document.getElementById('_fwdCancel').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.querySelectorAll('[data-chat-id]').forEach(btn => {
            btn.onclick = async () => {
                modal.remove();
                try {
                    const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
                    const base  = window.__API_BASE_URL || window.API_BASE_URL || '';
                    const res   = await fetch(`${base}/api/messages/${message.id}/forward`, {
                        method : 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body   : JSON.stringify({ targetChatIds: [parseInt(btn.dataset.chatId)] })
                    });
                    if (res.ok) {
                        UIRenderer.showNotification('Message forwarded', 'success');
                    } else {
                        UIRenderer.showNotification('Forward failed', 'error');
                    }
                } catch(e) {
                    UIRenderer.showNotification('Forward failed: ' + e.message, 'error');
                }
            };
        });
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

            // Phase 2: Submit to backend directly
            const apiBase = window.API_BASE_URL || '';
            const tok = localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
            const reasonMap = {
                'Spam or scam': 'spam', 'Harassment or bullying': 'harassment',
                'Hate speech': 'hate_speech', 'Misleading information': 'misinformation',
                'Inappropriate content': 'sexual_content', 'Other': 'other'
            };
            fetch(`${apiBase}/api/messages/${message.id}/report`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reasonMap[reason] || 'other', details: detail })
            }).catch(() => {});
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

            // PHASE11: Also check COR / parent ready state
            if (window.__kynParentReady === true || window.parent !== window) {
                return true;
            }

            

            // Check core state directly — UIStateManager may lag behind core

            const core = typeof getMessagesCore === 'function' ? getMessagesCore() : null;

            if (core && core.getState) {

                const coreState = core.getState();

                if (coreState && coreState.state === 'ACTIVE' && coreState.hasValidSession) {

                    return true;

                }

            }



            // FIX: SESSION_DATA can arrive ~80s after page load. If localStorage already

            // has a recognised user/auth token, unblock immediately instead of making

            // every click fail with "INITIALIZING / sessionValid: false".

            try {

                const hasLocalUser =

                    localStorage.getItem('kynecta_auth') ||

                    localStorage.getItem('token') ||

                    localStorage.getItem('accessToken') ||

                    localStorage.getItem('USER_TOKEN') ||

                    localStorage.getItem('currentUser') ||

                    localStorage.getItem('user');

                if (hasLocalUser) {

                    // Opportunistically patch UIStateManager so subsequent checks are free.

                    if (window.messagesUI && window.messagesUI.UIStateManager) {

                        const mgr = window.messagesUI.UIStateManager;

                        if (!mgr.state.sessionValid) {

                            mgr.state.sessionValid = true;

                            mgr.state.lifecycleState = LIFECYCLE_STATES.ACTIVE;

                        }

                    }

                    return true;

                }

            } catch (_) {}

            

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

            // FIX (message module stuck in chat panel after navigating away
            // without clicking back): extracted so it can run automatically
            // too, not just on an explicit tap.
            const _resetToChatList = () => {
                const chatPanel = UIFailsafe.safeGetElement('chatPanel');
                const sidebar = UIFailsafe.safeGetElement('sidebar');
                if (chatPanel) UIFailsafe.safeAddClass(chatPanel, 'hidden');
                if (sidebar) UIFailsafe.safeAddClass(sidebar, 'active');
                document.body.classList.remove('chat-active');
                UIStateManager.setState('chatVisible', false);
                try {
                    const core = getMessagesCore();
                    if (core && core.SafeStorage) { core.SafeStorage.remove('lastChatId'); }
                    localStorage.removeItem('lastChatId');
                } catch(_) {}
                try { window.parent.postMessage({ type: 'CHAT_LIST_SHOWN', timestamp: Date.now() }, '*'); } catch(_) {}
            };

            // FIX (same bug): chat.html's navigateToPage() now sends this
            // when the user switches to a different module via the nav bar
            // while a specific chat was open in this iframe, without using
            // the in-chat back button first. Mirrors exactly what that back
            // button already does. No-op if the chat list was already showing.
            window.addEventListener('message', (evt) => {
                if (evt.data && evt.data.type === 'MODULE_BLURRED') {
                    const chatPanel = UIFailsafe.safeGetElement('chatPanel');
                    if (chatPanel && !chatPanel.classList.contains('hidden')) {
                        _resetToChatList();
                    }
                }
            });

            if (backBtn) {

                backBtn.addEventListener('click', () => {

                    UIFailsafe.queueAction(() => {

                        if (!this._canPerformAction('backToChats')) return;

                        _resetToChatList();

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

            // ── Scroll-date badge: shows current date group when user scrolls ──
            (function _initScrollDateBadge() {
                const msgContainer = document.getElementById('messagesContainer');
                const badge = document.getElementById('scrollDateBadge');
                if (!msgContainer || !badge) return;

                let _badgeTimer = null;

                function _showBadge(text) {
                    if (!text) return;
                    badge.textContent = text;
                    badge.classList.add('visible');
                    clearTimeout(_badgeTimer);
                    _badgeTimer = setTimeout(() => badge.classList.remove('visible'), 1800);
                }

                function _getVisibleDateLabel() {
                    // Find the first date separator that is at or above the current scroll position
                    const separators = msgContainer.querySelectorAll('.message-date-separator, .date-separator, .chat-date-separator');
                    if (!separators.length) return null;
                    const containerTop = msgContainer.scrollTop;
                    let label = null;
                    separators.forEach(sep => {
                        if (sep.offsetTop <= containerTop + 80) {
                            label = (sep.querySelector('span') || sep).textContent.trim();
                        }
                    });
                    return label;
                }

                let _scrollDebounce = null;
                msgContainer.addEventListener('scroll', function() {
                    clearTimeout(_scrollDebounce);
                    _scrollDebounce = setTimeout(() => {
                        const label = _getVisibleDateLabel();
                        if (label) _showBadge(label);
                    }, 60);
                }, { passive: true });
            })();



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



            // FIX Bug1: The video/voice call button click handlers used to be bound here too,
            // guarded by videoCallBtn.__kynCallBound. But this code runs at script-parse time
            // (via UIEventHandlers.init()), while setupCallHandlers() runs later at the bottom
            // of this file and does cloneNode(true) + replaceChild on videoCallBtn/voiceCallBtn,
            // which silently wipes any listener bound here. That silent wipe made this block
            // dead weight and masked the fact that setupCallHandlers() is the only handler that
            // actually survives. setupCallHandlers() is now the single source of truth for both
            // call buttons (it is already idempotent: clone+replace resets listeners cleanly on
            // repeated calls), so the duplicate binding has been removed.



            // Chat options button

            const chatOptionsBtn = UIFailsafe.safeGetElement('chatOptionsBtn');

            if (chatOptionsBtn) {

                chatOptionsBtn.addEventListener('click', () => {

                    UIFailsafe.queueAction(() => {

                        if (!this._canPerformAction('chatOptions')) return;

                        const core = getMessagesCore();

                        const chat = core?.getCurrentConversation?.();

                        if (chat && core) {

                            let info = core.showChatInfo?.(chat);

                            // Guard: showChatInfo may return undefined if not implemented
                            if (!info || typeof info.title === 'undefined') {
                                const name = chat.friendName || chat.name || 'Chat Info';
                                info = {
                                    title: name,
                                    sections: [
                                        {
                                            title: 'Contact',
                                            items: [
                                                { label: 'Name', value: name },
                                                { label: 'Status', value: chat.online ? 'Online' : 'Offline' },
                                                { label: 'Chat ID', value: String(chat.id || '') }
                                            ]
                                        }
                                    ]
                                };
                            }

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

                    // FIX-IME-SPLIT-SEND: mobile IME keyboards (Gboard and others,
                    // seen on Android Chrome) fire a synthetic keydown with
                    // key:'Enter' WHILE the current word is still mid-composition —
                    // e.g. when accepting a predictive-text suggestion or confirming
                    // a candidate from the suggestion strip. During that window the
                    // browser sets e.isComposing = true and/or e.keyCode = 229.
                    // Without this guard, that synthetic Enter was treated as a real
                    // "send" keypress: it sent whatever partial text was in the input
                    // box at that instant, the user's next keystrokes continued the
                    // word into a now-empty input, and the next composing Enter (or
                    // the real one) sent the rest as a second/third message. That is
                    // what produced messages arriving split into fragments (e.g. one
                    // word sent as two or three separate bubbles).
                    if (e.isComposing || e.keyCode === 229) return;

                    if (e.key === 'Enter' && !e.shiftKey) {
                        // FIX: "Enter to Send" setting (window.__enterToSend, set by
                        // applySettingToMessagesModule et al.) was written on every
                        // settings change but never read anywhere in the repo — the
                        // toggle had no effect and Enter always sent. Default true
                        // matches DEFAULT_SETTINGS.chat.enterKeySends.
                        const enterToSendEnabled = window.__enterToSend !== undefined ? window.__enterToSend : true;

                        if (!enterToSendEnabled) {
                            // Let Enter insert a normal newline; sending now requires
                            // Shift+Enter or the send button.
                            return;
                        }

                        e.preventDefault();

                        if (!this._canPerformAction('sendMessage')) return;

                        this._handleSendMessage();

                    } else if (e.key === 'Enter' && e.shiftKey) {
                        const enterToSendEnabled = window.__enterToSend !== undefined ? window.__enterToSend : true;
                        if (!enterToSendEnabled) {
                            // Enter-to-send is off, so Shift+Enter becomes the
                            // explicit "send" chord instead of inserting a newline.
                            e.preventDefault();
                            if (!this._canPerformAction('sendMessage')) return;
                            this._handleSendMessage();
                        }
                        // else: default behavior (newline) when enter-to-send is on.
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

                    // FIX: Hide any offline banners silently — no toasts about "back online"

                    const banner = document.getElementById('kyn-offline-banner');

                    if (banner) banner.style.display = 'none';

                    const offlineOverlay = UIFailsafe.safeGetElement('offlineOverlay');

                    if (offlineOverlay) UIFailsafe.safeRemoveClass(offlineOverlay, 'active');

                    

                    const core = getMessagesCore();

                    if (core?.checkOfflineQueue) core.checkOfflineQueue();

                    if (core?.fetchConversations) core.fetchConversations();

                });

            });



            window.addEventListener('offline', () => {

                UIFailsafe.queueAction(() => {

                    // FIX: Do NOT show any offline overlay or toast — stay silent.

                    // The app continues working with cached data.

                    UIStateManager.setState('networkState', 'offline');

                    _uiLog('[MessageUI] Network offline — using cached data silently');

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

            // FIX: Prevent double-send. messages-core.js previously ALSO attached
            // click+keypress handlers to #sendButton and #messageInput, causing every
            // send to fire twice → two HTTP POST /messages → two server IDs → sender
            // sees duplicates, receiver sees the second WS event deduped and dropped.
            if (this._sending) return;
            this._sending = true;

            const input = UIFailsafe.safeGetElement('messageInput');

            if (!input) { this._sending = false; return; }



            const content = input.value.trim();

            const core = getMessagesCore();

            const attachment = core?.currentAttachment;

            

            if (!content && !attachment) { this._sending = false; return; }



            // FIX: Clear the input immediately and render an optimistic message bubble

            // so the user sees their message right away — don't wait for the server round-trip.

            input.value = '';

            input.style.height = 'auto';



            const _renderNow = () => {

                try {

                    const currentChat = core?.getCurrentConversation?.() || core?.ChatManager?.getActiveChat?.();

                    let currentUser = core?.getCurrentUser?.();
                    if (!currentUser) {
                        const _uid = core?.getCurrentUserId?.() || getCurrentUserId();
                        if (_uid) currentUser = { id: _uid, userId: _uid };
                    }

                    if (currentChat) {

                        // FIX-CROSS-CHAT-RENDER: core.getMessages() returns ChatManager's
                        // single global _messages array — every message across every chat
                        // this session has touched, not just this conversation. Every other
                        // call site in this file filters that list down to the active chat
                        // before handing it to renderMessages() (see addMessage()'s own
                        // internal render trigger in messages-core.js for the same pattern);
                        // this optimistic-send path was the one place that didn't. Passing
                        // the unfiltered list in let renderMessages() append bubbles from
                        // OTHER open/recent chats into this one, and — once the next,
                        // correctly-filtered render ran and found the container held more
                        // bubbles than its (correct, smaller) list — triggered a full
                        // re-render that could drop previously-shown messages instead of
                        // just the leaked ones. That's what showed up as a receiver's
                        // earlier received messages vanishing right after they sent a reply.
                        const _cid = String(currentChat.id || '');
                        const _fid = String(currentChat.friendId || currentChat.otherUserId ||
                            (currentChat.otherParticipant && currentChat.otherParticipant.id) || '');
                        const _allMsgs = core?.getMessages?.() || [];
                        const messages = _allMsgs.filter(m => {
                            const mCid = String(m.chatId || m.conversationId || '');
                            return (_cid && mCid === _cid) || (_fid && mCid === _fid);
                        });

                        UIRenderer.renderMessages(messages, currentChat, currentUser);

                    }

                } catch (_e) {}

            };



            let result;
            try {
                // FIX: include replyToId / replyTo from window.replyToMessage
                const _replyMsg = window.replyToMessage || null;
                result = core?.sendMessage(content, {

                    type: attachment?.type || 'text',

                    attachment: attachment,

                    // FIX: reply context was never passed — caused reply indicator to never render
                    replyToId: _replyMsg ? (_replyMsg.id || _replyMsg.messageId || null) : null,
                    replyTo:   _replyMsg ? {
                        id:          _replyMsg.id || _replyMsg.messageId,
                        content:     _replyMsg.content || _replyMsg.text || '',
                        type:        _replyMsg.type || 'text',
                        senderId:    _replyMsg.senderId || _replyMsg.userId,
                        senderName:  _replyMsg.senderName || (_replyMsg.sender && (_replyMsg.sender.username || _replyMsg.sender.displayName)) || '',
                        senderAvatar:_replyMsg.senderAvatar || (_replyMsg.sender && _replyMsg.sender.avatar) || '',
                    } : null,

                });
            } catch (sendErr) {
                this._sending = false;
                throw sendErr;
            }



            // Render optimistically right after sending (core adds the message locally)

            setTimeout(_renderNow, 0);



            if (result && typeof result.then === 'function') {

                result.then((response) => {

                    if (core) {

                        core.removeAttachment?.();

                        if (core.replyToMessage) core.setReplyToMessage?.(null);

                    }

                    // Re-render with confirmed status from server

                    setTimeout(_renderNow, 0);

                }).catch((error) => {

                    UIRenderer.showNotification('Failed to send: ' + error.message, 'error');

                }).finally(() => {

                    this._sending = false;

                });

            } else if (result && result.success !== false) {

                if (core) {

                    core.removeAttachment?.();

                    if (core.replyToMessage) core.setReplyToMessage?.(null);

                }

            } else if (result && result.success === false) {

                UIRenderer.showNotification('Failed to send — check connection', 'error');

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

            // FIX: Upload to server first, then send message with absolute URL.
            // Old code used FileReader.readAsDataURL which sent raw base64 into
            // the message content — bloating the DB and breaking cross-device rendering.
            const type = file.type.startsWith('image/') ? 'image' :
                         file.type.startsWith('video/') ? 'video' :
                         file.type.startsWith('audio/') ? 'audio' : 'file';

            // Show optimistic preview while uploading
            const core = getMessagesCore();
            const localPreviewUrl = URL.createObjectURL(file);
            const previewAttachment = { type, data: localPreviewUrl, name: file.name, size: file.size, uploading: true };
            if (core) {
                core.setCurrentAttachment?.(previewAttachment);
                core.showAttachmentPreview?.(previewAttachment);
            }

            try {
                const { uploadFile: _upload } = await import('./js/api.messages.js').catch(() => ({}));
                const uploadFn = _upload || (typeof window.uploadFile === 'function' ? window.uploadFile : null);
                if (!uploadFn) throw new Error('uploadFile not available');

                const chatId = core?.getCurrentConversation?.()?.id || core?.ChatManager?.getActiveChat?.()?.id;
                const result = await uploadFn(chatId, file, (progress) => {
                    const pct = Math.round(progress * 100);
                    UIRenderer.showNotification(`Uploading… ${pct}%`, 'info', 0);
                });

                UIRenderer.showNotification('', 'info', 1); // clear progress toast
                URL.revokeObjectURL(localPreviewUrl);

                const serverUrl = result?.url || result?.data?.url || result?.fileUrl || result?.mediaUrl || '';
                if (!serverUrl) throw new Error('No URL in upload response');

                const attachment = { type, url: serverUrl, mediaUrl: serverUrl, name: file.name, size: file.size };
                if (core) {
                    core.setCurrentAttachment?.(attachment);
                    core.showAttachmentPreview?.(attachment);
                }
            } catch(uploadErr) {
                console.error('[FileDrop] Upload failed, falling back to local preview:', uploadErr.message);
                URL.revokeObjectURL(localPreviewUrl);
                // Fallback: use local FileReader (will only work in same session)
                const reader = new FileReader();
                reader.onloadend = () => {
                    UIFailsafe.queueAction(() => {
                        const fallbackAttachment = { type, data: reader.result, name: file.name, size: file.size };
                        if (core) { core.setCurrentAttachment?.(fallbackAttachment); core.showAttachmentPreview?.(fallbackAttachment); }
                    });
                };
                reader.readAsDataURL(file);
            }

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

                let chats = core?.getConversations?.() || [];

                // FIX: if no chats loaded yet, trigger fetch then re-render
                if (chats.length === 0 && core && typeof core.fetchConversations === 'function') {
                    core.fetchConversations().then(() => {
                        const refreshedChats = core.getConversations?.() || [];
                        UIRenderer.renderMultiSendChats(refreshedChats);
                    }).catch(() => {});
                }

                UIRenderer.renderMultiSendChats(chats);
                if (window.messagesUI && typeof window.messagesUI.loadMultiSendHistory === 'function') {
                    window.messagesUI.loadMultiSendHistory();
                }

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
            if (window.messagesUI && typeof window.messagesUI.handleSendToMultiple === 'function') {
                await window.messagesUI.handleSendToMultiple({ closePanelOnSuccess: true });
                return;
            }

            UIRenderer.showNotification('Multi-send helper is not ready yet', 'error');

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

            // ── Back button: show on mobile when chat is open, hide on desktop ──
            const backBtn = UIFailsafe.safeGetElement('backToChatsBtn');
            if (backBtn && !window.__returningFromCall) {
                // Remove any inline style override so CSS @media rules take effect
                backBtn.style.display = '';
            }

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

    // ── Chat row "more" button: always-visible three-dot trigger for the
    //    long-press context menu (pin/lock/block/archive/clear/delete/contact).
    //    Replaces the old always-present hover-to-reveal delete icon.
    (function() {
        var _s = document.createElement('style');
        _s.textContent =
            '.chat-item{position:relative;}' +
            '.chat-more-btn:hover{background:rgba(255,255,255,0.08)!important;}';
        document.head.appendChild(_s);
    })();



    // =============================================

    // AUTO-OPEN CHAT FROM EXTERNAL REQUEST

    // =============================================



    function setupAutoOpenChat() {

        _uiLog('[MessageUI] Setting up auto-open chat listener');

        

        window.addEventListener('messages:openChat', function(event) {

            const { userId, userName, userAvatar, recipientId, recipientName, recipientAvatar } = event.detail || {};

            const targetUserId = userId || recipientId;

            const targetUserName = userName || recipientName || 'User';

            const targetAvatar = userAvatar || recipientAvatar || null;

            

            _uiLog('[MessageUI] Auto-open chat requested:', { targetUserId, targetUserName, targetAvatar });

            

            if (!targetUserId) {

                console.error('[MessageUI] No user ID provided for auto-open');

                return;

            }

            

            openChatWithUserInUI(targetUserId, targetUserName, targetAvatar);

        });



        // REMOVED (duplicate-invocation race): this used to also listen for
        // the raw 'OPEN_CHAT_WITH_USER' postMessage directly here and call
        // openChatWithUserInUI() immediately, ungated. message.html's own
        // inline listener already owns that same postMessage type -- with a
        // 2s dedup window and a retry loop that waits for messagesCore to
        // reach ACTIVE -- then re-dispatches it as 'messages:openChat',
        // which the listener directly above this comment already handles.
        // Keeping both meant two competing calls to openChatWithUserInUI()
        // for one message: the ungated call here could run before
        // FriendManager/messagesCore were ready, caching a pending-
        // conversation entry under whatever name was available at that
        // instant (sometimes just the 'User' fallback) -- and later fixups
        // never overwrite an already-cached entry's name. Removing this
        // listener leaves message.html's gated path as the single source of
        // truth for this postMessage type.

        

        // FIX: Do NOT auto-open chat from sessionStorage on init.

        // The chat panel must only open when the user explicitly triggers it:

        //   - Clicking a chat in the sidebar

        //   - Clicking "Message" in friends/calls module (OPEN_CHAT_WITH_USER postMessage)

        // sessionStorage pending_chat is handled by message.html's checkSessionStorageForPendingChat

        // which is called only after the lifecycle reaches ACTIVE and the user action is confirmed.

    }



    // Defensive fallback used only when core.ChatManager.getOrCreatePendingConversation
    // is itself unavailable (e.g. not yet initialized) — mirrors that function's
    // exact object shape and registration so a pending conversation this app
    // creates is NEVER left unregistered (which previously caused every send in
    // that chat to throw "Invalid pending conversation: missing receiverId").
    function _registerFallbackPendingConversation(core, numericUserId, resolvedName, userAvatar) {
        try {
            const cm = core && core.ChatManager;
            if (!cm) return null;
            const pendingId = `pending_${numericUserId}`;
            const existing = cm._conversationsMap && cm._conversationsMap.get(pendingId);
            if (existing) return existing;

            const pendingConversation = {
                id: pendingId,
                type: 'direct',
                friendId: numericUserId,
                friendName: resolvedName || `User_${numericUserId}`,
                friendAvatar: userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(resolvedName || `User_${numericUserId}`)}&background=random&color=fff`,
                online: false,
                unreadCount: 0,
                lastMessage: '',
                lastMessageAt: Date.now(),
                pendingReceiverId: numericUserId,
                isPending: true
            };

            if (cm._conversations) cm._conversations.unshift(pendingConversation);
            if (cm._conversationsMap) cm._conversationsMap.set(pendingId, pendingConversation);
            if (cm._pendingConversations) cm._pendingConversations.set(numericUserId, pendingConversation);
            if (typeof cm._saveToCache === 'function') { try { cm._saveToCache(); } catch (_) {} }

            return pendingConversation;
        } catch (err) {
            console.error('[MessageUI] _registerFallbackPendingConversation failed:', err);
            return null;
        }
    }

    function openChatWithUserInUI(userId, userName, userAvatar, options = {}) {

        const { findExisting = false, returnFromCall = false } = options;

        // Set a global flag so _showChatPanel (in messages-core) also knows we came from a call
        window.__returningFromCall = returnFromCall === true;

        _uiLog('[MessageUI] Opening chat with user:', { userId, userName, userAvatar, findExisting, returnFromCall });

        

        // FIX (root cause of "message rejected when starting chat from
        // friends/new-chat, but fine from chat history"): this app uses
        // UUID-based user IDs. parseInt() on a UUID either returns NaN
        // outright, or silently truncates to a garbage number if the UUID
        // happens to start with digits — so the conversation ends up
        // created against the wrong/nonexistent participant, and nothing
        // ever arrives on the other end. Coerce to a number only when the
        // ID is purely numeric; otherwise keep it as the original string
        // (same UUID-safe pattern already used by friend-ui.js's
        // navigateToChatWithUser/navigateToCallModule).
        const _rawUserId = String(userId).trim();
        const _parsedUserId = parseInt(_rawUserId, 10);
        const numericUserId = (!isNaN(_parsedUserId) && String(_parsedUserId) === _rawUserId) ? _parsedUserId : _rawUserId;

        if (!numericUserId || (typeof numericUserId === 'number' && numericUserId <= 0)) {
            // FIX (root cause of "Invalid pending conversation: missing
            // receiverId" on send): this used to fall through to a "last
            // resort" fallback further down that opened an UNREGISTERED
            // pending_NaN (or pending_0) conversation — nothing ever set a
            // pendingReceiverId for it, so sendMessageToBackend() always
            // threw the moment the user tried to reply. Fail loudly here
            // instead of opening a chat that's guaranteed to break.
            console.error('[MessageUI] openChatWithUserInUI: invalid userId, refusing to open a broken chat', { userId, numericUserId });
            try {
                if (typeof window.showToast === 'function') window.showToast('Could not open this chat — invalid user', 'error');
            } catch (_) {}
            return;
        }

        const core = getMessagesCore();



        // Resolve name/avatar from FriendManager if not provided
        const _stripUserSuffix = (n) => n ? n.replace(/\s+User$/i, '').trim() || n : n;

        let resolvedName = _stripUserSuffix(userName) || 'User';

        let resolvedAvatar = userAvatar || null;

        if (core && core.FriendManager) {

            const friend = core.FriendManager.getFriend(numericUserId)

                        || core.FriendManager.getFriend(String(numericUserId));

            if (friend) {

                resolvedName = _stripUserSuffix(friend.displayName || friend.username || friend.name) || resolvedName;

                resolvedAvatar = resolvedAvatar || (window.Identity && window.Identity.resolveAvatar(friend)) || friend.avatar || friend.photoURL || friend.avatarUrl || null; // IDENTITY-CENTRALIZATION

            }

        }

        

        const chatPanel = document.getElementById('chatPanel');

        const sidebar = document.getElementById('sidebar');

        const contactsSidebar = document.getElementById('contactsSidebar');

        

        if (contactsSidebar) { contactsSidebar.classList.add('hidden'); contactsSidebar.style.pointerEvents = 'none'; }

        // FIX: On mobile, HIDE the sidebar when opening a chat (remove 'active').
        // On desktop, sidebar is always visible so leave it alone.
        if (sidebar && window.innerWidth <= 768) {
            sidebar.classList.remove('active');
        }

        if (chatPanel) {

            chatPanel.classList.remove('hidden');

            UIStateManager.setState('chatVisible', true);

            // Back button visibility is 100% controlled by CSS:
            //   desktop (>768px) → display:none via #backToChatsBtn rule
            //   mobile  (≤768px) → display:flex via @media rule
            // Never set inline style here — that would override the CSS.
            // Just clear any leftover inline style so CSS takes effect.
            const _backBtn = document.getElementById('backToChatsBtn');
            if (_backBtn) _backBtn.style.display = '';
            if (returnFromCall) {
                setTimeout(() => { window.__returningFromCall = false; }, 1500);
            }

            // Push history state for device-back navigation support

            try {

                history.pushState({ view: 'chat', userId: numericUserId, userName: resolvedName }, '', '');

            } catch (_e) {}

            try {

                window.parent?.postMessage({
                    type: 'CHAT_OPENED',
                    timestamp: Date.now(),
                    payload: { userId: numericUserId, name: resolvedName, avatarUrl: resolvedAvatar }
                }, '*');

            } catch (_error) {}

        }



        // Update chat header immediately with correct name and avatar

        const nameEl = document.getElementById('chatFriendName');

        if (nameEl) nameEl.textContent = resolvedName;

        // ── FIX: Resolve real online status from FriendManager immediately ──
        {
            let _openIsOnline = false;
            const _coreRef = getMessagesCore();
            if (_coreRef && _coreRef.FriendManager) {
                const _fObj = _coreRef.FriendManager.getFriend(numericUserId)
                           || _coreRef.FriendManager.getFriend(String(numericUserId));
                if (_fObj) _openIsOnline = !!(_fObj.online || _fObj.status === 'online');
            }
            const _statusEl2 = document.getElementById('chatStatusText');
            const _indicatorEl2 = document.getElementById('chatStatusIndicator');
            if (_openIsOnline) {
                // Immediately show "Active now" — no flicker needed
                if (_statusEl2) _statusEl2.textContent = 'Active now';
                if (_indicatorEl2) _indicatorEl2.className = 'chat-status online';
            } else {
                // Delay "Offline" slightly — gives FriendManager a chance to resolve
                // real status before we settle on offline, preventing Online→Offline flicker
                setTimeout(() => {
                    const _core3 = getMessagesCore();
                    let _stillOnline = false;
                    if (_core3 && _core3.FriendManager) {
                        const _fObj2 = _core3.FriendManager.getFriend(numericUserId)
                                    || _core3.FriendManager.getFriend(String(numericUserId));
                        if (_fObj2) _stillOnline = !!(_fObj2.online || _fObj2.status === 'online');
                    }
                    const _s = document.getElementById('chatStatusText');
                    const _i = document.getElementById('chatStatusIndicator');
                    if (_s) _s.textContent = _stillOnline ? 'Active now' : 'Offline';
                    if (_i) _i.className = 'chat-status ' + (_stillOnline ? 'online' : 'offline');
                }, 600);
            }
        }
        // ── END online status FIX ──

        const avatarEl = document.getElementById('chatFriendAvatar');

        if (avatarEl) {

            if (resolvedAvatar) {

                avatarEl.innerHTML = `<img src="${resolvedAvatar}" alt="${resolvedName}" loading="lazy" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;

            } else {

                const initials = resolvedName.charAt(0).toUpperCase();

                avatarEl.innerHTML = `<span style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;">${initials}</span>`;

            }

        }

        // Always enable the message input

        const messageInput = document.getElementById('messageInput');

        if (messageInput) {

            messageInput.disabled = false;

            messageInput.placeholder = `Message ${resolvedName}...`;

        }

        const sendButton = document.getElementById('sendButton');

        if (sendButton) sendButton.disabled = false;

        

        window.currentFriendName = resolvedName;



        if (window.messagesUI && typeof window.messagesUI.loadChatByFriendId === 'function') {

            _uiLog('[MessageUI] Using messagesUI.loadChatByFriendId');

            window.messagesUI.loadChatByFriendId(numericUserId, resolvedName);

            return;

        }



        if (core && typeof core.openConversation === 'function') {

            _uiLog('[MessageUI] Using core.openConversation');

            

            // ✅ FIXED: Check for existing conversation if findExisting is true

            if (findExisting && typeof core.findExistingConversation === 'function') {

                const existingConv = core.findExistingConversation(numericUserId);

                if (existingConv) {

                    _uiLog('[MessageUI] Found existing conversation:', existingConv.id);

                    // FIX Bug5: pass name so header never shows Loading...
                    core.openConversation(existingConv.id, { friendName: resolvedName, userName: resolvedName, minFetchGap: 0 });

                } else {

                    // FIX-CHATID-BUG: numericUserId is a USER id, never a chat id.
                    // Passing it straight into openConversation() makes ChatManager
                    // treat it as a real chatId and POST { chatId: <userId> } to
                    // /api/messages, which 403s with "Access denied to this chat"
                    // because the user is not a participant of a chat that doesn't
                    // exist. Must go through the pending_<receiverId> conversation
                    // so ChatManager._sendMessage sends { receiverId } instead and
                    // lets the backend find-or-create the real chat.
                    _uiLog('[MessageUI] No existing conversation found, creating pending conversation for user:', numericUserId);

                    let pendingConv = null;
                    if (core.ChatManager && typeof core.ChatManager.getOrCreatePendingConversation === 'function') {
                        pendingConv = core.ChatManager.getOrCreatePendingConversation(numericUserId, resolvedName, userAvatar);
                    }

                    if (!pendingConv || !pendingConv.id) {
                        // FIX (root cause of "Invalid pending conversation: missing
                        // receiverId" on send): this used to fall straight to
                        // core.openConversation(`pending_${numericUserId}`, ...)
                        // without ever registering that id anywhere — nothing set
                        // pendingReceiverId, so sending in that chat always threw.
                        // numericUserId is guaranteed valid at this point (checked
                        // above), so build and register the same shape
                        // getOrCreatePendingConversation would have, by hand.
                        pendingConv = _registerFallbackPendingConversation(core, numericUserId, resolvedName, userAvatar);
                    }

                    if (pendingConv && pendingConv.id) {
                        core.openConversation(pendingConv.id, { friendName: resolvedName, userName: resolvedName, minFetchGap: 0 });
                    }

                }

            } else {

                // Same fix applies to the non-findExisting path — never pass a bare userId.
                let pendingConv = null;
                if (core.ChatManager && typeof core.ChatManager.getOrCreatePendingConversation === 'function') {
                    pendingConv = core.ChatManager.getOrCreatePendingConversation(numericUserId, resolvedName, userAvatar);
                }

                if (!pendingConv || !pendingConv.id) {
                    pendingConv = _registerFallbackPendingConversation(core, numericUserId, resolvedName, userAvatar);
                }

                if (pendingConv && pendingConv.id) {
                    core.openConversation(pendingConv.id, { friendName: resolvedName, userName: resolvedName, minFetchGap: 0 });
                }

            }

            

            setTimeout(() => {

                const _nameEl2 = document.getElementById('chatFriendName');

                if (_nameEl2 && _nameEl2.textContent !== resolvedName) _nameEl2.textContent = resolvedName;

                const statusEl = document.getElementById('chatStatusText');

                if (statusEl) {

                    const _core2 = getMessagesCore();

                    let _realOnline = false;

                    if (_core2 && _core2.FriendManager) {

                        const _f = _core2.FriendManager.getFriend(numericUserId)
                                || _core2.FriendManager.getFriend(String(numericUserId));

                        if (_f) _realOnline = !!(_f.online || _f.status === 'online');

                    }

                    statusEl.textContent = _realOnline ? 'Active now' : 'Offline';

                }

                const indicatorEl = document.getElementById('chatStatusIndicator');

                if (indicatorEl) {
                    const _isNowOnline = document.getElementById('chatStatusText')?.textContent === 'Active now';
                    indicatorEl.className = `chat-status ${_isNowOnline ? 'online' : 'offline'}`;
                }



                const messagesContainer = document.getElementById('messagesContainer');

                if (messagesContainer && messagesContainer.innerHTML.includes('loading-chat')) {

                    messagesContainer.innerHTML = `

                        <div class="empty-chat">

                            <i class="fas fa-comment-dots empty-chat-icon"></i>

                            <div class="empty-chat-title">No messages yet</div>

                            <div class="empty-chat-message">Type your first message below to start the conversation with ${resolvedName}</div>

                        </div>

                    `;

                }

            }, 100);

            return;

        }

        

        if (core && core.ConversationManager && typeof core.ConversationManager.createConversation === 'function') {

            _uiLog('[MessageUI] Using ConversationManager.createConversation');

            const result = core.ConversationManager.createConversation([numericUserId]);

            

            const openPanel = () => {

                setTimeout(() => {

                    const _nameEl3 = document.getElementById('chatFriendName');

                    if (_nameEl3) _nameEl3.textContent = resolvedName;

                    const messagesContainer = document.getElementById('messagesContainer');

                    if (messagesContainer && messagesContainer.innerHTML.includes('loading-chat')) {

                        messagesContainer.innerHTML = `

                            <div class="empty-chat">

                                <i class="fas fa-comment-dots empty-chat-icon"></i>

                                <div class="empty-chat-title">No messages yet</div>

                                <div class="empty-chat-message">Type your first message below to start the conversation with ${resolvedName}</div>

                            </div>

                        `;

                    }

                }, 100);

            };

            

            if (result && typeof result.then === 'function') {

                result.then((conversation) => {

                    _uiLog('[MessageUI] Conversation opened:', conversation);

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

            _uiLog('[MessageUI] Using ChatManager.openChat');

            window.ChatManager.openChat(numericUserId, resolvedName);

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

                _uiLog('[MessageUI] Found user element:', selector);

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

            _uiLog('[MessageUI] Searching for user:', resolvedName);

            searchInput.value = resolvedName;

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

                    _uiLog('[MessageUI] No search results found for:', resolvedName);

                    showNotificationInMessages(`Click + New Chat to start conversation with ${resolvedName}`, 'info');

                }

            }, 600);

        } else {

            _uiLog('[MessageUI] Could not find way to open chat with user:', userId);

            showNotificationInMessages(`Click + New Chat to start conversation with ${resolvedName}`, 'info');

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

            _uiLog('[MessageUI] Notification:', message);

        }

    }



    // Device back-button handler — when user navigates back, hide chat panel and show sidebar

    window.addEventListener('popstate', function(event) {

        const chatPanel = document.getElementById('chatPanel');

        const sidebar = document.getElementById('sidebar');

        const contactsSidebar = document.getElementById('contactsSidebar');

        const state = event.state || {};


        // FIX-CHAT-HISTORY-HEADER: this used to trigger "return to sidebar"
        // whenever state.view === 'chat' (i.e. exactly when popping BACK INTO
        // a chat) or whenever a chat was already visible regardless of the
        // popped state — both wrong for reopening a chat from history, which
        // should leave the chat panel (and its own call/video/options header)
        // showing rather than snapping back to the sidebar's icons. Only the
        // absence of a chat view in the popped state means "go to sidebar".
        if (state.view !== 'chat') {

            // Going back from chat → show sidebar

            if (chatPanel) chatPanel.classList.add('hidden');

            if (sidebar) sidebar.classList.add('active');

            // Remove CSS safeguard class so sidebar slides back in
            document.body.classList.remove('chat-active');

            if (contactsSidebar) { contactsSidebar.classList.add('hidden'); contactsSidebar.style.pointerEvents = 'none'; }

            UIStateManager.setState('chatVisible', false);

            // FIX: Notify parent so it removes chat-panel-active → restores mobile nav bar
            try { window.parent.postMessage({ type: 'CHAT_LIST_SHOWN', timestamp: Date.now() }, '*'); } catch (_) {}

            _uiLog('[MessageUI] Device back: returned to sidebar');

        } else {

            // Navigating (back/forward) INTO a chat state: make sure the chat
            // panel (with its own header/icons) is the thing showing, not the
            // sidebar left over from wherever we were before.
            if (chatPanel) chatPanel.classList.remove('hidden');
            if (sidebar) sidebar.classList.remove('active');
            document.body.classList.add('chat-active');
            if (contactsSidebar) { contactsSidebar.classList.add('hidden'); contactsSidebar.style.pointerEvents = 'none'; }
            UIStateManager.setState('chatVisible', true);
            try { window.parent.postMessage({ type: 'CHAT_PANEL_SHOWN', timestamp: Date.now() }, '*'); } catch (_) {}
            _uiLog('[MessageUI] History navigation: restored chat panel view');

        }

    });



    // =============================================

    // UI INITIALIZATION (PASSIVE UNTIL ACTIVE)

    // =============================================

    function initializeUI() {

        _ensureStatusIndicators();

        _removeLoadingOverlays();

        

        setupAutoOpenChat();

        // FIX: Receiver real-time render
        window.addEventListener('kyn:incomingMessage', function(evt) {
            var detail = evt.detail || {};
            var inMsg = detail.message || detail;
            var inChat = String(inMsg.chatId || inMsg.conversationId || detail.chatId || '');
            if (!inChat) return;
            var core = getMessagesCore();
            var active = (core && core.getCurrentConversation && core.getCurrentConversation()) || (core && core.ChatManager && core.ChatManager.getActiveChat && core.ChatManager.getActiveChat());
            var _ts = function(m) { var v = m.createdAt || m.timestamp || 0; return typeof v === 'string' ? new Date(v).getTime() : Number(v); };
            if (active && String(active.id) === inChat) {
                var all = (core && core.getMessages && core.getMessages()) || (core && core.ChatManager && core.ChatManager._messages) || [];
                var msgs = all.filter(function(m) { return String(m.chatId || m.conversationId || '') === inChat; }).sort(function(a,b) { return _ts(a)-_ts(b); });
                UIRenderer.renderMessages(msgs.length > 0 ? msgs : [], active, core && core.getCurrentUser && core.getCurrentUser());
                try { var el=document.getElementById('messagesContainer'); if(el) requestAnimationFrame(function(){el.scrollTop=el.scrollHeight;}); } catch(_e){}
            } else {
                UIRenderer.renderChatsList((core && core.getConversations && core.getConversations()) || [], active, (core && core.getCurrentCategory && core.getCurrentCategory()) || 'all', {});
            }
        });
        // FIX: scroll to quoted reply message
        window.messagesUI = window.messagesUI || {};
        window.messagesUI.scrollToMessage = function(messageId) {
            if (!messageId) return;
            var el = document.querySelector('[data-message-id="' + messageId + '"]');
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.transition = 'background 0.35s'; el.style.background = 'rgba(34,197,94,0.2)'; setTimeout(function() { el.style.background = ''; }, 1300); }
        };



        const primeCachedUi = () => {

            const core = getMessagesCore();

            if (!core) return false;



            const conversations = core.getConversations?.() || [];

            const currentChat = core.getCurrentConversation?.();

            const currentCategory = core.getCurrentCategory?.() || 'all';

            const friends = core.getFriends?.() || [];

            const messages = (core.getMessages?.() || []).filter(m => {
                const mCid = String(m.chatId || m.conversationId || '');
                const _pcCid = currentChat ? String(currentChat.id || '') : '';
                const _pcFid = currentChat ? String(currentChat.friendId || currentChat.otherUserId ||
                    (currentChat.otherParticipant && currentChat.otherParticipant.id) || '') : '';
                return (_pcCid && mCid === _pcCid) || (_pcFid && mCid === _pcFid);
            });

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

                            // FIX-CROSS-CHAT-RENDER: messages here is ChatManager's raw
                            // global _messages array (see _notifySubscribers in
                            // messages-core.js — it hands (conversations, activeConversation,
                            // this._messages) to every subscriber, unfiltered). This
                            // subscribe callback fires on nearly every state change, so
                            // passing that whole cross-chat list straight to renderMessages()
                            // for whatever chat happens to be active was likely the most
                            // frequent trigger of messages from other chats leaking in, or
                            // of a later correctly-filtered render wiping bubbles that
                            // weren't in its (correct) smaller list.
                            const _subCid = String(activeChat.id || '');
                            const _subFid = String(activeChat.friendId || activeChat.otherUserId ||
                                (activeChat.otherParticipant && activeChat.otherParticipant.id) || '');
                            const _filteredMsgs = (Array.isArray(messages) ? messages : []).filter(m => {
                                const mCid = String(m.chatId || m.conversationId || '');
                                return (_subCid && mCid === _subCid) || (_subFid && mCid === _subFid);
                            });

                            UIRenderer.renderMessages(_filteredMsgs, activeChat, user);

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

            // FIX: Always check hasValidSession() first — it reads core.isAuthenticated() directly

            // and is not blocked by UIStateManager.state.lifecycleState being stale.

            const hasValidSession = UIFailsafe.hasValidSession();

            const lifecycleState = UIFailsafe.getLifecycleState();

            

            if (hasValidSession) {

                // Session is valid — enable UI immediately regardless of lifecycle state label

                clearInterval(checkCore);

                UIFailsafe.forceEnableUI();

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

                return;

            }



            // Not yet ready

            if (lifecycleState === LIFECYCLE_STATES.WAIT_PARENT) {

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

            

            // FIX: 60 checks * 50ms = 3000ms was far too short on slow (1KB/s)
            // links or Render cold starts, where session data can legitimately
            // take 15-20s to arrive. Raised to match sessionSync.timeout (20s).
            if (checkCount > 400) {

                if (UIFailsafe.hasValidSession()) {

                    _uiLog('[UI] Timeout but session valid - forcing UI enable');

                    UIFailsafe.forceEnableUI();

                    setupCoreSubscriptions();

                } else {

                    _uiLog('[UI] Timeout - no session, showing fallback');

                    _updateFallbackUI();

                }

                clearInterval(checkCore);

            }

        }, 50);



        setTimeout(() => {

            if (UIFailsafe.hasValidSession() && UIStateManager.getState('sessionValid') !== true) {

                _uiLog('[UI] 3s timeout - forcing UI enable');

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

            const id = String(chatId || '').trim();

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

            const id = String(chatId || '').trim();

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

            // FIXED: Always show the panel — pass full chat object so header renders correctly

            const chatPanel = document.getElementById('chatPanel');

            const sidebar = document.getElementById('sidebar');

            if (chatPanel) {

                chatPanel.classList.remove('hidden');

                UIStateManager.setState('chatVisible', true);

            }

            if (sidebar && window.innerWidth <= 768) {

                sidebar.classList.remove('active');

            }

            // BUG FIX (CHAT-PANEL-SHOWS-SIDEBAR-HEADER): messages.css has a
            // `body.chat-active #sidebar { transform: translateX(-100%)
            // !important; }` rule, added specifically to force the sidebar
            // off-screen and "prevent the brief two-panel flash" — i.e. the
            // sidebar (and its own header/icons) briefly rendering on top of
            // the chat panel. But that class was only ever being set by the
            // popstate (back/forward) handler and the close-chat path — the
            // ordinary tap-a-chat-from-history path (this function) removed
            // sidebar's plain .active class but never set body.chat-active,
            // so it never got the !important protection and could show the
            // sidebar's header instead of the chat panel's, intermittently.
            if (window.innerWidth <= 768) {
                document.body.classList.add('chat-active');
            }

            const core = getMessagesCore();

            const coreState = core?.getState?.();

            if (core && core.openConversation) {

                // Pass full chat object as options so friendName is available immediately in the header
                const _chatId = (chat && chat.id) ? chat.id : chat;
                const _chatOpts = (chat && typeof chat === 'object') ? { friendName: chat.friendName || chat.name, friendAvatar: chat.friendAvatar || chat.avatar, userName: chat.friendName || chat.name } : {};

                // FIXED: Use a per-chatId dedup flag to prevent double-open
                // when waitAndOpen fires concurrently with a second click
                const _openKey = 'opening_chat_' + String(_chatId);
                if (window[_openKey]) return; // already opening this chat
                window[_openKey] = true;
                const _clearOpenKey = () => { try { delete window[_openKey]; } catch(_){} };

                if (coreState?.state === 'ACTIVE') {
                    core.openConversation(_chatId, _chatOpts).catch?.(() => {}).finally?.(_clearOpenKey) || setTimeout(_clearOpenKey, 2000);
                } else {
                    // Core not ready yet — poll until it is, then open ONCE
                    let attempts = 0;
                    let _opened = false;
                    const waitAndOpen = () => {
                        if (_opened) return;
                        attempts++;
                        const c = getMessagesCore();
                        const s = c?.getState?.();
                        if (s?.state === 'ACTIVE') {
                            _opened = true;
                            c.openConversation(_chatId, _chatOpts).catch?.(() => {}).finally?.(_clearOpenKey) || setTimeout(_clearOpenKey, 2000);
                        } else if (attempts < 20) {
                            setTimeout(waitAndOpen, 250);
                        } else {
                            _clearOpenKey();
                        }
                    };
                    setTimeout(waitAndOpen, 100);
                }

            }

        },

        

        loadChatByFriendId: (friendId, friendName) => {
            const _dk = 'loadchat_' + friendId, _nt = Date.now();
            if (window.__loadChatDedup && window.__loadChatDedup[_dk] && (_nt - window.__loadChatDedup[_dk]) < 1500) return;
            if (!window.__loadChatDedup) window.__loadChatDedup = {};
            window.__loadChatDedup[_dk] = _nt;
            setTimeout(() => { if (window.__loadChatDedup) delete window.__loadChatDedup[_dk]; }, 1500);

            const core = getMessagesCore();

            if (!core) {

                _uiLog('[messagesUI] Core not available, retrying in 500ms');

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

            

            _uiLog('[messagesUI] loadChatByFriendId called with:', { friendId, friendName: displayName });



            // FIX: same UUID-vs-parseInt bug as openChatWithUserInUI above —
            // parseInt() on a UUID-based friendId returns NaN (or a
            // truncated garbage number), which either aborted this entry
            // point outright or created a conversation against the wrong
            // participant. Coerce to a number only when the ID is purely
            // numeric; otherwise keep the original string.
            const _rawFriendId = String(friendId || '').trim();
            const _parsedFriendId = parseInt(_rawFriendId, 10);
            const id = (!isNaN(_parsedFriendId) && String(_parsedFriendId) === _rawFriendId) ? _parsedFriendId : _rawFriendId;

            if (!id) {

                console.error('[messagesUI] Invalid friend ID:', friendId);

                return;

            }

            const currentUserId = getCurrentUserId();



            const existingConversation = core.getConversations?.()?.find?.((conversation) =>

                getConversationPeerId(conversation, currentUserId) === String(id)

            );



            const contactsSidebar = document.getElementById('contactsSidebar');

            const sidebar = document.getElementById('sidebar');

            const chatPanel = document.getElementById('chatPanel');

            

            if (contactsSidebar) { contactsSidebar.classList.add('hidden'); contactsSidebar.style.pointerEvents = 'none'; }

            // FIX: On mobile, HIDE sidebar when opening chat
            if (sidebar && window.innerWidth <= 768) { sidebar.classList.remove('active'); }
            // BUG FIX (CHAT-PANEL-SHOWS-SIDEBAR-HEADER): see openChat() above —
            // body.chat-active is what messages.css uses (with !important) to
            // forcefully push the sidebar off-screen; without it here too,
            // this entry point had the same intermittent header-flash bug.
            if (window.innerWidth <= 768) { document.body.classList.add('chat-active'); }

            

            const nameEl = document.getElementById('chatFriendName');

            if (nameEl) {

                nameEl.textContent = displayName;

            }

            

            if (chatPanel) {

                chatPanel.classList.remove('hidden');

                UIStateManager.setState('chatVisible', true);

                // FIX: Send ACK immediately so chat.html retry loop stops on attempt 1

                try {
                    window.parent?.postMessage({
                        type: 'CHAT_OPENED',
                        timestamp: Date.now(),
                        payload: { userId: id, name: displayName, avatarUrl: existingConversation && existingConversation.friendAvatar }
                    }, '*');
                } catch(_) {}

                

                const messagesContainer = document.getElementById('messagesContainer');

                if (messagesContainer) {

                    const cachedMessages = existingConversation?.id && core.getCachedMessages

                        ? core.getCachedMessages(existingConversation.id)

                        : [];

                    if (Array.isArray(cachedMessages) && cachedMessages.length > 0) {

                        // FIX-MISSING-RENDER-ARGS: renderMessages(messages, currentChat,
                        // currentUser) treats a missing/undefined currentChat as "no chat
                        // selected" and immediately wipes messagesContainer to the empty-
                        // chat placeholder — it does not fall back to inferring the chat
                        // from the messages themselves. Calling it with only the messages
                        // array (as before) discarded the just-loaded cached history on
                        // every single chat-open, showing an empty conversation until (if
                        // ever) a later fetch re-populated it.
                        const _curUser = core?.getCurrentUser?.() || { id: currentUserId, userId: currentUserId };
                        UIRenderer.renderMessages(cachedMessages, existingConversation, _curUser);

                    } else if (existingConversation?.id && window.KynectaLocalStore) {

                        // ✅ FIX C2: Load from IDB before showing "empty" state.

                        // getCachedMessages() only checks the in-memory map which may

                        // not be populated yet on first load — IDB has the real history.

                        window.KynectaLocalStore.getMessagesByChat(String(existingConversation.id), { limit: 100 })

                            .then(idbMsgs => {

                                if (idbMsgs && idbMsgs.length > 0) {

                                    // Same missing-args bug as above — see FIX-MISSING-RENDER-ARGS.
                                    const _curUser2 = core?.getCurrentUser?.() || { id: currentUserId, userId: currentUserId };
                                    UIRenderer.renderMessages(idbMsgs, existingConversation, _curUser2);

                                    _uiLog('[messagesUI] ✅ FIX C2 Loaded', idbMsgs.length, 'messages from IDB for chat', existingConversation.id);

                                } else {

                                    messagesContainer.innerHTML = `

                                        <div class="empty-chat">

                                            <i class="fas fa-comment-dots empty-chat-icon"></i>

                                            <div class="empty-chat-title">Conversation ready</div>

                                            <div class="empty-chat-message">Type your first message below to start the conversation with ${displayName}</div>

                                        </div>

                                    `;

                                }

                            })

                            .catch(() => {

                                messagesContainer.innerHTML = `

                                    <div class="empty-chat">

                                        <i class="fas fa-comment-dots empty-chat-icon"></i>

                                        <div class="empty-chat-title">Conversation ready</div>

                                        <div class="empty-chat-message">Type your first message below to start the conversation with ${displayName}</div>

                                    </div>

                                `;

                            });

                    } else {

                        messagesContainer.innerHTML = `

                            <div class="empty-chat">

                                <i class="fas fa-comment-dots empty-chat-icon"></i>

                                <div class="empty-chat-title">Conversation ready</div>

                                <div class="empty-chat-message">Type your first message below to start the conversation with ${displayName}</div>

                            </div>

                        `;

                    }

                }

            }



            const ensureChatPanelOpen = (conversationId) => {

                _uiLog('[messagesUI] Ensuring chat panel open with ID:', conversationId);

                

                if (chatPanel) {

                    chatPanel.classList.remove('hidden');

                    UIStateManager.setState('chatVisible', true);

                    try {

                        window.parent?.postMessage({
                            type: 'CHAT_OPENED',
                            timestamp: Date.now(),
                            payload: { userId: id, name: displayName, avatarUrl: existingConversation && existingConversation.friendAvatar }
                        }, '*');

                    } catch (_error) {}

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

                        if (statusEl) {

                            const friendOnline = !!friend.online;

                            statusEl.textContent = friendOnline ? 'Active now' : '';

                        }

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

                


                // FIX: this function makes the chat panel LOOK open and ready
                // immediately (header/avatar/status), as instant feedback while
                // core.openConversation() is still resolving asynchronously in
                // the background. But messageInput.disabled/.focus() was only
                // ever set later, inside _showChatPanel (messages-core.js),
                // which only runs once that async call finishes. Opening a
                // chat from the history list calls this function first and
                // core.openConversation() second -- so there was a real window
                // where the panel appeared open but the input wasn't focused
                // yet, and keystrokes typed in that window (or a stray
                // keystroke landing exactly as focus finally arrived) were
                // silently lost or dropped a character. Enable + focus here
                // too so the panel is functionally ready the instant it looks
                // ready, not just visually.
                const _mInput = document.getElementById('messageInput');
                const _mSendBtn = document.getElementById('sendButton');
                if (_mInput) _mInput.disabled = false;
                if (_mSendBtn) _mSendBtn.disabled = false;
                if (_mInput && document.activeElement !== _mInput) {
                    setTimeout(() => { _mInput.focus(); }, 50);
                }

            };



            if (existingConversation?.id && core.openConversation) {

                _uiLog('[messagesUI] Opening existing conversation instantly:', existingConversation.id);

                // FIX Bug3: ensureChatPanelOpen must run AFTER openConversation resolves
                // so messages are loaded before the panel is shown (no more blank panel).
                // FIX Bug4: pass friendName/userName so _showChatPanel never falls back to 'Loading…'.
                core.openConversation(existingConversation.id, { minFetchGap: 0, friendName: displayName, userName: displayName })
                    .then(() => ensureChatPanelOpen(existingConversation.id))
                    .catch(() => ensureChatPanelOpen(existingConversation.id));

                // Also call ensureChatPanelOpen immediately for instant visual feedback
                // (shows the panel with correct name right away, messages fill in async)
                ensureChatPanelOpen(existingConversation.id);

                return;

            }



            if (core.ConversationManager?.createConversation) {

                _uiLog('[messagesUI] Using ConversationManager.createConversation');

                const result = core.ConversationManager.createConversation([id]);

                

                if (result && typeof result.then === 'function') {

                    result.then((conversation) => {

                        _uiLog('[messagesUI] Conversation created/opened:', conversation);

                        if (conversation === false || conversation === null) {

                            _uiLog('[messagesUI] createConversation returned false, opening panel anyway');

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

                _uiLog('[messagesUI] Using core.createConversation');

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

                _uiLog('[messagesUI] Using core.openConversation');

                // FIX Bug2: pass friendId explicitly -- `id` here IS the friend/user id
                // (the caller builds a conversation for this user), so without this the
                // placeholder conversation built inside openConversation() has no way to
                // resolve friendId and getActiveChatInfo() would fall back to the wrong id.
                core.openConversation(id, { friendId: id });

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

        

        // FIX: handler for the auto-download-off placeholder added to the image
        // message template — replaces the tap-to-load placeholder with a real
        // <img> pointed at the stored media URL, i.e. a manual, one-time
        // download of just that image.
        loadMediaOnDemand: (placeholderEl) => {
            try {
                if (!placeholderEl) return;
                const url = placeholderEl.getAttribute('data-media-src');
                if (!url) return;
                const img = document.createElement('img');
                img.src = url;
                img.alt = 'Image';
                img.loading = 'lazy';
                img.onerror = function () {
                    this.style.display = 'none';
                    if (this.nextElementSibling) this.nextElementSibling.style.display = 'flex';
                };
                const fallback = document.createElement('div');
                fallback.style.cssText = 'display:none;align-items:center;justify-content:center;padding:12px;color:#888;font-size:13px';
                fallback.textContent = '📷 Image unavailable';
                placeholderEl.replaceWith(img);
                img.after(fallback);
            } catch (e) {
                console.warn('[MessagesUI] loadMediaOnDemand failed:', e.message);
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

    // FIX: expose UIRenderer to window so installSettingsUIBridge IIFE can use it
    // (that IIFE is outside this closure, so UIRenderer would otherwise be undefined)
    window.UIRenderer = UIRenderer;
    // FIX: expose UIFailsafe to window for the same reason — multi-send history
    // functions added after this IIFE close reference UIFailsafe which is scoped here
    window.UIFailsafe = UIFailsafe;

})();

// =============================================

// SETTINGS LIVE-APPLY BRIDGE (UI Layer)

// Applies setting changes to the DOM as they arrive,

// both from the core's CustomEvents and from direct postMessages.

// =============================================

(function installSettingsUIBridge() {

    // FIX: this IIFE (MultiSend / settings UI bridge) calls _uiLog(...) in
    // several handlers below (history panel open, send-triggered, API
    // request/response logging, button clicks) but never declared it —
    // _uiLog from the very first IIFE in this file is scoped to that
    // closure and is NOT visible here, so every one of those call sites
    // threw "Uncaught ReferenceError: _uiLog is not defined" the first
    // time a user opened chat history or sent a multi-send message,
    // aborting the handler mid-execution. That abort is what left the
    // header icons, back arrow, name, and avatar in an inconsistent state
    // after opening a chat from history. Local copy of the same
    // debug-gated logger used elsewhere in this file.
    const _uiLog = (...a) => { if (window.__MESSAGES_DEBUG__) console.log(...a); };

    function applyUISettingChange(section, key, value) {

        if (section === 'appearance') {

            if (key === 'theme') {

                // FIX (Phase 17 — single theme owner): delegate to
                // window.ThemeManager instead of painting independently.
                var t = (value === 'dark' ? 'dark' : 'light');

                if (window.ThemeManager) {
                    window.ThemeManager.setTheme(t);
                } else {
                    document.documentElement.setAttribute('data-theme', t);
                    document.body.setAttribute('data-theme', t);
                    document.body.classList.toggle('dark-theme', t === 'dark');
                    document.documentElement.style.colorScheme = t;
                }

            }

            if (key === 'fontSize') {
                if (window.ThemeManager) window.ThemeManager.setFontSize(parseInt(value, 10));
                else document.documentElement.style.fontSize = parseInt(value) + 'px';
            }

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

        }

    }



    // Legacy event listeners for backwards compatibility

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

    window.messagesUI = window.messagesUI || {};

    (window.UIRenderer || {showNotification:function(){},renderMultiSendHistory:function(){},renderMultiSendHistoryDetail:function(){}}).renderMultiSendHistory = function(historyItems) {
        const listEl = window.UIFailsafe?.safeGetElement('multiSendHistoryList');
        if (!listEl) return;
        const items = Array.isArray(historyItems) ? historyItems : [];
        window.UIFailsafe?.safeSetStyle(listEl, 'display', 'block');
        if (items.length === 0) {
            window.UIFailsafe?.safeSetHTML(listEl, '<div style="color:#64748b;font-size:12px;padding:8px 0;text-align:center;">No multi-send history yet</div>');
            return;
        }
        const html = items.slice(0, 20).map((item) => {
            const cnt = Array.isArray(item.recipients) ? item.recipients.length : (parseInt(item.deliveryCount, 10) || 0);
            const preview = (item.content || '').substring(0, 60) + ((item.content || '').length > 60 ? '…' : '');
            const ts = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
            return '<button type="button" data-batch-id="' + (item.batchId || item.id) + '" class="multi-send-history-item" style="width:100%;text-align:left;border:none;background:#fff;padding:10px 12px;border-radius:12px;margin-bottom:8px;box-shadow:0 1px 3px rgba(15,23,42,0.08);cursor:pointer;">' +
                '<div style="font-weight:600;color:#0f172a;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + preview + '</div>' +
                '<div style="font-size:11px;color:#64748b;margin-top:4px;">' + cnt + ' recipients · ' + (parseInt(item.seenCount,10)||0) + ' seen' + (ts ? ' · ' + ts : '') + '</div>' +
                '</button>';
        }).join('');
        window.UIFailsafe?.safeSetHTML(listEl, html);

        listEl.querySelectorAll('[data-batch-id]').forEach((button) => {
            button.addEventListener('click', () => {
                window.messagesUI?.openMultiSendHistory?.(button.dataset.batchId);
            });
        });
    };

    (window.UIRenderer || {showNotification:function(){},renderMultiSendHistory:function(){},renderMultiSendHistoryDetail:function(){}}).renderMultiSendHistoryDetail = function(detail) {
        const detailEl = window.UIFailsafe?.safeGetElement('multiSendHistoryDetail');
        if (!detailEl) return;
        if (!detail) {
            window.UIFailsafe?.safeSetStyle(detailEl, 'display', 'none');
            return;
        }

        const recipients = Array.isArray(detail.recipients) ? detail.recipients : [];
        const recipientHtml = recipients.map((item) => {
            const status = item.readAt ? 'Seen' : (item.deliveredAt ? 'Delivered' : 'Sent');
            return `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid rgba(148,163,184,0.18);">
                <span style="color:#0f172a;">${item.displayName || item.username || item.userId}</span>
                <span style="color:#64748b;font-size:12px;">${status}</span>
            </div>`;
        }).join('');

        window.UIFailsafe?.safeSetHTML(detailEl, `
            <div style="font-weight:700;color:#0f172a;margin-bottom:6px;">Sent To Multiple History</div>
            <div style="font-size:13px;color:#334155;margin-bottom:10px;">${detail.content || ''}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:8px;">Reply mode: ${detail.replyVisibility === 'creator_only' ? 'Creator only' : 'Public'}</div>
            <div>${recipientHtml || '<div style="color:#64748b;font-size:12px;">No recipients</div>'}</div>
        `);
        window.UIFailsafe?.safeSetStyle(detailEl, 'display', 'block');
    };

    window.messagesUI.loadMultiSendHistory = async function() {
        const listEl = window.UIFailsafe?.safeGetElement('multiSendHistoryList');
        if (!listEl) return;
        // FIXED: (window.messagesCore || null) is inside the IIFE — not accessible here. Use window.messagesCore.
        const core = window.messagesCore || null;
        let token = null;
        try { const sess = core && core.getSession && core.getSession(); token = (sess && sess.token) || localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('nexopa_token') || localStorage.getItem('accessToken'); } catch(_e){}
        try {
            const resp = await fetch('/api/messages/bulk/history', {
                headers: token ? { Authorization: 'Bearer ' + token } : {}
            });
            const result = await resp.json().catch(function() { return {}; });
            (window.UIRenderer || {showNotification:function(){},renderMultiSendHistory:function(){},renderMultiSendHistoryDetail:function(){}}).renderMultiSendHistory(Array.isArray(result.data) ? result.data : []);
        } catch (error) {
            console.warn('[MultiSend] Failed to load history:', error);
            window.UIFailsafe?.safeSetStyle(listEl, 'display', 'none');
        }
    };

    window.messagesUI.openMultiSendHistory = async function(batchId) {
        if (!batchId) return;
        _uiLog('[MultiSend] Opening history detail:', batchId);
        window.messagesUI?.showMultiSendHistoryPanel?.({ detailOnly: true });
        const core = (window.messagesCore || null);
        let token = null;
        try { const sess = core && core.getSession && core.getSession(); token = (sess && sess.token) || localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('nexopa_token') || localStorage.getItem('accessToken'); } catch(_e){}
        try {
            const resp = await fetch('/api/messages/bulk/history/' + encodeURIComponent(batchId), {
                headers: token ? { Authorization: 'Bearer ' + token } : {}
            });
            const result = await resp.json().catch(function() { return {}; });
            if (!resp.ok || result.success === false) {
                throw new Error(result.message || 'Failed to load history detail');
            }
            (window.UIRenderer || {showNotification:function(){},renderMultiSendHistory:function(){},renderMultiSendHistoryDetail:function(){}}).renderMultiSendHistoryDetail(result.data || null);
        } catch (error) {
            console.warn('[MultiSend] Failed to load history detail:', error);
            (window.UIRenderer || {showNotification:function(){},renderMultiSendHistory:function(){},renderMultiSendHistoryDetail:function(){}}).showNotification(error.message || 'Failed to open history', 'error');
        }
    };

    window.messagesUI.showMultiSendHistoryPanel = function(options) {
        const settings = options || {};
        const listEl = window.UIFailsafe?.safeGetElement('multiSendHistoryList');
        const detailEl = window.UIFailsafe?.safeGetElement('multiSendHistoryDetail');
        if (listEl) window.UIFailsafe?.safeSetStyle(listEl, 'display', 'block');
        if (detailEl && !settings.detailOnly) window.UIFailsafe?.safeSetStyle(detailEl, 'display', 'none');
        if (listEl && typeof listEl.scrollIntoView === 'function') {
            listEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        _uiLog('[MultiSend] History panel opened', settings);
    };

    window.messagesUI.setMultiSendButtonState = function(isLoading) {
        const button = document.getElementById('multiSendBtn');
        if (!button) return;
        button.disabled = !!isLoading;
        button.dataset.loading = isLoading ? 'true' : 'false';
        button.style.opacity = isLoading ? '0.7' : '';
        button.style.pointerEvents = isLoading ? 'none' : '';
        button.innerHTML = isLoading
            ? '<i class="fas fa-spinner fa-spin"></i>'
            : '<i class="fas fa-paper-plane"></i>';
    };

    window.messagesUI.handleSendToMultiple = async function(options) {
        const settings = options || {};
        const input = document.getElementById('multiSendInput');
        const msgContent = (input && input.value && input.value.trim()) || '';
        const core = (window.messagesCore || null);
        const replyVisibility = document.getElementById('multiSendReplyVisibility')?.value || 'public';
        const selectedChats = core && core.multiSendSelectedChats;

        _uiLog('[MultiSend] Send triggered', {
            selectedCount: selectedChats instanceof Set ? selectedChats.size : 0,
            replyVisibility
        });

        if (!msgContent) {
            (window.UIRenderer || {showNotification:function(){}}).showNotification('Please type a message first', 'error');
            return { success: false, error: 'empty_message' };
        }
        if (!(selectedChats instanceof Set) || selectedChats.size === 0) {
            (window.UIRenderer || {showNotification:function(){}}).showNotification('Select at least one chat', 'error');
            return { success: false, error: 'no_selected_chats' };
        }

        const normalizedConversationIds = Array.from(selectedChats)
            .map((chatId) => String(chatId || '').trim())
            .filter(Boolean);

        if (normalizedConversationIds.length === 0) {
            (window.UIRenderer || {showNotification:function(){}}).showNotification('Select at least one valid chat', 'error');
            return { success: false, error: 'invalid_selected_chats' };
        }

        let token = null;
        try {
            const sess = core && core.getSession && core.getSession();
            token = (sess && sess.token) || localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('nexopa_token') || localStorage.getItem('accessToken');
        } catch(_e){}

        window.messagesUI.setMultiSendButtonState(true);

        try {
            const payload = {
                conversationIds: normalizedConversationIds,
                content: msgContent,
                type: 'text',
                replyVisibility
            };
            _uiLog('[MultiSend] API request start', payload);

            const resp = await fetch('/api/messages/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
                body: JSON.stringify(payload)
            });
            const result = await resp.json().catch(function() { return {}; });
            _uiLog('[MultiSend] API response', { ok: resp.ok, result: result });

            if (!resp.ok || result.success === false) {
                throw new Error(result.message || result.error || 'Failed to send');
            }

            const sentCount = result.data?.successCount
                || (Array.isArray(result.data?.results) ? result.data.results.filter((item) => item && item.success).length : normalizedConversationIds.length);

            (window.UIRenderer || {showNotification:function(){}}).showNotification('✓ Sent to ' + sentCount + ' chat' + (sentCount !== 1 ? 's' : ''));
            window.messagesUI?.showMultiSendHistoryPanel?.();
            await window.messagesUI?.loadMultiSendHistory?.();

            if (input) input.value = '';
            if (core?.multiSendSelectedChats) core.multiSendSelectedChats.clear();
            UIRenderer.updateSelectedCount();

            if (settings.closePanelOnSuccess) {
                const panel = document.getElementById('multiSendPanel');
                if (panel) panel.classList.remove('active');
                UIStateManager.setState('multiSendVisible', false);
            }

            return { success: true, result };
        } catch (error) {
            console.warn('[MultiSend] Error sending bulk message:', error);
            (window.UIRenderer || {showNotification:function(){}}).showNotification(error.message || 'Failed to send', 'error');
            return { success: false, error: error.message || 'send_failed' };
        } finally {
            window.messagesUI.setMultiSendButtonState(false);
        }
    };

    const bindMultiSendEnhancements = function() {
        const historyBtn = document.getElementById('multiSendHistoryBtn');
        if (historyBtn && !historyBtn.dataset.boundHistory) {
            historyBtn.dataset.boundHistory = 'true';
            historyBtn.addEventListener('click', function() {
                _uiLog('[MultiSend] History button clicked');
                window.messagesUI?.showMultiSendHistoryPanel?.();
                window.messagesUI?.loadMultiSendHistory?.();
            });
        }

        const toggleBtn = document.getElementById('multiSendToggleBtn');
        if (toggleBtn && !toggleBtn.dataset.boundHistoryLoad) {
            toggleBtn.dataset.boundHistoryLoad = 'true';
            toggleBtn.addEventListener('click', function() {
                _uiLog('[MultiSend] Panel toggle clicked');
                setTimeout(function() {
                    window.messagesUI?.showMultiSendHistoryPanel?.();
                    window.messagesUI?.loadMultiSendHistory?.();
                }, 50);
            }, true);
        }

        const multiSendBtn = document.getElementById('multiSendBtn');
        if (multiSendBtn && !multiSendBtn.dataset.boundBulkOverride) {
            multiSendBtn.dataset.boundBulkOverride = 'true';
            multiSendBtn.addEventListener('click', async function(event) {
                event.preventDefault();
                event.stopImmediatePropagation();

                const input = document.getElementById('multiSendInput');
                const msgContent = (input && input.value && input.value.trim()) || '';
                const core = getMessagesCore();
                const replyVisibility = document.getElementById('multiSendReplyVisibility')?.value || 'public';
                if (!msgContent) {
                    (window.UIRenderer || {showNotification:function(){},renderMultiSendHistory:function(){},renderMultiSendHistoryDetail:function(){}}).showNotification('Please type a message first', 'error');
                    return;
                }
                const selectedChats = core && core.multiSendSelectedChats;
                if (!(selectedChats instanceof Set) || selectedChats.size === 0) {
                    (window.UIRenderer || {showNotification:function(){},renderMultiSendHistory:function(){},renderMultiSendHistoryDetail:function(){}}).showNotification('Select at least one chat', 'error');
                    return;
                }

                let token = null;
                try { const sess = core && core.getSession && core.getSession(); token = (sess && sess.token) || localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('nexopa_token') || localStorage.getItem('accessToken'); } catch(_e){}

                try {
                    const resp = await fetch('/api/messages/bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
                        body: JSON.stringify({
                            conversationIds: Array.from(selectedChats),
                            content: msgContent,
                            type: 'text',
                            replyVisibility
                        })
                    });
                    const result = await resp.json().catch(function() { return {}; });
                    if (!resp.ok || result.success === false) {
                        throw new Error(result.message || result.error || 'Failed to send');
                    }
                    const sentCount = result.data?.successCount || (Array.isArray(result.data?.results) ? result.data.results.filter(r=>r&&r.success).length : selectedChats.size);
                    (window.UIRenderer || {showNotification:function(){},renderMultiSendHistory:function(){},renderMultiSendHistoryDetail:function(){}}).showNotification('✓ Sent to ' + sentCount + ' chat' + (sentCount !== 1 ? 's' : ''));
                    window.messagesUI?.loadMultiSendHistory?.();
                    if (input) input.value = '';
                    if (core?.multiSendSelectedChats) core.multiSendSelectedChats.clear();
                    const panel = document.getElementById('multiSendPanel');
                    if (panel) panel.classList.remove('active');
                    UIStateManager.setState('multiSendVisible', false);
                } catch (error) {
                    console.warn('[MultiSend] Error sending bulk message:', error);
                    (window.UIRenderer || {showNotification:function(){},renderMultiSendHistory:function(){},renderMultiSendHistoryDetail:function(){}}).showNotification(error.message || 'Failed to send', 'error');
                }
            }, true);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindMultiSendEnhancements);
    } else {
        bindMultiSendEnhancements();
    }

    // ============================================================
    // CHAT LONG-PRESS CONTEXT MENU + PIN/HIDE/BLOCK/DELETE SYSTEM
    // ============================================================
    (function installChatContextMenu() {
        const STORAGE_KEY_PINNED   = 'kyn_pinned_chats_v1';
        const STORAGE_KEY_HIDDEN   = 'kyn_hidden_chats_v1';
        const STORAGE_KEY_BLOCKED  = 'kyn_blocked_chats_v1';
        const STORAGE_KEY_ARCHIVED = 'kyn_archived_chats_v1';
        const STORAGE_KEY_HIDDEN_PIN = 'kyn_hidden_pin_v1';

        function _store(key) {
            try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(_) { return []; }
        }
        function _storeSave(key, arr) {
            try { localStorage.setItem(key, JSON.stringify(arr)); } catch(_) {}
        }
        function _setAdd(key, id)    { const a = _store(key); if (!a.includes(String(id))) a.push(String(id)); _storeSave(key, a); }
        function _setRemove(key, id) { _storeSave(key, _store(key).filter(x => x !== String(id))); }
        function _setHas(key, id)    { return _store(key).includes(String(id)); }

        let _lpTimer = null;
        let _lpActive = false;

        window.messagesUI = window.messagesUI || {};

        // Long press helpers
        window.messagesUI._chatLongPressStart = function(e, chatId) {
            _lpActive = false;
            document.body.classList.add('chat-item-pressing');
            _lpTimer = setTimeout(function() {
                _lpActive = true;
                window.messagesUI._showChatContextMenu(chatId, e);
            }, 600);
        };
        window.messagesUI._chatLongPressEnd = function(e, chatId) {
            if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
            document.body.classList.remove('chat-item-pressing');
            // if long press fired, prevent the click
            if (_lpActive) { e.preventDefault(); e.stopPropagation(); _lpActive = false; }
        };
        window.messagesUI._chatLongPressCancel = function() {
            if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
            document.body.classList.remove('chat-item-pressing');
            _lpActive = false;
        };
        // Normal click (fires only when NOT long-press)
        window.messagesUI._chatItemClick = function(e, chatId, chatObj) {
            // BUG FIX (MORE-BTN-CLICK-LEAKS-TO-ROW): touchstart/touchend on
            // .chat-more-btn correctly stopPropagation() so the LONG-PRESS
            // timer never starts on the parent row. But the browser's
            // synthesized 'click' event that follows a tap is resolved
            // separately, from the release coordinates via
            // elementFromPoint() — not from whatever received touchstart.
            // Because the button is small and sits right at the edge of the
            // row, a slight finger-drift on release can make that synthetic
            // click land on the row (chat-item) instead of the button, even
            // though the button visually absorbed the tap. That bypassed
            // the button's own onclick/stopPropagation entirely and fired
            // _chatItemClick directly, opening the chat instead of the
            // context menu — intermittent, exactly as reported. Guard here
            // too: if the click's real target (or anything under the
            // pointer) is the more-button, this is that stray click —
            // ignore it, the button's own handler already opened the menu.
            if (e.target && e.target.closest && e.target.closest('.chat-more-btn')) {
                return;
            }
            if (_lpActive) { e.preventDefault(); e.stopPropagation(); return; }
            // Check blocked — do not open blocked chats
            if (_setHas(STORAGE_KEY_BLOCKED, chatId)) {
                _showToast('This chat is blocked. Long-press to unblock.');
                return;
            }
            window.messagesUI?.openChat(chatObj);
        };

        // Show context menu
        window.messagesUI._showChatContextMenu = function(chatId, e) {
            _removeChatContextMenu();
            const isPinned   = _setHas(STORAGE_KEY_PINNED,   chatId);
            const isHidden   = _setHas(STORAGE_KEY_HIDDEN,   chatId);
            const isBlocked  = _setHas(STORAGE_KEY_BLOCKED,  chatId);
            const isArchived = _setHas(STORAGE_KEY_ARCHIVED, chatId);

            const menu = document.createElement('div');
            menu.id = 'chatContextMenu';
            menu.style.cssText = [
                'position:fixed;z-index:99999;background:#1e293b;border-radius:18px;',
                'padding:8px;box-shadow:0 8px 40px rgba(0,0,0,0.45);',
                'display:flex;flex-direction:column;gap:4px;min-width:200px;',
                'animation:ctxFadeIn .18s ease;'
            ].join('');

            const actions = [
                { icon: '📌', label: isPinned   ? 'Unpin chat'    : 'Pin chat',      action: 'pin'      },
                { icon: '🔒', label: isHidden   ? 'Unlock chat'   : 'Lock chat',     action: 'hide'     },
                { icon: '📥', label: isArchived ? 'Unarchive chat': 'Archive chat',  action: 'archive'  },
                { icon: '🚫', label: isBlocked  ? 'Unblock user'  : 'Block user',    action: 'block'    },
                { icon: '🧹', label: 'Clear chat',                                    action: 'clear'    },
                { icon: '👤', label: 'View contact',                                  action: 'contact'  },
                { icon: '🗑️', label: 'Delete chat',                                   action: 'delete'   },
            ];

            actions.forEach(function(a) {
                const btn = document.createElement('button');
                btn.style.cssText = [
                    'display:flex;align-items:center;gap:10px;padding:11px 16px;',
                    'background:none;border:none;color:#e5e7eb;font-size:14px;',
                    'font-weight:600;cursor:pointer;border-radius:12px;text-align:left;',
                    'transition:background .15s;width:100%;'
                ].join('');
                btn.innerHTML = '<span style="font-size:18px;line-height:1;">' + a.icon + '</span><span>' + a.label + '</span>';
                btn.onmouseenter = function() { this.style.background = 'rgba(255,255,255,0.08)'; };
                btn.onmouseleave = function() { this.style.background = 'none'; };
                btn.onclick = function(ev) {
                    ev.stopPropagation();
                    _removeChatContextMenu();
                    window.messagesUI._handleChatAction(a.action, chatId);
                };
                menu.appendChild(btn);
            });

            // Position near touch/click
            const x = (e.touches ? e.touches[0].clientX : e.clientX) || window.innerWidth/2;
            const y = (e.touches ? e.touches[0].clientY : e.clientY) || window.innerHeight/2;
            menu.style.left = Math.min(x, window.innerWidth  - 220) + 'px';
            menu.style.top  = Math.min(y, window.innerHeight - 240) + 'px';

            document.body.appendChild(menu);
            setTimeout(function() { document.addEventListener('click', _removeChatContextMenu, { once:true }); }, 50);
        };

        function _removeChatContextMenu() {
            const m = document.getElementById('chatContextMenu');
            if (m) m.remove();
        }

        // Handle chosen action
        window.messagesUI._handleChatAction = function(action, chatId) {
            switch(action) {
                case 'pin':
                    if (_setHas(STORAGE_KEY_PINNED, chatId)) {
                        _setRemove(STORAGE_KEY_PINNED, chatId);
                        _showToast('Chat unpinned');
                    } else {
                        _setAdd(STORAGE_KEY_PINNED, chatId);
                        _showToast('Chat pinned — appears at top');
                    }
                    window.messagesUI?.refreshChatsList?.();
                    break;

                case 'hide':
                    if (_setHas(STORAGE_KEY_HIDDEN, chatId)) {
                        // Unhide — ask for PIN
                        window.messagesUI._showHiddenPinPrompt(function(ok) {
                            if (ok) { _setRemove(STORAGE_KEY_HIDDEN, chatId); _showToast('Chat unhidden'); window.messagesUI?.refreshChatsList?.(); }
                            else    { _showToast('Incorrect PIN', true); }
                        });
                    } else {
                        // Set PIN then hide
                        window.messagesUI._showSetHiddenPin(function(pin) {
                            if (pin) {
                                // SECURITY FIX: Store SHA-256 hash of PIN, never plaintext
                                (async function() {
                                    const encoder = new TextEncoder();
                                    const data = encoder.encode(pin + 'kyn_vault_salt_v1');
                                    const hashBuf = await crypto.subtle.digest('SHA-256', data);
                                    const hashHex = Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
                                    localStorage.setItem(STORAGE_KEY_HIDDEN_PIN, hashHex);
                                    _setAdd(STORAGE_KEY_HIDDEN, chatId);
                                    _showToast('Chat hidden — access via 🔒 Hidden Chats');
                                    window.messagesUI?.refreshChatsList?.();
                                })();
                            }
                        });
                    }
                    break;

                case 'block':
                    if (_setHas(STORAGE_KEY_BLOCKED, chatId)) {
                        _setRemove(STORAGE_KEY_BLOCKED, chatId);
                        _showToast('User unblocked');
                        try { window.MessagesCore?.blockUser?.(String(chatId).replace('pending_', ''), false); } catch(_) {}
                    } else {
                        _setAdd(STORAGE_KEY_BLOCKED, chatId);
                        _showToast('User blocked — messages will not be delivered');
                        const friendId = String(chatId).replace('pending_', '');
                        // FIX-BLOCK-NOT-ENFORCED: this used to be a fire-and-forget fetch only,
                        // completely separate from ConversationManager._blockedFriends — the set
                        // actually checked elsewhere to gate incoming messages. If that fetch
                        // failed silently, the toast said "blocked" but nothing was actually
                        // blocked. MessagesCore.blockUser() writes the real key AND sends over
                        // the app's reliable socket path.
                        try { window.MessagesCore?.blockUser?.(friendId, true); } catch(_) {}
                        // Keep as a secondary/legacy notification path — harmless if redundant.
                        try {
                            const tok = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
                            fetch('/api/friends/' + friendId + '/block', {
                                method:'POST',
                                headers:{ Authorization:'Bearer ' + tok, 'Content-Type':'application/json' }
                            }).catch(function(){});
                        } catch(_) {}
                    }
                    window.messagesUI?.refreshChatsList?.();
                    break;

                case 'archive':
                    if (_setHas(STORAGE_KEY_ARCHIVED, chatId)) {
                        _setRemove(STORAGE_KEY_ARCHIVED, chatId);
                        _showToast('Chat unarchived');
                        try { window.MessagesCore?.archiveConversation?.(chatId, false); } catch(_) {}
                    } else {
                        _setAdd(STORAGE_KEY_ARCHIVED, chatId);
                        _showToast('Chat archived');
                        // FIX-ARCHIVE-NOT-SYNCED: this used to only touch a UI-local storage
                        // key, so archiving never reached the server — reopening on another
                        // device, or after clearing local storage, the chat would show as
                        // un-archived again. MessagesCore.archiveConversation() sends it to
                        // the server over the socket and updates the conversation object too.
                        try { window.MessagesCore?.archiveConversation?.(chatId, true); } catch(_) {}
                    }
                    window.messagesUI?.refreshChatsList?.();
                    break;

                case 'clear':
                    _showConfirm('Clear all messages in this chat? This cannot be undone.', function(ok) {
                        if (!ok) return;
                        const _cid = String(chatId);

                        if (window.ChatManager) {
                            if (window.ChatManager._messages) {
                                window.ChatManager._messages = window.ChatManager._messages.filter(
                                    function(m) { return String(m.chatId || m.conversationId || '') !== _cid; }
                                );
                            }
                            if (window.ChatManager._messagesMap) {
                                Array.from(window.ChatManager._messagesMap.keys()).forEach(function(k) {
                                    const v = window.ChatManager._messagesMap.get(k);
                                    if (v && String(v.chatId || v.conversationId || '') === _cid) window.ChatManager._messagesMap.delete(k);
                                });
                            }
                            if (window.ChatManager._saveToCache) window.ChatManager._saveToCache();
                            const _active = window.ChatManager.getActiveChat && window.ChatManager.getActiveChat();
                            if (_active && String(_active.id) === _cid && window.ChatManager._notifySubscribers) {
                                window.ChatManager._notifySubscribers();
                            }
                        }

                        if (window.KynectaLocalStore && window.KynectaLocalStore.deleteMessagesByChat) {
                            window.KynectaLocalStore.deleteMessagesByChat(_cid).catch(function(){});
                        }

                        try {
                            for (let i = 0; i < localStorage.length; i++) {
                                const k = localStorage.key(i);
                                if (k && (k.includes('messages_' + _cid) || k.includes('kynecta_messages_v8_' + _cid))) {
                                    localStorage.removeItem(k);
                                }
                            }
                        } catch(_) {}

                        _showToast('Chat cleared');
                        window.messagesUI?.refreshChatsList?.();
                    });
                    break;

                case 'contact':
                    window.dispatchEvent(new CustomEvent('messages:viewContact', { detail: { chatId: String(chatId) } }));
                    if (window.parent && window.parent !== window) {
                        try {
                            window.parent.postMessage({ type: 'OPEN_FRIEND_PROFILE', friendId: String(chatId).replace('pending_', '') }, '*');
                        } catch(_) {}
                    }
                    break;

                case 'delete':
                    _showConfirm('Delete this chat?', function(ok) {
                        if (!ok) return;
                        const _cid = String(chatId);

                        // 1. Remove from ChatManager in-memory state
                        if (window.ChatManager) {
                            if (window.ChatManager._conversations) {
                                window.ChatManager._conversations = window.ChatManager._conversations.filter(
                                    function(c) { return String(c.id) !== _cid; }
                                );
                            }
                            if (window.ChatManager._conversationsMap) window.ChatManager._conversationsMap.delete(_cid);
                            if (window.ChatManager._messages) {
                                window.ChatManager._messages = window.ChatManager._messages.filter(
                                    function(m) { return String(m.chatId || m.conversationId || '') !== _cid; }
                                );
                            }
                            if (window.ChatManager._saveToCache) window.ChatManager._saveToCache();
                        }

                        // 2. Remove from ALL localStorage/sessionStorage caches
                        try {
                            const keysToDelete = [];
                            for (let i = 0; i < localStorage.length; i++) {
                                const k = localStorage.key(i);
                                if (k && (k.includes(_cid) || k.includes('chat_' + _cid) || k.includes('conv_' + _cid) || k.includes('messages_' + _cid))) {
                                    keysToDelete.push(k);
                                }
                            }
                            keysToDelete.forEach(function(k) { try { localStorage.removeItem(k); } catch(_){} });
                        } catch(_) {}
                        try {
                            const ssKeys = [];
                            for (let i = 0; i < sessionStorage.length; i++) {
                                const k = sessionStorage.key(i);
                                if (k && (k.includes(_cid) || k.includes('chat_' + _cid) || k.includes('conv_' + _cid))) ssKeys.push(k);
                            }
                            ssKeys.forEach(function(k) { try { sessionStorage.removeItem(k); } catch(_){} });
                        } catch(_) {}

                        // 3. Remove from IndexedDB (KynectaLocalStore)
                        try {
                            if (window.KynectaLocalStore) {
                                if (window.KynectaLocalStore.deleteConversation) window.KynectaLocalStore.deleteConversation(_cid).catch(function(){});
                                if (window.KynectaLocalStore.deleteMessagesByChatId) window.KynectaLocalStore.deleteMessagesByChatId(_cid).catch(function(){});
                            }
                            // Also try KynectaSyncEngine
                            if (window.KynectaSyncEngine && window.KynectaSyncEngine.deleteChatFromCache) {
                                window.KynectaSyncEngine.deleteChatFromCache(_cid).catch(function(){});
                            }
                        } catch(_) {}

                        // 4. Add to permanent deleted-chats set so it never restores from cache
                        try {
                            const deleted = (function(){try{return JSON.parse(localStorage.getItem('kynecta_deleted_chats_v8')||'[]');}catch(_){return[];}})();
                            if (!deleted.includes(_cid)) { deleted.push(_cid); localStorage.setItem('kynecta_deleted_chats_v8', JSON.stringify(deleted)); }
                        } catch(_) {}

                        // 5. Backend delete (authoritative)
                        try {
                            const tok = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
                            fetch('/api/chats/' + _cid, {
                                method: 'DELETE',
                                headers: { Authorization: 'Bearer ' + tok }
                            }).catch(function(){});
                        } catch(_) {}

                        _showToast('Chat deleted');
                        // Close panel if this was the open chat
                        if (window.ChatManager && window.ChatManager.getActiveChat && String((window.ChatManager.getActiveChat() || {}).id) === _cid) {
                            const panel = document.getElementById('chatPanel');
                            if (panel) panel.classList.add('hidden');
                        }
                        window.messagesUI?.refreshChatsList?.();
                    });
                    break;
            }
        };

        // ── Pinned / Hidden tabs in sidebar ──────────────────────────────
        window.messagesUI.getPinnedChats = function() {
            const ids = _store(STORAGE_KEY_PINNED);
            if (!window.ChatManager || !window.ChatManager._conversations) return [];
            return window.ChatManager._conversations.filter(c => ids.includes(String(c.id)));
        };
        window.messagesUI.getHiddenChats = function() {
            const ids = _store(STORAGE_KEY_HIDDEN);
            if (!window.ChatManager || !window.ChatManager._conversations) return [];
            return window.ChatManager._conversations.filter(c => ids.includes(String(c.id)));
        };
        window.messagesUI.isBlocked = function(chatId) { return _setHas(STORAGE_KEY_BLOCKED, String(chatId)); };

        // refreshChatsList re-renders with pin/hide/block applied
        window.messagesUI.refreshChatsList = function() {
            if (!window.ChatManager || !window.ChatManager._conversations) return;
            const allConvs = window.ChatManager._conversations || [];
            const hiddenIds  = _store(STORAGE_KEY_HIDDEN);
            const pinnedIds  = _store(STORAGE_KEY_PINNED);
            const blockedIds = _store(STORAGE_KEY_BLOCKED);

            // Filter: hidden chats go to hidden vault; blocked chats appear dimmed
            const visible  = allConvs.filter(c => !hiddenIds.includes(String(c.id)));
            const pinned   = visible.filter(c =>  pinnedIds.includes(String(c.id)));
            const rest     = visible.filter(c => !pinnedIds.includes(String(c.id)));
            const ordered  = pinned.concat(rest);

            window.dispatchEvent(new CustomEvent('renderChatsList', { detail: { conversations: ordered } }));
        };

        // ── Open hidden chats vault ───────────────────────────────────────
        window.messagesUI.openHiddenChats = function() {
            const pin = localStorage.getItem(STORAGE_KEY_HIDDEN_PIN);
            if (!pin) { _showToast('No hidden chats yet', false); return; }
            window.messagesUI._showHiddenPinPrompt(function(ok) {
                if (!ok) { _showToast('Incorrect PIN', true); return; }
                const hiddenConvs = window.messagesUI.getHiddenChats();
                if (hiddenConvs.length === 0) { _showToast('No hidden chats', false); return; }
                // Show a simple modal with the hidden chats
                _showHiddenVault(hiddenConvs);
            });
        };

        function _showHiddenVault(convs) {
            const existing = document.getElementById('hiddenVaultModal');
            if (existing) existing.remove();
            const modal = document.createElement('div');
            modal.id = 'hiddenVaultModal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
            const box = document.createElement('div');
            box.style.cssText = 'background:#0f172a;border-radius:20px;padding:20px;width:90%;max-width:360px;max-height:70vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.6);';
            box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h3 style="color:#e5e7eb;margin:0;font-size:16px;">🔒 Hidden Chats</h3><button id="hvClose" style="background:none;border:none;color:#9ca3af;font-size:20px;cursor:pointer;">✕</button></div>';
            convs.forEach(function(c) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;cursor:pointer;transition:background .15s;';
                row.onmouseenter = function(){ this.style.background='rgba(255,255,255,0.06)'; };
                row.onmouseleave = function(){ this.style.background=''; };
                const _hcLast = (function() {
                    const v = c.lastMessage || '';
                    if (v.charAt(0) === '{' && v.indexOf('"v"') !== -1 && v.indexOf('"ct"') !== -1) return '🔒 Encrypted message';
                    return v || 'No messages';
                })();
                row.innerHTML = '<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#06b6d4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;">' +
                    (c.friendName||'?').charAt(0).toUpperCase() + '</div>' +
                    '<div><div style="color:#e5e7eb;font-weight:600;font-size:14px;">' + (c.friendName||'Unknown') + '</div>' +
                    '<div style="color:#64748b;font-size:12px;">' + _hcLast + '</div></div>';
                row.onclick = function() {
                    modal.remove();
                    window.messagesUI?.openChat(c);
                };
                box.appendChild(row);
            });
            modal.appendChild(box);
            document.body.appendChild(modal);
            document.getElementById('hvClose').onclick = function() { modal.remove(); };
            modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
        }

        // ── PIN prompt helpers ────────────────────────────────────────────
        window.messagesUI._showSetHiddenPin = function(cb) {
            _showPinDialog('Set a 4-digit PIN to lock this chat', function(pin) {
                if (!pin || pin.length < 4) { cb(null); return; }
                cb(pin);
            }, true);
        };
        window.messagesUI._showHiddenPinPrompt = function(cb) {
            const saved = localStorage.getItem(STORAGE_KEY_HIDDEN_PIN);
            _showPinDialog('Enter your PIN to unlock', async function(pin) {
                if (!pin) { cb(false); return; }
                try {
                    // Hash the entered PIN and compare against stored hash
                    const encoder = new TextEncoder();
                    const data = encoder.encode(pin + 'kyn_vault_salt_v1');
                    const hashBuf = await crypto.subtle.digest('SHA-256', data);
                    const hashHex = Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
                    // Support legacy plaintext PINs (migration path)
                    cb(hashHex === saved || pin === saved);
                } catch(e) { cb(pin === saved); }
            }, false);
        };

        function _showPinDialog(title, cb, isSet) {
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;';
            modal.innerHTML = '<div style="background:#1e293b;border-radius:20px;padding:24px 20px;width:280px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
                '<div style="font-size:32px;margin-bottom:8px;">🔒</div>' +
                '<div style="color:#e5e7eb;font-size:15px;font-weight:600;margin-bottom:16px;">' + title + '</div>' +
                '<input id="pinInput" type="password" maxlength="4" inputmode="numeric" pattern="[0-9]*" style="width:100%;padding:12px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#fff;font-size:22px;letter-spacing:8px;text-align:center;outline:none;box-sizing:border-box;" placeholder="••••">' +
                (isSet ? '<input id="pinConfirm" type="password" maxlength="4" inputmode="numeric" style="width:100%;padding:12px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#fff;font-size:22px;letter-spacing:8px;text-align:center;outline:none;box-sizing:border-box;margin-top:8px;" placeholder="Confirm">' : '') +
                '<div style="display:flex;gap:8px;margin-top:16px;">' +
                '<button id="pinCancel" style="flex:1;padding:11px;border-radius:12px;border:none;background:rgba(255,255,255,0.08);color:#9ca3af;font-weight:600;cursor:pointer;">Cancel</button>' +
                '<button id="pinOk" style="flex:1;padding:11px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563eb,#06b6d4);color:#fff;font-weight:700;cursor:pointer;">OK</button>' +
                '</div></div>';
            document.body.appendChild(modal);
            const pinInput = modal.querySelector('#pinInput');
            const pinConfirm = modal.querySelector('#pinConfirm');
            setTimeout(function(){ pinInput && pinInput.focus(); }, 50);
            modal.querySelector('#pinCancel').onclick = function() { modal.remove(); cb(null); };
            modal.querySelector('#pinOk').onclick = function() {
                const pin = pinInput ? pinInput.value : '';
                if (isSet) {
                    const conf = pinConfirm ? pinConfirm.value : '';
                    if (pin.length < 4) { _showToast('PIN must be 4 digits', true); return; }
                    if (pin !== conf) { _showToast('PINs do not match', true); return; }
                }
                modal.remove();
                cb(pin);
            };
        }

        // ── Simple toast & confirm helpers ───────────────────────────────
        function _showToast(msg, isErr) {
            const t = document.createElement('div');
            t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99999;' +
                'background:' + (isErr ? '#ef4444' : '#1e293b') + ';color:#fff;padding:10px 20px;border-radius:30px;' +
                'font-size:13px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.35);pointer-events:none;' +
                'animation:ctxFadeIn .2s ease;max-width:280px;text-align:center;';
            t.textContent = msg;
            document.body.appendChild(t);
            setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(function(){ t.remove(); },300); }, 2500);
        }
        function _showConfirm(msg, cb) {
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';
            modal.innerHTML = '<div style="background:#1e293b;border-radius:20px;padding:24px;width:280px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
                '<div style="color:#e5e7eb;font-size:15px;font-weight:600;margin-bottom:20px;">' + msg + '</div>' +
                '<div style="display:flex;gap:8px;">' +
                '<button id="cfNo"  style="flex:1;padding:11px;border-radius:12px;border:none;background:rgba(255,255,255,0.08);color:#9ca3af;font-weight:600;cursor:pointer;">Cancel</button>' +
                '<button id="cfYes" style="flex:1;padding:11px;border-radius:12px;border:none;background:#ef4444;color:#fff;font-weight:700;cursor:pointer;">Delete</button>' +
                '</div></div>';
            document.body.appendChild(modal);
            modal.querySelector('#cfNo').onclick  = function(){ modal.remove(); cb(false); };
            modal.querySelector('#cfYes').onclick = function(){ modal.remove(); cb(true);  };
        }

        // ── Inject CSS keyframe ───────────────────────────────────────────
        if (!document.getElementById('ctxMenuStyle')) {
            const s = document.createElement('style');
            s.id = 'ctxMenuStyle';
            s.textContent = '@keyframes ctxFadeIn { from{opacity:0;transform:scale(.92)} to{opacity:1;transform:scale(1)} }';
            document.head.appendChild(s);
        }

        // ── Inject "Hidden Chats" button into sidebar header if present ───
        function _injectHiddenChatsBtn() {
            const header = document.querySelector('.sidebar-header, .chats-header, [class*="chat-header"]');
            if (!header || document.getElementById('hiddenChatsBtn')) return;
            const btn = document.createElement('button');
            btn.id = 'hiddenChatsBtn';
            btn.title = 'Hidden Chats';
            btn.style.cssText = 'background:none;border:none;color:#9ca3af;font-size:20px;cursor:pointer;padding:4px 6px;border-radius:8px;transition:color .15s;';
            btn.innerHTML = '🔒';
            btn.onmouseenter = function(){ this.style.color='#e5e7eb'; };
            btn.onmouseleave = function(){ this.style.color='#9ca3af'; };
            btn.onclick = function() { window.messagesUI.openHiddenChats(); };
            header.appendChild(btn);
        }
        setTimeout(_injectHiddenChatsBtn, 2000);
        document.addEventListener('kyn:activeChanged', _injectHiddenChatsBtn, { once: true });

    })(); // end installChatContextMenu

})(); // end main IIFE

// ============================================================
// KYNECTA COMPREHENSIVE RUNTIME PATCH v3.0
// Fixes: message:deleted DOM removal, multi-send recipient UI,
//        call history delete persistence, friend deletion tracking,
//        status expiry scheduler, group message delete DOM,
//        presence ghost cleanup, reconnect socket re-bind
// ============================================================
(function _kynComprehensivePatch() {
    'use strict';

    // ── 1. message:deleted → instantly remove from DOM ──────────────────
    // messages-core fires EventBus.emit('message:deleted') but messages-ui.js
    // never listened for it — deleted messages stayed visible until refresh.
    function _handleMessageDeletedDOM(e) {
        const detail = e.detail || e;
        const ids = (Array.isArray(detail.messageIds) ? detail.messageIds : [detail.messageId || detail.id])
            .filter(Boolean).map(String);
        ids.forEach(function(mid) {
            // Remove by data-message-id attribute
            document.querySelectorAll('[data-message-id="' + mid + '"]').forEach(function(el) {
                el.style.transition = 'opacity 0.2s';
                el.style.opacity = '0';
                setTimeout(function() { try { el.remove(); } catch(_){} }, 200);
            });
            // Also mark as deleted if element has data-id
            document.querySelectorAll('[data-id="' + mid + '"]').forEach(function(el) {
                el.style.transition = 'opacity 0.2s';
                el.style.opacity = '0';
                setTimeout(function() { try { el.remove(); } catch(_){} }, 200);
            });
        });
        // Also update unread badge
        try {
            const core = window.messagesCore || window.getMessagesCore?.();
            if (core && typeof core.refreshUnreadCounts === 'function') core.refreshUnreadCounts();
        } catch(_) {}
    }
    document.addEventListener('message:deleted', _handleMessageDeletedDOM);
    window.addEventListener('message:deleted', function(e) { _handleMessageDeletedDOM(e); });
    // Also catch postMessage from parent bridge
    window.addEventListener('message', function(evt) {
        if (!evt.data || typeof evt.data !== 'object') return;
        if (evt.data.type === 'message:deleted' || evt.data.type === 'MESSAGE_DELETED') {
            _handleMessageDeletedDOM(evt.data.payload || evt.data);
        }
    });

    // ── 2. Multi-send: normalise conversation display names ──────────────
    // getConversations() may return chat objects where `name` is a last-message
    // preview. We normalise so the selector shows the friend's real name.
    const _origRenderMultiSendChats = window.messagesUI && window.messagesUI.renderMultiSendChats;
    function _normaliseChatsForMultiSend(rawChats) {
        if (!Array.isArray(rawChats)) return [];
        return rawChats.map(function(chat) {
            const name = chat.friendName || chat.displayName || chat.participantName
                || chat.otherUser?.username || chat.otherUser?.displayName
                || (chat.participants && chat.participants[0] && (chat.participants[0].displayName || chat.participants[0].username))
                || chat.name || 'Chat';
            return Object.assign({}, chat, { friendName: name, name: name });
        }).filter(function(c) { return c && c.id; });
    }
    // Hook into the multi-send open button to normalise chats
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('#multiSendBtn, [data-action="multi-send"], .multi-send-btn');
        if (!btn) return;
        setTimeout(function() {
            try {
                const core = window.messagesCore || (window.getMessagesCore && window.getMessagesCore());
                if (!core) return;
                const raw = core.getConversations ? core.getConversations() : [];
                const normalised = _normaliseChatsForMultiSend(raw);
                if (window.messagesUI && typeof window.messagesUI.renderMultiSendChats === 'function') {
                    window.messagesUI.renderMultiSendChats(normalised);
                } else if (window.UIRenderer && typeof window.UIRenderer.renderMultiSendChats === 'function') {
                    window.UIRenderer.renderMultiSendChats(normalised);
                }
            } catch(_) {}
        }, 50);
    }, true);

    // ── 3. Call history delete — track deleted IDs permanently ──────────
    // When user deletes a call history item, track it so cached_call_history
    // never restores it. Also call the backend DELETE endpoint.
    function _deleteCallHistoryItem(callId) {
        if (!callId) return;
        const cid = String(callId);
        // Track permanently
        try {
            const DKEY = 'kyn_deleted_calls_v1';
            const existing = JSON.parse(localStorage.getItem(DKEY) || '[]');
            if (!existing.includes(cid)) {
                existing.push(cid);
                if (existing.length > 500) existing.splice(0, existing.length - 500);
                localStorage.setItem(DKEY, JSON.stringify(existing));
            }
        } catch(_) {}
        // Remove from cached_call_history
        try {
            const cached = JSON.parse(localStorage.getItem('cached_call_history') || 'null');
            if (cached && Array.isArray(cached.calls)) {
                cached.calls = cached.calls.filter(function(c) { return c && String(c.id) !== cid; });
                localStorage.setItem('cached_call_history', JSON.stringify(cached));
            }
        } catch(_) {}
        // Backend delete
        try {
            const tok = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
            fetch('/api/calls/history', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
                body: JSON.stringify({ callIds: [cid] })
            }).catch(function(){});
        } catch(_) {}
    }
    window._deleteCallHistoryItem = _deleteCallHistoryItem;
    // Hook delete button clicks on call history items
    document.addEventListener('click', function(e) {
        const delBtn = e.target.closest('[data-action="delete-call"], .call-delete-btn, .delete-call-btn, [data-call-delete]');
        if (!delBtn) return;
        e.stopPropagation();
        const callId = delBtn.dataset.callId || delBtn.dataset.id || delBtn.closest('[data-call-id]')?.dataset.callId;
        if (callId) {
            _deleteCallHistoryItem(callId);
            const item = delBtn.closest('.call-history-item, [data-call-id]');
            if (item) { item.style.opacity = '0'; item.style.transition = 'opacity .2s'; setTimeout(function(){ try{item.remove();}catch(_){} }, 200); }
        }
    }, true);

    // ── 4. Friend deletion — track permanently so removed friends don't restore ─
    function _trackFriendDeleted(userId) {
        if (!userId) return;
        try {
            const DKEY = 'kyn_deleted_friends_v1';
            const existing = JSON.parse(localStorage.getItem(DKEY) || '[]');
            const uid = String(userId);
            if (!existing.includes(uid)) {
                existing.push(uid);
                if (existing.length > 1000) existing.splice(0, existing.length - 1000);
                localStorage.setItem(DKEY, JSON.stringify(existing));
            }
        } catch(_) {}
    }
    window._trackFriendDeleted = _trackFriendDeleted;
    // Listen for friend:removed events
    window.addEventListener('message', function(evt) {
        if (!evt.data || typeof evt.data !== 'object') return;
        const t = evt.data.type;
        if (t === 'friend:removed' || t === 'FRIEND_REMOVED' || t === 'friend_removed') {
            const uid = (evt.data.payload || {}).userId || (evt.data.payload || {}).friendId || (evt.data.payload || {}).id;
            if (uid) _trackFriendDeleted(uid);
        }
    });
    document.addEventListener('friend:removed', function(e) {
        const uid = (e.detail || {}).userId || (e.detail || {}).friendId;
        if (uid) _trackFriendDeleted(uid);
    });

    // ── 5. Status expiry scheduler ────────────────────────────────────────
    // Checks every 60s for statuses that have passed 24h and removes them from DOM
    (function _installStatusExpiryScheduler() {
        function _pruneExpiredStatuses() {
            const now = Date.now();
            const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
            // Remove expired status rings from DOM
            document.querySelectorAll('[data-status-created-at]').forEach(function(el) {
                try {
                    const createdAt = new Date(el.dataset.statusCreatedAt).getTime();
                    if (!isNaN(createdAt) && (now - createdAt) >= EXPIRY_MS) {
                        el.style.opacity = '0';
                        el.style.transition = 'opacity .3s';
                        setTimeout(function() { try { el.remove(); } catch(_){} }, 300);
                    }
                } catch(_) {}
            });
            // Also prune from localStorage
            try {
                const SKEY = 'kyn_status_cache_v1';
                const cached = JSON.parse(localStorage.getItem(SKEY) || 'null');
                if (cached && Array.isArray(cached.statuses)) {
                    const filtered = cached.statuses.filter(function(s) {
                        try {
                            const t = new Date(s.createdAt || s.created_at || 0).getTime();
                            return (now - t) < EXPIRY_MS;
                        } catch(_) { return true; }
                    });
                    if (filtered.length !== cached.statuses.length) {
                        cached.statuses = filtered;
                        localStorage.setItem(SKEY, JSON.stringify(cached));
                    }
                }
            } catch(_) {}
        }
        // Run once on load, then every 60s
        setTimeout(_pruneExpiredStatuses, 3000);
        setInterval(_pruneExpiredStatuses, 60000);
        window._pruneExpiredStatuses = _pruneExpiredStatuses;
    })();

    // ── 6. Group message delete → remove from DOM instantly ─────────────
    function _handleGroupMessageDeletedDOM(detail) {
        const d = detail || {};
        const mid = String(d.messageId || d.id || '');
        if (!mid) return;
        document.querySelectorAll('[data-message-id="' + mid + '"], [data-id="' + mid + '"]').forEach(function(el) {
            el.style.transition = 'opacity 0.2s';
            el.style.opacity = '0';
            setTimeout(function() { try { el.remove(); } catch(_){} }, 200);
        });
    }
    window.addEventListener('message', function(evt) {
        if (!evt.data || typeof evt.data !== 'object') return;
        if (evt.data.type === 'group:message:deleted' || evt.data.type === 'GROUP_MESSAGE_DELETED') {
            _handleGroupMessageDeletedDOM(evt.data.payload || evt.data);
        }
    });
    document.addEventListener('group:message:deleted', function(e) { _handleGroupMessageDeletedDOM(e.detail || {}); });

    // ── 7. Presence ghost cleanup ────────────────────────────────────────
    // After socket reconnect, stale "online" indicators for users who went
    // offline during disconnection are cleaned up by forcing a presence refresh.
    window.addEventListener('kyn:realtimeReady', function() {
        setTimeout(function() {
            // Dispatch presence-refresh so friend/messages modules re-query
            try { window.dispatchEvent(new CustomEvent('kyn:presenceRefresh', { detail: { reason: 'reconnect' } })); } catch(_) {}
            // Clear all "online" indicators and let the server re-populate
            document.querySelectorAll('.presence-dot.online, .status-dot.online, [data-online="true"]').forEach(function(el) {
                // Don't remove — just mark as uncertain until confirmed
                el.classList.add('presence-uncertain');
                el.style.opacity = '0.4';
            });
        }, 1500);
    });

    // ── 8. Socket re-bind on reconnect for messages module ───────────────
    // Ensure the messages iframe re-registers its socket listeners after reconnect
    window.addEventListener('kyn:realtimeReady', function() {
        try {
            const core = window.messagesCore || (window.getMessagesCore && window.getMessagesCore());
            if (core && typeof core._setupSocketListeners === 'function') {
                core._setupSocketListeners();
            }
        } catch(_) {}
        // Re-request conversations after reconnect to fill any missed events
        setTimeout(function() {
            try {
                const core2 = window.messagesCore || (window.getMessagesCore && window.getMessagesCore());
                if (core2 && typeof core2.loadConversations === 'function') core2.loadConversations();
                else if (core2 && typeof core2.requestConversations === 'function') core2.requestConversations();
            } catch(_) {}
        }, 2000);
    });

    if (window.__MESSAGES_DEBUG__) console.log('[KynPatch v3.0] ✅ All runtime patches installed');
})();


// ============================================================
// KYNECTA MESSAGE VISIBILITY PATCH v4.0
// Fixes: receiver not seeing messages in chat panel
// Root cause: renderRealtimeUpdate's isThisChat check fails when
//   _activeConversation is cleared or chatId doesn't match exactly.
// Fix: intercept renderMessages event and also directly append new
//   message bubbles to the DOM when the chat panel is open.
// ============================================================
(function _kynMessageVisibilityPatch() {
    'use strict';

    // FIX: _uiLog was referenced here but only ever declared inside the separate
    // top-level IIFE starting at the top of this file — out of scope here, which
    // threw "Uncaught ReferenceError: _uiLog is not defined" at the end of this
    // function on every page load. Local copy of the same debug-gated logger.
    const _uiLog = (...a) => { if (window.__MESSAGES_DEBUG__) console.log(...a); };

    // Track rendered message IDs to prevent duplicates
    const _renderedMsgIds = new Set();

    // Direct DOM append — bypasses all ChatManager state issues
    function _appendMessageBubbleDirect(msg) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        // Don't append if panel is hidden
        const panel = document.getElementById('chatPanel');
        if (panel && (panel.classList.contains('hidden') || panel.style.display === 'none')) return;

        const msgId = String(msg.id || msg.localId || msg.serverId || '');
        if (msgId && _renderedMsgIds.has(msgId)) return;
        if (msgId) _renderedMsgIds.add(msgId);
        // Clean up after 30s
        if (msgId) setTimeout(function() { _renderedMsgIds.delete(msgId); }, 30000);

        // Get current user
        const myId = String(
            window.__PARENT_SESSION__?.userId ||
            window.__kynCurrentUserId ||
            (function(){ try { return JSON.parse(localStorage.getItem('kynecta_user_cache_v8')||'{}').id; } catch(_){ return null; } })() ||
            ''
        );

        const senderId    = String(msg.senderId || msg.sender?.id || '');
        const isOwn       = myId && senderId && senderId === myId;
        const content     = msg.content || msg.text || '';
        const timestamp   = msg.createdAt || msg.timestamp || Date.now();
        const timeStr     = new Date(typeof timestamp === 'string' ? timestamp : Number(timestamp)).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
        const senderName  = msg.sender?.displayName || msg.sender?.username || msg.senderName || '';

        // Check if this message is already in DOM
        if (msgId && document.querySelector('[data-message-id="' + msgId + '"],[data-id="' + msgId + '"]')) return;

        // FIX-E2E-DIRECT-APPEND-DECRYPT (ciphertext must never render, and
        // never behind a visible "Decrypting…" state either — decrypt fully
        // in the background, only the finished bubble ever touches the DOM):
        // this whole function is a bypass path, wired up separately from the
        // normal renderMessages()/_decryptRenderedMessages() pipeline. It
        // used to build the bubble with the raw content immediately and only
        // patch in the decrypted text afterward — ciphertext was genuinely
        // on screen for that interval. Now, anything that looks encrypted is
        // decrypted first; the bubble isn't created or appended until the
        // real content (or, on failure, a neutral fallback — never the raw
        // envelope) is ready.
        const looksEncrypted = typeof content === 'string' && content.charAt(0) === '{' && content.indexOf('"v"') !== -1 && !msg._decrypted;
        if (looksEncrypted && window.KynectaE2E) {
            // FIX-DOUBLE-DECRYPT-RACE-2: claim this message id before decrypting.
            // If the normal render pipeline already claimed it (racing on the same
            // incoming message), don't decrypt it again here — that would corrupt
            // the ratchet for every message after it. Just skip; the pipeline's
            // own render is the one that will actually show this message.
            const claimKey = msgId || (payload && (payload.id || payload.localId));
            if (window.__kynClaimDecrypt && !window.__kynClaimDecrypt(claimKey)) {
                return;
            }
            const chatId = String(
                msg.chatId || msg.conversationId ||
                window.ChatManager?._activeConversation?.id ||
                window.__activeChatId || ''
            );
            const otherPartyId =
                window.ChatManager?._activeConversation?.friendId ||
                window.ChatManager?._activeConversation?.otherUserId ||
                null;
            const senderForDecrypt = isOwn ? otherPartyId : senderId;
            if (chatId && senderForDecrypt) {
                window.KynectaE2E.decryptFromChat(content, chatId, senderForDecrypt).then(function (plaintext) {
                    const finalText = (plaintext && plaintext !== content) ? plaintext : '[Unable to decrypt message]';
                    const finalMsg = Object.assign({}, msg, {
                        content: finalText,
                        _decrypted: true
                    });
                    if (plaintext && plaintext !== content && window.__kynCommitDecrypt) {
                        window.__kynCommitDecrypt(msg.id, msg.localId, finalText);
                    }
                    _buildAndAppendBubble(finalMsg, msgId, isOwn, timeStr, senderName);
                }).catch(function () {
                    const finalMsg = Object.assign({}, msg, { content: '[Unable to decrypt message]', _decrypted: true });
                    _buildAndAppendBubble(finalMsg, msgId, isOwn, timeStr, senderName);
                });
                return;
            }
        }
        _buildAndAppendBubble(msg, msgId, isOwn, timeStr, senderName);
    }

    function _buildAndAppendBubble(msg, msgId, isOwn, timeStr, senderName) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        if (msgId && document.querySelector('[data-message-id="' + msgId + '"],[data-id="' + msgId + '"]')) return;
        const content = msg.content || msg.text || '';

        const bubble = document.createElement('div');
        bubble.className = 'message-wrapper ' + (isOwn ? 'own' : 'other');
        bubble.dataset.messageId = msgId || 'tmp_' + Date.now();
        bubble.style.cssText = 'display:flex;flex-direction:column;align-items:' + (isOwn ? 'flex-end' : 'flex-start') + ';padding:2px 12px;animation:fadeIn .15s ease;';

        // FIX-BUBBLE-STRUCTURE-MISMATCH: this fast path previously put both
        // 'message-bubble' and 'message-content' on the SAME element instead
        // of nesting them (outer bubble, inner content) like every other
        // render path (and like group's bubbles) does. Two different DOM
        // shapes for the same message type is a real architecture mismatch —
        // matching the nested structure here so there's exactly one shape.
        const bubbleOuter = document.createElement('div');
        bubbleOuter.className = 'message-bubble';
        bubbleOuter.style.cssText = [
            'max-width:72%',
            'padding:9px 13px',
            'border-radius:' + (isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px'),
            'background:' + (isOwn ? 'linear-gradient(135deg,#667eea,#764ba2)' : '#fff'),
            'color:' + (isOwn ? '#fff' : '#111827'),
            'font-size:14px',
            'line-height:1.5',
            'box-shadow:0 1px 4px rgba(0,0,0,0.1)',
            'width:fit-content',
            'position:relative',
        ].join(';');

        const bubbleInner = document.createElement('div');
        bubbleInner.className = 'message-content';
        bubbleInner.style.cssText = 'overflow-wrap:break-word;word-break:normal;';
        bubbleInner.textContent = content;
        bubbleOuter.appendChild(bubbleInner);

        const meta = document.createElement('div');
        meta.style.cssText = 'font-size:11px;color:#9ca3af;margin-top:2px;padding:0 2px;display:flex;align-items:center;gap:4px;';
        meta.innerHTML = (!isOwn && senderName ? '<span style="font-weight:600;color:#667eea">' + _esc(senderName) + '</span>' : '') +
                         '<span>' + timeStr + '</span>' +
                         (isOwn ? '<span class="delivery-indicator" style="color:#a78bfa" data-message-id="' + msgId + '">✓✓</span>' : '');

        bubble.appendChild(bubbleOuter);
        bubble.appendChild(meta);
        container.appendChild(bubble);

        // Scroll to bottom
        requestAnimationFrame(function() {
            container.scrollTop = container.scrollHeight;
        });
    }

    function _esc(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // Intercept the renderMessages CustomEvent for direct message append
    window.addEventListener('message', function(evt) {
        if (!evt.data || typeof evt.data !== 'object') return;
        const type = evt.data.type;
        if (type !== 'message:new' && type !== 'new_message' && type !== 'MESSAGE_RECEIVED') return;

        const payload = evt.data.payload || evt.data;
        // FIX (matches MSG-NOT-DISPLAYED-CONTENT-FIELD-MISMATCH elsewhere in
        // this codebase): this required payload.content specifically, but
        // some payload shapes carry the text under .text or .body instead —
        // silently dropping this fallback's only chance to append the
        // message if the primary render pipeline also missed it.
        if (!payload || !(payload.content || payload.text || payload.body)) return;

        // Check if a chat panel is open
        const panel = document.getElementById('chatPanel');
        if (!panel || panel.classList.contains('hidden')) return;

        // Get active chat ID from various sources
        const activeChatId = String(
            window.ChatManager?._activeConversation?.id ||
            window.__activeChatId ||
            panel.dataset.chatId ||
            ''
        );
        const msgChatId = String(payload.chatId || payload.conversationId || '');

        // Only append if this message belongs to the open chat (FIX-MSG-VANISH-B:
        // tolerate a 'pending_' prefix on either side, same as the primary
        // render pipeline, so this fallback doesn't reject a message the
        // primary pipeline would have accepted).
        const _stripPend3 = function(s) { return s.startsWith('pending_') ? s.slice(8) : s; };
        const _fallbackMatches = !(activeChatId && msgChatId && activeChatId !== msgChatId &&
            _stripPend3(activeChatId) !== _stripPend3(msgChatId));
        // FORENSIC: same visibility gap as the primary pipeline — this fallback
        // silently returns here when it's a "no match", giving zero trace that
        // it was even considered. Log unconditionally so a live test shows
        // whether the primary AND fallback both missed for the same reason.
        console.log(`[FORENSIC] UI_RENDER_CHECK_FALLBACK | incomingChatId=${msgChatId} | activeChatId=${activeChatId} | matches=${_fallbackMatches} | ts=${Date.now()}`);
        if (!_fallbackMatches) return;

        // Use a small delay to let the normal render pipeline try first
        setTimeout(function() {
            const msgId = String(payload.id || payload.localId || '');
            // If already rendered by normal pipeline, skip
            if (msgId && document.querySelector('[data-message-id="' + msgId + '"]')) return;
            // If the container has content from normal render, skip
            const container = document.getElementById('messagesContainer');
            if (!container) return;
            _appendMessageBubbleDirect(payload);
        }, 120);
    });

    // Also hook into the renderMessages CustomEvent to track rendered IDs
    window.addEventListener('renderMessages', function(evt) {
        const msgs = evt.detail?.messages || [];
        msgs.forEach(function(m) {
            const id = String(m.id || m.localId || '');
            if (id) _renderedMsgIds.add(id);
        });
    });

    // Expose for external use
    window._kynAppendMessage = _appendMessageBubbleDirect;

    _uiLog('[KynPatch v4.0] ✅ Message visibility patch installed');
})();

// =============================================================================
// FIX-AUDIT (MSG-UI-007): DOM windowing for large chats
// =============================================================================
// Problem: renderMessages()/_renderMessageBatches() above keep every rendered
// message bubble permanently attached to the DOM. In a chat with 1,000+
// messages this means 1,000+ live DOM nodes with images/avatars/event
// listeners, causing visible jank (forced reflow, slow paint) every time a
// new message is appended, plus unbounded memory growth over a long session.
//
// Fix approach: rather than rewriting renderMessages (which has carefully
// tuned smart-append, DOM-recovery-merge, and signature-caching logic that
// works correctly today), this module runs alongside it as a passive
// MutationObserver. Once the number of attached message bubbles exceeds
// MAX_RENDERED, it detaches the oldest (topmost, scrolled-away) bubbles and
// replaces them with a single fixed-height spacer div that preserves total
// scroll height — so the scrollbar size and the user's visual scroll
// position do not jump. If the user scrolls back up near the top of the
// spacer, the trimmed bubbles are restored from an in-memory cache before
// the spacer comes into view, so scrolling up to read history is seamless.
//
// This module never deletes message data — only DOM nodes. The underlying
// message store (ChatManager._messagesMap, IndexedDB, etc.) is untouched,
// so re-rendering, search, and dedup logic continue to work exactly as
// before.
(function() {
    'use strict';

    // FIX: this IIFE (DOM windowing patch) called _uiLog(...) at its end but
    // never declared it — _uiLog from the earlier IIFEs is out of scope here,
    // which threw "Uncaught ReferenceError: _uiLog is not defined" on every
    // page load right after the windowing patch installed. Local copy of the
    // same debug-gated logger used elsewhere in this file.
    const _uiLog = (...a) => { if (window.__MESSAGES_DEBUG__) console.log(...a); };

    const MAX_RENDERED   = 150;  // keep at most this many bubbles attached at once
    const TRIM_BATCH      = 50;   // how many oldest bubbles to detach per trim pass
    const RESTORE_MARGIN  = 600;  // px from top of spacer before triggering restore

    let _windowing = {
        container: null,
        spacer: null,
        trimmedCache: [], // { id, html, height } in chronological order (oldest first)
        observing: false,
    };

    function _getContainer() {
        return document.getElementById('messagesContainer');
    }

    function _ensureSpacer(container) {
        let spacer = container.querySelector('.kyn-dom-window-spacer');
        if (!spacer) {
            spacer = document.createElement('div');
            spacer.className = 'kyn-dom-window-spacer';
            spacer.style.cssText = 'width:100%;flex-shrink:0;';
            spacer.setAttribute('aria-hidden', 'true');
        }
        return spacer;
    }

    function _trimIfNeeded() {
        const container = _getContainer();
        if (!container) return;

        // Don't interfere with passive/loading/empty states or while a full
        // re-render is in flight (those clear innerHTML themselves anyway).
        const bubbles = container.querySelectorAll(':scope > [data-message-id]');
        if (bubbles.length <= MAX_RENDERED) return;

        const toTrim = Math.min(TRIM_BATCH, bubbles.length - MAX_RENDERED);
        if (toTrim <= 0) return;

        // Don't trim if user is currently scrolled near the top — they're
        // actively reading old messages, trimming under them would be jarring.
        if (container.scrollTop < RESTORE_MARGIN) return;

        let spacer = container.querySelector('.kyn-dom-window-spacer');
        let removedHeight = spacer ? (parseFloat(spacer.style.height) || 0) : 0;
        const newlyTrimmed = [];

        for (let i = 0; i < toTrim; i++) {
            const el = bubbles[i];
            if (!el || !el.isConnected) continue;
            // Skip date separators directly preceding — keep them attached to
            // avoid orphaning a separator with no messages under it; simplest
            // safe rule is to only trim actual message bubbles, separators
            // collapse naturally since they have no data-message-id and are
            // left in place (negligible DOM cost, ~1 node per day).
            const rect = el.getBoundingClientRect();
            removedHeight += rect.height;
            newlyTrimmed.push({
                id: el.dataset.messageId,
                html: el.outerHTML,
                height: rect.height,
            });
            el.remove();
        }

        if (newlyTrimmed.length === 0) return;

        _windowing.trimmedCache = _windowing.trimmedCache.concat(newlyTrimmed);

        spacer = _ensureSpacer(container);
        spacer.style.height = `${removedHeight}px`;
        if (!spacer.isConnected) {
            container.insertBefore(spacer, container.firstChild);
        }
        _windowing.spacer = spacer;
        _windowing.container = container;
    }

    function _restoreIfNearTop() {
        const container = _windowing.container || _getContainer();
        const spacer = _windowing.spacer;
        if (!container || !spacer || !spacer.isConnected) return;
        if (_windowing.trimmedCache.length === 0) return;

        if (container.scrollTop > RESTORE_MARGIN) return;

        // Restore everything in the cache at once — simplest correct behavior.
        // For extremely large histories this could be chunked, but a single
        // restore pass is still far cheaper than never trimming at all.
        const prevScrollHeight = container.scrollHeight;
        const frag = document.createDocumentFragment();
        _windowing.trimmedCache.forEach(item => {
            const tmp = document.createElement('div');
            tmp.innerHTML = item.html;
            const restored = tmp.firstElementChild;
            if (restored) frag.appendChild(restored);
        });

        container.insertBefore(frag, spacer);
        spacer.remove();
        _windowing.spacer = null;
        _windowing.trimmedCache = [];

        // Preserve scroll position relative to content that was just inserted above
        const heightDelta = container.scrollHeight - prevScrollHeight;
        container.scrollTop += heightDelta;
    }

    function _installScrollWatcher(container) {
        if (container._kynWindowScrollBound) return;
        container._kynWindowScrollBound = true;
        let debounce = null;
        container.addEventListener('scroll', () => {
            clearTimeout(debounce);
            debounce = setTimeout(_restoreIfNearTop, 80);
        }, { passive: true });
    }

    function _installObserver() {
        const container = _getContainer();
        if (!container || _windowing.observing) return;

        _installScrollWatcher(container);

        const mo = new MutationObserver((mutations) => {
            // FIX-AUDIT: if the container was fully cleared (chat switch / full
            // re-render via container.innerHTML = ''), our cached spacer/trimmed
            // IDs are now stale and refer to a different chat's messages — wipe
            // them so the next render's dedup check doesn't see phantom IDs.
            const wasCleared = mutations.some(m =>
                m.removedNodes && m.removedNodes.length > 0 &&
                !container.contains(_windowing.spacer)
            );
            if (wasCleared && _windowing.trimmedCache.length > 0) {
                _windowing.trimmedCache = [];
                _windowing.spacer = null;
            }

            // Debounce trim checks so we don't run on every single node add
            // during a batch render (_renderMessageBatches appends in chunks).
            clearTimeout(_windowing._trimDebounce);
            _windowing._trimDebounce = setTimeout(_trimIfNeeded, 250);
        });
        mo.observe(container, { childList: true });
        _windowing.observing = true;
        _windowing.container = container;
    }

    // FIX-AUDIT: expose trimmed IDs so renderMessages' smart-append dedup check
    // (see FIX-029 above in this file) can treat trimmed-but-known messages as
    // already rendered rather than re-appending them as duplicates.
    window._kynGetTrimmedIds = function() {
        return new Set(_windowing.trimmedCache.map(item => String(item.id)));
    };

    // The messagesContainer element can be recreated when chats are switched
    // (some code paths do container.innerHTML = '' then rebuild children, but
    // others may replace the element itself), so periodically confirm we're
    // still observing the live container and reset cached state on chat switch.
    let _lastContainerRef = null;
    setInterval(() => {
        const container = _getContainer();
        if (!container) return;
        if (container !== _lastContainerRef) {
            _lastContainerRef = container;
            _windowing = { container: null, spacer: null, trimmedCache: [], observing: false };
            _installObserver();
        }
    }, 2000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _installObserver);
    } else {
        _installObserver();
    }

    _uiLog('[KynPatch] ✅ DOM windowing installed for large-chat performance');
})();