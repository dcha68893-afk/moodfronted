// js/google-auth.js — "Sign in with Google" for Nexopa
// Loads Google Identity Services, renders the button in any container found
// on the page, and on success posts the credential to the backend, which
// verifies it and returns the same token/user shape as normal login.
//
// Backend endpoint: POST /api/auth/google  { credential }
// GOOGLE_CLIENT_ID below is NOT a secret — Google Client IDs are meant to be
// public and are always visible in a site's frontend code. The Client Secret
// stays server-side only (Render env vars) and is never used here.

(function () {
    'use strict';

    const GOOGLE_CLIENT_ID = '523213927690-volo0p7mbbqjucrksv8vasfvcqqicall.apps.googleusercontent.com';

    function getApiOrigin() {
        if (typeof window.__getApiOrigin === 'function') return window.__getApiOrigin();
        return window.location.hostname === 'localhost' ? 'http://localhost:4000' : 'https://noxopa.onrender.com';
    }

    function showError(message) {
        console.error('[GoogleAuth]', message);
        // Reuse whatever generic error surface the login form already has, if present.
        const el = document.getElementById('loginPasswordError') || document.getElementById('loginIdentifierError');
        if (el) {
            const textEl = el.querySelector('span');
            if (textEl) textEl.textContent = message;
            el.style.display = 'flex';
        } else {
            alert(message);
        }
    }

    async function handleCredentialResponse(response) {
        const credential = response && response.credential;
        if (!credential) {
            showError('Google sign-in did not return a credential. Please try again.');
            return;
        }

        try {
            const apiBase = `${getApiOrigin()}/api`;
            const res = await fetch(`${apiBase}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential })
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                showError(data.message || 'Google sign-in failed. Please try again.');
                return;
            }

            const token = data.token || data.accessToken;
            const user = data.user || null;
            const refreshToken = data.refreshToken || null;
            const now = Date.now();
            const expiresAt = now + ((data.expiresIn || 24 * 60 * 60) * 1000);

            // FIX (TWO-ACCOUNTS-PER-DEVICE): Google sign-in was the third real
            // login entry point that never touched window.AccountLimit at all
            // (only the unused AuthGateway wrapper did). Check/register here,
            // before persisting the session, same as password login. Already-
            // known accounts on this device always pass; only a genuine 3rd
            // distinct account gets refused.
            if (user && window.AccountLimit) {
                const userId = user.id || user._id || user.userId;
                const limitResult = window.AccountLimit.registerDeviceAccount(userId, user.email, user.username || user.displayName);
                if (!limitResult.success) {
                    showError(limitResult.error || `Maximum ${window.AccountLimit.MAX_ACCOUNTS} accounts per device. Please use another device or remove an existing account.`);
                    return;
                }
            }

            // Persist exactly the way the rest of the app expects (all legacy
            // localStorage keys + kynecta_auth) via the shared AuthStorage helper.
            if (window.AuthStorage && typeof window.AuthStorage.saveAuth === 'function') {
                window.AuthStorage.saveAuth({ token, refreshToken, user, expiresAt, issuedAt: now });
            } else {
                // Fallback if AuthStorage hasn't loaded for some reason
                try {
                    localStorage.setItem('token', token);
                    localStorage.setItem('accessToken', token);
                    localStorage.setItem('authToken', token);
                    localStorage.setItem('nexopa_token', token);
                    localStorage.setItem('USER_TOKEN', token);
                    localStorage.setItem('currentUser', JSON.stringify(user));
                    localStorage.setItem('user', JSON.stringify(user));
                    localStorage.setItem('kynecta_auth', JSON.stringify({
                        token, refreshToken, user, expiresAt, issuedAt: now
                    }));
                    localStorage.setItem('isLoggedIn', 'true');
                } catch (e) {
                    console.warn('[GoogleAuth] Fallback storage failed:', e.message);
                }
            }

            // Let the rest of the app (socket init, session manager, etc.) know
            // login succeeded, the same way password login does.
            window.dispatchEvent(new CustomEvent('auth-login-success', {
                detail: { token, refreshToken, user, expiresAt }
            }));

            window.location.href = 'chat.html';
        } catch (err) {
            showError('Could not reach the server. Please check your connection and try again.');
            console.error('[GoogleAuth] Request failed:', err);
        }
    }

    let _initialized = false;
    // Track which containers we've already successfully rendered a button
    // into, so switching tabs back and forth doesn't stack duplicate buttons.
    const _rendered = new WeakSet();

    // FIX (GOOGLE-BUTTON-NOT-DISPLAYING): the register tab's container
    // (#googleSignInRegisterContainer) lives inside .register-container,
    // which is `display:none` until the user switches tabs. Google Identity
    // Services measures the container's box at the moment renderButton() is
    // called and never re-measures later — so calling renderButton() once at
    // page load (when the register tab is still hidden) silently produced a
    // broken/invisible button that never self-corrected once the tab became
    // visible. It also always requested a fixed width:280, which could clip
    // on narrow phones.
    //
    // Fix: only render into containers that are ACTUALLY VISIBLE right now;
    // re-run rendering whenever a tab switch or viewport resize could have
    // changed which container is visible or how wide it is; size the button
    // to the container's real width; and show a visible fallback message if
    // Google's script never loads instead of leaving a blank space.
    function isVisible(el) {
        // offsetParent is null for display:none elements (and their
        // descendants) but not for visibility:hidden, which is what we want
        // here since ancestors use display:none to hide inactive tabs.
        return !!el && el.offsetParent !== null && el.offsetWidth > 0;
    }

    function renderInto(container) {
        if (!container || !isVisible(container) || _rendered.has(container)) return;
        container.innerHTML = ''; // clear any stale fallback message
        const width = Math.max(200, Math.min(320, container.offsetWidth || 280));
        try {
            window.google.accounts.id.renderButton(container, {
                theme: 'outline',
                size: 'large',
                width,
                text: 'continue_with',
                shape: 'pill'
            });
            _rendered.add(container);
        } catch (e) {
            console.warn('[GoogleAuth] renderButton failed:', e.message);
        }
    }

    function renderButtons() {
        if (!window.google || !window.google.accounts || !window.google.accounts.id) return;

        if (!_initialized) {
            window.google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleCredentialResponse,
                auto_select: false
            });
            _initialized = true;
        }

        [
            document.getElementById('googleSignInLoginContainer'),
            document.getElementById('googleSignInRegisterContainer')
        ].filter(Boolean).forEach(renderInto);
    }

    function showFallback(container) {
        if (!container || _rendered.has(container)) return;
        container.innerHTML = '<div style="font-size:13px;color:rgba(255,255,255,0.6);text-align:center;padding:8px 0;">Google sign-in is unavailable right now — please use email/password instead.</div>';
    }

    function reRenderVisible() {
        [
            document.getElementById('googleSignInLoginContainer'),
            document.getElementById('googleSignInRegisterContainer')
        ].filter(Boolean).forEach((container) => {
            if (isVisible(container)) {
                _rendered.delete(container);
                renderInto(container);
            }
        });
    }

    function init() {
        // The GIS script (accounts.google.com/gsi/client) is loaded via a
        // <script> tag in index.html; poll briefly in case this file executes
        // first.
        const tryRender = () => {
            if (window.google && window.google.accounts && window.google.accounts.id) {
                renderButtons();
                return true;
            }
            return false;
        };

        if (!tryRender()) {
            const interval = setInterval(() => {
                if (tryRender()) clearInterval(interval);
            }, 200);
            setTimeout(() => {
                clearInterval(interval);
                if (!window.google || !window.google.accounts || !window.google.accounts.id) {
                    // Google's script never loaded (blocked, offline, etc.) —
                    // show a visible message instead of a permanently blank box.
                    showFallback(document.getElementById('googleSignInLoginContainer'));
                    showFallback(document.getElementById('googleSignInRegisterContainer'));
                }
            }, 15000);
        }

        // Re-render whenever a tab switch could reveal a previously-hidden
        // container (index.html's switchForm() dispatches this — see fix
        // there). Cheap no-op via isVisible()/_rendered guard if nothing
        // actually changed.
        window.addEventListener('auth-form-switched', reRenderVisible);

        // Re-render on resize/orientation change so the button width tracks
        // the container instead of staying clipped/oversized. Google doesn't
        // support resizing an already-rendered button in place, so re-render
        // from scratch for any visible container.
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(reRenderVisible, 250);
        });
        window.addEventListener('orientationchange', () => {
            setTimeout(reRenderVisible, 300);
        });

        // FIX (GOOGLE-BUTTON-RENDER-ROBUSTNESS): the tab-switch/resize/
        // orientation listeners above cover the known ways a container's
        // visibility or width can change, but any other path (a CSS
        // transition finishing, a parent panel animating open, a layout
        // shift from late-loading content) would leave a stale/blank button
        // with nothing to trigger a re-render. A ResizeObserver on each
        // container catches box-size changes from any cause, so this acts as
        // a final safety net on top of the explicit listeners.
        if (typeof ResizeObserver === 'function') {
            const ro = new ResizeObserver(() => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(reRenderVisible, 250);
            });
            [
                document.getElementById('googleSignInLoginContainer'),
                document.getElementById('googleSignInRegisterContainer')
            ].filter(Boolean).forEach((el) => ro.observe(el));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
