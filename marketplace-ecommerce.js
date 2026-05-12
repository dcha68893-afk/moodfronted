/**
 * marketplace-ecommerce.js — COMPLETE REALTIME ECOMMERCE SYSTEM v1.0
 * ═══════════════════════════════════════════════════════════════════════
 * Fully integrated with existing Tool-core.js + Tool-ui.js architecture.
 * Implements: Cart, Orders, Payments (M-Pesa/Card), Reviews, Wishlist,
 *             Seller Dashboard, Realtime Stock, Delivery, Notifications,
 *             Search/Filter/Sort, Buyer-Seller Chat bridge.
 * ═══════════════════════════════════════════════════════════════════════
 * DROP-IN: Append to Tool-core.js exports OR import in Tool-ui.js.
 * All API calls reuse safeApiCall / secureApiCall from Tool-core.js.
 * All socket events use the existing KynectaRealtime socket bridge.
 * ═══════════════════════════════════════════════════════════════════════
 */

// ══════════════════════════════════════════════════════════════════════
// SECTION 1 — PRODUCT SCHEMA & LOCAL CACHE
// ══════════════════════════════════════════════════════════════════════

const PRODUCT_SCHEMA_VERSION = 2;

/** Full product shape expected from /api/marketplace/products */
const _normalizeProduct = (raw) => ({
    id:             String(raw.id || raw._id || ''),
    seller_id:      String(raw.seller_id || raw.sellerId || raw.userId || ''),
    seller:         raw.seller || { id: '', name: 'Unknown', avatar: '', rating: 0, verified: false },
    title:          String(raw.title || ''),
    description:    String(raw.description || ''),
    category:       String(raw.category || 'general'),
    subcategory:    String(raw.subcategory || ''),
    images:         Array.isArray(raw.images) ? raw.images : [],
    price:          parseFloat(raw.price) || 0,
    original_price: parseFloat(raw.original_price || raw.originalPrice) || 0,
    discount:       parseFloat(raw.discount) || 0,
    stock_quantity: parseInt(raw.stock_quantity ?? raw.stockQuantity ?? 999),
    rating:         parseFloat(raw.rating) || 0,
    reviews_count:  parseInt(raw.reviews_count || raw.reviewsCount) || 0,
    delivery_fee:   parseFloat(raw.delivery_fee || raw.deliveryFee) || 0,
    location:       String(raw.location || raw.city || ''),
    tags:           Array.isArray(raw.tags) ? raw.tags : [],
    condition:      String(raw.condition || 'new'),
    brand:          String(raw.brand || ''),
    sku:            String(raw.sku || ''),
    is_featured:    !!(raw.is_featured || raw.isFeatured || raw.featured),
    is_flash_sale:  !!(raw.is_flash_sale || raw.isFlashSale),
    flash_end:      raw.flash_end || raw.flashEnd || null,
    available:      raw.available !== false && (raw.stock_quantity ?? raw.stockQuantity ?? 1) > 0,
    created_at:     raw.created_at || raw.createdAt || new Date().toISOString(),
    updated_at:     raw.updated_at || raw.updatedAt || new Date().toISOString(),
    views:          parseInt(raw.views) || 0,
    sold_count:     parseInt(raw.sold_count || raw.soldCount) || 0,
    wishlist_count: parseInt(raw.wishlist_count || raw.wishlistCount) || 0,
});

// ─────────────────────────────────────────────────────────────────────
// In-memory store (mirrors IndexedDB via LocalStoreTools when available)
// ─────────────────────────────────────────────────────────────────────
const _store = {
    products:    new Map(),
    cart:        new Map(),   // productId → { product, quantity, addedAt }
    orders:      new Map(),
    wishlist:    new Set(),
    reviews:     new Map(),   // productId → [review]
    categories:  [],
    searchIndex: [],
    featured:    [],
    trending:    [],
    flash_sales: [],
    recent:      [],
    notifications: [],
    initialized: false,
};

// Persist cart/wishlist to localStorage (survives refresh)
const _LS = {
    CART:      'knt_ecom_cart_v2',
    WISHLIST:  'knt_ecom_wishlist_v2',
    ORDERS:    'knt_ecom_orders_v2',
    NOTIFS:    'knt_ecom_notifs_v2',
};

function _lsSave(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(_) {}
}
function _lsLoad(key, fallback = null) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch(_) { return fallback; }
}

// ══════════════════════════════════════════════════════════════════════
// SECTION 2 — SAFE API SHIM (uses Tool-core.js safeApiCall)
// ══════════════════════════════════════════════════════════════════════

async function _api(method, endpoint, body = null) {
    try {
        // Primary: window._ecomApiCall wraps Tool-core.js safeApiCall (has token)
        if (typeof window._ecomApiCall === 'function') {
            return await window._ecomApiCall(method, endpoint, body);
        }
        // Fallback: direct fetch using any available token
        const token = window.__kynToken || window.__accessToken ||
            window.__PARENT_SESSION__?.token ||
            localStorage.getItem('authToken') || localStorage.getItem('token') ||
            localStorage.getItem('moodchat_token') || localStorage.getItem('accessToken') || '';
        if (!token) return null; // No token — skip, don't error
        const baseUrl = window.__kynAPI?.baseUrl?.replace(/\/api$/, '').replace(/\/$/, '') ||
            (typeof window.__getApiBase === 'function' ? window.__getApiBase().replace(/\/api$/, '') : '') ||
            'http://localhost:4000';
        const res = await fetch(baseUrl + '/api' + endpoint, {
            method: method.toUpperCase(),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {})
        });
        if (!res.ok) return null;
        return await res.json();
    } catch(e) {
        return null; // Silent fail — marketplace works offline
    }
}

// ══════════════════════════════════════════════════════════════════════
// SECTION 3 — PRODUCT ENGINE
// ══════════════════════════════════════════════════════════════════════

