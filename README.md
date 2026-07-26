# Nexopa — Fix Package (2026-07-24)

This zip contains ONLY the files that were changed, in the same folder
structure as your two repos, so you can drop them straight over the
matching files in `moodfronted` and `nexopa`.

```
moodfronted/
  authStorage.js
  js/authStorage.js
  calls-core.part2.js
  calls-core.part3.js
  calls-core.part4.js
  calls-core.part5.js
  calls-core.part6.js
  calls-core.part7.js
  calls-core.part8.js
nexopa/
  src/utils/ensureSchema.js
```

---

## 1. Device accepted a second account / data from another account leaked in

**Root cause:** `AuthStorage.saveAuth()` — the one function both Google
sign-in and manual login call to store the token — never checked whether
a *different* person was signing in on the same device. The only code
that ever cleared cached data ran on explicit logout, and even then it
missed most of the real caches (IndexedDB stores for messages, groups,
calls, status, etc.). So switching accounts (which Google's own account
picker lets you do without logging out first) left the previous
account's cached data sitting in local storage/IndexedDB, and it bled
into the new account's screens.

**Fix (`authStorage.js`, `js/authStorage.js`):** `saveAuth()` now compares
the incoming user's ID against whichever account is currently stored. If
they differ, it wipes local storage, session storage, and every known
IndexedDB database *before* writing the new account's token/user — so
each sign-in on a device starts from a clean slate. Same-account
re-logins (token refresh, etc.) are untouched.

## 2. "Internal server error" creating a group

**Root cause:** yesterday's migrations (`20260723000001` /
`20260723000002`) added `Groups.location`, `GroupMembers.isFavorite`,
`GroupMembers.isBlocked`, and a `GroupReports` table — but the server's
self-healing schema fallback (`ensureSchema.js`, which auto-adds any
column the migration step misses on boot) was never updated to include
them. `groupService.createGroup()` always writes a `location` value on
every group it creates, so if the migration step doesn't run cleanly on
a given boot (server.js already tolerates that and keeps starting
either way), every single "create group" request throws a Postgres
"column does not exist" error — which the client just sees as a plain
500.

**Fix (`src/utils/ensureSchema.js`):** added the missing
`Groups.location`, `GroupMembers.isFavorite`, `GroupMembers.isBlocked`
columns and the `GroupReports` table to the fallback list, so they get
created automatically on boot even if the migration step fails.

## 3. Call screen opens but never actually connects

This was the big one. `calls.html` navigates fine because that's just a
page load — the actual problem is inside the call engine itself
(`calls-core.part1-8.js`), and it's a single missing assignment that
breaks everything downstream of it.

**Root cause:** in `calls-core.part2.js`, the module's own state machine
(`window.__CallsCoreShared.transitionTo()`) logs "transitioning from X
to Y" but the line that was supposed to actually *set* the new state —
`window.__CallsCoreShared.currentState = nextState;` — had been reduced
to a no-op (`window.__CallsCoreShared.currentState;`, which just reads
the value and throws it away). So `currentState` never left its initial
`BOOT` value, ever. Every gate further down the pipeline
(`initializeModule` waiting for `READY` before it will send
`CHILD_READY`, the `PARENT_READY` handler waiting for `WAIT_PARENT`,
etc.) checks `currentState` against a specific value — and since it was
permanently stuck at `BOOT`, none of those gates ever opened. The call
screen loads, but the module never finishes booting, never asks its
parent frame for a session, and therefore never gets the token it needs
to open a socket connection or send a call offer. That's the "navigates
there and then nothing happens."

The same class of bug (an assignment silently turned into a bare,
do-nothing property read) had also corrupted `validSessionConfirmed`
— the flag that gates the final `WAIT_PARENT → ACTIVE` transition —
in about 20 places across `part2/4/6/7/8`, plus a few related flags
(`childReadySent`, `parentReadyReceived`, `parentReady`,
`initializationLock`, session-request-attempt counters), and one spot
in `part3.js` where a `BroadcastChannel` was never actually constructed
(`.onmessage` was being set on `null`, throwing and silently breaking
multi-tab call-leader coordination).

**Fix (`calls-core.part2/3/4/5/6/7/8.js`):** restored every one of these
to the real assignment/increment/construction the surrounding code
clearly intended (verified individually from context — "session valid"
branches set flags `true`, "session invalid/reset" branches set them
`false`, etc.), and gave the `BroadcastChannel` in `part3.js` a real
channel name (`kynecta_call_leader`). `calls-core.part1.js` had none of
these and is unchanged, so it isn't included here.

With `currentState` actually updating now, the full boot → CHILD_READY →
PARENT_READY → session-valid → ACTIVE sequence can complete, which is
what unblocks call initiation end to end.

---

### Notes
- `calls.html` also loads a second, unused call-engine family
  (`js/core/calls/CallManager.js`, `WebRTCSessionOrchestrator.js`, etc.).
  Those aren't wired to the visible call screens at all (`calls-ui.js`
  only ever talks to `window.callCore` from the `calls-core.part*.js`
  files) and a previous pass already disabled their duplicate event
  listeners, so they're inert. They're harmless dead weight, not part of
  this bug — left as-is since removing them is a separate cleanup, not a
  fix.
- As always: these are just the changed files, applied in place — no
  new parallel copies.
