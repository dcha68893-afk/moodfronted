package com.necpa;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/**
 * Chess rules engine and computer opponent (pure Java). A direct port of the web arcade engine (full rules:
 * castling, en passant, promotion, stalemate, insufficient material, 50-move rule, threefold repetition),
 * verified against the standard perft node counts in the unit tests.
 *
 * Board: char[64], index = row*8 + col, row 0 is Black's back rank. Upper case = White.
 */
public final class NecpraChessEngine {
    private NecpraChessEngine() {}

    public static final String START = "rnbqkbnr/pppppppp/......../......../......../......../PPPPPPPP/RNBQKBNR";
    private static final String FILES = "abcdefgh";
    private static final char[] PROMO = {'Q', 'R', 'B', 'N'};
    private static final int[][] KN = {{-2, -1}, {-2, 1}, {-1, -2}, {-1, 2}, {1, -2}, {1, 2}, {2, -1}, {2, 1}};
    private static final int[][] ORTH = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
    private static final int[][] DIAG = {{1, 1}, {1, -1}, {-1, 1}, {-1, -1}};

    // ------------------------------------------------------------------ data types

    public static final class Move {
        public int f, t;
        public char cap = '.';
        public char promo = 0;
        public boolean ep, dbl;
        public char castle = 0; // 'K' or 'Q'

        Move(int f, int t, char cap) {
            this.f = f;
            this.t = t;
            this.cap = cap;
        }

        public boolean isCapture() { return cap != '.' || ep; }

        /** Long algebraic name, e.g. e2e4 or e7e8q. */
        public String name() { return sq(f) + sq(t) + (promo != 0 ? String.valueOf(Character.toLowerCase(promo)) : ""); }
    }

    public static final class State {
        public final char[] b;
        public final boolean white;       // side to move
        public final boolean wK, wQ, bK, bQ;
        public final int ep;              // en passant target square or -1
        public final int half, ply;

        State(char[] b, boolean white, boolean wK, boolean wQ, boolean bK, boolean bQ, int ep, int half, int ply) {
            this.b = b;
            this.white = white;
            this.wK = wK;
            this.wQ = wQ;
            this.bK = bK;
            this.bQ = bQ;
            this.ep = ep;
            this.half = half;
            this.ply = ply;
        }

        public char at(int i) { return b[i]; }
    }

    public static State start() { return fromFen(START + " w KQkq - 0 1"); }

    // ------------------------------------------------------------------ helpers

    static boolean isW(char p) { return p != '.' && Character.isUpperCase(p); }

    static boolean colorIs(char p, boolean white) { return p != '.' && isW(p) == white; }

    static char typ(char p) { return Character.toUpperCase(p); }

    static int R(int i) { return i >> 3; }

    static int C(int i) { return i & 7; }

