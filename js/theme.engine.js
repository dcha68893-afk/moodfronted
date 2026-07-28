/**
 * ============================================================================
 * KYNECTA THEME ENGINE — single source of truth for theme + font size.
 * ============================================================================
 *
 * WHY THIS FILE EXISTS
 * Before this, every page (index/chat/friend/group/calls/message/status/
 * Tools/game/settings) carried its OWN copy-pasted pre-paint script, and
 * FIVE separate files (settingsManager.js, AppSettings.js, settings-ui.js,
 * settings-core.js x2) each had their own independent applyTheme() that read
 * AND wrote localStorage('app_theme') and toggled data-theme/.theme-dark
 * themselves. That is exactly the "everyone reads their own copy of the
 * theme" anti-pattern: nine copies of the same logic that could silently
 * drift out of sync, plus five independent writers racing each other.
 *
 * This file is the ONLY code in the app that is allowed to read or write
 * the 'app_theme' / 'app_font_size' localStorage keys. Every other module —
 * header, sidebar, main body, iframes, popups, modals, notifications, call
 * screen, marketplace, groups, messages, friends — reads the theme from
 * `window.ThemeManager` (or the `data-theme` attribute / CSS variables it
 * already set) instead of touching storage directly.
 *
 * LOADING ORDER (must be the very first <script> in every page's <head>,
 * before any stylesheet, and loaded synchronously — no `defer`/`async` —
 * so the theme is already resolved and applied before first paint):
 *
 *   App starts
 *     -> load theme engine
 *     -> read theme from storage ONCE
 *     -> validate theme
 *     -> apply CSS variables + data-theme attribute
 *     -> lock (freeze) the resolved theme object
 *     -> render UI (rest of <head>/<body> continues parsing)
 *     -> mount header / sidebar / iframe / footer (all read the same
 *        frozen object — no independent re-reads)
 *
 * NO POLLING. Theme never changes on its own — no setInterval, no
 * setTimeout retry loop, no MutationObserver, no repeated localStorage
 * reads. It changes exactly once per explicit user action, and that change
 * is broadcast a single time to every listener (same document, iframes,
 * and other open tabs).
 * ============================================================================
 */
