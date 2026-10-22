// Save contract (GAME-STANDARD §5, level A + B): a save the game cannot read is never replaced silently, the hub
// never wins with an older copy, tombstones and dirty slots behave, oversized saves stay on the device, blocked
// storage still plays, an erased hub slot is a tombstone PUT. Key game.kryfes-maches.v1 and SCHEMA 1 unchanged;
// tests/fixtures/save-v1.json is only read. Network: the fake hub (tests/lib.ts) or the stand-in's 503.
import { expect, test, type Page } from '@playwright/test';
import { SAVE_KEY, fakeHub, fixture, rawSave, readSave, seedSave, slotCalls, watch } from './lib';

declare const G: any;
declare const Store: any;

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'save logic: one project is enough'));

/** A copy of the fixture's slot under another name and save time. */
const slotOf = (name: string, saved: number) => ({ ...fixture().slots[0], name, saved });
/** A level-B save: device slots empty, hub profile 1 chosen, its cached slots and dirty marks as given. */
const levelB = (remote: unknown[], dirty?: Record<string, boolean>) =>
  JSON.stringify({ v: 1, slots: [null, null, null], profile: { id: 1, name: 'Αριάνα' }, remote: { '1': remote }, ...(dirty ? { dirty } : {}) });

const names = (page: Page) => page.locator('#screen .slot .nm');

/** Title → slots, then wait until the hub sync of profile 1 is over (3 GETs, or the given request count). */
async function openSlots(page: Page, done: () => boolean) {
  await page.goto('/');
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await expect(page.getByRole('heading', { name: 'Ποιος παίζει;' })).toBeVisible();
  await expect.poll(done).toBe(true);
  await page.waitForTimeout(300); // the last response is applied and the slots are drawn again
}

/** New hero in slot 1 of whatever owner the slots screen shows. */
async function newGameInSlot1(page: Page, name = 'Ηλέκτρα') {
  await page.getByRole('button', { name: 'Νέο παιχνίδι' }).first().click();
  await page.getByLabel('Πώς λένε τον ήρωα;').fill(name);
  await page.getByRole('button', { name: /Ξεκίνα την περιπέτεια/ }).click();
  await expect(page.getByRole('heading', { name: 'Η ιστορία' })).toBeVisible();
}

/** True when the raw value survives: same key unchanged, or some other storage key holds it as it was. */
const survives = (page: Page, raw: string) =>
  page.evaluate(([k, r]) => {
    if (localStorage.getItem(k) === r) return true;
    for (let i = 0; i < localStorage.length; i++) if (localStorage.getItem(localStorage.key(i)!) === r) return true;
    return false;
  }, [SAVE_KEY, raw]);

test('a corrupt save is not overwritten silently', async ({ page }) => {
  const problems = await watch(page);
  const raw = '{bad json';
  await seedSave(page, raw);
  await page.goto('/');
  expect(await rawSave(page)).toBe(raw);
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await newGameInSlot1(page);
  expect(problems).toEqual([]);
  expect(await survives(page, raw), 'the unreadable save is still in storage').toBe(true);
});

test('a future-schema save (v:2) is not wiped', async ({ page }) => {
  const problems = await watch(page);
  const raw = JSON.stringify({ ...fixture(), v: 2 });
  await seedSave(page, raw);
  await page.goto('/');
  await page.reload();
  expect(await rawSave(page)).toBe(raw);
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await newGameInSlot1(page);
  expect(problems).toEqual([]);
  expect(await survives(page, raw), 'the v:2 save is still in storage').toBe(true);
});

test('an unreadable save whose backup cannot be written stays under its own key', async ({ page }) => {
  const problems = await watch(page);
  const raw = '{bad json';
  await seedSave(page, raw);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k.includes('.bak')) throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, k, v);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await newGameInSlot1(page);
  expect(problems).toEqual([]);
  expect(await rawSave(page), 'the game plays from memory and leaves the save alone').toBe(raw);
  expect(await page.evaluate(() => G.S && G.S.name)).toBe('Ηλέκτρα');
});

