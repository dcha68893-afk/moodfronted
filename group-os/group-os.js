/**
 * group-os.js — Smart Group Operating System Frontend
 * 
 * Tabs: Tasks | Events | Polls | Notes | Files | Finances | Analytics | AI
 * - Offline-first: queues mutations in IndexedDB when offline
 * - Realtime: listens to group:task:*, group:poll:*, etc. socket events
 * - Mobile-first: optimised for low-end Android on unstable connections
 * - Modular: each tab is lazy-loaded only when first activated
 */
'use strict';

(function GroupOS() {
    const BASE = '/api/groups';
    let _groupId  = null;
    let _userId   = null;
    let _role     = 'member';
    let _modules  = ['tasks','events','polls','notes','files'];
    let _container = null;
    let _activeTab = null;
    let _offlineQueue = [];   // mutations while offline
    let _idbReady    = false;

    // ── Auth token ──────────────────────────────────────────────────────
    function _tok() {
        return localStorage.getItem('authToken') || localStorage.getItem('token') || '';
    }

    // ── API helper ──────────────────────────────────────────────────────
    async function _api(method, path, body) {
        const opts = { method, headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+_tok() } };
        if (body) opts.body = JSON.stringify(body);
        try {
            const r = await fetch(BASE + path, opts);
            const d = await r.json();
            if (!d.success) throw new Error(d.message || 'API error');
            return d.data;
        } catch(err) {
            if (!navigator.onLine) {
                _queueOffline(method, path, body);
                return null;
            }
            throw err;
        }
    }

    // ── Offline queue ───────────────────────────────────────────────────
    function _queueOffline(method, path, body) {
        _offlineQueue.push({ method, path, body, ts: Date.now() });
        try { localStorage.setItem('gos_offline_queue_'+_groupId, JSON.stringify(_offlineQueue)); } catch(_){}
        _showToast('Saved offline — will sync when connected', 'warning');
    }

    async function _flushOfflineQueue() {
        const stored = localStorage.getItem('gos_offline_queue_'+_groupId);
        if (stored) { try { _offlineQueue = JSON.parse(stored); } catch(_){} }
        if (!_offlineQueue.length) return;
        const pending = [..._offlineQueue];
        _offlineQueue = [];
        localStorage.removeItem('gos_offline_queue_'+_groupId);
        for (const item of pending) {
            try { await _api(item.method, item.path, item.body); } catch(_) {}
        }
        _showToast('Offline changes synced ✓', 'success');
    }

    window.addEventListener('online', () => { if (_groupId) _flushOfflineQueue(); });

    // ── Toast ────────────────────────────────────────────────────────────
    function _showToast(msg, type = 'info') {
        const colors = { info:'#667eea', success:'#34d399', warning:'#f59e0b', error:'#ef4444' };
        const t = document.createElement('div');
        t.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99999;background:${colors[type]||colors.info};color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none;white-space:nowrap`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); }, 2500);
    }

    // ── Tab definitions ──────────────────────────────────────────────────
    const TABS = {
        tasks:    { icon:'✓', label:'Tasks',    render: renderTasks    },
        events:   { icon:'📅', label:'Events',  render: renderEvents   },
        polls:    { icon:'📊', label:'Polls',   render: renderPolls    },
        notes:    { icon:'📝', label:'Notes',   render: renderNotes    },
        files:    { icon:'📁', label:'Files',   render: renderFiles    },
        finances: { icon:'💰', label:'Wallet',  render: renderFinances },
        analytics:{ icon:'📈', label:'Stats',   render: renderAnalytics},
        ai:       { icon:'🤖', label:'AI',      render: renderAI       },
    };

    // ── Main render ──────────────────────────────────────────────────────
    function _buildShell() {
        _container.innerHTML = `
        <div class="gos-root" style="display:flex;flex-direction:column;height:100%;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <div class="gos-tabs" id="gosTabs" style="display:flex;overflow-x:auto;background:#fff;border-bottom:1px solid rgba(0,0,0,.08);padding:0 4px;scrollbar-width:none;-webkit-overflow-scrolling:touch;flex-shrink:0;"></div>
          <div class="gos-body" id="gosBody" style="flex:1;overflow-y:auto;padding:0;-webkit-overflow-scrolling:touch;"></div>
        </div>`;
        _renderTabs();
        _openTab(_modules[0] || 'tasks');
        _wireSocketEvents();
    }

    function _renderTabs() {
        const el = document.getElementById('gosTabs');
        if (!el) return;
        el.innerHTML = _modules.map(m => {
            const t = TABS[m]; if (!t) return '';
            return `<button data-tab="${m}" onclick="GroupOS.openTab('${m}')" style="flex-shrink:0;padding:12px 14px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:600;color:#6b7280;display:flex;flex-direction:column;align-items:center;gap:2px;border-bottom:2px solid transparent;white-space:nowrap;">
                <span style="font-size:16px">${t.icon}</span><span>${t.label}</span>
            </button>`;
        }).join('');
    }

    function _openTab(name) {
        _activeTab = name;
        document.querySelectorAll('#gosTabs [data-tab]').forEach(btn => {
            const active = btn.dataset.tab === name;
            btn.style.color          = active ? '#667eea' : '#6b7280';
            btn.style.borderBottom   = active ? '2px solid #667eea' : '2px solid transparent';
        });
        const body = document.getElementById('gosBody');
        if (!body) return;
        body.innerHTML = `<div style="text-align:center;padding:40px;color:#9ca3af"><span style="font-size:24px">⏳</span><p>Loading...</p></div>`;
        const tab = TABS[name];
        if (tab) tab.render(body).catch(err => {
            body.innerHTML = `<div style="padding:20px;color:#ef4444">Error: ${err.message}</div>`;
        });
    }

    // ════════════════════════════════════════════════════════════════════
    // TASKS TAB
    // ════════════════════════════════════════════════════════════════════
    async function renderTasks(body) {
        const data = await _api('GET', `/${_groupId}/tasks?limit=50`) || { tasks:[], total:0 };
        const canManage = ['admin','owner','moderator'].includes(_role);

        body.innerHTML = `
        <div style="padding:16px">
          ${canManage ? `<button onclick="GroupOS.createTask()" style="${_btnStyle('#667eea')}">+ New Task</button>` : ''}
          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            ${['all','pending','active','completed','overdue'].map(s =>
              `<button onclick="GroupOS.filterTasks('${s}')" data-status="${s}" style="${_chipStyle()}">${s}</button>`
            ).join('')}
          </div>
          <div id="taskList">${_renderTaskList(data.tasks)}</div>
        </div>`;
    }

    function _renderTaskList(tasks) {
        if (!tasks.length) return `<div style="text-align:center;padding:40px;color:#9ca3af"><span style="font-size:32px">✓</span><p>No tasks yet</p></div>`;
        return tasks.map(t => {
            const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed';
            const colors  = { pending:'#f59e0b', active:'#60a5fa', completed:'#34d399', overdue:'#ef4444', cancelled:'#9ca3af' };
            const color   = overdue ? '#ef4444' : (colors[t.status]||'#9ca3af');
            return `<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,.06);display:flex;align-items:flex-start;gap:12px;">
              <button onclick="GroupOS.toggleTask(${t.id},'${t.status}')" style="width:22px;height:22px;border-radius:50%;border:2px solid ${color};background:${t.status==='completed'?color:'transparent'};cursor:pointer;flex-shrink:0;margin-top:2px;"></button>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14px;color:${t.status==='completed'?'#9ca3af':'#111827'};text-decoration:${t.status==='completed'?'line-through':'none'}">${_esc(t.title)}</div>
                ${t.description ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${_esc(t.description).slice(0,80)}</div>` : ''}
                <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
                  <span style="font-size:11px;background:${color}22;color:${color};padding:2px 8px;border-radius:10px;font-weight:600">${t.priority}</span>
                  ${t.dueDate ? `<span style="font-size:11px;color:${overdue?'#ef4444':'#6b7280'}">${overdue?'⚠ ':''} Due ${new Date(t.dueDate).toLocaleDateString()}</span>` : ''}
                </div>
              </div>
              ${['admin','owner'].includes(_role) ? `<button onclick="GroupOS.deleteTask(${t.id})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:16px;padding:4px">×</button>` : ''}
            </div>`;
        }).join('');
    }

    // ════════════════════════════════════════════════════════════════════
    // POLLS TAB
    // ════════════════════════════════════════════════════════════════════
    async function renderPolls(body) {
        const data = await _api('GET', `/${_groupId}/polls`) || { polls:[] };
        body.innerHTML = `
        <div style="padding:16px">
          <button onclick="GroupOS.createPoll()" style="${_btnStyle('#8b5cf6')}">+ New Poll</button>
          <div id="pollList">${_renderPollList(data.polls)}</div>
        </div>`;
    }

    function _renderPollList(polls) {
        if (!polls.length) return `<div style="text-align:center;padding:40px;color:#9ca3af"><span style="font-size:32px">📊</span><p>No polls yet</p></div>`;
        return polls.map(p => {
            const totalVotes = (p.options||[]).reduce((a,o) => a+(o.voteCount||0), 0);
            const myVotes = p.myVotes || [];
            return `<div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
              <div style="font-weight:700;font-size:15px;color:#111827;margin-bottom:12px">${_esc(p.question)}</div>
              ${(p.options||[]).map(opt => {
                const pct = totalVotes > 0 ? Math.round((opt.voteCount||0)/totalVotes*100) : 0;
                const voted = myVotes.includes(opt.id);
                return `<div style="margin-bottom:8px">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
                    <span style="font-size:13px;font-weight:${voted?'700':'400'};color:${voted?'#667eea':'#374151'}">${opt.emoji||''} ${_esc(opt.text)}</span>
                    <span style="font-size:12px;color:#6b7280">${pct}% (${opt.voteCount||0})</span>
                  </div>
                  <div style="height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${voted?'#667eea':'#94a3b8'};border-radius:3px;transition:width .4s"></div>
                  </div>
                  ${p.status === 'active' ? `<button onclick="GroupOS.vote(${p.id},${opt.id})" style="font-size:11px;background:${voted?'#667eea':'#f1f5f9'};color:${voted?'#fff':'#374151'};border:none;border-radius:8px;padding:4px 10px;margin-top:4px;cursor:pointer">
                    ${voted ? '✓ Voted' : 'Vote'}
                  </button>` : ''}
                </div>`;
              }).join('')}
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:11px;color:#9ca3af">
                <span>${totalVotes} vote${totalVotes!==1?'s':''} · ${p.isAnonymous?'Anonymous':'Public'}</span>
                ${['admin','owner'].includes(_role) && p.status==='active' ? `<button onclick="GroupOS.closePoll(${p.id})" style="font-size:11px;background:#fee2e2;color:#ef4444;border:none;border-radius:8px;padding:4px 10px;cursor:pointer">Close</button>` : `<span style="color:${p.status==='closed'?'#ef4444':'#34d399'}">${p.status}</span>`}
              </div>
            </div>`;
        }).join('');
    }

    // ════════════════════════════════════════════════════════════════════
    // NOTES TAB
    // ════════════════════════════════════════════════════════════════════
    async function renderNotes(body) {
        const data = await _api('GET', `/${_groupId}/notes`) || { notes:[] };
        body.innerHTML = `
        <div style="padding:16px">
          <button onclick="GroupOS.createNote()" style="${_btnStyle('#10b981')}">+ New Note</button>
          <div id="noteList">${_renderNoteList(data.notes)}</div>
        </div>`;
    }

    function _renderNoteList(notes) {
        if (!notes.length) return `<div style="text-align:center;padding:40px;color:#9ca3af"><span style="font-size:32px">📝</span><p>No notes yet</p></div>`;
        return notes.map(n => `
        <div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,.06);cursor:pointer" onclick="GroupOS.viewNote(${n.id})">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            ${n.isPinned ? '<span title="Pinned" style="color:#f59e0b;font-size:14px">📌</span>' : ''}
            <span style="font-weight:700;font-size:14px;color:#111827;flex:1">${_esc(n.title)}</span>
            ${['admin','owner'].includes(_role)||String(n.createdBy)===String(_userId) ? `<button onclick="event.stopPropagation();GroupOS.deleteNote(${n.id})" style="background:none;border:none;color:#ef4444;cursor:pointer">×</button>` : ''}
          </div>
          ${n.content ? `<p style="font-size:12px;color:#6b7280;margin:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${_esc(n.content).slice(0,120)}</p>` : ''}
          <div style="margin-top:6px;font-size:11px;color:#9ca3af">${new Date(n.updatedAt||n.createdAt).toLocaleDateString()} · v${n.version||1}</div>
        </div>`).join('');
    }

    // ════════════════════════════════════════════════════════════════════
    // FILES TAB
    // ════════════════════════════════════════════════════════════════════
    async function renderFiles(body) {
        const data = await _api('GET', `/${_groupId}/group-files`) || { files:[] };
        body.innerHTML = `
        <div style="padding:16px">
          <button onclick="GroupOS.uploadFile()" style="${_btnStyle('#f59e0b')}">+ Upload File</button>
          <div id="fileList">${_renderFileList(data.files)}</div>
        </div>`;
    }

    function _renderFileList(files) {
        if (!files.length) return `<div style="text-align:center;padding:40px;color:#9ca3af"><span style="font-size:32px">📁</span><p>No files yet</p></div>`;
        const icons = { 'image':'🖼', 'video':'🎬', 'audio':'🎵', 'application/pdf':'📄', 'text':'📃' };
        return files.map(f => {
            const icon = Object.entries(icons).find(([k])=>f.mimeType?.startsWith(k))?.[1] || '📎';
            const size = f.sizeBytes > 1048576 ? (f.sizeBytes/1048576).toFixed(1)+'MB' : f.sizeBytes > 1024 ? (f.sizeBytes/1024).toFixed(0)+'KB' : f.sizeBytes+'B';
            return `<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,.06);display:flex;align-items:center;gap:12px;">
              <span style="font-size:28px;flex-shrink:0">${icon}</span>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13px;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(f.name)}</div>
                <div style="font-size:11px;color:#9ca3af;margin-top:2px">${size} · ${f.downloadCount||0} downloads</div>
              </div>
              <a href="${f.url}" download target="_blank" style="background:#f1f5f9;border:none;border-radius:8px;padding:8px 12px;font-size:12px;color:#374151;text-decoration:none;cursor:pointer;font-weight:600">↓</a>
              ${['admin','owner'].includes(_role)||String(f.uploadedBy)===String(_userId) ? `<button onclick="GroupOS.deleteFile(${f.id})" style="background:none;border:none;color:#ef4444;cursor:pointer">×</button>` : ''}
            </div>`;
        }).join('');
    }

    // ════════════════════════════════════════════════════════════════════
    // EVENTS TAB
    // ════════════════════════════════════════════════════════════════════
    async function renderEvents(body) {
        const data = await _api('GET', `/${_groupId}/smart-events?upcoming=true`) || { events:[] };
        body.innerHTML = `
        <div style="padding:16px">
          ${['admin','owner','moderator'].includes(_role) ? `<button onclick="GroupOS.createEvent()" style="${_btnStyle('#3b82f6')}">+ New Event</button>` : ''}
          <div id="eventList">${_renderEventList(data.events)}</div>
        </div>`;
    }

    function _renderEventList(events) {
        if (!events.length) return `<div style="text-align:center;padding:40px;color:#9ca3af"><span style="font-size:32px">📅</span><p>No upcoming events</p></div>`;
        return events.map(e => `
        <div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
          ${e.coverImage ? `<img src="${e.coverImage}" style="width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:10px">` : ''}
          <div style="font-weight:700;font-size:15px;color:#111827">${_esc(e.title)}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px">📅 ${new Date(e.startTime).toLocaleString()}</div>
          ${e.location ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">📍 ${_esc(e.location)}</div>` : ''}
          ${e.rsvpEnabled ? `<div style="display:flex;gap:8px;margin-top:10px">
            <button onclick="GroupOS.rsvp(${e.id},'rsvp_yes')" style="${_chipStyle('#34d399')}">✓ Going</button>
            <button onclick="GroupOS.rsvp(${e.id},'rsvp_maybe')" style="${_chipStyle('#f59e0b')}">? Maybe</button>
            <button onclick="GroupOS.rsvp(${e.id},'rsvp_no')" style="${_chipStyle('#ef4444')}">✗ No</button>
          </div>` : ''}
        </div>`).join('');
    }

    // ════════════════════════════════════════════════════════════════════
    // FINANCES TAB
    // ════════════════════════════════════════════════════════════════════
    async function renderFinances(body) {
        const data = await _api('GET', `/${_groupId}/finances`) || { transactions:[], balance:0 };
        const bal  = data.balance || 0;
        body.innerHTML = `
        <div style="padding:16px">
          <div style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:16px;padding:20px;color:#fff;margin-bottom:16px;text-align:center">
            <div style="font-size:12px;opacity:.8;margin-bottom:4px">Group Balance</div>
            <div style="font-size:32px;font-weight:800">${data.currency||'KES'} ${Math.abs(bal).toLocaleString()}</div>
            <div style="font-size:12px;opacity:.7;margin-top:4px">${bal>=0?'Surplus':'Deficit'}</div>
          </div>
          ${['admin','owner'].includes(_role) ? `<button onclick="GroupOS.addTransaction()" style="${_btnStyle('#059669')}">+ Add Transaction</button>` : ''}
          <div id="txList">${_renderTxList(data.transactions)}</div>
        </div>`;
    }

    function _renderTxList(txs) {
        if (!txs.length) return `<div style="text-align:center;padding:30px;color:#9ca3af">No transactions yet</div>`;
        const typeColors = { income:'#34d399', expense:'#ef4444', transfer:'#60a5fa', levy:'#f59e0b' };
        return txs.map(t => `
        <div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,.06);display:flex;align-items:center;gap:12px">
          <div style="width:40px;height:40px;border-radius:50%;background:${typeColors[t.type]||'#9ca3af'}22;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
            ${{income:'💰',expense:'💸',transfer:'🔄',levy:'📋'}[t.type]||'💳'}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px;color:#111827">${_esc(t.description||t.category||t.type)}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px">${new Date(t.createdAt).toLocaleDateString()} · ${t.status}</div>
          </div>
          <div style="font-weight:700;font-size:15px;color:${typeColors[t.type]||'#9ca3af'};flex-shrink:0">${['income','levy'].includes(t.type)?'+':'-'}${t.currency||'KES'} ${parseFloat(t.amount).toLocaleString()}</div>
        </div>`).join('');
    }

    // ════════════════════════════════════════════════════════════════════
    // ANALYTICS TAB
    // ════════════════════════════════════════════════════════════════════
    async function renderAnalytics(body) {
        const data = await _api('GET', `/${_groupId}/analytics?days=30`) || { totals:{}, daily:[], topMembers:[] };
        const t    = data.totals || {};
        const stats = [
            { label:'Messages',        val: t.messages||0,  icon:'💬', color:'#60a5fa' },
            { label:'Tasks Created',   val: t.tasks||0,     icon:'✓',  color:'#34d399' },
            { label:'Tasks Done',      val: t.completed||0, icon:'🏆', color:'#a78bfa' },
            { label:'Events',          val: t.events||0,    icon:'📅', color:'#f59e0b' },
            { label:'Polls',           val: t.polls||0,     icon:'📊', color:'#ec4899' },
            { label:'Files Shared',    val: t.files||0,     icon:'📁', color:'#14b8a6' },
            { label:'New Members',     val: t.newMembers||0,icon:'👤', color:'#8b5cf6' },
        ];
        body.innerHTML = `
        <div style="padding:16px">
          <div style="font-weight:700;font-size:16px;color:#111827;margin-bottom:12px">Last 30 Days</div>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px">
            ${stats.map(s => `
            <div style="background:#fff;border-radius:14px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
              <div style="font-size:24px;margin-bottom:4px">${s.icon}</div>
              <div style="font-size:24px;font-weight:800;color:${s.color}">${s.val}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:2px">${s.label}</div>
            </div>`).join('')}
          </div>
          ${data.topMembers?.length ? `
          <div style="background:#fff;border-radius:14px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
            <div style="font-weight:700;font-size:14px;color:#111827;margin-bottom:10px">🏆 Most Active Members</div>
            ${data.topMembers.slice(0,5).map((m,i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f1f5f9">
              <span style="font-size:16px;width:24px;text-align:center">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]||i+1}</span>
              <span style="flex:1;font-size:13px;color:#374151">User #${m.userId}</span>
              <span style="font-size:12px;color:#6b7280">${m.actions} actions</span>
            </div>`).join('')}
          </div>` : ''}
        </div>`;
    }

    // ════════════════════════════════════════════════════════════════════
    // AI TAB
    // ════════════════════════════════════════════════════════════════════
    async function renderAI(body) {
        const data = await _api('GET', `/${_groupId}/ai/summary?type=daily`);
        body.innerHTML = `
        <div style="padding:16px">
          <div style="background:linear-gradient(135deg,#667eea,#8b5cf6);border-radius:16px;padding:16px;color:#fff;margin-bottom:16px">
            <div style="font-size:20px;margin-bottom:4px">🤖 AI Summary</div>
            <div style="font-size:12px;opacity:.8">Powered by AI · Updated daily</div>
          </div>
          <button onclick="GroupOS.requestAI()" style="${_btnStyle('#8b5cf6')}">↻ Generate Summary</button>
          <div id="aiContent">
            ${data ? `
            <div style="background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-top:12px">
              <div style="font-size:12px;color:#9ca3af;margin-bottom:8px">Generated ${new Date(data.createdAt).toLocaleString()}</div>
              <p style="font-size:14px;color:#374151;line-height:1.6;margin:0">${_esc(data.summary)}</p>
              ${data.actionItems?.length ? `
              <div style="margin-top:12px">
                <div style="font-weight:700;font-size:13px;color:#111827;margin-bottom:6px">📋 Action Items</div>
                ${data.actionItems.map(a => `<div style="padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#374151">• ${_esc(String(a))}</div>`).join('')}
              </div>` : ''}
              ${data.keywords?.length ? `
              <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">
                ${data.keywords.map(k => `<span style="background:#f1f5f9;color:#374151;font-size:11px;padding:4px 10px;border-radius:20px">${_esc(String(k))}</span>`).join('')}
              </div>` : ''}
            </div>` : `<div style="text-align:center;padding:40px;color:#9ca3af"><span style="font-size:32px">🤖</span><p>No summary yet. Click Generate Summary.</p></div>`}
          </div>
        </div>`;
    }

    // ════════════════════════════════════════════════════════════════════
    // ACTION MODALS
    // ════════════════════════════════════════════════════════════════════
    function _modal(title, html, onOk) {
        const m = document.createElement('div');
        m.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;';
        m.innerHTML = `<div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:20px;max-height:80vh;overflow-y:auto">
          <div style="font-weight:700;font-size:16px;color:#111827;margin-bottom:16px">${title}</div>
          ${html}
          <div style="display:flex;gap:10px;margin-top:16px">
            <button onclick="this.closest('.gos-modal').remove()" style="flex:1;padding:12px;border-radius:12px;border:none;background:#f1f5f9;color:#374151;font-weight:600;cursor:pointer">Cancel</button>
            <button id="gosModalOk" style="flex:1;${_btnStyle('#667eea',true)}">Confirm</button>
          </div>
        </div>`;
        m.classList.add('gos-modal');
        m.querySelector('#gosModalOk').onclick = () => { const r = onOk(m); if (r !== false) m.remove(); };
        m.addEventListener('click', e => { if(e.target===m) m.remove(); });
        document.body.appendChild(m);
        return m;
    }

    function createTask() {
        _modal('New Task', `
          <input id="mTaskTitle" placeholder="Task title *" style="${_inputStyle()}">
          <textarea id="mTaskDesc" placeholder="Description (optional)" style="${_inputStyle('textarea')}"></textarea>
          <div style="display:flex;gap:10px">
            <select id="mTaskPri" style="${_inputStyle()}"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
            <input type="date" id="mTaskDue" style="${_inputStyle()}">
          </div>`, async (m) => {
          const title = m.querySelector('#mTaskTitle').value.trim();
          if (!title) { _showToast('Title required','error'); return false; }
          await _api('POST', `/${_groupId}/tasks`, { title, description: m.querySelector('#mTaskDesc').value, priority: m.querySelector('#mTaskPri').value, dueDate: m.querySelector('#mTaskDue').value||null });
          if (_activeTab==='tasks') _openTab('tasks');
          _showToast('Task created ✓','success');
        });
    }

    async function toggleTask(taskId, currentStatus) {
        const next = currentStatus==='completed' ? 'pending' : 'completed';
        await _api('PUT', `/${_groupId}/tasks/${taskId}`, { status: next });
        if (_activeTab==='tasks') _openTab('tasks');
    }

    async function deleteTask(taskId) {
        if (!confirm('Delete this task?')) return;
        await _api('DELETE', `/${_groupId}/tasks/${taskId}`);
        if (_activeTab==='tasks') _openTab('tasks');
        _showToast('Task deleted','info');
    }

    function createPoll() {
        _modal('New Poll', `
          <input id="mPollQ" placeholder="Question *" style="${_inputStyle()}">
          <div id="mPollOpts">
            <input class="mPollOpt" placeholder="Option 1" style="${_inputStyle('text',true)}">
            <input class="mPollOpt" placeholder="Option 2" style="${_inputStyle('text',true)}">
          </div>
          <button onclick="GroupOS._addPollOpt()" style="font-size:12px;color:#667eea;background:none;border:none;cursor:pointer;padding:4px 0">+ Add option</button>
          <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px">
            <input type="checkbox" id="mPollAnon"> Anonymous poll
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px">
            <input type="checkbox" id="mPollMulti"> Allow multiple choices
          </label>`, async (m) => {
          const question = m.querySelector('#mPollQ').value.trim();
          const options  = [...m.querySelectorAll('.mPollOpt')].map(i=>i.value.trim()).filter(Boolean);
          if (!question || options.length < 2) { _showToast('Question and 2+ options required','error'); return false; }
          await _api('POST', `/${_groupId}/polls`, { question, options, isAnonymous: m.querySelector('#mPollAnon').checked, type: m.querySelector('#mPollMulti').checked?'multiple':'single' });
          if (_activeTab==='polls') _openTab('polls');
          _showToast('Poll created ✓','success');
        });
    }

    function _addPollOpt() {
        const c = document.getElementById('mPollOpts'); if(!c) return;
        const inp = document.createElement('input');
        inp.className='mPollOpt'; inp.placeholder=`Option ${c.children.length+1}`; inp.style.cssText=_inputStyle('text',true);
        c.appendChild(inp); inp.focus();
    }

    async function vote(pollId, optionId) {
        await _api('POST', `/${_groupId}/polls/${pollId}/vote`, { optionIds: [optionId] });
        if (_activeTab==='polls') _openTab('polls');
    }

    async function closePoll(pollId) {
        if (!confirm('Close this poll?')) return;
        await _api('POST', `/${_groupId}/polls/${pollId}/close`);
        if (_activeTab==='polls') _openTab('polls');
    }

    function createNote() {
        _modal('New Note', `
          <input id="mNoteTitle" placeholder="Title *" style="${_inputStyle()}">
          <textarea id="mNoteContent" placeholder="Content (markdown supported)" rows="6" style="${_inputStyle('textarea')}"></textarea>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:8px"><input type="checkbox" id="mNotePin"> Pin this note</label>`, async(m) => {
          const title = m.querySelector('#mNoteTitle').value.trim();
          if (!title) { _showToast('Title required','error'); return false; }
          await _api('POST', `/${_groupId}/notes`, { title, content: m.querySelector('#mNoteContent').value, isPinned: m.querySelector('#mNotePin').checked });
          if (_activeTab==='notes') _openTab('notes');
          _showToast('Note saved ✓','success');
        });
    }

    async function deleteNote(noteId) {
        if (!confirm('Delete this note?')) return;
        await _api('DELETE', `/${_groupId}/notes/${noteId}`);
        if (_activeTab==='notes') _openTab('notes');
    }

    async function viewNote(noteId) {
        const notes = (await _api('GET', `/${_groupId}/notes?limit=100`))?.notes || [];
        const note  = notes.find(n=>n.id===noteId); if (!note) return;
        _modal(_esc(note.title), `<div style="font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap">${_esc(note.content||'(empty)')}</div><div style="margin-top:8px;font-size:11px;color:#9ca3af">Last updated: ${new Date(note.updatedAt||note.createdAt).toLocaleString()}</div>`, ()=>{});
    }

    function uploadFile() {
        const inp = document.createElement('input'); inp.type='file'; inp.multiple=true;
        inp.onchange = async () => {
            for (const file of inp.files) {
                _showToast(`Uploading ${file.name}…`,'info');
                const fd = new FormData(); fd.append('file', file); fd.append('groupId', _groupId);
                try {
                    const r = await fetch('/api/media/upload', { method:'POST', headers:{'Authorization':'Bearer '+_tok()}, body: fd });
                    const d = await r.json();
                    // FIX: handle response from both /api/media/upload and /api/files/upload
                    const url = d.data?.url || d.data?.media?.url || d.url || d.fileUrl || d.mediaUrl;
                    const absUrl = url && url.startsWith('/') 
                        ? `${window.location.protocol}//${window.location.host}${url}` 
                        : url;
                    if (absUrl) {
                        await _api('POST', `/${_groupId}/group-files`, { name: file.name, url: absUrl, mimeType: file.type, sizeBytes: file.size });
                        _showToast(`${file.name} uploaded ✓`,'success');
                        if (_activeTab==='files') _openTab('files');
                    }
                } catch(_) { _showToast('Upload failed','error'); }
            }
        };
        inp.click();
    }

    async function deleteFile(fileId) {
        if (!confirm('Delete this file?')) return;
        await _api('DELETE', `/${_groupId}/group-files/${fileId}`);
        if (_activeTab==='files') _openTab('files');
    }

    function createEvent() {
        _modal('New Event', `
          <input id="mEvtTitle" placeholder="Event title *" style="${_inputStyle()}">
          <textarea id="mEvtDesc" placeholder="Description" style="${_inputStyle('textarea')}"></textarea>
          <input id="mEvtLoc" placeholder="Location" style="${_inputStyle()}">
          <input type="datetime-local" id="mEvtStart" style="${_inputStyle()}">
          <input type="datetime-local" id="mEvtEnd" style="${_inputStyle()}">`, async(m) => {
          const title = m.querySelector('#mEvtTitle').value.trim();
          const start = m.querySelector('#mEvtStart').value;
          if (!title || !start) { _showToast('Title and start time required','error'); return false; }
          await _api('POST', `/${_groupId}/smart-events`, { title, description: m.querySelector('#mEvtDesc').value, location: m.querySelector('#mEvtLoc').value, startTime: new Date(start).toISOString(), endTime: m.querySelector('#mEvtEnd').value ? new Date(m.querySelector('#mEvtEnd').value).toISOString() : null });
          if (_activeTab==='events') _openTab('events');
          _showToast('Event created ✓','success');
        });
    }

    async function rsvp(eventId, status) {
        await _api('POST', `/${_groupId}/smart-events/${eventId}/rsvp`, { status });
        _showToast('RSVP updated ✓','success');
    }

    function addTransaction() {
        _modal('Add Transaction', `
          <select id="mTxType" style="${_inputStyle()}"><option value="income">Income</option><option value="expense">Expense</option><option value="levy">Levy</option><option value="transfer">Transfer</option></select>
          <input id="mTxAmt" type="number" placeholder="Amount *" style="${_inputStyle()}">
          <input id="mTxDesc" placeholder="Description" style="${_inputStyle()}">
          <input id="mTxRef" placeholder="Reference/Receipt No." style="${_inputStyle()}">`, async(m) => {
          const amount = parseFloat(m.querySelector('#mTxAmt').value);
          if (!amount) { _showToast('Amount required','error'); return false; }
          await _api('POST', `/${_groupId}/finances`, { type: m.querySelector('#mTxType').value, amount, description: m.querySelector('#mTxDesc').value, reference: m.querySelector('#mTxRef').value });
          if (_activeTab==='finances') _openTab('finances');
          _showToast('Transaction recorded ✓','success');
        });
    }

    async function requestAI() {
        _showToast('Generating summary…','info');
        await _api('POST', `/${_groupId}/ai/summary`, { type:'daily' });
        setTimeout(() => { if (_activeTab==='ai') _openTab('ai'); }, 3000);
    }

    async function filterTasks(status) {
        const path = status==='all' ? `/${_groupId}/tasks?limit=50` : `/${_groupId}/tasks?status=${status}&limit=50`;
        const data = await _api('GET', path) || { tasks:[] };
        const el   = document.getElementById('taskList');
        if (el) el.innerHTML = _renderTaskList(data.tasks);
    }

    // ════════════════════════════════════════════════════════════════════
    // REALTIME SOCKET WIRING
    // ════════════════════════════════════════════════════════════════════
    function _wireSocketEvents() {
        window.addEventListener('message', evt => {
            if (!evt.data || typeof evt.data !== 'object') return;
            const { type, payload } = evt.data;
            const events = {
                'group:task:created'    : () => { if (_activeTab==='tasks')    _openTab('tasks'); },
                'group:task:updated'    : () => { if (_activeTab==='tasks')    _openTab('tasks'); },
                'group:task:deleted'    : () => { if (_activeTab==='tasks')    _openTab('tasks'); },
                'group:poll:created'    : () => { if (_activeTab==='polls')    _openTab('polls'); },
                'group:poll:voted'      : () => { if (_activeTab==='polls')    _openTab('polls'); },
                'group:poll:closed'     : () => { if (_activeTab==='polls')    _openTab('polls'); },
                'group:note:created'    : () => { if (_activeTab==='notes')    _openTab('notes'); },
                'group:note:updated'    : () => { if (_activeTab==='notes')    _openTab('notes'); },
                'group:note:deleted'    : () => { if (_activeTab==='notes')    _openTab('notes'); },
                'group:file:uploaded'   : () => { if (_activeTab==='files')    _openTab('files'); },
                'group:event:created'   : () => { if (_activeTab==='events')   _openTab('events'); },
                'group:finance:created' : () => { if (_activeTab==='finances') _openTab('finances'); },
                'group:ai:summary_ready': () => { if (_activeTab==='ai')       _openTab('ai'); },
            };
            const canonical = type?.replace('REALTIME_EVENT:','');
            if (events[canonical] && payload?.groupId && String(payload.groupId)===String(_groupId)) events[canonical]();
        });
    }

    // ════════════════════════════════════════════════════════════════════
    // STYLE HELPERS
    // ════════════════════════════════════════════════════════════════════
    function _btnStyle(bg, inline=false) {
        return `background:${bg};color:#fff;border:none;border-radius:12px;padding:${inline?'12px 0':'12px'};font-size:13px;font-weight:700;cursor:pointer;width:${inline?'auto':'100%'};margin-bottom:12px;`;
    }
    function _chipStyle(color='#667eea') {
        return `background:${color}22;color:${color};border:none;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;`;
    }
    function _inputStyle(type='text', small=false) {
        return `width:100%;padding:12px;border-radius:12px;border:1px solid rgba(0,0,0,.1);font-size:13px;box-sizing:border-box;${small?'':'margin-bottom:10px;'}background:#f8fafc;color:#111827;${type==='textarea'?'height:100px;resize:vertical;font-family:inherit;margin-bottom:10px;':''}`;
    }
    function _esc(str) {
        return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ════════════════════════════════════════════════════════════════════
    async function mount(containerId, groupId, userId, role) {
        _container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!_container) return console.error('[GroupOS] Container not found');
        _groupId = groupId; _userId = userId; _role = role || 'member';
        // Load enabled modules
        try { _modules = await _api('GET', `/${groupId}/modules`) || _modules; } catch(_) {}
        // Always show analytics + AI for admins
        if (['admin','owner'].includes(_role)) {
            if (!_modules.includes('analytics')) _modules.push('analytics');
            if (!_modules.includes('ai')) _modules.push('ai');
        }
        _buildShell();
        _flushOfflineQueue();
        console.log('[GroupOS] ✅ Mounted for group', groupId);
    }

    window.GroupOS = {
        mount, openTab: _openTab,
        createTask, toggleTask, deleteTask, filterTasks,
        createPoll, vote, closePoll, _addPollOpt,
        createNote, deleteNote, viewNote,
        uploadFile, deleteFile,
        createEvent, rsvp,
        addTransaction, requestAI,
    };
    console.log('[GroupOS] Loaded');
})();