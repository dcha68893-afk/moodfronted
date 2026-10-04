package com.necpa;

import org.json.JSONObject;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Iterator;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Java port of js/e2e-ratchet-v3.js (the web client's Double Ratchet).
 *
 * It is deliberately WIRE- AND STATE-COMPATIBLE with the JavaScript version:
 *   P-256 ECDH (32-byte X coordinate) + HKDF-SHA256 (info "KynectaRatchet-RK") + HMAC-SHA256 chain KDF
 *   (0x01 = message key, 0x02 = next chain key) + AES-256-GCM, 12-byte IV, 128-bit tag, AAD =
 *   {"dh":..,"pn":..,"n":..}. Session state uses the SAME JSON field names/encodings as the web client
 *   (DHs_priv as a JWK, everything else standard base64) so a session can be moved between the two.
 *
 * Pure JDK + org.json: no Android classes, so it is unit-testable on a plain JVM.
 */
public final class NecpraRatchet {
    static final int MAX_SKIP = 1000;
    private static final SecureRandom RNG = new SecureRandom();
    private static final byte[] INFO_RK = "KynectaRatchet-RK".getBytes(StandardCharsets.UTF_8);

    private NecpraRatchet() {}

    // ------------------------------------------------------------------ encoding helpers

    static String b64(byte[] b) { return NecpraB64.enc(b); }
    static byte[] unb64(String s) { return NecpraB64.dec(s); }
    private static String b64url(byte[] b) { return NecpraB64.encUrl(b); }
    private static byte[] unb64url(String s) { return NecpraB64.dec(s); }

    private static byte[] fixed32(BigInteger v) {
        byte[] raw = v.toByteArray();
        byte[] out = new byte[32];
        int copy = Math.min(raw.length, 32);
        System.arraycopy(raw, raw.length - copy, out, 32 - copy, copy);
        return out;
    }

    // ------------------------------------------------------------------ EC helpers

    private static ECParameterSpec p256() throws Exception {
        AlgorithmParameters ap = AlgorithmParameters.getInstance("EC");
        ap.init(new ECGenParameterSpec("secp256r1"));
        return ap.getParameterSpec(ECParameterSpec.class);
    }

    /** 65-byte uncompressed point (what WebCrypto exports as "raw"). */
    public static byte[] rawPublic(ECPublicKey pub) {
        byte[] out = new byte[65];
        out[0] = 4;
        System.arraycopy(fixed32(pub.getW().getAffineX()), 0, out, 1, 32);
        System.arraycopy(fixed32(pub.getW().getAffineY()), 0, out, 33, 32);
        return out;
    }

    public static PublicKey publicFromRaw(byte[] raw) throws Exception {
        if (raw.length != 65 || raw[0] != 4) throw new IllegalArgumentException("Not an uncompressed P-256 point");
        BigInteger x = new BigInteger(1, java.util.Arrays.copyOfRange(raw, 1, 33));
        BigInteger y = new BigInteger(1, java.util.Arrays.copyOfRange(raw, 33, 65));
        return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(x, y), p256()));
    }

    /** The identity directory stores SPKI (DER) public keys; ratchet bootstrap keys are raw points. */
    public static byte[] rawFromSpki(byte[] spki) throws Exception {
        PublicKey k = KeyFactory.getInstance("EC").generatePublic(new java.security.spec.X509EncodedKeySpec(spki));
        return rawPublic((ECPublicKey) k);
    }

    /** WebCrypto-style private JWK {kty,crv,x,y,d,...}. */
    static JSONObject toJwk(ECPrivateKey priv, ECPublicKey pub) throws Exception {
        JSONObject j = new JSONObject();
        j.put("kty", "EC");
        j.put("crv", "P-256");
        j.put("x", b64url(fixed32(pub.getW().getAffineX())));
        j.put("y", b64url(fixed32(pub.getW().getAffineY())));
        j.put("d", b64url(fixed32(priv.getS())));
        j.put("ext", true);
        return j;
    }

    static PrivateKey privateFromJwk(JSONObject jwk) throws Exception {
        BigInteger d = new BigInteger(1, unb64url(jwk.getString("d")));
        return KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(d, p256()));
    }

    /** Derives the public point for a private scalar (used when only PKCS8 is available). */
    public static JSONObject jwkFromPrivate(PrivateKey priv) throws Exception {
        ECPrivateKey ep = (ECPrivateKey) priv;
        ECParameterSpec spec = ep.getParams();
        // scalar multiplication through a throwaway KeyPairGenerator is not possible; do it with BigInteger math.
        ECPoint q = multiply(spec, ep.getS());
        JSONObject j = new JSONObject();
        j.put("kty", "EC"); j.put("crv", "P-256");
        j.put("x", b64url(fixed32(q.getAffineX())));
        j.put("y", b64url(fixed32(q.getAffineY())));
        j.put("d", b64url(fixed32(ep.getS())));
        j.put("ext", true);
        return j;
    }

    private static ECPoint multiply(ECParameterSpec spec, BigInteger k) {
        BigInteger p = ((java.security.spec.ECFieldFp) spec.getCurve().getField()).getP();
        BigInteger a = spec.getCurve().getA();
        ECPoint result = ECPoint.POINT_INFINITY;
        ECPoint addend = spec.getGenerator();
        for (int i = 0; i < k.bitLength(); i++) {
            if (k.testBit(i)) result = add(result, addend, a, p);
            addend = add(addend, addend, a, p);
        }
        return result;
    }

    private static ECPoint add(ECPoint p1, ECPoint p2, BigInteger a, BigInteger p) {
        if (p1.equals(ECPoint.POINT_INFINITY)) return p2;
        if (p2.equals(ECPoint.POINT_INFINITY)) return p1;
        BigInteger x1 = p1.getAffineX(), y1 = p1.getAffineY(), x2 = p2.getAffineX(), y2 = p2.getAffineY();
        BigInteger l;
        if (x1.equals(x2)) {
            if (!y1.equals(y2) || y1.signum() == 0) return ECPoint.POINT_INFINITY;
            l = x1.multiply(x1).multiply(BigInteger.valueOf(3)).add(a).multiply(y1.shiftLeft(1).modInverse(p)).mod(p);
        } else {
            l = y2.subtract(y1).multiply(x2.subtract(x1).modInverse(p)).mod(p);
        }
        BigInteger x3 = l.multiply(l).subtract(x1).subtract(x2).mod(p);
        BigInteger y3 = l.multiply(x1.subtract(x3)).subtract(y1).mod(p);
        return new ECPoint(x3, y3);
    }

    static final class Dh {
        final PrivateKey priv; final String pubRawB64; final JSONObject privJwk;
        Dh(PrivateKey priv, String pubRawB64, JSONObject privJwk) { this.priv = priv; this.pubRawB64 = pubRawB64; this.privJwk = privJwk; }
    }

    static Dh genDh() throws Exception {
        KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
        g.initialize(new ECGenParameterSpec("secp256r1"), RNG);
        KeyPair kp = g.generateKeyPair();
        ECPrivateKey priv = (ECPrivateKey) kp.getPrivate();
        ECPublicKey pub = (ECPublicKey) kp.getPublic();
        return new Dh(priv, b64(rawPublic(pub)), toJwk(priv, pub));
    }

    static byte[] dh(PrivateKey priv, PublicKey pub) throws Exception {
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(priv);
        ka.doPhase(pub, true);
        return ka.generateSecret(); // 32-byte X coordinate == WebCrypto deriveBits(256)
    }

    // ------------------------------------------------------------------ KDFs

    private static byte[] hmac(byte[] key, byte[] msg) throws Exception {
        Mac m = Mac.getInstance("HmacSHA256");
        m.init(new SecretKeySpec(key.length == 0 ? new byte[32] : key, "HmacSHA256"));
        return m.doFinal(msg);
    }

    private static byte[] hkdf(byte[] ikm, byte[] salt, byte[] info, int length) throws Exception {
        byte[] prk = hmac(salt.length == 0 ? new byte[32] : salt, ikm);
        byte[] out = new byte[length];
        byte[] t = new byte[0];
        int pos = 0;
        for (int i = 1; pos < length; i++) {
            Mac m = Mac.getInstance("HmacSHA256");
            m.init(new SecretKeySpec(prk, "HmacSHA256"));
            m.update(t); m.update(info); m.update((byte) i);
            t = m.doFinal();
            int n = Math.min(t.length, length - pos);
            System.arraycopy(t, 0, out, pos, n);
            pos += n;
        }
        return out;
    }

    private static byte[][] kdfRk(byte[] rootKey, byte[] dhOut) throws Exception {
        byte[] out = hkdf(dhOut, rootKey, INFO_RK, 64);
        return new byte[][]{java.util.Arrays.copyOfRange(out, 0, 32), java.util.Arrays.copyOfRange(out, 32, 64)};
    }

    private static byte[][] kdfCk(byte[] chainKey) throws Exception {
        return new byte[][]{hmac(chainKey, new byte[]{1}), hmac(chainKey, new byte[]{2})}; // {messageKey, nextChainKey}
    }

    // ------------------------------------------------------------------ AEAD

    private static byte[] headerBytes(String dh, int pn, int n) {
        // Must equal JSON.stringify({ dh, pn, n }) in the web client byte-for-byte.
        return ("{\"dh\":" + JSONObject.quote(dh).replace("\\/", "/") + ",\"pn\":" + pn + ",\"n\":" + n + "}")
                .getBytes(StandardCharsets.UTF_8);
    }

    private static String[] aesEncrypt(byte[] mk, byte[] pt, byte[] aad) throws Exception {
        byte[] iv = new byte[12];
        RNG.nextBytes(iv);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(mk, "AES"), new GCMParameterSpec(128, iv));
        c.updateAAD(aad);
        return new String[]{b64(iv), b64(c.doFinal(pt))};
    }

    private static String aesDecrypt(byte[] mk, String ivB64, String ctB64, byte[] aad) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(mk, "AES"), new GCMParameterSpec(128, unb64(ivB64)));
        c.updateAAD(aad);
        return new String(c.doFinal(unb64(ctB64)), StandardCharsets.UTF_8);
    }

    // ------------------------------------------------------------------ session

    public static JSONObject newEmptySession() throws Exception {
        JSONObject s = new JSONObject();
        s.put("v", 3);
        s.put("DHs_priv", JSONObject.NULL); s.put("DHs_pub", JSONObject.NULL); s.put("DHr", JSONObject.NULL);
        s.put("RK", JSONObject.NULL); s.put("CKs", JSONObject.NULL); s.put("CKr", JSONObject.NULL);
        s.put("Ns", 0); s.put("Nr", 0); s.put("PN", 0);
        s.put("skipped", new JSONObject());
        return s;
    }

    private static boolean has(JSONObject s, String k) { return s.has(k) && !s.isNull(k) && !"".equals(s.opt(k)); }

    /** shared = ECDH(myIdentityPriv, peerIdentityPub); peerBootstrapPubRawB64 = peer identity as a raw point. */
    public static JSONObject initSessionAsSender(byte[] shared, String peerBootstrapPubRawB64) throws Exception {
        JSONObject s = newEmptySession();
        Dh d = genDh();
        s.put("DHs_priv", d.privJwk); s.put("DHs_pub", d.pubRawB64); s.put("DHr", peerBootstrapPubRawB64);
        byte[][] r = kdfRk(shared, dh(d.priv, publicFromRaw(unb64(peerBootstrapPubRawB64))));
        s.put("RK", b64(r[0])); s.put("CKs", b64(r[1]));
        return s;
    }

    public static JSONObject initSessionAsReceiver(byte[] shared, JSONObject myBootstrapPrivJwk, String theirFirstDhPubB64) throws Exception {
        JSONObject s = newEmptySession();
        s.put("DHs_priv", myBootstrapPrivJwk); s.put("DHr", theirFirstDhPubB64);
        byte[][] r = kdfRk(shared, dh(privateFromJwk(myBootstrapPrivJwk), publicFromRaw(unb64(theirFirstDhPubB64))));
        s.put("RK", b64(r[0])); s.put("CKr", b64(r[1]));
        return s;
    }

    /** Mutates {@code session}; returns the envelope {v:3,hdr:{dh,pn,n},iv,ct}. */
    public static JSONObject ratchetEncrypt(JSONObject session, String plaintext) throws Exception {
        if (!has(session, "CKs")) {
            Dh d = genDh();
            session.put("PN", session.getInt("Ns")); session.put("Ns", 0);
            session.put("DHs_priv", d.privJwk); session.put("DHs_pub", d.pubRawB64);
            byte[][] r = kdfRk(unb64(session.getString("RK")), dh(d.priv, publicFromRaw(unb64(session.getString("DHr")))));
            session.put("RK", b64(r[0])); session.put("CKs", b64(r[1]));
        }
        byte[][] k = kdfCk(unb64(session.getString("CKs")));
        String dhPub = session.getString("DHs_pub");
        int pn = session.getInt("PN"), n = session.getInt("Ns");
        session.put("CKs", b64(k[1])); session.put("Ns", n + 1);
        String[] ivCt = aesEncrypt(k[0], plaintext.getBytes(StandardCharsets.UTF_8), headerBytes(dhPub, pn, n));
        JSONObject hdr = new JSONObject();
        hdr.put("dh", dhPub); hdr.put("pn", pn); hdr.put("n", n);
        JSONObject env = new JSONObject();
        env.put("v", 3); env.put("hdr", hdr); env.put("iv", ivCt[0]); env.put("ct", ivCt[1]);
        return env;
    }

    private static void skipMessageKeys(JSONObject s, int untilN) throws Exception {
        if (s.getInt("Nr") + MAX_SKIP < untilN) throw new Exception("Too many skipped messages — refusing (possible attack or badly broken connection)");
        if (!has(s, "CKr")) return;
        JSONObject skipped = s.optJSONObject("skipped");
        if (skipped == null) { skipped = new JSONObject(); s.put("skipped", skipped); }
        while (s.getInt("Nr") < untilN) {
            if (skipped.length() >= MAX_SKIP) throw new Exception("Too many stored skipped message keys — refusing");
            byte[][] k = kdfCk(unb64(s.getString("CKr")));
            skipped.put(s.getString("DHr") + ":" + s.getInt("Nr"), b64(k[0]));
            s.put("CKr", b64(k[1])); s.put("Nr", s.getInt("Nr") + 1);
        }
    }

    /**
     * Decrypts and advances {@code session} IN PLACE. Like the JS version this is not transactional on a
     * thrown error: callers that want rollback semantics must pass a copy (NecpraE2E does).
     */
    public static String ratchetDecrypt(JSONObject s, JSONObject envelope) throws Exception {
        if (s.optJSONObject("skipped") == null) s.put("skipped", new JSONObject());
        JSONObject hdr = envelope.optJSONObject("hdr");
        if (hdr == null || !hdr.has("dh") || !(hdr.opt("n") instanceof Number) || !(hdr.opt("pn") instanceof Number))
            throw new Exception("Invalid Double Ratchet header");
        String hdh = hdr.getString("dh"); int hn = hdr.getInt("n"), hpn = hdr.getInt("pn");
        byte[] aad = headerBytes(hdh, hpn, hn);
        String id = hdh + ":" + hn;
        JSONObject skipped = s.getJSONObject("skipped");
        if (skipped.has(id)) {
            byte[] mk = unb64(skipped.getString(id));
            skipped.remove(id);
            return aesDecrypt(mk, envelope.getString("iv"), envelope.getString("ct"), aad);
        }
        if (!hdh.equals(s.optString("DHr", null))) {
            if (has(s, "CKr")) skipMessageKeys(s, hpn);
            if (!has(s, "DHs_priv") || !has(s, "RK")) throw new Exception("Receiving ratchet is not initialized");
            byte[][] r = kdfRk(unb64(s.getString("RK")), dh(privateFromJwk(s.getJSONObject("DHs_priv")), publicFromRaw(unb64(hdh))));
            s.put("RK", b64(r[0])); s.put("CKr", b64(r[1])); s.put("DHr", hdh); s.put("Nr", 0); s.put("CKs", JSONObject.NULL);
        }
        if (!has(s, "CKr")) throw new Exception("Receiving chain is unavailable");
        skipMessageKeys(s, hn);
        byte[][] k = kdfCk(unb64(s.getString("CKr")));
        s.put("CKr", b64(k[1])); s.put("Nr", s.getInt("Nr") + 1);
        return aesDecrypt(k[0], envelope.getString("iv"), envelope.getString("ct"), aad);
    }
}
