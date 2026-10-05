package com.necpa;

import android.util.Log;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Receives every FCM push, in every app state (closed, background, foreground).
 *
 * Chat messages and (closed/background) status updates are turned into native notifications here. Everything else
 * (friend requests, etc.) is handed to the Capacitor PushNotifications plugin exactly
 * as its own MessagingService would have, so the existing JS listeners keep working.
 *
 * This service replaces Capacitor's MessagingService (removed in the manifest with tools:node="remove").
 */
public class NecpraMessagingService extends FirebaseMessagingService {
    private static final String TAG = "NecpraFCM";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        super.onMessageReceived(message);
        Map<String, String> data = message.getData();

        if (NecpraNotifier.isChatMessage(data)) {
            String fbTitle = null, fbBody = null;
            RemoteMessage.Notification n = message.getNotification();
            if (n != null) { fbTitle = n.getTitle(); fbBody = n.getBody(); }
            try {
                NecpraNotifier.showChatMessage(getApplicationContext(), data, message.getSentTime(), fbTitle, fbBody);
            } catch (Throwable t) {
                Log.e(TAG, "rich notification failed, using fallback", t);
                NecpraNotifier.showFallback(getApplicationContext(),
                        data.get("title") != null ? data.get("title") : fbTitle,
                        data.get("body") != null ? data.get("body") : fbBody);
            }
            return;
        }

        // Status pushes arrive data-only on v3+ APKs. Foreground: let the web layer show its in-app banner (as before);
        // closed / background: draw the notification natively so a tap opens the native Status screen.
        if (NecpraNotifier.isStatusPush(data) && !NecpraNotifier.appForeground) {
            String fbTitle = null, fbBody = null;
            RemoteMessage.Notification n = message.getNotification();
            if (n != null) { fbTitle = n.getTitle(); fbBody = n.getBody(); }
            try {
                NecpraNotifier.showStatus(getApplicationContext(), data, message.getSentTime(), fbTitle, fbBody);
            } catch (Throwable t) {
                Log.e(TAG, "status notification failed, using fallback", t);
                NecpraNotifier.showFallback(getApplicationContext(),
                        data.get("title") != null ? data.get("title") : fbTitle,
                        data.get("body") != null ? data.get("body") : fbBody);
            }
            return;
        }

        // Not a chat/status push: behave exactly like Capacitor's MessagingService.
        PushNotificationsPlugin.sendRemoteMessage(message);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }
}
