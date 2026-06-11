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
(function _fixApiBase() {
    if (window.__kynAPI?.baseUrl) return;
    window.__kynAPI = window.__kynAPI || {};
    window.__kynAPI.baseUrl = window.location.origin + '/api';
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
    const base = (window.__kynAPI?.baseUrl || window.location.origin + '/api').replace(/\/api$/, '');
    const token = window.__kynToken || window.__accessToken ||
                  localStorage.getItem('authToken') || localStorage.getItem('token') ||
                  localStorage.getItem('moodchat_token') || localStorage.getItem('accessToken') || '';

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
        </div>`;
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

// ── 3. _api BASE URL PATCH for seller.js and admin.js ─────────────────────
// These files define their own _api internally — patch the global fallback
// so any file that uses window.__kynAPI.baseUrl gets the right value
window.addEventListener('DOMContentLoaded', function() {
    if (!window.__kynAPI) window.__kynAPI = {};
    if (!window.__kynAPI.baseUrl) {
        window.__kynAPI.baseUrl = window.location.origin + '/api';
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
