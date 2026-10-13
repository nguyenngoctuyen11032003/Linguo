import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  AI_HTML_PAYLOAD,
  correctResponse,
  DEMO_LESSONS,
  expectNoHorizontalScroll,
  lessonExercises,
  mockSupabase,
  pathRow,
  signIn,
  type AiMockOptions,
} from './fixtures';

// Spec 5 §6: the AI tutor through the UI, with functions/v1/ai-tutor and the AI RPCs mocked.

const EN_PATH = pathRow({ id: 'path-en', language_code: 'en', current_level: 'pre_a1', target_level: 'a1' });
const LESSON = DEMO_LESSONS.enHello;
const LESSON_TITLE = String((LESSON.title as { vi: string }).vi);
const CURATED = (LESSON.body as Array<{ type: string; text?: { vi: string } }>).find((b) => b.type === 'explain')!.text!.vi;
const ACKED = '2026-10-01T03:00:00Z';
const NOTICE_TITLE = 'Trước khi dùng Gia sư AI';
const AI_LABEL = 'Giải thích AI · có thể chưa chính xác';

type Row = ReturnType<typeof lessonExercises>[number];

async function setup(page: Page, ai: AiMockOptions = { ackAt: ACKED }) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [EN_PATH], ai });
  await signIn(page);
  return mock;
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/** Fill in the right answer through the UI (same controls as lesson.spec.ts). */
async function fillAnswer(page: Page, exercise: Row) {
  const prompt = exercise.prompt;
  const response = correctResponse(exercise);
  switch (exercise.exercise_type) {
    case 'mcq':
    case 'listen': {
      const option = prompt.options.find((o: { id: string }) => o.id === response.option_id);
      await page.getByRole('radio', { name: option.text, exact: true }).click();
      break;
    }
    case 'word_bank':
      for (const id of response.token_ids as string[]) {
        const token = prompt.tokens.find((t: { id: string }) => t.id === id);
        await page.getByRole('button', { name: `Thêm '${token.text}'`, exact: true }).first().click();
      }
      break;
    case 'fill_blank':
      for (const [i, blank] of (prompt.blanks as Array<{ id: string }>).entries()) {
        await page.getByLabel(`Chỗ trống ${i + 1}`).fill((response.blanks as Record<string, string>)[blank.id] ?? '');
      }
      break;
    default:
      await page.getByLabel('Bản dịch của bạn').fill(String(response.text));
  }
}

/** Opens the demo lesson, walks to its first exercise and answers it right: the AI buttons appear under the feedback. */
async function answerFirstExercise(page: Page) {
  await page.goto(`/app/hoc-tap/bai/${String(LESSON.id)}`);
  await expect(heading(page)).toHaveText(LESSON_TITLE, { timeout: 15_000 });
  for (let i = 0; i < 8 && !/^Câu \d+\/\d+$/.test((await heading(page).textContent()) ?? ''); i++) {
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  }
  const exercise = lessonExercises(String(LESSON.id))[0]!;
  await fillAnswer(page, exercise);
  await page.getByRole('button', { name: exercise.stage === 'recognition' ? 'Kiểm tra' : 'Chắc chắn', exact: true }).click();
  await expect(page.getByText('Chính xác', { exact: true })).toBeVisible();
  return exercise;
}

const sheet = (page: Page, name: 'Giải thích AI' | 'Vì sao?' = 'Giải thích AI') => page.getByRole('dialog', { name });

async function closeSheet(panel: Locator) {
  await panel.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(panel).toBeHidden();
}

async function expectInsideViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport, 'element and viewport must exist').toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

