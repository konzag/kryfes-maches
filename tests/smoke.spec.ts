// Playwright smoke (GAME-STANDARD §7) for «Κρυφές Μάχες», served under the hub's CSP (tests/hub-csp.mjs):
// title → slots → create hero → house → city, then 10 s keyboard (desktop) and 10 s touch (tablet) with
// 0 console errors and 0 CSP violations. Plus a scripted boss win against 'cat'.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Collects everything that must stay empty: console errors, page errors, CSP violations.
 * The only allowed console error: Chromium's own "Failed to load resource" line for a 4xx/5xx or an aborted
 * request of the hub save API (/api/...), e.g. 503 while the owner has not set the PIN. A CSP violation never
 * matches this rule.
 */
const isApiStatus = (text: string, url: string) =>
  /^Failed to load resource: (the server responded with a status of (401|404|429|503) |net::ERR_FAILED$)/.test(text) &&
  new URL(url, 'http://x').pathname.startsWith('/api/');

async function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !isApiStatus(m.text(), m.location().url || '')) problems.push(`console: ${m.text()}`);
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

const SAVE_KEY = 'game.kryfes-maches.v1';

test('level B off (hub answers 503): no PIN box, no message, saves stay on the device', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const problems = await watch(page);
  const api: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) api.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await toCity(page);
  expect(api).toContain('GET /api/profiles');
  expect(api.filter((a) => a.startsWith('PUT'))).toEqual([]);
  await expect(page.locator('#serverBox')).toHaveCount(0);
  const d = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), SAVE_KEY);
  expect(d.v).toBe(1);
  expect(d.slots[0].name).toBe('Ηλέκτρα');
  expect(d.remote ?? {}).toEqual({});
  expect(problems).toEqual([]);
});

/** In-memory fake of the hub save API (games-hub app/api/saves.py), for this slug only. */
function fakeHub(page: Page) {
  const hub = { unlocked: false, down: false, profiles: [] as { id: number; name: string }[], saves: new Map<string, any>(), puts: 0 };
  page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (hub.down) return route.abort();
    const json = (status: number, body?: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });
    if (path === '/api/unlock') {
      hub.unlocked = req.postDataJSON().pin === '2468';
      return json(hub.unlocked ? 204 : 401, hub.unlocked ? undefined : { error: { code: 'UNAUTHORIZED' } });
    }
    if (!hub.unlocked) return json(401, { error: { code: 'UNAUTHORIZED' } });
    if (path === '/api/profiles' && req.method() === 'GET') return json(200, { profiles: hub.profiles });
    if (path === '/api/profiles' && req.method() === 'POST') {
      const p = { id: hub.profiles.length + 1, name: req.postDataJSON().name };
      hub.profiles.push(p);
      return json(201, p);
    }
    const m = path.match(/^\/api\/save\/kryfes-maches\/(\d+)\/([1-3])$/);
    if (!m) return json(404, { error: { code: 'NOT_FOUND' } });
    if (req.method() === 'PUT') {
      expect(req.postData()!.length).toBeLessThan(64 * 1024);
      hub.saves.set(`${m[1]}/${m[2]}`, req.postDataJSON());
      hub.puts++;
      return json(204);
    }
    const s = hub.saves.get(`${m[1]}/${m[2]}`);
    return s ? json(200, s) : json(404, { error: { code: 'NOT_FOUND' } });
  });
  return hub;
}

test('level B: PIN → hub profile → 3 slots, save round-trip, offline save synced later', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const problems = await watch(page);
  const hub = fakeHub(page);
  await page.goto('/');
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  const pin = page.getByLabel('Οικογενειακός κωδικός (4 ψηφία)');
  await pin.fill('9999');
  await page.getByRole('button', { name: 'Άνοιγμα' }).click();
  await expect(page.locator('#serverMsg')).toHaveText('Λάθος κωδικός');
  await pin.fill('2468');
  await page.getByRole('button', { name: 'Άνοιγμα' }).click();
  await page.getByLabel('Όνομα νέου προφίλ').fill('Αριάνα');
  await page.getByRole('button', { name: 'Νέο', exact: true }).click();
  await expect(page.getByRole('button', { name: '👉 Αριάνα' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Νέο παιχνίδι' })).toHaveCount(3);

  await page.getByRole('button', { name: 'Νέο παιχνίδι' }).first().click();
  await page.getByLabel('Πώς λένε τον ήρωα;').fill('Ηλέκτρα');
  await page.getByRole('button', { name: /Ξεκίνα την περιπέτεια/ }).click();
  await expect.poll(() => hub.saves.get('1/1')?.data?.name).toBe('Ηλέκτρα');
  const put = hub.saves.get('1/1');
  expect(put).toEqual(expect.objectContaining({ schema: 1, saved_at: expect.any(Number) }));
  expect(put.data).toEqual(expect.objectContaining({ gender: 'girl', bosses: [], minis: [] }));

  // A new device (empty storage), same family: unlock, pick the profile, the hub save shows up.
  await page.evaluate((k) => localStorage.removeItem(k), SAVE_KEY);
  await page.reload();
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await page.getByRole('button', { name: 'Αριάνα' }).click();
  await expect(page.getByRole('button', { name: 'Συνέχεια' })).toHaveCount(1);
  await expect(page.locator('#screen')).toContainText('Ηλέκτρα');

  // The hub goes away: saving still works on the device (dirty), and is sent on the next visit.
  await page.getByRole('button', { name: 'Συνέχεια' }).click();
  await expect.poll(() => mode(page)).toBe('house');
  hub.down = true;
  await page.getByRole('button', { name: /Αποθήκευση/ }).click();
  const local = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), SAVE_KEY);
  expect(local.dirty).toEqual({ '1:0': true });
  hub.down = false;
  await page.reload();
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await expect.poll(() => hub.saves.get('1/1')?.saved_at).toBe(local.remote['1'][0].saved);
  await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).dirty, SAVE_KEY)).toEqual({});
  expect(problems).toEqual([]);
});

// The game script declares these at top level (classic script, global lexical scope).
declare const G: any;
