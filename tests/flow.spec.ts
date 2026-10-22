// GAME-STANDARD §6: losing a fight never costs progress. The hero goes back to a safe point (the house) with full
// health; beaten monsters, battles, look and weapon stay; the monster that won hides again at its own spot.
// The fight is real (the hero walks onto an unbeaten boss of the fixture save); only the last hit is scripted.
import { expect, test } from '@playwright/test';
import { SAVE_KEY, fixture, fixtureText, readSave, watch } from './lib';

declare const G: any;
declare const BOSSES: any[];
declare function heroHurt(dmg: number, src?: unknown): void;

test('defeat returns to a safe point keeping unlocks', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const problems = await watch(page);
  await page.addInitScript(() => { (window as any).__KM_TEST__ = { config: {} }; });
  await page.goto('/');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, fixtureText]);
  await page.reload();
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await page.getByRole('button', { name: 'Συνέχεια' }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('house');
  await page.getByRole('button', { name: /Βγες στην πόλη/ }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
  expect(await page.evaluate(() => typeof (window as any).__kmDebug().lowFx)).toBe('boolean'); // test hook is on

  const old = fixture().slots[0];
  // An unbeaten boss that is not the secret one (the fixture has beaten 'rock' and 'cat').
  const boss = await page.evaluate(() => {
    const b = BOSSES.find((x) => !x.secret && !G.S.bosses.includes(x.id));
    G.hero.x = b.x; G.hero.y = b.y;
    return { id: b.id, x: b.x, y: b.y };
  });
  expect(old.bosses).not.toContain(boss.id);
  await expect.poll(() => page.evaluate(() => !!G.fight), { timeout: 20_000 }).toBe(true);
  expect(await page.evaluate(() => G.fight.m.id)).toBe(boss.id);

  await page.evaluate(() => { const h = G.hero; h.inv = 0; h.shield = 0; h.dash = 0; h.hp = 1; heroHurt(500); });
  await expect(page.getByRole('heading', { name: 'Ωχ! Κουράστηκες...' })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#screen')).toContainText('Δεν χάθηκε τίποτα από όσα έχεις ξεκλειδώσει');
  const after = await page.evaluate((id) => {
    const m = G.monsters.find((x: any) => x.id === id);
    return { fight: G.fight, hp: G.hero.hp, max: G.hero.max, hidden: m && m.hidden, at: m && [m.x, m.y], food: G.S.food };
  }, boss.id);
  expect(after).toEqual({ fight: null, hp: after.max, max: after.max, hidden: true, at: [boss.x, boss.y], food: expect.any(Number) });
  expect(after.food).toBeGreaterThanOrEqual(2);

  await page.getByRole('button', { name: '🏡 Πάμε σπίτι' }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('house');
  const S = await page.evaluate(() => ({ bosses: G.S.bosses, minis: G.S.minis, look: G.S.look, name: G.S.name }));
  expect(S).toEqual({ bosses: old.bosses, minis: old.minis, look: old.look, name: old.name });

  // Saved progress keeps every unlock too, and the lost boss is still waiting in the city.
  await page.getByRole('button', { name: /Βγες στην πόλη/ }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
  const saved = (await readSave(page)).slots[0];
  expect({ bosses: saved.bosses, minis: saved.minis, weapon: saved.look.weapon }).toEqual({ bosses: old.bosses, minis: old.minis, weapon: old.look.weapon });
  expect(await page.evaluate((id) => G.monsters.some((x: any) => x.id === id && x.hidden), boss.id)).toBe(true);
  expect(problems).toEqual([]);
});
