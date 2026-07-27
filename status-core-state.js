// =============================================
// STATUS-CORE-STATE.JS
// SETTINGS MODULE - REAL BACKEND-DRIVEN CONTROL SYSTEM
// VERSION: 9.2.2 - FIXED EXPORTS & AUTH GUARDS
// Session validation, lifecycle state machine, offline queue,
// SettingsState object, message dedup/send, message listener setup.
// Must load FIRST — status-core-transport.js and status-core-runtime.js
// reference top-level names declared in this file.
// Loaded as a plain classic <script> (no type="module") so declarations
// here share window/global scope with the other two files, exactly like
// status-ui.js / status-api.js / status-websocket.js already do.
// =============================================

// =============================================
// SESSION VALIDATION UTILITY - CRITICAL GUARD
// =============================================
function __isValidSession(session) {
  if (!session) return false;

  if (!session.token || typeof session.token !== 'string') return false;

  const userId = session.userId;
  if (userId === undefined || userId === null) return false;
  if (userId === 'user' || userId === 'default' || userId === '' || userId === 'null' || userId === 'undefined') return false;
  // Accept both number and numeric string (e.g. "42" or 42)
  if (typeof userId === 'number' && (isNaN(userId) || userId === 0)) return false;
  if (typeof userId === 'string' && (isNaN(Number(userId)) || Number(userId) === 0)) return false;
  if (typeof userId !== 'number' && typeof userId !== 'string') return false;

  return true;
}


// =============================================
// INITIALIZATION GUARD - PREVENT MULTIPLE INITIALIZATIONS
// =============================================
(function() {
    if (window.__SETTINGS_CORE_INITIALIZED__) {
        return;
    }
    window.__SETTINGS_CORE_INITIALIZED__ = true;
    window.__SETTINGS_INITIALIZING__ = true;
})();

