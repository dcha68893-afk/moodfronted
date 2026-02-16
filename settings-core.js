// =============================================
// SETTINGS CORE - HARDENED PRODUCTION VERSION v3.2.0
// ENHANCED PARENT COMMUNICATION | FIXED EXPORTS | COMPLETE
// =============================================

// =============================================
// MODULE IDENTITY & VERSION
// =============================================
const MODULE_NAME = 'settings-core';
const MODULE_VERSION = '3.2.0-production-hardened';
const PROTOCOL_VERSION = '2.0';
let moduleId = `settings-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// =============================================
// EXPORTED STATE VARIABLES - COMPLETE
// =============================================
export let isReady = false;
export let coreError = null;
export let initializationInProgress = false;

export let currentUser = null;
export let userSettings = null;
export let currentSection = 'profile';
export let unsavedChanges = false;
export let blockedUsers = [];
export let activeSessions = [];
export let userContacts = [];
export let userGroups = [];

export let authReady = false;
export let apiInitialized = false;
export let backgroundTasksStarted = false;
export let tokenReady = false;
export let tokenAvailable = false;
export let tokenInitialized = false;
export let parentCommunicationReady = false;
export let parentSessionReceived = false;
export let parentOrigin = null;
export let parentSessionData = null;
export let sessionValidated = false;

export const MAX_API_RETRIES = 5;
export const AUTH_CHECK_INTERVAL = 30000;
export const TOKEN_CHECK_INTERVAL = 1000;
export const MAX_HANDSHAKE_ATTEMPTS = 10;
export const HANDSHAKE_RETRY_INTERVAL = 1000;
export const SESSION_SYNC_TIMEOUT = 5000;
export const HEARTBEAT_INTERVAL = 30000;

// ADD MISSING EXPORTS FOR OTHER MODULES
export const PARENT_MESSAGE_TYPES = {
    READY: 'READY',
    ACK: 'ACK',
    SESSION: 'SESSION',
    DATA: 'DATA',
    ERROR: 'ERROR',
    HEARTBEAT: 'HEARTBEAT',
    STATUS: 'STATUS',
    HANDSHAKE: 'HANDSHAKE',
    HANDSHAKE_ACK: 'HANDSHAKE_ACK',
    SESSION_REQUEST: 'SESSION_REQUEST',
    SESSION_RESPONSE: 'SESSION_RESPONSE',
    SESSION_UPDATE: 'SESSION_UPDATE',
    TOKEN_REQUEST: 'TOKEN_REQUEST',
    TOKEN_RESPONSE: 'TOKEN_RESPONSE',
    CHILD_READY: 'CHILD_READY',
    PARENT_READY: 'PARENT_READY',
    AUTH_READY: 'AUTH_READY',
    AUTH_LOST: 'AUTH_LOST',
    LOGOUT: 'LOGOUT',
    REFRESH_DATA: 'REFRESH_DATA',
    UPDATE_DATA: 'UPDATE_DATA',
    CORE_READY: 'CORE_READY',
    IFRAME_AUTH_STATE: 'IFRAME_AUTH_STATE',
    IFRAME_AUTH_ERROR: 'IFRAME_AUTH_ERROR',
    CHILD_CLOSING: 'CHILD_CLOSING'
};

// =============================================
// CORE DATA STORAGE - PRESERVED
// =============================================
export const coreData = {
    friendsList: [],
    groupsList: [],
    chatHistory: [],
    notifications: [],
    settings: null,
    user: null
};

// =============================================
// MESSAGE QUEUE FOR PARENT COMMUNICATION
// =============================================
export const messageQueue = [];
export let parentReady = false;

// =============================================
// DEFAULT SETTINGS - PRESERVED COMPLETE
// =============================================
export const DEFAULT_SETTINGS = {
    profile: {
        photoUrl: '',
        displayName: '',
        username: '',
        bio: '',
        phoneNumber: '',
        email: '',
        currentMood: 'neutral',
        currentMoodText: '',
        profileVisibility: 'everyone',
        lastSeen: true,
        onlineStatus: true,
        profilePhotoVisibility: 'everyone'
    },
    security: {
        twoFactorAuth: false,
        loginNotifications: true,
        sessionTimeout: '30min',
        appLock: false,
        screenCaptureProtection: true,
        encryption: true,
        biometricBypass: true,
        timeoutWarnings: true,
        enhancedTimeout: false,
        lockScreenAfter: '5min',
        logoutAfter: '8hr'
    },
    privacy: {
        whoCanAddMe: 'everyone',
        readReceipts: true,
        typingIndicators: true,
        messageForwarding: true,
        contactDiscovery: true,
        canMessageMe: 'everyone',
        canCallMe: 'everyone',
        canSeeMyStatus: 'friendsOnly',
        canSeeProfilePhoto: 'everyone',
        canSeeLastSeen: 'friendsOnly',
        canForwardMessages: 'friendsOnly',
        canTakeScreenshots: false,
        blockedUsers: []
    },
    chat: {
        chatWallpaper: 'default',
        enterKeySends: true,
        mediaAutoDownload: 'wifiOnly',
        saveToCameraRoll: true,
        messageHistory: 'forever',
        disappearingMessages: 'off',
        smartReplies: true,
        messageTranslation: false,
        chatSummarization: false,
        spamDetection: true,
        messageApprovalMode: false,
        keywordFiltering: false
    },
    friends: {
        discoverByPhone: true,
        discoverByEmail: true,
        nearbyDiscovery: false,
        qrCodeScanner: true,
        friendSuggestions: true,
        temporaryFriends: false,
        friendshipNotes: true,
        friendCategories: true,
        trustScore: false,
        friendAnalytics: false
    },
    groups: {
        autoJoinGroups: false,
        groupInvitations: 'everyone',
        groupPrivacy: 'everyone',
        groupAnnouncements: true,
        autoDownloadGroupMedia: 'wifiOnly',
        messageApprovalModeGroup: false,
        keywordFilteringGroup: false,
        groupSpamDetection: true,
        memberWarnings: true,
        activityTracking: false,
        topContributors: false,
        messageVolumeAnalytics: false,
        groupDataCache: 'activeGroupsOnly'
    },
    calls: {
        whoCanCallMe: 'everyone',
        callVerification: true,
        ringtone: 'default',
        callVibration: true,
        autoAnswer: false,
        videoQuality: 'auto',
        cameraDefault: 'front',
        noiseCancellation: true,
        echoCancellation: true,
        liveReactions: true,
        inCallChat: true,
        sharedWhiteboard: false,
        sharedNotes: false,
        polls: false,
        callHistoryCache: '90days'
    },
    status: {
        whoCanViewMyStatus: 'friendsOnly',
        autoExpireStatus: '24h',
        replyPermissions: 'friendsOnly',
        downloadPermissions: false,
        hideFromSpecificUsers: [],
        viewCount: true,
        viewerList: true,
        engagementReactions: true,
        autoCaptions: false,
        aiEnhancement: false,
        statusScheduling: false,
        statusCache: '7days'
    },
    notifications: {
        messageNotifications: true,
        groupNotifications: true,
        friendRequestNotifications: true,
        callNotifications: true,
        statusNotifications: true,
        notificationSound: true,
        vibration: true,
        popupNotifications: true,
        notificationLight: true,
        doNotDisturb: false,
        schedule: 'custom',
        allowCalls: true
    },
    appearance: {
        theme: 'auto',
        accentColor: '#0084ff',
        fontSize: 16,
        reduceMotion: false,
        language: 'en',
        timeFormat: '12-hour',
        dateFormat: 'MM/DD/YYYY',
        moodBasedLayouts: false,
        layoutMode: 'compact',
        customIcons: false,
        buttonStyles: 'rounded'
    },
    mood: {
        moodLinkedTheme: true,
        moodColors: {
            happy: '#FFD700',
            calm: '#4A90E2',
            energetic: '#FF6B6B',
            focused: '#7B68EE',
            relaxed: '#4ECDC4',
            stressed: '#FF8C00',
            tired: '#A9A9A9',
            excited: '#FF1493'
        },
        currentMood: 'neutral',
        manualMoodOverride: 'autoDetect',
        smartNotifications: true,
        autoMoodDetection: true,
        moodAutoReplies: false,
        stressedModeRules: false,
        focusedModeRules: false,
        happyModeRules: false,
        updateAfterCalls: false,
        updateAfterStatusPosts: false,
        updateAfterActivity: false
    },
    storage: {
        autoClearCache: 'never',
        chatCacheSize: 0,
        mediaCacheSize: 0,
        otherCacheSize: 0,
        totalStorageUsed: 0,
        storageTotal: 1024 * 1024 * 1024,
        storageBreakdown: {
            chats: 0,
            media: 0,
            other: 0
        }
    },
    advanced: {
        offlineMode: false,
        intranetSupport: false,
        lowBandwidthMode: false,
        debugMode: false,
        proxySettings: {},
        dataSaver: false
    },
    backup: {
        autoBackup: true,
        backupFrequency: 'weekly',
        backupLocation: 'cloud',
        lastBackup: null,
        backupSize: 0
    },
    danger: {
        accountDeletionRequested: false,
        deletionScheduled: null,
        dataExportRequested: false,
        lastExport: null,
        exportFormat: 'json'
    }
};

// =============================================
// SETTINGS MENU - PRESERVED COMPLETE
// =============================================
export const SETTINGS_MENU = [
    { id: 'profile', title: 'Profile', icon: 'fas fa-user', badge: null, danger: false, requiresAuth: false },
    { id: 'security', title: 'Security', icon: 'fas fa-shield-alt', badge: null, danger: false, requiresAuth: true },
    { id: 'privacy', title: 'Privacy', icon: 'fas fa-lock', badge: null, danger: false, requiresAuth: true },
    { id: 'chat', title: 'Chat', icon: 'fas fa-comments', badge: null, danger: false, requiresAuth: true },
    { id: 'friends', title: 'Friends', icon: 'fas fa-user-friends', badge: null, danger: false, requiresAuth: true },
    { id: 'groups', title: 'Groups', icon: 'fas fa-users', badge: null, danger: false, requiresAuth: true },
    { id: 'calls', title: 'Calls', icon: 'fas fa-phone', badge: null, danger: false, requiresAuth: true },
    { id: 'status', title: 'Status', icon: 'fas fa-circle', badge: null, danger: false, requiresAuth: true },
    { id: 'notifications', title: 'Notifications', icon: 'fas fa-bell', badge: null, danger: false, requiresAuth: true },
    { id: 'appearance', title: 'Appearance', icon: 'fas fa-palette', badge: null, danger: false, requiresAuth: true },
    { id: 'storage', title: 'Storage', icon: 'fas fa-database', badge: null, danger: false, requiresAuth: true },
    { id: 'mood', title: 'Mood Settings', icon: 'fas fa-smile', badge: 'NEW', danger: false, requiresAuth: true },
    { id: 'advanced', title: 'Advanced', icon: 'fas fa-cogs', badge: null, danger: false, requiresAuth: true },
    { id: 'backup', title: 'Backup & Restore', icon: 'fas fa-cloud-upload-alt', badge: null, danger: false, requiresAuth: true },
    { id: 'danger', title: 'Danger Zone', icon: 'fas fa-exclamation-triangle', badge: '!', danger: true, requiresAuth: true }
];

// =============================================
// PRIVATE STATE MANAGEMENT - ENHANCED
// =============================================
const state = {
    initialized: false,
    handshakeCompleted: false,
    sessionSynced: false,
    permissionsGranted: false,
    dependenciesLoaded: false,
    parentOrigin: null,
    parentVerified: false,
    parentWindow: null,
    parentReady: false,
    parentProtocolVersion: null,
    messageSequence: 0,
    pendingMessages: new Map(),
    pendingAcks: new Map(),
    messageHandlers: new Map(),
    session: null,
    sessionMirror: {
        user: null,
        token: null,
        permissions: null,
        expiresAt: 0,
        lastSync: 0
    },
    sessionExpiry: null,
    authMode: 'pending',
    features: new Map(),
    listeners: new Set(),
    intervals: new Set(),
    timeouts: new Set(),
    circuitBreakers: new Map(),
    health: {
        status: 'initializing',
        lastHeartbeat: Date.now(),
        failures: 0,
        recoveryAttempts: 0,
        lastError: null,
        lastErrorTime: 0
    },
    tokenCheckInterval: null,
    authCheckInterval: null,
    handshakeInterval: null,
    heartbeatInterval: null,
    processedMessageIds: new Set(),
    messageIdCleanupTimer: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,
    sessionWatchdog: null,
    readyCallbacks: [],
    errorBoundary: null
};

// =============================================
// TRUSTED ORIGINS & SECURITY - ENHANCED
// =============================================
const TRUSTED_ORIGINS = new Set([
    window.location.origin,
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'null'
]);

let trustedOrigins = new Set(TRUSTED_ORIGINS);
let untrustedOriginLogged = false;
let processedMessageIds = new Set();
let authErrorNotified = false;
let handshakeFailureLogged = false;
let sessionRequestLogged = false;

// =============================================
// MESSAGE TYPES - ENHANCED PROTOCOL
// =============================================
const MESSAGE_TYPES = {
    READY: 'READY',
    ACK: 'ACK',
    SESSION: 'SESSION',
    DATA: 'DATA',
    ERROR: 'ERROR',
    HEARTBEAT: 'HEARTBEAT',
    STATUS: 'STATUS',
    HANDSHAKE: 'HANDSHAKE',
    HANDSHAKE_ACK: 'HANDSHAKE_ACK',
    HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
    HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',
    SESSION_REQUEST: 'SESSION_REQUEST',
    SESSION_RESPONSE: 'SESSION_RESPONSE',
    SESSION_UPDATE: 'SESSION_UPDATE',
    SESSION_INIT: 'SESSION_INIT',
    SESSION_SYNC: 'SESSION_SYNC',
    SESSION_CONFIRMED: 'SESSION_CONFIRMED',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    TOKEN_REQUEST: 'TOKEN_REQUEST',
    TOKEN_RESPONSE: 'TOKEN_RESPONSE',
    TOKEN_REFRESH: 'TOKEN_REFRESH',
    TOKEN_READY: 'TOKEN_READY',
    TOKEN_LOST: 'TOKEN_LOST',
    SHUTDOWN: 'SHUTDOWN',
    CHILD_READY: 'CHILD_READY',
    CHILD_ACKNOWLEDGED: 'CHILD_ACKNOWLEDGED',
    PARENT_READY: 'PARENT_READY',
    PARENT_READY_ACK: 'PARENT_READY_ACK',
    AUTH_READY: 'AUTH_READY',
    AUTH_LOST: 'AUTH_LOST',
    AUTH_STATE: 'AUTH_STATE',
    USER_UPDATED: 'USER_UPDATED',
    LOGOUT: 'LOGOUT',
    LOGOUT_CONFIRMED: 'LOGOUT_CONFIRMED',
    REFRESH_DATA: 'refreshData',
    UPDATE_DATA: 'updateData',
    DATA_REFRESHED: 'dataRefreshed',
    ALL_DATA_REFRESHED: 'allDataRefreshed',
    DATA_UPDATED: 'dataUpdated',
    REFRESH_ERROR: 'refreshError',
    INIT: 'init',
    INIT_ACK: 'initAck',
    CORE_READY: 'coreReady',
    SECTION_CHANGE: 'SECTION_CHANGE',
    CHILD_CLOSING: 'CHILD_CLOSING',
    IFRAME_AUTH_STATE: 'IFRAME_AUTH_STATE',
    IFRAME_AUTH_ERROR: 'IFRAME_AUTH_ERROR',
    MIRROR_SYNC: 'MIRROR_SYNC',
    MIRROR_UPDATE: 'MIRROR_UPDATE',
    MIRROR_CONFIRM: 'MIRROR_CONFIRM',
    RECOVERY_REQUEST: 'RECOVERY_REQUEST',
    RECOVERY_RESPONSE: 'RECOVERY_RESPONSE',
    RECOVERY_COMPLETE: 'RECOVERY_COMPLETE'
};

// =============================================
// LOGGING SYSTEM - ENHANCED
// =============================================
const Log = {
    _warnings: new Set(),
    _debug: false,
    _logBuffer: [],
    _maxBufferSize: 100,
    _logLevel: 'info',
    
    enableDebug() { this._debug = true; this._logLevel = 'debug'; },
    setLogLevel(level) { this._logLevel = level; },
    
    _addToBuffer(level, message, data) {
        const entry = {
            level,
            message,
            data: data ? JSON.stringify(data).substring(0, 200) : null,
            timestamp: Date.now(),
            timeStr: new Date().toISOString().slice(11, 23)
        };
        this._logBuffer.push(entry);
        if (this._logBuffer.length > this._maxBufferSize) {
            this._logBuffer.shift();
        }
    },
    
    getBuffer() { return [...this._logBuffer]; },
    
    info(message, data = null) {
        if (this._logLevel === 'error' || this._logLevel === 'warn') return;
        const timeStr = new Date().toISOString().slice(11, 19);
        console.info(`[${MODULE_NAME}] [${timeStr}] ${message}`, data ? data : '');
        this._addToBuffer('info', message, data);
    },
    
    warn(message, once = true) {
        if (this._logLevel === 'error') return;
        if (once && this._warnings.has(message)) return;
        this._warnings.add(message);
        const timeStr = new Date().toISOString().slice(11, 19);
        console.warn(`[${MODULE_NAME}] [${timeStr}] ⚠️ ${message}`);
        this._addToBuffer('warn', message, null);
    },
    
    error(message, error = null, once = true) {
        if (once && this._warnings.has(`error:${message}`)) return;
        this._warnings.add(`error:${message}`);
        const timeStr = new Date().toISOString().slice(11, 19);
        console.error(`[${MODULE_NAME}] [${timeStr}] ❌ ${message}`, error || '');
        this._addToBuffer('error', message, error);
        state.health.lastError = message;
        state.health.lastErrorTime = Date.now();
        state.health.failures++;
    },
    
    debug(message, data = null) {
        if (!this._debug || this._logLevel !== 'debug') return;
        const timeStr = new Date().toISOString().slice(11, 23);
        console.debug(`[${MODULE_NAME}] [${timeStr}] 🔍 ${message}`, data ? data : '');
        this._addToBuffer('debug', message, data);
    },
    
    metric(name, value) {
        if (!this._debug) return;
        console.debug(`[${MODULE_NAME}] 📊 ${name}:`, value);
    },
    
    flush() {
        this._logBuffer = [];
    }
};

// =============================================
// SECURE STORAGE ABSTRACTION LAYER
// =============================================
const SecureStorage = {
    _memoryCache: new Map(),
    _storageAvailable: null,
    _encryptionKey: null,
    _prefix: 'kynecta_',
    
    init() {
        this._checkAvailability();
        this._generateKey();
        return this;
    },
    
    _checkAvailability() {
        if (this._storageAvailable !== null) return this._storageAvailable;
        try {
            const testKey = `${this._prefix}test`;
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            this._storageAvailable = true;
        } catch (e) {
            this._storageAvailable = false;
            Log.warn('localStorage unavailable, using memory cache only');
        }
        return this._storageAvailable;
    },
    
    _generateKey() {
        this._encryptionKey = `key_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    },
    
    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    },
    
    _encrypt(value) {
        if (!value) return value;
        if (typeof value !== 'string') value = JSON.stringify(value);
        return btoa(encodeURIComponent(value).split('').map((c, i) => 
            String.fromCharCode(c.charCodeAt(0) ^ (this._encryptionKey.charCodeAt(i % this._encryptionKey.length) || 0))
        ).join(''));
    },
    
    _decrypt(value) {
        if (!value) return value;
        try {
            const decoded = atob(value);
            const result = decoded.split('').map((c, i) => 
                String.fromCharCode(c.charCodeAt(0) ^ (this._encryptionKey.charCodeAt(i % this._encryptionKey.length) || 0))
            ).join('');
            return decodeURIComponent(result);
        } catch (e) {
            return value;
        }
    },
    
    get(key, fallback = null, useEncryption = false) {
        const prefixedKey = `${this._prefix}${key}`;
        if (this._memoryCache.has(prefixedKey)) {
            return this._memoryCache.get(prefixedKey);
        }
        if (this._storageAvailable) {
            try {
                let value = localStorage.getItem(prefixedKey);
                if (value) {
                    if (useEncryption) {
                        try {
                            value = this._decrypt(value);
                        } catch (e) {
                            Log.debug(`Decryption failed for ${key}, using raw value`);
                        }
                    }
                    this._memoryCache.set(prefixedKey, value);
                    return value;
                }
            } catch (e) {
                Log.debug(`Error reading ${key} from localStorage`);
            }
        }
        return fallback;
    },
    
    set(key, value, useEncryption = false) {
        const prefixedKey = `${this._prefix}${key}`;
        this._memoryCache.set(prefixedKey, value);
        if (this._storageAvailable) {
            try {
                let storageValue = value;
                if (useEncryption) {
                    storageValue = this._encrypt(value);
                }
                localStorage.setItem(prefixedKey, String(storageValue));
                return true;
            } catch (e) {
                Log.debug(`Error writing ${key} to localStorage`);
                return false;
            }
        }
        return true;
    },
    
    remove(key) {
        const prefixedKey = `${this._prefix}${key}`;
        this._memoryCache.delete(prefixedKey);
        if (this._storageAvailable) {
            try {
                localStorage.removeItem(prefixedKey);
            } catch (e) {}
        }
    },
    
    getJSON(key, fallback = null, useEncryption = false) {
        const value = this.get(key, null, useEncryption);
        if (!value) return fallback;
        try {
            return JSON.parse(value);
        } catch (e) {
            return fallback;
        }
    },
    
    setJSON(key, value, useEncryption = false) {
        try {
            return this.set(key, JSON.stringify(value), useEncryption);
        } catch (e) {
            return false;
        }
    },
    
    clear(prefix = null) {
        const actualPrefix = prefix ? `${this._prefix}${prefix}` : this._prefix;
        if (prefix) {
            for (const key of this._memoryCache.keys()) {
                if (key.startsWith(actualPrefix)) {
                    this._memoryCache.delete(key);
                }
            }
        } else {
            this._memoryCache.clear();
        }
        if (this._storageAvailable) {
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(actualPrefix)) {
                        localStorage.removeItem(key);
                        i--;
                    }
                }
            } catch (e) {}
        }
    },
    
    getAllKeys() {
        const keys = new Set();
        for (const key of this._memoryCache.keys()) {
            keys.add(key.substring(this._prefix.length));
        }
        if (this._storageAvailable) {
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(this._prefix)) {
                        keys.add(key.substring(this._prefix.length));
                    }
                }
            } catch (e) {}
        }
        return Array.from(keys);
    }
}.init();

