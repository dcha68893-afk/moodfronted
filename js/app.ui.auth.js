// Update the readNetworkStatusFromApi function to add request throttling
let lastStatusCheckTime = 0;
let isCheckingStatus = false;
const STATUS_CHECK_THROTTLE_MS = 2000; // Don't check more than once every 2 seconds

/**
 * Reads network status from api.js using multiple methods
 * Returns the current network status for UI display only
 */
async function readNetworkStatusFromApi() {
  console.log('readNetworkStatusFromApi called - checking multiple sources...');
  
  // Throttle: Don't check too frequently
  const now = Date.now();
  if (isCheckingStatus) {
    console.log('Status check already in progress, returning cached status');
    return {
      status: window.NetworkStatus.status,
      message: window.NetworkStatus.status === 'online' ? 'Connected to MoodChat' : 
               window.NetworkStatus.status === 'offline' ? 'Cannot reach MoodChat server' : 
               'Checking connection...',
      backendReachable: window.NetworkStatus.backendReachable
    };
  }
  
  if (now - lastStatusCheckTime < STATUS_CHECK_THROTTLE_MS) {
    console.log('Status check throttled, using cached status');
    return {
      status: window.NetworkStatus.status,
      message: window.NetworkStatus.status === 'online' ? 'Connected to MoodChat' : 
               window.NetworkStatus.status === 'offline' ? 'Cannot reach MoodChat server' : 
               'Checking connection...',
      backendReachable: window.NetworkStatus.backendReachable
    };
  }
  
  isCheckingStatus = true;
  lastStatusCheckTime = now;
  
  try {
    // Method 1: Check browser network status first (fastest)
    if (!navigator.onLine) {
      console.log('Browser reports offline');
      return { status: 'offline', message: 'No internet connection', backendReachable: false };
    }
    
    // Method 2: Check if api.js has exposed status directly (most reliable)
    console.log('Checking API_COORDINATION:', window.API_COORDINATION);
    if (window.API_COORDINATION && window.API_COORDINATION.backendReachable !== undefined) {
      const isReachable = window.API_COORDINATION.backendReachable;
      console.log('API_COORDINATION says backendReachable:', isReachable);
      return {
        status: isReachable ? 'online' : 'offline',
        message: isReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server',
        backendReachable: isReachable
      };
    }
    
    // Method 3: Check other api.js exposed properties
    console.log('Checking other API status properties...');
    
    // Check for MoodChatAPI global object
    if (window.MoodChatAPI && window.MoodChatAPI.backendReachable !== undefined) {
      const isReachable = window.MoodChatAPI.backendReachable;
      console.log('MoodChatAPI says backendReachable:', isReachable);
      return {
        status: isReachable ? 'online' : 'offline',
        message: isReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server',
        backendReachable: isReachable
      };
    }
    
    // Check for API_STATUS global object
    if (window.API_STATUS && window.API_STATUS.backendReachable !== undefined) {
      const isReachable = window.API_STATUS.backendReachable;
      console.log('API_STATUS says backendReachable:', isReachable);
      return {
        status: isReachable ? 'online' : 'offline',
        message: isReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server',
        backendReachable: isReachable
      };
    }
    
    // Method 4: Direct API call to /status endpoint (fallback)
    if (typeof window.api === 'function') {
      try {
        console.log('Attempting direct /status API call...');
        
        // Use a timeout to prevent blocking UI
        const statusPromise = window.api('/status');
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Status check timeout')), 3000)
        );
        
        const response = await Promise.race([statusPromise, timeoutPromise]);
        console.log('/status API response:', response);
        
        // Check if response indicates backend is reachable
        const isReachable = response && (
          response.status === 'ok' || 
          response.success === true ||
          response.healthy === true ||
          (response.statusCode && response.statusCode === 200) ||
          (response.code && response.code === 200)
        );
        
        console.log('Direct API check says backendReachable:', isReachable);
        
        return {
          status: isReachable ? 'online' : 'offline',
          message: isReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server',
          backendReachable: isReachable
        };
      } catch (error) {
        console.log('Direct API status check failed:', error.message);
        // Don't throw, just continue to other methods
      }
    }
    
    // Method 5: Check if we've received any api-network-status events
    console.log('Checking for cached network status...');
    if (window.NetworkStatus.lastChecked && 
        Date.now() - window.NetworkStatus.lastChecked.getTime() < 30000) {
      // Use cached status if it's recent (less than 30 seconds old)
      console.log('Using cached network status:', window.NetworkStatus.status);
      return {
        status: window.NetworkStatus.status,
        message: window.NetworkStatus.status === 'online' ? 'Connected to MoodChat' : 
                 window.NetworkStatus.status === 'offline' ? 'Cannot reach MoodChat server' : 
                 'Checking connection...',
        backendReachable: window.NetworkStatus.backendReachable
      };
    }
    
    // If we can't determine status, show checking
    console.log('Unable to determine network status, showing checking...');
    return { status: 'checking', message: 'Checking connection...', backendReachable: false };
  } finally {
    isCheckingStatus = false;
  }
}

// Update the updateNetworkStatusFromApi function to handle concurrency
let pendingStatusUpdate = null;

/**
 * Updates UI based on network status from api.js
 * This runs in the background and does NOT block UI interactions
 */
