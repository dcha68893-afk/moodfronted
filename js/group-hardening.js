/* Group chat hardening: mobile single-pane navigation, edit-bar cleanup,
 * scoped group transport, and polling fallback for reliable delivery. */
(function(){
  'use strict';
  if (window.__NECPRA_GROUP_HARDENING__) return;
  window.__NECPRA_GROUP_HARDENING__ = true;

  const api = () => String(window.__getApiBase?.() || window.API_BASE_URL || '').replace(/\/$/, '');
  const token = () => window.__kynToken || window.__accessToken || localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
  let currentGroupId = null;
  let pollTimer = null;
  const seenMessages = new Set();

  function isMobile(){
    const ua=navigator.userAgent||'';
    if(/Android|iPhone|iPad|iPod|Mobile/i.test(ua))return true;
    let width = window.innerWidth || 9999;
    try { if (window.parent && window.parent !== window) width = Math.min(width, window.parent.innerWidth || width); } catch(_) {}
    return width <= 900;
  }

  function applyPaneMode(){
    const layout=document.getElementById('layout');
    const side=document.querySelector('.sidebar');
    const panel=document.querySelector('.panel');
    if(!layout||!side||!panel)return;
    const mobile=isMobile();
    layout.classList.toggle('necpra-mobile-group',mobile);
    if(mobile){
      const open=layout.classList.contains('chat-open');
      side.style.display=open?'none':'flex';
      panel.style.display=open?'flex':'none';
    }else{
      side.style.removeProperty('display');
      panel.style.removeProperty('display');
    }
  }

  function removeEditBar(){
    document.querySelectorAll('body *').forEach(el=>{
      if(el.children.length>4) return;
      const text=(el.textContent||'').trim().toLowerCase();
      if(text==='editing message') el.remove();
      else if(text.includes('editing message') && text.includes('cancel')){
        const box=el.closest('.editing-message,.edit-bar,.message-edit-bar,[class*="edit"]') || el.parentElement;
        if(box && box !== document.body) box.remove();
      }
    });
  }

  function ensureMobileBack(){
    if(!isMobile()) return;
    const panel=document.querySelector('.panel');
    const messages=document.getElementById('messages');
    if(!panel||!messages||panel.querySelector('[data-necpra-group-back]'))return;
    const b=document.createElement('button');
    b.type='button'; b.dataset.necpraGroupBack='1'; b.textContent='← Groups';
    b.style.cssText='display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--border,#e2e8f0);background:var(--surface,#fff);color:inherit;padding:11px 14px;font-weight:800;position:sticky;top:0;z-index:4';
    b.onclick=()=>{ document.getElementById('layout')?.classList.remove('chat-open'); currentGroupId=null; applyPaneMode(); window.parent?.postMessage({type:'GROUP_PANEL_BACK_TO_LIST',source:'groups'},'*'); };
    panel.insertBefore(b,messages);
  }

  function patchFetch(){
    if(window.__NECPRA_GROUP_FETCH_PATCHED__)return;
    window.__NECPRA_GROUP_FETCH_PATCHED__=true;
    const native=window.fetch.bind(window);
    window.fetch=function(input,init){
      let url=typeof input==='string'?input:(input?.url||'');
      try{
        const u=new URL(url,location.origin);
        const path=u.pathname;
        const isMessagesHistory=/\/api\/messages\/\d+$/.test(path) || /\/messages\/\d+$/.test(path);
        const isMessagesPost=(path==='/api/messages'||path==='/messages') && String(init?.method||'GET').toUpperCase()==='POST';
        if(isMessagesHistory && isMobileGroupPage()){
          u.searchParams.set('scope','group');
          url=u.toString();
          currentGroupId=path.match(/(\d+)$/)?.[1] || currentGroupId;
        }
        if(isMessagesPost && isMobileGroupPage()){
          try{
            const body=JSON.parse(init?.body||'{}');
            if(body.chatId){
              currentGroupId=String(body.chatId);
              body.metadata=Object.assign({},body.metadata||{},{groupId:Number(body.chatId),chatType:'group',isGroup:true});
              init=Object.assign({},init,{body:JSON.stringify(body)});
            }
          }catch(_){}
        }
        return native(url,init);
      }catch(_) { return native(input,init); }
    };
  }

  function isMobileGroupPage(){ return /\/group\.html$/i.test(location.pathname); }

  const nativeFetch=window.fetch.bind(window);
  async function pollGroup(){
    if(!currentGroupId)return;
    try{
      const h={'Content-Type':'application/json'}; const t=token(); if(t)h.Authorization='Bearer '+t;
      const r=await nativeFetch(`${api()}/messages/${encodeURIComponent(currentGroupId)}?scope=group&limit=100`,{headers:h});
      if(!r.ok)return;
      const d=await r.json().catch(()=>({}));
      const list=d?.data?.messages||d?.data||[];
      list.forEach(m=>{
        if(!m?.id||seenMessages.has(String(m.id)))return;
        seenMessages.add(String(m.id));
        window.postMessage({type:'group:message',payload:{message:m,groupId:Number(currentGroupId)}},'*');
      });
    }catch(_){}
  }

  function observe(){
    applyPaneMode(); ensureMobileBack(); removeEditBar();
    const layout=document.getElementById('layout');
    if(layout && !layout.__necpraPaneObserver){
      layout.__necpraPaneObserver=true;
      new MutationObserver(()=>{applyPaneMode();ensureMobileBack();removeEditBar();}).observe(layout,{attributes:true,attributeFilter:['class'],subtree:true,childList:true});
    }
    new MutationObserver(()=>{removeEditBar();ensureMobileBack();}).observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize',applyPaneMode,{passive:true});
    window.addEventListener('message',e=>{const d=e.data||{};if(d.type==='GROUP_PANEL_OPEN'){currentGroupId=String(d.payload?.groupId||d.payload?.id||'');applyPaneMode();ensureMobileBack()}if(d.type==='GROUP_PANEL_BACK_TO_LIST'||d.type==='GROUP_BACK_TO_LIST'){currentGroupId=null;applyPaneMode()}});
    patchFetch();
    clearInterval(pollTimer); pollTimer=setInterval(pollGroup,2500);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});else observe();
})();
