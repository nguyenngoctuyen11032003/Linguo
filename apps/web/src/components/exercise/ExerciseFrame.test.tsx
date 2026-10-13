import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicExercise } from '@linguo/shared';
import type { ExerciseUiState } from '@/features/lesson-player/types';
import { ExerciseFrame } from './index';
import { seededShuffle } from './shuffle';
import { graded, IDLE, makeExercise, makeResult } from './test-fixtures';
import { renderExercise } from './test-utils';

function setup(exercise: PublicExercise, state: ExerciseUiState = IDLE, recheck = false) {
  const onSubmit = vi.fn();
  const onContinue = vi.fn();
  const view = renderExercise(
    <ExerciseFrame exercise={exercise} state={state} recheck={recheck} onSubmit={onSubmit} onContinue={onContinue} />,
  );
  const update = (next: ExerciseUiState) =>
    view.rerender(<ExerciseFrame exercise={exercise} state={next} recheck={recheck} onSubmit={onSubmit} onContinue={onContinue} />);
  return { onSubmit, onContinue, update };
}

const check = () => screen.getByRole('button', { name: 'Kiểm tra' });

afterEach(() => vi.restoreAllMocks());

describe('ExerciseFrame — mcq', () => {
  it('disables "Kiểm tra" until an option is picked, then submits with recognition meta', async () => {
    const { onSubmit } = setup(makeExercise('mcq'));
    expect(check()).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /apple/ }));
    expect(screen.getByRole('radio', { name: /apple/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith({ option_id: 'o1' }, { confidence: null, responseMs: expect.any(Number), hintCount: 0 });
    const meta = onSubmit.mock.calls[0]![1];
    expect(Number.isInteger(meta.responseMs)).toBe(true);
  });

  it('measures responseMs from the first render', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { onSubmit } = setup(makeExercise('mcq'));
    now = 4_250;
    await userEvent.click(screen.getByRole('radio', { name: /banana/ }));
    await userEvent.click(check());
    expect(onSubmit.mock.calls[0]![1].responseMs).toBe(3_250);
  });

  it('is a radiogroup labelled by the stem with arrow-key and number-key selection', async () => {
    setup(makeExercise('mcq'));
    const group = screen.getByRole('radiogroup', { name: 'Chọn từ có nghĩa là "táo"' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    await userEvent.tab();
    expect(radios[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(radios[2]).toHaveFocus();
    expect(radios[2]).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('1');
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAttribute('tabindex', '0');
    expect(radios[2]).toHaveAttribute('tabindex', '-1');
  });

  it('shuffles options with a seed derived from the exercise id', () => {
    const exercise = makeExercise('mcq', {
      prompt: {
        stem: 'Pick',
        stem_lang: 'en',
        options: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, text: `opt ${id}`, lang: 'en' })),
        shuffle: true,
      },
    });
    setup(exercise);
    const expected = seededShuffle(['a', 'b', 'c', 'd', 'e', 'f'], exercise.id).map((id) => `opt ${id}`);
    expect(screen.getAllByRole('radio').map((r) => r.querySelector('[lang]')?.textContent)).toEqual(expected);
  });

  it('marks "Bạn chọn" and "Đáp án đúng" after a revealed result', async () => {
    const { update } = setup(makeExercise('mcq'));
    await userEvent.click(screen.getByRole('radio', { name: /banana/ }));
    await userEvent.click(check());
    update(graded(makeResult({ attempt_no: 2, revealed: true, final: true, display_answer: 'apple' }), 2));
    expect(within(screen.getByRole('radio', { name: /banana/ })).getByText('Bạn chọn')).toBeInTheDocument();
    expect(within(screen.getByRole('radio', { name: /apple/ })).getByText('Đáp án đúng')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
  });

  it('moves focus to the feedback heading when the verdict arrives', async () => {
    const { update } = setup(makeExercise('mcq'));
    await userEvent.click(screen.getByRole('radio', { name: /apple/ }));
    await userEvent.click(check());
    update({ status: 'submitting', attempts: 0, lastResult: null });
    expect(check()).toBeDisabled();
    update(graded(makeResult({ verdict: 'correct', is_correct: true, score: 1, final: true, display_answer: 'apple' })));
    expect(screen.getByRole('heading', { name: 'Chính xác' })).toHaveFocus();
  });
});

describe('ExerciseFrame — flow', () => {
  it('uses confidence chips in recall and sends the chosen level', async () => {
    const { onSubmit } = setup(makeExercise('mcq', {}, 'recall'));
    expect(screen.queryByRole('button', { name: 'Kiểm tra' })).not.toBeInTheDocument();
    const chips = within(screen.getByRole('group', { name: /Bạn chắc đến đâu/ }));
    for (const name of ['Đoán', 'Hơi chắc', 'Chắc chắn']) expect(chips.getByRole('button', { name })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /apple/ }));
    await userEvent.click(chips.getByRole('button', { name: 'Hơi chắc' }));
    expect(onSubmit).toHaveBeenCalledWith({ option_id: 'o1' }, expect.objectContaining({ confidence: 2, hintCount: 0 }));
  });

  it.each([
    ['Đoán', 1],
    ['Chắc chắn', 3],
  ] as const)('chip %s submits confidence %i', async (name, confidence) => {
    const { onSubmit } = setup(makeExercise('mcq', {}, 'application'));
    await userEvent.click(screen.getByRole('radio', { name: /apple/ }));
    await userEvent.click(screen.getByRole('button', { name }));
    expect(onSubmit.mock.calls[0]![1].confidence).toBe(confidence);
  });

  it('offers "Thử lại" and "Xem đáp án" after one incorrect attempt', async () => {
    const exercise = makeExercise('mcq');
    const { onSubmit, update } = setup(exercise);
    expect(screen.queryByRole('button', { name: 'Xem đáp án' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /banana/ }));
    await userEvent.click(check());
    update(graded(makeResult({ feedback_vi: 'Banana là chuối.' })));
    expect(screen.getByRole('heading', { name: 'Chưa đúng' })).toHaveFocus();
    expect(screen.getByText('Banana là chuối.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(screen.queryByRole('heading', { name: 'Chưa đúng' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(check()).toBeDisabled();
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Xem đáp án' }));
    expect(onSubmit).toHaveBeenLastCalledWith({ give_up: true }, expect.objectContaining({ confidence: null }));
  });

  it('can give up straight from the feedback view', async () => {
    const { onSubmit } = setup(makeExercise('translate'), graded(makeResult()));
    await userEvent.click(screen.getByRole('button', { name: 'Xem đáp án' }));
    expect(onSubmit).toHaveBeenCalledWith({ give_up: true }, expect.anything());
  });

  it('shows "Tiếp tục" once the result is final', async () => {
    const { onContinue } = setup(
      makeExercise('translate'),
      graded(makeResult({ verdict: 'almost', is_correct: true, score: 0.8, final: true, error_tags: ['typo'], display_answer: 'I am a student.' })),
    );
    expect(screen.getByRole('heading', { name: 'Gần đúng' })).toBeInTheDocument();
    expect(screen.getByText('Đúng ý nhưng sai chính tả')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('shows the pending badge, hides any verdict and lets the learner continue while waiting for sync', async () => {
    const { onContinue } = setup(makeExercise('translate'), { status: 'pending_sync', attempts: 0, lastResult: null });
    expect(screen.getByText('Đang chờ đồng bộ — sẽ chấm khi có mạng')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Chính xác|Gần đúng|Chưa đúng/ })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(onContinue).toHaveBeenCalled();
  });

  it('keeps the answer and lets the learner send it again when a submit could not be saved', async () => {
    const { onSubmit, update } = setup(makeExercise('mcq'));
    await userEvent.click(screen.getByRole('radio', { name: /banana/ }));
    await userEvent.click(check());
    update({ status: 'submitting', attempts: 0, lastResult: null });
    expect(screen.queryByText('Đang chờ đồng bộ — sẽ chấm khi có mạng')).not.toBeInTheDocument();
    // The outbox write failed: the entry goes back to idle, never to pending_sync.
    update(IDLE);
    expect(screen.getByRole('radio', { name: /banana/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Đang chờ đồng bộ — sẽ chấm khi có mạng')).not.toBeInTheDocument();
    await userEvent.click(check());
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('shows an inline error with "Tiếp tục" for an invalid prompt', async () => {
    const { onContinue } = setup(makeExercise('mcq', { prompt: { stem: 'x' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Bài tập bị lỗi định dạng');
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(onContinue).toHaveBeenCalled();
  });

  it('labels a re-check entry', () => {
    setup(makeExercise('mcq'), IDLE, true);
    expect(screen.getByText('Làm lại')).toBeInTheDocument();
  });
});

describe('ExerciseFrame — listen', () => {
  it('disables audio when there is none and shows the fallback text', async () => {
    const { onSubmit } = setup(makeExercise('listen'));
    expect(screen.getByRole('button', { name: 'Chưa có audio' })).toBeDisabled();
    expect(screen.getByText('Hello, my name is Lan.')).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Nghe và chọn nghĩa đúng' });
    await userEvent.click(within(group).getByRole('radio', { name: /Xin chào/ }));
    await userEvent.keyboard('2');
    expect(within(group).getByRole('radio', { name: /Tạm biệt/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith({ option_id: 'l2' }, expect.anything());
  });
});

describe('ExerciseFrame — fill_blank', () => {
  it('labels each blank, requires all blanks and moves through them with Enter', async () => {
    const { onSubmit } = setup(makeExercise('fill_blank'));
    const b1 = screen.getByRole('textbox', { name: 'Chỗ trống 1' });
    const b2 = screen.getByRole('textbox', { name: 'Chỗ trống 2' });
    expect(b1).toHaveAttribute('lang', 'en');
    await userEvent.type(b1, 'am{Enter}');
    expect(b2).toHaveFocus();
    expect(check()).toBeDisabled();
    await userEvent.type(b2, 'is{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ blanks: { b1: 'am', b2: 'is' } }, expect.objectContaining({ hintCount: 0 }));
  });

  it('reveals hints progressively in recognition and counts them', async () => {
    const { onSubmit } = setup(makeExercise('fill_blank'));
    await userEvent.click(screen.getByRole('button', { name: 'Gợi ý (1/2)' }));
    expect(screen.getByText('Tôi là học sinh và cô ấy là giáo viên.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Gợi ý thêm (2/2)' }));
    expect(screen.getByText('am / is')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gợi ý/ })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Chỗ trống 1' }), 'am');
    await userEvent.type(screen.getByRole('textbox', { name: 'Chỗ trống 2' }), 'is');
    await userEvent.click(check());
    expect(onSubmit.mock.calls[0]![1].hintCount).toBe(2);
  });

  it('has no hints outside recognition', () => {
    setup(makeExercise('fill_blank', {}, 'recall'));
    expect(screen.queryByRole('button', { name: /Gợi ý/ })).not.toBeInTheDocument();
  });
});

describe('ExerciseFrame — word_bank', () => {
  it('places and removes tokens by tapping and announces positions', async () => {
    const { onSubmit } = setup(makeExercise('word_bank'));
    expect(check()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: "Thêm 'I'" }));
    await userEvent.click(screen.getByRole('button', { name: "Thêm 'am'" }));
    expect(screen.getByText('Đã thêm am, vị trí 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Thêm 'am'" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Thêm 'is'" }));
    await userEvent.click(screen.getByRole('button', { name: "Bỏ 'is'" }));
    expect(screen.getByText('Đã bỏ is')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Thêm 'is'" })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: "Thêm 'a'" }));
    await userEvent.click(screen.getByRole('button', { name: "Thêm 'student'" }));
    await userEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith({ token_ids: ['t1', 't2', 't3', 't4'] }, expect.anything());
  });

  it('works from the keyboard', async () => {
    setup(makeExercise('word_bank'));
    await userEvent.tab();
    expect(screen.getByRole('button', { name: "Thêm 'I'" })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: "Bỏ 'I'" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Thêm 'am'" })).toHaveFocus();
  });
});

describe('ExerciseFrame — translate', () => {
  it('renders the source with its language and submits on Enter', async () => {
    const { onSubmit } = setup(makeExercise('translate'));
    expect(screen.getByRole('heading', { name: 'Dịch sang tiếng Anh' })).toBeInTheDocument();
    expect(screen.getByText('Tôi là học sinh.')).toHaveAttribute('lang', 'vi');
    const input = screen.getByRole('textbox', { name: 'Bản dịch của bạn' });
    expect(input).toHaveAttribute('lang', 'en');
    await userEvent.type(input, '   {Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.type(input, 'I am a student{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ text: '   I am a student' }, expect.objectContaining({ confidence: null }));
  });

  it('asks for a confidence level when Enter is pressed in recall', async () => {
    const { onSubmit } = setup(makeExercise('translate', {}, 'recall'));
    await userEvent.type(screen.getByRole('textbox'), 'I am a student{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Đoán' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Gợi ý/ })).not.toBeInTheDocument();
  });

  it('waits for compositionend before reading the answer (Korean IME)', async () => {
    const { onSubmit } = setup(makeExercise('translate', { answer_lang: 'ko' }));
    const input = screen.getByRole('textbox');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '학' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.click(check());
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '학생' } });
    fireEvent.compositionEnd(input);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ text: '학생' }, expect.anything());
  });

  it('falls back after 80 ms when compositionend never fires', async () => {
    const { onSubmit } = setup(makeExercise('translate', { answer_lang: 'ko' }));
    const input = screen.getByRole('textbox');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '학생' } });
    fireEvent.click(check());
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ text: '학생' }, expect.anything()));
  });
});
