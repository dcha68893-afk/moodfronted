package com.necpa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Shader;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.drawable.IconCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Builds and manages WhatsApp-style message notifications natively:
 *  - MessagingStyle (several messages from one chat stack in ONE notification)
 *  - a bundled summary when more than one conversation is waiting
 *  - Reply + Mark-as-read actions
 *  - suppression of the chat that is currently open on screen
 *  - lock-screen privacy (public version shows only "New message")
 *
 * Direct messages owned by native (see NecpraDmOwner) are decrypted here for the preview, open the native
 * chat on tap and are replied to natively. Otherwise the text is the server's generic preview.
 */
final class NecpraNotifier {
    private static final String TAG = "NecpraNotifier";

    static final String GROUP_KEY = "necpra_messages";
    static final int SUMMARY_ID = 0x4E435041;
    static final int CHILD_ID = 1;
    static final String SUMMARY_TAG = "necpra_summary";

    static final String CHANNEL_MESSAGES = "messages";
    static final String CHANNEL_GROUPS = "group_messages";
    static final String CHANNEL_STATUS = "status_updates";
    static final String CHANNEL_GENERAL = "general";

    static final String ACTION_REPLY = "com.necpa.action.REPLY";
    static final String ACTION_MARK_READ = "com.necpa.action.MARK_READ";
    static final String EXTRA_KIND = "necpra_kind";   // "c" direct chat, "g" group
    static final String EXTRA_ID = "necpra_id";
    static final String KEY_REPLY_TEXT = "necpra_reply_text";

    private static final String STATE_PREFS = "necpra_notif_state";
    private static final int MAX_TRACKED_IDS = 60;

    /** true while MainActivity is started (between onStart and onStop). */
    static volatile boolean appForeground = false;
    /** true while a native Messages screen (NecpraChatActivity) is resumed. */
    static volatile boolean nativeForeground = false;
    /** "c:123" / "g:45" while that conversation is on screen, else null. Reported by the web layer. */
    static volatile String activeKey = null;

    private NecpraNotifier() {}

    // ------------------------------------------------------------------ helpers

    static String key(String kind, String id) { return kind + ":" + id; }

    static boolean isChatMessage(Map<String, String> d) {
        if (d == null) return false;
        String type = d.get("type");
        return "message".equals(type) || "group_message".equals(type);
    }

    /** Status pushes: new status from a friend (type "status") and status like / comment / mention / answer. */
    static boolean isStatusPush(Map<String, String> d) {
        if (d == null) return false;
        String type = d.get("type");
        return type != null && type.startsWith("status");
    }

    private static String nz(String s) { return s == null ? "" : s.trim(); }

    private static long parseLong(String s) {
        try { return s == null ? 0 : Long.parseLong(s.trim()); } catch (Exception e) { return 0; }
    }

    // ------------------------------------------------------------------ channels

