import { describe, expect, it } from 'vitest';
import { FOUNDATION_MAX_B, simulate, type BankItem, type SimResponder, type SimResult } from './engine';
import { DIAGNOSTIC_SKILLS, type DiagnosticMode, type DiagnosticSkill } from './rpc';

// Spec 4 §6 — simulation of the normative algorithm with a fixed-seed RNG.
// 500 runs × 7 true levels; bank = 5 items per skill × level, b = ordinal + 0.5,
// 4 options (the same shape as the content/diagnostic minimum).

/** mulberry32 — small deterministic PRNG returning [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BANK: BankItem[] = DIAGNOSTIC_SKILLS.flatMap((skill) =>
  Array.from({ length: 7 }, (_, level) =>
    Array.from({ length: 5 }, (_, k) => ({ id: `${skill}-${level}-${k}`, skill, b: level + 0.5, options: 4 })),
  ).flat(),
);

const RUNS = 500;
const LEVELS = [0, 1, 2, 3, 4, 5, 6];
/** The "unsure" onboarding path starts at a1 / topik1 (ordinal 1). */
const START_ORDINAL = 1;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? NaN) : ((s[m - 1] ?? NaN) + (s[m] ?? NaN)) / 2;
};

interface Run {
  level: number;
  theta: Record<DiagnosticSkill, number>;
  result: SimResult;
}

function runMany(opts: { mode: DiagnosticMode; responder: SimResponder; seed: number; levels?: number[]; startOrdinal?: number }): Run[] {
  const rng = mulberry32(opts.seed);
  const runs: Run[] = [];
  for (const level of opts.levels ?? LEVELS) {
    for (let i = 0; i < RUNS; i++) {
      // True ability inside the level band [L, L + 1), independently per skill.
      const theta = {
        vocabulary: level + 0.1 + 0.8 * rng(),
        grammar: level + 0.1 + 0.8 * rng(),
        reading: level + 0.1 + 0.8 * rng(),
      };
      const result = simulate({
        trueTheta: theta,
        mode: opts.mode,
        currentOrdinal: opts.startOrdinal ?? START_ORDINAL,
        bank: BANK,
        rng,
        responder: opts.responder,
      });
      runs.push({ level, theta, result });
    }
  }
  return runs;
}

const estimates = (runs: Run[]) =>
  runs.flatMap((r) =>
    DIAGNOSTIC_SKILLS.flatMap((s) => {
      const e = r.result.skills[s];
      return e ? [{ level: r.level, theta: r.theta[s], e }] : [];
    }),
  );

