// HUD bar labels (owner bug 2026-11-08 19:12): «100/100» and «★ Space!» / «★ ΣΟΥΠΕΡ!» were smudged. They are dark
// text (#1b1430) and hudText() drew every label inside a dark outline of at least 3 px: at 11 px the outline filled
// the gaps inside and between the digits. The outline must contrast with the fill (hudStroke) and stay thin on
// small text. Measured on the label sprite of TextCache composited over the bar colour, at DPR 1 and 2 (the game
// caps DPR at 2, so a DPR 3 device draws as 2).
import { expect, test, type Page } from '@playwright/test';

// The game's top-level script bindings, reachable from page.evaluate like `G` in the other specs.
declare const hudStroke: (fill: string, size: number) => { col: string; lw: number };
declare const hudText: (text: string, x: number, y: number, size: number, col?: string, align?: string) => void;
declare const TextCache: Map<string, { c: HTMLCanvasElement; pad: number; by: number }>;
declare let DPR: number;
declare const HUD_BAR_TEXT: { size: number; col: string };

async function load(page: Page) {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
}

/** 0..1 relative luminance of an rgb(a)/hex colour string, through the canvas parser (no own parser in the test). */
async function lum(page: Page, col: string): Promise<number> {
  return page.evaluate((c) => {
    const x = document.createElement('canvas').getContext('2d')!;
    x.fillStyle = c; x.fillRect(0, 0, 1, 1);
    const [r, g, b] = x.getImageData(0, 0, 1, 1).data;
    const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }, col);
}

test('hudStroke: a dark fill gets a light or no outline, a light fill keeps the dark one, thin at 11 px', async ({ page }) => {
  await load(page);
  expect(await page.evaluate(() => typeof hudStroke)).toBe('function');
  const dark = await page.evaluate(() => hudStroke('#1b1430', 11));
  expect(dark.lw === 0 || (await lum(page, dark.col)) > 0.5, `outline of #1b1430: ${JSON.stringify(dark)}`).toBe(true);
  expect(dark.lw).toBeLessThan(3);
  const light = await page.evaluate(() => hudStroke('#fff4dc', 11));
  expect(await lum(page, light.col)).toBeLessThan(0.05);
  expect(light.lw).toBeGreaterThan(0);
  expect(light.lw).toBeLessThan(3);
  // the width follows the size
  const big = await page.evaluate(() => hudStroke('#fff4dc', 30));
  expect(big.lw).toBeGreaterThan(light.lw);
  // short hex and rgb(a) parse too; every other HUD colour of the game is light and keeps the dark outline
  const outline = await page.evaluate(() => ['#000', 'rgba(27,20,48,.9)', '#fff', '#ffc94a', '#c9b5ff', '#c9bde6', '#ffffff']
    .map((c) => hudStroke(c, 16).col));
  expect(outline.slice(0, 2)).toEqual([dark.col, dark.col]);
  expect(outline.slice(2)).toEqual(Array(5).fill(light.col));
});

interface Legibility { ink: number; gap: number; inkPx: number; gapPx: number }

/** Draws the label through hudText as the HUD does, then compares its sprite (over the bar colour) with a fill-only
 *  glyph mask of the same text: `ink` = share of glyph pixels that show the dark fill, `gap` = share of the pixels
 *  inside the glyph box but outside the glyphs (the holes of 0, the space between digits) that are dark too. A
 *  smudged label has dark gaps. */
async function legibility(page: Page, text: string, bar: string, dpr: number): Promise<Legibility> {
  return page.evaluate(([text, bar, dpr]) => {
    // HUD_BAR_TEXT is the bar labels' size and colour; before the fix both labels were 11 px #1b1430.
    const spec = typeof HUD_BAR_TEXT === 'object' ? HUD_BAR_TEXT : { size: 11, col: '#1b1430' };
    DPR = Number(dpr); // the game's own `let DPR` (capped at 2 by resize())
    TextCache.clear();
    hudText(text, 200, 100, spec.size, spec.col, 'center');
    const s = [...TextCache.values()][0];
    const W = s.c.width, H = s.c.height;
    const comp = document.createElement('canvas'); comp.width = W; comp.height = H;
    const cx = comp.getContext('2d')!; cx.fillStyle = bar; cx.fillRect(0, 0, W, H); cx.drawImage(s.c, 0, 0);
    const m = document.createElement('canvas'); m.width = W; m.height = H;
    const mx = m.getContext('2d')!; mx.scale(Number(dpr), Number(dpr));
    mx.font = `700 ${spec.size}px Comfortaa, 'Trebuchet MS', sans-serif`; mx.fillStyle = '#000'; mx.fillText(text, s.pad, s.by);
    const P = cx.getImageData(0, 0, W, H).data, M = mx.getImageData(0, 0, W, H).data;
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (M[(y * W + x) * 4 + 3] > 0) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const dark = (i: number) => 0.2126 * P[i] + 0.7152 * P[i + 1] + 0.0722 * P[i + 2] < 80; // fill #1b1430 ≈ 22, bars ≥ 190
    let ink = 0, inkPx = 0, gap = 0, gapPx = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4, a = M[i + 3];
      if (a > 200) { inkPx++; if (dark(i)) ink++; } else if (a === 0) { gapPx++; if (dark(i)) gap++; }
    }
    return { ink: ink / inkPx, gap: gap / gapPx, inkPx, gapPx };
  }, [text, bar, dpr] as const);
}

for (const dpr of [1, 2]) {
  for (const [text, bar] of [['100/100', '#6fe3c1'], ['★ Space!', '#ffc94a'], ['★ ΣΟΥΠΕΡ!', '#ffc94a']] as const) {
    test(`bar label «${text}» is legible at DPR ${dpr}: dark glyphs, light gaps`, async ({ page }) => {
      await load(page);
      const l = await legibility(page, text, bar, dpr);
      expect(l.inkPx, 'glyph pixels measured').toBeGreaterThan(20);
      expect(l.gapPx, 'gap pixels measured').toBeGreaterThan(20);
      expect(l.ink, `share of glyph pixels with the dark fill ${JSON.stringify(l)}`).toBeGreaterThan(0.8);
      expect(l.gap, `share of gap pixels smudged dark ${JSON.stringify(l)}`).toBeLessThan(0.15);
    });
  }
}
