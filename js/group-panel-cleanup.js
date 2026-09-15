/*
 * Group panel header consolidation + group chat feature loaders.
 */
(function () {
  'use strict';

  function load(src, attr) {
    if (document.querySelector(`script[${attr}]`)) return;
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.dataset[attr] = 'true';
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

  function initialize() {
    const chatbar = document.querySelector('#chat .chatbar');
    if (chatbar) chatbar.remove();
    load('/js/group-chat-features.js', 'groupChatFeatures');
    load('/js/group-message-cache.js', 'groupMessageCache');
    load('/js/group-media-render.js', 'groupMediaRender');
    installParentCallBridge();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();

  window.addEventListener('beforeunload', () => {
    try { window.parent?.postMessage({ type: 'GROUP_PANEL_CLOSE', source: 'groups' }, '*'); } catch (_) {}
  });
})();
