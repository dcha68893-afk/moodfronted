'use strict';
/**
 * marketplace-ui-fix.js — COMPLETE FORENSIC FIX
 * Fixes all white screens and no-response clicks:
 *   1. Product detail page — _jmOpenProduct was calling undefined _origOpenProduct
 *   2. API base URL — was '' when window.__kynAPI not set, causing all fetches to fail
 *   3. Unhandled rejections swallowed silently causing white screens
 *   4. Re-installs fix AFTER advanced.js _init() overwrites it
 */

// ── 1. API BASE URL FIX (must run first, before any API call) ──────────────
// FIX-MARKETPLACE-URL: window.location.origin here is the FRONTEND host
// (nexopa.onrender.com). The API lives on a DIFFERENT host
// (nexora-3bla.onrender.com). Falling back to window.location.origin + '/api'
// silently pointed every marketplace fetch at the frontend's own domain,
// which has no /api routes — corrupting all marketplace calls (listings,
// wishlist, categories, spotlight, etc. all failed with 404/fetch errors).
// js/api.core.js is the canonical source of truth for the backend host
// (it has real environment detection: localhost vs render vs custom domain).
// This resolver mirrors that fallback chain instead of guessing from the
// current page's own origin.
function _resolveNexopaApiBase() {
    // Prefer whatever api.core.js already computed, if it has run.
    if (window.__kynAPI?.baseUrl && !window.__kynAPI.baseUrl.includes(window.location.host)) {
        return window.__kynAPI.baseUrl;
    }
    if (window.API_BASE_URL) return window.API_BASE_URL;
    if (window.__API_CORE__?.baseUrl) return window.__API_CORE__.baseUrl;

    // Local/dev: same host, different port pattern used elsewhere in this app.
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
        return `${window.location.protocol}//${host}:4000/api`;
    }

    // Production fallback: the known backend host, NOT window.location.origin.
    return 'https://nexora-3bla.onrender.com/api';
}

(function _fixApiBase() {
    if (window.__kynAPI?.baseUrl && !window.__kynAPI.baseUrl.includes(window.location.host)) return;
    window.__kynAPI = window.__kynAPI || {};
    window.__kynAPI.baseUrl = _resolveNexopaApiBase();
    console.log('[ui-fix] API base set to:', window.__kynAPI.baseUrl);
})();

// ── 2. PRODUCT DETAIL WHITE-SCREEN FIX ────────────────────────────────────
function _realOpenProduct(productId) {
    if (!productId) return;

    // Path A: product already in EcomMarketplace store
    const store = window.EcomMarketplace?.ProductEngine?.getStore?.();
    const cached = store?.products?.get(String(productId));
    const rend = (typeof renderers !== 'undefined' && renderers) || window.renderers || window.__renderers;

    if (cached && rend?.viewListingDetail) {
        rend.viewListingDetail(cached);
        return;
    }

    // Path B: fetch from API then show
    const base = (window.__kynAPI?.baseUrl || _resolveNexopaApiBase()).replace(/\/api$/, '');
    const token = window.__kynToken || window.__accessToken ||
                  localStorage.getItem('authToken') || localStorage.getItem('token') ||
                  localStorage.getItem('nexopa_token') || localStorage.getItem('accessToken') || '';

    // Show loading state immediately
    const panel   = document.getElementById('marketplaceDetailPanel');
    const content = document.getElementById('marketplaceDetailContent');
    const nameEl  = document.getElementById('detailName');
    if (panel) panel.classList.add('active');
    if (nameEl) nameEl.textContent = 'Loading…';
    if (content) content.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af"><div style="font-size:32px;margin-bottom:12px">⏳</div>Loading product…</div>';

    fetch(`${base}/api/marketplace/products/${productId}`, {
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
    })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(data => {
        const product = data?.data?.product || data?.data || data?.product || data;
        if (!product || (!product.id && !product.title)) throw new Error('No product data');
        if (rend?.viewListingDetail) {
            rend.viewListingDetail(product);
        } else {
            // Fallback inline render
            _renderProductFallback(product, panel, content, nameEl);
        }
    })
    .catch(e => {
        console.warn('[ui-fix] Product load failed:', e);
        if (content) content.innerHTML = `
            <div style="padding:40px 20px;text-align:center;color:#6b7280">
                <div style="font-size:48px;margin-bottom:16px">📦</div>
                <div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:8px">Product Not Available</div>
                <div style="font-size:13px;margin-bottom:20px">This product may have been removed or is temporarily unavailable.</div>
                <button onclick="document.getElementById('marketplaceDetailPanel')?.classList.remove('active');window._jmNav?.('products')"
                    style="background:#f57224;color:#fff;border:none;border-radius:12px;padding:12px 24px;font-weight:700;cursor:pointer;font-size:14px">
                    ← Browse Products
                </button>
            </div>`;
    });
}

