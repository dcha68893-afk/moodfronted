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

// Native notification layer (grouping, reply, open-chat suppression).
// FIX: this used to be resolved ONCE at script load. If the plugin proxy was not on Capacitor.Plugins yet, Notify stayed
// null for the whole session, the token was uploaded WITHOUT the NecpraNativeNotify marker, and the server then sent
// plain notification-block pushes (no grouping, no inline reply, no heads-up styling). It is now re-resolved on demand.
function resolveNotify(){
 try{
  const C=window.Capacitor; if(!C)return null;
  if(C.Plugins&&C.Plugins.NecpraNotify)return C.Plugins.NecpraNotify;
  const listed=typeof C.isPluginAvailable==='function'&&C.isPluginAvailable('NecpraNotify');
  const inHeaders=Array.isArray(C.PluginHeaders)&&C.PluginHeaders.some(h=>h&&h.name==='NecpraNotify');
  if((listed||inHeaders)&&typeof C.registerPlugin==='function')return C.registerPlugin('NecpraNotify');
 }catch(_){}
 return null;
}
let Notify=resolveNotify();
let notifyLoopsStarted=false;
let uploadedThisSession=false;   // re-send the token once per app start so the server's device record always has the marker
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
   const webStatus=()=>{
    try{if(typeof window.navigateToPage==='function')window.navigateToPage('status');}catch(_){}
    window.dispatchEvent(new CustomEvent('kyn:openStatus',{detail:{statusId:d.statusId}}));
   };
   // Native Status screen first (exact status); web module only as the fallback.
   if(typeof window.__necpraOpenNativeStatus==='function')window.__necpraOpenNativeStatus(d.statusId,d.userId).then(ok=>{if(!ok)webStatus();},webStatus);
   else webStatus();
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
 if(Notify&&(data.type==='message'||data.type==='group_message'))return;   // native layer already showed it
 const cur=currentConversation();
 if(cur&&((cur.kind==='c'&&String(data.chatId)===cur.id)||(cur.kind==='g'&&String(data.groupId)===cur.id)))return;
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
/* ---------- permission UX (WhatsApp-style: explain first, recover from "denied") ---------- */
const LS_RATIONALE='necpra_push_rationale', LS_SETTINGS_NUDGE='necpra_push_settings_nudge';
let permissionState='unknown';
function sheet(opts){
 return new Promise(resolve=>{
  const old=document.getElementById('necpra-push-sheet'); if(old)old.remove();
  const wrap=document.createElement('div'); wrap.id='necpra-push-sheet';
  wrap.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;font-family:system-ui,sans-serif;';
  const card=document.createElement('div');
  card.style.cssText='width:100%;max-width:480px;background:#fff;color:#111827;border-radius:20px 20px 0 0;padding:22px 20px calc(env(safe-area-inset-bottom,0px) + 18px);box-shadow:0 -8px 30px rgba(0,0,0,.25);';
  const h=document.createElement('div'); h.textContent=opts.title; h.style.cssText='font-size:17px;font-weight:700;margin-bottom:8px;';
  const p=document.createElement('div'); p.textContent=opts.body; p.style.cssText='font-size:14px;line-height:1.45;opacity:.85;margin-bottom:18px;';
  const row=document.createElement('div'); row.style.cssText='display:flex;gap:10px;justify-content:flex-end;';
  const done=v=>{wrap.remove();resolve(v);};
  const no=document.createElement('button'); no.type='button'; no.textContent=opts.secondary||'Not now';
  no.style.cssText='border:0;background:transparent;color:#2563eb;font-weight:600;font-size:14px;padding:10px 14px;';
  const yes=document.createElement('button'); yes.type='button'; yes.textContent=opts.primary;
  yes.style.cssText='border:0;background:#2563eb;color:#fff;font-weight:600;font-size:14px;padding:10px 18px;border-radius:12px;';
  no.onclick=()=>done(false); yes.onclick=()=>done(true);
  wrap.addEventListener('click',e=>{if(e.target===wrap)done(false);});
  row.appendChild(no); row.appendChild(yes); card.appendChild(h); card.appendChild(p); card.appendChild(row); wrap.appendChild(card);
  (document.body||document.documentElement).appendChild(wrap);
 });
}
function recentlyShown(key,ms){const t=Number(localStorage.getItem(key)||0);return t&&Date.now()-t<ms;}
async function askRationale(){
 // At most once a day, and never more than 3 times: after that the system prompt / settings sheet take over.
 let st={n:0,at:0}; try{st=JSON.parse(localStorage.getItem(LS_RATIONALE)||'{"n":0,"at":0}');}catch(_){}
 if(st.n>=3||Date.now()-st.at<24*60*60*1000)return false;
 st={n:st.n+1,at:Date.now()}; localStorage.setItem(LS_RATIONALE,JSON.stringify(st));
 return sheet({title:'Turn on notifications?',body:'Get new messages, calls and friend requests even when Necpra is closed. You can change this any time in Settings.',primary:'Continue',secondary:'Not now'});
}
async function offerSettings(channelId){
 if(!Notify||recentlyShown(LS_SETTINGS_NUDGE,3*24*60*60*1000))return;
 localStorage.setItem(LS_SETTINGS_NUDGE,String(Date.now()));
 const go=await sheet({
  title:channelId?'Messages are muted':'Notifications are off',
  body:channelId?'You switched off message notifications for Necpra, so new messages will arrive silently. Turn them back on in Settings.':'Necpra can\'t alert you about new messages. Turn notifications on in Settings to get them when the app is closed.',
  primary:'Open settings',secondary:'Not now'});
 if(go)try{await Notify.openNotificationSettings(channelId?{channelId}:{});}catch(_){}
}
async function ensurePermission(){
 let p=await Push.checkPermissions();
 permissionState=p.receive;
 if(p.receive==='granted')return true;
 if(p.receive==='prompt'||p.receive==='prompt-with-rationale'){
  if(!(await askRationale()))return false;
  p=await Push.requestPermissions(); permissionState=p.receive;
  if(p.receive==='granted')return true;
 }
 if(p.receive==='denied')offerSettings(null);
 return false;
}
async function checkChannels(){
 if(!Notify)return;
 try{const s=await Notify.notificationStatus(); if(s.enabled&&(s.blockedChannels||[]).indexOf('messages')>=0)offerSettings('messages');}catch(_){}
}
async function register(){
 if(registering)return;
 const auth=getAuth(); if(!auth)return;
 registering=true;
 try{
  if(!(await ensurePermission())){console.warn('[NativePush] notification permission not granted:',permissionState);return;}
  await createChannels();
  registeredForAuth=auth;
  await Push.register();   // fires 'registration' with the (possibly unchanged) FCM token
  checkChannels();
 }catch(e){console.warn('[NativePush] registration failed:',e?.message||e);}
 finally{registering=false;}
}
async function uploadToken(){
 const auth=getAuth(); if(!fcmToken||!auth)return;
 const ok=await api('/push/fcm-token','POST',{token:fcmToken,platform:'android',userAgent:navigator.userAgent+((Notify||(Notify=resolveNotify()))?' NecpraNativeNotify/3':'')},auth);
 if(ok){
  pendingUpload=false; uploadFails=0; uploadedThisSession=true;
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
 try{banner({title:n?.title||n?.data?.title,body:n?.body||n?.data?.body,data:n?.data});}catch(e){console.warn('[NativePush] banner failed',e);}
});
Push.addListener('pushNotificationActionPerformed',a=>{openTarget(a?.notification?.data||{});});

