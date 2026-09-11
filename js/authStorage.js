// authStorage.js - Persistent Authentication Storage
// VERSION: 1.4.1 - Persistent two-account switching + explicit saved-account removal
(function () {
    'use strict';

    const AUTH_STORAGE_KEY = 'kynecta_auth';
    const LOGIN_STATE_KEY = 'isLoggedIn';
    const LEGACY_TOKEN_KEYS = ['authToken','accessToken','token','nexopa_token','USER_TOKEN','kynecta_token','auth_token','kyn_token','kyn_access_token'];
    const LEGACY_USER_KEYS = ['currentUser','user','nexopa_user'];
    const ACCOUNT_LIST_KEY = 'kynecta_saved_accounts';
    const MAX_ACCOUNTS = 2;

    function safeParse(raw, fallback = null) { try { return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } }
    function withAuthMutation(fn) { const previous = window.__allowAuthStorageMutation__; window.__allowAuthStorageMutation__ = true; try { return fn(); } finally { window.__allowAuthStorageMutation__ = previous === true; } }
    function getStoredUserId() { const auth = safeParse(localStorage.getItem(AUTH_STORAGE_KEY)); return auth?.user?.id ?? auth?.user?.userId ?? auth?.user?.uid ?? auth?.user?._id ?? null; }

    const NEVER_WIPE_INDEXEDDB = new Set(['nexopa_message_lifecycle_v1']);
    const WIPE_ALLOWLIST = new Set(['nexopa_theme','nexopa_nav_state',ACCOUNT_LIST_KEY]);

    function deleteOneDB(name) {
        return new Promise(resolve => {
            if (NEVER_WIPE_INDEXEDDB.has(name)) return resolve(true);
            try {
                const req = indexedDB.deleteDatabase(name); let settled = false;
                const finish = ok => { if (!settled) { settled = true; resolve(ok); } };
                req.onsuccess = () => finish(true); req.onerror = () => finish(false); req.onblocked = () => setTimeout(() => finish(false), 1500);
            } catch (_) { resolve(false); }
        });
    }
    function wipeIndexedDBData() {
        try {
            if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return;
            indexedDB.databases().then(dbs => Promise.all((dbs || []).map(d => d?.name).filter(Boolean).filter(n => !NEVER_WIPE_INDEXEDDB.has(n)).map(deleteOneDB))).catch(() => {});
        } catch (_) {}
    }
    function wipePreviousAccountData() {
        try {
            withAuthMutation(() => Object.keys(localStorage).forEach(key => { if (!WIPE_ALLOWLIST.has(key)) { try { localStorage.removeItem(key); } catch (_) {} } }));
            sessionStorage.clear();
        } catch (_) {}
        try { window.dispatchEvent(new CustomEvent('kyn:accountSwitchWipe')); } catch (_) {}
        wipeIndexedDBData();
    }

    function getSavedAccounts() {
        const accounts = safeParse(localStorage.getItem(ACCOUNT_LIST_KEY), []);
        return Array.isArray(accounts) ? accounts : [];
    }

    // Register the current login as a reusable account slot. Existing entries
    // are updated in place; a third account is never silently added.
    function registerAccount(data) {
        const user = data?.user || {};
        const userId = user.id ?? user.userId ?? user.uid ?? user._id;
        if (userId == null || !data?.token) return { success:false, error:'Missing account identity' };

        const accounts = getSavedAccounts();
        const id = String(userId);
        const normalized = {
            userId: userId,
            email: user.email || null,
            username: user.username || null,
            displayName: user.displayName || user.username || user.email || `Account ${userId}`,
            avatar: user.avatar || null,
            token: data.token,
            refreshToken: data.refreshToken || null,
            expiresAt: data.expiresAt || null,
            lastUsed: Date.now()
        };
        const index = accounts.findIndex(a => String(a?.userId ?? a?.id ?? '') === id);
        if (index >= 0) {
            accounts[index] = { ...accounts[index], ...normalized };
        } else {
            if (accounts.length >= MAX_ACCOUNTS) {
                return { success:false, error:`This device already has ${MAX_ACCOUNTS} saved accounts` };
            }
            accounts.push(normalized);
        }
        withAuthMutation(() => localStorage.setItem(ACCOUNT_LIST_KEY, JSON.stringify(accounts.slice(0, MAX_ACCOUNTS))));
        return { success:true, accounts:accounts.slice(0, MAX_ACCOUNTS) };
    }

    // Permanently remove one account from the device's saved-account store.
    // This is intentionally separate from clearAuth(): logging out can keep an
    // account available for quick switching, while explicit account removal
    // frees one of the two device slots.
    function removeSavedAccount(userId) {
        const targetId = String(userId ?? '');
        if (!targetId) return { success:false, error:'Missing account identity' };
        const accounts = getSavedAccounts();
        const next = accounts.filter(account => String(account?.userId ?? account?.id ?? '') !== targetId);
        if (next.length === accounts.length) return { success:false, error:'Saved account not found', removed:false, accounts:accounts.slice(0, MAX_ACCOUNTS) };

        try {
            withAuthMutation(() => localStorage.setItem(ACCOUNT_LIST_KEY, JSON.stringify(next.slice(0, MAX_ACCOUNTS))));
            try {
                const legacy = safeParse(localStorage.getItem('kynecta_device_accounts'), []);
                if (Array.isArray(legacy)) {
                    localStorage.setItem('kynecta_device_accounts', JSON.stringify(legacy.filter(account => String(account?.userId ?? account?.id ?? '') !== targetId).slice(0, MAX_ACCOUNTS)));
                }
            } catch (_) {}
            try { window.dispatchEvent(new CustomEvent('auth:saved-account:removed', { detail:{ userId } })); } catch (_) {}
            return { success:true, removed:true, accounts:next.slice(0, MAX_ACCOUNTS) };
        } catch (error) {
            return { success:false, error:error.message || 'Could not remove saved account', removed:false, accounts:accounts.slice(0, MAX_ACCOUNTS) };
        }
    }

    function saveAuth(data) {
        try {
            if (!data?.token) return false;
            const incomingUserId = data.user?.id ?? data.user?.uid ?? data.user?._id ?? null;
            const previousUserId = getStoredUserId();
            if (incomingUserId && previousUserId && String(previousUserId) !== String(incomingUserId)) wipePreviousAccountData();
            const payload = { token:data.token, refreshToken:data.refreshToken || null, user:data.user || null, expiresAt:data.expiresAt || (Date.now()+30*24*60*60*1000), issuedAt:data.issuedAt || Date.now(), savedAt:new Date().toISOString(), _version:'1.4.1' };
            withAuthMutation(() => {
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
                LEGACY_TOKEN_KEYS.forEach(k => { try { localStorage.setItem(k,payload.token); } catch (_) {} });
                LEGACY_USER_KEYS.forEach(k => { try { localStorage.setItem(k,JSON.stringify(payload.user)); } catch (_) {} });
                localStorage.setItem(LOGIN_STATE_KEY,'true');
            });
            const registered = registerAccount(payload);
            if (!registered.success && registered.error?.includes('already has')) {
                const existing = getSavedAccounts();
                const same = existing.some(a => String(a?.userId ?? '') === String(incomingUserId ?? ''));
                if (!same) console.warn('[AuthStorage] Account saved as active session but not added to quick-switch slots:', registered.error);
            }
            return true;
        } catch (e) { console.error('[AuthStorage] saveAuth failed:',e.message); return false; }
    }

    function getAuth() {
        try {
            const parsed = safeParse(localStorage.getItem(AUTH_STORAGE_KEY));
            if (parsed?.token) { if (!window.currentUser && parsed.user) window.currentUser=parsed.user; return parsed; }
            const token = LEGACY_TOKEN_KEYS.map(k => { try { return localStorage.getItem(k); } catch (_) { return null; } }).find(Boolean);
            if (!token) return null;
            const user = safeParse(LEGACY_USER_KEYS.map(k => { try { return localStorage.getItem(k); } catch (_) { return null; } }).find(Boolean));
            return { token, refreshToken:null, user, expiresAt:null, issuedAt:null, _fallback:true };
        } catch (_) { return null; }
    }
    function saveSession(data) { return saveAuth(data); }
    function getSession() { const a=getAuth(); return a ? {token:a.token,refreshToken:a.refreshToken,user:a.user,userId:a.user?.id ?? a.user?.uid ?? null,expiresAt:a.expiresAt,issuedAt:a.issuedAt,authenticated:!!a.token} : null; }
    function clearAuth() {
        try { withAuthMutation(() => { localStorage.removeItem(AUTH_STORAGE_KEY); LEGACY_TOKEN_KEYS.forEach(k=>localStorage.removeItem(k)); LEGACY_USER_KEYS.forEach(k=>localStorage.removeItem(k)); localStorage.removeItem(LOGIN_STATE_KEY); }); return true; }
        catch (_) { return false; }
    }
    function hasValidAuth() { const a=getAuth(); return !!(a?.token && (!a.expiresAt || Date.now()<=a.expiresAt)); }
    function updateAuthTokens({token,refreshToken,expiresAt}) {
        const a=getAuth()||{};
        const ok = saveAuth({...a,token:token||a.token,refreshToken:refreshToken||a.refreshToken,expiresAt:expiresAt||a.expiresAt,issuedAt:Date.now()});
        return ok;
    }
    function getToken() { return getAuth()?.token || null; }
    function getUser() { return getAuth()?.user || null; }
    function isValidSession(s) { return !!(s && typeof s==='object' && typeof s.token==='string' && s.token.length>=10 && s.user && typeof s.user==='object'); }

    function switchAccount(userId) {
        const targetId = String(userId);
        const accounts = getSavedAccounts();
        if (accounts.length > MAX_ACCOUNTS) return {success:false,error:`Maximum ${MAX_ACCOUNTS} accounts per device`};
        const target = accounts.find(a => String(a?.userId ?? a?.id ?? '') === targetId);
        if (!target || !target.token || !target.userId) return {success:false,error:'Account is not registered on this device'};
        const currentId = getStoredUserId();
        if (currentId != null && String(currentId) === targetId) return {success:false,error:'Already using this account'};
        try {
            if (currentId != null) wipePreviousAccountData();
            const user = { id:target.userId, email:target.email, username:target.username, displayName:target.displayName || target.username, avatar:target.avatar };
            const payload = { token:target.token, refreshToken:target.refreshToken || null, user, expiresAt:target.expiresAt || null, issuedAt:Date.now(), savedAt:new Date().toISOString(), _version:'1.4.1' };
            withAuthMutation(() => {
                localStorage.setItem(AUTH_STORAGE_KEY,JSON.stringify(payload));
                LEGACY_TOKEN_KEYS.forEach(k=>{try{localStorage.setItem(k,target.token);}catch(_){}});
                LEGACY_USER_KEYS.forEach(k=>{try{localStorage.setItem(k,JSON.stringify(user));}catch(_){}});
                localStorage.setItem(LOGIN_STATE_KEY,'true');
            });
            window.currentUser=user;
            window.__userToken=target.token;
            window.__accessToken=target.token;
            target.lastUsed=Date.now();
            withAuthMutation(() => localStorage.setItem(ACCOUNT_LIST_KEY,JSON.stringify(accounts.slice(0, MAX_ACCOUNTS))));
            try { window.dispatchEvent(new CustomEvent('auth:account:switched',{detail:{userId:target.userId,user,timestamp:Date.now()}})); } catch (_) {}
            return {success:true,user,token:target.token};
        } catch (e) { return {success:false,error:e.message || 'Account switch failed'}; }
    }

    function getSavedAccountList() {
        const active = getStoredUserId();
        return getSavedAccounts().map(a => ({
            userId:a.userId,
            email:a.email || null,
            username:a.username || null,
            displayName:a.displayName || a.username || a.email || `Account ${a.userId}`,
            avatar:a.avatar || null,
            lastUsed:a.lastUsed || 0,
            active:String(a.userId) === String(active)
        }));
    }

    window.AuthStorage = { saveAuth,saveSession,getAuth,getSession,clearAuth,hasValidAuth,updateAuthTokens,getToken,getUser,isValidSession,wipeAccountData:wipePreviousAccountData,switchAccount,getSavedAccounts:getSavedAccountList,registerAccount,removeSavedAccount,getMaxAccounts:()=>MAX_ACCOUNTS };
    window.api=window.api||{}; window.api.storage=window.AuthStorage;
})();