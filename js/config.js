// js/config.js - single runtime configuration gateway
(function () {
'use strict';
const runtime=window.__NEXIPA_RUNTIME_CONFIG__||{};
const configuredOrigin=String(runtime.BACKEND_URL||'').trim().replace(/\/+$/,'');
if(!configuredOrigin)console.error('[Config] BACKEND_URL is missing. Run the frontend build and configure it in .env.');
function requireBackendOrigin(){if(!configuredOrigin)throw new Error('BACKEND_URL is not configured. Set BACKEND_URL in .env and rebuild the frontend.');return configuredOrigin;}
window.__isLocalEnvironment=window.__isLocalEnvironment||function(hostname){const host=String(hostname||window.location.hostname||'').toLowerCase();if(!host)return true;if(host==='localhost'||host==='127.0.0.1'||host==='0.0.0.0')return true;if(host.endsWith('.local'))return true;if(host.startsWith('192.168.')||host.startsWith('10.'))return true;return /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);};
window.__isProductionConsoleHost=window.__isProductionConsoleHost||function(){const host=String(window.location?.hostname||'').toLowerCase();return !!host&&!window.__isLocalEnvironment(host);};
window.__getApiOrigin=()=>requireBackendOrigin();window.__getApiBase=()=>`${requireBackendOrigin()}/api`;window.BACKEND_URL=configuredOrigin;window.GOOGLE_CLIENT_ID=String(runtime.GOOGLE_CLIENT_ID||'').trim();window.FRONTEND_URL=String(runtime.FRONTEND_URL||'').trim().replace(/\/+$/,'');window.NECPRA_APP_NAME='Necpra';window.NECPRA_APP_SHORT_NAME='Necpra';
function normalizeBrandText(v){if(typeof v!=='string'||!v)return v;return v.replace(/Kynecta/gi,'Necpra').replace(/Knecta/gi,'Necpra').replace(/MoodChat/gi,'Necpra').replace(/Mood Chat/gi,'Necpra').replace(/Necpa/gi,'Necpra');}
function applyNecpraBrand(root){const target=root||document;if(!target)return;if(target.nodeType===Node.TEXT_NODE){const n=normalizeBrandText(target.nodeValue);if(n!==target.nodeValue)target.nodeValue=n;return;}if(target.nodeType!==Node.ELEMENT_NODE&&target!==document)return;if(target===document){if(document.title)document.title=normalizeBrandText(document.title);}else if(target.tagName==='TITLE')target.textContent=normalizeBrandText(target.textContent);const walker=document.createTreeWalker(target,NodeFilter.SHOW_TEXT);const nodes=[];let node;while((node=walker.nextNode()))nodes.push(node);nodes.forEach(n=>{const x=normalizeBrandText(n.nodeValue);if(x!==n.nodeValue)n.nodeValue=x;});}
function initializeNecpraBranding(){try{document.documentElement.setAttribute('data-app-brand','necpra');applyNecpraBrand(document);if(window.MutationObserver&&document.documentElement)new MutationObserver(ms=>ms.forEach(m=>m.addedNodes&&m.addedNodes.forEach(n=>{if(n.nodeType===Node.ELEMENT_NODE||n.nodeType===Node.TEXT_NODE)applyNecpraBrand(n);}))).observe(document.documentElement,{childList:true,subtree:true});}catch(_) {}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeNecpraBranding,{once:true});else initializeNecpraBranding();
function isBackendApiPath(url){try{const p=new URL(url,window.location.origin);return /^\/api(?:\/|$)/i.test(p.pathname)||/^\/socket\.io(?:\/|$)/i.test(p.pathname)||/^\/ws(?:\/|$)/i.test(p.pathname);}catch(_){return false;}}
window.__rewriteApiUrl=function(input){const apiOrigin=requireBackendOrigin();const normalize=raw=>{if(!raw||typeof raw!=='string')return raw;if(/^\/api(?:\/|$)/i.test(raw)||/^\/socket\.io(?:\/|$)/i.test(raw)||/^\/ws(?:\/|$)/i.test(raw))return `${apiOrigin}${raw}`;try{const p=new URL(raw,window.location.origin);if(isBackendApiPath(p.href))return `${apiOrigin}${p.pathname}${p.search}${p.hash}`;}catch(_){}return raw;};if(typeof Request!=='undefined'&&input instanceof Request){const u=normalize(input.url);return u===input.url?input:new Request(u,input);}return normalize(input);};
if(!window.__KYNECTA_API_FETCH_PATCHED__&&typeof window.fetch==='function'){window.__KYNECTA_API_FETCH_PATCHED__=true;const nativeFetch=window.fetch.bind(window);window.fetch=(input,init)=>nativeFetch(window.__rewriteApiUrl(input),init);}
if(!window.__KYNECTA_API_XHR_PATCHED__&&typeof XMLHttpRequest!=='undefined'){window.__KYNECTA_API_XHR_PATCHED__=true;const nativeOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url){return nativeOpen.apply(this,[method,window.__rewriteApiUrl(url)].concat([].slice.call(arguments,2)));};}
if(!window.__KYNECTA_WEBSOCKET_PATCHED__&&typeof window.WebSocket==='function'){window.__KYNECTA_WEBSOCKET_PATCHED__=true;const NativeWebSocket=window.WebSocket;const ConfiguredWebSocket=function(url,protocols){let target=url;try{const p=new URL(url,window.location.origin);if(/^\/socket\.io(?:\/|$)/i.test(p.pathname)||/^\/ws(?:\/|$)/i.test(p.pathname)){const api=new URL(requireBackendOrigin());p.protocol=api.protocol==='https:'?'wss:':'ws:';p.host=api.host;target=p.toString();}}catch(_){}return protocols===undefined?new NativeWebSocket(target):new NativeWebSocket(target,protocols);};ConfiguredWebSocket.prototype=NativeWebSocket.prototype;window.WebSocket=ConfiguredWebSocket;}
window.apiCall=async function(endpoint,options){const url=`${window.__getApiBase()}${String(endpoint||'').startsWith('/')?endpoint:`/${endpoint||''}`}`;const final=Object.assign({headers:{'Content-Type':'application/json'}},options||{});final.headers=Object.assign({'Content-Type':'application/json'},options?.headers||{});const t=localStorage.getItem('authToken')||localStorage.getItem('accessToken')||localStorage.getItem('token');if(t&&!final.headers.Authorization)final.headers.Authorization=`Bearer ${t}`;try{const r=await fetch(url,final);return await r.json().catch(()=>({}));}catch(e){console.error('[API] Request failed:',e);return{success:false,message:e.message};}};
if(!Object.getOwnPropertyDescriptor(window,'authToken')||Object.getOwnPropertyDescriptor(window,'authToken').configurable){let legacy=null;try{const d=Object.getOwnPropertyDescriptor(window,'authToken');if(d&&'value'in d)legacy=d.value;}catch(_){}try{Object.defineProperty(window,'authToken',{configurable:true,enumerable:true,get(){try{if(window.__kynToken)return window.__kynToken;}catch(_){}try{if(window.__accessToken)return window.__accessToken;}catch(_){}try{if(window.AuthSessionManager?.getToken){const t=window.AuthSessionManager.getToken();if(t)return t;}}catch(_){}for(const k of ['authToken','accessToken','token','jwt','USER_TOKEN','necpa_token']){try{const t=localStorage.getItem(k)||sessionStorage.getItem(k);if(t&&!t.startsWith('{'))return t;}catch(_){} }return legacy||'';},set(v){legacy=v||null;}});}catch(_){} }

