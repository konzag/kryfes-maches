// «🎨 Γραφικά: Αυτόματα / Κανονικά / Πλούσια» and the automatic fall-back of tier Β (owner decision 16/11 §2, option b).
// «Αυτόματα» (the default) draws tier Β (materials) while the device keeps up and switches to tier Α (light and shadow
// only) when the median frame stays over CONFIG.gfxSlowMs (20 ms) for gfxSlowSec (3 s), on the title screen (start) and
// while playing; that is remembered per device in `kryfes-maches.gfx.v1`. «Κανονικά» = always tier Α, «Πλούσια» = always
// tier Β. «Slow» is forced with the test-only config `fakeFrameMs` (the frame time the watch sees instead of the real
// one; window.__KM_TEST__, never a URL parameter or a storage key). The decision itself has unit tests
// (tests/unit/gfx-tier.unit.mjs); the real slow device (CPU 4x, software drawing) is tests/frametime.spec.ts.
// The pixel checks draw the ground (drawGround, the same function a frame uses) into an offscreen canvas, so they do
// not depend on the camera or on the moving life of the city.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { watch } from './lib';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const G: any, CONFIG: any;
declare function drawGround(c: CanvasRenderingContext2D, v: object, t: number): void;
const KEY = 'kryfes-maches.gfx.v1';
const SAVE_KEY = 'game.kryfes-maches.v1';
type Graphics = { a: boolean; b: boolean; pick: string; slow: boolean; tier: string };
const graphics = (page: Page) => page.evaluate(() => (window as any).__kmDebug().graphics as Graphics);
const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY);
const gfxBtn = (page: Page) => page.locator('#bGfx');

/** Opens the title with the test hook; `fakeFrameMs` = what every frame «costs» for the watch (null = real). */
async function open(page: Page, config: Record<string, unknown> = {}, opts: { keep?: boolean } = {}) {
  const errors = await watch(page); // console errors, page errors, CSP violations (the hub save API's 503 is allowed)
  await page.addInitScript(([cfg, key, keep]) => {
    (window as any).__KM_TEST__ = { config: { slowFrameMs: 1e9, forceHour: 12, ...(cfg as object) } };
    // a fresh device once per test (first load only); reloads keep what the game stored
    if (!keep && !sessionStorage.getItem('km-tier-fresh')) { sessionStorage.setItem('km-tier-fresh', '1'); localStorage.removeItem(key as string); }
  }, [config, KEY, !!opts.keep] as const);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => typeof (window as any).__kmDebug)).toBe('function');
  return errors;
}

/** First-run flow into the city. */
async function toCity(page: Page) {
  await page.evaluate((k) => localStorage.removeItem(k), SAVE_KEY);
  const b = async (n: string | RegExp) => page.getByRole('button', { name: n }).first().click();
  await b('▶ Παίξε'); await b('Νέο παιχνίδι');
  await page.getByLabel('Πώς λένε τον ήρωα;').fill('Δοκιμή');
  await b(/Ξεκίνα την περιπέτεια/); await b(/Πάμε να ετοιμαστώ/); await b(/Βγες στην πόλη/);
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
}

/** The ground of the first avenue, the plaza and the park, drawn with the game's current tiers: a pixel fingerprint. */
const groundPixels = (page: Page) => page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 475; c.height = 200;
  const x = c.getContext('2d', { willReadFrequently: true })!; x.setTransform(0.25, 0, 0, 0.25, -50, -225);
  drawGround(x, { x0: 200, y0: 900, x1: 2100, y1: 1700 }, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data; let h = 0;
  for (let i = 0; i < d.length; i++) h = (Math.imul(h, 31) + d[i]) | 0;
  return h;
});

