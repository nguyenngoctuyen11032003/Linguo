import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, mockSupabase, settleAnimations, signIn, SUPABASE_URL } from './fixtures';

// Classes, learner side (PRD P2): the invite link, privacy explanation, assignments, leaving, offline, axe in both
// themes and no horizontal scroll. The class RPCs are mocked here (registered after mockSupabase(), so Playwright
// asks this handler first and everything else falls back to mockSupabase()).

type Row = Record<string, unknown>;

const CLASS_ID = '7c000000-0000-4000-8000-0000000000e1';
const NEW_CLASS_ID = '7c000000-0000-4000-8000-0000000000e2';
const LESSON_ID = '7c100000-0000-4000-8000-0000000000e1';
const VALID_CODE = 'ABCDEFGH';

interface ClassesMockOptions {
  /** Start already in the Korean class with three assignments. */
  member?: boolean;
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function mockClasses(page: Page, opts: ClassesMockOptions = {}) {
  const now = new Date().toISOString();
  const classes: Row[] = [];
  const assignments: Row[] = [];
  const joins: string[] = [];
  const leaves: string[] = [];
  const korean: Row = {
    id: CLASS_ID,
    name: 'Tiếng Hàn sơ cấp 1 — lớp tối thứ Năm có tên khá dài',
    language_code: 'ko',
    teacher_name: 'Cô Lan',
    joined_at: now,
    assignment_count: 3,
    pending_count: 2,
  };
  const base = { class_id: CLASS_ID, class_name: korean.name, created_at: now, note: null, completed_at: null, progress_count: 0 };
  if (opts.member) {
    classes.push(korean);
    assignments.push(
      { ...base, id: '7c200000-0000-4000-8000-0000000000e1', kind: 'lesson', ref_id: LESSON_ID, title: 'Chào hỏi cơ bản', target_count: null, due_at: inDays(3), state: 'pending', note: 'Nhớ luyện phát âm phần chào hỏi nhé, cô sẽ kiểm tra vào buổi tới.' },
      { ...base, id: '7c200000-0000-4000-8000-0000000000e2', kind: 'review', ref_id: null, title: null, target_count: 30, due_at: inDays(-1), state: 'overdue', progress_count: 12 },
      { ...base, id: '7c200000-0000-4000-8000-0000000000e3', kind: 'exam', ref_id: '7c300000-0000-4000-8000-0000000000e1', title: 'TOPIK I mini', target_count: null, due_at: null, state: 'done', completed_at: now, progress_count: 1 },
    );
  }
  const english: Row = {
    id: NEW_CLASS_ID,
    name: 'IELTS tối thứ Ba',
    language_code: 'en',
    teacher_name: 'Thầy Minh',
    joined_at: now,
    assignment_count: 0,
    pending_count: 0,
  };

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/rest/v1/rpc/')) return route.fallback();
    const b = (route.request().postDataJSON() ?? {}) as Row;
    switch (url.pathname.slice('/rest/v1/rpc/'.length)) {
      case 'learner_list_classes':
        return route.fulfill({ json: classes });
      case 'learner_list_assignments':
        return route.fulfill({ json: assignments });
      case 'learner_join_class': {
        const code = String(b.p_code);
        joins.push(code);
        if (code !== VALID_CODE) return route.fulfill({ json: { status: 'invalid_code' } });
        const already = classes.some((c) => c.id === english.id);
        if (!already) classes.push(english);
        return route.fulfill({ json: { status: already ? 'already_member' : 'joined', class: english } });
      }
      case 'learner_leave_class': {
        const index = classes.findIndex((c) => c.id === b.p_class_id);
        if (index < 0) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'not_member', details: null, hint: null } });
        leaves.push(String(b.p_class_id));
        classes.splice(index, 1);
        for (let i = assignments.length - 1; i >= 0; i--) if (assignments[i]?.class_id === b.p_class_id) assignments.splice(i, 1);
        return route.fulfill({ json: { left: true } });
      }
    }
    return route.fallback();
  });
  return { joins: () => [...joins], leaves: () => [...leaves] };
}

async function setup(page: Page, opts: ClassesMockOptions = {}, colorScheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
  await mockSupabase(page);
  const mock = await mockClasses(page, opts);
  await signIn(page);
  return mock;
}

async function expectNoSeriousAxe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, `${label}: ${JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)}`).toEqual([]);
}

