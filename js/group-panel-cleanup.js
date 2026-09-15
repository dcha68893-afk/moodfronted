/* Group panel consolidation. The parent chat shell owns the visible group header/actions. */
(function () {
  'use strict';
  if (window.__NECPRA_GROUP_PANEL_CLEANUP__) return;
  window.__NECPRA_GROUP_PANEL_CLEANUP__ = true;

  function load(src, attr) {
    if (document.querySelector(`script[${attr}]`)) return;
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.dataset[attr] = 'true';
    s.onload = () => console.log('[Groups] loaded', src);
    s.onerror = () => console.error('[Groups] failed to load', src);
    (document.head || document.documentElement).appendChild(s);
  }

  function removeDuplicateShell() {
    // chat.html is the single owner of the group header, title, member count,
    // create/add-group action, call controls and back button. group.html must
    // only provide the embedded group content.
    document.querySelector('.top')?.remove();
    document.querySelector('#create')?.remove();
    document.querySelector('#chat .chatbar')?.remove();
  }

  function initialize() {
    removeDuplicateShell();
    load('/js/group-chat-features.js', 'groupChatFeatures');
    load('/js/group-message-cache.js', 'groupMessageCache');
    load('/js/group-media-render.js', 'groupMediaRender');
    installParentCallBridge();
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
  window.addEventListener('beforeunload', () => {
    try { window.parent?.postMessage({ type: 'GROUP_PANEL_CLOSE', source: 'groups' }, '*'); } catch (_) {}
  });
})();
