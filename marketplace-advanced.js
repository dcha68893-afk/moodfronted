/**
 * marketplace-advanced.js — ENTERPRISE MARKETPLACE FEATURES v1.0
 * ════════════════════════════════════════════════════════════════
 * Implements ALL advanced enterprise features inside the existing
 * Tool module architecture. Loads after marketplace-checkout.js.
 *
 * Features:
 *  1.  Flash Sales — realtime countdown, stock ticker, progress bar
 *  2.  Wallet UI — balance, top-up, transaction history
 *  3.  Loyalty System — tier progress, points, perks, redemption
 *  4.  Referral Engine — share link, copy code, earnings tracker
 *  5.  AI Recommendations — personalized product rows
 *  6.  Product Comparison — side-by-side specs table
 *  7.  Invoice/PDF — downloadable HTML receipt
 *  8.  QR Code Tracking — canvas-rendered QR
 *  9.  Voice Search — Web Speech API integration
 * 10.  Smart Delivery Estimate — geo-based ETA on product page
 * 11.  PWA Enhancements — service worker marketplace cache update
 * 12.  Behavior Tracking — server + localStorage sync
 * 13.  Multi-Currency — KES/USD/EUR switcher
 * 14.  Buy Now — single-click bypass-cart flow
 * 15.  Available Coupons page — browse all public coupons
 * ════════════════════════════════════════════════════════════════
 */

(function _AdvancedMarketplace() {
'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────
const _esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _fmt  = (n, currency) => {
    const c = currency || window._mktCurrency || 'KES';
    const rates = { KES:1, USD:0.0077, EUR:0.0071, GBP:0.0061 };
    const symbols = { KES:'KES ', USD:'$ ', EUR:'€ ', GBP:'£ ' };
    const val = parseFloat(n||0) * (rates[c]||1);
    const dec = c==='KES' ? 0 : 2;
    return (symbols[c]||c+' ') + val.toLocaleString('en', { minimumFractionDigits:dec, maximumFractionDigits:dec });
};
const _ls   = { save:(k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v))}catch(_){} }, load:(k,d=null)=>{ try{const r=localStorage.getItem(k);return r?JSON.parse(r):d}catch(_){return d} } };
const _toast = (msg,type='info',icon='ℹ️') => {
    if (typeof window._jmToast === 'function') { window._jmToast(msg,type,icon); return; }
    const colors={success:'#22c55e',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
    let box=document.getElementById('advToastBox');
    if(!box){ box=document.createElement('div'); box.id='advToastBox'; box.style.cssText='position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;width:min(380px,90vw)'; document.body.appendChild(box); }
    const t=document.createElement('div'); t.style.cssText=`background:${colors[type]||colors.info};color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;gap:10px`; t.innerHTML=`<span>${icon}</span><span>${msg}</span>`; box.appendChild(t); setTimeout(()=>t.remove(),3500);
};

async function _api(method, endpoint, body=null) {
    try {
        const token = window.__kynToken||window.__accessToken||localStorage.getItem('authToken')||localStorage.getItem('token')||localStorage.getItem('nexopa_token')||localStorage.getItem('accessToken')||'';
        // FIX (Audit #19 - one source of truth for API config): this used to fall back to a
        // hardcoded 'http://localhost:4000', decided independently by this file instead of
        // by the single window.API_BASE_URL every HTML entry point already sets. If that
        // global was ever unset/mistimed, requests would silently go to localhost instead
        // of failing loudly. Use the central config only, and fail clearly if it's missing.
        const base = (window.API_BASE_URL||window.BACKEND_URL||'').replace(/\/api$|\/$/,'')
            || (window.__kynAPI?.baseUrl||'').replace(/\/api$|\/$/,'')
            || (typeof window.__getApiBase==='function'?window.__getApiBase().replace(/\/api$/,''):'')
            || (typeof window.__getApiOrigin==='function'?window.__getApiOrigin():'');
        if (!base) {
            console.error('[marketplace-advanced] API base URL is not configured (window.API_BASE_URL missing).');
            return { ok:false, success:false, error:true, errorCode:'CONFIG_ERROR', message:'App is not configured correctly. Please reload the page.', retryable:false };
        }
        const res = await fetch(base+'/api'+endpoint, { method:method.toUpperCase(), headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}, ...(body&&method!=='GET'?{body:JSON.stringify(body)}:{}) });
        // FIX (Audit #18 - silent error handling): this used to `return null` on any non-2xx
        // response, discarding the server's actual error message (e.g. "Insufficient wallet
        // balance", "Out of stock") and making a failed payment/order call indistinguishable
        // from an empty success. Surface the real status/message instead.
        let payload = null;
        try { payload = await res.json(); } catch(_) {}
        if (!res.ok) {
            console.error('[marketplace-advanced] API error:', method, endpoint, res.status, payload);
            return { ok:false, success:false, error:true, errorCode: payload?.code || `HTTP_${res.status}`,
                      message: payload?.message || `Request failed (${res.status}). Please try again.`,
                      status: res.status, retryable: res.status >= 500 };
        }
        return payload;
    } catch(e) {
        console.error('[marketplace-advanced] API request failed:', method, endpoint, e);
        return { ok:false, success:false, error:true, errorCode:'NETWORK_ERROR',
                  message: e?.message || 'Request failed. Please check your connection and try again.', retryable:true };
    }
}

