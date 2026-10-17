import { describe, expect, it } from 'vitest';
import { goalFamily, structureWarning } from './exam-page-utils';

describe('goalFamily', () => {
  it('maps exam goals to their family, and others to null', () => {
    expect(goalFamily('goethe')).toBe('goethe');
    expect(goalFamily('cefr')).toBe('cefr');
    expect(goalFamily('jlpt')).toBe('jlpt');
    expect(goalFamily('foundation')).toBeNull();
    expect(goalFamily(null)).toBeNull();
  });
});

describe('structureWarning', () => {
  it('warns when a goethe path meets a non-goethe form, and only then', () => {
    expect(structureWarning('goethe', 'cefr')).toMatch(/không theo cấu trúc Goethe/);
    expect(structureWarning('goethe', 'topik_i')).toMatch(/Goethe/);
    expect(structureWarning('goethe', 'goethe')).toBeNull();
  });

  it('warns a non-goethe goal about a goethe form only when the goal is an exam goal', () => {
    expect(structureWarning('cefr', 'goethe')).toMatch(/không theo khung CEFR/);
    expect(structureWarning('jlpt', 'goethe')).toMatch(/JLPT/);
    expect(structureWarning('foundation', 'goethe')).toBeNull();
    expect(structureWarning(null, 'goethe')).toBeNull();
  });

  it('keeps the TOPIK I / II warnings', () => {
    expect(structureWarning('topik_ii', 'topik_i')).toMatch(/TOPIK II/);
    expect(structureWarning('topik_i', 'topik_ii')).toMatch(/TOPIK I/);
    expect(structureWarning('topik_i', 'topik_i')).toBeNull();
  });
});
