# MoodChat / Kynecta frontend — with calls-core.js and calls-ui.js split

This is your full `moodfronted` project with two files split for
maintainability. Everything else in the project is untouched.

## What changed

| Original file | Split into | Location |
|---|---|---|
| `calls-core.js` (39,813 lines) | **8 files** | `calls-core.src/` |
| `calls-ui.js` (12,491 lines) | **3 files** | `calls-ui.src/` |

`calls-core.js` and `calls-ui.js` themselves are still present at the
project root, exactly where `calls.html` and everything else expects
them — I verified both are **byte-for-byte identical** to your original
files (once the new header comments in the source parts are stripped
out). So the app behaves exactly as before; nothing to reconfigure.

## Why they're still single files at deploy time

Both files are one shared JS scope each — `calls-core.js` is one big
`(function(){...})()` closure, `calls-ui.js` similarly shares state
across its sections. That's *why* they grew this large: there were no
internal boundaries. Loading the split parts as separate `<script>` tags
would break at runtime (`ReferenceError` for symbols defined in other
parts). Making them truly independent would mean a full ES-modules
rewrite — a much bigger, riskier change to code that drives live
production calls, not something to bundle into a split/cleanup pass.

So: edit the small files, run the build script, deploy the regenerated
single file exactly as before.

## calls-core.js — 8 parts (`calls-core.src/`)

1. bootstrap-session
2. handshake-messaging
3. state-core-logging
4. transport-signaling
5. media-webrtc
6. state-governors
7. reliability-orchestration
8. uibridge-publicapi-init

Rebuild: `node build-calls-core.js`

## calls-ui.js — 3 parts (`calls-ui.src/`)

1. foundation-rendering
2. integration-events (the bridge to calls-core.js's public API)
3. panels-init-exports (exposes `window.callsUI`)

Rebuild: `node build-calls-ui.js`

## Cross-module wiring — confirmed unaffected

I checked what else in this repo depends on these two files' public
surfaces:

- **`calls-core.js`** exposes `window.callCore`, `window.CallHandlers`,
  `window.callsState`, `window.callsCoreReplaceVideoTrack` (+ 2 related
  helpers). Consumed by: `group-core.js`, `callOverlay.manager.js`,
  `calls-ui.js`, `calls.html`.
- **`calls-ui.js`** exposes `window.callsUI`. Consumed by: `calls-core.js`,
  `calls.html`.

Because both rebuilt files are identical to the originals, every one of
those entry points sits exactly where it did before. A call started from
group chat, the call overlay, the calls UI, or `calls.html` directly all
still work the same way.

## Workflow going forward

1. Fix a bug → open the specific part file that owns that area (see
   the tables above), not the big generated file.
2. Run the matching build script (`node build-calls-core.js` or
   `node build-calls-ui.js`).
3. Deploy the regenerated `calls-core.js` / `calls-ui.js` exactly as
   you deploy today.
4. Don't hand-edit the generated `calls-core.js` / `calls-ui.js`
   directly — those get overwritten the next time someone runs a build.
