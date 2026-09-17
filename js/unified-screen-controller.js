/* Necpa Unified Screen Controller v2
 *
 * One parent-shell authority for every module screen, panel, theme handoff and
 * transition. Existing module DOM/business logic is preserved; modules report
 * their state to this controller instead of owning the app shell.
 *
 * The controller deliberately does not poll. It reacts to navigation, panel,
 * iframe-load and theme events, which keeps the shell responsive on low-tier
 * devices and avoids mutation/polling feedback loops.
 */
(function (global, document) {
  'use strict';
  if (!document || !/\/chat\.html$/i.test(location.pathname) || global.parent !== global) return;
  if (global.__NECPRA_UNIFIED_SCREEN_CONTROLLER__) return;
  global.__NECPRA_UNIFIED_SCREEN_CONTROLLER__ = true;

  var MODULES = {
    messages: { container: 'messagesContent', frame: 'messagesIframe' },
    status:   { container: 'statusContent',   frame: 'statusIframe' },
    group:    { container: 'groupContent',    frame: 'groupIframe' },
    friends:  { container: 'friendsContent',  frame: 'friendsIframe' },
    calls:    { container: 'callsContent',    frame: 'callsIframe' },
    settings: { container: 'settingsContent', frame: 'settingsIframe' },
    tools:    { container: 'toolsContent',    frame: 'toolsIframe' },
    games:    { container: 'gamesContent',    frame: 'gamesIframe' }
  };

  var ALIASES = {
    message:'messages', messages:'messages', chat:'messages',
    group:'group', groups:'group', 'group-core':'group',
    friend:'friends', friends:'friends', 'friend-core':'friends',
    status:'status', statuses:'status',
    call:'calls', calls:'calls', 'calls-core':'calls',
    setting:'settings', settings:'settings',
    tool:'tools', tools:'tools', marketplace:'tools',
    game:'games', games:'games'
  };

  var state = global.__NECPRA_SCREEN_STATE__ = global.__NECPRA_SCREEN_STATE__ || {
    module: normalizePage(global.__currentPage || 'messages'),
    panel: null,
    panels: {},
    switching: false,
    ready: false,
    theme: null,
    transitionId: 0
  };

  function normalizePage(value) {
    var key = String(value || '').toLowerCase().replace(/\.html$/,'');
    return ALIASES[key] || key || 'messages';
  }

  function frameList() {
    var seen = [];
    Object.keys(MODULES).forEach(function (name) {
      var f = document.getElementById(MODULES[name].frame);
      if (f && seen.indexOf(f) < 0) seen.push(f);
    });
    document.querySelectorAll('iframe[data-module],iframe[data-page]').forEach(function (f) {
      if (seen.indexOf(f) < 0) seen.push(f);
    });
    return seen;
  }

  function emit(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (_) {}
  }

  function setShellState() {
    var root = document.documentElement;
    root.setAttribute('data-kyn-screen-module', state.module);
    root.setAttribute('data-kyn-screen-panel', state.panel || 'none');
    if (document.body) {
      document.body.setAttribute('data-kyn-screen-module', state.module);
      document.body.setAttribute('data-kyn-screen-panel', state.panel || 'none');
    }
  }

  function beginSwitch() {
    state.switching = true;
    state.transitionId += 1;
    document.documentElement.classList.add('kyn-screen-switching');
    if (document.body) document.body.classList.add('kyn-screen-switching');
    setShellState();
  }

  function endSwitch(id) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (id !== state.transitionId) return;
        state.switching = false;
        document.documentElement.classList.remove('kyn-screen-switching');
        if (document.body) document.body.classList.remove('kyn-screen-switching');
      });
    });
  }

  function applyThemeToFrame(frame) {
    if (!frame || !frame.contentDocument) return;
    try {
      var theme = document.documentElement.getAttribute('data-theme') || 'light';
      state.theme = theme;
      var doc = frame.contentDocument;
      doc.documentElement.setAttribute('data-parent-shell', 'true');
      doc.documentElement.setAttribute('data-theme', theme);
      doc.documentElement.classList.toggle('theme-dark', theme === 'dark');
      doc.documentElement.classList.toggle('dark-theme', theme === 'dark');
      if (global.ThemeManager && typeof global.ThemeManager.broadcastToIframe === 'function') {
        global.ThemeManager.broadcastToIframe(frame, frame.dataset.module || '');
      } else if (global.ThemeManager && typeof global.ThemeManager.applyToFrame === 'function') {
        global.ThemeManager.applyToFrame(frame);
      }
    } catch (_) {}
  }

  function applyThemeAll() { frameList().forEach(applyThemeToFrame); }

  function revealModule(module) {
    Object.keys(MODULES).forEach(function (name) {
      var meta = MODULES[name];
      var container = document.getElementById(meta.container);
      if (!container) return;
      if (name === module) container.classList.remove('hidden');
      else container.classList.add('hidden');
    });
    document.querySelectorAll('.nav-icon[data-page],.mobile-nav-icon[data-page]').forEach(function (el) {
      el.classList.toggle('active', normalizePage(el.getAttribute('data-page')) === module);
    });
  }

  function syncModule(module, options) {
    module = normalizePage(module);
    if (!MODULES[module]) return;
    options = options || {};
    var previous = state.module;
    var changed = previous !== module;
    if (!changed && !options.force) {
      setShellState();
      applyThemeAll();
      return;
    }

    var id = state.transitionId + 1;
    beginSwitch();
    state.module = module;
    if (!options.keepPanel) state.panel = null;
    setShellState();
    revealModule(module);
    applyThemeAll();
    emit('kyn:screenchange', { module: module, previous: previous, panel: state.panel, source: 'unified-screen-controller' });
    endSwitch(id);
  }

  function syncPanel(module, panel, open) {
    module = normalizePage(module || state.module);
    var value = open ? String(panel || 'panel') : null;
    state.module = MODULES[module] ? module : state.module;
    state.panel = value;
    state.panels[state.module] = value;
    setShellState();
    emit('kyn:screenpanelchange', { module: state.module, panel: value, open: !!open, source: 'unified-screen-controller' });
  }

  function installNavigationAuthority() {
    var original = global.navigateToPage;
    if (typeof original !== 'function' || original.__kynUnifiedWrapped) return typeof original === 'function';
    function unifiedNavigate(page) {
      var module = normalizePage(page);
      beginSwitch();
      var result;
      try { result = original.apply(this, arguments); }
      finally {
        state.module = MODULES[module] ? module : state.module;
        state.panel = null;
        setShellState();
        applyThemeAll();
        emit('kyn:screenchange', { module: state.module, panel: null, source: 'unified-screen-controller' });
        endSwitch(state.transitionId);
      }
      return result;
    }
    unifiedNavigate.__kynUnifiedWrapped = true;
    unifiedNavigate.__kynOriginal = original;
    global.navigateToPage = unifiedNavigate;
    return true;
  }

  function installClicks() {
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('[data-page],[data-module]') : null;
      if (!target) return;
      var page = target.getAttribute('data-page') || target.getAttribute('data-module');
      if (page && MODULES[normalizePage(page)]) syncModule(page);
    }, true);
  }

  function installPanelEvents() {
    global.addEventListener('message', function (event) {
      var data = event && event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'PanelOpened') syncPanel(data.module, data.panel, true);
      else if (data.type === 'PanelClosed') syncPanel(data.module, data.panel, false);
      else if (data.type === 'GROUP_PANEL_OPEN' || data.type === 'GROUP_CHAT_OPENED' || data.type === 'GROUP_DETAIL_OPENED') syncPanel('group', 'conversation', true);
      else if (data.type === 'GROUP_PANEL_CLOSED' || data.type === 'GROUP_LIST_SHOWN' || data.type === 'GO_BACK_TO_LIST') {
        if (data.source !== 'group-iframe' || state.module === 'group') syncPanel('group', null, false);
      } else if (data.type === 'CHAT_OPENED' || data.type === 'CONVERSATION_OPENED' || data.type === 'CHAT_HEADER_UPDATE') syncPanel('messages', 'conversation', true);
      else if (data.type === 'CHAT_LIST_SHOWN' || data.type === 'CHAT_CLOSED' || data.type === 'GO_BACK_TO_CHAT_LIST') syncPanel('messages', null, false);
      else if (data.type === 'STATUS_VIEW_OPENED' || data.type === 'STATUS_CREATE_OPENED' || data.type === 'STATUS_PANEL_OPENED') syncPanel('status', 'viewer', true);
      else if (data.type === 'STATUS_PANEL_CLOSED' || data.type === 'STATUS_LIST_SHOWN') syncPanel('status', null, false);
    });
    document.addEventListener('kyn:panelstate', function (event) {
      var d = event.detail || {};
      syncPanel(d.module, d.panel, d.type === 'PanelOpened');
    });
  }

  function installThemeAuthority() {
    function refresh() {
      var theme = document.documentElement.getAttribute('data-theme') || 'light';
      if (theme === state.theme) { applyThemeAll(); return; }
      beginSwitch();
      state.theme = theme;
      applyThemeAll();
      emit('kyn:themechange', { theme: theme, source: 'unified-screen-controller' });
      endSwitch(state.transitionId);
    }
    if (global.MutationObserver) {
      var observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i += 1) {
          if (records[i].attributeName === 'data-theme') { refresh(); break; }
        }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    global.addEventListener('storage', function (event) {
      if (event.key === 'app_theme' || event.key === 'knecta_settings_cache' || event.key === 'app_settings_global') setTimeout(refresh, 0);
    });
    document.addEventListener('kyn:themechange', function () { setTimeout(refresh, 0); });
  }

  function installFrameAuthority() {
    document.addEventListener('load', function (event) {
      if (event.target && event.target.tagName === 'IFRAME') {
        applyThemeToFrame(event.target);
        if (event.target.dataset) event.target.dataset.kynShellReady = '1';
      }
    }, true);
    frameList().forEach(function (frame) {
      frame.addEventListener('load', function () { applyThemeToFrame(frame); }, false);
    });
    applyThemeAll();
  }

  function installHistoryBridge() {
    global.addEventListener('popstate', function () {
      var page = normalizePage(global.__currentPage || state.module);
      syncModule(page, { force: true, keepPanel: true });
    });
  }

  function boot() {
    var style = document.createElement('style');
    style.id = 'kynUnifiedScreenControllerStyle';
    style.textContent = [
      'html.kyn-screen-switching,html.kyn-screen-switching *,body.kyn-screen-switching,body.kyn-screen-switching *{transition:none!important;animation:none!important}',
      'html[data-kyn-screen-module] .iframe-container{contain:layout paint;}',
      'html[data-kyn-screen-module] .iframe-container.hidden{visibility:hidden!important;pointer-events:none!important;}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);

    installClicks();
    installPanelEvents();
    installThemeAuthority();
    installFrameAuthority();
    installHistoryBridge();
    setShellState();
    state.theme = document.documentElement.getAttribute('data-theme') || 'light';
    installNavigationAuthority();
    state.ready = true;

    global.KynectaScreen = {
      state: state,
      normalizeModule: normalizePage,
      openModule: function (module, options) { syncModule(module, options); },
      openPanel: function (module, panel) { syncPanel(module, panel, true); },
      closePanel: function (module) { syncPanel(module, null, false); },
      refreshTheme: applyThemeAll,
      getFrame: function (module) { var m = MODULES[normalizePage(module)]; return m ? document.getElementById(m.frame) : null; }
    };

    /* The parent shell is the only place allowed to decide which module is
       visible. Existing navigateToPage still performs its established work;
       this final reconciliation makes the controller authoritative without
       rewriting module-specific business logic. */
    setTimeout(function () {
      installNavigationAuthority();
      syncModule(global.__currentPage || state.module, { force: true, keepPanel: true });
    }, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(window, document);
