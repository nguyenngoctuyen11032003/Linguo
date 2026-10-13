import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  correctResponse,
  DEMO_LESSONS,
  expectNoHorizontalScroll,
  lessonExercises,
  mockSupabase,
  pathRow,
  SESSION_ID,
  signIn,
  studySessionRow,
  type SessionMockOptions,
} from './fixtures';

// Spec 6 §4: the home "Hôm nay" card, and lessons / reviews opened from a study session (?phien=&muc=[&so-the=])
// reporting the activity and leading back to /app/phien-hoc.

type Row = ReturnType<typeof lessonExercises>[number];

const EN_PATH = pathRow({ id: 'path-en', language_code: 'en', current_level: 'pre_a1', target_level: 'a1' });

async function setup(page: Page, session: SessionMockOptions = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [EN_PATH], session });
  await signIn(page);
  return mock;
}

const todayHeading = (page: Page) => page.getByRole('heading', { level: 2, name: 'Hôm nay', exact: true });

test('home starts a session, or resumes the open one', async ({ page }) => {
  await setup(page, { studiedSecondsToday: 9 * 60 });
  await page.goto('/app');
  await expect(todayHeading(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Mục tiêu 30 phút · Đã học 9 phút')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bắt đầu phiên học' })).toHaveAttribute('href', /\/app\/phien-hoc$/);
  await expect(page.getByRole('link', { name: 'Chỉ có 10 phút?' })).toHaveAttribute('href', /\/app\/phien-hoc\?phut=10$/);
  await expectNoHorizontalScroll(page);
  const axe = await new AxeBuilder({ page }).include('section[aria-labelledby="today-title"]').analyze();
  expect(axe.violations).toEqual([]);
});

test('home shows the open session with its focus and priority skill', async ({ page }) => {
  await setup(page, { session: studySessionRow() });
  await page.goto('/app');
  const resume = page.getByRole('link', { name: 'Tiếp tục phiên (0/3)' });
  await expect(resume).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Ưu tiên ôn tập: 4 thẻ đến hạn')).toBeVisible();
  await expect(page.getByText('Kỹ năng ưu tiên: Nghe.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chỉ có 10 phút?' })).toHaveCount(0);
  await resume.click();
  await expect(page).toHaveURL(/\/app\/phien-hoc$/);
});

test('home still works when the planner RPC is not deployed', async ({ page }) => {
  await setup(page, { missing: true });
  await page.goto('/app');
  await expect(page.getByText('Lộ trình của bạn')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 2, name: 'Ôn tập hôm nay: 4 thẻ' })).toBeVisible();
  await expect(todayHeading(page)).toHaveCount(0);
});

// ---- lesson -------------------------------------------------------------------------------------------------

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

async function next(page: Page) {
  const button = page.getByRole('button', { name: 'Tiếp tục', exact: true });
  await expect(button).toBeEnabled();
  await button.click();
}

test('a lesson opened from the session reports it done and leads back', async ({ page }) => {
  test.setTimeout(120_000);
  const mock = await setup(page, { session: studySessionRow() });
  const lesson = DEMO_LESSONS.enHello;
  const exercises = lessonExercises(String(lesson.id));
  const heading = page.getByRole('heading', { level: 1 });

  await page.goto(`/app/hoc-tap/bai/${lesson.id}?phien=${SESSION_ID}&muc=a2`);
  await expect(heading).toHaveText(String((lesson.title as { vi: string }).vi), { timeout: 15_000 });
  for (let i = 0; i < 8 && !/^Câu \d+\/\d+$/.test((await heading.textContent()) ?? ''); i++) await next(page);
  for (const [i, exercise] of exercises.entries()) {
    await expect(heading).toHaveText(`Câu ${i + 1}/${exercises.length}`);
    await fillAnswer(page, exercise);
    await page.getByRole('button', { name: exercise.stage === 'recognition' ? 'Kiểm tra' : 'Chắc chắn', exact: true }).click();
    await expect(page.getByText('Chính xác', { exact: true })).toBeVisible({ timeout: 15_000 });
    await next(page);
  }
  await expect(heading).toHaveText('Tóm tắt');
  await expect(page.getByRole('heading', { name: 'Kết quả của bạn' })).toBeVisible();
  await expect.poll(() => mock.sessionUpdates()).toHaveLength(1);
  await next(page);
  await expect(heading).toHaveText('Hoàn thành bài học');
  await expect(page.getByRole('button', { name: 'Về trang chủ' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Quay lại phiên học' }).click();
  await expect(page).toHaveURL(/\/app\/phien-hoc$/);

  const [update] = mock.sessionUpdates();
  expect(update).toMatchObject({ sessionId: SESSION_ID, itemId: 'a2', status: 'done' });
  expect(update!.seconds).toBeGreaterThan(0);
  expect(update!.seconds).toBeLessThanOrEqual(7200);
  expect(mock.sessionUpdates()).toHaveLength(1);
});

// ---- review -------------------------------------------------------------------------------------------------

test('a review opened from the session stops after so-the cards, reports and leads back', async ({ page }) => {
  test.setTimeout(90_000);
  const mock = await setup(page, { session: studySessionRow() });
  await page.goto(`/app/on-tap?phien=${SESSION_ID}&muc=a1&so-the=2`);
  const counter = page.getByRole('heading', { level: 2, name: /^Thẻ \d+\/\d+$/ });
  await expect(counter).toHaveText('Thẻ 1/2', { timeout: 15_000 });
  for (let i = 0; i < 2; i++) {
    await expect(counter).toHaveText(`Thẻ ${i + 1}/2`);
    await page.getByTestId('flashcard-front').click();
    await expect(page.getByTestId('flashcard-back')).toBeVisible();
    await page.getByRole('button', { name: /^Được,/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Xong phiên ôn' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+10 thẻ nữa' })).toHaveCount(0);
  await expect.poll(() => mock.sessionUpdates()).toHaveLength(1);
  expect(mock.reviewGrades()).toHaveLength(2);
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Quay lại phiên học' }).click();
  await expect(page).toHaveURL(/\/app\/phien-hoc$/);
  expect(mock.sessionUpdates()).toEqual([{ sessionId: SESSION_ID, itemId: 'a1', status: 'done', seconds: expect.any(Number) }]);
});

test('without session params the review keeps its usual ending', async ({ page }) => {
  const mock = await setup(page, { session: studySessionRow() });
  await page.goto('/app/on-tap');
  await expect(page.getByRole('heading', { level: 2, name: 'Thẻ 1/4' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Hoãn tất cả' }).click();
  await expect(page.getByRole('heading', { name: 'Xong phiên ôn' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quay lại phiên học' })).toHaveCount(0);
  expect(mock.sessionUpdates()).toEqual([]);
});