export const ProductEngine = {

    async init() {
        if (_store.initialized) return;
        // Restore cart & wishlist from localStorage
        const savedCart = _lsLoad(_LS.CART, []);
        savedCart.forEach(item => _store.cart.set(item.product.id, item));
        const savedWL = _lsLoad(_LS.WISHLIST, []);
        savedWL.forEach(id => _store.wishlist.add(id));
        const savedOrders = _lsLoad(_LS.ORDERS, []);
        savedOrders.forEach(o => _store.orders.set(o.id, o));
        const savedNotifs = _lsLoad(_LS.NOTIFS, []);
        _store.notifications = savedNotifs;
        _store.initialized = true;
    },

    /** Fetch all products from backend and populate store */
    async loadProducts({ category = '', search = '', page = 1, limit = 40, sort = 'newest' } = {}) {
        const params = new URLSearchParams({ page, limit, sort });
        if (category) params.set('category', category);
        if (search)   params.set('search', search);

        const resp = await _api('GET', `/api/marketplace/products?${params}`);
        const raw  = resp?.data?.products || resp?.products || [];
        const normalized = raw.map(_normalizeProduct);

        normalized.forEach(p => _store.products.set(p.id, p));

        // Also build featured/trending/flash from the same data
        _store.featured    = normalized.filter(p => p.is_featured).slice(0, 12);
        _store.trending    = [...normalized].sort((a,b) => b.views - a.views).slice(0, 12);
        _store.flash_sales = normalized.filter(p => p.is_flash_sale);
        _store.recent      = [...normalized].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
        _store.searchIndex = normalized;

        // Emit event for UI layer
        window.dispatchEvent(new CustomEvent('ecom:products-loaded', { detail: {
            products: normalized, featured: _store.featured, trending: _store.trending,
            flash: _store.flash_sales, recent: _store.recent
        }}));

        return normalized;
    },

    async getProduct(id) {
        if (_store.products.has(id)) return _store.products.get(id);
        const resp = await _api('GET', `/api/marketplace/products/${id}`);
        const raw = resp?.data?.product || resp?.product;
        if (!raw) return null;
        const p = _normalizeProduct(raw);
        _store.products.set(p.id, p);
        return p;
    },

    async loadCategories() {
        const resp = await _api('GET', '/api/marketplace/categories');
        _store.categories = resp?.data?.categories || resp?.categories || _DEFAULT_CATEGORIES;
        window.dispatchEvent(new CustomEvent('ecom:categories-loaded', { detail: { categories: _store.categories }}));
        return _store.categories;
    },

    /** Client-side search with autocomplete */
    search(query, filters = {}) {
        const q = (query || '').toLowerCase().trim();
        let results = _store.searchIndex;

        if (q) {
            results = results.filter(p =>
                p.title.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q) ||
                p.category.toLowerCase().includes(q) ||
                (p.tags || []).some(t => t.toLowerCase().includes(q)) ||
                (p.brand || '').toLowerCase().includes(q)
            );
        }

        // Filters
        if (filters.category)   results = results.filter(p => p.category === filters.category);
        if (filters.min_price)  results = results.filter(p => p.price >= parseFloat(filters.min_price));
        if (filters.max_price)  results = results.filter(p => p.price <= parseFloat(filters.max_price));
        if (filters.rating)     results = results.filter(p => p.rating >= parseFloat(filters.rating));
        if (filters.location)   results = results.filter(p => p.location.toLowerCase().includes(filters.location.toLowerCase()));
        if (filters.available)  results = results.filter(p => p.available && p.stock_quantity > 0);
        if (filters.seller_id)  results = results.filter(p => p.seller_id === filters.seller_id);

        // Sort
        switch (filters.sort || 'newest') {
            case 'price_low':   results.sort((a,b) => a.price - b.price); break;
            case 'price_high':  results.sort((a,b) => b.price - a.price); break;
            case 'popular':     results.sort((a,b) => b.views - a.views); break;
            case 'rating':      results.sort((a,b) => b.rating - a.rating); break;
            case 'newest':
            default:            results.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        }

        return results;
    },

    getStore: () => _store,
    getAllProducts: () => Array.from(_store.products.values()),
    getFeatured: () => _store.featured,
    getTrending: () => _store.trending,
    getFlashSales: () => _store.flash_sales,
    getRecent: () => _store.recent,
    getCategories: () => _store.categories,
};

const _DEFAULT_CATEGORIES = [
    { id: 'electronics', name: 'Electronics', icon: '📱', color: '#2196F3' },
    { id: 'fashion',     name: 'Fashion',     icon: '👗', color: '#E91E63' },
    { id: 'home',        name: 'Home & Garden', icon: '🏠', color: '#4CAF50' },
    { id: 'beauty',      name: 'Beauty',      icon: '💄', color: '#FF4081' },
    { id: 'sports',      name: 'Sports',      icon: '⚽', color: '#FF9800' },
    { id: 'books',       name: 'Books',       icon: '📚', color: '#795548' },
    { id: 'toys',        name: 'Toys',        icon: '🧸', color: '#FFC107' },
    { id: 'food',        name: 'Food & Groceries', icon: '🛒', color: '#66BB6A' },
    { id: 'automotive',  name: 'Automotive',  icon: '🚗', color: '#607D8B' },
    { id: 'services',    name: 'Services',    icon: '🔧', color: '#9C27B0' },
    { id: 'digital',     name: 'Digital',     icon: '💾', color: '#00BCD4' },
    { id: 'health',      name: 'Health',      icon: '💊', color: '#F44336' },
];

// ══════════════════════════════════════════════════════════════════════
// SECTION 4 — CART ENGINE
// ══════════════════════════════════════════════════════════════════════

