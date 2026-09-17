/* Canonical Friends client contract. Loaded by the parent shell before modules.
 * Every module should use window.FriendsService instead of inventing friend state.
 */
(function () {
  'use strict';
  if (window.FriendsService) return;
  const base = () => String(window.__getApiBase?.() || window.API_BASE_URL || '').replace(/\/$/, '');
  const token = () => window.__kynToken || window.__accessToken || window.AuthSessionManager?.getToken?.() || localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const t = token(); if (t) headers.Authorization = 'Bearer ' + t;
    if (options.body && typeof options.body !== 'string' && !(options.body instanceof FormData)) { headers['Content-Type'] = 'application/json'; options = { ...options, body: JSON.stringify(options.body) }; }
    const response = await fetch(base() + path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || data.error || `Friends request failed (${response.status})`);
    return data;
  }
  const emit = (type, detail) => { try { window.dispatchEvent(new CustomEvent(type, { detail })); window.postMessage({ type, payload: detail }, window.location.origin); } catch (_) {} };
  const service = {
    request,
    async list(params = {}) { return request('/friends?' + new URLSearchParams(params)); },
    async incoming(params = {}) { return request('/friends/requests/incoming?' + new URLSearchParams(params)); },
    async outgoing(params = {}) { return request('/friends/requests/outgoing?' + new URLSearchParams(params)); },
    async status(userId) { return request('/friends/status/' + encodeURIComponent(userId)); },
    async send(userId) { const r = await request('/friends/requests', { method:'POST', body:{ userId:Number(userId) } }); emit('FRIEND_REQUEST_SENT', r.data || r); emit('FRIENDS_LIST_UPDATE', { reason:'request-sent', userId:Number(userId) }); return r; },
    async accept(requestId) { const r = await request('/friends/requests/' + encodeURIComponent(requestId) + '/accept', { method:'POST' }); emit('FRIEND_ACCEPTED', r.data || r); emit('FRIENDS_LIST_UPDATE', { reason:'accepted' }); return r; },
    async reject(requestId) { const r = await request('/friends/requests/' + encodeURIComponent(requestId) + '/reject', { method:'POST' }); emit('FRIEND_REQUEST_REJECTED', r.data || r); emit('FRIENDS_LIST_UPDATE', { reason:'rejected' }); return r; },
    async cancel(requestId) { const r = await request('/friends/requests/' + encodeURIComponent(requestId), { method:'DELETE' }); emit('FRIEND_REQUEST_CANCELLED', r.data || r); emit('FRIENDS_LIST_UPDATE', { reason:'cancelled' }); return r; },
    async remove(userId) { const r = await request('/friends/' + encodeURIComponent(userId), { method:'DELETE' }); emit('FRIEND_REMOVED', r.data || r); emit('FRIENDS_LIST_UPDATE', { reason:'removed', userId:Number(userId) }); return r; },
    async search(q, limit = 25) { return request('/friend-discovery/search?q=' + encodeURIComponent(q) + '&limit=' + limit); },
    async browse(offset = 0, limit = 30) { return request('/friend-discovery/browse?offset=' + offset + '&limit=' + limit); },
    async suggestions(limit = 20) { return request('/friend-discovery/suggestions?limit=' + limit); },
    async updateLocation(latitude, longitude) { return request('/friend-discovery/location', { method:'PUT', body:{ latitude, longitude } }); },
    async nearby(latitude, longitude, radius = 25) { return request('/friend-discovery/nearby?lat=' + encodeURIComponent(latitude) + '&lng=' + encodeURIComponent(longitude) + '&radius=' + radius); },
    open(targetUserId) {
      const url = 'friend.html' + (targetUserId ? '?target=' + encodeURIComponent(targetUserId) : '');
      if (window.__openFriendsOverlay) return window.__openFriendsOverlay(url);
      window.location.href = url;
    }
  };
  window.FriendsService = service;
  window.FriendsModule = service;

  function installParentAddFriend() {
    if (!/\/chat\.html$/i.test(location.pathname)) return;
    const add = () => {
      if (document.getElementById('fabAddFriend')) return;
      const header = document.getElementById('globalHeader') || document.querySelector('header') || document.querySelector('.global-header');
      if (!header) return;
      const button = document.createElement('button');
      button.id = 'fabAddFriend'; button.type = 'button'; button.title = 'Add friends'; button.setAttribute('aria-label', 'Add friends'); button.innerHTML = '<span aria-hidden="true">＋</span><span class="sr-only">Add friends</span>';
      button.addEventListener('click', () => openOverlay('friend.html?mode=add'));
      const style = document.createElement('style'); style.textContent = '#fabAddFriend{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:38px;height:38px;border:1px solid var(--kyn-border,#e2e8f0);border-radius:12px;background:var(--kyn-bg-panel,#fff);color:var(--kyn-text-primary,#0f172a);font-size:24px;line-height:1;display:grid;place-items:center;z-index:50;box-shadow:0 5px 18px rgba(0,0,0,.08)}#fabAddFriend:hover{transform:translateY(-50%) scale(1.05)}#fabAddFriend .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}'; document.head.appendChild(style);
      if (getComputedStyle(header).position === 'static') header.style.position = 'relative';
      header.appendChild(button);
    };
    const openOverlay = (url) => {
      let wrap = document.getElementById('friendsParentOverlay');
      if (!wrap) {
        wrap = document.createElement('div'); wrap.id='friendsParentOverlay'; wrap.innerHTML='<div class="fpo-backdrop"></div><div class="fpo-card"><div class="fpo-head"><b>Friends</b><button type="button" id="fpoClose">×</button></div><iframe id="friendsParentFrame" title="Friends"></iframe></div>';
        const st=document.createElement('style'); st.textContent='#friendsParentOverlay{position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:100000;display:grid;place-items:center;padding:18px}#friendsParentOverlay .fpo-card{width:min(760px,100%);height:min(760px,92vh);background:var(--kyn-bg-panel,#fff);border-radius:20px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.28);display:flex;flex-direction:column}#friendsParentOverlay .fpo-head{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid var(--kyn-border,#e2e8f0)}#friendsParentOverlay .fpo-head button{border:0;background:transparent;font-size:25px;cursor:pointer}#friendsParentFrame{border:0;flex:1;width:100%;background:transparent}'; document.head.appendChild(st); document.body.appendChild(wrap); wrap.querySelector('#fpoClose').onclick=()=>wrap.remove(); wrap.querySelector('.fpo-backdrop').onclick=()=>wrap.remove();
      }
      wrap.querySelector('#friendsParentFrame').src=url; wrap.style.display='grid';
    };
    window.__openFriendsOverlay=openOverlay;
    const observer=new MutationObserver(add); observer.observe(document.documentElement,{childList:true,subtree:true}); add(); setTimeout(add,500); setTimeout(add,1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installParentAddFriend); else installParentAddFriend();
})();
