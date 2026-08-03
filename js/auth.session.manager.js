// js/auth.session.manager.js - Complete Session Manager for Auto-Login
// Version: 1.5.0 - Refresh-first 401 handling, no redirect on token expiry + atomic old-token wipe
// Handles: Persistent sessions, auto-login, account limits, logout detection, token refresh

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
            // PATCH: Only validate JWT structure (3 parts) — do NOT check expiry locally.
            // Local expiry checks cause false negatives: a token that is expired but has a
            // valid refresh token will be rejected here, skipping the /api/auth/refresh call
            // entirely and producing a flood of 401 errors.  Expiry enforcement is the
            // server's responsibility; the client must always attempt a silent refresh on 401.
            const parts = token.split('.');
            if (parts.length !== 3) return false;
            // Confirm the payload is decodable (guards against corrupt storage values)
            JSON.parse(atob(parts[1]));
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
            
            // FIX v1.3: If token is expired, try a silent refresh BEFORE clearing.
            // Previously this called clearSession() immediately, which meant the user
            // would have to log in manually every time their JWT expired (even overnight).
            if (!isTokenValid(session.token)) {
                console.log('[SessionManager] Token expired on auto-login — attempting silent refresh');
                const refreshed = await _attemptTokenRefresh(session);
                if (!refreshed) {
                    console.log('[SessionManager] Refresh failed — clearing session');
                    clearSession();
                    return { success: false, reason: 'invalid_token' };
                }
                // Reload session so the rest of this function uses the new token
                const refreshedSession = loadSession();
                if (!refreshedSession) {
                    return { success: false, reason: 'refresh_session_missing' };
                }
                // Re-assign so the code below picks up the fresh token
                Object.assign(session, refreshedSession);
                console.log('[SessionManager] ✅ Token refreshed during auto-login');
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
            localStorage.removeItem('nexopa_token');
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
            // PATCH v1.5: Only redirect to login on EXPLICIT user-initiated logout.
            // Token expiry / refresh failure dispatches auth:session:ended instead,
            // which the UI handles with a modal/banner — not a hard navigation.
            console.log('[SessionManager] Explicit logout complete, redirecting to index');
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
    // TOKEN REFRESH HELPER - attempts silent refresh before giving up
    // ============================================================================
    let _refreshInProgress = false;

    async function _attemptTokenRefresh(session) {
        // Prevent concurrent refresh calls
        if (_refreshInProgress) {
            console.log('[SessionManager] Refresh already in progress, skipping duplicate');
            return false;
        }
        _refreshInProgress = true;

        try {
            // Path 1: delegate to api_auth.js refreshToken() if available
            if (window.api && window.api.auth && typeof window.api.auth.refreshToken === 'function') {
                console.log('[SessionManager] Delegating token refresh to api.auth.refreshToken()');
                const result = await window.api.auth.refreshToken();
                if (result && result.success !== false) {
                    console.log('[SessionManager] ✅ Token refreshed via api.auth');
                    return true;
                }
            }

            // Path 2: call /auth/refresh directly
            const storedRefresh = session.refreshToken
                || localStorage.getItem('REFRESH_TOKEN')
                || localStorage.getItem('refreshToken')
                || (() => {
                    try {
                        const raw = localStorage.getItem('kynecta_auth');
                        return raw ? JSON.parse(raw).refreshToken : null;
                    } catch (_) { return null; }
                })();

            if (!storedRefresh) {
                console.warn('[SessionManager] No refresh token found — cannot refresh');
                return false;
            }

            // Resolve backend base URL the same way api_auth.js does
            const baseUrl = (window.API && window.API.baseUrl)
                || (window._API_CONFIG && window._API_CONFIG.baseUrl)
                || 'https://noxopa.onrender.com/api';

            console.log('[SessionManager] Calling /auth/refresh directly');
            const response = await fetch(`${baseUrl}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: storedRefresh })
            });

            if (!response.ok) {
                console.warn('[SessionManager] Refresh endpoint returned', response.status);
                return false;
            }

            const data = await response.json();
            const newToken = data.token || data.accessToken;
            if (!data.success || !newToken) {
                console.warn('[SessionManager] Refresh response missing token');
                return false;
            }

            const newRefresh = data.refreshToken || storedRefresh;

            // PATCH v1.4: Wipe ALL old token locations atomically before persisting
            // the new ones.  Without this step the legacy keys (authToken, nexopa_token,
            // USER_TOKEN, …) kept holding the expired token value.  Any module that
            // reads those keys directly — including api_core.js and embedded iframes —
            // would then continue sending the expired token and receive 401 errors
            // even though the refresh succeeded.
            const LEGACY_TOKEN_KEYS_SM = ['authToken', 'accessToken', 'token', 'nexopa_token',
                                           'USER_TOKEN', 'kynecta_token', 'auth_token'];
            LEGACY_TOKEN_KEYS_SM.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
            // Also clear window globals so nothing reads a stale in-memory value
            window.__userToken   = null;
            window.__accessToken = null;
            if (window.token !== undefined) { try { window.token = null; } catch(_) {} }

            // Persist new tokens into every storage location the app reads
            const updatedSession = {
                ...session,
                token: newToken,
                refreshToken: newRefresh,
                lastActivity: Date.now()
            };
            currentSession = updatedSession;
            lastSaveTime = 0;
            performSaveSession();

            if (window.AuthStorage && typeof window.AuthStorage.saveAuth === 'function') {
                window.AuthStorage.saveAuth({
                    token: newToken,
                    refreshToken: newRefresh,
                    user: session.user,
                    expiresAt: Date.now() + (24 * 60 * 60 * 1000)
                });
            } else {
                try {
                    const existing = JSON.parse(localStorage.getItem('kynecta_auth') || '{}');
                    localStorage.setItem('kynecta_auth', JSON.stringify({
                        ...existing,
                        token: newToken,
                        refreshToken: newRefresh,
                        issuedAt: Date.now(),
                        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
                    }));
                } catch (_) {}
            }

            // Keep legacy keys in sync
            ['authToken', 'accessToken', 'token', 'nexopa_token', 'USER_TOKEN', 'kynecta_token']
                .forEach(k => { try { localStorage.setItem(k, newToken); } catch (_) {} });
            if (newRefresh !== storedRefresh) {
                ['REFRESH_TOKEN', 'refreshToken']
                    .forEach(k => { try { localStorage.setItem(k, newRefresh); } catch (_) {} });
            }

            // Update global token references read by api_core.js and iframes
            window.__userToken   = newToken;
            window.__accessToken = newToken;
            if (window.__SESSION__) window.__SESSION__.token = newToken;

            // Broadcast so api_auth.js and iframes pick up the new token immediately
            try {
                window.dispatchEvent(new CustomEvent('auth:token:refreshed', {
                    detail: { token: newToken, timestamp: Date.now() }
                }));
                window.dispatchEvent(new CustomEvent('session:restored', {
                    detail: { token: newToken, user: session.user, timestamp: Date.now() }
                }));
            } catch (_) {}

            console.log('[SessionManager] ✅ Token refreshed successfully via direct fetch');
            return true;

        } catch (err) {
            console.error('[SessionManager] _attemptTokenRefresh error:', err.message);
            return false;
        } finally {
            _refreshInProgress = false;
        }
    }

    // ============================================================================
    // PERIODIC SESSION CHECK
    // ============================================================================
    function startSessionCheck() {
        if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
        }

        // FIX v1.3: Use async interval callback so we can await the refresh attempt
        // before deciding to clear the session. Previously this immediately called
        // clearSession() on expiry with no refresh attempt, which nuked the session
        // and caused all subsequent API calls to fail with 401 "Token expired".
        sessionCheckInterval = setInterval(async () => {
            const session = loadSession();
            if (session && session.token) {
                if (!isTokenValid(session.token)) {
                    console.log('[SessionManager] Token expired during periodic check — attempting refresh');

                    const refreshed = await _attemptTokenRefresh(session);
                    if (!refreshed) {
                        console.log('[SessionManager] Refresh failed — clearing session (genuine session end)');
                        clearSession();
                        // Dispatch auth:session:ended (semantic) instead of session:expired
                        // so UI layers know the session is truly over (not just expiry).
                        // UI should show a gentle re-auth prompt, NOT do window.location redirect.
                        try {
                            window.dispatchEvent(new CustomEvent('auth:session:ended', {
                                detail: { reason: 'refresh_failed', timestamp: Date.now() }
                            }));
                        } catch (error) {}
                    } else {
                        console.log('[SessionManager] ✅ Session silently refreshed during periodic check');
                    }
                }
            }
        }, CONFIG.CHECK_INTERVAL);

        // PATCH v1.4: When the device comes back online, immediately attempt a
        // background refresh if the stored token has expired or is expiring soon.
        // This ensures the user who opened the app offline and then reconnected
        // gets a valid token in the background without having to interact at all.
        if (!window.__SESSION_MANAGER_ONLINE_LISTENER__) {
            window.__SESSION_MANAGER_ONLINE_LISTENER__ = true;
            window.addEventListener('online', async () => {
                try {
                    console.log('[SessionManager] 🌐 Back online — checking token validity');
                    const session = loadSession();
                    if (!session || !session.token) return;

                    if (!isTokenValid(session.token)) {
                        console.log('[SessionManager] Token expired — triggering immediate background refresh after reconnect');
                        const refreshed = await _attemptTokenRefresh(session);
                        if (refreshed) {
                            console.log('[SessionManager] ✅ Token refreshed silently after reconnect');
                        } else {
                            console.warn('[SessionManager] ⚠️ Refresh after reconnect failed — session may be invalid');
                        }
                    }
                } catch (err) {
                    console.warn('[SessionManager] Online-event refresh error:', err.message);
                }
            });
        }

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
                    'accessToken', 'nexopa_token', 'USER_TOKEN', 'token',
                    'auth_token', 'auth_user', 'currentUser', 'user',
                    'nexopa_accessToken', 'nexopa_refreshToken', 'nexopa_user',
                    'nexopa_tokenExpiry', 'nexopa_issuedAt', 'nexopa_validated',
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