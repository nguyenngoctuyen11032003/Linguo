import { describe, expect, it } from 'vitest';
import { parseAppStyle } from './app-style';

describe('parseAppStyle', () => {
  it('accepts known styles and falls back to default', () => {
    expect(parseAppStyle('glass')).toBe('glass');
    expect(parseAppStyle('warm')).toBe('warm');
    expect(parseAppStyle('nope')).toBe('default');
    expect(parseAppStyle(null)).toBe('default');
  });
});
