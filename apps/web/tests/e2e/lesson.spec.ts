import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { correctResponse, DEMO_LESSONS, expectNoHorizontalScroll, lessonExercises, mockSupabase, pathRow, settleAnimations, signIn } from './fixtures';

type Row = ReturnType<typeof lessonExercises>[number];

const EN_PATH = pathRow({ id: 'path-en', language_code: 'en', current_level: 'pre_a1', target_level: 'a1' });
const KO_PATH = pathRow({ id: 'path-ko', language_code: 'ko', current_level: 'hangul', target_level: 'topik1' });
const DEMO_LABEL = 'Nội dung demo — chưa kiểm duyệt';
const PENDING_LABEL = 'Đang chờ đồng bộ — sẽ chấm khi có mạng';

async function setup(page: Page, path: Record<string, unknown>) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [path] });
  await signIn(page);
  return mock;
}

async function openLesson(page: Page, lessonId: string) {
  await page.goto(`/app/hoc-tap/bai/${lessonId}`);
  // Loading waits for the profile, the paths and two RPCs; allow for slow CI devices.
  // The exit button marks the lesson page (also shown while loading); its h1 appears once loaded.
  await expect(page.getByRole('button', { name: 'Thoát bài học' })).toBeVisible({ timeout: 15_000 });
  await expect(lessonTitle(page)).toBeVisible({ timeout: 15_000 });
  // The seeded lessons are reviewed (demo: false), so no demo badge.
  await expect(page.getByText(DEMO_LABEL)).toHaveCount(0);
}

/** The lesson title: the page's only h1. */
const lessonTitle = (page: Page) => page.getByRole('heading', { level: 1 });
/** The current step: the question counter (a live paragraph) or the content step's h2. */
const heading = (page: Page) => page.locator('main').locator('h2, p[aria-live="polite"]').first();
const lessonLink = (page: Page, lessonId: string) => page.locator(`ul a[href$="/app/hoc-tap/bai/${lessonId}"]`);

/** The bottom action must be tappable without scrolling. */
async function expectInViewport(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.y >= 0 && box.y + box.height <= viewport.height, `${name} must sit inside the viewport`).toBeTruthy();
}

async function next(page: Page) {
  const button = page.getByRole('button', { name: 'Tiếp tục', exact: true });
  await expect(button).toBeEnabled();
  await expectInViewport(page, 'Tiếp tục');
  await button.click();
}

/** Click through objective / explain / examples / mistake steps until the first exercise. */
async function skipToExercise(page: Page) {
  for (let i = 0; i < 8; i++) {
    if (/^Câu \d+\/\d+$/.test((await heading(page).textContent()) ?? '')) return;
    await next(page);
  }
  throw new Error('no exercise step reached');
}