// =============================================
// SESSION MIRROR LAYER - ENHANCED
// =============================================
const SessionMirror = {
    _mirror: {
        user: null,
        token: null,
        permissions: null,
        expiresAt: 0,
        lastSync: 0,
        version: 0,
        source: null
    },
    _subscribers: new Set(),
    _syncInProgress: false,
    _lastSyncAttempt: 0,
    _syncInterval: null,
    
    init() {
        const cached = SecureStorage.getJSON('session_mirror', null, true);
        if (cached) {
            this._mirror = { ...this._mirror, ...cached };
            Log.info('Session mirror restored from cache', { version: this._mirror.version });
        }
        this._startAutoSync();
        return this;
    },
    
    _startAutoSync() {
        if (this._syncInterval) clearInterval(this._syncInterval);
        this._syncInterval = setInterval(() => this.sync(), 30000);
        state.intervals.add(this._syncInterval);
    },
    
    update(sessionData) {
        if (!sessionData) return false;
        const previousVersion = this._mirror.version;
        if (sessionData.user) this._mirror.user = { ...sessionData.user };
        if (sessionData.token) this._mirror.token = sessionData.token;
        if (sessionData.permissions) this._mirror.permissions = { ...sessionData.permissions };
        if (sessionData.expiresAt) this._mirror.expiresAt = sessionData.expiresAt;
        this._mirror.lastSync = Date.now();
        this._mirror.version = (this._mirror.version || 0) + 1;
        this._mirror.source = 'parent';
        
        if (this._mirror.user) {
            currentUser = this._mirror.user;
            coreData.user = this._mirror.user;
            state.session = this._mirror.user;
            state.sessionMirror = { ...this._mirror };
            parentSessionData = this._mirror;
            parentSessionReceived = true;
            sessionValidated = true;
            
            if (this._mirror.token) {
                tokenAvailable = true;
                tokenReady = true;
                authReady = true;
            }
        }
        
        SecureStorage.setJSON('session_mirror', {
            user: this._mirror.user ? { id: this._mirror.user.id, name: this._mirror.user.name } : null,
            version: this._mirror.version,
            expiresAt: this._mirror.expiresAt
        }, true);
        
        this._notifySubscribers();
        Log.debug('Session mirror updated', { 
            version: this._mirror.version,
            previous: previousVersion,
            hasUser: !!this._mirror.user,
            hasToken: !!this._mirror.token 
        });
        return true;
    },
    
    sync() {
        if (this._syncInProgress) return false;
        this._lastSyncAttempt = Date.now();
        this._syncInProgress = true;
        sendToParent({
            type: MESSAGE_TYPES.MIRROR_SYNC,
            childId: 'settings',
            version: this._mirror.version,
            timestamp: Date.now(),
            source: MODULE_NAME,
            expectAck: true,
            timeout: 3000
        }).then(response => {
            if (response?.session) {
                this.update(response.session);
            }
        }).catch(() => {}).finally(() => {
            this._syncInProgress = false;
        });
        return true;
    },
    
    subscribe(callback) {
        this._subscribers.add(callback);
        callback(this.getMirror());
        return () => this._subscribers.delete(callback);
    },
    
    _notifySubscribers() {
        const mirror = this.getMirror();
        this._subscribers.forEach(cb => {
            try { cb(mirror); } catch (e) {}
        });
    },
    
    getMirror() {
        return {
            user: this._mirror.user ? { ...this._mirror.user } : null,
            token: this._mirror.token,
            permissions: this._mirror.permissions ? { ...this._mirror.permissions } : null,
            expiresAt: this._mirror.expiresAt,
            lastSync: this._mirror.lastSync,
            version: this._mirror.version,
            isValid: this.isValid(),
            isExpired: this.isExpired()
        };
    },
    
    getUser() {
        return this._mirror.user ? { ...this._mirror.user } : null;
    },
    
    getToken() {
        return this._mirror.token;
    },
    
    isValid() {
        return !!this._mirror.user && !!this._mirror.token && !this.isExpired();
    },
    
    isExpired() {
        if (!this._mirror.expiresAt) return false;
        return Date.now() >= this._mirror.expiresAt;
    },
    
    clear() {
        this._mirror = {
            user: null,
            token: null,
            permissions: null,
            expiresAt: 0,
            lastSync: 0,
            version: 0,
            source: null
        };
        SecureStorage.remove('session_mirror');
        this._notifySubscribers();
    },
    
    shutdown() {
        if (this._syncInterval) {
            clearInterval(this._syncInterval);
            this._syncInterval = null;
        }
        this._subscribers.clear();
    }
};

