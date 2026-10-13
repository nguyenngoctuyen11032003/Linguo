begin;
create extension if not exists pgtap with schema extensions;
select plan(139);

-- ===== Item bank: the published EN diagnostic gets a synthetic bank (rolled back) =====
-- Any seeded bank is removed first so the expectations below do not depend on content.
delete from public.assessment_responses;
delete from public.assessment_attempts;
delete from public.assessment_items;

create function public.d4_id(n integer) returns uuid language sql immutable as $$
  select ('d4000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

-- vocabulary/grammar: 4 items per level 0..6; reading: 3 per level. b = ordinal + 0.5, 4 options,
-- answer keys rotate over a..d.
insert into public.assessment_items (id, key, assessment_id, language_code, skill, level_code, difficulty, item_type, prompt,
  answer_key, explanation, key_confidence, status, is_demo, content_hash)
select public.d4_id(s.n * 100 + h.ordinal * 10 + k),
       'en:diag:d4-' || s.skill || '-' || h.level_code || '-' || k,
       '994a20b9-416d-53f4-8918-00c27dc1dc74', 'en', s.skill, h.level_code, h.ordinal + 0.5,
       case s.skill when 'vocabulary' then 'mcq' when 'grammar' then 'cloze_choice' else 'reading_mcq' end,
       jsonb_build_object(
         'stem', s.skill || ' ' || h.level_code || ' #' || k, 'stem_lang', 'en',
         'passage', case when s.skill = 'reading' then 'Passage ' || h.level_code || ' #' || k end,
         'options', jsonb_build_array(
           jsonb_build_object('id', 'a', 'text', 'A', 'lang', 'en'), jsonb_build_object('id', 'b', 'text', 'B', 'lang', 'en'),
           jsonb_build_object('id', 'c', 'text', 'C', 'lang', 'en'), jsonb_build_object('id', 'd', 'text', 'D', 'lang', 'en'))),
       (array['a', 'b', 'c', 'd'])[(h.ordinal + k) % 4 + 1],
       '{"vi": "Giải thích"}'::jsonb, 'unreviewed', 'published', true,
       md5(s.skill || h.level_code || k) || md5(s.skill || h.level_code || k || '#')
from (values (1, 'vocabulary'), (2, 'grammar'), (3, 'reading')) as s(n, skill)
cross join public.level_reference_hours h
cross join generate_series(1, 4) as k
where h.language_code = 'en' and (s.skill <> 'reading' or k <= 3);

-- ===== Test helpers =====
create function public.d4_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Every object key anywhere in a JSON value.
create function public.d4_keys(p jsonb) returns setof text language sql immutable as $$
  with recursive t(v) as (
    select p
    union all
    select c.value from t
    cross join lateral (
      select e.value from jsonb_each(case when jsonb_typeof(t.v) = 'object' then t.v else '{}'::jsonb end) as e
      union all
      select a.value from jsonb_array_elements(case when jsonb_typeof(t.v) = 'array' then t.v else '[]'::jsonb end) as a
    ) as c
  )
  select k from t cross join lateral jsonb_object_keys(case when jsonb_typeof(t.v) = 'object' then t.v else '{}'::jsonb end) as k;
$$;

-- Number of forbidden keys (answer, correctness, explanation, difficulty, θ) in a client payload.
create function public.d4_leaks(p jsonb) returns integer language sql immutable as $$
  select count(*)::integer from public.d4_keys(p) as k
  where k in ('answer_key', 'is_correct', 'correct', 'explanation', 'difficulty', 'b', 'theta', 'mean', 'sd', 'weights', 'key_confidence');
$$;

-- Owner-side peeks at the private bank (SECURITY DEFINER so they also work under the authenticated role).
create function public.d4_key(p_item uuid) returns text language sql stable security definer set search_path = '' as $$
  select i.answer_key from public.assessment_items i where i.id = p_item;
$$;
create function public.d4_b(p_item uuid) returns numeric language sql stable security definer set search_path = '' as $$
  select i.difficulty from public.assessment_items i where i.id = p_item;
$$;
-- Pretends the pending item was served 5 s ago (now() is frozen inside the test transaction).
create function public.d4_backdate(p_attempt uuid) returns void language sql volatile security definer set search_path = '' as $$
  update public.assessment_attempts set current_served_at = current_served_at - interval '5 seconds' where id = p_attempt;
$$;

-- Answers until done with a deterministic responder: correct iff b < p_theta; wrong answers pick
-- "Tôi không biết" when p_idk, else a wrong option. p_fast skips the backdating (rapid answers).
-- Returns {last, steps, leaks, items}.
create function public.d4_play(p_step jsonb, p_theta numeric, p_idk boolean default false, p_fast boolean default false, p_max integer default 40)
returns jsonb language plpgsql volatile as $$
declare
  v_step jsonb := p_step;
  v_item uuid;
  v_key text;
  v_steps integer := 0;
  v_leaks integer := public.d4_leaks(p_step);
  v_items uuid[] := '{}';
begin
  while not (v_step ->> 'done')::boolean and v_steps < p_max loop
    v_item := (v_step #>> '{item,id}')::uuid;
    v_items := v_items || v_item;
    v_key := public.d4_key(v_item);
    if not p_fast then
      perform public.d4_backdate((v_step ->> 'attempt_id')::uuid);
    end if;
    v_step := public.answer_diagnostic((v_step ->> 'attempt_id')::uuid, v_item,
      case when public.d4_b(v_item) < p_theta then v_key
           when p_idk then null
           else (select o from unnest(array['a', 'b', 'c', 'd']) as o where o <> v_key limit 1) end);
    v_leaks := v_leaks + public.d4_leaks(v_step);
    v_steps := v_steps + 1;
  end loop;
  return jsonb_build_object('last', v_step, 'steps', v_steps, 'leaks', v_leaks, 'items', to_jsonb(v_items));
end;
$$;

-- DETAIL of the error raised by a statement (null when it succeeds).
create function public.d4_err_detail(p_sql text) returns text language plpgsql volatile as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail;
end;
$$;

-- Result of a jsonb statement whose effects are rolled back (subtransaction), so it leaves no attempt behind.
create function public.d4_dry_run(p_sql text) returns jsonb language plpgsql volatile as $$
declare
  v_result jsonb;
  v_detail text;
begin
  execute p_sql into v_result;
  raise exception using errcode = 'P0001', message = 'd4_dry_run', detail = coalesce(v_result::text, 'null');
exception when others then
  if sqlerrm <> 'd4_dry_run' then
    raise;
  end if;
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

create function public.d4_skill(p_report jsonb, p_skill text) returns jsonb language sql immutable as $$
  select s from jsonb_array_elements(p_report -> 'skills') as s where s ->> 'skill' = p_skill;
$$;
create function public.d4_ord(p_level text) returns integer language sql stable as $$
  select ordinal::integer from public.level_reference_hours where language_code = 'en' and level_code = p_level;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d4000000-0000-4000-8000-00000000000a', 'd4a@test.dev', '{}'),
  ('d4000000-0000-4000-8000-00000000000b', 'd4b@test.dev', '{}'),
  ('d4000000-0000-4000-8000-00000000000c', 'd4c@test.dev', '{}'),
  ('d4000000-0000-4000-8000-00000000000d', 'd4d@test.dev', '{}'),
  ('d4000000-0000-4000-8000-00000000000e', 'd4e@test.dev', '{}'),
  ('d4000000-0000-4000-8000-00000000000f', 'd4f@test.dev', '{}'),
  ('d4000000-0000-4000-8000-000000000010', 'd4g@test.dev', '{}'),
  ('d4000000-0000-4000-8000-000000000011', 'd4h@test.dev', '{}');

set local role authenticated;
select public.d4_as('d4000000-0000-4000-8000-00000000000a');
select set_config('test.pa', (public.create_learning_path('en', 'unsure', 'cefr', 'a1', 'c2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select public.d4_as('d4000000-0000-4000-8000-00000000000b');
select set_config('test.pb', (public.create_learning_path('en', 'unsure', 'cefr', 'a1', 'c2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select public.d4_as('d4000000-0000-4000-8000-00000000000c');
select set_config('test.pc', (public.create_learning_path('en', 'unsure', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select public.d4_as('d4000000-0000-4000-8000-00000000000d');
select set_config('test.pd', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select public.d4_as('d4000000-0000-4000-8000-00000000000e');
select set_config('test.pe', (public.create_learning_path('en', 'new', 'foundation', 'a1', 'b1', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select public.d4_as('d4000000-0000-4000-8000-00000000000f');
select set_config('test.pf', (public.create_learning_path('en', 'confident', 'cefr', 'b2', 'c2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select public.d4_as('d4000000-0000-4000-8000-000000000010');
select set_config('test.pg', (public.create_learning_path('en', 'unsure', 'cefr', 'a1', 'c2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select public.d4_as('d4000000-0000-4000-8000-000000000011');
select set_config('test.ph', (public.create_learning_path('ko', 'unsure', 'communication', 'topik1', 'topik3', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);

-- ===== Privileges =====
reset role;
select ok(not has_function_privilege('anon', 'public.start_diagnostic(uuid, text)', 'execute'), 'anon cannot start');
select ok(not has_function_privilege('anon', 'public.answer_diagnostic(uuid, uuid, text)', 'execute'), 'anon cannot answer');
select ok(not has_function_privilege('anon', 'public.diagnostic_status(uuid)', 'execute'), 'anon cannot read status');
select ok(has_function_privilege('authenticated', 'public.start_diagnostic(uuid, text)', 'execute'), 'authenticated can start');
select ok(has_function_privilege('authenticated', 'public.accept_diagnostic_placement(uuid)', 'execute'), 'authenticated can accept');
select ok(not has_function_privilege('authenticated', 'public.diagnostic_attempt_state(uuid)', 'execute'), 'state helper is internal');
select ok(not has_function_privilege('authenticated', 'public.diagnostic_build_report(uuid, timestamptz)', 'execute'), 'report helper is internal');
select ok(not has_function_privilege('authenticated', 'public.diagnostic_pick_item(uuid, text, double precision, integer)', 'execute'), 'pick helper is internal');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'diagnostic\_%' and p.proargtypes::oid[] && array(
    select c.reltype from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r')
), 'no diagnostic helper takes a table row (no PostgREST computed columns)');

-- ===== Not authenticated =====
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(format('select public.diagnostic_status(%L)', current_setting('test.pa')), '42501', 'not_authenticated', 'status needs a user');
select throws_ok(format('select public.start_diagnostic(%L)', current_setting('test.pa')), '42501', 'not_authenticated', 'start needs a user');
select throws_ok(format('select public.answer_diagnostic(%L, %L, null)', gen_random_uuid(), gen_random_uuid()), '42501', 'not_authenticated', 'answer needs a user');
select throws_ok(format('select public.skip_diagnostic_skill(%L, ''grammar'', ''other'')', gen_random_uuid()), '42501', 'not_authenticated', 'skip needs a user');
select throws_ok(format('select public.finish_diagnostic(%L)', gen_random_uuid()), '42501', 'not_authenticated', 'finish needs a user');
select throws_ok(format('select public.accept_diagnostic_placement(%L)', gen_random_uuid()), '42501', 'not_authenticated', 'accept needs a user');

-- ===== Status before any attempt, path checks, bank, mode =====
select public.d4_as('d4000000-0000-4000-8000-00000000000a');
select is(public.diagnostic_status(current_setting('test.pa')::uuid),
  jsonb_build_object('attempt_id', null, 'status', 'none', 'completed_at', null, 'applied_at', null, 'retake_after', null, 'can_start', true),
  'status with no attempt');
select throws_ok(format('select public.diagnostic_status(%L)', gen_random_uuid()), 'P0001', 'path_not_found', 'status of an unknown path');
select throws_ok(format('select public.start_diagnostic(%L)', current_setting('test.pb')), 'P0001', 'path_not_found', 'cannot start on another user''s path');
select throws_ok(format('select public.start_diagnostic(%L, ''quick'')', current_setting('test.pa')), 'P0001', 'invalid_mode', 'unknown mode');
select public.d4_as('d4000000-0000-4000-8000-000000000011');
select throws_ok(format('select public.start_diagnostic(%L)', current_setting('test.ph')), 'P0001', 'bank_unavailable', 'no Korean items: bank_unavailable');
select is((public.diagnostic_status(current_setting('test.ph')::uuid) ->> 'can_start')::boolean, false, 'no bank: cannot start');

-- ===== Start, resume, answer errors (user A) =====
select public.d4_as('d4000000-0000-4000-8000-00000000000a');
select set_config('test.s1', public.start_diagnostic(current_setting('test.pa')::uuid)::text, true);
select set_config('test.a1', current_setting('test.s1')::jsonb ->> 'attempt_id', true);
select set_config('test.i1', current_setting('test.s1')::jsonb #>> '{item,id}', true);
select is((select jsonb_build_object('mode', s -> 'mode', 'done', s -> 'done', 'resumed', s -> 'resumed', 'skill', s #> '{item,skill}',
    'statuses', (select jsonb_agg(x -> 'status') from jsonb_array_elements(s #> '{progress,skills}') as x))
  from (select current_setting('test.s1')::jsonb as s) as t),
  '{"mode": "full", "done": false, "resumed": false, "skill": "vocabulary", "statuses": ["active", "pending", "pending"]}'::jsonb,
  'start serves a vocabulary item; grammar and reading pending');
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('test.s1')::jsonb #> '{item}') as k),
  array['id', 'item_type', 'prompt', 'skill'], 'item exposes only id, skill, item_type, prompt');
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('test.s1')::jsonb #> '{item,prompt}') as k),
  array['options', 'passage', 'stem', 'stem_lang'], 'prompt exposes only stem, stem_lang, passage, options');
select is(public.d4_leaks(current_setting('test.s1')::jsonb), 0, 'start step leaks nothing');
reset role;
select ok(abs(public.d4_b(current_setting('test.i1')::uuid) - 1.5) <= 0.5,
  'first item is near the prior (current a1 -> mean 1.5)');
set local role authenticated;
select public.d4_as('d4000000-0000-4000-8000-00000000000a');

select set_config('test.s1r', public.start_diagnostic(current_setting('test.pa')::uuid)::text, true);
select is(current_setting('test.s1r')::jsonb ->> 'attempt_id', current_setting('test.a1'), 'second start resumes the same attempt');
select is(current_setting('test.s1r')::jsonb #>> '{item,id}', current_setting('test.i1'), 'resume serves the same pending item');
select is((current_setting('test.s1r')::jsonb ->> 'resumed')::boolean, true, 'resumed = true');
select is((select count(*)::int from public.assessment_attempts where learning_path_id = current_setting('test.pa')::uuid),
  1, 'one in-progress attempt (visible through RLS)');
select is((select status from public.diagnostic_status(current_setting('test.pa')::uuid) as s(j), lateral (select j ->> 'status') as x(status)),
  'in_progress', 'status shows in_progress');

select throws_ok(format('select public.answer_diagnostic(%L, %L, ''a'')', current_setting('test.a1'), public.d4_id(1990)),
  'P0001', 'item_mismatch', 'answering an item that is not pending');
select throws_ok(format('select public.answer_diagnostic(%L, %L, ''z'')', current_setting('test.a1'), current_setting('test.i1')),
  'P0001', 'invalid_choice', 'choice must be an option id');
select throws_ok(format('select public.answer_diagnostic(%L, %L, ''a'')', gen_random_uuid(), current_setting('test.i1')),
  'P0001', 'attempt_not_found', 'unknown attempt');
select throws_ok(format('select public.accept_diagnostic_placement(%L)', current_setting('test.a1')),
  'P0001', 'attempt_not_completed', 'cannot accept an attempt in progress');

reset role;
select public.d4_backdate(current_setting('test.a1')::uuid);
set local role authenticated;
select set_config('test.s2', public.answer_diagnostic(current_setting('test.a1')::uuid, current_setting('test.i1')::uuid,
  public.d4_key(current_setting('test.i1')::uuid))::text, true);
select is(public.d4_leaks(current_setting('test.s2')::jsonb), 0, 'answer step leaks nothing (no correctness, key or θ)');
select isnt(current_setting('test.s2')::jsonb #>> '{item,id}', current_setting('test.i1'), 'a new item is served after answering');
select ok((select bool_and((x ->> 'fill')::numeric between 0 and 1) from jsonb_array_elements(current_setting('test.s2')::jsonb #> '{progress,skills}') as x),
  'progress fill stays within 0..1');
select throws_ok(format('select public.answer_diagnostic(%L, %L, ''a'')', current_setting('test.a1'), current_setting('test.i1')),
  'P0001', 'already_answered', 'answering the same item twice');

-- A/B: user B can neither see nor touch A's attempt.
select public.d4_as('d4000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.assessment_attempts), 0, 'RLS: B sees none of A''s attempts');
select throws_ok(format('select public.answer_diagnostic(%L, %L, ''a'')', current_setting('test.a1'), current_setting('test.s2')::jsonb #>> '{item,id}'),
  'P0001', 'attempt_not_found', 'B cannot answer A''s attempt');
select throws_ok(format('select public.skip_diagnostic_skill(%L, ''grammar'', ''other'')', current_setting('test.a1')),
  'P0001', 'attempt_not_found', 'B cannot skip in A''s attempt');
select throws_ok(format('select public.finish_diagnostic(%L)', current_setting('test.a1')),
  'P0001', 'attempt_not_found', 'B cannot finish A''s attempt');
select throws_ok(format('select public.accept_diagnostic_placement(%L)', current_setting('test.a1')),
  'P0001', 'attempt_not_found', 'B cannot accept A''s attempt');
select throws_ok(format('select public.diagnostic_status(%L)', current_setting('test.pa')),
  'P0001', 'path_not_found', 'B cannot read A''s status');

-- ===== A: strong learner, full run, finish, accept with the +2 cap =====
select public.d4_as('d4000000-0000-4000-8000-00000000000a');
select set_config('test.r1', public.d4_play(current_setting('test.s2')::jsonb, 99)::text, true);
select is((current_setting('test.r1')::jsonb ->> 'leaks')::int, 0, 'no step of a full run leaks answers');
select is((current_setting('test.r1')::jsonb #>> '{last,done}')::boolean, true, 'run ends with done = true');
select is(current_setting('test.r1')::jsonb #> '{last,item}', 'null'::jsonb, 'done step has no item');
select ok((current_setting('test.r1')::jsonb ->> 'steps')::int + 1 <= 30, 'at most 30 answers');
reset role;
select ok((select count(distinct item_id) = count(*) from public.assessment_responses where attempt_id = current_setting('test.a1')::uuid),
  'no item served twice in an attempt');
select ok((select bool_and(r.seq = t.n) from (select seq, row_number() over (order by seq) as n from public.assessment_responses
  where attempt_id = current_setting('test.a1')::uuid) as t join public.assessment_responses r on r.attempt_id = current_setting('test.a1')::uuid and r.seq = t.seq),
  'response seq is 1..n');
select is((select array_agg(distinct skill order by skill) from public.assessment_responses where attempt_id = current_setting('test.a1')::uuid),
  array['grammar', 'reading', 'vocabulary'], 'all three skills were tested');
select ok((select max(c) <= 8 from (select count(*) as c from public.assessment_responses where attempt_id = current_setting('test.a1')::uuid
  and skill <> 'reading' group by skill) as t), 'at most 8 items per skill');
select ok((select count(*) <= 5 from public.assessment_responses where attempt_id = current_setting('test.a1')::uuid and skill = 'reading'),
  'at most 5 reading items');
select ok((select bool_and(is_correct) from public.assessment_responses where attempt_id = current_setting('test.a1')::uuid),
  'answers matching the key are scored correct');
set local role authenticated;

select set_config('test.f1', public.finish_diagnostic(current_setting('test.a1')::uuid)::text, true);
select is(public.d4_leaks(current_setting('test.f1')::jsonb), 0, 'report leaks nothing');
select is((select array_agg(s ->> 'skill' order by n) from jsonb_array_elements(current_setting('test.f1')::jsonb -> 'skills') with ordinality as x(s, n)),
  array['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking'], 'report lists the 6 skills in order');
select is((select array_agg(s ->> 'status' order by n) from jsonb_array_elements(current_setting('test.f1')::jsonb -> 'skills') with ordinality as x(s, n)),
  array['estimated', 'estimated', 'estimated', 'not_supported', 'not_supported', 'not_supported'], 'listening/writing/speaking not supported');
select is((select jsonb_build_object('a', j -> 'attempt_id', 'p', j -> 'learning_path_id', 'l', j -> 'language_code', 'm', j -> 'mode',
    'c', j -> 'current_level', 'e', j -> 'early_stop', 'u', j -> 'bank_unreviewed', 'ap', j -> 'applied_at')
  from (select current_setting('test.f1')::jsonb as j) as t),
  jsonb_build_object('a', current_setting('test.a1'), 'p', current_setting('test.pa'), 'l', 'en', 'm', 'full', 'c', 'a1',
    'e', false, 'u', true, 'ap', null), 'report header');
select ok(public.d4_ord(current_setting('test.f1')::jsonb ->> 'suggested_level') >= 3, 'strong learner: suggestion at b1 or above');
select is(current_setting('test.f1')::jsonb ->> 'capped_level', 'b1', 'first diagnostic: upward move capped at +2 (a1 -> b1)');
select is(current_setting('test.f1')::jsonb ->> 'rapid_answer_share', '0', 'no rapid answers');
select is((current_setting('test.f1')::jsonb ->> 'retake_after')::timestamptz,
  (current_setting('test.f1')::jsonb ->> 'completed_at')::timestamptz + interval '14 days', 'retake_after = completed_at + 14 days');
select ok((select bool_and(s -> 'range' ? 'low' and s -> 'range' ? 'high' and s ->> 'confidence' in ('low', 'medium', 'high')
    and (s ->> 'sample_size')::int >= 3)
  from jsonb_array_elements(current_setting('test.f1')::jsonb -> 'skills') as s where s ->> 'status' = 'estimated'),
  'estimated skills carry a range, a confidence and a sample size');
select is(public.finish_diagnostic(current_setting('test.a1')::uuid), current_setting('test.f1')::jsonb, 'finish is idempotent');
select is((select count(*)::int from public.skill_estimates where learning_path_id = current_setting('test.pa')::uuid and source = 'diagnostic'),
  3, 'finish writes one diagnostic estimate per estimated skill');
select is((select count(*)::int from public.skill_estimates where learning_path_id = current_setting('test.pa')::uuid and source = 'self_report'),
  6, 'self-reported estimates are kept');
select is((select jsonb_agg(jsonb_build_object('skill', e.skill, 'level', e.level_code, 'conf', e.confidence, 'n', e.sample_size) order by e.skill)
  from public.skill_estimates e where e.learning_path_id = current_setting('test.pa')::uuid and e.source = 'diagnostic'),
  (select jsonb_agg(jsonb_build_object('skill', s ->> 'skill', 'level', s ->> 'level_code', 'conf', s ->> 'confidence', 'n', (s ->> 'sample_size')::int) order by s ->> 'skill')
   from jsonb_array_elements(current_setting('test.f1')::jsonb -> 'skills') as s where s ->> 'status' = 'estimated'),
  'diagnostic estimates match the report');
select is((select current_level from public.learning_paths where id = current_setting('test.pa')::uuid), 'a1', 'finish does not change the path');
select throws_ok(format('select public.answer_diagnostic(%L, %L, ''a'')', current_setting('test.a1'), current_setting('test.i1')),
  'P0001', 'attempt_not_active', 'cannot answer a completed attempt');
select throws_ok(format('select public.skip_diagnostic_skill(%L, ''grammar'', ''other'')', current_setting('test.a1')),
  'P0001', 'attempt_not_active', 'cannot skip in a completed attempt');

select set_config('test.st1', public.diagnostic_status(current_setting('test.pa')::uuid)::text, true);
select is((select jsonb_build_object('s', j -> 'status', 'c', j -> 'can_start', 'r', (j ->> 'retake_after')::timestamptz = (current_setting('test.f1')::jsonb ->> 'retake_after')::timestamptz)
  from (select current_setting('test.st1')::jsonb as j) as t),
  '{"s": "completed", "c": false, "r": true}'::jsonb, 'status after finishing: completed, in cooldown');
select throws_ok(format('select public.start_diagnostic(%L)', current_setting('test.pa')), 'P0001', 'diagnostic_cooldown', '14-day cooldown');
select is(public.d4_dry_run(format('select public.start_diagnostic(%L, ''foundation'')', current_setting('test.pa'))) ->> 'mode', 'foundation',
  'a full test does not block a foundation check (cooldown per mode)');
select is(public.d4_err_detail(format('select public.start_diagnostic(%L)', current_setting('test.pa')))::timestamptz,
  (current_setting('test.f1')::jsonb ->> 'retake_after')::timestamptz, 'cooldown error detail carries retake_after');

select set_config('test.ac1', public.accept_diagnostic_placement(current_setting('test.a1')::uuid)::text, true);
select is((select jsonb_build_object('p', j -> 'learning_path_id', 'prev', j -> 'previous_level', 'new', j -> 'new_level', 'o', j -> 'outcome')
  from (select current_setting('test.ac1')::jsonb as j) as t),
  jsonb_build_object('p', current_setting('test.pa'), 'prev', 'a1', 'new', 'b1', 'o', 'applied'), 'accept applies the capped level');
select is((select current_level from public.learning_paths where id = current_setting('test.pa')::uuid), 'b1', 'path level updated');
select is(current_setting('test.ac1')::jsonb -> 'estimate',
  public.estimate_learning_path('en', 'b1', 'c2', array[30,30,30,30,30,30,30]::smallint[], null, null),
  'accept returns the recomputed estimate');
select is((select estimate from public.learning_paths where id = current_setting('test.pa')::uuid),
  current_setting('test.ac1')::jsonb -> 'estimate', 'path estimate recomputed');
select ok((select applied_at is not null and (report ->> 'applied_at') is not null from public.assessment_attempts where id = current_setting('test.a1')::uuid),
  'attempt applied_at set (also in the report)');
select throws_ok(format('select public.accept_diagnostic_placement(%L)', current_setting('test.a1')),
  'P0001', 'already_applied', 'accepting twice');
select ok((public.diagnostic_status(current_setting('test.pa')::uuid) ->> 'applied_at') is not null, 'status shows applied_at');

-- After the cooldown: a second diagnostic is capped at +1 (b1 -> b2), avoiding items seen before.
reset role;
update public.assessment_attempts set completed_at = completed_at - interval '15 days', started_at = started_at - interval '15 days'
where id = current_setting('test.a1')::uuid;
set local role authenticated;
select is((public.diagnostic_status(current_setting('test.pa')::uuid) ->> 'can_start')::boolean, true, 'can start again after 14 days');
select set_config('test.s3', public.start_diagnostic(current_setting('test.pa')::uuid)::text, true);
select isnt(current_setting('test.s3')::jsonb ->> 'attempt_id', current_setting('test.a1'), 'retake is a new attempt');
select set_config('test.a2', current_setting('test.s3')::jsonb ->> 'attempt_id', true);
select set_config('test.r2', public.d4_play(current_setting('test.s3')::jsonb, 99)::text, true);
reset role;
select is((select count(*)::int from public.assessment_responses r2 join public.assessment_responses r1 on r1.item_id = r2.item_id
  where r2.attempt_id = current_setting('test.a2')::uuid and r1.attempt_id = current_setting('test.a1')::uuid),
  0, 'retake avoids items of the previous completed attempt');
set local role authenticated;
select set_config('test.f2', public.finish_diagnostic(current_setting('test.a2')::uuid)::text, true);
select is(current_setting('test.f2')::jsonb ->> 'current_level', 'b1', 'report uses the current path level');
select is(current_setting('test.f2')::jsonb ->> 'capped_level', 'b2', 'later diagnostics: upward move capped at +1');
select is(public.accept_diagnostic_placement(current_setting('test.a2')::uuid) - 'estimate',
  jsonb_build_object('learning_path_id', current_setting('test.pa'), 'previous_level', 'b1', 'new_level', 'b2', 'outcome', 'applied'),
  'second accept: b1 -> b2');
select is((select count(*)::int from public.skill_estimates where learning_path_id = current_setting('test.pa')::uuid and source = 'diagnostic'),
  3, 'diagnostic estimates are upserted, not duplicated');

-- ===== C: suggestion at or above the target -> needs_target_update =====
select public.d4_as('d4000000-0000-4000-8000-00000000000c');
select set_config('test.sc', public.start_diagnostic(current_setting('test.pc')::uuid)::text, true);
select set_config('test.rc', public.d4_play(current_setting('test.sc')::jsonb, 99)::text, true);
select set_config('test.fc', public.finish_diagnostic((current_setting('test.sc')::jsonb ->> 'attempt_id')::uuid)::text, true);
select is(public.accept_diagnostic_placement((current_setting('test.sc')::jsonb ->> 'attempt_id')::uuid),
  jsonb_build_object('learning_path_id', current_setting('test.pc'), 'previous_level', 'a1', 'new_level', 'b1',
    'outcome', 'needs_target_update', 'estimate', null),
  'capped level >= target: needs_target_update');
select is((select current_level from public.learning_paths where id = current_setting('test.pc')::uuid), 'a1', 'path unchanged');
select is((select applied_at from public.assessment_attempts where id = (current_setting('test.sc')::jsonb ->> 'attempt_id')::uuid),
  null, 'needs_target_update does not mark the attempt applied');

-- ===== E: foundation mode, rapid answers =====
select public.d4_as('d4000000-0000-4000-8000-00000000000e');
select set_config('test.se', public.start_diagnostic(current_setting('test.pe')::uuid, 'foundation')::text, true);
select is(current_setting('test.se')::jsonb ->> 'mode', 'foundation', 'foundation mode');
select set_config('test.re', public.d4_play(current_setting('test.se')::jsonb, 99, false, true)::text, true);
select is((current_setting('test.re')::jsonb ->> 'steps')::int, 8, 'foundation stops at 8 answers');
reset role;
select ok((select bool_and(i.difficulty <= 1.5) from public.assessment_responses r join public.assessment_items i on i.id = r.item_id
  where r.attempt_id = (current_setting('test.se')::jsonb ->> 'attempt_id')::uuid), 'foundation never serves b > 1.5');
select set_config('test.ste', public.diagnostic_attempt_state((current_setting('test.se')::jsonb ->> 'attempt_id')::uuid)::text, true);
set local role authenticated;
select set_config('test.fe', public.finish_diagnostic((current_setting('test.se')::jsonb ->> 'attempt_id')::uuid)::text, true);
select is((current_setting('test.fe')::jsonb ->> 'rapid_answer_share')::numeric, 1::numeric, 'all answers under 800 ms: rapid share 1');
reset role;
select is((select jsonb_agg(s ->> 'confidence' order by s ->> 'skill') from jsonb_array_elements(current_setting('test.fe')::jsonb -> 'skills') as s where s ->> 'status' = 'estimated'),
  (select jsonb_agg(public.diag_confidence((s ->> 'sd')::float8, (s ->> 'n')::int, 1) order by s ->> 'skill')
   from jsonb_array_elements(current_setting('test.ste')::jsonb -> 'skills') as s where (s ->> 'n')::int >= 3),
  'rapid answers lower the confidence (engine with rapid share 1)');
set local role authenticated;
select ok(not exists (select 1 from jsonb_array_elements(current_setting('test.fe')::jsonb -> 'skills') as s where s ->> 'confidence' = 'high'),
  'no high confidence with rapid answers');
-- Cooldown runs per mode: a finished foundation check blocks another foundation check, not the full test.
select is((select jsonb_build_object('s', j -> 'status', 'c', j -> 'can_start', 'r', j -> 'retake_after')
  from (select public.diagnostic_status(current_setting('test.pe')::uuid) as j) as t),
  '{"s": "completed", "c": true, "r": null}'::jsonb, 'status after a foundation check: the full test can start');
select throws_ok(format('select public.start_diagnostic(%L, ''foundation'')', current_setting('test.pe')), 'P0001', 'diagnostic_cooldown',
  'foundation after foundation: cooldown');
select is(public.d4_err_detail(format('select public.start_diagnostic(%L, ''foundation'')', current_setting('test.pe')))::timestamptz,
  (current_setting('test.fe')::jsonb ->> 'retake_after')::timestamptz, 'foundation cooldown detail carries its retake_after');
select is(public.start_diagnostic(current_setting('test.pe')::uuid, 'full') ->> 'mode', 'full', 'a foundation check does not block the full test');

-- ===== F: skip, skip errors, downgrade =====
select public.d4_as('d4000000-0000-4000-8000-00000000000f');
select set_config('test.sf', public.start_diagnostic(current_setting('test.pf')::uuid)::text, true);
select set_config('test.af', current_setting('test.sf')::jsonb ->> 'attempt_id', true);
select throws_ok(format('select public.skip_diagnostic_skill(%L, ''listening'', ''other'')', current_setting('test.af')), 'P0001', 'invalid_skill', 'listening cannot be skipped');
select throws_ok(format('select public.skip_diagnostic_skill(%L, ''grammar'', ''bored'')', current_setting('test.af')), 'P0001', 'invalid_reason', 'unknown skip reason');
select throws_ok(format('select public.skip_diagnostic_skill(%L, ''grammar'', ''other'')', gen_random_uuid()), 'P0001', 'attempt_not_found', 'skip on unknown attempt');
select set_config('test.sf2', public.skip_diagnostic_skill(current_setting('test.af')::uuid, 'vocabulary', 'too_hard')::text, true);
select is(public.d4_leaks(current_setting('test.sf2')::jsonb), 0, 'skip step leaks nothing');
select is(current_setting('test.sf2')::jsonb #>> '{item,skill}', 'grammar', 'after skipping vocabulary a grammar item is served');
select is((select jsonb_agg(x -> 'status') from jsonb_array_elements(current_setting('test.sf2')::jsonb #> '{progress,skills}') as x),
  '["skipped", "active", "pending"]'::jsonb, 'progress shows the skip');
select is(public.skip_diagnostic_skill(current_setting('test.af')::uuid, 'vocabulary', 'other'), current_setting('test.sf2')::jsonb,
  'skipping again changes nothing');
select set_config('test.rf', public.d4_play(current_setting('test.sf2')::jsonb, 2)::text, true);
select set_config('test.ff', public.finish_diagnostic(current_setting('test.af')::uuid)::text, true);
select is(public.d4_skill(current_setting('test.ff')::jsonb, 'vocabulary') - 'sample_size',
  '{"skill": "vocabulary", "status": "skipped", "level_code": null, "range": null, "confidence": null, "reason": "too_hard"}'::jsonb,
  'skipped skill: no data, with the reason');
select ok(public.d4_ord(current_setting('test.ff')::jsonb ->> 'suggested_level') < 4, 'weaker learner: suggestion below b2');
select set_config('test.acf', public.accept_diagnostic_placement(current_setting('test.af')::uuid)::text, true);
select is(current_setting('test.acf')::jsonb ->> 'outcome', 'applied', 'downgrade is applied');
select is(current_setting('test.acf')::jsonb ->> 'new_level', current_setting('test.ff')::jsonb ->> 'suggested_level', 'downgrade is never capped');
select is((select current_level from public.learning_paths where id = current_setting('test.pf')::uuid),
  current_setting('test.ff')::jsonb ->> 'suggested_level', 'path moved down');
select is((select count(*)::int from public.skill_estimates where learning_path_id = current_setting('test.pf')::uuid and source = 'diagnostic'),
  2, 'skipped skill gets no diagnostic estimate');

-- ===== G: abandon after 7 idle days, early finish =====
select public.d4_as('d4000000-0000-4000-8000-000000000010');
select set_config('test.sg', public.start_diagnostic(current_setting('test.pg')::uuid)::text, true);
select set_config('test.ag', current_setting('test.sg')::jsonb ->> 'attempt_id', true);
select set_config('test.rg', public.d4_play(current_setting('test.sg')::jsonb, 2, false, false, 1)::text, true);
reset role;
update public.assessment_attempts set last_activity_at = now() - interval '8 days', started_at = now() - interval '8 days'
where id = current_setting('test.ag')::uuid;
set local role authenticated;
select is((public.diagnostic_status(current_setting('test.pg')::uuid) - 'completed_at' - 'applied_at' - 'retake_after'),
  jsonb_build_object('attempt_id', current_setting('test.ag'), 'status', 'abandoned', 'can_start', true), 'idle > 7 days: abandoned');
select throws_ok(format('select public.answer_diagnostic(%L, %L, ''a'')', current_setting('test.ag'), current_setting('test.rg')::jsonb #>> '{last,item,id}'),
  'P0001', 'attempt_not_active', 'cannot answer an abandoned attempt');
select throws_ok(format('select public.finish_diagnostic(%L)', current_setting('test.ag')), 'P0001', 'attempt_not_active', 'cannot finish an abandoned attempt');
select set_config('test.sg2', public.start_diagnostic(current_setting('test.pg')::uuid)::text, true);
select isnt(current_setting('test.sg2')::jsonb ->> 'attempt_id', current_setting('test.ag'), 'start after abandonment opens a new attempt');
select is((current_setting('test.sg2')::jsonb ->> 'resumed')::boolean, false, 'new attempt is not resumed');
select is((select status from public.assessment_attempts where id = current_setting('test.ag')::uuid), 'abandoned', 'old attempt marked abandoned');
select is((select current_item_id from public.assessment_attempts where id = current_setting('test.ag')::uuid), null, 'abandoned attempt has no pending item');

select set_config('test.fg', public.finish_diagnostic((current_setting('test.sg2')::jsonb ->> 'attempt_id')::uuid)::text, true);
select is((select jsonb_agg(jsonb_build_object('s', s ->> 'status', 'r', s ->> 'reason', 'n', (s ->> 'sample_size')::int) order by n)
  from jsonb_array_elements(current_setting('test.fg')::jsonb -> 'skills') with ordinality as x(s, n) where n <= 3),
  '[{"s": "insufficient", "r": "not_reached", "n": 0}, {"s": "insufficient", "r": "not_reached", "n": 0}, {"s": "insufficient", "r": "not_reached", "n": 0}]'::jsonb,
  'finishing right away: no skill estimated');
select is((select count(*)::int from public.skill_estimates where learning_path_id = current_setting('test.pg')::uuid and source = 'diagnostic'),
  0, 'nothing estimated: no diagnostic estimate written');
select is((select status from public.assessment_attempts where id = (current_setting('test.sg2')::jsonb ->> 'attempt_id')::uuid), 'completed', 'early finish completes the attempt');

-- ===== D: early stop (3 easy items wrong in the first skill), "Tôi không biết", no suggestion =====
-- Runs last: vocabulary items above b = 1.0 are archived first, so the first three vocabulary items are
-- easy ones whatever the random pick (unpublished items are never served).
reset role;
update public.assessment_items set status = 'archived' where skill = 'vocabulary' and difficulty > 1.0;
set local role authenticated;
select public.d4_as('d4000000-0000-4000-8000-00000000000d');
select set_config('test.sd', public.start_diagnostic(current_setting('test.pd')::uuid)::text, true);
select set_config('test.rd', public.d4_play(current_setting('test.sd')::jsonb, -99, true)::text, true);
select is((current_setting('test.rd')::jsonb ->> 'steps')::int, 3, 'early stop after 3 wrong easy answers');
select is((current_setting('test.rd')::jsonb #>> '{last,done}')::boolean, true, 'early stop ends the test');
select is((current_setting('test.rd')::jsonb ->> 'leaks')::int, 0, 'early-stop run leaks nothing');
reset role;
select ok((select bool_and(r.choice is null and not r.is_correct) from public.assessment_responses r
  where r.attempt_id = (current_setting('test.sd')::jsonb ->> 'attempt_id')::uuid), '"Tôi không biết" is stored as null and wrong');
set local role authenticated;
select set_config('test.fd', public.finish_diagnostic((current_setting('test.sd')::jsonb ->> 'attempt_id')::uuid)::text, true);
select is((current_setting('test.fd')::jsonb ->> 'early_stop')::boolean, true, 'report: early_stop');
select is((select jsonb_agg(jsonb_build_object('s', s ->> 'status', 'r', s ->> 'reason') order by n)
  from jsonb_array_elements(current_setting('test.fd')::jsonb -> 'skills') with ordinality as x(s, n) where n <= 3),
  '[{"s": "estimated", "r": null}, {"s": "insufficient", "r": "early_stop"}, {"s": "insufficient", "r": "early_stop"}]'::jsonb,
  'early stop: only vocabulary estimated');
select is(public.d4_skill(current_setting('test.fd')::jsonb, 'vocabulary') ->> 'level_code', 'pre_a1', 'all wrong -> pre_a1');
select is(current_setting('test.fd')::jsonb -> 'suggested_level', 'null'::jsonb, 'one skill only: no suggestion');
select is(current_setting('test.fd')::jsonb -> 'capped_level', 'null'::jsonb, 'no suggestion: no capped level');
select is((select count(*)::int from public.skill_estimates where learning_path_id = current_setting('test.pd')::uuid and source = 'diagnostic'),
  1, 'only the estimated skill is written');
select is(public.accept_diagnostic_placement((current_setting('test.sd')::jsonb ->> 'attempt_id')::uuid),
  jsonb_build_object('learning_path_id', current_setting('test.pd'), 'previous_level', 'pre_a1', 'new_level', 'pre_a1',
    'outcome', 'no_suggestion', 'estimate', null), 'accept without suggestion: no_suggestion');
select is((select applied_at from public.assessment_attempts where id = (current_setting('test.sd')::jsonb ->> 'attempt_id')::uuid),
  null, 'no_suggestion does not mark the attempt applied');

-- ===== Engine boundaries: same 1e-9 mass tolerance as packages/shared/src/diagnostic/engine.ts (engine.test.ts) =====
reset role;
-- P(θ >= 1) = 0.6999999995: within tolerance of 0.7.
select is(public.diag_conservative_level((
  select array_agg(case i when 1 then 0.3000000005::float8 when 7 then 0.6999999995::float8 else 0::float8 end order by i)
  from generate_series(1, 29) as i)), 1, 'conservative level: 0.7 mass reached within 1e-9');
-- Cumulative 0.0999999995 at θ = 2 and 0.8999999995 at θ = 3: the 10th/90th percentiles land there.
select is(public.diag_level_range((
  select array_agg(case i when 11 then 0.0999999995::float8 when 15 then 0.8::float8 when 23 then 0.1000000005::float8 else 0::float8 end order by i)
  from generate_series(1, 29) as i)), '{"low": 2, "high": 3}'::jsonb, 'level range: percentiles reached within 1e-9');

select * from finish();
rollback;
