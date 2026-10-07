package com.necpa;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputFilter;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Native group manager: create a group, and (for an existing group) see members, add / remove members,
 * promote / demote admins, rename and leave. Same session + single-refresh HTTP path as the other native screens
 * (NecpraMessageRepository#api). Not exported: started only by the native Messages screens.
 *
 *   POST   /api/chats                                  {name, participantIds[]}     create  -> data.chat.id
 *   GET    /api/friends?limit=100                      friends[]                    member picker
 *   GET    /api/group-admin/:id/members                data[{id, role, user}]       roles: owner | admin | member
 *   POST   /api/group-admin/:id/members                {userId}                     add (admins, or anyone if the group allows it)
 *   DELETE /api/group-admin/:id/members/:userId                                     remove (admins; only the owner removes admins)
 *   PATCH  /api/group-admin/:id/members/:userId/role   {role: admin|member}         owner only
 *   GET/POST /api/group-admin/:id/invites, DELETE .../invites/:token                    invite links (admins) -> shared as WEB_ORIGIN/group.html?invite=TOKEN
 *   GET /api/group-admin/:id/join-requests, PATCH .../join-requests/:requestId {action}  approve | reject (admins)
 *   PATCH  /api/group-admin/:id/members/:userId/mute   {muted}                      mute / unmute a member (admins; only the owner mutes admins)
 *   PATCH  /api/group-admin/:id/settings               {settings:{...}}              group policies (admins)
 *   PATCH  /api/group-admin/:id/ownership              {userId}                     owner only; the old owner becomes an admin
 *   PATCH  /api/chats/:id                              {name}                       owner only
 *   POST   /api/group-admin/:id/leave                                               the owner must transfer ownership first (server 409)
 *
 * Membership changes start a new group-key epoch on the server; NecpraGroupE2E re-keys on the next send (409 GROUP_SENDER_KEY_*),
 * so nothing extra is needed here and no key material ever passes through this screen.
 */
public class NecpraGroupActivity extends AppCompatActivity {
    static final String X_MODE = "mode", X_CHAT = "chatId", X_TITLE = "title";
    static final String RES_CREATED_CHAT = "createdChatId", RES_CREATED_TITLE = "createdTitle", RES_SESSION_EXPIRED = "sessionExpired";

    static Intent createIntent(Context c) { return new Intent(c, NecpraGroupActivity.class).putExtra(X_MODE, "create"); }
    static Intent infoIntent(Context c, long chatId, String title) {
        return new Intent(c, NecpraGroupActivity.class).putExtra(X_MODE, "info").putExtra(X_CHAT, chatId).putExtra(X_TITLE, title);
    }

    private static final class Friend { long id; String name; }
    private static final class Member { long id; String name; String role; boolean muted; }
    private interface Job { void run() throws Exception; }

    private NecpraMessageRepository repo;
    private NecpraConversationsActivity.Theme t;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean createMode;
    private long chatId, me;
    private String title;

    private final List<Friend> friends = new ArrayList<>();
    private boolean friendsLoaded;
    private final Set<Long> picked = new LinkedHashSet<>();     // create mode: chosen friend ids
    private final List<Member> members = new ArrayList<>();
    private String myRole = "member";
    private boolean busy;
    private int pendingRequests;
    private boolean pendingLoaded;
    /** Canonical web host (same one MainActivity trusts for https deep links); the web group page consumes ?invite=TOKEN. */
    private static final String WEB_ORIGIN = "https://necpra.co.ke";
    private static final String[] SET_KEYS = {"allowMemberInvites", "allowMedia", "allowReactions", "allowReplies", "allowEditing", "allowDeleting", "requireAdminApproval"};
    private static final String[] SET_LABELS = {"Members can add people", "Members can send files & media", "Members can react", "Members can reply", "Members can edit their messages", "Members can delete their messages", "Admins must approve new members"};
    private static final boolean[] SET_DEFAULT = {true, true, true, true, true, true, false};

    private LinearLayout content;
    private TextView headerTitle;
    private EditText nameInput;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        repo = NecpraMessageRepository.get(this);
        t = new NecpraConversationsActivity.Theme(this);
        me = repo.me();
        Intent in = getIntent();
        createMode = !"info".equals(in.getStringExtra(X_MODE));
        chatId = in.getLongExtra(X_CHAT, 0L);
        title = in.getStringExtra(X_TITLE);
        if (title == null || title.isEmpty()) title = "Group";
        buildUi();
        if (createMode) { renderCreate(); loadFriends(null); }
        else { renderInfo(); loadMembers(); }
    }

    @Override protected void onDestroy() { super.onDestroy(); ui.removeCallbacksAndMessages(null); }

    // ------------------------------------------------------------------ UI scaffolding

    private int dp(float v) { return NecpraConversationsActivity.dp(this, v); }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(t.bg);
        NecpraConversationsActivity.applyInsets(root);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL); header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(t.surface); header.setPadding(dp(4), dp(4), dp(12), dp(4));
        TextView back = new TextView(this);
        back.setText("\u2190"); back.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22); back.setTextColor(t.text); back.setGravity(Gravity.CENTER);
        back.setContentDescription("Back"); back.setOnClickListener(v -> finish());
        header.addView(back, new LinearLayout.LayoutParams(dp(48), dp(48)));
        headerTitle = new TextView(this);
        headerTitle.setText(createMode ? "New group" : "Group info"); headerTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        headerTitle.setTypeface(Typeface.DEFAULT_BOLD); headerTitle.setTextColor(t.text);
        header.addView(headerTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        root.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(16), dp(16), dp(16), dp(24));
        scroll.addView(content, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    private TextView label(String s, int sp, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(s); v.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp); v.setTextColor(color);
        if (bold) v.setTypeface(Typeface.DEFAULT_BOLD);
        return v;
    }

    private TextView button(String s, int bg, int fg) {
        TextView v = label(s, 16, fg, true);
        v.setGravity(Gravity.CENTER); v.setPadding(dp(16), dp(12), dp(16), dp(12));
        GradientDrawable d = new GradientDrawable(); d.setColor(bg); d.setCornerRadius(dp(12)); v.setBackground(d);
        return v;
    }

    private TextView secondary(String s, View.OnClickListener l) {
        TextView v = button(s, t.surface, t.accent);
        v.setOnClickListener(l);
        return v;
    }

    private LinearLayout.LayoutParams matchWrap(int topDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(topDp);
        return lp;
    }

    // ------------------------------------------------------------------ plumbing

    private void toast(String s) { ui.post(() -> { if (!isFinishing() && !isDestroyed()) Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }); }

    /** Runs a network job off the UI thread. A dead session ends the screen (the caller opens the login); other errors toast. */
    private void work(Job j, Runnable onFail) {
        repo.async(() -> {
            try { j.run(); }
            catch (NativeBackgroundSync.SessionExpiredException e) {
                ui.post(() -> { if (isFinishing()) return; Intent r = new Intent().putExtra(RES_SESSION_EXPIRED, true); setResult(RESULT_OK, r); finish(); });
            } catch (Exception e) {
                String m = e.getMessage();
                toast(m == null || m.isEmpty() ? "Couldn't reach the server \u2014 check your connection" : m);
                if (onFail != null) ui.post(onFail);
            }
        });
    }

    private static String nameOf(JSONObject u) {
        if (u == null) return "User";
        String d = u.optString("displayName", "");
        if (d.isEmpty() || "null".equals(d)) {
            String f = u.optString("firstName", ""), l = u.optString("lastName", "");
            d = ((f.equals("null") ? "" : f) + " " + (l.equals("null") ? "" : l)).trim();
        }
        if (d.isEmpty()) d = u.optString("username", "");
        return d.isEmpty() || "null".equals(d) ? "User" : d;
    }

    private void loadFriends(Runnable then) {
        if (friendsLoaded) { if (then != null) then.run(); return; }
        work(() -> {
            NecpraMessageRepository.Resp r = repo.api("GET", "/api/friends?limit=100", null);
            if (!r.ok()) throw new IOException(r.message());
            JSONArray a = r.json == null ? null : r.json.optJSONArray("friends");
            if (a == null && r.json != null) {
                JSONObject d = r.json.optJSONObject("data");
                if (d != null) a = d.optJSONArray("friends");
                if (a == null && d != null) a = d.optJSONArray("items");
                if (a == null) a = r.json.optJSONArray("data");
            }
            final List<Friend> out = new ArrayList<>();
            Set<Long> seen = new HashSet<>();
            for (int i = 0; a != null && i < a.length(); i++) {
                JSONObject f = a.optJSONObject(i); if (f == null) continue;
                JSONObject u = f.optJSONObject("friend") != null ? f.optJSONObject("friend") : (f.optJSONObject("user") != null ? f.optJSONObject("user") : f);
                long id = u.optLong("id", 0L); if (id <= 0) id = f.optLong("friendId", f.optLong("userId", 0L));
                if (id <= 0 || id == me || !seen.add(id)) continue;
                Friend fr = new Friend(); fr.id = id; fr.name = nameOf(u); out.add(fr);
            }
            ui.post(() -> { friends.clear(); friends.addAll(out); friendsLoaded = true; if (then != null) then.run(); });
        }, null);
    }

    // ------------------------------------------------------------------ create mode

    private TextView pickedBtn;
    private TextView createBtn;

    private void renderCreate() {
        content.removeAllViews();
        content.addView(label("Group name", 13, t.subtext, true), matchWrap(0));
        nameInput = new EditText(this);
        nameInput.setHint("e.g. Weekend plans"); nameInput.setHintTextColor(t.subtext); nameInput.setTextColor(t.text);
        nameInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17); nameInput.setSingleLine(true);
        nameInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        nameInput.setFilters(new InputFilter[]{new InputFilter.LengthFilter(100)});
        content.addView(nameInput, matchWrap(4));

        content.addView(label("Members", 13, t.subtext, true), matchWrap(20));
        pickedBtn = button("", t.surface, t.accent);
        pickedBtn.setOnClickListener(v -> loadFriends(this::showCreatePicker));
        content.addView(pickedBtn, matchWrap(6));
        refreshPickedLabel();

        content.addView(label("\uD83D\uDD12 Group messages are end-to-end encrypted. Keys are set up for every member automatically.", 13, t.subtext, false), matchWrap(14));
        createBtn = button("Create group", t.accent, 0xFFFFFFFF);
        createBtn.setOnClickListener(v -> doCreate());
        content.addView(createBtn, matchWrap(24));
    }

    private void refreshPickedLabel() {
        if (pickedBtn != null) pickedBtn.setText(picked.isEmpty() ? "Choose members" : picked.size() + " selected \u2014 tap to change");
    }

    private void showCreatePicker() {
        if (isFinishing()) return;
        if (friends.isEmpty()) { toast("You have no friends to add yet \u2014 add friends first"); return; }
        final String[] names = new String[friends.size()]; final boolean[] on = new boolean[friends.size()];
        for (int i = 0; i < friends.size(); i++) { names[i] = friends.get(i).name; on[i] = picked.contains(friends.get(i).id); }
        new AlertDialog.Builder(this).setTitle("Choose members")
                .setMultiChoiceItems(names, on, (d, i, c) -> on[i] = c)
                .setPositiveButton("Done", (d, w) -> {
                    picked.clear();
                    for (int i = 0; i < on.length; i++) if (on[i]) picked.add(friends.get(i).id);
                    refreshPickedLabel();
                }).setNegativeButton("Cancel", null).show();
    }

    private void doCreate() {
        if (busy) return;
        final String name = nameInput.getText().toString().trim();
        if (name.isEmpty()) { toast("Give the group a name"); return; }
        if (picked.isEmpty()) { toast("Add at least one member"); return; }
        busy = true; createBtn.setText("Creating\u2026"); createBtn.setAlpha(0.6f);
        final List<Long> ids = new ArrayList<>(picked);
        work(() -> {
            JSONArray arr = new JSONArray(); for (Long id : ids) arr.put(id.longValue());
            NecpraMessageRepository.Resp r = repo.api("POST", "/api/chats", new JSONObject().put("name", name).put("participantIds", arr));
            if (!r.ok()) throw new IOException(r.message());
            JSONObject d = r.json == null ? null : r.json.optJSONObject("data");
            JSONObject chat = d == null ? null : d.optJSONObject("chat");
            final long newId = chat == null ? 0L : chat.optLong("id", 0L);
            try { repo.refreshConversations(); }
            catch (NativeBackgroundSync.SessionExpiredException e) { throw e; }
            catch (Exception ignored) { }
            ui.post(() -> {
                if (isFinishing()) return;
                setResult(RESULT_OK, new Intent().putExtra(RES_CREATED_CHAT, newId).putExtra(RES_CREATED_TITLE, name));
                finish();
            });
        }, () -> { busy = false; if (createBtn != null) { createBtn.setText("Create group"); createBtn.setAlpha(1f); } });
    }

    // ------------------------------------------------------------------ info mode

    private boolean iAmOwner() { return "owner".equals(myRole); }
    private boolean iAmManager() { return "owner".equals(myRole) || "admin".equals(myRole); }

    private void loadMembers() {
        if (chatId <= 0) { toast("This group can't be opened"); return; }
        work(() -> {
            NecpraMessageRepository.Resp r = repo.api("GET", "/api/group-admin/" + chatId + "/members", null);
            if (!r.ok()) throw new IOException(r.message());
            JSONArray a = r.json == null ? null : r.json.optJSONArray("data");
            final List<Member> out = new ArrayList<>(); String mine = "member";
            for (int i = 0; a != null && i < a.length(); i++) {
                JSONObject o = a.optJSONObject(i); if (o == null) continue;
                Member m = new Member(); m.id = o.optLong("id", 0L); if (m.id <= 0) continue;
                m.role = o.optString("role", "member"); m.name = nameOf(o.optJSONObject("user")); m.muted = o.optBoolean("isMuted", false);
                if (m.id == me) mine = m.role;
                out.add(m);
            }
            final String myR = mine;
            ui.post(() -> {
                members.clear(); members.addAll(out); myRole = myR;
                if (isFinishing()) return;
                renderInfo();
                if (iAmManager() && !pendingLoaded) { pendingLoaded = true; loadPending(); }
            });
        }, null);
    }

    private void renderInfo() {
        content.removeAllViews();
        TextView name = label(title, 24, t.text, true);
        if (iAmOwner()) { name.setOnClickListener(v -> promptRename()); name.setContentDescription("Group name, tap to rename"); }
        content.addView(name, matchWrap(0));
        String sub = members.isEmpty() ? "Loading members\u2026" : members.size() + (members.size() == 1 ? " member" : " members") + (iAmOwner() ? " \u00B7 tap the name to rename" : "");
        content.addView(label(sub, 13, t.subtext, false), matchWrap(2));

        for (final Member m : members) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(14), dp(12), dp(14), dp(12));
            GradientDrawable bg = new GradientDrawable(); bg.setColor(t.surface); bg.setCornerRadius(dp(12)); row.setBackground(bg);
            TextView initial = label(m.name.isEmpty() ? "?" : m.name.substring(0, 1).toUpperCase(java.util.Locale.ROOT), 16, 0xFFFFFFFF, true);
            initial.setGravity(Gravity.CENTER);
            GradientDrawable av = new GradientDrawable(); av.setShape(GradientDrawable.OVAL); av.setColor(t.accent); initial.setBackground(av);
            row.addView(initial, new LinearLayout.LayoutParams(dp(38), dp(38)));
            TextView nm = label(m.id == me ? m.name + " (you)" : m.name, 16, t.text, false);
            LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f); nlp.leftMargin = dp(12);
            row.addView(nm, nlp);
            if (m.muted) { TextView mt = label("Muted  ", 12, t.subtext, true); row.addView(mt); }
            if (!"member".equals(m.role)) row.addView(label("owner".equals(m.role) ? "Owner" : "Admin", 12, t.accent, true));
            if (m.id != me) row.setOnClickListener(v -> memberMenu(m));
            content.addView(row, matchWrap(8));
        }

        TextView add = button("Add members", t.accent, 0xFFFFFFFF);
        add.setOnClickListener(v -> loadFriends(this::showAddPicker));
        content.addView(add, matchWrap(22));
        if (iAmManager()) {
            content.addView(secondary("Invite link", v -> showInvites()), matchWrap(10));
            content.addView(secondary(pendingRequests > 0 ? "Join requests (" + pendingRequests + ")" : "Join requests", v -> showJoinRequests()), matchWrap(10));
            content.addView(secondary("Group settings", v -> showSettings()), matchWrap(10));
        }
        TextView leave = button("Leave group", t.surface, t.danger);
        leave.setOnClickListener(v -> confirmLeave());
        content.addView(leave, matchWrap(10));
        if (!members.isEmpty()) content.addView(label("\uD83D\uDD12 Adding or removing someone changes the group's encryption keys. The next message re-keys automatically.", 12, t.subtext, false), matchWrap(14));
    }

    private void memberMenu(final Member m) {
        if (!iAmManager() || "owner".equals(m.role)) return;
        final List<String> items = new ArrayList<>(); final List<Integer> ops = new ArrayList<>();   // 0 remove, 1 make admin, 2 remove admin, 3 make owner, 4 mute, 5 unmute
        if (!"admin".equals(m.role) || iAmOwner()) { items.add("Remove from group"); ops.add(0); items.add(m.muted ? "Unmute member" : "Mute member"); ops.add(m.muted ? 5 : 4); }
        if (iAmOwner()) {
            if ("admin".equals(m.role)) { items.add("Remove admin role"); ops.add(2); } else { items.add("Make admin"); ops.add(1); }
            items.add("Make group owner"); ops.add(3);
        }
        if (items.isEmpty()) return;
        new AlertDialog.Builder(this).setTitle(m.name).setItems(items.toArray(new String[0]), (d, which) -> {
            int op = ops.get(which);
            if (op == 0) {
                new AlertDialog.Builder(this).setTitle("Remove " + m.name + "?").setMessage("They will no longer receive new messages from this group.")
                        .setPositiveButton("Remove", (d2, w2) -> work(() -> {
                            NecpraMessageRepository.Resp r = repo.api("DELETE", "/api/group-admin/" + chatId + "/members/" + m.id, null);
                            if (!r.ok()) throw new IOException(r.message());
                            ui.post(this::loadMembers);
                        }, null)).setNegativeButton("Cancel", null).show();
            } else if (op == 4 || op == 5) {
                final boolean mute = op == 4;
                work(() -> {
                    NecpraMessageRepository.Resp r = repo.api("PATCH", "/api/group-admin/" + chatId + "/members/" + m.id + "/mute", new JSONObject().put("muted", mute));
                    if (!r.ok()) throw new IOException(r.message());
                    ui.post(this::loadMembers);
                }, null);
            } else if (op == 3) {
                new AlertDialog.Builder(this).setTitle("Make " + m.name + " the owner?")
                        .setMessage("They will control this group. You will become an admin and can then leave the group.")
                        .setPositiveButton("Transfer", (d2, w2) -> work(() -> {
                            NecpraMessageRepository.Resp r = repo.api("PATCH", "/api/group-admin/" + chatId + "/ownership", new JSONObject().put("userId", m.id));
                            if (!r.ok()) throw new IOException(r.message());
                            ui.post(this::loadMembers);
                        }, null)).setNegativeButton("Cancel", null).show();
            } else {
                final String role = op == 1 ? "admin" : "member";
                work(() -> {
                    NecpraMessageRepository.Resp r = repo.api("PATCH", "/api/group-admin/" + chatId + "/members/" + m.id + "/role", new JSONObject().put("role", role));
                    if (!r.ok()) throw new IOException(r.message());
                    ui.post(this::loadMembers);
                }, null);
            }
        }).show();
    }

    private void showAddPicker() {
        if (isFinishing()) return;
        final Set<Long> inGroup = new HashSet<>(); for (Member m : members) inGroup.add(m.id);
        final List<Friend> candidates = new ArrayList<>(); for (Friend f : friends) if (!inGroup.contains(f.id)) candidates.add(f);
        if (candidates.isEmpty()) { toast("All your friends are already in this group"); return; }
        final String[] names = new String[candidates.size()]; final boolean[] on = new boolean[candidates.size()];
        for (int i = 0; i < candidates.size(); i++) names[i] = candidates.get(i).name;
        new AlertDialog.Builder(this).setTitle("Add members")
                .setMultiChoiceItems(names, on, (d, i, c) -> on[i] = c)
                .setPositiveButton("Add", (d, w) -> {
                    final List<Friend> chosen = new ArrayList<>();
                    for (int i = 0; i < on.length; i++) if (on[i]) chosen.add(candidates.get(i));
                    if (chosen.isEmpty()) return;
                    work(() -> {
                        int failed = 0; String why = null;
                        for (Friend f : chosen) {
                            NecpraMessageRepository.Resp r = repo.api("POST", "/api/group-admin/" + chatId + "/members", new JSONObject().put("userId", f.id));
                            if (!r.ok()) { failed++; why = r.message(); }
                        }
                        if (failed > 0) toast(failed == chosen.size() ? why : failed + " couldn't be added: " + why);
                        ui.post(this::loadMembers);
                    }, null);
                }).setNegativeButton("Cancel", null).show();
    }

    private void promptRename() {
        final EditText in = new EditText(this);
        in.setText(title); in.setSingleLine(true); in.setFilters(new InputFilter[]{new InputFilter.LengthFilter(100)});
        in.setSelection(in.getText().length());
        new AlertDialog.Builder(this).setTitle("Rename group").setView(in)
                .setPositiveButton("Save", (d, w) -> {
                    final String n = in.getText().toString().trim();
                    if (n.isEmpty() || n.equals(title)) return;
                    work(() -> {
                        NecpraMessageRepository.Resp r = repo.api("PATCH", "/api/chats/" + chatId, new JSONObject().put("name", n));
                        if (!r.ok()) throw new IOException(r.message());
                        try { repo.refreshConversations(); } catch (NativeBackgroundSync.SessionExpiredException e) { throw e; } catch (Exception ignored) { }
                        ui.post(() -> { title = n; if (!isFinishing()) renderInfo(); });
                    }, null);
                }).setNegativeButton("Cancel", null).show();
    }

    private void confirmLeave() {
        new AlertDialog.Builder(this).setTitle("Leave \"" + title + "\"?")
                .setMessage("You will stop receiving messages from this group.")
                .setPositiveButton("Leave", (d, w) -> work(() -> {
                    NecpraMessageRepository.Resp r = repo.api("POST", "/api/group-admin/" + chatId + "/leave", null);
                    if (!r.ok()) throw new IOException(r.message());   // owners get the server's "transfer ownership first" message
                    try { repo.refreshConversations(); } catch (NativeBackgroundSync.SessionExpiredException e) { throw e; } catch (Exception ignored) { }
                    ui.post(() -> { if (isFinishing()) return; setResult(RESULT_FIRST_USER); finish(); });
                }, null)).setNegativeButton("Cancel", null).show();
    }

    // ------------------------------------------------------------------ invite links

    private void showInvites() {
        work(() -> {
            NecpraMessageRepository.Resp r = repo.api("GET", "/api/group-admin/" + chatId + "/invites", null);
            if (!r.ok()) throw new IOException(r.message());
            JSONArray a = r.json == null ? null : r.json.optJSONArray("data");
            final List<JSONObject> list = new ArrayList<>();
            for (int i = 0; a != null && i < a.length(); i++) {
                JSONObject o = a.optJSONObject(i);
                if (o != null && o.optBoolean("active", true) && !o.optString("token", "").isEmpty()) list.add(o);
            }
            ui.post(() -> showInviteDialog(list));
        }, null);
    }

    private void showInviteDialog(final List<JSONObject> list) {
        if (isFinishing()) return;
        final List<String> items = new ArrayList<>();
        items.add("+ Create a new invite link");
        for (int i = 0; i < list.size(); i++) items.add("Invite link " + (i + 1) + "  \u00B7  " + list.get(i).optInt("uses", 0) + " joined");
        new AlertDialog.Builder(this).setTitle("Invite links")
                .setItems(items.toArray(new String[0]), (d, which) -> { if (which == 0) createInvite(); else inviteActions(list.get(which - 1)); })
                .setNegativeButton("Close", null).show();
    }

    private void createInvite() {
        work(() -> {
            NecpraMessageRepository.Resp r = repo.api("POST", "/api/group-admin/" + chatId + "/invites", new JSONObject());
            if (!r.ok()) throw new IOException(r.message());
            final JSONObject created = r.json == null ? null : r.json.optJSONObject("data");
            if (created == null || created.optString("token", "").isEmpty()) throw new IOException("The server didn't return an invite link");
            ui.post(() -> inviteActions(created));
        }, null);
    }

    private void inviteActions(final JSONObject inv) {
        if (isFinishing()) return;
        final String token = inv.optString("token", "");
        final String url = WEB_ORIGIN + "/group.html?invite=" + Uri.encode(token);
        new AlertDialog.Builder(this).setTitle("Invite link").setMessage(url)
                .setPositiveButton("Share", (d, w) -> {
                    Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                            .putExtra(Intent.EXTRA_TEXT, "Join my group \"" + title + "\" on Necpra: " + url);
                    startActivity(Intent.createChooser(send, "Share invite link"));
                })
                .setNeutralButton("Copy", (d, w) -> {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) { cm.setPrimaryClip(ClipData.newPlainText("Invite link", url)); toast("Link copied"); }
                })
                .setNegativeButton("Revoke", (d, w) -> work(() -> {
                    NecpraMessageRepository.Resp r = repo.api("DELETE", "/api/group-admin/" + chatId + "/invites/" + Uri.encode(token), null);
                    if (!r.ok()) throw new IOException(r.message());
                    toast("Invite link revoked");
                }, null)).show();
    }

    // ------------------------------------------------------------------ join requests

    private void loadPending() {
        work(() -> {
            NecpraMessageRepository.Resp r = repo.api("GET", "/api/group-admin/" + chatId + "/join-requests", null);
            if (!r.ok()) return;                       // not a manager / feature off: just no badge
            JSONArray a = r.json == null ? null : r.json.optJSONArray("data");
            final int n = a == null ? 0 : a.length();
            ui.post(() -> { pendingRequests = n; if (!isFinishing()) renderInfo(); });
        }, null);
    }

    private void showJoinRequests() {
        work(() -> {
            NecpraMessageRepository.Resp r = repo.api("GET", "/api/group-admin/" + chatId + "/join-requests", null);
            if (!r.ok()) throw new IOException(r.message());
            JSONArray a = r.json == null ? null : r.json.optJSONArray("data");
            final List<String> ids = new ArrayList<>(); final List<String> names = new ArrayList<>();
            for (int i = 0; a != null && i < a.length(); i++) {
                JSONObject o = a.optJSONObject(i); if (o == null) continue;
                String id = o.optString("id", ""); if (id.isEmpty()) continue;
                ids.add(id); names.add(nameOf(o.optJSONObject("user")));
            }
            ui.post(() -> {
                if (isFinishing()) return;
                pendingRequests = ids.size(); renderInfo();
                if (ids.isEmpty()) { toast("No pending join requests"); return; }
                new AlertDialog.Builder(this).setTitle("Join requests")
                        .setItems(names.toArray(new String[0]), (d, which) -> resolveRequest(ids.get(which), names.get(which)))
                        .setNegativeButton("Close", null).show();
            });
        }, null);
    }

    private void resolveRequest(final String requestId, final String name) {
        new AlertDialog.Builder(this).setTitle(name + " wants to join")
                .setPositiveButton("Approve", (d, w) -> answerRequest(requestId, "approve"))
                .setNegativeButton("Reject", (d, w) -> answerRequest(requestId, "reject"))
                .setNeutralButton("Cancel", null).show();
    }

    private void answerRequest(final String requestId, final String action) {
        work(() -> {
            NecpraMessageRepository.Resp r = repo.api("PATCH", "/api/group-admin/" + chatId + "/join-requests/" + Uri.encode(requestId), new JSONObject().put("action", action));
            if (!r.ok()) throw new IOException(r.message());
            ui.post(() -> { pendingLoaded = false; loadMembers(); });   // refreshes the member list and the badge
        }, null);
    }

    // ------------------------------------------------------------------ group settings

    private void showSettings() {
        work(() -> {
            NecpraMessageRepository.Resp r = repo.api("GET", "/api/chats/" + chatId, null);
            if (!r.ok()) throw new IOException(r.message());
            JSONObject d = r.json == null ? null : r.json.optJSONObject("data");
            JSONObject chat = d == null ? null : (d.optJSONObject("chat") != null ? d.optJSONObject("chat") : (d.optJSONObject("group") != null ? d.optJSONObject("group") : d));
            if (chat == null && r.json != null) chat = r.json.optJSONObject("chat");
            JSONObject st = chat == null ? null : chat.optJSONObject("settings");
            final JSONObject cur = st == null ? new JSONObject() : st;
            ui.post(() -> showSettingsDialog(cur));
        }, null);
    }

    private void showSettingsDialog(JSONObject cur) {
        if (isFinishing()) return;
        final boolean[] on = new boolean[SET_KEYS.length];
        for (int i = 0; i < on.length; i++) on[i] = cur.optBoolean(SET_KEYS[i], SET_DEFAULT[i]);
        new AlertDialog.Builder(this).setTitle("Group settings")
                .setMultiChoiceItems(SET_LABELS, on, (d, i, c) -> on[i] = c)
                .setPositiveButton("Save", (d, w) -> work(() -> {
                    JSONObject st = new JSONObject();
                    for (int i = 0; i < on.length; i++) st.put(SET_KEYS[i], on[i]);
                    NecpraMessageRepository.Resp r = repo.api("PATCH", "/api/group-admin/" + chatId + "/settings", new JSONObject().put("settings", st));
                    if (!r.ok()) throw new IOException(r.message());
                    toast("Group settings saved");
                }, null)).setNegativeButton("Cancel", null).show();
    }
}
