// Kynecta service worker — v19.8.0
// Critical runtime/theme/encryption assets are network-first so an installed
// PWA cannot silently execute week-old code after a deploy.
'use strict';

// FIX (STALE-CACHE-AFTER-E2E-FIX): CACHE_NAME must be bumped every session
// that touches JS/CSS/HTML, or an already-installed service worker keeps
// serving the old cached copy of a just-fixed file (stale-while-revalidate
// shows the OLD version immediately, the fixed one only lands on the NEXT
// load) — this exact class of "fix isn't showing live" has bitten this app
// before. Bumped here because this session's js/e2e-encryption.js and
// js/e2e-session-init.js changes (registerPendingDecrypt / X3DH queue fix)
// would otherwise keep being served stale.
const SW_VERSION = '19.8.0';
const CACHE_NAME = 'nexopa-static-v31';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const CORE_STATIC_ASSETS = [
  '/index.html','/manifest.json','/icons/nexopa-192.png','/icons/nexopa-512.png',
  '/Tool.css','/Tool-ui.js','/Tool-core.part1.js','/Tool-core.part2.js','/Tool-core.part3.js',
  '/group-ui.js','/group-core-bootstrap.js','/group-core-operations.js','/group-core-bridge.js',
  '/friend.html','/chat.html','/calls.html',
  '/calls-core.part1.js','/calls-core.part2.js','/calls-core.part3.js','/calls-core.part4.js',
  '/calls-core.part5.js','/calls-core.part6.js','/calls-core.part7.js','/calls-core.part8.js',
  '/calls-ui.js','/calls.css','/callSession.manager.js','/callRetry.engine.js','/localStore.calls.js',
  '/js/api.core.js','/js/api.request.js','/js/api.auth.js','/js/api.messages.js',
  '/js/app.core.bootstrap.js','/js/app.core.session.js','/js/app.core.ui.js','/js/app.ui.auth.js',
  '/js/app.cache.js','/js/authStorage.js','/js/app.offline.queue.js','/js/auth.session.manager.js',
  '/js/app.runtime.authority.js','/js/auth.account.limit.js','/js/app.offline.bootstrap.js',
  '/friend.css','/css/suppress-webgl.css'
];

const NETWORK_FIRST_PATTERNS = [
  /\/js\/theme\.engine\.js/i,
  /\/theme\.colors\.css/i,
  /\/js\/e2e-encryption\.js/i,
  /\/js\/e2e-session-init\.js/i,
  /\/js\/double-ratchet\.js/i,
  /\/js\/e2e-ratchet\.js/i,
  /\/js\/api\.auth\.js/i,
  /\/js\/app\.core\.session\.js/i,
  /\/js\/app\.core\.bootstrap\.js/i,
  /\/js\/auth\.session\.manager\.js/i,
  /\/js\/authStorage\.js/i,
  /\/js\/app\.ui\.auth\.js/i,
  /\/js\/app\.realtime\.socket\.js/i,
  /\/js\/app\.runtime\.authority\.js/i,
  /\/js\/api\.core\.js/i,
  /\/js\/messages-core\.js/i,
  /\/js\/messages-ui\.js/i,
  /\/MessageLifecycleClient\.js/i,
  /\/messages-core\.bootstrap\.js/i,
  /\/messages-core\.operations\.js/i,
  /\/messages-core\.ui-bridge\.js/i,
  /\/messageSync\.engine\.js/i,
  /\/status-core-runtime\.js/i,
  /\/status-core\.part[1-3]\.js/i,
  /\/status-core-transport\.js/i,
  /\/status-core-state\.js/i,
  /\/status-ui\.js/i,
  /\/group-ui\.js/i,
  /\/group-core-bootstrap\.js/i,
  /\/group-core-operations\.js/i,
  /\/group-core-bridge\.js/i,
  /\/friend-core\.ui-bridge\.js/i,
  /\/Tool-core\.part3\.js/i,
  /\/Tool-ui\.js/i,
  /\/pwa-manager\.js/i,
  /\/js\/kynecta\.safety\.layer\.js/i,
  /\/calls-core\.part[1-8]\.js/i,
  /\/calls-ui\.js/i,
  /\/callSession\.manager\.js/i,
  /\/callRetry\.engine\.js/i
];

