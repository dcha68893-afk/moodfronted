/* Group -> Friends bridge. group.html already loads this filename from config.js. */
(function(){
  'use strict';
  if (window.__FRIENDS_GROUP_BRIDGE__) return;
  window.__FRIENDS_GROUP_BRIDGE__ = true;
  const base=()=>String(window.__getApiBase?.()||window.API_BASE_URL||'').replace(/\/$/,'');
  const token=()=>window.__kynToken||window.__accessToken||localStorage.getItem('authToken')||localStorage.getItem('accessToken')||localStorage.getItem('token')||'';
  async function api(path,opt={}){const headers={...(opt.headers||{})};const t=token();if(t)headers.Authorization='Bearer '+t;if(opt.body&&typeof opt.body!=='string'){headers['Content-Type']='application/json';opt={...opt,body:JSON.stringify(opt.body)}}const r=await fetch(base()+path,{...opt,headers});const d=await r.json().catch(()=>({}));if(!r.ok||d.success===false)throw Error(d.message||'Friend request failed');return d;}
  function decorate(){
    const list=document.getElementById('membersList'); if(!list)return;
    list.querySelectorAll('.member').forEach(row=>{
      if(row.querySelector('.group-friend-action'))return;
      const username=(row.querySelector('.who small')?.textContent||'').replace(/^@/,'').trim();
      const name=(row.querySelector('.who b')?.textContent||'Member').trim();
      if(!username)return;
      const wrap=document.createElement('span');wrap.className='group-friend-action';wrap.style.cssText='display:flex;gap:5px;margin-left:auto';
      const btn=document.createElement('button');btn.type='button';btn.className='smallbtn';btn.textContent='Add friend';btn.title='Send friend request to '+name;
      btn.onclick=async()=>{btn.disabled=true;btn.textContent='Sending…';try{const s=await api('/friend-discovery/search?q='+encodeURIComponent(username)+'&limit=5');const u=(s.data?.users||[]).find(x=>String(x.username).toLowerCase()===username.toLowerCase());if(!u)throw Error('User could not be found');const r=await api('/friends/requests',{method:'POST',body:{userId:Number(u.id)}});const rel=r.data?.relationship||r.data;btn.textContent=rel?.status==='accepted'?'Friends':'Request sent';}catch(e){btn.disabled=false;btn.textContent='Add friend';alert(e.message)}};
      wrap.appendChild(btn);row.appendChild(wrap);
    });
  }
  const observer=new MutationObserver(decorate); observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate);else decorate();
})();
