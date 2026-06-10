/**
 * marketplace-admin.js — COMPLETE ADMIN COMMAND CENTER v1.0
 * ══════════════════════════════════════════════════════════
 * Full marketplace administration inside existing Tool module.
 * Role-gated: only visible to users with role === 'admin' or 'moderator'.
 *
 * Sections:
 *  1. Admin Dashboard  — KPIs, revenue chart, live activity
 *  2. Product Moderation — approve/reject/suspend products
 *  3. Seller Management — verify/ban/restore sellers
 *  4. Buyer Management — suspend/restore/credit wallet
 *  5. Order Management — view all orders, override status
 *  6. Returns & Refunds — approve/reject refunds
 *  7. Payout Management — approve/reject withdrawals
 *  8. Coupon Management — create/toggle/delete coupons
 *  9. Flash Sale Control — create/monitor/end flash sales
 * 10. Review Moderation — hide/delete reviews
 * 11. Analytics Center  — revenue, top products, categories
 * 12. Support Tickets   — view/resolve tickets
 * 13. Notifications     — send push/in-app notifications
 * 14. Settings Center   — platform-wide config
 * 15. Audit Log         — all admin action history
 * ══════════════════════════════════════════════════════════
 */

(function _AdminModule() {
'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────
const _esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _fmt  = n  => 'KES ' + parseFloat(n||0).toLocaleString('en-KE',{minimumFractionDigits:0,maximumFractionDigits:0});
const _date = d  => d ? new Date(d).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}) : '—';
const _time = d  => d ? new Date(d).toLocaleString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
const _ls   = { save:(k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v))}catch(_){} }, load:(k,d=null)=>{ try{const r=localStorage.getItem(k);return r?JSON.parse(r):d}catch(_){return d} } };

function _toast(msg, type='info', icon='ℹ️') {
    if (typeof window._jmToast === 'function') { window._jmToast(msg,type,icon); return; }
    const colors={success:'#22c55e',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
    let box=document.getElementById('adminToastBox');
    if(!box){box=document.createElement('div');box.id='adminToastBox';box.style.cssText='position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;width:min(380px,90vw)';document.body.appendChild(box);}
    const t=document.createElement('div');t.style.cssText=`background:${colors[type]||colors.info};color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;gap:10px`;t.innerHTML=`<span>${icon}</span><span>${msg}</span>`;box.appendChild(t);setTimeout(()=>t.remove(),3500);
}

async function _api(method, endpoint, body=null) {
    try {
        const token=window.__kynToken||window.__accessToken||localStorage.getItem('authToken')||localStorage.getItem('token')||localStorage.getItem('moodchat_token')||localStorage.getItem('accessToken')||'';
        const base=(window.__kynAPI?.baseUrl||'').replace(/\/api$/,'').replace(/\/$/,'')||(typeof window.__getApiBase==='function'?window.__getApiBase().replace(/\/api$/,''):'')||'';
        const res=await fetch(base+'/api'+endpoint,{method:method.toUpperCase(),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}, ...(body&&method!=='GET'?{body:JSON.stringify(body)}:{})});
        if(!res.ok){const e=await res.json().catch(()=>({message:'Error '+res.status}));return{_error:e.message||'Error',_status:res.status};}
        return await res.json();
    } catch(e){return {_error: e.message||'Network error', _offline: true};}
}

// ─── Admin role guard ─────────────────────────────────────────────────────────
function _isAdmin() {
    // P1 FIX: Client-side role check is supplementary only.
    // The server ALWAYS enforces admin at the route level (adminOnly middleware).
    // This client check only controls UI visibility — it is not a security boundary.
    const user = window.currentUser || window.__kynUser ||
                 window.__PARENT_SESSION__?.user ||
                 window.__kynAPI?.currentUser || {};
    if (user.role === 'admin' || user.role === 'moderator' || user.isAdmin === true) return true;
    // localStorage fallbacks (set by auth system after login)
    const lsRole = localStorage.getItem('userRole') || '';
    if (lsRole === 'admin' || lsRole === 'moderator') return true;
    if (window.__cachedUserRole === 'admin' || window.__cachedUserRole === 'moderator') return true;
    // NOTE: _adminMode dev bypass REMOVED — it was a security risk.
    // Use a real admin account for testing.
    return false;
}

// FIX 2: Listen for role updates from parent frame
window.addEventListener('message', function(e) {
    if (e.data?.type === 'USER_ROLE_UPDATE') {
        const role = e.data.role || 'user';
        const isAdmin = e.data.isAdmin || role === 'admin' || role === 'moderator';
        window.__cachedUserRole = role;
        localStorage.setItem('userRole', role);
        if (window.currentUser) { window.currentUser.role = role; window.currentUser.isAdmin = isAdmin; }
        if (window.__kynUser) { window.__kynUser.role = role; window.__kynUser.isAdmin = isAdmin; }
        // Re-check admin FAB/button visibility
        if (typeof window._jmEnsureAdminFab === 'function') window._jmEnsureAdminFab();
    }
    if (e.data?.type === 'SESSION_DATA' && e.data?.payload?.user) {
        const u = e.data.payload.user;
        if (u.role) { window.__cachedUserRole = u.role; localStorage.setItem('userRole', u.role); }
        if (!window.currentUser) window.currentUser = u;
        else { window.currentUser.role = u.role; window.currentUser.isAdmin = u.isAdmin; }
    }
});

