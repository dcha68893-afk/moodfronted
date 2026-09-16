/*
 * Canonical marketplace catalog client.
 * Product, Variant and Seller Listing remain separate resources while all
 * transport configuration comes from the same runtime gateway as messaging,
 * groups, calls and auth. No module-specific backend URL is allowed here.
 */
(function () {
  'use strict';

  function getCatalogBase() {
    const origin = typeof window !== 'undefined' && typeof window.__getApiOrigin === 'function'
      ? window.__getApiOrigin()
      : (typeof window !== 'undefined' ? window.BACKEND_URL || '' : '');
    if (!origin) throw new Error('Backend runtime configuration is missing.');
    return `${String(origin).replace(/\/+$/, '')}/api/marketplace-catalog`;
  }

  async function request(path, options = {}) {
    const token = typeof window !== 'undefined'
      ? (window.__kynToken || window.__accessToken || window.AuthSessionManager?.getToken?.() ||
         localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token'))
      : null;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${getCatalogBase()}${path}`, { ...options, headers, credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || `Marketplace request failed (${response.status})`);
    }
    return payload.data ?? payload;
  }

  const marketplaceCatalog = {
    getCategories: () => request('/categories'),
    getBrands: (limit = 200) => request(`/brands?limit=${encodeURIComponent(limit)}`),
    getProducts: (params = {}) => request(`/products?${new URLSearchParams(params).toString()}`),
    getProduct: id => request(`/products/${encodeURIComponent(id)}`),
    getListings: (params = {}) => request(`/listings?${new URLSearchParams(params).toString()}`),
    createProduct: body => request('/products', { method: 'POST', body: JSON.stringify(body) }),
    createVariant: (productId, body) => request(`/products/${encodeURIComponent(productId)}/variants`, { method: 'POST', body: JSON.stringify(body) }),
    createListing: body => request('/listings', { method: 'POST', body: JSON.stringify(body) }),
    updateListing: (id, body) => request(`/listings/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteListing: id => request(`/listings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };

  if (typeof window !== 'undefined') window.marketplaceCatalog = marketplaceCatalog;
  if (typeof globalThis !== 'undefined') globalThis.marketplaceCatalog = marketplaceCatalog;
})();