const BYPASS_PATTERNS = [
  /\/api\//i,/\/auth\//i,/\/backend\//i,/\/server\//i,/\/socket\.io\//i,
  /\/ws\//i,/\/wss\//i,/\/graphql/i,/\/webhook/i,/^https?:\/\/api\./i,
  /noxopa\.onrender\.com/i,/onrender\.com\/health/i,/\.onrender\.com\/api/i,
  /www\.google\.com\/generate_204/i,/cloudflare\.com\/cdn-cgi/i
];

const STATIC_PATTERNS = [
  /\.(css|js|json|png|jpg|jpeg|svg|ico|woff2|woff|ttf|webp|gif|map)$/i,
  /\/icons\//i,/\/images\//i,/\/fonts\//i,/\/static\//i,/\/webfonts\//i
];

function isApi(url){return BYPASS_PATTERNS.some(p=>p.test(url));}
function isNetworkFirst(url){return NETWORK_FIRST_PATTERNS.some(p=>p.test(url));}
function isStatic(url){return STATIC_PATTERNS.some(p=>p.test(url));}
function local(url){try{return new URL(url,self.location.origin).origin===self.location.origin;}catch(_){return false;}}
function stale(res){try{const d=res.headers.get('date');return d&&(Date.now()-new Date(d).getTime()>CACHE_MAX_AGE);}catch(_){return false;}}

const OFFLINE_SHELL='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nexopa - Offline</title></head><body><main style="font-family:system-ui;text-align:center;padding:4rem"><h1>Nexopa</h1><p>You are offline.</p><button onclick="location.reload()">Try again</button></main></body></html>';

async function navigation(request){
  const cache=await caches.open(CACHE_NAME);
  try{const r=await fetch(request);if(r.ok){cache.put(request.url,r.clone()).catch(()=>{});return r;}}catch(_){}
  const exact=await cache.match(request);if(exact)return exact;
  for(const u of ['/index.html','/','/friend.html','/chat.html']){const r=await cache.match(new URL(u,self.location.origin).href);if(r)return r;}
  return new Response(OFFLINE_SHELL,{status:200,headers:{'Content-Type':'text/html;charset=utf-8'}});
}

async function networkFirst(request){
  const cache=await caches.open(CACHE_NAME);
  try{
    const r=await fetch(request,{cache:'no-store'});
    if(r.ok){await cache.put(request,r.clone()).catch(()=>{});return r;}
    const old=await cache.match(request);return old||r;
  }catch(_){
    const old=await cache.match(request);
    return old||new Response('Resource unavailable offline',{status:503});
  }
}

async function staticAsset(request){
  const cache=await caches.open(CACHE_NAME);
  const old=await cache.match(request);
  if(old&&!stale(old))return old;
  try{
    const r=await fetch(request);
    if(r.ok)await cache.put(request,r.clone()).catch(()=>{});
    return r.ok?r:(old||r);
  }catch(_){return old||new Response('Resource unavailable offline',{status:503});}
}

async function api(request){
  try{return await fetch(request);}catch(_){return new Response(JSON.stringify({error:'Network request failed',offline:true}),{status:503,headers:{'Content-Type':'application/json'}});}
}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>Promise.all(CORE_STATIC_ASSETS.map(a=>fetch(a,{cache:'no-store',credentials:'same-origin'}).then(r=>r.ok?cache.put(a,r):null).catch(()=>null)))).then(()=>console.log('[SW] Installed '+SW_VERSION)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n!==CACHE_NAME).map(n=>caches.delete(n)))).then(()=>self.clients.claim()).then(()=>self.clients.matchAll({type:'window',includeUncontrolled:true})).then(cs=>cs.forEach(c=>c.postMessage({type:'SW_UPDATED',version:SW_VERSION}))));
});

self.addEventListener('fetch',event=>{
  const r=event.request,url=r.url;
  if(r.method!=='GET')return;
  if(r.mode==='navigate'||r.destination==='document'){event.respondWith(navigation(r));return;}
  if(isApi(url)){event.respondWith(api(r));return;}
  if(local(url)&&isNetworkFirst(url)){event.respondWith(networkFirst(r));return;}
  if(local(url)&&isStatic(url)){event.respondWith(staticAsset(r));return;}
  event.respondWith(fetch(r).catch(()=>new Response('Offline',{status:503})));
});

