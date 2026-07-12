# MoodChat / Kynecta — Fix Batch (message header, text-wrap, group back arrow, premature call end)

4 files changed, all edited in place — no new files, no patch modules.
Repo: dcha68893-afk/moodfronted

--------------------------------------------------------------------
## 1. chat.html — Chat header (name, avatar, back arrow, call icons) missing
--------------------------------------------------------------------
**Root cause:** A mobile-only CSS rule hid `#globalHeader` completely
(`opacity:0; visibility:hidden; pointer-events:none`) whenever the body had
the class `chat-panel-active` — which is exactly the class applied while a
1:1 chat is open. But `chat.html` already mirrors message.html's own chat
header into `#globalHeader` (`#headerChatCtx` — see `showChatHeader()`)
so that there's a single header instead of a duplicate one. The old CSS
rule was hiding that mirrored header too, leaving only an empty bar where
the name/avatar/back-arrow/call buttons should be — exactly what's visible
in the screenshot.

**Fix:** `body.chat-panel-active #globalHeader` is no longer hidden; it now
gets the same "always visible" treatment as `body.group-panel-active
#globalHeader`. Only fully custom full-screen views (`call-screen-active`,
`status-panel-active`) still hide the global header.

--------------------------------------------------------------------
## 2. messages.css — Received/sent text cut mid-word (e.g. "mbona" → "Mb" / "ona")
--------------------------------------------------------------------
**Root cause:** the message bubble rules used `word-break: break-word`
together with `width: fit-content; max-width: 75%`. `word-break:
break-word` is a much more aggressive breaking mode than
`overflow-wrap: break-word` — combined with `fit-content` sizing it forces
the browser to compute the bubble's shrink-to-fit width using a
mid-word-broken layout, even for short words that would fit on one line
easily. That's why short single-word messages like "mbona" or "hello"
sometimes rendered split ("Mb" / "ona") while longer messages looked fine.

**Fix:** switched all 3 message-bubble rules (`.message-bubble`,
`.message.sent .message-bubble`, `.message.received .message-bubble`) from
`word-break: break-word` to `overflow-wrap: break-word` + `word-break:
normal`. This only breaks a word when it genuinely can't fit on its own
line (e.g. a very long URL), and stops breaking short words that fit fine.

--------------------------------------------------------------------
## 3. group-ui-patch.js — Back arrow inside "Group Details" panel not working
--------------------------------------------------------------------
**Root cause:** the Group Details panel (`#groupDetailsPanel`) is a fixed,
full-screen overlay stacked *on top of* the group chat (see group.css:
`position:fixed; z-index:1000`), toggled via an `.active` class + inline
`style.display`. Its own back button also happens to have `id="backBtn"`.
A single delegated click handler in group-ui-patch.js was catching every
element matching `.mobile-back-btn, .gc-back-btn, #closeChatBtn, #backBtn`
and always doing the same thing: hide the whole group chat panel and show
the sidebar. That's correct for the chat's own back button, but wrong for
the Group Details overlay's back button — clicking it hid the group chat
underneath instead of just closing the details overlay, so it looked like
the button did nothing useful.

**Fix:** added a dedicated handler (registered first) that specifically
matches `#groupDetailsPanel #backBtn` and only closes that overlay
(removes `.active`, resets inline `display:none`), leaving the chat
already open underneath untouched. The generic handler now explicitly
skips this case.

--------------------------------------------------------------------
## 4. calls-ui.js — Outgoing call ends itself ~1-3s after being placed,
   before the other person can accept/reject (dark screen, no icons)
--------------------------------------------------------------------
**Root cause:** `calls-ui.js` had **two independent listeners** for the
exact same `OPEN_CALL_WITH_USER` event, each running its own separate
call-initiation pipeline:

  - An "early" listener (near the top of the file) →
    `processPendingCall()` → `startCallWithUser()` →
    `calls-core.js initiateCall()`
  - `setupOpenCallWithUserListener()`'s `guardedHandleOpenCallWithUser()`
    (registered later, explicitly labelled "single unified listener with
    dedup lock" in its own comment) → `attemptPendingCall()` →
    `initiateCallWithPendingUser()` → `calls-core.js initiateCall()`

Each one checked a *different* dedup lock (`__earlyCallLock` vs
`__uiCallDispatchLock`), so neither ever saw that the other had already
claimed the same event. Both fired, both started a call, and
calls-core.js ended up with two competing call IDs
("⚠️ Cannot set active call — another call already active", followed by
"force-clearing stale state and retrying once"). Those two calls then
raced to end one another within a couple of seconds — visible in the
console as a burst of "stale echo" / "mismatched callId" warnings — which
is exactly the premature call termination described (dark screen, no
icons, before the receiver could answer).

**Fix:** the early listener now shares the exact same lock object
(`window.__uiCallDispatchLock`) that `guardedHandleOpenCallWithUser` uses.
Whichever handler runs first claims the lock; the other now correctly
recognizes the event as a duplicate and skips it, so only one call is ever
actually placed per user action.

--------------------------------------------------------------------
## How to apply
--------------------------------------------------------------------
Copy these 4 files over the matching paths in a **fresh clone** of
`dcha68893-afk/moodfronted`, overwriting the existing files:

  chat.html
  messages.css
  calls-ui.js
  group-ui-patch.js

No other files were touched, no new files were added, and the
`moodchat` backend repo was not touched for this batch — all 4 issues
were front-end only.

--------------------------------------------------------------------
## Not fixed in this batch (out of scope / separate backend issues)
--------------------------------------------------------------------
The provided console log also shows unrelated backend 500/429/422 errors
(`/api/devices/sync`, `/api/messaging/messages/starred`,
`/api/tools/marketplace/wishlist`, `/api/settings` 429, `/api/groups/:id/modules`,
`/api/games/progress`) and a broken avatar URL (an HTML `<img>` string being
used directly as an image `src`, causing a 404). These are separate from the
4 issues above and weren't touched here — flag them separately if you want
them fixed next.
