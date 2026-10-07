package com.necpa;

import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native conversation list (Phase 3). Reads ONLY from the local Room database through
 * {@link NecpraMessageRepository}; the network just refreshes that database, so the list opens instantly and works offline.
 * Direct chats open {@link NecpraChatActivity}; group chats are handed back to the web layer (groups are not part of this phase).
 */
public class NecpraConversationsActivity extends AppCompatActivity implements NecpraMessageRepository.Listener {

    static final String RES_SESSION_EXPIRED = "sessionExpired";
    static final String RES_GROUP_ID = "groupId";
    static final String RES_OPEN_WEB_GROUPS = "openWebGroups";   // "Manage" tapped: hand over to the web group module (create / members / settings)
    static final String EXTRA_FILTER = "filter";                  // "group": show only group chats (the Groups tab)
    private boolean groupsOnly;
    private final androidx.activity.result.ActivityResultLauncher<Intent> chatLauncher = registerForActivityResult(
            new androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult(), res -> {
                Intent d = res == null ? null : res.getData();       // the chat asked for the web group manager
                long gid = d == null ? 0L : d.getLongExtra(RES_GROUP_ID, 0L);
                if (gid > 0) { Intent r = new Intent(); r.putExtra(RES_GROUP_ID, gid); r.putExtra(RES_SESSION_EXPIRED, this.expired); setResult(RESULT_OK, r); finish(); }
            });
    /** Native "New group": on success the new chat opens straight away. */
    private final androidx.activity.result.ActivityResultLauncher<Intent> createLauncher = registerForActivityResult(
            new androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult(), res -> {
                Intent d = res == null ? null : res.getData();
                if (d != null && d.getBooleanExtra(NecpraGroupActivity.RES_SESSION_EXPIRED, false)) { expired = true; finishWithResult(); return; }
                long id = d == null ? 0L : d.getLongExtra(NecpraGroupActivity.RES_CREATED_CHAT, 0L);
                reload();
                if (id > 0) chatLauncher.launch(NecpraChatActivity.intent(this, id, 0L, d.getStringExtra(NecpraGroupActivity.RES_CREATED_TITLE), null));
            });
    private static final long POLL_MS = 10_000L;

    // ---------------------------------------------------------------- shared look (also used by NecpraChatActivity)

    static final class Theme {
        final boolean dark;
        final int bg, surface, text, subtext, divider, accent, mineBubble, theirsBubble, mineText, theirsText, danger;
        Theme(Context c) {
            dark = (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
            bg = dark ? 0xFF0B1220 : 0xFFF3F4F6;
            surface = dark ? 0xFF111827 : 0xFFFFFFFF;
            text = dark ? 0xFFF9FAFB : 0xFF111827;
            subtext = dark ? 0xFF9CA3AF : 0xFF6B7280;
            divider = dark ? 0xFF1F2937 : 0xFFE5E7EB;
            accent = 0xFF2563EB;
            mineBubble = 0xFF2563EB; mineText = 0xFFFFFFFF;
            theirsBubble = dark ? 0xFF1F2937 : 0xFFFFFFFF; theirsText = text;
            danger = 0xFFDC2626;
        }
    }

