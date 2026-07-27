# Phase 1 + 1b — Theme Consolidation Fix (moodfronted)

This zip contains the 50 files that were modified out of the full `moodfronted` repo
(43 from Phase 1, 7 more touched in Phase 1b below). Every path is relative to the
repo root — drop these back into your existing clone, overwriting the matching files.

## Phase 1 (previous pass)

1. `message.html`, `settings.html`, `game.html` were missing the `theme.colors.css`
   link entirely — fixed.
2. Stripped 403 hardcoded `var(--x, #hex)` fallbacks down to `var(--x)` for variable
   names already confirmed live in `theme.engine.js`/`theme.colors.css`.
3. Catalogued (but didn't touch) ~140 fallbacks referencing undefined variable names.

## Phase 1b (this pass) — mapped the orphaned variables + audited the live pipeline

**First, the pipeline audit.** You described the real symptom precisely: not the
header duplication, but colors blinking/sparking across the whole screen on theme
change. I traced the entire live-toggle path end to end — `settings-ui.js` ->
`ThemeManager.setTheme()` -> `postMessage` to `chat.html` -> relayed to every sibling
iframe -> each iframe's own `theme.engine.js` instance repaints itself with
transitions frozen for that frame. This part is already solid: every legacy path
(`AppSettings.js`, `settingsManager.js`, `settings-global-propagation.js`,
`app.runtime.authority.js`, the `status-core*.js` message handlers) either delegates
straight to `window.ThemeManager` or is a neutered no-op stub — there's no second
system secretly repainting on its own schedule anymore. That part of your prior
sessions' work held up.

**What's still causing the visible spark:** elements bound to CSS variable names that
`theme.engine.js` never defines. When the theme flips, everything wired to a real
`--kyn-*` (or other canonical) variable jumps instantly — but anything using one of
these undefined names never moves at all, because there's nothing for the browser to
update. Sitting next to hundreds of elements that *do* snap to the new theme, these
static, wrong-toned patches read as sparking/inconsistency rather than a clean
instant switch.

Found and fixed, 236 + 12 = **248 occurrences across 39 files**:

| Undefined variable | Mapped to | Reasoning |
|---|---|---|
| `--text-muted` (66) | `--kyn-text-muted` | exact existing concept |
| `--input-bg` (8) | `--kyn-bg-input` | exact existing concept |
| `--bg-hover` (1) | `--kyn-bg-hover` | exact existing concept |
| `--accent` (53) | `--kyn-accent-primary` | exact existing concept |
| `--bg-secondary` (38) | `--kyn-bg-panel` | secondary/card-level surface |
| `--bg-tertiary` (44) | `--kyn-bg-input` | nested/inset surface (search fields, chips, tab buttons) |
| `--bg-primary` (12) | `--kyn-bg-modal` | sheet/modal backgrounds |
| `--surface` (7) | `--kyn-bg-modal` | dialog/elevated surface |
| `--surface-elevated` (1) | `--kyn-bg-modal` | dropdown menu surface |
| `--surface-alt` (10) | `--kyn-bg-hover` | used exclusively on `:hover` states — literal match |
| `--accent-hover` (1) | `--primary-dark` | pre-darkened accent shade, made for hover states |

`--surface-color` was **left alone** — it's not orphaned, it's set by
`theme.engine.js`'s `broadcastToIframe()` (`IFRAME_SHELL_VARS`) on every iframe both
at initial mount and on every theme change, so it was already live.

## Verified

- Zero remaining `var(--x, #hex)` references to any of the 11 variable names above,
  anywhere in the repo.
- All touched `.css` files still brace-balanced (`status.css` 711/711,
  `settings.css` 260/260, unchanged from Phase 1's other CSS files).
- All touched `.js` files re-checked with `node --check` (as ES modules where
  applicable) — no syntax errors introduced.

## How to verify visually

Drop these files into a fresh clone, open the app, and toggle theme from
`settings.html` while `message.html`, `friend.html`, `group.html`, `status.html`,
and `Tools.html` are each open in turn. Every surface should snap to the new theme
in one instant step — no lagging patches of the old color.

## What's left (not in this zip)

A handful of hardcoded hex colors that aren't behind any CSS variable at all
(the ~649 counted in the original audit) will still be static across a theme
change — those need per-site judgment about which `--kyn-*` variable they should
actually reference, which is real design work rather than a mechanical rename.
Say the word if you want me to start cataloguing those next, file by file.

`moodchat` (backend) still has zero diffs — all of this is frontend theme work.
