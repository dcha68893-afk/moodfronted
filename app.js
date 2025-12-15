// app.js - Application Shell & Tab Controller for Kynecta
// Manages the single-page application shell and tab visibility

// ============================================================================
// CONFIGURATION
// ============================================================================

// Application configuration
const APP_CONFIG = {
  defaultPage: 'group.html',
  contentArea: '#content-area',
  sidebar: '#sidebar',
  sidebarToggle: '#sidebarToggle'
};

// Map tab names to their container IDs in chat.html
const TAB_CONFIG = {
  chats: {
    container: '#chatsTab',
    icon: '[data-tab="chats"]',
    isExternal: false
  },
  groups: {
    container: '#groupsTab',
    icon: '[data-tab="groups"]',
    isExternal: false
  },
  friends: {
    container: '#friendsTab',
    icon: '[data-tab="friends"]',
    isExternal: false
  },
  calls: {
    container: '#callsTab',
    icon: '[data-tab="calls"]',
    isExternal: false
  },
  tools: {
    container: '#toolsTab',
    icon: '[data-tab="tools"]',
    isExternal: false
  }
};

// External page configurations
const EXTERNAL_TABS = {
  groups: 'group.html'
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let currentTab = 'groups'; // Default to groups
let isLoading = false;
let isSidebarOpen = true;

// ADD: Network connectivity state
let isOnline = navigator.onLine;
let syncQueue = []; // Queue for messages to sync when online

// ============================================================================
// NETWORK DETECTION & BACKGROUND SYNC
// ============================================================================

// ADD: Network status detection and management
function initializeNetworkDetection() {
  console.log('Initializing network detection...');
  
  // Set initial state
  updateNetworkStatus(navigator.onLine);
  
  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Initialize IndexedDB for queued messages
  initializeMessageQueue();
}

// ADD: Handle online event
function handleOnline() {
  console.log('Network: Online');
  updateNetworkStatus(true);
  
  // Broadcast network change to other files
  broadcastNetworkChange(true);
  
  // Process queued messages
  processQueuedMessages();
}

// ADD: Handle offline event
function handleOffline() {
  console.log('Network: Offline');
  updateNetworkStatus(false);
  
  // Broadcast network change to other files
  broadcastNetworkChange(false);
}

// ADD: Update network status globally
function updateNetworkStatus(online) {
  isOnline = online;
  
  // Expose globally for other modules
  window.APP_CONNECTIVITY = {
    isOnline: isOnline,
    lastChange: new Date().toISOString()
  };
  
  // Dispatch custom event for other components
  const event = new CustomEvent('network-status-change', {
    detail: { isOnline: isOnline }
  });
  window.dispatchEvent(event);
}

// ADD: Broadcast network changes
function broadcastNetworkChange(isOnline) {
  // Use localStorage as a cross-tab communication channel
  const status = {
    type: 'network-status',
    isOnline: isOnline,
    timestamp: new Date().toISOString()
  };
  
  try {
    localStorage.setItem('kynecta-network-status', JSON.stringify(status));
    
    // Dispatch storage event for other tabs/windows
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'kynecta-network-status',
      newValue: JSON.stringify(status)
    }));
  } catch (e) {
    console.warn('Could not broadcast network status to localStorage:', e);
  }
}

// ADD: Initialize IndexedDB for message queue
function initializeMessageQueue() {
  if (!window.indexedDB) {
    console.warn('IndexedDB not supported, offline queue disabled');
    return;
  }
  
  const request = indexedDB.open('KynectaMessageQueue', 1);
  
  request.onerror = function(event) {
    console.error('Failed to open IndexedDB:', event.target.error);
  };
  
  request.onupgradeneeded = function(event) {
    const db = event.target.result;
    
    // Create object store for queued messages
    if (!db.objectStoreNames.contains('messages')) {
      const store = db.createObjectStore('messages', {
        keyPath: 'id',
        autoIncrement: true
      });
      
      // Create indexes for efficient querying
      store.createIndex('status', 'status', { unique: false });
      store.createIndex('timestamp', 'timestamp', { unique: false });
    }
  };
  
  request.onsuccess = function(event) {
    console.log('Message queue database initialized');
  };
}

