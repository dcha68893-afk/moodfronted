// Kynecta service worker — v19.34.0
// Critical runtime/theme/encryption/account-isolation assets are network-first
// so an installed PWA cannot silently execute week-old code after a deploy.
'use strict';

// ROOT-CAUSE FIX (FIXES LAND ON DESKTOP BUT NOT ON MOBILE — sidebar empty
// on reload/relogin, "Unable to decrypt" persisting after a real fix was
// already committed): message.html is the ONE page that actually renders
// the conversation sidebar and chat bubbles (see e2e-session-init.js's own
// comment on this), and js/message-e2e-compat.js is a required link in the
// canonical E2E bootstrap chain (loaded right after message-e2e-core.js) —
// yet neither was ever listed in NETWORK_FIRST_PATTERNS below, and
// message.html isn't in CORE_STATIC_ASSETS either. A desktop browser
// tab with no installed PWA/service worker (or one that's never been
// granted an install) just fetches these fresh every time, so a genuine
// fix appears immediately there. An installed mobile PWA is exactly the
// case this file's own stale-while-revalidate default exists to protect
// against: it serves the OLD cached copy of message.html/message-e2e-
// compat.js on the very load that matters, and only fetches the new one
// in the background for NEXT time — so a real fix to the sidebar or the
// decrypt engine can sit deployed on the server for a session or more
// before a mobile install ever runs it, while desktop testing the same
// commit sees it work right away. Bumping CACHE_NAME alone does not close
// this gap for future edits to these two files (it only forces one clean
// break right now); adding them to NETWORK_FIRST_PATTERNS is what stops it
// from recurring on every future deploy.
const SW_VERSION = '19.35.0';
// FIX: bumped so activate() drops every existing cache immediately on this
// deploy — anyone with a stale pre-rebuild group.html (or the old, now-
// deleted group-core-*/group-os-* files, or the misspelled necpra-* icons
// that a previous "fix" had wrongly swapped in place of the real necpa-*
// app log image set) cached under the old name gets a clean break on next
// load, instead of waiting on the 7-day CACHE_MAX_AGE staleness check or a
// lucky reinstall.
// FIX (this deploy): js/config.js (brand rewriter no longer touches inline <script> text), group/E2E files and
// Tool-core.part3.js all changed. Bumping the cache name makes every installed PWA/Android app drop the old copies
// on next launch instead of running them for up to CACHE_MAX_AGE.
// FIX (message restore / account isolation): js/message-client.js, js/message-local-db.js, js/group-message-local-db.js,
// js/authStorage.js, js/core/groups/group-cache-first.js and group.html changed. group-cache-first.js was on neither the
// precache nor NETWORK_FIRST_PATTERNS list, so it is now network-first; the bump forces one clean break on next launch.
// FIX (PWA install consolidation): pwa-manager.js is now the single install/registration controller and
// js/pwa-mobile-install.js + js/install-chooser.js were deleted. Bumping the cache name drops every cached copy
// of those two scripts (and the old pwa-manager.js) on the next activate, so no device keeps running a stale
// installer next to the new one.
// FIX (CACHE NAME WENT BACKWARDS): the previous deploy changed this from v62 back to v61. A phone that had cached the
// ORIGINAL v61 (before v62 existed) then kept that cache untouched — activate() only deletes caches whose name differs —
// and so kept running stale scripts (e.g. an old pwa-manager.js that expected the deleted pwa-mobile-install.js, which is
// exactly "install option missing on phones but present on laptop"). Cache names must only ever move forward.
// v63 also ships the Vibes/Status, group history and chat-list fixes, so every installed app drops its old copies once.
// FIX (category-image / status-vibe media fixes not showing up on installed PWAs): Tool-ui.js,
// marketplace-image-hardening.js, js/core/status/ProfessionalStatus.js and
// js/status-runtime-hardening.js all changed (category artwork, background-media cleanup, Vibe
// icon animation). Bump forces a clean cache break on next launch instead of waiting up to
// CACHE_MAX_AGE (7 days).
// v67: games-v4-gameplay-fix.js (Block Puzzle no longer stacks duplicate drag handlers on
// replay; Trivia no longer gets its answers disabled mid-quiz by a stale base-game timer),
// games-commercial-v5.js (Challenge-button dedup check fixed), games-v4-enhancements.js
//
// v69: ROOT-CAUSE FIX (real crossword game shipped in games-crossword-v4.js never reached
// installed devices — "click Word Connect, still see the old placeholder"): NOT ONE game
// file (game.html, game-v3.html, games-crossword-v4.js, games-v4-enhancements.js,
// games-commercial-v5.js) was ever in NETWORK_FIRST_PATTERNS below, despite this file
// documenting this exact failure mode — "a real fix sits on the server for up to a week
// before an installed app runs it" — and already fixing it for friend/group/status/
// marketplace/tools. The .js files fell through to staticAsset()'s cache-first strategy
// (only re-checks network every CACHE_MAX_AGE = 7 days or on a CACHE_NAME bump), so a
// device that had already cached an old games-crossword-v4.js kept running it — including
// versions from before the real crossword engine existed — no matter how many times the
// game screen was reopened. Adding these below and bumping CACHE_NAME forces the one clean
// break every other module fix here already gets.
// (LEVEL/DIFFICULTY badge now actually appears; duplicate Challenge button removed).
const CACHE_NAME = 'necpa-static-v69';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const CORE_STATIC_ASSETS = [
  '/index.html','/manifest.json','/icons/necpa-192.png','/icons/necpa-512.png',
  '/Tool.css','/Tool-ui.js','/Tool-core.part1.js','/Tool-core.part2.js','/Tool-core.part3.js',
  '/friend.html','/chat.html',
  '/js/api.core.js','/js/api.request.js','/js/api.auth.js','/js/api.messages.js',
  '/js/app.core.bootstrap.js','/js/app.core.session.js','/js/app.core.ui.js','/js/app.ui.auth.js',
  '/js/app.cache.js','/js/app.cache.unified.js','/js/authStorage.js','/js/app.offline.queue.js','/js/auth.session.manager.js',
  '/js/app.runtime.authority.js','/js/auth.account.limit.js','/js/google-auth.js','/js/app.offline.bootstrap.js',
  '/friend.css','/css/suppress-webgl.css','/js/status-runtime-hardening.js','/js/marketplace-category-images.js'
];

