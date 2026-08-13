/*
 * Mood Marketplace — Commercial Hardening Layer v1
 * Non-invasive adapter for marketplace-ecommerce.js.
 *
 * Goals:
 *  - server-authoritative cart/order state
 *  - cross-tab synchronization
 *  - idempotent checkout requests
 *  - price/stock revalidation before payment
 *  - retry with exponential backoff for transient requests
 *  - circuit breaker to avoid request storms
 *  - safe money arithmetic in cents
 *  - consistent order state machine
 *  - observability events without leaking payment data
 *
 * Load AFTER marketplace-ecommerce.js and before checkout UI handlers.
 */
(function (window) {
  'use strict';
  if (window.MoodMarketplaceCommercial) return;

  const VERSION = '1.0.0';
  const CHANNEL = 'mood-marketplace-commercial-v1';
  const STORAGE = 'mood.marketplace.commercial.v1';
  const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
  const ORDER_STATES = [
    'CREATED', 'PAYMENT_PENDING', 'PAID', 'PROCESSING', 'SHIPPED',
    'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'EXPIRED',
    'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'
  ];
  const TERMINAL = new Set(['DELIVERED', 'CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']);
  const ALLOWED = {
    CREATED: ['PAYMENT_PENDING', 'CANCELLED', 'EXPIRED'],
    PAYMENT_PENDING: ['PAID', 'FAILED', 'EXPIRED', 'CANCELLED'],
    PAID: ['PROCESSING', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'],
    PROCESSING: ['SHIPPED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'],
    SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED', 'DISPUTED'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'DISPUTED'],
    DELIVERED: ['REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'],
    CANCELLED: [], EXPIRED: [], FAILED: [],
    REFUNDED: [], PARTIALLY_REFUNDED: ['REFUNDED', 'DISPUTED'], DISPUTED: ['REFUNDED', 'PARTIALLY_REFUNDED']
  };

  const state = {
    online: navigator.onLine !== false,
    breaker: { failures: 0, openedAt: 0 },
    lastSync: 0,
    revision: 0,
    pending: new Map(),
    seenOperations: new Set(),
  };

  const emit = (name, detail) => {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  };

  const safeJson = (value) => {
    try { return JSON.stringify(value); } catch (_) { return null; }
  };

  function cents(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error('Invalid monetary value');
    return Math.round(n * 100);
  }

  function money(centsValue) {
    return Math.round(Number(centsValue) || 0) / 100;
  }

  function totalCents(items) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
      return sum + cents(item.unit_price ?? item.price ?? 0) * qty;
    }, 0);
  }

  function operationId(prefix) {
    const random = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() :
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix || 'op'}_${random}`;
  }

  function authToken() {
    return window.__kynToken || window.__accessToken ||
      window.__PARENT_SESSION__?.token ||
      localStorage.getItem('authToken') || localStorage.getItem('accessToken') ||
      localStorage.getItem('token') || '';
  }

  function apiBase() {
    const configured = window.__kynAPI?.baseUrl || window.API_BASE_URL || '';
    return String(configured).replace(/\/$/, '');
  }

  async function request(method, path, body, options = {}) {
    const key = `${method}:${path}`;
    const now = Date.now();
    if (state.breaker.openedAt && now - state.breaker.openedAt < 15000) {
      throw Object.assign(new Error('Marketplace temporarily protecting the connection'), { code: 'CIRCUIT_OPEN' });
    }

    const retries = options.retries ?? 2;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const token = authToken();
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (token) headers.Authorization = `Bearer ${token}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeout || 15000);
        let response;
        try {
          response = await fetch(apiBase() + path, {
            method: method.toUpperCase(), headers,
            credentials: 'include', signal: controller.signal,
            ...(body == null ? {} : { body: safeJson(body) })
          });
        } finally { clearTimeout(timeout); }

        const text = await response.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
        if (!response.ok) {
          const error = Object.assign(new Error(data?.message || data?.error || `HTTP ${response.status}`), {
            status: response.status, data
          });
          if (!RETRYABLE.has(response.status) || attempt === retries) throw error;
          lastError = error;
        } else {
          state.breaker.failures = 0;
          return data;
        }
      } catch (error) {
        lastError = error;
        const retryable = error?.name === 'AbortError' || !error?.status || RETRYABLE.has(error.status);
        if (!retryable || attempt === retries) break;
      }
      await new Promise(r => setTimeout(r, Math.min(4000, 250 * (2 ** attempt)) + Math.random() * 150));
    }
    state.breaker.failures += 1;
    if (state.breaker.failures >= 3) state.breaker.openedAt = Date.now();
    throw lastError || new Error('Marketplace request failed');
  }

  function assertTransition(from, to) {
    if (!ORDER_STATES.includes(from) || !ORDER_STATES.includes(to)) throw new Error('Unknown order state');
    if (from === to) return true;
    if (TERMINAL.has(from) && to !== 'DISPUTED') throw new Error(`Invalid terminal transition: ${from} → ${to}`);
    if (!ALLOWED[from].includes(to)) throw new Error(`Invalid order transition: ${from} → ${to}`);
    return true;
  }

  function validateCheckout(input) {
    const items = Array.isArray(input?.items) ? input.items : [];
    if (!items.length) throw new Error('Cart is empty');
    for (const item of items) {
      if (!item.product_id && !item.id) throw new Error('Checkout item is missing product id');
      if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) throw new Error('Invalid item quantity');
      if (!Number.isFinite(Number(item.unit_price ?? item.price)) || Number(item.unit_price ?? item.price) < 0) throw new Error('Invalid item price');
    }
    if (!input.shipping_address || typeof input.shipping_address !== 'object') throw new Error('Delivery address is required');
    if (!input.payment_method) throw new Error('Payment method is required');
    return { ...input, client_total_cents: totalCents(items) };
  }

  async function revalidateCart(items) {
    const ids = items.map(i => i.product_id || i.id);
    // Backend should return authoritative price/stock. Never trust a cached price at payment time.
    const result = await request('POST', '/api/marketplace/cart/revalidate', { items: ids.map(id => String(id)) }, { retries: 1 });
    const authoritative = result?.data?.items || result?.items || [];
    const byId = new Map(authoritative.map(p => [String(p.id || p.product_id), p]));
    const checked = items.map(item => {
      const id = String(item.product_id || item.id);
      const p = byId.get(id);
      if (!p) throw new Error(`Product ${id} is no longer available`);
      const stock = Number(p.stock_quantity ?? p.stock ?? 0);
      if (stock < Number(item.quantity)) throw new Error(`${p.title || 'Product'} has insufficient stock`);
      return { ...item, product_id: id, unit_price: Number(p.price), available_stock: stock };
    });
    return { items: checked, total_cents: totalCents(checked) };
  }

  async function createOrder(input) {
    const validated = validateCheckout(input);
    const operation_id = input.operation_id || operationId('order');
    if (state.seenOperations.has(operation_id)) throw new Error('Duplicate checkout operation');
    state.seenOperations.add(operation_id);

    const checked = await revalidateCart(validated.items);
    const payload = {
      operation_id,
      items: checked.items,
      total: money(checked.total_cents),
      total_cents: checked.total_cents,
      shipping_address: validated.shipping_address,
      payment_method: validated.payment_method,
      coupon_code: validated.coupon_code || null,
      client_version: VERSION,
    };

    const response = await request('POST', '/api/marketplace/orders', payload, {
      headers: { 'Idempotency-Key': operation_id }, retries: 1
    });
    const order = response?.data?.order || response?.order || response?.data || response;
    if (order?.status) assertTransition('CREATED', String(order.status).toUpperCase());
    emit('marketplace:order-created', { orderId: order?.id || null, operation_id });
    return order;
  }

  async function syncCart() {
    const local = window.CartEngine?.getCart ? window.CartEngine.getCart() : [];
    if (!state.online) return { offline: true, items: local };
    try {
      const response = await request('POST', '/api/marketplace/cart/sync', {
        items: local.map(item => ({
          product_id: item.product?.id || item.product_id || item.id,
          quantity: Number(item.quantity) || 1,
          client_updated_at: item.updatedAt || item.addedAt || new Date().toISOString()
        })),
        revision: state.revision
      }, { retries: 2 });
      state.lastSync = Date.now();
      state.revision = Number(response?.data?.revision ?? response?.revision ?? state.revision);
      emit('marketplace:cart-synced', { revision: state.revision });
      return response;
    } catch (error) {
      emit('marketplace:sync-error', { area: 'cart', code: error.code || error.status || 'NETWORK' });
      throw error;
    }
  }

  const channel = ('BroadcastChannel' in window) ? new BroadcastChannel(CHANNEL) : null;
  if (channel) {
    channel.onmessage = (event) => {
      if (!event.data || event.data.source === operationId('tab')) return;
      if (event.data.type === 'cart-changed') emit('marketplace:external-cart-change', event.data);
      if (event.data.type === 'order-changed') emit('marketplace:external-order-change', event.data);
    };
  }

  window.addEventListener('online', () => { state.online = true; emit('marketplace:online', {}); syncCart().catch(() => {}); });
  window.addEventListener('offline', () => { state.online = false; emit('marketplace:offline', {}); });

  const API = {
    VERSION,
    money,
    cents,
    totalCents,
    operationId,
    request,
    validateCheckout,
    revalidateCart,
    createOrder,
    syncCart,
    transitionOrder: (from, to) => assertTransition(from, to),
    getHealth: () => ({ online: state.online, lastSync: state.lastSync, breakerOpen: !!state.breaker.openedAt, revision: state.revision })
  };

  window.MoodMarketplaceCommercial = API;
  emit('marketplace:commercial-ready', { version: VERSION });
})(window);
