// GAMES-GRAPHICS §4 (games-template docs/specs/GAMES-GRAPHICS.md): the frame-time gate, in CI on every PR.
// Chromium, tablet project (1180x820, pixel ratio 2, touch), CPU slowed down 4x through CDP so the CI machine looks
// like a mid tablet; 10 s of play in the city per variant (noon, walking by the promenade and the lake).
// A test-only hook wraps requestAnimationFrame from an init script: the frame time is the main-thread time of one
// frame callback (update + drawing), the same measure as tests/perf.spec.ts.
// Two variants, interleaved in the same test (ABBA ABBA), so both run on the same machine under the same load:
//   reference = test config gfx 'base' : the look before GAMES-GRAPHICS (tiers off)
//   candidate = no gfx override        : the default «Κανονικά»
// slowFrameMs 1e9 (test config) keeps «Λιγότερα εφέ» from switching on by itself on the throttled CPU, so the gate
// measures the full look. The config travels in sessionStorage to the init script (test only, never in the game).
// Gates (thresholds in tests/frametime.json): candidate p95 <= reference p95 x (1 + maxGrowth); and candidate
// p95 <= p95MaxMs whenever the reference itself meets p95MaxMs on this machine. The numbers go to the log
// (FRAMETIME {...}) and to the test annotations; FRAMETIME_OUT=<file> appends them as one JSON line.
// CI runs it in its own step, alone on the machine (tag @frametime: the main step skips it with --grep-invert):
//   npx playwright test --grep @frametime --project=tablet --workers=1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

declare const G: any; // eslint-disable-line @typescript-eslint/no-explicit-any
const CFG = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'frametime.json'), 'utf8'));
const SAVE_KEY = 'game.kryfes-maches.v1';
type Cdp = { send: (m: string, p?: object) => Promise<unknown> };

/** Opens the game with this test config and walks the first-run flow into the city (full CPU speed). */
async function toCity(page: Page, config: Record<string, unknown>) {
  await page.evaluate(([k, c]) => { localStorage.removeItem(k); sessionStorage.setItem('km-ft-config', c); }, [SAVE_KEY, JSON.stringify(config)]);
  await page.goto('/');
  const b = async (n: string | RegExp) => page.getByRole('button', { name: n }).first().click();
  await b('▶ Παίξε'); await b('Νέο παιχνίδι');
  await page.getByLabel('Πώς λένε τον ήρωα;').fill('Δοκιμή');
  await b(/Ξεκίνα την περιπέτεια/); await b(/Πάμε να ετοιμαστώ/); await b(/Βγες στην πόλη/);
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
}

/** One segment: get to the city at full speed, then slow the CPU down and walk for `ms`. */
async function segment(page: Page, cdp: Cdp, config: Record<string, unknown>, ms: number) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await toCity(page, config);
  await page.evaluate(() => { G.hero.x = 2045; G.hero.y = 1000; G.hero.hp = G.hero.max = 1e9; });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CFG.cpuThrottle });
  await page.waitForTimeout(1500); // warm-up: sprites baked, caches filled
  await page.evaluate(() => { const F = (window as any).__ft; F.list = []; F.gaps = []; F.on = true; }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'], end = Date.now() + ms;
  for (let i = 0; Date.now() < end; i++) { const k = keys[i % 4]; await page.keyboard.down(k); await page.waitForTimeout(450); await page.keyboard.up(k); }
  const out = await page.evaluate(() => {
    const F = (window as any).__ft; F.on = false; // eslint-disable-line @typescript-eslint/no-explicit-any
    return { list: F.list.slice() as number[], gaps: F.gaps.slice() as number[], mode: G.mode as string };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  expect(out.mode, 'still in the city after the segment').toBe('city');
  return out;
}
const pct = (l: number[], q: number) => { const s = l.slice().sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(2); };
const mean = (l: number[]) => +(l.reduce((a, b) => a + b, 0) / l.length).toFixed(2);

test('frame time with the CPU 4x slower: p95 within the GAMES-GRAPHICS budget @frametime', async ({ page }, info) => {
  expect(info.project.name, 'tablet project only (playwright.config.ts)').toBe('tablet');
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    let extra = {};
    try { extra = JSON.parse(sessionStorage.getItem('km-ft-config') || '{}'); } catch { /* none */ }
    (window as any).__KM_TEST__ = { config: { forceHour: 12, slowFrameMs: 1e9, ...extra } }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const raf = window.requestAnimationFrame.bind(window), F = { on: false, list: [] as number[], gaps: [] as number[], last: 0 };
    (window as any).__ft = F; // eslint-disable-line @typescript-eslint/no-explicit-any
    window.requestAnimationFrame = (cb) => raf((ts) => {
      const t0 = performance.now();
      try { cb(ts); } finally { if (F.on) { F.list.push(performance.now() - t0); if (F.last) F.gaps.push(t0 - F.last); } F.last = t0; }
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/'); // the origin's storage is reachable only after a first page load
  const cdp = await page.context().newCDPSession(page);
  const seg = CFG.playMsPerVariant / CFG.segments;
  const ref: number[] = [], cand: number[] = [], refGaps: number[] = [], candGaps: number[] = [];
  const order = ['ref', 'cand', 'cand', 'ref'];
  expect(CFG.segments % 2, 'segments: an even number (ABBA blocks)').toBe(0);
  for (let i = 0; i < CFG.segments * 2; i++) { // segments per variant, alternating
    const v = order[i % 4], r = await segment(page, cdp, v === 'ref' ? { gfx: 'base' } : {}, seg);
    (v === 'ref' ? ref : cand).push(...r.list); (v === 'ref' ? refGaps : candGaps).push(...r.gaps);
  }
  const res = {
    throttle: CFG.cpuThrottle, viewport: '1180x820@2',
    reference: { frames: ref.length, meanMs: mean(ref), p50Ms: pct(ref, 0.5), p95Ms: pct(ref, 0.95), gapP95Ms: pct(refGaps, 0.95) },
    candidate: { frames: cand.length, meanMs: mean(cand), p50Ms: pct(cand, 0.5), p95Ms: pct(cand, 0.95), gapP95Ms: pct(candGaps, 0.95) },
  };
  const limit = +(res.reference.p95Ms * (1 + CFG.maxGrowth)).toFixed(2);
  const absolute = res.reference.p95Ms <= CFG.p95MaxMs;
  const line = JSON.stringify({ label: process.env.FRAMETIME_LABEL || 'run', ...res, relativeLimitMs: limit, absoluteGate: absolute });
  console.log('FRAMETIME ' + line);
  info.annotations.push({ type: 'frametime', description: line });
  if (process.env.FRAMETIME_OUT) fs.appendFileSync(process.env.FRAMETIME_OUT, line + '\n');
  expect(errors).toEqual([]);
  expect(ref.length, 'enough reference frames').toBeGreaterThan(30);
  expect(cand.length, 'enough candidate frames').toBeGreaterThan(30);
  expect(res.candidate.p95Ms, `candidate p95 vs reference p95 ${res.reference.p95Ms} ms + ${CFG.maxGrowth * 100} %`).toBeLessThanOrEqual(limit);
  if (absolute) expect(res.candidate.p95Ms, `p95 <= ${CFG.p95MaxMs} ms («Κανονικά»)`).toBeLessThanOrEqual(CFG.p95MaxMs);
});
