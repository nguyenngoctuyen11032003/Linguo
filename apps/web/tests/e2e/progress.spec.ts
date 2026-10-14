import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, mockSupabase, pathRow, PROGRESS_PATH_ID, signIn, type ProgressMockOptions } from './fixtures';

const PATH = pathRow({ id: PROGRESS_PATH_ID });

async function setup(page: Page, progress: ProgressMockOptions = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [PATH], progress });
  await signIn(page);
  return mock;
}

const h1 = (page: Page) => page.getByRole('heading', { level: 1, name: 'Tiến độ' });
const h2 = (page: Page, name: string) => page.getByRole('heading', { level: 2, name, exact: true });

async function openProgress(page: Page, query = '') {
  await page.goto(`/app/tien-do${query}`);
  await expect(h1(page)).toBeVisible();
  await expect(h2(page, 'Năng lực ước lượng')).toBeVisible({ timeout: 15_000 });
}

test('shows activity, learning, competence, mistakes and motivation apart', async ({ page }) => {
  const mock = await setup(page);
  await openProgress(page);
  for (const name of ['Hoạt động', 'Kết quả làm bài', 'Năng lực ước lượng', 'Lỗi thường gặp', 'Động lực']) {
    await expect(h2(page, name)).toBeVisible();
  }
  await expect(page.getByRole('heading', { level: 3, name: 'Theo kỹ năng' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Theo dạng bài' })).toBeVisible();
  await expect(page.getByText('Cách tính các số liệu')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Học lại bài Xin chào!' })).toBeVisible();
  expect(mock.progress.dashboardCalls()).toEqual([{ pathId: PROGRESS_PATH_ID, range: 7 }]);
  await expectNoHorizontalScroll(page);
});

test('switches the range and keeps it in ?khoang=', async ({ page }) => {
  const mock = await setup(page);
  await openProgress(page, '?khoang=14');
  const group = page.getByRole('group', { name: 'Khoảng thời gian' });
  await expect(group.getByRole('button', { name: '14 ngày' })).toHaveAttribute('aria-pressed', 'true');
  await group.getByRole('button', { name: '28 ngày' }).click();
  await expect(page).toHaveURL(/\/app\/tien-do\?khoang=28$/);
  // The router renders the new search params in a transition: allow for slow emulated devices under load.
  await expect(group.getByRole('button', { name: '28 ngày' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await expect.poll(() => mock.progress.dashboardCalls().map((c) => c.range), { timeout: 15_000 }).toEqual([14, 28]);
  await expect(page.getByText('Bạn đã học bao lâu trong 28 ngày qua', { exact: false })).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page);
});

test('celebrates a new badge once', async ({ page }) => {
  await setup(page, { newBadges: ['lessons_10'] });
  await openProgress(page);
  await expect(page.getByText('Bạn vừa nhận huy hiệu "10 bài học".')).toBeVisible();
  await page.reload();
  await expect(h2(page, 'Động lực')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Bạn vừa nhận huy hiệu "10 bài học".')).toHaveCount(0);
});

test('shows the no-data state with a way to start learning', async ({ page }) => {
  await setup(page, { empty: true });
  await openProgress(page);
  await expect(h2(page, 'Chưa có hoạt động trong 7 ngày qua')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Đi tới bài học' })).toHaveAttribute('href', '/app/hoc-tap');
  await expect(h2(page, 'Hoạt động')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test('home shows the motivation strip with a link to Tiến độ', async ({ page }) => {
  await setup(page);
  await page.goto('/app');
  const link = page.getByRole('link', { name: 'Xem tiến độ' });
  await expect(link).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Chuỗi 6 buổi')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await link.click();
  await expect(h1(page)).toBeVisible({ timeout: 15_000 });
});

test('motivation can be switched off in Settings', async ({ page }) => {
  const mock = await setup(page);
  await page.goto('/app/cai-dat');
  const toggle = page.getByRole('switch', { name: 'Hiện chuỗi ngày, XP và huy hiệu' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(mock.progress.prefs().show_motivation).toBe(false);

  await openProgress(page);
  await expect(h2(page, 'Hoạt động')).toBeVisible();
  await expect(h2(page, 'Động lực')).toHaveCount(0);

  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chào Minh Anh', { timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Xem tiến độ' })).toHaveCount(0);
});

test('sends progress_viewed and page_view without personal data', async ({ page }) => {
  const mock = await setup(page);
  await openProgress(page);
  // Hiding the page flushes the analytics queue right away instead of after 10 s.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect.poll(() => mock.progress.events().map((e) => e.name)).toEqual(expect.arrayContaining(['page_view', 'progress_viewed']));
  const viewed = mock.progress.events().find((e) => e.name === 'progress_viewed')!;
  expect(viewed.route).toBe('/app/tien-do');
  expect(viewed.props).toEqual({ range_days: 7 });
  expect(JSON.stringify(mock.progress.events())).not.toContain('minhanh@example.com');
});

test('opting out of analytics stops sending events', async ({ page }) => {
  const mock = await setup(page, { analyticsOptOut: true });
  await openProgress(page);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(300);
  expect(mock.progress.events()).toEqual([]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`no serious a11y violations on /app/tien-do (${colorScheme})`, async ({ page }, testInfo) => {
    test.skip(!['iphone-15-pro', 'pixel-7'].includes(testInfo.project.name), 'a11y runs on two devices');
    await setup(page);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    await openProgress(page);
    await expect(h2(page, 'Động lực')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
  });
}
