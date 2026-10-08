package com.necpa;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * Native Trivia Master. Solo play runs level by level (8 questions each, harder tiers and shorter timers as the level
 * rises, 50:50 / Skip / Hint once per level). A "Play Together" match uses the room's seed so both players answer the
 * same questions in the same order, with no per-question timer, and the higher score wins. Rules live in
 * {@link NecpraTriviaEngine}.
 */
public class NecpraTriviaActivity extends NecpraGameActivity {
    private static final long REVEAL_MS = 900;
    private static final String[] SUBJECT_LABELS = {"Mixed", "General", "Science", "Maths", "Geography", "History", "Kenya", "Tech"};

    private NecpraTriviaEngine eng;
    private int levelNo = 1;
    private String subject = "mixed";

    private boolean roomMode, roomStarted, submittedRoom;
    private String roomCode;
    private NecpraRoomSession room;
    private long matchStartMs;

    private LinearLayout content, answersBox;
    private TextView tvLevel, tvScore, tvStreak, tvCount, tvQuestion, tvHint, tvOpp, tvTimer;
    private TextView[] answerBtns = new TextView[4];
    private TextView btn50, btnSkip, btnHint, btnRestart;
    private View progressFill, timerFill;
    private FrameLayout progressTrack, timerTrack;

    private int secondsLeft, secondsTotal;
    private long deadline;
    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (dead() || eng == null || eng.finished() || eng.answered() || roomMode) return;
            if (modalOpen()) {
                deadline += 100;   // the clock waits while a dialog is open
                main.postDelayed(this, 100);
                return;
            }
            long left = deadline - System.currentTimeMillis();
            if (left <= 0) {
                answer(-1);
                return;
            }
            updateTimer(left);
            main.postDelayed(this, 100);
        }
    };

    @Override protected String gameId() { return "trivia"; }

    @Override protected String gameTitle() {
        return getIntent() != null && getIntent().getStringExtra(EXTRA_ROOM) != null ? "Trivia · Match" : "Trivia Master";
    }

    // ------------------------------------------------------------------ build

    @Override
    protected void onBuild(Bundle saved) {
        roomCode = getIntent().getStringExtra(EXTRA_ROOM);
        roomMode = roomCode != null;
        buildUi();
        if (roomMode) {
            tvQuestion.setText("Joining match…");
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
            setAnswersEnabled(false);
            return;
        }
        int want = getIntent().getIntExtra(EXTRA_LEVEL, 0);
        if (want > 0) store.adoptLevel("trivia", want);
        levelNo = store.level("trivia");
        String s = getIntent().getStringExtra(EXTRA_SUBJECT);
        subject = isSubject(s) ? s : store.triviaSubject();
        String r = store.resume("trivia");
        NecpraTriviaEngine d = r == null ? null : NecpraTriviaEngine.deserialize(r);
        // Resume the exact level that was being played (a replay of an earlier level included).
        if (d != null && !d.finished() && d.level() >= 1 && d.level() <= levelNo) {
            eng = d;
            levelNo = d.level();
            subject = d.subject();
            showQuestion();
        } else {
            showSubjectPicker();
        }
        pullServerCoins();
    }

    private boolean isSubject(String s) {
        if (s == null) return false;
        for (String x : NecpraTriviaEngine.SUBJECTS) if (x.equals(s)) return true;
        return false;
    }

    private void buildUi() {
        content = column();
        content.setPadding(dp(16), dp(70), dp(16), dp(14));
        stage.addView(content, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout chips = row();
        chips.setGravity(Gravity.CENTER);
        tvLevel = statChip("LEVEL 1");
        tvScore = statChip("0 pts");
        tvStreak = statChip("STREAK ×0");
        for (TextView t : new TextView[]{tvLevel, tvScore, tvStreak}) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.leftMargin = lp.rightMargin = dp(4);
            chips.addView(t, lp);
        }
        content.addView(chips, new LinearLayout.LayoutParams(-1, -2));

        tvCount = text("", 13, cSub, true);
        tvCount.setGravity(Gravity.CENTER);
        tvCount.setPadding(0, dp(12), 0, dp(6));
        content.addView(tvCount, new LinearLayout.LayoutParams(-1, -2));

        progressTrack = new FrameLayout(this);
        progressTrack.setBackground(round(alpha(cLine, 0xB0), 4));
        progressFill = new View(this);
        progressFill.setBackground(round(cPrimary, 4));
        progressTrack.addView(progressFill, new FrameLayout.LayoutParams(0, -1));
        content.addView(progressTrack, new LinearLayout.LayoutParams(-1, dp(6)));

        timerTrack = new FrameLayout(this);
        timerTrack.setBackground(round(alpha(cLine, 0x90), 3));
        timerFill = new View(this);
        timerFill.setBackground(round(cGood, 3));
        timerTrack.addView(timerFill, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(-1, dp(4));
        tlp.topMargin = dp(8);
        content.addView(timerTrack, tlp);

        tvTimer = text("", 12.5f, cSub, true);
        tvTimer.setGravity(Gravity.END);
        content.addView(tvTimer, new LinearLayout.LayoutParams(-1, -2));

        tvOpp = text("", 13, cText, true);
        tvOpp.setGravity(Gravity.CENTER);
        tvOpp.setVisibility(View.GONE);
        tvOpp.setPadding(0, dp(4), 0, dp(4));
        content.addView(tvOpp, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout card = column();
        card.setBackground(round(cCard, 22));
        card.setPadding(dp(18), dp(18), dp(18), dp(18));
        tvQuestion = text("", 19, cText, true);
        tvQuestion.setLineSpacing(0, 1.12f);
        tvQuestion.setMinLines(3);
        card.addView(tvQuestion);
        tvHint = text("", 13.5f, cGold, true);
        tvHint.setPadding(0, dp(8), 0, 0);
        tvHint.setVisibility(View.GONE);
        card.addView(tvHint);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(-1, -2);
        clp.topMargin = dp(10);
        content.addView(card, clp);

        answersBox = column();
        for (int i = 0; i < 4; i++) {
            final int k = i;
            TextView b = text("", 16, cText, true);
            b.setPadding(dp(16), dp(14), dp(16), dp(14));
            b.setMinHeight(dp(56));
            b.setGravity(Gravity.CENTER_VERTICAL);
            b.setBackground(roundStroke(cCard, cLine, 16));
            pressable(b);
            b.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { answer(k); }
            });
            answerBtns[i] = b;
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.topMargin = dp(8);
            answersBox.addView(b, lp);
        }
        content.addView(answersBox, new LinearLayout.LayoutParams(-1, 0, 1f));

        LinearLayout bar = row();
        btn50 = toolButton("½\n50:50", new Runnable() { @Override public void run() { useFifty(); } });
        btnSkip = toolButton("⏭\nSkip", new Runnable() { @Override public void run() { useSkip(); } });
        btnHint = toolButton("💡\nHint", new Runnable() { @Override public void run() { useHint(); } });
        btnRestart = toolButton("⟳\nRestart", new Runnable() { @Override public void run() { askRestart(); } });
        TextView[] bs = {btn50, btnSkip, btnHint, btnRestart};
        for (int i = 0; i < bs.length; i++) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(56), 1f);
            if (i > 0) lp.leftMargin = dp(8);
            bar.addView(bs[i], lp);
        }
        if (roomMode) bar.setVisibility(View.GONE);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(-1, -2);
        blp.topMargin = dp(10);
        content.addView(bar, blp);
        if (roomMode) {
            timerTrack.setVisibility(View.GONE);
            tvTimer.setVisibility(View.GONE);
        }
    }

    @Override protected void onInsets(int top, int bottom, int left, int right) {
        if (content == null) return;
        content.setPadding(dp(16) + left, top + dp(58), dp(16) + right, bottom + dp(14));
    }

    // ------------------------------------------------------------------ subject picker (solo)

    private void showSubjectPicker() {
        LinearLayout c = column();
        c.addView(text("Level " + levelNo, 22, cText, true));
        TextView sub = text("Pick a subject. " + NecpraTriviaEngine.QUESTIONS_PER_LEVEL + " questions, "
                + secondsFor() + "s each.", 14, cSub, false);
        sub.setPadding(0, dp(6), 0, dp(12));
        c.addView(sub);
        final Modal m = modal(c, false);
        LinearLayout row = null;
        for (int i = 0; i < NecpraTriviaEngine.SUBJECTS.length; i++) {
            if (i % 2 == 0) {
                row = row();
                LinearLayout.LayoutParams rl = new LinearLayout.LayoutParams(-1, -2);
                rl.topMargin = dp(8);
                c.addView(row, rl);
            }
            final String key = NecpraTriviaEngine.SUBJECTS[i];
            boolean sel = key.equals(subject);
            TextView t = text(SUBJECT_LABELS[i], 15, sel ? Color.WHITE : cText, true);
            t.setGravity(Gravity.CENTER);
            t.setBackground(sel ? round(cPrimary, 14) : roundStroke(cCard, cLine, 14));
            pressable(t);
            t.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    sfx.play(NecpraSfx.TAP);
                    subject = key;
                    store.setTriviaSubject(key);
                    m.dismiss();
                    startLevel();
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(48), 1f);
            if (i % 2 == 1) lp.leftMargin = dp(8);
            row.addView(t, lp);
        }
        c.addView(space(12));
        c.addView(button("Back", SECONDARY, new Runnable() {
            @Override public void run() {
                m.dismiss();
                finish();
            }
        }));
    }

    /** Start the same level over with fresh questions (solo only). */
    private void askRestart() {
        if (roomMode || eng == null || eng.finished()) return;
        confirm("Start this level over?", "Your answers and score for this level are lost.", "Restart", "Keep playing", true, new Runnable() {
            @Override public void run() {
                main.removeCallbacks(ticker);
                startLevel();
            }
        });
    }

    private int secondsFor() {
        return new NecpraTriviaEngine(levelNo, "mixed", store.difficulty(), 1L, false).secondsPerQuestion();
    }

    private void startLevel() {
        eng = new NecpraTriviaEngine(levelNo, subject, store.difficulty(), System.nanoTime(), false);
        store.saveResume("trivia", null);
        showQuestion();
    }

    // ------------------------------------------------------------------ play

    private void showQuestion() {
        if (eng == null) return;
        if (eng.finished()) {
            finishLevel();
            return;
        }
        NecpraTriviaEngine.Question q = eng.current();
        tvLevel.setText("LEVEL " + eng.level());
        tvScore.setText(eng.score() + " pts");
        tvStreak.setText("STREAK ×" + eng.streak());
        tvCount.setText("Question " + (eng.index() + 1) + " of " + eng.total());
        setProgress(eng.index() / (float) eng.total());
        tvQuestion.setText(q.text);
        tvHint.setVisibility(View.GONE);
        for (int i = 0; i < 4; i++) {
            TextView b = answerBtns[i];
            boolean has = i < q.options.length;
            b.setVisibility(has ? View.VISIBLE : View.GONE);
            if (!has) continue;
            b.setText((char) ('A' + i) + "   " + q.options[i]);
            b.setTextColor(cText);
            b.setBackground(roundStroke(cCard, cLine, 16));
            b.setEnabled(true);
            b.setAlpha(eng.hidden(i) ? 0f : 1f);
            if (eng.hidden(i)) b.setEnabled(false);
        }
        btn50.setAlpha(eng.fiftyUsed() ? 0.4f : 1f);
        btnSkip.setAlpha(eng.skipUsed() ? 0.4f : 1f);
        btnHint.setAlpha(eng.hintUsed() ? 0.4f : 1f);
        if (!roomMode) {
            secondsTotal = eng.secondsPerQuestion();
            deadline = System.currentTimeMillis() + secondsTotal * 1000L;
            updateTimer(secondsTotal * 1000L);
            main.removeCallbacks(ticker);
            main.postDelayed(ticker, 100);
        }
        tvQuestion.setAlpha(0f);
        tvQuestion.animate().alpha(1f).setDuration(260).start();
    }

    private void updateTimer(long leftMs) {
        float f = Math.max(0f, Math.min(1f, leftMs / (secondsTotal * 1000f)));
        int w = timerTrack.getWidth();
        if (w > 0) {
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) timerFill.getLayoutParams();
            lp.width = Math.max(1, (int) (w * f));
            timerFill.setLayoutParams(lp);
        }
        int secs = (int) Math.ceil(leftMs / 1000.0);
        tvTimer.setText(secs + "s");
        int col = f > 0.5f ? cGood : (f > 0.25f ? cGold : cDanger);
        timerFill.setBackground(round(col, 3));
        tvTimer.setTextColor(f > 0.25f ? cSub : cDanger);
    }

    private void setProgress(float f) {
        int w = progressTrack.getWidth();
        if (w <= 0) {
            progressTrack.post(new Runnable() {
                @Override public void run() { setProgress(eng == null ? 0 : eng.index() / (float) eng.total()); }
            });
            return;
        }
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) progressFill.getLayoutParams();
        lp.width = (int) (w * Math.max(0f, Math.min(1f, f)));
        progressFill.setLayoutParams(lp);
    }

    private void setAnswersEnabled(boolean on) {
        for (TextView b : answerBtns) b.setEnabled(on);
    }

    private void answer(int option) {
        if (eng == null || eng.finished() || eng.answered() || modalOpen()) return;
        if (roomMode && (!roomStarted || submittedRoom)) return;
        if (roomMode && !"playing".equals(NecpraRoomSession.statusOf(room.room()))) return;
        main.removeCallbacks(ticker);
        NecpraTriviaEngine.AnswerResult r = eng.answer(option);
        setAnswersEnabled(false);
        for (int i = 0; i < answerBtns.length; i++) {
            TextView b = answerBtns[i];
            if (i == r.correctIndex) {
                b.setBackground(round(cGood, 16));
                b.setTextColor(Color.WHITE);
            } else if (i == option) {
                b.setBackground(round(cDanger, 16));
                b.setTextColor(Color.WHITE);
            }
        }
        if (r.correct) {
            sfx.play(NecpraSfx.CORRECT);
            sfx.haptic(root, 0);
            if (!roomMode) earn(r.coinsGain, null);
            floatText("+" + r.scoreGain, root.getWidth() / 2f, root.getHeight() * 0.35f, cGood);
        } else {
            sfx.play(NecpraSfx.WRONG);
            sfx.haptic(root, 2);
            if (r.timedOut) toast("Time's up!");
        }
        tvScore.setText(eng.score() + " pts");
        tvStreak.setText("STREAK ×" + eng.streak());
        if (roomMode) roomProgress();
        else saveNow(true);
        main.postDelayed(new Runnable() {
            @Override public void run() {
                if (dead() || eng == null) return;
                eng.advance();
                if (eng.finished()) finishLevel();
                else showQuestion();
                if (!roomMode) saveNow(false);
            }
        }, REVEAL_MS);
    }

    private void useFifty() {
        if (eng == null || modalOpen()) return;
        if (eng.fifty()) {
            for (int i = 0; i < 4; i++) {
                if (eng.hidden(i)) {
                    answerBtns[i].setAlpha(0f);
                    answerBtns[i].setEnabled(false);
                }
            }
            btn50.setAlpha(0.4f);
        }
    }

    private void useSkip() {
        if (eng == null || modalOpen() || eng.answered()) return;
        main.removeCallbacks(ticker);
        if (eng.skip()) {
            if (eng.finished()) finishLevel();
            else showQuestion();
        }
    }

    private void useHint() {
        if (eng == null || modalOpen()) return;
        String h = eng.hint();
        if (h != null) {
            tvHint.setText("💡 " + h);
            tvHint.setVisibility(View.VISIBLE);
            btnHint.setAlpha(0.4f);
        }
    }

    // ------------------------------------------------------------------ finishing

    private void finishLevel() {
        main.removeCallbacks(ticker);
        if (eng == null) return;
        final int score = eng.score(), correct = eng.correctCount(), total = eng.total(), stars = eng.stars();
        setProgress(1f);
        if (roomMode) {
            submitRoom(score, correct, total);
            return;
        }
        store.saveResume("trivia", null);
        store.recordGame("trivia", score, levelNo + 1);
        store.setStars("trivia", levelNo, stars);
        store.setLevel("trivia", Math.max(store.level("trivia"), levelNo + 1));
        earn(eng.finishCoins(), "Level complete");
        sfx.play(NecpraSfx.WIN);
        final int done = levelNo;
        double ratio = total == 0 ? 0 : (double) correct / total;
        levelResult(done, ratio, stars,
                new String[][]{{"Correct", correct + " of " + total}, {"Score", score + " pts"}, {"Coins", "🪙 " + score},
                        {"Best streak", "×" + eng.streak()}},
                "Next level", new Runnable() {
                    @Override public void run() {
                        levelNo = done + 1;
                        showSubjectPicker();
                    }
                }, new Runnable() {
                    @Override public void run() {
                        levelNo = done;
                        showSubjectPicker();
                    }
                }, new Runnable() {
                    @Override public void run() { finish(); }
                });
    }

    private void saveNow(boolean answeredInstant) {
        if (roomMode || eng == null || eng.finished()) return;
        store.saveResume("trivia", eng.serialize());
    }

    @Override protected void onSaveGame() {
        if (!roomMode && eng != null && !eng.finished()) store.saveResume("trivia", eng.serialize());
    }

    @Override protected void onBackRequested() {
        if (roomMode && !submittedRoom) {
            confirm("Leave the match?", "Your opponent keeps playing and you forfeit this round.", "Leave", "Stay", true,
                    new Runnable() { @Override public void run() { finish(); } });
            return;
        }
        finish();
    }

    @Override protected void onDestroy() {
        main.removeCallbacks(ticker);
        if (room != null) room.stop();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ rooms

    private void onRoomUpdate(JSONObject r) {
        if (!roomStarted) {
            roomStarted = true;
            levelNo = NecpraRoomSession.levelOf(r);
            long seed = NecpraRoomSession.seedOf(r);
            JSONObject st0 = r.optJSONObject("state");
            String subj = st0 == null ? null : st0.optString("subject", null);
            subject = isSubject(subj) ? subj : "mixed";
            eng = new NecpraTriviaEngine(levelNo, subject, "moderate", seed == 0 ? 1 : seed, true);
            showQuestion();
        }
        String st = NecpraRoomSession.statusOf(r);
        boolean playing = "playing".equals(st) || "finished".equals(st);
        if (playing && matchStartMs == 0) matchStartMs = System.currentTimeMillis();
        if (!submittedRoom && eng != null && !eng.answered() && !eng.finished()) setAnswersEnabled(playing);
        if (!playing) tvHint.setText("Waiting for your friend…  Code " + roomCode);
        if (!playing) tvHint.setVisibility(View.VISIBLE);
        else if (tvHint.getText().toString().startsWith("Waiting")) tvHint.setVisibility(View.GONE);
        JSONObject opp = room.opponent();
        if (opp != null) {
            tvOpp.setVisibility(View.VISIBLE);
            tvOpp.setText("Opponent · " + opp.optInt("answered", 0) + "/" + (eng == null ? 0 : eng.total()) + "  ·  "
                    + opp.optInt("score", 0) + " pts" + (opp.optBoolean("completed") ? "  ✓ done" : ""));
        }
        if (room.finished() && submittedRoom) showRoomResult();
    }

    private void roomProgress() {
        if (!roomMode || room == null || !roomStarted || eng == null) return;
        try {
            JSONObject s = new JSONObject();
            s.put("score", eng.score());
            s.put("answered", eng.index() + 1);
            s.put("correct", eng.correctCount());
            s.put("progress", Math.min(99, Math.round((eng.index() + 1) / (float) eng.total() * 100)));
            s.put("currentLevel", eng.level());
            s.put("timeMs", matchStartMs == 0 ? 0 : System.currentTimeMillis() - matchStartMs);
            room.push(s, eng.score());
        } catch (Exception ignored) { }
    }

    private void submitRoom(int score, int correct, int total) {
        if (submittedRoom) return;
        submittedRoom = true;
        setAnswersEnabled(false);
        tvQuestion.setText("Done! Waiting for the result…");
        for (TextView b : answerBtns) b.setVisibility(View.GONE);
        long t = matchStartMs == 0 ? 0 : System.currentTimeMillis() - matchStartMs;
        room.submit(score, t, total, correct, new NecpraRoomSession.ResultCallback() {
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
        boolean won = mine > theirs;
        boolean draw = mine == theirs;
        pullServerCoins();
        sfx.play(won ? NecpraSfx.WIN : NecpraSfx.FAIL);
        resultCard(won ? "You won!" : (draw ? "It's a draw" : "Match finished"),
                won ? "Higher score takes the match." : (draw ? "Same score — the reward is shared." : "Better luck in the rematch."),
                won ? 3 : (draw ? 2 : 1),
                new String[][]{{"You", mine + " pts"}, {"Opponent", theirs + " pts"}, {"Reward", reward > 0 ? "🪙 " + reward : "—"}},
                "Done", new Runnable() { @Override public void run() { finish(); } }, null, null);
    }
}
