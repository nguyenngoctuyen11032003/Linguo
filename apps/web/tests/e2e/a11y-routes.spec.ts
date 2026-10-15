import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEMO_LESSONS, mockSupabase, pathRow, PROGRESS_PATH_ID, settleAnimations, signIn } from './fixtures';

// Spec 7 §4: axe over every main route on a small iPhone, an Android phone and a desktop viewport, plus keyboard
// focus, the offline banner and prefers-reduced-motion. a11y.spec.ts keeps its own light/dark pass over the auth
// pages; this sweep covers the full route list (sign-up and forgot-password stay with a11y.spec / forms.spec).

const MOBILE_PROJECTS = ['iphone-se', 'pixel-7'];
/** Desktop runs as a viewport override inside one Chromium project: playwright.config only defines phones. */
const DESKTOP_PROJECT = 'pixel-7';
const DESKTOP = { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false } as const;

const EN_PATH = pathRow({ id: PROGRESS_PATH_ID });
const PATH_ID = String(EN_PATH.id);

interface RouteCase {
  name: string;
  path: string;
  auth: boolean;
  /** Visible once the route has finished loading its data. */
  ready: (page: Page) => Locator;
}

const h1 = (page: Page) => page.getByRole('heading', { level: 1 }).first();

const ROUTES: RouteCase[] = [
  { name: 'landing', path: '/', auth: false, ready: h1 },
  { name: 'sign-in', path: '/dang-nhap', auth: false, ready: h1 },
  { name: 'privacy', path: '/quyen-rieng-tu', auth: false, ready: h1 },
  { name: 'terms', path: '/dieu-khoan', auth: false, ready: h1 },
  { name: '404', path: '/khong-ton-tai', auth: false, ready: h1 },
  { name: 'home', path: '/app', auth: true, ready: h1 },
  { name: 'learn', path: '/app/hoc-tap', auth: true, ready: h1 },
  {
    name: 'lesson',
    path: `/app/hoc-tap/bai/${String(DEMO_LESSONS.enHello.id)}`,
    auth: true,
    // The lesson title in the header; loading and error states only carry an sr-only h1 (or none).
    ready: (page) => page.locator('h1:not(.sr-only)'),
  },
  { name: 'review', path: '/app/on-tap', auth: true, ready: h1 },
  {
    name: 'diagnostic',
    path: `/app/kiem-tra/${PATH_ID}`,
    auth: true,
    ready: (page) => page.getByRole('button', { name: /^(Bắt đầu|Làm tiếp)$/ }),
  },
  { name: 'tutor', path: '/app/gia-su', auth: true, ready: (page) => page.getByRole('heading', { level: 1, name: 'Gia sư AI' }) },
  {
    name: 'speaking',
    path: '/app/luyen-noi',
    auth: true,
    ready: (page) => page.getByRole('heading', { level: 2, name: 'Nhắc lại câu' }),
  },
  { name: 'roleplay', path: '/app/dong-vai', auth: true, ready: (page) => page.getByRole('heading', { level: 2, name: 'Hợp trình độ của bạn' }) },
  { name: 'settings', path: '/app/cai-dat', auth: true, ready: h1 },
  { name: 'notifications', path: '/app/thong-bao', auth: true, ready: h1 },
  { name: 'session', path: '/app/phien-hoc', auth: true, ready: (page) => page.getByRole('heading', { level: 2 }).first() },
  {
    name: 'progress',
    path: '/app/tien-do',
    auth: true,
    ready: (page) => page.getByRole('heading', { level: 2, name: 'Năng lực ước lượng', exact: true }),
  },
];

