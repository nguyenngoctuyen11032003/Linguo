import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTEMPT_ID, examAttempt, examQuestionId, examResult } from '@/features/exam/exam-fixtures';
import type { ExamAttemptRun } from '@/features/exam/useExamAttempt';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { ExamRunnerPage } from './ExamRunnerPage';

const store = vi.hoisted(() => {
  let value: unknown = null;
  const listeners = new Set<() => void>();
  return {
    ids: [] as string[],
    get: () => value,
    set(next: unknown) {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});
const mocks = vi.hoisted(() => ({ track: vi.fn(), stopSpeaking: vi.fn() }));

vi.mock('@/features/exam/useExamAttempt', async () => {
  const React = await import('react');
  return {
    useExamAttempt: (id: string) => {
      store.ids.push(id);
      return React.useSyncExternalStore(store.subscribe, store.get);
    },
  };
});
vi.mock('@/features/exam/tts', () => ({
  canSpeak: () => false,
  onVoicesChanged: () => () => {},
  speak: vi.fn().mockResolvedValue(undefined),
  stopSpeaking: mocks.stopSpeaking,
}));
vi.mock('@/features/analytics', () => ({ track: mocks.track }));

function run(overrides: Partial<ExamAttemptRun> = {}): ExamAttemptRun {
  return {
    status: 'running',
    attempt: examAttempt(),
    result: null,
    error: null,
    remainingMs: 60 * 60_000,
    saveState: 'idle',
    setAnswer: vi.fn(),
    toggleFlag: vi.fn(),
    submit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderRunner(initial: ExamAttemptRun = run()) {
  store.set(initial);
  const router = createMemoryRouter(
    [
      { path: '/app/luyen-thi', element: <h1>Trang luyện thi</h1> },
      { path: '/app/luyen-thi/lam-bai/:attemptId', element: <ExamRunnerPage /> },
      { path: '/app/luyen-thi/ket-qua/:attemptId', element: <h1>Trang kết quả</h1> },
    ],
    { initialEntries: ['/app/luyen-thi', `/app/luyen-thi/lam-bai/${ATTEMPT_ID}`], initialIndex: 1 },
  );
  render(
    <ThemeProvider>
      <MotionProvider>
        <RouterProvider router={router} />
      </MotionProvider>
    </ThemeProvider>,
  );
  return router;
}

const current = () => store.get() as ExamAttemptRun;

beforeEach(() => {
  localStorage.setItem('linguo-reduce-motion', 'true');
  store.ids = [];
  mocks.track.mockReset();
});

afterEach(() => localStorage.clear());

describe('ExamRunnerPage', () => {
  it('opens on the first unanswered question with title, section, position and timer', () => {
    renderRunner();
    expect(store.ids).toContain(ATTEMPT_ID);
    expect(screen.getByRole('heading', { level: 1, name: 'TOPIK II — Đề mini số 1' })).toBeInTheDocument();
    expect(screen.getByText('Phần Đọc · Câu 2/4')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveAccessibleName('Thời gian còn lại 60:00');
    expect(screen.getByText('무엇에 대한 이야기입니까?')).toBeInTheDocument();
  });

  it('saves an answer and toggles the review flag of the current question', async () => {
    const user = userEvent.setup();
    renderRunner();
    await user.click(screen.getByRole('radio', { name: /혼자 하는 여행/ }));
    expect(current().setAnswer).toHaveBeenCalledWith(examQuestionId(2), 'b');
    await user.click(screen.getByRole('button', { name: 'Đánh dấu xem lại' }));
    expect(current().toggleFlag).toHaveBeenCalledWith(examQuestionId(2));
  });

  it('moves between questions with the navigator and the previous / next buttons', async () => {
    const user = userEvent.setup();
    renderRunner();
    await user.click(screen.getByRole('button', { name: /^Câu 4:/ }));
    expect(screen.getByText('Phần Viết · Câu 4/4')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Bài viết của bạn' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Câu 4 trên 4' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Câu tiếp' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Câu trước' }));
    expect(screen.getByText('Phần Viết · Câu 3/4')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Câu trả lời của bạn' })).toBeInTheDocument();
  });

  it('confirms before submitting with the unanswered and flagged counts', async () => {
    const user = userEvent.setup();
    renderRunner();
    await user.click(screen.getByRole('button', { name: 'Nộp bài' }));
    const dialog = screen.getByRole('dialog', { name: 'Nộp bài?' });
    expect(dialog).toHaveTextContent('Còn 3 câu chưa trả lời.');
    expect(dialog).toHaveTextContent('1 câu đang đánh dấu xem lại.');
    await user.click(within(dialog).getByRole('button', { name: 'Làm tiếp' }));
    expect(current().submit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Nộp bài' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Nộp bài' }));
    expect(current().submit).toHaveBeenCalledTimes(1);
  });

  it('tracks exam_completed and opens the result once the attempt is graded', async () => {
    const router = renderRunner();
    act(() => store.set(run({ status: 'submitting' })));
    expect(screen.getByRole('button', { name: /Đang nộp bài/ })).toBeDisabled();
    act(() => store.set(run({ status: 'finished', result: examResult() })));
    expect(await screen.findByRole('heading', { name: 'Trang kết quả' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/app/luyen-thi/ket-qua/${ATTEMPT_ID}`);
    expect(router.state.location.state).toEqual({ result: examResult() });
    expect(mocks.track).toHaveBeenCalledWith('exam_completed', { family: 'topik_ii', mode: 'full' });
    // Replaced: back goes to the hub, not to the closed runner.
    act(() => void router.navigate(-1));
    expect(await screen.findByRole('heading', { name: 'Trang luyện thi' })).toBeInTheDocument();
  });

  it('sends an already closed attempt straight to its result without tracking', async () => {
    renderRunner(run({ status: 'finished', attempt: null, result: examResult({ status: 'expired' }) }));
    expect(await screen.findByRole('heading', { name: 'Trang kết quả' })).toBeInTheDocument();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('asks before leaving and keeps the learner on the page when they stay', async () => {
    const user = userEvent.setup();
    const router = renderRunner();
    await user.click(screen.getByRole('button', { name: 'Thoát bài thi' }));
    const dialog = screen.getByRole('dialog', { name: 'Rời bài thi?' });
    expect(dialog).toHaveTextContent('Đồng hồ vẫn tiếp tục chạy');
    await user.click(within(dialog).getByRole('button', { name: 'Ở lại làm bài' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // The browser back button is blocked the same way.
    act(() => void router.navigate(-1));
    const blocked = await screen.findByRole('dialog', { name: 'Rời bài thi?' });
    await user.click(within(blocked).getByRole('button', { name: 'Rời khỏi' }));
    expect(await screen.findByRole('heading', { name: 'Trang luyện thi' })).toBeInTheDocument();
  });

  it('leaves to the hub from the exit button', async () => {
    const user = userEvent.setup();
    const router = renderRunner();
    await user.click(screen.getByRole('button', { name: 'Thoát bài thi' }));
    await user.click(screen.getByRole('button', { name: 'Rời khỏi' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/luyen-thi'));
  });

  it('guards closing the tab while the attempt is open', () => {
    renderRunner();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('shows the save state, save errors and untimed practice', () => {
    renderRunner(run({ saveState: 'offline', error: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.', remainingMs: null, attempt: examAttempt({ mode: 'section', deadline_at: null }) }));
    expect(screen.getByText('Mất kết nối — câu trả lời sẽ được lưu khi có mạng')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
    expect(screen.getByText('Không giới hạn thời gian')).toBeInTheDocument();
  });

  it('shows a load error with retry and a way back', async () => {
    const user = userEvent.setup();
    renderRunner(run({ status: 'error', attempt: null, error: 'Không tìm thấy lượt làm bài. Hãy bắt đầu lại.' }));
    expect(screen.getByRole('heading', { name: 'Không tải được bài thi' })).toBeInTheDocument();
    expect(screen.getByText('Không tìm thấy lượt làm bài. Hãy bắt đầu lại.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về Luyện thi' })).toHaveAttribute('href', '/app/luyen-thi');
    const calls = store.ids.length;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(store.ids.length).toBeGreaterThan(calls);
  });

  it('shows a loading state', () => {
    renderRunner(run({ status: 'loading', attempt: null }));
    expect(screen.getByText('Đang tải bài thi…')).toBeInTheDocument();
  });
});
