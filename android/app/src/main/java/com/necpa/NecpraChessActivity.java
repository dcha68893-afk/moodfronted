package com.necpa;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Native Chess. Three ways to play, all on the same rules engine ({@link NecpraChessEngine}):
 * <ul>
 *   <li>against the computer (easy / medium / hard, either colour),</li>
 *   <li>pass and play on one phone,</li>
 *   <li>a live "Play Together" match over the existing /api/games/rooms backend. The host plays White and the guest
 *       Black, exactly like the web arcade, so a native player and a web player can sit at the same board.</li>
 * </ul>
 */
public class NecpraChessActivity extends NecpraGameActivity {
    public static final String MODE_CPU = "cpu", MODE_LOCAL = "local", MODE_PUZZLE = "puzzle", MODE_PUZZLE_DAILY = "puzzleDaily";

    private static final int[] REWARD = {30, 60, 120};   // easy, medium, hard win

    private String mode = MODE_CPU;
    private String level = "medium";
    private boolean myWhite = true;
    private boolean started;

    private NecpraChessEngine.Game game = new NecpraChessEngine.Game();
    private int selected = -1;
    private List<NecpraChessEngine.Move> targets = new ArrayList<>();
    private boolean over, thinking;
    private int aiToken;
    private String resultText = "";

    // room
    private String roomCode;
    private NecpraRoomSession room;
    private boolean roomReady, submittedRoom, remoteResign;
    private long matchStartMs;

    private BoardView board;
    private LinearLayout content;
    private TextView topName, bottomName, status, moves;
    private TextView topLead, bottomLead, topAvatar, bottomAvatar;
    private LinearLayout topStrip, bottomStrip;
    private CapturedView topCaptured, bottomCaptured;
    private HorizontalScrollView movesScroll;
    private TextView btnUndo, btnResign, btnFlip;
    private boolean flipped;
    private TextView btnHint, btnPuz;
    private boolean hillVariant;   // King of the Hill for the next / current game
    private int hintsLeft = 3, puzIdx;
    private boolean puzDaily, hintBusy;

    @Override protected String gameId() { return "chess"; }

    @Override protected String gameTitle() {
        return getIntent() != null && getIntent().getStringExtra(EXTRA_ROOM) != null ? "Chess · Match" : "Chess";
    }

    // ------------------------------------------------------------------ build

    @Override
    protected void onBuild(Bundle saved) {
        roomCode = getIntent().getStringExtra(EXTRA_ROOM);
        content = column();
        content.setPadding(dp(8), dp(70), dp(8), dp(12));
        stage.addView(content, new android.widget.FrameLayout.LayoutParams(-1, -1));

        // Player strips and the board share one square-driven group, so names, avatars and board line up edge to edge.
        BoardGroup group = new BoardGroup(this);
        topName = text("", 14, cText, true);
        topLead = text("", 13, cSub, true);
        topAvatar = avatar();
        topCaptured = new CapturedView(this);
        topStrip = playerStrip(topAvatar, topName, topCaptured, topLead);
        board = new BoardView(this);
        bottomName = text("", 14, cText, true);
        bottomLead = text("", 13, cSub, true);
        bottomAvatar = avatar();
        bottomCaptured = new CapturedView(this);
        bottomStrip = playerStrip(bottomAvatar, bottomName, bottomCaptured, bottomLead);
        group.addView(topStrip);
        group.addView(board);
        group.addView(bottomStrip);
        content.addView(group, new LinearLayout.LayoutParams(-1, 0, 1f));

        status = text("", 14.5f, cSub, true);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, dp(8), 0, dp(4));
        content.addView(status, new LinearLayout.LayoutParams(-1, -2));

