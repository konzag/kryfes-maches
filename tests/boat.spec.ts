// KM-BOAT (owner bug 2026-10-27): after the boat back from the «Νησάκι» the hero could not walk any more. The boat
// set the hero on the town dock itself (DOCK.main), and that point lies inside the lake as blocked() sees it (the
// lake ellipse widened by the hero's 12 px), so every step from there was refused. The family's workaround (pause →
// home → town) only worked because the city starts again at the house.
// Both directions, by keyboard (desktop) and by finger (tablet: «Μπες» + joystick); also from a save, and the rule
// itself: every boat landing is a point the hero can stand on.
import { expect, test, type Page } from '@playwright/test';
import { fixtureText, seedSave, watch } from './lib';

declare const G: any;
declare const DOCK: any;
declare function blocked(x: number, y: number, r: number): boolean;

const isTouch = (name: string) => name === 'tablet' || name === 'phone';

async function press(page: Page, tap: boolean, name: string | RegExp) {
  const b = page.getByRole('button', { name }).first();
  await expect(b).toBeVisible();
  await (tap ? b.tap() : b.click());
}
async function hook(page: Page) {
  await page.addInitScript(() => { (window as any).__KM_TEST__ = { config: { slowFrameMs: 1e9, forceHour: 12 } }; });
}
/** New game → house → city. */
async function newGameToCity(page: Page, tap: boolean) {
  await page.goto('/');
  await press(page, tap, '▶ Παίξε');
  await press(page, tap, 'Νέο παιχνίδι');
  await page.getByLabel('Πώς λένε τον ήρωα;').fill('Δοκιμή');
  await press(page, tap, /Ξεκίνα την περιπέτεια/);
  await press(page, tap, /Πάμε να ετοιμαστώ/);
  await press(page, tap, /Βγες στην πόλη/);
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
}
const pos = (page: Page) => page.evaluate(() => ({ x: G.hero.x, y: G.hero.y }));
/** The boat from where the hero stands (E, or «Μπες» by finger); waits for the fade to end. */
async function takeBoat(page: Page, tap: boolean, prompt: string) {
  await expect.poll(() => page.evaluate(() => G.prompt && G.prompt.text)).toBe(prompt);
  if (tap) await page.locator('#pE').tap(); else await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => !G.fade)).toBe(true);
}
/** Walk for about 1.5 s (arrow keys, or the joystick by finger) and return how far the hero got. */
async function walk(page: Page, tap: boolean) {
  const a = await pos(page);
  if (tap) {
    const cdp = await page.context().newCDPSession(page);
    const s = (await page.locator('#stick').boundingBox())!, cx = s.x + s.width / 2, cy = s.y + s.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 55, y: cy + 10, id: 1 }] });
    await page.waitForTimeout(1500);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowLeft');
  }
  const b = await pos(page);
  return Math.hypot(b.x - a.x, b.y - a.y);
}
/** Town dock → «Νησάκι» → town dock, then the hero must walk away on both sides of the lake. */
async function roundTrip(page: Page, tap: boolean) {
  await page.evaluate(() => { G.hero.x = DOCK.main.x - 32; G.hero.y = DOCK.main.y; }); // on the promenade by the dock
  await takeBoat(page, tap, 'Βάρκα για το Νησάκι');
  expect(await page.evaluate(() => !blocked(G.hero.x, G.hero.y, 12)), 'on the island').toBe(true);
  await takeBoat(page, tap, 'Βάρκα για την πόλη');
  expect(await page.evaluate(() => !blocked(G.hero.x, G.hero.y, 12)), 'back in town').toBe(true);
  expect(await walk(page, tap), 'walks away from the town dock').toBeGreaterThan(40);
}

test('boat: town → «Νησάκι» → town, then the hero walks again (keyboard and finger)', async ({ page }, info) => {
  test.skip(!['desktop', 'tablet', 'phone'].includes(info.project.name));
  const tap = isTouch(info.project.name);
  const problems = await watch(page);
  await hook(page);
  await newGameToCity(page, tap);
  await roundTrip(page, tap);
  await roundTrip(page, tap); // and once more: nothing piles up
  expect(problems).toEqual([]);
});

// A save keeps no position (the city always starts at the house), so «from a save» = load it, then sail out and back.
test('boat: from a saved game («Συνέχεια»), the trip there and back leaves the hero free to walk', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop' && info.project.name !== 'phone');
  const tap = isTouch(info.project.name);
  const problems = await watch(page);
  await hook(page);
  await seedSave(page, fixtureText);
  await page.goto('/');
  await press(page, tap, '▶ Παίξε');
  await press(page, tap, 'Συνέχεια');
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('house');
  await press(page, tap, /Βγες στην πόλη/);
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
  await roundTrip(page, tap);
  expect(problems).toEqual([]);
});

test('boat: every landing point is ground the hero can stand on', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await hook(page);
  await newGameToCity(page, false);
  const free = await page.evaluate(() => Object.keys(DOCK).map((k) => { const p = boatLanding(DOCK[k]); return [k, !blocked(p.x, p.y, 12)]; }));
  expect(free).toEqual([['main', true], ['island', true]]);
});

declare function boatLanding(p: { x: number; y: number }): { x: number; y: number };
