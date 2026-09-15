/*
 * Canonical marketplace bridge.
 * Keeps the existing Tool UI/state shape while routing marketplace data through
 * Product -> Variant -> Seller Listing without changing unrelated Tool features.
 */
import { marketplace } from './Tool-core.part3.js';
import { marketplaceCatalog } from './marketplace-catalog-api.js';

const original = {
  loadListings: marketplace.loadListings.bind(marketplace),
};

const state = { categories: [], brands: [], loaded: false };
const unwrap = payload => payload?.data ?? payload ?? {};

function flattenCategories(rows) {
  const byParent = new Map();
  (Array.isArray(rows) ? rows : []).forEach(c => {
    const key = c.parentId || c.parent_id || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(c);
  });
  const result = [];
  const walk = (parentId, prefix = '') => {
    (byParent.get(parentId) || []).forEach(c => {
      const displayPath = prefix ? `${prefix} > ${c.name}` : c.name;
      result.push({ ...c, displayPath });
      walk(c.id, displayPath);
    });
  };
  walk(null);
  return result;
}

async function loadTaxonomy() {
  if (state.loaded) return state;
  try {
    const [categoryResult, brandResult] = await Promise.all([
      marketplaceCatalog.getCategories(),
      marketplaceCatalog.getBrands(),
    ]);
    state.categories = flattenCategories(unwrap(categoryResult).categories || []);
    state.brands = unwrap(brandResult).brands || [];
    state.loaded = true;
    window.marketplaceCatalogState = state;
    window.dispatchEvent(new CustomEvent('marketplace:taxonomyLoaded', { detail: state }));
  } catch (error) {
    console.warn('[MarketplaceCatalog] taxonomy load failed:', error?.message || error);
  }
  return state;
}

function productType(value) {
  const type = String(value || '').toLowerCase();
  return type === 'digital' ? 'digital' : type === 'service' ? 'service' : 'physical';
}

function findCategory(value, type) {
  if (!value) return null;
  const wanted = String(value).trim().toLowerCase();
  return state.categories.find(c => c.kind === type && (
    String(c.id).toLowerCase() === wanted ||
    String(c.name).toLowerCase() === wanted ||
    String(c.slug || '').toLowerCase() === wanted ||
    String(c.displayPath || '').toLowerCase() === wanted
  )) || null;
}

