import { defineConfig } from '@playwright/test';

// PW_PORT: another port for the stand-in hub when 4173 is taken on this machine (default 4173, as in CI).
const port = Number(process.env.PW_PORT || 4173);

// Chromium projects: a desktop with keyboard, a landscape tablet with touch (GAME-STANDARD §3, §7), and for the
// dress-up spec also a landscape phone and two portrait windows.
export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium' },
  webServer: {
    command: 'node tests/serve.mjs',
    env: { PORT: String(port) },
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    {
      name: 'tablet',
      use: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    // Dress-up (tests/dressup.spec.ts) and graphics (tests/gfx.spec.ts) also on a landscape phone (touch; the boat
    // regression tests/boat.spec.ts too) and two
    // portrait windows. Portrait runs without touch: on a touch device in portrait the game shows its «γύρισε τη
    // συσκευή» screen instead.
    {
      name: 'phone',
      testMatch: /(dressup|gfx|boat)\.spec\.ts/,
      use: { viewport: { width: 780, height: 360 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    { name: 'narrow-portrait', testMatch: /(dressup|gfx)\.spec\.ts/, use: { viewport: { width: 360, height: 780 } } },
    { name: 'tablet-portrait', testMatch: /(dressup|gfx)\.spec\.ts/, use: { viewport: { width: 820, height: 1180 } } },
  ],
});