function installRuntimeCallOriginTrust(){try{const shared=window.__CallsCoreShared;if(!shared||typeof shared.isValidOrigin!=='function')return false;if(shared.__runtimeOriginTrustInstalled)return true;const previous=shared.isValidOrigin;const frontendOrigin=String(window.location?.origin||'').replace(/\/+$/,'');let backendOrigin='';try{backendOrigin=new URL(requireBackendOrigin()).origin;}catch(_){}const trusted=new Set([frontendOrigin,backendOrigin].filter(Boolean));if(Array.isArray(shared.CONFIG?.TRUSTED_DOMAINS)){trusted.forEach(origin=>{try{shared.CONFIG.TRUSTED_DOMAINS.push(new URL(origin).host);}catch(_){} });}shared.isValidOrigin=function(origin){if(!origin)return true;if(trusted.has(String(origin).replace(/\/+$/,'')))return true;return previous.call(this,origin);};shared.__runtimeOriginTrustInstalled=true;console.log('[Config] Calls origin trust derived from runtime origins:',Array.from(trusted));return true;}catch(_){return false;}}
if(!installRuntimeCallOriginTrust()){let attempts=0;const timer=setInterval(()=>{attempts+=1;if(installRuntimeCallOriginTrust()||attempts>=100)clearInterval(timer);},50);}
if(/\/message\.html$/i.test(window.location.pathname)&&!document.querySelector('script[data-group-message-isolation]')){const s=document.createElement('script');s.src='/js/group-message-isolation.js?v=20260915-group3';s.async=false;s.dataset.groupMessageIsolation='true';(document.head||document.documentElement).appendChild(s);}
if(/\/group\.html$/i.test(window.location.pathname)&&!document.querySelector('script[data-group-panel-cleanup]')){const s=document.createElement('script');s.src='/js/group-panel-cleanup.js?v=20260915-group3';s.async=false;s.dataset.groupPanelCleanup='true';(document.head||document.documentElement).appendChild(s);}

