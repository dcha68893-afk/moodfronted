/**
 * settings-ui.local-first.patch.js (v1.2)
 * UI additions for local-first settings, sync and two-account switching.
 */
(function () {
    'use strict';
    if (window.__SETTINGS_UI_LOCAL_PATCH__) return;
    window.__SETTINGS_UI_LOCAL_PATCH__ = true;

    const _origUpdateSetting = window.__updateSetting || null;
    window.__updateSetting = async function localFirstUpdateSetting(section, key, value) {
        if (window.saveSettingsLocal) window.saveSettingsLocal(section, key, value);
        if (typeof _origUpdateSetting === 'function') return _origUpdateSetting(section, key, value);
    };

    const SYNC_LABELS = {
        idle:{icon:'✓',text:'Saved',color:'var(--success-color)'}, synced:{icon:'☁',text:'Synced',color:'var(--success-color)'},
        pending:{icon:'⏳',text:'Pending sync',color:'var(--warning-color)'}, syncing:{icon:'↻',text:'Syncing…',color:'var(--primary-color)'},
        failed:{icon:'⚠',text:'Sync failed',color:'var(--danger-color)'}, offline:{icon:'📴',text:'Offline',color:'var(--text-secondary)'}
    };
    let _badgeHideTimer = null;
    function _getSyncBadge() {
        let badge=document.getElementById('settingsSyncBadge');
        if(!badge){ badge=document.createElement('div'); badge.id='settingsSyncBadge'; badge.setAttribute('aria-live','polite');
            badge.style.cssText='display:none;position:fixed;bottom:24px;right:24px;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:500;z-index:10001;box-shadow:0 2px 8px rgba(0,0,0,.15);transition:opacity .3s,transform .3s;pointer-events:none;align-items:center;gap:6px'; document.body.appendChild(badge); }
        return badge;
    }
    function _showSyncStatus(state) {
        if(state!=='idle'){ const store=window.LocalStoreSettings; if(store && !store.getAll().syncEnabled) return; }
        const label=SYNC_LABELS[state]||SYNC_LABELS.idle, badge=_getSyncBadge(); clearTimeout(_badgeHideTimer);
        badge.innerHTML=`<span>${label.icon}</span><span>${label.text}</span>`; badge.style.background=label.color; badge.style.color='#fff'; badge.style.display='flex'; badge.style.opacity='1'; badge.style.transform='translateY(0)';
        if(state==='synced'||state==='idle'){ _badgeHideTimer=setTimeout(()=>{badge.style.opacity='0';badge.style.transform='translateY(8px)';setTimeout(()=>{badge.style.display='none'},300)},3000); }
    }
    window.addEventListener('settingsSyncStatus',e=>{if(e.detail?.state)_showSyncStatus(e.detail.state)});
    window.addEventListener('settingsSavedLocal',()=>_showSyncStatus('idle'));

    function _updateOfflineStatus(){ const i=document.getElementById('settingsOfflineIndicator'); if(i)i.style.display=navigator.onLine?'none':'flex'; }
    window.addEventListener('online',_updateOfflineStatus); window.addEventListener('offline',_updateOfflineStatus);
    function _injectOfflineIndicator(){
        if(document.getElementById('settingsOfflineIndicator'))return;
        const h=document.querySelector('.settings-header')||document.querySelector('.content-header'); if(!h)return;
        const i=document.createElement('div'); i.id='settingsOfflineIndicator'; i.style.cssText='display:none;align-items:center;gap:6px;font-size:11px;padding:3px 10px;background:rgba(255,149,0,.15);color:var(--warning-color);border-radius:12px;margin-left:8px'; i.textContent='📴 Offline — changes saved locally'; h.appendChild(i); _updateOfflineStatus();
    }

    function _injectSyncRow(){
        if(document.getElementById('syncEnabledToggle'))return;
        let targetBody=null;
        document.querySelectorAll('.section-header h3').forEach(h=>{const t=h.textContent.toLowerCase();if(t.includes('advanced')||t.includes('developer')||t.includes('connection')){const s=h.closest('.settings-section');if(s)targetBody=s.querySelector('.section-body')}});
        if(!targetBody){const b=document.querySelectorAll('.settings-section .section-body');if(b.length)targetBody=b[b.length-1];} if(!targetBody)return;
        const settings=window.LocalStoreSettings?.getAll?.()||{}, enabled=settings.syncEnabled===true;
        const item=document.createElement('div'); item.className='setting-item'; item.id='syncToggleRow'; item.innerHTML=`<div class="setting-info"><div class="setting-label">☁ Multi-Device Sync</div><div class="setting-description">Sync settings across devices (optional). App works fully offline without this.</div></div><div class="setting-control"><label class="toggle-switch"><input type="checkbox" id="syncEnabledToggle"${enabled?' checked':''}><span class="toggle-slider"></span></label></div>`; targetBody.appendChild(item);
        document.getElementById('syncEnabledToggle')?.addEventListener('change',e=>window.__updateSetting('advanced','syncEnabled',e.target.checked));
    }
    window.addEventListener('settingsSavedLocal',e=>{if(e.detail?.key==='syncEnabled'&&e.detail.value===true){const s=window.SettingsSyncEngine;if(s)setTimeout(()=>s.syncOnLogin().catch(()=>{}),500)}});

    // ─── Two-account switcher ───────────────────────────────────────────────
    // The UI intentionally lives in this already-loaded Settings patch, so no
    // new HTML page dependency is required. Tokens are never rendered.
    function _getAccounts(){ try{return window.AuthStorage?.getSavedAccounts?.()||[]}catch(_){return[]} }
    function _escape(s){const d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
    function _accountModal(){
        let overlay=document.getElementById('savedAccountsModal');
        if(overlay)return overlay;
        overlay=document.createElement('div'); overlay.id='savedAccountsModal'; overlay.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10050;align-items:center;justify-content:center;padding:16px';
        overlay.innerHTML=`<div style="width:min(460px,100%);max-height:90vh;overflow:auto;background:var(--card-bg);color:var(--text-color);border:1px solid var(--border-color);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25)">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--border-color)"><div><strong style="font-size:18px">Accounts</strong><div style="font-size:12px;color:var(--text-secondary);margin-top:3px">Up to 2 accounts can be registered on this device</div></div><button id="savedAccountsClose" aria-label="Close" style="border:0;background:transparent;color:var(--text-secondary);font-size:20px;cursor:pointer">×</button></div>
            <div id="savedAccountsList" style="padding:14px 20px"></div>
            <div style="padding:14px 20px;border-top:1px solid var(--border-color);font-size:12px;color:var(--text-secondary)">Switching keeps each account's messages and local data isolated. The selected account becomes active after the app reloads.</div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.style.display='none'});
        document.getElementById('savedAccountsClose').addEventListener('click',()=>overlay.style.display='none');
        return overlay;
    }
    function _renderAccounts(){
        const overlay=_accountModal(), list=overlay.querySelector('#savedAccountsList'), accounts=_getAccounts();
        if(!accounts.length){list.innerHTML='<div style="padding:18px 4px;text-align:center;color:var(--text-secondary)">No saved accounts yet. Log in to a second account and it will appear here.</div>';return;}
        list.innerHTML=accounts.map((a,i)=>{
            const name=_escape(a.displayName||a.username||a.email||`Account ${i+1}`), sub=_escape(a.username?`@${a.username}`:(a.email||`Account ${a.userId}`));
            return `<button type="button" data-account-id="${_escape(a.userId)}" style="width:100%;display:flex;align-items:center;gap:12px;padding:12px;margin:0 0 8px;border:1px solid ${a.active?'var(--primary-color)':'var(--border-color)'};border-radius:10px;background:${a.active?'var(--primary-color-light)':'var(--bg-color)'};color:var(--text-color);text-align:left;cursor:${a.active?'default':'pointer'}" ${a.active?'disabled':''}><div style="width:42px;height:42px;border-radius:50%;overflow:hidden;background:var(--hover-color);display:flex;align-items:center;justify-content:center;flex:none">${a.avatar?`<img src="${_escape(a.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`:'<i class="fas fa-user" style="color:var(--text-secondary)"></i>'}</div><span style="flex:1;min-width:0"><strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</strong><small style="color:var(--text-secondary)">${sub}</small></span><span style="font-size:12px;color:var(--primary-color);font-weight:600">${a.active?'Current':'Switch'}</span></button>`;
        }).join('');
        list.querySelectorAll('[data-account-id]:not(:disabled)').forEach(btn=>btn.addEventListener('click',()=>{
            const result=window.AuthStorage?.switchAccount?.(btn.dataset.accountId);
            if(!result?.success){ window.alert(result?.error||'Unable to switch account'); return; }
            overlay.style.display='none';
            // A full reload reinitializes auth, sockets, settings and message
            // state against the newly selected account without mixing state.
            window.location.reload();
        }));
    }
    function _injectAccountSwitcher(){
        if(document.getElementById('settingsAccountSwitcher'))return;
        const menu=document.getElementById('settingsMenu'); if(!menu)return;
        const item=document.createElement('button'); item.type='button'; item.id='settingsAccountSwitcher'; item.className='menu-item'; item.style.cssText='width:100%;border:0;background:transparent;text-align:left;color:inherit;cursor:pointer';
        item.innerHTML='<div class="menu-icon"><i class="fas fa-users"></i></div><div class="menu-text">Switch account</div><span class="menu-badge" id="settingsAccountCount" style="display:none"></span>';
        menu.appendChild(item); item.addEventListener('click',()=>{_renderAccounts();const m=_accountModal();m.style.display='flex'});
        _updateAccountCount();
    }
    function _updateAccountCount(){const b=document.getElementById('settingsAccountCount');if(!b)return;const n=_getAccounts().length;b.textContent=`${n}/2`;b.style.display='inline-block';}
    window.addEventListener('auth:account:switched',_updateAccountCount);

    function _boot(){_injectOfflineIndicator();_injectAccountSwitcher();[500,1500,3000].forEach(ms=>setTimeout(()=>{_injectSyncRow();_injectAccountSwitcher()},ms));}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',_boot);else _boot();
    window.addEventListener('settingsUIReady',()=>setTimeout(()=>{_injectSyncRow();_injectAccountSwitcher()},300));
    window.addEventListener('settingsSectionLoaded',()=>setTimeout(_injectSyncRow,200));
    console.log('[settings-ui:patch] ✅ v1.2 applied');
})();