/* Necpa Unified Screen Controller
 * Parent-shell authority for module/sidebar/panel navigation.
 * Preserves the existing DOM/layout and delegates module business logic to the
 * existing implementations. It only owns screen state, transitions, focus,
 * theme propagation, and browser history coordination.
 */
(function (global, document) {
  'use strict';
  if (!document || !/\/chat\.html$/i.test(location.pathname) || global.parent !== global) return;
  if (global.__NECPRA_UNIFIED_SCREEN_CONTROLLER__) return;
  global.__NECPRA_UNIFIED_SCREEN_CONTROLLER__ = true;

  var state = global.__NECPRA_SCREEN_STATE__ = global.__NECPRA_SCREEN_STATE__ || {
    module: 'messages', panel: null, subpanel: null, switching: false, ready: false
  };
  var lastNavigation = 0;
  var wrappedNavigate = false;
  var iframeSelectors = [
    '#messageIframe','#messagesIframe','#groupIframe','#groupsIframe','#friendIframe','#friendsIframe',
    '#statusIframe','#toolsIframe','#gamesIframe','#settingsIframe'
  ];

  function normalizeModule(value) {
    var s = String(value || '').toLowerCase().replace(/\.html$/,'');
    if (s === 'message' || s === 'messages' || s === 'chat') return 'messages';
    if (s === 'group' || s === 'groups') return 'group';
    if (s === 'friend' || s === 'friends') return 'friends';
    if (s === 'status' || s === 'statuses') return 'status';
    if (s === 'tool' || s === 'tools' || s === 'marketplace') return 'tools';
    if (s === 'game' || s === 'games') return 'games';
    if (s === 'setting' || s === 'settings') return 'settings';
    return s || 'messages';
  }

  function allFrames() {
    var found = [];
    iframeSelectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { if (found.indexOf(el) < 0) found.push(el); });
    });
    document.querySelectorAll('iframe[data-module],iframe[data-page]').forEach(function (el) {
      if (found.indexOf(el) < 0) found.push(el);
    });
    return found;
  }

  function applyScreenClass() {
    var root = document.documentElement;
    root.setAttribute('data-kyn-screen-module', state.module);
    root.setAttribute('data-kyn-screen-panel', state.panel || 'none');
    if (document.body) document.body.setAttribute('data-kyn-screen-module', state.module);
  }

  function lockPaint() {
    state.switching = true;
    applyScreenClass();
    document.documentElement.classList.add('kyn-screen-switching');
    if (document.body) document.body.classList.add('kyn-screen-switching');
  }

  function unlockPaint() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        state.switching = false;
        document.documentElement.classList.remove('kyn-screen-switching');
        if (document.body) document.body.classList.remove('kyn-screen-switching');
      });
    });
  }

  function propagateTheme() {
    try {
      var theme = document.documentElement.getAttribute('data-theme') || 'light';
      allFrames().forEach(function (frame) {
        try {
          var doc = frame.contentDocument;
          if (doc && doc.documentElement) {
            doc.documentElement.setAttribute('data-parent-shell','true');
            doc.documentElement.setAttribute('data-theme', theme);
            if (global.ThemeManager && typeof global.ThemeManager.applyToFrame === 'function') global.ThemeManager.applyToFrame(frame);
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  function syncModule(module, options) {
    module = normalizeModule(module);
    var now = Date.now();
    if (!options || options.force !== true) {
      if (module === state.module && now - lastNavigation < 100) { propagateTheme(); return; }
    }
    lastNavigation = now;
    lockPaint();
    state.module = module;
    if (!options || options.keepPanel !== true) state.panel = null;
    state.subpanel = null;
    applyScreenClass();
    try { document.dispatchEvent(new CustomEvent('kyn:screenchange', { detail: { module: module, panel: state.panel, source: 'unified-screen-controller' } })); } catch (_) {}
    propagateTheme();
    unlockPaint();
  }

  function syncPanel(module, panel, open) {
    state.module = normalizeModule(module || state.module);
    state.panel = open ? (panel || 'panel') : null;
    applyScreenClass();
    try { document.dispatchEvent(new CustomEvent('kyn:screenpanelchange', { detail: { module: state.module, panel: state.panel, open: !!open, source: 'unified-screen-controller' } })); } catch (_) {}
  }

  function installNavigationBridge() {
    if (wrappedNavigate) return true;
    var fn = global.navigateToPage;
    if (typeof fn !== 'function') return false;
    wrappedNavigate = true;
    global.navigateToPage = function (page) {
      var result;
      lockPaint();
      try { result = fn.apply(this, arguments); }
      finally {
        syncModule(page, { force: true });
        unlockPaint();
      }
      return result;
    };
    return true;
  }

  function installClickBridge() {
    document.addEventListener('click', function (event) {
      var el = event.target && event.target.closest ? event.target.closest('[data-page],[data-module],.center-menu-item,.sidebar-item,.nav-item') : null;
      if (!el) return;
      var page = el.getAttribute('data-page') || el.getAttribute('data-module');
      if (!page) {
        var cls = String(el.className || '');
        var m = cls.match(/center-menu-(messages|message|group|groups|friends|friend|status|tools|tool|games|game|settings|setting)/i);
        if (m) page = m[1];
      }
      if (page) syncModule(page);
    }, true);
  }

  function installPanelBridge() {
    global.addEventListener('message', function (event) {
      var data = event && event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'PanelOpened') syncPanel(data.module, data.panel, true);
      else if (data.type === 'PanelClosed') syncPanel(data.module, data.panel, false);
    });
    document.addEventListener('kyn:panelstate', function (event) {
      var d = event.detail || {};
      syncPanel(d.module, d.panel, d.type === 'PanelOpened');
    });
  }

  function installThemeBridge() {
    document.addEventListener('kyn:themechange', function () {
      lockPaint();
      propagateTheme();
      unlockPaint();
    });
    global.addEventListener('storage', function (event) {
      if (event.key === 'app_theme' || event.key === 'knecta_settings_cache' || event.key === 'app_settings_global') {
        lockPaint();
        propagateTheme();
        unlockPaint();
      }
    });
  }

  function installFrameBridge() {
    document.addEventListener('load', function (event) {
      if (event.target && event.target.tagName === 'IFRAME') setTimeout(propagateTheme, 0);
    }, true);
    allFrames().forEach(function (frame) {
      frame.addEventListener('load', function () { setTimeout(propagateTheme, 0); }, { once: false });
    });
  }

  function installHistoryBridge() {
    global.addEventListener('popstate', function () {
      try { syncModule(global.__currentPage || state.module, { force: true }); } catch (_) {}
    });
  }

  function boot() {
    var style = document.createElement('style');
    style.id = 'kynUnifiedScreenControllerStyle';
    style.textContent = 'html.kyn-screen-switching,html.kyn-screen-switching *,body.kyn-screen-switching,body.kyn-screen-switching *{transition:none!important;animation:none!important}';
    (document.head || document.documentElement).appendChild(style);
    installClickBridge();
    installPanelBridge();
    installThemeBridge();
    installFrameBridge();
    installHistoryBridge();
    applyScreenClass();
    propagateTheme();
    installNavigationBridge();
    var tries = 0;
    var timer = setInterval(function () {
      if (installNavigationBridge() || ++tries > 40) clearInterval(timer);
    }, 250);
    state.ready = true;
    global.KynectaScreen = {
      state: state,
      openModule: function (module, opts) { syncModule(module, opts); },
      openPanel: function (module, panel) { syncPanel(module, panel, true); },
      closePanel: function (module) { syncPanel(module, null, false); },
      refreshTheme: propagateTheme
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})(window, document);