async function openRoute(page: Page, route: RouteCase, colorScheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
  await mockSupabase(page, { paths: [EN_PATH] });
  if (route.auth) await signIn(page);
  await page.goto(route.path);
  // Loading waits for the profile, the paths and the route's RPCs; WebKit is slow when the suite runs in parallel.
  await expect(route.ready(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
  await settleAnimations(page);
}

async function expectNoSeriousAxe(page: Page, label: string) {
  // The offline banner and any late-mounted node enter with a transition; axe must not sample mid-fade colours.
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious,
    `${label}: ${JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)}`,
  ).toEqual([]);
}

function sweep(variant: string, projects: string[]) {
  for (const route of ROUTES) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`axe: ${route.name} ${route.path} (${variant}, ${colorScheme})`, async ({ page }, testInfo) => {
        test.skip(!projects.includes(testInfo.project.name), `${variant} sweep runs on ${projects.join(', ')}`);
        await openRoute(page, route, colorScheme);
        await expectNoSeriousAxe(page, `${route.path} ${variant} ${colorScheme}`);
      });
    }
  }
}

test.describe('axe sweep, phones', () => {
  sweep('mobile', MOBILE_PROJECTS);
});

test.describe('axe sweep, desktop', () => {
  test.use(DESKTOP);
  sweep('desktop', [DESKTOP_PROJECT]);
});

/** Focus ring: global.css `:focus-visible` draws a 3px outline; form fields draw a `ring-4` box-shadow instead. */
async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  const ring = await locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle === 'none' ? 0 : parseFloat(s.outlineWidth), shadow: s.boxShadow };
  });
  expect(ring.outline >= 2 || ring.shadow !== 'none', `focused element must show a focus ring: ${JSON.stringify(ring)}`).toBe(true);
}

test.describe('keyboard, desktop', () => {
  test.use(DESKTOP);
  // WebKit skips links on Tab by default (Safari's setting), so keyboard order is checked in Chromium.
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== DESKTOP_PROJECT, 'keyboard order runs on desktop Chromium');
  });

  test('Tab reaches the skip link first, then the main navigation', async ({ page }) => {
    await openRoute(page, ROUTES.find((r) => r.name === 'home')!);

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Bỏ qua tới nội dung' });
    await expectVisibleFocus(skip);
    const box = await skip.boundingBox();
    expect(box && box.width > 1 && box.height > 1, 'skip link must be visible once focused').toBeTruthy();

    let reachedNav = false;
    for (let i = 0; i < 10 && !reachedNav; i++) {
      await page.keyboard.press('Tab');
      reachedNav = await page.evaluate(() => Boolean(document.activeElement?.closest('nav')));
    }
    expect(reachedNav, 'Tab must reach the main navigation').toBe(true);
    await expectVisibleFocus(page.locator(':focus'));
  });

  test('the skip link moves keyboard focus past the navigation into main', async ({ page }) => {
    await openRoute(page, ROUTES.find((r) => r.name === 'home')!);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Bỏ qua tới nội dung' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    // The fragment moves the sequential focus starting point: the next Tab lands inside main, not in the sidebar.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('main')))).toBe(true);
    await expectVisibleFocus(page.locator(':focus'));
  });

  test('sign-in form is fully operable by keyboard with a visible focus ring', async ({ page }) => {
    await openRoute(page, ROUTES.find((r) => r.name === 'sign-in')!);
    const email = page.getByLabel('Email', { exact: false }).first();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      if (await email.evaluate((el) => el === document.activeElement)) break;
    }
    await expectVisibleFocus(email);
  });
});

