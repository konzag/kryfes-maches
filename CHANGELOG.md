# Changelog

## [Unreleased]

### Fixed
- Port of the games-template fixes (games-template d1aa5fc, T5 + T3), GAME-STANDARD §5 / §3a:
  - T5: a 401 from `/api/save` (PUT in `Server.push`, GET in `Server.pull`) sets `Server.state = 'locked'`, so the
    slot screen asks for the family PIN again and shows the device slots; `syncPending` stops after it. The unsent
    slot stays in `dirty` and is sent after the PIN; the device save is untouched. Before, the 401 was ignored and
    the profile list stayed. Tests: `tests/save.spec.ts` «level B: a 401 from /api/save (PUT of the queued save |
    GET of a slot) …» (fake hub knob `saveStatus`), red before, green now.
  - T3: portrait on a touch device: the rotate hint covers the screen only while playing (no menu open); on the
    menus `#rotate.strip` is a bottom strip with `pointer-events: none` (`checkRotate()` now also runs from
    `showScreen` / `hideScreen`, and only auto-pauses when no menu is open). Tests: `tests/layout.spec.ts` §3a
    portrait touch 820x1180 / 360x740 (red before), plus a guard that the full cover stays while playing.
  - `#screen` uses `align-items: safe center` and every menu opens scrolled to its top: a card taller than the
    window (slots at 780x360 or 360x740) was cut off above the window. Test: `tests/layout.spec.ts` «a slot screen
    taller than the window starts at its heading and scrolls» (red before).
  - Review fix: `hideScreen()` calls `checkRotate(true)` (look only, no auto-pause), so «🏡 Πήγαινε σπίτι» from the
    pause menu (or «Πάμε σπίτι» after a lost fight) in portrait no longer leaves a pause card over the house. Test:
    `tests/layout.spec.ts` «portrait touch: «🏡 Πήγαινε σπίτι» from the pause menu lands in the house …» (red before).
  - T2 checked, no change: `tests/layout.spec.ts` «360x740: the shell buttons fit …» passes as is.
  - Save key `game.kryfes-maches.v1`, `SCHEMA` 1 and the save format unchanged. Test-count floor 247 -> 265.
