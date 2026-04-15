// =============================================
// TOOL SYSTEM INTEGRATION — append after line 7081 (export default marketplace)
// in Tool-core.js
// =============================================
// Wires:  LocalStoreTools  → saveToolLocal()
//         ToolRegistryManager → registry checks
//         ToolPermissionGuard → permission enforcement
//         ToolExecutionSandbox → sandboxed execution
//         ToolSyncEngine      → background sync + server push
//
// This block is self-contained and NON-BREAKING.
// If any module is unavailable the core app continues normally.
// =============================================

// ─── INTEGRATION BOOTSTRAP ────────────────────────────────────────────────────

(function bootstrapToolSystem() {
    'use strict';

    // ── Wait for all tool-system modules to be ready ──────────────────────────
    let _toolSystemReady = false;

    function _onToolSystemReady() {
        if (_toolSystemReady) return;
        if (
            !window.LocalStoreTools     ||
            !window.ToolRegistryManager ||
            !window.ToolPermissionGuard ||
            !window.ToolExecutionSandbox||
            !window.ToolSyncEngine
        ) {
            // Modules not yet loaded — retry in 200ms
            setTimeout(_onToolSystemReady, 200);
            return;
        }
        _toolSystemReady = true;
        _initToolSystem();
    }

    async function _initToolSystem() {
        const LST   = window.LocalStoreTools;
        const TRM   = window.ToolRegistryManager;
        const TPG   = window.ToolPermissionGuard;
        const TES   = window.ToolExecutionSandbox;
        const TSE   = window.ToolSyncEngine;

        // 1. Open IndexedDB store (non-blocking)
        await LST.ready();

        // 2. Init registry from local cache first (offline-first)
        await TRM.init();

        // 3. Wire up the sync engine with the app's authorizedFetch
        //    Only starts if we have a valid session token
        const token = window.marketplaceCore?.getCentralToken?.();
        if (token || window.location.hostname === 'localhost') {
            await TSE.init(window.authorizedFetch || _fallbackFetch);
            TSE.startPolling();
        }

        // 4. Subscribe to LocalStoreTools changes → update KynectaStore
        LST.subscribe((event, storeName, item) => {
            if (storeName === LST.STORES.LISTINGS && window.KynectaStore) {
                // Keep the reactive store in sync with the local IDB store
                window.KynectaStore.set('sync.lastSync', Date.now(), { silent: true });
            }
        });

        // 5. Expose saveToolLocal globally (for use in Tool-ui.js + publishListing)
        window.saveToolLocal = async function(item, storeName) {
            return LST.saveToolLocal(item, storeName || LST.STORES.LISTINGS);
        };

        // 6. Expose a unified publishListing that hits local + server
        window.publishListingFull = async function(listingData) {
            if (!listingData || !listingData.title) return null;

            // Build listing object
            const user    = window.currentUser || {};
            const listing = {
                id         : listingData.id || ('listing_' + Date.now() + '_' + Math.random().toString(36).slice(2,8)),
                sellerId   : user.id     || 'local',
                sellerName : user.displayName || user.name || 'You',
                type       : listingData.type        || 'service',
                title      : listingData.title,
                description: listingData.description || '',
                price      : parseFloat(listingData.price) || 0,
                category   : listingData.category    || 'services',
                condition  : listingData.condition   || 'new',  // ← NEW field
                availability: listingData.availability || 'free',
                visibility : listingData.visibility  || 'public',
                featured   : !!listingData.featured,
                premium    : !!listingData.premium,
                images     : listingData.images      || [],
                available  : true,
                views      : 0,
                savedBy    : [],
                createdAt  : new Date().toISOString(),
                updatedAt  : new Date().toISOString(),
            };

            // ── Step 1: Save locally first (ALWAYS — offline-first) ────────────
            const saved = await LST.saveListingLocal(listing);
            if (!saved) {
                console.error('[ToolSystem] saveToolLocal failed for listing:', listing.id);
                return null;
            }

            // Verify offline integrity
            const integrity = await LST.verifyOfflineIntegrity(listing.id, LST.STORES.LISTINGS);
            console.log('[ToolSystem] Publish integrity:', integrity);

            // ── Step 2: Push to server (non-blocking, queue if offline) ─────────
            if (navigator.onLine) {
                TSE.queueListingCreated(listing);
                TSE.flushQueue().catch(() => {}); // fire-and-forget
            } else {
                TSE.queueListingCreated(listing);
                console.log('[ToolSystem] Offline — queued for server sync');
            }

            // ── Step 3: Broadcast to other tabs via BroadcastChannel ─────────────
            try {
                const bc = new BroadcastChannel('marketplace_sync');
                bc.postMessage({ type: 'LISTING_CREATED', listing });
                bc.close();
            } catch { /* ignore if not supported */ }

            // ── Step 4: Update KynectaStore ───────────────────────────────────────
            if (window.KynectaStore) {
                window.KynectaStore.set('sync.lastSync', Date.now());
            }

            console.log('[ToolSystem] ✅ Listing published — id:', listing.id, '| offline safe: true');
            return listing;
        };

        // 7. Intercept marketplace.createListing to also save locally
        if (window.marketplace && typeof window.marketplace.createListing === 'function') {
            const _orig = window.marketplace.createListing.bind(window.marketplace);
            window.marketplace.createListing = async function(data) {
                const result = await _orig(data);
                if (result) await LST.saveListingLocal(result);
                return result;
            };
        }

        // 8. Load cached listings into allListings on startup (instant UI)
        const cachedListings = LST.getAllListings();
        if (cachedListings.length && (!window.allListings || !window.allListings.length)) {
            window.allListings = cachedListings;
            console.log('[ToolSystem] Hydrated allListings from cache:', cachedListings.length);
            window.dispatchEvent(new CustomEvent('marketplace:data-updated', {
                detail: { listings: cachedListings }
            }));
        }

        // 8b. Start background listing fetch immediately (offline-first — no auth gate)
        //     This fires BEFORE session handshake so UI shows real data instantly
        (function kickstartBackgroundLoad() {
            function tryLoad() {
                // Try via Tool-core exported function first
                if (typeof window.loadListingsFromBackend === 'function') {
                    window.loadListingsFromBackend().catch(() => {});
                    return;
                }
                // Fallback: direct fetch with whatever token we have
                const token = window.marketplaceCore?.getCentralToken?.() || 
                              window.__PARENT_SESSION__?.token || '';
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = 'Bearer ' + token;
                
                fetch('/api/marketplace/listings?page=1&limit=50', {
                    method: 'GET', headers, credentials: 'include'
                })
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    const listings = data?.data?.listings || data?.listings || [];
                    if (!listings.length) return;
                    window.allListings = listings;
                    if (LST) LST.saveMany(listings, LST.STORES.LISTINGS).catch(() => {});
                    window.dispatchEvent(new CustomEvent('marketplace:data-updated', {
                        detail: { listings, source: 'patch-background' }
                    }));
                })
                .catch(() => {
                    // Offline — already hydrated from cache above
                });
            }
            // Try immediately and again after 2 seconds (in case token not ready)
            setTimeout(tryLoad, 300);
            setTimeout(tryLoad, 2500);
        })();

        // 9. KynectaStore integration — sync when marketplace data changes
        if (window.KynectaStore) {
            window.KynectaStore.subscribe('session', (session) => {
                if (session?.authenticated && TSE) {
                    TSE.flushQueue().catch(() => {});
                }
            });
        }

        console.log('[ToolSystem] ✅ Tool system fully wired');
        window.dispatchEvent(new CustomEvent('toolSystem:ready', {
            detail: {
                localStore : LST.getCacheStats(),
                registry   : TRM.getStats(),
                sync       : TSE.getStatus(),
            }
        }));
    }

    // Fallback fetch used when authorizedFetch isn't yet available
    async function _fallbackFetch(url, options = {}) {
        const token = window.marketplaceCore?.getCentralToken?.() || '';
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
            ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        };
        const resp = await fetch(url, { ...options, headers, credentials: 'include' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
    }

    // Kick off when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _onToolSystemReady);
    } else {
        _onToolSystemReady();
    }

    // Also retry after module lifecycle is ACTIVE
    window.addEventListener('tools:active',     _onToolSystemReady);
    window.addEventListener('marketplaceCoreReady', _onToolSystemReady);

})();


