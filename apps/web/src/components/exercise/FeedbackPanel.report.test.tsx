import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmitResult } from '@linguo/shared';
import { stubMatchMedia } from '../../../tests/unit/match-media';
import { ExerciseFrame } from './ExerciseFrame';
import { FeedbackPanel } from './FeedbackPanel';
import { graded, IDLE, makeExercise, makeResult } from './test-fixtures';
import { renderExercise } from './test-utils';

vi.mock('@/lib/supabase', () => ({ getSupabase: () => null, requireSupabase: () => null }));

const EXERCISE_ID = '30000000-0000-4000-8000-000000000001';
const REPORT = { kind: 'exercise' as const, id: EXERCISE_ID };

beforeEach(() => stubMatchMedia(() => false));

describe('FeedbackPanel content report button', () => {
  it('appears under a result, outside the live region', () => {
    renderExercise(<FeedbackPanel result={makeResult()} report={REPORT} />);
    const button = screen.getByRole('button', { name: 'Báo lỗi nội dung' });
    expect(within(screen.getByRole('status')).queryByRole('button', { name: 'Báo lỗi nội dung' })).toBeNull();
    expect(button).not.toHaveFocus();
  });

  it('is hidden without a result or without a report target', () => {
    const { rerender } = renderExercise(<FeedbackPanel result={null} report={REPORT} />);
    expect(screen.queryByRole('button', { name: 'Báo lỗi nội dung' })).not.toBeInTheDocument();
    rerender(<FeedbackPanel result={makeResult()} />);
    expect(screen.queryByRole('button', { name: 'Báo lỗi nội dung' })).not.toBeInTheDocument();
  });

  it('leaves focus on the verdict heading when a new result arrives', async () => {
    function Harness() {
      const [result, setResult] = useState<SubmitResult | null>(null);
      return (
        <>
          <button type="button" onClick={() => setResult(makeResult())}>
            Kiểm tra
          </button>
          <FeedbackPanel result={result} report={REPORT} />
        </>
      );
    }
    renderExercise(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    expect(screen.getByRole('heading', { name: 'Chưa đúng' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Báo lỗi nội dung' })).toBeInTheDocument();
  });
});

describe('ExerciseFrame reportable', () => {
  const exercise = makeExercise('mcq', { id: EXERCISE_ID });
  const frame = (reportable?: boolean) => (
    <ExerciseFrame
      exercise={exercise}
      state={graded(makeResult({ verdict: 'correct', is_correct: true, final: true }))}
      recheck={false}
      onSubmit={() => {}}
      onContinue={() => {}}
      reportable={reportable}
    />
  );

  it('reports the exercise from the feedback on learner screens', async () => {
    renderExercise(frame(true));
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi nội dung' }));
    expect(screen.getByRole('dialog', { name: 'Báo lỗi nội dung' })).toBeInTheDocument();
  });

  it('hides the button by default (admin previews) and before grading', () => {
    const { rerender } = renderExercise(frame());
    expect(screen.queryByRole('button', { name: 'Báo lỗi nội dung' })).not.toBeInTheDocument();
    rerender(
      <ExerciseFrame exercise={exercise} state={IDLE} recheck={false} onSubmit={() => {}} onContinue={() => {}} reportable />,
    );
    expect(screen.queryByRole('button', { name: 'Báo lỗi nội dung' })).not.toBeInTheDocument();
  });
});
