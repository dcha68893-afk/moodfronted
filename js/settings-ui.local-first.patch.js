/** Settings local-first UI patch: complete two-account add/switch flow. */
(function () {
  'use strict';
  if (window.__SETTINGS_UI_LOCAL_PATCH__) return;
  window.__SETTINGS_UI_LOCAL_PATCH__ = true;

  const ACCOUNT_SCRIPT = '/js/authStorage.js';
  let accountBootPromise = null;
  const loadAuthStorage = () => {
    if (window.AuthStorage) return Promise.resolve(window.AuthStorage);
    if (accountBootPromise) return accountBootPromise;
    accountBootPromise = new Promise(resolve => {
      const s = document.createElement('script'); s.src = ACCOUNT_SCRIPT;
      s.onload = () => resolve(window.AuthStorage || null); s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
    return accountBootPromise;
  };
  const esc = v => { const d=document.createElement('div'); d.textContent=v==null?'':String(v); return d.innerHTML; };
  const getAccounts = () => { try { return window.AuthStorage?.getSavedAccounts?.() || []; } catch (_) { return []; } };
  const apiBase = () => (window.__kynAPI?.baseUrl || window.API_BASE_URL || '/api').replace(/\/$/,'') + (window.__kynAPI?.baseUrl ? '' : '/api');

  function ensureModal() {
    let o=document.getElementById('savedAccountsModal'); if(o) return o;
    o=document.createElement('div'); o.id='savedAccountsModal';
    o.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10050;align-items:center;justify-content:center;padding:16px';
    o.innerHTML=`<div style="width:min(460px,100%);max-height:90vh;overflow:auto;background:var(--card-bg);color:var(--text-color);border:1px solid var(--border-color);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--border-color)"><div><strong style="font-size:18px">Accounts</strong><div style="font-size:12px;color:var(--text-secondary);margin-top:3px">Up to 2 accounts on this device</div></div><button id="savedAccountsClose" aria-label="Close" style="border:0;background:transparent;color:var(--text-secondary);font-size:20px;cursor:pointer">×</button></div>
      <div id="savedAccountsList" style="padding:14px 20px"></div>
      <div style="padding:12px 20px;border-top:1px solid var(--border-color);font-size:12px;color:var(--text-secondary)">Your password is used only for verification and is never saved by the account switcher.</div>
    </div>`;
    document.body.appendChild(o); o.addEventListener('click',e=>{if(e.target===o)o.style.display='none';});
    o.querySelector('#savedAccountsClose').onclick=()=>o.style.display='none'; return o;
  }

  function renderAccounts() {
    const o=ensureModal(), list=o.querySelector('#savedAccountsList'), rows=getAccounts();
    list.innerHTML=rows.map((a,i)=>`<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-color)">
      <div style="width:42px;height:42px;border-radius:50%;overflow:hidden;background:var(--hover-color);display:flex;align-items:center;justify-content:center;flex:none">${a.avatar?`<img src="${esc(a.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover">`:'<i class="fas fa-user"></i>'}</div>
      <div style="flex:1;min-width:0"><strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.displayName||a.username||a.email||`Account ${i+1}`)}</strong><small style="color:var(--text-secondary)">${esc(a.email||a.username||'')}</small></div>
      ${a.active?'<span style="font-size:12px;color:var(--primary-color);font-weight:600">Current</span>':`<button type="button" data-switch="${esc(a.userId)}" class="action-btn secondary" style="padding:7px 12px">Switch</button>`}
    </div>`).join('');
    if(rows.length<2) list.insertAdjacentHTML('beforeend',`<button id="addAccountButton" type="button" class="action-btn primary" style="width:100%;justify-content:center;margin-top:14px"><i class="fas fa-user-plus"></i><span>Add account</span></button>`);
    if(!rows.length) list.insertAdjacentHTML('afterbegin','<div style="padding:8px 0 4px;color:var(--text-secondary)">No saved accounts yet. Sign in below to add an account.</div>');
    list.querySelectorAll('[data-switch]').forEach(b=>b.onclick=()=>{const r=window.AuthStorage?.switchAccount?.(b.dataset.switch);if(!r?.success)return alert(r?.error||'Unable to switch account');o.style.display='none';location.reload();});
    const add=list.querySelector('#addAccountButton'); if(add) add.onclick=showAddAccount;
  }

  function showAddAccount(){
    const o=ensureModal(), list=o.querySelector('#savedAccountsList');
    list.innerHTML=`<div style="padding:4px 0 12px"><strong style="font-size:17px">Add account</strong><div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Enter the email and password for the second account. These details are verified by the server and the password is not stored.</div></div>
      <form id="addAccountForm"><label style="display:block;margin:10px 0 5px;font-size:13px">Email</label><input id="addAccountEmail" type="email" autocomplete="email" required style="width:100%;box-sizing:border-box;padding:11px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-color);color:var(--text-color)">
      <label style="display:block;margin:12px 0 5px;font-size:13px">Password</label><input id="addAccountPassword" type="password" autocomplete="current-password" required style="width:100%;box-sizing:border-box;padding:11px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-color);color:var(--text-color)">
      <div id="addAccountError" style="display:none;color:var(--danger-color);font-size:12px;margin-top:10px"></div><button id="addAccountSubmit" type="submit" class="action-btn primary" style="width:100%;justify-content:center;margin-top:16px"><i class="fas fa-sign-in-alt"></i><span>Verify & add account</span></button></form>
      <button id="addAccountBack" type="button" class="action-btn secondary" style="width:100%;justify-content:center;margin-top:8px">Back</button>`;
    list.querySelector('#addAccountBack').onclick=renderAccounts;
    list.querySelector('#addAccountForm').onsubmit=async e=>{
      e.preventDefault(); const email=list.querySelector('#addAccountEmail').value.trim(); const password=list.querySelector('#addAccountPassword').value; const err=list.querySelector('#addAccountError'); const submit=list.querySelector('#addAccountSubmit');
      err.style.display='none'; submit.disabled=true; submit.querySelector('span').textContent='Verifying…';
      try{
        const res=await fetch(apiBase()+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:email,password})});
        const data=await res.json().catch(()=>({}));
        if(!res.ok || !data.success){ throw new Error(data.message||'Invalid email or password'); }
        if(data.requiresMfa){ throw new Error('This account requires two-factor verification. Sign in normally first, then add it again.'); }
        const saved=window.AuthStorage?.registerAccount?.(data);
        if(!saved?.success) throw new Error(saved?.error||'Could not save this account');
        list.innerHTML='<div style="padding:24px 4px;text-align:center"><i class="fas fa-check-circle" style="font-size:28px;color:var(--success-color)"></i><div style="font-weight:600;margin-top:10px">Account added</div><div style="font-size:12px;color:var(--text-secondary);margin-top:5px">You can now switch to it without entering the password again.</div></div><button id="accountDone" class="action-btn primary" style="width:100%;justify-content:center;margin-top:14px">Done</button>';
        list.querySelector('#accountDone').onclick=renderAccounts;
        updateCount();
      }catch(ex){err.textContent=ex.message||'Unable to add account';err.style.display='block';submit.disabled=false;submit.querySelector('span').textContent='Verify & add account';}
    };
  }

  function updateCount(){const b=document.getElementById('settingsAccountCount');if(b)b.textContent=`${getAccounts().length}/2`;}
  async function injectAccountSwitcher(){const menu=document.getElementById('settingsMenu');if(!menu||document.getElementById('settingsAccountSwitcher'))return;await loadAuthStorage();const b=document.createElement('button');b.type='button';b.id='settingsAccountSwitcher';b.className='menu-item';b.style.cssText='width:100%;border:0;background:transparent;text-align:left;color:inherit;cursor:pointer';b.innerHTML='<div class="menu-icon"><i class="fas fa-users"></i></div><div class="menu-text">Switch account</div><span class="menu-badge" id="settingsAccountCount">0/2</span>';menu.appendChild(b);b.onclick=async()=>{await loadAuthStorage();renderAccounts();ensureModal().style.display='flex';};updateCount();}

  function injectSyncRow(){if(document.getElementById('syncEnabledToggle'))return;let body=null;document.querySelectorAll('.section-header h3').forEach(h=>{const t=(h.textContent||'').toLowerCase();if(t.includes('advanced')||t.includes('developer')||t.includes('connection')){const s=h.closest('.settings-section');if(s)body=s.querySelector('.section-body');}});if(!body)return;const enabled=window.LocalStoreSettings?.getAll?.().syncEnabled===true;const row=document.createElement('div');row.className='setting-item';row.id='syncToggleRow';row.innerHTML=`<div class="setting-info"><div class="setting-label">☁ Multi-Device Sync</div><div class="setting-description">Sync settings across devices (optional).</div></div><div class="setting-control"><label class="toggle-switch"><input type="checkbox" id="syncEnabledToggle"${enabled?' checked':''}><span class="toggle-slider"></span></label></div>`;body.appendChild(row);document.getElementById('syncEnabledToggle').onchange=e=>{if(typeof window.__updateSetting==='function')window.__updateSetting('advanced','syncEnabled',e.target.checked);};}
  async function boot(){await loadAuthStorage();await injectAccountSwitcher();injectSyncRow();[700,1600,3000].forEach(ms=>setTimeout(()=>{injectAccountSwitcher();injectSyncRow();},ms));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('settingsUIReady',()=>{injectAccountSwitcher();injectSyncRow();}); window.addEventListener('settingsSectionLoaded',()=>setTimeout(injectSyncRow,200)); window.addEventListener('auth:account:switched',updateCount);
})();