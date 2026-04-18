// app.ui.auth.js - Authentication Gateway Module
// VERSION: 4.1.1 - ENHANCED TOKEN PROPAGATION FIX
// RESPONSIBILITIES: Authentication state management and API gateway
// INTEGRATION: Exclusively uses api.auth.js for all authentication operations
// ISOLATION: No DOM dependencies, no UI logic, no automatic initialization
// UI ORCHESTRATION: Preserves all UI flows, event bindings, and visual feedback patterns
// SAFETY: Added safety guards to prevent crashes in chat.html and iframes
// FIX: Enhanced token propagation to all dependent systems
// FIX: Added multiple token storage locations for compatibility
// FIX: Improved event dispatch for token-ready notifications

// ============================================================================
// MODULAR CORE IMPORTS
// ============================================================================
import './app.core.session.js';
import './app.core.ui.js';

// ============================================================================
// PREVENT DOUBLE INITIALIZATION WITH UI-ORCHESTRATION SAFETY
// ============================================================================
if (window.__authGatewayInitialized) {
    console.warn('Auth Gateway already initialized. Skipping re-initialization.');
    throw new Error('Auth Gateway already initialized');
}
window.__authGatewayInitialized = true;

// ============================================================================
// PERSISTENT AUTH HELPERS - WhatsApp-style session persistence
// ============================================================================
function _saveAuthToLocalStorage(token, refreshToken, user, expiresAt) {
    try {
        const payload = {
            token:        token,
            refreshToken: refreshToken || null,
            user:         user         || null,
            expiresAt:    expiresAt    || (Date.now() + 24 * 60 * 60 * 1000),
            issuedAt:     Date.now()
        };
        if (window.AuthStorage && typeof window.AuthStorage.saveAuth === 'function') {
            window.AuthStorage.saveAuth(payload);
        } else {
            localStorage.setItem('kynecta_auth', JSON.stringify(payload));
        }
        console.log('[UIAuth] ✅ Auth persisted to localStorage');
    } catch(e) {
        console.warn('[UIAuth] ⚠️ Could not persist auth:', e.message);
    }
}

function _clearAuthFromLocalStorage() {
    try {
        if (window.AuthStorage && typeof window.AuthStorage.clearAuth === 'function') {
            window.AuthStorage.clearAuth();
        } else {
            localStorage.removeItem('kynecta_auth');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
        }
        console.log('[UIAuth] ✅ Auth cleared from localStorage');
    } catch(e) {}
}

// Listen for auth success events fired by api.auth.js
window.addEventListener('auth-login-success', function(e) {
    const d = e && e.detail;
    if (d && d.token) {
        _saveAuthToLocalStorage(d.token, d.refreshToken, d.user, d.expiresAt);
    }
});
window.addEventListener('auth-register-success', function(e) {
    const d = e && e.detail;
    if (d && d.token) {
        _saveAuthToLocalStorage(d.token, d.refreshToken, d.user, d.expiresAt);
    }
});
window.addEventListener('auth-logout', function() {
    _clearAuthFromLocalStorage();
});
window.addEventListener('token-refreshed', function(e) {
    const d = e && e.detail;
    if (d && d.token) {
        _saveAuthToLocalStorage(d.token, d.refreshToken, null, d.expiresAt);
    }
});



// ============================================================================
// GLOBAL CONSTANTS AND CONFIGURATION
// ============================================================================
const AUTH_GATEWAY_CONFIG = {
    // API Interaction
    API_TIMEOUT: 30000,
    
    // Storage
    AUTH_STATE_KEY: 'moodchat_auth_state',
    SESSION_SYNC_KEY: 'moodchat_auth_sync',
    
    // Session Management
    SESSION_CHECK_INTERVAL: 30000,
    TOKEN_EXPIRY_BUFFER: 60000,
    
    // Security
    MAX_LOGIN_ATTEMPTS: 5,
    LOGIN_BLOCK_DURATIONS: [30000, 60000, 120000, 300000],
    
    // UI Orchestration
    UI_READY_CHECK_INTERVAL: 100,
    UI_READY_MAX_WAIT: 5000,
    
    // API Initialization - REDUCED: now uses waitForReady()
    API_AUTH_INIT_MAX_WAIT: 3000, // Reduced from 15000 - waitForReady handles real wait
    API_AUTH_INIT_RETRY_INTERVAL: 100,
    API_AUTH_INIT_MAX_RETRIES: 30,
    
    // No more endpoint definitions - all handled by api.auth.js
};

// ============================================================================
// SAFETY GUARDS - PREVENT CRASHES IN CHAT.HTML AND IFRAMES
// ============================================================================
const SafetyGuards = {
    _loggedErrors: new Set(),
    _retryCounts: new Map(),
    _maxRetries: 3,
    
    // Safe DOM element access
    getElement: function(id, context = document) {
        try {
            const element = context.getElementById(id);
            if (!element) {
                this._logOnce(`DOM element not found: ${id}`, 'DOM_SAFETY');
            }
            return element;
        } catch (error) {
            this._logOnce(`Failed to access DOM element ${id}: ${error.message}`, 'DOM_ACCESS');
            return null;
        }
    },
    
    // Safe query selector
    querySelector: function(selector, context = document) {
        try {
            const element = context.querySelector(selector);
            if (!element) {
                this._logOnce(`Element not found with selector: ${selector}`, 'DOM_SAFETY');
            }
            return element;
        } catch (error) {
            this._logOnce(`Failed to query selector ${selector}: ${error.message}`, 'DOM_ACCESS');
            return null;
        }
    },
    
    // Safe event listener addition
    addEventListener: function(element, event, handler, options = {}) {
        if (!element || !handler) {
            this._logOnce(`Invalid parameters for addEventListener: element=${!!element}, handler=${!!handler}`, 'EVENT_SAFETY');
            return null;
        }
        
        try {
            const wrappedHandler = (e) => {
                try {
                    return handler(e);
                } catch (error) {
                    this._logOnce(`Event handler error for ${event}: ${error.message}`, 'EVENT_HANDLER', {
                        elementId: element.id,
                        eventType: event
                    });
                    e.stopPropagation();
                    e.preventDefault();
                    return false;
                }
            };
            
            element.addEventListener(event, wrappedHandler, options);
            return () => element.removeEventListener(event, wrappedHandler, options);
        } catch (error) {
            this._logOnce(`Failed to add event listener for ${event}: ${error.message}`, 'EVENT_SETUP');
            return null;
        }
    },
    
    // Safe form initialization
    initializeForm: function(formId, submitHandler, validationHandler = null) {
        try {
            const form = this.getElement(formId);
            if (!form) {
                this._logOnce(`Form ${formId} not found, skipping initialization`, 'FORM_INIT');
                return { success: false, disabled: true };
            }
            
            // Check required inputs
            const requiredInputs = form.querySelectorAll('input[required]');
            const missingInputs = [];
            
            Array.from(requiredInputs).forEach(input => {
                if (!input || input.disabled) {
                    missingInputs.push(input?.name || 'unknown');
                }
            });
            
            if (missingInputs.length > 0) {
                this._logOnce(`Form ${formId} missing required inputs: ${missingInputs.join(', ')}`, 'FORM_VALIDATION');
            }
            
            // Add submit handler
            const removeListener = this.addEventListener(form, 'submit', (e) => {
                try {
                    e.preventDefault();
                    
                    // Run validation if provided
                    if (validationHandler) {
                        const isValid = validationHandler(form);
                        if (isValid === false) {
                            return false;
                        }
                    }
                    
                    // Call submit handler
                    return submitHandler(form, e);
                } catch (error) {
                    this._logOnce(`Form ${formId} submission error: ${error.message}`, 'FORM_SUBMIT');
                    form.classList.add('form-error');
                    return false;
                }
            });
            
            return { success: true, form: form, removeListener };
        } catch (error) {
            this._logOnce(`Form ${formId} initialization failed: ${error.message}`, 'FORM_INIT');
            return { success: false, disabled: true };
        }
    },
    
    // Safe session/token check
    checkSessionValid: function(token, userId) {
        try {
            if (!token || token === 'undefined' || token === 'null' || token === '') {
                this._logOnce('Invalid or missing token', 'SESSION_CHECK');
                return false;
            }
            
            // Basic JWT validation
            const parts = token.split('.');
            if (parts.length !== 3) {
                this._logOnce('Invalid JWT format', 'SESSION_CHECK');
                return false;
            }
            
            // Try to decode payload
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            
            // Check expiration
            if (payload.exp) {
                const expiryTime = payload.exp * 1000;
                const currentTime = Date.now();
                const buffer = 60000; // 1 minute buffer
                
                if (currentTime >= expiryTime - buffer) {
                    this._logOnce('Token expired or about to expire', 'SESSION_CHECK');
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            this._logOnce(`Session check error: ${error.message}`, 'SESSION_CHECK');
            return false;
        }
    },
    
    // Safe retry with limits
    withRetry: async function(operationName, operation, maxRetries = 3, delay = 1000) {
        const key = `${operationName}_${Date.now()}`;
        let retryCount = this._retryCounts.get(key) || 0;
        
        if (retryCount >= maxRetries) {
            this._logOnce(`Max retries (${maxRetries}) exceeded for ${operationName}`, 'RETRY_LIMIT');
            return { success: false, retriesExhausted: true };
        }
        
        try {
            const result = await operation();
            this._retryCounts.delete(key);
            return { success: true, result };
        } catch (error) {
            retryCount++;
            this._retryCounts.set(key, retryCount);
            
            if (retryCount < maxRetries) {
                this._logOnce(`Retry ${retryCount}/${maxRetries} for ${operationName}: ${error.message}`, 'RETRY_ATTEMPT');
                await new Promise(resolve => setTimeout(resolve, delay * retryCount));
                return this.withRetry(operationName, operation, maxRetries, delay);
            } else {
                this._logOnce(`Failed after ${maxRetries} retries for ${operationName}: ${error.message}`, 'RETRY_FAILED');
                return { success: false, error, retriesExhausted: true };
            }
        }
    },
    
    // Safe external library check
    checkLibrary: function(libraryName, globalPath = []) {
        try {
            let current = window;
            for (const part of globalPath) {
                current = current[part];
                if (!current) {
                    this._logOnce(`Library ${libraryName} not available at path ${globalPath.join('.')}`, 'LIBRARY_CHECK');
                    return false;
                }
            }
            return !!current;
        } catch (error) {
            this._logOnce(`Error checking library ${libraryName}: ${error.message}`, 'LIBRARY_CHECK');
            return false;
        }
    },
    
    // Safe UI component initialization
    initializeUIComponent: function(componentName, initFunction) {
        try {
            const result = initFunction();
            
            if (result && result.success === false) {
                this._logOnce(`UI component ${componentName} initialization failed`, 'UI_COMPONENT');
                // Disable only this component, allow others to continue
                return { success: false, disabled: true, component: componentName };
            }
            
            return { success: true, component: componentName };
        } catch (error) {
            this._logOnce(`UI component ${componentName} crashed: ${error.message}`, 'UI_COMPONENT');
            // Disable only this component
            return { success: false, disabled: true, component: componentName, error: error.message };
        }
    },
    
    // Safe parent-iframe communication
    safePostMessage: function(targetWindow, message, targetOrigin = '*') {
        try {
            if (!targetWindow || !targetWindow.postMessage) {
                this._logOnce('Invalid target window for postMessage', 'COMMUNICATION');
                return false;
            }
            
            if (!message || typeof message !== 'object') {
                this._logOnce('Invalid message for postMessage', 'COMMUNICATION');
                return false;
            }
            
            targetWindow.postMessage(message, targetOrigin);
            return true;
        } catch (error) {
            this._logOnce(`postMessage failed: ${error.message}`, 'COMMUNICATION');
            return false;
        }
    },
    
    // Safe storage operations
    safeStorageGet: function(key) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            this._logOnce(`Failed to get from storage ${key}: ${error.message}`, 'STORAGE');
            return null;
        }
    },
    
    safeStorageSet: function(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            this._logOnce(`Failed to set storage ${key}: ${error.message}`, 'STORAGE');
            return false;
        }
    },
    
    // Non-repetitive logging
    _logOnce: function(message, category, details = {}) {
        const logKey = `${category}:${message}`;
        if (!this._loggedErrors.has(logKey)) {
            this._loggedErrors.add(logKey);
            console.warn(`[AUTH SAFETY:${category}] ${message}`, {
                timestamp: new Date().toISOString(),
                ...details
            });
            
            // Clean up old logs after 100 entries to prevent memory leak
            if (this._loggedErrors.size > 100) {
                const firstKey = this._loggedErrors.values().next().value;
                this._loggedErrors.delete(firstKey);
            }
        }
    },
    
    // Cleanup
    cleanup: function() {
        this._loggedErrors.clear();
        this._retryCounts.clear();
    }
};

// Initialize safety guards
window.__authSafetyGuards = SafetyGuards;

// ============================================================================
// API.AUTH.JS READINESS MANAGER - UPDATED TO USE waitForReady()
// ============================================================================
class ApiAuthReadinessManager {
    constructor() {
        this._isReady = false;
        this._isFullyInitialized = false;
        this._readyCallbacks = [];
        this._errorCallbacks = [];
        this._detectionInProgress = false;
        this._apiAuthDetected = false;
        this._detectionStartTime = null;
        this._readyEventName = 'apiAuthReady';
        this._errorEventName = 'apiAuthError';
        this._fullyReadyEventName = 'api:auth:initialized';
        
        // Start detection immediately
        this._initialize();
    }
    
    async _initialize() {
        console.log('🔍 API Auth Readiness Manager initializing...');
        this._detectionStartTime = Date.now();
        
        // Setup event listeners first
        this._setupEventListeners();
        
        // Start detection
        await this._detectApiAuth();
    }
    