/* ---------- keep everything in sync ---------- */
async function sync(){
 if(!Notify){Notify=resolveNotify();if(Notify)startNotifyLoops();}
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
 if(fcmToken&&!uploadedThisSession&&uploadFails<8){await uploadToken();return;}
 const last=Number(localStorage.getItem(LS_SENT)||0);
 if(fcmToken&&Date.now()-last>RESEND_MS)await uploadToken();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){sync();if(permissionState!=='granted'&&getAuth())register();reconcileConversation();pullReplies();}});
window.addEventListener('online',sync);
window.addEventListener('kyn:chatOpened',()=>setTimeout(register,1500));
window.addEventListener('kyn:firstMessageSent',()=>setTimeout(register,300));
window.addEventListener('LOGOUT',()=>{removeToken(fcmToken||localStorage.getItem(LS_TOKEN),getAuth()||localStorage.getItem(LS_AUTH));});
setInterval(sync,5000);
setTimeout(register,2000);

/* ---------- tell the native layer which chat is on screen (suppress its notifications, like WhatsApp) ---------- */
function currentConversation(){
 try{
  const b=document.body; if(!b||document.visibilityState!=='visible')return null;
  if(b.classList.contains('group-panel-active')){
   const g=window.__gcCurrentGroup||{}; const id=g.id??g.groupId??g.chatId??g.conversationId;
   if(id!=null&&id!=='')return {kind:'g',id:String(id)};
  }
  if(b.classList.contains('chat-panel-active')){
   const fr=document.getElementById('messagesIframe');
   const MM=fr&&fr.contentWindow&&fr.contentWindow.MessageModule;
   const id=MM&&MM.getActiveChatId&&MM.getActiveChatId();
   if(id!=null&&id!==''&&!/^pending:/.test(String(id)))return {kind:'c',id:String(id)};
  }
 }catch(_){}
 return null;
}
let lastConv='';
function reconcileConversation(){
 if(!Notify)return;
 const c=currentConversation(); const k=c?c.kind+':'+c.id:'';
 if(k===lastConv)return; lastConv=k;
 Notify.setActiveChat(c||{kind:'',id:''}).catch(()=>{});
}
let lastReceipts=null;
function syncPrivacy(){
 if(!Notify)return;
 try{
  const fr=document.getElementById('messagesIframe');
  const v=fr&&fr.contentWindow&&fr.contentWindow.MessageModule&&fr.contentWindow.MessageModule.getSetting('privacy','readReceipts');
  if(typeof v==='boolean'&&v!==lastReceipts){lastReceipts=v;Notify.setPrivacy({readReceipts:v}).catch(()=>{});}
 }catch(_){}
}

