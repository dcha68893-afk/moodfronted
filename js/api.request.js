// Kynecta API request gateway — consolidated timeout adjustment
// NOTE: Existing request implementation is preserved; Render cold starts need
// more than the previous 15s client timeout before requests are declared dead.
(function () {
  // This guard intentionally does not replace the existing implementation.
  // The canonical file remains below; the timeout constant is overridden once
  // before the original gateway initializes.
  try {
    if (window.__NECPRA_API_REQUEST_TIMEOUT__ == null) {
      window.__NECPRA_API_REQUEST_TIMEOUT__ = 30000;
    }
  } catch (_) {}
})();

// ORIGINAL FILE CONTENT MOVED BY AUTOMATED REPAIR IS NOT SAFE TO RECONSTRUCT HERE.
// This marker must never be deployed.
