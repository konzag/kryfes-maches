// Dress-up / mirror screen («Το σπίτι μου») at every size: tabs and chips never clipped without a cue (fade + ‹ ›),
// the selected tab in view, at least 3 option cards fully visible, options never under the buttons, keyboard focus,
// light + dark, axe (WCAG 2 AA) clean, 0 console errors. Save keys and format are untouched by this screen.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

declare const G: { mode: string };
type Box = { x: number; y: number; width: number; height: number };

/** Same rule as smoke.spec.ts: only Chromium's own line for a 4xx/5xx of the hub save API (/api/..., 503 without
 * the PIN file) is allowed; a CSP violation never matches. */
const isApiStatus = (text: string, url: string) =>
  /^Failed to load resource: (the server responded with a status of (401|404|429|503) |net::ERR_FAILED$)/.test(text) &&
  new URL(url, 'http://x').pathname.startsWith('/api/');

async function watch(page: Page) {
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

/** Title → new game → hero → intro → the house (wardrobe). */
async function toHouse(page: Page) {
  const press = async (name: string | RegExp) => {
    const b = page.getByRole('button', { name }).first();
    await expect(b).toBeVisible();
    await b.click();
  };
  await page.goto('/');
  await press('▶ Παίξε');
  await press('Νέο παιχνίδι');
  await page.getByLabel('Πώς λένε τον ήρωα;').fill('Ηλέκτρα');
  await press(/Ξεκίνα την περιπέτεια/);
  await press(/Πάμε να ετοιμαστώ/);
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('house');
  await expect(page.locator('#house')).toBeVisible();
}

const box = async (l: Locator) => (await l.boundingBox()) as Box;
const inside = (a: Box, b: Box, tol = 1) =>
  a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.width <= b.x + b.width + tol && a.y + a.height <= b.y + b.height + tol;
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The part of a scroll row a child can see (the row's box, inside the viewport). */
async function visibleArea(page: Page, row: Locator): Promise<Box> {
  const r = await box(row);
  const vp = page.viewportSize()!;
  const x = Math.max(r.x, 0);
  const y = Math.max(r.y, 0);
  return { x, y, width: Math.min(r.x + r.width, vp.width) - x, height: Math.min(r.y + r.height, vp.height) - y };
}

/** Bring item `i` of a row into view the way a child would: tap › / ‹ while it is hidden, never scroll by code. */
async function reach(page: Page, boxId: string, item: Locator) {
  const scroller = page.locator(boxId);
  const row = scroller.locator('.tabs, .chips, .grid');
  for (let n = 0; n < 12; n++) {
    const area = await visibleArea(page, row);
    const b = await box(item);
    if (inside(b, area)) return;
    const next = b.x + b.width > area.x + area.width;
    const arrow = scroller.locator(next ? '.sc.next' : '.sc.prev');
    await expect(arrow, `${boxId}: hidden item but no ${next ? '›' : '‹'} cue`).toBeVisible();
    await arrow.click();
    await page.waitForTimeout(450); // smooth scroll
  }
  throw new Error(`${boxId}: item never came into view`);
}

async function cardsFullyInView(page: Page) {
  const grid = await visibleArea(page, page.locator('#wGrid'));
  const bar = await Promise.all((await page.locator('.wbar button').all()).map(box));
  let full = 0;
  for (const card of await page.locator('#wGrid .opt').all()) {
    const b = await box(card);
    if (!b || !inside(b, grid)) continue;
    full++;
    for (const btn of bar) expect(overlaps(b, btn), 'an option card under a bottom button').toBe(false);
  }
  return full;
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    test('every tab and chip reachable with a cue, selection in view, 3+ cards above the buttons', async ({ page }) => {
      const problems = await watch(page);
      await toHouse(page);
      const vp = page.viewportSize()!;
      for (const b of await page.locator('.wbar button').all()) expect(inside(await box(b), { x: 0, y: 0, ...vp })).toBe(true);
      const wbar = await box(page.locator('.wbar'));
      expect((await box(page.locator('#wGrid'))).y + 1).toBeLessThan(wbar.y);
      const grid = await box(page.locator('#wGrid'));
      expect(grid.y + grid.height).toBeLessThanOrEqual(wbar.y + 1); // the options end above the buttons

      const tabs = page.locator('#wTabs button');
      const nTabs = await tabs.count();
      expect(nTabs).toBe(5);
      for (let i = 0; i < nTabs; i++) {
        const tab = tabs.nth(i);
        await reach(page, '#wTabsBox', tab);
        await tab.click();
        const on = page.locator('#wTabs button.on');
        await expect(on).toHaveAttribute('aria-pressed', 'true');
        expect(inside(await box(on), await visibleArea(page, page.locator('#wTabs')))).toBe(true);

        const chips = page.locator('#wChips button');
        const nChips = await chips.count();
        await reach(page, '#wChipsBox', chips.nth(nChips - 1)); // the last chip of the group is reachable
        await chips.nth(nChips - 1).click();
        expect(inside(await box(page.locator('#wChips button.on')), await visibleArea(page, page.locator('#wChips')))).toBe(
          true,
        );
        expect(await cardsFullyInView(page), `tab ${i}: cards fully in view`).toBeGreaterThanOrEqual(3);
      }

      // Cards: >= 72 px, a preview, a name; the chosen one is marked; locked ones keep their lock.
      await tabs.nth(0).click();
      await page.locator('#wChips button').nth(0).click();
      for (const card of (await page.locator('#wGrid .opt').all()).slice(0, 3)) {
        const b = await box(card);
        expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(72);
        await expect(card.locator('canvas, .sw')).toHaveCount(1);
      }
      await expect(page.locator('#wGrid .opt.on')).toHaveCount(1);
      await expect(page.locator('#wGrid .opt.on')).toHaveAttribute('aria-pressed', 'true');
      await page.locator('#wTabs button', { hasText: 'Μάχη' }).click();
      await expect(page.locator('#wGrid .opt.lock .lk').first()).toBeVisible();
      expect(problems).toEqual([]);
    });

    test('short screens: one-line hint, mirror scaled down; buttons and options never overlap', async ({ page }) => {
      const problems = await watch(page);
      await toHouse(page);
      const vp = page.viewportSize()!;
      const hint = await box(page.locator('#wHint'));
      if (vp.height <= 500) {
        expect(hint.height).toBeLessThanOrEqual(22); // one line
        const mirror = await box(page.locator('.mirrorBox'));
        expect(mirror.width).toBeLessThanOrEqual(vp.width * 0.3);
        await page.locator('#wHint').evaluate((h) => {
          h.textContent = 'Έχεις νέα πράγματα στη ντουλάπα! Ψάξε τα σημάδια ΝΕΟ σε κάθε καρτέλα και διάλεξε ό,τι σου αρέσει.';
        });
        expect((await box(page.locator('#wHint'))).height).toBeLessThanOrEqual(22); // a long sentence: still one line
        await page.locator('#wHint').click(); // tap shows the whole sentence
        expect((await box(page.locator('#wHint'))).height).toBeGreaterThan(22);
      }
      for (const id of ['#wRandom', '#wSave', '#wOut']) {
        const b = await box(page.locator(id));
        for (const card of await page.locator('#wGrid .opt').all()) {
          const c = await box(card);
          if (c && inside(c, await visibleArea(page, page.locator('#wGrid')))) expect(overlaps(c, b)).toBe(false);
        }
      }
      await page.locator('#wRandom').click(); // still works and keeps the layout
      expect(await cardsFullyInView(page)).toBeGreaterThanOrEqual(3);
      expect(problems).toEqual([]);
    });

    test('keyboard focus: Tab walks the tabs and keeps the focused one in view; axe AA clean', async ({ page }) => {
      await toHouse(page);
      await page.locator('#wTabs button').first().focus();
      for (let i = 1; i < 5; i++) {
        await page.keyboard.press('Tab');
        const focused = page.locator('#wTabs button:focus');
        await expect(focused).toHaveText(await page.locator('#wTabs button').nth(i).innerText());
        await page.waitForTimeout(100);
        expect(inside(await box(focused), await visibleArea(page, page.locator('#wTabs')), 2)).toBe(true);
      }
      await page.keyboard.press('Enter');
      await expect(page.locator('#wTabs button').nth(4)).toHaveClass(/\bon\b/);
      const axe = await new AxeBuilder({ page }).include('#house').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  });
}

// Font metrics differ per OS (CI's Linux fonts are wider than Windows'): with scroll-snap, a focused tab could be
// snapped back half out of view. Walk tabs + chips by keyboard at many widths with wider letter spacing.
test('keyboard focus stays in view with other font metrics', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one project is enough: it sets its own sizes');
  const fullyIn = (a: Box, b: Box) => a.x >= b.x - 2 && a.x + a.width <= b.x + b.width + 2;
  await page.addInitScript(() =>
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '.tabs button,.chips button{letter-spacing:1px}';
      document.head.append(st);
    }),
  );
  await page.setViewportSize({ width: 820, height: 1180 });
  await toHouse(page);
  for (let w = 720; w <= 980; w += 40) {
    await page.setViewportSize({ width: w, height: 1180 });
    for (const row of ['#wTabs', '#wChips']) {
      const items = page.locator(`${row} button`);
      await items.first().focus();
      for (let i = 1; i < (await items.count()); i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(60);
        expect(fullyIn(await box(page.locator(`${row} button:focus`)), await box(page.locator(row))), `${w}px ${row} ${i}`).toBe(
          true,
        );
      }
    }
  }
});