describe('diagnostic simulation (spec §6)', () => {
  const full = runMany({ mode: 'full', responder: 'model', seed: 20261013 });
  const est = estimates(full);

  it('median |EAP − θ| ≤ 0.5', () => {
    const m = median(est.map((x) => Math.abs(x.e.mean - x.theta)));
    console.info(`median |EAP − θ| = ${m.toFixed(4)}`);
    expect(m).toBeLessThanOrEqual(0.5);
  });

  it('places a skill ≥ 2 levels too high in < 2% of estimates', () => {
    const over = est.filter((x) => x.e.level >= x.level + 2).length / est.length;
    const overSuggested = full.filter((r) => r.result.suggested !== null && r.result.suggested >= r.level + 2).length / full.length;
    console.info(`over-placement ≥ 2: skills ${(over * 100).toFixed(3)}%, suggestion ${(overSuggested * 100).toFixed(3)}%`);
    expect(over).toBeLessThan(0.02);
    expect(overSuggested).toBeLessThan(0.02);
  });

  it('averages ≤ 30 items per attempt', () => {
    const mean = full.reduce((s, r) => s + r.result.answered, 0) / full.length;
    console.info(`mean length = ${mean.toFixed(2)} (max ${Math.max(...full.map((r) => r.result.answered))})`);
    expect(mean).toBeLessThanOrEqual(30);
    expect(full.every((r) => r.result.answered <= 30)).toBe(true);
  });

  it('reports per-level accuracy (informational)', () => {
    for (const level of LEVELS) {
      const xs = est.filter((x) => x.level === level);
      const exact = xs.filter((x) => x.e.level === level).length / xs.length;
      const medErr = median(xs.map((x) => Math.abs(x.e.mean - x.theta)));
      const meanLevel = xs.reduce((s, x) => s + x.e.level, 0) / xs.length;
      console.info(`level ${level}: median|err| ${medErr.toFixed(3)}, exact ${(exact * 100).toFixed(1)}%, mean reported ${meanLevel.toFixed(2)}`);
    }
    expect(est.length).toBeGreaterThan(0);
  });

  it('keeps random guessers at or below a1 (ordinal 1) from the unsure start', () => {
    const guess = runMany({ mode: 'full', responder: 'guess', seed: 8, levels: [0] });
    const maxLevel = Math.max(...estimates(guess).map((x) => x.e.level));
    const maxSuggested = Math.max(...guess.map((r) => r.result.suggested ?? 0));
    console.info(`guesser from ordinal ${START_ORDINAL}: max skill level ${maxLevel}, max suggestion ${maxSuggested}`);
    expect(maxLevel).toBeLessThanOrEqual(1);
    expect(maxSuggested).toBeLessThanOrEqual(1);
  });

  it('reports guessers from higher starting levels (informational)', () => {
    // The prior is centred on the path's current level, so a guesser on an
    // advanced path is pulled down but not always to a1 within 30 items.
    for (const startOrdinal of [0, 2, 3, 4, 5, 6]) {
      const guess = runMany({ mode: 'full', responder: 'guess', seed: 8 + startOrdinal, levels: [0], startOrdinal });
      const levels = estimates(guess).map((x) => x.e.level);
      const sug = guess.map((r) => r.result.suggested).filter((s): s is number => s !== null);
      const share = (xs: number[]) => ((xs.filter((l) => l > 1).length / Math.max(1, xs.length)) * 100).toFixed(1);
      console.info(
        `guesser from ordinal ${startOrdinal}: skill level > a1 ${share(levels)}% (max ${Math.max(...levels)}), suggestion > a1 ${share(sug)}% (max ${Math.max(0, ...sug)})`,
      );
    }
    expect(true).toBe(true);
  });

  it('foundation mode never serves b > 1.5 and stops at 8 items', () => {
    for (const responder of ['model', 'all_right', 'guess'] as const) {
      const runs = runMany({ mode: 'foundation', responder, seed: 99, levels: [0, 3, 6] });
      expect(runs.every((r) => r.result.servedB.every((b) => b <= FOUNDATION_MAX_B))).toBe(true);
      expect(runs.every((r) => r.result.answered <= 8)).toBe(true);
    }
  });

  it('stops early after 3 wrong answers on easy first-skill items', () => {
    const rng = mulberry32(1);
    const r = simulate({
      trueTheta: { vocabulary: 0, grammar: 0, reading: 0 },
      mode: 'full',
      currentOrdinal: 0,
      bank: BANK,
      rng,
      responder: 'all_wrong',
    });
    expect(r.earlyStop).toBe(true);
    expect(r.answered).toBe(3);
    expect(r.skills.grammar).toBeNull();
    expect(r.suggested).toBeNull();
  });

  it('sends all-right responders up and is deterministic for a seed', () => {
    const a = runMany({ mode: 'full', responder: 'all_right', seed: 5, levels: [6] });
    const b = runMany({ mode: 'full', responder: 'all_right', seed: 5, levels: [6] });
    expect(a.map((r) => r.result.answered)).toEqual(b.map((r) => r.result.answered));
    expect(Math.min(...estimates(a).map((x) => x.e.level))).toBeGreaterThanOrEqual(3);
  });
});