// ADD: Queue message for offline sync
function queueMessageForSync(messageData) {
  if (!window.indexedDB) return Promise.resolve(false);
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('KynectaMessageQueue', 1);
    
    request.onerror = function(event) {
      console.error('Failed to open IndexedDB for queuing:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = function(event) {
      const db = event.target.result;
      const transaction = db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      
      const message = {
        ...messageData,
        status: 'pending',
        timestamp: new Date().toISOString(),
        attempts: 0
      };
      
      const addRequest = store.add(message);
      
      addRequest.onsuccess = function() {
        console.log('Message queued for sync:', messageData);
        
        // Add to in-memory queue
        syncQueue.push({
          id: addRequest.result,
          ...message
        });
        
        resolve(true);
      };
      
      addRequest.onerror = function(event) {
        console.error('Failed to queue message:', event.target.error);
        reject(event.target.error);
      };
    };
  });
}

// ADD: Process queued messages when online
function processQueuedMessages() {
  if (!isOnline || !window.indexedDB) return;
  
  const request = indexedDB.open('KynectaMessageQueue', 1);
  
  request.onerror = function(event) {
    console.error('Failed to open IndexedDB for processing:', event.target.error);
  };
  
  request.onsuccess = function(event) {
    const db = event.target.result;
    const transaction = db.transaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const index = store.index('status');
    const range = IDBKeyRange.only('pending');
    
    const getRequest = index.getAll(range);
    
    getRequest.onsuccess = function() {
      const messages = getRequest.result;
      
      if (messages.length === 0) {
        console.log('No pending messages to sync');
        return;
      }
      
      console.log(`Processing ${messages.length} queued messages`);
      
      // Process each message
      messages.forEach(message => {
        sendQueuedMessage(message, db);
      });
    };
  };
}

// ADD: Send a queued message
function sendQueuedMessage(message, db) {
  // This function should be customized based on your actual API
  // For now, we'll simulate sending and update status
  
  console.log('Sending queued message:', message);
  
  // Simulate API call
  setTimeout(() => {
    // Update message status in IndexedDB
    const transaction = db.transaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');
    
    const updatedMessage = {
      ...message,
      status: 'sent',
      sentAt: new Date().toISOString(),
      attempts: (message.attempts || 0) + 1
    };
    
    const updateRequest = store.put(updatedMessage);
    
    updateRequest.onsuccess = function() {
      console.log('Queued message sent successfully:', message.id);
      
      // Remove from in-memory queue
      syncQueue = syncQueue.filter(item => item.id !== message.id);
    };
    
    updateRequest.onerror = function(event) {
      console.error('Failed to update message status:', event.target.error);
    };
  }, 1000);
}

// ADD: Safe API call wrapper with better error handling
function safeApiCall(apiFunction, ...args) {
  return new Promise((resolve, reject) => {
    if (!isOnline) {
      console.warn('API call prevented: offline mode');
      
      // Queue the call data if possible
      if (apiFunction.name && args.length > 0) {
        queueMessageForSync({
          api: apiFunction.name,
          args: args,
          timestamp: new Date().toISOString()
        }).then(() => {
          resolve({
            success: false,
            offline: true,
            queued: true,
            message: 'Action queued for when online'
          });
        }).catch(() => {
          resolve({
            success: false,
            offline: true,
            queued: false,
            message: 'Offline mode: action not queued'
          });
        });
      } else {
        resolve({
          success: false,
          offline: true,
          queued: false,
          message: 'Offline mode'
        });
      }
      return;
    }
    
    // Proceed with normal API call
    try {
      const result = apiFunction(...args);
      
      // Handle both promises and direct returns
      if (result && typeof result.then === 'function') {
        result.then(resolve).catch(error => {
          console.error('API call failed:', error);
          reject(error);
        });
      } else {
        resolve(result);
      }
    } catch (error) {
      console.error('API call error:', error);
      reject(error);
    }
  });
}

// ADD: Clear message queue (for testing/debugging)
function clearMessageQueue() {
  if (!window.indexedDB) return Promise.resolve(false);
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('KynectaMessageQueue', 1);
    
    request.onerror = function(event) {
      reject(event.target.error);
    };
    
    request.onsuccess = function(event) {
      const db = event.target.result;
      const transaction = db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const clearRequest = store.clear();
      
      clearRequest.onsuccess = function() {
        syncQueue = [];
        console.log('Message queue cleared');
        resolve(true);
      };
      
      clearRequest.onerror = function(event) {
        reject(event.target.error);
      };
    };
  });
}