export const CartEngine = {

    _save() {
        _lsSave(_LS.CART, Array.from(_store.cart.values()));
        window.dispatchEvent(new CustomEvent('ecom:cart-updated', { detail: { cart: this.getCart() }}));
    },

    add(product, quantity = 1) {
        if (!product || !product.id) return { success: false, message: 'Invalid product' };
        if (product.stock_quantity <= 0) return { success: false, message: 'Out of stock' };

        const existing = _store.cart.get(product.id);
        const totalQty = (existing?.quantity || 0) + quantity;

        if (totalQty > product.stock_quantity) {
            return { success: false, message: `Only ${product.stock_quantity} available` };
        }

        _store.cart.set(product.id, {
            product: { ...product },
            quantity: totalQty,
            addedAt: existing?.addedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        this._save();
        NotificationEngine.show(`"${product.title}" added to cart`, 'success', '🛒');
        return { success: true, cart: this.getCart() };
    },

    remove(productId) {
        _store.cart.delete(productId);
        this._save();
    },

    updateQuantity(productId, quantity) {
        const item = _store.cart.get(productId);
        if (!item) return;
        if (quantity <= 0) { this.remove(productId); return; }
        if (quantity > item.product.stock_quantity) {
            quantity = item.product.stock_quantity;
        }
        item.quantity = quantity;
        item.updatedAt = new Date().toISOString();
        _store.cart.set(productId, item);
        this._save();
    },

    clear() { _store.cart.clear(); this._save(); },

    getCart() {
        const items = Array.from(_store.cart.values());
        const subtotal = items.reduce((sum, i) => sum + (i.product.price * i.quantity), 0);
        const delivery = items.reduce((sum, i) => sum + (i.product.delivery_fee || 0), 0);
        const discount = items.reduce((sum, i) => {
            const disc = i.product.original_price > 0
                ? (i.product.original_price - i.product.price) * i.quantity : 0;
            return sum + disc;
        }, 0);
        return {
            items,
            count:    items.reduce((s, i) => s + i.quantity, 0),
            subtotal: parseFloat(subtotal.toFixed(2)),
            delivery: parseFloat(delivery.toFixed(2)),
            discount: parseFloat(discount.toFixed(2)),
            total:    parseFloat((subtotal + delivery).toFixed(2)),
        };
    },

    has(productId) { return _store.cart.has(productId); },
    getItem(productId) { return _store.cart.get(productId) || null; },
    size() { return _store.cart.size; },
};

// ══════════════════════════════════════════════════════════════════════
// SECTION 5 — ORDER ENGINE
// ══════════════════════════════════════════════════════════════════════

export const ORDER_STATUS = {
    PENDING:    'pending',
    PAID:       'paid',
    PROCESSING: 'processing',
    SHIPPED:    'shipped',
    DELIVERED:  'delivered',
    CANCELLED:  'cancelled',
    REFUNDED:   'refunded',
};

export const OrderEngine = {

    _save() {
        _lsSave(_LS.ORDERS, Array.from(_store.orders.values()));
    },

    async checkout({ address, payment_method, phone = '', notes = '' } = {}) {
        const cart = CartEngine.getCart();
        if (cart.items.length === 0) return { success: false, message: 'Cart is empty' };
        if (!address) return { success: false, message: 'Delivery address required' };

        const userId = window.currentUser?.id || window.__kynUserId;

        // Build order payload
        const orderPayload = {
            items: cart.items.map(i => ({
                product_id:    i.product.id,
                seller_id:     i.product.seller_id,
                title:         i.product.title,
                price:         i.product.price,
                quantity:      i.quantity,
                delivery_fee:  i.product.delivery_fee,
                image:         i.product.images[0] || '',
            })),
            delivery_address: address,
            payment_method,
            phone,
            notes,
            subtotal:    cart.subtotal,
            delivery:    cart.delivery,
            total:       cart.total,
            currency:    'KES',
        };

        // Optimistic local order
        const tempId = 'local_' + Date.now();
        const localOrder = {
            id:          tempId,
            ...orderPayload,
            buyer_id:    userId,
            status:      ORDER_STATUS.PENDING,
            created_at:  new Date().toISOString(),
            _pending:    true,
        };
        _store.orders.set(tempId, localOrder);
        window.dispatchEvent(new CustomEvent('ecom:order-created', { detail: { order: localOrder }}));

        // Backend call
        const resp = await _api('POST', '/api/marketplace/orders', orderPayload);
        const serverOrder = resp?.data?.order || resp?.order;

        if (serverOrder) {
            _store.orders.delete(tempId);
            const confirmed = {
                ...localOrder,
                ...serverOrder,
                id:       serverOrder.id || tempId,
                _pending: false,
            };
            _store.orders.set(confirmed.id, confirmed);
            this._save();

            // Clear cart after confirmed order
            CartEngine.clear();

            // Trigger payment flow
            window.dispatchEvent(new CustomEvent('ecom:order-confirmed', { detail: { order: confirmed }}));
            NotificationEngine.show('Order placed successfully!', 'success', '🎉');
            NotificationEngine.push({ type: 'order_placed', order_id: confirmed.id, message: `Order #${confirmed.id.slice(-6)} confirmed`, timestamp: new Date().toISOString() });

            // Socket broadcast (if KynectaRealtime available)
            _socketEmit('order:created', { order_id: confirmed.id, buyer_id: userId });

            return { success: true, order: confirmed };
        } else {
            // Fallback: keep local order as pending
            this._save();
            return { success: true, order: localOrder, _offline: true };
        }
    },

    async getOrders() {
        const resp = await _api('GET', '/api/marketplace/orders');
        const serverOrders = resp?.data?.orders || resp?.orders || [];
        serverOrders.forEach(o => _store.orders.set(o.id, o));
        this._save();
        return Array.from(_store.orders.values()).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    },

    async updateStatus(orderId, status, note = '') {
        const resp = await _api('PUT', `/api/marketplace/orders/${orderId}/status`, { status, note });
        if (resp?.success || resp?.data) {
            const order = _store.orders.get(orderId);
            if (order) {
                order.status = status;
                order.updated_at = new Date().toISOString();
                if (note) { order.status_notes = [...(order.status_notes || []), { status, note, at: new Date().toISOString() }]; }
                _store.orders.set(orderId, order);
                this._save();
                window.dispatchEvent(new CustomEvent('ecom:order-status-changed', { detail: { orderId, status, order } }));
                _socketEmit('order:status_changed', { order_id: orderId, status });
                NotificationEngine.push({ type: 'order_status', order_id: orderId, message: `Order status: ${status}`, timestamp: new Date().toISOString() });
            }
        }
        return resp;
    },

    async cancelOrder(orderId, reason = '') {
        return this.updateStatus(orderId, ORDER_STATUS.CANCELLED, reason);
    },

    async trackOrder(orderId) {
        const resp = await _api('GET', `/api/marketplace/orders/${orderId}/tracking`);
        return resp?.data || resp || null;
    },

    getLocalOrders() {
        return Array.from(_store.orders.values()).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    },

    getOrder(orderId) { return _store.orders.get(orderId) || null; },

    getSellerOrders(sellerId) {
        return this.getLocalOrders().filter(o =>
            (o.items || []).some(i => i.seller_id === sellerId)
        );
    },
};

// ══════════════════════════════════════════════════════════════════════
// SECTION 6 — PAYMENT ENGINE (M-Pesa + Card)
// ══════════════════════════════════════════════════════════════════════

export const PaymentEngine = {

    async initiateMpesa({ phone, amount, orderId, description = '' }) {
        if (!phone || !amount || !orderId) return { success: false, message: 'Missing payment fields' };

        // Normalize phone to 254XXXXXXXXX
        const normalized = _normalizeMpesaPhone(phone);
        if (!normalized) return { success: false, message: 'Invalid phone number' };

        const resp = await _api('POST', '/api/payments/mpesa/stk-push', {
            phone: normalized, amount, order_id: orderId,
            description: description || `Payment for order #${orderId.slice(-6)}`,
            callback_url: `${window.location.origin}/api/payments/mpesa/callback`,
        });

        if (resp?.success || resp?.data?.CheckoutRequestID) {
            const requestId = resp.data?.CheckoutRequestID || resp.checkout_request_id;
            window.dispatchEvent(new CustomEvent('ecom:payment-initiated', {
                detail: { method: 'mpesa', phone: normalized, amount, orderId, requestId }
            }));
            return { success: true, requestId, message: 'STK push sent to your phone. Enter M-Pesa PIN.' };
        }
        return { success: false, message: resp?.message || 'M-Pesa initiation failed' };
    },

    async verifyMpesa({ requestId, orderId }) {
        const resp = await _api('POST', '/api/payments/mpesa/verify', { request_id: requestId, order_id: orderId });
        if (resp?.success || resp?.data?.status === 'paid') {
            await OrderEngine.updateStatus(orderId, ORDER_STATUS.PAID, 'M-Pesa payment confirmed');
            window.dispatchEvent(new CustomEvent('ecom:payment-success', { detail: { method: 'mpesa', orderId } }));
            _socketEmit('payment:confirmed', { order_id: orderId, method: 'mpesa' });
            return { success: true };
        }
        return { success: false, pending: resp?.data?.status === 'pending' };
    },

    async initiateCardPayment({ card, amount, orderId }) {
        const resp = await _api('POST', '/api/payments/card', {
            card_number:   card.number?.replace(/\s/g, ''),
            expiry_month:  card.expiry?.split('/')[0]?.trim(),
            expiry_year:   card.expiry?.split('/')[1]?.trim(),
            cvv:           card.cvv,
            holder_name:   card.name,
            amount, order_id: orderId,
        });

        if (resp?.success || resp?.data?.transaction_id) {
            await OrderEngine.updateStatus(orderId, ORDER_STATUS.PAID, 'Card payment confirmed');
            window.dispatchEvent(new CustomEvent('ecom:payment-success', { detail: { method: 'card', orderId } }));
            return { success: true, transaction_id: resp.data?.transaction_id };
        }
        return { success: false, message: resp?.message || 'Card payment failed' };
    },

    async initiateWallet({ userId, amount, orderId }) {
        const resp = await _api('POST', '/api/payments/wallet', { user_id: userId, amount, order_id: orderId });
        if (resp?.success) {
            await OrderEngine.updateStatus(orderId, ORDER_STATUS.PAID, 'Wallet payment confirmed');
            window.dispatchEvent(new CustomEvent('ecom:payment-success', { detail: { method: 'wallet', orderId } }));
        }
        return resp;
    },

    async getWalletBalance(userId) {
        const resp = await _api('GET', `/api/payments/wallet/${userId}/balance`);
        return resp?.data?.balance || resp?.balance || 0;
    },
};

function _normalizeMpesaPhone(phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.startsWith('254') && digits.length === 12) return digits;
    if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1);
    if (digits.length === 9) return '254' + digits;
    return null;
}

