import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubMatchMedia } from '../../../tests/unit/match-media';
import { renderWithProviders, TEST_USER_ID } from '../../../tests/unit/render';
import { LESSON_ID, PATH_ID, payload, result, submitArgs } from '@/features/lesson-player/lesson-fixtures';
import { lessonCacheKey, writeLessonCache } from '@/features/lesson-player/lessonCache';
import { createOutbox } from '@/features/lesson-player/outbox';
import { createReviewOutbox } from '@/features/reviews/outbox';
import { gradeArgs, gradeResult } from '@/features/reviews/review-fixtures';
import { SettingsPage } from './SettingsPage';

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  updatePreferences: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
}));

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
vi.mock('@/features/profile/service', () => ({ updateProfile: mocks.updateProfile }));
vi.mock('@/features/preferences/service', () => ({ updatePreferences: mocks.updatePreferences }));
vi.mock('@/features/diagnostic/useDiagnosticStatus', () => ({ useDiagnosticStatus: () => ({ status: 'loading', data: null, reload: () => {} }) }));
// The AI privacy section has its own tests (settings/ai-privacy-section.test.tsx).
vi.mock('@/features/ai-tutor/useAiNotice', () => ({
  useAiNotice: () => ({ status: 'loading', acknowledged: false, ackAt: null, saving: false, error: null, ack: async () => false }),
}));
// The motivation section has its own tests (settings/motivation-section.test.tsx).
vi.mock('@/features/progress/useMotivationPrefs', () => ({
  useMotivationPrefs: () => ({ status: 'loading', prefs: null, update: async () => {}, saving: false, error: null }),
}));
// The "Báo lỗi của tôi" section has its own tests (settings/my-reports-section.test.tsx).
vi.mock('@/features/content-reports/useMyReports', () => ({
  useMyReports: () => ({ status: 'loading', reports: [], error: null, reload: () => {} }),
}));
// The "Nhắc học" section has its own tests (settings/RemindersSection.test.tsx).
vi.mock('@/features/notifications/useNotificationPrefs', () => ({
  useNotificationPrefs: () => ({ status: 'loading', prefs: null, update: async () => false, resetBackoff: async () => false, reload: () => {}, saving: false, error: null }),
}));
vi.mock('@/features/notifications/usePushNotifications', () => ({
  usePushNotifications: () => ({ state: null, support: 'supported', busy: false, error: null, enable: async () => {}, disable: async () => {} }),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signOut: mocks.signOut }, rpc: mocks.rpc }),
  requireSupabase: () => ({ auth: { signOut: mocks.signOut }, rpc: mocks.rpc }),
}));

beforeEach(() => {
  mocks.updateProfile.mockReset().mockResolvedValue(undefined);
  mocks.updatePreferences.mockReset().mockResolvedValue(undefined);
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
  // Offline by default: queued lesson answers stay in the outbox.
  mocks.rpc.mockReset().mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 });
});

/** One lesson answer waiting in the offline outbox of the test user. */
function queueAnswer() {
  createOutbox(TEST_USER_ID).add({ args: submitArgs(), queueIndex: 0 });
}

/** One review grade waiting in the offline review outbox of the test user. */
function queueGrade() {
  createReviewOutbox(TEST_USER_ID).add({ args: gradeArgs(1), queueIndex: 0 });
}

