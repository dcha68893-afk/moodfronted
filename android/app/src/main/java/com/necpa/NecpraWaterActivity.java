package com.necpa;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.Random;

/**
 * Native 3D Water Sort and Daily Challenge (and live "Play Together" matches). Rules come from
 * {@link NecpraWaterEngine}; this class draws glass tubes with a real liquid level plane, animates pours, and
 * handles coins, stars, resume, the daily clock and rooms.
 */
public class NecpraWaterActivity extends NecpraGameActivity {
    public static final String MODE_LEVEL = "level", MODE_DAILY = "daily", MODE_ROOM = "room";
    private static final int DAILY_SECONDS = 180;
    private static final int HINT_COST = 15, TUBE_COST = 25;

    private String mode = MODE_LEVEL;
    private int levelNo = 1;
    private String roomCode;
    private NecpraGl.View glView;
    private WaterScene scene;

    private TextView tvA, tvB, tvC, tvInfo, tvOpp;
    private TextView btnUndo, btnHint, btnTube, btnRestart;
    private LinearLayout hudTop, hudBottom;
    private FrameLayout.LayoutParams hudTopLp, hudBottomLp;

    private NecpraRoomSession room;
    private boolean roomStarted;
    private volatile String saveBlob;
    private long matchStartMs;
    private boolean submittedRoom;

    private String modeOf() {
        String m = getIntent() == null ? null : getIntent().getStringExtra(EXTRA_MODE);
        if (MODE_DAILY.equals(m)) return MODE_DAILY;
        if (getIntent() != null && getIntent().getStringExtra(EXTRA_ROOM) != null) return MODE_ROOM;
        return MODE_LEVEL;
    }

    @Override protected String gameId() { return MODE_DAILY.equals(modeOf()) ? "daily" : "water"; }

    @Override protected String gameTitle() {
        String m = modeOf();
        return MODE_DAILY.equals(m) ? "Daily Challenge" : MODE_ROOM.equals(m) ? "Water Sort · Match" : "Water Sort";
    }

    // ------------------------------------------------------------------ build

    @Override
    protected void onBuild(Bundle saved) {
        mode = modeOf();
        scene = new WaterScene();
        glView = new NecpraGl.View(this, scene);
        stage.addView(glView, new FrameLayout.LayoutParams(-1, -1));

        buildHud();

        if (MODE_ROOM.equals(mode)) {
            roomCode = getIntent().getStringExtra(EXTRA_ROOM);
            tvInfo.setText("Joining match…");
            room = new NecpraRoomSession(this, roomCode, new NecpraRoomSession.Listener() {
                @Override public void onRoom(JSONObject r) { onRoomUpdate(r); }
                @Override public void onProblem(String msg, boolean fatal) {
                    if (fatal) {
                        message("Match unavailable", msg, "OK");
                        modalDismissThenFinish();
                    } else {
                        toast(msg);
                    }
                }
            });
            room.start();
        } else if (MODE_DAILY.equals(mode)) {
            startDaily();
        } else {
            int want = getIntent().getIntExtra(EXTRA_LEVEL, 0);
            if (want > 0) store.adoptLevel("water", want);
            levelNo = store.level("water");
            startLevel(levelNo, true);
        }
        pullServerCoins();
    }

    private void modalDismissThenFinish() {
        main.postDelayed(new Runnable() {
            @Override public void run() { if (!dead()) finish(); }
        }, 2600);
    }

