/* admin-inbox.js - problem-reports inbox for admins, available inside every module.
 * Loaded by report-problem.js (which every module page already includes).
 * - Shows a small shield button ONLY to admins (the server decides: GET /api/admin/problem-reports is 403 for everyone else).
 * - Inbox is grouped by module (Chat, Groups, Friends, Status, Market, Games, Settings...) with per-module counts,
 *   status + category filters, and the actions the backend supports: warn / suspend / remove / dismiss / respond.
 * - Uses class "overlay open" so the hardware back button (back-nav.js) closes it like any other panel.
 */
(function () {
  'use strict';
  if (window.__adminInboxInstalled) return; window.__adminInboxInstalled = true;
  if (/index\.html$|\/$|auth\.html$|signup\.html$/.test(location.pathname)) return;

  function pick(f) { for (var i = 0; i < f.length; i++) { try { var v = f[i](); if (v) return v; } catch (_) {} } return ''; }
  function base() {
    return String(pick([function () { return window.__getApiOrigin && window.__getApiOrigin(); },
      function () { return window.parent.__getApiOrigin && window.parent.__getApiOrigin(); },
      function () { return window.__getApiBase && window.__getApiBase(); },
      function () { return window.API_BASE_URL; }])).replace(/\/api\/?$/, '').replace(/\/$/, '');
  }
  function token() {
    return pick([function () { return window.__kynToken; }, function () { return window.__accessToken; },
      function () { return window.AuthSessionManager.getToken(); }, function () { return JSON.parse(localStorage.getItem('kynecta_auth')).token; },
      function () { return localStorage.getItem('authToken'); }, function () { return localStorage.getItem('accessToken'); }, function () { return localStorage.getItem('token'); }]);
  }
  function meId() { return pick([function () { var a = JSON.parse(localStorage.getItem('kynecta_auth')); return a.user.id || a.user.userId; }]) || 'x'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  async function call(path, opt) {
    opt = opt || {};
    var r = await fetch(base() + '/api/admin' + path, {
      method: opt.method || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) { var e = new Error(j.message || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
    return j;
  }

  var FLAG = '__ai_admin_' + meId();
  function cachedAdmin() { try { return sessionStorage.getItem(FLAG) === '1'; } catch (_) { return false; } }
  function setAdmin(v) { try { sessionStorage.setItem(FLAG, v ? '1' : '0'); } catch (_) {} }

  var state = { rows: [], status: 'pending', category: '', module: '' };
  var CATS = ['scam', 'harassment', 'bias', 'hate_speech', 'spam', 'inappropriate_content', 'fake_account', 'payment_issue', 'bug', 'error', 'other'];

  function css() {
    if (document.getElementById('__ai_css')) return;
    var s = document.createElement('style'); s.id = '__ai_css';
    s.textContent = '.__ai_overlay{display:none;position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.55);align-items:flex-end;justify-content:center;font-family:system-ui,sans-serif}' +
      '.__ai_overlay.open{display:flex}.__ai_card{background:#fff;color:#111;width:100%;max-width:720px;height:92vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden}' +
      '.__ai_head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #eee;font-weight:700;font-size:17px}' +
      '.__ai_bar{display:flex;gap:8px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid #eee}' +
      '.__ai_bar select{padding:8px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:#fff;color:#111}' +
      '.__ai_chips{display:flex;gap:6px;overflow-x:auto;padding:8px 16px;border-bottom:1px solid #eee}' +
      '.__ai_chip{flex:0 0 auto;padding:6px 11px;border-radius:999px;border:1px solid #ddd;background:#fff;font-size:13px;color:#111}' +
      '.__ai_chip.on{background:#f97316;border-color:#f97316;color:#fff}' +
      '.__ai_list{flex:1;overflow:auto;padding:10px 16px 24px}' +
      '.__ai_item{border:1px solid #eee;border-radius:12px;padding:12px;margin-bottom:10px}' +
      '.__ai_meta{font-size:12px;color:#666;margin-bottom:6px}' +
      '.__ai_txt{font-size:14px;white-space:pre-wrap;word-break:break-word}' +
      '.__ai_btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}' +
      '.__ai_btns button{padding:7px 11px;border:0;border-radius:8px;background:#eee;font-size:13px;color:#111}' +
      '.__ai_btns .danger{background:#fde8e8;color:#b42318}.__ai_badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#f3f4f6;font-size:11px;margin-left:6px}';
    document.head.appendChild(s);
  }

  var overlay;
  function build() {
    if (overlay) return overlay;
    css();
    overlay = document.createElement('div'); overlay.className = '__ai_overlay overlay'; overlay.id = '__ai_overlay';
    overlay.innerHTML = '<div class="__ai_card"><div class="__ai_head"><span>Problem reports inbox</span><button id="__ai_close" style="border:0;background:none;font-size:24px;line-height:1;color:#111">&times;</button></div>' +
      '<div class="__ai_chips" id="__ai_chips"></div>' +
      '<div class="__ai_bar"><select id="__ai_status"><option value="pending">Pending</option><option value="reviewed">Reviewed</option><option value="actioned">Actioned</option><option value="dismissed">Dismissed</option><option value="">All statuses</option></select>' +
      '<select id="__ai_cat"><option value="">All categories</option>' + CATS.map(function (c) { return '<option value="' + c + '">' + c.replace(/_/g, ' ') + '</option>'; }).join('') + '</select>' +
      '<button id="__ai_refresh" style="padding:8px 12px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#111">Refresh</button></div>' +
      '<div class="__ai_list" id="__ai_list"></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#__ai_close').onclick = close;
    overlay.querySelector('#__ai_refresh').onclick = load;
    overlay.querySelector('#__ai_status').onchange = function (e) { state.status = e.target.value; load(); };
    overlay.querySelector('#__ai_cat').onchange = function (e) { state.category = e.target.value; load(); };
    return overlay;
  }
  function close() { if (overlay) overlay.classList.remove('open'); }
  function open() { build().classList.add('open'); load(); }

  function chips() {
    var counts = {}; state.rows.forEach(function (r) { var m = r.module || 'app'; counts[m] = (counts[m] || 0) + 1; });
    var el = overlay.querySelector('#__ai_chips');
    var names = Object.keys(counts).sort();
    el.innerHTML = '<button class="__ai_chip' + (!state.module ? ' on' : '') + '" data-m="">All (' + state.rows.length + ')</button>' +
      names.map(function (m) { return '<button class="__ai_chip' + (state.module === m ? ' on' : '') + '" data-m="' + esc(m) + '">' + esc(m) + ' (' + counts[m] + ')</button>'; }).join('');
    el.querySelectorAll('.__ai_chip').forEach(function (b) { b.onclick = function () { state.module = b.getAttribute('data-m'); render(); }; });
  }
  function render() {
    chips();
    var list = overlay.querySelector('#__ai_list');
    var rows = state.rows.filter(function (r) { return !state.module || (r.module || 'app') === state.module; });
    if (!rows.length) { list.innerHTML = '<div style="padding:30px 0;text-align:center;color:#888">No reports here.</div>'; return; }
    list.innerHTML = rows.map(function (r) {
      var when = r.createdAt ? new Date(r.createdAt).toLocaleString() : '';
      var canAct = r.status === 'pending' || r.status === 'reviewed';
      return '<div class="__ai_item" data-id="' + r.id + '"><div class="__ai_meta"><b>' + esc((r.category || '').replace(/_/g, ' ')) + '</b><span class="__ai_badge">' + esc(r.module || 'app') + '</span><span class="__ai_badge">' + esc(r.status) + '</span><br>' +
        'From @' + esc(r.reporterName || r.reporterId) + (r.targetUserId ? ' &middot; About @' + esc(r.targetName || r.targetUserId) : '') + ' &middot; ' + esc(when) + '</div>' +
        '<div class="__ai_txt">' + esc(r.details) + '</div>' +
        (r.actionTaken ? '<div class="__ai_meta" style="margin-top:8px">Action: ' + esc(r.actionTaken) + (r.adminNote ? ' &mdash; ' + esc(r.adminNote) : '') + '</div>' : '') +
        (canAct ? '<div class="__ai_btns">' +
          (r.targetUserId ? '<button data-a="warn">Warn</button><button data-a="suspend" class="danger">Suspend</button><button data-a="remove" class="danger">Remove</button>' : '') +
          '<button data-a="respond">Reply</button><button data-a="dismiss">Dismiss</button></div>' : '') + '</div>';
    }).join('');
    list.querySelectorAll('.__ai_btns button').forEach(function (b) {
      b.onclick = function () { act(Number(b.closest('.__ai_item').getAttribute('data-id')), b.getAttribute('data-a'), b); };
    });
  }
  async function act(id, action, btn) {
    var note = '';
    if (action === 'respond') { note = prompt('Reply to the reporter:', '') || ''; if (!note.trim()) return; }
    else if (action === 'warn') { note = prompt('Warning message (optional):', '') || ''; }
    else if (action === 'suspend' || action === 'remove') {
      if (!confirm((action === 'remove' ? 'Remove this account and its marketplace listings?' : 'Suspend this account?'))) return;
      note = prompt('Reason (shown to the user, optional):', '') || '';
    }
    btn.disabled = true;
    try { await call('/problem-reports/' + id, { method: 'PATCH', body: { action: action, message: note } }); await load(); }
    catch (e) { alert(e.message || 'Could not apply that action.'); btn.disabled = false; }
  }
  async function load() {
    build();
    var q = '?limit=200' + (state.status ? '&status=' + encodeURIComponent(state.status) : '') + (state.category ? '&category=' + encodeURIComponent(state.category) : '');
    try { var j = await call('/problem-reports' + q); state.rows = j.data || []; render(); }
    catch (e) { overlay.querySelector('#__ai_list').innerHTML = '<div style="padding:30px 0;text-align:center;color:#888">Reports will appear here.</div>'; }
  }

  function addButton() {
    if (document.getElementById('__ai_btn')) return;
    var b = document.createElement('button');
    b.id = '__ai_btn'; b.title = 'Reports inbox (admin)'; b.setAttribute('aria-label', 'Reports inbox');
    b.style.cssText = 'position:fixed;left:10px;bottom:126px;z-index:2147482000;width:34px;height:34px;border-radius:50%;border:0;background:#f97316;color:#fff;font-size:16px;line-height:34px;padding:0;opacity:.85';
    b.innerHTML = '&#128737;';
    b.onclick = open;
    document.body.appendChild(b);
  }
  async function probe() {
    if (!token()) return;
    if (cachedAdmin()) { addButton(); return; }
    try { await call('/problem-reports?limit=1'); setAdmin(true); addButton(); }
    catch (e) { if (e && e.status === 403) setAdmin(false); }
  }
  window.openAdminInbox = open;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', probe); else probe();
})();
