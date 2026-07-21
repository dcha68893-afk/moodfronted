/**
 * marketplace-seller.js v3 — COMPLETE SELLER MODULE
 * All pages use 100% inline styles. No CSS class dependency.
 * Every page has loading state, error state, and empty state.
 */
(function _SellerModule() {
'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────
const _esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _fmt = n => 'KES ' + parseFloat(n||0).toLocaleString('en-KE',{minimumFractionDigits:0,maximumFractionDigits:0});
const _date = d => d ? new Date(d).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}) : '—';
const _ls = {
    save:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}},
    load:(k,d=null)=>{try{const r=localStorage.getItem(k);return r?JSON.parse(r):d}catch(_){return d}}
};

function _toast(msg,type='info',icon='ℹ️'){
    if(typeof window._jmToast==='function'){window._jmToast(msg,type,icon);return;}
    const c={success:'#22c55e',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
    let b=document.getElementById('_sdToast');
    if(!b){b=document.createElement('div');b.id='_sdToast';b.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:999999;display:flex;flex-direction:column;gap:6px;pointer-events:none;width:min(360px,90vw)';document.body.appendChild(b);}
    const t=document.createElement('div');
    t.style.cssText=`background:${c[type]||c.info};color:#fff;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.2);display:flex;align-items:center;gap:8px`;
    t.innerHTML=`<span>${icon}</span><span>${_esc(String(msg))}</span>`;
    b.appendChild(t);setTimeout(()=>t.remove(),3500);
}

async function _api(method,endpoint,body=null){
    try {
        const token=window.__kynToken||window.__accessToken||localStorage.getItem('authToken')||localStorage.getItem('token')||localStorage.getItem('moodchat_token')||'';
        let base = '';
        if (window.__kynAPI?.baseUrl) base = window.__kynAPI.baseUrl.replace(/\/api$/, '').replace(/\/$/, '');
        else if (typeof window.__getApiBase === 'function') base = window.__getApiBase().replace(/\/api$/, '').replace(/\/$/, '');
        else base = window.location.origin;
        const res=await fetch(base + '/api' + endpoint,{method:method.toUpperCase(),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}, ...(body&&method!=='GET'?{body:JSON.stringify(body)}:{})});
        const json=await res.json();
        if(!res.ok) return {_error:json?.message||`Error ${res.status}`,_status:res.status};
        return json;
    } catch(e){return {_error:e.message||'Network error',_offline:true};}
}

// ─── Page renderer — 100% inline styles, no class dependency ─────────────────
function _page(container, title, bodyHtml, backPage='account') {
    container.innerHTML = '';
    container.style.cssText = 'display:flex!important;flex-direction:column!important;flex:1!important;min-height:0!important;overflow:hidden!important;background:#f3f4f6!important;height:100%!important';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:#f3f4f6';

    // Header
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:13px 16px;background:#fff;border-bottom:1px solid #f3f4f6;flex-shrink:0;position:sticky;top:0;z-index:10;box-shadow:0 1px 4px rgba(0,0,0,.06)';
    head.innerHTML = `<button onclick="window._jmNavMore('${backPage}')" style="width:34px;height:34px;border-radius:50%;border:none;background:#f3f4f6;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;color:#374151;flex-shrink:0">←</button><div style="font-weight:800;font-size:15px;flex:1;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${title}</div>`;

    // Body
    const body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;min-height:0;-webkit-overflow-scrolling:touch;padding-bottom:80px';
    body.innerHTML = bodyHtml;

    wrap.appendChild(head);
    wrap.appendChild(body);
    container.appendChild(wrap);
}

function _loading(title, backPage='account') {
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:40px;background:#f3f4f6;min-height:200px"><div style="font-size:36px">⏳</div><div style="font-size:14px;font-weight:600;color:#6b7280">Loading ${title}…</div></div>`;
}

function _empty(icon, title, desc, btnLabel='', btnAction='') {
    return `<div style="padding:50px 24px;text-align:center;background:#fff;border-radius:16px;margin:16px">
        <div style="font-size:52px;margin-bottom:14px">${icon}</div>
        <div style="font-size:16px;font-weight:800;color:#111;margin-bottom:8px">${title}</div>
        <div style="font-size:13px;color:#6b7280;line-height:1.6;margin-bottom:${btnLabel?'20px':'0'}">${desc}</div>
        ${btnLabel?`<button onclick="${btnAction}" style="background:#f57224;color:#fff;border:none;border-radius:12px;padding:12px 24px;font-size:14px;font-weight:800;cursor:pointer;margin-top:4px">${btnLabel}</button>`:''}
    </div>`;
}

function _err(msg) {
    return `<div style="margin:16px;background:#fee2e2;border-radius:12px;padding:14px 16px;display:flex;align-items:flex-start;gap:10px"><div style="font-size:20px;flex-shrink:0">⚠️</div><div><div style="font-weight:700;font-size:13px;color:#991b1b">Could not load data</div><div style="font-size:12px;color:#b91c1c;margin-top:3px">${_esc(String(msg||'Unknown error'))}</div></div></div>`;
}

// ─── Card + button helpers ────────────────────────────────────────────────────
function _card(titleHtml, bodyHtml) {
    return `<div style="background:#fff;border-radius:14px;margin:12px 16px 0;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.06)"><div style="font-weight:800;font-size:14px;color:#111;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">${titleHtml}</div>${bodyHtml}</div>`;
}

function _btn(label, onclick, style='primary') {
    const styles = {
        primary: 'background:#f57224;color:#fff',
        secondary: 'background:#f3f4f6;color:#374151',
        success: 'background:#d1fae5;color:#065f46',
        danger: 'background:#fee2e2;color:#ef4444',
        dark: 'background:#111;color:#fff',
    };
    return `<button onclick="${onclick}" style="${styles[style]||styles.primary};border:none;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .2s">${label}</button>`;
}

function _fullBtn(label, onclick, style='primary') {
    const styles = {
        primary: 'background:#f57224;color:#fff',
        secondary: 'background:#f3f4f6;color:#374151',
        dark: 'background:#111;color:#fff',
    };
    return `<button onclick="${onclick}" style="${styles[style]||styles.primary};border:none;border-radius:12px;padding:13px 16px;font-size:14px;font-weight:800;cursor:pointer;width:100%;display:block;text-align:center;margin-top:8px">${label}</button>`;
}

function _badge(text, color) {
    const colors = {
        orange: 'background:#fff3e0;color:#e65100',
        green:  'background:#d1fae5;color:#065f46',
        red:    'background:#fee2e2;color:#991b1b',
        blue:   'background:#dbeafe;color:#1e40af',
        gray:   'background:#f3f4f6;color:#6b7280',
        purple: 'background:#ede9fe;color:#5b21b6',
    };
    return `<span style="${colors[color]||colors.gray};border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;display:inline-block">${_esc(text)}</span>`;
}

function _barChart(data) {
    if (!data?.length) return '';
    const max = Math.max(...data.map(d=>d.revenue||0), 1);
    return `<div style="display:flex;align-items:flex-end;gap:4px;height:100px;background:#f9fafb;border-radius:10px;padding:10px 8px 6px;overflow:hidden;margin-top:8px">
        ${data.map(d=>`<div title="${_fmt(d.revenue||0)}" style="flex:1;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#f57224,#e0651f);min-height:4px;height:${Math.max(4,Math.round(((d.revenue||0)/max)*80))}px;transition:height .5s ease"></div>`).join('')}
    </div>
    <div style="display:flex;gap:4px;padding:4px 8px 0">${data.map(d=>`<div style="flex:1;text-align:center;font-size:9px;color:#9ca3af;overflow:hidden">${d.date?.slice(5)||d.day||''}</div>`).join('')}</div>`;
}

// ─── Category materials ───────────────────────────────────────────────────────
const CAT_MAT = {
    furniture:['Wood','Mahogany','Oak','Bamboo','Metal','Plastic','Glass','Rattan'],
    fashion:['Cotton','Leather','Polyester','Silk','Wool','Denim','Linen','Nylon'],
    electronics:['Aluminum','Plastic','Glass','Stainless Steel','Rubber','Silicone'],
    food:['Organic','Fresh','Frozen','Halal','Vegetarian','Vegan','Gluten-Free'],
    beauty:['Natural','Organic','Cruelty-free','Paraben-free','Hypoallergenic'],
    sports:['Rubber','Foam','Nylon','Carbon Fiber','Aluminum','Polyester'],
    construction:['Steel','Aluminum','Cement','Ceramic','Marble','PVC'],
    home:['Wood','Metal','Ceramic','Glass','Fabric','Plastic'],
    health:['Natural','Organic','FDA Approved','Hypoallergenic'],
};
const _phys = {images:[],variants:[],specs:[],materials:[]};

window._physCategoryChanged = cat => {
    const g=document.getElementById('physMatsGroup'), c=document.getElementById('physMatsChips');
    const mats=CAT_MAT[cat]||[];
    if(!g||!c)return;
    g.style.display=mats.length?'block':'none';
    _phys.materials=[];
    c.innerHTML=mats.map(m=>`<span onclick="this.classList.toggle('on');_phys.materials=Array.from(document.querySelectorAll('#physMatsChips .on')).map(e=>e.textContent)" style="display:inline-flex;align-items:center;background:#f3f4f6;border:1.5px solid #e5e7eb;border-radius:20px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;margin:3px;transition:all .15s" class="">${m}</span>`).join('');
};
window._physCalcDisc=()=>{
    const p=parseFloat(document.getElementById('physPrice')?.value||0),o=parseFloat(document.getElementById('physOrigPrice')?.value||0),l=document.getElementById('physDiscLabel');
    if(!l)return;l.style.display=o>p&&p>0?'block':'none';
    if(o>p&&p>0)l.textContent=`🏷️ ${Math.round((1-p/o)*100)}% discount`;
};
window._physAddImgs=files=>{
    const g=document.getElementById('physImgGrid');if(!g)return;
    Array.from(files).slice(0,8-_phys.images.length).forEach(f=>{
        if(!f.type.startsWith('image/'))return;
        const url=URL.createObjectURL(f);const idx=_phys.images.push({url,file:f})-1;
        const d=document.createElement('div');
        d.style.cssText='position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#f3f4f6';
        d.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover"><button onclick="_phys.images.splice(${idx},1);this.parentElement.remove()" style="position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;border:none;cursor:pointer;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">✕</button>`;
        g.appendChild(d);
    });
};
window._physAddVariant=()=>{
    const c=document.getElementById('physVarWrap');if(!c)return;
    const i=_phys.variants.push({name:'',opts:''})-1;
    const r=document.createElement('div');r.style.cssText='display:flex;gap:6px;align-items:center;background:#f9fafb;border-radius:8px;padding:8px;margin-bottom:6px';
    r.innerHTML=`<input placeholder="Type (Color)" oninput="_phys.variants[${i}].name=this.value" style="flex:1;border:1.5px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:13px;background:#fff;outline:none"><input placeholder="Options: Red,Blue" oninput="_phys.variants[${i}].opts=this.value" style="flex:2;border:1.5px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:13px;background:#fff;outline:none"><button onclick="this.parentElement.remove();_phys.variants.splice(${i},1)" style="background:#fee2e2;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;color:#ef4444;font-size:12px;flex-shrink:0">✕</button>`;
    c.appendChild(r);
};
window._physAddSpec=()=>{
    const c=document.getElementById('physSpecWrap');if(!c)return;
    const i=_phys.specs.push({k:'',v:''})-1;
    const r=document.createElement('div');r.style.cssText='display:grid;grid-template-columns:1fr 1fr auto;gap:6px;margin-bottom:6px';
    r.innerHTML=`<input placeholder="Name (e.g. Weight)" oninput="_phys.specs[${i}].k=this.value" style="border:1.5px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:13px;background:#fff;outline:none"><input placeholder="Value (e.g. 2kg)" oninput="_phys.specs[${i}].v=this.value" style="border:1.5px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:13px;background:#fff;outline:none"><button onclick="this.parentElement.remove();_phys.specs.splice(${i},1)" style="background:#fee2e2;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;color:#ef4444;font-size:12px;flex-shrink:0">✕</button>`;
    c.appendChild(r);
};
window._physPreview=()=>{
    const title=document.getElementById('physTitle')?.value||'Product';
    const price=document.getElementById('physPrice')?.value||'0';
    const orig=document.getElementById('physOrigPrice')?.value||'';
    const desc=document.getElementById('physDesc')?.value||'';
    const stock=parseInt(document.getElementById('physStock')?.value||'0');
    document.getElementById('physPrevOv')?.remove();
    const ov=document.createElement('div');ov.id='physPrevOv';
    ov.style.cssText='position:fixed;inset:0;z-index:99999;background:#f9fafb;overflow-y:auto;display:flex;flex-direction:column';
    ov.innerHTML=`<div style="background:#111;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0;position:sticky;top:0;z-index:10"><span style="background:#f59e0b;color:#111;border-radius:5px;padding:2px 8px;font-size:10px;font-weight:800">PREVIEW</span><span style="flex:1;font-size:12px;opacity:.7">Customer view — not live yet</span><button onclick="document.getElementById('physPrevOv').remove()" style="background:rgba(255,255,255,.15);border:none;border-radius:8px;padding:6px 14px;color:#fff;font-size:13px;cursor:pointer;font-weight:700">✕ Close</button></div>
    <div style="max-width:480px;margin:0 auto;width:100%;background:#fff">
        <div style="background:#f3f4f6;aspect-ratio:1.1;max-height:280px;overflow:hidden;display:flex;align-items:center;justify-content:center">${_phys.images.length?`<img src="${_phys.images[0].url}" style="width:100%;height:100%;object-fit:cover">`:'<div style="font-size:60px">📦</div>'}</div>
        <div style="padding:16px">
            <div style="font-size:18px;font-weight:800;color:#111;margin-bottom:8px">${_esc(title)}</div>
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:10px"><span style="font-size:26px;font-weight:900;color:#f57224">KES ${parseFloat(price).toLocaleString()}</span>${orig&&parseFloat(orig)>parseFloat(price)?`<span style="font-size:16px;color:#9ca3af;text-decoration:line-through">KES ${parseFloat(orig).toLocaleString()}</span>`:''}</div>
            <div style="font-size:13px;font-weight:700;color:${stock>0?'#22c55e':'#ef4444'};margin-bottom:14px">${stock>0?`✓ In Stock (${stock} units)`:'✗ Out of Stock'}</div>
            <div style="display:flex;gap:10px"><button style="flex:1;background:#f57224;color:#fff;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:15px">Add to Cart</button><button style="flex:1;background:#111;color:#fff;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:15px">Buy Now</button></div>
        </div>
        ${desc?`<div style="background:#fff;border-top:8px solid #f9fafb;padding:16px"><div style="font-weight:800;font-size:14px;margin-bottom:8px">Description</div><div style="font-size:13px;color:#374151;line-height:1.7">${_esc(desc)}</div></div>`:''}
        ${_phys.materials.length?`<div style="background:#fff;border-top:8px solid #f9fafb;padding:16px"><div style="font-weight:800;font-size:14px;margin-bottom:8px">Materials</div><div style="display:flex;flex-wrap:wrap;gap:6px">${_phys.materials.map(m=>`<span style="background:#f3f4f6;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600">${_esc(m)}</span>`).join('')}</div></div>`:''}
    </div>`;
    document.body.appendChild(ov);
};
window._physPublish=async()=>{
    const title=document.getElementById('physTitle')?.value?.trim();
    const price=parseFloat(document.getElementById('physPrice')?.value||0);
    const desc=document.getElementById('physDesc')?.value?.trim();
    const cat=document.getElementById('physCategory')?.value;
    const stock=parseInt(document.getElementById('physStock')?.value||0);
    if(!title){_toast('Product name required','error','⚠️');return null;}
    if(price<=0){_toast('Set a valid price','error','⚠️');return null;}
    if(!desc){_toast('Description required','error','⚠️');return null;}
    if(!cat){_toast('Select a category','error','⚠️');return null;}
    if(!_phys.images.length){_toast('Add at least one image','error','📸');return null;}
    const btn=document.getElementById('physPubBtn');
    if(btn){btn.disabled=true;btn.textContent='⏳ Submitting…';}
    const imgs=await Promise.all(_phys.images.slice(0,8).map(img=>new Promise(res=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.readAsDataURL(img.file);})));
    const payload={title,description:desc,short_description:document.getElementById('physShortDesc')?.value?.trim()||'',price,original_price:parseFloat(document.getElementById('physOrigPrice')?.value||0)||null,category:cat,subcategory:document.getElementById('physSubcat')?.value?.trim()||'',brand:document.getElementById('physBrand')?.value?.trim()||'',sku:document.getElementById('physSku')?.value?.trim()||'',stock_quantity:stock,weight:parseFloat(document.getElementById('physWeight')?.value||0)||null,images:imgs,type:'physical',condition:'new',available:false,status:'pending_review',approval_status:'pending',metadata:{materials:Array.from(document.querySelectorAll('#physMatsChips .on')).map(e=>e.textContent),variants:_phys.variants.filter(v=>v.name),specs:Object.fromEntries(_phys.specs.filter(s=>s.k&&s.v).map(s=>[s.k,s.v]))}};
    const r=await _api('POST','/marketplace/products',payload);
    if(btn){btn.disabled=false;btn.textContent='Submit for Review';}
    if(r?._error){_toast(r._error,'error','❌');return null;}
    const product=r?.data?.product||r?.product;
    if(!product){_toast('Submission failed','error','❌');return null;}
    _phys.images=[];_phys.variants=[];_phys.specs=[];_phys.materials=[];
    _toast('Submitted for review! Goes live after admin approval ✅','success','📋');
    if(typeof window.hideCreateListingModal==='function') window.hideCreateListingModal();
    return product;
};
(()=>{const t=()=>{const b=document.getElementById('publishListingBtn');if(!b){setTimeout(t,800);return;}const o=b.onclick;b.onclick=async e=>{const tab=document.querySelector('.create-listing-tab.active')?.dataset?.tab;if(tab==='physical') await window._physPublish();else o?.call(b,e);};};setTimeout(t,600);})();