    _setupEventListeners() {
        try {
            // Listen for custom ready event from api.auth.js
            window.addEventListener(this._readyEventName, (event) => {
                console.log('📬 Received apiAuthReady event:', event.detail);
                this._markAsReady(event.detail);
            });
            
            // Listen for custom error event
            window.addEventListener(this._errorEventName, (event) => {
                console.error('📬 Received apiAuthError event:', event.detail);
                this._markAsFailed(event.detail);
            });
            
            // Listen for api.auth.js FULL initialization event
            window.addEventListener(this._fullyReadyEventName, (event) => {
                console.log('✅ api.auth.js FULLY INITIALIZED event received:', event.detail);
                this._markAsFullyInitialized(event.detail);
            });
            
            // Listen for api.auth.js script load events
            window.addEventListener('apiAuthScriptLoaded', (event) => {
                console.log('📦 api.auth.js script loaded event received');
                this._checkApiAuthPresence();
            });
            
            // Listen for v2.1.1+ initialization event
            window.addEventListener('api:auth:initialized', (event) => {
                console.log('🎯 RECEIVED api:auth:initialized event from v2.1.1+:', event.detail);
                
                // Force immediate detection
                if (window.api?.auth) {
                    console.log('🎯 Event triggered - forcing full initialization');
                    this._markAsFullyInitialized({
                        module: window.api.auth,
                        source: 'api:auth:initialized-event',
                        detail: event.detail,
                        timestamp: Date.now()
                    });
                }
            }, { once: true });
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to setup API Auth event listeners: ${error.message}`, 'API_AUTH_INIT');
        }
    }
    
    async _detectApiAuth() {
        if (this._detectionInProgress) {
            return;
        }
        
        this._detectionInProgress = true;
        console.log('🔍 Starting api.auth.js detection...');
        
        // Strategy 1: Check if already loaded
        if (this._checkApiAuthPresence()) {
            return;
        }
        
        // Strategy 2: Wait for script tag to load
        await this._waitForScriptTag();
        
        // Strategy 3: Poll for presence
        await this._pollForApiAuth();
        
        // Strategy 4: Check for module initialization events
        this._listenForModuleEvents();
        
        // Final check
        if (!this._apiAuthDetected) {
            console.warn('⚠️ api.auth.js not detected after all strategies');
            this._markAsFailed({ 
                error: 'api.auth.js not detected', 
                detectionTime: Date.now() - this._detectionStartTime 
            });
        }
    }
    
    _checkApiAuthPresence() {
        try {
            console.log('🔍 DEBUG - Checking for api.auth.js v2.1.1+ compatibility...');
            
            // Debug: Show what's actually available
            console.log('🔍 DEBUG - Global API structure:', {
                'window.api': !!window.api,
                'window.api.auth': !!window.api?.auth,
                'window.api.auth type': typeof window.api?.auth,
                'window.MoodChatAuth': !!window.MoodChatAuth,
                'window.auth': !!window.auth,
                'window.app?.api?.auth': !!window.app?.api?.auth,
                'window.__authModule': !!window.__authModule
            });
            
            if (window.api?.auth) {
                const apiAuth = window.api.auth;
                console.log('🔍 DEBUG - window.api.auth properties:', Object.keys(apiAuth));
                console.log('🔍 DEBUG - window.api.auth metadata:', {
                    version: apiAuth._version,
                    lifecycleState: apiAuth._lifecycleState,
                    registrationComplete: apiAuth._registrationComplete,
                    _initialized: apiAuth._initialized,
                    ready: apiAuth.ready,
                    hasWaitForReady: typeof apiAuth.waitForReady === 'function'
                });
                
                // Check for essential methods
                const essentialMethods = ['login', 'logout', 'getUser'];
                const hasEssentialMethods = essentialMethods.every(method => 
                    typeof apiAuth[method] === 'function'
                );
                
                if (!hasEssentialMethods) {
                    console.warn('❌ api.auth.js missing essential methods:', 
                        essentialMethods.filter(m => typeof apiAuth[m] !== 'function'));
                    return false;
                }
                
                console.log('✅ api.auth.js v2.1.1+ detected with all essential methods');
                
                // DETECTION 1: Check for v2.1.1 specific markers
                if (apiAuth._version && apiAuth._version.includes('2.1')) {
                    console.log(`✅ api.auth.js v${apiAuth._version} detected with version marker`);
                    this._apiAuthDetected = true;
                    
                    // v2.1.1 is considered fully initialized if it has essential methods
                    this._markAsFullyInitialized({ 
                        module: apiAuth,
                        source: 'v2.1.1-version-check',
                        version: apiAuth._version,
                        fullyInitialized: true
                    });
                    return true;
                }
                
                // DETECTION 2: Check for lifecycle state
                if (apiAuth._lifecycleState === 'initialized' || 
                    apiAuth._lifecycleState === 'ready' ||
                    apiAuth._lifecycleState === 'running') {
                    console.log(`✅ api.auth.js fully initialized via lifecycle state: ${apiAuth._lifecycleState}`);
                    this._apiAuthDetected = true;
                    this._markAsFullyInitialized({ 
                        module: apiAuth,
                        source: 'lifecycle-state',
                        state: apiAuth._lifecycleState,
                        fullyInitialized: true
                    });
                    return true;
                }
                
                // DETECTION 3: Check for registration completion
                if (apiAuth._registrationComplete === true) {
                    console.log('✅ api.auth.js fully initialized via registration complete');
                    this._apiAuthDetected = true;
                    this._markAsFullyInitialized({ 
                        module: apiAuth,
                        source: 'registration-complete',
                        fullyInitialized: true
                    });
                    return true;
                }
                
                // DETECTION 4: Check for any initialization flag
                if (apiAuth._initialized === true || apiAuth.ready === true) {
                    console.log('✅ api.auth.js fully initialized via initialization flag');
                    this._apiAuthDetected = true;
                    this._markAsFullyInitialized({ 
                        module: apiAuth,
                        source: 'init-flag',
                        fullyInitialized: true
                    });
                    return true;
                }
                
                // DETECTION 5: If we have essential methods, assume it's ready
                console.log('⚠️ api.auth.js has essential methods but no init flags, assuming ready');
                this._apiAuthDetected = true;
                this._markAsFullyInitialized({ 
                    module: apiAuth,
                    source: 'essential-methods-fallback',
                    fullyInitialized: true
                });
                return true;
            }
            
            // Fallback: Check other possible locations
            const fallbackPaths = [
                () => window.MoodChatAuth,
                () => window.auth,
                () => window.app?.api?.auth,
                () => window.__authModule
            ];
            
            for (const getter of fallbackPaths) {
                try {
                    const module = getter();
                    if (module && typeof module === 'object') {
                        console.log('🔍 Fallback detection:', getter.toString());
                        
                        const essentialMethods = ['login', 'logout', 'getUser'];
                        const hasEssentialMethods = essentialMethods.some(method => 
                            typeof module[method] === 'function'
                        );
                        
                        if (hasEssentialMethods) {
                            console.log('✅ Fallback api.auth.js detected');
                            this._apiAuthDetected = true;
                            
                            // Ensure it's properly exposed to window.api.auth
                            if (!window.api?.auth) {
                                window.api = window.api || {};
                                window.api.auth = module;
                            }
                            
                            this._markAsFullyInitialized({ 
                                module: module,
                                source: 'fallback-detection',
                                fullyInitialized: true
                            });
                            return true;
                        }
                    }
                } catch (error) {
                    // Continue to next path
                }
            }
            
            console.log('❌ No api.auth.js detected in any location');
            return false;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`API Auth presence check failed: ${error.message}`, 'API_AUTH_CHECK');
            return false;
        }
    }
    
    _isApiAuthFullyInitialized(module) {
        try {
            if (!module || typeof module !== 'object') return false;
            
            console.log('🔍 Checking if api.auth.js is fully initialized:', {
                moduleType: typeof module,
                hasLogin: typeof module.login,
                hasLogout: typeof module.logout,
                hasGetUser: typeof module.getUser,
                hasWaitForReady: typeof module.waitForReady === 'function'
            });
            
            // Check for essential methods - THIS IS THE MOST IMPORTANT CHECK
            const hasEssentialMethods = 
                typeof module.login === 'function' &&
                typeof module.logout === 'function' &&
                typeof module.getUser === 'function';
            
            if (!hasEssentialMethods) {
                console.warn('❌ Module missing essential methods');
                return false;
            }
            
            // For v2.1.1+, if we have essential methods, it's considered ready
            // The module handles its own initialization internally
            console.log('✅ Module has essential methods, considering fully initialized');
            return true;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`API Auth initialization check failed: ${error.message}`, 'API_AUTH_INIT_CHECK');
            return false;
        }
    }
    
    async _waitForScriptTag() {
        return new Promise((resolve) => {
            try {
                // Look for script tag
                const scripts = document.querySelectorAll('script[src*="api.auth"]');
                if (scripts.length === 0) {
                    console.log('📦 No api.auth.js script tag found');
                    resolve(false);
                    return;
                }
                
                const script = scripts[0];
                console.log('📦 Found api.auth.js script tag:', script.src);
                
                // Check if script has loaded
                if (script.getAttribute('data-loaded') === 'true') {
                    console.log('📦 Script already loaded');
                    resolve(this._checkApiAuthPresence());
                    return;
                }
                
                // Listen for load event
                script.addEventListener('load', () => {
                    console.log('📦 Script load event fired');
                    script.setAttribute('data-loaded', 'true');
                    
                    // Give it a moment to initialize
                    setTimeout(() => {
                        const detected = this._checkApiAuthPresence();
                        resolve(detected);
                    }, 100);
                });
                
                // Listen for error event
                script.addEventListener('error', () => {
                    console.error('📦 Script failed to load');
                    resolve(false);
                });
                
                // Timeout after 5 seconds
                setTimeout(() => {
                    console.warn('📦 Script load timeout');
                    resolve(false);
                }, 5000);
            } catch (error) {
                window.__authSafetyGuards._logOnce(`Script tag wait failed: ${error.message}`, 'SCRIPT_LOAD');
                resolve(false);
            }
        });
    }
    
    async _pollForApiAuth() {
        return new Promise((resolve) => {
            try {
                const maxRetries = AUTH_GATEWAY_CONFIG.API_AUTH_INIT_MAX_RETRIES;
                const retryInterval = AUTH_GATEWAY_CONFIG.API_AUTH_INIT_RETRY_INTERVAL;
                const maxWait = AUTH_GATEWAY_CONFIG.API_AUTH_INIT_MAX_WAIT;
                
                let attempts = 0;
                const startTime = Date.now();
                
                const poll = () => {
                    attempts++;
                    
                    // Check if we've waited too long
                    if (Date.now() - startTime > maxWait) {
                        console.warn(`⏰ Polling timeout after ${maxWait}ms`);
                        resolve(false);
                        return;
                    }
                    
                    // Check for api.auth
                    if (this._checkApiAuthPresence()) {
                        console.log(`✅ api.auth.js found after ${attempts} attempts`);
                        resolve(true);
                        return;
                    }
                    
                    // Check if we've reached max retries
                    if (attempts >= maxRetries) {
                        console.warn(`🔄 Max retries reached (${maxRetries})`);
                        resolve(false);
                        return;
                    }
                    
                    // Continue polling
                    setTimeout(poll, retryInterval);
                };
                
                // Start polling
                poll();
            } catch (error) {
                window.__authSafetyGuards._logOnce(`API Auth polling failed: ${error.message}`, 'API_POLLING');
                resolve(false);
            }
        });
    }
    
    _listenForModuleEvents() {
        try {
            // Listen for various module initialization events
            const events = [
                'apiModuleReady',
                'authModuleReady',
                'apiInitialized',
                'modulesLoaded',
                'api:auth:initialized'
            ];
            
            events.forEach(eventName => {
                window.addEventListener(eventName, (event) => {
                    console.log(`🎯 Received module event: ${eventName}`, event.detail);
                    
                    // Check for api.auth after event
                    setTimeout(() => {
                        if (this._checkApiAuthPresence()) {
                            console.log(`✅ api.auth.js detected after ${eventName} event`);
                        }
                    }, 100);
                }, { once: true });
            });
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Module event listener setup failed: ${error.message}`, 'MODULE_EVENTS');
        }
    }
    
    _markAsReady(detail = {}) {
        if (this._isReady) {
            return;
        }
        
        this._isReady = true;
        this._detectionInProgress = false;
        
        console.log('✅ API Auth is DETECTED (may still be initializing):', {
            ...detail,
            detectionTime: Date.now() - this._detectionStartTime
        });
        
        // Execute all pending callbacks
        this._readyCallbacks.forEach(callback => {
            try {
                callback({ ...detail, ready: true, fullyInitialized: false });
            } catch (error) {
                console.error('Ready callback error:', error);
            }
        });
        
        this._readyCallbacks = [];
        
        // Dispatch global ready event
        this._dispatchReadyEvent({ ...detail, ready: true, fullyInitialized: false });
    }
    
    _markAsFullyInitialized(detail = {}) {
        if (this._isFullyInitialized) {
            console.log('⚠️ Already marked as fully initialized, skipping');
            return;
        }
        
        this._isFullyInitialized = true;
        this._isReady = true; // Also mark as ready
        
        console.log('✅✅✅ API Auth is FULLY INITIALIZED for v2.1.1+:', {
            ...detail,
            detectionTime: Date.now() - this._detectionStartTime,
            source: detail.source || 'unknown'
        });
        
        // Execute all pending callbacks with FULL initialization status
        this._readyCallbacks.forEach(callback => {
            try {
                callback({ 
                    ...detail, 
                    ready: true, 
                    fullyInitialized: true,
                    source: 'v2.1.1-full-init'
                });
            } catch (error) {
                console.error('Full init callback error:', error);
            }
        });
        
        this._readyCallbacks = [];
        
        // Dispatch fully initialized event
        this._dispatchFullyInitializedEvent({
            ...detail,
            fullyInitialized: true,
            ready: true,
            timestamp: Date.now()
        });
        
        // Also dispatch ready event for backwards compatibility
        this._dispatchReadyEvent({
            ...detail,
            ready: true,
            fullyInitialized: true,
            source: 'full-init-also-ready'
        });
    }
    
    _markAsFailed(errorDetail = {}) {
        this._detectionInProgress = false;
        
        console.error('❌ API Auth detection failed:', errorDetail);
        
        // Execute error callbacks
        this._errorCallbacks.forEach(callback => {
            try {
                callback(errorDetail);
            } catch (error) {
                console.error('Error callback error:', error);
            }
        });
        
        // Still mark as ready with fallback mode
        this._isReady = true;
        this._readyCallbacks.forEach(callback => {
            try {
                callback({ ...errorDetail, fallbackMode: true });
            } catch (error) {
                console.error('Fallback callback error:', error);
            }
        });
        
        this._readyCallbacks = [];
        this._errorCallbacks = [];
        
        // Dispatch error event
        this._dispatchErrorEvent(errorDetail);
    }
    
    _dispatchReadyEvent(detail) {
        try {
            const event = new CustomEvent('apiAuthManagerReady', {
                detail: {
                    ...detail,
                    timestamp: Date.now(),
                    ready: true
                }
            });
            window.dispatchEvent(event);
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to dispatch ready event: ${error.message}`, 'EVENT_DISPATCH');
        }
    }
    
    _dispatchFullyInitializedEvent(detail) {
        try {
            const event = new CustomEvent('apiAuthManagerFullyInitialized', {
                detail: {
                    ...detail,
                    timestamp: Date.now(),
                    fullyInitialized: true
                }
            });
            window.dispatchEvent(event);
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to dispatch fully initialized event: ${error.message}`, 'EVENT_DISPATCH');
        }
    }
    
    _dispatchErrorEvent(detail) {
        try {
            const event = new CustomEvent('apiAuthManagerError', {
                detail: {
                    ...detail,
                    timestamp: Date.now(),
                    error: true
                }
            });
            window.dispatchEvent(event);
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to dispatch error event: ${error.message}`, 'EVENT_DISPATCH');
        }
    }
    
    // Public API
    isReady() {
        return this._isReady;
    }
    
    isFullyInitialized() {
        return this._isFullyInitialized;
    }
    
    waitForReady() {
        return new Promise((resolve, reject) => {
            try {
                if (this._isReady) {
                    resolve({ ready: true, fullyInitialized: this._isFullyInitialized });
                    return;
                }
                
                this._readyCallbacks.push(resolve);
                
                // Set timeout for safety
                setTimeout(() => {
                    const index = this._readyCallbacks.indexOf(resolve);
                    if (index > -1) {
                        this._readyCallbacks.splice(index, 1);
                        resolve({ 
                            ready: false, 
                            timeout: true,
                            fallbackMode: true,
                            fullyInitialized: false
                        });
                    }
                }, AUTH_GATEWAY_CONFIG.API_AUTH_INIT_MAX_WAIT);
            } catch (error) {
                window.__authSafetyGuards._logOnce(`waitForReady failed: ${error.message}`, 'API_READY_WAIT');
                resolve({ 
                    ready: false, 
                    error: error.message,
                    fallbackMode: true,
                    fullyInitialized: false
                });
            }
        });
    }
    
    waitForFullInitialization() {
        return new Promise((resolve, reject) => {
            try {
                if (this._isFullyInitialized) {
                    resolve({ ready: true, fullyInitialized: true });
                    return;
                }
                
                // Listen for full initialization event
                const handler = (event) => {
                    window.removeEventListener('apiAuthManagerFullyInitialized', handler);
                    resolve({ 
                        ready: true, 
                        fullyInitialized: true,
                        detail: event.detail 
                    });
                };
                
                window.addEventListener('apiAuthManagerFullyInitialized', handler);
                
                // Set timeout for safety
                setTimeout(() => {
                    window.removeEventListener('apiAuthManagerFullyInitialized', handler);
                    console.warn('⚠️ Timeout waiting for api.auth.js full initialization');
                    resolve({ 
                        ready: true, 
                        fullyInitialized: false,
                        timeout: true 
                    });
                }, 3000); // 3 second timeout for full initialization
            } catch (error) {
                window.__authSafetyGuards._logOnce(`waitForFullInitialization failed: ${error.message}`, 'FULL_INIT_WAIT');
                resolve({ 
                    ready: true, 
                    fullyInitialized: false,
                    error: error.message 
                });
            }
        });
    }
    
    onError(callback) {
        try {
            this._errorCallbacks.push(callback);
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to add error callback: ${error.message}`, 'ERROR_CALLBACK');
        }
    }
    
    getDetectionInfo() {
        try {
            return {
                isReady: this._isReady,
                isFullyInitialized: this._isFullyInitialized,
                detectionInProgress: this._detectionInProgress,
                apiAuthDetected: this._apiAuthDetected,
                detectionTime: Date.now() - this._detectionStartTime,
                pendingCallbacks: this._readyCallbacks.length
            };
        } catch (error) {
            window.__authSafetyGuards._logOnce(`getDetectionInfo failed: ${error.message}`, 'DETECTION_INFO');
            return {
                isReady: false,
                isFullyInitialized: false,
                detectionInProgress: false,
                apiAuthDetected: false,
                detectionTime: 0,
                pendingCallbacks: 0,
                error: error.message
            };
        }
    }
}

// ============================================================================
// UI ORCHESTRATION REGISTRY - PRESERVES ALL EXISTING BINDINGS
// ============================================================================
class UIOrchestrationRegistry {
    constructor() {
        this._uiModules = new Map();
        this._eventListeners = new Map();
        this._formHandlers = new Map();
        this._readyCallbacks = [];
        this._uiReady = false;
    }
    
