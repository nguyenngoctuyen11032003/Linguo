import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Rating } from '@linguo/shared';
import { renderExercise } from '../exercise/test-utils';
import { RatingBar } from './RatingBar';
import { PREVIEWS } from './test-fixtures';

describe('RatingBar', () => {
  it('labels each grade with its word and formatted interval', () => {
    renderExercise(<RatingBar previews={PREVIEWS} onRate={vi.fn()} revealed />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Quên, ôn lại sau <1 phút',
      'Khó, ôn lại sau 10 phút',
      'Được, ôn lại sau 3 ngày',
      'Dễ, ôn lại sau 2 tháng',
    ]);
    expect(screen.getByRole('button', { name: /^Được/ })).toHaveTextContent('Được3 ngày');
  });

  it('does not rely on colour: every button shows its own text and key', () => {
    renderExercise(<RatingBar previews={PREVIEWS} onRate={vi.fn()} revealed />);
    const buttons = screen.getAllByRole('button');
    const texts = buttons.map((b) => b.textContent);
    expect(new Set(texts).size).toBe(4);
    buttons.forEach((button, i) => {
      expect(button).toHaveAttribute('aria-keyshortcuts', String(i + 1));
      expect(button.textContent).toContain(['Quên', 'Khó', 'Được', 'Dễ'][i]);
    });
  });

  it('uses ≥48px tap targets', () => {
    renderExercise(<RatingBar previews={PREVIEWS} onRate={vi.fn()} revealed />);
    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('min-h-14');
  });

  it('rates with a tap', async () => {
    const onRate = vi.fn();
    renderExercise(<RatingBar previews={PREVIEWS} onRate={onRate} revealed />);
    await userEvent.click(screen.getByRole('button', { name: /^Khó/ }));
    expect(onRate).toHaveBeenCalledWith(2);
  });

  it('rates with keys 1–4 after the flip', async () => {
    const onRate = vi.fn();
    renderExercise(<RatingBar previews={PREVIEWS} onRate={onRate} revealed />);
    await userEvent.keyboard('1');
    await userEvent.keyboard('4');
    await userEvent.keyboard('5');
    expect(onRate.mock.calls).toEqual([[1], [4]]);
  });

  it('ignores keys and taps before the flip', async () => {
    const onRate = vi.fn();
    renderExercise(<RatingBar previews={PREVIEWS} onRate={onRate} revealed={false} />);
    await userEvent.keyboard('3');
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(onRate).not.toHaveBeenCalled();
    expect(screen.getByText('Lật thẻ để chấm')).toBeInTheDocument();
  });

  it('is disabled while submitting, so a grade cannot be sent twice', async () => {
    function Harness({ onRate }: { onRate: (rating: Rating) => void }) {
      const [submitting, setSubmitting] = useState(false);
      return (
        <RatingBar
          previews={PREVIEWS}
          revealed
          submitting={submitting}
          onRate={(rating) => {
            setSubmitting(true);
            onRate(rating);
          }}
        />
      );
    }
    const onRate = vi.fn();
    renderExercise(<Harness onRate={onRate} />);
    await userEvent.keyboard('3');
    await userEvent.keyboard('3');
    await userEvent.click(screen.getByRole('button', { name: /^Dễ/ }));
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('group')).toHaveAttribute('aria-busy', 'true');
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('ignores digits typed into a text field', async () => {
    const onRate = vi.fn();
    renderExercise(
      <>
        <input aria-label="ghi chú" />
        <RatingBar previews={PREVIEWS} onRate={onRate} revealed />
      </>,
    );
    await userEvent.type(screen.getByLabelText('ghi chú'), '2');
    expect(onRate).not.toHaveBeenCalled();
  });
});
