import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, mockSupabase, pathRow, settleAnimations, signIn } from './fixtures';

// Spec 6.9 (speaking practice). Real microphones are not available in CI, so each test injects stubs for
// navigator.mediaDevices / MediaRecorder / webkitSpeechRecognition before the app boots (page.addInitScript).

// Several tests run axe in both themes; allow for slow shared CI devices.
test.describe.configure({ timeout: 90_000 });

const EN_PATH =pathRow({ id: 'path-en', language_code: 'en', current_level: 'pre_a1', target_level: 'a1' });
const KO_PATH = pathRow({ id: 'path-ko', language_code: 'ko', current_level: 'hangul', target_level: 'topik1' });

interface MediaStubs {
  /** ok: a working microphone; denied / missing: getUserMedia rejects; unsupported: no mediaDevices or MediaRecorder. */
  mic: 'ok' | 'denied' | 'missing' | 'unsupported';
  /** Install a fake SpeechRecognition (both spellings); otherwise any native one is removed. */
  stt?: boolean;
}

async function setup(page: Page, stubs: MediaStubs, path: Record<string, unknown> = EN_PATH) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((o) => {
    const state = { tracksStopped: 0, streamsOpened: 0, recorders: 0, recognition: null as unknown, lang: '' };
    (window as unknown as { __speaking: typeof state }).__speaking = state;
    if (o.mic === 'unsupported') {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
      (window as unknown as { MediaRecorder: unknown }).MediaRecorder = undefined;
    } else {
      const getUserMedia = async () => {
        if (o.mic === 'denied') throw new DOMException('denied', 'NotAllowedError');
        if (o.mic === 'missing') throw new DOMException('none', 'NotFoundError');
        state.streamsOpened += 1;
        return { getTracks: () => [{ stop: () => (state.tracksStopped += 1) }] };
      };
      Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
      class FakeRecorder {
        state = 'inactive';
        mimeType = 'audio/webm';
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() {
          state.recorders += 1;
        }
        start() {
          this.state = 'recording';
        }
        stop() {
          this.state = 'inactive';
          this.ondataavailable?.({ data: new Blob(['stub'], { type: 'audio/webm' }) });
          this.onstop?.();
        }
      }
      (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
    }
    if (o.stt) {
      class FakeRecognition {
        lang = '';
        continuous = false;
        interimResults = false;
        onresult: ((e: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        start() {
          state.recognition = this;
          state.lang = this.lang;
        }
        stop() {
          this.onend?.();
        }
        abort() {}
      }
      // Chromium ships its own: replace both spellings so the stub is the one the app finds.
      (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
    } else {
      (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = undefined;
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = undefined;
    }
  }, stubs);
  const mock = await mockSupabase(page, { paths: [path] });
  await signIn(page);
  return mock;
}

async function openSpeaking(page: Page) {
  await page.goto('/app/luyen-noi');
  await expect(page.getByRole('heading', { level: 1, name: 'Luyện nói' })).toBeVisible();
  // Loading waits for the profile, the paths and the lesson RPCs; allow for slow CI devices.
  await expect(page.getByRole('heading', { level: 2, name: 'Nhắc lại câu' })).toBeVisible({ timeout: 15_000 });
  await settleAnimations(page);
}

const stubState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __speaking: { tracksStopped: number; streamsOpened: number; lang: string } }).__speaking;
    return { tracksStopped: s.tracksStopped, streamsOpened: s.streamsOpened, lang: s.lang };
  });

async function expectNoSeriousAxe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious,
    `${label}: ${JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)}`,
  ).toEqual([]);
}

async function axeBothThemes(page: Page, label: string) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    await settleAnimations(page);
    await expectNoSeriousAxe(page, `${label} (${colorScheme})`);
    await expectNoHorizontalScroll(page);
  }
}

const record = (page: Page) => page.getByRole('button', { name: /^(Bắt đầu ghi âm|Ghi âm lại)$/ });

