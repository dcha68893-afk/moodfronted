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

  function removeDuplicateHeader() {
    const chatbar = document.querySelector('#chat .chatbar');
    if (chatbar) chatbar.remove();
    loadGroupChatFeatures();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeDuplicateHeader, { once: true });
  } else {
    removeDuplicateHeader();
  }
})();
