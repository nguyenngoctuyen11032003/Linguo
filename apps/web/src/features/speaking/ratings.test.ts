import { beforeEach, describe, expect, it } from 'vitest';
import { clearReflections, loadReflections, REFLECTIONS_MAX, saveReflection, type Reflection } from './ratings';

const reflection = (n: number): Reflection => ({ at: `2026-10-14T00:00:${String(n % 60).padStart(2, '0')}Z`, mode: 'repeat', lang: 'en', ratings: { clarity: 2 } });

describe('reflections storage', () => {
  beforeEach(() => localStorage.clear());

  it('saves and loads self-ratings per user', () => {
    saveReflection('u1', { at: '2026-10-14T00:00:00Z', mode: 'open', lang: 'ko', ratings: { clarity: 3, fluency: 1 } });
    expect(loadReflections('u1')).toEqual([{ at: '2026-10-14T00:00:00Z', mode: 'open', lang: 'ko', ratings: { clarity: 3, fluency: 1 } }]);
    expect(loadReflections('u2')).toEqual([]);
  });

  it('ignores a reflection with no rating at all', () => {
    saveReflection('u1', { at: 'x', mode: 'repeat', lang: 'en', ratings: {} });
    expect(loadReflections('u1')).toEqual([]);
  });

  it('keeps only the newest entries', () => {
    for (let i = 0; i < REFLECTIONS_MAX + 5; i++) saveReflection('u1', reflection(i));
    const list = loadReflections('u1');
    expect(list).toHaveLength(REFLECTIONS_MAX);
    expect(list.at(-1)).toEqual(reflection(REFLECTIONS_MAX + 4));
  });

  it('reads corrupt or malformed storage as empty and drops invalid fields', () => {
    localStorage.setItem('linguo-speaking-v1:u1', '{not json');
    expect(loadReflections('u1')).toEqual([]);
    localStorage.setItem(
      'linguo-speaking-v1:u1',
      JSON.stringify([{ at: 'a', mode: 'repeat', lang: 'en', ratings: { clarity: 9, bogus: 2, rhythm: 2 }, transcript: 'secret' }, { mode: 'nope' }, 5]),
    );
    expect(loadReflections('u1')).toEqual([{ at: 'a', mode: 'repeat', lang: 'en', ratings: { rhythm: 2 } }]);
  });

  it('clears everything for a user', () => {
    saveReflection('u1', reflection(1));
    clearReflections('u1');
    expect(loadReflections('u1')).toEqual([]);
  });
});
