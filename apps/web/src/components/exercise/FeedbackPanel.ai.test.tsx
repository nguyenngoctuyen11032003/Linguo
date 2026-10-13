import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiRequestInput } from '@linguo/shared';
import { stubMatchMedia } from '../../../tests/unit/match-media';
import type { ExerciseAiInput } from './ai-context';
import { ExerciseFrame } from './ExerciseFrame';
import { FeedbackPanel } from './FeedbackPanel';
import { graded, makeExercise, makeResult } from './test-fixtures';
import { renderExercise } from './test-utils';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  request: AiRequestInput;
  fallback?: { title: string; body: string };
}

const sheet = vi.hoisted(() => ({ last: null as SheetProps | null }));

vi.mock('@/components/ai', () => ({
  AiExplainSheet: (props: SheetProps) => {
    sheet.last = props;
    return props.open ? (
      <div role="dialog" aria-label="AI sheet">
        <span data-testid="ai-task">{props.request.task}</span>
        <button type="button" onClick={props.onClose}>
          Đóng
        </button>
      </div>
    ) : null;
  },
}));

const LESSON_ID = '20000000-0000-4000-8000-000000000001';
const AI: ExerciseAiInput = {
  ai: { language: 'en', level: 'a1', lessonId: LESSON_ID, concept: 'To be — am', curated: { title: 'To be', body: 'I đi với am.' } },
  prompt: 'Dịch: Tôi là học sinh.',
  answer: 'I is student',
};

beforeEach(() => {
  stubMatchMedia(() => false);
  sheet.last = null;
});

describe('FeedbackPanel AI tutor buttons', () => {
  it('hides them while the learner may still retry', () => {
    renderExercise(<FeedbackPanel result={makeResult()} ai={AI} />);
    expect(screen.queryByRole('button', { name: 'Vì sao?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Giải thích AI' })).not.toBeInTheDocument();
  });

  it('hides them without lesson context', () => {
    renderExercise(<FeedbackPanel result={makeResult({ revealed: true, display_answer: 'I am a student.' })} />);
    expect(screen.queryByRole('button', { name: 'Giải thích AI' })).not.toBeInTheDocument();
  });

  it('keeps the buttons out of the live region', () => {
    renderExercise(<FeedbackPanel result={makeResult({ revealed: true, display_answer: 'I am a student.' })} ai={AI} />);
    const region = screen.getByRole('status');
    expect(region).not.toContainElement(screen.getByRole('button', { name: 'Vì sao?' }));
  });

  it('"Vì sao?" opens analyze_error with the revealed answer', async () => {
    renderExercise(
      <FeedbackPanel result={makeResult({ revealed: true, final: true, display_answer: 'I am a student.', explanation: { vi: 'Am đi với I.' } })} ai={AI} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Vì sao?' }));
    expect(screen.getByTestId('ai-task')).toHaveTextContent('analyze_error');
    expect(sheet.last?.request).toMatchObject({ prompt: AI.prompt, expected: 'I am a student.', answer: 'I is student', lesson_id: LESSON_ID });
    expect(sheet.last?.fallback).toEqual({ title: 'Giải thích trong bài', body: 'Am đi với I.' });
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Giải thích AI" opens explain_concept with the curated lesson text as fallback', async () => {
    renderExercise(<FeedbackPanel result={makeResult({ verdict: 'correct', is_correct: true, final: true })} ai={AI} />);
    await userEvent.click(screen.getByRole('button', { name: 'Giải thích AI' }));
    expect(sheet.last?.request).toEqual({ task: 'explain_concept', language: 'en', level: 'a1', lesson_id: LESSON_ID, concept: 'To be — am' });
    expect(sheet.last?.fallback).toEqual({ title: 'To be', body: 'I đi với am.' });
  });
});

describe('ExerciseFrame AI context', () => {
  it('sends the question and the learner answer that was graded', async () => {
    const exercise = makeExercise('mcq');
    const onSubmit = vi.fn();
    const ai = AI.ai;
    const { rerender } = renderExercise(
      <ExerciseFrame exercise={exercise} state={{ status: 'idle', attempts: 0, lastResult: null }} recheck={false} onSubmit={onSubmit} onContinue={() => {}} ai={ai} />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'banana' }));
    await userEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    expect(onSubmit).toHaveBeenCalled();
    const result = makeResult({ revealed: true, final: true, display_answer: 'apple' });
    rerender(<ExerciseFrame exercise={exercise} state={graded(result)} recheck={false} onSubmit={onSubmit} onContinue={() => {}} ai={ai} />);
    await userEvent.click(screen.getByRole('button', { name: 'Vì sao?' }));
    expect(sheet.last?.request).toMatchObject({
      task: 'analyze_error',
      prompt: 'Chọn từ có nghĩa là "táo" (apple / banana / cherry)',
      expected: 'apple',
      answer: 'banana',
    });
  });
});
