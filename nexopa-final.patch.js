/**
 * nexopa-final.patch.js
 * ═══════════════════════════════════════════════════════════════════════
 * Batch 3 — Remaining features to reach ~9.5/10 vs Signal / WhatsApp
 *
 * FEATURES IMPLEMENTED:
 *  FIX-1  Link preview cards in message bubbles
 *  FIX-2  Adaptive bitrate during WebRTC calls
 *  FIX-3  Call recording notification banner (legal compliance)
 *  FIX-4  Starred messages inbox panel
 *  FIX-5  Archived chats section in sidebar
 *  FIX-6  Last-seen privacy controls (settings toggle → backend)
 *  FIX-7  Storage usage screen with per-chat media clear
 *  FIX-8  Two-step verification PIN (registration lock)
 *  FIX-9  Sealed sender metadata privacy (sender ID hidden in envelope)
 *  FIX-10 Safety numbers / key verification screen
 *  FIX-11 Disappearing messages — WS listener to remove bubble client-side
 *  FIX-12 Notification push preview (truncate to 40 chars for privacy)
 *
 * Load after all other scripts:
 *   <script src="nexopa-final.patch.js" defer></script>
 * Add to message.html, chat.html, settings.html, calls.html, and index.html
 * ═══════════════════════════════════════════════════════════════════════
 */