        moves = text("", 13, cSub, false);
        moves.setSingleLine(true);
        movesScroll = new HorizontalScrollView(this);
        movesScroll.setHorizontalScrollBarEnabled(false);
        movesScroll.addView(moves);
        content.addView(movesScroll, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout bar = row();
        bar.setPadding(0, dp(10), 0, 0);
        btnUndo = toolButton("↶\nUndo", new Runnable() { @Override public void run() { undo(); } });
        btnFlip = toolButton("⇅\nFlip", new Runnable() { @Override public void run() { flipped = !flipped; refresh(); } });
        btnResign = toolButton("⚑\nResign", new Runnable() { @Override public void run() { askResign(); } });
        TextView btnNew = toolButton("＋\nNew", new Runnable() { @Override public void run() { askNewGame(); } });
        int[] ws = {1, 1, 1, 1};
        TextView[] bs = {btnUndo, btnFlip, btnResign, btnNew};
        for (int i = 0; i < bs.length; i++) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(56), ws[i]);
            lp.leftMargin = dp(i == 0 ? 0 : 6);
            bar.addView(bs[i], lp);
        }
        content.addView(bar, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout bar2 = row();
        bar2.setPadding(0, dp(6), 0, 0);
        btnHint = toolButton("💡\nHint ×3", new Runnable() { @Override public void run() { useHint(); } });
        TextView btnPgn = toolButton("📋\nCopy PGN", new Runnable() { @Override public void run() { copyPgn(); } });
        btnPuz = toolButton("🧩\nPuzzles", new Runnable() { @Override public void run() { puzzleMenuFromGame(); } });
        TextView[] bs2 = {btnHint, btnPgn, btnPuz};
        for (int i = 0; i < bs2.length; i++) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(56), 1f);
            lp.leftMargin = dp(i == 0 ? 0 : 6);
            bar2.addView(bs2[i], lp);
        }
        content.addView(bar2, new LinearLayout.LayoutParams(-1, -2));

        if (roomCode != null) {
            mode = "room";
            btnUndo.setVisibility(View.GONE);
            btnFlip.setVisibility(View.GONE);
            btnHint.setVisibility(View.GONE);
            btnPuz.setVisibility(View.GONE);   // no hints / puzzles in a live match
            ((View) btnNew).setVisibility(View.GONE);
            startRoom();
            return;
        }
        level = store.chessLevel();
        final String requested = getIntent().getStringExtra(EXTRA_MODE);
        if (MODE_PUZZLE.equals(requested) || MODE_PUZZLE_DAILY.equals(requested)) {
            startRequested(requested);
            return;
        }
        final String rs = store.resume("chess");
        if (rs != null && restore(rs)) {
            started = true;
            refresh();
            askResume(requested);
            return;
        }
        startRequested(requested);
    }

    private void startRequested(String requested) {
        if (MODE_PUZZLE.equals(requested)) { startPuzzleNext(); return; }
        if (MODE_PUZZLE_DAILY.equals(requested)) { startPuzzle(NecpraChessPuzzles.dayIndex(NecpraGameStore.today()), true); return; }
        if (MODE_LOCAL.equals(requested) || MODE_CPU.equals(requested)) {
            mode = requested;
            newGame(true);
        } else {
            showSetup();
        }
    }

    private void askResume(final String requested) {
        LinearLayout c = column();
        c.addView(text("Resume your game?", 20, cText, true));
        TextView b = text("You have an unfinished chess game.", 14.5f, cSub, false);
        b.setPadding(0, dp(8), 0, dp(16));
        c.addView(b);
        final Modal m = modal(c, false);
        c.addView(button("Resume", PRIMARY, new Runnable() {
            @Override public void run() {
                m.dismiss();
                thinkIfNeeded();
            }
        }));
        c.addView(space(8));
        c.addView(button("New game", SECONDARY, new Runnable() {
            @Override public void run() {
                m.dismiss();
                store.saveResume("chess", null);
                game = new NecpraChessEngine.Game();
                started = false;
                over = false;
                selected = -1;
                targets.clear();
                startRequested(requested);
            }
        }));
    }

    // ------------------------------------------------------------------ setup

    private void showSetup() {
        final String[] opp = {MODE_CPU};
        final String[] lvl = {store.chessLevel()};
        final String[] side = {"white"};
        LinearLayout c = column();
        c.addView(text("New game", 22, cText, true));
        c.addView(space(8));
        c.addView(label("Opponent"));
        final TextView[] oppBtns = new TextView[2];
        LinearLayout oppRow = row();
        final String[][] oppOpts = {{MODE_CPU, "Computer"}, {MODE_LOCAL, "Pass & play"}};
        final LinearLayout lvlBox = column();
        final LinearLayout sideBox = column();
        for (int i = 0; i < 2; i++) {
            final int k = i;
            oppBtns[i] = chipOption(oppOpts[i][1], new Runnable() {
                @Override public void run() {
                    opp[0] = oppOpts[k][0];
                    markChips(oppBtns, k);
                    int vis = MODE_CPU.equals(opp[0]) ? View.VISIBLE : View.GONE;
                    lvlBox.setVisibility(vis);
                    sideBox.setVisibility(vis);
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(44), 1f);
            if (i > 0) lp.leftMargin = dp(8);
            oppRow.addView(oppBtns[i], lp);
        }
        markChips(oppBtns, 0);
        c.addView(oppRow);

        lvlBox.addView(space(10));
        lvlBox.addView(label("Level"));
        final TextView[] lvlBtns = new TextView[3];
        final String[][] lvlOpts = {{"easy", "Easy"}, {"medium", "Medium"}, {"hard", "Hard"}};
        LinearLayout lvlRow = row();
        int lvlSel = 1;
        for (int i = 0; i < 3; i++) {
            final int k = i;
            if (lvlOpts[i][0].equals(lvl[0])) lvlSel = i;
            lvlBtns[i] = chipOption(lvlOpts[i][1], new Runnable() {
                @Override public void run() {
                    lvl[0] = lvlOpts[k][0];
                    markChips(lvlBtns, k);
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(44), 1f);
            if (i > 0) lp.leftMargin = dp(8);
            lvlRow.addView(lvlBtns[i], lp);
        }
        markChips(lvlBtns, lvlSel);
        lvlBox.addView(lvlRow);
        c.addView(lvlBox);

        sideBox.addView(space(10));
        sideBox.addView(label("Play as"));
        final TextView[] sideBtns = new TextView[3];
        final String[][] sideOpts = {{"white", "White"}, {"black", "Black"}, {"random", "Random"}};
        LinearLayout sideRow = row();
        for (int i = 0; i < 3; i++) {
            final int k = i;
            sideBtns[i] = chipOption(sideOpts[i][1], new Runnable() {
                @Override public void run() {
                    side[0] = sideOpts[k][0];
                    markChips(sideBtns, k);
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(44), 1f);
            if (i > 0) lp.leftMargin = dp(8);
            sideRow.addView(sideBtns[i], lp);
        }
        markChips(sideBtns, 0);
        sideBox.addView(sideRow);
        c.addView(sideBox);

        c.addView(space(10));
        c.addView(label("Variant"));
        final boolean[] hill = {hillVariant};
        final TextView[] varBtns = new TextView[2];
        final String[] varNames = {"Standard", "King of the Hill"};
        LinearLayout varRow = row();
        for (int i = 0; i < 2; i++) {
            final int k = i;
            varBtns[i] = chipOption(varNames[i], new Runnable() {
                @Override public void run() {
                    hill[0] = k == 1;
                    markChips(varBtns, k);
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(44), 1f);
            if (i > 0) lp.leftMargin = dp(8);
            varRow.addView(varBtns[i], lp);
        }
        markChips(varBtns, hillVariant ? 1 : 0);
        c.addView(varRow);

        c.addView(space(16));
        final Modal m = modal(c, false);
        c.addView(button("Start", PRIMARY, new Runnable() {
            @Override public void run() {
                m.dismiss();
                mode = opp[0];
                hillVariant = hill[0];
                level = lvl[0];
                store.setChessLevel(level);
                boolean white = true;
                if (MODE_CPU.equals(mode)) {
                    if ("black".equals(side[0])) white = false;
                    else if ("random".equals(side[0])) white = new java.util.Random().nextBoolean();
                }
                newGame(white);
            }
        }));
        c.addView(space(8));
        c.addView(button("🧩  Mate-in-1 puzzles", GOLD, new Runnable() {
            @Override public void run() {
                m.dismiss();
                startPuzzleNext();
            }
        }));
        c.addView(space(8));
        c.addView(button("Puzzle of the day  +20 🪙", GOLD, new Runnable() {
            @Override public void run() {
                m.dismiss();
                startPuzzle(NecpraChessPuzzles.dayIndex(NecpraGameStore.today()), true);
            }
        }));
        c.addView(space(8));
        c.addView(button("Back", SECONDARY, new Runnable() {
            @Override public void run() {
                m.dismiss();
                finish();
            }
        }));
    }

    private TextView label(String s) {
        TextView t = text(s, 13, cSub, true);
        t.setPadding(0, 0, 0, dp(6));
        return t;
    }

    private TextView chipOption(String label, final Runnable onTap) {
        TextView t = text(label, 14, cText, true);
        t.setGravity(Gravity.CENTER);
        pressable(t);
        t.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                sfx.play(NecpraSfx.TAP);
                onTap.run();
            }
        });
        return t;
    }

    private void markChips(TextView[] chips, int on) {
        for (int i = 0; i < chips.length; i++) {
            boolean sel = i == on;
            chips[i].setBackground(sel ? round(cPrimary, 12) : roundStroke(cCard, cLine, 12));
            chips[i].setTextColor(sel ? Color.WHITE : cText);
        }
    }

    // ------------------------------------------------------------------ game flow

    private void newGame(boolean white) {
        aiToken++;
        hintsLeft = 3;
        hintBusy = false;
        btnResign.setVisibility(View.VISIBLE);
        game = new NecpraChessEngine.Game();
        game.setHill(hillVariant);
        if (hillVariant) toast("King of the Hill: walk your king to the centre to win");
        myWhite = white;
        flipped = !white && MODE_CPU.equals(mode);
        selected = -1;
        targets.clear();
        over = false;
        thinking = false;
        resultText = "";
        started = true;
        store.saveResume("chess", null);
        refresh();
        thinkIfNeeded();
    }

    // ------------------------------------------------------------------ hint / PGN / puzzles

    /** Hint: shows the engine's best move (piece selected, destination marked). 3 per game; not in live matches. */
    private void useHint() {
        if (over || !started || modalOpen() || "room".equals(mode) || hintBusy || !myTurn()) return;
        if (hintsLeft <= 0) {
            toast("No hints left in this game");
            return;
        }
        hintBusy = true;
        final NecpraChessEngine.State s = game.current();
        final List<NecpraChessEngine.Move> legalNow = NecpraChessEngine.legal(s);
        final int token = aiToken;
        toast("Thinking…");
        io.execute(new Runnable() {
            @Override public void run() {
                NecpraChessEngine.Move pick = null;
                try { pick = NecpraChessEngine.pickMove(s, "hard"); } catch (RuntimeException ignored) { }
                final NecpraChessEngine.Move mv = pick;
                ui(new Runnable() {
                    @Override public void run() {
                        hintBusy = false;
                        if (dead() || over || token != aiToken || mv == null || game.current() != s) return;
                        hintsLeft--;
                        selected = mv.f;
                        targets.clear();
                        for (NecpraChessEngine.Move m : legalNow) if (m.f == mv.f) targets.add(m);
                        sfx.play(NecpraSfx.TAP);
                        toast("Hint: " + NecpraChessEngine.san(s, mv, legalNow));
                        refresh();
                    }
                });
            }
        });
    }

    /** Post-game review: flags blunders (??), mistakes (?) and inaccuracies (?!) for both sides (depth-3 search per move). */
    private void reviewGame() {
        if (modalOpen() || game.moves.size() < 2) return;
        toast("Reviewing…");
        final NecpraChessEngine.Game g = game;
        NecpraChessEngine.setHill(g.hill);
        io.execute(new Runnable() {
            @Override public void run() {
                final int[] loss = NecpraChessEngine.reviewLosses(g, 3, 12000);
                ui(new Runnable() {
                    @Override public void run() {
                        if (dead()) return;
                        if (loss == null) {
                            toast("Review took too long — try a shorter game");
                            return;
                        }
                        showReview(g, loss);
                    }
                });
            }
        });
    }

    private void showReview(NecpraChessEngine.Game g, int[] loss) {
        int[][] cnt = new int[2][3];          // [white/black][blunder, mistake, inaccuracy]
        long[] sum = new long[2];
        int[] moves = new int[2];
        boolean whiteFirst = g.base.white;
        for (int i = 0; i < loss.length; i++) {
            int side = ((i % 2 == 0) == whiteFirst) ? 0 : 1;
            moves[side]++;
            sum[side] += loss[i];
            String mk = NecpraChessEngine.reviewMark(loss[i]);
            if ("??".equals(mk)) cnt[side][0]++;
            else if ("?".equals(mk)) cnt[side][1]++;
            else if ("?!".equals(mk)) cnt[side][2]++;
        }
        LinearLayout c = column();
        c.addView(text("Game review", 22, cText, true));
        TextView sub = text("Depth-3 check of every move", 13.5f, cSub, false);
        sub.setPadding(0, dp(4), 0, dp(10));
        c.addView(sub);
        for (int side = 0; side < 2; side++) {
            if (moves[side] == 0) continue;
            long avg = sum[side] / moves[side];
            String who = side == 0 ? "White" : "Black";
            c.addView(text(who + " · avg loss " + String.format(java.util.Locale.US, "%.1f", avg / 100.0) + " pawns", 15, cText, true));
            TextView t = text("?? " + cnt[side][0] + "   ? " + cnt[side][1] + "   ?! " + cnt[side][2], 14, cSub, false);
            t.setPadding(0, dp(2), 0, dp(8));
            c.addView(t);
        }
        // worst three moves
        Integer[] order = new Integer[loss.length];
        for (int i = 0; i < order.length; i++) order[i] = i;
        final int[] L = loss;
        java.util.Arrays.sort(order, new java.util.Comparator<Integer>() {
            @Override public int compare(Integer a, Integer b) { return Integer.compare(L[b], L[a]); }
        });
        StringBuilder worst = new StringBuilder();
        for (int k = 0; k < Math.min(3, order.length); k++) {
            int i = order[k];
            if (loss[i] < 70) break;
            int fullmove = g.base.ply / 2 + 1 + (i + (whiteFirst ? 0 : 1)) / 2;
            boolean whiteMove = (i % 2 == 0) == whiteFirst;
            worst.append(fullmove).append(whiteMove ? ". " : "... ").append(g.sans.get(i))
                    .append(NecpraChessEngine.reviewMark(loss[i])).append("  (−")
                    .append(String.format(java.util.Locale.US, "%.1f", loss[i] / 100.0)).append(")\n");
        }
        if (worst.length() > 0) {
            c.addView(text("Biggest swings", 14, cSub, true));
            TextView w = text(worst.toString().trim(), 15, cText, false);
            w.setPadding(0, dp(4), 0, dp(10));
            c.addView(w);
        } else {
            TextView ok = text("No significant mistakes — well played!", 15, cText, false);
            ok.setPadding(0, dp(4), 0, dp(10));
            c.addView(ok);
        }
        final Modal m = modal(c, false);
        c.addView(button("Close", PRIMARY, new Runnable() {
            @Override public void run() { m.dismiss(); }
        }));
    }

    private void copyPgn() {
        if (game.moves.isEmpty()) {
            toast("No moves to copy yet");
            return;
        }
        String result = "*";
        if (over) {
            NecpraChessEngine.Outcome o = game.assess();
            if (o.over) result = ("mate".equals(o.kind) || "hill".equals(o.kind)) ? (o.whiteWins ? "1-0" : "0-1") : "1/2-1/2";
        }
        String w = MODE_LOCAL.equals(mode) || MODE_PUZZLE.equals(mode) ? "White" : (myWhite ? "Player" : "Computer");
        String b = MODE_LOCAL.equals(mode) || MODE_PUZZLE.equals(mode) ? "Black" : (myWhite ? "Computer" : "Player");
        try {
            android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            cm.setPrimaryClip(android.content.ClipData.newPlainText("PGN", game.pgn(w, b, result)));
            toast("PGN copied");
        } catch (RuntimeException e) {
            toast("Couldn't copy the PGN");
        }
    }

    private void startPuzzleNext() {
        java.util.Set<Integer> done = store.solvedPuzzles();
        int i = 0;
        while (i < NecpraChessPuzzles.count() && done.contains(i)) i++;
        startPuzzle(i >= NecpraChessPuzzles.count() ? 0 : i, false);
    }

    private void startPuzzle(int idx, boolean daily) {
        aiToken++;
        puzIdx = ((idx % NecpraChessPuzzles.count()) + NecpraChessPuzzles.count()) % NecpraChessPuzzles.count();
        puzDaily = daily;
        mode = MODE_PUZZLE;
        NecpraChessEngine.State base = NecpraChessEngine.fromFen(NecpraChessPuzzles.fen(puzIdx));
        game = new NecpraChessEngine.Game(base);
        game.setHill(false);
        myWhite = base.white;
        flipped = !myWhite;
        hintsLeft = 1;
        selected = -1;
        targets.clear();
        over = false;
        thinking = false;
        resultText = "";
        started = true;
        hintBusy = false;
        btnResign.setVisibility(View.GONE);   // nothing to resign in a puzzle
        refresh();
    }

    /** From the in-game toolbar: leave the current game for puzzles (asks first if a game is in progress). */
    private void puzzleMenuFromGame() {
        if (modalOpen() || "room".equals(mode)) return;
        if (MODE_PUZZLE.equals(mode)) {
            startPuzzleNext();
            return;
        }
        if (over || game.moves.isEmpty()) {
            startPuzzleNext();
            return;
        }
        confirm("Switch to puzzles?", "Your current game is saved and you can resume it from the chess menu.", "Puzzles", "Keep playing", false, new Runnable() {
            @Override public void run() {
                saveNow();
                startPuzzleNext();
            }
        });
    }

    private void puzzleSolved() {
        over = true;
        resultText = "Puzzle solved!";
        selected = -1;
        targets.clear();
        boolean first = store.markPuzzleSolved(puzIdx);
        int bonus = first ? 10 : 0;
        if (puzDaily && store.claimDaily("chessPuzzle")) bonus += 20;
        if (bonus > 0) earn(bonus, "Puzzle solved");
        store.recordGame("chess", bonus, 1);
        sfx.play(NecpraSfx.WIN);
        sfx.haptic(root, 1);
        refresh();
        int solved = store.solvedPuzzles().size();
        resultCard("Puzzle solved!", "Checkmate in 1 · " + solved + " of " + NecpraChessPuzzles.count() + " solved", 3,
                bonus > 0 ? new String[][]{{"Coins", "🪙 +" + bonus}} : null,
                "Next puzzle", new Runnable() {
                    @Override public void run() { startPuzzle(puzIdx + 1, false); }
                }, "Leave", new Runnable() {
                    @Override public void run() { finish(); }
                });
    }

    private boolean myTurn() {
        NecpraChessEngine.State s = game.current();
        if (MODE_LOCAL.equals(mode)) return true;
        if ("room".equals(mode)) return roomReady && !submittedRoom && s.white == myWhite;
        return s.white == myWhite && !thinking;
    }

    private void tapSquare(int sq) {
        if (over || !started || modalOpen() || !myTurn()) return;
        NecpraChessEngine.State s = game.current();
        char p = s.at(sq);
        boolean mine = p != '.' && (Character.isUpperCase(p) == s.white);
        if (selected >= 0) {
            List<NecpraChessEngine.Move> hits = new ArrayList<>();
            for (NecpraChessEngine.Move m : targets) if (m.t == sq) hits.add(m);
            if (!hits.isEmpty()) {
                if (hits.size() > 1) {
                    askPromotion(hits);
                } else {
                    play(hits.get(0), false);
                }
                return;
            }
        }
        if (mine) {
            selected = sq;
            targets.clear();
            for (NecpraChessEngine.Move m : NecpraChessEngine.legal(s)) if (m.f == sq) targets.add(m);
            sfx.play(NecpraSfx.TAP);
        } else {
            selected = -1;
            targets.clear();
        }
        board.invalidate();
    }

    private void askPromotion(final List<NecpraChessEngine.Move> options) {
        final boolean white = game.current().white;
        LinearLayout c = column();
        c.addView(text("Promote to", 20, cText, true));
        c.addView(space(10));
        final Modal m = modal(c, true);
        LinearLayout r = row();
        char[] order = {'Q', 'R', 'B', 'N'};
        for (final char q : order) {
            final char shown = white ? q : Character.toLowerCase(q);
            View t = new View(this) {
                @Override protected void onDraw(Canvas cv) {
                    NecpraChessPieces.draw(cv, shown, getWidth() / 2f, getHeight() / 2f, Math.min(getWidth(), getHeight()) * 0.92f);
                }
            };
            t.setBackground(round(Color.parseColor("#769656"), 14));
            pressable(t);
            t.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    m.dismiss();
                    for (NecpraChessEngine.Move mv : options) if (mv.promo == q) { play(mv, false); return; }
                    play(options.get(0), false);
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(64), 1f);
            lp.leftMargin = dp(4);
            lp.rightMargin = dp(4);
            r.addView(t, lp);
        }
        c.addView(r);
    }

    /** Plays a move on the board. {@code remote} moves arrive from the opponent and are not published again. */
    private void play(NecpraChessEngine.Move mv, boolean remote) {
        NecpraChessEngine.State before = game.current();
        if (MODE_PUZZLE.equals(mode) && !NecpraChessPuzzles.mates(before, mv)) {
            // Puzzle: only a checkmating move is accepted; anything else is rejected and the position stays.
            selected = -1;
            targets.clear();
            sfx.play(NecpraSfx.WRONG);
            sfx.haptic(root, 2);
            toast("Not checkmate — try again");
            board.invalidate();
            return;
        }
        game.commit(mv);
        selected = -1;
        targets.clear();
        sfx.play(mv.isCapture() ? NecpraSfx.CAPTURE : NecpraSfx.MOVE);
        if (mv.castle != 0) { sfx.play(NecpraSfx.PLACE); sfx.haptic(root, 1); }
        else if (mv.isCapture()) sfx.haptic(root, 1);
        NecpraChessEngine.Outcome o = game.assess();
        if (MODE_PUZZLE.equals(mode) && o.over) {
            puzzleSolved();
            return;
        }
        if ("room".equals(mode) && !remote) publish(null);
        if (o.over) {
            finishGame(o, false);
            return;
        }
        if (o.check) { sfx.play(NecpraSfx.ERROR); sfx.haptic(root, 2); }   // distinct check cue (strong haptic)
        refresh();
        if (!remote) thinkIfNeeded();
        else if (before != null) saveNow();
    }

    private void thinkIfNeeded() {
        if (over || !MODE_CPU.equals(mode)) return;
        if (game.current().white == myWhite) return;
        thinking = true;
        refresh();
        final int token = ++aiToken;
        final NecpraChessEngine.State s = game.current();
        final String lv = level;
        final List<String> played = game.playedNames();
        final NecpraChessEngine.State base = game.base;
        io.execute(new Runnable() {
            @Override public void run() {
                NecpraChessEngine.Move pick = null;
                try {
                    pick = NecpraChessEngine.bookMove(base, played, NecpraChessEngine.legal(s));
                    if (pick == null) pick = NecpraChessEngine.pickMove(s, lv);
                } catch (RuntimeException ignored) { }
                final NecpraChessEngine.Move mv = pick;
                ui(new Runnable() {
                    @Override public void run() {
                        if (token != aiToken || over) return;
                        thinking = false;
                        if (mv == null) { refresh(); return; }
                        play(mv, false);
                    }
                });
            }
        });
    }

    private void undo() {
        if (over || !started || modalOpen() || "room".equals(mode)) return;
        if (game.moves.isEmpty()) return;
        aiToken++;
        thinking = false;
        if (MODE_CPU.equals(mode)) {
            // take back the computer's reply as well so it is the player's move again
            int n = game.current().white == myWhite ? 2 : 1;
            game.undo(Math.min(n, game.moves.size()));
        } else {
            game.undo(1);
        }
        selected = -1;
        targets.clear();
        refresh();
        thinkIfNeeded();
    }

    private void askResign() {
        if (over || !started || modalOpen()) return;
        confirm("Resign?", "You will lose this game.", "Resign", "Keep playing", true, new Runnable() {
            @Override public void run() { resign(); }
        });
    }

    private void resign() {
        if (over) return;
        if ("room".equals(mode)) {
            publish("resign:" + (myWhite ? "w" : "b"));
            finishManual(false, "You resigned.");
        } else if (MODE_LOCAL.equals(mode)) {
            boolean whiteResigns = game.current().white;
            finishManual(false, (whiteResigns ? "White" : "Black") + " resigned — " + (whiteResigns ? "Black" : "White") + " wins.");
        } else {
            finishManual(false, "You resigned.");
        }
    }

    private void askNewGame() {
        if (modalOpen()) return;
        if (over || game.moves.isEmpty()) {
            store.saveResume("chess", null);
            showSetup();
            return;
        }
        confirm("Start a new game?", "The current game will be lost.", "New game", "Cancel", true, new Runnable() {
            @Override public void run() {
                store.saveResume("chess", null);
                showSetup();
            }
        });
    }

    // ------------------------------------------------------------------ finishing

    private void finishGame(NecpraChessEngine.Outcome o, boolean resigned) {
        String text;
        Boolean iWon = null; // null = draw
        if ("mate".equals(o.kind)) {
            text = "Checkmate — " + (o.whiteWins ? "White" : "Black") + " wins.";
            iWon = MODE_LOCAL.equals(mode) ? Boolean.TRUE : Boolean.valueOf(o.whiteWins == myWhite);
        } else if ("hill".equals(o.kind)) {
            text = (o.whiteWins ? "White" : "Black") + " king reached the hill — wins!";
            iWon = MODE_LOCAL.equals(mode) ? Boolean.TRUE : Boolean.valueOf(o.whiteWins == myWhite);
        } else if ("stalemate".equals(o.kind)) {
            text = "Draw by stalemate.";
        } else if ("material".equals(o.kind)) {
            text = "Draw — insufficient material.";
        } else if ("fifty".equals(o.kind)) {
            text = "Draw — 50-move rule.";
        } else {
            text = "Draw by threefold repetition.";
        }
        concludeGame(iWon, text);
    }

    /** Ends the game because somebody resigned. {@code iWon} is from this player's point of view. */
    private void finishManual(boolean iWon, String text) {
        concludeGame(Boolean.valueOf(iWon), text);
    }

    private void concludeGame(Boolean iWon, String text) {
        if (over) return;
        over = true;
        thinking = false;
        aiToken++;
        resultText = text;
        selected = -1;
        targets.clear();
        store.saveResume("chess", null);
        refresh();
        int coins = 0;
        if (MODE_CPU.equals(mode)) {
            int idx = "easy".equals(level) ? 0 : "hard".equals(level) ? 2 : 1;
            if (iWon == null) coins = REWARD[idx] / 3;
            else if (iWon) coins = REWARD[idx];
            store.recordGame("chess", coins, 1);
            if (coins > 0) earn(coins, iWon == null ? "Draw" : "Victory");
        } else if ("room".equals(mode)) {
            submitRoom(iWon == null ? 0 : (iWon ? 1 : 0));
            return; // the result card is shown once the server has ruled
        } else {
            store.recordGame("chess", 0, 1);
        }
        sfx.play(iWon != null && iWon ? NecpraSfx.WIN : NecpraSfx.FAIL);
        showResult(iWon, coins, null);
    }

    private void showResult(Boolean iWon, int coins, String extra) {
        if (modalOpen()) return;
        String title = iWon == null ? "Draw" : (MODE_LOCAL.equals(mode) ? "Game over" : (iWon ? "You won!" : "You lost"));
        String[][] rows = (coins > 0 || extra != null)
                ? new String[][]{{extra != null ? "Reward" : "Coins", extra != null ? extra : "🪙 " + coins}}
                : null;
        if ("room".equals(mode)) {
            resultCard(title, resultText, iWon == null ? 1 : (iWon ? 3 : 1), rows, "Done", new Runnable() {
                @Override public void run() { finish(); }
            }, null, null);
        } else {
            resultCard(title, resultText, iWon == null ? 1 : (iWon ? 3 : 0), rows, "Play again", new Runnable() {
                @Override public void run() { showSetup(); }
            }, "Leave", new Runnable() {
                @Override public void run() { finish(); }
            }, game.moves.size() >= 4 ? "Review game" : null, new Runnable() {
                @Override public void run() { reviewGame(); }
            });
        }
    }

    // ------------------------------------------------------------------ persistence (resume)

    private void saveNow() {
        if (over || !started || "room".equals(mode) || MODE_PUZZLE.equals(mode)) return;
        if (game.moves.isEmpty()) {
            store.saveResume("chess", null);
            return;
        }
        StringBuilder sb = new StringBuilder();
        sb.append(mode).append('|').append(myWhite ? 'w' : 'b').append('|').append(level).append('|');
        for (String n : game.playedNames()) sb.append(n).append(' ');
        String saved = sb.toString().trim();
        if (game.hill) saved += "|H";   // 5th field: King of the Hill
        store.saveResume("chess", saved);
    }

    @Override protected void onSaveGame() { saveNow(); }

    private boolean restore(String s) {
        try {
            String[] p = s.split("\\|", -1);
            if (p.length < 4) return false;
            mode = MODE_LOCAL.equals(p[0]) ? MODE_LOCAL : MODE_CPU;
            myWhite = !"b".equals(p[1]);
            level = p[2];
            NecpraChessEngine.Game g = new NecpraChessEngine.Game();
            g.setHill(p.length > 4 && "H".equals(p[4]));
            if (!p[3].trim().isEmpty()) {
                for (String name : p[3].trim().split(" ")) {
                    NecpraChessEngine.Move found = null;
                    for (NecpraChessEngine.Move m : NecpraChessEngine.legal(g.current())) if (m.name().equals(name)) { found = m; break; }
                    if (found == null) return false;
                    g.commit(found);
                }
            }
            if (g.assess().over) return false;
            game = g;
            hillVariant = g.hill;
            flipped = !myWhite && MODE_CPU.equals(mode);
            over = false;
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    // ------------------------------------------------------------------ rooms (Play Together)

    private void startRoom() {
        NecpraChessEngine.setHill(false);   // live matches are standard chess
        status.setText("Joining match…");
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
    }

    private void onRoomUpdate(JSONObject r) {
        if (room == null) return;
        String role = room.role();
        if (!started && role != null && !role.isEmpty()) {
            myWhite = "host".equals(role);
            flipped = !myWhite;
            started = true;
            matchStartMs = System.currentTimeMillis();
        }
        String st = NecpraRoomSession.statusOf(r);
        boolean playing = "playing".equals(st) || "finished".equals(st);
        if (!roomReady && playing) {
            roomReady = true;
            matchStartMs = System.currentTimeMillis();
            sfx.play(NecpraSfx.TAP);
        }
        JSONObject state = r.optJSONObject("state");
        if (state != null && !over) {
            String res = state.optString("result", "");
            if (res.startsWith("resign:")) {
                boolean whiteResigned = "w".equals(res.substring(7));
                if (whiteResigned != myWhite) {
                    remoteResign = true;
                    finishManual(true, "Opponent resigned.");
                    return;
                }
            }
            applyRemotePosition(state.optString("position", ""));
        }
        if (over && submittedRoom && room.finished()) showRoomResult();
        refresh();
    }

    /** Brings the local board up to the opponent's published position by finding the move that produces it. */
    private void applyRemotePosition(String pos) {
        if (pos == null || pos.isEmpty()) return;
        String[] p = pos.split("\\|", -1);
        if (p.length < 5) return;
        int ply;
        try { ply = Integer.parseInt(p[4]); } catch (NumberFormatException e) { return; }
        int mine = game.current().ply;
        if (ply <= mine) return;
        if (ply != mine + 1) {
            // out of step (rejoined mid-game): adopt the published position as a fresh base
            NecpraChessEngine.State s = NecpraChessEngine.decode(pos);
            if (s != null) {
                game = new NecpraChessEngine.Game(s);
                selected = -1;
                targets.clear();
                NecpraChessEngine.Outcome o = game.assess();
                if (o.over) finishGame(o, false);
            }
            return;
        }
        NecpraChessEngine.State cur = game.current();
        for (NecpraChessEngine.Move m : NecpraChessEngine.legal(cur)) {
            NecpraChessEngine.State n = NecpraChessEngine.make(cur, m);
            String[] q = NecpraChessEngine.encode(n).split("\\|", -1);
            if (q[0].equals(p[0]) && q[1].equals(p[1])) {
                play(m, true);
                return;
            }
        }
    }

    private void publish(String result) {
        if (room == null || !roomReady && result == null) return;
        try {
            JSONObject s = new JSONObject();
            NecpraChessEngine.State cur = game.current();
            s.put("position", NecpraChessEngine.encode(cur));
            s.put("turn", cur.white ? "w" : "b");
            if (!game.moves.isEmpty()) {
                NecpraChessEngine.Move l = game.moves.get(game.moves.size() - 1);
                JSONObject lm = new JSONObject();
                lm.put("from", new JSONObject().put("r", l.f >> 3).put("c", l.f & 7));
                lm.put("to", new JSONObject().put("r", l.t >> 3).put("c", l.t & 7));
                s.put("lastMove", lm.toString());
            }
            s.put("progress", 0);
            s.put("currentLevel", 1);
            s.put("timeMs", matchStartMs == 0 ? 0 : System.currentTimeMillis() - matchStartMs);
            if (result != null) s.put("result", result);
            room.push(s, 0);
        } catch (Exception ignored) { }
    }

    private void submitRoom(final int score) {
        if (submittedRoom) return;
        submittedRoom = true;
        status.setText(resultText + "  Waiting for the result…");
        long t = matchStartMs == 0 ? 0 : System.currentTimeMillis() - matchStartMs;
        room.submit(score, t, game.moves.size(), score, new NecpraRoomSession.ResultCallback() {
            @Override public void onResult(JSONObject response, String error) {
                if (error != null) toast(error);
                if (room != null && room.finished()) showRoomResult();
                else main.postDelayed(new Runnable() {
                    @Override public void run() { if (!dead() && room != null && room.finished()) showRoomResult(); }
                }, 2500);
            }
        });
    }

    private void showRoomResult() {
        if (modalOpen()) return;
        int reward = room.myReward();
        JSONObject me = room.mePlayer(), opp = room.opponent();
        int mine = me == null ? 0 : me.optInt("score", 0), theirs = opp == null ? 0 : opp.optInt("score", 0);
        Boolean iWon = mine > theirs ? Boolean.TRUE : (mine < theirs ? Boolean.FALSE : null);
        pullServerCoins();
        sfx.play(iWon != null && iWon ? NecpraSfx.WIN : NecpraSfx.FAIL);
        showResult(iWon, 0, reward > 0 ? "🪙 " + reward : "—");
    }

    @Override protected void onDestroy() {
        if (room != null) room.stop();
        super.onDestroy();
    }

    @Override protected void onBackRequested() {
        if ("room".equals(mode) && !over) {
            confirm("Leave the match?", "Leaving counts as resigning.", "Leave", "Stay", true, new Runnable() {
                @Override public void run() {
                    publish("resign:" + (myWhite ? "w" : "b"));
                    if (room != null) room.stop();
                    finish();
                }
            });
            return;
        }
        finish();
    }

    @Override protected void onInsets(int top, int bottom, int left, int right) {
        if (content == null) return;
        content.setPadding(dp(8) + left, top + dp(58), dp(8) + right, bottom + dp(12));
    }

    // ------------------------------------------------------------------ view refresh

    private void refresh() {
        if (dead() || board == null) return;
        NecpraChessEngine.State s = game.current();
        boolean iAmBottomWhite = !flipped;
        topName.setText(nameFor(!iAmBottomWhite));
        bottomName.setText(nameFor(iAmBottomWhite));
        boolean live = started && !over;
        updateStrip(!iAmBottomWhite, topStrip, topAvatar, topName, topCaptured, topLead, s, live);
        updateStrip(iAmBottomWhite, bottomStrip, bottomAvatar, bottomName, bottomCaptured, bottomLead, s, live);
        if (over) {
            status.setText(resultText);
            status.setTextColor(cText);
        } else if (!started) {
            status.setText("");
        } else if ("room".equals(mode) && !roomReady) {
            status.setText("Waiting for your friend…  Code " + roomCode);
            status.setTextColor(cSub);
        } else if (MODE_PUZZLE.equals(mode)) {
            status.setText("Puzzle " + (puzIdx + 1) + " of " + NecpraChessPuzzles.count() + " — " + (s.white ? "White" : "Black") + " to move, mate in 1");
            status.setTextColor(cText);
        } else if (thinking) {
            status.setText("Computer is thinking…");
            status.setTextColor(cSub);
        } else {
            boolean check = NecpraChessEngine.inCheck(s);
            String side = s.white ? "White" : "Black";
            String who = MODE_LOCAL.equals(mode) ? side + " to move" : (s.white == myWhite ? "Your move" : "Opponent's move");
            status.setText(check ? who + " — check!" : who);
            status.setTextColor(check ? cDanger : cText);
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < game.sans.size(); i++) {
            if (i % 2 == 0) sb.append(i / 2 + 1).append(". ");
            sb.append(game.sans.get(i)).append(i % 2 == 0 ? "  " : "    ");
        }
        moves.setText(sb.length() == 0 ? "No moves yet" : sb.toString());
        movesScroll.post(new Runnable() {
            @Override public void run() { movesScroll.fullScroll(View.FOCUS_RIGHT); }
        });
        btnUndo.setAlpha(game.moves.isEmpty() || over ? 0.4f : 1f);
        btnHint.setText("💡\nHint ×" + hintsLeft);
        btnHint.setAlpha(hintsLeft <= 0 || over ? 0.4f : 1f);
        board.invalidate();
        if (started && !over) saveNow();
    }

    private String nameFor(boolean white) {
        String colour = white ? "White" : "Black";
        if (MODE_LOCAL.equals(mode)) return colour;
        boolean mine = white == myWhite;
        if ("room".equals(mode)) return (mine ? "You" : "Opponent") + " · " + colour;
        if (mine) return "You · " + colour;
        String l = "easy".equals(level) ? "Easy" : "hard".equals(level) ? "Hard" : "Medium";
        return "Computer (" + l + ") · " + colour;
    }

    // ------------------------------------------------------------------ player strips

    private static final String CAP_ORDER = "QRBNP";
    private static final int[] START_COUNT = {1, 2, 2, 2, 8};

    private TextView avatar() {
        TextView t = text("", 15, Color.WHITE, true);
        t.setGravity(Gravity.CENTER);
        return t;
    }

    private LinearLayout playerStrip(TextView av, TextView name, CapturedView captured, TextView lead) {
        LinearLayout strip = row();
        strip.setPadding(dp(8), 0, dp(10), 0);
        strip.setBackground(roundStroke(alpha(cCard, night ? 0xB0 : 0xD0), cLine, 12));
        strip.addView(av, new LinearLayout.LayoutParams(dp(32), dp(32)));
        LinearLayout col = column();
        col.setGravity(Gravity.CENTER_VERTICAL);
        name.setSingleLine(true);
        name.setEllipsize(android.text.TextUtils.TruncateAt.END);
        col.addView(name, new LinearLayout.LayoutParams(-1, -2));
        col.addView(captured, new LinearLayout.LayoutParams(-1, dp(15)));
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(0, -2, 1f);
        clp.leftMargin = dp(10);
        strip.addView(col, clp);
        strip.addView(lead, new LinearLayout.LayoutParams(-2, -2));
        return strip;
    }

    private static int material(NecpraChessEngine.State s, boolean white) {
        int sum = 0;
        for (int i = 0; i < 64; i++) {
            char p = s.at(i);
            if (p != '.' && Character.isUpperCase(p) == white) sum += NecpraChessPieces.value(p);
        }
        return sum;
    }

    /** Fills one player strip: avatar, captured pieces, "+N" material lead and a green tint on the side to move. */
    private void updateStrip(boolean white, LinearLayout strip, TextView av, TextView name, CapturedView cap, TextView lead,
                             NecpraChessEngine.State s, boolean live) {
        int[] have = new int[5];
        for (int i = 0; i < 64; i++) {
            char p = s.at(i);
            if (p == '.' || Character.isUpperCase(p) == white) continue;   // count the OPPONENT's pieces still on the board
            int k = CAP_ORDER.indexOf(Character.toUpperCase(p));
            if (k >= 0) have[k]++;
        }
        StringBuilder taken = new StringBuilder();   // opponent pieces this player has captured
        for (int k = 0; k < 5; k++) {
            int n = Math.max(0, START_COUNT[k] - have[k]);
            for (int j = 0; j < n; j++) taken.append(white ? Character.toLowerCase(CAP_ORDER.charAt(k)) : CAP_ORDER.charAt(k));
        }
        cap.set(taken.toString());
        int diff = material(s, white) - material(s, !white);
        lead.setText(diff > 0 ? "+" + diff : "");
        lead.setTextColor(cGood);
        String label = name.getText().toString();
        av.setText(label.isEmpty() ? "?" : label.substring(0, 1).toUpperCase());
        av.setTextColor(white ? Color.parseColor("#1D1D1F") : Color.parseColor("#F3F4F6"));
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor(white ? Color.parseColor("#F3F4F6") : Color.parseColor("#2A2A2C"));
        dot.setStroke(dp(1.5f), white ? Color.parseColor("#9CA3AF") : Color.parseColor("#000000"));
        av.setBackground(dot);
        boolean toMove = live && s.white == white;
        strip.setBackground(toMove
                ? roundStroke(Color.parseColor("#33769656"), Color.parseColor("#769656"), 12)
                : roundStroke(alpha(cCard, night ? 0xB0 : 0xD0), cLine, 12));
    }

    /** Small row of captured pieces, drawn with the same vector pieces as the board. */
    private final class CapturedView extends View {
        private String pieces = "";

        CapturedView(Context c) { super(c); }

        void set(String p) {
            if (!p.equals(pieces)) {
                pieces = p;
                invalidate();
            }
        }

        @Override protected void onDraw(Canvas cv) {
            float h = getHeight();
            float step = h * 0.62f;
            float x = h / 2f;
            char prev = 0;
            for (int i = 0; i < pieces.length(); i++) {
                char p = pieces.charAt(i);
                if (prev != 0 && p != prev) x += h * 0.28f;   // small gap between piece types
                if (x + h / 2f > getWidth()) break;
                NecpraChessPieces.draw(cv, p, x, h / 2f, h * 1.05f);
                x += step;
                prev = p;
            }
        }
    }

    /** Lays the two player strips and the board out as one block: board is the biggest square that fits, strips match it. */
    private final class BoardGroup extends ViewGroup {
        BoardGroup(Context c) { super(c); }

        private int stripH() { return dp(46); }

        @Override protected void onMeasure(int wSpec, int hSpec) {
            int w = MeasureSpec.getSize(wSpec);
            int sh = stripH();
            int h = MeasureSpec.getMode(hSpec) == MeasureSpec.UNSPECIFIED ? w + 2 * sh : MeasureSpec.getSize(hSpec);
            int side = Math.max(0, Math.min(w, h - 2 * sh - dp(8)));
            for (int i = 0; i < getChildCount(); i++) {
                View v = getChildAt(i);
                int ch = v instanceof BoardView ? side : sh;
                v.measure(MeasureSpec.makeMeasureSpec(side, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(ch, MeasureSpec.EXACTLY));
            }
            setMeasuredDimension(w, h);
        }

        @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
            if (getChildCount() < 3) return;
            View top = getChildAt(0), brd = getChildAt(1), bot = getChildAt(2);
            int side = brd.getMeasuredWidth(), sh = stripH(), gap = dp(4);
            int total = side + 2 * sh + 2 * gap;
            int x = (r - l - side) / 2;
            int y = Math.max(0, (b - t - total) / 2);
            top.layout(x, y, x + side, y + sh);
            brd.layout(x, y + sh + gap, x + side, y + sh + gap + side);
            bot.layout(x, y + sh + gap + side + gap, x + side, y + sh + gap + side + gap + sh);
        }
    }

    // ------------------------------------------------------------------ board

    private final class BoardView extends View {
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint coord = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rect = new RectF();

        BoardView(Context c) {
            super(c);
            coord.setTextAlign(Paint.Align.LEFT);
            coord.setFakeBoldText(true);
        }

        @Override protected void onMeasure(int w, int h) {
            int ws = MeasureSpec.getSize(w), hs = MeasureSpec.getSize(h);
            int s = Math.min(ws, hs > 0 ? hs : ws);
            setMeasuredDimension(s, s);
        }

        private int squareAt(float x, float y) {
            float cell = getWidth() / 8f;
            int c = (int) (x / cell), r = (int) (y / cell);
            if (c < 0 || c > 7 || r < 0 || r > 7) return -1;
            if (flipped) {
                c = 7 - c;
                r = 7 - r;
            }
            return r * 8 + c;
        }

        @Override public boolean onTouchEvent(MotionEvent e) {
            if (e.getAction() == MotionEvent.ACTION_DOWN) return true;
            if (e.getAction() == MotionEvent.ACTION_UP) {
                int sq = squareAt(e.getX(), e.getY());
                if (sq >= 0) tapSquare(sq);
                performClick();
                return true;
            }
            return super.onTouchEvent(e);
        }

        @Override public boolean performClick() { return super.performClick(); }

        @Override protected void onDraw(Canvas cv) {
            float size = getWidth();
            float cell = size / 8f;
            NecpraChessEngine.State s = game.current();
            int last = game.moves.isEmpty() ? -1 : game.moves.get(game.moves.size() - 1).t;
            int lastFrom = game.moves.isEmpty() ? -1 : game.moves.get(game.moves.size() - 1).f;
            int checkSq = -1;
            if (NecpraChessEngine.inCheck(s)) {
                char k = s.white ? 'K' : 'k';
                for (int i = 0; i < 64; i++) if (s.at(i) == k) checkSq = i;
            }
            coord.setTextSize(cell * 0.2f);

            for (int vr = 0; vr < 8; vr++) {
                for (int vc = 0; vc < 8; vc++) {
                    int r = flipped ? 7 - vr : vr, c = flipped ? 7 - vc : vc;
                    int sq = r * 8 + c;
                    boolean light = ((r + c) & 1) == 0;
                    fill.setColor(light ? Color.parseColor("#EEEED2") : Color.parseColor("#769656"));
                    rect.set(vc * cell, vr * cell, (vc + 1) * cell, (vr + 1) * cell);
                    cv.drawRect(rect, fill);
                    if (sq == lastFrom || sq == last) {
                        fill.setColor(Color.parseColor("#80F6F669"));
                        cv.drawRect(rect, fill);
                    }
                    if (sq == selected) {
                        fill.setColor(Color.parseColor("#A0F6F669"));
                        cv.drawRect(rect, fill);
                    }
                    if (sq == checkSq) {
                        glow.setShader(new RadialGradient(rect.centerX(), rect.centerY(), cell * 0.72f,
                                new int[]{Color.parseColor("#E6E53935"), Color.parseColor("#80E53935"), Color.parseColor("#00E53935")},
                                new float[]{0f, 0.55f, 1f}, Shader.TileMode.CLAMP));
                        cv.drawRect(rect, glow);
                    }
                    if (vc == 0) {
                        coord.setColor(light ? Color.parseColor("#769656") : Color.parseColor("#EEEED2"));
                        cv.drawText(String.valueOf(8 - r), vc * cell + cell * 0.05f, vr * cell + cell * 0.22f, coord);
                    }
                    if (vr == 7) {
                        coord.setColor(light ? Color.parseColor("#769656") : Color.parseColor("#EEEED2"));
                        cv.drawText(String.valueOf((char) ('a' + c)), vc * cell + cell * 0.78f, (vr + 1) * cell - cell * 0.06f, coord);
                    }
                    char p = s.at(sq);
                    if (p != '.') {
                        NecpraChessPieces.draw(cv, p, rect.centerX(), rect.centerY(), cell * 0.94f);
                    }
                }
            }
            // legal-move markers on top
            for (NecpraChessEngine.Move m : targets) {
                int r = m.t >> 3, c = m.t & 7;
                int vr = flipped ? 7 - r : r, vc = flipped ? 7 - c : c;
                float cx = vc * cell + cell / 2f, cy = vr * cell + cell / 2f;
                if (s.at(m.t) != '.' || m.ep) {
                    fill.setColor(Color.parseColor("#66000000"));
                    fill.setStyle(Paint.Style.STROKE);
                    fill.setStrokeWidth(cell * 0.09f);
                    cv.drawCircle(cx, cy, cell * 0.44f, fill);
                    fill.setStyle(Paint.Style.FILL);
                } else {
                    fill.setColor(Color.parseColor("#55000000"));
                    cv.drawCircle(cx, cy, cell * 0.16f, fill);
                }
            }
        }
    }
}
