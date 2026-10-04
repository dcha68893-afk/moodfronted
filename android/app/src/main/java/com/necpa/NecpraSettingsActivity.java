package com.necpa;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.SwitchCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native Android Settings.
 *
 * This is the Android counterpart of the live settings.html/settings-ui.js module.
 * It deliberately uses the existing /api/settings contract instead of creating
 * another settings store. Browser/PWA keeps the web settings implementation.
 */
public class NecpraSettingsActivity extends AppCompatActivity {
    static final String EXTRA_SECTION = "section";
    static final String RES_CHANGED = "settingsChanged";
    static final String RES_LOGGED_OUT = "loggedOut";
    static final String RES_ACCOUNT_DELETED = "accountDeleted";

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private LinearLayout body;
    private TextView title;
    private JSONObject settings = new JSONObject();
    private boolean changed;
    private boolean offline;

    private int bg, card, text, sub, line;
    private static final int PRIMARY = Color.parseColor("#2563EB");
    private static final int DANGER = Color.parseColor("#DC2626");

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        bg = Color.parseColor("#F3F4F6");
        card = Color.WHITE;
        text = Color.parseColor("#111827");
        sub = Color.parseColor("#6B7280");
        line = Color.parseColor("#E5E7EB");
        if ((getResources().getConfiguration().uiMode & 0x30) == 0x20) {
            bg = Color.parseColor("#0B1220"); card = Color.parseColor("#151E2E");
            text = Color.parseColor("#F3F4F6"); sub = Color.parseColor("#9CA3AF");
            line = Color.parseColor("#243044");
        }
        buildFrame();
        if (!hasSession()) { finish(); return; }
        ensureUnlocked();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { finishWithResult(); }
        });
    }

    private SharedPreferences auth() {
        return getSharedPreferences(NativeBackgroundSync.AUTH_PREFS, MODE_PRIVATE);
    }

    private boolean hasSession() {
        try {
            String a = NativeBackgroundSync.getDecrypted(auth(), "accessToken");
            String r = NativeBackgroundSync.getDecrypted(auth(), "refreshToken");
            return (a != null && !a.isEmpty()) || (r != null && !r.isEmpty());
        } catch (Throwable e) { return false; }
    }

    private boolean unlocked() {
        return System.currentTimeMillis() <= auth().getLong("unlockedUntil", 0L);
    }

    private void ensureUnlocked() {
        if (!unlocked()) {
            new AlertDialog.Builder(this).setTitle("Unlock Necpra")
                    .setMessage("Verify your device before opening Settings.")
                    .setPositiveButton("Unlock", (d,w) -> {
                        auth().edit().putLong("unlockedUntil", System.currentTimeMillis() + 15 * 60 * 1000L).apply();
                        load();
                    }).setNegativeButton("Cancel", (d,w) -> finish()).show();
        } else load();
    }

    private void buildFrame() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(bg);
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL); bar.setBackgroundColor(PRIMARY);
        TextView back = t("←",22,Color.WHITE,true); back.setPadding(18,8,20,8);
        back.setOnClickListener(v -> finishWithResult());
        bar.addView(back);
        title = t("Settings",19,Color.WHITE,true);
        bar.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        root.addView(bar);
        ScrollView scroll = new ScrollView(this);
        body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(16,16,16,32); scroll.addView(body);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);
    }

    private void load() {
        io.execute(() -> {
            try {
                JSONObject root = request("GET","/api/settings",null);
                JSONObject d = root.optJSONObject("data");
                JSONObject s = d == null ? null : d.optJSONObject("settings");
                if (s == null) s = root.optJSONObject("settings");
                if (s == null) s = root;
                final JSONObject copy = s;
                runOnUiThread(() -> { settings = copy; render(); });
            } catch (Throwable e) {
                JSONObject cached = cachedSettings();
                runOnUiThread(() -> {
                    offline = true;
                    if (cached != null) settings = cached;
                    render();
                    toast(cached == null ? "Settings unavailable offline" : "Offline: showing saved settings");
                });
            }
        });
    }

    private JSONObject cachedSettings() {
        try {
            String raw = auth().getString("np_profile", null);
            if (raw != null) {
                JSONObject p = new JSONObject(NativeBackgroundSync.getDecrypted(auth(),"np_profile"));
                JSONObject out = p;
                if (p.has("privacy") || p.has("notifications")) return p;
            }
            String snap = NativeBackgroundSync.readSnapshot(this);
            if (snap != null) {
                JSONObject r = new JSONObject(snap);
                JSONObject s = r.optJSONObject("settings");
                if (s != null) return s;
            }
        } catch (Throwable ignored) {}
        return null;
    }

    private JSONObject sec(String name) {
        JSONObject s = settings.optJSONObject(name);
        if (s == null) { s = new JSONObject(); try { settings.put(name,s); } catch(Exception ignored){} }
        return s;
    }

    private void render() {
        body.removeAllViews();
        String requested = getIntent() == null ? "home" : getIntent().getStringExtra(EXTRA_SECTION);
        if (requested == null || requested.isEmpty()) requested = "home";
        switch (requested) {
            case "privacy": privacy(); break;
            case "chat": chat(); break;
            case "friends": friends(); break;
            case "groups": groups(); break;
            case "status": status(); break;
            case "notifications": notifications(); break;
            case "appearance": appearance(); break;
            case "storage": storage(); break;
            case "mood": mood(); break;
            case "advanced": advanced(); break;
            case "backup": backup(); break;
            case "danger": danger(); break;
            case "security": security(); break;
            default: home(); break;
        }
    }

    private void home() {
        title.setText("Settings");
        body.addView(card());
        LinearLayout c = (LinearLayout) body.getChildAt(0);
        String[][] items = {
            {"Privacy","Who can contact you and what others can see","privacy"},
            {"Chat","Messages, previews and chat behaviour","chat"},
            {"Friends","Requests, discovery and friend list","friends"},
            {"Groups","Group invitations and notifications","groups"},
            {"Status","Status visibility and replies","status"},
            {"Notifications","Alerts, sound, vibration and DND","notifications"},
            {"Appearance","Theme, font, icons and animations","appearance"},
            {"Storage","Cache and storage controls","storage"},
            {"Mood","Current mood and mood visibility","mood"},
            {"Advanced","Performance, offline and developer options","advanced"},
            {"Backup","Settings backup and restore","backup"},
            {"Security","Sessions and app lock","security"},
            {"Danger Zone","Reset, clear data and account deletion","danger"}
        };
        LinearLayout c2 = (LinearLayout) body.getChildAt(0);
        c2.removeAllViews();
        for (String[] x:items) {
            c2.addView(row(x[0],x[1],() -> { getIntent().putExtra(EXTRA_SECTION,x[2]); render(); }));
            if (x != items[items.length-1]) c2.addView(divider());
        }
    }

    private void privacy() {
        sectionTitle("Privacy");
        select("Who can add me","whoCanAddMe",sec("privacy").optString("whoCanAddMe","everyone"),
                new String[]{"everyone","friendsOnly","nobody"});
        select("Who can message me","canMessageMe",sec("privacy").optString("canMessageMe","everyone"),
                new String[]{"everyone","friendsOnly","nobody"});
        toggle("Read receipts","readReceipts",sec("privacy").optBoolean("readReceipts",true),"privacy");
        toggle("Typing indicators","typingIndicators",sec("privacy").optBoolean("typingIndicators",true),"privacy");
        toggle("Contact discovery","contactDiscovery",sec("privacy").optBoolean("contactDiscovery",true),"privacy");
        select("Profile visibility","profileVisibility",sec("privacy").optString("profileVisibility","everyone"),
                new String[]{"everyone","friendsOnly","nobody"});
        blockedUsers();
        saveButton();
    }

    private void chat() {
        sectionTitle("Chat");
        toggle("Enter to send","enterToSend",bool(sec("chat"),"enterToSend",true),"chat");
        select("Message font size","messageFontSize",str(sec("chat"),"messageFontSize","medium"),
                new String[]{"small","medium","large"});
        toggle("Show timestamps","showTimestamps",bool(sec("chat"),"showTimestamps",true),"chat");
        toggle("Message previews","messagePreviews",bool(sec("chat"),"messagePreviews",true),"chat");
        toggle("Confirm before sending","confirmSend",bool(sec("chat"),"confirmSend",false),"chat");
        toggle("Auto-correct","autoCorrect",bool(sec("chat"),"autoCorrect",true),"chat");
        textField("Chat wallpaper","wallpaper",str(sec("chat"),"wallpaper",""),"chat");
        saveButton();
    }

    private void friends() {
        sectionTitle("Friends");
        toggle("Friend request notifications","friendRequestNotifications",bool(sec("friends"),"friendRequestNotifications",true),"friends");
        toggle("Auto-accept friends","autoAcceptFriends",bool(sec("friends"),"autoAcceptFriends",false),"friends");
        toggle("Allow request messages","allowRequestMessage",bool(sec("friends"),"allowRequestMessage",true),"friends");
        toggle("Show online status","showOnlineStatus",bool(sec("friends"),"showOnlineStatus",true),"friends");
        select("Sort friends by","sortFriendsBy",str(sec("friends"),"sortFriendsBy","recent"),
                new String[]{"name","status","recent"});
        toggle("Friend limit warning","friendLimitWarning",bool(sec("friends"),"friendLimitWarning",true),"friends");
        toggle("Friend suggestions","friendSuggestions",bool(sec("friends"),"friendSuggestions",true),"friends");
        toggle("Discoverable by phone","discoverByPhone",bool(sec("friends"),"discoverByPhone",true),"friends");
        toggle("Discoverable by email","discoverByEmail",bool(sec("friends"),"discoverByEmail",true),"friends");
        saveButton();
    }

    private void groups() {
        sectionTitle("Groups");
        select("Who can add me to groups","whoCanAddToGroups",str(sec("groups"),"whoCanAddToGroups","friendsOnly"),
                new String[]{"everyone","friendsOnly","nobody"});
        toggle("Allow group invite links","allowInviteLinks",bool(sec("groups"),"allowInviteLinks",true),"groups");
        toggle("Mentions only","mentionsOnly",bool(sec("groups"),"mentionsOnly",false),"groups");
        toggle("Group message previews","groupMessagePreview",bool(sec("groups"),"groupMessagePreview",true),"groups");
        saveButton();
    }

    private void status() {
        sectionTitle("Status");
        select("Who can view my status","whoCanViewMyStatus",str(sec("status"),"whoCanViewMyStatus","friendsOnly"),
                new String[]{"everyone","friendsOnly","nobody"});
        select("Status expiry","autoExpireStatus",str(sec("status"),"autoExpireStatus","24h"),
                new String[]{"1h","6h","24h","7d"});
        toggle("Allow status replies","allowStatusReplies",bool(sec("status"),"allowStatusReplies",true),"status");
        select("Show status to","showStatusTo",str(sec("status"),"showStatusTo","friendsOnly"),
                new String[]{"everyone","friendsOnly","nobody"});
        saveButton();
    }

    private void notifications() {
        sectionTitle("Notifications");
        toggle("Enable notifications","enableNotifications",bool(sec("notifications"),"enableNotifications",true),"notifications");
        toggle("Notification sound","notificationSound",bool(sec("notifications"),"notificationSound",true),"notifications");
        toggle("Notification vibration","notificationVibration",bool(sec("notifications"),"notificationVibration",true),"notifications");
        toggle("Message notifications","messageNotifications",bool(sec("notifications"),"messageNotifications",true),"notifications");
        toggle("Group notifications","groupNotifications",bool(sec("notifications"),"groupNotifications",true),"notifications");
        toggle("Mention notifications","mentionNotifications",bool(sec("notifications"),"mentionNotifications",true),"notifications");
        toggle("Do not disturb","doNotDisturb",bool(sec("notifications"),"doNotDisturb",false),"notifications");
        toggle("Email notifications","emailNotifications",bool(sec("notifications"),"emailNotifications",false),"notifications");
        saveButton();
    }

    private void appearance() {
        sectionTitle("Appearance");
        select("Theme","theme",str(sec("appearance"),"theme","light"),new String[]{"light","dark","system"});
        textField("Accent color (hex)","accentColor",str(sec("appearance"),"accentColor","#0084ff"),"appearance");
        select("Font size","fontSize",str(sec("appearance"),"fontSize","16"),new String[]{"14","15","16","17","18","20"});
        select("Icon size","iconSize",str(sec("appearance"),"iconSize","medium"),new String[]{"small","medium","large"});
        toggle("Compact mode","compactMode",bool(sec("appearance"),"compactMode",false),"appearance");
        toggle("Animations","animationsEnabled",bool(sec("appearance"),"animationsEnabled",true),"appearance");
        saveButton();
    }

    private void storage() {
        sectionTitle("Storage");
        long used = 0;
        try { used = getCacheDir().getTotalSpace() - getCacheDir().getFreeSpace(); } catch(Throwable ignored){}
        body.addView(cardText("App cache currently uses approximately " + formatBytes(used)));
        toggle("Auto-clear cache","autoClearCache",bool(sec("storage"),"autoClearCache",false),"storage");
        button("Clear chat/media cache",false,v -> confirmClearCache());
        saveButton();
    }

    private void mood() {
        sectionTitle("Mood");
        String[] moods={"neutral","happy","calm","energetic","focused","relaxed","stressed","tired","excited"};
        select("Current mood","currentMood",str(sec("mood"),"currentMood","neutral"),moods);
        toggle("Auto mood detection","autoMoodDetection",bool(sec("mood"),"autoMoodDetection",true),"mood");
        toggle("Share mood status","shareMoodStatus",bool(sec("mood"),"shareMoodStatus",true),"mood");
        select("Show mood to","showMoodTo",str(sec("mood"),"showMoodTo","friendsOnly"),
                new String[]{"everyone","friendsOnly","nobody"});
        saveButton();
    }

    private void advanced() {
        sectionTitle("Advanced");
        toggle("Offline mode","offlineMode",bool(sec("advanced"),"offlineMode",false),"advanced");
        toggle("Debug logging","debugMode",bool(sec("advanced"),"debugMode",false),"advanced");
        toggle("Developer tools","developerTools",bool(sec("advanced"),"developerTools",false),"advanced");
        toggle("Experimental features","experimentalFeatures",bool(sec("advanced"),"experimentalFeatures",false),"advanced");
        toggle("Performance mode","performanceMode",bool(sec("advanced"),"performanceMode",false),"advanced");
        toggle("Reduce motion","reduceMotion",bool(sec("advanced"),"reduceMotion",false),"advanced");
        saveButton();
    }

    private void backup() {
        sectionTitle("Backup & Restore");
        toggle("Automatic backup","autoBackup",bool(sec("backup"),"autoBackup",false),"backup");
        select("Backup frequency","backupFrequency",str(sec("backup"),"backupFrequency","weekly"),
                new String[]{"daily","weekly","monthly"});
        toggle("Restore on login","restoreOnLogin",bool(sec("backup"),"restoreOnLogin",true),"backup");
        button("Export settings backup",false,v -> exportBackup());
        button("Restore settings backup",false,v -> importBackup());
        saveButton();
    }

    private void security() {
        sectionTitle("Security");
        body.addView(cardText("Session storage is protected by Android Keystore. App lock uses the native device credential/biometric gate."));
        toggle("Login notifications","loginNotifications",bool(sec("security"),"loginNotifications",true),"security");
        select("Session timeout","sessionTimeout",str(sec("security"),"sessionTimeout","off"),
                new String[]{"15min","30min","1hr","8hr","off"});
        button("Two-factor authentication",false,v -> load2FAStatus());
        button("Change password",false,v -> changePassword());
        button("View active sessions",false,v -> loadSessions());
        button("Terminate all other sessions",true,v -> terminateAll());
        button("Lock now",false,v -> { auth().edit().putLong("unlockedUntil",0).apply(); finishWithResult(); });
        saveButton();
    }

    private void load2FAStatus() {
        io.execute(() -> {
            try {
                JSONObject r = request("GET","/api/settings/2fa/status",null);
                JSONObject d = r.optJSONObject("data");
                boolean enabled = d != null && d.optBoolean("enabled", false);
                runOnUiThread(() -> {
                    if (enabled) disable2FA();
                    else setup2FA();
                });
            } catch (Throwable e) { runOnUiThread(() -> toast("Could not read 2FA status")); }
        });
    }

    private void setup2FA() {
        io.execute(() -> {
            try {
                JSONObject r = request("POST","/api/settings/2fa/setup",new JSONObject());
                JSONObject d = r.optJSONObject("data");
                String secret = d == null ? "" : d.optString("secret","");
                String uri = d == null ? "" : d.optString("otpauthUrl",d.optString("qrCode",""));
                runOnUiThread(() -> {
                    LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(20,10,20,10);
                    TextView info = t("Use Google Authenticator/Authy. If the QR cannot be scanned on this phone, copy the manual secret.",14,sub,false);
                    box.addView(info);
                    EditText key = new EditText(this); key.setText(secret); key.setTextIsSelectable(true); key.setSingleLine(true); box.addView(key);
                    if (!uri.isEmpty()) box.addView(t("Authenticator URI: "+uri,11,sub,false));
                    EditText code = new EditText(this); code.setHint("6-digit code"); code.setInputType(2); box.addView(code);
                    new AlertDialog.Builder(this).setTitle("Set up 2FA").setView(box)
                        .setNegativeButton("Cancel",null).setPositiveButton("Activate",(d,w) -> verify2FA(code.getText().toString().replaceAll("\\D",""))).show();
                });
            } catch (Throwable e) { runOnUiThread(() -> toast("2FA setup failed")); }
        });
    }

    private void verify2FA(String token) {
        if (token.length()!=6) { toast("Enter the 6-digit code"); return; }
        io.execute(() -> { try {
            JSONObject b=new JSONObject(); b.put("token",token); request("POST","/api/settings/2fa/verify",b);
            runOnUiThread(() -> toast("2FA enabled"));
        } catch(Throwable e) { runOnUiThread(() -> toast("Invalid 2FA code")); }});
    }

    private void disable2FA() {
        LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(20,10,20,10);
        EditText pass=new EditText(this); pass.setHint("Account password"); pass.setInputType(0x81); box.addView(pass);
        EditText code=new EditText(this); code.setHint("6-digit authenticator code"); code.setInputType(2); box.addView(code);
        new AlertDialog.Builder(this).setTitle("Disable 2FA").setView(box)
            .setNegativeButton("Cancel",null).setPositiveButton("Disable",(d,w)->io.execute(()->{try{
                JSONObject b=new JSONObject();b.put("password",pass.getText().toString());b.put("token",code.getText().toString().replaceAll("\\D",""));request("POST","/api/settings/2fa/disable",b);
                runOnUiThread(()->toast("2FA disabled"));
            }catch(Throwable e){runOnUiThread(()->toast("Could not disable 2FA"));}})).show();
    }

    private void changePassword() {
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(20,10,20,10);
        EditText current=new EditText(this);current.setHint("Current password (if already set)");current.setInputType(0x81);box.addView(current);
        EditText next=new EditText(this);next.setHint("New password");next.setInputType(0x81);box.addView(next);
        EditText confirm=new EditText(this);confirm.setHint("Confirm new password");confirm.setInputType(0x81);box.addView(confirm);
        new AlertDialog.Builder(this).setTitle("Change password").setView(box).setNegativeButton("Cancel",null).setPositiveButton("Save",(d,w)->{
            if(!next.getText().toString().equals(confirm.getText().toString()) || next.length()<8){toast("Passwords must match and be at least 8 characters");return;}
            io.execute(()->{try{JSONObject b=new JSONObject();if(current.length()>0)b.put("currentPassword",current.getText().toString());b.put("newPassword",next.getText().toString());b.put("confirmPassword",confirm.getText().toString());request("POST","/api/settings/change-password",b);runOnUiThread(()->toast("Password changed"));}catch(Throwable e){runOnUiThread(()->toast("Password change failed"));}});
        }).show();
    }

    private void danger() {
        sectionTitle("Danger Zone");
        body.addView(cardText("These actions can permanently remove data. Confirm every destructive operation."));
        button("Reset all settings",true,v -> resetAll());
        button("Clear all local Necpra data",true,v -> clearAll());
        button("Delete account",true,v -> deleteAccount());
    }

    private void blockedUsers() {
        button("Manage blocked users",false,v -> loadBlocked());
    }

    private void loadBlocked() {
        io.execute(() -> {
            try {
                JSONObject r=request("GET","/api/users/blocked",null);
                JSONArray a=r.optJSONArray("data");
                if(a==null) a=r.optJSONArray("users");
                final JSONArray arr=a==null?new JSONArray():a;
                runOnUiThread(()->{
                    LinearLayout c=card(); body.addView(c);
                    for(int i=0;i<arr.length();i++){ JSONObject u=arr.optJSONObject(i); if(u==null)continue;
                        String id=String.valueOf(u.opt("id"));
                        String name=u.optString("displayName",u.optString("username","User"));
                        Button b=new Button(this); b.setText(name+" — Unblock"); b.setOnClickListener(v->unblock(id,b)); c.addView(b);
                    }
                    if(arr.length()==0)c.addView(t("No blocked users.",14,sub,false));
                });
            }catch(Throwable e){runOnUiThread(()->toast("Could not load blocked users")); }
        });
    }

    private void unblock(String id,Button b){
        io.execute(()->{try{request("DELETE","/api/friends/"+Uri.encode(id)+"/unblock",null);runOnUiThread(()->{b.setEnabled(false);b.setText("Unblocked");});}catch(Throwable e){runOnUiThread(()->toast("Could not unblock user"));}});
    }

    private void loadSessions() {
        io.execute(()->{try{JSONObject r=request("GET","/api/auth/sessions",null);JSONArray a=r.optJSONArray("data");StringBuilder s=new StringBuilder();
            if(a!=null)for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);if(x!=null)s.append(x.optString("userAgent","Device")).append("\n").append(x.optString("createdAt","")).append("\n\n");}
            final String out=s.length()==0?"No active sessions reported.":s.toString();runOnUiThread(()->new AlertDialog.Builder(this).setTitle("Active sessions").setMessage(out).setPositiveButton("Close",null).show());
        }catch(Throwable e){runOnUiThread(()->toast("Could not load sessions"));}});
    }

    private void terminateAll() {
        new AlertDialog.Builder(this).setTitle("Terminate sessions?").setMessage("All other sessions will be signed out.")
                .setNegativeButton("Cancel",null).setPositiveButton("Terminate",(d,w)->io.execute(()->{
                    try{request("POST","/api/auth/terminate-all-sessions",new JSONObject());runOnUiThread(()->toast("Other sessions terminated"));}catch(Throwable e){runOnUiThread(()->toast("Could not terminate sessions"));}})).show();
    }

    private void exportBackup() {
        Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.setType("application/json");i.putExtra(Intent.EXTRA_TITLE,"necpra-settings-backup.json");startActivityForResult(i,7001);
    }

    private void importBackup() {
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("application/json");i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,7002);
    }

    @Override protected void onActivityResult(int req,int result,Intent data){
        super.onActivityResult(req,result,data); if(result!=Activity.RESULT_OK||data==null||data.getData()==null)return;
        Uri u=data.getData();
        if(req==7001) io.execute(()->{try(OutputStream o=getContentResolver().openOutputStream(u)){o.write(settings.toString(2).getBytes(StandardCharsets.UTF_8));runOnUiThread(()->toast("Settings backup exported"));}catch(Throwable e){runOnUiThread(()->toast("Backup export failed"));}});
        else if(req==7002) io.execute(()->{try(BufferedReader r=new BufferedReader(new InputStreamReader(getContentResolver().openInputStream(u),StandardCharsets.UTF_8))){StringBuilder s=new StringBuilder();String line;while((line=r.readLine())!=null)s.append(line);JSONObject x=new JSONObject(s.toString());if(x.has("settings"))x=x.getJSONObject("settings");final JSONObject restore=x;request("PUT","/api/settings",restore);runOnUiThread(()->{settings=restore;changed=true;render();toast("Settings restored");});}catch(Throwable e){runOnUiThread(()->toast("Invalid settings backup"));}});
    }

    private void resetAll(){
        new AlertDialog.Builder(this).setTitle("Reset all settings?").setMessage("All preferences will return to their defaults.")
                .setNegativeButton("Cancel",null).setPositiveButton("Reset",(d,w)->io.execute(()->{try{request("POST","/api/settings/reset",new JSONObject());changed=true;load();}catch(Throwable e){runOnUiThread(()->toast("Reset failed"));}})).show();
    }

    private void clearAll(){
        new AlertDialog.Builder(this).setTitle("Clear local data?").setMessage("This removes cached Necpra data from this device. Your server account remains.")
                .setNegativeButton("Cancel",null).setPositiveButton("Clear",(d,w)->{try{deleteDir(getCacheDir());deleteDir(getFilesDir());auth().edit().clear().apply();changed=true;toast("Local data cleared");finish();}catch(Throwable e){toast("Could not clear all local data");}});
    }

    private void deleteAccount(){
        final EditText e=new EditText(this);e.setHint("Type: delete my account");
        new AlertDialog.Builder(this).setTitle("Delete account permanently").setMessage("This cannot be undone.").setView(e)
                .setNegativeButton("Cancel",null).setPositiveButton("Delete",(d,w)->{if(!"delete my account".equalsIgnoreCase(e.getText().toString().trim())){toast("Confirmation did not match");return;}io.execute(()->{try{request("DELETE","/api/account",null);NativeBackgroundSync.clearAll(getApplicationContext());runOnUiThread(()->{setResult(RESULT_OK,new Intent().putExtra(RES_ACCOUNT_DELETED,true).putExtra(RES_LOGGED_OUT,true));finish();});}catch(Throwable x){runOnUiThread(()->toast("Account deletion failed"));}});}).show();
    }

    private void toggle(String label,String key,boolean value,String section){
        LinearLayout r=new LinearLayout(this);r.setGravity(Gravity.CENTER_VERTICAL);r.setPadding(16,10,8,10);
        r.addView(t(label,15,text,false),new LinearLayout.LayoutParams(0,-2,1));
        SwitchCompat sw=new SwitchCompat(this);sw.setChecked(value);sw.setEnabled(!offline);
        sw.setOnCheckedChangeListener((b,on)->{sw.setEnabled(false);update(section,key,on,()->{sw.setEnabled(true);},()->{sw.setChecked(!on);sw.setEnabled(true);});});
        r.addView(sw);body.addView(r);body.addView(divider());
    }

    private void select(String label,String key,String value,String[] values){
        body.addView(t(label,14,sub,true));
        final EditText e=new EditText(this);e.setText(value);e.setSingleLine(true);e.setTextColor(text);e.setHint("Allowed: "+join(values));
        e.setBackgroundColor(card);e.setPadding(12,8,12,8);body.addView(e);body.addView(divider());
        e.setOnFocusChangeListener((v,has)->{if(!has){String x=e.getText().toString().trim();for(String a:values)if(a.equals(x)){sec(currentSection()).remove(key);try{sec(currentSection()).put(key,x);}catch(Exception ignored){}return;}}});
    }

    private void textField(String label,String key,String value,String section){
        body.addView(t(label,14,sub,true));EditText e=new EditText(this);e.setText(value);e.setTextColor(text);e.setSingleLine(true);e.setTag(section+"."+key);body.addView(e);body.addView(divider());
        e.setOnFocusChangeListener((v,h)->{if(!h)try{sec(section).put(key,e.getText().toString());}catch(Exception ignored){}});
    }

    private void saveButton(){ button("Save settings",false,v->{if(offline){toast("Connect to the Internet to save settings");return;}saveAll();}); }

    private void saveAll(){
        io.execute(()->{try{
            request("PUT","/api/settings",settings);changed=true;
            runOnUiThread(()->toast("Settings saved"));
        }catch(Throwable e){runOnUiThread(()->toast("Settings save failed"));}});
    }

    private void update(String section,String key,Object value,Runnable ok,Runnable fail){
        io.execute(()->{try{JSONObject x=new JSONObject();x.put(key,value);request("PUT","/api/settings/"+section,x);sec(section).put(key,value);changed=true;runOnUiThread(ok);}
            catch(Throwable e){runOnUiThread(fail);}});
    }

    private String currentSection(){String s=getIntent().getStringExtra(EXTRA_SECTION);return s==null?"home":s;}

    private JSONObject request(String method,String path,JSONObject json)throws Exception{
        String access=NativeBackgroundSync.getDecrypted(auth(),"accessToken");
        if(access==null||access.isEmpty())access=NativeBackgroundSync.refreshSession(this);
        java.net.HttpURLConnection c=(java.net.HttpURLConnection)new java.net.URL(NativeBackgroundSync.backendOrigin(this)+path).openConnection();
        c.setRequestMethod(method);c.setConnectTimeout(15000);c.setReadTimeout(30000);c.setRequestProperty("Accept","application/json");c.setRequestProperty("Authorization","Bearer "+access);
        if(json!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");try(OutputStream o=c.getOutputStream()){o.write(json.toString().getBytes(StandardCharsets.UTF_8));}}
        int code=c.getResponseCode();if(code==401){access=NativeBackgroundSync.refreshSession(this);c.disconnect();return request(method,path,json);}
        BufferedReader r=new BufferedReader(new InputStreamReader(code>=400?c.getErrorStream():c.getInputStream(),StandardCharsets.UTF_8));StringBuilder s=new StringBuilder();String line;while((line=r.readLine())!=null)s.append(line);
        if(code<200||code>=300)throw new Exception("HTTP "+code+" "+s);return s.length()==0?new JSONObject():new JSONObject(s.toString());
    }

    private void finishWithResult(){setResult(RESULT_OK,new Intent().putExtra(RES_CHANGED,changed));finish();}
    private boolean bool(JSONObject o,String k,boolean d){return o.has(k)?o.optBoolean(k,d):d;}
    private String str(JSONObject o,String k,String d){String x=o.optString(k,d);return x==null||x.isEmpty()?d:x;}
    private String join(String[] a){StringBuilder s=new StringBuilder();for(int i=0;i<a.length;i++){if(i>0)s.append(", ");s.append(a[i]);}return s.toString();}
    private String formatBytes(long n){if(n<1024)return n+" B";if(n<1024*1024)return (n/1024)+" KB";if(n<1024*1024*1024)return (n/1024/1024)+" MB";return (n/1024/1024/1024)+" GB";}
    private void confirmClearCache(){new AlertDialog.Builder(this).setTitle("Clear cache?").setMessage("Cached chat/media data will be removed from this device.").setNegativeButton("Cancel",null).setPositiveButton("Clear",(d,w)->{try{deleteDir(getCacheDir());toast("Cache cleared");}catch(Throwable e){toast("Could not clear cache");}}).show();}
    private void deleteDir(java.io.File f){if(f==null||!f.exists())return;if(f.isDirectory()){java.io.File[] a=f.listFiles();if(a!=null)for(java.io.File x:a)deleteDir(x);}f.delete();}
    private void sectionTitle(String s){title.setText(s);body.addView(t(s,20,text,true));}
    private LinearLayout card(){LinearLayout c=new LinearLayout(this);c.setOrientation(LinearLayout.VERTICAL);c.setPadding(8,4,8,4);android.graphics.drawable.GradientDrawable g=new android.graphics.drawable.GradientDrawable();g.setColor(card);g.setCornerRadius(18);c.setBackground(g);return c;}
    private TextView cardText(String s){TextView t=t(s,14,sub,false);t.setPadding(16,16,16,16);return t;}
    private View divider(){View v=new View(this);v.setBackgroundColor(line);v.setLayoutParams(new LinearLayout.LayoutParams(-1,1));return v;}
    private View row(String a,String b,Runnable r){LinearLayout x=new LinearLayout(this);x.setOrientation(LinearLayout.VERTICAL);x.setPadding(16,15,16,15);x.addView(t(a,16,text,true));x.addView(t(b,13,sub,false));x.setOnClickListener(v->r.run());return x;}
    private Button button(String s,boolean danger,View.OnClickListener l){Button b=new Button(this);b.setText(s);b.setAllCaps(false);b.setTextColor(danger?DANGER:Color.WHITE);b.setOnClickListener(l);android.graphics.drawable.GradientDrawable g=new android.graphics.drawable.GradientDrawable();g.setCornerRadius(12);g.setColor(danger?card:PRIMARY);if(danger)g.setStroke(1,DANGER);b.setBackground(g);body.addView(b);return b;}
    private TextView t(String s,int sp,int c,boolean bold){TextView x=new TextView(this);x.setText(s);x.setTextSize(sp);x.setTextColor(c);if(bold)x.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);return x;}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}
}