const NETWORK_FIRST_PATTERNS = [
  // FIX: config.js (global brand/config layer every page runs) and the group send path were served stale-while-
  // revalidate, so a fix could sit on the server for a full session before an installed app ran it.
  /\/js\/config\.js/i,/\/js\/groupMessaging\.client\.js/i,/\/group\.html/i,
  /\/js\/theme\.engine\.js/i,/\/theme\.colors\.css/i,/\/js\/e2e-encryption\.js/i,
  /\/js\/e2e-session-init\.js/i,/\/js\/api\.request\.js/i,/\/js\/message-e2e-core\.js/i,
  /\/js\/message-e2e-compat\.js/i,/\/message\.html/i,
  /\/js\/e2e-identity-core\.js/i,/\/js\/e2e-ratchet-v3\.js/i,/\/js\/api\.auth\.js/i,/\/js\/app\.core\.session\.js/i,
  /\/js\/app\.core\.bootstrap\.js/i,/\/js\/auth\.session\.manager\.js/i,/\/js\/authStorage\.js/i,
  /\/js\/auth\.account\.limit\.js/i,/\/js\/google-auth\.js/i,/\/js\/app\.cache\.unified\.js/i,
  /\/js\/app\.cache\.js/i,/\/js\/app\.ui\.auth\.js/i,/\/js\/app\.realtime\.socket\.js/i,
  /\/js\/app\.runtime\.authority\.js/i,/\/js\/api\.core\.js/i,/\/js\/messages-core\.js/i,
  /\/js\/messages-ui\.js/i,/\/js\/message-client\.js/i,/\/js\/e2e-store-v2\.js/i,
  /\/js\/message-local-db\.js/i,/\/js\/message-realtime-bridge\.js/i,/\/MessageLifecycleClient\.js/i,
  /\/messages-core\.bootstrap\.js/i,/\/messages-core\.operations\.js/i,/\/messages-core\.ui-bridge\.js/i,
  /\/messageSync\.engine\.js/i,/\/status-core-runtime\.js/i,/\/status-core\.part[1-3]\.js/i,
  /\/status-core-transport\.js/i,/\/status-core-state\.js/i,/\/status-ui\.js/i,
  // status.html now hosts js/core/status/ProfessionalStatus.js (the whole Status UI); neither was
  // network-first, so a cached copy kept the old mobile layout after deploys.
  /\/status\.html/i,/\/js\/core\/status\/ProfessionalStatus\.js/i,/\/js\/status-runtime-hardening\.js/i,/\/js\/marketplace-category-images\.js/i,/\/js\/marketplace-image-hardening\.js/i,
  // ROOT-CAUSE FIX (Groups panel showing blank on open / after "back to list",
  // group messages from other members never appearing): group.html was
  // rebuilt from scratch on 2026-09-15 as a single self-contained page —
  // group-ui.js, group-core-bootstrap.js, group-core-operations.js,
  // group-core-bridge.js, group-os/group-os.js, group-os/group-os-
  // integration.js, group-core-patch(.legacy).js and js/groupEncryption.
  // client(.legacy).js no longer exist and are not referenced by ANY page
  // anymore — yet this list (last touched 2026-09-13, two days before the
  // rebuild) still prioritized those dead files and never protected the
  // ones the new group.html actually loads. A browser that had already
  // cached the OLD group.html/group module before the rebuild would keep
  // reusing it — same "fix shipped, mobile still runs old code" pattern
  // already hit and fixed for the friend module and marketplace files
  // below. Swapped the dead legacy entries for the real, still-actively-
  // edited files group.html depends on today.
  /\/group\.html/i,/\/js\/groupMessaging\.client\.js/i,/\/js\/groupEncryption\.client\.js/i,/\/js\/group-platform\.js/i,/\/js\/group-message-local-db\.js/i,/\/js\/core\/groups\/group-cache-first\.js/i,/\/js\/group-chat-features\.js/i,/\/js\/group-message-cache\.js/i,
  /\/friend-core\.ui-bridge\.js/i,
  // ROOT-CAUSE FIX (fixes to the friend module silently not appearing after
  // deploy — "some changes show, others don't"): friend.html and friend.css
  // were already precached fresh on every SW install (CORE_STATIC_ASSETS
  // above) and friend-core.ui-bridge.js was already network-first, but
  // friend-ui.js, friend-core.bootstrap.js, friend-core.operations.js,
  // friendSync.engine.js, friendQueue.manager.js, and localStore.friends.js
  // — where almost all of the actual friend-module logic lives — were in
  // neither list. They fell through to staticAsset()'s cache-first
  // strategy below, which only re-checks the network once every
  // CACHE_MAX_AGE (7 days) or on a full CACHE_NAME bump. A browser/PWA
  // that had already cached an old copy of friend-ui.js kept running it
  // untouched for up to a week after a real server-side fix shipped,
  // regardless of how many times the page was reloaded.
  /\/friend-ui\.js/i,/\/friend-core\.bootstrap\.js/i,/\/friend-core\.operations\.js/i,
  /\/friendSync\.engine\.js/i,/\/friendQueue\.manager\.js/i,/\/localStore\.friends\.js/i,
  /\/Tool-core\.part3\.js/i,/\/Tool-ui\.js/i,/\/pwa-manager\.js/i,/\/manifest\.json/i,/\/js\/kynecta\.safety\.layer\.js/i,
  /\/settings-ui\.js/i,/\/js\/settings-ui\.local-first\.patch\.js/i,
  /\/chat\.html/i,
  // ROOT-CAUSE FIX (Product Management admin page showing raw JS/template-literal
  // source as visible page text; wrong/mismatched product images on marketplace
  // cards; "Add Images"/checkout fields silently broken after a real fix shipped):
  // Tools.html itself is a navigation and goes through navigation()'s network-first
  // path, and Tool-core.part3.js/Tool-ui.js were already network-first, but every
  // classic marketplace-*.js script — where the admin panel, product cards, seller
  // tools, and checkout actually live — fell through to staticAsset()'s cache-first
  // strategy below. That only re-checks the network once every CACHE_MAX_AGE
  // (7 days) or on a full CACHE_NAME bump, so a browser that had already cached an
  // older, buggy copy of these files kept running it for up to a week after a real
  // fix was deployed, regardless of how many times the page was reloaded — the
  // same failure mode already fixed for the friend module and group-os files above.
  /\/Tools\.html/i,/\/Tool\.css/i,/\/marketplace-ui-fix\.js/i,/\/marketplace-ecommerce\.js/i,
  /\/marketplace-admin\.js/i,/\/marketplace-seller\.js/i,/\/marketplace-checkout\.js/i,
  /\/marketplace-advanced\.js/i,
  // v69 — see the dated comment near the top of this file. game.html itself is a
  // navigation request (goes through navigation()'s already-network-first path
  // regardless), but the actual gameplay scripts are plain .js requests and were
  // falling through to the 7-day cache-first default without these.
  /\/game\.html/i,/\/game-v3\.html/i,/\/games-crossword-v4\.js/i,
  /\/games-v4-enhancements\.js/i,/\/games-commercial-v5\.js/i
];

