// js/auth.session.manager.js - Complete Session Manager for Auto-Login
// Version: 1.2.0 - FIXED: Eliminated session restoration loops, added initialization locks
// Handles: Persistent sessions, auto-login, account limits, logout detection

(function() {
    'use strict';
    
    console.log('[SessionManager] Initializing...');
    
    // ============================================================================
    // CONFIGURATION
    // ============================================================================
    const CONFIG = {
        SESSION_KEY: 'kynecta_session',
        ACCOUNTS_KEY: 'kynecta_saved_accounts',
        MAX_ACCOUNTS_PER_DEVICE: 2,
        SESSION_DURATION_DAYS: 30, // PATCH v1.2: Match authStorage 30-day default (was 1 day — caused reopen loop)
        CHECK_INTERVAL: 60000,      // Check every minute
        STORAGE_VERSION: '1.2.0',
        ACTIVITY_THROTTLE_MS: 5000  // Only save session every 5 seconds max
    };
    
    // ============================================================================
    // INITIALIZATION LOCKS - PREVENT MULTIPLE INITIALIZATIONS
    // ============================================================================
    let __SESSION_MANAGER_INITIALIZED__ = false;
    let __SESSION_MANAGER_LOCK__ = false;
    let __AUTO_LOGIN_IN_PROGRESS__ = false;
    
    // ============================================================================
    // STATE MANAGEMENT
    // ============================================================================
    let currentSession = null;
    let savedAccounts = [];
    let sessionCheckInterval = null;
    let lastActivityTime = Date.now();
    let lastSaveTime = 0;           // Track last save to prevent spam
    let savePending = false;        // Debounce flag
    let saveCounter = 0;            // Count saves for logging (reduce noise)
    
    // ============================================================================
    // THROTTLED SAVE FUNCTION - PREVENTS INFINITE LOOP
    // ============================================================================
    function debouncedSaveSession() {
        // Don't queue multiple saves
        if (savePending) return;
        
        const now = Date.now();
        // If we saved recently, delay the save
        if (now - lastSaveTime < CONFIG.ACTIVITY_THROTTLE_MS) {
            savePending = true;
            setTimeout(() => {
                savePending = false;
                if (currentSession) {
                    performSaveSession();
                }
            }, CONFIG.ACTIVITY_THROTTLE_MS - (now - lastSaveTime));
            return;
        }
        
        performSaveSession();
    }
    
    function performSaveSession() {
        try {
            if (currentSession) {
                const sessionData = {
                    ...currentSession,
                    lastActivity: lastActivityTime,
                    version: CONFIG.STORAGE_VERSION,
                    expiresAt: Date.now() + (CONFIG.SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000)
                };
                localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(sessionData));
                lastSaveTime = Date.now();
                
                // Only log every 10th save to reduce console noise
                saveCounter++;
                if (saveCounter % 10 === 0) {
                    console.log('[SessionManager] Session saved (throttled)');
                }
                return true;
            } else {
                localStorage.removeItem(CONFIG.SESSION_KEY);
                return true;
            }
        } catch (error) {
            console.error('[SessionManager] Failed to save session:', error);
            return false;
        }
    }
    
    // Main save function (now uses throttling)
    function saveSession() {
        debouncedSaveSession();
    }
    
    function loadSession() {
        try {
            const saved = localStorage.getItem(CONFIG.SESSION_KEY);
            if (!saved) {
                return null;
            }
            
            const session = JSON.parse(saved);
            
            // CRITICAL: Validate ONLY structure, NOT expiry or backend
            // This ensures instant loading without blocking
            if (!session || typeof session !== 'object') {
                console.warn('[SessionManager] Invalid session structure, clearing');
                clearSession();
                return null;
            }
            
            // Structure validation only - token and userId must exist
            if (!session.token || !session.userId) {
                console.warn('[SessionManager] Missing required session fields, clearing');
                clearSession();
                return null;
            }
            
            console.log('[SessionManager] ✅ Session loaded instantly, userId:', session.userId);
            currentSession = session;
            lastActivityTime = session.lastActivity || Date.now();
            
            // Set global state immediately for UI rendering
            if (!window.currentUser && session.user) {
                window.currentUser = session.user;
            }
            
            return session;
        } catch (error) {
            console.error('[SessionManager] Failed to load session:', error);
            // Don't clear session on parse error - might be recoverable
            return null;
        }
    }
    
    function clearSession() {
        currentSession = null;
        localStorage.removeItem(CONFIG.SESSION_KEY);
        lastSaveTime = 0;
        savePending = false;
        console.log('[SessionManager] Session cleared');
    }
    
    // ============================================================================
    // ACCOUNT MANAGEMENT (Limit to 2 per device)
    // ============================================================================
    function loadSavedAccounts() {
        try {
            const saved = localStorage.getItem(CONFIG.ACCOUNTS_KEY);
            if (saved) {
                savedAccounts = JSON.parse(saved);
                console.log(`[SessionManager] Loaded ${savedAccounts.length} saved accounts`);
            } else {
                savedAccounts = [];
            }
            return savedAccounts;
        } catch (error) {
            console.error('[SessionManager] Failed to load accounts:', error);
            savedAccounts = [];
            return [];
        }
    }
    
    function saveAccounts() {
        try {
            localStorage.setItem(CONFIG.ACCOUNTS_KEY, JSON.stringify(savedAccounts));
            return true;
        } catch (error) {
            console.error('[SessionManager] Failed to save accounts:', error);
            return false;
        }
    }
    
    function addAccount(userData, token) {
        loadSavedAccounts();
        
        const existingIndex = savedAccounts.findIndex(acc => acc.userId === userData.id || acc.email === userData.email);
        
        if (existingIndex !== -1) {
            savedAccounts[existingIndex] = {
                ...savedAccounts[existingIndex],
                ...userData,
                token: token,
                lastUsed: Date.now()
            };
        } else {
            if (savedAccounts.length >= CONFIG.MAX_ACCOUNTS_PER_DEVICE) {
                console.warn(`[SessionManager] Cannot add account - limit of ${CONFIG.MAX_ACCOUNTS_PER_DEVICE} reached`);
                return { success: false, error: `Maximum ${CONFIG.MAX_ACCOUNTS_PER_DEVICE} accounts per device` };
            }
            
            savedAccounts.push({
                userId: userData.id,
                email: userData.email,
                username: userData.username,
                displayName: userData.displayName || userData.username,
                avatar: userData.avatar,
                token: token,
                lastUsed: Date.now(),
                createdAt: Date.now()
            });
        }
        
        saveAccounts();
        return { success: true };
    }
    
    function removeAccount(userId) {
        loadSavedAccounts();
        const initialLength = savedAccounts.length;
        savedAccounts = savedAccounts.filter(acc => acc.userId !== userId);
        
        if (savedAccounts.length !== initialLength) {
            saveAccounts();
            console.log('[SessionManager] Removed account:', userId);
            
            if (currentSession && currentSession.userId === userId) {
                clearSession();
            }
            return true;
        }
        return false;
    }
    
    function getSavedAccounts() {
        loadSavedAccounts();
        return savedAccounts.map(acc => ({
            userId: acc.userId,
            email: acc.email,
            username: acc.username,
            displayName: acc.displayName,
            avatar: acc.avatar,
            lastUsed: acc.lastUsed
        }));
    }
    
    // ============================================================================
    // ACTIVITY TRACKING - THROTTLED TO PREVENT SPAM
    // ============================================================================
    let lastActivityCallTime = 0;
    
    function updateActivity() {
        const now = Date.now();
        // Only update every 5 seconds max
        if (now - lastActivityCallTime < CONFIG.ACTIVITY_THROTTLE_MS) {
            return;
        }
        lastActivityCallTime = now;
        lastActivityTime = now;
        if (currentSession) {
            currentSession.lastActivity = lastActivityTime;
            saveSession();
        }
    }
    
    function setupActivityTracking() {
        const events = ['click', 'keypress', 'scroll', 'touchstart', 'mousemove'];
        events.forEach(event => {
            window.addEventListener(event, updateActivity, { passive: true });
        });
        console.log('[SessionManager] Activity tracking enabled (throttled to 5s)');
    }
    
    // ============================================================================
    // TOKEN VALIDATION
    // ============================================================================
    function isTokenValid(token) {
        if (!token || typeof token !== 'string') return false;
        
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return false;
            
            const payload = JSON.parse(atob(parts[1]));
            if (payload.exp) {
                const expiryTime = payload.exp * 1000;
                if (Date.now() > expiryTime) {
                    console.log('[SessionManager] Token expired');
                    return false;
                }
            }
            return true;
        } catch (error) {
            return false;
        }
    }
    
    // ============================================================================
    // AUTO-LOGIN LOGIC - LOOP PREVENTION
    // ============================================================================
    async function performAutoLogin() {
        // CRITICAL: Prevent multiple auto-login attempts
        if (__AUTO_LOGIN_IN_PROGRESS__) {
            console.log('[SessionManager] ⚠️ Auto-login already in progress, skipping');
            return { success: false, reason: 'auto_login_in_progress' };
        }
        
        __AUTO_LOGIN_IN_PROGRESS__ = true;
        
        try {
            console.log('[SessionManager] Performing auto-login check...');
            
            const session = loadSession();
            if (!session || !session.token) {
                console.log('[SessionManager] No valid session found for auto-login');
                return { success: false, reason: 'no_session' };
            }
            
            if (!isTokenValid(session.token)) {
                console.log('[SessionManager] Token invalid, clearing session');
                clearSession();
                return { success: false, reason: 'invalid_token' };
            }
            
            const isOnChatPage = window.location.pathname.includes('chat.html');
            const isOnIndexPage = window.location.pathname === '/' || window.location.pathname.includes('index.html');
            
            // PATCH v1.3: Only write kynecta_auth if we have BOTH token AND user.
            // Writing a token-only session here was the source of corrupted state:
            // userLoggedIn() would return true (token present) but centralSession.user
            // would be null, causing the 5-second wait loop then showAuthUI() redirect.
            if (!session.user) {
                console.warn('[SessionManager] performAutoLogin: session has no user — skipping storage write to prevent corruption');
                return { success: false, reason: 'no_user_in_session' };
            }

            try {
                // Write canonical key with BOTH token and user
                const unifiedAuth = {
                    token: session.token,
                    user: session.user,
                    userId: session.userId || session.user?.id || session.user?.uid || null,
                    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
                    issuedAt: Date.now(),
                    savedAt: new Date().toISOString()
                };
                if (window.AuthStorage && typeof window.AuthStorage.saveAuth === 'function') {
                    window.AuthStorage.saveAuth(unifiedAuth);
                } else {
                    localStorage.setItem('kynecta_auth', JSON.stringify(unifiedAuth));
                }
                window.currentUser = session.user;
                console.log('[SessionManager] Session written via performAutoLogin (token + user present)');
            } catch (error) {
                console.warn('[SessionManager] Failed to restore token to storage:', error);
            }
            
            try {
                window.dispatchEvent(new CustomEvent('session:restored', {
                    detail: { token: session.token, user: session.user, timestamp: Date.now() }
                }));
                window.dispatchEvent(new CustomEvent('auth:token:ready', {
                    detail: { token: session.token, timestamp: Date.now() }
                }));
            } catch (error) {}
            
            if (isOnIndexPage) {
                console.log('[SessionManager] Auto-login successful, staying on current page to prevent redirect loop');
            } else if (isOnChatPage) {
                console.log('[SessionManager] Already on chat page, session restored');
            }
            
            return { success: true, user: session.user, token: session.token };
        } finally {
            __AUTO_LOGIN_IN_PROGRESS__ = false;
        }
    }
    
    // ============================================================================
    // SESSION CREATION (After Login/Register)
    // ============================================================================
    function createSession(userData, token, rememberMe = true) {
        if (!rememberMe) {
            console.log('[SessionManager] Remember me not checked, not creating persistent session');
            return { success: true, ephemeral: true };
        }
        
        const sessionData = {
            userId: userData.id || userData.userId,
            email: userData.email,
            username: userData.username,
            displayName: userData.displayName || userData.username,
            avatar: userData.avatar,
            token: token,
            user: userData,
            createdAt: Date.now(),
            lastActivity: Date.now()
        };
        
        currentSession = sessionData;
        lastSaveTime = 0;  // Reset save timer
        lastActivityCallTime = Date.now();
        saveSession();
        
        const accountResult = addAccount(userData, token);
        
        console.log('[SessionManager] Session created for user:', userData.id);
        return { success: true, accountResult };
    }
    
    function destroySession() {
        clearSession();
        console.log('[SessionManager] Session destroyed');
        return { success: true };
    }
    
    // ============================================================================
    // LOGOUT HANDLER (User-initiated logout)
    // ============================================================================
    async function logout(keepAccount = false) {
        console.log('[SessionManager] Logout requested, keepAccount:', keepAccount);
        
        try {
            if (window.api && window.api.auth && typeof window.api.auth.logout === 'function') {
                await window.api.auth.logout();
            }
        } catch (error) {
            console.warn('[SessionManager] Logout API call failed:', error);
        }
        
        const userId = currentSession?.userId;
        destroySession();
        
        try {
            localStorage.removeItem('token');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('moodchat_token');
            localStorage.removeItem('USER_TOKEN');
            localStorage.removeItem('currentUser');
            localStorage.removeItem('user');
            localStorage.removeItem('kynecta_auth');
            window.currentUser = null;
        } catch (error) {}
        
        if (!keepAccount && userId) {
            removeAccount(userId);
        }
        
        if (window.location.pathname.includes('chat.html')) {
            console.log('[SessionManager] Logout complete, redirecting to index');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 500);
        }
        
        return { success: true };
    }
    
    // ============================================================================
    // CHECK IF SHOULD PROMPT LOGIN (User inactive for >1 day)
    // ============================================================================
    function shouldPromptLogin() {
        const session = loadSession();
        if (!session) return true;
        
        const lastActivity = session.lastActivity || session.createdAt;
        const inactiveDuration = Date.now() - lastActivity;
        const maxInactiveDuration = CONFIG.SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
        
        if (inactiveDuration > maxInactiveDuration) {
            console.log('[SessionManager] User inactive for >1 day, login required');
            clearSession();
            return true;
        }
        
        return false;
    }
    
    // ============================================================================
    // PERIODIC SESSION CHECK
    // ============================================================================
    function startSessionCheck() {
        if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
        }
        
        sessionCheckInterval = setInterval(() => {
            const session = loadSession();
            if (session && session.token) {
                if (!isTokenValid(session.token)) {
                    console.log('[SessionManager] Token expired during periodic check');
                    clearSession();
                    
                    try {
                        window.dispatchEvent(new CustomEvent('session:expired', {
                            detail: { timestamp: Date.now() }
                        }));
                    } catch (error) {}
                }
            }
        }, CONFIG.CHECK_INTERVAL);
        
        console.log('[SessionManager] Session check started');
    }
    
    // ============================================================================
    // INITIALIZATION - LOOP PREVENTION
    // ============================================================================
    async function initialize() {
        // PATCH v1.2: Single global boot guard — prevents any re-entry from
        // DOMContentLoaded firing on back-navigation or hot-module-reload.
        if (window.__APP_BOOTED__) {
            console.log('[SessionManager] ⚠️ __APP_BOOTED__ already set, skipping init');
            return { success: true, alreadyBooted: true };
        }
        window.__APP_BOOTED__ = true;

        // CRITICAL: Prevent multiple initializations
        if (__SESSION_MANAGER_INITIALIZED__) {
            console.log('[SessionManager] ⚠️ Already initialized, skipping');
            return { success: true, alreadyInitialized: true };
        }
        
        if (__SESSION_MANAGER_LOCK__) {
            console.log('[SessionManager] ⚠️ Initialization in progress, waiting...');
            // Wait for current initialization to complete
            let attempts = 0;
            while (__SESSION_MANAGER_LOCK__ && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            if (__SESSION_MANAGER_INITIALIZED__) {
                return { success: true, alreadyInitialized: true };
            }
        }
        
        __SESSION_MANAGER_INITIALIZED__ = true;
        
        try {
            console.log('[SessionManager] Initializing...');
            
            setupActivityTracking();
            startSessionCheck();
            loadSavedAccounts();
            
            const isOnIndexPage = window.location.pathname === '/' || 
                                  window.location.pathname.includes('index.html');
            
            // CRITICAL: Check if bootstrap already hydrated session
            const bootstrapHydrated = window.Session && window.Session._hydrated === true;
            if (bootstrapHydrated) {
                console.log('[SessionManager] Bootstrap already hydrated session, skipping auto-login');
                return { success: true, bootstrapHandled: true };
            }

            // PATCH v1.3: STRICT SESSION RESTORE — never trust a partial session.
            // Read kynecta_auth (canonical key) and validate with isValidSession().
            // isValidSession requires BOTH token (string) AND user (object).
            // A token-only or user-only session is CORRUPTED and must be auto-cleared.
            // This is the fix for: "requires manual browser data clearing" on mobile.
            let rawSession = null;
            try {
                const raw = localStorage.getItem('kynecta_auth');
                rawSession = raw ? JSON.parse(raw) : null;
            } catch(_) { rawSession = null; }

            // Use AuthStorage.isValidSession if available, else inline check
            const isValid = (window.AuthStorage && typeof window.AuthStorage.isValidSession === 'function')
                ? window.AuthStorage.isValidSession(rawSession)
                : !!(rawSession && rawSession.token && typeof rawSession.token === 'string'
                     && rawSession.token.length >= 10 && rawSession.user && typeof rawSession.user === 'object');

            if (!isValid) {
                // AUTO-CLEAR all session state — no manual browser clearing needed on mobile
                console.warn('[SessionManager] ⚠️ Corrupted/incomplete session detected — auto-clearing all keys');
                const ALL_SESSION_KEYS = [
                    'kynecta_auth', 'kynecta_session',
                    'accessToken', 'moodchat_token', 'USER_TOKEN', 'token',
                    'auth_token', 'auth_user', 'currentUser', 'user',
                    'moodchat_accessToken', 'moodchat_refreshToken', 'moodchat_user',
                    'moodchat_tokenExpiry', 'moodchat_issuedAt', 'moodchat_validated',
                    'REFRESH_TOKEN', 'TOKEN_EXPIRY', 'isLoggedIn', 'kynecta_token'
                ];
                ALL_SESSION_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch(_) {} });

                window.__SESSION__       = null;
                window.__IS_LOGGED_IN__  = false;
                window.__SESSION_READY__ = false;
                window.currentUser       = null;
                window.__userToken       = null;
                window.__accessToken     = null;

                console.log('[SessionManager] ✅ All session keys cleared — app will show login');
                return { success: true, sessionCleared: true };
            }

            // Valid session — set all global flags atomically
            const session = rawSession;
            window.__SESSION__       = session;
            window.__IS_LOGGED_IN__  = true;
            window.__SESSION_READY__ = true;
            window.currentUser       = session.user;
            window.__userToken       = session.token;
            window.__accessToken     = session.token;

            currentSession = {
                userId: session.user?.id || session.user?.uid || null,
                token:  session.token,
                user:   session.user,
                lastActivity: Date.now()
            };

            console.log('[SessionManager] ✅ Valid session restored for user:', session.user?.id || session.user?.email);

            try {
                window.dispatchEvent(new CustomEvent('session:restored', {
                    detail: { token: session.token, user: session.user, timestamp: Date.now() }
                }));
                window.dispatchEvent(new Event('session:ready'));
            } catch(e) {}

            return { success: true, sessionRestored: true };
            
            if (isOnIndexPage) {
                const shouldLogin = shouldPromptLogin();
                if (!shouldLogin && !__AUTO_LOGIN_IN_PROGRESS__) {
                    __AUTO_LOGIN_IN_PROGRESS__ = true;
                    try {
                        await performAutoLogin();
                    } finally {
                        __AUTO_LOGIN_IN_PROGRESS__ = false;
                    }
                } else {
                    console.log('[SessionManager] User needs to login - showing login form');
                }
            } else if (window.location.pathname.includes('chat.html')) {
                console.log('[SessionManager] No valid session on chat page - staying on page to prevent redirect loops');
            }
            
            console.log('[SessionManager] Initialized');
            return { success: true };
        } catch (error) {
            console.error('[SessionManager] Initialization failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ============================================================================
    // PUBLIC API
    // ============================================================================

    // PATCH: Synchronous session getter for bootstrap hydration (race-free)
    function getSessionSync() {
        try {
            // Primary: kynecta_auth (used by authStorage.js and the whole app)
            const raw = localStorage.getItem('kynecta_auth');
            if (raw) {
                const auth = JSON.parse(raw);
                if (auth && auth.token) return auth;
            }
            // Fallback: own session key
            const ownRaw = localStorage.getItem(CONFIG.SESSION_KEY);
            if (ownRaw) {
                const session = JSON.parse(ownRaw);
                if (session && session.token) return session;
            }
            return null;
        } catch(e) {
            return null;
        }
    }

    const SessionManager = {
        initialize,
        createSession,
        destroySession,
        logout,
        performAutoLogin,

        getSavedAccounts,
        addAccount,
        removeAccount,
        getMaxAccounts: () => CONFIG.MAX_ACCOUNTS_PER_DEVICE,

        getCurrentSession: () => currentSession || loadSession(),
        getSessionSync,
        isSessionValid: () => {
            const session = getSessionSync() || loadSession();
            return session && session.token && isTokenValid(session.token);
        },
        shouldPromptLogin,
        updateActivity,

        setMaxAccounts: (max) => { CONFIG.MAX_ACCOUNTS_PER_DEVICE = max; },
        setSessionDurationDays: (days) => { CONFIG.SESSION_DURATION_DAYS = days; }
    };

    window.SessionManager = SessionManager;

    // PATCH: Expose getSessionSync on AuthStorage so bootstrap can call it
    if (window.AuthStorage) {
        window.AuthStorage.getSessionSync = getSessionSync;
    } else {
        // AuthStorage not loaded yet — attach when it appears
        Object.defineProperty(window, 'AuthStorage', {
            configurable: true,
            set: function(val) {
                if (val && !val.getSessionSync) val.getSessionSync = getSessionSync;
                Object.defineProperty(window, 'AuthStorage', { value: val, writable: true, configurable: true });
            },
            get: function() { return undefined; }
        });
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initialize());
    } else {
        initialize();
    }
    
    console.log('[SessionManager] Loaded - Max accounts:', CONFIG.MAX_ACCOUNTS_PER_DEVICE);
})();