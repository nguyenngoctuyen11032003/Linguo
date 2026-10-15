import { describe, expect, it } from 'vitest';
import { PERSONAL_VOCAB_LIMITS } from '../personal-vocab/limits';
import {
  ROLEPLAY_LEVELS,
  ROLEPLAY_SCENARIOS,
  findRoleplayScenario,
  roleplayScenarioFitsLevel,
  roleplayScenariosFor,
  type RoleplayLanguage,
} from './roleplay-catalog';

const LANGS: RoleplayLanguage[] = ['en', 'ko'];

describe('roleplay catalog integrity', () => {
  it('has scenarios for every language', () => {
    for (const l of LANGS) expect(roleplayScenariosFor(l).length).toBeGreaterThanOrEqual(3);
  });

  it('keys are unique within a language and snake_case, and lookup is language-scoped', () => {
    for (const l of LANGS) {
      const keys = roleplayScenariosFor(l).map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of keys) {
        expect(k).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(findRoleplayScenario(l, k)?.language).toBe(l);
      }
    }
    expect(findRoleplayScenario('en', '')).toBeUndefined();
    expect(findRoleplayScenario('en', 'constructor')).toBeUndefined();
  });

  it.each(ROLEPLAY_SCENARIOS.map((s) => [`${s.language}/${s.key}`, s] as const))('%s is well-formed', (_n, s) => {
    const levels = ROLEPLAY_LEVELS[s.language];
    expect(levels).toContain(s.level_min);
    expect(levels).toContain(s.level_max);
    expect(levels.indexOf(s.level_min)).toBeLessThanOrEqual(levels.indexOf(s.level_max));
    expect(s.goals.length).toBeGreaterThanOrEqual(2);
    expect(s.goals.length).toBeLessThanOrEqual(6); // the stored session allows at most 6 goals
    const goalKeys = s.goals.map((g) => g.key);
    expect(new Set(goalKeys).size).toBe(goalKeys.length);
    for (const g of s.goals) {
      expect(g.key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(g.key.length).toBeLessThanOrEqual(40); // storage schema bound
      expect(g.label_vi.trim()).not.toBe('');
    }
    expect(s.key.length).toBeLessThanOrEqual(32); // storage schema bound
    for (const text of [s.title_vi, s.summary_vi, s.partner_role_vi, s.persona, s.opening_hint]) expect(text.trim()).not.toBe('');
  });

  it('every scenario fits at least its own range ends and no level outside it', () => {
    for (const s of ROLEPLAY_SCENARIOS) {
      expect(roleplayScenarioFitsLevel(s, s.level_min)).toBe(true);
      expect(roleplayScenarioFitsLevel(s, s.level_max)).toBe(true);
      expect(roleplayScenarioFitsLevel(s, 'zz_unknown')).toBe(false);
      expect(roleplayScenarioFitsLevel(s, '')).toBe(false);
      // A level from the other language never fits.
      const other = ROLEPLAY_LEVELS[s.language === 'en' ? 'ko' : 'en'];
      for (const level of other) expect(roleplayScenarioFitsLevel(s, level)).toBe(false);
    }
  });
});

describe('personal vocab limits sanity', () => {
  const L = PERSONAL_VOCAB_LIMITS;
  it('are positive integers with consistent relationships', () => {
    for (const v of Object.values(L)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(L.maxRowsPerImport).toBeLessThanOrEqual(L.maxWordsPerList);
    expect(L.maxWordsPerList).toBeLessThanOrEqual(L.maxWordsPerUser);
    expect(L.maxWordsPerUser).toBeGreaterThanOrEqual(L.maxLists);
    // The longest legal row must fit one parser record.
    expect(L.term + L.meaning + L.example + L.note + L.pronunciation).toBeLessThan(L.maxRecordChars);
  });
});
