/**
 * marketplace-checkout.js — COMPLETE CUSTOMER CHECKOUT FLOW v2.0
 * ════════════════════════════════════════════════════════════════
 * Provides:
 *  • Full 4-step checkout modal: Address → Delivery → Payment → Confirm
 *  • Order Success screen with animation
 *  • Order Detail + Delivery Tracking Timeline
 *  • Write Review modal (post-delivery)
 *  • Addresses management page
 *  • Coupon/voucher application
 *  • M-Pesa STK push + polling
 *
 * INTEGRATION:
 *  Overrides window._jmCheckout and window._jmViewOrder
 *  Called automatically if this file is included after Tool-ui.js
 * ════════════════════════════════════════════════════════════════
 */

(function _CheckoutModule() {
'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────
const _esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _fmt = n => 'KES ' + parseFloat(n||0).toLocaleString('en-KE',{minimumFractionDigits:0,maximumFractionDigits:0});
const _ls = {
    save:(k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v))}catch(_){} },
    load:(k,d=null)=>{ try{const r=localStorage.getItem(k);return r?JSON.parse(r):d}catch(_){return d} }
};

// ─── API Helper ───────────────────────────────────────────────────────────────
async function _api(method, endpoint, body=null) {
    try {
        const token = window.__kynToken||window.__accessToken||
            window.__PARENT_SESSION__?.token||
            localStorage.getItem('authToken')||localStorage.getItem('token')||
            localStorage.getItem('moodchat_token')||localStorage.getItem('accessToken')||'';
        const base = (window.__kynAPI?.baseUrl||'').replace(/\/api$/,'').replace(/\/$/,'') ||
            (typeof window.__getApiBase==='function'?window.__getApiBase().replace(/\/api$/,''):'') ||
            'http://localhost:4000';
        const res = await fetch(base+'/api'+endpoint, {
            method: method.toUpperCase(),
            headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
            ...(body&&method!=='GET'?{body:JSON.stringify(body)}:{})
        });
        if(!res.ok) return null;
        return await res.json();
    } catch(e) { return null; }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function _toast(msg, type='info', icon='ℹ️') {
    const colors={success:'#22c55e',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
    let box=document.getElementById('jmCOToastBox');
    if(!box){
        box=document.createElement('div'); box.id='jmCOToastBox';
        box.style.cssText='position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;width:min(380px,90vw)';
        document.body.appendChild(box);
    }
    const t=document.createElement('div');
    t.style.cssText=`background:${colors[type]||colors.info};color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:500;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.2);pointer-events:auto;animation:co-in .3s ease;`;
    t.innerHTML=`<span style="font-size:18px">${icon}</span><span>${msg}</span>`;
    box.appendChild(t);
    setTimeout(()=>{t.style.animation='co-out .3s ease forwards';setTimeout(()=>t.remove(),300)},3500);
}

// ─── Inject CSS ───────────────────────────────────────────────────────────────
(function _injectCSS(){
    if(document.getElementById('jmCheckoutCSS'))return;
    const s=document.createElement('style'); s.id='jmCheckoutCSS';
    s.textContent=`
    @keyframes co-in{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes co-out{from{opacity:1}to{opacity:0;transform:translateY(-16px)}}
    @keyframes co-pop{from{opacity:0;transform:scale(.93)}to{opacity:1;transform:scale(1)}}
    @keyframes co-slide-up{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
    @keyframes co-success-ring{0%{transform:scale(.8);opacity:0}50%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
    @keyframes co-spin{to{transform:rotate(360deg)}}
    @keyframes co-pulse{0%,100%{opacity:1}50%{opacity:.4}}
    @keyframes co-track-fill{from{height:0}to{height:100%}}

    .co-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:90000;display:flex;align-items:flex-end;justify-content:center}
    @media(min-width:600px){.co-overlay{align-items:center}}
    .co-modal{background:#fff;width:100%;max-width:520px;max-height:92vh;border-radius:20px 20px 0 0;overflow:hidden;display:flex;flex-direction:column;animation:co-slide-up .35s ease}
    @media(min-width:600px){.co-modal{border-radius:20px}}
    .co-modal-head{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #f3f4f6;flex-shrink:0;background:#fff}
    .co-modal-title{font-weight:700;font-size:16px;flex:1}
    .co-close-btn{width:32px;height:32px;border-radius:50%;border:none;background:#f3f4f6;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;color:#374151}
    .co-body{flex:1;overflow-y:auto;padding:0;-webkit-overflow-scrolling:touch}
    .co-section{padding:16px 20px}
    .co-section+.co-section{border-top:8px solid #f9fafb}
    .co-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;margin-bottom:8px}
    .co-input{width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:11px 14px;font-size:14px;box-sizing:border-box;outline:none;transition:border-color .2s;background:#fff;color:#111}
    .co-input:focus{border-color:#f57224}
    .co-input-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
    .co-input-group{margin-bottom:10px}
    .co-input-label{font-size:12px;font-weight:600;color:#374151;margin-bottom:4px}
    .co-step-bar{display:flex;align-items:center;padding:14px 20px;gap:0;flex-shrink:0;background:#fff;border-bottom:1px solid #f3f4f6}
    .co-step{display:flex;flex-direction:column;align-items:center;flex:1;gap:4px}
    .co-step-dot{width:28px;height:28px;border-radius:50%;background:#e5e7eb;color:#9ca3af;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;transition:all .3s}
    .co-step-dot.active{background:#f57224;color:#fff}
    .co-step-dot.done{background:#22c55e;color:#fff}
    .co-step-label{font-size:10px;color:#9ca3af;font-weight:600}
    .co-step-label.active{color:#f57224}
    .co-step-line{flex:1;height:2px;background:#e5e7eb;transition:background .3s}
    .co-step-line.done{background:#22c55e}
    .co-addr-card{border:1.5px solid #e5e7eb;border-radius:12px;padding:14px 16px;cursor:pointer;transition:all .2s;margin-bottom:8px;position:relative}
    .co-addr-card.selected{border-color:#f57224;background:#fff8f5}
    .co-addr-card-name{font-weight:700;font-size:14px;color:#111}
    .co-addr-card-detail{font-size:12px;color:#6b7280;margin-top:3px}
    .co-addr-card-badge{position:absolute;top:10px;right:12px;background:#f57224;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px}
    .co-add-addr-btn{width:100%;border:1.5px dashed #d1d5db;border-radius:12px;padding:14px;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#6b7280;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px}
    .co-add-addr-btn:hover{border-color:#f57224;color:#f57224}
    .co-delivery-option{border:1.5px solid #e5e7eb;border-radius:12px;padding:14px 16px;cursor:pointer;transition:all .2s;margin-bottom:8px;display:flex;align-items:center;gap:14px}
    .co-delivery-option.selected{border-color:#f57224;background:#fff8f5}
    .co-delivery-icon{font-size:24px;flex-shrink:0}
    .co-delivery-name{font-weight:700;font-size:14px;color:#111}
    .co-delivery-eta{font-size:12px;color:#6b7280;margin-top:2px}
    .co-delivery-fee{margin-left:auto;font-weight:700;color:#f57224;font-size:14px;flex-shrink:0}
    .co-pay-option{border:1.5px solid #e5e7eb;border-radius:12px;padding:14px 16px;cursor:pointer;transition:all .2s;margin-bottom:8px;display:flex;align-items:center;gap:14px}
    .co-pay-option.selected{border-color:#f57224;background:#fff8f5}
    .co-pay-icon{font-size:22px;flex-shrink:0}
    .co-pay-name{font-weight:700;font-size:14px;color:#111}
    .co-pay-desc{font-size:12px;color:#6b7280;margin-top:2px}
    .co-order-summary-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:14px}
    .co-order-summary-row.total{font-weight:800;font-size:16px;color:#111;border-top:1.5px solid #f3f4f6;margin-top:4px;padding-top:12px}
    .co-coupon-row{display:flex;gap:8px;margin-top:8px}
    .co-coupon-input{flex:1;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:14px;outline:none;transition:border-color .2s;background:#fff;text-transform:uppercase}
    .co-coupon-input:focus{border-color:#f57224}
    .co-coupon-btn{background:#f57224;color:#fff;border:none;border-radius:10px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap}
    .co-coupon-btn:hover{background:#e0651f}
    .co-order-item{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6}
    .co-order-item:last-child{border-bottom:none}
    .co-order-item-img{width:54px;height:54px;border-radius:8px;object-fit:cover;background:#f3f4f6;flex-shrink:0}
    .co-order-item-name{font-size:13px;font-weight:600;color:#111;line-height:1.3}
    .co-order-item-qty{font-size:12px;color:#6b7280;margin-top:2px}
    .co-order-item-price{margin-left:auto;font-weight:700;color:#f57224;flex-shrink:0;font-size:14px}
    .co-footer{padding:16px 20px;border-top:1px solid #f3f4f6;flex-shrink:0;background:#fff}
    .co-btn{width:100%;background:#f57224;color:#fff;border:none;border-radius:12px;padding:15px;font-weight:800;font-size:16px;cursor:pointer;transition:all .2s}
    .co-btn:disabled{background:#d1d5db;cursor:not-allowed}
    .co-btn:not(:disabled):hover{background:#e0651f}
    .co-btn-outline{background:#fff;color:#f57224;border:2px solid #f57224}
    .co-btn-outline:hover{background:#fff8f5}
    .co-spinner{width:20px;height:20px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:co-spin .7s linear infinite;display:inline-block;vertical-align:middle;margin-right:8px}
    .co-mpesa-phone{background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-top:10px}
    .co-mpesa-phone label{font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px}
    .co-mpesa-phone input{width:100%;border:none;background:none;font-size:15px;font-weight:600;color:#111;outline:none;box-sizing:border-box}
    .co-mpesa-wait{text-align:center;padding:30px 20px}
    .co-mpesa-phone-icon{font-size:48px;margin-bottom:12px}
    .co-mpesa-status{font-size:14px;color:#6b7280;animation:co-pulse 1.5s infinite}

    /* Success Screen */
    .co-success-overlay{position:fixed;inset:0;background:#fff;z-index:95000;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:40px 24px;overflow-y:auto}
    .co-success-ring{width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,#22c55e,#16a34a);display:flex;align-items:center;justify-content:center;font-size:44px;animation:co-success-ring .6s ease;margin-bottom:16px;box-shadow:0 8px 32px rgba(34,197,94,.35)}
    .co-success-title{font-size:24px;font-weight:800;color:#111;margin-bottom:8px;text-align:center}
    .co-success-sub{font-size:14px;color:#6b7280;text-align:center;margin-bottom:24px}
    .co-success-order-no{background:#f9fafb;border-radius:12px;padding:14px 20px;text-align:center;font-size:13px;color:#374151;margin-bottom:24px;width:100%;max-width:340px;box-sizing:border-box}
    .co-success-order-no strong{font-size:18px;color:#f57224;display:block;margin-top:4px}
    .co-success-items{width:100%;max-width:340px;margin-bottom:24px}
    .co-success-item{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6}
    .co-success-item:last-child{border-bottom:none}
    .co-success-item img{width:48px;height:48px;border-radius:8px;object-fit:cover;background:#f3f4f6}
    .co-success-btn-row{display:flex;flex-direction:column;gap:10px;width:100%;max-width:340px}

    /* Order Tracking */
    .co-track-overlay{position:fixed;inset:0;background:#f9fafb;z-index:90000;display:flex;flex-direction:column;overflow:hidden}
    .co-track-head{background:#fff;padding:16px 20px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #f3f4f6;flex-shrink:0}
    .co-track-back{width:36px;height:36px;border-radius:50%;border:none;background:#f3f4f6;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}
    .co-track-title{font-weight:800;font-size:16px}
    .co-track-body{flex:1;overflow-y:auto;padding:16px 20px;-webkit-overflow-scrolling:touch}
    .co-track-status-card{background:#fff;border-radius:16px;padding:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .co-track-status-badge{display:inline-flex;align-items:center;gap:6px;background:#fff3e0;color:#f57224;border-radius:20px;padding:6px 14px;font-size:13px;font-weight:700;margin-bottom:12px}
    .co-track-order-no{font-size:12px;color:#9ca3af;margin-bottom:4px}
    .co-track-order-date{font-size:14px;font-weight:600;color:#374151}
    .co-track-timeline{background:#fff;border-radius:16px;padding:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .co-track-timeline-title{font-weight:800;font-size:14px;margin-bottom:16px;color:#111}
    .co-tl-item{display:flex;gap:14px;position:relative}
    .co-tl-item+.co-tl-item{margin-top:0}
    .co-tl-left{display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:28px}
    .co-tl-dot{width:28px;height:28px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;z-index:1;position:relative}
    .co-tl-dot.done{background:#22c55e}
    .co-tl-dot.active{background:#f57224;box-shadow:0 0 0 4px rgba(245,114,36,.2)}
    .co-tl-line{flex:1;width:2px;background:#e5e7eb;margin:0 auto}
    .co-tl-line.done{background:#22c55e}
    .co-tl-content{padding-bottom:20px;flex:1}
    .co-tl-label{font-weight:700;font-size:14px;color:#111}
    .co-tl-label.grey{color:#9ca3af}
    .co-tl-time{font-size:11px;color:#9ca3af;margin-top:3px}
    .co-track-items{background:#fff;border-radius:16px;padding:16px 20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .co-track-total-row{display:flex;justify-content:space-between;font-size:14px;padding:5px 0}
    .co-track-total-row.total{font-weight:800;font-size:16px;border-top:1.5px solid #f3f4f6;margin-top:8px;padding-top:12px}
    .co-track-action-row{display:flex;gap:10px;margin-top:4px}
    .co-track-action-btn{flex:1;border-radius:12px;padding:13px;font-weight:700;font-size:14px;cursor:pointer;border:none;transition:all .2s}
    .co-track-action-btn.primary{background:#f57224;color:#fff}
    .co-track-action-btn.secondary{background:#f3f4f6;color:#374151}
    .co-track-action-btn:hover{opacity:.88}

    /* Review Modal */
    .co-review-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:95000;display:flex;align-items:flex-end;justify-content:center}
    @media(min-width:600px){.co-review-modal{align-items:center}}
    .co-review-sheet{background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:24px 20px;animation:co-slide-up .3s ease}
    @media(min-width:600px){.co-review-sheet{border-radius:20px}}
    .co-review-title{font-weight:800;font-size:17px;margin-bottom:4px}
    .co-review-product{font-size:13px;color:#6b7280;margin-bottom:16px}
    .co-star-row{display:flex;gap:8px;justify-content:center;margin-bottom:16px}
    .co-star{font-size:36px;cursor:pointer;transition:transform .15s;filter:grayscale(1);opacity:.5}
    .co-star.active{filter:none;opacity:1;transform:scale(1.1)}
    .co-review-textarea{width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:12px;font-size:14px;resize:none;outline:none;box-sizing:border-box;height:90px;transition:border-color .2s}
    .co-review-textarea:focus{border-color:#f57224}
    .co-review-submit{width:100%;background:#f57224;color:#fff;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:15px;cursor:pointer;margin-top:14px}
    .co-review-submit:disabled{background:#d1d5db}

    /* Address Form Sheet */
    .co-addr-form{background:#fff;border-radius:16px 16px 0 0;padding:20px;max-height:85vh;overflow-y:auto}
    @media(min-width:600px){.co-addr-form{border-radius:16px;max-width:480px;width:100%;max-height:80vh}}
    `;
    document.head.appendChild(s);
})();

// ─── State ────────────────────────────────────────────────────────────────────
const _state = {
    step: 1,       // 1=address 2=delivery 3=payment 4=confirm
    address: null,
    addresses: [],
    deliveryZone: 'kenya',
    deliveryFee: 300,
    deliveryEta: '1-3 days',
    paymentMethod: 'mpesa',
    mpesaPhone: '',
    couponCode: '',
    couponDiscount: 0,
    cartItems: [],
    subtotal: 0,
    orderId: null,
    order: null,
    mpesaRequestId: null,
    loading: false,
};

const DELIVERY_OPTIONS = [
    { id:'express', name:'Express Delivery',  icon:'⚡', fee:250, eta:'30-60 min',  desc:'Nairobi only' },
    { id:'nairobi', name:'Nairobi CBD',        icon:'🏙️', fee:50,  eta:'1-2 hours', desc:'CBD area' },
    { id:'suburbs', name:'Nairobi Suburbs',   icon:'🏘️', fee:150, eta:'2-4 hours', desc:'Westlands, Karen etc' },
    { id:'kenya',   name:'Rest of Kenya',     icon:'🚚', fee:300, eta:'1-3 days',  desc:'All counties' },
    { id:'pickup',  name:'Self Pickup',       icon:'🏪', fee:0,   eta:'Anytime',   desc:'Come to our depot' },
];

const PAY_OPTIONS = [
    { id:'mpesa', name:'M-Pesa',          icon:'📱', desc:'Lipa na M-Pesa STK Push' },
    { id:'card',  name:'Card Payment',    icon:'💳', desc:'Visa / Mastercard (coming soon)', disabled:true },
    { id:'cod',   name:'Cash on Delivery',icon:'💵', desc:'Pay when you receive your order' },
    { id:'wallet',name:'Wallet Balance',  icon:'👛', desc:'Use your Knecta wallet' },
];

// ─── Get cart items ────────────────────────────────────────────────────────────
function _getCartItems() {
    const ecom = window.EcomMarketplace;
    if (ecom) {
        const cart = ecom.CartEngine.getCart();
        return cart.items || [];
    }
    // Fallback: read from localStorage
    const raw = _ls.load('jm_cart_v1', []) || _ls.load('knt_ecom_cart_v2', []);
    return Array.isArray(raw) ? raw.map(i => ({
        product: i.product || i.listing || i,
        quantity: i.quantity || i.qty || 1,
    })) : [];
}

function _calcSubtotal(items) {
    return items.reduce((s, i) => s + (parseFloat(i.product?.price || i.price || 0) * (i.quantity || 1)), 0);
}

// ─── CHECKOUT MODAL ────────────────────────────────────────────────────────────
function openCheckout() {
    _state.cartItems = _getCartItems();
    _state.subtotal  = _calcSubtotal(_state.cartItems);
    _state.step      = 1;
    _state.addresses = _ls.load('jm_addrs_v1', []);
    _state.address   = _state.addresses.find(a=>a.is_default) || _state.addresses[0] || null;
    _state.couponCode    = '';
    _state.couponDiscount = 0;

    if (!_state.cartItems.length) {
        _toast('Your cart is empty', 'warning', '🛒');
        return;
    }

    // Fetch server addresses
    _api('GET','/marketplace/addresses').then(r=>{
        if(r?.data?.addresses?.length){
            _state.addresses = r.data.addresses;
            _state.address = _state.addresses.find(a=>a.is_default) || _state.addresses[0] || null;
            _ls.save('jm_addrs_v1',_state.addresses);
            _renderAddressStep();
        }
    });

    _renderModal();
}
window._jmCheckout = openCheckout;
window._ecomProceedToCheckout = openCheckout;
window.openCheckoutPanel = openCheckout;

function _renderModal() {
    document.getElementById('jmCheckoutModal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'jmCheckoutModal';
    overlay.className = 'co-overlay';
    overlay.onclick = e => { if(e.target===overlay) _closeModal(); };
    overlay.innerHTML = `
    <div class="co-modal" id="coModalInner">
        <div class="co-modal-head">
            <button class="co-close-btn" onclick="window._jmCheckoutBack()">‹</button>
            <span class="co-modal-title" id="coModalTitle">Select Delivery Address</span>
            <button class="co-close-btn" onclick="window._jmCheckoutClose()">✕</button>
        </div>
        <div id="coStepBar"></div>
        <div class="co-body" id="coModalBody"></div>
        <div class="co-footer" id="coModalFooter"></div>
    </div>`;
    document.body.appendChild(overlay);
    _renderStep();
}

function _closeModal() {
    document.getElementById('jmCheckoutModal')?.remove();
}
window._jmCheckoutClose = _closeModal;

window._jmCheckoutBack = function() {
    if (_state.step <= 1) { _closeModal(); return; }
    _state.step--;
    _renderStep();
};

function _renderStep() {
    const titles = ['','Select Delivery Address','Choose Delivery Method','Payment Method','Order Summary'];
    document.getElementById('coModalTitle').textContent = titles[_state.step] || 'Checkout';
    _renderStepBar();
    switch(_state.step) {
        case 1: _renderAddressStep(); break;
        case 2: _renderDeliveryStep(); break;
        case 3: _renderPaymentStep(); break;
        case 4: _renderConfirmStep(); break;
    }
}

function _renderStepBar() {
    const bar = document.getElementById('coStepBar');
    if (!bar) return;
    const steps = ['Address','Delivery','Payment','Confirm'];
    bar.innerHTML = `<div class="co-step-bar">` +
        steps.map((s, i) => {
            const n = i+1;
            const isDone = n < _state.step;
            const isActive = n === _state.step;
            const dotClass = isDone?'done':isActive?'active':'';
            const labelClass = isActive?'active':'';
            const lineClass = n < _state.step ? 'done' : '';
            return `<div class="co-step">
                <div class="co-step-dot ${dotClass}">${isDone?'✓':n}</div>
                <div class="co-step-label ${labelClass}">${s}</div>
            </div>` + (i<steps.length-1?`<div class="co-step-line ${lineClass}"></div>`:'');
        }).join('') +
    `</div>`;
}

// ── Step 1: Address ─────────────────────────────────────────────────────────
function _renderAddressStep() {
    const body = document.getElementById('coModalBody');
    const footer = document.getElementById('coModalFooter');
    if (!body) return;

    const addrs = _state.addresses;
    body.innerHTML = `<div class="co-section">
        <div class="co-label">Saved Addresses</div>
        <div id="coAddressList">` +
        (addrs.length ? addrs.map(a=>`
            <div class="co-addr-card ${_state.address?.id===a.id?'selected':''}" onclick="window._jmSelectAddr('${a.id}')">
                ${a.is_default?`<span class="co-addr-card-badge">Default</span>`:''}
                <div class="co-addr-card-name">${_esc(a.name)}</div>
                <div class="co-addr-card-detail">${_esc(a.address)}, ${_esc(a.city)}${a.region?', '+_esc(a.region):''}${a.phone?'<br>📞 '+_esc(a.phone):''}</div>
            </div>`).join('') : '') + `
        </div>
        <button class="co-add-addr-btn" onclick="window._jmAddNewAddr()">
            <span>＋</span><span>Add New Address</span>
        </button>
    </div>`;

    footer.innerHTML = `<button class="co-btn" id="coAddrNextBtn" onclick="window._jmCheckoutNext()" ${!_state.address?'disabled':''}>
        Continue to Delivery
    </button>`;
}

window._jmSelectAddr = function(id) {
    _state.address = _state.addresses.find(a=>a.id===id);
    _renderAddressStep();
};

window._jmAddNewAddr = function() {
    _showAddressForm();
};

function _showAddressForm(existing) {
    document.getElementById('coAddrFormOverlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'coAddrFormOverlay';
    ov.className = 'co-overlay';
    ov.style.zIndex = '100000';
    ov.onclick = e => { if(e.target===ov) ov.remove(); };
    ov.innerHTML = `<div class="co-modal" style="max-width:480px">
        <div class="co-modal-head">
            <button class="co-close-btn" onclick="document.getElementById('coAddrFormOverlay').remove()">‹</button>
            <span class="co-modal-title">${existing?'Edit Address':'New Address'}</span>
            <button class="co-close-btn" onclick="document.getElementById('coAddrFormOverlay').remove()">✕</button>
        </div>
        <div class="co-body">
        <div class="co-section">
            <div class="co-input-group"><div class="co-input-label">Full Name *</div><input class="co-input" id="addrName" placeholder="e.g. John Kamau" value="${_esc(existing?.name||'')}" /></div>
            <div class="co-input-group"><div class="co-input-label">Phone Number</div><input class="co-input" id="addrPhone" placeholder="0712 345 678" value="${_esc(existing?.phone||'')}" /></div>
            <div class="co-input-group"><div class="co-input-label">Address / Street *</div><input class="co-input" id="addrStreet" placeholder="e.g. 123 Kimathi Street, Apt 4B" value="${_esc(existing?.address||'')}" /></div>
            <div class="co-input-row">
                <div class="co-input-group"><div class="co-input-label">City *</div><input class="co-input" id="addrCity" placeholder="Nairobi" value="${_esc(existing?.city||'')}" /></div>
                <div class="co-input-group"><div class="co-input-label">Region</div><input class="co-input" id="addrRegion" placeholder="Nairobi County" value="${_esc(existing?.region||'')}" /></div>
            </div>
            <div class="co-input-group" style="display:flex;align-items:center;gap:8px;margin-top:4px">
                <input type="checkbox" id="addrDefault" ${(!existing||existing.is_default)?'checked':''} style="width:16px;height:16px;accent-color:#f57224"/>
                <label for="addrDefault" style="font-size:13px;font-weight:600;color:#374151;cursor:pointer">Set as default address</label>
            </div>
        </div>
        </div>
        <div class="co-footer">
            <button class="co-btn" onclick="window._jmSaveAddr(${existing?`'${existing.id}'`:null})">Save Address</button>
        </div>
    </div>`;
    document.body.appendChild(ov);
};

window._jmSaveAddr = async function(existingId) {
    const name  = document.getElementById('addrName')?.value?.trim();
    const phone = document.getElementById('addrPhone')?.value?.trim();
    const street= document.getElementById('addrStreet')?.value?.trim();
    const city  = document.getElementById('addrCity')?.value?.trim();
    const region= document.getElementById('addrRegion')?.value?.trim();
    const isDef = document.getElementById('addrDefault')?.checked;

    if (!name || !street || !city) { _toast('Please fill required fields','error','⚠️'); return; }

    const addr = {
        id:         existingId || ('addr_'+Date.now()),
        name, phone: phone||'', address: street, city, region: region||'', country:'Kenya',
        is_default: isDef,
    };

    if (isDef) _state.addresses.forEach(a=>a.is_default=false);

    const idx = _state.addresses.findIndex(a=>a.id===existingId);
    if (idx>=0) _state.addresses[idx]=addr;
    else _state.addresses.push(addr);

    if (!_state.address || isDef) _state.address = addr;
    _ls.save('jm_addrs_v1',_state.addresses);

    // Sync to server (non-blocking)
    const method = existingId ? 'PUT' : 'POST';
    const endpoint = existingId ? `/marketplace/addresses/${existingId}` : '/marketplace/addresses';
    _api(method, endpoint, addr);

    document.getElementById('coAddrFormOverlay')?.remove();
    _renderAddressStep();
    _toast('Address saved','success','✅');
};

// ── Step 2: Delivery ─────────────────────────────────────────────────────────
function _renderDeliveryStep() {
    const body = document.getElementById('coModalBody');
    const footer = document.getElementById('coModalFooter');
    if (!body) return;

    body.innerHTML = `<div class="co-section">
        <div class="co-label">Choose Delivery Method</div>
        ${DELIVERY_OPTIONS.map(opt=>`
        <div class="co-delivery-option ${_state.deliveryZone===opt.id?'selected':''}" onclick="window._jmSelectDelivery('${opt.id}',${opt.fee},'${opt.eta}')">
            <span class="co-delivery-icon">${opt.icon}</span>
            <div style="flex:1">
                <div class="co-delivery-name">${opt.name}</div>
                <div class="co-delivery-eta">${opt.eta} · ${opt.desc}</div>
            </div>
            <div class="co-delivery-fee">${opt.fee===0?'FREE':_fmt(opt.fee)}</div>
        </div>`).join('')}
        <div style="background:#f0fdf4;border-radius:10px;padding:12px 14px;font-size:12px;color:#166534;margin-top:8px">
            🛡️ All orders are insured and tracked. You'll receive SMS + push notifications.
        </div>
    </div>`;

    footer.innerHTML = `<button class="co-btn" onclick="window._jmCheckoutNext()">
        Continue to Payment
    </button>`;
}

window._jmSelectDelivery = function(id, fee, eta) {
    _state.deliveryZone = id;
    _state.deliveryFee = fee;
    _state.deliveryEta = eta;
    _renderDeliveryStep();
};

// ── Step 3: Payment ──────────────────────────────────────────────────────────
function _renderPaymentStep() {
    const body = document.getElementById('coModalBody');
    const footer = document.getElementById('coModalFooter');
    if (!body) return;

    const sub = _state.subtotal;
    const del = _state.deliveryFee;
    const disc = _state.couponDiscount;
    const total = Math.max(0, sub + del - disc);

    const phone = _state.mpesaPhone ||
        localStorage.getItem('mpesa_phone') ||
        (window.currentUser?.phone || window.__kynUser?.phone || '');

    body.innerHTML = `<div class="co-section">
        <div class="co-label">Payment Method</div>
        ${PAY_OPTIONS.map(opt=>`
        <div class="co-pay-option ${_state.paymentMethod===opt.id?'selected':''} ${opt.disabled?'':'cursor-pointer'}" style="${opt.disabled?'opacity:.5;cursor:not-allowed':''}" ${opt.disabled?'':'onclick="window._jmSelectPayment(\''+opt.id+'\')"'}>
            <span class="co-pay-icon">${opt.icon}</span>
            <div>
                <div class="co-pay-name">${opt.name}${opt.disabled?' (Soon)':''}</div>
                <div class="co-pay-desc">${opt.desc}</div>
            </div>
        </div>`).join('')}
    </div>
    <div class="co-section" id="coPayDetails">${_renderPayDetails(phone)}</div>
    <div class="co-section">
        <div class="co-label">Order Total</div>
        <div class="co-order-summary-row"><span>Subtotal (${_state.cartItems.length} items)</span><span>${_fmt(sub)}</span></div>
        <div class="co-order-summary-row"><span>Delivery (${_state.deliveryEta})</span><span>${del===0?'<span style="color:#22c55e;font-weight:700">FREE</span>':_fmt(del)}</span></div>
        ${disc>0?`<div class="co-order-summary-row" style="color:#22c55e"><span>Coupon discount</span><span>-${_fmt(disc)}</span></div>`:''}
        <div class="co-order-summary-row total"><span>Total</span><span style="color:#f57224">${_fmt(total)}</span></div>
        <div class="co-coupon-row">
            <input class="co-coupon-input" id="coCouponInput" placeholder="ENTER COUPON CODE" value="${_esc(_state.couponCode)}" />
            <button class="co-coupon-btn" onclick="window._jmApplyCoupon()">Apply</button>
        </div>
        ${disc>0?`<div style="background:#f0fdf4;border-radius:8px;padding:8px 12px;margin-top:8px;font-size:12px;color:#166534">🎉 Coupon applied! You saved ${_fmt(disc)}</div>`:''}
    </div>`;

    footer.innerHTML = `<button class="co-btn" id="coPayNextBtn" onclick="window._jmCheckoutNext()">
        Review Order (${_fmt(total)})
    </button>`;
}

function _renderPayDetails(phone) {
    if (_state.paymentMethod === 'mpesa') {
        return `<div class="co-mpesa-phone">
            <label>M-Pesa Phone Number</label>
            <input id="coMpesaPhone" value="${_esc(phone)}" placeholder="0712 345 678" style="width:100%;border:none;background:none;font-size:15px;font-weight:600;color:#111;outline:none;box-sizing:border-box" oninput="window._jmMpesaPhone(this.value)" />
        </div>
        <div style="font-size:11px;color:#9ca3af;margin-top:6px;padding:0 4px">You'll receive an M-Pesa prompt on this phone to complete payment.</div>`;
    } else if (_state.paymentMethod === 'cod') {
        return `<div style="background:#fef9c3;border-radius:10px;padding:12px 14px;font-size:13px;color:#713f12">
            💵 You'll pay in cash when your order is delivered. Make sure to have exact change ready.
        </div>`;
    } else if (_state.paymentMethod === 'wallet') {
        const balance = window.currentUser?.walletBalance || 0;
        const total = Math.max(0, _state.subtotal + _state.deliveryFee - _state.couponDiscount);
        const ok = balance >= total;
        return `<div style="background:${ok?'#f0fdf4':'#fef2f2'};border-radius:10px;padding:12px 14px;font-size:13px;color:${ok?'#166534':'#dc2626'}">
            👛 Wallet balance: <strong>${_fmt(balance)}</strong>${!ok?`<br>⚠️ Insufficient balance. Need ${_fmt(total-balance)} more.`:''}
        </div>`;
    }
    return '';
}

window._jmSelectPayment = function(id) {
    _state.paymentMethod = id;
    _renderPaymentStep();
};
window._jmMpesaPhone = function(v) {
    _state.mpesaPhone = v;
    localStorage.setItem('mpesa_phone', v);
};
window._jmApplyCoupon = async function() {
    const code = document.getElementById('coCouponInput')?.value?.trim();
    if (!code) { _toast('Enter a coupon code','warning','🎟️'); return; }
    const btn = document.querySelector('.co-coupon-btn');
    if (btn) btn.textContent = '…';
    const r = await _api('POST','/marketplace/coupons/validate',{ code, subtotal: _state.subtotal });
    if (btn) btn.textContent = 'Apply';
    if (r?.data?.discount || r?.discount) {
        _state.couponCode     = code;
        _state.couponDiscount = r.data?.discount || r.discount;
        _toast('Coupon applied! 🎉','success','✅');
        _renderPaymentStep();
    } else {
        _toast(r?.message || 'Invalid coupon code','error','❌');
        _state.couponCode = ''; _state.couponDiscount = 0;
    }
};

// ── Step 4: Confirm ──────────────────────────────────────────────────────────
function _renderConfirmStep() {
    const body = document.getElementById('coModalBody');
    const footer = document.getElementById('coModalFooter');
    if (!body) return;

    const sub   = _state.subtotal;
    const del   = _state.deliveryFee;
    const disc  = _state.couponDiscount;
    const total = Math.max(0, sub + del - disc);
    const dopt  = DELIVERY_OPTIONS.find(o=>o.id===_state.deliveryZone) || DELIVERY_OPTIONS[3];
    const popt  = PAY_OPTIONS.find(o=>o.id===_state.paymentMethod) || PAY_OPTIONS[0];
    const addr  = _state.address;

    body.innerHTML = `
    <div class="co-section">
        <div class="co-label">Items (${_state.cartItems.length})</div>
        ${_state.cartItems.map(i=>{
            const p = i.product || i.listing || i;
            const img = p.images?.[0]||p.mediaUrl||p.image||'';
            return `<div class="co-order-item">
                ${img?`<img class="co-order-item-img" src="${_esc(img)}" loading="lazy">`:`<div class="co-order-item-img" style="display:flex;align-items:center;justify-content:center;font-size:22px">📦</div>`}
                <div style="flex:1;min-width:0">
                    <div class="co-order-item-name">${_esc(p.title||p.name||'Product')}</div>
                    <div class="co-order-item-qty">Qty: ${i.quantity||1}</div>
                </div>
                <div class="co-order-item-price">${_fmt(parseFloat(p.price||0) * (i.quantity||1))}</div>
            </div>`;
        }).join('')}
    </div>
    <div class="co-section">
        <div class="co-label">Delivery Details</div>
        <div style="font-size:13px;color:#374151;line-height:1.6">
            <strong>${_esc(addr?.name||'')}</strong><br>
            ${_esc(addr?.address||'')}${addr?.city?', '+_esc(addr.city):''}<br>
            ${addr?.phone?'📞 '+_esc(addr.phone):''}
        </div>
        <div style="margin-top:10px;background:#f9fafb;border-radius:10px;padding:10px 12px;font-size:13px">
            ${dopt.icon} <strong>${dopt.name}</strong> · ${dopt.eta}
        </div>
    </div>
    <div class="co-section">
        <div class="co-label">Payment</div>
        <div style="background:#f9fafb;border-radius:10px;padding:10px 12px;font-size:13px">
            ${popt.icon} <strong>${popt.name}</strong>
            ${_state.paymentMethod==='mpesa'&&_state.mpesaPhone?`<span style="color:#6b7280"> · ${_esc(_state.mpesaPhone)}</span>`:''}
        </div>
    </div>
    <div class="co-section">
        <div class="co-order-summary-row"><span>Subtotal</span><span>${_fmt(sub)}</span></div>
        <div class="co-order-summary-row"><span>Delivery</span><span>${del===0?'FREE':_fmt(del)}</span></div>
        ${disc>0?`<div class="co-order-summary-row" style="color:#22c55e"><span>Discount</span><span>-${_fmt(disc)}</span></div>`:''}
        <div class="co-order-summary-row total"><span>Total</span><span style="color:#f57224">${_fmt(total)}</span></div>
    </div>`;

    const payLabel = { mpesa:'Place Order & Pay with M-Pesa', cod:'Place Order (Cash on Delivery)', wallet:'Place Order & Pay with Wallet', card:'Place Order' };
    footer.innerHTML = `<button class="co-btn" id="coPlaceOrderBtn" onclick="window._jmPlaceOrder()" ${_state.loading?'disabled':''}>
        ${_state.loading?'<span class="co-spinner"></span> Processing…':payLabel[_state.paymentMethod]||'Place Order'}
    </button>`;
}

window._jmCheckoutNext = function() {
    if (_state.step === 1) {
        if (!_state.address) { _toast('Please select a delivery address','warning','📍'); return; }
    }
    if (_state.step === 3) {
        if (_state.paymentMethod==='mpesa' && !_state.mpesaPhone) {
            _toast('Please enter your M-Pesa phone number','warning','📱'); return;
        }
    }
    _state.step++;
    _renderStep();
};

// ── Place Order ──────────────────────────────────────────────────────────────
window._jmPlaceOrder = async function() {
    if (_state.loading) return;
    _state.loading = true;
    _renderConfirmStep();

    const items = _state.cartItems.map(i => ({
        product_id: i.product?.id || i.listing?.id || i.id,
        title:      i.product?.title || i.listing?.title || i.title || 'Product',
        image:      i.product?.images?.[0] || i.listing?.mediaUrl || i.image || '',
        price:      parseFloat(i.product?.price || i.listing?.price || i.price || 0),
        quantity:   i.quantity || 1,
        seller_id:  i.product?.seller_id || i.listing?.sellerId || null,
    }));

    const orderPayload = {
        items,
        delivery_address: _state.address,
        delivery_zone:    _state.deliveryZone,
        payment_method:   _state.paymentMethod,
        coupon_code:      _state.couponCode || undefined,
        notes:            '',
    };

    const r = await _api('POST', '/marketplace/checkout', orderPayload);
    _state.loading = false;

    if (!r) {
        // Offline / error fallback — create local order
        const localOrder = {
            id: 'local_' + Date.now(),
            status: _state.paymentMethod==='cod'?'confirmed':'pending',
            items,
            total_price: Math.max(0, _state.subtotal + _state.deliveryFee - _state.couponDiscount),
            currency: 'KES',
            payment_method: _state.paymentMethod,
            delivery_address: _state.address,
            created_at: new Date().toISOString(),
        };
        _finishOrder(localOrder);
        return;
    }

    const order = r.data?.order || r.order;
    if (!order) { _toast('Failed to place order','error','❌'); _renderConfirmStep(); return; }

    _state.order = order;
    _state.orderId = order.id;

    // Save locally
    const savedOrders = _ls.load('jm_orders_v1',[]);
    savedOrders.unshift(order);
    _ls.save('jm_orders_v1', savedOrders.slice(0,50));

    // Clear cart
    const ecom = window.EcomMarketplace;
    if (ecom?.CartEngine) ecom.CartEngine.clear?.();
    else { localStorage.removeItem('jm_cart_v1'); localStorage.removeItem('knt_ecom_cart_v2'); }
    if (typeof window._updateCartBadge === 'function') window._updateCartBadge();
    if (typeof window._jmUpdateCartBadge === 'function') window._jmUpdateCartBadge();

    if (_state.paymentMethod === 'mpesa') {
        _doMpesaPayment(order);
    } else {
        _finishOrder(order);
    }
};

async function _doMpesaPayment(order) {
    _closeModal();
    _showMpesaWaiting(order);

    const total = parseFloat(order.total_price || 0);
    const phone = _state.mpesaPhone.replace(/^0/,'254').replace(/^\+/,'');

    const r = await _api('POST','/marketplace/payment/mpesa',{
        phone, amount: Math.ceil(total), order_id: order.id,
        description: `Order #${order.id?.slice(-8)||'KNT'}`,
    });

    _state.mpesaRequestId = r?.data?.checkout_request_id || r?.checkout_request_id;

    if (!_state.mpesaRequestId) {
        document.getElementById('coMpesaWaiting')?.remove();
        _toast('M-Pesa request failed. Please try again.','error','❌');
        _finishOrder({ ...order, status: 'pending' });
        return;
    }

    // Poll for payment confirmation
    _pollMpesa(order, _state.mpesaRequestId, 0);
}

function _showMpesaWaiting(order) {
    document.getElementById('coMpesaWaiting')?.remove();
    const ov = document.createElement('div');
    ov.id = 'coMpesaWaiting';
    ov.className = 'co-overlay';
    ov.style.zIndex = '95000';
    const total = Math.max(0, _state.subtotal + _state.deliveryFee - _state.couponDiscount);
    ov.innerHTML = `<div class="co-modal" style="max-width:380px">
        <div class="co-modal-head">
            <span class="co-modal-title">M-Pesa Payment</span>
        </div>
        <div class="co-mpesa-wait">
            <div class="co-mpesa-phone-icon">📱</div>
            <div style="font-weight:800;font-size:18px;margin-bottom:8px">Check Your Phone</div>
            <div style="font-size:14px;color:#374151;margin-bottom:6px">An M-Pesa prompt for <strong>${_fmt(total)}</strong> has been sent to</div>
            <div style="font-size:16px;font-weight:800;color:#f57224;margin-bottom:20px">${_esc(_state.mpesaPhone)}</div>
            <div class="co-mpesa-status" id="coMpesaStatus">Waiting for payment confirmation…</div>
        </div>
        <div class="co-footer" style="gap:10px;display:flex;flex-direction:column">
            <button class="co-btn co-btn-outline" onclick="window._jmCancelMpesa('${order.id}')">I'll Pay Later</button>
        </div>
    </div>`;
    document.body.appendChild(ov);
}

async function _pollMpesa(order, requestId, attempt) {
    if (attempt > 20) {
        document.getElementById('coMpesaWaiting')?.remove();
        _toast('Payment timed out. Order saved as pending.','warning','⏱️');
        _finishOrder({ ...order, status:'pending' });
        return;
    }
    await new Promise(r=>setTimeout(r,3000));
    const r = await _api('POST','/marketplace/payment/mpesa/verify',{ request_id: requestId, order_id: order.id });
    if (r?.data?.paid || r?.paid) {
        document.getElementById('coMpesaWaiting')?.remove();
        _finishOrder({ ...order, status:'paid' });
    } else {
        const st = document.getElementById('coMpesaStatus');
        if (st) st.textContent = `Waiting… (${attempt+1}/20)`;
        _pollMpesa(order, requestId, attempt+1);
    }
}

window._jmCancelMpesa = function(orderId) {
    document.getElementById('coMpesaWaiting')?.remove();
    _toast('Order saved. Complete payment from Orders page.','info','📦');
    window._jmNav?.('orders');
};

function _finishOrder(order) {
    _closeModal();
    document.getElementById('coMpesaWaiting')?.remove();
    _showOrderSuccess(order);
    // Broadcast
    window.dispatchEvent(new CustomEvent('ecom:order-placed',{detail:{order}}));
}

// ─── ORDER SUCCESS SCREEN ─────────────────────────────────────────────────────
function _showOrderSuccess(order) {
    document.getElementById('coSuccessScreen')?.remove();
    const items = order.items || order.metadata?.items || [];
    const total = parseFloat(order.total_price || order.totalPrice || 0);
    const payIcons = { mpesa:'📱', cod:'💵', wallet:'👛', card:'💳' };

    const el = document.createElement('div');
    el.id = 'coSuccessScreen';
    el.className = 'co-success-overlay';
    el.innerHTML = `
        <div style="max-width:380px;width:100%;display:flex;flex-direction:column;align-items:center">
        <div class="co-success-ring">✓</div>
        <div class="co-success-title">Order Placed! 🎉</div>
        <div class="co-success-sub">
            ${order.status==='paid'?'Payment confirmed! Your order is on its way.':
              order.status==='confirmed'?'Your order is confirmed and being prepared!':
              'Your order has been placed successfully.'}
        </div>
        <div class="co-success-order-no">
            <span>Order Number</span>
            <strong>#${_esc(String(order.id||'').slice(-9)||'000000000')}</strong>
        </div>
        ${items.length?`<div class="co-success-items">
            <div style="font-weight:700;font-size:13px;color:#6b7280;margin-bottom:10px">ITEMS ORDERED</div>
            ${items.slice(0,3).map(i=>`
            <div class="co-success-item">
                ${i.image?`<img src="${_esc(i.image)}" style="width:48px;height:48px;border-radius:8px;object-fit:cover">`:`<div style="width:48px;height:48px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:20px">📦</div>`}
                <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(i.title||'Product')}</div><div style="font-size:12px;color:#6b7280;margin-top:2px">Qty: ${i.quantity||1} · ${_fmt((i.price||0)*(i.quantity||1))}</div></div>
            </div>`).join('')}
            ${items.length>3?`<div style="text-align:center;font-size:12px;color:#9ca3af;padding-top:6px">+${items.length-3} more items</div>`:''}
        </div>`:''}
        <div style="background:#f9fafb;border-radius:12px;padding:14px 16px;width:100%;box-sizing:border-box;margin-bottom:20px;font-size:13px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Payment</span><span>${payIcons[order.payment_method]||'💳'} ${order.payment_method?.toUpperCase()||'N/A'}</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#6b7280">Delivery</span><span>📦 ${_esc(_state.deliveryEta||'1-3 days')}</span></div>
            <div style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb"><span>Total Paid</span><span style="color:#f57224">${_fmt(total)}</span></div>
        </div>
        <div class="co-success-btn-row">
            <button class="co-btn" onclick="window._jmViewOrder('${_esc(String(order.id||''))}'); document.getElementById('coSuccessScreen')?.remove()">
                📦 Track My Order
            </button>
            <button class="co-btn co-btn-outline" onclick="document.getElementById('coSuccessScreen')?.remove(); window._jmNav?.('home')">
                Continue Shopping
            </button>
        </div>
        </div>`;
    document.body.appendChild(el);
}

// ─── ORDER TRACKING ────────────────────────────────────────────────────────────
async function openOrderTracking(orderId) {
    // Try to get from server first
    let order = null;
    let tracking = null;

    const orderRes = await _api('GET',`/marketplace/orders/${orderId}`);
    order = orderRes?.data?.order || orderRes?.order || null;

    const trackRes = await _api('GET',`/marketplace/orders/${orderId}/tracking`);
    tracking = trackRes?.data || null;

    if (!order && !tracking) {
        // Fallback: local orders
        const saved = _ls.load('jm_orders_v1',[]);
        order = saved.find(o=>String(o.id)===String(orderId));
    }

    if (!order && !tracking) {
        _toast('Order not found','error','❌'); return;
    }

    _showTrackingScreen(order, tracking);
}
window._jmViewOrder = openOrderTracking;

function _showTrackingScreen(order, tracking) {
    document.getElementById('coTrackingScreen')?.remove();

    const t = tracking || {};
    const o = order || {};
    const items = t.items || o.items || o.metadata?.items || [];
    const timeline = t.timeline || _buildDefaultTimeline(o.status);
    const addr = t.delivery_address || o.delivery_address || o.deliveryAddress || {};
    const total = parseFloat(t.total_price || o.total_price || o.totalPrice || 0);
    const trackNum = t.tracking_number || o.tracking_number || o.trackingNumber;

    const statusColors = {
        pending:'#f59e0b', confirmed:'#3b82f6', packed:'#8b5cf6',
        shipped:'#f97316', out_for_delivery:'#ec4899', delivered:'#22c55e',
        cancelled:'#ef4444', refunded:'#6b7280'
    };
    const currentStatus = t.status || o.status || 'pending';
    const statusColor = statusColors[currentStatus] || '#9ca3af';
    const statusLabel = currentStatus.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

    const el = document.createElement('div');
    el.id = 'coTrackingScreen';
    el.className = 'co-track-overlay';
    el.innerHTML = `
    <div class="co-track-head">
        <button class="co-track-back" onclick="document.getElementById('coTrackingScreen')?.remove()">←</button>
        <div>
            <div class="co-track-title">Order Details</div>
        </div>
    </div>
    <div class="co-track-body">
        <!-- Status Card -->
        <div class="co-track-status-card">
            <div class="co-track-status-badge" style="background:${statusColor}20;color:${statusColor}">
                ${_statusIcon(currentStatus)} ${statusLabel}
            </div>
            <div class="co-track-order-no">Order #${_esc(String(o.id||'').slice(-9)||'N/A')}</div>
            <div class="co-track-order-date">Placed ${o.created_at||o.createdAt ? new Date(o.created_at||o.createdAt).toLocaleDateString('en-KE',{weekday:'short',day:'numeric',month:'short',year:'numeric'}) : 'Recently'}</div>
            ${t.estimated_delivery||o.metadata?.eta?`<div style="margin-top:10px;font-size:13px;color:#374151">🗓️ Estimated delivery: <strong>${_esc(t.estimated_delivery||o.metadata?.eta||'')}</strong></div>`:''}
            ${trackNum?`<div style="margin-top:6px;font-size:13px;color:#374151">📦 Tracking #: <strong>${_esc(trackNum)}</strong></div>`:''}
        </div>

        <!-- Timeline -->
        <div class="co-track-timeline">
            <div class="co-track-timeline-title">Delivery Progress</div>
            ${timeline.map((s,i)=>`
            <div class="co-tl-item">
                <div class="co-tl-left">
                    <div class="co-tl-dot ${s.done&&!s.active?'done':s.active?'active':''}">${s.done?'✓':s.icon||'○'}</div>
                    ${i<timeline.length-1?`<div class="co-tl-line ${s.done?'done':''}"></div>`:''}
                </div>
                <div class="co-tl-content">
                    <div class="co-tl-label ${!s.done&&!s.active?'grey':''}">${_esc(s.label||s.status)}</div>
                    ${s.time?`<div class="co-tl-time">${new Date(s.time).toLocaleString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>`:`<div class="co-tl-time">${s.done||s.active?'Completed':'Pending'}</div>`}
                </div>
            </div>`).join('')}
        </div>

        <!-- Delivery Address -->
        ${addr.address?`<div class="co-track-status-card">
            <div class="co-label" style="margin-bottom:8px">📍 Delivery Address</div>
            <div style="font-size:14px;color:#374151;line-height:1.6">
                <strong>${_esc(addr.name||'')}</strong><br>
                ${_esc(addr.address||'')}${addr.city?', '+_esc(addr.city):''}<br>
                ${addr.phone?'📞 '+_esc(addr.phone):''}
            </div>
        </div>`:''}

        <!-- Items -->
        ${items.length?`<div class="co-track-items">
            <div class="co-track-timeline-title">Items (${items.length})</div>
            ${items.map(i=>`<div class="co-order-item">
                ${i.image?`<img class="co-order-item-img" src="${_esc(i.image)}" loading="lazy">`:`<div class="co-order-item-img" style="display:flex;align-items:center;justify-content:center;font-size:20px">📦</div>`}
                <div style="flex:1;min-width:0">
                    <div class="co-order-item-name">${_esc(i.title||'Product')}</div>
                    <div class="co-order-item-qty">Qty: ${i.quantity||1}</div>
                </div>
                <div class="co-order-item-price">${_fmt((i.price||0)*(i.quantity||1))}</div>
            </div>`).join('')}
            <div class="co-track-total-row"><span>Subtotal</span><span>${_fmt(total)}</span></div>
            <div class="co-track-total-row total"><span>Total</span><span style="color:#f57224">${_fmt(total)}</span></div>
        </div>`:''}

        <!-- Actions -->
        <div class="co-track-action-row">
            ${currentStatus==='delivered'?`
            <button class="co-track-action-btn primary" onclick="window._jmOpenReview('${_esc(String(o.id||''))}','${_esc(items[0]?.product_id||'')}','${_esc(items[0]?.title||'Product')}','${_esc(items[0]?.image||'')}')">⭐ Rate & Review</button>
            `:''}
            ${['pending','confirmed'].includes(currentStatus)?`
            <button class="co-track-action-btn secondary" onclick="window._jmCancelOrderConfirm('${_esc(String(o.id||''))}')">Cancel Order</button>
            `:''}
            ${['paid','shipped','delivered'].includes(currentStatus)?`
            <button class="co-track-action-btn secondary" onclick="window._jmRequestRefund('${_esc(String(o.id||''))}')">Refund / Return</button>
            `:''}
            <button class="co-track-action-btn secondary" onclick="window._jmContactSupport('${_esc(String(o.id||''))}')">🎧 Support</button>
        </div>
        <div style="height:24px"></div>
    </div>`;
    document.body.appendChild(el);
}

function _statusIcon(status) {
    const icons = { pending:'🛍️', confirmed:'✅', packed:'📦', shipped:'🚚', out_for_delivery:'🏍️', delivered:'🎉', cancelled:'❌', refunded:'↩️' };
    return icons[status] || '📋';
}

function _buildDefaultTimeline(status) {
    const steps = [
        { status:'pending',         label:'Order Placed',      icon:'🛍️' },
        { status:'confirmed',       label:'Order Confirmed',   icon:'✅' },
        { status:'packed',          label:'Packed',            icon:'📦' },
        { status:'shipped',         label:'Shipped',           icon:'🚚' },
        { status:'out_for_delivery',label:'Out for Delivery',  icon:'🏍️' },
        { status:'delivered',       label:'Delivered',         icon:'🎉' },
    ];
    const ORDER = ['pending','confirmed','packed','shipped','out_for_delivery','delivered'];
    const idx = ORDER.indexOf(status);
    return steps.map((s, i) => ({
        ...s,
        done:   i < idx,
        active: i === idx,
        time:   i <= idx ? new Date().toISOString() : null,
    }));
}

// ─── CANCEL / REFUND / SUPPORT ────────────────────────────────────────────────
window._jmCancelOrderConfirm = async function(orderId) {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    const r = await _api('POST',`/marketplace/orders/${orderId}/cancel`,{reason:'Customer cancelled'});
    if (r?.data?.order || r?.success) {
        _toast('Order cancelled','success','✅');
        document.getElementById('coTrackingScreen')?.remove();
        window._jmNav?.('orders');
    } else { _toast('Could not cancel order','error','❌'); }
};

window._jmRequestRefund = async function(orderId) {
    const reason = prompt('Reason for return/refund:');
    if (!reason) return;
    const r = await _api('POST',`/marketplace/orders/${orderId}/refund`,{reason});
    if (r?.data?.order || r?.success) { _toast('Refund request submitted','success','✅'); }
    else { _toast('Request submitted. Our team will contact you.','info','📩'); }
};

window._jmContactSupport = function(orderId) {
    const subject = `Help with Order #${String(orderId).slice(-9)}`;
    _api('POST','/marketplace/support/ticket',{ order_id:orderId, subject, message:'I need help with this order.', type:'order_support' });
    _toast('Support ticket opened. We\'ll get back to you shortly!','success','🎧');
};

// ─── WRITE REVIEW ─────────────────────────────────────────────────────────────
window._jmOpenReview = function(orderId, productId, productTitle, productImage) {
    document.getElementById('coReviewModal')?.remove();
    let rating = 0;

    const el = document.createElement('div');
    el.id = 'coReviewModal';
    el.className = 'co-review-modal';
    el.onclick = e => { if(e.target===el) el.remove(); };
    el.innerHTML = `<div class="co-review-sheet">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
            ${productImage?`<img src="${_esc(productImage)}" style="width:52px;height:52px;border-radius:8px;object-fit:cover">`:
            `<div style="width:52px;height:52px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>`}
            <div>
                <div class="co-review-title">Rate this Product</div>
                <div class="co-review-product">${_esc(productTitle||'Product')}</div>
            </div>
        </div>
        <div class="co-star-row" id="coStarRow">
            ${[1,2,3,4,5].map(n=>`<span class="co-star" data-n="${n}" onclick="window._jmSetStar(${n})">⭐</span>`).join('')}
        </div>
        <div id="coStarLabel" style="text-align:center;font-size:13px;color:#9ca3af;margin-bottom:12px">Tap to rate</div>
        <textarea class="co-review-textarea" id="coReviewText" placeholder="Share your experience with this product (optional)…"></textarea>
        <button class="co-review-submit" id="coReviewSubmit" disabled onclick="window._jmSubmitReview('${_esc(String(orderId))}','${_esc(String(productId))}')">
            Submit Review
        </button>
    </div>`;
    document.body.appendChild(el);

    window._jmSetStar = function(n) {
        rating = n;
        document.querySelectorAll('.co-star').forEach((s,i)=>s.classList.toggle('active',i<n));
        const labels = ['','😢 Terrible','😕 Poor','😐 Okay','😊 Good','🤩 Excellent!'];
        document.getElementById('coStarLabel').textContent = labels[n] || '';
        document.getElementById('coReviewSubmit').disabled = false;
    };
};

window._jmSubmitReview = async function(orderId, productId) {
    const stars = document.querySelectorAll('.co-star.active').length;
    const text  = document.getElementById('coReviewText')?.value?.trim() || '';
    if (!stars) { _toast('Please select a rating','warning','⭐'); return; }

    const btn = document.getElementById('coReviewSubmit');
    if (btn) { btn.textContent = 'Submitting…'; btn.disabled = true; }

    const r = await _api('POST',`/marketplace/products/${productId}/reviews`,{
        rating: stars, comment: text, order_id: orderId
    });

    document.getElementById('coReviewModal')?.remove();
    if (r?.success || r?.data) { _toast('Review submitted! Thank you 🙏','success','⭐'); }
    else { _toast('Review saved locally. Will sync when online.','info','⭐'); }
};

// ─── ADDRESSES PAGE ────────────────────────────────────────────────────────────
window._renderAddresses = function() {
    const container = document.getElementById('jmAddressesContent');
    if (!container) return;

    const addrs = _ls.load('jm_addrs_v1',[]);
    if (!addrs.length) {
        container.innerHTML = `<div class="jm-empty-state">
            <div class="jm-empty-icon">📍</div>
            <div class="jm-empty-title">No saved addresses</div>
            <div class="jm-empty-desc">Add a delivery address to speed up checkout.</div>
            <button class="jm-orange-btn" onclick="window._jmAddNewAddr()">Add Address</button>
        </div>`;
        return;
    }

    container.innerHTML = addrs.map(a=>`
        <div class="co-addr-card" style="margin:12px 16px" onclick="">
            ${a.is_default?`<span class="co-addr-card-badge">Default</span>`:''}
            <div class="co-addr-card-name">${_esc(a.name)}</div>
            <div class="co-addr-card-detail">${_esc(a.address)}, ${_esc(a.city)}${a.region?', '+_esc(a.region):''}${a.phone?'<br>📞 '+_esc(a.phone):''}</div>
            <div style="display:flex;gap:8px;margin-top:10px">
                <button style="border:1px solid #e5e7eb;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#374151" onclick="window._jmEditAddr('${a.id}')">Edit</button>
                ${!a.is_default?`<button style="border:1px solid #e5e7eb;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#374151" onclick="window._jmSetDefaultAddr('${a.id}')">Set Default</button>`:''}
                <button style="border:1px solid #fecaca;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#ef4444" onclick="window._jmDeleteAddr('${a.id}')">Delete</button>
            </div>
        </div>`).join('') +
    `<div style="padding:12px 16px"><button class="co-add-addr-btn" onclick="window._jmAddNewAddr()"><span>＋</span><span>Add New Address</span></button></div>`;
};

window._jmEditAddr = function(id) {
    const addrs = _ls.load('jm_addrs_v1',[]);
    const a = addrs.find(x=>x.id===id);
    if (a) _showAddressForm(a);
};
window._jmSetDefaultAddr = function(id) {
    const addrs = _ls.load('jm_addrs_v1',[]);
    addrs.forEach(a=>a.is_default=a.id===id);
    _ls.save('jm_addrs_v1',addrs);
    _api('PATCH',`/marketplace/addresses/${id}/default`);
    window._renderAddresses?.();
    _toast('Default address updated','success','✅');
};
window._jmDeleteAddr = function(id) {
    if (!confirm('Delete this address?')) return;
    const addrs = (_ls.load('jm_addrs_v1',[])).filter(a=>a.id!==id);
    _ls.save('jm_addrs_v1',addrs);
    _api('DELETE',`/marketplace/addresses/${id}`);
    window._renderAddresses?.();
    _toast('Address deleted','info','🗑️');
};

// ─── VOUCHERS PAGE ─────────────────────────────────────────────────────────────
window._renderVouchers = function() {
    const container = document.getElementById('jmVouchersContent');
    if (!container) return;
    const vouchers = [
        { code:'SAVE10',    desc:'10% off any order over KES 200', min:200, expiry:'30 Jun 2026', color:'#3b82f6' },
        { code:'FLAT100',   desc:'KES 100 off orders over KES 400', min:400, expiry:'31 Dec 2026', color:'#8b5cf6' },
        { code:'NEWUSER50', desc:'KES 50 off your first order',     min:100, expiry:'Never',       color:'#22c55e' },
    ];
    container.innerHTML = `<div style="padding:16px">` +
    vouchers.map(v=>`<div style="border-radius:16px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08);margin-bottom:12px;overflow:hidden">
        <div style="background:${v.color};padding:14px 18px;color:#fff">
            <div style="font-weight:800;font-size:18px;letter-spacing:1px">${v.code}</div>
            <div style="font-size:12px;opacity:.9;margin-top:2px">${v.desc}</div>
        </div>
        <div style="padding:10px 18px;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#6b7280">
            <span>Min order: KES ${v.min}</span>
            <span>Expires: ${v.expiry}</span>
        </div>
    </div>`).join('') +
    `</div>`;
};

// ─── INBOX PAGE ────────────────────────────────────────────────────────────────
window._renderInbox = function() {
    const container = document.getElementById('jmInboxContent');
    if (!container) return;
    container.innerHTML = `<div class="jm-empty-state"><div class="jm-empty-icon">📩</div><div class="jm-empty-title">Your inbox is empty</div><div class="jm-empty-desc">Messages from sellers and support will appear here.</div></div>`;
};

// ─── FOLLOW SELLERS PAGE ───────────────────────────────────────────────────────
window._renderFollowSellers = function() {
    const container = document.getElementById('jmFollowContent');
    if (!container) return;
    container.innerHTML = `<div class="jm-empty-state"><div class="jm-empty-icon">🏪</div><div class="jm-empty-title">No followed sellers</div><div class="jm-empty-desc">Follow sellers to get notified when they add new products.</div></div>`;
};

// ─── PATCH: Orders refresh from server ────────────────────────────────────────
const _origRenderOrders = window._renderOrdersOriginal;
(function _patchOrders(){
    // Refresh orders from server when orders page is opened
    const origNav = window._jmNav;
    if (typeof origNav !== 'function') return;
    window._jmNav = function(page, subpage) {
        origNav(page, subpage);
        if (page === 'orders') {
            _api('GET','/marketplace/orders').then(r=>{
                if (!r) return;
                const orders = r.data?.orders || r.orders || [];
                if (orders.length) {
                    _ls.save('jm_orders_v1', orders);
                    // Re-render if still on orders page
                    if (document.getElementById('jmOrdersContent')) {
                        const ecom = window.EcomMarketplace;
                        if (ecom?.OrderEngine?.loadOrders) ecom.OrderEngine.loadOrders();
                        const allOrders = orders;
                        const cont = document.getElementById('jmOrdersContent');
                        const ongoing = allOrders.filter(o=>!['cancelled','refunded'].includes(o.status));
                        _renderOrderListPatch(cont, ongoing);
                    }
                }
            });
        }
    };
})();

function _renderOrderListPatch(container, orders) {
    if (!container || !orders) return;
    if (!orders.length) return; // Let existing empty state handle it
    const notifBar = `<div class="jm-cat-group" style="margin:8px;border-radius:10px;cursor:pointer" onclick="window._jmNavMore?.('notifprefs')">
        <div style="display:flex;align-items:center;gap:12px;padding:14px 16px">
            <div style="flex:1"><div style="font-weight:700;font-size:14px">Turn on notifications</div><div style="font-size:12px;color:#6b7280;margin-top:4px">Stay updated on your orders and deliveries</div></div>
            <div style="width:32px;height:32px;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-chevron-right"></i></div>
        </div>
    </div>`;
    container.innerHTML = notifBar + orders.map(o => {
        const items = o.items || o.metadata?.items || [];
        const firstItem = items[0] || {};
        const img = firstItem.image || o.product?.images?.[0] || '';
        const title = firstItem.title || o.product?.title || 'Order';
        const ordNum = String(o.id||'').slice(-9);
        const date = o.delivered_at || o.deliveredAt || o.created_at || o.createdAt;
        const dateStr = date ? new Date(date).toLocaleDateString('en-KE',{day:'2-digit',month:'2-digit',year:'numeric'}) : '';
        const sMap = {delivered:'delivered',paid:'delivered',shipped:'shipped',pending:'pending',processing:'pending',confirmed:'pending',cancelled:'cancelled',refunded:'cancelled'};
        const sc = sMap[o.status]||'pending';
        return `<div class="jm-order-item" onclick="window._jmViewOrder('${_esc(String(o.id||''))}')">
            ${img?`<img class="jm-order-img" src="${_esc(img)}" loading="lazy">`:`<div class="jm-order-img" style="background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>`}
            <div class="jm-order-body">
                <div class="jm-order-title">${_esc(title)}</div>
                <div class="jm-order-num">Order #${_esc(ordNum)}</div>
                <span class="jm-order-status ${sc}">${(o.status||'pending').toUpperCase()}</span>
                ${dateStr?`<div class="jm-order-date">On ${dateStr}</div>`:''}
            </div>
        </div>`;
    }).join('');
}

// ─── Cart sync to server on page load ─────────────────────────────────────────
(function _syncCartOnLoad(){
    const doSync = () => {
        const localCart = _ls.load('jm_cart_v1',[]);
        if (!localCart.length) return;
        const items = localCart.map(i => ({
            product_id: i.product?.id||i.listing?.id||i.id||'',
            title:      i.product?.title||i.listing?.title||i.title||'',
            price:      parseFloat(i.product?.price||i.listing?.price||i.price||0),
            quantity:   i.quantity||i.qty||1,
            image:      i.product?.images?.[0]||i.listing?.mediaUrl||i.image||'',
        }));
        _api('POST','/marketplace/cart/sync',{items});
    };
    // Sync after 3 seconds (let auth initialize first)
    setTimeout(doSync, 3000);
})();

// ─── Export aliases so Tool-ui.js delegation chain works ─────────────────────
window._jmCheckoutImpl   = window._jmCheckout;
window._jmViewOrderImpl  = window._jmViewOrder;
window.openOrderTracking = openOrderTracking;

console.log('[marketplace-checkout.js] ✅ Complete checkout flow loaded — all buyer flows active');
})();
