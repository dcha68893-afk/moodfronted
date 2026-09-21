/* Kynecta Theme Engine — single source of truth.
 * The saved Settings theme is authoritative. Child module frames never
 * become competing theme authorities when hosted inside chat.html.
 */
(function (global) {
  'use strict';

  /* THEME WRITE GUARD -- one screen, one theme, no matter who writes.
     More than 20 files still write data-theme / theme-dark / theme-light on their own (Tool-core, settings-global-propagation,
     module caches, older bridges...). They run on different timers with their own snapshots, so the page briefly showed a mix.
     A MutationObserver callback runs as a microtask BEFORE the browser paints, so a foreign write that disagrees with the
     authoritative theme is put back inside the same task -- it is never presented, hence no blink. */
  function installThemeGuard(getTheme) {
    try {
      var root = document.documentElement, busy = false;
      var fix = function () {
        if (busy) return; busy = true;
        try {
          var t = getTheme(); if (t !== 'dark' && t !== 'light') return;
          if (root.getAttribute('data-theme') !== t) root.setAttribute('data-theme', t);
          root.classList.toggle('theme-dark', t === 'dark'); root.classList.toggle('theme-light', t === 'light'); root.classList.toggle('dark-theme', t === 'dark');
          var b = document.body;
          if (b) { if (b.getAttribute('data-theme') !== t) b.setAttribute('data-theme', t); b.classList.toggle('dark-theme', t === 'dark'); }
        } catch (_) {} finally { busy = false; }
      };
      new MutationObserver(fix).observe(root, { attributes: true, attributeFilter: ['data-theme', 'class'] });
      var bindBody = function () { if (document.body) { new MutationObserver(fix).observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class'] }); fix(); } };
      if (document.body) bindBody(); else document.addEventListener('DOMContentLoaded', bindBody, { once: true });
    } catch (_) {}
  }

  /* EMBEDDED-MODULE LOCK:
   * chat.html owns the theme when a module is loaded in an iframe. The child
   * keeps only a read-only/proxy API so module code can observe the shell
   * without creating its own theme, reading its own fallback, or persisting a
   * competing theme. Theme changes are requests to the shell, never child
   * theme writes.
   */
  if (global.parent !== global) {
    var shell = null;
    try { shell = global.parent; } catch (_) {}
    var proxyListeners = [];
    /* ROOT-CAUSE FIX (theme flicker / revert after saving a setting):
       every module iframe used to be allowed to REQUEST a theme change, and several of them (Tools, Status, Group,
       Friend...) do so from their own boot/sync code using THEIR cached copy of the settings -- which can be stale. The user
       picks DARK in Settings, the shell applies it and broadcasts it, and a module then answers with its stale LIGHT request;
       the shell obeys it and re-broadcasts, so the screen flips back and forth ("blinking and sparking").
       The header of this file always promised "child module frames never become competing theme authorities": now they really
       cannot. Only the Settings page (where the user actually chooses) may send change requests. */
    var CAN_REQUEST = /(?:^|\/)settings(?:\.html)?$/i.test(global.location.pathname || '');
    /* ROOT-CAUSE FIX (Settings flips the theme by itself when you navigate back to it):
       the previous guard treated ANY call made while `navigator.userActivation.isActive` as "the user's choice". Transient user
       activation is shared with every SAME-ORIGIN frame in the page (HTML spec, "activation notification"), so tapping the Settings
       icon in chat.html's nav marks the freshly-focused Settings iframe as "active" too. Settings' own boot / refocus / sync code
       (settings-core.js applySettingsToUI(), the `|| 'light'` re-save, SETTINGS_LOAD replies ...) then re-applied its cached
       snapshot through this proxy, every such call was stamped userInitiated:true, and the shell obeyed and locked it for 2s.
       That is also why only Settings misbehaved -- it is the only frame allowed to send requests.
       A request now only counts when the caller says so explicitly (opts.userChoice === true). settings-ui.js passes that flag
       from the theme/font/icon <select> change handlers and nowhere else, so boot, sync and refocus code can never change it. */
    function explicitChoice(opts) { return !!(opts && opts.userChoice === true); }
    /* ROOT-CAUSE FIX (module body painted with a hardcoded fallback first): this frame never painted itself - it waited for
       the shell to inject variables later, on a different timer than the shell's own header/footer. Modules use
       `var(--kyn-bg-panel, #fff)` style fallbacks, so until the injection landed they rendered white while the shell around
       them was already dark. Paint from the shell's live state right now, while <head> is still being parsed (before the
       first frame), and again once the body exists. */
    function paintFromShell() {
      try { if (shell && shell.ThemeManager && typeof shell.ThemeManager.paintDocument === 'function') shell.ThemeManager.paintDocument(document); } catch (_) {}
    }
    paintFromShell();
    document.addEventListener('DOMContentLoaded', paintFromShell);
    installThemeGuard(function () { try { return shell && shell.ThemeManager && shell.ThemeManager.getTheme(); } catch (_) { return null; } });
    var proxy = {
      __kynEmbeddedProxy: true,
      __kynEngine: true,
      /* ROOT-CAUSE FIX (nested frames such as game.html -> game-v3.html never got their --kyn-* tokens on load): a frame whose
         parent is itself an embedded module (game-v3.html inside game.html) calls shell.ThemeManager.paintDocument(document),
         but `shell` there is game.html's PROXY, which had no paintDocument, so paintFromShell() silently did nothing and the
         nested page stayed unpainted until the next theme change. Forward the call up the frame chain to the real engine. */
      paintDocument: function (doc) {
        try { if (shell && shell.ThemeManager && typeof shell.ThemeManager.paintDocument === 'function') shell.ThemeManager.paintDocument(doc || document); } catch (_) {}
      },
      getTheme: function () {
        try {
          if (shell && shell.ThemeManager && typeof shell.ThemeManager.getTheme === 'function') {
            return shell.ThemeManager.getTheme();
          }
        } catch (_) {}
        var current = document.documentElement && document.documentElement.getAttribute('data-theme');
        return current === 'dark' ? 'dark' : 'light';
      },
      getFontSize: function () {
        try { return shell && shell.ThemeManager && shell.ThemeManager.getFontSize ? shell.ThemeManager.getFontSize() : 16; } catch (_) { return 16; }
      },
      getAccentColor: function () {
        try { return shell && shell.ThemeManager && shell.ThemeManager.getAccentColor ? shell.ThemeManager.getAccentColor() : null; } catch (_) { return null; }
      },
      getIconScale: function () {
        try { return shell && shell.ThemeManager && shell.ThemeManager.getIconScale ? shell.ThemeManager.getIconScale() : 'medium'; } catch (_) { return 'medium'; }
      },
      // ROOT-CAUSE FIX (theme-storm / settings revert, round 10): every one of
      // these setters used to unconditionally postMessage a *REQUEST* to the
      // parent shell, with no check for whether `value` was already the
      // current value. Every module page has several independent listeners
      // that all react to the same incoming settings broadcast (this file's
      // own NECPRA_THEME_APPLIED handler is passive, but
      // settings-broadcast-listener.js's applyFull(), and each module's
      // Tool-core.part3.js / tool-core-patch.js / Tool-ui.js message
      // handlers, all separately call `window.ThemeManager.setTheme(...)`
      // for the *same* single real change) — so one real change fanned out
      // into several redundant REQUESTs from this one frame alone. The
      // parent then re-broadcast NECPRA_THEME_APPLIED to every frame for
      // each redundant REQUEST it received (see the matching fix in
      // unified-screen-controller.js's applyTheme()), and those redundant,
      // out-of-order broadcasts are also what made a just-applied change
      // visually revert — a stale duplicate broadcast could land after the
      // fresh one and repaint the old value. Guarding each setter here so a
      // call that doesn't actually change anything is a no-op (matching the
      // equivalent guard the real, non-embedded ThemeManager below already
      // has) stops the redundant REQUESTs at the source.
      setTheme: function (value, opts) {
        if (value === proxy.getTheme()) return value;
        if (!CAN_REQUEST || !explicitChoice(opts)) return proxy.getTheme();
        try {
          if (shell && shell.postMessage) {
            shell.postMessage({ type: 'NECPRA_THEME_REQUEST', userInitiated: true, theme: value, source: 'embedded-module' }, global.location.origin);
          }
        } catch (_) {}
        return proxy.getTheme();
      },
      setFontSize: function (value, opts) {
        if (value === proxy.getFontSize()) return value;
        if (!CAN_REQUEST || !explicitChoice(opts)) return proxy.getFontSize();
        try {
          if (shell && shell.postMessage) shell.postMessage({ type: 'NECPRA_FONT_REQUEST', userInitiated: true, value: value, source: 'embedded-module' }, global.location.origin);
        } catch (_) {}
        return proxy.getFontSize();
      },
      setIconScale: function (value, opts) {
        if (value === proxy.getIconScale()) return value;
        if (!CAN_REQUEST || !explicitChoice(opts)) return proxy.getIconScale();
        try {
          if (shell && shell.postMessage) shell.postMessage({ type: 'NECPRA_ICON_REQUEST', userInitiated: true, value: value, source: 'embedded-module' }, global.location.origin);
        } catch (_) {}
        return proxy.getIconScale();
      },
      setAccentColor: function (value, opts) {
        if (value === proxy.getAccentColor()) return value;
        if (!CAN_REQUEST || !explicitChoice(opts)) return proxy.getAccentColor();
        try {
          if (shell && shell.postMessage) shell.postMessage({ type: 'NECPRA_ACCENT_REQUEST', userInitiated: true, value: value, source: 'embedded-module' }, global.location.origin);
        } catch (_) {}
        return proxy.getAccentColor();
      },
      onChange: function (fn) {
        if (typeof fn !== 'function') return function () {};
        proxyListeners.push(fn);
        return function () { var i = proxyListeners.indexOf(fn); if (i >= 0) proxyListeners.splice(i, 1); };
      },
      broadcastToIframe: function () {},
      broadcastToAllIframes: function () {}
    };
    global.addEventListener('message', function (event) {
      var data = event && event.data;
      if (!data || data.type !== 'NECPRA_THEME_APPLIED') return;
      var detail = { theme: data.theme, fontSize: data.fontSize, iconScale: data.iconScale, reason: data.reason || 'shell' };
      proxyListeners.slice().forEach(function (fn) { try { fn(detail); } catch (_) {} });
      try { document.dispatchEvent(new CustomEvent('kyn:themechange', { detail: detail })); } catch (_) {}
    });
    global.ThemeManager = proxy;
    global.ThemeEngine = proxy;
    return;
  }

  if (global.ThemeManager && global.ThemeManager.__kynEngine) return;
  var THEME_KEY='app_theme',FONT_KEY='app_font_size',ICON_KEY='app_icon_scale';
  var SETTINGS_CACHE_KEY='knecta_settings_cache',LEGACY_SETTINGS_KEY='app_settings_global',LEGACY_DEFAULT_KEY='necpa_settings_default';
  var VALID={light:true,dark:true},FONT_MIN=10,FONT_MAX=28,FONT_DEFAULT=16;
  var ICONS={small:0.85,medium:1,large:1.2,xl:1.4},ICON_DEFAULT='medium';
  var PALETTES={
    dark:{'--danger-color':'#ef4444','--error-color':'#ef4444','--success-color':'#22c55e','--warning-color':'#f59e0b','--info-color':'#38bdf8','--hover-bg':'rgba(255,255,255,.06)','--overlay-bg':'rgba(0,0,0,.65)','--shadow':'0 2px 8px rgba(0,0,0,.4)','--shadow-lg':'0 16px 48px rgba(0,0,0,.6)','--transition':'all .2s ease','--kyn-bg-root':'#0f172a','--kyn-bg-chat':'#020617','--kyn-bg-panel':'#1e293b','--kyn-bg-card':'#1e293b','--kyn-bg-surface':'#1e293b','--kyn-bg-input':'#1e293b','--kyn-bg-sidebar':'#0f172a','--kyn-bg-header':'#0f172a','--kyn-bg-modal':'#1e293b','--kyn-bg-overlay':'rgba(0,0,0,.65)','--kyn-bg-hover':'rgba(255,255,255,.06)','--kyn-bg-active':'rgba(255,255,255,.10)','--kyn-text-primary':'#e5e7eb','--kyn-text-secondary':'#9ca3af','--kyn-text-muted':'#6b7280','--kyn-text-inverse':'#0f172a','--kyn-text-placeholder':'#9ca3af','--kyn-border':'#374151','--kyn-border-light':'rgba(255,255,255,.08)','--kyn-border-strong':'#4b5563','--kyn-accent-primary':'#22c55e','--kyn-accent-secondary':'#2563eb','--kyn-accent-danger':'#ef4444','--kyn-accent-warning':'#f59e0b','--kyn-accent-info':'#38bdf8','--kyn-accent-purple':'#8b5cf6','--kyn-bubble-sent':'#005c4b','--kyn-bubble-sent-text':'#e5e7eb','--kyn-bubble-recv':'#1e293b','--kyn-bubble-recv-text':'#e5e7eb','--kyn-scrollbar-track':'#1e293b','--kyn-scrollbar-thumb':'#374151','--kyn-shadow-sm':'0 2px 8px rgba(0,0,0,.4)','--kyn-shadow-md':'0 8px 24px rgba(0,0,0,.5)','--kyn-shadow-lg':'0 16px 48px rgba(0,0,0,.6)','--kyn-gradient-primary':'linear-gradient(135deg,#2563eb 0%,#1d4ed8 62%,#06b6d4 100%)','--kyn-gradient-sidebar':'linear-gradient(180deg,#0f172a 0%,#1e293b 100%)','--kyn-gradient-header':'linear-gradient(135deg,rgba(15,23,42,.97),rgba(30,41,59,.97))','--kyn-bg-navbar':'#0b1220','--kyn-navbar-border':'rgba(255,255,255,.06)','--kyn-navbar-ring':'#0b1220','--kyn-navbar-notch-shadow':'#0b1220','--kyn-navbar-icon-inactive':'rgba(148,163,184,.55)','--kyn-header-action-bg':'rgba(255,255,255,.08)','--kyn-header-action-bg-hover':'rgba(255,255,255,.15)','--bg-color':'#0f172a','--text-primary':'#e5e7eb','--text-color':'#e5e7eb','--text-secondary':'#9ca3af','--sidebar-bg':'#0f172a','--card-bg':'#1e293b','--border-color':'#374151','--hover-color':'#1f2c33','--primary-color':'#22c55e','--primary-dark':'#16a34a','--primary-light':'#166534','--secondary-color':'#1e293b','--background-color':'#0f172a','--surface-color':'#1e293b','--card-background':'#1e293b','--accent-color':'#8b5cf6','--accent-soft':'#1e293b','--header-gradient':'linear-gradient(135deg,#0f172a 0%,#1e293b 62%,#0f172a 100%)','--app-secondary-surface':'#0f172a','--app-secondary-muted':'#1e293b','--app-text-color':'#e5e7eb','--app-text-secondary':'#9ca3af','--app-primary-gradient':'linear-gradient(135deg,#2563eb 0%,#1d4ed8 62%,#06b6d4 100%)'},
    light:{'--danger-color':'#ef4444','--error-color':'#ef4444','--success-color':'#22c55e','--warning-color':'#f59e0b','--info-color':'#38bdf8','--hover-bg':'rgba(0,0,0,.04)','--overlay-bg':'rgba(0,0,0,.45)','--shadow':'0 2px 8px rgba(0,0,0,.08)','--shadow-lg':'0 16px 48px rgba(0,0,0,.16)','--transition':'all .2s ease','--kyn-bg-root':'#fff','--kyn-bg-chat':'#efeae2','--kyn-bg-panel':'#fff','--kyn-bg-card':'#fff','--kyn-bg-surface':'#fff','--kyn-bg-input':'#f0f2f5','--kyn-bg-sidebar':'#fff','--kyn-bg-header':'#f0f2f5','--kyn-bg-modal':'#fff','--kyn-bg-overlay':'rgba(0,0,0,.45)','--kyn-bg-hover':'rgba(0,0,0,.04)','--kyn-bg-active':'rgba(0,0,0,.08)','--kyn-text-primary':'#111b21','--kyn-text-secondary':'#667781','--kyn-text-muted':'#8696a0','--kyn-text-inverse':'#fff','--kyn-text-placeholder':'#8696a0','--kyn-border':'#e9edef','--kyn-border-light':'rgba(0,0,0,.06)','--kyn-border-strong':'#d1d7db','--kyn-accent-primary':'#22c55e','--kyn-accent-secondary':'#2563eb','--kyn-accent-danger':'#ef4444','--kyn-accent-warning':'#f59e0b','--kyn-accent-info':'#38bdf8','--kyn-accent-purple':'#8b5cf6','--kyn-bubble-sent':'#d9fdd3','--kyn-bubble-sent-text':'#111b21','--kyn-bubble-recv':'#fff','--kyn-bubble-recv-text':'#111b21','--kyn-scrollbar-track':'#f0f2f5','--kyn-scrollbar-thumb':'#d1d7db','--kyn-shadow-sm':'0 2px 8px rgba(0,0,0,.08)','--kyn-shadow-md':'0 8px 24px rgba(0,0,0,.12)','--kyn-shadow-lg':'0 16px 48px rgba(0,0,0,.16)','--kyn-gradient-primary':'linear-gradient(135deg,#2563eb 0%,#1d4ed8 62%,#06b6d4 100%)','--kyn-gradient-sidebar':'linear-gradient(180deg,#fff 0%,#f0f2f5 100%)','--kyn-gradient-header':'linear-gradient(135deg,rgba(255,255,255,.97),rgba(240,242,245,.97))','--kyn-bg-navbar':'#fff','--kyn-navbar-border':'rgba(15,23,42,.08)','--kyn-navbar-ring':'#fff','--kyn-navbar-notch-shadow':'#fff','--kyn-navbar-icon-inactive':'rgba(100,116,139,.65)','--kyn-header-action-bg':'rgba(255,255,255,.70)','--kyn-header-action-bg-hover':'rgba(255,255,255,.95)','--bg-color':'#fff','--text-primary':'#111b21','--text-color':'#111b21','--text-secondary':'#667781','--sidebar-bg':'#fff','--card-bg':'#fff','--border-color':'#d1d7db','--hover-color':'#f5f5f5','--primary-color':'#22c55e','--primary-dark':'#16a34a','--primary-light':'#dcfce7','--secondary-color':'#f0f2f5','--background-color':'#fff','--surface-color':'#fff','--card-background':'#fff','--accent-color':'#8b5cf6','--accent-soft':'#f5f3ff','--header-gradient':'linear-gradient(135deg,#fff 0%,#f0f2f5 62%,#fff 100%)','--app-secondary-surface':'#f8fafc','--app-secondary-muted':'#e5e7eb','--app-text-color':'#0f172a','--app-text-secondary':'#64748b','--app-primary-gradient':'linear-gradient(135deg,#2563eb 0%,#1d4ed8 62%,#06b6d4 100%)'}};
  function get(k){try{return localStorage.getItem(k);}catch(_){return null;}}
  function set(k,v){try{localStorage.setItem(k,v);}catch(_) {}}
  function validateTheme(v){return VALID[v]?v:'light';}
  function validateFont(v){var n=parseInt(v,10);return n>=FONT_MIN&&n<=FONT_MAX?n:FONT_DEFAULT;}
  function validateIcon(v){return Object.prototype.hasOwnProperty.call(ICONS,v)?v:ICON_DEFAULT;}
  function settingsCache(){var raw=get(SETTINGS_CACHE_KEY)||get(LEGACY_SETTINGS_KEY)||get(LEGACY_DEFAULT_KEY);if(!raw)return null;try{var p=JSON.parse(raw);return p&&(p.data||p);}catch(_){return null;}}
  function initialTheme(){var boot=global.__NECPRA_INITIAL_THEME__,direct=get(THEME_KEY),c=settingsCache(),saved=c&&(c.appearance&&c.appearance.theme||c.theme);return validateTheme(boot||direct||saved);}
  function initialFont(){var c=settingsCache(),saved=c&&c.appearance&&c.appearance.fontSize;return validateFont(get(FONT_KEY)||saved);}
  function initialIcon(){var c=settingsCache(),saved=c&&c.appearance&&c.appearance.iconSize;return validateIcon(get(ICON_KEY)||saved);}
  function initialAccent(){var c=settingsCache();return c&&c.appearance&&c.appearance.accentColor||null;}
  var savedAtBoot=!!get(THEME_KEY);var state={savedTheme:savedAtBoot,savedFont:!!get(FONT_KEY),savedIcon:!!get(ICON_KEY),savedAccent:false,theme:initialTheme(),fontSize:initialFont(),iconScale:initialIcon(),accentColor:initialAccent()};
  var BOOT_STYLE_ID='kyn-theme-boot-style';
  function beginBoot(doc){try{if(!doc||!doc.head||!doc.documentElement)return;var root=doc.documentElement;root.classList.add('kyn-theme-boot');var s=doc.getElementById(BOOT_STYLE_ID);if(!s){s=doc.createElement('style');s.id=BOOT_STYLE_ID;doc.head.appendChild(s);}s.textContent='html.kyn-theme-boot,html.kyn-theme-boot *{transition:none!important;animation:none!important;caret-color:transparent!important}html.kyn-theme-boot,html.kyn-theme-boot body{color-scheme:'+state.theme+'!important}';}catch(_) {}}
  function endBoot(doc){try{var root=doc&&doc.documentElement;if(!root)return;var release=function(){root.classList.remove('kyn-theme-boot');var s=doc.getElementById(BOOT_STYLE_ID);if(s&&s.parentNode)s.parentNode.removeChild(s);};var w=doc.defaultView||global;if(w&&w.requestAnimationFrame)w.requestAnimationFrame(function(){w.requestAnimationFrame(release);});else setTimeout(release,80);}catch(_) {}}
  function paintNow(theme,fontSize,accent,iconScale,doc){doc=doc||document;var root=doc.documentElement,palette=PALETTES[theme];root.setAttribute('data-theme',theme);root.classList.toggle('theme-dark',theme==='dark');root.classList.toggle('theme-light',theme==='light');root.classList.toggle('dark-theme',theme==='dark');root.style.colorScheme=theme;Object.keys(palette).forEach(function(k){root.style.setProperty(k,palette[k]);});root.style.fontSize=fontSize+'px';root.style.setProperty('--base-font-size',fontSize+'px');root.setAttribute('data-icon-size',iconScale);root.style.setProperty('--icon-scale',String(ICONS[iconScale]));if(accent){root.style.setProperty('--primary-color',accent);root.style.setProperty('--kyn-accent-primary',accent);}if(doc.body){doc.body.setAttribute('data-theme',theme);doc.body.classList.toggle('dark-theme',theme==='dark');}var meta=doc.querySelector('meta[name="theme-color"]');if(!meta){meta=doc.createElement('meta');meta.name='theme-color';(doc.head||doc.documentElement).appendChild(meta);}meta.content=palette['--kyn-bg-root'];}
  beginBoot(document);paintNow(state.theme,state.fontSize,state.accentColor,state.iconScale,document);state.ready=true;try{document.documentElement.classList.remove('kyn-theme-boot');var configBoot=document.getElementById('kyn-config-theme-boot');if(configBoot&&configBoot.parentNode)configBoot.parentNode.removeChild(configBoot);}catch(_){}
  var listeners=[];
  function notify(reason){var detail={theme:state.theme,fontSize:state.fontSize,iconScale:state.iconScale,reason:reason||'update'};listeners.slice().forEach(function(fn){try{fn(detail);}catch(_){}});try{document.dispatchEvent(new CustomEvent('kyn:themechange',{detail:detail}));}catch(_) {}}
  function frameDocs(doc,out,depth){depth=depth||0;if(depth>3)return out;var list=doc.querySelectorAll('iframe');for(var i=0;i<list.length;i++){var d=null;try{d=list[i].contentDocument;}catch(_){}if(d&&d.documentElement){out.push(d);frameDocs(d,out,depth+1);}}return out;}
/* ONE SCREEN: shell (header/footer) and every embedded module are painted in the SAME task, with transitions frozen, so the browser
   presents them in one frame. Previously only the shell was painted here and each module was updated later by separate listeners
   on separate timers -- which is why header, body and footer visibly changed at different moments. */
function atomicPaint(reason){var docs=frameDocs(document,[]);beginBoot(document);docs.forEach(beginBoot);paintNow(state.theme,state.fontSize,state.accentColor,state.iconScale,document);docs.forEach(function(d){paintNow(state.theme,state.fontSize,state.accentColor,state.iconScale,d);});endBoot(document);docs.forEach(endBoot);if(reason)notify(reason);}
  function injectFrame(frame,page){try{if(!frame||!frame.contentWindow)return;var doc=frame.contentDocument||frame.contentWindow.document;if(!doc||!doc.documentElement)return;beginBoot(doc);paintNow(state.theme,state.fontSize,state.accentColor,state.iconScale,doc);if(doc.body){doc.body.setAttribute('data-parent-shell','true');doc.body.setAttribute('data-parent-module',page||'');}doc.documentElement.setAttribute('data-parent-shell','true');doc.documentElement.setAttribute('data-parent-module',page||'');endBoot(doc);}catch(_) {}}
  var ThemeManager={__kynEngine:true,paintDocument:function(doc){try{paintNow(state.theme,state.fontSize,state.accentColor,state.iconScale,doc||document);}catch(_){}},getTheme:function(){return state.theme;},getFontSize:function(){return state.fontSize;},getAccentColor:function(){return state.accentColor;},getIconScale:function(){return state.iconScale;},setTheme:function(v,opts){if(!VALID[v])return state.theme;var n=v;if(n===state.theme&&!(opts&&opts.force))return n;
    /* ROOT-CAUSE FIX (dark applied, then snaps back to light ~0.5s later): many modules re-apply the theme from THEIR OWN
       settings snapshot (app.runtime.authority.js, settingsManager, settings-core, module caches...). When the user picks a
       theme in Settings those snapshots are still the old value, so they call setTheme(old) a moment later and win.
       The user's explicit choice (opts.userChoice, sent by the Settings page) now holds the theme for a short window during
       which a different value from ANY caller is ignored. Nobody else can revert what the user just chose. */
    var now=Date.now();if(state.lockUntil&&now<state.lockUntil&&n!==state.theme)return state.theme;
    var byUser=!!(opts&&(opts.userChoice||opts.force||opts.source==='system'));
    /* ROOT-CAUSE FIX (reload with DARK saved: paints dark, snaps to light ~300ms later, then flickers):
       settings-global-propagation.js et al. call setTheme(<value from a settings snapshot>) on boot. When the snapshot has no
       theme that value is undefined, and validateTheme() silently turned ANY invalid input into 'light' -- a hardcoded
       fallback that repainted the whole app light. (1) An invalid/absent theme is now ignored instead of becoming light.
       (2) Once a theme has been saved on this device, only the user's own choice (Settings) may change it -- background
       snapshot/sync code can no longer override it. */
    if(!byUser&&state.savedTheme&&n!==state.theme)return state.theme;
    if(byUser){state.lockUntil=opts.userChoice?now+2000:0;state.savedTheme=true;}
    state.theme=n;set(THEME_KEY,n);atomicPaint('theme');return n;},setFontSize:function(v,opts){var n=validateFont(v);if(n===state.fontSize)return n;if(!(opts&&(opts.userChoice||opts.force))&&state.savedFont)return state.fontSize;if(opts&&opts.userChoice)state.savedFont=true;state.fontSize=n;set(FONT_KEY,String(n));atomicPaint('fontSize');return n;},setIconScale:function(v,opts){var n=validateIcon(v);if(n===state.iconScale)return n;if(!(opts&&(opts.userChoice||opts.force))&&state.savedIcon)return state.iconScale;if(opts&&opts.userChoice)state.savedIcon=true;state.iconScale=n;set(ICON_KEY,n);atomicPaint('iconScale');return n;},setAccentColor:function(v,opts){if(!v||v===state.accentColor)return state.accentColor;if(!(opts&&(opts.userChoice||opts.force))&&state.savedAccent)return state.accentColor;if(opts&&opts.userChoice)state.savedAccent=true;state.accentColor=v;atomicPaint('accentColor');return v;},onChange:function(fn){if(typeof fn!=='function')return function(){};listeners.push(fn);return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},broadcastToIframe:function(frame,page){injectFrame(frame,page||frame.dataset&&frame.dataset.module);},broadcastToAllIframes:function(selector){try{document.querySelectorAll(selector||'iframe.content-iframe,iframe').forEach(function(f){injectFrame(f,f.dataset&&f.dataset.module);});}catch(_) {}}};
  global.addEventListener('storage',function(e){if(!e||!e.key)return;if(e.key===THEME_KEY){var t=validateTheme(e.newValue);if(t!==state.theme){state.theme=t;atomicPaint('theme-cross-tab');}}else if(e.key===FONT_KEY){var f=validateFont(e.newValue);if(f!==state.fontSize){state.fontSize=f;atomicPaint('fontSize-cross-tab');}}else if(e.key===ICON_KEY){var i=validateIcon(e.newValue);if(i!==state.iconScale){state.iconScale=i;atomicPaint('iconScale-cross-tab');}}});
  global.addEventListener('message',function(e){var d=e&&e.data;if(!d||typeof d!=='object')return;if(d.type==='THEME_CHANGED'){if(d.source==='necpra-shell'||d.source==='AppSettings')return;return;}if(d.type==='FONT_SIZE_CHANGED'){if(d.source==='necpra-shell'||d.source==='AppSettings')return;return;}if(d.type==='ICON_SCALE_CHANGED'){if(d.source==='necpra-shell'||d.source==='AppSettings')return;return;}});
  global.addEventListener('DOMContentLoaded',function(){try{if(document.body){document.body.setAttribute('data-theme',state.theme);document.body.classList.toggle('dark-theme',state.theme==='dark');}endBoot(document);}catch(_){}},{once:true});
  global.addEventListener('load',function(){try{endBoot(document);}catch(_){}},{once:true});
  document.addEventListener('load',function(e){var t=e&&e.target;if(t&&t.tagName==='IFRAME'){try{injectFrame(t,t.dataset&&t.dataset.module);}catch(_){}}},true);
  installThemeGuard(function(){return state.theme;});
  global.ThemeManager=ThemeManager;global.ThemeEngine=ThemeManager;
})(window);