const BYPASS_PATTERNS = [
  /\/api\//i,/\/auth\//i,/\/backend\//i,/\/server\//i,/\/socket\.io\//i,/\/ws\//i,/\/wss\//i,
  /\/graphql/i,/\/webhook/i,/^https?:\/\/api\./i,/noxopa\.onrender\.com/i,/onrender\.com\/health/i,
  /\.onrender\.com\/api/i,/www\.google\.com\/generate_204/i,/cloudflare\.com\/cdn-cgi/i
];
const STATIC_PATTERNS = [/\.(css|js|json|png|jpg|jpeg|svg|ico|woff2|woff|ttf|webp|gif|map)$/i,/\/icons\//i,/\/images\//i,/\/fonts\//i,/\/static\//i,/\/webfonts\//i];
function isApi(url){return BYPASS_PATTERNS.some(p=>p.test(url));}
function isNetworkFirst(url){return NETWORK_FIRST_PATTERNS.some(p=>p.test(url));}
function isStatic(url){return STATIC_PATTERNS.some(p=>p.test(url));}
function local(url){try{return new URL(url,self.location.origin).origin===self.location.origin;}catch(_){return false;}}
function stale(res){try{const d=res.headers.get('date');return d&&(Date.now()-new Date(d).getTime()>CACHE_MAX_AGE);}catch(_){return false;}}
const OFFLINE_SHELL='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Necpa - Offline</title></head><body><main style="font-family:system-ui;text-align:center;padding:4rem"><h1>Necpa</h1><p>You are offline.</p><button onclick="location.reload()">Try again</button></main></body></html>';

async function navigation(request){
  const cache=await caches.open(CACHE_NAME);
  try{let r=await fetch(request);if(r.ok){if(new URL(request.url).pathname==='/Tools.html'){try{let h=await r.text();const tag='<script src="/js/marketplace-category-images.js"></script>';if(h.includes('</body>')&&!h.includes(tag))h=h.replace('</body>',tag+'</body>');const headers=new Headers(r.headers);headers.set('content-type','text/html; charset=utf-8');r=new Response(h,{status:r.status,statusText:r.statusText,headers})}catch(_){}}cache.put(request.url,r.clone()).catch(()=>{});return r;}}catch(_){}
  const exact=await cache.match(request);if(exact)return exact;
  for(const u of ['/index.html','/','/friend.html','/chat.html']){const r=await cache.match(new URL(u,self.location.origin).href);if(r)return r;}
  return new Response(OFFLINE_SHELL,{status:200,headers:{'Content-Type':'text/html;charset=utf-8'}});
}
async function networkFirst(request){
  const cache=await caches.open(CACHE_NAME);
  try{const r=await fetch(request,{cache:'no-store'});if(r.ok){await cache.put(request,r.clone()).catch(()=>{});return r;}const old=await cache.match(request);return old||r;}catch(_){const old=await cache.match(request);return old||new Response('Resource unavailable offline',{status:503});}
}
async function staticAsset(request){
  const cache=await caches.open(CACHE_NAME);const old=await cache.match(request);if(old&&!stale(old))return old;
  try{const r=await fetch(request);if(r.ok)await cache.put(request,r.clone()).catch(()=>{});return r.ok?r:(old||r);}catch(_){return old||new Response('Resource unavailable offline',{status:503});}
}
async function api(request){try{return await fetch(request);}catch(_){return new Response(JSON.stringify({error:'Network request failed',offline:true}),{status:503,headers:{'Content-Type':'application/json'}});}}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>Promise.all(CORE_STATIC_ASSETS.map(a=>fetch(a,{cache:'no-store',credentials:'same-origin'}).then(r=>r.ok?cache.put(a,r):null).catch(()=>null)))).then(()=>console.log('[SW] Installed '+SW_VERSION)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n!==CACHE_NAME).map(n=>caches.delete(n)))).then(()=>self.clients.claim()).then(()=>self.clients.matchAll({type:'window',includeUncontrolled:true})).then(cs=>cs.forEach(c=>c.postMessage({type:'SW_UPDATED',version:SW_VERSION}))));
});
self.addEventListener('fetch',event=>{
  const r=event.request,url=r.url;if(r.method!=='GET')return;
  if(r.mode==='navigate'||r.destination==='document'){event.respondWith(navigation(r));return;}
  if(isApi(url)){event.respondWith(api(r));return;}
  if(local(url)&&isNetworkFirst(url)){event.respondWith(networkFirst(r));return;}
  if(local(url)&&isStatic(url)){event.respondWith(staticAsset(r));return;}
  event.respondWith(fetch(r).catch(()=>new Response('Offline',{status:503})));
});
self.addEventListener('message',event=>{
  const d=event.data;if(!d||!d.type)return;
  if(d.type==='SKIP_WAITING')self.skipWaiting();
  // index.html asks for this (MessageChannel) to render the "Offline ready / vX" status line; it was never answered.
  if(d.type==='GET_CACHE_INFO'&&event.ports&&event.ports[0]){const port=event.ports[0];event.waitUntil(caches.open(CACHE_NAME).then(c=>c.keys()).then(k=>port.postMessage({version:SW_VERSION,cache:CACHE_NAME,count:k.length})).catch(()=>port.postMessage({version:SW_VERSION,cache:CACHE_NAME,count:0})));}
  if(d.type==='CLEAR_CACHE')event.waitUntil(caches.delete(CACHE_NAME));
  if(d.type==='INVALIDATE_URLS'&&Array.isArray(d.urls))event.waitUntil(caches.open(CACHE_NAME).then(c=>Promise.all(d.urls.map(u=>c.delete(u)))));
  if(d.type==='FORCE_REFRESH')event.waitUntil(caches.open(CACHE_NAME).then(c=>Promise.all(['/js/theme.engine.js','/theme.colors.css','/js/e2e-encryption.js','/js/authStorage.js','/js/auth.account.limit.js','/js/google-auth.js','/js/app.cache.unified.js','/js/app.cache.js'].map(async u=>{try{const r=await fetch(u,{cache:'no-store'});if(r.ok)await c.put(u,r);}catch(_){}}))));
  if(d.type==='ACTIVE_CHAT_CHANGED'){if(!self.__kynActiveChatByClient)self.__kynActiveChatByClient=new Map();const id=event.source&&event.source.id;if(id){if(d.chatId)self.__kynActiveChatByClient.set(id,String(d.chatId));else self.__kynActiveChatByClient.delete(id);}}
  if(d.type==='REGISTER_BACKGROUND_SYNC'&&self.registration.sync)event.waitUntil(self.registration.sync.register(d.tag||'offline-message-queue').catch(()=>{}));
  if(d.type==='RUN_CLEANUP')event.waitUntil(cleanupOldEntries());
});
async function cleanupOldEntries(){try{const c=await caches.open(CACHE_NAME),keys=await c.keys(),cut=Date.now()-CACHE_MAX_AGE;for(const k of keys){const r=await c.match(k);const d=r&&r.headers.get('date');if(d&&new Date(d).getTime()<cut)await c.delete(k);}}catch(_) {}}
self.addEventListener('sync',event=>{
  if(event.tag==='offline-message-queue')event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{const c=cs.find(x=>x.focused)||cs[0];if(c)c.postMessage({type:'FLUSH_OFFLINE_QUEUE',source:'background-sync'});}));
  if(event.tag==='offline-status-sync')event.waitUntil(self.clients.matchAll({type:'window'}).then(cs=>cs.forEach(c=>c.postMessage({type:'SYNC_STATUS_UPDATES',source:'background-sync'}))));
});
function encryptedBody(s){if(typeof s!=='string')return false;const t=s.trim();if(!t||t[0]!=='{')return false;try{const o=JSON.parse(t);return !!o&&typeof o==='object'&&(['v','kid','ct','iv','eph','sid','n'].some(k=>Object.prototype.hasOwnProperty.call(o,k)));}catch(_){/* FIX: server truncates previews to 100 chars, so an envelope is often cut-off JSON that never parses -- match its shape instead */return /^\{\s*"(v|kid|ct|iv|eph|sid|n)"\s*:/.test(t);}}
self.addEventListener('push',event=>{
  if(!event.data)return;let data={};try{data=event.data.json();}catch(_){try{data={title:'Necpa',body:event.data.text()};}catch(__){return;}}
  const raw=String(data.body||data.message||'');const safe=encryptedBody(raw)?'You have a new message':(raw||'You have a new notification');const title=data.title||'Necpa';
  const chatId=String(data.chatId||(data.data&&data.data.chatId)||'');const tag=chatId?'chat-'+chatId:(data.tag||'necpa-notification');
  const options={body:data.senderName?data.senderName+': '+safe:safe,icon:data.icon||'/icons/necpa-192.png',badge:data.badge||'/icons/necpa-192.png',tag,renotify:true,data:Object.assign({url:data.url||'/chat.html',chatId},data.data||{}),silent:data.silent===true,requireInteraction:data.requireInteraction||false,vibrate:Array.isArray(data.vibrate)?data.vibrate:(data.vibrate===false?[]:[200,100,200]),actions:[{action:'reply',title:'Reply',type:'text',placeholder:'Type a message…'},{action:'mark_read',title:'Mark as read'}]};
  event.waitUntil((async()=>{if(data.type==='message'||data.type==='new_message'){try{const chat=chatId,map=self.__kynActiveChatByClient,cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});if(chat&&cs.some(c=>c.focused&&map&&map.get(c.id)===chat))return;}catch(_){} }return self.registration.showNotification(title,options);})());
});
self.addEventListener('notificationclick',event=>{event.notification.close();const nd=event.notification.data||{};const url=nd.url||'/chat.html';
  event.waitUntil((async()=>{if(event.action==='reply'){const text=String(event.reply||'').trim();if(text){const headers={'Content-Type':'application/json'};if(nd.token)headers.Authorization=/^Bearer /i.test(nd.token)?nd.token:'Bearer '+nd.token;const r=await fetch('/api/messages',{method:'POST',headers,body:JSON.stringify({chatId:nd.chatId,content:text,type:'text'})}).catch(()=>null);if(r&&r.ok)return;}}
    if(event.action==='mark_read'&&nd.chatId){await fetch('/api/messages/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chatId:nd.chatId})}).catch(()=>{});return;}
    const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});const origin=self.location.origin;const app=cs.find(c=>c.url.indexOf(origin)===0&&/chat\.html|\/$/.test(c.url.split('?')[0]))||cs.find(c=>c.url.indexOf(origin)===0);if(app){try{await app.focus()}catch(_){}try{app.postMessage({type:'KYN_NOTIFICATION_CLICK',data:nd,url})}catch(_){}return;}return self.clients.openWindow?self.clients.openWindow(url):null;})());});