package com.necpa;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Native arcade save data: coin wallet, per-game level progress, streak, settings and resume snapshots.
 *
 * The web arcade keeps its wallet in localStorage ({@code moodArcadeV3.coins}). To keep ONE balance across the web and
 * native games, the web layer hands its current balance over when it opens a native game ({@link #adoptWeb}); every
 * change made natively is flagged {@code dirty} and returned to the web layer when the native screen closes (or,
 * if the app was killed first, the next time the web arcade starts).
 */
public final class NecpraGameStore {
    static final String PREFS = "necpra_native_games";
    public static final int DEFAULT_COINS = 1200;
    private static final String[] GAMES = {"water", "block", "trivia", "crossword", "chess", "daily"};

    private final SharedPreferences p;

    public NecpraGameStore(Context ctx) {
        p = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ------------------------------------------------------------------ wallet

    public synchronized int coins() { return p.getInt("coins", DEFAULT_COINS); }

    public synchronized int add(int n) {
        if (n <= 0) return coins();
        int c = (int) Math.min(Integer.MAX_VALUE, (long) coins() + n);
        p.edit().putInt("coins", c).putBoolean("dirty", true).apply();
        return c;
    }

    /** Takes coins only when the balance covers them. */
    public synchronized boolean spend(int n) {
        if (n <= 0) return true;
        int c = coins();
        if (c < n) return false;
        p.edit().putInt("coins", c - n).putBoolean("dirty", true).apply();
        return true;
    }

    /** Web balance handed over when a native game opens; native becomes the owner until it hands it back. */
    public synchronized void adoptWeb(int coins, int games, int best, int ignoredWebStreak) {
        // The web "streak" counts level wins; the native streak counts consecutive daily challenges, so it is not adopted.
        SharedPreferences.Editor e = p.edit();
        if (coins >= 0) e.putInt("coins", coins);
        if (games >= 0) e.putInt("games", Math.max(games, p.getInt("games", 0)));
        if (best >= 0) e.putInt("best", Math.max(best, p.getInt("best", 0)));
        e.putBoolean("dirty", false).apply();
    }

    public synchronized boolean dirty() { return p.getBoolean("dirty", false); }

    public synchronized void markClean() { p.edit().putBoolean("dirty", false).apply(); }

    public synchronized JSONObject snapshot() {
        JSONObject o = new JSONObject();
        try {
            o.put("coins", coins());
            o.put("games", p.getInt("games", 0));
            o.put("best", p.getInt("best", 0));
            o.put("streak", p.getInt("streak", 0));
            o.put("dirty", dirty());
        } catch (Exception ignored) { }
        return o;
    }

    public synchronized long serverSeen() { return p.getLong("serverSeen", -1L); }

    /** Takes the web wallet's last-seen server balance when it is ahead, so a purchase is never credited twice. */
    public synchronized void adoptServerSeen(long v) {
        if (v >= 0 && v > serverSeen()) setServerSeen(v);
    }

    public synchronized void setServerSeen(long v) { p.edit().putLong("serverSeen", v).apply(); }

    // ------------------------------------------------------------------ progress

    public synchronized int level(String game) { return Math.max(1, p.getInt("lv." + game, 1)); }

    /** Takes the web arcade's level when it is further along than the native one (never moves backwards). */
    public synchronized void adoptLevel(String game, int lv) {
        if (lv > level(game)) p.edit().putInt("lv." + game, lv).apply();
    }

    /** {"water":7,"block":3,...} for handing back to the web arcade. */
    public synchronized JSONObject levelsJson() {
        JSONObject o = new JSONObject();
        try {
            for (String g : GAMES) o.put(g, level(g));
        } catch (Exception ignored) { }
        return o;
    }

    public synchronized void setLevel(String game, int lv) { p.edit().putInt("lv." + game, Math.max(1, lv)).apply(); }

    /** Records a finished game: counts it, tracks the best score and raises the stored level when beaten. */
    public synchronized void recordGame(String game, int score, int levelReached) {
        SharedPreferences.Editor e = p.edit();
        e.putInt("games", p.getInt("games", 0) + 1);
        if (score > p.getInt("best", 0)) e.putInt("best", score);
        if (score > p.getInt("bs." + game, 0)) e.putInt("bs." + game, score);
        if (levelReached > p.getInt("lv." + game, 1)) e.putInt("lv." + game, levelReached);
        e.putBoolean("dirty", true).apply();
    }

    public synchronized int bestScore(String game) { return p.getInt("bs." + game, 0); }

    public synchronized int stars(String game, int level) { return p.getInt("st." + game + "." + level, 0); }

    public synchronized void setStars(String game, int level, int stars) {
        if (stars > stars(game, level)) p.edit().putInt("st." + game + "." + level, stars).apply();
    }

    // ------------------------------------------------------------------ daily challenge

    public static String today() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date());
    }

    public static String yesterday() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(System.currentTimeMillis() - 86400000L));
    }

    public synchronized boolean dailyDone() { return today().equals(p.getString("dailyDone", "")); }

    public synchronized int streak() {
        String last = p.getString("dailyDone", "");
        if (today().equals(last) || yesterday().equals(last)) return p.getInt("streak", 0);
        return 0;
    }

    /** Completes today's challenge once; returns the new streak (0 when it was already done today). */
    public synchronized int completeDaily() {
        if (dailyDone()) return 0;
        int s = (yesterday().equals(p.getString("dailyDone", "")) ? p.getInt("streak", 0) : 0) + 1;
        p.edit().putString("dailyDone", today()).putInt("streak", s).putBoolean("dirty", true).apply();
        return s;
    }

    // ------------------------------------------------------------------ word connect extras

    public synchronized int wordHints() { return Math.max(0, Math.min(NecpraWordEngine.MAX_HINTS, p.getInt("wordHints", 3))); }

    public synchronized void setWordHints(int n) { p.edit().putInt("wordHints", Math.max(0, Math.min(NecpraWordEngine.MAX_HINTS, n))).apply(); }

    /** Free word-list peeks left today (resets each UTC day). */
    public synchronized int freeWordListOpens() {
        if (!today().equals(p.getString("wlDay", ""))) return NecpraWordEngine.FREE_WORD_LIST_OPENS;
        return Math.max(0, NecpraWordEngine.FREE_WORD_LIST_OPENS - p.getInt("wlUsed", 0));
    }

    public synchronized void useWordListOpen() {
        String t = today();
        int used = t.equals(p.getString("wlDay", "")) ? p.getInt("wlUsed", 0) : 0;
        p.edit().putString("wlDay", t).putInt("wlUsed", used + 1).apply();
    }

    // ------------------------------------------------------------------ settings

    public boolean sound() { return p.getBoolean("sound", true); }

    public void setSound(boolean v) { p.edit().putBoolean("sound", v).apply(); }

    public boolean haptics() { return p.getBoolean("haptics", true); }

    public void setHaptics(boolean v) { p.edit().putBoolean("haptics", v).apply(); }

    public String triviaSubject() { return p.getString("triviaSubject", "mixed"); }

    public void setTriviaSubject(String s) { p.edit().putString("triviaSubject", s).apply(); }

    public String difficulty() { return p.getString("difficulty", "moderate"); }

    public void setDifficulty(String d) { p.edit().putString("difficulty", d).apply(); }

    public String chessLevel() { return p.getString("chessLevel", "medium"); }

    public void setChessLevel(String d) { p.edit().putString("chessLevel", d).apply(); }

    // ------------------------------------------------------------------ resume snapshots

    public synchronized void saveResume(String game, String data) {
        if (data == null) p.edit().remove("rs." + game).apply();
        else p.edit().putString("rs." + game, data).apply();
    }

    public synchronized String resume(String game) { return p.getString("rs." + game, null); }

    public static String[] games() { return GAMES.clone(); }
}
