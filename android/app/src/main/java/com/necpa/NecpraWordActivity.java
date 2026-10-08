package com.necpa;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Native Word Connect (stored and served as the "crossword" game, like the web arcade). Swipe across the letters of
 * the wheel to spell a word; words that belong to the puzzle fill the crossword board. Hints reveal a cell, the word
 * list shows how many words of each length are left. A "Play Together" match gives both players the same puzzle:
 * hints and the word list are switched off, and the score is words x 10 plus the completion bonus (same formula as
 * the web arcade). Rules live in {@link NecpraWordEngine}.
 */
public class NecpraWordActivity extends NecpraGameActivity {
    private NecpraWordEngine eng;
    private boolean roomMode, roomStarted, submittedRoom, finishedLevel;
    private int hintsAtStart;
    private String roomCode;
    private NecpraRoomSession room;
    private long matchStartMs;

    private LinearLayout content;
    private TextView tvLevel, tvFound, tvHints, tvPreview, tvOpp, tvInfo;
    private TextView btnHint, btnList, btnShuffle, btnRestart;
    private BoardView boardView;
    private WheelView wheelView;

    @Override protected String gameId() { return "crossword"; }

    @Override protected String gameTitle() {
        return getIntent() != null && getIntent().getStringExtra(EXTRA_ROOM) != null ? "Word Connect · Match" : "Word Connect";
    }

    // ------------------------------------------------------------------ build

    @Override
    protected void onBuild(Bundle saved) {
        roomCode = getIntent().getStringExtra(EXTRA_ROOM);
        roomMode = roomCode != null;
        buildUi();
        if (roomMode) {
            tvInfo.setText("Joining match…");
            btnHint.setVisibility(View.GONE);
            btnList.setVisibility(View.GONE);
            btnRestart.setVisibility(View.GONE);
            tvHints.setVisibility(View.GONE);
            wheelView.setLocked(true);
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
            return;
        }
        int want = getIntent().getIntExtra(EXTRA_LEVEL, 0);
        if (want > 0) store.adoptLevel("crossword", want);
        int level = store.level("crossword");
        String r = store.resume("crossword");
        NecpraWordEngine d = r == null ? null : NecpraWordEngine.deserialize(r);
        // Resume the exact puzzle that was being played (a replay of an earlier level included).
        if (d != null && d.endlessLevel() >= 1 && d.endlessLevel() <= level && !d.isComplete()) eng = d;
        else eng = new NecpraWordEngine(level, store.wordHints());
        install();
        pullServerCoins();
    }

