// Shared helpers of the save / PIN specs (tests/save.spec.ts, tests/flow.spec.ts, tests/secret.spec.ts):
// the problem watcher of smoke.spec.ts, the save fixture and a configurable in-memory fake of the hub save API.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type Request } from '@playwright/test';

export const SAVE_KEY = 'game.kryfes-maches.v1';
export const FAKE_PIN = '2468'; // the fake hub's PIN; the real family PIN never appears in a test
export const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '..');
export const fixtureText = fs.readFileSync(path.join(here, 'fixtures', 'save-v1.json'), 'utf8');
/** A fresh copy of the fixture save (tests/fixtures/save-v1.json, never changed). */
export const fixture = () => JSON.parse(fixtureText);

/** Same rule as smoke.spec.ts: only Chromium's own line for a 4xx/5xx or an aborted request of the hub save API is
 * allowed; a CSP violation never matches. */
const isApiStatus = (text: string, url: string) =>
  /^Failed to load resource: (the server responded with a status of (401|404|429|503) |net::ERR_FAILED$)/.test(text) &&
  new URL(url, 'http://x').pathname.startsWith('/api/');

/** Console errors, page errors and CSP violations; must stay empty. */
export async function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !isApiStatus(m.text(), m.location().url || '')) problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return problems;
}

/** Puts a raw value under the save key once (first page load only), so later reloads see what the game wrote. */
export async function seedSave(page: Page, raw: string) {
  await page.addInitScript(([k, v]) => {
    if (sessionStorage.getItem('km-test-seeded')) return;
    sessionStorage.setItem('km-test-seeded', '1');
    localStorage.setItem(k, v);
  }, [SAVE_KEY, raw]);
}

export const rawSave = (page: Page) => page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
export const readSave = async (page: Page) => JSON.parse((await rawSave(page))!);

export type HubSave = { schema: number; saved_at: number; data: any };
export type Hub = {
  unlocked: boolean;
  /** Status of every PUT (204 = stored). */
  putStatus: number;
  /** Status of POST /api/unlock regardless of the PIN (0 = check the PIN). */
  unlockStatus: number;
  /** Status of every /api/save request, GET and PUT (0 = answer normally). 401 = the hub forgot the unlock for the
   * saves while /api/profiles still answers. */
  saveStatus: number;
  profiles: { id: number; name: string }[];
  saves: Map<string, HubSave>;
  /** Every /api request: method, path, body text. */
  log: { method: string; path: string; body: string | null }[];
};

/** In-memory fake of the hub save API (games-hub app/api/saves.py), for this slug only; same as smoke.spec.ts
 * `fakeHub`, with knobs for the status codes. No network: page.route answers every /api request. */
export async function fakeHub(page: Page, init: Partial<Hub> = {}): Promise<Hub> {
  const hub: Hub = { unlocked: false, putStatus: 204, unlockStatus: 0, saveStatus: 0, profiles: [], saves: new Map(), log: [], ...init };
  await page.route('**/api/**', async (route) => {
    const req: Request = route.request();
    const p = new URL(req.url()).pathname;
    hub.log.push({ method: req.method(), path: p, body: req.postData() });
    const json = (status: number, body?: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });
    if (p === '/api/unlock') {
      if (hub.unlockStatus) return json(hub.unlockStatus, { error: { code: 'TOO_MANY' } });
      hub.unlocked = req.postDataJSON().pin === FAKE_PIN;
      return json(hub.unlocked ? 204 : 401, hub.unlocked ? undefined : { error: { code: 'UNAUTHORIZED' } });
    }
    if (!hub.unlocked) return json(401, { error: { code: 'UNAUTHORIZED' } });
    if (p === '/api/profiles' && req.method() === 'GET') return json(200, { profiles: hub.profiles });
    if (p === '/api/profiles' && req.method() === 'POST') {
      const np = { id: hub.profiles.length + 1, name: req.postDataJSON().name };
      hub.profiles.push(np);
      return json(201, np);
    }
    const m = p.match(/^\/api\/save\/kryfes-maches\/(\d+)\/([1-3])$/);
    if (!m) return json(404, { error: { code: 'NOT_FOUND' } });
    if (hub.saveStatus) return json(hub.saveStatus, { error: { code: 'UNAUTHORIZED' } });
    if (req.method() === 'PUT') {
      expect(req.postData()!.length).toBeLessThan(64 * 1024);
      if (hub.putStatus !== 204) return json(hub.putStatus, { error: { code: 'SAVES_DISABLED' } });
      hub.saves.set(`${m[1]}/${m[2]}`, req.postDataJSON());
      return json(204);
    }
    if (req.method() !== 'GET') return json(405, { error: { code: 'METHOD_NOT_ALLOWED' } });
    const s = hub.saves.get(`${m[1]}/${m[2]}`);
    return s ? json(200, s) : json(404, { error: { code: 'NOT_FOUND' } });
  });
  return hub;
}

/** Requests of one save slot of the fake hub: 'GET' / 'PUT' ... */
export const slotCalls = (hub: Hub, method: string, profile: number, slot: number) =>
  hub.log.filter((r) => r.method === method && r.path === `/api/save/kryfes-maches/${profile}/${slot}`);
