package com.necpa;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;

/**
 * Block Puzzle rules engine (pure Java). Same rules, scoring and level targets as the web arcade:
 * 10x10 board, three-piece tray, one HOLD slot, lines clear for n*n*100*(1+0.25*(combo-1)), a level is
 * won at its target score and the game ends when nothing in the tray or hold fits.
 */
public final class NecpraBlockEngine {
    public static final int N = 10;
    public static final int COLORS = 6;

    /** Base shapes, identical to the web arcade (row, col pairs). */
    private static final int[][][] SHAPES = {
            {{0, 0}},
            {{0, 0}, {0, 1}},
            {{0, 0}, {1, 0}},
            {{0, 0}, {0, 1}, {1, 0}},
            {{0, 0}, {0, 1}, {0, 2}},
            {{0, 0}, {1, 0}, {2, 0}},
            {{0, 1}, {1, 0}, {1, 1}, {1, 2}},
            {{0, 0}, {0, 1}, {1, 0}, {1, 1}},
            {{0, 0}, {0, 1}, {0, 2}, {1, 0}},
            {{0, 0}, {1, 0}, {1, 1}, {1, 2}},
            {{0, 0}, {0, 1}, {0, 2}, {1, 1}},
            {{0, 1}, {1, 0}, {1, 1}, {2, 1}},
    };

    /** An immutable piece: cells normalised so the minimum row/col is 0. */
    public static final class Piece {
        public final int[][] cells;
        public final int color;
        public final int h, w;

        public Piece(int[][] cells, int color) {
            this.cells = cells;
            this.color = ((color % COLORS) + COLORS) % COLORS;
            int mr = 0, mc = 0;
            for (int[] c : cells) {
                mr = Math.max(mr, c[0]);
                mc = Math.max(mc, c[1]);
            }
            this.h = mr + 1;
            this.w = mc + 1;
        }

        public Piece rotated() {
            int maxR = 0;
            for (int[] c : cells) maxR = Math.max(maxR, c[0]);
            int[][] out = new int[cells.length][2];
            int minR = Integer.MAX_VALUE, minC = Integer.MAX_VALUE;
            for (int i = 0; i < cells.length; i++) {
                out[i][0] = cells[i][1];
                out[i][1] = maxR - cells[i][0];
                minR = Math.min(minR, out[i][0]);
                minC = Math.min(minC, out[i][1]);
            }
            for (int[] c : out) {
                c[0] -= minR;
                c[1] -= minC;
            }
            return new Piece(out, color);
        }

        public String encode() {
            StringBuilder sb = new StringBuilder();
            sb.append(color).append(':');
            for (int i = 0; i < cells.length; i++) {
                if (i > 0) sb.append('.');
                sb.append(cells[i][0]).append(cells[i][1]);
            }
            return sb.toString();
        }

        static Piece decode(String s) {
            String[] p = s.split(":");
            int color = Integer.parseInt(p[0]);
            String[] cs = p[1].split("\\.");
            int[][] cells = new int[cs.length][2];
            for (int i = 0; i < cs.length; i++) {
                cells[i][0] = cs[i].charAt(0) - '0';
                cells[i][1] = cs[i].charAt(1) - '0';
            }
            return new Piece(cells, color);
        }
    }

    /** What happened after a placement; consumed by the renderer for effects. */
    public static final class PlaceResult {
        public boolean placed;
        public int[] clearedRows = new int[0];
        public int[] clearedCols = new int[0];
        public int gained;
        public int combo;
        public boolean levelComplete;
        public boolean gameOver;
        public List<int[]> clearedCells = new ArrayList<>(); // {r,c,color}
    }

    // ------------------------------------------------------------------ state

    private final int[][] board = new int[N][N];
    private final Piece[] tray = new Piece[3];
    private Piece hold;
    private int score, combo, level;
    private boolean levelDone;
    private boolean over;
    private String difficulty = "moderate";
    private final int[] charges = new int[3]; // rotate, shuffle, blast
    private Random rng;

    public static final int POWER_ROTATE = 0, POWER_SHUFFLE = 1, POWER_BLAST = 2;
    public static final int CHARGES_PER_LEVEL = 3;

    public NecpraBlockEngine(int level, String difficulty, long seed) {
        this.level = Math.max(1, level);
        this.difficulty = difficulty == null ? "moderate" : difficulty;
        this.rng = new Random(seed);
        newGame();
    }

    public void newGame() {
        for (int[] row : board) Arrays.fill(row, -1);
        score = 0;
        combo = 0;
        hold = null;
        levelDone = false;
        over = false;
        Arrays.fill(charges, CHARGES_PER_LEVEL);
        prefill(level);
        refillTray();
    }

    public int level() { return level; }
    public int score() { return score; }
    public int combo() { return combo; }
    public boolean isOver() { return over; }
    public boolean isLevelComplete() { return levelDone; }
    public int cell(int r, int c) { return board[r][c]; }
    public Piece tray(int i) { return tray[i]; }
    public Piece hold() { return hold; }
    public int charges(int power) { return charges[power]; }
    public void addCharge(int power) { charges[power]++; }

