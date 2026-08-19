/**
 * theme.surface.guard.js
 *
 * Final visual surface authority for the authenticated shell and same-origin
 * module iframes. ThemeManager remains the only theme state owner. This layer
 * prevents legacy page-local hardcoded light/dark surfaces from painting over
 * the resolved palette and causing seams/sparks during boot/reload/theme swap.
 */
(function (window, document) {
  'use strict';

  if (window.__KYN_THEME_SURFACE_GUARD__) return;
  window.__KYN_THEME_SURFACE_GUARD__ = true;

  var STYLE_ID = 'kyn-theme-surface-guard';
  var CSS = [
    'html, body {',
    '  background: var(--kyn-bg-root) !important;',
    '  color: var(--kyn-text-primary) !important;',
    '  border-color: var(--kyn-border) !important;',
    '}',
    '#app, #root, #app-root, .app-container, .page-wrapper, .content-area, .main-content {',
    '  color-scheme: inherit;',
    '}',
    '#loadingScreen, #globalHeader, header, .header, .top-bar, .toolbar, .app-header, .chat-header, .module-header {',
    '  background: var(--kyn-bg-header) !important;',
    '  background-image: none !important;',
    '  color: var(--kyn-text-primary) !important;',
    '  border-color: var(--kyn-border) !important;',
    '}',
    '.header-module-title, .header-module-subtitle, .header-context, .header-module-copy, .header-actions, .profile-name, .profile-status {',
    '  color: var(--kyn-text-primary) !important;',
    '}',
    '.header-module-subtitle, .profile-status {',
    '  color: var(--kyn-text-secondary) !important;',
    '}',
    'footer, .footer, .app-footer, .mobile-nav-bar, .bottom-nav, .bottom-nav-bar, .mobile-footer, .sub-body {',
    '  background: var(--kyn-bg-panel) !important;',
    '  background-image: none !important;',
    '  color: var(--kyn-text-primary) !important;',
    '  border-color: var(--kyn-border) !important;',
    '}',
    'input, textarea, select {',
    '  background-color: var(--kyn-bg-input) !important;',
    '  color: var(--kyn-text-primary) !important;',
    '  border-color: var(--kyn-border) !important;',
    '}',
    'input::placeholder, textarea::placeholder { color: var(--kyn-text-placeholder) !important; }',
    'html.kyn-theme-boot, html.kyn-theme-boot * { transition: none !important; animation: none !important; }'
  ].join('\n');

  function install(doc) {
    try {
      if (!doc || !doc.head || !doc.documentElement) return;
      var style = doc.getElementById(STYLE_ID);
      if (!style) {
        style = doc.createElement('style');
        style.id = STYLE_ID;
        doc.head.appendChild(style);
      }
      style.textContent = CSS;
      doc.documentElement.classList.add('kyn-theme-boot');
      var release = function () {
        try { doc.documentElement.classList.remove('kyn-theme-boot'); } catch (_) {}
      };
      if (doc.readyState === 'complete') {
        (doc.defaultView.requestAnimationFrame || function (fn) { setTimeout(fn, 0); })(release);
      } else {
        doc.defaultView.addEventListener('load', function () {
          (doc.defaultView.requestAnimationFrame || function (fn) { setTimeout(fn, 0); })(release);
        }, { once: true });
      }
    } catch (_) {}
  }

  function installAllFrames() {
    install(document);
    try {
      document.querySelectorAll('iframe').forEach(function (frame) {
        try { install(frame.contentDocument); } catch (_) {}
        frame.addEventListener('load', function () {
          try { install(frame.contentDocument); } catch (_) {}
        }, { passive: true });
      });
    } catch (_) {}
  }

  installAllFrames();
  window.addEventListener('load', installAllFrames, { once: true });
  document.addEventListener('DOMContentLoaded', installAllFrames, { once: true });
})(window, document);
