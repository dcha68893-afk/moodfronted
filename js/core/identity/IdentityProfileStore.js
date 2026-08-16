/**
 * IdentityProfileStore.js
 * ────────────────────────────────────────────────────────────────────────
 * THE single source of truth, on the client, for what a user "looks like"
 * anywhere in the app: profile photo, cover photo, avatar fallback,
 * display name, username, bio, verification badge, online/last-seen.
 *
 * WHY THIS FILE EXISTS
 * Every module (friend-ui.js, messages-ui.js, status-ui.js, calls-ui.js,
 * group-os.js, marketplace-*.js, ...) previously resolved a user's photo
 * with its own ad-hoc fallback chain, each in a different order:
 *   friend-ui.js:   user.photoURL || user.avatar || user.profileImage || user.image
 *   messages-ui.js: contact.avatar || contact.photoURL || contact.avatarUrl
 *   status-ui.js:   user.photoURL || user.avatar || user.profilePicture
 *   calls-ui.js:    participant.avatar || participant.photo || participant.userAvatar
 * Because the fallback ORDER differed, the exact same backend response could
 * render a different photo (or none) depending on which screen you were on.
 * This is why "the owner immediately sees the change" could be true in one
 * module and false in another.
 *
 * WHAT THIS FILE DOES
 *  1. Exposes ONE resolver — window.Identity.resolveAvatar(userLike) — that
 *     every module should call instead of writing its own fallback chain.
 *     It checks fields in one fixed, documented priority order and is the
 *     ONLY place that priority order is allowed to live.
 *  2. Keeps an in-memory + localStorage-persisted cache of identities,
 *     keyed by userId, updated in real time from the server's
 *     profile:update / avatar:update / cover:update / username:update /
 *     bio:update / privacy:update socket events (relayed through
 *     app.realtime.socket.js -> chat.html -> every module iframe, the same
 *     transport this app already uses for settings_updated).
 *  3. Fires a single DOM CustomEvent, 'identity:changed', with the fresh
 *     identity in `detail`, so any module can subscribe and re-render
 *     without needing a page refresh, logout, or reload.
 *  4. Auto-repaints any element already on screen that opted in via
 *     `data-identity-uid="<userId>"` (see applyToDom below), so even
 *     modules that don't add a listener still update live for the parts
 *     of the DOM that used the convention.
 *
 * This file is intentionally dependency-free and safe to include on every
 * page (parent shell and every module iframe) — it does not assume it is
 * running in any particular frame.
 */
