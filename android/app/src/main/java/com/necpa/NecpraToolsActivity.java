package com.necpa;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.text.InputType;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import androidx.appcompat.app.AlertDialog;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import android.net.Uri;
import android.graphics.Matrix;
import android.media.ExifInterface;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native Categories / Marketplace browse screen (Jumia-style):
 *
 *   Categories (Physical | Digital | Services tabs) -> sub-categories (image tiles, grouped by section)
 *   -> approved products (2-column grid, count + sort) -> product detail (Chat with Seller / Chat with Admin).
 *
 * It uses the SAME backend and the SAME category tree as the web Tools module:
 *   - the tree (window._JM_CATS) is handed in by the web layer as EXTRA_TREE, so ids/labels always match
 *     what sellers pick in Create Listing;
 *   - products come from GET /api/marketplace/products?category=..&sort=.. (the backend only returns
 *     approved + available listings to buyers);
 *   - the session comes from the Keystore-encrypted native auth prefs, refreshed through
 *     NativeBackgroundSync.refreshSession. No token is ever written to WebView storage.
 *
 * Anything that is not browsing (cart, checkout, orders, seller dashboard, admin approval) stays in the web
 * module: the product detail hands back RES_OPEN_PRODUCT_ID and the web layer opens its own product page.
 * Chat buttons hand back RES_CHAT_USER_ID, which native-init.js opens in the native Messages screen.
 */
public class NecpraToolsActivity extends AppCompatActivity {

    static final String EXTRA_TREE = "tree";
    static final String EXTRA_CATEGORY = "category";
    static final String EXTRA_START = "start";            // "home" | "categories" | "cart" | "wishlist" | "orders"
    static final String RES_CART_CHANGED = "cartChanged";
    static final String RES_CHECKOUT = "checkout";
    static final String RES_OPEN_WEB = "openWeb";          // "menu" -> web Tools menu
    static final String RES_SESSION_EXPIRED = "sessionExpired";
    static final String RES_CHAT_USER_ID = "chatUserId";
    static final String RES_CHAT_USER_NAME = "chatUserName";
    static final String RES_OPEN_PRODUCT_ID = "openProductId";

    private static final int C_ORANGE = Color.parseColor("#F68B1E");
    private static final int C_TEXT = Color.parseColor("#1F2937");
    private static final int C_MUTED = Color.parseColor("#6B7280");
    private static final int C_LINE = Color.parseColor("#E5E7EB");
    private static final int C_BG = Color.parseColor("#F3F4F6");

    private static final LruCache<String, Bitmap> MEM = new LruCache<>(80);

    private static final class SessionExpired extends Exception {}

    private static final class Frame {
        final String type;      // "cats" | "subs" | "products" | "detail"
        String catId, sub, title;
        JSONObject product;
        Frame(String type, String catId, String sub, String title) {
            this.type = type; this.catId = catId; this.sub = sub; this.title = title;
        }
    }

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newFixedThreadPool(4);
    private final ArrayList<Frame> stack = new ArrayList<>();
    private JSONArray tree = new JSONArray();
    private String group = "physical";
    private String sort = "newest";
    private int token = 0; // invalidates in-flight loads when the screen changes

    private TextView titleView, backView;
    private LinearLayout tabsBar, body;
    private ScrollView scroll;
    private boolean closing;
    private boolean cartChanged;
    private volatile boolean isAdmin;

    // Checkout state
    private JSONArray cartItemsNow = new JSONArray();
    private final List<JSONObject> addrs = new ArrayList<>();
    private JSONObject chosenAddr;
    private String payMethod = "mpesa";
    private String mpesaPhone = "";
    private String couponCode = "";
    private String idemKey = "";
    private boolean placing;
    private volatile boolean polling;
    private LinearLayout bottomNav;
    private String homeQuery = "";

    // Sell form state (kept across re-renders of the form)
    private final List<String> sellImages = new ArrayList<>();
    private EditText sTitle, sDesc, sPrice, sOrig, sStock, sBrand;
    private Spinner sCat, sSub;
    private TextView sPhotoInfo, sSubmit;
    private List<String> sCatIds = new ArrayList<>();
    private List<String> sSubNames = new ArrayList<>();
    private boolean sBusy;
    private final ActivityResultLauncher<String> pickImages =
        registerForActivityResult(new ActivityResultContracts.GetMultipleContents(), uris -> {
            if (uris == null || uris.isEmpty()) return;
            uploadPicked(uris);
        });

    // ------------------------------------------------------------------ lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try { getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE); } catch (Exception ignored) {}

        try { tree = new JSONArray(getIntent().getStringExtra(EXTRA_TREE)); } catch (Exception e) { tree = new JSONArray(); }
        if (tree.length() == 0) tree = fallbackTree();