// ─── EXPORTS for Tool-ui.js imports ───────────────────────────────────────────

export { authorizedFetch };

// saveToolLocal — now points to LocalStoreTools (IDB-backed)
// Exported so Tool-ui.js can import it directly
export async function saveToolLocal(item, storeName) {
    const LST = window.LocalStoreTools;
    if (LST) return LST.saveToolLocal(item, storeName || LST.STORES.LISTINGS);
    // Fallback: plain localStorage
    try {
        const key = 'mktp_listings_' + item.id;
        localStorage.setItem(key, JSON.stringify(item));
        const all = JSON.parse(localStorage.getItem('mktp_all_listings') || '[]');
        const idx = all.findIndex(l => l.id === item.id);
        if (idx >= 0) all[idx] = item; else all.unshift(item);
        localStorage.setItem('mktp_all_listings', JSON.stringify(all));
        return true;
    } catch { return false; }
}

// Condition helper (new / used / refurbished) — used by UI for the condition field
export const ITEM_CONDITIONS = {
    NEW         : 'new',
    USED        : 'used',
    REFURBISHED : 'refurbished',
};

export function getConditionLabel(condition) {
    const labels = {
        new         : '✨ New',
        used        : '🔄 Used',
        refurbished : '🔧 Refurbished',
    };
    return labels[condition] || '✨ New';
}

export function getConditionTag(condition) {
    const classes = {
        new         : 'tag-condition-new',
        used        : 'tag-condition-used',
        refurbished : 'tag-condition-refurb',
    };
    return classes[condition] || 'tag-condition-new';
}

// ── Currency Helpers (Kenya Shillings) ─────────────────────────────────────────

export const CURRENCY = { code: 'KES', symbol: 'KES', locale: 'en-KE' };

export function formatPrice(amount, currency = 'KES') {
    if (!amount || amount === '0' || amount === 0) return 'Free';
    const num = parseFloat(String(amount).replace(/[^0-9.]/g, ''));
    if (isNaN(num) || num === 0) return String(amount);
    return currency + ' ' + num.toLocaleString('en-KE');
}

export function parsePriceToKes(priceStr) {
    if (!priceStr) return 0;
    const clean = String(priceStr).replace(/[^0-9.]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
}

// Make formatPrice globally available
window.formatPrice = formatPrice;
window.parsePriceToKes = parsePriceToKes;
window.CURRENCY = CURRENCY;