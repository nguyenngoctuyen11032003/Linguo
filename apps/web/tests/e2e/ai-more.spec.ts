import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  DEMO_LESSONS,
  expectNoHorizontalScroll,
  mockSupabase,
  pathRow,
  PROGRESS_PATH_ID,
  settleAnimations,
  signIn,
  type AiMockOptions,
  type PlannerMockOptions,
} from './fixtures';

// Spec 8.2: analyze_sentence (tutor page), summarize_session (session completion) and plan_review (Progress page),
// with functions/v1/ai-tutor and the AI RPCs mocked. Without AI each screen keeps working.

const PATH_ID = PROGRESS_PATH_ID;
const EN_PATH = pathRow({ id: PATH_ID, language_code: 'en', current_level: 'pre_a1', target_level: 'a1' });
const HELLO = DEMO_LESSONS.enHello;
const ACKED = '2026-10-01T03:00:00Z';

async function setup(page: Page, opts: { ai?: AiMockOptions; planner?: PlannerMockOptions } = {}) {
  if (test.info().timeout < 60_000) test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [EN_PATH], ai: opts.ai ?? { ackAt: ACKED }, progress: {}, planner: opts.planner });
  await signIn(page);
  return mock;
}

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name });

async function expectNoSeriousAxe(page: Page, label: string) {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, `${label}: ${JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)}`).toEqual([]);
}

async function expectInsideViewport(page: Page, target: Locator) {
  const box = await target.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width + 1).toBe(true);
}

// ---- analyze_sentence: the tutor page ---------------------------------------------------------------------------

async function openTutor(page: Page) {
  await page.goto('/app/gia-su');
  await expect(page.getByRole('heading', { level: 1, name: 'Gia sư AI' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Phân tích câu' }).click();
}

async function analyze(page: Page, sentence: string) {
  const panel = page.getByRole('tabpanel', { name: 'Phân tích câu' });
  await panel.getByLabel('Câu bạn muốn phân tích').fill(sentence);
  await panel.getByRole('button', { name: 'Phân tích câu' }).click();
  return panel;
}

test('tutor: analyzes a sentence into tokens, components and grammar points', async ({ page }) => {
  const mock = await setup(page);
  await openTutor(page);
  const panel = await analyze(page, 'I am a student.');
  await expect(panel.getByText('Tôi là học sinh.')).toBeVisible();
  // The answer's heading takes focus so screen-reader users learn it arrived.
  await expect(panel.getByRole('heading', { level: 3, name: 'I am a student.' })).toBeFocused();
  await expectNoSeriousAxe(page, 'tutor sentence result');
  const tokens = panel.getByRole('list', { name: 'Từ loại từng từ' }).getByRole('listitem');
  await expect(tokens).toHaveCount(4);
  await expect(tokens.first()).toContainText('đại từ');
  await expect(panel.getByRole('list', { name: 'Thành phần câu' })).toContainText('Chủ ngữ');
  await expect(panel.getByRole('list', { name: 'Điểm ngữ pháp' })).toBeVisible();
  expect(mock.ai.requests()[0]).toEqual({ task: 'analyze_sentence', language: 'en', level: 'pre_a1', sentence: 'I am a student.' });
  await expectNoHorizontalScroll(page);
});

test('tutor: a sentence is required, and the AI text is rendered as text', async ({ page }) => {
  const mock = await setup(page, { ai: { ackAt: ACKED, mode: 'html' } });
  await openTutor(page);
  const panel = page.getByRole('tabpanel', { name: 'Phân tích câu' });
  await panel.getByRole('button', { name: 'Phân tích câu' }).click();
  await expect(page.getByRole('alert')).toContainText('Hãy nhập một câu để phân tích.');
  expect(mock.ai.requests()).toHaveLength(0);
  await analyze(page, 'I am a student.');
  await expect(panel.getByRole('list', { name: 'Từ loại từng từ' })).toBeVisible();
  await expect(page.locator('#ai-injected')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __aiXss?: number }).__aiXss)).toBeUndefined();
});

