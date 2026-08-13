/* Mood Tools — Commercial UX & reliability layer v1
 * Additive: does not replace the existing tool registry/core/UI.
 * Intended to be loaded after Tool-ui.js and tool-ui-patch.js.
 */
(function(){
'use strict';
if(window.__MOOD_TOOLS_COMMERCIAL_V1__)return;window.__MOOD_TOOLS_COMMERCIAL_V1__=true;
const css=`
.tool-commercial-shell{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;height:100%;min-height:0}
.tool-commercial-main{min-width:0;min-height:0}.tool-commercial-side{min-width:0;min-height:0;overflow:auto}
.tc-card{border:1px solid var(--border-color,#ddd);background:var(--card-bg,#fff);border-radius:16px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.06)}
.tc-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.tc-toolbar input{flex:1;min-width:180px}
.tc-chip{border:1px solid var(--border-color,#ddd);background:var(--secondary-color,#f5f5f5);border-radius:999px;padding:8px 12px;font-size:12px;cursor:pointer}.tc-chip.active{background:var(--primary-color,#0084ff);color:#fff;border-color:transparent}
.tc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}.tc-tool{position:relative;transition:transform .18s,box-shadow .18s}.tc-tool:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(0,0,0,.1)}
.tc-tool h4{margin:8px 0 5px}.tc-tool p{margin:0;color:var(--text-secondary,#777);font-size:12px;line-height:1.45}.tc-fav{position:absolute;right:10px;top:10px;border:0;background:transparent;cursor:pointer;font-size:18px}
.tc-recent{display:flex;flex-direction:column;gap:7px}.tc-recent button{display:flex;justify-content:space-between;align-items:center;width:100%;border:1px solid var(--border-color,#ddd);background:transparent;border-radius:10px;padding:9px;cursor:pointer;text-align:left}
.tc-status{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-secondary,#777)}.tc-dot{width:8px;height:8px;border-radius:50%;background:#22c55e}.tc-dot.offline{background:#f59e0b}
.tc-skeleton{height:94px;border-radius:14px;background:linear-gradient(90deg,#00000008 25%,#00000015 50%,#00000008 75%);background-size:200% 100%;animation:tcshine 1.4s infinite}@keyframes tcshine{to{background-position:-200% 0}}
@media(max-width:800px){.tool-commercial-shell{grid-template-columns:1fr}.tool-commercial-side{display:none}}
`;
const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
const recentKey='mood.tools.recent.v1',favKey='mood.tools.favorites.v1';
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'[]')}catch{return[]}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v.slice(0,30)))}catch{}};
function remember(id,name){let a=read(recentKey).filter(x=>x.id!==id);a.unshift({id,name,at:Date.now()});write(recentKey,a)}
function toggleFav(id){let a=read(favKey);a=a.includes(id)?a.filter(x=>x!==id):[id,...a];write(favKey,a);return a.includes(id)}
function online(){return navigator.onLine!==false}
function status(){document.querySelectorAll('[data-tool-commercial-status]').forEach(e=>{e.innerHTML=`<span class="tc-dot ${online()?'':'offline'}"></span>${online()?'Online':'Offline — local tools available'}`})}
function enhance(){
 status();window.addEventListener('online',status);window.addEventListener('offline',status);
 document.addEventListener('click',e=>{const el=e.target.closest('[data-tool-id]');if(el){const id=el.dataset.toolId;if(id)remember(id,el.dataset.toolName||id)}});
 window.addEventListener('tools:manifest-loaded',()=>{status();renderRecent()});
 window.addEventListener('tools:ready',()=>{status();renderRecent()});
 renderRecent();
}
function renderRecent(){const box=document.querySelector('[data-tool-commercial-recent]');if(!box)return;const a=read(recentKey);box.innerHTML=a.length?a.slice(0,8).map(x=>`<button type="button" data-reopen-tool="${String(x.id).replace(/"/g,'&quot;')}"><span>${String(x.name||x.id).replace(/[<>&]/g,'')}</span><small>${new Date(x.at).toLocaleDateString()}</small></button>`).join(''):'<span style="color:var(--text-secondary,#777);font-size:12px">Your recently used tools appear here.</span>'}
window.MoodToolsCommercial={version:'1.0.0',remember,toggleFavorite:toggleFav,getRecent:()=>read(recentKey),getFavorites:()=>read(favKey),online};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
})();
