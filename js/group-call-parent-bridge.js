/* Group call bridge for the parent chat shell. The parent header remains the
 * single visible owner of voice/video controls; this bridge only gives those
 * controls the active group context when group.html is open. */
(function () {
  'use strict';
  if (window.__NECPRA_GROUP_CALL_PARENT_BRIDGE__) return;
  window.__NECPRA_GROUP_CALL_PARENT_BRIDGE__ = true;

  let activeGroup = null;
  let loading = null;
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');

  function loadGroupCall() {
    if (window.GroupCall) return Promise.resolve(window.GroupCall);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-parent-group-call]');
      if (existing) {
        const wait = () => window.GroupCall ? resolve(window.GroupCall) : setTimeout(wait, 50);
        wait(); return;
      }
      const s = document.createElement('script');
      s.src = '/js/group-call.js';
      s.async = false;
      s.dataset.parentGroupCall = 'true';
      s.onload = () => resolve(window.GroupCall);
      s.onerror = reject;
      (document.head || document.documentElement).appendChild(s);
    });
    return loading;
  }

  function buttonKind(button) {
    if (!button) return null;
    const text = normalize([
      button.id, button.className, button.getAttribute('aria-label'),
      button.getAttribute('title'), button.textContent
    ].join(' '));
    if (/(video|camera|videocall|video call)/.test(text)) return 'video';
    if (/(voice|audio|microphone|mic|voicecall|voice call)/.test(text)) return 'audio';
    return null;
  }

  function bindButtons() {
    if (!activeGroup) return;
    document.querySelectorAll('button,a,[role="button"]').forEach(el => {
      const kind = buttonKind(el);
      if (!kind || el.dataset.groupCallParentBound === '1') return;
      el.dataset.groupCallParentBound = '1';
      el.addEventListener('click', async event => {
        if (!activeGroup) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
          const call = await loadGroupCall();
          if (!call || typeof call.start !== 'function') throw new Error('Group calling is not available.');
          await call.start(kind, activeGroup);
        } catch (error) {
          console.error('[GroupCall] parent header start failed:', error);
          alert(error.message || 'Unable to start group call.');
        }
      }, true);
    });
  }

  window.addEventListener('message', event => {
    const data = event && event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'GROUP_PANEL_OPEN') {
      activeGroup = data.payload || null;
      bindButtons();
      return;
    }
    if (data.type === 'GROUP_PANEL_CLOSE' || data.type === 'GROUP_PANEL_CLOSED') {
      activeGroup = null;
    }
  });

  new MutationObserver(bindButtons).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindButtons, { once: true });
  else bindButtons();
})();
