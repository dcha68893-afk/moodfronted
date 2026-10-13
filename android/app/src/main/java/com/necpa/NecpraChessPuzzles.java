package com.necpa;

/** Mate-in-1 puzzles (same set as the web arcade). Each position was checked offline to have at least one mating move; any mating move solves it. */
public final class NecpraChessPuzzles {
    private NecpraChessPuzzles() {}

    public static final String[] FENS = {
        "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
        "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w - - 0 1",
        "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b - - 0 1",
        "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1",
        "7k/8/5KQ1/8/8/8/8/8 w - - 0 1",
        "k7/8/1K6/8/8/8/8/7R w - - 0 1",
        "7k/5Kp1/8/8/8/8/8/6R1 w - - 0 1",
        "6k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1",
        "4k3/8/4K3/8/8/8/8/R7 w - - 0 1",
        "7k/8/6K1/8/8/8/8/1R6 w - - 0 1",
        "3k4/R7/3K4/8/8/8/8/8 w - - 0 1",
        "k7/2Q5/1K6/8/8/8/8/8 w - - 0 1",
        "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w - - 0 1",
        "6k1/8/6K1/8/8/8/8/7Q w - - 0 1",
        "7k/8/6K1/8/8/8/Q7/8 w - - 0 1",
        "1k6/ppp5/8/8/8/8/8/1K1R4 w - - 0 1",
        "r5k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
        "2k5/8/2K5/8/8/8/8/7R w - - 0 1",
        "k1K5/8/8/8/8/8/8/1R6 w - - 0 1"
    };

    public static int count() { return FENS.length; }

    public static String fen(int idx) { return FENS[((idx % FENS.length) + FENS.length) % FENS.length]; }

    /** Same puzzle for everyone on a given day. */
    public static int dayIndex(String yyyyMmDd) {
        long h = 0;
        for (int i = 0; i < yyyyMmDd.length(); i++) h = (h * 31 + yyyyMmDd.charAt(i)) & 0xFFFFFFFFL;
        return (int) (h % FENS.length);
    }

    /** True when {@code m} played in {@code s} checkmates. */
    public static boolean mates(NecpraChessEngine.State s, NecpraChessEngine.Move m) {
        NecpraChessEngine.State n = NecpraChessEngine.make(s, m);
        return NecpraChessEngine.inCheck(n) && NecpraChessEngine.legal(n).isEmpty();
    }
}
