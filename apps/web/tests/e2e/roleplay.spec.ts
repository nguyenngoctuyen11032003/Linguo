import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, mockSupabase, pathRow, PROGRESS_PATH_ID, settleAnimations, signIn, type AiMockOptions } from './fixtures';

// Spec 8.2 #6: AI role-play at /app/dong-vai with functions/v1/ai-tutor mocked deterministically (task roleplay_turn).

const EN_PATH = pathRow({ id: PROGRESS_PATH_ID, language_code: 'en', current_level: 'a2', target_level: 'b1' });
const ACKED = '2026-10-01T03:00:00Z';

async function setup(page: Page, ai: AiMockOptions = { ackAt: ACKED }) {
  if (test.info().timeout < 60_000) test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [EN_PATH], ai, progress: {} });
  await signIn(page);
  return mock;
}

async function expectNoSeriousAxe(page: Page, label: string) {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, `${label}: ${JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)}`).toEqual([]);
}

async function openPicker(page: Page) {
  await page.goto('/app/dong-vai');
  await expect(page.getByRole('heading', { level: 1, name: 'Đóng vai với AI' })).toBeVisible({ timeout: 15_000 });
}

async function startCafe(page: Page) {
  await openPicker(page);
  await page.getByRole('button', { name: 'Bắt đầu: Gọi đồ ở quán cà phê' }).click();
  await expect(page.getByText('Hi! Welcome to Sunny Café. What can I get you today?')).toBeVisible();
}

async function say(page: Page, text: string) {
  await page.getByLabel(/Tin nhắn của bạn/).fill(text);
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
}

