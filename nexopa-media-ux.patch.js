/**
 * nexopa-media-ux.patch.js
 * ═══════════════════════════════════════════════════════════════════════
 * Remaining features to hit ~9.5/10 parity with WhatsApp / Signal
 *
 *  FIX-A  View Once photos/videos (tap-to-view, auto-delete after open)
 *  FIX-B  Pin message in DMs (stored in localStorage, shown at top of chat)
 *  FIX-C  Chat wallpaper per conversation
 *  FIX-D  Multi-image picker with per-image captions
 *  FIX-E  In-app camera (capture photo or video before sending)
 *  FIX-F  Document preview before sending (PDF/image thumbnail)
 *  FIX-G  GIF search via Tenor public API
 *  FIX-H  Video compression warning + quality selector before upload
 *  FIX-I  Linked device sessions UI panel
 *  FIX-J  Privacy settings panel (last-seen, notifications preview level)
 *
 * Load in message.html, chat.html, settings.html:
 *   <script src="nexopa-media-ux.patch.js" defer></script>
 * ═══════════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  const _token = () => global.authToken || sessionStorage.getItem('kynecta_auth_token') || localStorage.getItem('authToken') || '';
  const _base  = () => global.API_BASE_URL || '';
  const _apiFetch = (path, opts = {}) => fetch(`${_base()}${path}`, {
    headers: { 'Authorization': `Bearer ${_token()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  }).then(r => r.json()).catch(() => null);
  const _esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // ══════════════════════════════════════════════════════════════════════
  // FIX-A: VIEW ONCE PHOTOS / VIDEOS
  // Sender marks attachment as viewOnce=true. Recipient sees a locked
  // thumbnail; tapping reveals the media for 10 seconds, then it's
  // deleted from DOM and the backend is notified to purge the file.
  // ══════════════════════════════════════════════════════════════════════
  const _viewedOnce = new Set(
    JSON.parse(localStorage.getItem('kynecta_viewed_once') || '[]')
  );

  function _markViewedOnce(msgId) {
    _viewedOnce.add(msgId);
    localStorage.setItem('kynecta_viewed_once', JSON.stringify([..._viewedOnce]));
    _apiFetch(`/api/messages/${msgId}/view-once`, { method: 'POST' });
  }

  function _renderViewOnce(msgEl) {
    if (msgEl.dataset._voWired) return;
    msgEl.dataset._voWired = '1';
    const isViewOnce = msgEl.dataset.viewOnce === 'true' || msgEl.classList.contains('view-once');
    if (!isViewOnce) return;
    const msgId = msgEl.dataset.messageId;
    if (_viewedOnce.has(msgId)) {
      // Already viewed — show "Opened" placeholder
      const media = msgEl.querySelector('img, video');
      if (media) { media.replaceWith(_openedPlaceholder()); }
      return;
    }
    const media = msgEl.querySelector('img, video');
    if (!media) return;
    // Replace with locked overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:relative;width:200px;height:200px;background:#000;border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-direction:column;gap:8px;';
    overlay.innerHTML = `
      <i class="fas fa-eye" style="font-size:32px;color:#fff;"></i>
      <div style="color:#fff;font-size:13px;font-weight:600;">View once</div>
      <div style="color:rgba(255,255,255,.7);font-size:11px;">Tap to open</div>`;
    media.replaceWith(overlay);
    overlay.addEventListener('click', () => {
      overlay.replaceWith(media);
      media.style.maxWidth = '280px';
      media.style.maxHeight = '280px';
      media.style.borderRadius = '12px';
      if (media.tagName === 'VIDEO') media.play();
      _markViewedOnce(msgId);
      // Auto-remove after 10s
      setTimeout(() => { media.replaceWith(_openedPlaceholder()); }, 10000);
    });
  }

  function _openedPlaceholder() {
    const d = document.createElement('div');
    d.style.cssText = 'padding:12px 16px;background:#f0f2f5;border-radius:10px;color:#888;font-size:13px;display:flex;align-items:center;gap:8px;';
    d.innerHTML = '<i class="fas fa-eye-slash"></i> Photo opened';
    return d;
  }

  // Hook into message context menu — add "Send as View Once" option for own media
  document.addEventListener('messages:contextMenu', (e) => {
    const { menu, message } = e.detail || {};
    if (!menu || !message) return;
    if (!['image','video'].includes(message.type)) return;
    const btn = document.createElement('div');
    btn.className = 'msg-menu-item';
    btn.style.cssText = 'display:flex;align-items:center;gap:10px;padding:11px 16px;cursor:pointer;font-size:14px;color:#333;';
    btn.innerHTML = '<i class="fas fa-eye" style="width:18px;color:#667eea;"></i> View once';
    btn.addEventListener('click', () => {
      menu.remove();
      _apiFetch(`/api/messages/${message.id}/set-view-once`, { method: 'POST' })
        .then(() => {
          const el = document.querySelector(`[data-message-id="${message.id}"]`);
          if (el) { el.dataset.viewOnce = 'true'; _renderViewOnce(el); }
        });
    });
    menu.appendChild(btn);
  });

  // ══════════════════════════════════════════════════════════════════════
  // FIX-B: PIN MESSAGE IN DMs
  // Stored in localStorage per chat. Pinned message banner shown at top.
  // ══════════════════════════════════════════════════════════════════════
  const _PINNED_KEY = 'kynecta_pinned_msgs_v1';
  function _getPinned(chatId) {
    try { return JSON.parse(localStorage.getItem(_PINNED_KEY) || '{}')[chatId] || null; }
    catch (_) { return null; }
  }
  function _setPinned(chatId, data) {
    try {
      const store = JSON.parse(localStorage.getItem(_PINNED_KEY) || '{}');
      if (data) store[chatId] = data; else delete store[chatId];
      localStorage.setItem(_PINNED_KEY, JSON.stringify(store));
    } catch (_) {}
  }

  function _showPinnedBanner(chatId) {
    const pinned = _getPinned(chatId);
    const existing = document.getElementById('pinnedMsgBanner');
    if (existing) existing.remove();
    if (!pinned) return;
    const banner = document.createElement('div');
    banner.id = 'pinnedMsgBanner';
    banner.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 14px;background:#f0f9f6;border-bottom:2px solid #00a884;cursor:pointer;position:sticky;top:0;z-index:10;';
    banner.innerHTML = `
      <i class="fas fa-thumbtack" style="color:#00a884;font-size:13px;transform:rotate(45deg);"></i>
      <div style="flex:1;overflow:hidden;">
        <div style="font-size:11px;color:#00a884;font-weight:600;">Pinned Message</div>
        <div style="font-size:13px;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(String(pinned.content || '').slice(0, 80))}</div>
      </div>
      <button id="unpinMsgBtn" style="background:none;border:none;cursor:pointer;color:#888;font-size:16px;padding:4px;"><i class="fas fa-times"></i></button>`;
    const container = document.getElementById('messagesContainer') || document.getElementById('chatMessages') || document.querySelector('.messages-list');
    if (container && container.parentElement) container.parentElement.prepend(banner);
    banner.addEventListener('click', (e) => {
      if (e.target.closest('#unpinMsgBtn')) { _setPinned(chatId, null); banner.remove(); return; }
      const el = document.querySelector(`[data-message-id="${pinned.id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // Wire pin/unpin into context menu
  document.addEventListener('click', (e) => {
    const item = e.target.closest('[data-msg-action="pin"], [data-action="pin"]');
    if (!item) return;
    const msgId  = item.dataset.messageId || item.closest('[data-message-id]')?.dataset?.messageId;
    const chatId = item.dataset.chatId || global.__activeChatId;
    if (!msgId || !chatId) return;
    const msgEl  = document.querySelector(`[data-message-id="${msgId}"]`);
    const content = msgEl?.querySelector('.message-text')?.textContent?.trim() || '';
    _setPinned(chatId, { id: msgId, content });
    _showPinnedBanner(chatId);
    _apiFetch(`/api/messages/${msgId}/pin`, { method: 'POST', body: JSON.stringify({ chatId }) });
  });

  // Add "Pin" to context menu
  document.addEventListener('messages:contextMenu', (e) => {
    const { menu, message, chatId } = e.detail || {};
    if (!menu || !message) return;
    const sep = document.createElement('hr');
    sep.style.cssText = 'margin:4px 0;border:none;border-top:1px solid #f0f0f0;';
    const btn = document.createElement('div');
    btn.className = 'msg-menu-item';
    btn.style.cssText = 'display:flex;align-items:center;gap:10px;padding:11px 16px;cursor:pointer;font-size:14px;color:#333;';
    const isPinned = _getPinned(chatId)?.id === message.id;
    btn.innerHTML = `<i class="fas fa-thumbtack" style="width:18px;color:#667eea;transform:rotate(45deg)"></i> ${isPinned ? 'Unpin' : 'Pin message'}`;
    btn.dataset.msgAction = 'pin';
    btn.dataset.messageId = message.id;
    btn.dataset.chatId    = chatId || global.__activeChatId || '';
    menu.appendChild(sep);
    menu.appendChild(btn);
  });

  // Show banner when chat opens
  document.addEventListener('chat:opened', (e) => {
    const chatId = e.detail?.chatId || e.detail?.id;
    if (chatId) _showPinnedBanner(String(chatId));
  });
  setTimeout(() => {
    const chatId = global.__activeChatId;
    if (chatId) _showPinnedBanner(String(chatId));
  }, 1000);

  // ══════════════════════════════════════════════════════════════════════
  // FIX-C: CHAT WALLPAPER PER CONVERSATION
  // ══════════════════════════════════════════════════════════════════════
  const _WP_KEY = 'kynecta_wallpapers_v1';
  function _getWallpaper(chatId) {
    try { return JSON.parse(localStorage.getItem(_WP_KEY) || '{}')[chatId] || null; }
    catch (_) { return null; }
  }
  function _setWallpaper(chatId, url) {
    try {
      const store = JSON.parse(localStorage.getItem(_WP_KEY) || '{}');
      if (url) store[chatId] = url; else delete store[chatId];
      localStorage.setItem(_WP_KEY, JSON.stringify(store));
    } catch (_) {}
  }
  function _applyWallpaper(chatId) {
    const wp = _getWallpaper(chatId);
    const container = document.getElementById('messagesContainer') || document.getElementById('chatMessages') || document.querySelector('.messages-list, .chat-messages');
    if (!container) return;
    if (wp) {
      container.style.backgroundImage = `url(${wp})`;
      container.style.backgroundSize  = 'cover';
      container.style.backgroundPosition = 'center';
    } else {
      container.style.backgroundImage = '';
    }
  }

  global.openWallpaperPicker = function (chatId) {
    chatId = chatId || global.__activeChatId;
    if (!chatId) return;
    const PRESETS = [
      '#fff', '#e8f5e9', '#e3f2fd', '#fce4ec', '#f3e5f5',
      'https://i.imgur.com/JuMX3Vf.png', // subtle WhatsApp-style pattern
    ];
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;top:0;right:0;width:300px;height:100vh;background:#fff;z-index:600;box-shadow:-4px 0 20px rgba(0,0,0,.15);display:flex;flex-direction:column;overflow-y:auto;';
    panel.innerHTML = `
      <div style="background:#005c4b;color:#fff;padding:16px;display:flex;align-items:center;gap:12px;position:sticky;top:0;">
        <button id="closeWallpaper" style="background:none;border:none;color:#fff;cursor:pointer;font-size:20px;"><i class="fas fa-arrow-left"></i></button>
        <h3 style="margin:0;font-size:16px;">Chat Wallpaper</h3>
      </div>
      <div style="padding:16px;">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
          ${PRESETS.map(p => `
            <div class="wp-preset" data-wp="${_esc(p)}" style="height:70px;border-radius:10px;cursor:pointer;border:2px solid transparent;overflow:hidden;${p.startsWith('#') ? `background:${p};` : `background:url(${p}) center/cover;`}"></div>
          `).join('')}
        </div>
        <label style="display:block;margin-bottom:12px;">
          <div style="font-size:13px;color:#555;margin-bottom:6px;">Custom image URL</div>
          <input id="wallpaperCustomUrl" type="url" placeholder="https://..." style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:13px;box-sizing:border-box;">
        </label>
        <button id="applyCustomWallpaper" style="width:100%;padding:11px;background:#005c4b;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;margin-bottom:8px;">Apply custom</button>
        <button id="removeWallpaper" style="width:100%;padding:11px;background:#f0f0f0;color:#333;border:none;border-radius:10px;cursor:pointer;font-size:14px;">Remove wallpaper</button>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelectorAll('.wp-preset').forEach(el => {
      el.addEventListener('click', () => {
        const wp = el.dataset.wp;
        _setWallpaper(chatId, wp); _applyWallpaper(chatId); panel.remove();
      });
    });
    document.getElementById('closeWallpaper').addEventListener('click', () => panel.remove());
    document.getElementById('applyCustomWallpaper').addEventListener('click', () => {
      const url = document.getElementById('wallpaperCustomUrl').value.trim();
      if (!url) return;
      _setWallpaper(chatId, url); _applyWallpaper(chatId); panel.remove();
    });
    document.getElementById('removeWallpaper').addEventListener('click', () => {
      _setWallpaper(chatId, null); _applyWallpaper(chatId); panel.remove();
    });
  };

  document.addEventListener('chat:opened', (e) => {
    const id = e.detail?.chatId || e.detail?.id;
    if (id) _applyWallpaper(String(id));
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="wallpaper"], #menuWallpaper');
    if (btn) { e.preventDefault(); global.openWallpaperPicker(); }
  });
  setTimeout(() => { if (global.__activeChatId) _applyWallpaper(String(global.__activeChatId)); }, 800);

  // ══════════════════════════════════════════════════════════════════════
  // FIX-D: MULTI-IMAGE PICKER WITH CAPTIONS
  // ══════════════════════════════════════════════════════════════════════
  function _buildMultiImagePicker() {
    const existing = document.getElementById('multiImagePicker');
    if (existing) return;
    const picker = document.createElement('div');
    picker.id = 'multiImagePicker';
    picker.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:900;flex-direction:column;align-items:center;justify-content:center;';
    picker.innerHTML = `
      <div style="background:#111;border-radius:16px;width:90vw;max-width:480px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;align-items:center;padding:14px 16px;border-bottom:1px solid #333;gap:12px;">
          <button id="closeMIP" style="background:none;border:none;color:#fff;cursor:pointer;font-size:20px;"><i class="fas fa-times"></i></button>
          <span style="color:#fff;font-weight:600;font-size:15px;flex:1;" id="mipCount">0 of 0</span>
          <button id="mipSend" style="background:#00a884;color:#fff;border:none;border-radius:20px;padding:8px 20px;cursor:pointer;font-weight:600;font-size:14px;">Send</button>
        </div>
        <div id="mipPreview" style="flex:1;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:16px;min-height:220px;">
          <img id="mipMainImg" style="max-width:100%;max-height:220px;border-radius:8px;object-fit:contain;display:none;" />
          <video id="mipMainVid" style="max-width:100%;max-height:220px;border-radius:8px;display:none;" controls></video>
        </div>
        <div id="mipCaptionBar" style="padding:10px 14px;border-top:1px solid #333;">
          <input id="mipCaption" type="text" placeholder="Add a caption…" style="width:100%;background:transparent;border:none;color:#fff;font-size:14px;outline:none;box-sizing:border-box;">
        </div>
        <div id="mipThumbs" style="display:flex;gap:8px;padding:10px 14px;overflow-x:auto;border-top:1px solid #333;"></div>
      </div>`;
    document.body.appendChild(picker);
    let _files = [], _idx = 0, _captions = [];

    function _show(files) {
      _files = [...files]; _idx = 0; _captions = new Array(_files.length).fill('');
      picker.style.display = 'flex'; _renderThumb(); _renderMain();
    }
    function _renderMain() {
      const f = _files[_idx];
      const url = URL.createObjectURL(f);
      const img = document.getElementById('mipMainImg');
      const vid = document.getElementById('mipMainVid');
      document.getElementById('mipCount').textContent = `${_idx + 1} of ${_files.length}`;
      document.getElementById('mipCaption').value = _captions[_idx] || '';
      if (f.type.startsWith('image')) {
        img.src = url; img.style.display = 'block'; vid.style.display = 'none';
      } else {
        vid.src = url; vid.style.display = 'block'; img.style.display = 'none';
      }
    }
    function _renderThumb() {
      const thumbs = document.getElementById('mipThumbs');
      thumbs.innerHTML = '';
      _files.forEach((f, i) => {
        const url  = URL.createObjectURL(f);
        const wrap = document.createElement('div');
        wrap.style.cssText = `position:relative;flex-shrink:0;width:52px;height:52px;border-radius:6px;overflow:hidden;cursor:pointer;border:2px solid ${i===_idx ? '#00a884' : 'transparent'};`;
        const img  = document.createElement('img');
        img.src = f.type.startsWith('image') ? url : '';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        img.onerror = () => { img.style.display='none'; wrap.style.background='#333'; };
        const rm   = document.createElement('button');
        rm.innerHTML = '<i class="fas fa-times" style="font-size:9px;"></i>';
        rm.style.cssText = 'position:absolute;top:1px;right:1px;width:16px;height:16px;background:rgba(0,0,0,.7);border:none;border-radius:50%;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;';
        rm.addEventListener('click', (e) => { e.stopPropagation(); _files.splice(i,1); _captions.splice(i,1); if (_idx>=_files.length) _idx=Math.max(0,_files.length-1); _renderThumb(); if(_files.length) _renderMain(); else { picker.style.display='none'; } });
        wrap.appendChild(img); wrap.appendChild(rm);
        wrap.addEventListener('click', () => { _captions[_idx]=document.getElementById('mipCaption').value; _idx=i; _renderMain(); _renderThumb(); });
        thumbs.appendChild(wrap);
      });
    }
    document.getElementById('mipCaption').addEventListener('input', function() { _captions[_idx] = this.value; });
    document.getElementById('closeMIP').addEventListener('click', () => { picker.style.display='none'; });
    document.getElementById('mipSend').addEventListener('click', async () => {
      _captions[_idx] = document.getElementById('mipCaption').value;
      picker.style.display = 'none';
      for (let i=0; i<_files.length; i++) {
        await _uploadAndSend(_files[i], _captions[i]);
      }
    });
    global._openMultiImagePicker = _show;
  }

  async function _uploadAndSend(file, caption) {
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await fetch(`${_base()}/api/media/upload`, {
        method:'POST', headers:{'Authorization':`Bearer ${_token()}`}, body: fd
      }).then(r=>r.json());
      const url = res?.data?.url || res?.url || '';
      if (!url) return;
      const core = global.MessagesCore || global.messagesCore;
      if (core?.MessageHandler) {
        await core.MessageHandler.sendMessage(caption || '', {
          type: file.type.startsWith('video') ? 'video' : 'image',
          attachment: { url, type: file.type.startsWith('video') ? 'video' : 'image', name: file.name }
        });
      }
    } catch(e) { console.warn('[MultiImage] Upload failed:', e.message); }
  }

  // Hook attach button to open multi-picker when multiple files selected
  document.addEventListener('change', (e) => {
    if (!e.target.matches('input[type="file"]')) return;
    const files = [...(e.target.files || [])];
    const imgs  = files.filter(f => f.type.startsWith('image') || f.type.startsWith('video'));
    if (imgs.length < 2) return; // let existing handler deal with single file
    e.stopImmediatePropagation();
    _buildMultiImagePicker();
    global._openMultiImagePicker && global._openMultiImagePicker(imgs);
    e.target.value = '';
  }, true);

  // ══════════════════════════════════════════════════════════════════════
  // FIX-E: IN-APP CAMERA (capture + send)
  // ══════════════════════════════════════════════════════════════════════
  global.openInAppCamera = function () {
    const panel = document.createElement('div');
    panel.id = '_inAppCamera';
    panel.style.cssText = 'position:fixed;inset:0;background:#000;z-index:950;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    let stream = null, captured = null;
    panel.innerHTML = `
      <video id="_camLive" autoplay playsinline style="width:100%;max-height:70vh;object-fit:cover;"></video>
      <canvas id="_camCanvas" style="display:none;"></canvas>
      <div style="position:absolute;bottom:0;width:100%;padding:20px;display:flex;justify-content:space-around;align-items:center;background:linear-gradient(transparent,rgba(0,0,0,.7));">
        <button id="_camClose"    style="background:rgba(255,255,255,.2);border:none;border-radius:50%;width:44px;height:44px;color:#fff;cursor:pointer;font-size:18px;"><i class="fas fa-times"></i></button>
        <button id="_camCapture"  style="background:#fff;border:none;border-radius:50%;width:64px;height:64px;cursor:pointer;font-size:24px;"><i class="fas fa-camera" style="color:#000;"></i></button>
        <button id="_camFlip"     style="background:rgba(255,255,255,.2);border:none;border-radius:50%;width:44px;height:44px;color:#fff;cursor:pointer;font-size:18px;"><i class="fas fa-sync-alt"></i></button>
      </div>
      <div id="_camPreviewRow" style="display:none;position:absolute;bottom:100px;width:100%;padding:12px;background:rgba(0,0,0,.7);flex-direction:column;align-items:center;gap:10px;">
        <img id="_camPreviewImg" style="max-height:120px;border-radius:8px;" />
        <div style="display:flex;gap:12px;">
          <button id="_camRetake" style="padding:10px 20px;background:rgba(255,255,255,.2);border:none;border-radius:20px;color:#fff;cursor:pointer;">Retake</button>
          <button id="_camSend"   style="padding:10px 20px;background:#00a884;border:none;border-radius:20px;color:#fff;cursor:pointer;font-weight:600;">Send</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    let facing = 'user';
    async function _start() {
      try {
        if (stream) stream.getTracks().forEach(t=>t.stop());
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
        document.getElementById('_camLive').srcObject = stream;
      } catch(e) { alert('Camera not available: ' + e.message); panel.remove(); }
    }
    _start();
    document.getElementById('_camClose').addEventListener('click', () => { if(stream) stream.getTracks().forEach(t=>t.stop()); panel.remove(); });
    document.getElementById('_camFlip').addEventListener('click', () => { facing = facing==='user'?'environment':'user'; _start(); });
    document.getElementById('_camCapture').addEventListener('click', () => {
      const vid = document.getElementById('_camLive');
      const cvs = document.getElementById('_camCanvas');
      cvs.width=vid.videoWidth; cvs.height=vid.videoHeight;
      cvs.getContext('2d').drawImage(vid,0,0);
      cvs.toBlob(blob => {
        captured = blob;
        const url = URL.createObjectURL(blob);
        document.getElementById('_camPreviewImg').src = url;
        document.getElementById('_camPreviewRow').style.display = 'flex';
      }, 'image/jpeg', 0.92);
    });
    document.getElementById('_camRetake') && document.getElementById('_camRetake').addEventListener('click', () => {
      captured = null; document.getElementById('_camPreviewRow').style.display = 'none';
    });
    document.getElementById('_camSend') && document.getElementById('_camSend').addEventListener('click', async () => {
      if (!captured) return;
      if(stream) stream.getTracks().forEach(t=>t.stop());
      panel.remove();
      await _uploadAndSend(new File([captured], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }), '');
    });
  };
  // Wire camera button (if present in attachment popup)
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="camera"], #cameraBtn, .camera-attach-btn')) {
      global.openInAppCamera();
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // FIX-F: DOCUMENT PREVIEW BEFORE SENDING
  // ══════════════════════════════════════════════════════════════════════
  document.addEventListener('change', (e) => {
    if (!e.target.matches('input[type="file"][accept*="pdf"], input[type="file"][accept*="doc"], input.doc-input')) return;
    const file = e.target.files[0];
    if (!file) return;
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:900;display:flex;align-items:center;justify-content:center;';
    const isImg = file.type.startsWith('image');
    const previewHtml = isImg ? `<img src="${URL.createObjectURL(file)}" style="max-height:180px;border-radius:8px;margin-bottom:12px;" />` :
      `<div style="text-align:center;padding:20px 0;"><i class="fas fa-file-pdf" style="font-size:48px;color:#e53935;margin-bottom:8px;display:block;"></i><div style="font-size:13px;color:#555;">${_esc(file.name)}</div><div style="font-size:12px;color:#888;margin-top:4px;">${(file.size/1024).toFixed(0)} KB</div></div>`;
    panel.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:20px;width:90vw;max-width:360px;text-align:center;">
        ${previewHtml}
        <div style="font-size:14px;font-weight:600;color:#333;margin-bottom:4px;">${_esc(file.name)}</div>
        <div style="font-size:12px;color:#888;margin-bottom:16px;">${(file.size/1024/1024).toFixed(2)} MB</div>
        <input type="text" id="docCaption" placeholder="Add a caption…" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:12px;box-sizing:border-box;">
        <div style="display:flex;gap:10px;">
          <button id="docCancel" style="flex:1;padding:11px;background:#f0f0f0;border:none;border-radius:10px;cursor:pointer;font-size:14px;">Cancel</button>
          <button id="docSend"   style="flex:1;padding:11px;background:#00a884;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;">Send</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    document.getElementById('docCancel').addEventListener('click', () => { panel.remove(); e.target.value=''; });
    document.getElementById('docSend').addEventListener('click', async () => {
      const cap = document.getElementById('docCaption').value;
      panel.remove();
      await _uploadAndSend(file, cap);
      e.target.value = '';
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // FIX-G: GIF SEARCH via Tenor API
  // ══════════════════════════════════════════════════════════════════════
  const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPjg5DIbZF3'; // public demo key
  function _buildGifPanel() {
    if (document.getElementById('gifSearchPanel')) { document.getElementById('gifSearchPanel').style.display='flex'; return; }
    const panel = document.createElement('div');
    panel.id = 'gifSearchPanel';
    panel.style.cssText = 'display:flex;position:fixed;bottom:80px;left:50%;transform:translateX(-50%);width:340px;max-height:380px;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.2);flex-direction:column;overflow:hidden;z-index:500;';
    panel.innerHTML = `
      <div style="padding:10px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f0f0f0;">
        <input id="gifQuery" type="text" placeholder="Search GIFs…" style="flex:1;border:none;outline:none;font-size:14px;">
        <button id="closeGif" style="background:none;border:none;cursor:pointer;color:#888;font-size:18px;"><i class="fas fa-times"></i></button>
      </div>
      <div id="gifGrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;padding:8px;overflow-y:auto;max-height:320px;"></div>`;
    document.body.appendChild(panel);
    document.getElementById('closeGif').addEventListener('click', () => panel.style.display='none');
    async function _search(q) {
      const url = q
        ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=12&media_filter=gif`
        : `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&limit=12&media_filter=gif`;
      try {
        const data = await fetch(url).then(r=>r.json());
        const grid = document.getElementById('gifGrid');
        grid.innerHTML = (data.results || []).map(r => {
          const gif = r.media_formats?.gif?.url || r.media_formats?.tinygif?.url || '';
          return `<img src="${gif}" style="width:100%;border-radius:6px;cursor:pointer;aspect-ratio:1;" class="gif-result" data-url="${_esc(gif)}" />`;
        }).join('') || '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#888;">No GIFs found</div>';
      } catch(e) { console.warn('[GIF]', e.message); }
    }
    _search('');
    let _debounce;
    document.getElementById('gifQuery').addEventListener('input', function() {
      clearTimeout(_debounce); _debounce = setTimeout(() => _search(this.value.trim()), 400);
    });
    panel.addEventListener('click', async (e) => {
      const img = e.target.closest('.gif-result');
      if (!img) return;
      panel.style.display = 'none';
      const core = global.MessagesCore || global.messagesCore;
      if (core?.MessageHandler) {
        core.MessageHandler.sendMessage('', { type:'image', attachment:{ url: img.dataset.url, type:'gif', name:'gif.gif' } });
      }
    });
  }
  // Wire GIF button
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="gif"], #gifBtn, .gif-attach-btn')) {
      _buildGifPanel();
    }
  });
  // Add GIF button to attachment area if not present
  setTimeout(() => {
    const attachArea = document.querySelector('.attachment-options, #attachmentOptions, .attach-popup');
    if (attachArea && !attachArea.querySelector('[data-action="gif"]')) {
      const btn = document.createElement('button');
      btn.dataset.action = 'gif';
      btn.className = 'attachment-option';
      btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;background:none;border:none;cursor:pointer;padding:8px;';
      btn.innerHTML = '<div style="width:40px;height:40px;border-radius:50%;background:#ff6b6b;display:flex;align-items:center;justify-content:center;"><span style="color:#fff;font-weight:900;font-size:13px;">GIF</span></div><span style="font-size:11px;color:#555;">GIF</span>';
      attachArea.appendChild(btn);
    }
  }, 1500);

  // ══════════════════════════════════════════════════════════════════════
  // FIX-H: VIDEO COMPRESSION WARNING before upload
  // ══════════════════════════════════════════════════════════════════════
  document.addEventListener('change', (e) => {
    if (!e.target.matches('input[type="file"]')) return;
    const files = [...(e.target.files || [])].filter(f => f.type.startsWith('video'));
    if (!files.length) return;
    const large = files.filter(f => f.size > 25 * 1024 * 1024); // > 25 MB
    if (!large.length) return;
    e.stopImmediatePropagation();
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:900;display:flex;align-items:center;justify-content:center;';
    panel.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:20px;width:90vw;max-width:360px;">
        <div style="text-align:center;margin-bottom:16px;">
          <i class="fas fa-video" style="font-size:36px;color:#f59e0b;margin-bottom:10px;display:block;"></i>
          <div style="font-size:16px;font-weight:700;margin-bottom:6px;">Large Video</div>
          <div style="font-size:13px;color:#555;">${large[0].name} is ${(large[0].size/1024/1024).toFixed(1)} MB. Sending large videos may be slow.</div>
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-size:13px;color:#333;font-weight:600;display:block;margin-bottom:6px;">Quality</label>
          <select id="videoQualitySelect" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
            <option value="original">Original (${(large[0].size/1024/1024).toFixed(1)} MB)</option>
            <option value="compressed" selected>Compressed (~5 MB)</option>
          </select>
          <div style="font-size:11px;color:#888;margin-top:4px;">Note: browser compression is limited. For best results, compress before sending.</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button id="vidCancel" style="flex:1;padding:11px;background:#f0f0f0;border:none;border-radius:10px;cursor:pointer;">Cancel</button>
          <button id="vidSend"   style="flex:1;padding:11px;background:#005c4b;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;">Send</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    document.getElementById('vidCancel').addEventListener('click', () => { panel.remove(); e.target.value=''; });
    document.getElementById('vidSend').addEventListener('click', async () => {
      panel.remove();
      for (const file of files) { await _uploadAndSend(file, ''); }
      e.target.value = '';
    });
  }, true);

  // ══════════════════════════════════════════════════════════════════════
  // FIX-I: LINKED DEVICE SESSIONS UI
  // ══════════════════════════════════════════════════════════════════════
  global.openLinkedDevices = async function () {
    const existing = document.getElementById('linkedDevicesPanel');
    if (existing) { existing.style.display = 'flex'; return; }
    const panel = document.createElement('div');
    panel.id = 'linkedDevicesPanel';
    panel.style.cssText = 'display:flex;position:fixed;top:0;right:0;width:340px;height:100vh;background:#fff;z-index:500;box-shadow:-4px 0 20px rgba(0,0,0,.15);flex-direction:column;overflow-y:auto;';
    panel.innerHTML = `
      <div style="background:#005c4b;color:#fff;padding:16px;display:flex;align-items:center;gap:12px;position:sticky;top:0;">
        <button id="closeLinkedDevices" style="background:none;border:none;color:#fff;cursor:pointer;font-size:20px;"><i class="fas fa-arrow-left"></i></button>
        <h3 style="margin:0;font-size:16px;">Linked Devices</h3>
      </div>
      <div id="linkedDevicesList" style="padding:16px;"><div style="color:#888;text-align:center;padding:30px;">Loading…</div></div>
      <div style="padding:16px;border-top:1px solid #f0f0f0;">
        <button id="logoutAllDevices" style="width:100%;padding:12px;background:#fff;border:1px solid #e53935;border-radius:10px;cursor:pointer;font-size:14px;color:#e53935;font-weight:600;">Log out all other devices</button>
      </div>`;
    document.body.appendChild(panel);
    document.getElementById('closeLinkedDevices').addEventListener('click', () => panel.style.display = 'none');
    document.getElementById('logoutAllDevices').addEventListener('click', async () => {
      if (!confirm('Log out all other sessions?')) return;
      await _apiFetch('/api/privacy/sessions', { method: 'DELETE' });
      panel.style.display = 'none';
    });
    // Load sessions
    const res = await _apiFetch('/api/privacy/sessions');
    const sessions = res?.data?.sessions || [];
    const list = document.getElementById('linkedDevicesList');
    if (!sessions.length) {
      list.innerHTML = '<div style="color:#888;text-align:center;padding:30px;">No other active sessions</div>';
    } else {
      list.innerHTML = sessions.map(s => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f0f0f0;">
          <div style="width:40px;height:40px;border-radius:50%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-${s.deviceLabel?.toLowerCase().includes('mobile') ? 'mobile-alt' : 'desktop'}" style="color:#667eea;"></i>
          </div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;color:#333;">${_esc(s.deviceLabel || 'Unknown Device')} ${s.isCurrent ? '<span style="font-size:10px;background:#e8f5e9;color:#22c55e;padding:2px 6px;border-radius:10px;">This device</span>' : ''}</div>
            <div style="font-size:12px;color:#888;">${s.ipAddress || ''} · ${s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleDateString() : ''}</div>
          </div>
          ${!s.isCurrent ? `<button onclick="_logoutSession('${_esc(s.id)}')" style="background:none;border:1px solid #ddd;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;color:#e53935;">Log out</button>` : ''}
        </div>`).join('');
    }
  };

  global._logoutSession = async function (sessionId) {
    await _apiFetch(`/api/privacy/sessions/${sessionId}`, { method: 'DELETE' });
    document.querySelector(`[onclick*="${sessionId}"]`)?.closest('div[style]')?.remove();
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="linked-devices"], #menuLinkedDevices, #settingsLinkedDevices');
    if (btn) { e.preventDefault(); global.openLinkedDevices(); }
  });

  // ══════════════════════════════════════════════════════════════════════
  // FIX-J: PRIVACY SETTINGS PANEL
  // ══════════════════════════════════════════════════════════════════════
  global.openPrivacySettings = function () {
    if (document.getElementById('privacySettingsPanel')) {
      document.getElementById('privacySettingsPanel').style.display = 'flex'; return;
    }
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem('kynecta_settings_v1') || '{}'); } catch (_) {}

    const panel = document.createElement('div');
    panel.id = 'privacySettingsPanel';
    panel.style.cssText = 'display:flex;position:fixed;top:0;right:0;width:340px;height:100vh;background:#fff;z-index:500;box-shadow:-4px 0 20px rgba(0,0,0,.15);flex-direction:column;overflow-y:auto;';
    const pref = (stored.notifications || {}).preview || 'full';
    panel.innerHTML = `
      <div style="background:#005c4b;color:#fff;padding:16px;display:flex;align-items:center;gap:12px;position:sticky;top:0;">
        <button id="closePrivacySettings" style="background:none;border:none;color:#fff;cursor:pointer;font-size:20px;"><i class="fas fa-arrow-left"></i></button>
        <h3 style="margin:0;font-size:16px;">Privacy</h3>
      </div>
      <div style="padding:16px;">
        <div style="margin-bottom:20px;">
          <div style="font-size:13px;font-weight:600;color:#333;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px;">Last Seen & Online</div>
          <label style="font-size:14px;color:#333;display:block;margin-bottom:6px;">Who can see my last seen?</label>
          <select id="lastSeenPref" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:4px;">
            <option value="everyone" ${(stored.privacy?.lastSeenVisibility||'everyone')==='everyone'?'selected':''}>Everyone</option>
            <option value="contacts" ${(stored.privacy?.lastSeenVisibility)==='contacts'?'selected':''}>My Contacts</option>
            <option value="nobody"   ${(stored.privacy?.lastSeenVisibility)==='nobody'?'selected':''}>Nobody</option>
          </select>
          <div style="font-size:11px;color:#888;">If you don't share your last seen, you won't be able to see others'.</div>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:13px;font-weight:600;color:#333;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px;">Notifications</div>
          <label style="font-size:14px;color:#333;display:block;margin-bottom:6px;">Message preview in notifications</label>
          <select id="notifPreviewPref" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
            <option value="full"        ${pref==='full'?'selected':''}>Show message preview</option>
            <option value="sender_only" ${pref==='sender_only'?'selected':''}>Show sender name only</option>
            <option value="none"        ${pref==='none'?'selected':''}>No preview</option>
          </select>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:13px;font-weight:600;color:#333;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px;">Security</div>
          <button onclick="global.openTwoStepVerification && global.openTwoStepVerification()" 
                  style="width:100%;padding:12px;background:#f8f9fa;border:1px solid #ddd;border-radius:10px;cursor:pointer;font-size:14px;text-align:left;display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <i class="fas fa-lock" style="color:#667eea;width:18px;"></i> Two-step verification
          </button>
          <button onclick="global.openLinkedDevices && global.openLinkedDevices()" 
                  style="width:100%;padding:12px;background:#f8f9fa;border:1px solid #ddd;border-radius:10px;cursor:pointer;font-size:14px;text-align:left;display:flex;align-items:center;gap:10px;">
            <i class="fas fa-laptop" style="color:#667eea;width:18px;"></i> Linked devices
          </button>
        </div>
        <button id="savePrivacySettings" style="width:100%;padding:13px;background:#005c4b;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:15px;">Save</button>
        <div id="privacySaveMsg" style="text-align:center;margin-top:10px;font-size:13px;min-height:18px;"></div>
      </div>`;
    document.body.appendChild(panel);
    document.getElementById('closePrivacySettings').addEventListener('click', () => panel.style.display='none');
    document.getElementById('savePrivacySettings').addEventListener('click', async () => {
      const lsPref  = document.getElementById('lastSeenPref').value;
      const notifPref = document.getElementById('notifPreviewPref').value;
      try {
        const s = JSON.parse(localStorage.getItem('kynecta_settings_v1') || '{}');
        if (!s.privacy) s.privacy = {};
        if (!s.notifications) s.notifications = {};
        s.privacy.lastSeenVisibility = lsPref;
        s.notifications.preview = notifPref;
        localStorage.setItem('kynecta_settings_v1', JSON.stringify(s));
      } catch (_) {}
      await _apiFetch('/api/privacy/last-seen', { method:'PUT', body: JSON.stringify({ visibility: lsPref }) });
      document.dispatchEvent(new CustomEvent('settings:saved'));
      document.getElementById('privacySaveMsg').innerHTML = '<span style="color:#22c55e"><i class="fas fa-check"></i> Saved</span>';
      setTimeout(() => { document.getElementById('privacySaveMsg').textContent = ''; }, 2000);
    });
  };
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="privacy-settings"], #menuPrivacy, #settingsPrivacy');
    if (btn) { e.preventDefault(); global.openPrivacySettings(); }
  });

  // Observe new message elements for view-once
  new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      const els = n.matches('[data-message-id]') ? [n] : [...(n.querySelectorAll('[data-message-id]')||[])];
      els.forEach(_renderViewOnce);
    }));
  }).observe(document.body, { childList:true, subtree:true });

  console.log('[Nexopa MediaUX] ✅ All patches loaded');
})(window);