// ══════════════════════════════════════════════════════════════════════
// SECTION 7 — WISHLIST ENGINE
// ══════════════════════════════════════════════════════════════════════

export const WishlistEngine = {

    _save() {
        _lsSave(_LS.WISHLIST, Array.from(_store.wishlist));
        window.dispatchEvent(new CustomEvent('ecom:wishlist-updated', { detail: { wishlist: this.getWishlist() }}));
    },

    toggle(productId) {
        if (_store.wishlist.has(productId)) {
            _store.wishlist.delete(productId);
            _api('DELETE', `/api/marketplace/wishlist/${productId}`).catch(() => {});
            this._save();
            return false; // removed
        } else {
            _store.wishlist.add(productId);
            _api('POST', '/api/marketplace/wishlist', { product_id: productId }).catch(() => {});
            this._save();
            const product = _store.products.get(productId);
            if (product) NotificationEngine.show(`"${product.title}" added to wishlist`, 'success', '❤️');
            return true; // added
        }
    },

    has(productId) { return _store.wishlist.has(productId); },

    getWishlist() {
        return Array.from(_store.wishlist)
            .map(id => _store.products.get(id))
            .filter(Boolean);
    },

    async syncFromServer() {
        const resp = await _api('GET', '/api/marketplace/wishlist');
        const items = resp?.data?.items || resp?.items || [];
        items.forEach(item => _store.wishlist.add(item.product_id || item.id));
        this._save();
    },
};

// ══════════════════════════════════════════════════════════════════════
// SECTION 8 — REVIEW ENGINE
// ══════════════════════════════════════════════════════════════════════

export const ReviewEngine = {

    async getReviews(productId, { page = 1, limit = 20 } = {}) {
        const resp = await _api('GET', `/api/marketplace/products/${productId}/reviews?page=${page}&limit=${limit}`);
        const reviews = resp?.data?.reviews || resp?.reviews || [];
        _store.reviews.set(productId, reviews);
        window.dispatchEvent(new CustomEvent('ecom:reviews-loaded', { detail: { productId, reviews } }));
        return reviews;
    },

    async submitReview({ productId, rating, text, images = [] }) {
        if (!productId || !rating) return { success: false, message: 'Product and rating required' };
        if (rating < 1 || rating > 5) return { success: false, message: 'Rating must be 1-5' };

        const resp = await _api('POST', `/api/marketplace/products/${productId}/reviews`, {
            rating: parseInt(rating), text: (text || '').trim(), images
        });

        if (resp?.success || resp?.data?.review) {
            const review = resp.data?.review || resp.review;
            const existing = _store.reviews.get(productId) || [];
            _store.reviews.set(productId, [review, ...existing]);

            // Update local product rating
            const product = _store.products.get(productId);
            if (product) {
                const newCount = product.reviews_count + 1;
                product.rating = parseFloat(((product.rating * product.reviews_count + rating) / newCount).toFixed(1));
                product.reviews_count = newCount;
                _store.products.set(productId, product);
            }

            window.dispatchEvent(new CustomEvent('ecom:review-added', { detail: { productId, review } }));
            _socketEmit('review:new', { product_id: productId, rating });
            NotificationEngine.show('Review submitted successfully', 'success', '⭐');
            return { success: true, review };
        }
        return { success: false, message: resp?.message || 'Review submission failed' };
    },

    getCachedReviews(productId) { return _store.reviews.get(productId) || []; },
};

