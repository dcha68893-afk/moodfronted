// =============================================
// SETTINGS MODULE - REAL BACKEND-DRIVEN CONTROL SYSTEM
// VERSION: 9.2.2 - FIXED EXPORTS & AUTH GUARDS
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
let isAuthenticated = false;
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
        if (!isAuthenticated) {
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
                
                // FIX (live-testing audit): this used to resolve() unconditionally for
                // every response type other than a 401 — including a 400 "Current
                // password is incorrect", a 500, or any other backend error. chat.html's
                // directApiRequest() already correctly sets payload.success = false and
                // payload.statusCode to the real HTTP status for those cases (see
                // `if (!response.ok) return { success: false, ... }` there), but nothing
                // here ever looked at it. The result: password changes, settings restores,
                // and any other write action that failed on the backend still showed
                // "success" in the UI because the promise resolved instead of rejecting.
                const isFailure = response.success === false ||
                    (typeof response.statusCode === 'number' && response.statusCode >= 400) ||
                    response.status === 'error';
                if (isFailure) {
                    console.error(`[${MODULE_NAME}] ❌ Request failed: ${method} ${endpoint}`, response);
                    reject(new Error(response.message || response.error || `Request failed (${response.statusCode || 'unknown'})`));
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
    if (!isAuthenticated) return;
    
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
                        background: var(--warning-color, #ff9800);
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
            // Mark as user-triggered so propagation layer logs and broadcasts to iframes
            window.AppSettings.set(section + '.' + key, value, { source: 'user-action', userTriggered: true });
        }

        // STEP 2: Update local state for backwards compatibility
        if (!this.data[section]) this.data[section] = {};
        this.data[section][key] = value;
        this._saveToCache();

        // FIX: this is the actual function that runs on every single settings
        // change (every toggle, dropdown, theme pick, etc.) — but until now it
        // never notified the parent window (chat.html) directly. The only
        // function that did (saveSettings(), below) is wired only to Ctrl+S
        // and an internal command-palette action, not the normal UI flow, so
        // chat.html's dispatchEventToModules relay — the only mechanism that
        // reaches EVERY module iframe, including group.html and status.html,
        // which don't even load AppSettings.js and so can never receive its
        // BroadcastChannel-only updates — was essentially never triggered by
        // ordinary use. This is why changing a setting only ever visibly
        // applied inside the Settings page itself.
        //
        // IMPORTANT: send the FULL current settings snapshot (this.data), not
        // just {[section]:{[key]:value}} — chat.html's SETTINGS_UPDATED
        // handler calls persistCachedSettings(), which REPLACES its entire
        // settings cache with whatever object arrives here rather than
        // merging it. A partial payload would silently wipe every other
        // cached section (privacy, notifications, chat, etc.) on every
        // single settings change.
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'SETTINGS_UPDATED',
                    module: MODULE_NAME,
                    section, key, value,
                    settings: this.data,
                    timestamp: Date.now()
                }, '*');
            }
        } catch (e) { /* no parent — that's fine */ }

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
        if (!isAuthenticated || currentState !== LifecycleState.ACTIVE) {
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
            window.AppSettings.set(section + '.' + key, value, { source: 'user-action', userTriggered: true });
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
            const root = document.documentElement;
            if (theme === 'auto') {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                root.setAttribute('data-theme', isDark ? 'dark' : 'light');
            } else {
                root.setAttribute('data-theme', theme);
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
            if (!isAuthenticated) {
                return this.data;
            }
        }
        
        // Only try backend fetch if authenticated
        if (!isAuthenticated) {
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
            // FIX-009 (corrected): was referencing an undefined `data` variable
            // (should be `this.data`), so this write ReferenceError'd on every
            // single save and was silently swallowed by the inner try/catch —
            // 'kyn_app_settings' was never actually kept in sync from here.
            // (AppSettings.js's own .set()/.merge() already keeps this key
            // correct as the primary path, so this was a harmless-but-dead
            // redundant write — fixed anyway since it's still read by
            // chat.html, AppSettings.js, and settings-broadcast-listener.js.)
            try { localStorage.setItem('kyn_app_settings', JSON.stringify(this.data)); } catch(_) {}
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
        if (!isAuthenticated) {
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
        waitingForAuth: !isAuthenticated
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
                isAuthenticated = true;
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
    isAuthenticated = true;
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
    if (!isAuthenticated) {
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
            if (!isAuthenticated) {
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
    if (isAuthenticated) {
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
            isAuthenticated = true;
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
            isAuthenticated = false;
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
            if (_lastSessionId === sessionId && _currentValidSession && isAuthenticated) {
                if (DEBUG) console.log(`[${MODULE_NAME}] 📥 Duplicate SESSION_DATA ignored`);
                return;
            }
            _lastSessionId = sessionId;
            _currentValidSession = sessionData;
            
            applySession(sessionData);
            
            // Mark authenticated so API calls can proceed
            if (!isAuthenticated) {
                isAuthenticated = true;
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
    
    if (!isAuthenticated) {
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
// PLACEHOLDER HANDLERS TO PREVENT UNDEFINED ERRORS
// =============================================
function handleSessionData(message) {}
function handleModuleRegisteredMessage(message) {}
function handleSessionSyncMessage(message) {}
function handleSessionUpdateMessage(message) {}
function handleSessionInvalidatedMessage(message) {}
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
let currentUser = null;
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
        
        this.addTrustedOrigin('https://moodchat-fy56.onrender.com');
        this.addTrustedOrigin('https://moodfronted.onrender.com');
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
                isAuthenticated = true;
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
                isAuthenticated = false;
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
        return this._ready && currentState === LifecycleState.ACTIVE && isAuthenticated;
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
        
        if (!isAuthenticated) {
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
            authenticated: isAuthenticated
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
    
    if (!isAuthenticated) {
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

// =============================================
// AUTHORIZED FETCH - NO LONGER USED DIRECTLY
// =============================================
function authorizedFetch(url, options = {}) {
    if (!isAuthenticated) {
        throw new Error("Authentication not ready");
    }
    
    // This should not be called directly - use authorizedRequest instead
    if (DEBUG) console.warn(`[${MODULE_NAME}] ⚠️ authorizedFetch called - this should be replaced with authorizedRequest`);
    return authorizedRequest(url, options);
}

// =============================================
// SAFE DATA ACCESS UTILITIES
// =============================================
function safeGet(data, path, defaultValue = null) {
    if (!data || typeof data !== 'object') return defaultValue;
    
    const parts = path.split('.');
    let current = data;
    
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return defaultValue;
        }
        current = current[part];
    }
    
    return current !== undefined ? current : defaultValue;
}

function safeArray(array, defaultValue = []) {
    return Array.isArray(array) ? array : defaultValue;
}

function safeObject(obj, defaultValue = {}) {
    return obj && typeof obj === 'object' ? obj : defaultValue;
}

// =============================================
// IFRAME ENVIRONMENT DETECTOR
// =============================================
const ENV_TYPES = {
    LOCAL_DEV: 'local_dev',
    RENDER_HOSTED: 'render_hosted',
    VPN_NETWORK: 'vpn_network',
    PRODUCTION: 'production',
    UNKNOWN: 'unknown'
};

const IframeEnvironment = {
    _environment: ENV_TYPES.UNKNOWN,
    _features: {
        hasSecureContext: false,
        hasCrypto: false,
        hasLocalStorage: false,
        hasServiceWorker: false,
        connectionType: 'unknown',
        effectiveBandwidth: 0,
        rtt: 0,
        isSandboxed: false,
        isIframe: false,
        parentOrigin: null,
        backendReachable: true
    },
    _detected: false,
    _backendUrl: 'https://moodchat-fy56.onrender.com',
    _frontendUrl: 'https://moodfronted.onrender.com',
    _detectionComplete: false,
    
    detect() {
        if (this._detected) return this.getInfo();
        
        try {
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;
            const isSecure = protocol === 'https:';
            
            this._features.isIframe = window.self !== window.top;
            
            try {
                localStorage.setItem('_test', 'test');
                localStorage.removeItem('_test');
                this._features.hasLocalStorage = true;
            } catch (e) {
                this._features.hasLocalStorage = false;
                this._features.isSandboxed = true;
            }
            
            this._features.hasCrypto = !!(window.crypto && window.crypto.subtle);
            this._features.hasSecureContext = window.isSecureContext || false;
            
            if (navigator.connection) {
                this._features.connectionType = navigator.connection.effectiveType || 'unknown';
                this._features.effectiveBandwidth = navigator.connection.downlink || 0;
                this._features.rtt = navigator.connection.rtt || 0;
            }
            
            if (hostname === 'localhost' || hostname === '127.0.0.1' || 
                hostname.startsWith('192.168.') || protocol === 'file:') {
                this._environment = ENV_TYPES.LOCAL_DEV;
            } else if (hostname.includes('onrender.com')) {
                this._environment = ENV_TYPES.RENDER_HOSTED;
            } else if (this._features.rtt > 300 || 
                      (this._features.connectionType === '4g' && this._features.rtt > 200) ||
                      navigator.connection?.saveData) {
                this._environment = ENV_TYPES.VPN_NETWORK;
            } else if (isSecure && hostname.includes('.')) {
                this._environment = ENV_TYPES.PRODUCTION;
            } else {
                this._environment = ENV_TYPES.UNKNOWN;
            }
            
            this._features.backendReachable = true;
            this._detected = true;
            this._detectionComplete = true;
            
        } catch (error) {
            this._environment = ENV_TYPES.UNKNOWN;
            this._detectionComplete = true;
            errorLog('Environment detection failed:', error);
        }
        
        return this.getInfo();
    },
    
    getInfo() {
        return {
            environment: this._environment,
            features: { ...this._features }
        };
    },
    
    getEnvironment() {
        return this._environment;
    },
    
    getBackendUrl() {
        return this._backendUrl;
    },
    
    getFrontendUrl() {
        return this._frontendUrl;
    },
    
    isVPN() {
        return this._environment === ENV_TYPES.VPN_NETWORK;
    },
    
    isLocal() {
        return this._environment === ENV_TYPES.LOCAL_DEV;
    },
    
    isProduction() {
        return this._environment === ENV_TYPES.PRODUCTION;
    },
    
    isRender() {
        return this._environment === ENV_TYPES.RENDER_HOSTED;
    },
    
    getAdjustedTimeout(baseTimeout) {
        if (this.isVPN()) return baseTimeout * 2;
        if (this.isLocal()) return baseTimeout * 1.5;
        return baseTimeout;
    },
    
    getAdjustedRetries(baseRetries) {
        return baseRetries;
    },
    
    isDetectionComplete() {
        return this._detectionComplete;
    }
};

IframeEnvironment.detect();
window.__iframeEnvironment = IframeEnvironment.getEnvironment();

// =============================================
// SAFE STORAGE LAYER
// =============================================
const SafeStorage = {
    _memoryCache: new Map(),
    _storageAvailable: null,
    _encryptionKey: null,
    _prefix: 'knecta_',
    _quotaExceeded: false,
    _quotaWarningIssued: false,
    _fallbackMode: false,
    _initialized: false,
    _initPromise: null,
    
    init() {
        if (this._initialized) return this;
        if (this._initPromise) return this._initPromise;
        
        this._initPromise = new Promise((resolve) => {
            initLog('SafeStorage initializing');
            this._checkAvailability();
            this._generateKey();
            
            try {
                const cached = sessionStorage.getItem(`${this._prefix}memory_fallback`);
                if (cached) {
                    const data = JSON.parse(cached);
                    Object.entries(data).forEach(([key, value]) => {
                        this._memoryCache.set(key, value);
                    });
                }
            } catch (e) {}
            
            this._initialized = true;
            successLog('SafeStorage initialized - Type:', this.getStorageType());
            resolve(this);
        });
        
        return this._initPromise;
    },
    
    _checkAvailability() {
        if (this._storageAvailable !== null) return this._storageAvailable;
        
        try {
            const testKey = `${this._prefix}_test`;
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            this._storageAvailable = true;
            this._fallbackMode = false;
        } catch (e) {
            this._storageAvailable = false;
            this._fallbackMode = true;
            
            try {
                const testKey = `${this._prefix}_test`;
                sessionStorage.setItem(testKey, 'test');
                sessionStorage.removeItem(testKey);
                this._storageAvailable = 'session';
            } catch (e2) {
                this._storageAvailable = false;
            }
            
            if (!this._quotaWarningIssued) {
                this._quotaWarningIssued = true;
            }
        }
        
        return this._storageAvailable;
    },
    
    _generateKey() {
        this._encryptionKey = `key_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    },
    
    get(key, fallback = null, useEncryption = false) {
        const prefixedKey = `${this._prefix}${key}`;
        
        if (this._memoryCache.has(prefixedKey)) {
            return this._memoryCache.get(prefixedKey);
        }
        
        if (this._storageAvailable) {
            try {
                let value = null;
                
                if (this._storageAvailable === true) {
                    value = localStorage.getItem(prefixedKey);
                } else if (this._storageAvailable === 'session') {
                    value = sessionStorage.getItem(prefixedKey);
                }
                
                if (value) {
                    if (useEncryption) {
                        try {
                            value = this._decrypt(value);
                        } catch (e) {}
                    }
                    
                    this._memoryCache.set(prefixedKey, value);
                    return value;
                }
            } catch (e) {}
        }
        
        return fallback;
    },
    
    _decrypt(value) {
        return value;
    },
    
    set(key, value, useEncryption = false) {
        const prefixedKey = `${this._prefix}${key}`;
        
        this._memoryCache.set(prefixedKey, value);
        
        if (this._storageAvailable) {
            try {
                let storageValue = value;
                if (useEncryption) {
                    storageValue = this._encrypt(String(value));
                }
                
                if (this._storageAvailable === true) {
                    localStorage.setItem(prefixedKey, String(storageValue));
                } else if (this._storageAvailable === 'session') {
                    sessionStorage.setItem(prefixedKey, String(storageValue));
                }
                
                this._quotaExceeded = false;
                return true;
                
            } catch (e) {
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    this._quotaExceeded = true;
                    if (!this._quotaWarningIssued) {
                        this._quotaWarningIssued = true;
                    }
                }
                return false;
            }
        }
        
        try {
            const cacheObj = {};
            this._memoryCache.forEach((val, k) => {
                cacheObj[k] = val;
            });
            sessionStorage.setItem(`${this._prefix}memory_fallback`, JSON.stringify(cacheObj));
        } catch (e) {}
        
        return true;
    },
    
    _encrypt(value) {
        return value;
    },
    
    remove(key) {
        const prefixedKey = `${this._prefix}${key}`;
        this._memoryCache.delete(prefixedKey);
        
        if (this._storageAvailable) {
            try {
                if (this._storageAvailable === true) {
                    localStorage.removeItem(prefixedKey);
                } else if (this._storageAvailable === 'session') {
                    sessionStorage.removeItem(prefixedKey);
                }
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
                const storage = this._storageAvailable === true ? localStorage : sessionStorage;
                for (let i = storage.length - 1; i >= 0; i--) {
                    const key = storage.key(i);
                    if (key && key.startsWith(actualPrefix)) {
                        storage.removeItem(key);
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
                const storage = this._storageAvailable === true ? localStorage : sessionStorage;
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    if (key && key.startsWith(this._prefix)) {
                        keys.add(key.substring(this._prefix.length));
                    }
                }
            } catch (e) {}
        }
        
        return Array.from(keys);
    },
    
    isQuotaExceeded() {
        return this._quotaExceeded;
    },
    
    isFallbackMode() {
        return this._fallbackMode;
    },
    
    getStorageType() {
        if (this._storageAvailable === true) return 'localStorage';
        if (this._storageAvailable === 'session') return 'sessionStorage';
        return 'memory';
    }
};

SafeStorage.init();

// =============================================
// COMPATIBILITY BRIDGE
// =============================================
const CompatibilityBridge = {
    _enabled: false,
    _reason: null,
    _legacyAPIs: new Map(),
    _messageTranslator: null,
    _parentProtocolVersion: null,
    _detected: false,
    
    detect() {
        if (this._detected) return this._enabled;
        
        if (IframeEnvironment._features.isSandboxed) {
            this.enable('sandboxed');
            return true;
        }
        
        if (!SafeStorage.getStorageType().includes('local')) {
            this.enable('storage_restricted');
            return true;
        }
        
        if (!window.crypto || !window.crypto.subtle) {
            this.enable('crypto_restricted');
            return true;
        }
        
        const isOldBrowser = !window.Promise || !window.fetch || !window.postMessage;
        if (isOldBrowser) {
            this.enable('old_browser');
            return true;
        }
        
        this._detected = true;
        return this._enabled;
    },
    
    enable(reason) {
        if (this._enabled) return;
        
        this._enabled = true;
        this._reason = reason;
    },
    
    isEnabled() {
        return this._enabled;
    },
    
    getReason() {
        return this._reason;
    },
    
    translateOutgoing(message) {
        if (!this._enabled) return message;
        return this._messageTranslator?.toLegacy(message) || message;
    },
    
    translateIncoming(message) {
        if (!this._enabled) return message;
        if (message && message._legacy) {
            return this._messageTranslator?.toCanonical(message) || message;
        }
        return message;
    },
    
    getLegacyAPI(name) {
        return this._legacyAPIs.get(name);
    }
};

// =============================================
// ORIGIN ADAPTER
// =============================================
const OriginAdapter = {
    _trustedOrigins: new Set(),
    _originPatterns: [],
    _dynamicTrust: new Map(),
    _lastValidation: 0,
    _validationCache: new Map(),
    _parentOrigin: null,
    _parentVerified: false,
    _backendOrigin: 'https://moodchat-fy56.onrender.com',
    _frontendOrigin: 'https://moodfronted.onrender.com',
    
    init() {
        initLog('OriginAdapter initializing');
        
        TrustedOrigins._trusted.forEach(origin => {
            this._trustedOrigins.add(origin);
        });
        
        this.addTrustedOrigin(window.location.origin);
        this.addTrustedOrigin(this._backendOrigin);
        this.addTrustedOrigin(this._frontendOrigin);
        
        ['localhost', '127.0.0.1', '::1'].forEach(host => {
            [5500, 3000, 8080, 5000, 5173].forEach(port => {
                this.addTrustedOrigin(`http://${host}:${port}`);
                this.addTrustedOrigin(`https://${host}:${port}`);
            });
            this.addTrustedOrigin(`http://${host}`);
            this.addTrustedOrigin(`https://${host}`);
        });
        
        this.addOriginPattern(/^https?:\/\/.*\.onrender\.com$/);
        this.addOriginPattern(/^https?:\/\/.*\.render\.com$/);
        this.addOriginPattern(/^https?:\/\/(192\.168\..*|10\..*|172\.(1[6-9]|2[0-9]|3[0-1])\..*)$/);
        this.addOriginPattern(/^https?:\/\/.*\.knecta\.(app|chat)$/);
        this.addOriginPattern(/^https?:\/\/knecta\..*$/);
        
        successLog('OriginAdapter initialized');
    },
    
    addTrustedOrigin(origin) {
        if (origin && !this._trustedOrigins.has(origin)) {
            this._trustedOrigins.add(origin);
        }
    },
    
    addOriginPattern(pattern) {
        if (pattern && !this._originPatterns.includes(pattern)) {
            this._originPatterns.push(pattern);
        }
    },
    
    isTrusted(origin, options = {}) {
        if (currentState === LifecycleState.WAIT_PARENT) {
            return true;
        }
        return TrustedOrigins.isValid(origin);
    },
    
    setParentOrigin(origin) {
        this._parentOrigin = origin;
        this._parentVerified = true;
        this.addTrustedOrigin(origin);
        TrustedOrigins.setParentOrigin(origin);
    },
    
    getParentOrigin() {
        return this._parentOrigin;
    },
    
    isParentVerified() {
        return this._parentVerified;
    },
    
    reset() {
        this._parentOrigin = null;
        this._parentVerified = false;
        this._validationCache.clear();
    },
    
    getBackendOrigin() {
        return this._backendOrigin;
    },
    
    getFrontendOrigin() {
        return this._frontendOrigin;
    },
    
    getDiagnostics() {
        return {
            trustedOriginsCount: this._trustedOrigins.size,
            patternsCount: this._originPatterns.length,
            parentVerified: this._parentVerified,
            parentOrigin: this._parentOrigin,
            cacheSize: this._validationCache.size
        };
    }
};

OriginAdapter.init();

// =============================================
// STARTUP GOVERNOR
// =============================================
const StartupGovernor = {
    _state: 'INIT',
    _lock: false,
    _attempts: 0,
    _maxAttempts: 1,
    _backoffMs: 1000,
    _initialized: false,
    _startTime: Date.now(),
    _stateHistory: [],
    _transitionListeners: new Set(),
    _silent: true,
    
    states: {
        INIT: 'INIT',
        WAIT_PARENT: 'WAIT_PARENT',
        ACTIVE: 'ACTIVE',
        READY: 'READY'
    },
    
    getState() { 
        return this._state; 
    },
    
    transition(newState, reason = '') {
        if (this._lock && newState !== this._state && newState !== 'FAILED') {
            return false;
        }
        
        const oldState = this._state;
        this._state = newState;
        
        if (!this._silent) {
            debugLog(`Governor: ${oldState} → ${newState} (${reason})`);
        }
        
        this._stateHistory.push({
            from: oldState,
            to: newState,
            reason,
            timestamp: Date.now()
        });
        
        if (this._stateHistory.length > 20) {
            this._stateHistory.shift();
        }
        
        this._transitionListeners.forEach(listener => {
            try {
                listener(oldState, newState, reason);
            } catch (e) {}
        });
        
        return true;
    },
    
    onTransition(listener) {
        this._transitionListeners.add(listener);
        return () => this._transitionListeners.delete(listener);
    },
    
    canProceed() {
        return this._state !== 'FAILED';
    },
    
    isStable() {
        return this._state === 'ACTIVE' || this._state === 'READY';
    },
    
    getDiagnostics() {
        return {
            state: this._state,
            attempts: this._attempts,
            uptime: Date.now() - this._startTime,
            history: this._stateHistory.slice(-5),
            locked: this._lock
        };
    },
    
    reset() {
        this._state = 'INIT';
        this._lock = false;
        this._attempts = 0;
        this._stateHistory = [];
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

// =============================================
// IFRAME TRANSPORT
// =============================================
const IframeTransport = {
    _messageHandlers: new Map(),
    _frameId: FRAME_ID,
    _enabled: true,
    _parentWindow: null,
    _parentOrigin: '*',
    
    init() {
        initLog('IframeTransport initializing');
        this._detectParent();
        successLog('IframeTransport initialized');
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
                
                OriginAdapter.setParentOrigin(this._parentOrigin);
                parentOrigin = this._parentOrigin;
            }
        } catch (error) {}
    },
    
    send(type, payload = {}) {
        return MessageTransport.send(type, payload);
    },
    
    on(type, handler) {
        return MessageTransport.on(type, handler);
    },
    
    off(type, handler) {
        MessageTransport.off(type, handler);
    },
    
    enable() {
        MessageTransport.enable();
        this._enabled = true;
    },
    
    disable() {
        MessageTransport.disable();
        this._enabled = false;
    },
    
    getDiagnostics() {
        return {
            ...MessageTransport.getDiagnostics()
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
        MessageTransport.setSilent(silent);
    }
};

IframeTransport.init();

// =============================================
// SESSION STORAGE - MEMORY ONLY WITH VALIDATION
// =============================================
function updateSession(user, token, expiry, version) {
    // Validate incoming session data
    const sessionData = {
        userId: user?.id || user?.userId,
        token: token,
        user: user
    };
    
    if (!__isValidSession(sessionData)) {
        console.warn(`[${MODULE_NAME}] ⚠️ updateSession called with invalid data - rejected`);
        return false;
    }
    
    // Prevent session downgrade
    if (window.session.user && __isValidSession({ userId: window.session.user.id, token: window.session.token })) {
        const newUserId = user?.id || user?.userId;
        if (newUserId === 'user' || newUserId === 'default') {
            console.warn(`[${MODULE_NAME}] ⚠️ Prevented session downgrade in updateSession`);
            return false;
        }
    }
    
    if (token) {
        window.session.token = token;
    }
    
    if (user) {
        window.session.user = typeof user === 'object' ? { ...user } : user;
        currentUser = window.session.user;
        coreData.user = window.session.user;
    }
    
    if (expiry) {
        window.session.expiresAt = expiry;
    }
    
    if (version !== undefined) {
        window.session.version = version;
    }
    
    window.__SETTINGS_SESSION_ACTIVE__ = !!window.session.user && isAuthenticated;
    return true;
}

function clearSession() {
    window.session = {
        token: null,
        user: null,
        expiresAt: 0,
        version: 0
    };
    currentUser = null;
    coreData.user = null;
    window.__SETTINGS_SESSION_ACTIVE__ = false;
}

function isSessionValid() {
    const sessionData = {
        userId: window.session.user?.id || window.session.user?.userId,
        token: window.session.token
    };
    return isAuthenticated && __isValidSession(sessionData) && window.session.expiresAt > Date.now();
}

// =============================================
// SETTINGS STORE
// =============================================
const SettingsStore = {
    account: {},
    privacy: {},
    notifications: {},
    appearance: {},
    _listeners: new Set(),
    
    load(settingsData) {
        if (settingsData.account) this.account = { ...settingsData.account };
        if (settingsData.privacy) this.privacy = { ...settingsData.privacy };
        if (settingsData.notifications) this.notifications = { ...settingsData.notifications };
        if (settingsData.appearance) this.appearance = { ...settingsData.appearance };
        
        this._notify('loaded', this.getAll());
        return true;
    },
    
    update(section, key, value) {
        if (!this[section]) return false;
        
        const oldValue = this[section][key];
        this[section][key] = value;
        
        this._notify('updated', {
            section,
            key,
            value,
            oldValue,
            all: this.getAll()
        });
        
        return true;
    },
    
    getAll() {
        return {
            account: { ...this.account },
            privacy: { ...this.privacy },
            notifications: { ...this.notifications },
            appearance: { ...this.appearance }
        };
    },
    
    getSection(section) {
        return this[section] ? { ...this[section] } : null;
    },
    
    subscribe(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    },
    
    _notify(event, data) {
        this._listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (e) {}
        });
    }
};

// =============================================
// HEARTBEAT CLIENT
// =============================================
const HeartbeatClient = {
    _interval: null,
    _missedCount: 0,
    _maxMissed: 3,
    _running: false,
    _lastAck: 0,
    _listeners: new Set(),
    
    start() {
        this._running = true;
    },
    
    stop() {
        this._running = false;
        this._missedCount = 0;
        this.emit('stopped', {});
    },
    
    handleAck() {
        this._missedCount = 0;
        this._lastAck = Date.now();
    },
    
    isHealthy() {
        return this._missedCount < this._maxMissed;
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
        return {
            running: this._running,
            missedCount: this._missedCount,
            maxMissed: this._maxMissed,
            lastAck: this._lastAck,
            healthy: this.isHealthy()
        };
    },
    
    setSilent(silent) {
    }
};

const HeartbeatManager = HeartbeatClient;

// =============================================
// SESSION CLIENT WITH VALIDATION
// =============================================
const SessionClient = {
    _session: null,
    _sessionToken: null,
    _sessionExpiry: null,
    _sessionVersion: 0,
    _lastSync: 0,
    _syncInterval: null,
    _refreshTimer: null,
    _listeners: new Set(),
    _pendingAck: false,
    _sessionLock: false,
    _refreshAttempts: 0,
    _maxRefreshAttempts: 0,
    _offlineMode: false,
    _syncInProgress: false,
    _silent: true,
    
    init() {
        initLog('SessionClient initializing');
        successLog('SessionClient initialized');
        return this;
    },
    
    async sync() {
        if (currentState !== LifecycleState.ACTIVE) {
            return false;
        }
        
        if (!isAuthenticated) {
            return false;
        }
        
        if (this._syncInProgress) return false;
        
        this._syncInProgress = true;
        
        try {
            const response = await MessageTransport.send('SESSION_SYNC', {});
            
            if (response && response.payload && response.payload.session) {
                const sessionData = response.payload.session;
                if (!__isValidSession(sessionData)) {
                    console.warn(`[${MODULE_NAME}] ⚠️ SessionClient.sync received invalid session`);
                    this._syncInProgress = false;
                    return false;
                }
                this.updateSession(
                    sessionData.user,
                    sessionData.token,
                    sessionData.expiry
                );
                this._syncInProgress = false;
                return true;
            }
            
            this._syncInProgress = false;
            return false;
        } catch (error) {
            this._syncInProgress = false;
            return false;
        }
    },
    
    updateSession(user, token, expiry) {
        const sessionData = {
            userId: user?.id || user?.userId,
            token: token,
            user: user
        };
        
        if (!__isValidSession(sessionData)) {
            console.warn(`[${MODULE_NAME}] ⚠️ SessionClient.updateSession received invalid session`);
            return false;
        }
        
        // Prevent session downgrade
        if (this._session && __isValidSession({ userId: this._session?.id, token: this._sessionToken })) {
            const newUserId = user?.id || user?.userId;
            if (newUserId === 'user' || newUserId === 'default') {
                console.warn(`[${MODULE_NAME}] ⚠️ SessionClient prevented session downgrade`);
                return false;
            }
        }
        
        if (user) {
            window.session.user = typeof user === 'object' ? { ...user } : user;
            currentUser = window.session.user;
            coreData.user = window.session.user;
            this._session = window.session.user;
        }
        
        if (token) {
            window.session.token = token;
            this._sessionToken = token;
        }
        
        if (expiry) {
            window.session.expiresAt = expiry;
            this._sessionExpiry = expiry;
        }
        
        window.session.version++;
        this._sessionVersion = window.session.version;
        this._lastSync = Date.now();
        
        this.emit('updated', {
            user: window.session.user,
            token: !!window.session.token,
            expiry: window.session.expiresAt,
            version: window.session.version
        });
        
        return true;
    },
    
    async refresh() {
        if (!this.isValid()) return false;
        
        try {
            const response = await MessageTransport.send('SESSION_REFRESH', {});
            
            if (response && response.payload && response.payload.session) {
                const sessionData = response.payload.session;
                if (!__isValidSession(sessionData)) {
                    console.warn(`[${MODULE_NAME}] ⚠️ SessionClient.refresh received invalid session`);
                    return false;
                }
                this.updateSession(
                    sessionData.user,
                    sessionData.token,
                    sessionData.expiry
                );
                return true;
            }
            
            return false;
        } catch (error) {
            return false;
        }
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
    
    getSession() {
        return window.session.user ? { ...window.session.user } : null;
    },
    
    getToken() {
        return window.session.token;
    },
    
    isValid() {
        return isSessionValid();
    },
    
    isExpired() {
        return !isSessionValid();
    },
    
    isOffline() {
        return false;
    },
    
    clear() {
        window.session = {
            token: null,
            user: null,
            expiresAt: 0,
            version: 0
        };
        currentUser = null;
        coreData.user = null;
        this._session = null;
        this._sessionToken = null;
        this._sessionExpiry = null;
        this._sessionVersion = 0;
        this.emit('cleared', {});
    },
    
    getDiagnostics() {
        return {
            hasSession: !!window.session.user,
            hasToken: !!window.session.token,
            expiry: window.session.expiresAt,
            version: window.session.version,
            lastSync: this._lastSync,
            refreshAttempts: this._refreshAttempts,
            isValid: isSessionValid(),
            isExpired: !isSessionValid(),
            offlineMode: false
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

SessionClient.init();

// =============================================
// RELIABILITY ENGINE
// =============================================
const ReliabilityEngine = {
    _quality: 'unknown',
    _enabled: true,
    _silent: true,
    _listeners: new Set(),
    
    init() {
        initLog('ReliabilityEngine initializing');
        successLog('ReliabilityEngine initialized');
    },
    
    getQuality() {
        return this._quality;
    },
    
    enable() {
        this._enabled = true;
    },
    
    disable() {
        this._enabled = false;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
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
        return {
            quality: this._quality,
            enabled: this._enabled
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ReliabilityEngine.init();

// =============================================
// RELIABILITY LAYER
// =============================================
const ReliabilityLayer = {
    _pendingMessages: new Map(),
    _maxRetries: 3,
    _baseTimeout: 5000,
    _backoffFactor: 1.5,
    _enabled: true,
    _silent: true,
    _listeners: new Set(),
    _messageCounter: 0,
    
    init() {
        initLog('ReliabilityLayer initializing');
        successLog('ReliabilityLayer initialized');
        return this;
    },
    
    send(message, options = {}) {
        return MessageTransport.send(
            message.action || message.type,
            message.data || message.payload || {},
            options
        );
    },
    
    acknowledge(id) {
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
    
    getPendingCount() {
        return this._pendingMessages.size;
    },
    
    clearPending() {
        this._pendingMessages.forEach(entry => {
            clearTimeout(entry.timer);
            activeTimers.delete(entry.timer);
        });
        this._pendingMessages.clear();
    },
    
    getDiagnostics() {
        return {
            pendingCount: this._pendingMessages.size,
            maxRetries: this._maxRetries,
            baseTimeout: this._baseTimeout,
            enabled: this._enabled
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ReliabilityLayer.init();

// =============================================
// MESSAGE DISPATCHER
// =============================================
const MessageDispatcher = {
    _handlers: new Map(),
    _systemActions: new Set([
        'PARENT_READY',
        'SESSION_DATA',
        'MODULE_REGISTERED',
        'ACK',
        'HEARTBEAT_ACK',
        'SETTINGS_DATA',
        'SETTINGS_UPDATE_CONFIRMED',
        'SETTINGS_GLOBAL_UPDATE',
        'AUTH_READY',
        'AUTH_ERROR'
    ]),
    _silent: true,
    
    init() {
        initLog('MessageDispatcher initializing');
        this._setupSystemHandlers();
        successLog('MessageDispatcher initialized');
        return this;
    },
    
    _setupSystemHandlers() {
        this.register('PARENT_READY', (message) => {
            window.parentReady = true;
            parentReadyReceived = true;
            parentCommunicationReady = true;
            console.log('[settings-core] 📥 PARENT_READY received');
        });
        
        this.register('SESSION_DATA', (message) => {
            const sessionData = message.session || message.payload?.session || message;
            if (!__isValidSession(sessionData)) {
                console.warn(`[${MODULE_NAME}] ⚠️ MessageDispatcher ignored invalid SESSION_DATA`);
                return;
            }
            handleSessionData(message);
        });
        
        this.register('MODULE_REGISTERED', (message) => {
            moduleRegistered = true;
        });
        
        this.register('ACK', (message) => {
            if (message.payload && message.payload.inResponseTo) {
                ReliabilityLayer.acknowledge(message.payload.inResponseTo);
            }
        });
        
        this.register('HEARTBEAT_ACK', (message) => {
            HeartbeatClient.handleAck();
        });
        
        this.register('SETTINGS_DATA', (message) => {
            handleSettingsDataResponse(message);
        });
        
        this.register('SETTINGS_UPDATE_CONFIRMED', (message) => {
            handleSettingsUpdateConfirmedMessage(message);
        });
        
        this.register('SETTINGS_GLOBAL_UPDATE', (message) => {
            handleSettingsGlobalUpdateMessage(message);
        });
        
        this.register('AUTH_READY', (message) => {
            isAuthenticated = true;
            authCheckComplete = true;
            processRequestQueue();
            console.log('[settings-core] ✅ AUTH_READY received');
        });
        
        this.register('AUTH_ERROR', (message) => {
            isAuthenticated = false;
            console.error('[settings-core] ❌ AUTH_ERROR received');
        });
    },
    
    register(action, handler) {
        if (!this._handlers.has(action)) {
            this._handlers.set(action, []);
        }
        this._handlers.get(action).push(handler);
        return this;
    },
    
    unregister(action, handler) {
        const handlers = this._handlers.get(action);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        }
        return this;
    },
    
    dispatch(message) {
        if (!message || !message.action) return false;
        
        const handlers = this._handlers.get(message.action) || [];
        handlers.forEach(handler => {
            try {
                handler(message);
            } catch (e) {
                errorLog(`Error in handler for ${message.action}:`, e);
            }
        });
        
        return handlers.length > 0;
    },
    
    getDiagnostics() {
        return {
            systemActions: Array.from(this._systemActions),
            registeredActions: Array.from(this._handlers.keys())
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

MessageDispatcher.init();

// =============================================
// SECURITY VALIDATOR
// =============================================
const SecurityValidator = {
    _trustedOrigins: new Set(),
    _strictMode: true,
    _validationRules: new Map(),
    _silent: true,
    
    init() {
        initLog('SecurityValidator initializing');
        this._setupDefaultRules();
        successLog('SecurityValidator initialized');
        return this;
    },
    
    _setupDefaultRules() {
        this.addTrustedOrigin(window.location.origin);
        
        this.addRule('message_structure', (message) => {
            if (!message || typeof message !== 'object') return false;
            if (!message.id && !message.action && !message.type) return false;
            if (!message.source) return false;
            if (!message.timestamp) return false;
            return true;
        });
        
        this.addRule('action_valid', (message) => {
            if (!message.type && !message.action) return false;
            const action = message.type || message.action;
            if (typeof action !== 'string') return false;
            if (action.length > 50) return false;
            return true;
        });
        
        this.addRule('source_valid', (message) => {
            if (!message.source) return false;
            if (message.source !== 'parent' && message.source !== MODULE_NAME) return false;
            return true;
        });
        
        this.addRule('target_valid', (message) => {
            if (message.target && message.target !== FRAME_ID && message.target !== 'all' && message.target !== 'parent') return false;
            return true;
        });
    },
    
    addTrustedOrigin(origin) {
        if (origin) {
            this._trustedOrigins.add(origin);
        }
        return this;
    },
    
    addRule(name, validator) {
        this._validationRules.set(name, validator);
        return this;
    },
    
    removeRule(name) {
        this._validationRules.delete(name);
        return this;
    },
    
    validateMessage(message, origin) {
        if (!OriginAdapter.isTrusted(origin)) {
            if (!this._silent) debugLog(`Message rejected: untrusted origin ${origin}`);
            return false;
        }
        
        for (const [name, validator] of this._validationRules) {
            try {
                if (!validator(message)) {
                    if (!this._silent) debugLog(`Message rejected: rule ${name} failed`);
                    return false;
                }
            } catch (e) {
                if (!this._silent) debugLog(`Message validation error in rule ${name}:`, e);
                return false;
            }
        }
        
        return true;
    },
    
    validateAction(action) {
        if (!action || typeof action !== 'string') return false;
        if (action.length > 100) return false;
        
        const dangerousPatterns = ['<', '>', 'script', 'javascript:', 'data:'];
        for (const pattern of dangerousPatterns) {
            if (action.toLowerCase().includes(pattern)) return false;
        }
        
        return true;
    },
    
    sanitizeData(data) {
        if (!data) return data;
        
        if (typeof data === 'string') {
            return data
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
        
        if (Array.isArray(data)) {
            return data.map(item => this.sanitizeData(item));
        }
        
        if (typeof data === 'object' && data !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(data)) {
                sanitized[key] = this.sanitizeData(value);
            }
            return sanitized;
        }
        
        return data;
    },
    
    getDiagnostics() {
        return {
            trustedOriginsCount: this._trustedOrigins.size,
            strictMode: this._strictMode,
            rulesCount: this._validationRules.size
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

SecurityValidator.init();

// =============================================
// PARENT CONNECTION MANAGER
// =============================================
const ParentConnectionManager = {
    _connectionState: 'disconnected',
    _parentWindow: null,
    _parentOrigin: null,
    _reconnectAttempts: 0,
    _maxReconnectAttempts: 3,
    _reconnectDelay: 1000,
    _connectionCheckInterval: null,
    _listeners: new Set(),
    _silent: true,
    
    init() {
        initLog('ParentConnectionManager initializing');
        this._detectParent();
        successLog('ParentConnectionManager initialized');
        return this;
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
                
                OriginAdapter.setParentOrigin(this._parentOrigin);
                parentOrigin = this._parentOrigin;
                this._connectionState = 'connected';
                this.emit('connected', { origin: this._parentOrigin });
            } else {
                this._connectionState = 'no_parent';
                this.emit('no_parent', {});
            }
        } catch (error) {
            this._connectionState = 'error';
            this.emit('error', { error });
        }
    },
    
    isConnected() {
        return this._connectionState === 'connected' && 
               this._parentWindow && 
               this._parentWindow !== window;
    },
    
    getConnectionState() {
        return this._connectionState;
    },
    
    getParentOrigin() {
        return this._parentOrigin;
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
        return {
            connectionState: this._connectionState,
            parentOrigin: this._parentOrigin,
            reconnectAttempts: this._reconnectAttempts,
            maxReconnectAttempts: this._maxReconnectAttempts
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ParentConnectionManager.init();

// =============================================
// HANDSHAKE MANAGER - NO RETRY LOOPS
// =============================================
const HandshakeManager = {
    _handshakeState: 'INITIAL',
    _handshakeId: null,
    _handshakeAttempts: 0,
    _maxAttempts: 1,
    _backoffMs: 1000,
    _parentReady: false,
    _handshakeComplete: false,
    _listeners: new Set(),
    _inProgress: false,
    _silent: true,
    
    states: {
        INITIAL: 'INITIAL',
        WAITING_FOR_PARENT: 'WAITING_FOR_PARENT',
        REGISTERING: 'REGISTERING',
        REGISTERED: 'REGISTERED',
        ACTIVE: 'ACTIVE'
    },
    
    init() {
        initLog('HandshakeManager initializing');
        successLog('HandshakeManager initialized');
        return this;
    },
    
    getState() {
        return this._handshakeState;
    },
    
    transition(newState, reason = '') {
        const oldState = this._handshakeState;
        this._handshakeState = newState;
        
        if (!this._silent) {
            debugLog(`Handshake: ${oldState} → ${newState} (${reason})`);
        }
        
        this.emit('transition', { from: oldState, to: newState, reason });
        
        return true;
    },
    
    async startHandshake(options = {}) {
        if (this._handshakeComplete) {
            return { success: true, cached: true };
        }
        
        if (this._inProgress) {
            return { success: false, inProgress: true };
        }
        
        this._inProgress = true;
        
        try {
            this.transition('WAITING_FOR_PARENT', 'handshake_started');
            
            await this._registerModule();
            
            this._handshakeComplete = true;
            this.transition('ACTIVE', 'handshake_complete');
            this._inProgress = false;
            return { success: true };
        } catch (error) {
            this._inProgress = false;
            return { success: false, error: error.message };
        }
    },
    
    async _registerModule() {
        return { success: true };
    },
    
    reset() {
        this._handshakeState = 'INITIAL';
        this._handshakeComplete = false;
        this._handshakeAttempts = 0;
        this._inProgress = false;
    },
    
    isComplete() {
        return this._handshakeComplete || registrationCompleted;
    },
    
    isInProgress() {
        return this._inProgress;
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
        return {
            state: this._handshakeState,
            attempts: this._handshakeAttempts,
            maxAttempts: this._maxAttempts,
            complete: this.isComplete(),
            inProgress: this._inProgress
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

HandshakeManager.init();

const IframeHandshakeAuthority = HandshakeManager;

// =============================================
// MODULE LIFECYCLE CONTROLLER
// =============================================
const ModuleLifecycleController = {
    _lifecycleState: 'stopped',
    _startTime: null,
    _listeners: new Set(),
    _silent: true,
    
    states: {
        STOPPED: 'stopped',
        STARTING: 'starting',
        RUNNING: 'running',
        STOPPING: 'stopping',
        ERROR: 'error'
    },
    
    init() {
        initLog('ModuleLifecycleController initializing');
        successLog('ModuleLifecycleController initialized');
        return this;
    },
    
    start() {
        if (this._lifecycleState === 'running') return this;
        
        this._lifecycleState = 'starting';
        this._startTime = Date.now();
        this.emit('starting', { timestamp: this._startTime });
        
        this._lifecycleState = 'running';
        this.emit('started', { timestamp: Date.now() });
        
        return this;
    },
    
    stop() {
        if (this._lifecycleState === 'stopped') return this;
        
        this._lifecycleState = 'stopping';
        this.emit('stopping', { timestamp: Date.now() });
        
        HeartbeatClient.stop();
        clearAllTimers();
        
        this._lifecycleState = 'stopped';
        this.emit('stopped', { timestamp: Date.now() });
        
        return this;
    },
    
    error(error) {
        this._lifecycleState = 'error';
        this.emit('error', { error, timestamp: Date.now() });
        return this;
    },
    
    getState() {
        return this._lifecycleState;
    },
    
    getUptime() {
        if (!this._startTime || this._lifecycleState !== 'running') return 0;
        return Date.now() - this._startTime;
    },
    
    isRunning() {
        return this._lifecycleState === 'running';
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
        return {
            state: this._lifecycleState,
            uptime: this.getUptime(),
            startTime: this._startTime
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ModuleLifecycleController.init();

// =============================================
// RECOVERY MANAGER
// =============================================
const RecoveryManager = {
    _attempts: 0,
    _maxAttempts: 3,
    _backoffMs: 1000,
    _recoveryInProgress: false,
    _recoveryTimer: null,
    _listeners: new Set(),
    _recoveryStrategies: new Map(),
    _silent: true,
    
    init() {
        initLog('RecoveryManager initializing');
        this._registerDefaultStrategies();
        successLog('RecoveryManager initialized');
        return this;
    },
    
    _registerDefaultStrategies() {
        this.registerStrategy('connection_lost', async () => {
            ParentConnectionManager._detectParent();
            if (ParentConnectionManager.isConnected()) {
                return true;
            }
            return false;
        });
        
        this.registerStrategy('heartbeat_failure', async () => {
            HeartbeatClient.stop();
            if (currentState === LifecycleState.ACTIVE) {
                HeartbeatClient.start();
                return HeartbeatClient.isHealthy();
            }
            return false;
        });
        
        this.registerStrategy('registration_failed', async () => {
            moduleRegistered = false;
            return moduleRegistered;
        });
        
        this.registerStrategy('session_expired', async () => {
            if (!isAuthenticated) return false;
            if (!window.session.token) return false;
            const response = await MessageTransport.send('SESSION_REFRESH', {});
            if (response && response.payload && response.payload.session) {
                const sessionData = response.payload.session;
                if (!__isValidSession(sessionData)) {
                    console.warn(`[${MODULE_NAME}] ⚠️ RecoveryManager received invalid session`);
                    return false;
                }
                updateSession(
                    sessionData.user,
                    sessionData.token,
                    sessionData.expiry
                );
                return isSessionValid();
            }
            return false;
        });
        
        this.registerStrategy('handshake_timeout', async () => {
            if (parentReadyReceived) return true;
            sendChildReady();
            await new Promise(resolve => setTimeout(resolve, 1000));
            return parentReadyReceived;
        });
        
        this.registerStrategy('settings_load_failed', async () => {
            if (!isAuthenticated) return false;
            try {
                await SettingsState.load();
                return SettingsState.loaded;
            } catch (error) {
                return false;
            }
        });
    },
    
    registerStrategy(name, strategy) {
        this._recoveryStrategies.set(name, strategy);
        return this;
    },
    
    async attemptRecovery(options = {}) {
        const { reason = 'unknown', force = false } = options;
        
        if (this._recoveryInProgress && !force) {
            return { success: false, error: 'recovery_in_progress' };
        }
        
        if (this._attempts >= this._maxAttempts && !force) {
            this.emit('max_attempts_reached', { reason, attempts: this._attempts });
            return { success: false, error: 'max_attempts_reached' };
        }
        
        this._recoveryInProgress = true;
        this._attempts++;
        this.emit('recovery_started', { reason, attempt: this._attempts });
        
        try {
            const strategy = this._recoveryStrategies.get(reason);
            
            if (strategy) {
                const result = await strategy();
                if (result) {
                    this._recoveryInProgress = false;
                    this._attempts = 0;
                    this.emit('recovery_succeeded', { reason });
                    return { success: true };
                }
            } else {
                const results = [];
                for (const [name, strat] of this._recoveryStrategies) {
                    try {
                        const result = await strat();
                        results.push({ strategy: name, success: result });
                        if (result) break;
                    } catch (e) {}
                }
                if (results.some(r => r.success)) {
                    this._recoveryInProgress = false;
                    this._attempts = 0;
                    this.emit('recovery_succeeded', { reason, strategies: results });
                    return { success: true, strategies: results };
                }
            }
            
            if (this._attempts < this._maxAttempts) {
                const backoffDelay = this._backoffMs * Math.pow(1.5, this._attempts - 1);
                this._recoveryTimer = safeSetTimeout(() => {
                    this.attemptRecovery({ reason, force });
                }, backoffDelay);
                activeTimers.add(this._recoveryTimer);
                this.emit('recovery_retry', { reason, attempt: this._attempts, delay: backoffDelay });
                return { success: false, retrying: true, attempt: this._attempts };
            } else {
                this._recoveryInProgress = false;
                this.emit('recovery_failed', { reason, attempts: this._attempts });
                return { success: false, error: 'recovery_failed' };
            }
        } catch (error) {
            this._recoveryInProgress = false;
            this.emit('recovery_error', { reason, error: error.message });
            return { success: false, error: error.message };
        }
    },
    
    reset() {
        this._attempts = 0;
        this._recoveryInProgress = false;
        if (this._recoveryTimer) {
            clearTimeout(this._recoveryTimer);
            activeTimers.delete(this._recoveryTimer);
            this._recoveryTimer = null;
        }
        this.emit('reset', {});
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
        return {
            attempts: this._attempts,
            maxAttempts: this._maxAttempts,
            recoveryInProgress: this._recoveryInProgress,
            strategies: Array.from(this._recoveryStrategies.keys())
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

RecoveryManager.init();

// =============================================
// NAVIGATION GUARD
// =============================================
const NavigationGuard = {
    _enabled: true,
    _pendingNavigation: null,
    _listeners: new Set(),
    _guardedPaths: ['/settings', '/profile', '/account'],
    _silent: true,
    
    init() {
        initLog('NavigationGuard initializing');
        this._setupBeforeUnload();
        this._setupHistoryAPI();
        successLog('NavigationGuard initialized');
    },
    
    _setupBeforeUnload() {
        window.addEventListener('beforeunload', (e) => {
            if (unsavedChanges && this._enabled) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
    },
    
    _setupHistoryAPI() {
        const originalPushState = history.pushState;
        history.pushState = (...args) => {
            if (this._shouldAllowNavigation(args[2])) {
                originalPushState.apply(history, args);
            }
        };
        
        const originalReplaceState = history.replaceState;
        history.replaceState = (...args) => {
            if (this._shouldAllowNavigation(args[2])) {
                originalReplaceState.apply(history, args);
            }
        };
        
        window.addEventListener('popstate', (e) => {
            if (!this._shouldAllowNavigation(document.location.pathname)) {
                history.pushState(null, '', this._pendingNavigation || document.location.pathname);
                e.preventDefault();
            }
        });
    },
    
    _shouldAllowNavigation(path) {
        if (!this._enabled) return true;
        if (currentState !== LifecycleState.ACTIVE) return true;
        
        const isGuarded = this._guardedPaths.some(p => path?.includes(p));
        
        if (isGuarded && unsavedChanges) {
            this._promptUser(path);
            return false;
        }
        
        return true;
    },
    
    _promptUser(targetPath) {
        const confirmed = confirm('You have unsaved changes. Are you sure you want to leave?');
        if (confirmed) {
            unsavedChanges = false;
            this._pendingNavigation = targetPath;
            window.location.href = targetPath;
        }
    },
    
    guardPath(path) {
        if (!this._guardedPaths.includes(path)) {
            this._guardedPaths.push(path);
        }
    },
    
    unguardPath(path) {
        const index = this._guardedPaths.indexOf(path);
        if (index !== -1) {
            this._guardedPaths.splice(index, 1);
        }
    },
    
    enable() {
        this._enabled = true;
    },
    
    disable() {
        this._enabled = false;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
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
        return {
            enabled: this._enabled,
            guardedPaths: [...this._guardedPaths],
            pendingNavigation: this._pendingNavigation
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

NavigationGuard.init();

// =============================================
// UI FAILSAFE
// =============================================
const UIFailsafe = {
    _enabled: true,
    _errorCount: 0,
    _maxErrors: 5,
    _recoveryTimer: null,
    _listeners: new Set(),
    _fallbackMode: false,
    _disabledElements: new Set(),
    _silent: true,
    
    init() {
        initLog('UIFailsafe initializing');
        this._setupErrorHandling();
        this._setupElementProtection();
        successLog('UIFailsafe initialized');
    },
    
    _setupErrorHandling() {
        window.addEventListener('error', (event) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            if (event.target && (event.target.tagName === 'BUTTON' || 
                                 event.target.tagName === 'INPUT' ||
                                 event.target.tagName === 'SELECT')) {
                this._handleUIError(event.target, event.error);
            }
        }, true);
        
        window.addEventListener('unhandledrejection', (event) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            this._handleUIError(null, event.reason);
        });
    },
    
    _setupElementProtection() {
        const criticalButtons = [
            'backToAppBtn',
            'saveSectionBtn',
            'resetSectionBtn',
            'settingsSearch'
        ];
        
        criticalButtons.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const originalClick = el.onclick;
                el.onclick = (e) => {
                    if (currentState !== LifecycleState.ACTIVE) {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                    if (this._fallbackMode && id !== 'backToAppBtn') {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                    if (originalClick) {
                        return originalClick.call(el, e);
                    }
                };
            }
        });
    },
    
    _handleUIError(element, error) {
        this._errorCount++;
        
        if (this._errorCount >= this._maxErrors && !this._fallbackMode) {
            this.enterFallbackMode();
        }
        
        if (element && element.id) {
            this._disabledElements.add(element.id);
            element.disabled = true;
            element.classList.add('failsafe-disabled');
        }
        
        this.emit('error', { element, error, count: this._errorCount });
    },
    
    enterFallbackMode() {
        if (this._fallbackMode) return;
        if (currentState !== LifecycleState.ACTIVE) return;
        
        this._fallbackMode = true;
        
        document.querySelectorAll('button, input, select, textarea').forEach(el => {
            if (el.id !== 'backToAppBtn' && !el.classList.contains('failsafe-protected')) {
                this._disabledElements.add(el.id || el.className);
                el.disabled = true;
                el.classList.add('failsafe-disabled');
            }
        });
        
        const container = document.getElementById('settingsContent');
        if (container) {
            const fallbackMsg = document.createElement('div');
            fallbackMsg.className = 'failsafe-message';
            fallbackMsg.style.cssText = `
                background: var(--warning-color);
                color: white;
                padding: 12px 20px;
                margin-bottom: 20px;
                border-radius: 8px;
                text-align: center;
                font-size: 14px;
            `;
            fallbackMsg.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i> Limited mode
                <button onclick="UIFailsafe.exitFallbackMode()" style="margin-left: 10px; padding: 4px 12px; background: white; color: var(--warning-color); border: none; border-radius: 4px; cursor: pointer;">
                    Retry
                </button>
            `;
            container.prepend(fallbackMsg);
        }
        
        this.emit('fallback', true);
        
        this._recoveryTimer = safeSetTimeout(() => {
            this.exitFallbackMode();
        }, 30000);
        activeTimers.add(this._recoveryTimer);
    },
    
    exitFallbackMode() {
        if (!this._fallbackMode) return;
        
        this._fallbackMode = false;
        this._errorCount = 0;
        
        this._disabledElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = false;
                el.classList.remove('failsafe-disabled');
            }
        });
        this._disabledElements.clear();
        
        const msg = document.querySelector('.failsafe-message');
        if (msg) msg.remove();
        
        if (this._recoveryTimer) {
            clearTimeout(this._recoveryTimer);
            activeTimers.delete(this._recoveryTimer);
        }
        
        this.emit('fallback', false);
    },
    
    protectElement(id) {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('failsafe-protected');
        }
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
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
    
    isInFallback() {
        return this._fallbackMode;
    },
    
    getDiagnostics() {
        return {
            enabled: this._enabled,
            fallbackMode: this._fallbackMode,
            errorCount: this._errorCount,
            maxErrors: this._maxErrors,
            disabledElements: Array.from(this._disabledElements)
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

UIFailsafe.init();

// =============================================
// MULTI-MODULE COORDINATOR
// =============================================
const MODULE_DISCOVERY = 'MODULE_DISCOVERY';
const MODULE_PRESENCE = 'MODULE_PRESENCE';
const ORIGIN_BIND = 'ORIGIN_BIND';

const MultiModuleCoordinator = {
    _modules: new Map(),
    _moduleId: `settings_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    _moduleType: MODULE_NAME,
    _busListeners: new Map(),
    _sharedSession: null,
    _masterModule: false,
    _handshakeCoordinator: null,
    _silent: true,
    _broadcastChannel: null,
    
    init() {
        initLog('MultiModuleCoordinator initializing');
        if (!window.__MODULE_COORDINATOR__) {
            window.__MODULE_COORDINATOR__ = this;
            this._masterModule = true;
        }
        
        this.registerModule(this._moduleType, this._moduleId);
        
        window.addEventListener('message', (event) => {
            if (event.data && event.data._moduleBus) {
                this._handleModuleMessage(event.data);
            }
        });
        
        try {
            this._broadcastChannel = new BroadcastChannel('knecta_settings');
            this._broadcastChannel.onmessage = (event) => {
                if (event.data && event.data.type) {
                    this._handleBroadcastMessage(event.data);
                }
            };
        } catch (e) {}
        
        successLog('MultiModuleCoordinator initialized');
    },
    
    _handleBroadcastMessage(data) {
        if (data.type === 'SETTINGS_UPDATED' && data.source !== this._moduleId) {
            if (currentState === LifecycleState.ACTIVE && isAuthenticated) {
                MessageTransport.send('SETTINGS_LOAD_REQUEST', {});
            }
        }
        
        if (data.type === 'LANGUAGE_CHANGED' && data.source !== this._moduleId) {
            const event = new CustomEvent('languageChanged', {
                detail: { language: data.language, source: 'broadcast' }
            });
            window.dispatchEvent(event);
        }
        
        if (data.type === 'THEME_CHANGED' && data.source !== this._moduleId) {
            if (data.theme) {
                applyTheme(data.theme);
            }
        }
        
        if (data.type === 'PRIVACY_UPDATED' && data.source !== this._moduleId) {
            const event = new CustomEvent('privacyUpdated', {
                detail: { privacy: data.privacy, source: 'broadcast' }
            });
            window.dispatchEvent(event);
        }
    },
    
    registerModule(type, id) {
        this._modules.set(id, {
            type,
            id,
            lastSeen: Date.now(),
            ready: currentState === LifecycleState.ACTIVE,
            handshakeComplete: registrationCompleted,
            sessionValid: isSessionValid(),
            authenticated: isAuthenticated
        });
        
        this._broadcast({
            _moduleBus: true,
            type: MODULE_PRESENCE,
            moduleType: type,
            moduleId: id,
            timestamp: Date.now()
        });
    },
    
    _handleModuleMessage(data) {
        const { type, sourceId, moduleType, target } = data;
        
        if (target && target !== this._moduleId && target !== 'all') return;
        
        switch (type) {
            case MODULE_PRESENCE:
                this._modules.set(sourceId, {
                    type: moduleType,
                    id: sourceId,
                    lastSeen: Date.now(),
                    ready: data.ready || false,
                    handshakeComplete: data.handshakeComplete || false,
                    sessionValid: data.sessionValid || false,
                    authenticated: data.authenticated || false
                });
                break;
                
            case MODULE_DISCOVERY:
                this._broadcast({
                    _moduleBus: true,
                    type: MODULE_PRESENCE,
                    moduleType: this._moduleType,
                    moduleId: this._moduleId,
                    ready: currentState === LifecycleState.ACTIVE,
                    handshakeComplete: registrationCompleted,
                    sessionValid: isSessionValid(),
                    authenticated: isAuthenticated,
                    timestamp: Date.now(),
                    target: sourceId
                });
                break;
                
            default:
                const listeners = this._busListeners.get(type) || [];
                listeners.forEach(listener => {
                    try {
                        listener(data);
                    } catch (e) {}
                });
        }
    },
    
    _broadcast(message) {
        message.sourceId = this._moduleId;
        message.timestamp = Date.now();
        
        MessageTransport.send('MODULE_BROADCAST', {
            payload: message
        });
    },
    
    on(event, listener) {
        if (!this._busListeners.has(event)) {
            this._busListeners.set(event, []);
        }
        this._busListeners.get(event).push(listener);
    },
    
    emit(event, data) {
        this._broadcast({
            _moduleBus: true,
            type: event,
            ...data
        });
    },
    
    getModules() {
        const now = Date.now();
        this._modules.forEach((module, id) => {
            if (now - module.lastSeen > 60000) {
                this._modules.delete(id);
            }
        });
        
        return Array.from(this._modules.values());
    },
    
    hasModule(type) {
        return Array.from(this._modules.values()).some(m => m.type === type);
    },
    
    getSharedSession() {
        return window.session.user ? { user: window.session.user } : null;
    },
    
    setSharedSession(sessionData) {
    },
    
    getDiagnostics() {
        return {
            moduleId: this._moduleId,
            moduleType: this._moduleType,
            masterModule: this._masterModule,
            modulesCount: this._modules.size,
            modules: Array.from(this._modules.values())
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

MultiModuleCoordinator.init();

// =============================================
// UI BRIDGE
// =============================================
const UIBridge = {
    _listeners: new Map(),
    _domEvents: new Map(),
    _initialized: false,
    _silent: true,
    
    init() {
        if (this._initialized) return this;
        initLog('UIBridge initializing');
        this._setupDefaultListeners();
        this._initialized = true;
        successLog('UIBridge initialized');
        return this;
    },
    
    _setupDefaultListeners() {
        this.register('updateSetting', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) {
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
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) {
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
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) {
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
            
            if (!isAuthenticated) {
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
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            MessageTransport.send('SEND_MESSAGE', data);
        });
        
        this.register('updateProfile', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('profile', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updatePrivacy', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('privacy', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateNotifications', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('notifications', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateAppearance', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('appearance', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateSecurity', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('security', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateChat', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('chat', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateFriends', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('friends', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateGroups', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('groups', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateCalls', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('calls', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateStatus', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('status', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateStorage', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('storage', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateMood', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('mood', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateAdvanced', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('advanced', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateBackup', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('backup', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('updateDanger', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await updateSetting('danger', data.key, data.value);
            } catch (error) {}
        });
        
        this.register('logout', async () => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await handleLogout();
            } catch (error) {}
        });
        
        this.register('terminateSession', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await terminateSession(data.sessionId);
            } catch (error) {}
        });
        
        this.register('terminateAllSessions', async () => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await terminateAllSessions();
            } catch (error) {}
        });
        
        this.register('unblockUser', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await unblockUser(data.userId);
            } catch (error) {}
        });
        
        this.register('clearChatCache', async () => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
            try {
                await clearChatCache();
            } catch (error) {}
        });
        
        this.register('clearMediaCache', async () => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
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
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
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

UIBridge.init();

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
        this._components.set('ui', UIBridge);
        this._components.set('api', ApiCore);
        this._components.set('navigation', NavigationGuard);
        this._components.set('failsafe', UIFailsafe);
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
                currentUser = cachedUser;
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
        const root = document.documentElement;
        
        if (theme === 'auto') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.setAttribute('data-theme', isDark ? 'dark' : 'light');
        } else {
            root.setAttribute('data-theme', theme);
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
    if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
    
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
                    currentUser = user;
                    coreData.user = user;
                    window.session.user = user;
                    SafeStorage.setJSON('current_user', currentUser);
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
    if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
    
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
    if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
    
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
    if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
    
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
    if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) return;
    
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
            applyTheme(userSettings.appearance.theme || 'auto');
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
    if (!isAuthenticated) {
        return false;
    }
    
    try {
        await authorizedRequest('/api/auth/logout', { method: 'POST' });
        
        await MessageTransport.send('SESSION_INVALIDATED', {});
        
        isAuthenticated = false;
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
    if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) {
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
    if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) {
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
    if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) {
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
    if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) {
        throw new Error('Not ready');
    }

    // FIX: this previously POSTed to /api/storage/clear-chat-cache, a route
    // that does not exist anywhere in the backend (verified against every
    // file in src/routes/) — the request always 404'd, silently, because the
    // caller in settings-ui.js didn't await this function either. "Chat
    // cache" is genuinely client-side data (cached messages in IndexedDB),
    // so clear it directly via the existing local cache layer instead of a
    // network round-trip that could never succeed.
    if (!window.AppCache || typeof window.AppCache.clear !== 'function') {
        throw new Error('Local cache is not available yet');
    }

    const cleared = await window.AppCache.clear('messages');
    if (!cleared) {
        throw new Error('Failed to clear local message cache');
    }

    if (userSettings.storage) {
        userSettings.storage.storageBreakdown.chats = 0;
        userSettings.storage.totalStorageUsed =
            (userSettings.storage.storageBreakdown.media || 0) +
            (userSettings.storage.storageBreakdown.other || 0);
        calculateStorageUsage();
        unsavedChanges = true;
    }

    await MessageTransport.send(PARENT_MESSAGE_TYPES.CACHE_CLEARED, {
        cacheType: 'chat'
    });

    window.dispatchEvent(new CustomEvent('chatCacheCleared', {
        detail: { timestamp: Date.now() }
    }));

    return true;
}

// =============================================
// CLEAR MEDIA CACHE — uses the service worker's CACHE_CLEARED mechanism
// =============================================
async function clearMediaCache() {
    if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) {
        throw new Error('Not ready');
    }

    // FIX: this previously POSTed to /api/storage/clear-media-cache, which
    // also does not exist in the backend. Media cache is the service
    // worker's Cache Storage (service-worker.js, CACHE_NAME), which already
    // has a working CLEAR_CACHE message handler — use that instead of a
    // network call.
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        throw new Error('Service worker not available to clear media cache');
    }

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out clearing media cache')), 8000);
        const onMessage = (event) => {
            if (event.data && event.data.type === 'CACHE_CLEARED') {
                clearTimeout(timeout);
                navigator.serviceWorker.removeEventListener('message', onMessage);
                resolve();
            }
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
    });

    if (userSettings.storage) {
        userSettings.storage.storageBreakdown.media = 0;
        userSettings.storage.totalStorageUsed =
            (userSettings.storage.storageBreakdown.chats || 0) +
            (userSettings.storage.storageBreakdown.other || 0);
        calculateStorageUsage();
        unsavedChanges = true;
    }

    await MessageTransport.send(PARENT_MESSAGE_TYPES.CACHE_CLEARED, {
        cacheType: 'media'
    });

    window.dispatchEvent(new CustomEvent('mediaCacheCleared', {
        detail: { timestamp: Date.now() }
    }));

    return true;
}

// =============================================
// UPDATE USER UI
// =============================================
function updateUserUI() {
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
                mode: isAuthenticated ? 'authenticated' : 'no_session',
                user: currentUser,
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
    
    if (!isAuthenticated) {
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
    if (!isAuthenticated && currentState !== LifecycleState.ACTIVE) {
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
                currentUser = window.session.user;
                coreData.user = window.session.user;
                SafeStorage.setJSON('current_user', currentUser);
                return currentUser;
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
    if (!isAuthenticated && currentState !== LifecycleState.ACTIVE) {
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
    if (!isAuthenticated && currentState !== LifecycleState.ACTIVE) return null;
    
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
    if (!isAuthenticated && currentState !== LifecycleState.ACTIVE) return null;
    
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
    if (!isAuthenticated && currentState !== LifecycleState.ACTIVE) return null;
    
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
    if (!isAuthenticated && currentState !== LifecycleState.ACTIVE) return null;
    
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
    if (!isAuthenticated && currentState !== LifecycleState.ACTIVE) {
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
        if (isAuthenticated && window.session.token) return true;
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
        if (!isAuthenticated && currentState !== LifecycleState.ACTIVE) {
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
    return isAuthenticated && isSessionValid();
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
        isAuthenticated = false;
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
function showReconnectionState() {
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
        if (isAuthenticated && isSessionValid()) {
            resolve(true);
            return;
        }
        const startTime = Date.now();
        const checkInterval = safeSetInterval(() => {
            try {
                if (isAuthenticated && isSessionValid()) {
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
                authenticated: isAuthenticated
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
function setupBasicEventListeners() {
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
        authenticated: isAuthenticated,
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
    if (isReady && isAuthenticated) {
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
        isAuthenticated = false;
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
        return { success: true, state: currentState, authenticated: isAuthenticated };
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
                authenticated: isAuthenticated 
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
        isAuthenticated = true;
        authCheckComplete = true;
        processRequestQueue();
        console.log('[settings-core] ✅ AUTH_READY received');
    });
    MessageTransport.on('AUTH_ERROR', (message) => {
        isAuthenticated = false;
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
            authenticated: isAuthenticated
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
            authenticated: isAuthenticated,
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
            authenticated: isAuthenticated,
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
                authenticated: isAuthenticated,
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
        enableNotifications: true,
        notificationSound: true,
        notificationVibration: true,
        messageNotifications: true,
        groupNotifications: true,
        callNotifications: true,
        mentionNotifications: true,
        emailNotifications: false
    },
    appearance: {
        theme: 'auto',
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
        allowIncomingCalls: true,
        whoCanCallMe: 'friendsOnly',
        autoAnswer: false,
        autoReject: false,
        callRingtone: 'default',
        vibrateOnCall: true,
        cameraOnStart: false,
        videoQuality: 'auto',
        voiceQuality: 'high',
        noiseCancellation: true,
        echoCancellation: true,
        speakerDefault: true,
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

// =============================================
// EXPORT ALL PUBLIC FUNCTIONS AND CONSTANTS
// =============================================
export {
    // Core state
    currentUser,
    userSettings,
    currentSection,
    unsavedChanges,
    blockedUsers,
    activeSessions,
    userContacts,
    userGroups,
    
    // Auth state
    isAuthenticated,
    authReady,
    apiInitialized,
    backgroundTasksStarted,
    tokenReady,
    tokenAvailable,
    tokenInitialized,
    parentCommunicationReady,
    parentSessionReceived,
    parentOrigin,
    parentSessionData,
    sessionValidated,
    
    // Constants
    MAX_API_RETRIES,
    AUTH_CHECK_INTERVAL,
    TOKEN_CHECK_INTERVAL,
    HANDSHAKE_RETRY_INTERVAL,
    SESSION_SYNC_TIMEOUT,
    HEARTBEAT_INTERVAL,
    PING_INTERVAL,
    PING_TIMEOUT,
    MAX_PING_FAILURES,
    RECOVERY_BACKOFF_BASE,
    RECOVERY_MAX_BACKOFF,
    VISIBILITY_THROTTLE_DELAY,
    TOKEN_BINDING_NONCE_LENGTH,
    
    // Defaults
    DEFAULT_SETTINGS,
    SETTINGS_MENU,
    PARENT_MESSAGE_TYPES,
    
    // Core functions
    verifyParentPresence,
    setupSecureMessagingChannel,
    startParentHandshake,
    resetUIForLogout,
    showReconnectionState,
    checkAuthenticationState,
    bootstrapIframe,
    waitForSession,
    initializeBasicUI,
    setupBasicEventListeners,
    startTokenMonitoring,
    checkTokenAvailability,
    notifyTokenReady,
    notifyTokenLost,
    getSecureToken,
    secureFetchWrapper,
    waitForToken,
    startPassiveAuthMonitoring,
    startBackgroundTasks,
    safeLoadUserData,
    safeLoadSettings,
    safeLoadBlockedUsers,
    safeLoadActiveSessions,
    safeLoadUserContacts,
    safeLoadUserGroups,
    makeSafeRequest,
    saveSettings,
    notifyParentAuthState,
    notifyParentAuthError,
    loadFromLocalStorage,
    updateUserUI,
    initializeUI,
    calculateStorageUsage,
    formatStorageSize,
    getMoodText,
    getMoodColor,
    terminateSession,
    terminateAllSessions,
    unblockUser,
    clearChatCache,
    clearMediaCache,
    onReady,
    isReady,
        OfflineQueue,

        // Enhanced exports from hardened core
    getCoreDiagnostics,
    getHealthMetrics,
    forceRecovery,
    connectionQuality,
    StartupGovernor,
    SessionClient,
    ReliabilityEngine,
    DiagnosticsAgent,
    CompatibilityBridge,
    MultiModuleCoordinator,
    IframeEnvironment,
    SafeStorage,
    IframeTransport,
    IframeHandshakeAuthority,
    RecoveryManager,
    NavigationGuard,
    UIFailsafe,
    
    // API Core and secure wrapper
    secureApiCall,
    ApiCore,
    safeGet,
    safeArray,
    safeObject,
    
    // Module identifiers
    MODULE_NAME,
    MODULE_VERSION,
    FRAME_ID,
    DEBUG,
    LifecycleState,
    currentState,
    
    // Session object - export the module-level variable
    sessionWindow,
    
    // Additional core functions
    setState,
    isSessionValid,
    updateSetting,
    handleLogout,
    sendMessageToParent,
    setSilentMode,
    shutdownCore,
    initializeCore,
    authorizedFetch,
    
    // Settings state
    SettingsState,
    
    // Expose queue and parentReady for debugging - FIX #6: Use parentReadyReceived
    messageQueue,
    parentReadyReceived as parentReady,
    
    // Request queue
    requestQueue
};

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
    // FIX-009: Also check canonical 'kyn_app_settings' key written by AppSettings.js
    try {
        const canonicalRaw = localStorage.getItem('kyn_app_settings');
        if (canonicalRaw) {
            const canonicalData = JSON.parse(canonicalRaw);
            if (canonicalData && typeof canonicalData === 'object' && Object.keys(canonicalData).length > 0) {
                // Merge canonical settings into SettingsState so all modules see them
                if (!SettingsState.data || Object.keys(SettingsState.data).length === 0) {
                    SettingsState.data = canonicalData;
                    SettingsState.loaded = true;
                }
            }
        }
    } catch(_) {}
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
                    // Apply appearance/theme immediately before any async work
                    if (data.appearance?.theme) {
                        const t = data.appearance.theme;
                        const resolved = t === 'auto'
                            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                            : t;
                        document.documentElement.setAttribute('data-theme', resolved);
                    }
                    if (data.appearance?.fontSize) {
                        document.documentElement.style.fontSize = data.appearance.fontSize + 'px';
                    }
                    if (data.appearance?.accentColor) {
                        document.documentElement.style.setProperty('--accent-color', data.appearance.accentColor);
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
    authenticated: isAuthenticated,
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
    authenticated: isAuthenticated,
    queueLength: requestQueue.length
});

// =============================================
// END OF FILE
// =============================================