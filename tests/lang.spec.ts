// EL + EN in the game shell (owner 02/11, Block 7): menus, buttons and their labels in Greek or English. The «EN» /
// «ΕΛ» button sits with the theme and «Λιγότερα εφέ» buttons on the title and pause screens; the choice lives in the
// key `games.lang`, shared with the hub and every game on the same origin. Only 'en' counts, anything else (or no
// storage) is Greek. The story stays Greek. The save key and its format never change.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { SAVE_KEY, watch } from './lib';

declare const G: any; // eslint-disable-line @typescript-eslint/no-explicit-any
const LANG_KEY = 'games.lang';
const lang = (page: Page) => page.evaluate(() => document.documentElement.lang);
const savedLang = (page: Page) => page.evaluate((k) => localStorage.getItem(k), LANG_KEY);
const press = async (page: Page, tap: boolean, name: string | RegExp) => {
  const b = page.getByRole('button', { name }).first();
  await expect(b).toBeVisible();
  await (tap ? b.tap() : b.click());
};

test('the shell is Greek by default and nothing is written', async ({ page }) => {
  const problems = await watch(page);
  await page.goto('/');
  expect(await lang(page)).toBe('el');
  await expect(page.getByRole('button', { name: '▶ Παίξε' })).toBeVisible();
  await expect(page.locator('#bLang')).toHaveText('EN');
  await expect(page.locator('#bLang')).toHaveAttribute('aria-label', 'EN English');
  await expect(page.locator('#bSound')).toHaveAttribute('aria-label', 'Ήχος');
  expect(await savedLang(page)).toBeNull();
  expect(problems).toEqual([]);
});

test('«EN» switches menus and labels to English, is remembered, «ΕΛ» switches back; the save is untouched', async ({ page }, info) => {
  const problems = await watch(page);
  const tap = info.project.name === 'tablet';
  await page.goto('/');
  const box = (await page.locator('#bLang').boundingBox())!;
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  await press(page, tap, 'EN English');
  expect(await lang(page)).toBe('en');
  expect(await savedLang(page)).toBe('en');
  await expect(page.getByRole('button', { name: '▶ Play' })).toBeVisible();
  await expect(page.locator('#bTheme')).toHaveText(/^🌗 Theme: auto$/);
  await expect(page.locator('#bLowFx')).toHaveText('✨ Fewer effects');
  await expect(page.locator('#bLang')).toHaveText('ΕΛ');
  await expect(page.locator('#bLang')).toBeFocused();
  for (const [id, label] of [['bPause', 'Pause'], ['bSound', 'Sound'], ['bFull', 'Full screen'], ['bHome', 'Back to the games'], ['pE', 'Enter']])
    await expect(page.locator('#' + id)).toHaveAttribute('aria-label', label);
  // the menus of a new game, in English, after a reload
  await page.reload();
  expect(await lang(page)).toBe('en');
  await press(page, tap, '▶ Play');
  await expect(page.getByRole('heading', { name: 'Who is playing?' })).toBeVisible();
  await press(page, tap, 'New game');
  await expect(page.getByRole('heading', { name: 'Which hero will you get ready?' })).toBeVisible();
  await page.getByLabel("What is the hero's name?").fill('Test');
  await press(page, tap, /Start the adventure/);
  await expect(page.getByRole('heading', { name: 'The story' })).toBeVisible();
  await press(page, tap, /Let's get ready/);
  await expect(page.locator('#wOut')).toHaveText('🚪 Go out to the city');
  await press(page, tap, /Go out to the city/);
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
  // pause: English, and «ΕΛ» there brings Greek back at once
  await page.keyboard.press('KeyP');
  await expect(page.getByRole('heading', { name: '⏸ Pause' })).toBeVisible();
  await press(page, tap, 'ΕΛ Ελληνικά');
  await expect(page.getByRole('heading', { name: '⏸ Παύση' })).toBeVisible();
  expect(await savedLang(page)).toBe('el');
  expect(await lang(page)).toBe('el');
  // the save: same key, the hero's name as typed, no language inside
  const raw = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  expect(raw).toContain('"Test"');
  expect(raw).not.toContain('lang');
  expect(problems).toEqual([]);
});

test('a bad stored language and a storage that throws both give Greek, no errors', async ({ page }) => {
  const problems = await watch(page);
  await page.addInitScript((k) => localStorage.setItem(k, 'fr'), LANG_KEY);
  await page.goto('/');
  expect(await lang(page)).toBe('el');
  await expect(page.getByRole('button', { name: '▶ Παίξε' })).toBeVisible();
  const p2 = await page.context().newPage();
  const problems2 = await watch(p2);
  await p2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await p2.goto('/');
  expect(await lang(p2)).toBe('el');
  await p2.locator('#bLang').click(); // works for this visit, just not remembered
  expect(await lang(p2)).toBe('en');
  expect(problems).toEqual([]);
  expect(problems2).toEqual([]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe serious/critical = 0 on the English title screen (${scheme})`, async ({ page }) => {
    const problems = await watch(page);
    await page.emulateMedia({ colorScheme: scheme });
    await page.addInitScript((k) => localStorage.setItem(k, 'en'), LANG_KEY);
    await page.goto('/');
    await expect(page.locator('#bLang')).toBeVisible();
    const r = await new AxeBuilder({ page }).include('#screen').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
    expect(problems).toEqual([]);
  });
}
