// README screenshots (docs/screens/*.jpg). Not part of CI: runs only with SHOTS=1, desktop project:
//   SHOTS=1 npx playwright test tests/shots.spec.ts --project=desktop
// Camera spots stay far from every hidden monster's place, so no screenshot gives a secret away.
import { expect, test, type Page } from '@playwright/test';

declare const G: any;
const DIR = 'docs/screens';

async function hook(page: Page, hour: number) {
  await page.addInitScript((h) => { (window as any).__KM_TEST__ = { config: { forceHour: h, slowFrameMs: 1e9 } }; }, hour);
}

async function city(page: Page, x: number, y: number) {
  await page.goto('/');
  await page.getByRole('button', { name: '▶ Παίξε' }).click();
  await page.getByRole('button', { name: 'Νέο παιχνίδι' }).first().click();
  await page.getByLabel('Πώς λένε τον ήρωα;').fill('Δοκιμή');
  await page.getByRole('button', { name: /Ξεκίνα την περιπέτεια/ }).click();
  await page.getByRole('button', { name: /Πάμε να ετοιμαστώ/ }).click();
  await page.getByRole('button', { name: /Βγες στην πόλη/ }).click();
  await expect.poll(() => page.evaluate(() => G.mode)).toBe('city');
  await page.evaluate(([px, py]) => { G.hero.x = px; G.hero.y = py; G.cam.x = px; G.cam.y = py - 30; G.toasts = []; }, [x, y]);
  await page.waitForTimeout(1200);
}

test.describe('README screenshots', () => {
  test.skip(!process.env.SHOTS, 'only with SHOTS=1');
  test.use({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 });

  for (const [scheme, hour] of [['light', 10], ['dark', 21.5]] as const) {
    test(`title, ${scheme} shell`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop');
      await page.emulateMedia({ colorScheme: scheme });
      await hook(page, hour);
      await page.goto('/');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${DIR}/title-${scheme}.jpg`, type: 'jpeg', quality: 82 });
    });
  }

  for (const [name, hour, x, y] of [['city-day', 12, 2050, 930], ['city-sunset', 18.6, 2050, 1150], ['city-night', 22, 1060, 1300]] as const) {
    test(name, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop');
      await hook(page, hour);
      await city(page, x, y);
      await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 82 });
    });
  }
});
