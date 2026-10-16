import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StepCurrentLevel } from './StepCurrentLevel';
import { StepGoal } from './StepGoal';

describe('onboarding: Japanese levels', () => {
  it('offers every JLPT level as the current level', () => {
    render(<StepCurrentLevel language="ja" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /JLPT N3/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /JLPT N2/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /JLPT N1/ })).toBeInTheDocument();
  });

  it('offers targets up to N1', () => {
    render(<StepGoal language="ja" currentLevel="n3" goalType="jlpt" onGoal={vi.fn()} onTarget={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /JLPT N2/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /JLPT N1/ })).toBeInTheDocument();
    expect(screen.queryByText(/các cấp cao hơn sẽ có sau/)).not.toBeInTheDocument();
  });
});