    static int dp(Context c, float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics())); }

    static GradientDrawable rounded(int color, float radiusDp, Context c) {
        GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(c, radiusDp)); return g;
    }

    /** Applies system-bar and keyboard insets as padding so content never hides behind the status bar, nav bar or IME. */
    static void applyInsets(View root) {
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets b = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            v.setPadding(b.left, b.top, b.right, b.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }

    private static final ExecutorService AVATAR_POOL = Executors.newFixedThreadPool(3);
    private static final LruCache<String, Bitmap> AVATARS = new LruCache<>(80);
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    /** Circular avatar: initial letter immediately, picture when it has downloaded (https only, cached in memory). */
    static void bindAvatar(final ImageView iv, final TextView letter, final String url, final String name) {
        String n = name == null ? "" : name.trim();
        letter.setText(n.isEmpty() ? "?" : n.substring(0, n.offsetByCodePoints(0, 1)).toUpperCase());
        iv.setImageDrawable(null); iv.setTag(url);
        if (url == null || !url.startsWith("https://")) { letter.setVisibility(View.VISIBLE); return; }
        Bitmap hit = AVATARS.get(url);
        if (hit != null) { iv.setImageBitmap(hit); letter.setVisibility(View.GONE); return; }
        letter.setVisibility(View.VISIBLE);
        AVATAR_POOL.execute(() -> {
            HttpURLConnection h = null;
            try {
                h = (HttpURLConnection) new URL(url).openConnection();
                h.setConnectTimeout(10000); h.setReadTimeout(15000);
                try (InputStream in = h.getInputStream()) {
                    BitmapFactory.Options o = new BitmapFactory.Options(); o.inSampleSize = 2;
                    Bitmap b = BitmapFactory.decodeStream(in, null, o);
                    if (b != null) { AVATARS.put(url, b); MAIN.post(() -> { if (url.equals(iv.getTag())) { iv.setImageBitmap(b); letter.setVisibility(View.GONE); } }); }
                }
            } catch (Exception ignored) { } finally { if (h != null) h.disconnect(); }
        });
    }

    static FrameLayout avatarView(Context c, int sizeDp, Theme t, ImageView[] ivOut, TextView[] letterOut) {
        FrameLayout f = new FrameLayout(c);
        f.setLayoutParams(new ViewGroup.LayoutParams(dp(c, sizeDp), dp(c, sizeDp)));
        f.setBackground(rounded(t.accent, sizeDp / 2f, c));
        f.setOutlineProvider(new ViewOutlineProvider() {
            @Override public void getOutline(View v, Outline o) { o.setOval(0, 0, v.getWidth(), v.getHeight()); }
        });
        f.setClipToOutline(true);
        TextView l = new TextView(c); l.setTextColor(Color.WHITE); l.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeDp * 0.4f); l.setGravity(Gravity.CENTER); l.setTypeface(Typeface.DEFAULT_BOLD);
        ImageView iv = new ImageView(c); iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
        f.addView(l, new FrameLayout.LayoutParams(-1, -1)); f.addView(iv, new FrameLayout.LayoutParams(-1, -1));
        ivOut[0] = iv; letterOut[0] = l;
        return f;
    }

    static String timeLabel(long ts) {
        if (ts <= 0) return "";
        Calendar now = Calendar.getInstance(), then = Calendar.getInstance(); then.setTimeInMillis(ts);
        if (now.get(Calendar.YEAR) == then.get(Calendar.YEAR) && now.get(Calendar.DAY_OF_YEAR) == then.get(Calendar.DAY_OF_YEAR))
            return DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(ts));
        now.add(Calendar.DAY_OF_YEAR, -1);
        if (now.get(Calendar.YEAR) == then.get(Calendar.YEAR) && now.get(Calendar.DAY_OF_YEAR) == then.get(Calendar.DAY_OF_YEAR)) return "Yesterday";
        return DateFormat.getDateInstance(DateFormat.SHORT).format(new Date(ts));
    }

    // ---------------------------------------------------------------- screen

    private NecpraMessageRepository repo;
    private Theme t;
    private ConvAdapter adapter;
    private TextView banner, empty;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean resumed;
    private boolean expired;
    private final Runnable poll = new Runnable() {
        @Override public void run() { if (!resumed) return; refresh(); handler.postDelayed(this, POLL_MS); }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        repo = NecpraMessageRepository.get(this);
        t = new Theme(this);
        groupsOnly = "group".equals(getIntent().getStringExtra(EXTRA_FILTER));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(t.bg);
        applyInsets(root);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL); header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(t.surface);
        header.setPadding(dp(this, 4), dp(this, 6), dp(this, 16), dp(this, 6));
        TextView back = new TextView(this); back.setText("\u2039"); back.setTextSize(TypedValue.COMPLEX_UNIT_SP, 32); back.setTextColor(t.text);
        back.setGravity(Gravity.CENTER); back.setContentDescription("Back");
        back.setOnClickListener(v -> finishWithResult());
        header.addView(back, new LinearLayout.LayoutParams(dp(this, 48), dp(this, 48)));
        TextView title = new TextView(this); title.setText(groupsOnly ? "Groups" : "Messages"); title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20); title.setTypeface(Typeface.DEFAULT_BOLD); title.setTextColor(t.text);
        header.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView lock = new TextView(this); lock.setText("\uD83D\uDD12 End-to-end encrypted"); lock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12); lock.setTextColor(t.subtext);
        if (groupsOnly) {
            TextView manage = new TextView(this); manage.setText("Manage"); manage.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14); manage.setTypeface(Typeface.DEFAULT_BOLD);
            manage.setTextColor(t.accent); manage.setPadding(dp(this, 8), dp(this, 8), dp(this, 8), dp(this, 8));
            manage.setContentDescription("Create or manage groups");
            manage.setText("New group");
            manage.setContentDescription("Create a group");
            manage.setOnClickListener(v -> {
                if (repo.groupsOn()) { createLauncher.launch(NecpraGroupActivity.createIntent(this)); return; }
                Intent r = new Intent(); r.putExtra(RES_OPEN_WEB_GROUPS, true); r.putExtra(RES_SESSION_EXPIRED, expired); setResult(RESULT_OK, r); finish();
            });

            header.addView(manage);
        } else header.addView(lock);
        root.addView(header, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));

        banner = new TextView(this);
        banner.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13); banner.setTextColor(Color.WHITE); banner.setPadding(dp(this, 16), dp(this, 8), dp(this, 16), dp(this, 8));
        banner.setBackgroundColor(t.danger); banner.setVisibility(View.GONE);
        root.addView(banner, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));

        FrameLayout body = new FrameLayout(this);
        RecyclerView list = new RecyclerView(this);
        list.setLayoutManager(new LinearLayoutManager(this));
        adapter = new ConvAdapter();
        list.setAdapter(adapter);
        body.addView(list, new FrameLayout.LayoutParams(-1, -1));
        empty = new TextView(this); empty.setTextColor(t.subtext); empty.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15); empty.setGravity(Gravity.CENTER);
        empty.setPadding(dp(this, 32), dp(this, 32), dp(this, 32), dp(this, 32));
        body.addView(empty, new FrameLayout.LayoutParams(-1, -1));
        root.addView(body, new LinearLayout.LayoutParams(-1, 0, 1f));
        setContentView(root);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { finishWithResult(); }
        });

        if (!repo.ready()) {
            String why = repo.lastProvisionError();
            showBanner("Secure messaging isn't set up on this device yet" + (why != null && !why.isEmpty() ? " \u2014 " + why : ""));
        }
        reload();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        repo.addListener(this);
        NecpraRealtime.get(this).start();            // live list: new messages / receipts trigger the normal catch-up
        repo.drainAsync();
        handler.removeCallbacks(poll); handler.post(poll);
        reload();
    }

    @Override protected void onPause() {
        resumed = false;
        handler.removeCallbacks(poll);
        repo.removeListener(this);
        NecpraRealtime.get(this).stop();
        super.onPause();
    }

    private void finishWithResult() {
        Intent r = new Intent(); r.putExtra(RES_SESSION_EXPIRED, expired);
        setResult(RESULT_OK, r); finish();
    }

    private void showBanner(String m) { banner.setText(m); banner.setVisibility(m == null ? View.GONE : View.VISIBLE); }

    private void refresh() {
        repo.async(() -> {
            try {
                repo.refreshConversations();
                runOnUiThread(() -> { if (repo.ready()) showBanner(null); });
            } catch (NativeBackgroundSync.SessionExpiredException e) {
                runOnUiThread(() -> { expired = true; finishWithResult(); });
            } catch (Exception e) {
                runOnUiThread(() -> { if (adapter.getItemCount() == 0) showBanner("You're offline \u2014 showing what's on this device"); });
            }
        });
    }

    private void reload() {
        repo.async(() -> {
            final List<NecpraDb.Conv> all = repo.loadConversations();
            final List<NecpraDb.Conv> rows = new ArrayList<>();
            for (NecpraDb.Conv c : all) if (!groupsOnly || "group".equals(c.type)) rows.add(c);
            runOnUiThread(() -> {
                adapter.set(rows);
                empty.setText(rows.isEmpty() ? (groupsOnly ? "No groups yet.\nTap New group to create one." : "No conversations yet.\nStart one from Friends.") : "");
                empty.setVisibility(rows.isEmpty() ? View.VISIBLE : View.GONE);
            });
        });
    }

    @Override public void onConversationsChanged() { reload(); }
    @Override public void onMessagesChanged(long chatId) { }
    @Override public void onNotice(String message, boolean sessionExpired) {
        if (sessionExpired) { expired = true; finishWithResult(); } else showBanner(message);
    }

    private void open(NecpraDb.Conv c) {
        if ("group".equals(c.type) && !repo.groupsOn()) {          // groups stay in the web module unless native owns them
            Intent r = new Intent(); r.putExtra(RES_GROUP_ID, c.chatId); setResult(RESULT_OK, r); finish();
            return;
        }
        chatLauncher.launch(NecpraChatActivity.intent(this, c.chatId, c.peerId, c.title, c.avatar));
    }

    // ---------------------------------------------------------------- adapter

    private final class ConvAdapter extends RecyclerView.Adapter<ConvAdapter.VH> {
        private List<NecpraDb.Conv> rows = new ArrayList<>();
        void set(List<NecpraDb.Conv> r) { rows = r; notifyDataSetChanged(); }
        @Override public int getItemCount() { return rows.size(); }

        final class VH extends RecyclerView.ViewHolder {
            final ImageView img; final TextView letter, name, preview, time, badge;
            VH(View v, ImageView i, TextView l, TextView n, TextView p, TextView tm, TextView bd) { super(v); img = i; letter = l; name = n; preview = p; time = tm; badge = bd; }
        }

        @Override public VH onCreateViewHolder(ViewGroup p, int type) {
            Context c = p.getContext();
            LinearLayout row = new LinearLayout(c);
            row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER_VERTICAL);
            row.setBackgroundColor(t.surface);
            row.setPadding(dp(c, 16), dp(c, 12), dp(c, 16), dp(c, 12));
            row.setLayoutParams(new RecyclerView.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));
            ImageView[] iv = new ImageView[1]; TextView[] lt = new TextView[1];
            FrameLayout av = avatarView(c, 48, t, iv, lt);
            row.addView(av);
            LinearLayout mid = new LinearLayout(c); mid.setOrientation(LinearLayout.VERTICAL);
            LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f); mlp.leftMargin = dp(c, 12); mlp.rightMargin = dp(c, 8);
            TextView name = new TextView(c); name.setTextColor(t.text); name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16); name.setTypeface(Typeface.DEFAULT_BOLD); name.setSingleLine(true); name.setEllipsize(TextUtils.TruncateAt.END);
            TextView prev = new TextView(c); prev.setTextColor(t.subtext); prev.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14); prev.setSingleLine(true); prev.setEllipsize(TextUtils.TruncateAt.END);
            mid.addView(name); mid.addView(prev);
            row.addView(mid, mlp);
            LinearLayout right = new LinearLayout(c); right.setOrientation(LinearLayout.VERTICAL); right.setGravity(Gravity.END);
            TextView tm = new TextView(c); tm.setTextColor(t.subtext); tm.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
            TextView bd = new TextView(c); bd.setTextColor(Color.WHITE); bd.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12); bd.setTypeface(Typeface.DEFAULT_BOLD); bd.setGravity(Gravity.CENTER);
            bd.setBackground(rounded(t.accent, 10, c)); bd.setMinWidth(dp(c, 20)); bd.setPadding(dp(c, 6), dp(c, 1), dp(c, 6), dp(c, 1));
            LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT); blp.topMargin = dp(c, 4);
            right.addView(tm); right.addView(bd, blp);
            row.addView(right);
            return new VH(row, iv[0], lt[0], name, prev, tm, bd);
        }

        @Override public void onBindViewHolder(VH h, int pos) {
            final NecpraDb.Conv c = rows.get(pos);
            h.name.setText(c.title);
            h.preview.setText(c.lastPreview == null ? "" : c.lastPreview);
            h.time.setText(timeLabel(c.lastAt));
            h.badge.setVisibility(c.unread > 0 ? View.VISIBLE : View.GONE);
            h.badge.setText(c.unread > 99 ? "99+" : String.valueOf(c.unread));
            h.name.setTextColor(t.text);
            bindAvatar(h.img, h.letter, c.avatar, c.title);
            h.itemView.setOnClickListener(v -> open(c));
            h.itemView.setContentDescription(c.title + (c.unread > 0 ? ", " + c.unread + " unread" : ""));
        }
    }
}