describe('SettingsPage', () => {
  it('pre-fills the profile and saves a trimmed display name', async () => {
    const setProfile = vi.fn();
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat', profile: { setProfile } });
    const name = screen.getByLabelText('Tên hiển thị');
    expect(name).toHaveValue('Minh Anh');
    await userEvent.clear(name);
    await userEvent.type(name, '  An  ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith(expect.anything(), TEST_USER_ID, { displayName: 'An', timezone: 'Asia/Ho_Chi_Minh' }),
    );
    expect(setProfile).toHaveBeenCalledWith({ id: TEST_USER_ID, displayName: 'An', timezone: 'Asia/Ho_Chi_Minh' });
    expect(await screen.findByText('Đã lưu hồ sơ.')).toBeInTheDocument();
  });

  it('lists the learner content reports in their own section', () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    expect(screen.getByRole('heading', { level: 2, name: 'Báo lỗi của tôi' })).toBeInTheDocument();
  });

  it('shows the Nhắc học section', () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    expect(screen.getByRole('heading', { level: 2, name: 'Nhắc học' })).toBeInTheDocument();
  });

  it('rejects names longer than 60 characters', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    const name = screen.getByLabelText('Tên hiển thị');
    await userEvent.clear(name);
    await userEvent.click(name);
    await userEvent.paste('a'.repeat(61));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    expect(screen.getByText('Tên hiển thị tối đa 60 ký tự.')).toBeInTheDocument();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('applies the theme immediately and persists it', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await waitFor(() =>
      expect(mocks.updatePreferences).toHaveBeenCalledWith(expect.anything(), TEST_USER_ID, { theme: 'dark', reduceMotion: false }),
    );
  });

  it('toggles reduced motion', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    const toggle = screen.getByRole('switch', { name: 'Giảm chuyển động' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
  });

  it('signs out and returns to the landing page', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it('warns before signing out while lesson answers wait to sync', async () => {
    queueAnswer();
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Còn 1 câu trả lời chưa đồng bộ lên máy chủ.');
    expect(mocks.signOut).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Vẫn đăng xuất' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("clears the user's offline lesson cache on sign-out but keeps the queued answers", async () => {
    const OTHER_USER = '99999999-9999-4999-8999-999999999999';
    const mine = lessonCacheKey(TEST_USER_ID, PATH_ID, LESSON_ID);
    const theirs = lessonCacheKey(OTHER_USER, PATH_ID, LESSON_ID);
    writeLessonCache(TEST_USER_ID, mine, payload());
    writeLessonCache(OTHER_USER, theirs, payload());
    queueAnswer();
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Vẫn đăng xuất' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(localStorage.getItem(mine)).toBeNull();
    expect(localStorage.getItem(theirs)).not.toBeNull();
    expect(createOutbox(TEST_USER_ID).list()).toHaveLength(1);
  });

  it('keeps the offline lesson cache when signing out fails', async () => {
    const key = lessonCacheKey(TEST_USER_ID, PATH_ID, LESSON_ID);
    writeLessonCache(TEST_USER_ID, key, payload());
    mocks.signOut.mockResolvedValue({ error: { status: 0 } });
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByText('Không đăng xuất được. Vui lòng thử lại.')).toBeInTheDocument();
    expect(localStorage.getItem(key)).not.toBeNull();
  });

  it('can sync the waiting answers from the warning, then signs out without asking again', async () => {
    queueAnswer();
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await screen.findByRole('alert');
    mocks.rpc.mockResolvedValue({ data: result(), error: null });
    await userEvent.click(screen.getByRole('button', { name: 'Đồng bộ ngay' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(createOutbox(TEST_USER_ID).list()).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
  });

  it('counts review grades waiting to sync in the sign-out warning', async () => {
    queueGrade();
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Còn 1 lượt chấm thẻ ôn tập chưa đồng bộ lên máy chủ.');
    expect(mocks.signOut).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Vẫn đăng xuất' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(createReviewOutbox(TEST_USER_ID).list()).toHaveLength(1);
  });

  it('syncs both lesson answers and review grades from the warning', async () => {
    queueAnswer();
    queueGrade();
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Còn 1 câu trả lời và 1 lượt chấm thẻ ôn tập chưa đồng bộ lên máy chủ.',
    );
    mocks.rpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === 'grade_review' ? gradeResult(1) : result(), error: null }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Đồng bộ ngay' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(createOutbox(TEST_USER_ID).list()).toEqual([]);
    expect(createReviewOutbox(TEST_USER_ID).list()).toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith('grade_review', expect.anything());
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
  });

  it('falls back to a local sign-out when the server call fails, then leaves', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: { status: 0 } }).mockResolvedValueOnce({ error: null });
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(mocks.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(screen.getByText('Không đăng xuất được trên máy chủ, đã xoá phiên trên thiết bị này.')).toBeInTheDocument();
  });

  it('stays on the page when even the local sign-out fails', async () => {
    mocks.signOut.mockResolvedValue({ error: { status: 0 } });
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByText('Không đăng xuất được. Vui lòng thử lại.')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/cai-dat');
  });

  it('explains the 24-hour cooldown when the timezone was changed too recently', async () => {
    mocks.updateProfile.mockRejectedValue({ message: 'timezone_change_cooldown', details: '2026-10-14T05:30:00Z', code: 'P0001' });
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    expect(await screen.findByText(/Múi giờ chỉ được đổi một lần mỗi 24 giờ\. Bạn có thể đổi lại sau .*14\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByText('Đã lưu hồ sơ.')).not.toBeInTheDocument();
  });

  it('shows an error, not "saved", when the profile update touched no rows', async () => {
    mocks.updateProfile.mockRejectedValue(new Error('NO_ROWS_UPDATED'));
    const setProfile = vi.fn();
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat', profile: { setProfile } });
    const name = screen.getByLabelText('Tên hiển thị');
    await userEvent.clear(name);
    await userEvent.type(name, 'An');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    expect(await screen.findByText('Chưa lưu được hồ sơ. Kiểm tra mạng rồi thử lại.')).toBeInTheDocument();
    expect(screen.queryByText('Đã lưu hồ sơ.')).not.toBeInTheDocument();
    expect(setProfile).not.toHaveBeenCalled();
    expect(name).toHaveValue('An');
  });

  it('does not save without a signed-in user', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat', auth: { status: 'signed-out', session: null, user: null } });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('serialises preference writes, latest wins, and ignores errors from superseded writes', async () => {
    const first = deferred();
    mocks.updatePreferences.mockReset().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    await waitFor(() => expect(mocks.updatePreferences).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('radio', { name: 'Sáng' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Giảm chuyển động' }));
    // The newer writes wait for the in-flight one instead of racing it.
    expect(mocks.updatePreferences).toHaveBeenCalledTimes(1);
    first.reject(new Error('stale failure'));
    await waitFor(() => expect(mocks.updatePreferences).toHaveBeenCalledTimes(2));
    expect(mocks.updatePreferences).toHaveBeenLastCalledWith(expect.anything(), TEST_USER_ID, { theme: 'light', reduceMotion: true });
    expect(screen.queryByText(/Chưa đồng bộ được tuỳ chọn/)).not.toBeInTheDocument();
  });

  it('reports a failed latest preference write', async () => {
    mocks.updatePreferences.mockRejectedValue(new Error('NO_ROWS_UPDATED'));
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(await screen.findByText(/Chưa đồng bộ được tuỳ chọn/)).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('exposes the theme as a native radio group that follows arrow keys', async () => {
    localStorage.setItem('linguo-theme', 'light');
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    expect(screen.getByRole('group', { name: 'Chủ đề màu' })).toBeInTheDocument();
    const light = screen.getByRole('radio', { name: 'Sáng' });
    expect(light).toBeChecked();
    expect(light).toHaveAttribute('type', 'radio');
    await userEvent.click(light);
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Tối' })).toBeChecked();
  });

  it('explains when the operating system forces reduced motion', () => {
    stubMatchMedia((q) => q.includes('prefers-reduced-motion'));
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    expect(screen.getByText('Hệ điều hành đang bật giảm chuyển động.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Giảm chuyển động' })).toHaveAttribute('aria-checked', 'false');
  });
});
