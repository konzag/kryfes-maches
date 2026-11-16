// GAMES-GRAPHICS (games-template docs/specs/GAMES-GRAPHICS.md), L1-26: tier Α (light and shadow) and tier Β
// (code-made materials) in the city. The tiers are on by default («Κανονικά»); the test hook config `gfx`
// ('base' = the look before, 'a' = tier Α only) switches them off only to compare. The pixel checks draw the ground
// (drawGround, the same function a frame uses) into an offscreen canvas, once with a tier off and once on, and
// compare small blocks of it, so they do not depend on the camera or on the moving life of the city.
// page.evaluate reaches the game's top-level bindings (GFX, Paint, PALETTE, drawGround) by name, as perf.spec does.
import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const GFX: any, Paint: any, PALETTE: any;
declare function drawGround(c: CanvasRenderingContext2D, v: object, t: number): void;
type Graphics = { a: boolean; b: boolean; litMood: string; texMs: number; texBuilds: number };
type Block = { r: number; g: number; b: number; lum: number; sd: number };
const graphics = (page: Page) => page.evaluate(() => (window as any).__kmDebug().graphics as Graphics);

async function open(page: Page, config: Record<string, unknown> = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((cfg) => { (window as any).__KM_TEST__ = { config: { slowFrameMs: 1e9, forceHour: 12, ...cfg } }; }, config);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => typeof (window as any).__kmDebug)).toBe('function');
  return errors;
}

/** Draws the ground of a world box with one tier off, then on (mood fixed), and measures blocks of it (world units
 * [x, y, w, h]): mean RGB, luminance and its spread (sd: how much «material» a block has). */
function ground(page: Page, tier: 'a' | 'b', mood: string, box: number[], blocks: number[][]) {
  return page.evaluate(([tier, mood, box, blocks]) => {
    const [ox, oy, bw, bh] = box as number[], k = 0.5;
    const c = document.createElement('canvas'); c.width = Math.round(bw * k); c.height = Math.round(bh * k);
    const x = c.getContext('2d', { willReadFrequently: true })!;
    const keep = { a: GFX.a, b: GFX.b, mood: Paint.mood, P: Paint.P };
    const draw = (on: boolean): Block[] => {
      GFX.a = keep.a; GFX.b = keep.b; GFX[tier as string] = on; if (tier === 'a' && !on) GFX.b = false;
      Paint.mood = mood; Paint.P = PALETTE[mood as string];
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
      x.setTransform(k, 0, 0, k, -ox * k, -oy * k);
      drawGround(x, { x0: ox, y0: oy, x1: ox + bw, y1: oy + bh }, 0);
      x.setTransform(1, 0, 0, 1, 0, 0);
      return (blocks as number[][]).map(([px, py, pw, ph]) => {
        const d = x.getImageData(Math.round((px - ox) * k), Math.round((py - oy) * k), Math.round(pw * k), Math.round(ph * k)).data;
        let r = 0, g = 0, b = 0, n = 0, sd = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        r /= n; g /= n; b /= n; const m = (r + g + b) / 3;
        for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3 - m; sd += l * l; }
        return { r, g, b, lum: m, sd: Math.sqrt(sd / n) };
      });
    };
    const out = { off: draw(false), on: draw(true) };
    GFX.a = keep.a; GFX.b = keep.b; Paint.mood = keep.mood; Paint.P = keep.P;
    return out;
  }, [tier, mood, box, blocks] as const);
}

// The lake (LAKE x 2620, y 1100, rx 520, ry 900; ISLAND x 2640, y 860, r 240) seen whole.
const LAKE_BOX = [2080, 180, 1100, 1840];
const FAR_WATER = [2330, 420, 120, 120]; // top left of the lake: the sun / moon shines here
const NEAR_SHORE = [2900, 1580, 60, 80]; // bottom right, inside the shore: the shade side
const ISLE_SHADOW = [2830, 1040, 40, 40]; // water just bottom right of the island

test.describe('GAMES-GRAPHICS tiers', () => {
  test('the tiers are on by default; the test hook switches them off only to compare', async ({ page }) => {
    const e1 = await open(page);
    expect(await graphics(page)).toMatchObject({ a: true, b: true });
    const p2 = await page.context().newPage();
    const e2 = await open(p2, { gfx: 'base' });
    expect(await graphics(p2)).toMatchObject({ a: false, b: false });
    const p3 = await page.context().newPage();
    const e3 = await open(p3, { gfx: 'a' });
    expect(await graphics(p3)).toMatchObject({ a: true, b: false });
    expect([...e1, ...e2, ...e3]).toEqual([]);
  });

  test('tier Α: the sun lights the far water, the near shore and the island\'s shadow lie in the shade', async ({ page }) => {
    const errors = await open(page, { gfx: 'a' });
    const day = await ground(page, 'a', 'day', LAKE_BOX, [FAR_WATER, NEAR_SHORE, ISLE_SHADOW]);
    expect(day.on[0].lum, 'far water brighter in the sun').toBeGreaterThan(day.off[0].lum + 8);
    expect(day.on[1].lum, 'near shore darker in the shade').toBeLessThan(day.off[1].lum - 4);
    expect(day.on[2].lum, 'the island throws a shadow on the water').toBeLessThan(day.off[2].lum - 4);
    // at sunset the light on the water is warm (more red than blue), by day it is white
    const sunset = await ground(page, 'a', 'sunset', LAKE_BOX, [FAR_WATER]);
    const warm = (b: Block) => b.r - b.b;
    expect(warm(sunset.on[0]) - warm(sunset.off[0]), 'sunset light warms the water').toBeGreaterThan(warm(day.on[0]) - warm(day.off[0]) + 6);
    // at night the moon is dimmer than the sun
    const night = await ground(page, 'a', 'night', LAKE_BOX, [FAR_WATER]);
    expect(night.on[0].lum - night.off[0].lum).toBeLessThan(day.on[0].lum - day.off[0].lum);
    expect(errors).toEqual([]);
  });

  test('tier Α: in the city the lake light follows the mood, 0 errors', async ({ page }) => {
    const errors = await open(page, { forceHour: 18.6 });
    // the title camera sweeps the city; drawing the lake once sets the light's mood
    await page.evaluate(() => { const v = { x0: 2080, y0: 180, x1: 3180, y1: 2020 }; const c = document.createElement('canvas').getContext('2d')!; drawGround(c, v, 0); });
    expect((await graphics(page)).litMood).toBe(await page.evaluate(() => Paint.mood));
    expect(errors).toEqual([]);
  });
});
