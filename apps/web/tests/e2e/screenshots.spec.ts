import { expect, test } from '@playwright/test';
import { mockSupabase, settleAnimations, signIn } from './fixtures';

/** Attached to the HTML report for human review (no pixel diffing: Windows/Linux baselines differ). */
for (const colorScheme of ['light', 'dark'] as const) {
  test(`screenshots (${colorScheme})`, async ({ page }, testInfo) => {
    test.skip(!['iphone-se', 'iphone-15-pro', 'pixel-7', 'iphone-15-pro-landscape'].includes(testInfo.project.name));
    test.setTimeout(60_000); // three full-page captures can exceed 30s on a loaded machine
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await mockSupabase(page);
    for (const [name, path] of [
      ['landing', '/'],
      ['sign-in', '/dang-nhap'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
      await settleAnimations(page);
      await testInfo.attach(`${name}-${colorScheme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
    await signIn(page);
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await testInfo.attach(`app-home-${colorScheme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}
