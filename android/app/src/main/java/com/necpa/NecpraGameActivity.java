package com.necpa;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Base class of every native arcade screen. It owns what all six games share: the theme (follows the system dark
 * mode), the top bar (back, title, sound, coin wallet with M-Pesa top-up), modal dialogs, toasts, floating score
 * text, edge-to-edge insets, hardware / gesture back, save-on-pause, and the hand-back of the wallet to the web
 * layer when the screen closes. A game only builds its own scene and rules.
 */
public abstract class NecpraGameActivity extends Activity {
    public static final String EXTRA_LEVEL = "level";
    public static final String EXTRA_ROOM = "room";
    public static final String EXTRA_MODE = "mode";
    public static final String EXTRA_SUBJECT = "subject";
    public static final String EXTRA_COINS = "webCoins";
    public static final String EXTRA_GAMES = "webGames";
    public static final String EXTRA_BEST = "webBest";
    public static final String EXTRA_STREAK = "webStreak";
    public static final String EXTRA_SEEN = "webServerSeen";

    public static final String RES_COINS = "coins";
    public static final String RES_GAMES = "games";
    public static final String RES_BEST = "best";
    public static final String RES_STREAK = "streak";
    public static final String RES_DIRTY = "dirty";
    public static final String RES_LEVELS = "levels";
    public static final String RES_SEEN = "serverSeen";

    // ------------------------------------------------------------------ palette (same colours as the other native screens)
    protected boolean night;
    protected int cBg, cCard, cText, cSub, cLine, cPrimary, cGood, cDanger, cGold;

    protected NecpraGameStore store;
    protected final NecpraSfx sfx = new NecpraSfx();
    protected final Handler main = new Handler(Looper.getMainLooper());
    protected final ExecutorService io = Executors.newSingleThreadExecutor();

    protected FrameLayout root;       // everything
    protected FrameLayout stage;      // game content (GL surface and game views)
    protected LinearLayout topBar;
    protected TextView titleView, coinView, soundView;
    protected FrameLayout modalLayer;
    protected int insetTop, insetBottom, insetLeft, insetRight;
    private boolean destroyed;
    private OnBackInvokedCallback backCallback;
    private Modal activeModal;

    protected abstract String gameId();

    protected abstract String gameTitle();

    /** Build the game inside {@link #stage}. */
    protected abstract void onBuild(Bundle saved);

    /** Back pressed with no dialog open. Default: leave. */
    protected void onBackRequested() { finish(); }

    // ------------------------------------------------------------------ lifecycle

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        cBg = night ? Color.parseColor("#0B1220") : Color.parseColor("#F3F4F6");
        cCard = night ? Color.parseColor("#151E2E") : Color.WHITE;
        cText = night ? Color.parseColor("#F3F4F6") : Color.parseColor("#111827");
        cSub = night ? Color.parseColor("#9CA3AF") : Color.parseColor("#6B7280");
        cLine = night ? Color.parseColor("#243044") : Color.parseColor("#E5E7EB");
        cPrimary = Color.parseColor("#2563EB");
        cGood = Color.parseColor("#16A34A");
        cDanger = Color.parseColor("#DC2626");
        cGold = Color.parseColor("#F59E0B");

        store = new NecpraGameStore(this);
        Intent in = getIntent();
        if (in != null && in.hasExtra(EXTRA_COINS) && !store.dirty()) {
            // The web wallet is the owner unless a previous native session never handed its coins back.
            store.adoptWeb(in.getIntExtra(EXTRA_COINS, -1), in.getIntExtra(EXTRA_GAMES, -1),
                    in.getIntExtra(EXTRA_BEST, -1), in.getIntExtra(EXTRA_STREAK, -1));
        }
        if (in != null && in.getStringExtra(EXTRA_SEEN) != null) {
            try {
                store.adoptServerSeen(Long.parseLong(in.getStringExtra(EXTRA_SEEN)));
            } catch (NumberFormatException ignored) { }
        }
        sfx.configure(store.sound(), store.haptics());

        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        makeEdgeToEdge();

        root = new FrameLayout(this);
        root.setBackgroundColor(night ? Color.parseColor("#070C16") : Color.parseColor("#E8ECF4"));
        stage = new FrameLayout(this);
        root.addView(stage, new FrameLayout.LayoutParams(-1, -1));

