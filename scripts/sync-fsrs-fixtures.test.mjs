import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gen = join(root, 'scripts', 'gen-fsrs-fixtures.mjs');
const sync = join(root, 'scripts', 'sync-fsrs-fixtures.mjs');
const committed = join(root, 'packages', 'shared', 'src', 'review', 'fsrs.fixtures.json');

const run = (script, args, env) =>
  spawnSync(process.execPath, [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });

const withTmp = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'fsrs-fixtures-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('gen: output is deterministic and --check detects drift', () =>
  withTmp((dir) => {
    const a = join(dir, 'a.json');
    const b = join(dir, 'b.json');
    assert.equal(run(gen, [], { FSRS_FIXTURES: a }).status, 0);
    assert.equal(run(gen, [], { FSRS_FIXTURES: b }).status, 0);
    assert.equal(readFileSync(a, 'utf8'), readFileSync(b, 'utf8'));
    assert.equal(run(gen, ['--check'], { FSRS_FIXTURES: a }).status, 0);

    const data = JSON.parse(readFileSync(a, 'utf8'));
    data.cases[0].steps[0].expected.stability = 123;
    writeFileSync(a, JSON.stringify(data, null, 2) + '\n');
    const check = run(gen, ['--check'], { FSRS_FIXTURES: a });
    assert.equal(check.status, 1);
    assert.match(check.stderr, /out of date/);
  }));

test('gen: fixtures pin ts-fsrs, the FSRS-6 defaults and cover the required scenarios', () => {
  const data = JSON.parse(readFileSync(committed, 'utf8'));
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(data.ts_fsrs_version, pkg.devDependencies['ts-fsrs']);
  assert.match(data.ts_fsrs_version, /^\d+\.\d+\.\d+$/, 'ts-fsrs must be pinned exactly');
  assert.equal(data.params.weights.length, 21);
  assert.deepEqual(
    { ...data.params, weights: undefined },
    {
      weights: undefined,
      desired_retention: 0.9,
      maximum_interval: 365,
      learning_steps_minutes: [1, 10],
      relearning_steps_minutes: [10],
    },
  );
  assert.ok(data.cases.length >= 40, `expected >= 40 cases, got ${data.cases.length}`);
  assert.equal(new Set(data.cases.map((c) => c.name)).size, data.cases.length, 'case names are unique');

  const steps = data.cases.flatMap((c) => {
    assert.equal(c.tz, 'UTC');
    return c.steps;
  });
  const states = new Set(steps.map((s) => s.expected.state));
  for (const s of ['learning', 'review', 'relearning']) assert.ok(states.has(s), `reaches ${s}`);
  assert.ok(steps.some((s) => s.expected.lapse), 'has a lapse');
  assert.ok(steps.some((s) => s.expected.scheduled_days === 365), 'hits the maximum interval');
  // ts-fsrs caps each interval at maximum_interval, then forces hard < good < easy, so good/easy
  // may land one or two days past the cap. The SQL must reproduce that.
  assert.ok(steps.some((s) => s.expected.scheduled_days > 365), 'covers the ordering bump past the cap');
  const easyFromNew = data.cases.some((c) => c.steps[0].rating === 4 && c.steps[0].expected.state === 'review');
  assert.ok(easyFromNew, 'Easy from new graduates directly');
  for (const s of steps) {
    const e = s.expected;
    assert.ok([1, 2, 3, 4].includes(s.rating));
    assert.ok(Number.isInteger(e.interval_minutes) && e.interval_minutes > 0);
    if (e.scheduled_days > 0) assert.equal(e.interval_minutes, e.scheduled_days * 1440);
  }
});

test('gen: committed fixtures match the installed ts-fsrs', () => {
  assert.equal(run(gen, ['--check'], {}).status, 0);
});

