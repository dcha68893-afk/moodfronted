package com.necpa;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

/**
 * Trivia Master rules engine (pure Java). Same level structure as the web arcade (8 questions per level, harder
 * tiers as the level rises, shorter timers) with a larger question bank, explicit subjects and per-question option
 * shuffling so the right answer is not always in the same slot.
 */
public final class NecpraTriviaEngine {
    public static final int QUESTIONS_PER_LEVEL = 8;
    public static final String[] SUBJECTS = {"mixed", "general", "science", "math", "geography", "history", "kenya", "tech"};

    public static final class Question {
        public final int id;
        public final String subject;
        public final int tier;
        public final String text;
        public final String[] options;   // already shuffled for display
        public final int correct;        // index into options

        Question(int id, String subject, int tier, String text, String[] options, int correct) {
            this.id = id;
            this.subject = subject;
            this.tier = tier;
            this.text = text;
            this.options = options;
            this.correct = correct;
        }

        public String correctText() { return options[correct]; }
    }

    /** Raw bank row. */
    private static final class Raw {
        final int id;
        final String subject;
        final int tier;
        final String text;
        final String[] opts;
        final int correct;

        Raw(int id, String subject, int tier, String text, String[] opts, int correct) {
            this.id = id;
            this.subject = subject;
            this.tier = tier;
            this.text = text;
            this.opts = opts;
            this.correct = correct;
        }
    }

    private static List<Raw> BANK;

    private static synchronized List<Raw> bank() {
        if (BANK == null) {
            List<Raw> b = new ArrayList<>();
            String[] rows = NecpraGameData.TRIVIA;
            for (int i = 0; i < rows.length; i++) {
                String[] p = rows[i].split("\t");
                if (p.length != 8) continue;
                b.add(new Raw(i, p[0], Integer.parseInt(p[1]), p[3], new String[]{p[4], p[5], p[6], p[7]}, Integer.parseInt(p[2])));
            }
            BANK = b;
        }
        return BANK;
    }

    public static int bankSize() { return bank().size(); }

    public static int bankSize(String subject) {
        int n = 0;
        for (Raw r : bank()) if ("mixed".equals(subject) || r.subject.equals(subject)) n++;
        return n;
    }

    // ------------------------------------------------------------------ state

    private final int level;
    private final String subject, difficulty;
    private final List<Question> questions = new ArrayList<>();
    private int index, score, streak, correctCount;
    private boolean usedFifty, usedSkip, usedHint;
    private boolean[] hidden = new boolean[4];
    private boolean answered;
    private int lastPicked = -1;

    public static final class AnswerResult {
        public boolean correct;
        public int scoreGain;
        public int coinsGain;
        public int streak;
        public int correctIndex;
        public boolean timedOut;
    }

    public NecpraTriviaEngine(int level, String subject, String difficulty, long seed, boolean competitive) {
        this.level = Math.max(1, level);
        this.subject = Arrays.asList(SUBJECTS).contains(subject) ? subject : "mixed";
        this.difficulty = difficulty == null ? "moderate" : difficulty;
        List<Raw> picked = competitive ? competitiveSet(this.level, this.subject, seed) : tieredSet(this.level, this.subject, new Random(seed));
        Random shuf = new Random(seed ^ 0x5DEECE66DL);
        for (Raw r : picked) questions.add(shuffleOptions(r, shuf));
    }

    private NecpraTriviaEngine(int level, String subject, String difficulty) {
        this.level = level;
        this.subject = subject;
        this.difficulty = difficulty;
    }

    private static Question shuffleOptions(Raw r, Random rnd) {
        Integer[] order = {0, 1, 2, 3};
        for (int i = 3; i > 0; i--) {
            int j = rnd.nextInt(i + 1);
            Integer t = order[i];
            order[i] = order[j];
            order[j] = t;
        }
        String[] o = new String[4];
        int c = 0;
        for (int i = 0; i < 4; i++) {
            o[i] = r.opts[order[i]];
            if (order[i] == r.correct) c = i;
        }
        return new Question(r.id, r.subject, r.tier, r.text, o, c);
    }

    // ------------------------------------------------------------------ question selection

