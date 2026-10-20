// KM-SECRET-01: boss 5 is a surprise for the kids and the repo is public. No file and no page text before that fight
// may carry its name (tests/secret-scan.mjs, which holds only a SHA-256 of a folded form). The game decodes the
// name from code points when the fight starts; the texts it then shows are compared by SHA-256, never by literal.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { hasSecret, scanTree } from './secret-scan.mjs';

declare const G: any;
declare const BOSSES: any[];

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fixture = fs.readFileSync(path.join(here, 'fixtures', 'save-v1.json'), 'utf8');
const SAVE_KEY = 'game.kryfes-maches.v1';
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// SHA-256 of the texts the game showed before KM-SECRET-01 (index.html at 1eb810e): name, accusative, intro banner.
const NAME_SHA = 'dc6b37be766f600b11857f02ef645b26d87261d0804d127aacc74a7d46e3f195';
const ACC_SHA = 'a66c341297090e98bf7d15651ede9c42b1e3ee9c00a6d8263740b8a734b3ab98';
const INTRO_SHA = 'be47f06c6cbcbb1e00922e0ac11f291b8573579161bc5543f1cc43e9681c4172';
// SHA-256 of JSON.stringify(SECRET_A.concat(SECRET_B)): the encoded value in index.html.
const CODES_SHA = '3fdd8a3fc090d943e2c81a4b0f36afc8fc58a86b6e0a967d2d5771db76d492e6';

/** The encoded word, read from index.html (the two code-point constants). */
function encodedWord() {
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const m = src.match(/const SECRET_A = \[([\d, ]+)\], SECRET_B = \[([\d, ]+)\];/);
  expect(m, 'SECRET_A / SECRET_B in index.html').toBeTruthy();
  const codes = (m![1] + ', ' + m![2]).split(',').map((x) => Number(x.trim()));
  expect(sha(JSON.stringify(codes))).toBe(CODES_SHA);
  return String.fromCodePoint(...codes);
}

function problemsOf(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    const url = m.location().url || '';
    const api = /^Failed to load resource: /.test(m.text()) && new URL(url, 'http://x').pathname.startsWith('/api/');
    if (m.type() === 'error' && !api) problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

test('no file of the repo carries the secret name in any spelling', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  expect(scanTree(root)).toEqual([]);
});

test('the scan catches every covered spelling and nothing else', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  const w = encodedWord();
  const bare = w.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
  const LAT: Record<string, string> = { α: 'a', ι: 'i', ο: 'o', π: 'p', ρ: 'r', σ: 's', τ: 't' };
  const latin = (u: string) => [...bare.toLowerCase()].map((c) => (c === 'υ' ? u : LAT[c] ?? c)).join('');
  const esc = (s: string, f: (n: number) => string) => [...s].map((c) => f(c.codePointAt(0)!)).join('');
  const spellings = [
    w + 'ς', w.toUpperCase() + 'Σ', w.toLowerCase() + 'ς', bare + 'ς', bare.toUpperCase(), 'τον ' + bare.toLowerCase(),
    latin('u'), latin('v'), latin('f'), latin('y'), latin('u').toUpperCase(), latin('v')[0].toUpperCase() + latin('v').slice(1),
    esc(w, (n) => '\\u' + n.toString(16).padStart(4, '0')), esc(w, (n) => `\\u{${n.toString(16)}}`),
    esc(w, (n) => `&#${n};`), esc(w, (n) => `&#x${n.toString(16)};`), encodeURIComponent(w),
    w.normalize('NFD'), `alt="${w}"`, `"aria-label": "${bare}"`,
  ];
  spellings.forEach((s, i) => expect(hasSecret(s), `spelling #${i}`).toBe(true));
  for (const other of ['Ο Βραχυντής', 'Η ΗλιοΛίμνη', 'Το ΣακουλοΦως', '***', 'pitta', 'SECRET_A']) {
    expect(hasSecret(other), other).toBe(false);
  }
});

test('the served page and the city before boss 5 show no secret name; the fight decodes it with its art; the fixture save loads unchanged', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const problems = problemsOf(page);
  const bodies: string[] = [];
  page.on('response', async (r) => { try { bodies.push(`${r.url()}\n${await r.text()}`); } catch { /* redirects, aborted */ } });
  await page.goto('/');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, fixture]);
  await page.reload();
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await expect(page.locator('#screen')).toContainText('Τέρατα 2/5 · Μάχες 4/20');
  await page.getByRole('button', { name: 'Συνέχεια' }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('house');
  await page.getByRole('button', { name: /Βγες στην πόλη/ }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
  await page.waitForTimeout(500);

  // Before the fight: no response, DOM or in-memory monster carries the words.
  expect(bodies.length).toBeGreaterThan(0);
  bodies.forEach((b) => expect(hasSecret(b), b.split('\n')[0]).toBe(false));
  expect(hasSecret(await page.content())).toBe(false);
  expect(hasSecret(await page.evaluate(() => document.body.innerText))).toBe(false);
  const before = await page.evaluate(() => {
    const m = G.monsters.find((x: any) => x.secret);
    const b = BOSSES.find((x: any) => x.secret);
    return { found: !!m, hidden: m && m.hidden, name: m && m.name, acc: m && m.acc, intro: m && m.intro, sameArt: !!m && m.kind === b.kind };
  });
  expect(before).toEqual({ found: true, hidden: true, name: undefined, acc: undefined, intro: undefined, sameArt: true });

  // Walk onto it (its own spot from BOSSES): the fight starts and the decoded texts are today's texts.
  await page.evaluate(() => { const b = BOSSES.find((x) => x.secret); G.hero.x = b.x; G.hero.y = b.y; });
  await expect.poll(() => page.evaluate(() => !!G.fight), { timeout: 20_000 }).toBe(true);
  const f = await page.evaluate(() => ({
    type: G.fight.type, def: G.fight.m.def === BOSSES.find((x: any) => x.secret), art: G.fight.m.kind === BOSSES.find((x: any) => x.secret).kind, fname: G.fight.name,
    name: G.fight.m.name, acc: G.fight.m.acc, intro: G.fight.m.intro, banner: G.banner && G.banner.text,
    isEnemy: G.fight.enemies[0] === G.fight.m,
  }));
  expect({ type: f.type, def: f.def, art: f.art, isEnemy: f.isEnemy }).toEqual({ type: 'boss', def: true, art: true, isEnemy: true });
  expect(sha(f.name)).toBe(NAME_SHA);
  expect(sha(f.fname)).toBe(NAME_SHA);
  expect(sha(f.acc)).toBe(ACC_SHA);
  expect(sha(f.intro)).toBe(INTRO_SHA);
  expect(sha(f.banner)).toBe(INTRO_SHA);
  const w = encodedWord();
  expect(f.name.includes(w)).toBe(true);

  // The fixture save keeps its keys and format after this play (save contract unchanged).
  await page.evaluate(() => { G.fight = null; G.banner = null; });
  await page.keyboard.press('KeyP');
  await page.getByRole('button', { name: '💾 Αποθήκευση' }).click();
  const old = JSON.parse(fixture), now = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), SAVE_KEY);
  expect(Object.keys(now).sort()).toEqual(Object.keys(old).sort());
  expect(now.v).toBe(old.v);
  expect(Object.keys(now.slots[0]).sort()).toEqual(Object.keys(old.slots[0]).sort());
  for (const k of ['name', 'gender', 'look', 'bosses', 'minis', 'family', 'seed', 'created', 'finished']) expect(now.slots[0][k], k).toEqual(old.slots[0][k]);
  expect(problems).toEqual([]);
});