// ══════════════════════════════════════════════════════════════════════
// SECTION 9 — SELLER DASHBOARD ENGINE
// ══════════════════════════════════════════════════════════════════════

export const SellerEngine = {

    async getProfile(sellerId) {
        const resp = await _api('GET', `/api/marketplace/sellers/${sellerId}`);
        return resp?.data?.seller || resp?.seller || null;
    },

    async getDashboard(sellerId) {
        const resp = await _api('GET', `/api/marketplace/sellers/${sellerId}/dashboard`);
        return resp?.data || resp || null;
    },

    async getMyProducts(sellerId) {
        const resp = await _api('GET', `/api/marketplace/products?seller_id=${sellerId}`);
        return resp?.data?.products || resp?.products || [];
    },

    async createProduct(data) {
        // Validate required fields
        const required = ['title', 'description', 'price', 'category', 'stock_quantity'];
        for (const f of required) {
            if (!data[f] && data[f] !== 0) return { success: false, message: `${f} is required` };
        }

        // Handle image upload first if files provided
        let imageUrls = data.images || [];
        if (data._imageFiles?.length) {
            imageUrls = await this.uploadImages(data._imageFiles);
        }

        const resp = await _api('POST', '/api/marketplace/products', {
            ...data, images: imageUrls, _imageFiles: undefined
        });

        const product = resp?.data?.product || resp?.product;
        if (product) {
            const normalized = _normalizeProduct(product);
            _store.products.set(normalized.id, normalized);
            window.dispatchEvent(new CustomEvent('ecom:product-created', { detail: { product: normalized } }));
            _socketEmit('product:created', { product_id: normalized.id });
            NotificationEngine.show('Product listed successfully!', 'success', '🛒');
            return { success: true, product: normalized };
        }
        return { success: false, message: resp?.message || 'Failed to create product' };
    },

    async updateProduct(productId, updates) {
        if (updates._imageFiles?.length) {
            updates.images = await this.uploadImages(updates._imageFiles);
            delete updates._imageFiles;
        }
        const resp = await _api('PUT', `/api/marketplace/products/${productId}`, updates);
        const product = resp?.data?.product || resp?.product;
        if (product) {
            const normalized = _normalizeProduct(product);
            _store.products.set(productId, normalized);
            window.dispatchEvent(new CustomEvent('ecom:product-updated', { detail: { product: normalized } }));
            _socketEmit('product:updated', { product_id: productId });
            return { success: true, product: normalized };
        }
        return { success: false, message: resp?.message || 'Update failed' };
    },

    async deleteProduct(productId) {
        const resp = await _api('DELETE', `/api/marketplace/products/${productId}`);
        if (resp?.success) {
            _store.products.delete(productId);
            window.dispatchEvent(new CustomEvent('ecom:product-deleted', { detail: { productId } }));
            _socketEmit('product:deleted', { product_id: productId });
            NotificationEngine.show('Product removed', 'info', '🗑️');
            return { success: true };
        }
        return { success: false };
    },

    async updateStock(productId, quantity) {
        const resp = await _api('PATCH', `/api/marketplace/products/${productId}/stock`, { stock_quantity: quantity });
        if (resp?.success || resp?.data) {
            const product = _store.products.get(productId);
            if (product) {
                product.stock_quantity = quantity;
                product.available = quantity > 0;
                _store.products.set(productId, product);
                window.dispatchEvent(new CustomEvent('ecom:stock-updated', { detail: { productId, quantity } }));
                _socketEmit('product:stock_updated', { product_id: productId, quantity });
            }
            return { success: true };
        }
        return { success: false };
    },

    async uploadImages(files) {
        const urls = [];
        for (const file of files) {
            try {
                const formData = new FormData();
                formData.append('file', file);
                const token = window.__kynToken || window.__accessToken || '';
                const baseUrl = window.__kynAPI?.baseUrl?.replace(/\/$/, '') || '';
                const res = await fetch(baseUrl + '/api/marketplace/products/upload-image', {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    body: formData
                });
                const data = await res.json();
                if (data?.url || data?.data?.url) urls.push(data.url || data.data.url);
            } catch(e) {
                // Fallback: create object URL for preview
                urls.push(URL.createObjectURL(file));
            }
        }
        return urls;
    },

    async getEarnings(sellerId, period = '30d') {
        const resp = await _api('GET', `/api/marketplace/sellers/${sellerId}/earnings?period=${period}`);
        return resp?.data || {};
    },

    async respondToReview(reviewId, response) {
        const resp = await _api('POST', `/api/marketplace/reviews/${reviewId}/respond`, { response });
        return resp?.success || false;
    },
};

// ══════════════════════════════════════════════════════════════════════
// SECTION 10 — INVENTORY ENGINE (Realtime stock management)
// ══════════════════════════════════════════════════════════════════════

export const InventoryEngine = {

    /** Called when a socket event arrives */
    handleStockUpdate({ product_id, quantity }) {
        const product = _store.products.get(product_id);
        if (!product) return;
        product.stock_quantity = quantity;
        product.available = quantity > 0;
        _store.products.set(product_id, product);

        // Update cart item if in cart
        const cartItem = _store.cart.get(product_id);
        if (cartItem && cartItem.quantity > quantity) {
            if (quantity <= 0) {
                CartEngine.remove(product_id);
                NotificationEngine.show(`"${product.title}" is now out of stock and was removed from your cart`, 'warning', '⚠️');
            } else {
                CartEngine.updateQuantity(product_id, quantity);
                NotificationEngine.show(`Quantity adjusted: only ${quantity} left for "${product.title}"`, 'info', 'ℹ️');
            }
        }

        window.dispatchEvent(new CustomEvent('ecom:stock-updated', { detail: { productId: product_id, quantity, product } }));
    },

    isInStock(productId) {
        const p = _store.products.get(productId);
        return p ? (p.available && p.stock_quantity > 0) : false;
    },

    getStock(productId) {
        return _store.products.get(productId)?.stock_quantity ?? 0;
    },
};

