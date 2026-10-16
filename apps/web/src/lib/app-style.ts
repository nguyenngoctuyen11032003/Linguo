/** Visual style (independent of the light/dark theme). Client-only: stored per device. */
export const APP_STYLES = ['default', 'glass', 'warm'] as const;
export type AppStyle = (typeof APP_STYLES)[number];
export const STYLE_STORAGE_KEY = 'linguo-style';

export function parseAppStyle(value: string | null | undefined): AppStyle {
  return (APP_STYLES as readonly string[]).includes(value ?? '') ? (value as AppStyle) : 'default';
}
