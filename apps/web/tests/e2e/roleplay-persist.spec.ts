import { expect, test, type Page } from '@playwright/test';
import { mockSupabase, pathRow, PROGRESS_PATH_ID, signIn, USER_ID } from './fixtures';

// An unfinished role-play conversation is kept per user in localStorage: it survives closing the tab and is wiped on
// sign-out (features/roleplay/storage.ts, features/account/service.ts).

const EN_PATH = pathRow({ id: PROGRESS_PATH_ID, language_code: 'en', current_level: 'a2', target_level: 'b1' });
const ACKED = '2026-10-01T03:00:00Z';
const KEY = `linguo:roleplay:v2:${USER_ID}`;

async function setup(page: Page) {
  if (test.info().timeout < 60_000) test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page, { paths: [EN_PATH], ai: { ackAt: ACKED }, progress: {} });
  await signIn(page);
}

async function chatOneTurn(page: Page) {
  await page.goto('/app/dong-vai');
  await page.getByRole('button', { name: 'Bắt đầu: Gọi đồ ở quán cà phê' }).click();
  await expect(page.getByText('Hi! Welcome to Sunny Café. What can I get you today?')).toBeVisible({ timeout: 15_000 });
  await page.getByLabel(/Tin nhắn của bạn/).fill('A coffee please');
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(page.getByText('Lượt 2/12')).toBeVisible();
}

const roleplayKeys = (page: Page) =>
  page.evaluate(() =>
    [localStorage, sessionStorage].flatMap((store) => Object.keys(store).filter((k) => k.startsWith('linguo:roleplay:'))),
  );

test('the conversation survives closing the tab and opening the app again', async ({ context, page }) => {
  await setup(page);
  await chatOneTurn(page);
  expect(await roleplayKeys(page)).toEqual([KEY]);
  await page.close();

  // A new tab in the same browser profile: sessionStorage is fresh, localStorage is shared.
  const next = await context.newPage();
  await setup(next);
  await next.goto('/app/dong-vai');
  await expect(next.getByText('A coffee please')).toBeVisible({ timeout: 15_000 });
  await expect(next.getByText('Lượt 2/12')).toBeVisible();
});

test('signing out wipes the saved conversation', async ({ page }) => {
  await setup(page);
  await chatOneTurn(page);
  await page.goto('/app/cai-dat');
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  // Signed out: the app leaves the settings page (to the landing or the sign-in page).
  await expect(page).not.toHaveURL(/\/app\/cai-dat$/, { timeout: 15_000 });
  await expect.poll(() => roleplayKeys(page)).toEqual([]);
});