test.describe('keyboard, phone dialogs', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'pixel-7', 'keyboard focus runs in Chromium');
  });

  test('the "Thêm" sheet traps focus and returns it to its trigger on Escape', async ({ page }) => {
    await openRoute(page, ROUTES.find((r) => r.name === 'home')!);
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
    const more = nav.getByRole('button', { name: 'Thêm' });
    await more.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1} left the dialog`).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(more).toBeFocused();
  });
});

test.describe('route titles and focus', () => {
  test.beforeEach(({}, testInfo) => { // eslint-disable-line no-empty-pattern
    test.skip(!MOBILE_PROJECTS.includes(testInfo.project.name), `route titles run on ${MOBILE_PROJECTS.join(', ')}`);
  });

  const TITLES: Array<[string, string]> = [
    ['sign-in', 'Đăng nhập · Linguo'],
    ['privacy', 'Quyền riêng tư · Linguo'],
    ['terms', 'Điều khoản sử dụng · Linguo'],
    ['404', 'Không tìm thấy trang · Linguo'],
    ['home', 'Trang chủ · Linguo'],
    ['learn', 'Học tập · Linguo'],
    ['review', 'Ôn tập · Linguo'],
    ['settings', 'Cài đặt · Linguo'],
  ];
  for (const [name, title] of TITLES) {
    test(`${name} has its own document title`, async ({ page }) => {
      await openRoute(page, ROUTES.find((r) => r.name === name)!);
      await expect(page).toHaveTitle(title);
    });
  }

  test('navigating moves focus to the new page heading, announces it and updates the title', async ({ page }) => {
    await openRoute(page, ROUTES.find((r) => r.name === 'home')!);
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Học tập' }).click();
    await expect(page).toHaveTitle('Học tập · Linguo');
    await expect(page.getByRole('heading', { level: 1, name: 'Học tập' })).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: /^Học tập$/ })).toHaveCount(1);
  });
});

test.describe('offline', () => {
  test.beforeEach(({}, testInfo) => { // eslint-disable-line no-empty-pattern
    test.skip(!MOBILE_PROJECTS.includes(testInfo.project.name), `offline runs on ${MOBILE_PROJECTS.join(', ')}`);
  });

  for (const name of ['landing', 'home', 'lesson']) {
    test(`going offline on ${name} shows the banner without breaking the page`, async ({ page, context }) => {
      const route = ROUTES.find((r) => r.name === name)!;
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await openRoute(page, route);

      const banner = page.getByText('Bạn đang ngoại tuyến — tiến độ sẽ được lưu khi có mạng');
      await expect(banner).toHaveCount(0);
      await context.setOffline(true);
      await expect(banner).toBeVisible();
      await expect(route.ready(page)).toBeVisible();
      if (name === 'home') {
        // In flow, not fixed: the app bar's avatar must stay the topmost element at its own centre point.
        const avatar = page.getByRole('link', { name: 'Tài khoản và cài đặt' });
        await expect(avatar).toBeVisible();
        const covered = await avatar.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return !(top && el.contains(top));
        });
        expect(covered, 'offline banner must not cover the app bar').toBe(false);
        const bannerBox = await banner.boundingBox();
        expect(bannerBox && bannerBox.height <= 24, 'one line of copy').toBeTruthy();
      }
      await expectNoSeriousAxe(page, `${route.path} offline`);

      await context.setOffline(false);
      await expect(banner).toHaveCount(0);
      await expect(route.ready(page)).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

test.describe('prefers-reduced-motion', () => {
  test.beforeEach(({}, testInfo) => { // eslint-disable-line no-empty-pattern
    test.skip(!MOBILE_PROJECTS.includes(testInfo.project.name), `reduced motion runs on ${MOBILE_PROJECTS.join(', ')}`);
  });

  for (const name of ['landing', 'home', 'learn', 'session']) {
    test(`no long animations on ${name} with reduced motion`, async ({ page }) => {
      const route = ROUTES.find((r) => r.name === name)!;
      // Record every Web Animation / CSS transition from the first paint on, so short-lived ones are seen too.
      await page.addInitScript(() => {
        const w = window as unknown as { __longAnimations: string[] };
        w.__longAnimations = [];
        const check = () => {
          for (const a of document.getAnimations()) {
            const end = Number(a.effect?.getComputedTiming().endTime);
            if (!Number.isFinite(end) || end > 300) {
              const target = (a.effect as KeyframeEffect | null)?.target;
              const label = `${a.constructor.name} ${String(end)}ms on ${target ? target.tagName.toLowerCase() + (target.className ? `.${String(target.className).split(' ')[0]}` : '') : '?'}`;
              if (!w.__longAnimations.includes(label)) w.__longAnimations.push(label);
            }
          }
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
      await openRoute(page, route);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await settleAnimations(page);
      const long = await page.evaluate(() => (window as unknown as { __longAnimations: string[] }).__longAnimations);
      expect(long, 'reduced motion must not run animations longer than 300ms').toEqual([]);
    });
  }
});
