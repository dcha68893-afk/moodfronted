/* theme-contrast-guard.js
 * ROOT CAUSE it fixes: many modules hardcode colours (white / very light grey text and icons, or dark
 * text on a dark surface) that only look right in ONE theme. When the theme flips, those icons/labels
 * end up the same colour as the surface behind them, so they "disappear" (fine in dark, invisible in
 * light - and the reverse). Chasing every hardcoded value across ~40 files is not reliable, so this
 * guard measures the REAL rendered contrast in every module and corrects only the elements that are
 * actually unreadable. It never touches anything with enough contrast, and skips anything painted on
 * a gradient/image (those are intentionally coloured, e.g. white icon on a green FAB).
 * Loaded by js/theme.engine.js, which every module already includes.
 */
(function () {
  'use strict';
  if (window.__kynContrastGuard) return;
  var MIN = 2.0;                       // only repair truly unreadable pairs (white on white = 1.0)
  var DARK_TXT = '#111b21', LIGHT_TXT = '#e5e7eb';
  var MARK = 'data-kyn-cg';
  var timer = null, running = false;

  function parse(c) {
    var m = (c || '').match(/[\d.]+/g); if (!m || m.length < 3) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 };
  }
  function lum(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function ratio(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  function isDarkTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    return t === 'dark' || document.documentElement.classList.contains('theme-dark');
  }
  // Effective opaque background, or null when it sits on a gradient/image (cannot be measured).
  function backdrop(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      var c = parse(cs.backgroundColor);
      if (c && c.a >= 0.6) return c;
    }
    var root = parse(getComputedStyle(document.body).backgroundColor);
    if (root && root.a >= 0.6) return root;
    return isDarkTheme() ? { r: 15, g: 23, b: 42, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  }
  function hasOwnText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
  }
  function isIcon(el) {
    var t = el.tagName;
    if (t === 'svg') return true;
    if (t === 'I' || t === 'SPAN') { var c = typeof el.className === 'string' ? el.className : ''; return /(^|\s)(fa[srlb]?|fa-[\w-]+|icon[\w-]*|material-icons)(\s|$)/.test(c) && !el.children.length; }
    return false;
  }
  function reset() {
    var marked = document.querySelectorAll('[' + MARK + ']');
    for (var i = 0; i < marked.length; i++) {
      var el = marked[i], prev = el.getAttribute(MARK);
      if (prev === '') el.style.removeProperty('color');
      else el.style.setProperty('color', prev.split('|')[0], prev.split('|')[1] || '');
      el.removeAttribute(MARK);
    }
  }
  function scan() {
    running = true;
    try {
      reset();
      var all = document.body ? document.body.getElementsByTagName('*') : [];
      var limit = Math.min(all.length, 6000);
      for (var i = 0; i < limit; i++) {
        var el = all[i], tag = el.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META' || tag === 'OPTION' || tag === 'PATH' || tag === 'G') continue;
        var form = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
        if (!form && !hasOwnText(el) && !isIcon(el)) continue;
        var cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        var r = el.getBoundingClientRect(); if (r.width < 3 || r.height < 3) continue;
        var fg = parse(cs.color); if (!fg || fg.a === 0) continue;
        var bg = backdrop(el); if (!bg) continue;
        if (ratio(fg, bg) >= MIN) continue;
        var good = lum(bg) > 0.4 ? DARK_TXT : LIGHT_TXT;
        var inl = el.style.getPropertyValue('color');
        el.setAttribute(MARK, inl ? inl + '|' + el.style.getPropertyPriority('color') : '');
        el.style.setProperty('color', good, 'important');
        if (tag === 'svg') el.style.setProperty('fill', 'currentColor');
      }
    } catch (_) {}
    running = false;
  }
  function schedule(delay) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      (window.requestIdleCallback || function (f) { return setTimeout(f, 0); })(scan);
    }, delay == null ? 350 : delay);
  }
  function start() {
    schedule(600);
    // Theme flips: re-measure immediately after the new palette is painted.
    new MutationObserver(function () { schedule(120); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    // New content (lists, panels, modals) arriving later.
    new MutationObserver(function (muts) {
      if (running) return;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList' && m.addedNodes.length) { schedule(500); return; }
      }
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('message', function (e) {
      var t = e && e.data && e.data.type;
      if (t && /THEME|SETTING/i.test(String(t))) schedule(250);
    });
    window.addEventListener('load', function () { schedule(300); });
  }
  window.__kynContrastGuard = { rescan: function () { schedule(0); } };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
