/**
 * Settings local-first UI patch.
 * Keeps the settings sync affordances and provides a reliable two-account
 * switcher even when authStorage.js was not loaded by settings.html.
 */
(function () {
  'use strict';
  if (window.__SETTINGS_UI_LOCAL_PATCH__) return;
  window.__SETTINGS_UI_LOCAL_PATCH__ = true;

  const ACCOUNT_SCRIPT = '/js/authStorage.js';
  let accountBootPromise = null;

  function loadAuthStorage() {
    if (window.AuthStorage) return Promise.resolve(window.AuthStorage);
    if (accountBootPromise) return accountBootPromise;
    accountBootPromise = new Promise(resolve => {
      const existing = document.querySelector(`script[src="${ACCOUNT_SCRIPT}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(window.AuthStorage || null), { once: true });
        existing.addEventListener('error', () => resolve(null), { once: true });
        setTimeout(() => resolve(window.AuthStorage || null), 1500);
        return;
      }
      const script = document.createElement('script');
      script.src = ACCOUNT_SCRIPT;
      script.onload = () => resolve(window.AuthStorage || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
    return accountBootPromise;
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function accounts() {
    try { return window.AuthStorage?.getSavedAccounts?.() || []; } catch (_) { return []; }
  }

  function ensureAccountModal() {
    let overlay = document.getElementById('savedAccountsModal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'savedAccountsModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10050;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `<div style="width:min(460px,100%);max-height:90vh;overflow:auto;background:var(--card-bg);color:var(--text-color);border:1px solid var(--border-color);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--border-color)">
        <div><strong style="font-size:18px">Accounts</strong><div style="font-size:12px;color:var(--text-secondary);margin-top:3px">Up to 2 accounts on this device</div></div>
        <button id="savedAccountsClose" aria-label="Close" style="border:0;background:transparent;color:var(--text-secondary);font-size:20px;cursor:pointer">×</button>
      </div>
      <div id="savedAccountsList" style="padding:14px 20px"></div>
      <div style="padding:14px 20px;border-top:1px solid var(--border-color);font-size:12px;color:var(--text-secondary)">Each account keeps its own credentials and message cache isolated.</div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
    overlay.querySelector('#savedAccountsClose').addEventListener('click', () => { overlay.style.display = 'none'; });
    return overlay;
  }

  function renderAccounts() {
    const overlay = ensureAccountModal();
    const list = overlay.querySelector('#savedAccountsList');
    const rows = accounts();
    if (!rows.length) {
      list.innerHTML = '<div style="padding:18px 4px;text-align:center;color:var(--text-secondary)">No saved accounts yet. Sign in to another account and it will appear here.</div>';
      return;
    }
    list.innerHTML = rows.map((a, i) => {
      const name = escapeHtml(a.displayName || a.username || a.email || `Account ${i + 1}`);
      const sub = escapeHtml(a.username ? `@${a.username}` : (a.email || `Account ${a.userId}`));
      const id = escapeHtml(a.userId);
      return `<button type="button" data-account-id="${id}" ${a.active ? 'disabled' : ''} style="width:100%;display:flex;align-items:center;gap:12px;padding:12px;margin:0 0 8px;border:1px solid ${a.active ? 'var(--primary-color)' : 'var(--border-color)'};border-radius:10px;background:${a.active ? 'var(--primary-color-light)' : 'var(--bg-color)'};color:var(--text-color);text-align:left;cursor:${a.active ? 'default' : 'pointer'}">
        <div style="width:42px;height:42px;border-radius:50%;overflow:hidden;background:var(--hover-color);display:flex;align-items:center;justify-content:center;flex:none">${a.avatar ? `<img src="${escapeHtml(a.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-user" style="color:var(--text-secondary)"></i>'}</div>
        <span style="flex:1;min-width:0"><strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</strong><small style="color:var(--text-secondary)">${sub}</small></span>
        <span style="font-size:12px;color:var(--primary-color);font-weight:600">${a.active ? 'Current' : 'Switch'}</span>
      </button>`;
    }).join('');
    list.querySelectorAll('[data-account-id]:not(:disabled)').forEach(btn => btn.addEventListener('click', () => {
      const result = window.AuthStorage?.switchAccount?.(btn.dataset.accountId);
      if (!result?.success) { window.alert(result?.error || 'Unable to switch account'); return; }
      overlay.style.display = 'none';
      window.location.reload();
    }));
  }

  async function injectAccountSwitcher() {
    const menu = document.getElementById('settingsMenu');
    if (!menu || document.getElementById('settingsAccountSwitcher')) return;
    await loadAuthStorage();
    const item = document.createElement('button');
    item.type = 'button';
    item.id = 'settingsAccountSwitcher';
    item.className = 'menu-item';
    item.style.cssText = 'width:100%;border:0;background:transparent;text-align:left;color:inherit;cursor:pointer';
    item.innerHTML = '<div class="menu-icon"><i class="fas fa-users"></i></div><div class="menu-text">Switch account</div><span class="menu-badge" id="settingsAccountCount">0/2</span>';
    menu.appendChild(item);
    item.addEventListener('click', async () => {
      await loadAuthStorage();
      renderAccounts();
      ensureAccountModal().style.display = 'flex';
    });
    updateAccountCount();
  }

  function updateAccountCount() {
    const badge = document.getElementById('settingsAccountCount');
    if (badge) badge.textContent = `${accounts().length}/2`;
  }

  function injectSyncRow() {
    if (document.getElementById('syncEnabledToggle')) return;
    let body = null;
    document.querySelectorAll('.section-header h3').forEach(h => {
      const text = (h.textContent || '').toLowerCase();
      if (text.includes('advanced') || text.includes('developer') || text.includes('connection')) {
        const section = h.closest('.settings-section');
        if (section) body = section.querySelector('.section-body');
      }
    });
    if (!body) return;
    const enabled = window.LocalStoreSettings?.getAll?.().syncEnabled === true;
    const row = document.createElement('div');
    row.className = 'setting-item';
    row.id = 'syncToggleRow';
    row.innerHTML = `<div class="setting-info"><div class="setting-label">☁ Multi-Device Sync</div><div class="setting-description">Sync settings across devices (optional).</div></div><div class="setting-control"><label class="toggle-switch"><input type="checkbox" id="syncEnabledToggle"${enabled ? ' checked' : ''}><span class="toggle-slider"></span></label></div>`;
    body.appendChild(row);
    document.getElementById('syncEnabledToggle').addEventListener('change', e => {
      if (typeof window.__updateSetting === 'function') window.__updateSetting('advanced', 'syncEnabled', e.target.checked);
    });
  }

  async function boot() {
    await loadAuthStorage();
    await injectAccountSwitcher();
    injectSyncRow();
    [700, 1600, 3000].forEach(ms => setTimeout(() => { injectAccountSwitcher(); injectSyncRow(); }, ms));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('settingsUIReady', () => { injectAccountSwitcher(); injectSyncRow(); });
  window.addEventListener('settingsSectionLoaded', () => setTimeout(injectSyncRow, 200));
  window.addEventListener('auth:account:switched', updateAccountCount);
})();