        buildShell();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { goBack(); }
        });

        String startCat = getIntent().getStringExtra(EXTRA_CATEGORY);
        String start = getIntent().getStringExtra(EXTRA_START);
        if ("home".equals(start)) stack.add(new Frame("home", null, null, "Home"));
        else if ("cart".equals(start)) stack.add(new Frame("cart", null, null, "Cart"));
        else if ("wishlist".equals(start)) stack.add(new Frame("wishlist", null, null, "Wishlist"));
        else if ("orders".equals(start)) stack.add(new Frame("orders", null, null, "My orders"));
        else stack.add(new Frame("cats", null, null, "Categories"));
        if (startCat != null && !startCat.isEmpty() && findCat(startCat) != null) {
            group = groupOf(startCat);
            stack.add(new Frame("subs", startCat, null, catName(startCat)));
        }
        render();
        probeAdmin();
    }

    @Override
    protected void onDestroy() {
        closing = true;
        io.shutdownNow();
        super.onDestroy();
    }

    private void goBack() {
        polling = false;
        if (stack.size() > 1) { stack.remove(stack.size() - 1); render(); }
        else finishWith(new Intent());
    }

    private void finishWith(Intent data) {
        closing = true;
        if (cartChanged) data.putExtra(RES_CART_CHANGED, true);
        setResult(RESULT_OK, data);
        finish();
    }

    // ------------------------------------------------------------------ shell

    private void buildShell() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(C_BG);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(C_ORANGE);
        bar.setPadding(dp(8), dp(8), dp(12), dp(8));

        backView = text("\u2190", 22, Color.WHITE, true);
        backView.setPadding(dp(10), dp(4), dp(14), dp(4));
        backView.setOnClickListener(v -> goBack());
        bar.addView(backView);

        titleView = text("Categories", 18, Color.WHITE, true);
        titleView.setSingleLine(true);
        bar.addView(titleView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView support = text("Help", 13, Color.WHITE, true);
        support.setPadding(dp(12), dp(6), dp(12), dp(6));
        support.setBackground(rounded(Color.parseColor("#33FFFFFF"), 16));
        support.setOnClickListener(v -> chatWithAdmin());
        bar.addView(support);
        root.addView(bar);

        tabsBar = new LinearLayout(this);
        tabsBar.setOrientation(LinearLayout.HORIZONTAL);
        tabsBar.setBackgroundColor(Color.WHITE);
        root.addView(tabsBar);

        scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(body, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        bottomNav = new LinearLayout(this);
        bottomNav.setOrientation(LinearLayout.HORIZONTAL);
        bottomNav.setBackgroundColor(Color.WHITE);
        root.addView(bottomNav, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        FrameLayout wrap = new FrameLayout(this);
        wrap.addView(root, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(wrap);

        ViewCompat.setOnApplyWindowInsetsListener(wrap, (v, insets) -> {
            Insets s = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            v.setPadding(s.left, s.top, s.right, s.bottom);
            return insets;
        });
    }

    // ------------------------------------------------------------------ rendering

    private void render() {
        token++;
        Frame f = stack.get(stack.size() - 1);
        titleView.setText(f.title == null ? "Categories" : f.title);
        body.removeAllViews();
        scroll.scrollTo(0, 0);
        tabsBar.removeAllViews();
        tabsBar.setVisibility(f.type.equals("cats") ? View.VISIBLE : View.GONE);
        boolean root = f.type.equals("home") || f.type.equals("cats") || f.type.equals("cart") || f.type.equals("wishlist") || f.type.equals("orders");
        renderBottomNav(root ? f.type : null);
        switch (f.type) {
            case "home": renderHome(); break;
            case "cart": renderCart(); break;
            case "wishlist": renderWishlist(); break;
            case "checkout": renderCheckout(); break;
            case "pay": renderPay(f); break;
            case "done": renderDone(f); break;
            case "mylist": renderMyListings(); break;
            case "sell": renderSell(); break;
            case "adminq": renderAdminQueue(); break;
            case "sorders": renderSellerOrders(); break;
            case "sorder": renderSellerOrder(f); break;
            case "orders": renderOrders(); break;
            case "order": renderOrder(f); break;
            case "cats": renderCats(); break;
            case "subs": renderSubs(f); break;
            case "products": renderProducts(f); break;
            case "detail": renderDetail(f); break;
            default: break;
        }
    }

    private void renderCats() {
        final String[][] tabs = { {"physical", "Physical"}, {"digital", "Digital"}, {"services", "Services"} };
        for (String[] t : tabs) {
            boolean on = t[0].equals(group);
            TextView tv = text(t[1], 14, on ? C_ORANGE : C_MUTED, true);
            tv.setGravity(Gravity.CENTER);
            tv.setPadding(0, dp(12), 0, dp(10));
            tv.setBackground(underline(on));
            tv.setOnClickListener(v -> { group = t[0]; render(); });
            tabsBar.addView(tv, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        }
        // Digital / Services are a single top-level category each: go straight to its sub-categories.
        if (group.equals("digital") || group.equals("services")) {
            JSONObject c = findCat(group);
            if (c != null) { renderSubsInto(c); return; }
        }
        for (int i = 0; i < tree.length(); i++) {
            JSONObject c = tree.optJSONObject(i);
            if (c == null) continue;
            String id = c.optString("id");
            if (!groupOf(id).equals(group)) continue;
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setBackgroundColor(Color.WHITE);
            row.setPadding(dp(16), dp(14), dp(16), dp(14));
            String icon = c.optString("icon", "");
            if (!icon.isEmpty()) {
                TextView ic = text(icon, 20, C_TEXT, false);
                ic.setPadding(0, 0, dp(12), 0);
                row.addView(ic);
            }
            row.addView(text(c.optString("name", id), 15, C_TEXT, false), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            row.addView(text("\u203A", 20, C_MUTED, false));
            row.setOnClickListener(v -> { stack.add(new Frame("subs", id, null, c.optString("name", id))); render(); });
            body.addView(row);
            body.addView(divider());
        }
        if (body.getChildCount() == 0) body.addView(emptyState("No categories"));
    }

    private void renderSubs(Frame f) {
        JSONObject c = findCat(f.catId);
        if (c == null) { body.addView(emptyState("Category not found")); return; }
        renderSubsInto(c);
    }

    private void renderSubsInto(JSONObject c) {
        final String catId = c.optString("id");
        JSONArray sections = c.optJSONArray("sections");
        if (sections == null || sections.length() == 0) {
            // No sub-categories: show every product of the category.
            stack.add(new Frame("products", catId, null, c.optString("name", catId)));
            render();
            return;
        }
        // "All" shortcut, like Jumia's "See all".
        TextView all = text("See all in " + c.optString("name", catId), 14, C_ORANGE, true);
        all.setBackgroundColor(Color.WHITE);
        all.setPadding(dp(16), dp(14), dp(16), dp(14));
        all.setOnClickListener(v -> { stack.add(new Frame("products", catId, null, c.optString("name", catId))); render(); });
        body.addView(all);
        body.addView(divider());

        for (int i = 0; i < sections.length(); i++) {
            JSONObject sec = sections.optJSONObject(i);
            if (sec == null) continue;
            TextView h = text(sec.optString("name"), 14, C_TEXT, true);
            h.setPadding(dp(16), dp(16), dp(16), dp(8));
            body.addView(h);
            JSONArray subs = sec.optJSONArray("subs");
            if (subs == null) continue;
            LinearLayout rowL = null;
            for (int j = 0; j < subs.length(); j++) {
                JSONObject s = subs.optJSONObject(j);
                if (s == null) continue;
                if (j % 3 == 0) {
                    rowL = new LinearLayout(this);
                    rowL.setOrientation(LinearLayout.HORIZONTAL);
                    rowL.setPadding(dp(8), 0, dp(8), dp(8));
                    body.addView(rowL, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
                }
                rowL.addView(subTile(catId, s), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            }
            if (rowL != null) {
                int rem = subs.length() % 3;
                for (int k = 0; rem != 0 && k < 3 - rem; k++) rowL.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
            }
        }
    }

    private View subTile(final String catId, final JSONObject s) {
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setGravity(Gravity.CENTER_HORIZONTAL);
        t.setPadding(dp(6), dp(6), dp(6), dp(6));
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setBackground(rounded(Color.WHITE, 10));
        img.setClipToOutline(true);
        t.addView(img, new LinearLayout.LayoutParams(dp(84), dp(84)));
        loadImage(s.optString("img"), img);
        TextView n = text(s.optString("name"), 12, C_TEXT, false);
        n.setGravity(Gravity.CENTER);
        n.setMaxLines(2);
        n.setPadding(0, dp(6), 0, 0);
        t.addView(n);
        t.setOnClickListener(v -> { stack.add(new Frame("products", catId, s.optString("name"), s.optString("name"))); render(); });
        return t;
    }

    // ------------------------------------------------------------------ products

    private void renderProducts(final Frame f) {
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setBackgroundColor(Color.WHITE);
        toolbar.setPadding(dp(14), dp(6), dp(10), dp(6));
        final TextView count = text("Loading\u2026", 13, C_MUTED, false);
        toolbar.addView(count, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        final String[] labels = { "Newest", "Price: low to high", "Price: high to low", "Top rated" };
        final String[] keys = { "newest", "price_low", "price_high", "rating" };
        Spinner sp = new Spinner(this);
        sp.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels));
        for (int i = 0; i < keys.length; i++) if (keys[i].equals(sort)) sp.setSelection(i);
        toolbar.addView(sp);
        body.addView(toolbar);
        body.addView(divider());

        final LinearLayout grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setPadding(dp(6), dp(8), dp(6), dp(16));
        body.addView(grid);
        grid.addView(emptyState("Loading\u2026"));

        final int my = token;
        final List<JSONObject> loaded = new ArrayList<>();
        final boolean[] ready = { false };
        final Runnable draw = () -> {
            if (!ready[0] || my != token || closing) return;
            List<JSONObject> list = new ArrayList<>(loaded);
            sortList(list, sort);
            count.setText(list.size() + (list.size() == 1 ? " product" : " products"));
            drawGrid(grid, list);
        };
        sp.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> p, View v, int pos, long id) {
                if (!keys[pos].equals(sort)) { sort = keys[pos]; draw.run(); }
            }
            @Override public void onNothingSelected(AdapterView<?> p) {}
        });

        io.execute(() -> {
            try {
                List<JSONObject> rows = fetchProducts(f.catId, f.sub);
                ui.post(() -> {
                    if (my != token || closing) return;
                    loaded.clear(); loaded.addAll(rows); ready[0] = true; draw.run();
                });
            } catch (SessionExpired se) {
                ui.post(this::sessionExpired);
            } catch (Throwable t) {
                ui.post(() -> {
                    if (my != token || closing) return;
                    grid.removeAllViews();
                    grid.addView(emptyState("Could not load products. Check your connection and try again."));
                    count.setText("");
                });
            }
        });
    }

    private void drawGrid(LinearLayout grid, List<JSONObject> list) {
        grid.removeAllViews();
        if (list.isEmpty()) { grid.addView(emptyState("No products found")); return; }
        for (int i = 0; i < list.size(); i += 2) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.addView(productCard(list.get(i)), cardLp());
            if (i + 1 < list.size()) row.addView(productCard(list.get(i + 1)), cardLp());
            else row.addView(new View(this), cardLp());
            grid.addView(row);
        }
    }

    private LinearLayout.LayoutParams cardLp() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lp.setMargins(dp(4), dp(4), dp(4), dp(4));
        return lp;
    }

    private View productCard(final JSONObject p) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(rounded(Color.WHITE, 8));
        card.setClipToOutline(true);

        FrameLayout imgWrap = new FrameLayout(this);
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setBackgroundColor(C_BG);
        imgWrap.addView(img, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(150)));
        String url = firstImage(p);
        if (url.isEmpty()) {
            TextView ph = text("\uD83D\uDECD\uFE0F", 34, C_MUTED, false);
            ph.setGravity(Gravity.CENTER);
            imgWrap.addView(ph, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(150)));
        } else loadImage(url, img);
        int disc = discountPct(p);
        if (disc > 0) {
            TextView b = text("-" + disc + "%", 11, C_ORANGE, true);
            b.setBackground(rounded(Color.parseColor("#FEF3E2"), 4));
            b.setPadding(dp(6), dp(2), dp(6), dp(2));
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
            lp.setMargins(0, dp(6), dp(6), 0);
            imgWrap.addView(b, lp);
        }
        card.addView(imgWrap);

        LinearLayout info = new LinearLayout(this);
        info.setOrientation(LinearLayout.VERTICAL);
        info.setPadding(dp(8), dp(8), dp(8), dp(10));
        TextView title = text(p.optString("title"), 13, C_TEXT, false);
        title.setMaxLines(2);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        info.addView(title);
        TextView price = text(money(price(p)), 15, C_TEXT, true);
        price.setPadding(0, dp(4), 0, 0);
        info.addView(price);
        double op = origPrice(p);
        if (op > price(p)) {
            TextView o = text(money(op), 11, C_MUTED, false);
            o.setPaintFlags(o.getPaintFlags() | Paint.STRIKE_THRU_TEXT_FLAG);
            info.addView(o);
        }
        double rating = p.optDouble("rating", 0);
        if (rating > 0) info.addView(text("\u2605 " + String.format(Locale.US, "%.1f", rating), 11, C_ORANGE, false));
        card.addView(info);
        card.setOnClickListener(v -> { Frame d = new Frame("detail", null, null, p.optString("title")); d.product = p; stack.add(d); render(); });
        return card;
    }

    // ------------------------------------------------------------------ detail

    private void renderDetail(Frame f) {
        final JSONObject p = f.product;
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.FIT_CENTER);
        img.setBackgroundColor(Color.WHITE);
        body.addView(img, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(280)));
        loadImage(firstImage(p), img);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(Color.WHITE);
        box.setPadding(dp(16), dp(14), dp(16), dp(16));
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        blp.topMargin = dp(8);
        body.addView(box, blp);

        box.addView(text(p.optString("title"), 17, C_TEXT, true));
        TextView price = text(money(price(p)), 22, C_ORANGE, true);
        price.setPadding(0, dp(8), 0, 0);
        box.addView(price);
        double op = origPrice(p);
        if (op > price(p)) {
            TextView o = text(money(op) + "  (-" + discountPct(p) + "%)", 12, C_MUTED, false);
            box.addView(o);
        }
        String brand = p.optString("brand", "");
        if (!brand.isEmpty() && !"null".equals(brand)) box.addView(text("Brand: " + brand, 13, C_MUTED, false));
        String loc = p.optString("location", "");
        if (loc.isEmpty()) { JSONObject m = p.optJSONObject("metadata"); if (m != null) loc = m.optString("location", ""); }
        if (!loc.isEmpty() && !"null".equals(loc)) box.addView(text("Location: " + loc, 13, C_MUTED, false));
        String desc = p.optString("description", "");
        if (!desc.isEmpty() && !"null".equals(desc)) {
            TextView d = text(desc, 14, C_TEXT, false);
            d.setPadding(0, dp(14), 0, 0);
            box.addView(d);
        }

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.VERTICAL);
        actions.setPadding(dp(16), dp(12), dp(16), dp(24));
        body.addView(actions);

        actions.addView(button("Add to cart", C_ORANGE, Color.WHITE, v -> addToCart(p)));
        actions.addView(button("Open full page / Buy now", Color.WHITE, C_ORANGE, v -> {
            Intent r = new Intent();
            r.putExtra(RES_OPEN_PRODUCT_ID, p.optString("id"));
            finishWith(r);
        }));
        actions.addView(button("Save / remove from wishlist", Color.WHITE, C_ORANGE, v -> toggleWishlist(p)));
        actions.addView(button("Chat with seller", Color.WHITE, C_ORANGE, v -> {
            long seller = sellerId(p);
            if (seller <= 0) { toast("Seller chat is not available for this listing"); return; }
            Intent r = new Intent();
            r.putExtra(RES_CHAT_USER_ID, seller);
            String name = "Seller";
            JSONObject s = p.optJSONObject("seller");
            if (s != null) { String n = s.optString("displayName", s.optString("username", s.optString("name", ""))); if (!n.isEmpty()) name = n; }
            r.putExtra(RES_CHAT_USER_NAME, name);
            finishWith(r);
        }));
    }

    private long sellerId(JSONObject p) {
        long id = p.optLong("sellerId", 0);
        if (id <= 0) id = p.optLong("seller_id", 0);
        if (id <= 0) id = p.optLong("userId", 0);
        if (id <= 0) { JSONObject s = p.optJSONObject("seller"); if (s != null) id = s.optLong("id", 0); }
        return id;
    }

    // ------------------------------------------------------------------ chat with admin

    private void chatWithAdmin() {
        io.execute(() -> {
            try {
                JSONObject r = request("/api/tools/admin-contact");
                JSONObject d = r.optJSONObject("data");
                if (d == null) d = r;
                final long adminId = d.optLong("adminUserId", 0);
                final String name = d.optString("name", "Support");
                ui.post(() -> {
                    if (closing) return;
                    if (adminId > 0) {
                        Intent out = new Intent();
                        out.putExtra(RES_CHAT_USER_ID, adminId);
                        out.putExtra(RES_CHAT_USER_NAME, name);
                        finishWith(out);
                    } else toast("Support chat is not available right now");
                });
            } catch (SessionExpired se) {
                ui.post(this::sessionExpired);
            } catch (Throwable t) {
                ui.post(() -> toast("Could not reach support right now"));
            }
        });
    }

    // ------------------------------------------------------------------ data

    private List<JSONObject> fetchProducts(String catId, String sub) throws Exception {
        String path = "/api/marketplace/products?limit=100&sort=newest";
        if (catId != null && !catId.isEmpty()) path += "&category=" + URLEncoder.encode(catId, "UTF-8");
        JSONObject r = request(path);
        JSONArray arr = null;
        Object data = r.opt("data");
        if (data instanceof JSONArray) arr = (JSONArray) data;
        else if (data instanceof JSONObject) {
            arr = ((JSONObject) data).optJSONArray("products");
            if (arr == null) arr = ((JSONObject) data).optJSONArray("listings");
        }
        if (arr == null) arr = r.optJSONArray("products");
        if (arr == null) arr = r.optJSONArray("listings");
        List<JSONObject> out = new ArrayList<>();
        if (arr == null) return out;
        String target = norm(sub);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject p = arr.optJSONObject(i);
            if (p == null) continue;
            String st = p.optString("status", "");
            if ("deleted".equals(st) || "rejected".equals(st)) continue;
            if (!target.isEmpty()) {
                String ps = p.optString("subcategory", "");
                if (ps.isEmpty() || "null".equals(ps)) { JSONObject m = p.optJSONObject("metadata"); if (m != null) ps = m.optString("subcategory", ""); }
                if (!ps.isEmpty() && !"null".equals(ps)) { if (!norm(ps).equals(target)) continue; }
                else {
                    // Listings saved before sub-categories existed: keyword match on title.
                    if (target.length() <= 3 || !norm(p.optString("title", "")).contains(target)) continue;
                }
            }
            out.add(p);
        }
        return out;
    }

    private static String norm(String s) {
        if (s == null) return "";
        String x = s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
        return x.endsWith("s") ? x.substring(0, x.length() - 1) : x;
    }

    private SharedPreferences authPrefs() { return getSharedPreferences(NativeBackgroundSync.AUTH_PREFS, Context.MODE_PRIVATE); }

    private JSONObject request(String path) throws Exception { return request("GET", path, null); }

    private static JSONObject payload(JSONObject r) {
        JSONObject d = r.optJSONObject("data");
        return d != null ? d : r;
    }

    private JSONObject request(String method, String path, JSONObject json) throws Exception {
        boolean retried = false;
        while (true) {
            String access = NativeBackgroundSync.getDecrypted(authPrefs(), "accessToken");
            if (access == null || access.isEmpty()) access = refresh();
            HttpURLConnection c = null;
            int status;
            String text;
            try {
                c = (HttpURLConnection) new URL(NativeBackgroundSync.backendOrigin(this) + path).openConnection();
                c.setRequestMethod(method);
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setUseCaches(false);
                c.setRequestProperty("Accept", "application/json");
                c.setRequestProperty("Authorization", "Bearer " + access);
                if (json != null) {
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    try (OutputStream out = c.getOutputStream()) { out.write(json.toString().getBytes(StandardCharsets.UTF_8)); }
                }
                status = c.getResponseCode();
                text = NativeBackgroundSync.readText(status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream());
            } finally {
                if (c != null) c.disconnect();
            }
            if (status == 401) {
                if (retried) throw new SessionExpired();
                retried = true;
                refresh();
                continue;
            }
            JSONObject parsed;
            try { parsed = new JSONObject(text == null || text.trim().isEmpty() ? "{}" : text); } catch (Exception e) { parsed = new JSONObject(); }
            if (status < 200 || status >= 300) throw new Exception(parsed.optString("message", parsed.optString("error", "HTTP " + status)));
            return parsed;
        }
    }

    private String refresh() throws Exception {
        try { return NativeBackgroundSync.refreshSession(this); }
        catch (NativeBackgroundSync.SessionExpiredException se) { throw new SessionExpired(); }
    }

    private void sessionExpired() {
        if (closing) return;
        Intent r = new Intent();
        r.putExtra(RES_SESSION_EXPIRED, true);
        finishWith(r);
    }

    // ------------------------------------------------------------------ product helpers

    private double price(JSONObject p) { return p.optDouble("price", 0); }

    private double origPrice(JSONObject p) {
        double v = p.optDouble("original_price", 0);
        if (v <= 0) v = p.optDouble("originalPrice", 0);
        if (v <= 0) { JSONObject m = p.optJSONObject("metadata"); if (m != null) v = m.optDouble("original_price", 0); }
        return Double.isNaN(v) ? 0 : v;
    }

    private int discountPct(JSONObject p) {
        double op = origPrice(p), pr = price(p);
        return (op > pr && pr > 0) ? (int) Math.round((op - pr) * 100.0 / op) : 0;
    }

    private String money(double v) {
        return v <= 0 ? "Free" : "KSh " + String.format(Locale.US, "%,.0f", v);
    }

    private String firstImage(JSONObject p) {
        List<String> raw = new ArrayList<>();
        collect(p.opt("images"), raw);
        collect(p.opt("image"), raw);
        collect(p.opt("imageUrl"), raw);
        collect(p.opt("mediaUrl"), raw);
        for (String u : raw) {
            String s = u == null ? "" : u.trim();
            if (s.isEmpty()) continue;
            if (s.matches("(?i).*\\.(pdf|zip|rar|7z|docx?|xlsx?|pptx?|txt|csv|json|epub|mobi|apk|exe|mp3|wav|m4a|mp4|mov|webm|avi)(?:$|[?#]).*")) continue;
            if (s.contains("/raw/upload/")) continue;
            return absolute(s);
        }
        return "";
    }

    private void collect(Object v, List<String> out) {
        if (v == null || v == JSONObject.NULL) return;
        if (v instanceof JSONArray) { JSONArray a = (JSONArray) v; for (int i = 0; i < a.length(); i++) collect(a.opt(i), out); }
        else if (v instanceof JSONObject) { JSONObject o = (JSONObject) v; collect(o.opt("url"), out); collect(o.opt("src"), out); collect(o.opt("secure_url"), out); }
        else {
            String s = String.valueOf(v).trim();
            if (s.startsWith("[")) { try { collect(new JSONArray(s), out); return; } catch (Exception ignored) {} }
            out.add(s);
        }
    }

    private String absolute(String u) {
        if (u.startsWith("//")) return "https:" + u;
        if (u.startsWith("http://") || u.startsWith("https://")) return u;
        String o = NativeBackgroundSync.backendOrigin(this);
        return o + (u.startsWith("/") ? "" : "/") + u;
    }

    private void sortList(List<JSONObject> list, String key) {
        Comparator<JSONObject> c;
        switch (key) {
            case "price_low": c = (a, b) -> Double.compare(price(a), price(b)); break;
            case "price_high": c = (a, b) -> Double.compare(price(b), price(a)); break;
            case "rating": c = (a, b) -> Double.compare(b.optDouble("rating", 0), a.optDouble("rating", 0)); break;
            default: c = (a, b) -> b.optString("createdAt", b.optString("created_at", "")).compareTo(a.optString("createdAt", a.optString("created_at", "")));
        }
        Collections.sort(list, c);
    }

    // ------------------------------------------------------------------ category tree helpers

    private JSONObject findCat(String id) {
        for (int i = 0; i < tree.length(); i++) { JSONObject c = tree.optJSONObject(i); if (c != null && id.equals(c.optString("id"))) return c; }
        return null;
    }

    private String catName(String id) { JSONObject c = findCat(id); return c == null ? id : c.optString("name", id); }

    private String groupOf(String catId) {
        if ("digital".equals(catId)) return "digital";
        if ("services".equals(catId)) return "services";
        return "physical";
    }

    /** Used only if the web layer could not pass its tree (e.g. older web build). */
    private JSONArray fallbackTree() {
        try {
            return new JSONArray("[{\"id\":\"phones\",\"name\":\"Phones & Tablets\"},{\"id\":\"electronics\",\"name\":\"TVs & Audio\"},"
                    + "{\"id\":\"appliances\",\"name\":\"Appliances\"},{\"id\":\"health\",\"name\":\"Health & Beauty\"},{\"id\":\"home\",\"name\":\"Home & Office\"},"
                    + "{\"id\":\"fashion\",\"name\":\"Fashion\"},{\"id\":\"computing\",\"name\":\"Computing\"},{\"id\":\"gaming\",\"name\":\"Gaming\"},"
                    + "{\"id\":\"baby\",\"name\":\"Baby Products\"},{\"id\":\"sports\",\"name\":\"Sporting Goods\"},{\"id\":\"supermarket\",\"name\":\"Supermarket\"},"
                    + "{\"id\":\"digital\",\"name\":\"Digital\"},{\"id\":\"services\",\"name\":\"Services\"}]");
        } catch (Exception e) { return new JSONArray(); }
    }


    // ------------------------------------------------------------------ bottom nav

    private void renderBottomNav(String active) {
        bottomNav.removeAllViews();
        if (active == null) { bottomNav.setVisibility(View.GONE); return; }
        bottomNav.setVisibility(View.VISIBLE);
        final String[][] items = { {"home", "Home"}, {"cats", "Categories"}, {"cart", "Cart"}, {"wishlist", "Saved"}, {"orders", "Orders"}, {"menu", "More"} };
        for (final String[] it : items) {
            boolean on = it[0].equals(active);
            TextView t = text(it[1], 11, on ? C_ORANGE : C_MUTED, on);
            t.setGravity(Gravity.CENTER);
            t.setPadding(0, dp(12), 0, dp(12));
            t.setOnClickListener(v -> {
                if (it[0].equals("menu")) { showMoreMenu(); return; }
                if (it[0].equals(active)) return;
                stack.clear();
                String title = it[0].equals("home") ? "Home" : it[0].equals("cats") ? "Categories" : it[0].equals("cart") ? "Cart" : it[0].equals("wishlist") ? "Wishlist" : "My orders";
                stack.add(new Frame(it[0], null, null, title));
                render();
            });
            bottomNav.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        }
    }

    // ------------------------------------------------------------------ home

    private void renderHome() {
        LinearLayout searchRow = new LinearLayout(this);
        searchRow.setOrientation(LinearLayout.HORIZONTAL);
        searchRow.setBackgroundColor(Color.WHITE);
        searchRow.setPadding(dp(10), dp(8), dp(10), dp(8));
        final EditText q = new EditText(this);
        q.setHint("Search products");
        q.setSingleLine(true);
        q.setText(homeQuery);
        q.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        q.setInputType(InputType.TYPE_CLASS_TEXT);
        q.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        q.setBackground(rounded(C_BG, 20));
        q.setPadding(dp(14), dp(8), dp(14), dp(8));
        searchRow.addView(q, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        body.addView(searchRow);

        final TextView heading = text(homeQuery.isEmpty() ? "Recently added" : "Results for \u201C" + homeQuery + "\u201D", 15, C_TEXT, true);
        heading.setPadding(dp(14), dp(14), dp(14), dp(6));
        body.addView(heading);
        final LinearLayout grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setPadding(dp(6), dp(4), dp(6), dp(16));
        body.addView(grid);
        grid.addView(emptyState("Loading\u2026"));

        q.setOnEditorActionListener((v, actionId, ev) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) { homeQuery = q.getText().toString().trim(); render(); return true; }
            return false;
        });

        final int my = token;
        final String query = homeQuery;
        io.execute(() -> {
            try {
                String path = "/api/marketplace/products?limit=60&sort=newest" + (query.isEmpty() ? "" : "&search=" + URLEncoder.encode(query, "UTF-8"));
                List<JSONObject> rows = parseProducts(request(path));
                ui.post(() -> { if (my == token && !closing) drawGrid(grid, rows); });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> { if (my == token && !closing) { grid.removeAllViews(); grid.addView(emptyState("Could not load products. Check your connection.")); } }); }
        });
    }

    private List<JSONObject> parseProducts(JSONObject r) {
        JSONArray arr = null;
        Object data = r.opt("data");
        if (data instanceof JSONArray) arr = (JSONArray) data;
        else if (data instanceof JSONObject) {
            arr = ((JSONObject) data).optJSONArray("products");
            if (arr == null) arr = ((JSONObject) data).optJSONArray("listings");
        }
        if (arr == null) arr = r.optJSONArray("products");
        if (arr == null) arr = r.optJSONArray("listings");
        List<JSONObject> out = new ArrayList<>();
        if (arr == null) return out;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject p = arr.optJSONObject(i);
            if (p == null) continue;
            String st = p.optString("status", "");
            if ("deleted".equals(st) || "rejected".equals(st)) continue;
            out.add(p);
        }
        return out;
    }

    // ------------------------------------------------------------------ cart

    private void addToCart(final JSONObject p) {
        io.execute(() -> {
            try {
                JSONObject b = new JSONObject();
                b.put("product_id", p.optString("id"));
                long seller = sellerId(p);
                if (seller > 0) b.put("seller_id", seller);
                b.put("title", p.optString("title"));
                b.put("price", price(p));
                b.put("quantity", 1);
                String img = firstImage(p);
                if (!img.isEmpty()) b.put("image", img);
                request("POST", "/api/marketplace/cart", b);
                cartChanged = true;
                ui.post(() -> toast("Added to cart"));
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> toast(t.getMessage() == null ? "Could not add to cart" : t.getMessage())); }
        });
    }

    private void renderCart() {
        final LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        body.addView(box);
        box.addView(emptyState("Loading\u2026"));
        final int my = token;
        io.execute(() -> {
            try {
                JSONObject cart = payload(request("/api/marketplace/cart")).optJSONObject("cart");
                ui.post(() -> { if (my == token && !closing) drawCart(box, cart); });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> { if (my == token && !closing) { box.removeAllViews(); box.addView(emptyState("Could not load your cart. Check your connection.")); } }); }
        });
    }

    private void drawCart(LinearLayout box, JSONObject cart) {
        box.removeAllViews();
        JSONArray items = cart == null ? null : cart.optJSONArray("items");
        if (items == null || items.length() == 0) { box.addView(emptyState("Your cart is empty")); return; }
        double subtotal = 0;
        cartItemsNow = items;
        for (int i = 0; i < items.length(); i++) {
            final JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            final double pr = it.optDouble("price", 0);
            final int qty = Math.max(1, it.optInt("quantity", 1));
            subtotal += pr * qty;
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setBackgroundColor(Color.WHITE);
            row.setPadding(dp(12), dp(12), dp(12), dp(12));
            ImageView img = new ImageView(this);
            img.setScaleType(ImageView.ScaleType.CENTER_CROP);
            img.setBackgroundColor(C_BG);
            row.addView(img, new LinearLayout.LayoutParams(dp(80), dp(80)));
            String iu = it.optString("image", "");
            if (!iu.isEmpty() && !"null".equals(iu)) loadImage(absolute(iu), img);
            LinearLayout info = new LinearLayout(this);
            info.setOrientation(LinearLayout.VERTICAL);
            info.setPadding(dp(12), 0, 0, 0);
            TextView title = text(it.optString("title"), 14, C_TEXT, false);
            title.setMaxLines(2);
            info.addView(title);
            info.addView(text(money(pr), 15, C_TEXT, true));
            LinearLayout ctl = new LinearLayout(this);
            ctl.setOrientation(LinearLayout.HORIZONTAL);
            ctl.setGravity(Gravity.CENTER_VERTICAL);
            ctl.setPadding(0, dp(6), 0, 0);
            ctl.addView(stepBtn("\u2212", v -> changeQty(it, qty - 1)));
            TextView qv = text(String.valueOf(qty), 15, C_TEXT, true);
            qv.setPadding(dp(14), 0, dp(14), 0);
            ctl.addView(qv);
            ctl.addView(stepBtn("+", v -> changeQty(it, qty + 1)));
            TextView rm = text("Remove", 13, Color.parseColor("#DC2626"), true);
            rm.setPadding(dp(18), dp(4), 0, dp(4));
            rm.setOnClickListener(v -> removeItem(it));
            ctl.addView(rm);
            info.addView(ctl);
            row.addView(info, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            box.addView(row);
            box.addView(divider());
        }
        LinearLayout foot = new LinearLayout(this);
        foot.setOrientation(LinearLayout.VERTICAL);
        foot.setBackgroundColor(Color.WHITE);
        foot.setPadding(dp(16), dp(14), dp(16), dp(20));
        LinearLayout.LayoutParams flp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        flp.topMargin = dp(8);
        box.addView(foot, flp);
        foot.addView(text("Subtotal: " + money(subtotal), 17, C_TEXT, true));
        foot.addView(button("Checkout", C_ORANGE, Color.WHITE, v -> {
            idemKey = "ck_" + System.currentTimeMillis() + "_" + Long.toHexString(Double.doubleToLongBits(Math.random()));
            placing = false;
            stack.add(new Frame("checkout", null, null, "Checkout"));
            render();
        }));
    }

    private TextView stepBtn(String label, View.OnClickListener l) {
        TextView t = text(label, 18, C_ORANGE, true);
        t.setGravity(Gravity.CENTER);
        t.setBackground(rounded(Color.parseColor("#FFF7ED"), 6));
        t.setLayoutParams(new LinearLayout.LayoutParams(dp(36), dp(32)));
        t.setOnClickListener(l);
        return t;
    }

    private void changeQty(final JSONObject it, final int qty) {
        if (qty < 1) { removeItem(it); return; }
        io.execute(() -> {
            try {
                JSONObject b = new JSONObject();
                b.put("product_id", it.optString("product_id"));
                b.put("quantity", qty);
                Object v = it.opt("variant");
                if (v != null && v != JSONObject.NULL) b.put("variant", v);
                request("PATCH", "/api/marketplace/cart", b);
                cartChanged = true;
                ui.post(this::render);
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> toast(t.getMessage() == null ? "Could not update cart" : t.getMessage())); }
        });
    }

    private void removeItem(final JSONObject it) {
        io.execute(() -> {
            try {
                JSONObject b = new JSONObject();
                b.put("product_id", it.optString("product_id"));
                Object v = it.opt("variant");
                if (v != null && v != JSONObject.NULL) b.put("variant", v);
                request("DELETE", "/api/marketplace/cart", b);
                cartChanged = true;
                ui.post(this::render);
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> toast(t.getMessage() == null ? "Could not remove item" : t.getMessage())); }
        });
    }



    // ------------------------------------------------------------------ checkout + payment

    private void renderCheckout() {
        final LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        body.addView(box);
        box.addView(emptyState("Loading\u2026"));
        final int my = token;
        io.execute(() -> {
            try {
                JSONArray arr = payload(request("/api/marketplace/addresses")).optJSONArray("addresses");
                addrs.clear();
                if (arr != null) for (int i = 0; i < arr.length(); i++) { JSONObject a = arr.optJSONObject(i); if (a != null) addrs.add(a); }
                if (chosenAddr == null || !containsAddr(chosenAddr)) {
                    chosenAddr = null;
                    for (JSONObject a : addrs) if (a.optBoolean("is_default", false)) { chosenAddr = a; break; }
                    if (chosenAddr == null && !addrs.isEmpty()) chosenAddr = addrs.get(0);
                }
                ui.post(() -> { if (my == token && !closing) drawCheckout(box); });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> { if (my == token && !closing) { box.removeAllViews(); box.addView(emptyState("Could not load checkout. Check your connection.")); } }); }
        });
    }

    private boolean containsAddr(JSONObject a) {
        for (JSONObject x : addrs) if (String.valueOf(x.opt("id")).equals(String.valueOf(a.opt("id")))) return true;
        return false;
    }

    private void drawCheckout(final LinearLayout box) {
        box.removeAllViews();
        // 1. delivery address
        box.addView(sectionTitle("1. Delivery address"));
        if (addrs.isEmpty()) {
            TextView none = text("No saved address yet.", 13, C_MUTED, false);
            none.setBackgroundColor(Color.WHITE);
            none.setPadding(dp(16), dp(12), dp(16), dp(8));
            box.addView(none);
        }
        for (final JSONObject a : addrs) {
            boolean on = chosenAddr != null && String.valueOf(chosenAddr.opt("id")).equals(String.valueOf(a.opt("id")));
            TextView t = text((on ? "\u25CF  " : "\u25CB  ") + a.optString("name") + " \u2022 " + a.optString("phone") + "\n     " + a.optString("address") + ", " + a.optString("city")
                + (a.optString("region").isEmpty() ? "" : ", " + a.optString("region")), 13, C_TEXT, on);
            t.setBackgroundColor(Color.WHITE);
            t.setPadding(dp(16), dp(10), dp(16), dp(10));
            t.setOnClickListener(v -> { chosenAddr = a; if (mpesaPhone.isEmpty()) mpesaPhone = a.optString("phone"); drawCheckout(box); });
            box.addView(t);
        }
        TextView add = text("+ Add a new address", 14, C_ORANGE, true);
        add.setBackgroundColor(Color.WHITE);
        add.setPadding(dp(16), dp(12), dp(16), dp(14));
        add.setOnClickListener(v -> askNewAddress(box));
        box.addView(add);

        // 2. payment
        box.addView(sectionTitle("2. Payment"));
        LinearLayout pay = new LinearLayout(this);
        pay.setOrientation(LinearLayout.VERTICAL);
        pay.setBackgroundColor(Color.WHITE);
        pay.setPadding(dp(16), dp(8), dp(16), dp(12));
        box.addView(pay);
        pay.addView(payOption("mpesa", "M-Pesa (STK push to your phone)", box));
        pay.addView(payOption("cod", "Cash on delivery", box));
        if ("mpesa".equals(payMethod)) {
            pay.addView(label("M-Pesa phone number"));
            final EditText ph = new EditText(this);
            ph.setInputType(InputType.TYPE_CLASS_PHONE);
            ph.setHint("0712 345 678");
            ph.setText(mpesaPhone.isEmpty() && chosenAddr != null ? chosenAddr.optString("phone") : mpesaPhone);
            ph.addTextChangedListener(new android.text.TextWatcher() {
                @Override public void beforeTextChanged(CharSequence a, int b, int c, int d) {}
                @Override public void onTextChanged(CharSequence a, int b, int c, int d) { mpesaPhone = a.toString(); }
                @Override public void afterTextChanged(android.text.Editable e) {}
            });
            pay.addView(ph);
        }

        // 3. coupon + summary
        box.addView(sectionTitle("3. Order"));
        LinearLayout sum = new LinearLayout(this);
        sum.setOrientation(LinearLayout.VERTICAL);
        sum.setBackgroundColor(Color.WHITE);
        sum.setPadding(dp(16), dp(10), dp(16), dp(14));
        box.addView(sum);
        double subtotal = 0;
        for (int i = 0; i < cartItemsNow.length(); i++) {
            JSONObject it = cartItemsNow.optJSONObject(i);
            if (it == null) continue;
            int q = Math.max(1, it.optInt("quantity", 1));
            subtotal += it.optDouble("price", 0) * q;
            sum.addView(text(q + " \u00D7 " + it.optString("title"), 13, C_TEXT, false));
        }
        sum.addView(label("Coupon code (optional)"));
        final EditText cp = new EditText(this);
        cp.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        cp.setText(couponCode);
        cp.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence a, int b, int c, int d) {}
            @Override public void onTextChanged(CharSequence a, int b, int c, int d) { couponCode = a.toString().trim(); }
            @Override public void afterTextChanged(android.text.Editable e) {}
        });
        sum.addView(cp);
        TextView st = text("Items total: " + money(subtotal), 15, C_TEXT, true);
        st.setPadding(0, dp(12), 0, 0);
        sum.addView(st);
        sum.addView(text("Delivery fee and any coupon discount are calculated by the server when you place the order.", 12, C_MUTED, false));

        TextView place = button(placing ? "Placing order\u2026" : ("mpesa".equals(payMethod) ? "Place order & pay with M-Pesa" : "Place order (pay on delivery)"), C_ORANGE, Color.WHITE, v -> placeOrder());
        LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) place.getLayoutParams();
        lp.setMargins(dp(16), dp(14), dp(16), dp(24));
        box.addView(place);
    }

    private TextView sectionTitle(String t) {
        TextView v = text(t, 14, C_TEXT, true);
        v.setPadding(dp(16), dp(16), dp(16), dp(6));
        return v;
    }

    private TextView payOption(final String id, String label, final LinearLayout box) {
        boolean on = id.equals(payMethod);
        TextView t = text((on ? "\u25CF  " : "\u25CB  ") + label, 14, C_TEXT, on);
        t.setPadding(0, dp(8), 0, dp(8));
        t.setOnClickListener(v -> { payMethod = id; drawCheckout(box); });
        return t;
    }

    private void askNewAddress(final LinearLayout box) {
        final LinearLayout f = new LinearLayout(this);
        f.setOrientation(LinearLayout.VERTICAL);
        f.setPadding(dp(20), dp(8), dp(20), 0);
        final EditText n = new EditText(this); n.setHint("Full name *"); f.addView(n);
        final EditText ph = new EditText(this); ph.setHint("Phone *"); ph.setInputType(InputType.TYPE_CLASS_PHONE); f.addView(ph);
        final EditText st = new EditText(this); st.setHint("Street / building / landmark *"); f.addView(st);
        final EditText ci = new EditText(this); ci.setHint("Town / city *"); f.addView(ci);
        final EditText rg = new EditText(this); rg.setHint("County / region"); f.addView(rg);
        new AlertDialog.Builder(this).setTitle("New address").setView(f).setNegativeButton("Cancel", null)
            .setPositiveButton("Save", (d, w) -> {
                final String name = n.getText().toString().trim(), phone = ph.getText().toString().trim(), street = st.getText().toString().trim(),
                    city = ci.getText().toString().trim(), region = rg.getText().toString().trim();
                if (name.isEmpty() || phone.isEmpty() || street.isEmpty() || city.isEmpty()) { toast("Fill in name, phone, street and town"); return; }
                io.execute(() -> {
                    try {
                        JSONObject b = new JSONObject();
                        b.put("name", name); b.put("phone", phone); b.put("address", street); b.put("city", city);
                        b.put("region", region); b.put("country", "Kenya"); b.put("is_default", addrs.isEmpty());
                        JSONObject saved = payload(request("POST", "/api/marketplace/addresses", b)).optJSONObject("address");
                        if (saved != null) { chosenAddr = saved; mpesaPhone = phone; }
                        ui.post(this::render);
                    } catch (SessionExpired se) { ui.post(this::sessionExpired); }
                    catch (Throwable t) { ui.post(() -> toast(t.getMessage() == null ? "Could not save address" : t.getMessage())); }
                });
            }).show();
    }

    private static String normalizeMpesa(String v) {
        String s = v == null ? "" : v.replaceAll("\\D", "");
        if (s.startsWith("00254")) s = s.substring(2);
        if (!s.startsWith("254")) {
            if (s.startsWith("0")) s = "254" + s.substring(1);
            else if (s.matches("^[71]\\d{8}$")) s = "254" + s;
        }
        return s.matches("^254[71]\\d{8}$") ? s : null;
    }

    private void placeOrder() {
        if (placing) return;
        if (chosenAddr == null) { toast("Choose or add a delivery address"); return; }
        if (cartItemsNow.length() == 0) { toast("Your cart is empty"); return; }
        final boolean mpesa = "mpesa".equals(payMethod);
        final String phone = mpesa ? normalizeMpesa(mpesaPhone) : null;
        if (mpesa && phone == null) { toast("Enter a valid Safaricom number, e.g. 0712 345 678"); return; }
        placing = true;
        render();
        final int my = token;
        io.execute(() -> {
            try {
                JSONArray items = new JSONArray();
                for (int i = 0; i < cartItemsNow.length(); i++) {
                    JSONObject it = cartItemsNow.optJSONObject(i);
                    if (it == null) continue;
                    JSONObject o = new JSONObject();
                    String pid = it.optString("product_id");
                    o.put("product_id", pid);
                    o.put("title", it.optString("title"));
                    o.put("image", it.optString("image", ""));
                    o.put("price", it.optDouble("price", 0));
                    o.put("quantity", Math.max(1, it.optInt("quantity", 1)));
                    Object sid = it.opt("seller_id");
                    if (sid == null || sid == JSONObject.NULL || String.valueOf(sid).isEmpty() || "null".equals(String.valueOf(sid))) {
                        // older cart rows may lack the seller: look it up so the server can group by seller
                        JSONObject prod = payload(request("/api/marketplace/products/" + URLEncoder.encode(pid, "UTF-8"))).optJSONObject("product");
                        if (prod != null) sid = prod.opt("seller_id");
                    }
                    if (sid != null && sid != JSONObject.NULL) o.put("seller_id", sid);
                    Object v = it.opt("variant");
                    if (v != null && v != JSONObject.NULL) o.put("variant", v);
                    items.put(o);
                }
                JSONObject b = new JSONObject();
                b.put("items", items);
                b.put("delivery_address", chosenAddr);
                b.put("delivery_zone", "kenya");
                b.put("payment_method", payMethod);
                if (!couponCode.isEmpty()) b.put("coupon_code", couponCode);
                b.put("notes", "");
                b.put("idempotency_key", idemKey);
                JSONObject order = payload(request("POST", "/api/marketplace/checkout", b)).optJSONObject("order");
                if (order == null) throw new Exception("The server did not return an order");
                try { request("DELETE", "/api/marketplace/cart/clear", null); } catch (Throwable ignored) {}
                cartChanged = true;
                final JSONObject ord = order;
                if (!mpesa) { ui.post(() -> { placing = false; showDone(ord, "Order placed. Pay when it is delivered."); }); return; }

                JSONArray ids = ord.optJSONArray("orders");
                if (ids == null || ids.length() == 0) { ids = new JSONArray(); ids.put(ord.optString("id")); }
                JSONObject pb = new JSONObject();
                pb.put("phone", phone);
                pb.put("order_id", ord.optString("id"));
                pb.put("order_ids", ids);
                pb.put("description", "Order #" + shortId(ord.optString("id")));
                final JSONArray orderIds = ids;
                JSONObject pr = payload(request("POST", "/api/marketplace/payment/mpesa", pb));
                String req = pr.optString("checkoutRequestId", pr.optString("CheckoutRequestID", pr.optString("checkout_request_id", "")));
                if (req.isEmpty()) throw new PayStartException(ord);
                final String reqId = req;
                ui.post(() -> {
                    placing = false;
                    Frame f = new Frame("pay", null, null, "M-Pesa payment");
                    f.product = ord;
                    f.sub = reqId + "|" + orderIds.toString();
                    stack.clear();
                    stack.add(new Frame("home", null, null, "Home"));
                    stack.add(f);
                    render();
                });
            } catch (SessionExpired se) { ui.post(() -> { placing = false; sessionExpired(); }); }
            catch (PayStartException pe) {
                ui.post(() -> { placing = false; toast("Your order is saved, but the M-Pesa prompt could not start. Pay later from My orders."); showDone(pe.order, "Order saved. Payment pending."); });
            }
            catch (Throwable t) {
                ui.post(() -> { placing = false; if (my == token && !closing) { toast(t.getMessage() == null ? "Could not place order" : t.getMessage()); render(); } });
            }
        });
    }

    private static final class PayStartException extends Exception {
        final JSONObject order;
        PayStartException(JSONObject o) { super("pay start failed"); order = o; }
    }

    private void showDone(JSONObject order, String message) {
        Frame f = new Frame("done", null, null, "Order placed");
        f.product = order;
        f.sub = message;
        stack.clear();
        stack.add(new Frame("home", null, null, "Home"));
        stack.add(f);
        render();
    }

    private void renderPay(final Frame f) {
        final JSONObject ord = f.product;
        String[] parts = f.sub.split("\\|", 2);
        final String reqId = parts[0];
        final JSONArray ids;
        JSONArray tmp;
        try { tmp = new JSONArray(parts.length > 1 ? parts[1] : "[]"); } catch (Exception e) { tmp = new JSONArray(); }
        ids = tmp;

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.setBackgroundColor(Color.WHITE);
        box.setPadding(dp(24), dp(48), dp(24), dp(32));
        body.addView(box);
        box.addView(text("Check your phone", 20, C_TEXT, true));
        TextView sub = text("An M-Pesa prompt for " + money(ord.optDouble("total", 0)) + " was sent to " + mpesaPhone + ". Enter your M-Pesa PIN to pay.", 14, C_MUTED, false);
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, dp(12), 0, dp(20));
        box.addView(sub);
        final TextView status = text("Waiting for payment confirmation\u2026", 14, C_ORANGE, true);
        box.addView(status);
        box.addView(button("I'll pay later", Color.WHITE, C_ORANGE, v -> { polling = false; showDone(ord, "Order saved. Payment pending \u2013 you can pay later."); }));

        polling = true;
        final int my = token;
        io.execute(() -> {
            for (int attempt = 0; attempt <= 30 && polling && my == token && !closing; attempt++) {
                try { Thread.sleep(3000); } catch (InterruptedException ie) { return; }
                if (!polling || my != token || closing) return;
                try {
                    JSONObject b = new JSONObject();
                    b.put("request_id", reqId);
                    b.put("order_id", ord.optString("id"));
                    b.put("order_ids", ids);
                    String st = payload(request("POST", "/api/marketplace/payment/mpesa/verify", b)).optString("status", "pending");
                    if ("paid".equals(st)) { polling = false; ui.post(() -> showDone(ord, "Payment received. Thank you!")); return; }
                    if ("failed".equals(st)) { polling = false; ui.post(() -> showDone(ord, "Payment was not completed. Your order is saved as pending.")); return; }
                } catch (SessionExpired se) { polling = false; ui.post(this::sessionExpired); return; }
                catch (Throwable ignored) { /* a network blip just retries */ }
            }
            if (polling && my == token && !closing) { polling = false; ui.post(() -> showDone(ord, "Payment not confirmed yet. Order saved as pending.")); }
        });
    }

    private void renderDone(Frame f) {
        JSONObject ord = f.product;
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.setBackgroundColor(Color.WHITE);
        box.setPadding(dp(24), dp(48), dp(24), dp(32));
        body.addView(box);
        box.addView(text("\u2705", 44, C_TEXT, false));
        TextView h = text("Order #" + shortId(ord.optString("id")), 20, C_TEXT, true);
        h.setPadding(0, dp(12), 0, dp(6));
        box.addView(h);
        TextView m = text(f.sub == null ? "" : f.sub, 14, C_MUTED, false);
        m.setGravity(Gravity.CENTER);
        box.addView(m);
        if (ord.optDouble("total", 0) > 0) {
            TextView t = text("Total: " + money(ord.optDouble("total", 0)), 16, C_TEXT, true);
            t.setPadding(0, dp(12), 0, 0);
            box.addView(t);
        }
        box.addView(button("View my orders", C_ORANGE, Color.WHITE, v -> { stack.clear(); stack.add(new Frame("orders", null, null, "My orders")); render(); }));
        box.addView(button("Keep shopping", Color.WHITE, C_ORANGE, v -> { stack.clear(); stack.add(new Frame("home", null, null, "Home")); render(); }));
    }

    // ------------------------------------------------------------------ wishlist

    private void renderWishlist() {
        final LinearLayout grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setPadding(dp(6), dp(8), dp(6), dp(16));
        body.addView(grid);
        grid.addView(emptyState("Loading\u2026"));
        final int my = token;
        io.execute(() -> {
            try {
                JSONArray arr = payload(request("/api/marketplace/wishlist")).optJSONArray("items");
                final List<JSONObject> rows = new ArrayList<>();
                if (arr != null) for (int i = 0; i < arr.length(); i++) {
                    JSONObject p = arr.optJSONObject(i);
                    if (p == null) continue;
                    if (p.optString("id", "").isEmpty()) p.put("id", p.optString("product_id"));
                    rows.add(p);
                }
                ui.post(() -> {
                    if (my != token || closing) return;
                    if (rows.isEmpty()) { grid.removeAllViews(); grid.addView(emptyState("Your wishlist is empty. Open a product and tap Save.")); }
                    else drawGrid(grid, rows);
                });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> { if (my == token && !closing) { grid.removeAllViews(); grid.addView(emptyState("Could not load your wishlist. Check your connection.")); } }); }
        });
    }

    private void toggleWishlist(final JSONObject p) {
        io.execute(() -> {
            try {
                JSONObject b = new JSONObject();
                b.put("product_id", p.optString("id", p.optString("product_id")));
                JSONObject r = payload(request("POST", "/api/marketplace/wishlist", b));
                final boolean saved = r.optBoolean("saved", true);
                ui.post(() -> toast(saved ? "Saved to wishlist" : "Removed from wishlist"));
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> toast(t.getMessage() == null ? "Could not update wishlist" : t.getMessage())); }
        });
    }


    // ------------------------------------------------------------------ more menu / seller tools

    private void showMoreMenu() {
        final List<String> L = new ArrayList<>();
        L.add("Sell an item (new listing)"); L.add("My listings (seller)"); L.add("Orders I received (seller)"); L.add("Open full Tools menu");
        if (isAdmin) L.add("Admin: review pending listings");
        final String[] labels = L.toArray(new String[0]);
        new AlertDialog.Builder(this).setTitle("More").setItems(labels, (d, which) -> {
            if (which == 4) { stack.add(new Frame("adminq", null, null, "Pending approval")); render(); return; }
            if (which == 0) { sellImages.clear(); stack.add(new Frame("sell", null, null, "Sell an item")); render(); }
            else if (which == 1) { stack.add(new Frame("mylist", null, null, "My listings")); render(); }
            else if (which == 2) { stack.add(new Frame("sorders", null, null, "Orders received")); render(); }
            else { Intent r = new Intent(); r.putExtra(RES_OPEN_WEB, "menu"); finishWith(r); }
        }).show();
    }

    private void renderMyListings() {
        final LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        body.addView(box);
        box.addView(emptyState("Loading\u2026"));
        final int my = token;
        io.execute(() -> {
            try {
                JSONArray arr = payload(request("/api/marketplace/seller/products?limit=100")).optJSONArray("products");
                ui.post(() -> { if (my == token && !closing) drawMyListings(box, arr); });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> { if (my == token && !closing) { box.removeAllViews(); box.addView(emptyState("Could not load your listings. Check your connection.")); } }); }
        });
    }

    private void drawMyListings(LinearLayout box, JSONArray arr) {
        box.removeAllViews();
        if (arr == null || arr.length() == 0) { box.addView(emptyState("You have no listings yet. Create one from the web Tools menu.")); return; }
        int pending = 0;
        for (int i = 0; i < arr.length(); i++) { JSONObject o = arr.optJSONObject(i); if (o != null && "pending_review".equals(o.optString("status"))) pending++; }
        TextView sum = text(arr.length() + " listings" + (pending > 0 ? "  \u2022  " + pending + " waiting for admin approval" : ""), 13, C_MUTED, false);
        sum.setPadding(dp(14), dp(10), dp(14), dp(10));
        box.addView(sum);
        for (int i = 0; i < arr.length(); i++) {
            final JSONObject p = arr.optJSONObject(i);
            if (p == null) continue;
            final String status = p.optString("status", "");
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setBackgroundColor(Color.WHITE);
            row.setPadding(dp(12), dp(12), dp(12), dp(12));
            ImageView img = new ImageView(this);
            img.setScaleType(ImageView.ScaleType.CENTER_CROP);
            img.setBackgroundColor(C_BG);
            row.addView(img, new LinearLayout.LayoutParams(dp(72), dp(72)));
            String u = firstImage(p);
            if (!u.isEmpty()) loadImage(u, img);
            LinearLayout info = new LinearLayout(this);
            info.setOrientation(LinearLayout.VERTICAL);
            info.setPadding(dp(12), 0, 0, 0);
            TextView t = text(p.optString("title"), 14, C_TEXT, true);
            t.setMaxLines(2);
            info.addView(t);
            info.addView(text(money(price(p)), 13, C_TEXT, false));
            TextView st = text(listingStatus(status), 12, listingColor(status), true);
            st.setPadding(0, dp(2), 0, dp(6));
            info.addView(st);
            String why = p.optString("rejection_reason", "");
            if ("rejected".equals(status) && !why.isEmpty() && !"null".equals(why)) {
                TextView rr = text("Reason: " + why, 12, C_MUTED, false);
                rr.setPadding(0, 0, 0, dp(6));
                info.addView(rr);
            }
            LinearLayout acts = new LinearLayout(this);
            acts.setOrientation(LinearLayout.HORIZONTAL);
            if ("active".equals(status) || "pending_review".equals(status)) acts.addView(smallAction("Archive", v -> confirmListing("Archive this listing?", "It will be hidden from buyers.", "archive", p)));
            if ("inactive".equals(status)) acts.addView(smallAction("Restore", v -> listingAction("restore", p)));
            if ("rejected".equals(status)) acts.addView(smallAction("Resubmit", v -> listingAction("resubmit", p)));
            acts.addView(smallAction("Duplicate", v -> listingAction("duplicate", p)));
            info.addView(acts);
            row.addView(info, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            box.addView(row);
            box.addView(divider());
        }
    }

    private TextView smallAction(String label, View.OnClickListener l) {
        TextView t = text(label, 12, C_ORANGE, true);
        t.setPadding(dp(10), dp(5), dp(10), dp(5));
        t.setBackground(rounded(Color.parseColor("#FFF7ED"), 6));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.rightMargin = dp(8);
        t.setLayoutParams(lp);
        t.setOnClickListener(l);
        return t;
    }

    private void confirmListing(String title, String msg, final String action, final JSONObject p) {
        new AlertDialog.Builder(this).setTitle(title).setMessage(msg).setNegativeButton("Cancel", null)
            .setPositiveButton("Yes", (d, w) -> listingAction(action, p)).show();
    }

    private void listingAction(final String action, final JSONObject p) {
        io.execute(() -> {
            try {
                request("POST", "/api/marketplace/seller/products/" + URLEncoder.encode(p.optString("id"), "UTF-8") + "/" + action, new JSONObject());
                ui.post(() -> {
                    toast(action.equals("archive") ? "Listing archived" : action.equals("restore") ? "Restored. It will be reviewed again before showing to buyers."
                        : action.equals("resubmit") ? "Resubmitted for review" : "Listing duplicated");
                    render();
                });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> toast(t.getMessage() == null ? "Action failed" : t.getMessage())); }
        });
    }

    private String listingStatus(String s) {
        if ("active".equals(s)) return "Live \u2013 approved";
        if ("pending_review".equals(s)) return "Waiting for admin approval";
        if ("rejected".equals(s)) return "Rejected by admin";
        if ("inactive".equals(s)) return "Archived";
        return prettyStatus(s);
    }

    private int listingColor(String s) {
        if ("active".equals(s)) return Color.parseColor("#16A34A");
        if ("rejected".equals(s)) return Color.parseColor("#DC2626");
        if ("inactive".equals(s)) return C_MUTED;
        return C_ORANGE;
    }


    // ------------------------------------------------------------------ sell an item (physical listing)

    private void renderSell() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(Color.WHITE);
        box.setPadding(dp(16), dp(14), dp(16), dp(20));
        body.addView(box);

        TextView note = text("Your item goes live after admin approval. Check its status in My listings.", 12, C_MUTED, false);
        note.setPadding(0, 0, 0, dp(10));
        box.addView(note);

        sTitle = field(box, "Title *", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        sDesc = field(box, "Description", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        sDesc.setMinLines(3);
        sPrice = field(box, "Price (KSh) *", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        sOrig = field(box, "Old price (optional, shows a discount)", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        sStock = field(box, "Quantity in stock *", InputType.TYPE_CLASS_NUMBER);
        sBrand = field(box, "Brand (optional)", InputType.TYPE_CLASS_TEXT);

        box.addView(label("Category *"));
        sCat = new Spinner(this);
        sCatIds = new ArrayList<>();
        List<String> catNames = new ArrayList<>();
        for (int i = 0; i < tree.length(); i++) {
            JSONObject c = tree.optJSONObject(i);
            if (c == null || !groupOf(c.optString("id")).equals("physical")) continue;
            sCatIds.add(c.optString("id"));
            catNames.add(c.optString("name", c.optString("id")));
        }
        sCat.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, catNames));
        box.addView(sCat);

        box.addView(label("Sub-category *"));
        sSub = new Spinner(this);
        box.addView(sSub);
        sCat.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View v, int pos, long id) { fillSubs(pos); }
            @Override public void onNothingSelected(AdapterView<?> parent) {}
        });
        if (!sCatIds.isEmpty()) fillSubs(0);

        box.addView(label("Photos * (up to 5)"));
        sPhotoInfo = text("", 13, C_MUTED, false);
        refreshPhotoInfo();
        box.addView(sPhotoInfo);
        LinearLayout photoRow = new LinearLayout(this);
        photoRow.setOrientation(LinearLayout.HORIZONTAL);
        photoRow.addView(smallAction("Add photos", v -> {
            if (sBusy) return;
            if (sellImages.size() >= 5) { toast("You can add up to 5 photos"); return; }
            pickImages.launch("image/*");
        }));
        photoRow.addView(smallAction("Clear photos", v -> { if (!sBusy) { sellImages.clear(); refreshPhotoInfo(); } }));
        box.addView(photoRow);

        sSubmit = button("Submit for review", C_ORANGE, Color.WHITE, v -> submitListing());
        box.addView(sSubmit);
    }

    private EditText field(LinearLayout box, String hint, int inputType) {
        box.addView(label(hint));
        EditText e = new EditText(this);
        e.setInputType(inputType);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        e.setTextColor(C_TEXT);
        box.addView(e, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return e;
    }

    private TextView label(String t) {
        TextView l = text(t, 12, C_MUTED, true);
        l.setPadding(0, dp(12), 0, dp(2));
        return l;
    }

    private void fillSubs(int catPos) {
        sSubNames = new ArrayList<>();
        if (catPos >= 0 && catPos < sCatIds.size()) {
            JSONObject c = findCat(sCatIds.get(catPos));
            JSONArray secs = c == null ? null : c.optJSONArray("sections");
            if (secs != null) for (int i = 0; i < secs.length(); i++) {
                JSONObject sec = secs.optJSONObject(i);
                JSONArray subs = sec == null ? null : sec.optJSONArray("subs");
                if (subs != null) for (int j = 0; j < subs.length(); j++) {
                    JSONObject sb = subs.optJSONObject(j);
                    if (sb != null && !sb.optString("name").isEmpty()) sSubNames.add(sb.optString("name"));
                }
            }
        }
        if (sSubNames.isEmpty()) sSubNames.add("Other");
        sSub.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, sSubNames));
    }

    private void refreshPhotoInfo() {
        if (sPhotoInfo != null) sPhotoInfo.setText(sellImages.isEmpty() ? "No photos yet" : sellImages.size() + " photo" + (sellImages.size() == 1 ? "" : "s") + " uploaded");
    }

    private void uploadPicked(final List<Uri> uris) {
        if (sBusy) return;
        sBusy = true;
        if (sPhotoInfo != null) sPhotoInfo.setText("Uploading photos\u2026");
        io.execute(() -> {
            String error = null;
            for (Uri u : uris) {
                if (sellImages.size() >= 5) break;
                try {
                    String url = uploadImage(u);
                    synchronized (sellImages) { sellImages.add(url); }
                } catch (SessionExpired se) { ui.post(this::sessionExpired); sBusy = false; return; }
                catch (Throwable t) { error = t.getMessage() == null ? "Photo upload failed" : t.getMessage(); }
            }
            final String err = error;
            ui.post(() -> { sBusy = false; refreshPhotoInfo(); if (err != null) toast(err); });
        });
    }

    /** Downscales (max 1600px, EXIF-rotated) to JPEG and uploads via the same /api/files/upload the web uses. */
    private String uploadImage(Uri uri) throws Exception {
        byte[] jpeg = prepareJpeg(uri);
        String boundary = "----necpra" + System.currentTimeMillis();
        boolean retried = false;
        while (true) {
            String access = NativeBackgroundSync.getDecrypted(authPrefs(), "accessToken");
            if (access == null || access.isEmpty()) access = refresh();
            HttpURLConnection c = null;
            int status;
            String text;
            try {
                c = (HttpURLConnection) new URL(NativeBackgroundSync.backendOrigin(this) + "/api/files/upload").openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(20000);
                c.setReadTimeout(60000);
                c.setDoOutput(true);
                c.setChunkedStreamingMode(0);
                c.setRequestProperty("Accept", "application/json");
                c.setRequestProperty("Authorization", "Bearer " + access);
                c.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                try (OutputStream out = c.getOutputStream()) {
                    String head = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"listing_" + System.currentTimeMillis() + ".jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
                    out.write(head.getBytes(StandardCharsets.UTF_8));
                    out.write(jpeg);
                    out.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
                }
                status = c.getResponseCode();
                text = NativeBackgroundSync.readText(status >= 200 && status < 400 ? c.getInputStream() : c.getErrorStream());
            } finally {
                if (c != null) c.disconnect();
            }
            if (status == 401) {
                if (retried) throw new SessionExpired();
                retried = true;
                refresh();
                continue;
            }
            JSONObject j;
            try { j = new JSONObject(text == null || text.trim().isEmpty() ? "{}" : text); } catch (Exception e) { j = new JSONObject(); }
            if (status < 200 || status >= 300 || !j.optBoolean("success", true)) throw new Exception(j.optString("message", j.optString("error", "Image upload failed (HTTP " + status + ")")));
            JSONObject d = j.optJSONObject("data");
            String url = d != null ? d.optString("url", "") : "";
            if (url.isEmpty()) url = j.optString("url", j.optString("fileUrl", j.optString("mediaUrl", "")));
            if (url.isEmpty()) throw new Exception("Upload finished but the server returned no file URL");
            return url;
        }
    }

    private byte[] prepareJpeg(Uri uri) throws Exception {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(in, null, o); }
        int sample = 1;
        while (o.outWidth / (sample * 2) >= 1600 || o.outHeight / (sample * 2) >= 1600) sample *= 2;
        BitmapFactory.Options o2 = new BitmapFactory.Options();
        o2.inSampleSize = sample;
        Bitmap b;
        try (InputStream in = getContentResolver().openInputStream(uri)) { b = BitmapFactory.decodeStream(in, null, o2); }
        if (b == null) throw new Exception("That file is not a readable image");
        int rot = 0;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            int ori = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (ori == ExifInterface.ORIENTATION_ROTATE_90) rot = 90; else if (ori == ExifInterface.ORIENTATION_ROTATE_180) rot = 180; else if (ori == ExifInterface.ORIENTATION_ROTATE_270) rot = 270;
        } catch (Throwable ignored) {}
        if (rot != 0) { Matrix m = new Matrix(); m.postRotate(rot); b = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true); }
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.JPEG, 85, bo);
        return bo.toByteArray();
    }

    private void submitListing() {
        if (sBusy) return;
        final String title = sTitle.getText().toString().trim();
        final double priceV = parseNum(sPrice.getText().toString());
        final String stockS = sStock.getText().toString().trim();
        if (title.length() < 3) { toast("Enter a title (at least 3 characters)"); return; }
        if (priceV <= 0) { toast("Enter a price"); return; }
        if (stockS.isEmpty() || parseNum(stockS) < 1) { toast("Enter the quantity in stock"); return; }
        if (sCatIds.isEmpty() || sCat.getSelectedItemPosition() < 0) { toast("Choose a category"); return; }
        if (sellImages.isEmpty()) { toast("Add at least one photo"); return; }
        final String cat = sCatIds.get(sCat.getSelectedItemPosition());
        final String sub = sSubNames.isEmpty() ? "" : String.valueOf(sSub.getSelectedItem());
        final double orig = parseNum(sOrig.getText().toString());
        final String desc = sDesc.getText().toString().trim();
        final String brand = sBrand.getText().toString().trim();
        final int stock = (int) parseNum(stockS);
        final List<String> imgs;
        synchronized (sellImages) { imgs = new ArrayList<>(sellImages); }
        sBusy = true;
        sSubmit.setText("Submitting\u2026");
        io.execute(() -> {
            try {
                JSONObject b = new JSONObject();
                b.put("title", title);
                b.put("description", desc);
                b.put("price", priceV);
                if (orig > priceV) b.put("original_price", orig);
                b.put("category", cat);
                b.put("subcategory", sub);
                b.put("brand", brand);
                b.put("stock_quantity", stock);
                b.put("images", new JSONArray(imgs));
                b.put("type", "physical");
                b.put("condition", "new");
                b.put("available", false);
                b.put("status", "pending_review");
                b.put("approval_status", "pending");
                b.put("metadata", new JSONObject());
                request("POST", "/api/marketplace/products", b);
                ui.post(() -> {
                    sBusy = false;
                    sellImages.clear();
                    toast("Submitted for review. It goes live after admin approval.");
                    stack.clear();
                    stack.add(new Frame("home", null, null, "Home"));
                    stack.add(new Frame("mylist", null, null, "My listings"));
                    render();
                });
            } catch (SessionExpired se) { ui.post(() -> { sBusy = false; sessionExpired(); }); }
            catch (Throwable t) { ui.post(() -> { sBusy = false; if (sSubmit != null) sSubmit.setText("Submit for review"); toast(t.getMessage() == null ? "Could not submit listing" : t.getMessage()); }); }
        });
    }

    private double parseNum(String s) {
        try { return Double.parseDouble(s.replace(",", "").trim()); } catch (Exception e) { return 0; }
    }


    // ------------------------------------------------------------------ admin: approve / reject listings

    /** The admin menu entry only appears for admins: the pending-listings endpoint answers 403 to everyone else. */
    private void probeAdmin() {
        io.execute(() -> {
            try {
                request("/api/marketplace/admin/products/pending?limit=1");
                isAdmin = true;
            } catch (Throwable ignored) { isAdmin = false; }
        });
    }

    private void renderAdminQueue() {
        final LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        body.addView(box);
        box.addView(emptyState("Loading\u2026"));
        final int my = token;
        io.execute(() -> {
            try {
                JSONArray arr = payload(request("/api/marketplace/admin/products/pending?limit=50")).optJSONArray("products");
                ui.post(() -> { if (my == token && !closing) drawAdminQueue(box, arr); });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> { if (my == token && !closing) { box.removeAllViews(); box.addView(emptyState(t.getMessage() == null ? "Could not load pending listings." : t.getMessage())); } }); }
        });
    }

    private void drawAdminQueue(LinearLayout box, JSONArray arr) {
        box.removeAllViews();
        if (arr == null || arr.length() == 0) { box.addView(emptyState("Nothing is waiting for approval")); return; }
        TextView sum = text(arr.length() + " waiting for approval (oldest first)", 13, C_MUTED, false);
        sum.setPadding(dp(14), dp(10), dp(14), dp(10));
        box.addView(sum);
        for (int i = 0; i < arr.length(); i++) {
            final JSONObject p = arr.optJSONObject(i);
            if (p == null) continue;
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.VERTICAL);
            row.setBackgroundColor(Color.WHITE);
            row.setPadding(dp(14), dp(12), dp(14), dp(12));

            LinearLayout top = new LinearLayout(this);
            top.setOrientation(LinearLayout.HORIZONTAL);
            ImageView img = new ImageView(this);
            img.setScaleType(ImageView.ScaleType.CENTER_CROP);
            img.setBackgroundColor(C_BG);
            top.addView(img, new LinearLayout.LayoutParams(dp(84), dp(84)));
            String u = firstImage(p);
            if (!u.isEmpty()) loadImage(u, img);
            LinearLayout info = new LinearLayout(this);
            info.setOrientation(LinearLayout.VERTICAL);
            info.setPadding(dp(12), 0, 0, 0);
            TextView t = text(p.optString("title"), 14, C_TEXT, true);
            t.setMaxLines(2);
            info.addView(t);
            info.addView(text(money(price(p)), 13, C_TEXT, false));
            JSONObject sel = p.optJSONObject("seller");
            String seller = sel == null ? "" : sel.optString("name", sel.optString("username", ""));
            String cat = p.optString("category", "");
            String sub = p.optString("subcategory", "");
            if (sub.isEmpty() || "null".equals(sub)) { JSONObject m = p.optJSONObject("metadata"); if (m != null) sub = m.optString("subcategory", ""); }
            info.addView(text((seller.isEmpty() ? "" : "By " + seller + "  \u2022  ") + p.optString("type", "") + " / " + cat + (sub.isEmpty() || "null".equals(sub) ? "" : " / " + sub), 12, C_MUTED, false));
            top.addView(info, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            row.addView(top);

            String desc = p.optString("description", "");
            if (!desc.isEmpty() && !"null".equals(desc)) {
                TextView d = text(desc, 13, C_TEXT, false);
                d.setMaxLines(4);
                d.setEllipsize(android.text.TextUtils.TruncateAt.END);
                d.setPadding(0, dp(8), 0, 0);
                row.addView(d);
            }
            LinearLayout acts = new LinearLayout(this);
            acts.setOrientation(LinearLayout.HORIZONTAL);
            acts.setPadding(0, dp(10), 0, 0);
            TextView ok = button("Approve", C_ORANGE, Color.WHITE, v -> adminDecide(p, true, null));
            TextView no = button("Reject", Color.WHITE, Color.parseColor("#DC2626"), v -> askRejectReason(p));
            LinearLayout.LayoutParams l1 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            l1.rightMargin = dp(8); l1.topMargin = 0;
            LinearLayout.LayoutParams l2 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            l2.topMargin = 0;
            ok.setLayoutParams(l1);
            no.setLayoutParams(l2);
            acts.addView(ok);
            acts.addView(no);
            row.addView(acts);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.bottomMargin = dp(8);
            box.addView(row, lp);
        }
    }

    private void askRejectReason(final JSONObject p) {
        final EditText in = new EditText(this);
        in.setHint("Reason shown to the seller");
        in.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        new AlertDialog.Builder(this).setTitle("Reject listing").setView(in).setNegativeButton("Cancel", null)
            .setPositiveButton("Reject", (d, w) -> adminDecide(p, false, in.getText().toString().trim())).show();
    }

    private void adminDecide(final JSONObject p, final boolean approve, final String reason) {
        io.execute(() -> {
            try {
                String path = "/api/marketplace/admin/products/" + URLEncoder.encode(p.optString("id"), "UTF-8") + (approve ? "/approve" : "/reject");
                JSONObject b = new JSONObject();
                if (!approve && reason != null && !reason.isEmpty()) b.put("reason", reason);
                request("POST", path, b);
                ui.post(() -> { toast(approve ? "Approved. It is now live for buyers." : "Rejected"); render(); });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> toast(t.getMessage() == null ? "Could not update listing" : t.getMessage())); }
        });
    }

    // ------------------------------------------------------------------ seller orders

    private void renderSellerOrders() {
        final LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        body.addView(box);
        box.addView(emptyState("Loading\u2026"));
        final int my = token;
        io.execute(() -> {
            try {
                JSONArray orders = payload(request("/api/marketplace/seller/orders?limit=50")).optJSONArray("orders");
                ui.post(() -> {
                    if (my != token || closing) return;
                    drawOrders(box, orders);
                    // reuse the buyer list, but rows must open the seller detail
                    for (int i = 0; i < box.getChildCount(); i++) {
                        final View row = box.getChildAt(i);
                        final int idx = i;
                        if (orders != null && idx < orders.length()) {
                            final JSONObject o = orders.optJSONObject(idx);
                            row.setOnClickListener(v -> { Frame f = new Frame("sorder", null, null, "Order #" + shortId(o.optString("id"))); f.product = o; stack.add(f); render(); });
                        }
                    }
                });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> { if (my == token && !closing) { box.removeAllViews(); box.addView(emptyState("Could not load orders. Check your connection.")); } }); }
        });
    }

    private void renderSellerOrder(Frame f) {
        final JSONObject o = f.product;
        renderOrderBody(o);
        final String status = o.optString("status");
        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.VERTICAL);
        actions.setPadding(dp(16), dp(8), dp(16), dp(24));
        body.addView(actions);
        long buyer = o.optLong("buyer_id", 0);
        if (buyer > 0) actions.addView(button("Chat with buyer", Color.WHITE, C_ORANGE, v -> {
            Intent r = new Intent();
            r.putExtra(RES_CHAT_USER_ID, o.optLong("buyer_id", 0));
            r.putExtra(RES_CHAT_USER_NAME, "Buyer");
            finishWith(r);
        }));
        if (status.equals("paid") || status.equals("pending")) actions.addView(button("Mark as processing", C_ORANGE, Color.WHITE, v -> setOrderStatus(o, "processing")));
        if (status.equals("paid") || status.equals("pending") || status.equals("processing")) actions.addView(button("Mark as shipped", C_ORANGE, Color.WHITE, v -> askTracking(o)));
        if (status.equals("shipped")) actions.addView(button("Mark as delivered", C_ORANGE, Color.WHITE, v -> setOrderStatus(o, "delivered")));
    }

    private void askTracking(final JSONObject o) {
        final EditText in = new EditText(this);
        in.setHint("Tracking number (optional)");
        in.setSingleLine(true);
        new AlertDialog.Builder(this).setTitle("Mark as shipped").setView(in).setNegativeButton("Cancel", null)
            .setPositiveButton("Ship", (d, w) -> shipOrder(o, in.getText().toString().trim())).show();
    }

    private void shipOrder(final JSONObject o, final String tracking) {
        io.execute(() -> {
            try {
                JSONObject b = new JSONObject();
                b.put("status", "shipped");
                if (!tracking.isEmpty()) b.put("tracking_number", tracking);
                request("PUT", "/api/marketplace/seller/orders/" + URLEncoder.encode(o.optString("id"), "UTF-8") + "/shipping", b);
                ui.post(() -> { toast("Marked as shipped"); backToSellerOrders(); });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> toast(t.getMessage() == null ? "Could not update order" : t.getMessage())); }
        });
    }

    private void setOrderStatus(final JSONObject o, final String status) {
        io.execute(() -> {
            try {
                JSONObject b = new JSONObject();
                b.put("status", status);
                request("PATCH", "/api/marketplace/orders/" + URLEncoder.encode(o.optString("id"), "UTF-8") + "/status", b);
                ui.post(() -> { toast("Order updated"); backToSellerOrders(); });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> toast(t.getMessage() == null ? "Could not update order" : t.getMessage())); }
        });
    }

    private void backToSellerOrders() {
        while (stack.size() > 1 && !stack.get(stack.size() - 1).type.equals("sorders")) stack.remove(stack.size() - 1);
        render();
    }

    // ------------------------------------------------------------------ orders

    private void renderOrders() {
        final LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        body.addView(box);
        box.addView(emptyState("Loading\u2026"));
        final int my = token;
        io.execute(() -> {
            try {
                JSONArray orders = payload(request("/api/marketplace/orders?limit=50")).optJSONArray("orders");
                ui.post(() -> { if (my == token && !closing) drawOrders(box, orders); });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> { if (my == token && !closing) { box.removeAllViews(); box.addView(emptyState("Could not load your orders. Check your connection.")); } }); }
        });
    }

    private void drawOrders(LinearLayout box, JSONArray orders) {
        box.removeAllViews();
        if (orders == null || orders.length() == 0) { box.addView(emptyState("You have no orders yet")); return; }
        for (int i = 0; i < orders.length(); i++) {
            final JSONObject o = orders.optJSONObject(i);
            if (o == null) continue;
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.VERTICAL);
            row.setBackgroundColor(Color.WHITE);
            row.setPadding(dp(16), dp(12), dp(16), dp(12));
            row.addView(text(orderTitle(o), 14, C_TEXT, true));
            row.addView(text(money(o.optDouble("total_price", 0)) + "  \u2022  " + shortDate(o.optString("created_at")), 12, C_MUTED, false));
            TextView st = text(prettyStatus(o.optString("status")), 12, statusColor(o.optString("status")), true);
            st.setPadding(0, dp(4), 0, 0);
            row.addView(st);
            row.setOnClickListener(v -> { Frame f = new Frame("order", null, null, "Order #" + shortId(o.optString("id"))); f.product = o; stack.add(f); render(); });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.bottomMargin = dp(1);
            box.addView(row, lp);
        }
    }

    private void renderOrder(Frame f) {
        final JSONObject o = f.product;
        renderOrderBody(o);
        renderBuyerOrderActions(o);
    }

    private void renderOrderBody(final JSONObject o) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(Color.WHITE);
        box.setPadding(dp(16), dp(14), dp(16), dp(16));
        body.addView(box);
        box.addView(text(orderTitle(o), 17, C_TEXT, true));
        TextView st = text(prettyStatus(o.optString("status")), 14, statusColor(o.optString("status")), true);
        st.setPadding(0, dp(6), 0, dp(10));
        box.addView(st);
        box.addView(text("Total: " + money(o.optDouble("total_price", 0)), 15, C_TEXT, true));
        box.addView(text("Placed: " + shortDate(o.optString("created_at")), 13, C_MUTED, false));
        String pay = o.optString("payment_method", "");
        if (!pay.isEmpty() && !"null".equals(pay)) box.addView(text("Payment: " + pay, 13, C_MUTED, false));
        String trk = o.optString("tracking_number", "");
        if (!trk.isEmpty() && !"null".equals(trk)) box.addView(text("Tracking number: " + trk, 13, C_MUTED, false));
        JSONObject addr = o.optJSONObject("delivery_address");
        if (addr != null && addr.length() > 0) {
            StringBuilder a = new StringBuilder();
            for (String k : new String[]{"name", "phone", "address", "street", "city", "county"}) {
                String v = addr.optString(k, "");
                if (!v.isEmpty() && !"null".equals(v)) { if (a.length() > 0) a.append(", "); a.append(v); }
            }
            if (a.length() > 0) box.addView(text("Deliver to: " + a, 13, C_MUTED, false));
        }
        JSONArray items = o.optJSONArray("items");
        if (items != null && items.length() > 0) {
            TextView h = text("Items", 14, C_TEXT, true);
            h.setPadding(0, dp(14), 0, dp(4));
            box.addView(h);
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.optJSONObject(i);
                if (it == null) continue;
                box.addView(text(it.optInt("quantity", 1) + " \u00D7 " + it.optString("title", it.optString("name", "Item")), 13, C_TEXT, false));
            }
        }
    }

    private void renderBuyerOrderActions(final JSONObject o) {
        final String status = o.optString("status");
        long seller = o.optLong("seller_id", 0);
        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.VERTICAL);
        actions.setPadding(dp(16), dp(8), dp(16), dp(24));
        body.addView(actions);
        if (seller > 0) actions.addView(button("Chat with seller", Color.WHITE, C_ORANGE, v -> {
            Intent r = new Intent();
            r.putExtra(RES_CHAT_USER_ID, o.optLong("seller_id", 0));
            r.putExtra(RES_CHAT_USER_NAME, "Seller");
            finishWith(r);
        }));
        if (!status.equals("delivered") && !status.equals("refunded") && !status.equals("cancelled")) {
            actions.addView(button("Cancel order", Color.WHITE, Color.parseColor("#DC2626"), v ->
                new AlertDialog.Builder(this).setTitle("Cancel this order?").setMessage("This cannot be undone.")
                    .setNegativeButton("Keep order", null)
                    .setPositiveButton("Cancel order", (d, w) -> cancelOrder(o)).show()));
        }
    }

    private void cancelOrder(final JSONObject o) {
        io.execute(() -> {
            try {
                JSONObject b = new JSONObject();
                b.put("reason", "Cancelled by buyer in app");
                request("POST", "/api/marketplace/orders/" + URLEncoder.encode(o.optString("id"), "UTF-8") + "/cancel", b);
                ui.post(() -> { toast("Order cancelled"); stack.clear(); stack.add(new Frame("orders", null, null, "My orders")); render(); });
            } catch (SessionExpired se) { ui.post(this::sessionExpired); }
            catch (Throwable t) { ui.post(() -> toast(t.getMessage() == null ? "Could not cancel order" : t.getMessage())); }
        });
    }

    private String orderTitle(JSONObject o) {
        JSONObject pr = o.optJSONObject("product");
        String t = pr == null ? "" : pr.optString("title", "");
        if (t.isEmpty() || "null".equals(t)) {
            JSONArray it = o.optJSONArray("items");
            if (it != null && it.length() > 0 && it.optJSONObject(0) != null) t = it.optJSONObject(0).optString("title", "");
            if (it != null && it.length() > 1) t += " +" + (it.length() - 1) + " more";
        }
        return t.isEmpty() ? "Order #" + shortId(o.optString("id")) : t;
    }

    private String shortId(String id) { return id == null ? "" : (id.length() > 8 ? id.substring(0, 8).toUpperCase(Locale.ROOT) : id); }

    private String shortDate(String iso) { return iso == null || iso.length() < 10 ? "" : iso.substring(0, 10); }

    private String prettyStatus(String s) {
        if (s == null || s.isEmpty()) return "Pending";
        String x = s.replace('_', ' ');
        return Character.toUpperCase(x.charAt(0)) + x.substring(1);
    }

    private int statusColor(String s) {
        if ("delivered".equals(s)) return Color.parseColor("#16A34A");
        if ("cancelled".equals(s) || "refunded".equals(s) || "failed".equals(s)) return Color.parseColor("#DC2626");
        return C_ORANGE;
    }

    // ------------------------------------------------------------------ images

    private void loadImage(final String url, final ImageView view) {
        if (url == null || url.isEmpty()) return;
        view.setTag(url);
        Bitmap hit = MEM.get(url);
        if (hit != null) { view.setImageBitmap(hit); return; }
        io.execute(() -> {
            Bitmap b = download(url);
            if (b == null) return;
            MEM.put(url, b);
            ui.post(() -> { if (url.equals(view.getTag())) view.setImageBitmap(b); });
        });
    }

    private Bitmap download(String url) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            byte[] bytes;
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n, total = 0;
                while ((n = in.read(buf)) >= 0) { total += n; if (total > 6 * 1024 * 1024) return null; bo.write(buf, 0, n); }
                bytes = bo.toByteArray();
            }
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
            int sample = 1;
            while (o.outWidth / (sample * 2) >= 600 && o.outHeight / (sample * 2) >= 600) sample *= 2;
            o = new BitmapFactory.Options();
            o.inSampleSize = sample;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
        } catch (Throwable t) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // ------------------------------------------------------------------ small view helpers

    private int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private GradientDrawable rounded(int color, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    private GradientDrawable underline(boolean on) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(on ? Color.parseColor("#FFF7ED") : Color.WHITE);
        return g;
    }

    private View divider() {
        View v = new View(this);
        v.setBackgroundColor(C_LINE);
        v.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));
        return v;
    }

    private View emptyState(String msg) {
        TextView t = text(msg, 14, C_MUTED, false);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(24), dp(56), dp(24), dp(56));
        return t;
    }

    private TextView button(String label, int bg, int fg, View.OnClickListener l) {
        TextView b = text(label, 15, fg, true);
        b.setGravity(Gravity.CENTER);
        GradientDrawable g = rounded(bg, 8);
        g.setStroke(dp(1), C_ORANGE);
        b.setBackground(g);
        b.setPadding(dp(12), dp(14), dp(12), dp(14));
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    private void toast(String m) { Toast.makeText(this, m, Toast.LENGTH_SHORT).show(); }
}