- KM-14 (PR #22): the ● marks on the wardrobe chips and the «ΝΕΟ» cards go away again after the next trip to the city.
  The G1-GFX change (#18) put its portrait-cache reset in front of `goCity()`'s first line, so the trailing comment
  swallowed `S.seenUnlock = battlesWon(S); saveGame(false);`. Restored on its own line; graphics, save keys and save
  format unchanged. New test `tests/flow.spec.ts` «new marks in the wardrobe go away after the next trip to the city
  (KM-14)» (red on 6b5f923, green now).
- KRYFES-MACHES-T1/T2 (PR #22): a save `Store.read()` cannot use (unparsable JSON, or `v` other than `SCHEMA`, e.g. a
  newer build's `v: 2`) is copied once to `game.kryfes-maches.v1.bak` (`.bak.<time>` if that key holds another one)
  before the next `Store.write()` replaces it. If that copy cannot be written, `write()` keeps to memory and leaves the
  save alone. Key `game.kryfes-maches.v1`, `SCHEMA` 1 and the v1 format unchanged. The two `test.fail` markers in
  `tests/save.spec.ts` are gone (both tests pass); new test for the failed-backup case. Test-count floor 245 -> 247.

### Changed
- **CI on every PR** (owner decision D21, rulesets with required checks): `.github/workflows/ci.yml` now runs on
  `pull_request` into staging/main, on `push` to staging/main only (a PR branch commit runs CI once, not twice) and
  on `workflow_dispatch`. Before, CI ran on push only, so a PR whose branch moved through GITHUB_TOKEN showed no
  checks. Job ids / check names stay `test` and `gitleaks`.
  - Tests: new `tests/ci-workflow.spec.ts` (file check, desktop project): triggers and branches, no paths filter,
    workflow name `CI`, required jobs present, unconditioned and keeping their check names, no `${{ }}` inside a
    `run:` script. Red on the old ci.yml. Test-count floor 265 → 271.
- G1-GFX-2026-10-22 (PR #18): a clearly better look with the same gameplay, controls, difficulty, texts, save keys and save
  format.
  - **Ink and shadows:** clean ink outlines (buildings, roofs, trees, boats, cars, docks, hero and NPC bodies) and
    contact shadows.
  - **Ground:**
    - a meadow of tufts and flowers, stamped from pre-rendered sprites on a hashed 32-unit grid;
    - curbs on the roads, plank docks, foam on the lake shore and a deeper middle of the lake.
  - **Static ground:** every part is drawn only where the view is (culling). A tile cache was measured and dropped:
    drawing a new tile while walking cost more than copying tiles saved.
  - **Tree crowns** are sprites per radius and green.
  - **Ambient life** (`CONFIG.ambientMax` = 60, one pool, delta time):
    - drifting cloud shadows;
    - a high layer of clouds and birds with 1.35x parallax (never over a fight);
    - leaves and lake glints by day;
    - fireflies by night.
  - **Characters:**
    - squash and stretch on steps and an idle breath for the hero and NPCs;
    - monsters bounce with a squash, blink, have rosy cheeks and softer brows.
  - **No more `ctx.filter` or per-frame `shadowBlur` in fights:**
    - the hit flash is a white additive glow and the frost a pale-blue shell;
    - eye, bag-light and projectile glows use the glow sprites;
    - fights run at about 48 fps instead of 29-33 on the same machine (see the PR for all the numbers).
  - **HUD and dialogs:**
    - outlined icons (heart, pies, star, ability icons as sprites, outlined touch pads);
    - toasts become speech bubbles with the hero's portrait;
    - the boss intro becomes a ribbon with the monster's portrait;
    - an «E» key cap in the prompt;
    - HUD labels and the portrait are cached sprites;
    - narrow windows (< 480 px) start the HUD under the shell buttons.
  - **Screens:**
    - an animated title logo (letters pop in, a slow wave, a neon underline, sparkles);
    - card pop and house veil transitions with no opacity on the card, so text contrast holds from the first frame;
    - a short canvas fade into the town and the ending;
    - the ending gets layered clouds and hills;
    - a mirror glint sweeps in the wardrobe.
  - **Reduced motion and «Λιγότερα εφέ»:** no particles, no high layer, no drift, a static logo and no shake.
    «Λιγότερα εφέ» (also the automatic switch on slow devices) also drops the ink outlines (`INK` becomes
    see-through, so the browser skips those strokes) and the meadow marks.
  - **Night tint:** the hour's tint is a plain see-through fill computed from the old multiply colour (exact on
    white, within a few percent elsewhere) instead of a `'multiply'` fill, which re-reads the whole screen.
  - `calm()` caches the reduced-motion media query (updated on its change event).
  - **Tests and tools:**
    - new `tests/look.spec.ts`: every screen at 4 sizes x light/dark with 0 console errors and axe 0 serious, the new
      layers, reduced motion and low effects, no `ctx.filter`, and the old save fixture. The feature tests fail on
      the old code.
    - `tests/perf.spec.ts` (PERF=1) and `tests/evidence.spec.ts` (EVIDENCE=dir) for before/after numbers and
      screenshots;
    - README KM-51 to KM-58, before/after images in `docs/screens/gfx/`.

### Security
- KM-SECRET-02: the whole intro line of boss 5's fight (every word of it, not only the name) is no longer
  in the page source: `index.html` keeps it as two more code-point constants (`SECRET_C`, `SECRET_D`) that
  `secretWords()` decodes with the name when that fight starts; the banner text is unchanged (same SHA-256).
  `tests/secret-scan.mjs` also fails on any two consecutive words of that line in any covered spelling (it holds
  only SHA-256 of the folded word pairs and of the folded line); `tests/secret.spec.ts` checks the repo, the served
  responses and the DOM before the fight for fragments. README KM-50. Save keys and format unchanged.
- KM-SECRET-01: boss 5's name is no longer in the page source (the repo is public and the kids must not read it
  before the fight). `index.html` keeps it only as two code-point constants (`SECRET_A`, `SECRET_B`) that
  `secretWords()` decodes when that fight starts; the texts shown in the fight are unchanged. New
  `tests/secret-scan.mjs` (folds every line of every repo file: escapes decoded, case, tonos, final sigma, Greek to
  Latin; compares a SHA-256, never the name) as a CI step and in `tests/secret.spec.ts` (repo scan, spellings,
  served responses and DOM before the fight, decoded texts by SHA-256, fixture save). README KM-49. Save keys
  `game.kryfes-maches.v1`, `game.kryfes-maches.settings.v1`, save format and server save paths are unchanged.
  The old history still holds the name until the separate history scrub.

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
