/* Necpa group mobile navigation + conversation enhancements. */
(function () {
  'use strict';
  if (!/\/group\.html$/i.test(window.location.pathname)) return;
  if (window.__NECPRA_GROUP_MOBILE_NAV__) return;
  window.__NECPRA_GROUP_MOBILE_NAV__ = true;

  const X = { crypto: null, installed: false, uploading: false, realtime: false };
  const EMOJIS = '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫡 🤭 🫢 🫣 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 💕 💞 💓 💗 💖 💘 💝 💟 ✨ ⭐ 🌟 🔥 🎉 🎊 👍 👎 👏 🙌 🙏 💪 🤝 👌 ✌️ 🤞 🤟 🤘 👋 💯'.split(' ');

  function base() { try { return String(window.__getApiBase?.() || window.API_BASE_URL || '').replace(/\/$/, ''); } catch (_) { return ''; } }
  function token() { try { return window.__kynToken || window.__accessToken || window.AuthSessionManager?.getToken?.() || localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || ''; } catch (_) { return ''; } }
  function me() { try { return String(window._kynCurrentUserId || localStorage.getItem('userId') || localStorage.getItem('currentUserId') || window.KynectaMessageE2E?.getMyUserId?.() || ''); } catch (_) { return ''; } }
  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const t = token(); if (t) headers.Authorization = `Bearer ${t}`;
    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const r = await fetch(base() + path, { ...options, headers });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success === false || d.status === 'error') throw new Error(d.message || d.error || `Request failed (${r.status})`);
    return d;
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const old = document.querySelector(`script[data-necpra-group-crypto="${src}"]`);
      if (old) return resolve();
      const s = document.createElement('script'); s.src = src; s.async = false; s.dataset.necpraGroupCrypto = src;
      s.onload = resolve; s.onerror = reject; (document.head || document.documentElement).appendChild(s);
    });
  }
  async function e2e() {
    if (X.crypto) return X.crypto;
    X.crypto = (async () => {
      if (!window.KynectaE2EIdentity) await loadScript('/js/e2e-identity-core.js');
      if (!window.KynectaRatchet) await loadScript('/js/e2e-ratchet-v3.js');
      if (!window.KynectaMessageE2E) await loadScript('/js/message-e2e-core.js');
      await window.KynectaMessageE2E.init();
      return window.KynectaMessageE2E;
    })().catch(err => { X.crypto = null; throw err; });
    return X.crypto;
  }
  function envelope(content) { try { const o = JSON.parse(content); return o && o.v === 6 && o.kind === 'group-e2e-fanout' ? o : null; } catch (_) { return null; } }
  function b64(bytes) { let s = ''; const a = new Uint8Array(bytes); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  async function senderKey() {
    const id = me(); if (!id) throw new Error('User identity unavailable');
    const keyName = `necpra_group_sender_key_${id}`;
    let raw = localStorage.getItem(keyName); const wc = window.crypto;
    if (!raw) { raw = b64(wc.getRandomValues(new Uint8Array(32))); localStorage.setItem(keyName, raw); }
    return wc.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async function senderCopy(text) {
    const key = await senderKey(), wc = window.crypto, iv = wc.getRandomValues(new Uint8Array(12));
    const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function senderOpen(copy) {
    try { const key = await senderKey(), wc = window.crypto; const pt = await wc.subtle.decrypt({ name: 'AES-GCM', iv: unb64(copy.iv) }, key, unb64(copy.ct)); return new TextDecoder().decode(pt); }
    catch (_) { return '🔒 Unable to decrypt your local group copy.'; }
  }
  async function members(gid) {
    const r = await api(`/chats/${encodeURIComponent(gid)}`); const chat = r?.data?.chat || r?.data || {};
    return Array.isArray(chat.participants) ? chat.participants : [];
  }
  async function encryptText(text, gid) {
    const e = await e2e(), uid = Number(me()); if (!uid) throw new Error('E2E identity unavailable');
    const ps = await members(gid), ids = [...new Set(ps.map(p => Number(p.id || p.userId)).filter(id => id > 0 && id !== uid))];
    const recipients = {};
    for (const id of ids) recipients[String(id)] = await e.encryptForChat(text, Number(gid), id);
    return JSON.stringify({ v: 6, kind: 'group-e2e-fanout', senderId: uid, recipients, senderCopy: await senderCopy(text) });
  }
  async function decryptText(content, gid, sender) {
    const o = envelope(content); if (!o) return content;
    if (String(sender) === me() && o.senderCopy) return senderOpen(o.senderCopy);
    const entry = o.recipients[String(me())]; if (!entry) return '🔒 This group message is unavailable on this device.';
    try { return await (await e2e()).decryptFromChat(entry, Number(gid), Number(sender), false, `group-${gid}-${sender || ''}`); }
    catch (err) { console.error('[GroupE2E] decrypt failed:', err.message || err); return '🔒 Unable to decrypt this group message.'; }
  }
  function patchMessage(m) {
    if (!m || m.id == null) return;
    const row = document.querySelector(`[data-message-id="${CSS.escape(String(m.id))}"]`); if (!row) return;
    const el = row.querySelector('.msg-text'); if (!el || el.dataset.necpraDecrypted === '1') return;
    decryptText(m.content, m.chatId || window.__GROUP_CHAT_ID, m.senderId).then(text => { el.textContent = text; el.dataset.necpraDecrypted = '1'; });
  }
  async function syncOpenGroup(gid) {
    if (typeof window.__GROUP_REFRESH_MESSAGES === 'function') {
      try { await window.__GROUP_REFRESH_MESSAGES(); } catch (_) {}
    }
    let r = null;
    try { r = await api(`/messages/${encodeURIComponent(gid)}?limit=100`); } catch (_) {}
    let rows = r?.data?.messages || r?.data || r?.messages || [];
    if (!Array.isArray(rows) || !rows.length) {
      try { const s = await api(`/messages/${encodeURIComponent(gid)}/sync?limit=100`); rows = s?.data || []; } catch (_) { rows = []; }
    }
    if (!Array.isArray(rows)) rows = [];
    setTimeout(() => rows.forEach(patchMessage), 100);
    const incoming = rows.filter(m => Number(m.senderId) !== Number(me())).map(m => Number(m.id)).filter(Boolean);
    if (incoming.length) {
      try { await api('/messages/read', { method: 'POST', body: JSON.stringify({ messageIds: incoming }) }); } catch (_) {}
    }
    if (typeof window.__GROUP_REFRESH_MESSAGES === 'function') {
      try { await window.__GROUP_REFRESH_MESSAGES(); } catch (_) {}
      setTimeout(() => rows.forEach(patchMessage), 100);
    }
  }
  function installComposer() {
    const c = document.querySelector('.composer'), input = document.getElementById('input');
    if (!c || !input || c.dataset.necpraEnhanced === '1') return;
    c.dataset.necpraEnhanced = '1';
    const style = document.createElement('style');
    style.textContent = `.necpra-group-tools{display:flex;align-items:center;gap:5px;flex:0 0 auto}.necpra-group-tool{width:38px!important;height:38px!important;min-width:38px!important;padding:0!important;border-radius:11px!important;display:grid!important;place-items:center!important;border:1px solid var(--border,#dbe3ee)!important;background:var(--surface2,#f1f5f9)!important;color:var(--text,#0f172a)!important;font-size:18px!important;line-height:1!important;flex:0 0 38px!important}.necpra-group-tool:hover{background:var(--surface,#fff)!important;transform:translateY(-1px)}.necpra-group-attach-menu{position:absolute;left:8px;bottom:56px;display:none;min-width:170px;padding:6px;background:var(--surface,#fff);border:1px solid var(--border,#dbe3ee);border-radius:13px;box-shadow:0 10px 30px rgba(0,0,0,.18);z-index:100}.necpra-group-attach-menu.open{display:block}.necpra-group-attach-menu button{width:100%;border:0;background:transparent;color:var(--text,#0f172a);padding:10px 12px;border-radius:9px;text-align:left;display:flex;gap:9px;align-items:center}.necpra-group-attach-menu button:hover{background:var(--surface2,#f1f5f9)}#groupEmojiPicker{max-height:230px!important;overflow-y:auto!important}`;
    document.head.appendChild(style);
    const tools = document.createElement('div'); tools.className = 'necpra-group-tools';
    const emojiBtn = document.createElement('button'); emojiBtn.type = 'button'; emojiBtn.className = 'necpra-group-tool'; emojiBtn.textContent = '😊'; emojiBtn.title = 'Emoji';
    const attachBtn = document.createElement('button'); attachBtn.type = 'button'; attachBtn.className = 'necpra-group-tool'; attachBtn.textContent = '📎'; attachBtn.title = 'Attach';
    const menu = document.createElement('div'); menu.className = 'necpra-group-attach-menu';
    const cameraBtn = document.createElement('button'); cameraBtn.type = 'button'; cameraBtn.innerHTML = '📷 <span>Camera</span>';
    const fileBtn = document.createElement('button'); fileBtn.type = 'button'; fileBtn.innerHTML = '📁 <span>Choose file</span>';
    const camera = document.createElement('input'); camera.type = 'file'; camera.accept = 'image/*,video/*'; camera.capture = 'environment'; camera.hidden = true;
    const files = document.createElement('input'); files.type = 'file'; files.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip'; files.hidden = true;
    menu.append(cameraBtn, fileBtn); c.append(camera, files, menu); tools.append(emojiBtn, attachBtn); c.insertBefore(tools, input);
    const picker = document.createElement('div'); picker.id = 'groupEmojiPicker'; picker.hidden = true;
    picker.style.cssText = 'position:absolute;bottom:58px;left:8px;width:min(340px,calc(100vw - 32px));padding:10px;background:var(--surface,#fff);border:1px solid var(--border,#ddd);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.2);display:grid;grid-template-columns:repeat(8,1fr);gap:3px;z-index:101';
    EMOJIS.forEach(e => { const b=document.createElement('button'); b.type='button'; b.textContent=e; b.style.cssText='border:0;background:transparent;padding:7px;font-size:22px;border-radius:8px;cursor:pointer'; b.onclick=()=>{const a=input.selectionStart||input.value.length,z=input.selectionEnd||a;input.value=input.value.slice(0,a)+e+input.value.slice(z);input.focus();input.selectionStart=input.selectionEnd=a+e.length;}; picker.appendChild(b); });
    c.appendChild(picker);
    emojiBtn.onclick = e => { e.stopPropagation(); picker.hidden=!picker.hidden; menu.classList.remove('open'); };
    attachBtn.onclick = e => { e.stopPropagation(); menu.classList.toggle('open'); picker.hidden=true; };
    cameraBtn.onclick = () => { menu.classList.remove('open'); camera.click(); };
    fileBtn.onclick = () => { menu.classList.remove('open'); files.click(); };
    document.addEventListener('click', e => { if (!menu.contains(e.target) && e.target !== attachBtn) menu.classList.remove('open'); if (!picker.contains(e.target) && e.target !== emojiBtn) picker.hidden=true; });
    camera.onchange = () => { const f=camera.files?.[0]; if(f) upload(f); camera.value=''; };
    files.onchange = () => { const f=files.files?.[0]; if(f) upload(f); files.value=''; };
  }
  async function upload(file) {
    const gid = Number(window.__GROUP_CHAT_ID); if (!gid || X.uploading) return; X.uploading = true;
    const btn = document.querySelector('.necpra-group-tool[title="Attach"]'); if (btn) btn.disabled=true;
    try {
      const fd = new FormData(); fd.append('file', file, file.name);
      const r = await api('/files/upload', { method:'POST', body:fd });
      const d = r.data || r, url = d.url || d.fileUrl || d.mediaUrl;
      if (!url) throw new Error('Upload did not return a media URL');
      const type = d.type === 'image' || file.type.startsWith('image/') ? 'image' : d.type === 'video' || file.type.startsWith('video/') ? 'video' : d.type === 'audio' || file.type.startsWith('audio/') ? 'audio' : 'file';
      await send('', type, { media:{ url, publicId:d.publicId||null, name:d.originalName||file.name, originalName:d.originalName||file.name, mimeType:d.mimeType||file.type, size:d.size||file.size, type } });
    } catch (e) { alert(`Unable to upload file: ${e.message||e}`); }
    finally { X.uploading=false; if(btn) btn.disabled=false; }
  }
  async function send(text, type='text', metadata=null) {
    const gid=Number(window.__GROUP_CHAT_ID); if(!gid) return;
    const content=text ? await encryptText(text,gid) : '';
    const r=await api('/messages',{method:'POST',body:JSON.stringify({chatId:gid,content,type,clientMessageId:`group-${Date.now()}-${Math.random().toString(36).slice(2)}`,metadata})});
    const m=r?.data?.message||r?.data;
    if(m){ window.dispatchEvent(new CustomEvent('kyn:group:message',{detail:{groupId:gid,message:m}})); setTimeout(()=>patchMessage(m),80); }
  }
  function installSendHook() {
    const input=document.getElementById('input'), button=document.getElementById('send'); if(!input||!button||input.dataset.necpraSendHook)return; input.dataset.necpraSendHook='1';
    const submit=e=>{ if(!window.__GROUP_CHAT_ID)return; e.preventDefault(); e.stopImmediatePropagation(); const t=input.value.trim(); if(!t)return; input.value=''; send(t,'text',null).catch(err=>{alert(`Unable to send message: ${err.message||err}`);input.value=t;}); };
    button.addEventListener('click',submit,true); input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey)submit(e)},true);
  }
  function realtime() {
    if(X.realtime)return; X.realtime=true;
    window.addEventListener('message',e=>{const d=e.data;if(!d||typeof d!=='object'||(d.type!=='GROUP_MESSAGE'&&d.type!=='group:message'))return;const m=d.message||d.payload?.message||d.payload,g=d.groupId||d.payload?.groupId||m?.chatId;if(!m||!g)return;if(String(m.senderId)!==me()&&String(window.__GROUP_CHAT_ID)!==String(g)){try{window.parent.postMessage({type:'GROUP_NOTIFICATION',payload:{groupId:Number(g),messageId:m.id}},'*')}catch(_){} } if(String(window.__GROUP_CHAT_ID)===String(g))setTimeout(()=>patchMessage(m),100);});
  }
  function mobileNav() {
    const style=document.createElement('style'); style.textContent='@media(max-width:768px){#layout{width:100%!important;min-width:0!important;max-width:100%!important}#layout.mobile-mode{display:block!important;position:relative!important;height:100%!important;overflow:hidden!important}#layout.mobile-mode .groups-panel,#layout.mobile-mode .chat-panel{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;min-width:0!important}#layout.mobile-mode .groups-panel{display:flex!important;flex-direction:column!important}#layout.mobile-mode .chat-panel{display:flex!important;flex-direction:column!important}#layout.mobile-mode .mobile-hidden{display:none!important;visibility:hidden!important;pointer-events:none!important}#layout.mobile-mode .mobile-visible{display:flex!important;visibility:visible!important;pointer-events:auto!important}}@media(min-width:769px){#layout{display:grid!important;width:100%!important;height:100%!important}.groups-panel,.chat-panel{display:flex!important;visibility:visible!important;pointer-events:auto!important}.groups-panel{flex-direction:column!important}.chat-panel{flex-direction:column!important}}'; document.head.appendChild(style);
    function apply(panel){const l=document.getElementById('layout'),g=document.querySelector('.sidebar'),c=document.querySelector('.panel');if(!l||!g||!c)return;g.classList.add('groups-panel');c.classList.add('chat-panel');if(window.matchMedia?.('(max-width:768px)').matches){l.classList.add('mobile-mode');const chat=panel==='chat';g.classList.toggle('mobile-hidden',chat);g.classList.toggle('mobile-visible',!chat);c.classList.toggle('mobile-hidden',!chat);c.classList.toggle('mobile-visible',chat);}else{l.classList.remove('mobile-mode');g.classList.remove('mobile-hidden','mobile-visible');c.classList.remove('mobile-hidden','mobile-visible');}}
    window.addEventListener('kyn:group:open',()=>{apply('chat');setTimeout(()=>syncOpenGroup(window.__GROUP_CHAT_ID),120)}); window.addEventListener('kyn:group:close',()=>apply('groups')); const run=()=>{apply(window.__GROUP_CHAT_ID?'chat':'groups');installComposer();installSendHook();realtime();}; if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  }
  mobileNav();
})();