// ─── Inject CSS ───────────────────────────────────────────────────────────────
(function _css() {
    if (document.getElementById('adminModuleCSS')) return;
    const s = document.createElement('style'); s.id = 'adminModuleCSS';
    s.textContent = `
    @keyframes adm-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes adm-pulse{0%,100%{opacity:1}50%{opacity:.5}}

    .adm-page{animation:adm-in .3s ease}
    .adm-header{background:#111;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:10;flex-shrink:0}
    .adm-back{width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,255,255,.12);cursor:pointer;font-size:14px;color:#fff}
    .adm-title{font-weight:800;font-size:15px;flex:1}
    .adm-badge-live{background:#22c55e;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:800;letter-spacing:.5px}
    .adm-body{flex:1;overflow-y:auto;padding:0 0 80px;background:#f3f4f6}

    /* KPI cards */
    .adm-kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 16px}
    .adm-kpi{background:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .adm-kpi.accent{background:linear-gradient(135deg,#111,#374151);color:#fff}
    .adm-kpi-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin-bottom:4px}
    .adm-kpi.accent .adm-kpi-label{color:rgba(255,255,255,.65)}
    .adm-kpi-val{font-size:22px;font-weight:900;color:#111;letter-spacing:-.5px}
    .adm-kpi.accent .adm-kpi-val{color:#fff}
    .adm-kpi-sub{font-size:11px;color:#6b7280;margin-top:3px}
    .adm-kpi.accent .adm-kpi-sub{color:rgba(255,255,255,.6)}

    /* Section card */
    .adm-section{background:#fff;border-radius:16px;margin:0 12px 12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .adm-section-title{font-weight:800;font-size:14px;color:#111;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between}

    /* Status badges */
    .adm-badge{display:inline-flex;align-items:center;gap:3px;border-radius:20px;padding:3px 9px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}
    .adm-badge.green{background:#d1fae5;color:#065f46}
    .adm-badge.red{background:#fee2e2;color:#991b1b}
    .adm-badge.yellow{background:#fef3c7;color:#92400e}
    .adm-badge.blue{background:#dbeafe;color:#1e40af}
    .adm-badge.gray{background:#f3f4f6;color:#6b7280}
    .adm-badge.purple{background:#ede9fe;color:#5b21b6}
    .adm-badge.live{background:#22c55e;color:#fff;animation:adm-pulse 2s infinite}

    /* Row */
    .adm-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f9fafb}
    .adm-row:last-child{border-bottom:none}
    .adm-row-img{width:48px;height:48px;border-radius:8px;object-fit:cover;background:#f3f4f6;flex-shrink:0}
    .adm-row-placeholder{width:48px;height:48px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
    .adm-row-title{font-size:13px;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .adm-row-sub{font-size:11px;color:#6b7280;margin-top:2px}
    .adm-row-price{font-size:14px;font-weight:800;color:#f57224;flex-shrink:0;text-align:right}

    /* Buttons */
    .adm-btn{border:none;border-radius:8px;padding:7px 14px;font-weight:700;font-size:12px;cursor:pointer;transition:all .15s;white-space:nowrap}
    .adm-btn-primary{background:#111;color:#fff}
    .adm-btn-primary:hover{background:#374151}
    .adm-btn-success{background:#d1fae5;color:#065f46}
    .adm-btn-danger{background:#fee2e2;color:#ef4444}
    .adm-btn-warning{background:#fef3c7;color:#92400e}
    .adm-btn-secondary{background:#f3f4f6;color:#374151}
    .adm-btn-full{width:100%;padding:12px;font-size:14px;border-radius:12px;display:block;text-align:center;margin-top:8px}

    /* Chart bars */
    .adm-chart{height:130px;background:#f9fafb;border-radius:10px;display:flex;align-items:flex-end;gap:3px;padding:12px 8px 6px;overflow:hidden;margin-top:8px}
    .adm-bar{flex:1;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#374151,#111);min-height:3px;transition:height .6s ease;cursor:pointer;position:relative}
    .adm-bar:hover::after{content:attr(data-v);position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:#111;color:#fff;font-size:9px;padding:2px 5px;border-radius:3px;white-space:nowrap}
    .adm-chart-labels{display:flex;gap:3px;padding:0 8px;margin-top:3px}
    .adm-chart-label{flex:1;text-align:center;font-size:8px;color:#9ca3af;overflow:hidden}

    /* Table */
    .adm-table-wrap{overflow-x:auto;margin-top:8px}
    .adm-table{width:100%;border-collapse:collapse;font-size:12px;min-width:400px}
    .adm-table th{text-align:left;padding:8px 10px;font-size:10px;font-weight:800;text-transform:uppercase;color:#9ca3af;border-bottom:2px solid #f3f4f6;background:#fafafa;white-space:nowrap}
    .adm-table td{padding:10px;border-bottom:1px solid #f9fafb;vertical-align:middle}
    .adm-table tr:hover td{background:#fafafa}

    /* Search / filter bar */
    .adm-search-bar{display:flex;gap:8px;padding:10px 12px;background:#fff;border-bottom:1px solid #f3f4f6;flex-shrink:0;position:sticky;top:50px;z-index:9}
    .adm-search-input{flex:1;border:1.5px solid #e5e7eb;border-radius:10px;padding:9px 14px;font-size:13px;outline:none}
    .adm-search-input:focus{border-color:#111}
    .adm-filter-btn{background:#f3f4f6;border:none;border-radius:10px;padding:9px 14px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;color:#374151}
    .adm-filter-btn.active{background:#111;color:#fff}

    /* Modal overlay */
    .adm-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99000;display:flex;align-items:flex-end;justify-content:center}
    .adm-modal{background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px;max-height:85vh;overflow-y:auto}
    .adm-modal-title{font-weight:800;font-size:16px;margin-bottom:14px}
    .adm-modal input,.adm-modal textarea,.adm-modal select{width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:14px;box-sizing:border-box;margin-bottom:10px;outline:none}
    .adm-modal input:focus,.adm-modal textarea:focus,.adm-modal select:focus{border-color:#111}
    .adm-modal textarea{resize:none;height:80px}

    /* Nav menu */
    .adm-nav{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px}
    .adm-nav-item{background:#fff;border-radius:12px;padding:12px 8px;text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.06);border:none;transition:all .2s}
    .adm-nav-item:hover{background:#111;color:#fff}
    .adm-nav-item:hover .adm-nav-icon{background:rgba(255,255,255,.15)}
    .adm-nav-icon{font-size:20px;margin-bottom:4px;display:block}
    .adm-nav-label{font-size:11px;font-weight:700;color:inherit}
    .adm-nav-badge{background:#ef4444;color:#fff;border-radius:20px;padding:1px 6px;font-size:9px;font-weight:900;display:inline-block;margin-left:4px}

    /* Quick action product card (approval) */
    .adm-product-card{background:#fff;border-radius:14px;margin-bottom:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .adm-product-card-img{width:100%;height:150px;object-fit:cover;background:#f3f4f6}
    .adm-product-card-body{padding:12px 16px}
    .adm-product-card-title{font-weight:800;font-size:14px;margin-bottom:3px}
    .adm-product-card-meta{font-size:12px;color:#6b7280;margin-bottom:10px}
    .adm-product-card-actions{display:flex;gap:8px}

    /* Payout row */
    .adm-payout-row{background:#f9fafb;border-radius:10px;padding:12px;margin-bottom:8px}

    /* Settings form */
    .adm-settings-row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #f9fafb}
    .adm-settings-label{font-size:13px;font-weight:700;color:#111}
    .adm-settings-sub{font-size:11px;color:#9ca3af;margin-top:2px}
    .adm-settings-val{font-size:14px;font-weight:800;color:#374151;text-align:right}

    /* No-access screen */
    .adm-no-access{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center}
    `;
    document.head.appendChild(s);
})();

// ─── Page creation helper ─────────────────────────────────────────────────────
function _getOrCreateAdminPage(pageId) {
    let el = document.getElementById(pageId);
    if (!el) {
        el = document.createElement('div');
        el.id = pageId;
        el.className = 'jm-page';
        const wrapper = document.getElementById('sidebar') ||
                        document.querySelector('.sidebar') ||
                        document.querySelector('.app-container') ||
                        document.body;
        wrapper.appendChild(el);
    }
    return el;
}

function _pageShell(titleText, content, backPage='admin-dashboard') {
    return `<div class="adm-page" style="display:flex;flex-direction:column;height:100%">
        <div class="adm-header">
            <button class="adm-back" onclick="window._jmNavMore('${backPage}')">←</button>
            <div class="adm-title">⚙️ ${titleText}</div>
            <span class="adm-badge-live">ADMIN</span>
        </div>
        <div class="adm-body">${content}</div>
    </div>`;
}

function _noAccess() {
    return `<div class="adm-no-access">
        <div style="font-size:48px;margin-bottom:16px">🔒</div>
        <div style="font-size:18px;font-weight:800;color:#111;margin-bottom:8px">Admin Access Required</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:20px">You need admin or moderator role to access this area.</div>
        <button class="adm-btn adm-btn-primary adm-btn-full" onclick="window._jmNav('home')">Back to Marketplace</button>
        <button class="adm-btn adm-btn-secondary adm-btn-full" onclick="window._adminDevMode()">Dev Mode (Admin)</button>
    </div>`;
}

// NOTE: _adminDevMode() bypass removed (P1 security fix).
// Use a real admin account (role='admin') for testing admin features.

