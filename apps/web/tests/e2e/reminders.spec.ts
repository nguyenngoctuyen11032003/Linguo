import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { makeNotification, weeklyNotification } from '../../src/features/notifications/notification-fixtures';
import { expectNoHorizontalScroll, mockSupabase, pathRow, settleAnimations, signIn, type NotificationMockOptions } from './fixtures';

// Spec 10 §5: the notification bell and inbox, Settings → "Nhắc học" and the Home "Báo cáo tuần" card.

async function setup(page: Page, notifications: NotificationMockOptions = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [pathRow()], notifications });
  await signIn(page);
  return mock;
}

async function expectNoAxeViolations(page: Page) {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

const bell = (page: Page) => page.getByRole('banner').getByRole('link', { name: /^Thông báo/ });

test('the bell counts unread notifications and the inbox opens one', async ({ page }) => {
  const review = makeNotification({ title_vi: 'Đến giờ ôn tập', action_url: '/app/on-tap' }, { minutesAgo: 5 });
  const lesson = makeNotification({ kind: 'resume_lesson', title_vi: 'Học tiếp bài đang dở', body_vi: 'Còn 3 câu nữa thôi', action_url: '/app/hoc-tap' }, { minutesAgo: 90 });
  const old = makeNotification({ title_vi: 'Lời nhắc hôm qua', read_at: new Date().toISOString() }, { minutesAgo: 60 * 26 });
  const mock = await setup(page, { items: [review, lesson, old] });

  await page.goto('/app');
  await expect(bell(page)).toHaveAccessibleName('Thông báo, 2 thông báo chưa đọc', { timeout: 15_000 });
  await expect(page.getByTestId('notification-badge')).toHaveText('2');
  await expectNoHorizontalScroll(page);

  await bell(page).click();
  await expect(page).toHaveURL(/\/app\/thong-bao$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Thông báo' })).toBeVisible();
  const list = page.getByRole('list', { name: 'Danh sách thông báo' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list.getByRole('button', { name: /Học tiếp bài đang dở/ })).toContainText('Chưa đọc');
  await expect(list.getByRole('button', { name: /Lời nhắc hôm qua/ })).not.toContainText('Chưa đọc');
  await expectNoHorizontalScroll(page);
  await expectNoAxeViolations(page);

  await list.getByRole('button', { name: /Đến giờ ôn tập/ }).click();
  await expect(page).toHaveURL(/\/app\/on-tap$/);
  await expect.poll(() => mock.notifications.marks()).toEqual([{ id: review.id, action: 'clicked' }]);
  await expect(bell(page)).toHaveAccessibleName('Thông báo, 1 thông báo chưa đọc');
});

test('an empty inbox points to the reminder settings', async ({ page }) => {
  await setup(page);
  await page.goto('/app/thong-bao');
  await expect(page.getByText('Chưa có thông báo nào')).toBeVisible({ timeout: 15_000 });
  await expect(bell(page)).toHaveAccessibleName('Thông báo');
  await expect(page.getByTestId('notification-badge')).toHaveCount(0);
  await page.getByRole('link', { name: 'Cài đặt nhắc học' }).click();
  await expect(page).toHaveURL(/\/app\/cai-dat$/);
});

test('Settings → Nhắc học turns reminders on and saves the schedule', async ({ page }) => {
  const mock = await setup(page);
  await page.goto('/app/cai-dat');
  const section = page.getByRole('region', { name: 'Nhắc học' });
  const reminders = section.getByRole('switch', { name: 'Nhắc tôi học' });
  await expect(reminders).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 });
  const save = section.getByRole('button', { name: 'Lưu cài đặt nhắc học' });
  await expect(save).toBeDisabled();

  await reminders.click();
  await expect(reminders).toHaveAttribute('aria-checked', 'true');
  await section.getByLabel('Giờ nhắc').fill('20:15');
  await section.getByRole('button', { name: 'Chủ nhật' }).click();
  await section.getByText('2 lần', { exact: true }).click();
  await section.getByRole('switch', { name: 'Báo cáo tuần' }).click();
  await expectNoHorizontalScroll(page);
  await save.click();

  await expect(page.getByText('Đã lưu cài đặt nhắc học.')).toBeVisible();
  expect(mock.notifications.prefPatches()).toEqual([
    {
      reminders_enabled: true,
      remind_at: '20:15',
      remind_days: [1, 2, 3, 4, 5, 6],
      quiet_start: '22:00',
      quiet_end: '07:00',
      max_per_day: 2,
      weekly_summary: false,
    },
  ]);
  await expect(save).toBeDisabled();

  // Saved prefs survive a reload.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Nhắc học' }).getByRole('switch', { name: 'Nhắc tôi học' })).toHaveAttribute('aria-checked', 'true', {
    timeout: 15_000,
  });
  await expect(page.getByRole('region', { name: 'Nhắc học' }).getByLabel('Giờ nhắc')).toHaveValue('20:15');
  await expectNoAxeViolations(page);
});

test('Home shows the weekly summary until it is marked as seen', async ({ page }) => {
  const weekly = weeklyNotification();
  const mock = await setup(page, { items: [weekly] });
  await page.goto('/app');
  const card = page.getByRole('region', { name: 'Báo cáo tuần' });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText('84 / 105 phút theo kế hoạch');
  await expect(card).toContainText('4 / 7 ngày');
  await expect(card).toContainText('Thêm 1 buổi luyện Nghe');
  await expectNoHorizontalScroll(page);
  await expectNoAxeViolations(page);

  await card.getByRole('button', { name: 'Đã xem' }).click();
  await expect(card).toBeHidden();
  await expect.poll(() => mock.notifications.marks()).toEqual([{ id: weekly.id, action: 'read' }]);
  await expect(bell(page)).toHaveAccessibleName('Thông báo');
});