        topBar = buildTopBar();
        root.addView(topBar, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        modalLayer = new FrameLayout(this);
        modalLayer.setVisibility(View.GONE);
        root.addView(modalLayer, new FrameLayout.LayoutParams(-1, -1));

        setContentView(root);
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets ins) {
                int t, bo, l, r;
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets s = ins.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    t = s.top;
                    bo = s.bottom;
                    l = s.left;
                    r = s.right;
                } else {
                    t = ins.getSystemWindowInsetTop();
                    bo = ins.getSystemWindowInsetBottom();
                    l = ins.getSystemWindowInsetLeft();
                    r = ins.getSystemWindowInsetRight();
                }
                insetTop = t;
                insetBottom = bo;
                insetLeft = l;
                insetRight = r;
                topBar.setPadding(dp(10) + l, t + dp(6), dp(10) + r, dp(6));
                modalLayer.setPadding(l, t, r, bo);
                onInsets(t, bo, l, r);
                return ins;
            }
        });

        registerBack();
        onBuild(b);
        updateCoins(false);
    }

    /** Called whenever the system bars / cutouts change. */
    protected void onInsets(int top, int bottom, int left, int right) { }

    @SuppressWarnings("deprecation")
    private void makeEdgeToEdge() {
        android.view.Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) {
            w.setNavigationBarContrastEnforced(false);
        }
        // Scenes are dark in night mode and light in day mode, so bar icons follow the theme.
        if (Build.VERSION.SDK_INT >= 30) {
            android.view.WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                int m = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(night ? 0 : m, m);
            }
        } else if (!night && Build.VERSION.SDK_INT >= 23) {
            View d = w.getDecorView();
            d.setSystemUiVisibility(d.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    private void registerBack() {
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = new OnBackInvokedCallback() {
                @Override public void onBackInvoked() { handleBack(); }
            };
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Android 12 and below; on 13+ the registered callback receives the gesture instead.
        if (Build.VERSION.SDK_INT >= 33) {
            super.onBackPressed();
            return;
        }
        handleBack();
    }

    private void handleBack() {
        if (activeModal != null && activeModal.cancelable) {
            activeModal.dismiss();
            return;
        }
        if (activeModal != null) return;
        onBackRequested();
    }

    @Override
    protected void onPause() {
        super.onPause();
        try {
            onSaveGame();
        } catch (RuntimeException ignored) { }
    }

    /** Persist a resume snapshot here (called on every pause). */
    protected void onSaveGame() { }

    @Override
    public void finish() {
        Intent r = new Intent();
        JSONObject s = store.snapshot();
        r.putExtra(RES_COINS, s.optInt("coins"));
        r.putExtra(RES_GAMES, s.optInt("games"));
        r.putExtra(RES_BEST, s.optInt("best"));
        r.putExtra(RES_STREAK, s.optInt("streak"));
        r.putExtra(RES_DIRTY, s.optBoolean("dirty"));
        r.putExtra(RES_LEVELS, store.levelsJson().toString());
        r.putExtra(RES_SEEN, String.valueOf(store.serverSeen()));
        setResult(RESULT_OK, r);
        super.finish();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            try {
                getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
            } catch (RuntimeException ignored) { }
        }
        sfx.release();
        io.shutdownNow();
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    protected boolean dead() { return destroyed || isFinishing(); }

    /** Runs on the UI thread unless the screen is gone. */
    protected void ui(final Runnable r) {
        main.post(new Runnable() {
            @Override public void run() { if (!dead()) r.run(); }
        });
    }

    // ------------------------------------------------------------------ small view helpers

    protected int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    protected TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        t.setIncludeFontPadding(false);
        return t;
    }

    protected GradientDrawable round(int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    protected GradientDrawable roundStroke(int fill, int stroke, float radiusDp) {
        GradientDrawable g = round(fill, radiusDp);
        g.setStroke(dp(1.5f), stroke);
        return g;
    }

    protected static int alpha(int color, int a) { return (color & 0x00FFFFFF) | (a << 24); }

    public static final int PRIMARY = 0, SECONDARY = 1, GOOD = 2, DANGER = 3, GOLD = 4;

    protected TextView button(String label, int style, final Runnable onClick) {
        TextView b = new TextView(this);
        b.setText(label);
        b.setGravity(Gravity.CENTER);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setIncludeFontPadding(false);
        b.setPadding(dp(18), dp(13), dp(18), dp(13));
        b.setMinHeight(dp(48));
        int fill, fg = Color.WHITE;
        switch (style) {
            case SECONDARY:
                b.setBackground(roundStroke(night ? Color.parseColor("#1B2638") : Color.WHITE, cLine, 14));
                fg = cText;
                break;
            case GOOD:
                fill = cGood;
                b.setBackground(gradient(fill, 14));
                break;
            case DANGER:
                fill = cDanger;
                b.setBackground(gradient(fill, 14));
                break;
            case GOLD:
                fill = cGold;
                b.setBackground(gradient(fill, 14));
                fg = Color.parseColor("#3B2400");
                break;
            default:
                b.setBackground(gradient(cPrimary, 14));
        }
        b.setTextColor(fg);
        pressable(b);
        if (onClick != null) {
            b.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    sfx.play(NecpraSfx.TAP);
                    sfx.haptic(v, 0);
                    onClick.run();
                }
            });
        }
        return b;
    }

    private GradientDrawable gradient(int base, float radiusDp) {
        float[] hsv = new float[3];
        Color.colorToHSV(base, hsv);
        float[] d = {hsv[0], Math.min(1f, hsv[1] + 0.05f), Math.max(0f, hsv[2] - 0.2f)};
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{base, Color.HSVToColor(d)});
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    /** Springy press feedback without consuming the touch. */
    @SuppressWarnings("ClickableViewAccessibility")
    protected void pressable(View v) {
        v.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View view, MotionEvent e) {
                int a = e.getActionMasked();
                if (a == MotionEvent.ACTION_DOWN) view.animate().scaleX(0.95f).scaleY(0.95f).setDuration(70).start();
                else if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL)
                    view.animate().scaleX(1f).scaleY(1f).setDuration(140).setInterpolator(new android.view.animation.OvershootInterpolator(2.5f)).start();
                return false;
            }
        });
    }

    /** Small rounded readout used in the HUD row under the top bar. */
    protected TextView statChip(String label) {
        TextView t = text(label, 13, cText, true);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(12), dp(7), dp(12), dp(7));
        t.setBackground(roundStroke(alpha(cCard, night ? 0xD0 : 0xE8), cLine, 16));
        return t;
    }

    /** Bottom-bar action button (icon / label on two lines). Ignored while a dialog is open. */
    protected TextView toolButton(String label, final Runnable r) {
        TextView t = text(label, 12.5f, cText, true);
        t.setGravity(Gravity.CENTER);
        t.setLineSpacing(0, 1.05f);
        t.setBackground(roundStroke(alpha(cCard, night ? 0xE0 : 0xF0), cLine, 18));
        pressable(t);
        t.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (modalOpen()) return;
                sfx.play(NecpraSfx.TAP);
                sfx.haptic(v, 0);
                r.run();
            }
        });
        return t;
    }

    protected LinearLayout column() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    protected LinearLayout row() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        return l;
    }

    protected View space(int dpv) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(dp(dpv), dp(dpv)));
        return v;
    }

    // ------------------------------------------------------------------ top bar

    private LinearLayout buildTopBar() {
        LinearLayout bar = row();
        bar.setPadding(dp(10), dp(6), dp(10), dp(6));

        TextView back = chip("‹", 22);
        back.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                sfx.play(NecpraSfx.TAP);
                handleBack();
            }
        });
        back.setContentDescription("Back");
        bar.addView(back, new LinearLayout.LayoutParams(dp(42), dp(42)));

        titleView = text(gameTitle(), 17, cText, true);
        titleView.setSingleLine(true);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        titleView.setPadding(dp(12), 0, dp(8), 0);
        bar.addView(titleView, new LinearLayout.LayoutParams(0, -2, 1f));

        soundView = chip(store.sound() ? "🔊" : "🔇", 16);
        soundView.setContentDescription("Sound");
        soundView.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                boolean on = !store.sound();
                store.setSound(on);
                store.setHaptics(on);
                sfx.configure(on, on);
                soundView.setText(on ? "🔊" : "🔇");
                if (on) sfx.play(NecpraSfx.TAP);
            }
        });
        bar.addView(soundView, new LinearLayout.LayoutParams(dp(42), dp(42)));
        bar.addView(space(6));

        coinView = chip("🪙 0  +", 14);
        coinView.setPadding(dp(12), 0, dp(12), 0);
        coinView.setContentDescription("Coins. Tap to buy more");
        coinView.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                sfx.play(NecpraSfx.TAP);
                buyCoinsDialog();
            }
        });
        bar.addView(coinView, new LinearLayout.LayoutParams(-2, dp(42)));
        return bar;
    }

    private TextView chip(String label, float sp) {
        TextView t = text(label, sp, cText, true);
        t.setGravity(Gravity.CENTER);
        t.setBackground(roundStroke(alpha(cCard, night ? 0xD8 : 0xE6), cLine, 21));
        pressable(t);
        return t;
    }

    protected void setTitle2(String s) { titleView.setText(s); }

    protected void updateCoins(boolean pop) {
        coinView.setText("🪙 " + String.format(java.util.Locale.US, "%,d", store.coins()) + "  +");
        if (pop) {
            coinView.animate().cancel();
            coinView.setScaleX(1f);
            coinView.setScaleY(1f);
            coinView.animate().scaleX(1.18f).scaleY(1.18f).setDuration(110).withEndAction(new Runnable() {
                @Override public void run() {
                    coinView.animate().scaleX(1f).scaleY(1f).setDuration(160).start();
                }
            }).start();
        }
    }

    /** Pixel height of the top bar including the status-bar inset, for placing HUD below it. */
    protected int topBarHeight() { return insetTop + dp(54); }

    // ------------------------------------------------------------------ wallet helpers

    protected void earn(int coins, String why) {
        if (coins <= 0) return;
        store.add(coins);
        sfx.play(NecpraSfx.COIN);
        updateCoins(true);
        if (why != null) toast("+" + coins + " 🪙  " + why);
    }

    /** Pays for an item, or offers to buy coins when short. {@code onPaid} runs on the UI thread after the spend. */
    protected void pay(int cost, String what, final Runnable onPaid) {
        if (cost <= 0) {
            onPaid.run();
            return;
        }
        if (store.spend(cost)) {
            updateCoins(false);
            onPaid.run();
            return;
        }
        sfx.play(NecpraSfx.ERROR);
        sfx.haptic(root, 2);
        LinearLayout c = column();
        c.addView(text("Not enough coins", 19, cText, true));
        TextView body = text(what + " costs 🪙 " + cost + ". You have 🪙 " + store.coins() + ".", 14, cSub, false);
        body.setPadding(0, dp(8), 0, dp(16));
        c.addView(body);
        final Modal m = modal(c, true);
        c.addView(button("Buy coins", GOLD, new Runnable() {
            @Override public void run() {
                m.dismiss();
                buyCoinsDialog();
            }
        }));
        c.addView(space(8));
        c.addView(button("Not now", SECONDARY, new Runnable() {
            @Override public void run() { m.dismiss(); }
        }));
    }

    // ------------------------------------------------------------------ toast / floating text

    private TextView toastView;

    protected void toast(String s) {
        if (toastView != null) root.removeView(toastView);
        final TextView t = text(s, 14, Color.WHITE, true);
        t.setBackground(round(Color.parseColor("#E6111827"), 22));
        t.setPadding(dp(18), dp(11), dp(18), dp(11));
        t.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        lp.bottomMargin = insetBottom + dp(96);
        lp.leftMargin = lp.rightMargin = dp(24);
        root.addView(t, lp);
        toastView = t;
        t.setAlpha(0f);
        t.setTranslationY(dp(14));
        t.animate().alpha(1f).translationY(0).setDuration(160).start();
        t.postDelayed(new Runnable() {
            @Override public void run() {
                t.animate().alpha(0f).setDuration(220).withEndAction(new Runnable() {
                    @Override public void run() {
                        if (toastView == t) toastView = null;
                        root.removeView(t);
                    }
                }).start();
            }
        }, 1900);
    }

    /** Score text that drifts up and fades from a view-pixel position. */
    protected void floatText(String s, float x, float y, int color) {
        final TextView t = text(s, 22, color, true);
        t.setShadowLayer(dp(3), 0, dp(1), Color.parseColor("#99000000"));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2);
        root.addView(t, lp);
        t.measure(0, 0);
        t.setX(x - t.getMeasuredWidth() / 2f);
        t.setY(y - t.getMeasuredHeight() / 2f);
        t.setScaleX(0.4f);
        t.setScaleY(0.4f);
        t.animate().scaleX(1.15f).scaleY(1.15f).setDuration(160).withEndAction(new Runnable() {
            @Override public void run() {
                t.animate().translationYBy(-dp(70)).alpha(0f).scaleX(1f).scaleY(1f).setDuration(720).withEndAction(new Runnable() {
                    @Override public void run() { root.removeView(t); }
                }).start();
            }
        }).start();
    }

    // ------------------------------------------------------------------ modal dialogs

    public final class Modal {
        final boolean cancelable;
        private final View scrim;
        private final View card;
        private boolean gone;
        private Runnable onDismiss;

        Modal(View content, boolean cancelable) {
            this.cancelable = cancelable;
            scrim = new View(NecpraGameActivity.this);
            scrim.setBackgroundColor(Color.parseColor("#B3000000"));
            final ScrollView sv = new ScrollView(NecpraGameActivity.this);
            sv.setFillViewport(false);
            sv.setVerticalScrollBarEnabled(false);
            LinearLayout wrap = column();
            wrap.setBackground(round(cCard, 26));
            wrap.setPadding(dp(22), dp(22), dp(22), dp(22));
            wrap.addView(content);
            sv.addView(wrap);
            card = sv;
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Math.min(dp(380), getResources().getDisplayMetrics().widthPixels - dp(32)), -2, Gravity.CENTER);
            modalLayer.setVisibility(View.VISIBLE);
            modalLayer.addView(scrim, new FrameLayout.LayoutParams(-1, -1));
            modalLayer.addView(card, lp);
            if (cancelable) {
                scrim.setOnClickListener(new View.OnClickListener() {
                    @Override public void onClick(View v) { dismiss(); }
                });
            }
            scrim.setAlpha(0f);
            scrim.animate().alpha(1f).setDuration(160).start();
            card.setAlpha(0f);
            card.setScaleX(0.88f);
            card.setScaleY(0.88f);
            card.setTranslationY(dp(24));
            card.animate().alpha(1f).scaleX(1f).scaleY(1f).translationY(0).setDuration(240)
                    .setInterpolator(new android.view.animation.OvershootInterpolator(1.1f)).start();
            activeModal = this;
        }

        public Modal onDismiss(Runnable r) {
            onDismiss = r;
            return this;
        }

        public void dismiss() {
            if (gone) return;
            gone = true;
            if (activeModal == this) activeModal = null;
            scrim.animate().alpha(0f).setDuration(140).start();
            card.animate().alpha(0f).scaleX(0.94f).scaleY(0.94f).setDuration(140).withEndAction(new Runnable() {
                @Override public void run() {
                    modalLayer.removeView(scrim);
                    modalLayer.removeView(card);
                    if (modalLayer.getChildCount() == 0) modalLayer.setVisibility(View.GONE);
                }
            }).start();
            if (onDismiss != null) onDismiss.run();
        }
    }

    protected Modal modal(View content, boolean cancelable) { return new Modal(content, cancelable); }

    protected boolean modalOpen() { return activeModal != null; }

    protected void message(String title, String body, String ok) {
        LinearLayout c = column();
        c.addView(text(title, 20, cText, true));
        TextView b = text(body, 14.5f, cSub, false);
        b.setLineSpacing(0, 1.15f);
        b.setPadding(0, dp(8), 0, dp(18));
        c.addView(b);
        final Modal m = modal(c, true);
        c.addView(button(ok, PRIMARY, new Runnable() {
            @Override public void run() { m.dismiss(); }
        }));
    }

    protected void confirm(String title, String body, String yes, String no, boolean danger, final Runnable onYes) {
        LinearLayout c = column();
        c.addView(text(title, 20, cText, true));
        TextView b = text(body, 14.5f, cSub, false);
        b.setLineSpacing(0, 1.15f);
        b.setPadding(0, dp(8), 0, dp(18));
        c.addView(b);
        final Modal m = modal(c, true);
        c.addView(button(yes, danger ? DANGER : PRIMARY, new Runnable() {
            @Override public void run() {
                m.dismiss();
                onYes.run();
            }
        }));
        c.addView(space(8));
        c.addView(button(no, SECONDARY, new Runnable() {
            @Override public void run() { m.dismiss(); }
        }));
    }

    /** Level / match result card with animated stars. */
    protected Modal resultCard(String title, String subtitle, int stars, String[][] rows, String primary, final Runnable onPrimary,
                               String secondary, final Runnable onSecondary) {
        LinearLayout c = column();
        c.setGravity(Gravity.CENTER_HORIZONTAL);
        if (stars >= 0) {
            LinearLayout sr = row();
            sr.setGravity(Gravity.CENTER);
            for (int i = 0; i < 3; i++) {
                TextView s = text(i < stars ? "★" : "☆", 40, i < stars ? cGold : cLine, false);
                s.setPadding(dp(4), 0, dp(4), 0);
                s.setScaleX(0f);
                s.setScaleY(0f);
                s.animate().scaleX(1f).scaleY(1f).setStartDelay(220 + i * 170L).setDuration(380)
                        .setInterpolator(new android.view.animation.OvershootInterpolator(3f)).start();
                sr.addView(s);
            }
            c.addView(sr);
        }
        TextView t = text(title, 24, cText, true);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(8), 0, 0);
        c.addView(t);
        if (subtitle != null) {
            TextView st = text(subtitle, 14.5f, cSub, false);
            st.setGravity(Gravity.CENTER);
            st.setPadding(0, dp(6), 0, dp(8));
            c.addView(st);
        }
        if (rows != null) {
            LinearLayout box = column();
            box.setBackground(round(night ? Color.parseColor("#0F1727") : Color.parseColor("#F3F4F6"), 16));
            box.setPadding(dp(16), dp(10), dp(16), dp(10));
            for (String[] r : rows) {
                LinearLayout line = row();
                line.setPadding(0, dp(6), 0, dp(6));
                line.addView(text(r[0], 14, cSub, false), new LinearLayout.LayoutParams(0, -2, 1f));
                line.addView(text(r[1], 15, cText, true));
                box.addView(line);
            }
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.bottomMargin = dp(16);
            c.addView(box, lp);
        }
        final Modal m = modal(c, false);
        LinearLayout.LayoutParams full = new LinearLayout.LayoutParams(-1, -2);
        c.addView(button(primary, PRIMARY, new Runnable() {
            @Override public void run() {
                m.dismiss();
                if (onPrimary != null) onPrimary.run();
            }
        }), full);
        if (secondary != null) {
            c.addView(space(8));
            c.addView(button(secondary, SECONDARY, new Runnable() {
                @Override public void run() {
                    m.dismiss();
                    if (onSecondary != null) onSecondary.run();
                }
            }), new LinearLayout.LayoutParams(-1, -2));
        }
        return m;
    }

    // ------------------------------------------------------------------ buy coins (M-Pesa STK)

    private static final int[][] PACKS = {{5, 10}, {10, 20}, {50, 100}};
    private boolean buying;

    protected void buyCoinsDialog() {
        final LinearLayout c = column();
        c.addView(text("🪙  Buy coins", 22, cText, true));
        TextView bal = text("Balance: 🪙 " + String.format(java.util.Locale.US, "%,d", store.coins()), 13, cSub, false);
        bal.setPadding(0, dp(4), 0, dp(14));
        c.addView(bal);

        final int[] kes = {10};
        final LinearLayout packs = row();
        final TextView[] packViews = new TextView[PACKS.length + 1];
        final EditText custom = new EditText(this);
        final TextView calc = text("", 13, cSub, false);

        final Runnable paint = new Runnable() {
            @Override public void run() {
                for (int i = 0; i < packViews.length; i++) {
                    boolean on = i < PACKS.length ? kes[0] == PACKS[i][0] && custom.getVisibility() != View.VISIBLE : custom.getVisibility() == View.VISIBLE;
                    packViews[i].setBackground(roundStroke(on ? alpha(cGood, 0x30) : (night ? Color.parseColor("#0F1727") : Color.parseColor("#F3F4F6")), on ? cGood : cLine, 14));
                }
                int k = kes[0];
                calc.setText(k >= NecpraGameApi.MIN_KES
                        ? "You get 🪙 " + String.format(java.util.Locale.US, "%,d", k * NecpraGameApi.COINS_PER_KES) + " for KES " + String.format(java.util.Locale.US, "%,d", k)
                        : "Minimum is KES " + NecpraGameApi.MIN_KES);
            }
        };
        for (int i = 0; i < PACKS.length; i++) {
            final int[] p = PACKS[i];
            TextView v = text("🪙 " + p[1] + "\nKES " + p[0], 15, cText, true);
            v.setGravity(Gravity.CENTER);
            v.setPadding(dp(4), dp(12), dp(4), dp(12));
            v.setLineSpacing(0, 1.1f);
            pressable(v);
            v.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View x) {
                    if (buying) return;
                    custom.setVisibility(View.GONE);
                    kes[0] = p[0];
                    paint.run();
                }
            });
            packViews[i] = v;
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1f);
            lp.rightMargin = dp(8);
            packs.addView(v, lp);
        }
        TextView other = text("✏️\nOther", 15, cText, true);
        other.setGravity(Gravity.CENTER);
        other.setPadding(dp(4), dp(12), dp(4), dp(12));
        other.setLineSpacing(0, 1.1f);
        pressable(other);
        packViews[PACKS.length] = other;
        packs.addView(other, new LinearLayout.LayoutParams(0, -2, 1f));
        c.addView(packs);

        custom.setHint("Amount in KES (min " + NecpraGameApi.MIN_KES + ")");
        custom.setInputType(InputType.TYPE_CLASS_NUMBER);
        custom.setTextColor(cText);
        custom.setHintTextColor(cSub);
        custom.setGravity(Gravity.CENTER);
        custom.setTextSize(17);
        custom.setBackground(roundStroke(night ? Color.parseColor("#0F1727") : Color.WHITE, cLine, 14));
        custom.setVisibility(View.GONE);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(-1, dp(48));
        clp.topMargin = dp(10);
        c.addView(custom, clp);
        other.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View x) {
                if (buying) return;
                custom.setVisibility(View.VISIBLE);
                custom.requestFocus();
                kes[0] = 0;
                paint.run();
            }
        });
        custom.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int d) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int d) { }
            @Override public void afterTextChanged(android.text.Editable e) {
                try {
                    kes[0] = Integer.parseInt(e.toString().trim());
                } catch (NumberFormatException ex) {
                    kes[0] = 0;
                }
                paint.run();
            }
        });

        calc.setGravity(Gravity.CENTER);
        calc.setPadding(0, dp(10), 0, dp(6));
        c.addView(calc);

        final EditText phone = new EditText(this);
        phone.setHint("M-Pesa number e.g. 0712345678");
        phone.setInputType(InputType.TYPE_CLASS_PHONE);
        phone.setTextColor(cText);
        phone.setHintTextColor(cSub);
        phone.setGravity(Gravity.CENTER);
        phone.setTextSize(17);
        phone.setBackground(roundStroke(night ? Color.parseColor("#0F1727") : Color.WHITE, cLine, 14));
        phone.setText(getSharedPreferences("necpra_native_games_ui", MODE_PRIVATE).getString("mpesaPhone", ""));
        c.addView(phone, new LinearLayout.LayoutParams(-1, dp(48)));

        final TextView msg = text("", 13, cSub, false);
        msg.setGravity(Gravity.CENTER);
        msg.setMinHeight(dp(34));
        msg.setPadding(0, dp(8), 0, dp(8));
        c.addView(msg);

        final Modal m = modal(c, true);
        final TextView[] payBtn = new TextView[1];
        payBtn[0] = button("PAY WITH M-PESA", GOOD, new Runnable() {
            @Override public void run() {
                if (buying) return;
                final String ph = phone.getText().toString().replaceAll("[\\s-]", "");
                if (!NecpraGameApi.validPhone(ph)) {
                    msg.setText("Enter a valid Safaricom number, e.g. 0712345678");
                    return;
                }
                final int amount = kes[0];
                if (amount < NecpraGameApi.MIN_KES || amount > NecpraGameApi.MAX_KES) {
                    msg.setText("Enter an amount between KES " + NecpraGameApi.MIN_KES + " and KES " + String.format(java.util.Locale.US, "%,d", NecpraGameApi.MAX_KES));
                    return;
                }
                getSharedPreferences("necpra_native_games_ui", MODE_PRIVATE).edit().putString("mpesaPhone", ph).apply();
                buying = true;
                payBtn[0].setAlpha(0.55f);
                msg.setText("Sending M-Pesa request…");
                io.execute(new Runnable() {
                    @Override public void run() {
                        runPurchase(amount, ph, msg, m, payBtn[0]);
                    }
                });
            }
        });
        c.addView(payBtn[0]);
        c.addView(space(8));
        c.addView(button("Close", SECONDARY, new Runnable() {
            @Override public void run() { if (!buying) m.dismiss(); }
        }));
        paint.run();
    }

    private void runPurchase(int amount, String phone, final TextView msg, final Modal m, final TextView payBtn) {
        String result;
        boolean done = false;
        try {
            NecpraGameApi.syncServerCoins(this, store); // baseline first, so only this purchase is credited afterwards
            NecpraGameApi.mpesaStk(this, amount, phone);
            say(msg, "📲 Check your phone and enter your M-Pesa PIN…");
            long t0 = System.currentTimeMillis();
            int credited = 0;
            while (System.currentTimeMillis() - t0 < 120000 && !dead()) {
                Thread.sleep(3000);
                credited = NecpraGameApi.syncServerCoins(this, store);
                if (credited > 0) break;
            }
            if (credited > 0) {
                result = "✅ " + String.format(java.util.Locale.US, "%,d", credited) + " coins added!";
                done = true;
            } else {
                result = "Payment not confirmed yet. If M-Pesa took your money, the coins will appear shortly.";
            }
        } catch (NecpraGameApi.OfflineError e) {
            result = "No internet connection. Please try again.";
        } catch (NecpraGameApi.ApiError e) {
            result = e.getMessage();
        } catch (NativeBackgroundSync.SessionExpiredException e) {
            result = "Your session expired. Please sign in again.";
        } catch (InterruptedException e) {
            return;
        } catch (Exception e) {
            result = "Payment failed. Please try again.";
        }
        final String fr = result;
        final boolean ok = done;
        ui(new Runnable() {
            @Override public void run() {
                buying = false;
                payBtn.setAlpha(1f);
                msg.setText(fr);
                updateCoins(ok);
                if (ok) {
                    sfx.play(NecpraSfx.COIN);
                    main.postDelayed(new Runnable() {
                        @Override public void run() { if (!dead()) m.dismiss(); }
                    }, 1400);
                }
            }
        });
    }

    private void say(final TextView msg, final String s) {
        ui(new Runnable() {
            @Override public void run() { msg.setText(s); }
        });
    }

    /** Credits purchases / match rewards the server added while the player was away. Quiet when offline. */
    protected void pullServerCoins() {
        io.execute(new Runnable() {
            @Override public void run() {
                try {
                    final int n = NecpraGameApi.syncServerCoins(NecpraGameActivity.this, store);
                    if (n > 0) ui(new Runnable() {
                        @Override public void run() {
                            updateCoins(true);
                            toast("+" + n + " 🪙 added to your wallet");
                        }
                    });
                } catch (Exception ignored) {
                    // offline or signed out: the local wallet keeps working
                }
            }
        });
    }

    protected String errorText(Exception e) {
        if (e instanceof NecpraGameApi.OfflineError) return "No internet connection";
        if (e instanceof NativeBackgroundSync.SessionExpiredException) return "Please sign in again";
        String m = e.getMessage();
        return m == null || m.isEmpty() ? "Something went wrong" : m;
    }
}
