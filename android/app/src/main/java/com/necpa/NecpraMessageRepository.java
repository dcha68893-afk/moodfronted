package com.necpa;

import android.content.Context;
import android.content.SharedPreferences;
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

import java.io.IOException;
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
            } finally { if (h != null) h.disconnect(); }
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
            if (!"direct".equals(c.type) || c.peerId <= 0 || !ready()) continue;
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
        synchronized (lock(chatId)) {
            Resp r = request("GET", "/api/messages/" + chatId + "?before=" + oldest + "&limit=" + PAGE, null);
            if (!r.ok()) throw new IOException(r.message());
            JSONArray rows = r.json.optJSONArray("data");
            if (rows != null && rows.length() > 0) ingest(chatId, rows, false);
            return d.count(chatId) > currentWindow || r.json.optBoolean("hasMore", false);
        }
    }

    /** Initial page for an empty chat, otherwise catch-up from the stored cursor, repeated until the server has nothing newer. */
    void syncChat(long chatId) throws Exception {
        NecpraDb.ChatDao d = dao();
        NecpraDb.Conv conv = d.conv(chatId);
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

    /** Stores rows ascending by id; decrypts each NEW incoming row exactly once. Returns the highest id seen. */
    private long ingest(long chatId, JSONArray rows, boolean advanceCursor) throws Exception {
        NecpraDb.ChatDao d = dao();
        NecpraDb.Conv conv = d.conv(chatId);
        long peer = conv == null ? 0 : conv.peerId;
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
            long ts = parseIso(str(row, "createdAt")); if (ts == 0) ts = parseIso(str(row, "sentAt"));
            if (ts > 0) m.sortTs = ts; else if (m.sortTs == 0) m.sortTs = System.currentTimeMillis();
            if (isNew && !mine && System.currentTimeMillis() - m.sortTs < 48L * 3600_000L) delivered.add(sid);   // only fresh messages need a delivery ack
            m.replyToServerId = row.optLong("replyToId", 0);
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
            d.delAtts(m.localId);
            List<NecpraDb.Att> atts = attachmentsOf(m.localId, row, meta, open(m.body));
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
        if (!toAck.isEmpty()) io.execute(() -> {
            int n = 0;
            for (long id : toAck) { if (n++ >= 30) break; try { request("POST", "/api/messages/" + id + "/delivered", new JSONObject()); } catch (Exception ignored) { } }
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
            for (java.util.Iterator<String> it = src.keys(); it.hasNext(); ) { String k = it.next(); String v = str(src, k); if (v != null && !v.isEmpty()) byUser.put(k, v); }
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
            NecpraDb.Att a = attFrom(localId, type, meta);
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
        a.name = str(o, "fileName") != null ? str(o, "fileName") : str(o, "name");
        a.mime = str(o, "mimeType") != null ? str(o, "mimeType") : str(o, "mime");
        a.size = o.optLong("size", o.optLong("fileSize", 0));
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
        Resp r = had ? request("DELETE", "/api/messages/" + m.serverId + "/react", null)
                     : request("POST", "/api/messages/" + m.serverId + "/react", new JSONObject().put("emoji", emoji));
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
        final String capped = clean.length() > MAX_TEXT ? clean.substring(0, MAX_TEXT) : clean;
        io.execute(() -> {
            NecpraDb.ChatDao d = dao();
            NecpraDb.Msg m = new NecpraDb.Msg();
            m.chatId = chatId; m.senderId = me(); m.mine = true; m.type = "text";
            m.clientMessageId = newClientId();
            m.body = seal(capped);                 // own sent messages can never be decrypted again — keep the plaintext
            m.status = ST_QUEUED; m.cryptoState = CS_OK; m.sortTs = System.currentTimeMillis();
            m.replyToServerId = replyToServerId;
            m.localId = d.insertMsg(m);
            d.delDraft(chatId);
            refreshPreview(chatId);
            fireMessages(chatId); fireConversations();
            drainAsync();
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
                    if (peer <= 0) { fail(m, "This chat can't be sent from the native screen"); continue; }
                    if (m.envelope == null) {
                        String plain = open(m.body);
                        if (plain == null) { fail(m, "Message text is no longer available"); continue; }
                        String env = NecpraE2EStore.engine(app).encrypt(plain, String.valueOf(peer));
                        m.envelope = seal(env);
                        d.updateMsg(m);                    // ciphertext is persisted BEFORE the POST: retries resend the same envelope
                    }
                    JSONObject body = new JSONObject().put("chatId", m.chatId).put("receiverId", peer)
                            .put("content", open(m.envelope)).put("type", "text").put("clientMessageId", m.clientMessageId);
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
