import { expect, test, type Page } from '@playwright/test';
import { mockSupabase, pathRow, signIn } from './fixtures';

// Spec 10 §4 against the production preview build: the service worker installs and controls the app, an offline
// reload of /app is answered from the precached shell, and the manifest is linked. Every other spec blocks service
// workers (playwright.config.ts); this file opts back in.
test.use({ serviceWorkers: 'allow' });

test.beforeEach(({ browserName }) => {
  // Chromium is the browser whose service worker support Playwright drives reliably (WebKit runs without one).
  test.skip(browserName !== 'chromium', 'service worker checks run on Chromium projects');
});

async function waitForController(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state ?? null), { timeout: 15_000 }).toBe('activated');
}

test('the manifest is linked and served', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const response = await page.request.get(new URL(href!, page.url()).href);
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as { name?: string; start_url?: string; icons?: unknown[] };
  expect(manifest.name).toContain('Linguo');
  expect(manifest.icons?.length).toBeGreaterThan(0);
});

test('the service worker controls the app after a reload and Supabase mocks still answer', async ({ page }) => {
  await mockSupabase(page, { paths: [pathRow()] });
  await signIn(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'Chào Minh Anh' })).toBeVisible({ timeout: 15_000 });
  await waitForController(page);

  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // Supabase is never cached nor handled by the worker: the page's route mocks keep answering.
  await expect(page.getByRole('heading', { level: 1, name: 'Chào Minh Anh' })).toBeVisible({ timeout: 15_000 });
});

test('an offline reload of /app serves the app shell with the offline banner', async ({ page, context }) => {
  await mockSupabase(page, { paths: [pathRow()] });
  await signIn(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'Chào Minh Anh' })).toBeVisible({ timeout: 15_000 });
  await waitForController(page);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByText('Bạn đang ngoại tuyến — tiến độ sẽ được lưu khi có mạng')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Bỏ qua tới nội dung' })).toBeAttached();
    await expect(page.getByRole('banner')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
