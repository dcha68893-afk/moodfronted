package com.necpa;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;

/**
 * Vector chess pieces. Every piece is drawn from paths in a 100 x 100 unit box, so they look identical on every phone
 * (no font glyphs) and stay sharp at any size.
 *
 * Shape mini-language (absolute coordinates only): M x y, L x y, C x1 y1 x2 y2 x y, Z, O cx cy r (circle),
 * R x y w h r (rounded rectangle).
 */
public final class NecpraChessPieces {
    private NecpraChessPieces() {}

    private static final String BASE = "R 24 80 52 11 4";

    private static final String PAWN = "O 50 31 12 "
            + "M 38 80 C 38 64 44 56 45 47 L 55 47 C 56 56 62 64 62 80 Z "
            + "R 36 43 28 7 3 " + BASE;

    private static final String ROOK = "M 30 82 L 32 74 L 36 72 L 38 40 L 30 38 L 30 16 L 41 16 L 41 25 L 46 25 L 46 16 "
            + "L 54 16 L 54 25 L 59 25 L 59 16 L 70 16 L 70 38 L 62 40 L 64 72 L 68 74 L 70 82 Z " + BASE;

    private static final String KNIGHT = "M 28 82 C 28 62 38 52 46 42 C 40 42 35 46 28 52 C 22 54 19 48 22 43 "
            + "C 27 36 31 28 38 22 L 38 12 L 45 17 C 47 16 49 15 52 15 L 56 10 L 59 17 "
            + "C 72 23 78 40 75 60 C 74 70 73 76 73 82 Z " + BASE;

    private static final String BISHOP = "O 50 13 5 "
            + "M 50 17 C 63 26 68 37 61 47 C 58 51 57 53 59 58 L 65 76 L 35 76 L 41 58 "
            + "C 43 53 42 51 39 47 C 32 37 37 26 50 17 Z "
            + "R 33 72 34 8 3 " + BASE;

    private static final String QUEEN = "O 18 28 4.5 O 34 20 4.5 O 50 15 4.5 O 66 20 4.5 O 82 28 4.5 "
            + "M 28 80 L 18 30 L 31 56 L 34 22 L 43 52 L 50 17 L 57 52 L 66 22 L 69 56 L 82 30 L 72 80 Z "
            + "R 26 74 48 8 3 " + BASE;

    private static final String KING = "R 46 8 8 30 2 R 38 15 24 8 2 "
            + "M 30 80 C 25 66 29 56 38 51 C 33 44 36 36 50 34 C 64 36 67 44 62 51 C 71 56 75 66 70 80 Z "
            + "R 28 74 44 8 3 " + BASE;

    /** Thin detail lines (drawn in the outline colour on top of the body). */
    private static final String ROOK_DETAIL = "M 36 41 L 64 41 M 35 71 L 65 71";
    private static final String BISHOP_DETAIL = "M 44 33 L 56 24";
    private static final String KNIGHT_DETAIL = "O 56 28 2.4";

    private static final Path[] FILL = new Path[6];
    private static final Path[] DETAIL = new Path[6];
    private static final boolean[] DETAIL_FILLED = new boolean[6];
    private static boolean built;

    private static final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final RectF oval = new RectF();

    private static int index(char piece) {
        switch (Character.toUpperCase(piece)) {
            case 'K': return 0;
            case 'Q': return 1;
            case 'R': return 2;
            case 'B': return 3;
            case 'N': return 4;
            default: return 5;
        }
    }

    private static synchronized void build() {
        if (built) return;
        FILL[0] = parse(KING);
        FILL[1] = parse(QUEEN);
        FILL[2] = parse(ROOK);
        FILL[3] = parse(BISHOP);
        FILL[4] = parse(KNIGHT);
        FILL[5] = parse(PAWN);
        DETAIL[2] = parse(ROOK_DETAIL);
        DETAIL[3] = parse(BISHOP_DETAIL);
        DETAIL[4] = parse(KNIGHT_DETAIL);
        DETAIL_FILLED[4] = true;
        fill.setStyle(Paint.Style.FILL);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeJoin(Paint.Join.ROUND);
        line.setStrokeCap(Paint.Cap.ROUND);
        shadow.setStyle(Paint.Style.FILL);
        shadow.setColor(Color.argb(60, 0, 0, 0));
        built = true;
    }

    private static Path parse(String spec) {
        Path p = new Path();
        String[] t = spec.trim().split("\\s+");
        int i = 0;
        while (i < t.length) {
            String c = t[i++];
            switch (c) {
                case "M": p.moveTo(f(t[i]), f(t[i + 1])); i += 2; break;
                case "L": p.lineTo(f(t[i]), f(t[i + 1])); i += 2; break;
                case "C": p.cubicTo(f(t[i]), f(t[i + 1]), f(t[i + 2]), f(t[i + 3]), f(t[i + 4]), f(t[i + 5])); i += 6; break;
                case "Z": p.close(); break;
                case "O": p.addCircle(f(t[i]), f(t[i + 1]), f(t[i + 2]), Path.Direction.CW); i += 3; break;
                case "R": {
                    float x = f(t[i]), y = f(t[i + 1]), w = f(t[i + 2]), h = f(t[i + 3]), r = f(t[i + 4]);
                    oval.set(x, y, x + w, y + h);
                    p.addRoundRect(oval, r, r, Path.Direction.CW);
                    i += 5;
                    break;
                }
                default: break;
            }
        }
        return p;
    }

    private static float f(String s) { return Float.parseFloat(s); }

    /**
     * Draws a piece centred on (cx, cy) inside a square of {@code size} pixels. Upper-case = White, lower-case = Black.
     */
    public static void draw(Canvas cv, char piece, float cx, float cy, float size) {
        if (piece == '.' || cv == null) return;
        build();
        boolean white = Character.isUpperCase(piece);
        int k = index(piece);
        cv.save();
        cv.translate(cx - size / 2f, cy - size / 2f);
        cv.scale(size / 100f, size / 100f);

        oval.set(24f, 86f, 76f, 96f);
        cv.drawOval(oval, shadow);

        fill.setColor(white ? Color.parseColor("#FBFBF8") : Color.parseColor("#2A2A2C"));
        cv.drawPath(FILL[k], fill);
        line.setColor(white ? Color.parseColor("#1D1D1F") : Color.parseColor("#000000"));
        line.setStrokeWidth(2.6f);
        cv.drawPath(FILL[k], line);

        if (DETAIL[k] != null) {
            int detailColour = white ? Color.parseColor("#1D1D1F") : Color.parseColor("#B8B8BC");
            if (DETAIL_FILLED[k]) {
                fill.setColor(detailColour);
                cv.drawPath(DETAIL[k], fill);
            } else {
                line.setColor(detailColour);
                line.setStrokeWidth(2.2f);
                cv.drawPath(DETAIL[k], line);
            }
        }
        cv.restore();
    }

    /** Material value of a piece type (pawn 1, minor 3, rook 5, queen 9, king 0). */
    public static int value(char piece) {
        switch (Character.toUpperCase(piece)) {
            case 'Q': return 9;
            case 'R': return 5;
            case 'B':
            case 'N': return 3;
            case 'P': return 1;
            default: return 0;
        }
    }
}
