import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { staffListFixture } from '../../src/features/admin/staff-fixtures';
import { expectNoHorizontalScroll, mockSupabase, settleAnimations, signIn, USER_ID } from './fixtures';

// /quan-tri/nhan-su: staff list, grant by email, change and revoke (with confirmation). The admin_list_staff /
// admin_find_user / admin_grant_role replies are routed here, on top of mockSupabase (later routes win), so the shared
// fixtures stay untouched. The signed-in e2e user is the first (admin) row.

type Member = ReturnType<typeof staffListFixture>[number];

async function setup(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page, { admin: { staffRole: 'admin' } });
  let staff: Member[] = staffListFixture().map((m, i) => (i === 0 ? { ...m, user_id: USER_ID } : m));
  const grants: Array<Record<string, unknown>> = [];
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/rest/v1/rpc/admin_list_staff', (route) => route.fulfill(json(staff)));
  await page.route('**/rest/v1/rpc/admin_find_user', (route) => {
    const q = String((route.request().postDataJSON() as Record<string, unknown>).p_query).toLowerCase();
    const hit = q === 'mai@example.com' ? { user_id: '50000000-0000-4000-8000-0000000000aa', email: 'mai@example.com', display_name: 'Mai Trần', role: null } : null;
    return route.fulfill(json(hit));
  });
  await page.route('**/rest/v1/rpc/admin_grant_role', (route) => {
    const b = route.request().postDataJSON() as { p_user_id: string; p_role: Member['role'] | null };
    grants.push(b);
    if (b.p_role === null) staff = staff.filter((m) => m.user_id !== b.p_user_id);
    else if (staff.some((m) => m.user_id === b.p_user_id)) staff = staff.map((m) => (m.user_id === b.p_user_id ? { ...m, role: b.p_role! } : m));
    else
      staff = [
        ...staff,
        { user_id: b.p_user_id, email: 'mai@example.com', display_name: 'Mai Trần', role: b.p_role, granted_by: USER_ID, granted_by_email: 'staff@example.com', granted_at: new Date().toISOString() },
      ];
    return route.fulfill(json({ user_id: b.p_user_id, role: b.p_role }));
  });
  await signIn(page);
  return { grants: () => [...grants] };
}

async function open(page: Page) {
  await page.goto('/quan-tri/nhan-su');
  await expect(page.getByRole('heading', { level: 1, name: 'Nhân sự' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('list', { name: 'Danh sách nhân sự' })).toBeVisible();
  await settleAnimations(page);
}

test('an admin grants, changes and revokes staff roles', async ({ page }) => {
  const backend = await setup(page);
  await open(page);
  await expectNoHorizontalScroll(page);
  const list = page.getByRole('list', { name: 'Danh sách nhân sự' });
  await expect(list.getByRole('listitem').first().getByText('Bạn', { exact: true })).toBeVisible();
  await expect(list.getByRole('listitem').first().getByRole('button', { name: /Thu hồi/ })).toHaveCount(0);

  await page.getByLabel('Email hoặc mã người dùng').fill('mai@example.com');
  await page.getByRole('button', { name: 'Tìm tài khoản' }).click();
  await page.getByRole('combobox', { name: 'Vai trò', exact: true }).selectOption('reviewer');
  await page.getByRole('button', { name: 'Cấp vai trò' }).click();
  await expect(page.getByText('Đã cấp vai trò "Người duyệt" cho Mai Trần.')).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(4);

  await page.getByRole('combobox', { name: 'Vai trò của huy@example.com' }).selectOption('reviewer');
  await list.getByRole('listitem').filter({ hasText: 'huy@example.com' }).getByRole('button', { name: 'Lưu vai trò' }).click();
  await expect(page.getByText('Đã đổi vai trò của huy@example.com thành "Người duyệt".')).toBeVisible();

  await page.getByRole('button', { name: 'Thu hồi vai trò của Lan Phạm' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Thu hồi vai trò?' });
  await expect(dialog).toBeVisible();
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Thu hồi' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Đã thu hồi vai trò của Lan Phạm.')).toBeVisible();
  await expect(list.getByText('Lan Phạm')).toHaveCount(0);

  expect(backend.grants().map((g) => g.p_role)).toEqual(['reviewer', 'reviewer', null]);
});

test('/quan-tri/nhan-su: no horizontal scroll and no serious a11y violations', async ({ page }, testInfo) => {
  await setup(page);
  await open(page);
  await expectNoHorizontalScroll(page);

  if (!['iphone-15-pro', 'pixel-7'].includes(testInfo.project.name)) return;
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    await open(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const summary = serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }));
    expect(serious, `${colorScheme}: ${JSON.stringify(summary, null, 2)}`).toEqual([]);
  }
});