    static boolean inb(int r, int c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

    public static String sq(int i) { return "" + FILES.charAt(C(i)) + (8 - R(i)); }

    public static int sqIndex(String s) { return (8 - (s.charAt(1) - '0')) * 8 + (s.charAt(0) - 'a'); }

    /** Parses a FEN ("rank8/.../rank1 w KQkq e3 0 1"); '.' or digits mean empty squares. */
    public static State fromFen(String fen) {
        String[] parts = fen.trim().split("\\s+");
        String[] rows = parts[0].split("/");
        if (rows.length != 8) throw new IllegalArgumentException("bad FEN rows");
        char[] b = new char[64];
        for (int r = 0; r < 8; r++) {
            int c = 0;
            for (char ch : rows[r].toCharArray()) {
                if (ch >= '1' && ch <= '8') {
                    for (int k = 0; k < ch - '0'; k++) b[r * 8 + c++] = '.';
                } else b[r * 8 + c++] = ch;
            }
            if (c != 8) throw new IllegalArgumentException("bad FEN row " + r);
        }
        boolean white = parts.length < 2 || !"b".equals(parts[1]);
        String rights = parts.length > 2 ? parts[2] : "-";
        int ep = parts.length > 3 && !"-".equals(parts[3]) ? sqIndex(parts[3]) : -1;
        int half = parts.length > 4 ? Integer.parseInt(parts[4]) : 0;
        int full = parts.length > 5 ? Integer.parseInt(parts[5]) : 1;
        return new State(b, white, rights.contains("K"), rights.contains("Q"), rights.contains("k"), rights.contains("q"),
                ep, half, (full - 1) * 2 + (white ? 0 : 1));
    }

    public static String toFen(State s) {
        StringBuilder sb = new StringBuilder();
        for (int r = 0; r < 8; r++) {
            int empty = 0;
            for (int c = 0; c < 8; c++) {
                char p = s.b[r * 8 + c];
                if (p == '.') empty++;
                else {
                    if (empty > 0) sb.append(empty);
                    empty = 0;
                    sb.append(p);
                }
            }
            if (empty > 0) sb.append(empty);
            if (r < 7) sb.append('/');
        }
        sb.append(s.white ? " w " : " b ");
        String rt = (s.wK ? "K" : "") + (s.wQ ? "Q" : "") + (s.bK ? "k" : "") + (s.bQ ? "q" : "");
        sb.append(rt.isEmpty() ? "-" : rt).append(' ').append(s.ep >= 0 ? sq(s.ep) : "-").append(' ').append(s.half).append(' ').append(s.ply / 2 + 1);
        return sb.toString();
    }

    private static boolean epActive(State s) {
        if (s.ep < 0) return false;
        char pw = s.white ? 'P' : 'p';
        int off = s.white ? 8 : -8;
        for (int dc = -1; dc <= 1; dc += 2) {
            int c = C(s.ep) + dc;
            if (c < 0 || c > 7) continue;
            int idx = s.ep + off + dc;
            if (idx >= 0 && idx < 64 && s.b[idx] == pw) return true;
        }
        return false;
    }

    /** Position identity for repetition (board, side, castling rights, usable en passant). */
    public static String positionKey(State s) {
        return new String(s.b) + (s.white ? 'w' : 'b') + (s.wK ? "K" : "") + (s.wQ ? "Q" : "") + (s.bK ? "k" : "") + (s.bQ ? "q" : "") + (epActive(s) ? s.ep : "");
    }

    // ------------------------------------------------------------------ attack & legality

    static boolean attacked(char[] b, int sq, boolean byWhite) {
        int r = R(sq), c = C(sq);
        int pr = byWhite ? r + 1 : r - 1;
        char P = byWhite ? 'P' : 'p';
        for (int dc = -1; dc <= 1; dc += 2) if (inb(pr, c + dc) && b[pr * 8 + c + dc] == P) return true;
        char N = byWhite ? 'N' : 'n';
        for (int[] d : KN) if (inb(r + d[0], c + d[1]) && b[(r + d[0]) * 8 + c + d[1]] == N) return true;
        char K = byWhite ? 'K' : 'k';
        for (int dr = -1; dr <= 1; dr++)
            for (int dc = -1; dc <= 1; dc++)
                if ((dr != 0 || dc != 0) && inb(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] == K) return true;
        for (int[] d : ORTH) {
            int x = r + d[0], y = c + d[1];
            while (inb(x, y)) {
                char p = b[x * 8 + y];
                if (p != '.') {
                    if (isW(p) == byWhite && (typ(p) == 'R' || typ(p) == 'Q')) return true;
                    break;
                }
                x += d[0];
                y += d[1];
            }
        }
        for (int[] d : DIAG) {
            int x = r + d[0], y = c + d[1];
            while (inb(x, y)) {
                char p = b[x * 8 + y];
                if (p != '.') {
                    if (isW(p) == byWhite && (typ(p) == 'B' || typ(p) == 'Q')) return true;
                    break;
                }
                x += d[0];
                y += d[1];
            }
        }
        return false;
    }

    static int kingSq(char[] b, boolean white) {
        char k = white ? 'K' : 'k';
        for (int i = 0; i < 64; i++) if (b[i] == k) return i;
        return -1;
    }

    public static boolean inCheck(char[] b, boolean white) {
        int k = kingSq(b, white);
        return k >= 0 && attacked(b, k, !white);
    }

    public static boolean inCheck(State s) { return inCheck(s.b, s.white); }

    private static List<Move> pseudo(State s) {
        List<Move> out = new ArrayList<>(48);
        char[] b = s.b;
        boolean side = s.white;
        for (int i = 0; i < 64; i++) {
            char p = b[i];
            if (p == '.' || isW(p) != side) continue;
            char t = typ(p);
            int r = R(i), c = C(i);
            if (t == 'P') {
                int d = side ? -1 : 1, sr = side ? 6 : 1, pr = side ? 0 : 7, r1 = r + d;
                if (inb(r1, c) && b[r1 * 8 + c] == '.') {
                    if (r1 == pr) {
                        for (char q : PROMO) {
                            Move m = new Move(i, r1 * 8 + c, '.');
                            m.promo = q;
                            out.add(m);
                        }
                    } else {
                        out.add(new Move(i, r1 * 8 + c, '.'));
                        if (r == sr && b[(r + 2 * d) * 8 + c] == '.') {
                            Move m = new Move(i, (r + 2 * d) * 8 + c, '.');
                            m.dbl = true;
                            out.add(m);
                        }
                    }
                }
                for (int dc = -1; dc <= 1; dc += 2) {
                    int cc = c + dc;
                    if (!inb(r1, cc)) continue;
                    int to = r1 * 8 + cc;
                    char q = b[to];
                    if (q != '.' && isW(q) != side) {
                        if (r1 == pr) {
                            for (char x : PROMO) {
                                Move m = new Move(i, to, q);
                                m.promo = x;
                                out.add(m);
                            }
                        } else out.add(new Move(i, to, q));
                    } else if (q == '.' && to == s.ep && b[r * 8 + cc] == (side ? 'p' : 'P')) {
                        Move m = new Move(i, to, side ? 'p' : 'P');
                        m.ep = true;
                        out.add(m);
                    }
                }
            } else if (t == 'N' || t == 'K') {
                for (int[] d : t == 'N' ? KN : allDirs()) {
                    int rr = r + d[0], cc = c + d[1];
                    if (!inb(rr, cc)) continue;
                    int to = rr * 8 + cc;
                    char q = b[to];
                    if (q == '.' || isW(q) != side) out.add(new Move(i, to, q));
                }
                if (t == 'K') {
                    int home = side ? 60 : 4;
                    char rk = side ? 'R' : 'r';
                    boolean en = !side;
                    if (i == home && !attacked(b, i, en)) {
                        boolean kRight = side ? s.wK : s.bK, qRight = side ? s.wQ : s.bQ;
                        if (kRight && b[i + 1] == '.' && b[i + 2] == '.' && b[i + 3] == rk && !attacked(b, i + 1, en) && !attacked(b, i + 2, en)) {
                            Move m = new Move(i, i + 2, '.');
                            m.castle = 'K';
                            out.add(m);
                        }
                        if (qRight && b[i - 1] == '.' && b[i - 2] == '.' && b[i - 3] == '.' && b[i - 4] == rk && !attacked(b, i - 1, en) && !attacked(b, i - 2, en)) {
                            Move m = new Move(i, i - 2, '.');
                            m.castle = 'Q';
                            out.add(m);
                        }
                    }
                }
            } else {
                boolean rook = t == 'R' || t == 'Q', bishop = t == 'B' || t == 'Q';
                for (int pass = 0; pass < 2; pass++) {
                    if (pass == 0 && !rook) continue;
                    if (pass == 1 && !bishop) continue;
                    for (int[] d : pass == 0 ? ORTH : DIAG) {
                        int rr = r + d[0], cc = c + d[1];
                        while (inb(rr, cc)) {
                            int to = rr * 8 + cc;
                            char q = b[to];
                            if (q == '.') out.add(new Move(i, to, '.'));
                            else {
                                if (isW(q) != side) out.add(new Move(i, to, q));
                                break;
                            }
                            rr += d[0];
                            cc += d[1];
                        }
                    }
                }
            }
        }
        return out;
    }

    private static int[][] ALL;

    private static int[][] allDirs() {
        if (ALL == null) {
            ALL = new int[8][];
            for (int i = 0; i < 4; i++) {
                ALL[i] = ORTH[i];
                ALL[i + 4] = DIAG[i];
            }
        }
        return ALL;
    }

    public static State make(State s, Move m) {
        char[] b = s.b.clone();
        char p = b[m.f];
        boolean side = s.white;
        char t = typ(p);
        b[m.f] = '.';
        if (m.ep) b[side ? m.t + 8 : m.t - 8] = '.';
        b[m.t] = m.promo != 0 ? (side ? m.promo : Character.toLowerCase(m.promo)) : p;
        if (m.castle == 'K') {
            b[m.t - 1] = b[m.t + 1];
            b[m.t + 1] = '.';
        }
        if (m.castle == 'Q') {
            b[m.t + 1] = b[m.t - 2];
            b[m.t - 2] = '.';
        }
        boolean wK = s.wK, wQ = s.wQ, bK = s.bK, bQ = s.bQ;
        if (t == 'K') {
            if (side) {
                wK = false;
                wQ = false;
            } else {
                bK = false;
                bQ = false;
            }
        }
        for (int q : new int[]{m.f, m.t}) {
            if (q == 63) wK = false;
            if (q == 56) wQ = false;
            if (q == 7) bK = false;
            if (q == 0) bQ = false;
        }
        int ep = (t == 'P' && Math.abs(m.t - m.f) == 16) ? (m.f + m.t) / 2 : -1;
        int half = (t == 'P' || m.cap != '.') ? 0 : s.half + 1;
        return new State(b, !side, wK, wQ, bK, bQ, ep, half, s.ply + 1);
    }

    public static List<Move> legal(State s) {
        List<Move> ps = pseudo(s);
        List<Move> out = new ArrayList<>(ps.size());
        for (Move m : ps) if (!inCheck(make(s, m).b, s.white)) out.add(m);
        return out;
    }

    public static long perft(State s, int depth) {
        if (depth == 0) return 1;
        List<Move> ms = legal(s);
        if (depth == 1) return ms.size();
        long n = 0;
        for (Move m : ms) n += perft(make(s, m), depth - 1);
        return n;
    }

    // ------------------------------------------------------------------ notation

    public static String san(State s, Move m, List<Move> ms) {
        StringBuilder str = new StringBuilder();
        if (m.castle != 0) str.append(m.castle == 'K' ? "O-O" : "O-O-O");
        else {
            char t = typ(s.b[m.f]);
            boolean cap = m.cap != '.' || m.ep;
            if (t == 'P') {
                if (cap) str.append(FILES.charAt(C(m.f))).append('x');
                str.append(sq(m.t));
                if (m.promo != 0) str.append('=').append(m.promo);
            } else {
                str.append(t);
                List<Move> others = new ArrayList<>();
                for (Move o : ms) if (o.f != m.f && o.t == m.t && typ(s.b[o.f]) == t) others.add(o);
                if (!others.isEmpty()) {
                    boolean sf = false, sr = false;
                    for (Move o : others) {
                        if (C(o.f) == C(m.f)) sf = true;
                        if (R(o.f) == R(m.f)) sr = true;
                    }
                    if (!sf) str.append(FILES.charAt(C(m.f)));
                    else if (!sr) str.append(8 - R(m.f));
                    else str.append(sq(m.f));
                }
                if (cap) str.append('x');
                str.append(sq(m.t));
            }
        }
        State n = make(s, m);
        if (inCheck(n.b, n.white)) str.append(legal(n).isEmpty() ? '#' : '+');
        return str.toString();
    }

    public static boolean insufficient(char[] b) {
        List<int[]> pcs = new ArrayList<>(); // {type, square}
        for (int i = 0; i < 64; i++) {
            char p = b[i];
            if (p != '.' && typ(p) != 'K') pcs.add(new int[]{typ(p), i});
        }
        if (pcs.isEmpty()) return true;
        for (int[] x : pcs) if (x[0] == 'P' || x[0] == 'R' || x[0] == 'Q') return false;
        if (pcs.size() == 1) return true;
        boolean allB = true;
        for (int[] x : pcs) if (x[0] != 'B') allB = false;
        if (allB) {
            int shade = (R(pcs.get(0)[1]) + C(pcs.get(0)[1])) % 2;
            for (int[] x : pcs) if ((R(x[1]) + C(x[1])) % 2 != shade) return false;
            return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ evaluation & search

    private static final int MATE = 100000;

    private static int val(char t) {
        switch (t) {
            case 'P': return 100;
            case 'N': return 320;
            case 'B': return 330;
            case 'R': return 500;
            case 'Q': return 900;
            default: return 0;
        }
    }

    private static final int[] PST_P = {0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0};
    private static final int[] PST_N = {-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50};
    private static final int[] PST_B = {-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20};
    private static final int[] PST_R = {0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0};
    private static final int[] PST_K = {-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20};

    private static int[] pst(char t) {
        switch (t) {
            case 'P': return PST_P;
            case 'N': return PST_N;
            case 'B': return PST_B;
            case 'R': return PST_R;
            case 'K': return PST_K;
            default: return null;
        }
    }

    private static int evaluate(State s) {
        int v = 0;
        for (int i = 0; i < 64; i++) {
            char p = s.b[i];
            if (p == '.') continue;
            char t = typ(p);
            boolean w = isW(p);
            int[] tb = pst(t);
            v += (w ? 1 : -1) * (val(t) + (tb != null ? tb[w ? i : (7 - R(i)) * 8 + C(i)] : 0));
        }
        return s.white ? v : -v;
    }

    private static void order(State s, List<Move> ms) {
        final char[] b = s.b;
        Collections.sort(ms, (x, y) -> Integer.compare(score(b, y), score(b, x)));
    }

    private static int score(char[] b, Move m) {
        int sc = 0;
        if (m.cap != '.') sc += 10 * val(typ(m.cap)) - val(typ(b[m.f])) + 1000;
        if (m.promo != 0) sc += 800;
        return sc;
    }

    private static final class Ctx {
        int n;
        long deadline;
        boolean abort;
    }

    private static int qs(State s, List<Move> ms, int a, int b, Ctx ctx, int d) {
        int stand = evaluate(s);
        if (stand >= b) return stand;
        if (stand > a) a = stand;
        if (d >= 4) return stand;
        List<Move> caps = new ArrayList<>();
        for (Move m : ms) if (m.cap != '.' || m.promo != 0) caps.add(m);
        order(s, caps);
        for (Move m : caps) {
            State n = make(s, m);
            int v = -qs(n, legal(n), -b, -a, ctx, d + 1);
            if (ctx.abort) return 0;
            if (v >= b) return v;
            if (v > a) a = v;
        }
        return a;
    }

    private static int ab(State s, int d, int a, int b, Ctx ctx, int ply) {
        if (ctx.abort) return 0;
        if ((++ctx.n & 255) == 0 && System.nanoTime() > ctx.deadline) {
            ctx.abort = true;
            return 0;
        }
        if (s.half >= 100) return 0;
        List<Move> ms = legal(s);
        if (ms.isEmpty()) return inCheck(s.b, s.white) ? -MATE + ply : 0;
        if (d <= 0) return qs(s, ms, a, b, ctx, 0);
        order(s, ms);
        int best = Integer.MIN_VALUE + 1;
        for (Move m : ms) {
            int v = -ab(make(s, m), d - 1, -b, -a, ctx, ply + 1);
            if (ctx.abort) return 0;
            if (v > best) best = v;
            if (v > a) a = v;
            if (a >= b) break;
        }
        return best;
    }

    public static final class Level {
        final int depth;
        final long ms;
        final int slack;

        Level(int depth, long ms, int slack) {
            this.depth = depth;
            this.ms = ms;
            this.slack = slack;
        }
    }

    public static Level level(String name) {
        // Native is considerably faster than the old JavaScript engine, so the same time budgets reach deeper.
        if ("easy".equals(name)) return new Level(1, 300, 90);
        if ("hard".equals(name)) return new Level(7, 2400, 0);
        return new Level(4, 900, 12);
    }

    private static final String[][] BOOK = split(new String[]{
            "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d4 e5d4", "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7",
            "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6", "e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5",
            "e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7 e4e5 f6d7", "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6",
            "e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c7c6", "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8",
            "d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5", "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8",
            "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5", "c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5 c4d5 f6d5",
            "g1f3 d7d5 g2g3 g8f6 f1g2 e7e6 e1g1 f8e7 d2d3 e8g8", "d2d4 d7d5 c1f4 g8f6 e2e3 e7e6 g1f3 c7c5 c2c3 b8c6",
            "d2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6 f1c4 c7c5", "e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5",
            "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6"});

    private static String[][] split(String[] lines) {
        String[][] o = new String[lines.length][];
        for (int i = 0; i < lines.length; i++) o[i] = lines[i].split(" ");
        return o;
    }

    private static final Random RNG = new Random();

    /** Opening-book reply for the moves played so far, or null. */
    public static Move bookMove(State base, List<String> played, List<Move> legalNow) {
        if (played.size() >= 10 || base.ply != 0) return null;
        List<String> cands = new ArrayList<>();
        for (String[] line : BOOK) {
            if (line.length <= played.size()) continue;
            boolean ok = true;
            for (int i = 0; i < played.size(); i++) if (!line[i].equals(played.get(i))) { ok = false; break; }
            if (ok) cands.add(line[played.size()]);
        }
        if (cands.isEmpty()) return null;
        String pick = cands.get(RNG.nextInt(cands.size()));
        for (Move m : legalNow) if (m.name().equals(pick)) return m;
        return null;
    }

    /** Picks the computer's move. Blocks for up to the level's time budget; call from a background thread. */
    public static Move pickMove(State s, String levelName) {
        Level cfg = level(levelName);
        List<Move> ms = legal(s);
        if (ms.isEmpty()) return null;
        if (ms.size() == 1) return ms.get(0);
        Collections.shuffle(ms, RNG);
        order(s, ms);
        Ctx ctx = new Ctx();
        ctx.deadline = System.nanoTime() + cfg.ms * 1_000_000L;
        if ("easy".equals(levelName)) {
            int[] sc = new int[ms.size()];
            int top = Integer.MIN_VALUE;
            for (int i = 0; i < ms.size(); i++) {
                sc[i] = -ab(make(s, ms.get(i)), 0, -MATE * 2, MATE * 2, ctx, 1);
                if (sc[i] > top) top = sc[i];
            }
            List<Move> pool = new ArrayList<>();
            for (int i = 0; i < ms.size(); i++) if (sc[i] >= top - cfg.slack) pool.add(ms.get(i));
            return pool.get(RNG.nextInt(pool.size()));
        }
        Move best = ms.get(0);
        for (int d = 1; d <= cfg.depth; d++) {
            int a = -MATE * 2;
            Move cur = null;
            for (Move m : ms) {
                int v = -ab(make(s, m), d - 1, -MATE * 2, -a, ctx, 1);
                if (ctx.abort) break;
                if (v > a || cur == null) {
                    a = v;
                    cur = m;
                }
            }
            if (ctx.abort && d > 1) break;
            if (cur != null) {
                best = cur;
                ms.remove(cur);
                ms.add(0, cur);
            }
            if (ctx.abort || Math.abs(a) > MATE - 200) break;
        }
        return best;
    }

    // ------------------------------------------------------------------ game wrapper

    /** Result of {@link Game#assess()}. */
    public static final class Outcome {
        public final boolean over;
        public final String kind;       // mate | stalemate | material | fifty | rep | resign
        public final boolean whiteWins; // meaningful for mate/resign
        public final boolean check;

        Outcome(boolean over, String kind, boolean whiteWins, boolean check) {
            this.over = over;
            this.kind = kind;
            this.whiteWins = whiteWins;
            this.check = check;
        }
    }

    /** Move history with undo, review and repetition tracking. */
    public static final class Game {
        public final State base;
        public final List<State> states = new ArrayList<>();   // state AFTER each move
        public final List<Move> moves = new ArrayList<>();
        public final List<String> sans = new ArrayList<>();

        public Game() { this(start()); }

        public Game(State base) { this.base = base; }

        public State current() { return states.isEmpty() ? base : states.get(states.size() - 1); }

        public State stateAt(int view) { return view <= 0 ? base : states.get(view - 1); }

        public String commit(Move m) {
            State s = current();
            String text = san(s, m, legal(s));
            State n = make(s, m);
            moves.add(m);
            states.add(n);
            sans.add(text);
            return text;
        }

        /** Removes the last {@code n} plies. */
        public void undo(int n) {
            n = Math.min(n, moves.size());
            for (int i = 0; i < n; i++) {
                moves.remove(moves.size() - 1);
                states.remove(states.size() - 1);
                sans.remove(sans.size() - 1);
            }
        }

        public void truncate(int plies) {
            while (moves.size() > plies) undo(1);
        }

        public int repetitions(State s) {
            String k = positionKey(s);
            int n = positionKey(base).equals(k) ? 1 : 0;
            for (State h : states) if (positionKey(h).equals(k)) n++;
            return n;
        }

        public Outcome assess() {
            State s = current();
            List<Move> ms = legal(s);
            boolean chk = inCheck(s);
            if (ms.isEmpty()) return chk ? new Outcome(true, "mate", !s.white, true) : new Outcome(true, "stalemate", false, false);
            if (insufficient(s.b)) return new Outcome(true, "material", false, chk);
            if (s.half >= 100) return new Outcome(true, "fifty", false, chk);
            if (repetitions(s) >= 3) return new Outcome(true, "rep", false, chk);
            return new Outcome(false, "", false, chk);
        }

        public List<String> playedNames() {
            List<String> l = new ArrayList<>();
            for (Move m : moves) l.add(m.name());
            return l;
        }
    }

    /** Compact string of a position for the multiplayer room payload (same format as the web arcade). */
    public static String encode(State s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 64; i++) {
            sb.append(s.b[i]);
            if ((i & 7) == 7 && i < 63) sb.append('/');
        }
        sb.append('|').append(s.white ? 'w' : 'b').append('|').append(s.ep).append('|');
        boolean first = true;
        String[] names = {"wK", "wQ", "bK", "bQ"};
        boolean[] on = {s.wK, s.wQ, s.bK, s.bQ};
        for (int i = 0; i < 4; i++) if (on[i]) {
            if (!first) sb.append(',');
            sb.append(names[i]);
            first = false;
        }
        sb.append('|').append(s.ply);
        return sb.toString();
    }

    public static State decode(String str) {
        try {
            String[] p = str.split("\\|", -1);
            String[] rows = p[0].split("/");
            if (rows.length != 8) return null;
            char[] b = new char[64];
            for (int r = 0; r < 8; r++) {
                if (rows[r].length() != 8) return null;
                for (int c = 0; c < 8; c++) b[r * 8 + c] = rows[r].charAt(c);
            }
            String rs = p.length > 3 ? p[3] : "";
            return new State(b, !"b".equals(p[1]), rs.contains("wK"), rs.contains("wQ"), rs.contains("bK"), rs.contains("bQ"),
                    Integer.parseInt(p[2]), 0, p.length > 4 ? Integer.parseInt(p[4]) : 0);
        } catch (RuntimeException e) {
            return null;
        }
    }
}