// =============================================
// MODULE IDENTITY & VERSION
// =============================================
const MODULE_NAME = 'settings';
const MODULE_VERSION = '9.2.2';
const FRAME_ID = 'settings';
let moduleId = `settings-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// =============================================
// GLOBAL DEBUG FLAG - MINIMAL NOISE
// =============================================
const DEBUG = false;
window.__SETTINGS_DEBUG__ = DEBUG;
let DEBUG_ENABLED = DEBUG;
let CONSOLE_NOISE_SUPPRESSED = true;

// =============================================
// AUTH STATE - CRITICAL FIX
// =============================================
let coreAuthState = false;
let authCheckComplete = false;

// =============================================
// STRICT LIFECYCLE STATE MACHINE - DETERMINISTIC HANDSHAKE
// =============================================
const LifecycleState = {
    BOOT: 'BOOT',
    INITIALIZING: 'INITIALIZING',
    WAITING_AUTH: 'WAITING_AUTH',
    READY: 'READY',
    WAIT_PARENT: 'WAIT_PARENT',
    ACTIVE: 'ACTIVE'
};

let currentState = LifecycleState.BOOT;
let stateHistory = [];
let isReady = false;
let initializationLock = false;

// Handshake tracking - STRICT ONCE RULE
let childReadySent = false;
let parentReadyReceived = false;
let moduleRegistered = false;
let registrationCompleted = false;

// Message deduplication
const processedMessages = new Set();
const sentMessageIds = new Set();
const MAX_PROCESSED_MESSAGES = 100;

// Pre-active message queue
let messageQueue = [];
let queueFlushed = false;

// =============================================
// SESSION DEDUPLICATION TRACKING
// =============================================
let _lastSessionId = null;
let _currentValidSession = null;

// =============================================
// REQUEST QUEUE FOR AUTH-BLOCKED CALLS
// =============================================
let requestQueue = [];
let queueProcessing = false;

// =============================================
// CENTRALIZED AUTHORIZED REQUEST - NO DIRECT FETCH
// =============================================
const pendingRequests = new Map();

function authorizedRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
        // Block requests if not authenticated
        if (!coreAuthState) {
            if (DEBUG) console.warn(`[${MODULE_NAME}] ⏳ Auth not ready, queuing request: ${endpoint}`);
            requestQueue.push(() => authorizedRequest(endpoint, options).then(resolve).catch(reject));
            return;
        }

        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        const method = options.method || 'GET';
        
        if (DEBUG) {
            console.log(`[${MODULE_NAME}] 📡 API Request: ${method} ${endpoint}`);
        }
        
        const timeoutId = setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId);
                reject(new Error(`Request timeout: ${endpoint}`));
            }
        }, 30000);
        
        const handler = (event) => {
            if (event.data?.type === 'API_RESPONSE' && 
                event.data?.requestId === requestId) {
                
                clearTimeout(timeoutId);
                window.removeEventListener('message', handler);
                pendingRequests.delete(requestId);
                
                // FIX: chat.html sends { type:'API_RESPONSE', requestId, payload:{success,data,statusCode} }
                // so we must read event.data.payload first, not event.data.response
                const response = event.data.payload || event.data.response || event.data;
                
                // Handle auth failures
                if (response.statusCode === 401 || response.status === 401 || response.message === 'Authentication required') {
                    console.error(`[${MODULE_NAME}] ❌ Unauthorized: ${endpoint}`);
                    
                    window.parent.postMessage({
                        type: 'AUTH_ERROR',
                        module: MODULE_NAME,
                        timestamp: Date.now()
                    }, '*');
                    
                    reject(new Error('Authentication required'));
                    return;
                }
                
                if (DEBUG) {
                    console.log(`[${MODULE_NAME}] ✅ Response: ${method} ${endpoint}`);
                }
                resolve(response);
            }
            
            if (event.data?.type === 'API_ERROR' && 
                event.data?.requestId === requestId) {
                
                clearTimeout(timeoutId);
                window.removeEventListener('message', handler);
                pendingRequests.delete(requestId);
                
                console.error(`[${MODULE_NAME}] ❌ API Error: ${endpoint}`, event.data.error);
                reject(new Error(event.data.error || 'API request failed'));
            }
        };
        
        pendingRequests.set(requestId, { resolve, reject, timeoutId });
        window.addEventListener('message', handler);
        
        // Send request to parent - use payload wrapper so chat.html reads it correctly
        window.parent.postMessage({
            type: 'API_REQUEST',
            requestId: requestId,
            source: MODULE_NAME,
            module: MODULE_NAME,
            endpoint: normalizeEndpoint(endpoint),
            method: method,
            body: options.body,
            data: options.body,
            headers: options.headers || {},
            payload: {
                requestId: requestId,
                endpoint: normalizeEndpoint(endpoint),
                method: method,
                body: options.body,
                data: options.body,
                source: MODULE_NAME
            },
            timestamp: Date.now()
        }, '*');
    });
}

// Process queued requests after auth is ready
async function processRequestQueue() {
    if (queueProcessing) return;
    if (!coreAuthState) return;
    
    queueProcessing = true;
    
    while (requestQueue.length > 0) {
        const queuedRequest = requestQueue.shift();
        try {
            await queuedRequest();
        } catch (error) {
            console.error(`[${MODULE_NAME}] ❌ Queued request failed:`, error);
        }
    }
    
    queueProcessing = false;
}

// =============================================
// OFFLINE QUEUE MANAGER - PERSISTS PENDING UPDATES
// =============================================
const OfflineQueue = {
    _queue: [],
    _storageKey: 'knecta_offline_queue',
    _online: navigator.onLine !== false,
    _syncInProgress: false,
    _watchers: [],
    
    init() {
        this._loadQueue();
        this._setupOnlineListeners();
        console.log(`[${MODULE_NAME}] 📦 OfflineQueue initialized, online: ${this._online}, pending: ${this._queue.length}`);
    },
    
    _loadQueue() {
        try {
            const saved = localStorage.getItem(this._storageKey);
            if (saved) {
                this._queue = JSON.parse(saved);
                // Clean up old entries (> 7 days)
                const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                this._queue = this._queue.filter(item => item.timestamp > weekAgo);
                this._saveQueue();
            }
        } catch (e) {}
    },
    
    _saveQueue() {
        try {
            localStorage.setItem(this._storageKey, JSON.stringify(this._queue));
        } catch (e) {}
    },
    
    _setupOnlineListeners() {
        window.addEventListener('online', () => {
            console.log(`[${MODULE_NAME}] 🌐 Browser came online`);
            this._online = true;
            this._triggerWatchers();
            if (this.hasPending()) {
                console.log(`[${MODULE_NAME}] 📤 Syncing ${this._queue.length} pending updates`);
                this.syncAll();
            }
        });
        
        window.addEventListener('offline', () => {
            console.log(`[${MODULE_NAME}] 📴 Browser went offline`);
            this._online = false;
        });
    },
    
    isOnline() {
        return this._online && navigator.onLine !== false;
    },
    
    enqueue(section, key, value) {
        const item = {
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            section,
            key,
            value,
            timestamp: Date.now(),
            retries: 0
        };
        this._queue.push(item);
        this._saveQueue();
        
        // Update UI badge
        this._updateBadge();
        
        console.log(`[${MODULE_NAME}] 📦 Queued: ${section}.${key} (total: ${this._queue.length})`);
    },
    
    async syncAll(sendFunction = null) {
        if (this._syncInProgress) return false;
        if (!this.isOnline()) return false;
        if (this._queue.length === 0) return true;
        
        this._syncInProgress = true;
        console.log(`[${MODULE_NAME}] 🔄 Syncing ${this._queue.length} queued updates`);
        
        const failed = [];
        
        for (const item of this._queue) {
            try {
                let success = false;
                
                if (sendFunction) {
                    const result = await sendFunction(item.section, item.key, item.value);
                    success = result && result.success;
                } else if (typeof SettingsState?._sendUpdateToBackend === 'function') {
                    const result = await SettingsState._sendUpdateToBackend(item.section, item.key, item.value);
                    success = result && result.success;
                }
                
                if (success) {
                    console.log(`[${MODULE_NAME}] ✅ Synced: ${item.section}.${item.key}`);
                } else {
                    item.retries++;
                    if (item.retries < 5) {
                        failed.push(item);
                    } else {
                        console.warn(`[${MODULE_NAME}] ⚠️ Dropping item after ${item.retries} retries: ${item.section}.${item.key}`);
                    }
                }
            } catch (error) {
                item.retries++;
                if (item.retries < 5) {
                    failed.push(item);
                }
                console.error(`[${MODULE_NAME}] ❌ Sync failed for ${item.section}.${item.key}:`, error.message);
            }
        }
        
        this._queue = failed;
        this._saveQueue();
        this._updateBadge();
        this._syncInProgress = false;
        
        console.log(`[${MODULE_NAME}] 📦 Sync complete, ${this._queue.length} remaining`);
        return this._queue.length === 0;
    },
    
    hasPending() {
        return this._queue.length > 0;
    },
    
    getPendingCount() {
        return this._queue.length;
    },
    
    clear() {
        this._queue = [];
        this._saveQueue();
        this._updateBadge();
    },
    
    _updateBadge() {
        const count = this._queue.length;
        
        // Dispatch event for UI to show badge
        const event = new CustomEvent('offlineQueueUpdated', {
            detail: { pendingCount: count, hasPending: count > 0 }
        });
        window.dispatchEvent(event);
        
        // Try to update any existing badge element
        try {
            let badge = document.getElementById('offlineQueueBadge');
            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('div');
                    badge.id = 'offlineQueueBadge';
                    badge.style.cssText = `
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        background: var(--warning-color);
                        color: white;
                        border-radius: 20px;
                        padding: 8px 16px;
                        font-size: 12px;
                        z-index: 10000;
                        cursor: pointer;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    `;
                    badge.innerHTML = `
                        <span>📦</span>
                        <span>${count} pending sync</span>
                        <button style="background: white; border: none; border-radius: 4px; padding: 2px 8px; cursor: pointer;">Sync now</button>
                    `;
                    badge.querySelector('button').onclick = () => this.syncAll();
                    document.body.appendChild(badge);
                } else {
                    badge.querySelector('span:last-child').textContent = `${count} pending sync`;
                    badge.style.display = 'flex';
                }
            } else if (badge) {
                badge.style.display = 'none';
            }
        } catch (e) {}
    },
    
    watchOnline(callback) {
        this._watchers.push(callback);
    },
    
    _triggerWatchers() {
        this._watchers.forEach(cb => {
            try { cb(); } catch (e) {}
        });
    },
    
    getDiagnostics() {
        return {
            online: this.isOnline(),
            pendingCount: this._queue.length,
            queue: this._queue.slice(0, 10)
        };
    }
};

// Initialize OfflineQueue
OfflineQueue.init();

// =============================================
// REAL SETTINGS STATE MANAGEMENT - NO MOCK DATA
// =============================================
const SettingsState = {
    loaded: false,
    loading: false,
    data: {},
    lastSynced: null,
    syncInProgress: false,
    pendingUpdates: new Map(),
    listeners: new Set(),
    
    get() {
        return this.data;
    },
    
    getSection(section) {
        return this.data[section] || null;
    },
    
    getSetting(section, key, defaultValue = null) {
        return this.data[section]?.[key] ?? defaultValue;
    },
    
    async update(section, key, value) {
        // STEP 1: Update AppSettings FIRST (single source of truth)
        // This triggers all module subscriptions instantly
        if (window.AppSettings) {
            window.AppSettings.set(section + '.' + key, value);
        }

        // STEP 2: Update local state for backwards compatibility
        if (!this.data[section]) this.data[section] = {};
        this.data[section][key] = value;
        this._saveToCache();

        // STEP 3: Emit unified event for any remaining legacy listeners
        window.dispatchEvent(new CustomEvent('appSettingsChanged', {
            detail: { 
                settings: window.AppSettings?.getAll() || this.data,
                path: section + '.' + key,
                value: value,
                timestamp: Date.now()
            }
        }));

        // STEP 4: Persist to backend when possible (non-blocking)
        if (!coreAuthState || currentState !== LifecycleState.ACTIVE) {
            if (!OfflineQueue.isOnline()) {
                OfflineQueue.enqueue(section, key, value);
                this._notify('update-queued', { section, key, value, reason: 'offline-pre-auth' });
            } else {
                requestQueue.push(async () => {
                    try { await this._sendUpdateToBackend(section, key, value); } catch (e) {}
                });
            }
            return { success: true, offline: !OfflineQueue.isOnline() };
        }

        return this._performUpdate(section, key, value);
    },
    
    async _performUpdate(section, key, value) {
        // NOTE: Local apply + cache save + global broadcast already done in update().
        // This function only handles the backend sync path (called when auth is ACTIVE).
        const oldValue = this.getSetting(section, key);
    
        // If offline, queue for later sync and return success
        if (!OfflineQueue.isOnline()) {
            OfflineQueue.enqueue(section, key, value);
            this._notify('update-queued', { section, key, value, reason: 'offline' });
            return { success: true, offline: true };
        }
    
        // If online, try backend
        try {
            const response = await this._sendUpdateToBackend(section, key, value);
            if (response && response.success) {
                this.lastSynced = Date.now();
                this._notify('update-success', { section, key, value, oldValue });
                return { success: true };
            } else {
                OfflineQueue.enqueue(section, key, value);
                this._notify('update-queued', { section, key, value, reason: 'server-error' });
                return { success: true, queued: true };
            }
        } catch (error) {
            OfflineQueue.enqueue(section, key, value);
            this._notify('update-queued', { section, key, value, reason: error.message });
            return { success: true, queued: true };
        }
    },
    
    async _sendUpdateToBackend(section, key, value) {
        // Route each settings section to the correct backend endpoint.
        // settings.js has: GET /, PUT /, PUT /profile, PUT /notifications, PUT /privacy, PUT /theme, PUT /language
        try {
            let endpoint, method, body;

            switch (section) {
                case 'appearance':
                    if (key === 'theme') {
                        endpoint = '/api/settings/theme';
                        method   = 'PUT';
                        body     = { theme: value };
                    } else if (key === 'language') {
                        endpoint = '/api/settings/language';
                        method   = 'PUT';
                        body     = { language: value };
                    } else {
                        // accentColor, fontSize, etc. — use profile endpoint
                        endpoint = '/api/settings/profile';
                        method   = 'PUT';
                        body     = { [key]: value, section };
                    }
                    break;

                case 'notifications':
                    endpoint = '/api/settings/notifications';
                    method   = 'PUT';
                    body     = { [key]: value };
                    break;

                case 'privacy':
                    endpoint = '/api/settings/privacy';
                    method   = 'PUT';
                    body     = { [key]: value };
                    break;

                case 'account':
                case 'profile':
                    endpoint = '/api/settings/profile';
                    method   = 'PUT';
                    body     = { [key]: value, section };
                    break;

                default:
                    // chat, calls, groups, friends, advanced, status
                    // Use the bulk PUT / endpoint so all sections are persisted
                    endpoint = '/api/settings';
                    method   = 'PUT';
                    body     = { [section]: { [key]: value } };
                    break;
            }

            const response = await authorizedRequest(endpoint, { method, body });
            return { success: response?.success !== false };
        } catch (error) {
            throw new Error(error.message || 'Update failed');
        }
    },
    
    _applySettingGlobally(section, key, value) {
        // 1. Push into AppSettings (single source of truth)
        if (window.AppSettings) {
            window.AppSettings.set(section + '.' + key, value);
        }

        // 2. Notify parent frame
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'SETTINGS_GLOBAL_UPDATE',
                module: MODULE_NAME,
                section: section,
                key: key,
                value: value,
                timestamp: Date.now()
            }, '*');
        }

        // 3. Broadcast to sibling iframes
        try {
            const frames = document.querySelectorAll('iframe');
            frames.forEach(f => {
                try {
                    f.contentWindow.postMessage({
                        type: 'SETTINGS_GLOBAL_UPDATE',
                        source: MODULE_NAME,
                        section, key, value,
                        timestamp: Date.now()
                    }, '*');
                } catch (_) {}
            });
        } catch (_) {}

        this._applyLocalEffects(section, key, value);
    },
    
    _applyLocalEffects(section, key, value) {
        switch (section) {
            case 'appearance':
                if (key === 'theme') {
                    this._applyTheme(value);
                }
                if (key === 'language') {
                    this._applyLanguage(value);
                }
                break;
            case 'privacy':
                this._updatePrivacyUI(key, value);
                break;
            case 'notifications':
                this._updateNotificationUI(key, value);
                break;
        }
    },
    
    _applyTheme(theme) {
        try {
            // Paint + persist now go through the single canonical engine
            // (js/theme.engine.js / window.ThemeManager) instead of this
            // file keeping its own copy of the same logic.
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
    },
    
    _applyLanguage(language) {
        try {
            const event = new CustomEvent('languageChanged', {
                detail: { language, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        } catch (error) {}
    },
    
    _updatePrivacyUI(key, value) {
        const event = new CustomEvent('privacyUpdated', {
            detail: { key, value, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    },
    
    _updateNotificationUI(key, value) {
        const event = new CustomEvent('notificationsUpdated', {
            detail: { key, value, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    },
    
    // FIX #8: Allow loading from cache even when module is not ACTIVE
    async load() {
        // Allow load from cache even if not authenticated
        const cached = this._loadFromCache();
        if (cached && Object.keys(cached).length > 0) {
            this.data = cached;
            this.loaded = true;
            this._notify('loaded', this.data);
            // Sync cached settings into AppSettings immediately (offline-safe)
            if (window.AppSettings) window.AppSettings.merge(this.data);
            
            // If not authenticated, don't try to fetch from backend
            if (!coreAuthState) {
                return this.data;
            }
        }
        
        // Only try backend fetch if authenticated
        if (!coreAuthState) {
            if (DEBUG) console.warn(`[${MODULE_NAME}] ⏳ Cannot load settings from backend: auth not ready`);
            return this.data;
        }
        
        // Don't block on state check for reading
        if (this.loading) {
            return new Promise((resolve) => {
                const checkLoaded = () => {
                    if (this.loaded) {
                        resolve(this.data);
                    } else {
                        setTimeout(checkLoaded, 100);
                    }
                };
                checkLoaded();
            });
        }
        
        this.loading = true;
        
        try {
            const response = await this._fetchFromBackend();
            
            if (response && response.success && response.data) {
                this.data = response.data;
                this.loaded = true;
                this.lastSynced = Date.now();
                this._saveToCache();
                this._notify('loaded', this.data);
                // Sync backend settings into AppSettings
                if (window.AppSettings) window.AppSettings.merge(this.data);
                return this.data;
            } else if (cached) {
                return cached;
            } else {
                this.data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                this.loaded = true;
                this._saveToCache();
                this._notify('loaded', this.data);
                return this.data;
            }
        } catch (error) {
            const cached = this._loadFromCache();
            if (cached && Object.keys(cached).length > 0) {
                this.data = cached;
                this.loaded = true;
                this._notify('loaded', this.data);
                return this.data;
            }
            
            this.data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            this.loaded = true;
            this._notify('loaded', this.data);
            return this.data;
        } finally {
            this.loading = false;
        }
    },
    
    async _fetchFromBackend() {
        try {
            const response = await authorizedRequest('/api/settings', { method: 'GET' });
            // New shape: { success:true, data:{ settings:{...AppSettings sections...} } }
            // Legacy shape: { success:true, data:{...} }
            const raw = response?.data?.settings || response?.data || response || {};
            return { success: true, data: raw };
        } catch (error) {
            throw new Error('Fetch failed: ' + error.message);
        }
    },
    
    _saveToCache() {
        try {
            const cacheData = {
                data: this.data,
                timestamp: Date.now(),
                version: MODULE_VERSION
            };
            localStorage.setItem('knecta_settings_cache', JSON.stringify(cacheData));
        } catch (error) {}
    },
    
    _loadFromCache() {
        try {
            const cached = localStorage.getItem('knecta_settings_cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.timestamp && (Date.now() - parsed.timestamp) < 24 * 60 * 60 * 1000) {
                    return parsed.data;
                }
            }
        } catch (error) {}
        return null;
    },
    
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    },
    
    _notify(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {}
        });
    },
    
    async reset() {
        if (!coreAuthState) {
            throw new Error('Authentication not ready');
        }
        
        if (currentState !== LifecycleState.ACTIVE) {
            throw new Error('Cannot reset settings: module not active');
        }
        
        const defaultData = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        
        try {
            const response = await authorizedRequest('/api/settings/reset', {
                method: 'POST',
                body: {}
            });
            
            if (response && response.success) {
                this.data = defaultData;
                this.lastSynced = Date.now();
                this._saveToCache();
                this._notify('reset', this.data);
                return { success: true };
            }
            throw new Error('Reset failed');
        } catch (error) {
            throw error;
        }
    }
};

function setState(newState, reason = '') {
    if (currentState === newState) return false;
    
    // Allow all transitions in standalone mode
    const validTransitions = {
        [LifecycleState.BOOT]: [LifecycleState.INITIALIZING, LifecycleState.ACTIVE],
        [LifecycleState.INITIALIZING]: [LifecycleState.WAITING_AUTH, LifecycleState.READY, LifecycleState.ACTIVE, LifecycleState.ERROR],
        [LifecycleState.WAITING_AUTH]: [LifecycleState.READY, LifecycleState.WAIT_PARENT, LifecycleState.ACTIVE, LifecycleState.ERROR],
        [LifecycleState.READY]: [LifecycleState.WAIT_PARENT, LifecycleState.ACTIVE],
        [LifecycleState.WAIT_PARENT]: [LifecycleState.ACTIVE],
        [LifecycleState.ACTIVE]: [LifecycleState.ACTIVE]
    };
    
    if (!validTransitions[currentState]?.includes(newState)) {
        if (DEBUG) {
            console.warn(`[${MODULE_NAME}] Transition ${currentState} → ${newState}: proceeding anyway`);
        }
        // Don't block — just log and continue
    }
    
    const oldState = currentState;
    currentState = newState;
    
    console.log(`[${MODULE_NAME}] 📍 State: ${oldState} → ${newState}${reason ? ` (${reason})` : ''}`);
    
    recordStateTransition(oldState, newState, reason);
    
    window.__SETTINGS_STATE__ = currentState;
    window.__SETTINGS_SESSION_ACTIVE__ = (newState === LifecycleState.ACTIVE);
    window.__SETTINGS_READY__ = (newState === LifecycleState.ACTIVE);
    isReady = (newState === LifecycleState.ACTIVE);
    
    try {
        const event = new CustomEvent('lifecycleStateChange', {
            detail: { oldState, newState, reason, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    } catch (e) {}
    
    return true;
}

function recordStateTransition(from, to, reason = '') {
    stateHistory.push({
        from,
        to,
        reason,
        timestamp: Date.now()
    });
    if (stateHistory.length > 50) stateHistory.shift();
}
window.__SETTINGS_STATE_OBJ__ = SettingsState;

// =============================================
// STRICT CHILD_READY - SENT EXACTLY ONCE
// =============================================
function sendChildReady() {
    if (childReadySent) {
        if (DEBUG) {
            console.log(`[${MODULE_NAME}] ⚠️ CHILD_READY already sent, ignoring duplicate`);
        }
        return false;
    }
    
    if (currentState !== LifecycleState.READY) {
        if (DEBUG) {
            console.warn(`[${MODULE_NAME}] ❌ Cannot send CHILD_READY: state is ${currentState} (must be READY)`);
        }
        return false;
    }
    
    childReadySent = true;
    
    const message = {
        type: 'CHILD_READY',
        module: MODULE_NAME,
        version: MODULE_VERSION,
        frameId: FRAME_ID,
        messageId: generateMessageId(),
        timestamp: Date.now(),
        environment: window.__iframeEnvironment || 'unknown',
        waitingForAuth: !coreAuthState
    };
    
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(message, '*');
            console.log(`[${MODULE_NAME}] 📤 CHILD_READY sent (ONCE)`);
            setState(LifecycleState.WAIT_PARENT, 'child_ready_sent');
            return true;
        } else {
            if (DEBUG) {
                console.warn(`[${MODULE_NAME}] ⚠️ No parent window found for CHILD_READY`);
            }
            return false;
        }
    } catch (error) {
        if (DEBUG) {
            console.error(`[${MODULE_NAME}] ❌ Error sending CHILD_READY:`, error);
        }
        return false;
    }
}

// =============================================
// STRICT PARENT_READY HANDLER - ACTIVATION GATE WITH SESSION VALIDATION
// =============================================
function handleParentReady(message) {
    // Accept both WAIT_PARENT (normal flow) and ACTIVE (standalone/forced mode)
    // so the real parent session is applied even when standalone mode pre-activated us
    const acceptableStates = [LifecycleState.WAIT_PARENT, LifecycleState.ACTIVE];
    if (!acceptableStates.includes(currentState)) {
        if (DEBUG) {
            console.log(`[${MODULE_NAME}] 📥 PARENT_READY ignored (state: ${currentState})`);
        }
        return false;
    }
    
    if (parentReadyReceived) {
        // If already received but we got a new one with a different session, still apply it
        const newSessionData = message.session || message.payload?.session || message;
        if (newSessionData && __isValidSession(newSessionData)) {
            const newSessionId = newSessionData.sessionId || `${newSessionData.token}_${newSessionData.userId}`;
            if (_lastSessionId !== newSessionId) {
                _lastSessionId = newSessionId;
                _currentValidSession = newSessionData;
                applySession(newSessionData);
                coreAuthState = true;
                authCheckComplete = true;
                processRequestQueue();
                loadSettingsAfterActivation();
            }
        }
        return false;
    }
    
    parentReadyReceived = true;
    
    const sessionData = message.session || message.payload?.session || message;
    
    console.log(`[${MODULE_NAME}] 📥 PARENT_READY received${sessionData ? ' with session' : ''}`);
    
    // CRITICAL: Validate session before activating
    if (sessionData) {
        if (!__isValidSession(sessionData)) {
            console.warn(`[${MODULE_NAME}] ⚠️ PARENT_READY with invalid session - cannot activate, staying in ${currentState}`);
            parentReadyReceived = false; // allow retry
            return false;
        }
        
        // Deduplicate session if already processed
        const sessionId = sessionData.sessionId || `${sessionData.token}_${sessionData.userId}`;
        if (_lastSessionId === sessionId && _currentValidSession) {
            console.log(`[${MODULE_NAME}] 📥 PARENT_READY with duplicate session ignored`);
            return false;
        }
        _lastSessionId = sessionId;
        _currentValidSession = sessionData;
        
        applySession(sessionData);
    } else {
        console.warn(`[${MODULE_NAME}] ⚠️ PARENT_READY without session data`);
        parentReadyReceived = false; // allow retry
        return false;
    }
    
    window.parentReady = true;
    window.parentReadyReceived = true;
    window.parentCommunicationReady = true;
    
    // Ensure we're ACTIVE
    if (currentState !== LifecycleState.ACTIVE) {
        setState(LifecycleState.ACTIVE, 'parent_ready_received_valid_session');
    }
    
    flushQueue();
    
    // Mark authenticated and load settings
    coreAuthState = true;
    authCheckComplete = true;
    processRequestQueue();
    loadSettingsAfterActivation();
    
    onModuleActive();
    
    try {
        const event = new CustomEvent('parentReady', {
            detail: { session: sessionData, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    } catch (e) {}
    
    return true;
}

async function loadSettingsAfterActivation() {
    if (!coreAuthState) {
        console.warn(`[${MODULE_NAME}] ⏳ Cannot load settings: auth not ready`);
        return;
    }
    
    try {
        await SettingsState.load();
        applySettingsToUI(SettingsState.get());
        
        // =============================================
        // Start watching for reconnection to sync offline queue
        // =============================================
        OfflineQueue.watchOnline(() => {
            if (OfflineQueue.hasPending() && OfflineQueue.isOnline()) {
                console.log(`[${MODULE_NAME}] 🔄 Online detected, syncing ${OfflineQueue.getPendingCount()} pending updates`);
                OfflineQueue.syncAll((section, key, value) => {
                    return SettingsState._sendUpdateToBackend(section, key, value);
                });
            }
        });
        
        // Sync any queue that accumulated while offline
        if (OfflineQueue.hasPending() && OfflineQueue.isOnline()) {
            console.log(`[${MODULE_NAME}] 🔄 Syncing pending queue (${OfflineQueue.getPendingCount()} items)`);
            OfflineQueue.syncAll((section, key, value) => {
                return SettingsState._sendUpdateToBackend(section, key, value);
            });
        }
        
        const event = new CustomEvent('settingsLoaded', {
            detail: { settings: SettingsState.get(), timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    } catch (error) {
        if (DEBUG) {
            console.error('[settings-core] Error loading settings:', error);
        }
        showRetryUI();
    }
}

function applySettingsToUI(settings) {
    try {
        if (settings.appearance?.theme) {
            applyTheme(settings.appearance.theme);
        }
        
        if (settings.appearance?.language) {
            const event = new CustomEvent('languageChanged', {
                detail: { language: settings.appearance.language, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
        
        if (settings.privacy) {
            const event = new CustomEvent('privacySettingsApplied', {
                detail: { privacy: settings.privacy, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
        
        if (settings.notifications) {
            const event = new CustomEvent('notificationSettingsApplied', {
                detail: { notifications: settings.notifications, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
        
        updateUIWithSettings(settings);
        
    } catch (error) {}
}

function updateUIWithSettings(settings) {
    try {
        if (settings.profile) {
            const displayNameInput = document.getElementById('displayName');
            if (displayNameInput && settings.profile.displayName) {
                displayNameInput.value = settings.profile.displayName;
            }
            
            const usernameInput = document.getElementById('username');
            if (usernameInput && settings.profile.username) {
                usernameInput.value = settings.profile.username;
            }
            
            const bioTextarea = document.getElementById('bio');
            if (bioTextarea && settings.profile.bio) {
                bioTextarea.value = settings.profile.bio;
            }
            
            const emailInput = document.getElementById('email');
            if (emailInput && settings.profile.email) {
                emailInput.value = settings.profile.email;
            }
            
            const moodSelect = document.getElementById('currentMood');
            if (moodSelect && settings.profile.currentMood) {
                moodSelect.value = settings.profile.currentMood;
            }
        }
        
        if (settings.privacy) {
            const whoCanAddMe = document.getElementById('whoCanAddMe');
            if (whoCanAddMe && settings.privacy.whoCanAddMe) {
                whoCanAddMe.value = settings.privacy.whoCanAddMe;
            }
            
            const canMessageMe = document.getElementById('canMessageMe');
            if (canMessageMe && settings.privacy.canMessageMe) {
                canMessageMe.value = settings.privacy.canMessageMe;
            }
            
            const readReceipts = document.getElementById('readReceipts');
            if (readReceipts) {
                readReceipts.checked = settings.privacy.readReceipts !== false;
            }
            
            const typingIndicators = document.getElementById('typingIndicators');
            if (typingIndicators) {
                typingIndicators.checked = settings.privacy.typingIndicators !== false;
            }
        }
        
        if (settings.notifications) {
            const messageNotifications = document.getElementById('messageNotifications');
            if (messageNotifications) {
                messageNotifications.checked = settings.notifications.messageNotifications !== false;
            }
            
            const groupNotifications = document.getElementById('groupNotifications');
            if (groupNotifications) {
                groupNotifications.checked = settings.notifications.groupNotifications !== false;
            }
            
            const callNotifications = document.getElementById('callNotifications');
            if (callNotifications) {
                callNotifications.checked = settings.notifications.callNotifications !== false;
            }
        }
        
        if (settings.appearance) {
            const themeSelect = document.getElementById('theme');
            if (themeSelect && settings.appearance.theme) {
                themeSelect.value = settings.appearance.theme;
            }
            
            const fontSizeSlider = document.getElementById('fontSize');
            if (fontSizeSlider && settings.appearance.fontSize) {
                fontSizeSlider.value = settings.appearance.fontSize;
                document.documentElement.style.fontSize = `${settings.appearance.fontSize}px`;
            }
            
            const languageSelect = document.getElementById('language');
            if (languageSelect && settings.appearance.language) {
                languageSelect.value = settings.appearance.language;
            }
        }
        
        if (settings.storage) {
            const totalStorageUsed = document.getElementById('totalStorageUsed');
            if (totalStorageUsed) {
                totalStorageUsed.textContent = formatStorageSize(settings.storage.totalStorageUsed || 0);
            }
            
            const chatCacheSize = document.getElementById('chatCacheSize');
            if (chatCacheSize) {
                chatCacheSize.textContent = formatStorageSize(settings.storage.chatCacheSize || 0);
            }
            
            const mediaCacheSize = document.getElementById('mediaCacheSize');
            if (mediaCacheSize) {
                mediaCacheSize.textContent = formatStorageSize(settings.storage.mediaCacheSize || 0);
            }
        }
        
    } catch (error) {}
}

function showRetryUI() {
    try {
        const container = document.getElementById('settingsContent');
        if (container) {
            const retryDiv = document.createElement('div');
            retryDiv.className = 'settings-retry';
            retryDiv.style.cssText = `
                background: var(--warning-color);
                color: white;
                padding: 12px 20px;
                margin: 20px;
                border-radius: 8px;
                text-align: center;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            retryDiv.innerHTML = `
                <span>⚠️ Failed to load settings. Using cached settings.</span>
                <button onclick="window.__retryLoadSettings()" style="
                    background: white;
                    color: var(--warning-color);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                ">Retry</button>
            `;
            container.prepend(retryDiv);
        }
        
        window.__retryLoadSettings = async () => {
            if (!coreAuthState) {
                console.warn('[settings-core] Cannot retry: auth not ready');
                return;
            }
            try {
                await SettingsState.load();
                applySettingsToUI(SettingsState.get());
                const retryDiv = document.querySelector('.settings-retry');
                if (retryDiv) retryDiv.remove();
            } catch (error) {}
        };
    } catch (error) {}
}

