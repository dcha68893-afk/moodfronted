/* Canonical user-report + admin support bridge. */
(function(){
  'use strict';
  if(window.__NECPRA_ADMIN_SUPPORT_BRIDGE__)return;
  window.__NECPRA_ADMIN_SUPPORT_BRIDGE__=true;
  const api=()=>typeof window.__getApiBase==='function'?window.__getApiBase():'';
  const token=()=>window.__kynToken||window.__accessToken||window.AuthSessionManager?.getToken?.()||window.authToken||localStorage.getItem('authToken')||localStorage.getItem('accessToken')||localStorage.getItem('token');
  async function call(path,options={}){const headers={'Content-Type':'application/json',...(options.headers||{})};const t=token();if(t)headers.Authorization=`Bearer ${t}`;const r=await fetch(`${api()}${path}`,{...options,headers,credentials:'include'});const d=await r.json().catch(()=>({}));if(!r.ok||d.success===false)throw new Error(d.message||`Request failed (${r.status})`);return d.data??d;}
  async function report(el){
    const messageId=Number(el.dataset.messageId||el.closest('[data-message-id]')?.dataset.messageId||el.dataset.reportMessageId);
    const chatId=Number(el.dataset.chatId||el.closest('[data-chat-id]')?.dataset.chatId||el.dataset.reportChatId);
    if(!messageId||!chatId){alert('This report action is missing the message and chat identifiers.');return;}
    const reason=prompt('Report reason: spam, harassment, hate_speech, violence, sexual_content, misinformation, or other','other')||'other';
    const details=prompt('Additional details (optional):','')||'';
    try{await call('/admin/reports',{method:'POST',body:JSON.stringify({messageId,chatId,reason,details})});alert('Report submitted to the administrators.')}catch(e){console.error('[AdminSupport] report failed',e);alert(e.message||'Unable to submit report.');}
  }
  async function chatWithAdmin(){
    try{const data=await call('/admin/contact',{method:'POST',body:'{}'});const chatId=data?.chatId;const admin=data?.admin||{};if(!chatId)throw new Error('No administrator chat is available.');const payload={type:'OPEN_CONVERSATION',chatId,userId:admin.userId,username:admin.username,displayName:admin.displayName,source:'admin-support'};window.postMessage(payload,'*');window.dispatchEvent(new CustomEvent('kyn:open-conversation',{detail:payload}));window.parent?.postMessage(payload,'*');}
    catch(e){console.error('[AdminSupport] admin chat failed',e);alert(e.message||'Unable to open the administrator chat.');}
  }
  async function whatsappAdmin(){
    try{const data=await call('/admin/whatsapp');if(!data?.url)throw new Error('Admin WhatsApp is not configured.');window.open(data.url,'_blank','noopener,noreferrer');}
    catch(e){console.error('[AdminSupport] WhatsApp action failed',e);alert(e.message||'Admin WhatsApp is not configured.');}
  }
  function classify(el){
    const text=[el.id,el.getAttribute('aria-label'),el.getAttribute('title'),el.textContent].join(' ').trim().toLowerCase();
    if(/whatsapp.*admin|admin.*whatsapp|whatsapp.*support|support.*whatsapp/.test(text))return'admin-whatsapp';
    if(/chat\s*(with|to)\s*(the\s*)?admin|contact\s*(support|admin)/.test(text))return'admin-chat';
    if(/\breport\b/.test(text)&&el.dataset.messageId)return'report';
    return null;
  }
  document.addEventListener('click',ev=>{const el=ev.target.closest?.('button,a,[role="button"],input[type="button"],input[type="submit"]');if(!el)return;const kind=classify(el);if(kind==='report'){ev.preventDefault();ev.stopPropagation();report(el)}else if(kind==='admin-chat'){ev.preventDefault();ev.stopPropagation();chatWithAdmin()}else if(kind==='admin-whatsapp'){ev.preventDefault();ev.stopPropagation();whatsappAdmin()}},true);
})();
