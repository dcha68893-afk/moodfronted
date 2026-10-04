package com.necpa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.core.app.RemoteInput;

import org.json.JSONArray;
import org.json.JSONObject;

/** Buttons on a message notification ("Mark as read", inline "Reply"). Runs with no UI. */
public class NecpraNotificationActionReceiver extends BroadcastReceiver {
    private static final String TAG = "NecpraNotifAction";

    @Override
    public void onReceive(final Context context, Intent intent) {
        if (intent == null) return;
        if (NecpraNotifier.ACTION_REPLY.equals(intent.getAction())) { onReply(context, intent); return; }
        if (!NecpraNotifier.ACTION_MARK_READ.equals(intent.getAction())) return;
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

    /** Inline reply on a native-owned DM: encrypted and sent natively, the WebView is never involved. */
    private void onReply(final Context context, Intent intent) {
        final String kind = intent.getStringExtra(NecpraNotifier.EXTRA_KIND);
        final String id = intent.getStringExtra(NecpraNotifier.EXTRA_ID);
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence cs = results == null ? null : results.getCharSequence(NecpraNotifier.KEY_REPLY_TEXT);
        final String text = cs == null ? "" : cs.toString().trim();
        if (!"c".equals(kind) || id == null) return;
        final String key = NecpraNotifier.key(kind, id);

        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                if (text.isEmpty()) return;
                if (NecpraDmOwner.isOwner(context)) {
                    NecpraMessageRepository repo = NecpraMessageRepository.get(context);
                    long chatId = repo.chatIdForNotification(id);
                    if (chatId > 0) repo.sendNow(chatId, text);
                    else Log.w(TAG, "reply: could not resolve chat for " + id);
                } else {
                    // Native no longer owns DMs (signed out / switched off): hand it to the web layer as before.
                    NecpraNotifyPlugin.queueReply(kind, id, text);
                }
            } catch (Throwable t) {
                Log.w(TAG, "native reply failed", t);
            } finally {
                // Clears the notification and stops the "sending" spinner on the inline reply box.
                NecpraNotifier.cancelConversation(context, key);
                pending.finish();
            }
        }, "necpra-notif-reply").start();
    }
}
