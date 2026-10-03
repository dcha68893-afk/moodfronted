/* report-problem.js - "Report a problem" for every module.
   Adds a small flag button + a sheet (scam, harassment, bias, bug...). The report goes to
   POST /api/admin/problem-reports, which notifies the admins. Any screen can also call
   window.openProblemReport({ module, targetUserId, targetRef }) from its own menu. */
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
    return String(pick([function () { return window.__getApiBase && window.__getApiBase(); }, function () { return window.API_BASE_URL; },
      function () { return window.parent.__getApiBase && window.parent.__getApiBase(); }, function () { return window.parent.API_BASE_URL; }]) || '').replace(/\/$/, '');
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
      '<textarea id="__pr_txt" rows="5" placeholder="What happened? Include names, links or what you were doing." style="width:100%;box-sizing:border-box;padding:11px;border:1px solid #ddd;border-radius:10px;font-size:15px;resize:vertical"></textarea>' +
      '<div id="__pr_msg" style="font-size:13px;min-height:18px;margin:8px 0;color:#c0392b"></div>' +
      '<div style="display:flex;gap:10px"><button id="__pr_cancel" style="flex:1;padding:12px;border:0;border-radius:10px;background:#eee;font-size:15px">Cancel</button>' +
      '<button id="__pr_send" style="flex:1;padding:12px;border:0;border-radius:10px;background:#f97316;color:#fff;font-weight:700;font-size:15px">Send report</button></div>';
    wrap.appendChild(card); document.body.appendChild(wrap);
    function close() { wrap.remove(); }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    card.querySelector('#__pr_cancel').onclick = close;
    if (opts.category) card.querySelector('#__pr_cat').value = opts.category;
    var msg = card.querySelector('#__pr_msg'), send = card.querySelector('#__pr_send');
    send.onclick = function () {
      var details = card.querySelector('#__pr_txt').value.trim();
      if (details.length < 5) { msg.textContent = 'Please describe the problem.'; return; }
      send.disabled = true; send.textContent = 'Sending...';
      fetch(base() + '/api/admin/problem-reports', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ category: card.querySelector('#__pr_cat').value, details: details, module: opts.module || moduleName(),
          targetUserId: opts.targetUserId || null, targetRef: opts.targetRef || null, subject: opts.subject || '' })
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (x.ok && x.j.success !== false) { card.innerHTML = '<div style="padding:24px 8px;text-align:center"><div style="font-size:34px">&#10003;</div><div style="font-weight:700;margin:8px 0">Report sent</div><div style="font-size:14px;color:#666">The admin team will review it and you will get an update.</div><button id="__pr_ok" style="margin-top:16px;padding:11px 26px;border:0;border-radius:10px;background:#f97316;color:#fff;font-weight:700">Done</button></div>'; card.querySelector('#__pr_ok').onclick = close; }
          else { msg.textContent = (x.j && x.j.message) || 'Could not send. Try again.'; send.disabled = false; send.textContent = 'Send report'; }
        }).catch(function () {
          // offline: keep it and send when back online
          try { var q = JSON.parse(localStorage.getItem('__pr_queue') || '[]'); q.push({ category: card.querySelector('#__pr_cat').value, details: details, module: opts.module || moduleName(), targetUserId: opts.targetUserId || null, targetRef: opts.targetRef || null }); localStorage.setItem('__pr_queue', JSON.stringify(q)); } catch (_) {}
          msg.style.color = '#2c7a3f'; msg.textContent = 'You are offline - the report will be sent when you reconnect.'; send.textContent = 'Saved';
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
