import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonRunApi } from '@/features/lesson-player/types';
import { renderWithProviders } from '../../../../tests/unit/render';
import { COMPLETE_RESULT, EX1, EX2, LESSON, LESSON_ID, makeRun } from './lesson-fixtures';
import { LessonPage } from './LessonPage';
import { questionPosition } from './progress';

const mocks = vi.hoisted(() => ({ run: null as LessonRunApi | null, useLessonRun: vi.fn(), frameProps: [] as unknown[] }));

vi.mock('@/features/lesson-player/useLessonRun', () => ({
  useLessonRun: (id: string) => {
    mocks.useLessonRun(id);
    return mocks.run;
  },
}));

vi.mock('@/components/exercise', () => ({
  DemoBadge: () => <span>Nội dung demo — chưa kiểm duyệt</span>,
  PendingSyncBadge: () => <span>Đang chờ đồng bộ</span>,
  ExerciseFrame: (props: { exercise: { id: string }; recheck: boolean; onSubmit: (r: unknown, m: unknown) => void; onContinue: () => void }) => {
    mocks.frameProps.push(props);
    return (
      <div data-testid="exercise-frame" data-exercise={props.exercise.id} data-recheck={String(props.recheck)}>
        <button type="button" onClick={() => props.onSubmit({ option_id: 'a' }, { confidence: null, responseMs: 1200, hintCount: 0 })}>
          Kiểm tra
        </button>
        <button type="button" onClick={props.onContinue}>
          Tiếp tục câu
        </button>
      </div>
    );
  },
}));

function renderLesson(run: LessonRunApi) {
  mocks.run = run;
  return renderWithProviders(
    <Routes>
      <Route path="/app/hoc-tap/bai/:lessonId" element={<LessonPage />} />
      <Route path="*" element={null} />
    </Routes>,
    { route: `/app/hoc-tap/bai/${LESSON_ID}` },
  );
}

beforeEach(() => {
  mocks.useLessonRun.mockReset();
  mocks.frameProps = [];
});

