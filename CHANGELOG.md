# Changelog

## [Unreleased]

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
