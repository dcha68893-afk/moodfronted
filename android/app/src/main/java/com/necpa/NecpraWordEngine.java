package com.necpa;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * Word Connect rules engine (pure Java): a letter wheel, a crossword-shaped board, swipe-to-spell input
 * logic (the touch handling lives in the Activity). Levels are the same 45 baked-in puzzles as the web arcade,
 * and the game is endless: after the last puzzle it laps back to the first with a higher level number.
 */
public final class NecpraWordEngine {
    public static final int LEVEL_COUNT = NecpraGameData.WORDS.length;
    public static final int FREE_WORD_LIST_OPENS = 2;
    public static final int WORD_LIST_COST = 50;
    public static final int MAX_HINTS = 5;

    public static final class Placed {
        public final String word;
        public final int r, c;
        public final boolean across;

        Placed(String word, int r, int c, boolean across) {
            this.word = word;
            this.r = r;
            this.c = c;
            this.across = across;
        }

        public int rowAt(int i) { return r + (across ? 0 : i); }

        public int colAt(int i) { return c + (across ? i : 0); }
    }

    public static final class Level {
        public final String root;
        public final char[] letters;       // upper case
        public final List<String> words;
        public final List<Placed> placed;
        public final int h, w;

        Level(String root, char[] letters, List<String> words, List<Placed> placed, int h, int w) {
            this.root = root;
            this.letters = letters;
            this.words = words;
            this.placed = placed;
            this.h = h;
            this.w = w;
        }
    }

    private static Level[] LEVELS;

    public static synchronized Level level(int idx) {
        if (LEVELS == null) {
            Level[] l = new Level[LEVEL_COUNT];
            for (int i = 0; i < LEVEL_COUNT; i++) l[i] = parse(NecpraGameData.WORDS[i]);
            LEVELS = l;
        }
        return LEVELS[((idx % LEVEL_COUNT) + LEVEL_COUNT) % LEVEL_COUNT];
    }

    private static Level parse(String row) {
        String[] p = row.split("\t");
        List<String> words = new ArrayList<>();
        Collections.addAll(words, p[2].split(","));
        List<Placed> placed = new ArrayList<>();
        for (String item : p[3].split(";")) {
            String[] q = item.split(":");
            placed.add(new Placed(q[0], Integer.parseInt(q[1]), Integer.parseInt(q[2]), "A".equals(q[3])));
        }
        return new Level(p[0], p[1].toUpperCase().toCharArray(), words, placed, Integer.parseInt(p[4]), Integer.parseInt(p[5]));
    }

    public enum Submit { NEW_WORD, ALREADY_FOUND, NOT_IN_PUZZLE, TOO_SHORT }

    // ------------------------------------------------------------------ state

    private int idx, lap, hints;
    private Level lv;
    private final Set<String> found = new HashSet<>();
    private final Set<Integer> hinted = new HashSet<>();  // cells revealed by hints: r*100+c
    private int[] wheel;                                  // wheel[position] = letter index
    private boolean complete;
    private int coinsEarned;
    private final Random rnd = new Random();

    public NecpraWordEngine(int endlessLevel, int hints) {
        int n = Math.max(1, endlessLevel) - 1;
        this.idx = n % LEVEL_COUNT;
        this.lap = n / LEVEL_COUNT;
        this.hints = Math.max(0, Math.min(MAX_HINTS, hints));
        load();
    }

    private void load() {
        lv = level(idx);
        found.clear();
        hinted.clear();
        complete = false;
        wheel = new int[lv.letters.length];
        for (int i = 0; i < wheel.length; i++) wheel[i] = i;
        shuffleWheel();
    }

    public Level current() { return lv; }
    public int endlessLevel() { return lap * LEVEL_COUNT + idx + 1; }
    public int hints() { return hints; }
    public boolean isComplete() { return complete; }
    public int foundCount() { return found.size(); }
    public int totalWords() { return lv.words.size(); }
    public boolean isFound(String w) { return found.contains(w); }
    public int coinsEarned() { return coinsEarned; }
    public char wheelLetter(int pos) { return lv.letters[wheel[pos]]; }
    public int wheelSize() { return wheel.length; }

    public void shuffleWheel() {
        for (int i = wheel.length - 1; i > 0; i--) {
            int j = rnd.nextInt(i + 1);
            int t = wheel[i];
            wheel[i] = wheel[j];
            wheel[j] = t;
        }
    }