const tinyFixtures = {
  ts_fsrs_version: '0.0.0',
  params: {
    weights: [],
    desired_retention: 0.9,
    maximum_interval: 365,
    learning_steps_minutes: [1, 10],
    relearning_steps_minutes: [10],
  },
  cases: [
    {
      name: "it's new",
      tz: 'UTC',
      start: '2026-01-01T09:00:00.000Z',
      steps: [
        {
          at: '2026-01-01T09:00:00.000Z',
          rating: 3,
          expected: {
            state: 'learning',
            step: 1,
            stability: 2.3065,
            difficulty: 2.11810397,
            scheduled_days: 0,
            interval_minutes: 10,
            lapse: false,
          },
        },
        {
          at: '2026-01-01T09:10:00.000Z',
          rating: 3,
          expected: {
            state: 'review',
            step: 0,
            stability: 2.5,
            difficulty: 2.1,
            scheduled_days: 3,
            interval_minutes: 4320,
            lapse: false,
          },
        },
      ],
    },
  ],
};

test('sync: chains each step from the previous expected state and checks every field', () =>
  withTmp((dir) => {
    const fx = join(dir, 'fixtures.json');
    const out = join(dir, 'review_fsrs.test.sql');
    writeFileSync(fx, JSON.stringify(tinyFixtures));
    const env = { FSRS_FIXTURES: fx, FSRS_OUT: out };
    assert.equal(run(sync, [], env).status, 0);
    const sql = readFileSync(out, 'utf8');
    assert.match(sql, /^-- GENERATED by scripts\/sync-fsrs-fixtures\.mjs/);
    assert.match(sql, /select plan\(16\);/);
    // First step: a new card with no previous review.
    assert.ok(
      sql.includes(
        `(1, 'it''s new #1', public.srs_next('new', 0::smallint, 0::double precision, 0::double precision, null::timestamptz, 3::smallint, '2026-01-01T09:00:00.000Z'::timestamptz, 'UTC'))`,
      ),
    );
    // Second step: inputs come from step 1's expected values; last review = step 1's time.
    assert.ok(
      sql.includes(
        `(2, 'it''s new #2', public.srs_next('learning', 1::smallint, 2.3065::double precision, 2.11810397::double precision, '2026-01-01T09:00:00.000Z'::timestamptz, 3::smallint, '2026-01-01T09:10:00.000Z'::timestamptz, 'UTC'))`,
      ),
    );
    assert.ok(sql.includes(`select is((select r->>'state' from fsrs_results where id = 1), 'learning', 'it''s new #1: state');`));
    assert.ok(sql.includes(`select is((select (r->>'step')::int from fsrs_results where id = 2), 0, 'it''s new #2: step');`));
    assert.ok(sql.includes(`select is((select (r->>'interval_minutes')::int from fsrs_results where id = 2), 4320, 'it''s new #2: interval_minutes');`));
    assert.ok(sql.includes(`select is((select (r->>'lapse')::boolean from fsrs_results where id = 1), false, 'it''s new #1: lapse');`));
    assert.ok(
      sql.includes(
        `select ok((select abs((r->>'stability')::double precision - 2.5) < 1e-6 from fsrs_results where id = 2), 'it''s new #2: stability');`,
      ),
    );
    // Minute steps are not snapped; day intervals snap to the start of the local (UTC) day.
    assert.ok(
      sql.includes(`select is((select (r->>'due_at')::timestamptz from fsrs_results where id = 1), '2026-01-01T09:10:00.000Z'::timestamptz, 'it''s new #1: due_at');`),
    );
    assert.ok(
      sql.includes(`select is((select (r->>'due_at')::timestamptz from fsrs_results where id = 2), '2026-01-04T00:00:00.000Z'::timestamptz, 'it''s new #2: due_at');`),
    );

    assert.equal(run(sync, ['--check'], env).status, 0);
    tinyFixtures.cases[0].steps[1].expected.scheduled_days = 4;
    writeFileSync(fx, JSON.stringify(tinyFixtures));
    const check = run(sync, ['--check'], env);
    assert.equal(check.status, 1);
    assert.match(check.stderr, /out of date/);
  }));

test('sync: the committed review_fsrs.test.sql is in sync', () => {
  assert.equal(run(sync, ['--check'], {}).status, 0);
});
