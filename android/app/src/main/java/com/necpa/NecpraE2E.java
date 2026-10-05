package com.necpa;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.concurrent.ConcurrentHashMap;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Native counterpart of js/message-e2e-core.js (private 1:1 messages, v3 Double Ratchet envelopes).
 * It is NOT a second protocol: same identity key, same envelope, same session-bootstrap and recovery
 * rules as the web client, so Android-native <-> web/PWA messages decrypt on both sides.
 *
 * Pure JDK + org.json (no Android classes) so it is covered by the JVM interop test against the real
 * web ratchet. Storage and the key directory are injected (see NecpraE2EStore for the Android glue).
 *
 * Deliberately NOT supported (returns {@link Unsupported}): v2 static-key legacy envelopes and older
 * v1/v4/v5 shapes. The web client shows "Encrypted message" for the unknown ones too; v2 can be
 * added later if old history must be readable natively.
 */
public final class NecpraE2E {

    public interface KeyDirectory {
        /** Current identity key of {@code userId}. {@code forceRefresh} bypasses any cache. */
        PeerKey publicKeyFor(String userId, boolean forceRefresh) throws Exception;
    }

    public interface SessionStore {
        JSONObject load(String peerId);
        void save(String peerId, JSONObject session);
        void clear(String peerId);
    }

    public static final class PeerKey {
        public final String spkiB64; public final String keyId;
        public PeerKey(String spkiB64, String keyId) { this.spkiB64 = spkiB64; this.keyId = keyId; }
    }

    /** Envelope is a version this native engine does not decrypt (UI shows a placeholder, never raw JSON). */
    public static final class Unsupported extends Exception { Unsupported(String m) { super(m); } }

    /** Own sent v3 messages cannot be re-derived (forward secrecy) — callers must use the locally cached plaintext. */
    public static final class OwnMessage extends Exception { OwnMessage() { super("Cannot re-derive plaintext for your own Double Ratchet message (forward secrecy)"); } }

    private static final int PBKDF2_ITERATIONS = 310_000;
    private static final long PEER_KEY_RECHECK_MS = 2000; // same cadence as the web client
    private static final ConcurrentHashMap<String, Object> LOCKS = new ConcurrentHashMap<>();

    private final String myUserId;
    private final PrivateKey identityPriv;
    private final String identityPubSpkiB64;
    private final String identityKeyId;
    private final KeyDirectory directory;
    private final SessionStore store;

