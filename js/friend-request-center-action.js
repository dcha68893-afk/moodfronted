/* Parent Friends action + unified shell loader. */
(function(){
'use strict';
if(!/\/chat\.html$/i.test(location.pathname))return;
function openFriends(){
  try{if(typeof window.__openFriendsAdd==='function')return window.__openFriendsAdd();}catch(_){ }
  try{if(typeof window.__openFriendsOverlay==='function')return window.__openFriendsOverlay('friend.html?mode=add');}catch(_){ }
  if(typeof window.navigateToPage==='function') window.navigateToPage('friends');
}
function install(){
  var header=document.getElementById('globalHeader')||document.querySelector('header')||document.querySelector('.global-header')||document.querySelector('[data-global-header]');
  if(!header)return;
  var b=document.getElementById('fabAddFriend');
  if(!b){
    b=document.createElement('button');b.id='fabAddFriend';b.type='button';b.title='Add friend';b.setAttribute('aria-label','Add friend');b.innerHTML='＋';
    var s=document.createElement('style');s.textContent='#fabAddFriend{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:40px;height:40px;border:1px solid var(--kyn-border,#e2e8f0);border-radius:12px;background:var(--kyn-bg-panel,#fff);color:var(--kyn-text-primary,#0f172a);font-size:24px;line-height:1;display:grid;place-items:center;z-index:100;cursor:pointer;box-shadow:0 5px 18px rgba(0,0,0,.1)}#fabAddFriend:hover{transform:translateY(-50%) scale(1.05)}';document.head.appendChild(s);
    if(getComputedStyle(header).position==='static')header.style.position='relative';header.appendChild(b);
  }
  if(!b.__friendsBound){b.__friendsBound=true;b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openFriends();},true);}
}
function boot(){install();setTimeout(install,300);setTimeout(install,1000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

/* Load the single parent-shell screen authority from the parent shell only. */
(function(){
'use strict';
if(!/\/chat\.html$/i.test(location.pathname)||window.__NECPRA_UNIFIED_SCREEN_LOADER__)return;
window.__NECPRA_UNIFIED_SCREEN_LOADER__=true;
function load(){
  if(document.querySelector('script[data-necpra-unified-screen]'))return;
  var s=document.createElement('script');
  s.src='/js/unified-screen-controller.js?v=20260917-2';
  s.async=false;
  s.setAttribute('data-necpra-unified-screen','1');
  (document.head||document.documentElement).appendChild(s);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
