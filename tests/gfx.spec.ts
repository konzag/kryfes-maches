// GAMES-KM-GFX-01: neon-80s city, day/night by itself, light + dark shell, «Λιγότερα εφέ», comic words.
// Runs at 1280 (desktop, keyboard), 1180x820 (tablet, touch), 820x1180 and 360 (portrait windows, keyboard).
// Day and night are forced through the test-only hook window.__KM_TEST__ (never a URL parameter); the six places
// that glow are checked through the debug state window.__kmDebug(), not through pixels.
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

declare const G: any;
declare function hitEnemy(e: unknown, dmg: number): void;
declare const CONFIG: unknown;
type Debug = {
  hour: number; dark: number; neon: number; theme: string; lowFx: boolean; fx: number; frameMs: number; frames: number;
  lamps: number; places: { name: string; cue: string; level: number }[];
};
const dbg = (page: Page) => page.evaluate(() => (window as any).__kmDebug() as Debug);

const SAVE_KEY = 'game.kryfes-maches.v1';
const SETTINGS_KEY = 'game.kryfes-maches.settings.v1';
const SIX = ['Κάστρο', 'Νησάκι', 'Πλατεία με σιντριβάνι', 'Σούπερ μάρκετ', 'Το σπίτι μας', 'Η βάρκα'];
const fixture = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'save-v1.json'), 'utf8');

/** Same rule as smoke.spec.ts: only Chromium's line for a 4xx/5xx of the hub save API is allowed. */
const isApiStatus = (text: string, url: string) =>
  /^Failed to load resource: (the server responded with a status of (401|404|429|503) |net::ERR_FAILED$)/.test(text) &&
  new URL(url, 'http://x').pathname.startsWith('/api/');

/** Test hook + error watch. `config` overrides CONFIG; slow-frame auto switch off unless a test asks for it. */
async function open(page: Page, config: Record<string, unknown> = {}) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !isApiStatus(m.text(), m.location().url || '')) problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript((cfg) => {
    (window as any).__KM_TEST__ = { config: { slowFrameMs: 1e9, ...cfg } };
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
  }, config);
  return problems;
}

const isTouch = (name: string) => name === 'tablet';

/** Title → new game (TEST hero) → house → city. */
async function toCity(page: Page, tap: boolean) {
  const press = async (name: string | RegExp) => {
    const b = page.getByRole('button', { name }).first();
    await expect(b).toBeVisible();
    await (tap ? b.tap() : b.click());
  };
  await page.goto('/');
  await press('▶ Παίξε');
  await press('Νέο παιχνίδι');
  await page.getByLabel('Πώς λένε τον ήρωα;').fill('Δοκιμή');
  await press(/Ξεκίνα την περιπέτεια/);
  await press(/Πάμε να ετοιμαστώ/);
  await press(/Βγες στην πόλη/);
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
}

async function keepPlaying(page: Page, tap: boolean) {
  if ((await page.evaluate(() => G.mode)) === 'city' && !(await page.evaluate(() => G.paused))) return;
  const b = page.locator('#screen:not([hidden]) button').first();
  if (await b.isVisible()) await (tap ? b.tap() : b.click());
  if ((await page.evaluate(() => G.mode)) === 'house') {
    const out = page.getByRole('button', { name: /Βγες στην πόλη/ });
    await (tap ? out.tap() : out.click());
  }
}

/** 10 s of play: joystick + pads by finger on the tablet, arrows + 1-4 + Space elsewhere. */
async function play10s(page: Page, tap: boolean) {
  const start = await page.evaluate(() => ({ x: G.hero.x, y: G.hero.y }));
  const end = Date.now() + 10_000;
  if (tap) {
    const cdp = await page.context().newCDPSession(page);
    const s = (await page.locator('#stick').boundingBox())!;
    const cx = s.x + s.width / 2, cy = s.y + s.height / 2;
    for (let i = 0; Date.now() < end; i++) {
      await keepPlaying(page, true);
      const a = i * 0.9;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + Math.cos(a) * 55, y: cy + Math.sin(a) * 55, id: 1 }] });
      await page.waitForTimeout(400);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const pad = page.getByRole('button', { name: ['Ικανότητα 1', 'Ικανότητα 2', 'Ασπίδα'][i % 3] });
      if (await pad.isEnabled()) await pad.tap();
    }
  } else {
    const moves = ['ArrowRight', 'ArrowDown', 'KeyA', 'KeyW', 'ArrowLeft', 'KeyS', 'KeyD', 'ArrowUp'];
    for (let i = 0; Date.now() < end; i++) {
      await keepPlaying(page, false);
      const key = moves[i % moves.length];
      await page.keyboard.down(key);
      await page.keyboard.press(['Digit1', 'Digit2', 'Digit3', 'Digit4'][i % 4]);
      if (i % 5 === 0) await page.keyboard.press('Space');
      await page.waitForTimeout(400);
      await page.keyboard.up(key);
    }
  }
  const moved = await page.evaluate((p) => Math.hypot(G.hero.x - p.x, G.hero.y - p.y), start);
  expect(moved).toBeGreaterThan(20);
}

