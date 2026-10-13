import { describe, expect, it } from 'vitest';
import fixtures from './engine.fixtures.json';
import {
  capLevel,
  confidenceFor,
  conservativeLevel,
  eap,
  GRID,
  levelRange,
  pickItem,
  posterior,
  probCorrect,
  shouldStopSkill,
  suggestLevel,
  type Answer,
} from './engine';
import type { DiagnosticConfidence, DiagnosticSkill } from './rpc';

const round8 = (x: number) => Math.round(x * 1e8) / 1e8;

/** Point mass at grid value θ. */
const pointMass = (theta: number) => GRID.map((g) => (g === theta ? 1 : 0));

describe('GRID', () => {
  it('spans -0.5..6.5 in 0.25 steps (29 points)', () => {
    expect(GRID).toHaveLength(29);
    expect(GRID[0]).toBe(-0.5);
    expect(GRID[28]).toBe(6.5);
    expect(GRID[2]).toBe(0);
  });
});

describe('probCorrect', () => {
  it('equals c + (1 − c)/2 at θ = b', () => {
    expect(probCorrect(2, 2, 4)).toBeCloseTo(0.625, 12);
  });
  it('approaches the guessing floor far below b and 1 far above', () => {
    expect(probCorrect(-10, 2, 4)).toBeCloseTo(0.25, 6);
    expect(probCorrect(20, 2, 4)).toBeCloseTo(1, 6);
  });
});

