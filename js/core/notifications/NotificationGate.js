/**
 * NotificationGate.js
 *
 * FIX (item #12, Notifications architecture): Settings > Notifications had a
 * reasonably developed schema (enableNotifications, messageNotifications,
 * groupNotifications, notificationSound, notificationVibration, doNotDisturb,
 * etc.) but no single place actually consumed it before showing a
 * notification. Concretely, three separate call sites called
 * `new Notification(...)` directly, each with its own (often wrong or
 * missing) gating:
 *
 *   - chat.html checked `_kynDesktopNotificationsAllowed()`, which reads a
 *     `notifications.desktopEnabled` field that has NO toggle anywhere in
 *     Settings UI — so turning off "Enable Notifications" or "Message
 *     Notifications" had zero effect on this notification; it fired
 *     regardless of what the person actually chose.
 *   - js/push-manager.js's foreground message preview had no settings check
 *     at all — any Notification permission was enough, ignoring every
 *     related toggle.
 *   - js/core/groups/SocialNotificationEngine.js checked
 *     `window.__messageNotificationsEnabled` for GROUP events — the wrong
 *     flag entirely (should be groupNotifications), so muting message
 *     notifications also silently muted every group notification, and
 *     muting only group notifications did nothing.
 *
 * This file is the "one notification gate" the architecture review called
 * for: every notification source asks window.__shouldNotify(kind) — or the
 * convenience window.__notify(kind, title, options) which checks the gate
 * and then shows the notification — instead of re-deriving its own answer.
 */
(function () {
  'use strict';

  if (window.__shouldNotify) return;

  // kind -> the settings.notifications key that gates it. Defaults to true
  // (shown) when the field has never been explicitly set to false, matching
  // every existing toggle's own "!== false" convention in this codebase.
  const KIND_KEYS = {
    message: 'messageNotifications',
    group: 'groupNotifications',
    call: 'callNotifications',
    friendRequest: 'friendRequestNotifications',
    status: 'statusNotifications',
  };

  function getNotificationSettings() {
    try {
      if (window.AppSettings && typeof window.AppSettings.get === 'function') {
        const n = window.AppSettings.get('notifications');
        if (n) return n;
      }
    } catch (_) {}
    // Fallback for pages/timings where AppSettings isn't ready yet — same
    // cache chat.html's own (now-replaced) check already relied on.
    try {
      const raw = localStorage.getItem('knecta_settings_cache');
      if (raw) {
        const n = JSON.parse(raw)?.data?.notifications;
        if (n) return n;
      }
    } catch (_) {}
    return null;
  }

  window.__shouldNotify = function (kind) {
    const n = getNotificationSettings();
    if (!n) return true; // settings not loaded yet — fail open, matches prior behavior

    if (n.enableNotifications === false) return false;
    if (n.doNotDisturb === true) return false;

    const key = KIND_KEYS[kind];
    if (key && n[key] === false) return false;

    return true;
  };

  // Convenience wrapper: gate + show, respecting sound/vibration/popup
  // preferences where the Notification API supports them.
  window.__notify = function (kind, title, options) {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
      if (!window.__shouldNotify(kind)) return null;

      const n = getNotificationSettings() || {};
      const opts = Object.assign({}, options);
      if (n.notificationSound === false) opts.silent = true;
      // Vibration is only honored by the browser for Notifications triggered
      // via a service worker (showNotification), not the page-context
      // Notification() constructor used here — intentionally not faked.

      return new Notification(title, opts);
    } catch (_) {
      return null;
    }
  };
})();
