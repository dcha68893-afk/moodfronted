/* report-problem.js - "Report a problem" for every module.
   Adds a small flag button + a sheet (scam, harassment, bias, bug...). The report goes to
   POST /api/admin/problem-reports, which notifies the admins. Any screen can also call
   window.openProblemReport({ module, targetUserId, targetRef, message }) from its own menu.
   A report can carry any mix of: a written description, a tagged user, attached photos/files (uploaded via
   /api/files/upload) and a reported chat message (opts.message = { messageId, chatId, senderId, senderName,
   text, type, media:[{url,name,type}], sentAt }), so the admin sees the actual evidence. */
(function () {
  'use strict';
  if (window.__problemReportInstalled) return; window.__problemReportInstalled = true;

  var CATS = [
    ['scam', 'Scam / fraud'], ['harassment', 'Harassment / bullying'], ['bias', 'Bias / discrimination'],
    ['hate_speech', 'Hate speech'], ['spam', 'Spam'], ['inappropriate_content', 'Inappropriate content'],
    ['fake_account', 'Fake account'], ['payment_issue', 'Payment problem'],
    ['bug', 'Bug / something broken'], ['error', 'Error message'], ['other', 'Something else']
  ];
  function pick(f) { for (var i = 0; i < f.length; i++) { try { var v = f[i](); if (v) return v; } catch (_) {} } return ''; }
  function base() {
    // __getApiBase() already ends in "/api" (see js/config.js) and every call below appends "/api/admin/...",
    // which produced "/api/api/admin/problem-reports" -> 404 "Route ... not found". Always reduce to the origin.
    return String(pick([function () { return window.__getApiOrigin && window.__getApiOrigin(); }, function () { return window.__getApiBase && window.__getApiBase(); }, function () { return window.API_BASE_URL; },
      function () { return window.parent.__getApiOrigin && window.parent.__getApiOrigin(); }, function () { return window.parent.__getApiBase && window.parent.__getApiBase(); }, function () { return window.parent.API_BASE_URL; }]) || '').replace(/\/+$/, '').replace(/\/api$/, '');
  }
  function token() {
    return pick([function () { return window.__kynToken; }, function () { return window.__accessToken; },
      function () { return window.AuthSessionManager.getToken(); }, function () { return JSON.parse(localStorage.getItem('kynecta_auth')).token; },
      function () { return localStorage.getItem('authToken'); }, function () { return localStorage.getItem('accessToken'); }, function () { return localStorage.getItem('token'); }]);
  }
  function moduleName() {
    var f = (location.pathname.split('/').pop() || 'app').replace(/\.html$/, '');
    return ({ Tools: 'Market', friend: 'Friends', group: 'Groups', message: 'Chat', status: 'Status', game: 'Games', settings: 'Settings', chat: 'App' })[f] || f;
  }
  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }

  function openSheet(opts) {
    opts = opts || {};
    if (document.getElementById('__pr_sheet')) return;
    var wrap = el('div', 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;font-family:system-ui,sans-serif', '');
    wrap.id = '__pr_sheet';
    var card = el('div', 'background:#fff;color:#111;width:100%;max-width:520px;border-radius:18px 18px 0 0;padding:18px;max-height:88vh;overflow:auto', '');
    card.innerHTML = '<div style="font-weight:700;font-size:17px;margin-bottom:4px">Report a problem</div>' +
      '<div style="font-size:13px;color:#666;margin-bottom:12px">Goes straight to the admin team. Module: <b>' + (opts.module || moduleName()) + '</b></div>' +
      '<select id="__pr_cat" style="width:100%;padding:11px;border:1px solid #ddd;border-radius:10px;font-size:15px;margin-bottom:10px">' +
      CATS.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('') + '</select>' +
      '<div style="position:relative;margin-bottom:10px">' +
        '<div id="__pr_picked" style="display:none;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border:1px solid #f97316;border-radius:10px;background:#fff7ed;font-size:14px"></div>' +
        '<input id="__pr_who" type="text" autocomplete="off" placeholder="Who is causing this? Search a username (optional)" style="width:100%;box-sizing:border-box;padding:11px;border:1px solid #ddd;border-radius:10px;font-size:15px">' +
        '<div id="__pr_sug" style="display:none;position:absolute;left:0;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid #ddd;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);max-height:200px;overflow:auto;z-index:2"></div>' +
      '</div>' +
      '<textarea id="__pr_txt" rows="5" placeholder="What happened? Include names, links or what you were doing." style="width:100%;box-sizing:border-box;padding:11px;border:1px solid #ddd;border-radius:10px;font-size:15px;resize:vertical"></textarea>' +
      '<div id="__pr_ref" style="display:none;margin-top:10px;border:1px solid #e5e7eb;border-left:4px solid #f97316;border-radius:10px;padding:10px 12px;background:#fafafa;font-size:13px"></div>' +
      '<div style="margin-top:10px"><button type="button" id="__pr_attach" style="padding:9px 14px;border:1px dashed #bbb;border-radius:10px;background:#fff;font-size:14px;color:#333">&#128206; Attach photo or file</button>' +
        '<input id="__pr_file" type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" style="display:none">' +
        '<div id="__pr_files" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"></div></div>' +
      '<div id="__pr_msg" style="font-size:13px;min-height:18px;margin:8px 0;color:#c0392b"></div>' +
      '<div style="display:flex;gap:10px"><button id="__pr_cancel" style="flex:1;padding:12px;border:0;border-radius:10px;background:#eee;font-size:15px">Cancel</button>' +
      '<button id="__pr_send" style="flex:1;padding:12px;border:0;border-radius:10px;background:#f97316;color:#fff;font-weight:700;font-size:15px">Send report</button></div>';
    wrap.appendChild(card); document.body.appendChild(wrap);
    function close() { wrap.remove(); }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    card.querySelector('#__pr_cancel').onclick = close;
    if (opts.category) card.querySelector('#__pr_cat').value = opts.category;
    var msg = card.querySelector('#__pr_msg'), send = card.querySelector('#__pr_send');

    // Tag the user who is causing the problem (optional). Pre-filled when a screen passes targetUserId.
    var picked = opts.targetUserId ? { id: opts.targetUserId, name: opts.targetName || 'Selected user' } : null;
    var whoInput = card.querySelector('#__pr_who'), sug = card.querySelector('#__pr_sug'), chip = card.querySelector('#__pr_picked'), searchTimer = null, searchSeq = 0;
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
    function renderPicked() {
      if (picked) {
        chip.style.display = 'flex'; whoInput.style.display = 'none'; sug.style.display = 'none';
        chip.innerHTML = '<span>Reporting: <b>' + esc(picked.name) + '</b></span><button type="button" id="__pr_unpick" style="border:0;background:transparent;font-size:18px;line-height:1;color:#666;padding:2px 6px">&times;</button>';
        chip.querySelector('#__pr_unpick').onclick = function () { picked = null; renderPicked(); whoInput.focus(); };
      } else { chip.style.display = 'none'; chip.innerHTML = ''; whoInput.style.display = 'block'; }
    }
    renderPicked();
    whoInput.addEventListener('input', function () {
      var q = whoInput.value.trim().replace(/^@/, '');
      clearTimeout(searchTimer);
      if (q.length < 2) { sug.style.display = 'none'; return; }
      searchTimer = setTimeout(function () {
        var seq = ++searchSeq;
        fetch(base() + '/api/users/search?limit=6&q=' + encodeURIComponent(q), { credentials: 'include', headers: { Authorization: 'Bearer ' + token() } })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (seq !== searchSeq) return;
            var users = (j && j.data && j.data.users) || [];
            if (!users.length) { sug.innerHTML = '<div style="padding:10px 12px;font-size:13px;color:#888">No users found</div>'; sug.style.display = 'block'; return; }
            sug.innerHTML = users.map(function (u) {
              var label = u.displayName || u.username || ('User ' + u.id);
              return '<div data-id="' + esc(u.id) + '" data-name="' + esc(label) + '" style="padding:10px 12px;font-size:14px;cursor:pointer;border-bottom:1px solid #f1f1f1"><b>' + esc(label) + '</b>' + (u.username && u.username !== label ? ' <span style="color:#888">@' + esc(u.username) + '</span>' : '') + '</div>';
            }).join('');
            sug.style.display = 'block';
            Array.prototype.forEach.call(sug.children, function (row) {
              row.onclick = function () { if (!row.dataset.id) return; picked = { id: Number(row.dataset.id), name: row.dataset.name }; whoInput.value = ''; renderPicked(); };
            });
          }).catch(function () { sug.style.display = 'none'; });
      }, 250);
    });
    // ---- Evidence: reported message + attached files -------------------------------------------------
    var refMsg = opts.message || null;           // chat message being reported (optional, removable)
    var files = [];                              // { name, status:'uploading'|'done'|'error', data, err, preview }
    var refBox = card.querySelector('#__pr_ref'), filesBox = card.querySelector('#__pr_files'), fileInput = card.querySelector('#__pr_file');
    var MAX_FILES = 5, MAX_BYTES = 25 * 1024 * 1024;
    function renderRef() {
      if (!refMsg) { refBox.style.display = 'none'; refBox.innerHTML = ''; return; }
      var media = (refMsg.media || []).map(function (m) { return (m.type === 'image' || /^image\//.test(m.mimeType || '')) ? '<img src="' + esc(m.url) + '" referrerpolicy="no-referrer" style="max-width:96px;max-height:96px;border-radius:8px;margin-right:6px;vertical-align:top">' : '<span style="display:inline-block;margin-right:6px">&#128196; ' + esc(m.name || 'File') + '</span>'; }).join('');
      refBox.style.display = 'block';
      refBox.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>Reported message' + (refMsg.senderName ? ' from ' + esc(refMsg.senderName) : '') + '</b>' +
        '<button type="button" id="__pr_unref" style="border:0;background:transparent;font-size:18px;line-height:1;color:#666;padding:2px 6px">&times;</button></div>' +
        (refMsg.text ? '<div style="margin-top:6px;white-space:pre-wrap;word-break:break-word;color:#333">' + esc(String(refMsg.text).slice(0, 300)) + '</div>' : '') +
        (media ? '<div style="margin-top:6px">' + media + '</div>' : '');
      refBox.querySelector('#__pr_unref').onclick = function () { refMsg = null; renderRef(); };
    }
    function renderFiles() {
      filesBox.innerHTML = '';
      files.forEach(function (f, i) {
        var chipEl = el('div', 'position:relative;border:1px solid #e5e7eb;border-radius:10px;padding:6px 26px 6px 8px;font-size:12px;background:#fff;max-width:100%;display:flex;align-items:center;gap:6px', '');
        chipEl.innerHTML = (f.preview ? '<img src="' + esc(f.preview) + '" style="width:36px;height:36px;object-fit:cover;border-radius:6px">' : '<span style="font-size:18px">&#128196;</span>') +
          '<span style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(f.name) + '</span>' +
          '<span style="color:' + (f.status === 'error' ? '#c0392b' : f.status === 'done' ? '#2c7a3f' : '#888') + '">' + (f.status === 'uploading' ? 'uploading&hellip;' : f.status === 'done' ? '&#10003;' : esc(f.err || 'failed')) + '</span>' +
          '<button type="button" style="position:absolute;top:2px;right:4px;border:0;background:transparent;font-size:16px;color:#666">&times;</button>';
        chipEl.querySelector('button').onclick = function () { if (f.preview) try { URL.revokeObjectURL(f.preview); } catch (_) {} files.splice(i, 1); renderFiles(); };
        filesBox.appendChild(chipEl);
      });
    }
    function uploadOne(file, item) {
      var fd = new FormData(); fd.append('file', file);
      return fetch(base() + '/api/files/upload', { method: 'POST', credentials: 'include', headers: { Authorization: 'Bearer ' + token() }, body: fd })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok || x.j.success === false) throw new Error((x.j && x.j.message) || 'Upload failed');
          var d = x.j.data || x.j;
          item.data = { url: d.url || x.j.url, name: d.originalName || file.name, mimeType: d.mimeType || file.type, size: d.size || file.size, type: d.type || x.j.type };
          item.status = 'done';
        }).catch(function (e) { item.status = 'error'; item.err = (e && e.message) || 'failed'; })
        .then(renderFiles);
    }
    card.querySelector('#__pr_attach').onclick = function () { fileInput.click(); };
    fileInput.onchange = function () {
      Array.prototype.forEach.call(fileInput.files || [], function (file) {
        if (files.length >= MAX_FILES) { msg.style.color = '#c0392b'; msg.textContent = 'You can attach up to ' + MAX_FILES + ' files.'; return; }
        if (file.size > MAX_BYTES) { msg.style.color = '#c0392b'; msg.textContent = file.name + ' is too large (max 25 MB).'; return; }
        var item = { name: file.name, status: 'uploading', preview: /^image\//.test(file.type) ? URL.createObjectURL(file) : '' };
        files.push(item); renderFiles(); uploadOne(file, item);
      });
      fileInput.value = '';
    };
    renderRef();

    function buildBody(details) {
      var body = { category: card.querySelector('#__pr_cat').value, details: details, module: opts.module || moduleName(),
        targetUserId: (picked && picked.id) || opts.targetUserId || (refMsg && refMsg.senderId) || null, targetRef: opts.targetRef || null, subject: opts.subject || '',
        attachments: files.filter(function (f) { return f.status === 'done'; }).map(function (f) { return f.data; }) };
      if (refMsg) body.messageRef = { messageId: refMsg.messageId, chatId: refMsg.chatId, senderId: refMsg.senderId, senderName: refMsg.senderName, text: refMsg.text, type: refMsg.type, media: refMsg.media || [], sentAt: refMsg.sentAt };
      return body;
    }
    send.onclick = function () {
      msg.style.color = '#c0392b';
      if (files.some(function (f) { return f.status === 'uploading'; })) { msg.textContent = 'Please wait for your files to finish uploading.'; return; }
      var details = card.querySelector('#__pr_txt').value.trim();
      var hasEvidence = !!refMsg || files.some(function (f) { return f.status === 'done'; });
      if (details.length < 5 && !hasEvidence) { msg.textContent = 'Please describe the problem, or attach a message or file.'; return; }
      if (details.length < 5) details = refMsg ? 'Reported message (see below).' : 'See attached files.';
      var body = buildBody(details);
      send.disabled = true; send.textContent = 'Sending...';
      fetch(base() + '/api/admin/problem-reports', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify(body)
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (x.ok && x.j.success !== false) { card.innerHTML = '<div style="padding:24px 8px;text-align:center"><div style="font-size:34px">&#10003;</div><div style="font-weight:700;margin:8px 0">Report sent</div><div style="font-size:14px;color:#666">The admin team will review it and you will get an update.</div><button id="__pr_ok" style="margin-top:16px;padding:11px 26px;border:0;border-radius:10px;background:#f97316;color:#fff;font-weight:700">Done</button></div>'; card.querySelector('#__pr_ok').onclick = close; }
          else { msg.textContent = (x.j && x.j.message) || 'Could not send. Try again.'; send.disabled = false; send.textContent = 'Send report'; }
        }).catch(function () {
          // offline: keep it (with its already-uploaded files and message snapshot) and send when back online
          try { var q = JSON.parse(localStorage.getItem('__pr_queue') || '[]'); q.push(body); localStorage.setItem('__pr_queue', JSON.stringify(q)); } catch (_) {}
          msg.style.color = '#2c7a3f'; msg.textContent = 'Report received.'; send.textContent = 'Sent';
        });
    };
  }

  window.openProblemReport = openSheet;
  window.addEventListener('online', function () {
    var q; try { q = JSON.parse(localStorage.getItem('__pr_queue') || '[]'); } catch (_) { q = []; } if (!q.length) return;
    localStorage.removeItem('__pr_queue');
    q.forEach(function (b) { fetch(base() + '/api/admin/problem-reports', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: JSON.stringify(b) }).catch(function () {}); });
  });

  // Small unobtrusive flag button (hidden on the login page).
  function addButton() {
    if (/index\.html$|\/$|auth\.html$/.test(location.pathname) || document.getElementById('__pr_btn')) return;
    var b = el('button', 'position:fixed;left:10px;bottom:84px;z-index:2147482000;width:34px;height:34px;border-radius:50%;border:0;background:rgba(0,0,0,.45);color:#fff;font-size:16px;line-height:34px;padding:0;opacity:.75', '&#9873;');
    b.id = '__pr_btn'; b.title = 'Report a problem'; b.setAttribute('aria-label', 'Report a problem');
    b.onclick = function () { openSheet({}); };
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
})();
