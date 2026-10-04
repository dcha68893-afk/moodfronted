package com.necpa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

/** "Mark as read" button on a message notification. Runs with no UI. */
public class NecpraNotificationActionReceiver extends BroadcastReceiver {
    private static final String TAG = "NecpraNotifAction";

    @Override
    public void onReceive(final Context context, Intent intent) {
        if (intent == null || !NecpraNotifier.ACTION_MARK_READ.equals(intent.getAction())) return;
        final String kind = intent.getStringExtra(NecpraNotifier.EXTRA_KIND);
        final String id = intent.getStringExtra(NecpraNotifier.EXTRA_ID);
        if (kind == null || id == null) return;

        final String key = NecpraNotifier.key(kind, id);
        final JSONArray ids = NecpraNotifier.messageIds(context, key);
        // Dismiss right away so the button feels instant; the network call follows.
        NecpraNotifier.cancelConversation(context, key);

        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                // Read receipts off in Settings -> the server must count it read for us only.
                boolean silent = !NecpraNotifier.readReceipts(context);
                if ("g".equals(kind)) {
                    if (ids.length() == 0) return;
                    JSONObject body = new JSONObject().put("messageIds", ids);
                    int s = NecpraNotifier.authedPost(context, "/api/group-messages/" + id + "/read", body);
                    Log.d(TAG, "group read -> HTTP " + s);
                } else {
                    JSONObject body = new JSONObject().put("silent", silent);
                    if (id.matches("^[0-9]+$")) body.put("chatId", Long.parseLong(id));
                    else if (ids.length() > 0) body.put("messageIds", ids);
                    else return;
                    int s = NecpraNotifier.authedPost(context, "/api/messages/read", body);
                    Log.d(TAG, "chat read -> HTTP " + s);
                }
            } catch (Throwable t) {
                Log.w(TAG, "mark read failed", t);
            } finally {
                pending.finish();
            }
        }, "necpra-mark-read").start();
    }
}
