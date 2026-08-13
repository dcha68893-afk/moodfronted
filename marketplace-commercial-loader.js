/* Loads the commercial marketplace hardening layer after the existing marketplace stack. */
(function () {
  'use strict';
  if (window.__moodMarketplaceCommercialLoader) return;
  window.__moodMarketplaceCommercialLoader = true;

  function load() {
    if (document.querySelector('script[data-mood-commercial-hardening]')) return;
    var script = document.createElement('script');
    script.src = '/marketplace-commercial-hardening.js?v=1.0.0';
    script.async = false;
    script.dataset.moodCommercialHardening = '1';
    script.onload = function () {
      window.dispatchEvent(new CustomEvent('marketplace:commercial-layer-loaded'));
    };
    script.onerror = function () {
      console.warn('[Marketplace] Commercial hardening layer could not be loaded');
    };
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }
})();
