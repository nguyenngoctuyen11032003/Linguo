import type { ThemePreference } from '@linguo/shared';

type ResolvedTheme = 'light' | 'dark';

/** Browser chrome colour per theme (= --bg in design/tokens.css; index.html carries the same values). */
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#f3f1ec', dark: '#070b12' };

/**
 * The <meta name="theme-color"> tags follow the system scheme through their media queries; an explicit in-app
 * choice overrides both so the status bar matches the page. "system" restores the per-scheme colours.
 */
export function syncThemeColor(preference: ThemePreference, resolved: ResolvedTheme): void {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const media = meta.getAttribute('media') ?? '';
    const scheme: ResolvedTheme = media.includes('dark') ? 'dark' : media.includes('light') ? 'light' : resolved;
    meta.content = THEME_COLORS[preference === 'system' ? scheme : resolved];
  }
}
