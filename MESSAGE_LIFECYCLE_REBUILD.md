# Message Lifecycle Rebuild — Frontend (moodfronted)

Scope agreed with you: **messages only**. The shared iframe relay/dedup
system (`app.realtime.socket.js`, `messages-core.ui-bridge.js`,
`mesh-messages-bridge.js`, `phase15.delivery.patch.js`) is untouched because
calls/groups/games depend on it.

## Root cause

Every existing "message arrived" path funnels through a shared claim flag
(`__kynRelayMessageOnce`): whichever relay path sees the event first is the
*only* one that renders it. If that path fails partway — iframe not ready,
listener not yet rebound after a reconnect — the message is dropped, because
every other path has already backed off thinking someone else handled it.
That's a structural race, so it will always be intermittent, never
100%-reproducible — matching exactly what you described.

## What was added

| File | What |
|---|---|
| `js/core/message/MessageLifecycleClient.js` | **New.** Full Signal-style lifecycle: IndexedDB-backed local store, persistent outgoing queue with exponential-backoff retry (survives page reload), idempotent send (`clientMessageId`), and — the key fix — a **direct socket listener on a brand-new `msg:new` event** that the existing relay/claim system doesn't know about, so it can never lose the race. Also listens for `sync:missed_messages_result` (the reconnect reply nothing was previously consuming) and the new `msg:sync:result`, so anything missed while offline gets rendered instead of discarded. |
| `message.html` | One new `<script>` include for the file above. |
| `messages-core.bootstrap.js` | One small init block that calls `MessageLifecycleClient.init({ currentUserId })` once the user id is known. Nothing existing was removed or reordered. |

## How rendering works (why nothing else had to change)

`MessageLifecycleClient` doesn't reimplement message rendering. When it gets
a message (live or from reconnect sync), it dispatches the exact same
`message:new` **document** `CustomEvent` shape that `messages-core.js`
already listens for and already knows how to render — including its
existing dedupe-by-message-id logic. So:

- If the old relay *also* delivers the same message, the existing dedupe
  just drops the duplicate. No visual double-send, no regression.
- If the old relay fails (the actual bug), this module's direct path still
  delivers it, because it was never subject to the claim race in the first
  place.

## What's intentionally NOT wired yet

The **outgoing** side (`MessageLifecycleClient.sendMessage(chatId, content,
type)`) is fully implemented and ready, but I did not redirect your existing
Send-button handler to call it, since I didn't want to guess at the exact
call site and risk breaking the compose flow blind. To finish the cutover:

```js
// wherever the send button currently calls its send function, e.g.:
await MessageLifecycleClient.sendMessage(chatId, messageText, 'text');
```

Once you do that, outgoing messages get the full persistent-queue/retry
behavior too (today, only the incoming/reconnect side is active — which is
where the reported bug actually was).

## Testing checklist

1. Open a chat on two devices/browsers.
2. Turn off networking on the receiver, send a message from the sender,
   wait a few seconds, turn networking back on. The message should now
   reliably appear (previously the ~intermittent drop you reported).
3. Check browser dev tools → Application → IndexedDB →
   `moodchat_message_lifecycle_v1` to see the local store/queue.
