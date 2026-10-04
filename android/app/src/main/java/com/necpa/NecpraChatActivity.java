package com.necpa;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Native chat screen (Phase 3): header, message list, composer.
 *
 * The list is rendered from the local Room database only. Opening a chat paints local history immediately, then
 * catches up from /sync?sinceId=; scrolling to the top pages older history with ?before=. Sends are queued with a
 * stable clientMessageId, shown at once, and retried by the repository until the server acknowledges them.
 * Live updates (messages, receipts, typing, presence) come from NecpraRealtime (Socket.IO); the /sync poll stays as a slow safety net
 * (fast while the socket is down).
 */
public class NecpraChatActivity extends AppCompatActivity implements NecpraMessageRepository.Listener, NecpraRealtime.Listener {

    private static final String X_CHAT = "chatId", X_PEER = "peerId", X_TITLE = "title", X_AVATAR = "avatar";
    private static final long POLL_MS = 3_000L, POLL_LIVE_MS = 20_000L, TYPING_EMIT_MS = 2_500L, TYPING_IDLE_MS = 4_000L, PEER_TYPING_TTL_MS = 6_000L;
    private static final String[] EMOJIS = {"\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDE4F"};

    static Intent intent(Context c, long chatId, long peerId, String title, String avatar) {
        return new Intent(c, NecpraChatActivity.class).putExtra(X_CHAT, chatId).putExtra(X_PEER, peerId).putExtra(X_TITLE, title).putExtra(X_AVATAR, avatar);
    }

    private NecpraMessageRepository repo;
    private NecpraConversationsActivity.Theme t;
    private long chatId, peerId;
    private String title, avatar;

