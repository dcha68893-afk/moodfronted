# MoodChat Theme System — Consolidation & Flash Fix
(Reapplied against a fresh clone — the repo had moved forward with unrelated
commits since the first pass, and a new `core files/` directory had appeared
containing merged/canonical copies of Tool-core.js, status-core.js,
friend-core.js and messages-core.js with the same underlying bugs. All fixes
below were reapplied against current file contents, not copy-pasted from the
old clone.)

## Root cause
The app had **7 separate, disconnected theme systems** running at once, each
reading a different localStorage key, using a different state marker
(`data-theme` attribute vs `.theme-dark`/`.dark-theme`/`.theme-auto` classes),
and painting a different hardcoded dark palette (`#0f172a` vs `#1a1a2e` vs
`#1a1a1a`, in at least 4 different files). Depending on load order, the page
would paint with one system's colors and then get overwritten by another's —
that overwrite is the visible "spark". `chat.html`'s parent shell also
unconditionally rewrote a `<style>` override inside every module iframe on
every load, forcing a second repaint even when nothing had changed.

## What changed (42 files)
1. **Single source of truth**: `data-theme` attribute on `<html>`, one
   localStorage key (`app_theme`), values `'light'` or `'dark'` only.
2. **'Auto' theme removed app-wide** — front end, schema validators, and the
   backend `normalizeTheme()` in `server.js`. It required an async
   `matchMedia` check that ran independently (and inconsistently) on every
   page/module — a major cause of the flash. Any legacy stored `'auto'` or
   `'system'` value now quietly resolves to `'light'`.
3. **Every module HTML** (`chat`, `friend`, `group`, `calls`, `message`,
   `status`, `Tools`, `game`, `index`, `settings`) now runs an identical
   pre-paint script that sets `data-theme` **and** font size before first
   render — no more flash-then-correct.
4. **`index.html`** converted from its own private `.theme-dark`/
   `moodchat_theme` system to the shared one (was the most visible offender,
   since it's the first screen most people see).
5. **`settings.html`** converted from its own private `#1a1a1a` palette to
   the app-wide `#0f172a` palette.
6. **iframe re-injection made idempotent** in `chat.html` — skips the
   repaint-causing style rewrite when the iframe is already showing the
   correct theme, which directly removes the spark seen on every
   module open/switch.
7. **Font-size bug fixed** in 3 places: `--base-font-size` was being set with
   no `px` unit (invalid CSS, silently ignored) due to a stale
   small/medium/large lookup table that never matched the real numeric
   (12/14/16/18) value.
8. **"Auto" removed from the Settings UI** theme dropdown — only Light/Dark
   remain. `applyTheme()`/`applyFontSize()` in `settings-ui.js` now actually
   set the shared `data-theme` attribute and persist instantly, and text-size
   changes apply globally (not just on the Settings page) via the same
   `--base-font-size` variable and `app_font_size` key every module reads.
9. Icons already inherit color from the shared text-color variables in
   `theme.colors.css`, so they follow the theme/size automatically — no
   separate icon-color system was needed.

## Not touched
- `upload.html` — a standalone Cloudinary upload **test** utility page, not
  part of the normal app navigation; left with its own fixed design.
- The visual palette used by `index.html`'s dashboard itself (purple/blue
  gradient) is an intentional distinct brand look for the landing/dashboard
  screen — it now correctly *follows* light/dark like everywhere else, it's
  just not required to use the identical hex values as the chat interior.

## Testing suggestion
Clear `localStorage`, reload, toggle theme in Settings, then navigate
through every module — there should be no visible color/size flash on load,
refresh, or navigation, and font size changes should apply instantly across
every open module.
