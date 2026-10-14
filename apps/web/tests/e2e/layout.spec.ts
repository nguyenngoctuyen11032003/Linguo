import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, mockSupabase, settleAnimations, signIn } from './fixtures';

const PUBLIC_PATHS = ['/', '/dang-nhap', '/dang-ky', '/quen-mat-khau', '/quyen-rieng-tu', '/khong-ton-tai'];

test.describe('public pages fit every screen', () => {
  // Entrance slides start off-screen and are JS-driven (not in document.getAnimations()), so a fixed wait raced
  // them. Reduced motion keeps the same final layout with opacity-only reveals, which settleAnimations awaits.
  test.use({ reducedMotion: 'reduce' });

  for (const path of PUBLIC_PATHS) {
    test(`no horizontal scroll on ${path}`, async ({ page }) => {
      await mockSupabase(page);
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await settleAnimations(page);
      await expectNoHorizontalScroll(page);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await settleAnimations(page);
      await expectNoHorizontalScroll(page);
    });
  }
});

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await signIn(page);
  });

  for (const path of ['/app', '/app/on-tap', '/app/cai-dat']) {
    test(`no horizontal scroll on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }

  test('bottom nav is pinned to the bottom and never covers content', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'bottom nav is mobile-only');
    await page.goto('/app/cai-dat');
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await expect(nav).toBeVisible();
    const viewport = page.viewportSize();
    const navBox = await nav.boundingBox();
    expect(viewport && navBox).toBeTruthy();
    expect(Math.round(navBox!.y + navBox!.height)).toBe(viewport!.height);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await settleAnimations(page);
    const last = await page.getByRole('button', { name: 'Đăng xuất' }).boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(navBox!.y);
  });
});