// ══════════════════════════════════════════════════════════════════════════════
// 1. ADMIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminDashboard(container) {
    if (!_isAdmin()) { container.innerHTML = _pageShell('Admin Panel', _noAccess()); return; }
    container.innerHTML = _pageShell('Command Center', `<div style="padding:20px;text-align:center">⏳ Loading…</div>`);

    const r = await _api('GET', '/marketplace/admin/stats/full');
    const d = r?.data || { revenue:{today:0,week:0,month:0,total:0,by_day:[]}, users:{total:0,sellers:0,buyers:0}, products:{total:0,pending:0}, orders:{total:0,today:0,pending:0,breakdown:{}} };

    const byDay = d.revenue?.by_day || [];
    const maxR  = byDay.length ? Math.max(...byDay.map(x=>x.revenue||0), 1) : 1;

    container.innerHTML = _pageShell('Command Center', `
    <!-- KPI Grid -->
    <div class="adm-kpi-grid">
        <div class="adm-kpi accent">
            <div class="adm-kpi-label">Total Revenue</div>
            <div class="adm-kpi-val">${_fmt(d.revenue?.total||0)}</div>
            <div class="adm-kpi-sub">Platform fees: ${_fmt((d.revenue?.total||0)*0.1)}</div>
        </div>
        <div class="adm-kpi accent">
            <div class="adm-kpi-label">Today's Revenue</div>
            <div class="adm-kpi-val">${_fmt(d.revenue?.today||0)}</div>
            <div class="adm-kpi-sub">${d.orders?.today||0} orders today</div>
        </div>
        <div class="adm-kpi">
            <div class="adm-kpi-label">Total Users</div>
            <div class="adm-kpi-val">${(d.users?.total||0).toLocaleString()}</div>
            <div class="adm-kpi-sub">${d.users?.buyers||0} buyers · ${d.users?.sellers||0} sellers</div>
        </div>
        <div class="adm-kpi">
            <div class="adm-kpi-label">Pending Products</div>
            <div class="adm-kpi-val" style="color:${(d.products?.pending||0)>0?'#f59e0b':'#22c55e'}">${d.products?.pending||0}</div>
            <div class="adm-kpi-sub">Awaiting your review</div>
        </div>
        <div class="adm-kpi">
            <div class="adm-kpi-label">Monthly Revenue</div>
            <div class="adm-kpi-val">${_fmt(d.revenue?.month||0)}</div>
            <div class="adm-kpi-sub">Last 30 days</div>
        </div>
        <div class="adm-kpi">
            <div class="adm-kpi-label">Pending Orders</div>
            <div class="adm-kpi-val" style="color:${(d.orders?.pending||0)>0?'#f59e0b':'#22c55e'}">${d.orders?.pending||0}</div>
            <div class="adm-kpi-sub">${d.orders?.total||0} total orders</div>
        </div>
    </div>

    <!-- Revenue chart -->
    <div class="adm-section">
        <div class="adm-section-title">Revenue — Last 7 Days</div>
        <div class="adm-chart">
            ${byDay.map(x=>`<div class="adm-bar" style="height:${maxR>0?Math.max(4,Math.round((x.revenue/maxR)*100)):4}%" data-v="${_fmt(x.revenue)}"></div>`).join('')}
        </div>
        <div class="adm-chart-labels">${byDay.map(x=>`<div class="adm-chart-label">${x.day||x.date?.slice(5)||''}</div>`).join('')}</div>
    </div>

    <!-- Quick navigation -->
    <div class="adm-section">
        <div class="adm-section-title">Modules</div>
        <div class="adm-nav">
            ${[
                ['admin-products',  '📦', 'Products', d.products?.pending||0],
                ['admin-sellers',   '🏪', 'Sellers', 0],
                ['admin-buyers',    '👥', 'Buyers', 0],
                ['admin-orders',    '🛍️', 'Orders', d.orders?.pending||0],
                ['admin-returns',   '↩️', 'Returns', 0],
                ['admin-payouts',   '💰', 'Payouts', 0],
                ['admin-coupons',   '🎟️', 'Coupons', 0],
                ['admin-flash',     '⚡', 'Flash Sales', 0],
                ['admin-reviews',   '⭐', 'Reviews', 0],
                ['admin-analytics', '📈', 'Analytics', 0],
                ['admin-tickets',   '🎧', 'Support', 0],
                ['admin-notify',    '🔔', 'Notify', 0],
                ['admin-settings',  '⚙️', 'Settings', 0],
                ['admin-audit',     '📋', 'Audit Log', 0],
                ['admin-approval',  '✅', 'Approve', d.products?.pending||0],
            ].map(([page,icon,label,badge])=>`
            <button class="adm-nav-item" onclick="window._jmNavMore('${page}')">
                <span class="adm-nav-icon">${icon}</span>
                <span class="adm-nav-label">${label}${badge>0?`<span class="adm-nav-badge">${badge}</span>`:''}</span>
            </button>`).join('')}
        </div>
    </div>

    <!-- Order breakdown -->
    <div class="adm-section">
        <div class="adm-section-title">Order Status Breakdown</div>
        ${Object.entries(d.orders?.breakdown||{}).map(([s,c])=>{
            const colors={pending:'yellow',confirmed:'blue',shipped:'purple',delivered:'green',cancelled:'red',refunded:'gray'};
            return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #f9fafb">
                <span class="adm-badge ${colors[s]||'gray'}">${s}</span>
                <div style="flex:1;background:#f3f4f6;border-radius:4px;height:6px;overflow:hidden"><div style="height:100%;background:#374151;width:${d.orders.total>0?Math.round((c/d.orders.total)*100):0}%;border-radius:4px"></div></div>
                <span style="font-size:13px;font-weight:800;color:#111;min-width:30px;text-align:right">${c}</span>
            </div>`;
        }).join('') || '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:12px">No order data</div>'}
    </div>
    `);
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. PRODUCT MODERATION
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminProducts(container) {
    if (!_isAdmin()) { container.innerHTML = _pageShell('Products', _noAccess()); return; }
    container.innerHTML = _pageShell('Product Management', `<div style="padding:20px;text-align:center">⏳</div>`);

    let filter = 'pending';
    async function load(f) {
        filter = f;
        const r = await _api('GET', `/marketplace/admin/products?approval_status=${f}&limit=30`);
        const products = r?.data?.products || [];
        const total = r?.data?.total || 0;

        const statusMap = {pending:'yellow',approved:'green',rejected:'red',suspended:'gray'};
        container.innerHTML = _pageShell('Product Management', `
        <div class="adm-search-bar">
            ${['pending','approved','rejected','suspended'].map(s=>`<button class="adm-filter-btn ${filter===s?'active':''}" onclick="(${load.toString()})('${s}')">${s.charAt(0).toUpperCase()+s.slice(1)}</button>`).join('')}
        </div>
        <div style="padding:10px 12px;font-size:12px;color:#6b7280">${total} products</div>
        <div style="padding:0 12px">
        ${products.length ? products.map(p => {
            const img = p.image || (Array.isArray(p.images)?p.images[0]:'') || '';
            return `<div class="adm-product-card">
                ${img?`<img class="adm-product-card-img" src="${_esc(img)}" loading="lazy">`:`<div class="adm-product-card-img" style="display:flex;align-items:center;justify-content:center;font-size:40px">📦</div>`}
                <div class="adm-product-card-body">
                    <div class="adm-product-card-title">${_esc(p.title||'Untitled')}</div>
                    <div class="adm-product-card-meta">
                        ${_fmt(p.price)} · ${_esc(p.category||'')} · Submitted ${_date(p.submitted_at||p.created_at)}
                        ${p.brand?` · <b>${_esc(p.brand)}</b>`:''}
                    </div>
                    ${p.description?`<div style="font-size:12px;color:#374151;line-height:1.5;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${_esc(p.description)}</div>`:''}
                    ${(p.metadata?.materials||[]).length?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${(p.metadata.materials).map(m=>`<span style="background:#f3f4f6;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:600">${_esc(m)}</span>`).join('')}</div>`:''}
                    <div class="adm-product-card-actions">
                        ${filter==='pending'?`
                        <button class="adm-btn adm-btn-success" onclick="window._admApprove('${p.id}')">✅ Approve</button>
                        <button class="adm-btn adm-btn-danger" onclick="window._admRejectModal('${p.id}','${_esc(p.title||'')}')">❌ Reject</button>
                        `:''}
                        ${filter==='approved'?`<button class="adm-btn adm-btn-warning" onclick="window._admSuspendProduct('${p.id}')">⏸️ Suspend</button>`:''}
                        ${filter==='suspended'?`<button class="adm-btn adm-btn-success" onclick="window._admApprove('${p.id}')">▶️ Restore</button>`:''}
                        <button class="adm-btn adm-btn-danger" onclick="window._admDeleteProduct('${p.id}')">🗑️</button>
                    </div>
                </div>
            </div>`;
        }).join('') : `<div style="padding:40px;text-align:center;color:#9ca3af"><div style="font-size:40px;margin-bottom:10px">✅</div>No ${filter} products</div>`}
        </div>`);
    }
    load('pending');
}

window._admApprove = async (id) => {
    const r = await _api('POST', `/marketplace/admin/products/${id}/approve`);
    if (r&&!r._error) { _toast('Product approved and live!','success','✅'); window._jmNavMore('admin-products'); }
    else _toast(r?._error||'Failed','error','❌');
};
window._admSuspendProduct = async (id) => {
    if (!confirm('Suspend this product?')) return;
    await _api('POST', `/marketplace/admin/products/${id}/suspend`);
    _toast('Product suspended','info','⏸️'); window._jmNavMore('admin-products');
};
window._admDeleteProduct = async (id) => {
    if (!confirm('Permanently remove this product?')) return;
    await _api('DELETE', `/marketplace/admin/products/${id}`);
    _toast('Product removed','info','🗑️'); window._jmNavMore('admin-products');
};
window._admRejectModal = function(id, title) {
    document.getElementById('admRejectModal')?.remove();
    const ov = document.createElement('div'); ov.id='admRejectModal'; ov.className='adm-modal-overlay';
    ov.innerHTML = `<div class="adm-modal">
        <div class="adm-modal-title">❌ Reject: ${_esc(title)}</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:10px">Give the seller a clear reason so they can improve their listing:</div>
        <textarea id="admRejectReason" placeholder="e.g., Images are blurry. Please upload clear product photos with good lighting and white background."></textarea>
        <div style="display:flex;gap:8px;margin-top:6px">
            <button class="adm-btn adm-btn-danger adm-btn-full" onclick="window._admReject('${id}')">Confirm Rejection</button>
            <button class="adm-btn adm-btn-secondary adm-btn-full" onclick="document.getElementById('admRejectModal')?.remove()">Cancel</button>
        </div>
    </div>`;
    document.body.appendChild(ov);
};
window._admReject = async (id) => {
    const reason = document.getElementById('admRejectReason')?.value?.trim() || 'Does not meet marketplace standards';
    document.getElementById('admRejectModal')?.remove();
    const r = await _api('POST', `/marketplace/admin/products/${id}/reject`, { reason });
    if (r&&!r._error) { _toast('Product rejected. Seller notified.','info','❌'); window._jmNavMore('admin-products'); }
    else _toast(r?._error||'Failed','error','❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 3. SELLER MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminSellers(container) {
    if (!_isAdmin()) { container.innerHTML = _pageShell('Sellers', _noAccess()); return; }
    const r = await _api('GET', '/marketplace/admin/sellers?limit=50');
    const sellers = r?.data?.sellers || [];

    container.innerHTML = _pageShell('Seller Management', `
    <div class="adm-search-bar">
        <input class="adm-search-input" placeholder="Search sellers…" oninput="window._admSearchSellers(this.value)">
    </div>
    <div style="padding:8px 12px;font-size:12px;color:#6b7280">${r?.data?.total||sellers.length} sellers</div>
    <div id="admSellersList" style="padding:0 12px">
    ${sellers.map(s => `<div class="adm-row">
        <div class="adm-row-placeholder">🏪</div>
        <div style="flex:1;min-width:0">
            <div class="adm-row-title">${_esc(s.name||s.email||'Seller')}</div>
            <div class="adm-row-sub">${_esc(s.email||'')} · Joined ${_date(s.joined)}</div>
            <span class="adm-badge ${s.kyc_status==='approved'?'green':s.kyc_status==='pending'?'yellow':'gray'}">${s.kyc_status||'unverified'}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
            ${s.kyc_status!=='approved'?`<button class="adm-btn adm-btn-success" onclick="window._admVerifySeller('${s.id}',true)">Verify</button>`:''}
            <button class="adm-btn adm-btn-danger" onclick="window._admBanSeller('${s.id}')">Ban</button>
        </div>
    </div>`).join('') || '<div style="padding:30px;text-align:center;color:#9ca3af">No sellers found</div>'}
    </div>`);
}

window._admVerifySeller = async (id, approved) => {
    const reason = approved ? '' : (prompt('Rejection reason:') || '');
    const r = await _api('POST', `/marketplace/admin/sellers/${id}/verify`, { approved, reason });
    if (r&&!r._error) { _toast(approved?'Seller verified!':'Seller rejected','success',approved?'✅':'❌'); window._jmNavMore('admin-sellers'); }
};
window._admBanSeller = async (id) => {
    if (!confirm('Ban this seller? Their products will be suspended.')) return;
    await _api('POST', `/marketplace/admin/sellers/${id}/ban`);
    _toast('Seller banned','info','🚫'); window._jmNavMore('admin-sellers');
};
window._admSearchSellers = async (q) => {
    clearTimeout(window._admSellerSearchTimer);
    window._admSellerSearchTimer = setTimeout(async () => {
        const r = await _api('GET', `/marketplace/admin/sellers?q=${encodeURIComponent(q)}&limit=30`);
        const sellers = r?.data?.sellers || [];
        const list = document.getElementById('admSellersList');
        if (list) list.innerHTML = sellers.map(s=>`<div class="adm-row"><div class="adm-row-placeholder">🏪</div><div style="flex:1;min-width:0"><div class="adm-row-title">${_esc(s.name||s.email)}</div><div class="adm-row-sub">${_esc(s.email)} · ${_date(s.joined)}</div><span class="adm-badge ${s.kyc_status==='approved'?'green':'yellow'}">${s.kyc_status||'unverified'}</span></div><button class="adm-btn adm-btn-danger" onclick="window._admBanSeller('${s.id}')">Ban</button></div>`).join('') || '<div style="padding:20px;text-align:center;color:#9ca3af">No results</div>';
    }, 400);
};

// ══════════════════════════════════════════════════════════════════════════════
// 4. BUYER MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminBuyers(container) {
    if (!_isAdmin()) { container.innerHTML = _pageShell('Buyers', _noAccess()); return; }
    const r = await _api('GET', '/marketplace/admin/buyers?limit=50');
    const buyers = r?.data?.buyers || [];

    container.innerHTML = _pageShell('Buyer Management', `
    <div class="adm-search-bar">
        <input class="adm-search-input" placeholder="Search buyers…" oninput="window._admSearchBuyers(this.value)">
    </div>
    <div id="admBuyersList" style="padding:0 12px;margin-top:8px">
    ${buyers.map(b => `<div class="adm-row">
        <div class="adm-row-placeholder">👤</div>
        <div style="flex:1;min-width:0">
            <div class="adm-row-title">${_esc(b.name||b.email)}</div>
            <div class="adm-row-sub">${b.total_orders} orders · ${_fmt(b.total_spent)} spent · <span style="text-transform:capitalize">${b.loyalty_tier}</span></div>
            <div class="adm-row-sub">Wallet: ${_fmt(b.wallet_balance)} · ${b.loyalty_points} pts</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
            <button class="adm-btn adm-btn-success" onclick="window._admCreditBuyer('${b.id}')">💳 Credit</button>
            <button class="adm-btn adm-btn-danger" onclick="window._admSuspendBuyer('${b.id}')">Suspend</button>
        </div>
    </div>`).join('') || '<div style="padding:30px;text-align:center;color:#9ca3af">No buyers found</div>'}
    </div>`);
}

window._admSearchBuyers = async (q) => {
    clearTimeout(window._admBuyerTimer);
    window._admBuyerTimer = setTimeout(async () => {
        const r = await _api('GET', `/marketplace/admin/buyers?q=${encodeURIComponent(q)}&limit=30`);
        const buyers = r?.data?.buyers || [];
        const list = document.getElementById('admBuyersList');
        if (list) list.innerHTML = buyers.map(b=>`<div class="adm-row"><div class="adm-row-placeholder">👤</div><div style="flex:1;min-width:0"><div class="adm-row-title">${_esc(b.name||b.email)}</div><div class="adm-row-sub">${b.total_orders} orders · ${_fmt(b.total_spent)}</div></div><button class="adm-btn adm-btn-success" onclick="window._admCreditBuyer('${b.id}')">💳</button></div>`).join('') || '<div style="padding:20px;text-align:center;color:#9ca3af">No results</div>';
    }, 400);
};
window._admSuspendBuyer = async (id) => {
    if (!confirm('Suspend this buyer account?')) return;
    await _api('POST', `/marketplace/admin/buyers/${id}/suspend`);
    _toast('Buyer suspended','info','🚫'); window._jmNavMore('admin-buyers');
};
window._admCreditBuyer = async (id) => {
    const amount = prompt('Credit wallet amount (KES):');
    if (!amount || isNaN(amount)) return;
    const reason = prompt('Reason (optional):') || 'Admin credit';
    const r = await _api('POST', `/marketplace/admin/buyers/${id}/credit-wallet`, { amount:parseFloat(amount), reason });
    if (r&&!r._error) _toast(`KES ${amount} credited to wallet!`,'success','💳');
    else _toast(r?._error||'Failed','error','❌');
};

// ══════════════════════════════════════════════════════════════════════════════
// 5. ORDER MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminOrders(container) {
    if (!_isAdmin()) { container.innerHTML = _pageShell('Orders', _noAccess()); return; }
    const r = await _api('GET', '/marketplace/admin/orders?limit=50');
    const orders = r?.data?.orders || [];

    const statusColor = {pending:'yellow',confirmed:'blue',shipped:'purple',delivered:'green',cancelled:'red',refunded:'gray',out_for_delivery:'purple'};
    container.innerHTML = _pageShell('Order Management', `
    <div class="adm-search-bar">
        ${['all','pending','shipped','delivered','cancelled'].map(s=>`<button class="adm-filter-btn" onclick="window._admLoadOrders('${s}')">${s}</button>`).join('')}
    </div>
    <div id="admOrdersList" style="padding:0 12px;margin-top:8px">
    ${orders.map(o => {
        const items = o.metadata?.items || o.items || [];
        return `<div style="background:#f9fafb;border-radius:12px;padding:12px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
                <div>
                    <div style="font-size:13px;font-weight:800">#${String(o.id||'').slice(-9)}</div>
                    <div style="font-size:11px;color:#6b7280;margin-top:2px">${_time(o.createdAt||o.created_at)}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:14px;font-weight:900;color:#f57224">${_fmt(o.totalPrice||o.total_price||0)}</div>
                    <span class="adm-badge ${statusColor[o.status]||'gray'}">${o.status}</span>
                </div>
            </div>
            <div style="font-size:12px;color:#374151;margin-bottom:8px">${items.length} item${items.length!==1?'s':''} · Pay: ${o.paymentMethod||o.payment_method||'—'}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="adm-btn adm-btn-secondary" onclick="window._admOverrideOrder('${o.id}')">⚙️ Override Status</button>
                ${o.status==='pending'?`<button class="adm-btn adm-btn-danger" onclick="window._admCancelOrder('${o.id}')">Cancel</button>`:''}
            </div>
        </div>`;
    }).join('') || '<div style="padding:30px;text-align:center;color:#9ca3af">No orders found</div>'}
    </div>`);
}

window._admLoadOrders = async (status) => {
    const endpoint = status==='all'?'/marketplace/admin/orders?limit=50':`/marketplace/admin/orders?status=${status}&limit=50`;
    const r = await _api('GET', endpoint);
    const orders = r?.data?.orders || [];
    const list = document.getElementById('admOrdersList');
    if (!list) return;
    const statusColor = {pending:'yellow',confirmed:'blue',shipped:'purple',delivered:'green',cancelled:'red',refunded:'gray'};
    list.innerHTML = orders.map(o=>`<div style="background:#f9fafb;border-radius:12px;padding:12px;margin-bottom:8px"><div style="display:flex;justify-content:space-between"><div style="font-size:13px;font-weight:800">#${String(o.id||'').slice(-9)}</div><div><span style="font-size:14px;font-weight:900;color:#f57224">${_fmt(o.totalPrice||0)}</span><span class="adm-badge ${statusColor[o.status]||'gray'}" style="margin-left:8px">${o.status}</span></div></div><div style="margin-top:8px;display:flex;gap:6px"><button class="adm-btn adm-btn-secondary" onclick="window._admOverrideOrder('${o.id}')">Override</button></div></div>`).join('') || '<div style="padding:20px;text-align:center;color:#9ca3af">No orders</div>';
};
window._admOverrideOrder = async (id) => {
    const status = prompt('New status (pending/confirmed/shipped/out_for_delivery/delivered/cancelled/refunded):');
    if (!status) return;
    const note = prompt('Admin note (optional):') || '';
    const r = await _api('PUT', `/marketplace/admin/orders/${id}/status`, { status, note });
    if (r&&!r._error) { _toast(`Order status → ${status}`,'success','✅'); window._jmNavMore('admin-orders'); }
    else _toast(r?._error||'Failed','error','❌');
};
window._admCancelOrder = async (id) => {
    if (!confirm('Cancel this order?')) return;
    await _api('PUT', `/marketplace/admin/orders/${id}/status`, { status:'cancelled', note:'Admin cancelled' });
    _toast('Order cancelled','info','❌'); window._jmNavMore('admin-orders');
};

