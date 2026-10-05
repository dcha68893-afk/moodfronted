package com.necpa;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** JS bridge for the native notification layer (window.Capacitor.Plugins.NecpraNotify). */
@CapacitorPlugin(name = "NecpraNotify")
public class NecpraNotifyPlugin extends Plugin {

    /** Replies typed into a notification, waiting for the web layer to send them encrypted. */
    private static final Map<String, JSONObject> PENDING_REPLIES = new LinkedHashMap<>();

    static void queueReply(String kind, String id, String text) {
        try {
            String rid = UUID.randomUUID().toString();
            JSONObject o = new JSONObject().put("rid", rid).put("kind", kind).put("id", id).put("text", text);
            synchronized (PENDING_REPLIES) { PENDING_REPLIES.put(rid, o); }
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void version(PluginCall call) {
        JSObject r = new JSObject();
        r.put("version", 3);
        call.resolve(r);
    }

    /** {kind:'c'|'g', id:'123'} while that conversation is on screen; empty to clear. */
    @PluginMethod
    public void setActiveChat(PluginCall call) {
        String kind = call.getString("kind");
        String id = call.getString("id");
        if (kind == null || id == null || kind.isEmpty() || id.isEmpty()) {
            NecpraNotifier.activeKey = null;
        } else {
            String key = NecpraNotifier.key(kind, id);
            NecpraNotifier.activeKey = key;
            NecpraNotifier.cancelConversation(getContext(), key);
        }
        call.resolve();
    }

    @PluginMethod
    public void clearConversation(PluginCall call) {
        String kind = call.getString("kind");
        String id = call.getString("id");
        if (kind != null && id != null) NecpraNotifier.cancelConversation(getContext(), NecpraNotifier.key(kind, id));
        call.resolve();
    }

    @PluginMethod
    public void setPrivacy(PluginCall call) {
        Boolean rr = call.getBoolean("readReceipts");
        if (rr != null) NecpraNotifier.setReadReceipts(getContext(), rr);
        call.resolve();
    }

    /** Real OS-level state: master switch + any individual channel the user switched off. */
    @PluginMethod
    public void notificationStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        r.put("enabled", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        r.put("sdk", Build.VERSION.SDK_INT);
        JSArray blocked = new JSArray();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                for (NotificationChannel c : nm.getNotificationChannels()) {
                    if (c.getImportance() == NotificationManager.IMPORTANCE_NONE) blocked.put(c.getId());
                }
            }
        }
        r.put("blockedChannels", blocked);
        call.resolve(r);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context ctx = getContext();
        String channel = call.getString("channelId");
        Intent i;
        if (Build.VERSION.SDK_INT >= 26) {
            if (channel != null && !channel.isEmpty()) {
                i = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_CHANNEL_ID, channel);
            } else {
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            }
            i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.fromParts("package", ctx.getPackageName(), null));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { ctx.startActivity(i); call.resolve(); }
        catch (Exception e) { call.reject("Could not open notification settings", e); }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Context ctx = getContext();
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.fromParts("package", ctx.getPackageName(), null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { ctx.startActivity(i); call.resolve(); }
        catch (Exception e) { call.reject("Could not open app settings", e); }
    }

    @PluginMethod
    public void getPendingReplies(PluginCall call) {
        JSArray arr = new JSArray();
        List<JSONObject> copy;
        synchronized (PENDING_REPLIES) { copy = new ArrayList<>(PENDING_REPLIES.values()); }
        for (JSONObject o : copy) arr.put(o);
        JSObject r = new JSObject();
        r.put("replies", arr);
        call.resolve(r);
    }

    @PluginMethod
    public void ackReply(PluginCall call) {
        String rid = call.getString("rid");
        if (rid != null) synchronized (PENDING_REPLIES) { PENDING_REPLIES.remove(rid); }
        call.resolve();
    }
}
