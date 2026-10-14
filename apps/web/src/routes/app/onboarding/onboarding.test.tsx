import { StrictMode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDaysIso, DEFAULT_TIMEZONE, type OnboardingDraftData } from '@linguo/shared';
import { todayIso } from '@/lib/dates';
import { REFERENCE, TEST_KO_PATH, TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { OnboardingPage } from './OnboardingPage';

const mocks = vi.hoisted(() => ({ createPath: vi.fn(), track: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/analytics', () => ({ track: mocks.track }));
vi.mock('@/features/learning-paths/useReferenceHours', () => ({
  useReferenceHours: () => ({ status: 'ready', data: REFERENCE, retry: vi.fn() }),
}));
vi.mock('@/features/learning-paths/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/learning-paths/service')>()),
  createPath: mocks.createPath,
}));

const page = (paths: Parameters<typeof renderWithProviders>[1] = {}) =>
  renderWithProviders(
    <Routes>
      <Route path="/app/bat-dau" element={<OnboardingPage />} />
      <Route path="*" element={null} />
    </Routes>,
    { route: '/app/bat-dau', paths: { paths: [] }, ...paths },
  );

const today = todayIso(DEFAULT_TIMEZONE);
const FULL: OnboardingDraftData = { language: 'en', startPoint: 'some', currentLevel: 'a2', goalType: 'daily_communication', targetLevel: 'b1' };
const seed = (step: number, data: OnboardingDraftData) => localStorage.setItem('linguo-onboarding-draft', JSON.stringify({ version: 1, step, data }));
const heading = (name: string) => screen.getByRole('heading', { level: 1, name });
const location = () => screen.getByTestId('location');
const routes = (
  <Routes>
    <Route path="/app/bat-dau" element={<OnboardingPage />} />
  </Routes>
);
const next = () => userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

beforeEach(() => {
  mocks.createPath.mockReset();
  mocks.track.mockReset();
});

