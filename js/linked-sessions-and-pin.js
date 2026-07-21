/**
 * linked-sessions-and-pin.js — Linked devices UI + Two-step PIN for MoodChat
 *
 * Phase 2 features:
 *   1. Linked Sessions — wires the existing (but empty) sessionsModal in
 *      settings.html to GET /api/devices + DELETE /api/devices/:deviceId
 *   2. Two-step verification PIN — adds a PIN-on-reregistration flow
 *      stored via POST /api/settings/registration-pin
 *
 * Injected into settings.html as a self-contained IIFE alongside the
 * existing P1 injectors (inject2FAPanel pattern).
 */

(function () {
  'use strict';

  const API_BASE = window.API_BASE_URL || '';

  function _token() {
    return localStorage.getItem('accessToken') ||
           localStorage.getItem('token')       ||
           sessionStorage.getItem('authToken') || '';
  }

  async function _apiFetch(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${_token()}`, 'Content-Type': 'application/json', ...opts.headers },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    // FIX (PIN audit): this used to return the parsed body unconditionally,
    // even on 401/expired-token or validation failures — callers only
    // checked for a thrown network error, so a failed save still showed
    // "PIN saved ✓" and the next status check silently read as "No PIN set"
    // (undefined enabled field), making it look like the save never
    // happened. Now a non-OK response or an explicit success:false/status:
    // 'error' body throws, so callers' catch blocks show the real reason.
    if (!res.ok || data.success === false || data.status === 'error') {
      const message = data.message || `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 1. LINKED SESSIONS (devices)
  // ════════════════════════════════════════════════════════════════════════════

  function _getPlatformIcon(platform) {
    const p = (platform || '').toLowerCase();
    if (p.includes('ios') || p.includes('iphone') || p.includes('ipad')) return 'fa-mobile-alt';
    if (p.includes('android')) return 'fa-mobile-alt';
    if (p.includes('mac'))  return 'fa-laptop';
    if (p.includes('win'))  return 'fa-desktop';
    if (p.includes('linux'))return 'fa-linux';
    return 'fa-globe';
  }

  function _timeAgo(iso) {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'Just now';
    if (mins < 60)  return `${mins}m ago`;
    if (mins < 1440)return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
  }

  async function _loadDevices() {
    const list = document.getElementById('sessionsList');
    if (!list) return;

    list.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--text-muted,#888)">
        <i class="fas fa-circle-notch fa-spin" style="font-size:22px"></i>
      </div>`;

    try {
      const data = await _apiFetch('/api/devices');
      const devices = data.data?.devices || [];

      if (!devices.length) {
        list.innerHTML = `
          <div style="text-align:center;padding:24px;color:var(--text-muted,#888);font-size:13px">
            <i class="fas fa-mobile-alt" style="font-size:28px;display:block;margin-bottom:8px"></i>
            No other linked devices
          </div>`;
        return;
      }

      list.innerHTML = devices.map(d => `
        <div class="session-item" data-device-id="${d.deviceId}" style="
          display:flex; align-items:center; gap:12px;
          padding:12px 0; border-bottom:1px solid var(--border-color,rgba(255,255,255,0.06));
        ">
          <div class="session-icon" style="
            width:42px; height:42px; border-radius:50%;
            background:var(--bg-tertiary,#2a2a3e);
            display:flex; align-items:center; justify-content:center;
            color:var(--text-muted,#888); font-size:18px; flex-shrink:0;
          ">
            <i class="fas ${_getPlatformIcon(d.platform)}"></i>
          </div>
          <div class="session-info" style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:600;color:var(--text-primary,#fff);
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${_esc(d.deviceName || 'Unknown Device')}
            </div>
            <div style="font-size:11px;color:var(--text-muted,#888);margin-top:2px">
              ${_esc(d.platform || 'Web')} · Last active ${_timeAgo(d.lastSeenAt)}
            </div>
          </div>
          <button onclick="window.__kynRenameDevice('${d.deviceId}', '${_esc(d.deviceName || '').replace(/'/g, "\\'")}')" style="
            background:none; border:1px solid var(--border-color,rgba(255,255,255,0.15));
            border-radius:8px; color:var(--text-secondary,#aaa);
            font-size:11px; padding:5px 10px; cursor:pointer;
            flex-shrink:0; margin-right:6px; transition:background 0.15s;
          " onmouseover="this.style.background='rgba(255,255,255,0.06)'"
             onmouseout="this.style.background='none'">
            Rename
          </button>
          <button onclick="window.__kynRevokeDevice('${d.deviceId}')" style="
            background:none; border:1px solid rgba(239,68,68,0.4);
            border-radius:8px; color:#ef4444;
            font-size:11px; padding:5px 10px; cursor:pointer;
            flex-shrink:0; transition:background 0.15s;
          " onmouseover="this.style.background='rgba(239,68,68,0.1)'"
             onmouseout="this.style.background='none'">
            Revoke
          </button>
        </div>
      `).join('');
    } catch (e) {
      list.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;font-size:13px">
        Failed to load devices: ${e.message}</div>`;
    }
  }

  window.__kynLoadDevices = _loadDevices;

  window.__kynRenameDevice = async function (deviceId, currentName) {
    const newName = prompt('Rename this device:', currentName || '');
    if (!newName || !newName.trim() || newName.trim() === currentName) return;
    try {
      await _apiFetch(`/api/devices/${deviceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ deviceName: newName.trim() }),
      });
      await _loadDevices();
      _toast('Device renamed');
    } catch (e) {
      _toast('Failed to rename device', true);
    }
  };

  window.__kynRevokeDevice = async function (deviceId) {
    if (!confirm('Remove this device? It will be signed out immediately.')) return;
    try {
      await _apiFetch(`/api/devices/${deviceId}`, { method: 'DELETE' });
      await _loadDevices();
      _toast('Device removed');
    } catch (e) {
      _toast('Failed to remove device', true);
    }
  };

  function _wireSessionsModal() {
    // Wire the existing "Terminate All Other Sessions" button
    const terminateBtn = document.getElementById('terminateAllSessionsBtn');
    if (terminateBtn && !terminateBtn._kynWired) {
      terminateBtn._kynWired = true;
      terminateBtn.addEventListener('click', async () => {
        if (!confirm('This will sign out all other devices. Continue?')) return;
        try {
          await _apiFetch('/api/devices/revoke-all', { method: 'DELETE' });
          await _loadDevices();
          _toast('All other sessions terminated');
        } catch (e) {
          _toast('Failed: ' + e.message, true);
        }
      });
    }

    // Wire close buttons
    ['closeSessionsModal', 'closeSessionsBtn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn && !btn._kynWired) {
        btn._kynWired = true;
        btn.addEventListener('click', () => {
          document.getElementById('sessionsModal')?.classList.remove('active');
        });
      }
    });
  }

  function _injectDevicesButton() {
    if (document.getElementById('kynLinkedDevicesBtn')) return;

    // Find security settings section content
    const secAnchor = document.querySelector('[data-content="security"]') ||
                      document.getElementById('changePasswordModal')?.parentElement ||
                      document.querySelector('.settings-main, .settings-content, .content-area');
    if (!secAnchor) return;

    const div = document.createElement('div');
    div.id = '__kynDevices';
    div.style.cssText = 'margin:16px 0;padding:16px;background:var(--bg-secondary,#1e1e2e);border-radius:14px;border:1px solid var(--border-color,rgba(255,255,255,0.06))';
    div.innerHTML = `
      <div style="font-weight:600;font-size:15px;color:var(--text-primary,#fff);margin-bottom:4px">
        <i class="fas fa-mobile-alt" style="color:var(--accent,#4F46E5);margin-right:8px"></i>
        Linked Devices
      </div>
      <div style="font-size:12px;color:var(--text-muted,#888);margin-bottom:12px">
        See all devices where you're signed in. Revoke access to any device remotely.
      </div>
      <button id="kynLinkedDevicesBtn" style="
        padding:10px 20px;border-radius:10px;border:none;
        background:var(--accent,#4F46E5);color:#fff;cursor:pointer;
        font-size:14px;font-weight:600;width:100%;
      ">Manage Linked Devices</button>
    `;
    secAnchor.insertBefore(div, secAnchor.firstChild);

    document.getElementById('kynLinkedDevicesBtn').addEventListener('click', () => {
      const modal = document.getElementById('sessionsModal');
      if (modal) {
        modal.classList.add('active');
        _loadDevices();
        _wireSessionsModal();
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2. TWO-STEP VERIFICATION PIN
  // ════════════════════════════════════════════════════════════════════════════

  function _injectTwoStepPin() {
    if (document.getElementById('__kynTwoStepPin')) return;

    const secAnchor = document.querySelector('[data-content="security"]') ||
                      document.getElementById('__kynDevices')?.parentElement ||
                      document.querySelector('.settings-main, .settings-content, .content-area');
    if (!secAnchor) return;

    const div = document.createElement('div');
    div.id = '__kynTwoStepPin';
    div.style.cssText = 'margin:16px 0;padding:16px;background:var(--bg-secondary,#1e1e2e);border-radius:14px;border:1px solid var(--border-color,rgba(255,255,255,0.06))';
    div.innerHTML = `
      <div style="font-weight:600;font-size:15px;color:var(--text-primary,#fff);margin-bottom:4px">
        <i class="fas fa-lock" style="color:var(--accent,#4F46E5);margin-right:8px"></i>
        Two-Step Verification PIN
      </div>
      <div style="font-size:12px;color:var(--text-muted,#888);margin-bottom:12px">
        Set a PIN that's required whenever you register your phone number again.
        Adds an extra layer of protection even if someone gets your verification code.
      </div>
      <div id="__kynPinStatus" style="font-size:12px;color:var(--text-muted,#888);margin-bottom:10px">
        Checking status…
      </div>
      <button id="__kynPinBtn" style="
        padding:10px 20px;border-radius:10px;border:none;
        background:var(--accent,#4F46E5);color:#fff;cursor:pointer;
        font-size:14px;font-weight:600;width:100%;
      ">Set Up PIN</button>
    `;
    secAnchor.appendChild(div);

    _loadPinStatus();
    document.getElementById('__kynPinBtn').addEventListener('click', _openPinModal);
  }

  async function _loadPinStatus() {
    const statusEl = document.getElementById('__kynPinStatus');
    const btn      = document.getElementById('__kynPinBtn');
    try {
      const data = await _apiFetch('/api/settings/registration-pin/status');
      const enabled = data.data?.enabled;
      if (statusEl) {
        statusEl.innerHTML = enabled
          ? '<i class="fas fa-check-circle" style="color:#22c55e"></i> PIN is active'
          : '<i class="fas fa-times-circle" style="color:#ef4444"></i> No PIN set';
      }
      if (btn) btn.textContent = enabled ? 'Change / Disable PIN' : 'Set Up PIN';
    } catch (e) {
      if (statusEl) {
        statusEl.innerHTML = e.status === 401
          ? '<i class="fas fa-exclamation-circle" style="color:#f59e0b"></i> Sign in again to check your PIN'
          : '<i class="fas fa-exclamation-circle" style="color:#f59e0b"></i> Could not check PIN status';
      }
    }
  }

  function _openPinModal() {
    const existing = document.getElementById('__kynPinModal');
    if (existing) { existing.remove(); }

    const overlay = document.createElement('div');
    overlay.id = '__kynPinModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:flex-end;justify-content:center';
    overlay.innerHTML = `
      <div style="background:var(--bg-primary,#141420);border-radius:20px 20px 0 0;
                  width:100%;max-width:480px;padding:24px 20px 36px">
        <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);text-align:center;margin:0 0 20px">
          Two-Step Verification PIN
        </h3>

        <label style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;
                      color:var(--text-muted,#888);display:block;margin-bottom:4px">
          6-digit PIN
        </label>
        <input id="__kynPinInput" type="password" inputmode="numeric" maxlength="6"
               pattern="[0-9]{6}" placeholder="••••••"
               style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;
                      background:var(--bg-secondary,#1e1e2e);
                      border:1px solid var(--border-color,rgba(255,255,255,0.1));
                      color:var(--text-primary,#fff);font-size:20px;
                      letter-spacing:8px;text-align:center;outline:none;margin-bottom:12px" />

        <label style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;
                      color:var(--text-muted,#888);display:block;margin-bottom:4px">
          Confirm PIN
        </label>
        <input id="__kynPinConfirm" type="password" inputmode="numeric" maxlength="6"
               pattern="[0-9]{6}" placeholder="••••••"
               style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;
                      background:var(--bg-secondary,#1e1e2e);
                      border:1px solid var(--border-color,rgba(255,255,255,0.1));
                      color:var(--text-primary,#fff);font-size:20px;
                      letter-spacing:8px;text-align:center;outline:none;margin-bottom:6px" />

        <div id="__kynPinErr" style="font-size:12px;color:#ef4444;min-height:16px;margin-bottom:14px"></div>

        <div style="display:flex;gap:10px">
          <button id="__kynPinCancel" style="flex:1;padding:12px;border-radius:10px;
            border:none;background:var(--bg-secondary,#1e1e2e);
            color:var(--text-muted,#888);font-size:14px;cursor:pointer">Cancel</button>
          <button id="__kynPinSave" style="flex:1;padding:12px;border-radius:10px;
            border:none;background:var(--accent,#4F46E5);color:#fff;
            font-size:14px;font-weight:600;cursor:pointer">Save PIN</button>
        </div>
        <button id="__kynPinDisable" style="
          display:block;width:100%;margin-top:10px;padding:10px;border-radius:10px;
          border:1px solid rgba(239,68,68,0.3);background:none;color:#ef4444;
          font-size:13px;cursor:pointer">Remove PIN</button>
      </div>
    `;

    overlay.querySelector('#__kynPinCancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#__kynPinSave').addEventListener('click', async () => {
      const pin     = overlay.querySelector('#__kynPinInput').value.trim();
      const confirm = overlay.querySelector('#__kynPinConfirm').value.trim();
      const errEl   = overlay.querySelector('#__kynPinErr');
      errEl.textContent = '';

      if (!/^\d{6}$/.test(pin)) { errEl.textContent = 'PIN must be exactly 6 digits'; return; }
      if (pin !== confirm)       { errEl.textContent = 'PINs do not match'; return; }
      // Block obvious PINs
      if (/^(\d)\1{5}$/.test(pin) || ['123456','654321','000000'].includes(pin)) {
        errEl.textContent = 'Choose a less obvious PIN'; return;
      }

      try {
        await _apiFetch('/api/settings/registration-pin', {
          method: 'POST',
          body: JSON.stringify({ pin }),
        });
        overlay.remove();
        _toast('PIN saved ✓');
        _loadPinStatus();
      } catch (e) {
        errEl.textContent = 'Failed to save PIN: ' + e.message;
      }
    });

    overlay.querySelector('#__kynPinDisable').addEventListener('click', async () => {
      if (!confirm('Remove your two-step verification PIN?')) return;
      try {
        await _apiFetch('/api/settings/registration-pin', { method: 'DELETE' });
        overlay.remove();
        _toast('PIN removed');
        _loadPinStatus();
      } catch (e) {
        _toast('Failed: ' + e.message, true);
      }
    });

    document.body.appendChild(overlay);
    setTimeout(() => overlay.querySelector('#__kynPinInput')?.focus(), 100);
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function _toast(msg, isErr = false) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%);
      background:${isErr ? '#ef4444' : '#22c55e'};color:#fff;
      padding:8px 18px;border-radius:20px;font-size:13px;z-index:20000;font-weight:600;
      animation:toastIn .2s ease;pointer-events:none`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    // _injectDevicesButton() intentionally not called: the native
    // #viewSessionsBtn in the Security section (settings-ui.js) now opens
    // this same device list — see settings-ui.js setupSecurityEventListeners.
    // Injecting a second "Manage Linked Devices" button next to it duplicated
    // the same action twice in one section.
    _injectTwoStepPin();
    _wireSessionsModal();

    // Re-inject when settings-core re-renders panels
    new MutationObserver(() => {
      _injectTwoStepPin();
    }).observe(document.body, { childList: true, subtree: true });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
