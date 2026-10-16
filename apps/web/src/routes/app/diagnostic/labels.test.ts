import { describe, expect, it } from 'vitest';
import { report } from '@/features/diagnostic/diagnostic-fixtures';
import { clampReportToContent } from './labels';

describe('clampReportToContent', () => {
  it('keeps Japanese levels up to N1 now that every JLPT level has lessons', () => {
    const base = report();
    const raw = report({
      language_code: 'ja',
      current_level: 'n4',
      suggested_level: 'n1',
      capped_level: 'n2',
      skills: base.skills.map((row) => (row.skill === 'vocabulary' ? { ...row, level_code: 'n1', range: { low: 'n3', high: 'n1' } } : row)),
    });
    expect(clampReportToContent(raw)).toEqual({ report: raw, clamped: false });
  });

  it('returns the same report when every level has lessons', () => {
    const en = report();
    expect(clampReportToContent(en)).toEqual({ report: en, clamped: false });
  });
});
