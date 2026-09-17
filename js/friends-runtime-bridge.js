/* Friends runtime bridge: guarantees the parent Add Friend control exists and is wired. */
(function(){
'use strict';
if(!/\/chat\.html$/i.test(location.pathname)) return;
function openFriends(){
  if(typeof window.__openFriendsOverlay==='function') return window.__openFriendsOverlay('friend.html?mode=add');
  if(typeof window.__openFriendsAdd==='function') return window.__openFriendsAdd();
  window.location.href='friend.html?mode=add';
}
function install(){
  if(!document.body) return;
  const header=document.getElementById('globalHeader')||document.querySelector('header')||document.querySelector('.global-header')||document.querySelector('[data-global-header]');
  if(!header) return;
  let button=document.getElementById('fabAddFriend');
  if(!button){
    button=document.createElement('button');
    button.id='fabAddFriend';
    button.type='button';
    button.title='Add friend';
    button.setAttribute('aria-label','Add friend');
    button.innerHTML='<span aria-hidden="true">＋</span>';
    const style=document.createElement('style');
    style.textContent='#fabAddFriend{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:40px;height:40px;border:1px solid var(--kyn-border,#e2e8f0);border-radius:12px;background:var(--kyn-bg-panel,#fff);color:var(--kyn-text-primary,#0f172a);font-size:25px;line-height:1;display:grid;place-items:center;z-index:100;cursor:pointer;box-shadow:0 5px 18px rgba(0,0,0,.10)}#fabAddFriend:hover{transform:translateY(-50%) scale(1.05)}';
    document.head.appendChild(style);
    if(getComputedStyle(header).position==='static') header.style.position='relative';
    header.appendChild(button);
  }
  if(!button.__friendsBound){
    button.__friendsBound=true;
    button.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openFriends();});
  }
}
function boot(){install();setTimeout(install,250);setTimeout(install,1000);setTimeout(install,2500);}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
new MutationObserver(function(){install();}).observe(document.documentElement,{childList:true,subtree:true});
})();
