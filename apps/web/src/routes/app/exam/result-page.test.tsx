import { renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTEMPT_ID, PATH_ID, TOPIK_II_FORM_ID, examAttempt, examResult } from '@/features/exam/exam-fixtures';
import { TEST_KO_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { ExamResultPage } from './ExamResultPage';
import { useExamResult } from './useExamResult';

const mocks = vi.hoisted(() => ({ getExamAttempt: vi.fn(), startExam: vi.fn(), track: vi.fn(), client: {} }));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));
vi.mock('@/features/exam/service', () => ({ getExamAttempt: mocks.getExamAttempt, startExam: mocks.startExam }));
vi.mock('@/features/analytics', () => ({ track: mocks.track }));

const KO_PATH = { ...TEST_KO_PATH, id: PATH_ID, goalType: 'topik_ii' as const };

function renderResult(paths: Parameters<typeof renderWithProviders>[1] = { paths: { paths: [KO_PATH] } }) {
  return renderWithProviders(
    <Routes>
      <Route path="/app/luyen-thi/ket-qua/:attemptId" element={<ExamResultPage />} />
      <Route path="/app/luyen-thi/lam-bai/:attemptId" element={<p>Trang làm bài</p>} />
    </Routes>,
    { route: `/app/luyen-thi/ket-qua/${ATTEMPT_ID}`, ...paths },
  );
}

beforeEach(() => {
  mocks.getExamAttempt.mockReset();
  mocks.startExam.mockReset();
  mocks.track.mockReset();
});

describe('ExamResultPage', () => {
  it('shows the summary, the question type breakdown and the review of a closed attempt', async () => {
    mocks.getExamAttempt.mockResolvedValue({ kind: 'result', result: examResult() });
    renderResult();
    expect(screen.getByText('Đang tải kết quả…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Kết quả bài luyện' })).toBeInTheDocument();
    expect(mocks.getExamAttempt).toHaveBeenCalledWith(expect.anything(), ATTEMPT_ID);
    expect(await screen.findByRole('heading', { level: 2, name: 'TOPIK II — Đề mini số 1' })).toBeInTheDocument();
    expect(screen.getByText('Thang điểm chưa được đối chiếu với quy chế hiện hành')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Phân tích dạng câu' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Xem lại đáp án' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Xem lại từng câu' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Về Luyện thi' })[0]).toHaveAttribute('href', '/app/luyen-thi');
  });

  it('starts a drill of a question type and opens the runner', async () => {
    const user = userEvent.setup();
    mocks.getExamAttempt.mockResolvedValue({ kind: 'result', result: examResult() });
    const drill = examAttempt({ attempt_id: 'e1000000-0000-4000-8000-000000000009', mode: 'question_type', deadline_at: null });
    mocks.startExam.mockResolvedValue(drill);
    renderResult();
    const breakdown = await screen.findByRole('list', { name: 'Kết quả theo dạng câu' });
    const [first] = within(breakdown).getAllByRole('button', { name: /^Luyện dạng này: / });
    await user.click(first!);
    await waitFor(() => expect(mocks.startExam).toHaveBeenCalled());
    expect(mocks.startExam).toHaveBeenCalledWith(expect.anything(), {
      pathId: PATH_ID,
      formId: TOPIK_II_FORM_ID,
      mode: 'question_type',
      questionType: expect.any(String),
    });
    expect(await screen.findByText('Trang làm bài')).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith('exam_started', { family: 'topik_ii', mode: 'question_type' });
  });

  it('sends an attempt that is still open back to the runner', async () => {
    mocks.getExamAttempt.mockResolvedValue({ kind: 'attempt', attempt: examAttempt() });
    renderResult();
    expect(await screen.findByText('Trang làm bài')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`/app/luyen-thi/lam-bai/${ATTEMPT_ID}`);
  });

  it('shows a load error with retry', async () => {
    const user = userEvent.setup();
    mocks.getExamAttempt.mockRejectedValueOnce({ code: 'P0001', message: 'attempt_not_found' });
    mocks.getExamAttempt.mockResolvedValueOnce({ kind: 'result', result: examResult() });
    renderResult();
    expect(await screen.findByRole('heading', { name: 'Không tải được kết quả' })).toBeInTheDocument();
    expect(screen.getByText('Không tìm thấy lượt làm bài. Hãy bắt đầu lại.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'TOPIK II — Đề mini số 1' })).toBeInTheDocument();
    expect(mocks.getExamAttempt).toHaveBeenCalledTimes(2);
  });

  it('disables drills without a current path', async () => {
    mocks.getExamAttempt.mockResolvedValue({ kind: 'result', result: examResult() });
    renderResult({ paths: { paths: [], currentId: null } });
    expect(await screen.findByText('Chọn một lộ trình để luyện thêm theo dạng câu.')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /^Luyện dạng này: / })) expect(button).toBeDisabled();
  });
});

describe('useExamResult', () => {
  it('uses the result handed over by the runner without asking the server', () => {
    const { result } = renderHook(() => useExamResult(ATTEMPT_ID, examResult()));
    expect(result.current.status).toBe('ready');
    expect(result.current.result).toEqual(examResult());
    expect(mocks.getExamAttempt).not.toHaveBeenCalled();
  });

  it('ignores a handed over result of another attempt', async () => {
    mocks.getExamAttempt.mockResolvedValue({ kind: 'result', result: examResult() });
    const { result } = renderHook(() => useExamResult(ATTEMPT_ID, examResult({ attempt_id: 'e1000000-0000-4000-8000-000000000099' })));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mocks.getExamAttempt).toHaveBeenCalledTimes(1);
  });
});