// ══════════════════════════════════════════════════════════════════════
// SECTION 11 — NOTIFICATION ENGINE
// ══════════════════════════════════════════════════════════════════════

export const NotificationEngine = {

    show(message, type = 'info', icon = 'ℹ️', duration = 3500) {
        // Try to use the existing showNotification from Tool-core.js
        if (typeof showNotification === 'function') {
            showNotification(message, type);
            return;
        }
        // Fallback: create toast
        _createToast(message, type, icon, duration);
    },

    push(notification) {
        const notif = { ...notification, id: Date.now().toString(), read: false };
        _store.notifications.unshift(notif);
        if (_store.notifications.length > 50) _store.notifications.pop();
        _lsSave(_LS.NOTIFS, _store.notifications);
        window.dispatchEvent(new CustomEvent('ecom:notification-push', { detail: { notification: notif } }));
        // Update badge count
        const badge = document.getElementById('ecom-notif-badge');
        const unread = _store.notifications.filter(n => !n.read).length;
        if (badge) badge.textContent = unread > 0 ? (unread > 99 ? '99+' : unread) : '';
    },

    markRead(id) {
        const n = _store.notifications.find(n => n.id === id);
        if (n) { n.read = true; _lsSave(_LS.NOTIFS, _store.notifications); }
    },

    markAllRead() {
        _store.notifications.forEach(n => n.read = true);
        _lsSave(_LS.NOTIFS, _store.notifications);
    },

    getAll() { return _store.notifications; },
    getUnreadCount() { return _store.notifications.filter(n => !n.read).length; },
};

function _createToast(message, type, icon, duration) {
    const existing = document.getElementById('ecom-toast-container');
    const container = existing || (() => {
        const c = document.createElement('div');
        c.id = 'ecom-toast-container';
        c.style.cssText = 'position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;width:min(380px,90vw)';
        document.body.appendChild(c);
        return c;
    })();

    const colors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const toast = document.createElement('div');
    toast.style.cssText = `background:${colors[type]||colors.info};color:#fff;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:500;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,0.2);animation:ecom-slide-in 0.3s ease;pointer-events:auto;`;
    toast.innerHTML = `<span style="font-size:18px">${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'ecom-slide-out 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, duration);
}

// Inject toast animations once
(function() {
    if (document.getElementById('ecom-toast-styles')) return;
    const style = document.createElement('style');
    style.id = 'ecom-toast-styles';
    style.textContent = `
        @keyframes ecom-slide-in { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes ecom-slide-out { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(-20px); } }
    `;
    document.head.appendChild(style);
})();

// ══════════════════════════════════════════════════════════════════════
// SECTION 12 — DELIVERY ENGINE
// ══════════════════════════════════════════════════════════════════════

export const DeliveryEngine = {

    async getZones() {
        const resp = await _api('GET', '/api/marketplace/delivery/zones');
        return resp?.data?.zones || resp?.zones || _DEFAULT_DELIVERY_ZONES;
    },

    calculateFee(sellerLocation, buyerLocation, weight = 0) {
        // Basic formula: base fee + per-km + weight surcharge
        const base = 50;  // KES
        const perKm = 3;  // KES/km
        const weightSurcharge = weight > 5 ? (weight - 5) * 10 : 0;
        // In production, use real geodistance. Simplified:
        const distance = _estimateDistance(sellerLocation, buyerLocation);
        return parseFloat((base + distance * perKm + weightSurcharge).toFixed(2));
    },

    async getTrackingInfo(orderId) {
        const resp = await _api('GET', `/api/marketplace/orders/${orderId}/tracking`);
        return resp?.data || null;
    },

    async estimateArrival(orderId) {
        const resp = await _api('GET', `/api/marketplace/orders/${orderId}/eta`);
        return resp?.data?.eta || '2-3 business days';
    },

    async updateTracking(orderId, trackingData) {
        const resp = await _api('PUT', `/api/marketplace/orders/${orderId}/tracking`, trackingData);
        if (resp?.success) {
            _socketEmit('delivery:updated', { order_id: orderId, ...trackingData });
            NotificationEngine.push({ type: 'delivery_update', order_id: orderId, message: trackingData.status || 'Delivery updated', timestamp: new Date().toISOString() });
        }
        return resp;
    },
};

function _estimateDistance(loc1, loc2) {
    // Placeholder: returns random 5-50km. Replace with real geodistance.
    if (!loc1 || !loc2 || loc1 === loc2) return 5;
    return 5 + Math.floor(Math.random() * 45);
}

const _DEFAULT_DELIVERY_ZONES = [
    { id: 'nairobi',  name: 'Nairobi CBD',        fee: 50,  eta: '1-2 hours' },
    { id: 'suburbs',  name: 'Nairobi Suburbs',     fee: 150, eta: '2-4 hours' },
    { id: 'kenya',    name: 'Rest of Kenya',       fee: 300, eta: '1-3 days' },
    { id: 'express',  name: 'Express (Nairobi)',   fee: 250, eta: '30-60 min' },
];

// ══════════════════════════════════════════════════════════════════════
// SECTION 13 — REALTIME SOCKET BRIDGE
// ══════════════════════════════════════════════════════════════════════

function _socketEmit(event, data) {
    try {
        const rt = window.KynectaRealtime;
        if (rt && typeof rt.emit === 'function') {
            rt.emit(event, data);
        } else if (rt && rt._socket && typeof rt._socket.emit === 'function') {
            rt._socket.emit(event, data);
        }
    } catch(_) {}
}

/** Wire up incoming socket events from the existing KynectaRealtime system */
function _initRealtimeListeners() {
    const rt = window.KynectaRealtime;
    if (!rt) {
        setTimeout(_initRealtimeListeners, 2000);
        return;
    }

    const on = (event, handler) => {
        if (typeof rt.on === 'function') rt.on(event, handler);
        else window.addEventListener('realtime:' + event, (e) => handler(e.detail));
    };

    // Product realtime events
    on('product:updated', data => {
        const existing = _store.products.get(data.product_id);
        if (existing && data.product) {
            _store.products.set(data.product_id, _normalizeProduct({ ...existing, ...data.product }));
            window.dispatchEvent(new CustomEvent('ecom:product-updated', { detail: { productId: data.product_id } }));
        }
    });

    on('product:stock_updated', data => InventoryEngine.handleStockUpdate(data));

    // Order realtime events
    on('order:status_changed', data => {
        const order = _store.orders.get(data.order_id);
        if (order) {
            order.status = data.status;
            _store.orders.set(data.order_id, order);
            window.dispatchEvent(new CustomEvent('ecom:order-status-changed', { detail: { orderId: data.order_id, status: data.status } }));
            NotificationEngine.push({ type: 'order_status', order_id: data.order_id, message: `Order ${data.order_id.slice(-6)} is now: ${data.status}`, timestamp: new Date().toISOString() });
        }
    });

    on('order:created', data => {
        // Seller receives new order notification
        const sellerId = window.currentUser?.id;
        NotificationEngine.push({ type: 'new_order', order_id: data.order_id, message: `New order received #${(data.order_id||'').slice(-6)}`, timestamp: new Date().toISOString() });
        window.dispatchEvent(new CustomEvent('ecom:new-order', { detail: data }));
    });

    // Payment realtime events
    on('payment:confirmed', data => {
        const order = _store.orders.get(data.order_id);
        if (order) {
            order.status = ORDER_STATUS.PAID;
            _store.orders.set(data.order_id, order);
            window.dispatchEvent(new CustomEvent('ecom:payment-success', { detail: data }));
        }
    });

    // Review events
    on('review:new', data => {
        window.dispatchEvent(new CustomEvent('ecom:review-added', { detail: data }));
    });

    // Delivery events
    on('delivery:updated', data => {
        const order = _store.orders.get(data.order_id);
        if (order) {
            order.tracking = { ...order.tracking, ...data };
            _store.orders.set(data.order_id, order);
        }
        NotificationEngine.push({ type: 'delivery_update', message: data.status || 'Delivery updated', order_id: data.order_id, timestamp: new Date().toISOString() });
        window.dispatchEvent(new CustomEvent('ecom:delivery-updated', { detail: data }));
    });

    // Chat bridge — triggers existing openChat from Tool-core.js
    on('new_message', data => {
        NotificationEngine.push({ type: 'new_message', from: data.sender_name, message: data.preview || 'New message', timestamp: new Date().toISOString() });
    });

}