/* ========================================================================
   NEC PRA BATCH FIX CONTROLLER
   Loaded from the existing runtime-config source so every module uses the
   same state engine. This block deliberately does not create another chat,
   theme, status or API pipeline; it coordinates the existing ones.
   ======================================================================== */
(function batchFixController(){
  'use strict';
  if(window.__NECPRA_BATCH_FIX_CONTROLLER__) return;
  window.__NECPRA_BATCH_FIX_CONTROLLER__=true;

  const path=String(location.pathname||'').toLowerCase();
  const isMessage=/\/message\.html$/.test(path);
  const isGroup=/\/group\.html$/.test(path);
  const isStatus=/\/status(?:\.html)?$/.test(path);
  const token=()=>{try{return localStorage.getItem('authToken')||localStorage.getItem('accessToken')||localStorage.getItem('token')||localStorage.getItem('necpa_token')||'';}catch(_){return '';}};
  const userId=()=>{try{const u=JSON.parse(localStorage.getItem('currentUser')||localStorage.getItem('necpa_user')||'null');return String(u?.id||u?.userId||'');}catch(_){return '';}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storage=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(_){return d;}};
  const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(_) {}};

  /* ---------- one-panel mobile messaging ---------- */
  function setupResponsiveMessages(){
    if(!isMessage) return;
    const list=document.getElementById('convListPanel'), body=document.getElementById('chatPanel'), back=document.getElementById('backBtn');
    if(!list||!body)return;
    let mobileActive=false;
    const mobile=()=>window.matchMedia('(max-width: 767px)').matches;
    const apply=()=>{
      if(!mobile()){
        list.style.display='flex';body.style.display='flex';return;
      }
      list.style.display=mobileActive?'none':'flex';body.style.display=mobileActive?'flex':'none';
      if(back)back.style.display=mobileActive?'flex':'none';
    };
    const open=()=>{mobileActive=true;apply();};
    const close=()=>{mobileActive=false;apply();};
    document.addEventListener('click',e=>{
      if(e.target.closest('.conv-item')) setTimeout(open,0);
      if(e.target.closest('#backBtn')) { e.preventDefault(); close(); }
    },true);
    window.addEventListener('resize',apply,{passive:true});
    apply();
    window.addEventListener('message',e=>{if(e.data?.type==='OPEN_CHAT'||e.data?.type==='OPEN_CONVERSATION')setTimeout(open,0);if(e.data?.type==='GO_BACK_TO_LIST')close();});
  }

  /* ---------- locked chats: one screen for 1:1 and groups ---------- */
  const LOCK_KEY='necpra_locked_chats_v1', PIN_KEY='necpra_chat_lock_pin_v1';
  const locked=()=>storage(LOCK_KEY,{});
  const setLocked=(v)=>save(LOCK_KEY,v);
  async function hashPin(pin){
    if(window.crypto?.subtle){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pin));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
    return btoa(pin);
  }
  function collectChatTargets(){
    const rows=[...document.querySelectorAll('.conv-item,[data-chat-id],[data-conversation-id],.message-group-row')];
    const out=new Map();
    rows.forEach((r,i)=>{const id=String(r.dataset.chatId||r.dataset.conversationId||r.dataset.groupId||r.getAttribute('data-id')||'');if(!id)return;const name=r.querySelector('.conv-name,strong,.message-group-meta strong')?.textContent?.trim()||`Chat ${i+1}`;out.set(id,{id,name,row:r,type:r.classList.contains('message-group-row')?'group':'direct'});});
    return [...out.values()];
  }
  function ensureLockUI(){
    if(!isMessage)return;
    if(document.getElementById('necpraLockButton'))return;
    const head=document.getElementById('convListHeader');if(!head)return;
    const b=document.createElement('button');b.id='necpraLockButton';b.type='button';b.title='Locked chats';b.setAttribute('aria-label','Locked chats');b.innerHTML='🔒';
    b.style.cssText='background:none;border:0;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:17px;';
    b.onclick=showLockScreen;head.appendChild(b);
    const observer=new MutationObserver(()=>markLockedRows());observer.observe(document.getElementById('convList')||document.body,{childList:true,subtree:true});
    markLockedRows();
  }
  function markLockedRows(){const l=locked();document.querySelectorAll('.conv-item,.message-group-row').forEach(r=>{const id=String(r.dataset.chatId||r.dataset.conversationId||r.dataset.groupId||'');if(l[id]){r.dataset.necpraLocked='1';r.style.opacity='.72';if(!r.querySelector('.necpra-lock-badge')){const x=document.createElement('span');x.className='necpra-lock-badge';x.textContent='🔒';x.style.marginLeft='auto';r.appendChild(x);}}else{r.removeAttribute('data-necpra-locked');r.querySelector('.necpra-lock-badge')?.remove();r.style.opacity='';}});}
  function showLockScreen(){
    let ov=document.getElementById('necpraLockScreen');if(!ov){ov=document.createElement('div');ov.id='necpraLockScreen';ov.style.cssText='position:fixed;inset:0;z-index:100000;background:var(--kyn-bg-panel,#fff);color:var(--kyn-text-primary,#111);display:flex;flex-direction:column;';document.body.appendChild(ov);}
    const l=locked(), rows=collectChatTargets();
    ov.innerHTML=`<header style="display:flex;align-items:center;gap:10px;padding:14px;border-bottom:1px solid var(--kyn-border,#ddd)"><button id="necpraLockBack" style="border:0;background:none;font-size:22px;cursor:pointer">←</button><strong style="font-size:18px">Locked chats</strong><span style="margin-left:auto">${Object.keys(l).length}</span></header><main style="padding:14px;overflow:auto;flex:1"><div id="necpraPinArea"></div><div id="necpraLockRows"></div></main>`;
    const pinArea=ov.querySelector('#necpraPinArea');
    const hasPin=!!storage(PIN_KEY,'');
    pinArea.innerHTML=hasPin?'<div style="font-size:12px;color:var(--kyn-text-secondary,#777);margin-bottom:12px">PIN is configured. Select chats below to lock or unlock them.</div>':'<div style="display:flex;gap:8px;margin-bottom:14px"><input id="necpraNewPin" inputmode="numeric" maxlength="8" placeholder="Create 4–8 digit PIN" style="flex:1;padding:10px;border:1px solid var(--kyn-border,#ddd);border-radius:8px;background:var(--kyn-bg-input,#fff);color:inherit"><button id="necpraSavePin" style="padding:10px 14px;border:0;border-radius:8px;background:var(--kyn-accent-primary,#2563eb);color:#fff;font-weight:700">Set PIN</button></div>';
    const list=ov.querySelector('#necpraLockRows');
    list.innerHTML=rows.length?rows.map(r=>`<label style="display:flex;align-items:center;gap:10px;padding:12px 4px;border-bottom:1px solid var(--kyn-border,#eee)"><input type="checkbox" data-lock-id="${esc(r.id)}" ${l[r.id]?'checked':''}><span style="flex:1"><strong>${esc(r.name)}</strong><small style="display:block;color:var(--kyn-text-secondary,#777)">${r.type==='group'?'Group':'Private chat'}</small></span>${l[r.id]?'🔒':'🔓'}</label>`).join(''):'<div style="padding:30px;text-align:center;color:var(--kyn-text-secondary,#777)">No chats available yet.</div>';
    ov.querySelector('#necpraLockBack').onclick=()=>ov.remove();
    ov.querySelector('#necpraSavePin')?.addEventListener('click',async()=>{const p=ov.querySelector('#necpraNewPin').value.trim();if(!/^\d{4,8}$/.test(p)){alert('PIN must contain 4–8 digits.');return;}save(PIN_KEY,await hashPin(p));showLockScreen();});
    list.querySelectorAll('[data-lock-id]').forEach(cb=>cb.addEventListener('change',async()=>{const current=locked();const id=cb.dataset.lockId;if(cb.checked){if(!storage(PIN_KEY,'')){cb.checked=false;alert('Create a PIN first.');return;}current[id]={lockedAt:Date.now(),owner:userId()};}else{delete current[id];}setLocked(current);markLockedRows();}));
    const current=locked();document.querySelectorAll('.conv-item,.message-group-row').forEach(r=>{const id=String(r.dataset.chatId||r.dataset.conversationId||r.dataset.groupId||'');if(current[id])r.onclick=async e=>{e.stopImmediatePropagation();if(await verifyLock())openLockedChat(id);};});
  }
  async function verifyLock(){const pin=prompt('Enter chat PIN');if(pin===null)return false;const stored=storage(PIN_KEY,'');return !!stored&&await hashPin(pin)===stored;}
  function openLockedChat(id){const r=document.querySelector(`.conv-item[data-chat-id="${CSS.escape(id)}"],.conv-item[data-conversation-id="${CSS.escape(id)}"],.message-group-row[data-group-id="${CSS.escape(id)}"]`);r?.click();}

  /* ---------- recently updated / recently viewed status layout ---------- */
  async function setupStatusSections(){
    if(!isStatus)return;
    const existing=[...document.querySelectorAll('section,div,h2,h3,h4')].filter(el=>/recently\s+(updated|viewed)/i.test(el.textContent||''));
    existing.forEach(el=>{if(el.children.length<20)el.remove();});
    const anchor=document.querySelector('#statusList,#statusesList,.status-list,.statuses-container,[data-status-list],main')||document.body;
    const wrap=document.createElement('div');wrap.id='necpraRecentStatusSections';wrap.style.cssText='display:flex;flex-direction:column;gap:18px;padding:10px 14px;overflow:auto;max-height:100%;';
    const data=await fetch(`${window.__getApiBase()}/status`,{headers:{Authorization:`Bearer ${token()}`}}).then(r=>r.ok?r.json():{}).catch(()=>({}));
    const raw=data?.data?.statuses||data?.data?.status||data?.statuses||data?.status||[];const arr=Array.isArray(raw)?raw:[];
    const viewed=arr.filter(s=>s.viewedByMe).sort((a,b)=>new Date(b.viewedAt||0)-new Date(a.viewedAt||0));
    const updated=[...arr].sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0));
    const card=s=>`<button type="button" data-status-id="${esc(s.id)}" style="min-width:92px;width:92px;border:0;background:none;color:inherit;text-align:center;cursor:pointer"><span style="display:block;width:68px;height:68px;margin:0 auto 6px;border-radius:50%;padding:3px;background:linear-gradient(135deg,var(--kyn-accent-primary,#2563eb),#a855f7)"><img src="${esc(s.user?.avatar||s.avatar||'')}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;background:var(--kyn-bg-hover,#ddd)" onerror="this.style.display='none'"></span><strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px">${esc(s.user?.displayName||s.user?.username||s.username||'Status')}</strong></button>`;
    const section=(title,items)=>`<section style="display:flex;flex-direction:column;gap:8px"><h3 style="margin:0;font-size:15px">${title}</h3><div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px">${items.length?items.map(card).join(''):'<span style="font-size:12px;color:var(--kyn-text-secondary,#777)">No statuses yet.</span>'}</div></section>`;
    wrap.innerHTML=section('Recently Updated',updated)+section('Recently Viewed',viewed);
    anchor.prepend(wrap);
    wrap.addEventListener('click',e=>{const b=e.target.closest('[data-status-id]');if(!b)return;window.dispatchEvent(new CustomEvent('OPEN_STATUS',{detail:{statusId:b.dataset.statusId}}));});
  }

  /* ---------- one global theme contract for modules/games ---------- */
  function syncTheme(){
    const root=document.documentElement;const theme=root.getAttribute('data-theme')||localStorage.getItem('app_theme')||'light';
    document.querySelectorAll('iframe').forEach(f=>{try{f.contentWindow.postMessage({type:'THEME_CHANGED',theme},location.origin);}catch(_){}});
    document.documentElement.style.setProperty('color-scheme',theme==='dark'?'dark':'light');
  }
  window.addEventListener('themechange',syncTheme);window.addEventListener('storage',e=>{if(e.key==='app_theme')setTimeout(syncTheme,0);});

  /* ---------- profile / cover propagation across shell and iframes ---------- */
  window.addEventListener('profile:updated',e=>{const d=e.detail||{};document.querySelectorAll('[data-profile-avatar],[data-user-avatar]').forEach(el=>{if(d.avatar)el.src=d.avatar;});document.querySelectorAll('[data-profile-cover],[data-cover-image]').forEach(el=>{if(d.cover)el.src=d.cover;});window.parent!==window&&window.parent.postMessage({type:'PROFILE_UPDATED',payload:d},location.origin);});
  window.addEventListener('message',e=>{if(e.origin!==location.origin)return;if(e.data?.type==='PROFILE_UPDATED'){window.dispatchEvent(new CustomEvent('profile:updated',{detail:e.data.payload||{}}));}});

  /* ---------- friend request entry point ---------- */
  function setupFriendRequests(){
    const candidates=[...document.querySelectorAll('[id*=friend],[class*=friend]')];
    const host=candidates.find(x=>x.querySelector?.('button,[role=button]'))||document.querySelector('#friendsPanel,#friendsList,.friends-panel');
    if(!host||host.querySelector('#necpraFriendRequestsBtn'))return;
    const b=document.createElement('button');b.id='necpraFriendRequestsBtn';b.type='button';b.title='Friend requests';b.innerHTML='👥';b.style.cssText='border:0;background:none;cursor:pointer;font-size:18px;padding:8px;border-radius:50%;';
    b.onclick=()=>window.dispatchEvent(new CustomEvent('OPEN_FRIEND_REQUESTS'));
    host.insertBefore(b,host.firstChild);
  }

  function boot(){
    setupResponsiveMessages();
    if(isMessage){ensureLockUI();setTimeout(ensureLockUI,1000);}
    if(isStatus)setupStatusSections();
    setupFriendRequests();
    syncTheme();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
console.log('[Config] Runtime configuration loaded. Backend:',configuredOrigin||'(missing)');
})();