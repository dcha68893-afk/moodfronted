/* Group call bridge for the parent chat shell. Parent header is the single visible owner. */
(function () {
  'use strict';
  if (window.__NECPRA_GROUP_CALL_PARENT_BRIDGE__) return;
  window.__NECPRA_GROUP_CALL_PARENT_BRIDGE__ = true;
  let activeGroup=null, loading=null;
  const normalize=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ');
  function loadGroupCall(){if(window.GroupCall)return Promise.resolve(window.GroupCall);if(loading)return loading;loading=new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-parent-group-call]');if(existing){const wait=()=>window.GroupCall?resolve(window.GroupCall):setTimeout(wait,50);wait();return;}const s=document.createElement('script');s.src='/js/group-call.js';s.async=false;s.dataset.parentGroupCall='true';s.onload=()=>resolve(window.GroupCall);s.onerror=reject;(document.head||document.documentElement).appendChild(s);});return loading;}
  async function refreshGroupMeta(group){
    const id=group?.id||group?.chatId; if(!id) return group;
    try {
      const base=window.__getApiBase?.(); if(!base) return group;
      const token=window.__kynToken||window.__accessToken||window.authToken||localStorage.getItem('authToken')||localStorage.getItem('accessToken')||localStorage.getItem('token');
      const r=await fetch(`${base}/chats/${encodeURIComponent(id)}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
      if(!r.ok)return group;
      const d=await r.json().catch(()=>({})); const fresh=d?.data?.chat||d?.data||d;
      const participants=Array.isArray(fresh?.participants)?fresh.participants:[];
      return {...group,...fresh,participantCount:fresh?.participantCount ?? participants.length,participants};
    } catch(e){console.warn('[Groups] header metadata refresh failed:',e.message);return group;}
  }
  function buttonKind(button){if(!button)return null;const text=normalize([button.id,button.className,button.getAttribute('aria-label'),button.getAttribute('title'),button.textContent].join(' '));if(/(video|camera|videocall|video call)/.test(text))return'video';if(/(voice|audio|microphone|mic|voicecall|voice call)/.test(text))return'audio';return null;}
  function bindButtons(){if(!activeGroup)return;document.querySelectorAll('button,a,[role="button"]').forEach(el=>{const kind=buttonKind(el);if(!kind||el.dataset.groupCallParentBound==='1')return;el.dataset.groupCallParentBound='1';el.addEventListener('click',async event=>{if(!activeGroup)return;event.preventDefault();event.stopImmediatePropagation();try{const call=await loadGroupCall();if(!call||typeof call.start!=='function')throw new Error('Group calling is not available.');await call.start(kind,activeGroup);}catch(error){console.error('[GroupCall] parent header start failed:',error);alert(error.message||'Unable to start group call.');}},true);});}
  window.addEventListener('message',async event=>{const data=event?.data;if(!data||typeof data!=='object')return;if(data.type==='GROUP_PANEL_OPEN'){const original=data.payload||{};activeGroup=await refreshGroupMeta(original);bindButtons();return;}if(data.type==='GROUP_PANEL_CLOSE'||data.type==='GROUP_PANEL_CLOSED'){activeGroup=null;}});
  new MutationObserver(bindButtons).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindButtons,{once:true});else bindButtons();
})();