// =============================================
// APPLY SESSION WITH VALIDATION AND DEDUPLICATION
// =============================================
function applySession(sessionData) {
    if (!sessionData) {
        console.warn(`[${MODULE_NAME}] ⚠️ applySession called with null/undefined session`);
        return;
    }
    
    // CRITICAL: Validate session before applying
    if (!__isValidSession(sessionData)) {
        console.warn(`[${MODULE_NAME}] ⚠️ Ignored invalid session data`, {
            hasToken: !!sessionData.token,
            userId: sessionData.userId,
            tokenType: typeof sessionData.token
        });
        return;
    }
    
    // Deduplicate session
    const sessionId = sessionData.sessionId || `${sessionData.token}_${sessionData.userId}`;
    if (_lastSessionId === sessionId && _currentValidSession) {
        if (DEBUG) {
            console.log(`[${MODULE_NAME}] 📥 Duplicate session ignored (sessionId: ${sessionId})`);
        }
        return;
    }
    _lastSessionId = sessionId;
    _currentValidSession = sessionData;
    
    const token = sessionData.token || sessionData.accessToken;
    const user = sessionData.user || sessionData;
    const expiry = sessionData.expiry || sessionData.expiresAt || (Date.now() + 3600000);
    
    if (token) {
        window.session = window.session || {};
        window.session.token = token;
    }
    
    if (user) {
        window.session = window.session || {};
        window.session.user = typeof user === 'object' ? { ...user } : user;
        window.currentUser = window.session.user;
    }
    
    if (expiry) {
        window.session = window.session || {};
        window.session.expiresAt = expiry;
    }
    
    window.parentSessionReceived = true;
    window.sessionValidated = true;
    window.__SETTINGS_SESSION_ACTIVE__ = true;
    
    console.log(`[${MODULE_NAME}] ✅ Valid session applied:`, user ? `userId: ${user.id || user.userId || 'unknown'}` : 'no user');
}

