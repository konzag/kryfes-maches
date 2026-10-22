// KM-SECRET-01: boss 5 is a surprise for the kids and the repo is public. No file and no page text before that fight
// may carry its name (tests/secret-scan.mjs, which holds only a SHA-256 of a folded form). The game decodes the
// name from code points when the fight starts; the texts it then shows are compared by SHA-256, never by literal.
// KM-SECRET-02: the same for the whole intro line; no two consecutive words of it may appear before the fight.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  INTRO_FOLD_SHA256, INTRO_PAIR_SHA256, fold, hasIntroFragment, hasSecret, scanTree, scanTreeIntro, wordPairHashes,
} from './secret-scan.mjs';
import { FAKE_PIN, fakeHub } from './lib';

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

// SHA-256 of JSON.stringify(SECRET_C.concat(SECRET_D)): the encoded words of the intro (KM-SECRET-02).
const INTRO_CODES_SHA = '1d285b701f32023b16df5fb27d74a36a1830edd403bf9d3af388ce3d85a6c8b4';

/** The encoded intro words (everything before the name), read from index.html. */
function encodedIntroHead() {
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const m = src.match(/const SECRET_C = \[([\d, ]+)\],\s*SECRET_D = \[([\d, ]+)\];/);
  expect(m, 'SECRET_C / SECRET_D in index.html').toBeTruthy();
  const codes = (m![1] + ', ' + m![2]).split(',').map((x) => Number(x.trim()));
  expect(sha(JSON.stringify(codes))).toBe(INTRO_CODES_SHA);
  return String.fromCodePoint(...codes);
}

/** The whole intro line as the game builds it in secretWords(). */
function encodedIntro() {
  const intro = encodedIntroHead() + encodedWord() + 'ς!';
  expect(sha(intro)).toBe(INTRO_SHA);
  return intro;
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

test('no file of the repo carries a fragment of the secret intro line in any spelling', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  expect(scanTreeIntro(root)).toEqual([]);
});

