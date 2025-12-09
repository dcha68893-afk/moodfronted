<<<<<<< HEAD
// Service Worker Registration and PWA Management
class PWAManager {
  constructor() {
    this.registration = null;
    this.isUpdateAvailable = false;
    this.init();
  }

  async init() {
    await this.registerServiceWorker();
    this.setupAppListeners();
    this.checkAppVersion();
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
        this.syncFirebaseAuth();
        break;
      
      case 'FIRESTORE_SYNC':
        this.syncFirestoreData();
        break;
      
      case 'MESSAGE_SYNC':
        this.syncPendingMessages();
        break;
      
      case 'OFFLINE_STATUS':
        this.updateOfflineStatus(data.status);
        break;
      
      default:
        console.log('UniConnect: Unknown message type:', data.type);
    }
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
              <p class="font-semibold">Install UniConnect</p>
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
  async syncFirebaseAuth() {
    console.log('kynecta: Syncing Firebase Auth...');
    // Implement Firebase Auth sync logic
  }

  async syncFirestoreData() {
    console.log('kynecta: Syncing Firestore data...');
    // Implement Firestore sync logic
  }

  async syncPendingMessages() {
    console.log('kynecta: Syncing pending messages...');
    // Implement message sync logic
  }

  async syncAllData() {
    await Promise.all([
      this.syncFirebaseAuth(),
      this.syncFirestoreData(),
      this.syncPendingMessages()
    ]);
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
      url: window.location.href
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
});

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PWAManager;
=======
// Service Worker Registration and PWA Management
class PWAManager {
  constructor() {
    this.registration = null;
    this.isUpdateAvailable = false;
    this.init();
  }

  async init() {
    await this.registerServiceWorker();
    this.setupAppListeners();
    this.checkAppVersion();
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
        this.syncFirebaseAuth();
        break;
      
      case 'FIRESTORE_SYNC':
        this.syncFirestoreData();
        break;
      
      case 'MESSAGE_SYNC':
        this.syncPendingMessages();
        break;
      
      case 'OFFLINE_STATUS':
        this.updateOfflineStatus(data.status);
        break;
      
      default:
        console.log('UniConnect: Unknown message type:', data.type);
    }
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
              <p class="font-semibold">Install UniConnect</p>
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
  async syncFirebaseAuth() {
    console.log('kynecta: Syncing Firebase Auth...');
    // Implement Firebase Auth sync logic
  }

  async syncFirestoreData() {
    console.log('kynecta: Syncing Firestore data...');
    // Implement Firestore sync logic
  }

  async syncPendingMessages() {
    console.log('kynecta: Syncing pending messages...');
    // Implement message sync logic
  }

  async syncAllData() {
    await Promise.all([
      this.syncFirebaseAuth(),
      this.syncFirestoreData(),
      this.syncPendingMessages()
    ]);
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
      url: window.location.href
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
});

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PWAManager;
>>>>>>> 35a7dd29c215aeda26525e12658dd8bef5034d22
}