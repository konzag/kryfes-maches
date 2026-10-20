# Changelog

## [Unreleased]

### Added
- GAMES-KM-GFX-01 (OPEN-28, PR #10): neon-80s seaside look chosen with the family. Pastel city, palm trees along the
  lake, street lamps, a fountain in the square, Greek neon shop signs (no brands). A day/night cycle by itself
  (`CONFIG.dayLengthSec` = 300, sky keyframes from the approved style preview): a multiply light tint per hour,
  then a lit pass with windows, lamps, sign letters switching on one by one, the six places of the kids' list
  (each with its own colour and shape cue), lake reflections, a small light around the hero and a lit fight arena.
  Glow = pre-rendered 64x64 radial sprites with additive blending; neon lettering pre-rendered per scale; no
  per-frame `shadowBlur` in the new code (arena ring and beam telegraph moved off it too).
- Comic words «ΜΠΑΜ!», «ΖΑΠ!», «ΚΡΑΚ!» on big hits and «ΠΟΥΦ!» when an enemy turns into sparks; 1-3 px shake on
  big hits, never with `prefers-reduced-motion` or «Λιγότερα εφέ».
- Light + dark shell (GAME-STANDARD v1.2 §3a): CSS tokens for both, `prefers-color-scheme` with a remembered
  toggle («🌗 Θέμα») and «✨ Λιγότερα εφέ» (fewer particles, no glow sprites or halos, no shake; switches on by
  itself once after 3 s of frames over 25 ms) on the title and pause screens, stored in the new key
  `game.kryfes-maches.settings.v1`. Particle cap 260 (80 with fewer effects). Translucent plates behind HUD text.
- `tests/gfx.spec.ts` (16 runs over 4 sizes, test hook `window.__KM_TEST__`, debug state `window.__kmDebug()`),
  `tests/fixtures/save-v1.json` (a save written by the previous version), `tests/shots.spec.ts` (README images,
  only with `SHOTS=1`), `docs/screens/*.jpg`.

### Changed
- Save keys, save format, progression, combat rules, controls and the touch layout are unchanged. The clock tower
  shows the game hour. `button.danger` darker (white text now passes AA).
- README pass 02 (GAME-STANDARD v1.2 §2a): the README is also the owner's manual-test guide. New sections
  «Οθόνες και ροή» (title, «Ποιος παίζει;», hero, story, the mirror / dress-up screen, city, battle, defeat, pause,
  ending, rotate hint, unlocks), a rewritten «Αποθήκευση» (it still described device-only saves: since WP-K2 the
  family PIN, hub profile, 3 slots per profile, «Μόνο σε αυτή τη συσκευή» and the silent device fallback),
  «Λίστα χειροκίνητων δοκιμών» KM-01..KM-39 (sizes from `tests/dressup.spec.ts`, TEST profile only),
  «Τι άλλαξε», «Γνωστοί περιορισμοί», «Ασφαλής δοκιμή», «Αναφορά προβλήματος». The story no longer reveals the
  secret monster. Issue forms `bug.yml` / `update.yml`, PR template checkbox, `tests/readme.spec.ts` (sections,
  KM ids, issue forms, no hostnames). `GAME-STANDARD.md` synced to v1.2. No game code change; save key and
  save format unchanged.

## [2026-10-19] FIX-2 (PR #6, release PR #7)

### Fixed
- Dress-up / mirror screen on phones (FIX-2).
  - Category tabs and sub-category chips are single scrollable rows with scroll-snap, an edge fade and ‹ › buttons
    while more is hidden. The selected tab/chip stays in view.
  - Options are cards of ≥ 72 px with a preview, a short name, «ΝΕΟ» and 🔒 (locked = greyed preview).
    The selected card is marked (`aria-pressed`).
  - Short screens (≤ 500 px high, e.g. a 780×360 phone): a smaller mirror, a one-line hint (a tap shows the
    whole sentence), and the options as one row above «Τυχαίο», «Αποθήκευση» and «Βγες στην πόλη».
  - Narrow portrait: a smaller mirror and compact buttons.
  - Save keys and save format are unchanged.
  - New `tests/dressup.spec.ts` runs at 780×360, 360×780, 820×1180, 1180×820 and 1280, light + dark, with axe
    (WCAG 2 AA).

## [2026-10-15] v1 + server saves (WP-K1 PR #1, WP-K2 PR #2, release PR #3; README PR #4, release PR #5)

### Added
- Server saves (GAME-STANDARD §5 level B, WP-K2): `CONFIG.serverSave = true`. Family PIN → hub profile → 3 slots via
  `GET/PUT /api/save/kryfes-maches/<profile>/<slot>` (the current slot JSON, schema 1, < 64 KB). Device saves
  (level A) stay the fallback: if the hub answers 503 (no PIN yet) or is offline, nothing is shown and dirty slots
  are sent later. An erased slot is sent as a tombstone (`{deleted: true}`). The device save key keeps schema 1
  (`remote` and `dirty` are optional additions).
- «Κρυφές Μάχες» v1 (the version the family tested), as the hub version: `index.html` at the repo root,
  served by games-hub at `/kryfes-maches/`. Game logic unchanged; hub changes only:
  - an HTML document wrapper (`<!doctype html>`, `<html lang="el">`, charset, viewport, favicon), because the v1
    file started at `<title>`;
  - Google Fonts link + preconnects removed; Comfortaa now comes from the hub (`/static/fonts/comfortaa.css`),
    with the same fallback stack.
- Playwright smoke under the hub CSP (desktop keyboard + tablet touch): full first-run flow, 10 s of play each,
  0 console errors, 0 CSP violations, pads ≥ 64 px, and a scripted boss win.
- CI `test` + `gitleaks`, Dependabot, README (Greek), CLAUDE.md, GAME-STANDARD.md, MIT license.