async function updateNetworkStatusFromApi() {
  // If there's already a pending update, return that promise
  if (pendingStatusUpdate) {
    console.log('Returning existing status update promise');
    return pendingStatusUpdate;
  }
  
  pendingStatusUpdate = (async () => {
    try {
      console.log('Updating network status from api.js...');
      const statusInfo = await readNetworkStatusFromApi();
      console.log('Status info determined:', statusInfo);
      
      window.NetworkStatus.status = statusInfo.status;
      window.NetworkStatus.backendReachable = statusInfo.backendReachable;
      window.NetworkStatus.lastChecked = new Date();
      
      updateNetworkStatusUI(statusInfo.status, statusInfo.message);
    } catch (error) {
      console.error('Error updating network status from api.js:', error);
      updateNetworkStatusUI('checking', 'Checking connection...');
    }
  })();
  
  // Clear the pending promise when done
  const result = await pendingStatusUpdate;
  pendingStatusUpdate = null;
  return result;
}

// Update the setupApiStatusListener to prevent duplicate API ready event handling
let apiReadyHandled = false;

/**
 * Sets up listener for api.js network status events
 */
function setupApiStatusListener() {
  console.log('Setting up api.js network status event listeners...');
  
  // Listen for api-network-status events
  window.addEventListener('api-network-status', (event) => {
    console.log('Received api-network-status event:', event.detail);
    
    const { isReachable, message } = event.detail || {};
    const browserOnline = navigator.onLine;
    
    // Determine status based on api.js and browser status
    if (!browserOnline) {
      window.NetworkStatus.status = 'offline';
      window.NetworkStatus.backendReachable = false;
      updateNetworkStatusUI('offline', 'No internet connection');
    } else if (isReachable) {
      window.NetworkStatus.status = 'online';
      window.NetworkStatus.backendReachable = true;
      updateNetworkStatusUI('online', message || 'Connected to MoodChat');
    } else {
      window.NetworkStatus.status = 'offline';
      window.NetworkStatus.backendReachable = false;
      updateNetworkStatusUI('offline', message || 'Cannot reach MoodChat server');
    }
    
    window.NetworkStatus.lastChecked = new Date();
  });
  
  // Listen for api-ready events (multiple variants) but only handle once
  const handleApiReady = () => {
    if (apiReadyHandled) {
      console.log('API ready event already handled, skipping...');
      return;
    }
    
    console.log('API ready event received, checking network status...');
    apiReadyHandled = true;
    
    // Don't check immediately - API might still be initializing
    // Let the periodic check handle it
    console.log('API ready - network status will be checked by periodic updates');
  };
  
  window.addEventListener('api-ready', handleApiReady);
  window.addEventListener('apiready', handleApiReady);
  window.addEventListener('apiReady', handleApiReady);
}

// Update the startPeriodicNetworkUpdates to reduce frequency
/**
 * Starts periodic network status updates from api.js
 * Reads status every 30 seconds without blocking UI
 */
function startPeriodicNetworkUpdates() {
  // Clear any existing interval
  if (window.NetworkStatus.checkInterval) {
    clearInterval(window.NetworkStatus.checkInterval);
    window.NetworkStatus.checkInterval = null;
  }
  
  // Initial update after api.js has time to initialize
  setTimeout(() => {
    console.log('Initial network status check...');
    updateNetworkStatusFromApi().catch(error => {
      console.log('Initial network status check failed:', error.message);
    });
  }, 3000); // Wait 3 seconds for API to fully initialize
  
  // Set up periodic updates (every 30 seconds - non-blocking)
  window.NetworkStatus.checkInterval = setInterval(() => {
    if (navigator.onLine) {
      console.log('Periodic network status check...');
      updateNetworkStatusFromApi().catch(error => {
        console.log('Periodic network status check failed:', error.message);
      });
    } else {
      // Immediately update if browser goes offline
      console.log('Browser offline detected in periodic check');
      updateNetworkStatusUI('offline', 'No internet connection');
      window.NetworkStatus.backendReachable = false;
      window.NetworkStatus.lastChecked = new Date();
    }
  }, 30000); // 30 seconds instead of 10 seconds
  
  console.log('Periodic network status updates started (30 second interval)');
}

// Update the handleBrowserOnline to throttle
/**
 * Handles browser's online event
 */
function handleBrowserOnline() {
  console.log('Browser online event detected');
  updateNetworkStatusUI('checking', 'Reconnecting...');
  
  // Wait a moment before updating (allow network to stabilize)
  setTimeout(() => {
    updateNetworkStatusFromApi().catch(console.error);
  }, 2000); // Increased to 2 seconds
}

// Add a function to force a status check (for debugging)
window.forceNetworkCheck = async function() {
  console.log('Force network check requested');
  lastStatusCheckTime = 0; // Reset throttle
  await updateNetworkStatusFromApi();
  return window.NetworkStatus;
};

// Update the initialization to start with less aggressive checking
/**
 * Initializes network status monitoring and auth forms
 */
function initializeAuthUI() {
  console.log('Initializing auth UI and network status monitoring...');
  
  // 1. Set up auth form listeners FIRST (ensures forms work immediately)
  setupAuthFormListeners();
  
  // 2. Set initial network UI state (non-blocking)
  updateNetworkStatusUI('checking', 'Checking connection...');
  
  // 3. Set up api.js event listener for real-time status updates
  setupApiStatusListener();
  
  // 4. Integrate with existing AppState
  integrateWithAppState();
  
  // 5. Set up browser event listeners for network status
  window.addEventListener('online', handleBrowserOnline);
  window.addEventListener('offline', handleBrowserOffline);
  
  // 6. Start periodic network status updates from api.js (non-blocking)
  setTimeout(() => {
    startPeriodicNetworkUpdates();
  }, 2000); // Start after 2 seconds to ensure API is loaded
  
  console.log('Auth UI and network monitoring initialized');
}