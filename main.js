// Service Worker Registration and PWA Management
class PWAManager {
  constructor() {
    this.registration = null;
    this.isUpdateAvailable = false;
    this.authState = {
      isAuthenticated: false,
      user: null,
      token: null
    };
    this.init();
  }

  async init() {
    await this.registerServiceWorker();
    this.setupAppListeners();
    this.checkAppVersion();
    this.checkAuthState(); // Check initial auth state
  }

  // Check initial authentication state
  async checkAuthState() {
    try {
      // Check for stored token
      const token = localStorage.getItem('auth_token');
      const userData = localStorage.getItem('user_data');
      
      if (token && userData) {
        // Verify token with backend
        const isValid = await this.validateToken(token);
        
        if (isValid) {
          this.authState = {
            isAuthenticated: true,
            user: JSON.parse(userData),
            token: token
          };
          this.updateUIForAuthState();
          console.log('kynecta: User authenticated from stored token');
        } else {
          this.clearAuthData();
        }
      } else {
        this.clearAuthData();
      }
    } catch (error) {
      console.error('kynecta: Error checking auth state:', error);
      this.clearAuthData();
    }
  }

  // Validate token with backend
  async validateToken(token) {
    try {
      const response = await fetch('/api/auth/verify', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('kynecta: Token validation failed:', error);
      return false;
    }
  }

  // Listen for login and logout events
  setupAuthListeners() {
    // Listen for localStorage changes (cross-tab communication)
    window.addEventListener('storage', (event) => {
      if (event.key === 'auth_token' || event.key === 'user_data') {
        console.log('kynecta: Auth storage changed, checking state');
        this.checkAuthState();
      }
    });

    // Listen for custom auth events
    window.addEventListener('user-login', (event) => {
      console.log('kynecta: User login event received');
      this.handleUserLogin(event.detail);
    });

    window.addEventListener('user-logout', () => {
      console.log('kynecta: User logout event received');
      this.handleUserLogout();
    });

    // Listen for auth state changes from API calls
    this.interceptAPICalls();
  }

  // Intercept API calls to detect auth state changes
  interceptAPICalls() {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // Clone response to read it without consuming
      const clonedResponse = response.clone();
      
      // Check for auth-related responses
      if (args[0].includes('/api/auth/')) {
        try {
          const data = await clonedResponse.json();
          
          if (args[0].includes('/api/auth/login') && response.ok) {
            // Login successful
            setTimeout(() => {
              this.checkAuthState();
            }, 100);
          }
          
          if (args[0].includes('/api/auth/logout') && response.ok) {
            // Logout successful
            setTimeout(() => {
              this.clearAuthData();
            }, 100);
          }
        } catch (error) {
          // Response is not JSON, that's okay
        }
      }
      
      return response;
    };
  }

  // Handle user login
  handleUserLogin(userData) {
    this.authState = {
      isAuthenticated: true,
      user: userData.user,
      token: userData.token
    };
    
    // Store auth data
    localStorage.setItem('auth_token', userData.token);
    localStorage.setItem('user_data', JSON.stringify(userData.user));
    
    // Update UI
    this.updateUIForAuthState();
    
    // Notify service worker
    this.sendMessageToServiceWorker({
      type: 'AUTH_STATE_CHANGE',
      isAuthenticated: true,
      userId: userData.user.id
    });
    
    console.log('kynecta: User logged in:', userData.user.email);
  }

  // Handle user logout
  handleUserLogout() {
    this.clearAuthData();
    
    // Notify service worker
    this.sendMessageToServiceWorker({
      type: 'AUTH_STATE_CHANGE',
      isAuthenticated: false,
      userId: null
    });
    
    console.log('kynecta: User logged out');
  }

  // Clear all auth data
  clearAuthData() {
    this.authState = {
      isAuthenticated: false,
      user: null,
      token: null
    };
    
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    
    this.updateUIForAuthState();
  }

  // Update UI based on auth state
  updateUIForAuthState() {
    const event = new CustomEvent('auth-state-changed', {
      detail: this.authState
    });
    window.dispatchEvent(event);
    
    // Update navigation and UI elements
    this.updateNavigation();
    this.updateUserProfile();
  }

  // Update navigation based on auth state
  updateNavigation() {
    const authElements = document.querySelectorAll('[data-auth]');
    
    authElements.forEach(element => {
      const authState = element.getAttribute('data-auth');
      
      if (authState === 'authenticated') {
        element.style.display = this.authState.isAuthenticated ? '' : 'none';
      } else if (authState === 'unauthenticated') {
        element.style.display = this.authState.isAuthenticated ? 'none' : '';
      }
    });
  }

