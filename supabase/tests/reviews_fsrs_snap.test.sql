-- Spec 3 §2/§7: FSRS SQL beyond the generated ts-fsrs parity test (review_fsrs.test.sql): local-day snapping
-- (Asia/Seoul vs America/Los_Angeles), local elapsed days, rating adjustment, previews, retrievability, grants.
-- Default srs_config: ts-fsrs 5.4.2 default_w, desired_retention 0.9 (interval modifier exactly 1),
-- maximum_interval 365, learning steps {1,10}, relearning steps {10}. A new card rated Easy gets S = w3 = 8.2956
-- → 8 days.
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

-- ===== Day snapping =====
-- 2026-03-10T20:00Z is 2026-03-11 05:00 in Seoul (UTC+9) and 2026-03-10 13:00 in Los Angeles (PDT, UTC-7).
select is(public.srs_next('new', 0::smallint, 0, 0, null, 4::smallint, '2026-03-10T20:00Z', 'Asia/Seoul')->>'scheduled_days', '8',
  'Easy on a new card: 8 days');
select is((public.srs_next('new', 0::smallint, 0, 0, null, 4::smallint, '2026-03-10T20:00Z', 'Asia/Seoul')->>'due_at')::timestamptz,
  '2026-03-19T00:00:00+09:00'::timestamptz, 'Seoul: due at the start of the local day 8 days after the local review date');
select is((public.srs_next('new', 0::smallint, 0, 0, null, 4::smallint, '2026-03-10T20:00Z', 'America/Los_Angeles')->>'due_at')::timestamptz,
  '2026-03-18T00:00:00-07:00'::timestamptz, 'Los Angeles: same instant, earlier local date → due one local day earlier');
select is((public.srs_next('new', 0::smallint, 0, 0, null, 4::smallint, '2026-03-10T20:00Z', 'Asia/Seoul')->>'interval_minutes')::int,
  11520, 'interval_minutes is the nominal 8 days, not the snapped distance');
select is((public.srs_next('new', 0::smallint, 0, 0, null, 4::smallint, '2026-03-10T20:00Z', 'America/Los_Angeles')->>'interval_minutes')::int,
  11520, 'interval_minutes does not depend on the time zone');
select is((public.srs_next('new', 0::smallint, 0, 0, null, 4::smallint, '2026-03-10T20:00Z', 'UTC')->>'due_at')::timestamptz,
  '2026-03-18T00:00:00Z'::timestamptz, 'UTC: start of the UTC day');

-- DST: Los Angeles springs forward on 2026-03-08; 8 local days from 2026-03-07 is midnight PDT, not now + 192 h.
select is((public.srs_next('new', 0::smallint, 0, 0, null, 4::smallint, '2026-03-07T20:00Z', 'America/Los_Angeles')->>'due_at')::timestamptz,
  '2026-03-15T07:00:00Z'::timestamptz, 'Los Angeles across DST: due at local midnight (07:00Z)');
select is((public.srs_next('new', 0::smallint, 0, 0, null, 4::smallint, '2026-03-07T20:00Z', 'Asia/Seoul')->>'due_at')::timestamptz,
  '2026-03-15T15:00:00Z'::timestamptz, 'Seoul (no DST): due at local midnight (15:00Z the previous UTC day)');

-- Learning steps are minutes from now, never snapped.
select is((public.srs_next('new', 0::smallint, 0, 0, null, 3::smallint, '2026-03-10T20:00Z', 'Asia/Seoul')->>'due_at')::timestamptz,
  '2026-03-10T20:10:00Z'::timestamptz, 'Good on a new card: learning step 10 min, not snapped (Seoul)');
select is((public.srs_next('new', 0::smallint, 0, 0, null, 3::smallint, '2026-03-10T20:00Z', 'America/Los_Angeles')->>'due_at')::timestamptz,
  '2026-03-10T20:10:00Z'::timestamptz, 'Good on a new card: learning step 10 min, not snapped (Los Angeles)');
select is((public.srs_next('new', 0::smallint, 0, 0, null, 3::smallint, '2026-03-10T20:00Z', 'Asia/Seoul')->>'scheduled_days')::int,
  0, 'learning step: scheduled_days 0');
select is((public.srs_next('review', 0::smallint, 20, 5, '2026-03-01T20:00Z', 1::smallint, '2026-03-10T20:00Z', 'Asia/Seoul')->>'due_at')::timestamptz,
  '2026-03-10T20:10:00Z'::timestamptz, 'Again on a review card: relearning step 10 min, not snapped');

