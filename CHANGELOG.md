# Changelog

## [Unreleased]

### Added
- «Κρυφές Μάχες» v1 (the version the family tested), as the hub version: `index.html` at the repo root,
  served by games-hub at `/kryfes-maches/`. Game logic unchanged; hub changes only:
  - an HTML document wrapper (`<!doctype html>`, `<html lang="el">`, charset, viewport, favicon), because the v1
    file started at `<title>`;
  - Google Fonts link + preconnects removed; Comfortaa now comes from the hub (`/static/fonts/comfortaa.css`),
    with the same fallback stack.
- Playwright smoke under the hub CSP (desktop keyboard + tablet touch): full first-run flow, 10 s of play each,
  0 console errors, 0 CSP violations, pads ≥ 64 px, and a scripted boss win.
- CI `test` + `gitleaks`, Dependabot, README (Greek), CLAUDE.md, GAME-STANDARD.md, MIT license.
