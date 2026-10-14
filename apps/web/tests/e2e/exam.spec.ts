import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { examForm, expectNoHorizontalScroll, mockSupabase, pathRow, signIn, type ExamMockOptions } from './fixtures';

// Spec 9 §5: hub → start → answer → submit → result on the TOPIK I demo form, drills, reload, the clock, axe and
// no horizontal scroll on every device project. The exam RPCs are mocked from supabase/seed.sql and graded with
// the shared grader (fixtures.ts createExamBackend).

// Loading waits for the profile, the paths and the exam RPCs; allow for slow devices under parallel load.
const expect = baseExpect.configure({ timeout: 15_000 });
// A full mock is a long flow (24 questions, three pages); WebKit under parallel load needs more than 30 s.
test.describe.configure({ timeout: 90_000 });

const KO_PATH = pathRow({ id: 'path-ko', language_code: 'ko', goal_type: 'topik_i', current_level: 'topik1', target_level: 'topik2' });
const TOPIK_I = examForm('ko:exam:topik-i-mock-1');
const A11Y_PROJECTS = ['iphone-15-pro', 'pixel-7'];

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const question = (n: number): Row => TOPIK_I.questions.find((q: Row) => q.seq === n);
const optionText = (q: Row, id: string): string => q.prompt.options.find((o: Row) => o.id === id).text;
const wrongOption = (q: Row): string => q.prompt.options.find((o: Row) => o.id !== q.answer).id;

async function setup(page: Page, exam: ExamMockOptions = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Reloading the runner triggers its beforeunload guard; accept it like a learner who confirms.
  page.on('dialog', (dialog) => void dialog.accept());
  const mock = await mockSupabase(page, { paths: [KO_PATH], exam });
  await signIn(page);
  return mock;
}

async function openHub(page: Page) {
  await page.goto('/app/luyen-thi');
  await expect(page.getByRole('heading', { level: 1, name: 'Luyện thi' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1, { timeout: 15_000 });
}

async function startFullMock(page: Page) {
  await openHub(page);
  await page.getByRole('button', { name: /^Thi thử toàn bài/ }).click();
  await expect(page).toHaveURL(/\/app\/luyen-thi\/lam-bai\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: TOPIK_I.title_vi })).toBeVisible();
}

const choose = (page: Page, text: string) => page.getByRole('radio', { name: text, exact: false }).first();

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
}

test('takes a TOPIK I mock from the hub to the result', async ({ page }) => {
  const mock = await setup(page);
  await openHub(page);
  await expect(page.getByRole('radio', { name: 'TOPIK I', exact: true })).toBeChecked();
  await expect(page.getByText('Bài luyện mô phỏng — không phải đề thi chính thức').first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: /^Thi thử toàn bài/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: TOPIK_I.title_vi })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveAccessibleName(/^Thời gian còn lại (40|39):\d\d$/);
  await expect(page.getByText(`Phần Nghe · Câu 1/${TOPIK_I.questions.length}`)).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Q1 right, Q2 wrong.
  const q1 = question(1);
  await choose(page, optionText(q1, q1.answer)).click();
  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  await expect(page.getByText(`Phần Nghe · Câu 2/${TOPIK_I.questions.length}`)).toBeVisible();
  const q2 = question(2);
  await choose(page, optionText(q2, wrongOption(q2))).click();
  await expect(page.getByText('Đã lưu câu trả lời')).toBeVisible();
  await expect.poll(() => mock.exam.saves().length).toBe(2);

  await page.getByRole('button', { name: 'Nộp bài' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nộp bài?' });
  await expect(dialog).toContainText(`Còn ${TOPIK_I.questions.length - 2} câu chưa trả lời.`);
  await dialog.getByRole('button', { name: 'Nộp bài' }).click();

  await expect(page).toHaveURL(/\/app\/luyen-thi\/ket-qua\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kết quả bài luyện' })).toBeVisible();
  const max = TOPIK_I.questions.reduce((n: number, q: Row) => n + q.points, 0);
  await expect(page.getByText(`${q1.points}/${max}`, { exact: true })).toBeVisible();
  await expect(page.getByText('Thang điểm chưa được đối chiếu với quy chế hiện hành')).toBeVisible();
  await expect(page.getByText('Quy đổi tham khảo, không phải kết quả chính thức').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Xem lại đáp án' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Back on the hub, the attempt is in the history and on the card.
  await page.getByRole('link', { name: 'Về Luyện thi' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Luyện thi' })).toBeVisible();
  const history = page.getByRole('region', { name: 'Lịch sử thi gần đây' });
  await expect(history.getByText(`${q1.points}/${max} điểm`)).toBeVisible();
  await expect(page.getByRole('article').getByText(/Lần gần nhất:/)).toBeVisible();
});

test('keeps saved answers after a reload mid-attempt', async ({ page }) => {
  await setup(page);
  await startFullMock(page);
  const q1 = question(1);
  await choose(page, optionText(q1, q1.answer)).click();
  await expect(page.getByText('Đã lưu câu trả lời')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: TOPIK_I.title_vi })).toBeVisible();
  // Resumes on the first unanswered question; Q1 keeps its answer.
  await expect(page.getByText(`Phần Nghe · Câu 2/${TOPIK_I.questions.length}`)).toBeVisible();
  await page.getByRole('button', { name: /^Câu 1: đã trả lời/ }).click();
  await expect(choose(page, optionText(q1, q1.answer))).toHaveAttribute('aria-checked', 'true');
});

test('submits automatically when the time runs out', async ({ page }) => {
  await setup(page, { deadlineSeconds: 10 });
  await startFullMock(page);
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Kết quả bài luyện' })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/app\/luyen-thi\/ket-qua\//);
});

test('drills one question type without a clock', async ({ page }) => {
  const mock = await setup(page);
  await openHub(page);
  await page.getByRole('button', { name: 'Luyện theo dạng câu' }).click();
  const picker = page.getByRole('region', { name: /^Chọn dạng câu/ });
  await expect(picker).toBeFocused();
  await expectNoHorizontalScroll(page);
  await picker.getByRole('listitem').first().getByRole('button').click();
  await expect(page).toHaveURL(/\/app\/luyen-thi\/lam-bai\//);
  await expect(page.getByText('Không giới hạn thời gian')).toBeVisible();
  const [drill] = mock.exam.attempts();
  expect(drill?.mode).toBe('question_type');
  expect(drill!.questionIds.length).toBeLessThanOrEqual(10);
  await expectNoHorizontalScroll(page);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`no serious a11y violations on the exam pages (${colorScheme})`, async ({ page }, testInfo) => {
    test.skip(!A11Y_PROJECTS.includes(testInfo.project.name), 'a11y runs on two devices');
    // Three full axe runs; WebKit needs more than the default 30 s for the long result review.
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    await setup(page);
    await openHub(page);
    await axe(page);

    await page.getByRole('button', { name: /^Thi thử toàn bài/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: TOPIK_I.title_vi })).toBeVisible();
    await axe(page);

    await page.getByRole('button', { name: 'Nộp bài' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Nộp bài' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kết quả bài luyện' })).toBeVisible();
    await axe(page);
  });
}
