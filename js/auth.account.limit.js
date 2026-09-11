// js/auth.account.limit.js - Persistent two-account device login/switch UI
(function () {
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
            const accounts = window.AuthStorage?.getSavedAccounts?.();
            if (Array.isArray(accounts)) return accounts.slice(0, MAX_ACCOUNTS);
        } catch (_) {}
        return parse(localStorage.getItem(AUTH_STORAGE_KEY), []).slice(0, MAX_ACCOUNTS);
    }

    function getDeviceAccounts() {
        const accounts = getAuthAccounts().map(acc => ({
            userId: acc.userId,
            email: acc.email || null,
            username: acc.username || null,
            displayName: acc.displayName || acc.name || acc.username || acc.email || `Account ${acc.userId}`,
            avatar: acc.avatar || null,
            lastUsed: acc.lastUsed || 0,
            deleted: false,
            expired: false
        }));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts)); } catch (_) {}
        return accounts;
    }

    function saveDeviceAccounts(accounts) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify((accounts || []).slice(0, MAX_ACCOUNTS))); return true; }
        catch (_) { return false; }
    }

    function canRegisterNewAccount() { return getAuthAccounts().length < MAX_ACCOUNTS; }

    function registerDeviceAccount(userId, email) {
        const accounts = getAuthAccounts();
        const existing = accounts.find(acc => String(acc?.userId ?? '') === String(userId ?? '') || (email && acc?.email === email));
        if (existing) return { success: true, existing: true };
        if (accounts.length >= MAX_ACCOUNTS) return { success: false, error: `Maximum ${MAX_ACCOUNTS} accounts per device. Remove an existing saved account before adding another account.` };
        return { success: true, existing: false };
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
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next.slice(0, MAX_ACCOUNTS)));
        } catch (_) {}
        try {
            const accounts = parse(localStorage.getItem(STORAGE_KEY), []);
            const next = accounts.filter(acc => String(acc?.userId) !== String(userId));
            if (next.length !== accounts.length) removed = true;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_ACCOUNTS)));
        } catch (_) {}
        if (removed) {
            try { window.dispatchEvent(new CustomEvent('auth:saved-account:removed', { detail: { userId } })); } catch (_) {}
        }
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

    function escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
    }

    function hideUnsupportedInstallHint() {
        document.querySelectorAll('#landingPwaHint,#authPwaHint').forEach(el => {
            if (/doesn.?t support installation/i.test(el.textContent || '')) el.hidden = true;
        });
    }

    function renderLoginAccountSwitcher() {
        if (window.top !== window.self) return;
        const panel = document.getElementById('authPanel');
        if (!panel) return;
        const content = panel.querySelector('.auth-content') || panel.querySelector('.auth-panel-content') || panel;
        if (!content) return;

        hideUnsupportedInstallHint();

        const accounts = getAuthAccounts();
        let switcher = document.getElementById('saved-account-switcher');
        if (!accounts.length) {
            if (switcher) switcher.remove();
            return;
        }

        if (!switcher) {
            switcher = document.createElement('section');
            switcher.id = 'saved-account-switcher';
            switcher.setAttribute('aria-label', 'Saved accounts');
            content.prepend(switcher);
        }

        switcher.style.cssText = 'display:block;width:100%;margin:0 0 18px;';
        switcher.innerHTML = `
            <div style="text-align:center;margin-bottom:12px;">
                <div style="font-size:20px;font-weight:700;">Switch account</div>
                <div style="font-size:12px;color:var(--text-secondary,#777);margin-top:4px;">${accounts.length} of ${MAX_ACCOUNTS} device accounts saved</div>
            </div>
            <div style="display:grid;gap:8px;">
                ${accounts.map(acc => {
                    const name = escape(acc.displayName || acc.name || acc.username || acc.email || 'Account');
                    const email = escape(acc.email || acc.username || '');
                    const id = escape(acc.userId);
                    const avatar = acc.avatar ? `<img src="${escape(acc.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : escape(name.charAt(0).toUpperCase());
                    return `<button type="button" class="saved-account-login-item" data-user-id="${id}" style="display:flex;align-items:center;width:100%;padding:11px;border:1px solid var(--border-color,#ddd);border-radius:12px;background:var(--card-bg,#fff);color:inherit;cursor:pointer;text-align:left;">
                        <span style="width:42px;height:42px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--primary-color,#667eea);color:#fff;font-weight:700;margin-right:10px;">${avatar}</span>
                        <span style="flex:1;min-width:0;"><strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</strong><small style="display:block;color:var(--text-secondary,#777);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${email}</small></span>
                        <span aria-hidden="true">›</span>
                    </button>`;
                }).join('')}
            </div>
            <div style="text-align:center;margin-top:10px;font-size:11px;color:var(--text-secondary,#777);">Use the normal login form below to add another account (maximum ${MAX_ACCOUNTS}).</div>
        `;
        switcher.querySelectorAll('.saved-account-login-item').forEach(button => {
            button.addEventListener('click', () => {
                button.disabled = true;
                const result = switchSavedAccount(button.dataset.userId);
                if (!result?.success) button.disabled = false;
                if (!result?.success) alert(result?.error || 'Could not switch account.');
            });
        });
    }

    window.AccountLimit = {
        canRegisterNewAccount,
        registerDeviceAccount,
        removeDeviceAccount,
        getDeviceAccounts,
        saveDeviceAccounts,
        switchSavedAccount,
        renderLoginAccountSwitcher,
        MAX_ACCOUNTS
    };

    function bootLoginSwitcher() {
        if (window.top !== window.self) return;
        renderLoginAccountSwitcher();
        window.addEventListener('storage', event => {
            if (event.key === AUTH_STORAGE_KEY || event.key === STORAGE_KEY) renderLoginAccountSwitcher();
        });
        ['auth:saved-account:removed', 'auth:account:switched', 'auth-login-success', 'auth-register-success', 'auth:logged-out'].forEach(type => {
            window.addEventListener(type, () => setTimeout(renderLoginAccountSwitcher, 0));
        });
        window.addEventListener('auth:account-limit-reached', () => {
            try { window.AuthStorage?.clearAuth?.(); } catch (_) {}
            renderLoginAccountSwitcher();
            try { alert(`This device already has ${MAX_ACCOUNTS} saved accounts. Remove one in Settings before logging in with another account.`); } catch (_) {}
        });

        // The old index.html install code writes this hint several seconds after
        // boot. Keep it off-screen without changing the login layout or adding
        // another patch file.
        const observer = new MutationObserver(hideUnsupportedInstallHint);
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
        setTimeout(hideUnsupportedInstallHint, 0);
        setTimeout(hideUnsupportedInstallHint, 5000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLoginSwitcher, { once: true });
    else bootLoginSwitcher();
})();