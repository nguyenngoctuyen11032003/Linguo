import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { EXERCISE_ID } from '../../src/features/admin/content-fixtures';
import { correctResponse, DEMO_LESSONS, expectNoHorizontalScroll, lessonExercises, mockSupabase, pathRow, settleAnimations, signIn, type AdminMockOptions } from './fixtures';

// Spec 11: content reports from the lesson player, the staff report queue at /quan-tri, and the 404 for learners.

const EN_PATH = pathRow({ id: 'path-en', language_code: 'en', current_level: 'pre_a1', target_level: 'a1' });
const [FIRST_EXERCISE] = lessonExercises(DEMO_LESSONS.enHello.id);
const FIRST_STEM = String(FIRST_EXERCISE!.prompt.stem);

async function setup(page: Page, admin: AdminMockOptions = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [EN_PATH], admin });
  await signIn(page);
  return mock;
}

const myReports = (page: Page) => page.getByRole('region', { name: 'Báo lỗi của tôi' });

test('a learner reports a lesson exercise and follows it in Settings', async ({ page }) => {
  expect(FIRST_EXERCISE!.exercise_type).toBe('mcq');
  const mock = await setup(page);
  await page.goto(`/app/hoc-tap/bai/${DEMO_LESSONS.enHello.id}`);
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 8 && !/^Câu \d+\/\d+$/.test((await heading.textContent()) ?? ''); i++) {
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  }
  await expect(heading).toHaveText(/^Câu 1\//);

  const optionId = correctResponse(FIRST_EXERCISE!).option_id;
  const option = (FIRST_EXERCISE!.prompt.options as Array<{ id: string; text: string }>).find((o) => o.id === optionId)!;
  await page.getByRole('radio', { name: option.text, exact: true }).click();
  await page.getByRole('button', { name: 'Kiểm tra', exact: true }).click();
  await expect(page.getByText('Chính xác', { exact: true })).toBeVisible();

  const trigger = page.getByRole('button', { name: 'Báo lỗi nội dung' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Báo lỗi nội dung' });
  await expect(dialog).toBeVisible();
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('radio', { name: 'Đề bài khó hiểu' }).click();
  await dialog.getByLabel('Ghi chú (không bắt buộc)').fill('Câu hỏi nên có ví dụ.');
  await dialog.getByRole('button', { name: 'Gửi báo lỗi' }).click();
  await expect(dialog.getByRole('status')).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng' }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  expect(mock.admin.reports()).toMatchObject([{ target_kind: 'exercise', target_id: FIRST_EXERCISE!.id, reason: 'unclear', note: 'Câu hỏi nên có ví dụ.' }]);

  await page.goto('/app/cai-dat#bao-loi');
  const section = myReports(page);
  await expect(section.getByText(FIRST_STEM)).toBeVisible({ timeout: 15_000 });
  await expect(section.getByText('Đang chờ xem')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('a staff member resolves a report from the queue and the learner sees it fixed', async ({ page }) => {
  const mock = await setup(page, {
    staffRole: 'reviewer',
    reports: [{ target_kind: 'exercise', target_id: FIRST_EXERCISE!.id, reason: 'wrong_answer', note: 'Đáp án B cũng đúng' }],
  });
  await page.goto('/quan-tri');
  await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('banner').getByText('Quản trị', { exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');

  await page.getByRole('navigation', { name: 'Điều hướng quản trị' }).getByRole('link', { name: 'Báo lỗi' }).click();
  await expect(page).toHaveURL(/\/quan-tri\/bao-loi$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Báo lỗi nội dung' })).toBeVisible();
  await page.getByRole('checkbox', { name: `Chọn "${FIRST_STEM}"` }).check();
  await expect(page.getByLabel('Đánh dấu là')).toHaveValue('fixed');
  await page.getByLabel('Ghi chú xử lý (người báo lỗi sẽ thấy)').fill('Đã sửa đáp án trong bản 2.');
  await page.getByRole('button', { name: 'Áp dụng cho 1 báo lỗi' }).click();
  await expect(page.getByText('Đã đánh dấu 1 báo lỗi là "Đã sửa".')).toBeVisible();
  await expect(page.getByText('Không có báo lỗi', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(mock.admin.reports()).toMatchObject([{ status: 'fixed', resolution_note: 'Đã sửa đáp án trong bản 2.' }]);

  await page.goto('/app/cai-dat#bao-loi');
  const section = myReports(page);
  await expect(section.getByText('Đã sửa', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(section.getByText('Đã sửa đáp án trong bản 2.')).toBeVisible();
});

for (const path of ['/quan-tri', '/quan-tri/bao-loi', '/quan-tri/nhat-ky']) {
  test(`a learner at ${path} gets the ordinary 404 page`, async ({ page }) => {
    const mock = await setup(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Quản trị', { exact: true })).toHaveCount(0);
    expect(mock.admin.adminCalls()).toEqual([]);
    await expectNoHorizontalScroll(page);
  });
}

const ADMIN_PAGES = [
  { path: '/quan-tri', heading: 'Tổng quan' },
  { path: '/quan-tri/noi-dung', heading: 'Nội dung' },
  { path: `/quan-tri/noi-dung/exercise/${EXERCISE_ID}`, heading: null },
  { path: '/quan-tri/bao-loi', heading: 'Báo lỗi nội dung' },
  { path: '/quan-tri/nguon', heading: 'Nguồn và giấy phép' },
  { path: '/quan-tri/thong-ke', heading: 'Thống kê' },
  { path: '/quan-tri/nhat-ky', heading: 'Nhật ký quản trị' },
];

for (const { path, heading } of ADMIN_PAGES) {
  test(`${path}: no horizontal scroll and no serious a11y violations`, async ({ page }, testInfo) => {
    await setup(page, {
      staffRole: 'admin',
      reports: [{ target_kind: 'exercise', target_id: FIRST_EXERCISE!.id, reason: 'wrong_answer', note: 'Đáp án B cũng đúng' }],
    });
    const h1 = heading ? page.getByRole('heading', { level: 1, name: heading }) : page.getByRole('heading', { level: 1 });
    const open = async () => {
      await page.goto(path);
      await expect(h1).toBeVisible({ timeout: 15_000 });
      // Wait for the page data, not only the heading (skeletons are role="status").
      await expect(page.getByRole('main').locator('[role="status"][aria-label^="Đang tải"]')).toHaveCount(0);
      await settleAnimations(page);
    };
    await open();
    await expectNoHorizontalScroll(page);

    if (!['iphone-15-pro', 'pixel-7'].includes(testInfo.project.name)) return;
    for (const colorScheme of ['light', 'dark'] as const) {
      // A fresh load per scheme: switching in place would catch colour transitions half way.
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
      await open();
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      const summary = serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }));
      expect(serious, `${colorScheme}: ${JSON.stringify(summary, null, 2)}`).toEqual([]);
    }
  });
}