    public int target() { return targetFor(level); }

    public static int targetFor(int lv) {
        int t = 500;
        for (int i = 1; i < lv; i++) t += 200 + 100 * (i - 1);
        return t;
    }

    public int trayCount() {
        int n = 0;
        for (Piece p : tray) if (p != null) n++;
        return n;
    }

    // ------------------------------------------------------------------ setup

    private void prefill(int lv) {
        int n = Math.min(6 + (lv - 1) * 3, 36);
        Random r = new Random(0x9E3779B1L * lv + 17);
        int placed = 0, guard = 0;
        while (placed < n && guard++ < 600) {
            int row = r.nextInt(N), col = r.nextInt(N);
            if (board[row][col] >= 0) continue;
            board[row][col] = r.nextInt(COLORS);
            boolean fullRow = true, fullCol = true;
            for (int k = 0; k < N; k++) {
                if (board[row][k] < 0) fullRow = false;
                if (board[k][col] < 0) fullCol = false;
            }
            if (fullRow || fullCol) {
                board[row][col] = -1;
                continue;
            }
            placed++;
        }
    }

    private Piece randomPiece(int[][][] pool) {
        int[][] s = pool[rng.nextInt(pool.length)];
        int[][] cells = new int[s.length][];
        for (int i = 0; i < s.length; i++) cells[i] = s[i].clone();
        return new Piece(cells, rng.nextInt(COLORS));
    }

    private int[][][] pool() {
        if ("easy".equals(difficulty)) return Arrays.copyOfRange(SHAPES, 0, 8);
        if ("hard".equals(difficulty)) return Arrays.copyOfRange(SHAPES, 3, SHAPES.length);
        return SHAPES;
    }

    /** Fills the tray with three pieces, guaranteeing at least one of them can be placed. */
    public void refillTray() {
        int[][][] pool = pool();
        for (int attempt = 0; attempt < 60; attempt++) {
            for (int i = 0; i < 3; i++) tray[i] = randomPiece(pool);
            for (Piece p : tray) if (fitsAnywhere(p)) return;
        }
    }

    // ------------------------------------------------------------------ rules

    public boolean canPlace(Piece p, int r, int c) {
        if (p == null) return false;
        for (int[] cell : p.cells) {
            int rr = r + cell[0], cc = c + cell[1];
            if (rr < 0 || rr >= N || cc < 0 || cc >= N || board[rr][cc] >= 0) return false;
        }
        return true;
    }

    public boolean fitsAnywhere(Piece p) {
        if (p == null) return false;
        for (int r = 0; r < N; r++) for (int c = 0; c < N; c++) if (canPlace(p, r, c)) return true;
        return false;
    }

    public boolean anyMove() {
        for (Piece p : tray) if (fitsAnywhere(p)) return true;
        return fitsAnywhere(hold);
    }

    /** Places tray piece {@code slot} at (r,c). */
    public PlaceResult place(int slot, int r, int c) {
        PlaceResult res = new PlaceResult();
        if (over || levelDone || slot < 0 || slot > 2) return res;
        Piece p = tray[slot];
        if (!canPlace(p, r, c)) return res;
        for (int[] cell : p.cells) board[r + cell[0]][c + cell[1]] = p.color;
        tray[slot] = null;
        score += p.cells.length * 5;
        res.gained += p.cells.length * 5;
        res.placed = true;
        if (trayCount() == 0) refillTray();
        clearLines(res);
        res.combo = combo;
        if (score >= target()) {
            levelDone = true;
            res.levelComplete = true;
        } else if (!anyMove()) {
            over = true;
            res.gameOver = true;
        }
        return res;
    }

    private void clearLines(PlaceResult res) {
        List<Integer> rows = new ArrayList<>(), cols = new ArrayList<>();
        for (int r = 0; r < N; r++) {
            boolean full = true;
            for (int c = 0; c < N; c++) if (board[r][c] < 0) { full = false; break; }
            if (full) rows.add(r);
        }
        for (int c = 0; c < N; c++) {
            boolean full = true;
            for (int r = 0; r < N; r++) if (board[r][c] < 0) { full = false; break; }
            if (full) cols.add(c);
        }
        if (rows.isEmpty() && cols.isEmpty()) {
            combo = 0;
            return;
        }
        boolean[][] mark = new boolean[N][N];
        for (int r : rows) for (int c = 0; c < N; c++) mark[r][c] = true;
        for (int c : cols) for (int r = 0; r < N; r++) mark[r][c] = true;
        for (int r = 0; r < N; r++) {
            for (int c = 0; c < N; c++) {
                if (mark[r][c]) {
                    res.clearedCells.add(new int[]{r, c, board[r][c]});
                    board[r][c] = -1;
                }
            }
        }
        int n = rows.size() + cols.size();
        combo++;
        int gain = (int) Math.round(n * n * 100 * (1 + Math.max(0, combo - 1) * 0.25));
        score += gain;
        res.gained += gain;
        res.clearedRows = toArray(rows);
        res.clearedCols = toArray(cols);
    }

