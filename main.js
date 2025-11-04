// Service Worker Registration for UniConnect
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/service-worker.js')
      .then(function(registration) {
        console.log('UniConnect ServiceWorker registered successfully with scope: ', registration.scope);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('New UniConnect service worker found');
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('New UniConnect content is available!');
              // Show update notification to user
              showUpdateNotification();
            }
          });
        });
      })
      .catch(function(error) {
        console.log('UniConnect ServiceWorker registration failed: ', error);
      });
  });

  // Listen for controlled page updates
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    console.log('UniConnect controller changed - reloading page');
    window.location.reload();
  });
}

function showUpdateNotification() {
  // Create a simple update notification
  if (confirm('UniConnect has been updated! Reload to see the latest features?')) {
    window.location.reload();
  }
}

// Initialize UniConnect specific features
document.addEventListener('DOMContentLoaded', function() {
  console.log('UniConnect app initialized for project: uniconnect-ee95c');
});