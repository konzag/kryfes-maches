# Test matrix: kryfes-maches

Date: 2026-10-29 (CLOSE-ALL §2.1). One row for each of the owner's test types, in the owner's order (the list at the
end of PROMPT-CLOSE-ALL-2026-10-28 has 71 names; every one has its row here).

- **Applies**: `yes` = the game has what the type tests; `no` = it does not (reason in the last column);
  `no (manual)` = needs a person, no fake test; `infra: homelab-scripts` = host-level, owned by homelab-scripts.
- **Exists** (only for `yes`): `yes` = a test that checks it runs today; `partial` = some of it; `missing` = nothing yet.
- **Where**: paths in this repo, the CI job, or rows of homelab-acceptance `tests/13-kryfes-maches.spec.ts` (KM-xx =
  the README «Λίστα χειροκίνητων δοκιμών» rows; `manual(...)` rows there are the owner's).
- **Runs**: PR CI = `.github/workflows/ci.yml` job `test` (every PR into staging/main and push to staging/main);
  nightly on staging = homelab-acceptance nightly (03:15); after each release = homelab-acceptance `test:prod`
  (`@prod-safe` rows, read-only); weekly from the runner = VM 107, staging only.

The game is static: one `index.html` served by games-hub at `/kryfes-maches/`. Its only server is the games-hub save
API (`/api/unlock`, `/api/profiles`, `/api/save/`); the hub's own database, session, headers, health and metrics are
in the games-hub matrix.

| Type | Applies | Exists | Where | Runs | Why not / gap |
|---|---|---|---|---|---|
| unit | yes | partial | tests/secret.spec.ts (scan functions of tests/secret-scan.mjs), tests/ci-workflow.spec.ts | PR CI | Game rules (damage, unlocks, clock) are only checked through whole screens; no direct test of the pure functions via `page.evaluate` |
| component | yes | yes | tests/dressup.spec.ts (wardrobe), tests/layout.spec.ts (menus, slots), tests/boat.spec.ts | PR CI | |
| integration | yes | yes | tests/smoke.spec.ts «level B: PIN → hub profile → 3 slots…», tests/save.spec.ts, stand-in hub tests/serve.mjs + tests/lib.ts | PR CI | |
| API | no | | | | The game exposes no API; the hub save API is tested in games-hub |
| contract | yes | partial | tests/lib.ts (hand-written stand-in of the hub save API) | PR CI | No shared schema with games-hub: a change to the hub's `/api/save` answers would not fail here |
| end-to-end | yes | yes | homelab-acceptance tests/13-kryfes-maches.spec.ts KM-01..KM-65 (manual: KM-22, KM-23, KM-28) | nightly on staging; after each release (@prod-safe) | |
| functional | yes | yes | tests/smoke.spec.ts, tests/flow.spec.ts, tests/boat.spec.ts, tests/gfx.spec.ts | PR CI | |
| positive | yes | yes | tests/smoke.spec.ts (keyboard + touch first run, scripted boss win) | PR CI | |
| negative | yes | yes | tests/save.spec.ts (corrupt / future-schema save), tests/smoke.spec.ts (503); acceptance KM-03, KM-24 | PR CI; nightly on staging | |
| boundary | yes | partial | tests/save.spec.ts «oversized save…», tests/secret.spec.ts «429 lockout…», tests/layout.spec.ts (360x740) | PR CI | No test for the hero name length (no maxlength in index.html) |
| validation | yes | yes | acceptance KM-03 (empty name), KM-24 (wrong 4-digit code), KM-26 (manual) | nightly on staging | |
| state transition | yes | yes | tests/smoke.spec.ts (title → slots → hero → house → city), tests/flow.spec.ts (defeat → safe point), tests/gfx.spec.ts (day/night clock); acceptance KM-17, KM-18 | PR CI; nightly on staging | |
| business rule | yes | yes | tests/flow.spec.ts (unlocks kept, KM-14 marks); acceptance KM-07 (locked crown), KM-08 (random uses unlocked only), KM-13 | PR CI; nightly on staging | |
| acceptance/UAT | yes | yes | homelab-acceptance tests/13-kryfes-maches.spec.ts (one test per README KM row) | nightly on staging | |
| smoke | yes | yes | tests/smoke.spec.ts; acceptance @prod-safe rows (KM-01, KM-02) | PR CI; after each release | |
| sanity | yes | yes | tests/smoke.spec.ts «GAME-STANDARD §4…» + first-run flow | PR CI | |
| regression | yes | yes | tests/boat.spec.ts (KM-BOAT), tests/flow.spec.ts (KM-14), tests/layout.spec.ts (§3a), tests/dressup.spec.ts (sprite cache) | PR CI | |
| retesting/confirmation | yes | yes | acceptance KM-65 (boat), KM-60, KM-61 (README «Τι άλλαξε» rows re-run on staging) | nightly on staging | |
| UI | yes | yes | tests/look.spec.ts, tests/dressup.spec.ts, tests/layout.spec.ts; acceptance KM-32, KM-34, KM-36 | PR CI; nightly on staging | |
| visual regression | yes | partial | tests/evidence.spec.ts, tests/shots.spec.ts (screens at 1280, 1180x820, 820x1180, 360, light + dark) | PR CI | Screenshots are taken but not compared: no `toHaveScreenshot` baselines in git |
| responsive | yes | yes | tests/layout.spec.ts, tests/dressup.spec.ts (projects phone, narrow-portrait, tablet-portrait); acceptance KM-36, KM-47, KM-61 | PR CI; nightly on staging | |
| cross-browser | yes | partial | playwright.config.ts (Chromium only) | PR CI | Firefox and WebKit not run |
| cross-device/OS | yes | yes | playwright.config.ts projects desktop, tablet (touch), phone (touch), narrow-portrait, tablet-portrait; real tablet: acceptance KM-12, KM-33, KM-53 (manual) | PR CI | |
| usability | no (manual) | | | | Needs the kids and a person |
| accessibility | yes | yes | axe WCAG 2.1 AA in tests/look.spec.ts, tests/dressup.spec.ts, tests/gfx.spec.ts; acceptance KM-38, KM-39 | PR CI; nightly on staging | |
| localization/internationalization | no | | | | Greek only, one language |
| content | yes | yes | tests/readme.spec.ts (nine README sections, unique IDs), tests/secret.spec.ts + tests/secret-scan.mjs (CI steps «Secret-name scan»); acceptance KM-49, KM-50 | PR CI; nightly on staging | |
| performance | yes | partial | tests/perf.spec.ts (frame budget, only with PERF=1), tests/gfx.spec.ts «frame time… (informative)» | manual | Informative only, no threshold that fails |
| load | yes | partial | homelab-acceptance load/locustfile.py + load/thresholds.json «GET games-hub /kryfes-maches/» | manual (`npm run load:staging`) | Not scheduled weekly from the runner |
| stress | yes | missing | | weekly from the runner (to add) | Nothing yet |
| spike | yes | missing | | weekly from the runner (to add) | Nothing yet |
| soak/endurance | yes | missing | | weekly from the runner (to add) | Nothing yet (also no long in-browser play run for memory growth) |
| scalability | yes | missing | | weekly from the runner (to add) | Nothing yet |
| volume | yes | partial | tests/save.spec.ts «oversized save stays on the device…» | PR CI | No server-side volume test (many profiles / full slots) against staging |
| concurrency | yes | partial | tests/save.spec.ts «pull never lets an older hub copy beat a newer device copy» | PR CI | No concurrent-users run (k6/Locust) against staging |
| frontend performance | yes | missing | | weekly from the runner (to add) | No Lighthouse CI budgets |
| authentication | yes | yes | tests/smoke.spec.ts (PIN → profile), tests/save.spec.ts «a 401 from /api/save asks for the family PIN again…»; acceptance KM-24, KM-29 | PR CI; nightly on staging | Server side (PIN check) is in games-hub |
| authorization | no | | | | No roles in the game; profile access is enforced by games-hub |
| session | no | | | | No session of its own: the hub owns the session cookie; the game only reacts to 401 (row authentication) |
| input security | yes | partial | tests/smoke.spec.ts §4 (no eval, no inline handlers); rule: player text via `textContent` | PR CI | No test that a hero or family name with markup stays text |
| request security | no | | | | Same-origin `fetch` only; CSRF, methods and headers are enforced and tested in games-hub |
| file upload | no | | | | No upload |
| rate limiting/abuse | yes | yes | tests/secret.spec.ts «429 lockout shows the wait message…»; acceptance KM-25 (manual) | PR CI | |
| security configuration | yes | yes | tests/hub-csp.mjs (the hub's game-page CSP) + tests/smoke.spec.ts §4; CI job `gitleaks` | PR CI | The headers themselves are tested in games-hub |
| dependency scans | yes | partial | .github/dependabot.yml (npm + github-actions, weekly) | weekly (Dependabot) | No `npm audit` / OSV step in CI |
| SAST/DAST | yes | missing | | PR CI (SAST); weekly from the runner (ZAP baseline, to add) | No Semgrep/CodeQL job; no ZAP baseline against staging |
| penetration | no (manual) | | | | Manual only |
| privacy | yes | yes | tests/secret.spec.ts «the PIN is never stored, logged or sent in a URL», tests/smoke.spec.ts §4 (no external URLs), tests/readme.spec.ts (no hostnames / private IPs) | PR CI | |
| database | no | | | | No server DB in the game (saves are stored by games-hub) |
| data integrity/transaction | yes | yes | tests/save.spec.ts (corrupt save kept, tombstone, newer copy wins, blocked localStorage) | PR CI | |
| migration | no | | | | No server schema; the localStorage save format is covered by row compatibility |
| import/export | no | | | | No import or export |
| caching | yes | yes | tests/dressup.spec.ts «sprite cache keyed per look…», tests/gfx.spec.ts «sprites baked once…» | PR CI | HTTP caching headers are games-hub's |
| third-party integration | no | | | | No third party (no external URL, tests/smoke.spec.ts §4) |
| webhook/queue/background job | no | | | | No jobs |
| idempotency | yes | partial | tests/save.spec.ts «erasing a slot… sends a tombstone, not a DELETE», tests/smoke.spec.ts «offline save synced later» | PR CI | No test that the same save sent twice (retry) leaves one unchanged slot |
| error handling | yes | yes | tests/smoke.spec.ts (0 console errors, 503 silent), tests/save.spec.ts (blocked localStorage, unreadable save) | PR CI | |
| network | infra: homelab-scripts | | | | App part (offline / 503 never shows an error) is in rows error handling and idempotency |
| offline/PWA | no | | | | No service worker (owner rule; GAMES-OFFLINE dropped 29/10) |
| resilience/failover | infra: homelab-scripts | | acceptance KM-30, KM-59 (manual: hub restart) | | App part: hub down = level A saves (tests/smoke.spec.ts 503) |
| recovery/disaster recovery | infra: homelab-scripts | | | | |
| backup/restore | infra: homelab-scripts | | | | The saves are backed up with the games-hub data |
| chaos | infra: homelab-scripts | | | | |
| deployment/rollback | infra: homelab-scripts | | | | Release = games-hub submodule SHA; app part: the previous release's save loads (row compatibility) |
| configuration | yes | yes | tests/smoke.spec.ts «level B off (hub answers 503)…»; acceptance KM-29 | PR CI; nightly on staging | Settings are the `CONFIG` constants in index.html; the only outside setting is the hub's `saves` flag |
| observability | no | | | | Static page: health, metrics and X-Request-ID are games-hub's |
| SEO | yes | missing | | | Public game page: `<html lang="el">` and `<title>` exist, but no meta description and no test |
| analytics | no | | | | Policy: no analytics; tests/smoke.spec.ts §4 proves no external URL loads |
| exploratory | no (manual) | | | | Needs a person |
| ad hoc | no (manual) | | | | Needs a person |
| compatibility/backward compatibility | yes | yes | tests/fixtures/save-v1.json in tests/gfx.spec.ts «save written by today's main…» and tests/look.spec.ts «an old save loads…»; acceptance KM-48 | PR CI; nightly on staging | |

## Gaps

1. unit (partial): add direct tests of the pure game rules (unlock thresholds, damage, clock) through `page.evaluate`.
2. contract (partial): share a JSON schema of the hub save API answers with games-hub and check the stand-in against it.
3. boundary (partial): test the hero / family name length (longest accepted, one longer).
4. visual regression (partial): `toHaveScreenshot` baselines in git at 1280, 820x1180, 1180x820, 360, light + dark.
5. cross-browser (partial): run the Playwright suite on Firefox and WebKit too.
6. performance (partial): a frame-time threshold that fails, run weekly from the runner.
7. load (partial): schedule the Locust games-hub run weekly from the runner VM 107.
8. stress (missing): step load on `/kryfes-maches/` and the save API on staging until the budget breaks.
9. spike (missing): sudden burst on `/kryfes-maches/` on staging.
10. soak/endurance (missing): up to 60 minutes on staging (and a long in-browser play run for memory growth).
11. scalability (missing): p95 at 1x/2x/4x users on staging.
12. volume (partial): many profiles and full slots on the staging hub save API.
13. concurrency (partial): two devices saving the same slot at once (k6/Locust) on staging.
14. frontend performance (missing): Lighthouse CI budgets for `/kryfes-maches/`.
15. input security (partial): a name with markup (`<img onerror>`) stays plain text on every screen.
16. dependency scans (partial): `npm audit` / OSV step in CI.
17. SAST/DAST (missing): Semgrep (or CodeQL) on PRs; ZAP baseline against staging weekly.
18. idempotency (partial): the same save sent twice leaves one unchanged slot.
19. SEO (missing): meta description + a test of title, lang and description on the public page.
