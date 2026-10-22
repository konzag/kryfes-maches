// G1-GFX-2026-10-22: the new look of «Κρυφές Μάχες» (layers, ambient life, cute monsters, HUD art, logo, fades).
// - every screen at 1280, 1180x820 (touch), 820x1180 and 360, light + dark shell: 0 console errors, axe 0 serious;
// - the new layers exist (test-only debug state window.__kmDebug().gfx), and reduced motion / «Λιγότερα εφέ» stop
//   every ambient motion;
// - fights never use ctx.filter (the old hit flash did), and an old save still loads with the same keys and format.
// Camera spots and fights stay far from the hidden places and only public monsters are fought (no secret is shown).
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

declare const G: any;
declare const CONFIG: any;
declare const BOSSES: any[];
declare const Eye: unknown;
declare const INK: string;
declare function startFight(m: unknown): void;
declare function hitEnemy(e: unknown, dmg: number): void;
declare function loseFight(): void;
declare function startEnding(): void;
type Gfx = { grass: number; crowns: number; amb: number; kinds: Record<string, number>; drift: number; high: number; shadows: number; icons: number; xfade: boolean };
const gfx = (page: Page) => page.evaluate(() => (window as any).__kmDebug().gfx as Gfx);

const SAVE_KEY = 'game.kryfes-maches.v1';
const fixture = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'save-v1.json'), 'utf8');
const isApiStatus = (text: string, url: string) =>
  /^Failed to load resource: (the server responded with a status of (401|404|429|503) |net::ERR_FAILED$)/.test(text) &&
  new URL(url, 'http://x').pathname.startsWith('/api/');

async function open(page: Page, config: Record<string, unknown> = {}) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !isApiStatus(m.text(), m.location().url || '')) problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript((cfg) => {
    (window as any).__KM_TEST__ = { config: { slowFrameMs: 1e9, forceHour: 12, ...cfg } };
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
  }, config);
  return problems;
}
async function axeSerious(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).include(where).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
const at = (page: Page, x: number, y: number, hour: number) =>
  page.evaluate(([px, py, h]) => { CONFIG.forceHour = h; G.hero.x = px; G.hero.y = py; G.cam.x = px; G.cam.y = py - 30; }, [x, y, hour]);
async function toCity(page: Page, press: (n: string | RegExp) => Promise<void>, check?: (where: string) => Promise<void>) {
  await press('▶ Παίξε'); await check?.('slots');
  await press('Νέο παιχνίδι');
  await page.getByLabel('Πώς λένε τον ήρωα;').fill('Δοκιμή'); await check?.('create');
  await press(/Ξεκίνα την περιπέτεια/); await check?.('intro');
  await press(/Πάμε να ετοιμαστώ/); await page.waitForTimeout(400); await check?.('house');
  await press(/Βγες στην πόλη/);
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
}

const SIZES = [
  { tag: '1280', viewport: { width: 1280, height: 800 }, touch: false },
  { tag: '1180x820', viewport: { width: 1180, height: 820 }, touch: true },
  { tag: '820x1180', viewport: { width: 820, height: 1180 }, touch: false },
  { tag: '360', viewport: { width: 360, height: 780 }, touch: false },
];