async function axeClean(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).include(where).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

const PLAY_PROJECTS = ['desktop', 'tablet', 'tablet-portrait', 'narrow-portrait'];

for (const run of [
  { name: 'light shell, forced day, effects on', scheme: 'light', hour: 12, lowFx: false },
  { name: 'dark shell, forced night, «Λιγότερα εφέ» on', scheme: 'dark', hour: 22, lowFx: true },
] as const) {
  test(`10 s of play: ${run.name}; 0 errors, axe clean on title + pause`, async ({ page }, info) => {
    test.skip(!PLAY_PROJECTS.includes(info.project.name));
    const tap = isTouch(info.project.name);
    await page.emulateMedia({ colorScheme: run.scheme });
    if (run.lowFx) await page.addInitScript(([k]) => localStorage.setItem(k, JSON.stringify({ theme: 'auto', lowFx: true })), [SETTINGS_KEY]);
    const problems = await open(page, { forceHour: run.hour });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', run.scheme);
    await expect(page.locator('#bTheme')).toHaveText(/Θέμα: αυτόματο/);
    await expect(page.locator('#bLowFx')).toHaveAttribute('aria-pressed', String(run.lowFx));
    await axeClean(page, '#screen');
    await toCity(page, tap);
    const d = await dbg(page);
    expect(d.hour).toBe(run.hour);
    expect(d.lowFx).toBe(run.lowFx);
    await play10s(page, tap);
    await keepPlaying(page, tap);
    await page.getByRole('button', { name: 'Παύση' }).click();
    await expect(page.getByRole('heading', { name: '⏸ Παύση' })).toBeVisible();
    await expect(page.locator('#bLowFx')).toBeVisible();
    await axeClean(page, '#screen');
    expect(problems).toEqual([]);
  });
}

test('night check: at forced night the six places of the kids\' list are lit, each with its own shape cue', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await open(page, { forceHour: 22 });
  await toCity(page, false);
  const night = await dbg(page);
  expect(night.places.map((p) => p.name)).toEqual(SIX);
  for (const p of night.places) expect(p.level, p.name).toBe(1);
  expect(new Set(night.places.map((p) => p.cue)).size).toBe(6); // shape + colour, not colour only (GAME-STANDARD §6)
  expect(night.dark).toBe(1);
  expect(night.lamps).toBeGreaterThan(20);
});

test('forced day: nothing glows; the clock runs by itself, one game day ≈ 300 s', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await open(page, { forceHour: 12 });
  await toCity(page, false);
  const day = await dbg(page);
  for (const p of day.places) expect(p.level, p.name).toBe(0);
  expect(day.dark).toBe(0);
  // without a forced hour the hour moves 24 h per CONFIG.dayLengthSec of play (here 6 s: 4 game hours per second)
  const page2 = await page.context().newPage();
  await open(page2, { dayLengthSec: 6, dayStartHour: 9.5 });
  await toCity(page2, false);
  const h0 = (await dbg(page2)).hour;
  await page2.waitForTimeout(1500);
  const h1 = (await dbg(page2)).hour;
  expect((h1 - h0 + 24) % 24).toBeGreaterThan(2);
  expect(await page.evaluate(() => (CONFIG as { dayLengthSec: number }).dayLengthSec)).toBe(300); // the real game: 5 min
});