// ============================================================================
// APPLICATION SHELL FUNCTIONS
// ============================================================================

/**
 * Toggle sidebar visibility on mobile
 */
window.toggleSidebar = function() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
    isSidebarOpen = sidebar.classList.contains('open');
  }
};

/**
 * Load an HTML page into the content area without reloading
 */
window.loadPage = function(page) {
  const contentArea = document.querySelector(APP_CONFIG.contentArea);
  if (!contentArea) {
    console.error('Content area not found:', APP_CONFIG.contentArea);
    return;
  }

  fetch(page)
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load ${page}: ${res.status}`);
      return res.text();
    })
    .then(html => {
      contentArea.innerHTML = html;
      // Initialize any scripts in the loaded content
      initializeLoadedContent(contentArea);
    })
    .catch(err => console.error("Load error:", err));
};

/**
 * Initialize scripts and components in loaded content
 */
function initializeLoadedContent(container) {
  // Find and execute inline scripts
  const scripts = container.querySelectorAll('script');
  scripts.forEach(script => {
    if (script.src) {
      // Load external script
      const newScript = document.createElement('script');
      newScript.src = script.src;
      newScript.async = false;
      document.head.appendChild(newScript);
    } else if (script.textContent.trim()) {
      try {
        // Execute inline script
        const scriptContent = script.textContent;
        // Wrap in try-catch to avoid scope issues
        const executeScript = new Function(scriptContent);
        executeScript();
      } catch (error) {
        console.error('Error executing inline script:', error);
      }
    }
  });
}

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

/**
 * Switch to a specific tab
 */
function switchTab(tabName) {
  if (currentTab === tabName || isLoading) return;
  
  const config = TAB_CONFIG[tabName];
  if (!config) {
    console.error(`Tab "${tabName}" not found in config`);
    return;
  }
  
  // Check if this is an external tab that needs loading
  if (config.isExternal && EXTERNAL_TABS[tabName]) {
    loadExternalTab(tabName, EXTERNAL_TABS[tabName]);
    return;
  }
  
  // For internal tabs (already in DOM)
  showTab(tabName);
}

/**
 * Show an internal tab (already present in DOM)
 */
function showTab(tabName) {
  const config = TAB_CONFIG[tabName];
  if (!config) {
    console.error(`Config not found for tab: ${tabName}`);
    return;
  }
  
  // Hide all tabs
  hideAllTabs();
  
  // Show the selected tab
  const tabContainer = document.querySelector(config.container);
  if (tabContainer) {
    tabContainer.classList.remove('hidden');
    tabContainer.classList.add('active');
    
    // Update current tab
    currentTab = tabName;
    
    // Update active tab UI
    updateActiveTabUI(tabName);
    
    // Update chat area visibility based on tab
    updateChatAreaVisibility(tabName);
    
    console.log(`Switched to tab: ${tabName}`);
  } else {
    console.error(`Tab container not found: ${config.container} for tab: ${tabName}`);
    // Fallback: try to load as external tab if available
    if (EXTERNAL_TABS[tabName]) {
      loadExternalTab(tabName, EXTERNAL_TABS[tabName]);
    }
  }
}

/**
 * Load an external tab from separate HTML file
 */
async function loadExternalTab(tabName, htmlFile) {
  if (isLoading) return;
  isLoading = true;
  
  try {
    showLoadingIndicator(`Loading ${tabName}...`);
    
    const response = await fetch(htmlFile);
    if (!response.ok) throw new Error(`Failed to load ${htmlFile}: ${response.status}`);
    
    const html = await response.text();
    
    // Get or create external container
    let container = document.getElementById('externalTabContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'externalTabContainer';
      container.className = 'tab-panel';
      
      // Find tab panels container
      const tabPanels = document.querySelector('.tab-panels') || document.querySelector('#content-area');
      if (tabPanels) {
        tabPanels.appendChild(container);
      } else {
        // Fallback to body
        document.body.appendChild(container);
      }
    }
    
    // Hide all tabs before showing new content
    hideAllTabs();
    
    // Extract and insert content
    container.innerHTML = extractBodyContent(html);
    container.classList.remove('hidden');
    container.classList.add('active');
    
    // Update UI
    updateActiveTabUI(tabName);
    updateChatAreaVisibility(tabName);
    
    // Initialize scripts in loaded content
    initializeExternalContent(container);
    
    // Update current tab
    currentTab = tabName;
    
    console.log(`Loaded external tab: ${tabName} from ${htmlFile}`);
    
  } catch (error) {
    console.error(`Error loading ${tabName}:`, error);
    showError(`Failed to load ${tabName}. Please try again.`);
    
    // Fallback to internal tab if available
    if (TAB_CONFIG[tabName] && !TAB_CONFIG[tabName].isExternal) {
      showTab(tabName);
    }
  } finally {
    isLoading = false;
    hideLoadingIndicator();
  }
}

/**
 * Hide all tab panels
 */
function hideAllTabs() {
  // Hide all .tab-panel elements
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.add('hidden');
    panel.classList.remove('active');
  });
  
  // Also hide external container if it exists
  const externalContainer = document.getElementById('externalTabContainer');
  if (externalContainer) {
    externalContainer.classList.add('hidden');
    externalContainer.classList.remove('active');
  }
  
  // Hide any content in main content area that's not a tab panel
  const contentArea = document.querySelector(APP_CONFIG.contentArea);
  if (contentArea) {
    const nonTabChildren = Array.from(contentArea.children).filter(child => 
      !child.classList.contains('tab-panel') && child.id !== 'externalTabContainer'
    );
    nonTabChildren.forEach(child => {
      child.classList.add('hidden');
    });
  }
}

/**
 * Update the active tab UI in the sidebar
 */
function updateActiveTabUI(tabName) {
  // Reset all tab icons
  document.querySelectorAll('.nav-icon[data-tab]').forEach(icon => {
    icon.classList.remove('text-white', 'bg-purple-700', 'active');
    icon.classList.add('text-gray-400', 'hover:text-white', 'hover:bg-gray-800');
  });
  
  // Activate current tab icon
  const activeIcon = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeIcon) {
    activeIcon.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-gray-800');
    activeIcon.classList.add('text-white', 'bg-purple-700', 'active');
  }
}

/**
 * Update chat area visibility based on active tab
 */
function updateChatAreaVisibility(tabName) {
  const chatArea = document.getElementById('chatArea');
  const chatListContainer = document.getElementById('chatListContainer');
  const inputArea = document.getElementById('inputArea');
  const chatHeader = document.getElementById('chatHeader');
  
  if (!chatArea || !chatListContainer) return;
  
  const isMobile = window.innerWidth < 768;
  
  // Show/hide based on tab
  if (tabName === 'chats' || tabName === 'groups') {
    // Check if we're viewing a specific chat or the list
    const hasActiveChat = chatHeader && !chatHeader.classList.contains('hidden');
    
    if (hasActiveChat) {
      if (isMobile) {
        chatArea.classList.remove('hidden');
        chatListContainer.classList.add('hidden');
      }
      
      if (inputArea) {
        inputArea.classList.remove('hidden');
      }
    } else {
      chatArea.classList.add('hidden');
      chatListContainer.classList.remove('hidden');
      
      if (inputArea) inputArea.classList.add('hidden');
      if (chatHeader) chatHeader.classList.add('hidden');
    }
  } else {
    // For non-chat tabs, hide chat area
    chatArea.classList.add('hidden');
    chatListContainer.classList.remove('hidden');
    
    if (inputArea) inputArea.classList.add('hidden');
    if (chatHeader) chatHeader.classList.add('hidden');
  }
  
  // Update chat title for groups tab
  if (tabName === 'groups') {
    const chatTitle = document.getElementById('chatTitle');
    if (chatTitle) chatTitle.textContent = 'Group Chat';
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract body content from HTML string
 */
function extractBodyContent(html) {
  // Try to extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    return bodyMatch[1];
  }
  
  // If no body tag, try to extract main content
  const mainMatch = html.match(/<main[^>]*>([\s\S]*)<\/main>/i);
  if (mainMatch && mainMatch[1]) {
    return mainMatch[1];
  }
  
  // Return the entire HTML if no specific tags found
  return html;
}

/**
 * Initialize scripts and events in external content
 */
function initializeExternalContent(container) {
  // Execute inline scripts
  const scripts = container.querySelectorAll('script');
  scripts.forEach(script => {
    if (script.src) {
      // Load external script
      const newScript = document.createElement('script');
      newScript.src = script.src;
      newScript.async = false;
      document.head.appendChild(newScript);
    } else if (script.textContent.trim()) {
      try {
        // Create and execute function from script content
        const executeScript = new Function(script.textContent);
        executeScript();
      } catch (error) {
        console.error('Error executing inline script in external content:', error);
      }
    }
  });
  
  // Re-attach event listeners for buttons and links in the new content
  setTimeout(() => {
    attachEventListenersToNewContent(container);
  }, 100);
}

/**
 * Attach event listeners to elements in newly loaded content
 */
function attachEventListenersToNewContent(container) {
  // Handle modal triggers
  container.querySelectorAll('[data-modal]').forEach(element => {
    element.addEventListener('click', function(e) {
      e.preventDefault();
      const modalId = this.getAttribute('data-modal');
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.remove('hidden');
      }
    });
  });
  
  // Handle modal closers
  container.querySelectorAll('[data-close-modal]').forEach(element => {
    element.addEventListener('click', function(e) {
      e.preventDefault();
      const modalId = this.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });
  
  // Handle form submissions
  container.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      // ADD: Use safe API call for form submissions
      if (form.dataset.api) {
        const apiFunction = window[form.dataset.api];
        if (typeof apiFunction === 'function') {
          safeApiCall(apiFunction, new FormData(form))
            .then(result => {
              if (result.offline) {
                console.log('Form data queued for when online');
              }
            })
            .catch(error => {
              console.error('Form submission error:', error);
            });
        }
      } else {
        console.log('Form submitted:', this.id || this.className);
      }
    });
  });
}

function showLoadingIndicator(message = 'Loading...') {
  let loader = document.getElementById('tab-loading');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'tab-loading';
    loader.className = 'tab-loading-indicator';
    loader.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-text">${message}</div>
    `;
    document.body.appendChild(loader);
  }
  loader.style.display = 'flex';
}

