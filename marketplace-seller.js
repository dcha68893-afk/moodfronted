/**
 * marketplace-seller.js — COMPLETE SELLER MODULE v1.0
 * ═════════════════════════════════════════════════════
 * Implements full seller experience inside existing Tool module:
 *  1. Seller Dashboard (revenue, orders, listings overview)
 *  2. My Listings (with approval status badges + actions)
 *  3. Physical Product Tab (category materials, variants, specs, preview)
 *  4. Inventory Management (stock table, bulk update, alerts)
 *  5. Seller Analytics (charts, top products, conversion)
 *  6. Payout System (balance, request withdrawal, history)
 *  7. Shipping Management (update status, courier, tracking, label)
 *  8. Returns Management (approve/reject returns)
 *  9. Seller Verification (KYC form)
 * 10. Subscription Plans (Basic/Professional/Premium)
 * 11. Admin Approval Panel (approve/reject pending products)
 *
 * Hooks into existing _jmNavMore routing.
 * Loads after marketplace-checkout.js and marketplace-advanced.js.
 * ═════════════════════════════════════════════════════
 */

(function _SellerModule() {
'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────
const _esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _fmt  = n  => 'KES ' + parseFloat(n||0).toLocaleString('en-KE',{minimumFractionDigits:0,maximumFractionDigits:0});
const _date = d  => d ? new Date(d).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}) : '—';
const _ls   = { save:(k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v))}catch(_){} }, load:(k,d=null)=>{ try{const r=localStorage.getItem(k);return r?JSON.parse(r):d}catch(_){return d} } };

