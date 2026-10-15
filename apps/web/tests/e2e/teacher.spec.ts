import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, mockSupabase, settleAnimations, signIn, SUPABASE_URL } from './fixtures';

// Teacher tools (PRD P2): /giao-vien class list, invites, assignments and the aggregate roster. Mocks are local to
// this spec (registered after mockSupabase(), so they answer first and fall back for everything else).

type Row = Record<string, unknown>;

const CLASS_ID = '7c000000-0000-4000-8000-0000000000c1';
const LESSON_ID = '7c000000-0000-4000-8000-0000000000e1';
const UNIT_ID = '7c000000-0000-4000-8000-0000000000f1';

interface TeacherMock {
  calls: Array<[string, Row]>;
}

async function mockTeacher(page: Page, opts: { teacher?: boolean } = {}): Promise<TeacherMock> {
  const calls: Array<[string, Row]> = [];
  const now = Date.now();
  const invites: Row[] = [
    { code: 'ABCDEFGH', class_id: CLASS_ID, expires_at: new Date(now + 5 * 86_400_000).toISOString(), max_uses: 40, uses: 2, created_at: new Date(now).toISOString() },
  ];
  const assignments: Row[] = [
    {
      id: randomUUID(),
      class_id: CLASS_ID,
      kind: 'review',
      ref_id: null,
      title: null,
      target_count: 30,
      due_at: new Date(now + 2 * 86_400_000).toISOString(),
      note: 'Ôn đều mỗi ngày nhé',
      created_at: new Date(now).toISOString(),
      completed_count: 1,
      member_count: 2,
    },
  ];
  const cls: Row = { id: CLASS_ID, name: 'Lớp giao tiếp tối thứ Ba', language_code: 'en', archived_at: null, created_at: new Date(now).toISOString() };
  const classJson = () => ({ ...cls, member_count: 2, assignment_count: assignments.length, invites });
  const member = (id: string, name: string | null, extra: Row = {}): Row => ({
    user_id: id,
    display_name: name,
    joined_at: new Date(now).toISOString(),
    has_path: true,
    streak_current: 5,
    streak_best: 12,
    minutes_7d: 95,
    minutes_30d: 300,
    last_active_day: '2026-10-15',
    lessons_completed: 14,
    lessons_completed_7d: 4,
    reviews_due: 6,
    reviews_30d: 80,
    review_accuracy_30d: 0.86,
    assignments_done: 1,
    assignments_total: assignments.length,
    ...extra,
  });

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/rest/v1/lessons') {
      return route.fulfill({ json: [{ id: LESSON_ID, title: { vi: 'Chào hỏi và giới thiệu' }, level_code: 'a1', order_index: 1, unit_id: UNIT_ID }] });
    }
    if (url.pathname === '/rest/v1/units') return route.fulfill({ json: [{ id: UNIT_ID, title: { vi: 'Làm quen' }, order_index: 1 }] });
    if (url.pathname === '/rest/v1/exam_forms') return route.fulfill({ json: [] });
    if (!url.pathname.startsWith('/rest/v1/rpc/')) return route.fallback();
    const name = url.pathname.slice('/rest/v1/rpc/'.length);
    const b = (route.request().postDataJSON() ?? {}) as Row;
    switch (name) {
      case 'is_teacher':
        calls.push([name, b]);
        return route.fulfill({ json: opts.teacher ?? true });
      case 'teacher_list_classes':
        calls.push([name, b]);
        return route.fulfill({ json: [classJson()] });
      case 'teacher_class_roster':
        calls.push([name, b]);
        return route.fulfill({
          json: {
            class: classJson(),
            members: [
              member('7c000000-0000-4000-8000-0000000000d1', 'Nguyễn Thị Lan Anh'),
              member('7c000000-0000-4000-8000-0000000000d2', null, { has_path: false, streak_current: 0, minutes_7d: 0, review_accuracy_30d: null, last_active_day: null }),
            ],
            assignments,
          },
        });
      case 'teacher_create_invite': {
        calls.push([name, b]);
        const invite = {
          code: 'KMNPQRST',
          class_id: CLASS_ID,
          expires_at: new Date(Date.now() + Number(b.p_expires_hours) * 3_600_000).toISOString(),
          max_uses: b.p_max_uses ?? null,
          uses: 0,
          created_at: new Date().toISOString(),
        };
        invites.push(invite);
        return route.fulfill({ json: invite });
      }
      case 'teacher_create_assignment': {
        calls.push([name, b]);
        const a = {
          id: randomUUID(),
          class_id: CLASS_ID,
          kind: b.p_kind,
          ref_id: b.p_ref_id ?? null,
          title: b.p_kind === 'lesson' ? 'Chào hỏi và giới thiệu' : null,
          target_count: b.p_target_count ?? null,
          due_at: b.p_due_at ?? null,
          note: b.p_note ?? null,
          created_at: new Date().toISOString(),
          completed_count: 0,
          member_count: 2,
        };
        assignments.push(a);
        return route.fulfill({ json: a });
      }
    }
    return route.fallback();
  });
  return { calls };
}

