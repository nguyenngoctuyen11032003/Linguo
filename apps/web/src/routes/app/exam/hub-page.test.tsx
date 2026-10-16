import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExamFormSummary, ExamHistoryEntry } from '@linguo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { examAttempt, examHistory, examHistoryAttemptId, topikIForm, topikIIForm } from '@/features/exam/exam-fixtures';
import type { LearningPath } from '@/features/learning-paths/service';
import { TEST_KO_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { ExamHubPage } from './ExamHubPage';

type FormsHook = { status: 'idle' | 'loading' | 'ready' | 'error'; forms: ExamFormSummary[]; error: string | null; reload: () => void };
type HistoryHook = { status: 'idle' | 'loading' | 'ready' | 'error'; entries: ExamHistoryEntry[]; error: string | null; reload: () => void };

const mocks = vi.hoisted(() => ({
  forms: null as unknown as FormsHook,
  history: null as unknown as HistoryHook,
  formsArgs: [] as unknown[],
  historyArgs: [] as unknown[],
  startExam: vi.fn(),
  track: vi.fn(),
  client: {},
}));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));
vi.mock('@/features/exam/useExamForms', () => ({
  useExamForms: (language: unknown) => {
    mocks.formsArgs.push(language);
    return mocks.forms;
  },
}));
vi.mock('@/features/exam/useExamHistory', () => ({
  useExamHistory: (...args: unknown[]) => {
    mocks.historyArgs.push(args);
    return mocks.history;
  },
}));
vi.mock('@/features/exam/service', () => ({ startExam: mocks.startExam }));
vi.mock('@/features/analytics', () => ({ track: mocks.track }));

const KO_TOPIK_II: LearningPath = { ...TEST_KO_PATH, id: 'path-ko-2', goalType: 'topik_ii', currentLevel: 'topik2', targetLevel: 'topik3' };

function renderHub(path = KO_TOPIK_II) {
  return renderWithProviders(<ExamHubPage />, { route: '/app/luyen-thi', paths: { paths: [path] } });
}

beforeEach(() => {
  mocks.forms = { status: 'ready', forms: [topikIForm(), topikIIForm()], error: null, reload: vi.fn() };
  mocks.history = { status: 'ready', entries: examHistory(), error: null, reload: vi.fn() };
  mocks.formsArgs = [];
  mocks.historyArgs = [];
  mocks.startExam.mockReset();
  mocks.track.mockReset();
});

