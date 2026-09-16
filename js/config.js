// Necpa runtime configuration gateway
(function(){
'use strict';
try{const saved=localStorage.getItem('app_theme')||localStorage.getItem('theme');const prefers=window.matchMedia?.('(prefers-color-scheme: dark)').matches;const theme=saved==='dark'||saved==='light'?saved:(prefers?'dark':'light');document.documentElement.setAttribute('data-theme',theme);document.documentElement.style.colorScheme=theme;}catch(_){}
const runtime=window.__NEXIPA_RUNTIME_CONFIG__||window.__NECPRA_RUNTIME_CONFIG__||{};
const configuredOrigin=String(runtime.BACKEND_URL||window.BACKEND_URL||'').trim().replace(/\/+$/,'');
let __backendOriginWarned=false;
// FIX (CONFIG-THROW-BREAKS-API-INIT): ...
function requireBackendOrigin(){if(!configuredOrigin){if(!__backendOriginWarned){__backendOriginWarned=true;console.error('[Config] BACKEND_URL is not configured — window.__getApiOrigin()/window.__getApiBase() will return \'\' until it is.');}return '';}return configuredOrigin;}
window.BACKEND_URL=configuredOrigin;window.FRONTEND_URL=String(runtime.FRONTEND_URL||'').trim().replace(/\/+$/,'');window.GOOGLE_CLIENT_ID=String(runtime.GOOGLE_CLIENT_ID||'').trim();window.NECPRA_APP_NAME='Necpa';window.NECPRA_APP_SHORT_NAME='Necpa';window.__getApiOrigin=()=>requireBackendOrigin();window.__getApiBase=()=>{const o=requireBackendOrigin();return o?o+'/api':'';};
function normalizeBrandText(v){return typeof v==='string'&&v?v.replace(/Kynecta/gi,'Necpa').replace(/Knecta/gi,'Necpa').replace(/MoodChat/gi,'Necpa').replace(/Mood Chat/gi,'Necpa').replace(/Necpra/gi,'Necpa').replace(/Advanced Mood-Based Chat/gi,'Advanced Chat').replace(/Mood-Based/gi,'').replace(/Mood Arcade/gi,'Necpa Arcade'):v;}
function applyBrand(root){try{if(!root)return;if(root.nodeType===Node.TEXT_NODE){root.nodeValue=normalizeBrandText(root.nodeValue);return;}if(root===document&&document.title)document.title=normalizeBrandText(document.title);const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode())n.nodeValue=normalizeBrandText(n.nodeValue);}catch(_){} }
function normalizeIcons(){try{const icon='/icons/necpa-192.png';document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]').forEach(n=>n.href=icon);}catch(_){} }
function removeCalls(root){try{const d=root||document;d.querySelectorAll('#hdrChatCall,#hdrChatVideo,#hdrGroupCall,#hdrGroupVideo,[data-page="calls"],.center-menu-calls,[data-module="calls"],#_kynMiniCallBar,#kyn-call-banner,#bannerAcceptCall,#bannerDeclineCall').forEach(n=>n.remove());d.querySelectorAll('button,a').forEach(n=>{const t=(n.textContent||'').trim().toLowerCase(),title=(n.getAttribute('title')||'').trim().toLowerCase();if(['calls','new call','voice call','video call'].includes(t)||['voice call','video call'].includes(title))n.remove();});}catch(_){} }
function fixBrokenImages(root){
  try{
    (root||document).querySelectorAll('img').forEach(img=>{
      if(img.classList.contains('jm-subcat-img'))return;
      if(!img.getAttribute('src')||/\/undefined(?:$|[?#])/i.test(img.getAttribute('src')))img.src='/icons/necpa-192.png';
      if(!img.dataset.necpraImageGuard){
        img.dataset.necpraImageGuard='1';
        img.addEventListener('error',()=>{
          if(!img.dataset.necpraImageFallback){
            img.dataset.necpraImageFallback='1';
            img.src='/icons/necpa-192.png';
          }
        });
      }
    });
  }catch(_){}
}
function loadOnce(src,key){const safe=String(key||'loader').replace(/[^a-zA-Z0-9_-]/g,'_');if(document.querySelector('script[data-necpra-loader="'+safe+'"]'))return;const s=document.createElement('script');s.src=src;s.async=false;s.setAttribute('data-necpra-loader',safe);(document.head||document.documentElement).appendChild(s);}
function disableLegacyCallHandlers(){try{window.setupGlobalCallBanner=function(){};window.hideGlobalBanner=function(){};window.showIncomingCallBanner=function(){};window.pendingIncomingCall=null;window.__activeCallInProgress=false;}catch(_){}removeCalls();}
window.__rewriteApiUrl=function(input){const origin=requireBackendOrigin();if(!origin)return input;const normalize=u=>{if(!u||typeof u!=='string')return u;if(/^\/api(?:\/|$)/i.test(u)||/^\/socket\.io(?:\/|$)/i.test(u)||/^\/ws(?:\/|$)/i.test(u))return origin+u;try{const p=new URL(u,window.location.origin);if(/^\/api(?:\/|$)/i.test(p.pathname)||/^\/socket\.io(?:\/|$)/i.test(p.pathname)||/^\/ws(?:\/|$)/i.test(p.pathname))return origin+p.pathname+p.search+p.hash;}catch(_){}return u;};if(typeof Request!=='undefined'&&input instanceof Request){const u=normalize(input.url);return u===input.url?input:new Request(u,input);}return normalize(input);};
if(!window.__NECPRA_FETCH_PATCHED__&&window.fetch){window.__NECPRA_FETCH_PATCHED__=true;const nativeFetch=window.fetch.bind(window);window.fetch=(input,init)=>{try{const u=typeof input==='string'?input:input?.url||'';const p=new URL(u,window.location.origin).pathname;if(/^\/api\/calls(?:\/|$)/i.test(p))return Promise.resolve(new Response(JSON.stringify({success:true,disabled:true,data:[],listings:[],message:'Calling is disabled'}),{status:200,headers:{'Content-Type':'application/json'}}));}catch(_){}return nativeFetch(window.__rewriteApiUrl(input),init);};}
if(!window.__NECPRA_XHR_PATCHED__&&window.XMLHttpRequest){window.__NECPRA_XHR_PATCHED__=true;const open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url){return open.apply(this,[method,window.__rewriteApiUrl(url)].concat([].slice.call(arguments,2)));};}
if(!window.__NECPRA_WS_PATCHED__&&window.WebSocket){window.__NECPRA_WS_PATCHED__=true;const Native=window.WebSocket;const Wrapped=function(url,protocols){let target=url;try{const p=new URL(url,window.location.origin);if(/^\/socket\.io(?:\/|$)/i.test(p.pathname)||/^\/ws(?:\/|$)/i.test(p.pathname)){const a=new URL(requireBackendOrigin());p.protocol=a.protocol==='https:'?'wss:':'ws:';p.host=a.host;target=p.toString();}}catch(_){}return protocols===undefined?new Native(target):new Native(target,protocols);};Wrapped.prototype=Native.prototype;window.WebSocket=Wrapped;}
window.apiCall=async function(endpoint,options){
  const url=window.__getApiBase()+String(endpoint||'').replace(/^\/?/,'/');
  const opts=Object.assign({},options||{});
  opts.headers=Object.assign({'Content-Type':'application/json'},options?.headers||{});
  const token=localStorage.getItem('authToken')||localStorage.getItem('accessToken')||localStorage.getItem('token');
  if(token&&!opts.headers.Authorization)opts.headers.Authorization='Bearer '+token;
  try{const r=await fetch(url,opts);return await r.json().catch(()=>({success:false,status:r.status}));}catch(e){console.error('[API] Request failed:',e);return{success:false,message:e.message};}
};
try{Object.defineProperty(window,'authToken',{configurable:true,enumerable:true,get(){return localStorage.getItem('authToken')||localStorage.getItem('accessToken')||localStorage.getItem('token')||'';},set(v){if(v)localStorage.setItem('authToken',v);}});}catch(_){}
function init(){applyBrand(document);normalizeIcons();disableLegacyCallHandlers();fixBrokenImages(document);loadOnce('/js/admin-support-bridge.js?v=20260916-4','admin_support_bridge');if(/\/index\.html$/i.test(location.pathname)||location.pathname==='/')loadOnce('/js/pwa-identity.js?v=20260916-4','pwa_identity');if(/\/group\.html$/i.test(location.pathname))loadOnce('/js/group-panel-cleanup.js?v=20260916-4','group_panel_cleanup');if(/\/chat\.html$/i.test(location.pathname))loadOnce('/js/friend-request-center-action.js?v=20260916-4','friend_request_center_action');if(/\/Tools\.html$/i.test(location.pathname)||/\/tools\.html$/i.test(location.pathname)){loadOnce('/js/marketplace-accommodation-service.js?v=20260916-4','marketplace_accommodation_service');loadOnce('/js/accommodation-marketplace-surface.js?v=20260916-4','accommodation_marketplace_surface');loadOnce('/js/invoice-ui.js?v=20260916-4','invoice_ui');loadOnce('/js/marketplace-image-hardening.js?v=20260916-5','marketplace_image_hardening');}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
if(window.MutationObserver)new MutationObserver(ms=>ms.forEach(m=>m.addedNodes?.forEach(n=>{if(n.nodeType===1){applyBrand(n);removeCalls(n);fixBrokenImages(n);}}))).observe(document.documentElement,{childList:true,subtree:true});
console.log('[Config] Necpa runtime configuration loaded. Backend:',configuredOrigin||'(missing)');
})();