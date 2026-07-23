// js/google-auth.js — "Sign in with Google" for MoodChat
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

    const GOOGLE_CLIENT_ID = '605397126514-6r3nebks3h6acb0dtre97e784rpg2750.apps.googleusercontent.com';

    function getApiOrigin() {
        if (typeof window.__getApiOrigin === 'function') return window.__getApiOrigin();
        return window.location.hostname === 'localhost' ? 'http://localhost:4000' : 'https://moodchat-fy56.onrender.com';
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
                    localStorage.setItem('moodchat_token', token);
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

    function renderButtons() {
        if (!window.google || !window.google.accounts || !window.google.accounts.id) return;

        window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleCredentialResponse,
            auto_select: false
        });

        const containers = [
            document.getElementById('googleSignInLoginContainer'),
            document.getElementById('googleSignInRegisterContainer')
        ].filter(Boolean);

        containers.forEach((container) => {
            window.google.accounts.id.renderButton(container, {
                theme: 'outline',
                size: 'large',
                width: 280,
                text: 'continue_with',
                shape: 'pill'
            });
        });
    }

    function init() {
        // The GIS script (accounts.google.com/gsi/client) is loaded via a
        // <script> tag in index.html; poll briefly in case this file executes
        // first.
        if (window.google && window.google.accounts && window.google.accounts.id) {
            renderButtons();
            return;
        }
        const interval = setInterval(() => {
            if (window.google && window.google.accounts && window.google.accounts.id) {
                clearInterval(interval);
                renderButtons();
            }
        }, 200);
        setTimeout(() => clearInterval(interval), 15000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
