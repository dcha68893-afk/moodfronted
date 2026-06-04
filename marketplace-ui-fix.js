/**
 * marketplace-ui-fix.js v3 — COMPLETE UI VISIBILITY & LAYOUT FIX
 * ═══════════════════════════════════════════════════════════════
 * Loads LAST. Fixes everything that breaks in iframe context.
 * ═══════════════════════════════════════════════════════════════
 */
(function _UIFix() {
'use strict';

// ─── Global CSS injected with !important on every rule ────────────────────────
const CSS = `
/* ── Iframe body fill ────────────────────────────────────────────────── */
html,body{height:100%!important;margin:0!important;padding:0!important;overflow:hidden!important}
.app-container{height:100vh!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}
#sidebar{width:100%!important;height:100%!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;position:relative!important}

/* ── jm-page sizing ──────────────────────────────────────────────────── */
.jm-page{display:none;flex:1;min-height:0;overflow-y:auto;flex-direction:column;padding-bottom:60px;-webkit-overflow-scrolling:touch}
.jm-page.active{display:flex!important;flex-direction:column!important;flex:1!important;min-height:0!important;overflow-y:auto!important}

/* ── Seller/Admin dynamic pages ──────────────────────────────────────── */
[id^="sdPage_"],[id^="admPage_"]{display:none;flex:1;min-height:0;overflow-y:auto;flex-direction:column;background:#f3f4f6;padding-bottom:60px}
[id^="sdPage_"].active,[id^="admPage_"].active{display:flex!important;flex-direction:column!important;flex:1!important;min-height:0!important;overflow-y:auto!important}

/* ── sd-wrap: use flex not height:100% (flex:1 parent) ───────────────── */
.sd-wrap{display:flex!important;flex-direction:column!important;flex:1!important;min-height:0!important;overflow:hidden!important;background:#f3f4f6!important}
.sd-body{flex:1!important;overflow-y:auto!important;min-height:0!important;padding-bottom:80px!important;-webkit-overflow-scrolling:touch!important}
.sd-head{flex-shrink:0!important;background:#fff!important;padding:13px 16px!important;display:flex!important;align-items:center!important;gap:12px!important;border-bottom:1px solid #f3f4f6!important;position:sticky!important;top:0!important;z-index:10!important}

/* Admin page same */
.adm-page{display:flex!important;flex-direction:column!important;flex:1!important;min-height:0!important;overflow:hidden!important}
.adm-body{flex:1!important;overflow-y:auto!important;min-height:0!important;padding-bottom:80px!important;background:#f3f4f6!important}
.adm-header{flex-shrink:0!important;position:sticky!important;top:0!important;z-index:10!important}

/* ── MORE SHEET: position fixed in iframe viewport ───────────────────── */
#jmMoreOverlay{display:none;position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;background:rgba(0,0,0,.5)!important;z-index:88888!important}
#jmMoreSheet{display:none;position:fixed!important;bottom:0!important;left:0!important;right:0!important;width:100%!important;max-height:88vh!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;background:#fff!important;border-radius:20px 20px 0 0!important;padding:12px 12px 40px!important;z-index:88889!important;box-shadow:0 -8px 32px rgba(0,0,0,.22)!important;box-sizing:border-box!important}

/* ── More grid ───────────────────────────────────────────────────────── */
.jm-more-grid{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:8px!important;margin-bottom:4px!important}
@media(max-width:340px){.jm-more-grid{grid-template-columns:repeat(3,1fr)!important}}
.jm-more-item{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:5px!important;background:#f9fafb!important;border:none!important;border-radius:12px!important;padding:12px 6px!important;cursor:pointer!important;font-size:11px!important;font-weight:600!important;color:#111!important;text-align:center!important;min-height:68px!important;transition:transform .12s!important}
.jm-more-item:active{transform:scale(.94)!important;background:#f0fdf4!important}
.jm-more-item i{font-size:20px!important;color:#f57224!important;margin-bottom:1px!important}
.jm-more-handle{width:40px!important;height:4px!important;background:#d1d5db!important;border-radius:2px!important;margin:0 auto 12px!important}
.jm-more-title{font-size:14px!important;font-weight:800!important;text-align:center!important;margin-bottom:14px!important;color:#111!important}
.jm-more-section-label{font-size:10px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.6px!important;color:#9ca3af!important;margin:14px 0 8px!important;padding:0 2px!important}

/* ── Bottom nav ──────────────────────────────────────────────────────── */
#jmBottomNav{display:flex!important;align-items:stretch!important;flex-shrink:0!important;height:56px!important;background:#fff!important;border-top:1px solid #e5e7eb!important;box-shadow:0 -2px 12px rgba(0,0,0,.07)!important;z-index:300!important}
.jm-nav-tab,.jm-bottom-tab{flex:1!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:2px!important;border:none!important;background:none!important;cursor:pointer!important;font-size:10px!important;font-weight:600!important;color:#9ca3af!important;padding:4px 2px!important;min-width:0!important}
.jm-nav-tab.active,.jm-nav-tab[data-active="true"]{color:#f57224!important}
.jm-nav-tab.active i,.jm-nav-tab[data-active="true"] i{color:#f57224!important}
.jm-nav-tab i{font-size:18px!important;color:inherit!important}
.jm-nav-tab span{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;max-width:54px!important}

/* ── Header ──────────────────────────────────────────────────────────── */
#jmHeader,.jm-header{display:flex!important;align-items:center!important;gap:6px!important;padding:8px 10px!important;background:#fff!important;border-bottom:1px solid #e5e7eb!important;flex-shrink:0!important;min-height:50px!important;z-index:100!important}
#jmMoreBtn{background:#f57224!important;color:#fff!important;border:none!important;border-radius:8px!important;padding:0 12px!important;height:36px!important;display:flex!important;align-items:center!important;gap:5px!important;font-size:13px!important;font-weight:700!important;cursor:pointer!important;flex-shrink:0!important}
#jmMoreBtn i{color:#fff!important;font-size:13px!important}
#jmMoreBtn span{color:#fff!important}

/* ── Floating admin button ───────────────────────────────────────────── */
#admFab{display:none;position:fixed!important;bottom:66px!important;right:14px!important;width:50px!important;height:50px!important;border-radius:50%!important;background:linear-gradient(135deg,#111,#374151)!important;color:#fff!important;border:none!important;cursor:pointer!important;font-size:22px!important;z-index:400!important;box-shadow:0 4px 16px rgba(0,0,0,.35)!important;align-items:center!important;justify-content:center!important}

/* ── old bottom nav class hidden ────────────────────────────────────── */
.jm-bottom-nav{display:none!important}
`;

(function _injectCSS() {
    document.getElementById('uiFixCSSv3')?.remove();
    const s = document.createElement('style');
    s.id = 'uiFixCSSv3';
    s.textContent = CSS;
    document.head.appendChild(s);
})();

// ─── showMore / hideMore — force inline styles ────────────────────────────────
function showMore() {
    const ov = document.getElementById('jmMoreOverlay');
    const sh = document.getElementById('jmMoreSheet');
    if (!sh) { console.warn('[UIFix] jmMoreSheet not found'); return; }
    if (ov) {
        ov.style.cssText = 'display:block!important;position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;background:rgba(0,0,0,.5)!important;z-index:88888!important';
    }
    sh.style.cssText = 'display:block!important;position:fixed!important;bottom:0!important;left:0!important;right:0!important;width:100%!important;max-height:88vh!important;overflow-y:auto!important;background:#fff!important;border-radius:20px 20px 0 0!important;padding:12px 12px 40px!important;z-index:88889!important;box-shadow:0 -8px 32px rgba(0,0,0,.22)!important;box-sizing:border-box!important;-webkit-overflow-scrolling:touch!important';
    rebuildMenu();
}
function hideMore() {
    const ov = document.getElementById('jmMoreOverlay');
    const sh = document.getElementById('jmMoreSheet');
    if (ov) ov.style.cssText = 'display:none!important';
    if (sh) sh.style.cssText = 'display:none!important';
}
window._showMore = window._hideMore = null; // clear stale refs
window._showMore     = showMore;
window._hideMore     = hideMore;
window._jmShowMore   = showMore;
window._jmHideMore   = hideMore;

// ─── Rebuild bottom nav ───────────────────────────────────────────────────────
function rebuildBottomNav() {
    document.querySelectorAll('.jm-bottom-nav,#jmBottomNav').forEach(e => e.remove());
    const nav = document.createElement('div');
    nav.id = 'jmBottomNav';
    const cur = window._state?.page || 'home';
    const TABS = [
        {p:'home',      i:'fa-home',         l:'Home'},
        {p:'categories',i:'fa-th-large',     l:'Browse'},
        {p:'wishlist',  i:'fa-heart',        l:'Saved'},
        {p:'orders',    i:'fa-shopping-bag', l:'Orders'},
        {p:'account',   i:'fa-user',         l:'Account'},
    ];
    nav.innerHTML = TABS.map(t=>`
        <button class="jm-nav-tab${t.p===cur?' active':''}" data-page="${t.p}" onclick="window._jmNav('${t.p}')" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:none;background:none;cursor:pointer;font-size:10px;font-weight:600;color:${t.p===cur?'#f57224':'#9ca3af'};padding:4px 2px;min-width:0">
            <i class="fas ${t.i}" style="font-size:18px;color:inherit"></i>
            <span style="color:inherit;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:54px">${t.l}</span>
        </button>`).join('')+`
        <button id="jmMoreTab" onclick="window._jmShowMore()" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:none;background:none;cursor:pointer;padding:4px 2px;min-width:0">
            <i class="fas fa-ellipsis-h" style="font-size:18px;color:#f57224"></i>
            <span style="color:#f57224;font-size:10px;font-weight:800">Menu</span>
        </button>`;
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.appendChild(nav);
    else document.body.appendChild(nav);
}

// ─── Update active nav tab ────────────────────────────────────────────────────
function setActiveTab(page) {
    document.querySelectorAll('#jmBottomNav [data-page]').forEach(btn => {
        const active = btn.dataset.page === page;
        btn.style.color = active ? '#f57224' : '#9ca3af';
        btn.querySelectorAll('i,span').forEach(el => el.style.color = active ? '#f57224' : '#9ca3af');
        btn.dataset.active = active ? 'true' : 'false';
    });
}

// ─── Rebuild More menu content ────────────────────────────────────────────────
function rebuildMenu() {
    const sh = document.getElementById('jmMoreSheet');
    if (!sh) return;
    const isAdmin = _isAdmin();

    sh.innerHTML = `
    <div class="jm-more-handle"></div>
    <div class="jm-more-title">Menu</div>

    <div class="jm-more-section-label">🏪 Seller Tools</div>
    <div class="jm-more-grid">
        <button class="jm-more-item" onclick="window._jmHideMore();window._jmNavMore('seller-dashboard')" style="background:linear-gradient(135deg,#fff8f5,#fff)!important;border:1.5px solid #f57224!important">
            <i class="fas fa-tachometer-alt" style="color:#f57224!important"></i><span>Dashboard</span>
        </button>
        <button class="jm-more-item" onclick="(()=>{window._jmHideMore();setTimeout(()=>document.getElementById('createListingBtn')?.click(),100)})()" style="background:#f57224!important">
            <i class="fas fa-plus-circle" style="color:#fff!important"></i><span style="color:#fff!important">Sell</span>
        </button>
        ${[
            ['my-listings',        'fa-box-open',        '#3b82f6','Listings'],
            ['seller-inventory',   'fa-warehouse',       '#8b5cf6','Inventory'],
            ['seller-shipping',    'fa-shipping-fast',   '#f59e0b','Orders'],
            ['seller-payouts',     'fa-money-bill-wave', '#22c55e','Payouts'],
            ['seller-analytics',   'fa-chart-line',      '#ec4899','Analytics'],
            ['seller-returns',     'fa-undo-alt',        '#ef4444','Returns'],
        ].map(([p,ic,c,lb])=>`
        <button class="jm-more-item" onclick="window._jmHideMore();window._jmNavMore('${p}')">
            <i class="fas ${ic}" style="color:${c}!important"></i><span>${lb}</span>
        </button>`).join('')}
    </div>

    <div class="jm-more-section-label">👤 Buyer Tools</div>
    <div class="jm-more-grid">
        ${[
            ['wallet',       'fa-wallet',         '#22c55e','Wallet'],
            ['loyalty',      'fa-trophy',         '#f59e0b','Loyalty'],
            ['referral',     'fa-gift',           '#ec4899','Refer'],
            ['addresses',    'fa-map-marker-alt', '#8b5cf6','Addresses'],
            ['vouchers',     'fa-ticket-alt',     '#f97316','Vouchers'],
            ['notifprefs',   'fa-bell',           '#6366f1','Alerts'],
            ['notes',        'fa-sticky-note',    '#84cc16','Notes'],
            ['trust',        'fa-shield-alt',     '#10b981','Trust'],
            ['leaderboard',  'fa-medal',          '#f59e0b','Leaders'],
            ['reviews-page', 'fa-star',           '#eab308','Reviews'],
            ['follow-sellers','fa-store',         '#06b6d4','Following'],
            ['inbox',        'fa-envelope',       '#3b82f6','Inbox'],
        ].map(([p,ic,c,lb])=>`
        <button class="jm-more-item" onclick="window._jmHideMore();window._jmNavMore('${p}')">
            <i class="fas ${ic}" style="color:${c}!important"></i><span>${lb}</span>
        </button>`).join('')}
    </div>

    ${isAdmin ? `
    <div class="jm-more-section-label">⚙️ Admin</div>
    <div class="jm-more-grid">
        ${[
            ['admin-dashboard',  'fa-tachometer-alt','#111',   'Dashboard'],
            ['admin-products',   'fa-box',           '#3b82f6','Products'],
            ['admin-sellers',    'fa-store',         '#8b5cf6','Sellers'],
            ['admin-buyers',     'fa-users',         '#22c55e','Buyers'],
            ['admin-orders',     'fa-receipt',       '#f59e0b','Orders'],
            ['admin-payouts',    'fa-money-check',   '#ec4899','Payouts'],
            ['admin-analytics',  'fa-chart-pie',     '#6366f1','Analytics'],
            ['admin-settings',   'fa-cog',           '#6b7280','Settings'],
        ].map(([p,ic,c,lb])=>`
        <button class="jm-more-item" onclick="window._jmHideMore();window._jmNavMore('${p}')" style="background:linear-gradient(135deg,#1f2937,#374151)!important">
            <i class="fas ${ic}" style="color:${c==='#111'?'#fff':c}!important"></i>
            <span style="color:#d1d5db!important">${lb}</span>
        </button>`).join('')}
    </div>` : ''}
    `;

    // overlay click to close
    const ov = document.getElementById('jmMoreOverlay');
    if (ov) ov.onclick = hideMore;
}

// ─── Admin check ──────────────────────────────────────────────────────────────
function _isAdmin() {
    const u = window.currentUser || window.__kynUser || {};
    return u.role==='admin' || u.role==='moderator' || u.isAdmin === true ||
           (()=>{ try{return JSON.parse(localStorage.getItem('_adminMode')||'false')}catch(_){return false} })();
}

// ─── Floating admin FAB ───────────────────────────────────────────────────────
function _ensureAdminFab() {
    if (!_isAdmin()) return;
    let fab = document.getElementById('admFab');
    if (!fab) {
        fab = document.createElement('button');
        fab.id = 'admFab';
        fab.innerHTML = '⚙️';
        fab.title = 'Admin Panel';
        fab.onclick = () => window._jmNavMore('admin-dashboard');
        document.body.appendChild(fab);
    }
    fab.style.cssText = 'display:flex!important;position:fixed!important;bottom:66px!important;right:14px!important;width:50px!important;height:50px!important;border-radius:50%!important;background:linear-gradient(135deg,#111,#374151)!important;color:#fff!important;border:none!important;cursor:pointer!important;font-size:22px!important;z-index:400!important;box-shadow:0 4px 16px rgba(0,0,0,.35)!important;align-items:center!important;justify-content:center!important';
}

// ─── Patch _jmNav ─────────────────────────────────────────────────────────────
const _origJmNav = window._jmNav;
window._jmNav = function(page, sub) {
    _origJmNav?.call(this, page, sub);
    setTimeout(() => setActiveTab(page), 50);
};

// ─── Patch _jmNavMore for seller/admin ───────────────────────────────────────
const _origNavMore = window._jmNavMore;
window._jmNavMore = function(page) {
    // Ensure the page container exists inside sidebar with correct styles
    const isSeller = /^(seller-|my-listings|admin-approval)/.test(page);
    const isAdmin  = /^admin-/.test(page);
    if (isSeller || isAdmin) {
        const prefix  = isAdmin ? 'admPage_' : 'sdPage_';
        const pageId  = prefix + page.replace(/-/g,'_');
        let el = document.getElementById(pageId);
        if (!el) {
            el = document.createElement('div');
            el.id = pageId;
            el.className = 'jm-page';
            const sidebar = document.getElementById('sidebar') || document.body;
            // Insert before bottom nav so it doesn't push nav down
            const nav = document.getElementById('jmBottomNav');
            if (nav) sidebar.insertBefore(el, nav);
            else sidebar.appendChild(el);
        }
        // Deactivate all pages
        document.querySelectorAll('.jm-page').forEach(p => p.classList.remove('active'));
        el.classList.add('active');
        // Force flex layout via inline
        el.style.cssText = 'display:flex!important;flex-direction:column!important;flex:1!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;background:#f3f4f6!important;padding-bottom:60px!important';
        hideMore();
    }
    _origNavMore?.call(this, page);
};

// ─── Update More button ───────────────────────────────────────────────────────
function _updateMoreBtn() {
    const btn = document.getElementById('jmMoreBtn');
    if (!btn) return;
    btn.innerHTML = '<i class="fas fa-th" style="color:#fff;font-size:13px"></i><span style="color:#fff">Menu</span>';
    btn.onclick = showMore;
    btn.style.cssText = 'background:#f57224!important;color:#fff!important;border:none!important;border-radius:8px!important;padding:0 12px!important;height:36px!important;display:flex!important;align-items:center!important;gap:5px!important;font-size:13px!important;font-weight:700!important;cursor:pointer!important;flex-shrink:0!important';
}

// ─── Main init ────────────────────────────────────────────────────────────────
function init() {
    rebuildBottomNav();
    _updateMoreBtn();
    [300,600,1200,2500].forEach(t => setTimeout(() => {
        rebuildBottomNav();
        _updateMoreBtn();
        _ensureAdminFab();
    }, t));
    // overlay click handler
    const ov = document.getElementById('jmMoreOverlay');
    if (ov) ov.onclick = hideMore;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
window.addEventListener('load', () => setTimeout(init, 200));
window.addEventListener('message', e => {
    if (e.data?.type==='tools:active'||e.data?.type==='PARENT_READY') setTimeout(init, 300);
});

console.log('[marketplace-ui-fix v3] ✅ Complete UI fix applied');
})();