    /** Tier mix shifts from mostly easy to a harder blend over about 15 levels, always keeping a floor of easy ones. */
    static double[] tierWeights(int level) {
        double hardness = Math.min(1.0, (level - 1) / 14.0);
        return new double[]{Math.max(.18, .7 - hardness * .52), .3 + hardness * .05, Math.min(.55, hardness * .62)};
    }

    private static List<Raw> source(String subject) {
        List<Raw> s = new ArrayList<>();
        for (Raw r : bank()) if ("mixed".equals(subject) || r.subject.equals(subject)) s.add(r);
        if (s.isEmpty()) s.addAll(bank());
        return s;
    }

    private static List<Raw> tieredSet(int level, String subject, Random rnd) {
        List<Raw> src = source(subject);
        double[] w = tierWeights(level);
        List<Raw> out = new ArrayList<>();
        Set<Integer> seen = new HashSet<>();
        for (int i = 0; i < QUESTIONS_PER_LEVEL; i++) {
            List<Raw> unused = new ArrayList<>();
            for (Raw r : src) if (!seen.contains(r.id)) unused.add(r);
            List<Raw> pool = unused.isEmpty() ? src : unused;
            double r0 = rnd.nextDouble();
            int tier = r0 < w[0] ? 1 : (r0 < w[0] + w[1] ? 2 : 3);
            List<Raw> tp = new ArrayList<>();
            for (Raw r : pool) if (r.tier == tier) tp.add(r);
            List<Raw> from = tp.isEmpty() ? pool : tp;
            Raw chosen = from.get(rnd.nextInt(from.size()));
            out.add(chosen);
            seen.add(chosen.id);
        }
        return out;
    }

    /** Deterministic set for live matches: every player with the same room seed gets the same questions. */
    private static List<Raw> competitiveSet(int level, String subject, long seed) {
        List<Raw> pool = new ArrayList<>(source(subject));
        Random rnd = new Random(seed * 31 + level);
        for (int i = pool.size() - 1; i > 0; i--) {
            int j = rnd.nextInt(i + 1);
            Raw t = pool.get(i);
            pool.set(i, pool.get(j));
            pool.set(j, t);
        }
        int minTier = Math.max(1, 3 - Math.min(5, (level - 1) / 4));
        List<Raw> out = new ArrayList<>();
        for (Raw r : pool) {
            if (out.size() >= QUESTIONS_PER_LEVEL) break;
            if (r.tier >= minTier) out.add(r);
        }
        for (Raw r : pool) {
            if (out.size() >= QUESTIONS_PER_LEVEL) break;
            if (!out.contains(r)) out.add(r);
        }
        return out.size() > QUESTIONS_PER_LEVEL ? new ArrayList<>(out.subList(0, QUESTIONS_PER_LEVEL)) : out;
    }

    // ------------------------------------------------------------------ play

    public int level() { return level; }
    public String subject() { return subject; }
    public int total() { return questions.size(); }
    public int index() { return index; }
    public int score() { return score; }
    public int streak() { return streak; }
    public int correctCount() { return correctCount; }
    public boolean finished() { return index >= questions.size(); }
    public boolean answered() { return answered; }
    public int lastPicked() { return lastPicked; }
    public boolean fiftyUsed() { return usedFifty; }
    public boolean skipUsed() { return usedSkip; }
    public boolean hintUsed() { return usedHint; }
    public boolean hidden(int option) { return hidden[option]; }

    public Question current() { return finished() ? null : questions.get(index); }

    /** Seconds allowed per question: baseline by difficulty, shrinking by one second every two levels (floor 6s). */
    public int secondsPerQuestion() {
        int base = "easy".equals(difficulty) ? 25 : ("hard".equals(difficulty) ? 10 : 18);
        int shrink = Math.min(base - 6, (level - 1) / 2);
        return Math.max(6, base - shrink);
    }

