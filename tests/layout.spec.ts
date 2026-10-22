// GAME-STANDARD §3a layout checks ported from games-template tests/layout.spec.ts (T2, T3):
// - portrait on a touch device: the «γύρισε τη συσκευή» hint covers the screen only while playing; on the title,
//   slot and create menus it is a small strip at the bottom that taps pass through (template T3);
// - 360 px wide: the shell buttons ⏸ 🔊 ⛶ 🏠 stay inside the screen and do not overlap on the menus and while
//   playing (template T2; homelab-acceptance KM-36 checks the same on prod).
// Save key and format untouched: the fixture is only read. No secret is shown (title, slots and house only).
import { expect, test, type Page } from '@playwright/test';
import { fixtureText, seedSave, watch } from './lib';

declare const G: any;

/** Selectors whose centre point is covered by another element (empty = every one can be seen and pressed). */
async function covered(page: Page, sels: string[]) {
  return page.evaluate((list) => {
    const out: string[] = [];
    for (const sel of list) {
      const el = document.querySelector(sel);
      if (!el) { out.push(`${sel}: missing`); continue; }
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(hit === el || el.contains(hit))) out.push(`${sel}: under ${hit ? hit.id || hit.tagName : 'nothing'}`);
    }
    return out;
  }, sels);
}

const rotateBox = (page: Page) => page.locator('#rotate').boundingBox();

for (const [w, h] of [
  [820, 1180],
  [360, 740],
] as const) {
  test(`§3a portrait touch ${w}x${h}: title, slot and create menus stay readable and reachable`, async ({ page }, info) => {
    test.skip(info.project.name !== 'tablet', 'the rotate hint is shown only on a touch device');
    const problems = await watch(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await page.touchscreen.tap(3, 3); // the first touch turns the touch UI (and with it the rotate hint) on
    await expect(page.locator('#rotate')).toBeVisible();
    // On a menu the hint is a strip at the bottom, not a cover.
    const strip = (await rotateBox(page))!;
    expect(strip.height).toBeLessThan(h / 4);
    expect(strip.y + strip.height).toBeLessThanOrEqual(h + 1);
    expect(await page.locator('#rotate').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    expect(await covered(page, ['#screen .logo', '#screen .row button'])).toEqual([]);

    await page.getByRole('button', { name: '▶ Παίξε' }).tap();
    await expect(page.getByRole('heading', { name: 'Ποιος παίζει;' })).toBeVisible();
    await expect(page.locator('#rotate')).toBeVisible();
    expect(await covered(page, ['#screen h2', '#screen .slot button'])).toEqual([]);
    await page.getByRole('button', { name: 'Νέο παιχνίδι' }).first().tap();
    await expect(page.getByLabel('Πώς λένε τον ήρωα;')).toBeVisible();
    expect(await covered(page, ['#heroName'])).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test('§3a portrait touch: while playing (house) the rotate hint still covers the whole screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'tablet', 'the rotate hint is shown only on a touch device');
  const problems = await watch(page);
  await seedSave(page, fixtureText);
  await page.goto('/');
  await page.getByRole('button', { name: '▶ Παίξε' }).tap();
  await page.getByRole('button', { name: 'Συνέχεια' }).first().tap();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('house');
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator('#rotate')).toBeVisible();
  const cover = (await rotateBox(page))!;
  expect(cover.width).toBeGreaterThanOrEqual(819);
  expect(cover.height).toBeGreaterThanOrEqual(1179);
  // Back to landscape: the hint goes away and the house is shown again.
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(page.locator('#rotate')).toBeHidden();
  expect(problems).toEqual([]);
});

/** Every shell button inside the window, none overlapping the next one. */
async function shellFits(page: Page, w: number) {
  const boxes = await page.locator('#shell button').evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.id, l: r.left, r: r.right, t: r.top, b: r.bottom };
    }));
  expect(boxes.length).toBeGreaterThanOrEqual(4);
  for (const b of boxes) {
    expect(b.l, `${b.id} left`).toBeGreaterThanOrEqual(0);
    expect(b.r, `${b.id} right`).toBeLessThanOrEqual(w);
    expect(Math.min(b.r - b.l, b.b - b.t), `${b.id} size`).toBeGreaterThanOrEqual(44);
  }
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].l, `${boxes[i].id} overlaps ${boxes[i - 1].id}`).toBeGreaterThanOrEqual(boxes[i - 1].r);
}

test('§3a 360x740: the shell buttons fit on the menus and while playing', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one keyboard window is enough');
  const problems = await watch(page);
  await seedSave(page, fixtureText);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await shellFits(page, 360);
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await expect(page.getByRole('heading', { name: 'Ποιος παίζει;' })).toBeVisible();
  await shellFits(page, 360);
  await page.getByRole('button', { name: 'Συνέχεια' }).first().click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('house');
  await shellFits(page, 360);
  await page.keyboard.press('KeyP');
  await expect(page.locator('#screen')).toBeVisible();
  await shellFits(page, 360);
  expect(problems).toEqual([]);
});

for (const [w, h] of [
  [360, 740],
  [780, 360],
] as const) {
  test(`§3a ${w}x${h}: a slot screen taller than the window starts at its heading and scrolls`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one keyboard window is enough');
    const problems = await watch(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await page.getByRole('button', { name: '▶ Παίξε' }).click();
    const head = page.getByRole('heading', { name: 'Ποιος παίζει;' });
    await expect(head).toBeVisible();
    // The card is taller than the window: its top (the heading) must be on screen, not above it.
    expect((await head.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    expect(await covered(page, ['#screen h2'])).toEqual([]);
    // The last slot button is reachable by scrolling.
    const last = page.getByRole('button', { name: 'Νέο παιχνίδι' }).last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    expect(problems).toEqual([]);
  });
}