/* ---------- replies typed into a notification: send them through the normal encrypted pipeline ---------- */
let pullingReplies=false;
async function sendReply(r){
 if(r.kind!=='c')return false;   // group replies are not offered on the notification
 const fr=document.getElementById('messagesIframe');
 const w=fr&&fr.contentWindow, MM=w&&w.MessageModule;
 if(!MM||typeof MM.sendMessage!=='function')return false;
 // Don't send until the chat list (recipient) and E2E keys are loaded, or the app would show a failed bubble.
 if(!w.KynectaE2E||typeof w.KynectaE2E.encryptForChat!=='function')return false;
 try{if(!MM.getConversations().some(c=>String(c.chatId)===String(r.id)))return false;}catch(_){return false;}
 try{
  const res=await MM.sendMessage({chatId:/^\d+$/.test(r.id)?Number(r.id):r.id,content:r.text,type:'text'});
  return !(res&&res.success===false);
 }catch(e){console.warn('[NativePush] reply send failed',e?.message||e);return false;}
}
async function pullReplies(attempt){
 attempt=attempt||0;
 if(!Notify||pullingReplies)return;
 if(typeof window.__necpraNativeOwnsDMs==='function'&&window.__necpraNativeOwnsDMs())return;   // native sends DM replies itself
 pullingReplies=true; let retry=false;
 try{
  const out=await Notify.getPendingReplies(); const list=(out&&out.replies)||[];
  for(const r of list){
   if(await sendReply(r)){await Notify.ackReply({rid:r.rid}).catch(()=>{});}
   else retry=true;   // messaging module / chat list / E2E keys not ready yet (cold start): try again shortly
  }
 }catch(_){}
 pullingReplies=false;
 if(retry&&attempt<20)setTimeout(()=>pullReplies(attempt+1),1500);
}
window.addEventListener('necpra:native-notification-reply',()=>setTimeout(()=>pullReplies(0),400));
function startNotifyLoops(){
 if(notifyLoopsStarted||!Notify)return; notifyLoopsStarted=true;
 setInterval(()=>{reconcileConversation();syncPrivacy();},1500);
 window.addEventListener('message',()=>setTimeout(reconcileConversation,50));
 setTimeout(()=>pullReplies(0),3000);
}
startNotifyLoops();
window.necpraNativePush={register,sync,getToken:()=>fcmToken};
})();
