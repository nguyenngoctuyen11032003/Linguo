import { expect, test, type Page } from '@playwright/test';
import { mockSupabase, settleAnimations, signIn } from './fixtures';

// Spec 7 §3: the build injects a CSP meta (apps/web/build/csp.ts). Any violation means the policy and the app
// disagree: either the app loads something new (update the policy on purpose) or something was injected.

async function collectViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
    document.addEventListener('securitypolicyviolation', (e) => {
      // WebKit reports an empty style-src-attr violation when React creates a <select> (its UA internals; the
      // element gets no style attribute and renders identically with or without the CSP). Not from the app.
      const target = e.target as Element | null;
      if (e.effectiveDirective === 'style-src-attr' && !e.sample && target?.tagName === 'SELECT') return;
      seen.push(`${e.effectiveDirective} ${e.blockedURI}`);
    });
  });
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);

test('the built page carries the CSP and referrer metas', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self' 'sha256-");
  expect(csp).toContain("connect-src 'self' https://e2e.invalid");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain('unsafe-inline');
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'strict-origin-when-cross-origin');
});

for (const path of ['/', '/dang-nhap', '/quyen-rieng-tu']) {
  test(`no CSP violations on ${path}`, async ({ page }) => {
    await collectViolations(page);
    await mockSupabase(page);
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await settleAnimations(page);
    expect(await violations(page)).toEqual([]);
  });
}

for (const path of ['/app', '/app/on-tap', '/app/cai-dat']) {
  test(`no CSP violations on ${path} (signed in)`, async ({ page }) => {
    await collectViolations(page);
    await mockSupabase(page);
    await signIn(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settleAnimations(page);
    expect(await violations(page)).toEqual([]);
  });
}