// ══════════════════════════════════════════════════════════════════════
// SECTION 14 — CHAT SELLER BRIDGE
// ══════════════════════════════════════════════════════════════════════

export const ChatBridge = {
    openWithSeller(product) {
        if (!product) return;
        const seller = product.seller || { id: product.seller_id, name: 'Seller' };

        // Use Tool-core.js openChat if available
        if (typeof openChat === 'function') {
            openChat(seller.id, {
                product_id:    product.id,
                product_title: product.title,
                product_price: product.price,
                product_image: product.images?.[0] || '',
                message:       `Hi! I'm interested in "${product.title}" (KES ${product.price.toLocaleString()}).`,
            });
            return;
        }

        // Fallback: postMessage to parent
        try {
            window.parent.postMessage({
                type:      'OPEN_CHAT',
                userId:    seller.id,
                userName:  seller.name,
                metadata:  {
                    product_id:    product.id,
                    product_title: product.title,
                    product_price: product.price,
                    product_image: product.images?.[0] || '',
                    message:       `Hi! I'm interested in "${product.title}" (KES ${product.price.toLocaleString()}).`,
                },
            }, '*');
        } catch(_) {}
    },
};

// ══════════════════════════════════════════════════════════════════════
// SECTION 15 — ADMIN ENGINE
// ══════════════════════════════════════════════════════════════════════

export const AdminEngine = {
    async getReports() { return (await _api('GET', '/api/admin/marketplace/reports'))?.data?.reports || []; },
    async removeProduct(productId, reason) {
        const resp = await _api('DELETE', `/api/admin/marketplace/products/${productId}`, { reason });
        if (resp?.success) _store.products.delete(productId);
        return resp;
    },
    async banSeller(sellerId, reason) { return _api('POST', `/api/admin/sellers/${sellerId}/ban`, { reason }); },
    async resolveDispute(orderId, resolution) { return _api('POST', `/api/admin/orders/${orderId}/resolve`, { resolution }); },
    async getStats() { return (await _api('GET', '/api/admin/marketplace/stats'))?.data || {}; },
};

// ══════════════════════════════════════════════════════════════════════
// SECTION 16 — SETTINGS INTEGRATION
// ══════════════════════════════════════════════════════════════════════

const _settings = {
    currency: 'KES',
    language: 'en',
    darkMode: false,
    notifications: true,
};

export const SettingsEngine = {
    apply(newSettings) {
        Object.assign(_settings, newSettings);
        // Dark mode
        document.documentElement.classList.toggle('dark-mode', !!_settings.darkMode);
        // Currency
        window._ecomCurrency = _settings.currency;
        // Emit
        window.dispatchEvent(new CustomEvent('ecom:settings-applied', { detail: _settings }));
    },

    get: (key) => _settings[key],
    getAll: () => ({ ..._settings }),

    formatPrice(amount, currency = _settings.currency) {
        try {
            return new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(amount);
        } catch(_) {
            return `${currency} ${parseFloat(amount).toFixed(2)}`;
        }
    },
};