    private RecyclerView list;
    private LinearLayoutManager lm;
    private MsgAdapter adapter;
    private EditText input;
    private TextView sendBtn, banner, replyBar;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private int windowSize = NecpraMessageRepository.PAGE;
    private boolean hasMore = true, loadingOlder, resumed, ready;
    private long lastMarkedServerId;
    private NecpraDb.Msg replyTo;
    private String replyToPreview;
    private final Runnable saveDraft = () -> { final long id = chatId; final String txt = input.getText().toString(); if (id > 0) repo.async(() -> repo.saveDraft(id, txt)); };
    private NecpraRealtime rt;
    private TextView nameView, subView;
    private ImageView avatarImg; private TextView avatarLetter;
    private boolean peerTyping, peerOnline;
    private long lastTypingEmit;
    private static final String SUB_BASE = "\uD83D\uDD12 End-to-end encrypted";
    private final Runnable poll = new Runnable() {
        @Override public void run() { if (!resumed) return; syncNow(); handler.postDelayed(this, rt != null && rt.isConnected() ? POLL_LIVE_MS : POLL_MS); }
    };
    private final Runnable stopTyping = () -> { lastTypingEmit = 0; if (rt != null) rt.typing(chatId, false); };
    private final Runnable peerTypingExpire = () -> { peerTyping = false; refreshSub(); };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        repo = NecpraMessageRepository.get(this);
        rt = NecpraRealtime.get(this);
        t = new NecpraConversationsActivity.Theme(this);
        Intent in = getIntent();
        chatId = in.getLongExtra(X_CHAT, 0); peerId = in.getLongExtra(X_PEER, 0);
        title = in.getStringExtra(X_TITLE); avatar = in.getStringExtra(X_AVATAR);
        if (title == null || title.isEmpty()) title = "Chat";
        ready = repo.ready();
        buildUi();
        if (chatId > 0) start(); else resolveThenStart();
    }

    // ---------------------------------------------------------------- UI

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(t.bg);
        NecpraConversationsActivity.applyInsets(root);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL); header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(t.surface);
        header.setPadding(dp(4), dp(6), dp(16), dp(6));
        TextView back = new TextView(this); back.setText("\u2039"); back.setTextSize(TypedValue.COMPLEX_UNIT_SP, 32); back.setTextColor(t.text);
        back.setGravity(Gravity.CENTER); back.setContentDescription("Back"); back.setOnClickListener(v -> finish());
        header.addView(back, new LinearLayout.LayoutParams(dp(44), dp(48)));
        ImageView[] iv = new ImageView[1]; TextView[] lt = new TextView[1];
        FrameLayout av = NecpraConversationsActivity.avatarView(this, 40, t, iv, lt);
        header.addView(av);
        NecpraConversationsActivity.bindAvatar(iv[0], lt[0], avatar, title);
        avatarImg = iv[0]; avatarLetter = lt[0];
        LinearLayout names = new LinearLayout(this); names.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f); nlp.leftMargin = dp(10);
        TextView name = new TextView(this); name.setText(title); name.setTextColor(t.text); name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17); name.setTypeface(Typeface.DEFAULT_BOLD); name.setSingleLine(true); name.setEllipsize(TextUtils.TruncateAt.END);
        TextView sub = new TextView(this); sub.setText(SUB_BASE); sub.setTextColor(t.subtext); sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        nameView = name; subView = sub;
        names.addView(name); names.addView(sub);
        header.addView(names, nlp);
        root.addView(header, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));

        banner = new TextView(this);
        banner.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13); banner.setTextColor(Color.WHITE); banner.setPadding(dp(16), dp(8), dp(16), dp(8));
        banner.setBackgroundColor(t.danger); banner.setVisibility(View.GONE);
        root.addView(banner, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));

        list = new RecyclerView(this);
        lm = new LinearLayoutManager(this); lm.setStackFromEnd(true);
        list.setLayoutManager(lm);
        adapter = new MsgAdapter();
        list.setAdapter(adapter);
        list.setPadding(dp(8), dp(8), dp(8), dp(8)); list.setClipToPadding(false);
        list.addOnScrollListener(new RecyclerView.OnScrollListener() {
            @Override public void onScrolled(RecyclerView rv, int dx, int dy) {
                if (dy < 0 && hasMore && !loadingOlder && lm.findFirstVisibleItemPosition() <= 2 && adapter.getItemCount() > 0) loadOlder();
            }
        });
        root.addView(list, new LinearLayout.LayoutParams(-1, 0, 1f));

        replyBar = new TextView(this);
        replyBar.setTextColor(t.subtext); replyBar.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13); replyBar.setSingleLine(true); replyBar.setEllipsize(TextUtils.TruncateAt.END);
        replyBar.setBackgroundColor(t.surface); replyBar.setPadding(dp(16), dp(8), dp(16), dp(8)); replyBar.setVisibility(View.GONE);
        replyBar.setOnClickListener(v -> clearReply());
        root.addView(replyBar, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout composer = new LinearLayout(this);
        composer.setOrientation(LinearLayout.HORIZONTAL); composer.setGravity(Gravity.BOTTOM);
        composer.setBackgroundColor(t.surface); composer.setPadding(dp(8), dp(8), dp(8), dp(8));
        input = new EditText(this);
        input.setHint("Message"); input.setHintTextColor(t.subtext); input.setTextColor(t.text);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setMaxLines(5);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(NecpraMessageRepository.MAX_TEXT)});
        input.setBackground(NecpraConversationsActivity.rounded(t.dark ? 0xFF1F2937 : 0xFFF3F4F6, 20, this));
        input.setPadding(dp(16), dp(10), dp(16), dp(10));
        composer.addView(input, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        sendBtn = new TextView(this);
        sendBtn.setText("Send"); sendBtn.setTextColor(Color.WHITE); sendBtn.setTypeface(Typeface.DEFAULT_BOLD); sendBtn.setGravity(Gravity.CENTER);
        sendBtn.setPadding(dp(16), 0, dp(16), 0); sendBtn.setBackground(NecpraConversationsActivity.rounded(t.accent, 20, this));
        sendBtn.setContentDescription("Send message");
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(42)); slp.leftMargin = dp(8);
        composer.addView(sendBtn, slp);
        root.addView(composer, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);

        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(Editable s) {
                updateSend(); handler.removeCallbacks(saveDraft); handler.postDelayed(saveDraft, 600);
                if (s.length() > 0 && ready && chatId > 0) {
                    long now = System.currentTimeMillis();
                    if (now - lastTypingEmit >= TYPING_EMIT_MS) { lastTypingEmit = now; rt.typing(chatId, true); }
                    handler.removeCallbacks(stopTyping); handler.postDelayed(stopTyping, TYPING_IDLE_MS);
                } else if (s.length() == 0) { handler.removeCallbacks(stopTyping); stopTyping.run(); }
            }
        });
        sendBtn.setOnClickListener(v -> doSend());
        if (!ready) {
            String why = repo.lastProvisionError();
            showBanner("Secure messaging isn't set up on this device yet" + (why != null && !why.isEmpty() ? " \u2014 " + why : ""));
            input.setEnabled(false); input.setHint("Unavailable until secure messaging is set up");
        }
        updateSend();
    }

    private int dp(float v) { return NecpraConversationsActivity.dp(this, v); }

    private void showBanner(String m) { banner.setText(m); banner.setVisibility(m == null ? View.GONE : View.VISIBLE); }

    private void updateSend() {
        boolean on = ready && input.getText().toString().trim().length() > 0;
        sendBtn.setAlpha(on ? 1f : 0.45f); sendBtn.setEnabled(on);
    }

    /** Opened from a notification / deep link with only a chat id: take name, avatar and peer from the local row. */
    private void adoptConversation(NecpraDb.Conv c) {
        if (peerId <= 0 && c.peerId > 0) peerId = c.peerId;
        boolean generic = title == null || title.isEmpty() || "Chat".equals(title);
        if (generic && c.title != null && !c.title.isEmpty() && !"Chat".equals(c.title)) {
            title = c.title; nameView.setText(title);
            if (avatar == null || avatar.isEmpty()) avatar = c.avatar;
            NecpraConversationsActivity.bindAvatar(avatarImg, avatarLetter, avatar, title);
        }
    }

    private void refreshSub() { subView.setText(peerTyping ? "typing\u2026" : (peerOnline ? "online" : SUB_BASE)); }

    // ---------------------------------------------------------------- realtime

    @Override public void onTyping(long cid, long userId, boolean typing) {
        if (cid != chatId || (peerId > 0 && userId != peerId)) return;
        peerTyping = typing; handler.removeCallbacks(peerTypingExpire);
        if (typing) handler.postDelayed(peerTypingExpire, PEER_TYPING_TTL_MS);
        refreshSub();
    }
    @Override public void onPresence(long userId, boolean online) {
        if (peerId <= 0 || userId != peerId) return;
        peerOnline = online; refreshSub();
    }
    @Override public void onConnectionChanged(boolean connected) {
        if (connected) syncNow();                       // catch up on anything missed while the socket was down
        else { peerTyping = false; peerOnline = false; refreshSub(); }
        if (resumed) { handler.removeCallbacks(poll); handler.postDelayed(poll, connected ? POLL_LIVE_MS : POLL_MS); }
    }

    // ---------------------------------------------------------------- lifecycle

    private void resolveThenStart() {
        repo.async(() -> {
            try {
                final long id = repo.resolveDirectChat(peerId, title, avatar);
                runOnUiThread(() -> { chatId = id; if (resumed) { NecpraNotifier.activeKey = NecpraNotifier.key("c", String.valueOf(id)); NecpraNotifier.cancelConversation(this, NecpraNotifier.activeKey); } start(); });
            } catch (Exception e) {
                runOnUiThread(() -> showBanner("Couldn't open this chat \u2014 check your connection"));
            }
        });
    }

    private void start() {
        repo.async(() -> {
            NecpraDb.Conv found = null;
            for (NecpraDb.Conv c : repo.loadConversations()) if (c.chatId == chatId) { found = c; break; }
            final NecpraDb.Conv known = found;
            if (known != null) runOnUiThread(() -> adoptConversation(known));
        });
        repo.async(() -> {
            final String draft = repo.loadDraft(chatId);
            runOnUiThread(() -> { if (input.getText().length() == 0 && draft != null && !draft.isEmpty()) input.setText(draft); });
        });
        reload(true, 0, 0);
        if (resumed) { repo.addListener(this); handler.removeCallbacks(poll); handler.post(poll); }
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        ready = repo.ready();
        repo.addListener(this);
        rt.addListener(this); rt.start();
        NecpraNotifier.nativeForeground = true;
        if (chatId > 0) { NecpraNotifier.activeKey = NecpraNotifier.key("c", String.valueOf(chatId)); NecpraNotifier.cancelConversation(this, NecpraNotifier.activeKey); }
        repo.drainAsync();
        if (chatId > 0) { handler.removeCallbacks(poll); handler.post(poll); }
    }

    @Override protected void onPause() {
        resumed = false;
        handler.removeCallbacks(poll); handler.removeCallbacks(saveDraft);
        handler.removeCallbacks(stopTyping); handler.removeCallbacks(peerTypingExpire); stopTyping.run();
        rt.removeListener(this); rt.stop();
        NecpraNotifier.nativeForeground = false;
        if (NecpraNotifier.activeKey != null && NecpraNotifier.activeKey.equals(NecpraNotifier.key("c", String.valueOf(chatId)))) NecpraNotifier.activeKey = null;
        if (chatId > 0 && input != null) { final long id = chatId; final String txt = input.getText().toString(); repo.async(() -> repo.saveDraft(id, txt)); }
        repo.removeListener(this);
        super.onPause();
    }

    // ---------------------------------------------------------------- data

    private void syncNow() {
        if (chatId <= 0 || !ready) return;
        final long id = chatId;
        repo.async(() -> {
            try {
                repo.syncChat(id);
                runOnUiThread(() -> { if (ready) showBanner(null); });
            } catch (NativeBackgroundSync.SessionExpiredException e) {
                runOnUiThread(() -> { Toast.makeText(this, "Session expired \u2014 please sign in again", Toast.LENGTH_LONG).show(); setResult(RESULT_OK, new Intent().putExtra(NecpraConversationsActivity.RES_SESSION_EXPIRED, true)); finish(); });
            } catch (IOException e) {
                runOnUiThread(() -> showBanner("You're offline \u2014 messages will send when you're back"));
            } catch (Exception ignored) { }
        });
    }

    /** @param anchorLocalId when > 0, keep that message at the same screen offset after the list grows upward. */
    private void reload(final boolean forceBottom, final long anchorLocalId, final int anchorOffset) {
        if (chatId <= 0) return;
        final long id = chatId; final int win = windowSize;
        final boolean wasAtBottom = adapter.getItemCount() == 0 || lm.findLastVisibleItemPosition() >= adapter.getItemCount() - 2;
        repo.async(() -> {
            final List<NecpraMessageRepository.Item> items = repo.loadWindow(id, win);
            long newestIncoming = 0;
            for (NecpraMessageRepository.Item it : items) if (!it.msg.mine && it.msg.serverId > newestIncoming) newestIncoming = it.msg.serverId;
            final boolean needsRead = resumed && newestIncoming > lastMarkedServerId;
            if (needsRead) lastMarkedServerId = newestIncoming;
            runOnUiThread(() -> {
                adapter.set(items);
                if (anchorLocalId > 0) {
                    for (int i = 0; i < items.size(); i++) if (items.get(i).msg.localId == anchorLocalId) { lm.scrollToPositionWithOffset(i, anchorOffset); break; }
                } else if ((forceBottom || wasAtBottom) && !items.isEmpty()) {
                    list.scrollToPosition(items.size() - 1);
                }
            });
            if (needsRead) repo.markRead(id);
        });
    }

    private void loadOlder() {
        loadingOlder = true;
        final int first = lm.findFirstVisibleItemPosition();
        final NecpraMessageRepository.Item top = first >= 0 ? adapter.items.get(first) : null;
        final View v = first >= 0 ? lm.findViewByPosition(first) : null;
        final int offset = v == null ? 0 : v.getTop() - list.getPaddingTop();
        final int current = windowSize; final long id = chatId;
        repo.async(() -> {
            try {
                boolean more = repo.loadOlder(id, current);
                runOnUiThread(() -> { hasMore = more; windowSize = current + NecpraMessageRepository.PAGE; reload(false, top == null ? 0 : top.msg.localId, offset); loadingOlder = false; });
            } catch (Exception e) {
                runOnUiThread(() -> { loadingOlder = false; });
            }
        });
    }

    @Override public void onConversationsChanged() { }
    @Override public void onMessagesChanged(long id) { if (id == chatId) reload(false, 0, 0); }
    @Override public void onNotice(String message, boolean sessionExpired) {
        if (sessionExpired) { setResult(RESULT_OK, new Intent().putExtra(NecpraConversationsActivity.RES_SESSION_EXPIRED, true)); finish(); }
        else showBanner(message);
    }

    // ---------------------------------------------------------------- actions

    private void doSend() {
        String txt = input.getText().toString();
        if (txt.trim().isEmpty() || chatId <= 0 || !ready) return;
        repo.send(chatId, txt, replyTo == null ? 0 : replyTo.serverId);
        input.setText(""); clearReply();
        windowSize = Math.max(windowSize, adapter.getItemCount() + 1);
        reload(true, 0, 0);
    }

    private void setReply(NecpraMessageRepository.Item it) {
        if (it.msg.serverId <= 0) return;
        replyTo = it.msg; replyToPreview = it.text != null ? it.text : NecpraMessageRepository.labelForType(it.msg.type);
        replyBar.setText("\u21A9 Replying to: " + replyToPreview.replace('\n', ' ') + "   \u2715");
        replyBar.setVisibility(View.VISIBLE);
        input.requestFocus();
    }

    private void clearReply() { replyTo = null; replyToPreview = null; replyBar.setVisibility(View.GONE); }

    private void showActions(final NecpraMessageRepository.Item it) {
        List<String> labels = new ArrayList<>(); final List<Runnable> acts = new ArrayList<>();
        if (it.msg.mine && it.msg.status == NecpraMessageRepository.ST_FAILED) { labels.add("Retry sending"); acts.add(() -> repo.retry(it.msg.localId)); }
        if (it.msg.serverId > 0) { labels.add("Reply"); acts.add(() -> setReply(it)); }
        if (it.text != null) {
            labels.add("Copy");
            acts.add(() -> { ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE); if (cm != null) { cm.setPrimaryClip(ClipData.newPlainText("message", it.text)); Toast.makeText(this, "Copied", Toast.LENGTH_SHORT).show(); } });
        }
        if (it.msg.serverId > 0) { labels.add("React"); acts.add(() -> showReactions(it)); }
        if (labels.isEmpty()) return;
        new AlertDialog.Builder(this).setItems(labels.toArray(new String[0]), (d, which) -> acts.get(which).run()).show();
    }

    private void showReactions(final NecpraMessageRepository.Item it) {
        new AlertDialog.Builder(this).setItems(EMOJIS, (d, which) -> repo.async(() -> {
            try { repo.react(it.msg.localId, EMOJIS[which]); }
            catch (Exception e) { runOnUiThread(() -> Toast.makeText(this, "Couldn't react \u2014 check your connection", Toast.LENGTH_SHORT).show()); }
        })).show();
    }

    private void openAttachment(NecpraDb.Att a) {
        if (a.url == null || !a.url.startsWith("https://")) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(a.url))); } catch (Exception ignored) { }
    }

    // ---------------------------------------------------------------- adapter

    private final class MsgAdapter extends RecyclerView.Adapter<MsgAdapter.VH> {
        List<NecpraMessageRepository.Item> items = new ArrayList<>();
        void set(List<NecpraMessageRepository.Item> n) { items = n; notifyDataSetChanged(); }
        @Override public int getItemCount() { return items.size(); }
        @Override public int getItemViewType(int p) { return items.get(p).msg.mine ? 1 : 0; }

        final class VH extends RecyclerView.ViewHolder {
            final LinearLayout bubble; final TextView reply, text, attach, reacts, meta;
            VH(View root, LinearLayout b, TextView r, TextView tx, TextView at, TextView rc, TextView m) { super(root); bubble = b; reply = r; text = tx; attach = at; reacts = rc; meta = m; }
        }

        @Override public VH onCreateViewHolder(ViewGroup p, int type) {
            final boolean mine = type == 1;
            Context c = p.getContext();
            int maxW = Math.round(c.getResources().getDisplayMetrics().widthPixels * 0.75f);
            LinearLayout row = new LinearLayout(c);
            row.setLayoutParams(new RecyclerView.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));
            row.setGravity(mine ? Gravity.END : Gravity.START);
            row.setPadding(0, dp(2), 0, dp(2));
            LinearLayout bubble = new LinearLayout(c); bubble.setOrientation(LinearLayout.VERTICAL);
            bubble.setBackground(NecpraConversationsActivity.rounded(mine ? t.mineBubble : t.theirsBubble, 16, c));
            bubble.setPadding(dp(12), dp(8), dp(12), dp(6));
            int fg = mine ? t.mineText : t.theirsText, sub = mine ? 0xCCFFFFFF : t.subtext;
            TextView reply = new TextView(c); reply.setTextColor(sub); reply.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12); reply.setMaxLines(2); reply.setEllipsize(TextUtils.TruncateAt.END); reply.setMaxWidth(maxW);
            reply.setPadding(dp(8), dp(2), dp(8), dp(2)); reply.setBackground(NecpraConversationsActivity.rounded(mine ? 0x33FFFFFF : (t.dark ? 0xFF111827 : 0xFFF3F4F6), 8, c));
            TextView text = new TextView(c); text.setTextColor(fg); text.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16); text.setMaxWidth(maxW); text.setTextIsSelectable(false);
            TextView attach = new TextView(c); attach.setTextColor(fg); attach.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14); attach.setMaxWidth(maxW); attach.setPaintFlags(attach.getPaintFlags() | android.graphics.Paint.UNDERLINE_TEXT_FLAG);
            TextView reacts = new TextView(c); reacts.setTextColor(fg); reacts.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            TextView meta = new TextView(c); meta.setTextColor(sub); meta.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11); meta.setGravity(Gravity.END);
            LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT); gap.bottomMargin = dp(4);
            bubble.addView(reply, gap); bubble.addView(text); bubble.addView(attach); bubble.addView(reacts);
            LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); mlp.topMargin = dp(2);
            bubble.addView(meta, mlp);
            row.addView(bubble, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            return new VH(row, bubble, reply, text, attach, reacts, meta);
        }

        @Override public void onBindViewHolder(VH h, int pos) {
            final NecpraMessageRepository.Item it = items.get(pos);
            final NecpraDb.Msg m = it.msg;
            h.reply.setVisibility(it.replyText == null ? View.GONE : View.VISIBLE);
            if (it.replyText != null) h.reply.setText(it.replyText.replace('\n', ' '));

            String body = it.text; boolean placeholder = false;
            if (body == null) {
                if (!it.atts.isEmpty()) body = "";
                else if (m.cryptoState == NecpraMessageRepository.CS_UNSUPPORTED) { body = "\uD83D\uDD12 Encrypted message (unsupported version)"; placeholder = true; }
                else if (m.cryptoState == NecpraMessageRepository.CS_FAILED) { body = "\uD83D\uDD12 Couldn't decrypt this message on this device"; placeholder = true; }
                else if (m.cryptoState == NecpraMessageRepository.CS_OWN_UNAVAILABLE) { body = "\uD83D\uDD12 Sent from another device"; placeholder = true; }
                else if (m.type != null && !"text".equals(m.type)) body = NecpraMessageRepository.labelForType(m.type);
                else body = "";
            }
            h.text.setText(body);
            h.text.setVisibility(body.isEmpty() ? View.GONE : View.VISIBLE);
            h.text.setTypeface(Typeface.DEFAULT, placeholder ? Typeface.ITALIC : Typeface.NORMAL);

            if (it.atts.isEmpty()) h.attach.setVisibility(View.GONE);
            else {
                StringBuilder sb = new StringBuilder();
                for (NecpraDb.Att a : it.atts) { if (sb.length() > 0) sb.append('\n'); sb.append("image".equals(a.kind) ? "\uD83D\uDCF7 " : "\uD83D\uDCCE ").append(a.name != null && !a.name.isEmpty() ? a.name : NecpraMessageRepository.labelForType(a.kind)); }
                h.attach.setText(sb); h.attach.setVisibility(View.VISIBLE);
                final NecpraDb.Att first = it.atts.get(0);
                h.attach.setOnClickListener(v -> openAttachment(first));
            }

            if (it.reactions.isEmpty()) h.reacts.setVisibility(View.GONE);
            else {
                StringBuilder sb = new StringBuilder();
                for (Map.Entry<String, Integer> e : it.reactions.entrySet()) { if (sb.length() > 0) sb.append("  "); sb.append(e.getKey()); if (e.getValue() > 1) sb.append(' ').append(e.getValue()); }
                h.reacts.setText(sb); h.reacts.setVisibility(View.VISIBLE);
            }

            StringBuilder meta = new StringBuilder(NecpraConversationsActivity.timeLabel(m.sortTs));
            if (m.edited) meta.append(" \u00B7 edited");
            if (m.mine) {
                switch (m.status) {
                    case NecpraMessageRepository.ST_QUEUED: meta.append("  \uD83D\uDD53"); break;
                    case NecpraMessageRepository.ST_SENT: meta.append("  \u2713"); break;
                    case NecpraMessageRepository.ST_DELIVERED: meta.append("  \u2713\u2713"); break;
                    case NecpraMessageRepository.ST_READ: meta.append("  \u2713\u2713 read"); break;
                    case NecpraMessageRepository.ST_FAILED: meta.append("  \u26A0 ").append(m.lastError == null ? "Not sent" : m.lastError).append(" \u2014 tap to retry"); break;
                    default: break;
                }
            }
            h.meta.setText(meta);
            h.meta.setTextColor(m.mine && m.status == NecpraMessageRepository.ST_FAILED ? 0xFFFECACA : (m.mine ? 0xCCFFFFFF : t.subtext));
            h.bubble.setOnClickListener(v -> { if (m.mine && m.status == NecpraMessageRepository.ST_FAILED) repo.retry(m.localId); });
            h.bubble.setOnLongClickListener(v -> { showActions(it); return true; });
        }
    }
}
