package com.necpa;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The native arcade hub: one screen with every native game, today's daily challenge and "Play Together".
 *
 * Play Together uses the existing /api/games/rooms backend, so a native player and a web player can share a match:
 * <ul>
 *   <li><b>Create match</b> - pick a game, optionally lock the invitation to one friend, then share the code.</li>
 *   <li><b>Join with code</b> - the code decides the game; the matching screen opens straight into the match.</li>
 * </ul>
 * The hub itself plays nothing; it launches {@link NecpraWaterActivity}, {@link NecpraBlockActivity},
 * {@link NecpraTriviaActivity}, {@link NecpraWordActivity} and {@link NecpraChessActivity}.
 */
public class NecpraArcadeActivity extends NecpraGameActivity {
    private static final String[][] GAMES = {
            // id, title, subtitle emoji, colour
            {"water", "Water Sort", "💧", "#0EA5E9"},
            {"block", "Block Puzzle", "🧩", "#8B5CF6"},
            {"trivia", "Trivia Master", "🧠", "#F59E0B"},
            {"crossword", "Word Connect", "🔤", "#10B981"},
            {"chess", "Chess", "♟\uFE0E", "#475569"},
    };

    private LinearLayout list;
    private TextView dailyStatus, streakChip;
    private final TextView[] stats = new TextView[GAMES.length];

    @Override protected String gameId() { return "arcade"; }

    @Override protected String gameTitle() { return "Arcade"; }

    /** The hub is the module home: no back arrow here (the phone back gesture leaves it). */
    @Override protected boolean showBackArrow() { return false; }

    // ------------------------------------------------------------------ build