describe('LessonPage', () => {
  it('loads the lesson from the URL and renders the objective step', async () => {
    const run = makeRun();
    renderLesson(run);
    expect(mocks.useLessonRun).toHaveBeenCalledWith(LESSON_ID);
    expect(screen.getByRole('heading', { level: 1, name: 'Chào hỏi cơ bản' })).toBeInTheDocument();
    expect(screen.getByText('Chào và đáp lại lời chào')).toBeInTheDocument();
    expect(screen.getByText('Giới thiệu tên mình')).toBeInTheDocument();
    expect(screen.getByText('Sau bài này bạn chào hỏi được.')).toBeInTheDocument();
    expect(screen.getByText('Khoảng 8 phút')).toBeInTheDocument();
    expect(screen.getByText('Nội dung demo — chưa kiểm duyệt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quay lại' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(run.next).toHaveBeenCalled();
  });

  it('labels the progress bar with steps and questions', () => {
    renderLesson(makeRun({ stepIndex: 5 }));
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '6');
    expect(bar).toHaveAttribute('aria-valuemax', '8');
    expect(bar).toHaveAttribute('aria-valuetext', 'Bước 6/8 · Câu 2/2');
    expect(screen.getByText('Bước 6/8 · Câu 2/2')).toBeInTheDocument();
  });

  it('counts questions up to the current step', () => {
    const { steps } = makeRun();
    expect(questionPosition(steps, 0)).toEqual({ current: 0, total: 2 });
    expect(questionPosition(steps, 4)).toEqual({ current: 1, total: 2 });
    expect(questionPosition(steps, 7)).toEqual({ current: 2, total: 2 });
  });

  it('hides the demo badge for reviewed content', () => {
    renderLesson(makeRun({ lesson: { ...LESSON, is_demo: false } }));
    expect(screen.queryByText('Nội dung demo — chưa kiểm duyệt')).not.toBeInTheDocument();
  });

  it('renders explanations with the deep explanation folded and goes back', async () => {
    const run = makeRun({ stepIndex: 1 });
    renderLesson(run);
    expect(screen.getByRole('heading', { level: 1, name: 'Giải thích' })).toBeInTheDocument();
    expect(screen.getByText('Dùng Hello để chào ở mọi tình huống.')).toBeInTheDocument();
    const details = screen.getByText('Giải thích sâu hơn').closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(within(details as HTMLElement).getByText('Hi thân mật hơn Hello.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(run.back).toHaveBeenCalled();
  });

  it('renders examples in the target language', () => {
    renderLesson(makeRun({ stepIndex: 2 }));
    expect(screen.getByRole('heading', { level: 1, name: 'Ví dụ' })).toBeInTheDocument();
    expect(screen.getByText('Hello, Anna!')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Xin chào, Anna!')).toBeInTheDocument();
    expect(screen.getByText('Dùng được ở mọi nơi.')).toBeInTheDocument();
  });

  it('labels common mistakes with text, not only colour', () => {
    renderLesson(makeRun({ stepIndex: 3 }));
    expect(screen.getByRole('heading', { level: 1, name: 'Lỗi thường gặp' })).toBeInTheDocument();
    expect(screen.getByText('Sai:')).toBeInTheDocument();
    expect(screen.getByText('Đúng:')).toBeInTheDocument();
    expect(screen.getByText('Hello you!')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Hello!')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Không thêm you sau Hello.')).toBeInTheDocument();
  });

  it('renders an exercise step through ExerciseFrame', async () => {
    const run = makeRun({ stepIndex: 4 });
    renderLesson(run);
    const frame = screen.getByTestId('exercise-frame');
    expect(frame).toHaveAttribute('data-exercise', EX1);
    expect(frame).toHaveAttribute('data-recheck', 'false');
    expect(run.exerciseState).toHaveBeenCalledWith(EX1, 0);
    // Exercise steps bring their own action bar.
    expect(screen.queryByRole('button', { name: 'Tiếp tục' })).not.toBeInTheDocument();
    await userEvent.click(within(frame).getByRole('button', { name: 'Kiểm tra' }));
    expect(run.submit).toHaveBeenCalledWith(EX1, 0, { option_id: 'a' }, { confidence: null, responseMs: 1200, hintCount: 0 });
    await userEvent.click(within(frame).getByRole('button', { name: 'Tiếp tục câu' }));
    expect(run.next).toHaveBeenCalled();
  });

  it('marks re-check exercises', () => {
    const steps = [...makeRun().steps.slice(0, 6), { kind: 'exercise' as const, exerciseId: EX2, stage: 'recall' as const, recheck: true, queueIndex: 2 }];
    const run = makeRun({ steps, stepIndex: 6 });
    renderLesson(run);
    expect(screen.getByTestId('exercise-frame')).toHaveAttribute('data-recheck', 'true');
    expect(run.exerciseState).toHaveBeenCalledWith(EX2, 2);
    expect(screen.getByText('Làm lại câu sai')).toBeInTheDocument();
  });

  it('summary waits for pending attempts before completing', () => {
    const run = makeRun({ stepIndex: 6, canComplete: false, pendingCount: 2 });
    renderLesson(run);
    expect(screen.getByRole('heading', { level: 1, name: 'Tóm tắt' })).toBeInTheDocument();
    expect(screen.getByText('Hello = xin chào')).toBeInTheDocument();
    expect(screen.getByText('Còn 2 câu đang chờ đồng bộ')).toBeInTheDocument();
    expect(run.complete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled();
  });

  it('summary lists unanswered exercises and jumps back to one with "Làm tiếp"', async () => {
    const recheck = { kind: 'exercise' as const, exerciseId: EX1, stage: 'recognition' as const, recheck: true, queueIndex: 2 };
    const steps = [...makeRun().steps.slice(0, 6), recheck, ...makeRun().steps.slice(6)];
    const run = makeRun({ steps, stepIndex: 7, canComplete: false, unresolved: [5, 6] });
    renderLesson(run);
    expect(screen.getByRole('heading', { level: 1, name: 'Tóm tắt' })).toBeInTheDocument();
    expect(screen.getByText('Còn 2 câu chưa có kết quả. Làm xong để hoàn thành bài học.')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Câu chưa có kết quả' });
    expect(within(list).getAllByRole('listitem').map((li) => li.firstChild?.textContent)).toEqual(['Câu 2', 'Câu 3 (làm lại)']);
    await userEvent.click(within(list).getByRole('button', { name: 'Làm tiếp Câu 3 (làm lại)' }));
    expect(run.goTo).toHaveBeenCalledWith(6);
    expect(run.complete).not.toHaveBeenCalled();
  });

  it('offers "Học lại" on the summary of a completed lesson', async () => {
    const run = makeRun({ stepIndex: 6, runStatus: 'completed', completeResult: COMPLETE_RESULT });
    renderLesson(run);
    expect(screen.getByText('Kết quả của bạn')).toBeInTheDocument();
    expect(run.complete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Học lại' }));
    expect(run.restart).toHaveBeenCalledTimes(1);
  });

  it('has no "Học lại" while the run is in progress', () => {
    renderLesson(makeRun({ stepIndex: 6, completeResult: COMPLETE_RESULT }));
    expect(screen.queryByRole('button', { name: 'Học lại' })).not.toBeInTheDocument();
  });

  it('summary completes the lesson once on enter', async () => {
    const run = makeRun({ stepIndex: 6 });
    renderLesson(run);
    await act(async () => {});
    expect(run.complete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Thử hoàn thành lại' })).not.toBeInTheDocument();
  });

  it('summary shows the completion stats', async () => {
    const run = makeRun({ stepIndex: 6, completeResult: COMPLETE_RESULT });
    renderLesson(run);
    expect(run.complete).not.toHaveBeenCalled();
    expect(screen.getByText('Nhận biết')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('Nhớ lại')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.queryByText('Vận dụng')).not.toBeInTheDocument();
    expect(screen.getByText('Bạn chắc chắn nhưng sai 2 câu')).toBeInTheDocument();
    expect(screen.getByText('1 câu gần đúng')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(run.next).toHaveBeenCalled();
  });

  it('summary offers a retry when completing fails', async () => {
    const complete = vi.fn().mockResolvedValue(null);
    renderLesson(makeRun({ stepIndex: 6, complete }));
    await userEvent.click(await screen.findByRole('button', { name: 'Thử hoàn thành lại' }));
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('shows the next review date and returns home', async () => {
    renderLesson(makeRun({ stepIndex: 7, completeResult: COMPLETE_RESULT }));
    expect(screen.getByRole('heading', { level: 1, name: 'Hoàn thành bài học' })).toBeInTheDocument();
    expect(screen.getByText('15/10/2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Về trang chủ' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/);
  });

  it('opens the exit sheet and keeps learning or leaves', async () => {
    localStorage.setItem('linguo-reduce-motion', 'true');
    renderLesson(makeRun({ stepIndex: 2 }));
    await userEvent.click(screen.getByRole('button', { name: 'Thoát bài học' }));
    const dialog = screen.getByRole('dialog', { name: 'Tiến độ đã được lưu' });
    expect(within(dialog).getByRole('button', { name: 'Học tiếp' })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Học tiếp' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Thoát bài học' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Thoát bài học' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Thoát' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/hoc-tap$/);
  });

  it('shows a loading state', () => {
    renderLesson(makeRun({ status: 'loading', lesson: null, steps: [], step: null }));
    expect(screen.getByText('Đang tải bài học…').closest('[role="status"]')).not.toBeNull();
  });

  it('shows an error with retry', async () => {
    const run = makeRun({ status: 'error', error: 'Không tìm thấy bài học.', lesson: null, steps: [], step: null });
    renderLesson(run);
    expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy bài học.');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(run.retry).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Về danh sách bài' })).toHaveAttribute('href', '/app/hoc-tap');
  });
});