function _renderProductFallback(product, panel, content, nameEl) {
    // AUDIT FIX: stash the product so _jmAddToCart/_jmBuyNow (defined below)
    // can look it up by id — CartEngine.add() needs the full product object,
    // not just an id, and this is the simplest way to get it there from an
    // inline onclick without re-fetching.
    window.__uiFixProductCache = window.__uiFixProductCache || {};
    window.__uiFixProductCache[String(product.id || product._id)] = product;

    const price = product.flash_sale_price || product.flashSalePrice || product.price || 0;
    const img   = (product.images || [])[0] || product.image || product.mediaUrl || '';
    if (nameEl) nameEl.textContent = product.title || 'Product';
    if (content) content.innerHTML = `
        <div style="background:#fff;min-height:100vh;padding-bottom:80px">
            ${img ? `<div style="width:100%;height:260px;background:#f3f4f6;overflow:hidden">
                <img src="${img}" alt="${product.title||''}" style="width:100%;height:100%;object-fit:cover">
            </div>` : '<div style="width:100%;height:200px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:64px">📦</div>'}
            <div style="padding:16px">
                <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:4px">${product.title||'Product'}</div>
                <div style="font-size:22px;font-weight:800;color:#f57224;margin-bottom:12px">KES ${parseFloat(price).toLocaleString()}</div>
                ${product.description ? `<div style="font-size:14px;color:#4b5563;line-height:1.6;margin-bottom:16px">${product.description}</div>` : ''}
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
                    ${product.category ? `<span style="background:#fef3c7;color:#92400e;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600">${product.category}</span>` : ''}
                    ${product.condition ? `<span style="background:#dbeafe;color:#1e40af;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600">${product.condition}</span>` : ''}
                    ${product.stock != null ? `<span style="background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600">${product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</span>` : ''}
                </div>
                ${(product.seller_id || product.seller?.id) ? `
                <button onclick="window._jmMessageSeller?.(${JSON.stringify(product.seller_id || product.seller?.id)}, ${JSON.stringify(product.seller?.name || 'Seller')}, ${JSON.stringify(product.id || product._id)})"
                    style="width:100%;background:#fff;color:#374151;border:1.5px solid #e5e7eb;border-radius:12px;padding:12px;font-weight:700;cursor:pointer;font-size:14px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;gap:8px">
                    💬 Message Seller
                </button>` : ''}
                <div style="position:fixed;bottom:0;left:0;right:0;background:#fff;padding:12px 16px;border-top:1px solid #e5e7eb;display:flex;gap:8px;z-index:100">
                    <button onclick="window._jmAddToCart?.(${JSON.stringify(product.id || product._id)})"
                        style="flex:1;background:#fff;color:#f57224;border:2px solid #f57224;border-radius:12px;padding:14px;font-weight:700;cursor:pointer;font-size:15px">
                        🛒 Add to Cart
                    </button>
                    <button onclick="window._jmBuyNow?.(${JSON.stringify(product.id || product._id)})||window._jmNavMore?.('checkout')"
                        style="flex:1;background:#f57224;color:#fff;border:none;border-radius:12px;padding:14px;font-weight:700;cursor:pointer;font-size:15px">
                        ⚡ Buy Now
                    </button>
                </div>
            </div>
            <div id="pfReviewsSection" style="padding:0 16px 16px;border-top:8px solid #f9fafb"></div>
            <div id="pfRelatedSection" style="padding:0 0 16px;border-top:8px solid #f9fafb"></div>
        </div>`;

    _loadProductReviews(product);
    _loadRelatedProducts(product);
}

async function _loadProductReviews(product) {
    const el = document.getElementById('pfReviewsSection');
    if (!el) return;
    el.innerHTML = `<div style="padding:16px 0;color:#9ca3af;font-size:13px">Loading reviews…</div>`;
    try {
        const r = await window._api?.('GET', `/marketplace/products/${product.id || product._id}/reviews`);
        const reviews = r?.data?.reviews || [];
        const avgRating = r?.data?.avgRating || 0;
        const total = r?.data?.total || 0;
        if (!total) {
            el.innerHTML = `<div style="padding:16px 0">
                <div style="font-weight:800;font-size:16px;margin-bottom:8px">Reviews</div>
                <div style="color:#9ca3af;font-size:13px">No reviews yet — be the first to review this product after your purchase.</div>
            </div>`;
            return;
        }
        el.innerHTML = `<div style="padding:16px 0">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
                <div style="font-weight:800;font-size:16px">Reviews</div>
                <div style="color:#f59e0b;font-weight:700;font-size:14px">★ ${avgRating.toFixed(1)}</div>
                <div style="color:#9ca3af;font-size:13px">(${total})</div>
            </div>
            ${reviews.slice(0,10).map(rv => `
                <div style="padding:10px 0;border-bottom:1px solid #f3f4f6">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                        <span style="font-weight:700;font-size:13px">${(rv.user?.name||'User')}</span>
                        <span style="color:#f59e0b;font-size:12px">${'★'.repeat(rv.rating)}${'☆'.repeat(5-rv.rating)}</span>
                        ${rv.is_verified_purchase ? `<span style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:8px;font-size:10px;font-weight:700">VERIFIED PURCHASE</span>` : ''}
                    </div>
                    ${rv.text ? `<div style="font-size:13px;color:#4b5563;line-height:1.5">${rv.text}</div>` : ''}
                    ${rv.seller_response ? `<div style="margin-top:6px;padding:8px;background:#f9fafb;border-radius:8px;font-size:12px;color:#6b7280"><strong>Seller response:</strong> ${rv.seller_response}</div>` : ''}
                </div>`).join('')}
        </div>`;
    } catch(_) { el.innerHTML = ''; }
}

async function _loadRelatedProducts(product) {
    const el = document.getElementById('pfRelatedSection');
    if (!el) return;
    try {
        const r = await window._api?.('GET', `/marketplace/recommendations?category=${encodeURIComponent(product.category||'')}&exclude=${product.id||product._id}`);
        const related = (r?.data?.products || r?.data?.recommendations || []).filter(p => String(p.id) !== String(product.id||product._id)).slice(0,8);
        if (!related.length) { el.innerHTML = ''; return; }
        el.innerHTML = `<div style="padding:16px">
            <div style="font-weight:800;font-size:16px;margin-bottom:12px">You may also like</div>
            <div style="display:flex;gap:10px;overflow-x:auto">
                ${related.map(p => `
                <div onclick="window._jmOpenProduct?.('${p.id}')" style="flex-shrink:0;width:130px;cursor:pointer">
                    ${p.images?.[0]||p.image ? `<img src="${p.images?.[0]||p.image}" style="width:130px;height:130px;object-fit:cover;border-radius:10px;background:#f3f4f6">` : `<div style="width:130px;height:130px;border-radius:10px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:32px">📦</div>`}
                    <div style="font-size:12px;font-weight:600;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title||''}</div>
                    <div style="font-size:13px;font-weight:800;color:#f57224">KES ${parseFloat(p.price||0).toLocaleString()}</div>
                </div>`).join('')}
            </div>
        </div>`;
    } catch(_) { el.innerHTML = ''; }
}

// Install immediately
window._jmOpenProduct = function(productId) {
    try { window.BehaviorTracker?.track('view', { product_id: productId }); } catch(_) {}
    _realOpenProduct(productId);
};

// Reinstall after advanced.js _init() potentially overwrites us
function _reinstall() {
    const cur = window._jmOpenProduct;
    const src = cur ? cur.toString() : '';
    // If current version still calls _origOpenProduct (the broken version), replace it
    if (!window.__uiFixInstalled || (src.includes('_origOpenProduct') && !window.__uiFixInstalled)) {
        window.__uiFixInstalled = true;
        window._jmOpenProduct = function(productId) {
            try { window.BehaviorTracker?.track('view', { product_id: productId }); } catch(_) {}
            _realOpenProduct(productId);
        };
    }
}
document.addEventListener('DOMContentLoaded', () => setTimeout(_reinstall, 300));
window.addEventListener('load', () => { _reinstall(); setTimeout(_reinstall, 800); setTimeout(_reinstall, 2000); });

// ── ROOT-CAUSE FIX: Seller Dashboard (and every other seller/admin tool,
// plus wallet/loyalty/referral) rendered nothing when clicked ───────────────
// Tool-core.js and Tool-ui.js are loaded with type="module" in Tools.html.
// Module scripts are ALWAYS deferred by the browser, regardless of where
// they appear in the document — so even though they're declared near the
// top of the page, they actually execute AFTER every classic <script src=...>
// tag below them, including marketplace-ecommerce.js, -checkout.js,
// -advanced.js, -seller.js, and -admin.js.
//
// Those classic scripts each wrap window._jmNavMore in turn — advanced.js
// adds wallet/loyalty/referral, seller.js adds all seller-* pages plus
// admin-approval, admin.js adds the rest of admin-*  — with each wrapper
// falling back to whatever _jmNavMore was before it for keys it doesn't
// recognize. By the time admin.js finishes, that chain is complete and
// correct.
//
// Then Tool-ui.js's deferred module code runs and does
// `window._jmNavMore = _navMore` unconditionally, discarding that entire
// chain and replacing it with its own base implementation — whose page
// switch has explicit empty-`break` cases for every seller-*/admin-* key
// (the code comment there literally says "handled by marketplace-seller.js
// _jmNavMore override," which is exactly the override that just got
// destroyed) and no case at all for wallet/loyalty/referral. Result: every
// one of those menu items silently renders nothing.
//
// Fix: capture the working chain right now (this classic script runs last,
// after admin.js, so window._jmNavMore at this exact point IS that correct,
// fully-assembled chain) and recompose it with Tool-ui's base after Tool-ui
// has had its chance to run.
const _sellerAdminNavChain = window._jmNavMore;
const _chainHandledKeys = new Set([
    'seller-dashboard','my-listings','seller-inventory','seller-analytics',
    'seller-payouts','seller-shipping','seller-returns','seller-verification',
    'seller-subscription','admin-approval','admin-dashboard','admin-products',
    'admin-sellers','admin-buyers','admin-orders','admin-analytics',
    'admin-payouts','admin-coupons','admin-reviews','admin-support',
    'admin-settings','wallet','loyalty','referral',
]);

function _reinstallNavMore() {
    const toolUiBase = window._jmNavMore; // whatever Tool-ui.js installed, by now
    if (toolUiBase === _sellerAdminNavChain) return; // nothing clobbered it — leave alone
    if (window.__uiFixNavMoreInstalled) return;       // already recomposed
    window.__uiFixNavMoreInstalled = true;
    window._jmNavMore = function(page, ...args) {
        if (_chainHandledKeys.has(page) && typeof _sellerAdminNavChain === 'function') {
            return _sellerAdminNavChain(page, ...args);
        }
        return toolUiBase?.(page, ...args);
    };
}
// Module scripts finish executing before DOMContentLoaded fires, so by the
// time this handler runs, Tool-ui.js's clobbering has already happened and
// toolUiBase above will be captured correctly. The extra delayed retries
// guard against any further re-installs elsewhere in the app.
document.addEventListener('DOMContentLoaded', () => setTimeout(_reinstallNavMore, 300));
window.addEventListener('load', () => { _reinstallNavMore(); setTimeout(_reinstallNavMore, 800); setTimeout(_reinstallNavMore, 2000); });

// AUDIT FIX: these were called by the fallback product-detail buttons
// (onclick="window._jmAddToCart?.(...)") but never defined anywhere in the
// entire codebase — Add to Cart was a permanent silent no-op, and Buy Now
// only appeared to work because of its `|| window._jmNavMore?.('checkout')`
// fallback, which navigated to checkout without actually adding anything.
function _resolveCachedProduct(productId) {
    const cached = window.__uiFixProductCache?.[String(productId)];
    if (cached) return cached;
    // Fall back to the EcomMarketplace product store if the fallback
    // renderer's cache doesn't have it (e.g. called from elsewhere).
    return window.EcomMarketplace?.ProductEngine?.getStore?.()?.products?.get(String(productId)) || null;
}

window._jmAddToCart = function(productId, quantity = 1) {
    const product = _resolveCachedProduct(productId);
    if (!product) { console.warn('[ui-fix] _jmAddToCart: product not found for', productId); return; }
    if (!window.CartEngine) { console.warn('[ui-fix] _jmAddToCart: CartEngine not loaded'); return; }
    return window.CartEngine.add(product, quantity);
};

window._jmBuyNow = function(productId) {
    const product = _resolveCachedProduct(productId);
    if (!product || !window.CartEngine) return false;
    const result = window.CartEngine.add(product, 1);
    if (result?.success) {
        window._jmNavMore?.('checkout');
        return true;
    }
    return false;
};

// AUDIT FIX: the real product-detail page had no way at all to message the
// seller — confirmed missing entirely. This is direct buyer↔seller chat
// (no admin routing/moderation step exists anywhere in the backend for it).
// chat.html already has a real, working bridge for this ("Chat-seller
// bridge — marketplace requests opening a DM"), but it only fires on an
// exact payload shape: type 'OPEN_CHAT' with payload.product_id present
// and userId/userName fields — matching that exactly here.
window._jmMessageSeller = function(sellerId, sellerName, productId) {
    if (!sellerId) return;
    try {
        window.parent?.postMessage({
            type: 'OPEN_CHAT',
            payload: {
                userId: sellerId, userName: sellerName || 'Seller',
                seller_id: sellerId, seller_name: sellerName || 'Seller',
                product_id: productId || 'unknown',
                message: `Hi, I'm interested in your listing`,
            },
        }, '*');
    } catch(_) {
        window.location.href = '/chat.html?recipientId=' + encodeURIComponent(sellerId) + '&name=' + encodeURIComponent(sellerName || 'Seller');
    }
};

// ── 3. _api BASE URL PATCH for seller.js and admin.js ─────────────────────
// These files define their own _api internally — patch the global fallback
// so any file that uses window.__kynAPI.baseUrl gets the right value
window.addEventListener('DOMContentLoaded', function() {
    if (!window.__kynAPI) window.__kynAPI = {};
    if (!window.__kynAPI.baseUrl || window.__kynAPI.baseUrl.includes(window.location.host)) {
        window.__kynAPI.baseUrl = _resolveNexopaApiBase();
    }
});

// ── 4. GLOBAL RENDER ERROR GUARD ──────────────────────────────────────────
// Catches unhandled promise rejections in render functions → prevents white screens
window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason;
    if (!reason) return;
    const msg = reason?.message || String(reason);
    const stack = reason?.stack || '';
    const isMarketplace = stack.includes('marketplace') || stack.includes('render') ||
                          msg.includes('marketplace') || msg.includes('Cannot read');
    if (!isMarketplace) return;

    console.warn('[ui-fix] Caught marketplace error:', msg);

    // Find any visible empty marketplace container and show friendly error
    const mainArea = document.getElementById('mainContent') || document.querySelector('.marketplace-main') ||
                     document.querySelector('[data-page="marketplace"]');
    if (mainArea && (!mainArea.innerHTML.trim() || mainArea.innerHTML.includes('Loading'))) {
        mainArea.innerHTML = `
            <div style="padding:40px 20px;text-align:center;color:#6b7280;max-width:400px;margin:60px auto">
                <div style="font-size:48px;margin-bottom:16px">⚠️</div>
                <div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:8px">Something went wrong</div>
                <div style="font-size:13px;margin-bottom:20px">There was an issue loading this page. Please try again.</div>
                <button onclick="window.location.reload()"
                    style="background:#f57224;color:#fff;border:none;border-radius:12px;padding:12px 24px;font-weight:700;cursor:pointer;font-size:14px">
                    Retry
                </button>
            </div>`;
    }
    event.preventDefault();
});

console.log('[marketplace-ui-fix.js] ✅ All forensic fixes installed');
