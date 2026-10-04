package com.necpa;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Native counterpart of encryptAttachment / decryptAttachment in js/message-e2e-core.js.
 *
 * Wire format (identical to the web client):
 *   key  = HKDF-SHA256( ECDH(myIdentity, peerIdentity), salt = 32 zero bytes, info = "kynecta-dm-v2:<idA>:<idB>:attachment" ), 32 bytes
 *          (ids sorted as strings, so both sides derive the same key)
 *   data = AES-256-GCM, 12 byte random IV, 128 bit tag, NO additional data
 *   env  = { "v": 2, "spk": <sender identity SPKI b64>, "iv": <b64>, "ct": <b64 ciphertext||tag> }
 *
 * The envelope is a small JSON text. The server's upload whitelist rejects application/octet-stream, so an
 * encrypted attachment is uploaded as that JSON text (text/plain) and the message metadata marks it
 * {"encrypted": true}. Receivers download the text, parse it and decrypt.
 *
 * Pure JDK (no Android classes) so it runs in the JVM interop test. HKDF is written out with HMAC because
 * the JDK has no HKDF before Java 11 and minSdk here is 24.
 */
final class NecpraAttachmentCrypto {

    /** Keeps the base64 envelope (+33%) and its JSON parse inside a safe heap budget on phones. */
    static final int MAX_ENCRYPTED_BYTES = 16 * 1024 * 1024;

    private static final SecureRandom RND = new SecureRandom();

    private NecpraAttachmentCrypto() {}

    /** Current web scheme (message-e2e-core.js pairContext + ':attachment'). */
    static String info(String idA, String idB) {
        String[] ids = {String.valueOf(idA), String.valueOf(idB)};
        Arrays.sort(ids);
        return "kynecta-dm-v2:" + ids[0] + ":" + ids[1] + ":attachment";
    }

    /** Older web scheme (js/e2e-encryption.js _chatContext): just the sorted pair. Decrypt-only fallback. */
    static String legacyInfo(String idA, String idB) {
        String[] ids = {String.valueOf(idA), String.valueOf(idB)};
        Arrays.sort(ids);
        return ids[0] + ":" + ids[1];
    }

    /** HKDF-SHA256 (RFC 5869), 32 byte output, salt = 32 zero bytes (what WebCrypto got in the web client). */
    static byte[] hkdf(byte[] ikm, String info) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(new byte[32], "HmacSHA256"));
        byte[] prk = mac.doFinal(ikm);
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update(info.getBytes(StandardCharsets.UTF_8));
        mac.update((byte) 1);
        return mac.doFinal();   // T(1) is exactly 32 bytes = the AES-256 key
    }

    static JSONObject seal(byte[] plain, byte[] sharedBits, String info, String senderSpkiB64) throws Exception {
        if (plain.length > MAX_ENCRYPTED_BYTES) throw new IllegalArgumentException("File is too large to send encrypted");
        byte[] key = hkdf(sharedBits, info);
        byte[] iv = new byte[12];
        RND.nextBytes(iv);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        byte[] ct = c.doFinal(plain);
        return new JSONObject().put("v", 2).put("spk", senderSpkiB64).put("iv", NecpraB64.enc(iv)).put("ct", NecpraB64.enc(ct));
    }

    static byte[] open(JSONObject env, byte[] sharedBits, String info) throws Exception {
        byte[] key = hkdf(sharedBits, info);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, NecpraB64.dec(env.getString("iv"))));
        return c.doFinal(NecpraB64.dec(env.getString("ct")));
    }
}
