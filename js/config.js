// Necpa runtime configuration gateway
// Keep this file dependency-free and syntax-safe: it is loaded before the API layer.
(function () {
    'use strict';

    // NATIVE SHELL: the Play Store app (Capacitor) bundles every asset locally, so a
    // service worker adds nothing there and its cache can serve files from an older
    // app version next to newer ones. Retire any existing worker/caches once and make
    // every later register() call a harmless no-op. Web PWA behaviour is unchanged.
    var IS_NATIVE_SHELL = false;
    try {
        IS_NATIVE_SHELL = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    } catch (_) {}
    window.__NECPA_NATIVE__ = IS_NATIVE_SHELL;
    if (IS_NATIVE_SHELL && 'serviceWorker' in navigator) {
        try {
            navigator.serviceWorker.register = function () {
                return Promise.reject(new Error('Service worker disabled in native shell'));
            };
            if (!localStorage.getItem('necpa_native_sw_retired')) {
                navigator.serviceWorker.getRegistrations().then(function (regs) {
                    return Promise.all(regs.map(function (r) { return r.unregister(); }));
                }).then(function () {
                    return window.caches ? caches.keys().then(function (k) { return Promise.all(k.map(function (n) { return caches.delete(n); })); }) : null;
                }).then(function () {
                    try { localStorage.setItem('necpa_native_sw_retired', '1'); } catch (_) {}
                }).catch(function () {});
            }
        } catch (_) {}
    }

    // BOOT GUARD: top-level pages stay invisible (background already painted by the
    // theme boot below) until scripts, styles and icon fonts have settled, so a slow
    // cold start never shows half-styled markup. Always released by a hard timeout.
    (function bootGuard() {
        try {
            if (window.top !== window.self) return;
            var root = document.documentElement;
            root.classList.add('kyn-booting');
            var st = document.createElement('style');
            st.id = 'kyn-boot-guard';
            st.textContent = 'html.kyn-booting body{visibility:hidden!important}';
            (document.head || root).appendChild(st);
            var done = false;
            function release() {
                if (done) return;
                done = true;
                root.classList.remove('kyn-booting');
                if (st.parentNode) st.parentNode.removeChild(st);
            }
            function afterFonts() {
                var t = setTimeout(release, 800);
                try {
                    if (document.fonts && document.fonts.ready) {
                        document.fonts.ready.then(function () { clearTimeout(t); requestAnimationFrame(release); });
                    } else { clearTimeout(t); release(); }
                } catch (_) { release(); }
            }
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', afterFonts, { once: true });
            else afterFonts();
            setTimeout(release, 3000);
        } catch (_) {}
    })();

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

    // ROOT-CAUSE FIX (GROUP "Secure messaging is still unlocking" FOREVER):
    // this rewriter used to walk EVERY text node in the document -- including
    // the text of inline <script> and <style> elements. Because the
    // MutationObserver below runs as soon as the parser inserts an inline
    // <script> (before the browser executes it), executable source was being
    // rewritten first: `window.KynectaGroupE2E` became `window.NecpaGroupE2E`,
    // `window.KynectaE2EIdentity` became `window.NecpaE2EIdentity`, and
    // `__NECPRA_ENSURE_E2E` became `__Necpa_ENSURE_E2E`. None of those globals
    // exist, so group.html could never see the group crypto module or the
    // unlocked identity and always reported the E2E layer as "still
    // unlocking" -- even though the keys were ready. External .js files are
    // unaffected (they have no text nodes), which is why 1:1 chat kept working.
    // Branding is only meant for VISIBLE text, so code/style/data containers
    // are now skipped entirely.
    var BRAND_SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, TEMPLATE: 1, CODE: 1, PRE: 1 };
    function isBrandSafeTextNode(textNode) {
        var el = textNode && textNode.parentNode;
        while (el && el.nodeType === 1) {
            if (BRAND_SKIP_TAGS[el.nodeName]) return false;
            el = el.parentNode;
        }
        return true;
    }

    function applyBrand(root) {
        try {
            if (!root) return;
            if (root.nodeType === Node.TEXT_NODE) {
                if (isBrandSafeTextNode(root)) root.nodeValue = normalizeBrandText(root.nodeValue);
                return;
            }
            if (root.nodeType === 1 && BRAND_SKIP_TAGS[root.nodeName]) return;
            if (root === document && document.title) document.title = normalizeBrandText(document.title);
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: function (n) { return isBrandSafeTextNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
            });
            var node;
            while ((node = walker.nextNode())) node.nodeValue = normalizeBrandText(node.nodeValue);
        } catch (_) {}
    }

    function normalizeIcons() {
        try { document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]').forEach(function (node) { node.href = '/icons/necpa-192.png'; }); } catch (_) {}
    }

    // ROOT-CAUSE FIX (real photos/videos replaced by the app icon):
    // the first time ANY <img> failed to load -- even a passing failure such as the backend waking from a cold start --
    // it was permanently swapped for /icons/necpa-192.png. That also hit chat/group/status pictures, so the receiver saw
    // the app image instead of what the sender sent. User media must never be replaced by the app icon: transient failures
    // are retried, and a file that is really gone gets a neutral "unavailable - tap to retry" placeholder instead.
    var APP_ICON = '/icons/necpa-192.png';
    var MEDIA_UNAVAILABLE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><rect width="240" height="160" rx="12" fill="#e5e7eb"/>' +
        '<path d="M84 104l22-28 16 20 12-14 22 22z" fill="#9ca3af"/><circle cx="96" cy="60" r="9" fill="#9ca3af"/>' +
        '<text x="120" y="132" font-family="Arial,sans-serif" font-size="12" text-anchor="middle" fill="#6b7280">Image unavailable - tap to retry</text></svg>');
    // Neutral silhouette for a profile picture that cannot be loaded (never the app logo).
    var AVATAR_UNAVAILABLE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#d1d5db"/>' +
        '<circle cx="50" cy="38" r="18" fill="#f3f4f6"/><path d="M14 92c4-22 20-32 36-32s32 10 36 32z" fill="#f3f4f6"/></svg>');
    function isAvatarImg(img) {
        try { return /(?:^|[\s_-])(avatar|profile-?pic|profile-?photo|user-?photo)(?:$|[\s_-])/i.test(String(img.className || '')) || img.hasAttribute('data-avatar'); }
        catch (_) { return false; }
    }
    function isUserMediaSrc(src) {
        src = String(src || '');
        if (!src || src.indexOf(APP_ICON) !== -1) return false;
        // Google account photos (lh3.googleusercontent.com) are profile pictures too: retry them
        // instead of swapping in the app logo the first time the CDN hiccups.
        if (/googleusercontent\.com|ui-avatars\.com|gravatar\.com/i.test(src)) return true;
        return /\/uploads\//i.test(src) || /res\.cloudinary\.com|cloudinary\.com/i.test(src) || /\/api\/(?:files|media)\//i.test(src) || /^blob:/i.test(src) || /^data:image\//i.test(src);
    }
    // Uploaded files live on the BACKEND. A relative "/uploads/..." link would otherwise resolve against the frontend site (404).
    function toBackendUploadUrl(u) {
        try {
            if (typeof u === 'string' && /^\/uploads\//i.test(u)) { var o = backendOrigin(); if (o) return o + u; }
        } catch (_) {}
        return u;
    }
    window.__resolveMediaUrl = toBackendUploadUrl;
    var UPLOAD_LINK_SELECTOR = 'img[src^="/uploads/"],video[src^="/uploads/"],audio[src^="/uploads/"],source[src^="/uploads/"],a[href^="/uploads/"]';
    // querySelectorAll() only finds DESCENDANTS. When the node the observer hands us IS the <img>/<a> itself (the normal
    // case for a chat bubble that appends a bare <img>), it was silently skipped -- so include the node itself.
    function selfAndDescendants(root, selector) {
        var base = root && root.querySelectorAll ? root : document, list = [];
        try { if (base !== document && base.matches && base.matches(selector)) list.push(base); } catch (_) {}
        return list.concat(Array.prototype.slice.call(base.querySelectorAll(selector)));
    }
    function fixUploadLinks(root) {
        try {
            selfAndDescendants(root, UPLOAD_LINK_SELECTOR).forEach(function (el) {
                var attr = el.hasAttribute('src') ? 'src' : 'href';
                var fixed = toBackendUploadUrl(el.getAttribute(attr));
                if (fixed !== el.getAttribute(attr)) el.setAttribute(attr, fixed);
            });
        } catch (_) {}
    }
    function retryUserImage(img, src) {
        var tries = Number(img.dataset.mediaRetry || 0);
        if (!img.dataset.mediaOrigSrc) img.dataset.mediaOrigSrc = src;
        if (tries < 3) {
            img.dataset.mediaRetry = String(tries + 1);
            setTimeout(function () {
                var base = String(img.dataset.mediaOrigSrc).replace(/([?&])_r=\d+/, '$1').replace(/[?&]$/, '');
                img.src = base + (base.indexOf('?') === -1 ? '?' : '&') + '_r=' + Date.now();
            }, 1500 * (tries + 1));
            return;
        }
        img.dataset.mediaFailed = '1';
        img.style.cursor = 'pointer';
        img.src = isAvatarImg(img) ? AVATAR_UNAVAILABLE : MEDIA_UNAVAILABLE;
        img.addEventListener('click', function reload(ev) {
            if (img.dataset.mediaFailed !== '1') return;
            ev.stopPropagation(); ev.preventDefault();
            img.dataset.mediaFailed = ''; img.dataset.mediaRetry = '0'; img.removeEventListener('click', reload);
            img.src = String(img.dataset.mediaOrigSrc).replace(/([?&])_r=\d+/, '$1').replace(/[?&]$/, '') + '?_r=' + Date.now();
        }, true);
    }
    function fixBrokenImages(root) {
        try {
            fixUploadLinks(root);
            selfAndDescendants(root, 'img').forEach(function (img) {
                if (img.classList.contains('jm-subcat-img')) return;
                if (!img.getAttribute('src') || /\/undefined(?:$|[?#])/i.test(img.getAttribute('src'))) img.src = isAvatarImg(img) ? AVATAR_UNAVAILABLE : APP_ICON;
                if (!img.dataset.necpraImageGuard) {
                    img.dataset.necpraImageGuard = '1';
                    // Google/CDN avatar hosts reject requests carrying our page as Referer.
                    if (isAvatarImg(img) || /googleusercontent\.com/i.test(img.getAttribute('src') || '')) img.referrerPolicy = 'no-referrer';
                    var onFail = function () {
                        var current = img.getAttribute('src') || '';
                        if (img.dataset.mediaFailed === '1' || current.indexOf('data:image/svg+xml') === 0) return;
                        if (isUserMediaSrc(current)) { retryUserImage(img, current); return; }
                        if (!img.dataset.necpraImageFallback) { img.dataset.necpraImageFallback = '1'; img.src = APP_ICON; }
                    };
                    img.addEventListener('error', onFail);
                    // it may already have failed before this guard was attached
                    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) setTimeout(onFail, 0);
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

    window.__rewriteApiUrl = function (input) {
        var origin = backendOrigin();
        if (!origin) return input;
        function normalize(url) {
            if (!url || typeof url !== 'string') return url;
            if (/^\/api(?:\/|$)/i.test(url) || /^\/socket\.io(?:\/|$)/i.test(url) || /^\/ws(?:\/|$)/i.test(url) || /^\/uploads\//i.test(url)) return origin + url;
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
        applyBrand(document); normalizeIcons(); fixBrokenImages(document); installMessageStabilization(); installAccessibilityGuards();
        loadOnce('/js/admin-support-bridge.js?v=20260916-5', 'admin_support_bridge');
        // PWA install: /pwa-manager.js is the single controller (beforeinstallprompt, install UI, service-worker
        // registration) and is linked directly from each page's <head>. The old js/pwa-mobile-install.js loader that
        // used to live here was a second, competing owner of the same one-time event and has been removed.
        if (/\/index\.html$/i.test(location.pathname) || location.pathname === '/') loadOnce('/js/pwa-identity.js?v=20260916-5', 'pwa_identity');
        if (/\/group\.html$/i.test(location.pathname)) { loadOnce('/js/group-panel-cleanup.js?v=20260916-5', 'group_panel_cleanup'); }
        if (/\/chat\.html$/i.test(location.pathname)) loadOnce('/js/friend-request-center-action.js?v=20260916-5', 'friend_request_center_action');
        if (/\/Tools\.html$/i.test(location.pathname) || /\/tools\.html$/i.test(location.pathname)) { loadOnce('/js/marketplace-accommodation-service.js?v=20260916-6', 'marketplace_accommodation_service'); loadOnce('/js/accommodation-marketplace-surface.js?v=20260916-6', 'accommodation_marketplace_surface'); loadOnce('/js/invoice-ui.js?v=20260916-5', 'invoice_ui'); loadOnce('/js/marketplace-image-hardening.js?v=20260916-5', 'marketplace_image_hardening'); }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
    if (window.MutationObserver) new MutationObserver(function (mutations) { mutations.forEach(function (mutation) { mutation.addedNodes && mutation.addedNodes.forEach(function (node) { if (node.nodeType === 1) { applyBrand(node); fixBrokenImages(node); } }); }); }).observe(document.documentElement, { childList: true, subtree: true });
    // Shared profile-photo resolver (Google / manual / relative paths / initials fallback) for EVERY page.
    loadOnce('/js/avatar-fix.js?v=20260924-1', 'avatar_fix');
    console.log('[Config] Necpa runtime configuration loaded. Backend:', configuredOrigin || '(missing)');
})();