(function (global) {
    'use strict';

    if (global.ThemeManager && global.ThemeManager.__kynEngine) {
        // Engine already initialized on this document (e.g. script included
        // twice by accident) — never re-run init, never double-broadcast.
        return;
    }

    var THEME_KEY = 'app_theme';
    var FONT_KEY = 'app_font_size';
    var ICON_KEY = 'app_icon_scale';
    var ACCENT_LEGACY_KEY = 'app_settings_global';
    var SETTINGS_CACHE_KEY = 'knecta_settings_cache';
    var SETTINGS_CACHE_KEY_LEGACY = 'nexopa_settings_default';
    var VALID_THEMES = { light: true, dark: true };
    var MIN_FONT = 10;
    var MAX_FONT = 28;
    var DEFAULT_FONT = 16;
    // Icon size settings (item 4): stored as a named scale, mapped to a
    // single --icon-scale multiplier every icon-bearing element (header,
    // sidebar, bottom nav, message/status icons, marketplace, calls,
    // settings, menus, floating buttons) reads via theme.colors.css /
    // per-module CSS. Same single-source-of-truth rule as font size above:
    // this engine is the ONLY code allowed to read/write 'app_icon_scale'.
    var ICON_SCALE_MAP = { small: 0.85, medium: 1, large: 1.2, xl: 1.4 };
    var DEFAULT_ICON_SCALE = 'medium';

    // ------------------------------------------------------------------
    // SINGLE COMPLETE PALETTE — mirrors theme.colors.css's FULL variable
    // set exactly (every --kyn-* variable it defines, not a subset), plus
    // every generic alias (--bg-color, --primary-color, --card-background,
    // etc.) any module page or its CSS references directly.
    //
    // FIX (remaining spark source): the previous version of this file only
    // inlined 6 --kyn-* variables even though theme.colors.css actually
    // defines 35+ of them (accents, panel/card/input/modal/sidebar
    // backgrounds, chat-bubble colors, scrollbar colors, shadows,
    // gradients...). Every element styled ONLY through one of those other
    // ~29 variables had nothing to read until theme.colors.css finished
    // its network request and parsed — a real, visible "unstyled -> themed"
    // pop for buttons, cards, panels, chat bubbles, scrollbars and
    // gradients on every fresh load, exactly the reported sparking. A
    // second, different value set (the old IFRAME_SHELL_VARS) was only
    // applied when the parent shell injected a theme into a child iframe,
    // so a module opened directly showed one palette, then a slightly
    // different one if/when opened inside the parent shell. Both are
    // fixed by using exactly ONE object for a page's own self-paint AND
    // for parent-to-iframe injection.
    // ------------------------------------------------------------------
    var PALETTES = {
        dark: {
            '--kyn-bg-root': '#0f172a', '--kyn-bg-chat': '#020617', '--kyn-bg-panel': '#1e293b',
            '--kyn-bg-card': '#1e293b', '--kyn-bg-input': '#1e293b', '--kyn-bg-sidebar': '#0f172a',
            '--kyn-bg-header': '#0f172a', '--kyn-bg-modal': '#1e293b',
            '--kyn-bg-overlay': 'rgba(0, 0, 0, 0.65)', '--kyn-bg-hover': 'rgba(255, 255, 255, 0.06)',
            '--kyn-bg-active': 'rgba(255, 255, 255, 0.10)',
            '--kyn-text-primary': '#e5e7eb', '--kyn-text-secondary': '#9ca3af',
            '--kyn-text-muted': '#6b7280', '--kyn-text-inverse': '#0f172a',
            '--kyn-text-placeholder': '#9ca3af',
            '--kyn-border': '#374151', '--kyn-border-light': 'rgba(255,255,255,0.08)',
            '--kyn-border-strong': '#4b5563',
            '--kyn-accent-primary': '#22c55e', '--kyn-accent-secondary': '#2563eb',
            '--kyn-accent-danger': '#ef4444', '--kyn-accent-warning': '#f59e0b',
            '--kyn-accent-info': '#38bdf8', '--kyn-accent-purple': '#8b5cf6',
            '--kyn-bubble-sent': '#005c4b', '--kyn-bubble-sent-text': '#e5e7eb',
            '--kyn-bubble-recv': '#1e293b', '--kyn-bubble-recv-text': '#e5e7eb',
            '--kyn-scrollbar-track': '#1e293b', '--kyn-scrollbar-thumb': '#374151',
            '--kyn-shadow-sm': '0 2px 8px rgba(0,0,0,0.4)', '--kyn-shadow-md': '0 8px 24px rgba(0,0,0,0.5)',
            '--kyn-shadow-lg': '0 16px 48px rgba(0,0,0,0.6)',
            '--kyn-gradient-primary': 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 62%, #06b6d4 100%)',
            '--kyn-gradient-sidebar': 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
            '--kyn-gradient-header': 'linear-gradient(135deg, rgba(15,23,42,0.97), rgba(30,41,59,0.97))',

            /* FIX (footer nav "sparkle"): the bottom mobile-nav-bar in
               chat.html used to hardcode a permanently-dark gradient/ring
               (rgba(10,13,22,...)) with no light-mode counterpart, so in
               light theme the header/body went light but the footer stayed
               black — a jarring seam at the bottom edge that read as
               "sparkling". These variables give the footer bar the same
               theme-follows-data-theme treatment the header already has. */
            '--kyn-bg-navbar': 'linear-gradient(180deg, rgba(10,13,22,0.98) 0%, rgba(13,17,28,0.99) 100%)',
            '--kyn-navbar-border': 'rgba(255,255,255,0.06)',
            '--kyn-navbar-ring': 'rgba(10,13,22,0.98)',
            '--kyn-navbar-notch-shadow': 'rgba(13,17,26,0.97)',
            '--kyn-navbar-icon-inactive': 'rgba(148,163,184,0.55)',

            '--bg-color': '#0f172a', '--text-primary': '#e5e7eb', '--text-color': '#e5e7eb',
            '--text-secondary': '#9ca3af', '--sidebar-bg': '#0f172a', '--card-bg': '#1e293b',
            '--border-color': '#374151', '--hover-color': '#1f2c33',
            '--primary-color': '#22c55e', '--primary-dark': '#16a34a', '--primary-light': '#166534',
            '--secondary-color': '#1e293b', '--background-color': '#0f172a', '--surface-color': '#1e293b',
            '--card-background': '#1e293b', '--accent-color': '#8b5cf6', '--accent-soft': '#1e293b',
            '--header-gradient': 'linear-gradient(135deg, #0f172a 0%, #1e293b 62%, #0f172a 100%)'
        },
        light: {
            '--kyn-bg-root': '#ffffff', '--kyn-bg-chat': '#efeae2', '--kyn-bg-panel': '#ffffff',
            '--kyn-bg-card': '#ffffff', '--kyn-bg-input': '#f0f2f5', '--kyn-bg-sidebar': '#ffffff',
            '--kyn-bg-header': '#f0f2f5', '--kyn-bg-modal': '#ffffff',
            '--kyn-bg-overlay': 'rgba(0, 0, 0, 0.45)', '--kyn-bg-hover': 'rgba(0, 0, 0, 0.04)',
            '--kyn-bg-active': 'rgba(0, 0, 0, 0.08)',
            '--kyn-text-primary': '#111b21', '--kyn-text-secondary': '#667781',
            '--kyn-text-muted': '#8696a0', '--kyn-text-inverse': '#ffffff',
            '--kyn-text-placeholder': '#8696a0',
            '--kyn-border': '#e9edef', '--kyn-border-light': 'rgba(0,0,0,0.06)',
            '--kyn-border-strong': '#d1d7db',
            '--kyn-accent-primary': '#22c55e', '--kyn-accent-secondary': '#2563eb',
            '--kyn-accent-danger': '#ef4444', '--kyn-accent-warning': '#f59e0b',
            '--kyn-accent-info': '#38bdf8', '--kyn-accent-purple': '#8b5cf6',
            '--kyn-bubble-sent': '#d9fdd3', '--kyn-bubble-sent-text': '#111b21',
            '--kyn-bubble-recv': '#ffffff', '--kyn-bubble-recv-text': '#111b21',
            '--kyn-scrollbar-track': '#f0f2f5', '--kyn-scrollbar-thumb': '#d1d7db',
            '--kyn-shadow-sm': '0 2px 8px rgba(0,0,0,0.08)', '--kyn-shadow-md': '0 8px 24px rgba(0,0,0,0.12)',
            '--kyn-shadow-lg': '0 16px 48px rgba(0,0,0,0.16)',
            '--kyn-gradient-primary': 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 62%, #06b6d4 100%)',
            '--kyn-gradient-sidebar': 'linear-gradient(180deg, #ffffff 0%, #f0f2f5 100%)',
            '--kyn-gradient-header': 'linear-gradient(135deg, rgba(255,255,255,0.97), rgba(240,242,245,0.97))',

            /* FIX (footer nav "sparkle") — light-theme counterpart. See the
               matching comment in the dark palette above for the root cause. */
            '--kyn-bg-navbar': 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(240,242,245,0.99) 100%)',
            '--kyn-navbar-border': 'rgba(15,23,42,0.08)',
            '--kyn-navbar-ring': 'rgba(255,255,255,0.98)',
            '--kyn-navbar-notch-shadow': 'rgba(248,250,252,0.97)',
            '--kyn-navbar-icon-inactive': 'rgba(100,116,139,0.65)',

            '--bg-color': '#ffffff', '--text-primary': '#111b21', '--text-color': '#111b21',
            '--text-secondary': '#667781', '--sidebar-bg': '#ffffff', '--card-bg': '#ffffff',
            '--border-color': '#d1d7db', '--hover-color': '#f5f5f5',
            '--primary-color': '#22c55e', '--primary-dark': '#16a34a', '--primary-light': '#dcfce7',
            '--secondary-color': '#f0f2f5', '--background-color': '#ffffff', '--surface-color': '#ffffff',
            '--card-background': '#ffffff', '--accent-color': '#8b5cf6', '--accent-soft': '#f5f3ff',
            '--header-gradient': 'linear-gradient(135deg, #ffffff 0%, #f0f2f5 62%, #ffffff 100%)'
        }
    };

    // Iframe shell injection now reads from the exact same PALETTES object
    // used for a page's own self-paint above — kept as an alias (rather
    // than deleting every call site below) so there is no longer any way
    // for a standalone page load and a parent-injected iframe to disagree
    // on a single color.
    var IFRAME_SHELL_VARS = PALETTES;

    var IFRAME_OVERRIDE_CSS_DARK =
        'html, body { background: #0f172a !important; color: #e5e7eb !important; }' +
        '.app-container, .main-content, .content-area, .page-wrapper { background: #0f172a !important; }' +
        ':root { --bg-color: #0f172a !important; --text-primary: #e5e7eb !important; --text-secondary: #9ca3af !important;' +
        ' --border-color: #374151 !important; --secondary-color: #1e293b !important; --kynecta-light: #0f172a !important;' +
        ' --kynecta-dark: #e5e7eb !important; --kynecta-border: #374151 !important; --offline-overlay: rgba(15,23,42,0.97) !important; }' +
        'input, textarea, select { background: #1e293b !important; color: #e5e7eb !important; border-color: #374151 !important; }' +
        'input::placeholder, textarea::placeholder { color: #9ca3af !important; }';

    var IFRAME_OVERRIDE_CSS_LIGHT =
        'html, body { background: #ffffff !important; color: #111b21 !important; }' +
        '.app-container, .main-content, .content-area, .page-wrapper { background: #ffffff !important; }' +
        ':root { --bg-color: #ffffff !important; --text-primary: #111b21 !important; --text-secondary: #667781 !important;' +
        ' --border-color: #d1d7db !important; --secondary-color: #f0f2f5 !important; --kynecta-light: #ffffff !important;' +
        ' --kynecta-dark: #111b21 !important; --kynecta-border: #d1d7db !important; --offline-overlay: rgba(255,255,255,0.97) !important; }' +
        'input, textarea, select { background: #f0f2f5 !important; color: #111b21 !important; border-color: #d1d7db !important; }' +
        'input::placeholder, textarea::placeholder { color: #667781 !important; }';

    function safeGet(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }
    function safeSet(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
    }

    // Reads the settings cache as a fallback ONLY — this is still part of
    // the single read-once step, not a second independent source that could
    // disagree with the first.
    function readSettingsCache() {
        var raw = safeGet(SETTINGS_CACHE_KEY);
        if (raw) {
            try {
                var parsed = JSON.parse(raw);
                return parsed.data || parsed || null;
            } catch (_) {}
        }
        // Legacy fallbacks — still read exactly once, as part of the same
        // single resolution step, never re-checked afterwards.
        var legacy = safeGet(ACCENT_LEGACY_KEY);
        if (legacy) {
            try {
                var p = JSON.parse(legacy);
                if (p && p.data) return p.data;
            } catch (_) {}
        }
        var legacy2 = safeGet(SETTINGS_CACHE_KEY_LEGACY);
        if (legacy2) {
            try { return JSON.parse(legacy2); } catch (_) {}
        }
        return null;
    }

    function resolveInitialAccent() {
        var raw = safeGet(ACCENT_LEGACY_KEY);
        if (!raw) return null;
        try {
            var p = JSON.parse(raw);
            return (p && p.data && p.data.appearance && p.data.appearance.accentColor) || null;
        } catch (_) { return null; }
    }

    function validateTheme(raw) {
        // Any legacy/unrecognized value (including the removed 'auto') is
        // rejected here — this is the ONE validation step; nothing downstream
        // re-validates or re-interprets the theme value.
        return VALID_THEMES[raw] ? raw : 'light';
    }

    function validateFontSize(raw) {
        var n = parseInt(raw, 10);
        if (!n || isNaN(n) || n < MIN_FONT || n > MAX_FONT) return DEFAULT_FONT;
        return n;
    }

    function validateIconScale(raw) {
        return ICON_SCALE_MAP.hasOwnProperty(raw) ? raw : DEFAULT_ICON_SCALE;
    }

    function resolveInitialTheme() {
        var raw = safeGet(THEME_KEY);
        if (!raw) {
            var cache = readSettingsCache();
            raw = cache && ((cache.appearance && cache.appearance.theme) || cache.theme);
        }
        return validateTheme(raw);
    }

    function resolveInitialFontSize() {
        var raw = safeGet(FONT_KEY);
        if (!raw) {
            var cache = readSettingsCache();
            raw = cache && cache.appearance && cache.appearance.fontSize;
        }
        return validateFontSize(raw);
    }

    function resolveInitialIconScale() {
        var raw = safeGet(ICON_KEY);
        if (!raw) {
            var cache = readSettingsCache();
            raw = cache && cache.appearance && cache.appearance.iconSize;
        }
        return validateIconScale(raw);
    }

    // ---- Apply (paint-critical, synchronous, idempotent) -------------------

    // ROOT CAUSE OF THE VISIBLE "SPARKLE/BLINK" ON THEME SWAP, REFRESH AND
    // RELOGIN: every module stylesheet (chat.css, calls.css, Tool.css,
    // friend.css, group.css, status.css, messages.css, settings.css,
    // responsive.css...) has its own `transition: background-color .2s`,
    // `transition: color .2s ease` etc. rules sprinkled on buttons, cards,
    // rows, headers — usually intended for hover/press feedback, not theme
    // changes. Those properties are also exactly the ones the CSS variables
    // this engine sets feed into. So even though every CSS variable updates
    // in the same synchronous paint() call below, each element with its own
    // transition duration/easing animates its own repaint over ~0.2-0.3s
    // independently — hundreds of elements crossfading on their own
    // schedule reads as staggered blinking/sparkling instead of one instant
    // change. This is NOT specific to a live toggle: on refresh/relogin the
    // very first paint is genuinely instant (this script runs synchronously
    // before any stylesheet), but any element whose class/module CSS hasn't
    // finished parsing yet still lands on those same transitioned
    // properties once it does, producing the identical visible effect.
    //
    // Fix: for the brief moment paint() is actually changing something,
    // force every element's transitions off, apply the new theme in that
    // frozen frame, then release the freeze one frame later so normal
    // hover/press transitions are completely unaffected during regular use.
    var TRANSITION_SUPPRESS_ID = 'kyn-theme-suppress-transitions';

    function suppressTransitions(doc) {
        try {
            if (!doc || !doc.head) return;
            var style = doc.getElementById(TRANSITION_SUPPRESS_ID);
            if (!style) {
                style = doc.createElement('style');
                style.id = TRANSITION_SUPPRESS_ID;
                doc.head.appendChild(style);
            }
            style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
        } catch (_) {}
    }

    function releaseTransitions(doc) {
        try {
            if (!doc) return;
            var style = doc.getElementById(TRANSITION_SUPPRESS_ID);
            if (style && style.parentNode) style.parentNode.removeChild(style);
        } catch (_) {}
    }

    // Suppress on this document, force one synchronous layout so the browser
    // commits "transitions off" before the new colors are applied (otherwise
    // the off-then-on could still be batched into the same animation frame
    // as the color change and not actually prevent it), then release after
    // the paint has had a frame to land.
    function withTransitionsSuppressed(doc, fn) {
        var win = (doc && doc.defaultView) || global;
        suppressTransitions(doc);
        try { if (doc && doc.documentElement) { void doc.documentElement.offsetHeight; } } catch (_) {}
        fn();
        var release = function () { releaseTransitions(doc); };
        // Two rAFs is the standard "wait for the new styles to actually
        // paint" signal; falls back to a short timeout if rAF is unavailable
        // (e.g. a not-yet-visible iframe document). Driven by the target
        // document's own window so a background/inactive iframe (whose rAF
        // can be throttled differently than the parent's) still releases.
        try {
            if (win && win.requestAnimationFrame) {
                win.requestAnimationFrame(function () { win.requestAnimationFrame(release); });
            } else {
                setTimeout(release, 50);
            }
        } catch (_) {
            setTimeout(release, 50);
        }
    }

    // A handful of generic (non --kyn-*) variable names are used by more
    // than one page for genuinely DIFFERENT purposes — most notably
    // index.html's dashboard, which intentionally keeps its own distinct
    // purple/blue brand look (see THEME_FIX_CHANGELOG.md) rather than the
    // green/purple accent the chat interior and its module iframes share.
    // A page can opt out of having the engine set just these generic
    // brand aliases (it still gets the full --kyn-* palette and the
    // always-shared bg/text/border aliases) by setting this flag in an
    // inline <script> BEFORE theme.engine.js is loaded:
    //   <script>window.__kynSkipGenericAccentVars = true;</script>
    var GENERIC_BRAND_KEYS = {
        '--primary-color': 1, '--primary-dark': 1, '--primary-light': 1,
        '--secondary-color': 1, '--background-color': 1, '--surface-color': 1,
        '--card-background': 1, '--accent-color': 1, '--accent-soft': 1,
        '--header-gradient': 1
    };

    function paintNow(theme, fontSize, accentColor, iconScale) {
        var root = document.documentElement;
        root.setAttribute('data-theme', theme);
        root.classList.toggle('theme-dark', theme === 'dark');
        root.classList.toggle('dark-theme', theme === 'dark');
        root.style.colorScheme = theme;

        var skipBrand = global.__kynSkipGenericAccentVars === true;
        var palette = PALETTES[theme];
        for (var k in palette) {
            if (Object.prototype.hasOwnProperty.call(palette, k)) {
                if (skipBrand && GENERIC_BRAND_KEYS[k]) continue;
                root.style.setProperty(k, palette[k]);
            }
        }

        root.style.fontSize = fontSize + 'px';
        root.style.setProperty('--base-font-size', fontSize + 'px');

        var scaleName = validateIconScale(iconScale);
        root.setAttribute('data-icon-size', scaleName);
        root.style.setProperty('--icon-scale', String(ICON_SCALE_MAP[scaleName]));

        if (accentColor) {
            root.style.setProperty('--primary-color', accentColor);
            root.style.setProperty('--kyn-accent-primary', accentColor);
        }

        if (document.body) {
            document.body.classList.toggle('dark-theme', theme === 'dark');
        }
    }

    function paint(theme, fontSize, accentColor, iconScale) {
        // The very first paint (script-evaluation time, before state.locked
        // is set below) has nothing on screen yet to visibly fade from, so
        // it runs at full speed with no suppression overhead. Every paint
        // after that is a real, visible update (toggle, cross-tab sync,
        // settings-fetch correction, etc.) and goes through the
        // transition-freeze so it lands as one instant change instead of
        // however many independently-timed CSS transitions the touched
        // elements happen to carry.
        if (!state.locked) {
            paintNow(theme, fontSize, accentColor, iconScale);
            return;
        }
        withTransitionsSuppressed(document, function () {
            paintNow(theme, fontSize, accentColor, iconScale);
        });
    }

    // ---- Engine state (locked after init) -----------------------------------

    var state = {
        theme: resolveInitialTheme(),
        fontSize: resolveInitialFontSize(),
        accentColor: resolveInitialAccent(),
        iconScale: resolveInitialIconScale(),
        locked: false
    };

    // Paint immediately at script-evaluation time — this script is loaded
    // synchronously as the first thing in <head>, before any CSS, so this
    // is the very first paint-affecting work the page does. Nothing renders
    // before this line has run.
    paint(state.theme, state.fontSize, state.accentColor, state.iconScale);
    state.locked = true;

    var listeners = [];

    function notify(reason) {
        var detail = { theme: state.theme, fontSize: state.fontSize, iconScale: state.iconScale, reason: reason || 'update' };
        // Single, one-time broadcast per change — not a loop, not a poll.
        listeners.forEach(function (fn) {
            try { fn(detail); } catch (_) {}
        });
        try {
            document.dispatchEvent(new CustomEvent('kyn:themechange', { detail: detail }));
        } catch (_) {}
    }

    // ---- Public API ----------------------------------------------------------

    var ThemeManager = {
        __kynEngine: true,

        getTheme: function () { return state.theme; },
        getFontSize: function () { return state.fontSize; },
        getAccentColor: function () { return state.accentColor; },
        getIconScale: function () { return state.iconScale; },

        // The ONLY function in the app allowed to persist a theme change.
        setTheme: function (theme, opts) {
            var resolved = validateTheme(theme);
            if (resolved === state.theme && !(opts && opts.force)) return state.theme;
            state.theme = resolved;
            safeSet(THEME_KEY, resolved);
            paint(state.theme, state.fontSize, state.accentColor, state.iconScale);
            notify('theme');
            return state.theme;
        },

        // The ONLY function in the app allowed to persist a font-size change.
        setFontSize: function (size) {
            var resolved = validateFontSize(size);
            if (resolved === state.fontSize) return state.fontSize;
            state.fontSize = resolved;
            safeSet(FONT_KEY, String(resolved));
            paint(state.theme, state.fontSize, state.accentColor, state.iconScale);
            notify('fontSize');
            return state.fontSize;
        },

        // The ONLY function in the app allowed to persist an icon-scale
        // change. `size` is a named scale: 'small' | 'medium' | 'large' | 'xl'.
        setIconScale: function (size) {
            var resolved = validateIconScale(size);
            if (resolved === state.iconScale) return state.iconScale;
            state.iconScale = resolved;
            safeSet(ICON_KEY, resolved);
            paint(state.theme, state.fontSize, state.accentColor, state.iconScale);
            notify('iconScale');
            return state.iconScale;
        },

        // The ONLY function in the app allowed to persist an accent-color
        // change (does not touch the legacy 'app_settings_global' blob —
        // that remains owned by the settings backend sync; this only
        // affects the live-painted CSS variables for this session).
        setAccentColor: function (color) {
            if (!color || color === state.accentColor) return state.accentColor;
            state.accentColor = color;
            paint(state.theme, state.fontSize, state.accentColor, state.iconScale);
            notify('accentColor');
            return state.accentColor;
        },

        // Subscribe to theme/font-size changes (fires once per real change,
        // never polls). Returns an unsubscribe function.
        onChange: function (fn) {
            if (typeof fn !== 'function') return function () {};
            listeners.push(fn);
            return function () {
                var idx = listeners.indexOf(fn);
                if (idx > -1) listeners.splice(idx, 1);
            };
        },

        // Idempotent push of the current theme into a single child iframe.
        // Safe to call on every iframe load/reapply: it's a no-op if the
        // iframe is already showing the current theme, which is what
        // prevents the double-repaint "spark" that a naive rewrite-every-time
        // implementation causes. `page` (optional) records which module the
        // iframe hosts, for parent-shell attribution markers only.
        broadcastToIframe: function (iframe, page) {
            try {
                if (!iframe || !iframe.contentWindow) return;
                var doc = iframe.contentDocument || iframe.contentWindow.document;
                if (!doc || !doc.documentElement) return;
                var theme = state.theme;
                var isDark = theme === 'dark';
                var alreadyCorrect = doc.documentElement.getAttribute('data-theme') === theme &&
                    doc.getElementById('kyn-theme-inline');

                if (doc.body) {
                    doc.body.setAttribute('data-parent-shell', 'true');
                    doc.body.setAttribute('data-parent-module', page || (iframe.dataset && iframe.dataset.module) || '');
                }
                doc.documentElement.setAttribute('data-parent-shell', 'true');
                doc.documentElement.setAttribute('data-parent-module', page || (iframe.dataset && iframe.dataset.module) || '');

                var shellVars = IFRAME_SHELL_VARS[theme];
                Object.keys(shellVars).forEach(function (key) {
                    doc.documentElement.style.setProperty(key, shellVars[key]);
                    if (doc.body) doc.body.style.setProperty(key, shellVars[key]);
                });

                if (alreadyCorrect) return; // skip the redundant repaint below

                if (!doc.getElementById('kyn-theme-link') && !doc.querySelector('link[href="theme.colors.css"]') && doc.head) {
                    var link = doc.createElement('link');
                    link.id = 'kyn-theme-link';
                    link.rel = 'stylesheet';
                    link.href = 'theme.colors.css';
                    doc.head.insertBefore(link, doc.head.firstChild);
                }

                withTransitionsSuppressed(doc, function () {
                    doc.documentElement.setAttribute('data-theme', theme);
                    doc.documentElement.classList.toggle('theme-dark', isDark);
                    doc.documentElement.classList.toggle('dark-theme', isDark);
                    if (doc.body) doc.body.classList.toggle('dark-theme', isDark);
                    doc.documentElement.style.setProperty('--base-font-size', state.fontSize + 'px');
                    doc.documentElement.setAttribute('data-icon-size', state.iconScale);
                    doc.documentElement.style.setProperty('--icon-scale', String(ICON_SCALE_MAP[state.iconScale]));

                    if (doc.head) {
                        var style = doc.getElementById('kyn-theme-inline');
                        if (!style) {
                            style = doc.createElement('style');
                            style.id = 'kyn-theme-inline';
                            doc.head.insertBefore(style, doc.head.firstChild);
                        }
                        style.textContent = isDark ? IFRAME_OVERRIDE_CSS_DARK : IFRAME_OVERRIDE_CSS_LIGHT;
                    }
                });
            } catch (_) {}
        },

        broadcastToAllIframes: function (selector) {
            try {
                document.querySelectorAll(selector || 'iframe.content-iframe, iframe').forEach(function (f) {
                    ThemeManager.broadcastToIframe(f, f.dataset && f.dataset.module);
                });
            } catch (_) {}
        }
    };

    // Cross-tab sync: this is a reaction to the browser's own 'storage'
    // event (fired once, by the browser, when another tab writes the key) —
    // not a poll. We still only ever read through this single engine.
    global.addEventListener('storage', function (e) {
        if (!e || !e.key) return;
        if (e.key === THEME_KEY) {
            var resolved = validateTheme(e.newValue);
            if (resolved !== state.theme) {
                state.theme = resolved;
                paint(state.theme, state.fontSize, state.accentColor, state.iconScale);
                notify('theme-cross-tab');
            }
        } else if (e.key === FONT_KEY) {
            var fs = validateFontSize(e.newValue);
            if (fs !== state.fontSize) {
                state.fontSize = fs;
                paint(state.theme, state.fontSize, state.accentColor, state.iconScale);
                notify('fontSize-cross-tab');
            }
        } else if (e.key === ICON_KEY) {
            var isz = validateIconScale(e.newValue);
            if (isz !== state.iconScale) {
                state.iconScale = isz;
                paint(state.theme, state.fontSize, state.accentColor, state.iconScale);
                notify('iconScale-cross-tab');
            }
        }
    });

    // Relay THEME_CHANGED/FONT_SIZE_CHANGED postMessages coming from a
    // settings iframe into this engine, so the parent shell (and everything
    // it in turn broadcasts to sibling iframes) has exactly one entry point.
    global.addEventListener('message', function (event) {
        var data = event && event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'THEME_CHANGED' && data.theme) {
            ThemeManager.setTheme(data.theme);
            ThemeManager.broadcastToAllIframes();
        } else if (data.type === 'FONT_SIZE_CHANGED' && data.fontSize) {
            ThemeManager.setFontSize(data.fontSize);
            ThemeManager.broadcastToAllIframes();
        } else if (data.type === 'ICON_SCALE_CHANGED' && data.iconScale) {
            ThemeManager.setIconScale(data.iconScale);
            ThemeManager.broadcastToAllIframes();
        }
    });

    global.ThemeManager = ThemeManager;
    // Backward-compatible alias used by some existing call sites.
    global.ThemeEngine = ThemeManager;
})(window);