// ══════════════════════════════════════════════════════════════════════════════
// 6. RETURNS & REFUNDS
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminReturns(container) {
    if (!_isAdmin()) { container.innerHTML = _pageShell('Returns', _noAccess()); return; }
    const r = await _api('GET', '/marketplace/admin/returns');
    const returns = r?.data?.returns || [];

    container.innerHTML = _pageShell('Returns & Refunds', `
    <div style="padding:12px">
    ${returns.length ? returns.map(ret=>`<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <div style="font-size:13px;font-weight:800">Order #${String(ret.order_id||'').slice(-8)}</div>
            <span class="adm-badge ${ret.status==='pending'?'yellow':ret.status==='refunded'?'green':'red'}">${ret.status}</span>
        </div>
        <div style="font-size:12px;color:#374151;margin-bottom:4px"><b>Reason:</b> ${_esc(ret.reason||'—')}</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px">Amount: ${_fmt(ret.total)} · ${_date(ret.requested_at)}</div>
        ${ret.status==='pending'?`<div style="display:flex;gap:8px">
            <button class="adm-btn adm-btn-success" onclick="window._admApproveRefund('${ret.order_id}')">✅ Approve Refund</button>
            <button class="adm-btn adm-btn-danger" onclick="window._admRejectRefund('${ret.order_id}')">❌ Reject</button>
        </div>`:''}
    </div>`).join('') : '<div style="padding:40px;text-align:center;color:#9ca3af"><div style="font-size:40px;margin-bottom:10px">✅</div>No return requests</div>'}
    </div>`);
}

