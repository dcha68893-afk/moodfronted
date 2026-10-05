package com.necpa;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Native port of the web group protocol "Sender Keys v2" (js/groupMessaging.client.js, pipeline KYN-GROUP-V2).
 * It is byte-compatible with the web client so a group can be read and written from either side:
 *
 *  - every member owns one sender key per epoch: a 32-byte HMAC chain plus an ECDSA P-256 signing key;
 *  - the owner wraps {chain, iteration, publicJwk} for every member with ECDH(identity, member identity) -> HKDF -> AES-GCM and
 *    stores the wraps on the server (POST /api/group-messages/:id/crypto/rotate);
 *  - a message is AES-256-GCM under HMAC(chain,"message:i"), signed (ECDSA P-256/SHA-256, IEEE P1363 r||s) over
 *    PIPELINE|group|epoch|owner|iteration|iv|ct.
 *
 * This class has no Android dependency (plain JVM), so tests/GroupInteropTest.java can run it against the REAL web file.
 * The caller supplies HTTP ({@link Api}), the member public-key directory ({@link Directory}) and an at-rest store ({@link Store}).
 *
 * Sender-key state is the ONE thing that must never be shared between the WebView and native: a re-key by one side replaces the
 * server copy and breaks the other side's sends. That is why js/groupMessaging.client.js refuses to send while native owns groups
 * (see NecpraDmOwner.isGroupOwner).
 */
public final class NecpraGroupE2E {
    public static final String PIPELINE = "KYN-GROUP-V2";
    public static final String ALGORITHM = "SenderKey-AES256GCM-v2";
    private static final byte[] WRAP_INFO = "KYN-GROUP-V2/SENDER-KEY-WRAP".getBytes(StandardCharsets.UTF_8);
    private static final int SKIPPED_MAX = 200;
    private static final SecureRandom RNG = new SecureRandom();

    /** Thrown by {@link Api} for a non-2xx answer. 409 drives the sender-key retry loop exactly like the web client. */
    public static final class ApiException extends Exception {
        public final int status; public final String code;
        public ApiException(int status, String code, String message) { super(message); this.status = status; this.code = code; }
    }

    /** The sender key for a message is not (yet) on the server for this member. Transient: retry on a later sync. */
    public static final class KeyUnavailable extends Exception {
        public KeyUnavailable(String m) { super(m); }
    }

    public interface Api {
        JSONObject get(String path) throws Exception;
        JSONObject post(String path, JSONObject body) throws Exception;
    }

    public interface Directory {
        /** Base64 SPKI of the member's registered identity key (GET /api/encryption/keys/:id). */
        String publicKeySpki(long userId) throws Exception;
    }

    public interface Store {
        String load(String slot);
        void save(String slot, String json);
    }

    private static final class State {
        String slot; boolean rx;
        long groupId, epoch, ownerId;
        byte[] chain;
        JSONObject privateJwk, publicJwk;
        PrivateKey signKey;                 // null on receiver copies
        int iteration;
        final LinkedHashMap<Integer, byte[]> skipped = new LinkedHashMap<>();
    }

    private final long me;
    private final PrivateKey identity;
    private final String identityPubSpki;
    private final Api api;
    private final Directory directory;
    private final Store store;
    private final ConcurrentHashMap<String, State> states = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, Object> locks = new ConcurrentHashMap<>();

    public NecpraGroupE2E(long myUserId, PrivateKey identityEcdh, String identityPubSpkiB64, Api api, Directory directory, Store store) {
        this.me = myUserId; this.identity = identityEcdh; this.identityPubSpki = identityPubSpkiB64;
        this.api = api; this.directory = directory; this.store = store;
    }

    private Object lock(long g) { return locks.computeIfAbsent(g, k -> new Object()); }

    // ------------------------------------------------------------------ envelope detection

