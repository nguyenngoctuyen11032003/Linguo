import type { DiagnosticConfidence, DiagnosticMode, DiagnosticSkill } from './rpc';
import { DIAGNOSTIC_SKILLS } from './rpc';

// Spec 4 §2 — adaptive diagnostic engine. Pure functions; the SQL mirror
// (supabase/migrations/20261014000410_diagnostic_engine.sql) must produce the
// same numbers, checked by engine.fixtures.json.

/** θ grid: −0.5, −0.25, …, 6.5 (29 points) on the level_reference_hours.ordinal scale. */
export const GRID: number[] = Array.from({ length: 29 }, (_, i) => -0.5 + i * 0.25);

export const PRIOR_SD = 1.25;
export const MIN_LEVEL = 0;
export const MAX_LEVEL = 6;
/** P(θ ≥ L) needed to report level L. */
export const LEVEL_MASS = 0.7;
export const RANGE_LOW_Q = 0.1;
export const RANGE_HIGH_Q = 0.9;
/** Tolerance for the ≥ comparisons on summed posterior mass (keeps TS and SQL in step). */
export const MASS_EPS = 1e-9;
export const STOP_SD = 0.45;
export const STOP_MIN_N = 4;
export const MAX_ITEMS_PER_SKILL: Record<DiagnosticSkill, number> = { vocabulary: 8, grammar: 8, reading: 5 };
export const MAX_ITEMS_TOTAL: Record<DiagnosticMode, number> = { full: 30, foundation: 8 };
export const FOUNDATION_MAX_B = 1.5;
export const EARLY_STOP_WRONG = 3;
export const EARLY_STOP_MAX_B = 1.0;
export const RAPID_SHARE_LIMIT = 0.3;
export const RAPID_ANSWER_MS = 800;
export const PICK_POOL = 3;

export interface ItemParams {
  b: number;
  options: number;
}
export interface Answer extends ItemParams {
  correct: boolean;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** 3PL-style probability of a correct answer, c = 1/options, D = 1.7. */
export function probCorrect(theta: number, b: number, options: number): number {
  const c = 1 / options;
  return c + (1 - c) * sigmoid(1.7 * (theta - b));
}

/**
 * Posterior weights on GRID: Normal(prior.mean, prior.sd) × Π likelihood, normalised.
 * Computed in log space (subtract the max before exponentiating) for stability.
 */
export function posterior(prior: { mean: number; sd: number }, answers: readonly Answer[]): number[] {
  const logs = GRID.map((theta) => {
    const z = (theta - prior.mean) / prior.sd;
    let l = -0.5 * z * z;
    for (const a of answers) {
      const p = probCorrect(theta, a.b, a.options);
      l += Math.log(a.correct ? p : 1 - p);
    }
    return l;
  });
  const max = Math.max(...logs);
  const raw = logs.map((l) => Math.exp(l - max));
  const total = raw.reduce((s, x) => s + x, 0);
  return raw.map((x) => x / total);
}

/** Expected a posteriori mean and posterior SD. */
export function eap(weights: readonly number[]): { mean: number; sd: number } {
  let mean = 0;
  weights.forEach((w, i) => (mean += w * (GRID[i] ?? 0)));
  let variance = 0;
  weights.forEach((w, i) => {
    const d = (GRID[i] ?? 0) - mean;
    variance += w * d * d;
  });
  return { mean, sd: Math.sqrt(variance) };
}

/** Largest level L (0..6) with P(θ ≥ L) ≥ 0.7; 0 when none qualifies. */
export function conservativeLevel(weights: readonly number[]): number {
  for (let level = MAX_LEVEL; level >= MIN_LEVEL; level--) {
    let mass = 0;
    weights.forEach((w, i) => {
      if ((GRID[i] ?? -Infinity) >= level) mass += w;
    });
    if (mass >= LEVEL_MASS - MASS_EPS) return level;
  }
  return MIN_LEVEL;
}

/** Smallest grid θ whose cumulative mass (in grid order) reaches p. */
function quantile(weights: readonly number[], p: number): number {
  let cum = 0;
  for (let i = 0; i < weights.length; i++) {
    cum += weights[i] ?? 0;
    if (cum >= p - MASS_EPS) return GRID[i] ?? MAX_LEVEL;
  }
  return GRID[GRID.length - 1] ?? MAX_LEVEL;
}

const clampLevel = (x: number) => Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, x));

/** floor(10% quantile) … floor(90% quantile), clamped to 0..6. */
export function levelRange(weights: readonly number[]): { low: number; high: number } {
  return {
    low: clampLevel(Math.floor(quantile(weights, RANGE_LOW_Q))),
    high: clampLevel(Math.floor(quantile(weights, RANGE_HIGH_Q))),
  };
}

const CONFIDENCE_ORDER: readonly DiagnosticConfidence[] = ['low', 'medium', 'high'];

/**
 * high: sd ≤ 0.45 and n ≥ 6; medium: sd ≤ 0.75; else low.
 * More than 30% of the attempt's answers under 800 ms downgrades one step.
 */
export function confidenceFor(sd: number, n: number, rapidShare: number): DiagnosticConfidence {
  let idx = sd <= STOP_SD && n >= 6 ? 2 : sd <= 0.75 ? 1 : 0;
  if (rapidShare > RAPID_SHARE_LIMIT) idx = Math.max(0, idx - 1);
  return CONFIDENCE_ORDER[idx] ?? 'low';
}