    public NecpraE2E(String myUserId, String identityPkcs8B64, String identityPubSpkiB64, String identityKeyId,
                     KeyDirectory directory, SessionStore store) throws Exception {
        this.myUserId = myUserId;
        this.identityPriv = KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(NecpraB64.dec(identityPkcs8B64)));
        this.identityPubSpkiB64 = identityPubSpkiB64;
        this.identityKeyId = identityKeyId;
        this.directory = directory;
        this.store = store;
    }

    public String keyId() { return identityKeyId; }

    /** The account's ECDH identity (same key the DM engine uses): the group engine wraps sender keys with it. Never leaves the process. */
    PrivateKey identityPrivateKey() { return identityPriv; }

    String identityPublicSpki() { return identityPubSpkiB64; }

    // ------------------------------------------------------------------ identity backup (same format as e2e-identity-core.js wrapPrivate)

    /** Unwraps {salt,iv,ct} (PBKDF2-SHA256 310k -> AES-256-GCM) to the PKCS8 private key, base64. */
    public static String unwrapPrivate(String wrappedJson, String password) throws Exception {
        JSONObject o = new JSONObject(wrappedJson);
        byte[] key = pbkdf2(password.getBytes(StandardCharsets.UTF_8), NecpraB64.dec(o.getString("salt")), PBKDF2_ITERATIONS);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, NecpraB64.dec(o.getString("iv"))));
        return NecpraB64.enc(c.doFinal(NecpraB64.dec(o.getString("ct"))));
    }

    /** PBKDF2-HMAC-SHA256, one 32-byte block (PBKDF2WithHmacSHA256 is only available from API 26; minSdk here is 24). */
    static byte[] pbkdf2(byte[] password, byte[] salt, int iterations) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(password, "HmacSHA256"));
        mac.update(salt); mac.update(new byte[]{0, 0, 0, 1});
        byte[] u = mac.doFinal(), t = u.clone();
        for (int i = 1; i < iterations; i++) {
            u = mac.doFinal(u);
            for (int j = 0; j < t.length; j++) t[j] ^= u[j];
        }
        return t;
    }

    // ------------------------------------------------------------------ envelope helpers

    private static byte[] shared(PrivateKey priv, String peerSpkiB64) throws Exception {
        PublicKey pub = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(NecpraB64.dec(peerSpkiB64)));
        return NecpraRatchet.dh(priv, pub);
    }

    private static Object lockFor(String peerId) { return LOCKS.computeIfAbsent(peerId, k -> new Object()); }

    private static JSONObject copy(JSONObject o) throws Exception { return new JSONObject(o.toString()); }

    /** True when {@code content} is a v3 envelope this engine can decrypt. */
    public static boolean isV3(String content) {
        try {
            JSONObject o = new JSONObject(content);
            return o.optInt("v") == 3 && o.has("hdr") && o.has("iv") && o.has("ct");
        } catch (Exception e) { return false; }
    }

    /** Looks like ANY encrypted envelope (so the UI never prints raw ciphertext JSON as if it were text). */
    public static boolean looksEncrypted(String content) {
        if (content == null) return false;
        String s = content.trim();
        if (!s.startsWith("{")) return false;
        try {
            JSONObject o = new JSONObject(s);
            if (!o.has("v")) return false;
            if (o.has("ct") || o.has("iv")) return true;
            JSONObject devices = o.optJSONObject("devices");
            if (devices != null) for (java.util.Iterator<String> it = devices.keys(); it.hasNext(); ) { JSONObject d = devices.optJSONObject(it.next()); if (d != null && (d.has("ct") || d.has("iv"))) return true; }
            return o.has("mid") || o.has("sid") || o.has("kid");
        } catch (Exception e) { return false; }
    }

    // ------------------------------------------------------------------ encrypt (encryptForChatV3)

    /** Returns the envelope JSON string to put in POST /api/messages {content}. */
    public String encrypt(String plaintext, String recipientUserId) throws Exception {
        if (recipientUserId == null || recipientUserId.isEmpty()) throw new IllegalArgumentException("Recipient is required for secure messaging");
        synchronized (lockFor(recipientUserId)) {
            JSONObject session = store.load(recipientUserId);

            // Resolve the recipient's CURRENT key; if it changed (reinstall/rotation) the old session is useless.
            PeerKey current;
            try {
                boolean due = session == null || !session.has("peerKeyCheckedAt")
                        || (System.currentTimeMillis() - session.optLong("peerKeyCheckedAt", 0)) > PEER_KEY_RECHECK_MS;
                current = directory.publicKeyFor(recipientUserId, due);
            } catch (Exception fresh) {
                current = directory.publicKeyFor(recipientUserId, false); // offline: use what we have
            }
            if (session != null && session.has("peerKeyId") && !session.isNull("peerKeyId") && current.keyId != null
                    && !String.valueOf(session.get("peerKeyId")).equals(String.valueOf(current.keyId))) {
                store.clear(recipientUserId);
                session = null;
            }
            if (session == null) {
                byte[] sharedBits = shared(identityPriv, current.spkiB64);
                String peerRaw = NecpraB64.enc(NecpraRatchet.rawFromSpki(NecpraB64.dec(current.spkiB64)));
                session = NecpraRatchet.initSessionAsSender(sharedBits, peerRaw);
                session.put("peerKeyId", current.keyId == null ? JSONObject.NULL : current.keyId);
            }
            session.put("peerKeyCheckedAt", System.currentTimeMillis());
            if (current.keyId != null) session.put("peerKeyId", current.keyId);

            JSONObject next = copy(session);                       // never persist a half-advanced state
            JSONObject envelope = NecpraRatchet.ratchetEncrypt(next, plaintext);
            store.save(recipientUserId, next);
            envelope.put("spk", identityPubSpkiB64);               // self-describing, same as the web client
            if (identityKeyId != null) envelope.put("kid", identityKeyId);
            if (current.keyId != null) envelope.put("rkid", current.keyId);
            return envelope.toString();
        }
    }

    // ------------------------------------------------------------------ attachments (encryptAttachment / decryptAttachment)

    /**
     * Encrypts file bytes for {@code recipientUserId} in the web client's attachment envelope {v:2, spk, iv, ct}.
     * Stateless: unlike chat text it does not touch the ratchet, so a retry simply produces a fresh envelope.
     */
    public JSONObject encryptAttachment(byte[] data, String recipientUserId) throws Exception {
        if (recipientUserId == null || recipientUserId.isEmpty()) throw new IllegalArgumentException("Recipient is required for secure messaging");
        PeerKey peer = directory.publicKeyFor(recipientUserId, false);
        byte[] sharedBits = shared(identityPriv, peer.spkiB64);
        return NecpraAttachmentCrypto.seal(data, sharedBits, NecpraAttachmentCrypto.info(myUserId, recipientUserId), identityPubSpkiB64);
    }

    /**
     * @param peerId the OTHER participant (sender for incoming files, recipient for files I sent)
     * @param own    true when I sent it: the envelope's spk is then MY key, so the peer's directory key is used instead
     */
    public byte[] decryptAttachment(JSONObject envelope, String peerId, boolean own) throws Exception {
        String[] infos = {NecpraAttachmentCrypto.info(myUserId, peerId), NecpraAttachmentCrypto.legacyInfo(myUserId, peerId)};
        Exception last = null;
        // 1) the key the envelope names (incoming only), 2) the cached directory key, 3) a forced refresh (peer rotated its key)
        for (int attempt = 0; attempt < 3; attempt++) {
            String spki;
            if (attempt == 0 && !own && envelope.has("spk") && !envelope.isNull("spk")) spki = envelope.getString("spk");
            else if (attempt == 0) spki = directory.publicKeyFor(peerId, false).spkiB64;
            else spki = directory.publicKeyFor(peerId, attempt == 2).spkiB64;
            byte[] sharedBits = shared(identityPriv, spki);
            for (String info : infos) {
                try { return NecpraAttachmentCrypto.open(envelope, sharedBits, info); } catch (Exception e) { last = e; }
            }
        }
        throw last != null ? last : new IllegalStateException("Could not decrypt attachment");
    }

    // ------------------------------------------------------------------ decrypt (decryptEnvelopeV3)

    private JSONObject receiverSession(String peerId, JSONObject envelope, boolean forceRefresh) throws Exception {
        String spki = null;
        if (!forceRefresh && envelope.has("spk") && !envelope.isNull("spk")) spki = envelope.getString("spk");
        if (spki == null) spki = directory.publicKeyFor(peerId, forceRefresh).spkiB64;
        byte[] sharedBits = shared(identityPriv, spki);
        JSONObject myJwk = NecpraRatchet.jwkFromPrivate(identityPriv);
        return NecpraRatchet.initSessionAsReceiver(sharedBits, myJwk, envelope.getJSONObject("hdr").getString("dh"));
    }

    /** Persists a successfully advanced session and remembers which identity key the peer used (kid), so a later
     *  key rotation is detected even right after a recovery rebuilt the session (the web client leaves this unset). */
    private void saveReceived(String peerId, JSONObject session, JSONObject envelope) throws Exception {
        if (envelope.has("kid") && !envelope.isNull("kid") && (!session.has("peerKeyId") || session.isNull("peerKeyId")))
            session.put("peerKeyId", envelope.getString("kid"));
        store.save(peerId, session);
    }

    private static boolean repairable(Exception e) {
        String m = e.getMessage();
        return "Receiving ratchet is not initialized".equals(m) || "Receiving chain is unavailable".equals(m);
    }

    /**
     * @param peerId the OTHER participant's user id (sender for incoming messages)
     * @throws OwnMessage     when isOwnMessage (use the cached plaintext instead)
     * @throws Unsupported    for non-v3 envelopes
     */
    public String decrypt(String content, String peerId, boolean isOwnMessage) throws Exception {
        if (isOwnMessage) throw new OwnMessage();
        if (!isV3(content)) throw new Unsupported(looksEncrypted(content) ? "Unsupported envelope version" : "Not an encrypted envelope");
        JSONObject envelope = new JSONObject(content);
        synchronized (lockFor(peerId)) {
            JSONObject session = store.load(peerId);
            boolean hadSession = session != null;
            if (!hadSession) session = receiverSession(peerId, envelope, false);
            try {
                JSONObject work = copy(session);
                String plain = NecpraRatchet.ratchetDecrypt(work, envelope);
                saveReceived(peerId, work, envelope);
                return plain;
            } catch (Exception first) {
                // Order and conditions mirror decryptEnvelopeV3 in message-e2e-core.js. Each recovery builds a FRESH
                // session and only replaces the stored one if the decrypt succeeds, so a bad message never wipes a healthy session.
                if (!hadSession && !repairable(first)) {
                    try {
                        JSONObject fresh = receiverSession(peerId, envelope, true);
                        String plain = NecpraRatchet.ratchetDecrypt(fresh, envelope);
                        saveReceived(peerId, fresh, envelope);
                        return plain;
                    } catch (Exception ignored) { throw first; }
                }
                if (hadSession && !repairable(first)) {
                    for (boolean force : new boolean[]{false, true}) {
                        try {
                            JSONObject fresh = receiverSession(peerId, envelope, force);
                            String plain = NecpraRatchet.ratchetDecrypt(fresh, envelope);
                            saveReceived(peerId, fresh, envelope);
                            return plain;
                        } catch (Exception ignored) { /* try next */ }
                    }
                    throw first;
                }
                if (hadSession && repairable(first)) {
                    try {
                        JSONObject fresh = receiverSession(peerId, envelope, false);
                        String plain = NecpraRatchet.ratchetDecrypt(fresh, envelope);
                        saveReceived(peerId, fresh, envelope);
                        return plain;
                    } catch (Exception ignored) { throw first; }
                }
                throw first;
            }
        }
    }
}
