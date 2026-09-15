(() => {
  'use strict';

  const state = { chatId: null, chat: null, members: [] };
  const apiBase = () => {
    const b = typeof window.__getApiBase === 'function' ? window.__getApiBase() : (window.API_BASE_URL || '');
    return String(b).replace(/\/$/, '');
  };
  const token = () => localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token()) headers.Authorization = 'Bearer ' + token();
    const r = await fetch(apiBase() + path, { ...options, headers });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || `Request failed (${r.status})`);
    return d;
  }
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  function ensureStyle() {
    if (document.getElementById('groupAdvancedStyle')) return;
    const s = document.createElement('style'); s.id = 'groupAdvancedStyle';
    s.textContent = `
      #groupAdvancedPanel{position:fixed;inset:0;background:#0008;z-index:9990;display:grid;place-items:center;padding:14px}
      #groupAdvancedPanel.hidden{display:none}
      .ga-card{width:min(620px,100%);max-height:88vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#111);border:1px solid var(--border,#ddd);border-radius:18px;box-shadow:0 20px 60px #0005}
      .ga-head{display:flex;align-items:center;justify-content:space-between;padding:15px;border-bottom:1px solid var(--border,#ddd);position:sticky;top:0;background:var(--surface,#fff)}
      .ga-head b{font-size:16px}.ga-close{border:0;background:transparent;font-size:22px;color:inherit}.ga-body{padding:14px}.ga-section{border:1px solid var(--border,#ddd);border-radius:13px;padding:12px;margin-bottom:10px}.ga-section h3{font-size:12px;margin:0 0 8px}.ga-row{display:flex;gap:7px;flex-wrap:wrap}.ga-btn{padding:9px 11px;border:1px solid var(--border,#ddd);border-radius:10px;background:var(--surface2,#f1f5f9);color:inherit}.ga-btn.primary{background:var(--primary,#2563eb);color:#fff;border-color:var(--primary,#2563eb)}.ga-btn.danger{background:#dc2626;color:#fff;border-color:#dc2626}.ga-result{font-size:12px;line-height:1.45;max-height:240px;overflow:auto;margin-top:8px}.ga-item{padding:8px;border-bottom:1px solid var(--border,#ddd)}.ga-input{width:100%;padding:9px;border:1px solid var(--border,#ddd);border-radius:9px;background:var(--surface2,#f1f5f9);color:inherit;margin-bottom:7px}
    `;
    document.head.appendChild(s);
  }

  function ensureButton() {
    const actions = document.querySelector('.actions');
    if (!actions || actions.querySelector('#groupAdvancedBtn')) return;
    const b = document.createElement('button'); b.id = 'groupAdvancedBtn'; b.textContent = '⋯'; b.title = 'More group features';
    b.onclick = openPanel; actions.appendChild(b);
  }

  function panel() {
    ensureStyle();
    let p = document.getElementById('groupAdvancedPanel');
    if (p) return p;
    p = document.createElement('div'); p.id = 'groupAdvancedPanel'; p.className = 'hidden';
    p.innerHTML = `<div class="ga-card"><div class="ga-head"><b>Group features</b><button class="ga-close">×</button></div><div class="ga-body">
      <div class="ga-section"><h3>Group management</h3><div class="ga-row"><button class="ga-btn primary" data-ga="invite">🔗 Invite link</button><button class="ga-btn" data-ga="requests">👥 Join requests</button><button class="ga-btn" data-ga="transfer">👑 Transfer ownership</button><button class="ga-btn" data-ga="leave">↩ Leave group</button></div><div id="gaManage" class="ga-result"></div></div>
      <div class="ga-section"><h3>Messages</h3><input id="gaSearch" class="ga-input" placeholder="Search messages in this group…"><div class="ga-row"><button class="ga-btn primary" data-ga="search">🔎 Search</button><button class="ga-btn" data-ga="pinned">📌 Pinned messages</button></div><div id="gaMessages" class="ga-result"></div></div>
      <div class="ga-section"><h3>Privacy</h3><div class="ga-row"><button class="ga-btn" data-ga="disappear-off">Disappearing off</button><button class="ga-btn" data-ga="disappear-24">24 hours</button><button class="ga-btn" data-ga="disappear-7">7 days</button><button class="ga-btn" data-ga="disappear-30">30 days</button></div></div>
    </div></div>`;
    document.body.appendChild(p);
    p.querySelector('.ga-close').onclick = () => p.classList.add('hidden');
    p.addEventListener('click', e => { const b=e.target.closest('[data-ga]'); if(b) action(b.dataset.ga); });
    return p;
  }

  async function loadMembers() {
    if (!state.chatId) return [];
    const r = await api(`/group-admin/${encodeURIComponent(state.chatId)}/members`); state.members = r.data || []; return state.members;
  }

  async function action(type) {
    if (!state.chatId) return alert('Open a group first.');
    const out = document.getElementById('gaManage'); const msgs = document.getElementById('gaMessages');
    try {
      if (type === 'invite') {
        const r = await api(`/group-admin/${state.chatId}/invites`, { method:'POST', body:'{}' });
        const tokenValue = r.data.token;
        const url = `${location.origin}/group.html?invite=${encodeURIComponent(tokenValue)}`;
        try { await navigator.clipboard.writeText(url); } catch (_) {}
        out.innerHTML = `<div class="ga-item"><b>Invite link created.</b><br><code>${esc(url)}</code><br><small>${navigator.clipboard?'Copied to clipboard when permitted.':''}</small></div>`;
      } else if (type === 'requests') {
        const r = await api(`/group-admin/${state.chatId}/join-requests`); const rows=r.data||[];
        out.innerHTML = rows.length ? rows.map(x=>`<div class="ga-item"><b>${esc(x.user?.firstName||x.user?.username||x.userId)}</b> requested to join <button class="ga-btn" data-jr="${esc(x.id)}" data-action="approve">Approve</button> <button class="ga-btn danger" data-jr="${esc(x.id)}" data-action="reject">Reject</button></div>`).join('') : 'No pending join requests.';
        out.querySelectorAll('[data-jr]').forEach(b=>b.onclick=async()=>{await api(`/group-admin/${state.chatId}/join-requests/${encodeURIComponent(b.dataset.jr)}`,{method:'PATCH',body:JSON.stringify({action:b.dataset.action})});action('requests');});
      } else if (type === 'transfer') {
        const members = await loadMembers(); const candidates=members.filter(m=>String(m.id)!==String(state.chat?.createdBy));
        if(!candidates.length) return out.textContent='There is no other member to transfer ownership to.';
        const id=prompt('Enter the member user ID to become the new owner:\n'+candidates.map(m=>`${m.id} — ${m.user?.username||m.user?.firstName||'member'}`).join('\n'));
        if(!id)return; await api(`/group-admin/${state.chatId}/ownership`,{method:'PATCH',body:JSON.stringify({userId:Number(id)})}); out.textContent='Ownership transferred successfully.';
      } else if (type === 'leave') {
        if(!confirm('Leave this group?'))return; await api(`/group-admin/${state.chatId}/leave`,{method:'POST',body:'{}'}); out.textContent='You left the group.'; window.postMessage({type:'PARENT_REFRESH_GROUPS',source:'groups'},'*');
      } else if (type === 'search') {
        const q=document.getElementById('gaSearch').value.trim(); if(q.length<2)return alert('Enter at least 2 characters.'); const r=await api(`/group-admin/${state.chatId}/messages/search?q=${encodeURIComponent(q)}`); const rows=r.data||[]; msgs.innerHTML=rows.length?rows.map(x=>`<div class="ga-item"><b>#${x.id}</b> ${esc(x.content||'')}<br><small>${esc(x.createdAt||'')}</small></div>`).join(''):'No matching messages.';
      } else if (type === 'pinned') {
        const r=await api(`/group-admin/${state.chatId}/messages/pinned`); const rows=r.data||[]; msgs.innerHTML=rows.length?rows.map(x=>`<div class="ga-item">📌 <b>#${x.id}</b> ${esc(x.content||'')}</div>`).join(''):'No pinned messages.';
      } else if (type.startsWith('disappear-')) {
        const values={'disappear-off':0,'disappear-24':86400,'disappear-7':604800,'disappear-30':2592000}; const seconds=values[type]; await api(`/group-admin/${state.chatId}/settings`,{method:'PATCH',body:JSON.stringify({settings:{disappearingSeconds:seconds}})}); alert(seconds?'Disappearing messages enabled for future messages.':'Disappearing messages disabled.');
      }
    } catch(e) { out.textContent = e.message; }
  }

  function openPanel() { if(!state.chatId)return; panel().classList.remove('hidden'); }

  // Observe the existing group's network calls. This avoids duplicating the
  // group-open state or introducing another conversation implementation.
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this,args);
    try {
      const url = String(args[0]?.url || args[0] || '');
      const match = url.match(/\/api\/chats\/(\d+)(?:\?|$)/);
      if (match && response.ok) {
        const clone = response.clone(); const data = await clone.json().catch(()=>null); const chat=data?.data?.chat||data?.data||data?.chat||data;
        if (chat?.id) { state.chatId=String(chat.id); state.chat=chat; ensureButton(); }
      }
    } catch (_) {}
    return response;
  };

  document.addEventListener('DOMContentLoaded', () => { ensureButton(); });
  setInterval(ensureButton, 1000);

  // Invite links can be opened directly. Resolve and join after authentication
  // is available; the parent shell can then open the resulting conversation.
  async function consumeInvite() {
    const tokenValue = new URLSearchParams(location.search).get('invite'); if(!tokenValue)return;
    try { const info=await api(`/group-admin/invite/${encodeURIComponent(tokenValue)}`); if(confirm(`Join ${info.data.name||'this group'}?`)){const joined=await api(`/group-admin/invite/${encodeURIComponent(tokenValue)}/join`,{method:'POST',body:'{}'}); if(joined.data?.chatId)window.postMessage({type:'OPEN_GROUP_BY_ID',payload:{groupId:joined.data.chatId},source:'groups'},'*');} } catch(e) { console.warn('[GroupInvite]',e.message); }
  }
  setTimeout(consumeInvite, 1200);
})();