function hideLoadingIndicator() {
  const loader = document.getElementById('tab-loading');
  if (loader) {
    loader.style.display = 'none';
  }
}

function showError(message) {
  // Remove existing error messages
  document.querySelectorAll('.error-message').forEach(el => el.remove());
  
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  errorDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #f87171;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    z-index: 10000;
    max-width: 300px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(errorDiv);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => errorDiv.remove(), 300);
    }
  }, 5000);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupEventListeners() {
  // Tab click handlers
  document.querySelectorAll('.nav-icon[data-tab]').forEach(icon => {
    // Remove existing listeners by cloning
    const newIcon = icon.cloneNode(true);
    icon.parentNode.replaceChild(newIcon, icon);
    
    const tabName = newIcon.getAttribute('data-tab');
    
    newIcon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      switchTab(tabName);
    });
  });
  
  // Sidebar toggle
  const sidebarToggle = document.querySelector(APP_CONFIG.sidebarToggle);
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });
  }
  
  // Mobile back button
  const backToChats = document.getElementById('backToChats');
  if (backToChats) {
    backToChats.addEventListener('click', () => {
      const chatListContainer = document.getElementById('chatListContainer');
      const chatArea = document.getElementById('chatArea');
      if (chatListContainer && chatArea) {
        chatListContainer.classList.remove('hidden');
        chatArea.classList.add('hidden');
        updateChatAreaVisibility(currentTab);
      }
    });
  }
  
  // Mobile chat item clicks - using event delegation
  document.addEventListener('click', (e) => {
    const chatItem = e.target.closest('.chat-item');
    if (chatItem) {
      const chatListContainer = document.getElementById('chatListContainer');
      const chatArea = document.getElementById('chatArea');
      const chatHeader = document.getElementById('chatHeader');
      
      if (chatListContainer && chatArea) {
        chatListContainer.classList.add('hidden');
        chatArea.classList.remove('hidden');
        
        if (chatHeader) {
          chatHeader.classList.remove('hidden');
        }
        
        // Update chat title if available
        const chatName = chatItem.querySelector('.chat-name');
        if (chatName) {
          const chatTitle = document.getElementById('chatTitle');
          if (chatTitle) {
            chatTitle.textContent = chatName.textContent;
          }
        }
        
        updateChatAreaVisibility(currentTab);
      }
    }
  });
  
  // Window resize handling
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      updateChatAreaVisibility(currentTab);
      
      // Ensure sidebar is visible on desktop, hidden on mobile
      const sidebar = document.querySelector(APP_CONFIG.sidebar);
      if (sidebar) {
        if (window.innerWidth >= 768) {
          sidebar.classList.remove('hidden', 'translate-x-full');
          sidebar.classList.add('translate-x-0');
          isSidebarOpen = true;
        } else {
          sidebar.classList.remove('translate-x-0');
          sidebar.classList.add('translate-x-full');
          isSidebarOpen = false;
        }
      }
    }, 250);
  });
  
  // Handle browser back/forward
  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.tab) {
      switchTab(event.state.tab);
    }
  });
  
  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth < 768 && isSidebarOpen) {
      const sidebar = document.querySelector(APP_CONFIG.sidebar);
      const toggleBtn = document.querySelector(APP_CONFIG.sidebarToggle);
      
      if (sidebar && 
          !sidebar.contains(e.target) && 
          toggleBtn && 
          !toggleBtn.contains(e.target) &&
          !e.target.closest('.nav-icon[data-tab]')) {
        toggleSidebar();
      }
    }
  });
  
  // Handle Escape key to close modals and sidebar
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close open modals
      document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
        if (!modal.classList.contains('hidden')) {
          modal.classList.add('hidden');
        }
      });
      
      // Close sidebar on mobile
      if (window.innerWidth < 768 && isSidebarOpen) {
        toggleSidebar();
      }
    }
  });
  
  // ADD: Listen for localStorage changes from other tabs
  window.addEventListener('storage', (event) => {
    if (event.key === 'kynecta-network-status' && event.newValue) {
      try {
        const status = JSON.parse(event.newValue);
        if (status.type === 'network-status') {
          updateNetworkStatus(status.isOnline);
        }
      } catch (e) {
        console.warn('Failed to parse network status from storage:', e);
      }
    }
  });
}

