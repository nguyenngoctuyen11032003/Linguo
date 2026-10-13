import { expect, test } from '@playwright/test';
import { mockSupabase } from './fixtures';

for (const path of ['/dang-nhap', '/dang-ky', '/quen-mat-khau']) {
  test(`inputs ≥16px and touch targets ≥44px on ${path}`, async ({ page }) => {
    await mockSupabase(page);
    await page.goto(path);
    const fontSizes = await page.locator('input, select, textarea').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(fontSizes.length).toBeGreaterThan(0);
    for (const size of fontSizes) expect(size, 'iOS zooms into inputs smaller than 16px').toBeGreaterThanOrEqual(16);

    const targets = await page.locator('main button, main a').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, label: el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName };
      }),
    );
    for (const t of targets) {
      expect(t.h, `"${t.label}" height`).toBeGreaterThanOrEqual(44);
      expect(t.w, `"${t.label}" width`).toBeGreaterThanOrEqual(44);
    }
  });
}
