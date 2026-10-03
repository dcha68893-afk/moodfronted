(function(){
'use strict';
if(!window.Capacitor || typeof window.Capacitor.isNativePlatform!=='function' || !window.Capacitor.isNativePlatform()) return;
const Push=window.Capacitor?.Plugins?.PushNotifications;
if(!Push){console.warn('[NativePush] PushNotifications plugin unavailable');return;}
let lastAuth='',lastFcm='';
const getAuth=()=>window.authToken||localStorage.getItem('authToken')||localStorage.getItem('accessToken')||localStorage.getItem('token')||'';
async function api(path,opts){
 const token=getAuth(); if(!token)return;
 if(window.api?.request?.request)return window.api.request.request(path,{method:opts?.method||'GET',data:opts?.data,token,headers:{Authorization:'Bearer '+token}});
 const base=window.__getApiBase?window.__getApiBase():'';
 return fetch(base+path,{method:opts?.method||'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:opts?.data?JSON.stringify(opts.data):undefined});
}
function openTarget(data){
 const d=data||{};
 if(d.chatId)window.dispatchEvent(new CustomEvent('kyn:openChat',{detail:{chatId:d.chatId,scrollToMessageId:d.messageId||null}}));
 else if(d.groupId)window.dispatchEvent(new CustomEvent('kyn:openGroup',{detail:{groupId:d.groupId,scrollToMessageId:d.messageId||null}}));
 else if(d.statusId)window.dispatchEvent(new CustomEvent('kyn:openStatus',{detail:{statusId:d.statusId}}));
}
function banner(n){
 if(document.visibilityState==='visible'){
  if(n.chatId&&document.body?.dataset?.activeChatId===String(n.chatId))return;
  const old=document.getElementById('necpra-native-push-banner'); old?.remove();
  const el=document.createElement('button'); el.id='necpra-native-push-banner'; el.type='button';
  el.textContent=(n.title||'Necpra')+' — '+(n.body||'New notification');
  el.style.cssText='position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:92%;padding:12px 16px;border:0;border-radius:14px;background:#111827;color:#fff;font:600 14px system-ui;box-shadow:0 8px 30px rgba(0,0,0,.25);';
  el.onclick=()=>{openTarget(n.data||{});el.remove();}; document.body.appendChild(el); setTimeout(()=>el.remove(),6000);
 }
}
async function register(){
 const auth=getAuth(); if(!auth)return;
 try{
  let p=await Push.checkPermissions();
  if(p.receive==='prompt')p=await Push.requestPermissions();
  if(p.receive!=='granted')return;
  await Push.createChannel({id:'messages',name:'Messages',description:'Direct messages',importance:5,sound:'default'}).catch(()=>{});
  await Push.createChannel({id:'group_messages',name:'Group messages',description:'Group conversations',importance:5,sound:'default'}).catch(()=>{});
  await Push.createChannel({id:'status_updates',name:'Status updates',description:'Friend status updates',importance:4,sound:'default'}).catch(()=>{});
  await Push.register();
  lastAuth=auth;
 }catch(e){console.warn('[NativePush] registration failed:',e?.message||e);}
}
Push.addListener('registration',async info=>{
 const token=info?.value;if(!token)return;lastFcm=token;
 const auth=getAuth();if(!auth)return;
 await api('/push/fcm-token',{method:'POST',data:{token,platform:'android',userAgent:navigator.userAgent}}).catch(()=>{});
 localStorage.setItem('necpra_fcm_token',token);localStorage.setItem('necpra_fcm_auth',auth);
});
Push.addListener('registrationError',e=>console.warn('[NativePush] registration error',e));
Push.addListener('pushNotificationReceived',n=>{banner(n);});
Push.addListener('pushNotificationActionPerformed',a=>{openTarget(a?.notification?.data||{});});
async function sync(){
 const auth=getAuth();
 if(auth!==lastAuth){
  if(!auth&&lastFcm){await api('/push/fcm-token',{method:'DELETE',data:{token:lastFcm}}).catch(()=>{});lastFcm='';}
  if(auth)await register();
 }
}
window.addEventListener('kyn:chatOpened',()=>setTimeout(register,1500));
window.addEventListener('kyn:firstMessageSent',()=>setTimeout(register,300));
window.addEventListener('LOGOUT',()=>{const token=lastFcm; if(token)api('/push/fcm-token',{method:'DELETE',data:{token}}).catch(()=>{});});
setInterval(sync,5000);setTimeout(register,2000);window.necpraNativePush={register,sync};
})();