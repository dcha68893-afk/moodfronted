package com.necpa;

/** Tiny Base64 so the crypto core works on minSdk 24 (java.util.Base64 needs API 26) and on a plain JVM test run. */
final class NecpraB64 {
    private static final char[] STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".toCharArray();
    private static final int[] REV = new int[128];
    static { java.util.Arrays.fill(REV, -1); for (int i = 0; i < 64; i++) REV[STD[i]] = i; REV['-'] = 62; REV['_'] = 63; }

    private NecpraB64() {}

    static String enc(byte[] in) { return encode(in, true, false); }
    static String encUrl(byte[] in) { return encode(in, false, true); }

    private static String encode(byte[] in, boolean pad, boolean url) {
        StringBuilder sb = new StringBuilder((in.length + 2) / 3 * 4);
        for (int i = 0; i < in.length; i += 3) {
            int b = (in[i] & 0xff) << 16 | (i + 1 < in.length ? (in[i + 1] & 0xff) << 8 : 0) | (i + 2 < in.length ? in[i + 2] & 0xff : 0);
            char[] c = {STD[b >> 18 & 63], STD[b >> 12 & 63], STD[b >> 6 & 63], STD[b & 63]};
            int n = Math.min(3, in.length - i) + 1;
            for (int k = 0; k < 4; k++) {
                if (k < n) sb.append(url ? (c[k] == '+' ? '-' : c[k] == '/' ? '_' : c[k]) : c[k]);
                else if (pad) sb.append('=');
            }
        }
        return sb.toString();
    }

    /** Accepts standard or URL-safe alphabets, with or without padding. */
    static byte[] dec(String s) {
        int len = s.length();
        while (len > 0 && s.charAt(len - 1) == '=') len--;
        byte[] out = new byte[len * 6 / 8];
        int buf = 0, bits = 0, o = 0;
        for (int i = 0; i < len; i++) {
            char ch = s.charAt(i);
            int v = ch < 128 ? REV[ch] : -1;
            if (v < 0) throw new IllegalArgumentException("Illegal base64 character");
            buf = buf << 6 | v; bits += 6;
            if (bits >= 8) { bits -= 8; out[o++] = (byte) (buf >> bits); buf &= (1 << bits) - 1; }
        }
        return o == out.length ? out : java.util.Arrays.copyOf(out, o);
    }
}
