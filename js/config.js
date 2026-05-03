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
    if (window.__isLocalEnvironment(host)) return 'http://localhost:3000';
    if (host.includes('moodfronted.onrender.com')) return 'https://moodchat-fy56.onrender.com';
    return 'https://moodchat-fy56.onrender.com';
};

window.__getApiBase = window.__getApiBase || function() {
    return `${window.__getApiOrigin()}/api`;
};

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
