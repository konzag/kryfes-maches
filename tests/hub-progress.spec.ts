// GAME-STANDARD v1.3 §5a: the `hub` object at the root of every slot (the slot is also the level B `data`). Only
// schema, completed, completedAt and milestones (`bosses-<n>` = n monsters beaten); games-hub reads it for its badge
// «Ολοκλήρωσες», the game never calls the hub for it. Key game.kryfes-maches.v1 and SCHEMA 1 unchanged;
// tests/fixtures/save-v1.json is only read.
import { expect, test, type Page } from '@playwright/test';
import { SAVE_KEY, fixture, readSave, watch } from './lib';

type Hub = { schema: number; completed: boolean; completedAt: string | null; milestones: string[] };
declare const G: any;
declare function hubOf(raw: unknown): Hub;
declare function enterPortal(): void;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fresh: Hub = { schema: 1, completed: false, completedAt: null, milestones: [] };

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'save logic: one project is enough'));

/** Seed `save`, continue slot 1 and walk out into the city (goCity saves). */
async function toCity(page: Page, save: unknown) {
  await page.goto('/');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify(save)]);
  await page.reload();
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await page.getByRole('button', { name: 'Συνέχεια' }).first().click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('house');
  await page.getByRole('button', { name: /Βγες στην πόλη/ }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
}
const slot0 = async (page: Page) => (await readSave(page)).slots[0];
const withSlot = (patch: Record<string, unknown>) => { const f = fixture(); Object.assign(f.slots[0], patch); return f; };

test('hubOf keeps only the four fields and cleans a malformed object', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(() => [
    hubOf(undefined),
    hubOf('str'),
    hubOf({ schema: 9, completed: 'yes', completedAt: 'tomorrow', milestones: ['bosses-1', 'Κακό', 7, 'x'.repeat(33), 'bosses-1'], name: 'Νίκος', playMs: 5 }),
    hubOf({ schema: 1, completed: true, completedAt: '2026-01-02', milestones: ['bosses-2'] }),
    hubOf({ completed: true, completedAt: 'bad' }),
    hubOf({ milestones: Array.from({ length: 60 }, (_, i) => `m-${i}`) }),
  ]);
  expect(out[0]).toEqual(fresh);
  expect(out[1]).toEqual(fresh);
  expect(out[2]).toEqual({ ...fresh, milestones: ['bosses-1'] });
  expect(out[3]).toEqual({ schema: 1, completed: true, completedAt: '2026-01-02', milestones: ['bosses-2'] });
  expect(out[4].completed).toBe(true);
  expect(out[4].completedAt).toMatch(DATE);
  expect(out[5].milestones).toHaveLength(50);
  for (const h of out) expect(Object.keys(h).sort()).toEqual(['completed', 'completedAt', 'milestones', 'schema']);
});

test('an old save without hub loads, and gets it (with the monsters it already shows) at the next save', async ({ page }) => {
  const problems = await watch(page);
  const old = fixture();
  expect(old.slots[0].hub).toBeUndefined();
  await toCity(page, old);
  const s = await slot0(page);
  expect(s.hub).toStrictEqual({ ...fresh, milestones: ['bosses-1', 'bosses-2'] });
  for (const k of ['name', 'gender', 'look', 'bosses', 'minis', 'family', 'seed', 'created', 'finished']) expect(s[k], k).toEqual(old.slots[0][k]);
  expect(problems).toEqual([]);
});

test('an old save that is already finished is marked completed on the upgrade day', async ({ page }) => {
  const problems = await watch(page);
  await toCity(page, withSlot({ finished: true }));
  const { hub } = await slot0(page);
  expect(hub.completed).toBe(true);
  expect(hub.completedAt).toMatch(DATE);
  expect(problems).toEqual([]);
});

test('the ending writes completed and the date into the slot', async ({ page }) => {
  const problems = await watch(page);
  await toCity(page, fixture());
  expect((await slot0(page)).hub.completed).toBe(false);
  await page.evaluate(() => enterPortal());
  await expect.poll(() => page.evaluate(() => G.mode), { timeout: 10_000 }).toBe('ending');
  const s = await slot0(page);
  expect(s.finished).toBe(true);
  expect(Object.keys(s.hub).sort()).toEqual(['completed', 'completedAt', 'milestones', 'schema']);
  expect(s.hub).toMatchObject({ schema: 1, completed: true });
  expect(s.hub.completedAt).toMatch(DATE);
  expect(problems).toEqual([]);
});

test('completedAt never changes after the first completion', async ({ page }) => {
  const problems = await watch(page);
  const hub: Hub = { schema: 1, completed: true, completedAt: '2026-01-02', milestones: ['bosses-1', 'bosses-2'] };
  await toCity(page, withSlot({ finished: true, hub }));
  await page.evaluate(() => enterPortal());
  await expect.poll(() => page.evaluate(() => G.mode), { timeout: 10_000 }).toBe('ending');
  expect((await slot0(page)).hub).toStrictEqual(hub);
  expect(problems).toEqual([]);
});

test('a malformed hub object in a slot is cleaned at the next save', async ({ page }) => {
  const problems = await watch(page);
  const bad = { schema: 9, completed: 'yes', completedAt: 'tomorrow', milestones: ['Bad Id', 'x'.repeat(33), 3], name: 'Νίκος' };
  await toCity(page, withSlot({ hub: bad }));
  expect((await slot0(page)).hub).toStrictEqual({ ...fresh, milestones: ['bosses-1', 'bosses-2'] });
  expect(problems).toEqual([]);
});

test('a new hero starts with an empty hub object', async ({ page }) => {
  const problems = await watch(page);
  await page.goto('/');
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await page.getByRole('button', { name: 'Νέο παιχνίδι' }).first().click();
  await page.getByLabel('Πώς λένε τον ήρωα;').fill('Ηλέκτρα');
  await page.getByRole('button', { name: /Ξεκίνα την περιπέτεια/ }).click();
  await expect(page.getByRole('heading', { name: 'Η ιστορία' })).toBeVisible();
  expect((await slot0(page)).hub).toStrictEqual(fresh);
  expect(problems).toEqual([]);
});
