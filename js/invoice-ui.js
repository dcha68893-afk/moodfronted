'use strict';

(function () {
  if (window.NecpaInvoices) return;
  const state = { modal: null, orders: [] };
  const api = () => window.__getApiBase?.() || window.API_BASE_URL || '/api';
  const token = () => localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';

  async function request(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const response = await fetch(`${api()}${path}`, Object.assign({}, options, { headers }));
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      const payload = contentType.includes('json') ? await response.json().catch(() => ({})) : {};
      const error = new Error(payload.message || `Request failed (${response.status})`); error.status = response.status; throw error;
    }
    return contentType.includes('json') ? response.json() : response;
  }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
  function money(value, currency = 'KES') { return `${esc(currency)} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

  function injectStyles() {
    if (document.getElementById('necpraInvoiceStyles')) return;
    const s = document.createElement('style'); s.id = 'necpraInvoiceStyles';
    s.textContent = `
      #necpraInvoiceFab{position:fixed;right:18px;bottom:84px;z-index:2147483000;border:0;border-radius:999px;padding:12px 16px;background:var(--primary-color,#f57224);color:#fff;font-weight:800;box-shadow:0 8px 28px rgba(0,0,0,.22);cursor:pointer}
      #necpraInvoiceOverlay{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.58);display:none;align-items:center;justify-content:center;padding:16px}
      #necpraInvoiceModal{width:min(760px,100%);max-height:90vh;overflow:auto;background:var(--card-bg,#fff);color:var(--text-primary,#111827);border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
      .ncp-inv-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--border-color,#e5e7eb);position:sticky;top:0;background:inherit;z-index:2}.ncp-inv-title{font-size:19px;font-weight:900}.ncp-inv-close{border:0;background:transparent;font-size:24px;cursor:pointer;color:inherit}
      .ncp-inv-list{padding:12px 16px 20px}.ncp-inv-card{border:1px solid var(--border-color,#e5e7eb);border-radius:14px;padding:14px;margin:10px 0;display:grid;grid-template-columns:1fr auto;gap:10px}.ncp-inv-name{font-weight:800}.ncp-inv-meta{font-size:12px;opacity:.68;margin-top:4px}.ncp-inv-total{font-weight:900;margin-top:8px}.ncp-inv-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.ncp-inv-btn{border:0;border-radius:10px;padding:9px 12px;font-weight:800;cursor:pointer;background:#f57224;color:#fff}.ncp-inv-empty{padding:45px 20px;text-align:center;opacity:.7}.ncp-inv-error{padding:14px;background:#fff1f2;color:#9f1239;border-radius:12px;margin:12px 16px}@media(max-width:560px){#necpraInvoiceFab{bottom:76px;right:12px}.ncp-inv-card{grid-template-columns:1fr}.ncp-inv-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(s);
  }

  function ensureUi() {
    if (document.getElementById('necpraInvoiceFab')) return;
    injectStyles();
    const fab = document.createElement('button'); fab.id='necpraInvoiceFab'; fab.type='button'; fab.innerHTML='🧾 Invoices'; fab.addEventListener('click', openCenter); document.body.appendChild(fab);
    const overlay = document.createElement('div'); overlay.id='necpraInvoiceOverlay';
    overlay.innerHTML='<section id="necpraInvoiceModal" role="dialog" aria-modal="true" aria-label="Necpa invoices"><div class="ncp-inv-head"><div class="ncp-inv-title">🧾 Invoice Center</div><button class="ncp-inv-close" aria-label="Close">×</button></div><div id="necpraInvoiceBody" class="ncp-inv-list"><div class="ncp-inv-empty">Loading your orders…</div></div></section>';
    overlay.querySelector('.ncp-inv-close').addEventListener('click', closeCenter); overlay.addEventListener('click', e=>{if(e.target===overlay)closeCenter();}); document.body.appendChild(overlay); state.modal=overlay;
  }
  function closeCenter(){if(state.modal)state.modal.style.display='none';}

  async function loadOrders(){
    const body=document.getElementById('necpraInvoiceBody'); if(!body)return; body.innerHTML='<div class="ncp-inv-empty">Loading your orders…</div>';
    try{
      const results=await Promise.allSettled([request('/marketplace/orders?limit=100'),request('/marketplace/seller/orders?limit=100')]); const all=[];
      results.forEach(r=>{if(r.status!=='fulfilled')return;const d=r.value?.data||r.value||{};const list=d.orders||d.results||[];if(Array.isArray(list))all.push(...list);});
      const unique=new Map(all.map(o=>[String(o.id||o.orderId),o])); state.orders=[...unique.values()].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)); renderOrders();
    }catch(e){body.innerHTML=`<div class="ncp-inv-error">${esc(e.message||'Unable to load orders.')}</div>`;}
  }
  function renderOrders(){
    const body=document.getElementById('necpraInvoiceBody'); if(!body)return;
    if(!state.orders.length){body.innerHTML='<div class="ncp-inv-empty"><div style="font-size:42px">🧾</div><div>No marketplace orders found.</div></div>';return;}
    body.innerHTML=state.orders.map(order=>{const id=order.id||order.orderId;const item=order.product?.title||order.product?.name||order.title||order.itemName||order.productTitle||'Marketplace order';const paid=['paid','shipped','delivered'].includes(String(order.status||'').toLowerCase())||!!order.paidAt;return `<article class="ncp-inv-card"><div><div class="ncp-inv-name">${esc(item)}</div><div class="ncp-inv-meta">Order ${esc(id)} · ${esc(order.status||'pending')}</div><div class="ncp-inv-total">${money(order.totalPrice??order.total,order.currency||'KES')}</div></div><div class="ncp-inv-actions">${paid?`<button class="ncp-inv-btn" data-download-invoice="${esc(id)}">Download PDF</button>`:'<span style="font-size:12px;opacity:.65">Available after payment</span>'}</div></article>`;}).join('');
    body.querySelectorAll('[data-download-invoice]').forEach(btn=>btn.addEventListener('click',()=>download(btn.dataset.downloadInvoice,btn)));
  }
  async function download(orderId,button){
    if(!orderId)return; const old=button?.textContent; if(button){button.disabled=true;button.textContent='Preparing…';}
    try{
      const headers={};if(token())headers.Authorization=`Bearer ${token()}`;const r=await fetch(`${api()}/invoices/orders/${encodeURIComponent(orderId)}/pdf`,{headers});
      if(!r.ok){const p=await r.json().catch(()=>({}));throw new Error(p.message||`Invoice unavailable (${r.status})`);}
      const blob=await r.blob();const disposition=r.headers.get('content-disposition')||'';const match=disposition.match(/filename="?([^";]+)"?/i);const filename=match?.[1]||`Necpa-Invoice-${orderId}.pdf`;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){alert(e.message||'Unable to download invoice.');}finally{if(button){button.disabled=false;button.textContent=old||'Download PDF';}}
  }
  function openCenter(){ensureUi();state.modal.style.display='flex';loadOrders();}
  function patchOrderViewer(){
    if(typeof window._jmViewOrder!=='function'||window._jmViewOrder.__invoicePatched)return;const original=window._jmViewOrder;
    const wrapped=function(){const result=original.apply(this,arguments);const raw=arguments[0];const orderId=raw&&typeof raw==='object'?(raw.id||raw.orderId):raw;setTimeout(()=>{if(!orderId)return;document.querySelectorAll('[id*="order" i],[class*="order" i],[class*="detail" i]').forEach(root=>{if(root.querySelector(`[data-necpa-invoice-order="${CSS.escape(String(orderId))}"]`))return;if(!root.textContent?.toLowerCase().includes(String(orderId).toLowerCase()))return;const b=document.createElement('button');b.type='button';b.dataset.necpaInvoiceOrder=String(orderId);b.className='ncp-inv-btn';b.textContent='🧾 Download Invoice';b.style.margin='10px 0';b.addEventListener('click',()=>download(String(orderId),b));root.appendChild(b);});},250);return result;};
    wrapped.__invoicePatched=true;window._jmViewOrder=wrapped;
  }
  function init(){if(!/\/Tools\.html$/i.test(location.pathname)&&!/\/tools\.html$/i.test(location.pathname))return;ensureUi();patchOrderViewer();setInterval(patchOrderViewer,1000);}
  window.NecpaInvoices={open:openCenter,close:closeCenter,download,loadOrders};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
