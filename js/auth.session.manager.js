// js/auth.session.manager.js - Session manager with server-enforced inactivity timeout
// The backend puts the user's Security > Session Timeout into JWT `exp` and
// `sessionTimeoutMs`. This client mirrors that value for local inactivity UX.
(function () {
    'use strict';

    const CONFIG = {
        SESSION_KEY: 'kynecta_session',
        ACCOUNTS_KEY: 'kynecta_saved_accounts',
        MAX_ACCOUNTS_PER_DEVICE: 2,
        SESSION_DURATION_DAYS: 30, // legacy fallback for tokens issued before 2.1.0
        CHECK_INTERVAL: 60000,
        STORAGE_VERSION: '1.3.0',
        ACTIVITY_THROTTLE_MS: 5000
    };

    let currentSession = null;
    let savedAccounts = [];
    let sessionCheckInterval = null;
    let lastActivityTime = Date.now();
    let lastSaveTime = 0;
    let savePending = false;
    let lastActivityCallTime = 0;
    let refreshInProgress = false;
    let initialized = false;

    function decodeJwtPayload(token) {
        try {
            if (!token || typeof token !== 'string') return null;
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
            return JSON.parse(atob(padded));
        } catch (_) {
            return null;
        }
    }

    function getTokenExpiry(token) {
        const payload = decodeJwtPayload(token);
        return payload && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
    }

    function getSessionTimeoutMs(tokenOrSession) {
        const token = typeof tokenOrSession === 'string'
            ? tokenOrSession
            : tokenOrSession && tokenOrSession.token;
        const payload = decodeJwtPayload(token);
        if (payload && Number.isFinite(payload.sessionTimeoutMs) && payload.sessionTimeoutMs > 0) {
            return payload.sessionTimeoutMs;
        }
        return CONFIG.SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
    }

    function getStoredRefreshToken(session) {
        if (session && session.refreshToken) return session.refreshToken;
        try {
            const auth = JSON.parse(localStorage.getItem('kynecta_auth') || '{}');
            if (auth.refreshToken) return auth.refreshToken;
        } catch (_) {}
        return localStorage.getItem('REFRESH_TOKEN') || localStorage.getItem('refreshToken') || null;
    }

    function getSessionExpiry(session) {
        const refresh = getStoredRefreshToken(session);
        return getTokenExpiry(refresh) || getTokenExpiry(session && session.token) || null;
    }

    function isTokenValid(token) {
        const payload = decodeJwtPayload(token);
        if (!payload) return false;
        // Expiry is deliberately checked now. A valid refresh token can still
        // recover an expired access token through _attemptTokenRefresh().
        return !payload.exp || payload.exp * 1000 > Date.now();
    }

    function clearSession() {
        currentSession = null;
        try { localStorage.removeItem(CONFIG.SESSION_KEY); } catch (_) {}
        lastSaveTime = 0;
        savePending = false;
    }

    function loadSession() {
        try {
            const raw = localStorage.getItem(CONFIG.SESSION_KEY);
            if (!raw) return null;
            const session = JSON.parse(raw);
            if (!session || typeof session !== 'object' || !session.token || !session.userId) {
                clearSession();
                return null;
            }
            currentSession = session;
            lastActivityTime = Number(session.lastActivity) || Date.now();
            if (!window.currentUser && session.user) window.currentUser = session.user;
            return session;
        } catch (error) {
            console.warn('[SessionManager] Failed to load session:', error.message);
            return null;
        }
    }

    function performSaveSession() {
        try {
            if (!currentSession) {
                localStorage.removeItem(CONFIG.SESSION_KEY);
                return true;
            }
            const sessionData = {
                ...currentSession,
                lastActivity: lastActivityTime,
                version: CONFIG.STORAGE_VERSION,
                expiresAt: getSessionExpiry(currentSession) || Date.now() + getSessionTimeoutMs(currentSession)
            };
            localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(sessionData));
            lastSaveTime = Date.now();
            return true;
        } catch (error) {
            console.error('[SessionManager] Failed to save session:', error);
            return false;
        }
    }

    function debouncedSaveSession() {
        if (savePending) return;
        const now = Date.now();
        if (now - lastSaveTime < CONFIG.ACTIVITY_THROTTLE_MS) {
            savePending = true;
            setTimeout(() => {
                savePending = false;
                if (currentSession) performSaveSession();
            }, CONFIG.ACTIVITY_THROTTLE_MS - (now - lastSaveTime));
            return;
        }
        performSaveSession();
    }

    function saveSession() { debouncedSaveSession(); }

    function updateActivity() {
        const now = Date.now();
        if (now - lastActivityCallTime < CONFIG.ACTIVITY_THROTTLE_MS) return;
        lastActivityCallTime = now;
        lastActivityTime = now;
        if (currentSession) {
            currentSession.lastActivity = now;
            saveSession();
        }
    }

    function setupActivityTracking() {
        ['click', 'keypress', 'scroll', 'touchstart', 'mousemove'].forEach(event => {
            window.addEventListener(event, updateActivity, { passive: true });
        });
    }

    function loadSavedAccounts() {
        try {
            const raw = localStorage.getItem(CONFIG.ACCOUNTS_KEY);
            savedAccounts = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(savedAccounts)) savedAccounts = [];
        } catch (_) {
            savedAccounts = [];
        }
        return savedAccounts;
    }

    function saveAccounts() {
        try {
            localStorage.setItem(CONFIG.ACCOUNTS_KEY, JSON.stringify(savedAccounts));
            return true;
        } catch (_) {
            return false;
        }
    }

    function addAccount(userData, token) {
        loadSavedAccounts();
        const existingIndex = savedAccounts.findIndex(a => a.userId === userData.id || a.email === userData.email);
        const record = {
            userId: userData.id,
            email: userData.email,
            username: userData.username,
            displayName: userData.displayName || userData.username,
            avatar: userData.avatar,
            token,
            lastUsed: Date.now()
        };
        if (existingIndex >= 0) savedAccounts[existingIndex] = { ...savedAccounts[existingIndex], ...record };
        else {
            if (savedAccounts.length >= CONFIG.MAX_ACCOUNTS_PER_DEVICE) {
                return { success: false, error: `Maximum ${CONFIG.MAX_ACCOUNTS_PER_DEVICE} accounts per device` };
            }
            savedAccounts.push({ ...record, createdAt: Date.now() });
        }
        saveAccounts();
        return { success: true };
    }

    function removeAccount(userId) {
        loadSavedAccounts();
        const before = savedAccounts.length;
        savedAccounts = savedAccounts.filter(a => a.userId !== userId);
        if (before !== savedAccounts.length) {
            saveAccounts();
            if (currentSession && currentSession.userId === userId) clearSession();
            return true;
        }
        return false;
    }

    function getSavedAccounts() {
        loadSavedAccounts();
        return savedAccounts.map(a => ({
            userId: a.userId,
            email: a.email,
            username: a.username,
            displayName: a.displayName,
            avatar: a.avatar,
            lastUsed: a.lastUsed
        }));
    }

    function createSession(userData, token, rememberMe = true) {
        if (!rememberMe) return { success: true, ephemeral: true };
        const sessionData = {
            userId: userData.id || userData.userId,
            email: userData.email,
            username: userData.username,
            displayName: userData.displayName || userData.username,
            avatar: userData.avatar,
            token,
            user: userData,
            createdAt: Date.now(),
            lastActivity: Date.now()
        };
        currentSession = sessionData;
        lastActivityTime = Date.now();
        lastSaveTime = 0;
        performSaveSession();
        return { success: true, accountResult: addAccount(userData, token) };
    }

    function destroySession() {
        clearSession();
        return { success: true };
    }

    async function logout(keepAccount = false) {
        try {
            if (window.api?.auth?.logout) await window.api.auth.logout();
        } catch (error) {
            console.warn('[SessionManager] Logout API call failed:', error.message);
        }
        const userId = currentSession?.userId;
        destroySession();
        ['token', 'accessToken', 'nexopa_token', 'USER_TOKEN', 'currentUser', 'user', 'kynecta_auth'].forEach(k => {
            try { localStorage.removeItem(k); } catch (_) {}
        });
        window.currentUser = null;
        if (!keepAccount && userId) removeAccount(userId);
        if (window.location.pathname.includes('chat.html')) {
            setTimeout(() => { window.location.href = 'index.html'; }, 500);
        }
        return { success: true };
    }

    function shouldPromptLogin() {
        const session = loadSession();
        if (!session) return true;
        const timeout = getSessionTimeoutMs(session);
        const lastActivity = Number(session.lastActivity) || Number(session.createdAt) || Date.now();
        if (Date.now() - lastActivity >= timeout) {
            clearSession();
            return true;
        }
        return false;
    }

    async function _attemptTokenRefresh(session) {
        if (refreshInProgress) return false;
        refreshInProgress = true;
        try {
            if (window.api?.auth?.refreshToken) {
                const result = await window.api.auth.refreshToken();
                if (result && result.success !== false) return true;
            }

            const storedRefresh = getStoredRefreshToken(session);
            if (!storedRefresh) return false;
            const baseUrl = (window.API && window.API.baseUrl) || (window._API_CONFIG && window._API_CONFIG.baseUrl) || 'https://noxopa.onrender.com/api';
            const response = await fetch(`${baseUrl}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: storedRefresh })
            });
            if (!response.ok) return false;
            const data = await response.json();
            const newToken = data.token || data.accessToken;
            if (!data.success || !newToken) return false;
            const newRefresh = data.refreshToken || storedRefresh;

            ['authToken', 'accessToken', 'token', 'nexopa_token', 'USER_TOKEN', 'kynecta_token', 'auth_token'].forEach(k => {
                try { localStorage.removeItem(k); } catch (_) {}
            });
            window.__userToken = null;
            window.__accessToken = null;

            currentSession = { ...session, token: newToken, refreshToken: newRefresh, lastActivity: Date.now() };
            lastActivityTime = Date.now();
            lastSaveTime = 0;
            performSaveSession();

            const authPayload = {
                token: newToken,
                refreshToken: newRefresh,
                user: session.user,
                expiresAt: getTokenExpiry(newRefresh) || getTokenExpiry(newToken) || Date.now() + getSessionTimeoutMs(newToken),
                issuedAt: Date.now()
            };
            if (window.AuthStorage?.saveAuth) window.AuthStorage.saveAuth(authPayload);
            else localStorage.setItem('kynecta_auth', JSON.stringify(authPayload));

            ['authToken', 'accessToken', 'token', 'nexopa_token', 'USER_TOKEN', 'kynecta_token'].forEach(k => {
                try { localStorage.setItem(k, newToken); } catch (_) {}
            });
            ['REFRESH_TOKEN', 'refreshToken'].forEach(k => {
                try { localStorage.setItem(k, newRefresh); } catch (_) {}
            });
            window.__userToken = newToken;
            window.__accessToken = newToken;
            if (window.__SESSION__) {
                window.__SESSION__.token = newToken;
                window.__SESSION__.refreshToken = newRefresh;
            }
            try {
                window.dispatchEvent(new CustomEvent('auth:token:refreshed', { detail: { token: newToken, timestamp: Date.now() } }));
                window.dispatchEvent(new CustomEvent('session:restored', { detail: { token: newToken, user: session.user, timestamp: Date.now() } }));
            } catch (_) {}
            return true;
        } catch (error) {
            console.error('[SessionManager] Refresh error:', error.message);
            return false;
        } finally {
            refreshInProgress = false;
        }
    }

    function endSession(reason) {
        clearSession();
        try {
            window.dispatchEvent(new CustomEvent('auth:session:ended', { detail: { reason, timestamp: Date.now() } }));
        } catch (_) {}
    }

    function startSessionCheck() {
        if (sessionCheckInterval) clearInterval(sessionCheckInterval);
        sessionCheckInterval = setInterval(async () => {
            const session = loadSession();
            if (!session || !session.token) return;
            const timeout = getSessionTimeoutMs(session);
            const lastActivity = Number(session.lastActivity) || Number(session.createdAt) || Date.now();
            if (Date.now() - lastActivity >= timeout) {
                endSession('inactivity_timeout');
                return;
            }
            if (!isTokenValid(session.token)) {
                const refreshed = await _attemptTokenRefresh(session);
                if (!refreshed) endSession('refresh_failed');
            }
        }, CONFIG.CHECK_INTERVAL);

        if (!window.__SESSION_MANAGER_ONLINE_LISTENER__) {
            window.__SESSION_MANAGER_ONLINE_LISTENER__ = true;
            window.addEventListener('online', async () => {
                const session = loadSession();
                if (!session || !session.token) return;
                const timeout = getSessionTimeoutMs(session);
                const lastActivity = Number(session.lastActivity) || Number(session.createdAt) || Date.now();
                if (Date.now() - lastActivity >= timeout) {
                    endSession('inactivity_timeout');
                    return;
                }
                if (!isTokenValid(session.token)) await _attemptTokenRefresh(session);
            });
        }
    }

    async function performAutoLogin() {
        const session = loadSession();
        if (!session) return { success: false, reason: 'no_session' };
        const timeout = getSessionTimeoutMs(session);
        const lastActivity = Number(session.lastActivity) || Number(session.createdAt) || Date.now();
        if (Date.now() - lastActivity >= timeout) {
            endSession('inactivity_timeout');
            return { success: false, reason: 'inactivity_timeout' };
        }
        if (!isTokenValid(session.token)) {
            const refreshed = await _attemptTokenRefresh(session);
            if (!refreshed) {
                endSession('refresh_failed');
                return { success: false, reason: 'invalid_token' };
            }
        }
        const restored = loadSession();
        if (!restored || !restored.user) return { success: false, reason: 'no_user_in_session' };
        window.currentUser = restored.user;
        return { success: true, user: restored.user, token: restored.token };
    }

    async function initialize() {
        if (initialized) return { success: true, alreadyInitialized: true };
        initialized = true;
        setupActivityTracking();
        startSessionCheck();
        loadSavedAccounts();

        try {
            const raw = localStorage.getItem('kynecta_auth');
            const auth = raw ? JSON.parse(raw) : null;
            const valid = (window.AuthStorage?.isValidSession)
                ? window.AuthStorage.isValidSession(auth)
                : !!(auth && auth.token && auth.user && typeof auth.user === 'object');
            if (!valid) return { success: true, sessionCleared: true };

            currentSession = {
                ...auth,
                userId: auth.userId || auth.user?.id || auth.user?.uid,
                lastActivity: auth.lastActivity || Date.now()
            };
            lastActivityTime = currentSession.lastActivity;
            window.__SESSION__ = currentSession;
            window.__IS_LOGGED_IN__ = true;
            window.__SESSION_READY__ = true;
            window.currentUser = auth.user;
            window.__userToken = auth.token;
            window.__accessToken = auth.token;

            // Enforce timeout immediately when reopening the app.
            if (shouldPromptLogin()) return { success: true, sessionExpired: true };
            if (!isTokenValid(auth.token)) await _attemptTokenRefresh(currentSession);
            return { success: true, sessionRestored: true };
        } catch (error) {
            console.error('[SessionManager] Initialization failed:', error);
            return { success: false, error: error.message };
        }
    }

    function getSessionSync() {
        try {
            const raw = localStorage.getItem('kynecta_auth');
            if (raw) {
                const auth = JSON.parse(raw);
                if (auth && auth.token) return auth;
            }
            const ownRaw = localStorage.getItem(CONFIG.SESSION_KEY);
            if (ownRaw) {
                const session = JSON.parse(ownRaw);
                if (session && session.token) return session;
            }
        } catch (_) {}
        return null;
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
            return !!(session && session.token && isTokenValid(session.token) && !shouldPromptLogin());
        },
        shouldPromptLogin,
        updateActivity,
        setMaxAccounts: max => { CONFIG.MAX_ACCOUNTS_PER_DEVICE = max; },
        setSessionDurationDays: days => { CONFIG.SESSION_DURATION_DAYS = days; }
    };

    window.SessionManager = SessionManager;

    if (window.AuthStorage) {
        window.AuthStorage.getSessionSync = getSessionSync;
    } else {
        try {
            Object.defineProperty(window, 'AuthStorage', {
                configurable: true,
                set(val) {
                    if (val && !val.getSessionSync) val.getSessionSync = getSessionSync;
                    Object.defineProperty(window, 'AuthStorage', { value: val, writable: true, configurable: true });
                },
                get() { return undefined; }
            });
        } catch (_) {}
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
    else initialize();
})();