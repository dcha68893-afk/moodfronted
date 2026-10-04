package com.necpa;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Single answer to "who owns direct-message crypto on this device right now?".
 *
 * The WebView and the native layer each keep their OWN Double Ratchet state for a chat, and a ratchet
 * message key is single-use, so only one of them may ever decrypt or encrypt a DM. Native is the owner
 * when the web layer has switched native messaging on (setDmOwner) AND the identity key has been handed
 * to native storage (provisioned). Everything native that touches a DM (push preview, notification reply,
 * chat screen, status replies) asks here; the web mirrors the same decision in
 * localStorage['necpra_native_dm_owner'] so js/message-e2e-core.js can refuse to touch DMs.
 */
final class NecpraDmOwner {
    private static final String PREFS = "necpra_dm_owner";
    private NecpraDmOwner() {}

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void set(Context c, boolean on) { p(c).edit().putBoolean("enabled", on).commit(); }

    static boolean enabled(Context c) { return p(c).getBoolean("enabled", false); }

    static boolean isOwner(Context c) {
        try { return enabled(c) && NecpraE2EStore.provisionedUser(c) != null; }
        catch (Throwable t) { return false; }
    }

    static void clear(Context c) { p(c).edit().clear().commit(); }
}
