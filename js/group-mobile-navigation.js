/* Necpa group mobile navigation + conversation enhancements. */
(function () {
  'use strict';
  if (!/\/group\.html$/i.test(window.location.pathname)) return;
  if (window.__NECPRA_GROUP_MOBILE_NAV__) return;
  window.__NECPRA_GROUP_MOBILE_NAV__ = true;

  const X = { crypto: null, installed: false, uploading: false, realtime: false };

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
  // BUGFIX (DUPLICATE-DECRYPT-FLIP-TO-FAILED): patchMessage() gets called
  // multiple times for the exact same message id — chat.html forwards a
  // single incoming group message into this iframe via several overlapping
  // paths at once (window.wsService listens on both 'group:message' AND the
  // legacy 'group_message' for the same handler; app.realtime.socket.js's
  // realtimeManager independently relays the same event through its own
  // _routeMessage; a cross-tab/localStorage relay can add a further copy).
  // The old code's only de-dup was `el.dataset.necpraDecrypted === '1'`,
  // checked synchronously — but all the duplicate calls arrive and start
  // their own decryptText() before any of them finishes, so the check never
  // catches them and every one runs a REAL Double Ratchet decrypt attempt
  // against the same one-time, forward-secret message key. The first
  // attempt succeeds and permanently advances the chain; every other
  // (still in-flight) duplicate is now decrypting against an already-moved
  // chain and fails with the exact "V3 failed ... V2 fallback also failed"
  // OperationError seen in the console — and because each writes the bubble
  // text in its own .then() whenever it resolves, a later-resolving failure
  // overwrites the correctly-decrypted text already shown, producing the
  // "decrypts, then instantly flips back to failed" symptom. Fix: memoize
  // by message id so decryptText() (and the ratchet it drives) is invoked
  // at most ONCE per message, no matter how many times patchMessage() is
  // called for it; every duplicate call just awaits the same result.
  const _decryptOnce = new Map(); // messageId -> Promise<string>
  const _pendingPlain = new Map();\n  const _pendingPlain = new Map();
  function patchMessage(m) {
    if (!m || m.id == null) return;
    const row = document.querySelector(`[data-message-id="${CSS.escape(String(m.id))}"]`); if (!row) return;
    const el = row.querySelector('.msg-text'); if (!el || el.dataset.necpraDecrypted === '1') return;
    const key = String(m.id);
    const pendingPlain = m.localId && _pendingPlain.get(String(m.localId));
    if (pendingPlain != null) { el.textContent = pendingPlain; el.dataset.necpraDecrypted = '1'; return; }
    let p = _decryptOnce.get(key);
    if (!p) { p = decryptText(m.content, m.chatId || window.__GROUP_CHAT_ID, m.senderId); _decryptOnce.set(key, p); }
    p.then(text => { el.textContent = text; el.dataset.necpraDecrypted = '1'; });
  }
  async function syncOpenGroup(gid) {
    if (typeof window.__GROUP_REFRESH_MESSAGES === 'function') {
      try { await window.__GROUP_REFRESH_MESSAGES(); } catch (_) {}
    }
    let r = null;
    try { r = await api(`/groups/${encodeURIComponent(gid)}/messages?limit=100`); } catch (_) {}
    let rows = r?.data || r?.data?.messages || r?.messages || [];
    if (!Array.isArray(rows)) rows = [];
    if (!Array.isArray(rows)) rows = [];
    setTimeout(() => rows.forEach(patchMessage), 100);
    const incoming = rows.filter(m => Number(m.senderId) !== Number(me())).map(m => String(m.id)).filter(Boolean);
    if (incoming.length) {
      try { await api(`/groups/${encodeURIComponent(gid)}/messages/read`, { method: 'POST', body: JSON.stringify({ messageIds: incoming }) }); } catch (_) {}
    }
    if (typeof window.__GROUP_REFRESH_MESSAGES === 'function') {
      try { await window.__GROUP_REFRESH_MESSAGES(); } catch (_) {}
      setTimeout(() => rows.forEach(patchMessage), 100);
    }
  }
  // REMOVED (DUPLICATE-COMPOSER-ICONS FIX): this used to build a second,
  // near-identical row of emoji/attach/camera/choose-file controls on top of
  // the ones group-platform.js already installs into the same `.composer`
  // (its #groupComposerExtras: the ＋ upload toggle and ☺ emoji toggle).
  // Both scripts ran unconditionally on every group.html load and both
  // inserted an element with id="groupEmojiPicker", so the two pickers
  // collided by id and the buttons cross-wired unpredictably on top of
  // simply looking duplicated/misaligned. group-platform.js's composer is
  // the one kept; this file now only owns encrypted text sending (below),
  // not composer UI.
  async function send(text, type='text', metadata=null) {
    const gid=String(window.__GROUP_CHAT_ID); if(!gid) return;
    const localId=`group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    _pendingPlain.set(localId,String(text||''));
    window.__NECPRA_GROUP_PENDING_PLAINTEXT?.set?.(String(localId),String(text||''));\n    _pendingPlain.set(localId,String(text||''));\n    window.__NECPRA_GROUP_PENDING_PLAINTEXT?.set?.(String(localId),String(text||''));
    window.dispatchEvent(new CustomEvent('kyn:group:message',{detail:{groupId:gid,message:{id:`pending_${localId}`,localId,senderId:me(),content:text,type,status:'pending',pending:true,createdAt:new Date().toISOString()}}}));
    const content=text ? await encryptText(text,gid) : '';
    const r=await api(`/groups/${encodeURIComponent(gid)}/messages`,{method:'POST',body:JSON.stringify({content,type,localId,metadata})});
    const m=r?.data?.message||r?.data;
    if(m){ window.dispatchEvent(new CustomEvent('kyn:group:message',{detail:{groupId:gid,message:m}})); setTimeout(()=>patchMessage(m),80); _pendingPlain.delete(localId); window.__NECPRA_GROUP_PENDING_PLAINTEXT?.delete?.(String(localId)); }
  }
  window.__NECPRA_GROUP_SEND = send;\n  window.__NECPRA_GROUP_SEND = send;
  function installSendHook() {
    const input=document.getElementById('input'), button=document.getElementById('send'); if(!input||!button||input.dataset.necpraSendHook)return; input.dataset.necpraSendHook='1';
    const submit=e=>{ if(!window.__GROUP_CHAT_ID)return; e.preventDefault(); e.stopImmediatePropagation(); const t=input.value.trim(); if(!t)return; input.value=''; send(t,'text',null).catch(err=>{alert(`Unable to send message: ${err.message||err}`);input.value=t;}); };
    button.addEventListener('click',submit,true); input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey)submit(e)},true);
  }
  async function refreshGroupBadges() {
    try {
      const r=await api('/groups/user');
      const groups=r?.data?.groups||[];
      groups.forEach(group=>{if(group?.id!=null){X.groups.set(String(group.id),String(group.name||'Group'));X.unread.set(String(group.id),Number(group.unreadCount)||0);}});
      badges();
    } catch (_) {}
  }
  function realtime() {
    if(X.realtime)return; X.realtime=true;
    window.addEventListener('message',e=>{const d=e.data;if(!d||typeof d!=='object'||(d.type!=='GROUP_MESSAGE'&&d.type!=='group:message'))return;const m=d.message||d.payload?.message||d.payload,g=d.groupId||d.payload?.groupId||m?.chatId;if(!m||!g)return;if(String(m.senderId)!==me()&&String(window.__GROUP_CHAT_ID)!==String(g)){try{window.parent.postMessage({type:'GROUP_NOTIFICATION',payload:{groupId:Number(g),messageId:m.id}},'*')}catch(_){} } if(String(window.__GROUP_CHAT_ID)===String(g))setTimeout(()=>patchMessage(m),100);});
  }
  function mobileNav() {
    const style=document.createElement('style'); style.textContent='@media(max-width:768px){#layout{width:100%!important;min-width:0!important;max-width:100%!important}#layout.mobile-mode{display:block!important;position:relative!important;height:100%!important;overflow:hidden!important}#layout.mobile-mode .groups-panel,#layout.mobile-mode .chat-panel{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;min-width:0!important}#layout.mobile-mode .groups-panel{display:flex!important;flex-direction:column!important}#layout.mobile-mode .chat-panel{display:flex!important;flex-direction:column!important}#layout.mobile-mode .mobile-hidden{display:none!important;visibility:hidden!important;pointer-events:none!important}#layout.mobile-mode .mobile-visible{display:flex!important;visibility:visible!important;pointer-events:auto!important}}@media(min-width:769px){#layout{display:grid!important;width:100%!important;height:100%!important}.groups-panel,.chat-panel{display:flex!important;visibility:visible!important;pointer-events:auto!important}.groups-panel{flex-direction:column!important}.chat-panel{flex-direction:column!important}}'; document.head.appendChild(style);
    function apply(panel){const l=document.getElementById('layout'),g=document.querySelector('.sidebar'),c=document.querySelector('.panel');if(!l||!g||!c)return;g.classList.add('groups-panel');c.classList.add('chat-panel');if(window.matchMedia?.('(max-width:768px)').matches){l.classList.add('mobile-mode');const chat=panel==='chat';g.classList.toggle('mobile-hidden',chat);g.classList.toggle('mobile-visible',!chat);c.classList.toggle('mobile-hidden',!chat);c.classList.toggle('mobile-visible',chat);}else{l.classList.remove('mobile-mode');g.classList.remove('mobile-hidden','mobile-visible');c.classList.remove('mobile-hidden','mobile-visible');}}
    window.addEventListener('kyn:group:open',()=>{apply('chat');setTimeout(()=>syncOpenGroup(window.__GROUP_CHAT_ID),120)}); window.addEventListener('kyn:group:close',()=>apply('groups')); const run=()=>{apply(window.__GROUP_CHAT_ID?'chat':'groups');installSendHook();realtime();refreshGroupBadges();setInterval(refreshGroupBadges,5000);}; if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  }
  mobileNav();
})();
