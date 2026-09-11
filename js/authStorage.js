// authStorage.js - Persistent Authentication Storage
// VERSION: 1.5.2 - Persistent two-account switching + account-scoped local state preservation + hard two-account admission + relogin isolation
(function () {
    'use strict';

    const AUTH_STORAGE_KEY = 'kynecta_auth';
    const LOGIN_STATE_KEY = 'isLoggedIn';
    const LEGACY_TOKEN_KEYS = ['authToken','accessToken','token','nexopa_token','USER_TOKEN','kynecta_token','auth_token','kyn_token','kyn_access_token'];
    const LEGACY_USER_KEYS = ['currentUser','user','nexopa_user'];
    const ACCOUNT_LIST_KEY = 'kynecta_saved_accounts';
    const ACCOUNT_STATE_KEY = 'kynecta_account_state_v1';
    const LAST_ACTIVE_ACCOUNT_KEY = 'kynecta_last_active_account';
    const MAX_ACCOUNTS = 2;
    const OFF_SESSION_FALLBACK_DAYS = 365000;

    function safeParse(raw, fallback = null) { try { return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } }
    function withAuthMutation(fn) { const previous = window.__allowAuthStorageMutation__; window.__allowAuthStorageMutation__ = true; try { return fn(); } finally { window.__allowAuthStorageMutation__ = previous === true; } }
    function getStoredUserId() { const auth = safeParse(localStorage.getItem(AUTH_STORAGE_KEY)); return auth?.user?.id ?? auth?.user?.userId ?? auth?.user?.uid ?? auth?.user?._id ?? null; }
    function getLastActiveAccountId() { try { return localStorage.getItem(LAST_ACTIVE_ACCOUNT_KEY) || null; } catch (_) { return null; } }
    function setLastActiveAccountId(id) { try { if (id == null || id === '') localStorage.removeItem(LAST_ACTIVE_ACCOUNT_KEY); else localStorage.setItem(LAST_ACTIVE_ACCOUNT_KEY, String(id)); } catch (_) {} }
    // FIX-LOGIN-BOUNCE: this helper was dropped in the last edit while still
    // being called from saveAuth()/registerAccount()/removeSavedAccount()/
    // switchAccount() below, so every one of those threw a silent
    // ReferenceError (caught by their own try/catch) and failed without
    // ever persisting to AUTH_STORAGE_KEY. saveAuth() in particular returned
    // false on every login with nothing written to localStorage, while the
    // caller (app.ui.auth.js) redirects to chat.html regardless of that
    // return value — so chat.html booted with zero session, emitted
    // 'missing-session', and force-logged-out once render completed. This
    // restores the function exactly as it existed before it was lost.
    function getSavedAccounts(){const accounts=safeParse(localStorage.getItem(ACCOUNT_LIST_KEY),[]);return Array.isArray(accounts)?accounts:[];}

    function decodeJwtPayload(token) {
        try { if (!token || typeof token !== 'string') return null; const parts=token.split('.'); if(parts.length!==3)return null; const normalized=parts[1].replace(/-/g,'+').replace(/_/g,'/'); const padded=normalized+'='.repeat((4-normalized.length%4)%4); return JSON.parse(atob(padded)); } catch (_) { return null; }
    }
    function propagateOffSessionPolicy(token) {
        const payload=decodeJwtPayload(token); if(!payload||Number(payload.sessionTimeoutMs)!==0)return false;
        const apply=()=>{try{if(window.SessionManager?.setSessionDurationDays){window.SessionManager.setSessionDurationDays(OFF_SESSION_FALLBACK_DAYS);return true;}}catch(_){}return false;};
        if(apply())return true; try{let attempts=0;const timer=setInterval(()=>{attempts++;if(apply()||attempts>=40)clearInterval(timer);},250);}catch(_){} return true;
    }

    const GLOBAL_STORAGE_KEYS = new Set(['nexopa_theme','nexopa_nav_state',ACCOUNT_LIST_KEY,ACCOUNT_STATE_KEY,LAST_ACTIVE_ACCOUNT_KEY]);
    const AUTH_KEYS = new Set([AUTH_STORAGE_KEY,LOGIN_STATE_KEY,...LEGACY_TOKEN_KEYS,...LEGACY_USER_KEYS,'refreshToken','REFRESH_TOKEN','TOKEN_EXPIRY','AUTH_STATE','nexopa_auth_state','nexopa_auth_sync','auth_cross_tab_sync','cross-tab-logout-trigger']);
    function getAccountStateMap(){return safeParse(localStorage.getItem(ACCOUNT_STATE_KEY),{})||{};}
    function captureAccountState(accountId){
        if(accountId==null||String(accountId)==='')return; const id=String(accountId),state={localStorage:{},sessionStorage:{}};
        try{Object.keys(localStorage).forEach(key=>{if(GLOBAL_STORAGE_KEYS.has(key)||AUTH_KEYS.has(key))return;try{state.localStorage[key]=localStorage.getItem(key);}catch(_){}});}catch(_){ }
        try{Object.keys(sessionStorage).forEach(key=>{if(AUTH_KEYS.has(key))return;try{state.sessionStorage[key]=sessionStorage.getItem(key);}catch(_){}});}catch(_){ }
        try{const all=getAccountStateMap();all[id]={...state,savedAt:Date.now()};withAuthMutation(()=>localStorage.setItem(ACCOUNT_STATE_KEY,JSON.stringify(all)));}catch(_){ }
    }
    function restoreAccountState(accountId){
        if(accountId==null||String(accountId)==='')return;const state=getAccountStateMap()[String(accountId)];if(!state)return;
        try{Object.keys(localStorage).forEach(key=>{if(GLOBAL_STORAGE_KEYS.has(key)||AUTH_KEYS.has(key))return;try{localStorage.removeItem(key);}catch(_){}});Object.entries(state.localStorage||{}).forEach(([key,value])=>{if(GLOBAL_STORAGE_KEYS.has(key)||AUTH_KEYS.has(key))return;try{localStorage.setItem(key,value);}catch(_){}});}catch(_){ }
        try{sessionStorage.clear();Object.entries(state.sessionStorage||{}).forEach(([key,value])=>{if(AUTH_KEYS.has(key))return;try{sessionStorage.setItem(key,value);}catch(_){}});}catch(_){ }
    }

    // FIX-ACCOUNT-SWITCH-STALE-MODULE-DATA: 'AppDB' (js/app.cache.js) is the
    // shared cache that backs Calls, Friends/Start-chat, Groups, Status,
    // Tools and Settings. It was previously listed here alongside the E2E
    // message cache, which meant it was NEVER cleared on account switch or
    // relogin — every module kept reading the previous account's rows out
    // of it forever. app.cache.js itself already closes its DB connection
    // on 'versionchange' specifically so deleteDatabase() here can succeed
    // (see the comment on its onversionchange handler) — this key was the
    // only thing stopping that from ever running. Only the E2E message
    // cache (which does its own per-account scoped purge in
    // js/message-local-db.js via the kyn:accountSwitchWipe event below)
    // should stay out of this blanket wipe.
    const NEVER_WIPE_INDEXEDDB=new Set(['nexopa_message_lifecycle_v1']);
    // FIX-ACCOUNT-SWITCH-STALE-MODULE-DATA: indexedDB.databases() (used to
    // discover every DB to wipe) is not implemented in every browser/WebView
    // (notably older Safari/iOS). When it's missing, the code below used to
    // silently do nothing at all — no per-module DB was ever wiped on
    // account switch on those browsers, regardless of NEVER_WIPE_INDEXEDDB.
    // We now also explicitly delete every known per-module/per-account DB by
    // name, so isolation holds even where enumeration isn't supported.
    // FIX-ACCOUNT-SWITCH-RACE: these extra per-module DBs (offline message
    // queue, durable queue layer, cache-repair DB) hold account-specific
    // data but were missing from the wipe list, so browsers without
    // indexedDB.databases() support (or where enumeration is flaky) never
    // cleared them on switch/relogin.
    const KNOWN_ACCOUNT_SCOPED_INDEXEDDB=['AppDB','calls-db','KnectaStatusDB','KnectaToolsDB','kynectaMesh','kyn_stories_v1','kyn_offline_queue','nexopa_dq_v1','nexopa_repair_v1'];
    const WIPE_ALLOWLIST=new Set(['nexopa_theme','nexopa_nav_state',ACCOUNT_LIST_KEY,ACCOUNT_STATE_KEY,LAST_ACTIVE_ACCOUNT_KEY]);
    function deleteOneDB(name){return new Promise(resolve=>{if(NEVER_WIPE_INDEXEDDB.has(name))return resolve(true);try{const req=indexedDB.deleteDatabase(name);let settled=false;const finish=ok=>{if(!settled){settled=true;resolve(ok);}};req.onsuccess=()=>finish(true);req.onerror=()=>finish(false);req.onblocked=()=>setTimeout(()=>finish(false),1500);}catch(_){resolve(false);}});}

    // FIX-ACCOUNT-SWITCH-RACE (root cause of stale calls/messages/friends/
    // status/groups/tools/settings data after switching accounts):
    // indexedDB.deleteDatabase() is asynchronous. This used to be called and
    // then immediately abandoned ("fire and forget") while the caller went
    // straight on to reload/redirect the page on a hardcoded short timer
    // (0ms in switchAccount(), 200-1000ms guesses in app.ui.auth.js). On a
    // loaded device the deletes routinely take longer than that, so the new
    // page loaded before the previous account's IndexedDB rows were
    // actually gone, and every module that reads from AppDB/calls-db/
    // KnectaStatusDB/KnectaToolsDB/kynectaMesh/etc. on boot kept showing the
    // old account's data. wipeIndexedDBData() now RETURNS A PROMISE that
    // only resolves once every delete has settled (bounded by a hard cap so
    // a stuck browser can never hang the UI forever), and every caller that
    // navigates away must await it first — see waitForAccountWipe() below.
    const WIPE_HARD_CAP_MS=2500;
    function wipeIndexedDBData(){
        if(typeof indexedDB==='undefined')return Promise.resolve();
        const tasks=[];
        try{
            // Always attempt the known per-module DBs by name first — this is
            // what makes wiping reliable on browsers without databases().
            tasks.push(...KNOWN_ACCOUNT_SCOPED_INDEXEDDB.filter(n=>!NEVER_WIPE_INDEXEDDB.has(n)).map(deleteOneDB));
            // Then, where supported, also sweep anything else so future new
            // per-module DBs don't need a code change here to be covered.
            if(typeof indexedDB.databases==='function'){
                tasks.push(indexedDB.databases().then(dbs=>Promise.all((dbs||[]).map(d=>d?.name).filter(Boolean).filter(n=>!NEVER_WIPE_INDEXEDDB.has(n)).map(deleteOneDB))).catch(()=>{}));
            }
        }catch(_){}
        const settle=Promise.all(tasks).catch(()=>{});
        const timeout=new Promise(resolve=>setTimeout(resolve,WIPE_HARD_CAP_MS));
        return Promise.race([settle,timeout]);
    }
    // Tracks the in-flight (or most recently completed) account wipe so any
    // code that's about to navigate to another page/module can await it
    // instead of guessing at a delay. Always resolves (never rejects/hangs
    // past WIPE_HARD_CAP_MS).
    let _pendingAccountWipe=Promise.resolve();
    function waitForAccountWipe(){return _pendingAccountWipe;}
    function wipePreviousAccountData(){const previousUserId=getStoredUserId();if(previousUserId!=null)captureAccountState(previousUserId);try{withAuthMutation(()=>Object.keys(localStorage).forEach(key=>{if(!WIPE_ALLOWLIST.has(key)){try{localStorage.removeItem(key);}catch(_){}}}));sessionStorage.clear();}catch(_){}try{window.dispatchEvent(new CustomEvent('kyn:accountSwitchWipe',{detail:{previousUserId}}));}catch(_){}_pendingAccountWipe=wipeIndexedDBData();return _pendingAccountWipe;}

    // FIX-ACCOUNT-SWITCH-IFRAME-SCOPE: chat.html hosts Messages, Status,
    // Groups, Friends, Calls, Settings and Tools each in their OWN iframe
    // (see chat.html's "IFrame Containers" block), each a separate window/
    // document. This file gets dynamically injected into whichever iframe
    // calls switchAccount() (e.g. Settings, via settings-ui.local-first.patch.js
    // loading /js/authStorage.js into its own document). A plain
    // window.location.reload() there only reloads that ONE iframe — it never
    // reaches the parent shell or any sibling iframe, which is exactly why
    // switching from Settings made only Settings itself pick up the new
    // account while Calls/Friends/Status/Groups/Tools and the parent kept
    // showing the old one. Reload the top-level shell instead: that tears
    // down and recreates every iframe fresh, so every module boots against
    // the new account's (already-restored) localStorage/IndexedDB state.
    function reloadAppShell(){
        try{
            const top=(window.top&&window.top!==window)?window.top:window;
            top.location.reload();
        }catch(_){
            // Cross-origin/sandboxed access can throw; fall back to reloading
            // just this frame so it at least recovers instead of doing nothing.
            try{window.location.reload();}catch(__){}
        }
    }
    function registerAccount(data){
        const user=data?.user||{},userId=user.id??user.userId??user.uid??user._id;if(userId==null||!data?.token)return{success:false,error:'Missing account identity'};
        const accounts=getSavedAccounts(),id=String(userId);const normalized={userId,email:user.email||null,username:user.username||null,displayName:user.displayName||user.username||user.email||`Account ${userId}`,avatar:user.avatar||null,token:data.token,refreshToken:data.refreshToken||null,expiresAt:Object.prototype.hasOwnProperty.call(data,'expiresAt')?data.expiresAt:null,lastUsed:Date.now()};
        const index=accounts.findIndex(a=>String(a?.userId??a?.id??'')===id);if(index>=0)accounts[index]={...accounts[index],...normalized};else{if(accounts.length>=MAX_ACCOUNTS)return{success:false,error:`This device already has ${MAX_ACCOUNTS} saved accounts`};accounts.push(normalized);}withAuthMutation(()=>localStorage.setItem(ACCOUNT_LIST_KEY,JSON.stringify(accounts.slice(0,MAX_ACCOUNTS))));propagateOffSessionPolicy(data.token);return{success:true,accounts:accounts.slice(0,MAX_ACCOUNTS)};
    }
    function removeSavedAccount(userId){
        const targetId=String(userId??'');if(!targetId)return{success:false,error:'Missing account identity'};const accounts=getSavedAccounts(),next=accounts.filter(account=>String(account?.userId??account?.id??'')!==targetId);if(next.length===accounts.length)return{success:false,error:'Saved account not found',removed:false,accounts:accounts.slice(0,MAX_ACCOUNTS)};
        try{withAuthMutation(()=>{localStorage.setItem(ACCOUNT_LIST_KEY,JSON.stringify(next.slice(0,MAX_ACCOUNTS)));const all=getAccountStateMap();delete all[targetId];localStorage.setItem(ACCOUNT_STATE_KEY,JSON.stringify(all));});try{const legacy=safeParse(localStorage.getItem('kynecta_device_accounts'),[]);if(Array.isArray(legacy))localStorage.setItem('kynecta_device_accounts',JSON.stringify(legacy.filter(a=>String(a?.userId??a?.id??'')!==targetId).slice(0,MAX_ACCOUNTS)));}catch(_){}try{window.dispatchEvent(new CustomEvent('auth:saved-account:removed',{detail:{userId}}));}catch(_){}return{success:true,removed:true,accounts:next.slice(0,MAX_ACCOUNTS)};}catch(error){return{success:false,error:error.message||'Could not remove saved account',removed:false,accounts:accounts.slice(0,MAX_ACCOUNTS)};}
    }

    function saveAuth(data){
        try{
            if(!data?.token)return false;const incomingUserId=data.user?.id??data.user?.uid??data.user?._id??null;const previousUserId=getStoredUserId();const lastActiveId=getLastActiveAccountId();const accounts=getSavedAccounts();const alreadySaved=accounts.some(a=>String(a?.userId??a?.id??'')===String(incomingUserId??''));
            if(incomingUserId!=null&&!alreadySaved&&accounts.length>=MAX_ACCOUNTS){console.warn(`[AuthStorage] Login blocked: maximum ${MAX_ACCOUNTS} saved accounts per device reached.`);try{window.dispatchEvent(new CustomEvent('auth:account-limit-reached',{detail:{maxAccounts:MAX_ACCOUNTS}}));}catch(_){}return false;}
            // If the previous account was explicitly logged out, auth storage is
            // empty but its application caches remain. Capture and clear that
            // previous account before admitting a different account.
            if(incomingUserId&&previousUserId&&String(previousUserId)!==String(incomingUserId))wipePreviousAccountData();
            else if(incomingUserId&&lastActiveId&&String(lastActiveId)!==String(incomingUserId)&&!previousUserId){captureAccountState(lastActiveId);try{withAuthMutation(()=>Object.keys(localStorage).forEach(key=>{if(!WIPE_ALLOWLIST.has(key)){try{localStorage.removeItem(key);}catch(_){}}}));sessionStorage.clear();}catch(_){}_pendingAccountWipe=wipeIndexedDBData();}
            const expiresAt=Object.prototype.hasOwnProperty.call(data,'expiresAt')?data.expiresAt:(Date.now()+30*24*60*60*1000);const payload={token:data.token,refreshToken:data.refreshToken||null,user:data.user||null,expiresAt,issuedAt:data.issuedAt||Date.now(),savedAt:new Date().toISOString(),_version:'1.5.2'};
            withAuthMutation(()=>{localStorage.setItem(AUTH_STORAGE_KEY,JSON.stringify(payload));LEGACY_TOKEN_KEYS.forEach(k=>{try{localStorage.setItem(k,payload.token);}catch(_){}});LEGACY_USER_KEYS.forEach(k=>{try{localStorage.setItem(k,JSON.stringify(payload.user));}catch(_){}});localStorage.setItem(LOGIN_STATE_KEY,'true');});propagateOffSessionPolicy(payload.token);registerAccount(payload);setLastActiveAccountId(incomingUserId);return true;
        }catch(e){console.error('[AuthStorage] saveAuth failed:',e.message);return false;}
    }

    function getAuth(){try{const parsed=safeParse(localStorage.getItem(AUTH_STORAGE_KEY));if(parsed?.token){if(!window.currentUser&&parsed.user)window.currentUser=parsed.user;propagateOffSessionPolicy(parsed.token);return parsed;}const token=LEGACY_TOKEN_KEYS.map(k=>{try{return localStorage.getItem(k);}catch(_){return null;}}).find(Boolean);if(!token)return null;const user=safeParse(LEGACY_USER_KEYS.map(k=>{try{return localStorage.getItem(k);}catch(_){return null;}}).find(Boolean));propagateOffSessionPolicy(token);return{token,refreshToken:null,user,expiresAt:null,issuedAt:null,_fallback:true};}catch(_){return null;}}
    function saveSession(data){return saveAuth(data);}
    function getSession(){const a=getAuth();return a?{token:a.token,refreshToken:a.refreshToken,user:a.user,userId:a.user?.id??a.user?.uid??null,expiresAt:a.expiresAt,issuedAt:a.issuedAt,authenticated:!!a.token}:null;}
    function clearAuth(){try{const active=getStoredUserId();if(active!=null){captureAccountState(active);setLastActiveAccountId(active);}withAuthMutation(()=>{localStorage.removeItem(AUTH_STORAGE_KEY);LEGACY_TOKEN_KEYS.forEach(k=>localStorage.removeItem(k));LEGACY_USER_KEYS.forEach(k=>localStorage.removeItem(k));localStorage.removeItem(LOGIN_STATE_KEY);});return true;}catch(_){return false;}}
    function hasValidAuth(){const a=getAuth();return!!(a?.token&&(!a.expiresAt||Date.now()<=a.expiresAt));}
    function updateAuthTokens({token,refreshToken,expiresAt}){const a=getAuth()||{};const nextExpiresAt=arguments[0]&&Object.prototype.hasOwnProperty.call(arguments[0],'expiresAt')?expiresAt:a.expiresAt;return saveAuth({...a,token:token||a.token,refreshToken:refreshToken||a.refreshToken,expiresAt:nextExpiresAt,issuedAt:Date.now()});}
    function getToken(){return getAuth()?.token||null;}function getUser(){return getAuth()?.user||null;}function isValidSession(s){return!!(s&&typeof s==='object'&&typeof s.token==='string'&&s.token.length>=10&&s.user&&typeof s.user==='object');}

    function switchAccount(userId){
        const targetId=String(userId),accounts=getSavedAccounts();if(accounts.length>MAX_ACCOUNTS)return{success:false,error:`Maximum ${MAX_ACCOUNTS} accounts per device`};const target=accounts.find(a=>String(a?.userId??a?.id??'')===targetId);if(!target||!target.token||!target.userId)return{success:false,error:'Account is not registered on this device'};const currentId=getStoredUserId();if(currentId!=null&&String(currentId)===targetId)return{success:false,error:'Already using this account'};
        try{
            if(currentId!=null)wipePreviousAccountData();const user={id:target.userId,email:target.email,username:target.username,displayName:target.displayName||target.username,avatar:target.avatar};const payload={token:target.token,refreshToken:target.refreshToken||null,user,expiresAt:Object.prototype.hasOwnProperty.call(target,'expiresAt')?target.expiresAt:null,issuedAt:Date.now(),savedAt:new Date().toISOString(),_version:'1.5.2'};
            withAuthMutation(()=>{localStorage.setItem(AUTH_STORAGE_KEY,JSON.stringify(payload));LEGACY_TOKEN_KEYS.forEach(k=>{try{localStorage.setItem(k,target.token);}catch(_){}});LEGACY_USER_KEYS.forEach(k=>{try{localStorage.setItem(k,JSON.stringify(user));}catch(_){}});localStorage.setItem(LOGIN_STATE_KEY,'true');});restoreAccountState(target.userId);withAuthMutation(()=>{localStorage.setItem(AUTH_STORAGE_KEY,JSON.stringify(payload));LEGACY_TOKEN_KEYS.forEach(k=>{try{localStorage.setItem(k,target.token);}catch(_){}});LEGACY_USER_KEYS.forEach(k=>{try{localStorage.setItem(k,JSON.stringify(user));}catch(_){}});localStorage.setItem(LOGIN_STATE_KEY,'true');});setLastActiveAccountId(target.userId);propagateOffSessionPolicy(target.token);window.currentUser=user;window.__userToken=target.token;window.__accessToken=target.token;target.lastUsed=Date.now();withAuthMutation(()=>localStorage.setItem(ACCOUNT_LIST_KEY,JSON.stringify(accounts.slice(0,MAX_ACCOUNTS))));try{window.dispatchEvent(new CustomEvent('auth:account:switched',{detail:{userId:target.userId,user,timestamp:Date.now()}}));}catch(_){}try{window.__ACCOUNT_SWITCH_RELOAD__=true;waitForAccountWipe().then(reloadAppShell).catch(reloadAppShell);}catch(_){}return{success:true,user,token:target.token};
        }catch(e){return{success:false,error:e.message||'Account switch failed'};}
    }
    function getSavedAccountList(){const active=getStoredUserId();return getSavedAccounts().map(a=>({userId:a.userId,email:a.email||null,username:a.username||null,displayName:a.displayName||a.username||a.email||`Account ${a.userId}`,avatar:a.avatar||null,lastUsed:a.lastUsed||0,active:String(a.userId)===String(active)}));}
    window.AuthStorage={saveAuth,saveSession,getAuth,getSession,clearAuth,hasValidAuth,updateAuthTokens,getToken,getUser,isValidSession,wipeAccountData:wipePreviousAccountData,switchAccount,getSavedAccounts:getSavedAccountList,registerAccount,removeSavedAccount,getMaxAccounts:()=>MAX_ACCOUNTS,getAccountState:()=>getAccountStateMap(),waitForAccountWipe};window.api=window.api||{};window.api.storage=window.AuthStorage;try{propagateOffSessionPolicy(safeParse(localStorage.getItem(AUTH_STORAGE_KEY))?.token||null);}catch(_){}
})();