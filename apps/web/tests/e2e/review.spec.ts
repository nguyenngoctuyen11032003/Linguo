import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, mockSupabase, pathRow, signIn, type ReviewMockOptions } from './fixtures';

const EN_PATH = pathRow({ id: 'path-en', language_code: 'en', current_level: 'pre_a1', target_level: 'a1' });
const KO_PATH = pathRow({ id: 'path-ko', language_code: 'ko', current_level: 'hangul', target_level: 'topik1' });

async function setup(page: Page, reviews: ReviewMockOptions = {}, path: Record<string, unknown> = EN_PATH) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [path], reviews });
  await signIn(page);
  return mock;
}

const counter = (page: Page) => page.getByRole('heading', { level: 2, name: /^Thẻ \d+\/\d+$/ });
const front = (page: Page) => page.getByTestId('flashcard-front');
const back = (page: Page) => page.getByTestId('flashcard-back');
const summaryHeading = (page: Page) => page.getByRole('heading', { name: 'Xong phiên ôn' });

async function openReview(page: Page) {
  await page.goto('/app/on-tap');
  await expect(page.getByRole('heading', { level: 1, name: 'Ôn tập' })).toBeVisible();
  // Loading waits for the profile, the paths and the queue; allow for slow CI devices.
  await expect(counter(page)).toBeVisible({ timeout: 15_000 });
  // Focus lands on the card heading in the same effects pass that installs the keyboard shortcuts.
  await expect(counter(page)).toBeFocused();
}

function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return { testId: el?.dataset.testid ?? '', text: el?.textContent?.trim() ?? '', pressed: el?.getAttribute('aria-pressed') ?? null };
  });
}

async function tabTo(page: Page, match: (f: Awaited<ReturnType<typeof focused>>) => boolean) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (match(await focused(page))) return;
  }
  throw new Error('focus target not reached with Tab');
}

