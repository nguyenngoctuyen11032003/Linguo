import { describe, expect, it } from 'vitest';
import {
  allowedTargets,
  availableLevels,
  clampToContentLevel,
  CONTENT_MAX_LEVEL,
  defaultTarget,
  GOALS_BY_LANGUAGE,
  isAtContentCeiling,
  isGoalForLanguage,
  isLevelAvailable,
  isLevelOf,
  LEVEL_INFO,
  LEVELS,
  suggestedCurrentLevel,
} from './levels';

describe('levels', () => {
  it('has seven ordered levels per language with Vietnamese info', () => {
    expect(LEVELS.en).toEqual(['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2']);
    expect(LEVELS.ko).toEqual(['hangul', 'topik1', 'topik2', 'topik3', 'topik4', 'topik5', 'topik6']);
    for (const code of [...LEVELS.en, ...LEVELS.ko]) expect(LEVEL_INFO[code].description.length).toBeGreaterThan(10);
  });

  it('pairs goals with languages', () => {
    expect(GOALS_BY_LANGUAGE.en).toContain('cefr');
    expect(isGoalForLanguage('ko', 'topik_ii')).toBe(true);
    expect(isGoalForLanguage('en', 'topik_ii')).toBe(false);
    expect(isLevelOf('en', 'b1')).toBe(true);
    expect(isLevelOf('en', 'topik1')).toBe(false);
  });

  it('only allows targets above the current level and inside the TOPIK band', () => {
    expect(allowedTargets('en', 'cefr', 'b1')).toEqual(['b2', 'c1', 'c2']);
    expect(allowedTargets('ko', 'topik_i', 'hangul')).toEqual(['topik1', 'topik2']);
    expect(allowedTargets('ko', 'topik_ii', 'topik1')).toEqual(['topik3', 'topik4', 'topik5', 'topik6']);
    expect(allowedTargets('ko', 'topik_i', 'topik2')).toEqual([]);
  });

  it('allows no targets when the current level is unknown', () => {
    expect(allowedTargets('en', 'cefr', 'z9')).toEqual([]);
    expect(allowedTargets('en', 'cefr', 'topik1')).toEqual([]);
    expect(defaultTarget('en', 'cefr', 'z9')).toBeNull();
  });

  it('suggests defaults', () => {
    expect(defaultTarget('en', 'daily_communication', 'a2')).toBe('b1');
    expect(defaultTarget('en', 'daily_communication', 'b2')).toBe('c1');
    expect(defaultTarget('ko', 'topik_i', 'topik2')).toBeNull();
    expect(suggestedCurrentLevel('en', 'new')).toBe('pre_a1');
    expect(suggestedCurrentLevel('ko', 'unsure')).toBe('topik1');
    expect(suggestedCurrentLevel('en', 'some')).toBeNull();
  });
});

describe('levels: Japanese (JLPT)', () => {
  it('orders kana then N5 → N1 with Vietnamese info', () => {
    expect(LEVELS.ja).toEqual(['kana', 'n5', 'n4', 'n3', 'n2', 'n1']);
    for (const code of LEVELS.ja) expect(LEVEL_INFO[code].description.length).toBeGreaterThan(10);
    expect(LEVEL_INFO.n3.label).toBe('JLPT N3');
  });

  it('keeps level codes unique across languages', () => {
    const all = [...LEVELS.en, ...LEVELS.ko, ...LEVELS.ja];
    expect(new Set(all).size).toBe(all.length);
  });

  it('pairs Japanese goals and levels with ja only', () => {
    expect(GOALS_BY_LANGUAGE.ja).toEqual(['kana_basics', 'communication', 'jlpt', 'skill_focus']);
    expect(isGoalForLanguage('ja', 'jlpt')).toBe(true);
    expect(isGoalForLanguage('ja', 'topik_i')).toBe(false);
    expect(isGoalForLanguage('ko', 'jlpt')).toBe(false);
    expect(isLevelOf('ja', 'n5')).toBe(true);
    expect(isLevelOf('ja', 'topik1')).toBe(false);
    expect(isLevelOf('ko', 'n5')).toBe(false);
  });

  it('allows higher JLPT levels up to N1 and picks language-aware defaults', () => {
    expect(allowedTargets('ja', 'jlpt', 'kana')).toEqual(['n5', 'n4', 'n3', 'n2', 'n1']);
    expect(allowedTargets('ja', 'jlpt', 'n4')).toEqual(['n3', 'n2', 'n1']);
    expect(allowedTargets('ja', 'jlpt', 'n3')).toEqual(['n2', 'n1']);
    expect(allowedTargets('ja', 'jlpt', 'n2')).toEqual(['n1']);
    expect(allowedTargets('ja', 'jlpt', 'n1')).toEqual([]);
    expect(defaultTarget('ja', 'kana_basics', 'kana')).toBe('n5');
    expect(defaultTarget('ja', 'jlpt', 'n5')).toBe('n3');
    expect(defaultTarget('ja', 'jlpt', 'n3')).toBe('n2');
    expect(defaultTarget('ja', 'communication', 'kana')).toBe('n3');
    expect(defaultTarget('ja', 'skill_focus', 'n4')).toBe('n3');
    expect(defaultTarget('ja', 'skill_focus', 'n3')).toBe('n2');
    expect(defaultTarget('ja', 'jlpt', 'n1')).toBeNull();
    expect(defaultTarget('ko', 'communication', 'hangul')).toBe('topik3');
    expect(suggestedCurrentLevel('ja', 'new')).toBe('kana');
    expect(suggestedCurrentLevel('ja', 'unsure')).toBe('n5');
  });
});

describe('levels: content ceiling', () => {
  it('has content on the whole scale of every language, Japanese included (N2/N1 shipped)', () => {
    expect(CONTENT_MAX_LEVEL).toEqual({ en: 'c2', ko: 'topik6', ja: 'n1', de: 'b2' });
    expect(availableLevels('ja')).toEqual([...LEVELS.ja]);
    expect(availableLevels('en')).toEqual([...LEVELS.en]);
    expect(availableLevels('ko')).toEqual([...LEVELS.ko]);
  });

  it('marks every level of the scale available and unknown or foreign codes unavailable', () => {
    expect(isLevelAvailable('ja', 'n3')).toBe(true);
    expect(isLevelAvailable('ja', 'n2')).toBe(true);
    expect(isLevelAvailable('ja', 'n1')).toBe(true);
    expect(isLevelAvailable('ja', 'topik1')).toBe(false);
    expect(isLevelAvailable('ja', 'z9')).toBe(false);
    expect(isLevelAvailable('ko', 'topik6')).toBe(true);
  });

  it('leaves levels with content and unknown codes unclamped', () => {
    expect(clampToContentLevel('ja', 'n1')).toBe('n1');
    expect(clampToContentLevel('ja', 'n2')).toBe('n2');
    expect(clampToContentLevel('ja', 'n4')).toBe('n4');
    expect(clampToContentLevel('ja', 'z9')).toBe('z9');
    expect(clampToContentLevel('en', 'c2')).toBe('c2');
  });

  it('reports no content ceiling once the whole scale has content', () => {
    expect(isAtContentCeiling('ja', 'n3')).toBe(false);
    expect(isAtContentCeiling('ja', 'n2')).toBe(false);
    expect(isAtContentCeiling('ja', 'n1')).toBe(false);
    expect(isAtContentCeiling('ja', 'n4')).toBe(false);
    expect(isAtContentCeiling('ko', 'topik6')).toBe(false);
    expect(isAtContentCeiling('en', 'c2')).toBe(false);
  });
});
