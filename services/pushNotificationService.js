// services/pushNotificationService.js
// P1 FIX: FCM push notifications — request permission + register token with backend
// Loaded after firebase-app.js and firebase-messaging.js (CDN)
'use strict';

const PushNotificationService = (() => {
    // Firebase config from env or window globals set in index.html / group.html
    const _getFirebaseConfig = () => ({
        apiKey:            window.FIREBASE_API_KEY            || window.__ENV?.FIREBASE_API_KEY,
        authDomain:        window.FIREBASE_AUTH_DOMAIN        || window.__ENV?.FIREBASE_AUTH_DOMAIN,
        projectId:         window.FIREBASE_PROJECT_ID         || window.__ENV?.FIREBASE_PROJECT_ID,
        storageBucket:     window.FIREBASE_STORAGE_BUCKET     || window.__ENV?.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID|| window.__ENV?.FIREBASE_MESSAGING_SENDER_ID,
        appId:             window.FIREBASE_APP_ID             || window.__ENV?.FIREBASE_APP_ID,
    });

    const VAPID_KEY = window.FIREBASE_VAPID_KEY || window.__ENV?.FIREBASE_VAPID_KEY;
    const API_BASE  = window.API_BASE_URL || '';
    const STORAGE_KEY = 'moodchat_fcm_token';

    let _messaging = null;
    let _initialized = false;

    async function _getAuthToken() {
        try {
            // Try sessionClient first, then localStorage
            const sc = window.sessionClient || window.SessionClient;
            if (sc?.getToken) return sc.getToken();
            return localStorage.getItem('authToken') || localStorage.getItem('token') || sessionStorage.getItem('authToken');
        } catch (_) { return null; }
    }

    async function _registerTokenWithBackend(token) {
        try {
            const authToken = await _getAuthToken();
            if (!authToken) return false;
            const res = await fetch(`${API_BASE}/api/auth/fcm-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({ token }),
            });
            return res.ok;
        } catch (_) { return false; }
    }

    async function _deregisterTokenFromBackend() {
        try {
            const authToken = await _getAuthToken();
            if (!authToken) return;
            await fetch(`${API_BASE}/api/auth/fcm-token`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${authToken}` },
            });
        } catch (_) {}
    }

    async function init() {
        if (_initialized) return;
        if (!('Notification' in window)) return; // Browser doesn't support notifications
        if (!('serviceWorker' in navigator)) return;

        try {
            // Check if Firebase is loaded
            if (typeof firebase === 'undefined' && typeof initializeApp === 'undefined') {
                console.log('[Push] Firebase SDK not loaded — skipping push init');
                return;
            }

            const cfg = _getFirebaseConfig();
            if (!cfg.projectId || !VAPID_KEY) {
                console.log('[Push] Firebase config incomplete — skipping push init');
                return;
            }

            // Initialize Firebase app (avoid duplicate)
            let app;
            try {
                if (typeof firebase !== 'undefined') {
                    if (!firebase.apps?.length) app = firebase.initializeApp(cfg);
                    else app = firebase.apps[0];
                    _messaging = firebase.messaging(app);
                } else if (typeof initializeApp !== 'undefined') {
                    // Modular SDK
                    const { initializeApp: initApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
                    const { getMessaging, getToken, onMessage } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js');
                    app = initApp(cfg);
                    _messaging = getMessaging(app);

                    // Register token with modular SDK
                    const sw = await navigator.serviceWorker.ready;
                    const token = await getToken(_messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: sw });
                    if (token) {
                        const cached = localStorage.getItem(STORAGE_KEY);
                        if (cached !== token) {
                            await _registerTokenWithBackend(token);
                            localStorage.setItem(STORAGE_KEY, token);
                        }
                    }

                    // Handle foreground messages
                    onMessage(_messaging, (payload) => _handleForegroundMessage(payload));
                    _initialized = true;
                    return;
                }
            } catch (initErr) {
                console.warn('[Push] Firebase init error:', initErr.message);
                return;
            }

            if (!_messaging) return;

            // Register SW for Firebase messaging
            const sw = await navigator.serviceWorker.ready;
            _messaging.useServiceWorker(sw);

            // Get token
            const token = await _messaging.getToken({ vapidKey: VAPID_KEY });
            if (token) {
                const cached = localStorage.getItem(STORAGE_KEY);
                if (cached !== token) {
                    await _registerTokenWithBackend(token);
                    localStorage.setItem(STORAGE_KEY, token);
                }
            }

            // Handle foreground messages (app is in focus)
            _messaging.onMessage((payload) => _handleForegroundMessage(payload));

            // Token refresh
            _messaging.onTokenRefresh(async () => {
                try {
                    const newToken = await _messaging.getToken({ vapidKey: VAPID_KEY });
                    if (newToken) {
                        await _registerTokenWithBackend(newToken);
                        localStorage.setItem(STORAGE_KEY, newToken);
                    }
                } catch (_) {}
            });

            _initialized = true;
            console.log('[Push] ✅ FCM push notifications initialized');
        } catch (e) {
            console.warn('[Push] Init failed (non-fatal):', e.message);
        }
    }

    function _handleForegroundMessage(payload) {
        const { notification, data } = payload;
        if (!notification) return;

        // Show in-app toast instead of system notification when app is in focus
        const title = notification.title || 'MoodChat';
        const body  = notification.body  || '';

        if (typeof window.showToast === 'function') {
            window.showToast(`${title}: ${body}`, 'info', 5000);
        } else {
            // Fallback: browser notification
            if (Notification.permission === 'granted') {
                new Notification(title, { body, icon: '/icons/icon-192.png' });
            }
        }

        // Dispatch kyn event so group-core can update unread counts
        if (data?.type === 'group_message' && data?.groupId) {
            window.dispatchEvent(new CustomEvent('kyn:push:group_message', { detail: { groupId: data.groupId, messageId: data.messageId } }));
        }
    }

    async function requestPermission() {
        if (!('Notification' in window)) return 'unsupported';
        if (Notification.permission === 'granted') {
            await init();
            return 'granted';
        }
        if (Notification.permission === 'denied') return 'denied';

        const perm = await Notification.requestPermission();
        if (perm === 'granted') await init();
        return perm;
    }

    async function deregister() {
        localStorage.removeItem(STORAGE_KEY);
        await _deregisterTokenFromBackend();
        _initialized = false;
    }

    return { init, requestPermission, deregister };
})();

window.PushNotificationService = PushNotificationService;

// Auto-init when user is already logged in
document.addEventListener('DOMContentLoaded', () => {
    // Defer to avoid blocking page load
    setTimeout(async () => {
        try {
            const authToken = localStorage.getItem('authToken') || localStorage.getItem('token');
            if (authToken && Notification.permission === 'granted') {
                await PushNotificationService.init();
            }
        } catch (_) {}
    }, 3000);
});
