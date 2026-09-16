/* Necpra Status ordering + viewed-history bridge.
 * The status feed remains server-authoritative. This module only adds the
 * presentation/state layer for "Recently Updated" and "Recently Viewed".
 */
(function(){
  'use strict';
  if(window.__NECPRA_STATUS_RECENT_SECTIONS__)return;
  window.__NECPRA_STATUS_RECENT_SECTIONS__=true;
  const KEY='necpra_status_recent_viewed_v1';
  const MAX=100;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getId=el=>String(el?.dataset?.statusId||el?.dataset?.id||el?.getAttribute?.('data-status-id')||el?.getAttribute?.('data-id')||'');
  function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch(_){return[]}}
  function save(rows){try{localStorage.setItem(KEY,JSON.stringify(rows.slice(0,MAX)))}catch(_) {}}
  let viewed=load();
  function markViewed(el){
    const id=getId(el); if(!id)return;
    const title=el.querySelector?.('[data-status-name],.status-name,.user-name,.username,.status-user-name')?.textContent?.trim()||el.querySelector?.('h3,h4,strong')?.textContent?.trim()||'Status';
    const img=el.querySelector?.('img')?.getAttribute('src')||'';
    viewed=[{id,title: title||'Status',img,viewedAt:Date.now()},...viewed.filter(x=>String(x.id)!==id)].slice(0,MAX);
    save(viewed); renderViewed();
  }
  function findOriginal(id){
    const list=$('allStatusList'); if(!list)return null;
    return [...list.querySelectorAll('[data-status-id],[data-id]')].find(x=>getId(x)===String(id))||null;
  }
  function renderViewed(){
    const section=$('necpraRecentlyViewed'); if(!section)return;
    const box=section.querySelector('.necpra-recent-viewed-list');
    if(!box)return;
    if(!viewed.length){box.innerHTML='<div class="necpra-recent-empty">No viewed statuses yet.</div>';return;}
    box.innerHTML=viewed.map(x=>`<button type="button" class="necpra-recent-viewed-item" data-recent-id="${esc(x.id)}"><span class="necpra-recent-avatar">${x.img?`<img src="${esc(x.img)}" alt="">`:'◉'}</span><span class="necpra-recent-copy"><strong>${esc(x.title||'Status')}</strong><small>${new Date(x.viewedAt||Date.now()).toLocaleString()}</small></span><span>›</span></button>`).join('');
    box.querySelectorAll('[data-recent-id]').forEach(btn=>btn.addEventListener('click',()=>{const original=findOriginal(btn.dataset.recentId);if(original){original.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>original.click(),120)}}));
  }
  function ensureSections(){
    const current=$('allStatusSection'); if(!current||!current.parentNode)return false;
    const label=$('recentUpdatesLabel');
    if(label){label.style.display='block';label.textContent='Recently Updated';}
    let section=$('necpraRecentlyViewed');
    if(!section){
      section=document.createElement('section'); section.id='necpraRecentlyViewed'; section.className='statuses-section necpra-recent-viewed-section';
      section.innerHTML='<div class="sw-section-label">Recently Viewed</div><div class="necpra-recent-viewed-list"></div>';
      current.insertAdjacentElement('afterend',section);
    }
    return true;
  }
  function bind(){
    ensureSections(); renderViewed();
    const list=$('allStatusList'); if(!list||list.dataset.necpraRecentBound==='1')return;
    list.dataset.necpraRecentBound='1';
    list.addEventListener('click',ev=>{
      const card=ev.target.closest?.('[data-status-id],[data-id],.status-card,.status-item,.status-story,.status-user-card');
      if(card&&list.contains(card))markViewed(card);
    },true);
    const observer=new MutationObserver(()=>{ensureSections();renderViewed()});
    observer.observe(list,{childList:true,subtree:true});
  }
  const style=document.createElement('style');style.textContent=`
    #recentUpdatesLabel{display:block!important;margin-top:8px}
    #necpraRecentlyViewed{display:block!important;margin-top:14px}
    #necpraRecentlyViewed .sw-section-label{font-weight:700;margin:8px 0;padding:0 4px}
    .necpra-recent-viewed-list{display:flex;flex-direction:column;gap:6px;max-height:360px;overflow:auto;padding:2px 0}
    .necpra-recent-viewed-item{width:100%;display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--kyn-border,#e5e7eb);border-radius:12px;background:var(--kyn-bg-panel,#fff);color:var(--kyn-text-primary,#111);text-align:left;cursor:pointer}
    .necpra-recent-viewed-item:hover{background:var(--kyn-bg-hover,#f5f5f5)}
    .necpra-recent-avatar{width:38px;height:38px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:var(--kyn-bg-hover,#eee);flex:0 0 auto}
    .necpra-recent-avatar img{width:100%;height:100%;object-fit:cover}
    .necpra-recent-copy{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
    .necpra-recent-copy strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .necpra-recent-copy small{opacity:.65}
    .necpra-recent-empty{padding:12px;text-align:center;opacity:.65}
  `;(document.head||document.documentElement).appendChild(style);
  function boot(){bind();setTimeout(bind,500);setTimeout(bind,1500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
