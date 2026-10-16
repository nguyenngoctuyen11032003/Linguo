import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StepCurrentLevel } from './StepCurrentLevel';
import { StepGoal } from './StepGoal';

describe('onboarding: Japanese levels without a program', () => {
  it('does not offer JLPT N2/N1 as the current level', () => {
    render(<StepCurrentLevel language="ja" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /JLPT N3/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /JLPT N2/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /JLPT N1/ })).not.toBeInTheDocument();
  });

  it('offers targets up to N3 only', () => {
    render(<StepGoal language="ja" currentLevel="n5" goalType="jlpt" onGoal={vi.fn()} onTarget={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /JLPT N4/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /JLPT N3/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /JLPT N2/ })).not.toBeInTheDocument();
  });

  it('explains the ceiling to a learner already at N3', () => {
    render(<StepGoal language="ja" currentLevel="n3" goalType="jlpt" onGoal={vi.fn()} onTarget={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Linguo hiện có bài học tới JLPT N3, các cấp cao hơn sẽ có sau.');
  });
});
