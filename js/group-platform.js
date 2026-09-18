/* Unified group Phase 4/5 UI bridge. Loaded only on group.html by config.js. */
(function () {
  'use strict';
  if (window.__NECPRA_GROUP_PLATFORM__) return;
  window.__NECPRA_GROUP_PLATFORM__ = true;

  const state = { groupId: null, group: null, panel: null, polls: [], events: [], feature: null, busy: false };
  const $ = id => document.getElementById(id);
  const base = () => String(typeof window.__getApiBase === 'function' ? window.__getApiBase() : '').replace(/\/$/, '');
  const token = () => localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token()) headers.Authorization = 'Bearer ' + token();
    const response = await fetch(base() + path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
    return data;
  }

  function installStyles() {
    if ($('groupPlatformStyles')) return;
    const style = document.createElement('style');
    style.id = 'groupPlatformStyles';
    style.textContent = `
      #groupPlatformBtn{width:35px;height:35px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);color:var(--text)}
      #groupPlatformPanel{position:fixed;inset:0;background:#0008;z-index:100;display:none;align-items:flex-end;justify-content:center;padding:10px}
      #groupPlatformPanel.open{display:flex}
      #groupPlatformCard{width:min(720px,100%);max-height:88vh;overflow:auto;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:18px}
      .gp-head{position:sticky;top:0;background:var(--surface);display:flex;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid var(--border);z-index:2}
      .gp-tabs{display:flex;gap:6px;overflow:auto;padding:10px;border-bottom:1px solid var(--border)}
      .gp-tab{border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:9px;padding:7px 10px;font-size:12px;white-space:nowrap}
      .gp-tab.active{background:var(--primary);color:#fff;border-color:var(--primary)}
      .gp-body{padding:12px}.gp-card{border:1px solid var(--border);border-radius:12px;padding:11px;margin-bottom:9px}.gp-row{display:flex;gap:7px;align-items:center}.gp-row>*{min-width:0}.gp-grow{flex:1}.gp-muted{font-size:11px;color:var(--muted)}.gp-btn{border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:9px;padding:7px 9px;font-size:11px}.gp-primary{background:var(--primary);border-color:var(--primary);color:#fff}.gp-danger{background:var(--danger);border-color:var(--danger);color:#fff}.gp-input,.gp-select{width:100%;padding:9px;border:1px solid var(--border);border-radius:9px;background:var(--surface2);color:var(--text);margin:4px 0}.gp-options{display:grid;gap:5px;margin-top:7px}.gp-option{display:flex;justify-content:space-between;gap:8px;padding:7px;border:1px solid var(--border);border-radius:8px}.gp-stat{font-size:22px;font-weight:800}.gp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.gp-statbox{border:1px solid var(--border);border-radius:10px;padding:9px;text-align:center}
      /* Group composer controls: one upload button opens camera/file choices;
         emoji picker is fully hidden until the emoji button is clicked. */
      #groupComposerExtras{display:flex;align-items:center;gap:6px;position:relative;flex:0 0 auto}
      #groupUploadToggle,#groupEmojiToggle{width:40px;height:40px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);color:var(--text);display:flex;align-items:center;justify-content:center;padding:0;font-size:18px}
      #groupUploadMenu{position:absolute;left:0;bottom:48px;display:none;min-width:150px;padding:6px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:50}
      #groupUploadMenu.open{display:flex;flex-direction:column;gap:3px}
      #groupUploadMenu button{border:0;background:transparent;color:var(--text);padding:9px 11px;text-align:left;border-radius:8px}
      #groupUploadMenu button:hover{background:var(--surface2)}
      #groupEmojiPicker{position:absolute;left:42px;bottom:48px;width:min(280px,calc(100vw - 30px));display:none;grid-template-columns:repeat(5,1fr);gap:4px;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:50}
      #groupEmojiPicker.open{display:grid}
      #groupEmojiPicker button{border:0;background:transparent;border-radius:8px;padding:7px;font-size:20px;cursor:pointer}
      #groupEmojiPicker button:hover{background:var(--surface2)}
      #groupUploadBusy{display:none;font-size:11px;color:var(--muted);align-items:center;padding:0 4px}
      #groupUploadBusy.show{display:flex}
      @media(max-width:700px){#groupEmojiPicker{left:0}.composer{gap:5px}.composer textarea{min-width:0}}
    `;
    document.head.appendChild(style);
  }

  function ensureButton() {
    const actions = document.querySelector('.actions');
    if (!actions || $('groupPlatformBtn')) return;
    const button = document.createElement('button');
    button.id = 'groupPlatformBtn';
    button.title = 'Group features';
    button.textContent = '☷';
    button.onclick = openPanel;
    actions.appendChild(button);
  }

  function ensurePanel() {
    if ($('groupPlatformPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'groupPlatformPanel';
    panel.innerHTML = `<div id="groupPlatformCard">
      <div class="gp-head"><div><b>Group OS</b><div id="gpSubtitle" class="gp-muted">Group features</div></div><button id="gpClose" class="gp-btn">×</button></div>
      <div class="gp-tabs"><button class="gp-tab active" data-gp-tab="overview">Overview</button><button class="gp-tab" data-gp-tab="polls">Polls</button><button class="gp-tab" data-gp-tab="events">Events</button><button class="gp-tab" data-gp-tab="moderation">Moderation</button><button class="gp-tab" data-gp-tab="security">Security</button></div>
      <div id="gpBody" class="gp-body"></div>
    </div>`;
    document.body.appendChild(panel);
    state.panel = panel;
    $('gpClose').onclick = () => panel.classList.remove('open');
    panel.addEventListener('click', e => { if (e.target === panel) panel.classList.remove('open'); });
    panel.querySelectorAll('[data-gp-tab]').forEach(button => button.onclick = () => { panel.querySelectorAll('.gp-tab').forEach(x => x.classList.remove('active')); button.classList.add('active'); renderTab(button.dataset.gpTab); });
  }

  // ── Group composer: WhatsApp-style controls without changing the existing
  // send pipeline. The original #send/#input remain authoritative for text.
  // This layer only adds UI for emoji and attachments and invokes the same
  // POST /messages endpoint for uploaded media. ─────────────────────────────
  function resolveUploadToken() {
    try {
      const s = JSON.parse(localStorage.getItem('kynecta_session') || 'null');
      if (s?.token) return s.token;
    } catch (_) {}
    try {
      const s = JSON.parse(localStorage.getItem('kynecta_auth') || 'null');
      if (s?.token) return s.token;
    } catch (_) {}
    return token();
  }

  function ensureComposer() {
    const composer = document.querySelector('.composer');
    const input = $('input');
    if (!composer || !input || $('groupComposerExtras')) return;

    const extras = document.createElement('div');
    extras.id = 'groupComposerExtras';
    extras.innerHTML = `
      <button id="groupUploadToggle" type="button" title="Upload">＋</button>
      <button id="groupEmojiToggle" type="button" title="Emoji">☺</button>
      <div id="groupUploadMenu" role="menu" aria-hidden="true">
        <button type="button" id="groupCameraChoice">📷 Camera</button>
        <button type="button" id="groupFileChoice">📎 File</button>
      </div>
      <div id="groupEmojiPicker" aria-hidden="true"></div>
      <span id="groupUploadBusy">Uploading…</span>
      <input id="groupCameraInput" type="file" accept="image/*" capture="environment" hidden>
      <input id="groupFileInput" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip" hidden>
    `;
    composer.insertBefore(extras, input);

    const emojiSet = ['😀','😂','😍','😊','😉','😢','😮','😡','👍','👎','❤️','🔥','🎉','🙏','👏','😴','🤔','😎','😭','💯','🤣','🥰','😘','😎','🤝','✨','🎓','❤️‍🔥','🙌','💪','👀','🤍','💙','💚','💛','🫶','🥳','😅','😇','🤩','😌','😏','😜','🤗','😎','🤔','😴','🤤','😱','🤯','😤','😭','😡','🤬','🥺','😳','🫡'];
    const picker = $('groupEmojiPicker');
    picker.innerHTML = emojiSet.map(e => `<button type="button" data-emoji="${esc(e)}">${e}</button>`).join('');

    const closePopovers = (except) => {
      if (except !== 'upload') { $('groupUploadMenu')?.classList.remove('open'); $('groupUploadMenu')?.setAttribute('aria-hidden','true'); }
      if (except !== 'emoji') { $('groupEmojiPicker')?.classList.remove('open'); $('groupEmojiPicker')?.setAttribute('aria-hidden','true'); }
    };
    $('groupUploadToggle').onclick = (e) => {
      e.stopPropagation();
      const menu = $('groupUploadMenu');
      const open = !menu.classList.contains('open');
      closePopovers(open ? 'upload' : null);
      if (open) { menu.classList.add('open'); menu.setAttribute('aria-hidden','false'); }
    };
    $('groupEmojiToggle').onclick = (e) => {
      e.stopPropagation();
      const box = $('groupEmojiPicker');
      const open = !box.classList.contains('open');
      closePopovers(open ? 'emoji' : null);
      if (open) { box.classList.add('open'); box.setAttribute('aria-hidden','false'); }
    };
    picker.querySelectorAll('[data-emoji]').forEach(button => button.onclick = () => {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      input.value = input.value.slice(0,start) + button.dataset.emoji + input.value.slice(end);
      input.selectionStart = input.selectionEnd = start + button.dataset.emoji.length;
      input.focus();
      closePopovers();
    });
    $('groupCameraChoice').onclick = () => { closePopovers(); $('groupCameraInput').click(); };
    $('groupFileChoice').onclick = () => { closePopovers(); $('groupFileInput').click(); };

    const handleFile = async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || !state.groupId) return;
      const authToken = resolveUploadToken();
      if (!authToken) return alert('Not signed in — please reload and try again.');
      const busy = $('groupUploadBusy');
      busy.classList.add('show');
      $('groupUploadToggle').disabled = true;
      try {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch(`${base()}/files/upload`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + authToken },
          body: form,
        });
        const uploaded = await response.json().catch(() => ({}));
        if (!response.ok || uploaded.success === false) throw new Error(uploaded.message || `Upload failed (${response.status})`);
        const media = uploaded.data || uploaded;
        const caption = input.value.trim();
        input.value = '';
        const type = ['image','video','audio'].includes(media.type) ? media.type : 'file';
        const messageResponse = await api('/messages', {
          method: 'POST',
          body: JSON.stringify({
            chatId: Number(state.groupId),
            content: caption,
            type,
            clientMessageId: `group-media-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            // BUGFIX (GROUP-UPLOAD-NEVER-RENDERS): this used to write the key
            // "attachment", but every renderer in this codebase — group.html's
            // buildRow()/renderMedia() and js/group-media-render.js — only ever
            // reads metadata.media. With the wrong key, media?.url was always
            // undefined, so the upload silently fell through to plain-text
            // rendering (nothing shown) even though the file uploaded fine and
            // the message was created. Matches js/group-chat-features.js's
            // (unused, but correctly-shaped) reference implementation.
            metadata: { media: { url: media.url, mimeType: media.mimeType, size: media.size, type, name: media.originalName || file.name } },
          }),
        });
        if (!messageResponse?.success && !messageResponse?.data) throw new Error(messageResponse?.message || 'Message was not created');
        if (typeof window.__GROUP_REFRESH_MESSAGES === 'function') await window.__GROUP_REFRESH_MESSAGES();
      } catch (err) {
        alert('Upload failed: ' + err.message);
      } finally {
        busy.classList.remove('show');
        $('groupUploadToggle').disabled = false;
      }
    };
    $('groupCameraInput').addEventListener('change', handleFile);
    $('groupFileInput').addEventListener('change', handleFile);

    document.addEventListener('click', (event) => {
      if (!extras.contains(event.target)) closePopovers();
    });
  }

  async function refresh() {
    if (!state.groupId) return;
    state.busy = true;
    try {
      const r = await api(`/group-platform/${encodeURIComponent(state.groupId)}/state`);
      const data = r.data || {};
      state.feature = data;
      state.polls = data.polls || [];
      state.events = data.events || [];
      $('gpSubtitle').textContent = `${state.group?.name || 'Group'} · synchronized`;
    } catch (e) {
      console.error('[GroupPlatform]', e);
      $('gpSubtitle').textContent = e.message;
    } finally { state.busy = false; }
  }

  async function openPanel() {
    if (!state.groupId) return;
    ensurePanel();
    state.panel.classList.add('open');
    await refresh();
    renderTab('overview');
  }

  function renderTab(tab) {
    if (!state.panel) return;
    const body = $('gpBody');
    if (tab === 'overview') return renderOverview(body);
    if (tab === 'polls') return renderPolls(body);
    if (tab === 'events') return renderEvents(body);
    if (tab === 'moderation') return renderModeration(body);
    if (tab === 'security') return renderSecurity(body);
  }

  function renderOverview(body) {
    const f = state.feature || {};
    body.innerHTML = `<div class="gp-card"><b>Group controls</b><div class="gp-muted">These settings are synchronized with the backend and apply to every device.</div></div>
      <div class="gp-card"><div class="gp-row"><span class="gp-grow">Announcement group</span><button id="gpAnnouncement" class="gp-btn">${f.announcementOnly ? 'ON' : 'OFF'}</button></div><div class="gp-muted">Only administrators should publish announcements.</div></div>
      <div class="gp-card"><label class="gp-muted">Disappearing messages</label><select id="gpDisappear" class="gp-select"><option value="0">Off</option><option value="86400">24 hours</option><option value="604800">7 days</option><option value="2592000">30 days</option><option value="7776000">90 days</option></select><button id="gpDisappearSave" class="gp-btn gp-primary">Save policy</button></div>
      <div class="gp-card"><b>Community</b><div class="gp-row" style="margin-top:7px"><input id="gpCommunity" class="gp-input" placeholder="Community ID to attach this group"><button id="gpCommunitySave" class="gp-btn">Attach</button></div></div>`;
    $('gpDisappear').value = String(f.disappearingSeconds || 0);
    $('gpAnnouncement').onclick = async () => { await api(`/group-platform/${state.groupId}/announcement`, { method:'PUT', body:JSON.stringify({enabled:!f.announcementOnly}) }); await refresh(); renderOverview(body); };
    $('gpDisappearSave').onclick = async () => { await api(`/group-platform/${state.groupId}/disappearing`, { method:'PUT', body:JSON.stringify({seconds:Number($('gpDisappear').value)}) }); await refresh(); renderOverview(body); };
    $('gpCommunitySave').onclick = async () => { const id = $('gpCommunity').value.trim(); if (!id) return; await api(`/group-platform/communities/${encodeURIComponent(id)}/groups/${state.groupId}`, {method:'POST'}); await refresh(); renderOverview(body); };
  }

  function renderPolls(body) {
    body.innerHTML = `<div class="gp-card"><b>Create poll</b><input id="gpPollQ" class="gp-input" placeholder="Question"><input id="gpPollO" class="gp-input" placeholder="Options separated by |"><div class="gp-row"><label class="gp-muted"><input id="gpPollMulti" type="checkbox"> Multiple choices</label><label class="gp-muted"><input id="gpPollAnon" type="checkbox"> Anonymous</label><button id="gpPollCreate" class="gp-btn gp-primary gp-grow">Create</button></div></div><div id="gpPollList"></div>`;
    $('gpPollCreate').onclick = async () => {
      const question = $('gpPollQ').value.trim();
      const options = $('gpPollO').value.split('|').map(x=>x.trim()).filter(Boolean);
      if (!question || options.length < 2) return alert('Enter a question and at least two options.');
      await api(`/group-platform/${state.groupId}/polls`, {method:'POST', body:JSON.stringify({question,options,multiple:$('gpPollMulti').checked,anonymous:$('gpPollAnon').checked})});
      await refresh(); renderPolls(body);
    };
    const list = $('gpPollList');
    if (!state.polls.length) { list.innerHTML = '<div class="gp-card gp-muted">No polls yet.</div>'; return; }
    state.polls.forEach(p => {
      const card = document.createElement('div'); card.className='gp-card';
      card.innerHTML = `<b>${esc(p.question)}</b><div class="gp-options">${(p.options||[]).map(o=>`<button class="gp-option" data-poll="${esc(p.id)}" data-option="${esc(o.id)}"><span>${esc(o.label)}</span><span>${Number(o.votes||0)}</span></button>`).join('')}</div><div class="gp-muted" style="margin-top:6px">${p.closed?'Closed':'Open'} · ${p.multiple?'multiple choice':'single choice'}</div>`;
      list.appendChild(card);
    });
    list.querySelectorAll('[data-poll]').forEach(btn => btn.onclick = async () => { await api(`/group-platform/${state.groupId}/polls/${encodeURIComponent(btn.dataset.poll)}/vote`, {method:'POST',body:JSON.stringify({optionId:btn.dataset.option})}); await refresh(); renderPolls(body); });
  }

  function renderEvents(body) {
    body.innerHTML = `<div class="gp-card"><b>Create event</b><input id="gpEventTitle" class="gp-input" placeholder="Event title"><input id="gpEventDate" class="gp-input" type="datetime-local"><input id="gpEventLocation" class="gp-input" placeholder="Location or meeting link"><textarea id="gpEventDesc" class="gp-input" rows="3" placeholder="Description"></textarea><button id="gpEventCreate" class="gp-btn gp-primary">Create event</button></div><div id="gpEventList"></div>`;
    $('gpEventCreate').onclick = async () => { const startsAt = new Date($('gpEventDate').value); if (!$('gpEventTitle').value.trim() || Number.isNaN(startsAt.getTime())) return alert('Enter a title and date.'); await api(`/group-platform/${state.groupId}/events`, {method:'POST',body:JSON.stringify({title:$('gpEventTitle').value,description:$('gpEventDesc').value,location:$('gpEventLocation').value,startsAt:startsAt.toISOString()})}); await refresh(); renderEvents(body); };
    const list=$('gpEventList'); if(!state.events.length){list.innerHTML='<div class="gp-card gp-muted">No events yet.</div>';return;}
    state.events.forEach(e=>{const c=document.createElement('div');c.className='gp-card';c.innerHTML=`<b>${esc(e.title)}</b><div class="gp-muted">${new Date(e.startsAt).toLocaleString()}${e.location?' · '+esc(e.location):''}</div><p>${esc(e.description||'')}</p><button class="gp-btn" data-rsvp="${esc(e.id)}" data-status="going">I’m going</button> <button class="gp-btn" data-rsvp="${esc(e.id)}" data-status="maybe">Maybe</button>`;list.appendChild(c);});
    list.querySelectorAll('[data-rsvp]').forEach(b=>b.onclick=async()=>{await api(`/group-platform/${state.groupId}/events/${encodeURIComponent(b.dataset.rsvp)}/rsvp`,{method:'POST',body:JSON.stringify({status:b.dataset.status})});await refresh();renderEvents(body);});
  }

  async function renderModeration(body) {
    body.innerHTML='<div class="gp-card gp-muted">Loading moderation dashboard…</div>';
    try {
      const r=await api(`/group-platform/${state.groupId}/moderation`); const d=r.data||{};
      body.innerHTML=`<div class="gp-grid"><div class="gp-statbox"><div class="gp-stat">${d.members||0}</div><div class="gp-muted">Members</div></div><div class="gp-statbox"><div class="gp-stat">${d.messages||0}</div><div class="gp-muted">Messages</div></div><div class="gp-statbox"><div class="gp-stat">${d.admins||0}</div><div class="gp-muted">Admins</div></div></div><div class="gp-card"><b>Recent moderation activity</b><div id="gpAudit" class="gp-muted" style="margin-top:7px"></div></div><div class="gp-card"><b>Group block/report</b><p class="gp-muted">Use the existing member management panel for removal/role changes. Reports are retained in the group audit trail.</p></div>`;
      $('gpAudit').innerHTML=(d.audit||[]).map(x=>`<div style="padding:6px 0;border-bottom:1px solid var(--border)"><b>${esc(x.action)}</b><br><span>${esc(JSON.stringify(x.details||{}))}</span><br><small>${esc(x.createdAt)}</small></div>`).join('')||'No moderation events.';
    } catch(e) { body.innerHTML=`<div class="gp-card">${esc(e.message)}</div>`; }
  }

  function renderSecurity(body) {
    const s=state.feature?.security||{};
    body.innerHTML=`<div class="gp-card"><b>End-to-end group key lifecycle</b><p class="gp-muted">Current key version: ${esc(s.version ?? '—')} · pending rotation: ${s.pendingRotation?'yes':'no'}</p><p class="gp-muted">Membership changes invalidate old encrypted distributions. Devices receive only their own encrypted envelope.</p></div><div class="gp-card"><b>Multi-device sync</b><button id="gpSync" class="gp-btn gp-primary" style="margin-top:7px">Synchronize this device</button><div id="gpSyncResult" class="gp-muted" style="margin-top:7px"></div></div><div class="gp-card"><b>Group calls</b><p class="gp-muted">Signaling is Redis-backed when REDIS_URL is configured, allowing multiple backend instances to serve the same call.</p></div>`;
    $('gpSync').onclick=async()=>{try{const r=await api(`/group-platform/${state.groupId}/sync`);$('gpSyncResult').textContent=`Synchronized at ${new Date(r.data.serverTime).toLocaleTimeString()} · ${r.data.messages.length} new messages.`;window.postMessage({type:'PARENT_REFRESH_GROUPS',payload:{source:'group-platform'}},'*');}catch(e){$('gpSyncResult').textContent=e.message;}};
  }

  window.addEventListener('message', async e => {
    const d=e.data; if(!d||typeof d!=='object') return;
    const p=d.payload||{};
    if(d.type==='GROUP_PANEL_OPEN') { state.groupId=p.id||p.chatId||p.conversationId||null; state.group=p; ensureButton(); ensurePanel(); ensureComposer(); }
    if(d.type==='GROUP_PANEL_CLOSE') { state.groupId=null; if(state.panel) state.panel.classList.remove('open'); }
    if(['group:poll:new','group:poll:updated','group:event:created','group:event:updated','group:announcement:updated','group:disappearing:updated','group:community:updated','group:security:membership_changed'].includes(d.type)) { if(state.groupId && String(p.chatId||p.groupId)===String(state.groupId)) refresh(); }
  });

  function boot(){installStyles();ensureButton();ensurePanel();ensureComposer();}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();