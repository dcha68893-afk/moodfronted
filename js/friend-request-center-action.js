/* Parent Friends action. config.js loads this on chat.html. */
(function(){
'use strict';
if(!/\/chat\.html$/i.test(location.pathname))return;
function openFriends(){
  try{if(typeof window.__openFriendsAdd==='function')return window.__openFriendsAdd();}catch(_){ }
  try{if(typeof window.__openFriendsOverlay==='function')return window.__openFriendsOverlay('friend.html?mode=add');}catch(_){ }
  window.location.href='friend.html?mode=add';
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
function boot(){install();setTimeout(install,250);setTimeout(install,1000);setTimeout(install,2500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
if(window.MutationObserver)new MutationObserver(function(){install();}).observe(document.documentElement,{childList:true,subtree:true});
})();