/** Fill in a response through the UI without submitting it. */
async function fillAnswer(page: Page, exercise: Row, response: Record<string, unknown> = correctResponse(exercise)) {
  const prompt = exercise.prompt;
  switch (exercise.exercise_type) {
    case 'mcq':
    case 'listen': {
      const option = prompt.options.find((o: { id: string }) => o.id === response.option_id);
      // A listen exercise shifts its options when the audio fails and the fallback text appears; retry a lost tap.
      const radio = page.getByRole('radio', { name: option.text, exact: true });
      await expect(async () => {
        await radio.click();
        await expect(radio).toBeChecked({ timeout: 1_500 });
      }).toPass({ timeout: 15_000 });
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

function submitButton(page: Page, exercise: Row) {
  return page.getByRole('button', { name: exercise.stage === 'recognition' ? 'Kiểm tra' : 'Chắc chắn', exact: true });
}

async function answerCorrectly(page: Page, exercise: Row) {
  await fillAnswer(page, exercise);
  await submitButton(page, exercise).click();
  await expect(page.getByText('Chính xác', { exact: true })).toBeVisible({ timeout: 15_000 });
}

async function runWholeLesson(page: Page, lesson: Record<string, unknown>) {
  const exercises = lessonExercises(String(lesson.id));
  await openLesson(page, String(lesson.id));
  await expect(lessonTitle(page)).toHaveText(String((lesson.title as { vi: string }).vi));
  await expectNoHorizontalScroll(page);
  await skipToExercise(page);
  for (const [i, exercise] of exercises.entries()) {
    await expect(heading(page)).toHaveText(`Câu ${i + 1}/${exercises.length}`);
    await expect(page.getByRole('progressbar')).toBeVisible();
    await answerCorrectly(page, exercise);
    await expectNoHorizontalScroll(page);
    await next(page);
  }
  await expect(heading(page)).toHaveText('Tóm tắt');
  await expect(page.getByRole('heading', { name: 'Kết quả của bạn' })).toBeVisible();
  await next(page);
  await expect(heading(page)).toHaveText('Hoàn thành bài học');
  await page.getByRole('button', { name: 'Về trang chủ' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test('a learner finds the English lesson on Learn and finishes it', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page, EN_PATH);
  await page.goto('/app/hoc-tap');
  await expect(page.getByRole('heading', { level: 1, name: 'Học tập' })).toBeVisible();
  await expect(lessonLink(page, DEMO_LESSONS.enHello.id)).toContainText('Chưa học');
  await expect(lessonLink(page, DEMO_LESSONS.enIAm.id)).toContainText('Nên học trước: Xin chào!');
  await expectNoHorizontalScroll(page);

  await runWholeLesson(page, DEMO_LESSONS.enHello);

  await page.goto('/app/hoc-tap');
  await expect(lessonLink(page, DEMO_LESSONS.enHello.id)).toContainText('Đã học');
  await expect(lessonLink(page, DEMO_LESSONS.enIAm.id)).not.toContainText('Nên học trước');
});

test('a learner finishes the Korean vowels lesson', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page, KO_PATH);
  await runWholeLesson(page, DEMO_LESSONS.koVowels);
});

test('a reload mid-lesson resumes at the same step with its feedback', async ({ page }) => {
  await setup(page, EN_PATH);
  const [first, second] = lessonExercises(DEMO_LESSONS.enHello.id);
  await openLesson(page, DEMO_LESSONS.enHello.id);
  await skipToExercise(page);
  await answerCorrectly(page, first!);
  const url = page.url();
  expect(url).toMatch(/[?&]buoc=\d+/);

  await page.reload();
  await expect(heading(page)).toHaveText(/^Câu 1\//);
  await expect(page).toHaveURL(url);
  await expect(page.getByText('Chính xác', { exact: true })).toBeVisible({ timeout: 15_000 });
  await next(page);
  await expect(heading(page)).toHaveText(/^Câu 2\//);
  await fillAnswer(page, second!);
  await expect(submitButton(page, second!)).toBeEnabled();
});

test('an answer given offline waits, then is graded once back online', async ({ page, context }) => {
  await setup(page, EN_PATH);
  const [first] = lessonExercises(DEMO_LESSONS.enHello.id);
  await openLesson(page, DEMO_LESSONS.enHello.id);
  await skipToExercise(page);
  await fillAnswer(page, first!);

  await context.setOffline(true);
  await submitButton(page, first!).click();
  await expect(page.getByText(PENDING_LABEL)).toBeVisible();
  await expect(page.getByText('Chính xác', { exact: true })).toHaveCount(0);

  await context.setOffline(false);
  await expect(page.getByText('Chính xác', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(PENDING_LABEL)).toHaveCount(0);
});

test('a double tap on Check sends a single submission', async ({ page }) => {
  const mock = await setup(page, EN_PATH);
  const [first] = lessonExercises(DEMO_LESSONS.enHello.id);
  await openLesson(page, DEMO_LESSONS.enHello.id);
  await skipToExercise(page);
  await fillAnswer(page, first!);
  await submitButton(page, first!).dblclick();
  await expect(page.getByText('Chính xác', { exact: true })).toBeVisible({ timeout: 15_000 });
  // Flush two frames so a second (duplicate) submission would have been sent by now.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(mock.submitCalls()).toBe(1);
});

test('a wrong answer twice reveals the answer and re-checks the exercise at the end', async ({ page }) => {
  await setup(page, EN_PATH);
  const exercises = lessonExercises(DEMO_LESSONS.enHello.id);
  const first = exercises[0]!;
  const wrong = first.prompt.options.find((o: { id: string }) => o.id !== first.key_data.answer_key.correct_option_id);
  await openLesson(page, DEMO_LESSONS.enHello.id);
  await skipToExercise(page);

  await fillAnswer(page, first, { option_id: wrong.id });
  await submitButton(page, first).click();
  await expect(page.getByText('Chưa đúng', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Xem đáp án' }).click();
  await expect(page.getByText(first.key_data.display_answer).first()).toBeVisible();
  await next(page);

  // The re-check entry is appended, so the question count grows by one.
  await expect(heading(page)).toHaveText(`Câu 2/${exercises.length + 1}`);
});

test('the first exercise can be done with the keyboard only', async ({ page }) => {
  await setup(page, EN_PATH);
  const [first] = lessonExercises(DEMO_LESSONS.enHello.id);
  const correctText: string = first!.prompt.options.find((o: { id: string }) => o.id === first!.key_data.answer_key.correct_option_id).text;
  await openLesson(page, DEMO_LESSONS.enHello.id);

  const focused = () => page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return { role: el?.getAttribute('role') ?? el?.tagName.toLowerCase() ?? '', text: el?.textContent?.trim() ?? '', checked: el?.getAttribute('aria-checked') };
  });
  async function tabTo(match: (f: Awaited<ReturnType<typeof focused>>) => boolean) {
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      if (match(await focused())) return;
    }
    throw new Error('focus target not reached with Tab');
  }

  for (let i = 0; i < 8 && !/^Câu/.test((await heading(page).textContent()) ?? ''); i++) {
    await tabTo((f) => f.text === 'Tiếp tục');
    await page.keyboard.press('Enter');
    await settleAnimations(page);
  }
  await expect(heading(page)).toHaveText(/^Câu 1\//);

  await tabTo((f) => f.role === 'radio');
  for (let i = 0; i < 6; i++) {
    const f = await focused();
    if (f.text.includes(correctText)) break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio', { name: correctText, exact: true })).toHaveAttribute('aria-checked', 'true');
  await tabTo((f) => f.text === 'Kiểm tra');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Chính xác', { exact: true })).toBeVisible({ timeout: 15_000 });
  await tabTo((f) => f.text === 'Tiếp tục');
  await page.keyboard.press('Enter');
  await expect(heading(page)).toHaveText(/^Câu 2\//);
});

test('Korean typed through an IME composition is graded correctly', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'IME composition is driven through the Chromium DevTools protocol');
  await setup(page, KO_PATH);
  const exercises = lessonExercises(DEMO_LESSONS.koVowels.id);
  const index = exercises.findIndex((e) => e.exercise_type === 'translate' && e.answer_lang === 'ko');
  await page.goto(`/app/hoc-tap/bai/${DEMO_LESSONS.koVowels.id}`);
  await skipToExercise(page);
  for (const exercise of exercises.slice(0, index)) {
    await answerCorrectly(page, exercise);
    await next(page);
  }

  const input = page.getByLabel('Bản dịch của bạn');
  await input.focus();
  const cdp = await page.context().newCDPSession(page);
  for (const text of ['ㅇ', '오', '오ㅇ', '오이']) {
    await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
  }
  // Enter while composing must not submit or drop the last syllable.
  await page.keyboard.press('Enter');
  await cdp.send('Input.insertText', { text: '오이' });
  await expect(input).toHaveValue('오이');
  await submitButton(page, exercises[index]!).click();
  await expect(page.getByText('Chính xác', { exact: true })).toBeVisible({ timeout: 15_000 });
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`no serious a11y violations on Learn and the lesson player (${colorScheme})`, async ({ page }, testInfo) => {
    test.skip(!['iphone-15-pro', 'pixel-7'].includes(testInfo.project.name), 'a11y runs on two devices');
    test.setTimeout(90_000); // four axe scans
    await setup(page, EN_PATH);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    const scan = async (label: string) => {
      await settleAnimations(page);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, `${label}: ${JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)}`).toEqual([]);
    };

    await page.goto('/app/hoc-tap');
    await expect(page.getByRole('heading', { level: 1, name: 'Học tập' })).toBeVisible();
    await scan('learn');

    const [first] = lessonExercises(DEMO_LESSONS.enHello.id);
    await openLesson(page, DEMO_LESSONS.enHello.id);
    await scan('objective step');
    await skipToExercise(page);
    await scan('exercise step');
    await answerCorrectly(page, first!);
    await scan('exercise feedback');
  });
}
