// Necpa runtime configuration gateway
// Keep this file dependency-free and syntax-safe: it is loaded before the API layer.
(function () {
    'use strict';

    var runtime = window.__NEXIPA_RUNTIME_CONFIG__ || window.__NECPRA_RUNTIME_CONFIG__ || {};
    var configuredOrigin = String(runtime.BACKEND_URL || window.BACKEND_URL || '').trim().replace(/\/+$/, '');
    var warned = false;

    function backendOrigin() {
        if (configuredOrigin) return configuredOrigin;
        if (!warned) {
            warned = true;
            console.error('[Config] BACKEND_URL is not configured. API origin/base are temporarily empty.');
        }
        return '';
    }

    window.BACKEND_URL = configuredOrigin;
    window.FRONTEND_URL = String(runtime.FRONTEND_URL || '').trim().replace(/\/+$/, '');
    window.GOOGLE_CLIENT_ID = String(runtime.GOOGLE_CLIENT_ID || '').trim();
    window.NECPRA_APP_NAME = 'Necpa';
    window.NECPRA_APP_SHORT_NAME = 'Necpa';
    window.__getApiOrigin = function () { return backendOrigin(); };
    window.__getApiBase = function () {
        var origin = backendOrigin();
        return origin ? origin + '/api' : '';
    };

    function normalizeBrandText(value) {
        if (typeof value !== 'string' || !value) return value;
        return value
            .replace(/Kynecta/gi, 'Necpa')
            .replace(/Knecta/gi, 'Necpa')
            .replace(/MoodChat/gi, 'Necpa')
            .replace(/Mood Chat/gi, 'Necpa')
            .replace(/Necpra/gi, 'Necpa')
            .replace(/Advanced Mood-Based Chat/gi, 'Advanced Chat')
            .replace(/Mood-Based/gi, '')
            .replace(/Mood Arcade/gi, 'Necpa Arcade');
    }

    function applyBrand(root) {
        try {
            if (!root) return;
            if (root.nodeType === Node.TEXT_NODE) { root.nodeValue = normalizeBrandText(root.nodeValue); return; }
            if (root === document && document.title) document.title = normalizeBrandText(document.title);
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            var node;
            while ((node = walker.nextNode())) node.nodeValue = normalizeBrandText(node.nodeValue);
        } catch (_) {}
    }

    function normalizeIcons() {
        try {
            var icon = '/icons/necpa-192.png';
            document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]').forEach(function (node) { node.href = icon; });
        } catch (_) {}
    }

    function removeCalls(root) {
        try {
            var doc = root || document;
            doc.querySelectorAll('#hdrChatCall,#hdrChatVideo,#hdrGroupCall,#hdrGroupVideo,[data-page="calls"],.center-menu-calls,#_kynMiniCallBar,#kyn-call-banner,#bannerAcceptCall,#bannerDeclineCall').forEach(function (node) { node.remove(); });
            doc.querySelectorAll('button,a').forEach(function (node) {
                var text = (node.textContent || '').trim().toLowerCase();
                var title = (node.getAttribute('title') || '').trim().toLowerCase();
                if (['calls', 'new call', 'voice call', 'video call'].indexOf(text) !== -1 || ['voice call', 'video call'].indexOf(title) !== -1) node.remove();
            });
        } catch (_) {}
    }

    function fixBrokenImages(root) {
        try {
            (root || document).querySelectorAll('img').forEach(function (img) {
                if (img.classList.contains('jm-subcat-img')) return;
                if (!img.getAttribute('src') || /\/undefined(?:$|[?#])/i.test(img.getAttribute('src'))) img.src = '/icons/necpa-192.png';
                if (!img.dataset.necpraImageGuard) {
                    img.dataset.necpraImageGuard = '1';
                    img.addEventListener('error', function () {
                        if (!img.dataset.necpraImageFallback) { img.dataset.necpraImageFallback = '1'; img.src = '/icons/necpa-192.png'; }
                    });
                }
            });
        } catch (_) {}
    }

    function loadOnce(src, key) {
        var safe = String(key || 'loader').replace(/[^a-zA-Z0-9_-]/g, '_');
        if (document.querySelector('script[data-necpra-loader="' + safe + '"]')) return;
        var script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.setAttribute('data-necpra-loader', safe);
        (document.head || document.documentElement).appendChild(script);
    }

    function disableLegacyCallHandlers() {
        try {
            window.setupGlobalCallBanner = function () {};
            window.hideGlobalBanner = function () {};
            window.showIncomingCallBanner = function () {};
            window.pendingIncomingCall = null;
            window.__activeCallInProgress = false;
        } catch (_) {}
        removeCalls();
    }

    window.__rewriteApiUrl = function (input) {
        var origin = backendOrigin();
        if (!origin) return input;
        function normalize(url) {
            if (!url || typeof url !== 'string') return url;
            if (/^\/api(?:\/|$)/i.test(url) || /^\/socket\.io(?:\/|$)/i.test(url) || /^\/ws(?:\/|$)/i.test(url)) return origin + url;
            try {
                var parsed = new URL(url, window.location.origin);
                if (/^\/api(?:\/|$)/i.test(parsed.pathname) || /^\/socket\.io(?:\/|$)/i.test(parsed.pathname) || /^\/ws(?:\/|$)/i.test(parsed.pathname)) return origin + parsed.pathname + parsed.search + parsed.hash;
            } catch (_) {}
            return url;
        }
        if (typeof Request !== 'undefined' && input instanceof Request) {
            var rewritten = normalize(input.url);
            return rewritten === input.url ? input : new Request(rewritten, input);
        }
        return normalize(input);
    };

    if (!window.__NECPRA_FETCH_PATCHED__ && window.fetch) {
        window.__NECPRA_FETCH_PATCHED__ = true;
        var nativeFetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
            try {
                var rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
                var pathname = new URL(rawUrl, window.location.origin).pathname;
                if (/^\/api\/calls(?:\/|$)/i.test(pathname)) return Promise.resolve(new Response(JSON.stringify({ success: true, disabled: true, data: [], listings: [], message: 'Calling is disabled' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
            } catch (_) {}
            return nativeFetch(window.__rewriteApiUrl(input), init);
        };
    }

    if (!window.__NECPRA_XHR_PATCHED__ && window.XMLHttpRequest) {
        window.__NECPRA_XHR_PATCHED__ = true;
        var xhrOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            var args = Array.prototype.slice.call(arguments, 2);
            return xhrOpen.apply(this, [method, window.__rewriteApiUrl(url)].concat(args));
        };
    }

    if (!window.__NECPRA_WS_PATCHED__ && window.WebSocket) {
        window.__NECPRA_WS_PATCHED__ = true;
        var NativeWebSocket = window.WebSocket;
        var WrappedWebSocket = function (url, protocols) {
            var target = url;
            try {
                var parsed = new URL(url, window.location.origin);
                if (/^\/socket\.io(?:\/|$)/i.test(parsed.pathname) || /^\/ws(?:\/|$)/i.test(parsed.pathname)) {
                    var api = new URL(backendOrigin());
                    parsed.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:';
                    parsed.host = api.host;
                    target = parsed.toString();
                }
            } catch (_) {}
            return protocols === undefined ? new NativeWebSocket(target) : new NativeWebSocket(target, protocols);
        };
        WrappedWebSocket.prototype = NativeWebSocket.prototype;
        window.WebSocket = WrappedWebSocket;
    }

    window.apiCall = async function (endpoint, options) {
        var base = window.__getApiBase();
        var url = base + String(endpoint || '').replace(/^\/?/, '/');
        var opts = Object.assign({}, options || {});
        opts.headers = Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {});
        var token = localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token');
        if (token && !opts.headers.Authorization) opts.headers.Authorization = 'Bearer ' + token;
        try { var response = await fetch(url, opts); return await response.json().catch(function () { return { success: false, status: response.status }; }); }
        catch (error) { console.error('[API] Request failed:', error); return { success: false, message: error.message }; }
    };

    try {
        Object.defineProperty(window, 'authToken', {
            configurable: true, enumerable: true,
            get: function () { return localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || ''; },
            set: function (value) { if (value) localStorage.setItem('authToken', value); }
        });
    } catch (_) {}

    function init() {
        try {
            var saved = localStorage.getItem('app_theme') || localStorage.getItem('theme');
            var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            var theme = saved === 'dark' || saved === 'light' ? saved : (prefersDark ? 'dark' : 'light');
            document.documentElement.setAttribute('data-theme', theme); document.documentElement.style.colorScheme = theme;
        } catch (_) {}
        applyBrand(document); normalizeIcons(); disableLegacyCallHandlers(); fixBrokenImages(document);
        loadOnce('/js/admin-support-bridge.js?v=20260916-5', 'admin_support_bridge');
        if (/\/index\.html$/i.test(location.pathname) || location.pathname === '/') {
            loadOnce('/js/pwa-identity.js?v=20260916-5', 'pwa_identity'); loadOnce('/js/pwa-mobile-install.js?v=20260916-1', 'pwa_mobile_install');
        }
        if (/\/group\.html$/i.test(location.pathname)) {
            loadOnce('/js/group-panel-cleanup.js?v=20260916-5', 'group_panel_cleanup'); loadOnce('/js/group-mobile-navigation.js?v=20260916-6', 'group_mobile_navigation');
        }
        if (/\/chat\.html$/i.test(location.pathname)) loadOnce('/js/friend-request-center-action.js?v=20260916-5', 'friend_request_center_action');
        if (/\/message\.html$/i.test(location.pathname) || /\/messages\.html$/i.test(location.pathname)) loadOnce('/js/message-experience-upgrade.js?v=20260917-1', 'message_experience_upgrade');
        if (/\/Tools\.html$/i.test(location.pathname) || /\/tools\.html$/i.test(location.pathname)) {
            loadOnce('/js/marketplace-accommodation-service.js?v=20260916-5', 'marketplace_accommodation_service'); loadOnce('/js/accommodation-marketplace-surface.js?v=20260916-5', 'accommodation_marketplace_surface'); loadOnce('/js/invoice-ui.js?v=20260916-5', 'invoice_ui'); loadOnce('/js/marketplace-image-hardening.js?v=20260916-5', 'marketplace_image_hardening');
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
    if (window.MutationObserver) new MutationObserver(function (mutations) { mutations.forEach(function (mutation) { mutation.addedNodes && mutation.addedNodes.forEach(function (node) { if (node.nodeType === 1) { applyBrand(node); removeCalls(node); fixBrokenImages(node); } }); }); }).observe(document.documentElement, { childList: true, subtree: true });
    console.log('[Config] Necpa runtime configuration loaded. Backend:', configuredOrigin || '(missing)');
})();
