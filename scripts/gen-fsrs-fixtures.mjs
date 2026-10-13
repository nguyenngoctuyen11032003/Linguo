#!/usr/bin/env node
// Runs the pinned ts-fsrs (FSRS-6, fuzz off, srs_config parameters) over hand-picked rating
// sequences and writes packages/shared/src/review/fsrs.fixtures.json. The SQL implementation
// (public.srs_next) is parity-tested against this file via scripts/sync-fsrs-fixtures.mjs.
// Usage: node scripts/gen-fsrs-fixtures.mjs [--check]
// FSRS_FIXTURES overrides the output path (used by the tests).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FSRSVersion, State, createEmptyCard, default_w, fsrs, generatorParameters } from 'ts-fsrs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.FSRS_FIXTURES || join(root, 'packages', 'shared', 'src', 'review', 'fsrs.fixtures.json');
// e.g. "v5.4.2 using FSRS-6.0"
const versionMatch = /^v(\d+\.\d+\.\d+) using FSRS-6\./.exec(FSRSVersion);
if (!versionMatch) throw new Error(`Expected a ts-fsrs release implementing FSRS-6, got "${FSRSVersion}"`);
const version = versionMatch[1];

// Must equal the public.srs_config seed.
const PARAMS = {
  weights: [...default_w],
  desired_retention: 0.9,
  maximum_interval: 365,
  learning_steps_minutes: [1, 10],
  relearning_steps_minutes: [10],
};
const scheduler = fsrs(
  generatorParameters({
    w: PARAMS.weights,
    request_retention: PARAMS.desired_retention,
    maximum_interval: PARAMS.maximum_interval,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: PARAMS.learning_steps_minutes.map((m) => `${m}m`),
    relearning_steps: PARAMS.relearning_steps_minutes.map((m) => `${m}m`),
  }),
);
const STATE = { [State.New]: 'new', [State.Learning]: 'learning', [State.Review]: 'review', [State.Relearning]: 'relearning' };
const START = '2026-01-01T09:00:00.000Z';
const MIN = 60_000;
const DAY = 1440 * MIN;

// A step is a rating (reviewed exactly when due) or [rating, when]:
//   'due+Nd'      N days after it was due (overdue)
//   '+Nm'|'+Nh'|'+Nd'  that long after the previous review (early or same-day reviews)
const A = 1;
const H = 2;
const G = 3;
const E = 4;
const rep = (n, r) => Array.from({ length: n }, () => r);
const CASES = [
  // First rating of a new card.
  ['new: again', [A]],
  ['new: hard', [H]],
  ['new: good', [G]],
  ['new: easy graduates to review', [E]],
  // Every pair of first two ratings, then two Goods.
  ...[A, H, G, E].flatMap((r1) =>
    [A, H, G, E].map((r2) => [`pair: ${'AHGE'[r1 - 1]}${'AHGE'[r2 - 1]} then good x2`, [r1, r2, G, G]]),
  ),
  // Learning steps.
  ['learning: good good graduates', [G, G]],
  ['learning: hard repeated stays on step', [H, H, H, G, G]],
  ['learning: again resets steps', [G, A, G, G]],
  ['learning: step answered days late', [G, [G, '+3d'], G]],
  ['learning: many agains', [A, A, A, A, G, G, G]],
  // Review chains.
  ['review: good chain to the cap', [G, G, ...rep(12, G)]],
  ['review: easy chain to the cap', [E, ...rep(9, E)]],
  ['review: hard chain', [G, G, ...rep(10, H)]],
  ['review: alternating hard easy', [G, G, H, E, H, E, H, E]],
  ['review: same-day review', [G, G, [G, '+2h'], [E, '+1h'], G]],
  ['review: reviewed a day early', [G, G, G, [G, '+1d'], G]],
  // Lapses and relearning.
  ['lapse: again in review then good', [G, G, G, A, G, G, G]],
  ['lapse: relearning hard then good', [G, G, G, A, H, G, G]],
  ['lapse: relearning again again', [G, G, G, A, A, A, G, G]],
  ['lapse: easy out of relearning', [G, G, G, A, E, G]],
  ['lapse: repeated lapses', [G, G, G, A, G, G, A, G, G, A, G, G]],
  ['lapse: after long stability', [E, E, E, E, E, A, G, G, G]],
  // Overdue reviews.
  ['overdue: good 30 days late', [G, G, G, [G, 'due+30d'], G]],
  ['overdue: good 200 days late', [G, G, [G, 'due+200d'], G]],
  ['overdue: again 200 days late', [G, G, [A, 'due+200d'], G, G]],
  ['overdue: easy 90 days late', [E, E, [E, 'due+90d'], E]],
  ['overdue: hard 60 days late', [G, G, G, [H, 'due+60d'], H]],
  ['overdue: learning card left for a month', [A, [G, '+30d'], G]],
];

function stepTime(prevAt, prevDue, when) {
  if (when === undefined) return prevDue;
  let m = /^due\+(\d+)d$/.exec(when);
  if (m) return new Date(prevDue.getTime() + Number(m[1]) * DAY);
  m = /^\+(\d+)([mhd])$/.exec(when);
  if (m) return new Date(prevAt.getTime() + Number(m[1]) * { m: MIN, h: 60 * MIN, d: DAY }[m[2]]);
  throw new Error(`Bad step time: ${when}`);
}

const cases = CASES.map(([name, seq]) => {
  let card = createEmptyCard(new Date(START));
  let at = new Date(START);
  let due = new Date(START);
  const steps = seq.map((entry, i) => {
    const [rating, when] = Array.isArray(entry) ? entry : [entry, undefined];
    if (i > 0) at = stepTime(at, due, when);
    const before = STATE[card.state];
    const next = scheduler.next(card, at, rating).card;
    const interval = (next.due.getTime() - at.getTime()) / MIN;
    if (!Number.isInteger(interval)) throw new Error(`${name}: non-integer interval ${interval}`);
    card = next;
    due = next.due;
    return {
      at: at.toISOString(),
      rating,
      expected: {
        state: STATE[next.state],
        step: next.learning_steps,
        stability: next.stability,
        difficulty: next.difficulty,
        scheduled_days: next.scheduled_days,
        interval_minutes: interval,
        lapse: before === 'review' && rating === A,
      },
    };
  });
  return { name, tz: 'UTC', start: START, steps };
});

const out = JSON.stringify({ ts_fsrs_version: version, params: PARAMS, cases }, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replaceAll('\r\n', '\n') : '';
  if (current !== out) {
    console.error('::error::packages/shared/src/review/fsrs.fixtures.json is out of date. Run `pnpm fixtures:fsrs` and commit.');
    process.exit(1);
  }
  console.log('FSRS fixtures match ts-fsrs.');
} else {
  writeFileSync(OUT, out);
  console.log(`Wrote ${OUT} (${cases.length} cases, ${cases.reduce((n, c) => n + c.steps.length, 0)} steps).`);
}
