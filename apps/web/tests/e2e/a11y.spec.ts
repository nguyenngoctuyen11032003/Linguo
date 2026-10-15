import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockSupabase, settleAnimations, signIn } from './fixtures';

const PAGES = [
  { path: '/', auth: false },
  { path: '/dang-nhap', auth: false },
  { path: '/dang-ky', auth: false },
  { path: '/app', auth: true },
  { path: '/app/cai-dat', auth: true },
];

for (const { path, auth } of PAGES) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`no serious a11y violations on ${path} (${colorScheme})`, async ({ page }, testInfo) => {
      test.skip(!['iphone-15-pro', 'pixel-7'].includes(testInfo.project.name), 'a11y runs on two devices');
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
      await mockSupabase(page);
      if (auth) await signIn(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      await settleAnimations(page);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
    });
  }
}
