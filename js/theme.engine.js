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
    var ACCENT_LEGACY_KEY = 'app_settings_global';
    var SETTINGS_CACHE_KEY = 'knecta_settings_cache';
    var SETTINGS_CACHE_KEY_LEGACY = 'moodchat_settings_default';
    var VALID_THEMES = { light: true, dark: true };
    var MIN_FONT = 10;
    var MAX_FONT = 28;
    var DEFAULT_FONT = 16;

    // Palette mirrors theme.colors.css exactly. Kept here (and only here)
    // so first paint never has to wait on the theme.colors.css network
    // request. If theme.colors.css's palette ever changes, update it here
    // too — this is intentionally the single other place these values live.
    var PALETTES = {
        dark: {
            '--kyn-bg-root': '#0f172a', '--kyn-bg-chat': '#020617', '--kyn-bg-header': '#0f172a',
            '--kyn-text-primary': '#e5e7eb', '--kyn-text-secondary': '#9ca3af',
            '--kyn-border': '#374151',
            '--bg-color': '#0f172a', '--text-primary': '#e5e7eb'
        },
        light: {
            '--kyn-bg-root': '#ffffff', '--kyn-bg-chat': '#efeae2', '--kyn-bg-header': '#f0f2f5',
            '--kyn-text-primary': '#111b21', '--kyn-text-secondary': '#667781',
            '--kyn-border': '#e9edef',
            '--bg-color': '#ffffff', '--text-primary': '#111b21'
        }
    };

    var IFRAME_SHELL_VARS = {
        dark: {
            '--primary-color': '#22c55e', '--primary-dark': '#16a34a', '--primary-light': '#166534',
            '--secondary-color': '#1e293b', '--background-color': '#0f172a', '--surface-color': '#1e293b',
            '--card-background': '#1e293b', '--border-color': '#374151', '--text-primary': '#e5e7eb',
            '--text-secondary': '#9ca3af', '--accent-color': '#8b5cf6', '--accent-soft': '#1e293b',
            '--header-gradient': 'linear-gradient(135deg, #0f172a 0%, #1e293b 62%, #0f172a 100%)'
        },
        light: {
            '--primary-color': '#22c55e', '--primary-dark': '#16a34a', '--primary-light': '#dcfce7',
            '--secondary-color': '#f0f2f5', '--background-color': '#ffffff', '--surface-color': '#ffffff',
            '--card-background': '#ffffff', '--border-color': '#d1d7db', '--text-primary': '#111b21',
            '--text-secondary': '#667781', '--accent-color': '#8b5cf6', '--accent-soft': '#f5f3ff',
            '--header-gradient': 'linear-gradient(135deg, #ffffff 0%, #f0f2f5 62%, #ffffff 100%)'
        }
    };

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

    // ---- Apply (paint-critical, synchronous, idempotent) -------------------

    function paint(theme, fontSize, accentColor) {
        var root = document.documentElement;
        root.setAttribute('data-theme', theme);
        root.classList.toggle('theme-dark', theme === 'dark');
        root.classList.toggle('dark-theme', theme === 'dark');
        root.style.colorScheme = theme;

        var palette = PALETTES[theme];
        for (var k in palette) {
            if (Object.prototype.hasOwnProperty.call(palette, k)) {
                root.style.setProperty(k, palette[k]);
            }
        }

        root.style.fontSize = fontSize + 'px';
        root.style.setProperty('--base-font-size', fontSize + 'px');

        if (accentColor) {
            root.style.setProperty('--primary-color', accentColor);
            root.style.setProperty('--kyn-accent-primary', accentColor);
        }

        if (document.body) {
            document.body.classList.toggle('dark-theme', theme === 'dark');
        }
    }

    // ---- Engine state (locked after init) -----------------------------------

    var state = {
        theme: resolveInitialTheme(),
        fontSize: resolveInitialFontSize(),
        accentColor: resolveInitialAccent(),
        locked: false
    };

    // Paint immediately at script-evaluation time — this script is loaded
    // synchronously as the first thing in <head>, before any CSS, so this
    // is the very first paint-affecting work the page does. Nothing renders
    // before this line has run.
    paint(state.theme, state.fontSize, state.accentColor);
    state.locked = true;

    var listeners = [];

    function notify(reason) {
        var detail = { theme: state.theme, fontSize: state.fontSize, reason: reason || 'update' };
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

        // The ONLY function in the app allowed to persist a theme change.
        setTheme: function (theme, opts) {
            var resolved = validateTheme(theme);
            if (resolved === state.theme && !(opts && opts.force)) return state.theme;
            state.theme = resolved;
            safeSet(THEME_KEY, resolved);
            paint(state.theme, state.fontSize, state.accentColor);
            notify('theme');
            return state.theme;
        },

        // The ONLY function in the app allowed to persist a font-size change.
        setFontSize: function (size) {
            var resolved = validateFontSize(size);
            if (resolved === state.fontSize) return state.fontSize;
            state.fontSize = resolved;
            safeSet(FONT_KEY, String(resolved));
            paint(state.theme, state.fontSize, state.accentColor);
            notify('fontSize');
            return state.fontSize;
        },

        // The ONLY function in the app allowed to persist an accent-color
        // change (does not touch the legacy 'app_settings_global' blob —
        // that remains owned by the settings backend sync; this only
        // affects the live-painted CSS variables for this session).
        setAccentColor: function (color) {
            if (!color || color === state.accentColor) return state.accentColor;
            state.accentColor = color;
            paint(state.theme, state.fontSize, state.accentColor);
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

                doc.documentElement.setAttribute('data-theme', theme);
                doc.documentElement.classList.toggle('theme-dark', isDark);
                doc.documentElement.classList.toggle('dark-theme', isDark);
                if (doc.body) doc.body.classList.toggle('dark-theme', isDark);
                doc.documentElement.style.setProperty('--base-font-size', state.fontSize + 'px');

                if (doc.head) {
                    var style = doc.getElementById('kyn-theme-inline');
                    if (!style) {
                        style = doc.createElement('style');
                        style.id = 'kyn-theme-inline';
                        doc.head.insertBefore(style, doc.head.firstChild);
                    }
                    style.textContent = isDark ? IFRAME_OVERRIDE_CSS_DARK : IFRAME_OVERRIDE_CSS_LIGHT;
                }
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
                paint(state.theme, state.fontSize, state.accentColor);
                notify('theme-cross-tab');
            }
        } else if (e.key === FONT_KEY) {
            var fs = validateFontSize(e.newValue);
            if (fs !== state.fontSize) {
                state.fontSize = fs;
                paint(state.theme, state.fontSize, state.accentColor);
                notify('fontSize-cross-tab');
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
        }
    });

    global.ThemeManager = ThemeManager;
    // Backward-compatible alias used by some existing call sites.
    global.ThemeEngine = ThemeManager;
})(window);