import { describe, expect, it } from 'vitest';
import { MAX_ITEM_SECONDS, SESSION_LINK_QUERY, elapsedSeconds, readSessionParams, sessionLinkSearch } from './params';

const ID = '3f2b8c1e-5a4d-4e6f-9a7b-0c1d2e3f4a5b';
const q = (s: string) => new URLSearchParams(s);

describe('readSessionParams', () => {
  it('reads a lesson link', () => {
    expect(readSessionParams(q(`phien=${ID}&muc=a1`))).toEqual({ sessionId: ID, itemId: 'a1', reviewLimit: null });
  });

  it.each(['', 'muc=a1', `phien=${ID}`, 'phien=not-a-uuid&muc=a1', `phien=${ID}&muc=b1`, `phien=${ID}&muc=a123`, `phien=${ID}&muc=`, `phien=${ID}&muc=A1`])(
    'returns null for %j',
    (s) => {
      expect(readSessionParams(q(s))).toBeNull();
    },
  );

  it.each([
    ['1', 1], ['500', 500], ['20', 20],
    ['0', null], ['501', null], ['-1', null], ['1.5', null], ['abc', null], ['', null], [' 5', null], ['5 ', null], ['1e2', null],
    ['99999999999999999999', null],
  ])('so-the=%j gives reviewLimit %s', (raw, expected) => {
    expect(readSessionParams(q(`phien=${ID}&muc=a2&so-the=${encodeURIComponent(raw)}`))?.reviewLimit).toBe(expected);
  });
});

describe('sessionLinkSearch', () => {
  it('round-trips with and without a review limit', () => {
    for (const link of [
      { sessionId: ID, itemId: 'a1', reviewLimit: null },
      { sessionId: ID, itemId: 'a12', reviewLimit: 20 },
    ]) {
      expect(readSessionParams(q(sessionLinkSearch(link)))).toEqual(link);
    }
    const plain = sessionLinkSearch({ sessionId: ID, itemId: 'a1', reviewLimit: null });
    expect(plain).not.toContain(SESSION_LINK_QUERY.reviewLimit);
    expect(plain.startsWith('?')).toBe(true);
  });
});

describe('elapsedSeconds', () => {
  it.each([
    [0, 0, 0], [0, 499, 0], [0, 500, 1], [0, 1500, 2], [1000, 0, 0], [0, 7_200_000, MAX_ITEM_SECONDS], [0, 99_999_999_999, MAX_ITEM_SECONDS],
    [NaN, 10, 0], [0, NaN, 0], [0, Infinity, 0], [-Infinity, 0, 0],
  ])('elapsedSeconds(%f, %f) = %f', (a, b, expected) => {
    expect(elapsedSeconds(a, b)).toBe(expected);
  });
});
