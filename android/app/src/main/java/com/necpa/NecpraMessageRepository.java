package com.necpa;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * The one place the native Messages screens get data from (Phase 2).
 *
 *  - REST: the SAME endpoints the web client uses (/api/chats, /api/messages, /:chatId?before=, /:chatId/sync?sinceId=,
 *    /read, /:id/delivered, /:id/react, /resolve/:userId). No new backend.
 *  - Encryption: every incoming envelope goes through {@link NecpraE2E#decrypt} exactly ONCE, in ascending id order,
 *    and the plaintext is stored; a ratchet message key is single-use, so we never decrypt the same row twice.
 *  - Own sent messages cannot be decrypted again (forward secrecy), so the plaintext is saved when the message is queued.
 *  - Send queue: a message is a row with status QUEUED + a stable clientMessageId. The ciphertext is produced once and
 *    persisted BEFORE the POST, so every retry resends the identical envelope and the server's clientMessageId
 *    idempotency makes retries safe. A WorkManager job drains the queue when the network returns, even if the app is closed.
 *  - Paging: older history via ?before=<oldest server id>; catch-up via /sync?sinceId=<syncCursor>. The cursor is only
 *    advanced by fetched rows (never by our own send ack), so a message that arrived while we were sending is never skipped.
 *
 * All blocking methods must be called off the UI thread; the *Async helpers do that for the screens.
 */
public final class NecpraMessageRepository {

    // message delivery state
    static final int ST_QUEUED = 0, ST_SENT = 1, ST_DELIVERED = 2, ST_READ = 3, ST_FAILED = 4;
    // what we know about the text
    static final int CS_OK = 0, CS_UNSUPPORTED = 1, CS_FAILED = 2, CS_OWN_UNAVAILABLE = 3, CS_PLAIN = 4;

    static final int PAGE = 40;
    static final int MAX_TEXT = 2500;      // keeps the encrypted envelope under the server's 5000 char limit
    private static final String META_PREFS = "necpra_native_chat_meta";
    private static final String WORK_NAME = "necpra_send_queue";

    interface Listener {
        void onConversationsChanged();
        void onMessagesChanged(long chatId);
        void onNotice(String message, boolean sessionExpired);
    }

    /** Loaded window for one chat, with its child rows already joined. */
    static final class Item {
        NecpraDb.Msg msg;
        String text;                                   // opened plaintext or null
        List<NecpraDb.Att> atts = new ArrayList<>();
        Map<String, Integer> reactions = new java.util.LinkedHashMap<>();  // emoji -> count
        String myReaction;
        String replyText;
    }

    private static volatile NecpraMessageRepository instance;

    static NecpraMessageRepository get(Context c) {
        NecpraMessageRepository r = instance;
        if (r == null) {
            synchronized (NecpraMessageRepository.class) {
                if (instance == null) instance = new NecpraMessageRepository(c.getApplicationContext());
                r = instance;
            }
        }
        r.ensureAccount();
        return r;
    }

    /** Logout: drop the database, the queue and the singleton. */
    static void reset(Context c) {
        Context app = c.getApplicationContext();
        try { WorkManager.getInstance(app).cancelUniqueWork(WORK_NAME); } catch (Throwable ignored) { }
        instance = null;
        NecpraDb.wipe(app);
        app.getSharedPreferences(META_PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        deleteTree(new File(app.getFilesDir(), "outbox"));
        deleteTree(new File(app.getCacheDir(), "att"));
    }

    private static void deleteTree(File f) {
        try {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteTree(k);
            f.delete();
        } catch (Exception ignored) { }
    }

    private final Context app;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newFixedThreadPool(2);
    private final ExecutorService sender = Executors.newSingleThreadExecutor();
    private final CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();
    private final ConcurrentHashMap<Long, Object> chatLocks = new ConcurrentHashMap<>();
    private final Object drainLock = new Object();
    private final SecureRandom rnd = new SecureRandom();

    private NecpraMessageRepository(Context app) { this.app = app; }

    private NecpraDb.ChatDao dao() { return NecpraDb.get(app).dao(); }

    // ------------------------------------------------------------------ account / readiness

    /** Wipes leftovers of another account the first time a different user is provisioned. */
    private synchronized void ensureAccount() {
        String me = NecpraE2EStore.provisionedUser(app);
        SharedPreferences p = app.getSharedPreferences(META_PREFS, Context.MODE_PRIVATE);
        String stored = p.getString("userId", null);
        if (me != null && stored != null && !stored.equals(me)) {
            NecpraDb.wipe(app);
        }
        if (me != null && !me.equals(stored)) p.edit().putString("userId", me).commit();
    }

    /** True once the web layer handed the identity key over (e2eProvision succeeded for the signed-in account). */
    boolean ready() { return NecpraE2EStore.provisionedUser(app) != null; }

    long me() {
        try { return Long.parseLong(NecpraE2EStore.provisionedUser(app)); } catch (Exception e) { return 0L; }
    }

    String lastProvisionError() { return NecpraE2EStore.lastError(app); }

    // ------------------------------------------------------------------ groups (Sender Keys v2 - see NecpraGroupE2E)

    /** True when native owns group chats on this device (flag on AND the identity key is on the device). */
    boolean groupsOn() { return NecpraDmOwner.isGroupOwner(app); }

    private final NecpraGroupE2E.Api groupApi = new NecpraGroupE2E.Api() {
        @Override public JSONObject get(String path) throws Exception { return groupCall("GET", path, null); }
        @Override public JSONObject post(String path, JSONObject body) throws Exception { return groupCall("POST", path, body); }
    };

    /** Same HTTP + single-refresh path as everything else; non-2xx becomes an ApiException so the engine can react to 409. */
    private JSONObject groupCall(String method, String path, JSONObject body) throws Exception {
        Resp r = request(method, path, body);
        if (!r.ok()) throw new NecpraGroupE2E.ApiException(r.status, r.json == null ? null : r.json.optString("code", null), r.message());
        return r.json == null ? new JSONObject() : r.json;
    }

    private NecpraGroupE2E groupEngine() throws Exception { return NecpraE2EStore.groupEngine(app, groupApi); }

    private boolean isGroup(long chatId) { NecpraDb.Conv c = dao().conv(chatId); return c != null && "group".equals(c.type); }

    /** list / sync answer {data:{messages:[...]}} (older builds answered a bare array). */
    private static JSONArray groupRows(JSONObject json) {
        if (json == null) return null;
        JSONObject d = json.optJSONObject("data");
        if (d != null) return d.optJSONArray("messages");
        return json.optJSONArray("data");
    }

    private static String groupSenderName(JSONObject row) {
        String n = str(row, "senderDisplayName");
        if (n == null || n.isEmpty()) { String f = str(row, "firstName"), l = str(row, "lastName"); n = ((f == null ? "" : f) + " " + (l == null ? "" : l)).trim(); }
        if (n.isEmpty()) n = str(row, "senderUsername");
        return n == null || n.isEmpty() ? null : n;
    }

    private final ConcurrentHashMap<Long, Long> lastKeyTopUp = new ConcurrentHashMap<>();

    /** Gives members who joined since our sender key was made a copy of it. Cheap no-op otherwise; at most once a minute per group. */
    private void topUpGroupKeys(long chatId) {
        long now = System.currentTimeMillis(); Long last = lastKeyTopUp.get(chatId);
        if (last != null && now - last < 60_000L) return;
        lastKeyTopUp.put(chatId, now);
        try { groupEngine().distributeMissing(chatId); } catch (Exception ignored) { /* retried on a later sync */ }
    }

    /** Messages that arrived before the sender's key reached us are retried once the key is on the server. */
    private void retryUndecrypted(long chatId) {
        NecpraDb.ChatDao d = dao();
        List<NecpraDb.Msg> stuck = d.undecrypted(chatId);
        if (stuck.isEmpty()) return;
        boolean changed = false;
        for (NecpraDb.Msg m : stuck) {
            String content = m.envelope == null ? null : open(m.envelope);
            if (content == null) continue;                 // ciphertext is only kept for rows we still want to retry
            try {
                m.body = seal(groupEngine().decrypt(chatId, content));
                m.cryptoState = CS_OK; m.lastError = null; m.envelope = null;
                d.updateMsg(m); changed = true;
            } catch (NecpraGroupE2E.KeyUnavailable ignored) { break;   // still not distributed: no point trying the rest
            } catch (Exception ignored) { /* permanent for this device: leave it as it is */ }
        }
        if (changed) { refreshPreview(chatId); fireMessages(chatId); fireConversations(); }
    }

    // ------------------------------------------------------------------ listeners

    void addListener(Listener l) { listeners.addIfAbsent(l); }
    void removeListener(Listener l) { listeners.remove(l); }

    private void fireConversations() { main.post(() -> { for (Listener l : listeners) l.onConversationsChanged(); }); }
    private void fireMessages(long chatId) { main.post(() -> { for (Listener l : listeners) l.onMessagesChanged(chatId); }); }
    private void fireNotice(String m, boolean expired) { main.post(() -> { for (Listener l : listeners) l.onNotice(m, expired); }); }

    void async(Runnable r) { io.execute(r); }

    // ------------------------------------------------------------------ sealing (Keystore AES-GCM, same key as the native session)

    private String seal(String s) {
        if (s == null) return null;
        try { return NativeBackgroundSync.encrypt(s); } catch (Exception e) { throw new IllegalStateException("Secure storage unavailable", e); }
    }

    private String open(String s) {
        if (s == null) return null;
        try { return NativeBackgroundSync.decrypt(s); } catch (Exception e) { return null; }
    }

    // ------------------------------------------------------------------ HTTP (same session + single-refresh path as the other native screens)

    static final class Resp {
        final int status; final JSONObject json;
        Resp(int s, JSONObject j) { status = s; json = j; }
        boolean ok() { return status >= 200 && status < 300; }
        String message() { String m = json == null ? null : json.optString("message", null); return m == null || m.isEmpty() ? "HTTP " + status : m; }
    }

    private Resp request(String method, String path, JSONObject body) throws Exception {
        boolean retried = false;
        while (true) {
            SharedPreferences auth = app.getSharedPreferences(NativeBackgroundSync.AUTH_PREFS, Context.MODE_PRIVATE);
            String access = NativeBackgroundSync.getDecrypted(auth, "accessToken");
            if (access == null || access.isEmpty()) access = NativeBackgroundSync.refreshSession(app);
            HttpURLConnection h = null; int status; String text;
            try {
                h = (HttpURLConnection) new URL(NativeBackgroundSync.backendOrigin(app) + path).openConnection();
                h.setRequestMethod(method); h.setConnectTimeout(15000); h.setReadTimeout(30000); h.setUseCaches(false);
                h.setRequestProperty("Accept", "application/json");
                h.setRequestProperty("Authorization", "Bearer " + access);
                if (body != null) {
                    byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                    h.setDoOutput(true);
                    h.setRequestProperty("Content-Type", "application/json");
                    h.setFixedLengthStreamingMode(bytes.length);
                    h.getOutputStream().write(bytes);
                }
                status = h.getResponseCode();
                text = NativeBackgroundSync.readText(status >= 200 && status < 400 ? h.getInputStream() : h.getErrorStream());
            } finally {
                // FIX (slow send/receive): h.disconnect() CLOSED the socket after every call, so each send and each
                // /sync paid a brand-new TCP + TLS handshake (3-4 round trips; seconds on mobile data). The body is already
                // fully read and closed by readText(), so the connection goes back to the keep-alive pool and is reused.
            }
            if (status == 401) {
                if (retried) throw new NativeBackgroundSync.SessionExpiredException("Unauthorized after refresh");
                retried = true; NativeBackgroundSync.refreshSession(app); continue;
            }
            JSONObject json = null;
            try { json = new JSONObject(text == null || text.trim().isEmpty() ? "{}" : text); } catch (Exception ignored) { }
            return new Resp(status, json);
        }
    }

    private static long parseIso(String s) {
        if (s == null || s.isEmpty() || "null".equals(s)) return 0L;
        String[] fmts = {"yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX", "yyyy-MM-dd'T'HH:mm:ss.SSS", "yyyy-MM-dd'T'HH:mm:ss"};
        for (String f : fmts) {
            try { SimpleDateFormat d = new SimpleDateFormat(f, Locale.US); d.setTimeZone(TimeZone.getTimeZone("UTC")); Date x = d.parse(s); if (x != null) return x.getTime(); }
            catch (Exception ignored) { }
        }
        return 0L;
    }

    private static String str(JSONObject o, String k) { return o == null || o.isNull(k) ? null : o.optString(k, null); }

    private Object lock(long chatId) { return chatLocks.computeIfAbsent(chatId, k -> new Object()); }

    // ------------------------------------------------------------------ conversations

    List<NecpraDb.Conv> loadConversations() { return dao().convs(); }

    /** GET /api/chats and store it. Then top up previews of the freshest direct chats so the list never shows ciphertext. */
    void refreshConversations() throws Exception {
        Resp r = request("GET", "/api/chats?limit=100", null);
        if (!r.ok()) throw new IOException(r.message());
        JSONObject data = r.json == null ? null : r.json.optJSONObject("data");
        JSONArray chats = data == null ? null : data.optJSONArray("chats");
        if (chats == null) return;
        NecpraDb.ChatDao d = dao();
        List<NecpraDb.Conv> out = new ArrayList<>(); List<Long> keep = new ArrayList<>();
        for (int i = 0; i < chats.length(); i++) {
            JSONObject c = chats.optJSONObject(i); if (c == null) continue;
            long id = c.optLong("id"); if (id <= 0) continue;
            NecpraDb.Conv old = d.conv(id);
            NecpraDb.Conv n = new NecpraDb.Conv();
            n.chatId = id;
            n.type = "group".equals(str(c, "type")) ? "group" : "direct";
            JSONObject other = c.optJSONObject("otherParticipant");
            n.peerId = "direct".equals(n.type) ? (other != null ? other.optLong("id") : c.optLong("friendId")) : 0L;
            String title = str(c, "chatName"); if (title == null || title.isEmpty()) title = str(c, "name");
            n.title = title == null || title.isEmpty() ? "Chat" : title;
            n.avatar = str(c, "avatar");
            n.unread = Math.max(0, c.optInt("unreadCount", 0));
            JSONArray lm = c.optJSONArray("chatMessages");
            JSONObject last = lm != null && lm.length() > 0 ? lm.optJSONObject(0) : null;
            n.lastServerId = last == null ? 0 : last.optLong("id");
            n.lastAt = last != null ? parseIso(str(last, "createdAt")) : 0L;
            if (n.lastAt == 0) n.lastAt = Math.max(parseIso(str(c, "lastMessageAt")), parseIso(str(c, "updatedAt")));
            n.syncCursor = old == null ? 0 : old.syncCursor;
            n.lastPreview = previewFor(id, last, old);
            out.add(n); keep.add(id);
        }
        d.upsertConvs(out);
        if (!keep.isEmpty()) d.deleteConvsNotIn(keep);
        fireConversations();

        // Warm up: ingest (decrypt + store) the newest messages of the most recent direct chats, in order, once.
        int warmed = 0;
        for (NecpraDb.Conv c : d.convs()) {
            if (warmed >= 15) break;
            if (!ready()) continue;
            if ("group".equals(c.type) ? !groupsOn() : (!"direct".equals(c.type) || c.peerId <= 0)) continue;
            if (c.lastServerId > c.syncCursor) {
                try { syncChat(c.chatId); warmed++; } catch (NativeBackgroundSync.SessionExpiredException e) { throw e; } catch (Exception ignored) { }
            }
        }
    }

    private String previewFor(long chatId, JSONObject last, NecpraDb.Conv old) {
        if (last == null) return old != null ? old.lastPreview : "";
        long lastId = last.optLong("id");
        NecpraDb.Msg newest = dao().newest(chatId);
        if (newest != null && (newest.serverId >= lastId || newest.serverId == 0)) return previewOf(newest);
        String content = str(last, "content");
        if (content == null) return "";
        if (NecpraE2E.looksEncrypted(content)) return old != null && old.lastPreview != null ? old.lastPreview : "\uD83D\uDD12 Encrypted message";
        return content.length() > 120 ? content.substring(0, 120) : content;
    }

    private String previewOf(NecpraDb.Msg m) {
        String prefix = m.mine ? "You: " : "";
        if (m.type != null && !"text".equals(m.type) && !"system".equals(m.type)) {
            return prefix + labelForType(m.type);
        }
        String t = open(m.body);
        if (t != null) { t = t.replace('\n', ' '); return prefix + (t.length() > 120 ? t.substring(0, 120) : t); }
        return prefix + (m.cryptoState == CS_UNSUPPORTED ? "\uD83D\uDD12 Encrypted message" : m.cryptoState == CS_OWN_UNAVAILABLE ? "Sent from another device" : "\uD83D\uDD12 Encrypted message");
    }

    static String labelForType(String t) {
        switch (t == null ? "" : t) {
            case "image": return "\uD83D\uDCF7 Photo";
            case "video": return "\uD83C\uDFA5 Video";
            case "audio": return "\uD83C\uDFA4 Voice message";
            case "file": return "\uD83D\uDCCE File";
            case "sticker": return "Sticker";
            case "location": return "\uD83D\uDCCD Location";
            case "contact": return "\uD83D\uDC64 Contact";
            case "poll": return "\uD83D\uDCCA Poll";
            case "view_once": return "View once";
            case "status_reply": return "Status reply";
            default: return "Message";
        }
    }

    /** Find-or-create the direct chat with a user (GET /api/messages/resolve/:id). */
    long resolveDirectChat(long peerId, String title, String avatar) throws Exception {
        NecpraDb.Conv known = dao().convForPeer(peerId);
        if (known != null) return known.chatId;
        Resp r = request("GET", "/api/messages/resolve/" + peerId, null);
        if (!r.ok()) throw new IOException(r.message());
        long chatId = r.json.optJSONObject("data").optLong("chatId");
        if (chatId <= 0) throw new IOException("Could not open chat");
        NecpraDb.Conv c = new NecpraDb.Conv();
        c.chatId = chatId; c.type = "direct"; c.peerId = peerId;
        c.title = title == null || title.isEmpty() ? "Chat" : title; c.avatar = avatar; c.lastPreview = "";
        c.lastAt = System.currentTimeMillis();
        NecpraDb.Conv old = dao().conv(chatId);
        if (old != null) return chatId;
        dao().upsertConv(c);
        fireConversations();
        return chatId;
    }

    // ------------------------------------------------------------------ reading a chat

    /** The newest {@code limit} messages of a chat from the local database, with children joined and text opened. */
    List<Item> loadWindow(long chatId, int limit) {
        NecpraDb.ChatDao d = dao();
        List<NecpraDb.Msg> msgs = d.window(chatId, limit);
        List<Item> out = new ArrayList<>(msgs.size());
        if (msgs.isEmpty()) return out;
        List<Long> ids = new ArrayList<>();
        for (NecpraDb.Msg m : msgs) ids.add(m.localId);
        Map<Long, List<NecpraDb.Att>> atts = new HashMap<>();
        for (NecpraDb.Att a : d.attsFor(ids)) { List<NecpraDb.Att> l = atts.get(a.messageLocalId); if (l == null) atts.put(a.messageLocalId, l = new ArrayList<>()); l.add(a); }
        Map<Long, List<NecpraDb.React>> reacts = new HashMap<>();
        for (NecpraDb.React x : d.reactsFor(ids)) { List<NecpraDb.React> l = reacts.get(x.messageLocalId); if (l == null) reacts.put(x.messageLocalId, l = new ArrayList<>()); l.add(x); }
        Map<Long, NecpraDb.Msg> byServer = new HashMap<>();
        for (NecpraDb.Msg m : msgs) if (m.serverId > 0) byServer.put(m.serverId, m);
        long me = me();
        for (NecpraDb.Msg m : msgs) {
            Item it = new Item(); it.msg = m; it.text = open(m.body);
            List<NecpraDb.Att> a = atts.get(m.localId); if (a != null) it.atts = a;
            List<NecpraDb.React> rs = reacts.get(m.localId);
            if (rs != null) for (NecpraDb.React x : rs) {
                Integer c = it.reactions.get(x.emoji); it.reactions.put(x.emoji, c == null ? 1 : c + 1);
                if (x.userId == me) it.myReaction = x.emoji;
            }
            if (m.replyToServerId > 0) {
                NecpraDb.Msg q = byServer.get(m.replyToServerId);
                if (q != null) { String t = open(q.body); it.replyText = t != null ? t : labelForType(q.type); }
                else it.replyText = "Earlier message";
            }
            out.add(it);
        }
        return out;
    }

    /**
     * Makes sure at least one more page exists locally beyond a window of {@code currentWindow} rows: uses what the device already
     * has, otherwise fetches ?before=<oldest server id> and stores it. Returns true when older history may still exist.
     */
    boolean loadOlder(long chatId, int currentWindow) throws Exception {
        NecpraDb.ChatDao d = dao();
        if (d.count(chatId) > currentWindow) return true;
        long oldest = d.minServerId(chatId);
        if (oldest <= 0) return false;
        final boolean group = isGroup(chatId);
        if (group && !groupsOn()) return false;
        synchronized (lock(chatId)) {
            Resp r = request("GET", group ? "/api/group-messages/" + chatId + "/messages?before=" + oldest + "&limit=" + PAGE
                                          : "/api/messages/" + chatId + "?before=" + oldest + "&limit=" + PAGE, null);
            if (!r.ok()) throw new IOException(r.message());
            JSONArray rows = group ? groupRows(r.json) : r.json.optJSONArray("data");
            if (rows != null && rows.length() > 0) ingest(chatId, rows, false);
            boolean more = group ? (r.json.optJSONObject("data") != null && r.json.optJSONObject("data").optBoolean("hasMore", false)) : r.json.optBoolean("hasMore", false);
            return d.count(chatId) > currentWindow || more;
        }
    }

    /** Initial page for an empty chat, otherwise catch-up from the stored cursor, repeated until the server has nothing newer. */
    void syncChat(long chatId) throws Exception {
        NecpraDb.ChatDao d = dao();
        NecpraDb.Conv conv = d.conv(chatId);
        if (conv != null && "group".equals(conv.type)) { if (groupsOn()) syncGroup(chatId); return; }
        if (conv == null || !"direct".equals(conv.type)) return;
        synchronized (lock(chatId)) {
            long cursor = conv.syncCursor;
            if (cursor <= 0) {
                Resp r = request("GET", "/api/messages/" + chatId + "?limit=" + PAGE, null);
                if (!r.ok()) throw new IOException(r.message());
                JSONArray rows = r.json.optJSONArray("data");
                if (rows != null) ingest(chatId, rows, true);
                return;
            }
            for (int guard = 0; guard < 20; guard++) {
                Resp r = request("GET", "/api/messages/" + chatId + "/sync?sinceId=" + cursor + "&limit=100", null);
                if (!r.ok()) throw new IOException(r.message());
                JSONArray rows = r.json.optJSONArray("data");
                if (rows == null || rows.length() == 0) return;
                long next = ingest(chatId, rows, true);
                if (rows.length() < 100 || next <= cursor) return;
                cursor = next;
            }
        }
    }

    /** Group counterpart of {@link #syncChat}: same cursor rules over /api/group-messages, then key housekeeping. */
    private void syncGroup(long chatId) throws Exception {
        NecpraDb.ChatDao d = dao();
        NecpraDb.Conv conv = d.conv(chatId);
        if (conv == null || !"group".equals(conv.type)) return;
        synchronized (lock(chatId)) {
            long cursor = conv.syncCursor;
            if (cursor <= 0) {
                Resp r = request("GET", "/api/group-messages/" + chatId + "/messages?limit=" + PAGE, null);
                if (!r.ok()) throw new IOException(r.message());
                JSONArray rows = groupRows(r.json);
                if (rows != null) ingest(chatId, rows, true);
            } else {
                for (int guard = 0; guard < 20; guard++) {
                    Resp r = request("GET", "/api/group-messages/" + chatId + "/sync?sinceId=" + cursor + "&limit=100", null);
                    if (!r.ok()) throw new IOException(r.message());
                    JSONArray rows = groupRows(r.json);
                    if (rows == null || rows.length() == 0) break;
                    long next = ingest(chatId, rows, true);
                    if (rows.length() < 100 || next <= cursor) break;
                    cursor = next;
                }
            }
            retryUndecrypted(chatId);
        }
        topUpGroupKeys(chatId);
    }

    /** Stores rows ascending by id; decrypts each NEW incoming row exactly once. Returns the highest id seen. */
    private long ingest(long chatId, JSONArray rows, boolean advanceCursor) throws Exception {
        NecpraDb.ChatDao d = dao();
        NecpraDb.Conv conv = d.conv(chatId);
        long peer = conv == null ? 0 : conv.peerId;
        final boolean group = conv != null && "group".equals(conv.type);
        long me = me();
        List<JSONObject> list = new ArrayList<>();
        for (int i = 0; i < rows.length(); i++) { JSONObject o = rows.optJSONObject(i); if (o != null && o.optLong("id") > 0) list.add(o); }
        Collections.sort(list, (a, b) -> Long.compare(a.optLong("id"), b.optLong("id")));
        NecpraE2E engine = null;
        long maxId = 0; List<Long> delivered = new ArrayList<>();

        for (JSONObject row : list) {
            long sid = row.optLong("id"); maxId = Math.max(maxId, sid);
            long sender = row.optLong("senderId");
            boolean mine = sender == me;
            String cid = str(row, "clientMessageId"); if (cid == null || cid.isEmpty()) cid = "srv-" + sid;
            NecpraDb.Msg m = d.byServer(chatId, sid);
            if (m == null) m = d.byClient(sender, cid);
            boolean isNew = m == null;
            if (isNew) {
                m = new NecpraDb.Msg();
                m.chatId = chatId; m.senderId = sender; m.mine = mine; m.clientMessageId = cid; m.serverId = sid;
                String content = str(row, "content");
                String type = str(row, "type"); m.type = type == null ? "text" : type;
                if (content == null) { m.cryptoState = CS_PLAIN; }
                else if (group && NecpraGroupE2E.isEnvelope(content)) {
                    try {
                        m.body = seal(groupEngine().decrypt(chatId, content));
                        m.cryptoState = CS_OK;
                    } catch (NecpraGroupE2E.KeyUnavailable u) {
                        m.cryptoState = CS_FAILED; m.lastError = "Waiting for the group key";
                        m.envelope = seal(content);        // kept so retryUndecrypted can try again once the key arrives
                    } catch (Exception e) {
                        if (e instanceof IllegalStateException && String.valueOf(e.getMessage()).contains("not provisioned")) throw e;
                        m.cryptoState = mine ? CS_OWN_UNAVAILABLE : CS_FAILED; m.lastError = "Could not decrypt on this device";
                    }
                }
                else if (NecpraE2E.looksEncrypted(content)) {
                    if (mine) { m.cryptoState = CS_OWN_UNAVAILABLE; }
                    else {
                        try {
                            if (engine == null) engine = NecpraE2EStore.engine(app);
                            m.body = seal(engine.decrypt(content, String.valueOf(sender), false));
                            m.cryptoState = CS_OK;
                        } catch (NecpraE2E.Unsupported u) { m.cryptoState = CS_UNSUPPORTED; }
                        catch (Exception e) {
                            if (e instanceof IllegalStateException && String.valueOf(e.getMessage()).contains("not provisioned")) throw e;
                            m.cryptoState = CS_FAILED; m.lastError = "Could not decrypt on this device";
                        }
                    }
                } else { m.body = seal(content); m.cryptoState = CS_PLAIN; }
            }
            if (m.serverId == 0) m.serverId = sid;
            if (group && (m.senderName == null || m.senderName.isEmpty())) m.senderName = groupSenderName(row);
            long ts = parseIso(str(row, "createdAt")); if (ts == 0) ts = parseIso(str(row, "sentAt"));
            if (ts > 0) m.sortTs = ts; else if (m.sortTs == 0) m.sortTs = System.currentTimeMillis();
            if (isNew && !mine && System.currentTimeMillis() - m.sortTs < 48L * 3600_000L) delivered.add(sid);   // only fresh messages need a delivery ack
            m.replyToServerId = row.optLong("replyToId", 0);
            if (group && m.replyToServerId == 0) {
                JSONObject gm = row.optJSONObject("metadata"), rt = gm == null ? null : gm.optJSONObject("replyTo");
                if (rt != null) m.replyToServerId = rt.optLong("id", 0);
            }
            m.deleted = row.optBoolean("isDeleted", false);
            m.edited = row.optBoolean("isEdited", false);
            if (mine) {
                int st = statusOf(row);
                m.status = Math.max((m.status == ST_QUEUED || m.status == ST_FAILED) ? ST_SENT : m.status, st);
                m.envelope = null;
            } else m.status = ST_READ;

            if (isNew) m.localId = d.insertMsg(m); else d.updateMsg(m);

            // children
            JSONObject meta = row.optJSONObject("metadata");
            Map<String, String> keepLocal = new HashMap<>();
            for (NecpraDb.Att o : d.attsOf(m.localId)) if (o.localPath != null && o.url != null) keepLocal.put(o.url, o.localPath);
            d.delAtts(m.localId);
            List<NecpraDb.Att> atts = attachmentsOf(m.localId, row, meta, open(m.body));
            for (NecpraDb.Att a : atts) { String lp = keepLocal.get(a.url); if (lp != null && new File(lp).exists()) a.localPath = lp; }
            if (!atts.isEmpty()) d.insertAtts(atts);
            d.delReacts(m.localId);
            List<NecpraDb.React> rs = reactionsOf(m.localId, row.optJSONObject("reactions"), meta);
            if (!rs.isEmpty()) d.insertReacts(rs);
            if (mine && peer > 0) {
                List<NecpraDb.Receipt> rc = new ArrayList<>();
                long dAt = parseIso(str(row, "deliveredAt")), rAt = parseIso(str(row, "readAt"));
                if (m.status >= ST_DELIVERED) rc.add(receipt(m.localId, peer, "delivered", dAt > 0 ? dAt : m.sortTs));
                if (m.status >= ST_READ) rc.add(receipt(m.localId, peer, "read", rAt > 0 ? rAt : m.sortTs));
                if (!rc.isEmpty()) d.insertReceipts(rc);
            }
        }
        if (advanceCursor && maxId > 0) {
            NecpraDb.Conv c2 = d.conv(chatId);
            if (c2 != null && maxId > c2.syncCursor) d.setCursor(chatId, maxId);
        }
        refreshPreview(chatId);
        fireMessages(chatId);
        fireConversations();
        final List<Long> toAck = delivered;
        final long ackChat = chatId;
        if (!toAck.isEmpty()) io.execute(() -> {
            int n = 0;
            for (long id : toAck) {
                if (n++ >= 30) break;
                try { request("POST", group ? "/api/group-messages/" + ackChat + "/messages/" + id + "/delivered" : "/api/messages/" + id + "/delivered", new JSONObject()); } catch (Exception ignored) { }
            }
        });
        return maxId;
    }

    private static NecpraDb.Receipt receipt(long localId, long user, String kind, long at) {
        NecpraDb.Receipt r = new NecpraDb.Receipt(); r.messageLocalId = localId; r.userId = user; r.kind = kind; r.at = at; return r;
    }

    private static int statusOf(JSONObject row) {
        String s = str(row, "status"); int st = ST_SENT;
        if ("delivered".equalsIgnoreCase(s)) st = ST_DELIVERED; else if ("read".equalsIgnoreCase(s)) st = ST_READ;
        if (!row.isNull("readAt")) st = ST_READ; else if (!row.isNull("deliveredAt") && st < ST_DELIVERED) st = ST_DELIVERED;
        return st;
    }

    private List<NecpraDb.React> reactionsOf(long localId, JSONObject col, JSONObject meta) {
        Map<String, String> byUser = new HashMap<>();
        for (JSONObject src : new JSONObject[]{col, meta == null ? null : meta.optJSONObject("reactions")}) {
            if (src == null) continue;
            for (java.util.Iterator<String> it = src.keys(); it.hasNext(); ) {
                String k = it.next();
                JSONArray ids = src.optJSONArray(k);
                if (ids != null) {                           // group rows: {"emoji": [userId, ...]} (Message.addReaction)
                    for (int i = 0; i < ids.length(); i++) { long uid = ids.optLong(i, 0); if (uid > 0) byUser.put(String.valueOf(uid), k); }
                    continue;
                }
                String v = str(src, k);                      // direct rows: {"userId": "emoji"}
                if (v != null && !v.isEmpty()) byUser.put(k, v);
            }
        }
        List<NecpraDb.React> out = new ArrayList<>();
        for (Map.Entry<String, String> e : byUser.entrySet()) {
            try { NecpraDb.React r = new NecpraDb.React(); r.messageLocalId = localId; r.userId = Long.parseLong(e.getKey()); r.emoji = e.getValue(); out.add(r); } catch (NumberFormatException ignored) { }
        }
        return out;
    }

    private List<NecpraDb.Att> attachmentsOf(long localId, JSONObject row, JSONObject meta, String plain) {
        List<NecpraDb.Att> out = new ArrayList<>();
        String type = str(row, "type");
        if (type == null || "text".equals(type) || "system".equals(type)) return out;
        JSONArray arr = meta == null ? null : meta.optJSONArray("attachments");
        if (arr == null && meta != null) { JSONArray f = meta.optJSONArray("files"); if (f != null) arr = f; }
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) { NecpraDb.Att a = attFrom(localId, type, arr.optJSONObject(i)); if (a != null) out.add(a); }
        } else {
            // The web client (message-client.js sendMessage) sends ONE attachment as metadata.attachment — the key this
            // method used to miss, which is why files/images from web users never showed up natively.
            NecpraDb.Att a = meta == null ? null : attFrom(localId, type, meta.optJSONObject("attachment"));
            if (a == null) a = attFrom(localId, type, meta);
            if (a == null && plain != null && plain.trim().startsWith("{")) { try { a = attFrom(localId, type, new JSONObject(plain)); } catch (Exception ignored) { } }
            if (a == null) { String c = str(row, "content"); if (c != null && c.startsWith("https://")) { JSONObject o = new JSONObject(); try { o.put("url", c); } catch (Exception ignored) { } a = attFrom(localId, type, o); } }
            if (a != null) out.add(a);
        }
        return out;
    }

    private static NecpraDb.Att attFrom(long localId, String type, JSONObject o) {
        if (o == null) return null;
        String url = null;
        for (String k : new String[]{"url", "fileUrl", "mediaUrl", "secure_url", "src"}) { url = str(o, k); if (url != null && !url.isEmpty()) break; }
        if (url == null || url.isEmpty()) return null;
        NecpraDb.Att a = new NecpraDb.Att();
        a.messageLocalId = localId; a.url = url; a.kind = type;
        a.name = str(o, "fileName") != null ? str(o, "fileName") : (str(o, "originalName") != null ? str(o, "originalName") : str(o, "name"));
        a.mime = str(o, "mimeType") != null ? str(o, "mimeType") : str(o, "mime");
        a.size = o.optLong("size", o.optLong("fileSize", 0));
        a.encrypted = o.optBoolean("encrypted", false);
        return a;
    }

    private void refreshPreview(long chatId) {
        NecpraDb.ChatDao d = dao();
        NecpraDb.Msg newest = d.newest(chatId);
        if (newest != null) d.setPreview(chatId, previewOf(newest), newest.sortTs);
    }

    // ------------------------------------------------------------------ read state, drafts, reactions

    void markRead(long chatId) {
        try {
            dao().clearUnread(chatId);
            fireConversations();
            if (isGroup(chatId)) {                         // groups track reads per message
                if (!groupsOn()) return;
                JSONArray ids = new JSONArray();
                for (NecpraDb.Msg m : dao().recentIncoming(chatId, 30)) ids.put(m.serverId);
                if (ids.length() > 0) request("POST", "/api/group-messages/" + chatId + "/read", new JSONObject().put("messageIds", ids));
                return;
            }
            request("POST", "/api/messages/read", new JSONObject().put("chatId", chatId));
        } catch (NativeBackgroundSync.SessionExpiredException e) {
            fireNotice("Session expired", true);
        } catch (Exception ignored) { }
    }

    String loadDraft(long chatId) { NecpraDb.Draft x = dao().draft(chatId); return x == null ? "" : open(x.text); }

    void saveDraft(long chatId, String text) {
        if (text == null || text.trim().isEmpty()) { dao().delDraft(chatId); return; }
        NecpraDb.Draft x = new NecpraDb.Draft(); x.chatId = chatId; x.text = seal(text); x.updatedAt = System.currentTimeMillis();
        dao().putDraft(x);
    }

    /** Toggles the caller's reaction (same emoji again removes it). Server first, then the local row. */
    void react(long localId, String emoji) throws Exception {
        NecpraDb.ChatDao d = dao();
        NecpraDb.Msg m = d.byLocal(localId);
        if (m == null || m.serverId <= 0) return;
        long me = me();
        boolean had = false;
        for (NecpraDb.React r : d.reactsFor(Collections.singletonList(localId))) if (r.userId == me && emoji.equals(r.emoji)) had = true;
        Resp r;
        if (isGroup(m.chatId)) {
            String base = "/api/group-admin/" + m.chatId + "/messages/" + m.serverId + "/reaction";
            r = had ? request("DELETE", base + "?reaction=" + java.net.URLEncoder.encode(emoji, "UTF-8"), null)
                    : request("POST", base, new JSONObject().put("reaction", emoji));
        } else {
            r = had ? request("DELETE", "/api/messages/" + m.serverId + "/react", null)
                    : request("POST", "/api/messages/" + m.serverId + "/react", new JSONObject().put("emoji", emoji));
        }
        if (!r.ok()) throw new IOException(r.message());
        List<NecpraDb.React> all = new ArrayList<>();
        for (NecpraDb.React x : d.reactsFor(Collections.singletonList(localId))) if (x.userId != me) all.add(x);
        if (!had) { NecpraDb.React n = new NecpraDb.React(); n.messageLocalId = localId; n.userId = me; n.emoji = emoji; all.add(n); }
        d.delReacts(localId);
        for (NecpraDb.React x : all) x.id = 0;
        if (!all.isEmpty()) d.insertReacts(all);
        fireMessages(m.chatId);
    }

    // ------------------------------------------------------------------ sending

    private String newClientId() {
        byte[] b = new byte[10]; rnd.nextBytes(b);
        StringBuilder sb = new StringBuilder("n").append(Long.toString(System.currentTimeMillis(), 36)).append('-');
        for (byte x : b) sb.append(String.format(Locale.US, "%02x", x));
        return sb.toString();   // < 64 chars, unique per send
    }

    /** Saves the plaintext locally, shows the bubble immediately, and queues the send. Safe to call on the UI thread. */
    void send(long chatId, String text, long replyToServerId) {
        final String clean = text == null ? "" : text.trim();
        if (clean.isEmpty()) return;
        io.execute(() -> { enqueue(chatId, "text", clean, replyToServerId); drainAsync(); });
    }

    /** Blocking: insert the queued row (plaintext kept locally, own messages can never be decrypted again). */
    private long enqueue(long chatId, String type, String text, long replyToServerId) {
        final String capped = text.length() > MAX_TEXT ? text.substring(0, MAX_TEXT) : text;
        NecpraDb.ChatDao d = dao();
        NecpraDb.Msg m = new NecpraDb.Msg();
        m.chatId = chatId; m.senderId = me(); m.mine = true; m.type = type == null ? "text" : type;
        m.clientMessageId = newClientId();
        m.body = seal(capped);
        m.status = ST_QUEUED; m.cryptoState = CS_OK; m.sortTs = System.currentTimeMillis();
        m.replyToServerId = replyToServerId;
        m.localId = d.insertMsg(m);
        d.delDraft(chatId);
        refreshPreview(chatId);
        fireMessages(chatId); fireConversations();
        return m.localId;
    }

    /** Blocking send for callers that must finish before the process may be killed (notification reply). */
    boolean sendNow(long chatId, String text) throws Exception {
        final String clean = text == null ? "" : text.trim();
        if (clean.isEmpty() || chatId <= 0) return false;
        enqueue(chatId, "text", clean, 0);
        drain();
        return true;
    }

    /** Status reaction/comment for a creator: same encrypted pipeline as a chat message (type status_reply). */
    boolean sendStatusInteraction(long peerId, String interactionJson) throws Exception {
        if (peerId <= 0 || interactionJson == null || interactionJson.isEmpty()) return false;
        long chatId = resolveDirectChat(peerId, null, null);
        enqueue(chatId, "status_reply", interactionJson, 0);
        drain();
        return true;
    }

    /** Resolve the chat id a notification refers to ("123" or the "u<senderId>" fallback). */
    long chatIdForNotification(String id) throws Exception {
        if (id == null) return 0;
        if (id.matches("^[0-9]+$")) return Long.parseLong(id);
        if (id.startsWith("u") && id.substring(1).matches("^[0-9]+$")) return resolveDirectChat(Long.parseLong(id.substring(1)), null, null);
        return 0;
    }

    /**
     * Notification preview for a pushed DM, decrypted natively. Runs the normal catch-up so the message is
     * ingested (and its ratchet key consumed) exactly once, then reads the stored plaintext.
     * @return {title, text} or null when the generic server preview should be used.
     */
    String[] pushPreview(long chatId, long messageId) {
        if (chatId <= 0 || !ready()) return null;
        try {
            NecpraDb.Conv conv = dao().conv(chatId);
            if (conv == null) { refreshConversations(); conv = dao().conv(chatId); }
            if (conv == null || !"direct".equals(conv.type)) return null;
            syncChat(chatId);
            NecpraDb.Msg m = messageId > 0 ? dao().byServer(chatId, messageId) : dao().newest(chatId);
            if (m == null || m.mine) return null;
            String text;
            if (!"text".equals(m.type)) text = labelForType(m.type);
            else if (m.cryptoState == CS_OK || m.cryptoState == CS_PLAIN) text = open(m.body);
            else text = null;
            if (text == null || text.isEmpty()) return null;
            conv = dao().conv(chatId);
            return new String[]{conv == null ? null : conv.title, text.length() > 300 ? text.substring(0, 300) : text};
        } catch (Throwable t) { return null; }
    }

    /** A socket event said this chat changed: catch up through the single ingest path. chatId 0 = refresh the list. */
    void onRealtimeChat(final long chatId) {
        if (!ready()) return;
        io.execute(() -> {
            try {
                if (chatId <= 0 || dao().conv(chatId) == null) { refreshConversations(); if (chatId <= 0) return; }
                syncChat(chatId);
                refreshRecent(chatId);
            } catch (Exception ignored) { }
        });
    }

    /** Failed -> queued again (same clientMessageId, same ciphertext if one was already made). */
    void retry(long localId) {
        io.execute(() -> {
            NecpraDb.Msg m = dao().byLocal(localId);
            if (m == null || m.status != ST_FAILED) return;
            m.status = ST_QUEUED; m.lastError = null; dao().updateMsg(m);
            fireMessages(m.chatId);
            drainAsync();
        });
    }

    void drainAsync() { sender.execute(() -> { try { drain(); } catch (Exception ignored) { } }); }

    /** @return true when nothing is left to send (or what's left needs the user), false when a retry should be scheduled. */
    boolean drain() throws Exception {
        synchronized (drainLock) {
            NecpraDb.ChatDao d = dao();
            List<NecpraDb.Msg> q = d.queued();
            if (q.isEmpty()) return true;
            if (!ready()) { fireNotice("Secure messaging isn't set up on this device yet", false); return true; }
            boolean retryLater = false;
            for (NecpraDb.Msg m : q) {
                NecpraDb.Conv conv = d.conv(m.chatId);
                long peer = conv == null ? 0 : conv.peerId;
                try {
                    if (conv != null && "group".equals(conv.type)) {
                        if (sendGroupMessage(m)) { retryLater = true; break; }   // keep order: later messages wait behind this one
                        continue;
                    }
                    if (peer <= 0) { fail(m, "This chat can't be sent from the native screen"); continue; }
                    String mType = m.type == null || m.type.isEmpty() ? "text" : m.type;
                    boolean media = isMediaType(mType);
                    JSONObject attMeta = media ? uploadPending(m, peer) : null;   // file first; its URL is stored so a retry never re-uploads
                    if (m.envelope == null) {
                        String plain = open(m.body);
                        if (plain == null && !media) { fail(m, "Message text is no longer available"); continue; }
                        if (plain != null) {               // media without a caption has no text to encrypt
                            String env = NecpraE2EStore.engine(app).encrypt(plain, String.valueOf(peer));
                            m.envelope = seal(env);
                            d.updateMsg(m);                // ciphertext is persisted BEFORE the POST: retries resend the same envelope
                        }
                    }
                    String sealed = m.envelope == null ? null : open(m.envelope);
                    JSONObject body = new JSONObject().put("chatId", m.chatId).put("receiverId", peer)
                            .put("content", sealed == null ? "" : sealed).put("type", mType).put("clientMessageId", m.clientMessageId);
                    if (attMeta != null) body.put("metadata", new JSONObject().put("attachment", attMeta));
                    if ("status_reply".equals(mType)) {
                        try {
                            JSONObject it = new JSONObject(open(m.body));
                            body.put("metadata", new JSONObject().put("statusInteraction", it)
                                    .put("statusId", it.opt("statusId")).put("statusType", it.opt("statusType")).put("kind", it.opt("kind")));
                        } catch (Exception ignored) { }
                    }
                    if (m.replyToServerId > 0) body.put("replyToId", m.replyToServerId);
                    Resp r = request("POST", "/api/messages", body);
                    if (r.ok()) {
                        JSONObject data = r.json.optJSONObject("data");
                        m.serverId = data == null ? 0 : data.optLong("id");
                        long ts = data == null ? 0 : parseIso(str(data, "createdAt"));
                        if (ts > 0) m.sortTs = ts;
                        m.status = ST_SENT; m.envelope = null; m.lastError = null;
                        d.updateMsg(m);
                        refreshPreview(m.chatId);
                        fireMessages(m.chatId); fireConversations();
                    } else if (r.status == 408 || r.status == 425 || r.status == 429 || r.status >= 500) {
                        m.attempts++; m.lastError = "Server busy, will retry"; d.updateMsg(m);
                        retryLater = true; break;           // keep order: don't send later messages ahead of this one
                    } else {
                        fail(m, r.message());
                    }
                } catch (NativeBackgroundSync.SessionExpiredException e) {
                    fireNotice("Session expired", true); return true;
                } catch (IOException offline) {
                    m.attempts++; m.lastError = "Waiting for network"; d.updateMsg(m);
                    retryLater = true; break;
                } catch (AttachmentException e) {
                    fail(m, e.getMessage());
                } catch (NecpraGroupE2E.ApiException e) {
                    if (e.status == 408 || e.status == 425 || e.status == 429 || e.status >= 500) { m.attempts++; m.lastError = "Server busy, will retry"; d.updateMsg(m); retryLater = true; break; }
                    fail(m, e.getMessage());
                } catch (IllegalStateException e) {
                    String msg = e.getMessage() == null ? "Could not encrypt message" : e.getMessage();
                    if (msg.contains("not provisioned")) { fireNotice("Secure messaging isn't set up on this device yet", false); return true; }
                    fail(m, msg.contains("no public key") ? "This contact hasn't set up secure messaging yet" : msg);
                } catch (Exception e) {
                    fail(m, "Could not encrypt message");
                }
            }
            if (retryLater) scheduleRetry();
            return !retryLater;
        }
    }

    /**
     * Sends one queued group message: encrypt with this member's sender key (made + distributed on first use), then POST the
     * envelope. The envelope is persisted before the POST so a retry resends the same ciphertext (one chain step per message).
     * @return true when the send should be retried later (offline-ish server answer or an epoch change mid-flight).
     */
    private boolean sendGroupMessage(NecpraDb.Msg m) throws Exception {
        NecpraDb.ChatDao d = dao();
        if (!groupsOn()) { fail(m, "Group messages can't be sent from the native screen"); return false; }
        String mType = m.type == null || m.type.isEmpty() ? "text" : m.type;
        if (isMediaType(mType)) { fail(m, "Sending files to a group isn't available in the native screen yet"); return false; }
        if (m.envelope == null) {
            String plain = open(m.body);
            if (plain == null) { fail(m, "Message text is no longer available"); return false; }
            m.envelope = seal(groupEngine().encrypt(m.chatId, plain));
            d.updateMsg(m);
        }
        JSONObject meta = new JSONObject().put("groupId", m.chatId);
        if (m.replyToServerId > 0) meta.put("replyTo", new JSONObject().put("id", m.replyToServerId));
        JSONObject body = new JSONObject().put("chatId", m.chatId).put("content", open(m.envelope)).put("type", mType)
                .put("clientMessageId", m.clientMessageId).put("metadata", meta);
        Resp r = request("POST", "/api/group-messages/" + m.chatId + "/messages", body);
        if (r.ok()) {
            JSONObject data = r.json == null ? null : r.json.optJSONObject("data");
            JSONObject msg = data == null ? null : (data.optJSONObject("message") != null ? data.optJSONObject("message") : data);
            m.serverId = msg == null ? 0 : msg.optLong("id");
            long ts = msg == null ? 0 : parseIso(str(msg, "createdAt"));
            if (ts > 0) m.sortTs = ts;
            m.status = ST_SENT; m.envelope = null; m.lastError = null;
            d.updateMsg(m);
            refreshPreview(m.chatId);
            fireMessages(m.chatId); fireConversations();
            return false;
        }
        String code = r.json == null ? null : r.json.optString("code", null);
        if (r.status == 409 && code != null && code.startsWith("GROUP_SENDER_KEY")) {
            // Membership changed between encrypting and sending (new epoch): the old ciphertext is useless. Encrypt again next round.
            m.attempts++;
            if (m.attempts > 5) { fail(m, "The group's encryption keys are still updating. Try again."); return false; }
            m.envelope = null; m.lastError = "Updating group keys"; d.updateMsg(m);
            return true;
        }
        if (r.status == 408 || r.status == 425 || r.status == 429 || r.status >= 500) { m.attempts++; m.lastError = "Server busy, will retry"; d.updateMsg(m); return true; }
        fail(m, r.message());
        return false;
    }

    private void fail(NecpraDb.Msg m, String why) {
        m.status = ST_FAILED; m.lastError = why; dao().updateMsg(m);
        fireMessages(m.chatId);
    }

    private void scheduleRetry() {
        try {
            OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(SendWorker.class)
                    .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                    .build();
            WorkManager.getInstance(app).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, req);
        } catch (Throwable ignored) { }
    }

    // ------------------------------------------------------------------ attachments

    /**
     * false  = files are uploaded as-is, exactly like the web client does today (message-client.js uploads the raw file and
     *          its own comment says attachment encryption is not wired). Web users can open them.
     * true   = files are encrypted first (NecpraE2E#encryptAttachment, same format as the web's encryptAttachment) and the
     *          message metadata says {encrypted:true}. Flip this ONLY after the web client decrypts on display, otherwise
     *          web users see an undecodable file. Receiving encrypted files works regardless of this flag.
     */
    static final boolean ENCRYPT_OUTGOING_ATTACHMENTS = false;

    static final long MAX_UPLOAD_BYTES = 50L * 1024 * 1024;   // server default MAX_UPLOAD_SIZE

    /** Same whitelist as routes/files.js; anything else is rejected there, so reject it here with a readable reason. */
    private static final java.util.Set<String> UPLOAD_MIMES = new java.util.HashSet<>(java.util.Arrays.asList(
            "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif", "image/jpg",
            "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm", "audio/aac", "audio/mp3", "audio/x-m4a", "audio/3gpp",
            "video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/3gpp",
            "application/pdf", "application/msword", "text/plain", "text/csv", "application/rtf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"));

    /** A problem the user can read (unsupported type, too big, rejected by the server). Not retried. */
    static final class AttachmentException extends Exception { AttachmentException(String m) { super(m); } }

    static boolean isMediaType(String t) { return "image".equals(t) || "video".equals(t) || "audio".equals(t) || "file".equals(t); }

    private static String kindForMime(String mime) {
        if (mime == null) return "file";
        if (mime.startsWith("image/")) return "image";
        if (mime.startsWith("video/")) return "video";
        if (mime.startsWith("audio/")) return "audio";
        return "file";
    }

    private static String extOf(String name) {
        if (name == null) return "";
        int i = name.lastIndexOf('.');
        if (i < 0 || name.length() - i > 8) return "";
        return name.substring(i).replaceAll("[^A-Za-z0-9.]", "");
    }

    /**
     * Copies a picked file into app storage and queues it. Blocking (file copy): call off the UI thread.
     * The copy is what gets uploaded, so the send survives the picker's temporary permission, a process kill and offline time.
     */
    void sendAttachment(long chatId, Uri uri, String caption, long replyToServerId) throws Exception {
        if (chatId <= 0 || uri == null) return;
        android.content.ContentResolver cr = app.getContentResolver();
        String name = null; long declared = -1;
        try (Cursor c = cr.query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME), si = c.getColumnIndex(OpenableColumns.SIZE);
                if (ni >= 0 && !c.isNull(ni)) name = c.getString(ni);
                if (si >= 0 && !c.isNull(si)) declared = c.getLong(si);
            }
        }
        String mime = cr.getType(uri);
        if (mime == null || "application/octet-stream".equals(mime)) {
            String ext = extOf(name).replace(".", "").toLowerCase(Locale.US);
            String guess = ext.isEmpty() ? null : android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (guess != null) mime = guess;
        }
        if (mime == null || !UPLOAD_MIMES.contains(mime.toLowerCase(Locale.US))) throw new AttachmentException("This file type can't be sent");
        mime = mime.toLowerCase(Locale.US);
        long limit = ENCRYPT_OUTGOING_ATTACHMENTS ? NecpraAttachmentCrypto.MAX_ENCRYPTED_BYTES : MAX_UPLOAD_BYTES;
        if (declared > limit) throw new AttachmentException("File is too large (max " + (limit / (1024 * 1024)) + " MB)");
        if (name == null || name.isEmpty()) name = "file" + (mime.contains("/") ? "." + mime.substring(mime.indexOf('/') + 1) : "");

        File dir = new File(app.getFilesDir(), "outbox"); dir.mkdirs();
        File out = new File(dir, newClientId() + extOf(name));
        long total = 0;
        try (InputStream in = cr.openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
            if (in == null) throw new AttachmentException("Couldn't read that file");
            byte[] buf = new byte[16 * 1024]; int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > limit) { os.close(); out.delete(); throw new AttachmentException("File is too large (max " + (limit / (1024 * 1024)) + " MB)"); }
                os.write(buf, 0, n);
            }
        } catch (AttachmentException e) { throw e; }
        catch (Exception e) { out.delete(); throw new AttachmentException("Couldn't read that file"); }

        String kind = kindForMime(mime);
        String cap = caption == null ? "" : caption.trim();
        if (cap.length() > MAX_TEXT) cap = cap.substring(0, MAX_TEXT);
        NecpraDb.ChatDao d = dao();
        NecpraDb.Msg m = new NecpraDb.Msg();
        m.chatId = chatId; m.senderId = me(); m.mine = true; m.type = kind;
        m.clientMessageId = newClientId();
        m.body = cap.isEmpty() ? null : seal(cap);
        m.status = ST_QUEUED; m.cryptoState = CS_OK; m.sortTs = System.currentTimeMillis();
        m.replyToServerId = replyToServerId;
        m.localId = d.insertMsg(m);
        NecpraDb.Att a = new NecpraDb.Att();
        a.messageLocalId = m.localId; a.kind = kind; a.url = Uri.fromFile(out).toString(); a.localPath = out.getAbsolutePath();
        a.name = name; a.mime = mime; a.size = total;
        d.insertAtts(Collections.singletonList(a));
        d.delDraft(chatId);
        refreshPreview(chatId);
        fireMessages(chatId); fireConversations();
        drainAsync();
    }

    /**
     * Makes sure the first attachment of a queued message is on the server and returns the {@code metadata.attachment}
     * object the web client expects ({url, type, mimeType, size, originalName}). The uploaded URL is saved on the row as
     * soon as it exists, so a retry after a failed POST skips the upload.
     */
    private JSONObject uploadPending(NecpraDb.Msg m, long peer) throws Exception {
        NecpraDb.ChatDao d = dao();
        List<NecpraDb.Att> atts = d.attsOf(m.localId);
        if (atts.isEmpty()) return null;
        NecpraDb.Att a = atts.get(0);
        if (a.url == null || !a.url.startsWith("https://")) {
            File src = a.localPath == null ? null : new File(a.localPath);
            if (src == null || !src.exists()) throw new AttachmentException("The file is no longer available");
            JSONObject up;
            if (ENCRYPT_OUTGOING_ATTACHMENTS) {
                byte[] plain = readAll(src, NecpraAttachmentCrypto.MAX_ENCRYPTED_BYTES);
                JSONObject env = NecpraE2EStore.engine(app).encryptAttachment(plain, String.valueOf(peer));
                File tmp = new File(app.getCacheDir(), "enc-" + newClientId() + ".enc");
                try {
                    try (OutputStream os = new FileOutputStream(tmp)) { os.write(env.toString().getBytes(StandardCharsets.UTF_8)); }
                    up = uploadFile(tmp, "text/plain", newClientId() + ".enc");   // text/plain is on the server whitelist; octet-stream is not
                } finally { tmp.delete(); }
                a.encrypted = true;
            } else {
                up = uploadFile(src, a.mime, a.name);
            }
            String url = str(up, "url");
            if (url == null || !url.startsWith("https://")) throw new AttachmentException("Upload failed (the server returned an unsafe address)");
            a.url = url;
            d.updateAtt(a);
        }
        JSONObject meta = new JSONObject().put("url", a.url).put("type", a.kind).put("mimeType", a.mime)
                .put("size", a.size).put("originalName", a.name == null ? "file" : a.name);
        if (a.encrypted) meta.put("encrypted", true);
        return meta;
    }

    private static byte[] readAll(File f, long cap) throws IOException {
        if (f.length() > cap) throw new IOException("too large");
        try (InputStream in = new java.io.FileInputStream(f)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream((int) Math.max(32, f.length()));
            byte[] buf = new byte[16 * 1024]; int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toByteArray();
        }
    }

    /** POST /api/files/upload (multipart, streamed from disk). Same auth + single-refresh path as {@link #request}. */
    private JSONObject uploadFile(File f, String mime, String filename) throws Exception {
        String boundary = "----necpra" + Long.toHexString(rnd.nextLong() & Long.MAX_VALUE);
        String safeName = (filename == null ? "file" : filename).replaceAll("[\\r\\n\"\\\\]", "_");
        byte[] head = ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + safeName + "\"\r\nContent-Type: "
                + (mime == null ? "application/octet-stream" : mime) + "\r\n\r\n").getBytes(StandardCharsets.UTF_8);
        byte[] tail = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
        boolean retried = false;
        while (true) {
            SharedPreferences auth = app.getSharedPreferences(NativeBackgroundSync.AUTH_PREFS, Context.MODE_PRIVATE);
            String access = NativeBackgroundSync.getDecrypted(auth, "accessToken");
            if (access == null || access.isEmpty()) access = NativeBackgroundSync.refreshSession(app);
            HttpURLConnection h = null; int status; String text;
            try {
                h = (HttpURLConnection) new URL(NativeBackgroundSync.backendOrigin(app) + "/api/files/upload").openConnection();
                h.setRequestMethod("POST"); h.setConnectTimeout(15000); h.setReadTimeout(120000); h.setUseCaches(false);
                h.setRequestProperty("Accept", "application/json");
                h.setRequestProperty("Authorization", "Bearer " + access);
                h.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                h.setDoOutput(true);
                h.setFixedLengthStreamingMode(head.length + f.length() + tail.length);
                try (OutputStream os = h.getOutputStream(); InputStream in = new java.io.FileInputStream(f)) {
                    os.write(head);
                    byte[] buf = new byte[16 * 1024]; int n;
                    while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                    os.write(tail); os.flush();
                }
                status = h.getResponseCode();
                text = NativeBackgroundSync.readText(status >= 200 && status < 400 ? h.getInputStream() : h.getErrorStream());
            } finally { if (h != null) h.disconnect(); }
            if (status == 401) {
                if (retried) throw new NativeBackgroundSync.SessionExpiredException("Unauthorized after refresh");
                retried = true; NativeBackgroundSync.refreshSession(app); continue;
            }
            JSONObject json = null;
            try { json = new JSONObject(text == null || text.trim().isEmpty() ? "{}" : text); } catch (Exception ignored) { }
            if (status >= 200 && status < 300 && json != null) { JSONObject data = json.optJSONObject("data"); return data != null ? data : json; }
            if (status == 408 || status == 425 || status == 429 || status >= 500) throw new IOException("Upload busy, will retry");
            String why = json == null ? null : json.optString("message", null);
            if (status == 413) why = "File is too large";
            throw new AttachmentException(why == null || why.isEmpty() ? "Upload rejected (HTTP " + status + ")" : why);
        }
    }

    /**
     * Returns a plaintext local copy of an attachment, downloading (and, for encrypted ones, decrypting) it first.
     * Blocking: call off the UI thread. {@code peerId} is the other participant of the chat; {@code mine} says who sent it.
     */
    File fetchAttachment(NecpraDb.Att a, boolean mine, long peerId) throws Exception {
        if (a.localPath != null) { File f = new File(a.localPath); if (f.exists()) return f; }
        if (a.url == null || !a.url.startsWith("https://")) throw new IOException("Attachment not available");
        File dir = new File(app.getCacheDir(), "att"); dir.mkdirs();
        String ext = extOf(a.name);
        if (ext.isEmpty() && a.mime != null) { String e = android.webkit.MimeTypeMap.getSingleton().getExtensionFromMimeType(a.mime); if (e != null) ext = "." + e; }
        String key;
        try {
            byte[] dg = java.security.MessageDigest.getInstance("SHA-256").digest(a.url.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(); for (int i = 0; i < 12; i++) sb.append(String.format(Locale.US, "%02x", dg[i]));
            key = sb.toString();
        } catch (Exception e) { key = Integer.toHexString(a.url.hashCode()); }
        File dest = new File(dir, key + ext);
        if (dest.exists() && dest.length() > 0) { a.localPath = dest.getAbsolutePath(); dao().updateAtt(a); return dest; }

        File part = new File(dir, key + ".part");
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(a.url).openConnection();
            h.setConnectTimeout(15000); h.setReadTimeout(120000); h.setUseCaches(false);
            if (a.url.startsWith(NativeBackgroundSync.backendOrigin(app))) {     // our own origin may want the session; third-party CDNs never get it
                String access = NativeBackgroundSync.getDecrypted(app.getSharedPreferences(NativeBackgroundSync.AUTH_PREFS, Context.MODE_PRIVATE), "accessToken");
                if (access != null && !access.isEmpty()) h.setRequestProperty("Authorization", "Bearer " + access);
            }
            int st = h.getResponseCode();
            if (st < 200 || st >= 300) throw new IOException("HTTP " + st);
            long cap = a.encrypted ? NecpraAttachmentCrypto.MAX_ENCRYPTED_BYTES * 2L : MAX_UPLOAD_BYTES + 1024;
            long total = 0;
            try (InputStream in = h.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                byte[] buf = new byte[16 * 1024]; int n;
                while ((n = in.read(buf)) > 0) { total += n; if (total > cap) throw new IOException("Attachment too large"); os.write(buf, 0, n); }
            }
        } finally { if (h != null) h.disconnect(); }

        if (a.encrypted) {
            try {
                JSONObject env = new JSONObject(new String(readAll(part, NecpraAttachmentCrypto.MAX_ENCRYPTED_BYTES * 2L), StandardCharsets.UTF_8));
                byte[] plain = NecpraE2EStore.engine(app).decryptAttachment(env, String.valueOf(peerId), mine);
                try (OutputStream os = new FileOutputStream(dest)) { os.write(plain); }
            } catch (Exception e) { throw new IOException("Couldn't decrypt this attachment on this device"); }
            finally { part.delete(); }
        } else if (!part.renameTo(dest)) { part.delete(); throw new IOException("Couldn't store the attachment"); }

        a.localPath = dest.getAbsolutePath();
        dao().updateAtt(a);
        return dest;
    }

    // ------------------------------------------------------------------ edit, delete, block, unfriend

    static final long EDIT_WINDOW_MS = 15L * 60 * 1000;   // server: PATCH/PUT /api/messages/:id

    boolean canEdit(NecpraDb.Msg m) {
        return m.mine && m.serverId > 0 && "text".equals(m.type) && m.status != ST_FAILED && System.currentTimeMillis() - m.sortTs < EDIT_WINDOW_MS
                && (!isGroup(m.chatId) || groupsOn());   // group edits go out as PUT /api/group-messages/message/:id (a PATCH alias on the server)
    }

    /** Encrypts the new text (same ratchet as a new message) and PUTs it. The local text changes only after the server accepted it. */
    void editMessage(long localId, String newText) throws Exception {
        String clean = newText == null ? "" : newText.trim();
        if (clean.isEmpty()) throw new IOException("Message can't be empty");
        if (clean.length() > MAX_TEXT) clean = clean.substring(0, MAX_TEXT);
        NecpraDb.ChatDao d = dao();
        NecpraDb.Msg m = d.byLocal(localId);
        if (m == null || !canEdit(m)) throw new IOException("This message can no longer be edited");
        NecpraDb.Conv conv = d.conv(m.chatId);
        long peer = conv == null ? 0 : conv.peerId;
        Resp r;
        if (conv != null && "group".equals(conv.type)) {
            if (!groupsOn()) throw new IOException("Group messages can't be edited from the native screen");
            // Same sender key + chain as a new group message; the server accepts the PUT as an alias of its PATCH edit route.
            String env = groupEngine().encrypt(m.chatId, clean);
            r = request("PUT", "/api/group-messages/message/" + m.serverId, new JSONObject().put("content", env));
        } else {
            if (peer <= 0) throw new IOException("This chat can't be edited from the native screen");
            String env = NecpraE2EStore.engine(app).encrypt(clean, String.valueOf(peer));
            r = request("PUT", "/api/messages/" + m.serverId, new JSONObject().put("content", env));
        }
        if (!r.ok()) throw new IOException(r.message());
        m.body = seal(clean); m.edited = true;
        d.updateMsg(m);
        refreshPreview(m.chatId);
        fireMessages(m.chatId); fireConversations();
    }

    /** "Delete for me" or (own messages, server enforces its time window) "delete for everyone". */
    void deleteMessage(long localId, boolean forEveryone) throws Exception {
        NecpraDb.ChatDao d = dao();
        NecpraDb.Msg m = d.byLocal(localId);
        if (m == null) return;
        if (m.serverId > 0) {
            Resp r = request("DELETE", (isGroup(m.chatId) ? "/api/group-messages/message/" : "/api/messages/") + m.serverId + "?deleteForEveryone=" + (forEveryone && m.mine), null);
            if (!r.ok()) throw new IOException(r.message());
        } else {
            m.status = ST_FAILED;                    // never sent: make sure the queue can't send it after it was deleted
        }
        m.deleted = true; m.envelope = null;
        d.updateMsg(m);
        refreshPreview(m.chatId);
        fireMessages(m.chatId); fireConversations();
    }

    /** POST /api/profile/:id/block */
    void blockUser(long userId) throws Exception {
        Resp r = request("POST", "/api/profile/" + userId + "/block", new JSONObject());
        if (!r.ok()) throw new IOException(r.message());
    }

    /** DELETE /api/friends/:id */
    void unfriend(long userId) throws Exception {
        Resp r = request("DELETE", "/api/friends/" + userId, null);
        if (!r.ok()) throw new IOException(r.message());
    }

    /**
     * The /sync feed only ever returns messages NEWER than the cursor, so edits, deletions, receipts and reactions on messages
     * already on the device never arrive through it. This re-reads the newest page and applies exactly those changes to rows we
     * already have. It never creates rows (that stays the job of {@link #syncChat}) and decrypts an edit at most once.
     */
    void refreshRecent(long chatId) throws Exception {
        NecpraDb.ChatDao d = dao();
        NecpraDb.Conv conv = d.conv(chatId);
        final boolean group = conv != null && "group".equals(conv.type);
        if (group && !groupsOn()) return;
        if (!group && (conv == null || !"direct".equals(conv.type))) return;
        synchronized (lock(chatId)) {
            Resp r = request("GET", group ? "/api/group-messages/" + chatId + "/messages?limit=" + PAGE : "/api/messages/" + chatId + "?limit=" + PAGE, null);
            if (!r.ok()) throw new IOException(r.message());
            JSONArray rows = group ? groupRows(r.json) : (r.json == null ? null : r.json.optJSONArray("data"));
            if (rows == null || rows.length() == 0) return;
            long me = me(), peer = conv.peerId;
            java.util.Set<Long> seen = new java.util.HashSet<>();
            long minId = Long.MAX_VALUE, maxId = 0;
            NecpraE2E engine = null;
            boolean changed = false;
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i); if (row == null) continue;
                long sid = row.optLong("id"); if (sid <= 0) continue;
                seen.add(sid); minId = Math.min(minId, sid); maxId = Math.max(maxId, sid);
                NecpraDb.Msg m = d.byServer(chatId, sid);
                if (m == null) continue;
                boolean dirty = false;
                if (m.mine) {
                    int st = Math.max(m.status, statusOf(row));
                    if (st != m.status && m.status != ST_QUEUED && m.status != ST_FAILED) { m.status = st; dirty = true; }
                    if (peer > 0) {
                        List<NecpraDb.Receipt> rc = new ArrayList<>();
                        long dAt = parseIso(str(row, "deliveredAt")), rAt = parseIso(str(row, "readAt"));
                        if (m.status >= ST_DELIVERED) rc.add(receipt(m.localId, peer, "delivered", dAt > 0 ? dAt : m.sortTs));
                        if (m.status >= ST_READ) rc.add(receipt(m.localId, peer, "read", rAt > 0 ? rAt : m.sortTs));
                        if (!rc.isEmpty()) d.insertReceipts(rc);
                    }
                }
                boolean serverEdited = row.optBoolean("isEdited", false);
                if (serverEdited && !m.edited) {
                    String content = str(row, "content");
                    if (group && !m.mine && NecpraGroupE2E.isEnvelope(content)) {
                        try { m.body = seal(groupEngine().decrypt(chatId, content)); m.cryptoState = CS_OK; }
                        catch (Exception ignored) { /* keep the previous text */ }
                    } else if (!m.mine && content != null && NecpraE2E.looksEncrypted(content)) {
                        try {
                            if (engine == null) engine = NecpraE2EStore.engine(app);
                            m.body = seal(engine.decrypt(content, String.valueOf(m.senderId), false));
                            m.cryptoState = CS_OK;
                        } catch (Exception ignored) { /* keep the previous text; the edit is marked seen so it is not retried */ }
                    } else if (!m.mine && content != null && !NecpraE2E.looksEncrypted(content)) { m.body = seal(content); }
                    m.edited = true; dirty = true;      // our own edits already updated the local text when they were sent
                }
                if (dirty) { d.updateMsg(m); changed = true; }
                JSONObject meta = row.optJSONObject("metadata");
                List<NecpraDb.React> fresh = reactionsOf(m.localId, row.optJSONObject("reactions"), meta);
                List<NecpraDb.React> old = d.reactsFor(Collections.singletonList(m.localId));
                if (!sameReactions(old, fresh)) { d.delReacts(m.localId); if (!fresh.isEmpty()) d.insertReacts(fresh); changed = true; }
            }
            // The page holds the newest non-deleted messages. A local message inside that id range that the server no longer
            // lists was deleted (for everyone, or for this user on another device).
            long floor = rows.length() < PAGE ? 1 : minId;
            for (NecpraDb.Msg m : d.liveFrom(chatId, floor)) {
                if (m.serverId <= 0 || m.serverId > maxId || seen.contains(m.serverId)) continue;
                m.deleted = true; d.updateMsg(m); changed = true;
            }
            if (changed) { refreshPreview(chatId); fireMessages(chatId); fireConversations(); }
        }
    }

    private static boolean sameReactions(List<NecpraDb.React> a, List<NecpraDb.React> b) {
        if (a.size() != b.size()) return false;
        Map<Long, String> m = new HashMap<>();
        for (NecpraDb.React x : a) m.put(x.userId, x.emoji);
        for (NecpraDb.React x : b) if (!java.util.Objects.equals(m.get(x.userId), x.emoji)) return false;
        return true;
    }

    /** Runs the queue in the background (network back, app closed). */
    public static final class SendWorker extends Worker {
        public SendWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }
        @NonNull @Override public Result doWork() {
            try {
                NecpraMessageRepository r = NecpraMessageRepository.get(getApplicationContext());
                return r.drain() ? Result.success() : Result.retry();
            } catch (Exception e) { return Result.retry(); }
        }
    }
}