function mapListing(row) {
  const product = row?.product || {};
  const category = product.category || {};
  const brand = product.brand || {};
  const type = product.productType || 'physical';
  return {
    ...row,
    id: row.id,
    sellerId: row.sellerId,
    userId: row.sellerId,
    title: row.titleOverride || product.name || 'Untitled listing',
    description: product.description || '',
    price: Number(row.price || 0),
    currency: row.currency || 'KES',
    stock: row.stock,
    available: row.status === 'active' && (row.stock == null || Number(row.stock) > 0),
    category: category.name || '',
    categoryId: category.id || product.categoryId,
    categoryPath: category.path || category.name || '',
    brand: brand.name || '',
    brandId: brand.id || product.brandId,
    type,
    productType: type,
    condition: row.condition,
    images: Array.isArray(row.images) && row.images.length ? row.images : (product.defaultImageUrl ? [product.defaultImageUrl] : []),
    variantId: row.variantId || null,
    productId: row.productId,
    fulfillmentType: row.fulfillmentType,
    serviceArea: row.serviceArea || {},
    digitalAccess: row.digitalAccess || {},
    attributes: { ...(product.attributes || {}), ...(row.attributes || {}) },
    metadata: row.metadata || {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function listingParams(page, limit) {
  const filters = marketplace.getFilters ? marketplace.getFilters() : {};
  const params = { page, limit };
  if (filters.minPrice != null) params.min_price = filters.minPrice;
  if (filters.maxPrice != null) params.max_price = filters.maxPrice;
  if (filters.search) params.q = filters.search;
  return params;
}

marketplace.loadListings = async function canonicalLoadListings() {
  this.loading = true;
  this.notifyUI('loading', true);
  try {
    await loadTaxonomy();
    const result = unwrap(await marketplaceCatalog.getListings(listingParams(this.pagination.page, this.pagination.limit)));
    const rows = Array.isArray(result.listings) ? result.listings : [];
    this.listings = rows.map(mapListing);
    this.pagination.total = Number(result.total || this.listings.length);
    this.pagination.hasMore = this.listings.length >= this.pagination.limit;
    window.allListings = this.listings;

    try {
      const mine = unwrap(await marketplaceCatalog.getMyListings());
      this.myListings = (mine.listings || []).map(mapListing);
      window.myListings = this.myListings;
    } catch (mineError) {
      console.warn('[MarketplaceCatalog] seller workspace unavailable:', mineError?.message || mineError);
      this.loadMyListings?.();
    }

    this.notifyUI('data-updated', { listings: this.listings, total: this.pagination.total, source: 'canonical-catalog' });
  } catch (error) {
    console.warn('[MarketplaceCatalog] canonical read failed; using legacy compatibility path:', error?.message || error);
    return original.loadListings();
  } finally {
    this.loading = false;
    this.notifyUI('loading', false);
    this.notifyUI('listingsLoaded', this.getFilteredListings());
  }
};

marketplace.createListing = async function canonicalCreateListing(listingData = {}) {
  if (!this.isAuthenticated()) throw new Error('User not authenticated');
  if (!listingData.title || !listingData.description) throw new Error('Title and description are required');

  await loadTaxonomy();
  const type = productType(listingData.type);
  const category = findCategory(listingData.categoryId || listingData.category, type);
  if (!category) throw new Error(`Select a valid ${type} marketplace category`);

  const resolved = unwrap(await marketplaceCatalog.resolveProduct({
    name: listingData.title.trim(), category_id: category.id, type,
  }));
  const images = Array.isArray(listingData.images) ? listingData.images.filter(Boolean) : [];
  const product = resolved.product || unwrap(await marketplaceCatalog.createProduct({
    name: listingData.title.trim(),
    category_id: category.id,
    brand_id: listingData.brandId || null,
    product_type: type,
    model: listingData.model || null,
    manufacturer_part_number: listingData.manufacturerPartNumber || null,
    description: listingData.description,
    default_image_url: images[0] || null,
    attributes: listingData.attributes || {},
    metadata: { source: 'Tool-ui', canonicalBridge: true },
  })).product;

  if (!product?.id) throw new Error('Canonical product could not be created or resolved');

  let variantId = listingData.variantId || null;
  if (!variantId && listingData.sku) {
    const variant = unwrap(await marketplaceCatalog.createVariant(product.id, {
      sku: listingData.sku,
      name: listingData.variantName || listingData.title,
      option_values: listingData.variantOptions || {},
      image_urls: images,
      price: listingData.price,
      stock: listingData.stock,
      weight_grams: listingData.weightGrams,
      metadata: { source: 'Tool-ui' },
    })).variant;
    variantId = variant?.id || null;
  }

  const fulfillment = type === 'digital' ? 'instant_download' : type === 'service' ? (listingData.fulfillmentType || 'appointment') : (listingData.fulfillmentType || 'delivery');
  const listing = unwrap(await marketplaceCatalog.createListing({
    product_id: product.id,
    variant_id: variantId,
    title_override: listingData.title,
    price: Number(listingData.price || 0),
    currency: listingData.currency || 'KES',
    stock: listingData.stock == null ? null : Number(listingData.stock),
    condition: type === 'physical' ? (listingData.condition || 'new') : null,
    fulfillment_type: fulfillment,
    service_area: listingData.serviceArea || {},
    digital_access: listingData.digitalAccess || {},
    images,
    attributes: listingData.attributes || {},
    metadata: { source: 'Tool-ui', canonicalBridge: true },
  })).listing;

  const committed = mapListing({ ...listing, product });
  this.listings = [committed, ...this.listings.filter(x => x.id !== committed.id)];
  this.myListings = [committed, ...this.myListings.filter(x => x.id !== committed.id)];
  window.allListings = this.listings;
  window.myListings = this.myListings;
  this.notifyUI('listingCreated', committed);
  this.notifyUI('listingCommitted', committed);
  return committed;
};

marketplace.updateListing = async function canonicalUpdateListing(id, updates = {}) {
  const result = unwrap(await marketplaceCatalog.updateListing(id, {
    titleOverride: updates.title,
    price: updates.price,
    currency: updates.currency,
    stock: updates.stock,
    condition: updates.condition,
    fulfillmentType: updates.fulfillmentType,
    serviceArea: updates.serviceArea,
    digitalAccess: updates.digitalAccess,
    images: updates.images,
    attributes: updates.attributes,
    metadata: updates.metadata,
  }));
  const updated = mapListing({ ...result.listing, product: result.listing?.product || {} });
  this.listings = this.listings.map(x => x.id === id ? { ...x, ...updated } : x);
  this.myListings = this.myListings.map(x => x.id === id ? { ...x, ...updated } : x);
  this.notifyUI('listingUpdated', updated);
  return updated;
};

marketplace.deleteListing = async function canonicalDeleteListing(id) {
  await marketplaceCatalog.deleteListing(id);
  this.listings = this.listings.filter(x => x.id !== id);
  this.myListings = this.myListings.filter(x => x.id !== id);
  this.savedListings = this.savedListings.filter(x => x.id !== id);
  this.notifyUI('listingDeleted', { id });
  return true;
};

loadTaxonomy();
window.marketplaceCatalogBridge = { state, loadTaxonomy, mapListing };
