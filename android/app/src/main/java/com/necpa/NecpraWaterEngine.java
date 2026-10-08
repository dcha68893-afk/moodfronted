package com.necpa;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.PriorityQueue;

/**
 * Water Sort rules engine (pure Java, no Android imports so it is unit-testable).
 *
 * Differences from the old web version, on purpose:
 *  - every generated level is PROVEN solvable by a real solver before it is shown;
 *  - hints are the next step of an actual solution, not a local guess;
 *  - the same seeded generator still gives every player the same Daily Challenge for a given date.
 */
public final class NecpraWaterEngine {
    public static final int CAP = 4;
    public static final int MAX_COLORS = 12;

    /** One pour. */
    public static final class Move {
        public final int from, to, color, amount;

        Move(int from, int to, int color, int amount) {
            this.from = from;
            this.to = to;
            this.color = color;
            this.amount = amount;
        }
    }

    // ------------------------------------------------------------------ state

    private int[][] tubes;   // tubes[i][0..len[i]-1], index 0 is the bottom
    private int[] len;
    private final ArrayDeque<int[][]> history = new ArrayDeque<>();
    private final ArrayDeque<int[]> historyLen = new ArrayDeque<>();
    private int moves, score;
    private boolean extraTubeUsed;
    private final int level;
    private final int colors;

    private List<int[]> cachedSolution; // remaining solution from current state (from,to pairs), or null
    private boolean solutionDirty = true;

    private NecpraWaterEngine(int level, int colors, int[][] tubes, int[] len) {
        this.level = level;
        this.colors = colors;
        this.tubes = tubes;
        this.len = len;
    }

    public int level() { return level; }
    public int colorCount() { return colors; }
    public int tubeCount() { return tubes.length; }
    public int moves() { return moves; }
    public int score() { return score; }
    public boolean extraTubeUsed() { return extraTubeUsed; }
    public int length(int tube) { return len[tube]; }
    public int colorAt(int tube, int slot) { return tubes[tube][slot]; }
    public int top(int tube) { return len[tube] == 0 ? -1 : tubes[tube][len[tube] - 1]; }
    public boolean canUndo() { return !history.isEmpty(); }

    public int topRun(int tube) {
        int n = len[tube];
        if (n == 0) return 0;
        int c = tubes[tube][n - 1], r = 1;
        for (int k = n - 2; k >= 0 && tubes[tube][k] == c; k--) r++;
        return r;
    }

    // ------------------------------------------------------------------ rules

    public boolean legal(int from, int to) {
        if (from == to || from < 0 || to < 0 || from >= tubes.length || to >= tubes.length) return false;
        if (len[from] == 0 || len[to] >= CAP) return false;
        return len[to] == 0 || tubes[to][len[to] - 1] == tubes[from][len[from] - 1];
    }

    /** A legal pour that actually changes something (pouring a uniform tube into an empty one does not). */
    public boolean useful(int from, int to) {
        if (!legal(from, to)) return false;
        if (len[to] == 0 && topRun(from) == len[from]) return false;
        return true;
    }

    public boolean hasMove() {
        for (int i = 0; i < tubes.length; i++) for (int j = 0; j < tubes.length; j++) if (useful(i, j)) return true;
        return false;
    }

    public boolean isSolved() {
        for (int i = 0; i < tubes.length; i++) {
            if (len[i] == 0) continue;
            if (len[i] != CAP) return false;
            for (int k = 1; k < CAP; k++) if (tubes[i][k] != tubes[i][0]) return false;
        }
        return true;
    }

    /** Pours; returns null when the move is not legal. */
    public Move pour(int from, int to) {
        if (!legal(from, to)) return null;
        int c = top(from);
        int amount = Math.min(topRun(from), CAP - len[to]);
        history.push(snapshot());
        historyLen.push(len.clone());
        len[from] -= amount;
        for (int k = 0; k < amount; k++) tubes[to][len[to]++] = c;
        moves++;
        score += amount * 25;
        solutionDirty = true;
        return new Move(from, to, c, amount);
    }

