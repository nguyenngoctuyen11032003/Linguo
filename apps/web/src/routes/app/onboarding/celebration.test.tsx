import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { OnboardingCelebration } from './OnboardingCelebration';

afterEach(() => localStorage.clear());

const render = (path = TEST_PATH) => renderWithProviders(<OnboardingCelebration path={path} onDone={vi.fn()} />, { route: '/app/bat-dau' });
const visible = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('[aria-hidden="true"]'))
    .map((n) => n.textContent)
    .join('|');
const spoken = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('.sr-only'))
    .map((n) => n.textContent)
    .join('|');

describe('OnboardingCelebration', () => {
  it('counts the estimate up from zero, while screen readers get the final numbers', () => {
    render();
    const estimate = screen.getByTestId('celebration-estimate');
    // TEST_PATH: 43–69 weeks, shown as "khoảng 10–16 tháng".
    expect(visible(estimate)).toBe('0|0');
    expect(spoken(estimate)).toBe('10|16');
    expect(estimate).toHaveTextContent(/Ước lượng khoảng .*tháng để đạt B1\./);
  });

  it('shows the final estimate at once when motion is reduced', () => {
    localStorage.setItem('linguo-reduce-motion', 'true');
    render();
    const estimate = screen.getByTestId('celebration-estimate');
    expect(visible(estimate)).toBe('10|16');
  });

  it('counts a single value when the range collapses', () => {
    localStorage.setItem('linguo-reduce-motion', 'true');
    render({ ...TEST_PATH, estimate: { ...TEST_PATH.estimate, weeksMin: 6, weeksMax: 6 } });
    const estimate = screen.getByTestId('celebration-estimate');
    expect(visible(estimate)).toBe('6');
    expect(estimate.textContent).not.toContain('–');
    expect(estimate).toHaveTextContent(/tuần để đạt B1\./);
  });
});
