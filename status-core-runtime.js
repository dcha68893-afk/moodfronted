
// =============================================
// STATUS-CORE-RUNTIME.JS
// UI bridge, module core controller, local-storage load/apply, theme,
// storage-usage calc, mood text/color, settings save/update, UI init,
// safe-load helpers, token/auth notifications, diagnostics agent,
// initializeCore() main entry point, and the DOMContentLoaded auto-start.
// Must load LAST, after status-core-state.js and status-core-transport.js.
// Loaded as a plain classic <script> (no type="module").
// =============================================

// =============================================
// UI BRIDGE
// =============================================
const CoreUIBridge = {
    _listeners: new Map(),
    _domEvents: new Map(),
    _initialized: false,
    _silent: true,
    
    init() {
        if (this._initialized) return this;
        initLog('CoreUIBridge initializing');
        this._setupDefaultListeners();
        this._initialized = true;
        successLog('CoreUIBridge initialized');
        return this;
    },
    
    _setupDefaultListeners() {
        this.register('updateSetting', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) {
                errorLog('Cannot update setting: auth not ready');
                return { success: false, error: 'Auth not ready' };
            }
            
            try {
                const result = await SettingsState.update(data.section, data.key, data.value);
                return result;
            } catch (error) {
                errorLog('Error updating setting:', error);
                return { success: false, error: error.message };
            }
        });
        
        this.register('saveSettings', async () => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) {
                return { success: false, error: 'Auth not ready' };
            }
            
            try {
                await saveSettings();
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
        
        this.register('resetSettings', async () => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) {
                return { success: false, error: 'Auth not ready' };
            }
            
            try {
                await SettingsState.reset();
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
        
        this.register('loadSettings', async () => {
            if (currentState !== LifecycleState.ACTIVE) {
                return { success: false, error: 'Module not active' };
            }
            
            if (!coreAuthState) {
                return { success: false, error: 'Auth not ready' };
            }
            
            try {
                const settings = await SettingsState.load();
                return { success: true, data: settings };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
        
        this.register('sendMessage', (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            MessageTransport.send('SEND_MESSAGE', data);
        });
        
        this.register('updateProfile', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('profile', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updatePrivacy', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('privacy', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateNotifications', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('notifications', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateAppearance', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('appearance', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateSecurity', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('security', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateChat', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('chat', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateFriends', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('friends', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateGroups', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('groups', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateCalls', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('calls', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateStatus', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('status', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateStorage', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('storage', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateMood', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('mood', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateAdvanced', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('advanced', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateBackup', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('backup', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateDanger', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await updateSetting('danger', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('logout', async () => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await handleLogout();
            } catch (error) {}
        });
        
        this.register('terminateSession', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await terminateSession(data.sessionId);
            } catch (error) {}
        });
        
        this.register('terminateAllSessions', async () => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await terminateAllSessions();
            } catch (error) {}
        });
        
        this.register('unblockUser', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await unblockUser(data.userId);
            } catch (error) {}
        });
        
        this.register('clearChatCache', async () => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await clearChatCache();
            } catch (error) {}
        });
        
        this.register('clearMediaCache', async () => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            try {
                await clearMediaCache();
            } catch (error) {}
        });
    },
    
    register(event, handler) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(handler);
        return this;
    },
    
    unregister(event, handler) {
        const handlers = this._listeners.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        }
        return this;
    },
    
    trigger(event, data) {
        const handlers = this._listeners.get(event) || [];
        handlers.forEach(handler => {
            try {
                handler(data);
            } catch (e) {
                errorLog(`Error in UI bridge handler for ${event}:`, e);
            }
        });
        return handlers.length > 0;
    },
    
    attachDomEvent(elementId, eventType, bridgeEvent, transform = null) {
        const element = document.getElementById(elementId);
        if (!element) return this;
        
        const handler = (domEvent) => {
            if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
            const data = transform ? transform(domEvent) : { value: domEvent.target.value };
            this.trigger(bridgeEvent, data);
        };
        
        element.addEventListener(eventType, handler);
        
        if (!this._domEvents.has(elementId)) {
            this._domEvents.set(elementId, []);
        }
        this._domEvents.get(elementId).push({ eventType, handler, bridgeEvent });
        
        return this;
    },
    
    detachDomEvents(elementId) {
        const events = this._domEvents.get(elementId);
        if (!events) return this;
        
        const element = document.getElementById(elementId);
        if (element) {
            events.forEach(({ eventType, handler }) => {
                element.removeEventListener(eventType, handler);
            });
        }
        
        this._domEvents.delete(elementId);
        return this;
    },
    
    detachAll() {
        this._domEvents.forEach((events, elementId) => {
            this.detachDomEvents(elementId);
        });
        this._domEvents.clear();
        this._listeners.clear();
    },
    
    getDiagnostics() {
        return {
            listenersCount: this._listeners.size,
            domEventsCount: this._domEvents.size,
            initialized: this._initialized
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

CoreUIBridge.init();

// =============================================
// MODULE CORE CONTROLLER
// =============================================
const ModuleCoreController = {
    _initialized: false,
    _startTime: null,
    _components: new Map(),
    _listeners: new Set(),
    _silent: true,
    
    init() {
        initLog('ModuleCoreController initializing');
        this._registerComponents();
        successLog('ModuleCoreController initialized');
        return this;
    },
    
    _registerComponents() {
        this._components.set('environment', IframeEnvironment);
        this._components.set('storage', SafeStorage);
        this._components.set('compatibility', CompatibilityBridge);
        this._components.set('origin', OriginAdapter);
        this._components.set('governor', StartupGovernor);
        this._components.set('transport', IframeTransport);
        this._components.set('heartbeat', HeartbeatClient);
        this._components.set('session', SessionClient);
        this._components.set('reliability', ReliabilityLayer);
        this._components.set('dispatcher', MessageDispatcher);
        this._components.set('security', SecurityValidator);
        this._components.set('connection', ParentConnectionManager);
        this._components.set('handshake', HandshakeManager);
        this._components.set('lifecycle', ModuleLifecycleController);
        this._components.set('recovery', RecoveryManager);
        this._components.set('ui', CoreUIBridge);
        this._components.set('api', ApiCore);
        this._components.set('navigation', NavigationGuard);
        this._components.set('failsafe', CoreUIFailsafe);
        this._components.set('coordinator', MultiModuleCoordinator);
        this._components.set('reliabilityEngine', ReliabilityEngine);
        this._components.set('settingsState', SettingsState);
    },
    
    async start() {
        if (this._initialized) return this;
        
        this._startTime = Date.now();
        this.emit('starting', { timestamp: this._startTime });
        
        try {
            this.emit('component_starting', { component: 'environment' });
            IframeEnvironment.detect();
            
            this.emit('component_starting', { component: 'security' });
            SecurityValidator.init();
            
            this.emit('component_starting', { component: 'connection' });
            ParentConnectionManager.init();
            
            this.emit('component_starting', { component: 'dispatcher' });
            MessageDispatcher.init();
            
            this.emit('component_starting', { component: 'reliability' });
            ReliabilityLayer.init();
            
            this.emit('component_starting', { component: 'handshake' });
            HandshakeManager.init();
            
            this.emit('component_starting', { component: 'session' });
            SessionClient.init();
            
            this.emit('component_starting', { component: 'ui' });
            
            this.emit('component_starting', { component: 'lifecycle' });
            ModuleLifecycleController.start();
            
            this._initialized = true;
            this.emit('started', { timestamp: Date.now() });
            
        } catch (error) {
            this.emit('error', { error: error.message });
            ModuleLifecycleController.error(error);
        }
        
        return this;
    },
    
    stop() {
        ModuleLifecycleController.stop();
        HeartbeatClient.stop();
        clearAllTimers();
        this._initialized = false;
        this.emit('stopped', { timestamp: Date.now() });
        return this;
    },
    
    getComponent(name) {
        return this._components.get(name);
    },
    
    isInitialized() {
        return this._initialized;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getDiagnostics() {
        const diag = {
            initialized: this._initialized,
            uptime: this._startTime ? Date.now() - this._startTime : 0,
            components: {}
        };
        
        this._components.forEach((component, name) => {
            if (component.getDiagnostics) {
                diag.components[name] = component.getDiagnostics();
            }
        });
        
        return diag;
    },
    
    setSilent(silent) {
        this._silent = silent;
        this._components.forEach(component => {
            if (component.setSilent) {
                component.setSilent(silent);
            }
        });
    }
};

ModuleCoreController.init();

// =============================================
// CORE DATA STORAGE
// =============================================
const coreData = {
    friendsList: [],
    groupsList: [],
    chatHistory: [],
    notifications: [],
    settings: null,
    user: null
};

// =============================================
// EXPORT SETTINGS_MENU
// =============================================
const SETTINGS_MENU = [
    { id: 'profile', icon: 'fas fa-user', title: 'Profile' },
    { id: 'security', icon: 'fas fa-shield-alt', title: 'Security' },
    { id: 'privacy', icon: 'fas fa-lock', title: 'Privacy' },
    { id: 'chat', icon: 'fas fa-comments', title: 'Chat' },
    { id: 'friends', icon: 'fas fa-user-friends', title: 'Friends' },
    { id: 'groups', icon: 'fas fa-users', title: 'Groups' },
    { id: 'calls', icon: 'fas fa-phone', title: 'Calls' },
    { id: 'status', icon: 'fas fa-circle', title: 'Status' },
    { id: 'notifications', icon: 'fas fa-bell', title: 'Notifications' },
    { id: 'appearance', icon: 'fas fa-palette', title: 'Appearance' },
    { id: 'storage', icon: 'fas fa-database', title: 'Storage' },
    { id: 'mood', icon: 'fas fa-smile', title: 'Mood' },
    { id: 'advanced', icon: 'fas fa-cogs', title: 'Advanced' },
    { id: 'backup', icon: 'fas fa-cloud-upload-alt', title: 'Backup & Restore' },
    { id: 'danger', icon: 'fas fa-exclamation-triangle', title: 'Danger Zone', danger: true }
];

// =============================================
// PARENT MESSAGE TYPES
// =============================================
const PARENT_MESSAGE_TYPES = {
    READY: 'READY',
    ACK: 'ACK',
    SESSION: 'SESSION',
    DATA: 'DATA',
    ERROR: 'ERROR',
    HEARTBEAT: 'HEARTBEAT',
    STATUS: 'STATUS',
    HANDSHAKE: 'HANDSHAKE',
    SESSION_REQUEST: 'SESSION_REQUEST',
    SESSION_RESPONSE: 'SESSION_RESPONSE',
    SESSION_UPDATE: 'SESSION_UPDATE',
    CHILD_READY: 'CHILD_READY',
    PARENT_READY: 'PARENT_READY',
    AUTH_READY: 'AUTH_READY',
    AUTH_ERROR: 'AUTH_ERROR',
    AUTH_LOST: 'AUTH_LOST',
    LOGOUT: 'LOGOUT',
    REFRESH_DATA: 'REFRESH_DATA',
    UPDATE_DATA: 'UPDATE_DATA',
    CORE_READY: 'CORE_READY',
    IFRAME_AUTH_STATE: 'IFRAME_AUTH_STATE',
    IFRAME_AUTH_ERROR: 'IFRAME_AUTH_ERROR',
    CHILD_CLOSING: 'CHILD_CLOSING',
    
    PING: 'PING',
    PONG: 'PONG',
    
    SETTINGS_UPDATED: 'SETTINGS_UPDATED',
    SETTINGS_LOAD_REQUEST: 'SETTINGS_LOAD_REQUEST',
    SETTINGS_LOAD_RESPONSE: 'SETTINGS_LOAD_RESPONSE',
    SETTINGS_UPDATE_CONFIRMED: 'SETTINGS_UPDATE_CONFIRMED',
    SETTINGS_PROFILE_UPDATED: 'SETTINGS_PROFILE_UPDATED',
    SETTINGS_PRIVACY_UPDATED: 'SETTINGS_PRIVACY_UPDATED',
    SETTINGS_NOTIFICATIONS_UPDATED: 'SETTINGS_NOTIFICATIONS_UPDATED',
    SETTINGS_APPEARANCE_UPDATED: 'SETTINGS_APPEARANCE_UPDATED',
    SETTINGS_SECURITY_UPDATED: 'SETTINGS_SECURITY_UPDATED',
    SETTINGS_STORAGE_UPDATED: 'SETTINGS_STORAGE_UPDATED',
    SETTINGS_MOOD_UPDATED: 'SETTINGS_MOOD_UPDATED',
    USER_BLOCKED: 'USER_BLOCKED',
    USER_UNBLOCKED: 'USER_UNBLOCKED',
    SESSION_TERMINATED: 'SESSION_TERMINATED',
    ALL_SESSIONS_TERMINATED: 'ALL_SESSIONS_TERMINATED',
    PROFILE_PHOTO_UPDATED: 'PROFILE_PHOTO_UPDATED',
    PASSWORD_CHANGED: 'PASSWORD_CHANGED',
    DATA_EXPORT_REQUESTED: 'DATA_EXPORT_REQUESTED',
    ACCOUNT_DELETION_REQUESTED: 'ACCOUNT_DELETION_REQUESTED',
    CACHE_CLEARED: 'CACHE_CLEARED',
    SETTINGS_DATA: 'SETTINGS_DATA',
    SETTINGS_FETCH: 'SETTINGS_FETCH',
    SETTINGS_FETCH_ERROR: 'SETTINGS_FETCH_ERROR',
    SETTINGS_UPDATE: 'SETTINGS_UPDATE',
    SETTINGS_UPDATE_ERROR: 'SETTINGS_UPDATE_ERROR',
    SETTINGS_GLOBAL_UPDATE: 'SETTINGS_GLOBAL_UPDATE'
};

// =============================================
// LOAD FROM LOCAL STORAGE
// =============================================
async function loadFromLocalStorage() {
    try {
        const cachedUser = SafeStorage.getJSON('current_user', null);
        if (cachedUser) {
            const sessionData = {
                userId: cachedUser.id || cachedUser.userId,
                token: null,
                user: cachedUser
            };
            if (__isValidSession(sessionData)) {
                coreCurrentUser = cachedUser;
                coreData.user = cachedUser;
                window.session.user = cachedUser;
                if (DEBUG) console.log('[settings-core] ✅ Loaded cached user:', cachedUser.displayName);
            } else {
                console.warn('[settings-core] ⚠️ Cached user invalid, not loading');
            }
        }
        
        const savedSettings = SafeStorage.getJSON('user_settings', null);
        if (savedSettings) {
            userSettings = savedSettings;
            coreData.settings = savedSettings;
            SettingsState.data = savedSettings;
            SettingsState.loaded = true;
            
            SettingsStore.load({
                account: savedSettings.profile || {},
                privacy: savedSettings.privacy || {},
                notifications: savedSettings.notifications || {},
                appearance: savedSettings.appearance || {}
            });
        } else {
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            coreData.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            SettingsState.data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            
            SettingsStore.load({
                account: DEFAULT_SETTINGS.profile || {},
                privacy: DEFAULT_SETTINGS.privacy || {},
                notifications: DEFAULT_SETTINGS.notifications || {},
                appearance: DEFAULT_SETTINGS.appearance || {}
            });
        }
        
        Object.keys(DEFAULT_SETTINGS).forEach(section => {
            if (!userSettings[section]) {
                userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
            }
        });
        
        calculateStorageUsage();
        return true;
    } catch (error) {
        if (DEBUG) console.log('[settings-core] ⚠️ Error loading from localStorage:', error);
        userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        coreData.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        SettingsState.data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        
        SettingsStore.load({
            account: DEFAULT_SETTINGS.profile || {},
            privacy: DEFAULT_SETTINGS.privacy || {},
            notifications: DEFAULT_SETTINGS.notifications || {},
            appearance: DEFAULT_SETTINGS.appearance || {}
        });
        return false;
    }
}

// =============================================
// APPLY THEME
// =============================================
function applyTheme(theme) {
    if (!theme) return;
    if (currentState !== LifecycleState.ACTIVE) return;

    try {
        // Paint + persist now go through the single canonical engine
        // (js/theme.engine.js / window.ThemeManager) instead of this file
        // keeping its own copy of the same data-theme/localStorage logic.
        const resolved = window.ThemeManager ? window.ThemeManager.setTheme(theme) : (theme === 'dark' ? 'dark' : 'light');
        if (!window.ThemeManager) {
            const root = document.documentElement;
            root.setAttribute('data-theme', resolved);
            root.classList.toggle('theme-dark', resolved === 'dark');
            root.classList.toggle('dark-theme', resolved === 'dark');
            try { (window.ThemeManager ? window.ThemeManager.setTheme(resolved) : localStorage.setItem('app_theme', resolved)); } catch (_) {}
        }

        const event = new CustomEvent('themeApplied', {
            detail: { theme, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    } catch (error) {}
}

function dispatchSettingsLoadedEvent() {
    try {
        const event = new CustomEvent('settingsLoaded', {
            detail: {
                settings: userSettings,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    } catch (error) {}
}

function disableSettingsControls() {
    const event = new CustomEvent('settingsControlsDisabled', {
        detail: {
            timestamp: Date.now(),
            reason: 'no_session'
        }
    });
    window.dispatchEvent(event);
}

// =============================================
// CALCULATE STORAGE USAGE
// =============================================
function calculateStorageUsage() {
    try {
        if (!userSettings || !userSettings.storage) return 0;
        const chatSize = userSettings.storage.storageBreakdown?.chats || 0;
        const mediaSize = userSettings.storage.storageBreakdown?.media || 0;
        const otherSize = userSettings.storage.storageBreakdown?.other || 0;
        userSettings.storage.totalStorageUsed = chatSize + mediaSize + otherSize;
        userSettings.storage.chatCacheSize = chatSize;
        userSettings.storage.mediaCacheSize = mediaSize;
        userSettings.storage.otherCacheSize = otherSize;
        return userSettings.storage.totalStorageUsed;
    } catch (error) {
        return 0;
    }
}

// =============================================
// FORMAT STORAGE SIZE
// =============================================
function formatStorageSize(bytes) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// =============================================
// GET MOOD TEXT
// =============================================
function getMoodText(mood) {
    const moodTexts = {
        neutral: 'Neutral',
        happy: 'Happy',
        calm: 'Calm',
        energetic: 'Energetic',
        focused: 'Focused',
        relaxed: 'Relaxed',
        stressed: 'Stressed',
        tired: 'Tired',
        excited: 'Excited'
    };
    return moodTexts[mood] || 'Neutral';
}

// =============================================
// GET MOOD COLOR
// =============================================
function getMoodColor(mood) {
    const colors = {
        neutral: '#A9A9A9',
        happy: '#FFD700',
        calm: '#4A90E2',
        energetic: '#FF6B6B',
        focused: '#7B68EE',
        relaxed: '#4ECDC4',
        stressed: '#FF8C00',
        tired: '#808080',
        excited: '#FF1493'
    };
    return colors[mood] || '#A9A9A9';
}

// =============================================
// LOAD USER DATA - USES authorizedRequest
// =============================================
async function loadUserData() {
    if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
    
    try {
        const response = await authorizedRequest('/api/profile', { method: 'GET' });
        if (response.success && response.data) {
            const user = response.data.user || response.data;
            if (user) {
                const sessionData = {
                    userId: user.id || user.userId,
                    token: null,
                    user: user
                };
                if (__isValidSession(sessionData)) {
                    coreCurrentUser = user;
                    coreData.user = user;
                    window.session.user = user;
                    SafeStorage.setJSON('current_user', coreCurrentUser);
                    updateUserUI();
                } else {
                    console.warn('[settings-core] ⚠️ Loaded user data invalid');
                }
            }
        }
    } catch (error) {
        console.error('[settings-core] Error loading user data:', error);
    }
}

// =============================================
// LOAD ACTIVE SESSIONS - USES authorizedRequest
// =============================================
async function loadActiveSessions() {
    if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
    
    try {
        const response = await authorizedRequest('/api/auth/sessions', { method: 'GET' });
        if (response.success && response.data) {
            activeSessions = response.data.sessions || response.data || [];
            
            const event = new CustomEvent('activeSessionsLoaded', {
                detail: { sessions: activeSessions, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    } catch (error) {
        console.error('[settings-core] Error loading active sessions:', error);
    }
}

// =============================================
// LOAD BLOCKED USERS - USES authorizedRequest
// =============================================
async function loadBlockedUsers() {
    if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
    
    try {
        const response = await authorizedRequest('/api/users/blocked', { method: 'GET' });
        if (response.success && response.data) {
            blockedUsers = response.data.blockedUsers || response.data || [];
            
            const event = new CustomEvent('blockedUsersLoaded', {
                detail: { users: blockedUsers, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    } catch (error) {
        console.error('[settings-core] Error loading blocked users:', error);
    }
}

// =============================================
// LOAD USER CONTACTS - USES authorizedRequest
// =============================================
async function loadUserContacts() {
    if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
    
    try {
        const response = await authorizedRequest('/api/friends/contacts', { method: 'GET' });
        if (response.success && response.data) {
            userContacts = response.data.contacts || response.data || [];
            
            const event = new CustomEvent('userContactsLoaded', {
                detail: { contacts: userContacts, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    } catch (error) {
        console.error('[settings-core] Error loading contacts:', error);
    }
}

// =============================================
// LOAD USER GROUPS - USES authorizedRequest
// =============================================
async function loadUserGroups() {
    if (currentState !== LifecycleState.ACTIVE || !coreAuthState) return;
    
    try {
        const response = await authorizedRequest('/api/groups', { method: 'GET' });
        if (response.success && response.data) {
            userGroups = response.data.groups || response.data || [];
            coreData.groupsList = userGroups;
            
            const event = new CustomEvent('userGroupsLoaded', {
                detail: { groups: userGroups, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    } catch (error) {
        console.error('[settings-core] Error loading groups:', error);
    }
}

// =============================================
// UPDATE SETTING - REAL BACKEND PERSISTENCE
// =============================================
async function updateSetting(section, key, value) {
    // No connection/auth gate - always allow updates
    return await SettingsState.update(section, key, value);
}

// =============================================
// SAVE ALL SETTINGS
// =============================================
async function saveSettings() {
    try {
        // Always save to localStorage first (works offline/standalone)
        SafeStorage.setJSON('user_settings', userSettings);
        coreData.settings = userSettings;
        SettingsState._saveToCache();

        // Push full settings into AppSettings (single source of truth)
        if (window.AppSettings) {
            window.AppSettings.merge(userSettings);
        }
        
        if (userSettings.appearance) {
            applyTheme(userSettings.appearance.theme || 'light');
        }
        
        // If offline, queue the entire settings object for later sync
        if (!OfflineQueue.isOnline()) {
            // Queue each setting individually
            for (const [section, values] of Object.entries(userSettings)) {
                if (values && typeof values === 'object') {
                    for (const [key, value] of Object.entries(values)) {
                        OfflineQueue.enqueue(section, key, value);
                    }
                }
            }
            console.log(`[${MODULE_NAME}] 📦 Queued settings for offline sync`);
        } else {
            // If online, try to sync all pending queue items
            try {
                await OfflineQueue.syncAll();
            } catch (e) {
                console.warn(`[${MODULE_NAME}] ⚠️ Could not sync queue on save:`, e.message);
            }
        }
        
        // Broadcast to parent frame (fire-and-forget — ok if no parent)
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'SETTINGS_UPDATED',
                    module: MODULE_NAME,
                    settings: userSettings,
                    timestamp: Date.now()
                }, '*');
            }
        } catch (e) { /* no parent — that's fine */ }
        
        // Also broadcast to all frames in the same window (chat, etc.)
        try {
            window.dispatchEvent(new CustomEvent('settingsUpdated', {
                detail: { settings: userSettings, timestamp: Date.now() }
            }));
        } catch (e) {}
        
        unsavedChanges = false;
        
        const event = new CustomEvent('settingsSaved', {
            detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);
        
        return true;
    } catch (error) {
        throw error;
    }
}

// =============================================
// HANDLE LOGOUT - USES authorizedRequest
// =============================================
async function handleLogout() {
    if (!coreAuthState) {
        return false;
    }
    
    try {
        await authorizedRequest('/api/auth/logout', { method: 'POST' });
        
        await MessageTransport.send('SESSION_INVALIDATED', {});
        
        coreAuthState = false;
        clearSession();
        parentSessionReceived = false;
        sessionValidated = false;
        
        HeartbeatClient.stop();
        disableSettingsControls();
        
        setState(LifecycleState.WAITING_AUTH, 'user_logout');
        
        const event = new CustomEvent('userLoggedOut', {
            detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);
        
        return true;
    } catch (error) {
        console.error('[settings-core] Logout error:', error);
        return false;
    }
}

// =============================================
// TERMINATE SESSION - USES authorizedRequest
// =============================================
async function terminateSession(sessionId) {
    if (currentState !== LifecycleState.ACTIVE || !coreAuthState) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await authorizedRequest('/api/auth/terminate-session', {
            method: 'POST',
            body: { sessionId }
        });
        
        if (response.success) {
            await loadActiveSessions();
            
            await MessageTransport.send(PARENT_MESSAGE_TYPES.SESSION_TERMINATED, {
                sessionId
            });
            
            const event = new CustomEvent('sessionTerminated', {
                detail: { sessionId, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        if (userSettings.storage) {
            userSettings.storage.storageBreakdown.chats = 0;
            calculateStorageUsage();
            unsavedChanges = true;
            window.dispatchEvent(new CustomEvent('chatCacheCleared', {
                detail: { timestamp: Date.now(), mode: 'local-fallback' }
            }));
            return true;
        }
        throw error;
    }
}

// =============================================
// TERMINATE ALL SESSIONS - USES authorizedRequest
// =============================================
async function terminateAllSessions() {
    if (currentState !== LifecycleState.ACTIVE || !coreAuthState) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await authorizedRequest('/api/auth/terminate-all-sessions', {
            method: 'POST'
        });
        
        if (response.success) {
            await loadActiveSessions();
            
            await MessageTransport.send(PARENT_MESSAGE_TYPES.ALL_SESSIONS_TERMINATED, {});
            
            const event = new CustomEvent('allSessionsTerminated', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        if (userSettings.storage) {
            userSettings.storage.storageBreakdown.media = 0;
            calculateStorageUsage();
            unsavedChanges = true;
            window.dispatchEvent(new CustomEvent('mediaCacheCleared', {
                detail: { timestamp: Date.now(), mode: 'local-fallback' }
            }));
            return true;
        }
        throw error;
    }
}

// =============================================
// UNBLOCK USER - USES authorizedRequest
// =============================================
async function unblockUser(userId) {
    if (currentState !== LifecycleState.ACTIVE || !coreAuthState) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await authorizedRequest(`/api/friends/${encodeURIComponent(userId)}/unblock`, {
            method: 'POST',
            body: null
        });
        
        if (response.success) {
            await loadBlockedUsers();
            
            await MessageTransport.send(PARENT_MESSAGE_TYPES.USER_UNBLOCKED, {
                userId
            });
            
            const event = new CustomEvent('userUnblocked', {
                detail: { userId, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// CLEAR CHAT CACHE - USES authorizedRequest
// =============================================
async function clearChatCache() {
    if (currentState !== LifecycleState.ACTIVE || !coreAuthState) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await authorizedRequest('/api/storage/clear-chat-cache', {
            method: 'POST'
        });
        
        if (response.success && userSettings.storage) {
            userSettings.storage.storageBreakdown.chats = 0;
            userSettings.storage.totalStorageUsed = 
                (userSettings.storage.storageBreakdown.media || 0) + 
                (userSettings.storage.storageBreakdown.other || 0);
            calculateStorageUsage();
            unsavedChanges = true;
            
            await MessageTransport.send(PARENT_MESSAGE_TYPES.CACHE_CLEARED, {
                cacheType: 'chat'
            });
            
            const event = new CustomEvent('chatCacheCleared', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// CLEAR MEDIA CACHE - USES authorizedRequest
// =============================================
async function clearMediaCache() {
    if (currentState !== LifecycleState.ACTIVE || !coreAuthState) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await authorizedRequest('/api/storage/clear-media-cache', {
            method: 'POST'
        });
        
        if (response.success && userSettings.storage) {
            userSettings.storage.storageBreakdown.media = 0;
            userSettings.storage.totalStorageUsed = 
                (userSettings.storage.storageBreakdown.chats || 0) + 
                (userSettings.storage.storageBreakdown.other || 0);
            calculateStorageUsage();
            unsavedChanges = true;
            
            await MessageTransport.send(PARENT_MESSAGE_TYPES.CACHE_CLEARED, {
                cacheType: 'media'
            });
            
            const event = new CustomEvent('mediaCacheCleared', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// UPDATE USER UI
// =============================================
function updateUserUI() {
    try {
        const event = new CustomEvent('userUIUpdate', {
            detail: {
                user: coreCurrentUser,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// INITIALIZE UI
// =============================================
function initializeUI() {
    if (currentState !== LifecycleState.ACTIVE) return false;
    
    try {
        const event = new CustomEvent('coreUIInitialized', {
            detail: {
                timestamp: Date.now(),
                mode: coreAuthState ? 'authenticated' : 'no_session',
                user: coreCurrentUser,
                environment: IframeEnvironment.getEnvironment()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// SECURE FETCH WRAPPER - USES authorizedRequest
// =============================================
async function secureFetchWrapper(endpoint, method = 'GET', data = null, options = {}) {
    if (currentState !== LifecycleState.ACTIVE) {
        return {
            success: false,
            status: 'error',
            message: 'Cannot perform action: not ACTIVE state',
            data: null
        };
    }
    
    if (!coreAuthState) {
        return {
            success: false,
            status: 'error',
            message: 'Authentication not ready',
            data: null
        };
    }
    
    try {
        const response = await authorizedRequest(endpoint, {
            method: method,
            body: data,
            headers: options.headers
        });
        
        return response;
    } catch (error) {
        return {
            success: false,
            status: 'error',
            message: error.message || 'Request failed',
            data: null
        };
    }
}

// =============================================
// SAFE LOAD USER DATA
// =============================================
async function safeLoadUserData() {
    if (!coreAuthState && currentState !== LifecycleState.ACTIVE) {
        return null;
    }
    
    try {
        if (window.session.user) {
            const sessionData = {
                userId: window.session.user.id || window.session.user.userId,
                token: window.session.token,
                user: window.session.user
            };
            if (__isValidSession(sessionData)) {
                coreCurrentUser = window.session.user;
                coreData.user = window.session.user;
                SafeStorage.setJSON('current_user', coreCurrentUser);
                return coreCurrentUser;
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD SETTINGS
// =============================================
async function safeLoadSettings() {
    if (!coreAuthState && currentState !== LifecycleState.ACTIVE) {
        return null;
    }
    
    try {
        const settings = await SettingsState.load();
        if (settings) {
            userSettings = settings;
            coreData.settings = settings;
            return settings;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD BLOCKED USERS
// =============================================
async function safeLoadBlockedUsers() {
    if (!coreAuthState && currentState !== LifecycleState.ACTIVE) return null;
    
    try {
        const response = await secureFetchWrapper('/api/users/blocked', 'GET');
        const blockedData = response?.data?.blockedUsers || response?.blockedUsers || [];
        if (blockedData) {
            blockedUsers = blockedData;
            return blockedUsers;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD ACTIVE SESSIONS
// =============================================
async function safeLoadActiveSessions() {
    if (!coreAuthState && currentState !== LifecycleState.ACTIVE) return null;
    
    try {
        const response = await secureFetchWrapper('/api/auth/sessions', 'GET');
        const sessionsData = response?.data?.sessions || response?.sessions || [];
        if (sessionsData) {
            activeSessions = sessionsData;
            return activeSessions;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD USER CONTACTS
// =============================================
async function safeLoadUserContacts() {
    if (!coreAuthState && currentState !== LifecycleState.ACTIVE) return null;
    
    try {
        const response = await secureFetchWrapper('/api/friends/contacts', 'GET');
        const contactsData = response?.data?.contacts || response?.contacts || [];
        if (contactsData) {
            userContacts = contactsData;
            return userContacts;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD USER GROUPS
// =============================================
async function safeLoadUserGroups() {
    if (!coreAuthState && currentState !== LifecycleState.ACTIVE) return null;
    
    try {
        const response = await secureFetchWrapper('/api/groups', 'GET');
        const groupsData = response?.data?.groups || response?.groups || [];
        if (groupsData) {
            userGroups = groupsData;
            coreData.groupsList = groupsData;
            return userGroups;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// MAKE SAFE REQUEST
// =============================================
async function makeSafeRequest(endpoint, method = 'GET', data = null, options = {}) {
    if (!coreAuthState && currentState !== LifecycleState.ACTIVE) {
        throw new Error('Authentication not available');
    }
    return await secureFetchWrapper(endpoint, method, data, options);
}

// =============================================
// NOTIFY PARENT AUTH STATE
// =============================================
function notifyParentAuthState(hasAuth) {
    try {
        MessageTransport.send('IFRAME_AUTH_STATE', {
            hasAuth: hasAuth,
            iframeId: FRAME_ID
        });
    } catch (error) {}
}

// =============================================
// NOTIFY PARENT AUTH ERROR
// =============================================
let authErrorNotified = false;
function notifyParentAuthError() {
    if (authErrorNotified) return;
    try {
        MessageTransport.send('IFRAME_AUTH_ERROR', {
            iframeId: FRAME_ID,
            message: 'Authentication required',
            tokenExpired: true
        });
        authErrorNotified = true;
    } catch (error) {}
}

// =============================================
// GET SECURE TOKEN
// =============================================
function getSecureToken() {
    return window.session.token;
}

// =============================================
// WAIT FOR TOKEN
// =============================================
async function waitForToken(timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (coreAuthState && window.session.token) return true;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
}

// =============================================
// START PASSIVE AUTH MONITORING
// =============================================
function startPassiveAuthMonitoring() {}

// =============================================
// START BACKGROUND TASKS - AUTH-GATED
// =============================================
function startBackgroundTasks() {
    try {
        if (backgroundTasksStarted) return;
        if (!coreAuthState && currentState !== LifecycleState.ACTIVE) {
            console.log(`[${MODULE_NAME}] ⏳ Cannot start background tasks: auth not ready`);
            return;
        }
        
        console.log(`[${MODULE_NAME}] 🚀 Starting background tasks`);
        backgroundTasksStarted = true;
        
        Promise.allSettled([
            loadUserData(),
            loadActiveSessions(),
            loadBlockedUsers(),
            loadUserContacts(),
            loadUserGroups()
        ]).then(() => {
            console.log(`[${MODULE_NAME}] ✅ Background tasks completed`);
        }).catch((error) => {
            console.error(`[${MODULE_NAME}] ❌ Background tasks error:`, error);
        });
    } catch (error) {
        backgroundTasksStarted = false;
        console.error(`[${MODULE_NAME}] ❌ Failed to start background tasks:`, error);
    }
}

// =============================================
// CHECK AUTHENTICATION STATE
// =============================================
function checkAuthenticationState() {
    return coreAuthState && isSessionValid();
}

// =============================================
// VERIFY PARENT PRESENCE
// =============================================
function verifyParentPresence() {
    return OriginAdapter.isParentVerified();
}

// =============================================
// SETUP SECURE MESSAGING CHANNEL
// =============================================
function setupSecureMessagingChannel() {
    return true;
}

// =============================================
// START PARENT HANDSHAKE
// =============================================
function startParentHandshake(options = {}) {
    return HandshakeManager.startHandshake(options);
}

// =============================================
// SEND MESSAGE TO PARENT
// =============================================
function sendMessageToParent(message) {
    return safeSend(message);
}

// =============================================
// RESET UI FOR LOGOUT
// =============================================
function resetUIForLogout() {
    try {
        coreAuthState = false;
        clearSession();
        parentSessionReceived = false;
        sessionValidated = false;
        window.parentReady = false;
        parentReadyReceived = false;
        parentCommunicationReady = false;
        
        if (currentState === LifecycleState.ACTIVE) {
            setState(LifecycleState.WAITING_AUTH, 'ui_logout');
        }
        
        HeartbeatClient.stop();
        
        const event = new CustomEvent('uiResetForLogout', {
            detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);
        
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// SHOW RECONNECTION STATE
// =============================================
function coreShowReconnectionState() {
    try {
        const event = new CustomEvent('coreReconnecting', {
            detail: {
                timestamp: Date.now(),
                state: currentState,
                connectionQuality: connectionQuality,
                environment: IframeEnvironment.getEnvironment()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// BOOTSTRAP IFRAME
// =============================================
async function bootstrapIframe() {
    try {
        IframeEnvironment.detect();
        CompatibilityBridge.detect();
        OriginAdapter.init();
        await loadFromLocalStorage();
        
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// WAIT FOR SESSION
// =============================================
async function waitForSession(timeout = 10000) {
    return new Promise((resolve) => {
        if (coreAuthState && isSessionValid()) {
            resolve(true);
            return;
        }
        const startTime = Date.now();
        const checkInterval = safeSetInterval(() => {
            try {
                if (coreAuthState && isSessionValid()) {
                    clearInterval(checkInterval);
                    activeIntervals.delete(checkInterval);
                    clearTimeout(timeoutId);
                    activeTimers.delete(timeoutId);
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    activeIntervals.delete(checkInterval);
                    resolve(false);
                }
            } catch (error) {
                clearInterval(checkInterval);
                activeIntervals.delete(checkInterval);
                resolve(false);
            }
        }, 100);
        activeIntervals.add(checkInterval);
        const timeoutId = safeSetTimeout(() => {
            clearInterval(checkInterval);
            activeIntervals.delete(checkInterval);
            resolve(false);
        }, timeout);
        activeTimers.add(timeoutId);
    });
}

// =============================================
// INITIALIZE BASIC UI
// =============================================
function initializeBasicUI() {
    try {
        if (!userSettings) {
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            coreData.settings = userSettings;
        }
        const event = new CustomEvent('basicUIReady', {
            detail: {
                timestamp: Date.now(),
                state: currentState,
                environment: IframeEnvironment.getEnvironment(),
                authenticated: coreAuthState
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// SETUP BASIC EVENT LISTENERS
// =============================================
function coreSetupBasicEventListeners() {
    try {
        const backToAppBtn = document.getElementById('backToAppBtn');
        if (backToAppBtn) {
            const handler = () => {
                if (unsavedChanges) {
                    const event = new CustomEvent('confirmNavigation', {
                        detail: {
                            message: 'You have unsaved changes. Are you sure you want to leave?',
                            callback: () => {
                                MessageTransport.send('CHILD_CLOSING', {
                                    childId: FRAME_ID,
                                    unsavedChanges: true
                                });
                            }
                        }
                    });
                    window.dispatchEvent(event);
                } else {
                    MessageTransport.send('CHILD_CLOSING', {
                        childId: FRAME_ID
                    });
                }
            };
            backToAppBtn.addEventListener('click', handler);
        }
        
        window.addEventListener('beforeunload', (e) => {
            if (unsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// START TOKEN MONITORING
// =============================================
function startTokenMonitoring() {}

// =============================================
// CHECK TOKEN AVAILABILITY
// =============================================
function checkTokenAvailability() {}

// =============================================
// NOTIFY TOKEN READY
// =============================================
function notifyTokenReady() {}

// =============================================
// NOTIFY TOKEN LOST
// =============================================
function notifyTokenLost() {}

// =============================================
// GET HEALTH METRICS
// =============================================
function getHealthMetrics() {
    return {
        uptime: Date.now() - (stateHistory[0]?.timestamp || Date.now()),
        state: currentState,
        authenticated: coreAuthState,
        sessionValid: isSessionValid(),
        heartbeatHealthy: HeartbeatClient.isHealthy(),
        parentVerified: OriginAdapter.isParentVerified(),
        ready: isReady,
        environment: IframeEnvironment.getEnvironment(),
        settingsLoaded: SettingsState.loaded
    };
}

// =============================================
// GET CORE DIAGNOSTICS
// =============================================
function getCoreDiagnostics() {
    return DiagnosticsAgent.getFullReport();
}

// =============================================
// FORCE RECOVERY
// =============================================
function forceRecovery() {
    if (DEBUG) console.log('[settings-core] Forcing recovery');
    RecoveryManager.attemptRecovery({ reason: 'manual', force: true });
}

// =============================================
// ON READY CALLBACK
// =============================================
const readyCallbacks = [];

function onReady(callback) {
    if (isReady && coreAuthState) {
        callback();
    } else {
        readyCallbacks.push(callback);
    }
}

function executeReadyCallbacks() {
    readyCallbacks.forEach(cb => {
        try {
            cb();
        } catch (e) {}
    });
    readyCallbacks.length = 0;
}

// =============================================
// SET SILENT MODE FUNCTION
// =============================================
function setSilentMode(silent = !DEBUG) {
    CONSOLE_NOISE_SUPPRESSED = silent;
    ModuleCoreController.setSilent(silent);
    StartupGovernor.setSilent(silent);
    IframeTransport.setSilent(silent);
    HeartbeatClient.setSilent(silent);
    MessageTransport.setSilent(silent);
    
    if (DEBUG && !silent) {
        console.log('[settings-core] 🔇 Silent mode disabled');
    }
}

// =============================================
// SHUTDOWN CORE FUNCTION
// =============================================
function shutdownCore() {
    try {
        ModuleLifecycleController.stop();
        HeartbeatClient.stop();
        clearAllTimers();
        
        MessageTransport.send('SHUTDOWN', {
            reason: 'normal_shutdown'
        });
        
        currentState = LifecycleState.INITIALIZING;
        isReady = false;
        initializationLock = false;
        window.parentReady = false;
        parentReadyReceived = false;
        parentCommunicationReady = false;
        parentSessionReceived = false;
        sessionValidated = false;
        authReady = false;
        tokenReady = false;
        tokenAvailable = false;
        backgroundTasksStarted = false;
        coreAuthState = false;
        clearSession();
        
        window.__SETTINGS_STATE__ = currentState;
        window.__SETTINGS_SESSION_ACTIVE__ = false;
        window.__SETTINGS_READY__ = false;
        
        stateHistory = [];
        
        if (DEBUG) {
            console.log('[settings-core] ✅ Shutdown complete');
        }
        return true;
        
    } catch (error) {
        if (DEBUG) {
            console.error('[settings-core] ❌ Shutdown error:', error);
        }
        return false;
    }
}

// =============================================
// INITIALIZE CORE - MAIN ENTRY POINT
// =============================================
let initializationPromise = null;
let coreError = null;

async function initializeCore(options = {}) {
    if (initializationPromise) {
        return initializationPromise;
    }
    
    if (currentState !== LifecycleState.BOOT && currentState !== LifecycleState.INITIALIZING) {
        return { success: true, state: currentState, authenticated: coreAuthState };
    }
    
    initializationPromise = (async () => {
        if (initializationLock) return { success: false, error: 'initialization_in_progress' };
        initializationLock = true;
        coreError = null;
        
        const {
            debug = DEBUG
        } = options;
        
        if (debug) {
            DEBUG_ENABLED = true;
        }
        
        try {
            setupMessageListener();
            
            await ModuleCoreController.start();
            
            await loadFromLocalStorage();
            
            setupMessageHandlers();
            
            LifecycleController.init();
            
            initializationLock = false;
            initializationPromise = null;
            
            return { 
                success: true, 
                state: currentState, 
                authenticated: coreAuthState 
            };
            
        } catch (error) {
            coreError = error;
            initializationLock = false;
            initializationPromise = null;
            
            return {
                success: false,
                state: currentState,
                error: error.message,
                authenticated: false
            };
        }
    })();
    
    return initializationPromise;
}

// =============================================
// SETUP MESSAGE HANDLERS
// =============================================
function setupMessageHandlers() {
    MessageTransport.on('MODULE_REGISTERED', handleModuleRegisteredMessage);
    MessageTransport.on('PARENT_READY', handleParentReady);
    MessageTransport.on('SESSION_DATA', handleSessionData);
    MessageTransport.on('SESSION_ACTIVE', handleSessionActive);
    MessageTransport.on('SESSION_RESPONSE', handleSessionResponse);
    MessageTransport.on('SESSION_UPDATE', handleSessionUpdateMessage);
    MessageTransport.on('SESSION_NULL', handleSessionNull);
    MessageTransport.on('SESSION_REFRESHED', handleSessionRefreshed);
    MessageTransport.on('SESSION_INVALIDATED', handleSessionInvalidatedMessage);
    MessageTransport.on('SETTINGS_LOAD_RESPONSE', handleSettingsLoadResponseMessage);
    MessageTransport.on('SETTINGS_UPDATE_CONFIRMED', handleSettingsUpdateConfirmedMessage);
    MessageTransport.on('SETTINGS_UPDATED', handleSettingsUpdatedMessage);
    MessageTransport.on('ERROR', handleErrorMessageMessage);
    MessageTransport.on('SETTINGS_DATA', handleSettingsDataResponse);
    MessageTransport.on('SETTINGS_GLOBAL_UPDATE', handleSettingsGlobalUpdateMessage);
    MessageTransport.on('AUTH_READY', (message) => {
        coreAuthState = true;
        authCheckComplete = true;
        processRequestQueue();
        console.log('[settings-core] ✅ AUTH_READY received');
    });
    MessageTransport.on('AUTH_ERROR', (message) => {
        coreAuthState = false;
        console.error('[settings-core] ❌ AUTH_ERROR received');
    });
    
    MessageTransport.on('PROFILE_UPDATED', handleProfileUpdatedMessage);
    MessageTransport.on('PRIVACY_UPDATED', handlePrivacyUpdatedMessage);
    MessageTransport.on('NOTIFICATIONS_UPDATED', handleNotificationsUpdatedMessage);
    MessageTransport.on('LANGUAGE_CHANGED', handleLanguageChangedMessage);
    MessageTransport.on('THEME_CHANGED', handleThemeChangedMessage);
    MessageTransport.on('ACCOUNT_LOGGED_OUT', handleAccountLoggedOutMessage);
    MessageTransport.on('BLOCKED_USERS_UPDATED', handleBlockedUsersUpdatedMessage);
    MessageTransport.on('ACTIVE_SESSIONS_UPDATED', handleActiveSessionsUpdatedMessage);
    MessageTransport.on('USER_CONTACTS_UPDATED', handleUserContactsUpdatedMessage);
    MessageTransport.on('USER_GROUPS_UPDATED', handleUserGroupsUpdatedMessage);
    MessageTransport.on('STORAGE_USAGE_UPDATED', handleStorageUsageUpdatedMessage);
}

function handleSessionActive(message) {}
function handleSessionResponse(message) {}
function handleSessionNull() {}
function handleSessionRefreshed(message) {}

// =============================================
// DIAGNOSTICS AGENT
// =============================================
const DiagnosticsAgent = {
    _enabled: true,
    _logBuffer: [],
    _maxBuffer: 500,
    _startTime: Date.now(),
    _metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        handshakes: 0,
        handshakeFailures: 0,
        sessionUpdates: 0,
        sessionFailures: 0,
        pings: 0,
        pongs: 0,
        acks: 0,
        errors: 0,
        settingsUpdates: 0,
        settingsUpdateFailures: 0
    },
    _stateSnapshots: [],
    
    enable(debug = false) {
        this._enabled = true;
        if (debug) {
            window.__SETTINGS_DEBUG__ = true;
            DEBUG_ENABLED = true;
        }
        window.__getDiagnostics = () => this.getFullReport();
    },
    
    disable() {
        this._enabled = false;
    },
    
    log(level, message, data = null) {
        if (!this._enabled) return;
        if (!DEBUG && level !== 'error' && level !== 'init' && level !== 'success') return;
        
        const entry = {
            level,
            message,
            data: data ? (typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : String(data)) : null,
            timestamp: Date.now(),
            timeStr: new Date().toISOString().slice(11, 23),
            state: currentState,
            environment: IframeEnvironment.getEnvironment(),
            authenticated: coreAuthState
        };
        
        this._logBuffer.push(entry);
        
        if (this._logBuffer.length > this._maxBuffer) {
            this._logBuffer.shift();
        }
    },
    
    track(event, details = {}) {
        if (!this._enabled) return;
        
        if (this._metrics.hasOwnProperty(event)) {
            this._metrics[event]++;
        }
        
        this._stateSnapshots.push({
            event,
            details,
            timestamp: Date.now(),
            state: currentState,
            authenticated: coreAuthState,
            sessionValid: isSessionValid(),
            environment: IframeEnvironment.getEnvironment(),
            settingsLoaded: SettingsState.loaded
        });
        
        if (this._stateSnapshots.length > 50) {
            this._stateSnapshots.shift();
        }
    },
    
    getMetrics() {
        return {
            ...this._metrics,
            uptime: Date.now() - this._startTime,
            environment: IframeEnvironment.getEnvironment(),
            compatibility: CompatibilityBridge.isEnabled(),
            authenticated: coreAuthState,
            settingsLoaded: SettingsState.loaded
        };
    },
    
    getFullReport() {
        return {
            timestamp: Date.now(),
            state: {
                current: currentState,
                history: stateHistory.slice(-5)
            },
            auth: {
                authenticated: coreAuthState,
                sessionValid: isSessionValid()
            },
            environment: {
                type: IframeEnvironment.getEnvironment(),
                features: { ...IframeEnvironment._features },
                compatibility: CompatibilityBridge.isEnabled(),
                compatibilityReason: CompatibilityBridge.getReason()
            },
            session: {
                valid: isSessionValid(),
                hasToken: !!window.session.token,
                user: window.session.user ? { id: window.session.user.id, name: window.session.user.name } : null,
                expiresAt: window.session.expiresAt,
                version: window.session.version
            },
            settings: {
                loaded: SettingsState.loaded,
                lastSynced: SettingsState.lastSynced,
                pendingUpdates: SettingsState.pendingUpdates.size
            },
            heartbeat: HeartbeatClient.getDiagnostics(),
            origin: OriginAdapter.getDiagnostics(),
            transport: IframeTransport.getDiagnostics(),
            metrics: this.getMetrics(),
            logs: this._logBuffer.slice(-20),
            stateSnapshots: this._stateSnapshots.slice(-10),
            moduleRegistered,
            parentSessionReceived,
            queueLength: requestQueue.length
        };
    },
    
    reset() {
        this._logBuffer = [];
        this._metrics = {
            messagesSent: 0,
            messagesReceived: 0,
            handshakes: 0,
            handshakeFailures: 0,
            sessionUpdates: 0,
            sessionFailures: 0,
            pings: 0,
            pongs: 0,
            acks: 0,
            errors: 0,
            settingsUpdates: 0,
            settingsUpdateFailures: 0
        };
        this._stateSnapshots = [];
        this._startTime = Date.now();
        this.log('INFO', 'Diagnostics reset');
    }
};

// =============================================
// EXPORT DEFAULT_SETTINGS
// =============================================
const DEFAULT_SETTINGS = {
    profile: {
        displayName: '',
        username: '',
        bio: '',
        email: '',
        photoUrl: null,
        profileVisibility: 'everyone',
        lastSeen: true,
        currentMood: 'neutral'
    },
    privacy: {
        whoCanAddMe: 'everyone',
        canMessageMe: 'everyone',
        readReceipts: true,
        typingIndicators: true,
        contactDiscovery: true
    },
    security: {
        twoFactorAuth: false,
        loginNotifications: true,
        sessionTimeout: '30min',
        changePassword: false
    },
    notifications: {
        messageNotifications: true,
        groupNotifications: true,
        callNotifications: true,
        mentionNotifications: true,
        emailNotifications: false
    },
    appearance: {
        theme: 'light',
        accentColor: '#0084ff',
        fontSize: 16,
        language: 'en',
        compactMode: false,
        animations: true
    },
    chat: {
        enterKeySends: true,
        mediaAutoDownload: 'wifiOnly',
        messageHistory: 'forever',
        showTimestamps: true,
        showReadReceipts: true,
        allowReactions: true
    },
    calls: {
        whoCanCallMe: 'friendsOnly',
        callVibration: true,
        videoQuality: 'auto',
        voiceQuality: 'high',
        allowScreenShare: true
    },
    friends: {
        discoverByPhone: true,
        discoverByEmail: true,
        friendSuggestions: true,
        autoAcceptFriends: false,
        friendRequestPrivacy: 'everyone'
    },
    groups: {
        groupInvitations: 'friendsOnly',
        groupAnnouncements: true,
        allowGroupCreation: true,
        maxGroupSize: 200,
        groupAdminPermissions: 'moderate'
    },
    status: {
        whoCanViewMyStatus: 'friendsOnly',
        autoExpireStatus: '24h',
        allowStatusReplies: true,
        showStatusTo: 'friendsOnly'
    },
    storage: {
        totalStorageUsed: 0,
        storageTotal: 1024 * 1024 * 1024,
        chatCacheSize: 0,
        mediaCacheSize: 0,
        otherCacheSize: 0,
        autoClearCache: false,
        clearCacheOnExit: false,
        storageBreakdown: {
            chats: 0,
            media: 0,
            other: 0
        }
    },
    mood: {
        autoMoodDetection: true,
        currentMood: 'neutral',
        showMoodTo: 'friendsOnly',
        moodColors: {
            neutral: '#A9A9A9',
            happy: '#FFD700',
            calm: '#4A90E2',
            energetic: '#FF6B6B',
            focused: '#7B68EE',
            relaxed: '#4ECDC4',
            stressed: '#FF8C00',
            tired: '#808080',
            excited: '#FF1493'
        }
    },
    advanced: {
        offlineMode: false,
        debugMode: false,
        developerTools: false,
        experimentalFeatures: false,
        performanceMode: false,
        reduceMotion: false
    },
    backup: {
        autoBackup: false,
        backupFrequency: 'weekly',
        lastBackup: null,
        backupLocation: 'cloud',
        restoreOnLogin: true
    },
    danger: {
        deleteAccount: false,
        exportData: false,
        clearAllData: false,
        resetAllSettings: false
    }
};

// =============================================
// GET PARENT READY VALUE FUNCTION
// =============================================
function getParentReadyValue() {
    return window.parentReady;
}

// Session reference - create a module-level variable
const sessionWindow = window.session;

// Parent ready reference for export - FIX #6: Use parentReadyReceived which is dynamic
const parentReadyFlag = window.parentReady;

// (Legacy `export {}` block removed — this file was never imported as an ES module;
// no other script performed `import ... from 'status-core.js'`. All values needed
// externally are already assigned onto `window.*` above. Removing this block lets
// all three split files load as plain classic <script> tags sharing global scope,
// matching how status-ui.js / status-api.js / status-websocket.js already load.
// =============================================
// CALL SETSILENTMODE AFTER ALL COMPONENTS ARE INITIALIZED
// =============================================
setSilentMode(!DEBUG);

// =============================================
// AUTO-START
// =============================================
let domContentLoadedFired = false;

document.addEventListener('DOMContentLoaded', function() {
    if (domContentLoadedFired) return;
    domContentLoadedFired = true;
    
    // === CACHE-FIRST: Load settings from localStorage immediately so UI renders fast ===
    try {
        const cached = localStorage.getItem('knecta_settings_cache');
        if (cached) {
            const parsed = JSON.parse(cached);
            const data = (parsed && parsed.data) ? parsed.data : parsed;
            if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                const ageMs = parsed.timestamp ? (Date.now() - parsed.timestamp) : Infinity;
                if (ageMs < 86400000) { // < 24h
                    SettingsState.data = data;
                    SettingsState.loaded = true;
                    // FIX (theme-sparking-on-refresh bug): this cached settings
                    // blob can be up to 24h stale — it's a snapshot from the last
                    // time the FULL settings object was fetched/saved, not
                    // necessarily the theme the user most recently picked.
                    // js/theme.engine.js (the single canonical theme owner —
                    // loaded synchronously before any other script in status.html's
                    // <head>) has already painted the correct, always-current
                    // theme/font-size from the 'app_theme'/'app_font_size' keys
                    // before this DOMContentLoaded handler ever runs. Re-applying
                    // the cache's theme here directly on document.documentElement,
                    // unconditionally and without going through ThemeManager, was a
                    // second independently-timed paint that could silently revert
                    // the already-correct theme back to a stale cached one and
                    // skip the transition-suppression ThemeManager wraps every
                    // repaint in — exactly the visible "spark/blink" on every
                    // reload, relogin and refresh of the status module. Now this
                    // only ever delegates through ThemeManager (a no-op if the
                    // value already matches, so nothing repaints at all in the
                    // normal case), and only ever falls back to the cache's value
                    // when the authoritative key is missing entirely (true first
                    // run with no theme ever chosen yet).
                    if (data.appearance?.theme && !localStorage.getItem('app_theme')) {
                        if (window.ThemeManager) window.ThemeManager.setTheme(data.appearance.theme);
                        else {
                            const resolved = (data.appearance.theme === 'dark' ? 'dark' : 'light');
                            document.documentElement.setAttribute('data-theme', resolved);
                        }
                    }
                    if (data.appearance?.fontSize && !localStorage.getItem('app_font_size')) {
                        if (window.ThemeManager) window.ThemeManager.setFontSize(data.appearance.fontSize);
                        else {
                            document.documentElement.style.fontSize = data.appearance.fontSize + 'px';
                        }
                    }
                    if (data.appearance?.accentColor) {
                        if (window.ThemeManager) window.ThemeManager.setAccentColor(data.appearance.accentColor);
                        else document.documentElement.style.setProperty('--accent-color', data.appearance.accentColor);
                    }
                    if (data.appearance?.compactMode) {
                        document.body.classList.toggle('compact-mode', !!data.appearance.compactMode);
                    }
                    console.log('[settings-core] ✅ Cache-first settings loaded instantly');
                }
            }
        }
    } catch(e) {}
    
    try {
        initLog('DOMContentLoaded - starting core initialization');
        initializeCore({ 
            debug: DEBUG
        }).then(result => {
            if (result.success) {
                if (result.state === LifecycleState.ACTIVE) {
                    successLog('Core initialized and active');
                } else if (result.state === LifecycleState.WAITING_AUTH) {
                    successLog(`Core initialized, waiting for authentication`);
                } else {
                    successLog(`Core initialized, state: ${result.state}`);
                }
            } else {
                errorLog('Core initialization failed:', result);
            }
        }).catch(error => {
            errorLog('Core initialization error:', error);
        });
    } catch (error) {}
});

// =============================================
// EXPOSE GLOBALS FOR DEBUGGING
// =============================================
window.__SETTINGS_DEBUG__ = DEBUG;
window.__getDiagnostics = () => DiagnosticsAgent.getFullReport();
window.__forceRecovery = forceRecovery;
window.__resetCore = () => {
    shutdownCore();
    safeSetTimeout(() => initializeCore(), 1000);
};
window.__getOfflineQueue = () => OfflineQueue.getDiagnostics();
window.__syncOfflineQueue = () => OfflineQueue.syncAll();
window.__getEnvironment = () => IframeEnvironment.getInfo();
window.__getTransportStatus = () => IframeTransport.getDiagnostics();
window.__getSessionStatus = () => ({
    valid: isSessionValid(),
    authenticated: coreAuthState,
    hasToken: !!window.session.token,
    user: window.session.user,
    expiresAt: window.session.expiresAt,
    version: window.session.version
});
window.__getLifecycleState = () => currentState;
window.__getLifecycleHistory = () => stateHistory;
window.__getParentReady = () => window.parentReady;
window.__getMessageQueue = () => messageQueue.length;
window.__getSettingsState = () => ({
    loaded: SettingsState.loaded,
    lastSynced: SettingsState.lastSynced,
    pendingUpdates: SettingsState.pendingUpdates.size
});
window.__getAuthState = () => ({
    authenticated: coreAuthState,
    queueLength: requestQueue.length
});

// =============================================
// END OF FILE
// =============================================

// FIX: Bridge kyn: CustomEvents from app.realtime.socket.js _routeMessage
// so status-core.js receives realtime status:new and status:viewed events
// without needing a direct socket connection inside the iframe.
(function _installStatusRealtimeBridge() {
    'use strict';

    function _handleNewStatus(detail) {
        try {
            const status = detail.status || detail;
            if (!status || !status.id) return;
            // Fire the same CustomEvent that the status UI listens on
            window.dispatchEvent(new CustomEvent('statusReceived', { detail: status }));
            window.dispatchEvent(new CustomEvent('statusFeedUpdated', { detail: { type: 'new', status } }));
        } catch(_) {}
    }

    function _handleStatusViewed(detail) {
        try {
            window.dispatchEvent(new CustomEvent('statusViewedUpdate', { detail }));
        } catch(_) {}
    }

    function _handleStatusDeleted(detail) {
        if (!detail) return;
        // Collect all affected status IDs
        const ids = [];
        if (Array.isArray(detail.statusIds)) detail.statusIds.forEach(function(id) { ids.push(String(id)); });
        if (detail.statusId)  ids.push(String(detail.statusId));
        if (detail.id)        ids.push(String(detail.id));
        // Deduplicate
        const uniqueIds = [...new Set(ids)];

        // 1. Remove from DOM immediately
        uniqueIds.forEach(function(sid) {
            document.querySelectorAll(
                '[data-status-id="' + sid + '"], [data-id="' + sid + '"]'
            ).forEach(function(el) {
                el.style.transition = 'opacity 0.25s';
                el.style.opacity = '0';
                setTimeout(function() { try { el.remove(); } catch(_) {} }, 250);
            });
        });

        // 2. Clear from localStorage status cache
        if (uniqueIds.length > 0) {
            try {
                ['kyn_status_cache_v1', 'kyn_status_list_v1'].forEach(function(SKEY) {
                    const cached = JSON.parse(localStorage.getItem(SKEY) || 'null');
                    if (cached && Array.isArray(cached.statuses)) {
                        cached.statuses = cached.statuses.filter(function(s) {
                            return !uniqueIds.includes(String(s.id));
                        });
                        localStorage.setItem(SKEY, JSON.stringify(cached));
                    }
                });
            } catch(_) {}
            // 3. Track in permanent deleted set so expired statuses never restore
            try {
                const DKEY = 'kyn_deleted_statuses_v1';
                const existing = JSON.parse(localStorage.getItem(DKEY) || '[]');
                uniqueIds.forEach(function(sid) {
                    if (!existing.includes(sid)) existing.push(sid);
                });
                if (existing.length > 5000) existing.splice(0, existing.length - 5000);
                localStorage.setItem(DKEY, JSON.stringify(existing));
            } catch(_) {}

            // PHASE10: Record in DeletionRegistry — prevents stale cache resurrection
            try {
                uniqueIds.forEach(function(sid) {
                    window.__PHASE10_DeletionRegistry?.mark('status', sid, 'deleted');
                });
            } catch(_) {}
        }

        // 4. Dispatch event for other listeners
        try { window.dispatchEvent(new CustomEvent('statusDeleted', { detail: { ...detail, ids: uniqueIds } })); } catch(_) {}
    }

    window.addEventListener('kyn:status:new',     function(e) { _handleNewStatus(e.detail || {}); });
    window.addEventListener('kyn:status:created', function(e) { _handleNewStatus(e.detail || {}); });
    window.addEventListener('kyn:status:viewed',  function(e) { _handleStatusViewed(e.detail || {}); });
    window.addEventListener('kyn:status:deleted', function(e) { _handleStatusDeleted(e.detail || {}); });

    // Handle ALL status postMessage types (from ws-status-bridge and REALTIME_EVENT)
    window.addEventListener('message', function(evt) {
        if (!evt.data || typeof evt.data !== 'object') return;
        const { type, payload } = evt.data;
        if (!type) return;

        // Handle canonical types from ws-status-bridge
        if (type === 'status:created' || type === 'status:new') {
            _handleNewStatus(payload || {});
        } else if (type === 'status:deleted') {
            _handleStatusDeleted(payload || {});
        } else if (type === 'status:viewed' || type === 'status:viewer_update') {
            _handleStatusViewed(payload || {});
        } else if (type === 'status:reaction') {
            window.dispatchEvent(new CustomEvent('statusReaction', { detail: payload || {} }));
        } else if (type === 'status:reply') {
            window.dispatchEvent(new CustomEvent('statusReply', { detail: payload || {} }));
        } else if (type === 'status:expired') {
            _handleStatusDeleted(payload || {}); // treat expired same as deleted
        } else if (type === 'STATUS_UPDATE') {
            // Generic wrapper — check sub-type
            const subType = (payload && payload.type) || '';
            if (subType === 'new' || subType === 'created') _handleNewStatus(payload);
            else if (subType === 'deleted' || subType === 'expired') _handleStatusDeleted(payload);
            else if (subType === 'viewed') _handleStatusViewed(payload);
        }
        // Legacy REALTIME_EVENT: prefixed types
        else if (type === 'REALTIME_EVENT:status:new' || type === 'REALTIME_EVENT:status:created') {
            _handleNewStatus(payload || {});
        } else if (type === 'REALTIME_EVENT:status:viewed') {
            _handleStatusViewed(payload || {});
        } else if (type === 'REALTIME_EVENT:status:deleted') {
            _handleStatusDeleted(payload || {});
        } else if (type === 'KYN_REALTIME_READY') {
            // Socket reconnected — reload statuses from server
            try { window.dispatchEvent(new CustomEvent('statusReconnect', { detail: {} })); } catch(_) {}
        }
    });

    console.log('[status-core] realtime kyn: bridge installed ✅');
})();