    private TextView stat(String label) {
        TextView t = text(label, 13, cText, true);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(12), dp(7), dp(12), dp(7));
        t.setBackground(roundStroke(alpha(cCard, night ? 0xD0 : 0xE8), cLine, 16));
        return t;
    }

    private void buildHud() {
        hudTop = row();
        hudTop.setGravity(Gravity.CENTER);
        tvA = stat("LEVEL 1");
        tvB = stat("MOVES 0");
        tvC = stat("SCORE 0");
        for (TextView t : new TextView[]{tvA, tvB, tvC}) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.leftMargin = lp.rightMargin = dp(4);
            hudTop.addView(t, lp);
        }
        hudTopLp = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        stage.addView(hudTop, hudTopLp);

        tvInfo = text("", 13, cSub, true);
        tvInfo.setGravity(Gravity.CENTER);
        tvInfo.setPadding(dp(16), dp(4), dp(16), dp(4));
        stage.addView(tvInfo, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        tvOpp = text("", 13, cText, true);
        tvOpp.setGravity(Gravity.CENTER);
        tvOpp.setVisibility(android.view.View.GONE);
        tvOpp.setBackground(roundStroke(alpha(cCard, 0xE0), cLine, 14));
        tvOpp.setPadding(dp(12), dp(6), dp(12), dp(6));
        stage.addView(tvOpp, new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL));

        hudBottom = row();
        hudBottom.setGravity(Gravity.CENTER);
        btnUndo = tool("↶\nUndo", new Runnable() { @Override public void run() { onGl(new Runnable() { @Override public void run() { scene.undo(); } }); } });
        btnHint = tool("💡\nHint 🪙" + HINT_COST, new Runnable() { @Override public void run() { askHint(); } });
        btnTube = tool("＋\nTube 🪙" + TUBE_COST, new Runnable() { @Override public void run() { askTube(); } });
        btnRestart = tool("⟳\nRestart", new Runnable() { @Override public void run() { askRestart(); } });
        for (TextView t : new TextView[]{btnUndo, btnHint, btnTube, btnRestart}) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(62), 1f);
            lp.leftMargin = lp.rightMargin = dp(5);
            hudBottom.addView(t, lp);
        }
        hudBottomLp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        hudBottomLp.leftMargin = hudBottomLp.rightMargin = dp(10);
        stage.addView(hudBottom, hudBottomLp);
        applyHudInsets();
    }

    private TextView tool(String label, final Runnable r) {
        TextView t = text(label, 12.5f, cText, true);
        t.setGravity(Gravity.CENTER);
        t.setLineSpacing(0, 1.05f);
        t.setBackground(roundStroke(alpha(cCard, night ? 0xE0 : 0xF0), cLine, 18));
        pressable(t);
        t.setOnClickListener(new android.view.View.OnClickListener() {
            @Override public void onClick(android.view.View v) {
                if (modalOpen()) return;
                sfx.play(NecpraSfx.TAP);
                sfx.haptic(v, 0);
                r.run();
            }
        });
        return t;
    }

    private void applyHudInsets() {
        if (hudTopLp == null) return;
        hudTopLp.topMargin = topBarHeight() + dp(2);
        hudTop.setLayoutParams(hudTopLp);
        FrameLayout.LayoutParams ilp = (FrameLayout.LayoutParams) tvInfo.getLayoutParams();
        ilp.topMargin = topBarHeight() + dp(46);
        tvInfo.setLayoutParams(ilp);
        FrameLayout.LayoutParams olp = (FrameLayout.LayoutParams) tvOpp.getLayoutParams();
        olp.topMargin = topBarHeight() + dp(70);
        tvOpp.setLayoutParams(olp);
        hudBottomLp.bottomMargin = insetBottom + dp(12);
        hudBottom.setLayoutParams(hudBottomLp);
    }

    @Override protected void onInsets(int top, int bottom, int left, int right) {
        applyHudInsets();
        if (scene != null) scene.requestFit();
    }

    private void onGl(Runnable r) {
        if (glView != null) glView.queueEvent(r);
    }

    // ------------------------------------------------------------------ game start / modes

    private NecpraWaterEngine.Params params(int level) {
        NecpraWaterEngine.Params p = new NecpraWaterEngine.Params();
        p.level = level;
        p.difficulty = store.difficulty();
        return p;
    }

    private void startLevel(int level, boolean tryResume) {
        levelNo = level;
        NecpraWaterEngine e = null;
        if (tryResume) {
            String r = store.resume("water");
            if (r != null) {
                NecpraWaterEngine d = NecpraWaterEngine.deserialize(r);
                if (d != null && d.level() == level && !d.isSolved() && d.hasMove()) e = d;
            }
        }
        if (e == null) e = NecpraWaterEngine.generate(params(level));
        beginEngine(e, 0);
    }

    private static long dailySeed() {
        long h = 2166136261L;
        String d = NecpraGameStore.today();
        for (int i = 0; i < d.length(); i++) {
            h ^= d.charAt(i);
            h = (h * 16777619L) & 0xFFFFFFFFL;
        }
        return h == 0 ? 1 : h;
    }

    private void startDaily() {
        levelNo = 1;
        NecpraWaterEngine e = null;
        int left = DAILY_SECONDS;
        String r = store.resume("daily");
        if (r != null && r.startsWith(NecpraGameStore.today() + "|")) {
            String[] p = r.split("\\|", 3);
            if (p.length == 3) {
                NecpraWaterEngine d = NecpraWaterEngine.deserialize(p[2]);
                try {
                    if (d != null && !d.isSolved() && d.hasMove()) {
                        e = d;
                        left = Math.max(5, Math.min(DAILY_SECONDS, Integer.parseInt(p[1])));
                    }
                } catch (NumberFormatException ignored) { }
            }
        }
        if (e == null) e = freshDaily();
        beginEngine(e, left);
    }

    private NecpraWaterEngine freshDaily() {
        NecpraWaterEngine.Params p = new NecpraWaterEngine.Params();
        p.level = 1;
        p.seed = dailySeed();
        p.colorOverride = 4;
        return NecpraWaterEngine.generate(p);
    }

    private void onRoomUpdate(JSONObject r) {
        if (!roomStarted) {
            roomStarted = true;
            NecpraWaterEngine.Params p = params(NecpraRoomSession.levelOf(r));
            p.seed = NecpraRoomSession.seedOf(r);
            if (p.seed == 0) p.seed = 1;
            p.difficulty = "moderate"; // both players must get the same puzzle regardless of their own difficulty setting
            levelNo = p.level;
            beginEngine(NecpraWaterEngine.generate(p), 0);
        }
        boolean playing = "playing".equals(NecpraRoomSession.statusOf(r)) || "finished".equals(NecpraRoomSession.statusOf(r));
        scene.setLocked(!playing);
        if (!playing) {
            tvInfo.setText("Waiting for your friend…  Code " + roomCode);
        } else {
            if (matchStartMs == 0) matchStartMs = System.currentTimeMillis();
            if (!submittedRoom) tvInfo.setText("Solve it before your opponent!");
        }
        JSONObject opp = room.opponent();
        if (opp != null) {
            tvOpp.setVisibility(android.view.View.VISIBLE);
            tvOpp.setText("Opponent · " + opp.optInt("progress", 0) + "%  ·  " + opp.optInt("score", 0) + " pts"
                    + (opp.optBoolean("completed") ? "  ✓ done" : ""));
        }
        if (room.finished() && submittedRoom) showRoomResult();
    }

    private void beginEngine(NecpraWaterEngine e, int dailyLeft) {
        final NecpraWaterEngine fe = e;
        final int left = dailyLeft;
        onGl(new Runnable() {
            @Override public void run() { scene.setEngine(fe, MODE_DAILY.equals(mode) ? left : 0); }
        });
        refreshHud(e.moves(), e.score(), e.level());
    }

    // ------------------------------------------------------------------ HUD

    void refreshHud(final int moves, final int score, final int level) {
        ui(new Runnable() {
            @Override public void run() {
                if (!MODE_DAILY.equals(mode)) tvA.setText("LEVEL " + level);
                tvB.setText("MOVES " + moves);
                tvC.setText("SCORE " + score);
                if (!MODE_ROOM.equals(mode) && !MODE_DAILY.equals(mode)) {
                    int par = Math.max(8, 8 + level * 2);
                    tvInfo.setText("★★★ in " + par + " moves or fewer");
                } else if (MODE_DAILY.equals(mode) && tvInfo.getText().length() == 0) {
                    tvInfo.setText("One puzzle a day · solve it in 3 minutes for 🪙 250");
                }
            }
        });
    }

    void showClock(final int secondsLeft) {
        ui(new Runnable() {
            @Override public void run() {
                tvA.setText(String.format(java.util.Locale.US, "⏱ %02d:%02d", secondsLeft / 60, secondsLeft % 60));
                tvA.setTextColor(secondsLeft <= 20 ? cDanger : cText);
            }
        });
    }

    void setSave(String blob) { saveBlob = blob; }

    @Override protected void onSaveGame() {
        String b = saveBlob;
        if (b == null || room != null) return;
        if (MODE_DAILY.equals(mode)) store.saveResume("daily", b);
        else store.saveResume("water", b);
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
        if (room != null && !submittedRoom) {
            confirm("Leave the match?", "Your opponent keeps playing and you forfeit this round.", "Leave", "Stay", true,
                    new Runnable() { @Override public void run() { finish(); } });
            return;
        }
        finish();
    }

    // ------------------------------------------------------------------ actions

    private void askHint() {
        if (room != null) {
            toast("Hints are off in live matches");
            return;
        }
        pay(HINT_COST, "A hint", new Runnable() {
            @Override public void run() {
                onGl(new Runnable() {
                    @Override public void run() {
                        if (!scene.hint()) ui(new Runnable() {
                            @Override public void run() {
                                store.add(HINT_COST);
                                updateCoins(false);
                                toast("No move found from here — try Undo, a new tube or Restart");
                            }
                        });
                    }
                });
            }
        });
    }

    private void askTube() {
        if (room != null) {
            toast("Extra tubes are off in live matches");
            return;
        }
        pay(TUBE_COST, "An extra tube", new Runnable() {
            @Override public void run() {
                onGl(new Runnable() {
                    @Override public void run() {
                        if (!scene.addTube()) ui(new Runnable() {
                            @Override public void run() {
                                store.add(TUBE_COST);
                                updateCoins(false);
                                toast("You already used the extra tube this level");
                            }
                        });
                    }
                });
            }
        });
    }

    private void askRestart() {
        if (room != null) {
            toast("You can't restart a live match");
            return;
        }
        confirm("Restart this puzzle?", "Your moves so far will be lost.", "Restart", "Keep playing", true, new Runnable() {
            @Override public void run() { restart(); }
        });
    }

    private void restart() {
        if (MODE_DAILY.equals(mode)) {
            store.saveResume("daily", null);
            beginEngine(freshDaily(), DAILY_SECONDS);
        } else {
            store.saveResume("water", null);
            startLevel(levelNo, false);
        }
    }

    /** Called from the GL thread once every tube is sorted. */
    void onSolved(final int moves, final int score, final int stars) {
        ui(new Runnable() {
            @Override public void run() { handleSolved(moves, score, stars); }
        });
    }

    private void handleSolved(final int moves, final int score, final int stars) {
        saveBlob = null; // a finished puzzle must never come back as a resume point
        sfx.play(NecpraSfx.WIN);
        sfx.haptic(root, 1);
        if (MODE_ROOM.equals(mode)) {
            submittedRoom = true;
            long t = matchStartMs == 0 ? 0 : System.currentTimeMillis() - matchStartMs;
            tvInfo.setText("Solved! Waiting for the result…");
            room.submit(score, t, moves, moves, new NecpraRoomSession.ResultCallback() {
                @Override public void onResult(JSONObject response, String error) {
                    if (error != null) toast(error);
                    if (room != null && room.finished()) showRoomResult();
                }
            });
            return;
        }
        if (MODE_DAILY.equals(mode)) {
            store.saveResume("daily", null);
            boolean first = !store.dailyDone();
            int streak = first ? store.completeDaily() : store.streak();
            store.recordGame("daily", score, 0);
            if (first) earn(250, null);
            String[][] rows = first
                    ? new String[][]{{"Moves", String.valueOf(moves)}, {"Reward", "🪙 250"}, {"Streak", streak + " day" + (streak == 1 ? "" : "s")}}
                    : new String[][]{{"Moves", String.valueOf(moves)}, {"Reward", "Already claimed today"}};
            resultCard("Daily solved!", first ? "Come back tomorrow for a new puzzle." : "Nice — practice makes perfect.", stars, rows,
                    "Done", new Runnable() { @Override public void run() { finish(); } },
                    "Play again", new Runnable() { @Override public void run() { restart(); } });
            return;
        }
        store.saveResume("water", null);
        int coins = 100 + stars * 25;
        store.setStars("water", levelNo, stars);
        store.recordGame("water", score, levelNo + 1);
        store.setLevel("water", Math.max(store.level("water"), levelNo + 1));
        earn(coins, null);
        final int next = levelNo + 1;
        resultCard("Level " + levelNo + " complete!", null, stars,
                new String[][]{{"Moves", String.valueOf(moves)}, {"Score", String.valueOf(score)}, {"Coins", "🪙 +" + coins}},
                "Next level", new Runnable() { @Override public void run() { startLevel(next, false); } },
                "Menu", new Runnable() { @Override public void run() { finish(); } });
    }

    private void showRoomResult() {
        if (modalOpen()) return;
        JSONObject me = room.mePlayer();
        JSONObject opp = room.opponent();
        int mine = me == null ? 0 : me.optInt("score", 0), theirs = opp == null ? 0 : opp.optInt("score", 0);
        int reward = room.myReward();
        boolean won = reward >= 100 || mine > theirs;
        pullServerCoins();
        resultCard(won ? "You won!" : "Match finished", won ? "Fastest to sort the tubes." : "Better luck in the rematch.", won ? 3 : 1,
                new String[][]{{"You", mine + " pts"}, {"Opponent", theirs + " pts"}, {"Reward", reward > 0 ? "🪙 " + reward : "—"}},
                "Done", new Runnable() { @Override public void run() { finish(); } }, null, null);
    }

    /** Daily clock ran out (GL thread). */
    void onTimeUp() {
        ui(new Runnable() {
            @Override public void run() {
                sfx.play(NecpraSfx.FAIL);
                resultCard("Time's up", "The daily puzzle gives you 3 minutes. Try again — the reward is only paid once per day.", -1, null,
                        "Try again", new Runnable() { @Override public void run() { restart(); } },
                        "Exit", new Runnable() { @Override public void run() { finish(); } });
            }
        });
    }

    /** No legal pour is left (GL thread). */
    void onStuck() {
        ui(new Runnable() {
            @Override public void run() {
                if (modalOpen()) return;
                sfx.play(NecpraSfx.ERROR);
                LinearLayout c = column();
                c.addView(text("No moves left", 20, cText, true));
                TextView b = text(room != null ? "You're stuck — undo a move to keep going."
                        : "Undo a move, add a tube, or restart the puzzle.", 14.5f, cSub, false);
                b.setPadding(0, dp(8), 0, dp(16));
                c.addView(b);
                final Modal m = modal(c, true);
                c.addView(button("Undo", PRIMARY, new Runnable() {
                    @Override public void run() {
                        m.dismiss();
                        onGl(new Runnable() { @Override public void run() { scene.undo(); } });
                    }
                }));
                if (room == null) {
                    c.addView(space(8));
                    c.addView(button("Add a tube 🪙 " + TUBE_COST, GOLD, new Runnable() {
                        @Override public void run() {
                            m.dismiss();
                            askTube();
                        }
                    }));
                    c.addView(space(8));
                    c.addView(button("Restart", SECONDARY, new Runnable() {
                        @Override public void run() {
                            m.dismiss();
                            restart();
                        }
                    }));
                }
            }
        });
    }

    void roomProgress(int moves, int score, int level) {
        if (room == null || !roomStarted) return;
        try {
            JSONObject s = new JSONObject();
            s.put("answered", moves);
            s.put("correct", moves);
            s.put("score", score);
            s.put("progress", Math.min(99, Math.round(moves / (float) Math.max(1, level * 8) * 100)));
            s.put("currentLevel", level);
            s.put("timeMs", matchStartMs == 0 ? 0 : System.currentTimeMillis() - matchStartMs);
            room.push(s, score);
        } catch (Exception ignored) { }
    }

    void sound(int id) { sfx.play(id); }

    void buzz(int kind) { sfx.haptic(root, kind); }

    // =====================================================================================================
    // 3D scene
    // =====================================================================================================

    private final class WaterScene implements NecpraGl.Scene {
        // tube geometry (world units)
        static final float H = 3.7f, R_OUT = 0.44f, R_IN = 0.385f, SLOT = 0.86f, Y0 = 0.04f, SPACING_X = 1.3f, SPACING_Z = 2.5f;
        static final float TILT = 1.0f; // radians, about 57 degrees
        static final float POUR_SECONDS = 1.25f;

        private final int[] PALETTE = {
                0xE53935, 0xFB8C00, 0xFDD835, 0x7CB342, 0x00A86B, 0x00ACC1,
                0x29B6F6, 0x3F51B5, 0x8E24AA, 0xEC407A, 0x8D6E63, 0xB0BEC5};

        NecpraWaterEngine eng;
        volatile boolean locked;
        boolean fitNeeded = true;
        float time;

        NecpraGl.Mesh glass, rim, cyl, sph, shelf, cork, disc, ring;
        NecpraGl.Particles burst = new NecpraGl.Particles(1200, 7f);
        NecpraGl.Particles motes = new NecpraGl.Particles(90, -0.12f);
        float moteClock;

        float[] tx = new float[0], tz = new float[0], lift = new float[0], shake = new float[0], corkT = new float[0];
        int rows, cols;
        int sel = -1;
        int hintFrom = -1, hintTo = -1;
        float hintLeft;
        float downX, downY;
        boolean downValid;

        // pour animation
        boolean pouring;
        int pFrom, pTo, pAmount, pPreFromLen, pPreToLen, pColor, pSide;
        int[] pPreFromColors = new int[NecpraWaterEngine.CAP];
        float pT;
        float streamSplash;

        // win / clock
        boolean won;
        float winT;
        boolean winReported;
        int dailySeconds;
        float dailyClock;
        boolean dailyActive;
        boolean timeUpSent;
        boolean stuckChecked;
        final float[] tmpA = new float[3], tmpB = new float[3];

        void setLocked(boolean l) { locked = l; }

        void requestFit() { fitNeeded = true; }

        void setEngine(NecpraWaterEngine e, int dailyLeft) {
            eng = e;
            if (!MODE_ROOM.equals(mode)) locked = false;
            pouring = false;
            sel = -1;
            hintFrom = hintTo = -1;
            won = false;
            winT = 0;
            winReported = false;
            timeUpSent = false;
            stuckChecked = false;
            dailyActive = dailyLeft > 0;
            dailySeconds = dailyLeft;
            dailyClock = 0;
            layout();
            for (int i = 0; i < corkT.length; i++) corkT[i] = isDone(i) ? 1f : 0f;
            fitNeeded = true;
            if (dailyActive) showClock(dailySeconds);
            refreshHud(e.moves(), e.score(), e.level());
            persist();
        }

        // ------------------------------------------------------------ layout & camera

        void layout() {
            int n = eng.tubeCount();
            float aspect = width() / (float) Math.max(1, height());
            int maxCols = aspect < 0.8f ? 5 : (aspect < 1.3f ? 6 : 8);
            rows = (n + maxCols - 1) / maxCols;
            cols = (n + rows - 1) / rows;
            float[] nx = new float[n], nz = new float[n], nl = new float[n], ns = new float[n], nc = new float[n];
            for (int i = 0; i < Math.min(n, tx.length); i++) {
                nl[i] = lift[i];
                ns[i] = shake[i];
                nc[i] = corkT[i];
            }
            for (int i = 0; i < n; i++) {
                int r = i / cols, c = i % cols;
                int inRow = Math.min(cols, n - r * cols);
                nx[i] = (c - (inRow - 1) / 2f) * SPACING_X;
                nz[i] = -r * SPACING_Z + (rows - 1) * SPACING_Z * 0.5f;
            }
            tx = nx;
            tz = nz;
            lift = nl;
            shake = ns;
            corkT = nc;
        }

        int width() { return glView == null ? 1 : Math.max(1, glView.getWidth()); }

        int height() { return glView == null ? 1 : Math.max(1, glView.getHeight()); }

        void fit(NecpraGl gl) {
            if (eng == null) return;
            float aspect = gl.width / (float) Math.max(1, gl.height);
            layout();
            float halfW = (cols - 1) * SPACING_X / 2f + 0.75f;
            float zNear = tz[0] + 0.7f, zFar = tz[0];
            for (float z : tz) {
                zNear = Math.max(zNear, z + 0.7f);
                zFar = Math.min(zFar, z - 0.7f);
            }
            float cz = (zNear + zFar) / 2f;
            float top = H + 1.1f;
            float[][] corners = {
                    {-halfW, 0, zNear}, {halfW, 0, zNear}, {-halfW, top, zNear}, {halfW, top, zNear},
                    {-halfW, 0, zFar}, {halfW, 0, zFar}, {-halfW, top, zFar}, {halfW, top, zFar}};
            float topPx = topBarHeight() + dp(96), botPx = insetBottom + dp(96);
            float yTop = 1f - 2f * topPx / gl.height, yBot = -1f + 2f * botPx / gl.height;
            float el = (float) Math.toRadians(34);
            float lookY = top * 0.42f;
            gl.ndcShiftY = 0;
            float best = 60f;
            for (float d = 7f; d <= 60f; d += 0.25f) {
                gl.camera(0, lookY + (float) Math.sin(el) * d, cz + (float) Math.cos(el) * d, 0, lookY, cz, 38f);
                float minX = 9, maxX = -9, minY = 9, maxY = -9;
                for (float[] c : corners) {
                    float[] p = NecpraMath.transformPoint(gl.viewProj, c[0], c[1], c[2]);
                    minX = Math.min(minX, p[0]);
                    maxX = Math.max(maxX, p[0]);
                    minY = Math.min(minY, p[1]);
                    maxY = Math.max(maxY, p[1]);
                }
                if (maxX - minX <= 2f * 0.94f && (maxY - minY) <= (yTop - yBot) * 0.99f) {
                    best = d;
                    camD = d;
                    camShift = (yTop + yBot) / 2f - (maxY + minY) / 2f;
                    break;
                }
                camD = d;
                camShift = 0;
            }
            camEl = el;
            camLookY = lookY;
            camCz = cz;
            fitNeeded = false;
        }

        float camD = 14f, camShift, camEl, camLookY = 1.5f, camCz;

        void applyCamera(NecpraGl gl) {
            gl.ndcShiftY = camShift;
            float sway = (float) Math.sin(time * 0.35f) * 0.35f;
            gl.camera(sway, camLookY + (float) Math.sin(camEl) * camD, camCz + (float) Math.cos(camEl) * camD, 0, camLookY, camCz, 38f);
        }

        // ------------------------------------------------------------ Scene callbacks

        @Override
        public void onGlReady(NecpraGl gl) {
            glass = gl.upload(NecpraMesh.lathe(
                    new float[]{0f, 0.14f, 0.26f, 0.35f, 0.41f, 0.44f, 0.44f, 0.452f, 0.468f},
                    new float[]{0f, 0.004f, 0.03f, 0.09f, 0.17f, 0.29f, H - 0.06f, H - 0.025f, H}, 40));
            rim = gl.upload(NecpraMesh.torus(0.455f, 0.03f, 40, 10));
            cyl = gl.upload(NecpraMesh.cylinder(1f, 1f, 36));
            sph = gl.upload(NecpraMesh.sphere(1f, 16, 28));
            shelf = gl.upload(NecpraMesh.roundedBox(1f, 0.22f, 1.35f, 0.09f, 4));
            cork = gl.upload(NecpraMesh.sphere(0.5f, 12, 20));
            disc = gl.upload(NecpraGl.discMesh());
            ring = gl.upload(NecpraMesh.torus(0.62f, 0.035f, 40, 8));
            gl.sunX = -0.45f;
            gl.sunY = 0.9f;
            gl.sunZ = 0.55f;
            if (night) {
                gl.skyR = 0.45f; gl.skyG = 0.52f; gl.skyB = 0.78f;
                gl.groundR = 0.16f; gl.groundG = 0.14f; gl.groundB = 0.26f;
                gl.ambient = 0.66f;
            } else {
                gl.skyR = 0.78f; gl.skyG = 0.84f; gl.skyB = 0.98f;
                gl.groundR = 0.5f; gl.groundG = 0.46f; gl.groundB = 0.56f;
                gl.ambient = 0.7f;
            }
            fitNeeded = true;
        }

        @Override
        public void onSize(NecpraGl gl, int w, int h) {
            fitNeeded = true;
        }

        @Override
        public void update(NecpraGl gl, float dt) {
            time += dt;
            if (eng == null) return;
            if (fitNeeded) fit(gl);

            for (int i = 0; i < lift.length; i++) {
                float target = (sel == i && !pouring) ? 1f : 0f;
                lift[i] += (target - lift[i]) * Math.min(1f, dt * 14f);
                if (shake[i] > 0) shake[i] = Math.max(0, shake[i] - dt);
                float ct = isDone(i) ? 1f : 0f;
                corkT[i] += (ct - corkT[i]) * Math.min(1f, dt * 7f);
            }
            if (hintLeft > 0) {
                hintLeft -= dt;
                if (hintLeft <= 0) hintFrom = hintTo = -1;
            }

            if (pouring) {
                pT += dt;
                float p = pT / POUR_SECONDS;
                if (p > 0.32f && p < 0.78f) {
                    streamSplash += dt;
                    while (streamSplash > 0.03f) {
                        streamSplash -= 0.03f;
                        float[] end = streamEnd();
                        int rgb = PALETTE[pColor];
                        burst.emit(end[0], end[1], end[2], rnd(-0.9f, 0.9f), rnd(1.2f, 2.6f), rnd(-0.9f, 0.9f), 0.45f, 0.2f,
                                ((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);
                    }
                }
                if (pT >= POUR_SECONDS) finishPour();
            }

            if (dailyActive && !won && !locked) {
                dailyClock += dt;
                if (dailyClock >= 1f) {
                    dailyClock -= 1f;
                    dailySeconds--;
                    showClock(Math.max(0, dailySeconds));
                    if (dailySeconds <= 10 && dailySeconds > 0) sound(NecpraSfx.TICK);
                    if (dailySeconds % 5 == 0) persist();
                    if (dailySeconds <= 0 && !timeUpSent) {
                        timeUpSent = true;
                        locked = true;
                        onTimeUp();
                    }
                }
            }

            if (won) {
                winT += dt;
                if (((int) (winT * 6)) != ((int) ((winT - dt) * 6)) && winT < 1.6f) fireworks();
                if (winT > 1.5f && !winReported) {
                    winReported = true;
                    onSolved(eng.moves(), eng.score(), eng.stars());
                }
            }

            moteClock += dt;
            while (moteClock > 0.14f) {
                moteClock -= 0.14f;
                motes.emit(rnd(-6f, 6f), rnd(0f, 3f), camCz + rnd(-4f, 3f), rnd(-0.05f, 0.05f), rnd(0.15f, 0.4f), 0, 7f, rnd(0.12f, 0.26f),
                        night ? 0.55f : 1f, night ? 0.65f : 0.95f, night ? 1f : 0.9f);
            }
            motes.update(dt);
            burst.update(dt);
        }

        private final Random random = new Random(42);

        float rnd(float a, float b) { return a + random.nextFloat() * (b - a); }

        boolean isDone(int t) {
            if (eng == null || t >= eng.tubeCount() || eng.length(t) != NecpraWaterEngine.CAP) return false;
            int c = eng.colorAt(t, 0);
            for (int k = 1; k < NecpraWaterEngine.CAP; k++) if (eng.colorAt(t, k) != c) return false;
            return !(pouring && (t == pTo) && pT < POUR_SECONDS * 0.85f);
        }

        void fireworks() {
            int n = eng.tubeCount();
            for (int k = 0; k < 2; k++) {
                int t = random.nextInt(n);
                int rgb = eng.length(t) > 0 ? PALETTE[eng.top(t)] : 0xFFFFFF;
                burst.burst(tx[t], H + 0.8f + random.nextFloat(), tz[t], 26, 3.4f, 1.1f, 0.45f,
                        ((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);
            }
        }

        // ------------------------------------------------------------ input

        @Override
        public void onTouch(NecpraGl gl, int action, float x, float y, int pointer) {
            if (action == MotionEvent.ACTION_DOWN) {
                downX = x;
                downY = y;
                downValid = true;
            } else if (action == MotionEvent.ACTION_MOVE) {
                if (downValid && Math.hypot(x - downX, y - downY) > dp(18)) downValid = false;
            } else if (action == MotionEvent.ACTION_UP) {
                if (downValid) tap(gl, x, y);
                downValid = false;
            } else if (action == MotionEvent.ACTION_CANCEL) {
                downValid = false;
            }
        }

        int pick(NecpraGl gl, float sx, float sy) {
            float[] ray = gl.ray(sx, sy);
            if (ray == null || eng == null) return -1;
            int best = -1;
            float bestT = Float.MAX_VALUE;
            for (int i = 0; i < eng.tubeCount(); i++) {
                float x0 = tx[i], z0 = tz[i];
                float t = NecpraMath.rayHitBox(ray, x0 - 0.66f, 0f, z0 - 0.7f, x0 + 0.66f, H + 1.0f, z0 + 0.7f);
                if (t >= 0 && t < bestT) {
                    bestT = t;
                    best = i;
                }
            }
            return best;
        }

        void tap(NecpraGl gl, float sx, float sy) {
            if (eng == null || pouring || won || locked) return;
            int i = pick(gl, sx, sy);
            if (i < 0) {
                if (sel >= 0) sel = -1;
                return;
            }
            hintFrom = hintTo = -1;
            if (sel < 0) {
                if (eng.length(i) == 0) {
                    shake[i] = 0.25f;
                    return;
                }
                sel = i;
                sound(NecpraSfx.TAP);
                buzz(0);
                return;
            }
            if (sel == i) {
                sel = -1;
                return;
            }
            if (!eng.legal(sel, i)) {
                shake[sel] = 0.3f;
                shake[i] = 0.3f;
                sound(NecpraSfx.ERROR);
                buzz(2);
                sel = eng.length(i) > 0 ? i : -1;
                return;
            }
            startPour(sel, i);
        }

        // ------------------------------------------------------------ pouring

        void startPour(int from, int to) {
            pFrom = from;
            pTo = to;
            pPreFromLen = eng.length(from);
            pPreToLen = eng.length(to);
            for (int k = 0; k < pPreFromLen; k++) pPreFromColors[k] = eng.colorAt(from, k);
            NecpraWaterEngine.Move m = eng.pour(from, to);
            if (m == null) return;
            pColor = m.color;
            pAmount = m.amount;
            pSide = tx[from] < tx[to] ? -1 : (tx[from] > tx[to] ? 1 : (tz[from] <= tz[to] ? -1 : 1));
            pT = 0;
            pouring = true;
            sel = -1;
            streamSplash = 0;
            sound(NecpraSfx.POUR);
            buzz(0);
        }

        void finishPour() {
            pouring = false;
            if (isDone(pTo)) {
                int rgb = PALETTE[pColor];
                burst.burst(tx[pTo], H + 0.4f, tz[pTo], 34, 3.0f, 1.0f, 0.4f, ((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);
                sound(NecpraSfx.CLEAR);
                buzz(1);
            }
            refreshHud(eng.moves(), eng.score(), eng.level());
            roomProgress(eng.moves(), eng.score(), eng.level());
            persist();
            if (eng.isSolved()) {
                won = true;
                winT = 0;
                locked = true;
                return;
            }
            if (!eng.hasMove()) onStuck();
        }

        // ------------------------------------------------------------ actions from the HUD

        void undo() {
            if (eng == null || pouring || won || locked || !eng.canUndo()) return;
            if (eng.undo()) {
                sel = -1;
                hintFrom = hintTo = -1;
                refreshHud(eng.moves(), eng.score(), eng.level());
                persist();
                sound(NecpraSfx.TAP);
            }
        }

        boolean hint() {
            if (eng == null || pouring || won) return true;
            int[] h = eng.hint();
            if (h == null) return false;
            hintFrom = h[0];
            hintTo = h[1];
            hintLeft = 3.5f;
            sel = -1;
            return true;
        }

        boolean addTube() {
            if (eng == null || pouring || won) return true;
            if (!eng.addTube()) return false;
            sel = -1;
            layout();
            fitNeeded = true;
            persist();
            return true;
        }

        void persist() {
            if (eng == null) return;
            if (dailyActive) setSave(NecpraGameStore.today() + "|" + Math.max(5, dailySeconds) + "|" + eng.serialize());
            else setSave(eng.serialize());
        }

        // ------------------------------------------------------------ drawing

        float[] homePose(int i) {
            float sh = shake[i] > 0 ? (float) Math.sin(shake[i] * 60f) * 0.08f * (shake[i] / 0.3f) : 0f;
            return NecpraMath.translation(tx[i] + sh, lift[i] * 0.85f, tz[i]);
        }

        /** World position of the point on the target liquid surface where the stream lands. */
        float[] streamEnd() {
            float level = pPreToLen + pAmount * clamp01((pT / POUR_SECONDS - 0.34f) / 0.42f);
            return new float[]{tx[pTo], Y0 + level * SLOT, tz[pTo]};
        }

        float poseBlend() {
            float p = pT / POUR_SECONDS;
            if (p < 0.28f) return NecpraMath.smoothstep(p / 0.28f);
            if (p > 0.74f) return 1f - NecpraMath.smoothstep((p - 0.74f) / 0.26f);
            return 1f;
        }

        float clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

        /** Source-tube pose while pouring: {cx, cy, cz, angle}. */
        float[] pourPose() {
            float a = pSide * TILT;
            float ca = (float) Math.cos(a), sa = (float) Math.sin(a);
            float lx = -pSide * R_OUT, ly = H / 2f;
            float wx = lx * ca - ly * sa, wy = lx * sa + ly * ca;
            float lipX = tx[pTo] + pSide * 0.1f, lipY = H + 1.0f;
            float cx = lipX - wx, cy = lipY - wy;
            float e = poseBlend();
            float hx = tx[pFrom], hy = lift[pFrom] * 0.85f + H / 2f, hz = tz[pFrom];
            float k = NecpraMath.easeInOutCubic(e);
            return new float[]{NecpraMath.lerp(hx, cx, k), NecpraMath.lerp(hy, cy, k), NecpraMath.lerp(hz, tz[pTo], k), a * k, lipX, lipY};
        }

        float[] poseMatrix(float[] pp) {
            float[] m = NecpraMath.translation(pp[0], pp[1], pp[2]);
            m = NecpraMath.mul(m, NecpraMath.rotationZ(pp[3]));
            return NecpraMath.mul(m, NecpraMath.translation(0, -H / 2f, 0));
        }

        float fractionOf(int tube, int slot) {
            if (!pouring) return slot < eng.length(tube) ? 1f : 0f;
            float p = pT / POUR_SECONDS;
            if (tube == pFrom) {
                if (slot >= pPreFromLen) return 0f;
                int k = pPreFromLen - 1 - slot;
                float d = pAmount * clamp01((p - 0.30f) / 0.42f);
                return k < pAmount ? 1f - clamp01(d - k) : 1f;
            }
            if (tube == pTo) {
                float d = pAmount * clamp01((p - 0.34f) / 0.42f);
                int j = slot - pPreToLen;
                if (j >= 0 && j < pAmount) return clamp01(d - j);
                return slot < pPreToLen ? 1f : 0f;
            }
            return slot < eng.length(tube) ? 1f : 0f;
        }

        int colorOf(int tube, int slot) {
            if (pouring && tube == pFrom) return pPreFromColors[slot];
            return eng.colorAt(tube, slot);
        }

        void rgb(int c, float[] out) {
            out[0] = ((c >> 16) & 255) / 255f;
            out[1] = ((c >> 8) & 255) / 255f;
            out[2] = (c & 255) / 255f;
        }

        @Override
        public void render(NecpraGl gl) {
            gl.clear();
            if (night) {
                gl.drawBackground(new float[]{0.035f, 0.06f, 0.15f}, new float[]{0.10f, 0.06f, 0.21f}, new float[]{0.05f, 0.12f, 0.30f}, new float[]{0.20f, 0.07f, 0.28f});
            } else {
                gl.drawBackground(new float[]{0.74f, 0.85f, 1.0f}, new float[]{0.97f, 0.88f, 0.98f}, new float[]{0.20f, 0.20f, 0.14f}, new float[]{0.18f, 0.10f, 0.16f});
            }
            if (eng == null) return;
            applyCamera(gl);

            int n = eng.tubeCount();
            float[] c = new float[3];

            // shelves
            gl.beginOpaque();
            for (int r = 0; r < rows; r++) {
                int inRow = Math.min(cols, n - r * cols);
                float w = inRow * SPACING_X + 0.5f;
                float z = -r * SPACING_Z + (rows - 1) * SPACING_Z * 0.5f;
                float[] m = NecpraMath.mul(NecpraMath.translation(0, -0.12f, z), NecpraMath.scaling(w, 1f, 1f));
                if (night) gl.draw(shelf, m, 0.16f, 0.2f, 0.34f, 1f, 0.55f, 0.02f, 0.25f, 0f);
                else gl.draw(shelf, m, 0.96f, 0.94f, 1.0f, 1f, 0.5f, 0.04f, 0.1f, 0f);
            }
            // contact shadows
            for (int i = 0; i < n; i++) {
                float lf = (pouring && i == pFrom) ? 0f : lift[i];
                gl.drawBlob(disc, NecpraMath.mul(NecpraMath.translation(tx[i], 0.0f, tz[i]), NecpraMath.scaling(0.62f, 1f, 0.62f)), 0.42f - 0.18f * lf);
            }
            gl.beginOpaque();

            // base rings (selection / hint / complete)
            for (int i = 0; i < n; i++) {
                float glow = 0f;
                float cr = 1f, cg = 0.85f, cb = 0.3f;
                if (sel == i) glow = 0.75f + 0.25f * (float) Math.sin(time * 7f);
                else if (i == hintFrom) {
                    glow = 0.6f + 0.4f * (float) Math.sin(time * 9f);
                    cr = 0.2f; cg = 0.95f; cb = 0.45f;
                } else if (i == hintTo) {
                    glow = 0.6f + 0.4f * (float) Math.sin(time * 9f);
                    cr = 0.3f; cg = 0.65f; cb = 1f;
                } else if (corkT[i] > 0.5f && !won) {
                    glow = 0.35f;
                    int rgbv = PALETTE[eng.colorAt(i, 0) % PALETTE.length];
                    rgb(rgbv, c);
                    cr = c[0]; cg = c[1]; cb = c[2];
                }
                if (glow > 0.01f) {
                    float[] m = NecpraMath.translation(tx[i], 0.05f, tz[i]);
                    gl.draw(ring, m, cr, cg, cb, 1f, 0f, glow * 1.3f, 0f, 0f);
                }
            }

            // liquids and corks
            for (int i = 0; i < n; i++) drawLiquid(gl, i, c);

            // glass last, far to near
            gl.beginTransparent();
            GlStateCullOff();
            for (int r = rows - 1; r >= 0; r--) {
                for (int i = 0; i < n; i++) if (i / cols == r) drawGlass(gl, i);
            }
            gl.endTransparent();
            GlStateCullOn();

            // pour stream in front of the glass so it reads clearly
            if (pouring) drawStream(gl, c);

            gl.drawParticles(motes);
            gl.drawParticles(burst);
        }

        void GlStateCullOff() { android.opengl.GLES20.glDisable(android.opengl.GLES20.GL_CULL_FACE); }

        void GlStateCullOn() { android.opengl.GLES20.glEnable(android.opengl.GLES20.GL_CULL_FACE); }

        float[] baseMatrix(int i, float[] poseOut) {
            if (pouring && i == pFrom) {
                float[] pp = pourPose();
                if (poseOut != null) System.arraycopy(pp, 0, poseOut, 0, 4);
                return poseMatrix(pp);
            }
            if (poseOut != null) {
                poseOut[0] = poseOut[1] = poseOut[2] = poseOut[3] = 0;
            }
            return homePose(i);
        }

        void drawLiquid(NecpraGl gl, int i, float[] c) {
            float[] pose = new float[4];
            float[] base = baseMatrix(i, pose);
            boolean tilted = pouring && i == pFrom && Math.abs(pose[3]) > 0.02f;

            float total = 0f;
            for (int s = 0; s < NecpraWaterEngine.CAP; s++) total += fractionOf(i, s);
            float fill0 = fractionOf(i, 0);

            if (tilted) {
                float lfill = Y0 + total * SLOT;
                float planeY = pose[1] + (float) Math.cos(pose[3]) * (lfill - H / 2f);
                gl.clipY(planeY);
            }
            for (int s = 0; s < NecpraWaterEngine.CAP; s++) {
                float f = fractionOf(i, s);
                if (f <= 0.001f) continue;
                int col = PALETTE[colorOf(i, s) % PALETTE.length];
                rgb(col, c);
                float yb = Y0 + s * SLOT, top = yb + f * SLOT;
                if (s == 0) {
                    // rounded bottom: sphere cup, level-clipped when upright
                    float[] cup = NecpraMath.mul(base, NecpraMath.mul(NecpraMath.translation(0, Y0 + R_IN, 0), NecpraMath.scaling(R_IN, R_IN, R_IN)));
                    if (!tilted) gl.clipY(base[13] + Y0 + fill0 * SLOT);
                    gl.draw(sph, cup, c[0], c[1], c[2], 1f, 0.5f, 0.07f, 0.14f, 0f);
                    if (!tilted) gl.clipY(1000f);
                    yb = Y0 + R_IN;
                }
                float h = top - yb;
                if (h <= 0.002f) continue;
                float[] m = NecpraMath.mul(base, NecpraMath.mul(NecpraMath.translation(0, yb + h / 2f, 0), NecpraMath.scaling(R_IN, h, R_IN)));
                gl.draw(cyl, m, c[0], c[1], c[2], 1f, 0.55f, 0.07f, 0.14f, 0f);
            }
            gl.clipY(1000f);

            // cork lid pops on a finished tube
            float ct = corkT[i];
            if (ct > 0.02f && !tilted) {
                float sc = NecpraMath.easeOutBack(Math.min(1f, ct));
                float[] m = NecpraMath.mul(base, NecpraMath.mul(NecpraMath.translation(0, H + 0.02f + (1f - Math.min(1f, ct)) * 0.5f, 0),
                        NecpraMath.scaling(0.98f * sc, 0.5f * sc, 0.98f * sc)));
                gl.draw(cork, m, 0.96f, 0.78f, 0.28f, 1f, 0.9f, 0.1f, 0.3f, 0f);
            }
        }

        void drawGlass(NecpraGl gl, int i) {
            float[] base = baseMatrix(i, null);
            boolean dark = night;
            float gr = dark ? 0.72f : 0.55f, gg = dark ? 0.82f : 0.68f, gb = 1f;
            gl.draw(glass, base, gr, gg, gb, dark ? 0.15f : 0.13f, 0.9f, 0.04f, 0.6f, 0.65f);
            float[] rm = NecpraMath.mul(base, NecpraMath.translation(0, H, 0));
            gl.draw(rim, rm, gr, gg, gb, 0.5f, 0.9f, 0.05f, 0.5f, 0.3f);
        }

        void drawStream(NecpraGl gl, float[] c) {
            float p = pT / POUR_SECONDS;
            if (p < 0.30f || p > 0.80f) return;
            float[] pp = pourPose();
            // lip position with the live tilt
            float a = pp[3];
            float ca = (float) Math.cos(a), sa = (float) Math.sin(a);
            float lx = -pSide * R_OUT, ly = H / 2f;
            float lipX = pp[0] + lx * ca - ly * sa, lipY = pp[1] + lx * sa + ly * ca, lipZ = pp[2];
            float[] end = streamEnd();
            float width = 0.075f * (p > 0.7f ? Math.max(0.2f, (0.8f - p) * 10f) : Math.min(1f, (p - 0.3f) * 14f));
            rgb(PALETTE[pColor % PALETTE.length], c);
            gl.beginOpaque();
            int seg = 7;
            float px = lipX, py = lipY, pz = lipZ;
            for (int k = 1; k <= seg; k++) {
                float u = k / (float) seg;
                float nx = NecpraMath.lerp(lipX, end[0], u);
                float ny = NecpraMath.lerp(lipY, end[1], u * u);
                float nz = NecpraMath.lerp(lipZ, end[2], u);
                segment(gl, px, py, pz, nx, ny, nz, width, c);
                px = nx;
                py = ny;
                pz = nz;
            }
        }

        void segment(NecpraGl gl, float x0, float y0, float z0, float x1, float y1, float z1, float r, float[] c) {
            float dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
            float len = (float) Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len < 1e-4f) return;
            float yx = dx / len, yy = dy / len, yz = dz / len;
            // any vector not parallel to Y gives the first perpendicular
            float ax = Math.abs(yy) < 0.9f ? 0f : 1f, ay = Math.abs(yy) < 0.9f ? 1f : 0f;
            float xx = ay * yz, xy = -ax * yz + 0f, xz = ax * yy - ay * yx;
            float xl = (float) Math.sqrt(xx * xx + xy * xy + xz * xz);
            if (xl < 1e-5f) return;
            xx /= xl; xy /= xl; xz /= xl;
            float zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
            float[] m = new float[]{
                    xx * r, xy * r, xz * r, 0,
                    yx * len, yy * len, yz * len, 0,
                    zx * r, zy * r, zz * r, 0,
                    (x0 + x1) / 2f, (y0 + y1) / 2f, (z0 + z1) / 2f, 1};
            gl.draw(cyl, m, c[0], c[1], c[2], 1f, 0.6f, 0.12f, 0.2f, 0f);
        }
    }
}
