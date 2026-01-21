﻿// js/config.js - SIMPLE VERSION
console.log('🔧 Loading configuration...');

// REMOVED hardcoded localhost URL - using api.js BACKEND_URL instead
// Backend URL should be set in api.js or by main application

// Helper function
window.apiCall = async function(endpoint, options = {}) {
    // Use BACKEND_URL from api.js or fallback to Render URL if not set
    const baseUrl = window.BACKEND_URL || 'https://moodchat-fy56.onrender.com/api';
    const url = `${baseUrl}${endpoint}`;
    console.log('📡 Calling:', url);
    
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

console.log('✅ Config loaded.');