self.addEventListener('message',event=>{
  const d=event.data;if(!d||!d.type)return;
  if(d.type==='SKIP_WAITING')self.skipWaiting();
  if(d.type==='CLEAR_CACHE')event.waitUntil(caches.delete(CACHE_NAME));
  if(d.type==='INVALIDATE_URLS'&&Array.isArray(d.urls))event.waitUntil(caches.open(CACHE_NAME).then(c=>Promise.all(d.urls.map(u=>c.delete(u)))));
  if(d.type==='FORCE_REFRESH')event.waitUntil(caches.open(CACHE_NAME).then(c=>Promise.all(['/js/theme.engine.js','/theme.colors.css','/js/e2e-encryption.js'].map(async u=>{try{const r=await fetch(u,{cache:'no-store'});if(r.ok)await c.put(u,r);}catch(_){}}))));
  if(d.type==='ACTIVE_CHAT_CHANGED'){if(!self.__kynActiveChatByClient)self.__kynActiveChatByClient=new Map();const id=event.source&&event.source.id;if(id){if(d.chatId)self.__kynActiveChatByClient.set(id,String(d.chatId));else self.__kynActiveChatByClient.delete(id);}}
  if(d.type==='REGISTER_BACKGROUND_SYNC'&&self.registration.sync)event.waitUntil(self.registration.sync.register(d.tag||'offline-message-queue').catch(()=>{}));
  if(d.type==='RUN_CLEANUP')event.waitUntil(cleanupOldEntries());
});

async function cleanupOldEntries(){try{const c=await caches.open(CACHE_NAME),keys=await c.keys(),cut=Date.now()-CACHE_MAX_AGE;for(const k of keys){const r=await c.match(k);const d=r&&r.headers.get('date');if(d&&new Date(d).getTime()<cut)await c.delete(k);}}catch(_) {}}

self.addEventListener('sync',event=>{
  if(event.tag==='offline-message-queue')event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{const c=cs.find(x=>x.focused)||cs[0];if(c)c.postMessage({type:'FLUSH_OFFLINE_QUEUE',source:'background-sync'});}));
  if(event.tag==='offline-status-sync')event.waitUntil(self.clients.matchAll({type:'window'}).then(cs=>cs.forEach(c=>c.postMessage({type:'SYNC_STATUS_UPDATES',source:'background-sync'}))));
});

function encryptedBody(s){
  if(typeof s!=='string')return false;
  const t=s.trim();if(!t||t[0]!=='{')return false;
  try{const o=JSON.parse(t);return !!o&&typeof o==='object'&&(['v','kid','ct','iv','eph','sid','n'].some(k=>Object.prototype.hasOwnProperty.call(o,k)));}catch(_){return false;}
}

self.addEventListener('push',event=>{
  if(!event.data)return;
  let data={};try{data=event.data.json();}catch(_){try{data={title:'Nexopa',body:event.data.text()};}catch(__){return;}}
  const raw=String(data.body||data.message||'');
  const safe=encryptedBody(raw)?'You have a new message':(raw||'You have a new notification');
  const title=data.title||'Nexopa';
  const options={body:data.senderName?data.senderName+': '+safe:safe,icon:data.icon||'/icons/nexopa-192.png',badge:data.badge||'/icons/nexopa-192.png',tag:data.type==='message'||data.type==='new_message'?'msg-'+(data.chatId||'chat'):(data.tag||'nexopa-notification'),data:data.data||{url:data.url||'/chat.html'},silent:data.silent===true,requireInteraction:data.requireInteraction||false,vibrate:Array.isArray(data.vibrate)?data.vibrate:(data.vibrate===false?[]:[200,100,200])};
  event.waitUntil((async()=>{
    if(data.type==='message'||data.type==='new_message'){
      try{const chat=String(data.chatId||(data.data&&data.data.chatId)||''),map=self.__kynActiveChatByClient,cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});if(chat&&cs.some(c=>c.focused&&map&&map.get(c.id)===chat))return;}catch(_){}
    }
    return self.registration.showNotification(title,options);
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=(event.notification.data&&event.notification.data.url)||'/chat.html';
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if(c.url.includes(url)&&c.focus)return c.focus();}return self.clients.openWindow?self.clients.openWindow(url):null;}));
});
