// js/auth.session.manager.js - Complete Session Manager for Auto-Login
// Version: 1.1.0 - FIXED: Added throttling to prevent infinite save loop
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
        SESSION_DURATION_DAYS: 1,  // Auto-login expires after 1 day of inactivity
        CHECK_INTERVAL: 60000,      // Check every minute
        STORAGE_VERSION: '1.1.0',
        ACTIVITY_THROTTLE_MS: 5000  // Only save session every 5 seconds max
    };
    
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
            
            // Check if session is expired
            if (session.expiresAt && Date.now() > session.expiresAt) {
                console.log('[SessionManager] Session expired');
                clearSession();
                return null;
            }
            
            // Check if last activity was more than 24 hours ago
            if (session.lastActivity && (Date.now() - session.lastActivity) > (CONFIG.SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000)) {
                console.log('[SessionManager] Session inactive for too long');
                clearSession();
                return null;
            }
            
            console.log('[SessionManager] Session loaded, userId:', session.userId);
            currentSession = session;
            lastActivityTime = session.lastActivity || Date.now();
            return session;
        } catch (error) {
            console.error('[SessionManager] Failed to load session:', error);
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
    // AUTO-LOGIN LOGIC
    // ============================================================================
    async function performAutoLogin() {
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
        
        try {
            localStorage.setItem('token', session.token);
            localStorage.setItem('accessToken', session.token);
            localStorage.setItem('moodchat_token', session.token);
            localStorage.setItem('USER_TOKEN', session.token);
            
            if (session.user) {
                localStorage.setItem('currentUser', JSON.stringify(session.user));
                localStorage.setItem('user', JSON.stringify(session.user));
                window.currentUser = session.user;
            }
            
            const unifiedAuth = {
                token: session.token,
                user: session.user,
                userId: session.userId,
                timestamp: Date.now(),
                validated: true
            };
            localStorage.setItem('kynecta_auth', JSON.stringify(unifiedAuth));
            
            console.log('[SessionManager] Token restored to all storage locations');
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
            console.log('[SessionManager] Auto-login successful, redirecting to chat.html');
            setTimeout(() => {
                window.location.href = 'chat.html';
            }, 500);
        } else if (isOnChatPage) {
            console.log('[SessionManager] Already on chat page, session restored');
        }
        
        return { success: true, user: session.user, token: session.token };
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
    // INITIALIZATION
    // ============================================================================
    async function initialize() {
        console.log('[SessionManager] Initializing...');
        
        setupActivityTracking();
        startSessionCheck();
        loadSavedAccounts();
        
        const isOnIndexPage = window.location.pathname === '/' || 
                              window.location.pathname.includes('index.html');
        
        if (isOnIndexPage) {
            const shouldLogin = shouldPromptLogin();
            if (!shouldLogin) {
                await performAutoLogin();
            } else {
                console.log('[SessionManager] User needs to login - showing login form');
            }
        } else if (window.location.pathname.includes('chat.html')) {
            const session = loadSession();
            if (!session || !isTokenValid(session.token)) {
                console.log('[SessionManager] No valid session on chat page, redirecting to index');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);
            } else {
                try {
                    localStorage.setItem('token', session.token);
                    localStorage.setItem('accessToken', session.token);
                    localStorage.setItem('moodchat_token', session.token);
                    if (session.user) {
                        localStorage.setItem('currentUser', JSON.stringify(session.user));
                        window.currentUser = session.user;
                    }
                    console.log('[SessionManager] Session restored on chat page');
                } catch (error) {}
            }
        }
        
        console.log('[SessionManager] Initialized');
        return { success: true };
    }
    
    // ============================================================================
    // PUBLIC API
    // ============================================================================
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
        isSessionValid: () => {
            const session = loadSession();
            return session && session.token && isTokenValid(session.token);
        },
        shouldPromptLogin,
        updateActivity,
        
        setMaxAccounts: (max) => { CONFIG.MAX_ACCOUNTS_PER_DEVICE = max; },
        setSessionDurationDays: (days) => { CONFIG.SESSION_DURATION_DAYS = days; }
    };
    
    window.SessionManager = SessionManager;
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initialize());
    } else {
        initialize();
    }
    
    console.log('[SessionManager] Loaded - Max accounts:', CONFIG.MAX_ACCOUNTS_PER_DEVICE);
})();