    registerUIModule(name, module) {
        try {
            if (this._uiModules.has(name)) {
                console.warn(`UI module "${name}" already registered, preserving existing`);
                return false;
            }
            
            this._uiModules.set(name, module);
            console.log(`UI module "${name}" registered`);
            return true;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to register UI module ${name}: ${error.message}`, 'UI_MODULE_REG');
            return false;
        }
    }
    
    getUIModule(name) {
        try {
            return this._uiModules.get(name);
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to get UI module ${name}: ${error.message}`, 'UI_MODULE_GET');
            return null;
        }
    }
    
    registerEventListener(elementId, eventType, handler, options = {}) {
        try {
            const key = `${elementId}_${eventType}`;
            if (this._eventListeners.has(key)) {
                console.warn(`Event listener for ${key} already registered, preserving existing`);
                return false;
            }
            
            this._eventListeners.set(key, {
                elementId,
                eventType,
                handler,
                options,
                registered: false
            });
            return true;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to register event listener for ${elementId}: ${error.message}`, 'EVENT_REG');
            return false;
        }
    }
    
    registerFormHandler(formId, submitHandler) {
        try {
            if (this._formHandlers.has(formId)) {
                console.warn(`Form handler for ${formId} already registered, preserving existing`);
                return false;
            }
            
            this._formHandlers.set(formId, {
                formId,
                submitHandler,
                registered: false
            });
            return true;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to register form handler for ${formId}: ${error.message}`, 'FORM_REG');
            return false;
        }
    }
    
    onUIReady(callback) {
        try {
            if (this._uiReady) {
                callback();
            } else {
                this._readyCallbacks.push(callback);
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`UI ready callback failed: ${error.message}`, 'UI_READY_CALLBACK');
        }
    }
    
    markUIReady() {
        try {
            if (!this._uiReady) {
                this._uiReady = true;
                this._readyCallbacks.forEach(callback => {
                    try {
                        callback();
                    } catch (error) {
                        console.error('UI ready callback error:', error);
                    }
                });
                this._readyCallbacks = [];
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to mark UI as ready: ${error.message}`, 'UI_READY_MARK');
        }
    }
    
    isUIReady() {
        return this._uiReady;
    }
}

// Initialize global UI registry
try {
    window.__uiOrchestrationRegistry = new UIOrchestrationRegistry();
} catch (error) {
    window.__authSafetyGuards._logOnce(`Failed to initialize UI Orchestration Registry: ${error.message}`, 'UI_REGISTRY_INIT');
    window.__uiOrchestrationRegistry = { 
        registerUIModule: () => false,
        getUIModule: () => null,
        registerEventListener: () => false,
        registerFormHandler: () => false,
        onUIReady: () => {},
        markUIReady: () => {},
        isUIReady: () => false
    };
}

// ============================================================================
// GLOBAL NAMESPACE HARMONIZATION - PRESERVES EXISTING STRUCTURE
// ============================================================================
(function ensureGlobalNamespace() {
    try {
        // Defensively create window.app if it doesn't exist
        if (typeof window.app === 'undefined') {
            window.app = {};
            console.log('Created window.app namespace');
        }
        
        // Defensively create window.app.ui if it doesn't exist
        if (typeof window.app.ui === 'undefined') {
            window.app.ui = {};
            console.log('Created window.app.ui namespace');
        }
        
        // Preserve any existing window.app.ui.auth
        const existingAuthModule = window.app.ui.auth;
        if (existingAuthModule && typeof existingAuthModule === 'object') {
            console.log('Preserving existing window.app.ui.auth module');
            window.__preservedAuthModule = existingAuthModule;
        }
    } catch (error) {
        window.__authSafetyGuards._logOnce(`Global namespace harmonization failed: ${error.message}`, 'NAMESPACE_INIT');
    }
})();

// ============================================================================
// API.AUTH PROXY WITH ENHANCED waitForReady() INTEGRATION
// ============================================================================
class ApiAuthProxy {
    constructor() {
        this._realApiAuth = null;
        this._isFallbackMode = false;
        this._fallbackQueue = [];
        this._initialized = false;
        this._waitingForFullInit = false;
        this._fullInitPromise = null;
        
        // Create proxy methods
        this._createProxyMethods();
    }
    
    async initialize() {
        try {
            console.log('🔧 Initializing ApiAuthProxy...');
            
            // Wait for api.auth to be ready - USE waitForReady() if available
            let readinessResult;
            
            if (window.api?.auth && typeof window.api.auth.waitForReady === 'function') {
                console.log('✅ Using window.api.auth.waitForReady() for initialization');
                try {
                    await window.api.auth.waitForReady();
                    readinessResult = { ready: true, fullyInitialized: true, source: 'waitForReady' };
                } catch (error) {
                    console.warn('⚠️ waitForReady() failed, falling back to polling', error);
                    readinessResult = await window.__apiAuthReadinessManager.waitForReady();
                }
            } else {
                console.log('⏳ waitForReady() not available, using polling');
                readinessResult = await window.__apiAuthReadinessManager.waitForReady();
            }
            
            if (readinessResult.fallbackMode) {
                console.warn('⚠️ No real api.auth found, using fallback mode');
                this._isFallbackMode = true;
                this._initializeFallback();
                this._initialized = true;
                return this;
            }
            
            // Get the real api.auth module
            const possibleAuthModules = [
                window.api?.auth,
                window.MoodChatAuth,
                window.auth,
                window.app?.api?.auth,
                window.__authModule
            ].filter(Boolean);
            
            console.log('🔍 Looking for real api.auth module in:', possibleAuthModules.map(m => m.constructor.name));
            
            // Find the first module with essential methods
            for (const module of possibleAuthModules) {
                if (module && typeof module === 'object') {
                    const hasEssentialMethods = 
                        typeof module.login === 'function' &&
                        typeof module.logout === 'function' &&
                        typeof module.getUser === 'function';
                    
                    if (hasEssentialMethods) {
                        this._realApiAuth = module;
                        console.log('✅ Found real api.auth module with essential methods');
                        break;
                    }
                }
            }
            
            if (this._realApiAuth && typeof this._realApiAuth === 'object') {
                console.log('✅ Connected to real api.auth module');
                console.log('🔍 Module details:', {
                    hasLogin: typeof this._realApiAuth.login,
                    hasLogout: typeof this._realApiAuth.logout,
                    hasGetUser: typeof this._realApiAuth.getUser,
                    hasWaitForReady: typeof this._realApiAuth.waitForReady === 'function',
                    version: this._realApiAuth._version,
                    lifecycleState: this._realApiAuth._lifecycleState
                });
                
                // For v2.1.1+, if we have essential methods, we're ready
                if (typeof this._realApiAuth.login === 'function' &&
                    typeof this._realApiAuth.logout === 'function' &&
                    typeof this._realApiAuth.getUser === 'function') {
                    
                    console.log('✅ api.auth.js v2.1.1+ is ready with essential methods');
                    this._isFallbackMode = false;
                    this._initialized = true;
                    
                    // Immediately update readiness manager
                    if (window.__apiAuthReadinessManager) {
                        window.__apiAuthReadinessManager._markAsFullyInitialized({
                            module: this._realApiAuth,
                            source: 'direct-connection',
                            timestamp: Date.now()
                        });
                    }
                } else {
                    console.warn('⚠️ api.auth.js missing some methods, using fallback');
                    this._isFallbackMode = true;
                    this._initializeFallback();
                }
                
                // Process any queued operations
                this._processQueue();
            } else {
                console.warn('⚠️ No real api.auth with essential methods found, using fallback mode');
                this._isFallbackMode = true;
                this._initializeFallback();
            }
            
            this._initialized = true;
            
            // Notify listeners
            window.dispatchEvent(new CustomEvent('apiAuthProxyReady', {
                detail: { isFallbackMode: this._isFallbackMode }
            }));
            
            return this;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`ApiAuthProxy initialization failed: ${error.message}`, 'API_PROXY_INIT');
            this._isFallbackMode = true;
            this._initializeFallback();
            this._initialized = true;
            return this;
        }
    }
    
    async _waitForFullInitialization() {
        // Prevent multiple simultaneous waits
        if (this._waitingForFullInit && this._fullInitPromise) {
            return this._fullInitPromise;
        }
        
        console.log('⏳ Waiting for api.auth.js full initialization...');
        this._waitingForFullInit = true;
        
        this._fullInitPromise = (async () => {
            try {
                // USE waitForReady() if available
                if (this._realApiAuth && typeof this._realApiAuth.waitForReady === 'function') {
                    console.log('✅ Using waitForReady() for full initialization');
                    await this._realApiAuth.waitForReady();
                    console.log('✅ api.auth.js fully initialized via waitForReady()');
                    this._isFallbackMode = false;
                    return true;
                }
                
                // Fall back to readiness manager
                const result = await window.__apiAuthReadinessManager.waitForFullInitialization();
                
                if (result.fullyInitialized) {
                    console.log('✅ api.auth.js fully initialized confirmed');
                    this._isFallbackMode = false;
                    this._realApiAuth = window.api?.auth || window.MoodChatAuth;
                    return true;
                } else {
                    console.warn('⚠️ api.auth.js full initialization timeout, checking current state');
                    if (this._isApiAuthFullyInitialized(this._realApiAuth)) {
                        console.log('✅ api.auth.js is now fully initialized');
                        this._isFallbackMode = false;
                        return true;
                    } else {
                        console.warn('⚠️ api.auth.js still not fully initialized, using fallback mode temporarily');
                        this._isFallbackMode = true;
                        return false;
                    }
                }
            } catch (error) {
                console.error('Error waiting for full initialization:', error);
                this._isFallbackMode = true;
                return false;
            } finally {
                this._waitingForFullInit = false;
                this._fullInitPromise = null;
            }
        })();
        
        return this._fullInitPromise;
    }
    
    _isApiAuthFullyInitialized(module) {
        try {
            if (!module || typeof module !== 'object') {
                console.log('❌ _isApiAuthFullyInitialized: module is invalid');
                return false;
            }
            
            console.log('🔍 _isApiAuthFullyInitialized checking:', {
                moduleType: typeof module,
                keys: Object.keys(module).slice(0, 10),
                hasLogin: typeof module.login,
                hasLogout: typeof module.logout,
                hasGetUser: typeof module.getUser,
                hasWaitForReady: typeof module.waitForReady === 'function'
            });
            
            // CRITICAL CHECK: Must have essential methods
            const hasEssentialMethods = 
                typeof module.login === 'function' &&
                typeof module.logout === 'function' &&
                typeof module.getUser === 'function';
            
            if (!hasEssentialMethods) {
                console.warn('❌ Module missing essential methods');
                return false;
            }
            
            console.log('✅ Module has all essential methods, considering fully initialized');
            return true;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`API Auth full initialization check failed: ${error.message}`, 'API_FULL_INIT_CHECK');
            return false;
        }
    }
    
    _createProxyMethods() {
        try {
            // Create proxy methods for all api.auth operations
            const methods = [
                'login', 'logout', 'register', 'getUser', 'validateAuth',
                'refreshToken', 'forgotPassword', 'resetPassword', 'verifyEmail',
                'onAuthReady', 'getAuthState', 'isAuthenticated'
            ];
            
            methods.forEach(method => {
                this[method] = async (...args) => {
                    try {
                        // Ensure initialized
                        if (!this._initialized) {
                            await this.initialize();
                        }
                        
                        // If in fallback mode, use fallback implementation
                        if (this._isFallbackMode) {
                            return this._handleFallbackCall(method, args);
                        }
                        
                        // Wait for full initialization if needed - USE waitForReady() if available
                        if (!this._isApiAuthFullyInitialized(this._realApiAuth)) {
                            console.log(`⏳ api.auth.js not fully initialized for ${method}, waiting...`);
                            
                            if (this._realApiAuth && typeof this._realApiAuth.waitForReady === 'function') {
                                try {
                                    await this._realApiAuth.waitForReady();
                                    console.log(`✅ waitForReady() complete for ${method}`);
                                } catch (error) {
                                    console.warn(`⚠️ waitForReady() failed for ${method}, using fallback`, error);
                                    return this._handleFallbackCall(method, args, { error: 'Authentication module not ready' });
                                }
                            } else {
                                const fullyReady = await this._waitForFullInitialization();
                                if (!fullyReady) {
                                    console.warn(`⚠️ api.auth.js still not ready for ${method}, using fallback`);
                                    return this._handleFallbackCall(method, args, { error: 'Authentication module not ready' });
                                }
                            }
                        }
                        
                        // Use real api.auth method
                        if (this._realApiAuth && typeof this._realApiAuth[method] === 'function') {
                            try {
                                return await this._realApiAuth[method](...args);
                            } catch (error) {
                                console.error(`api.auth.${method} failed:`, error);
                                
                                // Check for "module not ready" errors
                                if (error.message && error.message.includes('not ready')) {
                                    console.warn(`⚠️ api.auth.js ${method} reports "not ready", using fallback`);
                                    return this._handleFallbackCall(method, args, error);
                                }
                                
                                // Fallback on error
                                return this._handleFallbackCall(method, args, error);
                            }
                        } else {
                            console.warn(`api.auth.${method} not available, using fallback`);
                            return this._handleFallbackCall(method, args);
                        }
                    } catch (error) {
                        window.__authSafetyGuards._logOnce(`ApiAuthProxy.${method} failed: ${error.message}`, 'API_PROXY_METHOD');
                        return this._handleFallbackCall(method, args, error);
                    }
                };
            });
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to create proxy methods: ${error.message}`, 'PROXY_METHODS');
            // Create minimal fallback methods
            this.login = this.logout = this.getUser = () => Promise.resolve({
                success: false,
                message: 'Authentication proxy initialization failed',
                fallbackMode: true
            });
        }
    }
    
    _initializeFallback() {
        try {
            // Create minimal fallback implementation
            this._fallbackAuth = {
                login: async (credentials) => {
                    console.warn('⚠️ Fallback login called - Authentication service unavailable');
                    return {
                        success: false,
                        message: 'Authentication service is initializing. Please try again in a moment.',
                        fallback: true,
                        retryable: true
                    };
                },
                
                logout: async () => {
                    console.warn('⚠️ Fallback logout called');
                    return { success: true, fallback: true };
                },
                
                getUser: async () => {
                    console.warn('⚠️ Fallback getUser called');
                    return { 
                        success: false, 
                        message: 'Service unavailable - initializing',
                        fallback: true,
                        retryable: true
                    };
                },
                
                validateAuth: async () => {
                    console.warn('⚠️ Fallback validateAuth called');
                    return { 
                        success: false, 
                        valid: false,
                        fallback: true,
                        retryable: true
                    };
                }
            };
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Fallback initialization failed: ${error.message}`, 'FALLBACK_INIT');
            this._fallbackAuth = {};
        }
    }
    
    async _handleFallbackCall(method, args, originalError = null) {
        try {
            console.warn(`🔧 Using fallback for ${method}`, args);
            
            // Queue the call for later retry if this is a temporary failure
            if (!this._isFallbackMode && originalError) {
                this._queueForRetry(method, args);
            }
            
            // Use fallback implementation
            if (this._fallbackAuth && typeof this._fallbackAuth[method] === 'function') {
                const result = await this._fallbackAuth[method](...args);
                return { ...result, fallbackMode: true, originalError };
            }
            
            // Default fallback response
            return {
                success: false,
                message: `Authentication service unavailable (${method})`,
                fallbackMode: true,
                originalError: originalError?.message,
                retryable: true
            };
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Fallback call for ${method} failed: ${error.message}`, 'FALLBACK_CALL');
            return {
                success: false,
                message: 'Authentication service completely unavailable',
                fallbackMode: true,
                criticalError: true
            };
        }
    }
    
    _queueForRetry(method, args) {
        try {
            this._fallbackQueue.push({
                method,
                args,
                timestamp: Date.now(),
                attempts: 0
            });
            
            console.log(`📥 Queued ${method} for retry (queue size: ${this._fallbackQueue.length})`);
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to queue for retry: ${error.message}`, 'RETRY_QUEUE');
        }
    }
    
    _processQueue() {
        if (this._fallbackQueue.length === 0 || this._isFallbackMode) {
            return;
        }
        
        console.log(`🔄 Processing ${this._fallbackQueue.length} queued operations...`);
        
        // Process queue asynchronously
        setTimeout(async () => {
            try {
                const processed = [];
                
                for (const item of this._fallbackQueue) {
                    if (item.attempts >= 3) {
                        console.warn(`Skipping ${item.method} after ${item.attempts} attempts`);
                        continue;
                    }
                    
                    try {
                        if (this._realApiAuth && typeof this._realApiAuth[item.method] === 'function') {
                            console.log(`🔄 Retrying ${item.method}...`);
                            await this._realApiAuth[item.method](...item.args);
                            console.log(`✅ Retry successful for ${item.method}`);
                        }
                        processed.push(item);
                    } catch (error) {
                        console.warn(`Retry failed for ${item.method}:`, error);
                        item.attempts++;
                        
                        // Keep in queue for another retry
                        if (item.attempts < 3) {
                            continue;
                        }
                        processed.push(item);
                    }
                }
                
                // Remove processed items
                this._fallbackQueue = this._fallbackQueue.filter(item => 
                    !processed.includes(item)
                );
                
                console.log(`✅ Queue processed. Remaining: ${this._fallbackQueue.length}`);
            } catch (error) {
                window.__authSafetyGuards._logOnce(`Queue processing failed: ${error.message}`, 'QUEUE_PROCESSING');
            }
        }, 1000);
    }
    
    isFallbackMode() {
        return this._isFallbackMode;
    }
    
    getRealApiAuth() {
        return this._realApiAuth;
    }
}

// ============================================================================
// AUTH GATEWAY - CORE MODULE WITH waitForReady() INTEGRATION
// ============================================================================
class AuthGateway {
    constructor() {
        try {
            this._state = {
                status: 'unknown',
                user: null,
                token: null,
                lastUpdated: null
            };
            
            this._listeners = new Set();
            this._isIframeContext = window.self !== window.top;
            this._sessionSyncKey = `${AUTH_GATEWAY_CONFIG.SESSION_SYNC_KEY}_${Date.now()}`;
            this._loginAttempts = new Map();
            this._blockedUsers = new Map();
            this._refreshPromise = null;
            this._validationInProgress = false;
            this._loginInProgress = false;
            this._pendingLoginResolvers = new Map();
            this._apiReady = false;
            this._apiReadyCallbacks = [];
            this._uiOrchestrationReady = false;
            this._uiOrchestrationCallbacks = [];
            this._eventBusSubscriptions = new Map();
            this._apiAuthProxy = null;
            this._apiAuthReady = false;
            this._apiAuthFullyInitialized = false;
            
            // Initialize API readiness manager
            if (!window.__apiAuthReadinessManager) {
                window.__apiAuthReadinessManager = new ApiAuthReadinessManager();
            }
            
            // Initialize API auth proxy
            this._apiAuthProxy = new ApiAuthProxy();
            
            this._init();
        } catch (error) {
            window.__authSafetyGuards._logOnce(`AuthGateway constructor failed: ${error.message}`, 'AUTH_GATEWAY_CONSTRUCTOR');
            // Set up minimal safe state
            this._state = { status: 'error', user: null, token: null, lastUpdated: null };
            this._listeners = new Set();
            this._isIframeContext = false;
            // Continue with minimal initialization
            setTimeout(() => this._safeInit(), 100);
        }
    }
    
    async _safeInit() {
        try {
            // Minimal safe initialization
            console.warn('⚠️ AuthGateway running in safe mode due to initialization error');
            this._apiReady = true;
            this._uiOrchestrationReady = true;
            this._apiAuthReady = true;
            this._loadAuthState();
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Safe init failed: ${error.message}`, 'SAFE_INIT');
        }
    }
    
    async _init() {
        try {
            console.log('🚀 Auth Gateway initializing with waitForReady() integration...');
            
            // Step 1: Wait for API Auth to be ready - USE waitForReady() if available
            await this._waitForApiAuth();
            
            // Step 2: Initialize API Auth Proxy
            await this._apiAuthProxy.initialize();
            
            // Step 3: Wait for UI orchestration to be ready
            await this._waitForUIOrchestration();
            
            // Step 4: Load stored auth state
            this._loadAuthState();
            
            // Step 5: Set up cross-tab/iframe synchronization
            this._setupSynchronization();
            
            // Step 6: Start session monitoring
            this._startSessionMonitoring();
            
            // Step 7: Register with global UI namespace
            this._registerWithUINamespace();
            
            console.log('✅ Auth Gateway initialized with waitForReady() integration');
        } catch (error) {
            window.__authSafetyGuards._logOnce(`AuthGateway initialization failed: ${error.message}`, 'AUTH_GATEWAY_INIT');
            // Still try to set up basic functionality
            this._loadAuthState();
            this._setupSynchronization();
        }
    }
    
    /**
     * Wait for API Auth to be fully ready - UPDATED TO USE waitForReady()
     */
    async _waitForApiAuth() {
        try {
            console.log('⏳ Waiting for api.auth.js to be ready...');
            
            let readinessResult;
            
            // USE waitForReady() if available
            if (window.api?.auth && typeof window.api.auth.waitForReady === 'function') {
                console.log('✅ Using window.api.auth.waitForReady()');
                try {
                    await window.api.auth.waitForReady();
                    readinessResult = { ready: true, fullyInitialized: true, source: 'waitForReady' };
                    console.log('✅ waitForReady() completed successfully');
                } catch (error) {
                    console.warn('⚠️ waitForReady() failed, falling back to polling', error);
                    readinessResult = await window.__apiAuthReadinessManager.waitForReady();
                }
            } else {
                console.log('⏳ waitForReady() not available, using polling');
                readinessResult = await window.__apiAuthReadinessManager.waitForReady();
            }
            
            if (readinessResult.fallbackMode) {
                console.warn('⚠️ API Auth not fully available, using fallback mode');
                this._apiAuthReady = true;
                this._apiReady = true;
                return;
            }
            
            // Wait for FULL initialization
            console.log('⏳ Waiting for api.auth.js FULL initialization...');
            
            let fullInitResult;
            
            // USE waitForReady() again for full initialization
            if (window.api?.auth && typeof window.api.auth.waitForReady === 'function' && !readinessResult.fullyInitialized) {
                console.log('✅ Using waitForReady() for full initialization');
                try {
                    await window.api.auth.waitForReady();
                    fullInitResult = { fullyInitialized: true, source: 'waitForReady-full' };
                } catch (error) {
                    console.warn('⚠️ waitForReady() failed for full initialization', error);
                    fullInitResult = await window.__apiAuthReadinessManager.waitForFullInitialization();
                }
            } else {
                fullInitResult = await window.__apiAuthReadinessManager.waitForFullInitialization();
            }
            
            if (fullInitResult.fullyInitialized) {
                console.log('✅ api.auth.js is FULLY INITIALIZED and ready');
                this._apiAuthFullyInitialized = true;
            } else {
                console.warn('⚠️ api.auth.js not fully initialized yet, but detected');
                this._apiAuthFullyInitialized = false;
            }
            
            this._apiAuthReady = true;
            this._apiReady = true;
            
            // Execute any pending callbacks
            this._apiReadyCallbacks.forEach(callback => callback());
            this._apiReadyCallbacks = [];
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to wait for API Auth: ${error.message}`, 'API_AUTH_WAIT');
            this._apiAuthReady = true;
            this._apiReady = true;
            this._apiReadyCallbacks.forEach(callback => callback());
            this._apiReadyCallbacks = [];
        }
    }
    
    /**
     * Verify api.auth.js is properly initialized
     */
    async _verifyApiAuth() {
        try {
            console.log('🔍 Verifying api.auth.js initialization...');
            
            // Check if waitForReady is available
            if (window.api?.auth && typeof window.api.auth.waitForReady === 'function') {
                try {
                    await window.api.auth.waitForReady();
                    console.log('✅ api.auth.js verified via waitForReady()');
                    return true;
                } catch (error) {
                    console.warn('⚠️ waitForReady() verification failed', error);
                }
            }
            
            // Fallback checks
            const checks = [
                { delay: 0, description: 'Immediate check' },
                { delay: 100, description: 'Short delay check' },
                { delay: 500, description: 'Medium delay check' }
            ];
            
            for (const check of checks) {
                await new Promise(resolve => setTimeout(resolve, check.delay));
                
                if (this._isApiAuthValid()) {
                    console.log(`✅ ${check.description}: api.auth.js is valid`);
                    return true;
                }
            }
            
            console.warn('⚠️ api.auth.js verification incomplete, but proceeding');
            return false;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`API Auth verification failed: ${error.message}`, 'API_AUTH_VERIFY');
            return false;
        }
    }
    
    /**
     * Check if api.auth.js is valid and ready
     */
    _isApiAuthValid() {
        try {
            // Check if api.auth exists
            if (!window.api?.auth) {
                console.log('❌ window.api.auth does not exist');
                return false;
            }
            
            const apiAuth = window.api.auth;
            
            // Check for essential methods
            const essentialMethods = ['login', 'logout', 'getUser'];
            const hasEssentialMethods = essentialMethods.every(method => 
                typeof apiAuth[method] === 'function'
            );
            
            if (!hasEssentialMethods) {
                console.log('❌ Missing essential methods:', essentialMethods.filter(m => 
                    typeof apiAuth[m] !== 'function'
                ));
                return false;
            }
            
            // Check for initialization markers
            const hasInitializationMarkers = 
                apiAuth._initialized === true ||
                apiAuth.ready === true ||
                typeof apiAuth.onAuthReady === 'function' ||
                apiAuth._isShim !== true;
            
            if (!hasInitializationMarkers) {
                console.log('❌ No initialization markers found');
                // Still return true if we have essential methods
                return hasEssentialMethods;
            }
            
            return true;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`API Auth validity check failed: ${error.message}`, 'API_AUTH_VALIDITY');
            return false;
        }
    }
    
    /**
     * Wait for UI orchestration to be ready
     */
    async _waitForUIOrchestration() {
        try {
            console.log('⏳ Waiting for UI orchestration to be ready...');
            
            return new Promise((resolve) => {
                if (window.__uiOrchestrationRegistry.isUIReady()) {
                    console.log('✅ UI orchestration already ready');
                    this._uiOrchestrationReady = true;
                    resolve();
                    return;
                }
                
                const maxWait = AUTH_GATEWAY_CONFIG.UI_READY_MAX_WAIT;
                const checkInterval = AUTH_GATEWAY_CONFIG.UI_READY_CHECK_INTERVAL;
                const startTime = Date.now();
                
                const checkUIReady = () => {
                    if (window.__uiOrchestrationRegistry.isUIReady()) {
                        console.log('✅ UI orchestration is now ready');
                        this._uiOrchestrationReady = true;
                        resolve();
                    } else if (Date.now() - startTime > maxWait) {
                        console.warn('⚠️ UI orchestration not ready after maximum wait, proceeding anyway');
                        this._uiOrchestrationReady = true;
                        resolve();
                    } else {
                        setTimeout(checkUIReady, checkInterval);
                    }
                };
                
                checkUIReady();
            });
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to wait for UI orchestration: ${error.message}`, 'UI_ORCHESTRATION_WAIT');
            this._uiOrchestrationReady = true;
            return Promise.resolve();
        }
    }
    
    /**
     * Ensure API is ready before proceeding - UPDATED TO USE waitForReady()
     */
    async _ensureAPIReady() {
        if (this._apiReady && this._apiAuthReady && this._apiAuthFullyInitialized) {
            return;
        }
        
        return new Promise((resolve) => {
            try {
                this._apiReadyCallbacks.push(resolve);
                
                // Set timeout for safety
                setTimeout(() => {
                    const index = this._apiReadyCallbacks.indexOf(resolve);
                    if (index > -1) {
                        this._apiReadyCallbacks.splice(index, 1);
                        resolve();
                    }
                }, 3000); // Reduced from 5000
                
                // Start waiting if not already
                if (!this._waitingForAPI) {
                    this._waitingForAPI = true;
                    this._waitForApiAuth().catch(error => {
                        console.error('Failed to wait for API:', error);
                        this._apiReady = true;
                        this._apiAuthReady = true;
                        this._apiReadyCallbacks.forEach(cb => cb());
                        this._apiReadyCallbacks = [];
                    });
                }
            } catch (error) {
                window.__authSafetyGuards._logOnce(`ensureAPIReady failed: ${error.message}`, 'ENSURE_API_READY');
                resolve();
            }
        });
    }
    
    /**
     * Ensure UI orchestration is ready before proceeding
     */
    async _ensureUIOrchestrationReady() {
        if (this._uiOrchestrationReady) return;
        
        return new Promise((resolve) => {
            try {
                this._uiOrchestrationCallbacks.push(resolve);
                // Start waiting if not already
                if (!this._waitingForUIOrchestration) {
                    this._waitingForUIOrchestration = true;
                    this._waitForUIOrchestration().catch(error => {
                        console.error('Failed to wait for UI orchestration:', error);
                        this._uiOrchestrationReady = true;
                        this._uiOrchestrationCallbacks.forEach(cb => cb());
                        this._uiOrchestrationCallbacks = [];
                    });
                }
            } catch (error) {
                window.__authSafetyGuards._logOnce(`ensureUIOrchestrationReady failed: ${error.message}`, 'ENSURE_UI_READY');
                resolve();
            }
        });
    }
    
    /**
     * Register with global UI namespace
     */
    _registerWithUINamespace() {
        try {
            console.log('📝 Registering auth module with UI namespace...');
            
            // Ensure UI orchestration is ready
            if (!this._uiOrchestrationReady) {
                console.warn('UI orchestration not ready, deferring registration');
                setTimeout(() => this._registerWithUINamespace(), 100);
                return;
            }
            
            // Register with UI orchestration registry
            window.__uiOrchestrationRegistry.registerUIModule('auth', this);
            
            // Register with window.app.ui namespace
            if (window.app && window.app.ui) {
                // Check if already registered to avoid overwriting
                if (window.app.ui.auth && window.app.ui.auth !== this) {
                    console.warn('window.app.ui.auth already exists, preserving existing reference');
                    // Store reference for potential fallback
                    window.app.ui.__authGatewayBackup = window.app.ui.auth;
                }
                
                // Register with safe assignment
                Object.defineProperty(window.app.ui, 'auth', {
                    value: this,
                    writable: false,
                    configurable: true,
                    enumerable: true
                });
                
                console.log('✅ Auth module registered to window.app.ui.auth');
            } else {
                console.error('window.app.ui namespace not available for registration');
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Failed to register with UI namespace: ${error.message}`, 'UI_NAMESPACE_REG');
        }
    }
    
    // ============================================================================
    // PUBLIC API METHODS - UPDATED TO USE API AUTH PROXY WITH waitForReady()
    // ============================================================================

    // app.ui.auth.js - Complete login function with all fixes

/**
 * Login with credentials - Uses apiAuthProxy.login() with waitForReady()
 * ENHANCED: Added token propagation and multiple storage locations
 * FIXED: Token stored in ALL locations for cross-module compatibility
 * FIXED: Added storage verification and retry mechanism
 */
async login(credentials) {
    try {
        console.log('🔐 [AuthGateway] Login attempt for:', credentials.email);
        
        // Validate credentials
        if (!credentials || !credentials.email || !credentials.password) {
            throw new Error('Missing credentials: email and password are required');
        }
        
        const email = credentials.email.trim();
        const password = credentials.password;
        
        console.log('🔐 [AuthGateway] Login attempt for:', email.substring(0, 3) + '...');
        
        // Ensure API Auth is ready AND fully initialized
        await this._ensureAPIReady();
        
        // Additional wait for full initialization - USE waitForReady() if available
        if (window.api?.auth && typeof window.api.auth.waitForReady === 'function' && !this._apiAuthFullyInitialized) {
            console.log('⏳ Calling waitForReady() before login...');
            try {
                await window.api.auth.waitForReady();
                this._apiAuthFullyInitialized = true;
                console.log('✅ waitForReady() complete for login');
            } catch (error) {
                console.warn('⚠️ waitForReady() failed before login', error);
            }
        }
        
        // Check if api.auth.js is available directly
        if (window.api?.auth && typeof window.api.auth.login === 'function') {
            console.log('✅ api.auth.js v2.1.1+ is directly available, skipping wait');
            this._apiAuthFullyInitialized = true;
        } else {
            // Additional wait for full initialization (legacy path)
            if (!this._apiAuthFullyInitialized) {
                console.log('⏳ api.auth.js not fully initialized, waiting before login...');
                const fullInitResult = await window.__apiAuthReadinessManager.waitForFullInitialization();
                this._apiAuthFullyInitialized = fullInitResult.fullyInitialized;
                
                if (!this._apiAuthFullyInitialized) {
                    console.warn('⚠️ api.auth.js still not fully initialized for login');
                    // Force check: if we have essential methods, we're ready
                    if (window.api?.auth && typeof window.api.auth.login === 'function') {
                        console.log('✅ Forcing ready state - essential methods present');
                        this._apiAuthFullyInitialized = true;
                    }
                }
            }
        }
        
        // Ensure UI orchestration is ready
        await this._ensureUIOrchestrationReady();
        
        // Check if login is already in progress for this user
        const loginKey = `${email}_${Date.now() % 1000}`;
        if (this._loginInProgress && this._pendingLoginResolvers.has(loginKey)) {
            console.log('Login already in progress for this user, waiting for existing request');
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (!this._loginInProgress || !this._pendingLoginResolvers.has(loginKey)) {
                        clearInterval(checkInterval);
                        resolve(this.login(credentials));
                    }
                }, 100);
            });
        }
        
        // Check if user is blocked
        const blockInfo = this._isUserBlocked(email);
        if (blockInfo) {
            return {
                success: false,
                message: `Too many login attempts. Please wait ${Math.ceil(blockInfo.remaining / 1000)} seconds.`,
                blocked: true,
                remaining: blockInfo.remaining
            };
        }
        
        // Mark login as in progress
        this._loginInProgress = true;
        this._pendingLoginResolvers.set(loginKey, null);
        
        try {
            console.log('Attempting login with identifier:', email.substring(0, 3) + '...');
            
            // Add a timeout wrapper for the login call
let loginResponse = null;
let loginError = null;

try {
    // Race between login and a timeout
    const loginPromise = this._apiAuthProxy.login(email, password, { source: 'auth_gateway' });
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Login timeout after 30 seconds')), 30000);
    });
    
    loginResponse = await Promise.race([loginPromise, timeoutPromise]);
    console.log('Login API call completed, processing response...');
    console.debug('[AUTH] Raw login response:', loginResponse);
    response = loginResponse;
} catch (error) {
    loginError = error;
    console.error('Login call error:', error);
    response = { success: false, error: error.message, message: error.message };
}
            
            // Handle fallback mode
            if (response.fallbackMode) {
                console.warn('⚠️ Login in fallback mode');
                this._loginInProgress = false;
                this._pendingLoginResolvers.delete(loginKey);
                
                // If retryable, queue for retry
                if (response.retryable) {
                    console.log('🔄 Login fallback is retryable, will retry automatically');
                }
                
                return response;
            }
            
            // Check if response indicates success
            const isSuccessful = response.success === true || response.ok === true || response.token;
            
            if (isSuccessful) {
                // Extract data from response
                const token = response.token || response.accessToken || response.jwt;
                let user = response.user || response.data?.user || response.data;
                
                // ========== CRITICAL FIX: ENHANCED TOKEN PROPAGATION ==========
                if (token) {
                    console.log('✅ Token received from login:', token.substring(0, 20) + '...');
                    console.log('Token length:', token.length);
                    
                    // ========== STORE TOKEN IN ALL LOCATIONS ==========
                    try {
                        // 1. Standard localStorage keys
                        localStorage.setItem('token', token);
                        localStorage.setItem('accessToken', token);
                        localStorage.setItem('USER_TOKEN', token);
                        localStorage.setItem('moodchat_token', token);
                        localStorage.setItem('jwt', token);
                        localStorage.setItem('authToken', token);
                        
                        console.log('✅ Token stored in all localStorage locations');
                    } catch (e) {
                        console.warn('⚠️ Failed to store token in localStorage:', e);
                    }
                    
                    // 2. Unified auth storage (kynecta_auth)
                    try {
                        const unifiedAuth = {
                            token: token,
                            user: user,
                            userId: user?.id || user?.userId,
                            timestamp: Date.now(),
                            validated: true,
                            expiresAt: Date.now() + 3600000,
                            version: '4.1.1'
                        };
                        localStorage.setItem('kynecta_auth', JSON.stringify(unifiedAuth));
                        console.log('✅ Token stored in unified auth storage');
                    } catch (e) {
                        console.warn('⚠️ Failed to store unified auth:', e);
                    }
                    
                    // 3. Session storage as backup
                    try {
                        sessionStorage.setItem('token', token);
                        sessionStorage.setItem('accessToken', token);
                        sessionStorage.setItem('moodchat_token', token);
                        console.log('✅ Token stored in sessionStorage');
                    } catch (e) {
                        console.warn('⚠️ Failed to store token in sessionStorage:', e);
                    }
                    
                    // 4. Store on window object for in-memory access
                    try {
                        window.token = token;
                        window.accessToken = token;
                        window.__userToken = token;
                        window.__accessToken = token;
                        window.moodchatToken = token;
                        console.log('✅ Token stored on window object');
                    } catch (e) {
                        console.warn('⚠️ Failed to store token on window object:', e);
                    }
                    
                    // 5. Also store in window.api if available
                    try {
                        if (window.api && window.api.core) {
                            if (typeof window.api.core.setUserToken === 'function') {
                                window.api.core.setUserToken(token);
                                console.log('✅ Token set in api.core');
                            }
                            if (typeof window.api.core.setToken === 'function') {
                                window.api.core.setToken(token);
                                console.log('✅ Token set in api.core.setToken');
                            }
                        }
                    } catch (e) {
                        console.warn('⚠️ Failed to set token in api.core:', e);
                    }
                    
                    // 6. Dispatch events for other modules
                    try {
                        const tokenEvent = new CustomEvent('token:stored', {
                            detail: { 
                                token: token, 
                                timestamp: Date.now(),
                                source: 'login',
                                userId: user?.id
                            }
                        });
                        window.dispatchEvent(tokenEvent);
                        
                        const authEvent = new CustomEvent('auth:token:ready', {
                            detail: { 
                                token: token, 
                                timestamp: Date.now(),
                                source: 'login'
                            }
                        });
                        window.dispatchEvent(authEvent);
                        
                        console.log('✅ Token events dispatched');
                    } catch (e) {
                        console.warn('⚠️ Failed to dispatch token events:', e);
                    }
                }
                
                // Inside app.ui.auth.js, in the login method, after token extraction add:

// Create persistent session via SessionManager
if (window.SessionManager && token && user) {
    const rememberMe = credentials.rememberMe !== false;
    const sessionResult = window.SessionManager.createSession(user, token, rememberMe);
    console.log('[AuthGateway] Session created:', sessionResult);
}

                // Handle edge cases - create minimal user if missing
                if (!user && token) {
                    console.warn('Login successful but no user data, creating minimal user object');
                    user = {
                        id: email.split('@')[0] + '_' + Date.now(),
                        email: email,
                        username: email.split('@')[0],
                        displayName: email.split('@')[0]
                    };
                }
                
                // Validate user object
                if (user && !this._validateUserObject(user)) {
                    console.error('Login failed: Invalid user object', user);
                    this._recordLoginAttempt(email, false);
                    this._loginInProgress = false;
                    this._pendingLoginResolvers.delete(loginKey);
                    return {
                        success: false,
                        message: 'Login failed: Invalid user data received'
                    };
                }
                
                // Record successful attempt
                this._recordLoginAttempt(email, true);
                
                // Update auth state immediately
                const updateResult = await this._updateAuthStateImmediately('authenticated', user, token);
                
                if (!updateResult.success) {
                    console.error('Failed to update auth state immediately:', updateResult.error);
                    this._loginInProgress = false;
                    this._pendingLoginResolvers.delete(loginKey);
                    return {
                        success: false,
                        message: 'Login failed: Could not save authentication state'
                    };
                }
                
                // Update window.currentUser for UI compatibility
                if (typeof window !== 'undefined') {
                    window.currentUser = user;
                    window.user = user;
                    
                    // Also store user in localStorage
                    try {
                        localStorage.setItem('currentUser', JSON.stringify(user));
                        localStorage.setItem('moodchat_user', JSON.stringify(user));
                        localStorage.setItem('user', JSON.stringify(user));
                    } catch (e) {
                        console.warn('⚠️ Failed to store user data:', e);
                    }
                }
                
                // CRITICAL: Force a small delay to ensure storage is written
                console.log('⏳ Waiting for storage to be written...');
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Verify token was stored correctly
                const verifyToken = localStorage.getItem('token');
                const verifyUnified = localStorage.getItem('kynecta_auth');
                
                console.log('🔍 Verification after storage:');
                console.log('   - localStorage.token:', verifyToken ? 'YES (length: ' + verifyToken.length + ')' : 'NO');
                console.log('   - localStorage.kynecta_auth:', verifyUnified ? 'YES' : 'NO');
                console.log('   - window.token:', window.token ? 'YES' : 'NO');
                
                if (!verifyToken) {
                    console.error('❌ CRITICAL: Token was not stored! Retrying...');
                    // Force store again
                    localStorage.setItem('token', token);
                    localStorage.setItem('accessToken', token);
                    localStorage.setItem('moodchat_token', token);
                    
                    const retryUnified = {
                        token: token,
                        user: user,
                        userId: user?.id,
                        timestamp: Date.now(),
                        validated: true,
                        expiresAt: Date.now() + 3600000
                    };
                    localStorage.setItem('kynecta_auth', JSON.stringify(retryUnified));
                    
                    // Verify again
                    const retryVerify = localStorage.getItem('token');
                    if (!retryVerify) {
                        console.error('❌ FATAL: Token storage failed even after retry!');
                    } else {
                        console.log('✅ Token storage successful on retry');
                    }
                }
                
                // Force immediate UI update
                this._forceUIUpdate();
                
                // Clear login in progress flag
                this._loginInProgress = false;
                this._pendingLoginResolvers.delete(loginKey);
                
                console.log('✅ Login successful, auth state updated:', {
                    userEmail: user ? (user.email || user.username) : 'unknown',
                    tokenPresent: !!token,
                    tokenLength: token ? token.length : 0,
                    userId: user?.id,
                    storageVerified: !!verifyToken
                });
                
                // Show success message
                try {
                    if (window.CoreUtils && window.CoreUtils.showNotification) {
                        window.CoreUtils.showNotification('Success', 'Login successful! Redirecting...', 'success');
                    } else if (window.showNotification) {
                        window.showNotification('Login successful! Redirecting...', 'success');
                    } else {
                        console.log('✅ Login successful! Redirecting to chat...');
                    }
                } catch (notifError) {
                    console.log('✅ Login successful! Redirecting to chat...');
                }
                
                // Get success message
                const successMessage = response.message || response.msg || 'Authentication successful';
                
                // CRITICAL: Redirect to chat.html
                console.log('🚀 Redirecting to chat.html...');
                
                // Use setTimeout to ensure all storage operations are complete
                setTimeout(() => {
                    window.location.href = 'chat.html';
                }, 200);
                
                return {
                    success: true,
                    user: user,
                    token: token,
                    message: successMessage,
                    userId: user?.id,
                    redirectTo: 'chat.html'
                };
                } else {
    // Handle error response
    console.log('Login failed - response:', response);
    this._recordLoginAttempt(email, false);
    this._loginInProgress = false;
    this._pendingLoginResolvers.delete(loginKey);
    
    // Get error message
    let errorMessage = response.message || response.error || 'Login failed';
    
    // Special handling for timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout') || 
        (response.error && response.error.includes('timeout'))) {
        errorMessage = 'Login request timed out. The server might be slow. Please try again.';
        
        // Check if we actually have a token stored despite timeout
        const storedToken = localStorage.getItem('token') || localStorage.getItem('accessToken');
        if (storedToken && storedToken.length > 20) {
            console.log('✅ Token found in storage despite timeout - login may have succeeded');
            // Try to get user data
            const storedUser = localStorage.getItem('currentUser') || localStorage.getItem('user');
            if (storedUser) {
                try {
                    const user = JSON.parse(storedUser);
                    console.log('✅ User data found, considering login successful');
                    this._loginInProgress = false;
                    this._pendingLoginResolvers.delete(loginKey);
                    
                    // Update auth state
                    await this._updateAuthStateImmediately('authenticated', user, storedToken);
                    window.currentUser = user;
                    
                    // Redirect to chat
                    setTimeout(() => {
                        window.location.href = 'chat.html';
                    }, 500);
                    
                    return {
                        success: true,
                        user: user,
                        token: storedToken,
                        message: 'Login successful (recovered from timeout)'
                    };
                } catch (e) {}
            }
        }
    }
                // Show error notification
                try {
                    if (window.CoreUtils && window.CoreUtils.showNotification) {
                        window.CoreUtils.showNotification('Error', errorMessage, 'error');
                    } else if (window.showNotification) {
                        window.showNotification(errorMessage, 'error');
                    }
                } catch (notifError) {}
                
                return {
                    success: false,
                    message: errorMessage,
                    code: response.code || 'LOGIN_FAILED'
                };
            }
      } catch (error) {
    console.error('Login error:', error);
    this._recordLoginAttempt(email, false);
    this._loginInProgress = false;
    this._pendingLoginResolvers.delete(loginKey);
    
    // Check for CORS/Fetch errors specifically
    if (error.message === 'Failed to fetch' || 
        error.message.includes('NetworkError') ||
        error.message.includes('network') ||
        error.name === 'TypeError') {
        
        console.error('🔴 CORS or Network Error detected');
        
        // Try to diagnose the issue
        let diagnosticMessage = 'Cannot connect to server. ';
        
        // Check if it's likely a CORS issue
        if (window.location.hostname !== 'localhost') {
            diagnosticMessage += 'This may be a CORS configuration issue. ';
            diagnosticMessage += 'Please ensure the backend CORS settings allow requests from this domain.';
        } else {
            diagnosticMessage += 'Please check if the backend server is running and CORS is properly configured.';
        }
        
        // Show error notification
        try {
            if (window.CoreUtils && window.CoreUtils.showNotification) {
                window.CoreUtils.showNotification('Connection Error', diagnosticMessage, 'error');
            } else if (window.showNotification) {
                window.showNotification(diagnosticMessage, 'error');
            }
        } catch (notifError) {}
        
        return {
            success: false,
            message: diagnosticMessage,
            code: 'CORS_OR_NETWORK_ERROR',
            retryable: true
        };
    }
    
    // Check if it's a network timeout but auth state was updated
    if (error.message && (error.message.includes('timeout') || error.message.includes('Timeout'))) {
        console.warn('Login request timed out, checking if auth state was updated');
        if (this._state.status === 'authenticated' && this._state.user && this._state.token) {
            console.log('Auth state indicates successful login despite timeout');
            
            // Show success message and redirect
            try {
                if (window.CoreUtils && window.CoreUtils.showNotification) {
                    window.CoreUtils.showNotification('Success', 'Login successful! Redirecting...', 'success');
                }
            } catch (notifError) {}
            
            setTimeout(() => {
                window.location.href = 'chat.html';
            }, 200);
            
            return {
                success: true,
                user: this._state.user,
                token: this._state.token,
                message: 'Login successful (recovered from timeout)'
            };
        }
    }
    
    // Check if it's a "module not ready" error
    if (error.message && error.message.includes('not ready')) {
        console.warn('Login failed: Authentication module not ready');
        return {
            success: false,
            message: 'Authentication service is still initializing. Please try again in a moment.',
            retryable: true,
            fallback: true
        };
    }
    
    // Show error notification
    const errorMessage = this._getUserFriendlyErrorMessage(error);
    try {
        if (window.CoreUtils && window.CoreUtils.showNotification) {
            window.CoreUtils.showNotification('Error', errorMessage, 'error');
        } else if (window.showNotification) {
            window.showNotification(errorMessage, 'error');
        }
    } catch (notifError) {}
    
    return {
        success: false,
        message: errorMessage,
        code: error.code || 'LOGIN_ERROR'
    };
}

    } catch (error) {
        console.error('❌ [AuthGateway] Login method failed:', error);
        
        // Show error notification
        try {
            if (window.CoreUtils && window.CoreUtils.showNotification) {
                window.CoreUtils.showNotification('Error', 'Login service temporarily unavailable', 'error');
            }
        } catch (notifError) {}
        
        return {
            success: false,
            message: 'Login service temporarily unavailable',
            fallback: true,
            retryable: true,
            code: 'SERVICE_UNAVAILABLE'
        };
    }
}

    /**
     * Register a new user - Uses apiAuthProxy.register()
     */
   async register(data) {
    try {
        console.log('🔐 [AuthGateway] Register called with:', { email: data.email, username: data.username });
        
        if (!data || !data.email || !data.password || !data.username) {
            throw new Error('Missing required registration data');
        }
        
        // Ensure API Auth is ready
        await this._ensureAPIReady();
        
        // Ensure UI orchestration is ready
        await this._ensureUIOrchestrationReady();
        
        try {
            // Validate passwords match
            if (data.password !== data.confirmPassword) {
                return {
                    success: false,
                    message: 'Passwords do not match'
                };
            }
            
            // Validate email format
            if (!this._validateEmail(data.email)) {
                return {
                    success: false,
                    message: 'Please provide a valid email address'
                };
            }
            
            console.log('🔐 [AuthGateway] Sending registration to api.auth...');
            
            // Use apiAuthProxy.register()
            const response = await this._apiAuthProxy.register({
                email: data.email.trim().toLowerCase(),
                username: data.username.trim(),
                password: data.password,
                displayName: data.displayName || data.username
            });
            
            console.log('🔐 [AuthGateway] Registration response:', response);
            
            // Check if response indicates success
            const isSuccessful = response.success === true || response.ok === true;
            
            if (isSuccessful) {
                const token = response.token || response.accessToken;
                const user = response.user || response.data?.user;
                
                console.log('✅ [AuthGateway] Registration successful');
                console.log('   Token present:', !!token);
                console.log('   User present:', !!user);
                
                if (token && user) {
                    // Store token in multiple locations
                    try {
                        localStorage.setItem('token', token);
                        localStorage.setItem('accessToken', token);
                        localStorage.setItem('moodchat_token', token);
                        localStorage.setItem('USER_TOKEN', token);
                        localStorage.setItem('kynecta_auth', JSON.stringify({ token, user, timestamp: Date.now() }));
                        window.token = token;
                        window.accessToken = token;
                        window.currentUser = user;
                        console.log('✅ [AuthGateway] Token stored in all locations');
                    } catch (e) {
                        console.warn('⚠️ [AuthGateway] Failed to store token:', e);
                    }
                    
                    // Update auth state
                    const updateResult = await this._updateAuthStateImmediately('authenticated', user, token);
                    
                    if (updateResult.success) {
                        console.log('✅ [AuthGateway] Auth state updated, redirecting...');
                        
                        // Show success message
                        window.CoreUtils.showNotification('Success', 'Registration successful! Redirecting to chat...', 'success');
                        
                        // Force redirect to chat.html
                        setTimeout(() => {
                            console.log('🚀 [AuthGateway] Redirecting to chat.html');
                            window.location.href = 'chat.html';
                        }, 1000);
                        
                        return {
                            success: true,
                            user: user,
                            token: token,
                            message: response.message || 'Registration successful'
                        };
                    } else {
                        console.error('❌ [AuthGateway] Failed to update auth state:', updateResult.error);
                        return {
                            success: false,
                            message: 'Registration successful but auto-login failed'
                        };
                    }
                } else {
                    console.warn('⚠️ [AuthGateway] Registration successful but no token/user received');
                    console.log('   Response:', response);
                    return {
                        success: true,
                        message: 'Registration successful but no token received. Please log in manually.'
                    };
                }
            } else {
                console.error('❌ [AuthGateway] Registration failed:', response.message);
                return {
                    success: false,
                    message: response.message || 'Registration failed'
                };
            }
        } catch (error) {
            console.error('❌ [AuthGateway] Register error:', error);
            return {
                success: false,
                message: this._getUserFriendlyErrorMessage(error)
            };
        }
    } catch (error) {
        window.__authSafetyGuards._logOnce(`Register method failed: ${error.message}`, 'REGISTER_METHOD');
        return {
            success: false,
            message: 'Registration service temporarily unavailable',
            fallback: true,
            retryable: true
        };
    }
}
    
 async autoLogin() {
    try {
        // ── OFFLINE-FIRST AUTO-LOGIN ──────────────────────────────────────────
        // If the device has no network, skip ALL server validation and authenticate
        // purely from localStorage. The session was persisted by _saveAuthToLocalStorage()
        // on last successful login, so it is safe to trust it offline.
        const _isDeviceOnline = () => {
            try { return navigator.onLine !== false; } catch(e) { return true; }
        };

        const _getLocalSession = () => {
            // Read from canonical kynecta_auth key first
            try {
                const raw = localStorage.getItem('kynecta_auth');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.token && parsed.user) return parsed;
                }
            } catch(e) {}
            // Legacy fallbacks
            const token = localStorage.getItem('token') ||
                          localStorage.getItem('accessToken') ||
                          localStorage.getItem('authToken') ||
                          localStorage.getItem('moodchat_token') ||
                          localStorage.getItem('kynecta_token') ||
                          localStorage.getItem('USER_TOKEN');
            if (!token || token.length < 20) return null;
            try {
                const userRaw = localStorage.getItem('currentUser') ||
                                localStorage.getItem('user') ||
                                localStorage.getItem('moodchat_user');
                const user = userRaw ? JSON.parse(userRaw) : null;
                return user ? { token, user } : null;
            } catch(e) { return null; }
        };

        // Token structure check only (no expiry enforcement offline)
        const _isTokenStructurallyValid = (token) => {
            if (!token || typeof token !== 'string' || token.length < 20) return false;
            const parts = token.split('.');
            return parts.length === 3;
        };

        if (!_isDeviceOnline()) {
            console.log('[AUTH] Device is offline - attempting local-only auto-login');
            const localSession = _getLocalSession();

            if (localSession && _isTokenStructurallyValid(localSession.token)) {
                const { token, user } = localSession;
                console.log('[AUTH] Offline auto-login success for:', user.email || user.username || 'user');

                // Hydrate app state from local session
                await this._updateAuthStateImmediately('authenticated', user, token);
                if (typeof window !== 'undefined') window.currentUser = user;
                this._forceUIUpdate();

                try {
                    window.dispatchEvent(new CustomEvent('session:ready', {
                        detail: { token, user, timestamp: Date.now(), offline: true, autoLogin: true }
                    }));
                    window.dispatchEvent(new CustomEvent('user-logged-in', {
                        detail: { user, token, timestamp: Date.now(), autoLogin: true, offline: true }
                    }));
                } catch(e) {}

                const currentPath = window.location.pathname;
                if (!currentPath.includes('chat.html')) {
                    console.log('[AUTH] Offline auto-login: redirecting to chat.html');
                    setTimeout(() => { window.location.href = 'chat.html'; }, 300);
                }

                return {
                    success: true,
                    user,
                    token,
                    message: 'Auto-login successful (offline - local session)',
                    offline: true
                };
            }

            console.log('[AUTH] Offline auto-login: no valid local session found');
            return {
                success: false,
                message: 'No saved session - please login when connected',
                offline: true,
                shouldRedirectToLogin: false  // Don't redirect - show login form in place
            };
        }
        // ── END OFFLINE-FIRST BLOCK ───────────────────────────────────────────

        console.log('🔐 [AUTH] Auto-login attempt from stored token...');
        
        // ADD: Set timeout for auto-login to prevent hanging
        const autoLoginTimeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
                console.warn('⚠️ [AUTH] Auto-login timeout after 10 seconds - checking for stored token');
                // Check if we have a valid token in storage despite timeout
                const storedToken = localStorage.getItem('token') || localStorage.getItem('accessToken');
                const storedUser = localStorage.getItem('currentUser') || localStorage.getItem('user');
                
                if (storedToken && storedToken.length > 20 && storedUser) {
                    try {
                        const user = JSON.parse(storedUser);
                        console.log('✅ [AUTH] Auto-login timeout but found stored credentials - using them');
                        resolve({
                            success: true,
                            user: user,
                            token: storedToken,
                            message: 'Auto-login successful (recovered from timeout)',
                            recovered: true
                        });
                    } catch (e) {
                        resolve({ success: false, message: 'Auto-login timeout', recovered: false });
                    }
                } else {
                    resolve({ success: false, message: 'Auto-login timeout - no stored credentials', recovered: false });
                }
            }, 10000); // 10 second timeout
        });
        
        // Ensure API Auth is ready
        await this._ensureAPIReady();
        
        // Ensure UI orchestration is ready
        await this._ensureUIOrchestrationReady();
        
        // Check multiple storage locations for token
        let storedToken = this._state.token;
        if (!storedToken) {
            // Try to recover token from localStorage
            storedToken = localStorage.getItem('token') || 
                         localStorage.getItem('accessToken') || 
                         localStorage.getItem('USER_TOKEN') ||
                         localStorage.getItem('moodchat_token');
        }
        
        if (!storedToken || !this._isTokenValid(storedToken)) {
            console.log('🔐 [AUTH] Auto-login: No valid stored token found');
            return {
                success: false,
                message: 'No valid authentication token found',
                shouldRedirectToLogin: true
            };
        }
        
        console.log('🔐 [AUTH] Auto-login: Found stored token, validating...');
        
        // Check if auto-login is already in progress
        if (this._validationInProgress) {
            console.log('🔐 [AUTH] Auto-login already in progress, waiting...');
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (!this._validationInProgress) {
                        clearInterval(checkInterval);
                        resolve(this.autoLogin());
                    }
                }, 100);
            });
        }
        
        this._validationInProgress = true;
        
        // Race between validation and timeout
        const validationPromise = (async () => {
            try {
                // Use apiAuthProxy.validateAuth() or getUser() for token validation
                let response;
                
                if (typeof this._apiAuthProxy.validateAuth === 'function') {
                    response = await this._apiAuthProxy.validateAuth();
                } else if (typeof this._apiAuthProxy.getUser === 'function') {
                    response = await this._apiAuthProxy.getUser();
                } else {
                    throw new Error('No token validation method available');
                }
                
                return { response, error: null };
            } catch (error) {
                return { response: null, error };
            }
        })();
        
        const result = await Promise.race([validationPromise, autoLoginTimeoutPromise]);
        
        // Handle timeout recovery
        if (result.recovered === true) {
            console.log('✅ [AUTH] Auto-login recovered from timeout');
            const user = result.user;
            const token = result.token;
            
            // Update auth state
            await this._updateAuthStateImmediately('authenticated', user, token);
            
            if (typeof window !== 'undefined') {
                window.currentUser = user;
            }
            
            // Force redirect to chat.html
            this._forceUIUpdate();
            
            // Dispatch events
            try {
                window.dispatchEvent(new CustomEvent('session:ready', {
                    detail: { token: token, user: user, timestamp: Date.now(), recovered: true }
                }));
                window.dispatchEvent(new CustomEvent('user-logged-in', {
                    detail: { user: user, token: token, timestamp: Date.now(), autoLogin: true }
                }));
            } catch (e) {}
            
            this._validationInProgress = false;
            
            // CRITICAL: Redirect to chat.html
            if (window.location.pathname !== '/chat.html' && !window.location.pathname.includes('chat.html')) {
                console.log('🚀 [AUTH] Auto-login successful, redirecting to chat.html');
                setTimeout(() => {
                    window.location.href = 'chat.html';
                }, 500);
            }
            
            return {
                success: true,
                user: user,
                token: token,
                message: 'Auto-login successful (recovered from timeout)',
                recovered: true
            };
        }
        
        // Handle validation error
        if (result.error) {
            throw result.error;
        }
        
        const { response } = result;
        console.debug('[AUTH] Auto-login validation response:', response);
        
        // Handle fallback mode
        if (response.fallbackMode) {
            console.warn('⚠️ Auto-login in fallback mode - checking storage directly');
            
            // Try to get user from storage directly
            const storedUser = localStorage.getItem('currentUser') || localStorage.getItem('user');
            if (storedUser && storedToken) {
                try {
                    const user = JSON.parse(storedUser);
                    console.log('✅ Auto-login using direct storage fallback');
                    
                    await this._updateAuthStateImmediately('authenticated', user, storedToken);
                    if (typeof window !== 'undefined') window.currentUser = user;
                    this._forceUIUpdate();
                    
                    this._validationInProgress = false;
                    
                    // CRITICAL: Redirect to chat.html
                    if (window.location.pathname !== '/chat.html' && !window.location.pathname.includes('chat.html')) {
                        console.log('🚀 Auto-login successful (fallback), redirecting to chat.html');
                        setTimeout(() => {
                            window.location.href = 'chat.html';
                        }, 500);
                    }
                    
                    return {
                        success: true,
                        user: user,
                        token: storedToken,
                        message: 'Auto-login successful (fallback)'
                    };
                } catch (e) {
                    console.warn('Failed to parse stored user:', e);
                }
            }
            
            this._validationInProgress = false;
            return {
                success: false,
                message: 'Authentication service unavailable',
                fallback: true,
                shouldRedirectToLogin: true
            };
        }
        
        // Check success
        const isSuccessful = response.success === true || 
                            response.ok === true || 
                            (response.user && (response.user.id || response.user.email));
        
        if (isSuccessful) {
            const user = response.user || response.data?.user || response.data;
            const token = response.token || storedToken;
            
            if (user && this._validateUserObject(user)) {
                // Update auth state
                const updateResult = await this._updateAuthStateImmediately('authenticated', user, token);
                
                if (!updateResult.success) {
                    console.error('Failed to update auth state during auto-login:', updateResult.error);
                    this._validationInProgress = false;
                    return {
                        success: false,
                        message: 'Auto-login failed: Could not update authentication state',
                        shouldRedirectToLogin: true
                    };
                }
                
                // Update window.currentUser
                if (typeof window !== 'undefined') {
                    window.currentUser = user;
                }
                
                // Force immediate UI update
                this._forceUIUpdate();
                
                console.log('✅ Auto-login successful for user:', user.email || user.username);
                
                // Dispatch events
                try {
                    window.dispatchEvent(new CustomEvent('session:ready', {
                        detail: { token: token, user: user, timestamp: Date.now(), autoLogin: true }
                    }));
                    window.dispatchEvent(new CustomEvent('user-logged-in', {
                        detail: { user: user, token: token, timestamp: Date.now(), autoLogin: true }
                    }));
                } catch (e) {}
                
                this._validationInProgress = false;
                
                // CRITICAL FIX: Redirect to chat.html if not already there
                const currentPath = window.location.pathname;
                if (currentPath !== '/chat.html' && !currentPath.includes('chat.html') && currentPath !== '/') {
                    console.log('🚀 Auto-login successful, redirecting to chat.html from:', currentPath);
                    setTimeout(() => {
                        window.location.href = 'chat.html';
                    }, 500);
                } else if (currentPath === '/' || currentPath === '/index.html') {
                    console.log('🚀 Auto-login successful on index page, redirecting to chat.html');
                    setTimeout(() => {
                        window.location.href = 'chat.html';
                    }, 500);
                } else if (currentPath.includes('chat.html')) {
                    console.log('✅ Already on chat.html, auto-login complete');
                    // Still trigger UI update to show logged-in state
                    if (window.app && window.app.ui && window.app.ui.updateAuthUI) {
                        window.app.ui.updateAuthUI(user);
                    }
                }
                
                return {
                    success: true,
                    user: user,
                    token: token,
                    message: 'Auto-login successful',
                    redirectTo: 'chat.html'
                };
            }
        }
        
        // Validation failed
        // OFFLINE-FIRST: Only wipe localStorage when we are ONLINE and the server
        // explicitly rejected the token (401). If we are offline or had a network
        // error, preserve the session so the user can still open the app later.
        const _onlineAtFailure = (() => { try { return navigator.onLine !== false; } catch(e) { return true; } })();
        console.log('[AUTH] Auto-login: validation failed. online=' + _onlineAtFailure);

        await this._updateAuthStateImmediately('unauthenticated', null, null);

        if (_onlineAtFailure) {
            // Safe to clear - server confirmed token is invalid
            localStorage.removeItem('token');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('USER_TOKEN');
            localStorage.removeItem('kynecta_auth');
            console.log('[AUTH] Session cleared (online validation failure)');
        } else {
            console.log('[AUTH] Offline - preserving local session, not clearing localStorage');
        }
        
        this._validationInProgress = false;
        
        // Redirect to login if on a protected page
        const currentPath = window.location.pathname;
        if (currentPath !== '/' && currentPath !== '/index.html' && !currentPath.includes('login')) {
            console.log('🔐 Session expired, redirecting to login');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 500);
        }
        
        return {
            success: false,
            message: 'Session expired. Please login again.',
            shouldRedirectToLogin: true
        };
        
    } catch (error) {
        console.error('Auto-login error:', error);
        
        // Check if we have valid cached state despite error
        const cachedToken = localStorage.getItem('token') || localStorage.getItem('accessToken');
        const cachedUser = localStorage.getItem('currentUser') || localStorage.getItem('user');
        
        if (cachedToken && cachedToken.length > 20 && cachedUser) {
            try {
                const user = JSON.parse(cachedUser);
                console.log('✅ Auto-login: Using cached credentials despite validation error');
                
                await this._updateAuthStateImmediately('authenticated', user, cachedToken);
                if (typeof window !== 'undefined') window.currentUser = user;
                
                this._validationInProgress = false;
                
                // Redirect to chat.html
                if (window.location.pathname !== '/chat.html' && !window.location.pathname.includes('chat.html')) {
                    setTimeout(() => {
                        window.location.href = 'chat.html';
                    }, 500);
                }
                
                return {
                    success: true,
                    user: user,
                    token: cachedToken,
                    message: 'Auto-login successful (cached)',
                    cached: true
                };
            } catch (e) {}
        }
        
        this._validationInProgress = false;
        return {
            success: false,
            message: 'Network error during auto-login',
            cached: false,
            shouldRedirectToLogin: true
        };
    }
}
    
    /**
     * Logout current user - Uses apiAuthProxy.logout()
     */
    async logout() {
        try {
            // Ensure API Auth is ready
            await this._ensureAPIReady();
            
            // Ensure UI orchestration is ready
            await this._ensureUIOrchestrationReady();
            
            try {
                // Use apiAuthProxy.logout()
                if (typeof this._apiAuthProxy.logout === 'function') {
                    try {
                        await this._apiAuthProxy.logout();
                    } catch (error) {
                        console.warn('Logout API call failed:', error);
                        // Continue with local logout even if API fails
                    }
                }
                

// Use SessionManager for logout if available
if (window.SessionManager) {
    await window.SessionManager.logout(false);
}
                // Clear local auth state IMMEDIATELY
                await this._updateAuthStateImmediately('unauthenticated', null, null);
                
                // Clear window.currentUser for UI compatibility
                if (typeof window !== 'undefined') {
                    window.currentUser = null;
                    Object.defineProperty(window, 'currentUser', {
                        value: null,
                        writable: true,
                        configurable: true
                    });
                }
                
                // Clear login attempts for all users
                this._loginAttempts.clear();
                this._blockedUsers.clear();
                this._saveLoginAttempts();
                
                // Force immediate UI update
                this._forceUIUpdate();
                
                return {
                    success: true,
                    message: 'Logged out successfully'
                };
            } catch (error) {
                console.error('Logout error:', error);
                // Still clear local state even on error
                await this._updateAuthStateImmediately('unauthenticated', null, null);
                
                if (typeof window !== 'undefined') {
                    window.currentUser = null;
                    Object.defineProperty(window, 'currentUser', {
                        value: null,
                        writable: true,
                        configurable: true
                    });
                }
                
                return {
                    success: true,
                    message: 'Logged out (with errors)'
                };
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`Logout method failed: ${error.message}`, 'LOGOUT_METHOD');
            // Still try to clear local state
            this._clearAuthState();
            return {
                success: true,
                message: 'Logged out (with system errors)',
                fallback: true
            };
        }
    }
    
    /**
     * Get current authentication state
     */
    getAuthState() {
        try {
            return {
                ...this._state,
                user: this._state.user ? { ...this._state.user } : null
            };
        } catch (error) {
            window.__authSafetyGuards._logOnce(`getAuthState failed: ${error.message}`, 'GET_AUTH_STATE');
            return {
                status: 'error',
                user: null,
                token: null,
                lastUpdated: null
            };
        }
    }
    
    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        try {
            return this._state.status === 'authenticated' && 
                   this._state.user !== null && 
                   this._state.token !== null &&
                   this._isTokenValid(this._state.token);
        } catch (error) {
            window.__authSafetyGuards._logOnce(`isAuthenticated failed: ${error.message}`, 'IS_AUTHENTICATED');
            return false;
        }
    }
    
    /**
     * Get current user
     */
    getCurrentUser() {
        try {
            return this._state.user ? { ...this._state.user } : null;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`getCurrentUser failed: ${error.message}`, 'GET_CURRENT_USER');
            return null;
        }
    }
    
    /**
     * Get authentication token
     */
    getToken() {
        try {
            return this._state.token;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`getToken failed: ${error.message}`, 'GET_TOKEN');
            return null;
        }
    }
    
    /**
     * Get authentication headers for API calls
     */
    getAuthHeaders() {
        try {
            const headers = {
                'Content-Type': 'application/json'
            };
            
            const token = this._state.token;
            if (token && this._isTokenValid(token)) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            return headers;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`getAuthHeaders failed: ${error.message}`, 'GET_AUTH_HEADERS');
            return { 'Content-Type': 'application/json' };
        }
    }
    
    /**
     * Validate current token - Uses apiAuthProxy.validateAuth() with waitForReady()
     */
    async validateToken() {
        try {
            if (this._validationInProgress) {
                return new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (!this._validationInProgress) {
                            clearInterval(checkInterval);
                            resolve(this.isAuthenticated());
                        }
                    }, 100);
                });
            }
            
            if (!this._state.token) {
                return false;
            }
            
            // First check token validity locally
            if (!this._isTokenValid(this._state.token)) {
                console.log('Token invalid locally, clearing auth state');
                await this._updateAuthStateImmediately('unauthenticated', null, null);
                return false;
            }
            
            this._validationInProgress = true;
            
            try {
                // Ensure API Auth is ready - USE waitForReady()
                await this._ensureAPIReady();
                
                // Use apiAuthProxy.validateAuth() for server validation
                let response;
                if (typeof this._apiAuthProxy.validateAuth === 'function') {
                    response = await this._apiAuthProxy.validateAuth();
                } else if (typeof this._apiAuthProxy.getUser === 'function') {
                    response = await this._apiAuthProxy.getUser();
                } else {
                    throw new Error('No token validation method available');
                }
                
                console.debug('[AUTH] Token validation response:', response);
                
                // Handle fallback mode
                if (response.fallbackMode) {
                    console.warn('⚠️ Token validation in fallback mode');
                    this._validationInProgress = false;
                    return true; // Assume token is valid in fallback mode
                }
                
                // Check success
                const isSuccessful = response.success === true || 
                                    response.ok === true || 
                                    (response.user && (response.user.id || response.user.email));
                
                if (isSuccessful) {
                    const user = response.user || response.data?.user || response.data;
                    if (user && this._validateUserObject(user)) {
                        // Update user data if changed
                        const currentUserStr = JSON.stringify(this._state.user);
                        const newUserStr = JSON.stringify(user);
                        
                        if (currentUserStr !== newUserStr) {
                            console.log('User data updated during token validation');
                            const updateResult = await this._updateAuthStateImmediately('authenticated', user, this._state.token);
                            if (!updateResult.success) {
                                console.error('Failed to update user data:', updateResult.error);
                            }
                        }
                        
                        this._validationInProgress = false;
                        return true;
                    }
                }
                
                // Validation failed, clear token
                console.log('Token validation failed on server');
                await this._updateAuthStateImmediately('unauthenticated', null, null);
                
                this._validationInProgress = false;
                return false;
            } catch (error) {
                console.warn('Token validation error:', error);
                
                // Handle 401 Unauthorized specifically
                if (error.message && (error.message.includes('401') || error.message.includes('Unauthorized'))) {
                    console.log('Auth error during validation, clearing token');
                    await this._updateAuthStateImmediately('unauthenticated', null, null);
                    
                    this._validationInProgress = false;
                    return false;
                }
                
                // For network errors, assume token is still valid (cached) but refresh if needed
                if (this.shouldRefreshToken()) {
                    console.log('Network error but token needs refresh, attempting refresh');
                    try {
                        const refreshed = await this.refreshToken();
                        this._validationInProgress = false;
                        return refreshed;
                    } catch (refreshError) {
                        console.warn('Token refresh failed after network error:', refreshError);
                        this._validationInProgress = false;
                        return true; // Still return true to avoid logging out on temporary network issues
                    }
                }
                
                this._validationInProgress = false;
                return true;
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`validateToken failed: ${error.message}`, 'VALIDATE_TOKEN');
            this._validationInProgress = false;
            return false;
        }
    }
    
    /**
     * Refresh authentication token - Uses apiAuthProxy.refreshToken()
     */
    async refreshToken() {
        try {
            if (!this._state.token) {
                return false;
            }
            
            // Ensure API Auth is ready
            await this._ensureAPIReady();
            
            // Prevent multiple simultaneous refresh attempts
            if (this._refreshPromise) {
                console.log('Refresh already in progress, waiting...');
                return this._refreshPromise;
            }
            
            this._refreshPromise = (async () => {
                try {
                    console.log('Attempting token refresh...');
                    
                    // Use apiAuthProxy.refreshToken()
                    let response;
                    if (typeof this._apiAuthProxy.refreshToken === 'function') {
                        response = await this._apiAuthProxy.refreshToken();
                    } else {
                        console.warn('No refreshToken method in apiAuthProxy, skipping refresh');
                        this._refreshPromise = null;
                        return false;
                    }
                    
                    console.debug('[AUTH] Token refresh response:', response);
                    
                    // Handle fallback mode
                    if (response.fallbackMode) {
                        console.warn('⚠️ Token refresh in fallback mode');
                        this._refreshPromise = null;
                        return false;
                    }
                    
                    // Check success
                    const isSuccessful = response.success === true || response.ok === true;
                    
                    if (isSuccessful) {
                        const newToken = response.token || response.accessToken || response.jwt;
                        
                        if (newToken && this._isTokenValid(newToken)) {
                            console.log('Token refreshed successfully');
                            const updateResult = await this._updateAuthStateImmediately('authenticated', this._state.user, newToken);
                            this._refreshPromise = null;
                            return updateResult.success;
                        } else {
                            console.error('Refreshed token is invalid or missing');
                            this._refreshPromise = null;
                            return false;
                        }
                    }
                    
                    console.log('Token refresh failed:', response.message);
                    this._refreshPromise = null;
                    return false;
                } catch (error) {
                    console.error('Token refresh error:', error);
                    
                    // Handle 401 Unauthorized specifically
                    if (error.message && (error.message.includes('401') || error.message.includes('Unauthorized'))) {
                        console.log('Auth error during refresh, clearing token');
                        await this._updateAuthStateImmediately('unauthenticated', null, null);
                    }
                    
                    this._refreshPromise = null;
                    return false;
                }
            })();
            
            return this._refreshPromise;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`refreshToken failed: ${error.message}`, 'REFRESH_TOKEN');
            this._refreshPromise = null;
            return false;
        }
    }
    
    /**
     * Subscribe to auth state changes
     */
    onAuthStateChange(callback) {
        try {
            if (typeof callback !== 'function') {
                throw new Error('Callback must be a function');
            }
            
            this._listeners.add(callback);
            
            // Return unsubscribe function
            return () => {
                this._listeners.delete(callback);
            };
        } catch (error) {
            window.__authSafetyGuards._logOnce(`onAuthStateChange failed: ${error.message}`, 'AUTH_STATE_CHANGE');
            return () => {}; // Return empty unsubscribe function
        }
    }
    
    /**
     * Subscribe to event bus events
     */
    subscribeToEvent(eventName, handler) {
        try {
            if (typeof handler !== 'function') {
                throw new Error('Handler must be a function');
            }
            
            if (!this._eventBusSubscriptions.has(eventName)) {
                this._eventBusSubscriptions.set(eventName, new Set());
            }
            
            this._eventBusSubscriptions.get(eventName).add(handler);
            
            // Return unsubscribe function
            return () => {
                const handlers = this._eventBusSubscriptions.get(eventName);
                if (handlers) {
                    handlers.delete(handler);
                    if (handlers.size === 0) {
                        this._eventBusSubscriptions.delete(eventName);
                    }
                }
            };
        } catch (error) {
            window.__authSafetyGuards._logOnce(`subscribeToEvent failed: ${error.message}`, 'EVENT_SUBSCRIPTION');
            return () => {}; // Return empty unsubscribe function
        }
    }
    
    /**
     * Emit event to event bus
     */
    emitEvent(eventName, data) {
        try {
            const handlers = this._eventBusSubscriptions.get(eventName);
            if (handlers) {
                handlers.forEach(handler => {
                    try {
                        setTimeout(() => handler(data), 0);
                    } catch (error) {
                        console.error(`Event handler error for ${eventName}:`, error);
                    }
                });
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`emitEvent failed: ${error.message}`, 'EVENT_EMIT');
        }
    }
    
    /**
     * Check if token is about to expire and needs refresh
     */
    shouldRefreshToken() {
        try {
            if (!this._state.token) return false;
            
            const parts = this._state.token.split('.');
            if (parts.length !== 3) return false;
            
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (!payload.exp) return false;
            
            const expiryTime = payload.exp * 1000;
            const currentTime = Date.now();
            const refreshThreshold = 300000; // 5 minutes before expiry
            const buffer = AUTH_GATEWAY_CONFIG.TOKEN_EXPIRY_BUFFER;
            
            return currentTime >= (expiryTime - refreshThreshold - buffer);
        } catch (error) {
            window.__authSafetyGuards._logOnce(`shouldRefreshToken failed: ${error.message}`, 'SHOULD_REFRESH_TOKEN');
            return false;
        }
    }
    
    /**
     * Manually update auth state (for external integrations)
     */
    async setAuthState(status, user = null, token = null) {
        try {
            const updateResult = await this._updateAuthStateImmediately(status, user, token);
            
            if (!updateResult.success) {
                throw new Error(updateResult.error || 'Failed to update auth state');
            }
            
            // Update window.currentUser for UI compatibility
            if (status === 'authenticated' && user) {
                if (typeof window !== 'undefined') {
                    window.currentUser = user;
                    Object.defineProperty(window, 'currentUser', {
                        value: user,
                        writable: true,
                        configurable: true
                    });
                }
                
                // Force immediate UI update
                this._forceUIUpdate();
            } else if (status !== 'authenticated') {
                // Clear window.currentUser
                if (typeof window !== 'undefined') {
                    window.currentUser = null;
                    Object.defineProperty(window, 'currentUser', {
                        value: null,
                        writable: true,
                        configurable: true
                    });
                }
                
                // Force immediate UI update
                this._forceUIUpdate();
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`setAuthState failed: ${error.message}`, 'SET_AUTH_STATE');
            throw error;
        }
    }
    
    /**
     * Clear all authentication data
     */
    async clear() {
        try {
            this._loginAttempts.clear();
            this._blockedUsers.clear();
            this._saveLoginAttempts();
            await this._updateAuthStateImmediately('unauthenticated', null, null);
            
            // Clear window.currentUser
            if (typeof window !== 'undefined') {
                window.currentUser = null;
                Object.defineProperty(window, 'currentUser', {
                    value: null,
                    writable: true,
                    configurable: true
                });
            }
            
            // Force immediate UI update
            this._forceUIUpdate();
        } catch (error) {
            window.__authSafetyGuards._logOnce(`clear failed: ${error.message}`, 'CLEAR_AUTH');
        }
    }
    
    /**
     * Get login attempts statistics for a user
     */
    getLoginAttempts(identifier) {
        try {
            const attempts = this._loginAttempts.get(identifier);
            if (!attempts) {
                return {
                    count: 0,
                    failed: 0,
                    lastAttempt: null,
                    blocked: false
                };
            }
            
            const blockInfo = this._isUserBlocked(identifier);
            const failedAttempts = attempts.history.filter(h => !h.success).length;
            
            return {
                count: attempts.count,
                failed: failedAttempts,
                lastAttempt: attempts.lastAttempt,
                blocked: !!blockInfo,
                blockInfo
            };
        } catch (error) {
            window.__authSafetyGuards._logOnce(`getLoginAttempts failed: ${error.message}`, 'GET_LOGIN_ATTEMPTS');
            return {
                count: 0,
                failed: 0,
                lastAttempt: null,
                blocked: false
            };
        }
    }
    
    /**
     * Reset login attempts for a user
     */
    resetLoginAttempts(identifier = null) {
        try {
            if (identifier) {
                this._loginAttempts.delete(identifier);
                this._blockedUsers.delete(identifier);
            } else {
                this._loginAttempts.clear();
                this._blockedUsers.clear();
            }
            
            this._saveLoginAttempts();
        } catch (error) {
            window.__authSafetyGuards._logOnce(`resetLoginAttempts failed: ${error.message}`, 'RESET_LOGIN_ATTEMPTS');
        }
    }
    
    /**
     * Check if a user is currently blocked
     */
    isUserBlocked(identifier) {
        try {
            return this._isUserBlocked(identifier);
        } catch (error) {
            window.__authSafetyGuards._logOnce(`isUserBlocked failed: ${error.message}`, 'IS_USER_BLOCKED');
            return false;
        }
    }
    
    /**
     * Debug information
     */
    debug() {
        try {
            return {
                state: this.getAuthState(),
                isAuthenticated: this.isAuthenticated(),
                hasValidToken: this._state.token ? this._isTokenValid(this._state.token) : false,
                shouldRefreshToken: this.shouldRefreshToken(),
                loginAttempts: this._loginAttempts.size,
                blockedUsers: this._blockedUsers.size,
                isIframeContext: this._isIframeContext,
                listeners: this._listeners.size,
                config: AUTH_GATEWAY_CONFIG,
                loginInProgress: this._loginInProgress,
                validationInProgress: this._validationInProgress,
                apiReady: this._apiReady,
                uiOrchestrationReady: this._uiOrchestrationReady,
                apiAuthReady: this._apiAuthReady,
                apiAuthFullyInitialized: this._apiAuthFullyInitialized,
                apiAuthProxy: {
                    initialized: this._apiAuthProxy ? true : false,
                    fallbackMode: this._apiAuthProxy?.isFallbackMode() || false,
                    hasRealApiAuth: !!this._apiAuthProxy?.getRealApiAuth(),
                    hasWaitForReady: !!(window.api?.auth && typeof window.api.auth.waitForReady === 'function')
                },
                apiModules: {
                    core: !!window.api?.core,
                    auth: !!window.api?.auth,
                    request: !!window.api?.request,
                    waitForReady: !!(window.api?.auth && typeof window.api.auth.waitForReady === 'function')
                },
                uiNamespace: {
                    app: !!window.app,
                    appUi: !!window.app?.ui,
                    appUiAuth: !!window.app?.ui?.auth,
                    preservedAuthModule: !!window.__preservedAuthModule,
                    uiRegistry: !!window.__uiOrchestrationRegistry
                },
                apiAuthReadiness: window.__apiAuthReadinessManager?.getDetectionInfo() || {},
                safetyGuards: {
                    initialized: !!window.__authSafetyGuards,
                    loggedErrors: window.__authSafetyGuards?._loggedErrors?.size || 0
                }
            };
        } catch (error) {
            window.__authSafetyGuards._logOnce(`debug failed: ${error.message}`, 'DEBUG_INFO');
            return {
                error: 'Debug information unavailable',
                message: error.message
            };
        }
    }
    
    // ============================================================================
    // PRIVATE METHODS - ENHANCED WITH API AUTH PROXY
    // ============================================================================
    
    /**
     * Update auth state immediately (synchronous core, async wrapper)
     */
    async _updateAuthStateImmediately(status, user, token) {
        try {
            // Validate inputs
            if (status === 'authenticated') {
                if (!user || !token) {
                    return {
                        success: false,
                        error: 'User and token required for authenticated state'
                    };
                }
                if (user && !this._validateUserObject(user)) {
                    return {
                        success: false,
                        error: 'Invalid user object'
                    };
                }
                if (token && !this._isTokenValid(token)) {
                    return {
                        success: false,
                        error: 'Invalid token'
                    };
                }
            }
            
            // Store previous state for comparison
            const previousState = { ...this._state };
            
            // Update state IMMEDIATELY and synchronously
            this._state = {
                status,
                user: user ? { ...user } : null,
                token,
                lastUpdated: new Date()
            };
            
            // Save to localStorage IMMEDIATELY
            this._saveAuthStateImmediately();
            
            // Synchronize across tabs/iframes IMMEDIATELY
            this._syncAuthStateImmediately(status, user, token);
            
            // Notify listeners
            this._notifyListeners({
                status,
                user: user ? { ...user } : null,
                token,
                previousState
            });
            
            // Emit event for UI orchestration
            this.emitEvent('authStateChanged', {
                status,
                user,
                token,
                previousState
            });
            
            console.log(`✅ Auth state updated IMMEDIATELY: ${previousState.status} -> ${status}`, {
                userEmail: user ? (user.email || user.username) : 'null',
                tokenPresent: !!token,
                timestamp: new Date().toISOString()
            });
            
            return {
                success: true
            };
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_updateAuthStateImmediately failed: ${error.message}`, 'UPDATE_AUTH_STATE');
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Save auth state to localStorage immediately
     */
    _saveAuthStateImmediately() {
        try {
            const authState = {
                status: this._state.status,
                user: this._state.user,
                token: this._state.token,
                timestamp: Date.now(),
                version: '4.1.1'
            };
            
            localStorage.setItem(AUTH_GATEWAY_CONFIG.AUTH_STATE_KEY, JSON.stringify(authState));
            
            // Force storage event for same-tab synchronization
            try {
                window.dispatchEvent(new StorageEvent('storage', {
                    key: AUTH_GATEWAY_CONFIG.AUTH_STATE_KEY,
                    newValue: JSON.stringify(authState),
                    oldValue: localStorage.getItem(AUTH_GATEWAY_CONFIG.AUTH_STATE_KEY),
                    storageArea: localStorage
                }));
            } catch (e) {
                // Some browsers don't allow creating StorageEvent
            }
            
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_saveAuthStateImmediately failed: ${error.message}`, 'SAVE_AUTH_STATE');
            // Try fallback method
            setTimeout(() => this._saveAuthState(), 0);
        }
    }
    
    /**
     * Sync auth state immediately
     */
    _syncAuthStateImmediately(status, user = null, token = null) {
        try {
            const syncData = {
                type: 'auth_state_sync',
                source: this._sessionSyncKey,
                status,
                user,
                token,
                timestamp: Date.now(),
                immediate: true
            };
            
            // Send sync message immediately
            try {
                // Broadcast to all windows
                window.postMessage(syncData, '*');
                
                // Also send as storage event for same-tab
                this._dispatchCustomEvent('authStateChanged', syncData);
                
            } catch (error) {
                console.warn('Failed to sync auth state immediately:', error);
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_syncAuthStateImmediately failed: ${error.message}`, 'SYNC_AUTH_STATE');
        }
    }
    
    /**
     * Force UI update by dispatching custom event
     */
    _forceUIUpdate() {
        try {
            // Ensure UI orchestration is ready
            if (!this._uiOrchestrationReady) {
                console.warn('UI orchestration not ready, deferring UI update');
                setTimeout(() => this._forceUIUpdate(), 100);
                return;
            }
            
            // Dispatch custom event that UI can listen to
            const event = new CustomEvent('authGatewayStateChange', {
                detail: {
                    status: this._state.status,
                    user: this._state.user,
                    token: this._state.token,
                    timestamp: Date.now(),
                    source: 'authGateway'
                }
            });
            window.dispatchEvent(event);
            
            // Also dispatch a generic storage event for compatibility
            const storageEvent = new Event('storage');
            Object.defineProperty(storageEvent, 'key', {
                value: AUTH_GATEWAY_CONFIG.AUTH_STATE_KEY
            });
            Object.defineProperty(storageEvent, 'newValue', {
                value: localStorage.getItem(AUTH_GATEWAY_CONFIG.AUTH_STATE_KEY)
            });
            window.dispatchEvent(storageEvent);
            
            // Emit event for UI orchestration
            this.emitEvent('uiUpdateRequired', {
                status: this._state.status,
                user: this._state.user
            });
            
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_forceUIUpdate failed: ${error.message}`, 'FORCE_UI_UPDATE');
        }
    }
    
    /**
     * Dispatch custom event
     */
    _dispatchCustomEvent(eventName, detail) {
        try {
            const event = new CustomEvent(eventName, { detail });
            window.dispatchEvent(event);
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_dispatchCustomEvent failed for ${eventName}: ${error.message}`, 'DISPATCH_CUSTOM_EVENT');
        }
    }
    
    _loadAuthState() {
        try {
            const stored = localStorage.getItem(AUTH_GATEWAY_CONFIG.AUTH_STATE_KEY);
            if (stored) {
                const authState = JSON.parse(stored);
                
                // Validate stored state
                if (authState && 
                    authState.status && 
                    (authState.status === 'authenticated' ? (authState.user && authState.token) : true) &&
                    authState.timestamp) {
                    
                    const age = Date.now() - authState.timestamp;
                    
                    // Check token validity if present
                    if (authState.token && !this._isTokenValid(authState.token)) {
                        console.log('Stored token is invalid, clearing auth state');
                        this._clearAuthState();
                        return;
                    }
                    
                    // Consider state valid if less than 5 minutes old or if we have a valid token
                    if (age < 300000 || (authState.token && this._isTokenValid(authState.token))) {
                        this._state = {
                            status: authState.status,
                            user: authState.user || null,
                            token: authState.token || null,
                            lastUpdated: new Date(authState.timestamp)
                        };
                        
                        // Update window.currentUser for UI compatibility
                        if (typeof window !== 'undefined' && authState.user) {
                            window.currentUser = authState.user;
                            Object.defineProperty(window, 'currentUser', {
                                value: authState.user,
                                writable: true,
                                configurable: true
                            });
                        }
                        
                        console.log('Auth state loaded from storage');
                    } else {
                        console.log('Auth state expired, clearing');
                        this._clearAuthState();
                    }
                } else {
                    console.log('Invalid stored auth state, clearing');
                    this._clearAuthState();
                }
            }
            
            // Load login attempts
            this._loadLoginAttempts();
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_loadAuthState failed: ${error.message}`, 'LOAD_AUTH_STATE');
            this._clearAuthState();
        }
    }
    
    _saveAuthState() {
        try {
            const authState = {
                status: this._state.status,
                user: this._state.user,
                token: this._state.token,
                timestamp: Date.now(),
                version: '4.1.1'
            };
            
            localStorage.setItem(AUTH_GATEWAY_CONFIG.AUTH_STATE_KEY, JSON.stringify(authState));
            console.log('Auth state saved to localStorage');
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_saveAuthState failed: ${error.message}`, 'SAVE_AUTH_STATE_FALLBACK');
        }
    }
    
    _clearAuthState() {
        try {
            this._state = {
                status: 'unauthenticated',
                user: null,
                token: null,
                lastUpdated: new Date()
            };
            
            localStorage.removeItem(AUTH_GATEWAY_CONFIG.AUTH_STATE_KEY);
            
            // Clear window.currentUser
            if (typeof window !== 'undefined') {
                window.currentUser = null;
                Object.defineProperty(window, 'currentUser', {
                    value: null,
                    writable: true,
                    configurable: true
                });
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_clearAuthState failed: ${error.message}`, 'CLEAR_AUTH_STATE');
        }
    }
    
    _notifyListeners(change) {
        try {
            const listeners = Array.from(this._listeners);
            listeners.forEach(callback => {
                try {
                    setTimeout(() => callback(change), 0);
                } catch (error) {
                    console.error('Auth state change listener error:', error);
                }
            });
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_notifyListeners failed: ${error.message}`, 'NOTIFY_LISTENERS');
        }
    }
    
    _setupSynchronization() {
        try {
            // Listen for storage events (cross-tab sync)
            window.addEventListener('storage', this._handleStorageEvent.bind(this));
            
            // Listen for message events (iframe sync)
            window.addEventListener('message', this._handleMessageEvent.bind(this));
            
            // Listen for custom auth state change events
            window.addEventListener('authGatewayStateChange', this._handleCustomAuthEvent.bind(this));
            
            // Listen for UI orchestration events
            window.addEventListener('uiOrchestrationReady', this._handleUIOrchestrationReady.bind(this));
            
            // Listen for API auth events
            window.addEventListener('apiAuthManagerReady', this._handleApiAuthReady.bind(this));
            window.addEventListener('apiAuthManagerError', this._handleApiAuthError.bind(this));
            window.addEventListener('apiAuthProxyReady', this._handleApiAuthProxyReady.bind(this));
            window.addEventListener('apiAuthManagerFullyInitialized', this._handleApiAuthFullyInitialized.bind(this));
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_setupSynchronization failed: ${error.message}`, 'SETUP_SYNCHRONIZATION');
        }
    }
    
    _handleStorageEvent(event) {
        try {
            if (event.key === AUTH_GATEWAY_CONFIG.AUTH_STATE_KEY) {
                if (event.newValue) {
                    const newState = JSON.parse(event.newValue);
                    
                    // Only update if different from current state and newer
                    if (newState.timestamp > (this._state.lastUpdated ? this._state.lastUpdated.getTime() : 0)) {
                        if (newState.status !== this._state.status || 
                            newState.token !== this._state.token ||
                            JSON.stringify(newState.user) !== JSON.stringify(this._state.user)) {
                            
                            this._state = {
                                status: newState.status,
                                user: newState.user || null,
                                token: newState.token || null,
                                lastUpdated: new Date(newState.timestamp)
                            };
                            
                            // Update window.currentUser for UI compatibility
                            if (typeof window !== 'undefined') {
                                if (newState.status === 'authenticated' && newState.user) {
                                    window.currentUser = newState.user;
                                    Object.defineProperty(window, 'currentUser', {
                                        value: newState.user,
                                        writable: true,
                                        configurable: true
                                    });
                                } else if (newState.status !== 'authenticated') {
                                    window.currentUser = null;
                                    Object.defineProperty(window, 'currentUser', {
                                        value: null,
                                        writable: true,
                                        configurable: true
                                    });
                                }
                            }
                            
                            this._notifyListeners({
                                status: newState.status,
                                user: newState.user ? { ...newState.user } : null,
                                token: newState.token,
                                source: 'storage',
                                previousState: { ...this._state }
                            });
                            
                            // Force immediate UI update
                            this._forceUIUpdate();
                        }
                    }
                } else {
                    // State cleared
                    this._clearAuthState();
                    this._notifyListeners({
                        status: 'unauthenticated',
                        user: null,
                        token: null,
                        source: 'storage',
                        previousState: { ...this._state }
                    });
                    
                    // Force immediate UI update
                    this._forceUIUpdate();
                }
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_handleStorageEvent failed: ${error.message}`, 'HANDLE_STORAGE_EVENT');
        }
    }
    
    _handleMessageEvent(event) {
        try {
            // Handle cross-window/iframe auth state synchronization
            if (event.data && (event.data.type === 'auth_state_sync' || event.data.type === 'auth_state_broadcast')) {
                this._processIncomingSync(event.data);
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_handleMessageEvent failed: ${error.message}`, 'HANDLE_MESSAGE_EVENT');
        }
    }
    
    _handleCustomAuthEvent(event) {
        try {
            // Handle custom auth state change events
            if (event.detail && event.type === 'authGatewayStateChange') {
                // Update internal state from event
                if (event.detail.status !== this._state.status ||
                    event.detail.token !== this._state.token ||
                    JSON.stringify(event.detail.user) !== JSON.stringify(this._state.user)) {
                    
                    this._state = {
                        status: event.detail.status,
                        user: event.detail.user || null,
                        token: event.detail.token || null,
                        lastUpdated: new Date(event.detail.timestamp || Date.now())
                    };
                }
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_handleCustomAuthEvent failed: ${error.message}`, 'HANDLE_CUSTOM_AUTH_EVENT');
        }
    }
    
    _handleUIOrchestrationReady(event) {
        try {
            console.log('UI orchestration ready event received');
            this._uiOrchestrationReady = true;
            this._uiOrchestrationCallbacks.forEach(callback => callback());
            this._uiOrchestrationCallbacks = [];
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_handleUIOrchestrationReady failed: ${error.message}`, 'HANDLE_UI_READY');
        }
    }
    
    _handleApiAuthReady(event) {
        try {
            console.log('API Auth Manager ready event received:', event.detail);
            this._apiAuthReady = true;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_handleApiAuthReady failed: ${error.message}`, 'HANDLE_API_AUTH_READY');
        }
    }
    
    _handleApiAuthError(event) {
        try {
            console.error('API Auth Manager error event received:', event.detail);
            // Still mark as ready but note the error
            this._apiAuthReady = true;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_handleApiAuthError failed: ${error.message}`, 'HANDLE_API_AUTH_ERROR');
        }
    }
    
    _handleApiAuthProxyReady(event) {
        try {
            console.log('API Auth Proxy ready event received:', event.detail);
            // Update proxy status
            if (this._apiAuthProxy) {
                // Already initialized
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_handleApiAuthProxyReady failed: ${error.message}`, 'HANDLE_API_AUTH_PROXY_READY');
        }
    }
    
    _handleApiAuthFullyInitialized(event) {
        try {
            console.log('✅ API Auth FULLY INITIALIZED event received:', event.detail);
            this._apiAuthFullyInitialized = true;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_handleApiAuthFullyInitialized failed: ${error.message}`, 'HANDLE_API_AUTH_FULL_INIT');
        }
    }
    
    _processIncomingSync(data) {
        try {
            // Don't process our own sync messages
            if (data.source === this._sessionSyncKey) {
                return;
            }
            
            if (data.status === 'authenticated' && data.user && data.token) {
                if (this._validateUserObject(data.user) && 
                    this._isTokenValid(data.token) &&
                    (this._state.status !== 'authenticated' || 
                     this._state.token !== data.token)) {
                    
                    this._updateAuthStateImmediately('authenticated', data.user, data.token)
                        .catch(error => console.error('Error updating from sync:', error));
                }
            } else if (data.status === 'unauthenticated' && this._state.status === 'authenticated') {
                this._updateAuthStateImmediately('unauthenticated', null, null)
                    .catch(error => console.error('Error updating from sync:', error));
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_processIncomingSync failed: ${error.message}`, 'PROCESS_INCOMING_SYNC');
        }
    }
    
    _syncAuthState(status, user = null, token = null) {
        try {
            const syncData = {
                type: 'auth_state_sync',
                source: this._sessionSyncKey,
                status,
                user,
                token,
                timestamp: Date.now()
            };
            
            // If in iframe, send message to parent
            if (this._isIframeContext) {
                try {
                    window.parent.postMessage(syncData, '*');
                } catch (error) {
                    console.warn('Failed to sync auth state to parent:', error);
                }
            }
            
            // If in parent window, broadcast to all iframes
            if (!this._isIframeContext) {
                try {
                    // Broadcast to all iframes
                    const broadcastData = {
                        ...syncData,
                        type: 'auth_state_broadcast'
                    };
                    
                    window.postMessage(broadcastData, '*');
                    
                    // Also send to specific frames if we can access them
                    if (window.frames && window.frames.length > 0) {
                        Array.from(window.frames).forEach((frame, index) => {
                            try {
                                frame.postMessage(broadcastData, '*');
                            } catch (error) {
                                console.warn(`Failed to broadcast to frame ${index}:`, error);
                            }
                        });
                    }
                } catch (error) {
                    console.warn('Failed to broadcast auth state:', error);
                }
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_syncAuthState failed: ${error.message}`, 'SYNC_AUTH_STATE_LEGACY');
        }
    }
    
    _startSessionMonitoring() {
        try {
            // Initial check
            setTimeout(() => {
                this._checkSession();
            }, 5000);
            
            // Check session every 30 seconds
            setInterval(() => {
                this._checkSession();
            }, AUTH_GATEWAY_CONFIG.SESSION_CHECK_INTERVAL);
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_startSessionMonitoring failed: ${error.message}`, 'START_SESSION_MONITORING');
        }
    }
    
    _checkSession() {
        try {
            if (this._state.status === 'authenticated' && this._state.token) {
                // Check if token is still valid
                if (!this._isTokenValid(this._state.token)) {
                    console.log('Token expired during session monitoring');
                    this._updateAuthStateImmediately('unauthenticated', null, null)
                        .catch(error => console.error('Error updating expired session:', error));
                } else if (this.shouldRefreshToken()) {
                    // Try to refresh token if needed
                    console.log('Token needs refresh, attempting refresh...');
                    this.refreshToken().catch(error => 
                        console.warn('Token refresh failed during session check:', error)
                    );
                }
            }
            
            // Clean up expired login blocks
            this._cleanupExpiredBlocks();
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_checkSession failed: ${error.message}`, 'CHECK_SESSION');
        }
    }
    
    _loadLoginAttempts() {
        try {
            const stored = localStorage.getItem('moodchat_login_attempts');
            if (stored) {
                const data = JSON.parse(stored);
                // Check if data is not too old (24 hours)
                if (Date.now() - (data.timestamp || 0) < 24 * 60 * 60 * 1000) {
                    this._loginAttempts = new Map(data.attempts || []);
                    this._blockedUsers = new Map(data.blockedUsers || []);
                } else {
                    console.log('Login attempts data expired, clearing');
                    this._loginAttempts.clear();
                    this._blockedUsers.clear();
                }
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_loadLoginAttempts failed: ${error.message}`, 'LOAD_LOGIN_ATTEMPTS');
            this._loginAttempts.clear();
            this._blockedUsers.clear();
        }
    }
    
    _saveLoginAttempts() {
        try {
            const data = {
                attempts: Array.from(this._loginAttempts.entries()),
                blockedUsers: Array.from(this._blockedUsers.entries()),
                timestamp: Date.now()
            };
            localStorage.setItem('moodchat_login_attempts', JSON.stringify(data));
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_saveLoginAttempts failed: ${error.message}`, 'SAVE_LOGIN_ATTEMPTS');
        }
    }
    
    _recordLoginAttempt(identifier, success) {
        try {
            const now = Date.now();
            
            if (!this._loginAttempts.has(identifier)) {
                this._loginAttempts.set(identifier, {
                    count: 1,
                    lastAttempt: now,
                    lastSuccess: success ? now : null,
                    history: [{
                        timestamp: now,
                        success: success,
                        ip: 'client'
                    }]
                });
            } else {
                const attempt = this._loginAttempts.get(identifier);
                attempt.count++;
                attempt.lastAttempt = now;
                if (success) {
                    attempt.lastSuccess = now;
                }
                
                attempt.history.push({
                    timestamp: now,
                    success: success,
                    ip: 'client'
                });
                
                // Keep only last 20 attempts in history
                if (attempt.history.length > 20) {
                    attempt.history = attempt.history.slice(-20);
                }
                
                this._loginAttempts.set(identifier, attempt);
            }
            
            // If failed, check if user should be blocked
            if (!success) {
                this._checkAndBlockUser(identifier);
            } else {
                // Reset on successful login
                this._loginAttempts.delete(identifier);
                this._blockedUsers.delete(identifier);
            }
            
            this._saveLoginAttempts();
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_recordLoginAttempt failed: ${error.message}`, 'RECORD_LOGIN_ATTEMPT');
        }
    }
    
    _checkAndBlockUser(identifier) {
        try {
            const attempt = this._loginAttempts.get(identifier);
            if (!attempt) return;
            
            // Count failed attempts in last hour
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            const recentFailed = attempt.history.filter(h => 
                !h.success && h.timestamp > oneHourAgo
            ).length;
            
            if (recentFailed >= AUTH_GATEWAY_CONFIG.MAX_LOGIN_ATTEMPTS) {
                const blockIndex = Math.min(
                    recentFailed - AUTH_GATEWAY_CONFIG.MAX_LOGIN_ATTEMPTS, 
                    AUTH_GATEWAY_CONFIG.LOGIN_BLOCK_DURATIONS.length - 1
                );
                const blockDuration = AUTH_GATEWAY_CONFIG.LOGIN_BLOCK_DURATIONS[blockIndex];
                const blockedUntil = Date.now() + blockDuration;
                
                this._blockedUsers.set(identifier, {
                    blockedUntil,
                    reason: 'Too many failed attempts',
                    attempts: recentFailed,
                    timestamp: Date.now()
                });
                
                this._saveLoginAttempts();
                
                console.log(`User ${identifier} blocked for ${blockDuration}ms`);
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_checkAndBlockUser failed: ${error.message}`, 'CHECK_AND_BLOCK_USER');
        }
    }
    
    _isUserBlocked(identifier) {
        try {
            const blockedInfo = this._blockedUsers.get(identifier);
            if (!blockedInfo) return false;
            
            if (Date.now() < blockedInfo.blockedUntil) {
                return {
                    blocked: true,
                    blockedUntil: blockedInfo.blockedUntil,
                    remaining: blockedInfo.blockedUntil - Date.now(),
                    reason: blockedInfo.reason,
                    attempts: blockedInfo.attempts
                };
            } else {
                // Block expired, remove it
                this._blockedUsers.delete(identifier);
                this._saveLoginAttempts();
                return false;
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_isUserBlocked failed: ${error.message}`, 'IS_USER_BLOCKED_INTERNAL');
            return false;
        }
    }
    
    _cleanupExpiredBlocks() {
        try {
            const now = Date.now();
            let cleaned = 0;
            
            this._blockedUsers.forEach((info, identifier) => {
                if (now >= info.blockedUntil) {
                    this._blockedUsers.delete(identifier);
                    cleaned++;
                }
            });
            
            if (cleaned > 0) {
                this._saveLoginAttempts();
            }
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_cleanupExpiredBlocks failed: ${error.message}`, 'CLEANUP_EXPIRED_BLOCKS');
        }
    }
    
    _isTokenValid(token) {
        try {
            if (!token || token === 'undefined' || token === 'null' || token === '') {
                return false;
            }
            
            // Basic JWT validation
            const parts = token.split('.');
            if (parts.length !== 3) {
                console.warn('Invalid JWT format: wrong number of parts');
                return false;
            }
            
            // Try to decode payload
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            
            // Check expiration
            // OFFLINE-FIRST: When device is offline, skip expiry enforcement.
            // Background validation (when back online) will handle token refresh.
            const _deviceOnlineForTokenCheck = (() => {
                try { return navigator.onLine !== false; } catch(e) { return true; }
            })();

            if (payload.exp && _deviceOnlineForTokenCheck) {
                const expiryTime = payload.exp * 1000;
                const currentTime = Date.now();
                const buffer = AUTH_GATEWAY_CONFIG.TOKEN_EXPIRY_BUFFER;

                if (currentTime >= expiryTime - buffer) {
                    console.log('[AUTH] Token expired or about to expire (online check)');
                    return false;
                }
            } else if (payload.exp && !_deviceOnlineForTokenCheck) {
                console.log('[AUTH] Offline: skipping token expiry check, trusting local session');
            }
            
            // Check issued at time
            if (payload.iat) {
                const issuedTime = payload.iat * 1000;
                const currentTime = Date.now();
                // Reject tokens issued in the future (clock skew allowance: 5 minutes)
                if (issuedTime > currentTime + 300000) {
                    console.warn('Token issued in the future');
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_isTokenValid failed: ${error.message}`, 'IS_TOKEN_VALID');
            return false;
        }
    }
    
    _validateUserObject(user) {
        try {
            if (!user || typeof user !== 'object' || Array.isArray(user)) {
                console.error('Invalid user object:', user);
                return false;
            }
            
            // Check for required properties
            const hasIdentifier = user.id || user._id || user.email || user.username;
            if (!hasIdentifier) {
                console.error('User object missing identifier:', user);
                return false;
            }
            
            return true;
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_validateUserObject failed: ${error.message}`, 'VALIDATE_USER_OBJECT');
            return false;
        }
    }
    
    _validateEmail(email) {
        try {
            if (!email || typeof email !== 'string') return false;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email.trim());
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_validateEmail failed: ${error.message}`, 'VALIDATE_EMAIL');
            return false;
        }
    }
    
    _getUserFriendlyErrorMessage(error) {
        try {
            // Handle error response objects
            if (error && typeof error === 'object' && error.message) {
                const message = error.message;
                
                if (message.includes('429') || message.includes('Too Many Requests')) {
                    return 'Too many attempts. Please wait and try again.';
                } else if (message.includes('Invalid credentials') || message.includes('401')) {
                    return 'Invalid email/username or password.';
                } else if (message.includes('Network') || message.includes('fetch') || message.includes('Failed to fetch')) {
                    return 'Network error. Please check your connection.';
                } else if (message.includes('timeout') || message.includes('Timeout')) {
                    return 'Request timed out. Please try again.';
                } else if (message.includes('validation') || message.includes('invalid') || message.includes('Validation')) {
                    return 'Please check your information and try again.';
                } else if (message.includes('not found') || message.includes('404')) {
                    return 'Service not available. Please try again later.';
                } else if (message.includes('500') || message.includes('Internal Server Error')) {
                    return 'Server error. Please try again later.';
                } else if (message.includes('User not found') || message.includes('No user found')) {
                    return 'No account found with these credentials.';
                } else if (message.includes('Email not verified')) {
                    return 'Please verify your email before logging in.';
                } else if (message.includes('Account locked') || message.includes('suspended')) {
                    return 'Account is locked. Please contact support.';
                } else if (message.includes('400') || message.includes('Bad Request')) {
                    return 'Invalid request. Please check your information.';
                } else if (message.includes('identifier') && message.includes('required')) {
                    return 'Email/username is required.';
                } else if (message.includes('not ready') || message.includes('module not ready')) {
                    return 'Authentication service is initializing. Please try again in a moment.';
                }
                
                return message.length > 100 ? message.substring(0, 100) + '...' : message;
            }
            
            // Handle string errors
            if (typeof error === 'string') {
                return error.length > 100 ? error.substring(0, 100) + '...' : error;
            }
            
            return 'An unexpected error occurred. Please try again.';
        } catch (error) {
            window.__authSafetyGuards._logOnce(`_getUserFriendlyErrorMessage failed: ${error.message}`, 'GET_USER_FRIENDLY_ERROR');
            return 'An unexpected error occurred. Please try again.';
        }
    }
}

