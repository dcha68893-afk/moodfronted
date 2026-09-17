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
    style.textContent='#fabAddFriend{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:40px;height:40px;border:1px solid var(--kyn-border);border-radius:12px;background:var(--kyn-bg-panel);color:var(--kyn-accent-primary);font-size:25px;line-height:1;display:grid;place-items:center;z-index:100;cursor:pointer;box-shadow:var(--kyn-shadow-sm)}#fabAddFriend:hover{transform:translateY(-50%) scale(1.05);background:var(--kyn-bg-hover)}@media(max-width:768px){#fabAddFriend{width:38px;height:38px;color:var(--kyn-accent-primary);background:var(--kyn-bg-active)}}';
    document.head.appendChild(style);
    if(getComputedStyle(header).position==='static') header.style.position='relative';
    header.appendChild(button);
  }
  if(!button.__friendsBound){
    button.__friendsBound=true;
    button.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openFriends();});
  }
}
function installFriendsNavigation(){
  try{
    const selectors=['a[href*="friend.html"]','[data-module="friends"]','[data-page="friends"]','[data-nav="friends"]','[data-target="friends"]'];
    document.querySelectorAll(selectors.join(',')).forEach(function(item){
      item.classList.add('necpra-friends-nav');
      item.style.setProperty('color','var(--kyn-accent-primary)','important');
      item.style.setProperty('visibility','visible','important');
      item.style.setProperty('opacity','1','important');
      item.querySelectorAll('i,svg,.icon,.nav-icon').forEach(function(icon){
        icon.style.setProperty('color','var(--kyn-accent-primary)','important');
        icon.style.setProperty('fill','currentColor','important');
        icon.style.setProperty('stroke','currentColor','important');
      });
    });
  }catch(_){}
}
function boot(){install();installFriendsNavigation();setTimeout(install,250);setTimeout(installFriendsNavigation,250);setTimeout(install,1000);setTimeout(installFriendsNavigation,1000);setTimeout(install,2500);setTimeout(installFriendsNavigation,2500);}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
new MutationObserver(function(){install();installFriendsNavigation();}).observe(document.documentElement,{childList:true,subtree:true});
})();