test('the invite link explains what the teacher sees and joins only after confirming', async ({ page }) => {
  const mock = await setup(page);
  await page.goto(`/app/lop-hoc/tham-gia?ma=abcd-efgh`);
  await expect(page.getByRole('heading', { level: 1, name: 'Tham gia lớp học' })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveTitle('Tham gia lớp học · Linguo');
  const privacy = page.getByRole('region', { name: 'Giáo viên thấy gì về bạn?' });
  await expect(privacy.getByText('Hội thoại với Gia sư AI và phần đóng vai')).toBeVisible();
  await expect(page.getByLabel('Mã lớp', { exact: true })).toHaveValue('ABCD-EFGH');
  await settleAnimations(page);
  await expectNoHorizontalScroll(page);
  expect(mock.joins()).toEqual([]);

  await page.getByRole('button', { name: 'Tham gia lớp' }).click();
  await expect(page).toHaveURL(/\/app\/lop-hoc$/);
  await expect(page.getByRole('heading', { level: 2, name: 'IELTS tối thứ Ba' })).toBeVisible();
  await expect(page.getByText('Đã vào lớp IELTS tối thứ Ba. Chào mừng bạn!')).toBeVisible();
  expect(mock.joins()).toEqual([VALID_CODE]);
  await expectNoHorizontalScroll(page);
});

test('a wrong code stays in the form with a clear message', async ({ page }) => {
  const mock = await setup(page);
  await page.goto('/app/lop-hoc');
  await expect(page.getByRole('heading', { name: 'Bạn chưa ở lớp nào' })).toBeVisible({ timeout: 15_000 });
  const input = page.getByLabel('Mã lớp', { exact: true });
  await input.fill('abc');
  await page.getByRole('button', { name: 'Tham gia lớp' }).click();
  await expect(page.getByRole('alert')).toContainText('Mã lớp gồm 8 chữ cái và chữ số');
  expect(mock.joins()).toEqual([]);
  await input.fill('ZZZZ ZZZZ');
  await page.getByRole('button', { name: 'Tham gia lớp' }).click();
  await expect(page.getByRole('alert')).toContainText('Mã này không đúng, đã hết hạn');
  expect(mock.joins()).toEqual(['ZZZZZZZZ']);
});

test('assignments link to the work, and leaving asks first', async ({ page }) => {
  const mock = await setup(page, { member: true });
  await page.goto('/app/lop-hoc');
  const card = page.getByRole('region', { name: /Tiếng Hàn sơ cấp 1/ });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText(/Giáo viên: Cô Lan/)).toBeVisible();
  await expect(card.getByRole('link', { name: 'Làm bài: Chào hỏi cơ bản' })).toHaveAttribute('href', `/app/hoc-tap/bai/${LESSON_ID}`);
  await expect(card.getByRole('link', { name: 'Ôn ngay: Ôn 30 thẻ' })).toHaveAttribute('href', '/app/on-tap');
  await expect(card.getByText('Quá hạn · Đã ôn 12/30')).toBeVisible();
  await expect(card.getByText('Đã xong')).toBeVisible();
  await settleAnimations(page);
  await expectNoHorizontalScroll(page);

  await card.getByRole('button', { name: /^Rời lớp/ }).click();
  const dialog = page.getByRole('dialog', { name: /^Rời lớp Tiếng Hàn sơ cấp 1/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Giáo viên sẽ không còn thấy tiến độ của bạn');
  await settleAnimations(page);
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Ở lại lớp' }).click();
  await expect(dialog).toBeHidden();
  expect(mock.leaves()).toEqual([]);

  await card.getByRole('button', { name: /^Rời lớp/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rời lớp', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bạn chưa ở lớp nào' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Lớp học' })).toBeFocused();
  expect(mock.leaves()).toEqual([CLASS_ID]);
});

test('offline: joining and leaving wait for the network', async ({ page, context }) => {
  await setup(page, { member: true });
  await page.goto('/app/lop-hoc');
  await expect(page.getByRole('region', { name: /Tiếng Hàn sơ cấp 1/ })).toBeVisible({ timeout: 15_000 });
  await context.setOffline(true);
  await expect(page.getByText(/Bạn đang ngoại tuyến. Danh sách lớp có thể chưa mới nhất/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tham gia lớp' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Rời lớp/ })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Tham gia lớp' })).toBeEnabled();
});

test('home links to the classes page', async ({ page }) => {
  await setup(page);
  await page.goto('/app');
  const link = page.getByRole('link', { name: 'Mở lớp học' });
  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lớp học' })).toBeVisible();
  await expect(page).toHaveTitle('Lớp học · Linguo');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`axe and layout: classes, invite link and leave dialog (${colorScheme})`, async ({ page }) => {
    // Three axe runs on the long classes page are slow on WebKit.
    test.setTimeout(90_000);
    await setup(page, { member: true }, colorScheme);
    for (const [path, ready] of [
      ['/app/lop-hoc', page.getByRole('region', { name: /Tiếng Hàn sơ cấp 1/ })],
      ['/app/lop-hoc/tham-gia?ma=ABCD-EFGH', page.getByRole('heading', { level: 1, name: 'Tham gia lớp học' })],
    ] as const) {
      await page.goto(path);
      await expect(ready).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      await settleAnimations(page);
      await expectNoHorizontalScroll(page);
      await expectNoSeriousAxe(page, `${path} ${colorScheme}`);
    }
    await page.goto('/app/lop-hoc');
    await page.getByRole('button', { name: /^Rời lớp/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await settleAnimations(page);
    await expectNoSeriousAxe(page, `leave dialog ${colorScheme}`);
  });
}