test.describe('«🎨 Γραφικά» and the automatic fall-back of tier Β', () => {
  test('fast device: «Αυτόματα» keeps tier Β, stores nothing and draws exactly what «Πλούσια» draws', async ({ page }) => {
    const errors = await open(page, { fakeFrameMs: 8 });
    await expect(gfxBtn(page)).toHaveText('🎨 Γραφικά: Αυτόματα (Πλούσια)');
    await page.waitForTimeout(4000); // more than 3 s of (fast) frames on the title
    expect(await graphics(page)).toMatchObject({ a: true, b: true, pick: 'auto', slow: false, tier: 'b' });
    expect(await stored(page)).toBeNull();
    const auto = await groundPixels(page);
    const p2 = await page.context().newPage();
    const e2 = await open(p2, { fakeFrameMs: 8 }, { keep: true });
    await gfxBtn(p2).click(); await gfxBtn(p2).click(); // Αυτόματα -> Κανονικά -> Πλούσια
    await expect(gfxBtn(p2)).toHaveText('🎨 Γραφικά: Πλούσια');
    expect(await groundPixels(p2), 'no visual change on the fast path').toBe(auto);
    expect([...errors, ...e2]).toEqual([]);
  });

  test('slow device at the start: tier Α after 3 s, remembered after a reload even when frames are fast again', async ({ page }) => {
    const errors = await open(page, { fakeFrameMs: 40 });
    expect((await graphics(page)).b, 'tier Β at first').toBe(true);
    await expect.poll(async () => (await graphics(page)).b, { timeout: 15_000 }).toBe(false);
    expect(await graphics(page)).toMatchObject({ a: true, b: false, pick: 'auto', slow: true, tier: 'a' });
    await expect(gfxBtn(page)).toHaveText('🎨 Γραφικά: Αυτόματα (Κανονικά)');
    expect(JSON.parse((await stored(page))!)).toEqual({ pick: 'auto', slow: true });
    const fellBack = await groundPixels(page);
    await page.evaluate(() => { CONFIG.fakeFrameMs = 8; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => typeof (window as any).__kmDebug)).toBe('function');
    await page.waitForTimeout(1000);
    expect(await graphics(page)).toMatchObject({ b: false, slow: true, tier: 'a' });
    // the fall-back draws what «Κανονικά» draws
    await gfxBtn(page).click();
    await expect(gfxBtn(page)).toHaveText('🎨 Γραφικά: Κανονικά');
    expect(await groundPixels(page)).toBe(fellBack);
    expect(errors).toEqual([]);
  });

  test('while playing: slow frames in the city switch to tier Α; paused time does not count', async ({ page }) => {
    const errors = await open(page, { fakeFrameMs: 8 });
    await toCity(page);
    await page.getByRole('button', { name: 'Παύση' }).click();
    await expect(page.getByRole('heading', { name: '⏸ Παύση' })).toBeVisible();
    await expect(gfxBtn(page)).toHaveText('🎨 Γραφικά: Αυτόματα (Πλούσια)');
    await page.evaluate(() => { CONFIG.fakeFrameMs = 40; });
    await page.waitForTimeout(4500); // paused: not measured
    expect((await graphics(page)).b, 'no switch while paused').toBe(true);
    await page.getByRole('button', { name: '▶ Συνέχεια' }).click();
    await expect.poll(async () => (await graphics(page)).b, { timeout: 15_000 }).toBe(false);
    expect(await page.evaluate(() => G.mode)).toBe('city');
    expect(JSON.parse((await stored(page))!)).toEqual({ pick: 'auto', slow: true });
    expect(errors).toEqual([]);
  });

  test('the player decides: «Πλούσια» stays on a slow device, «Κανονικά» stays on a fast one, «Αυτόματα» measures again', async ({ page }) => {
    const errors = await open(page, { fakeFrameMs: 40 });
    await gfxBtn(page).click(); // Κανονικά
    expect(JSON.parse((await stored(page))!)).toEqual({ pick: 'normal', slow: false });
    expect(await graphics(page)).toMatchObject({ b: false, tier: 'a' });
    await gfxBtn(page).click(); // Πλούσια
    await expect(gfxBtn(page)).toHaveText('🎨 Γραφικά: Πλούσια');
    await page.waitForTimeout(4500);
    expect(await graphics(page), 'a forced choice is never overruled').toMatchObject({ b: true, pick: 'rich', slow: false, tier: 'b' });
    await page.reload();
    await expect(gfxBtn(page)).toHaveText('🎨 Γραφικά: Πλούσια');
    await gfxBtn(page).click(); // Αυτόματα: measures again (slow -> falls back)
    await expect(gfxBtn(page)).toHaveText('🎨 Γραφικά: Αυτόματα (Πλούσια)');
    await expect.poll(async () => (await graphics(page)).slow, { timeout: 15_000 }).toBe(true);
    await expect(gfxBtn(page)).toHaveText('🎨 Γραφικά: Αυτόματα (Κανονικά)');
    // choosing «Αυτόματα» again forgets the old measurement: fast frames keep tier Β now
    await page.evaluate(() => { CONFIG.fakeFrameMs = 8; });
    for (let i = 0; i < 3; i++) await gfxBtn(page).click(); // Κανονικά -> Πλούσια -> Αυτόματα
    expect(await graphics(page)).toMatchObject({ b: true, pick: 'auto', slow: false });
    expect(JSON.parse((await stored(page))!)).toEqual({ pick: 'auto', slow: false });
    const box = await gfxBtn(page).boundingBox();
    expect(box!.height, 'touch target').toBeGreaterThanOrEqual(44);
    expect(errors).toEqual([]);
  });

  test('English labels and axe on the title card', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('games.lang', 'en'); } catch { /* none */ } });
    const errors = await open(page, { fakeFrameMs: 8 });
    await expect(gfxBtn(page)).toHaveText('🎨 Graphics: Auto (Rich)');
    await gfxBtn(page).click(); await expect(gfxBtn(page)).toHaveText('🎨 Graphics: Normal');
    await gfxBtn(page).click(); await expect(gfxBtn(page)).toHaveText('🎨 Graphics: Rich');
    const axe = await new AxeBuilder({ page }).include('#screen').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a storage that throws: the fall-back still works for this visit, 0 errors', async ({ page }) => {
    await page.addInitScript(() => {
      const no = () => { throw new DOMException('blocked', 'SecurityError'); };
      for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const) Storage.prototype[m] = no as never;
    });
    const errors = await open(page, { fakeFrameMs: 40 }, { keep: true });
    await expect.poll(async () => (await graphics(page)).b, { timeout: 15_000 }).toBe(false);
    await gfxBtn(page).click();
    await expect(gfxBtn(page)).toHaveText('🎨 Γραφικά: Κανονικά');
    expect(errors).toEqual([]);
  });
});
