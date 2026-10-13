import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../tests/unit/render';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { markLocalPreferenceEdit } from './local-edits';
import { usePreferencesSync } from './usePreferencesSync';

const mocks = vi.hoisted(() => ({ fetchPreferences: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
vi.mock('./service', () => ({ fetchPreferences: mocks.fetchPreferences }));

function Probe() {
  usePreferencesSync();
  const theme = useTheme();
  const motion = useMotionPrefs();
  return (
    <>
      <output data-testid="prefs">{`${theme.preference}:${motion.userReduceMotion}`}</output>
      <button
        type="button"
        onClick={() => {
          markLocalPreferenceEdit();
          theme.setPreference('light');
        }}
      >
        Chọn sáng
      </button>
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.fetchPreferences.mockReset();
});

describe('usePreferencesSync', () => {
  it('adopts the server preferences when nothing changed locally', async () => {
    mocks.fetchPreferences.mockResolvedValue({ theme: 'dark', reduceMotion: true });
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('prefs')).toHaveTextContent('dark:true'));
  });

  it('does not overwrite a choice the user made while the fetch was in flight', async () => {
    const pending = deferred<{ theme: string; reduceMotion: boolean }>();
    mocks.fetchPreferences.mockReturnValue(pending.promise);
    renderWithProviders(<Probe />);
    await userEvent.click(screen.getByRole('button', { name: 'Chọn sáng' }));
    expect(screen.getByTestId('prefs')).toHaveTextContent('light:false');

    await act(async () => {
      pending.resolve({ theme: 'dark', reduceMotion: true });
      await pending.promise;
    });
    expect(screen.getByTestId('prefs')).toHaveTextContent('light:false');
  });
});