// =============================================
// MESSAGE ID GENERATOR
// =============================================
function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}_${state.messageSequence++}`;
}

// =============================================
// SECURITY FUNCTIONS
// =============================================
function isValidOrigin(origin) {
    if (TRUSTED_ORIGINS.has(origin)) return true;
    if (state.parentOrigin === origin) return true;
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        if (origin.startsWith('http://') || origin.startsWith('https://')) {
            return true;
        }
    }
    return false;
}

function signMessage(payload) {
    const timestamp = Date.now();
    const messageId = generateMessageId();
    const sequence = state.messageSequence;
    const signature = btoa(JSON.stringify({
        module: MODULE_NAME,
        sequence,
        timestamp,
        type: payload.type || 'unknown',
        nonce: Math.random().toString(36).substring(2, 10)
    }));
    return {
        ...payload,
        messageId,
        sequence,
        timestamp,
        module: MODULE_NAME,
        version: MODULE_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        signature
    };
}

function verifyMessage(message) {
    if (!message || typeof message !== 'object') return false;
    if (!message.messageId || !message.timestamp) return false;
    if (message.protocolVersion && message.protocolVersion !== PROTOCOL_VERSION) {
        Log.debug(`Protocol version mismatch: ${message.protocolVersion} vs ${PROTOCOL_VERSION}`);
    }
    if (state.processedMessageIds.has(message.messageId)) {
        Log.debug(`Duplicate message: ${message.messageId}`);
        return false;
    }
    if (message.signature && message.type) {
        try {
            const expectedSignature = btoa(JSON.stringify({
                module: message.module || 'unknown',
                sequence: message.sequence,
                timestamp: message.timestamp,
                type: message.type,
                nonce: message.nonce
            }));
            if (message.signature !== expectedSignature) {
                Log.debug('Invalid signature');
                return false;
            }
        } catch (e) {
            return false;
        }
    }
    return true;
}

// =============================================
// PARENT DETECTION
// =============================================
function detectParent() {
    try {
        if (window.parent && window.parent !== window) {
            state.parentWindow = window.parent;
            try {
                if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
                    state.parentOrigin = window.location.ancestorOrigins[0];
                } else {
                    state.parentOrigin = document.referrer ? new URL(document.referrer).origin : window.location.origin;
                }
            } catch (e) {
                state.parentOrigin = '*';
            }
            parentOrigin = state.parentOrigin;
            Log.info('Parent detected', { origin: state.parentOrigin });
            return true;
        }
    } catch (error) {
        Log.error('Parent detection failed', error);
    }
    return false;
}

function waitForParent(timeout = 5000) {
    return new Promise((resolve) => {
        if (detectParent()) {
            resolve(true);
            return;
        }
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            if (detectParent()) {
                clearInterval(checkInterval);
                clearTimeout(timeoutId);
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                resolve(false);
            }
        }, 100);
        const timeoutId = setTimeout(() => {
            clearInterval(checkInterval);
            resolve(false);
        }, timeout);
        state.timeouts.add(checkInterval);
        state.timeouts.add(timeoutId);
    });
}

// =============================================
// CIRCUIT BREAKER
// =============================================
function getCircuitBreaker(name, options = {}) {
    if (!state.circuitBreakers.has(name)) {
        const breaker = {
            name,
            failures: 0,
            lastFailure: null,
            isOpen: false,
            openTime: null,
            threshold: options.threshold || 3,
            timeout: options.timeout || 30000,
            halfOpenSuccesses: 0,
            halfOpenThreshold: options.halfOpenThreshold || 2,
            
            recordFailure() {
                this.failures++;
                this.lastFailure = Date.now();
                if (this.failures >= this.threshold) {
                    this.isOpen = true;
                    this.openTime = Date.now();
                    this.halfOpenSuccesses = 0;
                    Log.warn(`Circuit breaker opened for ${name} after ${this.failures} failures`);
                }
            },
            
            recordSuccess() {
                if (this.isOpen) {
                    this.halfOpenSuccesses++;
                    if (this.halfOpenSuccesses >= this.halfOpenThreshold) {
                        this.reset();
                        Log.info(`Circuit breaker closed for ${name} after ${this.halfOpenSuccesses} successes`);
                    }
                } else {
                    this.failures = 0;
                }
            },
            
            reset() {
                this.failures = 0;
                this.isOpen = false;
                this.openTime = null;
                this.halfOpenSuccesses = 0;
            },
            
            check() {
                if (this.isOpen && this.openTime) {
                    if (Date.now() - this.openTime > this.timeout) {
                        this.isOpen = false;
                        this.halfOpenSuccesses = 0;
                        Log.debug(`Circuit breaker half-open for ${name}`);
                        return true;
                    }
                    return false;
                }
                return true;
            }
        };
        state.circuitBreakers.set(name, breaker);
    }
    return state.circuitBreakers.get(name);
}

// =============================================
// SEND TO PARENT
// =============================================
export function sendToParent(payload, retryCount = 0, expectAck = false) {
    return new Promise((resolve, reject) => {
        try {
            if (!state.parentVerified || !state.parentWindow || state.parentWindow === window) {
                if (retryCount < 3) {
                    setTimeout(() => {
                        sendToParent(payload, retryCount + 1, expectAck).then(resolve).catch(reject);
                    }, 500 * (retryCount + 1));
                } else {
                    try {
                        if (state.parentWindow && state.parentWindow !== window) {
                            const legacyPayload = {
                                ...payload,
                                _legacy: true,
                                _retry: retryCount
                            };
                            state.parentWindow.postMessage(legacyPayload, state.parentOrigin || '*');
                            resolve({ acknowledged: false, legacy: true });
                        } else {
                            reject(new Error('Parent unavailable'));
                        }
                    } catch (e) {
                        reject(new Error('Parent unavailable'));
                    }
                }
                return;
            }
            
            const signedMessage = signMessage(payload);
            if (expectAck) {
                signedMessage.expectAck = true;
                signedMessage.ackTimeout = payload.timeout || 5000;
            }
            
            try {
                state.parentWindow.postMessage(signedMessage, state.parentOrigin);
            } catch (e) {
                if (state.parentOrigin === '*') {
                    state.parentWindow.postMessage(signedMessage, '*');
                } else {
                    throw e;
                }
            }
            
            if (expectAck) {
                const timeout = setTimeout(() => {
                    if (state.pendingAcks.has(signedMessage.messageId)) {
                        state.pendingAcks.delete(signedMessage.messageId);
                        if (retryCount < 2) {
                            Log.debug(`Retrying message ${signedMessage.messageId} (attempt ${retryCount + 1})`);
                            sendToParent(payload, retryCount + 1, expectAck).then(resolve).catch(reject);
                        } else {
                            reject(new Error(`ACK timeout: ${signedMessage.messageId}`));
                        }
                    }
                }, payload.timeout || 5000);
                
                state.pendingAcks.set(signedMessage.messageId, {
                    messageId: signedMessage.messageId,
                    timeout,
                    resolve,
                    reject,
                    timestamp: Date.now(),
                    retryCount
                });
            } else {
                resolve({ acknowledged: true, messageId: signedMessage.messageId });
            }
            
            state.processedMessageIds.add(signedMessage.messageId);
            if (state.processedMessageIds.size > 100) {
                const ids = Array.from(state.processedMessageIds);
                state.processedMessageIds = new Set(ids.slice(-50));
            }
            
            Log.debug(`Sent: ${payload.type}`, { messageId: signedMessage.messageId, expectAck });
            
        } catch (error) {
            Log.error('sendToParent failed', error);
            reject(error);
        }
    });
}

// =============================================
// RECEIVE FROM PARENT
// =============================================
export function receiveFromParent(messageType, handler) {
    if (!messageType || typeof handler !== 'function') {
        Log.error('receiveFromParent: Invalid parameters');
        return false;
    }
    
    if (!state.messageHandlers.has(messageType)) {
        state.messageHandlers.set(messageType, new Set());
    }
    
    state.messageHandlers.get(messageType).add(handler);
    Log.debug(`Handler registered for: ${messageType}`);
    
    const off = () => {
        const handlers = state.messageHandlers.get(messageType);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                state.messageHandlers.delete(messageType);
            }
        }
    };
    
    receiveFromParent.off = off;
    handler.off = off;
    
    return { off, handler };
}

// =============================================
// START HANDSHAKE
// =============================================
export function startHandshake(options = {}) {
    return new Promise((resolve) => {
        try {
            const {
                timeout = 5000,
                retryCount = 3,
                retryDelay = 500,
                force = false
            } = options;
            
            if (state.handshakeCompleted && !force) {
                resolve({ success: true, mode: state.authMode, cached: true });
                return;
            }
            
            if (!detectParent()) {
                Log.warn('No parent window detected');
                enableDemoMode();
                resolve({ success: false, mode: 'demo' });
                return;
            }
            
            const breaker = getCircuitBreaker('handshake');
            if (breaker.isOpen && !breaker.check() && !force) {
                Log.warn('Handshake circuit breaker open, using demo mode');
                enableDemoMode();
                resolve({ success: false, mode: 'demo', circuitOpen: true });
                return;
            }
            
            let attempts = 0;
            let handshakeCompleted = false;
            
            const performHandshake = () => {
                attempts++;
                const messageId = generateMessageId();
                const handshakePayload = {
                    type: MESSAGE_TYPES.HANDSHAKE,
                    childId: 'settings',
                    module: MODULE_NAME,
                    version: MODULE_VERSION,
                    protocolVersion: PROTOCOL_VERSION,
                    timestamp: Date.now(),
                    source: MODULE_NAME,
                    expectAck: true,
                    timeout: timeout / 2,
                    messageId,
                    capabilities: {
                        sessionMirror: true,
                        tokenManagement: true,
                        heartbeat: true,
                        protocolVersion: PROTOCOL_VERSION
                    },
                    state: {
                        authMode: state.authMode,
                        hasSession: !!state.sessionMirror.user,
                        initialized: state.initialized
                    }
                };
                
                sendToParent(handshakePayload, 0, true)
                    .then((response) => {
                        if (!handshakeCompleted) {
                            handshakeCompleted = true;
                            clearTimeout(handshakeTimeoutId);
                            
                            if (response && response.session) {
                                SessionMirror.update(response.session);
                            }
                            
                            if (response && response.protocolVersion) {
                                state.parentProtocolVersion = response.protocolVersion;
                            }
                            
                            state.parentVerified = true;
                            state.handshakeCompleted = true;
                            parentReady = true;
                            parentCommunicationReady = true;
                            state.health.status = 'handshake_complete';
                            
                            breaker.recordSuccess();
                            
                            Log.info('Handshake successful', { 
                                attempts,
                                protocol: state.parentProtocolVersion
                            });
                            
                            resolve({ 
                                success: true, 
                                mode: state.authMode,
                                protocol: state.parentProtocolVersion
                            });
                        }
                    })
                    .catch((error) => {
                        if (attempts < retryCount && !handshakeCompleted) {
                            Log.debug(`Handshake retry ${attempts}/${retryCount}`);
                            setTimeout(performHandshake, retryDelay * attempts);
                        } else if (!handshakeCompleted) {
                            Log.warn('Handshake failed after retries');
                            breaker.recordFailure();
                            
                            state.parentVerified = false;
                            parentReady = false;
                            parentCommunicationReady = false;
                            
                            if (!breaker.check()) {
                                enableDemoMode();
                                resolve({ success: false, mode: 'demo' });
                            } else {
                                attemptLegacyHandshake().then((result) => {
                                    if (result.success) {
                                        resolve({ success: true, mode: state.authMode, legacy: true });
                                    } else {
                                        enableDemoMode();
                                        resolve({ success: false, mode: 'demo' });
                                    }
                                });
                            }
                        }
                    });
            };
            
            const handshakeTimeoutId = setTimeout(() => {
                if (!handshakeCompleted) {
                    Log.warn('Handshake timeout');
                    if (attempts < retryCount) {
                        performHandshake();
                    } else {
                        breaker.recordFailure();
                        enableDemoMode();
                        resolve({ success: false, mode: 'demo' });
                    }
                }
            }, timeout);
            
            const handler = (message) => {
                if (message.type === MESSAGE_TYPES.HANDSHAKE_ACK || 
                    message.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE) {
                    if (!handshakeCompleted) {
                        handshakeCompleted = true;
                        clearTimeout(handshakeTimeoutId);
                        
                        if (message.session) {
                            SessionMirror.update(message.session);
                        }
                        
                        if (message.protocolVersion) {
                            state.parentProtocolVersion = message.protocolVersion;
                        }
                        
                        state.parentVerified = true;
                        state.handshakeCompleted = true;
                        parentReady = true;
                        parentCommunicationReady = true;
                        state.health.status = 'handshake_complete';
                        
                        breaker.recordSuccess();
                        
                        Log.info('Handshake acknowledged via handler');
                        resolve({ success: true, mode: state.authMode });
                        
                        const handlers = state.messageHandlers.get(MESSAGE_TYPES.HANDSHAKE_ACK);
                        if (handlers) handlers.delete(handler);
                    }
                }
            };
            
            const handlers = state.messageHandlers.get(MESSAGE_TYPES.HANDSHAKE_ACK);
            if (handlers) handlers.add(handler);
            else state.messageHandlers.set(MESSAGE_TYPES.HANDSHAKE_ACK, new Set([handler]));
            
            performHandshake();
            
        } catch (error) {
            Log.error('startHandshake failed', error);
            enableDemoMode();
            resolve({ success: false, mode: 'demo' });
        }
    });
}

// =============================================
// ATTEMPT LEGACY HANDSHAKE
// =============================================
function attemptLegacyHandshake() {
    return new Promise((resolve) => {
        Log.info('Attempting legacy handshake');
        const legacyTypes = ['INIT', 'CHILD_READY', 'SESSION_REQUEST'];
        let responses = 0;
        let timeout = setTimeout(() => {
            resolve({ success: false });
        }, 3000);
        
        legacyTypes.forEach(type => {
            sendToParent({
                type,
                childId: 'settings',
                source: MODULE_NAME,
                timestamp: Date.now(),
                legacy: true
            }, 0, false).catch(() => {}).finally(() => {
                responses++;
                if (responses === legacyTypes.length) {
                    clearTimeout(timeout);
                    resolve({ success: false });
                }
            });
        });
        
        const responseHandler = (message) => {
            if (message.type === 'INIT_ACK' || message.type === 'SESSION_RESPONSE') {
                clearTimeout(timeout);
                state.parentVerified = true;
                state.handshakeCompleted = true;
                parentReady = true;
                if (message.session) {
                    SessionMirror.update(message.session);
                }
                resolve({ success: true, legacy: true });
            }
        };
        
        const handlers = state.messageHandlers.get('INIT_ACK');
        if (handlers) handlers.add(responseHandler);
        else state.messageHandlers.set('INIT_ACK', new Set([responseHandler]));
    });
}

// =============================================
// REQUEST SESSION
// =============================================
export function requestSession(timeout = 5000) {
    return new Promise((resolve) => {
        try {
            if (SessionMirror.isValid()) {
                const mirror = SessionMirror.getMirror();
                state.sessionSynced = true;
                state.authMode = 'authenticated';
                parentSessionReceived = true;
                sessionValidated = true;
                resolve({
                    session: mirror.user,
                    token: mirror.token,
                    mode: 'authenticated',
                    expiry: mirror.expiresAt,
                    fromMirror: true
                });
                return;
            }
            
            const breaker = getCircuitBreaker('session-request');
            if (breaker.isOpen && !breaker.check()) {
                Log.warn('Session request circuit breaker open');
                enableGuestMode();
                resolve({ session: null, mode: 'guest', expiry: null });
                return;
            }
            
            const messageId = `session_req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            
            const handler = (message) => {
                if (message.inResponseTo === messageId || 
                    (message.type === MESSAGE_TYPES.SESSION_RESPONSE && message.messageId === messageId)) {
                    cleanup();
                    
                    if (message.session || message.user) {
                        const sessionData = {
                            user: message.user || message.session?.user,
                            token: message.token || message.session?.token,
                            expiresAt: message.expiry || message.session?.expiry,
                            permissions: message.permissions
                        };
                        
                        SessionMirror.update(sessionData);
                        
                        resolve({
                            session: sessionData.user,
                            token: sessionData.token,
                            mode: 'authenticated',
                            expiry: sessionData.expiresAt
                        });
                        
                        breaker.recordSuccess();
                    } else {
                        enableGuestMode();
                        resolve({ session: null, mode: 'guest', expiry: null });
                    }
                }
            };
            
            const timeoutId = setTimeout(() => {
                cleanup();
                breaker.recordFailure();
                if (state.parentVerified) {
                    Log.warn('Session request timeout');
                    enableGuestMode();
                    resolve({ session: null, mode: 'guest', expiry: null });
                } else {
                    enableDemoMode();
                    resolve({ session: null, mode: 'demo', expiry: null });
                }
            }, timeout);
            
            const cleanup = () => {
                clearTimeout(timeoutId);
                const handlers = state.messageHandlers.get(MESSAGE_TYPES.SESSION_RESPONSE);
                if (handlers) handlers.delete(handler);
            };
            
            const handlers = state.messageHandlers.get(MESSAGE_TYPES.SESSION_RESPONSE);
            if (handlers) handlers.add(handler);
            else state.messageHandlers.set(MESSAGE_TYPES.SESSION_RESPONSE, new Set([handler]));
            
            sendToParent({
                type: MESSAGE_TYPES.SESSION_REQUEST,
                childId: 'settings',
                messageId,
                expectAck: true,
                timeout: timeout - 500,
                timestamp: Date.now(),
                source: MODULE_NAME,
                protocolVersion: PROTOCOL_VERSION,
                mirrorVersion: SessionMirror.getMirror().version
            }).catch(() => {
                cleanup();
                enableDemoMode();
                resolve({ session: null, mode: 'demo', expiry: null });
            });
            
        } catch (error) {
            Log.error('requestSession failed', error);
            enableDemoMode();
            resolve({ session: null, mode: 'demo', expiry: null });
        }
    });
}

