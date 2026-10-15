# kryfes-maches: Claude context

«Κρυφές Μάχες», a household game for ages 7-9. **The spec is [GAME-STANDARD.md](GAME-STANDARD.md) (Greek). Read it
first.** Every rule there applies here. Created from konzag/games-template (its staging content, copied: the
template flag was not set yet).

## Layout
- `index.html`: the whole game, no build step: one `<style>`, one inline `<script>`. `CONFIG` at the top of the
  script (tuning, `slug`, `hubPath: '/kryfes-maches'`, `serverSave`). Global state `G` (mode, hero, fight, save `G.S`).
- Flow: title → slots (3) → create hero → intro → house (wardrobe) → city. Bosses: rock, cat, lake, bag, pie.
- `tests/smoke.spec.ts`: Playwright (Chromium) under the hub CSP, projects `desktop` (keyboard) and `tablet`
  (touch): the full first-run flow, 10 s keyboard, 10 s touch, a scripted boss win ('cat').
- `tests/serve.mjs` + `tests/hub-csp.mjs`: a stand-in for games-hub that sends the hub's game-page CSP.
- `.github/workflows/ci.yml`: `test` (Playwright) + `gitleaks` on every push.

## Rules
- Served by games-hub at `/kryfes-maches/` (submodule `games/kryfes-maches`, pinned SHA) behind its CSP: one inline
  `<script>`, no `eval`/`new Function`/string timers, no inline handlers, no external URLs. The font comes from
  the hub (`/static/fonts/comfortaa.css`).
- Network: none, except the hub save API (`/api/...`) when server saves are on (games-hub `GAMES` `saves=True`).
- Keep the game logic as the owner tested it; hub-related changes only, unless the owner asks.
- localStorage in try/catch; key `game.kryfes-maches.v1`, schema `SCHEMA`; bump and migrate, never drop data.
- Player text (hero, family names) goes into the DOM with `textContent`, never `innerHTML`.
- Flow: feature branch → PR to `staging` → CI green → release PR `staging → main` → owner GO. Signed commits.
