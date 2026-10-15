import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalScroll, mockSupabase, pathRow, settleAnimations, signIn } from './fixtures';

const SHOT_PROJECTS = ['iphone-se', 'pixel-7', 'iphone-15-pro-landscape'];

async function atStep(page: Page, title: string, testInfo: TestInfo, shot: string) {
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expectNoHorizontalScroll(page);
  if (SHOT_PROJECTS.includes(testInfo.project.name)) {
    await testInfo.attach(`onboarding-${shot}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }
}

async function next(page: Page) {
  const button = page.getByRole('button', { name: 'Tiếp tục' });
  await expect(button).toBeEnabled();
  const box = await button.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.y + box.height <= viewport.height, 'Continue must sit inside the viewport').toBeTruthy();
  await button.click();
}

test('a new user creates an English path through the wizard', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page, { paths: [] });
  await signIn(page);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/bat-dau(\?|$)/);

  await atStep(page, 'Bạn muốn học ngôn ngữ nào?', testInfo, '1-language');
  await page.getByRole('radio', { name: /Tiếng Anh/ }).check();
  await next(page);

  await atStep(page, 'Bạn đang ở đâu?', testInfo, '2-start');
  await page.getByRole('radio', { name: 'Tôi đã học một ít' }).check();
  await next(page);

  await atStep(page, 'Trình độ hiện tại của bạn', testInfo, '3-level');
  await page.getByRole('radio', { name: /^A2/ }).check();
  await next(page);

  await atStep(page, 'Mục tiêu của bạn', testInfo, '4-goal');
  await page.getByRole('radio', { name: 'Giao tiếp đời sống' }).check();
  await expect(page.getByRole('radio', { name: /^B1/ })).toBeChecked();
  await next(page);

  await atStep(page, 'Bạn học được bao lâu?', testInfo, '5-schedule');
  const fontSizes = await page.locator('input').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  for (const size of fontSizes) expect(size).toBeGreaterThanOrEqual(16);
  await next(page);

  await atStep(page, 'Xem lại lộ trình', testInfo, '6-review');
  await expect(page.getByText('Khoảng 10–16 tháng')).toBeVisible();
  await page.getByRole('button', { name: 'Tạo lộ trình' }).click();

  await expect(page.getByRole('heading', { name: 'Lộ trình đã sẵn sàng!' })).toBeVisible();
  await page.getByRole('button', { name: 'Vào trang chủ' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('Lộ trình của bạn')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('adding Korean from the language pill preselects it and switching works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page);
  await signIn(page);
  await page.goto('/app');
  await page.getByRole('button', { name: /Ngôn ngữ đang học/ }).click();
  await page.getByRole('button', { name: '+ Thêm Tiếng Hàn' }).click();
  // An explicit language choice starts a fresh Korean draft at step 2 (step 1 is already answered).
  await expect(page).toHaveURL(/\/app\/bat-dau\?.*lang=ko/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bạn đang ở đâu?' })).toBeVisible();
  await page.getByRole('button', { name: 'Quay lại' }).click();
  await expect(page.getByRole('radio', { name: /Tiếng Hàn/ })).toBeChecked();
});

test('switching between two paths updates the pill', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page, {
    paths: [pathRow(), pathRow({ id: 'path-ko', language_code: 'ko', goal_type: 'hangul_basics', current_level: 'hangul', target_level: 'topik1' })],
  });
  await signIn(page);
  await page.goto('/app');
  await page.getByRole('button', { name: /^EN – Ngôn ngữ đang học/ }).click();
  await page.getByRole('button', { name: /Tiếng Hàn/ }).click();
  await expect(page.getByRole('button', { name: /^KO – Ngôn ngữ đang học/ })).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`wizard has no serious a11y violations (${colorScheme})`, async ({ page }, testInfo) => {
    test.skip(!['iphone-15-pro', 'pixel-7'].includes(testInfo.project.name), 'a11y runs on two devices');
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    await mockSupabase(page, { paths: [] });
    await signIn(page);
    await page.goto('/app/bat-dau');
    await expect(page.getByRole('heading', { level: 1, name: 'Bạn muốn học ngôn ngữ nào?' })).toBeVisible();
    await settleAnimations(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
  });
}
