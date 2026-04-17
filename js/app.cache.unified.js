(function () {
  "use strict";

  if (window.AppCache && window.KynectaCache) {
    return;
  }

  console.warn("[CACHE] app.cache.unified.js loaded before app.cache.js; compatibility layer expects js/app.cache.js");
})();
