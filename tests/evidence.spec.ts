// Before/after screenshots of every screen (G1-GFX-2026-10-22). Not part of CI: runs only with EVIDENCE=<folder>:
//   EVIDENCE=../.claude/GAME/evidence/2026-10-22-gfx-kryfes-maches/before npx playwright test tests/evidence.spec.ts --project=desktop
// Four sizes (1280, 1180x820 touch, 820x1180, 360) x light + dark shell. Camera spots and fights stay far from the
// hidden places, and only public monsters are fought, so no screenshot gives a secret away.
import { expect, test, type Page } from '@playwright/test';

declare const G: any;
declare const CONFIG: any;
declare const BOSSES: any[];
declare function startFight(m: unknown): void;
declare function hitEnemy(e: unknown, dmg: number): void;
declare function loseFight(): void;
declare function startEnding(): void;

const DIR = process.env.EVIDENCE || '';
const SIZES = [
  { tag: '1280', viewport: { width: 1280, height: 800 }, touch: false },
  { tag: '1180x820', viewport: { width: 1180, height: 820 }, touch: true },
  { tag: '820x1180', viewport: { width: 820, height: 1180 }, touch: false },
  { tag: '360', viewport: { width: 360, height: 780 }, touch: false },
];

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 80 });
}

async function toCity(page: Page, press: (n: string | RegExp) => Promise<void>, tag: string, scheme: string) {
  await press('▶ Παίξε');
  await page.waitForTimeout(400);
  await shot(page, `02-slots-empty-${tag}-${scheme}`);
  await press('Νέο παιχνίδι');
  await page.getByLabel('Πώς λένε τον ήρωα;').fill('Δοκιμή');
  await page.waitForTimeout(400);
  await shot(page, `03-create-${tag}-${scheme}`);
  await press(/Ξεκίνα την περιπέτεια/);
  await page.waitForTimeout(400);
  await shot(page, `04-intro-${tag}-${scheme}`);
  await press(/Πάμε να ετοιμαστώ/);
  await page.waitForTimeout(700);
  await shot(page, `05-house-${tag}-${scheme}`);
  await press(/Βγες στην πόλη/);
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
}

const at = (page: Page, x: number, y: number, hour: number) =>
  page.evaluate(([px, py, h]) => {
    CONFIG.forceHour = h;
    G.hero.x = px; G.hero.y = py; G.cam.x = px; G.cam.y = py - 30;
  }, [x, y, hour]);

test.describe('evidence screenshots', () => {
  test.skip(!DIR, 'only with EVIDENCE=<folder>');
  for (const sz of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      test.describe(`${sz.tag} ${scheme}`, () => {
        test.use({ viewport: sz.viewport, hasTouch: sz.touch, isMobile: sz.touch, deviceScaleFactor: 1 });
        test(`all screens ${sz.tag} ${scheme}`, async ({ page }, info) => {
          test.skip(info.project.name !== 'desktop');
          test.setTimeout(120_000);
          await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
          await page.addInitScript(() => { (window as any).__KM_TEST__ = { config: { forceHour: 10, slowFrameMs: 1e9 } }; });
          const press = async (name: string | RegExp) => {
            const b = page.getByRole('button', { name }).first();
            await expect(b).toBeVisible();
            await (sz.touch ? b.tap() : b.click());
          };
          await page.goto('/');
          await page.waitForTimeout(1500);
          await shot(page, `01-title-${sz.tag}-${scheme}`);
          await toCity(page, press, sz.tag, scheme);
          await at(page, 2050, 930, 12);
          await page.waitForTimeout(1300);
          await shot(page, `06-city-day-${sz.tag}-${scheme}`);
          await page.evaluate(() => { G.toasts = []; });
          await at(page, 1060, 1300, 22);
          await page.waitForTimeout(1300);
          await shot(page, `07-city-night-${sz.tag}-${scheme}`);
          // a hidden battle (public little shadow monsters) at a quiet spot, by day
          await at(page, 600, 1240, 15);
          await page.evaluate(() => { const m = G.monsters.find((x: any) => x.id === 'm0'); startFight(m); });
          await page.waitForTimeout(1600);
          await shot(page, `08-fight-mini-${sz.tag}-${scheme}`);
          await page.evaluate(() => G.fight.enemies.forEach((e: any) => hitEnemy(e, 1e6)));
          await page.waitForTimeout(700);
          await shot(page, `09-win-${sz.tag}-${scheme}`);
          await page.waitForTimeout(2200);
          // the rainbow cat (named in the intro) by sunset
          await at(page, 520, 1960, 18.4);
          await page.evaluate(() => { const m = G.monsters.find((x: any) => x.id === 'cat'); startFight(m); });
          await page.waitForTimeout(2200);
          await shot(page, `10-fight-boss-${sz.tag}-${scheme}`);
          await page.keyboard.press('KeyP');
          await page.waitForTimeout(400);
          await shot(page, `11-pause-${sz.tag}-${scheme}`);
          await page.keyboard.press('KeyP');
          await page.evaluate(() => loseFight());
          await expect.poll(() => page.evaluate(() => (document.querySelector('#screen h2') || {} as any).textContent || ''), { timeout: 10_000 }).toContain('Κουράστηκες');
          await page.waitForTimeout(400);
          await shot(page, `12-lost-${sz.tag}-${scheme}`);
          await page.evaluate(() => { G.S.bosses = BOSSES.map((b: any) => b.id); G.paused = false; (document.getElementById('screen') as HTMLElement).hidden = true; startEnding(); });
          await page.waitForTimeout(3200);
          await shot(page, `13-ending-${sz.tag}-${scheme}`);
          await expect.poll(() => page.evaluate(() => (document.querySelector('#screen h2') || {} as any).textContent || ''), { timeout: 10_000 }).toContain('Μπράβο');
          await page.waitForTimeout(400);
          await shot(page, `14-end-${sz.tag}-${scheme}`);
        });
      });
    }
  }
});