-- ===== Elapsed days are local calendar days =====
-- Last review 2026-03-10T14:00Z, now 2026-03-10T16:00Z: Seoul 23:00 → 01:00 next day (1 day); LA 07:00 → 09:00 (same day).
select is(
  (public.srs_next('review', 0::smallint, 5, 5, '2026-03-10T14:00Z', 3::smallint, '2026-03-10T16:00Z', 'Asia/Seoul')->>'stability')::float8,
  (public.srs_next('review', 0::smallint, 5, 5, '2026-03-10T14:00Z', 3::smallint, '2026-03-11T16:00Z', 'UTC')->>'stability')::float8,
  'Seoul: crossing local midnight counts as 1 elapsed day');
select is(
  (public.srs_next('review', 0::smallint, 5, 5, '2026-03-10T14:00Z', 3::smallint, '2026-03-10T16:00Z', 'America/Los_Angeles')->>'stability')::float8,
  (public.srs_next('review', 0::smallint, 5, 5, '2026-03-10T14:00Z', 3::smallint, '2026-03-10T16:00Z', 'UTC')->>'stability')::float8,
  'Los Angeles: same local day → short-term (0 elapsed days)');
select isnt(
  (public.srs_next('review', 0::smallint, 5, 5, '2026-03-10T14:00Z', 3::smallint, '2026-03-10T16:00Z', 'Asia/Seoul')->>'stability')::float8,
  (public.srs_next('review', 0::smallint, 5, 5, '2026-03-10T14:00Z', 3::smallint, '2026-03-10T16:00Z', 'America/Los_Angeles')->>'stability')::float8,
  'the two zones schedule the same instants differently');
select is(
  (public.srs_next('review', 0::smallint, 5, 5, '2026-03-10T16:00Z', 3::smallint, '2026-03-10T14:00Z', 'UTC')->>'stability')::float8,
  (public.srs_next('review', 0::smallint, 5, 5, '2026-03-10T14:00Z', 3::smallint, '2026-03-10T16:00Z', 'UTC')->>'stability')::float8,
  'a review time before the last review counts as 0 elapsed days');

-- ===== Result shape, lapses, cap =====
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.srs_next('new', 0::smallint, 0, 0, null, 3::smallint, now(), 'UTC')) k),
  array['difficulty', 'due_at', 'interval_minutes', 'lapse', 'scheduled_days', 'stability', 'state', 'step'],
  'srs_next returns exactly the contract keys');
select is(public.srs_next('new', null, null, null, null, 3::smallint, '2026-03-10T20:00Z', 'UTC'),
  public.srs_next('new', 0::smallint, 0, 0, null, 3::smallint, '2026-03-10T20:00Z', 'UTC'),
  'a new card accepts null step/stability/difficulty like zeros');
select is(public.srs_next('review', 0::smallint, 20, 5, '2026-03-01T20:00Z', 1::smallint, '2026-03-10T20:00Z', 'UTC')->>'state',
  'relearning', 'Again on review → relearning');
select is((public.srs_next('review', 0::smallint, 20, 5, '2026-03-01T20:00Z', 1::smallint, '2026-03-10T20:00Z', 'UTC')->>'lapse')::boolean,
  true, 'Again on review is a lapse');
select is((public.srs_next('relearning', 0::smallint, 2, 6, '2026-03-10T20:00Z', 1::smallint, '2026-03-10T20:10:00Z', 'UTC')->>'lapse')::boolean,
  false, 'Again while relearning is not another lapse');
select is((public.srs_next('review', 0::smallint, 20, 5, '2026-03-01T20:00Z', 3::smallint, '2026-03-10T20:00Z', 'UTC')->>'lapse')::boolean,
  false, 'Good on review is not a lapse');
select is((public.srs_next('relearning', 0::smallint, 2, 6, '2026-03-10T20:00Z', 2::smallint, '2026-03-10T20:10:00Z', 'UTC')->>'interval_minutes')::int,
  15, 'Hard with one relearning step: 1.5 × 10 min');
select is((public.srs_next('learning', 0::smallint, 2.3065, 2.1181, '2026-03-10T20:00Z', 2::smallint, '2026-03-10T20:01:00Z', 'UTC')->>'interval_minutes')::int,
  6, 'Hard on a learning step: mean of the first two steps (5.5 → 6)');