(function () {
  'use strict';

  if (window.Identity) {
    return; // already initialized in this frame
  }

  const STORAGE_KEY = 'kyn_identity_cache_v1';
  const CURRENT_USER_KEY = 'kyn_identity_current_user_v1';
  const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?background=random&color=fff&name=';

  // Fixed, single priority order for resolving a photo from ANY shape of
  // user-like object this app produces or has ever produced. New fields
  // must be added here, never re-invented in a module.
  const AVATAR_KEYS = ['avatar', 'photoURL', 'avatarUrl', 'profileImage', 'profilePhoto', 'picture', 'userAvatar', 'photo'];
  const COVER_KEYS = ['coverPhoto', 'coverImage', 'coverUrl', 'bannerUrl'];
  const NAME_KEYS = ['displayName', 'friendName', 'name', 'fullName', 'username'];

  /** @type {Map<string, object>} */
  const cache = new Map();

  function _loadCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      Object.keys(obj || {}).forEach((k) => cache.set(k, obj[k]));
    } catch (_) {}
  }

  function _persistCache() {
    try {
      // Keep the persisted cache small — only most-recent 300 identities.
      const obj = {};
      let i = 0;
      for (const [k, v] of cache) {
        if (i++ > 300) break;
        obj[k] = v;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (_) {}
  }

  function _firstTruthy(obj, keys) {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    }
    return null;
  }

  function initials(name) {
    const n = (name || '').trim();
    if (!n) return '?';
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  /**
   * Resolve the best available photo for a user-like object, merging in
   * anything we have live-cached for that user's id (so a stale object
   * passed in by a module still benefits from the latest known avatar).
   */
  function resolveAvatar(userLike) {
    if (!userLike) return null;
    const id = userLike.id || userLike.userId || userLike.uid;
    const cached = id != null ? cache.get(String(id)) : null;
    return (cached && cached.avatar) || _firstTruthy(userLike, AVATAR_KEYS) || null;
  }

  function resolveCover(userLike) {
    if (!userLike) return null;
    const id = userLike.id || userLike.userId || userLike.uid;
    const cached = id != null ? cache.get(String(id)) : null;
    return (cached && cached.coverPhoto) || _firstTruthy(userLike, COVER_KEYS) || null;
  }

  function resolveDisplayName(userLike) {
    if (!userLike) return '';
    const id = userLike.id || userLike.userId || userLike.uid;
    const cached = id != null ? cache.get(String(id)) : null;
    return (cached && cached.displayName) || _firstTruthy(userLike, NAME_KEYS) || 'User';
  }

  function resolveVerified(userLike) {
    if (!userLike) return false;
    const id = userLike.id || userLike.userId || userLike.uid;
    const cached = id != null ? cache.get(String(id)) : null;
    if (cached && typeof cached.isVerified === 'boolean') return cached.isVerified;
    return !!(userLike.isVerified || userLike.verified);
  }

  /**
   * Build ready-to-insert avatar markup: photo if available, else the same
   * initials-circle style used app-wide, so no module ever needs to write
   * its own "photo vs initials" branch again.
   */
  function avatarHTML(userLike, opts) {
    opts = opts || {};
    const size = opts.size || 40;
    const cls = opts.className || 'identity-avatar';
    const url = resolveAvatar(userLike);
    const name = resolveDisplayName(userLike);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const id = userLike && (userLike.id || userLike.userId || userLike.uid);
    const uidAttr = id != null ? ` data-identity-uid="${esc(id)}"` : '';
    if (url) {
      return `<div class="${cls}"${uidAttr} style="width:${size}px;height:${size}px;border-radius:50%;background-image:url('${esc(url)}');background-size:cover;background-position:center;"></div>`;
    }
    return `<div class="${cls}"${uidAttr} style="width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--primary-color);color:#fff;font-weight:600;">${esc(initials(name))}</div>`;
  }

  function get(userId) {
    if (userId == null) return null;
    return cache.get(String(userId)) || null;
  }

  /**
   * Merge a fresh identity into the cache, persist, repaint any DOM already
   * opted in via data-identity-uid, and notify every listener.
   */
  function _merge(userId, patch) {
    if (userId == null) return;
    const key = String(userId);
    const existing = cache.get(key) || {};
    const merged = Object.assign({}, existing, patch, { id: key });
    cache.set(key, merged);
    _persistCache();
    _applyToDom(key, merged);
    try {
      window.dispatchEvent(new CustomEvent('identity:changed', { detail: { userId: key, identity: merged } }));
    } catch (_) {}
    return merged;
  }

  function _applyToDom(userId, identity) {
    try {
      const nodes = document.querySelectorAll('[data-identity-uid="' + CSS.escape(String(userId)) + '"]');
      nodes.forEach((node) => {
        if (identity.avatar) {
          if (node.tagName === 'IMG') node.src = identity.avatar;
          else node.style.backgroundImage = `url('${identity.avatar}')`;
        }
      });
      const nameNodes = document.querySelectorAll('[data-identity-name-uid="' + CSS.escape(String(userId)) + '"]');
      nameNodes.forEach((node) => { if (identity.displayName) node.textContent = identity.displayName; });
    } catch (_) {}
  }

  /**
   * Called by Settings (the master controller) the moment the user saves
   * an Edit Profile change, BEFORE the server round-trip resolves, so the
   * owner sees their own change instantly with zero perceived latency.
   * The server's profile:update event that follows just confirms/repeats it.
   */
  function setCurrentUser(patch) {
    let userId = patch && (patch.id || patch.userId);
    if (userId == null) {
      try { userId = JSON.parse(localStorage.getItem('currentUser') || '{}').id; } catch (_) {}
    }
    if (userId == null) return null;
    const merged = _merge(userId, patch);
    try { localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(merged)); } catch (_) {}
    return merged;
  }

  /**
   * Entry point for realtime updates arriving via socket relay / postMessage.
   * Accepts the { userId, identity, changedFields } shape emitted by
   * identityBroadcastService on the backend.
   */
  function applyUpdate(payload) {
    if (!payload) return;
    const userId = payload.userId || (payload.identity && payload.identity.id);
    const identity = payload.identity || payload;
    if (userId == null) return;
    return _merge(userId, identity);
  }

  // ── Wire up transport: postMessage relay (cross-iframe) ──────────────────
  const IDENTITY_EVENT_NAMES = [
    'profile:update', 'avatar:update', 'cover:update',
    'username:update', 'bio:update', 'displayName:update', 'privacy:update',
  ];

  window.addEventListener('message', (evt) => {
    const data = evt.data;
    if (!data || typeof data !== 'object') return;
    // Matches the same envelope app.realtime.socket.js already uses for
    // settings_updated: { type: 'SOCKET_EVENT', event, payload }
    if (data.type === 'SOCKET_EVENT' && IDENTITY_EVENT_NAMES.includes(data.event)) {
      applyUpdate(data.payload);
      return;
    }
    // Matches chat.html's dispatchEventToModules() fan-out envelope:
    // { type: 'IDENTITY_UPDATED', payload, event, source: 'parent', ... }
    if (data.type === 'IDENTITY_UPDATED') {
      applyUpdate(data.payload);
      return;
    }
    // Direct relay form some frames use: { type: 'profile:update', payload }
    if (IDENTITY_EVENT_NAMES.includes(data.type)) {
      applyUpdate(data.payload || data);
    }
  });

  // ── Wire up transport: same-frame CustomEvents (kyn:<event>) ─────────────
  IDENTITY_EVENT_NAMES.forEach((evtName) => {
    window.addEventListener('kyn:' + evtName, (e) => applyUpdate(e.detail));
  });

  // ── Wire up transport: KynectaEventBus, if present in this frame ─────────
  if (window.KynectaEventBus && typeof window.KynectaEventBus.on === 'function') {
    IDENTITY_EVENT_NAMES.forEach((evtName) => {
      window.KynectaEventBus.on('REALTIME_' + evtName, (payload) => applyUpdate(payload));
    });
  }

  _loadCache();

  // Called on 'kyn:accountSwitchWipe' (see authStorage.js), fired right
  // before that module wipes localStorage/IndexedDB for a login from a
  // different account on this device. authStorage's wipe clears the
  // STORAGE_KEY/CURRENT_USER_KEY entries this module persisted under, but
  // does nothing about the `cache` Map already loaded into memory in this
  // frame — without this reset, the previous account's identities (names,
  // avatars, cover photos) kept resolving from memory for the rest of the
  // page session, and the next _persistCache() call would have written
  // them straight back into the freshly-wiped localStorage.
  function resetForAccountSwitch() {
    cache.clear();
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('kyn:accountSwitchWipe', resetForAccountSwitch);
  }

  window.Identity = {
    resolveAvatar,
    resolveCover,
    resolveDisplayName,
    resolveVerified,
    avatarHTML,
    initials,
    get,
    setCurrentUser,
    applyUpdate,
    resetForAccountSwitch,
    DEFAULT_AVATAR,
  };

  console.log('[Identity] Centralized identity store ready in this frame.');
})();