test('the intro scan catches every two-word fragment in every covered spelling and nothing else', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  const intro = encodedIntro();
  expect(sha(fold(intro))).toBe(INTRO_FOLD_SHA256);
  expect(new Set(wordPairHashes(intro))).toEqual(INTRO_PAIR_SHA256);
  const words = intro.split(/\s+/);
  const esc = (s: string, f: (n: number) => string) => [...s].map((c) => f(c.codePointAt(0)!)).join('');
  for (let i = 0; i + 1 < words.length; i++) {
    const p = words[i] + ' ' + words[i + 1];
    const bare = p.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
    const spellings = [
      p, p.toUpperCase(), p.toLowerCase(), bare, bare.toUpperCase(), p.normalize('NFD'), fold(p), fold(p).toUpperCase(),
      `x ${p} y`, words[i] + '\n' + words[i + 1], esc(p, (n) => '\\u' + n.toString(16).padStart(4, '0')),
      esc(p, (n) => `\\u{${n.toString(16)}}`), esc(p, (n) => `&#${n};`), esc(p, (n) => `&#x${n.toString(16)};`),
      encodeURIComponent(p), `alt="${p}"`, `"aria-label": "${bare}"`,
    ];
    spellings.forEach((s, j) => expect(hasIntroFragment(s), `pair #${i} spelling #${j}`).toBe(true));
  }
  // Single words alone (e.g. a city sign or a food) are not fragments; nor are the other bosses' lines.
  for (const w of words) expect(hasIntroFragment(w), `word of length ${w.length}`).toBe(false);
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const others = [...src.matchAll(/intro: '([^']+)'/g)].map((x) => x[1]);
  expect(others.length).toBe(4);
  for (const o of others) expect(hasIntroFragment(o), o).toBe(false);
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
  for (const other of ['Ο Βραχυντής', 'Η ΗλιοΛίμνη', 'Το ΣακουλοΦως', 'Κρυφή μάχη! Σκιουλάκια!', 'pitta', 'SECRET_A']) {
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
  bodies.forEach((b) => expect(hasIntroFragment(b), `intro in ${b.split('\n')[0]}`).toBe(false));
  const html = await page.content(), text = await page.evaluate(() => document.body.innerText);
  expect(hasSecret(html)).toBe(false);
  expect(hasSecret(text)).toBe(false);
  expect(hasIntroFragment(html)).toBe(false);
  expect(hasIntroFragment(text)).toBe(false);
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

// ---------- PIN hygiene (level B). Only the fake hub's PIN (tests/lib.ts FAKE_PIN) is ever typed. ----------
const pinIn = (s: string, pin: string) => new RegExp(`(^|\\D)${pin}(\\D|$)`).test(s);

test('the PIN is never stored, logged or sent in a URL', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const problems = problemsOf(page);
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  const sent: { method: string; url: string; body: string }[] = [];
  page.on('request', (r) => sent.push({ method: r.method(), url: r.url(), body: r.postData() || '' }));
  const hub = await fakeHub(page, { profiles: [{ id: 1, name: 'Αριάνα' }] });
  // While the hub answers /api/unlock, the box must already be empty (the handler clears it before the request).
  const boxDuringUnlock: string[] = [];
  await page.route('**/api/unlock', async (route) => { boxDuringUnlock.push(await page.locator('#pin').inputValue()); await route.fallback(); });
  await page.goto('/');
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  const pin = page.getByLabel('Οικογενειακός κωδικός (4 ψηφία)');
  await expect(pin).toHaveAttribute('type', 'password');
  await expect(pin).toHaveAttribute('autocomplete', 'off');
  await pin.fill('1357');
  await page.getByRole('button', { name: 'Άνοιγμα' }).click();
  await expect(page.locator('#serverMsg')).toHaveText('Λάθος κωδικός');
  await expect(pin).toHaveValue('');
  await pin.fill(FAKE_PIN);
  await pin.press('Enter');
  await expect(page.getByRole('button', { name: 'Αριάνα' })).toBeVisible();
  expect(hub.unlocked).toBe(true);
  expect(boxDuringUnlock).toEqual(['', '']);
  await expect(page.locator('#pin')).toHaveCount(0);

  const stored = await page.evaluate(() => [localStorage, sessionStorage].flatMap((s) =>
    Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i)!)}`)));
  for (const p of ['1357', FAKE_PIN]) {
    expect(stored.filter((s) => pinIn(s, p)), 'storage').toEqual([]);
    expect(logs.filter((s) => pinIn(s, p)), 'console').toEqual([]);
    expect(sent.filter((r) => pinIn(decodeURIComponent(r.url), p)).map((r) => r.url), 'request URL').toEqual([]);
  }
  const withPin = sent.filter((r) => pinIn(r.body, '1357') || pinIn(r.body, FAKE_PIN));
  expect(withPin.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual(['POST /api/unlock', 'POST /api/unlock']);
  expect(withPin.map((r) => JSON.parse(r.body))).toEqual([{ pin: '1357' }, { pin: FAKE_PIN }]);
  expect(problems).toEqual([]);
});

test('429 lockout shows the wait message and keeps the game playable', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const problems = problemsOf(page);
  const hub = await fakeHub(page, { unlockStatus: 429 });
  await page.goto('/');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, fixture]);
  await page.reload();
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  const pin = page.getByLabel('Οικογενειακός κωδικός (4 ψηφία)');
  await pin.fill(FAKE_PIN);
  await page.getByRole('button', { name: 'Άνοιγμα' }).click();
  await expect(page.locator('#serverMsg')).toHaveText('Περίμενε λίγο και ξαναδοκίμασε');
  expect(hub.unlocked).toBe(false);
  await expect(pin).toBeVisible();
  await expect(pin).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Άνοιγμα' })).toBeEnabled();
  // The device slots stay usable: the fixture hero continues, two empty slots offer a new game.
  await expect(page.getByRole('button', { name: 'Νέο παιχνίδι' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Συνέχεια' }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('house');
  expect(await page.evaluate(() => G.owner)).toBe('local');
  expect(hub.log.filter((r) => r.method === 'PUT')).toEqual([]);
  expect(problems).toEqual([]);
});

// ---------- history scan (secret-scan.mjs --history), proven in a scratch repo with a harmless placeholder ----------
test('the history scan finds a placeholder name in an old commit that the tree scan no longer sees', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'km-history-'));
  try {
    const placeholder = 'zqxplacer'; // WORD_LEN letters that fold to themselves: a TEST pattern, not the name
    expect(fold(placeholder)).toBe(placeholder);
    expect(placeholder).toHaveLength(9);
    const emptyConfig = path.join(scratch, 'gitconfig');
    fs.writeFileSync(emptyConfig, '');
    const repo = path.join(scratch, 'repo');
    fs.mkdirSync(repo);
    // Hermetic git: own GIT_DIR, no global/system config (no hooks, no signing), never the repo around the test.
    const gitEnv = {
      ...process.env, GIT_DIR: path.join(repo, '.git'), GIT_WORK_TREE: repo,
      GIT_CEILING_DIRECTORIES: scratch, GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
    };
    const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, env: gitEnv, encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(repo, 'README.md'), 'scratch\n');
    git('add', '-A'); git('commit', '-q', '-m', 'first');
    fs.writeFileSync(path.join(repo, 'note.txt'), `a ${placeholder.toUpperCase()} hides here\n`);
    git('add', '-A'); git('commit', '-q', '-m', 'add note');
    const added = git('rev-parse', 'HEAD');
    fs.rmSync(path.join(repo, 'note.txt'));
    git('add', '-A'); git('commit', '-q', '-m', 'remove note');
    const removed = git('rev-parse', 'HEAD');
    expect(git('rev-list', '--all', '--count')).toBe('3');

    const scan = (args: string[], extra: Record<string, string>) => {
      const r = spawnSync(process.execPath, [path.join(here, 'secret-scan.mjs'), ...args, repo], { env: { ...gitEnv, ...extra }, encoding: 'utf8' });
      return { code: r.status, out: r.stdout + r.stderr };
    };
    const testPattern = { SECRET_SCAN_TEST_SHA256: sha(placeholder) };
    const hist = scan(['--history'], testPattern);
    expect(hist.code, hist.out).toBe(1);
    expect(hist.out).toContain(`${added}:`);
    expect(hist.out).toContain(`${removed}:`);
    expect(hist.out).toContain('secret name found');
    expect(hist.out).toContain('secret-scan --history: 3 commits, 2 hit(s)');
    const tree = scan([], testPattern);
    expect(tree.code, tree.out).toBe(0); // the file is gone: only the history still has it
    expect(scan(['--history'], {}).code).toBe(0); // without the test pattern the scratch history is clean
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