test('tutor: Gemini down shows the fallback and the other tabs keep working', async ({ page }) => {
  const mock = await setup(page, { ai: { ackAt: ACKED, mode: 'ai_unavailable' } });
  await openTutor(page);
  await analyze(page, 'I am a student.');
  await expect(page.getByRole('alert').filter({ hasText: 'Tạm thời không khả dụng' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  // Non-AI mode: the page still navigates and the other tab is usable; AI comes back without a reload.
  await page.getByRole('tab', { name: 'Hỏi khái niệm' }).click();
  await expect(page.getByLabel('Bạn muốn hiểu điều gì?')).toBeVisible();
  mock.ai.setMode('ok');
  await page.getByRole('tab', { name: 'Phân tích câu' }).click();
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByText('Tôi là học sinh.')).toBeVisible();
});

test('tutor: out of quota shows the quota notice and switches the submit button off', async ({ page }) => {
  await setup(page, { ai: { ackAt: ACKED, mode: 'quota_exceeded' } });
  await openTutor(page);
  const panel = await analyze(page, 'I am a student.');
  const notice = page.getByRole('alert').filter({ hasText: 'Đã hết lượt hôm nay' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Lượt mới sẽ có');
  await expect(notice).not.toContainText('Tạm thời không khả dụng');
  await expect(page.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
  const submit = panel.getByRole('button', { name: 'Phân tích câu' });
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAccessibleDescription(/Bạn đã dùng hết lượt hỏi AI hôm nay/);
  await expectNoHorizontalScroll(page);
  await expectNoSeriousAxe(page, 'tutor quota');
});

// ---- summarize_session: the completion screen -------------------------------------------------------------------

function activity(id: string, overrides: Record<string, unknown>) {
  return { id, kind: 'lesson', minutes: 5, lesson_id: null, review_limit: null, priority: 60, status: 'done', seconds_spent: 300, ...overrides };
}

const COMPLETED_SESSION = {
  status: 'completed',
  started_at: '2026-10-13T01:00:00Z',
  completed_at: '2026-10-13T01:20:00Z',
  plan: {
    minutes: 30,
    focus_vi: 'Ưu tiên ôn tập: 4 thẻ đến hạn',
    backlog_mode: false,
    activities: [
      activity('a1', { kind: 'review', minutes: 6, review_limit: 25, title_vi: 'Ôn thẻ đến hạn TIEU_DE_RIENG', reason_vi: 'LY_DO_RIENG', seconds_spent: 360 }),
      activity('a2', { kind: 'lesson', minutes: 9, lesson_id: HELLO.id, title_vi: HELLO.title.vi, reason_vi: 'Bài tiếp theo', seconds_spent: 540 }),
      activity('a3', { kind: 'recap', minutes: 3, title_vi: 'Tổng kết', reason_vi: 'Xem lại lỗi sai', status: 'skipped', seconds_spent: 0 }),
    ],
  },
};

const RECAP = [1, 2, 3].map((n) => ({
  attempt_id: `7ecab000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  lesson_id: HELLO.id,
  exercise_id: `7ecab001-0000-4000-8000-${String(n).padStart(12, '0')}`,
  exercise_type: n === 3 ? 'translate' : 'mcq',
  prompt_text: `CAU_HOI_RIENG ${n}`,
  expected_answer: 'DAP_AN_RIENG',
  learner_answer: 'TRA_LOI_RIENG',
  created_at: new Date().toISOString(),
}));

async function openCompletedSession(page: Page) {
  await page.goto('/app/phien-hoc');
  await expect(page.getByRole('heading', { name: 'Hoàn thành phiên học' })).toBeVisible({ timeout: 15_000 });
}

test('session: the AI recap is built from numbers and tags, never from titles or answers', async ({ page }) => {
  const mock = await setup(page, { planner: { session: COMPLETED_SESSION, recap: RECAP } });
  await openCompletedSession(page);
  await page.getByRole('button', { name: 'Tóm tắt phiên bằng AI' }).click();
  const sheet = dialog(page, 'Tóm tắt phiên học');
  await expect(sheet).toContainText('Hôm nay bạn đã học đều tay, làm tốt lắm!');
  await expect(sheet.getByRole('list', { name: 'Lỗi cần nhớ' })).toContainText('Trắc nghiệm');
  await expect(sheet).toContainText('Mai ôn lại các thẻ đến hạn trước nhé.');

  const request = mock.ai.requests()[0]!;
  expect(request).toMatchObject({
    task: 'summarize_session',
    language: 'en',
    level: 'pre_a1',
    minutes: 15,
    activities: [
      { kind: 'review', status: 'done', minutes: 6 },
      { kind: 'lesson', status: 'done', minutes: 9 },
      { kind: 'recap', status: 'skipped', minutes: 3 },
    ],
    error_tags: [
      { tag: 'mcq', count: 2 },
      { tag: 'translate', count: 1 },
    ],
  });
  const json = JSON.stringify(request);
  for (const secret of ['RIENG', HELLO.title.vi]) expect(json).not.toContain(secret);
  await expectNoHorizontalScroll(page);
  await expectInsideViewport(page, sheet.getByRole('button', { name: 'Đóng', exact: true }));

  await sheet.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tóm tắt phiên bằng AI' })).toBeFocused();
});

test('session: without AI the completion screen still works and shows the plain recap', async ({ page }) => {
  await setup(page, { ai: { ackAt: ACKED, mode: 'quota_exceeded' }, planner: { session: COMPLETED_SESSION, recap: [] } });
  await openCompletedSession(page);
  await page.getByRole('button', { name: 'Tóm tắt phiên bằng AI' }).click();
  const sheet = dialog(page, 'Tóm tắt phiên học');
  await expect(sheet.getByRole('alert')).toContainText('Đã hết lượt hôm nay');
  await expect(sheet).toContainText('Bạn đã hoàn thành 2/3 hoạt động');
  await sheet.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Về trang chủ' })).toBeVisible();
  await page.getByRole('button', { name: 'Học thêm một phiên' }).click();
  await expect(page.getByRole('heading', { name: 'Thêm một phiên nữa?' })).toBeVisible();
});

// ---- plan_review: the Progress page -----------------------------------------------------------------------------

async function openProgress(page: Page) {
  await page.goto('/app/tien-do');
  await expect(page.getByRole('heading', { level: 2, name: 'Lỗi thường gặp', exact: true })).toBeVisible({ timeout: 15_000 });
}

test('progress: the review plan only links to lessons and tags from the detected gaps', async ({ page }) => {
  const mock = await setup(page);
  await openProgress(page);
  await page.getByRole('button', { name: 'Lập kế hoạch ôn bằng AI' }).click();
  const sheet = dialog(page, 'Kế hoạch ôn tập');
  const steps = sheet.getByRole('list', { name: 'Các bước ôn tập' }).getByRole('listitem');
  await expect(steps.first()).toContainText('Học lại bài Xin chào!');
  await expect(steps.first().getByRole('link', { name: 'Mở bài học' })).toHaveAttribute('href', `/app/hoc-tap/bai/${HELLO.id}`);
  await expect(sheet.getByRole('link', { name: 'Mở ôn tập' }).first()).toHaveAttribute('href', '/app/on-tap');

  const request = mock.ai.requests()[0] as { task: string; gaps: Array<{ kind: string; id: string; label: string; count: number }> };
  expect(request.task).toBe('plan_review');
  expect(request.gaps[0]).toEqual({ kind: 'lesson', id: HELLO.id, label: 'Xin chào!', count: 3 });
  expect(request.gaps.filter((g) => g.kind === 'tag').map((g) => g.id).sort()).toEqual(['fill_blank', 'translate']);
  expect(JSON.stringify(request)).not.toContain('She ___ to school');
  await expectNoHorizontalScroll(page);
});

test('progress: Gemini down keeps the mistakes list and its lesson links', async ({ page }) => {
  await setup(page, { ai: { ackAt: ACKED, mode: 'ai_unavailable' } });
  await openProgress(page);
  await page.getByRole('button', { name: 'Lập kế hoạch ôn bằng AI' }).click();
  const sheet = dialog(page, 'Kế hoạch ôn tập');
  await expect(sheet.getByRole('alert')).toContainText('Tạm thời không khả dụng');
  await sheet.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Học lại bài Xin chào!' })).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`no serious a11y violations in the three new AI views (${colorScheme})`, async ({ page }, testInfo) => {
    test.skip(!['iphone-15-pro', 'pixel-7'].includes(testInfo.project.name), 'a11y runs on two devices');
    test.setTimeout(120_000);
    await setup(page, { planner: { session: COMPLETED_SESSION, recap: RECAP } });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });

    await openTutor(page);
    const panel = await analyze(page, 'I am a student.');
    await expect(panel.getByRole('list', { name: 'Từ loại từng từ' })).toBeVisible();
    await expectNoSeriousAxe(page, 'analyze_sentence');
    await expectNoHorizontalScroll(page);

    await openCompletedSession(page);
    await page.getByRole('button', { name: 'Tóm tắt phiên bằng AI' }).click();
    await expect(dialog(page, 'Tóm tắt phiên học')).toContainText('làm tốt lắm');
    await expectNoSeriousAxe(page, 'summarize_session');

    await openProgress(page);
    await page.getByRole('button', { name: 'Lập kế hoạch ôn bằng AI' }).click();
    await expect(dialog(page, 'Kế hoạch ôn tập').getByRole('list', { name: 'Các bước ôn tập' })).toBeVisible();
    await expectNoSeriousAxe(page, 'plan_review');
  });
}
