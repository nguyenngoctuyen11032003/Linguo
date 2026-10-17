import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, mockPersonalVocab, mockSupabase, PERSONAL_LIST_ID, SUPABASE_URL, signIn } from './fixtures';

// Personal vocabulary offline: grades made without a network wait in the personal outbox, the session still finishes,
// and they are sent in order with their idempotency keys once the browser is back online.

const LIST_URL = `/app/tu-vung-cua-toi/${PERSONAL_LIST_ID}`;

test('a personal review finishes offline and its grades sync once back online', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page);
  const mock = await mockPersonalVocab(page, {
    lists: [
      {
        id: PERSONAL_LIST_ID,
        name: 'Từ vựng TOPIK',
        language_code: 'ko',
        words: [
          { term: '사과', meaning: 'quả táo' },
          { term: '학교', meaning: 'trường học' },
          { term: '바나나', meaning: 'quả chuối' },
        ],
      },
    ],
  });
  // Registered last so it runs first: records every grade request that reaches the server, then hands it on.
  const sent: Array<{ word: string; rating: number; key: string }> = [];
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/grade_personal_word`, (route) => {
    const b = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    sent.push({ word: String(b.p_word_id), rating: Number(b.p_rating), key: String(b.p_idempotency_key) });
    return route.fallback();
  });
  await signIn(page);

  await page.goto(`${LIST_URL}/on-tap`);
  const counter = page.getByRole('heading', { level: 2, name: /^Thẻ \d+\/3$/ });
  await expect(counter).toHaveText('Thẻ 1/3', { timeout: 15_000 });

  // Online: the first grade goes straight to the server.
  await page.getByTestId('flashcard-front').click();
  await page.keyboard.press('3');
  await expect(counter).toHaveText('Thẻ 2/3');
  await expect.poll(() => mock.grades().length).toBe(1);

  await context.setOffline(true);
  await page.getByTestId('flashcard-front').click();
  await page.keyboard.press('1');
  await expect(counter).toHaveText('Thẻ 3/3');
  await expect(page.getByText('Đang chờ gửi 1 lượt chấm')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByTestId('flashcard-front').click();
  await page.keyboard.press('4');
  await expect(page.getByRole('heading', { name: 'Xong phiên ôn' })).toBeVisible();
  await expect(page.getByText('Bạn vừa ôn 3 từ.')).toBeVisible();
  await expect(page.getByText(/Còn 2 lượt chấm đang chờ gửi/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(mock.grades()).toHaveLength(1);

  await context.setOffline(false);
  await expect.poll(() => mock.grades().length, { timeout: 20_000 }).toBe(3);
  await expect(page.getByText(/đang chờ gửi/)).toHaveCount(0, { timeout: 20_000 });
  expect(mock.grades().map((g) => g.rating)).toEqual([3, 1, 4]);
  // Every word was graded once on the server, under one idempotency key each.
  const delivered = new Map(sent.map((s) => [s.word, s.key]));
  expect(delivered.size).toBe(3);
  expect(new Set(delivered.values()).size).toBe(3);
});

test('a personal review starts offline from the queue saved when the lists loaded', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page);
  const mock = await mockPersonalVocab(page, {
    lists: [
      {
        id: PERSONAL_LIST_ID,
        name: 'Từ vựng TOPIK',
        language_code: 'ko',
        words: [
          { term: '사과', meaning: 'quả táo' },
          { term: '학교', meaning: 'trường học' },
        ],
      },
    ],
  });
  await signIn(page);

  // Online first: the lists load (the due words are saved on the device) and the review chunk is fetched.
  await page.goto('/app/tu-vung-cua-toi');
  await expect(page.getByText('Từ vựng TOPIK')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith('linguo-snap-v1:personal-queue:')));
  await page.getByRole('link', { name: /Từ vựng TOPIK/ }).click();
  await page.getByRole('link', { name: 'Ôn danh sách này' }).first().click();
  const counter = page.getByRole('heading', { level: 2, name: /^Thẻ \d+\/2$/ });
  await expect(counter).toHaveText('Thẻ 1/2', { timeout: 15_000 });
  await page.goBack();
  await page.goBack();

  await context.setOffline(true);
  await expect(page.getByText('Từ vựng TOPIK')).toBeVisible();
  await page.getByRole('link', { name: /Từ vựng TOPIK/ }).click();
  await page.getByRole('link', { name: 'Ôn danh sách này' }).first().click();
  await expect(counter).toHaveText('Thẻ 1/2', { timeout: 15_000 });
  await page.getByTestId('flashcard-front').click();
  await page.keyboard.press('3');
  await expect(counter).toHaveText('Thẻ 2/2');
  expect(mock.grades()).toHaveLength(0);

  await context.setOffline(false);
  await expect.poll(() => mock.grades().length, { timeout: 20_000 }).toBe(1);
});
