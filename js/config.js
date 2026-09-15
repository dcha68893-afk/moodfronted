// js/config.js - single runtime configuration gateway
// All backend URLs come from the generated runtime configuration.
(function () {
    'use strict';

    const runtime = window.__NEXIPA_RUNTIME_CONFIG__ || {};
    const configuredOrigin = String(runtime.BACKEND_URL || '').trim().replace(/\/+$/, '');

    if (!configuredOrigin) {
        console.error('[Config] BACKEND_URL is missing. Run the frontend build and configure it in .env.');
    }

    function requireBackendOrigin() {
        if (!configuredOrigin) {
            throw new Error('BACKEND_URL is not configured. Set BACKEND_URL in .env and rebuild the frontend.');
        }
        return configuredOrigin;
    }

    window.__isLocalEnvironment = window.__isLocalEnvironment || function (hostname) {
        const host = String(hostname || window.location.hostname || '').toLowerCase();
        if (!host) return true;
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
        if (host.endsWith('.local')) return true;
        if (host.startsWith('192.168.') || host.startsWith('10.')) return true;
        return /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    };

    window.__isProductionConsoleHost = window.__isProductionConsoleHost || function () {
        const host = String(window.location?.hostname || '').toLowerCase();
        return !!host && !window.__isLocalEnvironment(host);
    };

    window.__getApiOrigin = function () {
        return requireBackendOrigin();
    };

    window.__getApiBase = function () {
        return `${requireBackendOrigin()}/api`;
    };

    window.BACKEND_URL = configuredOrigin;
    window.GOOGLE_CLIENT_ID = String(runtime.GOOGLE_CLIENT_ID || '').trim();
    window.FRONTEND_URL = String(runtime.FRONTEND_URL || '').trim().replace(/\/+$/, '');

    window.NECPRA_APP_NAME = 'Necpra';
    window.NECPRA_APP_SHORT_NAME = 'Necpra';

    function normalizeBrandText(value) {
        if (typeof value !== 'string' || !value) return value;
        return value
            .replace(/Kynecta/gi, 'Necpra')
            .replace(/Knecta/gi, 'Necpra')
            .replace(/MoodChat/gi, 'Necpra')
            .replace(/Mood Chat/gi, 'Necpra')
            .replace(/Necpa/gi, 'Necpra');
    }

    function applyNecpraBrand(root) {
        const target = root || document;
        if (!target) return;
        if (target.nodeType === Node.TEXT_NODE) {
            const next = normalizeBrandText(target.nodeValue);
            if (next !== target.nodeValue) target.nodeValue = next;
            return;
        }
        if (target.nodeType !== Node.ELEMENT_NODE && target !== document) return;
        if (target === document) {
            if (document.title) document.title = normalizeBrandText(document.title);
        } else {
            if (target.tagName === 'TITLE') target.textContent = normalizeBrandText(target.textContent);
            ['aria-label', 'title', 'placeholder', 'alt', 'content', 'data-app-name'].forEach(function (attribute) {
                if (target.hasAttribute && target.hasAttribute(attribute)) {
                    const current = target.getAttribute(attribute);
                    const next = normalizeBrandText(current);
                    if (next !== current) target.setAttribute(attribute, next);
                }
            });
        }
        const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let node;
        while ((node = walker.nextNode())) nodes.push(node);
        nodes.forEach(function (textNode) {
            const next = normalizeBrandText(textNode.nodeValue);
            if (next !== textNode.nodeValue) textNode.nodeValue = next;
        });
        if (target.querySelectorAll) {
            target.querySelectorAll('[aria-label],[title],[placeholder],[alt],[content],[data-app-name],title').forEach(function (element) {
                ['aria-label', 'title', 'placeholder', 'alt', 'content', 'data-app-name'].forEach(function (attribute) {
                    if (!element.hasAttribute(attribute)) return;
                    const current = element.getAttribute(attribute);
                    const next = normalizeBrandText(current);
                    if (next !== current) element.setAttribute(attribute, next);
                });
                if (element.tagName === 'TITLE') element.textContent = normalizeBrandText(element.textContent);
            });
        }
        if (target === document || target === document.documentElement || target === document.head) {
            document.querySelectorAll('link[rel~="icon"]').forEach(function (link) {
                link.setAttribute('href', '/icons/necpra-192.svg');
                link.setAttribute('type', 'image/svg+xml');
            });
        }
    }

    function initializeNecpraBranding() {
        try {
            document.documentElement.setAttribute('data-app-brand', 'necpra');
            applyNecpraBrand(document);
            if (document.head) {
                document.querySelectorAll('meta[name="application-name"],meta[property="og:site_name"],meta[name="apple-mobile-web-app-title"]').forEach(function (meta) {
                    meta.setAttribute('content', 'Necpra');
                });
            }
            if (window.MutationObserver && document.documentElement) {
                const observer = new MutationObserver(function (mutations) {
                    mutations.forEach(function (mutation) {
                        if (mutation.type === 'characterData') applyNecpraBrand(mutation.target);
                        mutation.addedNodes && mutation.addedNodes.forEach(function (added) {
                            if (added.nodeType === Node.ELEMENT_NODE || added.nodeType === Node.TEXT_NODE) applyNecpraBrand(added);
                        });
                    });
                });
                observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
            }
        } catch (_) {}
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeNecpraBranding, { once: true });
    else initializeNecpraBranding();

    window.__kynShouldFilterConsole = window.__kynShouldFilterConsole || function (level, args) {
        if (!window.__isProductionConsoleHost || !window.__isProductionConsoleHost()) return false;
        if (window.__ALLOW_VERBOSE_CONSOLE__ === true) return false;
        const first = args && args.length ? String(args[0] ?? '') : '';
        const second = args && args.length > 1 ? String(args[1] ?? '') : '';
        const joined = `${first} ${second}`.trim();
        const noisyPatterns = [
            /^\[SW\] Cache hit:/, /^\[LOCAL SAVE]/, /^\[LOCAL LOAD]/, /^\[SAIC] Stage /, /^\[ENV] /,
            /^\[PARENT-SYNC]/, /^\[Navigation]/, /^\[authorizedRequest]/, /^\[DirectListener]/, /^\[Tool-ui]/,
            /^\[ToolPatch]/, /^\[Calls UI]/, /^\[SessionManager]/, /^\[Lifecycle]/, /^\[KeepAlive]/,
            /^\[UI] allUsersLoaded event/, /^\[Init] /, /^\[FriendSync]/, /^\[messagesUI]/,
            /^\[ChatManager]/, /^\[FriendManager]/
        ];
        return noisyPatterns.some((pattern) => pattern.test(joined));
    };

    if (!window.__KYNECTA_CONSOLE_FILTER_PATCHED__) {
        window.__KYNECTA_CONSOLE_FILTER_PATCHED__ = true;
        window.__kynOriginalConsole = {
            log: console.log.bind(console), info: console.info.bind(console), warn: console.warn.bind(console),
            error: console.error.bind(console), debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
        };
        ['log', 'info', 'warn', 'debug'].forEach(function (level) {
            const original = window.__kynOriginalConsole[level];
            console[level] = function () {
                const args = Array.prototype.slice.call(arguments);
                if (window.__kynShouldFilterConsole(level, args)) return;
                return original.apply(console, args);
            };
        });
    }

    function isBackendApiPath(url) {
        try {
            const parsed = new URL(url, window.location.origin);
            return /^\/api(?:\/|$)/i.test(parsed.pathname) || /^\/socket\.io(?:\/|$)/i.test(parsed.pathname) || /^\/ws(?:\/|$)/i.test(parsed.pathname);
        } catch (_) { return false; }
    }

    window.__rewriteApiUrl = function (input) {
        const apiOrigin = requireBackendOrigin();
        const normalize = function (rawUrl) {
            if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
            if (/^\/api(?:\/|$)/i.test(rawUrl) || /^\/socket\.io(?:\/|$)/i.test(rawUrl) || /^\/ws(?:\/|$)/i.test(rawUrl)) return `${apiOrigin}${rawUrl}`;
            try {
                const parsed = new URL(rawUrl, window.location.origin);
                if (isBackendApiPath(parsed.href)) return `${apiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
            } catch (_) {}
            return rawUrl;
        };
        if (typeof Request !== 'undefined' && input instanceof Request) {
            const rewrittenUrl = normalize(input.url);
            if (rewrittenUrl === input.url) return input;
            return new Request(rewrittenUrl, input);
        }
        return normalize(input);
    };

    if (!window.__KYNECTA_API_FETCH_PATCHED__ && typeof window.fetch === 'function') {
        window.__KYNECTA_API_FETCH_PATCHED__ = true;
        const nativeFetch = window.fetch.bind(window);
        window.fetch = function (input, init) { return nativeFetch(window.__rewriteApiUrl(input), init); };
    }

    if (!window.__KYNECTA_API_XHR_PATCHED__ && typeof XMLHttpRequest !== 'undefined') {
        window.__KYNECTA_API_XHR_PATCHED__ = true;
        const nativeOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            const rewrittenUrl = window.__rewriteApiUrl ? window.__rewriteApiUrl(url) : url;
            return nativeOpen.apply(this, [method, rewrittenUrl].concat(Array.prototype.slice.call(arguments, 2)));
        };
    }

    if (!window.__KYNECTA_WEBSOCKET_PATCHED__ && typeof window.WebSocket === 'function') {
        window.__KYNECTA_WEBSOCKET_PATCHED__ = true;
        const NativeWebSocket = window.WebSocket;
        const ConfiguredWebSocket = function (url, protocols) {
            let target = url;
            try {
                const parsed = new URL(url, window.location.origin);
                if (/^\/socket\.io(?:\/|$)/i.test(parsed.pathname) || /^\/ws(?:\/|$)/i.test(parsed.pathname)) {
                    const api = new URL(requireBackendOrigin());
                    parsed.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:';
                    parsed.host = api.host;
                    target = parsed.toString();
                }
            } catch (_) {}
            return protocols === undefined ? new NativeWebSocket(target) : new NativeWebSocket(target, protocols);
        };
        ConfiguredWebSocket.prototype = NativeWebSocket.prototype;
        window.WebSocket = ConfiguredWebSocket;
    }

    window.apiCall = async function (endpoint, options) {
        const url = `${window.__getApiBase()}${String(endpoint || '').startsWith('/') ? endpoint : `/${endpoint || ''}`}`;
        const finalOptions = Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {});
        finalOptions.headers = Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {});
        const token = localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token');
        if (token && !finalOptions.headers.Authorization) finalOptions.headers.Authorization = `Bearer ${token}`;
        try {
            const response = await fetch(url, finalOptions);
            const data = await response.json().catch(() => ({}));
            return data;
        } catch (error) {
            console.error('[API] Request failed:', error);
            return { success: false, message: error.message };
        }
    };

    if (!Object.getOwnPropertyDescriptor(window, 'authToken') || Object.getOwnPropertyDescriptor(window, 'authToken').configurable) {
        let legacyToken = null;
        try { const current = Object.getOwnPropertyDescriptor(window, 'authToken'); if (current && 'value' in current) legacyToken = current.value; } catch (_) {}
        try {
            Object.defineProperty(window, 'authToken', {
                configurable: true, enumerable: true,
                get: function () {
                    try { if (window.__kynToken) return window.__kynToken; } catch (_) {}
                    try { if (window.__accessToken) return window.__accessToken; } catch (_) {}
                    try { if (window.AuthSessionManager && typeof window.AuthSessionManager.getToken === 'function') { const token = window.AuthSessionManager.getToken(); if (token) return token; } } catch (_) {}
                    for (const key of ['authToken', 'accessToken', 'token', 'jwt', 'USER_TOKEN', 'necpa_token']) {
                        try { const token = localStorage.getItem(key) || sessionStorage.getItem(key); if (token && !token.startsWith('{')) return token; } catch (_) {}
                    }
                    return legacyToken || '';
                },
                set: function (value) { legacyToken = value || null; }
            });
        } catch (_) {}
    }

    // Group OS is loaded from the same origin; it uses __getApiBase() above,
    // so no backend hostname is embedded in the feature bundle.
    if (/\/group\.html$/i.test(window.location.pathname) && !document.querySelector('script[data-group-platform]')) {
        const script = document.createElement('script');
        script.src = '/js/group-platform.js';
        script.async = false;
        script.dataset.groupPlatform = 'true';
        (document.head || document.documentElement).appendChild(script);
    }

    // Messages gets a defensive group boundary plus a real group-only sidebar.
    // It is loaded from the same origin and resolves its API through config.js.
    if (/\/message\.html$/i.test(window.location.pathname) && !document.querySelector('script[data-group-message-isolation]')) {
        const script = document.createElement('script');
        script.src = '/js/group-message-isolation.js';
        script.async = false;
        script.dataset.groupMessageIsolation = 'true';
        (document.head || document.documentElement).appendChild(script);
    }

    // The parent chat shell owns the visible group header/actions. Keep the
    // legacy group.html chatbar hidden so voice/video/info/back controls are
    // not duplicated inside the group panel.
    if (/\/group\.html$/i.test(window.location.pathname) && !document.querySelector('script[data-group-panel-cleanup]')) {
        const script = document.createElement('script');
        script.src = '/js/group-panel-cleanup.js';
        script.async = false;
        script.dataset.groupPanelCleanup = 'true';
        (document.head || document.documentElement).appendChild(script);
    }

    console.log('[Config] Runtime configuration loaded. Backend:', configuredOrigin || '(missing)');
})();
