/*
 * Canonical marketplace catalog client.
 * Keeps Product/Variant/Listing separate from the legacy Tool marketplace while
 * exposing a small API surface that existing marketplace UI can adopt without
 * duplicating URL construction or category/brand logic.
 */

const getCatalogBase = () => {
  const explicit = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
    (typeof window !== 'undefined' && window.__API_BASE_URL__) || '';
  return `${String(explicit).replace(/\/$/, '')}/api/marketplace-catalog`;
};

const request = async (path, options = {}) => {
  const token = typeof localStorage !== 'undefined'
    ? (localStorage.getItem('token') || localStorage.getItem('accessToken') || localStorage.getItem('authToken'))
    : null;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${getCatalogBase()}${path}`, { ...options, headers, credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.message || `Marketplace request failed (${response.status})`);
  return payload.data ?? payload;
};

export const marketplaceCatalog = {
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