test('theme toggle: auto → light → dark, remembered after reload, in its own key (saves untouched)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.emulateMedia({ colorScheme: 'light' });
  const problems = await open(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('#bTheme').click();
  await expect(page.locator('#bTheme')).toHaveText(/Θέμα: φωτεινό/);
  await page.locator('#bTheme').click();
  await expect(page.locator('#bTheme')).toHaveText(/Θέμα: σκοτεινό/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#bTheme')).toHaveText(/Θέμα: σκοτεινό/);
  const stored = await page.evaluate(([s, k]) => [localStorage.getItem(s), localStorage.getItem(k)], [SETTINGS_KEY, SAVE_KEY]);
  expect(JSON.parse(stored[0]!)).toEqual(expect.objectContaining({ theme: 'dark', lowFx: false }));
  expect(stored[1]).toBeNull(); // the theme never touches the save key
  expect(problems).toEqual([]);
});

test('«Λιγότερα εφέ»: switch in pause, remembered; switches on by itself once when frames stay slow', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const problems = await open(page, { slowFrameMs: 0, slowFrameSec: 1 }); // every frame counts as slow
  await toCity(page, false);
  await expect.poll(async () => (await dbg(page)).lowFx, { timeout: 8000 }).toBe(true);
  expect(await page.evaluate(() => G.toasts.map((t: { text: string }) => t.text).join(' | '))).toContain('Λιγότερα εφέ');
  // the player turns it off in pause: it stays off (the automatic switch happens only once)
  await page.keyboard.press('KeyP');
  await expect(page.locator('#bLowFx')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#bLowFx').click();
  await expect(page.locator('#bLowFx')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(2500);
  expect((await dbg(page)).lowFx).toBe(false);
  const s = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), SETTINGS_KEY);
  expect(s).toEqual(expect.objectContaining({ lowFx: false, autoLowFx: true }));
  expect(problems).toEqual([]);
});

test('save written by today\'s main (fixture) loads unchanged and keeps its format after playing', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const problems = await open(page);
  await page.goto('/');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, fixture]);
  await page.reload();
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await expect(page.locator('#screen')).toContainText('Τέρατα 2/5 · Μάχες 4/20');
  await page.getByRole('button', { name: 'Συνέχεια' }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('house');
  await page.getByRole('button', { name: /Βγες στην πόλη/ }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
  await page.waitForTimeout(1000);
  await page.keyboard.press('KeyP');
  await page.getByRole('button', { name: '💾 Αποθήκευση' }).click();
  const before = JSON.parse(fixture), after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), SAVE_KEY);
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  expect(after.v).toBe(before.v);
  const a = after.slots[0], b = before.slots[0];
  expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  for (const k of ['name', 'gender', 'look', 'bosses', 'minis', 'family', 'seed', 'created', 'finished']) expect(a[k], k).toEqual(b[k]);
  expect(a.playMs).toBeGreaterThan(b.playMs);
  expect(problems).toEqual([]);
});

for (const calmMotion of [false, true]) {
  test(`big hits: sparks + a comic word, never blood; screen shake ${calmMotion ? 'off with reduced motion' : '1-3 px'}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    if (calmMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
    const problems = await open(page, { forceHour: 21 });
    await toCity(page, false);
    await page.evaluate(() => { G.hero.x = 600; G.hero.y = 1180; }); // a hidden battle of Σκιουλάκια
    await expect.poll(() => page.evaluate(() => !!G.fight), { timeout: 20_000 }).toBe(true);
    await page.evaluate(() => { G.shake = 0; hitEnemy(G.fight.enemies.find((e: any) => !e.dead), 9999); });
    const words = await page.evaluate(() => G.fx.filter((f: any) => f.kind === 'comic').map((f: any) => f.text));
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) expect(['ΜΠΑΜ!', 'ΠΟΥΦ!', 'ΖΑΠ!', 'ΚΡΑΚ!']).toContain(w);
    expect(await page.evaluate(() => G.fx.some((f: any) => f.kind === 'spark'))).toBe(true);
    const shake = await page.evaluate(() => G.shake);
    if (calmMotion) expect(shake).toBe(0); else expect(shake).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
}

test('frame time: average over 10 s at 1180x820 with effects on (informative)', async ({ page }, info) => {
  test.skip(info.project.name !== 'tablet');
  const out: string[] = [];
  for (const hour of [12, 22]) {
    const p = await page.context().newPage();
    await open(p, { forceHour: hour });
    await toCity(p, false);
    const start = (await dbg(p)).frames;
    const end = Date.now() + 10_000;
    for (let i = 0; Date.now() < end; i++) {
      const k = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'][i % 4];
      await p.keyboard.down(k); await p.waitForTimeout(500); await p.keyboard.up(k);
    }
    const d = await dbg(p);
    out.push(`hour ${hour}: ${d.frameMs.toFixed(1)} ms average over ${d.frames - start} frames`);
    await p.close();
  }
  const line = `FRAME-TIME 1180x820 effects on, headless Chromium: ${out.join('; ')}`;
  console.log(line);
  info.annotations.push({ type: 'frame-time', description: line });
});