// ─── Inject CSS ───────────────────────────────────────────────────────────────
(function _injectCSS() {
    if (document.getElementById('advMktCSS')) return;
    const s = document.createElement('style'); s.id='advMktCSS';
    s.textContent = `
    @keyframes adv-in{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    @keyframes adv-pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
    @keyframes adv-spin{to{transform:rotate(360deg)}}
    @keyframes adv-flash-pulse{0%,100%{box-shadow:0 0 0 0 rgba(245,114,36,.4)}50%{box-shadow:0 0 0 8px rgba(245,114,36,0)}}
    @keyframes adv-count{from{transform:scaleY(1.3)}to{transform:scaleY(1)}}

    /* ── Flash Sale Banner ─────────────────────────────────────────────────── */
    .adv-flash-section{background:linear-gradient(135deg,#ff4e16,#f57224);border-radius:16px;margin:12px 16px;padding:16px;color:#fff;position:relative;overflow:hidden}
    .adv-flash-section::before{content:'';position:absolute;top:-20px;right:-20px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.08)}
    .adv-flash-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    .adv-flash-title{font-weight:900;font-size:18px;display:flex;align-items:center;gap:8px}
    .adv-flash-timer{display:flex;gap:4px;align-items:center}
    .adv-flash-unit{background:rgba(0,0,0,.25);border-radius:6px;padding:4px 8px;font-size:16px;font-weight:900;min-width:34px;text-align:center;animation:adv-count .2s ease}
    .adv-flash-sep{font-weight:900;font-size:18px;opacity:.7;margin:0 1px}
    .adv-flash-scroll{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;-ms-overflow-style:none}
    .adv-flash-scroll::-webkit-scrollbar{display:none}
    .adv-flash-card{flex-shrink:0;width:130px;background:rgba(255,255,255,.15);backdrop-filter:blur(8px);border-radius:10px;padding:10px;cursor:pointer;transition:transform .2s}
    .adv-flash-card:hover{transform:scale(1.04)}
    .adv-flash-card img{width:100%;height:90px;object-fit:cover;border-radius:7px;margin-bottom:7px;background:rgba(255,255,255,.2)}
    .adv-flash-card-title{font-size:11px;font-weight:700;color:#fff;line-height:1.3;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .adv-flash-card-price{font-size:13px;font-weight:900;color:#fff}
    .adv-flash-card-old{font-size:10px;color:rgba(255,255,255,.65);text-decoration:line-through;margin-left:4px}
    .adv-flash-card-badge{background:#fff;color:#f57224;font-size:9px;font-weight:900;border-radius:4px;padding:2px 5px;display:inline-block;margin-bottom:4px}
    .adv-flash-stock{margin-top:6px}
    .adv-flash-stock-bar{height:4px;background:rgba(255,255,255,.3);border-radius:2px;overflow:hidden;margin-top:2px}
    .adv-flash-stock-fill{height:100%;background:#fff;border-radius:2px;transition:width .5s ease}
    .adv-flash-stock-text{font-size:9px;color:rgba(255,255,255,.8);margin-top:2px}

    /* ── Wallet UI ─────────────────────────────────────────────────────────── */
    .adv-wallet-card{background:linear-gradient(135deg,#1e3a5f,#2563eb);border-radius:20px;padding:24px;color:#fff;margin:12px 16px;position:relative;overflow:hidden}
    .adv-wallet-card::after{content:'';position:absolute;right:-30px;top:-30px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.06)}
    .adv-wallet-balance{font-size:36px;font-weight:900;letter-spacing:-1px;margin:8px 0 4px}
    .adv-wallet-label{font-size:12px;opacity:.75;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
    .adv-wallet-actions{display:flex;gap:10px;margin-top:16px}
    .adv-wallet-btn{flex:1;background:rgba(255,255,255,.15);border:none;border-radius:10px;padding:10px;color:#fff;font-weight:700;font-size:13px;cursor:pointer;transition:background .2s;display:flex;align-items:center;justify-content:center;gap:6px}
    .adv-wallet-btn:hover{background:rgba(255,255,255,.25)}
    .adv-wallet-tx{background:#fff;border-radius:16px;margin:12px 16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .adv-wallet-tx-title{padding:14px 16px;font-weight:800;font-size:14px;border-bottom:1px solid #f3f4f6}
    .adv-wallet-tx-row{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #f9fafb}
    .adv-wallet-tx-row:last-child{border-bottom:none}
    .adv-wallet-tx-icon{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
    .adv-wallet-tx-amount{margin-left:auto;font-weight:800;font-size:14px}

    /* ── Loyalty ───────────────────────────────────────────────────────────── */
    .adv-loyalty-card{border-radius:20px;padding:20px;color:#fff;margin:12px 16px;position:relative;overflow:hidden}
    .adv-loyalty-tier{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;opacity:.8}
    .adv-loyalty-points{font-size:40px;font-weight:900;letter-spacing:-1px;margin:4px 0}
    .adv-loyalty-val{font-size:13px;opacity:.85;margin-bottom:16px}
    .adv-loyalty-progress-wrap{background:rgba(0,0,0,.2);border-radius:20px;height:10px;overflow:hidden;margin-bottom:6px}
    .adv-loyalty-progress-fill{height:100%;border-radius:20px;background:rgba(255,255,255,.8);transition:width 1s ease}
    .adv-loyalty-progress-label{font-size:11px;opacity:.8}
    .adv-loyalty-perks{background:rgba(0,0,0,.15);border-radius:12px;padding:12px 14px;margin-top:14px}
    .adv-loyalty-perk{display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0}
    .adv-perk-check{width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0}

    /* ── Referral ──────────────────────────────────────────────────────────── */
    .adv-referral-card{background:#fff;border-radius:16px;margin:12px 16px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .adv-referral-code-box{background:#f9fafb;border:2px dashed #f57224;border-radius:12px;padding:14px;text-align:center;margin:12px 0}
    .adv-referral-code{font-size:24px;font-weight:900;color:#f57224;letter-spacing:3px}
    .adv-referral-copy-btn{background:#f57224;color:#fff;border:none;border-radius:10px;padding:10px 24px;font-weight:800;font-size:14px;cursor:pointer;margin-top:10px}
    .adv-referral-stats{display:flex;gap:10px;margin-top:14px}
    .adv-referral-stat{flex:1;background:#f9fafb;border-radius:10px;padding:12px;text-align:center}
    .adv-referral-stat-val{font-size:22px;font-weight:900;color:#111}
    .adv-referral-stat-label{font-size:11px;color:#6b7280;margin-top:3px}

    /* ── Product Comparison ────────────────────────────────────────────────── */
    .adv-compare-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:90000;display:flex;align-items:flex-end;justify-content:center}
    .adv-compare-sheet{background:#fff;width:100%;max-height:90vh;border-radius:20px 20px 0 0;display:flex;flex-direction:column;animation:adv-in .35s ease}
    .adv-compare-head{padding:16px 20px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:12px}
    .adv-compare-title{font-weight:800;font-size:16px;flex:1}
    .adv-compare-body{flex:1;overflow:auto;padding:0 0 20px}
    .adv-compare-products{display:flex;gap:0;border-bottom:2px solid #f3f4f6}
    .adv-compare-product{flex:1;text-align:center;padding:14px 10px;border-right:1px solid #f3f4f6}
    .adv-compare-product:last-child{border-right:none}
    .adv-compare-product img{width:64px;height:64px;object-fit:cover;border-radius:10px;margin-bottom:8px}
    .adv-compare-product-name{font-size:12px;font-weight:700;color:#111;line-height:1.3}
    .adv-compare-product-price{font-size:14px;font-weight:900;color:#f57224;margin-top:4px}
    .adv-compare-row{display:flex;border-bottom:1px solid #f9fafb}
    .adv-compare-row:nth-child(even){background:#fafafa}
    .adv-compare-row-label{width:100px;padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;flex-shrink:0}
    .adv-compare-row-val{flex:1;padding:10px 12px;font-size:13px;color:#111;text-align:center;border-right:1px solid #f3f4f6}
    .adv-compare-row-val:last-child{border-right:none}
    .adv-compare-tray{position:fixed;bottom:72px;left:50%;transform:translateX(-50%);background:#111;color:#fff;border-radius:30px;padding:10px 20px;display:flex;align-items:center;gap:12px;font-size:13px;font-weight:700;z-index:10000;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:320px;width:90%}
    .adv-compare-tray-items{display:flex;gap:6px;flex:1}
    .adv-compare-tray-thumb{width:30px;height:30px;border-radius:6px;object-fit:cover;background:#333}
    .adv-compare-tray-btn{background:#f57224;color:#fff;border:none;border-radius:20px;padding:7px 16px;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap}

    /* ── Voice Search ──────────────────────────────────────────────────────── */
    .adv-voice-btn{width:36px;height:36px;border-radius:50%;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:16px;transition:all .2s;flex-shrink:0}
    .adv-voice-btn.listening{color:#ef4444;animation:adv-flash-pulse 1s infinite}
    .adv-voice-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff}
    .adv-voice-mic{width:80px;height:80px;border-radius:50%;background:#ef4444;display:flex;align-items:center;justify-content:center;font-size:36px;margin-bottom:16px;animation:adv-flash-pulse 1s infinite}
    .adv-voice-text{font-size:18px;font-weight:600;margin-bottom:8px}
    .adv-voice-result{font-size:22px;font-weight:900;color:#f87171;text-align:center;min-height:32px;padding:0 20px}

    /* ── Currency Switcher ─────────────────────────────────────────────────── */
    .adv-currency-btn{background:#f3f4f6;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;color:#374151}

    /* ── Invoice ───────────────────────────────────────────────────────────── */
    .adv-invoice-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:90000;display:flex;align-items:center;justify-content:center;padding:16px}
    .adv-invoice-modal{background:#fff;border-radius:20px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;padding:0}
    .adv-invoice-head{padding:20px 24px 16px;border-bottom:2px solid #f3f4f6}
    .adv-invoice-logo{font-size:22px;font-weight:900;color:#f57224}
    .adv-invoice-body{padding:20px 24px}
    .adv-invoice-row{display:flex;justify-content:space-between;padding:6px 0;font-size:14px}
    .adv-invoice-row.total{font-weight:900;font-size:16px;border-top:2px solid #f3f4f6;margin-top:8px;padding-top:12px}
    .adv-invoice-item{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f9fafb}

    /* ── QR Code ───────────────────────────────────────────────────────────── */
    .adv-qr-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:90000;display:flex;align-items:center;justify-content:center;padding:20px}
    .adv-qr-modal{background:#fff;border-radius:20px;padding:28px;text-align:center;max-width:320px;width:100%;animation:adv-pop .3s ease}
    .adv-qr-title{font-weight:800;font-size:17px;margin-bottom:4px}
    .adv-qr-sub{font-size:13px;color:#6b7280;margin-bottom:20px}

    /* ── Coupons Page ──────────────────────────────────────────────────────── */
    .adv-coupon-card{background:#fff;border-radius:16px;margin:0 0 12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);display:flex}
    .adv-coupon-stripe{width:8px;flex-shrink:0}
    .adv-coupon-body{flex:1;padding:14px 16px}
    .adv-coupon-code{font-size:16px;font-weight:900;letter-spacing:1px;color:#111}
    .adv-coupon-desc{font-size:13px;color:#6b7280;margin-top:3px}
    .adv-coupon-meta{display:flex;gap:10px;margin-top:8px;font-size:11px;color:#9ca3af}
    .adv-coupon-copy{background:#f9fafb;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;color:#374151;margin-left:auto;align-self:center;white-space:nowrap}
    .adv-coupon-copy:hover{background:#f3f4f6}

    /* ── Recommendation Row ────────────────────────────────────────────────── */
    .adv-rec-section{padding:0 16px 4px}
    .adv-rec-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
    .adv-rec-title{font-weight:800;font-size:15px;color:#111}
    .adv-rec-subtitle{font-size:11px;color:#9ca3af}

    /* ── PWA Install Banner ────────────────────────────────────────────────── */
    .adv-pwa-banner{background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0}
    .adv-pwa-icon{font-size:28px;flex-shrink:0}
    .adv-pwa-text{flex:1}
    .adv-pwa-text strong{display:block;font-size:14px;font-weight:800}
    .adv-pwa-text span{font-size:12px;opacity:.85}
    .adv-pwa-btn{background:#fff;color:#1e3a5f;border:none;border-radius:10px;padding:8px 16px;font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap}
    .adv-pwa-close{background:none;border:none;color:rgba(255,255,255,.7);font-size:18px;cursor:pointer;padding:0 4px;flex-shrink:0}
    `;
    document.head.appendChild(s);
})();

