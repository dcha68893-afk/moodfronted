(function(){
'use strict';
if(!window.Capacitor || typeof window.Capacitor.isNativePlatform!=='function' || !window.Capacitor.isNativePlatform()) return;
const Push=window.Capacitor?.Plugins?.PushNotifications;
if(!Push){
 // Almost always means the native plugin is NOT linked into the APK
 // (package.json lists it but `npx cap sync android` was never run after `npm install`).
 console.error('[NativePush] PushNotifications plugin is not available in this APK - run: npm install && npx cap sync android, then rebuild');
 return;
}

const LS_TOKEN='necpra_fcm_token', LS_AUTH='necpra_fcm_auth', LS_SENT='necpra_fcm_sent_at';
const RESEND_MS=6*60*60*1000; // keep the server's lastSeenAt fresh (it ignores tokens unseen for 90 days)
let fcmToken=localStorage.getItem(LS_TOKEN)||'';
let registeredForAuth='';
let sawAuthThisSession=false;   // never unlink the device just because the session hasn't restored yet at app start
let registering=false;
let pendingUpload=false;
let uploadFails=0;

/* ---------- auth / api ---------- */
function getAuth(){
 try{
  const s=window.Session&&typeof window.Session.getToken==='function'?window.Session.getToken():'';
  if(s&&typeof s==='string'&&s.trim())return s;
 }catch(_){}
 try{
  const raw=localStorage.getItem('kynecta_auth');
  if(raw){const a=JSON.parse(raw);if(a&&typeof a.token==='string'&&a.token)return a.token;}
 }catch(_){}
 return window.authToken||localStorage.getItem('authToken')||localStorage.getItem('accessToken')||localStorage.getItem('token')||'';
}
function isOk(r){
 if(!r)return false;
 if(typeof r.ok==='boolean')return r.ok;          // fetch Response or api.request result
 if(typeof r.success==='boolean')return r.success;
 return true;
}
// Returns true only if the server really accepted the call. The old version
// swallowed every failure, so a rejected token upload was silently lost forever.
async function api(path,method,data,tokenOverride){
 const token=tokenOverride||getAuth(); if(!token)return false;
 try{
  if(window.api?.request?.request){
   const r=await window.api.request.request(path,{method:method||'GET',data,token,headers:{Authorization:'Bearer '+token}});
   if(isOk(r)&&!r?.offline)return true;
  }
 }catch(e){console.warn('[NativePush] api.request failed:',e?.message||e);}
 try{
  const base=window.__getApiBase?window.__getApiBase():'';   // already ends in /api
  if(!base)return false;
  const r=await fetch(base+path,{method:method||'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:data?JSON.stringify(data):undefined});
  return r.ok;
 }catch(e){console.warn('[NativePush] fetch failed:',e?.message||e);return false;}
}

/* ---------- opening what a notification points at ---------- */
function openTarget(data){
 const d=data||{};
 const go=()=>{
  const t=String(d.type||'');
  if(d.chatId)window.dispatchEvent(new CustomEvent('kyn:openChat',{detail:{chatId:d.chatId,scrollToMessageId:d.messageId||null}}));
  else if(d.groupId)window.dispatchEvent(new CustomEvent('kyn:openGroup',{detail:{groupId:d.groupId,scrollToMessageId:d.messageId||null}}));
  else if(d.statusId){
   try{if(typeof window.navigateToPage==='function')window.navigateToPage('status');}catch(_){}
   window.dispatchEvent(new CustomEvent('kyn:openStatus',{detail:{statusId:d.statusId}}));
  }
  else if(t.indexOf('friend')===0){
   try{if(typeof window.navigateToPage==='function')window.navigateToPage('friends');}catch(_){}
  }
 };
 // Cold start from a tap: give the shell time to build its iframes first.
 if(document.readyState!=='complete'||performance.now()<4000)setTimeout(go,2500); else go();
}

/* ---------- in-app banner (Android never shows system notifications while the app is in the foreground) ---------- */
function banner(n){
 if(document.visibilityState!=='visible')return;
 const data=n.data||{};
 if(data.chatId&&document.body?.dataset?.activeChatId===String(data.chatId))return;
 const old=document.getElementById('necpra-native-push-banner'); if(old)old.remove();
 const el=document.createElement('button'); el.id='necpra-native-push-banner'; el.type='button';
 const title=document.createElement('strong'); title.textContent=n.title||'Necpra'; title.style.cssText='display:block;font-size:13px;margin-bottom:2px;';
 const body=document.createElement('span'); body.textContent=n.body||'New notification'; body.style.cssText='display:block;font-weight:500;font-size:13px;opacity:.92;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
 el.appendChild(title); el.appendChild(body);
 el.style.cssText='position:fixed;top:calc(env(safe-area-inset-top,0px) + 10px);left:50%;transform:translateX(-50%);z-index:2147483647;width:min(92%,420px);text-align:left;padding:10px 14px;border:0;border-radius:14px;background:#111827;color:#fff;font-family:system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.3);';
 el.onclick=()=>{openTarget(data);el.remove();};
 (document.body||document.documentElement).appendChild(el);
 setTimeout(()=>{if(el.parentNode)el.remove();},6000);
}

/* ---------- registration ---------- */
async function createChannels(){
 const ch=[
  {id:'messages',name:'Messages',description:'Direct messages',importance:5},
  {id:'group_messages',name:'Group messages',description:'Group conversations',importance:5},
  {id:'status_updates',name:'Status updates',description:'Friend status updates',importance:4},
  {id:'general',name:'Activity',description:'Friend requests, reactions and other activity',importance:4}
 ];
 for(const c of ch){
  await Push.createChannel({...c,sound:'default',vibration:true,visibility:1}).catch(()=>{});
 }
}
async function register(){
 if(registering)return;
 const auth=getAuth(); if(!auth)return;
 registering=true;
 try{
  let p=await Push.checkPermissions();
  if(p.receive==='prompt'||p.receive==='prompt-with-rationale')p=await Push.requestPermissions();
  if(p.receive!=='granted'){console.warn('[NativePush] notification permission not granted:',p.receive);return;}
  await createChannels();
  registeredForAuth=auth;
  await Push.register();   // fires 'registration' with the (possibly unchanged) FCM token
 }catch(e){console.warn('[NativePush] registration failed:',e?.message||e);}
 finally{registering=false;}
}
async function uploadToken(){
 const auth=getAuth(); if(!fcmToken||!auth)return;
 const ok=await api('/push/fcm-token','POST',{token:fcmToken,platform:'android',userAgent:navigator.userAgent},auth);
 if(ok){
  pendingUpload=false; uploadFails=0;
  localStorage.setItem(LS_TOKEN,fcmToken); localStorage.setItem(LS_AUTH,auth); localStorage.setItem(LS_SENT,String(Date.now()));
  console.log('[NativePush] FCM token registered with server');
 }else{
  pendingUpload=true; uploadFails++;
  console.warn('[NativePush] FCM token upload failed (attempt '+uploadFails+') - will retry');
 }
}
async function removeToken(token,auth){
 if(!token||!auth)return;
 await api('/push/fcm-token','DELETE',{token},auth).catch(()=>{});
 localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_AUTH); localStorage.removeItem(LS_SENT);
}

Push.addListener('registration',info=>{
 const t=info&&info.value; if(!t)return;
 fcmToken=t; pendingUpload=true; uploadToken();
});
Push.addListener('registrationError',e=>console.warn('[NativePush] registration error',e));
Push.addListener('pushNotificationReceived',n=>{
 // App is in the foreground: the OS draws nothing, so we show our own banner.
 try{banner({title:n?.title,body:n?.body,data:n?.data});}catch(e){console.warn('[NativePush] banner failed',e);}
});
Push.addListener('pushNotificationActionPerformed',a=>{openTarget(a?.notification?.data||{});});

/* ---------- keep everything in sync ---------- */
async function sync(){
 const auth=getAuth();
 if(!auth){
  // logged out: unlink this device so the previous user stops receiving pushes here
  if(sawAuthThisSession){
   const t=localStorage.getItem(LS_TOKEN), a=localStorage.getItem(LS_AUTH);
   if(t&&a){await removeToken(t,a);}
   registeredForAuth=''; sawAuthThisSession=false;
  }
  return;
 }
 sawAuthThisSession=true;
 if(auth!==registeredForAuth){await register();return;}
 if(pendingUpload&&uploadFails<8){await uploadToken();return;}
 const last=Number(localStorage.getItem(LS_SENT)||0);
 if(fcmToken&&Date.now()-last>RESEND_MS)await uploadToken();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();});
window.addEventListener('online',sync);
window.addEventListener('kyn:chatOpened',()=>setTimeout(register,1500));
window.addEventListener('kyn:firstMessageSent',()=>setTimeout(register,300));
window.addEventListener('LOGOUT',()=>{removeToken(fcmToken||localStorage.getItem(LS_TOKEN),getAuth()||localStorage.getItem(LS_AUTH));});
setInterval(sync,5000);
setTimeout(register,2000);
window.necpraNativePush={register,sync,getToken:()=>fcmToken};
})();
