/*
 * Group panel header consolidation.
 * chat.html owns the visible module header and its group actions. group.html
 * still contains the legacy in-panel chatbar for backwards compatibility with
 * its local handlers, but it must not render a second header row or duplicate
 * voice/video/info controls.
 */
(function () {
  'use strict';

  function removeDuplicateHeader() {
    const chatbar = document.querySelector('#chat .chatbar');
    if (chatbar) chatbar.remove();
  }

  // Wait until group.html's own inline wiring has finished. Removing the
  // legacy buttons earlier would make its old local event-binding code see
  // missing elements and throw before the parent has a chance to take over.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeDuplicateHeader, { once: true });
  } else {
    removeDuplicateHeader();
  }
})();