select is((public.srs_next('review', 0::smallint, 36500, 5, '2026-01-01T00:00Z', 2::smallint, '2027-01-01T00:00Z', 'UTC')->>'scheduled_days')::int,
  365, 'Hard is capped at maximum_interval');
select is((public.srs_next('review', 0::smallint, 36500, 5, '2026-01-01T00:00Z', 3::smallint, '2027-01-01T00:00Z', 'UTC')->>'scheduled_days')::int,
  366, 'Good stays one day above Hard even at the cap (ts-fsrs)');
select is((public.srs_next('review', 0::smallint, 36500, 5, '2026-01-01T00:00Z', 4::smallint, '2027-01-01T00:00Z', 'UTC')->>'scheduled_days')::int,
  367, 'Easy stays one day above Good even at the cap (ts-fsrs)');
select throws_ok($$select public.srs_next('review', 0::smallint, 5, 5, now(), 5::smallint, now(), 'UTC')$$, 'P0001', 'invalid_rating', 'rating 5 is rejected');
select throws_ok($$select public.srs_next('review', 0::smallint, 5, 5, now(), 0::smallint, now(), 'UTC')$$, 'P0001', 'invalid_rating', 'rating 0 is rejected');
select throws_ok($$select public.srs_next('mastered', 0::smallint, 5, 5, now(), 3::smallint, now(), 'UTC')$$, 'P0001', 'invalid_state', 'unknown state is rejected');

-- ===== srs_adjust_rating =====
select is(public.srs_adjust_rating(3::smallint, 3::smallint, 0::smallint), 3::smallint, 'no hint, confident Good stays Good');
select is(public.srs_adjust_rating(4::smallint, null, 0::smallint), 4::smallint, 'no confidence given: Easy stays Easy');
select is(public.srs_adjust_rating(4::smallint, 3::smallint, 1::smallint), 2::smallint, 'a hint caps Easy at Hard');
select is(public.srs_adjust_rating(3::smallint, 2::smallint, 2::smallint), 2::smallint, 'a hint caps Good at Hard');
select is(public.srs_adjust_rating(1::smallint, 3::smallint, 1::smallint), 1::smallint, 'a hint keeps Again as Again');
select is(public.srs_adjust_rating(2::smallint, 1::smallint, 0::smallint), 2::smallint, 'Hard with confidence 1 stays Hard');
select is(public.srs_adjust_rating(3::smallint, 1::smallint, 0::smallint), 2::smallint, 'correct but guessed (confidence 1): Good → Hard');
select is(public.srs_adjust_rating(4::smallint, 1::smallint, 0::smallint), 2::smallint, 'correct but guessed (confidence 1): Easy → Hard');
select is(public.srs_adjust_rating(1::smallint, 1::smallint, 0::smallint), 1::smallint, 'Again with confidence 1 stays Again');

-- ===== srs_previews =====
create temp table preview_cards (label text, st text, step smallint, s float8, d float8, lr timestamptz, nw timestamptz, tz text) on commit drop;
insert into preview_cards values
  ('new', 'new', 0, 0, 0, null, '2026-03-10T20:00Z', 'Asia/Seoul'),
  ('learning step 1', 'learning', 1, 2.3065, 2.1181, '2026-03-10T19:59Z', '2026-03-10T20:00Z', 'America/Los_Angeles'),
  ('relearning', 'relearning', 0, 2, 6, '2026-03-10T19:50Z', '2026-03-10T20:00Z', 'Asia/Seoul'),
  ('review overdue', 'review', 0, 12, 5, '2026-02-01T20:00Z', '2026-03-10T20:00Z', 'America/Los_Angeles'),
  ('review same day', 'review', 0, 3, 7, '2026-03-10T10:00Z', '2026-03-10T20:00Z', 'Asia/Seoul');

select is(
  (select count(*)::int from preview_cards c,
     lateral (select public.srs_previews(c.st, c.step, c.s, c.d, c.lr, c.nw, c.tz) p) x
   where (p->'again'->>'interval_minutes')::int <= (p->'hard'->>'interval_minutes')::int
     and (p->'hard'->>'interval_minutes')::int <= (p->'good'->>'interval_minutes')::int
     and (p->'good'->>'interval_minutes')::int <= (p->'easy'->>'interval_minutes')::int),
  5, 'previews: again ≤ hard ≤ good ≤ easy (interval_minutes) for every state');
