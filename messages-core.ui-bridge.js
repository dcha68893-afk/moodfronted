// =============================================
// MESSAGES CORE :: UI BRIDGE & PUBLIC API
// One of 3 companion files (messages-core.bootstrap.js,
// messages-core.operations.js, messages-core.ui-bridge.js) that
// together replace the old single messages-core.js module.
// Loaded as plain classic scripts (defer, no type=module) IN ORDER
// so they share one global lexical scope, exactly like the original
// single IIFE did internally. Do not load out of order, and do not
// load this file without the other two.
// =============================================
'use strict';

const UIStateManager = {
        _drafts: {},
        _chatThemes: {},
        _starredMessages: {},
        _uiSettings: {},
        _initialized: false,
        
        init: function() {
            if (this._initialized) return this;
            
            this._loadFromStorage();
            this._initialized = true;
            
            return this;
        },
        
        _loadFromStorage: function() {
            try {
                this._drafts = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.DRAFTS, {});
                this._chatThemes = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHAT_THEMES, {});
                this._starredMessages = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.STARRED_MESSAGES, {});
                
                const uiState = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.UI_STATE, {});
                this._uiSettings = uiState.settings || {};
            } catch (e) {}
        },
        
        _saveToStorage: function() {
            try {
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.DRAFTS, this._drafts);
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHAT_THEMES, this._chatThemes);
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STARRED_MESSAGES, this._starredMessages);
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.UI_STATE, {
                    settings: this._uiSettings,
                    timestamp: Date.now()
                });
            } catch (e) {}
        },
        
        saveDraft: function(conversationId, text, attachment = null) {
            if (!conversationId) return;
            
            if (text || attachment) {
                this._drafts[conversationId] = {
                    text: text || '',
                    attachment: attachment ? { ...attachment } : null,
                    timestamp: Date.now()
                };
            } else if (this._drafts[conversationId]) {
                delete this._drafts[conversationId];
            }
            
            this._saveToStorage();
            EventBus.emit('draft:saved', { conversationId, hasDraft: !!(text || attachment) });
        },
        
        getDraft: function(conversationId) {
            if (!conversationId) return null;
            
            const draft = this._drafts[conversationId];
            if (draft && Date.now() - draft.timestamp < 86400000) {
                return draft;
            }
            
            if (draft) delete this._drafts[conversationId];
            return null;
        },
        
        clearDraft: function(conversationId) {
            if (conversationId && this._drafts[conversationId]) {
                delete this._drafts[conversationId];
                this._saveToStorage();
                EventBus.emit('draft:saved', { conversationId, hasDraft: false });
            }
        },
        
        setChatTheme: function(conversationId, theme) {
            if (!conversationId) return;
            
            if (theme) {
                this._chatThemes[conversationId] = theme;
            } else {
                delete this._chatThemes[conversationId];
            }
            
            this._saveToStorage();
            EventBus.emit('theme:updated', { conversationId, theme });
        },
        
        getChatTheme: function(conversationId) {
            return conversationId ? this._chatThemes[conversationId] : null;
        },
        
        toggleStarred: function(messageId) {
            if (!messageId) return false;
            
            const isStarred = !!this._starredMessages[messageId];
            
            if (isStarred) {
                delete this._starredMessages[messageId];
            } else {
                this._starredMessages[messageId] = true;
            }
            
            this._saveToStorage();
            EventBus.emit('message:starred', { messageId, starred: !isStarred });
            return !isStarred;
        },
        
        isStarred: function(messageId) {
            return !!this._starredMessages[messageId];
        },
        
        getStarredMessages: function() {
            return Object.keys(this._starredMessages);
        },
        
        updateSettings: function(settings) {
            this._uiSettings = { ...this._uiSettings, ...settings };
            this._saveToStorage();
            EventBus.emit('settings:updated', this._uiSettings);
        },
        
        getSettings: function() {
            return { ...this._uiSettings };
        }
    }.init();

    // =============================================
    // UI FEATURES
    // =============================================
    const UIFeatures = {
        playNotificationSound: function() {
            // FIX (Notifications audit): this always played audio regardless of
            // the "Notification Sound" toggle — the setting saved fine but had
            // no effect. This function is now only called when
            // messageNotifications/enableNotifications are on (see call sites);
            // notificationSound specifically controls the audible beep here.
            const soundOn = window.__notificationSoundEnabled !== false;
            
            // FIX: Old code used truncated base64 WAV ('UklGR...') that never played.
            // Use Web Audio API to synthesize a short notification beep instead —
            // works in all browsers without any asset dependency.
            if (soundOn) {
                try {
                    const AudioCtx = window.AudioContext || window.webkitAudioContext;
                    if (AudioCtx) {
                        const ctx = new AudioCtx();
                        const oscillator = ctx.createOscillator();
                        const gainNode   = ctx.createGain();
                        oscillator.connect(gainNode);
                        gainNode.connect(ctx.destination);
                        oscillator.type = 'sine';
                        oscillator.frequency.setValueAtTime(880, ctx.currentTime);       // A5
                        oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); // ~C#6
                        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
                        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                        oscillator.start(ctx.currentTime);
                        oscillator.stop(ctx.currentTime + 0.3);
                        // Auto-close AudioContext after sound plays to free resources
                        oscillator.onended = () => { try { ctx.close(); } catch(_) {} };
                        return;
                    }
                } catch (_audioErr) { /* fall through to Notification */ }
            }
            // Fallback: browser notification if audio fails or sound is off
            // (still shows the OS popup — notificationSound only controls audio)
            try {
                if (Notification.permission === 'granted') {
                    new Notification('New message', { body: 'You have a new message', silent: !soundOn });
                }
            } catch (_) {}
        },

        formatMessageText: function(text) {
            if (!text) return '';
            return SecurityUtils.sanitizeString(text);
        },

        formatTime: function(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '';
            const now = new Date();
            // Same calendar day → real 12-hour clock time e.g. "1:30 PM"
            if (date.toDateString() === now.toDateString()) {
                return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
            }
            // Any older date → DD/MM/YYYY e.g. "09/04/2026"
            const dd   = String(date.getDate()).padStart(2, '0');
            const mm   = String(date.getMonth() + 1).padStart(2, '0');
            const yyyy = date.getFullYear();
            return `${dd}/${mm}/${yyyy}`;
        },

        // FIX: smart last-seen label for chat header status
        formatLastSeen: function(timestamp, isOnline) {
            if (isOnline) return 'Active now';
            if (!timestamp) return 'Offline';
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return 'Offline';
            const now = Date.now();
            const diffMs = now - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            if (diffMins < 2) return 'Active just now';
            if (diffMins < 60) return `Active ${diffMins}m ago`;
            if (diffHours < 24) return `Active ${diffHours}h ago`;
            if (diffDays === 1) return 'Active yesterday';
            if (diffDays < 7) return `Active ${diffDays}d ago`;
            return 'Offline';
        },

        formatDate: function(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            if (date.toDateString() === today.toDateString()) {
                return 'Today';
            } else if (date.toDateString() === yesterday.toDateString()) {
                return 'Yesterday';
            } else {
                return date.toLocaleDateString();
            }
        },

        formatDateTime: function(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            return `${this.formatDate(timestamp)} ${this.formatTime(timestamp)}`;
        },

        formatFileSize: function(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
    };

    // =============================================
    // EVENT BUS
    // =============================================
    const EventBus = {
        _events: new Map(),
        
        on: function(event, callback) {
            if (!this._events.has(event)) {
                this._events.set(event, new Set());
            }
            this._events.get(event).add(callback);
            return () => this.off(event, callback);
        },
        
        off: function(event, callback) {
            if (this._events.has(event)) {
                this._events.get(event).delete(callback);
            }
        },
        
        emit: function(event, data) {
            if (this._events.has(event)) {
                this._events.get(event).forEach(callback => {
                    try {
                        callback(data);
                    } catch (e) {}
                });
            }
            // BRIDGE FIX: EventBus was purely an in-module pub/sub (a Map of
            // callbacks registered via EventBus.on), so any emit() call here
            // only reached listeners that happened to call EventBus.on in this
            // same script. messages-ui.js listens for these same event names
            // (e.g. 'message:deleted') via document/window.addEventListener,
            // expecting a real DOM CustomEvent -- which was never dispatched.
            // That gap is why deletes/updates applied correctly in the data
            // layer but the chat panel UI didn't reflect them until a full
            // refresh reloaded state from storage. Dispatching a real
            // CustomEvent here lets any listener, in any script, react.
            try {
                document.dispatchEvent(new CustomEvent(event, { detail: data }));
            } catch (_) {}
        },
        
        once: function(event, callback) {
            const wrapper = (data) => {
                this.off(event, wrapper);
                callback(data);
            };
            this.on(event, wrapper);
        }
    };

    // =============================================
    // UI BRIDGE (ACTIVATES ONLY IN ACTIVE STATE)
    // =============================================
    const UIBridge = {
        _listeners: new Map(),
        _initialized: false,
        _uiAttached: false,
        
        init: function() {
            if (this._initialized) return this;
            
            this._initialized = true;
            Logger.info('UIBridge', 'Initialized');
            return this;
        },
        
        _attachListeners: function() {
            if (this._uiAttached) {
                Logger.info('UIBridge', 'UI listeners already attached');
                return;
            }
            
            if (currentState !== LIFECYCLE_STATES.ACTIVE && currentState !== LIFECYCLE_STATES.WAITING_AUTH) {
                Logger.info('UIBridge', 'Delaying UI attachment until ACTIVE');
                return;
            }
            
            this._attachSendMessageListener();
            this._attachTypingListener();
            this._attachMarkReadListener();
            this._attachConversationListeners();
            this._attachFriendListeners();
            this._attachStartChatListeners();
            
            this._uiAttached = true;
            Logger.info('UIBridge', 'UI listeners attached');
            _uiInitialized = true;
        },
        
        _attachStartChatListeners: function() {
            const startChatButton = document.getElementById('startChatBtn') || document.querySelector('.start-chat-btn');
            if (startChatButton) {
                startChatButton.addEventListener('click', () => {
                    if (!canSendUserMessages() || !SessionManager.isAuthenticated()) {
                        debugLog('[UI] Cannot start chat - not ready or not authenticated');
                        return;
                    }
                    
                    const friendListPanel = document.getElementById('friendListPanel');
                    const startChatPanel = document.getElementById('startChatPanel');
                    
                    if (friendListPanel) friendListPanel.style.display = 'block';
                    if (startChatPanel) startChatPanel.style.display = 'block';
                    
                    EventBus.emit('ui:showFriends', { timestamp: Date.now() });
                    
                    Logger.info('UIBridge', 'Start chat panel activated');
                });
            }
        },
        
        _attachSendMessageListener: function() {
            // FIX: Removed all send button and keypress listeners from messages-core.js.
            // messages-ui.js already attaches its own click handler to #sendButton (line ~7159)
            // and its own keydown Enter handler to #messageInput (line ~8493).
            // Having both attach simultaneously caused every send action to fire TWO
            // calls to sendMessage() → two HTTP POST /messages requests → two messages
            // stored on the server with different IDs → sender sees duplicates,
            // receiver sees the message arrive twice via WebSocket, second one deduped
            // and dropped → looks like delivery failed.
            // messages-ui.js is the authoritative UI layer. messages-core.js only exposes
            // the sendMessage() API that messages-ui.js calls.
        },
        
        _attachTypingListener: function() {
            EventBus.on('typing:user', (data) => {
                const typingIndicator = document.getElementById('typingIndicator');
                if (!typingIndicator) return;
                
                const activeChat = ChatManager.getActiveChat();
                if (!activeChat || data.conversationId !== activeChat.id) return;
                
                const typingUsers = TypingManager.getTypingUsersForConversation(data.conversationId);
                if (typingUsers.length > 0) {
                    const names = typingUsers.map(u => u.userInfo?.displayName || 'Someone');
                    const text = names.length === 1 ? 
                        `${names[0]} is typing...` : 
                        `${names.length} people are typing...`;
                    typingIndicator.textContent = text;
                    typingIndicator.style.display = 'block';
                } else {
                    typingIndicator.style.display = 'none';
                }
            });
        },
        
        _attachMarkReadListener: function() {
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting && canSendUserMessages() && SessionManager.isAuthenticated()) {
                            const messageId = entry.target.dataset.messageId;
                            const conversationId = ChatManager.getActiveChat()?.id;
                            if (messageId && conversationId) {
                                ConversationManager.markAsRead(conversationId);
                            }
                        }
                    });
                }, { threshold: 0.5 });
                
                document.querySelectorAll('.message-item').forEach(msg => observer.observe(msg));
            }
        },
        
        _attachConversationListeners: function() {
            document.addEventListener('click', async (e) => {
                // FIX (chat-more-btn-tap-swallowed): messages-ui.js's sanitizeHTML()
                // strips the three-dot button's inline onclick/stopPropagation, so
                // without this guard a tap on the three dots falls through to this
                // delegated listener and opens the chat instead of the menu.
                // messages-ui.js now installs a capture-phase listener that calls
                // stopPropagation() for this case, but that listener must be loaded
                // for it to work — this guard is a backup so a click on (or inside)
                // .chat-more-btn is never treated as "open this chat" here either way.
                if (e.target && e.target.closest && e.target.closest('.chat-more-btn')) return;
                const conversationItem = e.target.closest('.chat-item');
                if (conversationItem) {
                    const conversationId = conversationItem.dataset.chatId;
                    if (conversationId) {
                        const startChatPanel = document.getElementById('startChatPanel');
                        if (startChatPanel) startChatPanel.style.display = 'none';
                        
                        const chatPanel = document.getElementById('chatPanel');
                        if (chatPanel) chatPanel.classList.remove('hidden');
                        
                        // FIXED: Always open conversation — from cache when offline, live when online
                        await ConversationManager.openConversation(conversationId);
                    }
                }
            });
        },
        
        _attachFriendListeners: function() {
            document.addEventListener('click', (e) => {
                const friendItem = e.target.closest('.contact-item');
                if (friendItem && canSendUserMessages() && SessionManager.isAuthenticated()) {
                    const friendId = friendItem.dataset.contactId;
                    const friendName = friendItem.querySelector('.contact-name')?.textContent || 'Friend';
                    if (friendId) {
                        const contactsSidebar = document.getElementById('contactsSidebar');
                        if (contactsSidebar) contactsSidebar.classList.add('hidden');
                        
                        const sidebar = document.getElementById('sidebar');
                        if (sidebar) sidebar.classList.add('active');
                        
                        // FIX: parseInt() breaks UUID-based friend IDs (returns NaN or a
                        // truncated garbage number), sending the conversation-create
                        // request to a nonexistent participant. Coerce to a number only
                        // when the ID is purely numeric; otherwise keep the UUID string.
                        const _rawFriendId = String(friendId).trim();
                        const _parsedFriendId = parseInt(_rawFriendId, 10);
                        const _safeFriendId = (!isNaN(_parsedFriendId) && String(_parsedFriendId) === _rawFriendId) ? _parsedFriendId : _rawFriendId;
                        ConversationManager.createConversation([_safeFriendId], { name: friendName });
                    }
                }
            });
        },
        
        dispatch: function(action, payload) {
            const guardResult = window.__guardAction(`UI:${action}`, MODULE_NAME, currentState);
            if (guardResult !== null) {
                Logger.info('UIBridge', `⏳ Waiting for activation - cannot dispatch ${action}`);
                return;
            }
            
            if (!canSendUserMessages()) {
                Logger.info('UIBridge', `⏳ Waiting for activation - cannot dispatch ${action}`);
                return;
            }
            
            const needsSession = ['sendMessage', 'startTyping', 'stopTyping', 'openChat', 'markAsRead', 'createChat'];
            if (needsSession.includes(action) && !SessionManager.isAuthenticated()) {
                Logger.info('UIBridge', `⏳ Session not ready - cannot dispatch ${action}`);
                return;
            }
            
            switch (action) {
                case 'sendMessage':
                    MessageHandler.sendMessage(payload.text, payload.options);
                    break;
                case 'startTyping':
                    TypingManager.sendTyping(payload.conversationId, true);
                    break;
                case 'stopTyping':
                    TypingManager.sendTyping(payload.conversationId, false);
                    break;
                case 'openChat':
                    ConversationManager.openConversation(payload.conversationId, payload.options);
                    break;
                case 'markAsRead':
                    ConversationManager.markAsRead(payload.conversationId);
                    break;
                case 'createChat':
                    ConversationManager.createConversation(payload.participants, payload.options);
                    break;
                default:
                    Logger.warn('UIBridge', `Unknown action: ${action}`);
            }
        },
        
        getStats: function() {
            return {
                listeners: this._listeners.size,
                initialized: this._initialized,
                uiAttached: this._uiAttached
            };
        }
    }.init();

    // =============================================
    // MESSAGE DISPATCHER
    // =============================================
    const MessageDispatcher = {
        _handlers: new Map(),
        _messageQueue: [],
        _processing: false,
        _initialized: false,
        
        init: function() {
            if (this._initialized) return this;
            
            ParentConnectionManager.on('*', (payload, raw) => {
                this.dispatch(raw.type, payload, raw);
            });
            
            this._initialized = true;
            Logger.info('MessageDispatcher', 'Initialized');
            return this;
        },
        
        registerHandler: function(type, handler) {
            if (!this._handlers.has(type)) {
                this._handlers.set(type, new Set());
            }
            this._handlers.get(type).add(handler);
            return () => this.unregisterHandler(type, handler);
        },
        
        unregisterHandler: function(type, handler) {
            if (this._handlers.has(type)) {
                this._handlers.get(type).delete(handler);
            }
        },
        
        dispatch: function(type, payload, raw) {
            if (!type) return;
            
            if (this._handlers.has(type)) {
                const handlers = this._handlers.get(type);
                handlers.forEach(handler => {
                    try {
                        handler(payload, raw);
                    } catch (error) {
                        Logger.error('MessageDispatcher', `Handler error for ${type}`, error);
                    }
                });
            }
            
            if (this._handlers.has('*')) {
                const handlers = this._handlers.get('*');
                handlers.forEach(handler => {
                    try {
                        handler(payload, raw);
                    } catch (error) {
                        Logger.error('MessageDispatcher', `Wildcard handler error for ${type}`, error);
                    }
                });
            }
        },
        
        dispatchToParent: function(type, payload = {}, options = {}) {
            return safeSend(type, payload, options);
        },
        
        getStats: function() {
            return {
                registeredHandlers: this._handlers.size,
                queuedMessages: this._messageQueue.length
            };
        }
    }.init();

    // =============================================
    // MODULE LIFECYCLE CONTROLLER
    // =============================================
    const ModuleLifecycleController = {
        _startTime: null,
        _state: 'stopped',
        _initialized: false,
        _listeners: new Set(),
        
        init: function() {
            if (this._initialized) return this;
            this._initialized = true;
            Logger.info('ModuleLifecycleController', 'Initialized');
            return this;
        },
        
        start: async function() {
            if (this._state === 'running') {
                Logger.info('ModuleLifecycleController', 'Already running');
                return;
            }
            
            this._state = 'starting';
            this._startTime = Date.now();
            this._notifyListeners('starting');
            
            Logger.info('ModuleLifecycleController', 'Starting module');
            
            await this._executeStartSequence();
        },
        
        _executeStartSequence: async function() {
            setState(LIFECYCLE_STATES.INITIALIZING, 'start_sequence');
            
            SecurityValidator.init();
            ParentConnectionManager.init();
            MessageDispatcher.init();
            SessionManager.init();
            HeartbeatClient.init();
            
            await loadCachedData().catch(e => Logger.warn('ModuleLifecycleController', 'Cache load error', e));
            
            setState(LIFECYCLE_STATES.READY, 'initialization_complete');
            
            this._state = 'running';
            this._notifyListeners('running');
            
            Logger.success('ModuleLifecycleController', `Module ready in ${Date.now() - this._startTime}ms`);
            
            if (typeof window.__safeSendChildReady === 'function') {
                window.__safeSendChildReady(() => ParentConnectionManager.notifyChildReady(), MODULE_NAME)();
            } else {
                ParentConnectionManager.notifyChildReady();
            }

            // FIX: Proactively request session immediately after CHILD_READY.
            // If the parent sends SESSION_DATA before PARENT_READY, our handler
            // (_handleSessionData) will now promote directly to ACTIVE. This prevents
            // the "stuck in INITIALIZING" bug on first load.
            setTimeout(() => {
                if (currentState !== LIFECYCLE_STATES.ACTIVE && !SessionManager.isAuthenticated()) {
                    debugLog(`[${MODULE_NAME}] Proactive REQUEST_SESSION after CHILD_READY`);
                    try {
                        window.parent && window.parent !== window && window.parent.postMessage({
                            id: generateMessageId(),
                            type: OUTGOING_ACTIONS.REQUEST_SESSION,
                            source: MODULE_NAME,
                            target: 'parent',
                            requestId: generateRequestId(),
                            payload: { module: MODULE_NAME, timestamp: Date.now() },
                            timestamp: Date.now()
                        }, '*');
                    } catch (_e) {}
                }
            }, 50);
            
            const parentReadyTimeout = setTimeout(() => {
                if (currentState === LIFECYCLE_STATES.WAIT_PARENT && !parentReadyReceived) {
                    debugLog(`[${MODULE_NAME}] Parent ready timeout, requesting session...`);
                    safeSend(OUTGOING_ACTIONS.REQUEST_SESSION, {
                        module: MODULE_NAME,
                        timestamp: Date.now()
                    }, { requireAck: false });
                }
            }, 5000);
            
            await parentReadyPromise.catch(() => {});
            clearTimeout(parentReadyTimeout);
        },
        
        stop: function() {
            if (this._state === 'stopped') return;
            
            this._state = 'stopping';
            this._notifyListeners('stopping');
            
            HeartbeatClient.reset();
            ParentConnectionManager.destroy();
            
            resetLifecycle();
            
            this._state = 'stopped';
            this._notifyListeners('stopped');
            
            Logger.info('ModuleLifecycleController', 'Module stopped');
        },
        
        onStateChange: function(listener) {
            this._listeners.add(listener);
            return () => this._listeners.delete(listener);
        },
        
        _notifyListeners: function(state) {
            this._listeners.forEach(listener => {
                try {
                    listener(state, this.getStats());
                } catch (e) {}
            });
        },
        
        getStats: function() {
            return {
                state: this._state,
                uptime: this._startTime ? Date.now() - this._startTime : 0,
                startTime: this._startTime
            };
        }
    }.init();

    // =============================================
    // MODULE CORE CONTROLLER
    // =============================================
    const ModuleCoreController = {
        _version: MODULE_VERSION,
        _startTime: null,
        _modules: new Map(),
        _initialized: false,
        
        init: function() {
            if (this._initialized) return this;
            
            this._startTime = Date.now();
            this._registerModules();
            this._initialized = true;
            
            Logger.info('ModuleCoreController', `v${this._version} initialized`);
            return this;
        },
        
        _registerModules: function() {
            this._modules.set('lifecycle', { getState: getLifecycleState });
            this._modules.set('security', SecurityValidator);
            this._modules.set('parentConnection', ParentConnectionManager);
            this._modules.set('messageDispatcher', MessageDispatcher);
            this._modules.set('session', SessionManager);
            this._modules.set('heartbeat', HeartbeatClient);
            this._modules.set('moduleLifecycle', ModuleLifecycleController);
            
            this._modules.set('sessionStore', SessionStore);
            this._modules.set('chat', ChatManager);
            this._modules.set('friends', FriendManager);
            this._modules.set('groups', GroupManager);
            this._modules.set('typing', TypingManager);
            this._modules.set('messageHandler', MessageHandler);
            this._modules.set('conversation', ConversationManager);
            
            this._modules.set('uiState', UIStateManager);
            this._modules.set('uiBridge', UIBridge);
            this._modules.set('eventBus', EventBus);
            this._modules.set('uiFeatures', UIFeatures);
            
            this._modules.set('safeStorage', SafeStorage);
            this._modules.set('securityUtils', SecurityUtils);
        },
        
        start: function() {
            Logger.info('ModuleCoreController', 'Starting module');
            ModuleLifecycleController.start();
        },
        
        stop: function() {
            Logger.info('ModuleCoreController', 'Stopping module');
            ModuleLifecycleController.stop();
        },
        
        getModule: function(name) {
            return this._modules.get(name);
        },
        
        getStats: function() {
            const stats = {
                version: this._version,
                uptime: this._startTime ? Date.now() - this._startTime : 0,
                modules: Array.from(this._modules.keys()),
                lifecycle: getLifecycleState(),
                heartbeat: HeartbeatClient.getStats(),
                parentConnection: ParentConnectionManager.getStats(),
                messageDispatcher: MessageDispatcher.getStats(),
                session: SessionManager.getState(),
                uiBridge: UIBridge.getStats(),
                security: SECURITY.getSecurityReport()
            };
            
            return stats;
        },
        
        reset: function() {
            Logger.info('ModuleCoreController', 'Resetting module');
            ModuleLifecycleController.stop();
            
            resetLifecycle();
            ParentConnectionManager.reset();
            SessionManager.clear();
            HeartbeatClient.reset();
            
            setTimeout(() => {
                ModuleLifecycleController.start();
            }, 100);
        }
    }.init();

    // =============================================
    // BOOT CONTROLLER
    // =============================================
    const BootController = {
        _bootStartTime: null,
        _bootPromise: null,
        _bootResolve: null,
        
        init: function() {
            this._bootStartTime = Date.now();
            this._bootPromise = new Promise((resolve) => {
                this._bootResolve = resolve;
            });
            
            return this;
        },
        
        waitForBoot: function() {
            return this._bootPromise;
        },
        
        completeBoot: function() {
            if (this._bootResolve) {
                this._bootResolve({
                    success: true,
                    time: Date.now() - this._bootStartTime
                });
                this._bootResolve = null;
            }
        },
        
        isReady: function() {
            return currentState === LIFECYCLE_STATES.ACTIVE;
        },
        
        getState: function() {
            return getLifecycleState();
        }
    }.init();

    // =============================================
    // SAFE UI INITIALIZATION
    // =============================================
    function initializeUISafe() {
        if (currentState !== LIFECYCLE_STATES.ACTIVE && currentState !== LIFECYCLE_STATES.WAITING_AUTH) {
            Logger.info('UI', 'Delaying UI init until ACTIVE');
            return;
        }
        
        UIBridge._attachListeners();
        
        EventBus.emit('ui:ready', { timestamp: Date.now() });
        
        Logger.success('UI', 'UI initialized');
        _uiInitialized = true;
    }
    
    // ONE-TIME: Clear ONLY the stale chats list-cache (localStorage) on new devices.
    // NOTE: We intentionally do NOT call KynectaLocalStore.clearAll() here —
    // doing so would wipe ALL offline message history before the server repopulates,
    // causing messages to disappear after reopen on a new device (Bug #2).
    // The IDB message store is the offline cache: clearing it on first load of a new
    // device destroys data the user cannot recover until every chat is reopened.
    // Instead, server-sync (startDataFlow → fetchConversations) handles merging fresh
    // server data with any locally-cached messages — no nuclear clear needed.
    (function _runOnceConversationCleanup() {
        const CLEANUP_VERSION = 'kynecta_conv_cleanup_v3'; // bumped from v2 — v2 called clearAll()
        try {
            if (localStorage.getItem(CLEANUP_VERSION)) return; // already ran on this device
            localStorage.setItem(CLEANUP_VERSION, '1');
        } catch (_) { return; }

        debugLog('[CLEANUP] Running one-time stale-cache purge (IDB preserved)…');

        // 1. DO NOT clear the deleted-chats blocklist — preserve user deletions across refresh.

        // 2. Clear only the stale chats LIST cache so the sidebar re-fetches from server.
        //    This is safe: it's just the sidebar cache key, not the message store.
        try {
            localStorage.removeItem('kynecta_chats_cache_v8');
        } catch (_) {}

        // 3. DO NOT call KynectaLocalStore.clearAll() — that nukes ALL IDB message history.
        //    Server data will repopulate naturally via the normal fetchConversations() call
        //    that runs as part of startDataFlow() immediately after this IIFE.
        debugLog('[CLEANUP] Stale sidebar cache cleared — IDB message history preserved.');
    })();

    function startDataFlow() {
        if (currentState !== LIFECYCLE_STATES.ACTIVE) {
            Logger.info('DataFlow', 'Delaying data flow until ACTIVE');
            return;
        }
        
        if (!SessionManager.isAuthenticated()) {
            Logger.info('DataFlow', 'Delaying data flow until session ready');
            return;
        }
        
        if (_demoModeEnabled) {
            debugLog('[DataFlow] Real session active - disabling demo mode');
            // demo mode removed
        }
        
        Logger.info('DataFlow', 'Starting data flow');
        
        if (ChatManager._conversations && ChatManager._conversations.length > 0) {
            // FIX: No longer need to check for fake demo IDs — cache data is always real
            debugLog('[DataFlow] Conversations already loaded from cache — syncing with server');
        }
        if (FriendManager._friends && FriendManager._friends.length > 0) {
            const hasOnlyDemo = false; // Demo data fully removed
            if (hasOnlyDemo) {
                debugLog('[DataFlow] Clearing demo friends to load real data');
                FriendManager._friends = [];
                FriendManager._friendsMap.clear();
            }
        }
        
        ConversationManager.fetchConversations()
            .then(() => {
                // Restore last open chat AFTER conversations are loaded so the
                // conversation object exists in ChatManager when we look it up.
                restoreLastChat();
            })
            .catch(e => {
                Logger.error('DataFlow', 'Failed to fetch conversations', e);
                // Still attempt restore in case cache has data
                restoreLastChat();
            });
        
        FriendManager.fetchFriends().catch(e => {
            Logger.error('DataFlow', 'Failed to fetch friends', e);
        });
        
        Logger.success('DataFlow', 'Data flow started');

        // ── Wire RealtimeSyncEngine delta sync on reconnect ─────────────────
        // When socket reconnects, do a delta sync instead of full reload
        const _bus = window.KynectaEventBus;
        if (_bus && typeof _bus.on === 'function') {
            _bus.on('SYNC_STARTED', async ({ reason } = {}) => {
                debugLog('[DataFlow] Delta sync triggered, reason:', reason);
                try {
                    // 1. Re-fetch conversations (soft merge, tombstones prevent resurrection)
                    await ChatManager.fetchConversations();

                    // 2. Re-fetch messages for active conversation (delta since last sync)
                    const active = ChatManager._activeConversation;
                    // FIX-STALE-ACTIVE-CONVERSATION (defense in depth alongside the
                    // fix in ChatManager.setConversations()): fetchConversations()
                    // just above is what actually rebuilds _conversationsMap from the
                    // server; only trust `active` for a delta-sync request if it's
                    // still present in that just-refreshed, server-confirmed map (or
                    // is a local-only pending_ chat, which never has server messages
                    // to sync anyway). Without this, a stale/invalid active id could
                    // still get one more 403'd request in the same reconnect cycle
                    // between fetchConversations() resolving and this check running.
                    const _activeStillValid = active?.id && (
                        (typeof active.id === 'string' && active.id.startsWith('pending_')) ||
                        ChatManager._conversationsMap?.has(active.id)
                    );
                    if (_activeStillValid) {
                        const syncEngine = window.__RealtimeSyncEngine;
                        if (syncEngine?.requestDeltaSync) {
                            await syncEngine.requestDeltaSync(active.id, async (chatId, since) => {
                                const result = await makeApiRequest(
                                    `/messages?chatId=${chatId}&since=${since}&limit=50`, 'GET'
                                );
                                return result?.messages || result?.data?.messages || [];
                            });
                        } else {
                            // Fallback: just re-fetch last 50 messages
                            await ChatManager.fetchMessages(active.id, { limit: 50, merge: true });
                        }
                    }

                    // 3. Flush any queued offline messages now that we're connected
                    if (window.__OfflineMessageQueue?.size?.() > 0) {
                        setTimeout(() => window.__OfflineMessageQueue.flushAll(), 1500);
                    }
                } catch(e) {
                    console.warn('[DataFlow] Delta sync error:', e.message);
                }
            });

            // Also listen for BroadcastChannel tombstone sync from other tabs
            try {
                const _syncBc = new BroadcastChannel('kynecta_sync');
                _syncBc.addEventListener('message', (e) => {
                    if (e.data?.type === 'tombstone' && e.data?.entity === 'conversation') {
                        const sid = String(e.data.id);
                        ChatManager._conversations = (ChatManager._conversations || [])
                            .filter(c => String(c.id) !== sid);
                        ChatManager._notifySubscribers();
                    }
                });
            } catch(_) {}
        }
    }

    // =============================================
    // OPEN CHAT BY USER ID - Core function
    // =============================================

    async function openChatWithUser(userId, userName, userAvatar) {
        debugLog('[MessageCore] openChatWithUser called:', { userId, userName, userAvatar });
        
        if (!userId) {
            console.error('[MessageCore] Cannot open chat: No userId provided');
            return { success: false, error: 'No userId provided' };
        }
        
        // FIX: parseInt() breaks UUID-based user IDs (NaN or truncated garbage
        // number). Coerce to a number only when the ID is purely numeric;
        // otherwise keep the original UUID string.
        const _rawOpenUserId = String(userId).trim();
        const _parsedOpenUserId = parseInt(_rawOpenUserId, 10);
        const numericUserId = (!isNaN(_parsedOpenUserId) && String(_parsedOpenUserId) === _rawOpenUserId) ? _parsedOpenUserId : _rawOpenUserId;
        
        let realUserName = userName;
        let realAvatar = userAvatar;
        if (window.MessagesCore && window.MessagesCore.FriendManager) {
            const friend = window.MessagesCore.FriendManager.getFriend(numericUserId);
            if (friend) {
                realUserName = friend.displayName || friend.username || friend.name || userName;
                realAvatar = realAvatar || friend.avatar || friend.photoURL || friend.avatarUrl;
            }
        }
        
        const displayName = realUserName || userName || `User_${numericUserId}`;
        
        if (!MessagesCore.isReady()) {
            debugLog('[MessageCore] Module not ready, waiting for boot...');
            await MessagesCore.waitForBoot();
        }
        
        try {
            if (MessagesCore.ConversationManager && typeof MessagesCore.ConversationManager.createConversation === 'function') {
                debugLog('[MessageCore] Using ConversationManager.createConversation');
                const result = await MessagesCore.ConversationManager.createConversation(
                    [numericUserId], 
                    { name: displayName, type: 'direct' }
                );
                
                if (result !== false) {
                    const conversations = MessagesCore.ChatManager.getConversations();
                    const conversation = conversations.find(c => 
                        isConversationMatchForUser(c, numericUserId, SessionManager.getUserId())
                    );
                    
                    if (conversation) {
                        await MessagesCore.ConversationManager.openConversation(conversation.id);
                        return { success: true, conversationId: conversation.id, conversation };
                    }
                }
                
                return { success: !!result, result };
            }
            
            if (MessagesCore.ChatManager && typeof MessagesCore.ChatManager.openChat === 'function') {
                debugLog('[MessageCore] Using ChatManager.openChat');
                const result = await MessagesCore.ChatManager.openChat(numericUserId, displayName);
                return { success: true, result };
            }
            
            debugLog('[MessageCore] Dispatching event for UI');
            window.dispatchEvent(new CustomEvent('messages:openChat', {
                detail: {
                    userId: numericUserId,
                    userName: displayName,
                    userAvatar: realAvatar || null,
                    recipientId: numericUserId,
                    recipientName: displayName,
                    recipientAvatar: realAvatar || null,
                    timestamp: Date.now()
                }
            }));
            
            return { success: true, method: 'event', userId: numericUserId };
            
        } catch (error) {
            console.error('[MessageCore] Failed to open chat:', error);
            return { success: false, error: error.message };
        }
    }

    // =============================================
    // REAL-TIME MESSAGE HANDLER
    // =============================================
    function setupRealtimeMessageListener() {
        // MODULE-LEVEL guard — iframe reloads reset window, so we use a document-level flag
        // that survives within the same page load but resets on true iframe recreation.
        if (document.__msgCoreRealtimeBound) return;
        document.__msgCoreRealtimeBound = true;
        let hasRealtimeBinding = false;

        const renderRealtimeUpdate = function(chatId, normalizedMessage = null) {
            const _tsMs3 = _normalizeTs; // FIX: consolidated to canonical _normalizeTs

            if (normalizedMessage && ChatManager && ChatManager.addMessage) {
                // FIX: normalize timestamps to numeric ms before storing
                if (normalizedMessage.createdAt && typeof normalizedMessage.createdAt === 'string') {
                    normalizedMessage.createdAt = new Date(normalizedMessage.createdAt).getTime();
                }
                ChatManager.addMessage(normalizedMessage);
            }

            if (normalizedMessage && chatId) {
                upsertRealtimeConversation(chatId, normalizedMessage);
            }

            // FIX-SINGLE-SOURCE-OF-TRUTH: "is the user currently viewing this
            // conversation?" used to be computed TWICE — once just below (a bare
            // activeChat.id === chatId string compare, used only to decide
            // whether to bump unreadCount) and again further down (isThisChat,
            // with three fallback strategies, used to decide whether to render
            // live). The two could disagree: e.g. right after a reply confirms a
            // conversation's real chatId, ChatManager.getActiveChat().id can
            // still briefly read a 'pending_<id>' placeholder while the
            // conversationsMap is already keyed by the real numeric id — the
            // simple compare saw a mismatch and incremented unreadCount (badge
            // shows unread) while the richer check correctly resolved
            // isThisChat=true and rendered the message live (no badge should
            // show while the panel displaying that exact message is open).
            // Compute isThisChat ONCE, up front, and reuse it for the unread
            // counter, the notification, and the live render so they can never
            // disagree.
            // FIX-UNIFY-CHAT-MATCH: this used to have its own private copy of the
            // pending_-stripping + friendId-fallback logic. That copy was correct,
            // but three OTHER call sites elsewhere (ChatManager.addMessage's own
            // render block, and two spots in messages-ui.js) had their own,
            // weaker, un-stripped copies — which is what actually caused a message
            // you send to never appear in your own panel while still reaching the
            // other person. Now calls the one shared resolver
            // (window.__kynResolveIsThisChat, defined in messages-core.operations.js)
            // that every render call site uses, so this file's logic and theirs can
            // never drift apart again. See the root-cause comment block at the top
            // of messages-core.operations.js for the full writeup.
            const activeChat = ChatManager && ChatManager.getActiveChat && ChatManager.getActiveChat();
            const _rcId = String(chatId || '');
            const _acId = activeChat ? String(activeChat.id || '') : '';
            let isThisChat = window.__kynResolveIsThisChat(_rcId, normalizedMessage && normalizedMessage.senderId, activeChat);
            // TERTIARY: panel is open but _activeConversation cleared — recover from map
            if (!isThisChat && _rcId) {
                const _panel = document.getElementById('chatPanel');
                if (_panel && !_panel.classList.contains('hidden') && ChatManager._conversationsMap) {
                    const _conv = ChatManager._conversationsMap.get(_rcId) || ChatManager._conversationsMap.get(Number(_rcId));
                    if (_conv) { ChatManager._activeConversation = _conv; isThisChat = true; }
                }
            }
            // QUATERNARY (RECEIVE-WHILE-UNRESOLVED): the tertiary recovery above
            // only helps when _rcId is already the exact key some conversation is
            // stored under. A chat opened from a non-history source (Friend/Calls/
            // Status/notification tap) can still be sitting on this device as a
            // 'pending_<friendId>' entry — or with no _activeConversation set at
            // all yet, because its bootstrap/openConversation() hasn't finished —
            // at the exact moment the other side's reply/first message arrives.
            // In that window _rcId (the server's real chatId) matches neither the
            // pending key nor an unset activeConversation, so the panel can be
            // open, visible, and still silently miss the message. If the panel is
            // visible but we still don't know which conversation it's showing,
            // fall back to whichever open/recently-touched conversation this
            // sender maps to (by friendId), rather than requiring an exact chatId
            // match that a not-yet-resolved chat can't have yet.
            const _panelVisibleNow = (function () {
                const _p = document.getElementById('chatPanel');
                return !!(_p && !_p.classList.contains('hidden'));
            })();
            if (!isThisChat && _panelVisibleNow && normalizedMessage && normalizedMessage.senderId && ChatManager._conversationsMap) {
                let _byFriend = null;
                try {
                    for (const _c of ChatManager._conversationsMap.values()) {
                        if (_c && String(_c.friendId || (_c.otherParticipant && _c.otherParticipant.id) || '') === String(normalizedMessage.senderId)) {
                            _byFriend = _c;
                            break;
                        }
                    }
                } catch (_) {}
                // Only trust this when either there is no active conversation at
                // all yet (nothing to disagree with), or the current active
                // conversation is itself an unresolved pending_ placeholder for
                // this same sender — never override an already-resolved,
                // genuinely-different open conversation.
                if (_byFriend && (!activeChat || (activeChat.isPending && String(activeChat.friendId || '') === String(normalizedMessage.senderId)))) {
                    ChatManager._activeConversation = _byFriend;
                    isThisChat = true;
                }
            }

            // FIX-ROUND-22 (ON-SCREEN DIAGNOSTIC): the existing FORENSIC log below
            // only reaches a devtools console, which isn't practically reachable on
            // this user's test devices. Whenever a message arrives, the chat panel
            // is actually open/visible, but none of the three isThisChat strategies
            // matched (so the message would silently fail to render live), paint a
            // small on-screen banner with the exact values instead — visible on any
            // device, no console required. Auto-dismisses; never blocks anything.
            try {
                const _panelVisible = (function () {
                    const _p = document.getElementById('chatPanel');
                    return !!(_p && !_p.classList.contains('hidden'));
                })();
                if (!isThisChat && _panelVisible && normalizedMessage) {
                    const _msg = 'RENDER MISS | incoming=' + _rcId + ' active=' + _acId +
                        ' senderId=' + (normalizedMessage.senderId || '?') +
                        ' activeFriendId=' + (activeChat ? String(activeChat.friendId || '') : '?');
                    let _bar = document.getElementById('__kynDebugToast');
                    if (!_bar) {
                        _bar = document.createElement('div');
                        _bar.id = '__kynDebugToast';
                        _bar.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:999999;' +
                            'background:#c0392b;color:#fff;font:11px monospace;padding:8px 10px;' +
                            'border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.4);word-break:break-all;';
                        (document.body || document.documentElement).appendChild(_bar);
                    }
                    _bar.textContent = _msg;
                    clearTimeout(_bar.__hideTimer);
                    _bar.__hideTimer = setTimeout(function () { try { _bar.remove(); } catch (_) {} }, 15000);
                }
            } catch (_) { /* diagnostic only — never let this affect real rendering */ }

            if (ChatManager && ChatManager._conversationsMap && chatId) {
                const conversation = ChatManager._conversationsMap.get(chatId) || ChatManager._conversationsMap.get(String(chatId));
                if (conversation && normalizedMessage) {
                    conversation.lastMessage = normalizedMessage.content;
                    conversation.lastMessageAt = _tsMs3(normalizedMessage.createdAt || normalizedMessage.timestamp) || Date.now();
                    if (!isThisChat) {
                        const myId = SessionManager && SessionManager.getUserId && SessionManager.getUserId();
                        if (!normalizedMessage.senderId || String(normalizedMessage.senderId) !== String(myId)) {
                            conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                        }
                    } else {
                        // Actively viewing this conversation right now — it can never
                        // be "unread" while the message is appearing live in front of
                        // the user, regardless of what a stale counter said before.
                        conversation.unreadCount = 0;
                    }
                }
                if (ChatManager._conversations) {
                    ChatManager._conversations.sort(function(a, b) { return _tsMs3(b.lastMessageAt) - _tsMs3(a.lastMessageAt); });
                }
            }

            // FORENSIC: log every render decision, not just successes, so a
            // silently-dropped incoming message (network tab shows delivered,
            // nothing appears on screen) is visible in the console instead of
            // invisible. Pinpoints exactly what activeChatId vs. incoming
            // chatId looked like at the moment the match was made/missed —
            // this is the one thing the existing UI_RENDERED log (which only
            // fires on success) could never tell us.
            // NOTE: uses console.log directly (not debugLog) so it's visible
            // without having to flip on __MESSAGES_DEBUG__ / DEBUG first —
            // this is meant to be readable on the very next live test.
            console.log(`[FORENSIC] UI_RENDER_CHECK | incomingChatId=${_rcId} | activeChatId=${_acId} | activeConvSet=${!!activeChat} | isThisChat=${isThisChat} | msgId=${normalizedMessage ? (normalizedMessage.id || normalizedMessage.localId || '?') : '?'} | ts=${Date.now()}`);

            // Always update sidebar (unread badge, online status, last message)
            try {
                window.dispatchEvent(new CustomEvent('renderChatsList', {
                    detail: {
                        conversations: ensureSafeArray(ChatManager._conversations),
                        currentChat: ChatManager._activeConversation,
                        currentCategory: ChatManager.getCurrentCategory && ChatManager.getCurrentCategory(),
                        messageDrafts: {}
                    }
                }));
            } catch (_e) {}

            if (isThisChat) {
                try {
                    const _all = ChatManager._messages || [];
                    const _now = ChatManager._activeConversation || activeChat;
                    const _mid = _rcId || _acId;
                    // FIX-MSG-VANISH-A: strip the 'pending_' prefix before comparing, same as
                    // every other chatId comparison in this file (setMessages/addMessage/etc).
                    // Without this, a message sent locally under 'pending_<id>' (before the
                    // server confirms the real numeric chatId) fails this exact-string match
                    // the instant the real chatId becomes active — e.g. right when the other
                    // user's reply arrives — and silently drops out of the re-rendered list.
                    // Consolidated onto the same shared resolver used everywhere else
                    // (was a private duplicate of the identical stripping logic).
                    let _msgs = _all.filter(function(m) {
                        const mid = String(m.chatId || m.conversationId || '');
                        return window.__kynChatIdsMatch(mid, _mid) || window.__kynChatIdsMatch(mid, _acId);
                    }).sort(function(a, b) {
                        return _tsMs3(a.createdAt || a.timestamp) - _tsMs3(b.createdAt || b.timestamp);
                    });
                    if (normalizedMessage) {
                        const _has = _msgs.some(function(m) {
                            return (m.id && normalizedMessage.id && String(m.id) === String(normalizedMessage.id)) ||
                                   (m.localId && normalizedMessage.localId && String(m.localId) === String(normalizedMessage.localId));
                        });
                        if (!_has) {
                            _msgs = _msgs.concat([normalizedMessage]).sort(function(a, b) {
                                return _tsMs3(a.createdAt || a.timestamp) - _tsMs3(b.createdAt || b.timestamp);
                            });
                        }
                    }
                    const _renderMsgs = _msgs.length > 0 ? _msgs : (normalizedMessage ? [normalizedMessage] : []);
                    if (_renderMsgs.length > 0 && _now) {
                        // ── FORENSIC LOG: UI_RENDERED ─────────────────────────────────
                        const _rmId = normalizedMessage ? (normalizedMessage.id || normalizedMessage.localId || '?') : '?';
                        debugLog(`[FORENSIC] UI_RENDERED | messageId=${_rmId} | chatId=${chatId} | msgCount=${_renderMsgs.length} | ts=${Date.now()}`);
                        window.dispatchEvent(new CustomEvent('renderMessages', {
                            detail: { messages: _renderMsgs, currentChat: _now, currentUser: SessionManager && SessionManager.getUser && SessionManager.getUser() }
                        }));
                        // FIX-ROOT-CAUSE-LISTENER-NOT-READY: the 'renderMessages'
                        // CustomEvent above only does anything if UIRenderer's
                        // _setupEventListeners() has already run and attached its
                        // window.addEventListener('renderMessages', ...) handler.
                        // On a slow/cold load (many iframes — friends, calls,
                        // groups, tools, status — all doing their own startup
                        // sync work concurrently) messages-ui.js's own init can
                        // still be mid-flight when the very first realtime
                        // message arrives: the event fires into the void, nothing
                        // is listening yet, and the message never appears even
                        // though isThisChat correctly matched. Verify the bubble
                        // actually landed shortly after, and if not, paint it
                        // directly via window.UIRenderer (the same object the
                        // event listener itself calls into) as a fallback that
                        // doesn't depend on that listener having been attached.
                        try {
                            const _verifyId = normalizedMessage ? String(normalizedMessage.id || normalizedMessage.localId || '') : '';
                            if (_verifyId) {
                                let _verifyAttempts = 0;
                                const _verifyRender = function() {
                                    _verifyAttempts++;
                                    try {
                                        const _landed = document.querySelector('[data-message-id="' + _verifyId + '"], [data-id="' + _verifyId + '"]');
                                        if (_landed) return; // rendered normally — nothing to do
                                        if (window.UIRenderer && typeof window.UIRenderer.renderMessages === 'function') {
                                            debugLog(`[FORENSIC] UI_RENDER_FALLBACK | messageId=${_verifyId} | reason=listener_not_ready | attempt=${_verifyAttempts} | ts=${Date.now()}`);
                                            window.UIRenderer.renderMessages(_renderMsgs, _now, SessionManager && SessionManager.getUser && SessionManager.getUser());
                                            return;
                                        }
                                        // UIRenderer itself isn't exposed on window yet (messages-ui.js
                                        // still mid-init) — keep polling for up to ~8s rather than
                                        // giving up after one look, since that's the observed real-world
                                        // range for how late this can complete on a congested load.
                                        if (_verifyAttempts < 16) setTimeout(_verifyRender, 500);
                                    } catch (_) {}
                                };
                                setTimeout(_verifyRender, 350);
                            }
                        } catch (_) {}
                        try {
                            const _c = document.getElementById('messagesContainer');
                            if (_c) requestAnimationFrame(function() { _c.scrollTop = _c.scrollHeight; });
                        } catch (_) {}
                        // FIX (live read receipts): a message that arrives while its
                        // conversation is already open on screen was rendered
                        // instantly (above) but never told the server it had been
                        // seen — read status only updated the next time the user
                        // manually reopened/refocused the chat. Mark it read now,
                        // same call the manual chat-open path already uses, so the
                        // sender's delivery/read ticks update without any extra
                        // action from the receiver.
                        try {
                            const _mc = window.MessagesCore || window.messagesCore;
                            if (_mc && typeof _mc.markAsRead === 'function') {
                                _mc.markAsRead(chatId);
                            } else if (typeof ConversationManager !== 'undefined' && ConversationManager && ConversationManager.markAsRead) {
                                ConversationManager.markAsRead(chatId);
                            }
                        } catch (_) {}
                    }
                } catch (_e) {}
            } else if (normalizedMessage) {
                try {
                    const _sid = normalizedMessage.senderId;
                    const _mid = SessionManager && SessionManager.getUserId && SessionManager.getUserId();
                    if (!_sid || String(_sid) !== String(_mid)) {
                        if (window.__messageNotificationsEnabled !== false && UIFeatures && typeof UIFeatures.playNotificationSound === 'function') UIFeatures.playNotificationSound();
                        window.dispatchEvent(new CustomEvent('kyn:incomingMessage', { detail: { message: normalizedMessage, chatId: chatId } }));
                        // FIX (Notifications audit): chat.html's parent-level listener
                        // expects a postMessage (it listens on 'message', checking
                        // evt.data.type) — the dispatchEvent above only fires within
                        // this iframe's own window and never reaches the parent, so
                        // the "native OS notification when the app is backgrounded"
                        // feature has never actually fired. Relaying it here.
                        if (window.__messageNotificationsEnabled !== false && window.parent && window.parent !== window) {
                            try {
                                window.parent.postMessage({ type: 'kyn:incomingMessage', detail: { message: normalizedMessage, chatId: chatId } }, '*');
                            } catch (_relayErr) {}
                        }
                    }
                } catch (_e) {}
            }
        };

        // FIX: Dedup set prevents the same message being processed multiple times.
        // chat.html sends both 'message:new' AND 'new_message' to the iframe,
        // and multiple listeners (window.message, KynectaRealtime.on, document.message:new)
        // can all fire for the same payload — without dedup the message renders 4+ times.
        if (!window.__realtimeProcessedIds) window.__realtimeProcessedIds = new Set();
        if (!window.__realtimeSentIds)      window.__realtimeSentIds      = new Set();
        if (!window.__realtimeDeliveredAckIds) window.__realtimeDeliveredAckIds = new Set();
        const _realtimeProcessedIds = window.__realtimeProcessedIds;
        const _realtimeSentIds      = window.__realtimeSentIds;
        const _realtimeDeliveredAckIds = window.__realtimeDeliveredAckIds;

        // FIX-MSG-DELIVERY-ACK-RETRY: previously the delivery_ack send (below) was pure
        // fire-and-forget — a single emit attempt with no persistence. If BOTH the
        // iframe's own socket AND the chat.html relay happened to be unavailable at the
        // exact moment a message arrived (e.g. right after a page reload, or a brief
        // dual-disconnect), the ack was lost forever and the sender's 10s delivery
        // timeout always fired even though the message had genuinely arrived. Outgoing
        // messages already get this resilience via messageQueue.manager.js; delivery
        // acks did not. This mirrors that same queue-and-retry pattern for acks.
        const _PENDING_ACK_KEY = 'kyn_pending_delivery_acks';
        function _readPendingAcks() {
            try { return JSON.parse(localStorage.getItem(_PENDING_ACK_KEY) || '[]'); }
            catch(_) { return []; }
        }
        function _writePendingAcks(list) {
            try { localStorage.setItem(_PENDING_ACK_KEY, JSON.stringify(list.slice(-200))); }
            catch(_) {}
        }
        function _queuePendingAck(payload) {
            const list = _readPendingAcks();
            if (!list.some(function(p) { return String(p.messageId) === String(payload.messageId); })) {
                list.push(Object.assign({}, payload, { _queuedAt: Date.now() }));
                _writePendingAcks(list);
            }
        }
        function _attemptAckDelivery(payload) {
            // Returns true only if we had a live channel to actually hand the ack to —
            // best-effort like the rest of this pipeline (no ack-of-ack exists yet),
            // but now retried instead of dropped when neither channel is available.
            //
            // DIAGNOSTIC (temporary — undelivered-after-10s investigation): logs
            // exactly which channel was used and the payload sent, so this can be
            // matched directly against the backend's
            // "[WSService] delivery_ack accepted/REJECTED" log for the same
            // messageId to see precisely where a still-open delivery issue breaks.
            var sent = false;
            var _delSocket = window.KynectaRealtime && window.KynectaRealtime._socket;
            if (_delSocket && typeof _delSocket.emit === 'function' && _delSocket.connected) {
                _delSocket.emit('message:delivery_ack', payload);
                sent = true;
                console.log('[AckDelivery] sent via direct iframe socket:', payload);
            }
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'message:client_delivery_ack',
                        payload: payload,
                        source: 'messages'
                    }, '*');
                    sent = true; // parent relay is itself best-effort, but count it as an attempt
                    console.log('[AckDelivery] relayed via parent postMessage:', payload);
                }
            } catch(_pErr) { console.warn('[AckDelivery] parent relay threw:', _pErr?.message); }
            if (!sent) {
                console.warn('[AckDelivery] NEITHER channel available, queueing for retry:', payload);
            }
            return sent;
        }
        function _flushPendingAcks() {
            const list = _readPendingAcks();
            if (!list.length) return;
            const remaining = [];
            list.forEach(function(payload) {
                // Drop anything stuck for over 10 minutes — the message itself will
                // have long since been marked undelivered server-side by then anyway.
                if (Date.now() - (payload._queuedAt || 0) > 600000) return;
                if (!_attemptAckDelivery(payload)) remaining.push(payload);
            });
            _writePendingAcks(remaining);
        }
        // Retry on every reconnect (most important moment — this is exactly when a
        // previously-stranded ack becomes deliverable) and on a slow periodic sweep
        // as a catch-all for cases the 'connect' event alone might miss.
        if (!window.__kynAckRetryWired) {
            window.__kynAckRetryWired = true;
            if (window.KynectaRealtime && typeof window.KynectaRealtime.on === 'function') {
                window.KynectaRealtime.on('connect', _flushPendingAcks);
            }
            setInterval(_flushPendingAcks, 15000);
            // Also sweep once on load in case any acks were stranded by a page
            // reload before they could be delivered.
            setTimeout(_flushPendingAcks, 3000);
        }

        const ackMessageDelivered = async function(message) {
            const chatId = String(message?.chatId || message?.conversationId || '');
            const messageId = String(message?.serverId || message?.id || '');
            if (!chatId || !messageId) return;

            const ackKey = `${chatId}:${messageId}`;
            if (_realtimeDeliveredAckIds.has(ackKey)) return;
            _realtimeDeliveredAckIds.add(ackKey);
            setTimeout(function() { _realtimeDeliveredAckIds.delete(ackKey); }, 30000);

            try {
                debugLog('[messages-core] 📬 delivery ack send', { chatId, messageId });
                await makeApiRequest('/messages/mark-delivered/batch', 'POST', {
                    chatId,
                    messageIds: [messageId]
                });
                debugLog('[messages-core] ✅ delivery ack success', { chatId, messageId });
            } catch (error) {
                console.warn('[messages-core] Delivery ack failed:', error && error.message ? error.message : error);
            }
        };

        const handleRealtimePayload = async function(type, payload) {
            const normalizedType = String(type || '').toLowerCase();
            // FIX: 'data' was never declared — use 'payload' (the actual parameter name).
            // This was a ReferenceError that crashed handleRealtimePayload on EVERY incoming
            // message, which is why no messages were ever displayed in the chat panel.
            const data = payload || {};

            if (normalizedType === 'new_message' || normalizedType === 'message:new' || normalizedType === 'newmessage') {
                // ✅ FIX: data may be the raw payload (from wsService.on) or a wrapper
                // { payload:{...}, source:'ws-bridge' } (from postMessage bridge).
                // Unwrap one level if needed, then fall back to data itself.
                // FIX (STATUS-REPLY-NEVER-DISPLAYED): the /status/:id/reply backend
                // route emits new_message with the actual message nested at
                // `payload.message` (alongside statusId/statusPreview/chatId
                // metadata) instead of flat at the top level like every other
                // new_message event. None of the branches below ever checked
                // `data.message`, so for a status reply `message` fell through to
                // `data` itself — which has a real chatId but no id/content/text/body
                // at the top level — and got silently dropped by the "nothing to
                // show" guard just below. Adding this check is what actually lets a
                // status reply reach the chat panel.
                const message = (data && data.payload && (data.payload.id || data.payload.chatId))
                    ? data.payload
                    : (data && data.data && (data.data.id || data.data.chatId))
                        ? data.data
                        : (data && data.message && (data.message.id || data.message.chatId || data.message.content))
                            ? { ...data.message, chatId: data.message.chatId || data.chatId, statusPreview: data.statusPreview, replyToStatusId: data.statusId }
                            : data;
                const chatId = String(
                    (message && (message.chatId || message.conversationId)) || ''
                );
                // ✅ FIX: Don't gate on message.id — server might not echo id back immediately.
                // Gate only on chatId so we never silently drop a valid incoming message.
                if (!message || !chatId) return;

                // ── PHASE24 FORENSIC: STAGE10 — frontend store entry point ─────────
                if (message && message.traceId) {
                    console.log(`[FORENSIC][${message.traceId}] STAGE10_STORE_ENTRY | chatId=${chatId} | messageId=${message.id || 'n/a'} | localId=${message.localId || 'n/a'} | ts=${Date.now()}`);
                }

                // ✅ FIX 4: Guard against String(undefined) = "undefined" poisoning the local store.
                const _safeId = message.id != null ? String(message.id) : null;
                const _safeLocalId = message.localId != null ? String(message.localId) : null;
                // FIX (MSG-NOT-DISPLAYED-CONTENT-FIELD-MISMATCH): this used to check only
                // message.content, but the normalization step below (~30 lines down) already
                // falls back to message.text when .content is absent. A message that arrives
                // with only .text set — and, before any id/localId has been assigned/echoed
                // back, which is the normal case for a message someone else just sent to us —
                // was silently dropped right here, before it ever reached that fallback. The
                // socket delivery, dedup, and every downstream render path all worked fine;
                // this early return just discarded the message first. Matches the reported
                // symptom exactly: the console shows the message being received, but nothing
                // ever appears in the chat panel.
                if (!_safeId && !_safeLocalId && !message.content && !message.text && !message.body) return;

                // FIX: Dedup — chat.html posts 'message:new' AND 'new_message' for the same payload,
                // and multiple event listeners can fire. Use a Set to process each message only once.
                // FIXED DEDUP: prefix with chatId so sender+receiver never collide on same serverId.
                // Sender processes serverId "214", adds "7:214". Receiver also gets "7:214" —
                // BUT sender and receiver are different browsers/users so they have separate
                // window.__realtimeProcessedIds Sets. Within one browser (same user), this
                // prevents the 12-listener-firing duplicates without blocking cross-user delivery.
                // FIX BUG #6: Dedup key MUST include a valid chatId.
                // If chatId is missing/undefined, using it as prefix causes all messages
                // for different chats to share the same "undefined:id" key — silently
                // dropping all messages after the first.
                // Only use chatId-prefixed key when chatId is a real, non-empty value.
                const _validChatId = chatId && chatId !== 'undefined' && chatId !== 'null' ? chatId : null;
                const _dedupKey = (_validChatId && _safeId ? (_validChatId + ':' + _safeId) : null) ||
                    (_validChatId && _safeLocalId ? (_validChatId + ':' + _safeLocalId) : null) ||
                    (_safeId ? ('msg:' + _safeId) : null) ||
                    (_safeLocalId ? ('local:' + _safeLocalId) : null) ||
                    ((_validChatId || 'nochat') + ':' + (message.content || '') + ':' + (message.createdAt || message.timestamp || ''));
                if (_realtimeProcessedIds.has(_dedupKey)) return;
                _realtimeProcessedIds.add(_dedupKey);
                setTimeout(function() { _realtimeProcessedIds.delete(_dedupKey); }, 8000);

                // FIXED ECHO PREVENTION (strengthened):
                // When senderId === myId, this socket payload is from broadcastToChat()
                // echoing back to the sender's own socket (which is in the chat room).
                // The backend fix removes broadcastToChat for message:new, but we keep
                // this guard as defense-in-depth against any remaining echo paths.
                const _realtimeCurrentUserId = (SessionManager && SessionManager.getUserId && SessionManager.getUserId()) ||
                    (window.__PARENT_SESSION__ && (window.__PARENT_SESSION__.userId || (window.__PARENT_SESSION__.user && window.__PARENT_SESSION__.user.id))) ||
                    null;
                const _realtimeSenderId = message.senderId || (message.sender && message.sender.id);
                if (_realtimeSenderId && _realtimeCurrentUserId &&
                    String(_realtimeSenderId) === String(_realtimeCurrentUserId)) {

                    // Check 1: localId-based matching (most reliable when clientLocalId was set)
                    const _hasLocalMarker = !!(_safeLocalId || message.localId || message.requestId);

                    // Check 2: serverId in sent-log (set by message:sent handler)
                    const _inSentLog = (function() {
                        if (!_safeId) return false;
                        try { return JSON.parse(localStorage.getItem('kynecta_sent_ids_v8') || '[]').includes(_safeId); }
                        catch(_) { return false; }
                    })();

                    // Check 3 (NEW): serverId exists in _optimisticMessages values (sent this session)
                    // This catches the case where clientLocalId was null so localId is absent,
                    // and message:sent hasn't fired yet so kynecta_sent_ids_v8 is empty.
                    const _inOptimistic = (function() {
                        if (!MessageHandler || !MessageHandler._optimisticMessages) return false;
                        // Check if any optimistic message matches by chatId + approximate content
                        for (const [, optMsg] of MessageHandler._optimisticMessages) {
                            if (String(optMsg.chatId || '') === chatId &&
                                (optMsg.content || '').trim() === (message.content || '').trim()) {
                                return true;
                            }
                        }
                        return false;
                    })();

                    // Check 4 (NEW): _messagesMap already has this serverId (duplicate scenario)
                    const _alreadyInMap = _safeId && ChatManager._messagesMap && ChatManager._messagesMap.has(_safeId);

                    if (_hasLocalMarker || _inSentLog || _inOptimistic || _alreadyInMap) {
                        // Definitely our own echo — update status only, never append
                        const _echoLocalId = _safeLocalId || message.localId || null;
                        const _echoServerId = _safeId || null;
                        if (ChatManager && ChatManager.updateMessageStatus) {
                            ChatManager.updateMessageStatus(
                                _echoLocalId || _echoServerId,
                                message.status || 'sent',
                                { serverId: _echoServerId, localId: _echoLocalId }
                            );
                        }
                        // Track serverId for future echo prevention
                        if (_echoServerId) {
                            try {
                                const _sl = JSON.parse(localStorage.getItem('kynecta_sent_ids_v8') || '[]');
                                if (!_sl.includes(_echoServerId)) { _sl.push(_echoServerId); if (_sl.length > 200) _sl.splice(0, _sl.length - 200); localStorage.setItem('kynecta_sent_ids_v8', JSON.stringify(_sl)); }
                            } catch(_) {}
                        }
                        return;
                    }
                    // If none of the above matched, this is a message we sent from ANOTHER device/tab.
                    // Fall through and add it normally so it appears in the current session.
                }

                // FIX-RECEIVE-DECRYPT-DECOUPLE (replaces the old FIX-DM-DECRYPT-AT-WRITE
                // block, which awaited decryptFromChat — bounded by an 8s race — BEFORE
                // normalizedMessage was ever built or rendered. That meant "message
                // appears on screen" was gated on a network round trip (sender key
                // fetch) that could legitimately take several seconds, and a
                // slow/stuck fetch delayed the message up to the full 8s even though
                // the socket had already delivered it. Per the messaging-lifecycle
                // rebuild ("separate message receipt from decryption"), this now only
                // detects whether decryption is needed here; the actual decrypt call
                // happens AFTER render/persist/ack, below, so the bubble appears
                // immediately (as the ciphertext envelope if that's all we have yet)
                // and is patched in place once plaintext resolves. Failure/timeout
                // degrades to the same ciphertext placeholder as before.
                const _needsDecrypt = !!(window.KynectaE2E && window.KynectaE2E.enabled &&
                    typeof message.content === 'string' &&
                    message.content.charAt(0) === '{' && message.content.indexOf('"v"') !== -1);

                // FIX: always numeric ms — ISO strings compare as NaN in sort
                const _sca = message.createdAt
                    ? (typeof message.createdAt === 'string' ? new Date(message.createdAt).getTime() : Number(message.createdAt))
                    : (message.timestamp ? (typeof message.timestamp === 'string' ? new Date(message.timestamp).getTime() : Number(message.timestamp)) : Date.now());

                let normalizedMessage = {
                    id:       _safeId || _safeLocalId || ('tmp_' + Date.now()),
                    serverId: _safeId || null,
                    localId:  _safeLocalId || null,
                    content: message.content || message.text || message.body || '',
                    type: message.type || 'text',
                    senderId: message.senderId || (message.sender && message.sender.id),
                    sender: message.sender || null,
                    replyToId: message.replyToId || null,
                    replyTo:   message.replyTo   || null,
                    reactions: message.reactions || {},
                    timestamp: _sca,
                    createdAt: _sca,
                    status: message.status || 'delivered',
                    conversationId: chatId,
                    chatId: chatId,
                    traceId: message.traceId || null,
                    isLocalOnly: false,
                    // FIX-ATTACHMENT-PERSISTENCE: these were missing entirely
                    // from this normalization step, so even after the backend
                    // started correctly returning them, every attachment got
                    // silently dropped right here before ever reaching the
                    // render templates in messages-ui.js.
                    attachment: message.attachment || null,
                    mediaUrl: message.mediaUrl || message.fileUrl || null,
                    fileUrl: message.fileUrl || message.mediaUrl || null,
                    fileName: message.fileName || message.attachment?.name || null,
                    encrypted: !!message.encrypted || _needsDecrypt,
                    originalMimeType: message.originalMimeType || null
                };

                if (window.KynectaSyncEngine?.ingestIncomingMessage) {
                    const saved = await window.KynectaSyncEngine.ingestIncomingMessage(message, chatId).catch(() => null);
                    if (saved) {
                        normalizedMessage = {
                            ...saved,
                            conversationId: saved.chatId || saved.conversationId || chatId,
                            chatId: saved.chatId || chatId
                        };
                    }
                } else if (window.KynectaLocalStore?.saveMessage) {
                    // CRITICAL FIX: Save to IDB directly even without SyncEngine
                    // This ensures fetchMessages picks it up after user sends reply
                    window.KynectaLocalStore.saveMessage({
                        serverId:    String(normalizedMessage.id || normalizedMessage.serverId || ''),
                        chatId:      String(chatId),
                        conversationId: String(chatId),
                        senderId:    normalizedMessage.senderId,
                        content:     normalizedMessage.content || '',
                        type:        normalizedMessage.type || 'text',
                        sender:      normalizedMessage.sender || null,
                        status:      'delivered',
                        createdAt:   normalizedMessage.createdAt || Date.now(),
                        isLocalOnly: false,
                    }).catch(function(){});
                }

                // ── PHASE24 FORENSIC: STAGE11 — render decision ─────────────────────
                if (normalizedMessage && normalizedMessage.traceId) {
                    const _isActiveChat = !!(ChatManager && ChatManager.getActiveChat && ChatManager.getActiveChat() && String(ChatManager.getActiveChat().id) === String(chatId));
                    console.log(`[FORENSIC][${normalizedMessage.traceId}] STAGE11_RENDER_DECISION | chatId=${chatId} | activeChatMatches=${_isActiveChat} | messageId=${normalizedMessage.id || 'n/a'} | ts=${Date.now()}`);
                }
                renderRealtimeUpdate(chatId, normalizedMessage);
                ackMessageDelivered(normalizedMessage).catch(() => {});

                // FIX-RECEIVE-DECRYPT-DECOUPLE (part 2): the message is already on
                // screen and already acked — decrypt now, in the background, and
                // patch the bubble in place once plaintext is ready. Same claim-key
                // guard and 8s bound as the old inline block, but nothing above this
                // point ever waits on it.
                if (_needsDecrypt) {
                    const _claimKey = message.id || message.localId;
                    if (!window.__kynClaimDecrypt || window.__kynClaimDecrypt(_claimKey)) {
                        (async () => {
                            try {
                                // FIX-ROOT-CAUSE-DECRYPT-OWN-REPLY: decryptFromChat's third
                                // argument must always be "the OTHER participant", because
                                // encryptForChat always derived the AES key using the
                                // recipient's public key — never our own. The branch above
                                // (own-echo handling) specifically covers messages WE sent,
                                // arriving via another device/tab (_realtimeSenderId ===
                                // _realtimeCurrentUserId), so message.senderId here would be
                                // our own id — passing it straight through would make us
                                // derive a shared secret with ourselves. Use the recipient id
                                // instead whenever the sender is us.
                                const _isOwnEchoedMessage = _realtimeSenderId && _realtimeCurrentUserId &&
                                    String(_realtimeSenderId) === String(_realtimeCurrentUserId);
                                const _senderIdForDecrypt = _isOwnEchoedMessage
                                    ? (message.receiverId || message.recipientId ||
                                       (message.receiver && message.receiver.id) || (message.recipient && message.recipient.id) ||
                                       message.senderId)
                                    : message.senderId;
                                const _plaintext = await Promise.race([
                                    window.KynectaE2E.decryptFromChat(message.content, chatId, _senderIdForDecrypt),
                                    new Promise((_, reject) => setTimeout(() => reject(new Error('E2E decrypt timeout')), 8000))
                                ]);
                                if (_plaintext && _plaintext !== message.content &&
                                    _plaintext.indexOf('[Decryption failed') !== 0) {
                                    const _patched = { ...normalizedMessage, content: _plaintext, encrypted: false };
                                    if (ChatManager && ChatManager.addMessage) ChatManager.addMessage(_patched);
                                    renderRealtimeUpdate(chatId, _patched);
                                    if (window.KynectaLocalStore?.saveMessage) {
                                        window.KynectaLocalStore.saveMessage({
                                            localId:  _patched.localId || undefined,
                                            serverId: String(_patched.serverId || _patched.id || ''),
                                            chatId:   String(chatId),
                                            conversationId: String(chatId),
                                            content:  _plaintext,
                                            isLocalOnly: false,
                                        }).catch(function(){});
                                    }
                                }
                                // On failure/timeout, leave the ciphertext envelope on
                                // screen — messages-ui.js's render-time decrypt still
                                // gets a chance to retry later (e.g. once the ratchet
                                // session catches up), same as before this change.
                            } catch (_) {}
                        })();
                    }
                }
                // FIX-MSG-DELIVERY-ACK: Phase 2 — tell server we received this message
                // so the sender gets 'message:delivered' and delivery timeout is cleared.
                try {
                    var _ackPayload = {
                        messageId: normalizedMessage.serverId || normalizedMessage.id,
                        chatId:    normalizedMessage.chatId || normalizedMessage.conversationId,
                        senderId:  normalizedMessage.senderId || normalizedMessage.userId,
                    };
                    // FIX-ACK-SILENT-FAIL: this iframe keeps its own independent socket
                    // connection, which can be momentarily disconnected/reconnecting or
                    // simply not yet initialized when a message arrives, causing a bare
                    // emit here to silently no-op — the message still renders correctly,
                    // but the sender's 10s delivery-timeout fires anyway because the
                    // server never heard back. _attemptAckDelivery tries both the direct
                    // socket and the chat.html relay; if NEITHER is available right now
                    // (both momentarily down), queue it instead of dropping it — it will
                    // be retried automatically on the next reconnect and on the periodic
                    // sweep (see _flushPendingAcks above). The server-side handler is
                    // idempotent (it just clears a timer), so retrying is always safe.
                    if (!_attemptAckDelivery(_ackPayload)) {
                        _queuePendingAck(_ackPayload);
                    }
                } catch(_dErr) { /* silent — delivery ack is best-effort */ }
                EventBus.emit('message:received', normalizedMessage);
                try { window.dispatchEvent(new CustomEvent('newMessage', { detail: { message: normalizedMessage } })); } catch (_e) {}
                return;
            }

            if (normalizedType === 'message_sent' || normalizedType === 'message:sent') {
                const d = (data.payload && (data.payload.localId || data.payload.messageId)) ? data.payload : data;
                const messageId = d.localId || d.messageId || d.serverId || d.id;
                const _sk = String(d.localId||'') + ':' + String(d.serverId||d.messageId||d.id||'');
                if (_sk !== ':' && _realtimeSentIds.has(_sk)) return;
                if (_sk !== ':') { _realtimeSentIds.add(_sk); setTimeout(()=>_realtimeSentIds.delete(_sk), 15000); }
                debugLog('[messages-core] ✅ message:sent received localId=', d.localId, 'serverId=', d.serverId || d.messageId);
                // Track serverId so echo prevention knows this was our own sent message
                const _confirmServerId = d.serverId || d.messageId || d.id;
                if (_confirmServerId) {
                    try {
                        const _sl = JSON.parse(localStorage.getItem('kynecta_sent_ids_v8') || '[]');
                        const _sid = String(_confirmServerId);
                        if (!_sl.includes(_sid)) { _sl.push(_sid); if (_sl.length > 200) _sl.splice(0, _sl.length - 200); localStorage.setItem('kynecta_sent_ids_v8', JSON.stringify(_sl)); }
                    } catch(_) {}
                }
                if (messageId && ChatManager.updateMessageStatus) {
                    ChatManager.updateMessageStatus(messageId, 'sent', {
                        localId:  d.localId  || null,
                        serverId: d.serverId || d.messageId || d.id || null
                    });
                }
                return;
            }

            // FIX-MSG-DELIVERY: Handle Phase 1 — server received message
            if (normalizedType === 'message_received_by_server' || normalizedType === 'message:received_by_server') {
                const mid = (data.messageId || data.payload?.messageId || '');
                if (mid) {
                    // Update local message status to 'received' (single tick → double tick)
                    EventBus.emit('message:status_update', { messageId: mid, status: 'received', timestamp: data.timestamp || Date.now() });
                    debugLog('[messages-core] 📡 message received by server mid=' + mid);
                }
                return;
            }

            // FIX-MSG-DELIVERY: Handle delivery failure — mark as failed
            if (normalizedType === 'message_delivery_failed' || normalizedType === 'message:delivery_failed') {
                const mid = (data.messageId || data.payload?.messageId || '');
                const reason = data.reason || 'delivery_timeout';
                if (mid) {
                    EventBus.emit('message:status_update', { messageId: mid, status: 'failed', reason, timestamp: data.timestamp || Date.now() });
                    console.warn('[messages-core] ❌ message delivery failed mid=' + mid + ' reason=' + reason);
                }
                return;
            }

            if (normalizedType === 'message_delivered' || normalizedType === 'message:delivered') {
                // ✅ FIX 9: Unwrap postMessage bridge wrapper
                const d = (data.payload && (data.payload.localId || data.payload.messageId)) ? data.payload : data;
                const messageId = d.localId || d.messageId || d.serverId || d.id;
                if (messageId && ChatManager.updateMessageStatus) {
                    ChatManager.updateMessageStatus(messageId, 'delivered', {
                        deliveredAt: d.deliveredAt || d.timestamp || Date.now(),
                        localId:  d.localId  || null,
                        serverId: d.serverId || d.messageId || d.id || null
                    });
                }
                return;
            }

            if (normalizedType === 'message_read' || normalizedType === 'message:read' || normalizedType === 'message_seen' || normalizedType === 'message:seen') {
                // ✅ FIX 9: Unwrap postMessage bridge wrapper
                const d = (data.payload && (data.payload.localId || data.payload.messageId)) ? data.payload : data;
                const ids = Array.isArray(d.messageIds) && d.messageIds.length > 0
                    ? d.messageIds
                    : [d.localId || d.messageId || d.serverId || d.id].filter(Boolean);
                ids.forEach((messageId) => {
                    if (messageId && ChatManager.updateMessageStatus) {
                        ChatManager.updateMessageStatus(messageId, 'read', {
                            readAt:   d.readAt   || d.timestamp || Date.now(),
                            localId:  d.localId  || null,
                            serverId: d.serverId || d.messageId || d.id || null
                        });
                    }
                });
                return;
            }

            if (normalizedType === 'message_deleted' || normalizedType === 'message:deleted' || normalizedType === 'messages:disappeared') {
                const d = (data.payload && (data.payload.messageId || data.payload.messageIds)) ? data.payload : data;
                const ids = Array.isArray(d.messageIds) && d.messageIds.length > 0
                    ? d.messageIds.map(String)
                    : [d.messageId || d.id].filter(Boolean).map(String);
                if (ids.length === 0) return;

                const activeChatId = d.chatId || d.conversationId || ChatManager.getActiveChat()?.id || null;

                // PHASE10-FIX: Remove messages individually — NEVER call setMessages() on deletion.
                // setMessages() replaces the entire array, potentially wiping unrelated messages.
                // Instead: filter _messages in-place and rebuild the map.
                ids.forEach(function(id) {
                    // Record in deletion registry — prevents cache resurrection
                    try { window.__PHASE10_DeletionRegistry?.mark('message', id, 'deleted'); } catch(_) {}

                    // Remove from in-memory array
                    const idx = ChatManager._messages
                        ? ChatManager._messages.findIndex(function(m) {
                            return String(m.id||'') === id || String(m.serverId||'') === id || String(m.localId||'') === id;
                          })
                        : -1;
                    if (idx !== -1) {
                        ChatManager._messages.splice(idx, 1);
                        ChatManager._messagesMap?.delete(id);
                    }

                    // Remove from localStorage cache
                    if (activeChatId) {
                        try {
                            const cacheKey = `kynecta_messages_v8_${activeChatId}`;
                            const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
                            if (Array.isArray(cached)) {
                                const filtered = cached.filter(function(m) { return String(m.id||'') !== id; });
                                if (filtered.length !== cached.length) localStorage.setItem(cacheKey, JSON.stringify(filtered));
                            }
                        } catch(_) {}
                    }

                    // Remove from IndexedDB
                    if (window.KynectaLocalStore) {
                        window.KynectaLocalStore.deleteMessage(id).catch(() => {});
                    }
                });

                // Rebuild map and notify subscribers once (not per-message)
                if (ids.length > 0) {
                    ChatManager._rebuildMessagesMap?.();
                    ChatManager._notifySubscribers?.();
                }

                EventBus.emit('message:deleted', { messageIds: ids, chatId: activeChatId, forEveryone: !!d.deleteForEveryone });
                return;
            }

            // FIX: Handle message:reaction from server (both sides see emoji)
            if (normalizedType === 'message:reaction' || normalizedType === 'message_reaction' || normalizedType === 'reaction_updated') {
                const d = (data.payload && data.payload.messageId) ? data.payload : data;
                const _rmId = d.messageId; const _rReact = d.reactions;
                if (!_rmId || !_rReact) return;
                const _rAll = ChatManager.getMessages ? ChatManager.getMessages() : [];
                const _rTgt = _rAll.find(function(m) { return String(m.id || m.serverId) === String(_rmId); });
                if (_rTgt) {
                    _rTgt.reactions = _rReact;
                    try {
                        const _rb = document.querySelector('[data-message-id="' + _rmId + '"] .message-bubble');
                        const _re = document.querySelector('[data-message-id="' + _rmId + '"] .message-reactions');
                        const _myId4 = SessionManager && SessionManager.getUserId && SessionManager.getUserId();
                        let _rh = '';
                        if (_rReact && Object.keys(_rReact).length > 0) {
                            _rh = '<div class="message-reactions">';
                            for (const [em, users] of Object.entries(_rReact)) {
                                const ul = Array.isArray(users) ? users : (users ? [users] : []);
                                if (!ul.length) continue;
                                const mine = _myId4 && ul.some(function(u) { return String(u) === String(_myId4); });
                                _rh += '<span class="reaction' + (mine ? ' reaction-mine' : '') + '">' + em + ' ' + ul.length + '</span>';
                            }
                            _rh += '</div>';
                        }
                        if (_re) { _re.outerHTML = _rh; } else if (_rh && _rb) { _rb.insertAdjacentHTML('beforeend', _rh); }
                    } catch(_) {}
                }
                return;
            }
        };

        window.addEventListener('message', function(event) {
            const data = event.data;
            if (!data || typeof data !== 'object') return;
            // FIX: Only route actual new messages — status/session/settings events
            // previously caused duplicates and ghost messages
            const _rt = String(data.type || '').toLowerCase();
            if (_rt === 'message:new' || _rt === 'new_message' || _rt === 'newmessage' ||
                _rt === 'chat:message' || _rt === 'message_received' ||
                _rt === 'message:deleted' || _rt === 'message_deleted' ||
                _rt === 'message:seen' || _rt === 'message_seen' ||
                _rt === 'message:read' || _rt === 'message_read' ||
                _rt === 'message:delivered' || _rt === 'message_delivered') {
                handleRealtimePayload(data.type, data);
            }
            if (data.type === 'message:reaction' || data.type === 'REACTION_UPDATED') {
                handleRealtimePayload('message:reaction', data);
            }

            // ── LAN message received (same subnet peer sent directly) ─────────
            if (data.type === 'lan:message' || data.type === 'LAN_MESSAGE') {
                const lanMsg = data.payload || data;
                if (lanMsg && lanMsg.content) {
                    handleRealtimePayload('message:new', {
                        type: 'message:new',
                        payload: { ...lanMsg, transport: 'LAN' },
                        message: { ...lanMsg, transport: 'LAN' },
                    });
                }
            }

            // ── Offline queue delivery confirmation ──────────────────────────
            if (data.type === 'queue:delivered' && data.localId) {
                window.__OfflineMessageQueue?.markDelivered?.(data.localId).catch(() => {});
            }

            if (data && (data.type === 'FRIEND_ONLINE' || data.type === 'FRIEND_OFFLINE' || data.type === 'STATUS_UPDATE')) {
                const p = data.payload || data;
                const uid = p.userId || p.id || p.friendId;
                const isOnline = data.type === 'FRIEND_ONLINE' || p.online === true || p.status === 'online';
                if (uid && FriendManager) {
                    FriendManager.updateFriendStatus({ userId: uid, id: uid, online: isOnline, status: isOnline ? 'online' : 'offline', lastSeen: p.lastSeen || null });
                }
                // FIX: Also update conversation online status so sidebar dot reflects reality
                if (uid && ChatManager && ChatManager._conversationsMap) {
                    ChatManager._conversationsMap.forEach(function(conv) {
                        const fid = conv.friendId || (conv.otherParticipant && conv.otherParticipant.id);
                        if (fid && String(fid) === String(uid)) {
                            conv.online = isOnline;
                        }
                    });
                    // Re-render sidebar so status dots update
                    try {
                        window.dispatchEvent(new CustomEvent('renderChatsList', {
                            detail: {
                                conversations: ChatManager._conversations ? Array.from(ChatManager._conversationsMap.values()) : [],
                                currentChat: ChatManager._activeConversation,
                                currentCategory: ChatManager.getCurrentCategory ? ChatManager.getCurrentCategory() : 'all',
                                messageDrafts: {}
                            }
                        }));
                    } catch(_pe) {}
                }
                const activeChat = ChatManager && ChatManager.getActiveChat && ChatManager.getActiveChat();
                if (activeChat) {
                    const chatFriendId = activeChat.friendId || activeChat.otherUserId || activeChat.userId;
                    if (chatFriendId && String(chatFriendId) === String(uid)) {
                        const statusEl = document.getElementById('chatStatusText');
                        const indicatorEl = document.getElementById('chatStatusIndicator');
                        if (statusEl) statusEl.textContent = isOnline ? 'Active now' : 'Offline';
                        if (indicatorEl) indicatorEl.className = 'chat-status ' + (isOnline ? 'online' : 'offline');
                    }
                }
            }
        });

        // FIX-PHASE15: Re-bind on socket reconnect. If socket disconnects and
        // reconnects, wsService listeners must be re-registered.
        if (window.KynectaRealtime && typeof window.KynectaRealtime.on === 'function') {
            window.KynectaRealtime.on('connect', function() {
                // Clear the realtimeBinding flag so next message triggers re-bind
                window.__messagesRealtimeBound = false;
            });
        }

        if (!hasRealtimeBinding && window.wsService?.on) {
            hasRealtimeBinding = true;
            ['new_message', 'message:new', 'message_delivered', 'message:delivered', 'message_read', 'message:read', 'message_seen', 'message:seen', 'message_deleted', 'message:deleted', 'messages:disappeared'].forEach((eventName) => {
                if (typeof window.wsService.off === 'function') {
                    window.wsService.off(eventName);
                }
                window.wsService.on(eventName, (payload) => {
                    handleRealtimePayload(eventName, payload);
                });
            });
        }

        // ✅ FIX: Also bind to KynectaRealtime singleton if available now or when it becomes ready.
        // messages-core previously ONLY checked window.wsService which is the legacy shim.
        // The hardened manager exposes window.KynectaRealtime.on() — we must bind to it too.
        function _bindKynectaRealtime() {
            const rt = window.KynectaRealtime;
            if (!rt || !rt.on || rt.__msgCoreBound) return;
            rt.__msgCoreBound = true;
            ['message:new', 'new_message', 'chat:message', 'MESSAGE_RECEIVED',
             'message:delivered', 'message:read', 'message_seen', 'message:seen', 'message_deleted', 'message:deleted', 'messages:disappeared'].forEach((eventName) => {
                if (typeof rt.off === 'function') {
                    rt.off(eventName);
                }
                rt.on(eventName, (payload) => {
                    handleRealtimePayload(eventName, payload);
                });
            });
            // FIX-RECONNECT-REBIND: When socket disconnects, clear the bound flag
            // so that the next reconnect re-registers the listeners above.
            // Without this, after the first disconnect the listeners are gone
            // (socket cleared them) and __msgCoreBound=true prevents re-registration.
            if (!rt.__msgCoreBoundDisconnectWired) {
                rt.__msgCoreBoundDisconnectWired = true;
                rt.on('disconnect', function() {
                    rt.__msgCoreBound = false;
                });
                // Also re-bind on reconnect/connect
                rt.on('connect', function() {
                    rt.__msgCoreBound = false;
                    _bindKynectaRealtime();
                });
            }
            debugLog('[messages] ✅ Bound to KynectaRealtime singleton events');
        }
        _bindKynectaRealtime();
        window.addEventListener('kyn:realtimeReady', _bindKynectaRealtime, { once: true });

        // BUG-006 FIX: Guard document.addEventListener calls with a module-level flag.
        // Previously these registered unconditionally every time setupRealtimeMessageListener
        // ran (which happens on every initMessageModule call — visibility change, focus
        // restore, reconnect). Each call stacked another set of handlers, causing each
        // incoming message to fire handleRealtimePayload N times (N = number of inits).
        // processedMessageIds deduped the final store write, but still did N full
        // evaluations of the handler including N dedup lookups + N setTimeout cleanups.
        if (!window.__kynDocListenersBound) {
            window.__kynDocListenersBound = true;

        // NOTE: window 'kyn:message:received' listener intentionally removed —
        // message.html previously dispatched both document:message:new AND
        // window:kyn:message:received for the same payload, causing handleRealtimePayload
        // to fire twice. message.html now only dispatches document:message:new.
        document.addEventListener('message:new', function(evt) {
            if (evt.detail) handleRealtimePayload('message:new', evt.detail);
        });
        // FIX: status events route correctly — not as new messages
        document.addEventListener('message:sent', function(evt) {
            if (evt.detail) handleRealtimePayload('message:sent', evt.detail);
        });
        document.addEventListener('message:delivered', function(evt) {
            if (evt.detail) handleRealtimePayload('message:delivered', evt.detail);
        });
        document.addEventListener('message:read', function(evt) {
            if (evt.detail) handleRealtimePayload('message:read', evt.detail);
        });
        document.addEventListener('message:deleted', function(evt) {
            if (evt.detail) handleRealtimePayload('message:deleted', evt.detail);
        });
        document.addEventListener('message:reaction', function(evt) {
            if (evt.detail) handleRealtimePayload('message:reaction', evt.detail);
        });

        } // end if !window.__kynDocListenersBound
    }   // end setupRealtimeMessageListener

    // ✅ FIX 3: Expose direct entry points for app_realtime_socket.js.
    // That file checks core._handleIncomingRealtimeMessage, core.receiveMessage, core.onNewMessage
    // in sequence. Without this, all three are missing and it falls through to the slower
    // document.dispatchEvent() path which is same-document only and misses cross-frame scenarios.
    function _exposeRealtimeEntryPoints() {
        const mc = window.MessagesCore || window.messagesCore;
        if (!mc) return;
        // We need handleRealtimePayload — it's defined inside setupRealtimeMessageListener.
        // Re-bind via the document event path as the canonical public method.
        mc._handleIncomingRealtimeMessage = function(data) {
            document.dispatchEvent(new CustomEvent('message:new', { detail: data }));
        };
        mc.receiveMessage  = mc._handleIncomingRealtimeMessage;
        mc.onNewMessage    = mc._handleIncomingRealtimeMessage;
        debugLog('[messages-core] ✅ _handleIncomingRealtimeMessage, receiveMessage, onNewMessage exposed');
    }
    _exposeRealtimeEntryPoints();

    function startRealtimeSync() {
        setupRealtimeMessageListener();

        const realtimeToken = window.__PARENT_SESSION__?.token || SessionManager.getToken?.() || null;
        if (window.KynectaRealtime?.connect && realtimeToken) {
            // ✅ FIX: Attach .catch() immediately on the returned promise so any
            // rejection (including the normalised WebSocket Event errors) is always
            // handled — prevents "Uncaught (in promise)" in the console.
            window.KynectaRealtime.connect(realtimeToken).catch((err) => {
                console.warn('[messages] Realtime connect failed (will retry):', err && err.message || err);
            });
        }
        
        if (ChatManager && ChatManager.getActiveChat) {
            // FIX: was 3000ms (3s) causing massive console spam and duplicate fetches.
            // Now 30 000ms (30s) — only poll when tab is visible and chat is active.
            let _lastPollChatId = null;
            let _lastPollMsgCount = 0;
            // FIX (Forensic Audit P1): Store ID to prevent memory leak
            const _activeChatPollInterval = setInterval(() => {
                if (document.hidden) return;           // skip when tab not visible
                const activeChat = ChatManager.getActiveChat();
                if (!activeChat || !activeChat.id) return;
                if (String(activeChat.id).startsWith('pending_')) return;
                if (!navigator.onLine) return;
                if (!SessionManager.isAuthenticated?.()) return;
                // Skip if chat hasn't changed and message count is same
                const msgs = ChatManager.getMessages ? ChatManager.getMessages() : [];
                const msgCount = msgs.length;
                if (_lastPollChatId === activeChat.id && _lastPollMsgCount === msgCount) {
                    // Still poll but silently — don't hammer if nothing changed
                }
                _lastPollChatId = activeChat.id;
                _lastPollMsgCount = msgCount;
                ChatManager.fetchMessages(activeChat.id, { limit: 20, minFetchGap: 10000 }).catch(() => {});
            }, 30000);
            window.addEventListener('beforeunload', () => { clearInterval(_activeChatPollInterval); }, { once: true });
        }
    }

    async function loadCachedData() {
        try {
            const cachedUser = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_CACHE);
            if (cachedUser && cachedUser.id && typeof cachedUser.id === 'number' && cachedUser.id !== 0) {
                SessionStore.setUser(cachedUser);
            }
            
            const cachedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
            if (cachedChats?.conversations) {
                ChatManager.setConversations(cachedChats.conversations);
            }

            if (window.KynectaLocalStore?.getAllConversations) {
                try {
                    const idbConversations = await window.KynectaLocalStore.getAllConversations();
                    if (Array.isArray(idbConversations) && idbConversations.length > 0) {
                        const mergedConversations = [...ChatManager.getConversations(), ...idbConversations];
                        ChatManager.setConversations(mergedConversations);
                    }
                } catch (_) {}
            }
            
            const cachedFriends = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE);
            if (cachedFriends?.friends) {
                FriendManager.setFriends(cachedFriends.friends);
            }
            
            const uiState = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.UI_STATE);
            if (uiState?.lastChatId) {
                SafeStorage.set('lastChatId', uiState.lastChatId);
            }
        } catch (error) {
        }
    }
    
    function restoreLastChat() {
        // ✅ FIX B: Only auto-restore once per browser session.
        // Without this guard, every navigateToPage('messages') call re-opens
        // the chat panel, bypassing the sidebar entirely on fresh load.
        // Users expect to see the SIDEBAR first; they choose which chat to open.
        const SESSION_KEY = 'kyn_chat_restored_' + (SafeStorage.get('kyn_session_epoch') || '0');
        if (sessionStorage.getItem(SESSION_KEY)) {
            // Already restored this session — don't force-open the panel again.
            return;
        }
        sessionStorage.setItem(SESSION_KEY, '1');

        const lastChatId = SafeStorage.get('lastChatId');
        if (!lastChatId) return;

        // Give conversations 400ms to load from cache before trying
        let attempts = 0;
        const MAX_ATTEMPTS = 8;
        const poll = setInterval(() => {
            attempts++;
            const conv = ChatManager.getConversation
                ? ChatManager.getConversation(lastChatId)
                : null;
            if (conv) {
                clearInterval(poll);
                // ✅ FIX B2: Restore to sidebar-highlight only, not forced panel open.
                // Dispatch a custom event so the UI can highlight the chat in the list
                // without opening the panel. Panel opens only on explicit user click.
                window.dispatchEvent(new CustomEvent('kyn:restoreLastChat', {
                    detail: { chatId: lastChatId, conversation: conv }
                }));
                // Pre-load messages into memory so first click is instant
                ChatManager.fetchMessages?.(lastChatId, { background: true, minFetchGap: 0 }).catch(() => {});
            } else if (attempts >= MAX_ATTEMPTS) {
                clearInterval(poll);
            }
        }, 300);
    }

    // =============================================
    // CLEANUP
    // =============================================
    window.addEventListener('beforeunload', () => {
        if (ChatManager.getActiveChat()) {
            const input = document.getElementById('messageInput');
            if (input && input.value.trim()) {
                UIStateManager.saveDraft(ChatManager.getActiveChat().id, input.value.trim());
            }
        }
        
        TypingManager.stopTyping();
        
        // ✅ FIX: Flush ALL loaded conversations to localStorage on page unload/navigation.
        // Previously only the active conversation was saved; messages in other loaded chats
        // were held in memoryStore and lost when the user left the app.
        try {
            const allConvs = ChatManager.getConversations ? ChatManager.getConversations() : [];
            allConvs.forEach(function(conv) {
                try {
                    const cid = conv.id || conv.chatId;
                    if (!cid) return;
                    const msgs = ChatManager._messages
                        ? ChatManager._messages.filter(function(m) {
                            return String(m.chatId || m.conversationId || '') === String(cid);
                          })
                        : [];
                    if (msgs.length > 0) {
                        const _key = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${cid}`;
                        localStorage.setItem(_key, JSON.stringify(msgs));
                    }
                } catch (_) {}
            });
        } catch (_) {}

        // Also save the active conversation explicitly
        if (ChatManager.getActiveChat()) {
            try {
                const _activeKey = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`;
                SafeStorage.setJSON(_activeKey, ChatManager.getMessages());
                localStorage.setItem(_activeKey, JSON.stringify(ChatManager.getMessages()));
            } catch (e) {}
        }
        
        try {
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { 
                conversations: ChatManager.getConversations(), 
                timestamp: Date.now() 
            });
        } catch (e) {}
        
        try {
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE, {
                friends: FriendManager.getFriends(),
                timestamp: Date.now()
            });
        } catch (e) {}
    });

    // =============================================
    // INITIALIZATION
    // =============================================
    async function initialize() {
        debugLog('[INIT MODULE]', MODULE_NAME);
        debugLog(`[${MODULE_NAME}] 🚀 Messages Core v${MODULE_VERSION} (Stabilized Protocol | Real Data Only | Session Validation | UI Enhanced | Demo Data Included | openChatWithUser Added | Pending Chat Handling)`);
        
        try {
            setState(LIFECYCLE_STATES.BOOT, 'initialization_start');
            
            ModuleCoreController.init();
            ModuleLifecycleController.start();
            
            // FIX Bug 2: Pre-register the realtime message listener immediately on boot,
            // BEFORE the module reaches ACTIVE state. Without this, any socket event
            // (message:new, call:incoming, etc.) that arrives during the INITIALIZING →
            // ACTIVE window is silently dropped because the listener doesn't exist yet.
            // setupRealtimeMessageListener() is idempotent — calling it twice is safe.
            try { setupRealtimeMessageListener(); } catch(_earlyListenerErr) {}
            
            stateListeners.add((toState) => {
                if (toState === LIFECYCLE_STATES.ACTIVE) {
                    BootController.completeBoot();
                    debugLog(`[${MODULE_NAME}] ✅ Module ACTIVE - ready for user interaction`);
                    startRealtimeSync(); // ensures full sync triggers; listener already attached above
                }
            });
            
            debugLog(`[${MODULE_NAME}] ✅ Initialized - waiting for parent activation and valid session`);
            
            // Production requirement: never activate mock/demo data.
            setTimeout(() => {
                if (false) { // Demo bootstrap fully removed
                }
            }, 3000);
            
        } catch (error) {
            console.error(`[${MODULE_NAME}] Initialization error:`, error);
        }
    }

    // =============================================
    // PUBLIC API
    // =============================================
    const MessagesCore = {
        version: MODULE_VERSION,
        
        SessionStore,
        ChatManager,
        FriendManager,
        GroupManager,
        ParentConnectionManager,
        EventBus,
        Security: SECURITY,
        
        SecurityValidator,
        SessionManager,
        MessageDispatcher,
        HeartbeatClient,
        UIBridge,
        ModuleLifecycleController,
        ModuleCoreController,
        
        MessageHandler,
        ConversationManager,
        TypingManager,
        UIStateManager,
        UIFeatures,
        
        SecurityUtils,
        SafeStorage,
        Logger,
        
        getState: getLifecycleState,
        isReady: () => currentState === LIFECYCLE_STATES.ACTIVE && SessionManager.isAuthenticated(),
        isCoreReady: () => currentState === LIFECYCLE_STATES.ACTIVE && SessionManager.isAuthenticated(),
        getCurrentUser: () => SessionManager.getUser(),
        getCurrentUserId: () => SessionManager.getUserId(),
        getCurrentConversation: () => ChatManager.getActiveChat(),
        getConversations: () => ChatManager.getConversations(),
        getMessages: () => ChatManager.getMessages(),
        getFriends: () => FriendManager.getFriendListForChat(),
        getCurrentCategory: () => ChatManager.getCurrentCategory(),
        
        isAuthenticated: () => SessionManager.isAuthenticated(),
        
        getSecurityReport: () => SECURITY.getSecurityReport(),

        deleteConversation: function(chatId) {
            if (!chatId) return;
            const sid = String(chatId);

            // ── TOMBSTONE: persist deletion across all storage layers ────────
            const tombstone = {
                id: sid,
                entityType: 'conversation',
                deletedAt: Date.now(),
                syncVersion: Date.now(),
                origin: 'user_delete',
            };
            try {
                // 1. Legacy deleted list (backward compat)
                const _d = SafeStorage.getJSON('kynecta_deleted_chats_v8') || [];
                if (!_d.includes(sid)) { _d.push(sid); SafeStorage.setJSON('kynecta_deleted_chats_v8', _d); }

                // 2. Tombstone registry — version-aware, survives service worker
                // FIX (chat-resurrects-on-refresh): this used to write to
                // 'kynecta_tombstones_v1', but every read path that actually
                // checks for tombstones (AppCache.getAll() for chats/groups in
                // app.cache.js, and LocalMessageStore.saveConversation /
                // deleteConversation in localStore.messages.js) reads
                // 'nexopa_tombstones_v1'. Because the keys never matched, the
                // tombstone written here was invisible to every one of those
                // checks, so a deleted chat's row simply sat in IndexedDB
                // un-flagged and came back on the next refresh/hydration.
                const _tombstones = SafeStorage.getJSON('nexopa_tombstones_v1') || {};
                _tombstones[sid] = tombstone;
                SafeStorage.setJSON('nexopa_tombstones_v1', _tombstones);

                // 3. Clear all message caches for this conversation
                SafeStorage.remove(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${sid}`);
                try { localStorage.removeItem(`kynecta_messages_v8_${sid}`); } catch(_) {}
                try { localStorage.removeItem(`kynecta_conv_${sid}`); } catch(_) {}

                // 4. Invalidate any service worker cache for this conversation
                if ('caches' in window) {
                    caches.keys().then(names => {
                        names.forEach(name => {
                            caches.open(name).then(cache => {
                                cache.delete(`/api/chats/${sid}`);
                                cache.delete(`/api/messages?chatId=${sid}`);
                            });
                        });
                    }).catch(() => {});
                }

                // 5. Clear from IndexedDB offline queue
                window.__OfflineMessageQueue?.getPending?.()?.forEach(entry => {
                    if (String(entry.chatId) === sid) {
                        window.__OfflineMessageQueue.markDelivered(entry.id).catch(() => {});
                    }
                });

                // 6. Broadcast tombstone to other tabs
                try {
                    const bc = new BroadcastChannel('kynecta_sync');
                    bc.postMessage({ type: 'tombstone', entity: 'conversation', id: sid, ts: Date.now() });
                    bc.close();
                } catch(_) {}

                // 7. FIX: Clear from IndexedDB so refresh doesn't resurrect the chat
                // FIX (chat-resurrects-on-refresh): this previously called
                // window.KynectaDB.deleteMessages()/.deleteConversation() —
                // window.KynectaDB is never defined anywhere in this codebase,
                // so both calls threw immediately and were silently swallowed
                // by the surrounding try/catch. The actual IndexedDB chat row
                // was therefore NEVER removed; only the messages were (via the
                // KynectaLocalStore.deleteMessagesByChat call above). Call the
                // real store's deleteConversation(), which removes the chat
                // from IDB, deletes its messages, and writes the tombstone to
                // the correct key ('nexopa_tombstones_v1') that
                // getAllConversations()/getAll('chats') actually check.
                try {
                    if (window.KynectaLocalStore && typeof window.KynectaLocalStore.deleteConversation === 'function') {
                        window.KynectaLocalStore.deleteConversation(sid).catch(() => {});
                    } else if (window.KynectaLocalStore && typeof window.KynectaLocalStore.deleteMessagesByChat === 'function') {
                        window.KynectaLocalStore.deleteMessagesByChat(sid).catch(() => {});
                    }
                } catch(_) {}
            } catch(_) {}

            // ── Remove from memory ───────────────────────────────────────────
            ChatManager._conversations = (ChatManager._conversations || []).filter(c => String(c.id) !== sid);
            if (ChatManager._conversationsMap) { ChatManager._conversationsMap.delete(chatId); ChatManager._conversationsMap.delete(sid); }
            if (ChatManager._activeConversation && String(ChatManager._activeConversation.id) === sid) {
                ChatManager._activeConversation = null; ChatManager._messages = [];
            }
            ChatManager._saveToCache();
            ChatManager._notifySubscribers();

            // ── Tell backend to delete ────────────────────────────────────────
            makeApiRequest(`/chats/${sid}`, 'DELETE').catch(() => {});
        },

        multiSendSelectedChats: new Set(),
        getOrCreateConversationByUserId: (userId, userName) => 
            ConversationManager.getOrCreateConversationByUserId(userId, userName),
        subscribe: (callback) => stateListeners.add(callback),
        on: (event, callback) => EventBus.on(event, callback),
        off: (event, callback) => EventBus.off(event, callback),
        once: (event, callback) => EventBus.once(event, callback),
        
        sendMessage: (content, options) => MessageHandler.sendMessage(content, options),
        deleteMessage: (messageId, forEveryone) => MessageHandler.deleteMessage(messageId, forEveryone),
        editMessage: (messageId, newContent) => MessageHandler.editMessage(messageId, newContent),
        addReaction: (messageId, emoji, add) => MessageHandler.addReaction(messageId, emoji, add),
        forwardMessage: (messageId, targetConversationIds) => MessageHandler.forwardMessage(messageId, targetConversationIds),
        reportMessage: (messageId, reason) => MessageHandler.reportMessage(messageId, reason),
        searchMessages: (conversationId, query, options) => MessageHandler.searchMessages(conversationId, query, options),
        
        openConversation: (conversationId, options) => ConversationManager.openConversation(conversationId, options),
        fetchMessages: (conversationId, options) => ConversationManager.fetchMessages(conversationId, options),
        fetchConversations: () => ConversationManager.fetchConversations(),
        markAsRead: (conversationId) => ConversationManager.markAsRead(conversationId),
        createConversation: (participants, options) => ConversationManager.createConversation(participants, options),
        archiveConversation: (conversationId, archived) => ConversationManager.archiveConversation(conversationId, archived),
        blockUser: (userId, block) => ConversationManager.blockUser(userId, block),
        
        sendTyping: (conversationId, isTyping) => TypingManager.sendTyping(conversationId, isTyping),
        stopTyping: () => TypingManager.stopTyping(),
        getTypingUsers: (conversationId) => TypingManager.getTypingUsersForConversation(conversationId),
        
        openChatWithUser: (userId, userName, userAvatar) => openChatWithUser(userId, userName, userAvatar),
        setCurrentCategory: (category) => ChatManager.setCurrentCategory(category),
        renderChatsList: () => ChatManager.renderChatsList(),
        
        UI: {
            saveDraft: (conversationId, text, attachment) => UIStateManager.saveDraft(conversationId, text, attachment),
            getDraft: (conversationId) => UIStateManager.getDraft(conversationId),
            clearDraft: (conversationId) => UIStateManager.clearDraft(conversationId),
            
            setChatTheme: (conversationId, theme) => UIStateManager.setChatTheme(conversationId, theme),
            getChatTheme: (conversationId) => UIStateManager.getChatTheme(conversationId),
            
            toggleStarred: (messageId) => UIStateManager.toggleStarred(messageId),
            isStarred: (messageId) => UIStateManager.isStarred(messageId),
            getStarredMessages: () => UIStateManager.getStarredMessages(),
            
            updateSettings: (settings) => UIStateManager.updateSettings(settings),
            getSettings: () => UIStateManager.getSettings()
        },
        
        features: UIFeatures,
        
        formatMessageText: UIFeatures.formatMessageText,
        formatTime: UIFeatures.formatTime,
        formatLastSeen: UIFeatures.formatLastSeen,
        formatDate: UIFeatures.formatDate,
        formatDateTime: UIFeatures.formatDateTime,
        formatFileSize: UIFeatures.formatFileSize,
        escapeHtml: SecurityUtils.escapeHtml,
        escapeRegex: SecurityUtils.escapeRegex,
        sanitizeString: SecurityUtils.sanitizeString,
        
        getPendingMessageCount: () => MessageHandler.getPendingCount(),
        
        sendAction: (type, payload, options) => safeSend(type, payload, options),
        
        waitForBoot: () => BootController.waitForBoot(),
        
        getStats: () => ModuleCoreController.getStats(),
        
        reset: () => ModuleCoreController.reset(),
        
        debug: {
            getState: getLifecycleState,
            ParentConnectionManager,
            SafeStorage,
            Security: SECURITY,
            HeartbeatClient,
            SessionManager,
            messageQueue,
            flushQueue: flushMessageQueue,
            pendingRequests: () => Array.from(pendingRequests.keys()),
            lifecycleGuards: {
                canSendChildReady: (state) => window.__lifecycleCanSendChildReady(state),
                canPerformAction: (state) => window.__lifecycleCanPerformAction(state)
            }
        }
    };

    window.MessagesCore = MessagesCore;
    window.openChatWithUser = openChatWithUser;
    window.__MODULE_NAME__ = MODULE_NAME;
    window.__MODULE_VERSION__ = MODULE_VERSION;

    initialize();

    // FIX-014: Mark messages as read when the user returns to this tab.
    // Without this, messages received while the tab was hidden are never marked seen.
    document.addEventListener('visibilitychange', function() {
        // ✅ FIX: Flush messages to localStorage when app goes to background on mobile.
        // Mobile browsers may kill the page without firing beforeunload, but they
        // reliably fire visibilitychange+hidden. Without this, messages sent/received
        // while the chat was open disappear after the user switches apps.
        if (document.visibilityState === 'hidden') {
            try {
                const activeChat = ChatManager.getActiveChat && ChatManager.getActiveChat();
                if (activeChat) {
                    const _key = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${activeChat.id}`;
                    const _msgs = ChatManager.getMessages ? ChatManager.getMessages() : [];
                    if (_msgs.length > 0) {
                        localStorage.setItem(_key, JSON.stringify(_msgs));
                    }
                }
            } catch (_) {}
            return;
        }

        if (document.visibilityState !== 'visible') return;
        try {
            const cm = window.MessagesCore && window.MessagesCore.ConversationManager;
            const chatMgr = window.MessagesCore && window.MessagesCore.ChatManager;
            if (!cm || !chatMgr) return;
            const active = chatMgr.getActiveChat && chatMgr.getActiveChat();
            if (!active) return;
            const convId = active.id || active.chatId;
            if (!convId) return;
            if (typeof cm.markConversationRead === 'function') {
                cm.markConversationRead(convId);
            } else if (typeof cm.markRead === 'function') {
                cm.markRead(convId);
            }
        } catch (_) {}

        // PHASE15 FIX: Flush any messages that arrived while the user was on another screen.
        // app.realtime.socket.js persists incoming message:new events to kyn_pending_messages.
        // Here we process them so messages are never lost even if the chat panel was closed.
        _flushPendingLocalMessages();
    });

    // PHASE15 FIX: Flush pending messages that arrived while the user was away.
    // Called on visibilitychange AND on initial module load.
    function _flushPendingLocalMessages() {
        try {
            var _raw = localStorage.getItem('kyn_pending_messages');
            if (!_raw) return;
            var _pending = JSON.parse(_raw);
            if (!Array.isArray(_pending) || _pending.length === 0) return;
            // Clear the queue first so duplicate processing is impossible
            localStorage.removeItem('kyn_pending_messages');
            var chatMgr = window.MessagesCore && window.MessagesCore.ChatManager;
            if (!chatMgr || typeof chatMgr.addMessage !== 'function') {
                // ChatManager not ready — put them back for next flush
                try { localStorage.setItem('kyn_pending_messages', JSON.stringify(_pending)); } catch(_) {}
                return;
            }
            // Filter out messages older than 24 hours to prevent stale replays
            var _cutoff = Date.now() - 86400000;
            _pending.forEach(function(msg) {
                try {
                    if (msg._arrivedAt && msg._arrivedAt < _cutoff) return; // too old
                    chatMgr.addMessage(msg);
                } catch(_) {}
            });
            debugLog('[MessagesCore] PHASE15: Flushed', _pending.length, 'pending messages from localStorage');
        } catch (_) {}
    }
    // Flush on load (catches messages that arrived before this module loaded)
    setTimeout(_flushPendingLocalMessages, 1500);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MessagesCore;
    }