    public boolean undo() {
        if (history.isEmpty()) return false;
        int[][] t = history.pop();
        int[] l = historyLen.pop();
        // an undo may need to drop an added extra tube
        tubes = t;
        len = l;
        moves = Math.max(0, moves - 1);
        score = Math.max(0, score - 25);
        solutionDirty = true;
        return true;
    }

    /** Adds one empty tube once per level. */
    public boolean addTube() {
        if (extraTubeUsed || isSolved()) return false;
        int n = tubes.length;
        int[][] t = new int[n + 1][CAP];
        int[] l = new int[n + 1];
        for (int i = 0; i < n; i++) {
            System.arraycopy(tubes[i], 0, t[i], 0, CAP);
            l[i] = len[i];
        }
        tubes = t;
        len = l;
        extraTubeUsed = true;
        // earlier history snapshots have fewer tubes; keep undo consistent by clearing it
        history.clear();
        historyLen.clear();
        solutionDirty = true;
        return true;
    }

    /** Move count that earns three stars on a level. */
    public static int parFor(int level) { return Math.max(8, 8 + level * 2); }

    public int stars() {
        int par = parFor(level);
        return moves <= par ? 3 : (moves <= (int) Math.ceil(par * 1.5) ? 2 : 1);
    }

    private int[][] snapshot() {
        int[][] s = new int[tubes.length][];
        for (int i = 0; i < tubes.length; i++) s[i] = tubes[i].clone();
        return s;
    }

    // ------------------------------------------------------------------ hints

    /** Next move of a real solution from the current position, or null when none exists / none found in budget. */
    public int[] hint() {
        if (isSolved()) return null;
        if (solutionDirty || cachedSolution == null || cachedSolution.isEmpty()) {
            cachedSolution = solve(tubes, len, 250_000);
            solutionDirty = false;
        }
        if (cachedSolution == null || cachedSolution.isEmpty()) return null;
        int[] m = cachedSolution.get(0);
        return legal(m[0], m[1]) ? m : null;
    }

    /** True when the position can still be solved (bounded search). */
    public boolean solvable() {
        return isSolved() || solve(tubes, len, 250_000) != null;
    }

    // ------------------------------------------------------------------ generation

    public static final class Params {
        public int level = 1;
        public String difficulty = "moderate"; // easy | moderate | hard
        public long seed;                      // 0 = derive from level
        public int scrambleSteps = -1;         // -1 = derive from level
        public int colorOverride = -1;
    }

    public static NecpraWaterEngine generate(Params p) {
        int level = Math.max(1, p.level);
        int base = "easy".equals(p.difficulty) ? 3 : ("hard".equals(p.difficulty) ? 5 : 4);
        int n = p.colorOverride > 0 ? p.colorOverride : Math.min(base + (level - 1) / 3, "hard".equals(p.difficulty) ? 10 : 9);
        n = Math.min(n, MAX_COLORS);
        int steps = p.scrambleSteps > 0 ? p.scrambleSteps : 18 + Math.min(80, level * 4);
        long seed0 = p.seed != 0 ? p.seed : (0x9e3779b9L ^ level);
        NecpraWaterEngine best = null;
        for (int attempt = 0; attempt < 40; attempt++) {
            long seed = seed0 + attempt * 0x1234567L;
            NecpraWaterEngine e = scramble(level, n, steps, seed);
            if (e.isSolved()) continue; // scramble ended where it began
            if (e.solve(e.tubes, e.len, 120_000) != null) return e;
            if (best == null) best = e;
        }
        // Practically unreachable; fall back to a trivially solvable layout rather than failing.
        return best != null ? easyFallback(level, n) : easyFallback(level, n);
    }

    private static NecpraWaterEngine easyFallback(int level, int n) {
        int[][] t = new int[n + 2][CAP];
        int[] l = new int[n + 2];
        // two colours swapped between tubes: always solvable with the empty tubes
        for (int c = 0; c < n; c++) {
            Arrays.fill(t[c], c);
            l[c] = CAP;
        }
        if (n >= 2) {
            int a = t[0][CAP - 1];
            t[0][CAP - 1] = t[1][CAP - 1];
            t[1][CAP - 1] = a;
        }
        return new NecpraWaterEngine(level, n, t, l);
    }

