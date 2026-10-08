/* group-discover.js - group suggestions for group.html
 * Tabs: Nearby | Friends' groups | Public   (+ "My groups" for admins to choose who can discover each group)
 * Uses the page's own .modal/.card/.head/.section styles so it looks native and the hardware back button
 * (back-nav.js treats any visible .modal) closes it. Results are cached by js/offline-first.js, so the
 * screen still shows the last suggestions with no connection.
 */
(function () {
  'use strict';
  if (window.__groupDiscoverInstalled) return; window.__groupDiscoverInstalled = true;

  function pick(f) { for (var i = 0; i < f.length; i++) { try { var v = f[i](); if (v) return v; } catch (_) {} } return ''; }
  function base() {
    return String(pick([function () { return window.__getApiBase && window.__getApiBase(); }, function () { return window.API_BASE_URL; }]) || '').replace(/\/$/, '').replace(/\/api$/, '') + '/api';
  }
  function token() {
    return pick([function () { return window.__kynToken; }, function () { return window.__accessToken; },
      function () { return window.AuthSessionManager.getToken(); }, function () { return JSON.parse(localStorage.getItem('kynecta_auth')).token; },
      function () { return localStorage.getItem('authToken'); }, function () { return localStorage.getItem('accessToken'); }]);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  async function api(path, opt) {
    opt = opt || {};
    var r = await fetch(base() + path, {
      method: opt.method || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw Object.assign(new Error(j.message || ('Request failed (' + r.status + ')')), { status: r.status });
    return j;
  }

  var state = { tab: 'nearby', data: { nearby: [], friends: [], public: [] }, manage: [], q: '', loaded: false, error: '', seq: 0, pos: undefined };
  var TABS = [['nearby', 'Nearby'], ['friends', "Friends' groups"], ['public', 'Public'], ['manage', 'My groups']];
  var modal, body;

  function position() {
    /* FIX: location was re-requested (up to 6s) on every search keystroke, so searching felt dead.
       It is now asked once and remembered for this session. */
    if (state.pos !== undefined) return Promise.resolve(state.pos);
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { state.pos = null; return resolve(null); }
      navigator.geolocation.getCurrentPosition(function (p) { state.pos = { lat: p.coords.latitude, lng: p.coords.longitude }; resolve(state.pos); },
        function () { state.pos = null; resolve(null); }, { enableHighAccuracy: false, timeout: 6000, maximumAge: 600000 });
    });
  }

  function build() {
    if (modal) return;
    modal = document.createElement('div'); modal.id = 'discoverModal'; modal.className = 'modal hidden';
    modal.innerHTML = '<div class="card"><div class="head"><b>Discover groups</b><button id="discoverClose" class="smallbtn" type="button">&times;</button></div>' +
      '<div class="section"><div id="discoverTabs" style="display:flex;gap:6px;overflow-x:auto;margin-bottom:8px"></div>' +
      '<input id="discoverSearch" class="search" placeholder="Search groups&hellip;" style="width:100%;margin-bottom:8px"></div>' +
      '<div class="section" id="discoverBody" style="max-height:60vh;overflow:auto"></div></div>';
    document.body.appendChild(modal);
    body = modal.querySelector('#discoverBody');
    modal.querySelector('#discoverClose').onclick = close;
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    var t; modal.querySelector('#discoverSearch').oninput = function (e) {
      state.q = e.target.value.trim(); clearTimeout(t); t = setTimeout(function () { load(true); }, 300);
    };
    tabs();
  }
  function tabs() {
    var el = modal.querySelector('#discoverTabs');
    el.innerHTML = TABS.map(function (t) {
      return '<button type="button" class="smallbtn" data-t="' + t[0] + '" style="flex:0 0 auto;' + (state.tab === t[0] ? 'background:var(--primary);color:#fff' : '') + '">' + t[1] + '</button>';
    }).join('');
    el.querySelectorAll('button').forEach(function (b) { b.onclick = function () { state.tab = b.getAttribute('data-t'); tabs(); if (state.tab === 'manage') loadManage(); else render(); }; });
  }
  function avatar(g) {
    return g.avatar ? '<img src="' + esc(window.__resolveMediaUrl ? window.__resolveMediaUrl(g.avatar) : g.avatar) + '" alt="" style="width:44px;height:44px;border-radius:13px;object-fit:cover" loading="lazy">'
      : '<div class="avatar">' + esc((g.name || 'G').slice(0, 1).toUpperCase()) + '</div>';
  }
  function sub(g) {
    var parts = [g.memberCount + ' member' + (g.memberCount === 1 ? '' : 's')];
    if (state.tab === 'friends' && g.friendsCount) parts.push(g.friendsCount + ' friend' + (g.friendsCount === 1 ? '' : 's') + (g.friendNames && g.friendNames.length ? ' (' + g.friendNames.map(esc).join(', ') + ')' : ''));
    if (state.tab === 'nearby' && g.nearbyMembers) parts.push(g.nearbyMembers + ' near you');
    return parts.join(' &middot; ');
  }
  function render() {
    if (state.tab === 'manage') return renderManage();
    var rows = state.data[state.tab] || [];
    if (!rows.length) {
      if (state.error) { body.innerHTML = '<div class="empty">' + esc(state.error) + '<br><button type="button" class="smallbtn" id="discoverRetry" style="margin-top:8px">Try again</button></div>'; var rb = body.querySelector('#discoverRetry'); if (rb) rb.onclick = function () { load(true); }; return; }
      if (state.loaded && state.q) { body.innerHTML = '<div class="empty">No groups match &ldquo;' + esc(state.q) + '&rdquo;.</div>'; return; }
      var hint = state.tab === 'nearby' ? 'No groups nearby yet. Allow location access to see public groups around you.' :
        state.tab === 'friends' ? "No groups from your friends to suggest right now." : 'No public groups to show yet.';
      body.innerHTML = '<div class="empty">' + (state.loaded ? hint : 'Loading&hellip;') + '</div>'; return;
    }
    body.innerHTML = rows.map(function (g) {
      return '<div class="group" style="cursor:default" data-id="' + g.id + '">' + avatar(g) + '<div style="flex:1;min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(g.name) + '</div>' +
        '<div style="opacity:.7;font-size:12px">' + sub(g) + '</div>' + (g.description ? '<div style="opacity:.8;font-size:12px;margin-top:2px;overflow:hidden;max-height:32px">' + esc(g.description) + '</div>' : '') + '</div>' +
        '<button type="button" class="smallbtn" data-join="' + g.id + '">Join</button></div>';
    }).join('');
    body.querySelectorAll('[data-join]').forEach(function (b) { b.onclick = function () { join(b.getAttribute('data-join'), b); }; });
  }
  async function join(id, btn) {
    btn.disabled = true; btn.textContent = '...';
    try {
      var j = await api('/group-suggestions/' + id + '/join', { method: 'POST' });
      btn.textContent = j.data && j.data.pending ? 'Requested' : 'Joined';
      if (!(j.data && j.data.pending)) {
        try { window.__GROUP_LOAD_GROUPS && window.__GROUP_LOAD_GROUPS(); } catch (_) {}
        setTimeout(function () { var row = btn.closest('.group'); if (row) row.remove(); }, 700);
      }
    } catch (e) { btn.disabled = false; btn.textContent = 'Join'; alert(e.message || 'Could not join this group.'); }
  }
  async function load(force) {
    build();
    var my = ++state.seq;               /* FIX: a slow older response could overwrite the newest search */
    state.error = '';
    var pos = await position();
    var qs = '?limit=30' + (state.q ? '&q=' + encodeURIComponent(state.q) : '') + (pos ? '&lat=' + pos.lat + '&lng=' + pos.lng : '');
    try {
      var j = await api('/group-suggestions' + qs);
      if (my !== state.seq) return;
      var d = j && j.data;
      if (Array.isArray(d)) d = { nearby: [], friends: [], public: d };   /* tolerate old array-shaped responses */
      state.data = Object.assign({ nearby: [], friends: [], public: [] }, d || {});
    } catch (e) {
      if (my !== state.seq) return;
      state.error = (navigator.onLine === false || /failed to fetch|network|load failed/i.test(String(e && e.message)))
        ? 'You are offline. Connect to search for groups.' : (e && e.message) || 'Could not load groups.';
      /* keep previous results visible instead of wiping them */
      if (state.data[state.tab] && state.data[state.tab].length) state.error = '';
    }
    state.loaded = true; if (state.tab !== 'manage') render();
  }
  async function loadManage() {
    body.innerHTML = '<div class="empty">Loading&hellip;</div>';
    try { var j = await api('/group-suggestions/manage'); state.manage = Array.isArray(j.data) ? j.data : []; } catch (e) { state.manage = []; body.innerHTML = '<div class="empty">' + esc(e.message || 'Could not load your groups.') + '</div>'; return; }
    renderManage();
  }
  function renderManage() {
    if (!state.manage.length) { body.innerHTML = '<div class="empty">Groups you administer will appear here. You choose who can discover each one.</div>'; return; }
    body.innerHTML = '<div style="opacity:.75;font-size:12px;margin-bottom:8px">Private: invite only &middot; Friends: suggested to friends of members &middot; Public: suggested to everyone, including people nearby.</div>' +
      state.manage.map(function (g) {
        return '<div class="group" style="cursor:default">' + avatar(g) + '<div style="flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(g.name) + '</div>' +
          '<select data-vis="' + g.id + '" style="padding:6px;border-radius:8px">' + ['private', 'friends', 'public'].map(function (v) { return '<option value="' + v + '"' + (g.visibility === v ? ' selected' : '') + '>' + v.charAt(0).toUpperCase() + v.slice(1) + '</option>'; }).join('') + '</select></div>';
      }).join('');
    body.querySelectorAll('[data-vis]').forEach(function (s) {
      s.onchange = async function () {
        var prev = state.manage.find(function (g) { return String(g.id) === s.getAttribute('data-vis'); });
        try { await api('/group-suggestions/' + s.getAttribute('data-vis') + '/visibility', { method: 'PUT', body: { visibility: s.value } }); if (prev) prev.visibility = s.value; }
        catch (e) { alert(e.message || 'Could not change this.'); if (prev) s.value = prev.visibility; }
      };
    });
  }
  function open() { build(); modal.classList.remove('hidden'); render(); load(); }
  function close() { if (modal) modal.classList.add('hidden'); }

  function addButton() {
    var head = document.querySelector('.side-head');
    if (!head || document.getElementById('discoverBtn')) return;
    var b = document.createElement('button'); b.id = 'discoverBtn'; b.type = 'button'; b.className = 'smallbtn'; b.title = 'Discover groups'; b.setAttribute('aria-label', 'Discover groups'); b.innerHTML = '&#128269;&#xFE0E;&#10024;';
    b.style.marginLeft = 'auto'; b.style.marginRight = '6px'; b.onclick = open;
    var create = document.getElementById('createGroupBtn');
    if (create) head.insertBefore(b, create); else head.appendChild(b);
  }
  window.openGroupDiscover = open;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
})();