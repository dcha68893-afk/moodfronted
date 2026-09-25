/*
 * avatar-fix.js  (NEW FILE)  --  one place that decides how ANY user's photo is displayed.
 *
 * Problems this fixes
 *  1. Photos of Google users and of manually-registered users are stored in different shapes
 *     (Google = absolute https://lh3.googleusercontent.com/..., manual = Cloudinary URL, or a
 *     relative "/uploads/x.jpg" path, or the default ui-avatars "name=User" placeholder).
 *     Every screen used to read them differently, so one kind of user could not see the other.
 *  2. Google's image servers reject requests that carry our site as the Referer (and in the
 *     Android app the referer is https://localhost). The <img> needs referrerpolicy="no-referrer"
 *     BEFORE the request starts.
 *  3. When a photo was missing the app showed the Necpa logo, so it looked like "the app image
 *     instead of the real user image". A missing photo now shows a coloured initials avatar.
 *
 * Public API:  window.NecpaAvatar.resolve(userOrUrl)   -> absolute URL or ''
 *              window.NecpaAvatar.src(user)            -> URL, or initials data-URI when no photo
 *              window.NecpaAvatar.html(user, opts)     -> ready-to-use <img ...> string
 *              window.NecpaAvatar.initials(name)       -> initials data-URI
 */
