/**
 * marketplace-seller.js v2.0 — COMPLETE SELLER MODULE
 * Full error handling, loading states, real empty states, offline fallback.
 */
(function _SellerModule() {
'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────
const _esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _fmt  = n => 'KES ' + parseFloat(n||0).toLocaleString('en-KE',{minimumFractionDigits:0,maximumFractionDigits:0});
const _date = d => d ? new Date(d).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}) : '—';
const _ls   = {
    save:(k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v))}catch(_){} },
    load:(k,d=null)=>{ try{const r=localStorage.getItem(k);return r?JSON.parse(r):d}catch(_){return d} }
};

function _toast(msg, type='info', icon='ℹ️') {
    if (typeof window._jmToast==='function') { window._jmToast(msg,type,icon); return; }
    const colors={success:'#22c55e',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
    let box=document.getElementById('sellerToastBox');
    if (!box) { box=document.createElement('div'); box.id='sellerToastBox'; box.style.cssText='position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;width:min(380px,90vw)'; document.body.appendChild(box); }
    const t=document.createElement('div'); t.style.cssText=`background:${colors[type]};color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;gap:10px`; t.innerHTML=`<span>${icon}</span><span>${_esc(msg)}</span>`; box.appendChild(t); setTimeout(()=>t.remove(),3500);
}

async function _api(method, endpoint, body=null) {
    try {
        const token = window.__kynToken||window.__accessToken||localStorage.getItem('authToken')||localStorage.getItem('token')||localStorage.getItem('moodchat_token')||localStorage.getItem('accessToken')||'';
        const base  = (window.__kynAPI?.baseUrl||'').replace(/\/api$/,'').replace(/\/$/,'') || (typeof window.__getApiBase==='function'?window.__getApiBase().replace(/\/api$/,''):'') || '';
        const url   = (base||window.location.origin.replace(/\/+$/,'')) + '/api' + endpoint;
        const res   = await fetch(url, { method:method.toUpperCase(), headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}, ...(body&&method!=='GET'?{body:JSON.stringify(body)}:{}) });
        const json  = await res.json();
        if (!res.ok) return { _error: json?.message||'Request failed ('+res.status+')', _status: res.status };
        return json;
    } catch(e) { return { _error: e.message||'Network error', _offline: true }; }
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
(function _css() {
    if (document.getElementById('sellerModCSS')) return;
    const s = document.createElement('style'); s.id='sellerModCSS';
    s.textContent = `
    @keyframes sd-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    .sd-wrap{display:flex;flex-direction:column;height:100%;background:#f3f4f6;animation:sd-in .3s ease}
    .sd-head{background:#fff;padding:13px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #f3f4f6;flex-shrink:0;position:sticky;top:0;z-index:10}
    .sd-back-btn{width:36px;height:36px;border-radius:50%;border:none;background:#f3f4f6;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;color:#374151;flex-shrink:0}
    .sd-head-title{font-weight:800;font-size:15px;flex:1;color:#111}
    .sd-body{flex:1;overflow-y:auto;padding-bottom:80px}
    .sd-metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 16px 0}
    .sd-metric{background:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .sd-metric.hi{background:linear-gradient(135deg,#f57224,#ff4e16);color:#fff}
    .sd-metric-l{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;margin-bottom:4px}
    .sd-metric.hi .sd-metric-l{color:rgba(255,255,255,.75)}
    .sd-metric-v{font-size:22px;font-weight:900;color:#111;letter-spacing:-.5px}
    .sd-metric.hi .sd-metric-v{color:#fff}
    .sd-metric-s{font-size:11px;color:#6b7280;margin-top:3px}
    .sd-metric.hi .sd-metric-s{color:rgba(255,255,255,.7)}
    .sd-card{background:#fff;border-radius:16px;margin:12px 16px 0;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .sd-card-title{font-weight:800;font-size:14px;margin-bottom:12px;color:#111;display:flex;align-items:center;justify-content:space-between}
    .sd-chart{height:120px;display:flex;align-items:flex-end;gap:4px;background:#f9fafb;border-radius:10px;padding:10px 8px 6px;overflow:hidden;margin-top:8px}
    .sd-bar{flex:1;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#f57224,#e0651f);min-height:4px;transition:height .5s ease;cursor:pointer;position:relative}
    .sd-bar:hover::after{content:attr(data-v);position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:#111;color:#fff;font-size:9px;padding:2px 5px;border-radius:3px;white-space:nowrap;pointer-events:none}
    .sd-chart-labels{display:flex;gap:4px;padding:4px 8px 0;margin-bottom:4px}
    .sd-chart-label{flex:1;text-align:center;font-size:9px;color:#9ca3af}
    .sd-badge{display:inline-flex;align-items:center;border-radius:20px;padding:3px 9px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}
    .sd-badge-pending{background:#fef3c7;color:#92400e}
    .sd-badge-approved,.sd-badge-active{background:#d1fae5;color:#065f46}
    .sd-badge-rejected{background:#fee2e2;color:#991b1b}
    .sd-badge-draft{background:#f3f4f6;color:#6b7280}
    .sd-badge-archived{background:#e0e7ff;color:#3730a3}
    .sd-prod-row{display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:1px solid #f9fafb}
    .sd-prod-row:last-child{border-bottom:none}
    .sd-prod-img{width:54px;height:54px;border-radius:8px;object-fit:cover;background:#f3f4f6;flex-shrink:0}
    .sd-prod-img-ph{width:54px;height:54px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
    .sd-btn{border:none;border-radius:9px;padding:8px 16px;font-weight:700;font-size:12px;cursor:pointer;transition:all .2s;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}
    .sd-btn-primary{background:#f57224;color:#fff}
    .sd-btn-primary:hover{background:#e0651f}
    .sd-btn-secondary{background:#f3f4f6;color:#374151}
    .sd-btn-secondary:hover{background:#e5e7eb}
    .sd-btn-danger{background:#fee2e2;color:#ef4444}
    .sd-btn-success{background:#d1fae5;color:#065f46}
    .sd-btn-full{width:100%;justify-content:center;padding:13px 16px;border-radius:12px;font-size:14px}
    .sd-empty{padding:40px 20px;text-align:center;color:#9ca3af}
    .sd-empty-icon{font-size:48px;margin-bottom:12px}
    .sd-empty-title{font-size:15px;font-weight:700;color:#374151;margin-bottom:6px}
    .sd-empty-desc{font-size:13px;line-height:1.5;margin-bottom:20px}
    .sd-quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .sd-quick-btn{background:#f9fafb;border:1.5px solid #f3f4f6;border-radius:12px;padding:14px 12px;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:#374151}
    .sd-quick-btn:hover{background:#fff8f5;border-color:#f57224;color:#f57224}
    .sd-quick-btn span:first-child{font-size:20px;flex-shrink:0}
    .sd-order-row{padding:12px;background:#f9fafb;border-radius:10px;margin-bottom:8px;cursor:pointer}
    .sd-order-row:hover{background:#f0fdf4}
    .sd-table-wrap{overflow-x:auto}
    .sd-table{width:100%;border-collapse:collapse;font-size:12px;min-width:320px}
    .sd-table th{text-align:left;padding:8px 10px;font-size:10px;font-weight:800;text-transform:uppercase;color:#9ca3af;border-bottom:2px solid #f3f4f6;background:#fafafa}
    .sd-table td{padding:10px;border-bottom:1px solid #f9fafb;vertical-align:middle}
    .sd-stock-input{width:60px;border:1.5px solid #e5e7eb;border-radius:6px;padding:5px 6px;font-size:13px;text-align:center;outline:none}
    .sd-stock-input:focus{border-color:#f57224}
    .sd-payout-banner{background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;border-radius:18px;margin:12px 16px 0;padding:20px}
    .sd-plan-card{border:2px solid #e5e7eb;border-radius:16px;padding:18px;margin-bottom:10px;transition:all .2s}
    .sd-plan-card.current{border-color:#f57224;background:#fff8f5}
    .sd-kyc-box{border-radius:12px;padding:14px 16px;margin-bottom:14px;font-size:13px}
    .sd-kyc-box.pending{background:#fef3c7;color:#92400e}
    .sd-kyc-box.approved{background:#d1fae5;color:#065f46}
    .sd-kyc-box.unverified{background:#f3f4f6;color:#6b7280}
    .sd-form-label{font-size:12px;font-weight:700;color:#374151;margin-bottom:4px;display:block}
    .sd-form-input{width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:14px;box-sizing:border-box;outline:none;margin-bottom:10px;background:#fff;color:#111}
    .sd-form-input:focus{border-color:#f57224}
    .sd-form-select{width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:14px;box-sizing:border-box;outline:none;margin-bottom:10px;background:#fff;color:#111}
    .sd-material-chip{display:inline-flex;align-items:center;background:#f3f4f6;border:1.5px solid #e5e7eb;border-radius:20px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;margin:3px;transition:all .15s}
    .sd-material-chip.on{background:#fff8f5;border-color:#f57224;color:#f57224}
    .sd-variant-row{display:flex;gap:6px;align-items:center;background:#f9fafb;border-radius:8px;padding:8px;margin-bottom:6px}
    .sd-variant-row input{flex:1;border:1.5px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:13px;background:#fff;outline:none}
    .sd-variant-row input:focus{border-color:#f57224}
    .sd-spec-row{display:grid;grid-template-columns:1fr 1fr auto;gap:6px;margin-bottom:6px}
    .sd-spec-row input{border:1.5px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:13px;background:#fff;outline:none}
    .sd-spec-row input:focus{border-color:#f57224}
    .sd-rm-btn{background:#fee2e2;border:none;border-radius:6px;padding:6px 8px;cursor:pointer;color:#ef4444;font-size:12px;flex-shrink:0}
    .sd-preview-bar{background:#111;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0;position:sticky;top:0;z-index:10}
    .sd-preview-tag{background:#f59e0b;color:#111;border-radius:5px;padding:2px 8px;font-size:10px;font-weight:800}
    `;
    document.head.appendChild(s);
})();

// ─── Page helpers ─────────────────────────────────────────────────────────────
function _shell(title, bodyHtml, backPage='home') {
    return `<div class="sd-wrap">
        <div class="sd-head">
            <button class="sd-back-btn" onclick="window._jmNavMore('${backPage}')">←</button>
            <div class="sd-head-title">${title}</div>
        </div>
        <div class="sd-body">${bodyHtml}</div>
    </div>`;
}
function _loading() { return '<div class="sd-empty"><div class="sd-empty-icon">⏳</div><div class="sd-empty-title">Loading…</div></div>'; }
function _empty(icon,title,desc,btnLabel='',btnAction='') {
    return `<div class="sd-empty"><div class="sd-empty-icon">${icon}</div><div class="sd-empty-title">${title}</div><div class="sd-empty-desc">${desc}</div>${btnLabel?`<button class="sd-btn sd-btn-primary" onclick="${btnAction}">${btnLabel}</button>`:''}</div>`;
}
function _errBox(msg) {
    return `<div style="margin:12px 16px;background:#fee2e2;border-radius:12px;padding:14px 16px;font-size:13px;color:#991b1b;display:flex;align-items:center;gap:10px"><span>⚠️</span><div><div style="font-weight:700">Could not load data</div><div style="margin-top:3px;opacity:.85">${_esc(msg)}</div></div></div>`;
}

// ─── Category materials ───────────────────────────────────────────────────────
const CAT_MATERIALS = {
    furniture:['Wood','Mahogany','Oak','Pine','Bamboo','Metal','Plastic','Glass','Rattan','MDF','Fabric'],
    fashion:['Cotton','Leather','Polyester','Silk','Wool','Denim','Linen','Nylon','Velvet','Suede'],
    electronics:['Aluminum','Plastic','Glass','Stainless Steel','Carbon Fiber','Rubber','Silicone'],
    food:['Organic','Fresh','Frozen','Halal Certified','Vegetarian','Vegan','Gluten-Free'],
    beauty:['Natural','Organic','Cruelty-free','Paraben-free','Hypoallergenic','Vegan'],
    sports:['Rubber','Foam','Nylon','Carbon Fiber','Aluminum','Polyester','Neoprene'],
    construction:['Steel','Aluminum','Cement','Ceramic','Marble','Granite','PVC','Copper'],
    automotive:['Steel','Aluminum','Rubber','Plastic','Carbon Fiber','Leather'],
    toys:['Plastic','Wood','Fabric','Metal','Rubber','BPA-Free','EVA Foam'],
    books:['Paperback','Hardcover','Digital','Spiral-bound','Leather-bound'],
    home:['Wood','Metal','Ceramic','Glass','Fabric','Plastic','Stone'],
    health:['Natural','Organic','FDA Approved','Hypoallergenic','Medical Grade'],
};

// ─── Physical product form state ──────────────────────────────────────────────
const _phys = { images:[], variants:[], specs:[], materials:[] };

window._physCategoryChanged = function(cat) {
    const g = document.getElementById('physMatsGroup');
    const c = document.getElementById('physMatsOptions');
    const mats = CAT_MATERIALS[cat] || CAT_MATERIALS['home'] || [];
    if (!g||!c) return;
    g.style.display = mats.length ? 'block' : 'none';
    _phys.materials = [];
    c.innerHTML = mats.map(m=>`<span class="sd-material-chip" onclick="window._physToggleMat(this,'${m}')">${m}</span>`).join('');
};
window._physToggleMat = (el,m) => { el.classList.toggle('on'); _phys.materials = el.classList.contains('on') ? [..._phys.materials,m] : _phys.materials.filter(x=>x!==m); };
window._physCalcDisc = function() {
    const p=parseFloat(document.getElementById('physPrice')?.value||0), o=parseFloat(document.getElementById('physOrigPrice')?.value||0), lbl=document.getElementById('physDiscLabel');
    if (!lbl) return;
    lbl.style.display = o>p&&p>0 ? 'block' : 'none';
    if (o>p&&p>0) lbl.textContent = `🏷️ ${Math.round((1-p/o)*100)}% discount`;
};
window._physAddImages = function(files) {
    const grid = document.getElementById('physImgGrid');
    if (!grid) return;
    Array.from(files).slice(0, 8-_phys.images.length).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const url = URL.createObjectURL(file);
        const idx = _phys.images.push({url,file})-1;
        const d = document.createElement('div');
        d.style.cssText='position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#f3f4f6';
        d.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover"><button onclick="window._physRemImg(${idx},this.parentElement)" style="position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;border:none;cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:700">✕</button>`;
        grid.appendChild(d);
    });
};
window._physRemImg = (idx,el) => { _phys.images.splice(idx,1); el?.remove(); };
window._physAddVariant = function() {
    const c=document.getElementById('physVariantsWrap'); if(!c)return;
    const i=_phys.variants.push({name:'',options:''})-1;
    const r=document.createElement('div'); r.className='sd-variant-row';
    r.innerHTML=`<input placeholder="Type (e.g. Color)" oninput="_phys.variants[${i}].name=this.value"><input placeholder="Options: Red, Blue, Green" oninput="_phys.variants[${i}].options=this.value" style="flex:2"><button class="sd-rm-btn" onclick="this.parentElement.remove();_phys.variants.splice(${i},1)">✕</button>`;
    c.appendChild(r);
};
window._physAddSpec = function() {
    const c=document.getElementById('physSpecsWrap'); if(!c)return;
    const i=_phys.specs.push({key:'',value:''})-1;
    const r=document.createElement('div'); r.className='sd-spec-row';
    r.innerHTML=`<input placeholder="Name (e.g. Weight)" oninput="_phys.specs[${i}].key=this.value"><input placeholder="Value (e.g. 2kg)" oninput="_phys.specs[${i}].value=this.value"><button class="sd-rm-btn" onclick="this.parentElement.remove();_phys.specs.splice(${i},1)">✕</button>`;
    c.appendChild(r);
};
window._physPreview = function() {
    const title=document.getElementById('physTitle')?.value||'Product Preview';
    const price=document.getElementById('physPrice')?.value||'0';
    const orig =document.getElementById('physOrigPrice')?.value||'';
    const desc =document.getElementById('physDesc')?.value||'';
    const brand=document.getElementById('physBrand')?.value||'';
    const stock=parseInt(document.getElementById('physStock')?.value||'0');
    const imgs =_phys.images.slice(0,5);
    const specs=_phys.specs.filter(s=>s.key&&s.value);
    const vars =_phys.variants.filter(v=>v.name);
    const mats =_phys.materials;

    document.getElementById('physPreviewOv')?.remove();
    const ov=document.createElement('div'); ov.id='physPreviewOv';
    ov.style.cssText='position:fixed;inset:0;z-index:99999;background:#f9fafb;overflow-y:auto;display:flex;flex-direction:column';
    ov.innerHTML=`
    <div class="sd-preview-bar">
        <span class="sd-preview-tag">PREVIEW</span>
        <span style="flex:1;font-size:12px;opacity:.75">Customer view (not live yet)</span>
        <button onclick="document.getElementById('physPreviewOv').remove()" style="background:rgba(255,255,255,.15);border:none;border-radius:8px;padding:6px 14px;color:#fff;font-size:13px;cursor:pointer;font-weight:700">✕ Close</button>
    </div>
    <div style="background:#fff;max-width:480px;margin:0 auto;width:100%">
        <div style="position:relative;background:#f3f4f6;aspect-ratio:1.1;max-height:300px;overflow:hidden">
            ${imgs.length?`<img src="${imgs[0].url}" style="width:100%;height:100%;object-fit:cover">`:`<div style="width:100%;height:260px;display:flex;align-items:center;justify-content:center;font-size:60px">📦</div>`}
            ${imgs.length>1?`<div style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:5px">${imgs.map((_,i)=>`<div style="width:${i===0?14:8}px;height:8px;border-radius:4px;background:${i===0?'#f57224':'rgba(0,0,0,.25)'}"></div>`).join('')}</div>`:''}
        </div>
        <div style="padding:16px">
            ${brand?`<div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${_esc(brand)}</div>`:''}
            <div style="font-size:18px;font-weight:800;color:#111;line-height:1.3;margin-bottom:10px">${_esc(title)}</div>
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:10px">
                <span style="font-size:26px;font-weight:900;color:#f57224">KES ${parseFloat(price).toLocaleString()}</span>
                ${orig&&parseFloat(orig)>parseFloat(price)?`<span style="font-size:16px;color:#9ca3af;text-decoration:line-through">KES ${parseFloat(orig).toLocaleString()}</span><span style="background:#fee2e2;color:#ef4444;font-size:11px;font-weight:800;border-radius:4px;padding:2px 7px">${Math.round((1-parseFloat(price)/parseFloat(orig))*100)}% OFF</span>`:''}
            </div>
            <div style="font-size:13px;font-weight:700;color:${stock>5?'#22c55e':stock>0?'#f59e0b':'#ef4444'};margin-bottom:14px">
                ${stock>5?`✓ In Stock (${stock} units)`:stock>0?`⚠️ Only ${stock} left!`:'✗ Out of Stock'}
            </div>
            ${vars.length?vars.map(v=>`<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:700;margin-bottom:6px">${_esc(v.name)}</div><div style="display:flex;flex-wrap:wrap;gap:6px">${v.options.split(',').map(o=>`<div style="border:1.5px solid #e5e7eb;border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer">${_esc(o.trim())}</div>`).join('')}</div></div>`).join(''):''}
            <div style="display:flex;gap:10px;margin-bottom:16px">
                <button style="flex:1;background:#f57224;color:#fff;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:15px">Add to Cart</button>
                <button style="flex:1;background:#111;color:#fff;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:15px">Buy Now</button>
            </div>
        </div>
        ${desc?`<div style="background:#fff;border-top:8px solid #f9fafb;padding:16px"><div style="font-weight:800;font-size:14px;margin-bottom:8px">Description</div><div style="font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap">${_esc(desc)}</div></div>`:''}
        ${mats.length?`<div style="background:#fff;border-top:8px solid #f9fafb;padding:16px"><div style="font-weight:800;font-size:14px;margin-bottom:8px">Materials</div><div style="display:flex;flex-wrap:wrap;gap:6px">${mats.map(m=>`<span style="background:#f3f4f6;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600">${_esc(m)}</span>`).join('')}</div></div>`:''}
        ${specs.length?`<div style="background:#fff;border-top:8px solid #f9fafb;padding:16px"><div style="font-weight:800;font-size:14px;margin-bottom:12px">Specifications</div>${specs.map(s=>`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f9fafb;font-size:13px"><span style="color:#6b7280">${_esc(s.key)}</span><span style="font-weight:600">${_esc(s.value)}</span></div>`).join('')}</div>`:''}
        <div style="height:40px"></div>
    </div>`;
    document.body.appendChild(ov);
};

window._physPublish = async function() {
    const title=document.getElementById('physTitle')?.value?.trim();
    const price=parseFloat(document.getElementById('physPrice')?.value||0);
    const desc =document.getElementById('physDesc')?.value?.trim();
    const cat  =document.getElementById('physCategory')?.value;
    const stock=parseInt(document.getElementById('physStock')?.value||0);
    if (!title) { _toast('Product name is required','error','⚠️'); return null; }
    if (price<=0) { _toast('Set a valid price','error','⚠️'); return null; }
    if (!desc) { _toast('Description is required','error','⚠️'); return null; }
    if (!cat) { _toast('Select a category','error','⚠️'); return null; }
    if (_phys.images.length===0) { _toast('Add at least one product image','error','📸'); return null; }

    const btn=document.getElementById('physPublishBtn');
    if (btn) { btn.disabled=true; btn.textContent='⏳ Submitting…'; }

    const imgUrls = await Promise.all(_phys.images.slice(0,8).map(img=>new Promise(res=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.readAsDataURL(img.file); })));

    const payload={
        title, description:desc,
        short_description:document.getElementById('physShortDesc')?.value?.trim()||'',
        price, original_price:parseFloat(document.getElementById('physOrigPrice')?.value||0)||null,
        category:cat, subcategory:document.getElementById('physSubcat')?.value?.trim()||'',
        brand:document.getElementById('physBrand')?.value?.trim()||'',
        sku:document.getElementById('physSku')?.value?.trim()||'',
        stock_quantity:stock, weight:parseFloat(document.getElementById('physWeight')?.value||0)||null,
        images:imgUrls, type:'physical', condition:'new',
        available:false, status:'pending_review', approval_status:'pending',
        metadata:{ materials:_phys.materials, variants:_phys.variants.filter(v=>v.name), specs:Object.fromEntries(_phys.specs.filter(s=>s.key&&s.value).map(s=>[s.key,s.value])) },
    };

    const r = await _api('POST','/marketplace/products',payload);
    if (btn) { btn.disabled=false; btn.textContent='Submit for Review'; }

    if (r?._error) { _toast(r._error,'error','❌'); return null; }
    const product = r?.data?.product || r?.product;
    if (!product) { _toast('Submission failed — try again','error','❌'); return null; }

    _phys.images=[]; _phys.variants=[]; _phys.specs=[]; _phys.materials=[];
    _ls.save('jm_seller_last_submit', Date.now());
    _toast('Submitted for review! Goes live after admin approval ✅','success','📋');
    if (typeof window.hideCreateListingModal==='function') window.hideCreateListingModal();
    window._sellerDashRef?.reload?.();
    return product;
};

// Hook physical tab to publish button
(function _hookPublishBtn() {
    const tryHook = () => {
        const btn = document.getElementById('publishListingBtn');
        if (!btn) { setTimeout(tryHook, 800); return; }
        const orig = btn.onclick;
        btn.onclick = async function(e) {
            const activeTab = document.querySelector('.create-listing-tab.active')?.dataset?.tab;
            if (activeTab==='physical') { await window._physPublish(); }
            else { orig?.call(this,e); }
        };
    };
    setTimeout(tryHook, 600);
})();

// ══════════════════════════════════════════════════════════════════════════════
// 1. SELLER DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
async function renderSellerDashboard(container) {
    container.innerHTML = _shell('🏪 Seller Dashboard', _loading());
    try {
        const [dR, aR] = await Promise.all([
            _api('GET','/marketplace/seller-dashboard'),
            _api('GET','/marketplace/seller/analytics?period=7d'),
        ]);
        const d  = (!dR||dR._error) ? {} : (dR.data||dR);
        const an = (!aR||aR._error) ? {} : (aR.data||aR);
        const rev = an.revenue || {};
        const ords= an.orders  || {};
        const prods=an.products|| {};
        const byDay= rev.by_day || [];
        const maxR = byDay.length ? Math.max(...byDay.map(x=>x.revenue||0), 1) : 1;
        const orders = d.recentOrders || [];
        const hasPending = (prods.pending||0) > 0;

        container.innerHTML = _shell('🏪 Seller Dashboard', `
        ${dR?._error||aR?._error ? _errBox((dR?._error||aR?._error)+' — showing cached data') : ''}
        <div class="sd-metrics">
            <div class="sd-metric hi">
                <div class="sd-metric-l">Revenue (7 days)</div>
                <div class="sd-metric-v">${_fmt(rev.total||0)}</div>
                <div class="sd-metric-s">${ords.total||0} total orders</div>
            </div>
            <div class="sd-metric hi">
                <div class="sd-metric-l">Products Live</div>
                <div class="sd-metric-v">${prods.approved||d.products||0}</div>
                <div class="sd-metric-s">${prods.pending||0} pending review</div>
            </div>
            <div class="sd-metric">
                <div class="sd-metric-l">Pending Orders</div>
                <div class="sd-metric-v" style="color:${(ords.pending||0)>0?'#f59e0b':'#22c55e'}">${ords.pending||0}</div>
                <div class="sd-metric-s">Need fulfillment</div>
            </div>
            <div class="sd-metric">
                <div class="sd-metric-l">Conversion Rate</div>
                <div class="sd-metric-v">${an.conversion_rate||0}%</div>
                <div class="sd-metric-s">${(prods.total_views||0).toLocaleString()} views</div>
            </div>
        </div>

        ${byDay.length ? `<div class="sd-card">
            <div class="sd-card-title">Revenue — Last 7 Days</div>
            <div class="sd-chart">${byDay.map(d=>`<div class="sd-bar" style="height:${Math.max(4,Math.round((d.revenue/maxR)*100))}%" data-v="${_fmt(d.revenue)}"></div>`).join('')}</div>
            <div class="sd-chart-labels">${byDay.map(d=>`<div class="sd-chart-label">${d.date?.slice(5)||''}</div>`).join('')}</div>
        </div>` : ''}

        <div class="sd-card">
            <div class="sd-card-title">Quick Actions</div>
            <div class="sd-quick-grid">
                <button class="sd-quick-btn" onclick="window._jmNavMore('my-listings')"><span>📦</span><span>My Listings</span></button>
                <button class="sd-quick-btn" onclick="window._jmHideMore?.();setTimeout(()=>document.getElementById('createListingBtn')?.click(),100)"><span>＋</span><span>New Product</span></button>
                <button class="sd-quick-btn" onclick="window._jmNavMore('seller-inventory')"><span>📊</span><span>Inventory</span></button>
                <button class="sd-quick-btn" onclick="window._jmNavMore('seller-analytics')"><span>📈</span><span>Analytics</span></button>
                <button class="sd-quick-btn" onclick="window._jmNavMore('seller-payouts')"><span>💰</span><span>Payouts</span></button>
                <button class="sd-quick-btn" onclick="window._jmNavMore('seller-shipping')"><span>🚚</span><span>Orders</span></button>
                <button class="sd-quick-btn" onclick="window._jmNavMore('seller-returns')"><span>↩️</span><span>Returns</span></button>
                <button class="sd-quick-btn" onclick="window._jmNavMore('seller-verification')"><span>🛡️</span><span>Verification</span></button>
            </div>
        </div>

        ${hasPending ? `<div class="sd-card" style="background:#fff3e0;border:1px solid #f59e0b">
            <div style="display:flex;align-items:center;gap:12px">
                <span style="font-size:28px">⏳</span>
                <div>
                    <div style="font-weight:800;font-size:14px;color:#92400e">${prods.pending} product${prods.pending!==1?'s':''} awaiting admin approval</div>
                    <div style="font-size:12px;color:#b45309;margin-top:3px">You'll be notified when reviewed (usually 24–48 hrs).</div>
                </div>
            </div>
        </div>` : ''}

        ${orders.length ? `<div class="sd-card">
            <div class="sd-card-title">Recent Orders <button class="sd-btn sd-btn-secondary" style="padding:5px 12px;font-size:11px" onclick="window._jmNavMore('seller-shipping')">View All</button></div>
            ${orders.slice(0,5).map(o=>{
                const sCol={pending:'#f59e0b',confirmed:'#3b82f6',shipped:'#f97316',delivered:'#22c55e',cancelled:'#ef4444'}[o.status]||'#9ca3af';
                const items=o.metadata?.items||o.items||[];
                return `<div class="sd-order-row" onclick="window._jmNavMore('seller-shipping')">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start">
                        <div style="font-size:13px;font-weight:800;color:#111">#${String(o.id||'').slice(-8)}</div>
                        <div style="font-size:14px;font-weight:900;color:#f57224">${_fmt(o.totalPrice||o.total_price||0)}</div>
                    </div>
                    <div style="font-size:11px;margin-top:4px"><span style="color:${sCol};font-weight:700;text-transform:capitalize">${o.status||'pending'}</span> · ${items.length} item${items.length!==1?'s':''} · ${_date(o.createdAt||o.created_at)}</div>
                </div>`;
            }).join('')}
        </div>` : `<div class="sd-card">
            ${_empty('🛍️','No orders yet','Your first order will appear here. Share your products to start selling!')}
        </div>`}
        `);
        window._sellerDashRef = { reload: () => renderSellerDashboard(container) };
    } catch(ex) {
        container.innerHTML = _shell('🏪 Seller Dashboard', _errBox(ex.message||'Unknown error') + _empty('🏪','Could not load dashboard','Check your connection and try again','Retry',`window._jmNavMore('seller-dashboard')`));
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. MY LISTINGS
// ══════════════════════════════════════════════════════════════════════════════
async function renderMyListings(container) {
    container.innerHTML = _shell('📦 My Listings', _loading());
    try {
        const r = await _api('GET','/marketplace/seller/products?limit=50');
        const products = r?.data?.products || r?.products || [];

        const groups = {
            pending_review: products.filter(p=>p.status==='pending_review'||p.approval_status==='pending'),
            rejected:       products.filter(p=>p.approval_status==='rejected'||p.status==='rejected'),
            approved:       products.filter(p=>['approved','active'].includes(p.status)||p.approval_status==='approved'),
            draft:          products.filter(p=>p.status==='draft'),
            archived:       products.filter(p=>p.status==='archived'),
        };

        const _group = (label, items, badgeCls) => !items.length ? '' : `
        <div class="sd-card">
            <div class="sd-card-title">${label} <span class="sd-badge ${badgeCls}" style="margin-left:6px">${items.length}</span></div>
            ${items.map(_prodRow).join('')}
        </div>`;

        container.innerHTML = _shell('📦 My Listings', `
        <div style="padding:12px 16px 0">
            <button class="sd-btn sd-btn-primary sd-btn-full" onclick="window._jmHideMore?.();setTimeout(()=>document.getElementById('createListingBtn')?.click(),100)">＋ Create New Listing</button>
        </div>
        ${r?._error ? _errBox(r._error) : ''}
        ${_group('⏳ Pending Review', groups.pending_review, 'sd-badge-pending')}
        ${_group('❌ Rejected — Edit & Resubmit', groups.rejected, 'sd-badge-rejected')}
        ${_group('✅ Live & Active', groups.approved, 'sd-badge-approved')}
        ${_group('📝 Drafts', groups.draft, 'sd-badge-draft')}
        ${_group('🗄️ Archived', groups.archived, 'sd-badge-archived')}
        ${!products.length ? `<div class="sd-card">${_empty('📭','No listings yet','Create your first product listing to start selling on the marketplace!','Create Listing',"window._jmHideMore?.();setTimeout(()=>document.getElementById('createListingBtn')?.click(),100)")}</div>` : ''}
        `);
    } catch(ex) {
        container.innerHTML = _shell('📦 My Listings', _errBox(ex.message||'Unknown error'));
    }
}

function _prodRow(p) {
    const statusKey = p.approval_status==='rejected'?'rejected': p.status==='pending_review'?'pending_review': p.status;
    const badgeCls  = {pending_review:'sd-badge-pending',rejected:'sd-badge-rejected',approved:'sd-badge-approved',active:'sd-badge-approved',draft:'sd-badge-draft',archived:'sd-badge-archived'}[statusKey]||'sd-badge-draft';
    const badgeLbl  = {pending_review:'Pending Review',rejected:'Rejected',approved:'Live',active:'Live',draft:'Draft',archived:'Archived',inactive:'Inactive',suspended:'Suspended'}[statusKey]||p.status||'Draft';
    const img = p.image||(Array.isArray(p.images)?p.images[0]:'')||'';
    return `<div class="sd-prod-row">
        ${img?`<img class="sd-prod-img" src="${_esc(img)}" loading="lazy">`:`<div class="sd-prod-img-ph">📦</div>`}
        <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px">${_esc(p.title||'Untitled')}</div>
            <div style="margin-bottom:5px"><span class="sd-badge ${badgeCls}">${badgeLbl}</span></div>
            ${p.rejection_reason?`<div style="font-size:11px;color:#ef4444;margin-bottom:5px;line-height:1.4">Reason: ${_esc(p.rejection_reason)}</div>`:''}
            <div style="font-size:11px;color:#9ca3af">${p.views||0} views · ${p.sold_count||p.soldCount||0} sold · ${_fmt(p.price)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;align-items:flex-end;margin-left:8px">
            ${(p.approval_status==='rejected'||p.status==='rejected')?`<button class="sd-btn sd-btn-secondary" style="padding:5px 10px;font-size:11px" onclick="window._sellerResubmit('${p.id}')">✏️ Edit</button>`:''}
            ${['approved','active'].includes(p.status)||p.approval_status==='approved'?`<button class="sd-btn sd-btn-secondary" style="padding:5px 10px;font-size:11px" onclick="window._sellerArchive('${p.id}')">Archive</button>`:''}
            ${p.status==='archived'?`<button class="sd-btn sd-btn-secondary" style="padding:5px 10px;font-size:11px" onclick="window._sellerRestore('${p.id}')">Restore</button>`:''}
            <button class="sd-btn sd-btn-secondary" style="padding:5px 10px;font-size:11px" onclick="window._sellerDuplicate('${p.id}')">⧉ Copy</button>
        </div>
    </div>`;
}

window._sellerResubmit = async (id) => {
    const note = prompt('Describe what you changed (optional):') || '';
    const r = await _api('POST',`/marketplace/seller/products/${id}/resubmit`,{updates:{metadata:{resubmit_note:note}}});
    if (r&&!r._error) { _toast('Resubmitted for review!','success','✅'); window._jmNavMore('my-listings'); }
    else _toast(r?._error||'Failed — try again','error','❌');
};
window._sellerArchive = async (id) => {
    if (!confirm('Archive this product? It will be hidden from buyers.')) return;
    await _api('POST',`/marketplace/seller/products/${id}/archive`);
    _toast('Product archived','info','🗄️'); window._jmNavMore('my-listings');
};
window._sellerRestore = async (id) => {
    await _api('POST',`/marketplace/seller/products/${id}/restore`);
    _toast('Restored as Draft — submit for review to go live','info','📝'); window._jmNavMore('my-listings');
};
window._sellerDuplicate = async (id) => {
    const r = await _api('POST',`/marketplace/seller/products/${id}/duplicate`);
    if (r&&!r._error) { _toast('Duplicated as draft!','success','⧉'); window._jmNavMore('my-listings'); }
    else _toast(r?._error||'Failed','error','❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 3. INVENTORY
// ══════════════════════════════════════════════════════════════════════════════
async function renderInventory(container) {
    container.innerHTML = _shell('📊 Inventory', _loading());
    try {
        const r = await _api('GET','/marketplace/seller/inventory');
        const { items=[], low_stock=[], out_of_stock=[] } = r?.data || {};

        container.innerHTML = _shell('📊 Inventory', `
        ${out_of_stock.length?`<div style="background:#fee2e2;padding:12px 16px;font-size:13px;color:#991b1b;font-weight:600;display:flex;gap:8px;align-items:center">⚠️ ${out_of_stock.length} product${out_of_stock.length!==1?'s':''} out of stock!</div>`:''}
        ${low_stock.length?`<div style="background:#fef3c7;padding:12px 16px;font-size:13px;color:#92400e;font-weight:600;display:flex;gap:8px;align-items:center">🔔 ${low_stock.length} product${low_stock.length!==1?'s':''} running low on stock</div>`:''}
        ${r?._error?_errBox(r._error):''}
        <div class="sd-card">
            <div class="sd-card-title">Stock Levels
                <button class="sd-btn sd-btn-primary" style="padding:6px 12px;font-size:11px" onclick="window._bulkSaveInventory()">💾 Save All</button>
            </div>
            ${items.length ? `<div class="sd-table-wrap"><table class="sd-table">
                <thead><tr><th>Product</th><th>Status</th><th>Stock</th></tr></thead>
                <tbody>${items.map(p=>{
                    const qty=p.stockQuantity??p.stock??0;
                    const sc=qty===0?'sd-badge-rejected':qty<=5?'sd-badge-pending':'sd-badge-approved';
                    const sl=qty===0?'Out of Stock':qty<=5?'Low Stock':'In Stock';
                    const img=p.image||(Array.isArray(p.images)?p.images[0]:'')||'';
                    return `<tr><td><div style="display:flex;align-items:center;gap:8px">
                        ${img?`<img src="${_esc(img)}" style="width:32px;height:32px;border-radius:5px;object-fit:cover">`:`<div style="width:32px;height:32px;border-radius:5px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:14px">📦</div>`}
                        <div style="font-size:12px;font-weight:600;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(p.title||'')}</div>
                    </div></td>
                    <td><span class="sd-badge ${sc}" style="font-size:9px">${sl}</span></td>
                    <td><input class="sd-stock-input" type="number" min="0" value="${qty}" data-id="${p.id}" id="inv_${p.id}"></td></tr>`;
                }).join('')}</tbody>
            </table></div>` : `${_empty('📦','No products yet','Add products to manage their inventory here.','Create Product',"window._jmHideMore?.();setTimeout(()=>document.getElementById('createListingBtn')?.click(),100)")}`}
        </div>
        <div style="padding:0 16px 20px;display:flex;flex-direction:column;gap:8px">
            <button class="sd-btn sd-btn-secondary sd-btn-full" onclick="window._exportProductsCSV()">📥 Export CSV</button>
            <input type="file" id="invImportInput" accept=".csv" style="display:none" onchange="window._importProductsCSV(this)">
            <button class="sd-btn sd-btn-secondary sd-btn-full" onclick="document.getElementById('invImportInput').click()">📤 Import CSV</button>
        </div>
        `);
    } catch(ex) {
        container.innerHTML = _shell('📊 Inventory', _errBox(ex.message||'Unknown error'));
    }
}

window._bulkSaveInventory = async function() {
    const inputs = document.querySelectorAll('.sd-stock-input[data-id]');
    if (!inputs.length) { _toast('Nothing to save','info','ℹ️'); return; }
    const updates = Array.from(inputs).map(i=>({id:i.dataset.id,quantity:parseInt(i.value)||0}));
    const r = await _api('PUT','/marketplace/seller/inventory/bulk',{updates});
    if (r&&!r._error) _toast(`Saved ${r.data?.updated||updates.length} items ✅`,'success','💾');
    else _toast(r?._error||'Save failed','error','❌');
};
window._exportProductsCSV = async function() {
    _toast('Preparing export…','info','📥');
    const r = await _api('GET','/marketplace/seller/products?limit=999');
    const prods = r?.data?.products || [];
    if (!prods.length) { _toast('No products to export','warning','📭'); return; }
    const csv = 'id,title,price,category,status,approval_status,stock\n' + prods.map(p=>`${p.id},"${(p.title||'').replace(/"/g,'""')}",${p.price||0},${p.category||''},${p.status||''},${p.approval_status||''},${p.stock_quantity||0}`).join('\n');
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    const a = document.createElement('a'); a.href=url; a.download=`products-${Date.now()}.csv`; a.click();
};
window._importProductsCSV = async function(input) {
    const file = input.files[0]; if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(Boolean);
    const headers = lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
    const rows = lines.slice(1).map(l=>{ const vals=l.split(',').map(v=>v.trim().replace(/^"|"$/g,'')); return Object.fromEntries(headers.map((h,i)=>[h,vals[i]||''])); });
    const r = await _api('POST','/marketplace/seller/products/import',{rows});
    if (r&&!r._error) _toast(`${r.data?.imported||0} products queued for review`,'success','📤');
    else _toast(r?._error||'Import failed','error','❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 4. SELLER ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════
async function renderSellerAnalytics(container) {
    container.innerHTML = _shell('📈 Analytics', _loading());
    try {
        const [r7,r30] = await Promise.all([
            _api('GET','/marketplace/seller/analytics?period=7d'),
            _api('GET','/marketplace/seller/analytics?period=30d'),
        ]);
        const d7  = r7?.data  || {};
        const d30 = r30?.data || {};
        const byDay = d7.revenue?.by_day || [];
        const maxR  = Math.max(...byDay.map(d=>d.revenue||0), 1);
        const topP  = d30.top_products || [];

        container.innerHTML = _shell('📈 Analytics', `
        ${(r7?._error||r30?._error) ? _errBox(r7?._error||r30?._error) : ''}
        <div class="sd-metrics">
            <div class="sd-metric hi">
                <div class="sd-metric-l">Revenue (30d)</div>
                <div class="sd-metric-v">${_fmt(d30.revenue?.total||0)}</div>
                <div class="sd-metric-s">${d30.orders?.total||0} orders</div>
            </div>
            <div class="sd-metric hi">
                <div class="sd-metric-l">Total Views</div>
                <div class="sd-metric-v">${(d30.products?.total_views||0).toLocaleString()}</div>
                <div class="sd-metric-s">Across all products</div>
            </div>
            <div class="sd-metric">
                <div class="sd-metric-l">Conversion</div>
                <div class="sd-metric-v">${d30.conversion_rate||0}%</div>
                <div class="sd-metric-s">Views → Sales</div>
            </div>
            <div class="sd-metric">
                <div class="sd-metric-l">Units Sold</div>
                <div class="sd-metric-v">${d30.products?.total_sold||0}</div>
                <div class="sd-metric-s">${d30.orders?.completed||0} completed</div>
            </div>
        </div>
        ${byDay.length?`<div class="sd-card">
            <div class="sd-card-title">Revenue — Last 7 Days</div>
            <div class="sd-chart">${byDay.map(d=>`<div class="sd-bar" style="height:${Math.max(4,Math.round((d.revenue/maxR)*100))}%" data-v="${_fmt(d.revenue)}"></div>`).join('')}</div>
            <div class="sd-chart-labels">${byDay.map(d=>`<div class="sd-chart-label">${d.date?.slice(5)||''}</div>`).join('')}</div>
        </div>`:''}
        <div class="sd-card">
            <div class="sd-card-title">Order Breakdown (30d)</div>
            ${[['✅ Completed',d30.orders?.completed||0,'#22c55e'],['⏳ Pending',d30.orders?.pending||0,'#f59e0b'],['❌ Cancelled',d30.orders?.cancelled||0,'#ef4444']].map(([l,c,col])=>`
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f9fafb">
                <div style="width:10px;height:10px;border-radius:50%;background:${col};flex-shrink:0"></div>
                <div style="flex:1;font-size:13px;font-weight:600">${l}</div>
                <div style="font-size:15px;font-weight:800">${c}</div>
            </div>`).join('')}
        </div>
        ${topP.length?`<div class="sd-card">
            <div class="sd-card-title">🏆 Top Products (30d)</div>
            ${topP.map((p,i)=>`<div class="sd-prod-row">
                <div style="width:28px;height:28px;border-radius:50%;background:${i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'#f3f4f6'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;flex-shrink:0">${i+1}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(p.title||'')}</div>
                    <div style="font-size:11px;color:#9ca3af">${p.sold||0} sold · ${(p.views||0).toLocaleString()} views · ⭐ ${parseFloat(p.rating||0).toFixed(1)}</div>
                </div>
                <div style="font-size:13px;font-weight:800;color:#f57224;flex-shrink:0">${_fmt(p.revenue||0)}</div>
            </div>`).join('')}
        </div>`:`<div class="sd-card">${_empty('📊','No sales data yet','Start selling to see your top performing products here!')}</div>`}
        `);
    } catch(ex) {
        container.innerHTML = _shell('📈 Analytics', _errBox(ex.message||'Unknown error'));
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. PAYOUTS
// ══════════════════════════════════════════════════════════════════════════════
async function renderPayouts(container) {
    container.innerHTML = _shell('💰 Payouts', _loading());
    try {
        const r = await _api('GET','/marketplace/seller/payout');
        const d = r?.data || {};
        const available = parseFloat(d.available||0);
        const history   = d.payout_history || [];

        container.innerHTML = _shell('💰 Payouts', `
        ${r?._error ? _errBox(r._error) : ''}
        <div class="sd-payout-banner">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;opacity:.75;margin-bottom:4px">Available to Withdraw</div>
            <div style="font-size:36px;font-weight:900;letter-spacing:-1px;margin:6px 0 4px">${_fmt(available)}</div>
            <div style="font-size:12px;opacity:.75;margin-bottom:16px">${_fmt(d.pending_payout||0)} pending payout · ${_fmt(d.total_earned||0)} total earned</div>
            <button style="background:rgba(255,255,255,.2);border:none;border-radius:10px;padding:10px 20px;color:#fff;font-weight:800;font-size:13px;cursor:pointer" onclick="window._requestPayoutModal()">💸 Request Payout</button>
        </div>
        <div class="sd-metrics" style="padding-top:12px">
            <div class="sd-metric"><div class="sd-metric-l">Gross Sales</div><div class="sd-metric-v">${_fmt(d.gross_sales||0)}</div></div>
            <div class="sd-metric"><div class="sd-metric-l">Platform Fee (10%)</div><div class="sd-metric-v">${_fmt(d.platform_fee||0)}</div></div>
            <div class="sd-metric"><div class="sd-metric-l">Net Earnings</div><div class="sd-metric-v">${_fmt(d.total_earned||0)}</div></div>
            <div class="sd-metric"><div class="sd-metric-l">Total Withdrawn</div><div class="sd-metric-v">${_fmt(d.total_withdrawn||0)}</div></div>
        </div>
        <div class="sd-card">
            <div class="sd-card-title">Payout History</div>
            ${history.length ? history.slice(0,20).map(p=>`<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f9fafb">
                <div style="width:36px;height:36px;border-radius:50%;background:${p.status==='completed'?'#d1fae5':'#fef3c7'};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${p.status==='completed'?'✅':'⏳'}</div>
                <div style="flex:1"><div style="font-size:13px;font-weight:700">${_fmt(p.amount||0)} via ${_esc((p.method||'mpesa').toUpperCase())}</div><div style="font-size:11px;color:#9ca3af">${_date(p.requested_at)}</div></div>
                <span class="sd-badge ${p.status==='completed'?'sd-badge-approved':'sd-badge-pending'}">${p.status||'pending'}</span>
            </div>`).join('') : _empty('💰','No payouts yet','Request your first payout once you have sales earnings!')}
        </div>
        `);
    } catch(ex) {
        container.innerHTML = _shell('💰 Payouts', _errBox(ex.message||'Unknown error'));
    }
}

window._requestPayoutModal = function() {
    document.getElementById('payoutModal')?.remove();
    const ov = document.createElement('div'); ov.id='payoutModal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99000;display:flex;align-items:flex-end;justify-content:center';
    ov.innerHTML=`<div style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px">
        <div style="font-weight:800;font-size:16px;margin-bottom:14px">💸 Request Payout</div>
        <label class="sd-form-label">Amount (KES) *</label>
        <input id="payAmt" type="number" class="sd-form-input" placeholder="Min KES 100" min="100">
        <label class="sd-form-label">M-Pesa Number *</label>
        <input id="payPhone" type="tel" class="sd-form-input" placeholder="0712 345 678">
        <div style="display:flex;gap:8px;margin-top:6px">
            <button class="sd-btn sd-btn-primary sd-btn-full" onclick="window._submitPayout()">Submit Request</button>
            <button class="sd-btn sd-btn-secondary sd-btn-full" onclick="document.getElementById('payoutModal')?.remove()">Cancel</button>
        </div>
    </div>`;
    document.body.appendChild(ov);
};
window._submitPayout = async function() {
    const amount = parseFloat(document.getElementById('payAmt')?.value||0);
    const phone  = document.getElementById('payPhone')?.value?.trim();
    if (!amount||amount<100) { _toast('Minimum payout is KES 100','error','⚠️'); return; }
    if (!phone) { _toast('Enter your M-Pesa number','error','⚠️'); return; }
    document.getElementById('payoutModal')?.remove();
    const r = await _api('POST','/marketplace/seller/payout/request',{amount,method:'mpesa',account:phone});
    if (r&&!r._error) { _toast('Payout request submitted! Processing in 1–3 business days.','success','💸'); window._jmNavMore('seller-payouts'); }
    else _toast(r?._error||'Failed','error','❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 6. SHIPPING / ORDERS
// ══════════════════════════════════════════════════════════════════════════════
async function renderShipping(container) {
    container.innerHTML = _shell('🚚 Orders & Shipping', _loading());
    try {
        const r = await _api('GET','/marketplace/seller-dashboard/orders');
        const all = r?.data?.orders || r?.orders || [];
        const active = all.filter(o=>!['delivered','cancelled','refunded'].includes(o.status));
        const done   = all.filter(o=>['delivered','refunded'].includes(o.status));

        const _orderCard = (o) => {
            const items = o.metadata?.items||o.items||[];
            const sColors = {pending:'#f59e0b',confirmed:'#3b82f6',shipped:'#f97316',out_for_delivery:'#ec4899',delivered:'#22c55e',cancelled:'#ef4444'};
            const sc = sColors[o.status]||'#9ca3af';
            return `<div class="sd-order-row" style="margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
                    <div>
                        <div style="font-size:13px;font-weight:800;color:#111">#${String(o.id||'').slice(-8)}</div>
                        <div style="font-size:11px;color:#6b7280;margin-top:2px">${items.length} item${items.length!==1?'s':''} · ${_date(o.createdAt||o.created_at)}</div>
                        <div style="font-size:11px;color:#374151;margin-top:2px">📍 ${_esc(o.deliveryAddress?.city||o.delivery_address?.city||'—')}</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:15px;font-weight:900;color:#f57224">${_fmt(o.totalPrice||o.total_price||0)}</div>
                        <span style="color:${sc};font-size:11px;font-weight:700;text-transform:capitalize">${o.status}</span>
                    </div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${o.status==='pending'||o.status==='confirmed'?`<button class="sd-btn sd-btn-secondary" style="padding:6px 12px;font-size:11px" onclick="window._shipUpdate('${o.id}','packed')">📦 Packed</button>`:''}
                    ${['pending','confirmed','packed'].includes(o.status)?`<button class="sd-btn sd-btn-primary" style="padding:6px 12px;font-size:11px" onclick="window._shipModal('${o.id}')">🚚 Ship</button>`:''}
                    ${o.status==='shipped'?`<button class="sd-btn sd-btn-secondary" style="padding:6px 12px;font-size:11px" onclick="window._shipUpdate('${o.id}','out_for_delivery')">🏍️ Out for Delivery</button>`:''}
                    ${o.status==='out_for_delivery'?`<button class="sd-btn sd-btn-success" style="padding:6px 12px;font-size:11px" onclick="window._shipUpdate('${o.id}','delivered')">✅ Delivered</button>`:''}
                    <button class="sd-btn sd-btn-secondary" style="padding:6px 12px;font-size:11px" onclick="window._viewLabel('${o.id}')">🖨️ Label</button>
                </div>
            </div>`;
        };

        container.innerHTML = _shell('🚚 Orders & Shipping', `
        ${r?._error ? _errBox(r._error) : ''}
        <div style="background:#f0fdf4;padding:10px 16px;font-size:12px;color:#166534;font-weight:600">
            💡 Update order status to notify buyers automatically via SMS + push notification
        </div>
        <div class="sd-card">
            <div class="sd-card-title">Active Orders (${active.length})</div>
            ${active.length ? active.map(_orderCard).join('') : _empty('✅','All orders fulfilled!','Great job! No pending orders right now.')}
        </div>
        ${done.length?`<div class="sd-card">
            <div class="sd-card-title">Completed Orders (${done.length})</div>
            ${done.slice(0,10).map(o=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f9fafb">
                <div><div style="font-size:13px;font-weight:700">#${String(o.id||'').slice(-8)}</div><div style="font-size:11px;color:#9ca3af">${_date(o.deliveredAt||o.createdAt)}</div></div>
                <div style="text-align:right"><div style="font-size:13px;font-weight:800;color:#f57224">${_fmt(o.totalPrice||0)}</div><span style="color:#22c55e;font-size:11px;font-weight:700">${o.status}</span></div>
            </div>`).join('')}
        </div>`:''}
        `);
    } catch(ex) {
        container.innerHTML = _shell('🚚 Orders & Shipping', _errBox(ex.message||'Unknown error'));
    }
}

window._shipUpdate = async (id,status) => {
    const r = await _api('PUT',`/marketplace/seller/orders/${id}/shipping`,{status});
    if (r&&!r._error) { _toast(`Order marked as ${status.replace(/_/g,' ')} ✅`,'success','✅'); window._jmNavMore('seller-shipping'); }
    else _toast(r?._error||'Update failed','error','❌');
};
window._shipModal = (id) => {
    const tracking = prompt('Tracking number (optional):') || '';
    const courier  = prompt('Courier name (e.g. G4S, DHL, Sendy):') || 'Standard';
    _api('PUT',`/marketplace/seller/orders/${id}/shipping`,{status:'shipped',tracking_number:tracking,courier}).then(r=>{
        if (r&&!r._error) { _toast('Order shipped! Buyer notified. 🚚','success','🚚'); window._jmNavMore('seller-shipping'); }
        else _toast(r?._error||'Failed','error','❌');
    });
};
window._viewLabel = async (id) => {
    const r = await _api('GET',`/marketplace/seller/orders/${id}/shipping-label`);
    const label = r?.data?.label;
    if (!label) { _toast('Label not available yet','warning','🖨️'); return; }
    const w = window.open('','_blank','width=420,height=560');
    w?.document.write(`<!DOCTYPE html><html><head><title>Shipping Label</title><style>body{font-family:Arial,sans-serif;padding:24px;max-width:400px;margin:0 auto;border:2px dashed #ccc}h2{font-size:18px;margin:0 0 12px}p{margin:4px 0;font-size:14px}hr{border:1px dashed #ccc;margin:12px 0}.big{font-size:18px;font-weight:900}</style></head><body>
    <h2>📦 Knecta Market — Shipping Label</h2><hr>
    <p><b>Order:</b> #${String(label.order_id||'').slice(-8)}</p>
    <p><b>Tracking:</b> <span class="big">${_esc(label.tracking_number||'PENDING')}</span></p>
    <p><b>Courier:</b> ${_esc(label.courier||'Standard')}</p><hr>
    <p style="font-size:11px">TO:</p>
    <p class="big">${_esc(label.to?.name||'Customer')}</p>
    <p>${_esc(label.to?.address||'')}${label.to?.city?', '+_esc(label.to.city):''}</p>
    <p>${_esc(label.to?.phone||'')}</p><hr>
    <p><b>Items:</b></p>${(label.items||[]).map(i=>`<p>• ${_esc(i.title)} × ${i.quantity}</p>`).join('')}
    <hr><p style="text-align:center;font-size:10px">Knecta Market · ${new Date().toLocaleDateString()}</p>
    <script>window.print();<\/script></body></html>`);
};

// ══════════════════════════════════════════════════════════════════════════════
// 7. RETURNS
// ══════════════════════════════════════════════════════════════════════════════
async function renderReturns(container) {
    container.innerHTML = _shell('↩️ Returns & Refunds', _loading());
    try {
        const r = await _api('GET','/marketplace/seller/returns');
        const returns = r?.data?.returns || [];

        container.innerHTML = _shell('↩️ Returns & Refunds', `
        ${r?._error ? _errBox(r._error) : ''}
        <div class="sd-card">
            <div class="sd-card-title">Return Requests (${returns.length})</div>
            ${returns.length ? returns.map(ret=>`<div style="background:#f9fafb;border-radius:12px;padding:14px;margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
                    <div>
                        <div style="font-size:13px;font-weight:800">Order #${String(ret.order_id||'').slice(-8)}</div>
                        <div style="font-size:12px;color:#6b7280;margin-top:2px">Requested: ${_date(ret.requested_at)}</div>
                    </div>
                    <span class="sd-badge ${ret.status==='pending'?'sd-badge-pending':ret.status==='approved'?'sd-badge-approved':'sd-badge-rejected'}">${ret.status}</span>
                </div>
                <div style="font-size:12px;color:#374151;margin-bottom:4px"><b>Reason:</b> ${_esc(ret.reason||'Not specified')}</div>
                <div style="font-size:14px;font-weight:800;color:#f57224;margin-bottom:10px">${_fmt(ret.total)}</div>
                ${ret.status==='pending'?`<div style="display:flex;gap:8px">
                    <button class="sd-btn sd-btn-success" style="flex:1" onclick="window._approveReturn('${ret.order_id}')">✅ Approve</button>
                    <button class="sd-btn sd-btn-danger" style="flex:1" onclick="window._rejectReturn('${ret.order_id}')">❌ Reject</button>
                </div>`:''}
            </div>`).join('') : _empty('🎉','No return requests','All your orders are going smoothly!')}
        </div>
        `);
    } catch(ex) {
        container.innerHTML = _shell('↩️ Returns & Refunds', _errBox(ex.message||'Unknown error'));
    }
}
window._approveReturn = async (id) => {
    if (!confirm('Approve this return? The buyer will receive a refund.')) return;
    const r = await _api('POST',`/marketplace/seller/returns/${id}/approve`);
    if (r&&!r._error) { _toast('Return approved. Refund processed ✅','success','✅'); window._jmNavMore('seller-returns'); }
    else _toast(r?._error||'Failed','error','❌');
};
window._rejectReturn = async (id) => {
    const reason = prompt('Reason for rejection:') || 'Does not meet return policy';
    const r = await _api('POST',`/marketplace/seller/returns/${id}/reject`,{reason});
    if (r&&!r._error) { _toast('Return rejected','info','❌'); window._jmNavMore('seller-returns'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 8. VERIFICATION
// ══════════════════════════════════════════════════════════════════════════════
async function renderVerification(container) {
    container.innerHTML = _shell('🛡️ Seller Verification', _loading());
    try {
        const r = await _api('GET','/marketplace/seller/verification');
        const { status='unverified', kyc=null } = r?.data || {};

        const statusBoxes = {
            approved:`<div class="sd-kyc-box approved">✅ <strong>Verified Seller</strong> — Your account is fully verified with full access.</div>`,
            pending: `<div class="sd-kyc-box pending">⏳ <strong>Under Review</strong> — Submitted ${_date(kyc?.submitted_at)}. Takes 1–2 business days.</div>`,
            rejected:`<div class="sd-kyc-box" style="background:#fee2e2;color:#991b1b;">❌ <strong>Rejected</strong> — ${_esc(kyc?.review_reason||'Please resubmit with correct documents.')}</div>`,
            unverified:`<div class="sd-kyc-box unverified">ℹ️ Submit KYC documents to unlock higher limits and get a verified badge.</div>`,
        };

        container.innerHTML = _shell('🛡️ Seller Verification', `
        ${r?._error ? _errBox(r._error) : ''}
        <div style="padding:16px">
        ${statusBoxes[status]||statusBoxes.unverified}
        ${status!=='approved'?`<div class="sd-card">
            <div class="sd-card-title">Submit Documents</div>
            <label class="sd-form-label">ID Type *</label>
            <select id="kycType" class="sd-form-select">
                <option value="">Select…</option>
                <option value="national_id">National ID</option>
                <option value="passport">Passport</option>
                <option value="driving_license">Driving License</option>
            </select>
            <label class="sd-form-label">ID Number *</label>
            <input id="kycNum" type="text" class="sd-form-input" placeholder="Enter your ID number">
            <label class="sd-form-label">Business Name (Optional)</label>
            <input id="kycBiz" type="text" class="sd-form-input" placeholder="Your business or company name">
            <button class="sd-btn sd-btn-primary sd-btn-full" onclick="window._submitKYC()">Submit for Verification</button>
        </div>`:''}
        <div class="sd-card">
            <div class="sd-card-title">Benefits of Verification</div>
            ${['Higher payout limits (up to KES 100,000)','✓ Verified badge on all listings','Access to flash sale promotions','Priority customer support','Reduced platform fees (8% vs 10%)','Higher search ranking for products'].map(b=>`<div style="display:flex;gap:10px;padding:7px 0;font-size:13px;color:#374151;border-bottom:1px solid #f9fafb"><span style="color:#22c55e;font-weight:700;flex-shrink:0">✓</span>${b}</div>`).join('')}
        </div>
        </div>
        `);
    } catch(ex) {
        container.innerHTML = _shell('🛡️ Seller Verification', _errBox(ex.message||'Unknown error'));
    }
}
window._submitKYC = async () => {
    const type=document.getElementById('kycType')?.value, num=document.getElementById('kycNum')?.value?.trim(), biz=document.getElementById('kycBiz')?.value?.trim();
    if (!type||!num) { _toast('ID type and number are required','error','⚠️'); return; }
    const r = await _api('POST','/marketplace/seller/verification',{id_type:type,id_number:num,business_name:biz||''});
    if (r&&!r._error) { _toast('Submitted! We review within 1–2 business days.','success','🛡️'); window._jmNavMore('seller-verification'); }
    else _toast(r?._error||'Failed','error','❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 9. SUBSCRIPTION
// ══════════════════════════════════════════════════════════════════════════════
async function renderSubscription(container) {
    container.innerHTML = _shell('📋 Subscription', _loading());
    try {
        const r = await _api('GET','/marketplace/seller/subscription');
        const { plan='basic', expires_at=null, plans=[] } = r?.data || {};
        const displayPlans = plans.length ? plans : [
            { id:'basic',        name:'Basic',        price:0,    listing_limit:10,  features:['10 active listings','Basic analytics','Standard support'] },
            { id:'professional', name:'Professional', price:500,  listing_limit:100, features:['100 listings','Full analytics','Priority support','Boost 5/month','CSV tools'], recommended:true },
            { id:'premium',      name:'Premium',      price:1500, listing_limit:9999,features:['Unlimited listings','Advanced analytics','VIP support','Unlimited boosts','Featured placement','Flash sale access'] },
        ];
        container.innerHTML = _shell('📋 Subscription', `
        ${r?._error ? _errBox(r._error) : ''}
        <div style="background:#d1fae5;border-radius:12px;margin:12px 16px 0;padding:12px 16px;font-size:13px;color:#065f46;font-weight:700">
            Current plan: <strong>${(plan||'basic').toUpperCase()}</strong>${expires_at?` · Renews ${_date(expires_at)}`:''}
        </div>
        <div style="padding:12px 16px 0">
        ${displayPlans.map(p=>`<div class="sd-plan-card ${p.id===plan?'current':''}" style="${p.recommended?'border-color:#8b5cf6;background:#faf5ff':''}">
            ${p.recommended?`<div style="font-size:10px;font-weight:800;color:#8b5cf6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">⭐ Most Popular</div>`:''}
            ${p.id===plan?`<div style="font-size:10px;font-weight:800;color:#f57224;text-transform:uppercase;margin-bottom:6px">✓ Current Plan</div>`:''}
            <div style="font-size:20px;font-weight:900;margin-bottom:4px">${p.name}</div>
            <div style="font-size:26px;font-weight:900;color:#f57224">${p.price===0?'Free':'KES '+p.price.toLocaleString()}<span style="font-size:13px;font-weight:400;color:#9ca3af">/mo</span></div>
            <div style="font-size:12px;color:#6b7280;margin:6px 0 12px">${p.listing_limit===9999?'Unlimited':p.listing_limit} listings</div>
            ${p.features.map(f=>`<div style="display:flex;gap:8px;font-size:13px;padding:4px 0;color:#374151"><span style="color:#22c55e">✓</span>${f}</div>`).join('')}
            ${p.id!==plan?`<button class="sd-btn sd-btn-primary sd-btn-full" style="margin-top:14px" onclick="window._upgradePlan('${p.id}')">${p.price===0?'Downgrade':'Upgrade to '+p.name}</button>`:'<div style="margin-top:12px;text-align:center;font-size:12px;color:#22c55e;font-weight:700">✓ Active</div>'}
        </div>`).join('')}
        </div>`);
    } catch(ex) {
        container.innerHTML = _shell('📋 Subscription', _errBox(ex.message||'Unknown error'));
    }
}
window._upgradePlan = async (plan) => {
    const r = await _api('POST','/marketplace/seller/subscription/upgrade',{plan});
    if (r&&!r._error) { _toast(`Upgraded to ${plan}! 🎉`,'success','📋'); window._jmNavMore('seller-subscription'); }
    else _toast(r?._error||'Failed','error','❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 10. ADMIN APPROVAL PANEL (within seller module)
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminApproval(container) {
    container.innerHTML = _shell('✅ Product Approval', _loading());
    try {
        const r = await _api('GET','/marketplace/admin/products/pending');
        const products = r?.data?.products || [];

        container.innerHTML = _shell('✅ Product Approval', `
        <div style="background:#fef3c7;padding:10px 16px;font-size:12px;color:#92400e;font-weight:600">
            ${products.length} product${products.length!==1?'s':''} waiting for your review
        </div>
        ${r?._error ? _errBox(r._error) : ''}
        <div style="padding:12px 16px">
        ${products.length ? products.map(p=>{
            const img = p.image||(Array.isArray(p.images)?p.images[0]:'')||'';
            return `<div style="background:#fff;border-radius:14px;margin-bottom:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
                ${img?`<img src="${_esc(img)}" style="width:100%;height:160px;object-fit:cover;background:#f3f4f6">`:`<div style="width:100%;height:120px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:48px">📦</div>`}
                <div style="padding:14px">
                    <div style="font-weight:800;font-size:15px;margin-bottom:3px">${_esc(p.title||'Untitled')}</div>
                    <div style="font-size:12px;color:#6b7280;margin-bottom:6px">${_fmt(p.price)} · ${_esc(p.category||'')} · ${_date(p.submitted_at||p.created_at)}</div>
                    ${p.description?`<div style="font-size:12px;color:#374151;line-height:1.5;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${_esc(p.description)}</div>`:''}
                    ${(p.metadata?.materials||[]).length?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${p.metadata.materials.map(m=>`<span style="background:#f3f4f6;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:600">${_esc(m)}</span>`).join('')}</div>`:''}
                    <div style="display:flex;gap:8px">
                        <button class="sd-btn sd-btn-success" style="flex:1;padding:10px" onclick="window._admApprove('${p.id}')">✅ Approve</button>
                        <button class="sd-btn sd-btn-danger" style="flex:1;padding:10px" onclick="window._admRejectModal('${p.id}','${_esc((p.title||'').replace(/'/g,"\\'"))}')">❌ Reject</button>
                    </div>
                </div>
            </div>`;
        }).join('') : _empty('✅','All caught up!','No products pending review right now. Check back later.')}
        </div>
        `);
    } catch(ex) {
        container.innerHTML = _shell('✅ Product Approval', _errBox(ex.message||'Unknown error'));
    }
}

window._admApprove = async (id) => {
    const r = await _api('POST',`/marketplace/admin/products/${id}/approve`);
    if (r&&!r._error) { _toast('Product approved and live! 🎉','success','✅'); window._jmNavMore('admin-approval'); }
    else _toast(r?._error||'Failed','error','❌');
};
window._admRejectModal = function(id, title) {
    document.getElementById('admRejectMod')?.remove();
    const ov = document.createElement('div'); ov.id='admRejectMod';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99000;display:flex;align-items:flex-end;justify-content:center';
    ov.innerHTML=`<div style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px">
        <div style="font-weight:800;font-size:16px;margin-bottom:10px">❌ Reject: ${_esc(title)}</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:10px">Give the seller a clear, actionable reason:</div>
        <textarea id="admRejectReas" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:12px;font-size:14px;box-sizing:border-box;resize:none;height:90px;outline:none" placeholder="e.g. Images are too blurry. Please upload clear, well-lit product photos against a white background."></textarea>
        <div style="display:flex;gap:8px;margin-top:10px">
            <button class="sd-btn sd-btn-danger sd-btn-full" onclick="window._admReject('${id}')">Confirm Rejection</button>
            <button class="sd-btn sd-btn-secondary sd-btn-full" onclick="document.getElementById('admRejectMod')?.remove()">Cancel</button>
        </div>
    </div>`;
    document.body.appendChild(ov);
};
window._admReject = async (id) => {
    const reason = document.getElementById('admRejectReas')?.value?.trim() || 'Does not meet marketplace standards';
    document.getElementById('admRejectMod')?.remove();
    const r = await _api('POST',`/marketplace/admin/products/${id}/reject`,{reason});
    if (r&&!r._error) { _toast('Product rejected. Seller notified.','info','❌'); window._jmNavMore('admin-approval'); }
    else _toast(r?._error||'Failed','error','❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// NAVIGATION ROUTING
// ══════════════════════════════════════════════════════════════════════════════
const SELLER_ROUTES = {
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

function _getOrCreatePage(pageId) {
    let el = document.getElementById(pageId);
    if (!el) {
        el = document.createElement('div');
        el.id = pageId;
        el.className = 'jm-page';
        const sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar') || document.querySelector('.app-container') || document.body;
        sidebar.appendChild(el);
    }
    return el;
}

const _prevNavMore = window._jmNavMore;
window._jmNavMore = function(page) {
    const renderFn = SELLER_ROUTES[page];
    if (renderFn) {
        document.querySelectorAll('.jm-page').forEach(p => p.classList.remove('active'));
        window._jmHideMore?.();
        const el = _getOrCreatePage('sdPage_' + page.replace(/-/g,'_'));
        el.classList.add('active');
        el.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#f3f4f6';
        // Show loading immediately
        el.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#9ca3af;background:#f3f4f6"><div style="font-size:32px">⏳</div><div style="font-size:14px;font-weight:600">Loading…</div></div>`;
        // Run with error boundary
        Promise.resolve(renderFn(el)).catch(err => {
            console.error('[Seller]', page, err);
            el.innerHTML = _shell(page, `<div style="margin:16px;background:#fee2e2;border-radius:14px;padding:18px;text-align:center"><div style="font-size:32px;margin-bottom:10px">⚠️</div><div style="font-weight:800;font-size:15px;color:#991b1b;margin-bottom:6px">Something went wrong</div><div style="font-size:13px;color:#b91c1c;margin-bottom:14px">${_esc(err?.message||'Unknown error')}</div><button class="sd-btn sd-btn-primary" onclick="window._jmNavMore('${page}')">🔄 Retry</button></div>`);
        });
        return;
    }
    _prevNavMore?.call(this, page);
};

// ══════════════════════════════════════════════════════════════════════════════
// PHYSICAL PRODUCT TAB — hook tab switching
// ══════════════════════════════════════════════════════════════════════════════
(function _hookPhysTab() {
    const tryHook = () => {
        const tabs = document.querySelectorAll('.create-listing-tab');
        if (!tabs.length) { setTimeout(tryHook, 600); return; }
        tabs.forEach(tab => {
            const orig = tab.onclick;
            tab.onclick = function(e) {
                orig?.call(this, e);
                const tabId = this.dataset?.tab;
                if (tabId === 'physical') {
                    const physTab = document.getElementById('physicalTab');
                    if (physTab) physTab.style.display = 'block';
                }
            };
        });
    };
    setTimeout(tryHook, 800);
})();

console.log('[marketplace-seller.js v2] ✅ Seller module loaded with full error handling');
})();