function applySettingToMessagesModule(section, key, value) {
    if (section === 'appearance') {
        if (key === 'theme') {
            // FIX (Phase 17 — single theme owner): delegate to
            // window.ThemeManager instead of painting independently.
            var theme = (value === 'dark' ? 'dark' : 'light');
            if (window.ThemeManager) window.ThemeManager.setTheme(theme);
            else {
                document.documentElement.setAttribute('data-theme', theme);
                document.body.setAttribute('data-theme', theme);
            }
        }
        if (key === 'fontSize') {
            if (window.ThemeManager) window.ThemeManager.setFontSize(parseInt(value, 10));
            else document.documentElement.style.fontSize = value + 'px';
        }
        if (key === 'language') { window.__appLanguage = value; document.documentElement.setAttribute('lang', value); }
        if (key === 'accentColor') document.documentElement.style.setProperty('--accent-color', value);
        if (key === 'compactMode') { document.documentElement.setAttribute('data-compact', value ? 'true' : 'false'); document.body.classList.toggle('compact-mode', !!value); }
        if (key === 'animationsEnabled' || key === 'animations') { document.documentElement.setAttribute('data-animations', value ? 'true' : 'false'); document.body.classList.toggle('no-animations', !value); }
    }
    if (section === 'privacy') {
        if (key === 'readReceipts') { window.__readReceiptsEnabled = value; document.documentElement.setAttribute('data-read-receipts', value ? 'true' : 'false'); }
        if (key === 'typingIndicators') { window.__typingIndicatorsEnabled = value; document.documentElement.setAttribute('data-typing-indicators', value ? 'true' : 'false'); }
        if (key === 'onlineStatus') window.__showOnlineStatus = value;
        if (key === 'lastSeen') window.__showLastSeen = value;
        if (key === 'whoCanAddMe') window.__whoCanAddMe = value;
        if (key === 'canMessageMe') window.__canMessageMe = value;
        if (key === 'contactDiscovery') window.__contactDiscovery = value;
        // FIX-SETTINGS-AUDIT: privacy.messageForwarding is supposed to gate the
        // messages module's own "forward message" action — it was in the schema
        // but never read anywhere in this module.
        if (key === 'messageForwarding') window.__messageForwardingEnabled = value;
    }
    if (section === 'notifications') {
        if (key === 'soundEnabled' || key === 'notificationSound') window.__notificationSoundEnabled = value;
        if (key === 'vibrationEnabled' || key === 'notificationVibration') window.__vibrationEnabled = value;
        if (key === 'messageNotifications' || key === 'enableNotifications') window.__messageNotificationsEnabled = value;
        if (key === 'groupNotifications') window.__groupNotificationsEnabled = value;
        if (key === 'callNotifications') window.__callNotificationsEnabled = value;
        if (key === 'mentionNotifications') window.__mentionNotificationsEnabled = value;
        if (key === 'desktopEnabled') window.__desktopNotificationsEnabled = value;
        // FIX-SETTINGS-AUDIT: these 3 exist in the settings schema
        // (notifications.enabled / .popupNotifications / .doNotDisturb) but the
        // messages module never read any of them — a master "notifications off"
        // or an active Do Not Disturb window had no effect on message notifications.
        if (key === 'enabled') window.__notificationsMasterEnabled = value;
        if (key === 'popupNotifications') window.__popupNotificationsEnabled = value;
        if (key === 'doNotDisturb') window.__doNotDisturb = value;
    }
    if (section === 'chat') {
        if (key === 'enterToSend' || key === 'enterKeySends') window.__enterToSend = value;
        if (key === 'messageFontSize' || key === 'fontSize') {
            var sizeMap = { small: '13px', medium: '15px', large: '18px' };
            document.documentElement.style.setProperty('--message-font-size', sizeMap[value] || '15px');
        }
        if (key === 'showTimestamps') { window.__showTimestamps = value; document.documentElement.setAttribute('data-show-timestamps', value ? 'true' : 'false'); }
        if (key === 'messagePreviews') window.__messagePreviews = value;
        if (key === 'confirmSend') window.__confirmSend = value;
        if (key === 'autoCorrect') window.__autoCorrect = value;
        if (key === 'mediaAutoDownload' || key === 'autoDownloadMedia') {
            window.__mediaAutoDownload = value;
            document.documentElement.setAttribute('data-chat-auto-download', value ? 'true' : 'false');
        }
        if (key === 'wallpaper') document.documentElement.setAttribute('data-chat-wallpaper', value);
        if (key === 'bubbleStyle') document.documentElement.setAttribute('data-chat-bubble-style', value);
        if (key === 'messageHistory') window.__messageHistory = value;
        if (key === 'showReadReceipts') { window.__readReceiptsEnabled = value; document.documentElement.setAttribute('data-read-receipts', value ? 'true' : 'false'); }
        if (key === 'allowReactions') { window.__allowReactions = value; document.documentElement.setAttribute('data-allow-reactions', value ? 'true' : 'false'); }
        // FIX-SETTINGS-AUDIT: these were all in the chat settings schema but
        // never read anywhere in the messages module.
        if (key === 'mediaDownload') window.__mediaDownloadPref = value; // 'wifi' | 'always' | 'never'
        if (key === 'saveMedia') window.__saveMediaToDevice = value;
        if (key === 'disappearingMessages') {
            window.__disappearingMessages = value; // 'off' | '24h' | '7d' | ...
            document.documentElement.setAttribute('data-disappearing-messages', value);
        }
        // chat.aiFeatures is a nested object — SETTINGS_UPDATED delivers it as a
        // single key ('aiFeatures') whose value is the whole sub-object, while a
        // single-toggle SETTING_CHANGED may deliver it as a dotted key
        // ('aiFeatures.smartReplies'). Handle both shapes.
        if (key === 'aiFeatures' && value && typeof value === 'object') {
            window.__aiSmartReplies       = value.smartReplies;
            window.__aiMessageTranslation = value.messageTranslation;
            window.__aiChatSummarization  = value.chatSummarization;
            window.__aiSpamDetection      = value.spamDetection;
        }
        if (key === 'aiFeatures.smartReplies')       window.__aiSmartReplies       = value;
        if (key === 'aiFeatures.messageTranslation')  window.__aiMessageTranslation = value;
        if (key === 'aiFeatures.chatSummarization')   window.__aiChatSummarization  = value;
        if (key === 'aiFeatures.spamDetection')       window.__aiSpamDetection      = value;
    }
    if (section === 'profile') {
        if (key === 'displayName') window.__currentUserDisplayName = value;
        if (key === 'photoUrl') window.__currentUserAvatar = value;
        if (key === 'lastSeen') window.__showLastSeen = value;
        if (key === 'profileVisibility') window.__profileVisibility = value;
        if (key === 'currentMood') window.__currentMood = value;
    }
    if (section === 'security') {
        // FIX (Security settings audit): this module runs inside an
        // iframe and has no access to the auth session or logout — writing
        // __sessionTimeout here did nothing because nothing (in this frame
        // or any other) ever read it. The actual inactivity timeout is now
        // enforced by SESSION_COORDINATOR in the parent frame's
        // app.core.session.js, which reads the saved value straight from
        // localStorage('knecta_settings_cache').security.sessionTimeout.
        if (key === 'sessionTimeout') window.__sessionTimeout = value; // kept for any legacy readers; not the enforcement path
    }
    if (section === 'mood') {
        if (key === 'currentMood') { window.__currentMood = value; document.documentElement.setAttribute('data-mood', value); }
        if (key === 'autoMoodDetection') window.__autoMoodDetection = value;
        if (key === 'shareMoodStatus') window.__shareMoodStatus = value;
        if (key === 'showMoodTo') window.__showMoodTo = value;
    }
    if (section === 'advanced') {
        if (key === 'developerMode' || key === 'developerTools') window.__developerMode = value;
        if (key === 'debugLogging' || key === 'debugMode') window.__debugLogging = value;
        if (key === 'performanceMode') { window.__performanceMode = value; document.documentElement.setAttribute('data-performance-mode', value ? 'true' : 'false'); }
        if (key === 'dataSaver') window.__dataSaver = value;
        if (key === 'offlineMode') window.__offlineMode = value;
        if (key === 'reduceMotion') { document.documentElement.setAttribute('data-reduce-motion', value ? 'true' : 'false'); document.body.classList.toggle('reduce-motion', !!value); }
        if (key === 'experimentalFeatures') window.__experimentalFeatures = value;
    }
    if (section === 'storage') {
        if (key === 'autoClearCache') window.__autoClearCache = value;
    }
    if (section === 'status') {
        if (key === 'whoCanViewMyStatus') window.__whoCanViewMyStatus = value;
        if (key === 'autoExpireStatus') window.__autoExpireStatus = value;
        if (key === 'allowStatusReplies') window.__allowStatusReplies = value;
        if (key === 'showStatusTo') window.__showStatusTo = value;
    }
}
// =============================================
// SETTINGS CACHE BOOTSTRAP - OFFLINE-FIRST
// Reads knecta_settings_cache from localStorage at startup so settings
// are applied instantly, before the parent sends SETTINGS_UPDATED.
// =============================================
(function bootstrapSettingsFromCache() {
    try {
        var cached = localStorage.getItem('knecta_settings_cache');
        if (!cached) return;
        var parsed = JSON.parse(cached);
        // Accept both {data:{...}} and flat {section:{...}} shapes
        var settings = (parsed && parsed.data) ? parsed.data : parsed;
        if (!settings || typeof settings !== 'object') return;
        // Skip if stale (> 24 hours)
        if (parsed.timestamp && (Date.now() - parsed.timestamp) > 86400000) return;
        Object.entries(settings).forEach(function(sectionEntry) {
            var section = sectionEntry[0], sectionVal = sectionEntry[1];
            if (!sectionVal || typeof sectionVal !== 'object') return;
            Object.entries(sectionVal).forEach(function(keyEntry) {
                var key = keyEntry[0];
                // FIX (theme-sparking-on-refresh bug): this 'knecta_settings_cache'
                // blob can be up to 24h stale — a snapshot from the last time the
                // FULL settings object was fetched/saved, not necessarily the
                // theme/font-size the user most recently picked. window.ThemeManager
                // (js/theme.engine.js, loaded synchronously before this script) has
                // already painted the correct, always-current values from the
                // authoritative 'app_theme'/'app_font_size' keys before this cold-boot
                // replay ever runs. Re-applying this cache's appearance values here
                // could silently flip the already-correct theme back to a stale one —
                // exactly the visible spark/blink on every reload. Skip them; every
                // other cached setting still applies normally.
                if (section === 'appearance' && (key === 'theme' || key === 'fontSize' || key === 'accentColor')) return;
                try { applySettingToMessagesModule(section, key, keyEntry[1]); } catch(e) {}
            });
        });
        debugLog('[messages-core] ✅ Settings bootstrapped from cache');
    } catch(e) {}
    // Also listen for online event to re-request fresh settings
    window.addEventListener('online', function() {
        try {
            window.parent && window.parent.postMessage({ type: 'CHILD_READY', module: 'messages', source: 'messages', timestamp: Date.now() }, '*');
        } catch(e) {}
    });
})();