    private void buildUi() {
        content = column();
        content.setPadding(dp(14), dp(70), dp(14), dp(12));
        stage.addView(content, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout chips = row();
        chips.setGravity(Gravity.CENTER);
        tvLevel = statChip("LEVEL 1");
        tvFound = statChip("0 / 0 words");
        tvHints = statChip("💡 0");
        for (TextView t : new TextView[]{tvLevel, tvFound, tvHints}) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.leftMargin = lp.rightMargin = dp(4);
            chips.addView(t, lp);
        }
        content.addView(chips, new LinearLayout.LayoutParams(-1, -2));

        tvOpp = text("", 13, cText, true);
        tvOpp.setGravity(Gravity.CENTER);
        tvOpp.setVisibility(View.GONE);
        tvOpp.setPadding(0, dp(6), 0, 0);
        content.addView(tvOpp, new LinearLayout.LayoutParams(-1, -2));

        boardView = new BoardView(this);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(-1, 0, 1f);
        blp.topMargin = dp(10);
        content.addView(boardView, blp);

        tvInfo = text("", 13, cSub, true);
        tvInfo.setGravity(Gravity.CENTER);
        content.addView(tvInfo, new LinearLayout.LayoutParams(-1, -2));

        tvPreview = text("", 22, Color.WHITE, true);
        tvPreview.setGravity(Gravity.CENTER);
        tvPreview.setLetterSpacing(0.12f);
        tvPreview.setPadding(dp(18), dp(6), dp(18), dp(6));
        tvPreview.setBackground(round(cPrimary, 16));
        tvPreview.setVisibility(View.INVISIBLE);
        LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(-2, -2);
        plp.gravity = Gravity.CENTER_HORIZONTAL;
        plp.topMargin = dp(4);
        content.addView(tvPreview, plp);

        wheelView = new WheelView(this);
        int side = Math.min(getResources().getDisplayMetrics().widthPixels - dp(60), dp(300));
        LinearLayout.LayoutParams wlp = new LinearLayout.LayoutParams(side, side);
        wlp.gravity = Gravity.CENTER_HORIZONTAL;
        wlp.topMargin = dp(6);
        content.addView(wheelView, wlp);

        LinearLayout bar = row();
        bar.setPadding(0, dp(8), 0, 0);
        btnShuffle = toolButton("🔀\nShuffle", new Runnable() {
            @Override public void run() {
                if (eng == null) return;
                eng.shuffleWheel();
                wheelView.invalidate();
            }
        });
        btnHint = toolButton("💡\nHint", new Runnable() { @Override public void run() { useHint(); } });
        btnList = toolButton("📋\nWord list", new Runnable() { @Override public void run() { openWordList(); } });
        btnRestart = toolButton("⟳\nRestart", new Runnable() { @Override public void run() { askRestart(); } });
        TextView[] bs = {btnShuffle, btnHint, btnList, btnRestart};
        for (int i = 0; i < bs.length; i++) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(54), 1f);
            if (i > 0) lp.leftMargin = dp(8);
            bar.addView(bs[i], lp);
        }
        content.addView(bar, new LinearLayout.LayoutParams(-1, -2));
    }

    @Override protected void onInsets(int top, int bottom, int left, int right) {
        if (content == null) return;
        content.setPadding(dp(14) + left, top + dp(58), dp(14) + right, bottom + dp(12));
    }

    /** Start the same puzzle over (solo only; a live match can't be restarted). */
    private void askRestart() {
        if (roomMode || eng == null || finishedLevel) return;
        confirm("Start this level over?", "The words you found in this level are cleared.", "Restart", "Keep playing", true, new Runnable() {
            @Override public void run() {
                store.saveResume("crossword", null);
                eng = new NecpraWordEngine(eng.endlessLevel(), store.wordHints());
                install();
                saveNow();
            }
        });
    }

    private void install() {
        finishedLevel = false;
        hintsAtStart = eng == null ? 0 : eng.hints();
        wheelView.setLocked(false);
        refresh();
    }

    private void refresh() {
        if (eng == null || dead()) return;
        tvLevel.setText("LEVEL " + eng.endlessLevel());
        tvFound.setText(eng.foundCount() + " / " + eng.totalWords() + " words");
        tvHints.setText("💡 " + eng.hints());
        boardView.invalidate();
        wheelView.invalidate();
        if (!roomMode) tvInfo.setText("Swipe across the letters to spell a word");
    }

    // ------------------------------------------------------------------ words

    private void onWord(String word) {
        if (eng == null || finishedLevel || submittedRoom) return;
        NecpraWordEngine.Submit r = eng.submit(word);
        switch (r) {
            case NEW_WORD:
                sfx.play(NecpraSfx.WORD);
                sfx.haptic(root, 0);
                int coins = NecpraWordEngine.wordCoins(word.toUpperCase());
                if (!roomMode) earn(coins, null);
                floatText("+" + coins, root.getWidth() / 2f, root.getHeight() * 0.3f, cGold);
                refresh();
                if (roomMode) roomProgress();
                else saveNow();
                if (eng.isComplete()) levelDone();
                break;
            case ALREADY_FOUND:
                toast("Already found");
                sfx.play(NecpraSfx.WRONG);
                break;
            case NOT_IN_PUZZLE:
                sfx.play(NecpraSfx.WRONG);
                sfx.haptic(root, 2);
                toast("Not in this puzzle");
                break;
            default:
                break;
        }
    }

    private void useHint() {
        if (eng == null || roomMode || finishedLevel || modalOpen()) return;
        if (eng.hints() <= 0) {
            toast("No hints left — finish a level to earn one");
            return;
        }
        int[] cell = eng.useHint();
        if (cell == null) {
            toast("Nothing left to reveal");
            return;
        }
        store.setWordHints(eng.hints());
        sfx.play(NecpraSfx.TAP);
        refresh();
        saveNow();
        if (eng.isComplete()) levelDone();
    }

    private void openWordList() {
        if (eng == null || roomMode || modalOpen()) return;
        if (store.freeWordListOpens() > 0) {
            store.useWordListOpen();
            showWordList();
            return;
        }
        pay(NecpraWordEngine.WORD_LIST_COST, "The word list", new Runnable() {
            @Override public void run() { showWordList(); }
        });
    }

    private void showWordList() {
        LinearLayout c = column();
        c.addView(text("Words in this puzzle", 20, cText, true));
        TextView sub = text(eng.foundCount() + " of " + eng.totalWords() + " found", 13.5f, cSub, false);
        sub.setPadding(0, dp(4), 0, dp(12));
        c.addView(sub);
        Map<Integer, List<String>> by = eng.wordsByLength();
        List<Integer> lens = new ArrayList<>(by.keySet());
        Collections.sort(lens);
        for (int len : lens) {
            List<String> ws = by.get(len);
            int left = 0;
            for (String w : ws) if (!eng.isFound(w)) left++;
            TextView t = text(len + " letters — " + ws.size() + (ws.size() == 1 ? " word" : " words")
                    + (left == 0 ? "  ✓" : "  (" + left + " left)"), 15, left == 0 ? cGood : cText, true);
            t.setPadding(0, dp(6), 0, dp(2));
            c.addView(t);
            StringBuilder sb = new StringBuilder();
            for (String w : ws) {
                if (sb.length() > 0) sb.append("   ");
                sb.append(eng.isFound(w) ? w : mask(w));
            }
            TextView words = text(sb.toString(), 13.5f, cSub, false);
            words.setLetterSpacing(0.05f);
            c.addView(words);
        }
        c.addView(space(12));
        final Modal m = modal(c, true);
        c.addView(button("Close", SECONDARY, new Runnable() {
            @Override public void run() { m.dismiss(); }
        }));
    }

    private static String mask(String w) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < w.length(); i++) sb.append("·");
        return sb.toString();
    }

    // ------------------------------------------------------------------ level complete

    private void levelDone() {
        if (finishedLevel) return;
        finishedLevel = true;
        wheelView.setLocked(true);
        sfx.play(NecpraSfx.WIN);
        final int bonus = eng.completeBonus();
        final int found = eng.foundCount();
        if (roomMode) {
            submitRoom(found * 10 + bonus, found);
            return;
        }
        final int done = eng.endlessLevel();
        // No hints used is a perfect score; every hint spent lowers the praise a step.
        int hintsUsed = Math.max(0, hintsAtStart - eng.hints());
        double ratio = hintsUsed == 0 ? 1.0 : hintsUsed == 1 ? 0.9 : hintsUsed == 2 ? 0.8 : hintsUsed == 3 ? 0.65 : 0.5;
        eng.grantCompleteRewards();
        store.setWordHints(eng.hints());
        store.saveResume("crossword", null);
        store.recordGame("crossword", found * 10 + bonus, done + 1);
        store.setLevel("crossword", Math.max(store.level("crossword"), done + 1));
        store.setStars("crossword", done, 3);
        earn(bonus, null);
        levelResult(done, ratio, 3,
                new String[][]{{"Words", found + " / " + eng.totalWords()}, {"Bonus", "🪙 " + bonus}, {"Hints", "+1 (💡 " + eng.hints() + ")"}},
                "Next level", new Runnable() {
                    @Override public void run() {
                        eng.next();
                        install();
                        saveNow();
                    }
                }, new Runnable() {
                    @Override public void run() {
                        eng = new NecpraWordEngine(done, store.wordHints());
                        install();
                        saveNow();
                    }
                }, new Runnable() {
                    @Override public void run() { finish(); }
                });
    }

    private void saveNow() {
        if (roomMode || eng == null || eng.isComplete()) return;
        store.saveResume("crossword", eng.serialize());
        store.setWordHints(eng.hints());
    }

    @Override protected void onSaveGame() { saveNow(); }

    @Override protected void onBackRequested() {
        if (roomMode && !submittedRoom) {
            confirm("Leave the match?", "Your opponent keeps playing and you forfeit this round.", "Leave", "Stay", true,
                    new Runnable() { @Override public void run() { finish(); } });
            return;
        }
        finish();
    }

    @Override protected void onDestroy() {
        if (room != null) room.stop();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ rooms

    private void onRoomUpdate(JSONObject r) {
        if (!roomStarted) {
            roomStarted = true;
            eng = new NecpraWordEngine(NecpraRoomSession.levelOf(r), 0);
            refresh();
        }
        String st = NecpraRoomSession.statusOf(r);
        boolean playing = "playing".equals(st) || "finished".equals(st);
        wheelView.setLocked(!playing || submittedRoom || finishedLevel);
        if (!playing) tvInfo.setText("Waiting for your friend…  Code " + roomCode);
        else {
            if (matchStartMs == 0) matchStartMs = System.currentTimeMillis();
            if (!submittedRoom) tvInfo.setText("Find every word before your friend does!");
        }
        JSONObject opp = room.opponent();
        if (opp != null) {
            tvOpp.setVisibility(View.VISIBLE);
            tvOpp.setText("Opponent · " + opp.optInt("progress", 0) + "%  ·  " + opp.optInt("answered", 0) + " words"
                    + (opp.optBoolean("completed") ? "  ✓ done" : ""));
        }
        if (room.finished() && submittedRoom) showRoomResult();
    }

    private void roomProgress() {
        if (!roomMode || room == null || !roomStarted || eng == null) return;
        try {
            JSONObject s = new JSONObject();
            s.put("score", eng.foundCount() * 10);
            s.put("answered", eng.foundCount());
            s.put("correct", eng.foundCount());
            s.put("progress", Math.min(99, Math.round(eng.foundCount() / (float) Math.max(1, eng.totalWords()) * 100)));
            s.put("currentLevel", eng.endlessLevel());
            s.put("timeMs", matchStartMs == 0 ? 0 : System.currentTimeMillis() - matchStartMs);
            room.push(s, eng.foundCount() * 10);
        } catch (Exception ignored) { }
    }

    private void submitRoom(int score, int found) {
        if (submittedRoom) return;
        submittedRoom = true;
        tvInfo.setText("Done! Waiting for the result…");
        long t = matchStartMs == 0 ? 0 : System.currentTimeMillis() - matchStartMs;
        room.submit(score, t, found, found, new NecpraRoomSession.ResultCallback() {
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
        long myT = me == null ? 0 : me.optLong("timeMs", 0), theirT = opp == null ? 0 : opp.optLong("timeMs", 0);
        int reward = room.myReward();
        boolean won = mine > theirs || (mine == theirs && reward >= 100);
        boolean draw = mine == theirs && !won;
        pullServerCoins();
        sfx.play(won ? NecpraSfx.WIN : NecpraSfx.FAIL);
        resultCard(won ? "You won!" : (draw ? "It's a draw" : "Match finished"),
                won ? "Top score takes the match." : (draw ? "Same score — the reward is shared." : "Better luck in the rematch."),
                won ? 3 : (draw ? 2 : 1),
                new String[][]{{"You", mine + " pts · " + secs(myT)}, {"Opponent", theirs + " pts · " + secs(theirT)},
                        {"Reward", reward > 0 ? "🪙 " + reward : "—"}},
                "Done", new Runnable() { @Override public void run() { finish(); } }, null, null);
    }

    private static String secs(long ms) {
        if (ms <= 0) return "—";
        return (ms / 1000) + "s";
    }

    // ------------------------------------------------------------------ crossword board

    private final class BoardView extends View {
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint txt = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rect = new RectF();

        BoardView(Context c) {
            super(c);
            txt.setTextAlign(Paint.Align.CENTER);
            txt.setFakeBoldText(true);
        }

        @Override protected void onDraw(Canvas cv) {
            if (eng == null) return;
            NecpraWordEngine.Level lv = eng.current();
            if (lv.h <= 0 || lv.w <= 0) return;
            float cell = Math.min(Math.min(getWidth() / (float) lv.w, getHeight() / (float) lv.h), dp(46));
            float gw = cell * lv.w, gh = cell * lv.h;
            float ox = (getWidth() - gw) / 2f, oy = (getHeight() - gh) / 2f;
            float gap = Math.max(2f, cell * 0.06f);
            txt.setTextSize(cell * 0.56f);
            Paint.FontMetrics fm = txt.getFontMetrics();
            float shift = -(fm.ascent + fm.descent) / 2f;
            for (int r = 0; r < lv.h; r++) {
                for (int c = 0; c < lv.w; c++) {
                    if (!eng.isBoardCell(r, c)) continue;
                    rect.set(ox + c * cell + gap, oy + r * cell + gap, ox + (c + 1) * cell - gap, oy + (r + 1) * cell - gap);
                    boolean shown = eng.isRevealed(r, c);
                    if (shown) {
                        fill.setColor(cPrimary);
                        cv.drawRoundRect(rect, cell * 0.2f, cell * 0.2f, fill);
                        txt.setColor(Color.WHITE);
                        cv.drawText(String.valueOf(eng.letterAt(r, c)), rect.centerX(), rect.centerY() + shift, txt);
                    } else {
                        fill.setColor(night ? Color.parseColor("#1B2638") : Color.parseColor("#DDE3EE"));
                        cv.drawRoundRect(rect, cell * 0.2f, cell * 0.2f, fill);
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------ letter wheel

    private final class WheelView extends View {
        private final Paint disc = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint node = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint txt = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private final List<Integer> picked = new ArrayList<>();
        private float fx, fy;
        private boolean dragging, locked;

        WheelView(Context c) {
            super(c);
            txt.setTextAlign(Paint.Align.CENTER);
            txt.setFakeBoldText(true);
            line.setStyle(Paint.Style.STROKE);
            line.setStrokeCap(Paint.Cap.ROUND);
            line.setStrokeJoin(Paint.Join.ROUND);
        }

        void setLocked(boolean v) {
            locked = v;
            if (v) clear();
            invalidate();
        }

        private void clear() {
            picked.clear();
            dragging = false;
            tvPreview.setVisibility(View.INVISIBLE);
        }

        private float nodeX(int i, int n, float cx, float ring) {
            return cx + (float) Math.cos(Math.toRadians(-90 + i * 360.0 / n)) * ring;
        }

        private float nodeY(int i, int n, float cy, float ring) {
            return cy + (float) Math.sin(Math.toRadians(-90 + i * 360.0 / n)) * ring;
        }

        private int hit(float x, float y) {
            if (eng == null) return -1;
            int n = eng.wheelSize();
            float size = getWidth(), cx = size / 2f, cy = size / 2f, ring = size * 0.34f, rad = (n > 6 ? size * 0.095f : size * 0.11f) * 1.15f;
            for (int i = 0; i < n; i++) {
                float dx = x - nodeX(i, n, cx, ring), dy = y - nodeY(i, n, cy, ring);
                if (dx * dx + dy * dy <= rad * rad) return i;
            }
            return -1;
        }

        private String word() {
            StringBuilder sb = new StringBuilder();
            for (int p : picked) sb.append(eng.wheelLetter(p));
            return sb.toString();
        }

        @Override public boolean onTouchEvent(MotionEvent e) {
            if (locked || eng == null) return true;
            fx = e.getX();
            fy = e.getY();
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN: {
                    int h = hit(fx, fy);
                    if (h < 0) return true;
                    picked.clear();
                    picked.add(h);
                    dragging = true;
                    getParent().requestDisallowInterceptTouchEvent(true);
                    sfx.play(NecpraSfx.TAP);
                    preview();
                    invalidate();
                    return true;
                }
                case MotionEvent.ACTION_MOVE: {
                    if (!dragging) return true;
                    int h = hit(fx, fy);
                    if (h >= 0) {
                        int size = picked.size();
                        if (size >= 2 && picked.get(size - 2) == h) {
                            picked.remove(size - 1);          // swipe back to undo the last letter
                            preview();
                        } else if (!picked.contains(h)) {
                            picked.add(h);
                            sfx.play(NecpraSfx.TAP);
                            preview();
                        }
                    }
                    invalidate();
                    return true;
                }
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL: {
                    if (!dragging) return true;
                    String w = word();
                    boolean submit = e.getActionMasked() == MotionEvent.ACTION_UP && w.length() >= 1;
                    clear();
                    invalidate();
                    if (submit) {
                        if (w.length() < 3) {
                            if (w.length() > 1) toast("Words need at least 3 letters");
                        } else {
                            onWord(w);
                        }
                    }
                    return true;
                }
                default:
                    return true;
            }
        }

        private void preview() {
            if (picked.isEmpty()) {
                tvPreview.setVisibility(View.INVISIBLE);
                return;
            }
            tvPreview.setText(word());
            tvPreview.setVisibility(View.VISIBLE);
        }

        @Override protected void onDraw(Canvas cv) {
            if (eng == null) return;
            int n = eng.wheelSize();
            float size = getWidth(), cx = size / 2f, cy = size / 2f, ring = size * 0.34f;
            float rad = n > 6 ? size * 0.095f : size * 0.11f;
            disc.setColor(night ? Color.parseColor("#151E2E") : Color.parseColor("#E3E8F2"));
            cv.drawCircle(cx, cy, size * 0.49f, disc);
            if (picked.size() > 0) {
                line.setColor(alpha(cPrimary, 0xCC));
                line.setStrokeWidth(rad * 0.45f);
                path.reset();
                path.moveTo(nodeX(picked.get(0), n, cx, ring), nodeY(picked.get(0), n, cy, ring));
                for (int i = 1; i < picked.size(); i++) path.lineTo(nodeX(picked.get(i), n, cx, ring), nodeY(picked.get(i), n, cy, ring));
                if (dragging) path.lineTo(fx, fy);
                cv.drawPath(path, line);
            }
            txt.setTextSize(rad * 1.25f);
            Paint.FontMetrics fm = txt.getFontMetrics();
            float shift = -(fm.ascent + fm.descent) / 2f;
            for (int i = 0; i < n; i++) {
                float x = nodeX(i, n, cx, ring), y = nodeY(i, n, cy, ring);
                boolean on = picked.contains(i);
                node.setColor(on ? cPrimary : (night ? Color.parseColor("#243044") : Color.WHITE));
                cv.drawCircle(x, y, rad, node);
                txt.setColor(on ? Color.WHITE : cText);
                cv.drawText(String.valueOf(eng.wheelLetter(i)), x, y + shift, txt);
            }
        }
    }
}