describe('OnboardingPage', () => {
  it('walks all steps and creates the path', async () => {
    const upsertPath = vi.fn();
    page({ paths: { paths: [], upsertPath } });
    expect(screen.getByRole('heading', { level: 1, name: 'Bạn muốn học ngôn ngữ nào?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi đã học một ít' }));
    await next();
    expect(screen.getByRole('heading', { level: 1, name: 'Trình độ hiện tại của bạn' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /^A2/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Giao tiếp đời sống' }));
    expect(screen.getByRole('radio', { name: /^B1/ })).toBeChecked();
    await next();
    expect(screen.getByRole('radio', { name: '30 phút mỗi ngày' })).toBeChecked();
    await next();
    expect(screen.getByRole('heading', { level: 1, name: 'Xem lại lộ trình' })).toBeInTheDocument();
    expect(screen.getByText('Khoảng 43–69 tuần')).toBeInTheDocument();

    mocks.createPath.mockResolvedValue(TEST_PATH);
    await userEvent.click(screen.getByRole('button', { name: 'Tạo lộ trình' }));
    expect(mocks.createPath).toHaveBeenCalledWith(
      {},
      {
        language: 'en',
        startPoint: 'some',
        goalType: 'daily_communication',
        currentLevel: 'a2',
        targetLevel: 'b1',
        weeklyMinutes: [30, 30, 30, 30, 30, 30, 30],
        targetDate: null,
      },
    );
    expect(upsertPath).toHaveBeenCalledWith(TEST_PATH, { makeCurrent: true });
    expect(await screen.findByRole('heading', { name: 'Lộ trình đã sẵn sàng!' })).toBeInTheDocument();
    expect(localStorage.getItem('linguo-onboarding-draft')).toBeNull();
    expect(mocks.track).toHaveBeenCalledWith('onboarding_completed', {
      language: TEST_PATH.language,
      start_point: TEST_PATH.startPoint,
      goal_type: TEST_PATH.goalType,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Vào trang chủ' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/);
  });

  it('skips the level step for complete beginners', async () => {
    page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi mới hoàn toàn' }));
    await next();
    expect(screen.getByRole('heading', { level: 1, name: 'Mục tiêu của bạn' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ tạo lộ trình' })).toHaveAttribute('aria-valuetext', 'Bước 3 trên 5');
  });

  it('restores the draft after a reload and discards a corrupt one', async () => {
    const first = page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    first.unmount();
    const second = page();
    expect(screen.getByRole('heading', { level: 1, name: 'Bạn đang ở đâu?' })).toBeInTheDocument();
    second.unmount();

    localStorage.setItem('linguo-onboarding-draft', '{not json');
    const again = page();
    expect(screen.getByRole('heading', { level: 1, name: 'Bạn muốn học ngôn ngữ nào?' })).toBeInTheDocument();
    expect(await screen.findByText(/Bản nháp cũ không dùng được nữa/)).toBeInTheDocument();
    again.unmount();
  });

  it('locks languages that already have a path and preselects ?lang', () => {
    renderWithProviders(
      <Routes>
        <Route path="/app/bat-dau" element={<OnboardingPage />} />
      </Routes>,
      { route: '/app/bat-dau?lang=en', paths: { paths: [TEST_PATH] } },
    );
    const en = screen.getByRole('radio', { name: /Tiếng Anh/ });
    expect(en).toBeDisabled();
    expect(screen.getByText('Đã có lộ trình')).toBeInTheDocument();
  });

  it('keeps the draft and shows a Vietnamese error when creation fails', async () => {
    page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi đã học một ít' }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: /^A2/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Giao tiếp đời sống' }));
    await next();
    await next();
    mocks.createPath.mockRejectedValue({ code: 'P0001', message: 'path_exists_for_language' });
    await userEvent.click(screen.getByRole('button', { name: 'Tạo lộ trình' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã có lộ trình cho ngôn ngữ này.');
    expect(localStorage.getItem('linguo-onboarding-draft')).not.toBeNull();
  });

  it('offers to raise daily minutes when the deadline is too close', async () => {
    page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi đã học một ít' }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: /^A2/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Giao tiếp đời sống' }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Trong số tuần' }));
    await userEvent.type(screen.getByLabelText('Số tuần'), '4');
    await next();
    expect(screen.getByText('Cần tăng thời lượng')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dùng 397 phút/ngày' }));
    await waitFor(() => expect(screen.getByText('Thời hạn khá căng')).toBeInTheDocument());
  });

  it('preselects an available ?lang on a fresh step 2 and ignores it when taken', () => {
    seed(4, FULL);
    const first = renderWithProviders(routes, { route: '/app/bat-dau?lang=ko', paths: { paths: [] } });
    expect(heading('Bạn đang ở đâu?')).toBeInTheDocument();
    expect(location()).toHaveTextContent('lang=ko');
    expect(location()).toHaveTextContent('buoc=2');
    expect(JSON.parse(localStorage.getItem('linguo-onboarding-draft') ?? '{}').data).toEqual({ language: 'ko' });
    first.unmount();

    seed(4, FULL);
    renderWithProviders(routes, { route: '/app/bat-dau?lang=ko', paths: { paths: [TEST_KO_PATH] } });
    expect(heading('Mục tiêu của bạn')).toBeInTheDocument();
  });

  it('resets downstream answers when the language changes', async () => {
    page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi đã học một ít' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Hàn/ }));
    await next();
    expect(screen.getByRole('radio', { name: 'Tôi đã học một ít' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled();
  });

  it('skips the level step when the start point changes from some to new', async () => {
    page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi đã học một ít' }));
    await next();
    expect(heading('Trình độ hiện tại của bạn')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi mới hoàn toàn' }));
    await next();
    expect(heading('Mục tiêu của bạn')).toBeInTheDocument();
  });

  it('keeps a sensible target level when the current level changes', async () => {
    seed(3, FULL);
    page();
    await userEvent.click(screen.getByRole('radio', { name: /^B1/ }));
    await next();
    expect(screen.getByRole('radio', { name: 'Giao tiếp đời sống' })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^B2/ })).toBeChecked();
  });

  it('lands on the right step when a restored draft is no longer valid', () => {
    seed(6, { ...FULL, deadlineMode: 'date', targetDate: addDaysIso(today, 4000) });
    const tooFar = page();
    expect(heading('Bạn học được bao lâu?')).toBeInTheDocument();
    expect(screen.getByText('Ngày mục tiêu quá xa (tối đa 10 năm).')).toBeInTheDocument();
    tooFar.unmount();

    seed(6, FULL);
    const ok = page();
    expect(heading('Xem lại lộ trình')).toBeInTheDocument();
    ok.unmount();

    seed(5, FULL);
    renderWithProviders(routes, { route: '/app/bat-dau', paths: { paths: [TEST_PATH] } });
    expect(heading('Bạn muốn học ngôn ngữ nào?')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Tiếng Anh/ })).not.toBeChecked();
  });

  it('rejects a deadline of 120 months', async () => {
    seed(5, FULL);
    page();
    await userEvent.click(screen.getByRole('radio', { name: 'Trong số tháng' }));
    expect(screen.getByText('Nhập số tháng')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Số tháng'), '120');
    expect(screen.getByText('Ngày mục tiêu quá xa (tối đa 10 năm).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled();
  });

  it('explains an all-zero custom schedule', () => {
    seed(5, { ...FULL, schedulePreset: 'custom', weeklyMinutes: [0, 0, 0, 0, 0, 0, 0] });
    page();
    expect(screen.getByText('Hãy chọn ít nhất một ngày học.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled();
  });

  it('goes back one step with the back button and mirrors the step in the URL', async () => {
    page();
    expect(location()).toHaveTextContent('buoc=1');
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    expect(heading('Bạn đang ở đâu?')).toBeInTheDocument();
    expect(location()).toHaveTextContent('buoc=2');
    await userEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(heading('Bạn muốn học ngôn ngữ nào?')).toBeInTheDocument();
    expect(location()).toHaveTextContent('buoc=1');
  });

  it('follows the buoc param on history navigation (hardware back)', async () => {
    function HistoryBack() {
      const navigate = useNavigate();
      return <button onClick={() => void navigate(-1)}>history back</button>;
    }
    renderWithProviders(
      <>
        {routes}
        <HistoryBack />
      </>,
      { route: '/app/bat-dau', paths: { paths: [] } },
    );
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    expect(heading('Bạn đang ở đâu?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'history back' }));
    expect(heading('Bạn muốn học ngôn ngữ nào?')).toBeInTheDocument();
    expect(location()).toHaveTextContent('buoc=1');
  });

  it('hides the back button on step 1 when there is no path to return to', () => {
    page();
    expect(screen.queryByRole('button', { name: 'Quay lại' })).not.toBeInTheDocument();
  });

  it('tells the user when every language already has a path', () => {
    renderWithProviders(routes, { route: '/app/bat-dau', paths: { paths: [TEST_PATH, TEST_KO_PATH] } });
    expect(screen.getByText('Bạn đã có lộ trình cho cả hai ngôn ngữ.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tiếp tục' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/app');
  });

  it('shows the corrupt-draft toast exactly once under StrictMode', async () => {
    localStorage.setItem('linguo-onboarding-draft', '{not json');
    renderWithProviders(<StrictMode>{routes}</StrictMode>, { route: '/app/bat-dau', paths: { paths: [] } });
    expect(await screen.findAllByText(/Bản nháp cũ không dùng được nữa/)).toHaveLength(1);
  });

  it('reloads paths and offers a way home when the language already has a path', async () => {
    const reload = vi.fn();
    seed(6, FULL);
    page({ paths: { paths: [], reload } });
    mocks.createPath.mockRejectedValue({ code: 'P0001', message: 'path_exists_for_language' });
    await userEvent.click(screen.getByRole('button', { name: 'Tạo lộ trình' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã có lộ trình cho ngôn ngữ này.');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/app');
  });

  it('applies the suggested date from the review step', async () => {
    seed(6, { ...FULL, deadlineMode: 'weeks', deadlineAmount: 20 });
    page();
    await userEvent.click(await screen.findByRole('button', { name: /^Dời ngày mục tiêu sang/ }));
    await userEvent.click(screen.getByRole('button', { name: /Sửa thời hạn/ }));
    expect(heading('Bạn học được bao lâu?')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Chọn ngày mục tiêu' })).toBeChecked();
    expect((screen.getByLabelText('Ngày mục tiêu') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('does not offer a suggested date beyond the 10-year limit', async () => {
    seed(6, {
      language: 'ko',
      startPoint: 'new',
      currentLevel: 'hangul',
      goalType: 'topik_ii',
      targetLevel: 'topik6',
      schedulePreset: 'custom',
      weeklyMinutes: [15, 15, 15, 15, 15, 15, 15],
      deadlineMode: 'weeks',
      deadlineAmount: 4,
    });
    page();
    expect(await screen.findByRole('button', { name: /^Dùng \d+ phút\/ngày/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Dời ngày mục tiêu sang/ })).not.toBeInTheDocument();
  });

  it('calls the RPC once on a double click', async () => {
    seed(6, FULL);
    page();
    let resolve: (p: typeof TEST_PATH) => void = () => undefined;
    mocks.createPath.mockReturnValue(new Promise((r) => (resolve = r)));
    await userEvent.dblClick(screen.getByRole('button', { name: 'Tạo lộ trình' }));
    expect(mocks.createPath).toHaveBeenCalledTimes(1);
    resolve(TEST_PATH);
    expect(await screen.findByRole('heading', { name: 'Lộ trình đã sẵn sàng!' })).toBeInTheDocument();
  });

  describe('placement test offers (spec 4)', () => {
    it('explains the test on the "unsure" start point', async () => {
      page();
      await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
      await next();
      expect(screen.getByRole('radio', { name: /Tôi chưa chắc trình độ của mình/ })).toHaveAccessibleName(/bài kiểm tra \(~12 phút\)/);
      expect(screen.queryByText(/bản cập nhật tới/)).not.toBeInTheDocument();
    });

    it('offers the full test after creating an "unsure" path, or lets the user go home', async () => {
      seed(6, { ...FULL, startPoint: 'unsure', currentLevel: 'a1', targetLevel: 'a2' });
      page();
      mocks.createPath.mockResolvedValue({ ...TEST_PATH, startPoint: 'unsure', currentLevel: 'a1', targetLevel: 'a2' });
      await userEvent.click(screen.getByRole('button', { name: 'Tạo lộ trình' }));
      expect(await screen.findByText(/A1 chỉ là trình độ tạm tính/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Vào trang chủ' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Kiểm tra nền tảng/ })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Làm bài kiểm tra (~12 phút)' }));
      expect(location()).toHaveTextContent(/^\/app\/kiem-tra\/path-en$/);
    });

    it('"Để sau" goes home', async () => {
      seed(6, { ...FULL, startPoint: 'unsure', currentLevel: 'a1', targetLevel: 'a2' });
      page();
      mocks.createPath.mockResolvedValue({ ...TEST_PATH, startPoint: 'unsure', currentLevel: 'a1', targetLevel: 'a2' });
      await userEvent.click(screen.getByRole('button', { name: 'Tạo lộ trình' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Để sau' }));
      expect(location()).toHaveTextContent(/^\/app$/);
    });

    it('offers the optional foundation check to complete beginners', async () => {
      seed(6, { language: 'en', startPoint: 'new', currentLevel: 'pre_a1', goalType: 'daily_communication', targetLevel: 'a1' });
      page();
      mocks.createPath.mockResolvedValue({ ...TEST_PATH, startPoint: 'new', currentLevel: 'pre_a1', targetLevel: 'a1' });
      await userEvent.click(screen.getByRole('button', { name: 'Tạo lộ trình' }));
      expect(await screen.findByRole('button', { name: 'Vào trang chủ' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Làm bài kiểm tra/ })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Kiểm tra nền tảng (2–3 phút)' }));
      expect(location()).toHaveTextContent(/^\/app\/kiem-tra\/path-en\?che-do=nen-tang$/);
    });

    it('offers no test to learners who picked their level', async () => {
      seed(6, FULL);
      page();
      mocks.createPath.mockResolvedValue(TEST_PATH);
      await userEvent.click(screen.getByRole('button', { name: 'Tạo lộ trình' }));
      expect(await screen.findByRole('button', { name: 'Vào trang chủ' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /kiểm tra/i })).not.toBeInTheDocument();
    });
  });
});
