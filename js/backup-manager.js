/**
 * backup-manager.js — Encrypted message backup + restore for Kynecta
 *
 * Phase 12 requirements:
 *  - Encrypted backups (AES-256-GCM via WebCrypto)
 *  - Local backup (download .kbk file)
 *  - Cloud backup (upload to /api/devices/backup)
 *  - Restore from file or cloud
 *  - Conflict resolution (newer wins)
 *  - Progress reporting
 *
 * Backup format (.kbk):
 *  JSON envelope: { v:2, salt, iv, ct }
 *  ct = AES-256-GCM encrypted JSON of { messages, chats, starred, pinned, exportedAt }
 */

(function (global) {
  'use strict';

  const subtle   = global.crypto && global.crypto.subtle;
  const PBKDF2_I = 310000;

  function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

  function _apiBase() { return window.API_BASE_URL || window.BACKEND_URL || ''; }
  function _token() {
    return window.authToken || sessionStorage.getItem('kynecta_auth_token')
        || localStorage.getItem('kynecta_auth_token') || localStorage.getItem('authToken') || '';
  }
  function _headers() {
    const t = _token();
    return Object.assign({ 'Content-Type': 'application/json' }, t ? { 'Authorization': `Bearer ${t}` } : {});
  }

  // ── Derive encryption key from password ────────────────────────────────────
  async function _deriveKey(password, salt) {
    const pwKey = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_I, hash: 'SHA-256' },
      pwKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // ── Encrypt backup payload ─────────────────────────────────────────────────
  async function _encryptBackup(data, password) {
    const salt    = global.crypto.getRandomValues(new Uint8Array(32));
    const iv      = global.crypto.getRandomValues(new Uint8Array(12));
    const key     = await _deriveKey(password, salt);
    const plain   = new TextEncoder().encode(JSON.stringify(data));
    const ct      = await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, plain);
    return JSON.stringify({ v: 2, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
  }

  // ── Decrypt backup ────────────────────────────────────────────────────────
  async function _decryptBackup(envelopeStr, password) {
    const env = JSON.parse(envelopeStr);
    if (env.v !== 2) throw new Error('Unsupported backup version');
    const salt = unb64(env.salt);
    const iv   = unb64(env.iv);
    const ct   = unb64(env.ct);
    const key  = await _deriveKey(password, salt);
    const pt   = await subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // ── Collect data to backup from IndexedDB ────────────────────────────────
  async function _collectData(onProgress) {
    const localStore = global.KynectaLocalStore;
    let messages = [], chats = [];

    try {
      onProgress?.('Collecting chats…', 10);
      chats = await localStore?.getAllConversations?.() || [];
      onProgress?.('Collecting messages…', 30);

      // Collect messages from all chats
      for (const chat of chats) {
        const chatMsgs = await localStore?.getMessages?.(chat.id, { limit: 10000 }) || [];
        messages = messages.concat(chatMsgs);
      }
      onProgress?.('Preparing backup…', 70);
    } catch (e) {
      console.warn('[BackupManager] Data collection warning:', e.message);
    }

    // Also pull from backend
    try {
      const [starredResp, pinnedResp] = await Promise.all([
        fetch(`${_apiBase()}/api/messaging/messages/starred`, { headers: _headers(), credentials: 'include' }),
        fetch(`${_apiBase()}/api/messaging/chats/pinned`, { headers: _headers(), credentials: 'include' }),
      ]);
      const starred = starredResp.ok ? (await starredResp.json()).data?.starred : [];
      const pinned  = pinnedResp.ok  ? (await pinnedResp.json()).data?.pinned  : [];
      return { messages, chats, starred, pinned, exportedAt: new Date().toISOString(), version: 2 };
    } catch (_) {
      return { messages, chats, starred: [], pinned: [], exportedAt: new Date().toISOString(), version: 2 };
    }
  }

  // ── Create local backup (downloads .kbk file) ─────────────────────────────
  async function createLocalBackup(password, onProgress) {
    if (!subtle) throw new Error('WebCrypto not available');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');

    onProgress?.('Collecting data…', 5);
    const data      = await _collectData(onProgress);
    onProgress?.('Encrypting…', 75);
    const encrypted = await _encryptBackup(data, password);
    onProgress?.('Creating download…', 95);

    const blob = new Blob([encrypted], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `kynecta-backup-${Date.now()}.kbk`;
    a.click();
    URL.revokeObjectURL(url);

    onProgress?.('Done!', 100);
    return { messageCount: data.messages.length, chatCount: data.chats.length };
  }

  // ── Create cloud backup ───────────────────────────────────────────────────
  async function createCloudBackup(password, onProgress) {
    if (!subtle) throw new Error('WebCrypto not available');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');

    onProgress?.('Collecting data…', 5);
    const data      = await _collectData(onProgress);
    onProgress?.('Encrypting…', 60);
    const encrypted = await _encryptBackup(data, password);
    onProgress?.('Uploading…', 80);

    const resp = await fetch(`${_apiBase()}/api/devices/backup`, {
      method: 'POST',
      headers: _headers(),
      credentials: 'include',
      body: JSON.stringify({
        encryptedData: encrypted,
        messageCount:  data.messages.length,
        sizeBytes:     encrypted.length,
      }),
    });

    if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
    const result = await resp.json();
    onProgress?.('Done!', 100);
    return { backupKey: result.data?.backupKey, messageCount: data.messages.length };
  }

  // ── Restore from file ─────────────────────────────────────────────────────
  async function restoreFromFile(file, password, onProgress) {
    onProgress?.('Reading file…', 10);
    const text = await file.text();
    onProgress?.('Decrypting…', 30);

    let data;
    try {
      data = await _decryptBackup(text, password);
    } catch (e) {
      throw new Error('Incorrect password or corrupted backup file');
    }

    onProgress?.('Restoring messages…', 60);
    await _applyRestore(data, onProgress);
    onProgress?.('Done!', 100);
    return { messageCount: data.messages?.length || 0 };
  }

  // ── Restore from cloud ────────────────────────────────────────────────────
  async function restoreFromCloud(password, onProgress) {
    onProgress?.('Downloading backup…', 10);
    const resp = await fetch(`${_apiBase()}/api/devices/backup/download`, {
      headers: _headers(),
      credentials: 'include',
    });
    if (!resp.ok) throw new Error('No cloud backup found');

    const text = await resp.text();
    onProgress?.('Decrypting…', 40);

    let data;
    try {
      data = await _decryptBackup(text, password);
    } catch (e) {
      throw new Error('Incorrect password or corrupted backup');
    }

    onProgress?.('Restoring…', 70);
    await _applyRestore(data, onProgress);
    onProgress?.('Done!', 100);
    return { messageCount: data.messages?.length || 0 };
  }

  // ── Apply restored data ───────────────────────────────────────────────────
  async function _applyRestore(data, onProgress) {
    const localStore = global.KynectaLocalStore;
    if (!localStore) { console.warn('[BackupManager] LocalStore not available'); return; }

    // Restore messages (newer wins — compare updatedAt)
    const msgs = data.messages || [];
    let restored = 0;
    for (const msg of msgs) {
      try {
        const existing = await localStore.getMessage?.(msg.id);
        if (!existing || new Date(msg.updatedAt) > new Date(existing.updatedAt)) {
          await localStore.saveMessage?.(msg);
          restored++;
        }
      } catch (_) {}
      if (restored % 100 === 0) onProgress?.(`Restored ${restored}/${msgs.length} messages…`, 70 + (restored / msgs.length) * 20);
    }

    // Restore pinned chats via server
    const pinned = data.pinned || [];
    await Promise.allSettled(pinned.map(chatId =>
      fetch(`${_apiBase()}/api/messaging/chats/${chatId}/pin`, {
        method: 'PUT', headers: _headers(), credentials: 'include',
        body: JSON.stringify({ pinned: true }),
      })
    ));
  }

  // ── Show backup UI dialog ─────────────────────────────────────────────────
  function showBackupDialog() {
    let dialog = document.getElementById('kyn-backup-dialog');
    if (dialog) { dialog.style.display = 'flex'; return; }

    dialog = document.createElement('div');
    dialog.id = 'kyn-backup-dialog';
    dialog.innerHTML = `
      <div class="kyn-backup-inner">
        <h3>Message Backup</h3>
        <p>Your backup is encrypted — only you can read it with your password.</p>
        <input type="password" id="kyn-backup-pw" placeholder="Backup password (min 6 chars)" />
        <div class="kyn-backup-progress" id="kyn-backup-progress" style="display:none">
          <div class="kyn-backup-bar" id="kyn-backup-bar" style="width:0"></div>
          <span id="kyn-backup-status">…</span>
        </div>
        <div class="kyn-backup-actions">
          <button id="kyn-local-backup">⬇ Local Backup</button>
          <button id="kyn-cloud-backup">☁ Cloud Backup</button>
          <button id="kyn-restore-cloud">↩ Restore Cloud</button>
          <label class="kyn-restore-file-btn">
            📁 Restore File
            <input type="file" id="kyn-restore-file" accept=".kbk" style="display:none">
          </label>
        </div>
        <button id="kyn-backup-close">Close</button>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #kyn-backup-dialog { position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center; }
      .kyn-backup-inner { background:var(--bg-primary,#14141f);border-radius:16px;padding:24px;max-width:380px;width:90%;display:flex;flex-direction:column;gap:12px; }
      .kyn-backup-inner h3 { color:var(--text-primary);margin:0; }
      .kyn-backup-inner p { color:var(--text-muted,#888);font-size:13px;margin:0; }
      #kyn-backup-pw { width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--border-color,rgba(255,255,255,0.1));background:var(--bg-secondary,#1e1e2e);color:var(--text-primary); }
      .kyn-backup-progress { position:relative;height:6px;background:var(--bg-tertiary,#2a2a3e);border-radius:3px;overflow:hidden; }
      .kyn-backup-bar { height:100%;background:var(--accent-color);transition:width 0.3s;border-radius:3px; }
      .kyn-backup-actions { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
      .kyn-backup-actions button,.kyn-restore-file-btn { padding:9px 12px;border-radius:8px;border:1px solid var(--border-color,rgba(255,255,255,0.1));background:var(--bg-secondary,#1e1e2e);color:var(--text-primary);cursor:pointer;font-size:12px;text-align:center; }
      .kyn-backup-actions button:hover,.kyn-restore-file-btn:hover { background:var(--bg-tertiary,#2a2a3e); }
      #kyn-backup-close { background:var(--accent-color);color:#fff;border:none;border-radius:8px;padding:10px;cursor:pointer; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(dialog);

    const pw     = () => document.getElementById('kyn-backup-pw').value;
    const prog   = document.getElementById('kyn-backup-progress');
    const bar    = document.getElementById('kyn-backup-bar');
    const status = document.getElementById('kyn-backup-status');

    const onProg = (msg, pct) => {
      prog.style.display = 'block';
      bar.style.width    = `${pct}%`;
      status.textContent = msg;
    };

    const wrap = async (fn) => {
      try { await fn(); }
      catch (e) { alert('Error: ' + e.message); }
      finally { prog.style.display = 'none'; }
    };

    document.getElementById('kyn-local-backup').onclick = () => wrap(() => createLocalBackup(pw(), onProg));
    document.getElementById('kyn-cloud-backup').onclick = () => wrap(() => createCloudBackup(pw(), onProg));
    document.getElementById('kyn-restore-cloud').onclick = () => wrap(() => restoreFromCloud(pw(), onProg));
    document.getElementById('kyn-restore-file').onchange = (e) => {
      const file = e.target.files[0];
      if (file) wrap(() => restoreFromFile(file, pw(), onProg));
    };
    document.getElementById('kyn-backup-close').onclick = () => { dialog.style.display = 'none'; };
  }

  // ── Public API ────────────────────────────────────────────────────────────
  global.KynectaBackupManager = {
    createLocalBackup,
    createCloudBackup,
    restoreFromFile,
    restoreFromCloud,
    showBackupDialog,
  };

  console.log('[KynectaBackupManager] ✅ Loaded');

})(window);