    private static int[] toArray(List<Integer> l) {
        int[] a = new int[l.size()];
        for (int i = 0; i < a.length; i++) a[i] = l.get(i);
        return a;
    }

    // ------------------------------------------------------------------ hold & powers

    /** Stores tray piece {@code slot} in HOLD (only when HOLD is empty). */
    public boolean storeInHold(int slot) {
        if (hold != null || slot < 0 || slot > 2 || tray[slot] == null) return false;
        hold = tray[slot];
        tray[slot] = null;
        if (trayCount() == 0) refillTray();
        if (!anyMove() && !over && !levelDone) over = true;
        return true;
    }

    /** Returns the HOLD piece to the first free tray slot. */
    public boolean takeFromHold() {
        if (hold == null) return false;
        for (int i = 0; i < 3; i++) {
            if (tray[i] == null) {
                tray[i] = hold;
                hold = null;
                return true;
            }
        }
        return false;
    }

    public boolean rotateFirst() {
        if (charges[POWER_ROTATE] <= 0) return false;
        for (int i = 0; i < 3; i++) {
            if (tray[i] != null) {
                tray[i] = tray[i].rotated();
                charges[POWER_ROTATE]--;
                return true;
            }
        }
        return false;
    }

    public boolean shuffleTray() {
        if (charges[POWER_SHUFFLE] <= 0) return false;
        charges[POWER_SHUFFLE]--;
        refillTray();
        if (over && anyMove()) over = false;
        return true;
    }

    /** Clears the centre 4x4 block. Returns the cleared cells {r,c,color}. */
    public List<int[]> blast() {
        List<int[]> out = new ArrayList<>();
        if (charges[POWER_BLAST] <= 0) return out;
        for (int r = 3; r < 7; r++) {
            for (int c = 3; c < 7; c++) {
                if (board[r][c] >= 0) {
                    out.add(new int[]{r, c, board[r][c]});
                    board[r][c] = -1;
                }
            }
        }
        if (!out.isEmpty()) {
            charges[POWER_BLAST]--;
            score += out.size() * 8;
            if (over && anyMove()) over = false;
        }
        return out;
    }

    /** Coin "continue": reopens some space after game over. Caller has already taken the coins. */
    public List<int[]> continueGame() {
        List<int[]> occupied = new ArrayList<>(), removed = new ArrayList<>();
        for (int r = 0; r < N; r++) for (int c = 0; c < N; c++) if (board[r][c] >= 0) occupied.add(new int[]{r, c});
        for (int i = occupied.size() - 1; i > 0; i--) {
            int j = rng.nextInt(i + 1);
            int[] t = occupied.get(i);
            occupied.set(i, occupied.get(j));
            occupied.set(j, t);
        }
        int count = Math.min(6, Math.max(3, (int) Math.ceil(occupied.size() * 0.08)));
        for (int i = 0; i < count && i < occupied.size(); i++) {
            int[] o = occupied.get(i);
            removed.add(new int[]{o[0], o[1], board[o[0]][o[1]]});
            board[o[0]][o[1]] = -1;
        }
        combo = 0;
        over = false;
        if (!anyMove()) refillTray();
        return removed;
    }

    public void nextLevel() {
        level++;
        newGame();
    }

    // ------------------------------------------------------------------ persistence

    public String serialize() {
        StringBuilder sb = new StringBuilder();
        sb.append(level).append('|').append(score).append('|').append(combo).append('|');
        sb.append(charges[0]).append(',').append(charges[1]).append(',').append(charges[2]).append('|');
        for (int r = 0; r < N; r++) for (int c = 0; c < N; c++) sb.append((char) ('a' + board[r][c] + 1));
        sb.append('|');
        for (int i = 0; i < 3; i++) sb.append(tray[i] == null ? "-" : tray[i].encode()).append(i < 2 ? "/" : "");
        sb.append('|').append(hold == null ? "-" : hold.encode());
        return sb.toString();
    }

    public static NecpraBlockEngine deserialize(String s, String difficulty) {
        try {
            String[] p = s.split("\\|", -1);
            if (p.length < 7 || p[4].length() != N * N) return null;
            NecpraBlockEngine e = new NecpraBlockEngine(Integer.parseInt(p[0]), difficulty, System.nanoTime());
            e.score = Integer.parseInt(p[1]);
            e.combo = Integer.parseInt(p[2]);
            String[] ch = p[3].split(",");
            for (int i = 0; i < 3; i++) e.charges[i] = Integer.parseInt(ch[i]);
            for (int i = 0; i < N * N; i++) {
                int v = p[4].charAt(i) - 'a' - 1;
                if (v < -1 || v >= COLORS) return null;
                e.board[i / N][i % N] = v;
            }
            String[] tr = p[5].split("/");
            for (int i = 0; i < 3; i++) e.tray[i] = "-".equals(tr[i]) ? null : Piece.decode(tr[i]);
            e.hold = "-".equals(p[6]) ? null : Piece.decode(p[6]);
            e.levelDone = e.score >= e.target();
            e.over = !e.levelDone && !e.anyMove();
            return e;
        } catch (RuntimeException ex) {
            return null;
        }
    }
}
