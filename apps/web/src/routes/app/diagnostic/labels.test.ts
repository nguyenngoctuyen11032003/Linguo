import { describe, expect, it } from 'vitest';
import { report } from '@/features/diagnostic/diagnostic-fixtures';
import { clampReportToContent } from './labels';

describe('clampReportToContent', () => {
  it('lowers Japanese levels above N3 (no program yet) to N3', () => {
    const base = report();
    const raw = report({
      language_code: 'ja',
      current_level: 'n4',
      suggested_level: 'n1',
      capped_level: 'n2',
      skills: base.skills.map((row) =>
        row.skill === 'vocabulary'
          ? { ...row, level_code: 'n1', range: { low: 'n3', high: 'n1' } }
          : row.skill === 'grammar'
            ? { ...row, level_code: 'n4', range: { low: 'n5', high: 'n4' } }
            : row,
      ),
    });
    const { report: clamped, clamped: changed } = clampReportToContent(raw);
    expect(changed).toBe(true);
    expect(clamped.current_level).toBe('n4');
    expect(clamped.suggested_level).toBe('n3');
    expect(clamped.capped_level).toBe('n3');
    expect(clamped.skills[0]).toMatchObject({ level_code: 'n3', range: { low: 'n3', high: 'n3' } });
    expect(clamped.skills[1]).toMatchObject({ level_code: 'n4', range: { low: 'n5', high: 'n4' } });
    expect(clamped.skills[2]).toMatchObject({ level_code: null, range: null });
  });

  it('returns the same report when every level has lessons', () => {
    const raw = report({ language_code: 'ja', current_level: 'n5', suggested_level: 'n4', capped_level: 'n4' });
    const result = clampReportToContent({ ...raw, skills: raw.skills.map((s) => (s.level_code ? { ...s, level_code: 'n4', range: null } : s)) });
    expect(result.clamped).toBe(false);
    const en = report();
    expect(clampReportToContent(en)).toEqual({ report: en, clamped: false });
  });
});
