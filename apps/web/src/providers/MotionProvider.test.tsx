import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { stubMatchMedia } from '../../tests/unit/match-media';
import { MotionProvider, useMotionPrefs } from './MotionProvider';

function Probe() {
  const { reduceMotion, setUserReduceMotion } = useMotionPrefs();
  return (
    <button onClick={() => setUserReduceMotion(true)} data-testid="probe">
      {String(reduceMotion)}
    </button>
  );
}

describe('MotionProvider', () => {
  it('reduces motion when the user opts in', () => {
    stubMatchMedia(() => false);
    render(
      <MotionProvider>
        <Probe />
      </MotionProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('false');
    act(() => screen.getByTestId('probe').click());
    expect(screen.getByTestId('probe')).toHaveTextContent('true');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
    expect(localStorage.getItem('lp-reduce-motion')).toBe('true');
  });

  it('honours prefers-reduced-motion', () => {
    stubMatchMedia((q) => q.includes('prefers-reduced-motion'));
    render(
      <MotionProvider>
        <Probe />
      </MotionProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('true');
  });
});
