import { expect, test } from '@playwright/test';
import { mockSupabase, signIn } from './fixtures';

test('signed-out users are sent to sign in and keep the target', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/app/cai-dat');
  await expect(page).toHaveURL(/\/dang-nhap\?next=%2Fapp%2Fcai-dat$/);
  await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
});

test('signed-in users see their name on home', async ({ page }) => {
  await mockSupabase(page);
  await signIn(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chào Anh');
});

test('"Thêm" opens the sheet and navigates to settings', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'bottom nav is mobile-only');
  await mockSupabase(page);
  await signIn(page);
  await page.goto('/app');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await expect(page.getByRole('dialog', { name: 'Thêm' })).toBeVisible();
  await page.getByRole('link', { name: /Cài đặt/ }).click();
  await expect(page).toHaveURL(/\/app\/cai-dat$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Cài đặt' })).toBeVisible();
});

test('deep links work (SPA fallback)', async ({ page }) => {
  await mockSupabase(page);
  const response = await page.goto('/quyen-rieng-tu');
  expect(response?.ok() || response?.status() === 404).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Quyền riêng tư' })).toBeVisible();
});
