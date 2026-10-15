// Recorded listening audio (features/audio): the lesson's listen exercise gets a generated `audio_asset_id`, the clip
// is served by a mocked Storage route, and a missing clip falls back to the machine voice and the transcript.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_LESSONS, lessonExercises, mockSupabase, pathRow, signIn, SUPABASE_URL } from './fixtures';

const EN_PATH = pathRow({ id: 'path-en', language_code: 'en', current_level: 'pre_a1', target_level: 'a1' });
const ASSET_ID = `en-${'0123456789abcdef'.repeat(2)}`;
const CLIP_URL = `${SUPABASE_URL}/storage/v1/object/public/content-audio/en/${ASSET_ID}.wav`;

/** A silent RIFF/WAVE clip: PCM 16-bit mono 24 kHz, like the generated assets. */
function silentWav(seconds: number): Buffer {
  const rate = 24_000;
  const data = rate * 2 * seconds;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + data, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(data, 40);
  return b;
}

// The fixture bundle is module state shared by the worker: patch the listen exercise for this file only.
const listen = lessonExercises(DEMO_LESSONS.enHello.id as string).find((e) => e.exercise_type === 'listen');
const original = listen && { audio: listen.prompt.audio_asset_id, order: listen.order_index, stage: listen.stage };

test.beforeEach(() => {
  if (!listen) throw new Error('the demo "hello" lesson has no listen exercise');
  listen.prompt.audio_asset_id = ASSET_ID;
  // Play it first so the spec does not have to answer the rest of the lesson.
  listen.stage = 'recognition';
  listen.order_index = -1;
});

test.afterEach(() => {
  if (!listen || !original) return;
  listen.prompt.audio_asset_id = original.audio;
  listen.order_index = original.order;
  listen.stage = original.stage;
});

async function openListen(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page, { paths: [EN_PATH] });
  await signIn(page);
  await page.goto(`/app/hoc-tap/bai/${DEMO_LESSONS.enHello.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  const counter = page.locator('main').locator('h2, p[aria-live="polite"]').first();
  for (let i = 0; i < 8; i++) {
    if (/^Câu \d+\/\d+$/.test((await counter.textContent()) ?? '')) break;
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  }
  await expect(page.getByText('Nghe và chọn nghĩa đúng')).toBeVisible();
}

test('a recorded clip downloads on the first press only and plays with replay and slow speed', async ({ page, browserName }) => {
  const requests: string[] = [];
  await openListen(page);
  // Registered after mockSupabase's catch-all route, so it takes precedence for the clip URL.
  await page.route(`${SUPABASE_URL}/storage/v1/object/public/content-audio/**`, async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(3), headers: { 'access-control-allow-origin': '*' } });
  });

  const player = page.getByRole('group', { name: 'Trình phát bản ghi âm' });
  await expect(player).toBeVisible();
  // preload none: nothing is fetched before the learner asks for it.
  expect(requests).toEqual([]);

  const slow = player.getByRole('button', { name: 'Nghe chậm (0,75×)' });
  await slow.click();
  await expect(slow).toHaveAttribute('aria-pressed', 'true');

  await player.getByRole('button', { name: 'Nghe bản ghi âm' }).click();
  await expect.poll(() => requests).toEqual([CLIP_URL]);
  // Playwright's WebKit builds have no audio playback: the download and CSP path above is what they can check.
  if (browserName === 'webkit') return;
  await expect(player.getByRole('button', { name: 'Tạm dừng bản ghi âm' })).toBeVisible();
  expect(requests).toEqual([CLIP_URL]);

  await player.getByRole('button', { name: 'Tạm dừng bản ghi âm' }).click();
  await expect(player.getByRole('button', { name: 'Nghe tiếp bản ghi âm' })).toBeVisible();
  await player.getByRole('button', { name: 'Nghe lại từ đầu' }).click();
  await expect(player.getByRole('button', { name: 'Tạm dừng bản ghi âm' })).toBeVisible();
  // Replays reuse the downloaded clip.
  expect(requests).toHaveLength(1);
  await expect(page.getByText('Đọc thay vì nghe')).toHaveCount(0);

  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations).toEqual([]);
});

test('a missing clip falls back to the transcript and a retry', async ({ page }) => {
  let calls = 0;
  await openListen(page);
  // After mockSupabase's catch-all route, so this one takes precedence for the clip URL.
  await page.route(`${SUPABASE_URL}/storage/v1/object/public/content-audio/**`, async (route) => {
    calls += 1;
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}', headers: { 'access-control-allow-origin': '*' } });
  });

  await page.getByRole('button', { name: 'Nghe bản ghi âm' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Không phát được bản ghi âm' })).toBeVisible();
  await expect(page.getByText('Đọc thay vì nghe')).toBeVisible();
  await expect(page.getByText(listen!.prompt.fallback_text as string, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Không phát được bản ghi âm. Thử lại' }).click();
  await expect.poll(() => calls).toBe(2);

  // The learner can still answer the question.
  await expect(page.getByRole('radiogroup', { name: 'Nghe và chọn nghĩa đúng' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations).toEqual([]);
});
