import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, mockSupabase, settleAnimations, signIn, SUPABASE_URL, USER_ID } from './fixtures';

const A11Y_PROJECTS = ['iphone-15-pro', 'pixel-7'];

/** `include` scopes axe to one part of a long page (the settings time zone list makes full scans slow on WebKit). */
async function expectNoSeriousA11y(page: Page, include?: string) {
  await settleAnimations(page);
  const builder = new AxeBuilder({ page });
  if (include) builder.include(include);
  const results = await builder.analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
}

/** The account RPCs of spec 7 §1, answered here instead of in the shared fixtures. */
async function mockAccountRpcs(page: Page, { exportStatus = 200 }: { exportStatus?: number } = {}) {
  const calls = { export: 0, delete: [] as unknown[] };
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/export_my_data`, (route) => {
    calls.export += 1;
    if (exportStatus !== 200) return route.fulfill({ status: exportStatus, json: { code: 'P0001', message: 'rate_limited', details: null, hint: null } });
    return route.fulfill({ json: { profile: { id: USER_ID, display_name: 'Minh Anh' }, learning_paths: [], ai_usage: [] } });
  });
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/delete_my_account`, (route) => {
    calls.delete.push(route.request().postDataJSON());
    return route.fulfill({ status: 204, body: '' });
  });
  return calls;
}

test.describe('legal pages', () => {
  test('landing footer links to both pages, which link to each other', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/');
    const footer = page.getByRole('navigation', { name: 'Pháp lý' });
    await expect(footer.getByRole('link', { name: 'Quyền riêng tư' })).toHaveAttribute('href', /\/quyen-rieng-tu$/);
    await expect(footer.getByRole('link', { name: 'Điều khoản' })).toHaveAttribute('href', /\/dieu-khoan$/);
    // Opened directly: client-side navigation away from the animated landing page can take >20 s to repaint in headless WebKit.
    await page.goto('/quyen-rieng-tu');
    await expect(page.getByRole('heading', { level: 1, name: 'Quyền riêng tư' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Gia sư AI và Gemini' })).toBeVisible();
    await expect(page.getByText(/không gửi tên, email hay lịch sử học/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('link', { name: 'Xem Điều khoản sử dụng' }).click();
    await expect(page).toHaveURL(/\/dieu-khoan$/);
    await expect(page.getByText(/là gợi ý học tập, không phải đáp án chính thức/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  for (const path of ['/quyen-rieng-tu', '/dieu-khoan', '/khong-co-trang-nay']) {
    test(`no serious a11y violations on ${path}`, async ({ page }, testInfo) => {
      test.skip(!A11Y_PROJECTS.includes(testInfo.project.name), 'a11y runs on two devices');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mockSupabase(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoSeriousA11y(page);
    });
  }
});

test('unknown routes show the Vietnamese 404 page', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/khong-co-trang-nay');
  await expect(page.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
  await expectNoHorizontalScroll(page);
});

test('the offline banner follows the connection', async ({ page, context }) => {
  await mockSupabase(page);
  await signIn(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const banner = page.getByText('Bạn đang ngoại tuyến — tiến độ sẽ được lưu khi có mạng');
  await expect(banner).toBeHidden();
  await context.setOffline(true);
  await expect(banner).toBeVisible();
  await expect(page.locator('[role="status"][aria-live="polite"]').filter({ has: banner })).toHaveCount(1);
  await context.setOffline(false);
  await expect(banner).toBeHidden();
});

test.describe('account data', () => {
  test('downloads the export as linguo-du-lieu-<date>.json', async ({ page }) => {
    await mockSupabase(page);
    const calls = await mockAccountRpcs(page);
    await signIn(page);
    await page.goto('/app/cai-dat#tai-khoan-du-lieu');
    const section = page.getByRole('region', { name: 'Tài khoản và dữ liệu' });
    await expect(section.getByText(/tự xoá sau 90 ngày/).first()).toBeVisible();
    await expect(section.getByRole('link', { name: 'Quyền riêng tư' })).toHaveAttribute('href', /\/quyen-rieng-tu$/);
    const downloadPromise = page.waitForEvent('download');
    await section.getByRole('button', { name: 'Tải dữ liệu của tôi' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^linguo-du-lieu-\d{4}-\d{2}-\d{2}\.json$/);
    const file = await download.path();
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ profile: { id: USER_ID } });
    expect(calls.export).toBe(1);
    await expect(page.getByText('Đã tải dữ liệu của bạn.')).toBeVisible();
  });

  test('a rate-limited export explains itself', async ({ page }) => {
    await mockSupabase(page);
    await mockAccountRpcs(page, { exportStatus: 400 });
    await signIn(page);
    await page.goto('/app/cai-dat#tai-khoan-du-lieu');
    await page.getByRole('button', { name: 'Tải dữ liệu của tôi' }).click();
    await expect(page.getByText(/tải dữ liệu nhiều lần/)).toBeVisible();
  });

  test('deleting the account needs the typed phrase, then signs out to the landing page', async ({ page }, testInfo) => {
    test.slow(); // ends on the animated landing page, slow to paint in headless WebKit
    await mockSupabase(page);
    const calls = await mockAccountRpcs(page);
    await page.addInitScript(() => {
      const removeItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key: string) {
        if (key.startsWith('sb-')) sessionStorage.setItem('removed-sb-session', '1');
        return removeItem.call(this, key);
      };
    });
    await signIn(page);
    await page.goto('/app/cai-dat#tai-khoan-du-lieu');
    await page.getByRole('button', { name: 'Xoá tài khoản' }).click();
    const dialog = page.getByRole('dialog', { name: 'Xoá vĩnh viễn tài khoản?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/không thể hoàn tác/)).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Xoá vĩnh viễn' });
    await expect(confirm).toBeDisabled();
    if (A11Y_PROJECTS.includes(testInfo.project.name)) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expectNoSeriousA11y(page, '[role="dialog"]');
    }
    await dialog.getByLabel(/để xác nhận/).fill('XOA TAI KHOAN');
    await confirm.click();
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    expect(calls.delete).toEqual([{ p_confirm: 'XOA TAI KHOAN' }]);
    // The sign-out ends with a full page load and signIn() re-seeds the session on every load, so check that the
    // session key was removed (recorded in sessionStorage, which survives the reload) rather than its final state.
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('removed-sb-session')).catch(() => null), { timeout: 20_000 })
      .toBe('1');
    await expect(page).toHaveURL(/\/$/);
  });

  test('settings with the account section has no serious a11y violations', async ({ page }, testInfo) => {
    test.skip(!A11Y_PROJECTS.includes(testInfo.project.name), 'a11y runs on two devices');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockSupabase(page);
    await mockAccountRpcs(page);
    await signIn(page);
    await page.goto('/app/cai-dat#tai-khoan-du-lieu');
    await expect(page.getByRole('region', { name: 'Tài khoản và dữ liệu' })).toBeVisible();
    await settleAnimations(page);
    await expectNoSeriousA11y(page, 'section[aria-labelledby="account-data-heading"]');
  });
});
