import { describe, expect, it } from 'vitest';
import { allowedTargets, defaultTarget, GOALS_BY_LANGUAGE, isGoalForLanguage, isLevelOf, LEVEL_INFO, LEVELS, suggestedCurrentLevel } from './levels';

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

  it('suggests defaults', () => {
    expect(defaultTarget('en', 'daily_communication', 'a2')).toBe('b1');
    expect(defaultTarget('en', 'daily_communication', 'b2')).toBe('c1');
    expect(defaultTarget('ko', 'topik_i', 'topik2')).toBeNull();
    expect(suggestedCurrentLevel('en', 'new')).toBe('pre_a1');
    expect(suggestedCurrentLevel('ko', 'unsure')).toBe('topik1');
    expect(suggestedCurrentLevel('en', 'some')).toBeNull();
  });
});
