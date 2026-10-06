package com.necpa;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
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
    public static final String MODE_CPU = "cpu", MODE_LOCAL = "local";

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
    private HorizontalScrollView movesScroll;
    private TextView btnUndo, btnResign, btnFlip;
    private boolean flipped;

    @Override protected String gameId() { return "chess"; }

    @Override protected String gameTitle() {
        return getIntent() != null && getIntent().getStringExtra(EXTRA_ROOM) != null ? "Chess · Match" : "Chess";
    }

    // ------------------------------------------------------------------ build

    @Override
    protected void onBuild(Bundle saved) {
        roomCode = getIntent().getStringExtra(EXTRA_ROOM);
        content = column();
        content.setPadding(dp(12), dp(70), dp(12), dp(12));
        stage.addView(content, new android.widget.FrameLayout.LayoutParams(-1, -1));

        topName = text("", 14, cText, true);
        topName.setPadding(dp(4), 0, 0, dp(6));
        content.addView(topName, new LinearLayout.LayoutParams(-1, -2));

        board = new BoardView(this);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(-1, 0, 1f);
        blp.gravity = Gravity.CENTER_HORIZONTAL;
        content.addView(board, blp);

        bottomName = text("", 14, cText, true);
        bottomName.setPadding(dp(4), dp(6), 0, 0);
        content.addView(bottomName, new LinearLayout.LayoutParams(-1, -2));

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

        if (roomCode != null) {
            mode = "room";
            btnUndo.setVisibility(View.GONE);
            btnFlip.setVisibility(View.GONE);
            ((View) btnNew).setVisibility(View.GONE);
            startRoom();
            return;
        }
        level = store.chessLevel();
        final String requested = getIntent().getStringExtra(EXTRA_MODE);
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

        c.addView(space(16));
        final Modal m = modal(c, false);
        c.addView(button("Start", PRIMARY, new Runnable() {
            @Override public void run() {
                m.dismiss();
                mode = opp[0];
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
        game = new NecpraChessEngine.Game();
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
            TextView t = text(glyph(white ? q : Character.toLowerCase(q)), 38, white ? Color.WHITE : Color.parseColor("#111111"), false);
            t.setGravity(Gravity.CENTER);
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
        game.commit(mv);
        selected = -1;
        targets.clear();
        sfx.play(mv.isCapture() ? NecpraSfx.CAPTURE : NecpraSfx.MOVE);
        NecpraChessEngine.Outcome o = game.assess();
        if ("room".equals(mode) && !remote) publish(null);
        if (o.over) {
            finishGame(o, false);
            return;
        }
        if (o.check) sfx.play(NecpraSfx.WRONG);
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
            });
        }
    }

    // ------------------------------------------------------------------ persistence (resume)

    private void saveNow() {
        if (over || !started || "room".equals(mode)) return;
        if (game.moves.isEmpty()) {
            store.saveResume("chess", null);
            return;
        }
        StringBuilder sb = new StringBuilder();
        sb.append(mode).append('|').append(myWhite ? 'w' : 'b').append('|').append(level).append('|');
        for (String n : game.playedNames()) sb.append(n).append(' ');
        store.saveResume("chess", sb.toString().trim());
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
            flipped = !myWhite && MODE_CPU.equals(mode);
            over = false;
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    // ------------------------------------------------------------------ rooms (Play Together)

    private void startRoom() {
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
        content.setPadding(dp(12) + left, top + dp(58), dp(12) + right, bottom + dp(12));
    }

    // ------------------------------------------------------------------ view refresh

    private void refresh() {
        if (dead() || board == null) return;
        NecpraChessEngine.State s = game.current();
        boolean iAmBottomWhite = !flipped;
        topName.setText(nameFor(!iAmBottomWhite));
        bottomName.setText(nameFor(iAmBottomWhite));
        if (over) {
            status.setText(resultText);
            status.setTextColor(cText);
        } else if (!started) {
            status.setText("");
        } else if ("room".equals(mode) && !roomReady) {
            status.setText("Waiting for your friend…  Code " + roomCode);
            status.setTextColor(cSub);
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

    private static String glyph(char piece) {
        String g;
        switch (Character.toUpperCase(piece)) {
            case 'K': g = "\u265A"; break;
            case 'Q': g = "\u265B"; break;
            case 'R': g = "\u265C"; break;
            case 'B': g = "\u265D"; break;
            case 'N': g = "\u265E"; break;
            default: g = "\u265F"; break;
        }
        return g + "\uFE0E"; // force text presentation, never the emoji pawn
    }

    // ------------------------------------------------------------------ board

    private final class BoardView extends View {
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint pieceFill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint pieceLine = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint coord = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rect = new RectF();

        BoardView(Context c) {
            super(c);
            pieceFill.setTextAlign(Paint.Align.CENTER);
            pieceLine.setTextAlign(Paint.Align.CENTER);
            pieceLine.setStyle(Paint.Style.STROKE);
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
            pieceFill.setTextSize(cell * 0.82f);
            pieceLine.setTextSize(cell * 0.82f);
            pieceLine.setStrokeWidth(Math.max(2f, cell * 0.045f));
            coord.setTextSize(cell * 0.2f);
            Paint.FontMetrics fm = pieceFill.getFontMetrics();
            float baseShift = -(fm.ascent + fm.descent) / 2f;

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
                        fill.setColor(Color.parseColor("#B0E53935"));
                        cv.drawCircle(rect.centerX(), rect.centerY(), cell * 0.5f, fill);
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
                        boolean white = Character.isUpperCase(p);
                        String g = glyph(p);
                        float cx = rect.centerX(), cy = rect.centerY() + baseShift;
                        pieceLine.setColor(white ? Color.parseColor("#1A1A1A") : Color.parseColor("#B3FFFFFF"));
                        pieceLine.setStrokeWidth(white ? Math.max(2f, cell * 0.05f) : Math.max(1f, cell * 0.018f));
                        cv.drawText(g, cx, cy, pieceLine);
                        pieceFill.setColor(white ? Color.WHITE : Color.parseColor("#141414"));
                        cv.drawText(g, cx, cy, pieceFill);
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
