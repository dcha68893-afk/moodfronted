/**
 * marketplace-ui-fix.js — COMPLETE UI VISIBILITY FIX
 * ════════════════════════════════════════════════════
 * Fixes all visibility issues caused by iframe context:
 * - More sheet (⋮) completely rebuilt as full-viewport overlay
 * - Bottom nav rebuilt as sticky footer inside sidebar
 * - All seller/admin pages render INSIDE sidebar correctly
 * - Persistent bottom tabs for fast navigation
 * - Admin entry always visible in More menu and Account tab
 * ════════════════════════════════════════════════════
 */

(function _UIFix() {
'use strict';

// ─── Inject comprehensive CSS ─────────────────────────────────────────────────
(function _css() {
    const s = document.createElement('style');
    s.id = 'uiFixCSS';
    s.textContent = `
    /* ── Force sidebar to fill full iframe height ─────────────────────────── */
    html, body {
        height: 100% !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
    }
    .app-container {
        height: 100vh !important;
        overflow: hidden !important;
    }
    #sidebar {
        width: 100% !important;
        height: 100vh !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        position: relative !important;
    }
    /* All jm-pages fill remaining height */
    .jm-page {
        display: none;
        flex: 1;
        overflow-y: auto;
        flex-direction: column;
        padding-bottom: 60px;
        -webkit-overflow-scrolling: touch;
    }
    .jm-page.active {
        display: flex !important;
        flex-direction: column;
    }

    /* ── MORE SHEET — full iframe overlay ──────────────────────────────────── */
    /* IMPORTANT: in iframe context, position:fixed = iframe viewport top/left */
    #jmMoreOverlay {
        display: none;
        position: fixed !important;
        top: 0 !important; left: 0 !important;
        width: 100% !important; height: 100% !important;
        background: rgba(0,0,0,0.5) !important;
        z-index: 99990 !important;
    }
    #jmMoreSheet {
        display: none;
        position: fixed !important;
        bottom: 0 !important; left: 0 !important; right: 0 !important;
        background: #fff !important;
        border-radius: 20px 20px 0 0 !important;
        padding: 12px 14px 32px !important;
        z-index: 99991 !important;
        max-height: 85vh !important;
        overflow-y: auto !important;
        box-shadow: 0 -8px 40px rgba(0,0,0,0.25) !important;
        -webkit-overflow-scrolling: touch !important;
    }
    /* ── More grid — responsive 4 cols on wide, 3 on narrow ───────────────── */
    .jm-more-grid {
        display: grid !important;
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 10px !important;
    }
    @media (max-width: 360px) {
        .jm-more-grid { grid-template-columns: repeat(3,1fr) !important; }
    }
    .jm-more-item {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        gap: 5px !important;
        background: #f9fafb !important;
        border: none !important;
        border-radius: 12px !important;
        padding: 12px 6px !important;
        cursor: pointer !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        color: #111 !important;
        text-align: center !important;
        line-height: 1.2 !important;
        min-height: 64px !important;
        justify-content: center !important;
    }
    .jm-more-item i {
        font-size: 20px !important;
        color: #f57224 !important;
        margin-bottom: 2px !important;
    }
    .jm-more-item:active { background: #fff8f5 !important; transform: scale(.96); }
    .jm-more-title {
        font-size: 14px !important;
        font-weight: 800 !important;
        text-align: center !important;
        margin-bottom: 14px !important;
        color: #111 !important;
    }
    .jm-more-handle {
        width: 40px; height: 4px;
        background: #d1d5db; border-radius: 2px;
        margin: 0 auto 14px;
    }

    /* ── Bottom navigation ─────────────────────────────────────────────────── */
    #jmBottomNav {
        position: sticky !important;
        bottom: 0 !important;
        left: 0 !important; right: 0 !important;
        height: 56px !important;
        background: #fff !important;
        border-top: 1px solid #e5e7eb !important;
        display: flex !important;
        align-items: stretch !important;
        flex-shrink: 0 !important;
        z-index: 200 !important;
        box-shadow: 0 -2px 12px rgba(0,0,0,0.08) !important;
    }
    .jm-nav-tab {
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 2px !important;
        border: none !important;
        background: none !important;
        cursor: pointer !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        color: #9ca3af !important;
        padding: 6px 4px !important;
        position: relative !important;
        text-decoration: none !important;
    }
    .jm-nav-tab i { font-size: 18px !important; }
    .jm-nav-tab.active { color: #f57224 !important; }
    .jm-nav-tab.active i { color: #f57224 !important; }
    /* More tab always orange */
    #jmMoreTab { color: #f57224 !important; }
    #jmMoreTab i { color: #f57224 !important; }

    /* ── Header ────────────────────────────────────────────────────────────── */
    #jmHeader {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        padding: 8px 10px !important;
        background: #fff !important;
        border-bottom: 1px solid #e5e7eb !important;
        flex-shrink: 0 !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 100 !important;
        min-height: 50px !important;
    }
    .jm-icon-btn {
        position: relative !important;
        background: none !important;
        border: none !important;
        font-size: 18px !important;
        color: #111 !important;
        cursor: pointer !important;
        width: 38px !important;
        height: 38px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 50% !important;
        flex-shrink: 0 !important;
    }
    #jmMoreBtn {
        background: #f57224 !important;
        color: #fff !important;
        border-radius: 8px !important;
        width: auto !important;
        padding: 0 10px !important;
        gap: 4px !important;
        font-size: 13px !important;
        font-weight: 700 !important;
    }
    #jmMoreBtn i { color: #fff !important; font-size: 14px !important; }

    /* ── Seller/Admin pages rendered in sidebar ────────────────────────────── */
    [id^="sdPage_"], [id^="admPage_"] {
        display: none;
        flex: 1;
        overflow-y: auto;
        flex-direction: column;
        -webkit-overflow-scrolling: touch;
        background: #f3f4f6;
        padding-bottom: 60px;
    }
    [id^="sdPage_"].active, [id^="admPage_"].active {
        display: flex !important;
        flex-direction: column !important;
    }

    /* ── Admin floating entry button ───────────────────────────────────────── */
    #admFloatingBtn {
        display: none;
        position: fixed;
        bottom: 70px; right: 16px;
        width: 52px; height: 52px;
        border-radius: 50%;
        background: linear-gradient(135deg,#111,#374151);
        color: #fff;
        border: none;
        cursor: pointer;
        font-size: 20px;
        z-index: 500;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        align-items: center; justify-content: center;
    }
    `;
    // Remove old conflicting style if present
    document.getElementById('uiFixCSS')?.remove();
    document.head.appendChild(s);
})();

// ─── Rebuild More Sheet show/hide completely ──────────────────────────────────
function showMore() {
    const overlay = document.getElementById('jmMoreOverlay');
    const sheet   = document.getElementById('jmMoreSheet');

    if (!sheet) { console.warn('[UIFix] jmMoreSheet not found'); return; }

    // Force inline styles (highest priority — override everything)
    if (overlay) {
        overlay.style.cssText = [
            'display:block',
            'position:fixed',
            'top:0','left:0','width:100%','height:100%',
            'background:rgba(0,0,0,0.5)',
            'z-index:99990',
        ].join('!important;') + '!important';
    }

    sheet.style.cssText = [
        'display:block',
        'position:fixed',
        'bottom:0','left:0','right:0',
        'background:#fff',
        'border-radius:20px 20px 0 0',
        'padding:12px 14px 32px',
        'z-index:99991',
        'max-height:85vh',
        'overflow-y:auto',
        'box-shadow:0 -8px 40px rgba(0,0,0,0.25)',
        '-webkit-overflow-scrolling:touch',
    ].join('!important;') + '!important';

    // Inject admin button every time sheet opens
    setTimeout(_ensureAdminInMenu, 50);
}

function hideMore() {
    const overlay = document.getElementById('jmMoreOverlay');
    const sheet   = document.getElementById('jmMoreSheet');
    if (overlay) overlay.style.display = 'none';
    if (sheet)   sheet.style.display   = 'none';
}

// Override ALL show/hide functions
window._showMore      = showMore;
window._hideMore      = hideMore;
window._jmShowMore    = showMore;
window._jmHideMore    = hideMore;
window.showMore       = showMore;
window.hideMore       = hideMore;

// ─── Rebuild bottom nav ───────────────────────────────────────────────────────
function _rebuildBottomNav() {
    // Remove ALL existing bottom navs (both stub and any real ones)
    document.querySelectorAll('.jm-bottom-nav, #jmBottomNav').forEach(el => el.remove());

    const nav = document.createElement('div');
    nav.id = 'jmBottomNav';
    nav.style.cssText = [
        'position:sticky', 'bottom:0', 'left:0', 'right:0',
        'height:56px', 'background:#fff',
        'border-top:1px solid #e5e7eb',
        'display:flex', 'align-items:stretch',
        'flex-shrink:0', 'z-index:200',
        'box-shadow:0 -2px 12px rgba(0,0,0,0.08)',
    ].join('!important;') + '!important';

    const currentPage = window._state?.page || 'home';
    const tabs = [
        { page:'home',       icon:'fa-home',         label:'Home'    },
        { page:'categories', icon:'fa-th-large',     label:'Browse'  },
        { page:'wishlist',   icon:'fa-heart',        label:'Saved'   },
        { page:'orders',     icon:'fa-shopping-bag', label:'Orders'  },
        { page:'account',    icon:'fa-user',         label:'Account' },
    ];

    nav.innerHTML = tabs.map(t => `
        <button class="jm-nav-tab${t.page===currentPage?' active':''}" data-page="${t.page}"
            onclick="window._jmNav('${t.page}')"
            style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:none;background:none;cursor:pointer;font-size:10px;font-weight:600;color:${t.page===currentPage?'#f57224':'#9ca3af'};padding:6px 2px;position:relative;min-width:0">
            <i class="fas ${t.icon}" style="font-size:18px;color:inherit"></i>
            <span style="color:inherit;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52px">${t.label}</span>
        </button>
    `).join('') + `
        <button id="jmMoreTab" onclick="window._jmShowMore()"
            style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:none;background:none;cursor:pointer;padding:6px 2px;min-width:0">
            <i class="fas fa-ellipsis-h" style="font-size:18px;color:#f57224"></i>
            <span style="color:#f57224;font-size:10px;font-weight:800">Menu</span>
        </button>
    `;

    // Insert as LAST child of sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.appendChild(nav);
    }
}

// ─── Update More button in header ─────────────────────────────────────────────
function _updateMoreBtn() {
    const btn = document.getElementById('jmMoreBtn');
    if (!btn) return;
    btn.style.cssText = 'background:#f57224!important;color:#fff!important;border-radius:8px!important;width:auto!important;padding:0 12px!important;gap:5px!important;font-size:13px!important;font-weight:700!important;display:flex!important;align-items:center!important;justify-content:center!important;border:none!important;cursor:pointer!important;height:36px!important;flex-shrink:0!important';
    btn.innerHTML = '<i class="fas fa-th" style="color:#fff;font-size:14px"></i><span>More</span>';
    btn.onclick = showMore;
}

// ─── Ensure admin entry in More menu ─────────────────────────────────────────
function _ensureAdminInMenu() {
    const user = window.currentUser || window.__kynUser || {};
    const isAdmin = user.role==='admin' || user.role==='moderator' || user.isAdmin || 
                    (()=>{ try{return JSON.parse(localStorage.getItem('_adminMode')||'false')}catch(_){return false} })();
    if (!isAdmin) return;

    const grid = document.querySelector('.jm-more-grid');
    if (!grid || document.getElementById('admMenuBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'admMenuBtn';
    btn.className = 'jm-more-item';
    btn.style.cssText = 'background:linear-gradient(135deg,#111,#374151)!important;color:#fff!important;border-radius:12px!important';
    btn.innerHTML = `
        <i class="fas fa-shield-alt" style="color:#fff!important;font-size:20px!important"></i>
        <span style="color:#fff!important;font-weight:800!important">Admin</span>
    `;
    btn.onclick = () => { hideMore(); window._jmNavMore('admin-dashboard'); };
    grid.prepend(btn);

    // Also show floating admin button
    let fab = document.getElementById('admFloatingBtn');
    if (!fab) {
        fab = document.createElement('button');
        fab.id = 'admFloatingBtn';
        fab.innerHTML = '⚙️';
        fab.title = 'Admin Panel';
        fab.onclick = () => window._jmNavMore('admin-dashboard');
        document.body.appendChild(fab);
    }
    fab.style.display = 'flex';
}

// ─── Rebuild More menu items to be complete & visible ─────────────────────────
function _rebuildMoreMenu() {
    const sheet = document.getElementById('jmMoreSheet');
    if (!sheet) return;

    const ITEMS = [
        // Seller section
        { page:'seller-dashboard',    icon:'fa-store',          label:'Seller Hub',    color:'#f57224', section:'seller' },
        { page:'my-listings',         icon:'fa-box-open',       label:'My Listings',   section:'seller' },
        { page:'seller-inventory',    icon:'fa-warehouse',      label:'Inventory',     section:'seller' },
        { page:'seller-analytics',    icon:'fa-chart-line',     label:'Analytics',     section:'seller' },
        { page:'seller-payouts',      icon:'fa-money-bill-wave',label:'Payouts',       section:'seller' },
        { page:'seller-shipping',     icon:'fa-shipping-fast',  label:'Shipping',      section:'seller' },
        { page:'seller-returns',      icon:'fa-undo-alt',       label:'Returns',       section:'seller' },
        { page:'seller-subscription', icon:'fa-crown',          label:'Plans',         section:'seller' },
        // Buyer section
        { page:'addresses',           icon:'fa-map-marker-alt', label:'Addresses',     section:'buyer' },
        { page:'vouchers',            icon:'fa-ticket-alt',     label:'Vouchers',      section:'buyer' },
        { page:'analytics',           icon:'fa-chart-bar',      label:'My Stats',      section:'buyer' },
        { page:'loyalty',             icon:'fa-trophy',         label:'Loyalty',       section:'buyer' },
        { page:'wallet',              icon:'fa-wallet',         label:'Wallet',        section:'buyer' },
        { page:'referral',            icon:'fa-gift',           label:'Referral',      section:'buyer' },
        { page:'notes',               icon:'fa-sticky-note',    label:'Notes',         section:'buyer' },
        { page:'trust',               icon:'fa-shield-alt',     label:'Trust',         section:'buyer' },
        { page:'leaderboard',         icon:'fa-medal',          label:'Leaders',       section:'buyer' },
        { page:'notifprefs',          icon:'fa-bell',           label:'Alerts',        section:'buyer' },
        { page:'inbox',               icon:'fa-envelope',       label:'Inbox',         section:'buyer' },
        { page:'follow-sellers',      icon:'fa-store',          label:'Following',     section:'buyer' },
        { page:'reviews-page',        icon:'fa-star',           label:'Reviews',       section:'buyer' },
    ];

    // Create new button to open listing
    const createBtn = `<button class="jm-more-item" id="createListingMoreBtn" onclick="window._jmHideMore?.();setTimeout(()=>{ const b=document.getElementById('createListingBtn'); if(b)b.click(); },100)" style="background:linear-gradient(135deg,#f57224,#ff4e16)!important;color:#fff!important;border-radius:12px!important"><i class="fas fa-plus-circle" style="color:#fff!important"></i><span style="color:#fff!important">Sell</span></button>`;

    sheet.innerHTML = `
        <div class="jm-more-handle"></div>
        <div class="jm-more-title">Menu</div>

        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin-bottom:8px;padding:0 2px">🏪 Seller Tools</div>
        <div class="jm-more-grid" id="jmMoreGridSeller">
            ${createBtn}
            ${ITEMS.filter(i=>i.section==='seller').map(i=>`
            <button class="jm-more-item" onclick="window._jmHideMore();window._jmNavMore('${i.page}')" ${i.color?`style="background:${i.color}!important;color:#fff!important"`:''}">
                <i class="fas ${i.icon}" ${i.color?`style="color:#fff!important"`:''}></i>
                <span ${i.color?`style="color:#fff!important"`:''}>${i.label}</span>
            </button>`).join('')}
        </div>

        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin:16px 0 8px;padding:0 2px">👤 Buyer Tools</div>
        <div class="jm-more-grid" id="jmMoreGridBuyer">
            ${ITEMS.filter(i=>i.section==='buyer').map(i=>`
            <button class="jm-more-item" onclick="window._jmHideMore();window._jmNavMore('${i.page}')">
                <i class="fas ${i.icon}"></i>
                <span>${i.label}</span>
            </button>`).join('')}
        </div>

        <div id="admMoreSection" style="display:none">
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin:16px 0 8px;padding:0 2px">⚙️ Administration</div>
            <div class="jm-more-grid" id="jmMoreGridAdmin">
                ${[
                    ['admin-dashboard','fa-tachometer-alt','Dashboard'],
                    ['admin-products','fa-box','Products'],
                    ['admin-sellers','fa-store','Sellers'],
                    ['admin-buyers','fa-users','Buyers'],
                    ['admin-orders','fa-receipt','Orders'],
                    ['admin-payouts','fa-money-check','Payouts'],
                    ['admin-analytics','fa-chart-pie','Analytics'],
                    ['admin-settings','fa-cog','Settings'],
                ].map(([p,ic,lb])=>`
                <button class="jm-more-item" style="background:linear-gradient(135deg,#1f2937,#374151)!important;color:#fff!important" onclick="window._jmHideMore();window._jmNavMore('${p}')">
                    <i class="fas ${ic}" style="color:#9ca3af!important"></i>
                    <span style="color:#d1d5db!important">${lb}</span>
                </button>`).join('')}
            </div>
        </div>
    `;

    // Show admin section if admin
    _showAdminSection();
}

function _showAdminSection() {
    const user = window.currentUser || window.__kynUser || {};
    const isAdmin = user.role==='admin' || user.role==='moderator' || user.isAdmin ||
                    (()=>{ try{return JSON.parse(localStorage.getItem('_adminMode')||'false')}catch(_){return false} })();
    const sec = document.getElementById('admMoreSection');
    if (sec) sec.style.display = isAdmin ? 'block' : 'none';

    // Floating admin button
    let fab = document.getElementById('admFloatingBtn');
    if (isAdmin) {
        if (!fab) {
            fab = document.createElement('button');
            fab.id = 'admFloatingBtn';
            fab.style.cssText = 'display:flex;position:fixed;bottom:70px;right:16px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#111,#374151);color:#fff;border:none;cursor:pointer;font-size:22px;z-index:500;box-shadow:0 4px 16px rgba(0,0,0,.35);align-items:center;justify-content:center;';
            fab.innerHTML = '⚙️';
            fab.title = 'Admin Panel';
            fab.onclick = () => window._jmNavMore('admin-dashboard');
            document.body.appendChild(fab);
        }
        fab.style.display = 'flex';
    }
}

// ─── Patch _jmNav to update bottom tab active state ───────────────────────────
const _origNav = window._jmNav;
window._jmNav = function(page, subpage) {
    _origNav?.call(this, page, subpage);
    // Update bottom nav active tab with inline styles
    document.querySelectorAll('#jmBottomNav button[data-page]').forEach(tab => {
        const isActive = tab.dataset.page === page;
        tab.style.color = isActive ? '#f57224' : '#9ca3af';
        const icon = tab.querySelector('i');
        if (icon) icon.style.color = isActive ? '#f57224' : '#9ca3af';
        const span = tab.querySelector('span');
        if (span) span.style.color = isActive ? '#f57224' : '#9ca3af';
    });
};

// ─── Account page: inject admin quick link ────────────────────────────────────
const _origRenderAccount = window._renderAccount;
window._renderAccount = function() {
    _origRenderAccount?.call(this);
    setTimeout(() => {
        const user = window.currentUser || window.__kynUser || {};
        const isAdmin = user.role==='admin' || user.role==='moderator' || user.isAdmin ||
                        (()=>{ try{return JSON.parse(localStorage.getItem('_adminMode')||'false')}catch(_){return false} })();
        if (!isAdmin) return;
        const page = document.getElementById('jmPageAccount');
        if (!page || document.getElementById('admAcctShortcut')) return;
        const btn = document.createElement('div');
        btn.id = 'admAcctShortcut';
        btn.style.cssText = 'margin:0 16px 12px;background:linear-gradient(135deg,#111,#374151);border-radius:14px;padding:16px;display:flex;align-items:center;gap:14px;cursor:pointer;';
        btn.innerHTML = '<div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">⚙️</div><div style="flex:1"><div style="font-weight:800;font-size:14px;color:#fff">Admin Command Center</div><div style="font-size:12px;color:rgba(255,255,255,.65);margin-top:2px">Manage products, sellers, orders & more</div></div><i class="fas fa-chevron-right" style="color:rgba(255,255,255,.4)"></i>';
        btn.onclick = () => window._jmNavMore('admin-dashboard');
        page.insertBefore(btn, page.firstChild.nextSibling);
    }, 200);
};

// ─── Initialize ───────────────────────────────────────────────────────────────
function _init() {
    _rebuildBottomNav();
    _updateMoreBtn();
    _rebuildMoreMenu();
    _showAdminSection();

    // Re-inject on every showMore call
    const origShowMore = window._jmShowMore;
    window._jmShowMore = function() {
        showMore();
        _rebuildMoreMenu(); // Refresh menu content every open
        _showAdminSection();
    };

    // Patch overlay click to hide
    const overlay = document.getElementById('jmMoreOverlay');
    if (overlay) overlay.onclick = hideMore;

    console.log('[marketplace-ui-fix.js] ✅ UI fixed — More sheet, bottom nav, admin entry all rebuilt');
}

// Run after DOM ready and again after JS modules load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
} else {
    _init();
}
// Re-run after everything loads
window.addEventListener('load', () => { setTimeout(_init, 300); });
// Also re-run after auth completes (user role available)
window.addEventListener('ecom:ready', () => { setTimeout(_showAdminSection, 200); });
window.addEventListener('message', (e) => {
    if (e.data?.type === 'tools:active' || e.data?.type === 'PARENT_READY') {
        setTimeout(_init, 500);
    }
});

})();