window._admApproveRefund = async (id) => {
    const r = await _api('POST', `/marketplace/admin/returns/${id}/process`, { approve:true });
    if (r&&!r._error) { _toast('Refund approved — buyer wallet credited','success','✅'); window._jmNavMore('admin-returns'); }
    else _toast(r?._error||'Failed','error','❌');
};
window._admRejectRefund = async (id) => {
    const reason = prompt('Reason for rejection:') || '';
    const r = await _api('POST', `/marketplace/admin/returns/${id}/process`, { approve:false, reason });
    if (r&&!r._error) { _toast('Refund rejected','info','❌'); window._jmNavMore('admin-returns'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 7. PAYOUT MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminPayouts(container) {
    if (!_isAdmin()) { container.innerHTML = _pageShell('Payouts', _noAccess()); return; }
    const r = await _api('GET', '/marketplace/admin/payouts');
    const payouts = r?.data?.payouts || [];
    const pending = payouts.filter(p=>p.status==='pending');

    container.innerHTML = _pageShell('Payout Management', `
    <div style="background:linear-gradient(135deg,#111,#374151);color:#fff;margin:12px;border-radius:14px;padding:16px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;opacity:.7;margin-bottom:4px">Pending Payouts</div>
        <div style="font-size:28px;font-weight:900">${pending.length} requests</div>
        <div style="font-size:13px;opacity:.8;margin-top:2px">Total: ${_fmt(pending.reduce((s,p)=>s+(p.amount||0),0))}</div>
    </div>
    <div style="padding:0 12px">
    ${payouts.map(p=>`<div class="adm-payout-row">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
            <div>
                <div style="font-size:13px;font-weight:800">${_esc(p.seller_name||'Seller')}</div>
                <div style="font-size:11px;color:#6b7280">${_esc(p.method?.toUpperCase()||'MPESA')} · ${_date(p.requested_at)}</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:15px;font-weight:900;color:#f57224">${_fmt(p.amount||0)}</div>
                <span class="adm-badge ${p.status==='completed'?'green':p.status==='rejected'?'red':'yellow'}">${p.status}</span>
            </div>
        </div>
        ${p.status==='pending'?`<div style="display:flex;gap:8px;margin-top:8px">
            <button class="adm-btn adm-btn-success" onclick="window._admPayoutApprove('${p.seller_id}','${p.id}')">✅ Release</button>
            <button class="adm-btn adm-btn-danger" onclick="window._admPayoutReject('${p.seller_id}','${p.id}')">❌ Reject</button>
        </div>`:''}
    </div>`).join('') || '<div style="padding:30px;text-align:center;color:#9ca3af">No payout requests</div>'}
    </div>`);
}

window._admPayoutApprove = async (sellerId, payoutId) => {
    const r = await _api('POST', '/marketplace/admin/payouts/process', { seller_id:sellerId, payout_id:payoutId, approve:true });
    if (r&&!r._error) { _toast('Payout released!','success','💸'); window._jmNavMore('admin-payouts'); }
    else _toast(r?._error||'Failed','error','❌');
};
window._admPayoutReject = async (sellerId, payoutId) => {
    const note = prompt('Reason for rejection:') || '';
    const r = await _api('POST', '/marketplace/admin/payouts/process', { seller_id:sellerId, payout_id:payoutId, approve:false, note });
    if (r&&!r._error) { _toast('Payout rejected','info','❌'); window._jmNavMore('admin-payouts'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 8. COUPON MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminCoupons(container) {
    if (!_isAdmin()) { container.innerHTML = _pageShell('Coupons', _noAccess()); return; }
    const r = await _api('GET', '/marketplace/admin/coupons');
    const coupons = r?.data?.coupons || [];
    const typeColors={percent:'#3b82f6',fixed:'#8b5cf6',free_shipping:'#22c55e',cashback:'#f59e0b'};

    container.innerHTML = _pageShell('Coupon Management', `
    <div style="padding:12px">
        <button class="adm-btn adm-btn-primary adm-btn-full" onclick="window._admCreateCouponModal()">+ Create Coupon</button>
    </div>
    <div style="padding:0 12px">
    ${coupons.map(c=>`<div style="background:#fff;border-radius:14px;margin-bottom:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);display:flex">
        <div style="width:8px;background:${typeColors[c.type]||'#9ca3af'};flex-shrink:0"></div>
        <div style="flex:1;padding:12px 14px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                    <div style="font-size:16px;font-weight:900;letter-spacing:1px">${_esc(c.code||'')}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:2px">${_esc(c.description||'')}</div>
                    <div style="font-size:11px;color:#9ca3af;margin-top:4px">Min: ${_fmt(c.minOrderAmt||0)} · Used: ${c.usageCount||0}/${c.usageLimit||'∞'}</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
                    <span class="adm-badge ${c.isActive?'green':'gray'}">${c.isActive?'Active':'Inactive'}</span>
                    <div style="display:flex;gap:4px;margin-top:4px">
                        <button class="adm-btn adm-btn-warning" style="padding:4px 8px;font-size:10px" onclick="window._admToggleCoupon('${c.id||c.code}')">Toggle</button>
                        <button class="adm-btn adm-btn-danger" style="padding:4px 8px;font-size:10px" onclick="window._admDeleteCoupon('${c.id||c.code}')">Del</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`).join('') || '<div style="padding:30px;text-align:center;color:#9ca3af">No coupons yet</div>'}
    </div>`);
}

window._admCreateCouponModal = function() {
    document.getElementById('admCouponModal')?.remove();
    const ov = document.createElement('div'); ov.id='admCouponModal'; ov.className='adm-modal-overlay';
    ov.innerHTML = `<div class="adm-modal">
        <div class="adm-modal-title">🎟️ Create Coupon</div>
        <input id="admCCode" placeholder="Code (e.g., SAVE10) *" style="text-transform:uppercase">
        <select id="admCType"><option value="percent">Percentage (%)</option><option value="fixed">Fixed Amount (KES)</option><option value="free_shipping">Free Shipping</option><option value="cashback">Cashback</option></select>
        <input id="admCValue" type="number" placeholder="Value (e.g., 10 for 10%)" min="0">
        <input id="admCMinOrder" type="number" placeholder="Min order (KES)" min="0">
        <input id="admCLimit" type="number" placeholder="Usage limit (leave blank = unlimited)">
        <input id="admCExpiry" type="date" placeholder="Expiry date">
        <input id="admCDesc" placeholder="Description (optional)">
        <div style="display:flex;gap:8px;margin-top:6px">
            <button class="adm-btn adm-btn-primary adm-btn-full" onclick="window._admSaveCoupon()">Create Coupon</button>
            <button class="adm-btn adm-btn-secondary adm-btn-full" onclick="document.getElementById('admCouponModal')?.remove()">Cancel</button>
        </div>
    </div>`;
    document.body.appendChild(ov);
};
window._admSaveCoupon = async () => {
    const code = document.getElementById('admCCode')?.value?.trim().toUpperCase();
    const type = document.getElementById('admCType')?.value;
    const value = parseFloat(document.getElementById('admCValue')?.value||0);
    if (!code || !value) { _toast('Code and value required','error','⚠️'); return; }
    const r = await _api('POST', '/marketplace/admin/coupons', { code, type, value, min_order_amt:parseFloat(document.getElementById('admCMinOrder')?.value||0), usage_limit:parseInt(document.getElementById('admCLimit')?.value||9999), expires_at:document.getElementById('admCExpiry')?.value||null, description:document.getElementById('admCDesc')?.value?.trim()||'' });
    document.getElementById('admCouponModal')?.remove();
    if (r&&!r._error) { _toast('Coupon created!','success','🎟️'); window._jmNavMore('admin-coupons'); }
    else _toast(r?._error||'Failed','error','❌');
};
window._admToggleCoupon = async (id) => { await _api('PATCH',`/marketplace/admin/coupons/${id}/toggle`); window._jmNavMore('admin-coupons'); };
window._admDeleteCoupon = async (id) => { if (!confirm('Delete coupon?')) return; await _api('DELETE',`/marketplace/admin/coupons/${id}`); window._jmNavMore('admin-coupons'); };

// ══════════════════════════════════════════════════════════════════════════════
// 9. FLASH SALE CONTROL
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminFlash(container) {
    if (!_isAdmin()) { container.innerHTML = _pageShell('Flash Sales', _noAccess()); return; }
    const r = await _api('GET', '/marketplace/admin/flash-sales');
    const sales = r?.data?.flash_sales || [];
    container.innerHTML = _pageShell('Flash Sale Control', `
    <div style="padding:12px">
        <button class="adm-btn adm-btn-primary adm-btn-full" onclick="window._admCreateFlashModal()">+ Create Flash Sale</button>
    </div>
    <div style="padding:0 12px">
    ${sales.map(p=>`<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
            ${p.image?`<img src="${_esc(p.image)}" style="width:48px;height:48px;border-radius:8px;object-fit:cover">`:`<div style="width:48px;height:48px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:20px">📦</div>`}
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(p.title||'')}</div>
                <div style="font-size:12px;color:#6b7280">${_fmt(p.flash_price)} <span style="text-decoration:line-through;color:#9ca3af">${_fmt(p.price)}</span></div>
                <div style="font-size:11px;color:#9ca3af">Ends: ${_time(p.flash_ends_at)}</div>
            </div>
            <span class="adm-badge ${p.active?'live':'gray'}">${p.active?'LIVE':'Ended'}</span>
        </div>
        ${p.active?`<button class="adm-btn adm-btn-danger" onclick="window._admEndFlashSale('${p.id}')">⏹ End Sale</button>`:''}
    </div>`).join('') || '<div style="padding:30px;text-align:center;color:#9ca3af">No flash sales</div>'}
    </div>`);
}

window._admCreateFlashModal = function() {
    document.getElementById('admFlashModal')?.remove();
    const ov = document.createElement('div'); ov.id='admFlashModal'; ov.className='adm-modal-overlay';
    ov.innerHTML = `<div class="adm-modal">
        <div class="adm-modal-title">⚡ Create Flash Sale</div>
        <input id="admFProduct" placeholder="Product ID *">
        <input id="admFPrice" type="number" placeholder="Flash sale price (KES) *" min="0">
        <input id="admFEnds" type="datetime-local" placeholder="Ends at *">
        <input id="admFStock" type="number" placeholder="Flash stock limit (optional)">
        <div style="display:flex;gap:8px;margin-top:6px">
            <button class="adm-btn adm-btn-primary adm-btn-full" onclick="window._admSaveFlash()">Launch Sale</button>
            <button class="adm-btn adm-btn-secondary adm-btn-full" onclick="document.getElementById('admFlashModal')?.remove()">Cancel</button>
        </div>
    </div>`;
    document.body.appendChild(ov);
};
window._admSaveFlash = async () => {
    const pid=document.getElementById('admFProduct')?.value?.trim(), price=document.getElementById('admFPrice')?.value, ends=document.getElementById('admFEnds')?.value;
    if (!pid||!price||!ends){_toast('Fill required fields','error','⚠️');return;}
    const r=await _api('POST','/marketplace/admin/flash-sales',{product_id:pid,flash_price:parseFloat(price),ends_at:new Date(ends).toISOString(),flash_stock:parseInt(document.getElementById('admFStock')?.value||0)||null});
    document.getElementById('admFlashModal')?.remove();
    if(r&&!r._error){_toast('Flash sale launched! ⚡','success','⚡');window._jmNavMore('admin-flash');}
    else _toast(r?._error||'Failed','error','❌');
};
window._admEndFlashSale=async(id)=>{if(!confirm('End this flash sale?'))return;await _api('DELETE',`/marketplace/admin/flash-sales/${id}`);_toast('Flash sale ended','info','⏹');window._jmNavMore('admin-flash');};

// ══════════════════════════════════════════════════════════════════════════════
// 10–15. REMAINING ADMIN PAGES (Reviews, Analytics, Tickets, Notify, Settings, Audit)
// ══════════════════════════════════════════════════════════════════════════════
async function renderAdminReviews(container) {
    if(!_isAdmin()){container.innerHTML=_pageShell('Reviews',_noAccess());return;}
    const r=await _api('GET','/marketplace/admin/reviews?limit=30');
    const reviews=r?.data?.reviews||[];
    container.innerHTML=_pageShell('Review Moderation',`<div style="padding:12px">
    ${reviews.map(rv=>`<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
            <div><div style="font-size:12px;font-weight:700">${'⭐'.repeat(Math.min(5,rv.rating||0))}</div><div style="font-size:11px;color:#6b7280;margin-top:2px">${_date(rv.createdAt||rv.created_at)}</div></div>
            <div style="display:flex;gap:4px">
                <button class="adm-btn adm-btn-warning" style="padding:4px 8px;font-size:10px" onclick="window._admHideReview('${rv.id}')">Hide</button>
                <button class="adm-btn adm-btn-danger" style="padding:4px 8px;font-size:10px" onclick="window._admDelReview('${rv.id}')">Del</button>
            </div>
        </div>
        <div style="font-size:13px;color:#374151">${_esc(rv.comment||rv.text||'—')}</div>
    </div>`).join('')||'<div style="padding:30px;text-align:center;color:#9ca3af">No reviews</div>'}
    </div>`);
}
window._admHideReview=async(id)=>{await _api('POST',`/marketplace/admin/reviews/${id}/hide`);_toast('Review hidden','info','👁');window._jmNavMore('admin-reviews');};
window._admDelReview=async(id)=>{if(!confirm('Delete review?'))return;await _api('DELETE',`/marketplace/admin/reviews/${id}`);_toast('Review deleted','info','🗑️');window._jmNavMore('admin-reviews');};

async function renderAdminAnalytics(container) {
    if(!_isAdmin()){container.innerHTML=_pageShell('Analytics',_noAccess());return;}
    const r=await _api('GET','/marketplace/admin/analytics?period=30d');
    if(r?._error){container.innerHTML=_pageShell('Analytics Center',`<div style="margin:12px;background:#fee2e2;border-radius:10px;padding:14px;font-size:13px;color:#991b1b">⚠️ ${_esc(r._error)}</div>`);return;}
    const d=r?.data||{revenue_by_day:[],top_products:[],top_categories:[],total_revenue:0,total_orders:0,new_users:0};
    const revDays=(d.revenue_by_day||[]);
    const maxR=revDays.length ? Math.max(...revDays.map(x=>x.revenue||0), 1) : 1;
    container.innerHTML=_pageShell('Analytics Center',`
    <div class="adm-kpi-grid">
        <div class="adm-kpi accent"><div class="adm-kpi-label">30-Day Revenue</div><div class="adm-kpi-val">${_fmt(d.total_revenue||0)}</div></div>
        <div class="adm-kpi accent"><div class="adm-kpi-label">Orders</div><div class="adm-kpi-val">${d.total_orders||0}</div></div>
        <div class="adm-kpi"><div class="adm-kpi-label">New Users</div><div class="adm-kpi-val">${d.new_users||0}</div></div>
        <div class="adm-kpi"><div class="adm-kpi-label">Platform Fee (10%)</div><div class="adm-kpi-val">${_fmt((d.total_revenue||0)*0.1)}</div></div>
    </div>
    <div class="adm-section">
        <div class="adm-section-title">Revenue — 30 Days</div>
        <div class="adm-chart">${revDays.slice(-14).map(x=>`<div class="adm-bar" style="height:${maxR>0?Math.max(3,Math.round((x.revenue/maxR)*100)):3}%" data-v="${_fmt(x.revenue)}"></div>`).join('')}</div>
        <div class="adm-chart-labels">${revDays.slice(-14).map(x=>`<div class="adm-chart-label">${x.date?.slice(5)||''}</div>`).join('')}</div>
    </div>
    <div class="adm-section">
        <div class="adm-section-title">Top Products</div>
        ${(d.top_products||[]).map((p,i)=>`<div class="adm-row"><div style="width:24px;font-weight:900;color:#374151;text-align:center">#${i+1}</div><div style="flex:1;min-width:0"><div class="adm-row-title">${_esc(p.title||'')}</div><div class="adm-row-sub">${p.views||0} views · ${p.sold||0} sold · ${_esc(p.category||'')}</div></div><div class="adm-row-price">${_fmt(p.revenue||0)}</div></div>`).join('')||'<div style="text-align:center;color:#9ca3af;font-size:13px;padding:12px">No data</div>'}
    </div>
    <div class="adm-section">
        <div class="adm-section-title">Top Categories</div>
        ${(d.top_categories||[]).map((c,i)=>`<div class="adm-row"><div style="width:24px;font-weight:900;text-align:center">#${i+1}</div><div style="flex:1;font-size:13px;font-weight:700;text-transform:capitalize">${_esc(c.category||'')}</div><div style="font-weight:800">${c.count} products</div></div>`).join('')||'<div style="text-align:center;color:#9ca3af;font-size:13px;padding:12px">No data</div>'}
    </div>`);
}

async function renderAdminTickets(container) {
    if(!_isAdmin()){container.innerHTML=_pageShell('Support',_noAccess());return;}
    const r=await _api('GET','/marketplace/admin/tickets');
    const tickets=r?.data?.tickets||[];
    container.innerHTML=_pageShell('Support Tickets',`<div style="padding:12px">
    ${tickets.map(t=>`<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
            <div style="font-size:13px;font-weight:800">${_esc(t.subject||'—')}</div>
            <span class="adm-badge ${t.status==='open'?'yellow':t.status==='resolved'?'green':'gray'}">${t.status}</span>
        </div>
        <div style="font-size:12px;color:#374151;margin-bottom:6px">${_esc(t.message||'—')}</div>
        <div style="font-size:11px;color:#9ca3af;margin-bottom:8px">${_date(t.created_at)}</div>
        ${t.status==='open'?`<button class="adm-btn adm-btn-success" onclick="window._admResolveTicket('${t.id}')">✅ Resolve</button>`:''}
    </div>`).join('')||'<div style="padding:30px;text-align:center;color:#9ca3af">No tickets</div>'}
    </div>`);
}
window._admResolveTicket=async(id)=>{const res=prompt('Resolution note:');await _api('POST',`/marketplace/admin/tickets/${id}/resolve`,{resolution:res||'Resolved by admin'});_toast('Ticket resolved','success','✅');window._jmNavMore('admin-tickets');};

async function renderAdminNotify(container) {
    if(!_isAdmin()){container.innerHTML=_pageShell('Notifications',_noAccess());return;}
    container.innerHTML=_pageShell('Send Notification',`<div style="padding:16px">
    <div class="adm-section">
        <div class="adm-section-title">Broadcast Notification</div>
        <div style="margin-bottom:10px"><div style="font-size:12px;font-weight:700;margin-bottom:4px">Title *</div><input id="admNTitle" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px;font-size:14px;box-sizing:border-box;outline:none" placeholder="e.g., Flash Sale Starting Now!"></div>
        <div style="margin-bottom:10px"><div style="font-size:12px;font-weight:700;margin-bottom:4px">Message *</div><textarea id="admNMsg" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px;font-size:14px;box-sizing:border-box;outline:none;height:80px;resize:none" placeholder="Your message…"></textarea></div>
        <div style="margin-bottom:10px"><div style="font-size:12px;font-weight:700;margin-bottom:4px">Type</div><select id="admNType" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px;font-size:14px;box-sizing:border-box;outline:none"><option value="announcement">📢 Announcement</option><option value="promotion">🏷️ Promotion</option><option value="flash_sale">⚡ Flash Sale</option><option value="maintenance">🔧 Maintenance</option></select></div>
        <div style="margin-bottom:14px"><div style="font-size:12px;font-weight:700;margin-bottom:4px">Target</div><select id="admNTarget" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px;font-size:14px;box-sizing:border-box;outline:none"><option value="all">Everyone</option><option value="buyers">Buyers only</option><option value="sellers">Sellers only</option></select></div>
        <button class="adm-btn adm-btn-primary adm-btn-full" onclick="window._admSendNotif()">🔔 Send Notification</button>
    </div>
    </div>`);
}
window._admSendNotif=async()=>{
    const title=document.getElementById('admNTitle')?.value?.trim(),msg=document.getElementById('admNMsg')?.value?.trim();
    if(!title||!msg){_toast('Title and message required','error','⚠️');return;}
    const r=await _api('POST','/marketplace/admin/notifications/send',{title,message:msg,type:document.getElementById('admNType')?.value,target:document.getElementById('admNTarget')?.value});
    if(r&&!r._error){_toast('Notification sent!','success','🔔');}else _toast(r?._error||'Failed','error','❌');
};

async function renderAdminSettings(container) {
    if(!_isAdmin()){container.innerHTML=_pageShell('Settings',_noAccess());return;}
    const r=await _api('GET','/marketplace/admin/settings');
    const s=r?.data?.settings||{};
    container.innerHTML=_pageShell('Platform Settings',`<div style="padding:0 12px">
    <div class="adm-section">
        <div class="adm-section-title">Marketplace Config</div>
        ${[
            ['Platform Name',s.platform_name||'Knecta Market'],
            ['Commission (%)',s.commission_pct||10],
            ['Min Payout (KES)',s.min_payout_kes||100],
            ['Default Currency',s.default_currency||'KES'],
            ['Referral Bonus (KES)',s.referral_bonus_kes||100],
            ['Loyalty pts per KES',s.loyalty_points_per_kes||1],
            ['KES per point',s.loyalty_kes_per_point||0.5],
            ['Require product approval',s.require_product_approval?'Yes':'No'],
        ].map(([k,v])=>`<div class="adm-settings-row"><div><div class="adm-settings-label">${k}</div></div><div class="adm-settings-val">${_esc(String(v))}</div></div>`).join('')}
    </div>
    <div class="adm-section">
        <div class="adm-section-title">Update Commission Rate</div>
        <input id="admSComm" type="number" min="0" max="50" step="0.5" value="${s.commission_pct||10}" style="width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px;font-size:14px;box-sizing:border-box;margin-bottom:10px">
        <button class="adm-btn adm-btn-primary adm-btn-full" onclick="window._admSaveSettings()">Save Settings</button>
    </div>
    </div>`);
}
window._admSaveSettings=async()=>{
    const comm=parseFloat(document.getElementById('admSComm')?.value||10);
    const r=await _api('PUT','/marketplace/admin/settings',{commission_pct:comm});
    if(r&&!r._error){_toast('Settings saved!','success','✅');}else _toast(r?._error||'Failed','error','❌');
};

async function renderAdminAudit(container) {
    if(!_isAdmin()){container.innerHTML=_pageShell('Audit Log',_noAccess());return;}
    const r=await _api('GET','/marketplace/admin/audit-log');
    const logs=r?.data?.logs||[];
    container.innerHTML=_pageShell('Audit Log',`<div style="padding:12px">
    ${logs.length?logs.map(l=>`<div style="background:#fff;border-radius:10px;padding:12px;margin-bottom:6px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <div style="font-size:12px;font-weight:800;color:#111">${_esc(l.action||'—')}</div>
            <div style="font-size:11px;color:#9ca3af">${_time(l.timestamp)}</div>
        </div>
        <div style="font-size:11px;color:#6b7280">Admin ID: ${_esc(String(l.admin_id||'—'))}</div>
    </div>`).join(''):'<div style="padding:30px;text-align:center;color:#9ca3af">No audit entries yet</div>'}
    </div>`);
}

// ══════════════════════════════════════════════════════════════════════════════
// NAV ROUTING — Register all admin pages
// ══════════════════════════════════════════════════════════════════════════════
const ADMIN_ROUTES = {
    'admin-dashboard':  renderAdminDashboard,
    'admin-products':   renderAdminProducts,
    'admin-approval':   renderAdminProducts,
    'admin-sellers':    renderAdminSellers,
    'admin-buyers':     renderAdminBuyers,
    'admin-orders':     renderAdminOrders,
    'admin-returns':    renderAdminReturns,
    'admin-payouts':    renderAdminPayouts,
    'admin-coupons':    renderAdminCoupons,
    'admin-flash':      renderAdminFlash,
    'admin-reviews':    renderAdminReviews,
    'admin-analytics':  renderAdminAnalytics,
    'admin-tickets':    renderAdminTickets,
    'admin-notify':     renderAdminNotify,
    'admin-settings':   renderAdminSettings,
    'admin-audit':      renderAdminAudit,
};

const _prevNav = window._jmNavMore;
window._jmNavMore = function(page) {
    const renderFn = ADMIN_ROUTES[page];
    if (renderFn) {
        document.querySelectorAll('.jm-page').forEach(p => p.classList.remove('active'));
        window._jmHideMore?.();
        const pageId = 'admPage_' + page.replace(/-/g,'_');
        const el = _getOrCreateAdminPage(pageId);
        el.classList.add('active');
        // Apply flex layout so inner content fills height
        el.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#f3f4f6';
        // Show loading immediately
        el.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#9ca3af"><div style="font-size:32px">⏳</div><div style="font-size:14px;font-weight:600">Loading…</div></div>`;
        // Run render with error boundary
        Promise.resolve(renderFn(el)).catch(err => {
            console.error('[Admin]', page, err);
            el.innerHTML = _pageShell(page, `
                <div style="margin:16px;background:#fee2e2;border-radius:14px;padding:18px;text-align:center">
                    <div style="font-size:32px;margin-bottom:10px">⚠️</div>
                    <div style="font-weight:800;font-size:15px;color:#991b1b;margin-bottom:6px">Something went wrong</div>
                    <div style="font-size:13px;color:#b91c1c;margin-bottom:14px">${_esc(err?.message||'Unknown error')}</div>
                    <button class="adm-btn adm-btn-primary" onclick="window._jmNavMore('${page}')">🔄 Retry</button>
                </div>`);
        });
        return;
    }
    _prevNav?.call(this, page);
};

// ══════════════════════════════════════════════════════════════════════════════
// INJECT ADMIN BUTTON IN MORE MENU
// ══════════════════════════════════════════════════════════════════════════════
function _injectAdminEntry() {
    if (!_isAdmin()) return;
    // 1. Inject into the More sheet grid
    const grid = document.querySelector('.jm-more-grid');
    if (grid && !document.getElementById('admMenuBtn')) {
        const btn = document.createElement('button');
        btn.id = 'admMenuBtn';
        btn.className = 'jm-more-item';
        btn.style.cssText = 'background:linear-gradient(135deg,#111,#374151);color:#fff;border-radius:12px;grid-column:span 1';
        btn.innerHTML = '<i class="fas fa-shield-alt" style="color:#fff;font-size:20px"></i><span style="color:#fff;font-weight:800">Admin Panel</span>';
        btn.onclick = () => window._jmNavMore('admin-dashboard');
        grid.prepend(btn);
    }
    // 2. Also inject admin shortcut into account page
    const acctPage = document.getElementById('jmPageAccount');
    if (acctPage && !document.getElementById('admAcctBtn')) {
        const wrap = acctPage.querySelector('.jm-account-menu') || acctPage;
        const btn2 = document.createElement('button');
        btn2.id = 'admAcctBtn';
        btn2.style.cssText = 'display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;background:linear-gradient(135deg,#111,#374151);color:#fff;border:none;cursor:pointer;margin-top:8px;border-radius:12px';
        btn2.innerHTML = '<i class="fas fa-shield-alt"></i><span style="font-weight:700;font-size:14px">Admin Command Center</span><i class="fas fa-chevron-right" style="margin-left:auto"></i>';
        btn2.onclick = () => window._jmNavMore('admin-dashboard');
        wrap.appendChild(btn2);
    }
}

// Patch _showMore to always inject admin entry when sheet opens
const _origShowMoreAdmin = window._jmShowMore;
window._jmShowMore = function() {
    _origShowMoreAdmin?.call(this);
    setTimeout(_injectAdminEntry, 50); // inject after sheet renders
};

// Multiple injection attempts
[300, 800, 1500, 3000].forEach(t => setTimeout(_injectAdminEntry, t));
document.addEventListener('DOMContentLoaded', _injectAdminEntry);

// Re-inject when account page opens
const _origRenderAccount = window._renderAccount;
if (typeof _origRenderAccount === 'function') {
    window._renderAccount = function() {
        _origRenderAccount.call(this);
        setTimeout(_injectAdminEntry, 100);
    };
}

console.log('[marketplace-admin.js] ✅ Admin command center loaded — role:', (window.currentUser||window.__kynUser||{}).role||'unknown');
})();