  // Update user profile in UI
  updateUserProfile() {
    const profileElements = document.querySelectorAll('[data-user-profile]');
    
    profileElements.forEach(element => {
      const property = element.getAttribute('data-user-profile');
      
      if (this.authState.isAuthenticated && this.authState.user) {
        if (property === 'name') {
          element.textContent = this.authState.user.name || '';
        } else if (property === 'email') {
          element.textContent = this.authState.user.email || '';
        } else if (property === 'avatar') {
          element.src = this.authState.user.avatar || '/default-avatar.png';
        } else if (property === 'initials') {
          const name = this.authState.user.name || '';
          element.textContent = name.split(' ').map(n => n[0]).join('').toUpperCase();
        }
      } else {
        if (property === 'name' || property === 'email' || property === 'initials') {
          element.textContent = '';
        } else if (property === 'avatar') {
          element.src = '/default-avatar.png';
        }
      }
    });
  }

  // Service Worker Registration
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        this.registration = await navigator.serviceWorker.register('/service-worker.js');
        console.log('kynecta ServiceWorker registered successfully with scope: ', this.registration.scope);
        
        this.setupServiceWorkerEvents();
      } catch (error) {
        console.error('kynecta ServiceWorker registration failed: ', error);
      }
    }
  }

  setupServiceWorkerEvents() {
    if (!this.registration) return;

    // Update found event
    this.registration.addEventListener('updatefound', () => {
      const newWorker = this.registration.installing;
      console.log('kynecta: New service worker found');
      
      newWorker.addEventListener('statechange', () => {
        console.log(`kynecta: Service Worker state changed to ${newWorker.state}`);

        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('kynecta: New content is available!');
          this.isUpdateAvailable = true;
          this.showUpdateNotification();
        }
        
        if (newWorker.state === 'activated') {
          console.log('kynecta: New service worker activated');
          this.notifyServiceWorkerReady();
        }
      });
    });

    // Periodic update check
    setInterval(() => {
      this.registration?.update().catch(console.error);
    }, 60 * 60 * 1000); // Check every hour
  }

  // Listen for controller changes
  setupAppListeners() {
    // Setup auth listeners first
    this.setupAuthListeners();

    // Controller change - reload page
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      console.log('kynecta: Controller changed - reloading page');
      this.showReloadNotification();
    });

    // Online/offline events
    window.addEventListener('online', () => {
      console.log('kynecta: App came online');
      this.handleOnline();
    });

    window.addEventListener('offline', () => {
      console.log('kynecta: App went offline');
      this.handleOffline();
    });

    // Before install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallPrompt();
    });

    // App launched from PWA
    window.addEventListener('appinstalled', () => {
      console.log('kynecta: App installed successfully');
      this.trackAppInstall();
    });

    // Message events from service worker
    navigator.serviceWorker?.addEventListener('message', (event) => {
      this.handleServiceWorkerMessage(event);
    });
  }

  // Handle service worker messages
  handleServiceWorkerMessage(event) {
    const { data } = event;
    console.log('kynecta: Message from Service Worker:', data);

    switch (data.type) {
      case 'NAVIGATE_TO':
        this.navigateToPage(data.url);
        break;
      
      case 'FIREBASE_AUTH_SYNC':
        // Replaced with API-based auth sync
        this.syncAuthState();
        break;
      
      case 'FIRESTORE_SYNC':
        // Replaced with API-based data sync
        this.syncUserData();
        break;
      
      case 'MESSAGE_SYNC':
        this.syncPendingMessages();
        break;
      
      case 'OFFLINE_STATUS':
        this.updateOfflineStatus(data.status);
        break;
      
      case 'AUTH_REQUIRED':
        // Service worker detected need for authentication
        this.handleAuthRequired();
        break;
      
      default:
        console.log('kynecta: Unknown message type:', data.type);
    }
  }

  // Handle authentication required
  handleAuthRequired() {
    if (!this.authState.isAuthenticated) {
      // Redirect to login or show login modal
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      }
    }
  }

  // Sync auth state with backend
  async syncAuthState() {
    if (this.authState.isAuthenticated && this.authState.token) {
      try {
        const response = await fetch('/api/auth/sync', {
          headers: {
            'Authorization': `Bearer ${this.authState.token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('kynecta: Auth sync successful');
          return data;
        } else if (response.status === 401) {
          // Token expired or invalid
          this.clearAuthData();
          window.dispatchEvent(new CustomEvent('session-expired'));
        }
      } catch (error) {
        console.error('kynecta: Auth sync failed:', error);
      }
    }
    return null;
  }

  // Sync user data with backend
  async syncUserData() {
    if (!this.authState.isAuthenticated) return;
    
    try {
      const response = await fetch('/api/user/data', {
        headers: {
          'Authorization': `Bearer ${this.authState.token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('kynecta: User data sync successful');
        
        // Update local user data
        if (data.user) {
          this.authState.user = { ...this.authState.user, ...data.user };
          localStorage.setItem('user_data', JSON.stringify(this.authState.user));
          this.updateUserProfile();
        }
        
        return data;
      }
    } catch (error) {
      console.error('kynecta: User data sync failed:', error);
    }
    return null;
  }

  // Update notification
  showUpdateNotification() {
    // Create a stylish update notification
    if (this.isUpdateAvailable && !document.querySelector('.update-notification')) {
      const notification = document.createElement('div');
      notification.className = 'update-notification fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm';
      notification.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <span class="text-lg mr-2">🔄</span>
            <div>
              <p class="font-semibold">Update Available</p>
              <p class="text-sm opacity-90">New features are ready!</p>
            </div>
          </div>
          <button onclick="this.closest('.update-notification').remove(); window.pwaManager.reloadForUpdate()" 
                  class="ml-4 bg-white text-blue-600 px-3 py-1 rounded text-sm font-semibold hover:bg-blue-50">
            Reload
          </button>
        </div>
      `;
      document.body.appendChild(notification);

      // Auto-hide after 10 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 10000);
    }
  }

  // Reload notification
  showReloadNotification() {
    const notification = document.createElement('div');
    notification.className = 'reload-notification fixed bottom-4 right-4 bg-green-600 text-white p-3 rounded-lg shadow-lg z-50';
    notification.innerHTML = `
      <div class="flex items-center">
        <span class="text-lg mr-2">✅</span>
        <span>App updated successfully</span>
      </div>
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 3000);
  }

  // Install prompt
  showInstallPrompt() {
    // Only show if not already installed
    if (!this.isAppInstalled() && !localStorage.getItem('installPromptDismissed')) {
      const installPrompt = document.createElement('div');
      installPrompt.className = 'install-prompt fixed bottom-4 left-4 bg-purple-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm';
      installPrompt.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <span class="text-lg mr-2">📱</span>
            <div>
              <p class="font-semibold">Install kynecta</p>
              <p class="text-sm opacity-90">Use app offline</p>
            </div>
          </div>
          <div class="flex space-x-2 ml-4">
            <button onclick="window.pwaManager.installApp()" 
                    class="bg-white text-purple-600 px-3 py-1 rounded text-sm font-semibold hover:bg-purple-50">
              Install
            </button>
            <button onclick="window.pwaManager.dismissInstallPrompt()" 
                    class="bg-transparent border border-white text-white px-3 py-1 rounded text-sm hover:bg-white hover:bg-opacity-10">
              Later
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(installPrompt);
    }
  }

  // Install app
  async installApp() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('kynecta: User accepted install');
      } else {
        console.log('kynecta: User dismissed install');
      }
      
      this.deferredPrompt = null;
      this.dismissInstallPrompt();
    }
  }

  dismissInstallPrompt() {
    const prompt = document.querySelector('.install-prompt');
    if (prompt) {
      prompt.remove();
    }
    localStorage.setItem('installPromptDismissed', 'true');
    
    // Show again after 7 days
    setTimeout(() => {
      localStorage.removeItem('installPromptDismissed');
    }, 7 * 24 * 60 * 60 * 1000);
  }

  // Check if app is installed
  isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone ||
           document.referrer.includes('android-app://');
  }

  // Force update reload
  reloadForUpdate() {
    if (this.isUpdateAvailable) {
      // Tell service worker to skip waiting and reload
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    }
  }

  // Online/offline handlers
  handleOnline() {
    // Notify service worker we're back online
    this.sendMessageToServiceWorker({ type: 'ONLINE_STATUS', status: true });
    
    // Show online indicator
    this.showStatusIndicator('🟢 Online', 'bg-green-500');
    
    // Sync any pending data
    this.syncAllData();
  }

  handleOffline() {
    this.sendMessageToServiceWorker({ type: 'ONLINE_STATUS', status: false });
    this.showStatusIndicator('🔴 Offline', 'bg-red-500');
  }

  showStatusIndicator(text, bgColor) {
    let indicator = document.querySelector('.network-status');
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = `network-status fixed top-4 left-4 ${bgColor} text-white px-3 py-2 rounded-lg shadow-lg z-40 text-sm font-semibold`;
      document.body.appendChild(indicator);
    } else {
      indicator.className = `network-status fixed top-4 left-4 ${bgColor} text-white px-3 py-2 rounded-lg shadow-lg z-40 text-sm font-semibold`;
    }
    
    indicator.textContent = text;
    
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 3000);
  }

  // Data synchronization methods
  async syncPendingMessages() {
    console.log('kynecta: Syncing pending messages...');
    // Implement message sync logic with your backend API
    if (this.authState.isAuthenticated) {
      try {
        const response = await fetch('/api/messages/sync', {
          headers: {
            'Authorization': `Bearer ${this.authState.token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('kynecta: Messages synced:', data.count);
        }
      } catch (error) {
        console.error('kynecta: Message sync failed:', error);
      }
    }
  }

  async syncAllData() {
    if (this.authState.isAuthenticated) {
      await Promise.all([
        this.syncAuthState(),
        this.syncUserData(),
        this.syncPendingMessages()
      ]);
    }
  }

  // Communication with service worker
  sendMessageToServiceWorker(message) {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
  }

  notifyServiceWorkerReady() {
    this.sendMessageToServiceWorker({ 
      type: 'CLIENT_READY',
      timestamp: Date.now(),
      url: window.location.href,
      isAuthenticated: this.authState.isAuthenticated,
      userId: this.authState.user?.id
    });
  }

  updateOfflineStatus(status) {
    console.log('kynecta: Offline status updated:', status);
  }

  navigateToPage(url) {
    if (url && url !== window.location.pathname) {
      window.location.href = url;
    }
  }

  // Version checking
  async checkAppVersion() {
    try {
      const response = await fetch('/manifest.json?' + Date.now());
      const manifest = await response.json();
      const currentVersion = manifest.version || '1.0.0';
      
      const storedVersion = localStorage.getItem('appVersion');
      if (storedVersion && storedVersion !== currentVersion) {
        console.log(`kynecta: App updated from ${storedVersion} to ${currentVersion}`);
        this.onAppUpdated(storedVersion, currentVersion);
      }
      
      localStorage.setItem('appVersion', currentVersion);
    } catch (error) {
      console.log('kynecta: Could not check app version:', error);
    }
  }

  onAppUpdated(oldVersion, newVersion) {
    console.log(`kynecta: App updated from ${oldVersion} to ${newVersion}`);
    // Perform any update-specific tasks
    
    // Clear old auth data on major version changes
    if (oldVersion.split('.')[0] !== newVersion.split('.')[0]) {
      console.log('kynecta: Major version change, clearing old auth data');
      this.clearAuthData();
    }
  }

  // Analytics and tracking
  trackAppInstall() {
    console.log('kynecta: Tracking app installation');
    // Send to analytics
    this.sendMessageToServiceWorker({
      type: 'APP_INSTALLED',
      timestamp: Date.now()
    });
  }

  // Utility methods
  async getServiceWorkerVersion() {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        resolve(event.data);
      };
      
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage(
          { type: 'GET_VERSION' },
          [channel.port2]
        );
      } else {
        resolve({ version: 'unknown', firebase: 'unknown' });
      }
    });
  }
}

// Initialize app features
document.addEventListener('DOMContentLoaded', function() {
  // Initialize PWA Manager
  window.pwaManager = new PWAManager();
  
  console.log('kynecta: App initialized');
  
  // Check if we're in standalone mode
  if (window.pwaManager.isAppInstalled()) {
    document.documentElement.classList.add('standalone-mode');
    console.log('kynecta: Running in standalone mode');
  }
  
  // Display service worker version info
  setTimeout(async () => {
    const versionInfo = await window.pwaManager.getServiceWorkerVersion();
    console.log('kynecta: Service Worker Version:', versionInfo);
  }, 2000);
  
  // Add logout handler
  document.addEventListener('click', (event) => {
    if (event.target.matches('[data-action="logout"]')) {
      event.preventDefault();
      window.pwaManager.handleUserLogout();
    }
  });
});

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PWAManager;
}