describe('posterior', () => {
  it('without answers is the normalised Normal prior on the grid', () => {
    const w = posterior({ mean: 3, sd: 1.25 }, []);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const { mean, sd } = eap(w);
    expect(mean).toBeCloseTo(3, 10); // symmetric on the grid
    expect(sd).toBeGreaterThan(1.1);
    expect(sd).toBeLessThan(1.3);
  });
  it('moves up after a correct answer and down after a wrong one', () => {
    const prior = { mean: 2, sd: 1.25 };
    const up = eap(posterior(prior, [{ b: 2.5, options: 4, correct: true }]));
    const down = eap(posterior(prior, [{ b: 2.5, options: 4, correct: false }]));
    expect(up.mean).toBeGreaterThan(2);
    expect(down.mean).toBeLessThan(2);
  });
  it('is order independent', () => {
    const a: Answer[] = [
      { b: 1.5, options: 4, correct: true },
      { b: 3.5, options: 3, correct: false },
      { b: 2.5, options: 4, correct: true },
    ];
    const w1 = posterior({ mean: 1.5, sd: 1.25 }, a);
    const w2 = posterior({ mean: 1.5, sd: 1.25 }, [...a].reverse());
    w1.forEach((x, i) => expect(x).toBeCloseTo(w2[i] ?? NaN, 14));
  });
  it('stays finite for long all-wrong sequences', () => {
    const answers = Array.from({ length: 40 }, () => ({ b: 6.5, options: 2, correct: false }));
    const w = posterior({ mean: 6, sd: 1.25 }, answers);
    expect(w.every((x) => Number.isFinite(x))).toBe(true);
    expect(w.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
  });
});

describe('eap', () => {
  it('returns mean and sd of the grid distribution', () => {
    const w = GRID.map((g) => (g === 1 || g === 2 ? 0.5 : 0));
    expect(eap(w)).toEqual({ mean: 1.5, sd: 0.5 });
  });
});

describe('conservativeLevel', () => {
  it('is the largest L with P(θ ≥ L) ≥ 0.7', () => {
    expect(conservativeLevel(pointMass(3.75))).toBe(3);
    expect(conservativeLevel(pointMass(4))).toBe(4);
    expect(conservativeLevel(pointMass(6.5))).toBe(6);
  });
  it('is 0 when no level qualifies', () => {
    expect(conservativeLevel(pointMass(-0.5))).toBe(0);
  });
  it('counts exactly 0.7 as enough', () => {
    const w = GRID.map((g) => (g === 2 ? 0.3 : g === 3 ? 0.7 : 0));
    expect(conservativeLevel(w)).toBe(3);
  });
  it('drops a level when the upper mass is below 0.7', () => {
    const w = GRID.map((g) => (g === 2 ? 0.31 : g === 3 ? 0.69 : 0));
    expect(conservativeLevel(w)).toBe(2);
  });
});

describe('levelRange', () => {
  it('floors the 10% and 90% quantiles', () => {
    const w = GRID.map((g) => (g === 1.5 ? 0.2 : g === 2.25 ? 0.6 : g === 4.75 ? 0.2 : 0));
    expect(levelRange(w)).toEqual({ low: 1, high: 4 });
  });
  it('clamps to 0..6', () => {
    expect(levelRange(pointMass(-0.5))).toEqual({ low: 0, high: 0 });
    expect(levelRange(pointMass(6.5))).toEqual({ low: 6, high: 6 });
  });
});

describe('confidenceFor', () => {
  it.each<[number, number, number, DiagnosticConfidence]>([
    [0.45, 6, 0, 'high'],
    [0.45, 5, 0, 'medium'],
    [0.46, 8, 0, 'medium'],
    [0.75, 3, 0, 'medium'],
    [0.76, 8, 0, 'low'],
    [0.4, 8, 0.3, 'high'],
    [0.4, 8, 0.31, 'medium'],
    [0.6, 8, 0.5, 'low'],
    [0.9, 8, 0.5, 'low'],
  ])('sd=%f n=%i rapid=%f → %s', (sd, n, rapid, expected) => {
    expect(confidenceFor(sd, n, rapid)).toBe(expected);
  });
});

describe('suggestLevel', () => {
  it('is null with fewer than 2 medium/high skills', () => {
    expect(suggestLevel([])).toBeNull();
    expect(suggestLevel([{ level: 3, confidence: 'high' }, { level: 1, confidence: 'low' }])).toBeNull();
  });
  it('takes the lower median of medium/high skills', () => {
    expect(suggestLevel([{ level: 4, confidence: 'high' }, { level: 2, confidence: 'medium' }])).toBe(2);
    expect(
      suggestLevel([
        { level: 5, confidence: 'medium' },
        { level: 1, confidence: 'high' },
        { level: 3, confidence: 'high' },
        { level: 0, confidence: 'low' },
      ]),
    ).toBe(3);
  });
});

describe('capLevel', () => {
  it('limits upward moves to +2 the first time and +1 later', () => {
    expect(capLevel(1, 5, true)).toBe(3);
    expect(capLevel(1, 5, false)).toBe(2);
    expect(capLevel(1, 2, true)).toBe(2);
  });
  it('always allows moving down', () => {
    expect(capLevel(4, 0, false)).toBe(0);
    expect(capLevel(4, 4, false)).toBe(4);
  });
});

describe('shouldStopSkill', () => {
  it.each<[DiagnosticSkill, number, number, number, boolean]>([
    ['vocabulary', 3, 0.3, 10, false],
    ['vocabulary', 4, 0.45, 10, true],
    ['vocabulary', 4, 0.46, 10, false],
    ['vocabulary', 7, 0.8, 10, false],
    ['vocabulary', 8, 0.8, 10, true],
    ['grammar', 8, 0.8, 10, true],
    ['reading', 4, 0.8, 10, false],
    ['reading', 5, 0.8, 10, true],
    ['grammar', 1, 1.2, 0, true],
  ])('%s n=%i sd=%f left=%i → %s', (skill, n, sd, left, expected) => {
    expect(shouldStopSkill(skill, n, sd, left)).toBe(expected);
  });
});

describe('pickItem', () => {
  const items = [
    { id: 'a', b: 0.5 },
    { id: 'b', b: 1.5 },
    { id: 'c', b: 2.5 },
    { id: 'd', b: 3.5 },
    { id: 'e', b: 2.5 },
  ];
  it('returns null without candidates', () => {
    expect(pickItem([], 2, 0.5)).toBeNull();
  });
  it('chooses among the 3 nearest by |b − EAP|, ties by id', () => {
    // nearest to 2.4: c(0.1), e(0.1), b(0.9) → sorted c, e, b
    expect(pickItem(items, 2.4, 0)).toBe('c');
    expect(pickItem(items, 2.4, 0.34)).toBe('e');
    expect(pickItem(items, 2.4, 0.99)).toBe('b');
  });
  it('uses k = number of candidates when fewer than 3', () => {
    expect(pickItem(items.slice(0, 2), 0, 0.6)).toBe('b');
  });
});

// Same weights as the boundary cases of supabase/tests/diagnostic_rpc.test.sql (SQL uses the same 1e-9 tolerance).
describe('mass tolerance at boundaries', () => {
  const weightsAt = (entries: Record<number, number>) => Array.from({ length: 29 }, (_, i) => entries[i] ?? 0);

  it('reaches the 0.7 level mass within 1e-9', () => {
    expect(conservativeLevel(weightsAt({ 0: 0.3000000005, 6: 0.6999999995 }))).toBe(1);
  });

  it('reaches the 10th/90th percentiles within 1e-9', () => {
    expect(levelRange(weightsAt({ 10: 0.0999999995, 14: 0.8, 22: 0.1000000005 }))).toEqual({ low: 2, high: 3 });
  });
});

// ---------------------------------------------------------------------------
// Shared fixtures (mirrored by SQL via scripts/sync-diagnostic-fixtures.mjs)
// ---------------------------------------------------------------------------

describe('engine.fixtures.json', () => {
  it('has at least 40 cases', () => {
    const total =
      fixtures.posterior.length + fixtures.confidence.length + fixtures.suggest.length + fixtures.cap.length + fixtures.stop.length;
    expect(total).toBeGreaterThanOrEqual(40);
  });

  describe('posterior', () => {
    for (const c of fixtures.posterior) {
      it(c.name, () => {
        const w = posterior(c.prior, c.answers);
        const { mean, sd } = eap(w);
        expect({ mean: round8(mean), sd: round8(sd), level: conservativeLevel(w), range: levelRange(w) }).toEqual(c.expected);
      });
    }
  });

  describe('confidence', () => {
    for (const c of fixtures.confidence) {
      it(c.name, () => expect(confidenceFor(c.sd, c.n, c.rapidShare)).toBe(c.expected));
    }
  });

  describe('suggest', () => {
    for (const c of fixtures.suggest) {
      it(c.name, () => expect(suggestLevel(c.skills as Array<{ level: number; confidence: DiagnosticConfidence }>)).toBe(c.expected));
    }
  });

  describe('cap', () => {
    for (const c of fixtures.cap) {
      it(c.name, () => expect(capLevel(c.current, c.suggested, c.firstApplied)).toBe(c.expected));
    }
  });

  describe('stop', () => {
    for (const c of fixtures.stop) {
      it(c.name, () => expect(shouldStopSkill(c.skill as DiagnosticSkill, c.n, c.sd, c.bankLeft)).toBe(c.expected));
    }
  });
});
