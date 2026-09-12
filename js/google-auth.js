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

    function isVisible(el) {
        return !!el && el.offsetParent !== null && el.offsetWidth > 0;
    }

    function getContainers() {
        return [
            document.getElementById('googleSignInLoginContainer'),
            document.getElementById('googleSignInRegisterContainer')
        ].filter(Boolean);
    }

    function renderInto(container) {
        if (!container) return;
        if (rendered.has(container)) return;
        if (!isVisible(container)) {
            // FIX (sizing audit): log the actual measured box so a real future
            // sizing regression is instantly diagnosable from the console instead
            // of requiring another round of manual CSS auditing.
            console.warn(
                '[GoogleAuth] Container', container.id, 'is not visible yet — offsetParent:',
                container.offsetParent, 'offsetWidth:', container.offsetWidth
            );
            return;
        }
        // Never clear a live Google-rendered iframe. Clearing/replacing it during
        // resize or form switches causes the visible blink/spark and can leave
        // the user with an empty container while GIS is rebuilding its iframe.
        const width = Math.max(200, Math.min(320, container.clientWidth || 280));
        try {
            window.google.accounts.id.renderButton(container, {
                theme: 'outline',
                size: 'large',
                width,
                text: 'continue_with',
                shape: 'pill'
            });
            rendered.add(container);
        } catch (e) {
            console.warn('[GoogleAuth] renderButton failed:', e.message);
        }
    }

    function renderButtons() {
        if (!window.google?.accounts?.id) return;
        if (!GOOGLE_CLIENT_ID) {
            // FIX (sizing audit follow-up): this is the #1 real-world cause of the
            // "Google button just doesn't appear" report — not CSS. If you see this
            // line in your browser console, the container is fine; the runtime
            // config simply never reached the browser with a client ID. Check:
            //   1. Network tab → GET /js/runtime-config.js → does the response body
            //      actually contain a non-empty GOOGLE_CLIENT_ID?
            //   2. If that file 404s or is empty, your host's env vars (Render
            //      dashboard, Netlify, etc.) are missing GOOGLE_CLIENT_ID — a
            //      committed .env file is not enough for most hosts in production.
            console.error(
                '[GoogleAuth] GOOGLE_CLIENT_ID is missing. window.GOOGLE_CLIENT_ID =',
                JSON.stringify(window.GOOGLE_CLIENT_ID),
                '— check Network tab for /js/runtime-config.js and your host\'s environment variables.'
            );
            return;
        }
        if (!initialized) {
            window.google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleCredentialResponse,
                auto_select: false
            });
            initialized = true;
        }
        getContainers().forEach(renderInto);
    }

    function renderVisibleContainersOnce() {
        if (!window.google?.accounts?.id || !GOOGLE_CLIENT_ID) return;
        renderButtons();
    }

    function showFallback(container) {
        if (!container || rendered.has(container) || container.dataset.googleFallbackShown === 'true') return;
        container.dataset.googleFallbackShown = 'true';
        container.innerHTML = '<div style="font-size:13px;color:rgba(255,255,255,0.6);text-align:center;padding:8px 0;">Google sign-in is unavailable right now — please use email/password instead.</div>';
    }

    function init() {
        const tryRender = () => {
            if (!window.google?.accounts?.id) return false;
            renderVisibleContainersOnce();
            return true;
        };

        if (!tryRender()) {
            const interval = setInterval(() => {
                if (tryRender()) clearInterval(interval);
            }, 200);
            setTimeout(() => {
                clearInterval(interval);
                if (!window.google?.accounts?.id) {
                    showFallback(document.getElementById('googleSignInLoginContainer'));
                    showFallback(document.getElementById('googleSignInRegisterContainer'));
                }
            }, 15000);
        }

        // The login/register forms are toggled with display:none. Render only
        // when a container first becomes visible. Do not force a re-render of an
        // already-live Google iframe when switching forms.
        window.addEventListener('auth-form-switched', () => {
            setTimeout(renderVisibleContainersOnce, 0);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