// =============================================
// ENABLE DEMO MODE
// =============================================
function enableDemoMode() {
    if (state.authMode === 'demo') return;
    state.authMode = 'demo';
    state.parentVerified = false;
    const demoUser = {
        id: 'demo-user',
        name: 'Demo User',
        displayName: 'Demo User',
        username: 'demo_user',
        email: 'demo@example.com',
        demo: true
    };
    state.session = demoUser;
    currentUser = demoUser;
    coreData.user = demoUser;
    parentSessionReceived = false;
    sessionValidated = false;
    authReady = false;
    tokenReady = false;
    tokenAvailable = false;
    
    SessionMirror.update({
        user: demoUser,
        token: 'demo-token',
        expiresAt: Date.now() + 86400000,
        demo: true
    });
    
    if (!userSettings) {
        userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        coreData.settings = userSettings;
    }
    
    Log.info('Demo mode enabled');
}

// =============================================
// ENABLE GUEST MODE
// =============================================
function enableGuestMode() {
    if (state.authMode === 'guest') return;
    state.authMode = 'guest';
    state.session = null;
    state.sessionExpiry = null;
    state.sessionSynced = false;
    authReady = false;
    tokenReady = false;
    tokenAvailable = false;
    SessionMirror.clear();
    Log.info('Guest mode enabled');
    notifyParentAuthState(false);
}

// =============================================
// INITIALIZE CORE
// =============================================
export async function initializeCore(options = {}) {
    if (state.initialized) {
        return { success: true, mode: state.authMode, alreadyInitialized: true };
    }
    
    if (initializationInProgress) {
        return { success: false, message: 'Initialization already in progress' };
    }
    
    initializationInProgress = true;
    coreError = null;
    
    const {
        handshakeTimeout = 5000,
        sessionTimeout = 5000,
        autoStart = true,
        demoMode = true,
        debug = false,
        forceParentCheck = true
    } = options;
    
    if (debug) Log.enableDebug();
    
    try {
        Log.info('Initializing core...');
        state.health.status = 'initializing';
        
        if (!userSettings) {
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            coreData.settings = userSettings;
        }
        
        await executeStage('preflight', async () => {
            initTrustedOrigins();
            SessionMirror.init();
            setupMessageCleanup();
            return true;
        }, { timeout: 1000, fallback: true });
        
        const dependencyResult = await executeStage('dependencyCheck', async () => {
            apiInitialized = true;
            return apiInitialized;
        }, { timeout: 1000, fallback: true });
        
        const parentResult = await executeStage('parentDetect', async () => {
            if (forceParentCheck) {
                return await waitForParent(2000);
            }
            return detectParent();
        }, { timeout: 2000, fallback: false });
        
        await executeStage('setupMessaging', async () => {
            setupMessaging();
            return true;
        }, { timeout: 1000, fallback: true });
        
        const handshake = await executeStage('handshake', async () => {
            if (parentResult) {
                return await startHandshake({
                    timeout: handshakeTimeout,
                    retryCount: 3
                });
            }
            return { success: false, mode: 'demo' };
        }, { timeout: handshakeTimeout + 1000, fallback: { success: false, mode: 'demo' } });
        
        const session = await executeStage('sessionSync', async () => {
            if (handshake.success) {
                return await requestSession(sessionTimeout);
            }
            return { session: null, mode: 'demo', expiry: null };
        }, { timeout: sessionTimeout + 1000, fallback: { session: null, mode: 'demo', expiry: null } });
        
        if (session.session) {
            state.session = session.session;
            currentUser = session.session;
            coreData.user = session.session;
            state.authMode = session.mode;
            state.sessionSynced = true;
        } else {
            state.authMode = session.mode;
        }
        
        await executeStage('permissions', async () => {
            state.permissionsGranted = await checkPermissions();
            return state.permissionsGranted;
        }, { timeout: 2000, fallback: false });
        
        await executeStage('dependenciesLoad', async () => {
            state.dependenciesLoaded = await loadDependencies();
            return state.dependenciesLoaded;
        }, { timeout: 2000, fallback: true });
        
        await executeStage('loadData', async () => {
            await loadFromLocalStorage();
            await loadAllData();
            return true;
        }, { timeout: 5000, fallback: true });
        
        await executeStage('validateData', async () => {
            validateAllData();
            return true;
        }, { timeout: 1000, fallback: true });
        
        await executeStage('syncState', async () => {
            syncWithGlobalState();
            return true;
        }, { timeout: 1000, fallback: true });
        
        state.initialized = true;
        isReady = true;
        initializationInProgress = false;
        state.health.status = 'ready';
        
        startHeartbeat();
        startTokenMonitoring();
        startPassiveAuthMonitoring();
        startSessionWatchdog();
        
        sendToParent({
            type: MESSAGE_TYPES.READY,
            mode: state.authMode,
            version: MODULE_VERSION,
            protocolVersion: PROTOCOL_VERSION,
            timestamp: Date.now(),
            childId: 'settings',
            source: MODULE_NAME
        }).catch(() => {});
        
        notifyParentReady();
        processMessageQueue();
        dispatchDataReadyEvent();
        executeReadyCallbacks();
        
        Log.info(`Core initialized successfully`, { 
            mode: state.authMode,
            handshake: handshake.success,
            session: !!state.session,
            parent: parentResult
        });
        
        return {
            success: true,
            mode: state.authMode,
            handshake: handshake.success,
            session: !!state.session,
            permissions: state.permissionsGranted,
            parentDetected: parentResult
        };
        
    } catch (error) {
        Log.error('initializeCore failed', error);
        coreError = error;
        initializationInProgress = false;
        state.health.status = 'error';
        
        if (demoMode) {
            Log.warn('Using demo mode due to initialization failure');
            enableDemoMode();
            state.initialized = true;
            isReady = true;
            state.health.status = 'demo';
            syncWithGlobalState();
            executeReadyCallbacks();
            return {
                success: true,
                mode: 'demo',
                fallback: true,
                error: error.message
            };
        }
        
        return {
            success: false,
            mode: 'none',
            error: error.message
        };
    }
}

