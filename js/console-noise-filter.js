/**
 * Console Noise Filter v1.0.0
 * Reduces repetitive console messages while preserving important debugging info
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        // Rate limiting: show message once every X milliseconds
        RATE_LIMITS: {
            'Realtime': 15000,      // WebSocket messages - every 15s
            'FriendSync': 10000,    // Friend sync operations - every 10s
            'CACHE': 5000,          // Cache operations - every 5s
            'STORE': 5000,          // Store operations - every 5s
            'API-CORE': 8000,       // API core messages - every 8s
            'SAIC': 10000,          // SAIC state transitions - every 10s
            'settings': 5000,       // Settings module - every 5s
            'calls': 8000,          // Calls module - every 8s
            'messages': 5000,       // Messages module - every 5s
            'status': 5000,         // Status module - every 5s
            'groups': 5000,         // Groups module - every 5s
            'default': 3000         // Default for other modules
        },
        
        // Message patterns to throttle heavily
        HEAVY_THROTTLE_PATTERNS: [
            /Enhanced reconnect in \d+ms/,
            /Reconnect attempt #\d+/,
            /Opening raw WebSocket/,
            /WebSocket reconnect attempt failed/,
            /Max consecutive errors reached/,
            /Auto-recovering from DEGRADED/,
            /friends sync error/,
            /incoming requests sync error/,
            /sent requests sync error/,
            /blocked sync error/,
            /users sync error/,
            /API request timeout/,
            /CONTACTS_UPDATE/,
            /FRIENDS_LIST_UPDATE/,
            /SESSION_DATA/,
            /AUTH_READY/,
            /PARENT_READY/,
            /Duplicate session/,
            /Cache ready/,
            /DB initialized/,
            /✅ Initialized/,
            /✅ Ready/,
            /🚀 INIT/,
            /⚡ LIFECYCLE/,
            /📋 INFO/,
            /📍 State:/
        ],
        
        // Messages to always show (never filter)
        ALWAYS_SHOW_PATTERNS: [
            /error/i,
            /critical/i,
            /failed/i,
            /exception/i,
            /stack trace/i,
            /❌/,
            /🔴/,
            /⚠️.*WARNING.*Duplicate/,
            /⚠️.*WARNING.*Corrupted/,
            /⚠️.*WARNING.*timeout.*Retry/
        ],
        
        // Environment-based filtering
        ENVIRONMENT_FILTERS: {
            production: {
                level: 'warn', // Only show warnings and errors in production
                hideDebug: true,
                hideInfo: true,
                hideLog: false
            },
            development: {
                level: 'log',   // Show everything in development but throttled
                hideDebug: false,
                hideInfo: false,
                hideLog: false
            }
        }
    };

    // State tracking
    const messageHistory = new Map();
    let isInitialized = false;

    // Detect environment
    function detectEnvironment() {
        const hostname = window.location.hostname;
        return (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) 
            ? 'development' 
            : 'production';
    }

    // Extract module name from message
    function extractModuleName(message) {
        const match = message.match(/^\[([^\]]+)\]/);
        return match ? match[1] : 'default';
    }

    // Check if message should be throttled
    function shouldThrottle(moduleName, message) {
        const now = Date.now();
        const key = `${moduleName}:${message}`;
        
        // Check heavy throttle patterns first
        for (const pattern of CONFIG.HEAVY_THROTTLE_PATTERNS) {
            if (pattern.test(message)) {
                const lastShown = messageHistory.get(key);
                if (!lastShown || now - lastShown > CONFIG.RATE_LIMITS[moduleName] || CONFIG.RATE_LIMITS.default) {
                    messageHistory.set(key, now);
                    return false; // Show this one
                }
                return true; // Throttle
            }
        }
        
        return false; // Don't throttle non-pattern messages
    }

    // Check if message should always be shown
    function shouldAlwaysShow(message) {
        return CONFIG.ALWAYS_SHOW_PATTERNS.some(pattern => pattern.test(message));
    }

    // Enhanced console methods
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
    };

    function createFilteredMethod(level, originalMethod) {
        return function(...args) {
            if (!isInitialized) return originalMethod.apply(console, args);
            
            const message = args.join(' ');
            const moduleName = extractModuleName(message);
            const env = detectEnvironment();
            const envConfig = CONFIG.ENVIRONMENT_FILTERS[env];
            
            // Environment-based filtering
            if (envConfig.hideDebug && level === 'debug') return;
            if (envConfig.hideInfo && level === 'info') return;
            if (envConfig.hideLog && level === 'log') return;
            
            // Always show critical messages
            if (shouldAlwaysShow(message)) {
                return originalMethod.apply(console, args);
            }
            
            // Check throttling
            if (shouldThrottle(moduleName, message)) {
                return; // Skip this message
            }
            
            // Add throttling indicator for heavy patterns
            const argsWithIndicator = [...args];
            for (const pattern of CONFIG.HEAVY_THROTTLE_PATTERNS) {
                if (pattern.test(message)) {
                    const lastShown = messageHistory.get(`${moduleName}:${message}`);
                    if (lastShown && Date.now() - lastShown > CONFIG.RATE_LIMITS[moduleName]) {
                        argsWithIndicator.push('🔇 [throttled]');
                    }
                    break;
                }
            }
            
            return originalMethod.apply(console, argsWithIndicator);
        };
    }

    // Install the filter
    function install() {
        if (isInitialized) return;
        
        console.log = createFilteredMethod('log', originalConsole.log);
        console.warn = createFilteredMethod('warn', originalConsole.warn);
        console.error = createFilteredMethod('error', originalConsole.error);
        console.info = createFilteredMethod('info', originalConsole.info);
        console.debug = createFilteredMethod('debug', originalConsole.debug);
        
        isInitialized = true;
        
        // Show installation message
        originalConsole.log('🔇 Console Noise Filter installed - environment:', detectEnvironment());
        
        // Cleanup old entries periodically
        setInterval(() => {
            const now = Date.now();
            const cutoff = now - 60000; // Keep 1 minute of history
            for (const [key, timestamp] of messageHistory.entries()) {
                if (timestamp < cutoff) {
                    messageHistory.delete(key);
                }
            }
        }, 30000); // Cleanup every 30 seconds
    }

    // Public API
    window.ConsoleNoiseFilter = {
        install,
        uninstall: function() {
            if (!isInitialized) return;
            
            console.log = originalConsole.log;
            console.warn = originalConsole.warn;
            console.error = originalConsole.error;
            console.info = originalConsole.info;
            console.debug = originalConsole.debug;
            
            isInitialized = false;
            originalConsole.log('🔊 Console Noise Filter uninstalled');
        },
        configure: function(newConfig) {
            Object.assign(CONFIG, newConfig);
        },
        getStats: function() {
            return {
                trackedMessages: messageHistory.size,
                environment: detectEnvironment(),
                isInitialized
            };
        },
        clearHistory: function() {
            messageHistory.clear();
        }
    };

    // Auto-install in development mode
    if (detectEnvironment() === 'development') {
        // Install after a short delay to allow other scripts to load first
        setTimeout(install, 100);
    }

})();
