(() => {
  'use strict';
  if (window.__NECPRA_GROUP_CHAT_FEATURES__) return;
  window.__NECPRA_GROUP_CHAT_FEATURES__ = true;

  const state = { chatId: null, editingId: null, uploadBusy: false };
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
    style.textContent = '.group-feature-tools{display:flex;gap:5px;align-items:center;flex:0 0 auto}.group-feature-btn{width:38px;height:38px;border:1px solid var(--border,#e2e8f0);border-radius:11px;background:var(--surface2,#f1f5f9);color:var(--text,#0f172a);cursor:pointer}.group-feature-btn:hover{filter:brightness(.97)}.group-emoji-picker{position:absolute;bottom:62px;left:8px;width:min(330px,calc(100vw - 20px));padding:10px;border:1px solid var(--border,#e2e8f0);border-radius:14px;background:var(--surface,#fff);box-shadow:0 16px 40px #0002;display:grid;grid-template-columns:repeat(8,1fr);gap:3px;z-index:100}.group-emoji-picker button{border:0;background:transparent;border-radius:8px;padding:7px;font-size:21px;cursor:pointer}.group-emoji-picker button:hover{background:var(--surface2,#f1f5f9)}.group-message-actions{display:flex;gap:4px;margin-top:5px;justify-content:flex-end}.group-message-actions button{border:0;background:transparent;color:inherit;opacity:.75;font-size:10px;cursor:pointer;padding:3px 5px}.group-edit-banner{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface2,#f1f5f9);border-top:1px solid var(--border,#e2e8f0);font-size:11px}.group-edit-banner span{flex:1}.group-attachment-preview{font-size:11px;padding:5px 10px;color:var(--muted,#64748b);display:none}';
    document.head.appendChild(style);
  }

  function currentChatId() {
    return state.chatId || window.__GROUP_CHAT_ID || null;
  }

  function buildTools() {
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

    const banner = document.createElement('div');
    banner.id = 'groupEditBanner';
    banner.className = 'group-edit-banner';
    banner.hidden = true;
    banner.innerHTML = '<span id="groupEditText">Editing message</span><button type="button" id="groupEditCancel">Cancel</button>';
    if (composer.parentElement) composer.parentElement.insertBefore(banner, composer);

    const preview = document.createElement('div');
    preview.id = 'groupAttachmentPreview';
    preview.className = 'group-attachment-preview';
    if (composer.parentElement) composer.parentElement.insertBefore(preview, composer);

    $('groupEmojiBtn').onclick = (event) => { event.stopPropagation(); picker.hidden = !picker.hidden; };
    $('groupAttachBtn').onclick = () => $('groupAttachInput').click();
    $('groupAttachInput').onchange = handleAttachment;
    $('groupEditCancel').onclick = cancelEdit;
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
    state.uploadBusy = true;
    const preview = $('groupAttachmentPreview');
    if (preview) { preview.style.display = 'block'; preview.textContent = `Uploading ${file.name}…`; }
    try {
      const form = new FormData();
      form.append('file', file, file.name || 'upload');
      const uploaded = await api('/files/upload', { method: 'POST', body: form });
      const media = uploaded && (uploaded.data || uploaded.file || uploaded);
      if (!media || !media.url) throw new Error('File upload did not return a URL');
      const type = media.type || (file.type.indexOf('image/') === 0 ? 'image' : file.type.indexOf('video/') === 0 ? 'video' : file.type.indexOf('audio/') === 0 ? 'audio' : 'document');
      const result = await api('/messages', {
        method: 'POST',
        body: JSON.stringify({
          chatId: Number(chatId),
          type,
          content: file.name,
          clientMessageId: `grp_media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          metadata: { media: { url: media.url, publicId: media.publicId || media.public_id || null, name: file.name, mimeType: file.type, size: file.size, type } }
        })
      });
      const message = result && result.data && (result.data.message || result.data);
      if (message) {
        window.__GROUP_MESSAGES_CACHE = Array.isArray(window.__GROUP_MESSAGES_CACHE) ? window.__GROUP_MESSAGES_CACHE.concat([message]) : [message];
        if (typeof window.__GROUP_REFRESH_MESSAGES === 'function') await window.__GROUP_REFRESH_MESSAGES();
      }
      if (preview) { preview.textContent = `${file.name} sent`; setTimeout(() => { preview.style.display = 'none'; }, 1800); }
    } catch (error) {
      if (preview) preview.textContent = `Upload failed: ${error.message}`;
      console.error('[GroupChat] attachment upload failed:', error);
    } finally {
      state.uploadBusy = false;
    }
  }

  function cancelEdit() {
    state.editingId = null;
    if ($('groupEditBanner')) $('groupEditBanner').hidden = true;
    if ($('input')) $('input').value = '';
  }

  async function editMessage(id, text) {
    await api(`/messages/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ content: text }) });
    cancelEdit();
    if (typeof window.__GROUP_REFRESH_MESSAGES === 'function') await window.__GROUP_REFRESH_MESSAGES();
  }

  async function deleteMessage(id) {
    if (!window.confirm('Delete this message for everyone?')) return;
    try {
      await api(`/messages/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ deleteForEveryone: true }) });
      if (typeof window.__GROUP_REFRESH_MESSAGES === 'function') await window.__GROUP_REFRESH_MESSAGES();
    } catch (error) { window.alert(error.message); }
  }

  function beginEdit(message) {
    state.editingId = String(message.id);
    const input = $('input');
    if (!input) return;
    input.value = message.content || '';
    input.focus();
    if ($('groupEditBanner')) { $('groupEditBanner').hidden = false; $('groupEditText').textContent = 'Editing message'; }
  }

  function messageCache() {
    return Array.isArray(window.__GROUP_MESSAGES_CACHE) ? window.__GROUP_MESSAGES_CACHE : [];
  }

  function enhanceMessages() {
    const box = $('messages');
    if (!box) return;
    const cache = messageCache();
    Array.from(box.querySelectorAll('.row')).forEach((row, index) => {
      if (row.dataset.groupActions === '1') return;
      const message = cache[index];
      if (!message || !message.id) return;
      row.dataset.groupActions = '1';
      row.dataset.messageId = String(message.id);
      if (!row.classList.contains('mine')) return;
      const actions = document.createElement('div');
      actions.className = 'group-message-actions';
      const edit = document.createElement('button');
      edit.type = 'button'; edit.textContent = 'Edit';
      edit.onclick = (event) => { event.stopPropagation(); beginEdit(message); };
      const del = document.createElement('button');
      del.type = 'button'; del.textContent = 'Delete';
      del.onclick = (event) => { event.stopPropagation(); deleteMessage(message.id); };
      actions.append(edit, del);
      const bubble = row.querySelector('.bubble');
      if (bubble) bubble.appendChild(actions);
    });
  }

  function installMessageObserver() {
    const box = $('messages');
    if (!box || box.dataset.groupFeaturesObserver === '1') return;
    box.dataset.groupFeaturesObserver = '1';
    new MutationObserver(() => setTimeout(enhanceMessages, 0)).observe(box, { childList: true, subtree: true });
    enhanceMessages();
  }

  function wireSendOverride() {
    const send = $('send');
    const input = $('input');
    if (!send || !input || send.dataset.groupFeatureSend === '1') return;
    send.dataset.groupFeatureSend = '1';
    send.addEventListener('click', async (event) => {
      if (!state.editingId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const text = input.value.trim();
      if (!text) return;
      try { await editMessage(state.editingId, text); } catch (error) { window.alert(error.message); }
    }, true);
  }

  function setChat(id) {
    if (id) { state.chatId = String(id); window.__GROUP_CHAT_ID = String(id); }
    buildTools(); installMessageObserver(); wireSendOverride();
  }

  function observeGroupOpen() {
    const nativeFetch = window.fetch && window.fetch.bind(window);
    if (!nativeFetch || window.__GROUP_FEATURE_FETCH_PATCHED__) return;
    window.__GROUP_FEATURE_FETCH_PATCHED__ = true;
    window.fetch = async function groupFeatureFetch(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const response = await nativeFetch(input, init);
      try {
        const text = String(url);
        const chatMatch = text.match(/\/chats\/(\d+)(?:\?|$)/);
        const messageMatch = text.match(/\/messages\/(\d+)(?:\?|$)/);
        if ((chatMatch || messageMatch) && response.ok) {
          const id = (chatMatch || messageMatch)[1];
          setChat(id);
          const data = await response.clone().json().catch(() => null);
          const list = data && (data.data && data.data.messages || data.data || data.messages || data);
          if (Array.isArray(list)) window.__GROUP_MESSAGES_CACHE = list.filter((item) => item && item.id);
        }
      } catch (_) {}
      return response;
    };
  }

  function init() {
    injectStyles();
    observeGroupOpen();
    const run = () => { buildTools(); installMessageObserver(); wireSendOverride(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
    const observer = new MutationObserver(run);
    if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(run, 800);
  }

  init();
})();
