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
    // FIX: Was hardcoded '/api/groups' — fails in iframe since relative URL
    // hits the frontend server (nexopa.onrender.com/api/groups → 404).
    // Now resolves the backend API base from the window context (set by group.html)
    // or falls back to the known production backend URL.
    const _apiOrigin = (
        window.__API_BASE_URL ||
        window.__kynApiBase ||
        window.__API_BASE ||
        (window.__getApiBase && window.__getApiBase()) ||
        'https://nexora-3bla.onrender.com/api'
    ).replace(/\/$/, '');
    const BASE = _apiOrigin.endsWith('/api')
        ? _apiOrigin + '/groups'
        : _apiOrigin + '/api/groups';
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
        <div class="gos-root" style="display:flex;flex-direction:column;height:100%;min-height:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;flex:1;">
          <div class="gos-tabs" id="gosTabs" style="display:flex;overflow-x:auto;background:#fff;border-bottom:1px solid rgba(0,0,0,.08);padding:0 4px;scrollbar-width:none;-webkit-overflow-scrolling:touch;flex-shrink:0;"></div>
          <div class="gos-body" id="gosBody" style="flex:1;overflow-y:auto;padding:0;-webkit-overflow-scrolling:touch;min-height:0;"></div>
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
        const data = await _api('GET', `/${_groupId}/tasks?limit=100`) || { tasks:[], total:0 };
        // FIX ("no area for create" — Group Tools): the backend only requires
        // group membership to create a task (see TaskService.create's
        // _assertMember call), not admin/moderator/owner. Gating the create
        // button behind a stricter role check than the server enforces meant
        // regular members never saw it at all — and if role detection ever
        // silently fell back to 'member' (_getMyRole's default on any lookup
        // failure), even a real admin could lose the button. Match the
        // backend's actual permission: any member can create.
        // FIX ("no area for create" — Group Tools): the backend requires
        // only membership to CREATE a task (TaskService.create's
        // _assertMember) but requires admin/moderator/owner to DELETE one
        // (TaskService.delete's _assertRole) — two different backend
        // permissions that this file was collapsing into a single
        // admin-only `canManage` flag, which hid the create button from
        // regular members entirely (and could hide it from a real admin
        // too, if _getMyRole's silent 'member' fallback ever fired on a
        // lookup failure). Split to match the backend exactly.
        const canCreate = true;
        const canManage = ['admin','owner','moderator'].includes(_role);
        const tasks = data.tasks || [];

        // P3 FIX: Kanban board — columns by status
        const columns = [
            { id: 'pending',   label: 'To Do',      color: '#f59e0b', emoji: '📋' },
            { id: 'active',    label: 'In Progress', color: '#60a5fa', emoji: '🔄' },
            { id: 'completed', label: 'Done',        color: '#34d399', emoji: '✅' },
        ];

        const kanbanCols = columns.map(col => {
            const colTasks = tasks.filter(t => t.status === col.id || (col.id === 'pending' && !t.status));
            const cards = colTasks.map(t => {
                const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed';
                return `<div draggable="true" data-task-id="${t.id}" data-status="${t.status}"
                    ondragstart="GroupOS._dragTask(event)"
                    style="background:#fff;border-radius:10px;padding:12px;margin-bottom:8px;
                           box-shadow:0 1px 4px rgba(0,0,0,.08);cursor:grab;border-left:3px solid ${col.color}">
                  <div style="font-weight:600;font-size:13px;color:#111827;margin-bottom:4px">${_esc(t.title)}</div>
                  ${t.description ? `<div style="font-size:11px;color:#6b7280;margin-bottom:6px">${_esc(t.description).slice(0,60)}</div>` : ''}
                  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
                    <span style="font-size:10px;background:${col.color}22;color:${col.color};padding:2px 6px;border-radius:8px;font-weight:600">${t.priority||'normal'}</span>
                    ${t.dueDate ? `<span style="font-size:10px;color:${overdue?'#ef4444':'#9ca3af'}">${overdue?'⚠ ':''}${new Date(t.dueDate).toLocaleDateString()}</span>` : ''}
                  </div>
                  <div style="display:flex;gap:4px;margin-top:8px">
                    ${col.id !== 'completed' ? `<button onclick="GroupOS.toggleTask(${t.id},\'${t.status}\')" style="flex:1;font-size:11px;background:#f0fdf4;color:#16a34a;border:none;border-radius:6px;padding:4px;cursor:pointer">✓ Done</button>` : ''}
                    <button onclick="GroupOS.openTaskComments(${t.id},\'${_esc(t.title)}\')" style="flex:1;font-size:11px;background:#f8fafc;color:#6b7280;border:none;border-radius:6px;padding:4px;cursor:pointer">💬</button>
                    ${canManage ? `<button onclick="GroupOS.deleteTask(${t.id})" style="font-size:11px;background:#fef2f2;color:#ef4444;border:none;border-radius:6px;padding:4px 6px;cursor:pointer">×</button>` : ''}
                  </div>
                </div>`;
            }).join('') || `<div style="text-align:center;padding:20px;color:#d1d5db;font-size:12px">No tasks</div>`;

            return `<div ondragover="event.preventDefault()" ondrop="GroupOS._dropTask(event,\'${col.id}\')"
                style="flex:1;min-width:200px;background:#f8fafc;border-radius:14px;padding:12px">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px">
                <span>${col.emoji}</span>
                <span style="font-weight:700;font-size:13px;color:#374151">${col.label}</span>
                <span style="margin-left:auto;background:${col.color}22;color:${col.color};font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">${colTasks.length}</span>
              </div>
              ${cards}
            </div>`;
        }).join('');

        body.innerHTML = `
        <div style="padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            ${canCreate ? `<button onclick="GroupOS.createTask()" style="${_btnStyle('#667eea')}">+ New Task</button>` : '<div></div>'}
            <div style="display:flex;gap:8px">
              <button onclick="GroupOS.switchTaskView('kanban')" style="font-size:12px;background:#667eea;color:#fff;border:none;border-radius:8px;padding:6px 12px;cursor:pointer">📋 Kanban</button>
              <button onclick="GroupOS.switchTaskView('list')" style="font-size:12px;background:#f1f5f9;color:#374151;border:none;border-radius:8px;padding:6px 12px;cursor:pointer">☰ List</button>
            </div>
          </div>
          <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:8px">${kanbanCols}</div>
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

    // P3 FIX: Rich text note editor using contenteditable + basic toolbar
    function _openRichNoteEditor(note) {
        let existing = document.getElementById('groupOSNoteEditor');
        if (existing) existing.remove();
        const isNew = !note?.id;
        const modal = document.createElement('div');
        modal.id = 'groupOSNoteEditor';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
        modal.innerHTML = `
          <div style="background:#fff;border-radius:20px;width:100%;max-width:600px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">
            <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:12px">
              <input id="noteEditorTitle" placeholder="Note title…"
                value="${note?.title ? note.title.replace(/"/g,'&quot;') : ''}"
                style="flex:1;border:none;outline:none;font-size:17px;font-weight:700;color:#111827">
              <button onclick="document.getElementById('groupOSNoteEditor').remove()"
                style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af">✕</button>
            </div>
            <div style="padding:6px 12px;border-bottom:1px solid #f1f5f9;display:flex;gap:4px;flex-wrap:wrap">
              ${[['bold','B','font-weight:bold'],['italic','I','font-style:italic'],['underline','U','text-decoration:underline'],
                 ['insertUnorderedList','• List',''],['insertOrderedList','1. List',''],
                 ['formatBlock:H3','H3',''],['formatBlock:P','¶','']
              ].map(([cmd, label, style]) => `
                <button onmousedown="event.preventDefault();document.execCommand('${cmd.includes(':')?cmd.split(':')[0]:cmd}',false,'${cmd.includes(':')?cmd.split(':')[1]:''}')"
                  style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;${style}">${label}</button>`
              ).join('')}
            </div>
            <div id="noteEditorBody" contenteditable="true"
              style="flex:1;overflow-y:auto;padding:16px 20px;outline:none;font-size:14px;color:#374151;min-height:200px;line-height:1.6"
              >${note?.content ? note.content : '<p>Start writing…</p>'}</div>
            <div style="padding:12px 20px;border-top:1px solid #f1f5f9;display:flex;gap:8px;justify-content:flex-end">
              <button onclick="document.getElementById('groupOSNoteEditor').remove()"
                style="background:#f1f5f9;border:none;border-radius:10px;padding:10px 20px;font-size:14px;cursor:pointer">Cancel</button>
              <button onclick="GroupOS._saveRichNote(${note?.id||'null'})"
                style="background:#10b981;color:#fff;border:none;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer">
                ${isNew ? 'Create Note' : 'Save Changes'}
              </button>
            </div>
          </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
        document.getElementById('noteEditorBody')?.focus();
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
    // FILES TAB — P3 FIX: File preview (images, PDFs, audio)
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
            const size = f.sizeBytes > 1048576 ? (f.sizeBytes/1048576).toFixed(1)+'MB' : f.sizeBytes > 1024 ? (f.sizeBytes/1024).toFixed(0)+'KB' : (f.sizeBytes||0)+'B';
            const isImage = f.mimeType?.startsWith('image/');
            const isPDF   = f.mimeType === 'application/pdf';
            const isAudio = f.mimeType?.startsWith('audio/');
            const isVideo = f.mimeType?.startsWith('video/');
            // P3 FIX: Inline preview for images, audio, video; PDF link
            const preview = isImage
                ? `<img src="${f.url}" alt="${_esc(f.name)}" loading="lazy"
                        style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:8px;cursor:pointer"
                        onclick="GroupOS.openFilePreview('${f.url}','image','${_esc(f.name)}')" onerror="this.style.display='none'">`
                : isAudio
                ? `<audio controls style="width:100%;margin-bottom:8px;border-radius:8px"><source src="${f.url}" type="${f.mimeType}"></audio>`
                : isVideo
                ? `<video controls style="width:100%;max-height:160px;border-radius:8px;margin-bottom:8px"><source src="${f.url}" type="${f.mimeType}"></video>`
                : isPDF
                ? `<button onclick="GroupOS.openFilePreview('${f.url}','pdf','${_esc(f.name)}')" style="width:100%;font-size:12px;background:#fef3c7;color:#92400e;border:none;border-radius:8px;padding:6px;cursor:pointer;margin-bottom:8px">👁 Preview PDF</button>`
                : '';
            return `<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
              ${preview}
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:22px;flex-shrink:0">${icon}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:13px;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(f.name)}</div>
                  <div style="font-size:11px;color:#9ca3af;margin-top:2px">${size} · ${f.downloadCount||0} downloads</div>
                </div>
                <a href="${f.url}" download target="_blank" style="background:#f1f5f9;border:none;border-radius:8px;padding:8px 12px;font-size:12px;color:#374151;text-decoration:none;font-weight:600">↓</a>
                ${['admin','owner'].includes(_role)||String(f.uploadedBy)===String(_userId) ? `<button onclick="GroupOS.deleteFile(${f.id})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:18px">×</button>` : ''}
              </div>
            </div>`;
        }).join('');
    }

    // P3 FIX: File preview modal (images, PDFs)
    function _openFilePreview(url, type, name) {
        let existing = document.getElementById('groupOSFilePreview');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'groupOSFilePreview';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px';
        const content = type === 'image'
            ? `<img src="${url}" style="max-width:100%;max-height:80vh;border-radius:12px;object-fit:contain">`
            : `<iframe src="${url}" style="width:100%;height:80vh;border:none;border-radius:12px;background:#fff"></iframe>`;
        modal.innerHTML = `
          <div style="width:100%;max-width:800px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <span style="color:#fff;font-weight:600;font-size:14px">${name}</span>
              <div style="display:flex;gap:8px">
                <a href="${url}" download target="_blank" style="background:#667eea;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;text-decoration:none;font-weight:600">⬇ Download</a>
                <button onclick="document.getElementById('groupOSFilePreview').remove()" style="background:#fff2;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;font-weight:600">✕ Close</button>
              </div>
            </div>
            ${content}
          </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }

    // ════════════════════════════════════════════════════════════════════
    // EVENTS TAB
    // ════════════════════════════════════════════════════════════════════
    async function renderEvents(body) {
        const data = await _api('GET', `/${_groupId}/smart-events?upcoming=true&limit=60`) || { events:[] };
        // Same fix as the tasks tab above — backend only requires membership.
        const canManage = true;
        const events    = data.events || [];

        // P3 FIX: Calendar grid view for current month
        const now       = new Date();
        const yr        = now.getFullYear();
        const mo        = now.getMonth();
        const firstDay  = new Date(yr, mo, 1).getDay();
        const daysInMo  = new Date(yr, mo + 1, 0).getDate();
        const months    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const days      = ['Su','Mo','Tu','We','Th','Fr','Sa'];

        // Map events by day-of-month
        const byDay = {};
        events.forEach(e => {
            const d = new Date(e.startTime);
            if (d.getFullYear() === yr && d.getMonth() === mo) {
                const k = d.getDate();
                byDay[k] = byDay[k] || [];
                byDay[k].push(e);
            }
        });

        // Build calendar grid
        let cells = '';
        // Empty cells before first day
        for (let i = 0; i < firstDay; i++) cells += `<div></div>`;
        for (let d = 1; d <= daysInMo; d++) {
            const isToday = d === now.getDate();
            const evs     = byDay[d] || [];
            const dots    = evs.slice(0,3).map(e =>
                `<div style="width:6px;height:6px;border-radius:50%;background:#667eea;margin:1px auto" title="${e.title}"></div>`
            ).join('');
            cells += `<div onclick="GroupOS._showDayEvents(${yr},${mo},${d})"
                style="aspect-ratio:1;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;
                       cursor:pointer;background:${isToday?'#667eea':'#f8fafc'};
                       color:${isToday?'#fff':'#374151'};font-size:13px;font-weight:${isToday?'700':'500'};
                       border:${evs.length?'2px solid #c7d2fe':'2px solid transparent'};transition:background .15s">
              <span>${d}</span>
              <div style="display:flex;flex-wrap:wrap;justify-content:center;max-width:20px">${dots}</div>
            </div>`;
        }

        body.innerHTML = `
        <div style="padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            ${canManage ? `<button onclick="GroupOS.createEvent()" style="${_btnStyle('#3b82f6')}">+ New Event</button>` : '<div></div>'}
            <div style="display:flex;gap:8px">
              <button onclick="GroupOS._switchEventView('calendar')" style="font-size:12px;background:#667eea;color:#fff;border:none;border-radius:8px;padding:6px 12px;cursor:pointer">📅 Calendar</button>
              <button onclick="GroupOS._switchEventView('list')" style="font-size:12px;background:#f1f5f9;color:#374151;border:none;border-radius:8px;padding:6px 12px;cursor:pointer">☰ List</button>
            </div>
          </div>

          <!-- Calendar header -->
          <div style="background:#fff;border-radius:16px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:12px">
            <div style="text-align:center;font-weight:700;font-size:16px;color:#111827;margin-bottom:12px">
              ${months[mo]} ${yr}
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px">
              ${days.map(d => `<div style="text-align:center;font-size:11px;font-weight:600;color:#9ca3af;padding:4px">${d}</div>`).join('')}
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${cells}</div>
          </div>

          <!-- Upcoming list -->
          <div style="font-weight:700;font-size:14px;color:#374151;margin-bottom:8px">Upcoming Events</div>
          <div id="eventList">${_renderEventList(events.slice(0,10))}</div>
        </div>`;
    }

    function _renderEventList(events) {
        if (!events.length) return `<div style="text-align:center;padding:30px;color:#9ca3af"><span style="font-size:32px">📅</span><p>No upcoming events</p></div>`;
        return events.map(e => {
            const start = new Date(e.startTime);
            return `<div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
              ${e.coverImage ? `<img src="${e.coverImage}" style="width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:10px" loading="lazy">` : ''}
              <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div style="flex:1">
                  <div style="font-weight:700;font-size:15px;color:#111827">${_esc(e.title)}</div>
                  <div style="font-size:12px;color:#6b7280;margin-top:4px">📅 ${start.toLocaleString()}</div>
                  ${e.location ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">📍 ${_esc(e.location)}</div>` : ''}
                  ${e.isRecurring ? `<div style="font-size:11px;color:#8b5cf6;margin-top:2px">🔁 Recurring</div>` : ''}
                </div>
                <a href="/api/groups/${_groupId}/events/${e.id}/ics" download
                  style="font-size:11px;background:#f1f5f9;color:#374151;border-radius:8px;padding:4px 8px;text-decoration:none;margin-left:8px;flex-shrink:0" title="Export to calendar">📥 .ics</a>
              </div>
              ${e.rsvpEnabled ? `<div style="display:flex;gap:8px;margin-top:10px">
                <button onclick="GroupOS.rsvp(${e.id},'rsvp_yes')"   style="${_chipStyle('#34d399')}">✓ Going</button>
                <button onclick="GroupOS.rsvp(${e.id},'rsvp_maybe')" style="${_chipStyle('#f59e0b')}">? Maybe</button>
                <button onclick="GroupOS.rsvp(${e.id},'rsvp_no')"    style="${_chipStyle('#ef4444')}">✗ No</button>
              </div>` : ''}
            </div>`;
        }).join('');
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
          <div style="display:flex;gap:8px;margin-bottom:4px">
            ${['admin','owner'].includes(_role) ? `<button onclick="GroupOS.addTransaction()" style="${_btnStyle('#059669')}">+ Add Transaction</button>` : ''}
            <button onclick="GroupOS.openSplitExpense()" style="${_btnStyle('#f59e0b')}">💸 Split</button>
          </div>
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

        // P2 FIX: Render daily[] array as SVG bar chart
        const daily = Array.isArray(data.daily) ? data.daily : [];
        let chartHtml = '';
        if (daily.length > 0) {
            const maxVal = Math.max(...daily.map(d => d.messages || 0), 1);
            const barW = Math.max(4, Math.floor(320 / daily.length) - 2);
            const bars = daily.map((d, i) => {
                const h = Math.max(2, Math.round(((d.messages || 0) / maxVal) * 60));
                const date = d.date ? new Date(d.date).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '';
                return `<g>
                  <rect x="${i*(barW+2)}" y="${60-h}" width="${barW}" height="${h}" rx="2" fill="#60a5fa" opacity="0.85">
                    <title>${date}: ${d.messages||0} messages</title>
                  </rect>
                </g>`;
            }).join('');
            const labelStep = daily.length > 14 ? Math.ceil(daily.length / 7) : 1;
            const labels = daily.filter((_,i) => i % labelStep === 0 || i === daily.length-1).map((d,i) => {
                const x = (i * labelStep) * (barW+2) + barW/2;
                const date = d.date ? new Date(d.date).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '';
                return `<text x="${x}" y="76" text-anchor="middle" font-size="8" fill="#9ca3af">${date}</text>`;
            }).join('');
            chartHtml = `
            <div style="background:#fff;border-radius:14px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:12px">
              <div style="font-weight:700;font-size:14px;color:#111827;margin-bottom:8px">📈 Daily Message Activity (30d)</div>
              <svg viewBox="0 0 ${daily.length*(barW+2)} 80" width="100%" style="overflow:visible">
                ${bars}${labels}
              </svg>
            </div>`;
        }

        body.innerHTML = `
        <div style="padding:16px">
          <div style="font-weight:700;font-size:16px;color:#111827;margin-bottom:12px">Last 30 Days</div>
          ${chartHtml}
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

    // ── P3 FIX: Kanban drag-drop ───────────────────────────────────────────
    function _dragTask(event) {
        event.dataTransfer.setData('taskId', event.currentTarget.dataset.taskId);
        event.dataTransfer.setData('currentStatus', event.currentTarget.dataset.status);
    }
    async function _dropTask(event, newStatus) {
        event.preventDefault();
        const taskId = event.dataTransfer.getData('taskId');
        const currentStatus = event.dataTransfer.getData('currentStatus');
        if (!taskId || currentStatus === newStatus) return;
        await _api('PUT', `/${_groupId}/tasks/${taskId}`, { status: newStatus });
        const tab = document.querySelector('[data-tab="tasks"]');
        if (tab) tab.click();
    }

    // ── P3 FIX: Task comments modal ────────────────────────────────────────
    async function openTaskComments(taskId, taskTitle) {
        const data = await _api('GET', `/${_groupId}/tasks/${taskId}/comments`) || [];
        const comments = Array.isArray(data) ? data : (data.comments || []);
        let modal = document.getElementById('groupOSTaskComments');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'groupOSTaskComments';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding:0';
        modal.innerHTML = `
          <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:600px;max-height:70vh;display:flex;flex-direction:column">
            <div style="padding:14px 20px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:700;font-size:15px">💬 ${taskTitle || 'Task'}</span>
              <button onclick="document.getElementById('groupOSTaskComments').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af">✕</button>
            </div>
            <div id="taskCommentsList" style="flex:1;overflow-y:auto;padding:12px 16px">
              ${comments.length ? comments.map(c => `
                <div style="margin-bottom:10px;display:flex;gap:10px">
                  <div style="width:32px;height:32px;border-radius:50%;background:#667eea22;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">👤</div>
                  <div style="flex:1">
                    <div style="font-size:11px;color:#9ca3af;margin-bottom:2px">${new Date(c.createdAt).toLocaleString()}</div>
                    <div style="font-size:13px;color:#374151;background:#f8fafc;border-radius:10px;padding:8px 12px">${c.content}</div>
                  </div>
                </div>`).join('') : '<p style="text-align:center;color:#9ca3af;padding:20px">No comments yet</p>'}
            </div>
            <div style="padding:12px 16px;border-top:1px solid #f1f5f9;display:flex;gap:8px">
              <input id="taskCommentInput" placeholder="Add a comment…" style="flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;font-size:13px;outline:none">
              <button onclick="GroupOS._postTaskComment(${taskId})" style="background:#667eea;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer">Send</button>
            </div>
          </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }
    async function _postTaskComment(taskId) {
        const input = document.getElementById('taskCommentInput');
        const content = input?.value?.trim();
        if (!content) return;
        await _api('POST', `/${_groupId}/tasks/${taskId}/comments`, { content });
        input.value = '';
        await openTaskComments(taskId, '');
    }

    // ── P3 FIX: Calendar day events popup ─────────────────────────────────
    async function _showDayEvents(yr, mo, day) {
        const data = await _api('GET', `/${_groupId}/smart-events?upcoming=false&limit=100`) || { events:[] };
        const events = (data.events || []).filter(e => {
            const d = new Date(e.startTime);
            return d.getFullYear() === yr && d.getMonth() === mo && d.getDate() === day;
        });
        const dateStr = new Date(yr, mo, day).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
        let modal = document.getElementById('groupOSDayEvents');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'groupOSDayEvents';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
        modal.innerHTML = `
          <div style="background:#fff;border-radius:20px;width:100%;max-width:400px;max-height:80vh;overflow-y:auto;padding:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
              <span style="font-weight:700;font-size:15px">📅 ${dateStr}</span>
              <button onclick="document.getElementById('groupOSDayEvents').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af">✕</button>
            </div>
            ${events.length ? _renderEventList(events) : '<p style="text-align:center;color:#9ca3af;padding:20px">No events on this day</p>'}
          </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }
    function _switchEventView(view) {
        const tab = document.querySelector('[data-tab="events"]');
        if (tab) tab.click();
    }

    // ── P3 FIX: Rich note save ─────────────────────────────────────────────
    async function _saveRichNote(noteId) {
        const title   = document.getElementById('noteEditorTitle')?.value?.trim();
        const body    = document.getElementById('noteEditorBody')?.innerHTML;
        const content = document.getElementById('noteEditorBody')?.innerText?.trim();
        if (!title && !content) return;
        if (noteId) {
            await _api('PUT', `/${_groupId}/notes/${noteId}`, { title: title || 'Untitled', content: body || '' });
        } else {
            await _api('POST', `/${_groupId}/notes`, { title: title || 'Untitled', content: body || '', format: 'html' });
        }
        document.getElementById('groupOSNoteEditor')?.remove();
        const tab = document.querySelector('[data-tab="notes"]');
        if (tab) tab.click();
    }

    // ── P3 FIX: Finance split expense UI ──────────────────────────────────
    async function openSplitExpense() {
        const members = await _api('GET', `/${_groupId}/members`) || [];
        const memberList = Array.isArray(members) ? members : (members.members || []);
        let modal = document.getElementById('groupOSSplit');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'groupOSSplit';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
        modal.innerHTML = `
          <div style="background:#fff;border-radius:20px;width:100%;max-width:400px;padding:24px">
            <div style="font-weight:700;font-size:18px;margin-bottom:16px">💸 Split Expense</div>
            <input id="splitAmount" type="number" placeholder="Amount (KES)" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;font-size:14px;margin-bottom:10px;box-sizing:border-box">
            <input id="splitDesc" placeholder="Description" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;font-size:14px;margin-bottom:10px;box-sizing:border-box">
            <div style="font-size:13px;color:#6b7280;margin-bottom:6px">Split among (select members):</div>
            <div id="splitMemberList" style="max-height:150px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:10px;padding:8px;margin-bottom:12px">
              ${memberList.map(m => `<label style="display:flex;align-items:center;gap:8px;padding:4px;cursor:pointer">
                <input type="checkbox" value="${m.userId||m.id}" style="cursor:pointer">
                <span style="font-size:13px">${m.username||m.firstName||'User '+m.userId}</span>
              </label>`).join('') || '<p style="color:#9ca3af;text-align:center">No members found</p>'}
            </div>
            <div style="display:flex;gap:8px">
              <button onclick="document.getElementById('groupOSSplit').remove()" style="flex:1;padding:10px;border:none;border-radius:10px;background:#f1f5f9;color:#374151;cursor:pointer">Cancel</button>
              <button onclick="GroupOS._confirmSplit()" style="flex:1;padding:10px;border:none;border-radius:10px;background:#059669;color:#fff;font-weight:600;cursor:pointer">Split</button>
            </div>
          </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }
    async function _confirmSplit() {
        const amount      = parseFloat(document.getElementById('splitAmount')?.value);
        const description = document.getElementById('splitDesc')?.value?.trim();
        const checkboxes  = document.querySelectorAll('#splitMemberList input[type=checkbox]:checked');
        const splitAmong  = Array.from(checkboxes).map(c => parseInt(c.value));
        if (!amount || isNaN(amount) || !splitAmong.length) {
            alert('Enter amount and select at least one member');
            return;
        }
        await _api('POST', `/${_groupId}/finances/split`, { amount, description, splitAmong });
        document.getElementById('groupOSSplit')?.remove();
        const tab = document.querySelector('[data-tab="finances"]');
        if (tab) tab.click();
    }

    window.GroupOS = {
        mount, openTab: _openTab,
        createTask, toggleTask, deleteTask, filterTasks,
        switchTaskView: () => {},
        _dragTask, _dropTask,
        openTaskComments, _postTaskComment,
        createPoll, vote, closePoll, _addPollOpt,
        createNote, deleteNote, viewNote, createNote: () => _openRichNoteEditor(null), _saveRichNote,
        openFilePreview: _openFilePreview,
        uploadFile, deleteFile,
        createEvent, rsvp, _showDayEvents, _switchEventView,
        addTransaction, openSplitExpense, _confirmSplit,
        requestAI,
    };
    console.log('[GroupOS] Loaded ✅ (P1/P2/P3 fixes applied)');
})();