/* Group cache-first coordinator.
 * Keeps tab navigation instant while the existing GroupsCore/groupSync engine refreshes in background.
 * This is intentionally additive: it does not replace the existing group rendering or sync engine.
 */
(function () {
  'use strict';
  if (window.__GroupCacheFirst) return;

  const KEY = 'moodchat_groups_cache_v2';
  const TTL = 5 * 60 * 1000;
  const memory = Object.create(null);

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (_) { return {}; }
  }

  function write(cache) {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (_) {}
  }

  function get(section) {
    const cache = read();
    return cache[section] || memory[section] || null;
  }

  function set(section, value) {
    memory[section] = value;
    const cache = read();
    cache[section] = { value: value, updatedAt: Date.now() };
    write(cache);
  }

  function hydrate(section, render) {
    const cached = get(section);
    const value = cached && cached.value !== undefined ? cached.value : cached;
    if (Array.isArray(value) && value.length && typeof render === 'function') {
      render(value, { cached: true });
      return true;
    }
    return false;
  }

  async function refresh(section, fetcher, render) {
    if (typeof fetcher !== 'function') return null;
    try {
      const fresh = await fetcher();
      if (fresh == null) return fresh;
      set(section, fresh);
      if (typeof render === 'function') render(fresh, { cached: false, background: true });
      return fresh;
    } catch (error) {
      console.warn('[GroupCacheFirst] background refresh failed:', section, error);
      return null;
    }
  }

  window.__GroupCacheFirst = {
    get,
    set,
    hydrate,
    refresh,
    isFresh(section) {
      const item = read()[section];
      return !!(item && Date.now() - Number(item.updatedAt || 0) < TTL);
    }
  };
})();