    /** True for a KYN-GROUP-V2 message envelope (what the server requires in group message content). */
    public static boolean isEnvelope(String content) {
        if (content == null || content.length() < 20 || content.charAt(0) != '{') return false;
        try {
            JSONObject e = new JSONObject(content);
            return e.optInt("v", 0) == 2 && PIPELINE.equals(e.optString("pipeline", ""));
        } catch (Exception x) { return false; }
    }

    // ------------------------------------------------------------------ primitives

    private static String b64(byte[] b) { return NecpraB64.enc(b); }
    private static byte[] unb64(String s) { return NecpraB64.dec(s); }

    private static byte[] hmac(byte[] key, byte[] msg) throws Exception {
        Mac m = Mac.getInstance("HmacSHA256");
        m.init(new SecretKeySpec(key, "HmacSHA256"));
        return m.doFinal(msg);
    }

    private static byte[] hmac(byte[] key, String label) throws Exception { return hmac(key, label.getBytes(StandardCharsets.UTF_8)); }

    /** HKDF-SHA256, one 32-byte block, salt = 32 zero bytes (WebCrypto deriveKey with salt new Uint8Array(32)). */
    private static byte[] wrapKeyBytes(byte[] ecdh) throws Exception {
        byte[] prk = hmac(new byte[32], ecdh);
        Mac m = Mac.getInstance("HmacSHA256");
        m.init(new SecretKeySpec(prk, "HmacSHA256"));
        m.update(WRAP_INFO); m.update((byte) 1);
        return m.doFinal();
    }

