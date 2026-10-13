import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockSupabase, signIn } from './fixtures';

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
      await page.waitForTimeout(800);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
    });
  }
}