select is(
  (select count(*)::int from preview_cards c,
     lateral (select public.srs_previews(c.st, c.step, c.s, c.d, c.lr, c.nw, c.tz) p) x
   where (p->'again'->>'due_at')::timestamptz <= (p->'hard'->>'due_at')::timestamptz
     and (p->'hard'->>'due_at')::timestamptz <= (p->'good'->>'due_at')::timestamptz
     and (p->'good'->>'due_at')::timestamptz <= (p->'easy'->>'due_at')::timestamptz),
  5, 'previews: again ≤ hard ≤ good ≤ easy (due_at) for every state');
select is(
  (select count(*)::int from preview_cards c, generate_series(1, 4) g,
     lateral (select public.srs_previews(c.st, c.step, c.s, c.d, c.lr, c.nw, c.tz) p,
                     public.srs_next(c.st, c.step, c.s, c.d, c.lr, g::smallint, c.nw, c.tz) n) x
   where p->((array['again', 'hard', 'good', 'easy'])[g]) = jsonb_build_object('interval_minutes', n->'interval_minutes', 'due_at', n->'due_at')),
  20, 'each preview equals the srs_next outcome for that rating');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.srs_previews('new', 0::smallint, 0, 0, null, now(), 'UTC')) k),
  array['again', 'easy', 'good', 'hard'], 'previews has the four rating keys');
select is(public.srs_previews('new', 0::smallint, 0, 0, null, '2026-03-10T20:00Z', 'Asia/Seoul')->'again',
  '{"interval_minutes": 1, "due_at": "2026-03-10T20:01:00+00:00"}'::jsonb, 'new card Again preview: 1 min');
select is((public.srs_previews('new', 0::smallint, 0, 0, null, '2026-03-10T20:00Z', 'Asia/Seoul')->'easy'->>'due_at')::timestamptz,
  '2026-03-19T00:00:00+09:00'::timestamptz, 'new card Easy preview is snapped to the local day');

-- ===== srs_retrievability =====
select is(public.srs_retrievability(10, 0), 1::float8, 'R = 1 right after a review');
select is(public.srs_retrievability(10, 10), 0.9::float8, 'R = 0.9 after S days (definition of stability)');
select ok(public.srs_retrievability(10, 30) < public.srs_retrievability(10, 20), 'R decreases with elapsed time');
select ok(public.srs_retrievability(50, 20) > public.srs_retrievability(10, 20), 'R is higher for a more stable card');
select is(public.srs_retrievability(0, 5), 0::float8, 'a card without memory state has R = 0');

-- ===== Internal only =====
select ok(not has_function_privilege('authenticated', 'public.srs_next(text, smallint, double precision, double precision, timestamptz, smallint, timestamptz, text)', 'execute')
  and not has_function_privilege('anon', 'public.srs_next(text, smallint, double precision, double precision, timestamptz, smallint, timestamptz, text)', 'execute'),
  'clients cannot execute srs_next');
select ok(not has_function_privilege('authenticated', 'public.srs_previews(text, smallint, double precision, double precision, timestamptz, timestamptz, text)', 'execute')
  and not has_function_privilege('anon', 'public.srs_previews(text, smallint, double precision, double precision, timestamptz, timestamptz, text)', 'execute'),
  'clients cannot execute srs_previews');
select ok(not has_function_privilege('authenticated', 'public.srs_adjust_rating(smallint, smallint, smallint)', 'execute')
  and not has_function_privilege('authenticated', 'public.srs_retrievability(double precision, double precision)', 'execute')
  and not has_function_privilege('anon', 'public.srs_adjust_rating(smallint, smallint, smallint)', 'execute')
  and not has_function_privilege('anon', 'public.srs_retrievability(double precision, double precision)', 'execute'),
  'clients cannot execute srs_adjust_rating / srs_retrievability');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'srs\_%'
     and p.proname in ('srs_round8', 'srs_clip_weights', 'srs_decay_factor', 'srs_forgetting_curve', 'srs_init_difficulty',
       'srs_next_memory', 'srs_interval_days', 'srs_step_info', 'srs_schedule', 'srs_next', 'srs_retrievability',
       'srs_adjust_rating', 'srs_previews')
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  0, 'no FSRS helper is executable by clients');

select * from finish();
rollback;