    /** @param option the chosen option index, or -1 when time ran out */
    public AnswerResult answer(int option) {
        AnswerResult r = new AnswerResult();
        Question q = current();
        if (q == null || answered) {
            r.streak = streak;
            return r;
        }
        answered = true;
        lastPicked = option;
        r.correctIndex = q.correct;
        r.timedOut = option < 0;
        if (option == q.correct) {
            streak++;
            correctCount++;
            r.correct = true;
            r.scoreGain = 100 + streak * 25;
            r.coinsGain = 10 + streak;
            score += r.scoreGain;
        } else {
            streak = 0;
        }
        r.streak = streak;
        return r;
    }

    /** Moves to the next question. */
    public void advance() {
        if (finished()) return;
        index++;
        answered = false;
        lastPicked = -1;
        Arrays.fill(hidden, false);
    }

    /** 50:50 - hides two wrong answers. */
    public boolean fifty() {
        Question q = current();
        if (q == null || usedFifty || answered) return false;
        usedFifty = true;
        int hide = 0;
        for (int i = 0; i < 4 && hide < 2; i++) {
            if (i != q.correct) {
                hidden[i] = true;
                hide++;
            }
        }
        return true;
    }

    /** Skip - moves on with no score and no penalty. */
    public boolean skip() {
        if (finished() || usedSkip || answered) return false;
        usedSkip = true;
        streak = 0;
        advance();
        return true;
    }

    /** Hint - the first letter and the length of the right answer (the old web hint told the player nothing). */
    public String hint() {
        Question q = current();
        if (q == null || usedHint || answered) return null;
        usedHint = true;
        String a = q.correctText();
        return "Starts with \"" + a.charAt(0) + "\" · " + a.length() + " characters";
    }

    public int stars() {
        double ratio = questions.isEmpty() ? 0 : (double) correctCount / questions.size();
        return ratio >= .9 ? 3 : (ratio >= .6 ? 2 : 1);
    }

    /** Coins awarded for finishing a level (same rule as the web arcade: the level's points). */
    public int finishCoins() { return score; }

    // ------------------------------------------------------------------ persistence

    public String serialize() {
        StringBuilder sb = new StringBuilder();
        sb.append(level).append('|').append(subject).append('|').append(difficulty).append('|');
        sb.append(index).append(',').append(score).append(',').append(streak).append(',').append(correctCount).append(',');
        sb.append(usedFifty ? 1 : 0).append(usedSkip ? 1 : 0).append(usedHint ? 1 : 0).append('|');
        for (int i = 0; i < questions.size(); i++) {
            Question q = questions.get(i);
            // id and the displayed order of the 4 options is rebuilt from the raw row, so store the permutation
            Raw raw = bank().get(q.id);
            StringBuilder perm = new StringBuilder();
            for (String o : q.options) for (int k = 0; k < 4; k++) if (raw.opts[k].equals(o)) perm.append(k);
            sb.append(q.id).append(':').append(perm).append(i + 1 < questions.size() ? "," : "");
        }
        return sb.toString();
    }

    public static NecpraTriviaEngine deserialize(String s) {
        try {
            String[] p = s.split("\\|", -1);
            if (p.length < 5) return null;
            NecpraTriviaEngine e = new NecpraTriviaEngine(Integer.parseInt(p[0]), p[1], p[2]);
            String[] st = p[3].split(",");
            e.index = Integer.parseInt(st[0]);
            e.score = Integer.parseInt(st[1]);
            e.streak = Integer.parseInt(st[2]);
            e.correctCount = Integer.parseInt(st[3]);
            e.usedFifty = st[4].charAt(0) == '1';
            e.usedSkip = st[4].charAt(1) == '1';
            e.usedHint = st[4].charAt(2) == '1';
            for (String item : p[4].split(",")) {
                String[] kv = item.split(":");
                Raw raw = bank().get(Integer.parseInt(kv[0]));
                String[] o = new String[4];
                int correct = 0;
                for (int i = 0; i < 4; i++) {
                    int k = kv[1].charAt(i) - '0';
                    o[i] = raw.opts[k];
                    if (k == raw.correct) correct = i;
                }
                e.questions.add(new Question(raw.id, raw.subject, raw.tier, raw.text, o, correct));
            }
            if (e.questions.isEmpty() || e.index < 0 || e.index > e.questions.size()) return null;
            return e;
        } catch (RuntimeException ex) {
            return null;
        }
    }
}