    private static PublicKey ecdhPublic(String spkiB64) throws Exception {
        return KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(unb64(spkiB64)));
    }

    private String spkiFor(long userId) throws Exception {
        if (userId == me && identityPubSpki != null && !identityPubSpki.isEmpty()) return identityPubSpki;   // own key is held locally, never a network call
        String s = directory.publicKeySpki(userId);
        if (s == null || s.isEmpty()) throw new IllegalStateException("Member " + userId + " has no registered identity key");
        return s;
    }

    private static byte[] gcm(boolean enc, byte[] key, byte[] iv, byte[] in) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(enc ? Cipher.ENCRYPT_MODE : Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        return c.doFinal(in);
    }

    private String wrapKey(String rawB64, long recipient) throws Exception {
        byte[] shared = NecpraRatchet.dh(identity, ecdhPublic(spkiFor(recipient)));
        byte[] iv = new byte[12]; RNG.nextBytes(iv);
        byte[] ct = gcm(true, wrapKeyBytes(shared), iv, rawB64.getBytes(StandardCharsets.UTF_8));
        return new JSONObject().put("v", 2).put("iv", b64(iv)).put("ct", b64(ct)).toString();
    }

    private String unwrapKey(String envelopeJson, long ownerId) throws Exception {
        JSONObject e = new JSONObject(envelopeJson);
        if (e.optInt("v", 0) != 2) throw new IllegalStateException("Unsupported group key envelope");
        byte[] shared = NecpraRatchet.dh(identity, ecdhPublic(spkiFor(ownerId)));
        return new String(gcm(false, wrapKeyBytes(shared), unb64(e.getString("iv")), unb64(e.getString("ct"))), StandardCharsets.UTF_8);
    }

    // ECDSA: WebCrypto speaks IEEE P1363 (r||s, 64 bytes); the JCA speaks DER (and the P1363 variants need API 33+).

    static byte[] derToP1363(byte[] der) {
        int i = 2; if ((der[1] & 0x80) != 0) i = 2 + (der[1] & 0x7f);
        int rl = der[i + 1] & 0xff; byte[] r = java.util.Arrays.copyOfRange(der, i + 2, i + 2 + rl);
        int j = i + 2 + rl; int sl = der[j + 1] & 0xff; byte[] s = java.util.Arrays.copyOfRange(der, j + 2, j + 2 + sl);
        byte[] out = new byte[64];
        copyFixed(r, out, 0); copyFixed(s, out, 32);
        return out;
    }

    private static void copyFixed(byte[] v, byte[] out, int off) {
        int start = 0; while (start < v.length - 1 && v[start] == 0) start++;
        int len = v.length - start;
        if (len > 32) throw new IllegalArgumentException("bad ECDSA integer");
        System.arraycopy(v, start, out, off + 32 - len, len);
    }

    static byte[] p1363ToDer(byte[] sig) {
        if (sig.length != 64) throw new IllegalArgumentException("bad signature length");
        byte[] r = derInt(sig, 0), s = derInt(sig, 32);
        byte[] out = new byte[6 + r.length + s.length];
        out[0] = 0x30; out[1] = (byte) (4 + r.length + s.length);
        out[2] = 0x02; out[3] = (byte) r.length; System.arraycopy(r, 0, out, 4, r.length);
        int o = 4 + r.length; out[o] = 0x02; out[o + 1] = (byte) s.length; System.arraycopy(s, 0, out, o + 2, s.length);
        return out;
    }

    private static byte[] derInt(byte[] sig, int off) {
        int start = off; while (start < off + 31 && sig[start] == 0) start++;
        int len = off + 32 - start; boolean pad = (sig[start] & 0x80) != 0;
        byte[] v = new byte[len + (pad ? 1 : 0)];
        System.arraycopy(sig, start, v, pad ? 1 : 0, len);
        return v;
    }

    private static byte[] signInput(String g, long e, long o, long i, String iv, String ct) {
        return (PIPELINE + "|" + g + "|" + e + "|" + o + "|" + i + "|" + iv + "|" + ct).getBytes(StandardCharsets.UTF_8);
    }

    private static PublicKey signPublic(JSONObject jwk) throws Exception {
        byte[] raw = new byte[65]; raw[0] = 4;
        System.arraycopy(fixed32(unb64(jwk.getString("x"))), 0, raw, 1, 32);
        System.arraycopy(fixed32(unb64(jwk.getString("y"))), 0, raw, 33, 32);
        return NecpraRatchet.publicFromRaw(raw);
    }

    private static byte[] fixed32(byte[] v) {
        byte[] out = new byte[32];
        int n = Math.min(v.length, 32);
        System.arraycopy(v, v.length - n, out, 32 - n, n);
        return out;
    }

    private static String fpOf(JSONObject pub) {
        String x = pub == null ? "" : pub.optString("x", "");
        return x.length() > 12 ? x.substring(0, 12) : x;
    }

    // ------------------------------------------------------------------ state persistence (same shape as the web's saveState/loadState)

    private static String slotName(long g, long e, long o, boolean rx, String fp) {
        return "kyn_gsk_v2_" + g + "_" + e + "_" + o + (rx ? "_rx" : "") + (fp != null && !fp.isEmpty() ? "#" + fp : "");
    }

    private void save(State st) {
        try {
            JSONArray sk = new JSONArray(); int n = 0, skip = Math.max(0, st.skipped.size() - SKIPPED_MAX);
            for (Map.Entry<Integer, byte[]> en : st.skipped.entrySet()) { if (n++ < skip) continue; sk.put(new JSONArray().put(en.getKey()).put(b64(en.getValue()))); }
            JSONObject o = new JSONObject().put("chain", b64(st.chain)).put("iteration", st.iteration).put("skipped", sk);
            if (st.privateJwk != null) o.put("privateJwk", st.privateJwk);
            if (st.publicJwk != null) o.put("publicJwk", st.publicJwk);
            store.save(st.slot, o.toString());
        } catch (Exception ignored) { /* a lost cache entry only means re-fetching the key from the server */ }
    }

    private State load(long g, long e, long o, boolean rx, String fp) {
        try {
            String slot = slotName(g, e, o, rx, fp), raw = store.load(slot);
            if (raw == null) return null;
            JSONObject x = new JSONObject(raw);
            State st = new State();
            st.slot = slot; st.rx = rx; st.groupId = g; st.epoch = e; st.ownerId = o;
            st.chain = unb64(x.getString("chain")); st.iteration = x.optInt("iteration", 0);
            st.privateJwk = x.optJSONObject("privateJwk"); st.publicJwk = x.optJSONObject("publicJwk");
            if (st.privateJwk != null) st.signKey = NecpraRatchet.privateFromJwk(st.privateJwk);
            JSONArray sk = x.optJSONArray("skipped");
            if (sk != null) for (int i = 0; i < sk.length(); i++) { JSONArray p = sk.optJSONArray(i); if (p != null) st.skipped.put(p.getInt(0), unb64(p.getString(1))); }
            return st;
        } catch (Exception ex) { return null; }
    }

    private State createSenderState(long g, long e) throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
        kpg.initialize(new ECGenParameterSpec("secp256r1"), RNG);
        KeyPair kp = kpg.generateKeyPair();
        JSONObject full = NecpraRatchet.toJwk((ECPrivateKey) kp.getPrivate(), (ECPublicKey) kp.getPublic());   // {kty,crv,x,y,d,ext}
        JSONObject pub = new JSONObject().put("crv", "P-256").put("ext", true).put("key_ops", new JSONArray().put("verify"))
                .put("kty", "EC").put("x", full.getString("x")).put("y", full.getString("y"));
        JSONObject priv = new JSONObject(full.toString()).put("key_ops", new JSONArray().put("sign"));
        State st = new State();
        st.slot = slotName(g, e, me, false, null); st.groupId = g; st.epoch = e; st.ownerId = me;
        st.chain = new byte[32]; RNG.nextBytes(st.chain);
        st.privateJwk = priv; st.publicJwk = pub; st.signKey = kp.getPrivate(); st.iteration = 0;
        return st;
    }

    // ------------------------------------------------------------------ server state

    private JSONObject fetchState(long g) throws Exception {
        JSONObject r = api.get("/api/group-messages/" + g + "/crypto/state");
        JSONObject d = r == null ? null : r.optJSONObject("data");
        return d == null ? new JSONObject() : d;
    }

    private static JSONObject keyEntry(JSONObject s, long e, long o) {
        JSONArray cur = s.optJSONArray("senderKeys");
        if (cur != null) for (int i = 0; i < cur.length(); i++) {
            JSONObject x = cur.optJSONObject(i);
            if (x != null && x.optLong("epoch") == e && x.optLong("ownerId") == o) return x;
        }
        JSONArray hist = s.optJSONArray("history");
        if (hist != null) for (int h = 0; h < hist.length(); h++) {
            JSONObject hh = hist.optJSONObject(h); if (hh == null) continue;
            JSONArray ks = hh.optJSONArray("senderKeys"); if (ks == null) continue;
            for (int i = 0; i < ks.length(); i++) {
                JSONObject x = ks.optJSONObject(i);
                if (x != null && x.optLong("epoch") == e && x.optLong("ownerId") == o) return x;
            }
        }
        return null;
    }

    private static final class Cand {
        final JSONObject entry; final boolean current;
        Cand(JSONObject entry, boolean current) { this.entry = entry; this.current = current; }
    }

    /**
     * Every key that could have signed a message from owner o in epoch e: the current one first, then the retired ones the
     * server keeps when a member re-keys inside the same epoch (e.g. sent from web, then from native), then history.
     */
    private static List<Cand> keyEntries(JSONObject s, long e, long o) {
        List<Cand> out = new ArrayList<>();
        JSONArray cur = s.optJSONArray("senderKeys");
        if (cur != null) for (int i = 0; i < cur.length(); i++) {
            JSONObject x = cur.optJSONObject(i);
            if (x != null && x.optLong("epoch") == e && x.optLong("ownerId") == o) out.add(new Cand(x, true));
        }
        JSONArray ret = s.optJSONArray("retiredKeys");
        if (ret != null) for (int i = 0; i < ret.length(); i++) {
            JSONObject x = ret.optJSONObject(i);
            if (x != null && x.optLong("epoch") == e && x.optLong("ownerId") == o) out.add(new Cand(x, false));
        }
        JSONArray hist = s.optJSONArray("history");
        if (hist != null) for (int h = 0; h < hist.length(); h++) {
            JSONObject hh = hist.optJSONObject(h); if (hh == null) continue;
            JSONArray ks = hh.optJSONArray("senderKeys"); if (ks == null) continue;
            for (int i = 0; i < ks.length(); i++) {
                JSONObject x = ks.optJSONObject(i);
                if (x != null && x.optLong("epoch") == e && x.optLong("ownerId") == o) out.add(new Cand(x, false));
            }
        }
        return out;
    }

    private List<Long> liveMembers(long g) throws Exception {
        JSONObject r = api.get("/api/chats/" + g);
        JSONObject d = r == null ? null : r.optJSONObject("data");
        JSONObject c = d == null ? null : (d.optJSONObject("chat") != null ? d.optJSONObject("chat") : d.optJSONObject("group") != null ? d.optJSONObject("group") : d);
        JSONArray p = c == null ? null : c.optJSONArray("participants");
        Set<Long> ids = new LinkedHashSet<>();
        if (p != null) for (int i = 0; i < p.length(); i++) {
            JSONObject x = p.optJSONObject(i); if (x == null) continue;
            JSONObject u = x.optJSONObject("user");
            long id = u != null && u.has("id") ? u.optLong("id") : x.has("userId") ? x.optLong("userId") : x.optLong("id");
            if (id > 0) ids.add(id);
        }
        return new ArrayList<>(ids);
    }

    private List<Long> withSelf(List<Long> ids) {
        Set<Long> s = new LinkedHashSet<>(ids);
        if (me > 0) s.add(me);
        return new ArrayList<>(s);
    }

    // ------------------------------------------------------------------ sender side

    private State distribute(long g, long e, State st, List<Long> live) throws Exception {
        if (live.isEmpty()) throw new IllegalStateException("No current group members are available for sender-key distribution");
        String raw = b64(new JSONObject().put("chain", b64(st.chain)).put("iteration", st.iteration).put("publicJwk", st.publicJwk).toString().getBytes(StandardCharsets.UTF_8));
        JSONArray ds = new JSONArray(); String selfFailure = null; boolean selfOk = false;
        for (long id : live) {
            try {
                ds.put(new JSONObject().put("userId", id).put("deviceId", "primary").put("ciphertext", wrapKey(raw, id)).put("algorithm", ALGORITHM));
                if (id == st.ownerId) selfOk = true;
            } catch (Exception ex) { if (id == st.ownerId) selfFailure = ex.getMessage(); }
        }
        if (!selfOk) throw new IllegalStateException("Your own group sender key could not be prepared" + (selfFailure != null ? ": " + selfFailure : ""));
        api.post("/api/group-messages/" + g + "/crypto/rotate", new JSONObject().put("epoch", e).put("distributions", ds).put("keyFingerprint", fpOf(st.publicJwk)));
        states.put(slotName(g, e, st.ownerId, false, null), st);
        save(st);
        return st;
    }

    private static boolean retryable(Exception ex) {
        if (!(ex instanceof ApiException)) return false;
        ApiException a = (ApiException) ex;
        return a.status == 409 || "GROUP_SENDER_KEY_INCOMPLETE".equals(a.code) || "GROUP_SENDER_KEY_EPOCH_MISMATCH".equals(a.code);
    }

    /** Returns this member's usable sender key for the group's current epoch, creating + distributing one when needed. */
    private State ensureSenderKey(long g) throws Exception {
        if (me <= 0) throw new IllegalStateException("Your account id is not available yet; retry in a moment");
        List<Long> live = withSelf(liveMembers(g));
        for (int attempt = 0; attempt < 4; attempt++) {
            JSONObject s = fetchState(g);
            long epoch = Math.max(1, s.optLong("epoch", 1));
            JSONObject entry = keyEntry(s, epoch, me);
            State st = states.get(slotName(g, epoch, me, false, null));
            if (st == null) st = load(g, epoch, me, false, null);
            Set<Long> missing = new LinkedHashSet<>();
            JSONArray mm = s.optJSONArray("missingMemberIds");
            if (mm != null) for (int i = 0; i < mm.length(); i++) { long v = mm.optLong(i); if (v > 0) missing.add(v); }
            if (st != null && st.signKey == null) st = null;      // no signing key locally (new device / cleared storage): mint a fresh one
            if (st != null && entry != null && entry.optJSONObject("distribution") != null && !missing.contains(me)) {
                states.put(slotName(g, epoch, me, false, null), st);
                return st;
            }
            try {
                if (st != null) return distribute(g, epoch, st, live);
                return distribute(g, epoch, createSenderState(g, epoch), live);
            } catch (Exception ex) {
                if (retryable(ex)) { Thread.sleep(500); continue; }
                throw ex;
            }
        }
        throw new IllegalStateException("Group sender key is still synchronizing; retry in a moment");
    }

    /** Encrypts for the group; returns the KYN-GROUP-V2 envelope JSON the server stores as message content. */
    public String encrypt(long g, String plaintext) throws Exception {
        synchronized (lock(g)) {
            State st = ensureSenderKey(g);
            int i = st.iteration;
            byte[] mk = hmac(st.chain, "message:" + i), next = hmac(st.chain, "chain:" + i);
            byte[] iv = new byte[12]; RNG.nextBytes(iv);
            String ivb = b64(iv), ctb = b64(gcm(true, mk, iv, (plaintext == null ? "" : plaintext).getBytes(StandardCharsets.UTF_8)));
            Signature sg = Signature.getInstance("SHA256withECDSA");
            sg.initSign(st.signKey); sg.update(signInput(String.valueOf(g), st.epoch, st.ownerId, i, ivb, ctb));
            String sig = b64(derToP1363(sg.sign()));
            st.chain = next; st.iteration++;
            save(st);
            return new JSONObject().put("v", 2).put("pipeline", PIPELINE).put("algorithm", ALGORITHM).put("group", String.valueOf(g))
                    .put("epoch", st.epoch).put("owner", st.ownerId).put("iteration", i).put("iv", ivb).put("ct", ctb).put("sig", sig)
                    .put("publicKey", st.publicJwk).toString();
        }
    }

    /** Re-wraps this member's sender key for members the server lists as missing it (new members). Safe no-op otherwise. */
    public void distributeMissing(long g) throws Exception {
        synchronized (lock(g)) {
            JSONObject s = fetchState(g);
            long epoch = Math.max(1, s.optLong("epoch", 1));
            JSONObject entry = keyEntry(s, epoch, me);
            State st = states.get(slotName(g, epoch, me, false, null));
            if (st == null) st = load(g, epoch, me, false, null);
            if (st == null || st.signKey == null || entry == null || entry.optJSONObject("distribution") == null) return;
            JSONArray mm = s.optJSONArray("missingMemberIds");
            if (mm == null || mm.length() == 0) return;
            List<Long> live = liveMembers(g);
            boolean any = false;
            for (int i = 0; i < mm.length(); i++) if (live.contains(mm.optLong(i))) any = true;
            if (any) distribute(g, epoch, st, withSelf(live));
        }
    }

    // ------------------------------------------------------------------ receiver side

    private State receiverState(long g, long e, long o, String fp) throws Exception {
        boolean rx = o == me;
        String key = slotName(g, e, o, rx, fp);
        State st = states.get(key);
        if (st == null) st = load(g, e, o, rx, fp);
        if (st != null) { states.put(key, st); return st; }
        if (fp != null && !fp.isEmpty()) {     // legacy cache entry (saved before fingerprint tagging): accept only if it is the same key
            String k0 = slotName(g, e, o, rx, null);
            State s0 = states.get(k0); if (s0 == null) s0 = load(g, e, o, rx, null);
            if (s0 != null && fp.equals(fpOf(s0.publicJwk))) { states.put(k0, s0); return s0; }
        }
        JSONObject s = fetchState(g);
        // Try the current key, then the retired ones, until the key's fingerprint matches the one the message was signed with.
        JSONObject b = null; boolean isCurrent = false;
        for (Cand c : keyEntries(s, e, o)) {
            JSONObject dist = c.entry.optJSONObject("distribution");
            if (dist == null) continue;
            try {
                JSONObject cand = new JSONObject(new String(unb64(unwrapKey(dist.getString("ciphertext"), o)), StandardCharsets.UTF_8));
                if (fp != null && !fp.isEmpty() && !fp.equals(fpOf(cand.optJSONObject("publicJwk")))) continue;
                b = cand; isCurrent = c.current; break;
            } catch (Exception ignored) { /* this wrap is not readable on this device - try the next candidate */ }
        }
        if (b == null) throw new KeyUnavailable("Sender key for this group message is not available");
        st = new State();
        st.slot = key; st.rx = rx; st.groupId = g; st.epoch = e; st.ownerId = o;
        st.chain = unb64(b.getString("chain")); st.publicJwk = b.optJSONObject("publicJwk"); st.iteration = b.optInt("iteration", 0);
        states.put(key, st); save(st);
        if (isCurrent) { try { api.post("/api/group-messages/" + g + "/crypto/ack", new JSONObject().put("ownerId", o).put("epoch", e)); } catch (Exception ignored) { /* retried on a later sync */ } }
        return st;
    }

    /** Decrypts one group message envelope. Messages of one group must be fed in the order they are read (the chain is one-way). */
    public String decrypt(long g, String envelopeJson) throws Exception {
        synchronized (lock(g)) {
            JSONObject e = new JSONObject(envelopeJson);
            if (e.optInt("v", 0) != 2 || !PIPELINE.equals(e.optString("pipeline", ""))) return envelopeJson;
            long epoch = e.getLong("epoch"), owner = e.getLong("owner"); int iter = e.getInt("iteration");
            JSONObject embedded = e.getJSONObject("publicKey");
            State st = receiverState(g, epoch, owner, fpOf(embedded));

            // Verify against the key the sender DISTRIBUTED (st.publicJwk), not the one embedded in the message: every member holds the
            // chain, so trusting the embedded key would let any member forge messages as another. Honest messages carry the same key.
            JSONObject pub = st.publicJwk != null ? st.publicJwk : embedded;
            if (st.publicJwk != null && (!st.publicJwk.optString("x").equals(embedded.optString("x")) || !st.publicJwk.optString("y").equals(embedded.optString("y"))))
                throw new IllegalStateException("Group message signature verification failed");
            Signature sg = Signature.getInstance("SHA256withECDSA");
            sg.initVerify(signPublic(pub)); sg.update(signInput(String.valueOf(g), epoch, owner, iter, e.getString("iv"), e.getString("ct")));
            if (!sg.verify(p1363ToDer(unb64(e.getString("sig"))))) throw new IllegalStateException("Group message signature verification failed");

            byte[] mk;
            if (iter < st.iteration) {
                mk = st.skipped.get(iter);
                if (mk == null) throw new IllegalStateException("Group message is too old for this sender-key state");
            } else {
                while (st.iteration < iter) {
                    byte[] x = hmac(st.chain, "message:" + st.iteration);
                    st.chain = hmac(st.chain, "chain:" + st.iteration);
                    st.skipped.put(st.iteration, x);
                    while (st.skipped.size() > SKIPPED_MAX) { Iterator<Integer> it = st.skipped.keySet().iterator(); it.next(); it.remove(); }
                    st.iteration++;
                }
                mk = hmac(st.chain, "message:" + st.iteration);
                st.chain = hmac(st.chain, "chain:" + st.iteration);
                st.iteration++;
            }
            String pt = new String(gcm(false, mk, unb64(e.getString("iv")), unb64(e.getString("ct"))), StandardCharsets.UTF_8);
            save(st);
            return pt;
        }
    }

    /** Forget every cached key of this account (logout / account switch is handled by the store being wiped). */
    public void dropMemoryCache() { states.clear(); }

}