/** Flip and rate the current card with the mouse. */
async function rateWithMouse(page: Page, label: 'Quên' | 'Khó' | 'Được' | 'Dễ' = 'Được') {
  await front(page).click();
  await expect(back(page)).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${label},`) }).click();
}

async function finishWithMouse(page: Page) {
  for (let i = 0; i < 20; i++) {
    if (await summaryHeading(page).isVisible()) return;
    await expect(front(page).or(summaryHeading(page))).toBeVisible();
    if (await summaryHeading(page).isVisible()) return;
    await rateWithMouse(page);
  }
  await expect(summaryHeading(page)).toBeVisible();
}

test('home shows the cards due today and links to the review', async ({ page }) => {
  await setup(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 2, name: 'Ôn tập hôm nay: 4 thẻ' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: 'Ôn ngay' }).click();
  await expect(page).toHaveURL(/\/app\/on-tap$/);
  await expect(counter(page)).toHaveText('Thẻ 1/4', { timeout: 15_000 });
});

test('a whole session can be done with the keyboard only', async ({ page }) => {
  test.setTimeout(90_000);
  const mock = await setup(page);
  await openReview(page);
  await expectNoHorizontalScroll(page);

  let usedConfidence = false;
  for (let i = 0; i < 4; i++) {
    await expect(counter(page)).toHaveText(`Thẻ ${i + 1}/4`);
    await expect(front(page)).toBeVisible();
    const recall = (await page.locator('[data-direction]').getAttribute('data-direction')) === 'recall';
    if (recall && !usedConfidence) {
      // Optional confidence before flipping: pick "Hơi chắc", then flip from the card itself.
      await tabTo(page, (f) => f.text === 'Hơi chắc');
      await page.keyboard.press('Space');
      await expect(page.getByRole('button', { name: 'Hơi chắc' })).toHaveAttribute('aria-pressed', 'true');
      await tabTo(page, (f) => f.testId === 'flashcard-front');
      usedConfidence = true;
    }
    await page.keyboard.press('Space');
    await expect(back(page)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.keyboard.press(i === 0 ? '4' : '3');
  }

  await expect(summaryHeading(page)).toBeVisible();
  await expect(summaryHeading(page)).toBeFocused();
  await expectNoHorizontalScroll(page);
  const grades = mock.reviewGrades();
  expect(grades.map((g) => g.rating)).toEqual([4, 3, 3, 3]);
  expect(grades.some((g) => g.confidence === 2)).toBe(true);
  expect(new Set(grades.map((g) => g.cardId)).size).toBe(4);

  await tabTo(page, (f) => f.text === 'Hôm nay đủ rồi');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app$/);
});

test('a card rated offline waits in the outbox, then syncs once back online', async ({ page, context }) => {
  const mock = await setup(page);
  await openReview(page);

  await context.setOffline(true);
  await rateWithMouse(page, 'Được');
  // The session moves on; the grade waits with its idempotency key.
  await expect(page.getByText(/Đang chờ đồng bộ/).first()).toBeVisible();
  await expect(counter(page)).toHaveText('Thẻ 2/4');
  expect(mock.reviewGrades()).toHaveLength(0);

  await context.setOffline(false);
  await expect.poll(() => mock.reviewGrades().length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.getByText(/Đang chờ đồng bộ/)).toHaveCount(0, { timeout: 20_000 });
  const keys = new Set(mock.reviewGrades().map((g) => g.key));
  expect(keys.size).toBe(1);
  expect(mock.reviewGrades()[0]!.rating).toBe(3);
});

test('P postpones the current card and "Hoãn tất cả" the rest', async ({ page }) => {
  const mock = await setup(page);
  await openReview(page);

  await page.keyboard.press('p');
  // The postponed card leaves today's session.
  await expect(counter(page)).toHaveText('Thẻ 1/3');
  expect(mock.postponeCalls()).toHaveLength(1);
  expect(mock.postponeCalls()[0]).toHaveLength(1);

  // Postponing the rest asks first: dismissing keeps the cards, confirming moves them to tomorrow.
  await page.getByRole('button', { name: 'Hoãn tất cả' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Giữ lại' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(mock.postponeCalls()).toHaveLength(1);
  await page.getByRole('button', { name: 'Hoãn tất cả' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Hoãn \d+ thẻ$/ }).click();
  await expect(summaryHeading(page)).toBeVisible();
  expect(mock.postponeCalls()).toEqual([expect.any(Array), null]);
  expect(mock.reviewGrades()).toHaveLength(0);
  await expectNoHorizontalScroll(page);
});

test('"Hôm nay đủ rồi" ends the day; "+10 thẻ nữa" brings more cards', async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page, { due: 2 });
  await openReview(page);
  await finishWithMouse(page);
  await expect(page.getByText('Đã ôn 2 thẻ', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: '+10 thẻ nữa' }).click();
  await expect(front(page)).toBeVisible();
  await rateWithMouse(page);

  await page.goto('/app/on-tap');
  await finishWithMouse(page);
  await page.getByRole('button', { name: 'Hôm nay đủ rồi' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Chào/);
});

test('an empty day says so', async ({ page }) => {
  await setup(page, { due: 0, extra: 0 });
  await page.goto('/app/on-tap');
  await expect(page.getByRole('heading', { name: 'Hôm nay không có thẻ cần ôn' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Học bài mới' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('recovery mode explains the spread backlog', async ({ page }) => {
  await setup(page, { recoveryBacklog: 120 });
  await openReview(page);
  await expect(page.getByRole('note')).toContainText('Mình chia đều 120 thẻ cho mấy ngày tới');
});

test('Korean cards review the same way', async ({ page }) => {
  const mock = await setup(page, { due: 2 }, KO_PATH);
  await openReview(page);
  await finishWithMouse(page);
  expect(mock.reviewGrades()).toHaveLength(2);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`no serious a11y violations in the review (${colorScheme})`, async ({ page }, testInfo) => {
    test.skip(!['iphone-15-pro', 'pixel-7'].includes(testInfo.project.name), 'a11y runs on two devices');
    test.setTimeout(90_000);
    await setup(page, { due: 2 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    const scan = async (label: string) => {
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, `${label}: ${JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)}`).toEqual([]);
    };

    await openReview(page);
    await scan('card front');
    await front(page).click();
    await expect(back(page)).toBeVisible();
    await scan('card back');
    await page.getByRole('button', { name: 'Hoãn tất cả' }).click();
    await expect(page.getByRole('dialog', { name: /^Hoãn \d+ thẻ còn lại\?$/ })).toBeVisible();
    await scan('postpone-all dialog');
    await page.getByRole('button', { name: 'Giữ lại' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: /^Được,/ }).click();
    await finishWithMouse(page);
    await scan('summary');
  });
}