    /** True when the cell is part of any placed word. */
    public boolean isBoardCell(int r, int c) { return letterAt(r, c) != 0; }

    public char letterAt(int r, int c) {
        for (Placed p : lv.placed) {
            for (int i = 0; i < p.word.length(); i++) if (p.rowAt(i) == r && p.colAt(i) == c) return p.word.charAt(i);
        }
        return 0;
    }

    /** A cell is revealed when any found word passes through it, or a hint uncovered it. */
    public boolean isRevealed(int r, int c) {
        if (hinted.contains(r * 100 + c)) return true;
        for (Placed p : lv.placed) {
            if (!found.contains(p.word)) continue;
            for (int i = 0; i < p.word.length(); i++) if (p.rowAt(i) == r && p.colAt(i) == c) return true;
        }
        return false;
    }

    public boolean couldBecome(String prefix) {
        for (String w : lv.words) if (!found.contains(w) && w.startsWith(prefix)) return true;
        return false;
    }

    public Submit submit(String word) {
        word = word.toUpperCase();
        if (word.length() < 3) return Submit.TOO_SHORT;
        if (found.contains(word)) return Submit.ALREADY_FOUND;
        if (!lv.words.contains(word)) return Submit.NOT_IN_PUZZLE;
        found.add(word);
        coinsEarned += 10 * word.length();
        if (found.size() >= lv.words.size()) complete = true;
        return Submit.NEW_WORD;
    }

    public static int wordCoins(String word) { return 10 * word.length(); }

    /** Reveals one hidden cell of a not-yet-found word (shortest word first). Returns {row,col} or null. */
    public int[] useHint() {
        if (hints <= 0 || complete) return null;
        List<String> remaining = new ArrayList<>();
        for (String w : lv.words) if (!found.contains(w)) remaining.add(w);
        if (remaining.isEmpty()) return null;
        Collections.sort(remaining, (a, b) -> Integer.compare(a.length(), b.length()));
        for (String w : remaining) {
            for (Placed p : lv.placed) {
                if (!p.word.equals(w)) continue;
                for (int i = 0; i < w.length(); i++) {
                    int r = p.rowAt(i), c = p.colAt(i);
                    if (!isRevealed(r, c)) {
                        hinted.add(r * 100 + c);
                        hints--;
                        return new int[]{r, c};
                    }
                }
            }
        }
        return null;
    }

    /** Level-complete reward: escalating bonus on later laps, plus one hint (capped). */
    public int completeBonus() { return 250 + lap * 50; }

    public void grantCompleteRewards() { hints = Math.min(MAX_HINTS, hints + 1); }

    /** Advances to the next puzzle (laps back to puzzle 1 after the last). */
    public void next() {
        if (idx + 1 >= LEVEL_COUNT) lap++;
        idx = (idx + 1) % LEVEL_COUNT;
        coinsEarned = 0;
        load();
    }

    /** Words in this level grouped by length, for the word-list dialog. */
    public Map<Integer, List<String>> wordsByLength() {
        Map<Integer, List<String>> m = new HashMap<>();
        for (String w : lv.words) {
            List<String> l = m.get(w.length());
            if (l == null) {
                l = new ArrayList<>();
                m.put(w.length(), l);
            }
            l.add(w);
        }
        return m;
    }

    // ------------------------------------------------------------------ persistence

    public String serialize() {
        StringBuilder sb = new StringBuilder();
        sb.append(endlessLevel()).append('|').append(hints).append('|');
        sb.append(String.join(",", found)).append('|');
        StringBuilder h = new StringBuilder();
        for (int cell : hinted) h.append(cell).append(',');
        sb.append(h);
        return sb.toString();
    }

    public static NecpraWordEngine deserialize(String s) {
        try {
            String[] p = s.split("\\|", -1);
            NecpraWordEngine e = new NecpraWordEngine(Integer.parseInt(p[0]), Integer.parseInt(p[1]));
            if (!p[2].isEmpty()) for (String w : p[2].split(",")) if (e.lv.words.contains(w)) e.found.add(w);
            if (p.length > 3 && !p[3].isEmpty()) for (String c : p[3].split(",")) if (!c.isEmpty()) e.hinted.add(Integer.parseInt(c));
            if (e.found.size() >= e.lv.words.size()) e.found.clear(); // a finished puzzle must not reload pre-solved
            return e;
        } catch (RuntimeException ex) {
            return null;
        }
    }
}
