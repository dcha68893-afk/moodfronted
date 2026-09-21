/* FIX-ROUND (GROUP-ATTACH-WRONG-PIPELINE): this file used to POST attachments
   straight to the 1:1 DM endpoint (/messages) with a plaintext caption, and
   it also carried its own Edit/Delete/message-cache/fetch-monkeypatch logic
   that duplicated what group.html already does correctly and encrypted.
   Root cause (confirmed against src/services/groupMessagingService.js on the
   backend): every row inserted via POST /group-messages/:groupId/messages is
   auto-tagged by the server with metadata.groupPipeline='KYN-GROUP-V2', and
   deleteMessage()/updateMessage() on the server both require that tag to find
   a row. An attachment posted to /messages never gets tagged, so it becomes
   invisible to group delete/edit ("Group message not found" 404) and its
   caption was never encrypted for the group at all.
   Fix: removed the duplicate edit/delete/cache/fetch-patch code entirely
   (group.html's own ⋮ menu already provides working, encrypted Edit/Delete —
   see startEdit()/deleteMessage() there) and route the attachment send
   through window.__NECPRA_GROUP_SEND, the one function group.html itself
   exposes for exactly this purpose (encrypts the caption, posts to the
   correct /group-messages/:groupId/messages endpoint, and lets the server
   apply the pipeline tag). This file no longer touches window.fetch, no
   longer keeps its own message cache, and no longer offers a second
   Edit/Delete UI on top of group.html's bubbles. */
