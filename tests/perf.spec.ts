// Frame budget, before vs after (G1-GFX-2026-10-22). Not part of CI: runs only with PERF=1 (numbers depend on the
// machine, so they are compared on the same machine, old code vs new code):
//   PERF=1 npx playwright test tests/perf.spec.ts --project=tablet
// PERF_WARM=<ms> walks that long first (the storybook sprite caches filled), to compare the steady state too.
// The test-only hook wraps requestAnimationFrame from an init script, so it measures the old and the new index.html
// the same way: script time per frame (update + draw calls) and frames per second, with the CPU slowed down 4x
// (a mid tablet), at 1180x820 and pixel ratio 2.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

declare const G: any;
declare const CONFIG: any;
declare function startFight(m: unknown): void;

async function measure(page: Page, ms: number, keys: string[]) {
  await page.evaluate(() => { const P = (window as any).__perf; P.list = []; P.frames = 0; P.on = true; P.t0 = performance.now(); });
  const end = Date.now() + ms;
  let i = 0;
  while (Date.now() < end) {
    const k = keys[i++ % keys.length];
    await page.keyboard.down(k); await page.waitForTimeout(450); await page.keyboard.up(k);
  }
  return page.evaluate(() => {
    const P = (window as any).__perf; P.on = false;
    const l = P.list.slice().sort((a: number, b: number) => a - b), n = l.length;
    const mean = l.reduce((a: number, b: number) => a + b, 0) / n;
    return { frames: n, fps: +(n / ((performance.now() - P.t0) / 1000)).toFixed(1), meanMs: +mean.toFixed(2), p95Ms: +l[Math.floor(n * .95)].toFixed(2) };
  });
}

test('frame budget (informative)', async ({ page }, info) => {
  test.skip(!process.env.PERF || info.project.name !== 'tablet', 'only with PERF=1, tablet project');
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    (window as any).__KM_TEST__ = { config: { forceHour: 12, slowFrameMs: 1e9 } };
    const raf = window.requestAnimationFrame.bind(window), P = { on: false, list: [] as number[], frames: 0, t0: 0 };
    (window as any).__perf = P;
    window.requestAnimationFrame = (cb) => raf((ts) => { const t0 = performance.now(); try { cb(ts); } finally { if (P.on) P.list.push(performance.now() - t0); } });
  });
  await page.goto('/');
  const b = async (n: string | RegExp) => page.getByRole('button', { name: n }).first().click();
  await b('▶ Παίξε'); await b('Νέο παιχνίδι');
  await page.getByLabel('Πώς λένε τον ήρωα;').fill('Δοκιμή');
  await b(/Ξεκίνα την περιπέτεια/); await b(/Πάμε να ετοιμαστώ/); await b(/Βγες στην πόλη/);
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
  const cdp = await page.context().newCDPSession(page);
  const loop = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  const out: Record<string, unknown> = {};
  // rate 1: frames per second as this machine draws them; rate 4: the CPU slowed down like a mid tablet
  for (const rate of [1, 4]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.evaluate(() => { CONFIG.forceHour = 12; G.hero.x = 1200; G.hero.y = 1000; G.hero.hp = G.hero.max = 1e9; });
    await page.waitForTimeout(1000);
    if (rate === 1 && process.env.PERF_WARM) await measure(page, Number(process.env.PERF_WARM), loop); // optional warm-up walk (sprite caches filled)
    out[`day@${rate}x`] = await measure(page, 8000, loop);
    await page.evaluate(() => { CONFIG.forceHour = 22; G.hero.x = 1060; G.hero.y = 1300; });
    await page.waitForTimeout(1000);
    out[`night@${rate}x`] = await measure(page, 8000, loop);
    await page.evaluate(() => { CONFIG.forceHour = 15; const m = G.monsters.find((x: any) => x.group && x.hidden); G.hero.x = m.x; G.hero.y = m.y + 60; startFight(m); });
    await page.waitForTimeout(1000);
    out[`fight@${rate}x`] = await measure(page, 6000, ['Digit1', 'ArrowLeft', 'Digit2', 'ArrowRight']);
    await page.evaluate(() => { if (G.fight) G.fight.enemies.forEach((e: any) => { e.dead = true; }); G.fight = null; G.cine = null; });
  }
  const line = JSON.stringify({ label: process.env.PERF_LABEL || 'run', ...out });
  console.log('PERF ' + line);
  if (process.env.PERF_OUT) fs.appendFileSync(process.env.PERF_OUT, line + '\n');
});