describe('ExamHubPage', () => {
  it('loads the forms of the path language and the history of the path', () => {
    renderHub();
    expect(screen.getByRole('heading', { level: 1, name: 'Luyện thi' })).toBeInTheDocument();
    expect(mocks.formsArgs.at(-1)).toBe('ko');
    expect(mocks.historyArgs.at(-1)).toEqual(['path-ko-2', 5]);
    expect(screen.getByRole('heading', { level: 2, name: 'Lịch sử thi gần đây' })).toBeInTheDocument();
  });

  it('filters by the family of the path goal by default and can show every family', async () => {
    const user = userEvent.setup();
    renderHub();
    const filter = screen.getByRole('radiogroup', { name: 'Lọc theo loại đề' });
    expect(within(filter).getByRole('radio', { name: 'TOPIK II' })).toBeChecked();
    expect(screen.getAllByRole('article').map((a) => within(a).getByRole('heading', { level: 2 }).textContent)).toEqual([topikIIForm().title_vi]);

    await user.click(within(filter).getByRole('radio', { name: 'Tất cả' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('warns on a card whose structure differs from the path goal', async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getByRole('radio', { name: 'Tất cả' }));
    const [topikI, topikII] = screen.getAllByRole('article');
    expect(within(topikI!).getByRole('note')).toHaveTextContent('Đề này theo cấu trúc TOPIK I, khác mục tiêu TOPIK II');
    expect(within(topikII!).queryByRole('note')).not.toBeInTheDocument();
  });

  it('asks before starting a timed full mock, then tracks exam_started and opens the runner', async () => {
    const user = userEvent.setup();
    mocks.startExam.mockResolvedValue(examAttempt());
    renderHub();
    await user.click(screen.getByRole('button', { name: /Thi thử toàn bài/ }));
    const dialog = screen.getByRole('dialog', { name: 'Bắt đầu thi thử?' });
    expect(dialog).toHaveTextContent('Đồng hồ 70 phút chạy ngay và vẫn chạy nếu bạn thoát.');
    expect(mocks.startExam).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Bắt đầu' }));
    expect(mocks.startExam).toHaveBeenCalledWith(expect.anything(), {
      pathId: 'path-ko-2',
      formId: topikIIForm().form_id,
      mode: 'full',
      section: null,
      questionType: null,
    });
    await waitFor(() => expect(mocks.track).toHaveBeenCalled());
    expect(mocks.track).toHaveBeenCalledWith('exam_started', { family: 'topik_ii', mode: 'full' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/app/luyen-thi/lam-bai/${examAttempt().attempt_id}`));
  });

  it('opens the question type picker and starts a drill', async () => {
    const user = userEvent.setup();
    mocks.startExam.mockResolvedValue(examAttempt({ mode: 'question_type', deadline_at: null, question_type: 'topik_ii_write_51' }));
    renderHub();
    await user.click(screen.getByRole('button', { name: 'Luyện theo dạng câu' }));
    const picker = screen.getByRole('region', { name: /Chọn dạng câu/ });
    expect(picker).toHaveFocus();
        await user.click(within(picker).getByRole('button', { name: /Đọc — chủ đề/ }));
    expect(mocks.startExam).toHaveBeenCalledWith(expect.anything(), {
      pathId: 'path-ko-2',
      formId: topikIIForm().form_id,
      mode: 'question_type',
      section: null,
      questionType: 'topik_ii_read_topic',
    });
    await waitFor(() => expect(mocks.track).toHaveBeenCalled());
    expect(mocks.track).toHaveBeenCalledWith('exam_started', { family: 'topik_ii', mode: 'question_type' });
  });

  it('does not start a timed full mock when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getByRole('button', { name: /Thi thử toàn bài/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Bắt đầu thi thử?' })).getByRole('button', { name: 'Để sau' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.startExam).not.toHaveBeenCalled();
  });

  it('starts an untimed full form directly, without a confirmation', async () => {
    const user = userEvent.setup();
    const form = topikIIForm();
    mocks.forms = {
      ...mocks.forms,
      forms: [{ ...form, sections: form.sections.map((s) => ({ ...s, minutes: null })) }],
    };
    mocks.startExam.mockResolvedValue(examAttempt({ deadline_at: null }));
    renderHub();
    await user.click(screen.getByRole('button', { name: /Thi thử toàn bài/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.startExam).toHaveBeenCalled();
  });

  it('starts section practice with its section', async () => {
    const user = userEvent.setup();
    mocks.startExam.mockResolvedValue(examAttempt({ mode: 'section', section: 'reading', deadline_at: null }));
    renderHub();
    await user.click(screen.getByRole('button', { name: 'Luyện theo phần' }));
    await user.click(screen.getByRole('button', { name: 'Luyện phần Đọc' }));
    expect(mocks.startExam).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mode: 'section', section: 'reading' }));
    await waitFor(() => expect(mocks.track).toHaveBeenCalled());
    expect(mocks.track).toHaveBeenCalledWith('exam_started', { family: 'topik_ii', mode: 'section', section: 'reading' });
  });

  it('shows a start failure without leaving the hub', async () => {
    const user = userEvent.setup();
    mocks.startExam.mockRejectedValue({ code: 'P0001', message: 'rate_limited' });
    renderHub();
    await user.click(screen.getByRole('button', { name: /Thi thử toàn bài/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Bắt đầu thi thử?' })).getByRole('button', { name: 'Bắt đầu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã bắt đầu quá nhiều lượt thi trong một giờ');
    expect(mocks.track).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/luyen-thi');
  });

  it('shows loading, error and empty states', async () => {
    const user = userEvent.setup();
    mocks.forms = { status: 'loading', forms: [], error: null, reload: vi.fn() };
    const first = renderHub();
    expect(screen.getByText('Đang tải đề luyện thi…')).toBeInTheDocument();

    const reload = vi.fn();
    mocks.forms = { status: 'error', forms: [], error: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.', reload };
    first.unmount();
    const second = renderHub();
    expect(screen.getByRole('heading', { name: 'Không tải được đề luyện thi' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(reload).toHaveBeenCalled();

    mocks.forms = { status: 'ready', forms: [], error: null, reload: vi.fn() };
    second.unmount();
    renderHub();
    expect(screen.getByRole('heading', { name: 'Chưa có đề luyện thi' })).toBeInTheDocument();
  });

  it('asks for a learning path first', () => {
    renderWithProviders(<ExamHubPage />, { route: '/app/luyen-thi', paths: { paths: [], currentId: null } });
    expect(screen.getByRole('heading', { name: 'Bạn chưa có lộ trình' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo lộ trình' })).toHaveAttribute('href', '/app/bat-dau');
  });

  describe('with an attempt in progress', () => {
    const OPEN_ID = examHistoryAttemptId(9);
    const openEntry: ExamHistoryEntry = {
      attempt_id: OPEN_ID,
      form_title_vi: 'TOPIK II — Đề mini số 1',
      family: 'topik_ii',
      mode: 'section',
      section: 'listening',
      status: 'in_progress',
      started_at: '2026-10-12T08:00:00.000Z',
      submitted_at: null,
      total: null,
      max: null,
      estimated_level_code: null,
      scoring_verified: false,
    };

    beforeEach(() => {
      mocks.history = { status: 'ready', entries: [openEntry, ...examHistory()], error: null, reload: vi.fn() };
    });

    it('names the open attempt before a start would expire it, focusing "Làm tiếp bài đang dở"', async () => {
      const user = userEvent.setup();
      renderHub();
      await user.click(screen.getByRole('button', { name: 'Luyện theo phần' }));
      await user.click(screen.getByRole('button', { name: 'Luyện phần Đọc' }));
      const dialog = screen.getByRole('alertdialog', { name: 'Bạn đang làm dở một bài' });
      expect(dialog).toHaveAccessibleDescription(/TOPIK II — Đề mini số 1 · Luyện theo phần · Nghe/);
      expect(mocks.startExam).not.toHaveBeenCalled();
      const resume = within(dialog).getByRole('link', { name: 'Làm tiếp bài đang dở' });
      expect(resume).toHaveFocus();
      await user.click(resume);
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/app/luyen-thi/lam-bai/${OPEN_ID}`));
      expect(mocks.startExam).not.toHaveBeenCalled();
    });

    it('starts the new attempt on "Bắt đầu bài mới"', async () => {
      const user = userEvent.setup();
      mocks.startExam.mockResolvedValue(examAttempt({ mode: 'section', section: 'reading', deadline_at: null }));
      renderHub();
      await user.click(screen.getByRole('button', { name: 'Luyện theo phần' }));
      await user.click(screen.getByRole('button', { name: 'Luyện phần Đọc' }));
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Bắt đầu bài mới' }));
      expect(mocks.startExam).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mode: 'section', section: 'reading' }));
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/app/luyen-thi/lam-bai/${examAttempt().attempt_id}`));
    });

    it('still asks about the clock of a timed full mock after "Bắt đầu bài mới"', async () => {
      const user = userEvent.setup();
      mocks.startExam.mockResolvedValue(examAttempt());
      renderHub();
      await user.click(screen.getByRole('button', { name: /Thi thử toàn bài/ }));
      expect(screen.queryByRole('dialog', { name: 'Bắt đầu thi thử?' })).not.toBeInTheDocument();
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Bắt đầu bài mới' }));
      const timed = await screen.findByRole('dialog', { name: 'Bắt đầu thi thử?' });
      expect(mocks.startExam).not.toHaveBeenCalled();
      await user.click(within(timed).getByRole('button', { name: 'Bắt đầu' }));
      expect(mocks.startExam).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mode: 'full' }));
    });

    it('asks before a question type drill and returns focus to the trigger on Escape', async () => {
      const user = userEvent.setup();
      renderHub();
      await user.click(screen.getByRole('button', { name: 'Luyện theo dạng câu' }));
      const pick = within(screen.getByRole('region', { name: /Chọn dạng câu/ })).getByRole('button', { name: /Đọc — chủ đề/ });
      await user.click(pick);
      expect(screen.getByRole('alertdialog', { name: 'Bạn đang làm dở một bài' })).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(pick).toHaveFocus();
      expect(mocks.startExam).not.toHaveBeenCalled();
    });
  });

  it('starts directly when the history has no attempt in progress', async () => {
    const user = userEvent.setup();
    mocks.startExam.mockResolvedValue(examAttempt({ mode: 'section', section: 'reading', deadline_at: null }));
    renderHub();
    await user.click(screen.getByRole('button', { name: 'Luyện theo phần' }));
    await user.click(screen.getByRole('button', { name: 'Luyện phần Đọc' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocks.startExam).toHaveBeenCalled();
  });

  it('shows every family when the goal has no exam family', () => {
    renderHub(TEST_KO_PATH);
    expect(screen.getByRole('radio', { name: 'Tất cả' })).toBeChecked();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });
});
