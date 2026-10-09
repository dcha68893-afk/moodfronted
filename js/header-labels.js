/* header-labels.js — show a small text label under every icon-only button in a module's top header.
 *
 * The Tools module labels its header actions ("Menu"); Chats, Status, Groups, Friends, Settings and Money showed bare icons,
 * so users had to guess what each one does. This adds the same kind of label to those headers without touching each
 * module's markup: any button inside the module's main header that contains only an icon/emoji gets a caption taken from its
 * own aria-label / title / data-label. Modal headers, dialogs, buttons that already have words, and buttons with no
 * accessible name are left alone. Re-runs when the header re-renders.
 */
(function () {
  'use strict';
  if (window.__headerLabels) return;
  window.__headerLabels = true;

  var HEADER = 'header, .header, .top, .topbar, .top-bar, .toolbar, .app-header, .page-header, .module-header, .chat-header, .header-actions, [class*="header-icons"], [class*="topbar"], [class*="top-bar"]';
  var SKIP_ANCESTOR = '.modal, .modal-header, [role="dialog"], dialog, .conv-locked-header, .bubble, .message, .sheet, .popup, .menu-panel, nav.bottom, .mobile-nav-bar';

  function hasWords(el) {
    var clone = el.cloneNode(true);
    var junk = clone.querySelectorAll('.badge, [class*="badge"], [class*="count"], .hl-label, svg, i');
    for (var i = 0; i < junk.length; i++) junk[i].remove();
    return /[A-Za-z\u00C0-\u024F\u0400-\u04FF]{2,}/.test(clone.textContent || '');
  }
  function nameOf(el) {
    var n = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-label') || '';
    n = n.trim();
    return n && n.length <= 18 ? n : '';          // long tooltips make poor captions
  }
  function label(btn) {
    if (btn.dataset.hlDone) return;
    btn.dataset.hlDone = '1';
    if (btn.closest(SKIP_ANCESTOR)) return;
    if (btn.getAttribute('aria-hidden') === 'true' || btn.hidden) return;
    if (hasWords(btn)) return;
    var name = nameOf(btn);
    if (!name) return;
    var s = document.createElement('span');
    s.className = 'hl-label';
    s.textContent = name;
    s.setAttribute('aria-hidden', 'true');
    btn.appendChild(s);
    btn.classList.add('hl-has-label');
  }
  function run() {
    try {
      var heads = document.querySelectorAll(HEADER);
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].closest(SKIP_ANCESTOR)) continue;
        var btns = heads[i].querySelectorAll('button, [role="button"], a.icon-btn');
        for (var j = 0; j < btns.length; j++) label(btns[j]);
      }
    } catch (_) {}
  }

  var st = document.createElement('style');
  st.textContent =
    '.hl-has-label{display:inline-flex !important;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:auto !important;min-height:40px;padding-top:4px !important;padding-bottom:3px !important;line-height:1.1}' +
    '.hl-label{font-size:10px;font-weight:600;line-height:1.1;letter-spacing:.1px;white-space:nowrap;color:inherit;opacity:.78;pointer-events:none;max-width:64px;overflow:hidden;text-overflow:ellipsis}';
  (document.head || document.documentElement).appendChild(st);

  var t = null;
  function schedule() { if (t) return; t = setTimeout(function () { t = null; run(); }, 120); }
  function start() {
    run();
    try { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
