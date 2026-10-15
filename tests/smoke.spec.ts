// Playwright smoke (GAME-STANDARD §7) for «Κρυφές Μάχες», served under the hub's CSP (tests/hub-csp.mjs):
// title → slots → create hero → house → city, then 10 s keyboard (desktop) and 10 s touch (tablet) with
// 0 console errors and 0 CSP violations. Plus a scripted boss win against 'cat'.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** Collects everything that must stay empty: console errors, page errors, CSP violations. */
async function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return problems;
}

const mode = (page: Page) => page.evaluate(() => G.mode);

/** The whole first-run flow, by mouse or by finger. Ends in the city. */
async function toCity(page: Page, tap = false) {
  const press = async (name: string | RegExp) => {
    const b = page.getByRole('button', { name }).first();
    await expect(b).toBeVisible();
    await (tap ? b.tap() : b.click());
  };
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Κρυφές Μάχες' })).toBeVisible();
  for (const label of ['Παύση', 'Ήχος', 'Πλήρης οθόνη', 'Πίσω στα παιχνίδια']) {
    await expect(page.getByRole('button', { name: label })).toBeVisible();
  }
  await press('▶ Παίξε');
  await expect(page.getByRole('heading', { name: 'Ποιος παίζει;' })).toBeVisible();
  await press('Νέο παιχνίδι');
  await page.getByLabel('Πώς λένε τον ήρωα;').fill('Ηλέκτρα');
  await press(/Ξεκίνα την περιπέτεια/);
  await press(/Πάμε να ετοιμαστώ/);
  await expect.poll(() => mode(page)).toBe('house');
  await press(/Βγες στην πόλη/);
  await expect.poll(() => mode(page)).toBe('city');
}

/** A child keeps playing after a loss or a pause: back to the city. */
async function keepPlaying(page: Page, tap = false) {
  const m = await mode(page);
  if (m === 'city' && !(await page.evaluate(() => G.paused))) return;
  const screenBtn = page.locator('#screen:not([hidden]) button').first();
  if (await screenBtn.isVisible()) await (tap ? screenBtn.tap() : screenBtn.click());
  if ((await mode(page)) === 'house') {
    const out = page.getByRole('button', { name: /Βγες στην πόλη/ });
    await (tap ? out.tap() : out.click());
  }
}

test('GAME-STANDARD §4: one inline <script>, no eval, no inline handlers, no external URLs', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
  expect(html).toContain('<html lang="el">');
  expect(html.match(/<script\b/gi)).toHaveLength(1);
  expect(html).not.toMatch(/<script\b[^>]*\bsrc=/i);
  expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i);
  expect(html).not.toMatch(/\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*['"`]/);
  expect(html).not.toMatch(/(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i);
  expect(html).not.toMatch(/@import|fonts\.googleapis|fonts\.gstatic|cdn\./i);
  expect(html).toContain('<link rel="stylesheet" href="/static/fonts/comfortaa.css">');
  expect(html).toContain("hubPath: '/kryfes-maches'");
});

test('keyboard: title → slots → hero → house → city, then 10 s of play, 0 errors', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const problems = await watch(page);
  await toCity(page);

  const moves = ['ArrowRight', 'ArrowDown', 'KeyA', 'KeyW', 'ArrowLeft', 'KeyS', 'KeyD', 'ArrowUp'];
  const start = await page.evaluate(() => ({ x: G.hero.x, y: G.hero.y }));
  const end = Date.now() + 10_000;
  for (let i = 0; Date.now() < end; i++) {
    await keepPlaying(page);
    const key = moves[i % moves.length];
    await page.keyboard.down(key);
    await page.keyboard.press(['Digit1', 'Digit2', 'Digit3', 'Digit4'][i % 4]);
    if (i % 5 === 0) await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    await page.keyboard.up(key);
  }
  const moved = await page.evaluate((s) => Math.hypot(G.hero.x - s.x, G.hero.y - s.y), start);
  expect(moved).toBeGreaterThan(20);

  await keepPlaying(page);
  await page.keyboard.press('KeyP');
  await expect(page.getByRole('heading', { name: '⏸ Παύση' })).toBeVisible();
  await page.keyboard.press('KeyP');
  await expect.poll(() => page.evaluate(() => G.paused)).toBe(false);
  expect(problems).toEqual([]);
});

test('touch: same flow by finger, joystick + pads visible, 10 s of play, 0 errors', async ({ page }, info) => {
  test.skip(info.project.name !== 'tablet');
  const problems = await watch(page);
  await toCity(page, true);
  await expect(page.locator('#stick')).toBeVisible();
  for (const label of ['Ικανότητα 1', 'Ικανότητα 2', 'Σούπερ', 'Ασπίδα', 'Φαγητό', 'Μπες']) {
    await expect(page.getByRole('button', { name: label })).toBeVisible();
  }
  for (const b of await page.locator('#pads button').all()) {
    const box = await b.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(64); // GAME-STANDARD §3
  }

  const cdp = await page.context().newCDPSession(page);
  const stick = (await page.locator('#stick').boundingBox())!;
  const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
  const start = await page.evaluate(() => ({ x: G.hero.x, y: G.hero.y }));
  const end = Date.now() + 10_000;
  for (let i = 0; Date.now() < end; i++) {
    await keepPlaying(page, true);
    const a = i * 0.9;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: cx + Math.cos(a) * 55, y: cy + Math.sin(a) * 55, id: 1 }],
    });
    await page.waitForTimeout(400);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const pad = page.getByRole('button', { name: ['Ικανότητα 1', 'Ικανότητα 2', 'Ασπίδα'][i % 3] });
    if (await pad.isEnabled()) await pad.tap();
  }
  const moved = await page.evaluate((s) => Math.hypot(G.hero.x - s.x, G.hero.y - s.y), start);
  expect(moved).toBeGreaterThan(20);
  expect(problems).toEqual([]);
});

test('scripted boss win: the hidden cat monster counts as beaten', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const problems = await watch(page);
  await toCity(page);
  await page.evaluate(() => {
    G.hero.x = 520;
    G.hero.y = 1745;
  });
  await expect.poll(() => page.evaluate(() => !!G.fight), { timeout: 20_000 }).toBe(true);
  await page.evaluate(() => {
    G.fight.m.hp = 0.5;
  });
  // The starter weapon is melee (range 48) and the cat keeps ~190 away, so during the 4 s the hero walks to it
  // with the arrow keys, like a child would; the auto-attack then lands the last hit.
  const end = Date.now() + 4_000;
  while (Date.now() < end) {
    const d = await page.evaluate(() => (G.fight ? { x: G.fight.m.x - G.hero.x, y: G.fight.m.y - G.hero.y } : null));
    if (!d) break;
    const keys = [d.x > 10 ? 'ArrowRight' : d.x < -10 ? 'ArrowLeft' : '', d.y > 10 ? 'ArrowDown' : d.y < -10 ? 'ArrowUp' : ''].filter(Boolean);
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(150);
    for (const k of keys) await page.keyboard.up(k);
  }
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => G.S.bosses)).toContain('cat');
  expect(problems).toEqual([]);
});

// The game script declares these at top level (classic script, global lexical scope).
declare const G: any;