    static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        mk(nm, CHANNEL_MESSAGES, "Messages", "Direct messages", NotificationManager.IMPORTANCE_HIGH);
        mk(nm, CHANNEL_GROUPS, "Group messages", "Group conversations", NotificationManager.IMPORTANCE_HIGH);
        mk(nm, CHANNEL_STATUS, "Status updates", "Friend status updates", NotificationManager.IMPORTANCE_DEFAULT);
        mk(nm, CHANNEL_GENERAL, "Activity", "Friend requests, reactions and other activity", NotificationManager.IMPORTANCE_DEFAULT);
    }

    private static void mk(NotificationManager nm, String id, String name, String desc, int importance) {
        if (Build.VERSION.SDK_INT < 26) return;
        if (nm.getNotificationChannel(id) != null) return; // never override what the user already tuned
        NotificationChannel c = new NotificationChannel(id, name, importance);
        c.setDescription(desc);
        c.enableVibration(true);
        c.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        nm.createNotificationChannel(c);
    }

    // ------------------------------------------------------------------ showing

    /** Returns true if a notification was posted OR deliberately suppressed. */
    static boolean showChatMessage(Context ctx, Map<String, String> d, long sentTime,
                                   String fallbackTitle, String fallbackBody) {
        ensureChannels(ctx);

        boolean group = "group_message".equals(d.get("type"));
        String kind = group ? "g" : "c";
        String id = nz(group ? d.get("groupId") : d.get("chatId"));
        if (id.isEmpty()) id = "u" + nz(d.get("senderId")); // never lose a message over a missing id
        String key = key(kind, id);

        // Chat is open on screen -> WhatsApp shows nothing. Also clear any stale one.
        if ((appForeground || nativeForeground) && key.equals(activeKey)) {
            cancelConversation(ctx, key);
            return true;
        }

        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return true;

        String title = nz(d.get("title"));
        if (title.isEmpty()) title = nz(fallbackTitle);
        String body = nz(d.get("body"));
        if (body.isEmpty()) body = nz(fallbackBody);
        if (title.isEmpty()) title = "Necpra";
        if (body.isEmpty()) body = "New message";

        // Native owns this DM: decrypt the preview here (the push itself only carries a generic text).
        final boolean nativeDm = !group && NecpraDmOwner.isOwner(ctx);
        final long nativeChatId = nativeDm ? parseLong(id) : 0;
        if (nativeDm && nativeChatId > 0) {
            String[] pv = NecpraMessageRepository.get(ctx).pushPreview(nativeChatId, parseLong(d.get("messageId")));
            if (pv != null) {
                if (pv[1] != null && !pv[1].isEmpty()) body = pv[1];
                if (pv[0] != null && !pv[0].isEmpty() && !"Chat".equals(pv[0])) title = pv[0];
            }
        }

        String senderName;
        String text;
        if (group) {
            senderName = nz(d.get("senderName"));
            text = body;
            if (senderName.isEmpty()) {
                int i = body.indexOf(": ");
                if (i > 0 && i <= 40) { senderName = body.substring(0, i); text = body.substring(i + 2); }
                else senderName = "Someone";
            }
        } else {
            senderName = nz(d.get("senderName"));
            if (senderName.isEmpty()) senderName = title;
            text = body;
        }

        String msgId = nz(d.get("messageId"));
        if (!msgId.isEmpty()) rememberMessageId(ctx, key, msgId);

        Bitmap avatar = loadAvatar(nz(d.get("imageUrl")));
        androidx.core.app.Person.Builder pb = new androidx.core.app.Person.Builder()
                .setName(senderName)
                .setKey(nz(d.get("senderId")).isEmpty() ? senderName : "u" + nz(d.get("senderId")));
        if (avatar != null) pb.setIcon(IconCompat.createWithBitmap(avatar));
        androidx.core.app.Person sender = pb.build();

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);

        NotificationCompat.MessagingStyle style = null;
        if (nm != null && Build.VERSION.SDK_INT >= 23) {
            try {
                for (StatusBarNotification sbn : nm.getActiveNotifications()) {
                    if (key.equals(sbn.getTag()) && sbn.getId() == CHILD_ID) {
                        style = NotificationCompat.MessagingStyle
                                .extractMessagingStyleFromNotification(sbn.getNotification());
                        break;
                    }
                }
            } catch (Throwable t) { Log.w(TAG, "could not read previous style", t); }
        }
        if (style == null) {
            style = new NotificationCompat.MessagingStyle(new androidx.core.app.Person.Builder().setName("You").build());
        }
        if (group) { style.setConversationTitle(title); }
        style.setGroupConversation(group);
        style.addMessage(new NotificationCompat.MessagingStyle.Message(
                text, sentTime > 0 ? sentTime : System.currentTimeMillis(), sender));

        String channel = group ? CHANNEL_GROUPS : CHANNEL_MESSAGES;
        int mutableFlag = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
        int immutableFlag = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;

        // Tap -> existing deep-link path (MainActivity -> kyn:openChat / kyn:openGroup)
        Uri link = Uri.parse("necpra://" + (group ? "group/" : "chat/") + Uri.encode(id)
                + (msgId.isEmpty() ? "" : "?messageId=" + Uri.encode(msgId)));
        Intent open;
        if (nativeDm && nativeChatId > 0) {
            // Native chat screen directly (no WebView, no kyn:openChat).
            open = NecpraChatActivity.intent(ctx, nativeChatId, parseLong(d.get("senderId")), senderName, nz(d.get("imageUrl")))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        } else {
            open = new Intent(ctx, MainActivity.class)
                .setAction(Intent.ACTION_VIEW).setData(link)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        }
        PendingIntent contentPi = PendingIntent.getActivity(ctx, (key + "#open").hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag);

        // Mark as read -> background broadcast (no UI)
        Intent read = new Intent(ctx, NecpraNotificationActionReceiver.class)
                .setAction(ACTION_MARK_READ).putExtra(EXTRA_KIND, kind).putExtra(EXTRA_ID, id);
        PendingIntent readPi = PendingIntent.getBroadcast(ctx, (key + "#read").hashCode(), read,
                PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, channel)
                .setSmallIcon(R.drawable.ic_stat_necpra)
                .setColor(ContextCompat.getColor(ctx, R.color.necpra_push_accent))
                .setStyle(style)
                .setContentIntent(contentPi)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setGroup(GROUP_KEY)
                .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
                .setWhen(sentTime > 0 ? sentTime : System.currentTimeMillis())
                .setShowWhen(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicVersion(ctx, channel))
                .addAction(new NotificationCompat.Action.Builder(R.drawable.ic_notif_read,
                        ctx.getString(R.string.necpra_notif_mark_read), readPi)
                        .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
                        .setShowsUserInterface(false).build());
        if (Build.VERSION.SDK_INT < 26) b.setDefaults(Notification.DEFAULT_ALL);

        // Reply is offered for 1:1 chats. Native-owned DMs are sent in the background by the receiver (encrypted
        // natively, no UI); otherwise it falls back to opening the app and the web pipeline.
        if (!group) {
            PendingIntent replyPi;
            boolean showsUi;
            if (nativeDm && nativeChatId > 0) {
                Intent reply = new Intent(ctx, NecpraNotificationActionReceiver.class)
                        .setAction(ACTION_REPLY).putExtra(EXTRA_KIND, kind).putExtra(EXTRA_ID, id);
                replyPi = PendingIntent.getBroadcast(ctx, (key + "#reply").hashCode(), reply,
                        PendingIntent.FLAG_UPDATE_CURRENT | mutableFlag);
                showsUi = false;
            } else {
                Intent reply = new Intent(ctx, MainActivity.class)
                        .setAction(ACTION_REPLY).putExtra(EXTRA_KIND, kind).putExtra(EXTRA_ID, id)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                replyPi = PendingIntent.getActivity(ctx, (key + "#reply").hashCode(), reply,
                        PendingIntent.FLAG_UPDATE_CURRENT | mutableFlag);
                showsUi = true;
            }
            RemoteInput ri = new RemoteInput.Builder(KEY_REPLY_TEXT)
                    .setLabel(ctx.getString(R.string.necpra_notif_reply)).build();
            b.addAction(new NotificationCompat.Action.Builder(R.drawable.ic_notif_reply,
                    ctx.getString(R.string.necpra_notif_reply), replyPi)
                    .addRemoteInput(ri)
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
                    .setAllowGeneratedReplies(false)
                    .setShowsUserInterface(showsUi).build());
        }

        NotificationManagerCompat.from(ctx).notify(key, CHILD_ID, b.build());
        updateSummary(ctx);
        return true;
    }

    static final int STATUS_ID = 2;
    static final String STATUS_TAG_PREFIX = "necpra_status:";

    /**
     * Draws a Status notification natively (data-only push, app closed / background). Tapping it opens the native
     * Status screen on the exact status when native owns DMs on this device (reactions/replies are encrypted natively);
     * otherwise it falls back to the existing web deep link (necpra://status/<id>).
     */
    static boolean showStatus(Context ctx, Map<String, String> d, long sentTime, String fallbackTitle, String fallbackBody) {
        ensureChannels(ctx);
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return true;

        String title = nz(d.get("title"));
        if (title.isEmpty()) title = nz(fallbackTitle);
        String body = nz(d.get("body"));
        if (body.isEmpty()) body = nz(fallbackBody);
        if (title.isEmpty()) title = "Status";
        if (body.isEmpty()) body = "New status update";

        String statusId = nz(d.get("statusId"));
        long userId = parseLong(d.get("userId"));
        String tag = STATUS_TAG_PREFIX + (statusId.isEmpty() ? "u" + userId : statusId);

        int immutableFlag = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent open;
        if (NecpraDmOwner.isOwner(ctx)) {
            open = NecpraStatusActivity.intentForStatus(ctx, userId, statusId);
        } else {
            Uri link = Uri.parse("necpra://status/" + Uri.encode(statusId.isEmpty() ? "0" : statusId));
            open = new Intent(ctx, MainActivity.class)
                    .setAction(Intent.ACTION_VIEW).setData(link)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        }
        PendingIntent contentPi = PendingIntent.getActivity(ctx, (tag + "#open").hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_STATUS)
                .setSmallIcon(R.drawable.ic_stat_necpra)
                .setColor(ContextCompat.getColor(ctx, R.color.necpra_push_accent))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(contentPi)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_SOCIAL)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setWhen(sentTime > 0 ? sentTime : System.currentTimeMillis())
                .setShowWhen(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicVersion(ctx, CHANNEL_STATUS));
        Bitmap avatar = loadAvatar(nz(d.get("imageUrl")));
        if (avatar != null) b.setLargeIcon(avatar);
        if (Build.VERSION.SDK_INT < 26) b.setDefaults(Notification.DEFAULT_ALL);

        NotificationManagerCompat.from(ctx).notify(tag, STATUS_ID, b.build());
        return true;
    }

    /** Last-resort notification so a failure in the rich path never swallows a message. */
    static void showFallback(Context ctx, String title, String body) {
        try {
            ensureChannels(ctx);
            if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return;
            Intent open = new Intent(ctx, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(ctx, 7, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
            Notification n = new NotificationCompat.Builder(ctx, CHANNEL_MESSAGES)
                    .setSmallIcon(R.drawable.ic_stat_necpra)
                    .setColor(ContextCompat.getColor(ctx, R.color.necpra_push_accent))
                    .setContentTitle(title == null || title.isEmpty() ? "Necpra" : title)
                    .setContentText(body == null || body.isEmpty() ? "New message" : body)
                    .setContentIntent(pi).setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE).build();
            NotificationManagerCompat.from(ctx).notify("necpra_fallback", (int) (System.currentTimeMillis() & 0xFFFFFF), n);
        } catch (Throwable t) { Log.e(TAG, "fallback notification failed", t); }
    }

    private static Notification publicVersion(Context ctx, String channel) {
        return new NotificationCompat.Builder(ctx, channel)
                .setSmallIcon(R.drawable.ic_stat_necpra)
                .setColor(ContextCompat.getColor(ctx, R.color.necpra_push_accent))
                .setContentTitle("Necpra")
                .setContentText(ctx.getString(R.string.necpra_notif_new_message)).build();
    }

    // ------------------------------------------------------------------ summary / cancel

    static void updateSummary(Context ctx) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null || Build.VERSION.SDK_INT < 23) return;
            int convs = 0;
            for (StatusBarNotification sbn : nm.getActiveNotifications()) {
                if (sbn.getId() == CHILD_ID && sbn.getTag() != null && !SUMMARY_TAG.equals(sbn.getTag())
                        && GROUP_KEY.equals(sbn.getNotification().getGroup())) convs++;
            }
            NotificationManagerCompat nmc = NotificationManagerCompat.from(ctx);
            if (convs < 2) { nmc.cancel(SUMMARY_TAG, SUMMARY_ID); return; }
            Notification s = new NotificationCompat.Builder(ctx, CHANNEL_MESSAGES)
                    .setSmallIcon(R.drawable.ic_stat_necpra)
                    .setColor(ContextCompat.getColor(ctx, R.color.necpra_push_accent))
                    .setContentTitle("Necpra")
                    .setContentText(convs + " chats with new messages")
                    .setStyle(new NotificationCompat.InboxStyle().setSummaryText(convs + " chats"))
                    .setGroup(GROUP_KEY).setGroupSummary(true)
                    .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
                    .setAutoCancel(true)
                    .setContentIntent(PendingIntent.getActivity(ctx, 9,
                            new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP),
                            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)))
                    .build();
            nmc.notify(SUMMARY_TAG, SUMMARY_ID, s);
        } catch (Throwable t) { Log.w(TAG, "summary failed", t); }
    }

    static void cancelConversation(Context ctx, String key) {
        try {
            NotificationManagerCompat.from(ctx).cancel(key, CHILD_ID);
            clearMessageIds(ctx, key);
            updateSummary(ctx);
        } catch (Throwable t) { Log.w(TAG, "cancel failed", t); }
    }

    // ------------------------------------------------------------------ message-id tracking (ids only, no text)

    private static SharedPreferences state(Context ctx) {
        return ctx.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE);
    }

    private static synchronized void rememberMessageId(Context ctx, String key, String msgId) {
        try {
            JSONArray arr = new JSONArray(state(ctx).getString("ids:" + key, "[]"));
            for (int i = 0; i < arr.length(); i++) if (msgId.equals(arr.optString(i))) return;
            arr.put(msgId);
            if (arr.length() > MAX_TRACKED_IDS) {
                JSONArray trimmed = new JSONArray();
                for (int i = arr.length() - MAX_TRACKED_IDS; i < arr.length(); i++) trimmed.put(arr.get(i));
                arr = trimmed;
            }
            state(ctx).edit().putString("ids:" + key, arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    static synchronized JSONArray messageIds(Context ctx, String key) {
        try { return new JSONArray(state(ctx).getString("ids:" + key, "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    private static synchronized void clearMessageIds(Context ctx, String key) {
        state(ctx).edit().remove("ids:" + key).apply();
    }

    // ------------------------------------------------------------------ privacy flag mirrored from the web settings

    static void setReadReceipts(Context ctx, boolean on) {
        state(ctx).edit().putBoolean("readReceipts", on).apply();
    }

    static boolean readReceipts(Context ctx) {
        return state(ctx).getBoolean("readReceipts", true);
    }

    // ------------------------------------------------------------------ avatar

    private static Bitmap loadAvatar(String url) {
        if (url == null || !url.regionMatches(true, 0, "https://", 0, 8)) return null;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(3000);
            c.setReadTimeout(3000);
            c.setInstanceFollowRedirects(true);
            if (c.getResponseCode() != 200) return null;
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n, total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > 1024 * 1024) return null; // cap at 1 MB
                out.write(buf, 0, n);
            }
            byte[] bytes = out.toByteArray();
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
            int sample = 1;
            while (o.outWidth / sample > 256 || o.outHeight / sample > 256) sample *= 2;
            o = new BitmapFactory.Options();
            o.inSampleSize = sample;
            Bitmap src = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
            return src == null ? null : circle(src);
        } catch (Throwable t) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static Bitmap circle(Bitmap src) {
        int size = Math.min(src.getWidth(), src.getHeight());
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        BitmapShader shader = new BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
        android.graphics.Matrix m = new android.graphics.Matrix();
        m.setTranslate(-(src.getWidth() - size) / 2f, -(src.getHeight() - size) / 2f);
        shader.setLocalMatrix(m);
        p.setShader(shader);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, p);
        return out;
    }

    // ------------------------------------------------------------------ authenticated POST for mark-as-read

    /** POST JSON with the native session token, refreshing once on 401. Returns HTTP status (0 = no session/network). */
    static int authedPost(Context ctx, String path, JSONObject body) {
        try {
            SharedPreferences auth = ctx.getSharedPreferences(NativeBackgroundSync.AUTH_PREFS, Context.MODE_PRIVATE);
            String access = NativeBackgroundSync.getDecrypted(auth, "accessToken");
            if (access == null || access.isEmpty()) access = NativeBackgroundSync.refreshSession(ctx);
            int status = post(ctx, path, body, access);
            if (status == 401) status = post(ctx, path, body, NativeBackgroundSync.refreshSession(ctx));
            return status;
        } catch (Throwable t) {
            Log.w(TAG, "authedPost failed: " + t.getMessage());
            return 0;
        }
    }

    private static int post(Context ctx, String path, JSONObject body, String token) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(NativeBackgroundSync.backendOrigin(ctx) + path).openConnection();
        try {
            c.setRequestMethod("POST");
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setUseCaches(false);
            c.setDoOutput(true);
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.getOutputStream().write(body.toString().getBytes(StandardCharsets.UTF_8));
            int status = c.getResponseCode();
            try { NativeBackgroundSync.readText(status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream()); }
            catch (Exception ignored) {}
            return status;
        } finally {
            c.disconnect();
        }
    }
}