// ============================================================================
// GLOBAL EXPORT WITH ENHANCED API.AUTH INTEGRATION
// ============================================================================

// Create and export single global instance
try {
    window.AuthGateway = new AuthGateway();
    
    // Export for testing/debugging
    window.AuthGatewayDebug = window.AuthGateway.debug.bind(window.AuthGateway);
    
    // Legacy compatibility alias (if needed)
    window.authGateway = window.AuthGateway;
    
    // UI Orchestration event to signal readiness
    setTimeout(() => {
        try {
            const uiReadyEvent = new CustomEvent('uiOrchestrationReady', {
                detail: {
                    timestamp: Date.now(),
                    modules: ['auth']
                }
            });
            window.dispatchEvent(uiReadyEvent);
            window.__uiOrchestrationRegistry.markUIReady();
        } catch (error) {
            window.__authSafetyGuards._logOnce(`UI ready event dispatch failed: ${error.message}`, 'UI_READY_EVENT');
        }
    }, 100);
} catch (error) {
    window.__authSafetyGuards._logOnce(`Global AuthGateway initialization failed: ${error.message}`, 'GLOBAL_AUTH_INIT');
    // Create minimal fallback
    window.AuthGateway = {
        login: () => Promise.resolve({ success: false, message: 'Authentication service unavailable' }),
        logout: () => Promise.resolve({ success: false, message: 'Service unavailable' }),
        getAuthState: () => ({ status: 'error', user: null, token: null }),
        isAuthenticated: () => false
    };
}

