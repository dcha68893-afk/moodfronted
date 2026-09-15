/*
 * Group panel header consolidation + feature loader.
 * chat.html owns the visible module header and its group actions. group.html
 * must not render a second header row or duplicate voice/video/info controls.
 */
(function () {
  'use strict';

  function loadGroupChatFeatures() {
    if (document.querySelector('script[data-group-chat-features]')) return;
    const s = document.createElement('script');
    s.src = '/js/group-chat-features.js';
    s.async = false;
    s.dataset.groupChatFeatures = 'true';
    (document.head || document.documentElement).appendChild(s);
  }

  function installParentCallBridge() {
    try {
      if (!window.parent || window.parent === window) return;
      if (window.parent.document.querySelector('script[data-parent-group-call]')) return;
      const s = window.parent.document.createElement('script');
      s.src = '/js/group-call-parent-bridge.js';
      s.async = false;
      s.dataset.parentGroupCall = 'true';
      (window.parent.document.head || window.parent.document.documentElement).appendChild(s);
    } catch (error) {
      console.warn('[Groups] parent call bridge unavailable:', error.message);
    }
  }

  function removeDuplicateHeader() {
    const chatbar = document.querySelector('#chat .chatbar');
    if (chatbar) chatbar.remove();
    loadGroupChatFeatures();
    installParentCallBridge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeDuplicateHeader, { once: true });
  } else {
    removeDuplicateHeader();
  }

  window.addEventListener('beforeunload', () => {
    try { window.parent?.postMessage({ type: 'GROUP_PANEL_CLOSE', source: 'groups' }, '*'); } catch (_) {}
  });
})();
