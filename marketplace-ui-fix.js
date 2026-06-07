/**
 * marketplace-ui-fix.js v4 — DEFINITIVE UI FIX
 * Loads LAST. Forces all layout via inline styles.
 * Fixes: white screens, invisible menu, admin icon, empty states.
 */
(function _UIFix() {
'use strict';

// ─── Force CSS ────────────────────────────────────────────────────────────────
const STYLE = `
html,body{height:100%!important;margin:0!important;padding:0!important;overflow:hidden!important}
.app-container{height:100vh!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}
#sidebar{width:100%!important;height:100%!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;position:relative!important}
.jm-page{display:none;min-height:0;overflow:hidden;flex-direction:column}
.jm-page.active{display:flex!important;flex-direction:column!important;flex:1!important;min-height:0!important;overflow:hidden!important}
/* FIX: Account page inner wrap must scroll — not the page container */
#jmPageAccount.active .jm-account-wrap{flex:1!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;min-height:0!important;padding-bottom:80px!important}
/* FIX: All scrollable inner pages need this pattern */
.jm-page.active > .jm-cat-layout,.jm-page.active > .jm-cart-wrap,.jm-page.active > .jm-wishlist-wrap{flex:1!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;min-height:0!important;padding-bottom:70px!important}
[id^="sdPage_"],[id^="admPage_"]{display:none;min-height:0;overflow:hidden;flex-direction:column;background:#f3f4f6}
[id^="sdPage_"].active,[id^="admPage_"].active{display:flex!important;flex-direction:column!important;flex:1!important;min-height:0!important;overflow:hidden!important;background:#f3f4f6!important}
.sd-wrap,.adm-page{display:flex!important;flex-direction:column!important;flex:1!important;min-height:0!important;overflow:hidden!important;background:#f3f4f6!important}
.sd-head,.adm-header{flex-shrink:0!important;position:sticky!important;top:0!important;z-index:10!important}
.sd-body,.adm-body{flex:1!important;overflow-y:auto!important;min-height:0!important;-webkit-overflow-scrolling:touch!important;padding-bottom:70px!important}
#jmMoreOverlay{display:none;position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;background:rgba(0,0,0,.5)!important;z-index:88888!important}
#jmMoreSheet{display:none;position:fixed!important;bottom:0!important;left:0!important;right:0!important;width:100%!important;max-height:88vh!important;overflow-y:auto!important;background:#fff!important;border-radius:20px 20px 0 0!important;padding:12px 12px 40px!important;z-index:88889!important;box-shadow:0 -8px 32px rgba(0,0,0,.22)!important;box-sizing:border-box!important}
.jm-more-grid{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:8px!important;margin-bottom:6px!important}
@media(max-width:340px){.jm-more-grid{grid-template-columns:repeat(3,1fr)!important}}
.jm-more-item{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:4px!important;background:#f9fafb!important;border:none!important;border-radius:12px!important;padding:11px 5px!important;cursor:pointer!important;font-size:11px!important;font-weight:600!important;color:#111!important;text-align:center!important;min-height:64px!important}
.jm-more-item:active{background:#fff8f5!important}
.jm-more-item i{font-size:19px!important;color:#f57224!important}
.jm-more-handle{width:40px!important;height:4px!important;background:#d1d5db!important;border-radius:2px!important;margin:0 auto 12px!important}
#jmBottomNav{display:flex!important;align-items:stretch!important;flex-shrink:0!important;height:56px!important;background:#fff!important;border-top:1px solid #e5e7eb!important;z-index:300!important;box-shadow:0 -2px 12px rgba(0,0,0,.07)!important}
.jm-bottom-nav{display:none!important}
#jmHeader,.jm-header{display:flex!important;align-items:center!important;gap:6px!important;padding:8px 10px!important;background:#fff!important;border-bottom:1px solid #e5e7eb!important;flex-shrink:0!important;min-height:50px!important;z-index:100!important}
#jmMoreBtn{background:#f57224!important;color:#fff!important;border:none!important;border-radius:8px!important;padding:0 12px!important;height:36px!important;display:flex!important;align-items:center!important;gap:5px!important;font-size:13px!important;font-weight:700!important;cursor:pointer!important;flex-shrink:0!important}
`;
(()=>{
    document.getElementById('uiFix4')?.remove();
    const s=document.createElement('style');s.id='uiFix4';s.textContent=STYLE;
    document.head.appendChild(s);
})();

// ─── show/hide More ───────────────────────────────────────────────────────────
function showMore(){
    const ov=document.getElementById('jmMoreOverlay'),sh=document.getElementById('jmMoreSheet');
    if(!sh)return;
    if(ov) ov.style.cssText='display:block!important;position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;background:rgba(0,0,0,.5)!important;z-index:88888!important';
    sh.style.cssText='display:block!important;position:fixed!important;bottom:0!important;left:0!important;right:0!important;max-height:88vh!important;overflow-y:auto!important;background:#fff!important;border-radius:20px 20px 0 0!important;padding:12px 12px 40px!important;z-index:88889!important;box-shadow:0 -8px 32px rgba(0,0,0,.22)!important;box-sizing:border-box!important';
    rebuildMenu();
    const ov2=document.getElementById('jmMoreOverlay');
    if(ov2) ov2.onclick=hideMore;
}
function hideMore(){
    const ov=document.getElementById('jmMoreOverlay'),sh=document.getElementById('jmMoreSheet');
    if(ov) ov.style.cssText='display:none!important';
    if(sh) sh.style.cssText='display:none!important';
}
window._jmShowMore=window._showMore=showMore;
window._jmHideMore=window._hideMore=hideMore;

// ─── Admin check ──────────────────────────────────────────────────────────────
function isAdmin(){
    // FIX 2: Extended — covers all session paths
    const u=window.currentUser||window.__kynUser||window.__PARENT_SESSION__?.user||{};
    if(u.role==='admin'||u.role==='moderator'||u.isAdmin===true) return true;
    const lsRole=localStorage.getItem('userRole')||'';
    if(lsRole==='admin'||lsRole==='moderator') return true;
    if(window.__cachedUserRole==='admin'||window.__cachedUserRole==='moderator') return true;
    try{return JSON.parse(localStorage.getItem('_adminMode')||'false')}catch(_){return false}
}
// FIX 2: React to role updates from parent
window.addEventListener('message',function(e){
    if(e.data?.type==='USER_ROLE_UPDATE'||e.data?.type==='SESSION_DATA'){
        const u=e.data.user||e.data.payload?.user||{};
        const role=e.data.role||u.role||localStorage.getItem('userRole')||'user';
        if(role){window.__cachedUserRole=role;localStorage.setItem('userRole',role);}
        if(window.currentUser){window.currentUser.role=role;window.currentUser.isAdmin=isAdmin();}
        setTimeout(()=>{ensureAdminFab();rebuildMenu();},100);
    }
});
window._jmEnsureAdminFab=function(){ensureAdminFab();};

// ─── Rebuild More menu ────────────────────────────────────────────────────────
function rebuildMenu(){
    const sh=document.getElementById('jmMoreSheet');
    if(!sh)return;
    const adm=isAdmin();
    sh.innerHTML=`
<div class="jm-more-handle"></div>
<div style="font-size:15px;font-weight:800;text-align:center;margin-bottom:14px;color:#111">Menu</div>

<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin-bottom:8px">🏪 Seller</div>
<div class="jm-more-grid">
<button class="jm-more-item" onclick="hideMore();_jmHideMore();setTimeout(()=>document.getElementById('createListingBtn')?.click(),100)" style="background:#f57224!important"><i class="fas fa-plus-circle" style="color:#fff!important"></i><span style="color:#fff!important">Sell</span></button>
${[['seller-dashboard','fa-tachometer-alt','#f57224','Hub'],['my-listings','fa-box-open','#3b82f6','Listings'],
['seller-inventory','fa-warehouse','#8b5cf6','Stock'],['seller-shipping','fa-truck','#f59e0b','Orders'],
['seller-payouts','fa-money-bill-wave','#22c55e','Payouts'],['seller-analytics','fa-chart-line','#ec4899','Stats'],
['seller-returns','fa-undo','#ef4444','Returns'],['seller-verification','fa-shield-alt','#10b981','Verify']
].map(([p,i,c,l])=>`<button class="jm-more-item" onclick="window._jmHideMore();window._jmNavMore('${p}')"><i class="fas ${i}" style="color:${c}!important"></i><span>${l}</span></button>`).join('')}
</div>

<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin:14px 0 8px">👤 Buyer</div>
<div class="jm-more-grid">
${[['wallet','fa-wallet','#22c55e','Wallet'],['loyalty','fa-trophy','#f59e0b','Points'],
['referral','fa-gift','#ec4899','Refer'],['addresses','fa-map-marker-alt','#8b5cf6','Address'],
['vouchers','fa-ticket-alt','#f97316','Vouchers'],['notifprefs','fa-bell','#6366f1','Alerts'],
['notes','fa-sticky-note','#84cc16','Notes'],['trust','fa-shield-alt','#10b981','Trust'],
['leaderboard','fa-medal','#f59e0b','Leaders'],['reviews-page','fa-star','#eab308','Reviews'],
['follow-sellers','fa-store','#06b6d4','Following'],['inbox','fa-envelope','#3b82f6','Inbox']
].map(([p,i,c,l])=>`<button class="jm-more-item" onclick="window._jmHideMore();window._jmNavMore('${p}')"><i class="fas ${i}" style="color:${c}!important"></i><span>${l}</span></button>`).join('')}
</div>

${adm?`
<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin:14px 0 8px">⚙️ Admin</div>
<div class="jm-more-grid">
${[['admin-dashboard','fa-tachometer-alt','Control'],['admin-products','fa-box','Products'],
['admin-sellers','fa-store','Sellers'],['admin-buyers','fa-users','Buyers'],
['admin-orders','fa-receipt','Orders'],['admin-payouts','fa-money-check','Payouts'],
['admin-analytics','fa-chart-pie','Analytics'],['admin-settings','fa-cog','Settings']
].map(([p,i,l])=>`<button class="jm-more-item" onclick="window._jmHideMore();window._jmNavMore('${p}')" style="background:linear-gradient(135deg,#1f2937,#374151)!important"><i class="fas ${i}" style="color:#9ca3af!important"></i><span style="color:#d1d5db!important">${l}</span></button>`).join('')}
</div>`:''}`;
}

// ─── Rebuild bottom nav ───────────────────────────────────────────────────────
function rebuildBottomNav(){
    document.querySelectorAll('.jm-bottom-nav,#jmBottomNav').forEach(e=>e.remove());
    const nav=document.createElement('div');
    nav.id='jmBottomNav';
    nav.style.cssText='display:flex!important;align-items:stretch!important;flex-shrink:0!important;height:56px!important;background:#fff!important;border-top:1px solid #e5e7eb!important;z-index:300!important;box-shadow:0 -2px 12px rgba(0,0,0,.07)!important';
    const cur=window._state?.page||'home';
    const TABS=[
        {p:'home',i:'fa-home',l:'Home'},
        {p:'categories',i:'fa-th-large',l:'Browse'},
        {p:'wishlist',i:'fa-heart',l:'Saved'},
        {p:'orders',i:'fa-shopping-bag',l:'Orders'},
        {p:'account',i:'fa-user',l:'Account'},
    ];
    nav.innerHTML=TABS.map(t=>`<button data-page="${t.p}" onclick="window._jmNav('${t.p}')" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:none;background:none;cursor:pointer;font-size:10px;font-weight:600;color:${t.p===cur?'#f57224':'#9ca3af'};padding:4px 2px;min-width:0;outline:none"><i class="fas ${t.i}" style="font-size:18px;color:inherit"></i><span style="color:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52px">${t.l}</span></button>`).join('')+`
    <button id="jmMoreTab" onclick="window._jmShowMore()" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:none;background:none;cursor:pointer;padding:4px 2px;min-width:0;outline:none">
        <i class="fas fa-ellipsis-h" style="font-size:18px;color:#f57224"></i>
        <span style="color:#f57224;font-size:10px;font-weight:800">Menu</span>
    </button>`;
    const sidebar=document.getElementById('sidebar');
    const bn=document.getElementById('jmBottomNav');
    if(sidebar){bn?sidebar.insertBefore(nav,bn):sidebar.appendChild(nav);}
    else document.body.appendChild(nav);
}

// ─── Set active nav tab ───────────────────────────────────────────────────────
function setActive(page){
    document.querySelectorAll('#jmBottomNav [data-page]').forEach(b=>{
        const on=b.dataset.page===page;
        b.style.color=on?'#f57224':'#9ca3af';
        b.querySelectorAll('i,span').forEach(e=>e.style.color=on?'#f57224':'#9ca3af');
    });
}

// ─── Patch _jmNav ─────────────────────────────────────────────────────────────
const _origNav=window._jmNav;
window._jmNav=function(p,s){_origNav?.call(this,p,s);setTimeout(()=>setActive(p),40);};

// ─── Patch _jmNavMore — ensure page container has correct height ──────────────
const _origMore=window._jmNavMore;
window._jmNavMore=function(page){
    const prefix=/^admin-/.test(page)?'admPage_':'sdPage_';
    const isMine=/^(seller-|my-listings|admin-|admin-approval)/.test(page);
    if(isMine){
        const pid=prefix+page.replace(/-/g,'_');
        let el=document.getElementById(pid);
        if(!el){
            el=document.createElement('div');
            el.id=pid;el.className='jm-page';
            const sidebar=document.getElementById('sidebar')||document.body;
            const nav=document.getElementById('jmBottomNav');
            nav?sidebar.insertBefore(el,nav):sidebar.appendChild(el);
        }
        document.querySelectorAll('.jm-page').forEach(p=>p.classList.remove('active'));
        el.classList.add('active');
        // Force inline styles — critical so flex layout works
        el.style.cssText='display:flex!important;flex-direction:column!important;flex:1!important;min-height:0!important;overflow:hidden!important;background:#f3f4f6!important';
        hideMore();
    }
    _origMore?.call(this,page);
};

// ─── Update More button in header ─────────────────────────────────────────────
function updateMoreBtn(){
    const btn=document.getElementById('jmMoreBtn');
    if(!btn)return;
    btn.innerHTML='<i class="fas fa-th" style="color:#fff;font-size:13px"></i><span style="color:#fff">Menu</span>';
    btn.onclick=showMore;
    btn.style.cssText='background:#f57224!important;color:#fff!important;border:none!important;border-radius:8px!important;padding:0 12px!important;height:36px!important;display:flex!important;align-items:center!important;gap:5px!important;font-size:13px!important;font-weight:700!important;cursor:pointer!important;flex-shrink:0!important';
}

// ─── Admin FAB ────────────────────────────────────────────────────────────────
function ensureAdminFab(){
    if(!isAdmin())return;
    let fab=document.getElementById('admFab');
    if(!fab){
        fab=document.createElement('button');
        fab.id='admFab';
        fab.innerHTML='⚙️';
        fab.title='Admin Panel';
        fab.setAttribute('aria-label','Admin Panel');
        fab.onclick=()=>window._jmNavMore('admin-dashboard');
        document.body.appendChild(fab);
    }
    // FIX: z-index 9999 so it always shows above marketplace cards;
    // bottom 80px so it clears the bottom nav bar on mobile (56px nav + safe area).
    fab.style.cssText='display:flex!important;position:fixed!important;bottom:80px!important;right:14px!important;width:50px!important;height:50px!important;border-radius:50%!important;background:linear-gradient(135deg,#111,#374151)!important;color:#fff!important;border:none!important;cursor:pointer!important;font-size:22px!important;z-index:9999!important;box-shadow:0 4px 16px rgba(0,0,0,.35)!important;align-items:center!important;justify-content:center!important';
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(){
    rebuildBottomNav();
    updateMoreBtn();
    ensureAdminFab();
    const ov=document.getElementById('jmMoreOverlay');
    if(ov) ov.onclick=hideMore;
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
else init();
[200,500,1000,2000,4000].forEach(t=>setTimeout(()=>{
    rebuildBottomNav();updateMoreBtn();ensureAdminFab();
},t));
window.addEventListener('load',()=>setTimeout(init,200));
window.addEventListener('message',e=>{
    if(e.data?.type==='tools:active'||e.data?.type==='PARENT_READY') setTimeout(init,300);
});

// FIX: Re-check admin status whenever account page is opened (role may arrive late via postMessage)
const _origJmNav = window._jmNav;
window._jmNav = function(p, s) {
    _origJmNav?.call(this, p, s);
    if (p === 'account') setTimeout(ensureAdminFab, 100);
    setTimeout(() => setActive(p), 40);
};

// FIX: Also refresh when any session/role postMessage arrives (covers late parent injection)
window.addEventListener('message', function(e) {
    const t = e.data?.type;
    if (t === 'PARENT_SESSION' || t === 'SESSION_DATA' || t === 'USER_DATA' || t === 'CHILD_SESSION') {
        const u = e.data?.user || e.data?.payload?.user || e.data?.session?.user || {};
        const role = u.role || e.data?.role || e.data?.payload?.role || '';
        if (role) {
            window.__cachedUserRole = role;
            try { localStorage.setItem('userRole', role); } catch(_) {}
        }
        setTimeout(() => { ensureAdminFab(); rebuildMenu(); }, 150);
    }
});

console.log('[ui-fix v4] ✅ loaded');
})();
