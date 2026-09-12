// js/google-auth.js — Google Identity Services login for Nexipa
(function () {
    'use strict';

    const GOOGLE_CLIENT_ID = String(window.GOOGLE_CLIENT_ID || '').trim();

    function getApiOrigin() {
        if (typeof window.__getApiOrigin !== 'function') {
            throw new Error('Frontend runtime configuration is not loaded.');
        }
        return window.__getApiOrigin();
    }

    function showError(message) {
        console.error('[GoogleAuth]', message);
        const el = document.getElementById('loginPasswordError') || document.getElementById('loginIdentifierError');
        if (el) {
            const text = el.querySelector('span');
            if (text) text.textContent = message;
            el.style.display = 'flex';
        } else alert(message);
    }

    function normalizeUser(raw) {
        const user = Object.assign({}, raw || {});
        const firstName = user.firstName || user.givenName || '';
        const lastName = user.lastName || user.familyName || '';
        const displayName = String(user.displayName || user.name || [firstName, lastName].filter(Boolean).join(' ') || user.username || user.email || 'User').trim();
        user.firstName = firstName || null;
        user.lastName = lastName || null;
        user.displayName = displayName;
        user.name = user.name || displayName;
        user.fullName = user.fullName || displayName;
        user.username = user.username || displayName;
        return user;
    }

    async function handleCredentialResponse(response) {
        const credential = response && response.credential;
        if (!credential) return showError('Google sign-in did not return a credential. Please try again.');
        try {
            const res = await fetch(`${getApiOrigin()}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) return showError(data.message || 'Google sign-in failed. Please try again.');

            const token = data.token || data.accessToken;
            const refreshToken = data.refreshToken || null;
            const user = normalizeUser(data.user);
            const now = Date.now();
            const expiresAt = Object.prototype.hasOwnProperty.call(data, 'expiresAt')
                ? data.expiresAt
                : now + ((data.expiresIn || 24 * 60 * 60) * 1000);

            if (!token || !user.id) return showError('Google sign-in returned an incomplete account. Please try again.');

            if (window.AccountLimit) {
                const result = window.AccountLimit.registerDeviceAccount(user.id, user.email, user.username || user.displayName);
                if (!result.success) return showError(result.error || 'This device already has two saved accounts.');
            }

            if (window.AuthStorage && typeof window.AuthStorage.saveAuth === 'function') {
                const saved = window.AuthStorage.saveAuth({ token, refreshToken, user, expiresAt, issuedAt: now });
                if (!saved) return showError('This device already has two saved accounts. Remove one saved account before adding another.');
            } else {
                localStorage.setItem('token', token);
                localStorage.setItem('accessToken', token);
                localStorage.setItem('authToken', token);
                localStorage.setItem('nexopa_token', token);
                localStorage.setItem('USER_TOKEN', token);
                localStorage.setItem('currentUser', JSON.stringify(user));
                localStorage.setItem('user', JSON.stringify(user));
                localStorage.setItem('kynecta_auth', JSON.stringify({ token, refreshToken, user, expiresAt, issuedAt: now }));
                localStorage.setItem('isLoggedIn', 'true');
            }

            try { sessionStorage.setItem('kyn_e2e_pw_session', user.e2eWrapSecret || ''); } catch (_) {}
            window.currentUser = user;
            window.__userToken = token;
            window.__accessToken = token;
            window.dispatchEvent(new CustomEvent('auth-login-success', { detail: { token, refreshToken, user, expiresAt } }));
            window.location.href = 'chat.html';
        } catch (err) {
            showError('Could not reach the server. Please check your connection and try again.');
            console.error('[GoogleAuth] Request failed:', err);
        }
    }

    let initialized = false;
    const rendered = new WeakSet();
    const lastWidths = new WeakMap();

    function isVisible(el) {
        return !!el && el.offsetParent !== null && el.offsetWidth > 0;
    }

    function renderInto(container) {
        if (!container || !isVisible(container) || rendered.has(container)) return;
        container.innerHTML = '';
        const width = Math.max(200, Math.min(320, container.clientWidth || 280));
        try {
            window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', width, text: 'continue_with', shape: 'pill' });
            rendered.add(container);
            lastWidths.set(container, width);
        } catch (e) {
            console.warn('[GoogleAuth] renderButton failed:', e.message);
        }
    }

    function renderButtons() {
        if (!window.google?.accounts?.id) return;
        if (!GOOGLE_CLIENT_ID) {
            console.error('[GoogleAuth] GOOGLE_CLIENT_ID is missing from frontend .env.');
            return;
        }
        if (!initialized) {
            window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredentialResponse, auto_select: false });
            initialized = true;
        }
        [document.getElementById('googleSignInLoginContainer'), document.getElementById('googleSignInRegisterContainer')]
            .filter(Boolean).forEach(renderInto);
    }

    function reRenderVisible(force) {
        [document.getElementById('googleSignInLoginContainer'), document.getElementById('googleSignInRegisterContainer')]
            .filter(Boolean).forEach(container => {
                if (!isVisible(container)) return;
                const width = Math.max(200, Math.min(320, container.clientWidth || 280));
                if (!force && rendered.has(container) && lastWidths.get(container) === width) return;
                rendered.delete(container);
                renderInto(container);
            });
    }

    function showFallback(container) {
        if (!container || rendered.has(container)) return;
        container.innerHTML = '<div style="font-size:13px;color:rgba(255,255,255,0.6);text-align:center;padding:8px 0;">Google sign-in is unavailable right now — please use email/password instead.</div>';
    }

    function init() {
        const tryRender = () => {
            if (!window.google?.accounts?.id) return false;
            renderButtons();
            return true;
        };
        if (!tryRender()) {
            const interval = setInterval(() => { if (tryRender()) clearInterval(interval); }, 200);
            setTimeout(() => {
                clearInterval(interval);
                if (!window.google?.accounts?.id) {
                    showFallback(document.getElementById('googleSignInLoginContainer'));
                    showFallback(document.getElementById('googleSignInRegisterContainer'));
                }
            }, 15000);
        }
        window.addEventListener('auth-form-switched', () => reRenderVisible(true));
        let resizeTimer;
        const schedule = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => reRenderVisible(false), 250); };
        window.addEventListener('resize', schedule);
        window.addEventListener('orientationchange', () => setTimeout(() => reRenderVisible(false), 300));

        if (typeof ResizeObserver === 'function') {
            const ro = new ResizeObserver(entries => {
                let changed = false;
                entries.forEach(entry => {
                    const el = entry.target;
                    const width = Math.round(entry.contentRect.width);
                    if (width > 0 && lastWidths.get(el) !== width) {
                        changed = true;
                        lastWidths.set(el, width);
                        rendered.delete(el);
                    }
                });
                if (changed) schedule();
            });
            [document.getElementById('googleSignInLoginContainer'), document.getElementById('googleSignInRegisterContainer')]
                .filter(Boolean).forEach(el => ro.observe(el));
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
