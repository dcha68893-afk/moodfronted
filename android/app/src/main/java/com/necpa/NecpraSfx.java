package com.necpa;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.view.View;

/**
 * Game sound effects synthesised in code (no audio assets to ship) plus haptic feedback. Every sound is a short PCM
 * buffer rendered once and replayed through a static AudioTrack. Safe to call from any thread; a failing audio
 * device never throws into the game loop.
 */
public final class NecpraSfx {
    public static final int TAP = 0, POUR = 1, PLACE = 2, CLEAR = 3, WIN = 4, FAIL = 5, COIN = 6, ERROR = 7, MOVE = 8, CAPTURE = 9, CORRECT = 10, WRONG = 11, TICK = 12, WORD = 13, COUNT = 14;

    private static final int RATE = 22050;
    private final AudioTrack[] tracks = new AudioTrack[COUNT];
    private boolean enabled = true;
    private boolean haptics = true;

    public void configure(boolean sound, boolean haptic) {
        enabled = sound;
        haptics = haptic;
    }

    public void play(int id) {
        if (!enabled || id < 0 || id >= COUNT) return;
        try {
            AudioTrack t;
            synchronized (this) {
                t = tracks[id];
                if (t == null) {
                    short[] pcm = render(id);
                    AudioAttributes attrs = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_GAME)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
                    AudioFormat fmt = new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(RATE).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build();
                    t = new AudioTrack(attrs, fmt, pcm.length * 2, AudioTrack.MODE_STATIC, AudioManager.AUDIO_SESSION_ID_GENERATE);
                    t.write(pcm, 0, pcm.length);
                    tracks[id] = t;
                }
            }
            t.stop();
            t.reloadStaticData();
            t.play();
        } catch (Throwable ignored) {
            // audio is optional; never break gameplay
        }
    }

    public void release() {
        synchronized (this) {
            for (int i = 0; i < COUNT; i++) {
                if (tracks[i] != null) {
                    try {
                        tracks[i].release();
                    } catch (Throwable ignored) { }
                    tracks[i] = null;
                }
            }
        }
    }

    /** kind: 0 light tick, 1 confirm, 2 reject. */
    public void haptic(View v, int kind) {
        if (!haptics || v == null) return;
        try {
            int c;
            if (kind == 1) c = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY;
            else if (kind == 2) c = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS;
            else c = HapticFeedbackConstants.KEYBOARD_TAP;
            v.performHapticFeedback(c);
        } catch (Throwable ignored) { }
    }

    // ------------------------------------------------------------------ synthesis

    private static short[] render(int id) {
        switch (id) {
            case TAP: return tone(new float[]{880}, 0.05f, 0.28f, 0f);
            case POUR: return pour();
            case PLACE: return thud(150f, 0.16f, 0.6f);
            case CLEAR: return tone(new float[]{523, 659, 784, 1047}, 0.09f, 0.34f, 0f);
            case WIN: return tone(new float[]{523, 659, 784, 1047, 784, 1047, 1319}, 0.11f, 0.36f, 0.03f);
            case FAIL: return tone(new float[]{392, 349, 311, 262}, 0.16f, 0.32f, 0f);
            case COIN: return tone(new float[]{988, 1319}, 0.07f, 0.3f, 0f);
            case ERROR: return buzz(0.14f);
            case MOVE: return click(0.06f, 0.5f);
            case CAPTURE: return click(0.11f, 0.85f);
            case CORRECT: return tone(new float[]{659, 988}, 0.09f, 0.34f, 0f);
            case WRONG: return tone(new float[]{233, 196}, 0.14f, 0.34f, 0f);
            case TICK: return click(0.03f, 0.25f);
            case WORD: return tone(new float[]{698, 880, 1047}, 0.07f, 0.3f, 0f);
            default: return new short[RATE / 20];
        }
    }

    /** Sequence of sine notes with a soft attack/decay envelope. */
    private static short[] tone(float[] freqs, float noteLen, float gain, float gap) {
        int per = (int) (noteLen * RATE), gp = (int) (gap * RATE);
        short[] out = new short[(per + gp) * freqs.length + RATE / 30];
        int o = 0;
        for (float f : freqs) {
            for (int i = 0; i < per; i++) {
                float t = i / (float) RATE;
                float env = (float) Math.min(1.0, i / (RATE * 0.004)) * (1f - i / (float) per);
                float s = (float) (Math.sin(2 * Math.PI * f * t) * 0.8 + Math.sin(2 * Math.PI * f * 2 * t) * 0.2);
                out[o++] = (short) (s * env * gain * 32767);
            }
            o += gp;
        }
        return out;
    }

    private static short[] thud(float f0, float len, float gain) {
        int n = (int) (len * RATE);
        short[] out = new short[n];
        double ph = 0;
        for (int i = 0; i < n; i++) {
            float p = i / (float) n;
            double f = f0 * (1.0 - 0.55 * p);
            ph += 2 * Math.PI * f / RATE;
            float env = (1f - p) * (1f - p);
            out[i] = (short) (Math.sin(ph) * env * gain * 32767);
        }
        return out;
    }

    private static short[] click(float len, float gain) {
        int n = (int) (len * RATE);
        short[] out = new short[n];
        java.util.Random r = new java.util.Random(3);
        float lp = 0;
        for (int i = 0; i < n; i++) {
            float p = i / (float) n;
            lp += (r.nextFloat() * 2 - 1 - lp) * 0.35f;
            float env = (1f - p) * (1f - p) * (1f - p);
            float knock = (float) Math.sin(2 * Math.PI * 320 * i / RATE) * 0.5f;
            out[i] = (short) ((lp + knock) * env * gain * 32767 * 0.7f);
        }
        return out;
    }

    private static short[] buzz(float len) {
        int n = (int) (len * RATE);
        short[] out = new short[n];
        for (int i = 0; i < n; i++) {
            float p = i / (float) n;
            float sq = ((i / (RATE / 150)) % 2 == 0) ? 1f : -1f;
            out[i] = (short) (sq * (1f - p) * 0.22f * 32767);
        }
        return out;
    }

    /** Rising bubbly gurgle: band-limited noise with a sweeping tone. */
    private static short[] pour() {
        int n = (int) (0.34f * RATE);
        short[] out = new short[n];
        java.util.Random r = new java.util.Random(11);
        double ph = 0;
        float lp = 0;
        for (int i = 0; i < n; i++) {
            float p = i / (float) n;
            double f = 280 + 520 * p + 70 * Math.sin(p * 40);
            ph += 2 * Math.PI * f / RATE;
            lp += (r.nextFloat() * 2 - 1 - lp) * 0.12f;
            float env = (float) Math.min(1.0, p * 10) * (1f - p * 0.6f) * (p < 0.9f ? 1f : (1f - p) * 10f);
            out[i] = (short) ((Math.sin(ph) * 0.45 + lp * 0.9) * env * 0.4f * 32767);
        }
        return out;
    }
}
