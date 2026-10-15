import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_LESSONS, expectNoHorizontalScroll, mockSupabase, pathRow, settleAnimations, signIn, type PlannerMockOptions } from './fixtures';

// Spec 6 §5: the session page against mocked RPCs. Returning from a lesson/review to the session is covered with the
// lesson player and review integration.

const PATH_ID = '30000000-0000-4000-8000-0000000000e2';
const EN_PATH = pathRow({ id: PATH_ID, language_code: 'en', current_level: 'pre_a1', target_level: 'a1' });
const HELLO = DEMO_LESSONS.enHello;
const I_AM = DEMO_LESSONS.enIAm;

function activity(id: string, overrides: Record<string, unknown>) {
  return { id, kind: 'lesson', minutes: 5, lesson_id: null, review_limit: null, priority: 60, status: 'pending', seconds_spent: 0, ...overrides };
}

function seededPlan(statuses: string[] = ['pending', 'pending', 'pending', 'pending']) {
  const activities = [
    activity('a1', { kind: 'review', minutes: 6, review_limit: 25, title_vi: 'Ôn thẻ đến hạn', reason_vi: '4 thẻ đến hạn, 1 thẻ quá hạn', priority: 90 }),
    activity('a2', { kind: 'lesson', minutes: 9, lesson_id: HELLO.id, title_vi: HELLO.title.vi, reason_vi: 'Bài tiếp theo trong lộ trình A1' }),
    activity('a3', { kind: 'practice', minutes: 9, lesson_id: I_AM.id, title_vi: I_AM.title.vi, reason_vi: 'Ngữ pháp đang đúng 58% trong 2 tuần qua' }),
    activity('a4', { kind: 'recap', minutes: 3, title_vi: 'Tổng kết', reason_vi: 'Xem lại lỗi sai hôm nay', priority: 10 }),
  ].map((a, i) => ({ ...a, status: statuses[i], seconds_spent: statuses[i] === 'done' ? Number(a.minutes) * 60 : 0 }));
  return { minutes: 30, focus_vi: 'Ưu tiên ôn tập: 4 thẻ đến hạn', backlog_mode: false, activities };
}

/** A session_recap row as the SQL returns it. */
function recapRow(n: number, prompt: string, expected: string | null, answer: string | null, lessonId: string) {
  const id = (prefix: string) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return {
    attempt_id: id('7ecab000'),
    lesson_id: lessonId,
    exercise_id: id('7ecab001'),
    exercise_type: 'mcq',
    prompt_text: prompt,
    expected_answer: expected,
    learner_answer: answer,
    created_at: new Date().toISOString(),
  };
}

async function setup(page: Page, planner: PlannerMockOptions = {}) {
  // Each flow reloads the app at least once; WebKit devices are slow when the whole suite runs in parallel.
  if (test.info().timeout < 60_000) test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [EN_PATH], planner });
  await signIn(page);
  return mock;
}

async function openSessionPage(page: Page) {
  await page.goto('/app/phien-hoc');
  await expect(page.getByRole('heading', { level: 1, name: 'Phiên học hôm nay' })).toBeVisible();
  // Loading waits for the profile, the paths and today's session; every loaded state has an h2. Allow for slow CI.
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 15_000 });
}

const titles = (page: Page) => page.getByRole('list', { name: 'Các hoạt động của phiên' }).getByRole('heading', { level: 3 }).allTextContents();

async function expectNoSeriousAxe(page: Page, label: string) {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, `${label}: ${JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)}`).toEqual([]);
}

test('restores a planned session, reorders it with the keyboard and keeps the order after a reload', async ({ page }) => {
  const mock = await setup(page, { session: { status: 'planned', plan: seededPlan() } });
  await openSessionPage(page);
  await expect(page.getByRole('heading', { name: 'Ưu tiên ôn tập: 4 thẻ đến hạn' })).toBeVisible();
  await expect(page.getByText('Tiến độ: 0/4 hoạt động')).toBeVisible();
  await expect(page.getByText('Ngữ pháp đang đúng 58% trong 2 tuần qua')).toBeVisible();
  await expectNoHorizontalScroll(page);

  const up = page.getByRole('button', { name: `Đưa “${HELLO.title.vi}” lên` });
  await up.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => titles(page)).toEqual([HELLO.title.vi, 'Ôn thẻ đến hạn', I_AM.title.vi, 'Tổng kết']);
  await expect(page.getByText(`“${HELLO.title.vi}”: vị trí 1/4.`)).toBeAttached();
  // First now: the up arrow is disabled and focus stays on the same row.
  await expect(page.getByRole('button', { name: `Đưa “${HELLO.title.vi}” xuống` })).toBeFocused();
  await expect.poll(() => mock.planner.calls('reorder_session').length).toBe(1);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ưu tiên ôn tập: 4 thẻ đến hạn' })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => titles(page)).toEqual([HELLO.title.vi, 'Ôn thẻ đến hạn', I_AM.title.vi, 'Tổng kết']);

  await page.getByRole('button', { name: 'Bắt đầu phiên học' }).click();
  const sessionId = String(mock.planner.sessions()[0]?.id);
  await expect(page).toHaveURL(new RegExp(`/app/hoc-tap/bai/${HELLO.id}\\?phien=${sessionId}&muc=a2(&buoc=\\d+)?$`));
});