// ══════════════════════════════════════════════════════════════════════════════
// 1. SELLER DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
async function renderSellerDashboard(container) {
    _page(container,'🏪 Seller Dashboard',_loading('Dashboard'));
    try {
        const [dR,aR]=await Promise.all([_api('GET','/marketplace/seller-dashboard'),_api('GET','/marketplace/seller/analytics?period=7d')]);
        const d=(!dR||dR._error)?{}:(dR.data||dR);
        const an=(!aR||aR._error)?{}:(aR.data||aR);
        const rev=an.revenue||{};const ords=an.orders||{};const prods=an.products||{};
        const byDay=rev.by_day||[];const orders=d.recentOrders||[];
        const body=container.querySelector('div>div:last-child');if(!body)return;

        body.innerHTML=`
        ${dR?._error?_err(dR._error):''}
        <!-- KPIs -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 16px">
            ${[
                ['Revenue (7d)',_fmt(rev.total||0),`${ords.total||0} orders`,'orange'],
                ['Live Products',prods.approved||d.products||0,`${prods.pending||0} pending review`,'blue'],
                ['Pending Orders',ords.pending||0,'Need fulfillment','orange'],
                ['Conversion',`${an.conversion_rate||0}%`,`${(prods.total_views||0).toLocaleString()} views`,'green'],
            ].map(([l,v,s,c])=>{
                const bg={orange:'background:linear-gradient(135deg,#f57224,#ff4e16);color:#fff',blue:'background:#fff',green:'background:#fff'}[c]||'background:#fff';
                const vc={orange:'color:#fff',blue:'color:#111',green:'color:#22c55e'}[c]||'color:#111';
                const lc={orange:'color:rgba(255,255,255,.75)',blue:'color:#9ca3af',green:'color:#9ca3af'}[c]||'color:#9ca3af';
                const sc={orange:'color:rgba(255,255,255,.7)',blue:'color:#6b7280',green:'color:#6b7280'}[c]||'color:#6b7280';
                return `<div style="${bg};border-radius:14px;padding:14px 16px;box-shadow:0 2px 8px rgba(0,0,0,.06)"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;${lc};margin-bottom:4px">${l}</div><div style="font-size:22px;font-weight:900;${vc};letter-spacing:-.5px">${v}</div><div style="font-size:11px;${sc};margin-top:3px">${s}</div></div>`;
            }).join('')}
        </div>

        <!-- Revenue chart -->
        ${byDay.length?_card('Revenue — Last 7 Days',_barChart(byDay)):''}

        <!-- Quick Actions -->
        ${_card('Quick Actions',`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${[
                ['📦 My Listings',"window._jmNavMore('my-listings')"],
                ['＋ Create Product',"window._jmHideMore?.();setTimeout(()=>document.getElementById('createListingBtn')?.click(),100)"],
                ['📊 Inventory',"window._jmNavMore('seller-inventory')"],
                ['📈 Analytics',"window._jmNavMore('seller-analytics')"],
                ['💰 Payouts',"window._jmNavMore('seller-payouts')"],
                ['🚚 Orders',"window._jmNavMore('seller-shipping')"],
                ['↩️ Returns',"window._jmNavMore('seller-returns')"],
                ['🛡️ Verification',"window._jmNavMore('seller-verification')"],
            ].map(([l,a])=>`<button onclick="${a}" style="background:#f9fafb;border:1.5px solid #f3f4f6;border-radius:12px;padding:12px 10px;cursor:pointer;font-size:12px;font-weight:700;color:#374151;display:flex;align-items:center;justify-content:center;gap:6px;text-align:center">${l}</button>`).join('')}
        </div>`)}

        <!-- Pending notice -->
        ${(prods.pending||0)>0?`<div style="margin:12px 16px 0;background:#fff3e0;border:1px solid #f59e0b;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px"><span style="font-size:26px">⏳</span><div><div style="font-weight:800;font-size:14px;color:#92400e">${prods.pending} product${prods.pending>1?'s':''} awaiting admin approval</div><div style="font-size:12px;color:#b45309;margin-top:2px">Usually reviewed within 24–48 hours.</div></div></div>`:''}

        <!-- Recent Orders -->
        ${orders.length?_card(`Recent Orders <span style="font-size:11px;color:#f57224;font-weight:700;cursor:pointer" onclick="window._jmNavMore('seller-shipping')">See all</span>`,
            orders.slice(0,5).map(o=>{
                const c={pending:'#f59e0b',confirmed:'#3b82f6',shipped:'#f97316',delivered:'#22c55e',cancelled:'#ef4444'}[o.status]||'#9ca3af';
                const items=o.metadata?.items||o.items||[];
                return `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f9fafb;cursor:pointer" onclick="window._jmNavMore('seller-shipping')"><div><div style="font-size:13px;font-weight:800;color:#111">#${String(o.id||'').slice(-8)}</div><div style="font-size:11px;margin-top:3px"><span style="color:${c};font-weight:700">${o.status||'pending'}</span> · ${items.length} item${items.length!==1?'s':''} · ${_date(o.createdAt||o.created_at)}</div></div><div style="font-size:14px;font-weight:900;color:#f57224">${_fmt(o.totalPrice||o.total_price||0)}</div></div>`;
            }).join('')
        ):_card('Recent Orders',_empty('🛍️','No orders yet','Your first customer order will appear here.'))}

        <div style="height:20px"></div>`;
        window._sellerDashRef={reload:()=>renderSellerDashboard(container)};
    } catch(ex) {
        const b=container.querySelector('div>div:last-child');
        if(b) b.innerHTML=_err(ex.message)+_empty('🏪','Could not load dashboard','Check your internet connection and try again.','Retry',`window._jmNavMore('seller-dashboard')`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. MY LISTINGS
// ══════════════════════════════════════════════════════════════════════════════
async function renderMyListings(container) {
    _page(container,'📦 My Listings',_loading('Listings'));
    try {
        const r=await _api('GET','/marketplace/seller/products?limit=50');
        const products=r?.data?.products||r?.products||[];
        const g={
            pending: products.filter(p=>p.status==='pending_review'||p.approval_status==='pending'),
            rejected: products.filter(p=>p.approval_status==='rejected'||p.status==='rejected'),
            approved: products.filter(p=>['approved','active'].includes(p.status)||p.approval_status==='approved'),
            draft:    products.filter(p=>p.status==='draft'),
            archived: products.filter(p=>p.status==='archived'),
        };
        const body=container.querySelector('div>div:last-child');if(!body)return;
        const statusBg={pending_review:'#fff3e0',rejected:'#fee2e2',approved:'#d1fae5',draft:'#f3f4f6',archived:'#e0e7ff'};
        const statusColor={pending_review:'#92400e',rejected:'#991b1b',approved:'#065f46',draft:'#6b7280',archived:'#3730a3'};
        const statusLabel={pending_review:'Pending Review',rejected:'Rejected',approved:'Live',active:'Live',draft:'Draft',archived:'Archived'};

        const renderGroup=(label,items,sk)=>!items.length?'':_card(`${label} <span style="background:${statusBg[sk]};color:${statusColor[sk]};border-radius:20px;padding:2px 9px;font-size:10px;font-weight:700;margin-left:6px">${items.length}</span>`,
            items.map(p=>{
                const sk2=p.approval_status==='rejected'?'rejected':p.status==='pending_review'?'pending_review':p.status;
                const img=p.image||(Array.isArray(p.images)?p.images[0]:'')||'';
                return `<div style="display:flex;align-items:flex-start;gap:10px;padding:11px 0;border-bottom:1px solid #f9fafb">
                    ${img?`<img src="${_esc(img)}" style="width:52px;height:52px;border-radius:8px;object-fit:cover;background:#f3f4f6;flex-shrink:0" loading="lazy">`:`<div style="width:52px;height:52px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">📦</div>`}
                    <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px">${_esc(p.title||'Untitled')}</div>
                        <span style="background:${statusBg[sk2]||'#f3f4f6'};color:${statusColor[sk2]||'#6b7280'};border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700">${statusLabel[sk2]||p.status||'Draft'}</span>
                        ${p.rejection_reason?`<div style="font-size:11px;color:#ef4444;margin-top:4px;line-height:1.4">Reason: ${_esc(p.rejection_reason)}</div>`:''}
                        <div style="font-size:11px;color:#9ca3af;margin-top:4px">${p.views||0} views · ${p.sold_count||0} sold · ${_fmt(p.price)}</div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;margin-left:6px">
                        ${(p.approval_status==='rejected'||p.status==='rejected')?`<button onclick="window._sellerResubmit('${p.id}')" style="background:#f3f4f6;border:none;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;color:#374151">✏️ Edit</button>`:''}
                        <button onclick="window._sellerDuplicate('${p.id}')" style="background:#f3f4f6;border:none;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;color:#374151">⧉ Copy</button>
                        ${p.status==='archived'?`<button onclick="window._sellerRestore('${p.id}')" style="background:#d1fae5;border:none;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;color:#065f46">Restore</button>`:''}
                    </div>
                </div>`;
            }).join(''));

        body.innerHTML=`
        <div style="padding:12px 16px">${_fullBtn('＋ Create New Listing',"window._jmHideMore?.();setTimeout(()=>document.getElementById('createListingBtn')?.click(),100)")}</div>
        ${r?._error?_err(r._error):''}
        ${renderGroup('⏳ Pending Review',g.pending,'pending_review')}
        ${renderGroup('❌ Rejected — Edit & Resubmit',g.rejected,'rejected')}
        ${renderGroup('✅ Live & Active',g.approved,'approved')}
        ${renderGroup('📝 Drafts',g.draft,'draft')}
        ${renderGroup('🗄️ Archived',g.archived,'archived')}
        ${!products.length?`<div style="padding:0 16px">${_empty('📭','No listings yet',"You haven't created any products yet. Start selling by creating your first listing!",'+ Create First Listing',"window._jmHideMore?.();setTimeout(()=>document.getElementById('createListingBtn')?.click(),100)")}</div>`:''}
        <div style="height:20px"></div>`;
    } catch(ex) {
        const b=container.querySelector('div>div:last-child');
        if(b) b.innerHTML=_err(ex.message)+`<div style="padding:0 16px">${_empty('📦','Could not load listings','Tap retry to try again.','Retry',`window._jmNavMore('my-listings')`)}</div>`;
    }
}
window._sellerResubmit=async id=>{const n=prompt('What did you change? (Optional)')||'';const r=await _api('POST',`/marketplace/seller/products/${id}/resubmit`,{updates:{metadata:{note:n}}});if(r&&!r._error){_toast('Resubmitted for review!','success','✅');window._jmNavMore('my-listings');}else _toast(r?._error||'Failed','error','❌');};
window._sellerArchive=async id=>{if(!confirm('Archive? Product will be hidden from buyers.'))return;await _api('POST',`/marketplace/seller/products/${id}/archive`);_toast('Archived','info','🗄️');window._jmNavMore('my-listings');};
window._sellerRestore=async id=>{await _api('POST',`/marketplace/seller/products/${id}/restore`);_toast('Restored as draft','info','📝');window._jmNavMore('my-listings');};
window._sellerDuplicate=async id=>{const r=await _api('POST',`/marketplace/seller/products/${id}/duplicate`);if(r&&!r._error){_toast('Duplicated!','success','⧉');window._jmNavMore('my-listings');}else _toast(r?._error||'Failed','error','❌');};

// ══════════════════════════════════════════════════════════════════════════════
// 3. INVENTORY
// ══════════════════════════════════════════════════════════════════════════════
async function renderInventory(container) {
    _page(container,'📊 Inventory',_loading('Inventory'));
    try {
        const r=await _api('GET','/marketplace/seller/inventory');
        const {items=[],low_stock=[],out_of_stock=[]}=r?.data||{};
        const body=container.querySelector('div>div:last-child');if(!body)return;
        body.innerHTML=`
        ${out_of_stock.length?`<div style="background:#fee2e2;padding:12px 16px;font-size:13px;color:#991b1b;font-weight:600;display:flex;gap:8px">⚠️ ${out_of_stock.length} product${out_of_stock.length>1?'s':''} out of stock!</div>`:''}
        ${low_stock.length?`<div style="background:#fef3c7;padding:12px 16px;font-size:13px;color:#92400e;font-weight:600;display:flex;gap:8px">🔔 ${low_stock.length} product${low_stock.length>1?'s':''} running low</div>`:''}
        ${r?._error?_err(r._error):''}
        <div style="margin:12px 16px 0;background:#fff;border-radius:14px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                <div style="font-weight:800;font-size:14px;color:#111">Stock Levels</div>
                <button onclick="window._bulkSaveInv()" style="background:#f57224;color:#fff;border:none;border-radius:9px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">💾 Save All</button>
            </div>
            ${items.length?`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:300px">
                <thead><tr>${['Product','Status','Stock'].map(h=>`<th style="text-align:left;padding:8px 8px;font-size:10px;font-weight:800;text-transform:uppercase;color:#9ca3af;border-bottom:2px solid #f3f4f6;background:#fafafa;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
                <tbody>${items.map(p=>{
                    const qty=p.stockQuantity??p.stock??0;
                    const [bg,col,lbl]=qty===0?['#fee2e2','#991b1b','Out of Stock']:qty<=5?['#fef3c7','#92400e','Low Stock']:['#d1fae5','#065f46','In Stock'];
                    const img=p.image||(Array.isArray(p.images)?p.images[0]:'')||'';
                    return `<tr><td style="padding:10px 8px;border-bottom:1px solid #f9fafb"><div style="display:flex;align-items:center;gap:8px">${img?`<img src="${_esc(img)}" style="width:32px;height:32px;border-radius:5px;object-fit:cover;flex-shrink:0">`:`<div style="width:32px;height:32px;border-radius:5px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">📦</div>`}<div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px">${_esc(p.title||'')}</div></div></td><td style="padding:10px 8px;border-bottom:1px solid #f9fafb"><span style="background:${bg};color:${col};border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700">${lbl}</span></td><td style="padding:10px 8px;border-bottom:1px solid #f9fafb"><input type="number" min="0" value="${qty}" data-id="${p.id}" id="inv_${p.id}" style="width:58px;border:1.5px solid #e5e7eb;border-radius:6px;padding:5px 6px;font-size:13px;text-align:center;outline:none"></td></tr>`;
                }).join('')}</tbody>
            </table></div>`:`<div style="padding:0 0 8px">${_empty('📦','No products yet','Add products to start managing inventory.','Create Product',"window._jmHideMore?.();setTimeout(()=>document.getElementById('createListingBtn')?.click(),100)")}</div>`}
        </div>
        <div style="padding:0 16px 20px;display:flex;flex-direction:column;gap:8px;margin-top:12px">
            ${_fullBtn('📥 Export Products CSV',"window._exportCSV()",'secondary')}
            <input type="file" id="invImport" accept=".csv" style="display:none" onchange="window._importCSV(this)">
            ${_fullBtn('📤 Import Products CSV',"document.getElementById('invImport').click()",'secondary')}
        </div>`;
    } catch(ex) {
        const b=container.querySelector('div>div:last-child');
        if(b) b.innerHTML=_err(ex.message)+`<div style="padding:0 16px">${_empty('📦','Could not load inventory','Retry to try again.','Retry',`window._jmNavMore('seller-inventory')`)}</div>`;
    }
}
window._bulkSaveInv=async()=>{
    const inputs=document.querySelectorAll('[data-id][id^="inv_"]');
    if(!inputs.length){_toast('Nothing to save','info','ℹ️');return;}
    const updates=Array.from(inputs).map(i=>({id:i.dataset.id,quantity:parseInt(i.value)||0}));
    const r=await _api('PUT','/marketplace/seller/inventory/bulk',{updates});
    if(r&&!r._error) _toast(`Saved ${r.data?.updated||updates.length} items ✅`,'success','💾');
    else _toast(r?._error||'Save failed','error','❌');
};
window._exportCSV=async()=>{
    const r=await _api('GET','/marketplace/seller/products?limit=999');
    const p=r?.data?.products||[];
    if(!p.length){_toast('No products to export','warning','📭');return;}
    const csv='id,title,price,category,status,stock\n'+p.map(x=>`${x.id},"${(x.title||'').replace(/"/g,'""')}",${x.price||0},${x.category||''},${x.status||''},${x.stock_quantity||0}`).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`products-${Date.now()}.csv`;a.click();
};
window._importCSV=async input=>{
    const f=input.files[0];if(!f)return;
    const text=await f.text();const lines=text.split('\n').filter(Boolean);
    const headers=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
    const rows=lines.slice(1).map(l=>{const v=l.split(',').map(x=>x.trim().replace(/^"|"$/g,''));return Object.fromEntries(headers.map((h,i)=>[h,v[i]||'']));});
    const r=await _api('POST','/marketplace/seller/products/import',{rows});
    if(r&&!r._error) _toast(`${r.data?.imported||0} products queued for review`,'success','📤');
    else _toast(r?._error||'Import failed','error','❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 4. ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════
async function renderSellerAnalytics(container) {
    _page(container,'📈 Analytics',_loading('Analytics'));
    try {
        const [r7,r30]=await Promise.all([_api('GET','/marketplace/seller/analytics?period=7d'),_api('GET','/marketplace/seller/analytics?period=30d')]);
        const d7=r7?.data||{};const d30=r30?.data||{};
        const byDay=d7.revenue?.by_day||[];const top=d30.top_products||[];
        const body=container.querySelector('div>div:last-child');if(!body)return;
        body.innerHTML=`
        ${(r7?._error||r30?._error)?_err(r7?._error||r30?._error):''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 16px">
            ${[['Revenue (30d)',_fmt(d30.revenue?.total||0),`${d30.orders?.total||0} orders`],['Views',(d30.products?.total_views||0).toLocaleString(),'All products'],['Conversion',`${d30.conversion_rate||0}%`,'Views → Sales'],['Units Sold',d30.products?.total_sold||0,`${d30.orders?.completed||0} completed`]].map(([l,v,s])=>`<div style="background:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 2px 8px rgba(0,0,0,.06)"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">${l}</div><div style="font-size:22px;font-weight:900;color:#111">${v}</div><div style="font-size:11px;color:#6b7280;margin-top:3px">${s}</div></div>`).join('')}
        </div>
        ${byDay.length?_card('Revenue — Last 7 Days',_barChart(byDay)):''}
        ${_card('Order Status (30 days)',
            [['✅ Completed',d30.orders?.completed||0,'#22c55e'],['⏳ Pending',d30.orders?.pending||0,'#f59e0b'],['❌ Cancelled',d30.orders?.cancelled||0,'#ef4444']].map(([l,c,col])=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f9fafb"><div style="width:10px;height:10px;border-radius:50%;background:${col};flex-shrink:0"></div><div style="flex:1;font-size:13px;font-weight:600">${l}</div><div style="font-size:15px;font-weight:800">${c}</div></div>`).join('')
        )}
        ${top.length?_card('🏆 Top Products (30d)',top.map((p,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f9fafb"><div style="width:26px;height:26px;border-radius:50%;background:${i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'#f3f4f6'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;flex-shrink:0">${i+1}</div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(p.title||'')}</div><div style="font-size:11px;color:#9ca3af">${p.sold||0} sold · ${(p.views||0).toLocaleString()} views</div></div><div style="font-size:13px;font-weight:800;color:#f57224;flex-shrink:0">${_fmt(p.revenue||0)}</div></div>`).join(''))
        :_card('Top Products',_empty('📊','No sales data yet','Start selling to see your top performing products here.'))}
        <div style="height:20px"></div>`;
    } catch(ex) {
        const b=container.querySelector('div>div:last-child');
        if(b) b.innerHTML=_err(ex.message)+`<div style="padding:0 16px">${_empty('📈','Could not load analytics','Retry to try again.','Retry',`window._jmNavMore('seller-analytics')`)}</div>`;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. PAYOUTS
// ══════════════════════════════════════════════════════════════════════════════
async function renderPayouts(container) {
    _page(container,'💰 Payouts',_loading('Payouts'));
    try {
        const r=await _api('GET','/marketplace/seller/payout');
        const d=r?.data||{};const history=d.payout_history||[];
        const body=container.querySelector('div>div:last-child');if(!body)return;
        body.innerHTML=`
        ${r?._error?_err(r._error):''}
        <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;margin:12px 16px 0;border-radius:18px;padding:20px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;opacity:.75;margin-bottom:4px">Available to Withdraw</div>
            <div style="font-size:36px;font-weight:900;letter-spacing:-1px;margin:6px 0 4px">${_fmt(d.available||0)}</div>
            <div style="font-size:12px;opacity:.75;margin-bottom:16px">${_fmt(d.pending_payout||0)} pending · ${_fmt(d.total_earned||0)} total earned</div>
            <button onclick="window._payoutModal()" style="background:rgba(255,255,255,.2);border:none;border-radius:10px;padding:10px 20px;color:#fff;font-weight:800;font-size:13px;cursor:pointer">💸 Request Payout</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px 16px">
            ${[['Gross Sales',_fmt(d.gross_sales||0)],['Platform Fee (10%)',_fmt(d.platform_fee||0)],['Net Earnings',_fmt(d.total_earned||0)],['Total Withdrawn',_fmt(d.total_withdrawn||0)]].map(([l,v])=>`<div style="background:#fff;border-radius:12px;padding:12px;box-shadow:0 2px 6px rgba(0,0,0,.06)"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">${l}</div><div style="font-size:16px;font-weight:900;color:#111">${v}</div></div>`).join('')}
        </div>
        ${_card('Payout History',history.length?history.slice(0,20).map(p=>`<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f9fafb"><div style="width:36px;height:36px;border-radius:50%;background:${p.status==='completed'?'#d1fae5':'#fef3c7'};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${p.status==='completed'?'✅':'⏳'}</div><div style="flex:1"><div style="font-size:13px;font-weight:700">${_fmt(p.amount||0)} via ${_esc((p.method||'mpesa').toUpperCase())}</div><div style="font-size:11px;color:#9ca3af">${_date(p.requested_at)}</div></div><span style="background:${p.status==='completed'?'#d1fae5':'#fef3c7'};color:${p.status==='completed'?'#065f46':'#92400e'};border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700">${p.status||'pending'}</span></div>`).join(''):_empty('💰','No payout history yet','Request your first payout once you have sales earnings.'))}
        <div style="height:20px"></div>`;
    } catch(ex) {
        const b=container.querySelector('div>div:last-child');
        if(b) b.innerHTML=_err(ex.message)+`<div style="padding:0 16px">${_empty('💰','Could not load payouts','Retry to try again.','Retry',`window._jmNavMore('seller-payouts')`)}</div>`;
    }
}
window._payoutModal=()=>{
    document.getElementById('payMod')?.remove();
    const ov=document.createElement('div');ov.id='payMod';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99000;display:flex;align-items:flex-end;justify-content:center';
    ov.innerHTML=`<div style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px"><div style="font-weight:800;font-size:16px;margin-bottom:14px">💸 Request Payout</div><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px">Amount (KES, min 100)</label><input id="payAmt" type="number" min="100" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px;font-size:14px;box-sizing:border-box;margin-bottom:10px;outline:none"><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px">M-Pesa Number</label><input id="payPhone" type="tel" placeholder="0712 345 678" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px;font-size:14px;box-sizing:border-box;margin-bottom:14px;outline:none"><div style="display:flex;gap:8px"><button onclick="window._submitPayout()" style="flex:1;background:#f57224;color:#fff;border:none;border-radius:10px;padding:12px;font-weight:800;font-size:14px;cursor:pointer">Submit</button><button onclick="document.getElementById('payMod').remove()" style="flex:1;background:#f3f4f6;color:#374151;border:none;border-radius:10px;padding:12px;font-weight:800;font-size:14px;cursor:pointer">Cancel</button></div></div>`;
    document.body.appendChild(ov);
};
window._submitPayout=async()=>{
    const amt=parseFloat(document.getElementById('payAmt')?.value||0),phone=document.getElementById('payPhone')?.value?.trim();
    if(!amt||amt<100){_toast('Minimum payout is KES 100','error','⚠️');return;}
    if(!phone){_toast('Enter your M-Pesa number','error','⚠️');return;}
    document.getElementById('payMod')?.remove();
    const r=await _api('POST','/marketplace/seller/payout/request',{amount:amt,method:'mpesa',account:phone});
    if(r&&!r._error){_toast('Request submitted! Processing in 1–3 business days.','success','💸');window._jmNavMore('seller-payouts');}
    else _toast(r?._error||'Failed','error','❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 6. SHIPPING / ORDERS
// ══════════════════════════════════════════════════════════════════════════════
async function renderShipping(container) {
    _page(container,'🚚 Orders & Shipping',_loading('Orders'));
    try {
        const r=await _api('GET','/marketplace/seller-dashboard/orders');
        const all=r?.data?.orders||r?.orders||[];
        const active=all.filter(o=>!['delivered','cancelled','refunded'].includes(o.status));
        const done=all.filter(o=>['delivered','refunded'].includes(o.status));
        const sc={pending:'#f59e0b',confirmed:'#3b82f6',shipped:'#f97316',out_for_delivery:'#ec4899',delivered:'#22c55e',cancelled:'#ef4444'};
        const body=container.querySelector('div>div:last-child');if(!body)return;
        body.innerHTML=`
        <div style="background:#f0fdf4;padding:10px 16px;font-size:12px;color:#166534;font-weight:600">💡 Update order status to notify buyers automatically</div>
        ${r?._error?_err(r._error):''}
        ${_card(`Active Orders (${active.length})`,active.length?active.map(o=>{
            const items=o.metadata?.items||o.items||[];
            return `<div style="background:#f9fafb;border-radius:12px;padding:13px;margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                    <div><div style="font-size:13px;font-weight:800;color:#111">#${String(o.id||'').slice(-8)}</div><div style="font-size:11px;color:#6b7280;margin-top:2px">${items.length} item${items.length!==1?'s':''} · ${_date(o.createdAt||o.created_at)}</div><div style="font-size:11px;color:#374151;margin-top:2px">📍 ${_esc(o.deliveryAddress?.city||o.delivery_address?.city||'—')}</div></div>
                    <div style="text-align:right"><div style="font-size:15px;font-weight:900;color:#f57224">${_fmt(o.totalPrice||o.total_price||0)}</div><div style="font-size:11px;font-weight:700;color:${sc[o.status]||'#9ca3af'};text-transform:capitalize">${o.status}</div></div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${(o.status==='pending'||o.status==='confirmed')?`<button onclick="window._shipUp('${o.id}','packed')" style="background:#f3f4f6;border:none;border-radius:8px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer;color:#374151">📦 Packed</button>`:''}
                    ${['pending','confirmed','packed'].includes(o.status)?`<button onclick="window._shipModal('${o.id}')" style="background:#f57224;border:none;border-radius:8px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer;color:#fff">🚚 Ship</button>`:''}
                    ${o.status==='shipped'?`<button onclick="window._shipUp('${o.id}','out_for_delivery')" style="background:#f3f4f6;border:none;border-radius:8px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer;color:#374151">🏍️ Out for Delivery</button>`:''}
                    ${o.status==='out_for_delivery'?`<button onclick="window._shipUp('${o.id}','delivered')" style="background:#d1fae5;border:none;border-radius:8px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer;color:#065f46">✅ Delivered</button>`:''}
                    <button onclick="window._viewLabel('${o.id}')" style="background:#f3f4f6;border:none;border-radius:8px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer;color:#374151">🖨️ Label</button>
                </div>
            </div>`;
        }).join(''):_empty('✅','All orders fulfilled!','Great job! No pending orders right now.'))}
        ${done.length?_card(`Completed (${done.length})`,done.slice(0,10).map(o=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f9fafb"><div><div style="font-size:13px;font-weight:700">#${String(o.id||'').slice(-8)}</div><div style="font-size:11px;color:#9ca3af">${_date(o.deliveredAt||o.createdAt)}</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:800;color:#f57224">${_fmt(o.totalPrice||0)}</div><div style="font-size:11px;font-weight:700;color:#22c55e">${o.status}</div></div></div>`).join('')):''}
        <div style="height:20px"></div>`;
    } catch(ex) {
        const b=container.querySelector('div>div:last-child');
        if(b) b.innerHTML=_err(ex.message)+`<div style="padding:0 16px">${_empty('🚚','Could not load orders','Retry to try again.','Retry',`window._jmNavMore('seller-shipping')`)}</div>`;
    }
}
window._shipUp=async(id,status)=>{const r=await _api('PUT',`/marketplace/seller/orders/${id}/shipping`,{status});if(r&&!r._error){_toast(`Marked as ${status.replace(/_/g,' ')} ✅`,'success','✅');window._jmNavMore('seller-shipping');}else _toast(r?._error||'Failed','error','❌');};
window._shipModal=id=>{const t=prompt('Tracking number (optional):')||'';const c=prompt('Courier name (e.g. G4S, DHL, Sendy):')||'Standard';_api('PUT',`/marketplace/seller/orders/${id}/shipping`,{status:'shipped',tracking_number:t,courier:c}).then(r=>{if(r&&!r._error){_toast('Shipped! Buyer notified 🚚','success','🚚');window._jmNavMore('seller-shipping');}else _toast(r?._error||'Failed','error','❌');});};
window._viewLabel=async id=>{const r=await _api('GET',`/marketplace/seller/orders/${id}/shipping-label`);const l=r?.data?.label;if(!l){_toast('Label not available yet','warning','🖨️');return;}const w=window.open('','_blank','width=420,height=560');w?.document.write(`<!DOCTYPE html><html><head><title>Label</title><style>body{font-family:Arial;padding:24px;max-width:400px;border:2px dashed #ccc}h2{font-size:18px}p{margin:4px 0;font-size:14px}hr{border:1px dashed #ccc;margin:12px 0}.big{font-size:18px;font-weight:900}</style></head><body><h2>📦 Shipping Label</h2><hr><p><b>Order:</b> #${String(l.order_id||'').slice(-8)}</p><p><b>Tracking:</b> <span class="big">${l.tracking_number||'PENDING'}</span></p><p><b>Courier:</b> ${l.courier||'Standard'}</p><hr><p>TO:</p><p class="big">${l.to?.name||'Customer'}</p><p>${l.to?.address||''}${l.to?.city?', '+l.to.city:''}</p><p>${l.to?.phone||''}</p><hr>${(l.items||[]).map(i=>`<p>• ${i.title} ×${i.quantity}</p>`).join('')}<hr><p style="text-align:center;font-size:10px">Knecta Market · ${new Date().toLocaleDateString()}</p><script>window.print();<\/script></body></html>`);};

// ══════════════════════════════════════════════════════════════════════════════
// 7. RETURNS
// ══════════════════════════════════════════════════════════════════════════════
async function renderReturns(container) {
    _page(container,'↩️ Returns & Refunds',_loading('Returns'));
    try {
        const r=await _api('GET','/marketplace/seller/returns');
        const returns=r?.data?.returns||[];
        const body=container.querySelector('div>div:last-child');if(!body)return;
        body.innerHTML=`
        ${r?._error?_err(r._error):''}
        ${_card(`Return Requests (${returns.length})`,returns.length?returns.map(ret=>`<div style="background:#f9fafb;border-radius:12px;padding:13px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px"><div><div style="font-size:13px;font-weight:800">Order #${String(ret.order_id||'').slice(-8)}</div><div style="font-size:12px;color:#6b7280;margin-top:2px">Requested: ${_date(ret.requested_at)}</div></div><span style="background:${ret.status==='pending'?'#fef3c7':ret.status==='approved'?'#d1fae5':'#fee2e2'};color:${ret.status==='pending'?'#92400e':ret.status==='approved'?'#065f46':'#991b1b'};border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700">${ret.status}</span></div>
            <div style="font-size:12px;color:#374151;margin-bottom:4px"><b>Reason:</b> ${_esc(ret.reason||'Not specified')}</div>
            <div style="font-size:14px;font-weight:800;color:#f57224;margin-bottom:10px">${_fmt(ret.total)}</div>
            ${ret.status==='pending'?`<div style="display:flex;gap:8px"><button onclick="window._approveReturn('${ret.order_id}')" style="flex:1;background:#d1fae5;color:#065f46;border:none;border-radius:10px;padding:10px;font-weight:800;font-size:13px;cursor:pointer">✅ Approve</button><button onclick="window._rejectReturn('${ret.order_id}')" style="flex:1;background:#fee2e2;color:#ef4444;border:none;border-radius:10px;padding:10px;font-weight:800;font-size:13px;cursor:pointer">❌ Reject</button></div>`:''}
        </div>`).join(''):_empty('🎉','No return requests','All your orders are going smoothly! No returns to manage.'))}
        <div style="height:20px"></div>`;
    } catch(ex) {
        const b=container.querySelector('div>div:last-child');
        if(b) b.innerHTML=_err(ex.message)+`<div style="padding:0 16px">${_empty('↩️','Could not load returns','Retry to try again.','Retry',`window._jmNavMore('seller-returns')`)}</div>`;
    }
}
window._approveReturn=async id=>{if(!confirm('Approve this return? Buyer will be refunded.'))return;const r=await _api('POST',`/marketplace/seller/returns/${id}/approve`);if(r&&!r._error){_toast('Return approved ✅','success','✅');window._jmNavMore('seller-returns');}else _toast(r?._error||'Failed','error','❌');};
window._rejectReturn=async id=>{const reason=prompt('Reason for rejection:')||'Does not meet return policy';const r=await _api('POST',`/marketplace/seller/returns/${id}/reject`,{reason});if(r&&!r._error){_toast('Return rejected','info','❌');window._jmNavMore('seller-returns');}};

// ══════════════════════════════════════════════════════════════════════════════
// 8. VERIFICATION
// ══════════════════════════════════════════════════════════════════════════════
async function renderVerification(container) {
    _page(container,'🛡️ Seller Verification',_loading('Verification'));
    try {
        const r=await _api('GET','/marketplace/seller/verification');
        const {status='unverified',kyc=null}=r?.data||{};
        const body=container.querySelector('div>div:last-child');if(!body)return;
        const statusBoxes={
            approved:'<div style="background:#d1fae5;border-radius:12px;padding:13px 16px;margin-bottom:14px;font-size:13px;color:#065f46;font-weight:600">✅ <strong>Verified Seller</strong> — Full access granted.</div>',
            pending:'<div style="background:#fef3c7;border-radius:12px;padding:13px 16px;margin-bottom:14px;font-size:13px;color:#92400e;font-weight:600">⏳ <strong>Under Review</strong> — Usually takes 1–2 business days.</div>',
            rejected:`<div style="background:#fee2e2;border-radius:12px;padding:13px 16px;margin-bottom:14px;font-size:13px;color:#991b1b;font-weight:600">❌ <strong>Rejected</strong> — ${_esc(kyc?.review_reason||'Please resubmit.')} Correct and try again.</div>`,
            unverified:'<div style="background:#f3f4f6;border-radius:12px;padding:13px 16px;margin-bottom:14px;font-size:13px;color:#6b7280">ℹ️ Submit KYC documents to get verified and unlock higher limits.</div>',
        };
        body.innerHTML=`
        ${r?._error?_err(r._error):''}
        <div style="padding:16px">
        ${statusBoxes[status]||statusBoxes.unverified}
        ${status!=='approved'?_card('Submit Documents',`
            <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px">ID Type *</label>
            <select id="kycType" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px;font-size:14px;box-sizing:border-box;margin-bottom:10px;background:#fff;outline:none"><option value="">Select…</option><option value="national_id">National ID</option><option value="passport">Passport</option><option value="driving_license">Driving License</option></select>
            <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px">ID Number *</label>
            <input id="kycNum" type="text" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px;font-size:14px;box-sizing:border-box;margin-bottom:10px;outline:none" placeholder="Enter your ID number">
            <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px">Business Name (optional)</label>
            <input id="kycBiz" type="text" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px;font-size:14px;box-sizing:border-box;margin-bottom:14px;outline:none" placeholder="Your company or business name">
            ${_fullBtn('Submit for Verification',"window._submitKYC()")}`):''}
        ${_card('Benefits of Verification',['Higher payout limits (up to KES 100,000)','✓ Verified badge on all your listings','Access to flash sale promotions','Priority customer support','Reduced platform fees (8% vs 10%)'].map(b=>`<div style="display:flex;gap:10px;padding:7px 0;font-size:13px;color:#374151;border-bottom:1px solid #f9fafb"><span style="color:#22c55e;font-weight:700;flex-shrink:0">✓</span>${b}</div>`).join(''))}
        </div>`;
    } catch(ex) {
        const b=container.querySelector('div>div:last-child');
        if(b) b.innerHTML=_err(ex.message)+`<div style="padding:0 16px">${_empty('🛡️','Could not load verification','Retry to try again.','Retry',`window._jmNavMore('seller-verification')`)}</div>`;
    }
}
window._submitKYC=async()=>{
    const t=document.getElementById('kycType')?.value,n=document.getElementById('kycNum')?.value?.trim(),b=document.getElementById('kycBiz')?.value?.trim();
    if(!t||!n){_toast('ID type and number required','error','⚠️');return;}
    const r=await _api('POST','/marketplace/seller/verification',{id_type:t,id_number:n,business_name:b||''});
    if(r&&!r._error){_toast('Submitted! Review in 1–2 days.','success','🛡️');window._jmNavMore('seller-verification');}
    else _toast(r?._error||'Failed','error','❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 9. SUBSCRIPTION
// ══════════════════════════════════════════════════════════════════════════════
async function renderSubscription(container) {
    _page(container,'📋 Subscription',_loading('Plans'));
    try {
        const r=await _api('GET','/marketplace/seller/subscription');
        const {plan='basic',expires_at=null,plans=[]}=r?.data||{};
        const disp=plans.length?plans:[
            {id:'basic',name:'Basic',price:0,listing_limit:10,features:['10 active listings','Basic analytics','Standard support']},
            {id:'professional',name:'Professional',price:500,listing_limit:100,features:['100 listings','Full analytics','Priority support','Boost 5/month','CSV tools'],recommended:true},
            {id:'premium',name:'Premium',price:1500,listing_limit:9999,features:['Unlimited listings','Advanced analytics','VIP support','Unlimited boosts','Featured placement']},
        ];
        const body=container.querySelector('div>div:last-child');if(!body)return;
        body.innerHTML=`
        ${r?._error?_err(r._error):''}
        <div style="background:#d1fae5;border-radius:12px;margin:12px 16px 0;padding:12px 16px;font-size:13px;color:#065f46;font-weight:700">Current: <strong>${(plan||'basic').toUpperCase()}</strong>${expires_at?` · Renews ${_date(expires_at)}`:' · Free forever'}</div>
        <div style="padding:12px 16px">
        ${disp.map(p=>`<div style="border:2px solid ${p.id===plan?'#f57224':p.recommended?'#8b5cf6':'#e5e7eb'};border-radius:16px;padding:18px;margin-bottom:12px;background:${p.id===plan?'#fff8f5':p.recommended?'#faf5ff':'#fff'}">
            ${p.recommended?'<div style="font-size:10px;font-weight:800;color:#8b5cf6;text-transform:uppercase;margin-bottom:5px">⭐ Most Popular</div>':''}
            ${p.id===plan?'<div style="font-size:10px;font-weight:800;color:#f57224;text-transform:uppercase;margin-bottom:5px">✓ Current Plan</div>':''}
            <div style="font-size:20px;font-weight:900;margin-bottom:4px">${p.name}</div>
            <div style="font-size:26px;font-weight:900;color:#f57224">${p.price===0?'Free':'KES '+p.price.toLocaleString()}<span style="font-size:13px;font-weight:400;color:#9ca3af">/mo</span></div>
            <div style="font-size:12px;color:#6b7280;margin:6px 0 12px">${p.listing_limit===9999?'Unlimited':p.listing_limit} listings</div>
            ${p.features.map(f=>`<div style="display:flex;gap:8px;font-size:13px;padding:4px 0;color:#374151"><span style="color:#22c55e;flex-shrink:0">✓</span>${f}</div>`).join('')}
            ${p.id!==plan?`<button onclick="window._upgradePlan('${p.id}')" style="width:100%;background:#f57224;color:#fff;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;margin-top:14px">${p.price===0?'Downgrade to Basic':'Upgrade to '+p.name}</button>`:'<div style="margin-top:12px;text-align:center;font-size:12px;color:#22c55e;font-weight:700">✓ Active Plan</div>'}
        </div>`).join('')}
        </div>`;
    } catch(ex) {
        const b=container.querySelector('div>div:last-child');
        if(b) b.innerHTML=_err(ex.message)+`<div style="padding:0 16px">${_empty('📋','Could not load plans','Retry to try again.','Retry',`window._jmNavMore('seller-subscription')`)}</div>`;
    }
}
window._upgradePlan=async plan=>{const r=await _api('POST','/marketplace/seller/subscription/upgrade',{plan});if(r&&!r._error){_toast(`Upgraded to ${plan}! 🎉`,'success','📋');window._jmNavMore('seller-subscription');}else _toast(r?._error||'Failed','error','❌');};

// ══════════════════════════════════════════════════════════════════════════════
// 10. ADMIN APPROVAL PANEL
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminApproval(container) {
    _page(container,'✅ Product Approval',_loading('Pending Products'));
    try {
        const r=await _api('GET','/marketplace/admin/products/pending');
        const products=r?.data?.products||[];
        const body=container.querySelector('div>div:last-child');if(!body)return;
        body.innerHTML=`
        <div style="background:#fef3c7;padding:10px 16px;font-size:12px;color:#92400e;font-weight:600">${products.length} product${products.length!==1?'s':''} waiting for your review</div>
        ${r?._error?_err(r._error):''}
        <div style="padding:12px 16px">
        ${products.length?products.map(p=>{
            const img=p.image||(Array.isArray(p.images)?p.images[0]:'')||'';
            return `<div style="background:#fff;border-radius:14px;margin-bottom:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
                ${img?`<img src="${_esc(img)}" style="width:100%;height:160px;object-fit:cover;background:#f3f4f6">`:'<div style="width:100%;height:120px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:48px">📦</div>'}
                <div style="padding:14px">
                    <div style="font-weight:800;font-size:15px;margin-bottom:3px">${_esc(p.title||'Untitled')}</div>
                    <div style="font-size:12px;color:#6b7280;margin-bottom:6px">${_fmt(p.price)} · ${_esc(p.category||'')} · ${_date(p.submitted_at||p.created_at)}</div>
                    ${p.description?`<div style="font-size:12px;color:#374151;line-height:1.5;margin-bottom:10px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${_esc(p.description)}</div>`:''}
                    <div style="display:flex;gap:8px"><button onclick="window._admApprove('${p.id}')" style="flex:1;background:#d1fae5;color:#065f46;border:none;border-radius:10px;padding:10px;font-weight:800;font-size:13px;cursor:pointer">✅ Approve</button><button onclick="window._admRejectModal('${p.id}','${_esc((p.title||'').replace(/'/g,"\\'"))}')" style="flex:1;background:#fee2e2;color:#ef4444;border:none;border-radius:10px;padding:10px;font-weight:800;font-size:13px;cursor:pointer">❌ Reject</button></div>
                </div>
            </div>`;
        }).join(''):_empty('✅','All caught up!','No products pending review right now. Check back later.')}
        </div>`;
    } catch(ex) {
        const b=container.querySelector('div>div:last-child');
        if(b) b.innerHTML=_err(ex.message)+`<div style="padding:0 16px">${_empty('✅','Could not load queue','Retry to try again.','Retry',`window._jmNavMore('admin-approval')`)}</div>`;
    }
}
window._admApprove=async id=>{const r=await _api('POST',`/marketplace/admin/products/${id}/approve`);if(r&&!r._error){_toast('Product approved and live! 🎉','success','✅');window._jmNavMore('admin-approval');}else _toast(r?._error||'Failed','error','❌');};
window._admRejectModal=function(id,title){
    document.getElementById('admRM')?.remove();
    const ov=document.createElement('div');ov.id='admRM';ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99000;display:flex;align-items:flex-end;justify-content:center';
    ov.innerHTML=`<div style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px"><div style="font-weight:800;font-size:16px;margin-bottom:10px">❌ Reject: ${_esc(title)}</div><div style="font-size:13px;color:#6b7280;margin-bottom:10px">Give the seller a clear reason:</div><textarea id="admRR" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:12px;font-size:14px;box-sizing:border-box;resize:none;height:90px;outline:none" placeholder="e.g. Images are blurry. Please upload clear, well-lit product photos."></textarea><div style="display:flex;gap:8px;margin-top:10px"><button onclick="window._admReject('${id}')" style="flex:1;background:#fee2e2;color:#ef4444;border:none;border-radius:10px;padding:12px;font-weight:800;font-size:14px;cursor:pointer">Confirm Reject</button><button onclick="document.getElementById('admRM').remove()" style="flex:1;background:#f3f4f6;color:#374151;border:none;border-radius:10px;padding:12px;font-weight:800;font-size:14px;cursor:pointer">Cancel</button></div></div>`;
    document.body.appendChild(ov);
};
window._admReject=async id=>{const reason=document.getElementById('admRR')?.value?.trim()||'Does not meet marketplace standards';document.getElementById('admRM')?.remove();const r=await _api('POST',`/marketplace/admin/products/${id}/reject`,{reason});if(r&&!r._error){_toast('Product rejected. Seller notified.','info','❌');window._jmNavMore('admin-approval');}else _toast(r?._error||'Failed','error','❌');};

// ── Routing ───────────────────────────────────────────────────────────────────
const ROUTES = {
    'seller-dashboard':    renderSellerDashboard,
    'my-listings':         renderMyListings,
    'seller-inventory':    renderInventory,
    'seller-analytics':    renderSellerAnalytics,
    'seller-payouts':      renderPayouts,
    'seller-shipping':     renderShipping,
    'seller-returns':      renderReturns,
    'seller-verification': renderVerification,
    'seller-subscription': renderSubscription,
    'admin-approval':      renderAdminApproval,
};

const _prev = window._jmNavMore;
window._jmNavMore = function(page) {
    const fn = ROUTES[page];
    if (fn) {
        document.querySelectorAll('.jm-page').forEach(p => { p.classList.remove('active'); p.style.cssText = ''; });
        window._jmHideMore?.();
        const pid = 'sdPage_' + page.replace(/-/g,'_');
        let el = document.getElementById(pid);
        if (!el) {
            el = document.createElement('div');
            el.id = pid; el.className = 'jm-page';
            const sidebar = document.getElementById('sidebar') || document.body;
            const nav = document.getElementById('jmBottomNav');
            nav ? sidebar.insertBefore(el, nav) : sidebar.appendChild(el);
        }
        el.classList.add('active');
        // Force inline styles every time
        el.style.cssText = 'display:flex!important;flex-direction:column!important;flex:1!important;min-height:0!important;overflow:hidden!important;background:#f3f4f6!important';
        // Show loading immediately then render
        el.innerHTML = `<div style="display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:#f3f4f6"><div style="background:#fff;padding:13px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f3f4f6;flex-shrink:0"><button onclick="window._jmNav('account')" style="width:34px;height:34px;border-radius:50%;border:none;background:#f3f4f6;cursor:pointer;font-size:16px">←</button><div style="font-weight:800;font-size:15px;color:#111;flex:1">Loading…</div></div><div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#9ca3af"><div style="font-size:36px">⏳</div><div style="font-size:14px;font-weight:600">Loading…</div></div></div>`;
        Promise.resolve(fn(el)).catch(err => {
            el.innerHTML = `<div style="padding:40px 20px;text-align:center"><div style="font-size:40px;margin-bottom:12px">⚠️</div><div style="font-weight:800;font-size:16px;color:#991b1b;margin-bottom:8px">Error loading page</div><div style="font-size:13px;color:#6b7280;margin-bottom:16px">${_esc(err?.message||'Unknown error')}</div><button onclick="window._jmNavMore('${page}')" style="background:#f57224;color:#fff;border:none;border-radius:12px;padding:12px 24px;font-weight:800;cursor:pointer">🔄 Retry</button></div>`;
        });
        return;
    }
    _prev?.call(this, page);
};

console.log('[marketplace-seller.js v3] ✅ Loaded');
})();
