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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeDuplicateHeader, { once: true });
  } else {
    removeDuplicateHeader();
  }

  // group.html can recreate its chat DOM when a group is opened. Keep the
  // parent header as the only visible header even after those transitions.
  const observer = new MutationObserver(removeDuplicateHeader);
  const start = () => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