test('the privacy notice shows once, is acknowledged, then the lesson explanation loads', async ({ page }) => {
  const mock = await setup(page, { ackAt: null });
  await answerFirstExercise(page);

  await page.getByRole('button', { name: 'Giải thích AI', exact: true }).click();
  const notice = page.getByRole('alertdialog', { name: NOTICE_TITLE });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Google Gemini');
  expect(mock.ai.requests(), 'nothing is sent before the notice is accepted').toHaveLength(0);
  await notice.getByRole('button', { name: 'Tôi đã hiểu, tiếp tục' }).click();

  const panel = sheet(page);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(AI_LABEL);
  await expect(panel).toContainText('Lời chào trong tiếng Anh');
  expect(mock.ai.ackCalls()).toBe(1);
  const [request] = mock.ai.requests();
  expect(request).toMatchObject({ task: 'explain_concept', language: 'en', level: String(LESSON.level_code), lesson_id: String(LESSON.id) });
  expect(String(request!.concept)).toContain(LESSON_TITLE);
  await closeSheet(panel);

  // Second use: straight to the answer.
  await page.getByRole('button', { name: 'Giải thích AI', exact: true }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByRole('alertdialog', { name: NOTICE_TITLE })).toHaveCount(0);
  expect(mock.ai.ackCalls()).toBe(1);

  // Settings shows when the notice was acknowledged.
  await closeSheet(sheet(page));
  await page.goto('/app/cai-dat');
  const privacy = page.getByRole('region', { name: 'AI và quyền riêng tư' });
  await expect(privacy).toBeVisible({ timeout: 15_000 });
  await expect(privacy).toContainText(/Bạn đã xác nhận thông báo này ngày \d{2}\/\d{2}\/\d{4}\./);
});

test('"Vì sao?" analyses the answer with the revealed solution', async ({ page }) => {
  const mock = await setup(page);
  const exercise = await answerFirstExercise(page);
  await page.getByRole('button', { name: 'Vì sao?', exact: true }).click();
  const panel = sheet(page, 'Vì sao?');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('không dùng');
  const [request] = mock.ai.requests();
  expect(request).toMatchObject({ task: 'analyze_error', language: 'en', lesson_id: String(LESSON.id) });
  expect(String(request!.expected)).toBe(String(exercise.key_data.display_answer));
  expect(String(request!.prompt).length).toBeGreaterThan(0);
});

test('quota exceeded falls back to the lesson explanation', async ({ page }) => {
  await setup(page, { ackAt: ACKED, mode: 'quota_exceeded' });
  await answerFirstExercise(page);
  await page.getByRole('button', { name: 'Giải thích AI', exact: true }).click();
  const panel = sheet(page);
  await expect(panel.getByRole('alert')).toContainText('Tạm thời không khả dụng');
  await expect(panel).toContainText(CURATED);
});

test('AI unavailable shows "Tạm thời không khả dụng" and the curated text', async ({ page }) => {
  await setup(page, { ackAt: ACKED, mode: 'ai_unavailable' });
  await answerFirstExercise(page);
  await page.getByRole('button', { name: 'Giải thích AI', exact: true }).click();
  const panel = sheet(page);
  await expect(panel).toContainText('Tạm thời không khả dụng');
  await expect(panel).toContainText(CURATED);
  // The lesson keeps working without AI.
  await closeSheet(panel);
  await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeEnabled();
});

test('HTML in an AI answer is shown as literal text, never as elements', async ({ page }) => {
  await setup(page, { ackAt: ACKED, mode: 'html' });
  await answerFirstExercise(page);
  await page.getByRole('button', { name: 'Giải thích AI', exact: true }).click();
  const panel = sheet(page);
  await expect(panel).toContainText('<script>window.__aiXss=1</script>');
  await expect(panel).toContainText('<b id="ai-injected">');
  expect(AI_HTML_PAYLOAD).toContain('<img');
  await expect(page.locator('#ai-injected')).toHaveCount(0);
  await expect(panel.locator('img, script, b#ai-injected')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __aiXss?: number }).__aiXss)).toBeUndefined();
});