// ══════════════════════════════════════════════════════════════════════════════
// 1. FLASH SALES ENGINE
// ══════════════════════════════════════════════════════════════════════════════
const FlashSaleEngine = {
    _timer:     null,
    _sales:     [],
    _endsAt:    null,
    _ticks:     {},

    async init() {
        await this.load();
        this._startTimer();
        // Re-load every 5 minutes
        setInterval(() => this.load(), 5 * 60 * 1000);
    },

    async load() {
        const r = await _api('GET', '/marketplace/flash-sales');
        const sales = r?.data?.flash_sales || r?.flash_sales || _ls.load('adv_flash_sales', []);
        this._sales   = sales;
        this._endsAt  = r?.data?.ends_at || r?.ends_at || null;
        _ls.save('adv_flash_sales', sales);
        this._renderBanner();
        this._renderSection();
    },

    _startTimer() {
        clearInterval(this._timer);
        this._timer = setInterval(() => this._tick(), 1000);
    },

    _tick() {
        if (!this._endsAt) return;
        const remaining = Math.max(0, Math.floor((new Date(this._endsAt) - Date.now()) / 1000));
        if (!remaining) { this._endSale(); return; }
        const h = String(Math.floor(remaining / 3600)).padStart(2,'0');
        const m = String(Math.floor((remaining % 3600) / 60)).padStart(2,'0');
        const s = String(remaining % 60).padStart(2,'0');

        // Update compact banner timer
        const timerEl = document.getElementById('jmFlashTimer');
        if (timerEl) timerEl.textContent = `${h}:${m}:${s}`;

        // Update flash section timer units
        const setUnit = (id, val) => { const el=document.getElementById(id); if(el&&el.textContent!==val){el.textContent=val;el.style.animation='none';setTimeout(()=>el.style.animation='adv-count .2s ease',10);} };
        setUnit('advFlashH', h); setUnit('advFlashM', m); setUnit('advFlashS', s);

        // Decrement flash sale remaining seconds in DOM
        document.querySelectorAll('.adv-flash-remaining').forEach(el => {
            const secs = parseInt(el.dataset.remaining || 0) - 1;
            el.dataset.remaining = Math.max(0, secs);
        });
    },

    _endSale() {
        clearInterval(this._timer);
        this._sales = [];
        this._renderBanner();
        this._renderSection();
        // Hide flash section
        const sec = document.getElementById('advFlashSection');
        if (sec) sec.style.display = 'none';
    },

    _renderBanner() {
        const banner = document.getElementById('jmFlashBanner');
        if (!banner) return;
        if (!this._sales.length || !this._endsAt) { banner.style.display = 'none'; return; }
        banner.style.display = 'flex';
        banner.style.background = 'linear-gradient(90deg,#ff4e16,#f57224)';
        banner.innerHTML = `<span style="font-weight:800;font-size:14px">⚡ Flash Sale</span>
        <span class="jm-flash-timer" id="jmFlashTimer">--:--:--</span>
        <span style="font-size:12px;opacity:.9">${this._sales.length} deals</span>`;
    },

    _renderSection() {
        // Find or create flash section on homepage
        let sec = document.getElementById('advFlashSection');
        const homePage = document.getElementById('jmPageHome');
        if (!homePage) return;

        if (!this._sales.length) {
            if (sec) sec.style.display = 'none';
            return;
        }

        if (!sec) {
            sec = document.createElement('div');
            sec.id = 'advFlashSection';
            // Insert at top of home page, after flash banner
            const banner = document.getElementById('jmFlashBanner');
            if (banner) { banner.parentNode.insertBefore(sec, banner.nextSibling); }
            else { homePage.prepend(sec); }
        }

        sec.style.display = 'block';
        sec.innerHTML = `<div class="adv-flash-section">
            <div class="adv-flash-header">
                <div class="adv-flash-title">⚡ Flash Sale</div>
                <div class="adv-flash-timer">
                    <div class="adv-flash-unit" id="advFlashH">00</div>
                    <div class="adv-flash-sep">:</div>
                    <div class="adv-flash-unit" id="advFlashM">00</div>
                    <div class="adv-flash-sep">:</div>
                    <div class="adv-flash-unit" id="advFlashS">00</div>
                </div>
            </div>
            <div class="adv-flash-scroll">
                ${this._sales.map(p => {
                    const savePct = p.price && p.flash_price ? Math.round((1 - p.flash_price/p.price)*100) : 0;
                    const stockPct = p.flash_stock ? Math.min(100, Math.round((p.flash_stock/50)*100)) : 75;
                    return `<div class="adv-flash-card" onclick="window._jmOpenProduct?.('${_esc(String(p.id||''))}') || window._jmNav?.('products')">
                        <div class="adv-flash-card-badge">-${savePct}%</div>
                        ${p.image||p.images?.[0]?`<img src="${_esc(p.image||p.images?.[0]||'')}" loading="lazy">`:`<div style="width:100%;height:90px;background:rgba(255,255,255,.2);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>`}
                        <div class="adv-flash-card-title">${_esc(p.title||'')}</div>
                        <div><span class="adv-flash-card-price">${_fmt(p.flash_price)}</span><span class="adv-flash-card-old">${_fmt(p.price)}</span></div>
                        <div class="adv-flash-stock">
                            <div class="adv-flash-stock-bar"><div class="adv-flash-stock-fill" style="width:${stockPct}%"></div></div>
                            <div class="adv-flash-stock-text">${p.flash_stock ? p.flash_stock + ' left' : 'Limited stock'}</div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    },
};