function flushQueue() {
    if (queueFlushed) return;
    queueFlushed = true;
    
    while (messageQueue.length) {
        const msg = messageQueue.shift();
        sendMessage(msg);
    }
    
    if (DEBUG && messageQueue.length === 0) {
        console.log(`[${MODULE_NAME}] 📬 Queue flushed`);
    }
}

function onModuleActive() {
    if (DEBUG) {
        console.log(`[${MODULE_NAME}] 🎯 Module activated, starting post-activation tasks`);
    }
    
    if (typeof requestSettingsLoad === 'function') {
        requestSettingsLoad();
    }
    
    // Only start background tasks if auth is ready
    if (coreAuthState) {
        if (typeof startBackgroundTasks === 'function') {
            startBackgroundTasks();
        }
    } else {
        console.log(`[${MODULE_NAME}] ⏳ Waiting for authentication before starting background tasks`);
    }
    
    if (typeof initializeUI === 'function') {
        initializeUI();
    }
    
    if (typeof updateUserUI === 'function') {
        updateUserUI();
    }
    
    try {
        const event = new CustomEvent('moduleActive', {
            detail: { module: MODULE_NAME, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    } catch (e) {}
}

function requestSettingsLoad() {
    if (currentState !== LifecycleState.ACTIVE) return;
    
    try {
        if (typeof MessageTransport !== 'undefined' && MessageTransport.send) {
            MessageTransport.send('SETTINGS_LOAD_REQUEST', {});
        } else if (typeof sendMessage === 'function') {
            sendMessage({
                type: 'SETTINGS_LOAD_REQUEST',
                source: MODULE_NAME,
                target: 'parent',
                payload: {}
            });
        }
    } catch (error) {
        if (DEBUG) console.error('[settings-core] Error requesting settings:', error);
    }
}

// =============================================
// MESSAGE MANAGEMENT - NO DUPLICATES
// =============================================
function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

function isMessageDuplicate(messageId) {
    if (!messageId) return false;
    
    if (processedMessages.has(messageId)) {
        return true;
    }
    
    processedMessages.add(messageId);
    
    if (processedMessages.size > MAX_PROCESSED_MESSAGES) {
        const firstItem = processedMessages.values().next().value;
        processedMessages.delete(firstItem);
    }
    
    return false;
}

function isSentDuplicate(messageId) {
    if (!messageId) return false;
    if (sentMessageIds.has(messageId)) return true;
    sentMessageIds.add(messageId);
    
    if (sentMessageIds.size > MAX_PROCESSED_MESSAGES) {
        const firstItem = sentMessageIds.values().next().value;
        sentMessageIds.delete(firstItem);
    }
    
    return false;
}

// =============================================
// SAFE SEND TO PARENT - QUEUE BEFORE ACTIVE
// =============================================
function sendMessage(message) {
    // No longer gate on ACTIVE state - always attempt to send
    
    try {
        let canonicalMessage = message;
        
        if (!message.type || !message.source || !message.messageId) {
            canonicalMessage = createCanonicalMessage(
                message.type || 'UNKNOWN',
                message.payload || message,
                'parent'
            );
        }
        
        if (canonicalMessage.messageId && isSentDuplicate(canonicalMessage.messageId)) {
            if (DEBUG) {
                console.log(`[${MODULE_NAME}] ⚠️ Duplicate message blocked: ${canonicalMessage.messageId}`);
            }
            return false;
        }
        
        if (!canonicalMessage.type || !canonicalMessage.source || !canonicalMessage.messageId || !canonicalMessage.timestamp) {
            return false;
        }
        
        canonicalMessage.target = 'parent';
        
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(canonicalMessage, '*');
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

function safeSend(msg) {
    if (currentState !== LifecycleState.ACTIVE) {
        messageQueue.push(msg);
        return true;
    }
    
    return sendMessage(msg);
}

function createCanonicalMessage(type, payload = {}, target = 'parent') {
    return {
        type: type,
        source: MODULE_NAME,
        target: target,
        messageId: generateMessageId(),
        requestId: generateRequestId(),
        timestamp: Date.now(),
        payload: payload
    };
}

// =============================================
// API REQUEST HELPER - ENDPOINT NORMALIZATION
// =============================================
function normalizeEndpoint(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') return '/';
    
    let normalized = endpoint.trim();
    
    // Remove /api prefix if present
    if (normalized.startsWith('/api/')) {
        normalized = normalized.substring(4);
    } else if (normalized.startsWith('api/')) {
        normalized = '/' + normalized.substring(4);
    }
    
    // Ensure starts with /
    if (!normalized.startsWith('/')) {
        normalized = '/' + normalized;
    }
    
    // Remove double slashes
    normalized = normalized.replace(/\/+/g, '/');

    const exactAliases = {
        '/settings': '/settings',
        '/settings/privacy': '/profile/privacy',
        '/users/blocked': '/users/blocked'
    };

    if (Object.prototype.hasOwnProperty.call(exactAliases, normalized)) {
        return exactAliases[normalized];
    }

    return normalized;
}

// =============================================
// SIMPLIFIED MESSAGE LISTENER WITH AUTH HANDLING AND SESSION VALIDATION
// =============================================
function setupMessageListener() {
    window.addEventListener('message', (event) => {
        const data = event.data;
        
        if (!data || typeof data !== 'object') return;
        if (!data.type) return;
        
        if (data.messageId && isMessageDuplicate(data.messageId)) {
            if (DEBUG) {
                console.log(`[${MODULE_NAME}] 📥 Duplicate message ignored: ${data.type} (${data.messageId})`);
            }
            return;
        }
        
        // =============================================
        // AUTH_READY HANDLER - CRITICAL FIX
        // =============================================
        if (data.type === 'AUTH_READY') {
            console.log(`[${MODULE_NAME}] ✅ AUTH_READY received`);
            coreAuthState = true;
            authCheckComplete = true;
            
            // Process queued requests
            processRequestQueue();
            
            // Load settings if we're ACTIVE (regardless of parentReadyReceived — standalone mode reaches ACTIVE without it)
            if (currentState === LifecycleState.ACTIVE) {
                loadSettingsAfterActivation();
                startBackgroundTasks();
            }
            
            // If we're still waiting for auth, transition to READY
            if (currentState === LifecycleState.WAITING_AUTH) {
                setState(LifecycleState.READY, 'auth_ready');
                sendChildReady();
            }
            
            return;
        }
        
        // =============================================
        // AUTH_ERROR HANDLER
        // =============================================
        if (data.type === 'AUTH_ERROR') {
            console.error(`[${MODULE_NAME}] ❌ AUTH_ERROR received`);
            coreAuthState = false;
            authCheckComplete = true;
            setState(LifecycleState.ERROR, 'auth_error');
            return;
        }
        
        // =============================================
        // SESSION_DATA HANDLER WITH VALIDATION
        // =============================================
        if (data.type === 'SESSION_DATA') {
            const sessionData = data.session || data.payload?.session || data.payload || data;
            
            if (!__isValidSession(sessionData)) {
                if (DEBUG) console.warn(`[${MODULE_NAME}] ⚠️ Ignored invalid SESSION_DATA`, {
                    hasToken: !!sessionData.token,
                    userId: sessionData.userId,
                    tokenType: typeof sessionData.token
                });
                return;
            }
            
            const sessionId = sessionData.sessionId || `${sessionData.token}_${sessionData.userId}`;
            if (_lastSessionId === sessionId && _currentValidSession && coreAuthState) {
                if (DEBUG) console.log(`[${MODULE_NAME}] 📥 Duplicate SESSION_DATA ignored`);
                return;
            }
            _lastSessionId = sessionId;
            _currentValidSession = sessionData;
            
            applySession(sessionData);
            
            // Mark authenticated so API calls can proceed
            if (!coreAuthState) {
                coreAuthState = true;
                authCheckComplete = true;
                processRequestQueue();
                if (currentState === LifecycleState.ACTIVE) {
                    loadSettingsAfterActivation();
                }
            }
            
            console.log(`[${MODULE_NAME}] ✅ Valid SESSION_DATA applied`);
            return;
        }
        
        // =============================================
        // SESSION_UPDATE HANDLER WITH VALIDATION AND PROTECTION
        // =============================================
        if (data.type === 'SESSION_UPDATE') {
            const sessionData = data.session || data.payload?.session || data;
            
            // Prevent session downgrade
            if (_currentValidSession && __isValidSession(_currentValidSession)) {
                if (!__isValidSession(sessionData)) {
                    console.warn(`[${MODULE_NAME}] ⚠️ Prevented session downgrade - ignoring invalid SESSION_UPDATE`);
                    return;
                }
            }
            
            if (!__isValidSession(sessionData)) {
                console.warn(`[${MODULE_NAME}] ⚠️ Ignored invalid SESSION_UPDATE`);
                return;
            }
            
            const sessionId = sessionData.sessionId || `${sessionData.token}_${sessionData.userId}`;
            if (_lastSessionId === sessionId && _currentValidSession) {
                if (DEBUG) {
                    console.log(`[${MODULE_NAME}] 📥 Duplicate SESSION_UPDATE ignored`);
                }
                return;
            }
            _lastSessionId = sessionId;
            
            // Merge safely without overwriting entire state
            if (_currentValidSession) {
                _currentValidSession = { ..._currentValidSession, ...sessionData };
            } else {
                _currentValidSession = sessionData;
            }
            
            applySession(_currentValidSession);
            console.log(`[${MODULE_NAME}] ✅ Valid SESSION_UPDATE merged`);
            
            return;
        }
        
        if (data.type === 'PARENT_READY') {
            handleParentReady(data);
            return;
        }
        
        if (data.type === 'SETTINGS_DATA') {
            handleSettingsDataResponse(data);
            return;
        }
        
        if (data.type === 'SETTINGS_UPDATE_CONFIRMED') {
            handleSettingsUpdateConfirmedMessage(data);
            return;
        }
        
        if (data.type === 'SETTINGS_UPDATE_ERROR') {
            handleSettingsUpdateErrorMessage(data);
            return;
        }
        
        if (data.type === 'SETTINGS_FETCH_ERROR') {
            handleSettingsFetchErrorMessage(data);
            return;
        }
        
        if (data.type === 'SETTINGS_GLOBAL_UPDATE') {
            handleSettingsGlobalUpdateMessage(data);
            return;
        }
        
        if (data.type === 'API_REQUEST') {
            handleApiRequest(data);
            return;
        }
        
        if (currentState !== LifecycleState.ACTIVE) {
            if (DEBUG && data.type !== 'PING') {
                console.log(`[${MODULE_NAME}] 📥 Ignoring ${data.type} (state: ${currentState})`);
            }
            return;
        }
        
        routeMessage(data);
    });
}

function handleApiRequest(message) {
    if (currentState !== LifecycleState.ACTIVE) {
        console.warn(`[${MODULE_NAME}] API request ignored - module not active`);
        return;
    }
    
    if (!coreAuthState) {
        console.warn(`[${MODULE_NAME}] API request ignored - not authenticated`);
        return;
    }
    
    // Ensure request has required fields
    const request = message.payload || message;
    const requestId = request.requestId || generateRequestId();
    const endpoint = normalizeEndpoint(request.endpoint);
    const method = request.method || 'GET';
    
    const apiMessage = {
        type: 'API_REQUEST',
        requestId: requestId,
        endpoint: endpoint,
        method: method,
        data: request.data,
        headers: request.headers || {},
        timestamp: Date.now()
    };
    
    if (window.parent && window.parent !== window) {
        window.parent.postMessage(apiMessage, '*');
    }
}

function handleSettingsDataResponse(data) {
    if (data.payload && data.payload.settings) {
        SettingsState.data = data.payload.settings;
        SettingsState.loaded = true;
        SettingsState.lastSynced = Date.now();
        SettingsState._saveToCache();
        applySettingsToUI(SettingsState.data);
        
        const event = new CustomEvent('settingsDataReceived', {
            detail: { settings: SettingsState.data, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    }
}

function handleSettingsUpdateConfirmedMessage(data) {
    const event = new CustomEvent('settingsUpdateConfirmed', {
        detail: { data: data.payload, timestamp: Date.now() }
    });
    window.dispatchEvent(event);
}

function handleSettingsUpdateErrorMessage(data) {
    const event = new CustomEvent('settingsUpdateError', {
        detail: { error: data.error, timestamp: Date.now() }
    });
    window.dispatchEvent(event);
}

function handleSettingsFetchErrorMessage(data) {
    if (DEBUG) {
        console.error('[settings-core] Settings fetch error:', data.error);
    }
    
    const event = new CustomEvent('settingsFetchError', {
        detail: { error: data.error, timestamp: Date.now() }
    });
    window.dispatchEvent(event);
}

function handleSettingsGlobalUpdateMessage(data) {
    if (data.section && data.key !== undefined) {
        if (!SettingsState.data[data.section]) {
            SettingsState.data[data.section] = {};
        }
        SettingsState.data[data.section][data.key] = data.value;
        SettingsState.lastSynced = Date.now();
        SettingsState._saveToCache();
        applySettingsToUI(SettingsState.data);
        
        const event = new CustomEvent('settingsGlobalUpdated', {
            detail: { section: data.section, key: data.key, value: data.value, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    }
}

function routeMessage(message) {
    const type = message.type;
    
    switch (type) {
        case 'SESSION_DATA':
            if (typeof handleSessionData === 'function') handleSessionData(message);
            break;
        case 'MODULE_REGISTERED':
            if (typeof handleModuleRegisteredMessage === 'function') handleModuleRegisteredMessage(message);
            break;
        case 'SESSION_SYNC':
            if (typeof handleSessionSyncMessage === 'function') handleSessionSyncMessage(message);
            break;
        case 'SESSION_UPDATE':
            if (typeof handleSessionUpdateMessage === 'function') handleSessionUpdateMessage(message);
            break;
        case 'SESSION_INVALIDATED':
            if (typeof handleSessionInvalidatedMessage === 'function') handleSessionInvalidatedMessage(message);
            break;
        case 'SETTINGS_LOAD_RESPONSE':
            if (typeof handleSettingsLoadResponseMessage === 'function') handleSettingsLoadResponseMessage(message);
            break;
        case 'SETTINGS_UPDATED':
            if (typeof handleSettingsUpdatedMessage === 'function') handleSettingsUpdatedMessage(message);
            break;
        case 'PROFILE_UPDATED':
            if (typeof handleProfileUpdatedMessage === 'function') handleProfileUpdatedMessage(message);
            break;
        case 'PRIVACY_UPDATED':
            if (typeof handlePrivacyUpdatedMessage === 'function') handlePrivacyUpdatedMessage(message);
            break;
        case 'NOTIFICATIONS_UPDATED':
            if (typeof handleNotificationsUpdatedMessage === 'function') handleNotificationsUpdatedMessage(message);
            break;
        case 'LANGUAGE_CHANGED':
            if (typeof handleLanguageChangedMessage === 'function') handleLanguageChangedMessage(message);
            break;
        case 'THEME_CHANGED':
            if (typeof handleThemeChangedMessage === 'function') handleThemeChangedMessage(message);
            break;
        case 'ACCOUNT_LOGGED_OUT':
            if (typeof handleAccountLoggedOutMessage === 'function') handleAccountLoggedOutMessage(message);
            break;
        case 'BLOCKED_USERS_UPDATED':
            if (typeof handleBlockedUsersUpdatedMessage === 'function') handleBlockedUsersUpdatedMessage(message);
            break;
        case 'ACTIVE_SESSIONS_UPDATED':
            if (typeof handleActiveSessionsUpdatedMessage === 'function') handleActiveSessionsUpdatedMessage(message);
            break;
        case 'USER_CONTACTS_UPDATED':
            if (typeof handleUserContactsUpdatedMessage === 'function') handleUserContactsUpdatedMessage(message);
            break;
        case 'USER_GROUPS_UPDATED':
            if (typeof handleUserGroupsUpdatedMessage === 'function') handleUserGroupsUpdatedMessage(message);
            break;
        case 'STORAGE_USAGE_UPDATED':
            if (typeof handleStorageUsageUpdatedMessage === 'function') handleStorageUsageUpdatedMessage(message);
            break;
        case 'ERROR':
            if (typeof handleErrorMessageMessage === 'function') handleErrorMessageMessage(message);
            break;
        case 'PING':
            if (typeof handlePingMessage === 'function') handlePingMessage(message);
            break;
        case 'PONG':
            if (typeof handlePongMessage === 'function') handlePongMessage(message);
            break;
    }
}

function handlePingMessage(message) {
    if (currentState === LifecycleState.ACTIVE) {
        try {
            const pongMessage = {
                type: 'PONG',
                source: MODULE_NAME,
                target: 'parent',
                messageId: generateMessageId(),
                inResponseTo: message.messageId,
                timestamp: Date.now()
            };
            
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(pongMessage, '*');
            }
        } catch (e) {}
    }
}

function handlePongMessage(message) {
    window.lastPongTime = Date.now();
    if (typeof ReliabilityEngine !== 'undefined' && ReliabilityEngine.emit) {
        ReliabilityEngine.emit('pong', { timestamp: Date.now() });
    }
}

// =============================================
// SESSION SYNC HANDLERS (FIX: Forensic Audit P2 — were empty stubs)
// =============================================

function handleSessionData(message) {
    // Initial session delivery from parent frame on load
    const sessionData = message?.session || message?.data?.session || message?.data || message;
    if (!sessionData) return;
    const token  = sessionData.token || sessionData.accessToken;
    const user   = sessionData.user  || (sessionData.id ? sessionData : null);
    const expiry = sessionData.expiry || sessionData.expiresAt || (Date.now() + 3_600_000);
    if (token || user) {
        window.session = window.session || {};
        if (token)  { window.session.token     = token; }
        if (user)   { window.session.user      = typeof user === 'object' ? { ...user } : user;
                      window.currentUser       = window.session.user; }
        if (expiry) { window.session.expiresAt = expiry; }
        window.parentSessionReceived  = true;
        window.sessionValidated       = true;
        window.__SETTINGS_SESSION_ACTIVE__ = true;
    }
}

function handleModuleRegisteredMessage(message) {
    // Parent confirms this module has been registered — safe to request data
    window.__statusModuleRegistered = true;
    // Re-request any pending status data now that the channel is confirmed open
    if (window.__statusPendingLoad) {
        window.__statusPendingLoad = false;
        window.dispatchEvent(new CustomEvent('status:requestInitialLoad', { detail: {} }));
    }
}

function handleSessionSyncMessage(message) {
    // Parent is syncing session state (e.g. after a token refresh or tab focus)
    const sessionData = message?.session || message?.data?.session || message?.data || message;
    if (!sessionData) return;
    const token = sessionData.token || sessionData.accessToken;
    const user  = sessionData.user  || (sessionData.id ? sessionData : null);
    if (!token && !user) return;
    window.session = window.session || {};
    if (token) { window.session.token = token; }
    if (user)  {
        window.session.user  = typeof user === 'object' ? { ...user } : user;
        window.currentUser   = window.session.user;
        coreCurrentUser          = window.session.user;
    }
    window.session.expiresAt = sessionData.expiry || sessionData.expiresAt || (Date.now() + 3_600_000);
    window.__SETTINGS_SESSION_ACTIVE__ = true;
    // Re-render in case the user object changed (e.g. avatar or displayName updated)
    window.dispatchEvent(new CustomEvent('status:sessionRefreshed', {
        detail: { userId: window.session.user?.id, token: !!token }
    }));
}

function handleSessionUpdateMessage(message) {
    // A field-level session update (e.g. user changed their avatar or name)
    const update = message?.update || message?.data?.update || message?.data || {};
    if (!window.session?.user) return;
    window.session.user = Object.assign({}, window.session.user, update);
    window.currentUser  = window.session.user;
    coreCurrentUser         = window.session.user;
    // Propagate into any visible status UI
    window.dispatchEvent(new CustomEvent('status:userUpdated', {
        detail: { user: window.session.user }
    }));
}

function handleSessionInvalidatedMessage(message) {
    // Parent signals that the current session is no longer valid (logout / expiry)
    window.session = { token: null, user: null, expiresAt: 0, version: 0 };
    window.currentUser  = null;
    coreCurrentUser         = null;
    window.parentSessionReceived          = false;
    window.sessionValidated               = false;
    window.__SETTINGS_SESSION_ACTIVE__    = false;
    window.__statusModuleRegistered       = false;
    // Clear any cached status data that may contain PII
    try {
        const keysToRemove = Object.keys(sessionStorage).filter(k => k.startsWith('status_'));
        keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch(_) {}
    window.dispatchEvent(new CustomEvent('status:sessionInvalidated', { detail: {} }));
}
function handleSettingsLoadResponseMessage(message) {
    // Settings data returned from parent's cache/backend — merge into SettingsState
    const settings = message?.settings || message?.data?.settings || message?.data || null;
    if (settings && typeof settings === 'object' && Object.keys(settings).length > 0) {
        SettingsState.data = Object.assign({}, SettingsState.data, settings);
        SettingsState.loaded = true;
        SettingsState._saveToCache();
        if (window.AppSettings) window.AppSettings.merge(SettingsState.data);
        applySettingsToUI(SettingsState.data);
    }
}

function handleSettingsUpdatedMessage(message) {
    // Incoming settings update — could be from another device via socket relay,
    // from a sibling iframe, or from the parent frame broadcasting a change.
    const settings = message?.settings || message?.data?.settings || message?.data || null;
    if (!settings || typeof settings !== 'object') return;

    // Deep-merge into SettingsState so we never lose existing keys
    Object.keys(settings).forEach(section => {
        if (settings[section] && typeof settings[section] === 'object') {
            SettingsState.data[section] = Object.assign({}, SettingsState.data[section] || {}, settings[section]);
        } else if (settings[section] !== undefined) {
            SettingsState.data[section] = settings[section];
        }
    });
    SettingsState.lastSynced = Date.now();
    SettingsState._saveToCache();

    // Propagate into AppSettings (single source of truth)
    if (window.AppSettings) window.AppSettings.merge(SettingsState.data);

    // Apply effects to this page's DOM immediately
    applySettingsToUI(SettingsState.data);

    window.dispatchEvent(new CustomEvent('settingsUpdated', {
        detail: { settings: SettingsState.data, partial: settings, timestamp: Date.now() }
    }));
}
function handleProfileUpdatedMessage(message) {}
function handlePrivacyUpdatedMessage(message) {}
function handleNotificationsUpdatedMessage(message) {}
function handleLanguageChangedMessage(message) {}
function handleThemeChangedMessage(message) {}
function handleAccountLoggedOutMessage(message) {}
function handleBlockedUsersUpdatedMessage(message) {}
function handleActiveSessionsUpdatedMessage(message) {}
function handleUserContactsUpdatedMessage(message) {}
function handleUserGroupsUpdatedMessage(message) {}
function handleStorageUsageUpdatedMessage(message) {}
function handleErrorMessageMessage(message) {}

// =============================================
// REGISTRATION FLAGS
// =============================================
let sessionSyncCompleted = false;
let registrationSent = false;

window.parentReady = false;

window.session = {
    token: null,
    user: null,
    expiresAt: 0,
    version: 0
};

// =============================================
// EXPORTED STATE VARIABLES
// =============================================
let coreCurrentUser = null;
let userSettings = null;
let currentSection = 'profile';
let unsavedChanges = false;
let blockedUsers = [];
let activeSessions = [];
let userContacts = [];
let userGroups = [];

let authReady = false;
let apiInitialized = false;
let backgroundTasksStarted = false;
let tokenReady = false;
let tokenAvailable = false;
let tokenInitialized = false;
let parentCommunicationReady = false;
let parentSessionReceived = false;
let parentOrigin = null;
let parentSessionData = null;
let sessionValidated = false;
let connectionQuality = 'unknown';
let lastPongTime = 0;

window.__SETTINGS_STATE__ = currentState;
window.__SETTINGS_SESSION_ACTIVE__ = false;
window.__SETTINGS_READY__ = isReady;

// =============================================
// CONSTANTS
// =============================================
const MAX_API_RETRIES = 0;
const AUTH_CHECK_INTERVAL = 30000;
const TOKEN_CHECK_INTERVAL = 1000;
const HANDSHAKE_RETRY_INTERVAL = 2000;
const SESSION_SYNC_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 10000;
const PING_INTERVAL = 15000;
const PING_TIMEOUT = 5000;
const MAX_PING_FAILURES = 3;
const RECOVERY_BACKOFF_BASE = 1000;
const RECOVERY_MAX_BACKOFF = 30000;
const VISIBILITY_THROTTLE_DELAY = 5000;
const TOKEN_BINDING_NONCE_LENGTH = 16;

const activeTimers = new Set();
const activeIntervals = new Set();

function safeSetTimeout(fn, delay) {
    const timer = setTimeout(() => {
        activeTimers.delete(timer);
        fn();
    }, delay);
    activeTimers.add(timer);
    return timer;
}

function safeSetInterval(fn, interval) {
    const timer = setInterval(fn, interval);
    activeIntervals.add(timer);
    return timer;
}

function clearAllTimers() {
    activeTimers.forEach(timer => clearTimeout(timer));
    activeTimers.clear();
    activeIntervals.forEach(interval => clearInterval(interval));
    activeIntervals.clear();
}

// =============================================
// SECURE ORIGIN VALIDATION
// =============================================
const TrustedOrigins = {
    _trusted: new Set(),
    
    init() {
        this.addTrustedOrigin(window.location.origin);
        this.addTrustedOrigin('http://localhost');
        this.addTrustedOrigin('http://127.0.0.1');
        this.addTrustedOrigin('null');
        
        try {
            if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
                this.addTrustedOrigin(window.location.ancestorOrigins[0]);
            }
        } catch (e) {}
        
        this.addTrustedOrigin('https://nexora-3bla.onrender.com');
        this.addTrustedOrigin('https://nexopa.onrender.com');
    },
    
    addTrustedOrigin(origin) {
        if (origin) this._trusted.add(origin);
    },
    
    isValid(origin) {
        if (!origin) return false;
        if (origin === 'null') return true;
        if (this._trusted.has(origin)) return true;
        
        if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('onrender.com')) {
            this._trusted.add(origin);
            return true;
        }
        
        return false;
    },
    
    setParentOrigin(origin) {
        if (origin && this.isValid(origin)) {
            parentOrigin = origin;
            this.addTrustedOrigin(origin);
        }
    }
};

TrustedOrigins.init();

// =============================================
// VALIDATE CANONICAL MESSAGE SCHEMA
// =============================================
function validateCanonicalMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    
    const required = ['type', 'source', 'target', 'messageId', 'timestamp', 'payload'];
    
    for (const field of required) {
        if (!msg.hasOwnProperty(field)) {
            return false;
        }
    }
    
    if (typeof msg.type !== 'string') return false;
    if (typeof msg.source !== 'string') return false;
    if (typeof msg.target !== 'string') return false;
    if (typeof msg.messageId !== 'string') return false;
    if (typeof msg.timestamp !== 'number') return false;
    
    if (msg.target !== 'parent') {
        return false;
    }
    
    return true;
}

function throttledLog(level, message, data = null) {
    if (!DEBUG && level !== 'error' && level !== 'success' && level !== 'init' && level !== 'receive') {
        return;
    }
    
    switch(level) {
        case 'error': 
            console.error(`[${MODULE_NAME}] ❌ ${message}`, data || '');
            break;
        case 'warn': 
            console.warn(`[${MODULE_NAME}] ⚠️ ${message}`, data || '');
            break;
        case 'success': 
            console.log(`[${MODULE_NAME}] ✅ ${message}`, data || '');
            break;
        case 'init': 
            console.log(`[${MODULE_NAME}] 🚀 ${message}`, data || '');
            break;
        case 'receive':
            console.log(`[${MODULE_NAME}] 📥 ${message}`, data || '');
            break;
        case 'send':
            if (DEBUG) console.log(`[${MODULE_NAME}] 📤 ${message}`, data || '');
            break;
        default:
            if (DEBUG) console.debug(`[${MODULE_NAME}] 🔍 ${message}`, data || '');
    }
}

function debugLog(...args) { throttledLog('debug', args[0], args.slice(1)); }
function errorLog(...args) { throttledLog('error', args[0], args.slice(1)); }
function successLog(...args) { throttledLog('success', args[0], args.slice(1)); }
function sendLog(...args) { throttledLog('send', args[0], args.slice(1)); }
function receiveLog(...args) { throttledLog('receive', args[0], args.slice(1)); }
function initLog(...args) { throttledLog('init', args[0], args.slice(1)); }

// =============================================
// MESSAGE TRANSPORT
// =============================================
const MessageTransport = {
    _parentWindow: null,
    _parentOrigin: '*',
    _messageHandlers: new Map(),
    _enabled: true,
    _frameId: FRAME_ID,
    _silent: true,
    _listenerAttached: false,
    
    init() {
        initLog('MessageTransport initializing');
        this._detectParent();
        this._setupListener();
        successLog('MessageTransport initialized');
    },
    
    _detectParent() {
        try {
            if (window.parent && window.parent !== window) {
                this._parentWindow = window.parent;
                
                try {
                    if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
                        this._parentOrigin = window.location.ancestorOrigins[0];
                    } else {
                        this._parentOrigin = document.referrer ? new URL(document.referrer).origin : '*';
                    }
                } catch (e) {
                    this._parentOrigin = '*';
                }
                
                TrustedOrigins.setParentOrigin(this._parentOrigin);
                parentOrigin = this._parentOrigin;
            }
        } catch (error) {}
    },
    
    _setupListener() {
        if (this._listenerAttached) return;
        
        window.addEventListener('message', (event) => {
            setTimeout(() => this._handleIncoming(event), 0);
        });
        
        this._listenerAttached = true;
    },
    
    _handleIncoming(event) {
        try {
            if (parentOrigin && event.origin !== parentOrigin && currentState !== LifecycleState.WAIT_PARENT) {
                return;
            }
            
            const message = event.data;
            
            if (message.type !== 'PARENT_READY' && !validateCanonicalMessage(message) && 
                message.type !== 'SETTINGS_DATA' && message.type !== 'SETTINGS_UPDATE_CONFIRMED' &&
                message.type !== 'SETTINGS_UPDATE_ERROR' && message.type !== 'SETTINGS_FETCH_ERROR' &&
                message.type !== 'SETTINGS_GLOBAL_UPDATE' && message.type !== 'AUTH_READY' && message.type !== 'AUTH_ERROR') {
                return;
            }
            
            if (message.messageId && isMessageDuplicate(message.messageId)) {
                return;
            }
            
            receiveLog(message.type);
            
            if (message.type === 'AUTH_READY') {
                coreAuthState = true;
                authCheckComplete = true;
                processRequestQueue();
                
                if (parentReadyReceived && currentState === LifecycleState.ACTIVE && __isValidSession(_currentValidSession)) {
                    loadSettingsAfterActivation();
                    startBackgroundTasks();
                }
                
                if (currentState === LifecycleState.WAITING_AUTH) {
                    setState(LifecycleState.READY, 'auth_ready');
                    sendChildReady();
                }
                return;
            }
            
            if (message.type === 'AUTH_ERROR') {
                console.error(`[${MODULE_NAME}] ❌ AUTH_ERROR received`);
                coreAuthState = false;
                authCheckComplete = true;
                setState(LifecycleState.ERROR, 'auth_error');
                return;
            }
            
            if (message.type === 'SESSION_DATA') {
                const sessionData = message.session || message.payload?.session || message;
                if (!__isValidSession(sessionData)) {
                    console.warn(`[${MODULE_NAME}] ⚠️ Ignored invalid SESSION_DATA in MessageTransport`);
                    return;
                }
                const sessionId = sessionData.sessionId || `${sessionData.token}_${sessionData.userId}`;
                if (_lastSessionId === sessionId && _currentValidSession) {
                    return;
                }
                _lastSessionId = sessionId;
                _currentValidSession = sessionData;
                applySession(sessionData);
                return;
            }
            
            if (message.type === 'SESSION_UPDATE') {
                const sessionData = message.session || message.payload?.session || message;
                if (_currentValidSession && __isValidSession(_currentValidSession)) {
                    if (!__isValidSession(sessionData)) {
                        console.warn(`[${MODULE_NAME}] ⚠️ Prevented session downgrade in MessageTransport`);
                        return;
                    }
                }
                if (!__isValidSession(sessionData)) {
                    console.warn(`[${MODULE_NAME}] ⚠️ Ignored invalid SESSION_UPDATE in MessageTransport`);
                    return;
                }
                const sessionId = sessionData.sessionId || `${sessionData.token}_${sessionData.userId}`;
                if (_lastSessionId === sessionId && _currentValidSession) {
                    return;
                }
                _lastSessionId = sessionId;
                if (_currentValidSession) {
                    _currentValidSession = { ..._currentValidSession, ...sessionData };
                } else {
                    _currentValidSession = sessionData;
                }
                applySession(_currentValidSession);
                return;
            }
            
            if (message.type === 'PARENT_READY') {
                handleParentReady(message);
                return;
            }
            
            if (message.type === 'SETTINGS_DATA') {
                handleSettingsDataResponse(message);
                return;
            }
            
            if (message.type === 'SETTINGS_UPDATE_CONFIRMED') {
                handleSettingsUpdateConfirmedMessage(message);
                return;
            }
            
            if (message.type === 'SETTINGS_UPDATE_ERROR') {
                handleSettingsUpdateErrorMessage(message);
                return;
            }
            
            if (message.type === 'SETTINGS_FETCH_ERROR') {
                handleSettingsFetchErrorMessage(message);
                return;
            }
            
            if (message.type === 'SETTINGS_GLOBAL_UPDATE') {
                handleSettingsGlobalUpdateMessage(message);
                return;
            }
            
            if (!window.parentReady) {
                return;
            }
            
            const handlers = this._messageHandlers.get(message.type) || [];
            handlers.forEach(handler => {
                try {
                    handler(message);
                } catch (error) {
                    errorLog(`Error in handler for ${message.type}:`, error);
                }
            });
            
        } catch (error) {}
    },
    
    send(type, payload = {}) {
        try {
            if (!this._enabled) {
                return false;
            }
            
            const message = createCanonicalMessage(type, payload, 'parent');
            
            sendLog(`${type} - MessageId: ${message.messageId}`);
            
            if (!this._parentWindow || this._parentWindow === window) {
                this._detectParent();
                if (!this._parentWindow || this._parentWindow === window) {
                    return false;
                }
            }
            
            safeSend(message);
            
            return true;
            
        } catch (error) {
            return false;
        }
    },
    
    on(type, handler) {
        if (!this._messageHandlers.has(type)) {
            this._messageHandlers.set(type, []);
        }
        this._messageHandlers.get(type).push(handler);
        return () => this.off(type, handler);
    },
    
    off(type, handler) {
        const handlers = this._messageHandlers.get(type);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        }
    },
    
    disable() {
        this._enabled = false;
    },
    
    enable() {
        this._enabled = true;
    },
    
    getDiagnostics() {
        return {
            enabled: this._enabled
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

MessageTransport.init();

// =============================================
// LIFECYCLE CONTROLLER - STRICT STATE MACHINE
// =============================================
const LifecycleController = {
    _sessionRequestRetries: 0,
    _maxSessionRetries: 3,
    
    init() {
        initLog('LifecycleController initializing');
        this._setupMessageHandlers();
        
        setState(LifecycleState.BOOT, 'starting');
        this._initializeComponents();
        
        successLog('LifecycleController initialized');
    },
    
    _initializeComponents() {
        loadFromLocalStorage();
        
        if (currentState === LifecycleState.BOOT) {
            setState(LifecycleState.INITIALIZING, 'component_init');
            setState(LifecycleState.WAITING_AUTH, 'auth_bypass');
            setState(LifecycleState.READY, 'auth_bypass');
            setState(LifecycleState.WAIT_PARENT, 'auth_bypass');
            setState(LifecycleState.ACTIVE, 'standalone_mode');
            console.log(`[${MODULE_NAME}] ✅ Standalone mode - state forced to ACTIVE`);
        }
    },
    
    _sendChildReady() {
        if (childReadySent) return;
        if (currentState !== LifecycleState.READY) return;
        
        sendChildReady();
        initLog('CHILD_READY sent, waiting for PARENT_READY');
    },
    
    _setupMessageHandlers() {
        MessageTransport.on('PARENT_READY', (message) => {});
        MessageTransport.on('MODULE_REGISTERED', (message) => {});
        MessageTransport.on('SESSION_SYNC', (message) => {});
        MessageTransport.on('SESSION_UPDATE', (message) => {});
        MessageTransport.on('SESSION_INVALIDATED', (message) => {});
        MessageTransport.on('SETTINGS_LOAD_RESPONSE', (message) => {});
        MessageTransport.on('SETTINGS_UPDATED', (message) => {});
        MessageTransport.on('PROFILE_UPDATED', (message) => {});
        MessageTransport.on('PRIVACY_UPDATED', (message) => {});
        MessageTransport.on('NOTIFICATIONS_UPDATED', (message) => {});
        MessageTransport.on('LANGUAGE_CHANGED', (message) => {});
        MessageTransport.on('THEME_CHANGED', (message) => {});
        MessageTransport.on('ACCOUNT_LOGGED_OUT', (message) => {});
        MessageTransport.on('BLOCKED_USERS_UPDATED', (message) => {});
        MessageTransport.on('ACTIVE_SESSIONS_UPDATED', (message) => {});
        MessageTransport.on('USER_CONTACTS_UPDATED', (message) => {});
        MessageTransport.on('USER_GROUPS_UPDATED', (message) => {});
        MessageTransport.on('STORAGE_USAGE_UPDATED', (message) => {});
        MessageTransport.on('ERROR', (message) => {});
        MessageTransport.on('SETTINGS_DATA', (message) => {});
        MessageTransport.on('SETTINGS_UPDATE_CONFIRMED', (message) => {});
        MessageTransport.on('SETTINGS_GLOBAL_UPDATE', (message) => {});
        MessageTransport.on('AUTH_READY', (message) => {});
        MessageTransport.on('AUTH_ERROR', (message) => {});
    }
};

// =============================================
// API CORE GATEWAY - USES authorizedRequest
// =============================================
const ApiCore = {
    _ready: false,
    _readyPromise: null,
    _readyResolvers: [],
    
    init() {
        initLog('API Gateway initializing');
        this._readyPromise = new Promise((resolve) => {
            this._readyResolvers.push(resolve);
        });
        return this;
    },
    
    isReady() {
        return this._ready && currentState === LifecycleState.ACTIVE && coreAuthState;
    },
    
    whenReady() {
        return this._readyPromise || Promise.resolve();
    },
    
    async request(endpoint, options = {}) {
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
            const response = await authorizedRequest(endpoint, options);
            return response;
        } catch (error) {
            return {
                success: false,
                status: 'error',
                message: error.message || 'Request failed',
                data: null
            };
        }
    },
    
    getDiagnostics() {
        return {
            ready: this._ready,
            authenticated: coreAuthState
        };
    }
}.init();

// =============================================
// SECURE API WRAPPER - USES authorizedRequest
// =============================================
async function secureApiCall(endpoint, options = {}) {
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
        const response = await authorizedRequest(endpoint, options);
        return { success: true, data: response };
    } catch (error) {
        return {
            success: false,
            status: 'error',
            message: 'Request failed',
            data: null
        };
    }
}
