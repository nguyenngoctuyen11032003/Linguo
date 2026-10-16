import { defineConfig, devices } from '@playwright/test';

// PLAYWRIGHT_PORT lets parallel checkouts on one machine each serve their own build. A server already on the
// port is only reused when PLAYWRIGHT_REUSE_SERVER=1: otherwise another checkout's stale preview could be tested.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4173);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    // The preview build registers the spec 10 service worker; page.route() mocks cannot see requests a worker makes,
    // so every spec runs without it. pwa.spec.ts opts back in with test.use({ serviceWorkers: 'allow' }).
    serviceWorkers: 'block',
    // No spec depends on motion, and the looping loader/skeleton/ambient animations kept CI runners busy enough
    // to be shut down mid-run; specs that call emulateMedia() still get reduced motion.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE'] } }, // 320px wide: the narrowest supported width
    { name: 'iphone-15-pro', use: { ...devices['iPhone 15 Pro'] } },
    { name: 'iphone-15-pro-max', use: { ...devices['iPhone 15 Pro Max'] } },
    { name: 'iphone-15-pro-landscape', use: { ...devices['iPhone 15 Pro landscape'] } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'galaxy-s9', use: { ...devices['Galaxy S9+'] } }, // 360px Android
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 60_000,
  },
});
