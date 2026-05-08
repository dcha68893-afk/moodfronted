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

window.__getApiOrigin = window.__getApiOrigin || function() {
    const host = String(window.location?.hostname || '').toLowerCase();
    if (window.__isLocalEnvironment(host)) return 'http://localhost:4000';
    if (host.includes('moodfronted.onrender.com')) return 'https://moodchat-fy56.onrender.com';
    return 'https://moodchat-fy56.onrender.com';
};

window.__getApiBase = window.__getApiBase || function() {
    return `${window.__getApiOrigin()}/api`;
};

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
    const baseUrl = window.BACKEND_URL || (typeof window.__getApiBase === 'function' ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api');
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