// =============================================
// FIX (NOTIFICATIONS-ONLY-LIVE-IN-CALLS-AND-GROUPS): the bootstrap IIFE above
// only applies settings ONCE, from a (possibly 24h-stale) localStorage cache,
// at page load. calls-ui.js and group-ui.js both also call
// window.AppSettings.subscribe(...) so they keep receiving every LIVE change
// for as long as the page stays open — this module never did, so toggling
// e.g. "Notification Sound" in Settings while the app was already running
// had no effect here (window.__notificationSoundEnabled just stayed at
// whatever the cache said at boot) even though it worked immediately for
// Calls/Groups. Mirroring that same subscription here fixes messages parity.
// =============================================
function _wireMessagesLiveSettingsSubscription() {
    if (!window.AppSettings || typeof window.AppSettings.subscribe !== 'function') return;
    if (window.__messagesLiveSettingsSubscribed) return;
    window.__messagesLiveSettingsSubscribed = true;
    window.AppSettings.subscribe(function(settings, path, value) {
        try {
            if (path && path !== '*') {
                const parts = path.split('.');
                const section = parts[0];
                const key = parts.slice(1).join('.');
                applySettingToMessagesModule(section, key, value);
            } else if (settings && typeof settings === 'object') {
                Object.entries(settings).forEach(function([sec, secVal]) {
                    if (secVal && typeof secVal === 'object') {
                        Object.entries(secVal).forEach(function([k, v]) {
                            applySettingToMessagesModule(sec, k, v);
                        });
                    }
                });
            }
        } catch (err) {
            console.warn('[messages-core] Live settings subscription error:', err);
        }
    });
}
if (window.AppSettings) {
    _wireMessagesLiveSettingsSubscription();
} else {
    window.addEventListener('appSettingsReady', _wireMessagesLiveSettingsSubscription, { once: true });
}