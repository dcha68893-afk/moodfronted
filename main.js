// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/service-worker.js')
      .then(function(registration) {
        console.log('ServiceWorker registered successfully with scope: ', registration.scope);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('New service worker found');
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('New content is available!');
              // Show update notification to user
              showUpdateNotification();
            }
          });
        });
      })
      .catch(function(error) {
        console.log('ServiceWorker registration failed: ', error);
      });
  });

  // Listen for controlled page updates
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    console.log('Controller changed - reloading page');
    window.location.reload();
  });
}

function showUpdateNotification() {
  // Create a simple update notification
  if (confirm('A new version is available! Reload to see the latest features?')) {
    window.location.reload();
  }
}

// Initialize app features
document.addEventListener('DOMContentLoaded', function() {
  console.log('App initialized');
});