(function () {
  'use strict';
  if (window.NecpaAvatar) return;

  var PLACEHOLDER_RE = /ui-avatars\.com\/api\/\?name=(?:User|user)(?:&|$)/i;
  var NO_REFERRER_HOST_RE = /googleusercontent\.com|googleapis\.com|ggpht\.com|ui-avatars\.com|gravatar\.com|cloudinary\.com/i;
  var BACKEND_PATH_RE = /^\/(?:uploads|api\/(?:files|media)|media|files)\//i;

  var UI_AVATARS_RE = /^https?:\/\/(?:www\.)?ui-avatars\.com\/api\/?\?/i;
  function isGenerated(u) { return UI_AVATARS_RE.test(String(u || '')); }
  function generatedName(u) {
    try { return decodeURIComponent((String(u).match(/[?&]name=([^&]*)/i) || [])[1] || '').replace(/\+/g, ' '); } catch (_) { return ''; }
  }

  function origin() {
    try {
      var o = (window.__getApiOrigin && window.__getApiOrigin()) || window.BACKEND_URL || '';
      return String(o || '').replace(/\/+$/, '');
    } catch (_) { return ''; }
  }

  function pick(u) {
    if (u && typeof u === 'object') {
      return u.avatar || u.avatarUrl || u.photoURL || u.photoUrl || u.picture ||
             u.profilePicture || u.profilePic || u.profileImage || u.image || '';
    }
    return u;
  }

  function resolve(input) {
    var u = pick(input);
    if (u == null) return '';
    u = String(u).trim();
    if (!u || u === 'null' || u === 'undefined') return '';
    if (/^\/\//.test(u)) u = 'https:' + u;
    // Mixed-content: an http:// image is blocked on our https page and inside the Android app.
    if (/^http:\/\//i.test(u) && NO_REFERRER_HOST_RE.test(u)) u = u.replace(/^http:/i, 'https:');
    if (/^(?:https?:|data:|blob:)/i.test(u)) return u;
    var path = u.charAt(0) === '/' ? u : '/' + u;
    if (BACKEND_PATH_RE.test(path)) {
      var o = origin();
      return o ? o + path : path;
    }
    return u; // e.g. /icons/... stays on the frontend
  }

  function nameOf(user) {
    if (!user || typeof user !== 'object') return typeof user === 'string' ? '' : '';
    var full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return String(user.displayName || full || user.name || user.username || user.email || '').trim();
  }

  function initials(name) {
    name = String(name || '').trim();
    var parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
    var text = ((parts[0] || '?').charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    var colors = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669', '#0891b2', '#4f46e5', '#b45309'];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="' +
      colors[hash % colors.length] + '"/><text x="50" y="50" dy=".35em" text-anchor="middle" fill="#fff" ' +
      'font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="700">' +
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function hasRealPhoto(user) {
    var u = resolve(user);
    if (!u) return false;
    if (PLACEHOLDER_RE.test(u) || isGenerated(u)) return false; // ui-avatars = generated stand-in (external, random colour)
    if (u.indexOf('/icons/necpa-') !== -1) return false; // the app logo is never a user photo
    return true;
  }

  function src(user) {
    if (hasRealPhoto(user)) return resolve(user);
    var n = nameOf(user);
    var r = resolve(user);
    if (!n && isGenerated(r)) n = generatedName(r);
    return initials(n);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function html(user, opts) {
    opts = opts || {};
    return '<img class="' + esc(opts.cls || 'avatar') + '" src="' + esc(src(user)) + '" alt="' + esc(opts.alt || '') +
      '" referrerpolicy="no-referrer" loading="lazy" decoding="async" data-avatar="1" data-avatar-name="' +
      esc(nameOf(user)) + '"' + (opts.style ? ' style="' + esc(opts.style) + '"' : '') + '>';
  }

  window.NecpaAvatar = { resolve: resolve, src: src, html: html, initials: initials, nameOf: nameOf, hasRealPhoto: hasRealPhoto };

  // Every page that already calls __resolveMediaUrl (friend.html, ...) now gets the wider logic.
  window.__resolveMediaUrl = function (u) { var r = resolve(u); return r || u; };

  // ---- make sure the referrer policy is set BEFORE the browser starts the request -------------
  function needsNoReferrer(u) { return NO_REFERRER_HOST_RE.test(String(u || '')); }

  try {
    var desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (desc && desc.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true, enumerable: desc.enumerable,
        get: desc.get,
        set: function (v) {
          try {
            if (typeof v === 'string' && v) {
              var fixed = resolve(v);
              if (fixed) v = fixed;
              if (isGenerated(v)) v = initials(generatedName(v));
              if (needsNoReferrer(v)) this.referrerPolicy = 'no-referrer';
            }
          } catch (_) {}
          desc.set.call(this, v);
        }
      });
    }
  } catch (_) {}

  // Images created from HTML strings (innerHTML) start loading before any script can touch them.
  // If such an image is a Google/CDN photo, restart it once with the right policy.
  function guard(img) {
    if (!img || img.nodeType !== 1 || img.tagName !== 'IMG' || img.__necpaAvatarGuard) return;
    var raw = img.getAttribute('src') || '';
    if (!raw) return;
    img.__necpaAvatarGuard = true;
    var fixed = resolve(raw);
    if (isGenerated(fixed || raw)) { img.setAttribute('src', initials(generatedName(fixed || raw))); return; }
    var wantsNoRef = needsNoReferrer(fixed || raw) || img.hasAttribute('data-avatar');
    var changed = false;
    if (fixed && fixed !== raw) { img.setAttribute('src', fixed); changed = true; }
    if (wantsNoRef && img.referrerPolicy !== 'no-referrer') {
      img.referrerPolicy = 'no-referrer';
      if (!changed && !img.complete) { var cur = img.getAttribute('src'); img.removeAttribute('src'); img.setAttribute('src', cur); }
    }
  }
  function scan(root) {
    if (!root) return;
    if (root.tagName === 'IMG') guard(root);
    if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll('img[src]'), guard);
  }
  try {
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        if (m.type === 'attributes') { m.target.__necpaAvatarGuard = false; guard(m.target); return; }
        m.addedNodes && m.addedNodes.forEach(scan);
      });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  } catch (_) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan(document); }, { once: true });
  else scan(document);

  // ---- a failed avatar -> retry once, then initials (never the app logo) ---------------------
  document.addEventListener('error', function (ev) {
    var img = ev.target;
    if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-avatar-name')) return;
    var cur = img.getAttribute('src') || '';
    if (cur.indexOf('data:') === 0) return;
    if (!img.__necpaAvatarRetried) {
      img.__necpaAvatarRetried = true;
      setTimeout(function () { img.src = cur + (cur.indexOf('?') === -1 ? '?' : '&') + '_r=' + Date.now(); }, 1200);
      return;
    }
    try { console.warn('[NecpaAvatar] photo failed to load, showing initials instead. URL:', cur); } catch (_) {}
    img.src = initials(img.getAttribute('data-avatar-name'));
  }, true);
})();
