// calls-ui.js
// ==================== RESILIENT UI CONTROLLER - DETERMINISTIC LIFECYCLE ====================
// Version: 5.1.0 - ADDED: OPEN_CALL_WITH_USER event handling, auto-call initiation, navigation support
// Dependencies: calls-core.js v9.0.1
// =======================================================================================

(function() {
    'use strict';

    // ==================== MODULE IDENTIFIER ====================
    const CURRENT_MODULE_NAME = 'calls-ui';
    const MODULE_INIT_FLAG = '__CALLS_UI_INIT__';
    
    if (window[MODULE_INIT_FLAG]) {
        return;
    }
    window[MODULE_INIT_FLAG] = true;

    // Session cache - memory only, no localStorage persistence
    // CRITICAL: Call state is in-memory only - no storage dependency
    window.__CHILD_SESSION__ = window.__CHILD_SESSION__ || {
        token: null,
        userId: null,
        expires: null
    };

    // ==================== DEBUG FLAG ====================
    window.__IFRAME_DEBUG__ = window.__IFRAME_DEBUG__ || false;
    const DEBUG = window.__IFRAME_DEBUG__;

    // ==================== CORE REFERENCE ====================
    let coreInstance = null;
    let coreReady = false;
    let coreInitializationStartTime = Date.now();
    let _coreListenersInitialized = false;

    // ==================== LIFECYCLE STATE TRACKING ====================
    // These are now synced from core events, not set by UI
    let parentReady = false;
    let sessionReady = false;
    let handshakeComplete = false;
    let fallbackModeActive = false;
    let inPassiveMode = false;
    let coreLifecycleState = 'BOOT';
    let _sessionInvalid = false;
    
    // No polling - rely on core events

    // ==================== PENDING CALL STATE (for OPEN_CALL_WITH_USER) ====================
    let pendingCall = {
        userId: null,
        userName: null,
        callType: null,
        initiated: false,
        retryCount: 0,
        maxRetries: 5,
        retryDelay: 500,
        retryTimer: null
    };

    // ==================== ERROR CACHE FOR ONCE LOGGING ====================
    const _onceErrors = new Map();
    const _onceTimers = new Map();

    function logOnce(level, message, data) {
        const key = `${level}:${message}`;
        if (_onceErrors.has(key)) return;
        
        _onceErrors.set(key, Date.now());
        
        const timer = setTimeout(() => {
            _onceErrors.delete(key);
            _onceTimers.delete(key);
        }, 60000);
        _onceTimers.set(key, timer);
        
        if (level === 'error') {
            console.error(`[Calls UI] ${message}`, data || '');
        } else if (level === 'warn') {
            console.warn(`[Calls UI] ${message}`, data || '');
        } else {
            console.log(`[Calls UI] ${message}`, data || '');
        }
    }

    // ==================== CORE STATE ASSERTION HELPER ====================
    function assertCoreActive(actionName) {
        if (!coreInstance) {
            logOnce('warn', `Cannot perform ${actionName} - core not available`);
            return false;
        }
        
        // Use core's assertActive if available
        if (coreInstance.assertActive && typeof coreInstance.assertActive === 'function') {
            return coreInstance.assertActive(actionName);
        }
        
        // Fallback to checking core's lifecycle state
        if (coreInstance.getLifecycleState) {
            const state = coreInstance.getLifecycleState();
            coreLifecycleState = state;
            if (state !== 'ACTIVE') {
                logOnce('warn', `Cannot perform ${actionName} - core not ACTIVE (current: ${state})`);
                return false;
            }
            return true;
        }
        
        // Check if there's an active call blocking actions
        if (coreInstance.isInCall && coreInstance.isInCall()) {
            logOnce('warn', `Cannot perform ${actionName} - already in a call`);
            return false;
        }
        
        // Last resort fallback
        return coreReady && parentReady && sessionReady;
    }

    // ==================== PARENT CONNECTION WRAPPER ====================
    function sendToParent(type, payload = {}) {
        try {
            // Don't send if in passive mode
            if (inPassiveMode) {
                if (DEBUG) {
                    logOnce('info', `Not sending ${type} - in passive mode`);
                }
                return false;
            }
            
            if (window.parent && window.parent !== window) {
                if (coreInstance && coreInstance.sendAction) {
                    coreInstance.sendAction(type, payload);
                    return true;
                }
                
                if (coreInstance && coreInstance.sendToParent) {
                    coreInstance.sendToParent(type, payload, { requireAck: false })
                        .catch(() => {});
                    return true;
                }
                
                // Use modern message format as fallback
                const message = {
                    protocol: 'KYN-9.0',
                    type: type,
                    source: CURRENT_MODULE_NAME,
                    target: 'parent',
                    messageId: (window.crypto && window.crypto.randomUUID) ? 
                        window.crypto.randomUUID() : 
                        'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
                    timestamp: Date.now(),
                    payload: payload || {},
                    version: '5.1.0'
                };
                window.parent.postMessage(message, '*');
                return true;
            }
        } catch (e) {
            if (DEBUG) {
                logOnce('warn', 'Send to parent failed', e);
            }
        }
        return false;
    }

    // ==================== SESSION VALIDATION ====================
    function isSessionValid() {
        // Check core first
        if (coreInstance && coreInstance.isAuthenticated) {
            return coreInstance.isAuthenticated();
        }
        
        if (coreInstance && coreInstance.getSessionStatus) {
            return coreInstance.getSessionStatus() === 'valid';
        }
        
        if (coreInstance && coreInstance.getSession) {
            const session = coreInstance.getSession();
            if (session && session.token && session.authenticated !== false) {
                return true;
            }
        }
        
        // Fallback to memory cache
        return !!(window.__CHILD_SESSION__ && 
                 window.__CHILD_SESSION__.token && 
                 window.__CHILD_SESSION__.token.length > 10 &&
                 (!window.__CHILD_SESSION__.expires || 
                  window.__CHILD_SESSION__.expires > Date.now()));
    }

    // ==================== ACTION PERMISSION CHECK ====================
    function canPerformAction(actionName) {
        if (inPassiveMode) {
            showNotification('Waiting for parent connection...', 'info');
            return false;
        }
        
        if (fallbackModeActive) {
            showNotification('Limited connectivity - Please retry later', 'warning');
            return false;
        }
        
        // Use core's assertActive if available
        if (coreInstance && coreInstance.assertActive) {
            if (!coreInstance.assertActive(actionName)) {
                showNotification('Call system initializing...', 'info');
                return false;
            }
        } else if (!coreReady) {
            showNotification('Call system initializing...', 'info');
            return false;
        }
        
        // For actions that require authentication
        const authRequiredActions = [
            'startCall', 'answerCall', 'sendReaction', 
            'setMood', 'setIntention', 'saveNotes'
        ];
        
        if (authRequiredActions.includes(actionName) && !isSessionValid()) {
            showNotification('Please log in to use this feature', 'warning');
            return false;
        }
        
        // Check if already in a call for actions that require call context
        const callRequiredActions = ['sendReaction', 'sendChatMessage', 'saveNotes'];
        if (callRequiredActions.includes(actionName)) {
            if (coreInstance && coreInstance.isInCall && !coreInstance.isInCall()) {
                showNotification('Join a call to use this feature', 'info');
                return false;
            }
        }
        
        return true;
    }

    // ==================== EVENT-DRIVEN CORE READINESS ====================
    function setupCoreReadyListener() {
        if (_coreListenersInitialized) {
            if (DEBUG) {
                logOnce('info', 'Core ready listeners already initialized');
            }
            return;
        }
        
        if (DEBUG) {
            logOnce('info', 'Setting up core ready listeners');
        }

        // Listen for core ready events - no timeouts
        window.addEventListener('CALLS_CORE_READY', function(event) {
            if (DEBUG) {
                logOnce('success', 'Received CALLS_CORE_READY event', event.detail);
            }
            handleCoreReady(window.callCore || window.CallsCore || window.callsCore);
        });

        window.addEventListener('MODULE_READY', function(event) {
            if (event.detail?.module === 'calls' || !event.detail) {
                if (DEBUG) {
                    logOnce('success', 'Received MODULE_READY for calls module', event.detail);
                }
                handleCoreReady(window.callCore || window.CallsCore || window.callsCore);
            }
        });

        window.addEventListener('core.ready', function(event) {
            if (event.detail?.module === 'calls' || !event.detail) {
                if (DEBUG) {
                    logOnce('success', 'Received core.ready for calls module');
                }
                handleCoreReady(window.callCore || window.CallsCore || window.callsCore);
            }
        });

        window.addEventListener('calls-ready', function(event) {
            if (DEBUG) {
                logOnce('success', 'Received calls-ready event');
            }
            handleCoreReady(window.callCore || window.CallsCore || window.callsCore);
        });

        // Also listen for lifecycle state changes from core
        window.addEventListener('module_state_change', function(event) {
            const detail = event.detail;
            if (detail && detail.module === 'calls') {
                coreLifecycleState = detail.to;
                if (DEBUG) {
                    logOnce('info', `Core lifecycle state changed: ${detail.from} → ${detail.to}`, detail.reason);
                }
                
                // Update UI state based on core lifecycle
                if (detail.to === 'ACTIVE') {
                    coreReady = true;
                    parentReady = true;
                    handshakeComplete = true;
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                    // Try to process any pending call now that core is active
                    attemptPendingCall();
                } else if (detail.to === 'WAIT_PARENT') {
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                } else if (detail.to === 'ERROR') {
                    fallbackModeActive = true;
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                }
            }
        });

        // Listen for parent ready from core
        window.addEventListener('parent_ready', function() {
            parentReady = true;
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
            attemptPendingCall();
        });

        _coreListenersInitialized = true;
        
        if (DEBUG) {
            logOnce('info', 'Core ready listeners established');
        }
    }

    function handleCoreReady(core) {
        if (coreReady) {
            if (DEBUG) {
                logOnce('info', 'Core already marked as ready, skipping duplicate');
            }
            return;
        }
        
        if (DEBUG) {
            logOnce('success', 'Core is now ready after ' + (Date.now() - coreInitializationStartTime) + 'ms');
        }
        
        coreReady = true;
        coreInstance = core || window.callCore || window.CallsCore || window.callsCore;
        
        // Update state from core
        if (coreInstance) {
            if (coreInstance.getState) {
                const state = coreInstance.getState();
                parentReady = state.parentReady || false;
                sessionReady = state.sessionStatus === 'valid';
                handshakeComplete = state.registered && state.sessionReceived;
                fallbackModeActive = state.degraded || false;
                inPassiveMode = state.inPassiveMode || false;
                coreLifecycleState = state.lifecycleState || coreInstance.getLifecycleState?.() || 'UNKNOWN';
                
                // Update session cache from core
                if (state.session && state.session.token && state.session.authenticated !== false) {
                    window.__CHILD_SESSION__.token = state.session.token;
                    window.__CHILD_SESSION__.userId = state.session.userId;
                    window.__CHILD_SESSION__.expires = state.session.expiresAt;
                    _sessionInvalid = false;
                } else if (state.session && !state.session.authenticated) {
                    _sessionInvalid = true;
                }
            }
            
            if (coreInstance.getLifecycleState) {
                const lifecycleState = coreInstance.getLifecycleState();
                coreLifecycleState = lifecycleState;
                if (lifecycleState === 'ACTIVE') {
                    parentReady = true;
                }
            }
            
            // Get parent ready status
            if (coreInstance.getParentReady) {
                parentReady = coreInstance.getParentReady();
            }
            
            // Get session status
            if (coreInstance.isAuthenticated) {
                sessionReady = coreInstance.isAuthenticated();
            }
            
            // Get session directly
            if (coreInstance.getSession) {
                const session = coreInstance.getSession();
                if (session && session.token && session.authenticated !== false) {
                    window.__CHILD_SESSION__.token = session.token;
                    window.__CHILD_SESSION__.userId = session.userId;
                    window.__CHILD_SESSION__.expires = session.expiresAt;
                    sessionReady = true;
                    _sessionInvalid = false;
                } else if (session && !session.authenticated) {
                    _sessionInvalid = true;
                }
            }
        }
        
        performFullInitialization();
        attemptPendingCall();
    }

    function detectExistingCore() {
        if (window.callCore) {
            // Check if core is in ACTIVE state
            if (window.callCore.getLifecycleState && window.callCore.getLifecycleState() === 'ACTIVE') {
                if (DEBUG) {
                    logOnce('success', 'callCore is in ACTIVE state');
                }
                coreReady = true;
                coreInstance = window.callCore;
                coreLifecycleState = 'ACTIVE';
                parentReady = true;
                
                // Get session
                if (window.callCore.getSession) {
                    const session = window.callCore.getSession();
                    if (session && session.token && session.authenticated !== false) {
                        window.__CHILD_SESSION__.token = session.token;
                        window.__CHILD_SESSION__.userId = session.userId;
                        window.__CHILD_SESSION__.expires = session.expiresAt;
                        sessionReady = true;
                        _sessionInvalid = false;
                    }
                }
                
                return true;
            }
            
            // Check if core reports ready
            if (window.callCore.isCoreReady && typeof window.callCore.isCoreReady === 'function') {
                if (window.callCore.isCoreReady()) {
                    if (DEBUG) {
                        logOnce('success', 'callCore.isCoreReady() returned true');
                    }
                    coreReady = true;
                    coreInstance = window.callCore;
                    
                    if (window.callCore.getState) {
                        const state = window.callCore.getState();
                        parentReady = state.parentReady || false;
                        sessionReady = state.sessionStatus === 'valid';
                        
                        if (state.session && state.session.token && state.session.authenticated !== false) {
                            window.__CHILD_SESSION__.token = state.session.token;
                            window.__CHILD_SESSION__.userId = state.session.userId;
                            window.__CHILD_SESSION__.expires = state.session.expiresAt;
                            _sessionInvalid = false;
                        }
                    }
                    
                    if (window.callCore.getLifecycleState) {
                        coreLifecycleState = window.callCore.getLifecycleState();
                    }
                    
                    return true;
                }
            }
            
            // Check session status
            if (window.callCore.getSessionStatus && window.callCore.getSessionStatus() === 'valid') {
                if (DEBUG) {
                    logOnce('success', 'callCore session status is valid');
                }
                coreReady = true;
                coreInstance = window.callCore;
                sessionReady = true;
                
                if (window.callCore.getParentReady) {
                    parentReady = window.callCore.getParentReady();
                }
                
                // Update session cache
                const session = window.callCore.getSession();
                if (session && session.token) {
                    window.__CHILD_SESSION__.token = session.token;
                    window.__CHILD_SESSION__.userId = session.userId;
                    window.__CHILD_SESSION__.expires = session.expiresAt;
                    _sessionInvalid = false;
                }
                
                if (window.callCore.getLifecycleState) {
                    coreLifecycleState = window.callCore.getLifecycleState();
                }
                
                return true;
            }
            
            if (window.callCore.getState) {
                const state = window.callCore.getState();
                if (state && state.coreReady) {
                    if (DEBUG) {
                        logOnce('success', 'callCore state shows coreReady');
                    }
                    coreReady = true;
                    coreInstance = window.callCore;
                    parentReady = state.parentReady || false;
                    sessionReady = state.sessionStatus === 'valid';
                    coreLifecycleState = state.lifecycleState || 'UNKNOWN';
                    
                    // Update session cache
                    if (state.session && state.session.token && state.session.authenticated !== false) {
                        window.__CHILD_SESSION__.token = state.session.token;
                        window.__CHILD_SESSION__.userId = state.session.userId;
                        window.__CHILD_SESSION__.expires = state.session.expiresAt;
                        _sessionInvalid = false;
                    }
                    
                    return true;
                }
            }
            
            if (window.callCore.getLifecycleState) {
                const lifecycleState = window.callCore.getLifecycleState();
                coreLifecycleState = lifecycleState;
                if (lifecycleState === 'ACTIVE' || lifecycleState === 'WAIT_PARENT') {
                    if (DEBUG) {
                        logOnce('success', `callCore lifecycle state: ${lifecycleState}`);
                    }
                    coreReady = lifecycleState === 'ACTIVE';
                    coreInstance = window.callCore;
                    if (lifecycleState === 'ACTIVE') {
                        parentReady = true;
                    }
                    
                    // Try to get session
                    if (window.callCore.getSession) {
                        const session = window.callCore.getSession();
                        if (session && session.token && session.authenticated !== false) {
                            window.__CHILD_SESSION__.token = session.token;
                            window.__CHILD_SESSION__.userId = session.userId;
                            window.__CHILD_SESSION__.expires = session.expiresAt;
                            sessionReady = true;
                            _sessionInvalid = false;
                        }
                    }
                    
                    return true;
                }
            }
        }
        
        return false;
    }

    function waitForCoreReady() {
        return new Promise((resolve) => {
            if (detectExistingCore()) {
                if (DEBUG) {
                    logOnce('success', 'Core already ready, resolving immediately');
                }
                resolve(true);
                return;
            }
            
            if (DEBUG) {
                logOnce('info', 'Waiting for core to become ready via events');
            }
            
            // Set up one-time event listeners
            const readyHandler = function() {
                window.removeEventListener('CALLS_CORE_READY', readyHandler);
                window.removeEventListener('MODULE_READY', moduleHandler);
                window.removeEventListener('core.ready', coreReadyHandler);
                window.removeEventListener('calls-ready', callsReadyHandler);
                
                if (DEBUG) {
                    logOnce('success', 'Core ready detected via event');
                }
                
                coreReady = true;
                coreInstance = window.callCore || window.CallsCore || window.callsCore;
                
                if (coreInstance) {
                    if (coreInstance.getState) {
                        const state = coreInstance.getState();
                        parentReady = state.parentReady || false;
                        coreLifecycleState = state.lifecycleState || 'UNKNOWN';
                        
                        // Update session cache
                        if (state.session && state.session.token && state.session.authenticated !== false) {
                            window.__CHILD_SESSION__.token = state.session.token;
                            window.__CHILD_SESSION__.userId = state.session.userId;
                            window.__CHILD_SESSION__.expires = state.session.expiresAt;
                            sessionReady = true;
                            _sessionInvalid = false;
                        }
                    }
                    if (coreInstance.getLifecycleState) {
                        coreLifecycleState = coreInstance.getLifecycleState();
                    }
                }
                
                resolve(true);
            };
            
            const moduleHandler = function(event) {
                if (event.detail?.module === 'calls' || !event.detail) {
                    window.removeEventListener('CALLS_CORE_READY', readyHandler);
                    window.removeEventListener('MODULE_READY', moduleHandler);
                    window.removeEventListener('core.ready', coreReadyHandler);
                    window.removeEventListener('calls-ready', callsReadyHandler);
                    
                    if (DEBUG) {
                        logOnce('success', 'Core ready detected via MODULE_READY');
                    }
                    
                    coreReady = true;
                    coreInstance = window.callCore || window.CallsCore || window.callsCore;
                    
                    if (coreInstance) {
                        if (coreInstance.getState) {
                            const state = coreInstance.getState();
                            parentReady = state.parentReady || false;
                            coreLifecycleState = state.lifecycleState || 'UNKNOWN';
                            
                            if (state.session && state.session.token && state.session.authenticated !== false) {
                                window.__CHILD_SESSION__.token = state.session.token;
                                window.__CHILD_SESSION__.userId = state.session.userId;
                                window.__CHILD_SESSION__.expires = state.session.expiresAt;
                                sessionReady = true;
                                _sessionInvalid = false;
                            }
                        }
                        if (coreInstance.getLifecycleState) {
                            coreLifecycleState = coreInstance.getLifecycleState();
                        }
                    }
                    
                    resolve(true);
                }
            };
            
            const coreReadyHandler = function(event) {
                if (event.detail?.module === 'calls' || !event.detail) {
                    window.removeEventListener('CALLS_CORE_READY', readyHandler);
                    window.removeEventListener('MODULE_READY', moduleHandler);
                    window.removeEventListener('core.ready', coreReadyHandler);
                    window.removeEventListener('calls-ready', callsReadyHandler);
                    
                    if (DEBUG) {
                        logOnce('success', 'Core ready detected via core.ready');
                    }
                    
                    coreReady = true;
                    coreInstance = window.callCore || window.CallsCore || window.callsCore;
                    
                    if (coreInstance) {
                        if (coreInstance.getState) {
                            const state = coreInstance.getState();
                            parentReady = state.parentReady || false;
                            coreLifecycleState = state.lifecycleState || 'UNKNOWN';
                            
                            if (state.session && state.session.token && state.session.authenticated !== false) {
                                window.__CHILD_SESSION__.token = state.session.token;
                                window.__CHILD_SESSION__.userId = state.session.userId;
                                window.__CHILD_SESSION__.expires = state.session.expiresAt;
                                sessionReady = true;
                                _sessionInvalid = false;
                            }
                        }
                        if (coreInstance.getLifecycleState) {
                            coreLifecycleState = coreInstance.getLifecycleState();
                        }
                    }
                    
                    resolve(true);
                }
            };
            
            const callsReadyHandler = function() {
                window.removeEventListener('CALLS_CORE_READY', readyHandler);
                window.removeEventListener('MODULE_READY', moduleHandler);
                window.removeEventListener('core.ready', coreReadyHandler);
                window.removeEventListener('calls-ready', callsReadyHandler);
                
                if (DEBUG) {
                    logOnce('success', 'Core ready detected via calls-ready');
                }
                
                coreReady = true;
                coreInstance = window.callCore || window.CallsCore || window.callsCore;
                
                if (coreInstance) {
                    if (coreInstance.getState) {
                        const state = coreInstance.getState();
                        parentReady = state.parentReady || false;
                        coreLifecycleState = state.lifecycleState || 'UNKNOWN';
                        
                        if (state.session && state.session.token && state.session.authenticated !== false) {
                            window.__CHILD_SESSION__.token = state.session.token;
                            window.__CHILD_SESSION__.userId = state.session.userId;
                            window.__CHILD_SESSION__.expires = state.session.expiresAt;
                            sessionReady = true;
                            _sessionInvalid = false;
                        }
                    }
                    if (coreInstance.getLifecycleState) {
                        coreLifecycleState = coreInstance.getLifecycleState();
                    }
                }
                
                resolve(true);
            };
            
            window.addEventListener('CALLS_CORE_READY', readyHandler);
            window.addEventListener('MODULE_READY', moduleHandler);
            window.addEventListener('core.ready', coreReadyHandler);
            window.addEventListener('calls-ready', callsReadyHandler);
            
            // No timeout - just wait for events
        });
    }

    // ==================== OPEN_CALL_WITH_USER EVENT HANDLER ====================
    function handleOpenCallWithUser(event) {
        const data = event.detail || event.data || {};
        
        if (DEBUG) {
            logOnce('info', 'Received OPEN_CALL_WITH_USER event', data);
        }
        
        // Extract call details
        const userId = data.userId || data.user_id || data.id;
        const userName = data.userName || data.name || data.user_name || 'User';
        let callType = data.callType || data.type || data.call_type || 'voice';
        
        // Validate call type
        if (callType !== 'voice' && callType !== 'video') {
            callType = 'voice';
        }
        
        if (!userId) {
            logOnce('error', 'OPEN_CALL_WITH_USER missing userId', data);
            showNotification('Cannot start call: missing user information', 'error');
            return;
        }
        
        // Check if already in a call
        if (coreInstance && coreInstance.isInCall && coreInstance.isInCall()) {
            showNotification('You are already in a call. End current call to start a new one.', 'warning');
            return;
        }
        
        // Store pending call
        pendingCall.userId = userId;
        pendingCall.userName = userName;
        pendingCall.callType = callType;
        pendingCall.initiated = false;
        pendingCall.retryCount = 0;
        
        // Clear any existing retry timer
        if (pendingCall.retryTimer) {
            clearTimeout(pendingCall.retryTimer);
            pendingCall.retryTimer = null;
        }
        
        // Pre-fill UI: show selected user in call modal
        prefillCallModal(userId, userName, callType);
        
        // Open call modal immediately
        openCallModalForUser(userId, userName, callType);
        
        // Attempt to initiate call (will retry if core not ready)
        attemptPendingCall();
    }
    
    function prefillCallModal(userId, userName, callType) {
        // Store selected user info in UI state for modal pre-fill
        UIState.pendingCallUser = {
            id: userId,
            name: userName,
            type: callType,
            timestamp: Date.now()
        };
        
        // If contacts list is available, pre-select this user
        setTimeout(() => {
            const contactCheckbox = document.querySelector(`.contact-checkbox[id="contact-${userId}"]`);
            if (contactCheckbox) {
                contactCheckbox.checked = true;
                const contactItem = contactCheckbox.closest('.contact-item');
                if (contactItem) {
                    contactItem.classList.add('selected');
                }
            } else {
                // If contact not found in list, try to find by data-id
                const contactItem = document.querySelector(`.contact-item[data-id="${userId}"]`);
                if (contactItem) {
                    const checkbox = contactItem.querySelector('.contact-checkbox');
                    if (checkbox) {
                        checkbox.checked = true;
                        contactItem.classList.add('selected');
                    }
                }
            }
        }, 100);
    }
    
    function openCallModalForUser(userId, userName, callType) {
        // Open the new call modal
        if (elements.newCallModal) {
            elements.newCallModal.classList.add('active');
            UIState.activeModals.add('newCallModal');
            
            // Switch to contacts tab
            UIEventHandlers.switchNewCallTab('contacts');
            
            // Update modal title or show selected user info
            const modalTitle = elements.newCallModal.querySelector('.modal-title');
            if (modalTitle) {
                modalTitle.innerHTML = `<i class="fas fa-phone-alt"></i> Call ${SecuritySanitizer.sanitizeString(userName)}`;
            }
            
            // Show a subtle notification that call is being prepared
            showNotification(`Preparing ${callType} call with ${userName}...`, 'info');
        } else {
            // Fallback: show notification only
            showNotification(`Starting ${callType} call with ${userName}...`, 'info');
        }
    }
    
    function attemptPendingCall() {
        // Check if there's a pending call
        if (!pendingCall.userId || pendingCall.initiated) {
            return;
        }
        
        // Check if core is ready
        const isCoreActive = coreInstance && 
            ((coreInstance.getLifecycleState && coreInstance.getLifecycleState() === 'ACTIVE') ||
             (coreInstance.isCoreReady && coreInstance.isCoreReady()) ||
             coreReady);
        
        const isParentReadyFlag = parentReady || (coreInstance && coreInstance.getParentReady && coreInstance.getParentReady());
        
        if (!isCoreActive || !isParentReadyFlag) {
            // Core not ready yet - schedule retry
            if (pendingCall.retryCount < pendingCall.maxRetries) {
                pendingCall.retryCount++;
                const delay = pendingCall.retryDelay * Math.pow(1.5, pendingCall.retryCount - 1);
                
                if (DEBUG) {
                    logOnce('info', `Core not ready for call, retry ${pendingCall.retryCount}/${pendingCall.maxRetries} in ${delay}ms`);
                }
                
                pendingCall.retryTimer = setTimeout(() => {
                    attemptPendingCall();
                }, delay);
            } else {
                // Max retries exceeded
                logOnce('error', `Failed to initiate call after ${pendingCall.maxRetries} retries - core not ready`);
                showNotification(`Unable to start call with ${pendingCall.userName}. Please try again later.`, 'error');
                clearPendingCall();
            }
            return;
        }
        
        // Check if already in a call
        if (coreInstance.isInCall && coreInstance.isInCall()) {
            showNotification('You are already in a call. End current call to start a new one.', 'warning');
            clearPendingCall();
            return;
        }
        
        // Core is ready - initiate the call
        initiateCallWithPendingUser();
    }
    
    async function initiateCallWithPendingUser() {
        if (!pendingCall.userId || pendingCall.initiated) {
            return;
        }
        
        const { userId, userName, callType } = pendingCall;
        
        if (DEBUG) {
            logOnce('info', `Initiating ${callType} call with ${userName} (${userId})`);
        }
        
        pendingCall.initiated = true;
        
        // Close any retry timer
        if (pendingCall.retryTimer) {
            clearTimeout(pendingCall.retryTimer);
            pendingCall.retryTimer = null;
        }
        
        try {
            // Prepare contact object for the call
            const contact = {
                id: userId,
                name: userName,
                callType: callType
            };
            
            // Use core's initCall or startCall method
            let result;
            
            if (coreInstance && coreInstance.initCall) {
                result = await coreInstance.initCall(callType, [contact]);
            } else if (coreInstance && coreInstance.startCall) {
                result = await coreInstance.startCall(userId, callType);
            } else if (coreInstance && coreInstance.initiateCall) {
                result = await coreInstance.initiateCall([userId], callType);
            } else {
                // Fallback: simulate call initiation (for testing/development)
                if (DEBUG) {
                    logOnce('warn', 'No core call initiation method found, simulating call start');
                }
                result = { success: true, simulated: true };
            }
            
            if (result && result.success) {
                showNotification(`${callType === 'video' ? 'Video call' : 'Voice call'} started with ${userName}`, 'success');
                clearPendingCall();
            } else {
                const errorMsg = result?.error || 'Unknown error';
                logOnce('error', `Call initiation failed: ${errorMsg}`);
                showNotification(`Failed to start call with ${userName}: ${errorMsg}`, 'error');
                clearPendingCall();
            }
        } catch (error) {
            logOnce('error', `Call initiation exception: ${error.message}`, error);
            showNotification(`Failed to start call with ${userName}. Please try again.`, 'error');
            clearPendingCall();
        }
    }
    
    function clearPendingCall() {
        if (pendingCall.retryTimer) {
            clearTimeout(pendingCall.retryTimer);
            pendingCall.retryTimer = null;
        }
        
        pendingCall.userId = null;
        pendingCall.userName = null;
        pendingCall.callType = null;
        pendingCall.initiated = false;
        pendingCall.retryCount = 0;
        
        // Clear pre-filled UI state
        UIState.pendingCallUser = null;
    }
    
    // Listen for OPEN_CALL_WITH_USER events
    function setupOpenCallWithUserListener() {
        // Listen for custom event
        window.addEventListener('OPEN_CALL_WITH_USER', handleOpenCallWithUser);
        
        // Also listen for message events from parent iframe communication
        window.addEventListener('message', function(event) {
            const data = event.data;
            if (data && (data.type === 'OPEN_CALL_WITH_USER' || data.type === 'START_CALL' || data.type === 'CALL_USER')) {
                handleOpenCallWithUser({ detail: data.payload || data });
            }
        });
        
        if (DEBUG) {
            logOnce('info', 'OPEN_CALL_WITH_USER listener established');
        }
    }

    // ==================== DOM ELEMENTS CACHE ====================
    const elements = {};

    function cacheElements() {
        return UIErrorBoundary.execute(() => {
            const startTime = performance.now();
            
            const selectors = {
                appContainer: '#appContainer',
                sidebar: '#sidebar',
                callContainer: '#callContainer',
                
                newCallBtn: '#newCallBtn',
                quickVoiceBtn: '#quickVoiceBtn',
                quickVideoBtn: '#quickVideoBtn',
                quickGroupBtn: '#quickGroupBtn',
                settingsToggle: '#settingsToggle',
                settingsToggleIcon: '#settingsToggleIcon',
                menuDotsBtn: '#menuDotsBtn',
                menuDotsDropdown: '#menuDotsDropdown',
                
                menuParticipants: '#menuParticipants',
                menuChat: '#menuChat',
                menuWhiteboard: '#menuWhiteboard',
                menuNotes: '#menuNotes',
                menuPolls: '#menuPolls',
                menuRelationship: '#menuRelationship',
                
                muteBtn: '#muteBtn',
                videoBtn: '#videoBtn',
                screenShareBtn: '#screenShareBtn',
                speakerBtn: '#speakerBtn',
                moodBtn: '#moodBtn',
                intentionBtn: '#intentionBtn',
                focusModeBtn: '#focusModeBtn',
                endCallBtn: '#endCallBtn',
                
                callWithName: '#callWithName',
                callStatusText: '#callStatusText',
                callTypeIcon: '#callTypeIcon',
                callDuration: '#callDuration',
                callMoodIndicator: '#callMoodIndicator',
                callIntentionIndicator: '#callIntentionIndicator',
                videoGrid: '#videoGrid',
                offlineCallPlaceholder: '#offlineCallPlaceholder',
                reactionsContainer: '#reactionsContainer',
                
                newCallModal: '#newCallModal',
                closeNewCallModal: '#closeNewCallModal',
                incomingCallModal: '#incomingCallModal',
                incomingCallName: '#incomingCallName',
                incomingCallType: '#incomingCallType',
                incomingCallAvatar: '#incomingCallAvatar',
                incomingCallMood: '#incomingCallMood',
                incomingCallIntention: '#incomingCallIntention',
                declineTimer: '#declineTimer',
                declineCallBtn: '#declineCallBtn',
                acceptCallBtn: '#acceptCallBtn',
                acceptVideoCallBtn: '#acceptVideoCallBtn',
                
                settingsPanel: '#settingsPanel',
                resetSettingsBtn: '#resetSettingsBtn',
                emotionalContextToggle: '#emotionalContextToggle',
                callIntentionToggle: '#callIntentionToggle',
                inCallChatToggle: '#inCallChatToggle',
                whiteboardToggle: '#whiteboardToggle',
                pollsToggle: '#pollsToggle',
                notesToggle: '#notesToggle',
                focusModeToggle: '#focusModeToggle',
                liveReactionsToggle: '#liveReactionsToggle',
                
                contactSearch: '#contactSearch',
                groupContactSearch: '#groupContactSearch',
                contactsList: '#contactsList',
                groupContactsList: '#groupContactsList',
                contactsLoading: '#contactsLoading',
                callsLoading: '#callsLoading',
                startVoiceCallBtn: '#startVoiceCallBtn',
                startVideoCallBtn: '#startVideoCallBtn',
                startGroupCallBtn: '#startGroupCallBtn',
                instantGroupOption: '#instantGroupOption',
                scheduledGroupOption: '#scheduledGroupOption',
                
                copyLinkBtn: '#copyLinkBtn',
                shareLinkBtn: '#shareLinkBtn',
                generateVoiceLinkBtn: '#generateVoiceLinkBtn',
                generateVideoLinkBtn: '#generateVideoLinkBtn',
                callLinkInput: '#callLinkInput',
                
                mpesaOption: '#mpesaOption',
                cancelPaymentBtn: '#cancelPaymentBtn',
                processPaymentBtn: '#processPaymentBtn',
                cancelUpgradeBtn: '#cancelUpgradeBtn',
                upgradeNowBtn: '#upgradeNowBtn',
                paymentModal: '#paymentModal',
                premiumLimitOverlay: '#premiumLimitOverlay',
                phoneNumber: '#phoneNumber',
                paymentAmount: '#paymentAmount',
                
                cancelMoodBtn: '#cancelMoodBtn',
                setMoodBtn: '#setMoodBtn',
                cancelIntentionBtn: '#cancelIntentionBtn',
                setIntentionBtn: '#setIntentionBtn',
                moodSelectionModal: '#moodSelectionModal',
                intentionSelectionModal: '#intentionSelectionModal',
                
                skipNotesBtn: '#skipNotesBtn',
                saveNotesBtn: '#saveNotesBtn',
                summaryDoneBtn: '#summaryDoneBtn',
                privateNotesModal: '#privateNotesModal',
                privateNotesTitle: '#privateNotesTitle',
                privateNotesSubtitle: '#privateNotesSubtitle',
                privateNotesTextarea: '#privateNotesTextarea',
                callSummaryModal: '#callSummaryModal',
                summaryDuration: '#summaryDuration',
                summaryTime: '#summaryTime',
                summaryType: '#summaryType',
                summaryMood: '#summaryMood',
                summaryIntention: '#summaryIntention',
                summaryParticipants: '#summaryParticipants',
                
                urlParamCancelBtn: '#urlParamCancelBtn',
                urlParamJoinBtn: '#urlParamJoinBtn',
                urlParamOverlay: '#urlParamOverlay',
                urlParamCallId: '#urlParamCallId',
                
                allCallsSection: '#allCallsSection',
                missedCallsSection: '#missedCallsSection',
                groupCallsSection: '#groupCallsSection',
                allCallsList: '#allCallsList',
                missedCallsList: '#missedCallsList',
                groupCallsList: '#groupCallsList',
                
                pipCloseBtn: '#pipCloseBtn',
                pipContainer: '#pipContainer',
                
                syncIndicator: '#syncIndicator',
                apiStatusIndicator: '#apiStatusIndicator',
                apiStatusText: '#apiStatusText',
                offlineBanner: '#offlineBanner',
                notificationArea: '#notificationArea',
                
                debugToggle: '#debugToggle',
                debugPanel: '#debugPanel',
                envBadge: '#envBadge',
                envText: '#envText',
                recoveryIndicator: '#recoveryIndicator',
                recoveryMessage: '#recoveryMessage',
                
                fallbackBanner: '#fallbackBanner'
            };
            
            Object.entries(selectors).forEach(([key, selector]) => {
                try {
                    const element = document.querySelector(selector);
                    if (element) {
                        elements[key] = element;
                        UIState.cachedElements.set(key, element);
                    }
                } catch (error) {
                    if (DEBUG) {
                        logOnce('warn', `Failed to cache element: ${key}`, { selector, error: error.message });
                    }
                }
            });
            
            try {
                elements.categoryBtns = document.querySelectorAll('.category-btn');
                elements.newCallTabs = document.querySelectorAll('.new-call-tab');
                elements.moodOptions = document.querySelectorAll('.mood-option');
                elements.intentionOptions = document.querySelectorAll('.intention-option');
                elements.reactionBtns = document.querySelectorAll('.reaction-btn');
                elements.paymentOptions = document.querySelectorAll('.payment-option');
                
                Object.defineProperty(elements, 'contactCheckboxes', {
                    get: function() { 
                        try {
                            return document.querySelectorAll('.contact-checkbox'); 
                        } catch (e) {
                            return [];
                        }
                    }
                });
                
                Object.defineProperty(elements, 'groupContactCheckboxes', {
                    get: function() { 
                        try {
                            return document.querySelectorAll('.group-contact'); 
                        } catch (e) {
                            return [];
                        }
                    }
                });
                
                Object.defineProperty(elements, 'selectedContacts', {
                    get: function() { 
                        try {
                            return document.querySelectorAll('.contact-item.selected'); 
                        } catch (e) {
                            return [];
                        }
                    }
                });
            } catch (error) {
                if (DEBUG) {
                    logOnce('error', 'Failed to cache dynamic element groups', error);
                }
            }
            
            UIState.lastRenderTime = performance.now() - startTime;
            
            return Object.keys(elements).length;
        }, 'cacheElements', 0);
    }

    // ==================== UI LOGGER ====================
    const UILogger = {
        _history: [],
        _errors: new Map(),
        _metrics: {
            render: [],
            interaction: [],
            error: []
        },
        _debugMode: DEBUG,
        
        _hash: function(msg) {
            let hash = 0;
            for (let i = 0; i < msg.length; i++) {
                hash = ((hash << 5) - hash) + msg.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString(16);
        },
        
        _sanitize: function(data) {
            try {
                return JSON.parse(JSON.stringify(data, (key, value) => {
                    if (key === 'stream' || key === 'peer' || key.includes('Stream')) {
                        return '[Stream]';
                    }
                    if (key === 'token' || key.includes('Token') || key.includes('auth')) {
                        return '[REDACTED]';
                    }
                    if (key === 'password' || key.includes('Password') || key.includes('secret')) {
                        return '[REDACTED]';
                    }
                    return value;
                }));
            } catch {
                return String(data);
            }
        },
        
        _store: function(level, msg, data) {
            const entry = {
                timestamp: Date.now(),
                level,
                msg,
                data: data ? this._sanitize(data) : null,
                id: this._hash(msg + Date.now()),
                module: 'calls-ui'
            };
            this._history.push(entry);
            if (this._history.length > 100) this._history.shift();
            return entry;
        },
        
        info: function(msg, data = null) {
            this._store('info', msg, data);
            if (this._debugMode) {
                logOnce('info', msg, data);
            }
        },
        
        warn: function(msg, data = null) {
            this._store('warn', msg, data);
            if (this._debugMode) {
                logOnce('warn', msg, data);
            }
        },
        
        error: function(msg, error = null, context = null) {
            const hash = this._hash(msg + (error?.stack || '') + (context || ''));
            const now = Date.now();
            
            if (this._errors.has(hash)) {
                const lastLog = this._errors.get(hash);
                if (now - lastLog < 60000) return;
            }
            
            this._errors.set(hash, now);
            this._store('error', msg, { error: error?.message || error, context });
            
            logOnce('error', msg, { error: error?.message, context });
            
            setTimeout(() => this._errors.delete(hash), 60000);
        },
        
        once: function(msg, data = null) {
            const hash = this._hash(msg);
            if (!this._errors.has(hash)) {
                this._errors.set(hash, Date.now());
                this._store('once', msg, data);
                logOnce('info', msg, data);
                setTimeout(() => this._errors.delete(hash), 5000);
            }
        },
        
        performance: function(operation, duration) {
            this._metrics.render.push({ operation, duration, timestamp: Date.now() });
            if (this._metrics.render.length > 50) this._metrics.render.shift();
            
            if (this._debugMode && duration > 100) {
                logOnce('warn', `Slow operation: ${operation} took ${duration.toFixed(2)}ms`);
            }
        },
        
        interaction: function(action, target) {
            this._metrics.interaction.push({ action, target, timestamp: Date.now() });
            if (this._metrics.interaction.length > 100) this._metrics.interaction.shift();
        },
        
        enableDebug: function() { this._debugMode = true; },
        disableDebug: function() { this._debugMode = false; },
        
        getMetrics: function() {
            return {
                historySize: this._history.length,
                errorCount: this._errors.size,
                avgRenderTime: this._metrics.render.reduce((acc, r) => acc + r.duration, 0) / 
                              (this._metrics.render.length || 1),
                interactionCount: this._metrics.interaction.length
            };
        }
    };

    // ==================== UI ERROR BOUNDARY ====================
    const UIErrorBoundary = {
        execute: function(fn, context, fallback = null) {
            try {
                return fn();
            } catch (error) {
                UILogger.error(`UI Error in ${context}`, error);
                this.showFallbackUI(context);
                return fallback;
            }
        },
        
        executeAsync: async function(fn, context, fallback = null) {
            try {
                return await fn();
            } catch (error) {
                UILogger.error(`Async UI Error in ${context}`, error);
                this.showFallbackUI(context);
                return fallback;
            }
        },
        
        createBoundary: function(featureName, fallbackFn) {
            return {
                execute: (fn) => {
                    try {
                        return fn();
                    } catch (error) {
                        UILogger.error(`Feature ${featureName} failed`, error);
                        this.showFeatureFallback(featureName);
                        return fallbackFn ? fallbackFn() : null;
                    }
                },
                executeAsync: async (fn) => {
                    try {
                        return await fn();
                    } catch (error) {
                        UILogger.error(`Feature ${featureName} async failed`, error);
                        this.showFeatureFallback(featureName);
                        return fallbackFn ? fallbackFn() : null;
                    }
                }
            };
        },
        
        showFallbackUI: function(context) {
            if (!elements.appContainer) return;
            
            const fallbackId = `fallback-${context.replace(/[^a-z0-9]/gi, '-')}`;
            if (document.getElementById(fallbackId)) return;
            
            const fallbackEl = document.createElement('div');
            fallbackEl.id = fallbackId;
            fallbackEl.className = 'ui-fallback';
            fallbackEl.setAttribute('role', 'alert');
            fallbackEl.innerHTML = `
                <div class="ui-fallback-content">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>This section is temporarily unavailable</p>
                    <button class="ui-fallback-retry" onclick="window.location.reload()">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
            
            elements.appContainer.appendChild(fallbackEl);
            
            setTimeout(() => {
                if (fallbackEl.parentNode) fallbackEl.remove();
            }, 5000);
        },
        
        showFeatureFallback: function(featureName) {
            UILogger.once(`Feature ${featureName} unavailable`, { feature: featureName });
            
            const notification = createNotification({
                type: 'warning',
                title: 'Feature Unavailable',
                message: `${featureName} is temporarily unavailable`,
                duration: 3000
            });
            
            if (notification) {
                const notificationArea = elements.notificationArea || document.body;
                notificationArea.appendChild(notification);
            }
        }
    };

    // ==================== UI DIAGNOSTICS ====================
    const UIDiagnostics = {
        errors: [],
        
        logError: function(context, error) {
            this.errors.push({
                context,
                message: error?.message || String(error),
                stack: error?.stack,
                timestamp: Date.now(),
                url: window.location.href,
                userAgent: navigator.userAgent
            });
            
            if (this.errors.length > 20) this.errors.shift();
        },
        
        getReport: function() {
            return {
                errors: this.errors,
                elementCache: UIState.cachedElements.size,
                renderStages: { ...UIState.renderStages },
                renderCount: UIState.renderCount,
                activeViews: {
                    currentView: UIState.currentView,
                    panels: Array.from(UIState.activePanels),
                    modals: Array.from(UIState.activeModals)
                },
                responsive: {
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                    inputMode: UIState.inputMode,
                    breakpoint: this.getCurrentBreakpoint()
                },
                performance: UILogger.getMetrics(),
                handshake: {
                    parentReady,
                    sessionReady,
                    handshakeComplete,
                    inPassiveMode,
                    coreReady,
                    coreLifecycleState
                },
                session: {
                    valid: isSessionValid(),
                    hasToken: !!(window.__CHILD_SESSION__ && window.__CHILD_SESSION__.token),
                    invalid: _sessionInvalid
                },
                coreAvailable: !!coreInstance,
                coreLifecycle: coreLifecycleState,
                activeCall: {
                    active: coreInstance ? coreInstance.isInCall ? coreInstance.isInCall() : false : false,
                    callId: coreInstance ? coreInstance.getActiveCallId ? coreInstance.getActiveCallId() : null : null
                },
                pendingCall: {
                    hasPending: !!pendingCall.userId,
                    userId: pendingCall.userId,
                    userName: pendingCall.userName,
                    callType: pendingCall.callType,
                    initiated: pendingCall.initiated,
                    retryCount: pendingCall.retryCount
                }
            };
        },
        
        getCurrentBreakpoint: function() {
            const width = window.innerWidth;
            if (width <= 480) return 'mobile';
            if (width <= 768) return 'tablet';
            if (width <= 1024) return 'desktop';
            return 'wide';
        }
    };

    // ==================== SECURITY SANITIZER ====================
    const SecuritySanitizer = {
        allowedTags: new Set([
            'div', 'span', 'button', 'input', 'label', 'i', 'strong', 'em',
            'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
            'img', 'video', 'canvas', 'svg', 'path', 'circle', 'rect',
            'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th'
        ]),
        
        allowedAttributes: new Set([
            'id', 'class', 'style', 'src', 'alt', 'title', 'width', 'height',
            'data-id', 'data-type', 'data-mood', 'data-intention', 'data-category',
            'data-tab', 'data-tool', 'data-color', 'data-action', 'data-reaction',
            'disabled', 'checked', 'selected', 'placeholder', 'autoplay', 'playsinline',
            'muted', 'controls', 'type', 'name', 'value', 'min', 'max', 'step',
            'role', 'aria-label', 'aria-hidden', 'aria-expanded', 'aria-selected',
            'for', 'href', 'target', 'rel', 'download'
        ]),
        
        allowedProtocols: new Set(['http:', 'https:', 'data:', 'blob:', 'mailto:', 'tel:']),
        
        _patching: false,
        _isSanitizing: false,
        
        initialize: function() {
            if (this._patching) return;
            this._patching = true;
            
            try {
                this.patchDOMMethods();
                if (DEBUG) {
                    logOnce('info', 'Security sanitizer initialized');
                }
            } catch (error) {
                if (DEBUG) {
                    logOnce('error', 'Failed to initialize security sanitizer', error);
                }
            } finally {
                this._patching = false;
            }
        },
        
        patchDOMMethods: function() {
            let originalInnerHTML = null;
            let originalInsertAdjacentHTML = null;
            
            try {
                originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
                originalInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to get original DOM methods', e);
                }
                return;
            }
            
            try {
                if (originalInnerHTML) {
                    const self = this;
                    Object.defineProperty(Element.prototype, 'innerHTML', {
                        set: function(value) {
                            if (this.hasAttribute('data-sanitized') || self._isSanitizing) {
                                return originalInnerHTML.set.call(this, value);
                            }
                            
                            self._isSanitizing = true;
                            try {
                                if (typeof value === 'string') {
                                    value = self.sanitizeString(value);
                                }
                                const result = originalInnerHTML.set.call(this, value);
                                this.setAttribute('data-sanitized', 'true');
                                return result;
                            } finally {
                                self._isSanitizing = false;
                            }
                        },
                        get: originalInnerHTML.get,
                        configurable: true,
                        enumerable: true
                    });
                }
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to patch innerHTML', e);
                }
            }
            
            try {
                if (originalInsertAdjacentHTML) {
                    const self = this;
                    Element.prototype.insertAdjacentHTML = function(position, text) {
                        if (this.hasAttribute('data-sanitized') || self._isSanitizing) {
                            return originalInsertAdjacentHTML.call(this, position, text);
                        }
                        
                        self._isSanitizing = true;
                        try {
                            if (typeof text === 'string') {
                                text = self.sanitizeString(text);
                            }
                            const result = originalInsertAdjacentHTML.call(this, position, text);
                            this.setAttribute('data-sanitized', 'true');
                            return result;
                        } finally {
                            self._isSanitizing = false;
                        }
                    };
                }
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to patch insertAdjacentHTML', e);
                }
            }
        },
        
        sanitizeHTML: function(html) {
            if (!html || typeof html !== 'string') return html;
            return this.sanitizeString(html);
        },
        
        sanitizeString: function(str) {
            if (!str || typeof str !== 'string') return str || '';
            
            let sanitized = str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
                .replace(/javascript:/gi, '')
                .replace(/data:/gi, '')
                .replace(/vbscript:/gi, '')
                .replace(/onload/gi, 'data-onload')
                .replace(/onerror/gi, 'data-onerror')
                .replace(/onclick/gi, 'data-onclick')
                .replace(/onmouse/gi, 'data-onmouse')
                .replace(/onkey/gi, 'data-onkey')
                .replace(/onfocus/gi, 'data-onfocus')
                .replace(/onblur/gi, 'data-onblur')
                .replace(/onsubmit/gi, 'data-onsubmit')
                .replace(/onreset/gi, 'data-onreset')
                .replace(/onchange/gi, 'data-onchange')
                .replace(/onselect/gi, 'data-onselect')
                .replace(/onabort/gi, 'data-onabort');
            
            return sanitized;
        },
        
        sanitizeNode: function(node) {
            if (!node) return;
            
            if (node.nodeType === 1) {
                const tagName = node.tagName.toLowerCase();
                
                if (!this.allowedTags.has(tagName)) {
                    const span = document.createElement('span');
                    while (node.firstChild) {
                        span.appendChild(node.firstChild);
                    }
                    span.className = `sanitized-${tagName}`;
                    if (node.parentNode) {
                        node.parentNode.replaceChild(span, node);
                    }
                    node = span;
                }
                
                const attrs = Array.from(node.attributes);
                attrs.forEach(attr => {
                    const attrName = attr.name.toLowerCase();
                    
                    if (!this.allowedAttributes.has(attrName)) {
                        node.removeAttribute(attr.name);
                        return;
                    }
                    
                    if (attrName === 'src' || attrName === 'href') {
                        const value = attr.value.toLowerCase();
                        const protocol = value.split(':')[0] + ':';
                        if (!this.allowedProtocols.has(protocol) && !value.startsWith('/') && !value.startsWith('#')) {
                            node.removeAttribute(attr.name);
                        }
                    }
                    
                    if (attrName.startsWith('on')) {
                        node.removeAttribute(attr.name);
                    }
                    
                    if (attrName === 'style') {
                        node.setAttribute('style', this.sanitizeCSS(attr.value));
                    }
                });
                
                Array.from(node.childNodes).forEach(child => this.sanitizeNode(child));
            }
        },
        
        sanitizeCSS: function(css) {
            if (!css || typeof css !== 'string') return css;
            
            return css
                .replace(/javascript:/gi, '')
                .replace(/expression\(/gi, '')
                .replace(/@import/gi, '')
                .replace(/url\(['"]?javascript:/gi, 'url()')
                .replace(/behavior:/gi, '')
                .replace(/-moz-binding/gi, '');
        },
        
        sanitizeUserInput: function(input) {
            if (input === null || input === undefined) return '';
            if (typeof input !== 'string') input = String(input);
            return this.sanitizeString(input).trim();
        },
        
        sanitizeURL: function(url) {
            if (!url || typeof url !== 'string') return '';
            
            const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
            try {
                const urlObj = new URL(url, window.location.origin);
                if (safeProtocols.includes(urlObj.protocol)) {
                    return url;
                }
            } catch (e) {
                return this.sanitizeString(url);
            }
            return '#';
        },
        
        safeJSONParse: function(json, fallback = null) {
            try {
                return JSON.parse(json);
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to parse JSON', e);
                }
                return fallback;
            }
        },
        
        // Storage methods - warn but allow for non-auth data
        safeLocalStorageGet: function(key, fallback = null) {
            // Warn about auth tokens
            if (key === 'token' || key.includes('token') || key.includes('auth') || key === 'session' || key.includes('call')) {
                logOnce('warn', `Attempted to read '${key}' from localStorage - use session/call memory instead`);
                return fallback;
            }
            
            try {
                const value = localStorage.getItem(key);
                return value !== null ? value : fallback;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', `Failed to read from localStorage: ${key}`, e);
                }
                return fallback;
            }
        },
        
        safeLocalStorageSet: function(key, value) {
            // Block auth tokens and call state
            if (key === 'token' || key.includes('token') || key.includes('auth') || key === 'session' || key.includes('call')) {
                logOnce('warn', `Blocked storing '${key}' in localStorage - use session/call memory only`);
                return false;
            }
            
            try {
                localStorage.setItem(key, String(value));
                return true;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', `Failed to write to localStorage: ${key}`, e);
                }
                return false;
            }
        },
        
        safeSessionStorageGet: function(key, fallback = null) {
            // Warn about auth tokens
            if (key === 'token' || key.includes('token') || key.includes('auth') || key === 'session' || key.includes('call')) {
                logOnce('warn', `Attempted to read '${key}' from sessionStorage - use session/call memory instead`);
                return fallback;
            }
            
            try {
                const value = sessionStorage.getItem(key);
                return value !== null ? value : fallback;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', `Failed to read from sessionStorage: ${key}`, e);
                }
                return fallback;
            }
        },
        
        safeSessionStorageSet: function(key, value) {
            // Block auth tokens and call state
            if (key === 'token' || key.includes('token') || key.includes('auth') || key === 'session' || key.includes('call')) {
                logOnce('warn', `Blocked storing '${key}' in sessionStorage - use session/call memory only`);
                return false;
            }
            
            try {
                sessionStorage.setItem(key, String(value));
                return true;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', `Failed to write to sessionStorage: ${key}`, e);
                }
                return false;
            }
        }
    };

    // ==================== UI STATE MANAGEMENT ====================
    const UIState = {
        currentView: 'sidebar',
        viewHistory: [],
        restorePoints: new Map(),
        
        activePanels: new Set(),
        activeModals: new Set(),
        activeOverlays: new Set(),
        
        renderStages: {
            skeleton: false,
            initial: false,
            enhanced: false,
            live: false
        },
        
        renderStartTime: 0,
        lastRenderTime: 0,
        renderCount: 0,
        
        cachedElements: new Map(),
        cachedTemplates: new Map(),
        mutationObserver: null,
        
        breakpoints: {
            mobile: 480,
            tablet: 768,
            desktop: 1024,
            wide: 1440
        },
        
        inputMode: 'mouse',
        
        errorRecovery: {
            attempts: new Map(),
            maxAttempts: 3,
            backoffMs: 1000
        },
        
        security: {
            sanitizing: false,
            maxSanitizeDepth: 10,
            currentDepth: 0
        },
        
        initialized: false,
        
        selectedMood: 'neutral',
        selectedIntention: 'quick',
        currentCallCategory: 'all',
        currentNewCallTab: 'contacts',
        selectedContacts: [],
        selectedGroupContacts: [],
        groupCallOption: null,
        callLink: null,
        
        localStream: null,
        remoteStreams: new Map(),
        screenStream: null,
        isMuted: false,
        isVideoOff: false,
        isScreenSharing: false,
        isSpeakerOn: true,
        currentFocusMode: false,
        
        callStartTime: null,
        callDurationInterval: null,
        activeCallId: null,
        callType: null,
        callParticipants: [],
        
        chatMessages: [],
        unreadChatCount: 0,
        
        activePolls: [],
        pollResults: [],
        
        sharedNotes: [],
        privateNotes: {}, // Memory only, not persisted to localStorage
        
        relationshipData: null,
        
        // No polling intervals - rely on core events
        handshakeCheckInterval: null,
        
        // Pending call user info for modal pre-fill
        pendingCallUser: null
    };

    // ==================== RENDERING PIPELINE ====================
    const RenderingPipeline = {
        skeleton: function() {
            return UIErrorBoundary.execute(() => {
                if (DEBUG) {
                    logOnce('info', 'Rendering skeleton UI');
                }
                UIState.renderStartTime = performance.now();
                
                let container = elements.appContainer || document.getElementById('appContainer');
                if (!container) {
                    container = document.createElement('div');
                    container.id = 'appContainer';
                    container.className = 'app-container skeleton';
                    document.body.appendChild(container);
                    elements.appContainer = container;
                    UIState.cachedElements.set('appContainer', container);
                }
                
                const loadingEls = document.querySelectorAll('.loading-indicator, .initializing-overlay, .core-loading-message');
                loadingEls.forEach(el => {
                    if (el) el.style.display = 'none';
                });
                
                container.style.visibility = 'visible';
                container.style.opacity = '1';
                container.style.display = 'block';
                
                container.classList.add('ui-skeleton');
                
                this.renderSkeletonSidebar(container);
                
                UIState.renderStages.skeleton = true;
                UIState.renderCount++;
                
                UILogger.performance('skeleton', performance.now() - UIState.renderStartTime);
                
                return true;
            }, 'skeleton', false);
        },
        
        renderSkeletonSidebar: function(container) {
            let sidebar = elements.sidebar || document.getElementById('sidebar');
            if (!sidebar) {
                sidebar = document.createElement('div');
                sidebar.id = 'sidebar';
                sidebar.className = 'sidebar skeleton';
                sidebar.innerHTML = `
                    <div class="sidebar-header skeleton-pulse"></div>
                    <div class="sidebar-content">
                        <div class="skeleton-item"></div>
                        <div class="skeleton-item"></div>
                        <div class="skeleton-item"></div>
                        <div class="skeleton-item"></div>
                    </div>
                `;
                container.appendChild(sidebar);
                elements.sidebar = sidebar;
                UIState.cachedElements.set('sidebar', sidebar);
            }
            
            sidebar.style.display = 'flex';
            
            return sidebar;
        },
        
        initialRender: function() {
            return UIErrorBoundary.executeAsync(async () => {
                if (DEBUG) {
                    logOnce('info', 'Performing initial render');
                }
                const startTime = performance.now();
                
                await this.waitForCoreReady();
                
                this.renderCachedContacts();
                
                this.updateSyncIndicator();
                
                if (elements.appContainer) {
                    elements.appContainer.classList.remove('ui-skeleton');
                }
                
                UIState.renderStages.initial = true;
                
                UILogger.performance('initialRender', performance.now() - startTime);
                
                return true;
            }, 'initialRender', false);
        },
        
        updateSyncIndicator: function() {
            if (!elements.syncIndicator) return;
            
            if (inPassiveMode) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-clock"></i><span>Waiting for parent</span>';
                elements.syncIndicator.className = 'sync-indicator passive';
                return;
            }
            
            if (fallbackModeActive) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Limited Mode</span>';
                elements.syncIndicator.className = 'sync-indicator error';
                return;
            }
            
            // Show core lifecycle state
            if (coreLifecycleState === 'BOOT' || coreLifecycleState === 'INITIALIZING') {
                elements.syncIndicator.innerHTML = '<i class="fas fa-cog fa-spin"></i><span>Booting...</span>';
                elements.syncIndicator.className = 'sync-indicator booting';
            } else if (coreLifecycleState === 'READY') {
                elements.syncIndicator.innerHTML = '<i class="fas fa-hand-peace"></i><span>Ready</span>';
                elements.syncIndicator.className = 'sync-indicator ready';
            } else if (coreLifecycleState === 'WAIT_PARENT') {
                elements.syncIndicator.innerHTML = '<i class="fas fa-handshake"></i><span>Connecting...</span>';
                elements.syncIndicator.className = 'sync-indicator connecting';
            } else if (!parentReady) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-handshake"></i><span>Connecting...</span>';
                elements.syncIndicator.className = 'sync-indicator connecting';
            } else if (!sessionReady && !_sessionInvalid) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i><span>Syncing...</span>';
                elements.syncIndicator.className = 'sync-indicator syncing';
            } else if (_sessionInvalid) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>Login Required</span>';
                elements.syncIndicator.className = 'sync-indicator error';
            } else {
                elements.syncIndicator.innerHTML = '<i class="fas fa-check-circle"></i><span>Ready</span>';
                elements.syncIndicator.className = 'sync-indicator synced';
            }
        },
        
        waitForCoreReady: function() {
            return new Promise((resolve) => {
                cacheElements();
                
                if (elements.appContainer && elements.sidebar) {
                    resolve();
                    return;
                }
                
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    
                    cacheElements();
                    
                    if ((elements.appContainer && elements.sidebar) || attempts > 20) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 50);
            });
        },
        
        renderCachedContacts: function() {
            try {
                // Don't use localStorage for contacts - rely on parent or core
                if (coreInstance && coreInstance.getState) {
                    const state = coreInstance.getState();
                    if (state && state.contacts) {
                        this.renderContactsList(state.contacts);
                        return;
                    }
                }
                
                // If we have AppState with contacts, use that
                if (window.AppState && window.AppState.contacts && Array.isArray(window.AppState.contacts)) {
                    this.renderContactsList(window.AppState.contacts);
                }
            } catch (error) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to render contacts', error);
                }
            }
        },
        
        renderContactsList: function(contacts) {
            if (!elements.contactsList) return;
            
            try {
                if (!contacts || contacts.length === 0) {
                    elements.contactsList.innerHTML = '<div class="offline-state"><i class="fas fa-users-slash"></i><p>No contacts available</p></div>';
                    return;
                }
                
                let html = '';
                contacts.slice(0, 20).forEach(contact => {
                    const name = contact.name || 'Unknown';
                    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                    const bgColor = '#6c5ce7'; // Default color
                    
                    html += `
                        <div class="contact-item" data-id="${SecuritySanitizer.sanitizeString(contact.id)}">
                            <div class="contact-checkbox-container">
                                <input type="checkbox" class="contact-checkbox" id="contact-${SecuritySanitizer.sanitizeString(contact.id)}">
                            </div>
                            <div class="call-avatar" style="background-color: ${bgColor}">
                                ${contact.avatar ? `<img src="${SecuritySanitizer.sanitizeURL(contact.avatar)}" alt="${SecuritySanitizer.sanitizeString(name)}">` : 
                                  `<span>${SecuritySanitizer.sanitizeString(initials)}</span>`}
                            </div>
                            <div class="call-info">
                                <div class="call-name">
                                    ${SecuritySanitizer.sanitizeString(name)}
                                    ${contact.isPremium ? '<span class="premium-badge">PRO</span>' : ''}
                                </div>
                                <div class="contact-status ${SecuritySanitizer.sanitizeString(contact.status || 'offline')}">
                                    <span class="status-dot"></span>
                                    ${SecuritySanitizer.sanitizeString(contact.status || 'Offline')}
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                elements.contactsList.innerHTML = html;
                
                if (elements.groupContactsList) {
                    elements.groupContactsList.innerHTML = html.replace(/contact-checkbox/g, 'group-contact').replace(/id="contact-/g, 'id="group-contact-');
                }
                
                if (elements.contactsLoading) {
                    elements.contactsLoading.style.display = 'none';
                }
                
                EventSystem.debounce('attachContactEvents', () => {
                    this.attachContactEvents();
                }, 100);
                
            } catch (error) {
                UILogger.error('renderContactsList', error);
                elements.contactsList.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load contacts</p></div>';
            }
        },
        
        attachContactEvents: function() {
            document.querySelectorAll('.contact-item').forEach(item => {
                item.removeEventListener('click', handleContactClick);
                item.addEventListener('click', handleContactClick);
            });
        },
        
        progressiveEnhancement: function() {
            return UIErrorBoundary.executeAsync(async () => {
                if (DEBUG) {
                    logOnce('info', 'Applying progressive enhancement');
                }
                const startTime = performance.now();
                
                EventSystem.initialize();
                
                SecuritySanitizer.initialize();
                
                this.attachReactionEvents();
                
                // Load user preferences from core session, not localStorage
                this.loadUserPreferences();
                
                UIState.renderStages.enhanced = true;
                
                UILogger.performance('progressiveEnhancement', performance.now() - startTime);
                
                return true;
            }, 'progressiveEnhancement', false);
        },
        
        // Load preferences from core session, not localStorage
        loadUserPreferences: function() {
            if (coreInstance && coreInstance.getState) {
                const state = coreInstance.getState();
                if (state) {
                    UIState.selectedMood = state.currentMood || 'neutral';
                    UIState.selectedIntention = state.currentIntention || 'quick';
                    UIState.currentFocusMode = state.currentFocusMode || false;
                }
            }
            
            // Apply focus mode if active
            if (UIState.currentFocusMode && elements.appContainer) {
                elements.appContainer.classList.add('focus-mode');
            }
            if (UIState.currentFocusMode && elements.focusModeBtn) {
                elements.focusModeBtn.classList.add('active');
            }
        },
        
        attachReactionEvents: function() {
            document.querySelectorAll('.reaction-btn').forEach(btn => {
                btn.removeEventListener('click', UIEventHandlers.sendReaction);
                btn.addEventListener('click', UIEventHandlers.sendReaction);
            });
        },
        
        liveUpdate: function() {
            return UIErrorBoundary.executeAsync(async () => {
                if (DEBUG) {
                    logOnce('info', 'Starting live updates');
                }
                
                CoreIntegration.subscribeToCore();
                
                UIState.renderStages.live = true;
                
                return true;
            }, 'liveUpdate', false);
        },
        
        sanitizeHTML: function(str) {
            return SecuritySanitizer.sanitizeString(str);
        },
        
        execute: async function() {
            if (DEBUG) {
                logOnce('info', 'Executing full rendering pipeline');
            }
            
            this.skeleton();
            
            await new Promise(resolve => setTimeout(resolve, 50));
            
            await this.initialRender();
            
            await this.progressiveEnhancement();
            
            await this.liveUpdate();
            
            if (DEBUG) {
                logOnce('info', 'Rendering pipeline complete', UIState.renderStages);
            }
            
            return {
                success: true,
                stages: { ...UIState.renderStages },
                renderCount: UIState.renderCount
            };
        }
    };

    // ==================== CORE INTEGRATION BRIDGE ====================
    const CoreIntegration = {
        _subscriptions: new Set(),
        _initialized: false,
        
        subscribeToCore: function() {
            if (this._initialized) {
                if (DEBUG) {
                    logOnce('info', 'Core integration already initialized');
                }
                return;
            }
            
            if (DEBUG) {
                logOnce('info', 'Subscribing to core events');
            }
            
            if (coreInstance && coreInstance.addListener) {
                coreInstance.addListener(this.handleCoreEvent.bind(this));
                this._subscriptions.add('coreListener');
            }
            
            if (coreInstance && coreInstance.addMediaListener) {
                coreInstance.addMediaListener(this.handleMediaEvent.bind(this));
                this._subscriptions.add('mediaListener');
            }
            
            if (coreInstance && coreInstance.addWebRTCListener) {
                coreInstance.addWebRTCListener(this.handleWebRTCEvent.bind(this));
                this._subscriptions.add('webrtcListener');
            }
            
            this.setupParentMessageHandler();
            
            this.observeAppState();
            
            // Update initial state from core if available
            this.updateStateFromCore();
            
            this._initialized = true;
        },
        
        updateStateFromCore: function() {
            if (!coreInstance) return;
            
            if (coreInstance.getState) {
                const state = coreInstance.getState();
                if (state) {
                    parentReady = state.parentReady || false;
                    sessionReady = state.sessionStatus === 'valid';
                    handshakeComplete = state.registered && state.sessionReceived;
                    fallbackModeActive = state.degraded || false;
                    inPassiveMode = state.inPassiveMode || false;
                    coreLifecycleState = state.lifecycleState || coreInstance.getLifecycleState?.() || 'UNKNOWN';
                    
                    // Update session cache
                    if (state.session && state.session.token && state.session.authenticated !== false) {
                        window.__CHILD_SESSION__.token = state.session.token;
                        window.__CHILD_SESSION__.userId = state.session.userId;
                        window.__CHILD_SESSION__.expires = state.session.expiresAt;
                        _sessionInvalid = false;
                    } else if (state.session && !state.session.authenticated) {
                        _sessionInvalid = true;
                    }
                    
                    // Update UI preferences from core
                    if (state.currentMood) UIState.selectedMood = state.currentMood;
                    if (state.currentIntention) UIState.selectedIntention = state.currentIntention;
                    if (state.currentFocusMode !== undefined) UIState.currentFocusMode = state.currentFocusMode;
                    
                    // Update call state from core
                    UIState.activeCallId = state.activeCallId;
                    UIState.callType = state.callType;
                    UIState.callParticipants = state.callParticipants || [];
                    UIState.callStartTime = state.callStartTime;
                    
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                }
            }
            
            if (coreInstance.getLifecycleState) {
                const lifecycleState = coreInstance.getLifecycleState();
                coreLifecycleState = lifecycleState;
                if (lifecycleState === 'ACTIVE') {
                    parentReady = true;
                }
                if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                    RenderingPipeline.updateSyncIndicator();
                }
            }
            
            if (coreInstance.isInPassiveMode) {
                inPassiveMode = coreInstance.isInPassiveMode();
                if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                    RenderingPipeline.updateSyncIndicator();
                }
            }
            
            if (coreInstance.getParentReady) {
                parentReady = coreInstance.getParentReady();
            }
            
            // Get session directly
            if (coreInstance.getSession) {
                const session = coreInstance.getSession();
                if (session && session.token && session.authenticated !== false) {
                    window.__CHILD_SESSION__.token = session.token;
                    window.__CHILD_SESSION__.userId = session.userId;
                    window.__CHILD_SESSION__.expires = session.expiresAt;
                    sessionReady = true;
                    _sessionInvalid = false;
                } else if (session && !session.authenticated) {
                    _sessionInvalid = true;
                }
            }
        },
        
        handleCoreEvent: function(event, data) {
            if (DEBUG) {
                logOnce('info', `Core event: ${event}`, data);
            }
            
            switch (event) {
                case 'session_update':
                case 'session_valid':
                case 'session_updated':
                    sessionReady = true;
                    _sessionInvalid = false;
                    if (data && data.token) {
                        window.__CHILD_SESSION__.token = data.token;
                        window.__CHILD_SESSION__.userId = data.userId;
                        window.__CHILD_SESSION__.expires = data.expiresAt;
                    }
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                    // Try to process any pending call
                    attemptPendingCall();
                    break;
                case 'session_invalid':
                    sessionReady = false;
                    _sessionInvalid = true;
                    window.__CHILD_SESSION__.token = null;
                    window.__CHILD_SESSION__.userId = null;
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                    break;
                case 'incoming_call':
                    this.handleIncomingCall(data);
                    break;
                case 'call_initiated':
                    this.handleCallInitiated(data);
                    break;
                case 'call_started':
                    this.handleCallStarted(data);
                    break;
                case 'call_connected':
                    this.handleCallConnected(data);
                    break;
                case 'call_ended':
                case 'call_rejected':
                case 'call_failed':
                case 'call_timeout':
                    this.handleCallEnded(data);
                    break;
                case 'logout':
                    this.handleLogout();
                    break;
                case 'mood_updated':
                    if (data && data.mood) {
                        UIState.selectedMood = data.mood;
                        if (elements.callMoodIndicator) {
                            elements.callMoodIndicator.dataset.mood = data.mood;
                        }
                    }
                    break;
                case 'intention_updated':
                    if (data && data.intention) {
                        UIState.selectedIntention = data.intention;
                        if (elements.callIntentionIndicator) {
                            elements.callIntentionIndicator.dataset.intention = data.intention;
                        }
                    }
                    break;
                case 'focus_mode_toggled':
                    if (data && data.enabled !== undefined) {
                        UIState.currentFocusMode = data.enabled;
                        if (elements.focusModeBtn) {
                            if (data.enabled) {
                                elements.focusModeBtn.classList.add('active');
                            } else {
                                elements.focusModeBtn.classList.remove('active');
                            }
                        }
                        if (elements.appContainer) {
                            if (data.enabled) {
                                elements.appContainer.classList.add('focus-mode');
                            } else {
                                elements.appContainer.classList.remove('focus-mode');
                            }
                        }
                    }
                    break;
                case 'remote_stream_added':
                    this.handleRemoteStreamAdded(data);
                    break;
                case 'remote_stream_removed':
                    this.handleRemoteStreamRemoved(data);
                    break;
                case 'degraded_mode':
                    fallbackModeActive = true;
                    this.handleDegradedMode();
                    break;
                case 'passive_mode_entered':
                    inPassiveMode = true;
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                    break;
                case 'parent_ready':
                    parentReady = true;
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                    attemptPendingCall();
                    break;
                case 'session_sync':
                    sessionReady = true;
                    _sessionInvalid = false;
                    if (data && data.token) {
                        window.__CHILD_SESSION__.token = data.token;
                        window.__CHILD_SESSION__.userId = data.userId;
                        window.__CHILD_SESSION__.expires = data.expiresAt;
                    }
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                    attemptPendingCall();
                    break;
                case 'auth_error':
                case 'unauthorized':
                    this.handleAuthError();
                    break;
                case 'state':
                    // Handle core state changes
                    if (data && data.newState) {
                        if (data.newState === 'ACTIVE') {
                            parentReady = true;
                            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                                RenderingPipeline.updateSyncIndicator();
                            }
                            attemptPendingCall();
                        }
                        coreLifecycleState = data.newState;
                        if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                            RenderingPipeline.updateSyncIndicator();
                        }
                    }
                    break;
                case 'module_state_change':
                    if (data && data.to) {
                        coreLifecycleState = data.to;
                        if (data.to === 'ACTIVE') {
                            attemptPendingCall();
                        }
                        if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                            RenderingPipeline.updateSyncIndicator();
                        }
                    }
                    break;
                case 'call_ready':
                    if (elements.callStatusText) {
                        elements.callStatusText.textContent = 'Ready';
                    }
                    break;
                case 'call_connecting':
                    if (elements.callStatusText) {
                        elements.callStatusText.textContent = 'Connecting...';
                    }
                    break;
                case 'call_connected':
                    if (elements.callStatusText) {
                        elements.callStatusText.textContent = 'Connected';
                    }
                    break;
                case 'call_blocked':
                    if (data && data.reason === 'call_active') {
                        showNotification('You are already in a call', 'warning');
                    }
                    break;
            }
        },
        
        handleMediaEvent: function(event, data) {
            if (DEBUG) {
                logOnce('info', `Media event: ${event}`);
            }
            
            switch (event) {
                case 'local_stream_ready':
                    UIState.localStream = data.stream;
                    break;
                case 'local_stream_stopped':
                    UIState.localStream = null;
                    break;
                case 'mic_toggled':
                    UIState.isMuted = !data.enabled;
                    if (elements.muteBtn) {
                        const icon = elements.muteBtn.querySelector('i');
                        if (icon) {
                            icon.className = UIState.isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                        }
                    }
                    break;
                case 'camera_toggled':
                    UIState.isVideoOff = !data.enabled;
                    if (elements.videoBtn) {
                        const icon = elements.videoBtn.querySelector('i');
                        if (icon) {
                            icon.className = UIState.isVideoOff ? 'fas fa-video-slash' : 'fas fa-video';
                        }
                    }
                    break;
                case 'camera_switched':
                    if (data && data.facingMode && elements.videoBtn) {
                        elements.videoBtn.title = `Camera (${data.facingMode})`;
                    }
                    break;
                case 'screen_share_started':
                    UIState.isScreenSharing = true;
                    if (elements.screenShareBtn) {
                        elements.screenShareBtn.classList.add('active');
                    }
                    break;
                case 'screen_share_ended':
                    UIState.isScreenSharing = false;
                    if (elements.screenShareBtn) {
                        elements.screenShareBtn.classList.remove('active');
                    }
                    break;
                case 'stream_error':
                    showNotification(data.error || 'Media error', 'error');
                    break;
            }
        },
        
        handleWebRTCEvent: function(event, data) {
            if (DEBUG) {
                logOnce('info', `WebRTC event: ${event}`);
            }
            
            switch (event) {
                case 'remote_stream_added':
                    if (data && data.stream) {
                        const streamId = data.stream.id;
                        UIState.remoteStreams.set(streamId, data.stream);
                        this.addRemoteVideo(streamId, data.stream);
                    }
                    break;
                case 'remote_stream_removed':
                    if (data && data.streamId) {
                        UIState.remoteStreams.delete(data.streamId);
                        const videoEl = document.querySelector(`.video-container[data-stream-id="${data.streamId}"]`);
                        if (videoEl) videoEl.remove();
                    }
                    break;
                case 'ice_state':
                    if (data && data.state === 'failed') {
                        showNotification('Connection unstable, reconnecting...', 'warning');
                    } else if (data && data.state === 'connected') {
                        if (elements.callStatusText) {
                            elements.callStatusText.textContent = 'Connected';
                        }
                    }
                    break;
                case 'ice_connected':
                    if (elements.callStatusText) {
                        elements.callStatusText.textContent = 'Connected';
                    }
                    break;
                case 'call_connected':
                    if (elements.callStatusText) {
                        elements.callStatusText.textContent = 'In call';
                    }
                    break;
                case 'data_message':
                    if (data && data.type === 'chat' && data.message) {
                        this.addChatMessage(data.sender, data.message, data.timestamp);
                    }
                    break;
                case 'call_failed':
                    if (data && data.reason === 'ice_failed') {
                        showNotification('Call connection failed', 'error');
                    } else if (data && data.reason === 'connection_failed') {
                        showNotification('Connection failed', 'error');
                    }
                    break;
                case 'call_timeout':
                    showNotification('Call connection timeout', 'error');
                    break;
            }
        },
        
        addRemoteVideo: function(streamId, stream) {
            if (!elements.videoGrid) return;
            
            const container = document.createElement('div');
            container.className = 'video-container';
            container.dataset.streamId = streamId;
            
            const video = document.createElement('video');
            video.className = 'video-element';
            video.autoplay = true;
            video.playsInline = true;
            video.srcObject = stream;
            
            const overlay = document.createElement('div');
            overlay.className = 'video-overlay';
            overlay.innerHTML = `
                <div class="video-name">
                    <span>Participant</span>
                </div>
            `;
            
            container.appendChild(video);
            container.appendChild(overlay);
            elements.videoGrid.appendChild(container);
            
            video.play().catch(e => UILogger.warn('Error playing remote video', e));
        },
        
        addChatMessage: function(sender, message, timestamp) {
            const chatPanel = document.querySelector('.chat-panel .chat-messages');
            if (!chatPanel) return;
            
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-message';
            msgEl.innerHTML = `
                <div class="message-sender">${SecuritySanitizer.sanitizeString(sender || 'Participant')}</div>
                <div class="message-content">${SecuritySanitizer.sanitizeString(message)}</div>
                <div class="message-time">${timestamp ? new Date(timestamp).toLocaleTimeString() : 'now'}</div>
            `;
            
            chatPanel.appendChild(msgEl);
            chatPanel.scrollTop = chatPanel.scrollHeight;
        },
        
        handleIncomingCall: function(callData) {
            if (elements.incomingCallModal) {
                if (elements.incomingCallName) {
                    elements.incomingCallName.textContent = callData.callerName || 'Incoming Call';
                }
                if (elements.incomingCallType) {
                    elements.incomingCallType.textContent = callData.callType === 'video' ? 'Video Call' : 'Voice Call';
                }
                if (elements.incomingCallAvatar) {
                    const initials = (callData.callerName || 'C').charAt(0).toUpperCase();
                    elements.incomingCallAvatar.textContent = initials;
                }
                if (elements.incomingCallMood) {
                    elements.incomingCallMood.dataset.mood = callData.callerMood || 'neutral';
                }
                if (elements.incomingCallIntention) {
                    elements.incomingCallIntention.dataset.intention = callData.callerIntention || 'quick';
                }
                
                let timeLeft = 30;
                if (elements.declineTimer) {
                    elements.declineTimer.textContent = timeLeft;
                }
                
                const timer = setInterval(() => {
                    timeLeft--;
                    if (elements.declineTimer) {
                        elements.declineTimer.textContent = timeLeft;
                    }
                    if (timeLeft <= 0) {
                        clearInterval(timer);
                        if (elements.incomingCallModal && elements.incomingCallModal.classList.contains('active')) {
                            UIEventHandlers.declineIncomingCall();
                        }
                    }
                }, 1000);
                
                elements.incomingCallModal.dataset.timer = timer;
                
                elements.incomingCallModal.classList.add('active');
                UIState.activeModals.add('incomingCallModal');
            }
        },
        
        handleCallInitiated: function(callData) {
            UIState.activeCallId = callData.callId;
            UIState.callParticipants = callData.participants || [];
            UIState.callStartTime = Date.now();
            UIState.callType = callData.callType;
            
            if (elements.callContainer) {
                elements.callContainer.classList.add('active');
            }
            if (elements.sidebar) {
                elements.sidebar.style.display = 'none';
            }
            
            const participantNames = UIState.callParticipants.map(p => p.name).join(', ') || 'Call';
            if (elements.callWithName) {
                elements.callWithName.textContent = SecuritySanitizer.sanitizeString(participantNames);
            }
            if (elements.callStatusText) {
                elements.callStatusText.textContent = 'Initiating...';
            }
            
            const icon = UIState.callType === 'video' ? 'fa-video' : 'fa-phone';
            if (elements.callTypeIcon) {
                elements.callTypeIcon.innerHTML = `<i class="fas ${icon}"></i>`;
            }
            
            if (elements.focusModeBtn) {
                elements.focusModeBtn.style.display = 'block';
            }
            
            UIState.currentView = 'call';
            
            this.startCallTimer();
        },
        
        handleCallStarted: function(callData) {
            if (elements.callStatusText) {
                elements.callStatusText.textContent = 'Starting...';
            }
        },
        
        handleCallConnected: function(callData) {
            if (elements.callStatusText) {
                elements.callStatusText.textContent = 'In call';
            }
        },
        
        handleCallEnded: function(callData) {
            if (elements.callContainer) {
                elements.callContainer.classList.remove('active');
            }
            if (elements.sidebar) {
                elements.sidebar.style.display = 'flex';
            }
            
            if (UIState.callDurationInterval) {
                clearInterval(UIState.callDurationInterval);
                UIState.callDurationInterval = null;
            }
            
            if (elements.videoGrid) {
                elements.videoGrid.innerHTML = '';
                if (elements.offlineCallPlaceholder) {
                    elements.offlineCallPlaceholder.style.display = 'flex';
                }
            }
            
            if (elements.focusModeBtn) {
                elements.focusModeBtn.style.display = 'none';
            }
            
            if (UIState.currentFocusMode) {
                UIEventHandlers.disableFocusMode();
            }
            
            UIState.activeCallId = null;
            UIState.callParticipants = [];
            UIState.callStartTime = null;
            UIState.callType = null;
            UIState.localStream = null;
            UIState.remoteStreams.clear();
            
            UIState.currentView = 'sidebar';
            
            setTimeout(() => {
                UIEventHandlers.showPrivateNotesModal();
            }, 500);
        },
        
        handleRemoteStreamAdded: function(payload) {
            if (payload.stream) {
                UIState.remoteStreams.set(payload.stream.id, payload.stream);
                this.addRemoteVideo(payload.stream.id, payload.stream);
            }
        },
        
        handleRemoteStreamRemoved: function(payload) {
            if (payload.streamId) {
                UIState.remoteStreams.delete(payload.streamId);
                const videoEl = document.querySelector(`.video-container[data-stream-id="${payload.streamId}"]`);
                if (videoEl) videoEl.remove();
            }
        },
        
        handleLogout: function() {
            if (DEBUG) {
                logOnce('info', 'Logout triggered');
            }
            
            window.__CHILD_SESSION__.token = null;
            window.__CHILD_SESSION__.userId = null;
            window.__CHILD_SESSION__.expires = null;
            sessionReady = false;
            parentReady = false;
            handshakeComplete = false;
            _sessionInvalid = true;
            
            const protectedButtons = [
                elements.newCallBtn,
                elements.quickVoiceBtn,
                elements.quickVideoBtn,
                elements.quickGroupBtn
            ];
            
            protectedButtons.forEach(btn => {
                if (btn) {
                    btn.disabled = true;
                }
            });
            
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
            
            showNotification('Logged out', 'info');
        },
        
        // Handle auth errors
        handleAuthError: function() {
            if (DEBUG) {
                logOnce('warn', 'Authentication error received');
            }
            
            window.__CHILD_SESSION__.token = null;
            window.__CHILD_SESSION__.userId = null;
            window.__CHILD_SESSION__.expires = null;
            sessionReady = false;
            _sessionInvalid = true;
            
            showNotification('Session expired - please log in again', 'error');
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
        },
        
        startCallTimer: function() {
            if (!UIState.callStartTime) return;
            
            if (UIState.callDurationInterval) {
                clearInterval(UIState.callDurationInterval);
            }
            
            UIState.callDurationInterval = setInterval(() => {
                if (!UIState.callStartTime || !elements.callDuration) return;
                
                const elapsed = Math.floor((Date.now() - UIState.callStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                elements.callDuration.textContent = `${minutes}:${seconds}`;
            }, 1000);
        },
        
        setupParentMessageHandler: function() {
            const handler = (event) => {
                if (!this.validateParentMessage(event)) return;
                
                const data = event.data;
                
                switch (data.type) {
                    case 'SESSION_UPDATE':
                        this.handleSessionUpdate(data.payload || data);
                        break;
                    case 'TOKEN_UPDATE':
                        this.handleTokenUpdate(data.payload || data);
                        break;
                    case 'LOGOUT':
                        UIEventHandlers.handleLogout();
                        break;
                    case 'CONTACTS_UPDATE':
                        this.handleContactsUpdate(data.payload || data);
                        break;
                    case 'CALL_HISTORY_UPDATE':
                        this.handleCallHistoryUpdate(data.payload || data);
                        break;
                    case 'PAGE_ACTIVATED':
                        if (DEBUG) {
                            logOnce('info', 'Parent page activated');
                        }
                        break;
                    case 'NAVIGATE':
                        if (DEBUG) {
                            logOnce('info', 'Parent navigation:', data.payload);
                        }
                        break;
                    case 'NEW_MESSAGE':
                        if (data.payload && data.payload.message) {
                            this.addChatMessage(data.payload.sender, data.payload.message, data.payload.timestamp);
                        }
                        break;
                    case 'PARENT_READY':
                        parentReady = true;
                        if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                            RenderingPipeline.updateSyncIndicator();
                        }
                        attemptPendingCall();
                        break;
                    case 'MODULE_REGISTERED':
                        handshakeComplete = true;
                        if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                            RenderingPipeline.updateSyncIndicator();
                        }
                        break;
                    case 'SESSION_SYNC':
                        sessionReady = true;
                        _sessionInvalid = false;
                        this.handleSessionUpdate(data.payload || data);
                        if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                            RenderingPipeline.updateSyncIndicator();
                        }
                        attemptPendingCall();
                        break;
                    case 'AUTH_ERROR':
                    case 'UNAUTHORIZED':
                        this.handleAuthError();
                        break;
                    case 'OPEN_CALL_WITH_USER':
                    case 'START_CALL':
                    case 'CALL_USER':
                        handleOpenCallWithUser({ detail: data.payload || data });
                        break;
                }
            };
            
            window.addEventListener('message', handler);
            UIState.cachedElements.set('parentMessageHandler', handler);
        },
        
        validateParentMessage: function(event) {
            if (!event || !event.data) return false;
            
            // Check origin - relaxed during init
            if (coreLifecycleState !== 'ACTIVE') {
                return true;
            }
            
            if (event.origin !== window.location.origin && 
                !event.origin.includes('localhost') && 
                !event.origin.includes('127.0.0.1')) {
                return false;
            }
            
            const data = event.data;
            
            // Validate required fields
            if (!data.type || typeof data.type !== 'string') {
                return false;
            }
            
            // Validate source is parent
            if (data.source && data.source !== 'parent') {
                return false;
            }
            
            // Check timestamp if present
            if (data.timestamp && (data.timestamp < Date.now() - 300000 || data.timestamp > Date.now() + 60000)) {
                return false;
            }
            
            return true;
        },
        
        handleSessionUpdate: function(data) {
            if (DEBUG) {
                logOnce('info', 'Received session update');
            }
            
            if (data.token) {
                window.__CHILD_SESSION__.token = data.token;
                _sessionInvalid = false;
            }
            if (data.userId) {
                window.__CHILD_SESSION__.userId = data.userId;
            }
            if (data.expiry) {
                window.__CHILD_SESSION__.expires = data.expiry;
            }
            
            sessionReady = true;
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
        },
        
        handleTokenUpdate: function(data) {
            if (!data || !data.token) return;
            
            window.__CHILD_SESSION__.token = data.token;
            if (data.expiry) {
                window.__CHILD_SESSION__.expires = data.expiry;
            }
            sessionReady = true;
            _sessionInvalid = false;
            
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
        },
        
        handleContactsUpdate: function(data) {
            if (!data || !data.contacts || !Array.isArray(data.contacts)) return;
            
            if (elements.contactsList) {
                RenderingPipeline.renderContactsList(data.contacts);
            }
        },
        
        handleCallHistoryUpdate: function(data) {
            // Handle call history update if needed
        },
        
        handleDegradedMode: function() {
            if (DEBUG) {
                logOnce('info', 'Handling degraded mode');
            }
            
            fallbackModeActive = true;
            
            document.querySelectorAll('button, input, select').forEach(el => {
                if (!el.classList.contains('critical-control') && el.id !== 'endCallBtn' && el.id !== 'muteBtn') {
                    el.disabled = true;
                }
            });
            
            if (elements.fallbackBanner) {
                elements.fallbackBanner.style.display = 'block';
                elements.fallbackBanner.innerHTML = `
                    <div class="fallback-banner-content">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Limited connectivity - Some features may be unavailable</span>
                        <button class="fallback-banner-retry" onclick="window.location.reload()">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                    </div>
                `;
            }
            
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
        },
        
        observeAppState: function() {
            if (!window.AppState) return;
            
            const handler = {
                set: (target, property, value) => {
                    target[property] = value;
                    
                    switch (property) {
                        case 'isAuthenticated':
                            this.handleAuthChange(value);
                            break;
                        case 'isOnline':
                            this.handleConnectivityChange(value);
                            break;
                        case 'isInCall':
                            this.handleCallStateChange(value);
                            break;
                        case 'contacts':
                            if (Array.isArray(value)) {
                                RenderingPipeline.renderContactsList(value);
                            }
                            break;
                    }
                    
                    return true;
                }
            };
            
            try {
                window.AppState = new Proxy(window.AppState, handler);
            } catch (error) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to observe AppState', error);
                }
            }
        },
        
        handleAuthChange: function(isAuthenticated) {
            if (DEBUG) {
                logOnce('info', `Authentication changed: ${isAuthenticated}`);
            }
            
            const protectedButtons = [
                elements.newCallBtn,
                elements.quickVoiceBtn,
                elements.quickVideoBtn,
                elements.quickGroupBtn
            ];
            
            protectedButtons.forEach(btn => {
                if (btn) {
                    btn.disabled = !isAuthenticated || fallbackModeActive;
                }
            });
            
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
        },
        
        handleConnectivityChange: function(isOnline) {
            if (DEBUG) {
                logOnce('info', `Connectivity changed: ${isOnline ? 'online' : 'offline'}`);
            }
        },
        
        handleCallStateChange: function(isInCall) {
            if (isInCall && elements.callDuration) {
                elements.callDuration.textContent = '00:00';
            }
        },
        
        cleanup: function() {
            this._subscriptions.forEach(sub => {
                if (sub.unsubscribe && typeof sub.unsubscribe === 'function') {
                    try { sub.unsubscribe(); } catch (e) {}
                }
            });
            this._subscriptions.clear();
            this._initialized = false;
            
            const handler = UIState.cachedElements.get('parentMessageHandler');
            if (handler) {
                window.removeEventListener('message', handler);
                UIState.cachedElements.delete('parentMessageHandler');
            }
        }
    };

    // ==================== RESPONSIVE ENGINE ====================
    const ResponsiveEngine = {
        _currentBreakpoint: 'desktop',
        _orientation: 'landscape',
        
        initialize: function() {
            this.detectBreakpoint();
            this.detectOrientation();
            this.setupMediaQueryListeners();
            this.setupInputDetection();
            this.applyResponsiveLayout();
            
            window.addEventListener('resize', this.debouncedResize.bind(this));
            if (DEBUG) {
                logOnce('info', 'Responsive engine initialized', { 
                    breakpoint: this._currentBreakpoint,
                    orientation: this._orientation
                });
            }
        },
        
        detectBreakpoint: function() {
            const width = window.innerWidth;
            
            if (width <= UIState.breakpoints.mobile) {
                this._currentBreakpoint = 'mobile';
            } else if (width <= UIState.breakpoints.tablet) {
                this._currentBreakpoint = 'tablet';
            } else if (width <= UIState.breakpoints.desktop) {
                this._currentBreakpoint = 'desktop';
            } else {
                this._currentBreakpoint = 'wide';
            }
            
            return this._currentBreakpoint;
        },
        
        detectOrientation: function() {
            this._orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
            return this._orientation;
        },
        
        setupMediaQueryListeners: function() {
            const mobileQuery = window.matchMedia(`(max-width: ${UIState.breakpoints.mobile}px)`);
            mobileQuery.addEventListener('change', this.handleBreakpointChange.bind(this));
            
            const tabletQuery = window.matchMedia(`(min-width: ${UIState.breakpoints.mobile + 1}px) and (max-width: ${UIState.breakpoints.tablet}px)`);
            tabletQuery.addEventListener('change', this.handleBreakpointChange.bind(this));
            
            const desktopQuery = window.matchMedia(`(min-width: ${UIState.breakpoints.tablet + 1}px) and (max-width: ${UIState.breakpoints.desktop}px)`);
            desktopQuery.addEventListener('change', this.handleBreakpointChange.bind(this));
            
            const wideQuery = window.matchMedia(`(min-width: ${UIState.breakpoints.desktop + 1}px)`);
            wideQuery.addEventListener('change', this.handleBreakpointChange.bind(this));
            
            const orientationQuery = window.matchMedia('(orientation: portrait)');
            orientationQuery.addEventListener('change', this.handleOrientationChange.bind(this));
        },
        
        setupInputDetection: function() {
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            UIState.inputMode = isTouchDevice ? 'touch' : 'mouse';
            
            if (isTouchDevice) {
                document.body.classList.add('touch-device');
            }
            
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    UIState.inputMode = 'keyboard';
                    document.body.classList.add('keyboard-navigation');
                }
            });
            
            document.addEventListener('mousedown', () => {
                UIState.inputMode = 'mouse';
                document.body.classList.remove('keyboard-navigation');
            });
            
            document.addEventListener('touchstart', () => {
                UIState.inputMode = 'touch';
                document.body.classList.add('touch-device');
            });
        },
        
        handleBreakpointChange: function() {
            const oldBreakpoint = this._currentBreakpoint;
            this.detectBreakpoint();
            
            if (oldBreakpoint !== this._currentBreakpoint) {
                if (DEBUG) {
                    logOnce('info', `Breakpoint changed: ${oldBreakpoint} → ${this._currentBreakpoint}`);
                }
                this.applyResponsiveLayout();
            }
        },
        
        handleOrientationChange: function() {
            const oldOrientation = this._orientation;
            this.detectOrientation();
            
            if (oldOrientation !== this._orientation) {
                if (DEBUG) {
                    logOnce('info', `Orientation changed: ${oldOrientation} → ${this._orientation}`);
                }
                this.applyResponsiveLayout();
            }
        },
        
        debouncedResize: function() {
            setTimeout(() => {
                this.handleBreakpointChange();
                this.handleOrientationChange();
            }, 150);
        },
        
        applyResponsiveLayout: function() {
            document.body.dataset.breakpoint = this._currentBreakpoint;
            document.body.dataset.orientation = this._orientation;
            document.body.dataset.inputMode = UIState.inputMode;
            
            switch (this._currentBreakpoint) {
                case 'mobile':
                    this.applyMobileLayout();
                    break;
                case 'tablet':
                    this.applyTabletLayout();
                    break;
                case 'desktop':
                case 'wide':
                    this.applyDesktopLayout();
                    break;
            }
        },
        
        applyMobileLayout: function() {
            document.querySelectorAll('.desktop-only').forEach(el => {
                el.style.display = 'none';
            });
            
            document.querySelectorAll('.mobile-only').forEach(el => {
                el.style.display = 'block';
            });
            
            if (elements.sidebar) {
                elements.sidebar.classList.add('sidebar-mobile');
            }
            
            if (elements.videoGrid) {
                elements.videoGrid.style.gridTemplateColumns = '1fr';
            }
            
            document.querySelectorAll('.modal, .feature-panel').forEach(el => {
                el.style.width = '100%';
                el.style.maxWidth = '100%';
                el.style.height = '100%';
                el.style.maxHeight = '100%';
                el.style.borderRadius = '0';
            });
        },
        
        applyTabletLayout: function() {
            document.querySelectorAll('.desktop-only, .mobile-only').forEach(el => {
                el.style.display = '';
            });
            
            if (elements.sidebar) {
                elements.sidebar.classList.remove('sidebar-mobile');
            }
            
            if (elements.videoGrid) {
                elements.videoGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            }
            
            document.querySelectorAll('.modal, .feature-panel').forEach(el => {
                el.style.width = '';
                el.style.maxWidth = '';
                el.style.height = '';
                el.style.maxHeight = '';
                el.style.borderRadius = '';
            });
        },
        
        applyDesktopLayout: function() {
            document.querySelectorAll('.desktop-only, .mobile-only').forEach(el => {
                el.style.display = '';
            });
            
            if (elements.sidebar) {
                elements.sidebar.classList.remove('sidebar-mobile');
            }
            
            if (elements.videoGrid) {
                const videoCount = elements.videoGrid.querySelectorAll('.video-container').length;
                if (videoCount <= 2) {
                    elements.videoGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
                } else {
                    elements.videoGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
                }
            }
        },
        
        isMobile: function() {
            return this._currentBreakpoint === 'mobile';
        },
        
        isTablet: function() {
            return this._currentBreakpoint === 'tablet';
        },
        
        isDesktop: function() {
            return this._currentBreakpoint === 'desktop' || this._currentBreakpoint === 'wide';
        }
    };

    // ==================== EVENT SYSTEM ====================
    const EventSystem = {
        _listeners: new Map(),
        _debounced: new Map(),
        _throttled: new Map(),
        
        initialize: function() {
            this.setupGlobalListeners();
            this.setupUIEventListeners();
            if (DEBUG) {
                logOnce('info', 'Event system initialized');
            }
        },
        
        setupGlobalListeners: function() {
            this.addListener(window, 'online', () => {
                if (window.AppState) window.AppState.isOnline = true;
            });
            
            this.addListener(window, 'offline', () => {
                if (window.AppState) window.AppState.isOnline = false;
            });
            
            this.addListener(window, 'beforeunload', () => {
                this.cleanup();
            });
            
            this.addListener(document, 'visibilitychange', () => {
                // Handle visibility change if needed
            });
        },
        
        setupUIEventListeners: function() {
            if (elements.menuDotsBtn) {
                this.addListener(elements.menuDotsBtn, 'click', UIEventHandlers.toggleMenuDots);
            }
            
            if (elements.menuParticipants) {
                this.addListener(elements.menuParticipants, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openParticipantsPanel();
                });
            }
            
            if (elements.menuChat) {
                this.addListener(elements.menuChat, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openChatPanel();
                });
            }
            
            if (elements.menuWhiteboard) {
                this.addListener(elements.menuWhiteboard, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openWhiteboardPanel();
                });
            }
            
            if (elements.menuNotes) {
                this.addListener(elements.menuNotes, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openNotesPanel();
                });
            }
            
            if (elements.menuPolls) {
                this.addListener(elements.menuPolls, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openPollsPanel();
                });
            }
            
            if (elements.menuRelationship) {
                this.addListener(elements.menuRelationship, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openRelationshipPanel();
                });
            }
            
            if (elements.newCallBtn) {
                this.addListener(elements.newCallBtn, 'click', UIEventHandlers.openNewCallModal);
            }
            
            if (elements.closeNewCallModal) {
                this.addListener(elements.closeNewCallModal, 'click', UIEventHandlers.closeNewCallModal);
            }
            
            if (elements.quickVoiceBtn) {
                this.addListener(elements.quickVoiceBtn, 'click', UIEventHandlers.openNewCallModal);
            }
            
            if (elements.quickVideoBtn) {
                this.addListener(elements.quickVideoBtn, 'click', UIEventHandlers.openNewCallModal);
            }
            
            if (elements.quickGroupBtn) {
                this.addListener(elements.quickGroupBtn, 'click', UIEventHandlers.openNewCallModal);
            }
            
            if (elements.startVoiceCallBtn) {
                this.addListener(elements.startVoiceCallBtn, 'click', UIEventHandlers.startVoiceCall);
            }
            
            if (elements.startVideoCallBtn) {
                this.addListener(elements.startVideoCallBtn, 'click', UIEventHandlers.startVideoCall);
            }
            
            if (elements.startGroupCallBtn) {
                this.addListener(elements.startGroupCallBtn, 'click', UIEventHandlers.startGroupCall);
            }
            
            if (elements.generateVoiceLinkBtn) {
                this.addListener(elements.generateVoiceLinkBtn, 'click', UIEventHandlers.generateVoiceCallLink);
            }
            
            if (elements.generateVideoLinkBtn) {
                this.addListener(elements.generateVideoLinkBtn, 'click', UIEventHandlers.generateVideoCallLink);
            }
            
            if (elements.copyLinkBtn) {
                this.addListener(elements.copyLinkBtn, 'click', UIEventHandlers.copyCallLink);
            }
            
            if (elements.shareLinkBtn) {
                this.addListener(elements.shareLinkBtn, 'click', UIEventHandlers.shareCallLink);
            }
            
            if (elements.instantGroupOption) {
                this.addListener(elements.instantGroupOption, 'click', UIEventHandlers.selectGroupOption);
            }
            
            if (elements.scheduledGroupOption) {
                this.addListener(elements.scheduledGroupOption, 'click', UIEventHandlers.selectGroupOption);
            }
            
            if (elements.muteBtn) {
                this.addListener(elements.muteBtn, 'click', UIEventHandlers.toggleMute);
            }
            
            if (elements.videoBtn) {
                this.addListener(elements.videoBtn, 'click', UIEventHandlers.toggleVideo);
            }
            
            if (elements.screenShareBtn) {
                this.addListener(elements.screenShareBtn, 'click', UIEventHandlers.toggleScreenShare);
            }
            
            if (elements.speakerBtn) {
                this.addListener(elements.speakerBtn, 'click', UIEventHandlers.toggleSpeaker);
            }
            
            if (elements.moodBtn) {
                this.addListener(elements.moodBtn, 'click', UIEventHandlers.openMoodSelectionModal);
            }
            
            if (elements.intentionBtn) {
                this.addListener(elements.intentionBtn, 'click', UIEventHandlers.openIntentionSelectionModal);
            }
            
            if (elements.endCallBtn) {
                this.addListener(elements.endCallBtn, 'click', UIEventHandlers.endCall);
            }
            
            if (elements.focusModeBtn) {
                this.addListener(elements.focusModeBtn, 'click', UIEventHandlers.toggleFocusMode);
            }
            
            if (elements.declineCallBtn) {
                this.addListener(elements.declineCallBtn, 'click', UIEventHandlers.declineIncomingCall);
            }
            
            if (elements.acceptCallBtn) {
                this.addListener(elements.acceptCallBtn, 'click', UIEventHandlers.acceptIncomingCall);
            }
            
            if (elements.acceptVideoCallBtn) {
                this.addListener(elements.acceptVideoCallBtn, 'click', UIEventHandlers.acceptIncomingCallAsVideo);
            }
            
            if (elements.cancelMoodBtn) {
                this.addListener(elements.cancelMoodBtn, 'click', UIEventHandlers.closeMoodSelectionModal);
            }
            
            if (elements.setMoodBtn) {
                this.addListener(elements.setMoodBtn, 'click', UIEventHandlers.setMood);
            }
            
            if (elements.cancelIntentionBtn) {
                this.addListener(elements.cancelIntentionBtn, 'click', UIEventHandlers.closeIntentionSelectionModal);
            }
            
            if (elements.setIntentionBtn) {
                this.addListener(elements.setIntentionBtn, 'click', UIEventHandlers.setIntention);
            }
            
            document.querySelectorAll('.mood-option').forEach(option => {
                this.addListener(option, 'click', UIEventHandlers.selectMoodOption);
            });
            
            document.querySelectorAll('.intention-option').forEach(option => {
                this.addListener(option, 'click', UIEventHandlers.selectIntentionOption);
            });
            
            if (elements.skipNotesBtn) {
                this.addListener(elements.skipNotesBtn, 'click', UIEventHandlers.skipPrivateNotes);
            }
            
            if (elements.saveNotesBtn) {
                this.addListener(elements.saveNotesBtn, 'click', UIEventHandlers.savePrivateNotes);
            }
            
            if (elements.summaryDoneBtn) {
                this.addListener(elements.summaryDoneBtn, 'click', UIEventHandlers.closeCallSummary);
            }
            
            if (elements.settingsToggle) {
                this.addListener(elements.settingsToggle, 'click', UIEventHandlers.toggleSettingsPanel);
            }
            
            if (elements.resetSettingsBtn) {
                this.addListener(elements.resetSettingsBtn, 'click', () => {});
            }
            
            document.querySelectorAll('.category-btn').forEach(btn => {
                this.addListener(btn, 'click', function() {
                    const category = this.dataset.category;
                    UIEventHandlers.switchCallCategory(category);
                });
            });
            
            document.querySelectorAll('.new-call-tab').forEach(tab => {
                this.addListener(tab, 'click', function() {
                    const tabId = this.dataset.tab;
                    UIEventHandlers.switchNewCallTab(tabId);
                });
            });
            
            if (elements.pipCloseBtn) {
                this.addListener(elements.pipCloseBtn, 'click', () => {});
            }
            
            if (elements.contactSearch) {
                this.addListener(elements.contactSearch, 'input', 
                    this.debounce('contactSearch', UIEventHandlers.searchContacts, 300)
                );
            }
            
            if (elements.groupContactSearch) {
                this.addListener(elements.groupContactSearch, 'input',
                    this.debounce('groupContactSearch', UIEventHandlers.searchGroupContacts, 300)
                );
            }
            
            if (elements.mpesaOption) {
                this.addListener(elements.mpesaOption, 'click', UIEventHandlers.selectPaymentOption);
            }
            
            if (elements.cancelPaymentBtn) {
                this.addListener(elements.cancelPaymentBtn, 'click', UIEventHandlers.closePaymentModal);
            }
            
            if (elements.processPaymentBtn) {
                this.addListener(elements.processPaymentBtn, 'click', UIEventHandlers.processPayment);
            }
            
            if (elements.cancelUpgradeBtn) {
                this.addListener(elements.cancelUpgradeBtn, 'click', UIEventHandlers.closePremiumLimitModal);
            }
            
            if (elements.upgradeNowBtn) {
                this.addListener(elements.upgradeNowBtn, 'click', UIEventHandlers.openPaymentModal);
            }
            
            this.addListener(document, 'click', (e) => {
                if (elements.menuDotsBtn && elements.menuDotsDropdown) {
                    if (!elements.menuDotsBtn.contains(e.target) && 
                        !elements.menuDotsDropdown.contains(e.target)) {
                        UIEventHandlers.closeMenuDots();
                    }
                }
            });
        },
        
        addListener: function(element, eventType, handler, options = {}) {
            if (!element || typeof handler !== 'function') return null;
            
            const key = `${eventType}_${handler.toString()}`;
            
            element.addEventListener(eventType, handler, options);
            
            if (!this._listeners.has(key)) {
                this._listeners.set(key, { element, eventType, handler, options });
            }
            
            return handler;
        },
        
        removeListener: function(element, eventType, handler) {
            if (!element) return;
            
            element.removeEventListener(eventType, handler);
            
            const key = `${eventType}_${handler.toString()}`;
            this._listeners.delete(key);
        },
        
        debounce: function(id, fn, delay) {
            if (this._debounced.has(id)) {
                return this._debounced.get(id);
            }
            
            let timeout;
            const debouncedFn = function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => fn.apply(this, args), delay);
            };
            
            this._debounced.set(id, debouncedFn);
            return debouncedFn;
        },
        
        throttle: function(id, fn, limit) {
            if (this._throttled.has(id)) {
                return this._throttled.get(id);
            }
            
            let inThrottle;
            const throttledFn = function(...args) {
                if (!inThrottle) {
                    fn.apply(this, args);
                    inThrottle = setTimeout(() => inThrottle = false, limit);
                }
            };
            
            this._throttled.set(id, throttledFn);
            return throttledFn;
        },
        
        trigger: function(element, eventType, detail = {}) {
            if (!element) return false;
            
            const event = new CustomEvent(eventType, { detail, bubbles: true, cancelable: true });
            return element.dispatchEvent(event);
        },
        
        cleanup: function() {
            this._listeners.forEach(({ element, eventType, handler, options }) => {
                try {
                    if (element) {
                        element.removeEventListener(eventType, handler, options);
                    }
                } catch (e) {}
            });
            
            this._listeners.clear();
            this._debounced.clear();
            this._throttled.clear();
            
            if (DEBUG) {
                logOnce('info', 'Event system cleaned up');
            }
        }
    };

    // ==================== UI EVENT HANDLERS ====================
    const UIEventHandlers = {
        toggleMenuDots: function(e) {
            e?.stopPropagation();
            if (elements.menuDotsDropdown) {
                elements.menuDotsDropdown.classList.toggle('active');
                UILogger.interaction('toggleMenuDots', 'menuDotsBtn');
            }
        },
        
        closeMenuDots: function() {
            if (elements.menuDotsDropdown) {
                elements.menuDotsDropdown.classList.remove('active');
            }
        },
        
        openNewCallModal: function() {
            if (!canPerformAction('openNewCallModal')) return;
            
            if (elements.newCallModal) {
                elements.newCallModal.classList.add('active');
                UIState.activeModals.add('newCallModal');
                
                // Reset modal title if previously set by pending call
                const modalTitle = elements.newCallModal.querySelector('.modal-title');
                if (modalTitle && UIState.pendingCallUser) {
                    // If we have a pending call, keep the custom title
                    modalTitle.innerHTML = `<i class="fas fa-phone-alt"></i> Call ${SecuritySanitizer.sanitizeString(UIState.pendingCallUser.name)}`;
                } else if (modalTitle) {
                    modalTitle.innerHTML = '<i class="fas fa-phone-alt"></i> New Call';
                }
                
                if (window.AppState?.contacts?.length > 0) {
                    RenderingPipeline.renderContactsList(window.AppState.contacts);
                }
                
                UIEventHandlers.switchNewCallTab('contacts');
                UILogger.interaction('openNewCallModal', 'newCallModal');
            }
        },
        
        closeNewCallModal: function() {
            if (elements.newCallModal) {
                elements.newCallModal.classList.remove('active');
                UIState.activeModals.delete('newCallModal');
                
                // Reset modal title
                const modalTitle = elements.newCallModal.querySelector('.modal-title');
                if (modalTitle) {
                    modalTitle.innerHTML = '<i class="fas fa-phone-alt"></i> New Call';
                }
                
                document.querySelectorAll('.contact-checkbox:checked, .group-contact:checked').forEach(el => {
                    el.checked = false;
                });
                
                document.querySelectorAll('.contact-item.selected').forEach(el => {
                    el.classList.remove('selected');
                });
                
                if (elements.contactSearch) elements.contactSearch.value = '';
                if (elements.groupContactSearch) elements.groupContactSearch.value = '';
                if (elements.instantGroupOption) elements.instantGroupOption.classList.remove('selected');
                if (elements.scheduledGroupOption) elements.scheduledGroupOption.classList.remove('selected');
                if (elements.startGroupCallBtn) elements.startGroupCallBtn.disabled = true;
            }
        },
        
        searchContacts: function() {
            const query = elements.contactSearch?.value.toLowerCase() || '';
            
            document.querySelectorAll('.contact-item').forEach(item => {
                const nameEl = item.querySelector('.call-name');
                if (nameEl) {
                    const name = nameEl.textContent.toLowerCase();
                    item.style.display = name.includes(query) ? 'flex' : 'none';
                }
            });
        },
        
        searchGroupContacts: function() {
            const query = elements.groupContactSearch?.value.toLowerCase() || '';
            
            document.querySelectorAll('.contact-item').forEach(item => {
                const nameEl = item.querySelector('.call-name');
                if (nameEl) {
                    const name = nameEl.textContent.toLowerCase();
                    item.style.display = name.includes(query) ? 'flex' : 'none';
                }
            });
        },
        
        selectGroupOption: function(e) {
            const option = e.currentTarget;
            
            if (option.id === 'instantGroupOption') {
                if (elements.scheduledGroupOption) elements.scheduledGroupOption.classList.remove('selected');
            } else {
                if (elements.instantGroupOption) elements.instantGroupOption.classList.remove('selected');
            }
            
            option.classList.add('selected');
            UIState.groupCallOption = option.id;
            
            if (elements.startGroupCallBtn) {
                elements.startGroupCallBtn.disabled = false;
            }
        },
        
        getSelectedContacts: function() {
            const selected = [];
            document.querySelectorAll('.contact-checkbox:checked').forEach(checkbox => {
                const contactId = checkbox.id.replace('contact-', '');
                const contact = window.AppState?.contacts?.find(c => c.id === contactId);
                if (contact) selected.push(contact);
            });
            return selected;
        },
        
        getSelectedGroupContacts: function() {
            const selected = [];
            document.querySelectorAll('.group-contact:checked').forEach(checkbox => {
                const contactId = checkbox.id.replace('group-contact-', '');
                const contact = window.AppState?.contacts?.find(c => c.id === contactId);
                if (contact) selected.push(contact);
            });
            return selected;
        },
        
        startVoiceCall: function() {
            this.startCallGeneric('voice');
        },
        
        startVideoCall: function() {
            this.startCallGeneric('video');
        },
        
        startCallGeneric: function(type) {
            if (!canPerformAction('startCall')) return;
            
            const selectedContacts = this.getSelectedContacts();
            
            if (selectedContacts.length === 0) {
                showNotification('Please select at least one contact', 'warning');
                return;
            }
            
            // Check for active call
            if (coreInstance && coreInstance.isInCall && coreInstance.isInCall()) {
                showNotification('You are already in a call', 'warning');
                return;
            }
            
            if (coreInstance && coreInstance.initCall) {
                showNotification(`Starting ${type} call...`, 'info');
                
                coreInstance.initCall(type, selectedContacts)
                    .then(result => {
                        if (result.success) {
                            showNotification(`${type} call started`, 'success');
                            // Clear pending call if this was from auto-initiation
                            clearPendingCall();
                        } else {
                            showNotification(result.error || 'Failed to start call', 'error');
                        }
                    })
                    .catch(error => {
                        showNotification('Failed to start call', 'error');
                        UILogger.error('Call failed', error);
                    });
            } else {
                showNotification('Call system not ready', 'error');
            }
            
            UIEventHandlers.closeNewCallModal();
        },
        
        startGroupCall: function() {
            if (!canPerformAction('startGroupCall')) return;
            
            if (!UIState.groupCallOption) {
                showNotification('Please select a group call option', 'warning');
                return;
            }
            
            const selectedContacts = this.getSelectedGroupContacts();
            
            if (selectedContacts.length === 0) {
                showNotification('Please select at least one contact', 'warning');
                return;
            }
            
            // Check for active call
            if (coreInstance && coreInstance.isInCall && coreInstance.isInCall()) {
                showNotification('You are already in a call', 'warning');
                return;
            }
            
            if (coreInstance && coreInstance.startGroupCall) {
                showNotification('Starting group call...', 'info');
                
                coreInstance.startGroupCall(selectedContacts, 'voice')
                    .then(result => {
                        if (result.success) {
                            showNotification('Group call started', 'success');
                        } else {
                            showNotification(result.error || 'Failed to start group call', 'error');
                        }
                    })
                    .catch(error => {
                        showNotification('Failed to start group call', 'error');
                        UILogger.error('Group call failed', error);
                    });
            } else {
                showNotification('Group calls not available', 'warning');
            }
            
            UIEventHandlers.closeNewCallModal();
        },
        
        showCallUI: function() {
            if (elements.sidebar) elements.sidebar.style.display = 'none';
            if (elements.callContainer) elements.callContainer.classList.add('active');
            
            const participantNames = UIState.callParticipants?.map(p => p.name).join(', ') || 'Call';
            if (elements.callWithName) elements.callWithName.textContent = SecuritySanitizer.sanitizeString(participantNames);
            if (elements.callStatusText) elements.callStatusText.textContent = 'Connecting...';
            
            const icon = UIState.callType === 'video' ? 'fa-video' : 'fa-phone';
            if (elements.callTypeIcon) elements.callTypeIcon.innerHTML = `<i class="fas ${icon}"></i>`;
            
            if (elements.focusModeBtn) elements.focusModeBtn.style.display = 'block';
            
            UIState.currentView = 'call';
        },
        
        startCallTimer: function() {
            if (!UIState.callStartTime) return;
            
            UIState.callStartTime = Date.now();
            
            if (UIState.callDurationInterval) {
                clearInterval(UIState.callDurationInterval);
            }
            
            UIState.callDurationInterval = setInterval(() => {
                if (!UIState.callStartTime || !elements.callDuration) return;
                
                const elapsed = Math.floor((Date.now() - UIState.callStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                elements.callDuration.textContent = `${minutes}:${seconds}`;
            }, 1000);
        },
        
        toggleMute: function() {
            if (!canPerformAction('toggleMute')) return;
            
            if (coreInstance && coreInstance.toggleMic) {
                coreInstance.toggleMic();
            } else if (UIState.localStream) {
                const audioTracks = UIState.localStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    UIState.isMuted = !UIState.isMuted;
                    audioTracks.forEach(track => {
                        track.enabled = !UIState.isMuted;
                    });
                    
                    const icon = elements.muteBtn.querySelector('i');
                    if (icon) {
                        icon.className = UIState.isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                    }
                    
                    showNotification(UIState.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
                }
            }
        },
        
        toggleVideo: function() {
            if (!canPerformAction('toggleVideo')) return;
            
            if (coreInstance && coreInstance.toggleCamera) {
                coreInstance.toggleCamera();
            } else if (UIState.localStream) {
                const videoTracks = UIState.localStream.getVideoTracks();
                if (videoTracks.length > 0) {
                    UIState.isVideoOff = !UIState.isVideoOff;
                    videoTracks.forEach(track => {
                        track.enabled = !UIState.isVideoOff;
                    });
                    
                    const icon = elements.videoBtn.querySelector('i');
                    if (icon) {
                        icon.className = UIState.isVideoOff ? 'fas fa-video-slash' : 'fas fa-video';
                    }
                    
                    showNotification(UIState.isVideoOff ? 'Camera turned off' : 'Camera turned on', 'info');
                }
            }
        },
        
        toggleScreenShare: function() {
            if (!canPerformAction('toggleScreenShare')) return;
            
            if (UIState.isScreenSharing) {
                this.stopScreenShare();
            } else {
                this.startScreenShare();
            }
        },
        
        startScreenShare: function() {
            if (!navigator.mediaDevices?.getDisplayMedia) {
                showNotification('Screen sharing is not supported in your browser', 'error');
                return;
            }
            
            if (coreInstance && coreInstance.startScreenShare) {
                coreInstance.startScreenShare()
                    .then(result => {
                        if (result.success) {
                            UIState.isScreenSharing = true;
                            if (elements.screenShareBtn) {
                                elements.screenShareBtn.classList.add('active');
                            }
                            showNotification('Screen sharing started', 'success');
                        } else {
                            showNotification(result.error || 'Failed to start screen sharing', 'error');
                        }
                    })
                    .catch(error => {
                        UILogger.error('Error starting screen share', error);
                        showNotification('Failed to start screen sharing', 'error');
                    });
            } else {
                navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                    .then(stream => {
                        UIState.screenStream = stream;
                        UIState.isScreenSharing = true;
                        
                        if (elements.screenShareBtn) {
                            elements.screenShareBtn.classList.add('active');
                        }
                        
                        showNotification('Screen sharing started', 'success');
                    })
                    .catch(error => {
                        UILogger.error('Error starting screen share', error);
                        showNotification('Failed to start screen sharing', 'error');
                    });
            }
        },
        
        stopScreenShare: function() {
            if (coreInstance && coreInstance.stopScreenShare) {
                coreInstance.stopScreenShare();
            }
            
            if (UIState.screenStream) {
                UIState.screenStream.getTracks().forEach(track => track.stop());
                UIState.screenStream = null;
            }
            
            UIState.isScreenSharing = false;
            
            if (elements.screenShareBtn) {
                elements.screenShareBtn.classList.remove('active');
            }
            
            showNotification('Screen sharing stopped', 'info');
        },
        
        toggleSpeaker: function() {
            UIState.isSpeakerOn = !UIState.isSpeakerOn;
            
            const icon = elements.speakerBtn.querySelector('i');
            if (icon) {
                icon.className = UIState.isSpeakerOn ? 'fas fa-volume-up' : 'fas fa-headphones';
            }
            
            showNotification(`Switched to ${UIState.isSpeakerOn ? 'speaker' : 'headphones'}`, 'info');
        },
        
        endCall: function() {
            if (!UIState.activeCallId && !coreInstance?.isInCall?.()) {
                showNotification('No active call to end', 'info');
                return;
            }
            
            if (confirm('End the call?')) {
                if (coreInstance && coreInstance.endCall) {
                    coreInstance.endCall(UIState.activeCallId);
                }
                
                if (UIState.localStream) {
                    UIState.localStream.getTracks().forEach(track => track.stop());
                    UIState.localStream = null;
                }
                
                if (UIState.screenStream) {
                    UIState.screenStream.getTracks().forEach(track => track.stop());
                    UIState.screenStream = null;
                }
                
                if (UIState.callDurationInterval) {
                    clearInterval(UIState.callDurationInterval);
                    UIState.callDurationInterval = null;
                }
                
                UIState.activeCallId = null;
                UIState.callParticipants = [];
                UIState.callStartTime = null;
                
                if (elements.callContainer) elements.callContainer.classList.remove('active');
                if (elements.sidebar) elements.sidebar.style.display = 'flex';
                if (elements.focusModeBtn) elements.focusModeBtn.style.display = 'none';
                
                if (UIState.currentFocusMode) {
                    this.disableFocusMode();
                }
                
                if (elements.videoGrid) {
                    elements.videoGrid.innerHTML = '';
                    if (elements.offlineCallPlaceholder) {
                        elements.offlineCallPlaceholder.style.display = 'flex';
                    }
                }
                
                UIState.currentView = 'sidebar';
                
                setTimeout(() => {
                    this.showPrivateNotesModal();
                }, 500);
                
                showNotification('Call ended', 'info');
            }
        },
        
        openMoodSelectionModal: function() {
            if (elements.moodSelectionModal) {
                elements.moodSelectionModal.classList.add('active');
                UIState.activeModals.add('moodSelectionModal');
                
                document.querySelectorAll('.mood-option').forEach(option => {
                    option.classList.remove('selected');
                    if (option.dataset.mood === UIState.selectedMood) {
                        option.classList.add('selected');
                    }
                });
            }
        },
        
        closeMoodSelectionModal: function() {
            if (elements.moodSelectionModal) {
                elements.moodSelectionModal.classList.remove('active');
                UIState.activeModals.delete('moodSelectionModal');
            }
        },
        
        selectMoodOption: function(e) {
            document.querySelectorAll('.mood-option').forEach(opt => opt.classList.remove('selected'));
            e.currentTarget.classList.add('selected');
            UIState.selectedMood = e.currentTarget.dataset.mood;
        },
        
        setMood: function() {
            if (!canPerformAction('setMood')) return;
            
            const selectedOption = document.querySelector('.mood-option.selected');
            if (selectedOption) {
                const newMood = selectedOption.dataset.mood;
                UIState.selectedMood = newMood;
                
                // Send to core
                if (coreInstance && coreInstance.setMood) {
                    coreInstance.setMood(newMood);
                }
                
                UIEventHandlers.closeMoodSelectionModal();
                showNotification(`Mood set to ${newMood}`, 'success');
            }
        },
        
        openIntentionSelectionModal: function() {
            if (elements.intentionSelectionModal) {
                elements.intentionSelectionModal.classList.add('active');
                UIState.activeModals.add('intentionSelectionModal');
                
                document.querySelectorAll('.intention-option').forEach(option => {
                    option.classList.remove('selected');
                    if (option.dataset.intention === UIState.selectedIntention) {
                        option.classList.add('selected');
                    }
                });
            }
        },
        
        closeIntentionSelectionModal: function() {
            if (elements.intentionSelectionModal) {
                elements.intentionSelectionModal.classList.remove('active');
                UIState.activeModals.delete('intentionSelectionModal');
            }
        },
        
        selectIntentionOption: function(e) {
            document.querySelectorAll('.intention-option').forEach(opt => opt.classList.remove('selected'));
            e.currentTarget.classList.add('selected');
            UIState.selectedIntention = e.currentTarget.dataset.intention;
        },
        
        setIntention: function() {
            if (!canPerformAction('setIntention')) return;
            
            const selectedOption = document.querySelector('.intention-option.selected');
            if (selectedOption) {
                const newIntention = selectedOption.dataset.intention;
                UIState.selectedIntention = newIntention;
                
                // Send to core
                if (coreInstance && coreInstance.setIntention) {
                    coreInstance.setIntention(newIntention);
                }
                
                UIEventHandlers.closeIntentionSelectionModal();
                showNotification(`Intention set to ${newIntention}`, 'success');
            }
        },
        
        toggleFocusMode: function() {
            if (UIState.currentFocusMode) {
                this.disableFocusMode();
            } else {
                this.enableFocusMode();
            }
            
            if (coreInstance && coreInstance.toggleFocusMode) {
                coreInstance.toggleFocusMode();
            }
        },
        
        enableFocusMode: function() {
            UIState.currentFocusMode = true;
            if (elements.appContainer) elements.appContainer.classList.add('focus-mode');
            if (elements.focusModeBtn) {
                elements.focusModeBtn.classList.add('active');
            }
            showNotification('Focus mode enabled', 'info');
        },
        
        disableFocusMode: function() {
            UIState.currentFocusMode = false;
            if (elements.appContainer) elements.appContainer.classList.remove('focus-mode');
            if (elements.focusModeBtn) {
                elements.focusModeBtn.classList.remove('active');
            }
        },
        
        showPrivateNotesModal: function() {
            if (!elements.privateNotesModal || !UIState.callParticipants?.length) {
                this.showCallSummary();
                return;
            }
            
            const lastContact = UIState.callParticipants[0];
            
            if (lastContact) {
                if (elements.privateNotesTitle) {
                    elements.privateNotesTitle.textContent = `Notes about call with ${SecuritySanitizer.sanitizeString(lastContact.name)}`;
                }
                if (elements.privateNotesSubtitle) {
                    elements.privateNotesSubtitle.textContent = 'Add private notes about this call (only visible to you)';
                }
                
                // Get notes from memory, not localStorage
                const previousNotes = UIState.privateNotes[lastContact.id]?.notes || '';
                if (elements.privateNotesTextarea) {
                    elements.privateNotesTextarea.value = previousNotes;
                }
                
                elements.privateNotesModal.classList.add('active');
                UIState.activeModals.add('privateNotesModal');
            } else {
                this.showCallSummary();
            }
        },
        
        skipPrivateNotes: function() {
            if (elements.privateNotesModal) {
                elements.privateNotesModal.classList.remove('active');
                UIState.activeModals.delete('privateNotesModal');
            }
            this.showCallSummary();
        },
        
        savePrivateNotes: function() {
            if (!canPerformAction('saveNotes')) return;
            
            const notes = elements.privateNotesTextarea?.value.trim() || '';
            const lastContact = UIState.callParticipants?.[0];
            
            if (lastContact && notes) {
                // Store in memory only, not localStorage
                UIState.privateNotes[lastContact.id] = {
                    notes: notes,
                    timestamp: new Date().toISOString(),
                    callId: UIState.activeCallId
                };
                
                // Send to parent via core if available
                if (coreInstance && coreInstance.saveNotes) {
                    coreInstance.saveNotes({
                        contactId: lastContact.id,
                        notes: notes,
                        callId: UIState.activeCallId
                    });
                }
                
                showNotification('Notes saved', 'success');
            }
            
            if (elements.privateNotesModal) {
                elements.privateNotesModal.classList.remove('active');
                UIState.activeModals.delete('privateNotesModal');
            }
            this.showCallSummary();
        },
        
        savePrivateNotesToStorage: function(contactId, notes) {
            // Deprecated - use memory only
            UIState.privateNotes[contactId] = {
                notes: notes,
                timestamp: new Date().toISOString(),
                callId: UIState.activeCallId
            };
            
            // Don't use localStorage
            logOnce('warn', 'savePrivateNotesToStorage called - using memory only');
        },
        
        getPrivateNotes: function(contactId) {
            // Get from memory, not localStorage
            return UIState.privateNotes[contactId]?.notes || null;
        },
        
        showCallSummary: function() {
            if (!elements.callSummaryModal) return;
            
            const callDuration = UIState.callStartTime ? 
                Math.floor((Date.now() - UIState.callStartTime) / 1000) : 0;
            
            const minutes = Math.floor(callDuration / 60);
            const seconds = callDuration % 60;
            
            if (elements.summaryDuration) {
                elements.summaryDuration.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            if (elements.summaryTime) {
                elements.summaryTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            
            if (elements.summaryType) {
                elements.summaryType.textContent = UIState.callType === 'video' ? 'Video Call' : 'Voice Call';
            }
            
            if (elements.summaryMood) {
                elements.summaryMood.textContent = UIState.selectedMood.charAt(0).toUpperCase() + UIState.selectedMood.slice(1);
            }
            
            if (elements.summaryIntention) {
                const intentionMap = {
                    quick: 'Quick Chat',
                    important: 'Important Discussion',
                    emergency: 'Emergency',
                    checkin: 'Check-in',
                    work: 'Work/Business'
                };
                elements.summaryIntention.textContent = intentionMap[UIState.selectedIntention] || 'Quick Chat';
            }
            
            if (elements.summaryParticipants) {
                elements.summaryParticipants.textContent = (UIState.callParticipants?.length || 0) + 1;
            }
            
            elements.callSummaryModal.classList.add('active');
            UIState.activeModals.add('callSummaryModal');
        },
        
        closeCallSummary: function() {
            if (elements.callSummaryModal) {
                elements.callSummaryModal.classList.remove('active');
                UIState.activeModals.delete('callSummaryModal');
            }
        },
        
        declineIncomingCall: function() {
            if (elements.incomingCallModal.dataset.timer) {
                clearInterval(parseInt(elements.incomingCallModal.dataset.timer));
            }
            
            elements.incomingCallModal.classList.remove('active');
            UIState.activeModals.delete('incomingCallModal');
            
            if (coreInstance && coreInstance.declineCall) {
                coreInstance.declineCall();
            }
            
            showNotification('Call declined', 'info');
        },
        
        acceptIncomingCall: function() {
            this.acceptIncomingCallGeneric(false);
        },
        
        acceptIncomingCallAsVideo: function() {
            this.acceptIncomingCallGeneric(true);
        },
        
        acceptIncomingCallGeneric: function(asVideo) {
            if (!canPerformAction('answerCall')) return;
            
            // Check for active call
            if (coreInstance && coreInstance.isInCall && coreInstance.isInCall()) {
                showNotification('You are already in a call', 'warning');
                return;
            }
            
            if (elements.incomingCallModal.dataset.timer) {
                clearInterval(parseInt(elements.incomingCallModal.dataset.timer));
            }
            
            const callerName = elements.incomingCallName?.textContent || 'Caller';
            const isVideoCall = elements.incomingCallType?.textContent?.includes('Video') || false;
            const callType = asVideo ? 'video' : (isVideoCall ? 'video' : 'voice');
            
            elements.incomingCallModal.classList.remove('active');
            UIState.activeModals.delete('incomingCallModal');
            
            showNotification(`Accepting ${callType} call from ${callerName}...`, 'info');
            
            if (coreInstance && coreInstance.answerCall) {
                coreInstance.answerCall(callType);
            } else {
                showNotification('Call system not ready', 'error');
            }
        },
        
        generateVoiceCallLink: function() {
            this.generateCallLink('voice');
        },
        
        generateVideoCallLink: function() {
            this.generateCallLink('video');
        },
        
        generateCallLink: function(type) {
            if (!canPerformAction('generateCallLink')) return;
            
            const callId = 'call-' + Math.random().toString(36).substr(2, 9);
            const baseUrl = window.location.origin + window.location.pathname;
            const callUrl = `${baseUrl}?call=${callId}&type=${type}`;
            
            UIState.callLink = callUrl;
            
            if (elements.callLinkInput) {
                elements.callLinkInput.value = callUrl;
            }
            
            if (coreInstance && coreInstance.createCallLink) {
                coreInstance.createCallLink(type);
            }
            
            showNotification(`${type === 'voice' ? 'Voice' : 'Video'} call link generated`, 'success');
        },
        
        copyCallLink: function() {
            const link = elements.callLinkInput?.value || UIState.callLink;
            
            if (!link) {
                showNotification('Generate a call link first', 'warning');
                return;
            }
            
            navigator.clipboard.writeText(link)
                .then(() => showNotification('Call link copied to clipboard', 'success'))
                .catch(() => showNotification('Failed to copy link', 'error'));
        },
        
        shareCallLink: function() {
            const link = elements.callLinkInput?.value || UIState.callLink;
            
            if (!link) {
                showNotification('Generate a call link first', 'warning');
                return;
            }
            
            if (navigator.share) {
                navigator.share({
                    title: 'Join my call',
                    text: 'Join my call using this link',
                    url: link,
                })
                .then(() => showNotification('Call link shared', 'success'))
                .catch(err => {
                    UILogger.warn('Error sharing', err);
                    this.copyCallLink();
                });
            } else {
                this.copyCallLink();
            }
        },
        
        switchCallCategory: function(category) {
            UIState.currentCallCategory = category;
            
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.category === category) {
                    btn.classList.add('active');
                }
            });
            
            if (elements.allCallsSection) elements.allCallsSection.classList.remove('active');
            if (elements.missedCallsSection) elements.missedCallsSection.classList.remove('active');
            if (elements.groupCallsSection) elements.groupCallsSection.classList.remove('active');
            
            if (category === 'all' && elements.allCallsSection) {
                elements.allCallsSection.classList.add('active');
            } else if (category === 'missed' && elements.missedCallsSection) {
                elements.missedCallsSection.classList.add('active');
            } else if (category === 'group' && elements.groupCallsSection) {
                elements.groupCallsSection.classList.add('active');
            }
        },
        
        switchNewCallTab: function(tabId) {
            UIState.currentNewCallTab = tabId;
            
            document.querySelectorAll('.new-call-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.tab === tabId) {
                    tab.classList.add('active');
                }
            });
            
            document.querySelectorAll('.new-call-tab-content').forEach(content => {
                content.classList.remove('active');
                if (content.id === tabId + 'Tab') {
                    content.classList.add('active');
                }
            });
        },
        
        toggleSettingsPanel: function() {
            if (elements.settingsPanel) {
                elements.settingsPanel.classList.toggle('active');
                
                if (elements.settingsToggleIcon) {
                    elements.settingsToggleIcon.className = elements.settingsPanel.classList.contains('active') ? 
                        'fas fa-times' : 'fas fa-cog';
                }
                
                if (elements.settingsPanel.classList.contains('active')) {
                    UIState.activePanels.add('settingsPanel');
                } else {
                    UIState.activePanels.delete('settingsPanel');
                }
            }
        },
        
        openPaymentModal: function() {
            if (elements.paymentModal) {
                elements.paymentModal.classList.add('active');
                UIState.activeModals.add('paymentModal');
            }
            if (elements.premiumLimitOverlay) {
                elements.premiumLimitOverlay.classList.remove('active');
            }
        },
        
        closePaymentModal: function() {
            if (elements.paymentModal) {
                elements.paymentModal.classList.remove('active');
                UIState.activeModals.delete('paymentModal');
            }
        },
        
        selectPaymentOption: function(e) {
            document.querySelectorAll('.payment-option').forEach(option => {
                option.classList.remove('selected');
            });
            e.currentTarget.classList.add('selected');
        },
        
        processPayment: function() {
            const phoneNumber = elements.phoneNumber?.value.trim() || '';
            const amount = elements.paymentAmount?.value;
            
            if (!phoneNumber || !/^07\d{8}$/.test(phoneNumber)) {
                showNotification('Please enter a valid Kenyan phone number (07XXXXXXXX)', 'error');
                return;
            }
            
            if (!amount || amount < 100) {
                showNotification('Please enter a valid amount (minimum 100 KES)', 'error');
                return;
            }
            
            showNotification('Processing payment...', 'info');
            
            setTimeout(() => {
                UIEventHandlers.closePaymentModal();
                if (window.AppState) window.AppState.isPremium = true;
                showNotification('Payment successful! Premium features unlocked.', 'success');
            }, 2000);
        },
        
        closePremiumLimitModal: function() {
            if (elements.premiumLimitOverlay) {
                elements.premiumLimitOverlay.classList.remove('active');
            }
        },
        
        sendReaction: function(e) {
            if (!canPerformAction('sendReaction')) return;
            
            if (!UIState.activeCallId && !coreInstance?.isInCall?.()) {
                showNotification('Join a call to send reactions', 'info');
                return;
            }
            
            let reaction = '👍';
            
            if (e && e.currentTarget) {
                reaction = e.currentTarget.dataset.reaction || '👍';
            }
            
            this.createFloatingReaction(reaction);
            
            if (coreInstance && coreInstance.sendReaction) {
                coreInstance.sendReaction(reaction);
            }
            
            sendToParent('REACTION', { reaction, timestamp: Date.now() });
            
            showNotification(`Sent ${reaction} reaction`, 'info');
        },
        
        createFloatingReaction: function(reaction) {
            if (!elements.callContainer) return;
            
            const reactionEl = document.createElement('div');
            reactionEl.className = 'floating-reaction';
            reactionEl.textContent = reaction;
            reactionEl.style.left = Math.random() * 80 + 10 + '%';
            reactionEl.style.top = Math.random() * 80 + 10 + '%';
            
            elements.callContainer.appendChild(reactionEl);
            
            setTimeout(() => {
                if (reactionEl.parentNode) {
                    reactionEl.remove();
                }
            }, 3000);
        },
        
        handleLogout: function() {
            if (DEBUG) {
                logOnce('info', 'Logout triggered');
            }
            
            window.__CHILD_SESSION__.token = null;
            window.__CHILD_SESSION__.userId = null;
            window.__CHILD_SESSION__.expires = null;
            sessionReady = false;
            parentReady = false;
            handshakeComplete = false;
            _sessionInvalid = true;
            
            if (window.AppState) {
                window.AppState.isAuthenticated = false;
                window.AppState.user = null;
                window.AppState.currentUser = null;
            }
            
            const protectedButtons = [
                elements.newCallBtn,
                elements.quickVoiceBtn,
                elements.quickVideoBtn,
                elements.quickGroupBtn
            ];
            
            protectedButtons.forEach(btn => {
                if (btn) {
                    btn.disabled = true;
                }
            });
            
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
            
            showNotification('Logged out', 'info');
        }
    };

    // ==================== UI PANEL HANDLERS ====================
    const UIPanelHandlers = {
        openParticipantsPanel: function() {
            if (!UIState.activeCallId && !coreInstance?.isInCall?.()) {
                showNotification('Join a call to see participants', 'info');
                return;
            }
            
            this.createParticipantsPanel();
        },
        
        openChatPanel: function() {
            if (!UIState.activeCallId && !coreInstance?.isInCall?.()) {
                showNotification('Join a call to use chat', 'info');
                return;
            }
            
            this.createChatPanel();
        },
        
        openWhiteboardPanel: function() {
            if (!UIState.activeCallId && !coreInstance?.isInCall?.()) {
                showNotification('Join a call to use whiteboard', 'info');
                return;
            }
            
            this.createWhiteboardPanel();
        },
        
        openNotesPanel: function() {
            if (!UIState.activeCallId && !coreInstance?.isInCall?.()) {
                showNotification('Join a call to use notes', 'info');
                return;
            }
            
            this.createNotesPanel();
        },
        
        openPollsPanel: function() {
            if (!UIState.activeCallId && !coreInstance?.isInCall?.()) {
                showNotification('Join a call to create polls', 'info');
                return;
            }
            
            this.createPollsPanel();
        },
        
        openRelationshipPanel: function() {
            this.createRelationshipPanel();
        },
        
        createParticipantsPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();
            
            const panel = document.createElement('div');
            panel.className = 'feature-panel participants-panel';
            
            const participants = UIState.callParticipants || window.AppState?.callParticipants || [];
            const participantCount = participants.length + 1;
            
            let participantsHtml = '';
            participants.forEach(participant => {
                const name = participant.name || 'Participant';
                const initials = name.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
                const bgColor = '#6c5ce7';
                
                participantsHtml += `
                    <div class="participant-item">
                        <div class="participant-avatar" style="background-color: ${bgColor}">
                            ${SecuritySanitizer.sanitizeString(initials)}
                        </div>
                        <div class="participant-info">
                            <div class="participant-name">${SecuritySanitizer.sanitizeString(name)}</div>
                            <div class="participant-status online">
                                <span class="status-dot"></span> Online
                            </div>
                        </div>
                        ${participant.isPremium ? '<span class="premium-badge">PRO</span>' : ''}
                    </div>
                `;
            });
            
            panel.innerHTML = `
                <div class="panel-header">
                    <h4>Participants (${participantCount})</h4>
                    <button class="panel-close-btn" aria-label="Close panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="panel-content">
                    <div class="participant-item">
                        <div class="participant-avatar" style="background-color: #6c5ce7">Y</div>
                        <div class="participant-info">
                            <div class="participant-name">You (Host)</div>
                            <div class="participant-status online">
                                <span class="status-dot"></span> Online
                            </div>
                        </div>
                        <span class="premium-badge">PRO</span>
                    </div>
                    ${participantsHtml}
                </div>
            `;
            
            document.body.appendChild(panel);
            
            panel.querySelector('.panel-close-btn')?.addEventListener('click', () => panel.remove());
            
            UIState.activePanels.add('participantsPanel');
        },
        
        createChatPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();
            
            const panel = document.createElement('div');
            panel.className = 'feature-panel chat-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h4>In-Call Chat</h4>
                    <button class="panel-close-btn" aria-label="Close panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="panel-content">
                    <div class="chat-messages" id="chatMessagesPanel">
                        <div class="chat-message system">
                            <div class="message-content">Chat started.</div>
                            <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                    </div>
                    <div class="chat-input-container">
                        <input type="text" class="chat-input" id="chatInputPanel" 
                               placeholder="Type a message..." aria-label="Chat message">
                        <button class="chat-send-btn" id="chatSendPanel" aria-label="Send message">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
            
            panel.querySelector('.panel-close-btn').addEventListener('click', () => {
                panel.remove();
                UIState.activePanels.delete('chatPanel');
            });
            
            const chatInput = panel.querySelector('#chatInputPanel');
            const chatSend = panel.querySelector('#chatSendPanel');
            
            chatSend.addEventListener('click', () => {
                const message = chatInput.value.trim();
                if (message) {
                    if (coreInstance && coreInstance.sendChatMessage) {
                        coreInstance.sendChatMessage(message);
                    }
                    
                    const msgEl = document.createElement('div');
                    msgEl.className = 'chat-message self';
                    msgEl.innerHTML = `
                        <div class="message-sender">You</div>
                        <div class="message-content">${SecuritySanitizer.sanitizeString(message)}</div>
                        <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    `;
                    panel.querySelector('.chat-messages').appendChild(msgEl);
                    panel.querySelector('.chat-messages').scrollTop = panel.querySelector('.chat-messages').scrollHeight;
                    
                    chatInput.value = '';
                }
            });
            
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    chatSend.click();
                }
            });
            
            UIState.activePanels.add('chatPanel');
        },
        
        createWhiteboardPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();
            
            const panel = document.createElement('div');
            panel.className = 'feature-panel whiteboard-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h4>Shared Whiteboard</h4>
                    <button class="panel-close-btn" aria-label="Close panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="panel-content">
                    <div class="whiteboard-toolbar">
                        <div class="tool-btn active" data-tool="pen" title="Pen">
                            <i class="fas fa-pen"></i>
                        </div>
                        <div class="tool-btn" data-tool="eraser" title="Eraser">
                            <i class="fas fa-eraser"></i>
                        </div>
                        <div class="tool-btn" data-tool="text" title="Text">
                            <i class="fas fa-font"></i>
                        </div>
                        <div class="tool-btn" data-tool="line" title="Line">
                            <i class="fas fa-slash"></i>
                        </div>
                        <div class="tool-btn" data-tool="rectangle" title="Rectangle">
                            <i class="fas fa-square"></i>
                        </div>
                        <div class="tool-btn" data-tool="circle" title="Circle">
                            <i class="fas fa-circle"></i>
                        </div>
                        <div class="tool-color" style="background-color: #000000;" data-color="#000000" title="Black"></div>
                        <div class="tool-color selected" style="background-color: #ff3b30;" data-color="#ff3b30" title="Red"></div>
                        <div class="tool-color" style="background-color: #007aff;" data-color="#007aff" title="Blue"></div>
                        <div class="tool-color" style="background-color: #34c759;" data-color="#34c759" title="Green"></div>
                        <div class="tool-color" style="background-color: #ff9500;" data-color="#ff9500" title="Orange"></div>
                        <input type="range" class="tool-size-slider" min="1" max="20" value="3" title="Brush size">
                        <button class="tool-btn" id="clearWhiteboard" title="Clear whiteboard">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <canvas class="whiteboard-canvas" width="800" height="500"></canvas>
                    <div class="whiteboard-status">
                        <span>Whiteboard ready.</span>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
            
            const canvas = panel.querySelector('.whiteboard-canvas');
            const ctx = canvas.getContext('2d');
            let drawing = false;
            let currentColor = '#ff3b30';
            let currentSize = 3;
            
            canvas.addEventListener('mousedown', (e) => {
                drawing = true;
                ctx.beginPath();
                ctx.moveTo(e.offsetX, e.offsetY);
            });
            
            canvas.addEventListener('mousemove', (e) => {
                if (!drawing) return;
                ctx.strokeStyle = currentColor;
                ctx.lineWidth = currentSize;
                ctx.lineTo(e.offsetX, e.offsetY);
                ctx.stroke();
            });
            
            canvas.addEventListener('mouseup', () => {
                drawing = false;
            });
            
            canvas.addEventListener('mouseleave', () => {
                drawing = false;
            });
            
            panel.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
                btn.addEventListener('click', () => {
                    panel.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
            
            panel.querySelectorAll('.tool-color').forEach(colorBtn => {
                colorBtn.addEventListener('click', () => {
                    panel.querySelectorAll('.tool-color').forEach(c => c.classList.remove('selected'));
                    colorBtn.classList.add('selected');
                    currentColor = colorBtn.dataset.color;
                });
            });
            
            panel.querySelector('.tool-size-slider').addEventListener('input', (e) => {
                currentSize = parseInt(e.target.value);
            });
            
            panel.querySelector('#clearWhiteboard').addEventListener('click', () => {
                if (confirm('Clear the entire whiteboard?')) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            });
            
            panel.querySelector('.panel-close-btn').addEventListener('click', () => {
                panel.remove();
                UIState.activePanels.delete('whiteboardPanel');
            });
            
            UIState.activePanels.add('whiteboardPanel');
        },
        
        createNotesPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();
            
            const panel = document.createElement('div');
            panel.className = 'feature-panel notes-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h4>Shared Notes</h4>
                    <button class="panel-close-btn" aria-label="Close panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="panel-content">
                    <div class="notes-editor-container">
                        <textarea class="notes-editor" id="sharedNotesEditor" 
                                  placeholder="Start taking notes...">Meeting Notes:\n- \n- \n-</textarea>
                        <div class="notes-toolbar">
                            <button class="notes-btn" data-action="bold" title="Bold">
                                <i class="fas fa-bold"></i>
                            </button>
                            <button class="notes-btn" data-action="italic" title="Italic">
                                <i class="fas fa-italic"></i>
                            </button>
                            <button class="notes-btn" data-action="list" title="Bullet list">
                                <i class="fas fa-list-ul"></i>
                            </button>
                            <button class="notes-btn" data-action="save" title="Save notes">
                                <i class="fas fa-save"></i> Save
                            </button>
                        </div>
                    </div>
                    <div class="notes-history">
                        <h5>Previous Notes</h5>
                        <div class="notes-history-list">
                            <div class="notes-history-item">
                                <div class="notes-history-date">Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                <div class="notes-history-preview">Meeting notes...</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
            
            panel.querySelector('.panel-close-btn').addEventListener('click', () => {
                panel.remove();
                UIState.activePanels.delete('notesPanel');
            });
            
            panel.querySelector('[data-action="save"]').addEventListener('click', () => {
                const notes = panel.querySelector('#sharedNotesEditor').value;
                if (notes.trim() && coreInstance && coreInstance.saveNotes) {
                    coreInstance.saveNotes(notes);
                    showNotification('Notes saved', 'success');
                }
            });
            
            UIState.activePanels.add('notesPanel');
        },
        
        createPollsPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();
            
            const panel = document.createElement('div');
            panel.className = 'feature-panel polls-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h4>Polls</h4>
                    <button class="panel-close-btn" aria-label="Close panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="panel-content">
                    <div class="polls-tabs">
                        <button class="polls-tab active" data-tab="create">Create Poll</button>
                        <button class="polls-tab" data-tab="active">Active Polls</button>
                        <button class="polls-tab" data-tab="results">Results</button>
                    </div>
                    
                    <div class="polls-tab-content active" data-tab="create">
                        <div class="poll-form">
                            <input type="text" class="poll-question-input" placeholder="Enter your poll question...">
                            <div class="poll-options">
                                <input type="text" class="poll-option-input" placeholder="Option 1">
                                <input type="text" class="poll-option-input" placeholder="Option 2">
                                <button class="add-option-btn">Add Option</button>
                            </div>
                            <div class="poll-settings">
                                <label>
                                    <input type="checkbox" checked> Multiple choices allowed
                                </label>
                                <label>
                                    <input type="checkbox"> Anonymous voting
                                </label>
                            </div>
                            <button class="create-poll-btn">Create Poll</button>
                        </div>
                    </div>
                    
                    <div class="polls-tab-content" data-tab="active">
                        <div class="active-polls-list">
                            <div class="poll-item">
                                <div class="poll-question">What time works best for our next meeting?</div>
                                <div class="poll-options">
                                    <div class="poll-option">
                                        <input type="radio" name="poll1" id="poll1-1">
                                        <label for="poll1-1">Monday 10 AM</label>
                                    </div>
                                    <div class="poll-option">
                                        <input type="radio" name="poll1" id="poll1-2">
                                        <label for="poll1-2">Tuesday 2 PM</label>
                                    </div>
                                    <div class="poll-option">
                                        <input type="radio" name="poll1" id="poll1-3">
                                        <label for="poll1-3">Wednesday 11 AM</label>
                                    </div>
                                </div>
                                <button class="vote-btn">Vote</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="polls-tab-content" data-tab="results">
                        <div class="poll-results">
                            <div class="poll-result-item">
                                <div class="poll-question">Favorite meeting platform?</div>
                                <div class="result-bar">
                                    <div class="result-fill" style="width: 60%">Zoom (60%)</div>
                                </div>
                                <div class="result-bar">
                                    <div class="result-fill" style="width: 30%">Google Meet (30%)</div>
                                </div>
                                <div class="result-bar">
                                    <div class="result-fill" style="width: 10%">Teams (10%)</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
            
            panel.querySelector('.panel-close-btn').addEventListener('click', () => {
                panel.remove();
                UIState.activePanels.delete('pollsPanel');
            });
            
            panel.querySelectorAll('.polls-tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    const tabName = this.dataset.tab;
                    
                    panel.querySelectorAll('.polls-tab').forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                    
                    panel.querySelectorAll('.polls-tab-content').forEach(content => {
                        content.classList.remove('active');
                        if (content.dataset.tab === tabName) {
                            content.classList.add('active');
                        }
                    });
                });
            });
            
            panel.querySelector('.add-option-btn').addEventListener('click', () => {
                const optionsContainer = panel.querySelector('.poll-options');
                const newInput = document.createElement('input');
                newInput.type = 'text';
                newInput.className = 'poll-option-input';
                newInput.placeholder = `Option ${optionsContainer.children.length + 1}`;
                optionsContainer.insertBefore(newInput, panel.querySelector('.add-option-btn'));
            });
            
            panel.querySelector('.create-poll-btn').addEventListener('click', () => {
                const question = panel.querySelector('.poll-question-input').value;
                if (question.trim() && coreInstance && coreInstance.createPoll) {
                    const options = Array.from(panel.querySelectorAll('.poll-option-input'))
                        .map(input => input.value)
                        .filter(v => v.trim());
                    coreInstance.createPoll(question, options);
                }
            });
            
            UIState.activePanels.add('pollsPanel');
        },
        
        createRelationshipPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();
            
            const panel = document.createElement('div');
            panel.className = 'feature-panel relationship-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h4>Relationship Insights</h4>
                    <button class="panel-close-btn" aria-label="Close panel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="panel-content">
                    <div class="insight-cards">
                        <div class="insight-card">
                            <div class="insight-title">Total Calls</div>
                            <div class="insight-value">47</div>
                            <div class="insight-description">With all contacts</div>
                            <span class="insight-trend trend-up">+12%</span>
                        </div>
                        <div class="insight-card">
                            <div class="insight-title">Average Duration</div>
                            <div class="insight-value">24m</div>
                            <div class="insight-description">Per call</div>
                            <span class="insight-trend trend-neutral">0%</span>
                        </div>
                        <div class="insight-card">
                            <div class="insight-title">Busiest Day</div>
                            <div class="insight-value">Wednesday</div>
                            <div class="insight-description">Most calls scheduled</div>
                        </div>
                        <div class="insight-card">
                            <div class="insight-title">Favorite Contact</div>
                            <div class="insight-value">Sarah</div>
                            <div class="insight-description">15 calls this month</div>
                            <span class="insight-trend trend-up">+3</span>
                        </div>
                    </div>
                    <div class="relationship-chart">
                        <h5>Call Frequency (Last 30 days)</h5>
                        <div class="chart-container">
                            <div class="chart-bar" style="height: 80%">Mon</div>
                            <div class="chart-bar" style="height: 60%">Tue</div>
                            <div class="chart-bar" style="height: 90%">Wed</div>
                            <div class="chart-bar" style="height: 70%">Thu</div>
                            <div class="chart-bar" style="height: 50%">Fri</div>
                            <div class="chart-bar" style="height: 40%">Sat</div>
                            <div class="chart-bar" style="height: 30%">Sun</div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
            
            panel.querySelector('.panel-close-btn').addEventListener('click', () => {
                panel.remove();
                UIState.activePanels.delete('relationshipPanel');
            });
            
            UIState.activePanels.add('relationshipPanel');
        }
    };

    // ==================== NOTIFICATION SYSTEM ====================
    function createNotification({ type = 'info', title, message, duration = 3000 } = {}) {
        try {
            const notification = document.createElement('div');
            notification.className = `call-notification ${type}`;
            notification.setAttribute('role', 'alert');
            
            const iconMap = {
                success: 'fa-check-circle',
                error: 'fa-exclamation-circle',
                warning: 'fa-exclamation-triangle',
                info: 'fa-info-circle'
            };
            
            notification.innerHTML = `
                <div class="call-notification-icon">
                    <i class="fas ${iconMap[type] || 'fa-bell'}"></i>
                </div>
                <div class="call-notification-content">
                    <div class="call-notification-title">${title || type.charAt(0).toUpperCase() + type.slice(1)}</div>
                    <div class="call-notification-message">${SecuritySanitizer.sanitizeString(message)}</div>
                </div>
                <button class="call-notification-close" aria-label="Close notification">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            const closeBtn = notification.querySelector('.call-notification-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => notification.remove());
            }
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, duration);
            
            return notification;
        } catch (error) {
            UILogger.error('createNotification', error);
            return null;
        }
    }

    function showNotification(message, type = 'success') {
        const notificationArea = elements.notificationArea || document.body;
        
        const notification = createNotification({
            type,
            title: type.charAt(0).toUpperCase() + type.slice(1),
            message,
            duration: 3000
        });
        
        if (notification) {
            notificationArea.appendChild(notification);
        }
    }

    function requestMediaPermissionsFn(type) {
        const constraints = {
            audio: true,
            video: type === 'video'
        };
        
        return navigator.mediaDevices.getUserMedia(constraints)
            .catch(error => {
                UILogger.error('Error getting media permissions', error);
                
                let errorMessage = 'Could not access ';
                if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                    errorMessage += 'camera/microphone. Please check your devices.';
                } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                    errorMessage += 'camera/microphone. Please allow permissions.';
                } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                    errorMessage += 'camera/microphone. Device may be in use by another application.';
                } else {
                    errorMessage += 'camera/microphone. Unknown error.';
                }
                
                throw new Error(errorMessage);
            });
    }

    const ViewHistory = {
        push: function(view, data = {}) {
            UIState.viewHistory.push({
                view,
                data,
                timestamp: Date.now()
            });
            
            if (UIState.viewHistory.length > 50) {
                UIState.viewHistory.shift();
            }
            
            UIState.currentView = view;
        },
        
        pop: function() {
            UIState.viewHistory.pop();
            const previous = UIState.viewHistory[UIState.viewHistory.length - 1];
            UIState.currentView = previous?.view || 'sidebar';
            return previous;
        },
        
        createRestorePoint: function(key) {
            UIState.restorePoints.set(key, {
                view: UIState.currentView,
                activePanels: Array.from(UIState.activePanels),
                activeModals: Array.from(UIState.activeModals),
                timestamp: Date.now()
            });
            
            if (DEBUG) {
                logOnce('info', `Created restore point: ${key}`);
            }
        },
        
        restore: function(key) {
            const point = UIState.restorePoints.get(key);
            if (!point) return false;
            
            document.querySelectorAll('.feature-panel.active, .modal.active').forEach(el => {
                el.classList.remove('active');
            });
            
            UIState.activePanels.clear();
            UIState.activeModals.clear();
            
            UIState.currentView = point.view;
            
            if (DEBUG) {
                logOnce('info', `Restored from point: ${key}`);
            }
            return true;
        }
    };

    // ==================== FULL INITIALIZATION ====================
    function performFullInitialization() {
        if (DEBUG) {
            logOnce('info', 'Performing full UI initialization with core');
        }
        
        // Use coreInstance from closure
        if (window.callCore) {
            coreInstance = window.callCore;
        } else if (window.CallsCore) {
            coreInstance = window.CallsCore;
        } else if (window.callsCore) {
            coreInstance = window.callsCore;
        }
        
        initializeUISystem().catch(error => {
            if (DEBUG) {
                logOnce('error', 'Full initialization failed', error);
            }
        });
    }

    async function initializeUISystem() {
        if (UIState.initialized) {
            if (DEBUG) {
                logOnce('info', 'UI system already initialized');
            }
            return { success: true, stages: UIState.renderStages };
        }
        
        if (DEBUG) {
            logOnce('info', 'Initializing UI system');
        }
        
        cacheElements();
        await RenderingPipeline.execute();
        
        if (coreInstance && !fallbackModeActive) {
            CoreIntegration.subscribeToCore();
        }
        
        if (window.ResponsiveEngine) {
            ResponsiveEngine.initialize();
        }
        
        UIState.renderStages.initial = true;
        UIState.initialized = true;
        
        // Set up OPEN_CALL_WITH_USER listener
        setupOpenCallWithUserListener();
        
        window.dispatchEvent(new CustomEvent('calls.ui.ready', {
            detail: { 
                timestamp: Date.now()
            }
        }));
        
        if (DEBUG) {
            logOnce('info', 'UI initialization complete', {
                renderStages: UIState.renderStages,
                renderCount: UIState.renderCount,
                elementsCached: UIState.cachedElements.size,
                handshake: {
                    parentReady,
                    sessionReady,
                    handshakeComplete,
                    inPassiveMode,
                    coreReady,
                    coreLifecycleState
                },
                session: {
                    valid: isSessionValid(),
                    invalid: _sessionInvalid
                },
                coreLifecycle: coreLifecycleState
            });
        }
        
        return {
            success: true,
            stages: UIState.renderStages,
            diagnostics: UIDiagnostics.getReport()
        };
    }

    // ==================== EXPORTS ====================
    // Create bound functions safely
    const safeBind = (fn, context) => {
        if (typeof fn === 'function') {
            return fn.bind(context);
        }
        return function() {};
    };

    const PanelHandlers = UIPanelHandlers;
    const openParticipantsPanel = safeBind(UIPanelHandlers.openParticipantsPanel, UIPanelHandlers);
    const openChatPanel = safeBind(UIPanelHandlers.openChatPanel, UIPanelHandlers);
    const openWhiteboardPanel = safeBind(UIPanelHandlers.openWhiteboardPanel, UIPanelHandlers);
    const openNotesPanel = safeBind(UIPanelHandlers.openNotesPanel, UIPanelHandlers);
    const openPollsPanel = safeBind(UIPanelHandlers.openPollsPanel, UIPanelHandlers);
    const openRelationshipPanel = safeBind(UIPanelHandlers.openRelationshipPanel, UIPanelHandlers);
    const createParticipantsPanel = safeBind(UIPanelHandlers.createParticipantsPanel, UIPanelHandlers);
    const createChatPanel = safeBind(UIPanelHandlers.createChatPanel, UIPanelHandlers);
    const createWhiteboardPanel = safeBind(UIPanelHandlers.createWhiteboardPanel, UIPanelHandlers);
    const createNotesPanel = safeBind(UIPanelHandlers.createNotesPanel, UIPanelHandlers);
    const createPollsPanel = safeBind(UIPanelHandlers.createPollsPanel, UIPanelHandlers);
    const createRelationshipPanel = safeBind(UIPanelHandlers.createRelationshipPanel, UIPanelHandlers);

    const EventHandlers = UIEventHandlers;
    const toggleMenuDots = safeBind(UIEventHandlers.toggleMenuDots, UIEventHandlers);
    const closeMenuDots = safeBind(UIEventHandlers.closeMenuDots, UIEventHandlers);
    const openNewCallModal = safeBind(UIEventHandlers.openNewCallModal, UIEventHandlers);
    const closeNewCallModal = safeBind(UIEventHandlers.closeNewCallModal, UIEventHandlers);
    const searchContacts = safeBind(UIEventHandlers.searchContacts, UIEventHandlers);
    const searchGroupContacts = safeBind(UIEventHandlers.searchGroupContacts, UIEventHandlers);
    const selectGroupOption = safeBind(UIEventHandlers.selectGroupOption, UIEventHandlers);
    const startVoiceCall = safeBind(UIEventHandlers.startVoiceCall, UIEventHandlers);
    const startVideoCall = safeBind(UIEventHandlers.startVideoCall, UIEventHandlers);
    const startGroupCall = safeBind(UIEventHandlers.startGroupCall, UIEventHandlers);
    const generateVoiceCallLink = safeBind(UIEventHandlers.generateVoiceCallLink, UIEventHandlers);
    const generateVideoCallLink = safeBind(UIEventHandlers.generateVideoCallLink, UIEventHandlers);
    const copyCallLink = safeBind(UIEventHandlers.copyCallLink, UIEventHandlers);
    const shareCallLink = safeBind(UIEventHandlers.shareCallLink, UIEventHandlers);
    const toggleMute = safeBind(UIEventHandlers.toggleMute, UIEventHandlers);
    const toggleVideo = safeBind(UIEventHandlers.toggleVideo, UIEventHandlers);
    const toggleScreenShare = safeBind(UIEventHandlers.toggleScreenShare, UIEventHandlers);
    const toggleSpeaker = safeBind(UIEventHandlers.toggleSpeaker, UIEventHandlers);
    const openMoodSelectionModal = safeBind(UIEventHandlers.openMoodSelectionModal, UIEventHandlers);
    const closeMoodSelectionModal = safeBind(UIEventHandlers.closeMoodSelectionModal, UIEventHandlers);
    const setMood = safeBind(UIEventHandlers.setMood, UIEventHandlers);
    const openIntentionSelectionModal = safeBind(UIEventHandlers.openIntentionSelectionModal, UIEventHandlers);
    const closeIntentionSelectionModal = safeBind(UIEventHandlers.closeIntentionSelectionModal, UIEventHandlers);
    const setIntention = safeBind(UIEventHandlers.setIntention, UIEventHandlers);
    const toggleFocusMode = safeBind(UIEventHandlers.toggleFocusMode, UIEventHandlers);
    const enableFocusMode = safeBind(UIEventHandlers.enableFocusMode, UIEventHandlers);
    const disableFocusMode = safeBind(UIEventHandlers.disableFocusMode, UIEventHandlers);
    const endCall = safeBind(UIEventHandlers.endCall, UIEventHandlers);
    const skipPrivateNotes = safeBind(UIEventHandlers.skipPrivateNotes, UIEventHandlers);
    const savePrivateNotes = safeBind(UIEventHandlers.savePrivateNotes, UIEventHandlers);
    const showCallSummary = safeBind(UIEventHandlers.showCallSummary, UIEventHandlers);
    const closeCallSummary = safeBind(UIEventHandlers.closeCallSummary, UIEventHandlers);
    const declineIncomingCall = safeBind(UIEventHandlers.declineIncomingCall, UIEventHandlers);
    const acceptIncomingCall = safeBind(UIEventHandlers.acceptIncomingCall, UIEventHandlers);
    const acceptIncomingCallAsVideo = safeBind(UIEventHandlers.acceptIncomingCallAsVideo, UIEventHandlers);
    const switchCallCategory = safeBind(UIEventHandlers.switchCallCategory, UIEventHandlers);
    const switchNewCallTab = safeBind(UIEventHandlers.switchNewCallTab, UIEventHandlers);
    const toggleSettingsPanel = safeBind(UIEventHandlers.toggleSettingsPanel, UIEventHandlers);
    const openPaymentModal = safeBind(UIEventHandlers.openPaymentModal, UIEventHandlers);
    const closePaymentModal = safeBind(UIEventHandlers.closePaymentModal, UIEventHandlers);
    const selectPaymentOption = safeBind(UIEventHandlers.selectPaymentOption, UIEventHandlers);
    const processPayment = safeBind(UIEventHandlers.processPayment, UIEventHandlers);
    const closePremiumLimitModal = safeBind(UIEventHandlers.closePremiumLimitModal, UIEventHandlers);
    const sendReaction = safeBind(UIEventHandlers.sendReaction, UIEventHandlers);
    const handleLogout = safeBind(UIEventHandlers.handleLogout, UIEventHandlers);

    const requestMediaPermissionsFnExport = requestMediaPermissionsFn;

    const EventSystemExport = EventSystem;
    const RenderingPipelineExport = RenderingPipeline;
    const CoreIntegrationExport = CoreIntegration;
    const ResponsiveEngineExport = ResponsiveEngine;
    const SecuritySanitizerExport = SecuritySanitizer;
    const ViewHistoryExport = ViewHistory;

    const UIStateExport = UIState;
    const UIDiagnosticsExport = UIDiagnostics;
    const UILoggerExport = UILogger;
    const UIErrorBoundaryExport = UIErrorBoundary;

    const elementsExport = elements;

    window.callsUI = {
        initializeUISystem,
        cacheElements,
        PanelHandlers,
        openParticipantsPanel,
        openChatPanel,
        openWhiteboardPanel,
        openNotesPanel,
        openPollsPanel,
        openRelationshipPanel,
        createParticipantsPanel,
        createChatPanel,
        createWhiteboardPanel,
        createNotesPanel,
        createPollsPanel,
        createRelationshipPanel,
        EventHandlers,
        toggleMenuDots,
        closeMenuDots,
        openNewCallModal,
        closeNewCallModal,
        searchContacts,
        searchGroupContacts,
        selectGroupOption,
        startVoiceCall,
        startVideoCall,
        startGroupCall,
        generateVoiceCallLink,
        generateVideoCallLink,
        copyCallLink,
        shareCallLink,
        toggleMute,
        toggleVideo,
        toggleScreenShare,
        toggleSpeaker,
        openMoodSelectionModal,
        closeMoodSelectionModal,
        setMood,
        openIntentionSelectionModal,
        closeIntentionSelectionModal,
        setIntention,
        toggleFocusMode,
        enableFocusMode,
        disableFocusMode,
        endCall,
        skipPrivateNotes,
        savePrivateNotes,
        showCallSummary,
        closeCallSummary,
        declineIncomingCall,
        acceptIncomingCall,
        acceptIncomingCallAsVideo,
        switchCallCategory,
        switchNewCallTab,
        toggleSettingsPanel,
        openPaymentModal,
        closePaymentModal,
        selectPaymentOption,
        processPayment,
        closePremiumLimitModal,
        sendReaction,
        handleLogout,
        requestMediaPermissionsFn: requestMediaPermissionsFnExport,
        EventSystem: EventSystemExport,
        RenderingPipeline: RenderingPipelineExport,
        CoreIntegration: CoreIntegrationExport,
        ResponsiveEngine: ResponsiveEngineExport,
        SecuritySanitizer: SecuritySanitizerExport,
        ViewHistory: ViewHistoryExport,
        UIState: UIStateExport,
        UIDiagnostics: UIDiagnosticsExport,
        UILogger: UILoggerExport,
        UIErrorBoundary: UIErrorBoundaryExport,
        elements: elementsExport,
        showNotification,
        getSessionCache: () => window.__CHILD_SESSION__,
        getHandshakeStatus: () => ({
            parentReady,
            sessionReady,
            handshakeComplete,
            fallbackModeActive,
            inPassiveMode,
            coreReady,
            coreLifecycleState,
            sessionInvalid: _sessionInvalid
        }),
        // Added session validation helper
        isSessionValid,
        // Added core state assertion helper
        assertCoreActive,
        getDiagnostics: () => UIDiagnostics.getReport(),
        getUIState: () => ({ ...UIState }),
        // Added core reference
        getCoreInstance: () => coreInstance,
        // Added method to check if core is in ACTIVE state
        isCoreActive: () => {
            if (coreInstance && coreInstance.getLifecycleState) {
                return coreInstance.getLifecycleState() === 'ACTIVE';
            }
            return coreReady && parentReady;
        },
        // Get core lifecycle state
        getCoreLifecycleState: () => coreLifecycleState,
        // Check if in a call
        isInCall: () => {
            if (coreInstance && coreInstance.isInCall) {
                return coreInstance.isInCall();
            }
            return UIState.activeCallId !== null;
        },
        // Refresh session sync indicator
        refreshSyncIndicator: () => {
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
        },
        // Get pending call status
        getPendingCall: () => ({ ...pendingCall }),
        // Manually trigger a call with a user (for external use)
        initiateCallWithUser: (userId, userName, callType = 'voice') => {
            handleOpenCallWithUser({ detail: { userId, userName, callType } });
        }
    };

    // ==================== BOOTSTRAP ====================
    
    coreInitializationStartTime = Date.now();
    
    setupCoreReadyListener();
    
    // Define handleContactClick to fix the bind error
    const handleContactClick = function(e) {
        if (e.target.closest('.contact-checkbox')) return;
        
        const checkbox = this.querySelector('.contact-checkbox');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            
            if (checkbox.checked) {
                this.classList.add('selected');
            } else {
                this.classList.remove('selected');
            }
        }
    };
    
    if (detectExistingCore()) {
        if (DEBUG) {
            logOnce('success', 'Core already available, initializing UI immediately');
        }
        initializeUISystem().catch(error => {
            if (DEBUG) {
                logOnce('error', 'Auto-initialization failed', error);
            }
            RenderingPipeline.skeleton();
        });
    } else {
        if (DEBUG) {
            logOnce('info', 'Core not immediately available, showing skeleton and waiting for events');
        }
        
        RenderingPipeline.skeleton();
        
        // No timeout - just wait for events
        waitForCoreReady().then((ready) => {
            if (ready) {
                if (DEBUG) {
                    logOnce('success', 'Core became ready after ' + (Date.now() - coreInitializationStartTime) + 'ms, initializing full UI');
                }
                performFullInitialization();
            } else {
                // This should not happen with the event-driven approach
                logOnce('error', 'Core ready promise resolved false - this should not happen');
                // Keep showing skeleton UI
                RenderingPipeline.initialRender().catch(() => {});
            }
        });
    }

})();