test('a learner reports a wrong AI answer', async ({ page }) => {
  const mock = await setup(page);
  await answerFirstExercise(page);
  await page.getByRole('button', { name: 'Giải thích AI', exact: true }).click();
  const panel = sheet(page);
  await expect(panel).toContainText('Lời chào trong tiếng Anh');
  await panel.getByRole('button', { name: 'Báo lỗi' }).click();
  const report = page.getByRole('dialog', { name: 'Báo lỗi giải thích AI' });
  await expect(report).toBeVisible();
  await report.getByRole('radio', { name: 'Sai kiến thức' }).click();
  await report.getByLabel('Ghi chú (không bắt buộc)').fill('Ví dụ chưa đúng ngữ cảnh.');
  await report.getByRole('button', { name: 'Gửi báo lỗi' }).click();
  await expect(page.getByText('Cảm ơn bạn! Linguo đã nhận báo lỗi.')).toBeVisible();
  const reports = mock.ai.reports();
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({ p_reason: 'wrong', p_note: 'Ví dụ chưa đúng ngữ cảnh.' });
  expect(typeof reports[0]!.p_usage_id).toBe('string');
});

test('the review card back explains the item', async ({ page }) => {
  const mock = await setup(page);
  await page.goto('/app/on-tap');
  await expect(page.getByRole('heading', { level: 2, name: /^Thẻ \d+\/\d+$/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Giải thích AI', exact: true })).toHaveCount(0);
  await page.getByTestId('flashcard-front').click();
  await expect(page.getByTestId('flashcard-back')).toBeVisible();
  await page.getByRole('button', { name: 'Giải thích AI', exact: true }).click();
  await expect(sheet(page)).toContainText('Lời chào trong tiếng Anh');
  expect(mock.ai.requests()[0]).toMatchObject({ task: 'explain_concept', language: 'en', level: 'pre_a1' });
});

test('tutor practice hides each answer until an option is chosen', async ({ page }) => {
  const mock = await setup(page);
  await page.goto('/app/gia-su');
  await expect(page.getByRole('heading', { level: 1, name: 'Gia sư AI' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Tạo bài luyện' }).click();
  await page.getByRole('tabpanel').getByRole('button', { name: 'Tạo bài luyện' }).click();
  await expect(page.getByText('She ___ a teacher.')).toBeVisible();
  expect(mock.ai.requests()[0]).toMatchObject({ task: 'generate_practice' });
  await expect(page.getByText('Đáp án đúng')).toHaveCount(0);
  await expect(page.getByText('She đi với is.')).toHaveCount(0);
  await page.getByRole('button', { name: 'is', exact: true }).click();
  await expect(page.getByText('Đáp án đúng')).toBeVisible();
  await expect(page.getByText('She đi với is.')).toBeVisible();
});

test('the AI sheet fits the phone viewport and closes', async ({ page }) => {
  await setup(page);
  await answerFirstExercise(page);
  await page.getByRole('button', { name: 'Giải thích AI', exact: true }).click();
  const panel = sheet(page);
  await expect(panel).toContainText('Lời chào trong tiếng Anh');
  await expectNoHorizontalScroll(page);
  await expectInsideViewport(page, panel);
  const close = panel.getByRole('button', { name: 'Đóng', exact: true });
  await expectInsideViewport(page, close);
  await expectInsideViewport(page, panel.getByRole('button', { name: 'Báo lỗi' }));
  await closeSheet(panel);
  await expect(page.getByRole('button', { name: 'Giải thích AI', exact: true })).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`no serious a11y violations in the AI sheet and notice (${colorScheme})`, async ({ page }, testInfo) => {
    test.skip(!['iphone-15-pro', 'pixel-7'].includes(testInfo.project.name), 'a11y runs on two devices');
    await setup(page, { ackAt: null });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    await answerFirstExercise(page);
    await page.getByRole('button', { name: 'Giải thích AI', exact: true }).click();
    await expect(page.getByRole('alertdialog', { name: NOTICE_TITLE })).toBeVisible();
    const axe = async () => {
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
    };
    await axe();
    await page.getByRole('button', { name: 'Tôi đã hiểu, tiếp tục' }).click();
    await expect(sheet(page)).toContainText('Lời chào trong tiếng Anh');
    await axe();
  });
}
