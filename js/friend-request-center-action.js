/* Replace the mobile center '+' action with a single Friend Requests entry.
 * Both incoming and outgoing requests already live in friend.html's request
 * view; this bridge only navigates there and opens that existing view.
 */
(function(){
  'use strict';
  if(window.__NECPRA_FRIEND_REQUEST_CENTER__)return;
  window.__NECPRA_FRIEND_REQUEST_CENTER__=true;
  function findFriendFrame(){return document.querySelector('iframe[src*="friend.html"],iframe[data-module="friends"]')}
  function openRequests(){
    try{
      const frame=findFriendFrame();
      if(frame?.contentWindow){frame.contentWindow.postMessage({type:'OPEN_FRIEND_REQUESTS',source:'center-friend-request'},'*');setTimeout(()=>{try{frame.contentDocument?.getElementById('friendRequestBellBtn')?.click()}catch(_){ }},150);return}
      window.postMessage({type:'SWITCH_MODULE',module:'friends',payload:{openRequests:true},source:'center-friend-request'},'*');
      window.dispatchEvent(new CustomEvent('kyn:open-friend-requests',{detail:{openRequests:true}}));
      setTimeout(()=>{const f=findFriendFrame();try{f?.contentWindow?.postMessage({type:'OPEN_FRIEND_REQUESTS',source:'center-friend-request'},'*');f?.contentDocument?.getElementById('friendRequestBellBtn')?.click()}catch(_){ }},600);
    }catch(_){}
  }
  function bind(){
    const btn=document.getElementById('centerActionBtn');
    if(!btn||btn.dataset.necpraFriendRequestBound==='1')return;
    btn.dataset.necpraFriendRequestBound='1';
    btn.setAttribute('aria-label','Friend requests');btn.setAttribute('title','Friend requests');
    btn.innerHTML='<i class="fas fa-user-friends" aria-hidden="true"></i><span class="necpra-friend-request-badge" aria-hidden="true"></span>';
    btn.onclick=function(ev){ev.preventDefault();ev.stopPropagation();openRequests()};
    const badge=btn.querySelector('.necpra-friend-request-badge');
    function syncBadge(){
      try{
        const f=findFriendFrame();const b=f?.contentDocument?.getElementById('friendRequestBadge');
        const n=Number.parseInt(b?.textContent||'0',10)||0;badge.textContent=n>0?(n>99?'99+':String(n)):'';badge.hidden=n<=0;
      }catch(_){badge.hidden=true}
    }
    syncBadge();setInterval(syncBadge,4000);
  }
  const s=document.createElement('style');s.textContent='.necpra-friend-request-badge{position:absolute;right:5px;top:3px;min-width:15px;height:15px;padding:0 3px;border-radius:99px;background:var(--kyn-accent-danger,#ef4444);color:#fff;font-size:8px;font-weight:800;display:grid;place-items:center;line-height:1}.necpra-friend-request-badge[hidden]{display:none}#centerActionBtn{position:relative}';(document.head||document.documentElement).appendChild(s);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  new MutationObserver(bind).observe(document.documentElement,{childList:true,subtree:true});
})();