(() => {
  'use strict';
  if (window.__NECPRA_GROUP_CHAT_FEATURES__) return;
  window.__NECPRA_GROUP_CHAT_FEATURES__ = true;

  const state = { uploadBusy: false };
  const $ = (id) => document.getElementById(id);

  function token() {
    try { if (window.__kynToken) return window.__kynToken; } catch (_) {}
    try { if (window.__accessToken) return window.__accessToken; } catch (_) {}
    try {
      if (window.AuthSessionManager && typeof window.AuthSessionManager.getToken === 'function') {
        const t = window.AuthSessionManager.getToken();
        if (t) return t;
      }
    } catch (_) {}
    try { if (window.authToken && !String(window.authToken).startsWith('{')) return window.authToken; } catch (_) {}
    try {
      return localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
    } catch (_) { return ''; }
  }

  function apiBase() {
    try {
      return String(typeof window.__getApiBase === 'function' ? window.__getApiBase() : '').replace(/\/$/, '');
    } catch (_) { return ''; }
  }

  async function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({}, opts.headers || {});
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;
    const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    if (isFormData) {
      delete headers['Content-Type'];
    } else if (opts.body != null && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${apiBase()}${path}`, Object.assign({}, opts, { headers }));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `Request failed (${response.status})`);
    return data;
  }

  function injectStyles() {
    if ($('groupChatFeatureStyles')) return;
    const style = document.createElement('style');
    style.id = 'groupChatFeatureStyles';
    style.textContent = '.group-feature-tools{display:flex;gap:5px;align-items:center;flex:0 0 auto}.group-feature-btn{width:38px;height:38px;border:1px solid var(--border,#e2e8f0);border-radius:11px;background:var(--surface2,#f1f5f9);color:var(--text,#0f172a);cursor:pointer}.group-feature-btn:hover{filter:brightness(.97)}.group-feature-btn:disabled{opacity:.5;cursor:default}.group-emoji-picker{position:absolute;bottom:62px;left:8px;width:min(330px,calc(100vw - 20px));max-height:220px;overflow-y:auto;padding:10px;border:1px solid var(--border,#e2e8f0);border-radius:14px;background:var(--surface,#fff);box-shadow:0 16px 40px #0002;display:grid;grid-template-columns:repeat(8,1fr);grid-auto-rows:min-content;gap:3px;z-index:100}.group-emoji-picker[hidden]{display:none}.group-emoji-picker button{border:0;background:transparent;border-radius:8px;padding:7px;font-size:21px;cursor:pointer;line-height:1}.group-emoji-picker button:hover{background:var(--surface2,#f1f5f9)}.group-attachment-preview{font-size:11px;padding:5px 10px;color:var(--muted,#64748b);display:none}';
    document.head.appendChild(style);
  }

  // Every entry point this file needs — window.__NECPRA_GROUP_SEND (the
  // encrypted send pipeline) and window.__GROUP_CHAT_ID (which group.html
  // itself already sets in openGroup()/closeGroup()) — is provided natively
  // by group.html. No separate chatId tracking or fetch interception needed.
  function currentChatId() {
    return window.__GROUP_CHAT_ID || null;
  }

  function buildTools() {
    if (typeof window.__NECPRA_GROUP_SEND !== 'function') return false; // not on group.html
    const composer = document.querySelector('#chat .composer, .composer');
    const input = $('input');
    if (!composer || !input) return false;
    composer.style.position = 'relative';
    if (composer.dataset.groupFeatures) return true;

    composer.dataset.groupFeatures = '1';
    const tools = document.createElement('div');
    tools.className = 'group-feature-tools';
    tools.innerHTML = '<button type="button" class="group-feature-btn" id="groupEmojiBtn" title="Emoji" aria-label="Emoji">😊</button><button type="button" class="group-feature-btn" id="groupAttachBtn" title="Attach" aria-label="Attach">📎</button><input id="groupAttachInput" type="file" hidden accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip">';
    composer.insertBefore(tools, input);

    const picker = document.createElement('div');
    picker.id = 'groupEmojiPicker';
    picker.className = 'group-emoji-picker';
    picker.hidden = true;
    composer.appendChild(picker);

    const emojis = ['😀','😂','😍','😊','😢','😡','🙏','❤️','👍','👎','🔥','🎉','👏','💯','🤣','😎','🥰','😘','😭','🤔','😮','😴','🙌','✨','💔','❤️‍🔥','🎂','🎁','✅','❌','👀','💪','🤝','😇','🥳','🤗','😅','😉','🤩','😌','🫶','🚀','🌟','💙','💚','💛','💜','🖤','🤍','🤎','☀️','🌹','🎵','📸','😋','😜','🤭','🫡','🙏🏽'];
    emojis.forEach((emoji) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = emoji;
      button.onclick = () => { input.value += emoji; input.focus(); picker.hidden = true; };
      picker.appendChild(button);
    });

    const preview = document.createElement('div');
    preview.id = 'groupAttachmentPreview';
    preview.className = 'group-attachment-preview';
    if (composer.parentElement) composer.parentElement.insertBefore(preview, composer);

    $('groupEmojiBtn').onclick = (event) => { event.stopPropagation(); picker.hidden = !picker.hidden; };
    $('groupAttachBtn').onclick = () => $('groupAttachInput').click();
    $('groupAttachInput').onchange = handleAttachment;
    document.addEventListener('click', (event) => {
      const emojiButton = $('groupEmojiBtn');
      if (!picker.contains(event.target) && event.target !== emojiButton) picker.hidden = true;
    }, { passive: true });
    return true;
  }

  async function handleAttachment(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    const chatId = currentChatId();
    if (!file || !chatId || state.uploadBusy) return;
    if (typeof window.__NECPRA_GROUP_SEND !== 'function') return;
    state.uploadBusy = true;
    const attachBtn = $('groupAttachBtn');
    if (attachBtn) attachBtn.disabled = true;
    const preview = $('groupAttachmentPreview');
    if (preview) { preview.style.display = 'block'; preview.textContent = `Uploading ${file.name}…`; }
    try {
      const form = new FormData();
      form.append('file', file, file.name || 'upload');
      const uploaded = await api('/files/upload', { method: 'POST', body: form });
      const media = uploaded && (uploaded.data || uploaded.file || uploaded);
      if (!media || !media.url) throw new Error('File upload did not return a URL');
      const type = media.type || (file.type.indexOf('image/') === 0 ? 'image' : file.type.indexOf('video/') === 0 ? 'video' : file.type.indexOf('audio/') === 0 ? 'audio' : 'file');
      const input = $('input');
      const caption = (input && input.value.trim()) || '';
      if (input) input.value = '';
      // FIX (GROUP-ATTACH-WRONG-PIPELINE): previously api('/messages', {...})
      // straight to the 1:1 endpoint with a plaintext caption. Now goes
      // through the same encrypted, correctly-tagged pipeline group.html's
      // own text sends use — see sendGroupPayload()/window.__NECPRA_GROUP_SEND
      // in group.html.
      await window.__NECPRA_GROUP_SEND(caption, type, {
        media: { url: media.url, publicId: media.publicId || media.public_id || null, name: file.name, mimeType: file.type, size: file.size, type }
      });
      if (preview) { preview.textContent = `${file.name} sent`; setTimeout(() => { preview.style.display = 'none'; }, 1800); }
    } catch (error) {
      if (preview) preview.textContent = `Upload failed: ${error.message}`;
      console.error('[GroupChat] attachment upload failed:', error);
    } finally {
      state.uploadBusy = false;
      if (attachBtn) attachBtn.disabled = false;
    }
  }

  function init() {
    injectStyles();
    const run = () => { buildTools(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
    // group.html's composer only exists once, but the group panel itself is
    // enabled/disabled (input.disabled) as groups open/close — a light
    // interval is enough to attach once and is a no-op afterwards, without
    // the global MutationObserver + 800ms interval the old version ran on
    // the whole document (that scope, plus the fetch monkeypatch, is what
    // made this file risky to load on every page).
    setInterval(run, 1000);
  }

  init();
})();
