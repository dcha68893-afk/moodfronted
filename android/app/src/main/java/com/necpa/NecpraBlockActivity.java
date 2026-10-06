package com.necpa;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Native 3D Block Puzzle: a 10x10 board of glossy blocks, three pieces in a tray plus a HOLD slot. Pieces are dragged
 * with the finger (lifted above it so the thumb never hides the piece), snap to the nearest legal spot with a ghost
 * preview that also lights up the lines it would clear. Rules come from {@link NecpraBlockEngine}.
 */
public class NecpraBlockActivity extends NecpraGameActivity {
    private static final int[] POWER_COST = {8, 12, 20};   // rotate, shuffle, blast: price of one extra charge
    private static final int CONTINUE_COST = 10;
    private static final int LEVEL_REWARD = 50;
    private static final int[] PALETTE = {0x24A8FF, 0x9B6CFF, 0x20E06B, 0xFF7A18, 0xFF3E55, 0xFFD21F};

    private boolean roomMode;
    private String roomCode;
    private NecpraRoomSession room;
    private boolean roomStarted, submittedRoom;
    private long matchStartMs;

    private NecpraGl.View glView;
    private BlockScene scene;
    private TextView tvLevel, tvScore, tvCombo, tvInfo, tvOpp;
    private TextView btnRotate, btnShuffle, btnBlast, btnHold;
    private View progressFill;
    private FrameLayout progressTrack;
    private LinearLayout hudTop, hudBottom;
    private FrameLayout.LayoutParams hudTopLp, hudBottomLp;
    private volatile String saveBlob;
    private int levelNo = 1;

    @Override protected String gameId() { return "block"; }

    @Override protected String gameTitle() {
        return getIntent() != null && getIntent().getStringExtra(EXTRA_ROOM) != null ? "Block Puzzle · Match" : "Block Puzzle";
    }

    // ------------------------------------------------------------------ build

    @Override
    protected void onBuild(Bundle saved) {
        roomCode = getIntent().getStringExtra(EXTRA_ROOM);
        roomMode = roomCode != null;
        scene = new BlockScene();
        glView = new NecpraGl.View(this, scene);
        stage.addView(glView, new FrameLayout.LayoutParams(-1, -1));
        buildHud();

        if (roomMode) {
            tvInfo.setText("Joining match…");
            room = new NecpraRoomSession(this, roomCode, new NecpraRoomSession.Listener() {
                @Override public void onRoom(JSONObject r) { onRoomUpdate(r); }
                @Override public void onProblem(String msg, boolean fatal) {
                    if (fatal) {
                        message("Match unavailable", msg, "OK");
                        main.postDelayed(new Runnable() {
                            @Override public void run() { if (!dead()) finish(); }
                        }, 2600);
                    } else {
                        toast(msg);
                    }
                }
            });
            room.start();
        } else {
            int want = getIntent().getIntExtra(EXTRA_LEVEL, 0);
            if (want > 0) store.adoptLevel("block", want);
            levelNo = store.level("block");
            NecpraBlockEngine e = null;
            String r = store.resume("block");
            if (r != null) {
                NecpraBlockEngine d = NecpraBlockEngine.deserialize(r, store.difficulty());
                if (d != null && !d.isOver() && !d.isLevelComplete() && d.level() == levelNo) e = d;
            }
            if (e == null) e = new NecpraBlockEngine(levelNo, store.difficulty(), System.nanoTime());
            install(e, true);
        }
        pullServerCoins();
    }

    private void buildHud() {
        hudTop = row();
        hudTop.setGravity(Gravity.CENTER);
        tvLevel = statChip("LEVEL 1");
        tvScore = statChip("0 / 500");
        tvCombo = statChip("COMBO ×0");
        for (TextView t : new TextView[]{tvLevel, tvScore, tvCombo}) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.leftMargin = lp.rightMargin = dp(4);
            hudTop.addView(t, lp);
        }
        hudTopLp = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        stage.addView(hudTop, hudTopLp);

        progressTrack = new FrameLayout(this);
        progressTrack.setBackground(round(alpha(cLine, 0xB0), 4));
        progressFill = new View(this);
        progressFill.setBackground(round(cPrimary, 4));
        progressTrack.addView(progressFill, new FrameLayout.LayoutParams(0, -1));
        FrameLayout.LayoutParams plp = new FrameLayout.LayoutParams(-1, dp(6), Gravity.TOP);
        plp.leftMargin = plp.rightMargin = dp(28);
        stage.addView(progressTrack, plp);

        tvInfo = text("", 13, cSub, true);
        tvInfo.setGravity(Gravity.CENTER);
        stage.addView(tvInfo, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        tvOpp = text("", 13, cText, true);
        tvOpp.setGravity(Gravity.CENTER);
        tvOpp.setVisibility(View.GONE);
        tvOpp.setBackground(roundStroke(alpha(cCard, 0xE0), cLine, 14));
        tvOpp.setPadding(dp(12), dp(6), dp(12), dp(6));
        stage.addView(tvOpp, new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL));