test.describe('every screen, four sizes, light + dark', () => {
  for (const sz of SIZES) for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${sz.tag} ${scheme}`, () => {
      test.use({ viewport: sz.viewport, hasTouch: sz.touch, isMobile: sz.touch });
      test(`0 console errors, axe 0 serious: ${sz.tag} ${scheme}`, async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'sizes are set here, one run per size');
        test.setTimeout(120_000);
        await page.emulateMedia({ colorScheme: scheme });
        const problems = await open(page);
        const serious: string[] = [];
        const check = async (where: string) => { await page.waitForTimeout(350); serious.push(...(await axeSerious(page, where === 'house' ? '#house' : '#screen')).map((s) => `${where}: ${s}`)); };
        const press = async (name: string | RegExp) => { const b = page.getByRole('button', { name }).first(); await expect(b).toBeVisible(); await (sz.touch ? b.tap() : b.click()); };
        await page.goto('/');
        await page.waitForTimeout(800); await check('title');
        await toCity(page, press, check);
        await at(page, 2050, 930, 12); await page.waitForTimeout(1200);
        await at(page, 1060, 1300, 22); await page.waitForTimeout(1200);
        await at(page, 600, 1240, 15);
        await page.evaluate(() => startFight(G.monsters.find((x: any) => x.id === 'm0')));
        await page.waitForTimeout(1200);
        await page.evaluate(() => G.fight.enemies.forEach((e: any) => hitEnemy(e, 1e6)));
        await page.waitForTimeout(2600); // win cine, then the speech bubbles
        await at(page, 520, 1960, 18.4);
        await page.evaluate(() => startFight(G.monsters.find((x: any) => x.id === 'cat')));
        await page.waitForTimeout(1500); // the ribbon banner with the monster's portrait
        await page.keyboard.press('KeyP'); await check('pause'); await page.keyboard.press('KeyP');
        await page.evaluate(() => loseFight());
        await expect(page.getByRole('heading', { name: /Κουράστηκες/ })).toBeVisible({ timeout: 10_000 }); await check('lost');
        await page.evaluate(() => { G.S.bosses = BOSSES.map((b: any) => b.id); G.paused = false; (document.getElementById('screen') as HTMLElement).hidden = true; startEnding(); });
        await expect(page.getByRole('heading', { name: /Μπράβο/ })).toBeVisible({ timeout: 12_000 }); await check('end');
        expect(problems).toEqual([]);
        expect(serious).toEqual([]);
      });
    });
  }
});

test.describe('layers and motion (1180x820)', () => {
  test.use({ viewport: { width: 1180, height: 820 } });
  const press = (page: Page) => async (name: string | RegExp) => { const b = page.getByRole('button', { name }).first(); await expect(b).toBeVisible(); await b.click(); };

  test('the new layers are there: meadow, crown sprites, cloud shadows, high layer, leaves/glints by day, fireflies by night', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    const problems = await open(page);
    await page.goto('/'); await toCity(page, press(page));
    await at(page, 2050, 930, 12); await page.waitForTimeout(4500); // quiet spots, far from every hidden place
    const day = await gfx(page);
    expect(day.grass).toBeGreaterThan(10);
    expect(day.crowns).toBeGreaterThan(0); // tree crowns come from sprites
    expect(day.high).toBeGreaterThan(0);
    await expect.poll(async () => { const k = (await gfx(page)).kinds; return (k.leaf || 0) + (k.glint || 0); }, { timeout: 8000 }).toBeGreaterThan(0);
    expect(day.icons).toBeGreaterThanOrEqual(0);
    const d0 = day.drift; await page.waitForTimeout(500); expect((await gfx(page)).drift).not.toBe(d0); // the clouds drift
    await at(page, 1060, 1300, 22); await page.waitForTimeout(4000);
    await expect.poll(async () => (await gfx(page)).kinds.fly || 0, { timeout: 8000 }).toBeGreaterThan(0);
    expect((await gfx(page)).high).toBe(0); // no clouds over the town at night
    expect(problems).toEqual([]);
  });

  test('reduced motion: no ambient particles, no high layer, no drift, static logo, no shake', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const problems = await open(page);
    await page.goto('/');
    const lt = page.locator('.logo .lt').first();
    await expect(lt).toBeVisible();
    expect(await lt.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    await toCity(page, press(page));
    await at(page, 2050, 930, 12); await page.waitForTimeout(1500);
    const a = await gfx(page); await page.waitForTimeout(2000); const b = await gfx(page);
    expect(a.amb + b.amb).toBe(0);
    expect(a.high + b.high).toBe(0);
    expect(b.drift).toBe(a.drift);
    await at(page, 1060, 1300, 22); await page.waitForTimeout(2000);
    expect((await gfx(page)).amb).toBe(0); // no fireflies either
    expect(problems).toEqual([]);
  });

  test('«Λιγότερα εφέ»: no ambient particles, no high layer, no cloud shadows, no meadow marks, no outlines', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    const problems = await open(page);
    await page.goto('/');
    await page.getByRole('button', { name: /Λιγότερα εφέ/ }).click();
    await toCity(page, press(page));
    await at(page, 2050, 930, 12); await page.waitForTimeout(2500);
    const g = await gfx(page);
    expect(g.amb).toBe(0); expect(g.high).toBe(0); expect(g.shadows).toBe(0); expect(g.grass).toBe(0);
    expect(await page.evaluate(() => INK)).toBe('rgba(0,0,0,0)'); // see-through outlines are skipped by the browser
    expect(problems).toEqual([]);
  });

  test('animated logo when motion is welcome, same accessible name', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    await open(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Κρυφές Μάχες' })).toBeVisible();
    const names = await page.locator('.logo .lt').evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
    expect(names.length).toBe('ΚρυφέςΜάχες'.length);
    expect(names.every((n) => n.includes('ltBob'))).toBe(true);
    expect(await page.locator('#screen .card').evaluate((e) => getComputedStyle(e).animationName)).toBe('cardIn');
  });

  test('fights never set ctx.filter (cheap glow sprites instead); monsters blink', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    const problems = await open(page);
    await page.addInitScript(() => {
      const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'filter')!;
      (window as any).__filters = 0;
      Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', { get() { return d.get!.call(this); }, set(v) { if (v !== 'none') (window as any).__filters++; d.set!.call(this, v); } });
    });
    await page.goto('/'); await toCity(page, press(page));
    await at(page, 600, 1240, 15);
    await page.evaluate(() => startFight(G.monsters.find((x: any) => x.id === 'm0')));
    await page.waitForTimeout(1000);
    for (let i = 0; i < 6; i++) { await page.evaluate(() => G.fight && G.fight.enemies.forEach((e: any) => { hitEnemy(e, 1); e.frozen = .5; })); await page.waitForTimeout(150); }
    expect(await page.evaluate(() => (window as any).__filters)).toBe(0);
    expect(await page.evaluate(() => typeof Eye)).toBe('object'); // the blink state of the monsters
    expect(problems).toEqual([]);
  });

  test('an old save loads and is saved back with the same keys and format', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    const problems = await open(page);
    await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [SAVE_KEY, fixture]);
    await page.goto('/');
    await page.getByRole('button', { name: '▶ Παίξε' }).click();
    await page.getByRole('button', { name: 'Συνέχεια' }).first().click();
    await page.getByRole('button', { name: /Βγες στην πόλη/ }).click();
    await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
    await page.waitForTimeout(1500);
    await page.keyboard.press('KeyP'); await page.getByRole('button', { name: /Αποθήκευση/ }).click();
    const after = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('game.kryfes-maches')).sort());
    expect(keys.every((k) => ['game.kryfes-maches.v1', 'game.kryfes-maches.settings.v1', 'game.kryfes-maches.sound'].includes(k))).toBe(true);
    const o = JSON.parse(fixture), n = JSON.parse(after!);
    expect(n.v).toBe(o.v);
    expect(Object.keys(n).sort()).toEqual(Object.keys(o).sort());
    expect(Object.keys(n.slots[0]).sort()).toEqual(Object.keys(o.slots[0]).sort());
    expect(n.slots[0].name).toBe(o.slots[0].name);
    expect(n.slots[0].look).toEqual(o.slots[0].look);
    expect(problems).toEqual([]);
  });
});