// Listen to global settings changes from the parent app
window.addEventListener('message', (e) => {
    if (e.data?.type === 'SETTINGS_UPDATED' && e.data.settings) {
        SettingsEngine.apply(e.data.settings);
    }
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 17 — DATABASE API STUBS (Server-side reference)
// ══════════════════════════════════════════════════════════════════════
/**
 * These are the expected server-side API endpoints.
 * Your backend (Express/Node) should implement all of these.
 *
 * PRODUCTS:
 *   GET    /api/marketplace/products          - list products (with filters)
 *   GET    /api/marketplace/products/:id      - single product
 *   POST   /api/marketplace/products          - create product (seller auth)
 *   PUT    /api/marketplace/products/:id      - update product (owner auth)
 *   DELETE /api/marketplace/products/:id      - delete product (owner/admin auth)
 *   PATCH  /api/marketplace/products/:id/stock - update stock (seller auth)
 *   POST   /api/marketplace/products/upload-image - upload product image
 *   GET    /api/marketplace/products/:id/reviews - get reviews
 *   POST   /api/marketplace/products/:id/reviews - post review (buyer auth)
 *
 * CART (server-side cart for cross-device sync):
 *   GET    /api/marketplace/cart              - get user cart
 *   POST   /api/marketplace/cart/add          - add to cart
 *   DELETE /api/marketplace/cart/:productId   - remove from cart
 *   PUT    /api/marketplace/cart/:productId   - update quantity
 *   DELETE /api/marketplace/cart              - clear cart
 *
 * ORDERS:
 *   GET    /api/marketplace/orders            - list user orders
 *   POST   /api/marketplace/orders            - create order
 *   GET    /api/marketplace/orders/:id        - get order
 *   PUT    /api/marketplace/orders/:id/status - update order status (seller/admin)
 *   GET    /api/marketplace/orders/:id/tracking - get tracking info
 *   GET    /api/marketplace/orders/:id/eta    - get ETA
 *
 * PAYMENTS:
 *   POST   /api/payments/mpesa/stk-push       - initiate STK push
 *   POST   /api/payments/mpesa/callback       - M-Pesa callback (webhook)
 *   POST   /api/payments/mpesa/verify         - verify payment status
 *   POST   /api/payments/card                 - card payment
 *   POST   /api/payments/wallet               - wallet payment
 *   GET    /api/payments/wallet/:userId/balance - wallet balance
 *
 * WISHLIST:
 *   GET    /api/marketplace/wishlist          - get wishlist
 *   POST   /api/marketplace/wishlist          - add to wishlist
 *   DELETE /api/marketplace/wishlist/:id      - remove from wishlist
 *
 * SELLERS:
 *   GET    /api/marketplace/sellers/:id       - seller profile
 *   GET    /api/marketplace/sellers/:id/dashboard - seller dashboard
 *   GET    /api/marketplace/sellers/:id/earnings  - earnings report
 *   POST   /api/marketplace/reviews/:id/respond  - respond to review
 *
 * CATEGORIES:
 *   GET    /api/marketplace/categories        - all categories
 *
 * DELIVERY:
 *   GET    /api/marketplace/delivery/zones    - delivery zones & fees
 *   PUT    /api/marketplace/orders/:id/tracking - update tracking
 *
 * ADMIN:
 *   GET    /api/admin/marketplace/reports     - reported products/sellers
 *   DELETE /api/admin/marketplace/products/:id - remove product
 *   POST   /api/admin/sellers/:id/ban         - ban seller
 *   POST   /api/admin/orders/:id/resolve      - resolve dispute
 *   GET    /api/admin/marketplace/stats       - marketplace statistics
 *
 * SOCKET EVENTS (Socket.IO):
 *   Server → Client:
 *     product:updated       { product_id, product }
 *     product:stock_updated { product_id, quantity }
 *     order:created         { order_id, buyer_id }
 *     order:status_changed  { order_id, status }
 *     payment:confirmed     { order_id, method }
 *     review:new            { product_id, rating }
 *     delivery:updated      { order_id, status, location }
 *     new_message           { sender_id, sender_name, preview }
 *
 *   Client → Server:
 *     order:created         { order_id, buyer_id }
 *     order:status_changed  { order_id, status }
 *     payment:confirmed     { order_id, method }
 *     product:created       { product_id }
 *     product:updated       { product_id }
 *     product:deleted       { product_id }
 *     product:stock_updated { product_id, quantity }
 *     review:new            { product_id, rating }
 *     delivery:updated      { order_id, status }
 */

// ══════════════════════════════════════════════════════════════════════
// SECTION 18 — MAIN INITIALIZER
// ══════════════════════════════════════════════════════════════════════

export async function initEcommerceMarketplace() {
    await ProductEngine.init();
    _initRealtimeListeners();
    // Only sync wishlist if token is available (avoids 401 errors on startup)
    const _hasToken = () => !!(window._ecomApiCall ||
        window.__kynToken || window.__accessToken || window.__PARENT_SESSION__?.token ||
        localStorage.getItem('authToken') || localStorage.getItem('token'));
    if (_hasToken()) {
        WishlistEngine.syncFromServer().catch(() => {});
    } else {
        // Try again after token arrives via tools:active
        window.addEventListener('tools:active', () => WishlistEngine.syncFromServer().catch(()=>{}), { once: true });
    }

    // Load initial data
    await Promise.allSettled([
        ProductEngine.loadCategories(),
        ProductEngine.loadProducts({ limit: 40, sort: 'newest' }),
    ]);

    // Expose globally for Tool-ui.js and other modules
    window.EcomMarketplace = {
        ProductEngine,
        CartEngine,
        OrderEngine,
        PaymentEngine,
        WishlistEngine,
        ReviewEngine,
        SellerEngine,
        InventoryEngine,
        NotificationEngine,
        DeliveryEngine,
        ChatBridge,
        AdminEngine,
        SettingsEngine,
    };

    window.dispatchEvent(new CustomEvent('ecom:ready', { detail: { timestamp: Date.now() } }));
    return window.EcomMarketplace;
}

// Auto-init when DOM is ready and after Tool-core.js session is active
function _autoInit() {
    const tryInit = () => {
        if (window.EcomMarketplace) return;
        initEcommerceMarketplace().catch(() => {});
    };

    // PRIMARY: Tool-core.js patch fires this AFTER tools:active (token guaranteed)
    window.addEventListener('ecom:force-init', tryInit, { once: true });
    window.addEventListener('marketplaceCoreReady', tryInit, { once: true });

    // SECONDARY: grab token from PARENT_READY postMessage
    window.addEventListener('message', function _onSess(evt) {
        if (!evt.data || typeof evt.data !== 'object') return;
        if (evt.data.type === 'PARENT_READY' && !window.EcomMarketplace) {
            const p = evt.data.payload || {};
            const tok = p.token || p.session?.token;
            if (tok) { window.__kynToken = tok; window.__accessToken = tok; }
            window.removeEventListener('message', _onSess);
            setTimeout(tryInit, 100);
        }
    });

    // LAST RESORT: 8s — well after session arrives
    setTimeout(() => { if (!window.EcomMarketplace) tryInit(); }, 8000);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoInit);
} else {
    _autoInit();
}

export default {
    ProductEngine, CartEngine, OrderEngine, PaymentEngine,
    WishlistEngine, ReviewEngine, SellerEngine, InventoryEngine,
    NotificationEngine, DeliveryEngine, ChatBridge, AdminEngine,
    SettingsEngine, initEcommerceMarketplace,
};