        hudBottom = row();
        hudBottom.setGravity(Gravity.CENTER);
        btnRotate = toolButton("↻\nRotate", new Runnable() { @Override public void run() { power(NecpraBlockEngine.POWER_ROTATE); } });
        btnShuffle = toolButton("🔀\nShuffle", new Runnable() { @Override public void run() { power(NecpraBlockEngine.POWER_SHUFFLE); } });
        btnBlast = toolButton("💥\nBlast", new Runnable() { @Override public void run() { power(NecpraBlockEngine.POWER_BLAST); } });
        btnHold = toolButton("⟳\nRestart", new Runnable() { @Override public void run() { askRestart(); } });
        for (TextView t : new TextView[]{btnRotate, btnShuffle, btnBlast, btnHold}) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(62), 1f);
            lp.leftMargin = lp.rightMargin = dp(5);
            hudBottom.addView(t, lp);
        }
        hudBottomLp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        hudBottomLp.leftMargin = hudBottomLp.rightMargin = dp(10);
        stage.addView(hudBottom, hudBottomLp);
        applyHudInsets();
    }

    private void applyHudInsets() {
        if (hudTopLp == null) return;
        hudTopLp.topMargin = topBarHeight() + dp(2);
        hudTop.setLayoutParams(hudTopLp);
        FrameLayout.LayoutParams plp = (FrameLayout.LayoutParams) progressTrack.getLayoutParams();
        plp.topMargin = topBarHeight() + dp(48);
        progressTrack.setLayoutParams(plp);
        FrameLayout.LayoutParams ilp = (FrameLayout.LayoutParams) tvInfo.getLayoutParams();
        ilp.topMargin = topBarHeight() + dp(60);
        tvInfo.setLayoutParams(ilp);
        FrameLayout.LayoutParams olp = (FrameLayout.LayoutParams) tvOpp.getLayoutParams();
        olp.topMargin = topBarHeight() + dp(82);
        tvOpp.setLayoutParams(olp);
        hudBottomLp.bottomMargin = insetBottom + dp(12);
        hudBottom.setLayoutParams(hudBottomLp);
    }

    @Override protected void onInsets(int top, int bottom, int left, int right) {
        applyHudInsets();
        if (scene != null) scene.requestFit();
    }

    private void onGl(Runnable r) { if (glView != null) glView.queueEvent(r); }

    private void install(final NecpraBlockEngine e, final boolean fresh) {
        onGl(new Runnable() { @Override public void run() { scene.setEngine(e, fresh); } });
        hud(e.level(), e.score(), e.target(), e.combo(), e.charges(0), e.charges(1), e.charges(2));
    }

    // ------------------------------------------------------------------ HUD

    void hud(final int level, final int score, final int target, final int combo, final int cr, final int cs, final int cb) {
        ui(new Runnable() {
            @Override public void run() {
                levelNo = level;
                tvLevel.setText("LEVEL " + level);
                tvScore.setText(String.format(java.util.Locale.US, "%,d / %,d", score, target));
                tvCombo.setText("COMBO ×" + combo);
                tvCombo.setTextColor(combo >= 2 ? cGold : cText);
                float f = Math.max(0f, Math.min(1f, score / (float) Math.max(1, target)));
                int w = Math.round((progressTrack.getWidth()) * f);
                FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) progressFill.getLayoutParams();
                lp.width = w;
                progressFill.setLayoutParams(lp);
                btnRotate.setText("↻  " + (cr > 0 ? "×" + cr : "🪙" + POWER_COST[0]) + "\nRotate");
                btnShuffle.setText("🔀  " + (cs > 0 ? "×" + cs : "🪙" + POWER_COST[1]) + "\nShuffle");
                btnBlast.setText("💥  " + (cb > 0 ? "×" + cb : "🪙" + POWER_COST[2]) + "\nBlast");
                if (!roomMode) tvInfo.setText("Drag a piece onto the board · swipe it to HOLD to save it");
            }
        });
    }

    void setSave(String s) { saveBlob = s; }

    @Override protected void onSaveGame() {
        String b = saveBlob;
        if (b != null && !roomMode) store.saveResume("block", b);
    }

    @Override protected void onPause() {
        super.onPause();
        if (glView != null) glView.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        if (glView != null) glView.onResume();
    }

    @Override protected void onDestroy() {
        if (room != null) room.stop();
        super.onDestroy();
    }

    @Override protected void onBackRequested() {
        if (roomMode && !submittedRoom) {
            confirm("Leave the match?", "Your opponent keeps playing and you forfeit this round.", "Leave", "Stay", true,
                    new Runnable() { @Override public void run() { finish(); } });
            return;
        }
        finish();
    }

    // ------------------------------------------------------------------ actions

    private void power(final int which) {
        if (roomMode) {
            toast("Power-ups are off in live matches");
            return;
        }
        onGl(new Runnable() {
            @Override public void run() {
                final int have = scene.charges(which);
                if (have > 0) {
                    scene.usePower(which);
                    return;
                }
                ui(new Runnable() {
                    @Override public void run() {
                        String[] names = {"A rotate", "A shuffle", "A blast"};
                        pay(POWER_COST[which], names[which], new Runnable() {
                            @Override public void run() {
                                onGl(new Runnable() {
                                    @Override public void run() {
                                        scene.addCharge(which);
                                        scene.usePower(which);
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    }

    /** GL thread asks to refund when a purchased power could not be used (nothing to rotate / nothing to blast). */
    void refundPower(final int which) {
        ui(new Runnable() {
            @Override public void run() {
                store.add(POWER_COST[which]);
                updateCoins(false);
                toast(which == NecpraBlockEngine.POWER_BLAST ? "Nothing to blast in the centre yet" : "Nothing to do right now");
            }
        });
    }

    private void askRestart() {
        if (roomMode) {
            toast("You can't restart a live match");
            return;
        }
        confirm("Start this level over?", "Your board and score for this level are lost.", "Restart", "Keep playing", true, new Runnable() {
            @Override public void run() {
                store.saveResume("block", null);
                install(new NecpraBlockEngine(levelNo, store.difficulty(), System.nanoTime()), true);
            }
        });
    }

    /** GL thread: a legal placement happened. */
    void afterPlace(NecpraBlockEngine e, NecpraBlockEngine.PlaceResult r) {
        hud(e.level(), e.score(), e.target(), e.combo(), e.charges(0), e.charges(1), e.charges(2));
        roomProgress(e);
    }

    void sound(int id) { sfx.play(id); }

    void buzz(int kind) { sfx.haptic(root, kind); }

    void say(final String s) {
        ui(new Runnable() {
            @Override public void run() { toast(s); }
        });
    }

    void floating(final String s, final float x, final float y, final int color) {
        ui(new Runnable() {
            @Override public void run() { floatText(s, x, y, color); }
        });
    }

    void onLevelComplete(final int level, final int score) {
        ui(new Runnable() {
            @Override public void run() {
                sfx.play(NecpraSfx.WIN);
                sfx.haptic(root, 1);
                saveBlob = null;
                if (roomMode) {
                    submitRoom(score);
                    return;
                }
                store.saveResume("block", null);
                store.recordGame("block", score, level + 1);
                store.setLevel("block", Math.max(store.level("block"), level + 1));
                earn(LEVEL_REWARD, null);
                final int next = level + 1;
                resultCard("Level " + level + " complete!", "Next target: " + String.format(java.util.Locale.US, "%,d", NecpraBlockEngine.targetFor(next)) + " points",
                        3, new String[][]{{"Score", String.format(java.util.Locale.US, "%,d", score)}, {"Coins", "🪙 +" + LEVEL_REWARD}},
                        "Next level", new Runnable() {
                            @Override public void run() {
                                levelNo = next;
                                install(new NecpraBlockEngine(next, store.difficulty(), System.nanoTime()), true);
                            }
                        }, "Menu", new Runnable() { @Override public void run() { finish(); } });
            }
        });
    }

    void onGameOver(final int level, final int score) {
        ui(new Runnable() {
            @Override public void run() {
                sfx.play(NecpraSfx.FAIL);
                sfx.haptic(root, 2);
                saveBlob = null;
                if (roomMode) {
                    submitRoom(score);
                    return;
                }
                store.saveResume("block", null);
                store.recordGame("block", score, level);
                LinearLayout c = column();
                c.addView(text("No more moves", 22, cText, true));
                TextView b = text("Score " + String.format(java.util.Locale.US, "%,d", score) + ". Spend 🪙 " + CONTINUE_COST
                        + " to clear a few blocks and keep going.", 14.5f, cSub, false);
                b.setPadding(0, dp(8), 0, dp(16));
                c.addView(b);
                final Modal m = modal(c, false);
                c.addView(button("Continue 🪙 " + CONTINUE_COST, GOLD, new Runnable() {
                    @Override public void run() {
                        pay(CONTINUE_COST, "Continue", new Runnable() {
                            @Override public void run() {
                                m.dismiss();
                                onGl(new Runnable() { @Override public void run() { scene.doContinue(); } });
                            }
                        });
                    }
                }));
                c.addView(space(8));
                c.addView(button("New game", PRIMARY, new Runnable() {
                    @Override public void run() {
                        m.dismiss();
                        install(new NecpraBlockEngine(level, store.difficulty(), System.nanoTime()), true);
                    }
                }));
                c.addView(space(8));
                c.addView(button("Menu", SECONDARY, new Runnable() {
                    @Override public void run() {
                        m.dismiss();
                        finish();
                    }
                }));
            }
        });
    }

    // ------------------------------------------------------------------ rooms

    private void onRoomUpdate(JSONObject r) {
        if (!roomStarted) {
            roomStarted = true;
            levelNo = NecpraRoomSession.levelOf(r);
            long seed = NecpraRoomSession.seedOf(r);
            install(new NecpraBlockEngine(levelNo, "moderate", seed == 0 ? 1 : seed), true);
        }
        String st = NecpraRoomSession.statusOf(r);
        boolean playing = "playing".equals(st) || "finished".equals(st);
        scene.setLocked(!playing || submittedRoom);
        if (!playing) tvInfo.setText("Waiting for your friend…  Code " + roomCode);
        else {
            if (matchStartMs == 0) matchStartMs = System.currentTimeMillis();
            if (!submittedRoom) tvInfo.setText("First to the target score wins!");
        }
        JSONObject opp = room.opponent();
        if (opp != null) {
            tvOpp.setVisibility(View.VISIBLE);
            tvOpp.setText("Opponent · " + opp.optInt("progress", 0) + "%  ·  " + opp.optInt("score", 0) + " pts"
                    + (opp.optBoolean("completed") ? "  ✓ done" : ""));
        }
        if (room.finished() && submittedRoom) showRoomResult();
    }

    void roomProgress(NecpraBlockEngine e) {
        if (!roomMode || room == null || !roomStarted) return;
        try {
            JSONObject s = new JSONObject();
            s.put("score", e.score());
            s.put("answered", e.score());
            s.put("progress", Math.min(99, Math.round(e.score() / (float) Math.max(1, e.target()) * 100)));
            s.put("currentLevel", e.level());
            s.put("timeMs", matchStartMs == 0 ? 0 : System.currentTimeMillis() - matchStartMs);
            JSONArray board = new JSONArray();
            for (int r = 0; r < NecpraBlockEngine.N; r++) for (int c = 0; c < NecpraBlockEngine.N; c++) board.put(e.cell(r, c));
            JSONObject snap = new JSONObject();
            snap.put("board", board);
            snap.put("score", e.score());
            snap.put("level", e.level());
            s.put("snapshot", snap);
            room.push(s, e.score());
        } catch (Exception ignored) { }
    }

    private void submitRoom(final int score) {
        if (submittedRoom) return;
        submittedRoom = true;
        scene.setLocked(true);
        tvInfo.setText("Done! Waiting for the result…");
        long t = matchStartMs == 0 ? 0 : System.currentTimeMillis() - matchStartMs;
        room.submit(score, t, score, score, new NecpraRoomSession.ResultCallback() {
            @Override public void onResult(JSONObject response, String error) {
                if (error != null) toast(error);
                if (room != null && room.finished()) showRoomResult();
            }
        });
    }

    private void showRoomResult() {
        if (modalOpen()) return;
        JSONObject me = room.mePlayer(), opp = room.opponent();
        int mine = me == null ? 0 : me.optInt("score", 0), theirs = opp == null ? 0 : opp.optInt("score", 0);
        int reward = room.myReward();
        boolean won = reward >= 100 || mine > theirs;
        pullServerCoins();
        resultCard(won ? "You won!" : "Match finished", won ? "Higher score takes the match." : "Better luck in the rematch.", won ? 3 : 1,
                new String[][]{{"You", mine + " pts"}, {"Opponent", theirs + " pts"}, {"Reward", reward > 0 ? "🪙 " + reward : "—"}},
                "Done", new Runnable() { @Override public void run() { finish(); } }, null, null);
    }

    // =====================================================================================================
    // 3D scene
    // =====================================================================================================

    private final class BlockScene implements NecpraGl.Scene {
        static final int N = NecpraBlockEngine.N;
        static final float TRAY_Z = 7.7f, TRAY_SCALE = 0.55f, LIFT = 2.5f;
        final float[] SLOT_X = {-3.98f, -1.33f, 1.33f, 3.98f};

        NecpraBlockEngine eng;
        volatile boolean locked;
        boolean fitNeeded = true;
        float time, shake, camD = 22f, camShift, camLookZ, camLookY = 0f;
        final float camEl = (float) Math.toRadians(60);

        NecpraGl.Mesh cube, plate, tile, pad, disc, ring;
        NecpraGl.Particles burst = new NecpraGl.Particles(1500, 9f);
        NecpraGl.Particles motes = new NecpraGl.Particles(70, -0.1f);
        float moteClock;
        final Random random = new Random(5);

        final float[][] grow = new float[N][N];
        final float[][] delay = new float[N][N];
        final int[][] prev = new int[N][N];
        final List<float[]> dying = new ArrayList<>(); // r, c, color, t
        boolean prevValid;

        // tray display state (index 3 = hold)
        final NecpraBlockEngine.Piece[] last = new NecpraBlockEngine.Piece[4];
        final float[] px = new float[4], pz = new float[4], ps = new float[4], spawn = new float[4];

        // drag
        int dragSlot = -1;
        float dragX, dragZ, downX, downY;
        boolean moved;
        int ghostR = -1, ghostC = -1;
        boolean ghostOk;
        final boolean[] hlRow = new boolean[N], hlCol = new boolean[N];

        float levelDoneT = -1f;
        boolean overSent, doneSent;
        float gameOverT = -1f;

        void setLocked(boolean l) { locked = l; }

        void requestFit() { fitNeeded = true; }

        int charges(int w) { return eng == null ? 0 : eng.charges(w); }

        void addCharge(int w) { if (eng != null) eng.addCharge(w); }

        void setEngine(NecpraBlockEngine e, boolean fresh) {
            eng = e;
            if (!roomMode) locked = false;
            dragSlot = -1;
            ghostOk = false;
            levelDoneT = -1f;
            gameOverT = -1f;
            overSent = doneSent = false;
            dying.clear();
            for (int r = 0; r < N; r++) {
                for (int c = 0; c < N; c++) {
                    prev[r][c] = -1;
                    grow[r][c] = 0f;
                    delay[r][c] = fresh ? (r + c) * 0.025f : 0f;
                }
            }
            prevValid = true;
            for (int i = 0; i < 4; i++) {
                last[i] = null;
                spawn[i] = 0f;
            }
            persist();
            pushHud();
        }

        void pushHud() {
            if (eng != null) hud(eng.level(), eng.score(), eng.target(), eng.combo(), eng.charges(0), eng.charges(1), eng.charges(2));
        }

        void persist() {
            if (eng != null && !eng.isOver() && !eng.isLevelComplete()) setSave(eng.serialize());
        }

        // ------------------------------------------------------------ camera

        void fit(NecpraGl gl) {
            float topPx = topBarHeight() + dp(104), botPx = insetBottom + dp(92);
            float yTop = 1f - 2f * topPx / gl.height, yBot = -1f + 2f * botPx / gl.height;
            float x0 = -5.6f, x1 = 5.6f, zN = TRAY_Z + 1.5f, zF = -5.5f;
            float[][] cs = {{x0, 0, zN}, {x1, 0, zN}, {x0, 0.7f, zF}, {x1, 0.7f, zF}, {x0, 0.7f, zN}, {x1, 0.7f, zN}};
            camLookZ = (zN + zF) / 2f;
            gl.ndcShiftY = 0;
            camD = 40f;
            camShift = 0;
            for (float d = 9f; d <= 60f; d += 0.25f) {
                gl.camera(0, (float) Math.sin(camEl) * d, camLookZ + (float) Math.cos(camEl) * d, 0, 0, camLookZ, 38f);
                float minX = 9, maxX = -9, minY = 9, maxY = -9;
                for (float[] c : cs) {
                    float[] p = NecpraMath.transformPoint(gl.viewProj, c[0], c[1], c[2]);
                    minX = Math.min(minX, p[0]);
                    maxX = Math.max(maxX, p[0]);
                    minY = Math.min(minY, p[1]);
                    maxY = Math.max(maxY, p[1]);
                }
                camD = d;
                if (maxX - minX <= 2f * 0.96f && (maxY - minY) <= (yTop - yBot) * 0.99f) {
                    camShift = (yTop + yBot) / 2f - (maxY + minY) / 2f;
                    break;
                }
            }
            fitNeeded = false;
        }

        void applyCamera(NecpraGl gl) {
            gl.ndcShiftY = camShift;
            float sx = shake > 0 ? (float) Math.sin(time * 70f) * 0.12f * shake : 0f;
            float sy = shake > 0 ? (float) Math.cos(time * 63f) * 0.08f * shake : 0f;
            gl.camera(sx, (float) Math.sin(camEl) * camD + sy, camLookZ + (float) Math.cos(camEl) * camD, sx * 0.5f, 0, camLookZ, 38f);
        }

        // ------------------------------------------------------------ GL lifecycle

        @Override
        public void onGlReady(NecpraGl gl) {
            cube = gl.upload(NecpraMesh.roundedBox(0.94f, 0.62f, 0.94f, 0.17f, 4));
            plate = gl.upload(NecpraMesh.roundedBox(10.9f, 0.5f, 10.9f, 0.28f, 5));
            tile = gl.upload(NecpraMesh.roundedBox(0.95f, 0.08f, 0.95f, 0.03f, 2));
            pad = gl.upload(NecpraMesh.roundedBox(2.5f, 0.14f, 2.5f, 0.2f, 4));
            disc = gl.upload(NecpraGl.discMesh());
            ring = gl.upload(NecpraMesh.torus(0.7f, 0.04f, 36, 8));
            gl.sunX = -0.4f;
            gl.sunY = 0.95f;
            gl.sunZ = 0.5f;
            if (night) {
                gl.skyR = 0.5f; gl.skyG = 0.55f; gl.skyB = 0.8f;
                gl.groundR = 0.18f; gl.groundG = 0.16f; gl.groundB = 0.3f;
                gl.ambient = 0.64f;
            } else {
                gl.skyR = 0.8f; gl.skyG = 0.85f; gl.skyB = 1f;
                gl.groundR = 0.52f; gl.groundG = 0.48f; gl.groundB = 0.58f;
                gl.ambient = 0.7f;
            }
            fitNeeded = true;
        }

        @Override public void onSize(NecpraGl gl, int w, int h) { fitNeeded = true; }

        // ------------------------------------------------------------ update

        float rnd(float a, float b) { return a + random.nextFloat() * (b - a); }

        @Override
        public void update(NecpraGl gl, float dt) {
            time += dt;
            if (eng == null) return;
            if (fitNeeded) fit(gl);
            if (shake > 0) shake = Math.max(0, shake - dt * 3.2f);

            // cell diff: new blocks grow in, vanished blocks become dying blocks
            for (int r = 0; r < N; r++) {
                for (int c = 0; c < N; c++) {
                    int now = eng.cell(r, c), was = prev[r][c];
                    if (now >= 0 && was < 0) grow[r][c] = Math.min(grow[r][c], 0f) - delay[r][c];
                    if (now < 0 && was >= 0) {
                        dying.add(new float[]{r, c, was, 0f});
                        int rgb = PALETTE[was % 6];
                        burst.burst(c - 4.5f, 0.5f, r - 4.5f, 7, 3.2f, 0.8f, 0.34f, ((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);
                        grow[r][c] = 0f;
                    }
                    prev[r][c] = now;
                    if (now >= 0 && grow[r][c] < 1f) grow[r][c] = Math.min(1f, grow[r][c] + dt * 4.2f);
                    if (delay[r][c] > 0) delay[r][c] = Math.max(0, delay[r][c] - dt);
                }
            }
            for (int i = dying.size() - 1; i >= 0; i--) {
                float[] d = dying.get(i);
                d[3] += dt * 2.6f;
                if (d[3] >= 1f) dying.remove(i);
            }

            // tray pieces glide to their slots (or follow the finger)
            for (int i = 0; i < 4; i++) {
                NecpraBlockEngine.Piece p = i < 3 ? eng.tray(i) : eng.hold();
                if (p != last[i]) {
                    last[i] = p;
                    spawn[i] = 0f;
                    px[i] = SLOT_X[i];
                    pz[i] = TRAY_Z;
                    ps[i] = 0f;
                }
                if (p == null) continue;
                spawn[i] = Math.min(1f, spawn[i] + dt * 5f);
                float tx = SLOT_X[i], tz = TRAY_Z, ts = TRAY_SCALE * NecpraMath.easeOutBack(spawn[i]);
                float k = Math.min(1f, dt * 20f);
                if (i == dragSlot) {
                    tx = dragX;
                    tz = dragZ;
                    ts = 1f;
                }
                px[i] += (tx - px[i]) * k;
                pz[i] += (tz - pz[i]) * k;
                ps[i] += (ts - ps[i]) * Math.min(1f, dt * 16f);
            }

            if (levelDoneT >= 0) {
                levelDoneT += dt;
                if (((int) (levelDoneT * 7)) != ((int) ((levelDoneT - dt) * 7)) && levelDoneT < 1.4f) fireworks();
                if (levelDoneT > 1.4f && !doneSent) {
                    doneSent = true;
                    onLevelComplete(eng.level(), eng.score());
                }
            }
            if (gameOverT >= 0) {
                gameOverT += dt;
                if (gameOverT > 0.9f && !overSent) {
                    overSent = true;
                    onGameOver(eng.level(), eng.score());
                }
            }

            moteClock += dt;
            while (moteClock > 0.16f) {
                moteClock -= 0.16f;
                motes.emit(rnd(-7f, 7f), rnd(0f, 2f), rnd(-5f, 9f), rnd(-0.05f, 0.05f), rnd(0.15f, 0.35f), 0, 7f, rnd(0.12f, 0.24f),
                        night ? 0.55f : 1f, night ? 0.65f : 0.95f, night ? 1f : 0.9f);
            }
            motes.update(dt);
            burst.update(dt);
        }

        void fireworks() {
            for (int k = 0; k < 2; k++) {
                int rgb = PALETTE[random.nextInt(6)];
                burst.burst(rnd(-4f, 4f), 1.2f + rnd(0f, 1.6f), rnd(-4f, 4f), 26, 4f, 1.1f, 0.5f,
                        ((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);
            }
        }

        // ------------------------------------------------------------ input

        float[] planeHit(NecpraGl gl, float sx, float sy) {
            float[] ray = gl.ray(sx, sy);
            return NecpraMath.rayHitPlaneY(ray, 0.5f);
        }

        @Override
        public void onTouch(NecpraGl gl, int action, float x, float y, int pointer) {
            if (eng == null) return;
            if (action == MotionEvent.ACTION_DOWN) {
                if (dragSlot >= 0 || locked || levelDoneT >= 0 || gameOverT >= 0) return;
                float[] h = planeHit(gl, x, y);
                if (h == null) return;
                int slot = -1;
                for (int i = 0; i < 4; i++) {
                    NecpraBlockEngine.Piece p = i < 3 ? eng.tray(i) : eng.hold();
                    if (p != null && Math.abs(h[0] - SLOT_X[i]) < 1.35f && Math.abs(h[1] - TRAY_Z) < 1.5f) {
                        slot = i;
                        break;
                    }
                }
                if (slot < 0) return;
                if (slot == 3) {
                    // pick the held piece back up: it returns to a free tray slot and is dragged from there
                    int free = -1;
                    for (int i = 0; i < 3; i++) if (eng.tray(i) == null) { free = i; break; }
                    if (free < 0) {
                        say("Place a piece first to free a tray slot");
                        return;
                    }
                    float sxp = px[3], szp = pz[3], ssp = ps[3];
                    eng.takeFromHold();
                    last[free] = eng.tray(free);
                    spawn[free] = 1f;
                    px[free] = sxp;
                    pz[free] = szp;
                    ps[free] = ssp;
                    last[3] = null;
                    slot = free;
                }
                dragSlot = slot;
                dragX = h[0];
                dragZ = h[1] - LIFT;
                moved = false;
                downX = x;
                downY = y;
                sound(NecpraSfx.TAP);
                buzz(0);
                updateGhost();
            } else if (action == MotionEvent.ACTION_MOVE) {
                if (dragSlot < 0) return;
                float[] h = planeHit(gl, x, y);
                if (h == null) return;
                dragX = h[0];
                dragZ = h[1] - LIFT;
                if (Math.hypot(x - downX, y - downY) > dp(8)) moved = true;
                updateGhost();
            } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                if (dragSlot < 0) return;
                int slot = dragSlot;
                dragSlot = -1;
                float[] h = action == MotionEvent.ACTION_UP ? planeHit(gl, x, y) : null;
                boolean onHold = h != null && Math.abs(h[0] - SLOT_X[3]) < 1.7f && Math.abs(h[1] - TRAY_Z) < 1.8f;
                if (action == MotionEvent.ACTION_UP && ghostOk) {
                    place(slot, ghostR, ghostC);
                } else if (action == MotionEvent.ACTION_UP && onHold && eng.hold() == null) {
                    if (eng.storeInHold(slot)) {
                        sound(NecpraSfx.PLACE);
                        persist();
                        pushHud();
                        if (eng.isOver()) gameOverT = 0f;
                    }
                } else if (action == MotionEvent.ACTION_UP && h != null && h[1] < TRAY_Z - 2f && moved) {
                    sound(NecpraSfx.ERROR);
                    buzz(2);
                }
                ghostOk = false;
                clearHighlights();
            }
        }

        void clearHighlights() {
            for (int i = 0; i < N; i++) hlRow[i] = hlCol[i] = false;
        }

        void updateGhost() {
            clearHighlights();
            ghostOk = false;
            if (dragSlot < 0) return;
            NecpraBlockEngine.Piece p = eng.tray(dragSlot);
            if (p == null) return;
            float fc = dragX - (p.w - 1) / 2f + 4.5f, fr = dragZ - (p.h - 1) / 2f + 4.5f;
            float best = 0.95f;
            int br = -1, bc = -1;
            for (int dr = 0; dr <= 1; dr++) {
                for (int dc = 0; dc <= 1; dc++) {
                    int r = (int) Math.floor(fr) + dr, c = (int) Math.floor(fc) + dc;
                    float d = (float) Math.hypot(r - fr, c - fc);
                    if (d < best && eng.canPlace(p, r, c)) {
                        best = d;
                        br = r;
                        bc = c;
                    }
                }
            }
            if (br < 0) return;
            if (br != ghostR || bc != ghostC) sound(NecpraSfx.TICK);
            ghostR = br;
            ghostC = bc;
            ghostOk = true;
            boolean[][] occ = new boolean[N][N];
            for (int r = 0; r < N; r++) for (int c = 0; c < N; c++) occ[r][c] = eng.cell(r, c) >= 0;
            for (int[] cell : p.cells) occ[br + cell[0]][bc + cell[1]] = true;
            for (int r = 0; r < N; r++) {
                boolean f = true;
                for (int c = 0; c < N; c++) if (!occ[r][c]) { f = false; break; }
                hlRow[r] = f;
            }
            for (int c = 0; c < N; c++) {
                boolean f = true;
                for (int r = 0; r < N; r++) if (!occ[r][c]) { f = false; break; }
                hlCol[c] = f;
            }
        }

        void place(int slot, int r, int c) {
            NecpraBlockEngine.Piece p = eng.tray(slot);
            NecpraBlockEngine.PlaceResult res = eng.place(slot, r, c);
            if (!res.placed) return;
            // the placed cells pop from above
            for (int[] cell : p.cells) {
                grow[r + cell[0]][c + cell[1]] = -0.0f;
                delay[r + cell[0]][c + cell[1]] = 0f;
            }
            int rgb = PALETTE[p.color % 6];
            float cx = c + (p.w - 1) / 2f - 4.5f, cz = r + (p.h - 1) / 2f - 4.5f;
            burst.burst(cx, 0.6f, cz, 6, 1.8f, 0.5f, 0.26f, ((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);
            sound(NecpraSfx.PLACE);
            buzz(0);
            int lines = res.clearedRows.length + res.clearedCols.length;
            float[] pr = gl2d(cx, 1.2f, cz);
            if (lines > 0) {
                sound(NecpraSfx.CLEAR);
                buzz(1);
                shake = Math.min(1f, 0.35f + 0.25f * lines);
                if (pr != null) floating("+" + res.gained + (lines > 1 ? "  ×" + lines + " LINES" : ""), pr[0], pr[1], Color.parseColor("#FFD21F"));
                if (res.combo >= 2 && pr != null) floating("COMBO ×" + res.combo + "!", pr[0], pr[1] - dp(36), Color.parseColor("#FF7A18"));
            } else if (pr != null) {
                floating("+" + res.gained, pr[0], pr[1], Color.WHITE);
            }
            persist();
            afterPlace(eng, res);
            if (res.levelComplete) {
                locked = true;
                levelDoneT = 0f;
            } else if (res.gameOver) {
                locked = true;
                gameOverT = 0f;
            }
        }

        NecpraGl glRef;

        float[] gl2d(float x, float y, float z) { return glRef == null ? null : glRef.project(x, y, z); }

        // ------------------------------------------------------------ powers

        void usePower(int which) {
            if (eng == null || locked || dragSlot >= 0) return;
            boolean ok = false;
            if (which == NecpraBlockEngine.POWER_ROTATE) {
                ok = eng.rotateFirst();
                if (ok) sound(NecpraSfx.TAP);
            } else if (which == NecpraBlockEngine.POWER_SHUFFLE) {
                ok = eng.shuffleTray();
                if (ok) sound(NecpraSfx.WORD);
            } else {
                int before = countBlocks();
                java.util.List<int[]> cleared = eng.blast();
                ok = !cleared.isEmpty() || before == 0 && false;
                if (ok) {
                    sound(NecpraSfx.CAPTURE);
                    buzz(1);
                    shake = 1f;
                }
            }
            if (!ok) {
                if (eng.charges(which) <= 0) refundPower(which);
                else say(which == NecpraBlockEngine.POWER_BLAST ? "Nothing to blast in the centre yet" : "Nothing to do right now");
                sound(NecpraSfx.ERROR);
                return;
            }
            persist();
            pushHud();
            roomProgress(eng);
            if (eng.isOver()) gameOverT = 0f;
        }

        int countBlocks() {
            int n = 0;
            for (int r = 0; r < N; r++) for (int c = 0; c < N; c++) if (eng.cell(r, c) >= 0) n++;
            return n;
        }

        void doContinue() {
            if (eng == null) return;
            eng.continueGame();
            locked = false;
            gameOverT = -1f;
            overSent = false;
            sound(NecpraSfx.CLEAR);
            persist();
            pushHud();
        }

        // ------------------------------------------------------------ drawing

        void rgb(int c, float[] out) {
            out[0] = ((c >> 16) & 255) / 255f;
            out[1] = ((c >> 8) & 255) / 255f;
            out[2] = (c & 255) / 255f;
        }

        @Override
        public void render(NecpraGl gl) {
            glRef = gl;
            gl.clear();
            if (night) {
                gl.drawBackground(new float[]{0.04f, 0.06f, 0.16f}, new float[]{0.11f, 0.05f, 0.22f}, new float[]{0.05f, 0.14f, 0.32f}, new float[]{0.24f, 0.06f, 0.30f});
            } else {
                gl.drawBackground(new float[]{0.72f, 0.84f, 1f}, new float[]{0.98f, 0.86f, 0.97f}, new float[]{0.18f, 0.2f, 0.14f}, new float[]{0.2f, 0.1f, 0.16f});
            }
            if (eng == null) return;
            applyCamera(gl);
            float[] c = new float[3];

            gl.beginOpaque();
            // board plate
            if (night) gl.draw(plate, NecpraMath.translation(0, -0.25f, 0), 0.10f, 0.14f, 0.26f, 1f, 0.7f, 0.03f, 0.3f, 0f);
            else gl.draw(plate, NecpraMath.translation(0, -0.25f, 0), 0.92f, 0.93f, 1f, 1f, 0.5f, 0.05f, 0.15f, 0f);
            // cells
            for (int r = 0; r < N; r++) {
                for (int cc = 0; cc < N; cc++) {
                    boolean alt = ((r + cc) & 1) == 0;
                    float v = night ? (alt ? 0.20f : 0.16f) : (alt ? 0.80f : 0.74f);
                    float b = night ? v * 1.5f : v + 0.1f;
                    gl.draw(tile, NecpraMath.translation(cc - 4.5f, 0.04f, r - 4.5f), v, v * 1.1f, Math.min(1f, b), 1f, 0.25f, 0.03f, 0.1f, 0f);
                }
            }
            // tray pads
            for (int i = 0; i < 4; i++) {
                float t = (i == 3) ? 1f : 0f;
                float pr = night ? 0.12f + 0.08f * t : 0.86f - 0.06f * t, pg = night ? 0.17f + 0.04f * t : 0.88f - 0.06f * t, pb = night ? 0.30f + 0.08f * t : 1f;
                gl.draw(pad, NecpraMath.translation(SLOT_X[i], -0.02f, TRAY_Z), pr, pg, pb, 1f, 0.4f, 0.02f, 0.15f, 0f);
            }
            // hold marker ring
            gl.draw(ring, NecpraMath.translation(SLOT_X[3], 0.07f, TRAY_Z), 1f, 0.85f, 0.3f, 1f, 0f, 0.35f + 0.15f * (float) Math.sin(time * 3f), 0f, 0f);

            // contact shadows for tray pieces
            for (int i = 0; i < 4; i++) {
                NecpraBlockEngine.Piece p = last[i];
                if (p == null || ps[i] <= 0.02f) continue;
                float sc = ps[i];
                gl.drawBlob(disc, NecpraMath.mul(NecpraMath.translation(px[i], 0.02f, pz[i]), NecpraMath.scaling(p.w * 0.55f * sc + 0.4f, 1f, p.h * 0.55f * sc + 0.4f)), i == dragSlot ? 0.28f : 0.18f);
            }
            gl.beginOpaque();

            // board blocks
            for (int r = 0; r < N; r++) {
                for (int cc = 0; cc < N; cc++) {
                    int col = eng.cell(r, cc);
                    if (col < 0) continue;
                    float g = grow[r][cc];
                    if (g <= 0f) continue;
                    float e = NecpraMath.easeOutBack(Math.min(1f, g));
                    float drop = (1f - Math.min(1f, g)) * 1.4f;
                    float glow = (hlRow[r] || hlCol[cc]) ? 0.35f + 0.25f * (float) Math.sin(time * 12f) : 0f;
                    drawCube(gl, cc - 4.5f, 0.31f + drop, r - 4.5f, e, col, glow, 1f, c);
                }
            }
            // dying blocks
            for (float[] d : dying) {
                float t = d[3], s = 1f - t;
                float[] m = NecpraMath.mul(NecpraMath.translation(d[1] - 4.5f, 0.31f + t * 0.8f, d[0] - 4.5f), NecpraMath.mul(NecpraMath.rotationY(t * 3f), NecpraMath.scaling(s, s, s)));
                rgb(PALETTE[(int) d[2] % 6], c);
                gl.draw(cube, m, c[0], c[1], c[2], 1f, 0.7f, 0.5f * s, 0.3f, 0f);
            }
            // tray / dragged pieces
            for (int i = 0; i < 4; i++) {
                NecpraBlockEngine.Piece p = last[i];
                if (p == null || ps[i] <= 0.02f) continue;
                float y = 0.31f * ps[i] + (i == dragSlot ? 0.5f : 0f);
                for (int[] cell : p.cells) {
                    float wx = px[i] + (cell[1] - (p.w - 1) / 2f) * ps[i];
                    float wz = pz[i] + (cell[0] - (p.h - 1) / 2f) * ps[i];
                    drawCube(gl, wx, y, wz, ps[i], p.color, i == dragSlot ? 0.12f : 0f, 1f, c);
                }
            }

            // ghost preview
            if (dragSlot >= 0 && ghostOk) {
                NecpraBlockEngine.Piece p = eng.tray(dragSlot);
                if (p != null) {
                    gl.beginTransparent();
                    for (int[] cell : p.cells) {
                        rgb(PALETTE[p.color % 6], c);
                        float[] m = NecpraMath.mul(NecpraMath.translation(ghostC + cell[1] - 4.5f, 0.3f, ghostR + cell[0] - 4.5f), NecpraMath.scaling(0.96f, 0.9f, 0.96f));
                        gl.draw(cube, m, c[0], c[1], c[2], 0.55f, 0.3f, 0.45f + 0.2f * (float) Math.sin(time * 9f), 0.2f, 0.2f);
                    }
                    gl.endTransparent();
                }
            }

            gl.drawParticles(motes);
            gl.drawParticles(burst);
        }

        void drawCube(NecpraGl gl, float x, float y, float z, float scale, int color, float glow, float alpha, float[] c) {
            rgb(PALETTE[color % 6], c);
            float[] m = NecpraMath.mul(NecpraMath.translation(x, y, z), NecpraMath.scaling(scale, scale, scale));
            gl.draw(cube, m, c[0], c[1], c[2], alpha, 0.75f, 0.1f + glow, 0.3f, 0f);
        }
    }
}