test('a learner records a sentence, listens back, rates it on separate axes and nothing is uploaded', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`));
  await setup(page, { mic: 'ok' });
  await openSpeaking(page);
  await expect(page.getByText(/Linguo không tải lên hay lưu bản ghi nào/)).toBeVisible();
  await expectNoHorizontalScroll(page);

  await record(page).click();
  await expect(page.getByRole('button', { name: 'Dừng ghi âm' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Đang ghi âm.' })).toBeAttached();
  await page.getByRole('button', { name: 'Dừng ghi âm' }).click();

  await expect(page.getByLabel('Bản ghi giọng của bạn')).toBeVisible();
  expect((await stubState(page)).tracksStopped).toBe(1);
  for (const axis of ['Độ dễ hiểu', 'Âm mục tiêu', 'Nhịp và ngắt nghỉ', 'Độ trôi chảy', 'Hợp nội dung']) {
    await expect(page.getByRole('group', { name: axis })).toBeVisible();
  }
  await page.getByRole('group', { name: 'Độ dễ hiểu' }).getByText('Khá tốt').click();
  await page.getByRole('group', { name: 'Độ trôi chảy' }).getByText('Tạm ổn').click();
  await expectNoHorizontalScroll(page);
  await axeBothThemes(page, 'speaking with a recording');

  await page.getByRole('button', { name: 'Lưu tự đánh giá trên thiết bị này' }).click();
  await expect(page.getByText(/Đã lưu trên thiết bị này/)).toBeVisible();
  await expect(page.getByText('Bạn đã lưu 1 lần tự đánh giá trên thiết bị này.')).toBeVisible();
  const stored = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('linguo-speaking-v1:')));
  expect(stored).toHaveLength(1);
  expect(stored[0]![1]).not.toMatch(/transcript|audio|blob/i);

  // Audio never leaves the page: the only blob: reads are the <audio> element's own in-memory source; there is no
  // storage call and no write other than the (mocked) Supabase RPCs the app always makes.
  expect(requests.filter((r) => r.includes('e2e.invalid/storage/') || (/^(POST|PUT|PATCH) /.test(r) && !r.includes('e2e.invalid/rest/v1/')))).toEqual([]);
});

test('leaving the page releases the microphone', async ({ page }) => {
  await setup(page, { mic: 'ok' });
  await page.goto('/app');
  await page.getByRole('link', { name: 'Luyện nói' }).click();
  await expect(page).toHaveURL(/\/app\/luyen-noi$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Nhắc lại câu' })).toBeVisible({ timeout: 15_000 });
  await record(page).click();
  await expect(page.getByRole('button', { name: 'Dừng ghi âm' })).toBeVisible();
  expect(await stubState(page)).toMatchObject({ streamsOpened: 1, tracksStopped: 0 });

  await page.goBack();
  await expect(page).toHaveURL(/\/app$/);
  await expect.poll(async () => (await stubState(page)).tracksStopped).toBe(1);
});

test('without a microphone API the learner still listens, reads the script and self-rates', async ({ page }) => {
  await setup(page, { mic: 'unsupported' });
  await openSpeaking(page);
  await expect(record(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nghe và tự luyện' })).toBeVisible();
  await expect(page.getByText(/chưa hỗ trợ ghi âm/).first()).toBeVisible();
  await expect(page.locator('main p[lang="en"]').first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'Độ dễ hiểu' })).toBeVisible();
  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  await expect(page.getByRole('heading', { name: 'Nghe và tự luyện' })).toBeVisible();
  await axeBothThemes(page, 'speaking fallback');
});

for (const [mic, message] of [
  ['denied', /chưa được dùng micro/],
  ['missing', /Không tìm thấy micro/],
] as const) {
  test(`a ${mic} microphone explains itself and never blocks practice`, async ({ page }) => {
    await setup(page, { mic });
    await openSpeaking(page);
    await record(page).click();
    await expect(page.getByRole('heading', { name: 'Nghe và tự luyện' })).toBeVisible();
    await expect(page.getByText(message).first()).toBeVisible();
    await expect(page.getByRole('group', { name: 'Độ trôi chảy' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng vai' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Đóng vai' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}

test('the transcript is opt-in, labelled as possibly wrong, and editable', async ({ page }) => {
  await setup(page, { mic: 'ok', stt: true });
  await openSpeaking(page);
  const toggle = page.getByLabel(/Bật bản chép lời tự động/);
  await expect(toggle).not.toBeChecked();
  await toggle.check();

  await record(page).click();
  await expect(page.getByRole('button', { name: 'Dừng ghi âm' })).toBeVisible();
  expect((await stubState(page)).lang).toBe('en-US');
  await page.evaluate(() => {
    const s = (window as unknown as { __speaking: { recognition: { onresult: (e: unknown) => void } } }).__speaking;
    s.recognition.onresult({ results: [Object.assign([{ transcript: 'hello my name' }], { isFinal: true })] });
  });
  await page.getByRole('button', { name: 'Dừng ghi âm' }).click();

  const box = page.getByLabel('Bản chép lời có thể sai');
  await expect(box).toHaveValue('hello my name');
  await box.fill('hello my name is Minh');
  await expect(box).toHaveValue('hello my name is Minh');
  await expect(page.getByTestId('overlap-hint')).toContainText('không phải điểm số');
  await axeBothThemes(page, 'speaking transcript');
});

test('the transcript option is hidden when the browser has no speech recognition', async ({ page }) => {
  await setup(page, { mic: 'ok' });
  await openSpeaking(page);
  await expect(page.getByLabel(/Bật bản chép lời tự động/)).toHaveCount(0);
  await expect(page.getByText('Bản chép lời có thể sai')).toHaveCount(0);
});

test('open answer and scripted role-play work, in Korean too', async ({ page }) => {
  await setup(page, { mic: 'ok' }, KO_PATH);
  await openSpeaking(page);
  await page.getByRole('button', { name: 'Trả lời mở' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Trả lời mở' })).toBeVisible();
  await expect(record(page)).toBeVisible();
  await axeBothThemes(page, 'speaking open answer');

  await page.getByRole('button', { name: 'Đóng vai' }).click();
  await expect(page.getByText('어서 오세요. 뭘 드릴까요?')).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByText('커피 한 잔 주세요.')).toBeVisible();
  await expect(record(page)).toBeVisible();
  await axeBothThemes(page, 'speaking role-play');
});