    /** Same mulberry32 generator as the web arcade, so seeds mean the same thing on both. */
    static final class Rng {
        private int a;

        Rng(long seed) { this.a = (int) seed; }

        double next() {
            a += 0x6D2B79F5;
            int t = a;
            t = (t ^ (t >>> 15)) * (t | 1);
            t ^= t + (t ^ (t >>> 7)) * (t | 61);
            return ((t ^ (t >>> 14)) & 0xFFFFFFFFL) / 4294967296.0;
        }
    }

    private static NecpraWaterEngine scramble(int level, int n, int steps, long seed) {
        int total = n + 2;
        int[][] t = new int[total][CAP];
        int[] l = new int[total];
        for (int c = 0; c < n; c++) {
            Arrays.fill(t[c], c);
            l[c] = CAP;
        }
        Rng r = new Rng(seed);
        int lastFrom = -1, lastTo = -1;
        int[] cf = new int[total * total * CAP], ct = new int[total * total * CAP], ca = new int[total * total * CAP];
        for (int s = 0; s < steps; s++) {
            int cn = 0;
            for (int i = 0; i < total; i++) {
                if (l[i] == 0) continue;
                int top = t[i][l[i] - 1], run = 1;
                for (int k = l[i] - 2; k >= 0 && t[i][k] == top; k--) run++;
                for (int j = 0; j < total; j++) {
                    if (i == j || l[j] >= CAP) continue;
                    if (lastFrom == j && lastTo == i) continue;
                    for (int amount = 1; amount <= run && amount + l[j] <= CAP; amount++) {
                        cf[cn] = i;
                        ct[cn] = j;
                        ca[cn] = amount;
                        cn++;
                    }
                }
            }
            if (cn == 0) break;
            int pick = (int) Math.floor(r.next() * cn);
            int from = cf[pick], to = ct[pick], amount = ca[pick];
            for (int k = 0; k < amount; k++) {
                int c = t[from][--l[from]];
                t[to][l[to]++] = c;
            }
            lastFrom = from;
            lastTo = to;
        }
        return new NecpraWaterEngine(level, n, t, l);
    }

    // ------------------------------------------------------------------ solver

    private static final class Node {
        final int[][] tubes;
        final int[] len;
        final Node parent;
        final int from, to, g;

        Node(int[][] tubes, int[] len, Node parent, int from, int to, int g) {
            this.tubes = tubes;
            this.len = len;
            this.parent = parent;
            this.from = from;
            this.to = to;
            this.g = g;
        }
    }

    private static String key(int[][] t, int[] l) {
        String[] parts = new String[t.length];
        for (int i = 0; i < t.length; i++) {
            char[] ch = new char[l[i]];
            for (int k = 0; k < l[i]; k++) ch[k] = (char) ('a' + t[i][k]);
            parts[i] = new String(ch);
        }
        Arrays.sort(parts);
        StringBuilder sb = new StringBuilder();
        for (String p : parts) sb.append(p).append('|');
        return sb.toString();
    }

    private static int heuristic(int[][] t, int[] l) {
        // each colour boundary inside a tube and each non-finished tube costs something
        int h = 0;
        for (int i = 0; i < t.length; i++) {
            if (l[i] == 0) continue;
            int changes = 0;
            for (int k = 1; k < l[i]; k++) if (t[i][k] != t[i][k - 1]) changes++;
            h += changes * 3;
            if (changes == 0 && l[i] < CAP) h += 1;
        }
        return h;
    }

    private static boolean solved(int[][] t, int[] l) {
        for (int i = 0; i < t.length; i++) {
            if (l[i] == 0) continue;
            if (l[i] != CAP) return false;
            for (int k = 1; k < CAP; k++) if (t[i][k] != t[i][0]) return false;
        }
        return true;
    }

