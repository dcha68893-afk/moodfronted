(() => {
  'use strict';

  const state = { chatId: null, editingId: null, uploadBusy: false };
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
  const base = () => String(typeof window.__getApiBase === 'function' ? window.__getApiBase() : '').replace(/\/$/, '');
  const api = async (path, options = {}) => {
    const headers = { ...(options.headers || {}) };
    const t = token(); if (t) headers.Authorization = `Bearer ${t}`;
    const r = await fetch(`${base()}${path}`, { ...options, headers });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || d.error || `Request failed (${r.status})`);
    return d;
  };

  function injectStyles() {
    if (document.getElementById('groupChatFeatureStyles')) return;
    const s = document.createElement('style'); s.id = 'groupChatFeatureStyles';
    s.textContent = `
      .group-feature-tools{display:flex;gap:5px;align-items:center;flex:0 0 auto}
      .group-feature-btn{width:38px;height:38px;border:1px solid var(--border,#e2e8f0);border-radius:11px;background:var(--surface2,#f1f5f9);color:var(--text,#0f172a);cursor:pointer}
      .group-feature-btn:hover{filter:brightness(.97);transform:translateY(-1px)}
      .group-emoji-picker{position:absolute;bottom:62px;left:8px;width:min(330px,calc(100vw - 20px));padding:10px;border:1px solid var(--border,#e2e8f0);border-radius:14px;background:var(--surface,#fff);box-shadow:0 16px 40px #0002;display:grid;grid-template-columns:repeat(8,1fr);gap:3px;z-index:20}
      .group-emoji-picker button{border:0;background:transparent;border-radius:8px;padding:7px;font-size:21px;cursor:pointer}.group-emoji-picker button:hover{background:var(--surface2,#f1f5f9)}
      .group-message-actions{display:flex;gap:4px;margin-top:5px;justify-content:flex-end}.group-message-actions button{border:0;background:transparent;color:inherit;opacity:.7;font-size:10px;cursor:pointer;padding:3px 5px}.group-message-actions button:hover{opacity:1}
      .group-edit-banner{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface2,#f1f5f9);border-top:1px solid var(--border,#e2e8f0);font-size:11px}.group-edit-banner span{flex:1}.group-edit-banner button{border:0;background:transparent;color:var(--muted,#64748b);cursor:pointer}
      .group-attachment-preview{font-size:11px;padding:4px 10px;color:var(--muted,#64748b);display:none}
    `;
    document.head.appendChild(s);
  }

  function currentChatId() {
    return state.chatId || window.__GROUP_CHAT_ID || null;
  }

  function buildTools() {
    const composer = document.querySelector('#chat .composer');
    if (!composer || composer.dataset.groupFeatures === '1') return !!composer;
    composer.dataset.groupFeatures = '1';
    composer.style.position = 'relative';
    const input = $('input');
    if (!input) return false;

    const tools = document.createElement('div');
    tools.className = 'group-feature-tools';
    tools.innerHTML = `
      <button type="button" class="group-feature-btn" id="groupEmojiBtn" title="Emoji" aria-label="Emoji">😊</button>
      <button type="button" class="group-feature-btn" id="groupAttachBtn" title="Attach file" aria-label="Attach file">📎</button>
      <input id="groupAttachInput" type="file" hidden accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip">
    `;
    composer.insertBefore(tools, input);

    const picker = document.createElement('div'); picker.id = 'groupEmojiPicker'; picker.className = 'group-emoji-picker'; picker.hidden = true;
    ['😀','😂','😍','😊','😢','😡','🙏','❤️','👍','👎','🔥','🎉','👏','💯','🤣','😎','🥰','😘','😭','🤔','😮','😴','🙌','✨','💔','❤️‍🔥','🎂','🎁','✅','❌','👀','💪','🤝','😇','🥳','🤗','😅','😉','🤩','😌','🫶','🚀','🌟','💙','💚','💛','💜','🖤','🤍','🤎','☀️','🌹','🎵','📸','😂','😋','😜','🤭','🫡','🙏🏽','❤️'].forEach(e => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = e; b.onclick = () => { input.value += e; input.focus(); picker.hidden = true; };
      picker.appendChild(b);
    });
    composer.appendChild(picker);

    const banner = document.createElement('div'); banner.id = 'groupEditBanner'; banner.className = 'group-edit-banner'; banner.hidden = true;
    banner.innerHTML = '<span id="groupEditText">Editing message</span><button type="button" id="groupEditCancel">Cancel</button>';
    composer.parentElement.insertBefore(banner, composer);

    const preview = document.createElement('div'); preview.id = 'groupAttachmentPreview'; preview.className = 'group-attachment-preview';
    composer.parentElement.insertBefore(preview, composer);

    $('groupEmojiBtn').onclick = (e) => { e.stopPropagation(); picker.hidden = !picker.hidden; };
    $('groupAttachBtn').onclick = () => $('groupAttachInput').click();
    $('groupEditCancel').onclick = cancelEdit;
    $('groupAttachInput').onchange = handleAttachment;
    document.addEventListener('click', (e) => { if (!picker.contains(e.target) && e.target !== $('groupEmojiBtn')) picker.hidden = true; }, { passive: true });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.editingId) cancelEdit();
    });
    return true;
  }

  async function handleAttachment(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    const chatId = currentChatId();
    if (!file || !chatId || state.uploadBusy) return;
    state.uploadBusy = true;
    const preview = $('groupAttachmentPreview');
    if (preview) { preview.style.display = 'block'; preview.textContent = `Uploading ${file.name}…`; }
    try {
      const fd = new FormData(); fd.append('file', file);
      const uploaded = await api('/cloudinary/direct-upload', { method: 'POST', body: fd });
      const media = uploaded.cloudinary || uploaded;
      const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'file';
      const r = await api('/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        chatId: Number(chatId), type, content: file.name, clientMessageId: `grp_media_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
        metadata: { media: { url: media.url, publicId: media.public_id || media.publicId || null, name: file.name, mimeType: file.type, size: file.size } }
      }) });
      window.dispatchEvent(new CustomEvent('group:message:sent', { detail: r?.data?.message || r?.data }));
      if (preview) { preview.style.display = 'block'; preview.textContent = `${file.name} sent`; setTimeout(() => { preview.style.display = 'none'; }, 1800); }
    } catch (err) {
      if (preview) preview.textContent = `Upload failed: ${err.message}`;
      console.error('[GroupChat] attachment upload failed:', err);
    } finally { state.uploadBusy = false; }
  }

  async function editMessage(id, text) {
    await api(`/messages/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) });
    state.editingId = null;
    if ($('groupEditBanner')) $('groupEditBanner').hidden = true;
    if ($('input')) { $('input').value = ''; $('input').focus(); }
    if (typeof window.__GROUP_REFRESH_MESSAGES === 'function') await window.__GROUP_REFRESH_MESSAGES();
    else location.reload();
  }

  async function deleteMessage(id) {
    if (!confirm('Delete this message for everyone?')) return;
    try {
      await api(`/messages/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleteForEveryone: true }) });
      if (typeof window.__GROUP_REFRESH_MESSAGES === 'function') await window.__GROUP_REFRESH_MESSAGES();
      else location.reload();
    } catch (err) { alert(err.message); }
  }

  function beginEdit(row, message) {
    state.editingId = String(message.id);
    const input = $('input'); if (!input) return;
    input.value = message.content || '';
    input.focus();
    const banner = $('groupEditBanner'); if (banner) { banner.hidden = false; $('groupEditText').textContent = 'Editing message'; }
  }

  function findMessageForRow(row) {
    const id = row?.dataset?.messageId;
    if (id) return { id: Number(id) || id, content: row.querySelector('.bubble > div:not(.sender):not(.time)')?.textContent || '' };
    const rows = [...document.querySelectorAll('#messages .row')];
    const idx = rows.indexOf(row);
    const cache = window.__GROUP_MESSAGES_CACHE || [];
    return cache[idx] || null;
  }

  function enhanceMessages() {
    const box = $('messages'); if (!box) return;
    [...box.querySelectorAll('.row')].forEach(row => {
      if (row.dataset.groupActions === '1') return;
      const msg = findMessageForRow(row); if (!msg?.id) return;
      row.dataset.groupActions = '1'; row.dataset.messageId = String(msg.id);
      const mine = row.classList.contains('mine'); if (!mine) return;
      const actions = document.createElement('div'); actions.className = 'group-message-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit'; edit.onclick = (e) => { e.stopPropagation(); beginEdit(row, msg); };
      const del = document.createElement('button'); del.type = 'button'; del.textContent = 'Delete'; del.onclick = (e) => { e.stopPropagation(); deleteMessage(msg.id); };
      actions.append(edit, del); row.querySelector('.bubble')?.appendChild(actions);
    });
  }

  function installMessageObserver() {
    const box = $('messages'); if (!box || box.dataset.groupFeaturesObserver === '1') return;
    box.dataset.groupFeaturesObserver = '1';
    new MutationObserver(() => setTimeout(enhanceMessages, 0)).observe(box, { childList: true, subtree: true });
    enhanceMessages();
  }

  function wireSendOverride() {
    const send = $('send'), input = $('input'); if (!send || !input || send.dataset.groupFeatureSend === '1') return;
    send.dataset.groupFeatureSend = '1';
    send.addEventListener('click', async (e) => {
      if (!state.editingId) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const text = input.value.trim(); if (!text) return;
      try { await editMessage(state.editingId, text); } catch (err) { alert(err.message); }
    }, true);
  }

  function setChat(id) {
    if (id) { state.chatId = String(id); window.__GROUP_CHAT_ID = String(id); }
    buildTools(); installMessageObserver(); wireSendOverride();
  }

  function observeGroupOpen() {
    const originalFetch = window.fetch?.bind(window); if (!originalFetch || window.__GROUP_FEATURE_FETCH_PATCHED__) return;
    window.__GROUP_FEATURE_FETCH_PATCHED__ = true;
    window.fetch = async function(input, init) {
      const url = typeof input === 'string' ? input : input?.url || '';
      const result = await originalFetch(input, init);
      try {
        const m = String(url).match(/\/chats\/(\d+)(?:\?|$)/);
        if (m && result.ok) setChat(m[1]);
        const mm = String(url).match(/\/messages\/(\d+)(?:\?|$)/);
        if (mm && result.ok) setChat(mm[1]);
      } catch (_) {}
      return result;
    };
  }

  function init() {
    injectStyles();
    observeGroupOpen();
    const run = () => { if (window.__GROUP_CHAT_ID) setChat(window.__GROUP_CHAT_ID); else { buildTools(); installMessageObserver(); wireSendOverride(); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
    setInterval(() => { if (document.getElementById('chat') && !document.getElementById('chat').classList.contains('hidden')) { buildTools(); installMessageObserver(); wireSendOverride(); } }, 500);
  }
  init();
})();
