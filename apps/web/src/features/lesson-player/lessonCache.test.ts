import { afterEach, describe, expect, it, vi } from 'vitest';
import { LESSON_ID, PATH_ID, payload, run } from './lesson-fixtures';
import {
  clearLessonCache,
  LESSON_CACHE_MAX_AGE_MS,
  lessonCacheKey,
  readLessonCache,
  writeLessonCache,
} from './lessonCache';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const L2 = '20000000-0000-4000-8000-000000000002';
const L3 = '20000000-0000-4000-8000-000000000003';
const NOW = Date.UTC(2026, 9, 13, 8);

const key = (lessonId: string, userId = USER) => lessonCacheKey(userId, PATH_ID, lessonId);

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('lessonCache', () => {
  it('stores the payload in localStorage with savedAt and reads it back', () => {
    writeLessonCache(USER, key(LESSON_ID), payload(), NOW);
    const raw = JSON.parse(localStorage.getItem(key(LESSON_ID))!) as { savedAt: number };
    expect(raw.savedAt).toBe(NOW);
    expect(readLessonCache(key(LESSON_ID), NOW)).toEqual(payload());
  });

  it('expires entries after 7 days', () => {
    writeLessonCache(USER, key(LESSON_ID), payload(), NOW);
    expect(readLessonCache(key(LESSON_ID), NOW + LESSON_CACHE_MAX_AGE_MS)).not.toBeNull();
    expect(readLessonCache(key(LESSON_ID), NOW + LESSON_CACHE_MAX_AGE_MS + 1)).toBeNull();
    expect(localStorage.getItem(key(LESSON_ID))).toBeNull();
  });

  it('keeps only the 2 most recent lessons per user', () => {
    writeLessonCache(USER, key(LESSON_ID), payload(), NOW);
    writeLessonCache(USER, key(L2), payload(), NOW + 1);
    writeLessonCache(OTHER_USER, key(LESSON_ID, OTHER_USER), payload(), NOW + 2);
    writeLessonCache(USER, key(L3), payload(), NOW + 3);
    expect(localStorage.getItem(key(LESSON_ID))).toBeNull();
    expect(readLessonCache(key(L2), NOW + 4)).not.toBeNull();
    expect(readLessonCache(key(L3), NOW + 4)).not.toBeNull();
    // Another user's slots are separate.
    expect(readLessonCache(key(LESSON_ID, OTHER_USER), NOW + 4)).not.toBeNull();

    // Re-saving an older lesson makes it the most recent one again.
    writeLessonCache(USER, key(L2), payload(), NOW + 5);
    writeLessonCache(USER, key(LESSON_ID), payload(), NOW + 6);
    expect(localStorage.getItem(key(L3))).toBeNull();
    expect(localStorage.getItem(key(L2))).not.toBeNull();
  });

  it('ignores and drops corrupt or invalid entries', () => {
    for (const raw of ['{not json', JSON.stringify(payload()), JSON.stringify({ savedAt: NOW, payload: { lesson: 1 } })]) {
      localStorage.setItem(key(LESSON_ID), raw);
      expect(readLessonCache(key(LESSON_ID), NOW)).toBeNull();
      expect(localStorage.getItem(key(LESSON_ID))).toBeNull();
    }
    // A corrupt neighbour does not stop eviction or writing.
    localStorage.setItem(key(L2), 'garbage');
    writeLessonCache(USER, key(LESSON_ID), payload(), NOW);
    expect(localStorage.getItem(key(L2))).toBeNull();
    expect(readLessonCache(key(LESSON_ID), NOW)).not.toBeNull();
  });

  it('only reopens in-progress runs and frees the slot of a finished one', () => {
    localStorage.setItem(key(LESSON_ID), JSON.stringify({ savedAt: NOW, payload: payload({ run: run({ status: 'completed' }) }) }));
    expect(readLessonCache(key(LESSON_ID), NOW)).toBeNull();
    writeLessonCache(USER, key(L2), payload(), NOW);
    writeLessonCache(USER, key(L2), payload({ run: run({ status: 'completed' }) }), NOW + 1);
    expect(localStorage.getItem(key(L2))).toBeNull();
  });

  it("clears only the given user's lessons", () => {
    writeLessonCache(USER, key(LESSON_ID), payload(), NOW);
    writeLessonCache(USER, key(L2), payload(), NOW);
    writeLessonCache(OTHER_USER, key(LESSON_ID, OTHER_USER), payload(), NOW);
    localStorage.setItem('linguo-outbox-v1:' + USER, '[]');
    clearLessonCache(USER);
    expect(localStorage.getItem(key(LESSON_ID))).toBeNull();
    expect(localStorage.getItem(key(L2))).toBeNull();
    expect(localStorage.getItem(key(LESSON_ID, OTHER_USER))).not.toBeNull();
    expect(localStorage.getItem('linguo-outbox-v1:' + USER)).toBe('[]');
  });

  it('never throws when storage is blocked', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeLessonCache(USER, key(LESSON_ID), payload(), NOW)).not.toThrow();
    expect(readLessonCache(key(LESSON_ID), NOW)).toBeNull();
    expect(() => clearLessonCache(USER)).not.toThrow();
  });
});