function _toast(msg, type='info', icon='ℹ️') {
    if (typeof window._jmToast === 'function') { window._jmToast(msg,type,icon); return; }
    const colors = {success:'#22c55e',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
    let box = document.getElementById('sellerToastBox');
    if (!box) { box=document.createElement('div'); box.id='sellerToastBox'; box.style.cssText='position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;width:min(380px,90vw)'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.style.cssText = `background:${colors[type]||colors.info};color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;gap:10px`;
    t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    box.appendChild(t); setTimeout(()=>t.remove(), 3500);
}

async function _api(method, endpoint, body=null) {
    try {
        const token = window.__kynToken||window.__accessToken||localStorage.getItem('authToken')||localStorage.getItem('token')||localStorage.getItem('moodchat_token')||localStorage.getItem('accessToken')||'';
        const base  = (window.__kynAPI?.baseUrl||'').replace(/\/api$/,'').replace(/\/$/,'') || (typeof window.__getApiBase==='function'?window.__getApiBase().replace(/\/api$/,''):'') || 'http://localhost:4000';
        const res   = await fetch(base+'/api'+endpoint, { method:method.toUpperCase(), headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}, ...(body&&method!=='GET'?{body:JSON.stringify(body)}:{}) });
        if (!res.ok) { const e=await res.json().catch(()=>({message:'Error '+res.status})); return { _error: e.message||'Error', _status: res.status }; }
        return await res.json();
    } catch(e) { return null; }
}

// ─── Inject CSS ───────────────────────────────────────────────────────────────
(function _css() {
    if (document.getElementById('sellerModuleCSS')) return;
    const s = document.createElement('style'); s.id='sellerModuleCSS';
    s.textContent = `
    @keyframes sd-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes sd-spin{to{transform:rotate(360deg)}}

    /* ── Page wrapper ──────────────────────────────────────────────────── */
    .sd-page{padding:0;overflow-y:auto;-webkit-overflow-scrolling:touch;animation:sd-in .3s ease}
    .sd-header{background:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #f3f4f6;position:sticky;top:0;z-index:10}
    .sd-back{width:36px;height:36px;border-radius:50%;border:none;background:#f3f4f6;cursor:pointer;font-size:16px}
    .sd-title{font-weight:800;font-size:16px;flex:1}
    .sd-body{padding:0 0 80px}

    /* ── Metric cards ──────────────────────────────────────────────────── */
    .sd-metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 16px}
    .sd-metric{background:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .sd-metric-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;margin-bottom:4px}
    .sd-metric-val{font-size:24px;font-weight:900;color:#111;letter-spacing:-0.5px}
    .sd-metric-sub{font-size:11px;color:#6b7280;margin-top:3px}
    .sd-metric.accent{background:linear-gradient(135deg,#f57224,#ff4e16);color:#fff}
    .sd-metric.accent .sd-metric-label,.sd-metric.accent .sd-metric-sub{color:rgba(255,255,255,.75)}
    .sd-metric.accent .sd-metric-val{color:#fff}

    /* ── Section ───────────────────────────────────────────────────────── */
    .sd-section{background:#fff;border-radius:16px;margin:0 16px 12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .sd-section-title{font-weight:800;font-size:14px;color:#111;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between}
    .sd-see-all{font-size:12px;color:#f57224;font-weight:700;background:none;border:none;cursor:pointer;padding:0}

    /* ── Status badges ─────────────────────────────────────────────────── */
    .sd-badge{display:inline-flex;align-items:center;gap:4px;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
    .sd-badge.pending{background:#fef3c7;color:#92400e}
    .sd-badge.approved{background:#d1fae5;color:#065f46}
    .sd-badge.rejected{background:#fee2e2;color:#991b1b}
    .sd-badge.draft{background:#f3f4f6;color:#6b7280}
    .sd-badge.archived{background:#e0e7ff;color:#3730a3}
    .sd-badge.active{background:#d1fae5;color:#065f46}
    .sd-badge.inactive{background:#f3f4f6;color:#6b7280}
    .sd-badge.suspended{background:#fee2e2;color:#991b1b}

    /* ── Product list item ─────────────────────────────────────────────── */
    .sd-product-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f9fafb;cursor:pointer}
    .sd-product-row:last-child{border-bottom:none}
    .sd-product-img{width:54px;height:54px;border-radius:8px;object-fit:cover;background:#f3f4f6;flex-shrink:0}
    .sd-product-img-placeholder{width:54px;height:54px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
    .sd-product-title{font-size:13px;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:3px}
    .sd-product-meta{font-size:11px;color:#6b7280}
    .sd-product-price{font-size:14px;font-weight:800;color:#f57224;flex-shrink:0;text-align:right}

    /* ── Action buttons ────────────────────────────────────────────────── */
    .sd-btn{border:none;border-radius:10px;padding:11px 20px;font-weight:800;font-size:13px;cursor:pointer;transition:all .2s}
    .sd-btn-primary{background:#f57224;color:#fff}
    .sd-btn-primary:hover{background:#e0651f}
    .sd-btn-secondary{background:#f3f4f6;color:#374151}
    .sd-btn-secondary:hover{background:#e5e7eb}
    .sd-btn-danger{background:#fee2e2;color:#ef4444}
    .sd-btn-success{background:#d1fae5;color:#065f46}
    .sd-btn-full{width:100%;display:block;text-align:center;margin-top:10px}

    /* ── Inventory table ───────────────────────────────────────────────── */
    .sd-table{width:100%;border-collapse:collapse;font-size:13px}
    .sd-table th{text-align:left;padding:8px 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;border-bottom:2px solid #f3f4f6;background:#fafafa}
    .sd-table td{padding:10px;border-bottom:1px solid #f9fafb;vertical-align:middle}
    .sd-table tr:last-child td{border-bottom:none}
    .sd-stock-input{width:60px;border:1.5px solid #e5e7eb;border-radius:6px;padding:4px 6px;font-size:13px;text-align:center}
    .sd-stock-input:focus{outline:none;border-color:#f57224}

    /* ── Chart placeholder ─────────────────────────────────────────────── */
    .sd-chart-wrap{position:relative;height:140px;background:#f9fafb;border-radius:10px;overflow:hidden;margin-top:8px}
    .sd-chart-bars{display:flex;align-items:flex-end;gap:4px;height:100%;padding:12px 8px 8px;box-sizing:border-box}
    .sd-chart-bar{flex:1;border-radius:4px 4px 0 0;background:linear-gradient(180deg,#f57224,#ff4e16);min-height:4px;transition:height .5s ease;cursor:pointer;position:relative}
    .sd-chart-bar:hover::after{content:attr(data-val);position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:#111;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;white-space:nowrap}
    .sd-chart-labels{display:flex;gap:4px;padding:0 8px;margin-top:4px}
    .sd-chart-label{flex:1;text-align:center;font-size:9px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis}

    /* ── Order row ─────────────────────────────────────────────────────── */
    .sd-order-row{padding:12px 0;border-bottom:1px solid #f9fafb;cursor:pointer}
    .sd-order-row:last-child{border-bottom:none}
    .sd-order-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px}
    .sd-order-id{font-size:12px;font-weight:700;color:#374151}
    .sd-order-amount{font-size:14px;font-weight:900;color:#f57224}
    .sd-order-meta{font-size:11px;color:#9ca3af}

    /* ── Approval panel ────────────────────────────────────────────────── */
    .sd-approval-card{background:#fff;border-radius:14px;margin-bottom:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .sd-approval-img{width:100%;height:160px;object-fit:cover;background:#f3f4f6}
    .sd-approval-body{padding:14px 16px}
    .sd-approval-title{font-weight:800;font-size:15px;margin-bottom:4px}
    .sd-approval-meta{font-size:12px;color:#6b7280;margin-bottom:10px}
    .sd-approval-actions{display:flex;gap:8px}
    .sd-approve-btn{flex:1;background:#d1fae5;color:#065f46;border:none;border-radius:10px;padding:10px;font-weight:800;font-size:13px;cursor:pointer}
    .sd-reject-btn{flex:1;background:#fee2e2;color:#ef4444;border:none;border-radius:10px;padding:10px;font-weight:800;font-size:13px;cursor:pointer}

    /* ── Payout card ────────────────────────────────────────────────────── */
    .sd-payout-card{background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;border-radius:20px;padding:22px;margin:0 16px 12px}
    .sd-payout-balance{font-size:38px;font-weight:900;letter-spacing:-1px;margin:6px 0 4px}

    /* ── Variant row ────────────────────────────────────────────────────── */
    .sd-variant-row{display:flex;gap:6px;align-items:center;background:#f9fafb;border-radius:8px;padding:8px 10px;margin-bottom:6px}
    .sd-variant-row input{flex:1;border:1.5px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:13px;background:#fff}
    .sd-variant-row input:focus{outline:none;border-color:#f57224}
    .sd-spec-row{display:grid;grid-template-columns:1fr 1fr auto;gap:6px;margin-bottom:6px}
    .sd-spec-row input{border:1.5px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:13px;background:#fff}
    .sd-spec-row input:focus{outline:none;border-color:#f57224}

    /* ── Material chip ─────────────────────────────────────────────────── */
    .sd-material-chip{display:inline-flex;align-items:center;gap:6px;background:#f3f4f6;border:1.5px solid #e5e7eb;border-radius:20px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}
    .sd-material-chip.selected{background:#fff8f5;border-color:#f57224;color:#f57224}

    /* ── Preview overlay ───────────────────────────────────────────────── */
    .sd-preview-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99000;display:flex;flex-direction:column;overflow:hidden}
    .sd-preview-bar{background:#111;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0}
    .sd-preview-badge{background:#f59e0b;color:#111;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:800}
    .sd-preview-body{flex:1;overflow-y:auto;background:#f9fafb}

    /* ── KYC form ──────────────────────────────────────────────────────── */
    .sd-kyc-status{border-radius:12px;padding:14px 16px;margin-bottom:14px;font-size:13px}
    .sd-kyc-status.pending{background:#fef3c7;color:#92400e}
    .sd-kyc-status.approved{background:#d1fae5;color:#065f46}
    .sd-kyc-status.rejected{background:#fee2e2;color:#991b1b}

    /* ── Plan cards ────────────────────────────────────────────────────── */
    .sd-plan-card{border:2px solid #e5e7eb;border-radius:16px;padding:18px;margin-bottom:10px;transition:all .2s}
    .sd-plan-card.current{border-color:#f57224;background:#fff8f5}
    .sd-plan-card.recommended{border-color:#8b5cf6;background:#faf5ff}
    .sd-plan-name{font-weight:900;font-size:18px;margin-bottom:4px}
    .sd-plan-price{font-size:24px;font-weight:900;color:#f57224}
    .sd-plan-feature{display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 0;color:#374151}

    /* ── Rejection reason input ────────────────────────────────────────── */
    .sd-reject-reason{background:#fff;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:14px;width:100%;box-sizing:border-box;resize:none}
    `;
    document.head.appendChild(s);
})();

// ─── Category material definitions ───────────────────────────────────────────
const CATEGORY_MATERIALS = {
    furniture:     ['Wood','Mahogany','Oak','Pine','Bamboo','Metal','Plastic','Glass','Rattan','MDF'],
    fashion:       ['Cotton','Leather','Polyester','Silk','Wool','Denim','Linen','Nylon','Spandex','Velvet'],
    construction:  ['Steel','Aluminum','Cement','Ceramic','Marble','Granite','PVC','Glass','Copper'],
    electronics:   ['Aluminum','Plastic','Glass','Stainless Steel','Carbon Fiber','Rubber'],
    food:          ['Organic','Fresh','Frozen','Preserved','Certified Halal','Vegetarian','Vegan'],
    beauty:        ['Natural','Organic','Cruelty-free','Paraben-free','Vegan','Hypoallergenic'],
    sports:        ['Rubber','Foam','Nylon','Carbon Fiber','Aluminum','Polyester','Neoprene'],
    automotive:    ['Steel','Aluminum','Rubber','Plastic','Carbon Fiber','Leather'],
    toys:          ['Plastic','Wood','Fabric','Metal','Rubber','BPA-free'],
    books:         ['Paperback','Hardcover','Digital','Spiral-bound'],
};

// ─── Physical product tab logic ───────────────────────────────────────────────
const _physState = {
    images: [],        // Array of {url, file}
    variants: [],      // [{name, options}]
    specs: [],         // [{key, value}]
    materials: [],     // Array of selected material strings
};

window._physCategoryChanged = function(category) {
    const group = document.getElementById('physMaterialGroup');
    const container = document.getElementById('physMaterialOptions');
    const materials = CATEGORY_MATERIALS[category] || CATEGORY_MATERIALS[category?.split(' ')[0].toLowerCase()];
    if (!materials || !group || !container) return;
    group.style.display = 'block';
    _physState.materials = [];
    container.innerHTML = materials.map(m =>
        `<span class="sd-material-chip" onclick="window._physToggleMaterial(this,'${m}')">${m}</span>`
    ).join('');
};

window._physToggleMaterial = function(el, material) {
    el.classList.toggle('selected');
    if (el.classList.contains('selected')) { if (!_physState.materials.includes(material)) _physState.materials.push(material); }
    else { _physState.materials = _physState.materials.filter(m => m !== material); }
};

window._physCalcDiscount = function() {
    const price = parseFloat(document.getElementById('physPrice')?.value || 0);
    const orig  = parseFloat(document.getElementById('physOriginalPrice')?.value || 0);
    const label = document.getElementById('physDiscountLabel');
    if (!label) return;
    if (orig > price && orig > 0) {
        const pct = Math.round((1 - price/orig) * 100);
        label.textContent = `🏷️ ${pct}% discount from original price`;
        label.style.display = 'block';
    } else { label.style.display = 'none'; }
};

window._physAddImages = function(files) {
    const grid = document.getElementById('physImageGrid');
    if (!grid) return;
    Array.from(files).slice(0, 8 - _physState.images.length).forEach(file => {
        const url = URL.createObjectURL(file);
        _physState.images.push({ url, file });
        const div = document.createElement('div');
        div.style.cssText = 'position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#f3f4f6';
        const idx = _physState.images.length - 1;
        div.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover"><button onclick="window._physRemoveImage(${idx},this.parentElement)" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;border:none;cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center">✕</button>`;
        grid.appendChild(div);
    });
};

window._physRemoveImage = function(idx, el) {
    _physState.images.splice(idx, 1);
    el?.remove();
};

window._physAddVariant = function() {
    const container = document.getElementById('physVariantsContainer');
    if (!container) return;
    const idx = _physState.variants.length;
    _physState.variants.push({ name: '', options: '' });
    const row = document.createElement('div');
    row.className = 'sd-variant-row';
    row.innerHTML = `
        <input placeholder="Name (e.g., Color)" oninput="_physState.variants[${idx}].name=this.value">
        <input placeholder="Options (e.g., Red, Blue, Green)" oninput="_physState.variants[${idx}].options=this.value" style="flex:2">
        <button onclick="this.parentElement.remove();_physState.variants.splice(${idx},1)" style="background:#fee2e2;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;color:#ef4444;font-size:12px">✕</button>`;
    container.appendChild(row);
};

window._physAddSpec = function() {
    const container = document.getElementById('physSpecsContainer');
    if (!container) return;
    const idx = _physState.specs.length;
    _physState.specs.push({ key: '', value: '' });
    const row = document.createElement('div');
    row.className = 'sd-spec-row';
    row.innerHTML = `
        <input placeholder="Spec name (e.g., Weight)" oninput="_physState.specs[${idx}].key=this.value">
        <input placeholder="Value (e.g., 2.5 kg)" oninput="_physState.specs[${idx}].value=this.value">
        <button onclick="this.parentElement.remove();_physState.specs.splice(${idx},1)" style="background:#fee2e2;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;color:#ef4444;font-size:12px">✕</button>`;
    container.appendChild(row);
};

window._physPreview = function() {
    const title = document.getElementById('physTitle')?.value || 'Product Preview';
    const price = document.getElementById('physPrice')?.value || '0';
    const orig  = document.getElementById('physOriginalPrice')?.value || '';
    const desc  = document.getElementById('physDescription')?.value || '';
    const brand = document.getElementById('physBrand')?.value || '';
    const stock = document.getElementById('physStock')?.value || '0';
    const imgs  = _physState.images.slice(0, 5);
    const specs = _physState.specs.filter(s => s.key && s.value);
    const variants = _physState.variants.filter(v => v.name);
    const materials = _physState.materials;

    const ov = document.createElement('div'); ov.className='sd-preview-overlay';
    ov.innerHTML = `
    <div class="sd-preview-bar">
        <span class="sd-preview-badge">PREVIEW MODE</span>
        <span style="flex:1;font-size:13px;opacity:.75">This is how buyers see your product</span>
        <button onclick="this.closest('.sd-preview-overlay').remove()" style="background:rgba(255,255,255,.15);border:none;border-radius:8px;padding:6px 14px;color:#fff;font-size:13px;cursor:pointer">✕ Close</button>
    </div>
    <div class="sd-preview-body">
        <!-- Image gallery -->
        <div style="background:#fff;position:relative;aspect-ratio:1.2;max-height:320px;overflow:hidden">
            ${imgs.length ? `<img src="${imgs[0].url}" style="width:100%;height:100%;object-fit:cover">` : `<div style="width:100%;height:100%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:48px">📦</div>`}
            ${imgs.length > 1 ? `<div style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:5px">${imgs.map((_,i)=>`<div style="width:${i===0?12:8}px;height:8px;border-radius:4px;background:${i===0?'#f57224':'rgba(0,0,0,.3)'}"></div>`).join('')}</div>` : ''}
        </div>
        <!-- Product info -->
        <div style="background:#fff;padding:16px;margin-bottom:8px">
            ${brand ? `<div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${_esc(brand)}</div>` : ''}
            <div style="font-size:18px;font-weight:800;color:#111;line-height:1.3;margin-bottom:10px">${_esc(title)}</div>
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px">
                <span style="font-size:26px;font-weight:900;color:#f57224">KES ${parseFloat(price).toLocaleString()}</span>
                ${orig && parseFloat(orig)>parseFloat(price) ? `<span style="font-size:16px;color:#9ca3af;text-decoration:line-through">KES ${parseFloat(orig).toLocaleString()}</span><span style="background:#fee2e2;color:#ef4444;font-size:11px;font-weight:800;border-radius:4px;padding:2px 7px">${Math.round((1-parseFloat(price)/parseFloat(orig))*100)}% OFF</span>` : ''}
            </div>
            <div style="font-size:13px;color:${parseInt(stock)>0?'#22c55e':'#ef4444'};font-weight:700;margin-bottom:12px">
                ${parseInt(stock)>5 ? `✓ In Stock (${stock} available)` : parseInt(stock)>0 ? `⚠️ Only ${stock} left!` : '✗ Out of Stock'}
            </div>
            ${variants.length ? `<div style="margin-bottom:14px">${variants.map(v=>`<div style="margin-bottom:10px"><div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">${_esc(v.name)}</div><div style="display:flex;flex-wrap:wrap;gap:6px">${v.options.split(',').map(o=>`<div style="border:1.5px solid #e5e7eb;border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer">${_esc(o.trim())}</div>`).join('')}</div></div>`).join('')}</div>` : ''}
            <div style="display:flex;gap:10px;margin-bottom:16px">
                <button style="flex:1;background:#f57224;color:#fff;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:15px;cursor:pointer">Add to Cart</button>
                <button style="flex:1;background:#111;color:#fff;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:15px;cursor:pointer">Buy Now</button>
            </div>
        </div>
        <!-- Description -->
        ${desc ? `<div style="background:#fff;padding:16px;margin-bottom:8px"><div style="font-weight:800;font-size:14px;margin-bottom:8px">Description</div><div style="font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap">${_esc(desc)}</div></div>` : ''}
        <!-- Materials -->
        ${materials.length ? `<div style="background:#fff;padding:16px;margin-bottom:8px"><div style="font-weight:800;font-size:14px;margin-bottom:8px">Materials</div><div style="display:flex;flex-wrap:wrap;gap:6px">${materials.map(m=>`<span style="background:#f3f4f6;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600">${_esc(m)}</span>`).join('')}</div></div>` : ''}
        <!-- Specifications -->
        ${specs.length ? `<div style="background:#fff;padding:16px;margin-bottom:8px"><div style="font-weight:800;font-size:14px;margin-bottom:12px">Specifications</div>${specs.map(s=>`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f9fafb;font-size:13px"><span style="color:#6b7280">${_esc(s.key)}</span><span style="font-weight:600">${_esc(s.value)}</span></div>`).join('')}</div>` : ''}
    </div>`;
    document.body.appendChild(ov);
};

// Physical product publish — hooked into publishListingFromModal
window._physPublish = async function() {
    const title = document.getElementById('physTitle')?.value?.trim();
    const price = document.getElementById('physPrice')?.value;
    const desc  = document.getElementById('physDescription')?.value?.trim();
    const cat   = document.getElementById('physCategory')?.value;
    const stock = parseInt(document.getElementById('physStock')?.value || '0');

    if (!title) { _toast('Product name is required', 'error', '⚠️'); return null; }
    if (!price || parseFloat(price) <= 0) { _toast('Price is required', 'error', '⚠️'); return null; }
    if (!desc)  { _toast('Description is required', 'error', '⚠️'); return null; }
    if (!cat)   { _toast('Please select a category', 'error', '⚠️'); return null; }
    if (_physState.images.length === 0) { _toast('Please add at least one image', 'error', '📸'); return null; }

    // Upload images (base64 for now — in production use presigned S3 URLs)
    const imageUrls = await Promise.all(_physState.images.slice(0,8).map(img => {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(img.file);
        });
    }));

    const payload = {
        title,
        description: desc,
        short_description: document.getElementById('physShortDesc')?.value?.trim() || '',
        price:    parseFloat(price),
        original_price: parseFloat(document.getElementById('physOriginalPrice')?.value || 0) || null,
        category: cat,
        subcategory: document.getElementById('physSubcategory')?.value?.trim() || '',
        brand:    document.getElementById('physBrand')?.value?.trim() || '',
        sku:      document.getElementById('physSku')?.value?.trim() || '',
        stock_quantity: stock,
        weight:   parseFloat(document.getElementById('physWeight')?.value || 0) || null,
        images:   imageUrls,
        type:     'physical',
        condition:'new',
        available: false,  // Not available until approved
        // Approval workflow
        status: 'pending_review',
        approval_status: 'pending',
        metadata: {
            materials:  _physState.materials,
            variants:   _physState.variants.filter(v => v.name),
            specs:      Object.fromEntries(_physState.specs.filter(s=>s.key&&s.value).map(s=>[s.key,s.value])),
        },
    };

    const r = await _api('POST', '/marketplace/products', payload);
    if (r?._error) { _toast(r._error, 'error', '❌'); return null; }
    const product = r?.data?.product || r?.product;
    if (!product) { _toast('Failed to create product', 'error', '❌'); return null; }

    // Reset physState
    _physState.images = []; _physState.variants = []; _physState.specs = []; _physState.materials = [];
    _toast('Product submitted for review! It will go live after admin approval. 📋', 'success', '✅');
    return product;
};

// Hook physical tab into publishListingFromModal
(function _hookPhysical() {
    const orig = window._origPublishListingFromModal;
    // We patch via the existing UIState tab check
    window.addEventListener('jm:publish-physical', async () => {
        const product = await window._physPublish();
        if (product) {
            if (typeof window._jmHideModal === 'function') window._jmHideModal('createListingModal');
            if (typeof window.hideCreateListingModal === 'function') window.hideCreateListingModal();
            window._sellerDash?.reload?.();
        }
    });
})();

// ── Patch publishListingFromModal to handle 'physical' tab ────────────────────
(function _patchPublish() {
    // Wait for it to be defined
    const _tryPatch = () => {
        if (typeof window.publishListingFromModal !== 'function' && typeof publishListingFromModal === 'undefined') {
            setTimeout(_tryPatch, 500); return;
        }
        // Inject into the modal's publish button if physical tab is active
        const publishBtn = document.getElementById('publishListingBtn');
        if (publishBtn) {
            const origOnclick = publishBtn.onclick;
            publishBtn.onclick = async function(e) {
                const tab = window.UIState?.createListingActiveTab || document.querySelector('.create-listing-tab.active')?.dataset?.tab;
                if (tab === 'physical') {
                    const product = await window._physPublish();
                    if (product) {
                        if (typeof window.hideCreateListingModal === 'function') window.hideCreateListingModal();
                        window._sellerDash?.reload?.();
                    }
                } else {
                    origOnclick?.call(this, e);
                }
            };
        }
    };
    setTimeout(_tryPatch, 800);
})();

// ══════════════════════════════════════════════════════════════════════════════
// 1. SELLER DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
async function renderSellerDashboard(container) {
    container.innerHTML = _pageShell('Seller Dashboard', `
        <div style="padding:20px;text-align:center;font-size:20px">⏳ Loading dashboard…</div>
    `);

    const [dashR, analyticsR] = await Promise.all([
        _api('GET', '/marketplace/seller-dashboard'),
        _api('GET', '/marketplace/seller/analytics?period=7d'),
    ]);

    const dash = dashR?.data || dashR || {};
    const an   = analyticsR?.data || analyticsR || {};
    const orders = dash.recentOrders || [];
    const byDay  = an.revenue?.by_day || [];

    const maxRev = byDay.length ? Math.max(...byDay.map(d=>d.revenue), 1) : 1;

    container.innerHTML = _pageShell('🏪 Seller Dashboard', `
    <!-- Metrics -->
    <div class="sd-metrics">
        <div class="sd-metric accent">
            <div class="sd-metric-label">Revenue (7 days)</div>
            <div class="sd-metric-val">${_fmt(an.revenue?.total||0)}</div>
            <div class="sd-metric-sub">${an.orders?.total||0} orders total</div>
        </div>
        <div class="sd-metric">
            <div class="sd-metric-label">Active Listings</div>
            <div class="sd-metric-val">${an.products?.approved||dash.products||0}</div>
            <div class="sd-metric-sub">${an.products?.pending||0} pending review</div>
        </div>
        <div class="sd-metric">
            <div class="sd-metric-label">Pending Orders</div>
            <div class="sd-metric-val">${an.orders?.pending||dash.orders||0}</div>
            <div class="sd-metric-sub">Need fulfillment</div>
        </div>
        <div class="sd-metric">
            <div class="sd-metric-label">Conversion</div>
            <div class="sd-metric-val">${an.conversion_rate||0}%</div>
            <div class="sd-metric-sub">${(an.products?.total_views||0).toLocaleString()} views</div>
        </div>
    </div>

    <!-- Revenue chart -->
    <div class="sd-section">
        <div class="sd-section-title">Revenue (Last 7 Days)</div>
        <div class="sd-chart-wrap">
            <div class="sd-chart-bars" id="sdChartBars">
                ${byDay.map(d=>`<div class="sd-chart-bar" style="height:${maxRev>0?Math.max(4,Math.round((d.revenue/maxRev)*100)):4}%" data-val="${_fmt(d.revenue)}"></div>`).join('')}
            </div>
        </div>
        <div class="sd-chart-labels">
            ${byDay.map(d=>`<div class="sd-chart-label">${d.date?.slice(5)||''}</div>`).join('')}
        </div>
    </div>

    <!-- Quick actions -->
    <div class="sd-section">
        <div class="sd-section-title">Quick Actions</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <button class="sd-btn sd-btn-primary" onclick="window._jmNavMore('my-listings')">📦 My Listings</button>
            <button class="sd-btn sd-btn-secondary" onclick="window._jmHideMore?.();document.getElementById('createListingBtn')?.click()">＋ New Product</button>
            <button class="sd-btn sd-btn-secondary" onclick="window._jmNavMore('seller-inventory')">📊 Inventory</button>
            <button class="sd-btn sd-btn-secondary" onclick="window._jmNavMore('seller-payouts')">💰 Payouts</button>
            <button class="sd-btn sd-btn-secondary" onclick="window._jmNavMore('seller-shipping')">🚚 Shipping</button>
            <button class="sd-btn sd-btn-secondary" onclick="window._jmNavMore('seller-returns')">↩️ Returns</button>
        </div>
    </div>

    <!-- Recent orders -->
    ${orders.length ? `
    <div class="sd-section">
        <div class="sd-section-title">Recent Orders <button class="sd-see-all" onclick="window._jmNavMore('seller-shipping')">See All</button></div>
        ${orders.slice(0,5).map(o => {
            const items = o.metadata?.items || o.items || [];
            const sColor = {pending:'#f59e0b',confirmed:'#3b82f6',shipped:'#f97316',delivered:'#22c55e',cancelled:'#ef4444'}[o.status]||'#9ca3af';
            return `<div class="sd-order-row" onclick="window._jmNavMore('seller-shipping')">
                <div class="sd-order-header">
                    <span class="sd-order-id">#${String(o.id||'').slice(-8)}</span>
                    <span class="sd-order-amount">${_fmt(o.totalPrice||o.total_price||0)}</span>
                </div>
                <div class="sd-order-meta">
                    <span style="color:${sColor};font-weight:700;text-transform:capitalize">${o.status||'pending'}</span>
                    · ${items.length} item${items.length!==1?'s':''} · ${_date(o.createdAt||o.created_at)}
                </div>
            </div>`;
        }).join('')}
    </div>` : ''}

    <!-- Pending approval notice -->
    ${(an.products?.pending||0)>0 ? `
    <div class="sd-section" style="background:#fef3c7;border:1px solid #f59e0b">
        <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:24px">⏳</span>
            <div>
                <div style="font-weight:800;font-size:14px;color:#92400e">${an.products.pending} product${an.products.pending!==1?'s':''} awaiting approval</div>
                <div style="font-size:12px;color:#b45309;margin-top:2px">You'll be notified once reviewed. This usually takes 24–48 hours.</div>
            </div>
        </div>
    </div>` : ''}
    `);

    window._sellerDash = { reload: () => renderSellerDashboard(container) };
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. MY LISTINGS
// ══════════════════════════════════════════════════════════════════════════════
async function renderMyListings(container) {
    container.innerHTML = _pageShell('My Listings', `<div style="padding:20px;text-align:center">⏳</div>`);

    const r = await _api('GET', '/marketplace/seller/products');
    const products = r?.data?.products || r?.products || [];

    const statusGroups = {
        pending_review: products.filter(p=>p.status==='pending_review'||p.approval_status==='pending'),
        rejected:       products.filter(p=>p.approval_status==='rejected'||p.status==='rejected'),
        approved:       products.filter(p=>p.approval_status==='approved'||p.status==='active'||p.status==='approved'),
        draft:          products.filter(p=>p.status==='draft'),
        archived:       products.filter(p=>p.status==='archived'),
    };

    const renderGroup = (label, items, badgeClass) => {
        if (!items.length) return '';
        return `<div class="sd-section">
            <div class="sd-section-title">${label} <span class="sd-badge ${badgeClass}">${items.length}</span></div>
            ${items.map(p => _productRow(p)).join('')}
        </div>`;
    };

    container.innerHTML = _pageShell('📦 My Listings', `
    <div style="padding:12px 16px">
        <button class="sd-btn sd-btn-primary sd-btn-full" onclick="window._jmHideMore?.();setTimeout(()=>document.getElementById('createListingBtn')?.click(),100)">＋ Create New Listing</button>
    </div>
    ${renderGroup('⏳ Pending Review', statusGroups.pending_review, 'pending')}
    ${renderGroup('❌ Rejected — Needs Editing', statusGroups.rejected, 'rejected')}
    ${renderGroup('✅ Live & Active', statusGroups.approved, 'approved')}
    ${renderGroup('📝 Drafts', statusGroups.draft, 'draft')}
    ${renderGroup('🗄️ Archived', statusGroups.archived, 'archived')}
    ${!products.length ? `<div style="padding:40px;text-align:center;color:#9ca3af">
        <div style="font-size:40px;margin-bottom:12px">📭</div>
        <div style="font-weight:700;font-size:16px">No listings yet</div>
        <div style="font-size:13px;margin-top:6px">Create your first product listing to get started!</div>
    </div>` : ''}
    `);
}

function _productRow(p) {
    const statusMap = {
        pending_review: 'pending', rejected: 'rejected', approved: 'approved',
        active: 'approved', draft: 'draft', archived: 'archived', inactive: 'inactive', suspended: 'suspended'
    };
    const badgeClass = statusMap[p.approval_status==='rejected'?'rejected':p.status] || 'draft';
    const badgeLabel = {
        pending_review:'Pending Review', pending:'Pending Review', rejected:'Rejected',
        approved:'Live', active:'Live', draft:'Draft', archived:'Archived', inactive:'Inactive', suspended:'Suspended'
    }[p.approval_status==='rejected'?'rejected':p.status] || p.status;

    const img = p.image || (Array.isArray(p.images)?p.images[0]:'') || '';
    return `<div class="sd-product-row">
        ${img ? `<img class="sd-product-img" src="${_esc(img)}" loading="lazy">` : `<div class="sd-product-img-placeholder">📦</div>`}
        <div style="flex:1;min-width:0">
            <div class="sd-product-title">${_esc(p.title||'Untitled')}</div>
            <div class="sd-product-meta">
                <span class="sd-badge ${badgeClass}">${badgeLabel}</span>
                ${p.rejection_reason ? `<div style="font-size:11px;color:#ef4444;margin-top:3px">Reason: ${_esc(p.rejection_reason)}</div>` : ''}
                <span style="margin-left:6px">${p.views||0} views · ${p.sold_count||p.soldCount||0} sold</span>
            </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
            <div class="sd-product-price">${_fmt(p.price)}</div>
            <div style="display:flex;gap:4px;margin-top:6px;justify-content:flex-end">
                ${(p.approval_status==='rejected'||p.status==='rejected') ? `<button class="sd-btn sd-btn-secondary" style="padding:4px 10px;font-size:11px" onclick="window._sellerResubmit('${p.id}')">✏️ Edit & Resubmit</button>` : ''}
                ${(p.status==='approved'||p.status==='active'||p.approval_status==='approved') ? `<button class="sd-btn sd-btn-secondary" style="padding:4px 10px;font-size:11px" onclick="window._sellerArchive('${p.id}')">Archive</button>` : ''}
                ${p.status==='archived' ? `<button class="sd-btn sd-btn-secondary" style="padding:4px 10px;font-size:11px" onclick="window._sellerRestore('${p.id}')">Restore</button>` : ''}
                <button class="sd-btn sd-btn-secondary" style="padding:4px 10px;font-size:11px" onclick="window._sellerDuplicate('${p.id}')">⧉ Copy</button>
            </div>
        </div>
    </div>`;
}

window._sellerResubmit = async (id) => {
    const reason = prompt('What did you change? (Optional note for admin)') || '';
    const r = await _api('POST', `/marketplace/seller/products/${id}/resubmit`, { updates: { metadata: { resubmit_note: reason } } });
    if (r && !r._error) { _toast('Resubmitted for review!', 'success', '✅'); window._jmNavMore('my-listings'); }
    else _toast(r?._error || 'Resubmit failed', 'error', '❌');
};
window._sellerArchive = async (id) => {
    if (!confirm('Archive this product? It will become invisible to buyers.')) return;
    await _api('POST', `/marketplace/seller/products/${id}/archive`);
    _toast('Product archived', 'info', '🗄️'); window._jmNavMore('my-listings');
};
window._sellerRestore = async (id) => {
    await _api('POST', `/marketplace/seller/products/${id}/restore`);
    _toast('Restored as Draft — submit for review to go live', 'info', '📝'); window._jmNavMore('my-listings');
};
window._sellerDuplicate = async (id) => {
    const r = await _api('POST', `/marketplace/seller/products/${id}/duplicate`);
    if (r && !r._error) { _toast('Duplicated as draft!', 'success', '⧉'); window._jmNavMore('my-listings'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 3. INVENTORY MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
async function renderInventory(container) {
    container.innerHTML = _pageShell('Inventory', `<div style="padding:20px;text-align:center">⏳</div>`);
    const r = await _api('GET', '/marketplace/seller/inventory');
    const { items=[], low_stock=[], out_of_stock=[] } = r?.data || {};

    container.innerHTML = _pageShell('📊 Inventory', `
    ${out_of_stock.length ? `<div style="background:#fee2e2;padding:12px 16px;font-size:13px;color:#991b1b;font-weight:600;display:flex;gap:8px;align-items:center">⚠️ ${out_of_stock.length} product${out_of_stock.length!==1?'s':''} out of stock — update now!</div>` : ''}
    ${low_stock.length ? `<div style="background:#fef3c7;padding:12px 16px;font-size:13px;color:#92400e;font-weight:600;display:flex;gap:8px;align-items:center">🔔 ${low_stock.length} product${low_stock.length!==1?'s':''} low on stock</div>` : ''}
    <div class="sd-section" style="overflow-x:auto">
        <div class="sd-section-title">All Products
            <button class="sd-btn sd-btn-secondary" style="padding:6px 12px;font-size:11px" onclick="window._bulkSaveInventory()">💾 Save All</button>
        </div>
        <table class="sd-table">
            <thead><tr><th>Product</th><th>Status</th><th>Stock</th><th>SKU</th></tr></thead>
            <tbody>
                ${items.map(p => {
                    const img = p.image || (Array.isArray(p.images)?p.images[0]:'') || '';
                    const qty = p.stockQuantity ?? p.stock ?? 0;
                    const statusClass = qty===0?'rejected':qty<=5?'pending':'approved';
                    return `<tr>
                        <td style="min-width:160px">
                            <div style="display:flex;align-items:center;gap:8px">
                                ${img?`<img src="${_esc(img)}" style="width:36px;height:36px;border-radius:6px;object-fit:cover">`:
                                `<div style="width:36px;height:36px;border-radius:6px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:14px">📦</div>`}
                                <div style="font-size:12px;font-weight:600;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px">${_esc(p.title||'')}</div>
                            </div>
                        </td>
                        <td><span class="sd-badge ${statusClass}">${qty===0?'Out of Stock':qty<=5?'Low Stock':'In Stock'}</span></td>
                        <td><input class="sd-stock-input" type="number" min="0" value="${qty}" data-id="${p.id}" id="inv_${p.id}"></td>
                        <td style="font-size:12px;color:#9ca3af">${_esc(p.sku||'—')}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        ${!items.length ? `<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">No products yet</div>` : ''}
    </div>
    <div style="padding:0 16px 20px">
        <button class="sd-btn sd-btn-secondary sd-btn-full" onclick="window._exportProducts()">📥 Export CSV</button>
        <input type="file" id="invImportInput" accept=".csv" style="display:none" onchange="window._importProductsCSV(this)">
        <button class="sd-btn sd-btn-secondary sd-btn-full" onclick="document.getElementById('invImportInput').click()">📤 Import CSV</button>
    </div>
    `);
}

window._bulkSaveInventory = async function() {
    const inputs = document.querySelectorAll('.sd-stock-input[data-id]');
    const updates = Array.from(inputs).map(inp => ({ id: inp.dataset.id, quantity: parseInt(inp.value)||0 }));
    const r = await _api('PUT', '/marketplace/seller/inventory/bulk', { updates });
    if (r && !r._error) _toast(`Saved ${r.data?.updated||updates.length} items`, 'success', '💾');
    else _toast('Save failed', 'error', '❌');
};

window._exportProducts = async function() {
    const r = await _api('GET', '/marketplace/seller/products/export');
    if (r?._error) { _toast('Export failed', 'error', '❌'); return; }
    // If backend returns CSV directly
    const url = URL.createObjectURL(new Blob([typeof r === 'string' ? r : JSON.stringify(r)], {type:'text/csv'}));
    const a = document.createElement('a'); a.href=url; a.download=`products-${Date.now()}.csv`; a.click();
};

window._importProductsCSV = async function(input) {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(Boolean);
    const headers = lines[0].split(',').map(h=>h.trim().replace(/"/g,''));
    const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v=>v.trim().replace(/^"|"$/g,''));
        return Object.fromEntries(headers.map((h,i)=>[h,vals[i]||'']));
    });
    const r = await _api('POST', '/marketplace/seller/products/import', { rows });
    if (r && !r._error) _toast(`${r.data?.imported||0} products queued for review`, 'success', '📤');
    else _toast('Import failed', 'error', '❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 4. SELLER ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════
async function renderSellerAnalytics(container) {
    container.innerHTML = _pageShell('Analytics', `<div style="padding:20px;text-align:center">⏳</div>`);
    const [r7, r30] = await Promise.all([
        _api('GET', '/marketplace/seller/analytics?period=7d'),
        _api('GET', '/marketplace/seller/analytics?period=30d'),
    ]);
    const d7=r7?.data||{}, d30=r30?.data||{};
    const byDay = d7.revenue?.by_day || [];
    const maxRev = Math.max(...byDay.map(d=>d.revenue),1);
    const topProducts = d30.top_products || [];

    container.innerHTML = _pageShell('📈 Analytics', `
    <!-- Period tabs -->
    <div style="display:flex;gap:0;padding:12px 16px 0;border-bottom:1px solid #f3f4f6;background:#fff">
        ${['7d','30d'].map(p=>`<button style="flex:1;padding:10px;background:none;border:none;border-bottom:2px solid ${p==='7d'?'#f57224':'transparent'};font-weight:700;font-size:13px;color:${p==='7d'?'#f57224':'#9ca3af'};cursor:pointer" onclick="window._jmNavMore('seller-analytics')">${p==='7d'?'7 Days':'30 Days'}</button>`).join('')}
    </div>

    <!-- Overview metrics -->
    <div class="sd-metrics">
        <div class="sd-metric accent">
            <div class="sd-metric-label">Revenue (30d)</div>
            <div class="sd-metric-val">${_fmt(d30.revenue?.total||0)}</div>
            <div class="sd-metric-sub">${d30.orders?.total||0} orders</div>
        </div>
        <div class="sd-metric">
            <div class="sd-metric-label">Views</div>
            <div class="sd-metric-val">${(d30.products?.total_views||0).toLocaleString()}</div>
            <div class="sd-metric-sub">Across all products</div>
        </div>
        <div class="sd-metric">
            <div class="sd-metric-label">Conversion</div>
            <div class="sd-metric-val">${d30.conversion_rate||0}%</div>
            <div class="sd-metric-sub">Views → Sales</div>
        </div>
        <div class="sd-metric">
            <div class="sd-metric-label">Units Sold</div>
            <div class="sd-metric-val">${d30.products?.total_sold||0}</div>
            <div class="sd-metric-sub">${d30.orders?.completed||0} completed</div>
        </div>
    </div>

    <!-- 7-day chart -->
    <div class="sd-section">
        <div class="sd-section-title">Revenue — Last 7 Days</div>
        <div class="sd-chart-wrap">
            <div class="sd-chart-bars">
                ${byDay.map(d=>`<div class="sd-chart-bar" style="height:${maxRev>0?Math.max(4,Math.round((d.revenue/maxRev)*100)):4}%" data-val="${_fmt(d.revenue)}"></div>`).join('')}
            </div>
        </div>
        <div class="sd-chart-labels">${byDay.map(d=>`<div class="sd-chart-label">${d.date?.slice(5)||''}</div>`).join('')}</div>
    </div>

    <!-- Order breakdown -->
    <div class="sd-section">
        <div class="sd-section-title">Order Status (30 days)</div>
        ${[
            ['✅ Completed', d30.orders?.completed||0, '#22c55e'],
            ['⏳ Pending',   d30.orders?.pending||0,   '#f59e0b'],
            ['❌ Cancelled', d30.orders?.cancelled||0, '#ef4444'],
        ].map(([label,count,color])=>`
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f9fafb">
            <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></div>
            <div style="flex:1;font-size:13px;font-weight:600">${label}</div>
            <div style="font-size:14px;font-weight:800">${count}</div>
        </div>`).join('')}
    </div>

    <!-- Top products -->
    ${topProducts.length ? `
    <div class="sd-section">
        <div class="sd-section-title">🏆 Top Products (30 days)</div>
        ${topProducts.map((p,i)=>`
        <div class="sd-product-row">
            <div style="width:28px;height:28px;border-radius:50%;background:${i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'#f3f4f6'};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;flex-shrink:0">${i+1}</div>
            <div style="flex:1;min-width:0">
                <div class="sd-product-title">${_esc(p.title||'')}</div>
                <div class="sd-product-meta">${p.sold} sold · ${p.views} views · ⭐ ${parseFloat(p.rating||0).toFixed(1)}</div>
            </div>
            <div class="sd-product-price">${_fmt(p.revenue)}</div>
        </div>`).join('')}
    </div>` : ''}
    `);
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. PAYOUT SYSTEM
// ══════════════════════════════════════════════════════════════════════════════
async function renderPayouts(container) {
    container.innerHTML = _pageShell('Payouts', `<div style="padding:20px;text-align:center">⏳</div>`);
    const r = await _api('GET', '/marketplace/seller/payout');
    const d = r?.data || r || { available:0, pending_payout:0, total_earned:0, gross_sales:0, platform_fee:0, currency:'KES', payout_history:[] };

    container.innerHTML = _pageShell('💰 Payouts', `
    <div class="sd-payout-card">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.75">Available Balance</div>
        <div class="sd-payout-balance">${_fmt(d.available||0)}</div>
        <div style="font-size:12px;opacity:.75;margin-bottom:16px">${_fmt(d.pending_payout||0)} pending payout</div>
        <button style="background:rgba(255,255,255,.2);border:none;border-radius:10px;padding:10px 20px;color:#fff;font-weight:800;font-size:13px;cursor:pointer" onclick="window._requestPayout()">💸 Request Payout</button>
    </div>
    <div class="sd-metrics" style="padding:0 16px 10px">
        <div class="sd-metric"><div class="sd-metric-label">Gross Sales</div><div class="sd-metric-val">${_fmt(d.gross_sales||0)}</div></div>
        <div class="sd-metric"><div class="sd-metric-label">Platform Fee (10%)</div><div class="sd-metric-val">${_fmt(d.platform_fee||0)}</div></div>
        <div class="sd-metric"><div class="sd-metric-label">Net Earnings</div><div class="sd-metric-val">${_fmt(d.total_earned||0)}</div></div>
        <div class="sd-metric"><div class="sd-metric-label">Total Withdrawn</div><div class="sd-metric-val">${_fmt(d.total_withdrawn||0)}</div></div>
    </div>
    <div class="sd-section">
        <div class="sd-section-title">Payout History</div>
        ${(d.payout_history||[]).length ? (d.payout_history||[]).map(p=>`
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f9fafb">
            <div style="width:36px;height:36px;border-radius:50%;background:${p.status==='completed'?'#d1fae5':'#fef3c7'};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${p.status==='completed'?'✅':'⏳'}</div>
            <div style="flex:1"><div style="font-size:13px;font-weight:700">${_fmt(p.amount||0)} via ${_esc(p.method?.toUpperCase()||'MPESA')}</div><div style="font-size:11px;color:#9ca3af">${_date(p.requested_at)}</div></div>
            <span class="sd-badge ${p.status==='completed'?'approved':'pending'}">${p.status||'pending'}</span>
        </div>`).join('') : `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">No payout history yet</div>`}
    </div>
    `);
}

window._requestPayout = async function() {
    const amount  = prompt('Amount to withdraw (KES):');
    if (!amount || isNaN(amount)) return;
    const account = prompt('M-Pesa number:') || '';
    const r = await _api('POST', '/marketplace/seller/payout/request', { amount: parseFloat(amount), method:'mpesa', account });
    if (r && !r._error) _toast('Payout request submitted! Processing in 1–3 business days.', 'success', '💸');
    else _toast(r?._error||'Request failed', 'error', '❌');
    window._jmNavMore('seller-payouts');
};

// ══════════════════════════════════════════════════════════════════════════════
// 6. SHIPPING MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
async function renderShipping(container) {
    container.innerHTML = _pageShell('Shipping', `<div style="padding:20px;text-align:center">⏳</div>`);
    const r = await _api('GET', '/marketplace/seller-dashboard/orders');
    const orders = r?.data?.orders || r?.orders || [];
    const active = orders.filter(o=>!['delivered','cancelled','refunded'].includes(o.status));

    container.innerHTML = _pageShell('🚚 Shipping', `
    <div style="background:#f0fdf4;padding:12px 16px;font-size:12px;color:#166534;font-weight:600">
        💡 Update shipping status to notify buyers automatically
    </div>
    <div class="sd-section" style="margin-top:12px">
        <div class="sd-section-title">Orders to Fulfill (${active.length})</div>
        ${active.length ? active.map(o => {
            const items = o.metadata?.items || o.items || [];
            const statusSteps = ['pending','confirmed','shipped','out_for_delivery','delivered'];
            const currIdx = statusSteps.indexOf(o.status);
            return `<div style="background:#f9fafb;border-radius:12px;padding:14px;margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                    <div>
                        <div style="font-weight:800;font-size:14px">#${String(o.id||'').slice(-8)}</div>
                        <div style="font-size:12px;color:#6b7280;margin-top:2px">${items.length} item${items.length!==1?'s':''} · ${_fmt(o.totalPrice||o.total_price||0)}</div>
                        <div style="font-size:11px;color:#9ca3af;margin-top:2px">To: ${_esc(o.deliveryAddress?.address||o.delivery_address?.address||'—')}</div>
                    </div>
                    <span class="sd-badge ${o.status==='pending'?'pending':o.status==='shipped'?'approved':'draft'}">${o.status}</span>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${o.status==='pending'||o.status==='confirmed' ? `<button class="sd-btn sd-btn-secondary" style="padding:6px 12px;font-size:11px" onclick="window._shipUpdate('${o.id}','packed')">📦 Mark Packed</button>` : ''}
                    ${o.status==='confirmed'||o.status==='pending' ? `<button class="sd-btn sd-btn-primary" style="padding:6px 12px;font-size:11px" onclick="window._shipModal('${o.id}')">🚚 Mark Shipped</button>` : ''}
                    ${o.status==='shipped' ? `<button class="sd-btn sd-btn-secondary" style="padding:6px 12px;font-size:11px" onclick="window._shipUpdate('${o.id}','out_for_delivery')">🏍️ Out for Delivery</button>` : ''}
                    ${o.status==='out_for_delivery' ? `<button class="sd-btn sd-btn-success" style="padding:6px 12px;font-size:11px" onclick="window._shipUpdate('${o.id}','delivered')">✅ Mark Delivered</button>` : ''}
                    <button class="sd-btn sd-btn-secondary" style="padding:6px 12px;font-size:11px" onclick="window._viewShippingLabel('${o.id}')">🖨️ Label</button>
                </div>
            </div>`;
        }).join('') : `<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">All orders fulfilled! 🎉</div>`}
    </div>
    `);
}

window._shipUpdate = async function(orderId, status) {
    const r = await _api('PUT', `/marketplace/seller/orders/${orderId}/shipping`, { status });
    if (r && !r._error) { _toast(`Order marked as ${status.replace(/_/g,' ')}`, 'success', '✅'); window._jmNavMore('seller-shipping'); }
    else _toast(r?._error||'Update failed', 'error', '❌');
};

window._shipModal = function(orderId) {
    const tracking = prompt('Enter tracking number (optional):') || '';
    const courier  = prompt('Courier name (e.g., G4S, DHL, Sendy):') || '';
    _api('PUT', `/marketplace/seller/orders/${orderId}/shipping`, { status:'shipped', tracking_number:tracking, courier }).then(r => {
        if (r && !r._error) { _toast('Order shipped! Buyer notified.', 'success', '🚚'); window._jmNavMore('seller-shipping'); }
    });
};

window._viewShippingLabel = async function(orderId) {
    const r = await _api('GET', `/marketplace/seller/orders/${orderId}/shipping-label`);
    const label = r?.data?.label;
    if (!label) { _toast('Label unavailable', 'error', '❌'); return; }
    const w = window.open('','_blank','width=400,height=500');
    w.document.write(`<!DOCTYPE html><html><head><title>Shipping Label</title><style>body{font-family:Arial;padding:20px;border:2px solid #000}h2{margin:0 0 10px}p{margin:4px 0;font-size:14px}hr{margin:10px 0}.big{font-size:18px;font-weight:bold}</style></head><body>
    <h2>📦 Shipping Label</h2><hr>
    <p><b>Order:</b> #${String(label.order_id||'').slice(-8)}</p>
    <p><b>Tracking:</b> <span class="big">${_esc(label.tracking_number||'PENDING')}</span></p>
    <p><b>Courier:</b> ${_esc(label.courier||'Standard')}</p>
    <hr>
    <p><b>TO:</b></p>
    <p class="big">${_esc(label.to?.name||'')}</p>
    <p>${_esc(label.to?.address||'')}${label.to?.city?', '+_esc(label.to.city):''}</p>
    <p>${_esc(label.to?.phone||'')}</p>
    <hr>
    <p><b>Items:</b></p>
    ${(label.items||[]).map(i=>`<p>• ${_esc(i.title)} x${i.quantity}</p>`).join('')}
    <hr><p style="text-align:center;font-size:11px">Knecta Market — ${new Date().toLocaleDateString()}</p>
    <script>window.print();<\/script></body></html>`);
};

// ══════════════════════════════════════════════════════════════════════════════
// 7. RETURNS MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
async function renderReturns(container) {
    container.innerHTML = _pageShell('Returns', `<div style="padding:20px;text-align:center">⏳</div>`);
    const r = await _api('GET', '/marketplace/seller/returns');
    const returns = r?.data?.returns || r?.returns || [];

    container.innerHTML = _pageShell('↩️ Returns & Refunds', `
    <div class="sd-section">
        <div class="sd-section-title">Return Requests (${returns.length})</div>
        ${returns.length ? returns.map(ret => `
        <div style="background:#f9fafb;border-radius:12px;padding:14px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                <div>
                    <div style="font-weight:800;font-size:14px">Order #${String(ret.order_id||'').slice(-8)}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:2px">Requested: ${_date(ret.requested_at)}</div>
                    <div style="font-size:12px;color:#374151;margin-top:4px"><b>Reason:</b> ${_esc(ret.reason||'Not specified')}</div>
                    <div style="font-size:14px;font-weight:800;color:#f57224;margin-top:4px">${_fmt(ret.total)}</div>
                </div>
                <span class="sd-badge ${ret.status==='pending'?'pending':ret.status==='approved'?'approved':'rejected'}">${ret.status}</span>
            </div>
            ${ret.status==='pending' ? `
            <div style="display:flex;gap:8px;margin-top:10px">
                <button class="sd-btn sd-btn-success" style="flex:1;padding:10px" onclick="window._approveReturn('${ret.order_id}')">✅ Approve Return</button>
                <button class="sd-btn sd-btn-danger" style="flex:1;padding:10px" onclick="window._rejectReturn('${ret.order_id}')">❌ Reject</button>
            </div>` : ''}
        </div>`).join('') : `<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">No return requests 🎉</div>`}
    </div>
    `);
}

window._approveReturn = async (id) => {
    if (!confirm('Approve this return request? The buyer will receive a refund.')) return;
    const r = await _api('POST', `/marketplace/seller/returns/${id}/approve`);
    if (r && !r._error) { _toast('Return approved. Refund processed.', 'success', '✅'); window._jmNavMore('seller-returns'); }
    else _toast(r?._error||'Failed', 'error', '❌');
};

window._rejectReturn = async (id) => {
    const reason = prompt('Reason for rejecting this return:') || 'Does not meet return policy';
    const r = await _api('POST', `/marketplace/seller/returns/${id}/reject`, { reason });
    if (r && !r._error) { _toast('Return rejected', 'info', '❌'); window._jmNavMore('seller-returns'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 8. SELLER VERIFICATION (KYC)
// ══════════════════════════════════════════════════════════════════════════════
async function renderVerification(container) {
    container.innerHTML = _pageShell('Verification', `<div style="padding:20px;text-align:center">⏳</div>`);
    const r = await _api('GET', '/marketplace/seller/verification');
    const { status='unverified', kyc=null } = r?.data || {};

    const statusContent = {
        approved: `<div class="sd-kyc-status approved"><strong>✅ Verified Seller</strong><br>Your account is verified. You have full seller access.</div>`,
        pending:  `<div class="sd-kyc-status pending"><strong>⏳ Verification Pending</strong><br>Submitted ${_date(kyc?.submitted_at)}. Review takes 1–2 business days.</div>`,
        rejected: `<div class="sd-kyc-status rejected"><strong>❌ Verification Rejected</strong><br>${_esc(kyc?.review_reason||'Please resubmit with correct documents.')}</div>`,
        unverified: '',
    };

    container.innerHTML = _pageShell('🛡️ Seller Verification', `
    <div style="padding:16px">
    ${statusContent[status]||''}
    ${status !== 'approved' ? `
    <div class="sd-section">
        <div class="sd-section-title">Submit KYC Documents</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:14px">Verify your identity to unlock advanced seller features and higher limits.</div>
        <div class="input-group" style="margin-bottom:10px">
            <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px">ID Type</label>
            <select id="kycIdType" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:14px;box-sizing:border-box">
                <option value="">Select…</option>
                <option value="national_id">National ID</option>
                <option value="passport">Passport</option>
                <option value="driving_license">Driving License</option>
            </select>
        </div>
        <div class="input-group" style="margin-bottom:10px">
            <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px">ID Number</label>
            <input id="kycIdNumber" type="text" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:14px;box-sizing:border-box" placeholder="Enter your ID number">
        </div>
        <div class="input-group" style="margin-bottom:10px">
            <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px">Business Name (Optional)</label>
            <input id="kycBusiness" type="text" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:14px;box-sizing:border-box" placeholder="Your business or company name">
        </div>
        <button class="sd-btn sd-btn-primary" style="width:100%;padding:14px" onclick="window._submitKYC()">Submit for Verification</button>
    </div>` : ''}
    <div class="sd-section">
        <div class="sd-section-title">Benefits of Verification</div>
        ${['Higher payout limits (KES 50,000+)','Verified seller badge on all listings','Access to flash sale promotions','Priority customer support','Lower platform fees (8% vs 10%)'].map(b=>`<div style="display:flex;gap:10px;padding:7px 0;font-size:13px;color:#374151"><span style="color:#22c55e;font-weight:700">✓</span>${b}</div>`).join('')}
    </div>
    </div>
    `);
}

window._submitKYC = async function() {
    const id_type    = document.getElementById('kycIdType')?.value;
    const id_number  = document.getElementById('kycIdNumber')?.value?.trim();
    const business   = document.getElementById('kycBusiness')?.value?.trim();
    if (!id_type || !id_number) { _toast('Please fill all required fields', 'error', '⚠️'); return; }
    const r = await _api('POST', '/marketplace/seller/verification', { id_type, id_number, business_name: business });
    if (r && !r._error) { _toast('Verification submitted! We\'ll review within 1–2 days.', 'success', '🛡️'); window._jmNavMore('seller-verification'); }
    else _toast(r?._error||'Submission failed', 'error', '❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 9. SUBSCRIPTION PLANS
// ══════════════════════════════════════════════════════════════════════════════
async function renderSubscription(container) {
    container.innerHTML = _pageShell('Subscription', `<div style="padding:20px;text-align:center">⏳</div>`);
    const r = await _api('GET', '/marketplace/seller/subscription');
    const { plan='basic', expires_at=null, plans=[] } = r?.data || {};
    const displayPlans = plans.length ? plans : [
        { id:'basic', name:'Basic', price:0, currency:'KES', listing_limit:10, features:['10 active listings','Basic analytics','Standard support'] },
        { id:'professional', name:'Professional', price:500, currency:'KES', listing_limit:100, features:['100 active listings','Full analytics','Priority support','Boost 5/month','CSV import/export'], recommended:true },
        { id:'premium', name:'Premium', price:1500, currency:'KES', listing_limit:9999, features:['Unlimited listings','Advanced analytics','VIP support','Unlimited boosts','Featured placement','Flash sale access'] },
    ];

    container.innerHTML = _pageShell('📋 Subscription', `
    <div style="padding:16px">
    <div style="background:#f0fdf4;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#166534;font-weight:600">
        Current plan: <strong>${plan?.toUpperCase()}</strong>${expires_at?` · Renews ${_date(expires_at)}`:''}
    </div>
    ${displayPlans.map(p=>`
    <div class="sd-plan-card ${p.id===plan?'current':''} ${p.recommended?'recommended':''}">
        ${p.recommended?`<div style="font-size:11px;font-weight:800;color:#8b5cf6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">⭐ Most Popular</div>`:''}
        ${p.id===plan?`<div style="font-size:11px;font-weight:800;color:#f57224;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">✓ Current Plan</div>`:''}
        <div class="sd-plan-name">${p.name}</div>
        <div class="sd-plan-price">${p.price===0?'Free':'KES '+p.price.toLocaleString()}<span style="font-size:13px;font-weight:400;color:#9ca3af">/month</span></div>
        <div style="font-size:12px;color:#6b7280;margin:6px 0 10px">${p.listing_limit===9999?'Unlimited':p.listing_limit} listings</div>
        ${p.features.map(f=>`<div class="sd-plan-feature"><span style="color:#22c55e;font-size:14px">✓</span>${f}</div>`).join('')}
        ${p.id!==plan?`<button class="sd-btn sd-btn-primary sd-btn-full" style="margin-top:14px" onclick="window._upgradePlan('${p.id}')">${p.price===0?'Downgrade to Basic':'Upgrade to '+p.name}</button>`:''}
    </div>`).join('')}
    </div>
    `);
}

window._upgradePlan = async (plan) => {
    const r = await _api('POST', '/marketplace/seller/subscription/upgrade', { plan });
    if (r && !r._error) { _toast(`Upgraded to ${plan}!`, 'success', '📋'); window._jmNavMore('seller-subscription'); }
    else _toast(r?._error||'Upgrade failed', 'error', '❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 10. ADMIN APPROVAL PANEL
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminApproval(container) {
    container.innerHTML = _pageShell('Admin: Approve Products', `<div style="padding:20px;text-align:center">⏳</div>`);
    const r = await _api('GET', '/marketplace/admin/products/pending');
    const products = r?.data?.products || r?.products || [];

    container.innerHTML = _pageShell('⚙️ Admin — Product Approval', `
    <div style="background:#fef3c7;padding:12px 16px;font-size:12px;color:#92400e;font-weight:600">
        ${products.length} product${products.length!==1?'s':''} awaiting review
    </div>
    <div style="padding:12px 16px">
    ${products.length ? products.map(p => {
        const img = p.image || (Array.isArray(p.images)?p.images[0]:'') || '';
        return `<div class="sd-approval-card">
            ${img ? `<img class="sd-approval-img" src="${_esc(img)}" loading="lazy">` : `<div class="sd-approval-img" style="display:flex;align-items:center;justify-content:center;font-size:48px">📦</div>`}
            <div class="sd-approval-body">
                <div class="sd-approval-title">${_esc(p.title||'Untitled')}</div>
                <div class="sd-approval-meta">
                    ${_esc(p.category||'')} · ${_fmt(p.price)} · Submitted ${_date(p.submitted_at||p.created_at)}
                    ${p.brand ? ` · Brand: ${_esc(p.brand)}` : ''}
                </div>
                ${p.description ? `<div style="font-size:12px;color:#374151;line-height:1.5;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${_esc(p.description)}</div>` : ''}
                ${(p.metadata?.materials||[]).length ? `<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:4px">${(p.metadata.materials||[]).map(m=>`<span style="background:#f3f4f6;border-radius:20px;padding:2px 8px;font-size:11px">${_esc(m)}</span>`).join('')}</div>` : ''}
                <div class="sd-approval-actions">
                    <button class="sd-approve-btn" onclick="window._adminApprove('${p.id}')">✅ Approve & Publish</button>
                    <button class="sd-reject-btn" onclick="window._adminRejectModal('${p.id}')">❌ Reject</button>
                </div>
            </div>
        </div>`;
    }).join('') : `<div style="padding:40px;text-align:center;color:#9ca3af">
        <div style="font-size:40px;margin-bottom:12px">✅</div>
        <div style="font-weight:700;font-size:16px">All caught up!</div>
        <div style="font-size:13px;margin-top:6px">No products pending review.</div>
    </div>`}
    </div>
    `);
}

window._adminApprove = async (id) => {
    const r = await _api('POST', `/marketplace/admin/products/${id}/approve`);
    if (r && !r._error) { _toast('Product approved and published!', 'success', '✅'); window._jmNavMore('admin-approval'); }
    else _toast(r?._error||'Approval failed', 'error', '❌');
};

window._adminRejectModal = function(id) {
    document.getElementById('adminRejectModal')?.remove();
    const ov = document.createElement('div');
    ov.id = 'adminRejectModal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99000;display:flex;align-items:flex-end;justify-content:center';
    ov.innerHTML = `<div style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px">
        <div style="font-weight:800;font-size:16px;margin-bottom:12px">❌ Reject Product</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:12px">Provide a reason so the seller can improve their listing:</div>
        <textarea id="adminRejectReason" class="sd-reject-reason" rows="4" placeholder="e.g., Images are too blurry. Please upload clear product photos with good lighting."></textarea>
        <div style="display:flex;gap:10px;margin-top:14px">
            <button class="sd-btn sd-btn-danger" style="flex:1;padding:12px" onclick="window._adminReject('${id}')">Confirm Reject</button>
            <button class="sd-btn sd-btn-secondary" style="flex:1;padding:12px" onclick="document.getElementById('adminRejectModal')?.remove()">Cancel</button>
        </div>
    </div>`;
    document.body.appendChild(ov);
};

window._adminReject = async (id) => {
    const reason = document.getElementById('adminRejectReason')?.value?.trim() || 'Does not meet marketplace standards';
    document.getElementById('adminRejectModal')?.remove();
    const r = await _api('POST', `/marketplace/admin/products/${id}/reject`, { reason });
    if (r && !r._error) { _toast('Product rejected. Seller notified.', 'info', '❌'); window._jmNavMore('admin-approval'); }
    else _toast(r?._error||'Rejection failed', 'error', '❌');
};

// ── Helper: page shell ────────────────────────────────────────────────────────
function _pageShell(title, content) {
    return `<div class="sd-page">
        <div class="sd-header">
            <button class="sd-back" onclick="window.history.back?.()">←</button>
            <div class="sd-title">${title}</div>
        </div>
        <div class="sd-body">${content}</div>
    </div>`;
}

// ── Lazy page scaffold ────────────────────────────────────────────────────────
function _getOrCreatePage(pageId, pageTitle) {
    let el = document.getElementById(pageId);
    if (!el) {
        el = document.createElement('div');
        el.id = pageId;
        el.className = 'jm-page';
        const wrapper = document.querySelector('.jm-pages-container') ||
                        document.querySelector('#jmPages') ||
                        document.querySelector('.jm-app') ||
                        document.querySelector('.knt-app') ||
                        document.body;
        wrapper.appendChild(el);
    }
    return el;
}

// ── Nav routing patch ─────────────────────────────────────────────────────────
const _prevNavMore = window._jmNavMore;
window._jmNavMore = function(page) {
    const sellerRoutes = {
        'seller-dashboard': renderSellerDashboard,
        'my-listings':      renderMyListings,
        'seller-inventory': renderInventory,
        'seller-analytics': renderSellerAnalytics,
        'seller-payouts':   renderPayouts,
        'seller-shipping':  renderShipping,
        'seller-returns':   renderReturns,
        'seller-verification': renderVerification,
        'seller-subscription': renderSubscription,
        'admin-approval':   renderAdminApproval,
    };

    const renderFn = sellerRoutes[page];
    if (renderFn) {
        // Hide all jm-pages
        document.querySelectorAll('.jm-page').forEach(p => p.classList.remove('active'));
        // Hide more sheet
        window._jmHideMore?.();

        const pageId = 'jmPage_' + page.replace(/-/g,'_');
        const container = _getOrCreatePage(pageId, page);
        container.classList.add('active');
        renderFn(container);
        return;
    }

    // Delegate to existing handlers
    _prevNavMore?.call(this, page);
};

// ── Also register in _navDirect switch ───────────────────────────────────────
// The _navDirect function uses _nav which calls _navDirect.
// Since seller pages are launched via _jmNavMore they bypass _navDirect entirely.
// This is intentional — seller pages are full-page overlays within the app.

console.log('[marketplace-seller.js] ✅ Seller module active — product approval workflow enforced');
})();