/** Lower median of the levels with confidence ≥ medium; null when fewer than 2. */
export function suggestLevel(skills: ReadonlyArray<{ level: number; confidence: DiagnosticConfidence }>): number | null {
  const levels = skills
    .filter((s) => s.confidence !== 'low')
    .map((s) => s.level)
    .sort((a, b) => a - b);
  if (levels.length < 2) return null;
  return levels[Math.floor((levels.length - 1) / 2)] ?? null;
}

/**
 * Upward moves are capped at +2 when no diagnostic result has been applied to the
 * path yet (`firstApplied` = this would be the first), +1 afterwards. Moving down is free.
 */
export function capLevel(current: number, suggested: number, firstApplied: boolean): number {
  return Math.min(suggested, current + (firstApplied ? 2 : 1));
}

/** (n ≥ 4 and sd ≤ 0.45) or n = per-skill max (8; reading 5) or no items left. */
export function shouldStopSkill(skill: DiagnosticSkill, n: number, sd: number, bankLeft: number): boolean {
  return (n >= STOP_MIN_N && sd <= STOP_SD) || n >= MAX_ITEMS_PER_SKILL[skill] || bankLeft <= 0;
}

/**
 * The 3 candidates nearest the EAP (|b − EAP|, ties by id in code-point order),
 * then index floor(r · k). Candidates must already be filtered (unseen, mode).
 */
export function pickItem(candidates: ReadonlyArray<{ id: string; b: number }>, eapMean: number, r: number): string | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((x, y) => {
    const d = Math.abs(x.b - eapMean) - Math.abs(y.b - eapMean);
    if (d !== 0) return d;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  });
  const k = Math.min(PICK_POOL, sorted.length);
  const idx = Math.min(k - 1, Math.floor(r * k));
  return sorted[idx]?.id ?? null;
}

/** Whether the last answers trigger the first-skill early stop (3 wrong in a row, all b ≤ 1.0). */
export function isEarlyStop(answers: readonly Answer[]): boolean {
  if (answers.length < EARLY_STOP_WRONG) return false;
  return answers.slice(-EARLY_STOP_WRONG).every((a) => !a.correct && a.b <= EARLY_STOP_MAX_B);
}

// ---------------------------------------------------------------------------
// Simulation (used by simulation.test.ts; mirrors the RPC flow end to end)
// ---------------------------------------------------------------------------

export interface BankItem extends ItemParams {
  id: string;
  skill: DiagnosticSkill;
}

export interface SimSkillResult {
  n: number;
  mean: number;
  sd: number;
  level: number;
  range: { low: number; high: number };
  confidence: DiagnosticConfidence;
}

export interface SimResult {
  skills: Record<DiagnosticSkill, SimSkillResult | null>;
  answered: number;
  earlyStop: boolean;
  /** Difficulties of every served item, in order. */
  servedB: number[];
  suggested: number | null;
}

export type SimResponder = 'model' | 'guess' | 'all_right' | 'all_wrong';

export function simulate(opts: {
  trueTheta: Record<DiagnosticSkill, number>;
  mode: DiagnosticMode;
  currentOrdinal: number;
  bank: readonly BankItem[];
  rng: () => number;
  responder?: SimResponder;
}): SimResult {
  const { trueTheta, mode, currentOrdinal, bank, rng } = opts;
  const responder = opts.responder ?? 'model';
  const limit = MAX_ITEMS_TOTAL[mode];
  const skills: Record<DiagnosticSkill, SimSkillResult | null> = { vocabulary: null, grammar: null, reading: null };
  const finishedMeans: number[] = [];
  const servedB: number[] = [];
  let earlyStop = false;

  DIAGNOSTIC_SKILLS.forEach((skill, skillIndex) => {
    if (earlyStop || servedB.length >= limit) return;
    const mu0 =
      finishedMeans.length > 0
        ? finishedMeans.reduce((s, x) => s + x, 0) / finishedMeans.length
        : mode === 'foundation'
          ? 0.5
          : currentOrdinal + 0.5;
    const prior = { mean: mu0, sd: PRIOR_SD };
    const answers: Answer[] = [];
    const used = new Set<string>();
    for (;;) {
      const { mean, sd } = eap(posterior(prior, answers));
      const pool = bank.filter(
        (it) => it.skill === skill && !used.has(it.id) && (mode !== 'foundation' || it.b <= FOUNDATION_MAX_B),
      );
      if (shouldStopSkill(skill, answers.length, sd, pool.length) || servedB.length >= limit) break;
      const id = pickItem(pool, mean, rng());
      const item = pool.find((it) => it.id === id);
      if (!item) break;
      used.add(item.id);
      servedB.push(item.b);
      const correct =
        responder === 'all_right'
          ? true
          : responder === 'all_wrong'
            ? false
            : responder === 'guess'
              ? rng() < 1 / item.options
              : rng() < probCorrect(trueTheta[skill], item.b, item.options);
      answers.push({ b: item.b, options: item.options, correct });
      if (skillIndex === 0 && isEarlyStop(answers)) {
        earlyStop = true;
        break;
      }
    }
    if (answers.length === 0) return;
    const w = posterior(prior, answers);
    const { mean, sd } = eap(w);
    skills[skill] = {
      n: answers.length,
      mean,
      sd,
      level: conservativeLevel(w),
      range: levelRange(w),
      confidence: confidenceFor(sd, answers.length, 0),
    };
    finishedMeans.push(mean);
  });

  const estimated = DIAGNOSTIC_SKILLS.map((s) => skills[s]).filter((s): s is SimSkillResult => s !== null);
  return { skills, answered: servedB.length, earlyStop, servedB, suggested: suggestLevel(estimated) };
}