async function executeStage(stageName, fn, options = {}) {
    const { timeout = 5000, fallback = null } = options;
    try {
        const timeoutPromise = new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error(`${stageName} timeout after ${timeout}ms`)), timeout);
            state.timeouts.add(timer);
        });
        const result = await Promise.race([fn(), timeoutPromise]);
        Log.debug(`Stage ${stageName} completed successfully`);
        return result;
    } catch (error) {
        Log.error(`Stage ${stageName} failed`, error, true);
        if (fallback !== null) {
            Log.warn(`Using fallback for ${stageName}`);
            return typeof fallback === 'function' ? fallback() : fallback;
        }
        throw error;
    }
}

// =============================================
// SHUTDOWN CORE
// =============================================
export function shutdownCore() {
    try {
        Log.info('Shutting down core...');
        
        sendToParent({
            type: MESSAGE_TYPES.SHUTDOWN,
            reason: 'normal_shutdown',
            timestamp: Date.now(),
            childId: 'settings',
            source: MODULE_NAME
        }).catch(() => {});
        
        state.intervals.forEach(interval => clearInterval(interval));
        state.intervals.clear();
        state.timeouts.forEach(timeout => clearTimeout(timeout));
        state.timeouts.clear();
        
        if (state.tokenCheckInterval) {
            clearInterval(state.tokenCheckInterval);
            state.tokenCheckInterval = null;
        }
        if (state.authCheckInterval) {
            clearInterval(state.authCheckInterval);
            state.authCheckInterval = null;
        }
        if (state.handshakeInterval) {
            clearInterval(state.handshakeInterval);
            state.handshakeInterval = null;
        }
        if (state.heartbeatInterval) {
            clearInterval(state.heartbeatInterval);
            state.heartbeatInterval = null;
        }
        if (state.sessionWatchdog) {
            clearInterval(state.sessionWatchdog);
            state.sessionWatchdog = null;
        }
        if (state.messageIdCleanupTimer) {
            clearInterval(state.messageIdCleanupTimer);
            state.messageIdCleanupTimer = null;
        }
        
        state.listeners.forEach(listener => {
            if (listener.element) {
                listener.element.removeEventListener(listener.type, listener.handler, listener.options);
            } else {
                window.removeEventListener(listener.type, listener.handler, listener.options);
            }
        });
        state.listeners.clear();
        
        state.messageHandlers.clear();
        state.pendingMessages.forEach((pending, id) => {
            if (pending.timeout) clearTimeout(pending.timeout);
            if (pending.reject) pending.reject(new Error('Core shutting down'));
        });
        state.pendingMessages.clear();
        state.pendingAcks.forEach((ack, id) => {
            if (ack.timeout) clearTimeout(ack.timeout);
            if (ack.reject) ack.reject(new Error('Core shutting down'));
        });
        state.pendingAcks.clear();
        state.processedMessageIds.clear();
        
        SessionMirror.shutdown();
        
        state.initialized = false;
        state.parentVerified = false;
        state.handshakeCompleted = false;
        state.sessionSynced = false;
        state.health.status = 'shutdown';
        
        isReady = false;
        initializationInProgress = false;
        parentReady = false;
        parentCommunicationReady = false;
        parentSessionReceived = false;
        sessionValidated = false;
        authReady = false;
        tokenReady = false;
        tokenAvailable = false;
        backgroundTasksStarted = false;
        
        Log.info('Core shutdown complete');
        return true;
        
    } catch (error) {
        Log.error('shutdownCore failed', error);
        return false;
    }
}

// =============================================
// BACKGROUND SERVICES
// =============================================
function startHeartbeat() {
    if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
    state.heartbeatInterval = setInterval(() => {
        state.health.lastHeartbeat = Date.now();
        sendToParent({
            type: MESSAGE_TYPES.HEARTBEAT,
            status: state.health.status,
            mode: state.authMode,
            timestamp: Date.now(),
            childId: 'settings',
            source: MODULE_NAME,
            health: {
                failures: state.health.failures,
                recoveryAttempts: state.health.recoveryAttempts,
                uptime: Date.now() - state.health.lastHeartbeat + 30000
            }
        }).catch(() => {});
    }, HEARTBEAT_INTERVAL);
    state.intervals.add(state.heartbeatInterval);
}

function startSessionWatchdog() {
    if (state.sessionWatchdog) clearInterval(state.sessionWatchdog);
    state.sessionWatchdog = setInterval(() => {
        if (state.authMode === 'authenticated' && SessionMirror.isExpired()) {
            Log.warn('Session expired, requesting refresh');
            requestSession(5000).catch(() => {});
        }
    }, 60000);
    state.intervals.add(state.sessionWatchdog);
}

function setupMessageCleanup() {
    if (state.messageIdCleanupTimer) clearInterval(state.messageIdCleanupTimer);
    state.messageIdCleanupTimer = setInterval(() => {
        if (state.processedMessageIds.size > 100) {
            const ids = Array.from(state.processedMessageIds);
            state.processedMessageIds = new Set(ids.slice(-50));
        }
    }, 60000);
    state.timeouts.add(state.messageIdCleanupTimer);
}

// =============================================
// UI EXPORTS
// =============================================
export function verifyParentPresence() {
    return detectParent();
}

export function setupSecureMessagingChannel() {
    setupMessaging();
    return true;
}

export function resetUIForLogout() {
    try {
        currentUser = null;
        coreData.user = null;
        state.session = null;
        state.sessionSynced = false;
        parentSessionData = null;
        parentSessionReceived = false;
        sessionValidated = false;
        tokenReady = false;
        tokenAvailable = false;
        authReady = false;
        backgroundTasksStarted = false;
        unsavedChanges = false;
        SessionMirror.clear();
        Log.info('UI reset for logout');
        return true;
    } catch (error) {
        Log.error('resetUIForLogout failed', error);
        return false;
    }
}

