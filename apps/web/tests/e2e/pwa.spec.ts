import { expect, test, type Page, type Route } from '@playwright/test';
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
  await expect(page.getByRole('heading', { level: 1, name: 'Chào Anh' })).toBeVisible({ timeout: 15_000 });
  await waitForController(page);

  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // Supabase is never cached nor handled by the worker: the page's route mocks keep answering.
  await expect(page.getByRole('heading', { level: 1, name: 'Chào Anh' })).toBeVisible({ timeout: 15_000 });
});

test('an offline reload of /app serves the app shell with the offline banner', async ({ page, context }) => {
  await mockSupabase(page, { paths: [pathRow()] });
  await signIn(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'Chào Anh' })).toBeVisible({ timeout: 15_000 });
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

const STORAGE_KEY = 'sb-e2e-auth-token'; // fixtures.ts: supabase-js's sb-<first host label>-auth-token for https://e2e.invalid

// The case that used to bounce an installed learner to /dang-nhap: the phone is opened without signal the morning
// after, so the stored access token is long expired and the refresh cannot reach the server. supabase-js retries the
// refresh for ~25 s and then answers "no session"; the app must stay signed in on the stored session and open the
// home screen from the copy of the profile and path saved on the device.
test('an offline cold start with an expired access token stays signed in and opens the home screen', async ({ page, context }) => {
  await mockSupabase(page, { paths: [pathRow()] });
  await signIn(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'Chào Anh' })).toBeVisible({ timeout: 15_000 });
  await waitForController(page);

  // From now on every page load finds a session that expired two hours ago (registered after signIn's init script).
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  expect(stored).toBeTruthy();
  const expired = { ...(JSON.parse(stored!) as Record<string, unknown>), expires_at: Math.floor(Date.now() / 1000) - 7200 };
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(expired)] as const);

  await context.setOffline(true);
  // Routed requests are answered by Playwright before the network layer, so setOffline alone would still let the
  // Supabase mocks reply: make the real offline behaviour explicit (the last registered route wins).
  const refuseSupabase = (route: Route) => route.abort('internetdisconnected');
  await page.route(/e2e.invalid/, refuseSupabase);
  try {
    const started = Date.now();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Chào Anh' })).toBeVisible({ timeout: 15_000 });
    // Well under the ~25 s supabase-js spends retrying the refresh.
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(new URL(page.url()).pathname).not.toContain('dang-nhap');
    await expect(page.getByText('Bạn đang ngoại tuyến — tiến độ sẽ được lưu khi có mạng')).toBeVisible();
    // The session was only read, never removed: it is still there for the moment the network is back.
    expect(await page.evaluate((key) => window.localStorage.getItem(key) !== null, STORAGE_KEY)).toBe(true);
  } finally {
    await page.unroute(/e2e.invalid/, refuseSupabase);
    await context.setOffline(false);
  }
});