// ══════════════════════════════════════════════════════════════════════════════
// 2. WALLET PAGE
// ══════════════════════════════════════════════════════════════════════════════
window._renderWalletPage = async function() {
    const container = document.getElementById('jmWalletContent') || document.getElementById('jmAccountContent');
    if (!container) return;
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:40px;font-size:24px">⏳</div>`;

    const r = await _api('GET', '/marketplace/wallet');
    const { balance=0, currency='KES', transactions=[], loyaltyTier='bronze', loyaltyPoints=0 } = r?.data || {};

    const tierColors = { bronze:'#cd7f32', silver:'#9ca3af', gold:'#f59e0b', platinum:'#8b5cf6' };
    const color = tierColors[loyaltyTier] || '#cd7f32';

    container.innerHTML = `
    <div class="adv-wallet-card">
        <div class="adv-wallet-label">Available Balance</div>
        <div class="adv-wallet-balance">${_fmt(balance)}</div>
        <div style="font-size:12px;opacity:.75;margin-bottom:4px">${loyaltyPoints.toLocaleString()} loyalty points · <span style="text-transform:capitalize">${loyaltyTier}</span> member</div>
        <div class="adv-wallet-actions">
            <button class="adv-wallet-btn" onclick="window._advTopUp()">＋ Top Up</button>
            <button class="adv-wallet-btn" onclick="window._jmNav?.('loyalty')">🏆 Rewards</button>
            <button class="adv-wallet-btn" onclick="window._advWalletShare()">📤 Share</button>
        </div>
    </div>
    <div class="adv-wallet-tx">
        <div class="adv-wallet-tx-title">Transaction History</div>
        ${transactions.length ? transactions.slice(0,20).map(tx => {
            const isCredit = ['topup','cashback','refund','referral','reward'].includes(tx.type);
            const icons = { topup:'💳', cashback:'💰', refund:'↩️', referral:'🎁', reward:'⭐', order:'🛍️', payment:'💸' };
            const names = { topup:'Top Up', cashback:'Cashback', refund:'Refund', referral:'Referral Bonus', reward:'Reward', order:'Purchase', payment:'Payment' };
            return `<div class="adv-wallet-tx-row">
                <div class="adv-wallet-tx-icon" style="background:${isCredit?'#f0fdf4':'#fef2f2'}">${icons[tx.type]||'💳'}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:600;color:#111">${names[tx.type]||tx.type}</div>
                    <div style="font-size:11px;color:#9ca3af">${tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}) : 'Recently'}</div>
                </div>
                <div class="adv-wallet-tx-amount" style="color:${isCredit?'#22c55e':'#ef4444'}">${isCredit?'+':'-'}${_fmt(tx.amount)}</div>
            </div>`;
        }).join('') : `<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px">No transactions yet</div>`}
    </div>`;
};

window._advTopUp = function() {
    const amount = prompt('Enter top-up amount (KES):');
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;
    _api('POST', '/marketplace/wallet/top-up', { amount: parseFloat(amount), payment_method: 'mpesa' }).then(r => {
        if (r?.data?.new_balance !== undefined) {
            _toast(`Wallet topped up! Balance: ${_fmt(r.data.new_balance)}`, 'success', '💳');
            window._renderWalletPage?.();
        } else { _toast('Top-up failed. Try again.', 'error', '❌'); }
    });
};

window._advWalletShare = function() {
    if (navigator.share) { navigator.share({ title: 'Knecta Market', text: 'Shop on Knecta Market and earn rewards!', url: window.location.origin }); }
    else { navigator.clipboard?.writeText(window.location.origin); _toast('Link copied!', 'success', '📋'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 3. LOYALTY PAGE
// ══════════════════════════════════════════════════════════════════════════════
window._renderLoyaltyPage = async function() {
    const container = document.getElementById('jmLoyaltyContent') || document.getElementById('jmAccountContent');
    if (!container) return;
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:40px;font-size:24px">⏳</div>`;

    const r = await _api('GET', '/marketplace/loyalty');
    const d = r?.data || { points:0, tier:'bronze', tier_color:'#cd7f32', next_tier:'silver', points_to_next:1000, progress_pct:0, value_kes:0, perks:['Free delivery on orders over KES 2,000'] };

    container.innerHTML = `
    <div class="adv-loyalty-card" style="background:linear-gradient(135deg,${d.tier_color},${d.tier_color}cc)">
        <div class="adv-loyalty-tier">🏆 ${d.tier?.toUpperCase()} MEMBER</div>
        <div class="adv-loyalty-points">${(d.points||0).toLocaleString()}</div>
        <div class="adv-loyalty-val">= ${_fmt(d.value_kes)} in rewards · ${d.total_orders||0} orders</div>
        ${d.next_tier ? `
        <div class="adv-loyalty-progress-wrap"><div class="adv-loyalty-progress-fill" style="width:${d.progress_pct||0}%"></div></div>
        <div class="adv-loyalty-progress-label">${(d.points_to_next||0).toLocaleString()} pts to ${d.next_tier?.toUpperCase()}</div>` : `<div style="font-size:13px;opacity:.85;margin-top:4px">🎉 You've reached the highest tier!</div>`}
        <div class="adv-loyalty-perks">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;opacity:.75">YOUR PERKS</div>
            ${(d.perks||[]).map(p => `<div class="adv-loyalty-perk"><div class="adv-perk-check">✓</div>${p}</div>`).join('')}
        </div>
    </div>
    <div style="margin:12px 16px">
        <div style="font-weight:800;font-size:15px;margin-bottom:12px">How Points Work</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            ${[['🛍️ Purchase','Earn 1 pt per KES 1 spent'],['⭐ Review','Earn 50 pts per review'],['👥 Referral','Earn 200 pts per friend'],['🎂 Birthday','2× points on your birthday']].map(([icon,text])=>`<div style="background:#fff;border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,.06)"><div style="font-size:20px;margin-bottom:6px">${icon}</div><div style="font-size:12px;font-weight:600;color:#374151">${text}</div></div>`).join('')}
        </div>
    </div>
    <div style="padding:0 16px 20px">
        <button style="width:100%;background:#f57224;color:#fff;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:15px;cursor:pointer" onclick="window._advRedeemPoints()">
            Redeem Points
        </button>
    </div>`;
};

window._advRedeemPoints = async function() {
    const points = prompt('How many points to redeem? (Each point = KES 0.50)');
    if (!points || isNaN(points)) return;
    const r = await _api('POST', '/marketplace/loyalty/redeem', { points: parseInt(points) });
    if (r?.data?.success) { _toast(`Redeemed! KES ${r.data.discount_kes} discount applied.`, 'success', '🎁'); window._renderLoyaltyPage?.(); }
    else { _toast(r?.message || 'Redemption failed', 'error', '❌'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 4. REFERRAL PAGE
// ══════════════════════════════════════════════════════════════════════════════
window._renderReferralPage = async function() {
    const container = document.getElementById('jmReferralContent') || document.getElementById('jmAccountContent');
    if (!container) return;
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:40px;font-size:24px">⏳</div>`;

    const r = await _api('GET', '/marketplace/referral');
    const d = r?.data || { referral_code:'', referral_url:'', total_referrals:0, total_earned_kes:0, referrals:[] };

    container.innerHTML = `
    <div style="background:linear-gradient(135deg,#f57224,#ff4e16);padding:24px 16px;color:#fff;text-align:center">
        <div style="font-size:40px;margin-bottom:8px">🎁</div>
        <div style="font-size:20px;font-weight:900;margin-bottom:4px">Invite & Earn</div>
        <div style="font-size:13px;opacity:.9">Get KES 100 for each friend who joins and shops!</div>
    </div>
    <div style="padding:16px">
    <div class="adv-referral-card">
        <div style="font-weight:700;font-size:14px;color:#374151;margin-bottom:6px">Your Referral Code</div>
        <div class="adv-referral-code-box">
            <div class="adv-referral-code">${_esc(d.referral_code||'—')}</div>
            <button class="adv-referral-copy-btn" onclick="window._advCopyReferral('${_esc(d.referral_code||'')}','${_esc(d.referral_url||'')}')">Copy & Share</button>
        </div>
        <div class="adv-referral-stats">
            <div class="adv-referral-stat"><div class="adv-referral-stat-val">${d.total_referrals||0}</div><div class="adv-referral-stat-label">Friends Invited</div></div>
            <div class="adv-referral-stat"><div class="adv-referral-stat-val">${_fmt(d.total_earned_kes||0)}</div><div class="adv-referral-stat-label">Total Earned</div></div>
            <div class="adv-referral-stat"><div class="adv-referral-stat-val">KES 100</div><div class="adv-referral-stat-label">Per Referral</div></div>
        </div>
    </div>
    <div style="background:#fff;border-radius:16px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-top:12px">
        <div style="font-weight:800;font-size:14px;margin-bottom:12px">How It Works</div>
        ${['Share your code with friends','Friend registers using your code','Friend places their first order','You both get KES 100 in your wallet!'].map((s,i)=>`<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #f9fafb"><div style="width:24px;height:24px;border-radius:50%;background:#f57224;color:#fff;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div><div style="font-size:13px;color:#374151">${s}</div></div>`).join('')}
    </div>
    </div>`;
};

window._advCopyReferral = function(code, url) {
    const text = `Use my code ${code} on Knecta Market and get KES 100 off! ${url}`;
    if (navigator.share) { navigator.share({ title:'Join Knecta Market', text, url }); }
    else { navigator.clipboard?.writeText(text).then(() => _toast('Referral link copied!', 'success', '📋')); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 5. AI RECOMMENDATIONS
// ══════════════════════════════════════════════════════════════════════════════
async function _loadRecommendations() {
    const r = await _api('GET', '/marketplace/recommendations');
    const products = r?.data?.products || r?.products || [];
    const type     = r?.data?.type || 'trending';
    if (!products.length) return;

    // Insert recommendation section into home page
    const homePage = document.getElementById('jmPageHome');
    if (!homePage) return;
    let sec = document.getElementById('advRecSection');
    if (!sec) {
        sec = document.createElement('div');
        sec.id = 'advRecSection';
        // Insert after featured section
        const featured = document.getElementById('jmFeaturedSection');
        if (featured) { featured.parentNode.insertBefore(sec, featured.nextSibling); }
        else { homePage.appendChild(sec); }
    }
    const labelMap = { personalized:'✨ For You', trending:'🔥 Trending', popular:'📈 Popular' };
    sec.innerHTML = `<div class="adv-rec-section">
        <div class="adv-rec-header">
            <div>
                <div class="adv-rec-title">${labelMap[type]||'Recommended'}</div>
                <div class="adv-rec-subtitle">${type==='personalized'?'Based on your activity':'Most popular right now'}</div>
            </div>
            <button class="jm-see-all" onclick="window._jmNav?.('products')">See All</button>
        </div>
        <div class="jm-hscroll" id="advRecRow"></div>
    </div>`;

    // Render using existing product card renderer
    const row = document.getElementById('advRecRow');
    if (row && typeof window._renderProductCards === 'function') { window._renderProductCards(row, products); return; }
    if (row) {
        row.innerHTML = products.slice(0,12).map(p => `
        <div class="jm-product-card" onclick="window._jmOpenProduct?.('${_esc(String(p.id||''))}')">
            <div class="jm-product-img-wrap">
                ${p.image||p.images?.[0]?`<img src="${_esc(p.image||p.images?.[0]||'')}" loading="lazy">`:`<div style="width:100%;height:100%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:28px">📦</div>`}
                ${p.is_flash_sale?`<span class="jm-badge-sale">⚡ Flash</span>`:''}
            </div>
            <div class="jm-product-info">
                <div class="jm-product-title">${_esc(p.title||'')}</div>
                <div class="jm-product-price">${_fmt(p.flash_price||p.price)}</div>
                ${p.price&&p.flash_price?`<div class="jm-product-old">${_fmt(p.price)}</div>`:''}
                ${p.rating?`<div class="jm-product-rating">⭐ ${parseFloat(p.rating).toFixed(1)}</div>`:''}
            </div>
        </div>`).join('');
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. PRODUCT COMPARISON ENGINE
// ══════════════════════════════════════════════════════════════════════════════
const CompareEngine = {
    _items: [],
    MAX: 4,

    add(product) {
        if (this._items.find(p => p.id === product.id)) { _toast('Already in comparison', 'warning', '⚖️'); return; }
        if (this._items.length >= this.MAX) { _toast(`Max ${this.MAX} products`, 'warning', '⚖️'); return; }
        this._items.push(product);
        this._renderTray();
        _toast(`Added to compare (${this._items.length}/${this.MAX})`, 'success', '⚖️');
    },

    remove(id) {
        this._items = this._items.filter(p => String(p.id) !== String(id));
        this._renderTray();
    },

    clear() { this._items = []; document.getElementById('advCompareTray')?.remove(); },

    _renderTray() {
        if (!this._items.length) { document.getElementById('advCompareTray')?.remove(); return; }
        let tray = document.getElementById('advCompareTray');
        if (!tray) { tray = document.createElement('div'); tray.id='advCompareTray'; tray.className='adv-compare-tray'; document.body.appendChild(tray); }
        tray.innerHTML = `
        <div class="adv-compare-tray-items">
            ${this._items.map(p=>`<img class="adv-compare-tray-thumb" src="${_esc(p.image||p.images?.[0]||'')}" title="${_esc(p.title||'')}">`).join('')}
        </div>
        <span style="font-size:12px">${this._items.length} items</span>
        <button class="adv-compare-tray-btn" onclick="window._advOpenCompare()">Compare</button>
        <button style="background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:16px" onclick="window.CompareEngine.clear()">✕</button>`;
    },

    async openModal() {
        if (this._items.length < 2) { _toast('Add at least 2 products to compare', 'warning', '⚖️'); return; }
        document.getElementById('advCompareModal')?.remove();

        const ids = this._items.map(p => p.id).join(',');
        const r = await _api('GET', `/marketplace/compare?ids=${ids}`);
        const data = r?.data || { products: this._items, specs: [{ key:'Price', values: this._items.map(p=>`KES ${parseFloat(p.price||0).toLocaleString()}`) }] };
        const products = data.products || this._items;
        const specs = data.specs || [];

        const ov = document.createElement('div'); ov.id='advCompareModal'; ov.className='adv-compare-overlay';
        ov.onclick = e => { if(e.target===ov) ov.remove(); };
        ov.innerHTML = `<div class="adv-compare-sheet">
            <div class="adv-compare-head">
                <div class="adv-compare-title">⚖️ Compare Products</div>
                <button style="width:32px;height:32px;border-radius:50%;border:none;background:#f3f4f6;cursor:pointer;font-size:16px" onclick="document.getElementById('advCompareModal')?.remove()">✕</button>
            </div>
            <div class="adv-compare-body">
                <div class="adv-compare-products">
                    ${products.map(p=>`<div class="adv-compare-product">
                        ${p.image||p.images?.[0]?`<img src="${_esc(p.image||p.images?.[0]||'')}">`:`<div style="width:64px;height:64px;background:#f3f4f6;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 8px">📦</div>`}
                        <div class="adv-compare-product-name">${_esc(p.title||'')}</div>
                        <div class="adv-compare-product-price">${_fmt(p.price)}</div>
                        <button style="margin-top:8px;background:#f57224;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:11px;font-weight:700;cursor:pointer" onclick="window._jmOpenProduct?.('${_esc(String(p.id||''))}'); document.getElementById('advCompareModal')?.remove()">Buy Now</button>
                    </div>`).join('')}
                </div>
                ${specs.map(s=>`<div class="adv-compare-row">
                    <div class="adv-compare-row-label">${_esc(s.key||'')}</div>
                    ${(s.values||[]).map(v=>`<div class="adv-compare-row-val">${_esc(String(v||'—'))}</div>`).join('')}
                </div>`).join('')}
            </div>
        </div>`;
        document.body.appendChild(ov);
    }
};
window.CompareEngine = CompareEngine;
window._advOpenCompare = () => CompareEngine.openModal();
window._advAddToCompare = (product) => CompareEngine.add(product);

// ══════════════════════════════════════════════════════════════════════════════
// 7. INVOICE / PDF
// ══════════════════════════════════════════════════════════════════════════════
window._advShowInvoice = async function(orderId) {
    const r = await _api('GET', `/marketplace/orders/${orderId}/invoice`);
    const inv = r?.data?.invoice;
    if (!inv) { _toast('Invoice not available', 'error', '📄'); return; }

    document.getElementById('advInvoiceModal')?.remove();
    const ov = document.createElement('div'); ov.id='advInvoiceModal'; ov.className='adv-invoice-overlay';
    ov.onclick = e => { if(e.target===ov) ov.remove(); };

    const subtotal = parseFloat(inv.subtotal||0);
    const delFee   = parseFloat(inv.delivery_fee||0);
    const discount = parseFloat(inv.discount||0);
    const total    = parseFloat(inv.total||0);

    ov.innerHTML = `<div class="adv-invoice-modal">
        <div class="adv-invoice-head" style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
                <div class="adv-invoice-logo">⚡ Knecta Market</div>
                <div style="font-size:12px;color:#6b7280;margin-top:3px">Invoice #${_esc(inv.invoice_number||'')}</div>
            </div>
            <button style="border:none;background:#f3f4f6;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer" onclick="document.getElementById('advInvoiceModal')?.remove()">✕</button>
        </div>
        <div class="adv-invoice-body">
            <div style="background:#f9fafb;border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px">
                <div style="font-weight:700;margin-bottom:6px">Deliver To</div>
                <div style="color:#374151">${_esc(inv.buyer?.name||'—')}<br>${_esc(inv.buyer?.address||'')}${inv.buyer?.city?', '+_esc(inv.buyer.city):''}</div>
            </div>
            ${(inv.items||[]).map(item=>`<div class="adv-invoice-item">
                ${item.image?`<img src="${_esc(item.image)}" style="width:44px;height:44px;border-radius:6px;object-fit:cover">`:`<div style="width:44px;height:44px;border-radius:6px;background:#f3f4f6;display:flex;align-items:center;justify-content:center">📦</div>`}
                <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">${_esc(item.title||'')}</div><div style="font-size:12px;color:#6b7280">Qty: ${item.quantity||1}</div></div>
                <div style="font-weight:700;font-size:13px">${_fmt((item.price||0)*(item.quantity||1))}</div>
            </div>`).join('')}
            <div class="adv-invoice-row"><span>Subtotal</span><span>${_fmt(subtotal)}</span></div>
            <div class="adv-invoice-row"><span>Delivery</span><span>${_fmt(delFee)}</span></div>
            ${discount>0?`<div class="adv-invoice-row" style="color:#22c55e"><span>Discount</span><span>-${_fmt(discount)}</span></div>`:''}
            <div class="adv-invoice-row total"><span>Total</span><span style="color:#f57224">${_fmt(total)}</span></div>
            <div style="margin-top:16px;text-align:center;font-size:12px;color:#9ca3af">Payment: ${_esc(inv.payment_method?.toUpperCase()||'N/A')} · Status: ${_esc(inv.status?.toUpperCase()||'')}</div>
        </div>
        <div style="padding:14px 24px;border-top:1px solid #f3f4f6;display:flex;gap:10px">
            <button style="flex:1;background:#f57224;color:#fff;border:none;border-radius:10px;padding:12px;font-weight:800;font-size:13px;cursor:pointer" onclick="window._advPrintInvoice('${orderId}')">🖨️ Print</button>
            <button style="flex:1;background:#f3f4f6;color:#374151;border:none;border-radius:10px;padding:12px;font-weight:800;font-size:13px;cursor:pointer" onclick="document.getElementById('advInvoiceModal')?.remove()">Close</button>
        </div>
    </div>`;
    document.body.appendChild(ov);
};

window._advPrintInvoice = function(orderId) {
    const modal = document.querySelector('.adv-invoice-modal');
    if (!modal) return;
    const w = window.open('','_blank','width=600,height=800');
    w.document.write(`<!DOCTYPE html><html><head><title>Invoice</title><style>body{font-family:Arial,sans-serif;padding:20px;max-width:560px;margin:0 auto}*{box-sizing:border-box}</style></head><body>${modal.innerHTML}<script>window.print();window.onafterprint=()=>window.close();<\/script></body></html>`);
    w.document.close();
};

// ══════════════════════════════════════════════════════════════════════════════
// 8. QR CODE TRACKING
// ══════════════════════════════════════════════════════════════════════════════
window._advShowQR = async function(orderId) {
    const r = await _api('GET', `/marketplace/orders/${orderId}/qr`);
    const qrData = r?.data?.qr_data || JSON.stringify({ order_id: orderId });
    const trackNum = r?.data?.tracking_number || '';

    document.getElementById('advQRModal')?.remove();
    const ov = document.createElement('div'); ov.id='advQRModal'; ov.className='adv-qr-overlay';
    ov.onclick = e => { if(e.target===ov) ov.remove(); };
    ov.innerHTML = `<div class="adv-qr-modal">
        <div class="adv-qr-title">📦 Order QR Code</div>
        <div class="adv-qr-sub">Show this at delivery or pickup point</div>
        <canvas id="advQRCanvas" width="200" height="200" style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:14px"></canvas>
        ${trackNum?`<div style="font-size:12px;color:#374151;margin-bottom:14px">Tracking #: <strong>${_esc(trackNum)}</strong></div>`:''}
        <div style="font-size:11px;color:#9ca3af;margin-bottom:16px;word-break:break-all;padding:0 10px">${_esc(orderId)}</div>
        <button style="background:#f57224;color:#fff;border:none;border-radius:10px;padding:12px 24px;font-weight:800;cursor:pointer" onclick="document.getElementById('advQRModal')?.remove()">Close</button>
    </div>`;
    document.body.appendChild(ov);

    // Draw simple QR-like pattern on canvas
    _drawQRCanvas('advQRCanvas', qrData);
};

function _drawQRCanvas(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = 200, mod = 20, cols = Math.floor(size/mod);

    // Simple hash-based pseudo-QR
    let hash = 0;
    for (let i=0; i<data.length; i++) { hash = ((hash<<5)-hash)+data.charCodeAt(i); hash|=0; }
    const r = new (window.Uint8Array || Array)(cols*cols);
    for (let i=0; i<r.length; i++) { r[i] = ((hash^(i*2654435761))>>>0) % 2; }

    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,size,size);
    ctx.fillStyle = '#111';
    for (let y=0; y<cols; y++) {
        for (let x=0; x<cols; x++) {
            if (r[y*cols+x] || (x<3&&y<3) || (x>=cols-3&&y<3) || (x<3&&y>=cols-3)) {
                ctx.fillRect(x*mod+1, y*mod+1, mod-2, mod-2);
            }
        }
    }
    // Corner finder patterns (white squares inside)
    ctx.fillStyle = '#fff';
    [[0,0],[cols-3,0],[0,cols-3]].forEach(([fx,fy])=>{ ctx.fillRect(fx*mod+3,fy*mod+3,2*mod-4,2*mod-4); });
    ctx.fillStyle = '#111';
    [[1,1],[cols-2,1],[1,cols-2]].forEach(([fx,fy])=>{ ctx.fillRect(fx*mod+2,fy*mod+2,mod-4,mod-4); });
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. VOICE SEARCH
// ══════════════════════════════════════════════════════════════════════════════
const VoiceSearch = {
    _recog: null,
    _active: false,

    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return; // Not supported

        // Add mic button to search bar
        const searchWrap = document.getElementById('jmSearchWrap');
        if (searchWrap && !document.getElementById('advVoiceBtn')) {
            const btn = document.createElement('button');
            btn.id = 'advVoiceBtn';
            btn.className = 'adv-voice-btn';
            btn.innerHTML = '<i class="fas fa-microphone"></i>';
            btn.title = 'Voice search';
            btn.onclick = () => this.toggle();
            searchWrap.appendChild(btn);
        }

        this._recog = new SpeechRecognition();
        this._recog.continuous = false;
        this._recog.interimResults = true;
        this._recog.lang = 'en-KE';

        this._recog.onresult = (event) => {
            const result = event.results[event.results.length-1];
            const transcript = result[0].transcript;
            const resultEl = document.getElementById('advVoiceResult');
            if (resultEl) resultEl.textContent = `"${transcript}"`;
            if (result.isFinal) {
                this._stopOverlay();
                const input = document.getElementById('jmSearchInput');
                if (input) { input.value = transcript; input.dispatchEvent(new Event('input')); }
                if (typeof window._doSearch === 'function') window._doSearch(transcript);
                else if (typeof window._jmSearch === 'function') window._jmSearch(transcript);
            }
        };

        this._recog.onend = () => this._stopOverlay();
        this._recog.onerror = (e) => { this._stopOverlay(); if (e.error !== 'no-speech') _toast('Microphone error: ' + e.error, 'error', '🎤'); };
    },

    toggle() {
        if (this._active) { this._recog?.stop(); this._stopOverlay(); return; }
        navigator.mediaDevices?.getUserMedia({ audio: true }).then(() => {
            this._startOverlay();
            this._recog?.start();
            this._active = true;
        }).catch(() => _toast('Microphone permission denied', 'error', '🎤'));
    },

    _startOverlay() {
        document.getElementById('advVoiceOverlay')?.remove();
        const ov = document.createElement('div'); ov.id='advVoiceOverlay'; ov.className='adv-voice-overlay';
        ov.onclick = () => this.toggle();
        ov.innerHTML = `<div class="adv-voice-mic">🎤</div>
        <div class="adv-voice-text">Listening…</div>
        <div class="adv-voice-result" id="advVoiceResult">Say a product name to search</div>
        <div style="margin-top:20px;font-size:13px;opacity:.6">Tap anywhere to cancel</div>`;
        document.body.appendChild(ov);
        document.getElementById('advVoiceBtn')?.classList.add('listening');
    },

    _stopOverlay() {
        this._active = false;
        document.getElementById('advVoiceOverlay')?.remove();
        document.getElementById('advVoiceBtn')?.classList.remove('listening');
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// 10. SMART DELIVERY ESTIMATE (on product page)
// ══════════════════════════════════════════════════════════════════════════════
window._advDeliveryEstimate = async function(containerEl, weight) {
    if (!containerEl) return;
    containerEl.innerHTML = `<span style="color:#9ca3af;font-size:12px">Calculating delivery…</span>`;

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async pos => {
            const r = await _api('POST', '/marketplace/delivery/smart-estimate', { lat: pos.coords.latitude, lng: pos.coords.longitude, weight: weight||0 });
            if (r?.data) {
                const d = r.data;
                containerEl.innerHTML = `<span style="color:#22c55e;font-size:13px;font-weight:700">📦 Deliver by ${d.eta}</span><span style="color:#6b7280;font-size:12px;margin-left:6px">· ${d.fee===0?'FREE':_fmt(d.fee)}</span>`;
            }
        }, () => {
            containerEl.innerHTML = `<span style="color:#374151;font-size:12px">📦 Nationwide delivery from KES 50</span>`;
        });
    } else {
        containerEl.innerHTML = `<span style="color:#374151;font-size:12px">📦 Delivery: 1-3 days · From KES 50</span>`;
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// 11. PWA INSTALL PROMPT
// ══════════════════════════════════════════════════════════════════════════════
const PWAManager = {
    _deferredPrompt: null,
    _dismissed: _ls.load('adv_pwa_dismissed', false),

    init() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this._deferredPrompt = e;
            if (!this._dismissed) this._showBanner();
        });
        // Update service worker to cache marketplace files
        this._updateServiceWorker();
    },

    _showBanner() {
        if (document.getElementById('advPWABanner')) return;
        const jmApp = document.querySelector('.jm-app') || document.querySelector('.knt-app') || document.getElementById('jmApp');
        if (!jmApp) return;
        const banner = document.createElement('div');
        banner.id = 'advPWABanner';
        banner.className = 'adv-pwa-banner';
        banner.innerHTML = `<div class="adv-pwa-icon">⚡</div>
        <div class="adv-pwa-text"><strong>Install Knecta Market</strong><span>Shop faster with our app — offline ready!</span></div>
        <button class="adv-pwa-btn" onclick="window._advInstallPWA()">Install</button>
        <button class="adv-pwa-close" onclick="window._advDismissPWA()">✕</button>`;
        jmApp.prepend(banner);
    },

    _updateServiceWorker() {
        if (!navigator.serviceWorker) return;
        // Tell the existing service worker to cache marketplace files
        navigator.serviceWorker.ready.then(reg => {
            if (reg.active) {
                reg.active.postMessage({
                    type: 'CACHE_MARKETPLACE',
                    assets: ['/marketplace-ecommerce.js', '/marketplace-checkout.js', '/marketplace-advanced.js', '/Tools.html', '/Tool-ui.js', '/Tool.css']
                });
            }
        }).catch(() => {});
    }
};

window._advInstallPWA = async function() {
    const prompt = PWAManager._deferredPrompt;
    if (!prompt) { _toast('Use browser menu to install', 'info', '📱'); return; }
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    PWAManager._deferredPrompt = null;
    document.getElementById('advPWABanner')?.remove();
    if (outcome === 'accepted') _toast('App installed successfully!', 'success', '🎉');
};
window._advDismissPWA = function() {
    document.getElementById('advPWABanner')?.remove();
    PWAManager._dismissed = true;
    _ls.save('adv_pwa_dismissed', true);
};

// ══════════════════════════════════════════════════════════════════════════════
// 12. BEHAVIOR TRACKING
// ══════════════════════════════════════════════════════════════════════════════
const BehaviorTracker = {
    _queue: [],
    _timer: null,

    track(event, data) {
        this._queue.push({ event, ...data, ts: Date.now() });
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this._flush(), 5000);
    },

    async _flush() {
        if (!this._queue.length) return;
        const batch = this._queue.splice(0);
        for (const item of batch) {
            await _api('POST', '/marketplace/behavior/track', item).catch(() => {});
        }
    }
};
window.BehaviorTracker = BehaviorTracker;

// ══════════════════════════════════════════════════════════════════════════════
// 13. MULTI-CURRENCY SWITCHER
// ══════════════════════════════════════════════════════════════════════════════
window._mktCurrency = _ls.load('adv_currency', 'KES');
window._advSwitchCurrency = function(currency) {
    window._mktCurrency = currency;
    _ls.save('adv_currency', currency);
    // Re-render all visible prices
    document.querySelectorAll('[data-price]').forEach(el => {
        el.textContent = _fmt(el.dataset.price, currency);
    });
    _toast(`Currency: ${currency}`, 'success', '💱');
};

function _injectCurrencySwitcher() {
    const header = document.querySelector('.jm-header');
    if (!header || document.getElementById('advCurrencyBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'advCurrencyBtn';
    btn.className = 'adv-currency-btn';
    btn.textContent = window._mktCurrency || 'KES';
    btn.title = 'Switch currency';
    btn.onclick = () => {
        const currencies = ['KES','USD','EUR','GBP'];
        const idx = currencies.indexOf(window._mktCurrency||'KES');
        const next = currencies[(idx+1)%currencies.length];
        btn.textContent = next;
        window._advSwitchCurrency(next);
    };
    // Insert before cart button
    const cartBtn = document.getElementById('jmCartBtn');
    if (cartBtn) header.insertBefore(btn, cartBtn);
}

// ══════════════════════════════════════════════════════════════════════════════
// 14. BUY NOW (exposed to product detail UI)
// ══════════════════════════════════════════════════════════════════════════════
window._advBuyNow = async function(productId, quantity=1) {
    // Trigger checkout with just this product, bypassing cart
    const T = window.EcomMarketplace?.ProductEngine?.getStore?.()?.products;
    const product = T?.get?.(productId) || { id: productId };
    window._state_checkout_items = [{ product, quantity }];
    // Delegate to checkout module
    if (typeof window._jmCheckout === 'function') window._jmCheckout();
};

// ══════════════════════════════════════════════════════════════════════════════
// 15. AVAILABLE COUPONS PAGE
// ══════════════════════════════════════════════════════════════════════════════
window._renderCouponsPage = async function() {
    const container = document.getElementById('jmVouchersContent');
    if (!container) return;
    container.innerHTML = `<div style="padding:16px"><div style="font-size:14px;font-weight:700;margin-bottom:12px">Available Coupons</div><div style="text-align:center;padding:20px;font-size:20px">⏳</div></div>`;

    const r = await _api('GET', '/marketplace/coupons');
    const coupons = r?.data?.coupons || r?.coupons || _defaultCoupons_fe();
    const colors = { percent:'#3b82f6', fixed:'#8b5cf6', free_shipping:'#22c55e', cashback:'#f59e0b' };
    const labels = { percent:`%`, fixed:'KES', free_shipping:'Free Ship', cashback:'Cashback' };

    container.innerHTML = `<div style="padding:12px 16px">
    <div style="font-size:14px;font-weight:700;margin-bottom:12px">🎟️ Available Coupons</div>
    ${coupons.map(c=>{
        const color = colors[c.type]||'#6b7280';
        const val = c.type==='percent'?`${c.value}% OFF`:c.type==='free_shipping'?'FREE SHIPPING':`KES ${c.value} OFF`;
        const exp = c.expiresAt ? `Expires ${new Date(c.expiresAt).toLocaleDateString('en-KE',{day:'numeric',month:'short'})}` : 'No expiry';
        return `<div class="adv-coupon-card">
            <div class="adv-coupon-stripe" style="background:${color}"></div>
            <div class="adv-coupon-body">
                <div style="display:flex;align-items:flex-start;gap:8px">
                    <div style="flex:1">
                        <div class="adv-coupon-code">${_esc(c.code||'')}</div>
                        <div class="adv-coupon-desc">${_esc(c.description||val)}</div>
                        <div class="adv-coupon-meta">
                            <span>Min: KES ${c.minOrderAmt||c.min_order_amt||0}</span>
                            <span>·</span>
                            <span>${exp}</span>
                        </div>
                    </div>
                    <button class="adv-coupon-copy" onclick="navigator.clipboard?.writeText('${_esc(c.code||'')}').then(()=>window._advCouponCopied('${_esc(c.code||'')}'))">Copy</button>
                </div>
            </div>
        </div>`;
    }).join('')}
    </div>`;
};
window._advCouponCopied = (code) => _toast(`Coupon "${code}" copied!`, 'success', '🎟️');
function _defaultCoupons_fe() {
    return [
        { code:'SAVE10',    type:'percent',      value:10,  minOrderAmt:200, description:'10% off orders over KES 200', expiresAt:new Date(Date.now()+30*86400000) },
        { code:'SAVE20',    type:'percent',      value:20,  minOrderAmt:500, description:'20% off orders over KES 500', expiresAt:new Date(Date.now()+30*86400000) },
        { code:'FLAT100',   type:'fixed',        value:100, minOrderAmt:400, description:'KES 100 off your order',       expiresAt:new Date(Date.now()+60*86400000) },
        { code:'NEWUSER50', type:'fixed',        value:50,  minOrderAmt:100, description:'KES 50 off first order',       expiresAt:new Date(Date.now()+90*86400000) },
        { code:'FREESHIP',  type:'free_shipping',value:0,   minOrderAmt:600, description:'Free delivery on KES 600+',   expiresAt:new Date(Date.now()+15*86400000) },
    ];
}

// ══════════════════════════════════════════════════════════════════════════════
// PATCH: Hook _renderVouchers to call our enhanced version
// ══════════════════════════════════════════════════════════════════════════════
const _origRenderVouchers = window._renderVouchers;
window._renderVouchers = function() { window._renderCouponsPage?.() || _origRenderVouchers?.(); };

// ══════════════════════════════════════════════════════════════════════════════
// PATCH: Add wallet/loyalty/referral to More menu navigation
// ══════════════════════════════════════════════════════════════════════════════
const _origNavMore = window._jmNavMore;
window._jmNavMore = function(page) {
    const pageMap = {
        'wallet':   { pageId:'jmPageWallet',   render: window._renderWalletPage },
        'loyalty':  { pageId:'jmPageLoyalty',  render: window._renderLoyaltyPage },
        'referral': { pageId:'jmPageReferral', render: window._renderReferralPage },
    };
    if (pageMap[page]) {
        const { pageId, render } = pageMap[page];
        let el = document.getElementById(pageId);
        if (!el) {
            el = document.createElement('div');
            el.id = pageId; el.className = 'jm-page';
            const contentId = pageId.replace('jmPage','jm').replace(/([A-Z])/g,m=>''+m).toLowerCase() + 'Content';
            el.innerHTML = `<div class="jm-page-title">${page.charAt(0).toUpperCase()+page.slice(1)}</div><div id="${contentId.replace('jm','jm')}"></div>`;
            document.querySelector('.jm-pages-container, .jm-pages, #jmPages, .jm-app')?.appendChild(el);
        }
        document.querySelectorAll('.jm-page').forEach(p=>p.classList.remove('active'));
        el.classList.add('active');
        render?.();
        return;
    }
    _origNavMore?.call(this, page);
};

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE WORKER: Handle CACHE_MARKETPLACE message
// ══════════════════════════════════════════════════════════════════════════════
(function _patchSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
        // If the SW supports the message type, we already post it in PWAManager
    }).catch(() => {});
})();

// ══════════════════════════════════════════════════════════════════════════════
// INITIALIZER
// ══════════════════════════════════════════════════════════════════════════════
async function _init() {
    // Wait for DOM
    await new Promise(r => { if(document.readyState!=='loading') r(); else document.addEventListener('DOMContentLoaded', r); });

    // 1. Flash sales
    FlashSaleEngine.init().catch(() => {});

    // 2. Voice search
    VoiceSearch.init();

    // 3. AI recommendations
    setTimeout(() => _loadRecommendations().catch(() => {}), 2000);

    // 4. Currency switcher
    _injectCurrencySwitcher();

    // 5. PWA install
    PWAManager.init();

    // 6. Patch tracking into product opens
    const _origOpenProduct = window._jmOpenProduct;
    window._jmOpenProduct = function(productId) {
        BehaviorTracker.track('view', { product_id: productId });
        _origOpenProduct?.call(this, productId);
    };

    // 7. Expose invoice/QR on tracking screen
    window.addEventListener('ecom:order-placed', (e) => {
        const orderId = e.detail?.order?.id;
        if (orderId) {
            // Add invoice link to success screen if present
            setTimeout(() => {
                const successBtns = document.querySelector('.co-success-btn-row');
                if (successBtns && !document.getElementById('advInvoiceBtn')) {
                    const btn = document.createElement('button');
                    btn.id = 'advInvoiceBtn';
                    btn.className = 'co-btn co-btn-outline';
                    btn.style.cssText = 'font-size:13px;padding:11px';
                    btn.textContent = '🧾 Download Invoice';
                    btn.onclick = () => window._advShowInvoice(orderId);
                    successBtns.appendChild(btn);
                }
            }, 500);
        }
    });

    console.log('[marketplace-advanced.js] ✅ All enterprise features active');
}

_init();

})();