    @Override
    protected void onBuild(Bundle saved) {
        ScrollView sv = new ScrollView(this);
        sv.setVerticalScrollBarEnabled(false);
        list = column();
        list.setPadding(dp(16), dp(70), dp(16), dp(24));
        sv.addView(list, new ScrollView.LayoutParams(-1, -2));
        stage.addView(sv, new android.widget.FrameLayout.LayoutParams(-1, -1));

        buildDaily();
        list.addView(sectionTitle("Games"));
        LinearLayout row = null;
        for (int i = 0; i < GAMES.length; i++) {
            if (i % 2 == 0) {
                row = row();
                row.setGravity(Gravity.TOP);
                LinearLayout.LayoutParams rl = new LinearLayout.LayoutParams(-1, -2);
                rl.topMargin = dp(10);
                list.addView(row, rl);
            }
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1f);
            if (i % 2 == 1) lp.leftMargin = dp(10);
            row.addView(gameCard(i), lp);
        }
        if (GAMES.length % 2 == 1) {
            // keep the last card the same width as the others
            row.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
        }
        buildTogether();
        pullServerCoins();
        refreshStats();
    }

    @Override protected void onInsets(int top, int bottom, int left, int right) {
        if (list == null) return;
        list.setPadding(dp(16) + left, top + dp(60), dp(16) + right, bottom + dp(24));
    }

    @Override protected void onResume() {
        super.onResume();
        if (list != null) {
            refreshStats();
            updateCoins(false);
        }
    }

    private TextView sectionTitle(String s) {
        TextView t = text(s, 17, cText, true);
        t.setPadding(dp(2), dp(20), 0, 0);
        return t;
    }

    private GradientDrawable tint(String hex, float radiusDp) {
        int base = Color.parseColor(hex);
        float[] hsv = new float[3];
        Color.colorToHSV(base, hsv);
        float[] dk = {hsv[0], hsv[1], Math.max(0f, hsv[2] - 0.22f)};
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{base, Color.HSVToColor(dk)});
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    // ------------------------------------------------------------------ daily challenge

    private void buildDaily() {
        LinearLayout card = column();
        card.setBackground(tint("#EF4444", 22));
        card.setPadding(dp(18), dp(16), dp(18), dp(16));
        LinearLayout top = row();
        TextView title = text("🔥  Daily challenge", 18, Color.WHITE, true);
        top.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));
        streakChip = text("", 13, Color.WHITE, true);
        streakChip.setBackground(round(0x33FFFFFF, 14));
        streakChip.setPadding(dp(10), dp(5), dp(10), dp(5));
        top.addView(streakChip);
        card.addView(top);
        dailyStatus = text("", 14, 0xE6FFFFFF, false);
        dailyStatus.setPadding(0, dp(6), 0, dp(12));
        card.addView(dailyStatus);
        card.addView(button("Play today's challenge", SECONDARY, new Runnable() {
            @Override public void run() { launchDaily(); }
        }));
        list.addView(card, new LinearLayout.LayoutParams(-1, -2));
    }

    private void launchDaily() {
        Intent i = new Intent(this, NecpraWaterActivity.class);
        i.putExtra(EXTRA_MODE, NecpraWaterActivity.MODE_DAILY);
        startActivity(i);
    }

    // ------------------------------------------------------------------ game cards

    private View gameCard(final int index) {
        final String[] g = GAMES[index];
        LinearLayout card = column();
        card.setBackground(tint(g[3], 22));
        card.setPadding(dp(14), dp(14), dp(14), dp(14));
        card.setMinimumHeight(dp(132));
        TextView icon = text(g[2], 34, Color.WHITE, false);
        card.addView(icon);
        TextView name = text(g[1], 16, Color.WHITE, true);
        name.setPadding(0, dp(6), 0, 0);
        card.addView(name);
        TextView st = text("", 12.5f, 0xDDFFFFFF, false);
        st.setPadding(0, dp(2), 0, 0);
        card.addView(st);
        stats[index] = st;
        pressable(card);
        card.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                sfx.play(NecpraSfx.TAP);
                launch(g[0], null);
            }
        });
        return card;
    }

    private void refreshStats() {
        for (int i = 0; i < GAMES.length; i++) {
            String id = GAMES[i][0];
            if (stats[i] == null) continue;
            if ("chess".equals(id)) {
                stats[i].setText("vs computer or a friend");
            } else {
                int best = store.bestScore(id);
                stats[i].setText("Level " + store.level(id) + (best > 0 ? "  ·  Best " + best : ""));
            }
        }
        int streak = store.streak();
        streakChip.setText("🔥 " + streak + (streak == 1 ? " day" : " days"));
        dailyStatus.setText(store.dailyDone()
                ? "Done for today — come back tomorrow to keep your streak."
                : "A fresh water puzzle every day. Finish it to grow your streak.");
    }

    // ------------------------------------------------------------------ launching

    private static Class<?> classFor(String game) {
        if ("water".equals(game)) return NecpraWaterActivity.class;
        if ("block".equals(game)) return NecpraBlockActivity.class;
        if ("trivia".equals(game)) return NecpraTriviaActivity.class;
        if ("crossword".equals(game)) return NecpraWordActivity.class;
        if ("chess".equals(game)) return NecpraChessActivity.class;
        return null;
    }

    private void launch(String game, String roomCode) {
        Class<?> cls = classFor(game);
        if (cls == null) {
            message("Unsupported game", "This game can't be opened from here yet.", "OK");
            return;
        }
        Intent i = new Intent(this, cls);
        if (roomCode != null) i.putExtra(EXTRA_ROOM, roomCode);
        startActivity(i);
    }

    private String titleOf(String game) {
        for (String[] g : GAMES) if (g[0].equals(game)) return g[1];
        return game;
    }

    // ------------------------------------------------------------------ Play Together

    private void buildTogether() {
        list.addView(sectionTitle("Play Together"));
        LinearLayout card = column();
        card.setBackground(roundStroke(cCard, cLine, 22));
        card.setPadding(dp(18), dp(16), dp(18), dp(16));
        TextView t = text("Challenge a friend to a live match in any game. The host creates a match and shares the code; "
                + "your friend joins with it.", 14, cSub, false);
        t.setLineSpacing(0, 1.12f);
        card.addView(t);
        card.addView(space(12));
        card.addView(button("Create a match", PRIMARY, new Runnable() {
            @Override public void run() { createStepGame(); }
        }));
        card.addView(space(8));
        card.addView(button("Join with a code", SECONDARY, new Runnable() {
            @Override public void run() { joinDialog(); }
        }));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = dp(10);
        list.addView(card, lp);
    }

    // ---- create: step 1, pick the game

    private void createStepGame() {
        LinearLayout c = column();
        c.addView(text("Which game?", 21, cText, true));
        c.addView(space(8));
        final Modal m = modal(c, true);
        for (final String[] g : GAMES) {
            TextView b = button(g[2] + "   " + g[1], SECONDARY, new Runnable() {
                @Override public void run() {
                    m.dismiss();
                    createStepFriend(g[0]);
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.topMargin = dp(8);
            c.addView(b, lp);
        }
    }

    // ---- create: step 2, anyone with the code or one friend

    private void createStepFriend(final String game) {
        final LinearLayout c = column();
        c.addView(text("Who's playing?", 21, cText, true));
        TextView sub = text(titleOf(game) + " · invite one friend, or let anyone with the code join.", 13.5f, cSub, false);
        sub.setPadding(0, dp(4), 0, dp(10));
        c.addView(sub);
        final Modal m = modal(c, true);
        c.addView(button("Anyone with the code", PRIMARY, new Runnable() {
            @Override public void run() {
                m.dismiss();
                createMatch(game, 0, null);
            }
        }));
        final TextView loading = text("Loading your friends…", 13.5f, cSub, false);
        loading.setPadding(0, dp(14), 0, 0);
        c.addView(loading);
        io.execute(new Runnable() {
            @Override public void run() {
                JSONArray friends = null;
                String err = null;
                try {
                    JSONObject r = NecpraGameApi.callRoot(NecpraArcadeActivity.this, "GET", "/api/friends?limit=100&offset=0", null);
                    friends = r.optJSONArray("friends");
                } catch (Exception e) {
                    err = errorText(e);
                }
                final JSONArray fr = friends;
                final String fe = err;
                ui(new Runnable() {
                    @Override public void run() {
                        if (fe != null) {
                            loading.setText("Couldn't load friends: " + fe);
                            return;
                        }
                        if (fr == null || fr.length() == 0) {
                            loading.setText("No friends yet — share the code instead.");
                            return;
                        }
                        c.removeView(loading);
                        TextView head = text("Or invite a friend", 13, cSub, true);
                        head.setPadding(0, dp(14), 0, dp(4));
                        c.addView(head);
                        for (int i = 0; i < fr.length(); i++) {
                            final JSONObject f = fr.optJSONObject(i);
                            if (f == null) continue;
                            final long id = f.optLong("id");
                            final String name = friendName(f);
                            if (id <= 0) continue;
                            TextView b = button(name, SECONDARY, new Runnable() {
                                @Override public void run() {
                                    m.dismiss();
                                    createMatch(game, id, name);
                                }
                            });
                            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
                            lp.topMargin = dp(6);
                            c.addView(b, lp);
                        }
                    }
                });
            }
        });
    }

    private static String friendName(JSONObject f) {
        String d = f.optString("displayName", "");
        if (d.isEmpty() || "null".equals(d)) {
            String fn = f.optString("firstName", ""), ln = f.optString("lastName", "");
            if ("null".equals(fn)) fn = "";
            if ("null".equals(ln)) ln = "";
            d = (fn + " " + ln).trim();
        }
        if (d.isEmpty()) d = f.optString("username", "Friend");
        return d;
    }

    // ---- create: step 3, make the room and show the code

    private void createMatch(final String game, final long targetId, final String targetName) {
        toast("Creating your match…");
        final int level = "chess".equals(game) ? 1 : store.level(game);
        final String subject = "trivia".equals(game) ? store.triviaSubject() : null;
        io.execute(new Runnable() {
            @Override public void run() {
                String err = null;
                String code = null;
                try {
                    JSONObject r = NecpraGameApi.createRoom(NecpraArcadeActivity.this, game, level, subject, targetId);
                    JSONObject room = r.optJSONObject("room");
                    code = room == null ? null : room.optString("code", null);
                    if (code == null || code.isEmpty()) err = "The server did not return a match code";
                } catch (Exception e) {
                    err = errorText(e);
                }
                final String ec = err, cc = code;
                ui(new Runnable() {
                    @Override public void run() {
                        if (ec != null) {
                            sfx.play(NecpraSfx.ERROR);
                            message("Couldn't create the match", ec, "OK");
                            return;
                        }
                        showCode(game, cc, targetName);
                    }
                });
            }
        });
    }

    private void showCode(final String game, final String code, String friend) {
        LinearLayout c = column();
        c.setGravity(Gravity.CENTER_HORIZONTAL);
        c.addView(text("Match ready", 21, cText, true));
        TextView sub = text(titleOf(game) + (friend != null ? " · for " + friend : ""), 14, cSub, false);
        sub.setPadding(0, dp(4), 0, dp(12));
        c.addView(sub);
        TextView codeView = text(code, 38, cPrimary, true);
        codeView.setLetterSpacing(0.18f);
        codeView.setGravity(Gravity.CENTER);
        codeView.setBackground(roundStroke(night ? Color.parseColor("#0F1727") : Color.parseColor("#F3F4F6"), cLine, 16));
        codeView.setPadding(dp(18), dp(12), dp(18), dp(12));
        c.addView(codeView, new LinearLayout.LayoutParams(-2, -2));
        TextView note = text("Your friend opens Arcade → Join with a code. You'll wait in the match until they arrive.", 13, cSub, false);
        note.setGravity(Gravity.CENTER);
        note.setPadding(0, dp(12), 0, dp(14));
        c.addView(note);
        final Modal m = modal(c, false);
        c.addView(button("Start & wait for your friend", PRIMARY, new Runnable() {
            @Override public void run() {
                m.dismiss();
                launch(game, code);
            }
        }), new LinearLayout.LayoutParams(-1, -2));
        c.addView(space(8));
        c.addView(button("Share code", SECONDARY, new Runnable() {
            @Override public void run() { share(game, code); }
        }), new LinearLayout.LayoutParams(-1, -2));
        c.addView(space(8));
        c.addView(button("Cancel match", DANGER, new Runnable() {
            @Override public void run() {
                m.dismiss();
                cancelRoom(code);
            }
        }), new LinearLayout.LayoutParams(-1, -2));
    }

    private void share(String game, String code) {
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, "Play " + titleOf(game) + " with me on Necpra! Open Arcade → Join with a code, and enter " + code + ".");
            startActivity(Intent.createChooser(send, "Share match code"));
        } catch (RuntimeException e) {
            toast("Couldn't open the share sheet");
        }
    }

    private void cancelRoom(final String code) {
        io.execute(new Runnable() {
            @Override public void run() {
                try {
                    NecpraGameApi.closeRoom(NecpraArcadeActivity.this, code);
                } catch (Exception ignored) {
                    // the invitation expires on its own
                }
            }
        });
    }

    // ---- join

    private void joinDialog() {
        LinearLayout c = column();
        c.addView(text("Join a match", 21, cText, true));
        TextView sub = text("Enter the code your friend shared.", 13.5f, cSub, false);
        sub.setPadding(0, dp(4), 0, dp(12));
        c.addView(sub);
        final EditText in = new EditText(this);
        in.setHint("CODE");
        in.setTextColor(cText);
        in.setHintTextColor(cSub);
        in.setTextSize(24);
        in.setGravity(Gravity.CENTER);
        in.setLetterSpacing(0.15f);
        in.setSingleLine(true);
        in.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        in.setFilters(new InputFilter[]{new InputFilter.AllCaps(), new InputFilter.LengthFilter(12)});
        in.setBackground(roundStroke(night ? Color.parseColor("#0F1727") : Color.parseColor("#F3F4F6"), cLine, 14));
        in.setPadding(dp(14), dp(12), dp(14), dp(12));
        c.addView(in, new LinearLayout.LayoutParams(-1, -2));
        c.addView(space(14));
        final Modal m = modal(c, true);
        c.addView(button("Join", PRIMARY, new Runnable() {
            @Override public void run() {
                String code = in.getText().toString().trim().toUpperCase(java.util.Locale.ROOT);
                if (code.length() < 3) {
                    toast("Enter the match code");
                    return;
                }
                m.dismiss();
                join(code);
            }
        }));
        c.addView(space(8));
        c.addView(button("Cancel", SECONDARY, new Runnable() {
            @Override public void run() { m.dismiss(); }
        }));
        in.requestFocus();
    }

    private void join(final String code) {
        toast("Joining…");
        io.execute(new Runnable() {
            @Override public void run() {
                String err = null;
                String game = null;
                try {
                    // joining is idempotent for members; it also tells us which game the code belongs to
                    JSONObject r = NecpraGameApi.joinRoom(NecpraArcadeActivity.this, code);
                    JSONObject room = r.optJSONObject("room");
                    game = room == null ? null : room.optString("gameType", null);
                    if (game == null || classFor(game) == null) err = "This match uses a game that can't be opened here.";
                } catch (Exception e) {
                    err = errorText(e);
                }
                final String ge = err, gg = game;
                ui(new Runnable() {
                    @Override public void run() {
                        if (ge != null) {
                            sfx.play(NecpraSfx.ERROR);
                            message("Couldn't join", ge, "OK");
                            return;
                        }
                        launch(gg, code);
                    }
                });
            }
        });
    }
}
