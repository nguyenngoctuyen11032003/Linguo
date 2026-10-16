import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { THEMES, type ThemePreference } from '@linguo/shared';
import { readString, writeString } from '@/lib/storage';
import { APP_STYLES, parseAppStyle, STYLE_STORAGE_KEY, type AppStyle } from '@/lib/app-style';
import { syncThemeColor } from '@/lib/theme-color';
import { useMediaQuery } from '@/lib/useMediaQuery';

export type ResolvedTheme = 'light' | 'dark';
const STORAGE_KEY = 'linguo-theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  style: AppStyle;
  setStyle: (style: AppStyle) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

function readPreference(): ThemePreference {
  const stored = readString(STORAGE_KEY);
  return (THEMES as readonly string[]).includes(stored ?? '') ? (stored as ThemePreference) : 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [style, setStyleState] = useState<AppStyle>(() => parseAppStyle(readString(STYLE_STORAGE_KEY)));
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolved = resolveTheme(preference, systemDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    syncThemeColor(preference, resolved);
  }, [preference, resolved]);

  useEffect(() => {
    document.documentElement.dataset.style = style;
  }, [style]);

  const setStyle = useCallback((next: AppStyle) => {
    if (!APP_STYLES.includes(next)) return;
    setStyleState(next);
    writeString(STYLE_STORAGE_KEY, next);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeString(STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, style, setStyle }),
    [preference, resolved, setPreference, style, setStyle],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
