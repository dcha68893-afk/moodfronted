/* Add a Friend Requests notification badge onto the mobile center '+'
 * action, without touching its own click behavior.
 *
 * FIX-GROUP-ICON: a previous version of this file did `btn.innerHTML =
 * ...` and `btn.onclick = openRequests`, which fully replaced the
 * button's icon and its inline `onclick="toggleCenterMenu(event)"`
 * handler. toggleCenterMenu() is the *only* way to reach the Calls/
 * Groups/Friends popup menu (there is no separate bottom-nav icon for
 * Groups), so that override silently made Groups unreachable from the
 * bottom nav and turned the '+' into a Friends-only shortcut. This
 * version leaves the button's existing icon/onclick alone and only
 * appends a small notification badge on top of it; the badge (not the
 * button) is what opens Friend Requests directly.
 *
 * Both incoming and outgoing requests already live in friend.html's
 * request view; this bridge only navigates there and opens that
 * existing view.
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
    // Icon, aria-label, title and the inline onclick (toggleCenterMenu)
    // are intentionally left untouched so Calls/Groups/Friends stay
    // reachable via the existing popup menu.
    const badge=document.createElement('span');
    badge.className='necpra-friend-request-badge';
    badge.setAttribute('aria-hidden','true');
    badge.title='Friend requests';
    badge.hidden=true;
    badge.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();openRequests();});
    btn.appendChild(badge);
    function syncBadge(){
      try{
        const f=findFriendFrame();const b=f?.contentDocument?.getElementById('friendRequestBadge');
        const n=Number.parseInt(b?.textContent||'0',10)||0;badge.textContent=n>0?(n>99?'99+':String(n)):'';badge.hidden=n<=0;
      }catch(_){badge.hidden=true}
    }
    syncBadge();setInterval(syncBadge,4000);
  }
  const s=document.createElement('style');s.textContent='.necpra-friend-request-badge{position:absolute;right:5px;top:3px;min-width:15px;height:15px;padding:0 3px;border-radius:99px;background:var(--kyn-accent-danger,#ef4444);color:#fff;font-size:8px;font-weight:800;display:grid;place-items:center;line-height:1;pointer-events:auto;cursor:pointer}.necpra-friend-request-badge[hidden]{display:none}#centerActionBtn{position:relative}';(document.head||document.documentElement).appendChild(s);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  new MutationObserver(bind).observe(document.documentElement,{childList:true,subtree:true});
})();
