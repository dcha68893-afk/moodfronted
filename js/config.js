// Necpa runtime configuration gateway
// Keep this file dependency-free and syntax-safe: it is loaded before the API layer.
(function () {
    'use strict';

    var runtime = window.__NEXIPA_RUNTIME_CONFIG__ || window.__NECPRA_RUNTIME_CONFIG__ || {};
    var configuredOrigin = String(runtime.BACKEND_URL || window.BACKEND_URL || '').trim().replace(/\/+$/, '');
    var warned = false;

    // THEME BOOT AUTHORITY: resolve and paint the user's saved theme before
    // DOMContentLoaded or any module/bootstrap code runs. This is the only
    // first-paint theme source; ThemeEngine consumes this value instead of
    // independently racing settings/module initialization.
    (function bootstrapThemeBeforePaint() {
        try {
            var raw = localStorage.getItem('app_theme');
            var theme = raw === 'dark' || raw === 'light' ? raw : null;
            if (!theme) {
                var cached = localStorage.getItem('knecta_settings_cache') || localStorage.getItem('app_settings_global') || localStorage.getItem('necpa_settings_default');
                if (cached) {
                    try {
                        var parsed = JSON.parse(cached), settings = parsed && (parsed.data || parsed), appearance = settings && settings.appearance;
                        var cachedTheme = appearance && appearance.theme || settings && settings.theme;
                        if (cachedTheme === 'dark' || cachedTheme === 'light') theme = cachedTheme;
                    } catch (_) {}
                }
            }
            if (!theme) theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            window.__NECPRA_INITIAL_THEME__ = theme;
            var root = document.documentElement;
            root.setAttribute('data-theme', theme);
            root.style.colorScheme = theme;
            root.classList.add('kyn-theme-boot');
            if (document.head) {
                var boot = document.createElement('style');
                boot.id = 'kyn-config-theme-boot';
                boot.textContent = 'html.kyn-theme-boot,html.kyn-theme-boot *{transition:none!important;animation:none!important}html.kyn-theme-boot{color-scheme:' + theme + '!important}';
                document.head.appendChild(boot);
            }
        } catch (_) {}
    })();

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
    window.__NECPRA_ALLOWED_ORIGINS__ = ['https://necpra.co.ke', 'https://www.necpra.co.ke', window.location.origin].filter(Boolean);
    window.__API_ALLOWED_ORIGINS__ = window.__NECPRA_ALLOWED_ORIGINS__.slice();
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
        try { document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]').forEach(function (node) { node.href = '/icons/necpa-192.png'; }); } catch (_) {}
    }

    function removeCalls(root) {
        try {
            var doc = root || document;
            doc.querySelectorAll('#hdrChatCall,#hdrChatVideo,#hdrGroupCall,#hdrGroupVideo,[data-page="calls"],.center-menu-calls,#_kynMiniCallBar,#kyn-call-banner,#bannerAcceptCall,#bannerDeclineCall').forEach(function (node) { node.remove(); });
            doc.querySelectorAll('button,a').forEach(function (node) {
                var text = (node.textContent || '').trim().toLowerCase(), title = (node.getAttribute('title') || '').trim().toLowerCase();
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
        var script = document.createElement('script'); script.src = src; script.async = false; script.setAttribute('data-necpra-loader', safe);
        (document.head || document.documentElement).appendChild(script);
    }

    function disableLegacyCallHandlers() {
        try { window.setupGlobalCallBanner = function () {}; window.hideGlobalBanner = function () {}; window.showIncomingCallBanner = function () {}; window.pendingIncomingCall = null; window.__activeCallInProgress = false; } catch (_) {}
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

    function withAuth(input, init) {
        var opts = Object.assign({}, init || {}), headers = new Headers((input && input.headers) || (init && init.headers) || {});
        var token = localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
        if (token && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
        if (opts.body && typeof opts.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
        opts.headers = headers;
        return opts;
    }

    // Friends iframe transport recovery.
    // The Friends core historically depended on its internal parent/session relay
    // before it would allow any API request. On a cold iframe load the parent can
    // already have emitted its session burst before the Friends listener exists,
    // leaving the module in WAITING_AUTH with parentReady=false and producing
    // client-side /friends timeouts without any request reaching Render.
    // Send the two parent handshake messages directly, without the Friends core's
    // own state gate. The existing Friends listener will receive the parent's
    // SESSION_DATA/AUTH_READY/PARENT_READY response normally.
    function installFriendsHandshakeRecovery() {
        if (!/\/friend(?:\.html)?$/i.test(window.location.pathname)) return;
        if (window.__NECPRA_FRIEND_HANDSHAKE_RECOVERY__) return;
        window.__NECPRA_FRIEND_HANDSHAKE_RECOVERY__ = true;

        var parent = window.parent;
        if (!parent || parent === window) return;

        var attempts = 0;
        var maxAttempts = 40;
        var timer = null;

        function requestSession(reason) {
            if (attempts >= maxAttempts) {
                if (timer) clearInterval(timer);
                return;
            }
            attempts += 1;
            var payload = { module: 'friends', source: 'friends', target: 'parent', reason: reason, timestamp: Date.now() };
            try {
                parent.postMessage({
                    type: 'CHILD_READY',
                    source: 'friends',
                    module: 'friends',
                    payload: payload,
                    timestamp: Date.now()
                }, window.location.origin);
            } catch (_) {}
            try {
                parent.postMessage({
                    type: 'REQUEST_SESSION',
                    source: 'friends',
                    module: 'friends',
                    target: 'parent',
                    payload: payload,
                    timestamp: Date.now()
                }, window.location.origin);
            } catch (_) {}
        }

        requestSession('config_bootstrap');
        timer = setInterval(function () { requestSession('config_recovery'); }, 750);

        window.addEventListener('message', function (event) {
            try {
                if (event.source !== parent) return;
                var type = event.data && event.data.type;
                if (type === 'SESSION_DATA' || type === 'AUTH_READY' || type === 'PARENT_READY') {
                    if (timer) clearInterval(timer);
                    console.log('[Friends] Parent session handshake recovered via direct transport:', type);
                }
            } catch (_) {}
        });
    }

    // Bootstrap the API-core contract before any security/feature layer asks for it.
    window.__API_CORE = window.__API_CORE || {};
    window.__API_CORE.allowedOrigins = window.__NECPRA_ALLOWED_ORIGINS__;
    window.__API_CORE.getUserToken = window.__API_CORE.getUserToken || function () { return localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || ''; };
    window.__API_CORE._apiCache = window.__API_CORE._apiCache || new Map();
    window.__API_CORE._apiRequestQueue = window.__API_CORE._apiRequestQueue || [];
    window.__API_CORE.secureApiFetch = window.__API_CORE.secureApiFetch || function (input, init) { return fetch(input, withAuth(input, init)); };
    window.__API_CORE.ready = window.__API_CORE.ready || Promise.resolve(window.__API_CORE);

    if (!window.__NECPRA_FETCH_PATCHED__ && window.fetch) {
        window.__NECPRA_FETCH_PATCHED__ = true;
        var nativeFetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
            try {
                var rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
                var pathname = new URL(rawUrl, window.location.origin).pathname;
                if (/^\/api\/calls(?:\/|$)/i.test(pathname)) {
                    return Promise.resolve(new Response(JSON.stringify({ success: true, disabled: true, data: [], listings: [], message: 'Calling is disabled' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                }
            } catch (_) {}
            return nativeFetch(window.__rewriteApiUrl(input), withAuth(input, init));
        };
    }

    if (!window.__NECPRA_XHR_PATCHED__ && window.XMLHttpRequest) {
        window.__NECPRA_XHR_PATCHED__ = true;
        var xhrOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) { var args = Array.prototype.slice.call(arguments, 2); return xhrOpen.apply(this, [method, window.__rewriteApiUrl(url)].concat(args)); };
    }

    if (!window.__NECPRA_WS_PATCHED__ && window.WebSocket) {
        window.__NECPRA_WS_PATCHED__ = true;
        var NativeWebSocket = window.WebSocket;
        var WrappedWebSocket = function (url, protocols) {
            var target = url;
            try {
                var parsed = new URL(url, window.location.origin);
                if (/^\/socket\.io(?:\/|$)/i.test(parsed.pathname) || /^\/ws(?:\/|$)/i.test(parsed.pathname)) {
                    var api = new URL(backendOrigin()); parsed.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:'; parsed.host = api.host; target = parsed.toString();
                }
            } catch (_) {}
            return protocols === undefined ? new NativeWebSocket(target) : new NativeWebSocket(target, protocols);
        };
        WrappedWebSocket.prototype = NativeWebSocket.prototype; window.WebSocket = WrappedWebSocket;
    }

    window.apiCall = async function (endpoint, options) {
        var base = window.__getApiBase(), url = base + String(endpoint || '').replace(/^\/?/, '/'), opts = withAuth(url, options);
        try { var response = await fetch(url, opts); return await response.json().catch(function () { return { success: false, status: response.status }; }); }
        catch (error) { console.error('[API] Request failed:', error); return { success: false, message: error.message }; }
    };

    function installMessageStabilization() {
        if (window.__NECPRA_POSTMESSAGE_STABILIZED__ || !window.postMessage) return;
        window.__NECPRA_POSTMESSAGE_STABILIZED__ = true;
        var nativePostMessage = window.postMessage.bind(window), last = new Map();
        var benign = new Set(['UI_DEBUG','kyn:friendRequestCount','ECOM_CART_UPDATE','TOOLS_CART_COUNT','UNREAD_COUNT_UPDATE','FRIENDS_LIST_UPDATE','STORAGE_SET']);
        window.postMessage = function (message, targetOrigin, transfer) {
            try {
                var type = message && (message.type || message.event || message.action);
                if (benign.has(String(type))) {
                    var now = Date.now(), prev = last.get(String(type)) || 0;
                    if (now - prev < 450) return;
                    last.set(String(type), now);
                }
            } catch (_) {}
            return nativePostMessage(message, targetOrigin, transfer);
        };
    }

    function installAccessibilityGuards() {
        try {
            var form = document.getElementById('necpraPasswordAssistForm');
            if (!form) { form = document.createElement('form'); form.id = 'necpraPasswordAssistForm'; form.hidden = true; form.addEventListener('submit', function (e) { e.preventDefault(); }); document.body.appendChild(form); }
            function scan(root) {
                (root || document).querySelectorAll('input[type="password"]').forEach(function (input) { if (!input.closest('form') && !input.getAttribute('form')) input.setAttribute('form', 'necpraPasswordAssistForm'); });
                (root || document).querySelectorAll('[aria-hidden="true"]').forEach(function (el) { if (el.contains(document.activeElement)) { try { document.activeElement.blur(); } catch (_) {} } });
            }
            scan(document);
            new MutationObserver(function () { scan(document); }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden', 'style'] });
        } catch (_) {}
    }

    try {
        Object.defineProperty(window, 'authToken', { configurable: true, enumerable: true, get: function () { return localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || ''; }, set: function (value) { if (value) localStorage.setItem('authToken', value); } });
    } catch (_) {}

    function init() {
        try { var saved = localStorage.getItem('app_theme') || localStorage.getItem('theme'), prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches, theme = saved === 'dark' || saved === 'light' ? saved : (prefersDark ? 'dark' : 'light'); document.documentElement.setAttribute('data-theme', theme); document.documentElement.style.colorScheme = theme; } catch (_) {}
        installFriendsHandshakeRecovery();
        applyBrand(document); normalizeIcons(); disableLegacyCallHandlers(); fixBrokenImages(document); installMessageStabilization(); installAccessibilityGuards();
        loadOnce('/js/admin-support-bridge.js?v=20260916-5', 'admin_support_bridge');
        // ROOT-CAUSE FIX (PWA install prompt appears on desktop but never on
        // mobile): pwa-manager.js — the DESKTOP install banner — is loaded
        // broadly, on chat.html/index.html/Tools.html/status.html/
        // settings.html (see each file's own <script> tags), and correctly
        // no-ops on mobile ("pwa-mobile-install.js owns the mobile banner").
        // But pwa-mobile-install.js — the actual mobile banner it defers
        // to — was only ever loaded here on index.html/'/'. A person who
        // logs in and spends their time on chat.html (which, for anyone
        // already logged in, is almost always immediately) never had
        // either script show them an install prompt on a phone: the
        // desktop one intentionally declines, and the mobile one was never
        // even loaded on that page. Load it everywhere the desktop banner
        // is loaded, so mobile gets the same opportunities to prompt.
        if (/\/index\.html$/i.test(location.pathname) || location.pathname === '/') loadOnce('/js/pwa-identity.js?v=20260916-5', 'pwa_identity');
        if (/\/index\.html$/i.test(location.pathname) || location.pathname === '/' || /\/(chat|Tools|tools|status|settings)\.html$/i.test(location.pathname)) loadOnce('/js/pwa-mobile-install.js?v=20260916-1', 'pwa_mobile_install');
        if (/\/group\.html$/i.test(location.pathname)) { loadOnce('/js/group-panel-cleanup.js?v=20260916-5', 'group_panel_cleanup'); loadOnce('/js/group-mobile-navigation.js?v=20260916-6', 'group_mobile_navigation'); }
        if (/\/chat\.html$/i.test(location.pathname)) loadOnce('/js/friend-request-center-action.js?v=20260916-5', 'friend_request_center_action');
        if (/\/Tools\.html$/i.test(location.pathname) || /\/tools\.html$/i.test(location.pathname)) { loadOnce('/js/marketplace-accommodation-service.js?v=20260916-6', 'marketplace_accommodation_service'); loadOnce('/js/accommodation-marketplace-surface.js?v=20260916-6', 'accommodation_marketplace_surface'); loadOnce('/js/invoice-ui.js?v=20260916-5', 'invoice_ui'); loadOnce('/js/marketplace-image-hardening.js?v=20260916-5', 'marketplace_image_hardening'); }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
    if (window.MutationObserver) new MutationObserver(function (mutations) { mutations.forEach(function (mutation) { mutation.addedNodes && mutation.addedNodes.forEach(function (node) { if (node.nodeType === 1) { applyBrand(node); removeCalls(node); fixBrokenImages(node); } }); }); }).observe(document.documentElement, { childList: true, subtree: true });
    console.log('[Config] Necpa runtime configuration loaded. Backend:', configuredOrigin || '(missing)');
})();
