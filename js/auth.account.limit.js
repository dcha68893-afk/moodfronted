// js/auth.account.limit.js - Account Limit Enforcement
(function() {
    'use strict';

    const MAX_ACCOUNTS = 2;
    const STORAGE_KEY = 'kynecta_device_accounts';
    const AUTH_STORAGE_KEY = 'kynecta_saved_accounts';

    function parse(raw, fallback = []) {
        try { const value = raw ? JSON.parse(raw) : fallback; return Array.isArray(value) ? value : fallback; }
        catch (_) { return fallback; }
    }

    function getAuthAccounts() {
        try {
            const fromAuthStorage = window.AuthStorage?.getSavedAccounts?.();
            if (Array.isArray(fromAuthStorage)) return fromAuthStorage.slice(0, MAX_ACCOUNTS);
        } catch (_) {}
        return parse(localStorage.getItem(AUTH_STORAGE_KEY), []).slice(0, MAX_ACCOUNTS);
    }

    function getDeviceAccounts() {
        const canonical = getAuthAccounts();
        const normalized = canonical.map(acc => ({
            userId: acc.userId,
            email: acc.email || null,
            username: acc.username || null,
            displayName: acc.displayName || acc.username || acc.email || `Account ${acc.userId}`,
            avatar: acc.avatar || null,
            lastUsed: acc.lastUsed || 0,
            deleted: false,
            expired: false
        }));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch (_) {}
        return normalized;
    }

    function saveDeviceAccounts(accounts) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify((accounts || []).slice(0, MAX_ACCOUNTS))); return true; }
        catch (_) { return false; }
    }

    function canRegisterNewAccount() { return getAuthAccounts().length < MAX_ACCOUNTS; }

    function registerDeviceAccount(userId, email, username) {
        const accounts = getAuthAccounts();
        const existing = accounts.find(acc => String(acc?.userId) === String(userId) || (email && acc?.email === email));
        if (existing) { renderLoginAccountSwitcher(); return { success: true, existing: true }; }
        if (!canRegisterNewAccount()) return { success: false, error: `Maximum ${MAX_ACCOUNTS} accounts per device. Remove an existing saved account before adding another account.` };
        renderLoginAccountSwitcher();
        return { success: true };
    }

    function removeDeviceAccount(userId) {
        try {
            if (window.AuthStorage?.removeSavedAccount) {
                const result = window.AuthStorage.removeSavedAccount(userId);
                if (result?.success) { renderLoginAccountSwitcher(); return true; }
            }
        } catch (_) {}
        let removed = false;
        try {
            const accounts = parse(localStorage.getItem(AUTH_STORAGE_KEY), []);
            const next = accounts.filter(acc => String(acc?.userId) !== String(userId));
            removed = next.length !== accounts.length;
            if (removed) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next.slice(0, MAX_ACCOUNTS)));
        } catch (_) {}
        try {
            const accounts = parse(localStorage.getItem(STORAGE_KEY), []);
            const next = accounts.filter(acc => String(acc?.userId) !== String(userId));
            if (next.length !== accounts.length) removed = true;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_ACCOUNTS)));
        } catch (_) {}
        if (removed) { try { window.dispatchEvent(new CustomEvent('auth:saved-account:removed', { detail: { userId } })); } catch (_) {} }
        renderLoginAccountSwitcher();
        return removed;
    }

    function switchSavedAccount(userId) {
        try {
            if (window.AuthStorage?.switchAccount) {
                const result = window.AuthStorage.switchAccount(userId);
                if (result?.success) window.dispatchEvent(new CustomEvent('auth:saved-account:switched', { detail: result }));
                return result;
            }
        } catch (error) { return { success: false, error: error.message }; }
        return { success: false, error: 'Account switching is unavailable' };
    }

    function showAuthPanel() {
        const panel = document.getElementById('authPanel');
        if (panel) panel.classList.add('show-auth');
    }

    function renderLoginAccountSwitcher() {
        if (window.top !== window.self) return;
        const panel = document.getElementById('authPanel');
        if (!panel) return;
        showAuthPanel();
        const accounts = getAuthAccounts();
        let switcher = document.getElementById('saved-account-switcher');
        const normalForms = panel.querySelectorAll('.login-container, .register-container, .forgot-container');
        // FIX-ACCOUNT-SWITCH-UI-NOT-SHOWING: the older single-account
        // "Quick Login" card lives in the same panel and was never hidden
        // when a saved-account switcher had accounts to show, so on a
        // device with a saved session the quick-login card rendered on top
        // of (or instead of, depending on layout) this switcher and the
        // multi-account picker was never actually seen.
        const quickLoginCard = document.getElementById('quickLoginCard');

        if (accounts.length === 0) {
            normalForms.forEach(el => { el.style.display = ''; });
            if (switcher) switcher.remove();
            return;
        }

        normalForms.forEach(el => { el.style.display = 'none'; });
        if (quickLoginCard) quickLoginCard.classList.remove('visible');
        if (!switcher) {
            switcher = document.createElement('div');
            switcher.id = 'saved-account-switcher';
            switcher.className = 'auth-form';
            switcher.style.cssText = 'display:block;width:100%;';
            const content = panel.querySelector('.auth-content') || panel.querySelector('.auth-panel-content') || panel;
            content.prepend(switcher);
        }

        switcher.innerHTML = `
            <div style="text-align:center;margin-bottom:22px;">
                <div style="font-size:22px;font-weight:700;margin-bottom:6px;">Choose an account</div>
                <div style="font-size:13px;color:var(--text-secondary,#777);">This device can keep up to ${MAX_ACCOUNTS} accounts.</div>
            </div>
            <div style="display:grid;gap:12px;">
                ${accounts.map(acc => `
                    <button type="button" class="saved-account-login-item" data-user-id="${String(acc.userId).replace(/"/g, '&quot;')}"
                        style="display:flex;align-items:center;width:100%;padding:14px;border:1px solid var(--border-color,#ddd);border-radius:12px;background:var(--card-bg,#fff);color:inherit;cursor:pointer;text-align:left;">
                        <span style="width:44px;height:44px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--primary-color,#667eea);color:#fff;font-weight:700;margin-right:12px;">
                            ${acc.avatar ? `<img src="${String(acc.avatar).replace(/"/g, '&quot;')}" alt="" style="width:100%;height:100%;object-fit:cover;">` : String(acc.displayName || acc.username || acc.email || 'A').charAt(0).toUpperCase()}
                        </span>
                        <span style="flex:1;min-width:0;"><strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${String(acc.displayName || acc.username || acc.email || 'Account')}</strong><small style="display:block;color:var(--text-secondary,#777);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${String(acc.email || acc.username || '')}</small></span>
                        <i class="fas fa-chevron-right" style="margin-left:8px;"></i>
                    </button>
                `).join('')}
            </div>
            <div style="text-align:center;margin-top:18px;font-size:12px;color:var(--text-secondary,#777);">Remove a saved account in Settings to make room for another account.</div>
        `;
        switcher.querySelectorAll('.saved-account-login-item').forEach(button => button.addEventListener('click', () => switchSavedAccount(button.dataset.userId)));
    }

    window.AccountLimit = { canRegisterNewAccount, registerDeviceAccount, removeDeviceAccount, getDeviceAccounts, saveDeviceAccounts, switchSavedAccount, renderLoginAccountSwitcher, MAX_ACCOUNTS };

    function bootLoginSwitcher() {
        if (window.top !== window.self) return;
        renderLoginAccountSwitcher();
        window.addEventListener('storage', event => { if (event.key === AUTH_STORAGE_KEY || event.key === STORAGE_KEY) renderLoginAccountSwitcher(); });
        window.addEventListener('auth:saved-account:removed', renderLoginAccountSwitcher);
        window.addEventListener('auth:account:switched', () => setTimeout(renderLoginAccountSwitcher, 0));
        window.addEventListener('auth-login-success', () => setTimeout(renderLoginAccountSwitcher, 0));
        window.addEventListener('auth-register-success', () => setTimeout(renderLoginAccountSwitcher, 0));
        window.addEventListener('auth:account-limit-reached', () => {
            // The authentication request may already have succeeded server-side,
            // but a third distinct account is never admitted as a device session.
            try { window.AuthStorage?.clearAuth?.(); } catch (_) {}
            try { alert(`This device already has ${MAX_ACCOUNTS} saved accounts. Remove one in Settings before logging in with another account.`); } catch (_) {}
            try { window.location.replace('/index.html?accountLimit=1'); } catch (_) { window.location.href = '/index.html?accountLimit=1'; }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLoginSwitcher, { once: true });
    else bootLoginSwitcher();
})();