// KM-34: a portrait window (820x1180, no touch) stacks the house: mirror on top, wardrobe below, all inside the window.
// The landscape sizes keep the mirror on the left (KM-33, 1280, and the short-screen block of KM-35).
const LAYOUTS = [
  { name: '820x1180', viewport: { width: 820, height: 1180 }, stacked: true },
  { name: '360x780', viewport: { width: 360, height: 780 }, stacked: true },
  { name: '1280x800', viewport: { width: 1280, height: 800 }, stacked: false },
  { name: '1180x820', viewport: { width: 1180, height: 820 }, stacked: false },
  { name: '780x360', viewport: { width: 780, height: 360 }, stacked: false },
];
for (const scheme of ['light', 'dark'] as const) {
  for (const l of LAYOUTS) {
    test(`KM-34 house at ${l.name}, ${scheme}: ${l.stacked ? 'mirror on top, options below' : 'mirror left'}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'one project is enough: it sets its own sizes');
      const problems = await watch(page);
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(l.viewport);
      await toHouse(page);
      const vp = { x: 0, y: 0, ...l.viewport };
      const mirror = await box(page.locator('.mirrorBox'));
      const ward = await box(page.locator('.ward'));
      if (l.stacked) {
        expect(mirror.y + mirror.height, 'mirror above the wardrobe').toBeLessThanOrEqual(ward.y + 1);
        for (const id of ['#wTabs', '#wRandom', '#wSave', '#wOut', '#wGrid .opt >> nth=0']) {
          expect(inside(await box(page.locator(id)), vp), `${id} inside the window`).toBe(true);
        }
        expect(await cardsFullyInView(page), 'first row of cards visible').toBeGreaterThanOrEqual(3);
      } else {
        expect(mirror.x + mirror.width, 'mirror left of the wardrobe').toBeLessThanOrEqual(ward.x + 1);
      }
      const scroll = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, house: document.getElementById('house')!.scrollWidth }));
      expect(scroll.doc, 'no horizontal page scroll').toBeLessThanOrEqual(l.viewport.width);
      expect(scroll.house).toBeLessThanOrEqual(l.viewport.width);
      if (l.stacked) {
        const axe = await new AxeBuilder({ page }).include('#house').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      }
      expect(problems).toEqual([]);
    });
  }
}