test('skips an activity, runs the recap and completes the session', async ({ page }) => {
  const mock = await setup(page, {
    session: { status: 'in_progress', started_at: new Date().toISOString(), plan: seededPlan(['done', 'done', 'pending', 'pending']) },
    recap: [
      recapRow(1, 'Chọn: I ___ a student', 'am', 'is', I_AM.id),
      recapRow(2, 'Dịch: xin chào', null, null, HELLO.id),
    ],
  });
  await openSessionPage(page);
  await expect(page.getByText('Tiến độ: 2/4 hoạt động')).toBeVisible();

  await page.getByRole('button', { name: `Bỏ qua “${I_AM.title.vi}”` }).click();
  await expect(page.getByText('Tiến độ: 3/4 hoạt động')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hoàn tác' })).toBeVisible();
  await expectNoSeriousAxe(page, 'undo offer');

  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByRole('heading', { name: 'Tổng kết: lỗi sai hôm nay' })).toBeFocused();
  await expect(page.getByText('Chọn: I ___ a student')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Giải thích AI' })).toHaveCount(2);
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Xong phần tổng kết' }).click();
  await expect(page.getByRole('heading', { name: 'Hoàn thành phiên học' })).toBeFocused();
  expect(mock.planner.calls('update_session_item').map(([, b]) => [b.p_item_id, b.p_status])).toEqual([
    ['a3', 'skipped'],
    ['a4', 'done'],
  ]);

  // The server keeps the completed session: a reload lands on the completion screen again.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hoàn thành phiên học' })).toBeVisible({ timeout: 15_000 });
});

test('plans a new session with the shared planner and shortens it', async ({ page }) => {
  const mock = await setup(page);
  await openSessionPage(page);
  await expect(page.getByRole('heading', { name: 'Lập kế hoạch hôm nay' })).toBeVisible();
  // pathRow plans 30 minutes every day.
  await expect(page.getByRole('button', { name: '30 phút', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Lập kế hoạch 30 phút' }).click();
  await expect(page.getByRole('button', { name: 'Bắt đầu phiên học' })).toBeVisible();
  expect(mock.planner.calls('save_session_plan').map(([, b]) => b.p_replace)).toEqual([false]);
  await expect(page.getByText('Phiên 30 phút')).toBeVisible();
  await expect(page.getByText('Tiến độ: 0/')).toBeVisible();

  await page.getByRole('button', { name: 'Rút gọn còn 10 phút' }).click();
  await expect(page.getByText(/^Phiên (?:[5-9]|10) phút$/)).toBeVisible();
  expect(mock.planner.calls('save_session_plan').map(([, b]) => b.p_replace)).toEqual([false, true]);

  // The 4 due cards come first: the review opens with its card limit.
  await page.getByRole('button', { name: 'Bắt đầu phiên học' }).click();
  await expect(page).toHaveURL(/\/app\/on-tap\?phien=[0-9a-f-]{36}&muc=a\d+&so-the=\d+$/);
});

test('?phut=10 from the home card preselects a 10-minute session', async ({ page }) => {
  const mock = await setup(page);
  await page.goto('/app/phien-hoc?phut=10');
  await expect(page.getByRole('button', { name: '10 phút', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Lập kế hoạch 10 phút' }).click();
  await expect(page.getByRole('button', { name: 'Bắt đầu phiên học' })).toBeVisible();
  const saved = mock.planner.calls('save_session_plan')[0]?.[1];
  expect(saved?.p_plan.minutes).toBeLessThanOrEqual(10);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`no serious a11y violations on the session page (${colorScheme})`, async ({ page }, testInfo) => {
    test.skip(!['iphone-15-pro', 'pixel-7'].includes(testInfo.project.name), 'a11y runs on two devices');
    test.setTimeout(90_000);
    await setup(page, {
      session: { status: 'in_progress', started_at: new Date().toISOString(), plan: seededPlan(['done', 'done', 'skipped', 'pending']) },
      recap: [recapRow(1, 'Chọn: I ___ a student', 'am', 'is', I_AM.id)],
    });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    await openSessionPage(page);
    await expect(page.getByText('Tiến độ: 3/4 hoạt động')).toBeVisible();
    await expectNoSeriousAxe(page, 'running session');

    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(page.getByText('Chọn: I ___ a student')).toBeVisible();
    await expectNoSeriousAxe(page, 'recap');

    await page.getByRole('button', { name: 'Xong phần tổng kết' }).click();
    await expect(page.getByRole('heading', { name: 'Hoàn thành phiên học' })).toBeVisible();
    await expectNoSeriousAxe(page, 'completed');

    await page.getByRole('button', { name: 'Học thêm một phiên' }).click();
    await expect(page.getByRole('heading', { name: 'Thêm một phiên nữa?' })).toBeVisible();
    await expectNoSeriousAxe(page, 'new session');
  });
}
