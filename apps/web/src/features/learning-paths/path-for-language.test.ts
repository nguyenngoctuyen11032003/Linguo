import { describe, expect, it } from 'vitest';
import { TEST_KO_PATH, TEST_PATH } from '../../../tests/unit/learning-fixtures';
import { pathForLanguage } from './path-for-language';

describe('pathForLanguage', () => {
  it('returns null without a path in the language', () => {
    expect(pathForLanguage([TEST_PATH], 'ko')).toBeNull();
    expect(pathForLanguage([], 'en')).toBeNull();
  });

  it('returns the path of that language', () => {
    expect(pathForLanguage([TEST_PATH, TEST_KO_PATH], 'ko')?.id).toBe(TEST_KO_PATH.id);
  });

  it('prefers an active path, then the newest', () => {
    const paused = { ...TEST_KO_PATH, id: 'ko-paused', status: 'paused' as const, createdAt: '2026-12-01T00:00:00Z' };
    const oldActive = { ...TEST_KO_PATH, id: 'ko-old', createdAt: '2026-01-01T00:00:00Z' };
    const newActive = { ...TEST_KO_PATH, id: 'ko-new', createdAt: '2026-06-01T00:00:00Z' };
    expect(pathForLanguage([paused, oldActive, newActive], 'ko')?.id).toBe('ko-new');
    expect(pathForLanguage([paused, oldActive], 'ko')?.id).toBe('ko-old');
    expect(pathForLanguage([paused], 'ko')?.id).toBe('ko-paused');
  });
});