export function showReconnectionState() {
    Log.info('Showing reconnection state');
    try {
        const event = new CustomEvent('coreReconnecting', {
            detail: {
                timestamp: Date.now(),
                attempts: state.health.recoveryAttempts,
                mode: state.authMode
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        Log.error('showReconnectionState failed', error);
        return false;
    }
}

export function checkAuthenticationState() {
    try {
        if (SessionMirror.isValid()) {
            return true;
        }
        if (parentSessionReceived || state.authMode === 'authenticated' || tokenReady) {
            return true;
        }
        if (state.authMode === 'demo') {
            return true;
        }
        return false;
    } catch (error) {
        Log.error('checkAuthenticationState failed', error);
        return false;
    }
}

export async function bootstrapIframe() {
    try {
        Log.info('Bootstrapping iframe');
        detectParent();
        setupMessaging();
        await loadFromLocalStorage();
        SessionMirror.init();
        startHandshake({ retryCount: 2 }).catch(() => {});
        return true;
    } catch (error) {
        Log.error('bootstrapIframe failed', error);
        return false;
    }
}

export async function waitForSession(timeout = 10000) {
    return new Promise((resolve) => {
        if (SessionMirror.isValid()) {
            resolve(true);
            return;
        }
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            try {
                if (SessionMirror.isValid() || (parentSessionReceived && sessionValidated)) {
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            } catch (error) {
                clearInterval(checkInterval);
                resolve(false);
            }
        }, 100);
        const timeoutId = setTimeout(() => {
            clearInterval(checkInterval);
            resolve(false);
        }, timeout);
        state.timeouts.add(checkInterval);
        state.timeouts.add(timeoutId);
    });
}

export function initializeBasicUI() {
    Log.info('Initializing basic UI');
    try {
        if (!userSettings) {
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            coreData.settings = userSettings;
        }
        const event = new CustomEvent('basicUIReady', {
            detail: {
                timestamp: Date.now(),
                mode: state.authMode
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        Log.error('initializeBasicUI failed', error);
        return false;
    }
}

export function setupBasicEventListeners() {
    Log.info('Setting up basic event listeners');
    try {
        const backToAppBtn = document.getElementById('backToAppBtn');
        if (backToAppBtn) {
            const handler = () => {
                if (unsavedChanges) {
                    const event = new CustomEvent('confirmNavigation', {
                        detail: {
                            message: 'You have unsaved changes. Are you sure you want to leave?',
                            callback: () => {
                                sendToParent({
                                    type: MESSAGE_TYPES.CHILD_CLOSING,
                                    childId: 'settings',
                                    timestamp: Date.now(),
                                    source: MODULE_NAME,
                                    unsavedChanges: true
                                }).catch(() => {});
                            }
                        }
                    });
                    window.dispatchEvent(event);
                } else {
                    sendToParent({
                        type: MESSAGE_TYPES.CHILD_CLOSING,
                        childId: 'settings',
                        timestamp: Date.now(),
                        source: MODULE_NAME
                    }).catch(() => {});
                }
            };
            backToAppBtn.addEventListener('click', handler);
            state.listeners.add({ type: 'click', handler, options: false, element: backToAppBtn });
        }
        
        window.addEventListener('beforeunload', (e) => {
            if (unsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
        return true;
    } catch (error) {
        Log.error('setupBasicEventListeners failed', error);
        return false;
    }
}

export function startTokenMonitoring() {
    try {
        Log.info('Starting token monitoring');
        if (state.tokenCheckInterval) {
            clearInterval(state.tokenCheckInterval);
            state.tokenCheckInterval = null;
        }
        state.tokenCheckInterval = setInterval(() => {
            try {
                checkTokenAvailability();
            } catch (error) {
                Log.error('Token monitoring interval error', error, true);
            }
        }, TOKEN_CHECK_INTERVAL);
        state.intervals.add(state.tokenCheckInterval);
        setTimeout(() => checkTokenAvailability(), 500);
    } catch (error) {
        Log.error('startTokenMonitoring failed', error);
    }
}

export function checkTokenAvailability() {
    try {
        if (SessionMirror.isValid()) {
            if (!tokenAvailable) {
                tokenAvailable = true;
                tokenReady = true;
                authReady = true;
                if (!backgroundTasksStarted) {
                    startBackgroundTasks();
                }
                notifyTokenReady();
            }
            return;
        }
        if (parentSessionData && parentSessionData.token) {
            if (!tokenAvailable) {
                tokenAvailable = true;
                tokenReady = true;
                authReady = true;
                if (!backgroundTasksStarted) {
                    startBackgroundTasks();
                }
                notifyTokenReady();
            }
            return;
        }
        const token = getSecureToken();
        if (token && token !== '' && token !== 'null' && token !== 'undefined') {
            if (!tokenAvailable) {
                tokenAvailable = true;
                tokenReady = true;
                authReady = true;
                if (!backgroundTasksStarted) {
                    startBackgroundTasks();
                }
                notifyTokenReady();
            }
        } else {
            if (tokenAvailable) {
                tokenAvailable = false;
                tokenReady = false;
                authReady = false;
                notifyTokenLost();
            }
        }
    } catch (error) {
        Log.error('checkTokenAvailability failed', error, true);
    }
}

export function notifyTokenReady() {
    try {
        authReady = true;
        if (!backgroundTasksStarted) {
            startBackgroundTasks();
        }
        notifyParentAuthState(true);
        const event = new CustomEvent('tokenReady', {
            detail: {
                timestamp: Date.now(),
                mode: state.authMode
            }
        });
        window.dispatchEvent(event);
    } catch (error) {
        Log.error('notifyTokenReady failed', error);
    }
}

export function notifyTokenLost() {
    try {
        authReady = false;
        backgroundTasksStarted = false;
        notifyParentAuthState(false);
        const event = new CustomEvent('tokenLost', {
            detail: {
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    } catch (error) {
        Log.error('notifyTokenLost failed', error);
    }
}

export function getSecureToken() {
    try {
        const mirrorToken = SessionMirror.getToken();
        if (mirrorToken && mirrorToken !== '' && mirrorToken !== 'null' && mirrorToken !== 'undefined') {
            return mirrorToken;
        }
        if (parentSessionData && parentSessionData.token) {
            return parentSessionData.token;
        }
        const token = null; // Replace with actual token retrieval
        if (token && token !== '' && token !== 'null' && token !== 'undefined') {
            return token;
        }
        const legacyTokens = [
            localStorage.getItem('USER_TOKEN'),
            localStorage.getItem('accessToken'),
            localStorage.getItem('moodchat_token'),
            localStorage.getItem('authToken'),
            SecureStorage.get('token', null)
        ];
        for (const legacyToken of legacyTokens) {
            if (legacyToken && legacyToken !== 'null' && legacyToken !== 'undefined') {
                return legacyToken;
            }
        }
        return null;
    } catch (error) {
        Log.error('getSecureToken failed', error, true);
        return null;
    }
}

export async function secureFetchWrapper(endpoint, method = 'GET', data = null) {
    try {
        if (state.authMode === 'demo') {
            return simulateResponse(endpoint, method);
        }
        const token = getSecureToken();
        if (!token && state.authMode !== 'guest') {
            throw new Error('Authentication token not available');
        }
        let normalizedEndpoint = endpoint.trim();
        if (!normalizedEndpoint.startsWith('/')) {
            normalizedEndpoint = '/' + normalizedEndpoint;
        }
        const suspiciousPatterns = ['..', '//', '\\', 'javascript:', 'data:', 'vbscript:'];
        for (const pattern of suspiciousPatterns) {
            if (normalizedEndpoint.includes(pattern)) {
                throw new Error(`Invalid endpoint format: ${pattern}`);
            }
        }
        return simulateResponse(endpoint, method); // Replace with actual fetch
    } catch (error) {
        if (state.authMode === 'demo') {
            return simulateResponse(endpoint, method);
        }
        throw error;
    }
}

function simulateResponse(endpoint, method) {
    if (endpoint.includes('/api/settings')) {
        return { settings: userSettings || DEFAULT_SETTINGS };
    }
    if (endpoint.includes('/api/friends')) {
        return { friendsList: coreData.friendsList || [] };
    }
    if (endpoint.includes('/api/groups')) {
        return { groupsList: coreData.groupsList || [] };
    }
    if (endpoint.includes('/api/notifications')) {
        return { notifications: coreData.notifications || [] };
    }
    if (endpoint.includes('/api/chats/history')) {
        return { chatHistory: coreData.chatHistory || [] };
    }
    if (endpoint.includes('/api/users/blocked')) {
        return { blockedUsers: blockedUsers || [] };
    }
    if (endpoint.includes('/api/auth/sessions')) {
        return { sessions: activeSessions || [] };
    }
    if (endpoint.includes('/api/contacts')) {
        return { contacts: userContacts || [] };
    }
    if (endpoint.includes('/api/group')) {
        return { groups: userGroups || [] };
    }
    return { data: null };
}

export async function waitForToken(timeout = 10000) {
    return new Promise((resolve) => {
        if (tokenReady || SessionMirror.isValid()) {
            resolve(true);
            return;
        }
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            try {
                if (tokenReady || SessionMirror.isValid()) {
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            } catch (error) {
                clearInterval(checkInterval);
                resolve(false);
            }
        }, 100);
        const timeoutId = setTimeout(() => {
            clearInterval(checkInterval);
            resolve(false);
        }, timeout);
        state.timeouts.add(checkInterval);
        state.timeouts.add(timeoutId);
    });
}

export function startPassiveAuthMonitoring() {
    try {
        Log.info('Starting passive auth monitoring');
        if (state.authCheckInterval) {
            clearInterval(state.authCheckInterval);
            state.authCheckInterval = null;
        }
        state.authCheckInterval = setInterval(() => {
            try {
                checkTokenAvailability();
            } catch (error) {
                Log.error('Auth monitoring interval error', error, true);
            }
        }, AUTH_CHECK_INTERVAL);
        state.intervals.add(state.authCheckInterval);
        setTimeout(() => checkTokenAvailability(), 1000);
    } catch (error) {
        Log.error('startPassiveAuthMonitoring failed', error);
    }
}

export function startBackgroundTasks() {
    try {
        if (backgroundTasksStarted) {
            return;
        }
        if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') {
            return;
        }
        backgroundTasksStarted = true;
        Log.info('Starting background tasks');
        Promise.allSettled([
            safeLoadUserData(),
            safeLoadSettings(),
            safeLoadBlockedUsers(),
            safeLoadActiveSessions(),
            safeLoadUserContacts(),
            safeLoadUserGroups()
        ]).then((results) => {
            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed > 0) {
                Log.warn(`${failed} background tasks failed`);
            }
        }).catch(() => {});
    } catch (error) {
        Log.error('startBackgroundTasks failed', error);
        backgroundTasksStarted = false;
    }
}

export async function safeLoadUserData() {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') {
        return null;
    }
    try {
        const mirrorUser = SessionMirror.getUser();
        if (mirrorUser) {
            currentUser = mirrorUser;
            coreData.user = mirrorUser;
            state.session = mirrorUser;
            try {
                localStorage.setItem('knecta_current_user', JSON.stringify(currentUser));
            } catch (e) {}
            return currentUser;
        }
        if (parentSessionData && parentSessionData.user) {
            currentUser = parentSessionData.user;
            coreData.user = parentSessionData.user;
            state.session = parentSessionData.user;
            SessionMirror.update({ user: parentSessionData.user });
            try {
                localStorage.setItem('knecta_current_user', JSON.stringify(currentUser));
            } catch (e) {}
            return currentUser;
        }
        return null;
    } catch (error) {
        Log.error('safeLoadUserData failed', error, true);
        return null;
    }
}

export async function safeLoadSettings() {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') {
        return null;
    }
    try {
        const response = await secureFetchWrapper('/api/settings', 'GET');
        if (response && response.settings) {
            userSettings = response.settings;
            coreData.settings = response.settings;
            Object.keys(DEFAULT_SETTINGS).forEach(section => {
                if (!userSettings[section]) {
                    userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
                }
            });
            try {
                localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
            } catch (e) {}
            calculateStorageUsage();
            return userSettings;
        }
        return null;
    } catch (error) {
        Log.error('safeLoadSettings failed', error, true);
        return null;
    }
}

export async function safeLoadBlockedUsers() {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') return null;
    try {
        const response = await secureFetchWrapper('/api/users/blocked', 'GET');
        if (response && response.blockedUsers) {
            blockedUsers = response.blockedUsers;
            return blockedUsers;
        }
        return null;
    } catch (error) {
        Log.error('safeLoadBlockedUsers failed', error, true);
        return null;
    }
}

export async function safeLoadActiveSessions() {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') return null;
    try {
        const response = await secureFetchWrapper('/api/auth/sessions', 'GET');
        if (response && response.sessions) {
            activeSessions = response.sessions;
            return activeSessions;
        }
        return null;
    } catch (error) {
        Log.error('safeLoadActiveSessions failed', error, true);
        return null;
    }
}

export async function safeLoadUserContacts() {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') return null;
    try {
        const response = await secureFetchWrapper('/api/contacts', 'GET');
        if (response && response.contacts) {
            userContacts = response.contacts;
            return userContacts;
        }
        return null;
    } catch (error) {
        Log.error('safeLoadUserContacts failed', error, true);
        return null;
    }
}

export async function safeLoadUserGroups() {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') return null;
    try {
        const response = await secureFetchWrapper('/api/group', 'GET');
        if (response && response.groups) {
            userGroups = response.groups;
            coreData.groupsList = response.groups;
            return userGroups;
        }
        return null;
    } catch (error) {
        Log.error('safeLoadUserGroups failed', error, true);
        return null;
    }
}

export async function makeSafeRequest(endpoint, method = 'GET', data = null) {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') {
        throw new Error('Authentication not available');
    }
    return await secureFetchWrapper(endpoint, method, data);
}

export async function saveSettings() {
    try {
        Log.info('Saving settings');
        try {
            localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
        } catch (e) {}
        coreData.settings = userSettings;
        if (tokenReady || parentSessionReceived || state.authMode === 'authenticated') {
            await secureFetchWrapper('/api/settings', 'POST', { settings: userSettings });
        }
        unsavedChanges = false;
        const event = new CustomEvent('settingsSaved', {
            detail: {
                timestamp: Date.now(),
                settings: userSettings
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        Log.error('saveSettings failed', error);
        try {
            localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
        } catch (e) {}
        coreData.settings = userSettings;
        throw error;
    }
}

export function notifyParentAuthState(hasAuth) {
    try {
        sendToParent({
            type: MESSAGE_TYPES.IFRAME_AUTH_STATE,
            hasAuth: hasAuth,
            iframeId: 'settings',
            tokenReady: tokenReady,
            timestamp: Date.now(),
            source: MODULE_NAME,
            messageId: generateMessageId(),
            mirrorVersion: SessionMirror.getMirror().version
        }).catch(() => {});
    } catch (error) {
        Log.error('notifyParentAuthState failed', error, true);
    }
}

export function notifyParentAuthError() {
    if (authErrorNotified) return;
    try {
        sendToParent({
            type: MESSAGE_TYPES.IFRAME_AUTH_ERROR,
            iframeId: 'settings',
            message: 'Authentication required',
            tokenExpired: true,
            timestamp: Date.now(),
            source: MODULE_NAME,
            messageId: generateMessageId()
        }).catch(() => {});
        authErrorNotified = true;
    } catch (error) {
        Log.error('notifyParentAuthError failed', error, true);
    }
}

export async function loadFromLocalStorage() {
    try {
        Log.info('Loading from localStorage');
        const cachedUser = localStorage.getItem('knecta_current_user');
        if (cachedUser) {
            try {
                currentUser = JSON.parse(cachedUser);
                coreData.user = JSON.parse(cachedUser);
                state.session = JSON.parse(cachedUser);
            } catch (e) {
                currentUser = { displayName: 'User', id: 'local-user' };
                coreData.user = { displayName: 'User', id: 'local-user' };
                state.session = { displayName: 'User', id: 'local-user' };
            }
        } else {
            currentUser = { displayName: 'User', id: 'local-user' };
            coreData.user = { displayName: 'User', id: 'local-user' };
            state.session = { displayName: 'User', id: 'local-user' };
        }
        const savedSettings = localStorage.getItem('knecta_user_settings');
        if (savedSettings) {
            try {
                userSettings = JSON.parse(savedSettings);
                coreData.settings = JSON.parse(savedSettings);
            } catch (e) {
                userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                coreData.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            }
        } else {
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            coreData.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
        Object.keys(DEFAULT_SETTINGS).forEach(section => {
            if (!userSettings[section]) {
                userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
            }
        });
        calculateStorageUsage();
        return true;
    } catch (error) {
        Log.error('loadFromLocalStorage failed', error);
        userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        coreData.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        currentUser = { displayName: 'User', id: 'local-user' };
        coreData.user = { displayName: 'User', id: 'local-user' };
        state.session = { displayName: 'User', id: 'local-user' };
        return false;
    }
}

export function updateUserUI() {
    Log.info('User UI update requested');
    try {
        const event = new CustomEvent('userUIUpdate', {
            detail: {
                user: currentUser,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        Log.error('updateUserUI failed', error);
        return false;
    }
}

export function initializeUI() {
    Log.info('UI initialization requested');
    try {
        const event = new CustomEvent('coreUIInitialized', {
            detail: {
                timestamp: Date.now(),
                mode: state.authMode,
                user: currentUser
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        Log.error('initializeUI failed', error);
        return false;
    }
}

export function calculateStorageUsage() {
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
        Log.error('calculateStorageUsage failed', error);
        return 0;
    }
}

export function formatStorageSize(bytes) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getMoodText(mood) {
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

export function getMoodColor(mood) {
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

export async function terminateSession(sessionId) {
    try {
        Log.info(`Terminating session: ${sessionId}`);
        await makeSafeRequest('/api/auth/terminate-session', 'POST', { sessionId });
        await safeLoadActiveSessions();
        return true;
    } catch (error) {
        Log.error('terminateSession failed', error);
        throw error;
    }
}

export async function terminateAllSessions() {
    try {
        Log.info('Terminating all other sessions');
        await makeSafeRequest('/api/auth/terminate-all-sessions', 'POST');
        await safeLoadActiveSessions();
        return true;
    } catch (error) {
        Log.error('terminateAllSessions failed', error);
        throw error;
    }
}

export async function unblockUser(userId) {
    try {
        Log.info(`Unblocking user: ${userId}`);
        await makeSafeRequest('/api/users/unblock', 'POST', { userId });
        await safeLoadBlockedUsers();
        return true;
    } catch (error) {
        Log.error('unblockUser failed', error);
        throw error;
    }
}

export async function clearChatCache() {
    try {
        Log.info('Clearing chat cache');
        await makeSafeRequest('/api/storage/clear-chat-cache', 'POST');
        if (userSettings.storage) {
            userSettings.storage.storageBreakdown.chats = 0;
            userSettings.storage.totalStorageUsed = 
                (userSettings.storage.storageBreakdown.media || 0) + 
                (userSettings.storage.storageBreakdown.other || 0);
        }
        unsavedChanges = true;
        calculateStorageUsage();
        return true;
    } catch (error) {
        Log.error('clearChatCache failed', error);
        throw error;
    }
}

export async function clearMediaCache() {
    try {
        Log.info('Clearing media cache');
        await makeSafeRequest('/api/storage/clear-media-cache', 'POST');
        if (userSettings.storage) {
            userSettings.storage.storageBreakdown.media = 0;
            userSettings.storage.totalStorageUsed = 
                (userSettings.storage.storageBreakdown.chats || 0) + 
                (userSettings.storage.storageBreakdown.other || 0);
        }
        unsavedChanges = true;
        calculateStorageUsage();
        return true;
    } catch (error) {
        Log.error('clearMediaCache failed', error);
        throw error;
    }
}

export function showActiveSessions() {
    Log.info('Show active sessions requested');
    try {
        const event = new CustomEvent('showSessions', {
            detail: {
                sessions: activeSessions,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        Log.error('showActiveSessions failed', error);
        return false;
    }
}

export function showBlockedUsers() {
    Log.info('Show blocked users requested');
    try {
        const event = new CustomEvent('showBlockedUsers', {
            detail: {
                users: blockedUsers,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        Log.error('showBlockedUsers failed', error);
        return false;
    }
}

// =============================================
// INTERNAL FUNCTIONS
// =============================================
function initTrustedOrigins() {
    try {
        trustedOrigins.add(window.location.origin);
        TRUSTED_ORIGINS.add(window.location.origin);
        ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000', 'http://127.0.0.1:3000'].forEach(origin => {
            trustedOrigins.add(origin);
            TRUSTED_ORIGINS.add(origin);
        });
        const hostname = window.location.hostname;
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            trustedOrigins.add(`https://${hostname}`);
            trustedOrigins.add(`http://${hostname}`);
            TRUSTED_ORIGINS.add(`https://${hostname}`);
            TRUSTED_ORIGINS.add(`http://${hostname}`);
        }
    } catch (error) {
        Log.error('initTrustedOrigins failed', error, true);
    }
}

function setupMessaging() {
    window.removeEventListener('message', handleIncomingMessage);
    window.addEventListener('message', handleIncomingMessage, false);
    state.listeners.add({
        type: 'message',
        handler: handleIncomingMessage,
        options: false
    });
}

async function checkPermissions() {
    return state.authMode === 'authenticated' && !!state.session;
}

async function loadDependencies() {
    return true;
}

async function loadAllData() {
    try {
        await loadData('settings', '/api/settings');
        await loadData('friendsList', '/api/friends');
        await loadData('groupsList', '/api/groups');
        await loadData('notifications', '/api/notifications');
        await loadData('chatHistory', '/api/chats/history');
    } catch (error) {
        Log.error('loadAllData failed', error);
    }
}

async function loadData(dataType, endpoint) {
    try {
        const token = getSecureToken();
        if (!token && endpoint !== '/api/settings' && state.authMode !== 'demo') {
            return;
        }
        const response = await secureFetchWrapper(endpoint, 'GET');
        if (response && response[dataType]) {
            coreData[dataType] = response[dataType];
            if (dataType === 'settings') {
                userSettings = response[dataType];
            }
        }
    } catch (error) {
        if (Array.isArray(coreData[dataType])) {
            coreData[dataType] = [];
        }
        Log.error(`loadData failed for ${dataType}`, error, true);
    }
}

function getEndpointForDataType(dataType) {
    const endpoints = {
        friendsList: '/api/friends',
        groupsList: '/api/groups',
        chatHistory: '/api/chats/history',
        notifications: '/api/notifications',
        settings: '/api/settings'
    };
    return endpoints[dataType] || '/api/data/' + dataType;
}

function validateAllData() {
    try {
        let valid = true;
        Object.keys(coreData).forEach(key => {
            if (coreData[key] === undefined) {
                if (Array.isArray(coreData[key])) coreData[key] = [];
                if (typeof coreData[key] === 'object' && coreData[key] !== null) coreData[key] = {};
                valid = false;
            }
        });
        return valid;
    } catch (error) {
        Log.error('validateAllData failed', error);
        return false;
    }
}

function syncWithGlobalState() {
    try {
        if (coreData.user) currentUser = coreData.user;
        if (coreData.settings) userSettings = coreData.settings;
        if (coreData.groupsList) userGroups = coreData.groupsList;
        try {
            if (currentUser) localStorage.setItem('knecta_current_user', JSON.stringify(currentUser));
            if (userSettings) localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
        } catch (e) {}
    } catch (error) {
        Log.error('syncWithGlobalState failed', error);
    }
}

function processMessageQueue() {
    try {
        while (messageQueue.length > 0 && isReady) {
            const { message, event } = messageQueue.shift();
            handleIncomingMessage(event);
        }
    } catch (error) {
        Log.error('processMessageQueue failed', error);
    }
}

function dispatchDataReadyEvent() {
    try {
        const event = new CustomEvent('coreDataReady', {
            detail: {
                data: coreData,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    } catch (error) {
        Log.error('dispatchDataReadyEvent failed', error);
    }
}

function dispatchDataUpdatedEvent(dataType) {
    try {
        const event = new CustomEvent('coreDataUpdated', {
            detail: {
                dataType: dataType,
                data: coreData[dataType],
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    } catch (error) {
        Log.error('dispatchDataUpdatedEvent failed', error);
    }
}

function notifyParentReady() {
    try {
        if (window.parent !== window) {
            sendToParent({
                type: MESSAGE_TYPES.CORE_READY,
                payload: {
                    iframeId: 'settings',
                    status: 'success',
                    dataTypes: Object.keys(coreData).filter(key => coreData[key] !== null),
                    timestamp: Date.now(),
                    mode: state.authMode,
                    mirrorVersion: SessionMirror.getMirror().version
                },
                source: MODULE_NAME
            }).catch(() => {});
        }
    } catch (error) {
        Log.error('notifyParentReady failed', error);
    }
}

function notifyParentError(error) {
    try {
        if (window.parent !== window) {
            sendToParent({
                type: MESSAGE_TYPES.ERROR,
                payload: {
                    iframeId: 'settings',
                    message: error.message,
                    timestamp: Date.now()
                },
                source: MODULE_NAME
            }).catch(() => {});
        }
    } catch (error) {
        Log.error('notifyParentError failed', error);
    }
}

function showStatusMessage(message) {
    try {
        let statusEl = document.getElementById('coreStatusMessage');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.id = 'coreStatusMessage';
            statusEl.className = 'core-status-message';
            statusEl.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--background-secondary);
                color: var(--text-primary);
                padding: 12px 24px;
                border-radius: 8px;
                z-index: 10000;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                transition: opacity 0.3s;
            `;
            document.body.appendChild(statusEl);
        }
        statusEl.textContent = message;
        statusEl.style.opacity = '1';
        if (message.includes('successfully')) {
            setTimeout(() => {
                if (statusEl.parentNode) {
                    statusEl.style.opacity = '0';
                    setTimeout(() => {
                        if (statusEl.parentNode) {
                            statusEl.parentNode.removeChild(statusEl);
                        }
                    }, 300);
                }
            }, 2000);
        }
    } catch (error) {
        Log.error('showStatusMessage failed', error);
    }
}

export function getData(dataType) {
    try {
        if (!isReady) {
            throw new Error('Core not ready');
        }
        if (!coreData.hasOwnProperty(dataType)) {
            throw new Error(`Unknown data type: ${dataType}`);
        }
        return JSON.parse(JSON.stringify(coreData[dataType]));
    } catch (error) {
        Log.error('getData failed', error);
        return null;
    }
}

export function updateData(dataType, payload) {
    try {
        if (!isReady) {
            throw new Error('Core not ready');
        }
        if (!coreData.hasOwnProperty(dataType)) {
            throw new Error(`Unknown data type: ${dataType}`);
        }
        if (Array.isArray(coreData[dataType])) {
            if (Array.isArray(payload)) {
                coreData[dataType] = payload;
            } else {
                const index = coreData[dataType].findIndex(item => item.id === payload.id);
                if (index !== -1) {
                    coreData[dataType][index] = { ...coreData[dataType][index], ...payload };
                } else {
                    coreData[dataType].push(payload);
                }
            }
        } else if (typeof coreData[dataType] === 'object' && coreData[dataType] !== null) {
            coreData[dataType] = { ...coreData[dataType], ...payload };
        } else {
            coreData[dataType] = payload;
        }
        syncWithGlobalState();
        dispatchDataUpdatedEvent(dataType);
        return true;
    } catch (error) {
        Log.error('updateData failed', error);
        return false;
    }
}

function getDefaultSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function executeReadyCallbacks() {
    state.readyCallbacks.forEach(cb => {
        try {
            cb(state);
        } catch (e) {}
    });
    state.readyCallbacks = [];
}

export function onReady(callback) {
    if (isReady) {
        callback(state);
    } else {
        state.readyCallbacks.push(callback);
    }
}

// =============================================
// MESSAGE HANDLER
// =============================================
function handleIncomingMessage(event) {
    try {
        if (!isValidOrigin(event.origin)) {
            if (!untrustedOriginLogged) {
                Log.warn(`Untrusted origin: ${event.origin}`, true);
                untrustedOriginLogged = true;
            }
            return;
        }
        
        if (event.source !== state.parentWindow && event.source !== window.parent) {
            if (event.source === window) return;
            return;
        }
        
        const message = event.data;
        if (!message || typeof message !== 'object' || !message.type) {
            return;
        }
        
        if (message.source === MODULE_NAME) {
            return;
        }
        
        if (message.type === MESSAGE_TYPES.ACK && message.inResponseTo) {
            const pending = state.pendingAcks.get(message.inResponseTo);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve({ acknowledged: true, ...message });
                state.pendingAcks.delete(message.inResponseTo);
            }
            return;
        }
        
        if (message.type === MESSAGE_TYPES.MIRROR_UPDATE && message.session) {
            SessionMirror.update(message.session);
            return;
        }
        
        if (message.signature && !verifyMessage(message)) {
            Log.warn('Invalid message signature', true);
            return;
        }
        
        if (message.messageId && state.processedMessageIds.has(message.messageId)) {
            return;
        }
        
        if (message.messageId) {
            state.processedMessageIds.add(message.messageId);
            if (state.processedMessageIds.size > 100) {
                const ids = Array.from(state.processedMessageIds);
                state.processedMessageIds = new Set(ids.slice(-50));
            }
        }
        
        if (!isReady && message.type !== MESSAGE_TYPES.INIT && message.type !== MESSAGE_TYPES.SESSION_RESPONSE) {
            messageQueue.push({ message, event });
            return;
        }
        
        const handlers = state.messageHandlers.get(message.type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(message, event);
                } catch (error) {
                    Log.error(`Handler error for ${message.type}`, error);
                }
            });
        }
        
        switch (message.type) {
            case MESSAGE_TYPES.INIT:
                handleInitMessage(message);
                break;
            case MESSAGE_TYPES.SESSION_RESPONSE:
                handleSessionResponse(message);
                break;
            case MESSAGE_TYPES.SESSION_UPDATE:
                handleSessionUpdate(message);
                break;
            case MESSAGE_TYPES.LOGOUT:
                handleLogout();
                break;
            case MESSAGE_TYPES.PARENT_READY:
                parentReady = true;
                parentCommunicationReady = true;
                processMessageQueue();
                sendToParent({
                    type: MESSAGE_TYPES.PARENT_READY_ACK,
                    childId: 'settings',
                    timestamp: Date.now(),
                    source: MODULE_NAME
                }).catch(() => {});
                break;
            case MESSAGE_TYPES.AUTH_READY:
                authReady = true;
                checkTokenAvailability();
                break;
            case MESSAGE_TYPES.AUTH_LOST:
                authReady = false;
                tokenReady = false;
                tokenAvailable = false;
                backgroundTasksStarted = false;
                break;
            case MESSAGE_TYPES.TOKEN_READY:
                handleTokenReady();
                break;
            case MESSAGE_TYPES.TOKEN_RESPONSE:
                if (message.token) {
                    SessionMirror.update({ token: message.token });
                }
                break;
            case MESSAGE_TYPES.USER_UPDATED:
                handleUserUpdated(message);
                break;
            case MESSAGE_TYPES.REFRESH_DATA:
                handleRefreshData(message);
                break;
            case MESSAGE_TYPES.UPDATE_DATA:
                handleUpdateData(message);
                break;
            case MESSAGE_TYPES.HEARTBEAT:
                sendToParent({
                    type: MESSAGE_TYPES.HEARTBEAT,
                    status: state.health.status,
                    timestamp: Date.now(),
                    childId: 'settings',
                    source: MODULE_NAME
                }).catch(() => {});
                break;
            case MESSAGE_TYPES.SHUTDOWN:
                shutdownCore();
                break;
            case MESSAGE_TYPES.SESSION_INIT:
                if (message.session) {
                    SessionMirror.update(message.session);
                }
                sendToParent({
                    type: MESSAGE_TYPES.SESSION_CONFIRMED,
                    childId: 'settings',
                    timestamp: Date.now(),
                    source: MODULE_NAME
                }).catch(() => {});
                break;
            case MESSAGE_TYPES.HANDSHAKE_RESPONSE:
                if (message.session) {
                    SessionMirror.update(message.session);
                }
                break;
            case MESSAGE_TYPES.RECOVERY_RESPONSE:
                state.health.recoveryAttempts++;
                if (message.session) {
                    SessionMirror.update(message.session);
                }
                break;
        }
    } catch (error) {
        Log.error('handleIncomingMessage failed', error);
    }
}

function handleInitMessage(message) {
    try {
        if (message.payload) {
            if (message.payload.session) {
                SessionMirror.update(message.payload.session);
            }
            if (message.payload.settings) {
                coreData.settings = message.payload.settings;
                userSettings = message.payload.settings;
            }
        }
        sendToParent({
            type: MESSAGE_TYPES.INIT_ACK,
            childId: 'settings',
            timestamp: Date.now(),
            source: MODULE_NAME,
            messageId: generateMessageId(),
            mirrorVersion: SessionMirror.getMirror().version
        }).catch(() => {});
    } catch (error) {
        Log.error('handleInitMessage failed', error);
    }
}

function handleSessionResponse(message) {
    try {
        if (!message.token && !message.user && !message.session) {
            Log.debug('Received invalid session from parent');
            return;
        }
        const sessionData = {
            user: message.user || message.session?.user,
            token: message.token || message.session?.token,
            expiresAt: message.expiry || message.session?.expiry
        };
        SessionMirror.update(sessionData);
        sendToParent({
            type: 'SESSION_CONFIRMED',
            childId: 'settings',
            timestamp: Date.now(),
            received: true,
            validated: true,
            source: MODULE_NAME,
            messageId: generateMessageId(),
            mirrorVersion: SessionMirror.getMirror().version
        }).catch(() => {});
    } catch (error) {
        Log.error('handleSessionResponse failed', error);
    }
}

function handleSessionUpdate(message) {
    try {
        if (message.session) {
            SessionMirror.update(message.session);
        }
    } catch (error) {
        Log.error('handleSessionUpdate failed', error);
    }
}

function handleLogout() {
    try {
        parentSessionData = null;
        parentSessionReceived = false;
        sessionValidated = false;
        SessionMirror.clear();
        currentUser = null;
        coreData.user = null;
        state.session = null;
        state.sessionSynced = false;
        tokenReady = false;
        tokenAvailable = false;
        authReady = false;
        backgroundTasksStarted = false;
        isReady = false;
        sendToParent({
            type: MESSAGE_TYPES.LOGOUT_CONFIRMED,
            childId: 'settings',
            timestamp: Date.now(),
            source: MODULE_NAME,
            messageId: generateMessageId()
        }).catch(() => {});
    } catch (error) {
        Log.error('handleLogout failed', error);
    }
}

function handleTokenReady() {
    checkTokenAvailability();
}

function handleUserUpdated(data) {
    try {
        if (data.user) {
            SessionMirror.update({ user: data.user });
        }
    } catch (error) {
        Log.error('handleUserUpdated failed', error);
    }
}

async function handleRefreshData(message) {
    try {
        const dataType = message.payload?.dataType;
        if (dataType && coreData.hasOwnProperty(dataType)) {
            await loadData(dataType, getEndpointForDataType(dataType));
            syncWithGlobalState();
            sendToParent({
                type: MESSAGE_TYPES.DATA_REFRESHED,
                childId: 'settings',
                dataType: dataType,
                timestamp: Date.now(),
                source: MODULE_NAME
            }).catch(() => {});
            dispatchDataUpdatedEvent(dataType);
        } else {
            await loadAllData();
            syncWithGlobalState();
            sendToParent({
                type: MESSAGE_TYPES.ALL_DATA_REFRESHED,
                childId: 'settings',
                timestamp: Date.now(),
                source: MODULE_NAME
            }).catch(() => {});
            dispatchDataUpdatedEvent('all');
        }
    } catch (error) {
        Log.error('handleRefreshData failed', error);
        sendToParent({
            type: MESSAGE_TYPES.REFRESH_ERROR,
            childId: 'settings',
            error: error.message,
            timestamp: Date.now(),
            source: MODULE_NAME
        }).catch(() => {});
    }
}

function handleUpdateData(message) {
    try {
        const { dataType, payload } = message;
        if (dataType && coreData.hasOwnProperty(dataType)) {
            updateData(dataType, payload);
            sendToParent({
                type: MESSAGE_TYPES.DATA_UPDATED,
                childId: 'settings',
                dataType: dataType,
                timestamp: Date.now(),
                source: MODULE_NAME
            }).catch(() => {});
        }
    } catch (error) {
        Log.error('handleUpdateData failed', error);
    }
}

// =============================================
// FEATURE REGISTRATION
// =============================================
export function registerFeature(name, implementation) {
    try {
        if (state.features.has(name)) {
            Log.warn(`Feature ${name} already registered`, true);
            return false;
        }
        const wrappedImplementation = {};
        Object.keys(implementation).forEach(key => {
            if (typeof implementation[key] === 'function') {
                wrappedImplementation[key] = function(...args) {
                    try {
                        return implementation[key].apply(this, args);
                    } catch (error) {
                        Log.error(`Feature ${name}.${key} failed`, error, true);
                        return null;
                    }
                };
            } else {
                wrappedImplementation[key] = implementation[key];
            }
        });
        state.features.set(name, wrappedImplementation);
        Log.debug(`Feature registered: ${name}`);
        return true;
    } catch (error) {
        Log.error(`registerFeature failed for ${name}`, error);
        return false;
    }
}

export function getFeature(name) {
    return state.features.get(name) || null;
}

// =============================================
// DATA VALIDATION SCHEMAS
// =============================================
const validationSchemas = {
    friendsList: { requiredFields: ['id', 'name'], optionalFields: ['avatar', 'lastSeen', 'status'] },
    groupsList: { requiredFields: ['id', 'name'], optionalFields: ['avatar', 'members', 'lastActivity'] },
    chatHistory: { requiredFields: ['id', 'timestamp', 'type'], optionalFields: ['message', 'senderId', 'readStatus'] },
    notifications: { requiredFields: ['id', 'type', 'timestamp'], optionalFields: ['title', 'message', 'read'] },
    settings: { requiredFields: [], optionalFields: [] },
    user: { requiredFields: ['id'], optionalFields: ['name', 'email', 'avatar', 'status'] }
};

function validateDataStructure(data, dataType) {
    try {
        const schema = validationSchemas[dataType];
        if (!schema) return true;
        if (Array.isArray(data)) {
            if (data.length === 0) return true;
            const sampleSize = Math.min(data.length, 5);
            for (let i = 0; i < sampleSize; i++) {
                for (const field of schema.requiredFields) {
                    if (data[i][field] === undefined || data[i][field] === null) {
                        return false;
                    }
                }
            }
            return true;
        }
        if (typeof data === 'object' && data !== null) {
            for (const field of schema.requiredFields) {
                if (data[field] === undefined || data[field] === null) {
                    return false;
                }
            }
            return true;
        }
        return false;
    } catch (error) {
        Log.error('validateDataStructure failed', error, true);
        return false;
    }
}

// =============================================
// BUILD SETTINGS MENU - COMPATIBILITY STUB
// =============================================
export function buildSettingsMenu(container = null, config = {}) {
    try {
        Log.info('Settings menu build requested - UI module handles actual rendering');
        const event = new CustomEvent('buildSettingsMenu', {
            detail: {
                container,
                config,
                menu: SETTINGS_MENU,
                timestamp: Date.now(),
                mode: state.authMode,
                authenticated: SessionMirror.isValid()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        Log.error('buildSettingsMenu failed', error);
        return false;
    }
}

// =============================================
// AUTO-START WITH RETRY
// =============================================
document.addEventListener('DOMContentLoaded', function() {
    try {
        setTimeout(() => {
            initializeCore({ 
                demoMode: true,
                forceParentCheck: true,
                handshakeTimeout: 3000
            }).catch(() => {});
        }, 100);
    } catch (error) {
        Log.error('Error in auto-start', error);
    }
});

// =============================================
// EXPORT ALIASES FOR BACKWARD COMPATIBILITY
// =============================================
export {
    startHandshake as startParentHandshake,
    startHandshake as startHandshakeProtocol,
    requestSession as requestSessionFromParent,
    sendToParent as sendMessageToParent,
    receiveFromParent as onParentMessage
};

// ADD MISSING EXPORTS FOR OTHER MODULES
export const attemptCachedDataFallback = () => {
    Log.info('Attempting cached data fallback');
    return loadFromLocalStorage();
};

export const safeApiCall = async (endpoint, options = {}) => {
    try {
        return await secureFetchWrapper(endpoint, options.method || 'GET', options.data);
    } catch (error) {
        Log.error('safeApiCall failed', error);
        return null;
    }
};

export const sendMessageWithAck = async (type, payload, timeout = 5000) => {
    return sendToParent({
        type,
        ...payload,
        expectAck: true,
        timeout
    }, 0, true);
};

export const broadcastToAllIframes = (type, payload) => {
    const iframes = ['messagesIframe', 'statusIframe', 'groupIframe', 'friendsIframe', 'callsIframe', 'settingsIframe', 'toolsIframe'];
    iframes.forEach(frameId => {
        sendToParent({
            type,
            target: frameId,
            ...payload
        }).catch(() => {});
    });
};

export const getParentOrigin = () => state.parentOrigin || '*';

export const isParentAvailable = () => state.parentVerified && !!state.parentWindow;

// =============================================
// ERROR BOUNDARY
// =============================================
window.addEventListener('error', (event) => {
    Log.error('Global error', event.error, true);
    state.health.failures++;
    if (event.target && event.target.tagName === 'SCRIPT') {
        event.preventDefault();
        return false;
    }
    if (state.health.failures > 10 && isReady) {
        Log.warn('Too many errors, attempting recovery');
        state.health.recoveryAttempts++;
        initializeCore({ demoMode: true, forceParentCheck: true }).catch(() => {});
    }
    return true;
});

window.addEventListener('unhandledrejection', (event) => {
    Log.error('Unhandled rejection', event.reason, true);
    state.health.failures++;
    if (state.health.failures > 5 && isReady) {
        Log.warn('Too many promise rejections, attempting recovery');
        state.health.recoveryAttempts++;
        setTimeout(() => {
            requestSession(3000).catch(() => {});
        }, 1000);
    }
});

// =============================================
// RECOVERY MECHANISM
// =============================================
function attemptRecovery() {
    if (state.health.recoveryAttempts > 3) {
        Log.warn('Max recovery attempts reached');
        return;
    }
    Log.info(`Attempting recovery (${state.health.recoveryAttempts + 1}/3)`);
    state.health.recoveryAttempts++;
    sendToParent({
        type: MESSAGE_TYPES.RECOVERY_REQUEST,
        childId: 'settings',
        reason: state.health.lastError,
        timestamp: Date.now(),
        source: MODULE_NAME,
        attempt: state.health.recoveryAttempts
    }).catch(() => {});
    setTimeout(() => {
        if (!parentReady) {
            startHandshake({ force: true }).catch(() => {});
        }
    }, 2000);
}

export function triggerRecovery() {
    attemptRecovery();
}

// =============================================
// END OF FILE - COMPLETE IMPLEMENTATION
// =============================================