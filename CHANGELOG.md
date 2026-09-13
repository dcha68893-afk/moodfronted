# MoodFronted — Fix Changelog

This zip contains ONLY the files that changed. Copy each file over the
matching path in your existing project (same relative paths as your repo).

## 1. Branding: "Nexopa" → "Necpa"

- Replaced every case variant (NEXOPA/Nexopa/nexopa → NECPA/Necpa/necpa)
  across all text files in the repo (HTML, JS, CSS, manifest, README, email
  templates, etc.) — ~90 files touched, all included here.
- Renamed the Android package `com.nexopa` → `com.necpa`:
  - Moved `android/app/src/main/java/com/nexopa/MainActivity.java` →
    `android/app/src/main/java/com/necpa/MainActivity.java`
  - Updated `package com.necpa;` declaration, `build.gradle` namespace +
    applicationId, and `capacitor.config.json` appId to match.
- Fixed the app icon files: `manifest.json`/`service-worker.js` already
  pointed at `necpa-192.png` / `necpa-512.png`, but those files on disk
  were a mismatched placeholder icon (misspelled "NECPRA"). Renamed the
  real icon artwork (the actual app icon) to the correct filenames and
  removed the old placeholders. Files: `necpa-192.png`, `necpa-512.png`,
  `icons/necpa-192.png`, `icons/necpa-512.png`.

**Note:** hostnames like `noxopa.onrender.com` / `nexipa.onrender.com`
found throughout the code are your actual deployed backend/frontend
server names — unrelated to the "Nexopa" in-app brand text — so those
were intentionally left untouched.

## 2. Admin approval not working after login

The ADMIN_EMAIL/ADMIN_USERNAME → role='admin' promotion logic itself was
already correct in your backend (fixed previously). The remaining bug was
on the frontend: two places read `/api/profile`'s response in the wrong
shape.

- `chat.html` — `_fetchAndCacheUserRole()` read `profile.role` /
  `profile.user.role` directly off the top-level JSON, but the endpoint
  actually returns `{ success, message, data: { profile } }`. This
  silently defaulted every user (including real admins) to role `'user'`
  whenever this hydration path ran. Fixed to unwrap `data.profile`.
- `Tool-core.part3.js` — `fetchUserDataDirectly()` had the same bug
  (`response.user` instead of `response.data.profile`), which made
  Tools.html's direct-API fallback for loading the current user always
  throw and silently give up. Fixed the same way.

Both fixes flow into `window.currentUser.role`, which is exactly what
`marketplace-admin.js`'s `_isAdmin()` check reads — so the seller-listing
approval panel should now correctly appear for an admin account.

**If it's still not showing after this fix:** double check your deployed
`.env` actually has `ADMIN_EMAIL`/`ADMIN_USERNAME` set to match the
account you're logging in with, and that the backend has been redeployed
with the latest code.

## 3. Status module — live updates and uploads

`status.html` never loaded 6 "status-core" files that used to be patched
repeatedly (`status-core.part1/2/3.js`, `status-core-state.js`,
`status-core-runtime.js`, `status-core-transport.js`). On inspection,
these turned out to be misnamed duplicates of the **Settings** module's
internals, not status code at all — so no patch to them could ever have
worked. They're dead code; you can delete them from your project (not
included in this zip, since nothing references them).

The real gap: `js/status-websocket.js`'s real-time handlers
(`_handleStatusCreated`, `_handleStatusUpdated`, `_handleStatusDeleted`,
`_handleStatusExpired`) call `window.addStatus`, `window.removeStatus`,
and `window.updateStatusInUI` — comments there say these come from
"status-core.js", but that file never existed. So a new status, an edit,
or a deletion pushed live over the socket had no way to reach the
Recent/Viewed lists — only a manual refresh (which re-fetches everything
from scratch) ever showed them.

- `status-ui.js` — implemented `window.addStatus`, `window.removeStatus`,
  and `window.updateStatusInUI`, wired to the existing
  `friendsStatuses`/`myStatuses` arrays and `renderStatusListInstantlyUI()`
  render pipeline already used everywhere else in the file.

The media/attachment upload path (`createStatusWithFile` in
`js/status-api.js`, matched by `statusUpload.single('media')` on the
backend) was already correctly wired front-to-back — no code bug found
there. If uploads still fail on your server, check that Cloudinary is
configured (or `./uploads` is writable) and check server logs for the
actual multer/upload error.

## 4. Groups — member count, message routing, encryption

- **Member count showing 0:** the backend (`groupService.js`) was already
  correctly computing and returning the real member count (including the
  creator as owner) everywhere. The bug was in the frontend fallback path:
  `GroupCore.createGroup()` in `group-core-bootstrap.js` read
  `response.data` directly as the new group object, but the backend
  actually wraps it as `{ data: { group: {...}, _localSync: {...} } }`.
  This fallback path (used whenever the faster direct-fetch path in
  `createGroupAsync` fails — e.g. a Render.com cold start) pushed an
  object with no `id`/`memberCount`/`createdBy` into local storage,
  which rendered as "0 members" no matter how many people were actually
  in the group. Fixed to unwrap `response.data.group`.

- **Creator's own message comes back encrypted:** `groupEncryption.client.js`'s
  secure send-boundary wrapper pushed the server's echoed response for a
  just-sent message straight into the UI — but that echo's `.content` is
  still ciphertext (that's what's stored). This HTTP-response path never
  ran the message through `decryptIncoming()`, unlike the socket-receive
  path (which already has an earlier, correct self-decrypt fix). Fixed by
  using the plaintext the sender already has in memory instead of asking
  the server, and marking the message as pre-decrypted so nothing
  downstream overwrites it.

- **Other members failing to send/read, "searching for sender keys":**
  the Sender Key distribution/rotation code
  (`js/groupEncryption.client.legacy.js`, `src/routes/groupEncryption.js`,
  the `GroupSenderKeyDistribution`/`GroupSenderKeyGeneration` models and
  their migrations) is already extensively hardened in this codebase —
  including a fix for a genuine race condition in key-generation
  numbering. I could not find a further concrete bug in this path through
  static review. If this is still failing for you, it's most likely
  either (a) the fixes already in this code haven't been redeployed yet,
  or (b) an account created before E2E was enabled has no registered
  public key to wrap a sender key for — check your server logs for
  `[GroupE2E] Could not wrap sender key for recipient ...` to confirm.

- **Database tables/columns:** `Groups`, `GroupMembers`,
  `GroupSenderKeyDistribution`, `GroupSenderKeyGeneration` all have
  migrations. There are two duplicate/typo'd migration filenames
  (`2026118080600creategroup.js` and `2026118080700creategroupmembers.js` —
  missing a digit vs. the correctly-named `20260118...` versions), but
  they already contain a guard that skips them safely if the table
  already exists, so they will not break your migration batch. No further
  action needed there.

## Files in this zip

Every file below was changed for one of the fixes above (mostly #1's
branding rename; the ones under "Files with functional changes" are the
real logic fixes for #2–#4):

Files with functional changes:
- chat.html
- Tool-core.part3.js
- status-ui.js
- js/groupEncryption.client.js
- group-core-bootstrap.js

Everything else in this zip is the branding text/asset rename from #1.