    /** Weighted best-first search. Returns the list of {from,to} pours or null if none found within the budget. */
    static List<int[]> solve(int[][] startT, int[] startL, int nodeCap) {
        int[][] t0 = new int[startT.length][];
        for (int i = 0; i < startT.length; i++) t0[i] = startT[i].clone();
        int[] l0 = startL.clone();
        if (solved(t0, l0)) return new ArrayList<>();
        PriorityQueue<long[]> pq = new PriorityQueue<>((a, b) -> Long.compare(a[0], b[0]));
        List<Node> nodes = new ArrayList<>();
        HashMap<String, Integer> seen = new HashMap<>();
        Node root = new Node(t0, l0, null, -1, -1, 0);
        nodes.add(root);
        seen.put(key(t0, l0), 0);
        pq.add(new long[]{heuristic(t0, l0), 0});
        int expanded = 0;
        while (!pq.isEmpty() && expanded < nodeCap) {
            long[] top = pq.poll();
            Node cur = nodes.get((int) top[1]);
            expanded++;
            int n = cur.tubes.length;
            for (int i = 0; i < n; i++) {
                if (cur.len[i] == 0) continue;
                int c = cur.tubes[i][cur.len[i] - 1], run = 1;
                for (int k = cur.len[i] - 2; k >= 0 && cur.tubes[i][k] == c; k--) run++;
                boolean uniform = run == cur.len[i];
                boolean emptyTried = false;
                for (int j = 0; j < n; j++) {
                    if (i == j || cur.len[j] >= CAP) continue;
                    if (cur.len[j] == 0) {
                        if (uniform || emptyTried) continue; // pointless, or identical to another empty target
                        emptyTried = true;
                    } else if (cur.tubes[j][cur.len[j] - 1] != c) continue;
                    int amount = Math.min(run, CAP - cur.len[j]);
                    int[][] nt = new int[n][];
                    for (int k = 0; k < n; k++) nt[k] = cur.tubes[k].clone();
                    int[] nl = cur.len.clone();
                    nl[i] -= amount;
                    for (int k = 0; k < amount; k++) nt[j][nl[j]++] = c;
                    String ks = key(nt, nl);
                    Integer prev = seen.get(ks);
                    int g = cur.g + 1;
                    if (prev != null && nodes.get(prev).g <= g) continue;
                    Node nn = new Node(nt, nl, cur, i, j, g);
                    nodes.add(nn);
                    int id = nodes.size() - 1;
                    seen.put(ks, id);
                    if (solved(nt, nl)) {
                        ArrayList<int[]> path = new ArrayList<>();
                        for (Node x = nn; x.parent != null; x = x.parent) path.add(0, new int[]{x.from, x.to});
                        return path;
                    }
                    pq.add(new long[]{(long) g + 3L * heuristic(nt, nl), id});
                }
            }
        }
        return null;
    }

    // ------------------------------------------------------------------ persistence (resume)

    public String serialize() {
        StringBuilder sb = new StringBuilder();
        sb.append(level).append(';').append(colors).append(';').append(moves).append(';').append(score).append(';').append(extraTubeUsed ? 1 : 0).append(';');
        for (int i = 0; i < tubes.length; i++) {
            for (int k = 0; k < len[i]; k++) sb.append((char) ('a' + tubes[i][k]));
            sb.append(i + 1 < tubes.length ? "," : "");
        }
        return sb.toString();
    }

    public static NecpraWaterEngine deserialize(String s) {
        try {
            String[] p = s.split(";", -1);
            if (p.length < 6) return null;
            int level = Integer.parseInt(p[0]), colors = Integer.parseInt(p[1]);
            String[] ts = p[5].split(",", -1);
            if (ts.length < 3 || ts.length > MAX_COLORS + 4) return null;
            int[][] t = new int[ts.length][CAP];
            int[] l = new int[ts.length];
            for (int i = 0; i < ts.length; i++) {
                if (ts[i].length() > CAP) return null;
                for (int k = 0; k < ts[i].length(); k++) {
                    int c = ts[i].charAt(k) - 'a';
                    if (c < 0 || c >= MAX_COLORS) return null;
                    t[i][k] = c;
                }
                l[i] = ts[i].length();
            }
            NecpraWaterEngine e = new NecpraWaterEngine(level, colors, t, l);
            e.moves = Integer.parseInt(p[2]);
            e.score = Integer.parseInt(p[3]);
            e.extraTubeUsed = "1".equals(p[4]);
            return e;
        } catch (RuntimeException ex) {
            return null;
        }
    }
}
