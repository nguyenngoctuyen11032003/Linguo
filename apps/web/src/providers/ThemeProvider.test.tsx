import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { stubMatchMedia } from '../../tests/unit/match-media';
import { resolveTheme, ThemeProvider, useTheme } from './ThemeProvider';

function Probe() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="state">{`${preference}:${resolved}`}</span>
      <button onClick={() => setPreference('dark')}>dark</button>
    </div>
  );
}

describe('resolveTheme', () => {
  it('follows the system for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('ThemeProvider', () => {
  it('applies the resolved theme to <html> and persists changes', () => {
    stubMatchMedia(() => false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('system:light');
    expect(document.documentElement.dataset.theme).toBe('light');

    act(() => screen.getByText('dark').click());
    expect(screen.getByTestId('state')).toHaveTextContent('dark:dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('lp-theme')).toBe('dark');
  });
});