test('pull never lets an older hub copy beat a newer device copy', async ({ page }) => {
  const problems = await watch(page);
  const hub = await fakeHub(page, {
    unlocked: true, profiles: [{ id: 1, name: 'Αριάνα' }],
    saves: new Map([['1/1', { schema: 1, saved_at: 1000, data: slotOf('Παλιός', 1000) }]]),
  });
  await seedSave(page, levelB([slotOf('Τοπικός', 2000), null, null]));
  await openSlots(page, () => slotCalls(hub, 'GET', 1, 3).length === 1);
  expect(slotCalls(hub, 'GET', 1, 1)).toHaveLength(1);
  await expect(names(page).first()).toHaveText('Τοπικός');
  expect((await readSave(page)).remote['1'][0]).toEqual(expect.objectContaining({ name: 'Τοπικός', saved: 2000 }));

  // Another device saved later: the hub copy (3000) is newer than the device copy (2000) and wins.
  hub.saves.set('1/1', { schema: 1, saved_at: 3000, data: slotOf('Από το σπίτι', 3000) });
  await openSlots(page, () => slotCalls(hub, 'GET', 1, 3).length === 2);
  await expect(names(page).first()).toHaveText('Από το σπίτι');
  expect((await readSave(page)).remote['1'][0]).toEqual(expect.objectContaining({ name: 'Από το σπίτι', saved: 3000 }));
  expect(hub.log.filter((r) => r.method === 'PUT')).toEqual([]);
  expect(problems).toEqual([]);
});

test('hub tombstone clears the slot; dirty local is pushed instead of pulled', async ({ page }) => {
  const problems = await watch(page);
  const tomb = { schema: 1, saved_at: 5000, data: { deleted: true } };
  const hub = await fakeHub(page, {
    unlocked: true, profiles: [{ id: 1, name: 'Αριάνα' }], saves: new Map([['1/1', tomb]]),
  });
  await seedSave(page, levelB([slotOf('Τοπικός', 2000), null, null]));
  await openSlots(page, () => slotCalls(hub, 'GET', 1, 3).length === 1);
  await expect(page.getByRole('button', { name: 'Νέο παιχνίδι' })).toHaveCount(3);
  expect((await readSave(page)).remote['1']).toEqual([null, null, null]);

  // Same tombstone on the hub, but this device has an unsent change of slot 1 (dirty) and the hub is busy (503):
  // the device copy is sent again, the hub copy is never fetched, nothing is lost.
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, levelB([slotOf('Τοπικός', 2000), null, null], { '1:0': true })]);
  hub.log.length = 0;
  hub.putStatus = 503;
  await openSlots(page, () => slotCalls(hub, 'GET', 1, 3).length === 1);
  expect(slotCalls(hub, 'PUT', 1, 1).length).toBeGreaterThanOrEqual(1);
  expect(JSON.parse(slotCalls(hub, 'PUT', 1, 1)[0].body!)).toEqual({ schema: 1, saved_at: 2000, data: expect.objectContaining({ name: 'Τοπικός' }) });
  expect(slotCalls(hub, 'GET', 1, 1)).toEqual([]);
  await expect(names(page).first()).toHaveText('Τοπικός');
  const d = await readSave(page);
  expect(d.dirty).toEqual({ '1:0': true });
  expect(d.remote['1'][0].name).toBe('Τοπικός');
  expect(problems).toEqual([]);
});

