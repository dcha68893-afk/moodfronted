/* Groups module shell cleanup + deterministic list/panel navigation bridge. */
(function(){
'use strict';
if(window.__NECPRA_GROUP_PANEL_CLEANUP__)return;
window.__NECPRA_GROUP_PANEL_CLEANUP__=true;
const VERSION='20260916-group6';
function load(src,key){if(document.querySelector(`script[data-${key}]`))return;const s=document.createElement('script');s.src=`${src}?v=${VERSION}`;s.async=false;s.dataset[key]='1';(document.head||document.documentElement).appendChild(s)}
function removeDuplicateShell(){document.querySelector('.top')?.remove();document.querySelector('#chat .chatbar')?.remove()}
function parentCreateBridge(){try{const p=window.parent;if(!p||p===window)return;const bind=()=>{const nodes=p.document.querySelectorAll('button,a,[role="button"]');nodes.forEach(el=>{if(el.dataset.groupCreateBound==='1')return;const text=[el.id,el.className,el.getAttribute('aria-label'),el.getAttribute('title'),el.textContent].join(' ').toLowerCase();const marked=/(group.*(create|new|add)|(create|new|add).*group)/.test(text);const plus=/^[+＋]$/.test(String(el.textContent||'').trim());const headerPlus=plus&&!!el.closest('#globalHeader,.header-actions,.module-header');if(!marked&&!headerPlus)return;el.dataset.groupCreateBound='1';el.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation();const frame=p.document.querySelector('iframe[src*="group.html"],iframe[data-module="groups"]');try{frame?.contentWindow?.postMessage({type:'GROUP_CREATE_REQUEST',source:'chat-parent'},'*')}catch(_){}},true)})};bind();if(!p.__NECPRA_GROUP_CREATE_OBSERVER__){p.__NECPRA_GROUP_CREATE_OBSERVER__=new MutationObserver(bind);p.__NECPRA_GROUP_CREATE_OBSERVER__.observe(p.document.documentElement,{childList:true,subtree:true})}}catch(e){console.warn('[Groups] parent create bridge unavailable:',e.message)}}
function restoreListView(){
  try{
    const layout=document.getElementById('layout');
    layout?.classList.remove('chat-open');
    const sidebar=document.querySelector('.sidebar');
    const panel=document.querySelector('.panel');
    if(sidebar)sidebar.style.removeProperty('display');
    if(panel)panel.style.removeProperty('display');
    window.__NECPRA_GROUP_CURRENT_ID__=null;
    window.dispatchEvent(new CustomEvent('necpra:group-back-to-list'));
    window.postMessage({type:'GROUP_PANEL_BACK_TO_LIST',source:'groups'},'*');
    window.parent?.postMessage({type:'GROUP_PANEL_BACK_TO_LIST',source:'groups'},'*');
  }catch(_){}
}
function parentNavigationBridge(){
  window.addEventListener('message',function(ev){
    const d=ev.data||{};
    if(d.type!=='GO_BACK_TO_LIST'&&d.type!=='GROUP_BACK_TO_LIST'&&d.type!=='GROUP_PANEL_CLOSE')return;
    restoreListView();
  },false);
}
function initialize(){
  removeDuplicateShell();
  load('/js/group-chat-features.js','groupChatFeatures');
  load('/js/group-message-cache.js','groupMessageCache');
  load('/js/group-media-render.js','groupMediaRender');
  load('/js/group-settings-bridge.js','groupSettingsBridge');
  parentCreateBridge();
  parentNavigationBridge();
  try{const p=window.parent;if(p&&p!==window&&!p.document.querySelector('script[data-parent-group-call]')){const s=p.document.createElement('script');s.src=`/js/group-call-parent-bridge.js?v=${VERSION}`;s.async=false;s.dataset.parentGroupCall='1';p.document.head.appendChild(s)}}catch(e){console.warn('[Groups] call bridge unavailable:',e.message)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
window.addEventListener('beforeunload',()=>{try{window.parent?.postMessage({type:'GROUP_PANEL_CLOSE',source:'groups'},'*')}catch(_) {}});
})();
