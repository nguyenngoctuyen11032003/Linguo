-- Linguo spec 2 §5–6: answer grading, lesson runs, attempts and the lesson RPCs.
-- Grading runs only here (mirror of packages/shared/src/content/grading.ts, checked by the generated
-- supabase/tests/grading.test.sql). Clients read their runs/attempts through RLS and write only through
-- the SECURITY DEFINER RPCs below; answer keys stay in content_private and are never returned before a reveal.

-- Also created by the content migration; repeated so this file stands on its own.
create extension if not exists unaccent with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- ---------------------------------------------------------------------------
-- Grading (internal; not callable by clients)
-- ---------------------------------------------------------------------------

-- Plan "Grading algorithm" normalize(text, lang, rubric). Lowercasing and regex classes use the builtin
-- C.UTF-8 collation so that Unicode letters behave the same whatever the database locale is.
create or replace function public.grading_normalize(p_text text, p_lang text, p_rubric jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_rubric jsonb := '{"punctuation":"ignore","diacritics":"strict","ko_spacing":"lenient","typo_tolerance":0,"expand_contractions":true}'::jsonb
    || coalesce(p_rubric, '{}'::jsonb);
  v text collate pg_catalog.pg_c_utf8;
  v_punct constant text := '.,!?;:"()[]{}…。、「」『』«»¿¡？！，';
  -- Longest first, whole words only. 's is never expanded.
  v_contractions constant text[] := array[
    ['shouldn''t', 'should not'], ['couldn''t', 'could not'], ['wouldn''t', 'would not'],
    ['doesn''t', 'does not'], ['haven''t', 'have not'], ['weren''t', 'were not'],
    ['they''re', 'they are'], ['they''ll', 'they will'], ['they''ve', 'they have'],
    ['can not', 'cannot'], ['you''re', 'you are'], ['aren''t', 'are not'], ['wasn''t', 'was not'],
    ['didn''t', 'did not'], ['hasn''t', 'has not'], ['you''ll', 'you will'], ['you''ve', 'you have'],
    ['we''re', 'we are'], ['isn''t', 'is not'], ['don''t', 'do not'], ['we''ll', 'we will'],
    ['we''ve', 'we have'], ['can''t', 'cannot'], ['won''t', 'will not'],
    ['i''ll', 'i will'], ['i''ve', 'i have'], ['i''m', 'i am'], ['i''d', 'i would']
  ];
  -- Old-style Vietnamese tone placement -> new style, only at the end of a word.
  v_vi_tones constant text[] := array[
    ['oà', 'òa'], ['oá', 'óa'], ['oả', 'ỏa'], ['oã', 'õa'], ['oạ', 'ọa'],
    ['oè', 'òe'], ['oé', 'óe'], ['oẻ', 'ỏe'], ['oẽ', 'õe'], ['oẹ', 'ọe'],
    ['uỳ', 'ùy'], ['uý', 'úy'], ['uỷ', 'ủy'], ['uỹ', 'ũy'], ['uỵ', 'ụy']
  ];
  v_pair text[];
begin
  if p_text is null then
    return null;
  end if;
  v := normalize(p_text, NFC);
  v := lower(v collate pg_catalog.pg_c_utf8);
  v := translate(v, '’‘`´“”„', repeat(chr(39), 4) || '"""');
  if v_rubric ->> 'punctuation' = 'strict' then
    v := regexp_replace(v collate pg_catalog.pg_c_utf8, '[.!?…。？！]+$', '');
  else
    v := translate(v, v_punct, repeat(' ', char_length(v_punct)));
  end if;
  v := btrim(regexp_replace(v collate pg_catalog.pg_c_utf8, '[[:space:]]+', ' ', 'g'), ' ');

  if p_lang = 'en' and coalesce((v_rubric ->> 'expand_contractions')::boolean, true) then
    foreach v_pair slice 1 in array v_contractions loop
      v := regexp_replace(v collate pg_catalog.pg_c_utf8, '\y' || v_pair[1] || '\y', v_pair[2], 'g');
    end loop;
  elsif p_lang = 'vi' then
    foreach v_pair slice 1 in array v_vi_tones loop
      v := regexp_replace(v collate pg_catalog.pg_c_utf8, normalize(v_pair[1], NFC) || '(?![[:alpha:]])', normalize(v_pair[2], NFC), 'g');
    end loop;
  end if;

  return btrim(regexp_replace(v collate pg_catalog.pg_c_utf8, '[[:space:]]+', ' ', 'g'), ' ');
end;
$$;

-- NFD, drop combining marks, map đ/Đ to d (mirror of stripDiacritics).
create or replace function public.grading_strip_diacritics(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select normalize(
    translate(
      regexp_replace(
        normalize(p_text, NFD),
        '[' || chr(768) || '-' || chr(879) || chr(6832) || '-' || chr(6911) || chr(7616) || '-' || chr(7679)
          || chr(8400) || '-' || chr(8447) || chr(65056) || '-' || chr(65071) || ']',
        '', 'g'),
      'đĐ', 'dD'),
    NFC);
$$;

-- Grades one text answer against its accepted variants (plan steps 4.1–4.8).
-- Returns {verdict, error_tags, feedback_vi}.
create or replace function public.grading_text(p_text text, p_accepted jsonb, p_known_wrong jsonb, p_lang text, p_rubric jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_rubric jsonb := '{"punctuation":"ignore","diacritics":"strict","ko_spacing":"lenient","typo_tolerance":0,"expand_contractions":true}'::jsonb
    || coalesce(p_rubric, '{}'::jsonb);
  v_r text;
  v_accepted text[];
  v_a text;
  v_kw jsonb;
  v_rt text[];
  v_at text[];
  v_r_noart text[];
  v_diff integer;
  v_di integer;
  v_i integer;
  v_pairs constant text[] := array[['이에요', '예요'], ['으로', '로'], ['은', '는'], ['이', '가'], ['을', '를'], ['와', '과']];
  v_pair text[];
  v_d integer;
  v_from text;
  v_to text;
  v_pos integer;
  v_idx integer;
  v_end integer;
  v_r_ns text;
begin
  v_r := coalesce(public.grading_normalize(p_text, p_lang, v_rubric), '');
  if v_r = '' then
    return jsonb_build_object('verdict', 'incorrect', 'error_tags', '[]'::jsonb, 'feedback_vi', 'null'::jsonb);
  end if;
  select coalesce(array_agg(public.grading_normalize(t.a, p_lang, v_rubric) order by t.o), '{}'::text[])
    into v_accepted
    from jsonb_array_elements_text(case when jsonb_typeof(p_accepted) = 'array' then p_accepted else '[]'::jsonb end) with ordinality as t(a, o);

  -- 1. exact match after normalization
  if v_r = any(v_accepted) then
    return jsonb_build_object('verdict', 'correct', 'error_tags', '[]'::jsonb, 'feedback_vi', 'null'::jsonb);
  end if;

  -- 2. known wrong answers
  for v_kw in
    select k.value from jsonb_array_elements(case when jsonb_typeof(p_known_wrong) = 'array' then p_known_wrong else '[]'::jsonb end) with ordinality as k(value, o) order by k.o
  loop
    if v_r = public.grading_normalize(v_kw ->> 'answer', p_lang, v_rubric) then
      return jsonb_build_object('verdict', 'incorrect', 'error_tags', jsonb_build_array(v_kw -> 'error_tag'), 'feedback_vi', coalesce(v_kw -> 'feedback_vi', 'null'::jsonb));
    end if;
  end loop;

  if p_lang = 'en' then
    -- 3. only articles differ
    v_r_noart := array(select t.w from unnest(string_to_array(v_r, ' ')) with ordinality as t(w, o) where t.w not in ('a', 'an', 'the') order by t.o);
    foreach v_a in array v_accepted loop
      if array(select t.w from unnest(string_to_array(v_a, ' ')) with ordinality as t(w, o) where t.w not in ('a', 'an', 'the') order by t.o) = v_r_noart then
        return jsonb_build_object('verdict', 'incorrect', 'error_tags', '["article"]'::jsonb, 'feedback_vi', 'null'::jsonb);
      end if;
    end loop;

    -- 4. exactly one long token off by one edit
    if (v_rubric ->> 'typo_tolerance') = '1' then
      v_rt := string_to_array(v_r, ' ');
      foreach v_a in array v_accepted loop
        v_at := string_to_array(v_a, ' ');
        if cardinality(v_at) = cardinality(v_rt) then
          v_diff := 0;
          v_di := 0;
          for v_i in 1 .. cardinality(v_rt) loop
            if v_rt[v_i] <> v_at[v_i] then
              v_diff := v_diff + 1;
              v_di := v_i;
            end if;
          end loop;
          if v_diff = 1
             and char_length(v_rt[v_di]) >= 5 and char_length(v_at[v_di]) >= 5
             and v_rt[v_di] <> all (array['a', 'an', 'the', 'am', 'is', 'are'])
             and v_at[v_di] <> all (array['a', 'an', 'the', 'am', 'is', 'are'])
             and extensions.levenshtein(v_rt[v_di], v_at[v_di]) = 1 then
            return jsonb_build_object('verdict', 'almost', 'error_tags', '["typo"]'::jsonb, 'feedback_vi', 'null'::jsonb);
          end if;
        end if;
      end loop;
    end if;
  end if;

  if p_lang = 'ko' then
    v_r_ns := replace(v_r, ' ', '');
    -- 5. spacing only
    if v_rubric ->> 'ko_spacing' = 'lenient' then
      foreach v_a in array v_accepted loop
        if replace(v_a, ' ', '') = v_r_ns then
          return jsonb_build_object('verdict', 'almost', 'error_tags', '["spacing"]'::jsonb, 'feedback_vi', 'null'::jsonb);
        end if;
      end loop;
    end if;
    -- 6. one word-final particle swapped for its allomorph
    foreach v_a in array v_accepted loop
      foreach v_pair slice 1 in array v_pairs loop
        for v_d in 1 .. 2 loop
          v_from := v_pair[v_d];
          v_to := v_pair[3 - v_d];
          v_pos := 0;
          loop
            v_idx := strpos(substr(v_a, v_pos + 1), v_from);
            exit when v_idx = 0;
            v_pos := v_pos + v_idx;
            v_end := v_pos + char_length(v_from);
            if v_end > char_length(v_a) or substr(v_a, v_end, 1) = ' ' then
              if replace(substr(v_a, 1, v_pos - 1) || v_to || substr(v_a, v_end), ' ', '') = v_r_ns then
                return jsonb_build_object('verdict', 'incorrect', 'error_tags', '["particle_allomorph"]'::jsonb, 'feedback_vi', 'null'::jsonb);
              end if;
            end if;
          end loop;
        end loop;
      end loop;
    end loop;
  end if;

  -- 7. Vietnamese without diacritics
  if p_lang = 'vi' and v_rubric ->> 'diacritics' = 'lenient' then
    foreach v_a in array v_accepted loop
      if public.grading_strip_diacritics(v_a) = public.grading_strip_diacritics(v_r) then
        return jsonb_build_object('verdict', 'almost', 'error_tags', '["missing_diacritics"]'::jsonb, 'feedback_vi', 'null'::jsonb);
      end if;
    end loop;
  end if;

  return jsonb_build_object('verdict', 'incorrect', 'error_tags', '[]'::jsonb, 'feedback_vi', 'null'::jsonb);
end;
$$;

-- grade(type, answer, rubric, known_wrong, lang, response) -> {verdict, score, error_tags, feedback_vi}.
create or replace function public.grade_exercise(p_type text, p_answer jsonb, p_rubric jsonb, p_known_wrong jsonb, p_lang text, p_response jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_verdict text := 'incorrect';
  v_tags jsonb := '[]'::jsonb;
  v_feedback jsonb := 'null'::jsonb;
  v_g jsonb;
  v_blank text;
  v_tag jsonb;
  v_rank integer;
  v_worst integer;
begin
  if p_response is null or jsonb_typeof(p_response) <> 'object' or p_response ? 'give_up' then
    v_verdict := 'incorrect';
  elsif p_type in ('mcq', 'listen') then
    if p_response ->> 'option_id' = p_answer ->> 'correct_option_id' then
      v_verdict := 'correct';
    end if;
  elsif p_type = 'word_bank' then
    if jsonb_typeof(p_answer -> 'orders') = 'array'
       and exists (select 1 from jsonb_array_elements(p_answer -> 'orders') as o(ids) where o.ids = coalesce(p_response -> 'token_ids', '[]'::jsonb)) then
      v_verdict := 'correct';
    end if;
  elsif p_type = 'translate' then
    v_g := public.grading_text(p_response ->> 'text', p_answer -> 'accepted', p_known_wrong, p_lang, p_rubric);
    v_verdict := v_g ->> 'verdict';
    v_tags := v_g -> 'error_tags';
    v_feedback := v_g -> 'feedback_vi';
  elsif p_type = 'fill_blank' and jsonb_typeof(p_answer -> 'blanks') = 'object' and p_answer -> 'blanks' <> '{}'::jsonb then
    -- Blank order is jsonb key order. Overall verdict is the worst blank (2 correct, 1 almost, 0 incorrect).
    v_worst := 2;
    for v_blank in select k from jsonb_object_keys(p_answer -> 'blanks') as k loop
      v_g := public.grading_text(
        case when jsonb_typeof(p_response -> 'blanks') = 'object' then p_response -> 'blanks' ->> v_blank end,
        p_answer -> 'blanks' -> v_blank, p_known_wrong, p_lang, p_rubric);
      v_rank := case v_g ->> 'verdict' when 'correct' then 2 when 'almost' then 1 else 0 end;
      v_worst := least(v_worst, v_rank);
      for v_tag in select t.value from jsonb_array_elements(v_g -> 'error_tags') with ordinality as t(value, o) order by t.o loop
        if not v_tags @> jsonb_build_array(v_tag) then
          v_tags := v_tags || jsonb_build_array(v_tag);
        end if;
      end loop;
      if v_feedback = 'null'::jsonb then
        v_feedback := coalesce(v_g -> 'feedback_vi', 'null'::jsonb);
      end if;
    end loop;
    v_verdict := case v_worst when 2 then 'correct' when 1 then 'almost' else 'incorrect' end;
  end if;

  return jsonb_build_object(
    'verdict', v_verdict,
    'score', case v_verdict when 'correct' then 1 when 'almost' then 0.8 else 0 end,
    'error_tags', v_tags,
    'feedback_vi', v_feedback
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Lesson runs and attempts
-- ---------------------------------------------------------------------------
create table public.lesson_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  content_version integer not null check (content_version >= 1),
  cursor smallint not null default 0 check (cursor >= 0),
  -- Exercise ids in play order; end-of-lesson re-checks are appended, so an id may appear twice.
  queue uuid[] not null check (coalesce(array_ndims(queue), 1) = 1),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  next_review_at timestamptz,
  summary_json jsonb,
  constraint lesson_runs_completed_shape check ((status = 'completed') = (completed_at is not null and summary_json is not null))
);

create unique index lesson_runs_one_open on public.lesson_runs (user_id, learning_path_id, lesson_id) where status = 'in_progress';
create index lesson_runs_path_lesson_idx on public.lesson_runs (learning_path_id, lesson_id);
create index lesson_runs_user_id_idx on public.lesson_runs (user_id);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  lesson_run_id uuid not null references public.lesson_runs (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  exercise_version integer not null check (exercise_version >= 1),
  content_version integer not null check (content_version >= 1),
  learning_item_id uuid references public.learning_items (id) on delete restrict,
  idempotency_key uuid not null,
  payload_hash text not null,
  response_json jsonb not null,
  normalized_response text,
  verdict text not null check (verdict in ('correct', 'almost', 'incorrect')),
  is_correct boolean not null,
  score numeric(3, 2) not null check (score between 0 and 1),
  error_tags text[] not null default '{}',
  attempt_no smallint not null check (attempt_no >= 1),
  revealed boolean not null,
  after_reveal boolean not null,
  gave_up boolean not null,
  feedback_json jsonb not null,
  stage text not null check (stage in ('recognition', 'recall', 'application')),
  exercise_type text not null check (exercise_type in ('mcq', 'fill_blank', 'word_bank', 'translate', 'listen')),
  confidence smallint check (confidence between 1 and 3),
  response_ms integer not null check (response_ms between 0 and 600000),
  hint_count smallint not null check (hint_count between 0 and 3),
  modality text check (modality in ('audio', 'text_fallback')),
  client_at timestamptz,
  created_at timestamptz not null default now(),
  synced_late boolean not null default false,
  constraint attempts_is_correct_matches_verdict check (is_correct = (verdict <> 'incorrect')),
  unique (user_id, idempotency_key)
);

create index attempts_user_path_created_idx on public.attempts (user_id, learning_path_id, created_at desc);
create index attempts_user_created_idx on public.attempts (user_id, created_at desc);
create index attempts_lesson_run_idx on public.attempts (lesson_run_id, exercise_id);

alter table public.lesson_runs enable row level security;
alter table public.attempts enable row level security;

create policy "lesson runs: read own" on public.lesson_runs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "attempts: read own" on public.attempts
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.lesson_runs, public.attempts from anon, authenticated;
grant select on public.lesson_runs, public.attempts to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- The published lesson for a path the user owns, in the path's language.
create or replace function public.lesson_for_path(p_user uuid, p_lesson uuid, p_path uuid)
returns public.lessons
language plpgsql
stable
set search_path = ''
as $$
declare
  v_path_language text;
  v_lesson public.lessons;
begin
  select p.language_code into v_path_language from public.learning_paths p where p.id = p_path and p.user_id = p_user;
  if not found then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;
  select l.* into v_lesson
  from public.lessons l
  join public.units u on u.id = l.unit_id
  join public.programs pr on pr.id = u.program_id
  where l.id = p_lesson and l.status = 'published' and u.status = 'published' and pr.status = 'published';
  if not found then
    raise exception using errcode = 'P0001', message = 'lesson_not_found';
  end if;
  if v_lesson.language_code <> v_path_language then
    raise exception using errcode = 'P0001', message = 'lesson_not_in_path';
  end if;
  return v_lesson;
end;
$$;

-- lessonRunSchema shape.
create or replace function public.lesson_run_json(p_run public.lesson_runs)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_run.id,
    'status', p_run.status,
    'cursor', p_run.cursor,
    'queue', to_jsonb(p_run.queue),
    'next_review_at', p_run.next_review_at,
    'summary', p_run.summary_json
  );
$$;

-- Shape of a learner response for an exercise type (or the universal {"give_up": true}).
create or replace function public.lesson_response_valid(p_type text, p_response jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_keys text[];
  v_id_re constant text := '^[a-z0-9][a-z0-9_-]{0,39}$';
begin
  if p_response is null or jsonb_typeof(p_response) <> 'object' then
    return false;
  end if;
  if p_response = '{"give_up": true}'::jsonb then
    return true;
  end if;
  v_keys := array(select k from jsonb_object_keys(p_response) as k order by k);
  if p_type in ('mcq', 'listen') then
    return v_keys = array['option_id']
      and jsonb_typeof(p_response -> 'option_id') = 'string'
      and (p_response ->> 'option_id') ~ v_id_re;
  elsif p_type = 'translate' then
    return v_keys = array['text']
      and jsonb_typeof(p_response -> 'text') = 'string'
      and char_length(p_response ->> 'text') <= 300;
  elsif p_type = 'word_bank' then
    if v_keys <> array['token_ids'] or jsonb_typeof(p_response -> 'token_ids') <> 'array' then
      return false;
    end if;
    if jsonb_array_length(p_response -> 'token_ids') not between 1 and 16 then
      return false;
    end if;
    return not exists (
      select 1 from jsonb_array_elements(p_response -> 'token_ids') as t(v)
      where jsonb_typeof(t.v) <> 'string' or not ((t.v #>> '{}') ~ v_id_re)
    );
  elsif p_type = 'fill_blank' then
    if v_keys <> array['blanks'] or jsonb_typeof(p_response -> 'blanks') <> 'object' then
      return false;
    end if;
    return not exists (
      select 1 from jsonb_each(p_response -> 'blanks') as b(k, v)
      where not (b.k ~ v_id_re) or jsonb_typeof(b.v) <> 'string' or char_length(b.v #>> '{}') > 300
    );
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lesson RPCs
-- ---------------------------------------------------------------------------

-- lessonPayloadSchema: lesson, items, public exercises (never any answer field), run and its attempts.
create or replace function public.get_lesson(p_lesson_id uuid, p_path_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_lesson public.lessons;
  v_run public.lesson_runs;
  v_lesson_json jsonb;
  v_items jsonb;
  v_exercises jsonb;
  v_attempts jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_lesson := public.lesson_for_path(v_uid, p_lesson_id, p_path_id);

  select jsonb_build_object(
      'id', v_lesson.id,
      'key', v_lesson.key,
      'language_code', v_lesson.language_code,
      'level_code', v_lesson.level_code,
      'title', v_lesson.title,
      'objectives', v_lesson.objectives,
      'body', v_lesson.body,
      'estimated_minutes', v_lesson.estimated_minutes,
      'skills', to_jsonb(v_lesson.skills),
      'content_version', v_lesson.content_version,
      'is_demo', v_lesson.is_demo,
      'unit_title', u.title,
      'program_title', pr.title
    )
    into v_lesson_json
  from public.units u
  join public.programs pr on pr.id = u.program_id
  where u.id = v_lesson.unit_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id,
      'key', i.key,
      'item_type', i.item_type,
      'front', i.front,
      'back', i.back,
      'audio_path', i.audio_path,
      'role', li.role,
      'position', li.position
    ) order by li.position, i.key), '[]'::jsonb)
    into v_items
  from public.lesson_items li
  join public.learning_items i on i.id = li.item_id
  where li.lesson_id = v_lesson.id and i.status = 'published';

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'key', e.key,
      'version', e.version,
      'order_index', e.order_index,
      'type', e.exercise_type,
      'stage', e.stage,
      'answer_lang', e.answer_lang,
      'item_id', e.item_id,
      'difficulty', e.difficulty,
      'prompt', e.prompt
    ) order by array_position(array['recognition', 'recall', 'application']::text[], e.stage), e.order_index), '[]'::jsonb)
    into v_exercises
  from public.exercises e
  where e.lesson_id = v_lesson.id and e.status = 'published';

  -- The open run, else the latest completed one.
  select r.* into v_run
  from public.lesson_runs r
  where r.user_id = v_uid and r.learning_path_id = p_path_id and r.lesson_id = v_lesson.id
  order by (r.status = 'in_progress') desc, r.completed_at desc nulls last, r.started_at desc
  limit 1;

  if v_run.id is not null then
    select coalesce(jsonb_agg(a.feedback_json || jsonb_build_object(
        'attempt_id', a.id,
        'exercise_id', a.exercise_id,
        'after_reveal', a.after_reveal,
        'created_at', a.created_at
      ) order by a.created_at, a.attempt_no), '[]'::jsonb)
      into v_attempts
    from public.attempts a
    where a.lesson_run_id = v_run.id;
  end if;

  return jsonb_build_object(
    'lesson', v_lesson_json,
    'items', v_items,
    'exercises', v_exercises,
    'run', case when v_run.id is null then 'null'::jsonb else public.lesson_run_json(v_run) end,
    'attempts', v_attempts
  );
end;
$$;

-- Returns the open run of this lesson on this path, or starts one.
create or replace function public.start_lesson(p_lesson_id uuid, p_path_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_lesson public.lessons;
  v_run public.lesson_runs;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  v_lesson := public.lesson_for_path(v_uid, p_lesson_id, p_path_id);

  select r.* into v_run
  from public.lesson_runs r
  where r.user_id = v_uid and r.learning_path_id = p_path_id and r.lesson_id = v_lesson.id and r.status = 'in_progress';
  if found then
    return public.lesson_run_json(v_run);
  end if;

  insert into public.lesson_runs (user_id, learning_path_id, lesson_id, content_version, queue)
  values (
    v_uid, p_path_id, v_lesson.id, v_lesson.content_version,
    coalesce((
      select array_agg(e.id order by array_position(array['recognition', 'recall', 'application']::text[], e.stage), e.order_index)
      from public.exercises e
      where e.lesson_id = v_lesson.id and e.status = 'published'
    ), '{}'::uuid[])
  )
  returning * into v_run;
  return public.lesson_run_json(v_run);
end;
$$;

create or replace function public.save_lesson_cursor(p_run_id uuid, p_cursor smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select r.status into v_status from public.lesson_runs r where r.id = p_run_id and r.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'run_not_found';
  end if;
  if v_status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'run_not_active';
  end if;
  update public.lesson_runs set cursor = greatest(cursor, coalesce(p_cursor, 0::smallint)) where id = p_run_id;
end;
$$;

-- Grades one answer. Reveal rules (spec §5.5): correct/almost or a second wrong answer or give-up reveal
-- the answer; an exercise revealed after a wrong answer is appended to the queue for a re-check.
create or replace function public.submit_exercise(
  p_run_id uuid, p_exercise_id uuid, p_exercise_version integer, p_idempotency_key uuid, p_response jsonb,
  p_confidence smallint, p_response_ms integer, p_hint_count smallint, p_client_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_prev public.attempts;
  v_run public.lesson_runs;
  v_ex public.exercises;
  v_key content_private.exercise_keys;
  v_grade jsonb;
  v_verdict text;
  v_gave_up boolean;
  v_attempt_no integer;
  v_after_reveal boolean;
  v_revealed boolean;
  v_final boolean;
  v_requeued boolean;
  v_result jsonb;
  v_attempt_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'invalid_response';
  end if;

  -- Replays return the stored result; the same key with another payload is a conflict.
  v_hash := md5(coalesce(p_exercise_id::text, '') || coalesce(p_response::text, ''));
  select a.* into v_prev from public.attempts a where a.user_id = v_uid and a.idempotency_key = p_idempotency_key;
  if found then
    if v_prev.payload_hash = v_hash then
      return v_prev.feedback_json || jsonb_build_object('attempt_id', v_prev.id, 'replayed', true);
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;

  if (select count(*) from public.attempts a where a.user_id = v_uid and a.created_at > now() - interval '10 seconds') >= 30 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  select r.* into v_run from public.lesson_runs r where r.id = p_run_id and r.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'run_not_found';
  end if;
  if v_run.status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'run_not_active';
  end if;

  select e.* into v_ex from public.exercises e where e.id = p_exercise_id and e.lesson_id = v_run.lesson_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'exercise_not_in_lesson';
  end if;

  select k.* into v_key from content_private.exercise_keys k where k.exercise_id = p_exercise_id and k.version = p_exercise_version;
  if not found then
    raise exception using errcode = 'P0001', message = 'exercise_version_mismatch';
  end if;

  if octet_length(p_response::text) > 2048
     or not public.lesson_response_valid(v_ex.exercise_type, p_response)
     or (p_confidence is not null and p_confidence not between 1 and 3) then
    raise exception using errcode = 'P0001', message = 'invalid_response';
  end if;

  v_grade := public.grade_exercise(v_ex.exercise_type, v_key.answer_key, v_key.rubric, v_key.known_wrong, v_ex.answer_lang, p_response);
  v_verdict := v_grade ->> 'verdict';
  v_gave_up := p_response = '{"give_up": true}'::jsonb;

  select count(*) + 1, coalesce(bool_or(a.revealed), false)
    into v_attempt_no, v_after_reveal
  from public.attempts a
  where a.lesson_run_id = v_run.id and a.exercise_id = p_exercise_id;

  v_revealed := v_verdict <> 'incorrect' or v_attempt_no >= 2 or v_gave_up;
  v_final := v_verdict <> 'incorrect' or v_revealed;
  v_requeued := not v_after_reveal and v_verdict = 'incorrect' and v_revealed;

  v_result := jsonb_build_object(
    'attempt_no', v_attempt_no,
    'verdict', v_verdict,
    'is_correct', v_verdict <> 'incorrect',
    'score', v_grade -> 'score',
    'error_tags', v_grade -> 'error_tags',
    'feedback_vi', v_grade -> 'feedback_vi',
    'revealed', v_revealed,
    'display_answer', case when v_revealed then to_jsonb(v_key.display_answer) else 'null'::jsonb end,
    'explanation', case when v_revealed then v_key.explanation else 'null'::jsonb end,
    'final', v_final,
    'requeued', v_requeued
  );

  begin
    insert into public.attempts (
      user_id, learning_path_id, lesson_run_id, lesson_id, exercise_id, exercise_version, content_version, learning_item_id,
      idempotency_key, payload_hash, response_json, normalized_response, verdict, is_correct, score, error_tags,
      attempt_no, revealed, after_reveal, gave_up, feedback_json, stage, exercise_type, confidence, response_ms, hint_count,
      modality, client_at, created_at, synced_late
    ) values (
      v_uid, v_run.learning_path_id, v_run.id, v_run.lesson_id, v_ex.id, p_exercise_version, v_run.content_version, v_ex.item_id,
      p_idempotency_key, v_hash, p_response,
      case when v_ex.exercise_type = 'translate' then public.grading_normalize(p_response ->> 'text', v_ex.answer_lang, v_key.rubric) end,
      v_verdict, v_verdict <> 'incorrect', (v_grade ->> 'score')::numeric,
      array(select jsonb_array_elements_text(v_grade -> 'error_tags')),
      v_attempt_no, v_revealed, v_after_reveal, v_gave_up, v_result, v_ex.stage, v_ex.exercise_type, p_confidence,
      greatest(0, least(600000, coalesce(p_response_ms, 0))),
      greatest(0, least(3, coalesce(p_hint_count, 0)))::smallint,
      case when v_ex.exercise_type = 'listen' then case when v_ex.prompt ->> 'audio_asset_id' is null then 'text_fallback' else 'audio' end end,
      p_client_at, v_now, p_client_at is not null and v_now - p_client_at > interval '60 seconds'
    )
    returning id into v_attempt_id;
  exception when unique_violation then
    -- A concurrent call with the same key won the race.
    select a.* into v_prev from public.attempts a where a.user_id = v_uid and a.idempotency_key = p_idempotency_key;
    if found and v_prev.payload_hash = v_hash then
      return v_prev.feedback_json || jsonb_build_object('attempt_id', v_prev.id, 'replayed', true);
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end;

  if v_requeued then
    update public.lesson_runs set queue = queue || p_exercise_id where id = v_run.id;
  end if;

  return v_result || jsonb_build_object('attempt_id', v_attempt_id, 'replayed', false);
end;
$$;

-- Closes the run once every exercise is resolved and every re-check is answered; idempotent.
create or replace function public.complete_lesson(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_run public.lesson_runs;
  v_accuracy jsonb;
  v_almost integer;
  v_confident_wrong integer;
  v_unsure_right integer;
  v_tz text;
  v_next timestamptz;
  v_now timestamptz := now();
  v_summary jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select r.* into v_run from public.lesson_runs r where r.id = p_run_id and r.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'run_not_found';
  end if;
  if v_run.status = 'completed' then
    return v_run.summary_json;
  end if;

  if exists (
       select 1 from (select distinct q.e from unnest(v_run.queue) as q(e)) as d
       where not exists (
         select 1 from public.attempts a
         where a.lesson_run_id = v_run.id and a.exercise_id = d.e and (a.verdict <> 'incorrect' or a.revealed)
       )
     )
     or exists (
       select 1 from public.attempts a
       where a.lesson_run_id = v_run.id and a.verdict = 'incorrect' and a.revealed and not a.after_reveal
         and not exists (
           select 1 from public.attempts b
           where b.lesson_run_id = v_run.id and b.exercise_id = a.exercise_id and b.after_reveal
         )
     ) then
    raise exception using errcode = 'P0001', message = 'attempts_incomplete';
  end if;

  -- Accuracy over first attempts per stage (share of correct or almost; null when the stage has none).
  select jsonb_build_object(
      'recognition', round(avg(case when a.is_correct then 1 else 0 end) filter (where a.stage = 'recognition'), 4),
      'recall', round(avg(case when a.is_correct then 1 else 0 end) filter (where a.stage = 'recall'), 4),
      'application', round(avg(case when a.is_correct then 1 else 0 end) filter (where a.stage = 'application'), 4)
    )
    into v_accuracy
  from public.attempts a
  where a.lesson_run_id = v_run.id and a.attempt_no = 1;

  -- Signals count every attempt made before the answer was revealed.
  select count(*) filter (where a.verdict = 'almost'),
         count(*) filter (where a.confidence = 3 and a.verdict = 'incorrect'),
         count(*) filter (where a.confidence = 1 and a.is_correct)
    into v_almost, v_confident_wrong, v_unsure_right
  from public.attempts a
  where a.lesson_run_id = v_run.id and not a.after_reveal;

  select p.timezone into v_tz from public.profiles p where p.id = v_uid;
  v_next := ((public.learning_user_today(v_uid) + 1)::timestamp) at time zone coalesce(v_tz, 'Asia/Ho_Chi_Minh');

  v_summary := jsonb_build_object(
    'accuracy_by_stage', v_accuracy,
    'almost_count', v_almost,
    'confident_wrong', v_confident_wrong,
    'unsure_right', v_unsure_right,
    'next_review_at', v_next,
    'completed_at', v_now
  );

  update public.lesson_runs
  set status = 'completed', completed_at = v_now, next_review_at = v_next, summary_json = v_summary
  where id = v_run.id;
  return v_summary;
end;
$$;

-- Published lessons of the path's programs (spec §3.5). Security invoker: RLS on learning_paths makes
-- another user's path return no rows, and RLS on the content tables hides unpublished rows.
create or replace function public.path_lessons(p_path_id uuid)
returns table (
  lesson_id uuid,
  lesson_key text,
  program_id uuid,
  program_title jsonb,
  unit_id uuid,
  unit_title jsonb,
  unit_order integer,
  lesson_order integer,
  title jsonb,
  level_code text,
  estimated_minutes integer,
  is_demo boolean,
  prerequisite_ids uuid[],
  prerequisites_met boolean,
  run_status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.id,
    l.key::text,
    pr.id,
    pr.title::jsonb,
    u.id,
    u.title::jsonb,
    u.order_index::integer,
    l.order_index::integer,
    l.title::jsonb,
    l.level_code::text,
    l.estimated_minutes::integer,
    l.is_demo,
    coalesce((
      select array_agg(lp.prerequisite_lesson_id order by lp.prerequisite_lesson_id)
      from public.lesson_prerequisites lp
      where lp.lesson_id = l.id
    ), '{}'::uuid[]),
    not exists (
      select 1
      from public.lesson_prerequisites lp
      where lp.lesson_id = l.id
        and not exists (
          select 1 from public.lesson_runs r
          where r.lesson_id = lp.prerequisite_lesson_id and r.learning_path_id = p.id and r.user_id = p.user_id and r.status = 'completed'
        )
    ),
    case
      when exists (
        select 1 from public.lesson_runs r
        where r.lesson_id = l.id and r.learning_path_id = p.id and r.user_id = p.user_id and r.status = 'in_progress'
      ) then 'in_progress'
      when exists (
        select 1 from public.lesson_runs r
        where r.lesson_id = l.id and r.learning_path_id = p.id and r.user_id = p.user_id and r.status = 'completed'
      ) then 'completed'
      else 'not_started'
    end
  from public.learning_paths p
  join public.level_reference_hours cur on cur.language_code = p.language_code and cur.level_code = p.current_level
  join public.level_reference_hours tgt on tgt.language_code = p.language_code and tgt.level_code = p.target_level
  join public.programs pr
    on pr.language_code = p.language_code
   and pr.status = 'published'
   and (pr.kind = 'core' or p.goal_type = any (pr.goal_types))
  join public.level_reference_hours pf on pf.language_code = pr.language_code and pf.level_code = pr.level_from
  join public.level_reference_hours pt on pt.language_code = pr.language_code and pt.level_code = pr.level_to
  join public.units u on u.program_id = pr.id and u.status = 'published'
  join public.lessons l on l.unit_id = u.id and l.status = 'published'
  where p.id = p_path_id
    and p.user_id = (select auth.uid())
    and pf.ordinal <= tgt.ordinal
    and pt.ordinal >= cur.ordinal
  order by pr.order_index, pr.key, u.order_index, l.order_index, l.key;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default.
-- ---------------------------------------------------------------------------
revoke all on function public.grading_normalize(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.grading_strip_diacritics(text) from public, anon, authenticated;
revoke all on function public.grading_text(text, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.grade_exercise(text, jsonb, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.lesson_for_path(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.lesson_run_json(public.lesson_runs) from public, anon, authenticated;
revoke all on function public.lesson_response_valid(text, jsonb) from public, anon, authenticated;

revoke all on function public.get_lesson(uuid, uuid) from public, anon;
revoke all on function public.start_lesson(uuid, uuid) from public, anon;
revoke all on function public.save_lesson_cursor(uuid, smallint) from public, anon;
revoke all on function public.submit_exercise(uuid, uuid, integer, uuid, jsonb, smallint, integer, smallint, timestamptz) from public, anon;
revoke all on function public.complete_lesson(uuid) from public, anon;
revoke all on function public.path_lessons(uuid) from public, anon;
grant execute on function public.get_lesson(uuid, uuid) to authenticated;
grant execute on function public.start_lesson(uuid, uuid) to authenticated;
grant execute on function public.save_lesson_cursor(uuid, smallint) to authenticated;
grant execute on function public.submit_exercise(uuid, uuid, integer, uuid, jsonb, smallint, integer, smallint, timestamptz) to authenticated;
grant execute on function public.complete_lesson(uuid) to authenticated;
grant execute on function public.path_lessons(uuid) to authenticated;
