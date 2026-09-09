# E2E encryption redesign — what's in this zip

## Folder layout
Copy `moodfronted/` and `moodchat/` straight over your existing repos, then
see `DELETE_THESE_FILES.txt` for two files to remove afterward.

```
moodfronted/
  chat.html               script tag order updated
  group.html                "
  message.html              "
  service-worker.js       cache list cleaned up (see below)
  js/
    e2e-store-v2.js        NEW — IndexedDB store + encrypted backup/restore
    e2e-session-init.js    durable storage, own-echo fix, multi-device
    e2e-encryption.js      retry cap, deviceId tagging
    message-client.js      real "unable to decrypt" state
    double-ratchet.js      dead encrypt patch removed, decrypt fallback kept
moodchat/
  src/routes/encryption.js  multi-device tables + endpoints
DELETE_THESE_FILES.txt      two confirmed-dead files to rm
```

## This round: removing duplicate/conflicting old code

Went looking for exactly the risk you flagged — old implementations still
sitting around that could silently conflict with the new one. Found two
categories:

1. **Genuinely dead files (safe to delete outright):**
   - `js/e2e-ratchet.js` — an even-older ratchet attempt, already
     self-documented in its own header as never wired into any page.
     Zero `<script>` tags reference it anywhere in either repo.
   - `src/services/encryptionService.js` — the original static-key (no
     forward secrecy) backend. Nothing `require()`s it anywhere — not a
     route, not a controller, not the app entrypoint.
   
   See `DELETE_THESE_FILES.txt` for the exact remove commands.

2. **A live conflict that needed surgery, not deletion:**
   `js/double-ratchet.js` (an earlier "Phase 3" ratchet, envelope `v:2`)
   was *still* monkey-patching `KynectaE2E.encryptForChat` on both
   `message.html` and `group.html` — the exact same hook
   `e2e-session-init.js`'s X3DH implementation patches, loaded right after
   it. Because `e2e-session-init.js` loads second and never calls back
   into what it wrapped, double-ratchet's encrypt patch has been dead
   code for a while now — every message has actually been going out as
   X3DH (`v:3/4/5`) regardless. But it wasn't *provably* dead without
   checking, and leaving two implementations racing to patch the same
   function only worked "by accident of load order" — reorder those
   `<script>` tags in a future change and you'd get silent, hard-to-diagnose
   regressions.

   Fix: removed the `encryptForChat` patch entirely from
   `double-ratchet.js`. Its `decryptFromChat` patch is **kept** — it's the
   only remaining path that can still read a `v:2` envelope already sitting
   in message history from before X3DH existed. Now there is exactly one
   place a new message's envelope can ever come from.

`service-worker.js` had its cache-pattern entry for the now-deleted
`e2e-ratchet.js` removed, and its cache version bumped (matches the
convention already established in that file's own comments — must bump on
any JS change or an installed PWA can keep serving stale code).

## What each earlier fix addressed (Phases 1 & 2, for reference)

1. **Infinite "Decrypting…" placeholder** — retry queue held forever
   instead of ever giving up; now caps at ~40 attempts and shows a real
   failure state.
2. **Own sent messages permanently failing to decrypt on reload** — was
   decrypting via the wrong ratchet chain; now cached locally instead.
3. **Storage durability + backup/restore** — `localStorage` → IndexedDB,
   overwrites archived instead of discarded, password-protected encrypted
   export/import added.
4. **Multi-device** — each device gets its own identity/prekey bundle and
   ratchet session per peer device; sending fans out to every registered
   device (`v:5` envelope). Old `v:3/4` messages still decrypt fine.

## Rollout notes

- Client files are safe to deploy as-is; they migrate existing sessions
  automatically and fall back gracefully if IndexedDB is unavailable.
- The backend migration in `encryption.js` runs itself on first request,
  same pattern the file already used — no manual migrate step, and it only
  adds columns/tables, never touches or deletes existing rows.
- **Test with two real accounts/devices before wide rollout** — I've
  implemented and syntax-checked all of this against your actual code, but
  I don't have a way to run your live server/DB or two real browser
  sessions from here. Please verify a real send/receive round-trip
  (single-device AND multi-device) in staging first.
- Still open: a "Backup & Restore" settings-page button to call the
  `downloadBackup`/`importBackup` API that already exists — say the word if
  you want that wired up next.