// ============================================================================
// OVERLAY MANAGEMENT (for compatibility)
// ============================================================================

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
  }
};

window.showSettingsSection = function(sectionName) {
  // First hide all settings modals
  document.querySelectorAll('.settings-section').forEach(section => {
    section.classList.add('hidden');
  });
  
  // Show the selected section
  const sectionElement = document.getElementById(sectionName + 'Settings');
  if (sectionElement) {
    sectionElement.classList.remove('hidden');
  }
};

window.openSettingsModal = function() {
  const modal = document.getElementById('settingsModal');
  if (modal) {
    modal.classList.remove('hidden');
    // Show default section
    showSettingsSection('account');
  }
};

window.triggerFileInput = function(inputId) {
  const fileInput = document.getElementById(inputId);
  if (fileInput) {
    fileInput.click();
  }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeApp() {
  console.log('Initializing Kynecta Application Shell...');
  
  // Ensure DOM is ready
  if (document.readyState !== 'loading') {
    runInitialization();
  } else {
    document.addEventListener('DOMContentLoaded', runInitialization);
  }
}

function runInitialization() {
  try {
    // Setup event listeners
    setupEventListeners();
    
    // ADD: Initialize network detection
    initializeNetworkDetection();
    
    // Ensure sidebar is properly initialized
    const sidebar = document.querySelector(APP_CONFIG.sidebar);
    if (sidebar) {
      sidebar.classList.remove('hidden');
      
      // Set initial sidebar state based on screen size
      if (window.innerWidth >= 768) {
        sidebar.classList.remove('translate-x-full');
        sidebar.classList.add('translate-x-0');
        isSidebarOpen = true;
      } else {
        sidebar.classList.remove('translate-x-0');
        sidebar.classList.add('translate-x-full');
        isSidebarOpen = false;
      }
    }
    
    // Ensure content area exists
    let contentArea = document.querySelector(APP_CONFIG.contentArea);
    if (!contentArea) {
      // Create content area if it doesn't exist
      contentArea = document.createElement('main');
      contentArea.id = 'content-area';
      document.body.appendChild(contentArea);
    }
    
    // Load default page
    loadPage(APP_CONFIG.defaultPage);
    
    // Set default tab to groups with a slight delay to ensure DOM is ready
    setTimeout(() => {
      try {
        // First try to show the groups tab
        const groupsTab = document.querySelector(TAB_CONFIG.groups.container);
        if (groupsTab) {
          showTab('groups');
        } else {
          // If groups tab doesn't exist, try to load it as external
          console.log('Groups tab not found in DOM, loading as external...');
          loadExternalTab('groups', EXTERNAL_TABS.groups);
        }
      } catch (error) {
        console.error('Error setting default tab:', error);
        // Fallback to chats tab
        if (TAB_CONFIG.chats.container && document.querySelector(TAB_CONFIG.chats.container)) {
          showTab('chats');
        }
      }
    }, 300);
    
    // Hide loading screen if it exists
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        // Remove from DOM after animation
        setTimeout(() => {
          if (loadingScreen.parentNode) {
            loadingScreen.parentNode.removeChild(loadingScreen);
          }
        }, 500);
      }, 500);
    }
    
    // Inject CSS styles
    injectStyles();
    
    console.log('Kynecta Application Shell initialized successfully');
    
  } catch (error) {
    console.error('Error during app initialization:', error);
    showError('Application initialization failed. Please refresh the page.');
  }
}

