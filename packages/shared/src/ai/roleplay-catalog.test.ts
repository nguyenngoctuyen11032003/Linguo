import { describe, expect, it } from 'vitest';
import { LEVELS } from '../learning/levels';
import { PERSONAL_VOCAB_LIMITS } from '../personal-vocab/limits';
import {
  ROLEPLAY_LEVELS,
  ROLEPLAY_SCENARIOS,
  findRoleplayScenario,
  roleplayScenarioFitsLevel,
  roleplayScenariosFor,
  type RoleplayLanguage,
} from './roleplay-catalog';

const LANGS: RoleplayLanguage[] = ['en', 'ko', 'ja', 'de'];

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
      // A level from the other language never fits (de shares the CEFR codes of en: skip codes the own scale contains).
      for (const lang of Object.keys(ROLEPLAY_LEVELS) as RoleplayLanguage[]) {
        if (lang === s.language) continue;
        for (const level of ROLEPLAY_LEVELS[lang]) {
          if (ROLEPLAY_LEVELS[s.language].includes(level)) continue;
          expect(roleplayScenarioFitsLevel(s, level)).toBe(false);
        }
      }
    }
  });

  it('level scales mirror the learning levels of every language', () => {
    expect(ROLEPLAY_LEVELS).toEqual({ en: [...LEVELS.en], ko: [...LEVELS.ko], ja: [...LEVELS.ja], de: [...LEVELS.de] });
  });

  it('ja mirrors ko: same scenario keys, goal keys and level spread (same ordinal positions)', () => {
    const ko = roleplayScenariosFor('ko');
    const ja = roleplayScenariosFor('ja');
    expect(ja.map((s) => s.key)).toEqual(ko.map((s) => s.key));
    // ko starts at hangul (0), ja at kana (0); topik1..topik5 sit at the same ordinals as n5..n1.
    const ord = (lang: RoleplayLanguage, level: string) => ROLEPLAY_LEVELS[lang].indexOf(level);
    for (const k of ko) {
      const j = findRoleplayScenario('ja', k.key)!;
      expect(j.goals.map((g) => g.key)).toEqual(k.goals.map((g) => g.key));
      expect(ord('ja', j.level_min)).toBe(ord('ko', k.level_min));
      expect(ord('ja', j.level_max)).toBe(ord('ko', k.level_max));
      expect(j.title_vi).toBe(k.title_vi);
    }
  });

  it('ja openings are Japanese script (kana present, no Hangul) and personas are Vietnamese with a register', () => {
    const KANA = /[぀-ヿ]/;
    const HANGUL = /[가-힯]/;
    for (const s of roleplayScenariosFor('ja')) {
      expect(s.opening_hint).toMatch(KANA);
      expect(s.opening_hint).not.toMatch(HANGUL);
      expect(s.persona).toMatch(/^Bạn là/);
      expect(s.persona).toMatch(/です\/ます|kính ngữ/);
    }
    for (const s of roleplayScenariosFor('ko')) expect(s.opening_hint).not.toMatch(KANA);
  });
});

describe('de role-play scenarios', () => {
  it('mirrors ko: same scenario keys and goal keys, level spread = ko ordinals clamped at b2', () => {
    const ko = roleplayScenariosFor('ko');
    const de = roleplayScenariosFor('de');
    expect(de.map((s) => s.key)).toEqual(ko.map((s) => s.key));
    const last = ROLEPLAY_LEVELS.de.length - 1;
    const ord = (lang: RoleplayLanguage, level: string) => ROLEPLAY_LEVELS[lang].indexOf(level);
    for (const k of ko) {
      const d = findRoleplayScenario('de', k.key)!;
      expect(d.goals.map((g) => g.key)).toEqual(k.goals.map((g) => g.key));
      expect(ord('de', d.level_min)).toBe(Math.min(ord('ko', k.level_min), last));
      expect(ord('de', d.level_max)).toBe(Math.min(ord('ko', k.level_max), last));
      expect(d.title_vi).toBe(k.title_vi);
    }
  });

  it('openings are German (Latin script, no Hangul/kana/kanji) and personas are Vietnamese with a du/Sie register', () => {
    const OTHER_SCRIPTS = /[぀-ヿ가-힯一-鿿]/;
    for (const s of roleplayScenariosFor('de')) {
      expect(s.opening_hint).toMatch(/^[\x20-\x7EÄÖÜäöüß]+$/);
      expect(s.opening_hint).toMatch(/[A-Za-z]{3}/);
      expect(s.opening_hint).not.toMatch(OTHER_SCRIPTS);
      expect(s.persona).toMatch(/^Bạn là/);
      expect(s.persona).toMatch(/"(Sie|du)"/);
    }
  });

  it('the CEFR codes shared with en resolve per language: a de scenario fits de levels only', () => {
    const cafe = findRoleplayScenario('de', 'cafe_order')!;
    expect(roleplayScenarioFitsLevel(cafe, 'a1')).toBe(true);
    expect(roleplayScenarioFitsLevel(cafe, 'pre_a1')).toBe(false);
    expect(roleplayScenarioFitsLevel(cafe, 'b2')).toBe(false);
    expect(roleplayScenarioFitsLevel(cafe, 'c1')).toBe(false);
    expect(roleplayScenarioFitsLevel(cafe, 'n5')).toBe(false);
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
