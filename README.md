# Account-switch button — where it is, and the fix

## Where the button already lives
It's implemented, but only inside **Settings**, not on the login screen:

1. Open the app → Settings (gear icon).
2. Scroll to the **bottom of the Settings menu list** (below Danger Zone / after all the normal sections).
3. There's a row: **"Switch account"** with a badge like `1/2` or `2/2`.
4. Tapping it opens an "Accounts" popup listing every account that has ever
   logged in on that browser/device (max 2), with "Current" / "Switch" labels.

This is injected dynamically by `js/settings-ui.local-first.patch.js` into the
`#settingsMenu` element in `settings.html` — it's real code, not a stub.

**Why it can look "missing":** the badge starts at `0/2` and the modal says
"No saved accounts yet" until you've actually logged into a *second* distinct
account on that same device (without clearing site data in between). Log into
account A, log out, log into account B — now both show up and the switcher
has something to switch between.

## The real bug I found and fixed
Kynecta already has a data-isolation mechanism: whenever a *login* detects a
different user than the one previously stored, `authStorage.js`'s `saveAuth()`
wipes localStorage/sessionStorage/IndexedDB and fires a `kyn:accountSwitchWipe`
event so `FriendCacheManager`, `ChatManager`, and `Identity` clear their
in-memory caches (this was the original "account data leaking between users"
fix from earlier sessions).

`switchAccount()` — the function the new Settings "Switch account" button
actually calls — **never went through that wipe**. It just wrote the target
account's token straight into localStorage and reloaded. That means using
the quick-switch button (as opposed to a full logout+login) could leave the
outgoing account's chat/friend caches sitting around for the next account to
see — the exact bug the wipe was built to prevent, just reopened on this one
path.

### Fix (`moodfronted/js/authStorage.js`)
`switchAccount()` now:
- Refuses with a clear error if you try to "switch" to the account that's
  already active (defensive — the UI already disables that row).
- Calls the same `wipePreviousAccountData()` used by `saveAuth()` before
  writing the new account's session, so the outgoing account's local caches
  are cleared and `kyn:accountSwitchWipe` fires exactly as it does for a
  normal login-based account change.

Only `js/authStorage.js` changed — no HTML/CSS/other JS needed touching.

## How to apply
Copy `moodfronted/js/authStorage.js` from this zip over your existing file
(same path), then deploy as usual. Nothing else to change.