function injectStyles() {
  // Check if styles are already injected
  if (document.getElementById('app-styles')) return;
  
  const styles = `
    .tab-loading-indicator {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      color: white;
      font-size: 16px;
      backdrop-filter: blur(4px);
    }
    
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: #8b5cf6;
      animation: spin 1s ease-in-out infinite;
      margin-bottom: 15px;
    }
    
    .loading-text {
      margin-top: 10px;
      font-size: 14px;
      opacity: 0.9;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
    
    /* Sidebar transition */
    #sidebar {
      transition: transform 0.3s ease-in-out;
    }
    
    /* Ensure content area takes remaining space */
    #content-area {
      flex: 1;
      overflow: auto;
      min-height: 100vh;
    }
    
    .tab-panel {
      display: none;
    }
    
    .tab-panel.active {
      display: block;
    }
    
    .hidden {
      display: none !important;
    }
    
    /* Mobile sidebar styles */
    @media (max-width: 767px) {
      #sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        z-index: 50;
        transform: translateX(-100%);
      }
      
      #sidebar.open {
        transform: translateX(0);
      }
      
      #sidebar-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 49;
        display: none;
      }
      
      #sidebar.open + #sidebar-overlay {
        display: block;
      }
    }
  `;
  
  const styleSheet = document.createElement('style');
  styleSheet.id = 'app-styles';
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

// ============================================================================
// PUBLIC API
// ============================================================================

// Expose application functions
window.switchTab = switchTab;
window.toggleSidebar = toggleSidebar;
window.loadPage = loadPage;
window.closeModal = closeModal;
window.openSettingsModal = openSettingsModal;

// ADD: Expose network and sync functions globally
window.APP_CONNECTIVITY = {
  isOnline: isOnline,
  lastChange: null
};

window.safeApiCall = safeApiCall;
window.queueMessageForSync = queueMessageForSync;
window.clearMessageQueue = clearMessageQueue;
window.processQueuedMessages = processQueuedMessages;

// ADD: Helper function to check authentication safely
window.getCurrentUser = function() {
  // This function provides a safe way to get current user
  // It should be implemented in your authentication module
  if (typeof window.getAuthUser === 'function') {
    return window.getAuthUser();
  }
  return null;
};

// ADD: Safe function to get user ID
window.getCurrentUserId = function() {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  return user ? user.uid : null;
};

window.showChatArea = function() {
  const chatListContainer = document.getElementById('chatListContainer');
  const chatArea = document.getElementById('chatArea');
  const chatHeader = document.getElementById('chatHeader');
  
  if (chatListContainer && chatArea) {
    chatListContainer.classList.add('hidden');
    chatArea.classList.remove('hidden');
    
    if (chatHeader) {
      chatHeader.classList.remove('hidden');
    }
    
    updateChatAreaVisibility(currentTab);
  }
};

window.showChatList = function() {
  const chatListContainer = document.getElementById('chatListContainer');
  const chatArea = document.getElementById('chatArea');
  const chatHeader = document.getElementById('chatHeader');
  
  if (chatListContainer && chatArea) {
    chatListContainer.classList.remove('hidden');
    chatArea.classList.add('hidden');
    
    if (chatHeader) {
      chatHeader.classList.add('hidden');
    }
    
    updateChatAreaVisibility(currentTab);
  }
};

// ============================================================================
// STARTUP
// ============================================================================

// Initialize app when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM already loaded, initialize immediately
  setTimeout(initializeApp, 0);
}

console.log('Kynecta app.js loaded - Application shell ready');