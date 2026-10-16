import { expect, test, type Page } from '@playwright/test';
import { DEMO_LESSONS, mockSupabase, pathRow, signIn } from './fixtures';

// Privacy-preserving client error reporting: a lazy chunk that fails to load shows the friendly error screen and
// sends ONE client_error event (route template, whitelisted props, no ids or query) through track_events; nothing is
// sent when analytics_opt_out is set.

const EN_PATH = pathRow({ id: 'path-en', language_code: 'en', current_level: 'pre_a1', target_level: 'a1' });
const LESSON_URL = `/app/hoc-tap/bai/${DEMO_LESSONS.enHello.id}?token=secret-value#frag`;

async function setup(page: Page, analyticsOptOut = false) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [EN_PATH], progress: { analyticsOptOut } });
  await signIn(page);
  // Force the lesson screen's chunk to fail like a flaky network / a stale deploy.
  await page.route(/\/assets\/LessonPage-[^/]*\.js/, (route) => route.abort());
  return mock;
}

// A deep link would sit on the hydrate fallback; a client-side navigation (like tapping a link) shows the route error.
async function openBrokenLesson(page: Page) {
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chào Anh', { timeout: 15_000 });
  await page.evaluate((url) => {
    history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, LESSON_URL);
}

// A failed lazy chunk while online reads as a stale deploy: the dedicated "new version" screen, whose action reloads.
const errorHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Đã có phiên bản mới' });

test('a failed chunk shows the friendly error and reports one anonymous client_error', async ({ page }) => {
  const mock = await setup(page);
  await openBrokenLesson(page);
  await expect(errorHeading(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Tải lại trang' })).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect.poll(() => mock.progress.events().filter((e) => e.name === 'client_error').length).toBeGreaterThan(0);
  const errors = mock.progress.events().filter((e) => e.name === 'client_error');
  expect(errors).toHaveLength(1);
  const [event] = errors;
  expect(event!.props).toMatchObject({ kind: 'chunk_load_error', code: 'ChunkLoadError' });
  expect(Object.keys(event!.props as object).sort()).toEqual(['code', 'kind', 'online']);
  expect(event!.route).toBe('/app/hoc-tap/bai/:id');

  const sent = JSON.stringify(mock.progress.events());
  expect(sent).not.toContain(DEMO_LESSONS.enHello.id);
  expect(sent).not.toContain('secret-value');
  expect(sent).not.toContain('frag');
  expect(sent).not.toContain('minhanh@example.com');
});

test('nothing is sent when analytics_opt_out is set', async ({ page }) => {
  const mock = await setup(page, true);
  await openBrokenLesson(page);
  await expect(errorHeading(page)).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(500);
  expect(mock.progress.events()).toEqual([]);
});