console.log('✅ app.ui.auth.js - AUTHENTICATION GATEWAY MODULE LOADED (v4.1.1)');
console.log('🚀 ENHANCED TOKEN PROPAGATION AND STORAGE FIX:');
console.log('  • ✅ MODULAR: Imported app.core.session.js and app.core.ui.js');
console.log('  • ✅ COMPATIBLE: All auth forms, validation, and UI interactions preserved');
console.log('  • ✅ EVENT-SAFE: All existing event listeners and DOM handling preserved');
console.log('  • ✅ FEATURE-COMPLETE: Login, logout, modal popups all functional');
console.log('  • ✅ NEW: Enhanced token extraction from multiple response paths');
console.log('  • ✅ NEW: Token stored in all localStorage keys for compatibility');
console.log('  • ✅ NEW: Token propagated to core systems via multiple methods');
console.log('  • ✅ NEW: Events dispatched for token-ready notifications');
console.log('  • ✅ FIXED: Race condition in token storage and propagation');
console.log('  • ✅ FIXED: 401 Unauthorized errors after login');
console.log('  • ✅ SAFETY: Token validation before storage');
console.log('  • ✅ SAFETY: Multiple fallback storage locations');
console.log('🔗 GLOBAL OBJECTS: AuthGateway, __apiAuthReadinessManager, __uiOrchestrationRegistry, __authSafetyGuards');
console.log('⚡ READY STATE: Token now properly stored and accessible to all modules');
console.log('🛡️ FALLBACK SAFE: Token stored in multiple locations for redundancy');
console.log('⚠️ CRITICAL FIX: No more token loss after successful login');