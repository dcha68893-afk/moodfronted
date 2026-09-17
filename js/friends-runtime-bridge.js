/* Friends runtime bridge: compact, theme-aware navigation controls. */
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
    button.id='fabAddFriend'; button.type='button'; button.title='Add friend'; button.setAttribute('aria-label','Add friend');
    button.innerHTML='<span aria-hidden="true">＋</span>';
    const style=document.createElement('style');
    style.textContent='#fabAddFriend{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:36px;height:36px;min-width:36px;max-width:36px;border:1px solid var(--kyn-border);border-radius:10px;background:var(--kyn-bg-panel);color:var(--kyn-accent-primary);font-size:21px;line-height:1;display:grid;place-items:center;z-index:100;cursor:pointer;box-shadow:none;padding:0;overflow:hidden}#fabAddFriend:hover{transform:translateY(-50%);background:var(--kyn-bg-hover);box-shadow:var(--kyn-shadow-sm)}#fabAddFriend:active{transform:translateY(-50%) scale(.94)}';
    document.head.appendChild(style);
    if(getComputedStyle(header).position==='static') header.style.position='relative';
    header.appendChild(button);
  }
  if(!button.__friendsBound){button.__friendsBound=true;button.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openFriends();});}
}
function installFriendsNavigation(){
  try{
    const selectors=['a[href*="friend.html"]','[data-module="friends"]','[data-page="friends"]','[data-nav="friends"]','[data-target="friends"]'];
    document.querySelectorAll(selectors.join(',')).forEach(function(item){
      item.classList.add('necpra-friends-nav'); item.style.setProperty('color','var(--kyn-text-primary)','important'); item.style.setProperty('visibility','visible','important'); item.style.setProperty('opacity','1','important');
      item.style.setProperty('display','flex','important'); item.style.setProperty('align-items','center','important'); item.style.setProperty('gap','8px','important');
      item.querySelectorAll('i,svg,.icon,.nav-icon').forEach(function(icon){icon.style.setProperty('color','var(--kyn-accent-primary)','important');icon.style.setProperty('fill','currentColor','important');icon.style.setProperty('stroke','currentColor','important');icon.style.setProperty('opacity','1','important');});
    });
  }catch(_){}
}
function boot(){install();installFriendsNavigation();setTimeout(install,250);setTimeout(installFriendsNavigation,250);setTimeout(install,1000);setTimeout(installFriendsNavigation,1000);setTimeout(install,2500);setTimeout(installFriendsNavigation,2500);}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
new MutationObserver(function(){install();installFriendsNavigation();}).observe(document.documentElement,{childList:true,subtree:true});
})();
