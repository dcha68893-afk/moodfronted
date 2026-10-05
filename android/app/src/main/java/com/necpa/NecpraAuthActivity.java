package com.necpa;

import android.content.Intent;
import android.content.res.Resources;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.text.method.HideReturnsTransformationMethod;
import android.text.method.PasswordTransformationMethod;
import android.util.Patterns;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native Landing / Login / Sign up for the Android app.
 *
 * Design rules (same as the other native screens):
 *  - Talks to the SAME backend endpoints the web login uses (/api/auth/login, /register, /2fa/challenge,
 *    /forgot-password). No new backend.
 *  - It does NOT persist the session itself. A session has to be set up in several places at once (web
 *    localStorage, the E2E wrap secret, the two-accounts-per-device cap, the native encrypted store), and all of
 *    that already lives in the web page's finalizeLoginSuccess() -> AppRuntimeAuthority -> NecpraNative.authSetSession.
 *    So on success this screen hands the result back in memory ({@link #takePending()}) and the page finishes the
 *    login through that one existing path. Nothing is written to disk and nothing travels in an Intent.
 *  - "Continue with Google" is not re-implemented here: it returns ACTION_GOOGLE and the page runs the existing
 *    Google sign-in (js/google-auth.js, Capacitor SocialLogin plugin).
 *  - Landing copy only states things that exist in the code. No ratings, user counts or demo data. Real app
 *    screenshots are optional: drop landing_messaging.png, landing_friends.png, landing_accommodation.png,
 *    landing_marketplace.png, landing_groups.png and landing_status.png into res/drawable-nodpi/ and they appear in
 *    the matching card; without them the card is text only (nothing fake is drawn).
 */
public class NecpraAuthActivity extends AppCompatActivity {

    static final String EXTRA_REASON = "reason";
    static final String EXTRA_START = "start";          // "landing" (default) | "login" | "signup"
    static final String RES_ACTION = "action";
    static final String ACTION_LOGIN = "login";
    static final String ACTION_GOOGLE = "google";

    /** One-shot, in-memory hand-off of a successful login (never written to disk, never put in an Intent). */
    static final class Pending {
        String token = "", refreshToken = "", userJson = "", password = "";
        String expiresAt = "";          // the backend sends an ISO-8601 string; passed through untouched like the web login does
    }
    private static volatile Pending pending;
    static Pending takePending() { Pending p = pending; pending = null; return p; }

    private enum Mode { LANDING, LOGIN, SIGNUP, MFA, FORGOT }

    private static final int PRIMARY = Color.parseColor("#2563EB");
    private static final int PRIMARY_DARK = Color.parseColor("#1E3A8A");
    private static final int DANGER = Color.parseColor("#DC2626");
    private static final int OK = Color.parseColor("#059669");
    private static final String SITE = "https://necpra.co.ke";

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());

    private ScrollView scroll;
    private LinearLayout content;
    private TextView message;
    private Button primary;
    private Mode mode = Mode.LANDING;
    private boolean busy;
    private int bg, card, text, sub, line;

    private String mfaTemp = "", mfaPassword = "";
    private String prefillIdentifier = "";
    private String notice = "", noticeIsError = null;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        bg = Color.parseColor("#F3F4F6"); card = Color.WHITE; text = Color.parseColor("#111827");
        sub = Color.parseColor("#6B7280"); line = Color.parseColor("#D1D5DB");
        if ((getResources().getConfiguration().uiMode & 0x30) == 0x20) {
            bg = Color.parseColor("#0B1220"); card = Color.parseColor("#151E2E");
            text = Color.parseColor("#F3F4F6"); sub = Color.parseColor("#9CA3AF"); line = Color.parseColor("#243044");
        }
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(bg);
        scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setLayoutParams(new FrameLayout.LayoutParams(-1, -1));
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content, new ViewGroup.LayoutParams(-1, -2));
        root.addView(scroll);
        setContentView(root);

        Intent in = getIntent();
        String start = in == null ? null : in.getStringExtra(EXTRA_START);
        String reason = in == null ? null : in.getStringExtra(EXTRA_REASON);
        if (reason != null && !reason.isEmpty()) { notice = reason; noticeIsError = "1"; }
        render("login".equals(start) || !notice.isEmpty() ? Mode.LOGIN : "signup".equals(start) ? Mode.SIGNUP : Mode.LANDING);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (busy) return;
                if (mode == Mode.LANDING) { moveTaskToBack(true); }   // behave like leaving the app; no web landing flash
                else if (mode == Mode.MFA || mode == Mode.FORGOT) render(Mode.LOGIN);
                else render(Mode.LANDING);
            }
        });
    }

    @Override protected void onDestroy() { super.onDestroy(); io.shutdownNow(); }

    // ------------------------------------------------------------------------------------------ rendering

    private void render(Mode m) {
        mode = m;
        content.removeAllViews();
        message = null; primary = null;
        switch (m) {
            case LANDING: renderLanding(); break;
            case LOGIN: renderLogin(); break;
            case SIGNUP: renderSignup(); break;
            case MFA: renderMfa(); break;
            default: renderForgot(); break;
        }
        if (!notice.isEmpty()) { showMessage(notice, noticeIsError != null); notice = ""; noticeIsError = null; }
        scroll.scrollTo(0, 0);
    }

    private void renderLanding() {
        LinearLayout hero = new LinearLayout(this);
        hero.setOrientation(LinearLayout.VERTICAL);
        hero.setGravity(Gravity.CENTER_HORIZONTAL);
        hero.setPadding(dp(24), dp(48), dp(24), dp(32));
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{PRIMARY, PRIMARY_DARK});
        g.setCornerRadii(new float[]{0, 0, 0, 0, dp(28), dp(28), dp(28), dp(28)});
        hero.setBackground(g);

        try {
            Drawable icon = getPackageManager().getApplicationIcon(getPackageName());
            ImageView iv = new ImageView(this);
            iv.setImageDrawable(icon);
            hero.addView(iv, new LinearLayout.LayoutParams(dp(72), dp(72)));
        } catch (Throwable ignored) { }
        TextView brand = tv("Necpra", 30, Color.WHITE, true);
        brand.setGravity(Gravity.CENTER);
        brand.setPadding(0, dp(10), 0, dp(14));
        hero.addView(brand);
        TextView head = tv("One app for Messaging, Friends, Accommodation and Marketplace.", 22, Color.WHITE, true);
        head.setGravity(Gravity.CENTER);
        hero.addView(head);
        TextView subT = tv("Chat privately, meet people, find a place to stay and shop without switching apps.", 15, Color.parseColor("#DBEAFE"), false);
        subT.setGravity(Gravity.CENTER);
        subT.setPadding(0, dp(10), 0, dp(14));
        hero.addView(subT);

        TextView pill = tv("\uD83D\uDD12  Direct messages are end-to-end encrypted", 13, Color.WHITE, true);
        pill.setPadding(dp(14), dp(8), dp(14), dp(8));
        GradientDrawable pg = new GradientDrawable(); pg.setColor(Color.parseColor("#33FFFFFF")); pg.setCornerRadius(dp(20));
        pill.setBackground(pg);
        LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(-2, -2); plp.bottomMargin = dp(22);
        hero.addView(pill, plp);

        hero.addView(heroButton("Create account", true, v -> render(Mode.SIGNUP)), btnLp());
        hero.addView(heroButton("Log in", false, v -> render(Mode.LOGIN)), btnLp());
        hero.addView(heroButton("Continue with Google", false, v -> finishWith(ACTION_GOOGLE)), btnLp());
        content.addView(hero, new LinearLayout.LayoutParams(-1, -2));

        String[][] features = {
            {"messaging", "Private messaging", "Direct messages are end-to-end encrypted, with delivered and read receipts and typing indicators."},
            {"friends", "Friends", "Send and accept friend requests, search for people and message them straight away."},
            {"accommodation", "Accommodation", "Search rooms and rentals, check availability and book, or list your own place."},
            {"marketplace", "Marketplace", "Browse listings, save the ones you like and sell your own."},
            {"groups", "Groups & communities", "Bring people together in groups with roles and invites."},
            {"status", "Status", "Share a status that friends can view and reply to."}
        };
        for (String[] f : features) content.addView(featureCard(f[0], f[1], f[2]), cardLp());

        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER);
        row.setPadding(0, dp(18), 0, dp(6));
        row.addView(linkText("Terms", SITE + "/legal/terms.html"));
        row.addView(tv("   \u00B7   ", 13, sub, false));
        row.addView(linkText("Privacy", SITE + "/legal/privacy.html"));
        row.addView(tv("   \u00B7   ", 13, sub, false));
        row.addView(linkText("Help", SITE + "/help/"));
        content.addView(row);
        TextView copy = tv("\u00A9 " + java.util.Calendar.getInstance().get(java.util.Calendar.YEAR) + " Necpra", 12, sub, false);
        copy.setGravity(Gravity.CENTER);
        copy.setPadding(0, dp(8), 0, dp(28));
        content.addView(copy);
    }

    private View featureCard(String key, String title, String desc) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(16), dp(16), dp(16), dp(16));
        GradientDrawable g = new GradientDrawable(); g.setColor(card); g.setCornerRadius(dp(18)); g.setStroke(1, line);
        c.setBackground(g);
        int res = 0;
        try { res = getResources().getIdentifier("landing_" + key, "drawable", getPackageName()); } catch (Throwable ignored) { }
        if (res != 0) {   // a real screenshot the project owner added; nothing is drawn if it is absent
            ImageView iv = new ImageView(this);
            iv.setAdjustViewBounds(true);
            iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
            iv.setImageResource(res);
            iv.setContentDescription(title + " screen");
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2); lp.bottomMargin = dp(12);
            c.addView(iv, lp);
        }
        c.addView(tv(title, 18, text, true));
        TextView d = tv(desc, 14, sub, false); d.setPadding(0, dp(4), 0, 0);
        c.addView(d);
        return c;
    }

    private void renderLogin() {
        header("Welcome back", "Log in to Necpra");
        EditText id = field("Email or username", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, "id");
        id.setText(prefillIdentifier);
        EditText pw = passwordField("Password", "pw");
        message = tv("", 14, DANGER, false); message.setVisibility(View.GONE); message.setPadding(dp(24), dp(10), dp(24), 0); content.addView(message);
        primary = bigButton("Log in", v -> {
            String i = id.getText().toString().trim(), p = pw.getText().toString();
            if (i.isEmpty()) { showMessage("Email or username is required", true); return; }
            if (i.indexOf('@') > 0 && !Patterns.EMAIL_ADDRESS.matcher(i).matches()) { showMessage("Please enter a valid email address", true); return; }
            if (p.isEmpty()) { showMessage("Password is required", true); return; }
            prefillIdentifier = i;
            doLogin(i, p);
        });
        TextView forgot = linkText("Forgot password?", null);
        forgot.setOnClickListener(v -> { if (!busy) render(Mode.FORGOT); });
        padded(forgot, 24, 14);
        outlineButton("Continue with Google", v -> { if (!busy) finishWith(ACTION_GOOGLE); });
        TextView sw = linkText("New to Necpra? Create an account", null);
        sw.setOnClickListener(v -> { if (!busy) render(Mode.SIGNUP); });
        padded(sw, 24, 18);
        backLink();
    }

    private void renderSignup() {
        header("Create your account", "Join Necpra");
        EditText name = field("Display name", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS, "name");
        EditText user = field("Username", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS, "user");
        EditText mail = field("Email", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, "mail");
        EditText pw = passwordField("Password (at least 8 characters)", "pw1");
        EditText pw2 = passwordField("Confirm password", "pw2");
        LinearLayout agree = new LinearLayout(this);
        agree.setOrientation(LinearLayout.HORIZONTAL); agree.setGravity(Gravity.CENTER_VERTICAL);
        agree.setPadding(dp(20), dp(12), dp(24), 0);
        CheckBox cb = new CheckBox(this);
        agree.addView(cb);
        TextView t1 = tv("I agree to the ", 14, sub, false);
        agree.addView(t1);
        agree.addView(linkText("Terms", SITE + "/legal/terms.html"));
        agree.addView(tv(" and ", 14, sub, false));
        agree.addView(linkText("Privacy Policy", SITE + "/legal/privacy.html"));
        content.addView(agree);
        message = tv("", 14, DANGER, false); message.setVisibility(View.GONE); message.setPadding(dp(24), dp(10), dp(24), 0); content.addView(message);
        primary = bigButton("Create account", v -> {
            String n = name.getText().toString().trim(), u = user.getText().toString().trim(), e = mail.getText().toString().trim();
            String p = pw.getText().toString(), p2 = pw2.getText().toString();
            if (n.length() < 2) { showMessage("Display name must be at least 2 characters", true); return; }
            if (u.length() < 3) { showMessage("Username must be at least 3 characters", true); return; }
            if (!Patterns.EMAIL_ADDRESS.matcher(e).matches()) { showMessage("Please enter a valid email address", true); return; }
            if (p.length() < 8) { showMessage("Password must be at least 8 characters", true); return; }
            if (!p.equals(p2)) { showMessage("Passwords do not match", true); return; }
            if (!cb.isChecked()) { showMessage("You must accept the terms and conditions", true); return; }
            doRegister(n, u, e, p);
        });
        outlineButton("Continue with Google", v -> { if (!busy) finishWith(ACTION_GOOGLE); });
        TextView sw = linkText("Already have an account? Log in", null);
        sw.setOnClickListener(v -> { if (!busy) render(Mode.LOGIN); });
        padded(sw, 24, 18);
        backLink();
    }

    private void renderMfa() {
        header("Two-step verification", "Enter your 6-digit authenticator code or a backup code");
        EditText code = field("Code", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS, "code");
        message = tv("", 14, DANGER, false); message.setVisibility(View.GONE); message.setPadding(dp(24), dp(10), dp(24), 0); content.addView(message);
        primary = bigButton("Verify", v -> {
            String c = code.getText().toString().trim();
            if (c.isEmpty()) { showMessage("Enter your 6-digit code or a backup code", true); return; }
            doMfa(c);
        });
        TextView cancel = linkText("Cancel", null);
        cancel.setOnClickListener(v -> { if (!busy) { mfaTemp = ""; mfaPassword = ""; render(Mode.LOGIN); } });
        padded(cancel, 24, 18);
    }

    private void renderForgot() {
        header("Reset your password", "We will email you a reset link");
        EditText mail = field("Email", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, "fmail");
        mail.setText(prefillIdentifier.indexOf('@') > 0 ? prefillIdentifier : "");
        message = tv("", 14, DANGER, false); message.setVisibility(View.GONE); message.setPadding(dp(24), dp(10), dp(24), 0); content.addView(message);
        primary = bigButton("Send reset link", v -> {
            String e = mail.getText().toString().trim();
            if (!Patterns.EMAIL_ADDRESS.matcher(e).matches()) { showMessage("Please enter a valid email address", true); return; }
            doForgot(e);
        });
        TextView back = linkText("Back to log in", null);
        back.setOnClickListener(v -> { if (!busy) render(Mode.LOGIN); });
        padded(back, 24, 18);
    }

    // ------------------------------------------------------------------------------------------ network flows

    private void doLogin(String identifier, String password) {
        setBusy(true, "Logging in\u2026");
        io.execute(() -> {
            Resp r = null;
            try { r = post("/api/auth/login", new JSONObject().put("identifier", identifier).put("password", password)); } catch (Exception ignored) { }
            final Resp res = r;
            ui.post(() -> {
                setBusy(false, "Log in");
                if (res == null) { showMessage("Couldn't reach the server. Check your connection and try again.", true); return; }
                if (res.json.optBoolean("requiresMfa", false) && !res.json.optString("tempToken").isEmpty()) {
                    mfaTemp = res.json.optString("tempToken"); mfaPassword = password; render(Mode.MFA); return;
                }
                completeOrShow(res, password, "Login failed. Check your details and try again.");
            });
        });
    }

    private void doMfa(String code) {
        setBusy(true, "Verifying\u2026");
        final String temp = mfaTemp, pw = mfaPassword;
        io.execute(() -> {
            Resp r = null;
            try { r = post("/api/auth/2fa/challenge", new JSONObject().put("tempToken", temp).put("token", code)); } catch (Exception ignored) { }
            final Resp res = r;
            ui.post(() -> {
                setBusy(false, "Verify");
                if (res == null) { showMessage("Couldn't reach the server. Check your connection and try again.", true); return; }
                completeOrShow(res, pw, "Invalid code \u2014 please try again");
            });
        });
    }

    private void doRegister(String name, String username, String email, String password) {
        setBusy(true, "Creating account\u2026");
        io.execute(() -> {
            Resp r = null;
            try {
                r = post("/api/auth/register", new JSONObject().put("email", email).put("username", username).put("password", password)
                        .put("displayName", name).put("name", name).put("acceptPrivacyPolicy", true));
            } catch (Exception ignored) { }
            final Resp res = r;
            ui.post(() -> {
                setBusy(false, "Create account");
                if (res == null) { showMessage("Couldn't reach the server. Check your connection and try again.", true); return; }
                boolean ok = res.status >= 200 && res.status < 300 && res.json.optBoolean("success", true);
                if (ok) {
                    prefillIdentifier = email;
                    notice = "Account created! Please log in to continue."; noticeIsError = null;
                    render(Mode.LOGIN);
                } else {
                    showMessage(res.json.optString("message", "Registration failed. Please check your details and try again."), true);
                }
            });
        });
    }

    private void doForgot(String email) {
        setBusy(true, "Sending\u2026");
        io.execute(() -> {
            Resp r = null;
            try { r = post("/api/auth/forgot-password", new JSONObject().put("email", email)); } catch (Exception ignored) { }
            final Resp res = r;
            ui.post(() -> {
                setBusy(false, "Send reset link");
                if (res == null) { showMessage("Couldn't reach the server. Check your connection and try again.", true); return; }
                boolean ok = res.status >= 200 && res.status < 300;
                showMessage(res.json.optString("message", ok ? "If an account exists for that email, a reset link has been sent." : "Could not send the reset link. Please try again."), !ok);
            });
        });
    }

    /** Success needs a token; otherwise show the server's own message. */
    private void completeOrShow(Resp res, String password, String fallback) {
        JSONObject j = res.json, data = j.optJSONObject("data");
        String token = j.optString("token", "");
        if (token.isEmpty() && data != null) token = data.optString("token", "");
        if (token.isEmpty()) token = j.optString("accessToken", "");
        boolean ok = res.status >= 200 && res.status < 300 && !token.isEmpty();
        if (!ok) { showMessage(j.optString("message", fallback), true); return; }
        JSONObject user = j.optJSONObject("user");
        if (user == null && data != null) user = data.optJSONObject("user");
        String refresh = j.optString("refreshToken", data != null ? data.optString("refreshToken", "") : "");
        String exp = j.optString("expiresAt", data != null ? data.optString("expiresAt", "") : "");
        Pending p = new Pending();
        p.token = token; p.refreshToken = refresh; p.userJson = user == null ? "" : user.toString(); p.password = password; p.expiresAt = exp;
        pending = p;
        mfaTemp = ""; mfaPassword = "";
        finishWith(ACTION_LOGIN);
    }

    private static final class Resp { int status; JSONObject json = new JSONObject(); }

    /** POST with the same cold-start tolerance as the web login: long read timeout and one retry. */
    private Resp post(String path, JSONObject body) throws Exception {
        Exception last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            try { return postOnce(path, body); }
            catch (IOException e) {
                last = e;
                if (attempt == 0) { ui.post(() -> { if (busy && primary != null) primary.setText("Server is waking up\u2026"); }); Thread.sleep(3000); }
            }
        }
        throw last == null ? new IOException("request failed") : last;
    }

    private Resp postOnce(String path, JSONObject body) throws Exception {
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(NativeBackgroundSync.backendOrigin(getApplication()) + path).openConnection();
            h.setRequestMethod("POST");
            h.setConnectTimeout(20000);
            h.setReadTimeout(65000);
            h.setDoOutput(true);
            h.setRequestProperty("Content-Type", "application/json");
            h.setRequestProperty("Accept", "application/json");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = h.getOutputStream()) { os.write(bytes); }
            int status = h.getResponseCode();
            java.io.InputStream stream = status >= 200 && status < 400 ? h.getInputStream() : h.getErrorStream();
            String raw = stream == null ? "" : NativeBackgroundSync.readText(stream);
            Resp r = new Resp(); r.status = status;
            try { if (raw != null && !raw.trim().isEmpty()) r.json = new JSONObject(raw); } catch (Exception notJson) { r.json = new JSONObject().put("message", "Unexpected response from the server (HTTP " + status + ")"); }
            return r;
        } finally { if (h != null) h.disconnect(); }
    }

    // ------------------------------------------------------------------------------------------ result / helpers

    private void finishWith(String action) {
        Intent out = new Intent();
        out.putExtra(RES_ACTION, action);
        setResult(RESULT_OK, out);
        finish();
    }

    private void setBusy(boolean on, String label) {
        busy = on;
        if (primary != null) { primary.setEnabled(!on); primary.setAlpha(on ? 0.7f : 1f); primary.setText(label); }
        if (on && message != null) message.setVisibility(View.GONE);
    }

    private void showMessage(String s, boolean error) {
        if (message == null) return;
        message.setTextColor(error ? DANGER : OK);
        message.setText(s);
        message.setVisibility(View.VISIBLE);
    }

    private void openUrl(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Throwable ignored) { }
    }

    private int dp(int v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, Resources.getSystem().getDisplayMetrics())); }

    private TextView tv(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp); t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private TextView linkText(String s, String url) {
        TextView t = tv(s, 14, PRIMARY, true);
        if (url != null) t.setOnClickListener(v -> openUrl(url));
        t.setPadding(0, dp(6), 0, dp(6));
        return t;
    }

    private void padded(View v, int sidePx, int topDp) {
        v.setPadding(dp(sidePx), dp(topDp), dp(sidePx), 0);
        if (v.getParent() == null) content.addView(v);
    }

    private void header(String title, String subtitle) {
        TextView back = tv("\u2190", 24, text, true);
        back.setPadding(dp(20), dp(36), dp(20), dp(8));
        back.setOnClickListener(v -> { if (!busy) { if (mode == Mode.MFA || mode == Mode.FORGOT) render(Mode.LOGIN); else render(Mode.LANDING); } });
        content.addView(back);
        TextView t = tv(title, 26, text, true); t.setPadding(dp(24), dp(4), dp(24), 0); content.addView(t);
        TextView s = tv(subtitle, 15, sub, false); s.setPadding(dp(24), dp(4), dp(24), dp(14)); content.addView(s);
    }

    private void backLink() { content.addView(tv("", 12, sub, false), new LinearLayout.LayoutParams(-1, dp(28))); }

    private EditText field(String hint, int inputType, String tag) {
        EditText e = new EditText(this);
        e.setHint(hint); e.setInputType(inputType); e.setSingleLine(true); e.setTag(tag);
        e.setTextColor(text); e.setHintTextColor(sub);
        e.setPadding(dp(14), dp(14), dp(14), dp(14));
        GradientDrawable g = new GradientDrawable(); g.setColor(card); g.setCornerRadius(dp(12)); g.setStroke(1, line);
        e.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(dp(24), dp(6), dp(24), dp(6));
        content.addView(e, lp);
        return e;
    }

    private EditText passwordField(String hint, String tag) {
        EditText e = field(hint, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD, tag);
        e.setTransformationMethod(PasswordTransformationMethod.getInstance());
        TextView show = tv("Show password", 13, PRIMARY, true);
        show.setPadding(dp(26), dp(2), dp(24), dp(2));
        show.setOnClickListener(v -> {
            boolean hidden = e.getTransformationMethod() instanceof PasswordTransformationMethod;
            e.setTransformationMethod(hidden ? HideReturnsTransformationMethod.getInstance() : PasswordTransformationMethod.getInstance());
            e.setSelection(e.getText().length());
            show.setText(hidden ? "Hide password" : "Show password");
        });
        content.addView(show);
        return e;
    }

    private Button bigButton(String label, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label); b.setAllCaps(false); b.setTextColor(Color.WHITE); b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        GradientDrawable g = new GradientDrawable(); g.setColor(PRIMARY); g.setCornerRadius(dp(14)); b.setBackground(g);
        b.setOnClickListener(v -> { if (!busy) l.onClick(v); });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(52)); lp.setMargins(dp(24), dp(16), dp(24), 0);
        content.addView(b, lp);
        return b;
    }

    private void outlineButton(String label, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label); b.setAllCaps(false); b.setTextColor(text); b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        GradientDrawable g = new GradientDrawable(); g.setColor(card); g.setCornerRadius(dp(14)); g.setStroke(1, line); b.setBackground(g);
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(50)); lp.setMargins(dp(24), dp(12), dp(24), 0);
        content.addView(b, lp);
    }

    private Button heroButton(String label, boolean filled, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label); b.setAllCaps(false); b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(14));
        if (filled) { g.setColor(Color.WHITE); b.setTextColor(PRIMARY_DARK); }
        else { g.setColor(Color.parseColor("#22FFFFFF")); g.setStroke(dp(1), Color.parseColor("#80FFFFFF")); b.setTextColor(Color.WHITE); }
        b.setBackground(g);
        b.setOnClickListener(l);
        return b;
    }

    private LinearLayout.LayoutParams btnLp() { LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(52)); lp.topMargin = dp(10); return lp; }
    private LinearLayout.LayoutParams cardLp() { LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2); lp.setMargins(dp(16), dp(14), dp(16), 0); return lp; }
}
