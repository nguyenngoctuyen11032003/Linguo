import { describe, expect, it } from 'vitest';
import { seededShuffle, seededShuffleAway } from './shuffle';

describe('seededShuffle', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('is deterministic for the same seed', () => {
    expect(seededShuffle(items, 'ex-1')).toEqual(seededShuffle(items, 'ex-1'));
  });

  it('returns a permutation and does not mutate the input', () => {
    const copy = [...items];
    const out = seededShuffle(items, 'seed');
    expect([...out].sort()).toEqual(items);
    expect(items).toEqual(copy);
  });

  it('produces different orders for different seeds', () => {
    const orders = new Set(['s1', 's2', 's3', 's4', 's5', 's6'].map((s) => seededShuffle(items, s).join('')));
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe('seededShuffleAway', () => {
  it('never keeps the authored order and is stable for a seed', () => {
    for (const items of [['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e']]) {
      for (let i = 0; i < 50; i++) {
        const out = seededShuffleAway(items, `seed-${i}`);
        expect(out).not.toEqual(items);
        expect([...out].sort()).toEqual(items);
        expect(seededShuffleAway(items, `seed-${i}`)).toEqual(out);
      }
    }
  });

  it('leaves a single item alone', () => {
    expect(seededShuffleAway(['a'], 's')).toEqual(['a']);
  });
});