test('oversized save stays on the device and stays dirty', async ({ page }) => {
  const problems = await watch(page);
  await page.addInitScript(() => { (window as any).__KM_TEST__ = { config: { saveMaxBytes: 200 } }; });
  const hub = await fakeHub(page, { unlocked: true, profiles: [{ id: 1, name: 'Αριάνα' }] });
  await seedSave(page, levelB([null, null, null]));
  await openSlots(page, () => slotCalls(hub, 'GET', 1, 3).length === 1);
  await newGameInSlot1(page);
  await page.waitForTimeout(300);
  let d = await readSave(page);
  expect(d.remote['1'][0].name).toBe('Ηλέκτρα');
  expect(d.dirty).toEqual({ '1:0': true });
  expect(hub.log.filter((r) => r.method === 'PUT')).toEqual([]);

  // Next visit: still too big, still not sent, still dirty, and the slot plays from the device copy.
  await openSlots(page, () => slotCalls(hub, 'GET', 1, 3).length === 2);
  expect(hub.log.filter((r) => r.method === 'PUT')).toEqual([]);
  d = await readSave(page);
  expect(d.dirty).toEqual({ '1:0': true });
  await expect(names(page).first()).toHaveText('Ηλέκτρα');
  await page.getByRole('button', { name: 'Συνέχεια' }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('house');
  expect(await page.evaluate(() => G.S.name)).toBe('Ηλέκτρα');
  expect(problems).toEqual([]);
});

test('blocked localStorage -> the game plays from memory', async ({ page }) => {
  const problems = await watch(page);
  await page.addInitScript(() => {
    const no = () => { throw new DOMException('blocked', 'SecurityError'); };
    for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const) Storage.prototype[m] = no as never;
  });
  await page.goto('/');
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await newGameInSlot1(page);
  await page.getByRole('button', { name: /Πάμε να ετοιμαστώ/ }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('house');
  await page.getByRole('button', { name: /Βγες στην πόλη/ }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
  // The hero lives in memory (Store.mem): the save of the city entry is there, nothing reached storage.
  expect(await page.evaluate(() => [G.S.name, Store.mem.slots[0].name])).toEqual(['Ηλέκτρα', 'Ηλέκτρα']);

  const start = await page.evaluate(() => ({ x: G.hero.x, y: G.hero.y }));
  let moved = 0;
  const end = Date.now() + 10_000;
  for (let i = 0; Date.now() < end; i++) {
    if (await page.locator('#screen:not([hidden]) button').first().isVisible()) {
      await page.locator('#screen:not([hidden]) button').first().click();
      if ((await page.evaluate(() => G.mode)) === 'house') await page.getByRole('button', { name: /Βγες στην πόλη/ }).click();
    }
    const key = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'][i % 4];
    await page.keyboard.down(key);
    await page.waitForTimeout(400);
    await page.keyboard.up(key);
    moved = Math.max(moved, await page.evaluate((s) => Math.hypot(G.hero.x - s.x, G.hero.y - s.y), start));
  }
  expect(moved).toBeGreaterThan(20);
  expect(problems).toEqual([]);
});

test('erasing a slot on level B sends a tombstone, not a DELETE', async ({ page }) => {
  const problems = await watch(page);
  const hub = await fakeHub(page, {
    unlocked: true, profiles: [{ id: 1, name: 'Αριάνα' }],
    saves: new Map([['1/1', { schema: 1, saved_at: 2000, data: slotOf('Τοπικός', 2000) }]]),
  });
  await seedSave(page, levelB([slotOf('Τοπικός', 2000), null, null]));
  await openSlots(page, () => slotCalls(hub, 'GET', 1, 3).length === 1);
  await page.getByRole('button', { name: 'Σβήσε' }).click();
  await page.getByRole('button', { name: 'Σίγουρα; Σβήσε' }).click();
  await expect.poll(() => slotCalls(hub, 'PUT', 1, 1).length).toBe(1);
  const body = JSON.parse(slotCalls(hub, 'PUT', 1, 1)[0].body!);
  expect(body).toEqual({ schema: 1, saved_at: expect.any(Number), data: { deleted: true } });
  expect(body.saved_at).toBeGreaterThan(2000);
  expect(hub.log.filter((r) => r.method === 'DELETE')).toEqual([]);
  expect(hub.saves.get('1/1')!.data).toEqual({ deleted: true });
  await expect(page.getByRole('button', { name: 'Νέο παιχνίδι' })).toHaveCount(3);
  await expect.poll(async () => (await readSave(page)).dirty).toEqual({});
  expect(problems).toEqual([]);
});
