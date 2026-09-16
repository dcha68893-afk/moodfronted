/* Functional group settings surface for the existing Groups panel. */
(function () {
  'use strict';
  if (window.__NECPRA_GROUP_SETTINGS_BRIDGE__) return;
  window.__NECPRA_GROUP_SETTINGS_BRIDGE__ = true;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const keyFor = id => `necpra_group_muted_${String(id)}`;
  let activeGroup = null;

  function close() { document.getElementById('necpraGroupSettingsModal')?.remove(); }

  function show(group) {
    activeGroup = group || activeGroup;
    if (!activeGroup?.id) return;
    close();
    const id = String(activeGroup.id);
    const muted = localStorage.getItem(keyFor(id)) === '1';
    const modal = document.createElement('div');
    modal.id = 'necpraGroupSettingsModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#0008;display:grid;place-items:center;padding:14px';
    modal.innerHTML = `
      <div style="width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#111);border:1px solid var(--border,#ddd);border-radius:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border,#ddd)">
          <strong>Group settings</strong><button type="button" data-gs-close style="border:0;background:transparent;color:inherit;font-size:22px">×</button>
        </div>
        <div style="padding:16px">
          <div style="font-weight:800;font-size:17px">${esc(activeGroup.name || activeGroup.groupName || 'Group')}</div>
          <div style="opacity:.7;margin-top:4px">${Number(activeGroup.participantCount ?? activeGroup.participants?.length ?? 0)} members</div>
          <label style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:20px;padding:12px;border:1px solid var(--border,#ddd);border-radius:12px">
            <span><b>Mute group notifications</b><small style="display:block;opacity:.65;margin-top:3px">Applies on this device until changed.</small></span>
            <input type="checkbox" data-gs-muted ${muted ? 'checked' : ''}>
          </label>
          <div style="margin-top:14px;font-size:12px;opacity:.65">Group ID: ${esc(id)}</div>
        </div>
      </div>`;
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-gs-close]')) close();
    });
    modal.querySelector('[data-gs-muted]').addEventListener('change', event => {
      if (event.target.checked) localStorage.setItem(keyFor(id), '1');
      else localStorage.removeItem(keyFor(id));
      window.dispatchEvent(new CustomEvent('necpra:group-notification-preference', { detail: { groupId: id, muted: event.target.checked } }));
      window.parent?.postMessage({ type:'GROUP_NOTIFICATION_PREFERENCE', source:'groups', payload:{ groupId:id, muted:event.target.checked } }, '*');
    });
    document.body.appendChild(modal);
  }

  window.addEventListener('message', event => {
    const data = event?.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'GROUP_PANEL_OPEN') activeGroup = data.payload || null;
    if (data.type === 'PARENT_GROUP_ACTION' && data.payload?.action === 'settings') show(data.payload.group || activeGroup);
  });
})();
