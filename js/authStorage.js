// authStorage.js - Persistent Authentication Storage
// VERSION: 1.3.0 - account-isolated two-account switching
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

    // Message history is deliberately NOT wiped on account switches. The
    // message DB stores every record with accountId, so account A and B can
    // safely retain their own history on the same physical device.
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

    function saveAuth(data) {
        try {
            if (!data?.token) return false;
            const incomingUserId = data.user?.id ?? data.user?.uid ?? data.user?._id ?? null;
            const previousUserId = getStoredUserId();
            if (incomingUserId && previousUserId && String(previousUserId) !== String(incomingUserId)) wipePreviousAccountData();
            const payload = { token:data.token, refreshToken:data.refreshToken || null, user:data.user || null, expiresAt:data.expiresAt || (Date.now()+30*24*60*60*1000), issuedAt:data.issuedAt || Date.now(), savedAt:new Date().toISOString(), _version:'1.3.0' };
            withAuthMutation(() => {
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
                LEGACY_TOKEN_KEYS.forEach(k => { try { localStorage.setItem(k,payload.token); } catch (_) {} });
                LEGACY_USER_KEYS.forEach(k => { try { localStorage.setItem(k,JSON.stringify(payload.user)); } catch (_) {} });
                localStorage.setItem(LOGIN_STATE_KEY,'true');
            });
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
    function updateAuthTokens({token,refreshToken,expiresAt}) { const a=getAuth()||{}; return saveAuth({...a,token:token||a.token,refreshToken:refreshToken||a.refreshToken,expiresAt:expiresAt||a.expiresAt,issuedAt:Date.now()}); }
    function getToken() { return getAuth()?.token || null; }
    function getUser() { return getAuth()?.user || null; }
    function isValidSession(s) { return !!(s && typeof s==='object' && typeof s.token==='string' && s.token.length>=10 && s.user && typeof s.user==='object'); }

    // Explicit account switch: swap the active credentials without invoking
    // saveAuth()'s cross-account wipe. This is the path the Settings UI can
    // call for a true quick switch. It never deletes account A's message cache.
    function switchAccount(userId) {
        const targetId = String(userId);
        const accounts = safeParse(localStorage.getItem(ACCOUNT_LIST_KEY), []);
        if (!Array.isArray(accounts)) return {success:false,error:'Saved accounts are invalid'};
        if (accounts.length > MAX_ACCOUNTS) return {success:false,error:`Maximum ${MAX_ACCOUNTS} accounts per device`};
        const target = accounts.find(a => String(a?.userId ?? a?.id ?? '') === targetId);
        if (!target || !target.token || !target.userId) return {success:false,error:'Account is not registered on this device'};
        try {
            const user = { id:target.userId, email:target.email, username:target.username, displayName:target.displayName || target.username, avatar:target.avatar };
            const payload = { token:target.token, refreshToken:target.refreshToken || null, user, expiresAt:target.expiresAt || (Date.now()+30*24*60*60*1000), issuedAt:Date.now(), savedAt:new Date().toISOString(), _version:'1.3.0' };
            withAuthMutation(() => {
                localStorage.setItem(AUTH_STORAGE_KEY,JSON.stringify(payload));
                LEGACY_TOKEN_KEYS.forEach(k=>{try{localStorage.setItem(k,target.token);}catch(_){}});
                LEGACY_USER_KEYS.forEach(k=>{try{localStorage.setItem(k,JSON.stringify(user));}catch(_){}});
                localStorage.setItem(LOGIN_STATE_KEY,'true');
            });
            window.currentUser=user;
            window.__userToken=target.token;
            window.__accessToken=target.token;
            try { window.dispatchEvent(new CustomEvent('auth:account:switched',{detail:{userId:target.userId,user,timestamp:Date.now()}})); } catch (_) {}
            target.lastUsed=Date.now();
            localStorage.setItem(ACCOUNT_LIST_KEY,JSON.stringify(accounts));
            return {success:true,user,token:target.token};
        } catch (e) { return {success:false,error:e.message || 'Account switch failed'}; }
    }

    window.AuthStorage = { saveAuth,saveSession,getAuth,getSession,clearAuth,hasValidAuth,updateAuthTokens,getToken,getUser,isValidSession,wipeAccountData:wipePreviousAccountData,switchAccount,getMaxAccounts:()=>MAX_ACCOUNTS };
    window.api=window.api||{}; window.api.storage=window.AuthStorage;
})();