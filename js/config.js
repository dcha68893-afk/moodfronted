// js/config.js - SIMPLE VERSION
console.log('🔧 Loading configuration...');

// ALWAYS use localhost:4000 for now
window.API_BASE_URL = 'http://localhost:4000';

// Helper function
window.apiCall = async function(endpoint, options = {}) {
    const url = `${window.API_BASE_URL}${endpoint}`;
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

console.log('✅ Config loaded. Backend URL:', window.API_BASE_URL);