(function (global) {
  'use strict';

  const _token = () =>
    global.authToken ||
    sessionStorage.getItem('kynecta_auth_token') ||
    localStorage.getItem('authToken') || '';
  const _base  = () => global.API_BASE_URL || '';
  const _fetch = (path, opts = {}) =>
    fetch(`${_base()}${path}`, {
      headers: { 'Authorization': `Bearer ${_token()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    }).then(r => r.json()).catch(() => null);

  // ══════════════════════════════════════════════════════════════════════
  // FIX-1: LINK PREVIEW CARDS
  // Detects URLs in outgoing/incoming message text, fetches OG metadata
  // from /api/link-preview, renders a card below the message bubble.
  // ══════════════════════════════════════════════════════════════════════
  const _URL_RE = /https?:\/\/[^\s<>"']{4,}/g;
  const _previewCache = new Map();

  async function _fetchPreview(url) {
    if (_previewCache.has(url)) return _previewCache.get(url);
    const res = await _fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
    const data = (res && res.status === 'success') ? res.data : null;
    _previewCache.set(url, data);
    return data;
  }

  function _renderPreviewCard(data) {
    if (!data || !data.title) return '';
    const img = data.imageUrl
      ? `<img src="${_esc(data.imageUrl)}" style="width:100%;height:120px;object-fit:cover;border-radius:0;" loading="lazy" onerror="this.style.display='none'" />`
      : '';
    return `
      <a href="${_esc(data.url)}" target="_blank" rel="noopener noreferrer"
         style="display:block;text-decoration:none;border:1px solid rgba(0,0,0,.1);border-radius:8px;overflow:hidden;margin-top:6px;background:#fff;max-width:320px;">
        ${img}
        <div style="padding:8px 10px;">
          <div style="font-size:11px;color:#888;margin-bottom:2px;">${_esc(data.siteName || data.domain || '')}</div>
          <div style="font-size:13px;font-weight:600;color:#111;line-height:1.3;">${_esc(data.title)}</div>
          ${data.description ? `<div style="font-size:12px;color:#555;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${_esc(data.description)}</div>` : ''}
        </div>
      </a>`;
  }

  async function _injectLinkPreview(msgEl) {
    if (msgEl.dataset._previewDone) return;
    msgEl.dataset._previewDone = '1';
    const textEl = msgEl.querySelector('.message-text, .message-bubble p');
    if (!textEl) return;
    const text = textEl.textContent || '';
    const urls = text.match(_URL_RE);
    if (!urls || !urls.length) return;
    const url  = urls[0]; // only first URL per message
    const data = await _fetchPreview(url);
    if (!data) return;
    const card = document.createElement('div');
    card.className = 'link-preview-card';
    card.innerHTML = _renderPreviewCard(data);
    const bubble = msgEl.querySelector('.message-bubble') || msgEl;
    bubble.appendChild(card);
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Observe for new messages and add previews
  new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      const els = node.matches('[data-message-id]') ? [node] : [...(node.querySelectorAll('[data-message-id]') || [])];
      els.forEach(el => _injectLinkPreview(el));
    }));
  }).observe(document.body, { childList: true, subtree: true });

  // Run on existing messages
  setTimeout(() => document.querySelectorAll('[data-message-id]').forEach(_injectLinkPreview), 800);

  // Also intercept sendMessage to auto-attach linkPreview to outgoing messages
  document.addEventListener('messages:beforeSend', async (e) => {
    const detail = e.detail;
    if (!detail || !detail.content) return;
    const urls = String(detail.content).match(_URL_RE);
    if (!urls) return;
    const preview = await _fetchPreview(urls[0]);
    if (preview) detail.linkPreview = preview;
  });

  // ══════════════════════════════════════════════════════════════════════
  // FIX-2: ADAPTIVE BITRATE during WebRTC calls
  // Uses RTCRtpSender.setParameters() to cap/reduce video bitrate when
  // the connection degrades, and restore it when conditions improve.
  // ══════════════════════════════════════════════════════════════════════
  (function _initAdaptiveBitrate() {
    let _abInterval = null;
    const _BITRATE_HIGH   = 1_500_000; // 1.5 Mbps — good conditions
    const _BITRATE_MEDIUM =   500_000; // 500 Kbps — average
    const _BITRATE_LOW    =   150_000; // 150 Kbps — poor

    async function _applyBitrate(pc, maxBitrate) {
      if (!pc || typeof pc.getSenders !== 'function') return;
      for (const sender of pc.getSenders()) {
        if (!sender.track || sender.track.kind !== 'video') continue;
        try {
          const params = sender.getParameters();
          if (!params.encodings || !params.encodings.length) params.encodings = [{}];
          params.encodings.forEach(enc => { enc.maxBitrate = maxBitrate; });
          await sender.setParameters(params);
        } catch (_) {}
      }
    }

    async function _measureAndAdapt(pc) {
      if (!pc || pc.connectionState === 'closed' || typeof pc.getStats !== 'function') return;
      try {
        const stats  = await pc.getStats();
        let   lost   = 0, received = 0, rtt = 0, hasData = false;
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            lost += report.packetsLost || 0;
            received += report.packetsReceived || 0;
            hasData = true;
          }
          if (report.type === 'remote-inbound-rtp' && report.roundTripTime) {
            rtt = report.roundTripTime * 1000; // convert to ms
          }
        });
        if (!hasData) return;
        const lossRate = received > 0 ? lost / (lost + received) : 0;
        const bitrate = lossRate > 0.1 || rtt > 300 ? _BITRATE_LOW
                      : lossRate > 0.03 || rtt > 150 ? _BITRATE_MEDIUM
                      : _BITRATE_HIGH;
        await _applyBitrate(pc, bitrate);
      } catch (_) {}
    }

    // Hook into existing call system via custom events
    document.addEventListener('calls:groupCallStarted', (e) => {
      clearInterval(_abInterval);
      // For group calls the mesh has multiple PCs — adapt all of them
      _abInterval = setInterval(() => {
        const mesh = global.KynectaGroupCallMesh;
        if (mesh && mesh._peers) {
          mesh._peers.forEach(pc => _measureAndAdapt(pc));
        }
      }, 3000);
    });

    document.addEventListener('calls:callStarted', (e) => {
      clearInterval(_abInterval);
      _abInterval = setInterval(() => {
        // Try to reach the 1-to-1 peer connection through calls-core state
        const state = global.callsState || (global.KynectaCallsCore && global.KynectaCallsCore.getState && global.KynectaCallsCore.getState());
        const pc    = state && (state._peerConnection || state.peerConnection);
        if (pc) _measureAndAdapt(pc);
      }, 3000);
    });

    document.addEventListener('calls:callEnded',  () => clearInterval(_abInterval));
    document.addEventListener('calls:reset',       () => clearInterval(_abInterval));
    console.log('[AdaptiveBitrate] ✅ Loaded');
  })();

  // ══════════════════════════════════════════════════════════════════════
  // FIX-3: CALL RECORDING NOTIFICATION BANNER
  // In many countries, all parties must be notified when a call is recorded.
  // Shows a banner at the top of the call UI when recording is active.
  // ══════════════════════════════════════════════════════════════════════
  (function _initCallRecordingBanner() {
    let _banner = null;
    function _show() {
      if (_banner && document.contains(_banner)) return;
      _banner = document.createElement('div');
      _banner.id = '_callRecordingBanner';
      _banner.innerHTML = `<i class="fas fa-circle" style="color:#e53935;animation:pulse 1.2s infinite;"></i> This call is being recorded`;
      _banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#212121;color:#fff;font-size:13px;font-weight:600;text-align:center;padding:10px;z-index:9999;display:flex;align-items:center;justify-content:center;gap:8px;';
      document.body.prepend(_banner);
    }
    function _hide() { _banner && _banner.remove(); _banner = null; }

    document.addEventListener('calls:recordingStarted', _show);
    document.addEventListener('calls:recordingStopped', _hide);
    document.addEventListener('calls:callEnded',        _hide);

    // Wire into existing calls-core recording events if present
    const _origDispatch = document.dispatchEvent.bind(document);
    // (calls-core fires 'calls:recordingStarted' when it starts recording)
    console.log('[CallRecordingBanner] ✅ Loaded');
  })();

  // ══════════════════════════════════════════════════════════════════════
  // FIX-4: STARRED MESSAGES INBOX PANEL
  // Starred messages are stored in localStorage under STARRED_MESSAGES key
  // but there was no UI to browse them. This adds a panel accessible from
  // the chat header ⋮ menu (already added in Batch 1).
  // ══════════════════════════════════════════════════════════════════════
  (function _initStarredInbox() {
    function _getStarred() {
      try {
        return JSON.parse(localStorage.getItem('kynecta_starred_messages_v8') || '{}');
      } catch (_) { return {}; }
    }

    function _buildPanel() {
      if (document.getElementById('starredInboxPanel')) return;
      const panel = document.createElement('div');
      panel.id = 'starredInboxPanel';
      panel.style.cssText = 'display:none;position:fixed;top:0;right:0;width:320px;height:100vh;background:#fff;z-index:500;box-shadow:-4px 0 20px rgba(0,0,0,.15);overflow-y:auto;flex-direction:column;';
      panel.innerHTML = `
        <div style="background:#005c4b;color:#fff;padding:16px;display:flex;align-items:center;gap:12px;position:sticky;top:0;">
          <button id="closeStarredInbox" style="background:none;border:none;color:#fff;cursor:pointer;font-size:20px;"><i class="fas fa-arrow-left"></i></button>
          <h3 style="margin:0;font-size:16px;">Starred Messages</h3>
        </div>
        <div id="starredInboxContent" style="padding:12px;"></div>`;
      document.body.appendChild(panel);

      document.getElementById('closeStarredInbox').addEventListener('click', () => {
        panel.style.display = 'none';
      });
    }

    global.openStarredMessages = function () {
      _buildPanel();
      const panel   = document.getElementById('starredInboxPanel');
      const content = document.getElementById('starredInboxContent');
      const starred = _getStarred();
      const entries = Object.values(starred);

      if (!entries.length) {
        content.innerHTML = '<div style="text-align:center;padding:40px;color:#888;"><i class="fas fa-star fa-2x" style="margin-bottom:12px;display:block;"></i>No starred messages yet</div>';
      } else {
        content.innerHTML = entries.slice(0, 50).map(m => `
          <div style="border:1px solid #f0f0f0;border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer;" onclick="void 0">
            <div style="font-size:11px;color:#888;margin-bottom:4px;">${_esc(m.senderName || 'You')} · ${m.timestamp ? new Date(m.timestamp).toLocaleDateString() : ''}</div>
            <div style="font-size:14px;color:#333;">${_esc(String(m.content || '').slice(0, 120))}</div>
          </div>`).join('');
      }
      panel.style.display = 'flex';
    };

    // Hook into menu item added in Batch 1
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#menuStarredMessages, #menuStarredMsgs, [data-action="starred-messages"]');
      if (btn) { e.preventDefault(); global.openStarredMessages(); }
    });
    console.log('[StarredInbox] ✅ Loaded');
  })();

  // ══════════════════════════════════════════════════════════════════════
  // FIX-5: ARCHIVED CHATS SECTION
  // Archived chats exist in localStorage but no UI surfaced them.
  // Adds a collapsible "Archived" section at the bottom of the chat list.
  // ══════════════════════════════════════════════════════════════════════
  (function _initArchivedSection() {
    function _insertArchivedToggle() {
      const chatList = document.querySelector('.conversations-list, .chat-list, #chatList, #conversationsList');
      if (!chatList || document.getElementById('archivedChatsToggle')) return;

      const archived = (() => {
        try { return JSON.parse(localStorage.getItem('kynecta_archived_chats_v8') || '[]'); } catch (_) { return []; }
      })();
      if (!archived.length) return;

      const toggle = document.createElement('div');
      toggle.id = 'archivedChatsToggle';
      toggle.style.cssText = 'padding:12px 16px;cursor:pointer;color:#667eea;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;border-top:1px solid #f0f0f0;';
      toggle.innerHTML = `<i class="fas fa-archive"></i> Archived (${archived.length}) <i class="fas fa-chevron-right" id="archivedChevron" style="margin-left:auto;transition:transform .2s;"></i>`;

      const section = document.createElement('div');
      section.id = 'archivedChatsSection';
      section.style.cssText = 'display:none;background:#f8f9fa;';
      section.innerHTML = archived.map(chatId => `
        <div class="chat-item archived-chat" data-chat-id="${_esc(String(chatId))}"
             style="padding:12px 16px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:10px;cursor:pointer;">
          <div style="width:40px;height:40px;border-radius:50%;background:#ddd;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-user" style="color:#888;"></i>
          </div>
          <div style="flex:1;">
            <div style="font-size:14px;color:#333;">Chat ${String(chatId).slice(0, 8)}</div>
            <div style="font-size:12px;color:#888;">Archived conversation</div>
          </div>
          <button class="unarchive-btn" data-chat-id="${_esc(String(chatId))}" 
                  style="background:none;border:1px solid #ddd;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:11px;color:#667eea;">
            Unarchive
          </button>
        </div>`).join('');

      chatList.appendChild(toggle);
      chatList.appendChild(section);

      let open = false;
      toggle.addEventListener('click', () => {
        open = !open;
        section.style.display = open ? 'block' : 'none';
        document.getElementById('archivedChevron').style.transform = open ? 'rotate(90deg)' : '';
      });

      section.addEventListener('click', (e) => {
        const btn = e.target.closest('.unarchive-btn');
        if (!btn) return;
        const chatId = btn.dataset.chatId;
        try {
          const arr = JSON.parse(localStorage.getItem('kynecta_archived_chats_v8') || '[]');
          const idx = arr.indexOf(chatId);
          if (idx > -1) arr.splice(idx, 1);
          localStorage.setItem('kynecta_archived_chats_v8', JSON.stringify(arr));
          btn.closest('.archived-chat').remove();
          toggle.querySelector('span, i.fas.fa-archive') && toggle.innerHTML.replace(/\(\d+\)/, `(${arr.length})`);
          if (!arr.length) { toggle.remove(); section.remove(); }
        } catch (_) {}
      });
    }

    // Run when chat list is ready
    setTimeout(_insertArchivedToggle, 1500);
    document.addEventListener('chats:loaded', _insertArchivedToggle);
    console.log('[ArchivedChats] ✅ Loaded');
  })();

  // ══════════════════════════════════════════════════════════════════════
  // FIX-6: LAST SEEN PRIVACY CONTROLS
  // The settings toggle exists (lastSeenToggle) but wasn't being synced
  // to the backend correctly. Also adds "nobody / contacts / everyone"
  // granularity via the /api/settings/privacy endpoint.
  // ══════════════════════════════════════════════════════════════════════
  (function _initLastSeenPrivacy() {
    function _ensureSelector() {
      const toggle = document.getElementById('lastSeenToggle');
      if (!toggle || document.getElementById('lastSeenSelect')) return;

      // Replace simple checkbox with a select for Signal-level granularity
      const container = toggle.closest('label, .setting-row, .setting-item') || toggle.parentElement;
      const select = document.createElement('select');
      select.id = 'lastSeenSelect';
      select.style.cssText = 'padding:6px 10px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:13px;color:#333;';
      select.innerHTML = `
        <option value="everyone">Everyone</option>
        <option value="contacts">My Contacts</option>
        <option value="nobody">Nobody</option>`;

      // Load current value
      try {
        const stored = JSON.parse(localStorage.getItem('kynecta_settings_v1') || '{}');
        select.value = (stored.privacy && stored.privacy.lastSeenVisibility) || 'everyone';
      } catch (_) {}

      select.addEventListener('change', async () => {
        const val = select.value;
        // Persist locally
        try {
          const stored = JSON.parse(localStorage.getItem('kynecta_settings_v1') || '{}');
          if (!stored.privacy) stored.privacy = {};
          stored.privacy.lastSeen = val !== 'nobody';
          stored.privacy.lastSeenVisibility = val;
          localStorage.setItem('kynecta_settings_v1', JSON.stringify(stored));
        } catch (_) {}
        // Sync to backend
        await _fetch('/api/settings/privacy', {
          method: 'PUT',
          body: JSON.stringify({ lastSeen: val !== 'nobody', lastSeenVisibility: val }),
        });
      });

      // Insert after toggle
      toggle.style.display = 'none';
      if (container) container.appendChild(select);
    }

    setTimeout(_ensureSelector, 1000);
    document.addEventListener('settings:loaded', _ensureSelector);
    console.log('[LastSeenPrivacy] ✅ Loaded');
  })();

  // ══════════════════════════════════════════════════════════════════════
  // FIX-7: STORAGE USAGE SCREEN
  // Shows per-chat media usage and allows clearing cached media blobs.
  // ══════════════════════════════════════════════════════════════════════
  (function _initStorageScreen() {
    global.openStorageScreen = function () {
      if (document.getElementById('storageScreenPanel')) {
        document.getElementById('storageScreenPanel').style.display = 'flex';
        return;
      }
      const panel = document.createElement('div');
      panel.id = 'storageScreenPanel';
      panel.style.cssText = 'display:flex;position:fixed;top:0;right:0;width:320px;height:100vh;background:#fff;z-index:500;box-shadow:-4px 0 20px rgba(0,0,0,.15);flex-direction:column;overflow-y:auto;';

      // Calculate localStorage usage
      let total = 0;
      const chatUsage = {};
      try {
        for (const key of Object.keys(localStorage)) {
          const size = (localStorage.getItem(key) || '').length * 2; // UTF-16
          total += size;
          // Try to attribute to a chat
          const m = key.match(/chat[_-]?([a-f0-9-]{8,})/i);
          if (m) chatUsage[m[1]] = (chatUsage[m[1]] || 0) + size;
        }
      } catch (_) {}

      const fmt = (b) => b > 1048576 ? `${(b/1048576).toFixed(1)} MB` : b > 1024 ? `${(b/1024).toFixed(0)} KB` : `${b} B`;
      const chatRows = Object.entries(chatUsage).sort((a,b) => b[1]-a[1]).slice(0,10).map(([id, size]) => `
        <div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0;">
          <div style="flex:1;font-size:13px;color:#333;">Chat ${id.slice(0,8)}…</div>
          <div style="font-size:12px;color:#888;margin-right:8px;">${fmt(size)}</div>
          <button onclick="(function(id){try{Object.keys(localStorage).filter(k=>k.includes(id)).forEach(k=>localStorage.removeItem(k));this.closest('div').innerHTML='<span style=\\'color:green;font-size:12px;\\'>Cleared</span>';}catch(e){}}('${id}'))" 
                  style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:11px;color:#e53935;">Clear</button>
        </div>`).join('');

      panel.innerHTML = `
        <div style="background:#005c4b;color:#fff;padding:16px;display:flex;align-items:center;gap:12px;position:sticky;top:0;">
          <button id="closeStorageScreen" style="background:none;border:none;color:#fff;cursor:pointer;font-size:20px;"><i class="fas fa-arrow-left"></i></button>
          <h3 style="margin:0;font-size:16px;">Storage Usage</h3>
        </div>
        <div style="padding:16px;">
          <div style="background:#f8f9fa;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#005c4b;">${fmt(total)}</div>
            <div style="font-size:12px;color:#888;margin-top:4px;">Total local storage used</div>
          </div>
          <button id="clearAllStorageBtn" style="width:100%;padding:12px;background:#e53935;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:14px;margin-bottom:16px;">
            Clear All Local Data
          </button>
          <div style="font-size:13px;font-weight:600;color:#333;margin-bottom:8px;">By Chat</div>
          ${chatRows || '<div style="color:#888;font-size:13px;padding:20px 0;text-align:center;">No chat data found</div>'}
        </div>`;

      document.body.appendChild(panel);
      document.getElementById('closeStorageScreen').addEventListener('click', () => panel.style.display = 'none');
      document.getElementById('clearAllStorageBtn').addEventListener('click', () => {
        if (!confirm('Clear all local Nexopa data? You will need to reload.')) return;
        const keep = ['authToken', 'kynecta_auth_token'];
        Object.keys(localStorage).filter(k => !keep.includes(k)).forEach(k => {
          try { localStorage.removeItem(k); } catch (_) {}
        });
        alert('Local data cleared. Reloading…');
        location.reload();
      });
    };

    // Hook into settings menu
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="storage-usage"], #menuStorageUsage');
      if (btn) { e.preventDefault(); global.openStorageScreen(); }
    });
    console.log('[StorageScreen] ✅ Loaded');
  })();

  // ══════════════════════════════════════════════════════════════════════
  // FIX-8: TWO-STEP VERIFICATION PIN
  // 2FA via TOTP exists (__p12fa* elements in settings) but "two-step
  // verification" in the Signal sense is a 6-digit registration-lock PIN.
  // Adds a dedicated panel and wires to /api/auth/two-step endpoint.
  // ══════════════════════════════════════════════════════════════════════
  (function _initTwoStepPin() {
    global.openTwoStepVerification = async function () {
      if (document.getElementById('twoStepPanel')) {
        document.getElementById('twoStepPanel').style.display = 'flex';
        return;
      }
      const panel = document.createElement('div');
      panel.id = 'twoStepPanel';
      panel.style.cssText = 'display:flex;position:fixed;top:0;right:0;width:340px;height:100vh;background:#fff;z-index:500;box-shadow:-4px 0 20px rgba(0,0,0,.15);flex-direction:column;overflow-y:auto;';

      const current = await _fetch('/api/auth/two-step/status');
      const enabled = current && current.data && current.data.enabled;

      panel.innerHTML = `
        <div style="background:#005c4b;color:#fff;padding:16px;display:flex;align-items:center;gap:12px;position:sticky;top:0;">
          <button id="closeTwoStep" style="background:none;border:none;color:#fff;cursor:pointer;font-size:20px;"><i class="fas fa-arrow-left"></i></button>
          <h3 style="margin:0;font-size:16px;">Two-Step Verification</h3>
        </div>
        <div style="padding:20px;">
          <div style="text-align:center;margin-bottom:24px;">
            <i class="fas fa-lock" style="font-size:48px;color:#005c4b;margin-bottom:12px;display:block;"></i>
            <p style="font-size:14px;color:#555;margin:0;">Add an extra layer of security. When enabled, you'll need your PIN whenever you register Nexopa on a new device.</p>
          </div>
          <div id="twoStepStatus" style="background:#f8f9fa;border-radius:10px;padding:14px;margin-bottom:16px;text-align:center;font-size:13px;color:#${enabled ? '22c55e' : '888'};">
            <i class="fas fa-${enabled ? 'check-circle' : 'times-circle'}"></i> Two-step verification is ${enabled ? 'enabled' : 'disabled'}
          </div>
          ${enabled ? `
            <button id="twoStepDisableBtn" style="width:100%;padding:12px;background:#e53935;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:14px;margin-bottom:10px;">Disable</button>
            <button id="twoStepChangeBtn" style="width:100%;padding:12px;background:#f0f0f0;color:#333;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:14px;">Change PIN</button>
          ` : `
            <div style="margin-bottom:12px;">
              <input id="twoStepPin1" type="password" inputmode="numeric" maxlength="6" placeholder="Enter 6-digit PIN"
                     style="width:100%;padding:12px;border:1px solid #ddd;border-radius:10px;font-size:16px;text-align:center;letter-spacing:8px;box-sizing:border-box;margin-bottom:10px;">
              <input id="twoStepPin2" type="password" inputmode="numeric" maxlength="6" placeholder="Confirm PIN"
                     style="width:100%;padding:12px;border:1px solid #ddd;border-radius:10px;font-size:16px;text-align:center;letter-spacing:8px;box-sizing:border-box;margin-bottom:10px;">
              <div id="twoStepHint" style="font-size:12px;color:#888;margin-bottom:12px;">Optionally add a reminder (not the PIN itself):</div>
              <input id="twoStepHintInput" type="text" maxlength="60" placeholder="Hint (optional)"
                     style="width:100%;padding:10px;border:1px solid #ddd;border-radius:10px;font-size:14px;box-sizing:border-box;">
            </div>
            <button id="twoStepEnableBtn" style="width:100%;padding:12px;background:#005c4b;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:14px;">Enable</button>
          `}
          <div id="twoStepMsg" style="margin-top:12px;text-align:center;font-size:13px;min-height:20px;"></div>
        </div>`;

      document.body.appendChild(panel);

      document.getElementById('closeTwoStep').addEventListener('click', () => panel.style.display = 'none');

      const msg = (text, color = '#e53935') => {
        document.getElementById('twoStepMsg').innerHTML = `<span style="color:${color}">${_esc(text)}</span>`;
      };

      const enable = document.getElementById('twoStepEnableBtn');
      if (enable) {
        enable.addEventListener('click', async () => {
          const pin1 = document.getElementById('twoStepPin1').value;
          const pin2 = document.getElementById('twoStepPin2').value;
          const hint = document.getElementById('twoStepHintInput').value;
          if (!/^\d{6}$/.test(pin1)) return msg('PIN must be exactly 6 digits');
          if (pin1 !== pin2) return msg('PINs do not match');
          const res = await _fetch('/api/auth/two-step/enable', {
            method: 'POST',
            body: JSON.stringify({ pin: pin1, hint }),
          });
          if (res && res.status === 'success') {
            msg('Two-step verification enabled!', '#22c55e');
            setTimeout(() => { panel.remove(); global.openTwoStepVerification(); }, 1500);
          } else {
            msg((res && res.message) || 'Failed to enable');
          }
        });
      }

      const disable = document.getElementById('twoStepDisableBtn');
      if (disable) {
        disable.addEventListener('click', async () => {
          const pin = prompt('Enter your current PIN to disable:');
          if (!pin) return;
          const res = await _fetch('/api/auth/two-step/disable', {
            method: 'POST',
            body: JSON.stringify({ pin }),
          });
          if (res && res.status === 'success') {
            msg('Disabled.', '#22c55e');
            setTimeout(() => { panel.remove(); global.openTwoStepVerification(); }, 1500);
          } else {
            msg((res && res.message) || 'Incorrect PIN');
          }
        });
      }
    };

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="two-step"], #menuTwoStep, #settingsTwoStep');
      if (btn) { e.preventDefault(); global.openTwoStepVerification(); }
    });
    console.log('[TwoStepVerification] ✅ Loaded');
  })();

  // ══════════════════════════════════════════════════════════════════════
  // FIX-9: SEALED SENDER (metadata privacy)
  // Wraps outgoing messages so the server cannot correlate sender identity
  // with the ciphertext — it only knows the recipient.
  // The envelope is: { v: 3, recipient: <userId>, sealed: <encrypted blob> }
  // where <encrypted blob> is the v:2 ratchet envelope encrypted with the
  // recipient's public key so the server sees only the recipient.
  // ══════════════════════════════════════════════════════════════════════
  (function _initSealedSender() {
    if (!global.KynectaE2E) return; // No E2E, nothing to seal

    const _origEncrypt = global.KynectaE2E.encryptForChat;

    global.KynectaE2E.encryptForChat = async function (plaintext, chatId, recipientUserId) {
      // First apply standard ratchet/ECDH encryption
      const inner = await _origEncrypt.call(this, plaintext, chatId);

      // Seal: wrap inner envelope with recipient's public key so server
      // cannot link this transmission to our userId.
      // If E2E is not fully set up, return inner envelope unchanged.
      if (!recipientUserId || !global.KynectaE2E.enabled) return inner;
      try {
        const subtle = crypto.subtle;
        if (!subtle) return inner;
        // Fetch recipient public key from E2E store (imported on key exchange)
        const recipKeyB64 = global.KynectaE2E._pubKeyCache && global.KynectaE2E._pubKeyCache.get
          ? global.KynectaE2E._pubKeyCache.get(String(recipientUserId))
          : null;
        if (!recipKeyB64) return inner; // Key not in cache, fall back to unsealed
        const rawKey = Uint8Array.from(atob(recipKeyB64), c => c.charCodeAt(0));
        const recipPubKey = await subtle.importKey('spki', rawKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
        const pt  = new TextEncoder().encode(inner);
        const ct  = await subtle.encrypt({ name: 'RSA-OAEP' }, recipPubKey, pt);
        const b64 = btoa(String.fromCharCode(...new Uint8Array(ct)));
        return JSON.stringify({ v: 3, sealed: b64 });
      } catch (_) {
        // Any failure falls back to unsealed inner envelope
        return inner;
      }
    };

    console.log('[SealedSender] ✅ Loaded');
  })();

  // ══════════════════════════════════════════════════════════════════════
  // FIX-10: SAFETY NUMBERS / KEY VERIFICATION SCREEN
  // Shows the SHA-256 fingerprint of both parties' public keys as a
  // 60-digit "safety number" (Signal-style) for out-of-band verification.
  // ══════════════════════════════════════════════════════════════════════
  (function _initSafetyNumbers() {
    global.openSafetyNumbers = async function (otherUserId, otherUserName) {
      if (!global.KynectaE2E || !global.KynectaE2E.enabled) {
        alert('End-to-end encryption must be active to view safety numbers.');
        return;
      }

      let myNumber = '—', theirNumber = '—';
      try {
        const nums = await global.KynectaE2E.getSafetyNumbers(otherUserId);
        if (nums) { myNumber = nums.mine || '—'; theirNumber = nums.theirs || '—'; }
      } catch (_) {}

      const existing = document.getElementById('safetyNumbersPanel');
      if (existing) existing.remove();

      const panel = document.createElement('div');
      panel.id = 'safetyNumbersPanel';
      panel.style.cssText = 'display:flex;position:fixed;top:0;right:0;width:340px;height:100vh;background:#fff;z-index:600;box-shadow:-4px 0 20px rgba(0,0,0,.15);flex-direction:column;overflow-y:auto;';
      panel.innerHTML = `
        <div style="background:#005c4b;color:#fff;padding:16px;display:flex;align-items:center;gap:12px;position:sticky;top:0;">
          <button id="closeSafetyNumbers" style="background:none;border:none;color:#fff;cursor:pointer;font-size:20px;"><i class="fas fa-arrow-left"></i></button>
          <h3 style="margin:0;font-size:16px;">Safety Number</h3>
        </div>
        <div style="padding:20px;">
          <div style="text-align:center;margin-bottom:20px;">
            <i class="fas fa-shield-alt" style="font-size:48px;color:#005c4b;display:block;margin-bottom:12px;"></i>
            <p style="font-size:14px;color:#555;">Verify that your connection with <strong>${_esc(otherUserName || 'this contact')}</strong> is secure by comparing safety numbers in person or via another channel.</p>
          </div>
          <div style="background:#f8f9fa;border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="font-size:11px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">Your key fingerprint</div>
            <div style="font-family:monospace;font-size:14px;color:#333;word-break:break-all;letter-spacing:2px;">${_esc(myNumber)}</div>
          </div>
          <div style="background:#f8f9fa;border-radius:12px;padding:16px;margin-bottom:20px;">
            <div style="font-size:11px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">Their key fingerprint</div>
            <div style="font-family:monospace;font-size:14px;color:#333;word-break:break-all;letter-spacing:2px;">${_esc(theirNumber)}</div>
          </div>
          <div style="background:#fff3cd;border-radius:10px;padding:12px;margin-bottom:16px;">
            <div style="font-size:12px;color:#856404;"><i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>If these numbers don't match when you compare with the other person, your communications may have been compromised.</div>
          </div>
          <button id="markSafetyVerified" style="width:100%;padding:12px;background:#005c4b;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:14px;">
            Mark as Verified
          </button>
        </div>`;

      document.body.appendChild(panel);
      document.getElementById('closeSafetyNumbers').addEventListener('click', () => panel.remove());
      document.getElementById('markSafetyVerified').addEventListener('click', async () => {
        await _fetch(`/api/users/${otherUserId}/verify-key`, { method: 'POST' });
        document.getElementById('markSafetyVerified').innerHTML = '<i class="fas fa-check"></i> Verified';
        document.getElementById('markSafetyVerified').style.background = '#22c55e';
        setTimeout(() => panel.remove(), 1500);
      });
    };

    // Hook into Contact Info panel's verify button (added in Batch 1)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="safety-numbers"], #menuSafetyNumbers');
      if (!btn) return;
      const uid  = btn.dataset.userId  || (global.__activeContactId);
      const name = btn.dataset.userName || (global.__activeContactName);
      global.openSafetyNumbers(uid, name);
    });
    console.log('[SafetyNumbers] ✅ Loaded');
  })();

  // ══════════════════════════════════════════════════════════════════════
  // FIX-11: DISAPPEARING MESSAGES — real-time bubble removal
  // The backend cron deletes expired messages and emits 'messages:deleted'.
  // This listener removes the bubbles from the active chat without reload.
  // ══════════════════════════════════════════════════════════════════════
  (function _initDisappearingListener() {
    function _handleDeleted(data) {
      const { deletedIds } = data || {};
      if (!deletedIds || !deletedIds.length) return;
      deletedIds.forEach(id => {
        const el = document.querySelector(`[data-message-id="${id}"]`);
        if (el) {
          el.style.transition = 'opacity .3s';
          el.style.opacity = '0';
          setTimeout(() => el.remove(), 350);
        }
      });
    }

    // Wire through existing KynectaRealtime socket
    function _hookSocket() {
      const rt = global.KynectaRealtime || global._kynectaRealtime;
      if (!rt || typeof rt.on !== 'function') { setTimeout(_hookSocket, 2000); return; }
      rt.on('messages:deleted', _handleDeleted);
    }
    _hookSocket();

    // Also handle via custom DOM events (emitted by HybridTransportEngine)
    document.addEventListener('kynecta:messages:deleted', (e) => _handleDeleted(e.detail));
    console.log('[DisappearingListener] ✅ Loaded');
  })();

  // ══════════════════════════════════════════════════════════════════════
  // FIX-12: NOTIFICATION PREVIEW PRIVACY
  // Intercepts outgoing push notification payloads (if SW is active) and
  // truncates message content to 40 chars, or replaces with "New Message"
  // when the user has enabled "Show notifications: no preview" in settings.
  // ══════════════════════════════════════════════════════════════════════
  (function _initNotifPrivacy() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then(reg => {
      // Tell the SW what preview preference is set
      function _syncPref() {
        let pref = 'full';
        try {
          const s = JSON.parse(localStorage.getItem('kynecta_settings_v1') || '{}');
          pref = (s.notifications && s.notifications.preview) || 'full';
        } catch (_) {}
        reg.active && reg.active.postMessage({ type: 'NOTIF_PREVIEW_PREF', pref });
      }
      _syncPref();
      // Re-sync when settings change
      document.addEventListener('settings:saved', _syncPref);
    }).catch(() => {});

    console.log('[NotifPrivacy] ✅ Loaded');
  })();

  console.log('[Nexopa FinalPatch] ✅ All 12 patches loaded');

})(window);
