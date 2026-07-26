﻿// js/config.js - SIMPLE VERSION
console.log('Loading configuration...');

window.__isLocalEnvironment = window.__isLocalEnvironment || function(hostname) {
    const host = String(hostname || window.location.hostname || '').toLowerCase();
    if (!host) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    if (host.endsWith('.local')) return true;
    if (host.startsWith('192.168.') || host.startsWith('10.')) return true;
    return /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
};

window.__isProductionConsoleHost = window.__isProductionConsoleHost || function() {
    const host = String(window.location?.hostname || '').toLowerCase();
    return !!host && !window.__isLocalEnvironment(host);
};

window.__getApiOrigin = window.__getApiOrigin || function() {
    const host = String(window.location?.hostname || '').toLowerCase();
    if (window.__isLocalEnvironment(host)) return 'http://localhost:4000';
    if (host.includes('nexopa.onrender.com')) return 'https://nexopa-fy56.onrender.com';
    return 'https://nexopa-fy56.onrender.com';
};

window.__getApiBase = window.__getApiBase || function() {
    return `${window.__getApiOrigin()}/api`;
};

window.__kynShouldFilterConsole = window.__kynShouldFilterConsole || function(level, args) {
    if (!window.__isProductionConsoleHost || !window.__isProductionConsoleHost()) return false;
    if (window.__ALLOW_VERBOSE_CONSOLE__ === true) return false;

    const first = args && args.length ? String(args[0] ?? '') : '';
    const second = args && args.length > 1 ? String(args[1] ?? '') : '';
    const joined = `${first} ${second}`.trim();

    const noisyPatterns = [
        /^\[SW\] Cache hit:/,
        /^\[LOCAL SAVE]/,
        /^\[LOCAL LOAD]/,
        /^\[SAIC] Stage /,
        /^\[ENV] ✅ Detected PRODUCTION environment/,
        /^\[PARENT-SYNC] Parent ready signal received/,
        /^\[Message HTML] Received message:/,
        /^\[Navigation] (Attaching|Found navigation|Setting up listener|Navigation element clicked|navigateToPage called with:|Page changed from|Hiding all iframe containers|Hiding:|Target element:|Target before|Target after)/,
        /^\[authorizedRequest] /,
        /^\[[0-9]{4}-.*\[FriendCore:authorizedRequest] \[INFO]/,
        /^\[[0-9]{4}-.*\[FriendCore:ParentCommunication] \[INFO] API_RESPONSE received/,
        /^\[Tool-ui] Force binding all UI events/,
        /^\[Tool-ui] Force binding complete/,
        /^\[DIRECT]/,
        /^\[ToolUIPatch]/,
        /^\[ToolPatch] Using fresh tool cache/,
        /^\[Calls UI] Received CONTACTS_UPDATE:/,
        /^\[messagesUI] (Lifecycle:|Core not ACTIVE yet|Triggering real data fetch from backend|Ensuring chat panel open with ID:|Opening existing conversation instantly:|loadChatByFriendId called with:)/,
        /^\[ChatManager] (Skipping duplicate conversation for friend|📥 Received conversations response:|📥 Extracted \d+ chats from response|Set \d+ unique conversations)/,
        /^\[FriendManager] (📤 Fetching friends from backend|📥 Received \d+ friends from backend)/,
        /^\[SessionManager] Duplicate session ignored/,
        /^\[Lifecycle] PARENT_READY already received/,
        /^\[KynSyncGuard] Stale lock released/,
        /^\[status] ⚠️ WARNING: Duplicate /,
        /^\[status] ⚠️ WARNING: secureApiCall: bridge failed/,
        /^\[ParentConnectionManager] Ignored invalid session data from parent/,
        /^\[KeepAlive] Ping sent, status:/,
        /^\[UI] allUsersLoaded event/,
        /^\[Init] Loading all users for discovery/,
        /^\[Init] All users loaded:/,
        /^\[FriendSync] Starting full sync/,
        /^\[Tools]\[DirectListener] Received:/,
        /^\[Tools]\[DirectListener] Processing /
    ];

    return noisyPatterns.some((pattern) => pattern.test(joined));
};

if (!window.__KYNECTA_CONSOLE_FILTER_PATCHED__) {
    window.__KYNECTA_CONSOLE_FILTER_PATCHED__ = true;
    window.__kynOriginalConsole = window.__kynOriginalConsole || {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
    };

    ['log', 'info', 'warn', 'debug'].forEach(function(level) {
        const original = window.__kynOriginalConsole[level];
        console[level] = function() {
            const args = Array.prototype.slice.call(arguments);
            if (window.__kynShouldFilterConsole && window.__kynShouldFilterConsole(level, args)) {
                return;
            }
            return original.apply(console, args);
        };
    });
}

window.__rewriteApiUrl = window.__rewriteApiUrl || function(input) {
    const apiOrigin = String(window.__getApiOrigin ? window.__getApiOrigin() : '').replace(/\/+$/, '');
    if (!apiOrigin || !input) return input;

    const normalize = function(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
        if (/^\/api(\/|$)/i.test(rawUrl)) return `${apiOrigin}${rawUrl}`;
        if (/^api(\/|$)/i.test(rawUrl)) return `${apiOrigin}/${rawUrl.replace(/^\/+/, '')}`;

        try {
            const parsed = new URL(rawUrl, window.location.origin);
            const isApiPath = /^\/api(\/|$)/i.test(parsed.pathname);
            const isLegacyLocalOrigin = /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname) && parsed.port === '3000';
            const isSameOriginApi = parsed.origin === window.location.origin && isApiPath;

            if (isApiPath && (isLegacyLocalOrigin || isSameOriginApi)) {
                return `${apiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
            }
        } catch (_error) {}

        return rawUrl;
    };

    if (typeof Request !== 'undefined' && input instanceof Request) {
        const rewrittenUrl = normalize(input.url);
        if (!rewrittenUrl || rewrittenUrl === input.url) return input;
        return new Request(rewrittenUrl, input);
    }

    return normalize(input);
};

if (!window.__KYNECTA_API_FETCH_PATCHED__ && typeof window.fetch === 'function') {
    window.__KYNECTA_API_FETCH_PATCHED__ = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
        return nativeFetch(window.__rewriteApiUrl(input), init);
    };
}

if (!window.__KYNECTA_API_XHR_PATCHED__ && typeof XMLHttpRequest !== 'undefined') {
    window.__KYNECTA_API_XHR_PATCHED__ = true;
    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        const rewrittenUrl = window.__rewriteApiUrl ? window.__rewriteApiUrl(url) : url;
        return nativeOpen.apply(this, [method, rewrittenUrl].concat(Array.prototype.slice.call(arguments, 2)));
    };
}

// Helper function
window.apiCall = async function(endpoint, options = {}) {
    const baseUrl = window.BACKEND_URL || (typeof window.__getApiBase === 'function' ? window.__getApiBase() : 'https://nexopa-fy56.onrender.com/api');
    const url = `${baseUrl}${endpoint}`;
    console.log('Calling:', url);
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    // Add token if exists
    const token = localStorage.getItem('authToken');
    if (token) {
        defaultOptions.headers['Authorization'] = `Bearer ${token}`;
    }
    
    const finalOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers,
        }
    };
    
    try {
        const response = await fetch(url, finalOptions);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('API Error:', error);
        return { success: false, message: error.message };
    }
};

console.log('Config loaded.');
