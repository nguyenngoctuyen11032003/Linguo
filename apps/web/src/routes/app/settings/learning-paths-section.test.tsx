import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REFERENCE, TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { LearningPathsSection } from './LearningPathsSection';

const mocks = vi.hoisted(() => ({
  setPathStatus: vi.fn(),
  updatePlan: vi.fn(),
  reference: vi.fn(),
  diagnostic: vi.fn(),
}));
vi.mock('@/features/diagnostic/useDiagnosticStatus', () => ({
  useDiagnosticStatus: (pathId?: string) => mocks.diagnostic(pathId),
}));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/learning-paths/useReferenceHours', () => ({
  useReferenceHours: () => mocks.reference(),
}));
vi.mock('@/features/learning-paths/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/learning-paths/service')>()),
  setPathStatus: mocks.setPathStatus,
  updatePlan: mocks.updatePlan,
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

const paused = { ...TEST_PATH, status: 'paused' as const };
const retry = vi.fn();

beforeEach(() => {
  mocks.setPathStatus.mockReset();
  mocks.updatePlan.mockReset();
  retry.mockReset();
  mocks.reference.mockReset().mockReturnValue({ status: 'ready', data: REFERENCE, retry });
  mocks.diagnostic.mockReset().mockReturnValue({ status: 'loading', data: null, reload: vi.fn() });
});

const DIAG_NONE = { attempt_id: null, status: 'none', completed_at: null, applied_at: null, retake_after: null, can_start: true };
const DIAG_ATTEMPT = '22222222-2222-4222-8222-222222222222';
const diagnostic = (data: Record<string, unknown>) =>
  mocks.diagnostic.mockReturnValue({ status: 'ready', data: { ...DIAG_NONE, ...data }, reload: vi.fn() });

describe('placement test per path', () => {
  it('offers a retake once the cooldown is over', () => {
    diagnostic({ attempt_id: DIAG_ATTEMPT, status: 'completed', completed_at: '2026-09-01T03:00:00Z', retake_after: '2026-09-15T03:00:00Z' });
    renderWithProviders(<LearningPathsSection />, { route: '/app/cai-dat' });
    expect(mocks.diagnostic).toHaveBeenCalledWith('path-en');
    expect(screen.getByRole('link', { name: 'Tiếng Anh: Làm lại bài kiểm tra' })).toHaveAttribute('href', '/app/kiem-tra/path-en');
  });

  it('disables the retake during the cooldown and shows the date it opens', () => {
    diagnostic({
      attempt_id: DIAG_ATTEMPT,
      status: 'completed',
      completed_at: '2026-10-10T03:00:00Z',
      retake_after: '2026-10-24T18:00:00Z',
      can_start: false,
    });
    renderWithProviders(<LearningPathsSection />, { route: '/app/cai-dat' });
    const button = screen.getByRole('button', { name: 'Tiếng Anh: Làm lại bài kiểm tra' });
    expect(button).toBeDisabled();
    // 18:00 UTC is already the next day in Asia/Ho_Chi_Minh.
    expect(button).toHaveAccessibleDescription('Có thể làm lại từ 25/10/2026');
    expect(screen.queryByRole('link', { name: /bài kiểm tra/ })).not.toBeInTheDocument();
  });

  it('resumes an open attempt and offers a first test otherwise', () => {
    diagnostic({ attempt_id: DIAG_ATTEMPT, status: 'in_progress' });
    const first = renderWithProviders(<LearningPathsSection />, { route: '/app/cai-dat' });
    expect(screen.getByRole('link', { name: 'Tiếng Anh: Tiếp tục bài kiểm tra' })).toHaveAttribute('href', '/app/kiem-tra/path-en');
    first.unmount();
    diagnostic({});
    renderWithProviders(<LearningPathsSection />, { route: '/app/cai-dat' });
    expect(screen.getByRole('link', { name: 'Tiếng Anh: Làm bài kiểm tra trình độ' })).toHaveAttribute('href', '/app/kiem-tra/path-en');
  });

  it('shows nothing while the status loads or fails', () => {
    mocks.diagnostic.mockReturnValue({ status: 'error', data: null, reload: vi.fn() });
    renderWithProviders(<LearningPathsSection />, { route: '/app/cai-dat' });
    expect(screen.queryByRole('link', { name: /bài kiểm tra/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /bài kiểm tra/ })).not.toBeInTheDocument();
  });
});