test('picks a scenario, chats, sees a correction and goal progress, then finishes into the recap', async ({ page }) => {
  const mock = await setup(page);
  await openPicker(page);
  // Cards are grouped by what suits the level and show their goals.
  const fit = page.getByRole('region', { name: 'Hợp trình độ của bạn' });
  await expect(fit.getByRole('heading', { name: 'Gọi đồ ở quán cà phê' })).toBeVisible();
  await expect(fit.getByText('Chọn cỡ ly hoặc món kèm').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoSeriousAxe(page, 'role-play picker');

  await page.getByRole('button', { name: 'Bắt đầu: Gọi đồ ở quán cà phê' }).click();
  const log = page.getByRole('log', { name: 'Cuộc trò chuyện' });
  await expect(log.getByText('Hi! Welcome to Sunny Café. What can I get you today?')).toBeVisible();
  await expect(log.getByText('Hi! Welcome to Sunny Café. What can I get you today?')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Lượt 1/12')).toBeVisible();
  await expect(page.getByText('Hãy gọi một đồ uống.')).toBeVisible();
  // The input is ready after the reply.
  await expect(page.getByLabel(/Tin nhắn của bạn/)).toBeFocused();
  expect(mock.ai.requests()[0]).toMatchObject({ task: 'roleplay_turn', scenario_key: 'cafe_order', turn_index: 0, learner_message: '' });

  await say(page, 'I want a large latte');
  await expect(log.getByText('Sure! That is turn 1. Anything else?')).toBeVisible();
  const fix = page.getByRole('region', { name: 'Gợi ý sửa câu' });
  await expect(fix).toContainText('I would like');
  await expect(fix).toContainText('Nói "I would like" nghe lịch sự hơn khi gọi đồ.');
  const goals = page.getByRole('list', { name: 'Mục tiêu của tình huống' });
  await expect(goals).toContainText('Gọi một đồ uống (đã đạt)');
  await expect(goals).toContainText('Chọn cỡ ly hoặc món kèm (đã đạt)');
  await expect(goals).toContainText('Hỏi giá và thanh toán (chưa đạt)');
  await expect(page.getByText('Lượt 2/12')).toBeVisible();
  expect(mock.ai.requests()[1]).toMatchObject({ turn_index: 1, learner_message: 'I want a large latte', history: [{ role: 'partner' }] });
  await expectNoHorizontalScroll(page);
  await expectNoSeriousAxe(page, 'role-play chat');

  await say(page, 'How much is it? I pay by card.');
  await expect(log.getByText('That is four dollars. Enjoy your drink!')).toBeVisible();
  await expect(page.getByText('Buổi trò chuyện đã xong, bạn làm tốt lắm!')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gửi', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Kết thúc và xem tóm tắt' }).click();
  await expect(page.getByRole('heading', { name: 'Tóm tắt buổi đóng vai' })).toBeFocused();
  await expect(page.getByText('Hôm nay bạn đã học đều tay, làm tốt lắm!')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Những chỗ nên sửa' })).toContainText('I would like');
  const summary = mock.ai.requests().find((r) => r.task === 'summarize_session')!;
  expect(summary).toMatchObject({ activities: [{ kind: 'practice', status: 'done' }], accuracy_by_stage: [{ stage: 'application', attempts: 2, correct: 1 }] });
  // Only numbers go to the summary: none of the conversation.
  expect(JSON.stringify(summary)).not.toMatch(/latte|card|Welcome/);
  await expectNoHorizontalScroll(page);
  await expectNoSeriousAxe(page, 'role-play recap');

  await page.getByRole('button', { name: 'Luyện tình huống khác' }).click();
  await expect(page.getByRole('region', { name: 'Hợp trình độ của bạn' })).toBeVisible();
});

test('the conversation survives a reload in the same tab', async ({ page }) => {
  await setup(page);
  await startCafe(page);
  await say(page, 'A coffee please');
  await expect(page.getByText('Lượt 2/12')).toBeVisible();
  await page.reload();
  await expect(page.getByText('A coffee please')).toBeVisible();
  await expect(page.getByText('Lượt 2/12')).toBeVisible();
});

test('quota used up: sending is switched off with the friendly note, the rest of the app keeps working', async ({ page }) => {
  await setup(page, { ackAt: ACKED, used: 19, limit: 20 });
  await startCafe(page);
  const send = page.getByRole('button', { name: 'Gửi', exact: true });
  await expect(send).toBeDisabled();
  await expect(page.getByText(/Bài học và ôn tập vẫn dùng bình thường/)).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('Gemini down: the opening turn shows the fallback notice and retry brings the partner back', async ({ page }) => {
  const mock = await setup(page, { ackAt: ACKED, mode: 'ai_unavailable' });
  await openPicker(page);
  await page.getByRole('button', { name: 'Bắt đầu: Gọi đồ ở quán cà phê' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Tạm thời không khả dụng' })).toBeVisible();
  await expect(page.getByText(/Bài học, đáp án và lịch ôn vẫn hoạt động bình thường/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  mock.ai.setMode('ok');
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByText('Hi! Welcome to Sunny Café. What can I get you today?')).toBeVisible();
});

test('a failed turn is retried without duplicating the learner message', async ({ page }) => {
  const mock = await setup(page);
  await startCafe(page);
  mock.ai.setMode('ai_unavailable');
  await say(page, 'A coffee please');
  await expect(page.getByRole('alert').filter({ hasText: 'Tạm thời không khả dụng' })).toBeVisible();
  await expect(page.getByText('Chưa gửi được tin nhắn này.')).toBeVisible();
  mock.ai.setMode('ok');
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByText('Sure! That is turn 1. Anything else?')).toBeVisible();
  await expect(page.getByText('A coffee please')).toHaveCount(1);
});

test('AI text is rendered as text and the page is accessible in light and dark at the narrowest width', async ({ page }) => {
  await setup(page, { ackAt: ACKED, mode: 'html' });
  await page.setViewportSize({ width: 320, height: 700 });
  await openPicker(page);
  await page.getByRole('button', { name: 'Bắt đầu: Gọi đồ ở quán cà phê' }).click();
  await expect(page.getByText('Lượt 1/12')).toBeVisible();
  await say(page, 'A coffee please');
  await expect(page.getByText('Lượt 2/12')).toBeVisible();
  await expect(page.locator('#ai-injected')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __aiXss?: number }).__aiXss)).toBeUndefined();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxe(page, `role-play chat ${scheme} 320px`);
  }
});

test('at 320x640 the whole composer sits above the bottom nav after every partner reply', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await startCafe(page);
  const input = page.getByLabel(/Tin nhắn của bạn/);
  const send = page.getByRole('button', { name: 'Gửi', exact: true });
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  // Input and "Gửi" fully on screen and above the fixed nav (the scroll may still be settling, hence the poll).
  const clearOfNav = async () => {
    const navTop = (await nav.boundingBox())!.y;
    const boxes = [await input.boundingBox(), await send.boundingBox()];
    return boxes.every((box) => box !== null && box.y >= 0 && box.y + box.height <= navTop);
  };
  await expect(input).toBeFocused();
  await expect.poll(clearOfNav).toBe(true);
  for (const [turn, text] of [
    [2, 'I want a large latte'],
    [3, 'A coffee please'],
  ] as const) {
    await say(page, text);
    await expect(page.getByText(`Lượt ${turn}/12`)).toBeVisible();
    await expect(input).toBeFocused();
    await expect.poll(clearOfNav).toBe(true);
  }
});

test('leaving a chat with messages asks first; staying keeps the conversation', async ({ page }) => {
  await setup(page);
  await startCafe(page);
  await say(page, 'A coffee please');
  await expect(page.getByText('Lượt 2/12')).toBeVisible();
  await page.getByRole('button', { name: 'Chọn tình huống khác' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Bỏ cuộc trò chuyện này?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Ở lại trò chuyện' })).toBeFocused();
  await expectNoSeriousAxe(page, 'role-play leave confirm');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('A coffee please')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chọn tình huống khác' })).toBeFocused();

  await page.getByRole('button', { name: 'Chọn tình huống khác' }).click();
  await dialog.getByRole('button', { name: 'Bỏ cuộc trò chuyện' }).click();
  await expect(page.getByRole('region', { name: 'Hợp trình độ của bạn' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Hợp trình độ của bạn' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('A coffee please')).toHaveCount(0);
});

test('quota used up before starting: every "Bắt đầu" is off with the reset hint', async ({ page }) => {
  await setup(page, { ackAt: ACKED, used: 20, limit: 20 });
  await openPicker(page);
  const starts = page.getByRole('button', { name: /^Bắt đầu: / });
  await expect(starts.first()).toBeDisabled();
  const count = await starts.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 0; i < count; i++) {
    await expect(starts.nth(i)).toBeDisabled();
    await expect(starts.nth(i)).toHaveAccessibleDescription(/Bài học và ôn tập vẫn dùng bình thường/);
  }
  await expectNoHorizontalScroll(page);
  await expectNoSeriousAxe(page, 'role-play picker quota used up');
});

test('focus moves to the scenario title on start, the page title on leave and the recap title on finish', async ({ page }) => {
  const mock = await setup(page);
  await openPicker(page);
  // Hold the opening turn so the focus right after starting can be checked before the reply moves it to the input.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/functions/v1/ai-tutor', async (route) => {
    await held;
    await route.fallback();
  });
  await page.getByRole('button', { name: 'Bắt đầu: Gọi đồ ở quán cà phê' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Gọi đồ ở quán cà phê' })).toBeFocused();
  release();
  await expect(page.getByLabel(/Tin nhắn của bạn/)).toBeFocused();

  await page.getByRole('button', { name: 'Chọn tình huống khác' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Đóng vai với AI' })).toBeFocused();

  await page.getByRole('button', { name: 'Bắt đầu: Gọi đồ ở quán cà phê' }).click();
  await expect(page.getByLabel(/Tin nhắn của bạn/)).toBeFocused();
  await say(page, 'A coffee please');
  await expect(page.getByText('Lượt 2/12')).toBeVisible();
  await page.getByRole('button', { name: 'Kết thúc và xem tóm tắt' }).click();
  await expect(page.getByRole('heading', { name: 'Tóm tắt buổi đóng vai' })).toBeFocused();
  await page.getByRole('button', { name: 'Luyện tình huống khác' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Đóng vai với AI' })).toBeFocused();
  expect(mock.ai.requests().length).toBeGreaterThan(0);
});

test('the AI notice talks about the partner and keeps its answer in view at 320x640', async ({ page }) => {
  await setup(page, { ackAt: null });
  await page.setViewportSize({ width: 320, height: 640 });
  await openPicker(page);
  await page.getByRole('button', { name: 'Bắt đầu: Gọi đồ ở quán cà phê' }).click();
  const dialog = page.getByRole('alertdialog', { name: /Trước khi trò chuyện với Đối tác AI/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Tin nhắn của bạn được gửi tới Google Gemini');
  await expect(dialog.getByText('Trước khi trò chuyện với Đối tác AI')).toBeFocused();
  await settleAnimations(page);
  await expect(dialog.getByRole('button', { name: 'Tôi đã hiểu, tiếp tục' })).toBeInViewport({ ratio: 1 });
  await expectNoSeriousAxe(page, 'role-play AI notice');
  await dialog.getByRole('button', { name: 'Tôi đã hiểu, tiếp tục' }).click();
  await expect(page.getByText('Hi! Welcome to Sunny Café. What can I get you today?')).toBeVisible();
});

test('the entry links from the tutor and speaking pages lead to the role-play screen', async ({ page }) => {
  await setup(page);
  await page.goto('/app/gia-su');
  await page.getByRole('link', { name: 'Đóng vai hội thoại với AI' }).click();
  await expect(page).toHaveURL(/\/app\/dong-vai$/);
  await page.goto('/app/luyen-noi');
  await page.getByRole('link', { name: 'Luyện hội thoại với đối tác AI' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Đóng vai với AI' })).toBeVisible();
});
