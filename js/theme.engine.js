/* Kynecta Theme Engine — single source of truth.
 * Cold boot is paint-safe: saved theme is resolved before stylesheets render,
 * transitions/animations are disabled during boot, and all theme surfaces use
 * the same palette. Runtime changes are also atomic and transition-free.
 */
(function (global) {
  'use strict';

  if (global.ThemeManager && global.ThemeManager.__kynEngine) return;

  var THEME_KEY = 'app_theme';
  var FONT_KEY = 'app_font_size';
  var ICON_KEY = 'app_icon_scale';
  var SETTINGS_CACHE_KEY = 'knecta_settings_cache';
  var LEGACY_SETTINGS_KEY = 'app_settings_global';
  var LEGACY_DEFAULT_KEY = 'nexopa_settings_default';
  var VALID = { light: true, dark: true };
  var FONT_MIN = 10, FONT_MAX = 28, FONT_DEFAULT = 16;
  var ICONS = { small: 0.85, medium: 1, large: 1.2, xl: 1.4 };
  var ICON_DEFAULT = 'medium';

  /* Complete shared palette. Every authenticated surface, including the
     mobile footer, header, inputs and chat bubbles, is painted from here. */
  var PALETTES = {
    dark: {
      '--kyn-bg-root':'#0f172a','--kyn-bg-chat':'#020617','--kyn-bg-panel':'#1e293b','--kyn-bg-card':'#1e293b','--kyn-bg-input':'#1e293b','--kyn-bg-sidebar':'#0f172a','--kyn-bg-header':'#0f172a','--kyn-bg-modal':'#1e293b','--kyn-bg-overlay':'rgba(0,0,0,.65)','--kyn-bg-hover':'rgba(255,255,255,.06)','--kyn-bg-active':'rgba(255,255,255,.10)','--kyn-text-primary':'#e5e7eb','--kyn-text-secondary':'#9ca3af','--kyn-text-muted':'#6b7280','--kyn-text-inverse':'#0f172a','--kyn-text-placeholder':'#9ca3af','--kyn-border':'#374151','--kyn-border-light':'rgba(255,255,255,.08)','--kyn-border-strong':'#4b5563','--kyn-accent-primary':'#22c55e','--kyn-accent-secondary':'#2563eb','--kyn-accent-danger':'#ef4444','--kyn-accent-warning':'#f59e0b','--kyn-accent-info':'#38bdf8','--kyn-accent-purple':'#8b5cf6','--kyn-bubble-sent':'#005c4b','--kyn-bubble-sent-text':'#e5e7eb','--kyn-bubble-recv':'#1e293b','--kyn-bubble-recv-text':'#e5e7eb','--kyn-scrollbar-track':'#1e293b','--kyn-scrollbar-thumb':'#374151','--kyn-shadow-sm':'0 2px 8px rgba(0,0,0,.4)','--kyn-shadow-md':'0 8px 24px rgba(0,0,0,.5)','--kyn-shadow-lg':'0 16px 48px rgba(0,0,0,.6)','--kyn-gradient-primary':'linear-gradient(135deg,#2563eb 0%,#1d4ed8 62%,#06b6d4 100%)','--kyn-gradient-sidebar':'linear-gradient(180deg,#0f172a 0%,#1e293b 100%)','--kyn-gradient-header':'linear-gradient(135deg,rgba(15,23,42,.97),rgba(30,41,59,.97))','--kyn-bg-navbar':'#0b1220','--kyn-navbar-border':'rgba(255,255,255,.06)','--kyn-navbar-ring':'#0b1220','--kyn-navbar-notch-shadow':'#0b1220','--kyn-navbar-icon-inactive':'rgba(148,163,184,.55)','--kyn-header-action-bg':'rgba(255,255,255,.08)','--kyn-header-action-bg-hover':'rgba(255,255,255,.15)','--bg-color':'#0f172a','--text-primary':'#e5e7eb','--text-color':'#e5e7eb','--text-secondary':'#9ca3af','--sidebar-bg':'#0f172a','--card-bg':'#1e293b','--border-color':'#374151','--hover-color':'#1f2c33','--primary-color':'#22c55e','--primary-dark':'#16a34a','--primary-light':'#166534','--secondary-color':'#1e293b','--background-color':'#0f172a','--surface-color':'#1e293b','--card-background':'#1e293b','--accent-color':'#8b5cf6','--accent-soft':'#1e293b','--header-gradient':'linear-gradient(135deg,#0f172a 0%,#1e293b 62%,#0f172a 100%)','--app-secondary-surface':'#0f172a','--app-secondary-muted':'#1e293b','--app-text-color':'#e5e7eb','--app-text-secondary':'#9ca3af','--app-primary-gradient':'linear-gradient(135deg,#2563eb 0%,#1d4ed8 62%,#06b6d4 100%)'},
    light: {
      '--kyn-bg-root':'#fff','--kyn-bg-chat':'#efeae2','--kyn-bg-panel':'#fff','--kyn-bg-card':'#fff','--kyn-bg-input':'#f0f2f5','--kyn-bg-sidebar':'#fff','--kyn-bg-header':'#f0f2f5','--kyn-bg-modal':'#fff','--kyn-bg-overlay':'rgba(0,0,0,.45)','--kyn-bg-hover':'rgba(0,0,0,.04)','--kyn-bg-active':'rgba(0,0,0,.08)','--kyn-text-primary':'#111b21','--kyn-text-secondary':'#667781','--kyn-text-muted':'#8696a0','--kyn-text-inverse':'#fff','--kyn-text-placeholder':'#8696a0','--kyn-border':'#e9edef','--kyn-border-light':'rgba(0,0,0,.06)','--kyn-border-strong':'#d1d7db','--kyn-accent-primary':'#22c55e','--kyn-accent-secondary':'#2563eb','--kyn-accent-danger':'#ef4444','--kyn-accent-warning':'#f59e0b','--kyn-accent-info':'#38bdf8','--kyn-accent-purple':'#8b5cf6','--kyn-bubble-sent':'#d9fdd3','--kyn-bubble-sent-text':'#111b21','--kyn-bubble-recv':'#fff','--kyn-bubble-recv-text':'#111b21','--kyn-scrollbar-track':'#f0f2f5','--kyn-scrollbar-thumb':'#d1d7db','--kyn-shadow-sm':'0 2px 8px rgba(0,0,0,.08)','--kyn-shadow-md':'0 8px 24px rgba(0,0,0,.12)','--kyn-shadow-lg':'0 16px 48px rgba(0,0,0,.16)','--kyn-gradient-primary':'linear-gradient(135deg,#2563eb 0%,#1d4ed8 62%,#06b6d4 100%)','--kyn-gradient-sidebar':'linear-gradient(180deg,#fff 0%,#f0f2f5 100%)','--kyn-gradient-header':'linear-gradient(135deg,rgba(255,255,255,.97),rgba(240,242,245,.97))','--kyn-bg-navbar':'#fff','--kyn-navbar-border':'rgba(15,23,42,.08)','--kyn-navbar-ring':'#fff','--kyn-navbar-notch-shadow':'#fff','--kyn-navbar-icon-inactive':'rgba(100,116,139,.65)','--kyn-header-action-bg':'rgba(255,255,255,.70)','--kyn-header-action-bg-hover':'rgba(255,255,255,.95)','--bg-color':'#fff','--text-primary':'#111b21','--text-color':'#111b21','--text-secondary':'#667781','--sidebar-bg':'#fff','--card-bg':'#fff','--border-color':'#d1d7db','--hover-color':'#f5f5f5','--primary-color':'#22c55e','--primary-dark':'#16a34a','--primary-light':'#dcfce7','--secondary-color':'#f0f2f5','--background-color':'#fff','--surface-color':'#fff','--card-background':'#fff','--accent-color':'#8b5cf6','--accent-soft':'#f5f3ff','--header-gradient':'linear-gradient(135deg,#fff 0%,#f0f2f5 62%,#fff 100%)','--app-secondary-surface':'#f8fafc','--app-secondary-muted':'#e5e7eb','--app-text-color':'#0f172a','--app-text-secondary':'#64748b','--app-primary-gradient':'linear-gradient(135deg,#2563eb 0%,#1d4ed8 62%,#06b6d4 100%)'}
  };

  function get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function set(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  function validateTheme(v) { return VALID[v] ? v : 'light'; }
  function validateFont(v) { var n=parseInt(v,10); return n>=FONT_MIN&&n<=FONT_MAX?n:FONT_DEFAULT; }
  function validateIcon(v) { return Object.prototype.hasOwnProperty.call(ICONS,v) ? v : ICON_DEFAULT; }

  function settingsCache() {
    var raw=get(SETTINGS_CACHE_KEY)||get(LEGACY_SETTINGS_KEY)||get(LEGACY_DEFAULT_KEY);
    if (!raw) return null;
    try { var p=JSON.parse(raw); return p && (p.data||p); } catch (_) { return null; }
  }
  function initialTheme() {
    var v=get(THEME_KEY), c=!v&&settingsCache();
    return validateTheme(v || (c && c.appearance && c.appearance.theme) || (c && c.theme));
  }
  function initialFont() {
    var v=get(FONT_KEY), c=!v&&settingsCache();
    return validateFont(v || (c && c.appearance && c.appearance.fontSize));
  }
  function initialIcon() {
    var v=get(ICON_KEY), c=!v&&settingsCache();
    return validateIcon(v || (c && c.appearance && c.appearance.iconSize));
  }
  function initialAccent() {
    var c=settingsCache();
    return c && c.appearance && c.appearance.accentColor || null;
  }

  var state={theme:initialTheme(),fontSize:initialFont(),iconScale:initialIcon(),accentColor:initialAccent()};

  /* This boot style is inserted synchronously before any later stylesheet can
     add transitions or animations. It remains until the document has painted
     once, preventing the light->dark transition and spinner/keyframe flash. */
  var BOOT_STYLE_ID='kyn-theme-boot-style';
  function beginBoot(doc) {
    try {
      if (!doc || !doc.head || !doc.documentElement) return;
      var root=doc.documentElement;
      root.classList.add('kyn-theme-boot');
      var s=doc.getElementById(BOOT_STYLE_ID);
      if (!s) { s=doc.createElement('style'); s.id=BOOT_STYLE_ID; doc.head.appendChild(s); }
      s.textContent='html.kyn-theme-boot,html.kyn-theme-boot *{transition:none!important;animation:none!important;caret-color:transparent!important}html.kyn-theme-boot,html.kyn-theme-boot body{color-scheme:'+state.theme+'!important}';
    } catch (_) {}
  }
  function endBoot(doc) {
    try {
      var root=doc&&doc.documentElement;
      if (!root) return;
      var release=function(){ root.classList.remove('kyn-theme-boot'); var s=doc.getElementById(BOOT_STYLE_ID); if(s&&s.parentNode)s.parentNode.removeChild(s); };
      var w=doc.defaultView||global;
      if(w&&w.requestAnimationFrame) w.requestAnimationFrame(function(){w.requestAnimationFrame(release);}); else setTimeout(release,80);
    } catch (_) {}
  }

  function paintNow(theme,fontSize,accent,iconScale,doc) {
    doc=doc||document;
    var root=doc.documentElement;
    var palette=PALETTES[theme];
    root.setAttribute('data-theme',theme);
    root.classList.toggle('theme-dark',theme==='dark');
    root.classList.toggle('dark-theme',theme==='dark');
    root.style.colorScheme=theme;
    Object.keys(palette).forEach(function(k){root.style.setProperty(k,palette[k]);});
    root.style.fontSize=fontSize+'px';
    root.style.setProperty('--base-font-size',fontSize+'px');
    root.setAttribute('data-icon-size',iconScale);
    root.style.setProperty('--icon-scale',String(ICONS[iconScale]));
    if(accent){root.style.setProperty('--primary-color',accent);root.style.setProperty('--kyn-accent-primary',accent);}
    if(doc.body) { doc.body.setAttribute('data-theme',theme); doc.body.classList.toggle('dark-theme',theme==='dark'); }
    var meta=doc.querySelector('meta[name="theme-color"]');
    if(!meta){meta=doc.createElement('meta');meta.name='theme-color';(doc.head||doc.documentElement).appendChild(meta);}
    meta.content=palette['--kyn-bg-root'];
  }

  beginBoot(document);
  /* First paint is atomic. The old engine deliberately skipped transition
     suppression while unlocked; that was the source of the cold-boot flash. */
  paintNow(state.theme,state.fontSize,state.accentColor,state.iconScale,document);
  state.ready=true;

  function atomicPaint(reason) {
    beginBoot(document);
    paintNow(state.theme,state.fontSize,state.accentColor,state.iconScale,document);
    endBoot(document);
    if(reason) notify(reason);
  }
  function notify(reason){
    var detail={theme:state.theme,fontSize:state.fontSize,iconScale:state.iconScale,reason:reason||'update'};
    listeners.slice().forEach(function(fn){try{fn(detail);}catch(_) {}});
    try{document.dispatchEvent(new CustomEvent('kyn:themechange',{detail:detail}));}catch(_){}
  }
  var listeners=[];

  function injectFrame(frame,page){
    try{
      if(!frame||!frame.contentWindow)return;
      var doc=frame.contentDocument||frame.contentWindow.document;if(!doc||!doc.documentElement)return;
      beginBoot(doc);
      paintNow(state.theme,state.fontSize,state.accentColor,state.iconScale,doc);
      if(doc.body){doc.body.setAttribute('data-parent-shell','true');doc.body.setAttribute('data-parent-module',page||'');}
      doc.documentElement.setAttribute('data-parent-shell','true');
      doc.documentElement.setAttribute('data-parent-module',page||'');
      endBoot(doc);
    }catch(_){}
  }

  var ThemeManager={
    __kynEngine:true,
    getTheme:function(){return state.theme;},
    getFontSize:function(){return state.fontSize;},
    getAccentColor:function(){return state.accentColor;},
    getIconScale:function(){return state.iconScale;},
    setTheme:function(v,opts){var n=validateTheme(v);if(n===state.theme&&!(opts&&opts.force))return n;state.theme=n;set(THEME_KEY,n);atomicPaint('theme');return n;},
    setFontSize:function(v){var n=validateFont(v);if(n===state.fontSize)return n;state.fontSize=n;set(FONT_KEY,String(n));atomicPaint('fontSize');return n;},
    setIconScale:function(v){var n=validateIcon(v);if(n===state.iconScale)return n;state.iconScale=n;set(ICON_KEY,n);atomicPaint('iconScale');return n;},
    setAccentColor:function(v){if(!v||v===state.accentColor)return state.accentColor;state.accentColor=v;atomicPaint('accentColor');return v;},
    onChange:function(fn){if(typeof fn!=='function')return function(){};listeners.push(fn);return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},
    broadcastToIframe:function(frame,page){injectFrame(frame,page||frame.dataset&&frame.dataset.module);},
    broadcastToAllIframes:function(selector){try{document.querySelectorAll(selector||'iframe.content-iframe,iframe').forEach(function(f){injectFrame(f,f.dataset&&f.dataset.module);});}catch(_) {}}
  };

  global.addEventListener('storage',function(e){
    if(!e||!e.key)return;
    if(e.key===THEME_KEY){var t=validateTheme(e.newValue);if(t!==state.theme){state.theme=t;atomicPaint('theme-cross-tab');}}
    else if(e.key===FONT_KEY){var f=validateFont(e.newValue);if(f!==state.fontSize){state.fontSize=f;atomicPaint('fontSize-cross-tab');}}
    else if(e.key===ICON_KEY){var i=validateIcon(e.newValue);if(i!==state.iconScale){state.iconScale=i;atomicPaint('iconScale-cross-tab');}}
  });

  global.addEventListener('message',function(e){
    var d=e&&e.data;if(!d||typeof d!=='object')return;
    if(d.type==='THEME_CHANGED'&&d.theme){ThemeManager.setTheme(d.theme);ThemeManager.broadcastToAllIframes();}
    else if(d.type==='FONT_SIZE_CHANGED'&&d.fontSize){ThemeManager.setFontSize(d.fontSize);ThemeManager.broadcastToAllIframes();}
    else if(d.type==='ICON_SCALE_CHANGED'&&d.iconScale){ThemeManager.setIconScale(d.iconScale);ThemeManager.broadcastToAllIframes();}
  });

  global.addEventListener('DOMContentLoaded',function(){try{if(document.body){document.body.setAttribute('data-theme',state.theme);document.body.classList.toggle('dark-theme',state.theme==='dark');}ThemeManager.broadcastToAllIframes();endBoot(document);}catch(_){}},{once:true});
  global.addEventListener('load',function(){try{ThemeManager.broadcastToAllIframes();endBoot(document);}catch(_){}},{once:true});

  global.ThemeManager=ThemeManager;
  global.ThemeEngine=ThemeManager;
})(window);