async function setup(page: Page, opts: { teacher?: boolean; colorScheme?: 'light' | 'dark' } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: opts.colorScheme ?? 'light' });
  await mockSupabase(page);
  const mock = await mockTeacher(page, opts);
  await signIn(page);
  return mock;
}

async function expectNoSeriousAxe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, `${label}: ${JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)}`).toEqual([]);
}

test('a learner without a teacher profile gets an explanation, not the tools', async ({ page }) => {
  const mock = await setup(page, { teacher: false });
  await page.goto('/giao-vien');
  await expect(page.getByRole('heading', { level: 1, name: 'Khu vực dành cho giáo viên' })).toBeVisible({ timeout: 15_000 });
  expect(mock.calls.some(([n]) => n === 'teacher_list_classes')).toBe(false);
  await expect(page).toHaveTitle('Giáo viên — Lớp học của tôi · Linguo');
});

test('class list, invite, roster and assignment flow (axe in both themes, no horizontal scroll)', async ({ page }) => {
  // Three axe scans plus two dialogs: WebKit on a busy runner needs more than the default 30 s.
  test.setTimeout(90_000);
  const mock = await setup(page);
  await page.goto('/giao-vien');
  await expect(page.getByRole('heading', { level: 1, name: 'Lớp học của tôi' })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveTitle('Giáo viên — Lớp học của tôi · Linguo');
  await settleAnimations(page);
  await expectNoHorizontalScroll(page);
  await expectNoSeriousAxe(page, 'class list');

  await page.getByRole('link', { name: /Lớp giao tiếp tối thứ Ba/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lớp giao tiếp tối thứ Ba' })).toBeVisible();
  await expect(page).toHaveTitle('Giáo viên — Chi tiết lớp · Linguo');
  await expect(page.getByText('ABCD-EFGH', { exact: true })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /Nguyễn Thị Lan Anh/ })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /Học viên chưa đặt tên/ })).toContainText('Chưa có lộ trình');
  await expect(page.getByText(/1\/2/).first()).toBeVisible();
  await settleAnimations(page);
  await expectNoHorizontalScroll(page);
  await expectNoSeriousAxe(page, 'class detail');

  await page.getByRole('button', { name: 'Tạo mã mời' }).click();
  let dialog = page.getByRole('dialog', { name: 'Tạo mã mời' });
  await dialog.getByLabel('Hiệu lực trong').selectOption({ label: '1 ngày' });
  await dialog.getByLabel(/Giới hạn số học viên/).fill('25');
  await dialog.getByRole('button', { name: 'Tạo mã' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('KMNP-QRST', { exact: true })).toBeVisible();
  expect(mock.calls.find(([n]) => n === 'teacher_create_invite')?.[1]).toEqual({ p_class_id: CLASS_ID, p_expires_hours: 24, p_max_uses: 25 });

  await page.getByRole('button', { name: 'Giao bài', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Giao bài cho lớp' });
  await dialog.getByLabel('Bài học').selectOption({ label: 'Chào hỏi và giới thiệu' });
  await settleAnimations(page);
  await expectNoSeriousAxe(page, 'assignment dialog');
  await dialog.getByRole('button', { name: 'Giao bài' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 3, name: 'Chào hỏi và giới thiệu' })).toBeVisible();
  expect(mock.calls.find(([n]) => n === 'teacher_create_assignment')?.[1]).toMatchObject({ p_class_id: CLASS_ID, p_kind: 'lesson', p_ref_id: LESSON_ID });
  await expectNoHorizontalScroll(page);
});

test('class detail is axe clean in dark mode', async ({ page }) => {
  await setup(page, { colorScheme: 'dark' });
  await page.goto(`/giao-vien/lop/${CLASS_ID}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Lớp giao tiếp tối thứ Ba' })).toBeVisible({ timeout: 15_000 });
  await settleAnimations(page);
  await expectNoHorizontalScroll(page);
  await expectNoSeriousAxe(page, 'class detail (dark)');
});
