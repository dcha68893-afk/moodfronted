# Theme Consolidation Fix — Phases 1, 1b, 1c (moodfronted)

53 changed files. Every path is relative to the repo root — drop these back into
your existing clone, overwriting the matching files.

## Phase 1
- `message.html`, `settings.html`, `game.html` were missing the `theme.colors.css`
  link entirely — fixed.
- Stripped 403 hardcoded `var(--x, #hex)` fallbacks down to `var(--x)` for variable
  names already defined by `theme.engine.js`/`theme.colors.css`.

## Phase 1b — mapped the orphaned CSS variables
Traced the full live-toggle pipeline end to end (`settings-ui.js` → `ThemeManager`
→ postMessage relay → each sibling iframe's own `theme.engine.js` instance). That
pipeline is solid — no competing paint system left. The actual spark source: 248
elements across 39 files were bound to variable names `theme.engine.js` never
defines (`--text-muted`, `--accent`, `--bg-secondary`, `--bg-tertiary`, `--bg-primary`,
`--surface`, `--surface-alt`, `--surface-elevated`, `--input-bg`, `--bg-hover`,
`--accent-hover`). Those elements just never moved when the theme changed. All
mapped to the correct canonical `--kyn-*` variable (full table in prior notes).

## Phase 1c (this pass) — hardcoded literal duplicates of theme colors
Beyond undefined variables, some rules hardcode the *literal hex value* that a
theme variable already carries, instead of referencing the variable — so they're
frozen to whichever theme they were written under. Example: `color: #374151`
sitting in an unscoped rule is exactly `--kyn-border`'s dark-mode value, written
as a constant — correct-looking in dark mode, wrong (and static) in light mode,
and either way it never reacts to a live toggle.

Found and fixed **62 occurrences across 9 CSS files**, using a real CSS parser
(not regex) to make sure every fix is safe:

- Only `background`, `background-color`, `color`, `border-color` (and the 4
  directional border-color variants) were touched — not `box-shadow`, gradients,
  or anything decorative.
- Any rule already scoped under `[data-theme="dark"]`, `.theme-dark`, or
  `.dark-theme` was **skipped entirely** — those are legitimate, correctly-scoped
  per-theme overrides, not bugs.
- `#fff` / `#ffffff` was **deliberately excluded** from this pass — it's too
  ambiguous (could be a genuinely fixed white icon/text on a colored button,
  not a "light surface" that should track the theme). Flagged for manual review
  below rather than guessed at.
- Every replacement was an *exact* value match against the real palette in
  `theme.engine.js`/`theme.colors.css` — e.g. `#0f172a` → `var(--kyn-bg-root)`,
  `#374151` → `var(--kyn-border)`, `#f0f2f5` → `var(--kyn-bg-input)`. No fuzzy or
  "close enough" matches.

| File | Fixes |
|---|---|
| Tool.css | 16 |
| messages.css | 16 |
| group.css | 8 |
| calls.css | 5 |
| chat.css | 5 |
| friend.css | 5 |
| settings.css | 5 |
| desktop.css | 1 |
| responsive.css | 1 |

One recurring pattern worth knowing about: `body[data-module="friends"]
.sidebar-header { color: #374151 }` (and its `h2` variant, and `.add-friend-btn`)
appears copy-pasted verbatim across `Tool.css`, `calls.css`, `friend.css`, and
`settings.css` — same hardcoded dark-mode border-gray in all four, all now fixed
to `var(--kyn-border)`. That's a real cross-file duplication, same root cause as
the theme "sparking" pattern all along — a value copied instead of shared.

## Verified (all three phases)
- All touched `.css` files brace-balanced.
- All touched `.css` files re-parsed clean with a real CSS parser (`tinycss2`) —
  zero parse errors introduced.
- All touched `.js` files pass `node --check` (as ES modules where applicable).
- Zero remaining references to any of the 11 orphaned variable names anywhere
  in the repo.

## How to verify visually
Fresh clone, drop these in, toggle theme from `settings.html` with `message.html`,
`friend.html`, `group.html`, `status.html`, `Tools.html`, and `calls.html` each open
in turn. Every surface should snap in one instant step, no lagging/mismatched
patches.

## Left for a follow-up pass (not in this zip)
- **`#fff`/`#ffffff` audit** — needs a human (or per-site) call on which are
  "should track theme" vs "must always stay white for contrast on a colored
  element." Not safe to bulk-automate.
- **Non-exact hardcoded colors** — hex values that are *close to* but not
  identical to a theme color (slightly different shade), and one-off colors that
  aren't part of the shared palette at all (brand accents, status dots, etc.).
  Those are legitimate design decisions in most cases, not bugs, and need
  eyeballing rather than a mechanical pass.
- **Header/footer DOM duplication (the original "Phase 2")** — this is a separate,
  larger structural change (moving markup, not just colors) and is still on hold
  per your "one screen, no sparking" priority. Say the word once the color work
  feels solid and I'll pick that back up.

`moodchat` (backend) still has zero diffs — everything so far is frontend theme work.