describe('LearningPathsSection', () => {
  it('lists the learning paths with a heading per path', () => {
    renderWithProviders(<LearningPathsSection />, { route: '/app/cai-dat' });
    const section = screen.getByRole('region', { name: 'Lộ trình học' });
    expect(within(section).getByRole('heading', { level: 3, name: 'Tiếng Anh · Giao tiếp đời sống' })).toBeInTheDocument();
    expect(within(section).getByText('A2 → B1 · khoảng 43–69 tuần')).toBeInTheDocument();
  });

  it('links to add the missing language', () => {
    renderWithProviders(<LearningPathsSection />, { route: '/app/cai-dat' });
    const section = screen.getByRole('region', { name: 'Lộ trình học' });
    expect(within(section).getByRole('link', { name: '+ Thêm Tiếng Hàn' })).toHaveAttribute('href', '/app/bat-dau?lang=ko');
  });

  it('keeps the list visible during a background reload', () => {
    renderWithProviders(<LearningPathsSection />, { paths: { status: 'loading' } });
    expect(screen.getByRole('heading', { level: 3, name: /Tiếng Anh/ })).toBeInTheDocument();
  });

  describe('anchor from Home', () => {
    it('focuses the section heading when opened with #lo-trinh and offsets the sticky bar', () => {
      renderWithProviders(<LearningPathsSection />, { route: '/app/cai-dat#lo-trinh' });
      const heading = screen.getByRole('heading', { level: 2, name: 'Lộ trình học' });
      expect(heading).toHaveFocus();
      expect(heading).toHaveAttribute('tabindex', '-1');
      expect(screen.getByRole('region', { name: 'Lộ trình học' }).className).toContain(
        'scroll-mt-[calc(4.5rem+env(safe-area-inset-top,0px))]',
      );
    });

    it('does not steal focus without the hash', () => {
      renderWithProviders(<LearningPathsSection />, { route: '/app/cai-dat' });
      expect(screen.getByRole('heading', { level: 2, name: 'Lộ trình học' })).not.toHaveFocus();
    });
  });

  describe('pause and resume', () => {
    it('pauses a path and keeps focus on the toggle', async () => {
      const upsertPath = vi.fn();
      mocks.setPathStatus.mockResolvedValue({ ...TEST_PATH, status: 'paused' });
      renderWithProviders(<LearningPathsSection />, { paths: { upsertPath } });
      const toggle = screen.getByRole('button', { name: 'Tạm dừng' });
      await userEvent.click(toggle);
      expect(mocks.setPathStatus).toHaveBeenCalledWith({}, 'path-en', 'paused');
      expect(upsertPath).toHaveBeenCalledWith({ ...TEST_PATH, status: 'paused' });
      expect(await screen.findByText('Đã tạm dừng lộ trình.')).toBeInTheDocument();
      await waitFor(() => expect(toggle).toHaveFocus());
    });

    it('resumes from paused with the same button and keeps focus', async () => {
      const upsertPath = vi.fn();
      mocks.setPathStatus.mockResolvedValue({ ...TEST_PATH, status: 'active' });
      renderWithProviders(<LearningPathsSection />, { paths: { paths: [paused], upsertPath } });
      expect(screen.getByText('Tạm dừng', { selector: 'span' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Tạm dừng' })).not.toBeInTheDocument();
      const toggle = screen.getByRole('button', { name: 'Tiếp tục' });
      await userEvent.click(toggle);
      expect(mocks.setPathStatus).toHaveBeenCalledWith({}, 'path-en', 'active');
      expect(upsertPath).toHaveBeenCalledWith({ ...TEST_PATH, status: 'active' });
      expect(await screen.findByText('Đã tiếp tục lộ trình.')).toBeInTheDocument();
      await waitFor(() => expect(toggle).toHaveFocus());
    });

    it('toasts a Vietnamese error and returns focus when the status change fails', async () => {
      mocks.setPathStatus.mockRejectedValue(new Error('invalid_status_transition'));
      renderWithProviders(<LearningPathsSection />);
      const toggle = screen.getByRole('button', { name: 'Tạm dừng' });
      await userEvent.click(toggle);
      expect(await screen.findByText('Không thể chuyển trạng thái lộ trình như vậy.')).toBeInTheDocument();
      await waitFor(() => expect(toggle).toBeEnabled());
      expect(toggle).toHaveFocus();
    });

    it('disables the other actions of the item while the status changes', async () => {
      const pending = deferred<typeof TEST_PATH>();
      mocks.setPathStatus.mockReturnValue(pending.promise);
      renderWithProviders(<LearningPathsSection />);
      await userEvent.click(screen.getByRole('button', { name: 'Tạm dừng' }));
      expect(screen.getByRole('button', { name: 'Sửa kế hoạch' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Tạm dừng' })).toHaveAttribute('aria-busy', 'true');
      pending.resolve({ ...TEST_PATH, status: 'paused' });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Sửa kế hoạch' })).toBeEnabled());
      expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeEnabled();
    });
  });

  describe('archive', () => {
    it('keeps "Lưu trữ" mounted, moves focus into the confirmation and back on cancel', async () => {
      renderWithProviders(<LearningPathsSection />);
      const archive = screen.getByRole('button', { name: 'Lưu trữ' });
      expect(archive).toHaveAttribute('aria-expanded', 'false');
      await userEvent.click(archive);
      expect(mocks.setPathStatus).not.toHaveBeenCalled();
      expect(archive).toBeInTheDocument();
      expect(archive).toHaveAttribute('aria-expanded', 'true');
      expect(archive).toBeDisabled();
      expect(screen.getByText(/Lịch sử học vẫn được giữ/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Xác nhận lưu trữ' })).toHaveFocus();

      await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
      expect(screen.queryByRole('group', { name: 'Xác nhận lưu trữ' })).not.toBeInTheDocument();
      expect(archive).toBeEnabled();
      expect(archive).toHaveAttribute('aria-expanded', 'false');
      expect(archive).toHaveFocus();
      expect(mocks.setPathStatus).not.toHaveBeenCalled();
    });

    it('archives after confirmation, reloads and focuses the section heading', async () => {
      const reload = vi.fn();
      mocks.setPathStatus.mockResolvedValue({ ...TEST_PATH, status: 'archived' });
      renderWithProviders(<LearningPathsSection />, { paths: { reload } });
      await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
      await userEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu trữ' }));
      expect(mocks.setPathStatus).toHaveBeenCalledWith({}, 'path-en', 'archived');
      expect(reload).toHaveBeenCalled();
      expect(await screen.findByText('Đã lưu trữ lộ trình. Lịch sử học vẫn được giữ.')).toBeInTheDocument();
      const heading = screen.getByRole('heading', { level: 2, name: 'Lộ trình học' });
      expect(heading).toHaveAttribute('id', 'paths-heading');
      expect(heading).toHaveFocus();
    });

    it('returns focus to "Lưu trữ" when archiving fails', async () => {
      mocks.setPathStatus.mockRejectedValue(new Error('path_not_found'));
      renderWithProviders(<LearningPathsSection />);
      await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
      await userEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu trữ' }));
      expect(await screen.findByText('Không tìm thấy lộ trình.')).toBeInTheDocument();
      const archive = screen.getByRole('button', { name: 'Lưu trữ' });
      await waitFor(() => expect(archive).toHaveFocus());
      expect(archive).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('completed paths', () => {
    it('offers only archive', () => {
      renderWithProviders(<LearningPathsSection />, { paths: { paths: [{ ...TEST_PATH, status: 'completed' }] } });
      expect(screen.queryByRole('button', { name: 'Sửa kế hoạch' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Tạm dừng' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Tiếp tục' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeEnabled();
    });
  });

  describe('plan editor', () => {
    const openEditor = async () => {
      const edit = screen.getByRole('button', { name: 'Sửa kế hoạch' });
      await userEvent.click(edit);
      return edit;
    };

    it('edits the plan with a live estimate, saves and focuses "Sửa kế hoạch"', async () => {
      const upsertPath = vi.fn();
      mocks.updatePlan.mockResolvedValue({ ...TEST_PATH, targetLevel: 'b2' });
      renderWithProviders(<LearningPathsSection />, { paths: { upsertPath } });
      const edit = await openEditor();
      expect(edit).toHaveAttribute('aria-expanded', 'true');
      await userEvent.selectOptions(screen.getByLabelText('Bậc mục tiêu'), 'b2');
      await userEvent.click(screen.getByRole('radio', { name: '45–60 phút mỗi ngày' }));
      const estimate = screen.getByText('Khoảng 44–72 tuần');
      expect(estimate.closest('[aria-live="polite"]')).not.toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Lưu kế hoạch' }));
      expect(mocks.updatePlan).toHaveBeenCalledWith({}, 'path-en', {
        goalType: 'daily_communication',
        targetLevel: 'b2',
        weeklyMinutes: [60, 60, 60, 60, 60, 60, 60],
        targetDate: null,
      });
      expect(upsertPath).toHaveBeenCalledWith({ ...TEST_PATH, targetLevel: 'b2' });
      expect(await screen.findByText('Đã lưu kế hoạch. Ước lượng đã được tính lại.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Lưu kế hoạch' })).not.toBeInTheDocument();
      expect(edit).toHaveFocus();
      expect(edit).toHaveAttribute('aria-expanded', 'false');
    });

    it('focuses "Sửa kế hoạch" after cancelling', async () => {
      renderWithProviders(<LearningPathsSection />);
      const edit = await openEditor();
      await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
      expect(screen.queryByRole('button', { name: 'Lưu kế hoạch' })).not.toBeInTheDocument();
      expect(edit).toHaveFocus();
    });

    it('disables the other actions of the item while saving', async () => {
      const pending = deferred<typeof TEST_PATH>();
      mocks.updatePlan.mockReturnValue(pending.promise);
      renderWithProviders(<LearningPathsSection />);
      await openEditor();
      await userEvent.click(screen.getByRole('button', { name: 'Lưu kế hoạch' }));
      expect(screen.getByRole('button', { name: 'Sửa kế hoạch' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Tạm dừng' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeDisabled();
      pending.resolve(TEST_PATH);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Sửa kế hoạch' })).toBeEnabled());
      expect(screen.getByRole('button', { name: 'Tạm dừng' })).toBeEnabled();
    });

    it('shows a Vietnamese server error and clears it when a field changes', async () => {
      mocks.updatePlan.mockRejectedValue(new Error('target_date_too_far'));
      renderWithProviders(<LearningPathsSection />);
      await openEditor();
      await userEvent.click(screen.getByRole('button', { name: 'Lưu kế hoạch' }));
      const alert = await screen.findByText('Ngày mục tiêu quá xa (tối đa 10 năm).');
      expect(alert).toHaveAttribute('role', 'alert');
      expect(screen.getByRole('button', { name: 'Lưu kế hoạch' })).toBeEnabled();
      await userEvent.click(screen.getByRole('radio', { name: '45–60 phút mỗi ngày' }));
      expect(screen.queryByText('Ngày mục tiêu quá xa (tối đa 10 năm).')).not.toBeInTheDocument();
    });

    it('reports a network failure without leaving the editor', async () => {
      mocks.updatePlan.mockRejectedValue(new TypeError('Failed to fetch'));
      renderWithProviders(<LearningPathsSection />);
      await openEditor();
      await userEvent.click(screen.getByRole('button', { name: 'Lưu kế hoạch' }));
      expect(await screen.findByText('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Lưu kế hoạch' })).toBeInTheDocument();
    });

    it('rejects a past target date once, on the field, and focuses it', async () => {
      renderWithProviders(<LearningPathsSection />);
      await openEditor();
      const date = screen.getByLabelText('Ngày mục tiêu (không bắt buộc)');
      fireEvent.change(date, { target: { value: '2000-01-01' } });
      await userEvent.click(screen.getByRole('button', { name: 'Lưu kế hoạch' }));
      expect(screen.getAllByText('Ngày mục tiêu đã qua.')).toHaveLength(1);
      expect(date).toHaveFocus();
      expect(date).toHaveAttribute('aria-invalid', 'true');
      expect(mocks.updatePlan).not.toHaveBeenCalled();
    });

    it('rejects a target date more than 10 years away', async () => {
      renderWithProviders(<LearningPathsSection />);
      await openEditor();
      const date = screen.getByLabelText('Ngày mục tiêu (không bắt buộc)');
      expect(date).toHaveAttribute('max');
      fireEvent.change(date, { target: { value: '2999-01-01' } });
      expect(screen.getAllByText('Ngày mục tiêu quá xa (tối đa 10 năm).')).toHaveLength(1);
      await userEvent.click(screen.getByRole('button', { name: 'Lưu kế hoạch' }));
      expect(date).toHaveFocus();
      expect(mocks.updatePlan).not.toHaveBeenCalled();
    });

    it('disables Save when no target level is left', async () => {
      const maxed = { ...TEST_PATH, currentLevel: 'c2', targetLevel: 'c2' };
      renderWithProviders(<LearningPathsSection />, { paths: { paths: [maxed] } });
      await openEditor();
      expect(screen.getByText('Bạn đã đạt mục tiêu này. Hãy chọn mục tiêu khác.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Lưu kế hoạch' })).toBeDisabled();
    });

    it('restores the saved target when the goal is switched back', async () => {
      const saved = { ...TEST_PATH, targetLevel: 'c1' };
      renderWithProviders(<LearningPathsSection />, { paths: { paths: [saved] } });
      await openEditor();
      const goal = screen.getByLabelText('Mục tiêu');
      const target = screen.getByLabelText('Bậc mục tiêu');
      expect(target).toHaveValue('c1');
      await userEvent.selectOptions(goal, 'cefr');
      expect(target).toHaveValue('b2');
      await userEvent.selectOptions(goal, 'daily_communication');
      expect(target).toHaveValue('c1');
    });

    it('offers a retry when the reference hours fail to load', async () => {
      mocks.reference.mockReturnValue({ status: 'error', data: null, retry });
      renderWithProviders(<LearningPathsSection />);
      await openEditor();
      expect(screen.getByText('Không tải được số giờ tham chiếu')).toBeInTheDocument();
      expect(screen.queryByText(/Khoảng \d+–\d+ tuần/)).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
      expect(retry).toHaveBeenCalledOnce();
    });
  });
});
