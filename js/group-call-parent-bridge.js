/* Group call + canonical group metadata bridge for the parent chat shell. */
(function () {
  'use strict';
  if (window.__NECPRA_GROUP_CALL_PARENT_BRIDGE__) return;
  window.__NECPRA_GROUP_CALL_PARENT_BRIDGE__ = true;
  let activeGroup = null, loading = null;
  const normalize = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  function loadGroupCall() {
    if (window.GroupCall) return Promise.resolve(window.GroupCall);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-parent-group-call]');
      if (existing) { const wait = () => window.GroupCall ? resolve(window.GroupCall) : setTimeout(wait, 50); wait(); return; }
      const s = document.createElement('script'); s.src = '/js/group-call.js'; s.async = false; s.dataset.parentGroupCall = 'true'; s.onload = () => resolve(window.GroupCall); s.onerror = reject; (document.head || document.documentElement).appendChild(s);
    });
    return loading;
  }
  function applyGroupHeader(group) {
    const count = Number(group?.participantCount ?? group?.participants?.length ?? 0);
    const name = String(group?.groupName || group?.name || 'Group');
    document.querySelectorAll('[data-group-member-count],[data-group-participant-count],[data-group-members]').forEach(el => { el.textContent = `${count} members`; });
    document.querySelectorAll('[data-group-name]').forEach(el => { el.textContent = name; });
    // Compatibility with the existing parent header markup: when it exposes
    // a plain "0 members" label, update only that visible label while the
    // group panel is active. This avoids creating a second header authority.
    document.querySelectorAll('#globalHeader *, .chat-header *, .module-header *').forEach(el => {
      if (el.children.length) return;
      const text = String(el.textContent || '').trim();
      if (/^\d+\s+members?$/i.test(text)) el.textContent = `${count} members`;
    });
    window.dispatchEvent(new CustomEvent('necpra:group-meta', { detail: { ...group, participantCount: count, name } }));
  }
  async function refreshGroupMeta(group) {
    const id = group?.id || group?.chatId; if (!id) return group;
    try {
      const base = window.__getApiBase?.(); if (!base) return group;
      const token = window.__kynToken || window.__accessToken || window.authToken || localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token');
      const r = await fetch(`${base}/chats/${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) return group;
      const d = await r.json().catch(() => ({}));
      const fresh = d?.data?.chat || d?.data || d;
      const participants = Array.isArray(fresh?.participants) ? fresh.participants : [];
      const merged = { ...group, ...fresh, participantCount: fresh?.participantCount ?? participants.length, participants };
      applyGroupHeader(merged);
      return merged;
    } catch (e) { console.warn('[Groups] header metadata refresh failed:', e.message); return group; }
  }
  function buttonKind(button) {
    if (!button) return null;
    const text = normalize([button.id, button.className, button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent].join(' '));
    if (/(video|camera|videocall|video call)/.test(text)) return 'video';
    if (/(voice|audio|microphone|mic|voicecall|voice call)/.test(text)) return 'audio';
    return null;
  }
  function bindButtons() {
    if (!activeGroup) return;
    document.querySelectorAll('button,a,[role="button"]').forEach(el => {
      const kind = buttonKind(el); if (!kind || el.dataset.groupCallParentBound === '1') return;
      el.dataset.groupCallParentBound = '1';
      el.addEventListener('click', async event => {
        if (!activeGroup) return;
        event.preventDefault(); event.stopImmediatePropagation();
        try { const call = await loadGroupCall(); if (!call || typeof call.start !== 'function') throw new Error('Group calling is not available.'); await call.start(kind, activeGroup); }
        catch (error) { console.error('[GroupCall] parent header start failed:', error); alert(error.message || 'Unable to start group call.'); }
      }, true);
    });
  }
  window.addEventListener('message', async event => {
    const data = event?.data; if (!data || typeof data !== 'object') return;
    if (data.type === 'GROUP_PANEL_OPEN') { activeGroup = await refreshGroupMeta(data.payload || {}); bindButtons(); return; }
    if (data.type === 'GROUP_PANEL_CLOSE' || data.type === 'GROUP_PANEL_CLOSED') { activeGroup = null; }
  });
  new MutationObserver(bindButtons).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindButtons, { once: true }); else bindButtons();
})();
