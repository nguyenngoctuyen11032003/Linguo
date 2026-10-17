import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicExercise } from '@linguo/shared';
import type { ExerciseUiState } from '@/features/lesson-player/types';
import { ExerciseFrame } from './index';
import { seededShuffle, seededShuffleAway } from './shuffle';
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

  it('ignores number keys while a modal dialog is open over the exercise', async () => {
    setup(makeExercise('mcq'));
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    try {
      await userEvent.keyboard('2');
      expect(screen.getAllByRole('radio', { hidden: true }).some((r) => r.getAttribute('aria-checked') === 'true')).toBe(false);
    } finally {
      dialog.remove();
    }
    await userEvent.keyboard('2');
    expect(screen.getByRole('radio', { name: /banana/ })).toHaveAttribute('aria-checked', 'true');
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
    for (const name of ['Chưa chắc', 'Hơi chắc', 'Chắc chắn']) expect(chips.getByRole('button', { name })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /apple/ }));
    await userEvent.click(chips.getByRole('button', { name: 'Hơi chắc' }));
    expect(onSubmit).toHaveBeenCalledWith({ option_id: 'o1' }, expect.objectContaining({ confidence: 2, hintCount: 0 }));
  });

  it.each([
    ['Chưa chắc', 1],
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

  it('puts "Thử lại" and "Xem đáp án" on one row so they do not cover the feedback', () => {
    setup(makeExercise('translate'), graded(makeResult()));
    const retry = screen.getByRole('button', { name: 'Thử lại' });
    const giveUp = screen.getByRole('button', { name: 'Xem đáp án' });
    expect(retry.parentElement).toBe(giveUp.parentElement);
    expect(retry.parentElement).toHaveClass('grid-cols-2');
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
  function stubAudio(play: () => Promise<void>) {
    const created: string[] = [];
    vi.stubGlobal(
      'Audio',
      class {
        currentTime = 0;
        constructor(src: string) {
          created.push(src);
        }
        play = play;
      },
    );
    return created;
  }
  const withAudio = () => makeExercise('listen', { prompt: { ...makeExercise('listen').prompt, audio_asset_id: 'en/hello.mp3' } });

  it('keeps the button enabled after a playback failure, offers a retry and shows the transcript', async () => {
    const play = vi.fn().mockRejectedValueOnce(new Error('NotAllowedError')).mockResolvedValue(undefined);
    const created = stubAudio(play);
    setup(withAudio());
    expect(screen.queryByText('Đọc thay vì nghe')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nghe' }));
    const retry = await screen.findByRole('button', { name: 'Không phát được. Thử lại' });
    expect(retry).toBeEnabled();
    expect(screen.getByText('Hello, my name is Lan.')).toBeInTheDocument();

    await userEvent.click(retry);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nghe' })).toBeEnabled());
    expect(screen.queryByText('Đọc thay vì nghe')).not.toBeInTheDocument();
    expect(play).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(2);
  });

  it('renders no audio control when there is none and shows the fallback text', async () => {
    const { onSubmit } = setup(makeExercise('listen'));
    expect(screen.queryByRole('button', { name: /Nghe|audio|Thử lại/ })).not.toBeInTheDocument();
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

  it('describes every blank with the whole sentence, blanks shown as "…"', () => {
    setup(makeExercise('fill_blank'));
    for (const name of ['Chỗ trống 1', 'Chỗ trống 2']) {
      expect(screen.getByRole('textbox', { name })).toHaveAccessibleDescription('I … a student and she … a teacher.');
    }
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

describe('ExerciseFrame — wording', () => {
  it('uses "Nhận biết" for the recognition stage and "Sắp xếp từ" for the word bank', () => {
    setup(makeExercise('word_bank'));
    expect(screen.getByText('Nhận biết')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sắp xếp từ' })).toBeInTheDocument();
    expect(screen.queryByText(/Nhận diện|Ghép câu/)).not.toBeInTheDocument();
  });

  it('shows the three confidence chips with equal weight', () => {
    setup(makeExercise('mcq', {}, 'application'));
    const chips = ['Chưa chắc', 'Hơi chắc', 'Chắc chắn'].map((name) => screen.getByRole('button', { name }));
    for (const chip of chips) {
      expect(chip.className).not.toContain('bg-primary');
      expect(chip.className).toBe(chips[0]!.className);
    }
  });

  it('marks the Korean term inside the spacing hint with lang="ko"', () => {
    setup(makeExercise('translate'), graded(makeResult({ error_tags: ['spacing'] })));
    expect(screen.getByText('띄어쓰기')).toHaveAttribute('lang', 'ko');
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
    expect(screen.getByRole('button', { name: "Bỏ 'am', vị trí 2/3" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Bỏ 'is', vị trí 3/3" }));
    expect(screen.getByText('Đã bỏ is khỏi vị trí 3, còn 2 thẻ trong câu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Thêm 'is'" })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: "Thêm 'a'" }));
    await userEvent.click(screen.getByRole('button', { name: "Thêm 'student'" }));
    await userEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith({ token_ids: ['t1', 't2', 't3', 't4'] }, expect.anything());
  });

  it('works from the keyboard', async () => {
    setup(makeExercise('word_bank'));
    const [first, second] = within(screen.getByRole('group', { name: 'Các thẻ từ' })).getAllByRole('button');
    const text = first!.textContent;
    await userEvent.tab();
    expect(first).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: `Bỏ '${text}', vị trí 1/1` })).toBeInTheDocument();
    expect(screen.getByText(`Đã thêm ${text}, vị trí 1`)).toBeInTheDocument();
    expect(second).toHaveFocus();
  });

  it('shows the bank shuffled by run and exercise, never in answer order, stable across renders', () => {
    const exercise = makeExercise('word_bank');
    const RUN = '40000000-0000-4000-8000-000000000001';
    const props = { exercise, state: IDLE, recheck: false, onSubmit: vi.fn(), onContinue: vi.fn() };
    const view = renderExercise(<ExerciseFrame {...props} runId={RUN} />);
    const bankOrder = () => within(screen.getByRole('group', { name: 'Các thẻ từ' })).getAllByRole('button').map((b) => b.textContent);
    const authored = ['I', 'am', 'a', 'student', 'is'];
    const shown = bankOrder();
    expect(shown).not.toEqual(authored);
    expect([...shown].sort()).toEqual([...authored].sort());
    const ids = seededShuffleAway(['t1', 't2', 't3', 't4', 't5'], `${RUN}:${exercise.id}`);
    expect(shown).toEqual(ids.map((id) => authored[Number(id.slice(1)) - 1]));
    view.rerender(<ExerciseFrame {...props} runId={RUN} state={{ ...IDLE }} />);
    expect(bankOrder()).toEqual(shown);
  });
});

describe('ExerciseFrame — German answers', () => {
  it('translate into German: heading, lang and the ä ö ü ß keys feed the answer', async () => {
    const { onSubmit } = setup(makeExercise('translate', { answer_lang: 'de' }));
    expect(screen.getByRole('heading', { name: 'Dịch sang tiếng Đức' })).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Bản dịch của bạn' });
    expect(input).toHaveAttribute('lang', 'de');
    expect(screen.getByRole('group', { name: 'Chèn chữ cái tiếng Đức' })).toHaveAccessibleDescription(/ae, oe, ue, ss/);
    await userEvent.type(input, 'Gr');
    await userEvent.click(screen.getByRole('button', { name: 'Chèn ü' }));
    await userEvent.click(screen.getByRole('button', { name: 'Chèn ß (eszett)' }));
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ text: 'Grüß' }, expect.objectContaining({ confidence: null }));
  });

  it('fill_blank in German offers the keys once, under the sentence', async () => {
    setup(makeExercise('fill_blank', { answer_lang: 'de' }));
    expect(screen.getAllByRole('group', { name: 'Chèn chữ cái tiếng Đức' })).toHaveLength(1);
  });

  it('no keys for English, Korean, or choice exercises', () => {
    setup(makeExercise('translate'));
    expect(screen.queryByRole('group', { name: 'Chèn chữ cái tiếng Đức' })).not.toBeInTheDocument();
  });

  it('no keys on a German mcq', () => {
    setup(makeExercise('mcq', { answer_lang: 'de' }));
    expect(screen.queryByRole('group', { name: 'Chèn chữ cái tiếng Đức' })).not.toBeInTheDocument();
  });

  it('feedback names the German article and cases, with lang="de" on the German words', () => {
    setup(makeExercise('translate', { answer_lang: 'de' }), graded(makeResult({ verdict: 'incorrect', is_correct: false, error_tags: ['article', 'case_dat_akk'] })));
    expect(screen.getByText('der/die/das')).toHaveAttribute('lang', 'de');
    expect(screen.getByText('Akkusativ')).toHaveAttribute('lang', 'de');
    expect(screen.queryByText('a/an/the', { exact: false })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Chưa chắc' })).toHaveFocus();
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

  it('sends once when Enter and "Kiểm tra" both wait for the same composition', async () => {
    const { onSubmit } = setup(makeExercise('translate', { answer_lang: 'ko' }));
    const input = screen.getByRole('textbox');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '학생' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(check());
    fireEvent.compositionEnd(input);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 100));
    expect(onSubmit).toHaveBeenCalledTimes(1);
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
