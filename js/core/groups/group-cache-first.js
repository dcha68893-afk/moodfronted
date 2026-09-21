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

  // ACCOUNT ISOLATION: this key is plain, unscoped localStorage, so it is only as
  // isolated as the account-switch wipe — and anything a still-running window of the
  // previous account writes after that wipe survives into the next account's session
  // (a stranger's group list painted "instantly" from cache). The cache is therefore
  // stamped with the account that wrote it and is simply ignored for anyone else.
  // An unstamped (pre-fix) cache is treated as foreign: one refetch, no leak.
  function me() {
    try {
      const raw = localStorage.getItem('kynecta_auth');
      const a = raw ? JSON.parse(raw) : null;
      const u = a && a.user;
      const id = u && (u.id != null ? u.id : (u.userId != null ? u.userId : (u.uid != null ? u.uid : u._id)));
      return id == null ? '' : String(id);
    } catch (_) { return ''; }
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) || {};
      const owner = me();
      if (!owner || parsed.__owner !== owner) return {};
      return parsed;
    } catch (_) { return {}; }
  }

  function write(cache) {
    try {
      const owner = me();
      if (!owner) return;
      cache.__owner = owner;
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch (_) {}
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